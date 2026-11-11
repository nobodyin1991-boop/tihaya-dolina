// The caravan run: launch, per-frame tick with directives for the engine, reports from the engine,
// arrival and failure. Pure. Public API is re-exported from sim/caravan.js.
//
// Protocol (see also the header of sim/caravan.js):
//   engine → caravanTick(state, dt, ctx) every frame → array of directives
//   engine → caravanReport(state, report) whenever something happens to the convoy
import { ok, fail } from './state.js';
import { emit } from '../core/events.js';
import { seedFrom } from '../core/noise.js';
import { legLength, legPoint, cityAt } from '../world/terrain.js';
import { itemName } from '../data/items.js';
import { countItem, removeItem, hasItems, removeItems } from './inventory.js';
import { grantXp, addCoins, spendCoins } from './player.js';
import { addRep } from './reputation.js';
import {
  WAGON_SPEED, FOLLOW_RADIUS, PROVISIONS_PER_GUARD, GUARD_FOOD, GUILD_SALE_BONUS, GUILD_RUN,
} from '../data/caravans.js';
import {
  RING_COMPLETE, notify, currentLeg, legDef, originCity, destCity, isGuildStage, manifestLines, manifestProgress,
  contractFee, wagonMaxHp, hasUpgrade, upgradeDef, wagonSpeedFactor, sellPriceAt, raiseCityProsperity, planEvents,
} from './caravan-core.js';

const RAIN_SPEED = 0.75;
const NIGHT_FACTOR = 1.25;
const FAIL_CARGO_KEEP = 0.75;
const FAIL_BONUS_KEEP = 0.5;
const FIELD_REPAIR_FRACTION = 0.4;
const TOWN_REPAIR_COIN_PER_HP = 0.3;
const PERFECT_RUN_BONUS = 0.1;
const TOWED_HP_FRACTION = 0.3;

const REACTIVE_BANTER = {
  lag: 'Эй! Без тебя не тронусь — мне своя шкура дорога.',
  cleared: ['Отбились. Трогаем, пока новые не набежали.', 'Живы? Живы. Но, пошла!', 'Груз цел — и ладно. Поехали.'],
  night: 'Темнеет. Ночью они смелее — гляди в оба.',
  rain: 'Развезло. По такой грязи быстро не поедешь.',
  hurt: 'Ещё пара таких ударов — и повезём дрова вместо телеги!',
};

// ───────────────────────── launch ─────────────────────────

function feedGuards(state) {
  const guards = state.caravan.guards.filter(guard => guard.alive);
  let need = guards.length * PROVISIONS_PER_GUARD;
  for (const foodId of GUARD_FOOD) {
    if (need <= 0) break;
    const take = Math.min(need, countItem(state, foodId));
    if (take > 0 && removeItem(state, foodId, take)) need -= take;
  }
  return need <= 0;
}

function checkLaunch(state) {
  const caravan = state.caravan;
  if (caravan.run) return 'Караван уже в пути';
  const leg = currentLeg(state);
  if (leg === null) return 'Сначала выбери гильдейский подряд';
  if (!manifestProgress(state).full) return 'Ведомость не закрыта — интендант не выпустит телегу';
  if (caravan.wagon.hp <= 0) return 'Телега разбита — сперва почини её у конюха';
  const origin = originCity(leg);
  const here = cityAt(state.player.x, state.player.z, 60);
  if (!here || here.key !== origin.key) return `Караван ждёт у ворот города ${origin.name}`;
  if (caravan.towDebt > state.player.coins) return `Сначала расплатись за буксировку: ${caravan.towDebt} монет`;
  return null;
}

/**
 * Start the run. Requires a full manifest and the player in the origin city.
 * @returns ok({leg, length, events:[{id,title,s}]}) | fail
 */
export function launchCaravan(state) {
  const problem = checkLaunch(state);
  if (problem) return fail(problem);
  const caravan = state.caravan;
  const leg = currentLeg(state);
  if (caravan.towDebt > 0) {
    spendCoins(state, caravan.towDebt);
    caravan.towDebt = 0;
  }
  const guild = isGuildStage(state);
  const tier = guild ? caravan.guildTier : 0;
  const day = state.time?.day || 1;
  const seed = seedFrom(`run:${leg}:${caravan.stats.runs}:${day}`);
  const cargoTotal = manifestProgress(state).total;
  const fed = feedGuards(state);
  if (!fed) {
    for (const guard of caravan.guards) guard.level = Math.max(1, guard.level - 2);
    emit('toast', { text: 'Охране не хватило пайка. Голодный боец — полбойца.', kind: 'warn' });
  }
  caravan.stats.runs += 1;
  caravan.run = {
    leg, guild, tier, seed,
    s: 0, length: legLength(leg),
    events: planEvents(state, leg, seed, { guild, tier }),
    active: null,
    cargoTotal, cargoLeft: cargoTotal, stolen: 0,
    guardsLost: 0, fed,
    banterIndex: 0, lagWarned: false, nightWarned: false, rainWarned: false, hurtWarned: false,
    startedDay: day,
    revealed: guild || !!state.flags?.[`scout:leg${leg}`],
  };
  caravan.outbox = [];
  notify(state, 'caravan:launched', { leg, guild });
  emit('toast', { text: `Караван вышел: ${originCity(leg).name} → ${destCity(leg).name}`, kind: 'good' });
  return ok({ leg, length: caravan.run.length, events: caravan.run.events.map(event => ({ id: event.id, title: event.title, s: event.s })) });
}

/** After loading a save mid-run: make the tick send the active spawn/obstacle directive again. */
export function caravanResume(state) {
  const active = state.caravan.run?.active;
  if (active) active.issued = false;
}

// ───────────────────────── tick ─────────────────────────

function nightScale(state) {
  if (!hasUpgrade(state, 'lanterns')) return { main: NIGHT_FACTOR, extra: 1 };
  return { main: 1 + (NIGHT_FACTOR - 1) * upgradeDef('lanterns').nightFactor, extra: upgradeDef('lanterns').nightFactor };
}

function scaledGroups(groups, factor) {
  const out = [];
  for (const group of groups) {
    const count = group.role === 'boss' ? group.count : Math.round(group.count * factor);
    if (count > 0) out.push({ ...group, count });
  }
  return out;
}

function spawnDirective(state, event, step, night) {
  const run = state.caravan.run;
  let groups = step.groups.map(group => ({ ...group }));
  if (night) {
    const scale = nightScale(state);
    groups = scaledGroups(groups, scale.main).concat(scaledGroups(step.nightExtra, scale.extra));
  }
  const point = legPoint(run.leg, event.s);
  const directive = {
    type: 'spawn', eventId: event.id, wave: event.stepIndex, title: event.title,
    groups, s: event.s, x: point.x, z: point.z, forewarned: run.revealed,
  };
  if (step.toll) directive.toll = { ...step.toll };
  if (event.boss) directive.boss = event.boss;
  return directive;
}

function obstacleDirective(state, event, step) {
  const run = state.caravan.run;
  const obstacle = step.obstacle;
  const point = legPoint(run.leg, event.s);
  let quick = 1;
  if (hasUpgrade(state, 'ironAxles') && obstacle.kind !== 'wheel-break' && obstacle.kind !== 'broken-bridge') {
    quick = upgradeDef('ironAxles').mudFactor;
  }
  const useSpare = !!obstacle.wagonSpare && hasUpgrade(state, 'spareWheel');
  const needs = useSpare ? null : (obstacle.needs || null);
  const fast = Math.round(obstacle.workSeconds * quick);
  const slow = Math.round((obstacle.slowSeconds ?? obstacle.workSeconds) * quick);
  run.active.useSpare = useSpare;
  return {
    type: 'obstacle', eventId: event.id, kind: obstacle.kind, s: event.s, x: point.x, z: point.z,
    needs, workSeconds: fast, slowSeconds: useSpare || !needs ? fast : slow, text: obstacle.text,
  };
}

function issueActive(state, ctx, out) {
  const run = state.caravan.run;
  const event = run.events[run.active.eventIndex];
  const step = event.steps[event.stepIndex];
  run.active.issued = true;
  run.active.kind = step.type;
  if (step.type === 'spawn') out.push(spawnDirective(state, event, step, !!ctx.night));
  else out.push(obstacleDirective(state, event, step));
}

function nextEventIndex(run) {
  return run.events.findIndex(event => !event.done);
}

function pushBanter(out, text) {
  out.push({ type: 'banter', text });
}

function routeBanter(state, out) {
  const run = state.caravan.run;
  const lines = legDef(run.leg).banter;
  const threshold = (run.banterIndex + 0.5) / lines.length;
  if (run.banterIndex < lines.length && run.s / run.length >= threshold) {
    pushBanter(out, lines[run.banterIndex]);
    run.banterIndex += 1;
  }
}

function moodBanter(state, ctx, out) {
  const run = state.caravan.run;
  if (ctx.night && !run.nightWarned) {
    run.nightWarned = true;
    pushBanter(out, REACTIVE_BANTER.night);
  }
  if (ctx.raining && !run.rainWarned) {
    run.rainWarned = true;
    pushBanter(out, REACTIVE_BANTER.rain);
  }
}

function advanceWagon(state, dt, ctx, out) {
  const run = state.caravan.run;
  const point = legPoint(run.leg, run.s);
  const distance = Math.hypot((ctx.playerX ?? point.x) - point.x, (ctx.playerZ ?? point.z) - point.z);
  if (distance > FOLLOW_RADIUS) {
    if (!run.lagWarned) {
      run.lagWarned = true;
      pushBanter(out, REACTIVE_BANTER.lag);
    }
    return;
  }
  run.lagWarned = false;
  if ((ctx.enemiesAlive || 0) > 0) return;
  const speed = WAGON_SPEED * wagonSpeedFactor(state) * (ctx.raining ? RAIN_SPEED : 1);
  let target = run.s + speed * dt;
  const index = nextEventIndex(run);
  if (index >= 0 && target >= run.events[index].s) {
    target = Math.max(run.s, run.events[index].s);
    run.active = { eventIndex: index, issued: false, kind: null };
  }
  run.s = Math.min(target, run.length);
  routeBanter(state, out);
  moodBanter(state, ctx, out);
}

/**
 * Advance the run by `dt` seconds.
 * @param ctx {playerX, playerZ, enemiesAlive, night, raining}
 * @returns {Array} directives: spawn | obstacle | stand-down | banter | arrived | failed (see sim/caravan.js header)
 */
export function caravanTick(state, dt, ctx = {}) {
  const caravan = state.caravan;
  const out = caravan.outbox.splice(0);
  const run = caravan.run;
  if (!run) return out;
  if (run.active && !run.active.issued) issueActive(state, ctx, out);
  if (!run.active) {
    advanceWagon(state, dt, ctx, out);
    if (run.active) issueActive(state, ctx, out);
    else if (run.s >= run.length - 0.01) out.push(finishArrived(state));
  }
  return out;
}

// ───────────────────────── reports from the engine ─────────────────────────

function completeStep(state) {
  const run = state.caravan.run;
  const event = run.events[run.active.eventIndex];
  event.stepIndex += 1;
  if (event.stepIndex < event.steps.length) {
    run.active = { eventIndex: run.active.eventIndex, issued: false, kind: null };
    return;
  }
  event.done = true;
  run.active = null;
  const lines = REACTIVE_BANTER.cleared;
  state.caravan.outbox.push({ type: 'banter', text: lines[run.events.indexOf(event) % lines.length] });
  notify(state, 'caravan:event-cleared', { leg: run.leg, eventId: event.id, boss: event.boss });
}

function reportDamage(state, amount) {
  const caravan = state.caravan;
  const run = caravan.run;
  caravan.wagon.hp = Math.max(0, caravan.wagon.hp - Math.max(0, amount));
  emit('caravan:damaged', { hp: caravan.wagon.hp, maxHp: wagonMaxHp(state) });
  if (caravan.wagon.hp <= 0) {
    finishFailed(state, 'destroyed');
    return ok({ failed: true });
  }
  if (!run.hurtWarned && caravan.wagon.hp < wagonMaxHp(state) * 0.35) {
    run.hurtWarned = true;
    caravan.outbox.push({ type: 'banter', text: REACTIVE_BANTER.hurt });
  }
  return ok({ hp: caravan.wagon.hp });
}

function reportStolen(state, count) {
  const run = state.caravan.run;
  const factor = hasUpgrade(state, 'cover') ? upgradeDef('cover').theftFactor : 1;
  const lost = Math.min(run.cargoLeft, Math.max(1, Math.ceil(count * factor)));
  run.cargoLeft -= lost;
  run.stolen += lost;
  emit('toast', { text: `Мародёры унесли груз: ${lost} ед.`, kind: 'bad' });
  emit('caravan:cargo', { cargoLeft: run.cargoLeft, cargoTotal: run.cargoTotal });
  return ok({ lost, cargoLeft: run.cargoLeft });
}

function reportGuardDown(state, guardId) {
  const guard = state.caravan.guards.find(g => g.id === guardId && g.alive);
  if (!guard) return fail('Нет такого охранника');
  guard.alive = false;
  state.caravan.run.guardsLost += 1;
  emit('toast', { text: `${guard.name} больше не встанет.`, kind: 'bad' });
  return ok({ guardId });
}

function reportObstacleCleared(state, report) {
  const run = state.caravan.run;
  if (!run.active || run.active.kind !== 'obstacle') return fail('Дорога и так свободна');
  const event = run.events[run.active.eventIndex];
  const obstacle = event.steps[event.stepIndex].obstacle;
  if (run.active.useSpare) {
    delete state.caravan.wagon.upgrades.spareWheel;
    emit('toast', { text: 'Запасное колесо пошло в дело.', kind: 'info' });
  } else if (report.usedItems && obstacle.needs && hasItems(state, obstacle.needs)) {
    removeItems(state, obstacle.needs);
  }
  completeStep(state);
  return ok({ eventId: event.id });
}

function reportEventCleared(state, report) {
  const run = state.caravan.run;
  if (!run.active || run.active.kind !== 'spawn') return fail('Нет активной засады');
  const event = run.events[run.active.eventIndex];
  if (report.eventId && report.eventId !== event.id) return fail('Это событие уже позади');
  completeStep(state);
  return ok({ eventId: event.id, eventDone: event.done });
}

/**
 * Report from the engine.
 * {type:'wagon-damage', amount} | {type:'cargo-stolen', count} | {type:'guard-down', guardId}
 * | {type:'obstacle-cleared', usedItems?} | {type:'event-cleared', eventId}
 */
export function caravanReport(state, report) {
  if (!state.caravan.run) return fail('Караван не в пути');
  switch (report?.type) {
    case 'wagon-damage': return reportDamage(state, report.amount);
    case 'cargo-stolen': return reportStolen(state, report.count || 1);
    case 'guard-down': return reportGuardDown(state, report.guardId);
    case 'obstacle-cleared': return reportObstacleCleared(state, report);
    case 'event-cleared': return reportEventCleared(state, report);
    default: return fail('Неизвестный отчёт');
  }
}

// ───────────────────────── actions during the run ─────────────────────────

/** Info about the toll being demanded right now, or null. */
export function pendingToll(state) {
  const run = state.caravan.run;
  if (!run?.active || run.active.kind !== 'spawn') return null;
  const event = run.events[run.active.eventIndex];
  const toll = event.steps[event.stepIndex].toll;
  return toll ? { eventId: event.id, coins: toll.coins, text: toll.text } : null;
}

/** Pay the toll party instead of fighting. The engine receives a `stand-down` directive on the next tick. */
export function payToll(state) {
  const toll = pendingToll(state);
  if (!toll) return fail('Платить некому');
  if (!spendCoins(state, toll.coins)) return fail(`Нужно ${toll.coins} монет`);
  state.caravan.outbox.push({ type: 'stand-down', eventId: toll.eventId });
  state.caravan.outbox.push({ type: 'banter', text: 'Откупились. Обидно, да дешевле, чем хоронить.' });
  completeStep(state);
  return ok({ paid: toll.coins });
}

/**
 * Repair the wagon. On the road it takes one `wagonKit` from the bag; in town it costs coins.
 */
export function repairWagon(state) {
  const caravan = state.caravan;
  const maxHp = wagonMaxHp(state);
  const missing = maxHp - caravan.wagon.hp;
  if (missing <= 0) return fail('Телега цела');
  if (caravan.run) {
    if (!removeItem(state, 'wagonKit', 1)) return fail(`Нужен предмет: ${itemName('wagonKit')}`);
    const restored = Math.min(missing, Math.round(maxHp * FIELD_REPAIR_FRACTION));
    caravan.wagon.hp += restored;
    emit('caravan:damaged', { hp: caravan.wagon.hp, maxHp });
    return ok({ restored, hp: caravan.wagon.hp });
  }
  const cost = Math.ceil(missing * TOWN_REPAIR_COIN_PER_HP);
  if (!spendCoins(state, cost)) return fail(`Починка стоит ${cost} монет`);
  caravan.wagon.hp = maxHp;
  return ok({ restored: missing, hp: maxHp, cost });
}

/** Price of a full repair in town. */
export function repairCost(state) {
  return Math.ceil(Math.max(0, wagonMaxHp(state) - state.caravan.wagon.hp) * TOWN_REPAIR_COIN_PER_HP);
}

/** Give up the run: the wagon is towed back, nothing more is lost than was already stolen. */
export function abandonRun(state) {
  if (!state.caravan.run) return fail('Караван не в пути');
  finishFailed(state, 'abandoned');
  return ok({ towFee: state.caravan.towDebt });
}

// ───────────────────────── endings ─────────────────────────

function settleGuards(caravan) {
  caravan.guards = caravan.guards.filter(guard => guard.alive);
}

function scaleDelivered(state, keep) {
  const caravan = state.caravan;
  for (const line of manifestLines(state)) {
    const had = caravan.delivered[line.itemId] || 0;
    caravan.delivered[line.itemId] = Math.floor(Math.min(had, line.count) * keep);
  }
}

function finishFailed(state, reason) {
  const caravan = state.caravan;
  const run = caravan.run;
  const def = legDef(run.leg);
  const integrity = run.cargoTotal ? run.cargoLeft / run.cargoTotal : 1;
  const keep = reason === 'destroyed' ? integrity * FAIL_CARGO_KEEP : integrity;
  caravan.run = null; // manifestLines() must now read the prep manifest
  scaleDelivered(state, keep);
  const bonusLost = {};
  if (reason === 'destroyed') {
    for (const [itemId, count] of Object.entries(caravan.bonus)) {
      const left = Math.floor(count * FAIL_BONUS_KEEP);
      bonusLost[itemId] = count - left;
      caravan.bonusCost[itemId] = Math.round((caravan.bonusCost[itemId] || 0) * (left / count));
      if (left > 0) caravan.bonus[itemId] = left;
      else delete caravan.bonus[itemId];
    }
    caravan.wagon.hp = Math.round(wagonMaxHp(state) * TOWED_HP_FRACTION);
  }
  caravan.towDebt += def.towFee;
  caravan.stats.failed += 1;
  settleGuards(caravan);
  const result = {
    type: 'failed', reason, leg: run.leg, cargoKept: keep, bonusLost, towFee: def.towFee,
    text: reason === 'destroyed'
      ? 'Телега разбита. Обломки и то, что уцелело, дотащат обратно — за плату.'
      : 'Караван повернул назад. Груз вернётся на склад, за буксировку придётся заплатить.',
  };
  caravan.lastResult = result;
  caravan.outbox.push({ type: 'failed', reason, result });
  emit('toast', { text: result.text, kind: 'bad' });
  notify(state, 'caravan:failed', { leg: run.leg, reason });
}

function sellBonusCargo(state, leg) {
  const caravan = state.caravan;
  const cityKey = destCity(leg).key;
  const sold = [];
  let income = 0;
  let cost = 0;
  for (const [itemId, count] of Object.entries(caravan.bonus)) {
    const price = Math.round(sellPriceAt(state, cityKey, itemId) * GUILD_SALE_BONUS);
    income += price * count;
    cost += caravan.bonusCost[itemId] || 0;
    sold.push({ itemId, count, price, total: price * count });
  }
  caravan.bonus = {};
  caravan.bonusCost = {};
  return { sold, income, profit: income - cost };
}

function openNextStage(state, run) {
  const caravan = state.caravan;
  caravan.delivered = {};
  caravan.manifest = null;
  if (run.guild) {
    caravan.guildLeg = null;
    caravan.guildSeq += 1;
    caravan.guildTier = Math.min(GUILD_RUN.maxTier, caravan.guildTier + 1);
    return;
  }
  if (caravan.stage === run.leg) caravan.stage += 1;
  if (caravan.stage === RING_COMPLETE) {
    emit('toast', { text: 'Торговое кольцо замкнулось. Гильдия открывает подряды на все три дороги.', kind: 'good' });
  }
}

function finishArrived(state) {
  const caravan = state.caravan;
  const run = caravan.run;
  const def = legDef(run.leg);
  const from = originCity(run.leg);
  const to = destCity(run.leg);
  const integrity = run.cargoTotal ? run.cargoLeft / run.cargoTotal : 1;
  const baseFee = contractFee(state);
  const fee = Math.round(baseFee * integrity);
  const perfect = run.stolen === 0 && run.guardsLost === 0;
  const perfectBonus = perfect ? Math.round(baseFee * PERFECT_RUN_BONUS) : 0;
  const trade = sellBonusCargo(state, run.leg);
  const coins = fee + perfectBonus + trade.income;
  const xp = Math.round(def.xp * (0.5 + 0.5 * integrity) * (run.guild ? 0.6 : 1));
  const repFrom = def.rep.from;
  const repTo = Math.max(1, Math.round(def.rep.to * integrity));

  addCoins(state, coins);
  grantXp(state, xp);
  addRep(state, from.key, run.guild ? Math.ceil(repFrom / 3) : repFrom);
  addRep(state, to.key, run.guild ? Math.ceil(repTo / 3) : repTo);
  raiseCityProsperity(state, to.key);
  caravan.stats.arrived += 1;
  caravan.run = null;
  settleGuards(caravan);
  caravan.guards = []; // contract is over — survivors are paid off
  openNextStage(state, run);

  const result = {
    type: 'arrived', leg: run.leg, guild: run.guild, from: from.key, to: to.key,
    integrity, fee, perfectBonus, sold: trade.sold, tradeIncome: trade.income, tradeProfit: trade.profit,
    coins, xp, rep: { [from.key]: repFrom, [to.key]: repTo }, stolen: run.stolen, guardsLost: run.guardsLost,
    stage: caravan.stage,
  };
  caravan.lastResult = result;
  emit('toast', { text: `Караван дошёл: ${to.name}. Выплата ${coins} монет.`, kind: 'good' });
  if (trade.income > 0) notify(state, 'caravan:trade-profit', { profit: Math.max(0, trade.profit), cityKey: to.key });
  notify(state, 'caravan:arrived', { leg: run.leg, guild: run.guild, result });
  return { type: 'arrived', result };
}

// ───────────────────────── position ─────────────────────────

/**
 * Where the wagon is: on the road during a run, otherwise parked at the start of the leg being prepared.
 * @returns {{x, z, y, yaw, moving: boolean, parked: boolean}|null} null when no leg is selected (guild stage)
 */
export function caravanPosition(state) {
  const run = state.caravan.run;
  const leg = currentLeg(state);
  if (leg === null) return null;
  const point = legPoint(leg, run ? run.s : 0);
  return { x: point.x, z: point.z, y: point.y, yaw: point.yaw, moving: !!run && !run.active, parked: !run };
}
