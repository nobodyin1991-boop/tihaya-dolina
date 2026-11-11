// Catalog integrity: items, recipes, classes, creatures, nodes, shops, perks.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ITEMS } from '../src/data/items.js';
import { CARGO_GOOD_IDS, TRADE_GOOD_IDS, UNIQUE_GEAR_IDS } from '../src/data/items-catalog.js';
import { RECIPES, RECIPE_LIST, noteIdFor } from '../src/data/recipes.js';
import { PROFESSIONS, GATHER_SKILLS } from '../src/data/professions.js';
import { CLASSES, ABILITIES, abilitiesOf, resolveAbility, rankRequiredLevel } from '../src/data/classes.js';
import { CREATURES, creaturesForRegion } from '../src/data/creatures.js';
import { PERKS } from '../src/data/perks.js';
import { SHOPS, CITY_KEYS, SHOP_ROLES, cityMultiplier } from '../src/data/economy.js';
import { REGIONS, NPC_ROLES, POIS } from '../src/data/world-map.js';
import { WEAPON_LINES, WEAPON_TIER_LEVEL, ARMOR_SETS } from '../src/data/items-gear.js';
import { NODE_TYPES, nodeTypesForRegion, regionsForNode } from '../src/sim/gathering.js';
import { creatureStats } from '../src/sim/combat.js';
import { STARTER_KITS } from '../src/sim/equipment.js';

const list = text => text.split(',').map(part => part.trim()).filter(Boolean);

const ICONS = new Set(list(`herb, flower, ore, coal, ingot, wood, plank, beam, hide, leather, grain, flour, bread, meal, meat,
  potion, salve, bandage, kit, fiber, cloth, thread, stone, block, sword, greatsword, dagger, blades, bow, crossbow,
  device, shield, armor, helmet, gloves, boots, cloak, bag, tool, note, key, coin, gem, amber, crate, barrel, fur, fish,
  salt, wine, spice, trophy, arrow, part`));
const RARITIES = new Set(['common', 'fine', 'rare', 'epic', 'legendary']);
const TYPES = new Set(['material', 'consumable', 'weapon', 'armor', 'tool', 'bag', 'trade', 'quest', 'note']);

const OLD_RAW = list(`herb, rareHerb, mountainHerb, moonHerb, ore, richOre, copperOre, coal, cobaltOre, mithrilOre, wood, hardwood,
  ancientWood, ironwood, hide, fineHide, thickHide, pristineHide, wheat, rye, saffron, flax, silkFiber, starFlax, stone,
  granite, marble, basalt, meat, resin, seed`);
const OLD_PRODUCTS = list(`salve, bandage, tannin, glue, antidote, tonic, concentrate, fieldkit, lunarExtract, lunarElixir, ingot,
  fastener, steel, cobaltSteel, mithril, plank, handle, beam, ironBeam, arrow, leather, strap, reinforcedLeather,
  elderLeather, flour, flatbread, bread, stew, ration, grainMeal, trailMeal, feast, spicedMeal, guildFeast, cloth, thread,
  canvas, starCloth, cutStone, mortar, stoneBlock, milestone, foundation, basaltBlock, waystone, fieldnote`);
const OLD_CRAFTED_GEAR = list(`sword, steelBlade, masterBlade, mithrilBlade, bow, longbow, masterBow, ironwoodBow, knife, axe,
  shield, vest, gloves, rangerArmor, caravanArmor, paddedCoat, fieldCoat, starMantle, bag, expeditionBag`);
const OLD_SHOP_GEAR = list(`trainingBlade, veteranBlade, frontierBlade, paddedVest, mailCoat, veteranCoat, frontierCoat, leatherCap,
  ironHelm, steelHelm, walkingBoots, rangerBoots, veteranBoots`);
const TRADE_GOODS = list(`honey, cheese, grainSack, lumberBale, oreCrate, coalSack, toolCrate, salt, amber, wine, spice, fishBarrel,
  silk, pearls, furBale`);
const CARGO = list(`toolCrate, medicineChest, provisionBarrel, tentBundle, spareWheel, harnessSet, buildingStone, weaponCrate,
  fieldHospital, guildProvisions, sailcloth, bridgeKit, wagonKit`);
const NODES = list(`herb, rareHerb, mountainHerb, moonHerb, ore, richOre, copperOre, coal, cobaltOre, mithrilOre, wood, hardwood,
  ancientWood, ironwood, wheat, rye, saffron, flax, silkFiber, starFlax, stone, granite, marble, basalt`);
const MODEL_OF = {
  quadruped: list('rabbit, deer, sheep, goat, fox, badger, boar, wolf, lynx, bear, alpha_wolf, frost_wolf, thorn_boar, elk, shadow_cat'),
  lizard: list('lizard, stoneback, ridge_drake, marsh_lurker'),
  spider: list('giant_spider, spiderling'),
  humanoid: list(`bandit_thug, bandit_archer, bandit_brute, bandit_scout, bandit_looter, deserter, deserter_crossbow,
    bandit_chief_kosoy, bandit_chief_sotnik, bandit_chief_raven, guard, merc`),
};
const CREATURE_IDS = Object.values(MODEL_OF).flat();
const CLASS_IDS = ['warrior', 'guardian', 'scientist', 'duelist', 'archer', 'medic', 'engineer'];
const PROFESSION_IDS = ['apothecary', 'smith', 'carpenter', 'leatherworker', 'farmer', 'tailor', 'mason'];

test('every item is well formed', () => {
  const all = Object.values(ITEMS);
  assert.ok(all.length >= 230, `only ${all.length} items`);
  for (const def of all) {
    assert.ok(typeof def.name === 'string' && /[а-яё]/i.test(def.name), `${def.id}: russian name`);
    assert.ok(typeof def.desc === 'string' && def.desc.length > 5, `${def.id}: desc`);
    assert.ok(ICONS.has(def.icon), `${def.id}: icon ${def.icon}`);
    assert.ok(RARITIES.has(def.rarity), `${def.id}: rarity ${def.rarity}`);
    assert.ok(TYPES.has(def.type), `${def.id}: type ${def.type}`);
    assert.ok(Number.isFinite(def.value) && def.value >= 1, `${def.id}: value ${def.value}`);
    assert.ok(Number.isInteger(def.tier) && def.tier >= 1 && def.tier <= 6, `${def.id}: tier ${def.tier}`);
  }
});

test('all pinned item ids exist with the right types', () => {
  for (const id of [...OLD_RAW, ...OLD_PRODUCTS, ...OLD_CRAFTED_GEAR, ...OLD_SHOP_GEAR, ...TRADE_GOODS, ...CARGO, 'torch']) {
    assert.ok(ITEMS[id], `missing item ${id}`);
  }
  for (const id of TRADE_GOODS) assert.equal(ITEMS[id].type, 'trade', id);
  for (const id of CARGO) assert.ok(['material', 'trade'].includes(ITEMS[id].type), id);
  assert.deepEqual([...CARGO_GOOD_IDS].sort(), [...CARGO].sort());
  assert.deepEqual([...TRADE_GOOD_IDS].sort(), [...TRADE_GOODS].sort());
});

test('weapon lines: 7 classes × 6 tiers, uniques, class restrictions', () => {
  assert.equal(WEAPON_LINES.length, 7);
  const kinds = new Set(['greatsword', 'sword', 'blades', 'bow', 'crossbow', 'device', 'medkit']);
  for (const line of WEAPON_LINES) {
    assert.equal(line.rows.length, 6);
    assert.equal(CLASSES[line.classId].weaponKind, line.weaponKind);
    line.rows.forEach(([id], index) => {
      const def = ITEMS[id];
      assert.equal(def.type, 'weapon');
      assert.equal(def.requiredLevel, WEAPON_TIER_LEVEL[index]);
      assert.deepEqual(def.classes, [line.classId]);
      assert.ok(kinds.has(def.weaponKind));
    });
  }
  const uniqueWeapons = UNIQUE_GEAR_IDS.filter(id => ITEMS[id].type === 'weapon');
  assert.ok(uniqueWeapons.length >= 8, `unique weapons: ${uniqueWeapons.length}`);
  for (const id of UNIQUE_GEAR_IDS) assert.ok(['rare', 'epic', 'legendary'].includes(ITEMS[id].rarity), id);
});

test('armour: 3 weights × 5 tiers × 4 slots, shields are guardian-only', () => {
  assert.equal(ARMOR_SETS.length, 15);
  for (const set of ARMOR_SETS) {
    for (const slot of ['armor', 'helmet', 'gloves', 'boots']) {
      const def = ITEMS[set.ids[slot]];
      assert.equal(def.slot, slot);
      assert.equal(def.weight, set.weight);
      assert.ok(def.armor >= 1);
    }
  }
  const shields = Object.values(ITEMS).filter(def => def.slot === 'offhand');
  assert.ok(shields.length >= 5);
  for (const def of shields) assert.deepEqual(def.classes, ['guardian']);
  assert.ok(Object.values(ITEMS).filter(def => def.type === 'bag').every(def => def.slots > 0));
  for (const def of Object.values(ITEMS).filter(item => item.type === 'consumable')) {
    assert.ok(['food', 'medicine', 'gear'].includes(def.cooldownGroup), def.id);
    assert.ok(def.use, def.id);
  }
});

test('recipes reference existing items and are sane', () => {
  assert.ok(RECIPE_LIST.length >= 120, `only ${RECIPE_LIST.length} recipes`);
  for (const recipe of RECIPE_LIST) {
    assert.ok(PROFESSIONS[recipe.profession], recipe.id);
    assert.ok(ITEMS[recipe.output], `${recipe.id}: output`);
    assert.ok(recipe.level >= 1 && recipe.level <= 15, recipe.id);
    assert.ok(recipe.count >= 1 && recipe.xp > 0 && recipe.time > 0, recipe.id);
    assert.ok(['start', 'trainer', 'note'].includes(recipe.learn), recipe.id);
    assert.ok(Object.keys(recipe.inputs).length >= 1, recipe.id);
    let inputValue = 0;
    for (const [id, amount] of Object.entries(recipe.inputs)) {
      assert.ok(ITEMS[id], `${recipe.id}: input ${id}`);
      assert.ok(amount >= 1);
      inputValue += ITEMS[id].value * amount;
    }
    assert.ok(ITEMS[recipe.output].value * recipe.count >= inputValue, `${recipe.id}: product cheaper than inputs`);
    if (recipe.learn === 'note') assert.equal(ITEMS[noteIdFor(recipe.id)].teaches, recipe.id);
    if (recipe.learn === 'start') assert.equal(recipe.level, 1, recipe.id);
  }
  for (const id of PROFESSION_IDS) {
    const own = RECIPE_LIST.filter(recipe => recipe.profession === id);
    assert.ok(own.length >= 12, `${id}: ${own.length} recipes`);
    assert.ok(own.some(recipe => recipe.learn === 'start'), `${id}: start recipe`);
    assert.ok(own.some(recipe => recipe.level === 15), `${id}: level 15 recipe`);
    assert.ok(own.some(recipe => CARGO.includes(recipe.output)), `${id}: cargo recipe`);
    assert.ok(GATHER_SKILLS[PROFESSIONS[id].gatherSkill]);
  }
  const craftedOld = OLD_PRODUCTS.filter(product => product !== 'fieldnote');
  for (const id of [...craftedOld, ...CARGO, ...OLD_CRAFTED_GEAR]) assert.ok(RECIPES[id], `no recipe for ${id}`);
});

test('classes have 5 abilities × 5 ranks with valid vocabulary', () => {
  const shapes = new Set(['melee-arc', 'melee-single', 'projectile', 'aoe-self', 'aoe-target', 'chain', 'self-buff', 'dash', 'leap-back', 'heal-self', 'companion']);
  const effects = new Set(['stun', 'slow', 'burn', 'bleed', 'poison', 'buff', 'shield', 'heal', 'hot', 'taunt', 'knockback', 'mark', 'weaken']);
  const anims = new Set(['attack', 'cast', 'shoot', 'block']);
  const sounds = new Set(['sword', 'bow', 'fire', 'ice', 'spark', 'heal', 'shield', 'impact']);
  assert.deepEqual(Object.keys(CLASSES).sort(), [...CLASS_IDS].sort());
  assert.equal(Object.keys(ABILITIES).length, 35);
  for (const classId of CLASS_IDS) {
    const cls = CLASSES[classId];
    assert.ok(cls.basicAttack.range > 0 && cls.basicAttack.interval > 0 && shapes.has(cls.basicAttack.shape));
    const abilities = abilitiesOf(classId);
    assert.equal(abilities.length, 5);
    abilities.forEach((ability, index) => {
      assert.equal(ability.slot, index + 1);
      assert.equal(ability.classId, classId);
      assert.equal(ability.ranks.length, 5);
      assert.ok(shapes.has(ability.shape), ability.id);
      assert.ok(anims.has(ability.fx.anim) && sounds.has(ability.fx.sound) && Number.isInteger(ability.fx.color), ability.id);
      assert.ok(ability.cooldown > 0 && ability.staminaCost > 0 && ability.name && ability.desc);
      for (const effect of ability.effects) assert.ok(effects.has(effect.type), `${ability.id}: ${effect.type}`);
      for (let rank = 1; rank < 5; rank++) {
        assert.ok(ability.ranks[rank].power >= ability.ranks[rank - 1].power, `${ability.id}: power grows`);
      }
      assert.ok(rankRequiredLevel(ability.id, 5) <= 20, `${ability.id}: rank 5 reachable`);
      for (const key of Object.keys(ability.ranks[0])) {
        const match = /^(.*)(Duration|Value)$/.exec(key);
        if (match) assert.ok(ability.effects.some(effect => (effect.key || effect.type) === match[1]), `${ability.id}: rank key ${key}`);
      }
    });
    assert.equal(abilities[3].requiredLevel, 6);
    assert.equal(abilities[4].requiredLevel, 12);
    assert.ok(STARTER_KITS[classId].equip.every(id => ITEMS[id]));
  }
  const crush = resolveAbility('crush', 5);
  assert.equal(crush.effects[0].duration, 3);
  assert.equal(crush.power, 3.4);
});

test('all pinned creatures are defined with loot that exists', () => {
  assert.deepEqual(Object.keys(CREATURES).sort(), [...CREATURE_IDS].sort());
  for (const [model, ids] of Object.entries(MODEL_OF)) {
    for (const id of ids) assert.equal(CREATURES[id].model, model, id);
  }
  for (const def of Object.values(CREATURES)) {
    for (const key of ['baseHp', 'baseDamage', 'armor', 'speed', 'attackRange', 'attackInterval', 'aggroRadius', 'leashRadius', 'xp', 'scale']) {
      assert.ok(Number.isFinite(def[key]), `${def.id}.${key}`);
    }
    assert.ok(['beast', 'monster', 'bandit', 'guard'].includes(def.family), def.id);
    assert.ok(def.levelRange[0] <= def.levelRange[1] && def.packSize[0] <= def.packSize[1], def.id);
    for (const [itemId, chance] of def.loot.items) {
      assert.ok(ITEMS[itemId], `${def.id}: loot ${itemId}`);
      assert.ok(chance > 0 && chance <= 1);
    }
    if (def.loot.skin) assert.ok(ITEMS[def.loot.skin.item], def.id);
    for (const id of def.loot.uniques || []) assert.ok(ITEMS[id]?.unique, `${def.id}: unique ${id}`);
    for (const ability of def.abilities || []) {
      assert.ok(['charge', 'poison', 'web', 'howl', 'heavy', 'volley', 'steal'].includes(ability.type), def.id);
      if (ability.summon) assert.ok(CREATURES[ability.summon], def.id);
    }
  }
  const dropped = new Set(Object.values(CREATURES).flatMap(def => def.loot.uniques || []));
  for (const id of UNIQUE_GEAR_IDS) assert.ok(dropped.has(id), `unique ${id} drops nowhere`);
  for (const boss of ['bandit_chief_kosoy', 'bandit_chief_sotnik', 'bandit_chief_raven']) {
    const def = CREATURES[boss];
    assert.ok(def.boss && def.abilities.length >= 2 && def.loot.uniques.length >= 2, boss);
    const level = def.levelRange[0];
    const ratio = creatureStats(boss, level).hp / creatureStats('bandit_thug', level).hp;
    assert.ok(ratio >= 6 && ratio <= 10, `${boss}: ${ratio.toFixed(1)}× a thug`);
  }
  for (const poi of POIS) {
    if (poi.boss) assert.ok(CREATURES[poi.boss], poi.id);
    if (poi.creature) assert.ok(CREATURES[poi.creature], poi.id);
  }
  assert.ok(CREATURES.bandit_archer.ranged && CREATURES.deserter_crossbow.ranged);
  assert.ok(CREATURES.bandit_looter.abilities.some(ability => ability.type === 'steal'));
  assert.ok(CREATURES.bandit_brute.abilities.some(ability => ability.type === 'heavy' && ability.knockback > 0));
  assert.ok(CREATURES.bandit_scout.speed > CREATURES.bandit_thug.speed && CREATURES.bandit_brute.speed < CREATURES.bandit_thug.speed);
});

test('every region has wildlife and resources; node types are complete', () => {
  assert.deepEqual(Object.keys(NODE_TYPES).sort(), [...NODES].sort());
  const biomes = new Set(REGIONS.map(region => region.biome));
  for (const type of Object.values(NODE_TYPES)) {
    assert.ok(ITEMS[type.id], type.id);
    assert.ok(GATHER_SKILLS[type.skill], type.id);
    assert.ok(type.requiredSkill >= 1 && type.requiredSkill <= 15 && type.gatherTime > 0 && type.respawnSeconds > 0);
    for (const biome of type.biomes) assert.ok(biomes.has(biome), `${type.id}: biome ${biome}`);
    assert.ok(regionsForNode(type.id).length >= 1, `${type.id} grows nowhere`);
    for (const [bonusId] of type.bonus) assert.ok(ITEMS[bonusId]);
  }
  const near = id => regionsForNode(id).some(region => region.level[0] <= 3);
  for (const id of ['herb', 'ore', 'wood', 'wheat', 'flax', 'stone']) assert.ok(near(id), `${id} must be near the valley`);
  for (const id of ['moonHerb', 'mithrilOre', 'ironwood', 'starFlax', 'basalt']) assert.ok(!near(id), `${id} must be far`);
  assert.ok(regionsForNode('mithrilOre').some(region => region.biome === 'snow'));
  for (const region of REGIONS) {
    assert.ok(creaturesForRegion(region).length >= 1, `no creatures in ${region.id}`);
    assert.ok(nodeTypesForRegion(region).length >= 1, `no nodes in ${region.id}`);
  }
  for (const creatureId of Object.keys(CREATURES)) {
    for (const biome of CREATURES[creatureId].biomes) assert.ok(biomes.has(biome), `${creatureId}: biome ${biome}`);
  }
});

test('shops and perks reference valid ids', () => {
  for (const cityKey of CITY_KEYS) {
    for (const role of SHOP_ROLES) {
      const entries = SHOPS[cityKey][role];
      assert.ok(entries.length >= 1, `${cityKey}:${role} is empty`);
      assert.ok(NPC_ROLES.includes(role), role);
      const seen = new Set();
      for (const entry of entries) {
        assert.ok(ITEMS[entry.itemId], `${cityKey}:${role} sells unknown ${entry.itemId}`);
        assert.ok(!ITEMS[entry.itemId].unique, `${entry.itemId} is unique`);
        assert.ok(entry.target >= 1 && entry.prosperity >= 0 && entry.prosperity <= 3);
        assert.ok(!seen.has(entry.itemId), `${cityKey}:${role} duplicate ${entry.itemId}`);
        seen.add(entry.itemId);
      }
    }
    for (const id of TRADE_GOODS) assert.ok(cityMultiplier(cityKey, id) > 0);
  }
  const soldSomewhere = id => CITY_KEYS.some(cityKey => Object.values(SHOPS[cityKey]).some(entries => entries.some(entry => entry.itemId === id)));
  for (const id of CARGO) assert.ok(soldSomewhere(id), `${id} sold nowhere`);
  assert.ok(Object.keys(PERKS).length >= 14);
  for (const perk of Object.values(PERKS)) {
    assert.ok(NPC_ROLES.includes(perk.teacher), perk.id);
    assert.ok(perk.lp >= 1 && perk.coins > 0 && perk.level >= 1 && perk.name && perk.desc);
    if (perk.requires) assert.ok(PERKS[perk.requires]);
  }
  assert.equal(PERKS.caravanGuard.teacher, 'captain');
  assert.equal(PERKS.caravanGuard.effects.nearWagonDamage, 0.15);
});
