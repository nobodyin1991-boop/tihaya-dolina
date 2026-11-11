// Gathering: resource nodes, gathering skills, tools, skinning. Pure.
// Slice `gather`: { xp: { herbalism, mining, logging, skinning, farming, fiber, stonecutting } }
// Skills grow by use for every hero, whatever the profession.
import '../data/items-catalog.js';
import { registerSlice, ok, fail } from './state.js';
import { emit } from '../core/events.js';
import { ITEMS, itemName } from '../data/items.js';
import { GATHER_SKILLS, GATHER_SKILL_IDS, gatherProgress } from '../data/professions.js';
import { REGIONS } from '../data/world-map.js';
import { addItem, countItem, roomFor } from './inventory.js';
import { derivedStats } from './stats.js';
import { skinYield } from './loot.js';

export const GATHER_RULES = {
  timeByTier: [2.5, 3.5, 4.5, 6],          // seconds per node tier 1..4
  respawnByTier: [120, 240, 420, 720],     // seconds
  xpBase: 5,
  xpPerTier: 5,
  trivialGap: 6,                           // skill this far above the requirement → reduced xp
  trivialXpFactor: 0.4,
  doubleChance: 0.35,                      // chance of a second unit
  expertGap: 3,                            // skill this far above the requirement → extra unit chance
  expertChance: 0.25,
  skinSkillByTier: [1, 4, 8, 12],
};

const node = (skill, tier, requiredSkill, minLevel, biomes, bonus = []) => ({ skill, tier, requiredSkill, minLevel, biomes, bonus });

/**
 * Compact node rows; name, gatherTime, respawnSeconds and toolBonus are filled in below.
 * `minLevel` — the node appears in regions whose top creature level is at least this.
 * `bonus` — side products: [itemId, chance].
 */
const NODE_ROWS = {
  herb: node('herbalism', 1, 1, 1, ['meadow', 'farmland', 'forest']),
  rareHerb: node('herbalism', 2, 4, 3, ['forest', 'darkforest', 'highland']),
  mountainHerb: node('herbalism', 3, 8, 7, ['mountain', 'highland', 'heath']),
  moonHerb: node('herbalism', 4, 12, 11, ['swamp', 'darkforest']),

  ore: node('mining', 1, 1, 1, ['forest', 'highland'], [['roughGem', 0.01]]),
  copperOre: node('mining', 2, 3, 4, ['highland', 'mountain']),
  coal: node('mining', 2, 4, 4, ['highland', 'mountain']),
  richOre: node('mining', 2, 5, 6, ['highland', 'mountain'], [['roughGem', 0.03]]),
  cobaltOre: node('mining', 3, 8, 10, ['steppe', 'mountain'], [['roughGem', 0.05]]),
  mithrilOre: node('mining', 4, 12, 12, ['snow', 'mountain'], [['roughGem', 0.08]]),

  wood: node('logging', 1, 1, 1, ['forest', 'meadow', 'farmland'], [['resin', 0.25]]),
  hardwood: node('logging', 2, 4, 3, ['forest', 'darkforest'], [['resin', 0.35]]),
  ancientWood: node('logging', 3, 8, 7, ['darkforest', 'mountain'], [['resin', 0.5]]),
  ironwood: node('logging', 4, 12, 13, ['darkforest', 'swamp'], [['resin', 0.5]]),

  wheat: node('farming', 1, 1, 1, ['farmland', 'meadow'], [['seed', 0.4]]),
  rye: node('farming', 2, 4, 3, ['farmland', 'meadow', 'highland']),
  saffron: node('farming', 3, 8, 9, ['steppe', 'heath', 'coast']),

  flax: node('fiber', 1, 1, 1, ['meadow', 'farmland']),
  silkFiber: node('fiber', 2, 5, 4, ['meadow', 'steppe', 'coast']),
  starFlax: node('fiber', 4, 12, 12, ['heath', 'lake', 'highland']),

  stone: node('stonecutting', 1, 1, 1, ['meadow', 'farmland', 'forest', 'highland']),
  granite: node('stonecutting', 2, 4, 4, ['highland', 'mountain']),
  marble: node('stonecutting', 3, 8, 8, ['mountain', 'coast'], [['roughGem', 0.04]]),
  basalt: node('stonecutting', 4, 12, 11, ['steppe', 'mountain'], [['roughGem', 0.06]]),
};

function buildNodeTypes() {
  const types = {};
  for (const [nodeType, row] of Object.entries(NODE_ROWS)) {
    types[nodeType] = {
      id: nodeType,
      name: itemName(nodeType),
      skill: row.skill,
      requiredSkill: row.requiredSkill,
      tier: row.tier,
      gatherTime: GATHER_RULES.timeByTier[row.tier - 1],
      respawnSeconds: GATHER_RULES.respawnByTier[row.tier - 1],
      biomes: row.biomes,
      minLevel: row.minLevel,
      toolBonus: Math.max(0, row.tier - 1),   // tool tier required (0 = bare hands will do)
      bonus: row.bonus,
    };
  }
  return types;
}

/**
 * NODE_TYPES[nodeType] = { id, name, skill, requiredSkill, tier, gatherTime, respawnSeconds,
 *                          biomes, minLevel, toolBonus (required tool tier), bonus }
 */
export const NODE_TYPES = buildNodeTypes();

registerSlice('gather', {
  init: () => ({ xp: Object.fromEntries(GATHER_SKILL_IDS.map(skill => [skill, 0])) }),
  migrate(slice) {
    if (!slice.xp || typeof slice.xp !== 'object') throw new Error('Повреждены навыки сбора');
    for (const skill of GATHER_SKILL_IDS) {
      if (!Number.isFinite(slice.xp[skill]) || slice.xp[skill] < 0) slice.xp[skill] = 0;
    }
    return slice;
  },
});

/** Node types that grow in a region (biome fits and the region is dangerous enough). */
export function nodeTypesForRegion(region) {
  return Object.values(NODE_TYPES)
    .filter(type => type.biomes.includes(region.biome) && region.level[1] >= type.minLevel)
    .map(type => type.id);
}

/** Regions where a node type can be found. */
export const regionsForNode = nodeType => REGIONS.filter(region => nodeTypesForRegion(region).includes(nodeType));

/** {level, current, required} of a gathering skill. */
export const gatherSkillInfo = (state, skill) => gatherProgress(state.gather.xp[skill] || 0);

/** Level 1..15 of a gathering skill. */
export const gatherLevel = (state, skill) => gatherSkillInfo(state, skill).level;

/** Best tool for a skill among the bag and the tool slot: {id, tier, speed} or null. */
export function bestTool(state, skill) {
  let best = null;
  const candidates = [...Object.keys(state.inv.items), state.inv.equip.tool];
  for (const itemId of candidates) {
    const tool = ITEMS[itemId]?.tool;
    if (!tool || !tool.skills.includes(skill)) continue;
    if (itemId !== state.inv.equip.tool && countItem(state, itemId) <= 0) continue;
    if (!best || tool.tier > best.tier) best = { id: itemId, tier: tool.tier, speed: tool.speed };
  }
  return best;
}

function addGatherXp(state, skill, amount) {
  const before = gatherLevel(state, skill);
  state.gather.xp[skill] = (state.gather.xp[skill] || 0) + amount;
  const after = gatherLevel(state, skill);
  if (after > before) {
    emit('toast', { text: `${GATHER_SKILLS[skill].name}: уровень ${after}`, kind: 'good' });
  }
  return after > before;
}

function toolFailure(skill, requiredTier) {
  const names = { herbalism: 'серп', farming: 'серп', fiber: 'серп', mining: 'кирка', stonecutting: 'кирка', logging: 'топор', skinning: 'нож' };
  const grade = ['', 'инструмент: ', 'стальной инструмент: ', 'инструмент мастера: '][requiredTier] || 'инструмент: ';
  return fail(`Нужен ${grade}${names[skill]}`);
}

function gatherCheck(state, skill, tier, requiredSkill) {
  const level = gatherLevel(state, skill);
  if (level < requiredSkill) {
    return fail(`Нужен навык «${GATHER_SKILLS[skill].name}» ${requiredSkill} (сейчас ${level})`);
  }
  const requiredTool = Math.max(0, tier - 1);
  const tool = bestTool(state, skill);
  if (requiredTool > 0 && (!tool || tool.tier < requiredTool)) return toolFailure(skill, requiredTool);
  return ok({ level, tool });
}

/**
 * Can the hero work this node? ok({time}) with the gathering time in seconds, or fail(reason).
 */
export function canGather(state, nodeType) {
  const type = NODE_TYPES[nodeType];
  if (!type) return fail('Здесь нечего собирать');
  const check = gatherCheck(state, type.skill, type.tier, type.requiredSkill);
  if (!check.ok) return check;
  if (roomFor(state, nodeType) < 1) return fail('Сумка заполнена');
  const speed = derivedStats(state).gatherSpeed * (1 + (check.tool?.speed || 0));
  return ok({ time: Math.round((type.gatherTime / speed) * 10) / 10, skill: type.skill });
}

function rollCount(state, skill, requiredSkill, level, rng) {
  const rules = GATHER_RULES;
  let count = 1;
  if (rng() < rules.doubleChance) count += 1;
  if (level - requiredSkill >= rules.expertGap && rng() < rules.expertChance) count += 1;
  const perkChance = derivedStats(state).gatherYield[skill] || 0;
  if (perkChance > 0 && rng() < perkChance) count += 1;
  return count;
}

function gatherXpFor(tier, level, requiredSkill) {
  const rules = GATHER_RULES;
  const xp = rules.xpBase + rules.xpPerTier * tier;
  return level - requiredSkill >= rules.trivialGap ? Math.max(1, Math.round(xp * rules.trivialXpFactor)) : xp;
}

/**
 * Harvest a node (call when the gathering timer completes).
 * @returns ok({itemId, count, xp, bonus:[{itemId, count}], skill, leveledUp}) or fail(reason)
 */
export function gatherNode(state, nodeType, rng = Math.random) {
  const type = NODE_TYPES[nodeType];
  if (!type) return fail('Здесь нечего собирать');
  const check = gatherCheck(state, type.skill, type.tier, type.requiredSkill);
  if (!check.ok) return check;
  if (roomFor(state, nodeType) < 1) return fail('Сумка заполнена');

  const wanted = rollCount(state, type.skill, type.requiredSkill, check.level, rng);
  const count = addItem(state, nodeType, wanted);
  const bonus = [];
  for (const [bonusId, chance] of type.bonus) {
    if (rng() < chance && addItem(state, bonusId, 1) === 1) bonus.push({ itemId: bonusId, count: 1 });
  }
  const xp = gatherXpFor(type.tier, check.level, type.requiredSkill);
  const leveledUp = addGatherXp(state, type.skill, xp);
  return ok({ itemId: nodeType, count, xp, bonus, skill: type.skill, leveledUp });
}

/**
 * Skin a carcass. Small hides need no tool; better hides need a knife of matching grade.
 * @returns ok({itemId, count, xp, bonus:[], skill:'skinning', leveledUp}) or fail(reason)
 */
export function skinCorpse(state, creatureId, level, rng = Math.random) {
  const yieldInfo = skinYield(creatureId, level, rng);
  if (!yieldInfo) return fail('С этой туши нечего снять');
  const requiredSkill = GATHER_RULES.skinSkillByTier[yieldInfo.tier - 1];
  const check = gatherCheck(state, 'skinning', yieldInfo.tier, requiredSkill);
  if (!check.ok) return check;
  if (roomFor(state, yieldInfo.itemId) < 1) return fail('Сумка заполнена');

  let wanted = yieldInfo.count;
  const perkChance = derivedStats(state).gatherYield.skinning || 0;
  if (perkChance > 0 && rng() < perkChance) wanted += 1;
  const count = addItem(state, yieldInfo.itemId, wanted);
  const xp = gatherXpFor(yieldInfo.tier, check.level, requiredSkill);
  const leveledUp = addGatherXp(state, 'skinning', xp);
  return ok({ itemId: yieldInfo.itemId, count, xp, bonus: [], skill: 'skinning', leveledUp });
}
