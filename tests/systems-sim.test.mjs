// Behaviour of the game systems: stats, combat, progression, equipment, crafting, gathering,
// consumables, economy, storage, loot and save round-trips.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, hydrateState } from '../src/sim/state.js';
import { grantXp, xpAtLevel } from '../src/sim/player.js';
import { addItem, countItem, totalSlots, BASE_SLOTS, freeSlots } from '../src/sim/inventory.js';
import { ITEMS } from '../src/data/items.js';
import { makeRng } from '../src/core/noise.js';
import { derivedStats } from '../src/sim/stats.js';
import {
  creatureStats, damageToCreature, damageToPlayer, incomingMultiplier, outgoingMultiplier, killReward,
  STATUS, statusTickDamage, statusDuration,
} from '../src/sim/combat.js';
import {
  learningPoints, trainAttribute, learnAbility, learnPerk, abilityRank, hasPerk, availableTraining,
  abilityBar, attributeCost,
} from '../src/sim/progression.js';
import { equip, unequip, canEquip, grantStarterKit } from '../src/sim/equipment.js';
import {
  chooseProfession, buySecondProfessionSlot, craft, craftable, learnRecipe, knowsRecipe, professionLevel,
  addProfessionXp, recipeBook,
} from '../src/sim/crafting.js';
import { gatherNode, canGather, skinCorpse, gatherLevel } from '../src/sim/gathering.js';
import { useItem, activeBuffs, cooldownLeft } from '../src/sim/consumables.js';
import {
  buyPrice, sellPrice, shopStock, buyItem, sellItem, economyNewDay, raiseProsperity, marketNews, stockOf,
  quoteBuy, prosperityOf,
} from '../src/sim/economy.js';
import { deposit, withdraw, expandStorage, storedCount } from '../src/sim/storage.js';
import { rollLoot, rollChest } from '../src/sim/loot.js';
import { RECIPES } from '../src/data/recipes.js';
import { CITY_KEYS, SHOPS } from '../src/data/economy.js';

function newHero(classId = 'warrior', level = 1) {
  const state = createState({ name: 'Тест', classId });
  if (level > 1) setLevel(state, level);
  return state;
}

function setLevel(state, level) {
  grantXp(state, xpAtLevel(level) - state.player.xp);
  assert.equal(state.player.level, level);
}

const mid = () => 0.5;

test('level-1 warrior against a level-1 wolf', () => {
  const state = newHero('warrior');
  grantStarterKit(state);
  const stats = derivedStats(state);
  const wolf = creatureStats('wolf', 1);
  const hit = damageToCreature(stats, { power: 1, crit: false }, wolf, 1, mid).damage;
  const hits = wolf.hp / hit;
  assert.ok(hits > 3.9 && hits <= 5.2, `hits to kill: ${hits.toFixed(2)}`);
  const bite = damageToPlayer(wolf, 1, stats, 1);
  const bites = stats.maxHp / bite;
  assert.ok(bites >= 7 && bites <= 9.5, `bites survived: ${bites.toFixed(2)}`);
  assert.ok(damageToPlayer(wolf, 1, stats, 1, { blocking: true }) < bite);
  assert.ok(damageToCreature(stats, { power: 1, crit: true }, wolf, 1, mid).damage > hit);
});

test('level gap is mild within 3 levels and harsh beyond', () => {
  assert.equal(incomingMultiplier(5, 5), 1);
  assert.ok(incomingMultiplier(5, 8) <= 1.5);
  assert.ok(incomingMultiplier(5, 12) > 4);
  assert.ok(incomingMultiplier(10, 4) < 0.7);
  assert.ok(outgoingMultiplier(5, 8) >= 0.8);
  assert.ok(outgoingMultiplier(5, 12) < 0.5);
  assert.ok(outgoingMultiplier(10, 5) > 1);
  for (let gap = -10; gap < 10; gap++) {
    assert.ok(incomingMultiplier(10, 10 + gap) <= incomingMultiplier(10, 11 + gap), 'incoming is monotonic');
    assert.ok(outgoingMultiplier(10, 10 + gap) >= outgoingMultiplier(10, 11 + gap), 'outgoing is monotonic');
  }
  assert.ok(killReward('wolf', 2, 12).xp < killReward('wolf', 2, 2).xp);
  assert.deepEqual(killReward('wolf', 3, 3).coins, [0, 0]);
  assert.ok(killReward('bandit_thug', 5, 5).coins[1] > 0);
  assert.ok(STATUS.stun && STATUS.slow && STATUS.burn && STATUS.bleed && STATUS.poison && STATUS.weaken && STATUS.mark);
  assert.equal(statusTickDamage('burn', 0.25, 40), 10);
  assert.equal(statusDuration('stun', 2, true), 1);
});

test('an on-level fight stays winnable from level 1 to 20 with on-tier gear', () => {
  const gearByLevel = {
    1: ['ironClaymore', 'militiaCoat'],
    10: ['steelClaymore', 'plateCoat', 'plateHelm', 'plateGloves', 'plateBoots'],
    20: ['frontierClaymore', 'frontierCoat', 'frontierHelm', 'frontierGauntlets', 'frontierBoots'],
  };
  for (const [levelText, gear] of Object.entries(gearByLevel)) {
    const level = Number(levelText);
    const state = newHero('warrior', level);
    for (const itemId of gear) {
      addItem(state, itemId, 1);
      assert.ok(equip(state, itemId).ok, itemId);
    }
    // a typical build: half of the learning points went into the primary attribute and endurance
    state.prog.attrs.strength += Math.floor((level - 1) * 0.9);
    state.prog.attrs.endurance += Math.floor((level - 1) * 0.6);
    const stats = derivedStats(state);
    const thug = creatureStats('bandit_thug', level);
    const hits = thug.hp / damageToCreature(stats, { power: 1, crit: false }, thug, level, mid).damage;
    const blows = stats.maxHp / damageToPlayer(thug, level, stats, level);
    assert.ok(hits >= 3 && hits <= 8, `level ${level}: ${hits.toFixed(1)} hits to kill a thug`);
    assert.ok(blows >= 6 && blows <= 20, `level ${level}: survives ${blows.toFixed(1)} blows`);
  }
});

test('learning points, attributes, abilities and perks', () => {
  const state = newHero('warrior');
  assert.equal(learningPoints(state), 0);
  assert.equal(abilityRank(state, 'sweep'), 1);
  assert.equal(abilityRank(state, 'rally'), 0);
  setLevel(state, 4);
  assert.equal(learningPoints(state), 9);
  assert.equal(learningPoints(state), 9, 'points are granted once');

  state.player.coins = 0;
  assert.equal(trainAttribute(state, 'strength', 'valley').ok, false);
  state.player.coins = 5000;
  const before = derivedStats(state).attack;
  const cost = attributeCost(state.prog.attrs.strength);
  const trained = trainAttribute(state, 'strength', 'valley');
  assert.ok(trained.ok);
  assert.equal(state.prog.lp, 9 - cost.lp);
  assert.equal(state.player.coins, 5000 - cost.coins);
  assert.ok(derivedStats(state).attack > before);
  assert.ok(attributeCost(30).coins > attributeCost(10).coins && attributeCost(30).lp > attributeCost(10).lp);

  // ability ranks: valley teaches rank ≤ 2, ford ≤ 4
  assert.ok(learnAbility(state, 'rally', 'valley').ok);
  assert.ok(learnAbility(state, 'sweep', 'valley').ok);
  assert.equal(abilityRank(state, 'sweep'), 2);
  setLevel(state, 12);
  const capped = learnAbility(state, 'sweep', 'valley');
  assert.equal(capped.ok, false);
  assert.match(capped.reason, /наставник/);
  assert.ok(learnAbility(state, 'sweep', 'ford').ok);
  assert.equal(learnAbility(state, 'frost', 'ford').ok, false, 'foreign class ability');
  assert.equal(learnAbility(state, 'earthbreak', 'ford').ok, true, 'slot 5 opens at level 12');
  const early = newHero('warrior', 3);
  early.player.coins = 999;
  assert.match(learnAbility(early, 'cleave', 'harbor').reason, /уровень 6/);

  // perks
  assert.ok(learnPerk(state, 'caravanGuard', 'valley').ok);
  assert.ok(hasPerk(state, 'caravanGuard'));
  assert.equal(learnPerk(state, 'caravanGuard', 'valley').ok, false);
  assert.ok(derivedStats(state, { nearWagon: true }).attack > derivedStats(state).attack * 1.1);
  assert.match(learnPerk(state, 'haggler', 'harbor').reason, /Торговая хватка/);
  assert.ok(learnPerk(state, 'tradeSense', 'ford').ok);
  assert.match(learnPerk(state, 'haggler', 'harbor').reason, /репутация/);
  state.rep = { harbor: 50 };
  assert.ok(learnPerk(state, 'haggler', 'harbor').ok);
  const slots = totalSlots(state);
  assert.ok(learnPerk(state, 'packMule', 'valley').ok);
  assert.equal(totalSlots(state), slots + 6);

  // UI lists
  const trainer = availableTraining(state, 'trainer', 'valley');
  assert.equal(trainer.filter(offer => offer.kind === 'ability').length, 5);
  assert.ok(trainer.some(offer => offer.kind === 'attribute' && offer.id === 'strength'));
  assert.ok(trainer.every(offer => offer.cost && Number.isFinite(offer.cost.coins) && Number.isFinite(offer.cost.lp)));
  assert.ok(trainer.find(offer => offer.id === 'sweep').locked, 'valley trainer cannot teach rank 4');
  assert.ok(availableTraining(state, 'captain', 'valley').some(offer => offer.kind === 'perk' && offer.id === 'toughness'));
  assert.ok(availableTraining(state, 'smith', 'valley').some(offer => offer.kind === 'profession'));
  assert.equal(abilityBar(state).length, 5);
  assert.equal(abilityBar(state)[0].ability.power, 1.8);
});

test('equipment: restrictions, swapping and bags', () => {
  const state = newHero('archer');
  addItem(state, 'bow', 1);
  addItem(state, 'huntBow', 1);
  addItem(state, 'ironClaymore', 1);
  addItem(state, 'mailCoat', 1);
  addItem(state, 'shield', 1);
  assert.match(canEquip(state, 'ironClaymore').reason, /не может/);
  assert.match(canEquip(state, 'mailCoat').reason, /не может/);
  assert.match(canEquip(state, 'shield').reason, /не может/);
  assert.match(canEquip(state, 'huntBow').reason, /уровень 4/);
  assert.equal(canEquip(state, 'herb').ok, false);
  assert.ok(equip(state, 'bow').ok);
  assert.equal(state.inv.equip.weapon, 'bow');
  assert.equal(countItem(state, 'bow'), 0);
  const base = derivedStats(state).attack;
  setLevel(state, 4);
  assert.ok(equip(state, 'huntBow').ok);
  assert.equal(countItem(state, 'bow'), 1, 'old weapon returns to the bag');
  assert.ok(derivedStats(state).attack > base);

  addItem(state, 'bag', 1);
  addItem(state, 'pouch', 1);
  assert.ok(equip(state, 'bag').ok);
  assert.equal(totalSlots(state), BASE_SLOTS + 8);
  assert.ok(equip(state, 'pouch').ok);
  assert.equal(totalSlots(state), BASE_SLOTS + 4);
  assert.equal(countItem(state, 'bag'), 1);
  assert.ok(unequip(state, 'bag').ok);
  assert.equal(totalSlots(state), BASE_SLOTS);
  assert.equal(unequip(state, 'bag').ok, false);

  const guardian = newHero('guardian');
  grantStarterKit(guardian);
  assert.equal(guardian.inv.equip.offhand, 'shield');
  assert.ok(derivedStats(guardian).blockPower >= 0.5);
  assert.ok(countItem(guardian, 'flatbread') > 0);
});

test('professions and crafting', () => {
  const state = newHero('warrior');
  assert.equal(craftable(state, 'ingot', { atStation: true }).ok, false);
  assert.ok(chooseProfession(state, 'smith').ok);
  assert.equal(state.craft.main, 'smith');
  assert.ok(knowsRecipe(state, 'ingot') && knowsRecipe(state, 'fastener'));
  assert.equal(chooseProfession(state, 'tailor').ok, false, 'second profession is locked');

  addItem(state, 'ore', 30);
  assert.match(craftable(state, 'ingot').reason, /мастерская/);
  assert.equal(craftable(state, 'ingot', { atStation: 'carpenter' }).ok, false);
  const made = craft(state, 'ingot', { atStation: 'smith', count: 4 });
  assert.ok(made.ok);
  assert.equal(made.count, 4);
  assert.equal(countItem(state, 'ingot'), 4);
  assert.equal(countItem(state, 'ore'), 18);
  assert.ok(made.xp > 0);
  assert.match(craft(state, 'steel', { atStation: true }).reason, /не изучен/);

  // trainer recipes cost coins and need the profession level
  state.player.coins = 1000;
  assert.match(learnRecipe(state, 'sword', { cityKey: 'valley' }).reason, /уровень профессии/);
  addProfessionXp(state, 'smith', 5000);
  assert.ok(professionLevel(state, 'smith') >= 10);
  assert.ok(learnRecipe(state, 'sword', { cityKey: 'valley' }).ok);
  assert.equal(state.player.coins, 1000 - RECIPES.sword.price);
  assert.match(learnRecipe(state, 'cobaltSteel', { cityKey: 'valley' }).reason, /не учит/);
  assert.ok(learnRecipe(state, 'cobaltSteel', { cityKey: 'ford' }).ok);
  assert.match(learnRecipe(state, 'masterBlade', { cityKey: 'harbor' }).reason, /по записям/);

  // notes teach note recipes
  addItem(state, 'note_masterBlade', 1);
  assert.ok(useItem(state, 'note_masterBlade', 0).ok);
  assert.ok(knowsRecipe(state, 'masterBlade'));
  assert.equal(countItem(state, 'note_masterBlade'), 0);

  // trivially low recipes give little xp
  const low = craftable(state, 'ingot', { atStation: true });
  assert.ok(low.xp < RECIPES.ingot.xp * 0.3);
  assert.ok(recipeBook(state, 'smith').some(entry => entry.recipe.id === 'ingot' && entry.trivial));

  // missing inputs are reported
  assert.match(craft(state, 'sword', { atStation: true }).reason, /Не хватает/);
  addItem(state, 'handle', 1);
  addItem(state, 'strap', 1);
  const sword = craft(state, 'sword', { atStation: true });
  assert.ok(sword.ok);
  assert.equal(countItem(state, 'sword'), 1);

  // second profession
  assert.match(buySecondProfessionSlot(newHero('warrior')).reason, /основную/);
  assert.match(buySecondProfessionSlot(state).reason, /уровень 8/);
  setLevel(state, 8);
  assert.ok(buySecondProfessionSlot(state).ok);
  assert.ok(chooseProfession(state, 'tailor').ok);
  assert.equal(state.craft.second, 'tailor');
  assert.equal(chooseProfession(state, 'mason').ok, false);

  // field recipes need no station
  const farmer = newHero('medic');
  chooseProfession(farmer, 'farmer');
  addItem(farmer, 'meat', 2);
  assert.ok(craft(farmer, 'roastMeat').ok);
});

test('gathering skills, tools and skinning', () => {
  const state = newHero('archer');
  const rng = makeRng(7);
  const first = gatherNode(state, 'herb', rng);
  assert.ok(first.ok);
  assert.ok(first.count >= 1 && countItem(state, 'herb') === first.count);
  assert.ok(first.xp > 0);
  assert.match(gatherNode(state, 'rareHerb', rng).reason, /навык/);
  state.gather.xp.logging = 5000;
  assert.ok(gatherLevel(state, 'logging') >= 8);
  assert.match(canGather(state, 'hardwood').reason, /топор/);
  addItem(state, 'axe', 1);
  const slow = canGather(state, 'hardwood');
  assert.ok(slow.ok);
  assert.match(canGather(state, 'ancientWood').reason, /стальной/);
  addItem(state, 'steelAxe', 1);
  assert.ok(canGather(state, 'ancientWood').ok);
  assert.ok(canGather(state, 'hardwood').time < slow.time, 'better tool is faster');
  for (let i = 0; i < 40; i++) gatherNode(state, 'wood', rng);
  assert.ok(countItem(state, 'resin') > 0, 'wood gives resin now and then');
  assert.ok(gatherLevel(state, 'herbalism') === 1);
  for (let i = 0; i < 30; i++) gatherNode(state, 'herb', rng);
  assert.ok(gatherLevel(state, 'herbalism') > 1);

  assert.ok(skinCorpse(state, 'wolf', 2, rng).ok);
  assert.ok(countItem(state, 'hide') >= 1);
  assert.match(skinCorpse(state, 'boar', 3, rng).reason, /навык/);
  assert.match(skinCorpse(state, 'giant_spider', 14, rng).reason, /нечего/);
  assert.equal(gatherNode(state, 'nonsense', rng).ok, false);
});

test('consumables: healing, cooldown groups, buffs', () => {
  const state = newHero('warrior');
  addItem(state, 'salve', 3);
  addItem(state, 'bread', 2);
  addItem(state, 'whetstone', 1);
  addItem(state, 'trailMeal', 1);
  const fullHp = derivedStats(state).maxHp;
  assert.match(useItem(state, 'salve', 10, { hp: fullHp }).reason, /полное/);
  assert.equal(countItem(state, 'salve'), 3, 'nothing is wasted at full health');
  const healed = useItem(state, 'salve', 10, { hp: 40 });
  assert.ok(healed.ok);
  assert.deepEqual(healed.effects[0], { type: 'heal', amount: Math.round(35 * derivedStats(state).healPower) });
  assert.equal(state.player.hp, null, 'the engine owns live hp');
  assert.match(useItem(state, 'salve', 12).reason, /Ещё рано/);
  assert.ok(cooldownLeft(state, 'medicine', 12) > 0);
  const ate = useItem(state, 'bread', 12);
  assert.ok(ate.ok, 'food has its own cooldown group');
  assert.equal(ate.effects[0].type, 'hot');
  assert.ok(useItem(state, 'salve', 30).ok);

  const baseAttack = derivedStats(state).attack;
  assert.ok(useItem(state, 'whetstone', 30).ok);
  assert.equal(activeBuffs(state, 31).length, 1);
  assert.ok(derivedStats(state, { now: 31 }).attack > baseAttack, 'timed buffs apply by themselves');
  assert.equal(derivedStats(state, { now: 30 + 601 }).attack, baseAttack, 'and stop when they run out');
  state.world = { clock: 31 };
  assert.ok(derivedStats(state).attack > baseAttack, 'the world clock is the default time');
  delete state.world;
  assert.equal(activeBuffs(state, 30 + 601).length, 0, 'buff expires');
  const maxHp = derivedStats(state).maxHp;
  const meal = useItem(state, 'trailMeal', 1000);
  assert.ok(meal.ok);
  assert.ok(meal.effects.some(effect => effect.type === 'timed-buff' && effect.stat === 'maxHp'));
  assert.ok(derivedStats(state, { now: 1001 }).maxHp > maxHp);
  assert.ok(derivedStats(state, [{ type: 'fury', value: 0.3 }]).attack > 0, 'engine status arrays are tolerated');
  assert.equal(useItem(state, 'herb', 200).ok, false);
  assert.equal(useItem(state, 'tonic', 200).ok, false);
});

test('economy: prices, stock, shops, prosperity, new day', () => {
  const state = newHero('warrior');
  state.player.coins = 100000;
  // produced cheap, wanted dear
  assert.ok(buyPrice(state, 'valley', 'honey') < buyPrice(state, 'ford', 'honey'));
  assert.ok(buyPrice(state, 'ford', 'honey') < buyPrice(state, 'harbor', 'honey'));
  assert.ok(buyPrice(state, 'harbor', 'spice') < buyPrice(state, 'valley', 'spice'));
  for (const cityKey of CITY_KEYS) {
    for (const itemId of ['honey', 'salve', 'sword', 'ore', 'toolCrate', 'pearls', 'herb']) {
      assert.ok(sellPrice(state, cityKey, itemId) <= buyPrice(state, cityKey, itemId), `${cityKey}:${itemId} sells above buy`);
    }
  }

  // buying drains stock and raises the price; selling does the opposite
  const firstPrice = buyPrice(state, 'valley', 'honey');
  const stock = stockOf(state, 'valley', 'honey');
  const bought = buyItem(state, 'valley', 'trader', 'honey', 10);
  assert.ok(bought.ok);
  assert.ok(bought.total >= firstPrice * 10);
  assert.equal(stockOf(state, 'valley', 'honey'), stock - 10);
  assert.ok(buyPrice(state, 'valley', 'honey') > firstPrice);
  assert.equal(buyItem(state, 'valley', 'trader', 'honey', 1000).ok, false);
  assert.equal(buyItem(state, 'valley', 'trader', 'spice', 1).ok, false, 'valley trader has no spice');
  const sellBefore = sellPrice(state, 'ford', 'honey');
  const sold = sellItem(state, 'ford', 'honey', 10);
  assert.ok(sold.ok);
  assert.ok(sold.total > bought.total, 'one leg of trade is profitable');
  assert.ok(sellPrice(state, 'ford', 'honey') < sellBefore);
  assert.equal(sellItem(state, 'ford', 'honey', 1).ok, false);

  // instant resale in the same city always loses
  const coins = state.player.coins;
  for (const [role, itemId] of [['trader', 'grainSack'], ['grocer', 'salve'], ['smith', 'ingot']]) {
    assert.ok(buyItem(state, 'valley', role, itemId, 3).ok, itemId);
    assert.ok(sellItem(state, 'valley', itemId, 3).ok);
  }
  assert.ok(state.player.coins < coins);

  // shops: locks by prosperity and level
  const smithShop = shopStock(state, 'valley', 'weaponsmith');
  assert.ok(smithShop.length > 10);
  const tier3 = smithShop.find(row => row.itemId === 'steelClaymore');
  assert.match(tier3.locked, /окрепнет/);
  assert.equal(buyItem(state, 'valley', 'weaponsmith', 'steelClaymore', 1).ok, false);
  assert.ok(!smithShop.find(row => row.itemId === 'frontierClaymore'), 'valley never sells tier 6');
  const tier2 = smithShop.find(row => row.itemId === 'soldierClaymore');
  assert.match(tier2.locked, /уровень 4/);
  assert.ok(smithShop.every(row => ITEMS[row.itemId] && row.price >= 1));
  assert.ok(raiseProsperity(state, 'valley').ok);
  assert.equal(prosperityOf(state, 'valley'), 1);
  setLevel(state, 8);
  assert.ok(!shopStock(state, 'valley', 'weaponsmith').find(row => row.itemId === 'steelClaymore').locked);
  assert.ok(buyItem(state, 'valley', 'weaponsmith', 'steelClaymore', 1).ok);
  for (let i = 0; i < 5; i++) raiseProsperity(state, 'harbor');
  assert.equal(prosperityOf(state, 'harbor'), 3);
  assert.ok(marketNews(state).some(line => line.cityKey === 'valley'));
  assert.ok(shopStock(state, 'ford', 'smith').some(row => row.itemId.startsWith('note_')), 'masters sell recipe notes');
  assert.ok(shopStock(state, 'valley', 'carpenter').some(row => row.itemId === 'spareWheel'), 'masters sell cargo goods');

  // reputation and perks improve prices
  const plain = buyPrice(state, 'ford', 'steel');
  state.rep = { ford: 100 };
  assert.ok(buyPrice(state, 'ford', 'steel') < plain);

  // days: stock drifts back, events come and go
  assert.ok(stockOf(state, 'valley', 'honey') < 26);
  let sawEvent = false;
  for (let day = 0; day < 40; day++) {
    const result = economyNewDay(state);
    assert.equal(result.day, day + 1);
    if (result.news.length) sawEvent = true;
    assert.ok(state.economy.events.length <= 3);
  }
  assert.ok(sawEvent, 'a market event happened within 40 days');
  assert.equal(stockOf(state, 'valley', 'honey'), 26);
  assert.deepEqual(state.economy.stock.ford.honey, undefined);
  for (const line of marketNews(state)) assert.ok(/[а-яё]/i.test(line.text));
});

/** Buy as much of each listed good from the city trader as stock and coins allow. */
function buyCargo(state, cityKey, goods) {
  for (const itemId of goods) {
    let count = Math.floor(stockOf(state, cityKey, itemId));
    while (count > 0 && quoteBuy(state, cityKey, itemId, count) > state.player.coins) count--;
    if (count > 0) assert.ok(buyItem(state, cityKey, 'trader', itemId, count).ok, `${cityKey}: ${itemId}`);
  }
}

function sellAll(state, cityKey, goods) {
  for (const itemId of goods) {
    const count = countItem(state, itemId);
    if (count > 0) assert.ok(sellItem(state, cityKey, itemId, count).ok);
  }
}

test('a full trade ring valley → ford → harbor → valley is really profitable', () => {
  const state = newHero('warrior');
  addItem(state, 'caravanPack', 1);
  equip(state, 'caravanPack');
  state.player.level = 20;
  for (const cityKey of CITY_KEYS) raiseProsperity(state, cityKey);
  const start = 300;
  state.player.coins = start;

  const valleyGoods = ['honey', 'cheese', 'grainSack', 'lumberBale'];
  const fordGoods = ['salt', 'coalSack', 'oreCrate', 'toolCrate'];
  const harborGoods = ['pearls', 'silk', 'amber', 'spice', 'wine', 'fishBarrel'];

  buyCargo(state, 'valley', valleyGoods);
  sellAll(state, 'ford', valleyGoods);
  const afterFirst = state.player.coins;
  buyCargo(state, 'ford', fordGoods);
  sellAll(state, 'harbor', fordGoods);
  const afterSecond = state.player.coins;
  buyCargo(state, 'harbor', harborGoods);
  sellAll(state, 'valley', harborGoods);
  const afterThird = state.player.coins;

  const profits = [afterFirst - start, afterSecond - afterFirst, afterThird - afterSecond];
  assert.ok(profits.every(profit => profit > 0), `leg profits ${profits}`);
  assert.ok(profits[0] < profits[1] && profits[1] < profits[2], `profit grows with distance and risk: ${profits}`);
  assert.ok(afterThird >= start * 2.5, `ring turned ${start} into ${afterThird}`);
  assert.ok(afterThird <= start * 40, `ring is not a money fountain: ${afterThird}`);
});

test('storage: deposit, withdraw, expand', () => {
  const state = newHero('warrior');
  addItem(state, 'ore', 150);
  assert.ok(deposit(state, 'ore', 120).ok);
  assert.equal(countItem(state, 'ore'), 30);
  assert.equal(storedCount(state, 'ore'), 120);
  assert.equal(deposit(state, 'ore', 31).ok, false);
  assert.ok(withdraw(state, 'ore', 20).ok);
  assert.equal(countItem(state, 'ore'), 50);
  assert.equal(withdraw(state, 'ore', 101).ok, false);
  assert.equal(expandStorage(state).ok, false);
  state.player.coins = 1000;
  assert.ok(expandStorage(state).ok);
  assert.equal(state.storage.slots, 80);
  // a full bag refuses withdrawals
  for (let i = 0; freeSlots(state) > 0; i++) addItem(state, Object.keys(ITEMS)[i + 40], 1);
  addItem(state, 'ore', 49);
  assert.equal(withdraw(state, 'ore', 50).ok, false);
});

test('loot: bosses, class-aware uniques, chests', () => {
  const rng = makeRng(11);
  const boss = rollLoot('bandit_chief_kosoy', 5, rng, { classId: 'duelist' });
  assert.ok(boss.coins >= 100);
  assert.ok(boss.items.kosoyFang === 1 || boss.items.kosoyPatch === 1, 'unique fits the class');
  assert.ok(!boss.items.kosoyCleaver);
  for (const itemId of Object.keys(boss.items)) assert.ok(ITEMS[itemId], itemId);
  const lair = rollLoot('stoneback', 11, rng, { elite: true });
  assert.equal(lair.items.stonebackMaul, 1);
  let coins = 0;
  let badges = 0;
  for (let i = 0; i < 200; i++) {
    const drop = rollLoot('bandit_thug', 6, rng);
    coins += drop.coins;
    badges += drop.items.banditBadge || 0;
    for (const itemId of Object.keys(drop.items)) assert.ok(ITEMS[itemId], itemId);
  }
  assert.ok(coins > 200 * 5 && coins < 200 * 20);
  assert.ok(badges > 30);
  assert.equal(rollLoot('wolf', 3, rng).coins, 0);
  assert.deepEqual(rollLoot('nobody', 3, rng), { coins: 0, items: {} });
  for (const level of [3, 8, 13, 16]) {
    const chest = rollChest(level, rng, { classId: 'archer' });
    assert.ok(chest.coins > 0 && Object.keys(chest.items).length >= 2);
    for (const itemId of Object.keys(chest.items)) assert.ok(ITEMS[itemId], itemId);
  }
  assert.ok(rollChest(16, rng).coins > rollChest(3, rng).coins * 1.5);
});

test('slices survive a save round-trip', () => {
  const state = newHero('engineer', 9);
  grantStarterKit(state);
  state.player.coins = 5000;
  chooseProfession(state, 'carpenter');
  addItem(state, 'wood', 12);
  craft(state, 'plank', { atStation: true, count: 2 });
  gatherNode(state, 'stone', makeRng(3));
  learningPoints(state);
  trainAttribute(state, 'wits', 'valley');
  learnAbility(state, 'overdrive', 'valley');
  learnPerk(state, 'tradeSense', 'valley');
  buyItem(state, 'valley', 'trader', 'honey', 5);
  raiseProsperity(state, 'ford');
  economyNewDay(state);
  deposit(state, 'honey', 3);
  addItem(state, 'herbalTea', 1);
  useItem(state, 'herbalTea', 50);

  const copy = hydrateState(JSON.parse(JSON.stringify(state)));
  for (const slice of ['prog', 'craft', 'gather', 'consum', 'economy', 'storage']) {
    assert.deepEqual(copy[slice], state[slice], slice);
  }
  assert.deepEqual(derivedStats(copy), derivedStats(state));
  assert.equal(buyPrice(copy, 'valley', 'honey'), buyPrice(state, 'valley', 'honey'));
  assert.ok(derivedStats(copy).companion.attack > 0);

  // old saves without the new slices get fresh ones; bad data is repaired or rejected
  const old = JSON.parse(JSON.stringify(state));
  for (const slice of ['prog', 'craft', 'gather', 'consum', 'economy', 'storage']) delete old[slice];
  const upgraded = hydrateState(old);
  assert.equal(upgraded.prog.attrs.wits, 7);
  assert.equal(upgraded.storage.slots, 60);
  const broken = JSON.parse(JSON.stringify(state));
  broken.prog.abilities.nonsense = 9;
  broken.craft.known.push('ghostRecipe');
  broken.economy.prosperity.ford = 99;
  const repaired = hydrateState(broken);
  assert.equal(repaired.prog.abilities.nonsense, undefined);
  assert.ok(!repaired.craft.known.includes('ghostRecipe'));
  assert.equal(repaired.economy.prosperity.ford, 3);
  const corrupt = JSON.parse(JSON.stringify(state));
  corrupt.prog.lp = 'много';
  assert.throws(() => hydrateState(corrupt));
});

test('shop tables only offer items that exist in every city', () => {
  for (const cityKey of CITY_KEYS) {
    const state = newHero('warrior', 20);
    for (let i = 0; i < 3; i++) raiseProsperity(state, cityKey);
    for (const role of Object.keys(SHOPS[cityKey])) {
      for (const row of shopStock(state, cityKey, role)) {
        assert.ok(!row.locked, `${cityKey}:${role}:${row.itemId} still locked at max prosperity and level`);
        assert.ok(row.stock >= 1 && row.price >= 1);
      }
    }
  }
});
