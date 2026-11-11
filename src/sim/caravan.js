// Caravans: preparation (manifest, wagon, guards, bonus cargo), readiness and the UI overview. Slice `caravan`. Pure.
// The run itself lives in caravan-run.js; shared helpers and the slice in caravan-core.js. Import everything from here.
//
// ── Engine protocol ──────────────────────────────────────────────────────────────────────────────────────
// Every frame while `state.caravan.run` exists (and once after it ends, to flush the last directives):
//   directives = caravanTick(state, dt, {playerX, playerZ, enemiesAlive, night, raining})
// Directives:
//   {type:'spawn', eventId, wave, title, groups:[{creatureId, count, level, side, role}], s, x, z, forewarned, toll?, boss?}
//        side ∈ left|right|front|rear (relative to the wagon), role ∈ attacker|looter|boss.
//        `toll` {coins, text}: the party waits for payToll(state); attacking them is the other answer.
//        When every creature of the directive is dead → caravanReport({type:'event-cleared', eventId}).
//        Multi-wave events send the next `spawn` (same eventId, wave+1) on the following tick.
//   {type:'obstacle', eventId, kind, s, x, z, needs, workSeconds, slowSeconds, text}
//        kind ∈ fallen-tree|rockslide|broken-bridge|mud|barricade|wheel-break. The player works at the obstacle:
//        `workSeconds` if the bag holds `needs` (or needs is null), otherwise `slowSeconds`.
//        Then → caravanReport({type:'obstacle-cleared', usedItems: true|false}); `needs` are removed here.
//   {type:'stand-down', eventId}  the toll was paid — the party leaves in peace (despawn / walk away).
//   {type:'banter', text}         a line of the wagon driver.
//   {type:'arrived', result}      run finished; payout already applied; `result` is the summary for the UI.
//   {type:'failed', reason:'destroyed'|'abandoned', result}
// Reports: {type:'wagon-damage', amount} · {type:'cargo-stolen', count} · {type:'guard-down', guardId}
//          · {type:'obstacle-cleared', usedItems?} · {type:'event-cleared', eventId}
// The wagon rolls only while the player is within FOLLOW_RADIUS, ctx.enemiesAlive is 0 and no event step is open.
import { ok, fail } from './state.js';
import { emit } from '../core/events.js';
import { item, itemName } from '../data/items.js';
import { countItem, removeItem, addItem, canAddItems } from './inventory.js';
import { addCoins, spendCoins } from './player.js';
import { guardLimit } from './reputation.js';
import { seedFrom } from '../core/noise.js';
import { LEGS } from '../data/world-map.js';
import { legLength } from '../world/terrain.js';
import {
  CARAVAN_LEGS, WAGON_TIERS, WAGON_UPGRADES, MERCS, TRADE_GOODS, CARGO_CATEGORIES, DANGER_LABELS,
  PROVISIONS_PER_GUARD, GUARD_FOOD, GUILD_SALE_BONUS,
} from '../data/caravans.js';
import {
  RING_COMPLETE, notify, currentLeg, legDef, originCity, destCity, isGuildStage, manifestLines, manifestProgress,
  contractFee, generateGuildManifest, wagonTier, wagonMaxHp, bonusCapacity, bonusUsed, hasUpgrade, buyPriceAt, sellPriceAt,
  bonusSaleEstimate, planEvents, threatOf, eventPoint, prepList,
} from './caravan-core.js';
import { repairCost, pendingToll } from './caravan-run.js';

export { RING_COMPLETE, setCaravanListener, currentLeg, manifestLines, manifestProgress, wagonMaxHp, bonusCapacity } from './caravan-core.js';
export {
  launchCaravan, caravanTick, caravanReport, caravanResume, payToll, pendingToll, repairWagon, repairCost, abandonRun, caravanPosition,
} from './caravan-run.js';

const DISMISS_REFUND = 0.5;

const busy = state => (state.caravan.run ? 'Караван в пути — не до того' : null);

// ───────────────────────── manifest ─────────────────────────

/**
 * Hand cargo to the quartermaster. Takes up to `count` units from the bag and pays a small advance.
 * @returns ok({accepted, advance, full}) | fail
 */
export function contributeCargo(state, itemId, count = Infinity) {
  const problem = busy(state);
  if (problem) return fail(problem);
  const caravan = state.caravan;
  const line = manifestLines(state).find(entry => entry.itemId === itemId);
  if (!line) return fail('Этого нет в ведомости');
  const missing = line.count - (caravan.delivered[itemId] || 0);
  if (missing <= 0) return fail('Эта строка ведомости уже закрыта');
  const accepted = Math.min(count, missing, countItem(state, itemId));
  if (accepted <= 0) return fail(`В сумке нет предмета «${itemName(itemId)}»`);
  removeItem(state, itemId, accepted);
  caravan.delivered[itemId] = (caravan.delivered[itemId] || 0) + accepted;
  const advance = accepted * line.advance;
  addCoins(state, advance);
  const full = manifestProgress(state).full;
  emit('caravan:manifest', { itemId, accepted, full });
  if (full) {
    emit('toast', { text: 'Ведомость закрыта. Караван можно выпускать.', kind: 'good' });
    notify(state, 'caravan:manifest-full', { leg: currentLeg(state) });
  }
  return ok({ accepted, advance, full });
}

/** Hand in everything from the bag that the manifest still needs. */
export function contributeAll(state) {
  let accepted = 0;
  let advance = 0;
  for (const line of manifestLines(state)) {
    const result = contributeCargo(state, line.itemId);
    if (!result.ok) continue;
    accepted += result.accepted;
    advance += result.advance;
  }
  if (!accepted) return fail('В сумке нет ничего из ведомости');
  return ok({ accepted, advance, full: manifestProgress(state).full });
}

/** Stage 3 only: pick the leg of the next guild contract (generates its manifest). */
export function selectGuildLeg(state, leg) {
  const problem = busy(state);
  if (problem) return fail(problem);
  if (!isGuildStage(state)) return fail('Гильдейские подряды откроются, когда кольцо замкнётся');
  if (!LEGS[leg]) return fail('Нет такой дороги');
  const caravan = state.caravan;
  if (caravan.guildLeg === leg) return ok({ leg, manifest: caravan.manifest });
  if (!canAddItems(state, caravan.delivered)) return fail('Освободи сумку: сданный груз нужно забрать назад');
  for (const [itemId, count] of Object.entries(caravan.delivered)) if (count > 0) addItem(state, itemId, count);
  caravan.delivered = {};
  caravan.guildLeg = leg;
  caravan.manifest = generateGuildManifest(leg, caravan.guildTier, caravan.guildSeq);
  return ok({ leg, manifest: caravan.manifest });
}

// ───────────────────────── wagon ─────────────────────────

function buyTier(state, tier) {
  const caravan = state.caravan;
  if (caravan.wagon.tier >= tier.tier) return fail('Такая телега у тебя уже есть');
  if (tier.tier > caravan.wagon.tier + 1) return fail('Сначала купи телегу попроще');
  if (caravan.stage < tier.minStage) return fail('Конюх пока не возьмётся: нет ни леса, ни железа. Замкни ещё один перегон.');
  if (!spendCoins(state, tier.price)) return fail(`Нужно ${tier.price} монет`);
  caravan.wagon.tier = tier.tier;
  caravan.wagon.hp = wagonMaxHp(state);
  return ok({ id: tier.id });
}

/**
 * Buy a wagon tier ('tier2' | 'tier3') or an upgrade from WAGON_UPGRADES at the stablemaster.
 */
export function buyWagonUpgrade(state, upgradeId) {
  const problem = busy(state);
  if (problem) return fail(problem);
  const caravan = state.caravan;
  const tier = WAGON_TIERS.find(entry => entry.id === upgradeId && entry.tier > 1);
  if (tier) return buyTier(state, tier);
  const upgrade = WAGON_UPGRADES.find(entry => entry.id === upgradeId);
  if (!upgrade) return fail('Конюх такого не делает');
  if (hasUpgrade(state, upgradeId)) return fail('Уже установлено');
  if (caravan.stage < upgrade.minStage) return fail('Пока не достать — нужны мастера и товар из следующего города');
  if (!spendCoins(state, upgrade.price)) return fail(`Нужно ${upgrade.price} монет`);
  const hpBefore = wagonMaxHp(state);
  caravan.wagon.upgrades[upgradeId] = true;
  caravan.wagon.hp += wagonMaxHp(state) - hpBefore;
  emit('toast', { text: `Телега: ${upgrade.name}`, kind: 'good' });
  return ok({ id: upgradeId });
}

// ───────────────────────── guards ─────────────────────────

function mercPool(state) {
  const leg = currentLeg(state);
  if (leg === null) return [];
  return MERCS[originCity(leg).key];
}

/** Hire a mercenary from the origin city's pool (`mercId` optional — the first free one). */
export function hireGuard(state, mercId = null) {
  const problem = busy(state);
  if (problem) return fail(problem);
  const leg = currentLeg(state);
  if (leg === null) return fail('Сначала выбери гильдейский подряд');
  const caravan = state.caravan;
  const origin = originCity(leg);
  const limit = guardLimit(state, origin.key);
  if (caravan.guards.length >= limit) {
    return fail(limit >= 4 ? 'Больше четырёх бойцов телега не прокормит' : 'Капитан больше людей не даст — тебя здесь ещё мало знают');
  }
  const hired = new Set(caravan.guards.map(guard => guard.id));
  const merc = mercPool(state).find(entry => !hired.has(entry.id) && (!mercId || entry.id === mercId));
  if (!merc) return fail('Свободных бойцов нет');
  if (!spendCoins(state, merc.price)) return fail(`Нужно ${merc.price} монет`);
  caravan.guards.push({ id: merc.id, name: merc.name, level: legDef(leg).baseLevel + merc.level, price: merc.price, alive: true });
  emit('toast', { text: `${merc.name} идёт с караваном.`, kind: 'good' });
  return ok({ guardId: merc.id });
}

/** Send a hired guard home before the launch (half of the pay comes back). */
export function dismissGuard(state, guardId) {
  const problem = busy(state);
  if (problem) return fail(problem);
  const caravan = state.caravan;
  const index = caravan.guards.findIndex(guard => guard.id === guardId);
  if (index < 0) return fail('Нет такого охранника');
  const [guard] = caravan.guards.splice(index, 1);
  const refund = Math.floor((guard.price || 0) * DISMISS_REFUND);
  addCoins(state, refund);
  return ok({ refund });
}

// ───────────────────────── bonus cargo ─────────────────────────

const isTradeGood = itemId => TRADE_GOODS.includes(itemId) || item(itemId).type === 'trade';

/** Load own trade goods onto the wagon; they are sold at the destination on arrival. */
export function loadBonusCargo(state, itemId, count = 1) {
  const problem = busy(state);
  if (problem) return fail(problem);
  const leg = currentLeg(state);
  if (leg === null) return fail('Сначала выбери гильдейский подряд');
  if (!isTradeGood(itemId)) return fail('В попутный груз идут только торговые товары');
  const caravan = state.caravan;
  const room = bonusCapacity(state) - bonusUsed(state);
  const loaded = Math.min(count, room, countItem(state, itemId));
  if (room <= 0) return fail('На телеге нет места');
  if (loaded <= 0) return fail(`В сумке нет предмета «${itemName(itemId)}»`);
  removeItem(state, itemId, loaded);
  caravan.bonus[itemId] = (caravan.bonus[itemId] || 0) + loaded;
  caravan.bonusCost[itemId] = (caravan.bonusCost[itemId] || 0) + loaded * buyPriceAt(state, originCity(leg).key, itemId);
  return ok({ loaded });
}

/** Take bonus cargo back into the bag. */
export function unloadBonusCargo(state, itemId, count = Infinity) {
  const problem = busy(state);
  if (problem) return fail(problem);
  const caravan = state.caravan;
  const have = caravan.bonus[itemId] || 0;
  const unloaded = Math.min(count, have);
  if (unloaded <= 0) return fail('Такого груза на телеге нет');
  if (!canAddItems(state, { [itemId]: unloaded })) return fail('В сумке нет места');
  addItem(state, itemId, unloaded);
  caravan.bonusCost[itemId] = Math.round((caravan.bonusCost[itemId] || 0) * ((have - unloaded) / have));
  if (have === unloaded) {
    delete caravan.bonus[itemId];
    delete caravan.bonusCost[itemId];
  } else {
    caravan.bonus[itemId] = have - unloaded;
  }
  return ok({ unloaded });
}

// ───────────────────────── readiness and overview ─────────────────────────

function provisionsView(state) {
  const need = state.caravan.guards.length * PROVISIONS_PER_GUARD;
  const have = GUARD_FOOD.reduce((sum, foodId) => sum + countItem(state, foodId), 0);
  return { need, have: Math.min(have, need), ok: have >= need };
}

function dangerRating(state, leg) {
  const guild = isGuildStage(state);
  const events = planEvents(state, leg, seedFrom(`preview:${leg}`), { guild, tier: state.caravan.guildTier });
  const threat = threatOf(events);
  let protection = state.caravan.guards.length * 3 + (wagonTier(state).tier - 1) * 2;
  if (hasUpgrade(state, 'reinforced')) protection += 2;
  if (hasUpgrade(state, 'lanterns')) protection += 1;
  if (hasUpgrade(state, 'cover')) protection += 1;
  if (hasUpgrade(state, 'secondWagon')) protection += 1;
  const score = Math.max(0, threat - protection);
  const rating = Math.min(4, Math.round(score / (7 + 4 * leg)));
  return { rating, label: DANGER_LABELS[rating], threat, protection };
}

function launchBlockers(state, leg) {
  const blockers = [];
  const caravan = state.caravan;
  if (!manifestProgress(state).full) blockers.push('Ведомость не закрыта');
  if (caravan.wagon.hp <= 0) blockers.push('Телега разбита');
  if (caravan.towDebt > 0) blockers.push(`Долг за буксировку: ${caravan.towDebt} монет (спишется при выезде)`);
  if (leg === null) blockers.push('Не выбран подряд');
  return blockers;
}

/**
 * Readiness breakdown for the launch screen.
 * @returns {{leg, required:{done,total,full}, canLaunch, blockers:[string], prep:[{id,label,effect,done,kind}],
 *            provisions:{need,have,ok}, danger:{rating,label,threat,protection}}|null}
 */
export function readiness(state) {
  const leg = currentLeg(state);
  if (leg === null) return null;
  const required = manifestProgress(state);
  const blockers = launchBlockers(state, leg);
  const hardBlock = !required.full || state.caravan.wagon.hp <= 0 || !!state.caravan.run;
  return {
    leg, required, canLaunch: !hardBlock, blockers,
    prep: prepList(state, leg),
    provisions: provisionsView(state),
    danger: dangerRating(state, leg),
  };
}

function manifestView(state) {
  return manifestLines(state).map(line => {
    const delivered = Math.min(line.count, state.caravan.delivered[line.itemId] || 0);
    return {
      itemId: line.itemId, name: itemName(line.itemId), category: line.category, categoryName: CARGO_CATEGORIES[line.category],
      count: line.count, delivered, done: delivered >= line.count, inBag: countItem(state, line.itemId), advance: line.advance,
    };
  });
}

function wagonView(state) {
  const caravan = state.caravan;
  const tier = wagonTier(state);
  const nextTier = WAGON_TIERS.find(entry => entry.tier === tier.tier + 1) || null;
  const options = [];
  if (nextTier) {
    options.push({
      id: nextTier.id, name: nextTier.name, desc: nextTier.desc, price: nextTier.price, owned: false,
      effect: `Прочность ${nextTier.maxHp}, попутный груз ${nextTier.bonusUnits} мест`,
      locked: caravan.stage < nextTier.minStage, lockReason: caravan.stage < nextTier.minStage ? 'Откроется после следующего перегона' : null,
    });
  }
  for (const upgrade of WAGON_UPGRADES) {
    const locked = caravan.stage < upgrade.minStage;
    options.push({
      id: upgrade.id, name: upgrade.name, desc: upgrade.desc, effect: upgrade.effect, price: upgrade.price,
      owned: hasUpgrade(state, upgrade.id), consumable: !!upgrade.consumable,
      locked, lockReason: locked ? 'Откроется после следующего перегона' : null,
    });
  }
  return {
    tier: tier.tier, name: tier.name, desc: tier.desc, hp: caravan.wagon.hp, maxHp: wagonMaxHp(state),
    repairCost: repairCost(state), upgrades: options,
  };
}

function guardsView(state, leg) {
  const caravan = state.caravan;
  const origin = originCity(leg);
  const hired = new Set(caravan.guards.map(guard => guard.id));
  return {
    limit: guardLimit(state, origin.key),
    hired: caravan.guards.map(guard => ({ ...guard })),
    pool: MERCS[origin.key].map(merc => ({
      id: merc.id, name: merc.name, line: merc.line, price: merc.price,
      level: legDef(leg).baseLevel + merc.level, hired: hired.has(merc.id),
    })),
    provisions: provisionsView(state),
  };
}

function bonusView(state, leg) {
  const caravan = state.caravan;
  const dest = destCity(leg);
  const items = Object.entries(caravan.bonus).map(([itemId, count]) => ({
    itemId, name: itemName(itemId), count, cost: caravan.bonusCost[itemId] || 0,
    estimate: Math.round(sellPriceAt(state, dest.key, itemId) * GUILD_SALE_BONUS) * count,
  }));
  return { capacity: bonusCapacity(state), used: bonusUsed(state), items, sellsAt: dest.key };
}

function runView(state) {
  const run = state.caravan.run;
  if (!run) return null;
  const activeEvent = run.active ? run.events[run.active.eventIndex] : null;
  return {
    leg: run.leg, guild: run.guild, s: run.s, length: run.length, progress: run.s / run.length,
    cargoLeft: run.cargoLeft, cargoTotal: run.cargoTotal, integrity: run.cargoTotal ? run.cargoLeft / run.cargoTotal : 1,
    activeEvent: activeEvent ? { id: activeEvent.id, title: activeEvent.title, kind: run.active.kind } : null,
    toll: pendingToll(state),
    knownEvents: knownEvents(state, run.leg, run.events, run.revealed),
  };
}

function knownEvents(state, leg, events, revealed) {
  if (!revealed) return [];
  return events.filter(event => !event.done).map(event => ({ id: event.id, title: event.title, hint: event.hint, ...eventPoint(leg, event.s) }));
}

/** Ambush points known from scouting, for the map: [{id, title, hint, x, z}]. */
export function scoutedEvents(state) {
  const run = state.caravan.run;
  if (run) return knownEvents(state, run.leg, run.events, run.revealed);
  const leg = currentLeg(state);
  if (leg === null) return [];
  const guild = isGuildStage(state);
  const revealed = guild || !!state.flags?.[`scout:leg${leg}`];
  const events = planEvents(state, leg, seedFrom(`preview:${leg}`), { guild, tier: state.caravan.guildTier });
  return knownEvents(state, leg, events, revealed);
}

/**
 * Everything the caravan screen needs.
 * @returns {{stage, ringComplete, leg: null|{id,name,from,to,fromName,toName,brief,length,prepHours}, guild:{tier,legs}|null,
 *   manifest:[…], manifestProgress, wagon, guards, bonus, readiness, expectedPayout:{fee,bonusSale,total}, towDebt, run, lastResult}}
 */
export function caravanOverview(state) {
  const caravan = state.caravan;
  const leg = currentLeg(state);
  const guild = isGuildStage(state);
  const base = {
    stage: caravan.stage, ringComplete: guild,
    guild: guild ? { tier: caravan.guildTier, legs: LEGS.map(entry => ({ id: entry.id, name: entry.name, selected: entry.id === caravan.guildLeg })) } : null,
    towDebt: caravan.towDebt, run: runView(state), lastResult: caravan.lastResult, wagon: wagonView(state),
  };
  if (leg === null) {
    return { ...base, leg: null, manifest: [], manifestProgress: manifestProgress(state), guards: null, bonus: null, readiness: null, expectedPayout: null };
  }
  const from = originCity(leg);
  const to = destCity(leg);
  const fee = contractFee(state);
  const bonusSale = bonusSaleEstimate(state, leg, GUILD_SALE_BONUS);
  return {
    ...base,
    leg: {
      id: leg, name: LEGS[leg].name, from: from.key, to: to.key, fromName: from.name, toName: to.name,
      brief: CARAVAN_LEGS[leg].brief, length: Math.round(legLength(leg)), prepHours: CARAVAN_LEGS[leg].prepHours,
    },
    manifest: manifestView(state), manifestProgress: manifestProgress(state),
    guards: guardsView(state, leg), bonus: bonusView(state, leg),
    readiness: readiness(state),
    expectedPayout: { fee, bonusSale, total: fee + bonusSale },
  };
}
