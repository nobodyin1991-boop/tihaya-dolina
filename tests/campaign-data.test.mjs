// Data integrity of the campaign layer: npcs, dialogues, quests, caravans, board.
import test from 'node:test';
import assert from 'node:assert/strict';
import '../src/sim/caravan.js'; // pulls in the item catalogs through economy
import { ITEMS } from '../src/data/items.js';
import { CITIES, NPC_ROLES, POIS, REGIONS, LEGS } from '../src/data/world-map.js';
import { NPCS, NPC_LIST, AMBIENT_BARKS, CITIZEN_NAMES, ambientBarks, npcSpot, ROLE_SERVICES } from '../src/data/npcs.js';
import { DIALOGUES } from '../src/data/dialogues.js';
import { QUESTS, QUEST_LIST, MAIN_QUESTS, SIDE_QUESTS } from '../src/data/quests.js';
import { CARAVAN_LEGS, GUILD_POOLS, WAGON_TIERS, WAGON_UPGRADES, MERCS, TRADE_GOODS, LEG_PREP, CARGO_CATEGORIES } from '../src/data/caravans.js';
import { CONTRACT_POOLS, BOUNTIES } from '../src/data/board-data.js';
import { CREATURE_FAMILIES } from '../src/sim/quests.js';

const CREATURES = [
  'rabbit', 'deer', 'sheep', 'goat', 'fox', 'badger', 'boar', 'wolf', 'lynx', 'bear', 'alpha_wolf', 'frost_wolf', 'thorn_boar', 'elk', 'shadow_cat',
  'lizard', 'stoneback', 'ridge_drake', 'marsh_lurker', 'giant_spider', 'spiderling',
  'bandit_thug', 'bandit_archer', 'bandit_brute', 'bandit_scout', 'bandit_looter', 'deserter', 'deserter_crossbow',
  'bandit_chief_kosoy', 'bandit_chief_sotnik', 'bandit_chief_raven', 'guard', 'merc',
];
// ids pinned in CLAUDE.md + the pinned caravan cargo products
const PINNED_ITEMS = [
  'herb', 'rareHerb', 'mountainHerb', 'moonHerb', 'ore', 'richOre', 'copperOre', 'coal', 'cobaltOre', 'mithrilOre', 'wood', 'hardwood',
  'ancientWood', 'ironwood', 'hide', 'fineHide', 'thickHide', 'pristineHide', 'wheat', 'rye', 'saffron', 'flax', 'silkFiber', 'starFlax',
  'stone', 'granite', 'marble', 'basalt', 'meat', 'resin', 'seed',
  'salve', 'bandage', 'tannin', 'glue', 'antidote', 'tonic', 'concentrate', 'fieldkit', 'lunarExtract', 'lunarElixir', 'ingot', 'fastener',
  'steel', 'cobaltSteel', 'mithril', 'plank', 'handle', 'beam', 'ironBeam', 'arrow', 'leather', 'strap', 'reinforcedLeather', 'elderLeather',
  'flour', 'flatbread', 'bread', 'stew', 'ration', 'grainMeal', 'trailMeal', 'feast', 'spicedMeal', 'guildFeast', 'cloth', 'thread', 'canvas',
  'starCloth', 'cutStone', 'mortar', 'stoneBlock', 'milestone', 'foundation', 'basaltBlock', 'waystone', 'fieldnote',
  'honey', 'cheese', 'grainSack', 'lumberBale', 'oreCrate', 'coalSack', 'toolCrate', 'salt', 'amber', 'wine', 'spice', 'fishBarrel', 'silk', 'pearls', 'furBale',
  'toolCrate', 'medicineChest', 'provisionBarrel', 'tentBundle', 'spareWheel', 'harnessSet', 'buildingStone', 'weaponCrate', 'fieldHospital',
  'guildProvisions', 'sailcloth', 'bridgeKit', 'wagonKit',
];
const OPEN_KINDS = ['shop', 'craft', 'train', 'caravan', 'storage', 'board', 'bounties', 'stable', 'guards', 'rest', 'trade'];
const OBJECTIVE_TYPES = ['kill', 'gather', 'craft', 'collect', 'deliver', 'talk', 'visit', 'clearPoi', 'chest', 'caravan', 'trade', 'level', 'rep', 'flag'];
const cityKeys = CITIES.map(city => city.key);
const poiIds = POIS.map(poi => poi.id);
const regionIds = REGIONS.map(region => region.id);

test('every city has all 18 role npcs with full data and a dialogue root', () => {
  for (const city of CITIES) {
    for (const role of NPC_ROLES) {
      const npc = NPCS[`${city.key}:${role}`];
      assert.ok(npc, `${city.key}:${role}`);
      assert.ok(npc.name && npc.title && npc.bio.length > 60, `${npc.id} bio`);
      assert.ok(['m', 'f'].includes(npc.gender) && ['young', 'adult', 'old'].includes(npc.age), `${npc.id} gender/age`);
      assert.ok(npc.look.build && npc.look.palette, `${npc.id} look`);
      assert.ok(npc.barks.length >= 5, `${npc.id} barks`);
      assert.ok(npc.services.length >= 1 && ROLE_SERVICES[role], `${npc.id} service`);
      const tree = DIALOGUES[npc.id];
      assert.ok(tree?.nodes.root && tree.nodes.about && tree.nodes.rumor, `${npc.id} dialogue`);
      assert.ok(tree.nodes.rumor.pool.length >= 2, `${npc.id} rumours`);
      for (let hour = 0; hour < 24; hour++) assert.ok(['work', 'home', 'tavern', 'square', 'gate'].includes(npcSpot(npc.id, hour)));
    }
  }
  const names = NPC_LIST.map(npc => npc.name);
  assert.equal(new Set(names).size, names.length, 'npc names are unique');
});

test('poi npcs and ambient citizens', () => {
  const poiNpcs = NPC_LIST.filter(npc => npc.poiId);
  assert.ok(poiNpcs.length >= 10);
  for (const npc of poiNpcs) {
    assert.ok(poiIds.includes(npc.poiId), npc.id);
    assert.ok(DIALOGUES[npc.id], `${npc.id} dialogue`);
    assert.ok(npc.barks.length >= 5, `${npc.id} barks`);
  }
  for (const key of cityKeys) {
    assert.ok(AMBIENT_BARKS[key].length >= 25, `${key} ambient barks`);
    assert.ok(CITIZEN_NAMES[key].length >= 10);
    for (let stage = 0; stage <= 3; stage++) assert.ok(ambientBarks(key, stage).length >= 15, `${key} stage ${stage}`);
    assert.notDeepEqual(ambientBarks(key, 0), ambientBarks(key, 3));
  }
});

function checkCondition(cond, where) {
  if (!cond) return;
  if (Array.isArray(cond)) return cond.forEach(sub => checkCondition(sub, where));
  for (const sub of cond.any || []) checkCondition(sub, where);
  for (const sub of cond.all || []) checkCondition(sub, where);
  if (cond.not) checkCondition(cond.not, where);
  if (cond.quest) assert.ok(QUESTS[cond.quest], `${where}: quest ${cond.quest}`);
  if (cond.rep) assert.ok(cityKeys.includes(cond.rep[0]), `${where}: rep city`);
  for (const itemId of Object.keys(cond.has || {})) assert.ok(ITEMS[itemId], `${where}: item ${itemId}`);
}

function checkEffects(effects, where) {
  for (const effect of effects || []) {
    if (effect.startQuest) assert.ok(QUESTS[effect.startQuest], `${where}: startQuest`);
    if (effect.turnIn) assert.ok(QUESTS[effect.turnIn], `${where}: turnIn`);
    if (effect.advance) assert.ok(QUESTS[effect.advance], `${where}: advance`);
    for (const itemId of Object.keys({ ...effect.give, ...effect.take })) assert.ok(ITEMS[itemId], `${where}: item ${itemId}`);
    if (effect.rep) assert.ok(cityKeys.includes(effect.rep[0]), `${where}: rep`);
    if (effect.open) assert.ok(OPEN_KINDS.includes(effect.open), `${where}: open ${effect.open}`);
  }
}

test('dialogue trees: every reference resolves', () => {
  for (const [npcId, tree] of Object.entries(DIALOGUES)) {
    assert.ok(NPCS[npcId], npcId);
    for (const node of Object.values(tree.nodes)) {
      assert.ok(node.text || node.variants || node.pool, `${npcId}/${node.id} has text`);
      assert.ok(node.options.length >= 1, `${npcId}/${node.id} has options`);
      for (const variant of [...(node.variants || []), ...(node.pool || [])]) {
        assert.ok(variant.text && variant.text.length > 1, `${npcId}/${node.id} empty line`);
        checkCondition(variant.if, `${npcId}/${node.id}`);
      }
      for (const option of node.options) {
        assert.ok(option.text, `${npcId}/${node.id} option text`);
        if (option.next !== null) assert.ok(tree.nodes[option.next], `${npcId}/${node.id} → ${option.next}`);
        checkCondition(option.if, `${npcId}/${node.id}`);
        checkCondition(option.need, `${npcId}/${node.id}`);
        checkEffects(option.effects, `${npcId}/${node.id}`);
      }
    }
    assert.ok(tree.nodes.root.options.some(option => option.next === null), `${npcId} can say goodbye`);
  }
});

function checkObjective(quest, objective, isLastStage) {
  const where = `${quest.id}: ${objective.text}`;
  assert.ok(OBJECTIVE_TYPES.includes(objective.type), where);
  assert.ok(objective.text && objective.text.length >= 3, `${quest.id} objective text`);
  if (objective.itemId) assert.ok(ITEMS[objective.itemId], `${where} item`);
  if (objective.npcId) assert.ok(NPCS[objective.npcId], `${where} npc`);
  if (objective.poiId) assert.ok(poiIds.includes(objective.poiId), `${where} poi`);
  if (objective.cityKey) assert.ok(cityKeys.includes(objective.cityKey), `${where} city`);
  if (objective.regionId) assert.ok(regionIds.includes(objective.regionId), `${where} region`);
  if (objective.creatureId) assert.ok(CREATURES.includes(objective.creatureId), `${where} creature`);
  if (objective.family) assert.ok(CREATURE_FAMILIES[objective.family], `${where} family`);
  if (objective.type === 'deliver') assert.ok(isLastStage, `${where}: deliver only in the last stage`);
  if (objective.type === 'talk' && objective.topic) assert.ok(objective.reply?.length > 20, `${where}: reply`);
  if (objective.type === 'caravan') assert.ok(['manifest-full', 'launched', 'arrived', 'event-cleared'].includes(objective.event), where);
  if (objective.type === 'flag') assert.ok(objective.flag || objective.any?.length, where);
  checkCondition(objective.topicIf, where);
}

test('quests: counts, references, texts', () => {
  assert.ok(MAIN_QUESTS.length >= 22, `main quests: ${MAIN_QUESTS.length}`);
  assert.ok(SIDE_QUESTS.length >= 30, `side quests: ${SIDE_QUESTS.length}`);
  for (const key of cityKeys) {
    const inCity = SIDE_QUESTS.filter(quest => quest.giver.startsWith(`${key}:`));
    assert.ok(inCity.length >= 8, `${key} side quests: ${inCity.length}`);
  }
  assert.ok(SIDE_QUESTS.filter(quest => NPCS[quest.giver].poiId).length >= 6, 'poi side quests');

  for (const quest of QUEST_LIST) {
    assert.ok(quest.title && quest.desc.length > 30, `${quest.id} title/desc`);
    assert.ok(cityKeys.includes(quest.cityKey), `${quest.id} city`);
    assert.ok(NPCS[quest.giver], `${quest.id} giver`);
    assert.ok(NPCS[quest.turnIn || quest.giver], `${quest.id} turnIn`);
    for (const required of quest.requires?.quests || []) assert.ok(QUESTS[required], `${quest.id} requires ${required}`);
    assert.ok(quest.stages.length >= 1);
    quest.stages.forEach((stage, index) => {
      assert.ok(stage.text.length > 10, `${quest.id} stage text`);
      assert.ok(stage.objectives.length >= 1);
      for (const objective of stage.objectives) checkObjective(quest, objective, index === quest.stages.length - 1);
      checkEffects(stage.onDone, `${quest.id} onDone`);
    });
    checkEffects(quest.onStart, `${quest.id} onStart`);
    checkEffects(quest.onComplete, `${quest.id} onComplete`);
    for (const itemId of Object.keys(quest.rewards?.items || {})) assert.ok(ITEMS[itemId], `${quest.id} reward ${itemId}`);
    for (const key of Object.keys(quest.rewards?.rep || {})) assert.ok(cityKeys.includes(key), `${quest.id} reward rep`);
    for (const itemId of quest.takeOnDone || []) assert.equal(ITEMS[itemId]?.type, 'quest', `${quest.id} takeOnDone`);
    if (!quest.auto) assert.ok(quest.talk?.ask && quest.talk.offer?.length > 40 && quest.talk.accept, `${quest.id} offer lines`);
    if (!quest.autoComplete) assert.ok(quest.talk?.done?.length > 20, `${quest.id} done line`);
  }
});

test('quests: every quest is reachable through its prerequisites', () => {
  const reachable = new Set();
  for (let pass = 0; pass < QUEST_LIST.length; pass++) {
    for (const quest of QUEST_LIST) {
      if ((quest.requires?.quests || []).every(id => reachable.has(id))) reachable.add(quest.id);
    }
  }
  assert.deepEqual(QUEST_LIST.filter(quest => !reachable.has(quest.id)).map(quest => quest.id), []);
  // every story flag an objective waits for can be set by a dialogue option or by clearing a poi
  const settable = new Set();
  for (const tree of Object.values(DIALOGUES)) {
    for (const node of Object.values(tree.nodes)) {
      for (const option of node.options) for (const effect of option.effects || []) if (effect.flag) settable.add([].concat(effect.flag)[0]);
    }
  }
  for (const quest of QUEST_LIST) {
    for (const stage of quest.stages) {
      for (const objective of stage.objectives.filter(entry => entry.type === 'flag')) {
        for (const flag of objective.any || [objective.flag]) {
          assert.ok(flag.startsWith('poi:') ? poiIds.includes(flag.slice(4)) : settable.has(flag), `${quest.id}: flag ${flag} is never set`);
        }
      }
    }
  }
});

function checkSteps(steps, where) {
  assert.ok(steps.length >= 1, where);
  for (const step of steps) {
    assert.ok(step.spawn || step.obstacle, where);
    for (const group of [...(step.spawn || []), ...(step.nightExtra || [])]) {
      assert.ok(CREATURES.includes(group.creatureId), `${where}: ${group.creatureId}`);
      assert.ok(['left', 'right', 'front', 'rear'].includes(group.side), `${where}: side`);
      assert.ok(['attacker', 'looter', 'boss'].includes(group.role), `${where}: role`);
    }
    if (step.obstacle) {
      assert.ok(['fallen-tree', 'rockslide', 'broken-bridge', 'mud', 'barricade', 'wheel-break'].includes(step.obstacle.kind), `${where}: kind`);
      for (const itemId of Object.keys(step.obstacle.needs || {})) assert.ok(PINNED_ITEMS.includes(itemId), `${where}: needs ${itemId}`);
    }
  }
}

test('caravans: manifests use pinned items, events are well-formed', () => {
  assert.equal(CARAVAN_LEGS.length, LEGS.length);
  const eventCounts = [4, 6, 8];
  let previousEffort = 0;
  CARAVAN_LEGS.forEach((leg, index) => {
    assert.equal(leg.leg, index);
    for (const line of leg.manifest) {
      assert.ok(PINNED_ITEMS.includes(line.itemId), `leg ${index}: ${line.itemId} is not pinned`);
      assert.ok(ITEMS[line.itemId], `leg ${index}: ${line.itemId} is not registered`);
      assert.ok(CARGO_CATEGORIES[line.category], `leg ${index}: category`);
      assert.ok(line.count > 0 && line.advance > 0);
    }
    assert.equal(new Set(leg.manifest.map(line => line.itemId)).size, leg.manifest.length, 'no duplicate lines');
    const effort = leg.manifest.reduce((sum, line) => sum + line.count * (ITEMS[line.itemId].value || 1), 0);
    assert.ok(effort > previousEffort * 1.5, `leg ${index} must be clearly harder to prepare (${effort} vs ${previousEffort})`);
    previousEffort = effort;
    assert.equal(leg.events.length, eventCounts[index]);
    let lastAt = 0;
    for (const event of leg.events) {
      assert.ok(event.at > lastAt && event.at < 1, `${event.id} order`);
      lastAt = event.at;
      assert.ok(event.title && event.hint, event.id);
      checkSteps(event.steps, event.id);
      for (const variant of event.variants || []) checkSteps(variant.steps, `${event.id} variant`);
      for (const replacement of event.replaceIf || []) checkSteps(replacement.steps, `${event.id} replacement`);
    }
    assert.ok(leg.banter.length >= 5);
    assert.ok(LEG_PREP[index].length >= 2);
    assert.equal(MERCS[CITIES[LEGS[index].from].key].length, 4);
    for (const entry of GUILD_POOLS[index]) assert.ok(PINNED_ITEMS.includes(entry[0]) && ITEMS[entry[0]], `guild pool ${entry[0]}`);
  });
  for (const itemId of TRADE_GOODS) assert.equal(ITEMS[itemId]?.type, 'trade', itemId);
  assert.equal(WAGON_TIERS.length, 3);
  assert.ok(WAGON_UPGRADES.length >= 5);
});

test('board data is valid', () => {
  for (const key of cityKeys) {
    assert.ok(CONTRACT_POOLS[key].length >= 10);
    for (const entry of CONTRACT_POOLS[key]) assert.ok(ITEMS[entry.itemId], `${key}: ${entry.itemId}`);
    assert.ok(BOUNTIES.filter(bounty => bounty.cityKey === key).length >= 5);
  }
  for (const bounty of BOUNTIES) {
    const target = bounty.target;
    assert.ok(target.creatureId ? CREATURES.includes(target.creatureId) : CREATURE_FAMILIES[target.family], bounty.id);
    if (target.regionId) assert.ok(regionIds.includes(target.regionId), bounty.id);
    if (target.poiId) assert.ok(poiIds.includes(target.poiId), bounty.id);
    assert.ok(bounty.text.length > 30 && bounty.goal, bounty.id);
  }
});
