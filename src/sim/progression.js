// Hero growth the Gothic way: learning points (ОО) are earned by levels and spent at teachers,
// together with coins, on attributes, ability ranks and perks. Pure.
// Slice `prog`: {
//   lp: number,                 — unspent learning points
//   lpLevel: number,            — hero level up to which points were already granted
//   attrs: { strength, agility, endurance, wits },
//   abilities: { abilityId: rank 1..5 },
//   perks: [perkId]
// }
import { registerSlice, ok, fail } from './state.js';
import { emit } from '../core/events.js';
import {
  CLASSES, ABILITIES, ATTRIBUTES, ATTRIBUTE_IDS, ABILITY_MAX_RANK,
  abilitiesOf, rankRequiredLevel, resolveAbility,
} from '../data/classes.js';
import { PERKS, perksTaughtBy } from '../data/perks.js';
import { PROFESSIONS } from '../data/professions.js';
import { spendCoins } from './player.js';
import { masterTraining } from './crafting.js';

export const TRAINING = {
  lpPerLevel: 3,
  /** Highest attribute value a city's teachers can train. */
  attributeCaps: { valley: 20, ford: 35, harbor: 50 },
  /** NPC role that trains each attribute. */
  attributeTeachers: { strength: 'trainer', agility: 'trainer', endurance: 'captain', wits: 'elder' },
  /** Attribute LP cost steps: value below the threshold costs that many points. */
  attributeLpSteps: [[20, 1], [35, 2], [Infinity, 3]],
  attributeCoinsBase: 10,
  attributeCoinsPerPoint: 4,
  /** Highest ability rank the combat trainer of a city teaches. */
  abilityRankCap: { valley: 2, ford: 4, harbor: 5 },
  abilityLp: [1, 1, 2, 2, 3],
  abilityCoins: [30, 80, 200, 450, 900],
  /** Coin multiplier per ability slot 1..5. */
  slotCoinFactor: [1, 1, 1, 1.5, 2],
  /** Abilities known from the start (slots, 1-based) at rank 1. */
  startingSlots: [1, 2],
};

function startingAbilities(classId) {
  const known = {};
  for (const ability of abilitiesOf(classId)) {
    if (TRAINING.startingSlots.includes(ability.slot)) known[ability.id] = 1;
  }
  return known;
}

registerSlice('prog', {
  init: ({ classId = 'warrior' } = {}) => {
    const cls = CLASSES[classId] || CLASSES.warrior;
    return { lp: 0, lpLevel: 1, attrs: { ...cls.attrs }, abilities: startingAbilities(cls.id), perks: [] };
  },
  migrate(slice, state) {
    const cls = CLASSES[state.player?.classId] || CLASSES.warrior;
    if (!Number.isFinite(slice.lp) || slice.lp < 0) throw new Error('Повреждены очки обучения');
    slice.lpLevel = Number.isInteger(slice.lpLevel) ? slice.lpLevel : 1;
    slice.attrs = { ...cls.attrs, ...(slice.attrs || {}) };
    slice.abilities ??= startingAbilities(cls.id);
    for (const [abilityId, rank] of Object.entries(slice.abilities)) {
      const valid = ABILITIES[abilityId] && Number.isInteger(rank) && rank >= 1 && rank <= ABILITY_MAX_RANK;
      if (!valid) delete slice.abilities[abilityId];
    }
    slice.perks = (Array.isArray(slice.perks) ? slice.perks : []).filter(perkId => PERKS[perkId]);
    return slice;
  },
});

/** Grant the learning points of levels gained since the last call. Returns the points added. */
export function syncLearningPoints(state) {
  const prog = state.prog;
  const level = state.player.level;
  if (level <= prog.lpLevel) return 0;
  const gained = (level - prog.lpLevel) * TRAINING.lpPerLevel;
  prog.lp += gained;
  prog.lpLevel = level;
  emit('toast', { text: `Очки обучения: +${gained}`, kind: 'good' });
  return gained;
}

/** Unspent learning points (levels gained since the last look are counted in). */
export function learningPoints(state) {
  syncLearningPoints(state);
  return state.prog.lp;
}

const cityReputation = (state, cityKey) => state.rep?.[cityKey] ?? 0;

/** Pay LP and coins together; returns a fail reason or null. Nothing is spent on failure. */
function pay(state, cost) {
  if (state.prog.lp < cost.lp) return `Нужно очков обучения: ${cost.lp}`;
  if (state.player.coins < cost.coins) return `Нужно ${cost.coins} монет`;
  spendCoins(state, cost.coins);
  state.prog.lp -= cost.lp;
  return null;
}

/** Why a cost cannot be paid (null if it can). */
function payObstacle(state, cost) {
  if (state.prog.lp < cost.lp) return `Нужно очков обучения: ${cost.lp}`;
  if (state.player.coins < cost.coins) return `Нужно ${cost.coins} монет`;
  return null;
}

// ── Attributes ───────────────────────────────────────────────────────────────────────────────

/** Cost of raising an attribute from `value` to `value + 1`. */
export function attributeCost(value) {
  const step = TRAINING.attributeLpSteps.find(([threshold]) => value < threshold);
  return { lp: step[1], coins: TRAINING.attributeCoinsBase + value * TRAINING.attributeCoinsPerPoint };
}

function attributeObstacle(state, attributeId, cityKey) {
  if (!ATTRIBUTES[attributeId]) return 'Неизвестная характеристика';
  const cap = TRAINING.attributeCaps[cityKey];
  if (cap === undefined) return 'Здесь этому не учат';
  if (state.prog.attrs[attributeId] >= cap) {
    return cityKey === 'harbor' ? 'Достигнут предел' : 'Здешний наставник большему не научит — ищите учителя в другом городе';
  }
  return null;
}

/**
 * Train an attribute by one point at a teacher of `cityKey`.
 * @returns ok({attributeId, value, cost}) or fail(reason)
 */
export function trainAttribute(state, attributeId, cityKey) {
  syncLearningPoints(state);
  const obstacle = attributeObstacle(state, attributeId, cityKey);
  if (obstacle) return fail(obstacle);
  const cost = attributeCost(state.prog.attrs[attributeId]);
  const unpaid = pay(state, cost);
  if (unpaid) return fail(unpaid);
  state.prog.attrs[attributeId] += 1;
  emit('prog:changed', { kind: 'attribute', id: attributeId });
  emit('toast', { text: `${ATTRIBUTES[attributeId].name}: ${state.prog.attrs[attributeId]}`, kind: 'good' });
  return ok({ attributeId, value: state.prog.attrs[attributeId], cost });
}

// ── Abilities ────────────────────────────────────────────────────────────────────────────────

/** Learned rank of an ability (0 = not learned). */
export const abilityRank = (state, abilityId) => state.prog.abilities[abilityId] || 0;

/** Cost of learning `rank` of an ability. */
export function abilityCost(abilityId, rank) {
  const ability = ABILITIES[abilityId];
  const factor = TRAINING.slotCoinFactor[ability.slot - 1];
  return { lp: TRAINING.abilityLp[rank - 1], coins: Math.round(TRAINING.abilityCoins[rank - 1] * factor) };
}

function abilityObstacle(state, abilityId, cityKey) {
  const ability = ABILITIES[abilityId];
  if (!ability) return 'Неизвестное умение';
  if (ability.classId !== state.player.classId) return 'Умение другого класса';
  const next = abilityRank(state, abilityId) + 1;
  if (next > ABILITY_MAX_RANK) return 'Максимальный ранг';
  const cap = TRAINING.abilityRankCap[cityKey];
  if (cap === undefined) return 'Здесь этому не учат';
  const required = rankRequiredLevel(abilityId, next);
  if (state.player.level < required) return `Нужен уровень ${required}`;
  if (next > cap) return 'Здешний наставник большему не научит — ищите учителя в другом городе';
  return null;
}

/**
 * Learn an ability or raise its rank by one at the combat trainer of `cityKey`.
 * @returns ok({abilityId, rank, cost}) or fail(reason)
 */
export function learnAbility(state, abilityId, cityKey) {
  syncLearningPoints(state);
  const obstacle = abilityObstacle(state, abilityId, cityKey);
  if (obstacle) return fail(obstacle);
  const rank = abilityRank(state, abilityId) + 1;
  const cost = abilityCost(abilityId, rank);
  const unpaid = pay(state, cost);
  if (unpaid) return fail(unpaid);
  state.prog.abilities[abilityId] = rank;
  emit('prog:changed', { kind: 'ability', id: abilityId });
  emit('toast', { text: `${ABILITIES[abilityId].name}: ранг ${rank}`, kind: 'good' });
  return ok({ abilityId, rank, cost });
}

/**
 * The hero's ability bar: five slots in order.
 * @returns [{ slot, id, rank, ability }] — `ability` is resolveAbility() at the learned rank
 *          (rank 1 numbers are shown for abilities not learned yet, with rank = 0)
 */
export function abilityBar(state) {
  return abilitiesOf(state.player.classId).map(ability => {
    const rank = abilityRank(state, ability.id);
    return { slot: ability.slot, id: ability.id, rank, ability: resolveAbility(ability.id, Math.max(1, rank)) };
  });
}

// ── Perks ────────────────────────────────────────────────────────────────────────────────────

export const hasPerk = (state, perkId) => state.prog.perks.includes(perkId);

function perkObstacle(state, perkId, cityKey) {
  const perk = PERKS[perkId];
  if (!perk) return 'Неизвестный навык';
  if (hasPerk(state, perkId)) return 'Уже изучено';
  if (perk.city && perk.city !== cityKey) return 'Здесь этому не учат';
  if (state.player.level < perk.level) return `Нужен уровень ${perk.level}`;
  if (perk.requires && !hasPerk(state, perk.requires)) return `Сначала изучите «${PERKS[perk.requires].name}»`;
  if (perk.rep && cityReputation(state, cityKey) < perk.rep) return `Нужна репутация в городе: ${perk.rep}`;
  return null;
}

/**
 * Learn a perk from its teacher in `cityKey`.
 * @returns ok({perkId, cost}) or fail(reason)
 */
export function learnPerk(state, perkId, cityKey) {
  syncLearningPoints(state);
  const obstacle = perkObstacle(state, perkId, cityKey);
  if (obstacle) return fail(obstacle);
  const perk = PERKS[perkId];
  const cost = { lp: perk.lp, coins: perk.coins };
  const unpaid = pay(state, cost);
  if (unpaid) return fail(unpaid);
  state.prog.perks.push(perkId);
  if (perk.effects.bagSlots) {
    state.inv.extraSlots += perk.effects.bagSlots;
    emit('inv:changed', { id: null, delta: 0 });
  }
  emit('prog:changed', { kind: 'perk', id: perkId });
  emit('toast', { text: `Изучен навык: ${perk.name}`, kind: 'good' });
  return ok({ perkId, cost });
}

// ── Teacher lists for the UI ─────────────────────────────────────────────────────────────────

function attributeOffers(state, npcRole, cityKey) {
  const offers = [];
  for (const attributeId of ATTRIBUTE_IDS) {
    if (TRAINING.attributeTeachers[attributeId] !== npcRole) continue;
    const value = state.prog.attrs[attributeId];
    const cost = attributeCost(value);
    const locked = attributeObstacle(state, attributeId, cityKey) || payObstacle(state, cost);
    offers.push({
      kind: 'attribute',
      id: attributeId,
      name: ATTRIBUTES[attributeId].name,
      desc: ATTRIBUTES[attributeId].desc,
      value,
      next: value + 1,
      cost,
      locked: locked || undefined,
    });
  }
  return offers;
}

function abilityOffers(state, cityKey) {
  const offers = [];
  for (const ability of abilitiesOf(state.player.classId)) {
    const rank = abilityRank(state, ability.id);
    const next = Math.min(ABILITY_MAX_RANK, rank + 1);
    const cost = abilityCost(ability.id, next);
    const locked = abilityObstacle(state, ability.id, cityKey) || payObstacle(state, cost);
    offers.push({
      kind: 'ability',
      id: ability.id,
      name: ability.name,
      desc: ability.desc,
      slot: ability.slot,
      rank,
      next,
      requiredLevel: rankRequiredLevel(ability.id, next),
      cost,
      locked: locked || undefined,
    });
  }
  return offers;
}

function perkOffers(state, npcRole, cityKey) {
  return perksTaughtBy(npcRole, cityKey).map(perk => {
    const cost = { lp: perk.lp, coins: perk.coins };
    const known = hasPerk(state, perk.id);
    const locked = perkObstacle(state, perk.id, cityKey) || payObstacle(state, cost);
    return {
      kind: 'perk',
      id: perk.id,
      name: perk.name,
      desc: perk.desc,
      known,
      requiredLevel: perk.level,
      cost,
      locked: locked || undefined,
    };
  });
}

/**
 * Everything an NPC of `npcRole` in `cityKey` can teach, with costs and lock reasons.
 * Kinds: 'attribute' | 'ability' | 'perk' | 'profession' | 'second-slot' | 'recipe'.
 * Train with trainAttribute / learnAbility / learnPerk / chooseProfession /
 * buySecondProfessionSlot / learnRecipe accordingly.
 * @returns [{ kind, id, name, desc, cost:{lp, coins}, locked?:reason, … }]
 */
export function availableTraining(state, npcRole, cityKey) {
  syncLearningPoints(state);
  const offers = [...attributeOffers(state, npcRole, cityKey)];
  if (npcRole === 'trainer') offers.push(...abilityOffers(state, cityKey));
  offers.push(...perkOffers(state, npcRole, cityKey));
  if (PROFESSIONS[npcRole]) offers.push(...masterTraining(state, npcRole, cityKey));
  return offers;
}
