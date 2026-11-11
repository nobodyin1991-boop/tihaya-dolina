// Notice board: daily citizen contracts and the captain's bounties. Slice `board`. Pure.
// Contracts are generated deterministically from (day, city); bounties are a fixed catalog with cooldowns.
import { registerSlice, ok, fail } from './state.js';
import { emit } from '../core/events.js';
import { makeRng, seedFrom } from '../core/noise.js';
import { CITIES, REGIONS, poiById, cityByKey } from '../data/world-map.js';
import { regionAt } from '../world/terrain.js';
import { itemName } from '../data/items.js';
import { CONTRACT_POOLS, BOUNTIES, BOARD_TUNING } from '../data/board-data.js';
import { CITIZEN_NAMES } from '../data/npcs.js';
import { countItem, removeItem } from './inventory.js';
import { grantXp, addCoins } from './player.js';
import { addRep } from './reputation.js';
import { sellPriceAt } from './caravan-core.js';
import { CREATURE_FAMILIES } from './quest-rules.js';

registerSlice('board', {
  init: () => ({ day: 0, contracts: Object.fromEntries(CITIES.map(city => [city.key, []])), bounties: {} }),
  migrate(board) {
    board.contracts ??= {};
    for (const city of CITIES) board.contracts[city.key] ??= [];
    board.bounties ??= {};
    board.day ??= 0;
    return board;
  },
});

const today = state => state.time?.day || 1;
const caravanStage = state => state.caravan?.stage || 0;

// ───────────────────────── contracts ─────────────────────────

function makeContract(state, cityKey, day, index, rng, pool) {
  const entry = pool[Math.floor(rng() * pool.length)];
  const [min, max] = entry.count;
  const count = min + Math.floor(rng() * (max - min + 1));
  const premium = BOARD_TUNING.premiumMin + rng() * (BOARD_TUNING.premiumMax - BOARD_TUNING.premiumMin);
  const names = CITIZEN_NAMES[cityKey];
  const requester = names[Math.floor(rng() * names.length)];
  const unit = sellPriceAt(state, cityKey, entry.itemId);
  const coins = Math.max(BOARD_TUNING.minCoins, Math.round(unit * count * premium));
  return {
    id: `${cityKey}:${day}:${index}`, cityKey, itemId: entry.itemId, count, coins,
    rep: count * unit >= BOARD_TUNING.bigOrder ? 2 : 1,
    requester, text: entry.why, done: false, pinned: false,
  };
}

function generateContracts(state, cityKey, day, kept) {
  const rng = makeRng(seedFrom(`board:${day}:${cityKey}`));
  const stage = caravanStage(state);
  const pool = CONTRACT_POOLS[cityKey].filter(entry => (entry.minStage || 0) <= stage);
  const total = BOARD_TUNING.minOpen + Math.floor(rng() * (BOARD_TUNING.maxOpen - BOARD_TUNING.minOpen + 1));
  const contracts = [...kept];
  const taken = new Set(kept.map(contract => contract.itemId));
  for (let index = 0; contracts.length < total && index < total * 4; index++) {
    const contract = makeContract(state, cityKey, day, index, rng, pool);
    if (taken.has(contract.itemId)) continue;
    taken.add(contract.itemId);
    contracts.push(contract);
  }
  return contracts;
}

/** Regenerate the boards if the day changed. Pinned unfinished contracts survive. */
export function refreshBoard(state) {
  const board = state.board;
  const day = today(state);
  if (board.day === day) return false;
  board.day = day;
  for (const city of CITIES) {
    const kept = board.contracts[city.key].filter(contract => contract.pinned && !contract.done);
    board.contracts[city.key] = generateContracts(state, city.key, day, kept);
  }
  emit('board:refreshed', { day });
  return true;
}

function contractView(state, contract) {
  const have = countItem(state, contract.itemId);
  return { ...contract, itemName: itemName(contract.itemId), have: Math.min(have, contract.count), canFulfil: !contract.done && have >= contract.count };
}

/** Open requests on the board of a city: [{id, itemId, itemName, count, have, coins, rep, requester, text, done, pinned, canFulfil}]. */
export function listContracts(state, cityKey) {
  refreshBoard(state);
  return (state.board.contracts[cityKey] || []).map(contract => contractView(state, contract));
}

function findContract(state, cityKey, contractId) {
  refreshBoard(state);
  return (state.board.contracts[cityKey] || []).find(contract => contract.id === contractId) || null;
}

/** Hand over the goods of a contract and take the pay. */
export function fulfilContract(state, cityKey, contractId) {
  const contract = findContract(state, cityKey, contractId);
  if (!contract) return fail('Это объявление уже сняли');
  if (contract.done) return fail('Заказ уже выполнен');
  if (!removeItem(state, contract.itemId, contract.count)) return fail(`Нужно: ${itemName(contract.itemId)} ×${contract.count}`);
  contract.done = true;
  contract.pinned = false;
  addCoins(state, contract.coins);
  addRep(state, cityKey, contract.rep);
  grantXp(state, Math.round(contract.coins * BOARD_TUNING.xpPerCoin));
  emit('toast', { text: `${contract.requester}: «Вот спасибо. Держи, как уговаривались» (+${contract.coins})`, kind: 'good' });
  emit('board:contract-done', { id: contract.id, cityKey });
  return ok({ coins: contract.coins, rep: contract.rep });
}

/** Keep a contract in the journal (and on the board across day changes) until it is fulfilled. */
export function pinContract(state, cityKey, contractId, pinned = true) {
  const contract = findContract(state, cityKey, contractId);
  if (!contract || contract.done) return fail('Это объявление уже сняли');
  contract.pinned = !!pinned;
  return ok({ id: contractId, pinned: contract.pinned });
}

// ───────────────────────── bounties ─────────────────────────

const bountyDef = bountyId => BOUNTIES.find(bounty => bounty.id === bountyId) || null;

function bountyStatus(state, bounty) {
  const entry = state.board.bounties[bounty.id];
  if (caravanStage(state) < (bounty.minStage || 0)) return 'locked';
  if (!entry) return 'open';
  if (entry.accepted) return entry.progress >= bounty.target.count ? 'ready' : 'active';
  if (bounty.once) return 'done';
  return today(state) - entry.doneDay >= (bounty.repeatDays || 1) ? 'open' : 'cooldown';
}

function bountyMarker(bounty) {
  const target = bounty.target;
  if (target.poiId) {
    const poi = poiById(target.poiId);
    return poi ? { x: poi.x, z: poi.z } : null;
  }
  if (target.regionId) {
    const region = REGIONS.find(entry => entry.id === target.regionId);
    return region ? { x: region.x, z: region.z } : null;
  }
  return null;
}

function bountyView(state, bounty) {
  const entry = state.board.bounties[bounty.id];
  const status = bountyStatus(state, bounty);
  const cur = entry?.accepted ? Math.min(entry.progress, bounty.target.count) : 0;
  return {
    id: bounty.id, cityKey: bounty.cityKey, title: bounty.title, text: bounty.text, elite: !!bounty.elite,
    goal: bounty.goal, cur, need: bounty.target.count, status,
    rewards: { coins: bounty.coins, xp: bounty.xp, rep: { [bounty.cityKey]: bounty.rep } },
    marker: bountyMarker(bounty),
  };
}

/** Bounties offered by the captain of a city (locked ones are hidden). */
export function listBounties(state, cityKey) {
  return BOUNTIES
    .filter(bounty => bounty.cityKey === cityKey)
    .map(bounty => bountyView(state, bounty))
    .filter(view => view.status !== 'locked');
}

/** Take a bounty: kills count only after this. */
export function acceptBounty(state, bountyId) {
  const bounty = bountyDef(bountyId);
  if (!bounty) return fail('Нет такой награды');
  const status = bountyStatus(state, bounty);
  if (status === 'active' || status === 'ready') return fail('Этот заказ уже за тобой');
  if (status === 'cooldown') return fail('Капитан пока не платит за это — зайди через пару дней');
  if (status !== 'open') return fail('Эта награда уже выплачена');
  state.board.bounties[bounty.id] = { accepted: true, progress: 0, doneDay: null };
  emit('toast', { text: `Заказ принят: «${bounty.title}»`, kind: 'info' });
  emit('quest:started', { id: bounty.id });
  return ok({ id: bountyId });
}

/** Collect the reward of a finished bounty at the captain. */
export function claimBounty(state, bountyId) {
  const bounty = bountyDef(bountyId);
  if (!bounty) return fail('Нет такой награды');
  if (bountyStatus(state, bounty) !== 'ready') return fail('Работа ещё не сделана');
  state.board.bounties[bounty.id] = { accepted: false, progress: 0, doneDay: today(state) };
  addCoins(state, bounty.coins);
  grantXp(state, bounty.xp);
  addRep(state, bounty.cityKey, bounty.rep);
  emit('toast', { text: `Награда получена: «${bounty.title}» (+${bounty.coins})`, kind: 'good' });
  emit('quest:completed', { id: bounty.id });
  return ok({ coins: bounty.coins, xp: bounty.xp, rep: bounty.rep });
}

function killMatches(target, payload) {
  if (target.creatureId && target.creatureId !== payload.creatureId) return false;
  if (target.family && !(CREATURE_FAMILIES[target.family] || []).includes(payload.creatureId)) return false;
  if (target.poiId && target.poiId !== payload.poiId) return false;
  if (target.regionId) {
    if (!Number.isFinite(payload.x) || regionAt(payload.x, payload.z).id !== target.regionId) return false;
  }
  return true;
}

function countKill(state, payload) {
  for (const bounty of BOUNTIES) {
    const entry = state.board.bounties[bounty.id];
    if (!entry?.accepted || entry.progress >= bounty.target.count) continue;
    if (!killMatches(bounty.target, payload)) continue;
    entry.progress += 1;
    emit('quest:updated', { id: bounty.id });
    if (entry.progress >= bounty.target.count) emit('toast', { text: `Заказ выполнен: «${bounty.title}». Награда у капитана.`, kind: 'good' });
  }
}

/** World events relevant to the board (called from quests.handleWorldEvent). */
export function boardWorldEvent(state, type, payload) {
  if (type === 'world:kill') countKill(state, payload);
  if (type === 'time:newday') refreshBoard(state);
}

// ───────────────────────── journal ─────────────────────────

function bountyJournal(state, bounty) {
  const view = bountyView(state, bounty);
  const city = cityByKey(bounty.cityKey);
  return {
    id: bounty.id, title: bounty.title, category: 'bounty', cityKey: bounty.cityKey, giver: `${bounty.cityKey}:captain`,
    turnIn: `${bounty.cityKey}:captain`, desc: bounty.text,
    stage: view.status === 'ready' ? 'Работа сделана. Награда ждёт у капитана стражи.' : bounty.goal,
    objectives: [{ text: bounty.goal, cur: view.cur, need: view.need, done: view.cur >= view.need }],
    rewards: { coins: bounty.coins, xp: bounty.xp, rep: { [bounty.cityKey]: bounty.rep }, items: {} },
    status: view.status === 'ready' ? 'ready' : 'active',
    marker: view.status === 'ready' ? { x: city.x, z: city.z } : view.marker, tracked: false,
  };
}

function contractJournal(state, contract) {
  const view = contractView(state, contract);
  const city = cityByKey(contract.cityKey);
  const goal = `Принести: ${view.itemName} ×${contract.count}`;
  return {
    id: contract.id, title: `Заказ: ${view.itemName}`, category: 'contract', cityKey: contract.cityKey, giver: contract.requester,
    turnIn: `${contract.cityKey}:board`, desc: `${contract.requester}: «${contract.text}»`,
    stage: view.canFulfil ? 'Товар собран. Отнеси к доске объявлений.' : goal,
    objectives: [{ text: goal, cur: view.have, need: contract.count, done: view.canFulfil }],
    rewards: { coins: contract.coins, xp: 0, rep: { [contract.cityKey]: contract.rep }, items: {} },
    status: view.canFulfil ? 'ready' : 'active', marker: { x: city.x, z: city.z }, tracked: false,
  };
}

/** Accepted bounties and pinned contracts as journal entries. */
export function boardJournal(state) {
  const entries = [];
  for (const bounty of BOUNTIES) if (state.board.bounties[bounty.id]?.accepted) entries.push(bountyJournal(state, bounty));
  for (const city of CITIES) {
    for (const contract of state.board.contracts[city.key]) if (contract.pinned && !contract.done) entries.push(contractJournal(state, contract));
  }
  return entries;
}
