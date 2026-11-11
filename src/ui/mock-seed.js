// Extension of the mock engine (mock-game.js) for the gameplay screens: turns the mock state into a REAL,
// meaningfully filled sim state and backs heroCtl with the sim, so every screen can be previewed and clicked
// through in tools/preview-ui.html?mock=1&real=1 without three.js.
import { emit } from '../core/events.js';
import { ITEMS, item as itemDef } from '../data/items.js';
import { CITIES } from '../data/world-map.js';
import { grantStarterKit } from '../sim/equipment.js';
import { addItem, countItem } from '../sim/inventory.js';
import { derivedStats } from '../sim/stats.js';
import { useItem as simUseItem, cooldownLeft, COOLDOWNS } from '../sim/consumables.js';
import { chooseProfession, addProfessionXp, learnRecipe } from '../sim/crafting.js';
import { syncLearningPoints, learnAbility } from '../sim/progression.js';
import { addRep } from '../sim/reputation.js';
import { contributeCargo, manifestLines } from '../sim/caravan.js';
import { startQuest, questStatus, handleWorldEvent } from '../sim/quests.js';
import { acceptBounty, listContracts, pinContract } from '../sim/board.js';
import { deposit } from '../sim/storage.js';
import { QUEST_LIST } from '../data/quests.js';

const query = new URLSearchParams(globalThis.location ? globalThis.location.search : '');

/** Each step is optional: the campaign modules are still being tuned, a failing step must not break the mock. */
function step(label, fn) {
  try {
    fn();
  } catch (error) {
    console.warn(`[mock-seed] ${label}:`, error.message);
  }
}

const BAG = {
  // manifest of the first leg (partly ready)
  flour: 14, bread: 9, meat: 14, wood: 30, plank: 11, hide: 7, handle: 3, salve: 5, bandage: 6, provisionBarrel: 1,
  // trade goods for the bonus cargo
  honey: 8, cheese: 6, grainSack: 4, furBale: 2,
  // materials and consumables
  herb: 18, rareHerb: 4, resin: 5, cloth: 4, ore: 7, leather: 3, ration: 5, tonic: 2, herbalTea: 3, stew: 2,
  // gear to compare and equip
  pouch: 1, sickle: 1, wagonKit: 1, torch: 1,
};

/** Fill a freshly created state so that every screen has something to show. */
export function seedRealState(state) {
  state.inv.extraSlots = Math.max(state.inv.extraSlots || 0, 16);
  step('starter kit', () => grantStarterKit(state));
  step('bag', () => {
    for (const [itemId, count] of Object.entries(BAG)) {
      if (itemDef(itemId).value > 0 || itemDef(itemId).desc) addItem(state, itemId, count);
    }
  });
  step('extra gear', () => {
    // one better weapon and one armour piece of the hero's class, whatever the catalog calls them
    const classId = state.player.classId;
    let weapons = 0;
    let armors = 0;
    for (const def of Object.values(ITEMS)) {
      const fits = !def.classes || def.classes.includes(classId);
      if (!fits || def.unique || (def.requiredLevel || 1) > state.player.level) continue;
      if (def.type === 'weapon' && def.tier === 2 && weapons < 1 && !countItem(state, def.id)) weapons += addItem(state, def.id, 1);
      if (def.type === 'armor' && def.tier === 2 && armors < 2 && !countItem(state, def.id)) armors += addItem(state, def.id, 1);
    }
  });
  step('quick slots', () => {
    state.player.quick = ['salve', 'bread', null, 'tonic'];
  });
  step('progression', () => {
    syncLearningPoints(state);
    const first = Object.keys(state.prog.abilities)[0];
    if (first) learnAbility(state, first, 'valley');
    state.prog.perks.push('caravanGuard');
  });
  step('professions', () => {
    chooseProfession(state, 'apothecary');
    addProfessionXp(state, 'apothecary', 520);
    for (const recipeId of ['herbalTea', 'tannin', 'antidote']) learnRecipe(state, recipeId, { from: 'free' });
    Object.assign(state.gather.xp, { herbalism: 190, logging: 70, mining: 35, skinning: 110 });
  });
  step('reputation', () => {
    addRep(state, 'valley', 22);
    addRep(state, 'ford', 6);
  });
  step('quests', () => {
    handleWorldEvent(state, 'world:kill', { creatureId: 'wolf', level: 3, x: 300, z: -200, poiId: null, boss: false });
    let started = 0;
    for (const quest of QUEST_LIST) {
      if (started >= 2) break;
      if (quest.category === 'side' && !quest.auto && questStatus(state, quest.id) === 'available' && startQuest(state, quest.id).ok) started += 1;
    }
  });
  step('board', () => {
    acceptBounty(state, 'bv-wolves');
    const contracts = listContracts(state, 'valley');
    if (contracts[0]) pinContract(state, 'valley', contracts[0].id, true);
  });
  step('caravan', () => {
    const lines = manifestLines(state);
    lines.forEach((line, index) => {
      if (index % 3 !== 2) contributeCargo(state, line.itemId, Math.ceil(line.count * (index % 2 ? 0.5 : 1)));
    });
    state.flags['scout:leg0'] = true;
  });
  step('storage', () => {
    addItem(state, 'ore', 20);
    deposit(state, 'ore', 20);
    addItem(state, 'stone', 12);
    deposit(state, 'stone', 12);
  });
  step('economy', () => {
    state.economy.events.push({ cityKey: 'ford', cat: 'food', kind: 'shortage', mult: 1.35, daysLeft: 3, text: 'В Каменном Броде не хватает еды: цены на провизию выросли.' });
    state.economy.news.unshift({ day: 3, cityKey: 'harbor', text: 'В Янтарную Гавань пришли две шхуны с пряностями — цены упали.' });
  });
  state.player.x = 0;
  state.player.z = 30;
  return state;
}

/** heroCtl methods backed by the sim (merged over the animated mock ones). */
export function mockHeroCtl(g, quick) {
  const clock = () => (g.state && g.state.world ? g.state.world.clock || 0 : 0);
  return {
    quickSlots() {
      const state = g.state;
      const ids = (state && state.player.quick) || [];
      quick.forEach((slot, index) => {
        const id = ids[index] || null;
        const group = id ? itemDef(id).cooldownGroup || 'medicine' : null;
        slot.itemId = id;
        slot.count = id ? countItem(state, id) : 0;
        slot.cooldown = group ? cooldownLeft(state, group, clock()) : 0;
        slot.cooldownTotal = group ? COOLDOWNS[group] || 0 : 0;
      });
      return quick;
    },
    setQuickSlot(slot, itemId) {
      g.state.player.quick ??= [null, null, null, null];
      g.state.player.quick[slot - 1] = itemId;
      emit('inv:changed', {});
    },
    useItem(itemId) {
      const result = simUseItem(g.state, itemId, clock(), { hp: g.hero.hp });
      if (!result.ok) {
        emit('toast', { text: result.reason, kind: 'warn' });
        return false;
      }
      for (const effect of result.effects || []) {
        if (effect.type === 'heal') g.hero.hp = Math.min(g.hero.maxHp, g.hero.hp + effect.amount);
      }
      emit('toast', { text: `Использовано: ${itemDef(itemId).name}`, kind: 'info' });
      return true;
    },
    stats() {
      const stats = derivedStats(g.state, { now: clock() });
      g.hero.maxHp = stats.maxHp;
      g.hero.maxStamina = stats.maxStamina;
      return stats;
    },
  };
}

/** With ?real=1 the hero «stands» in a city (default valley, &city=ford|harbor|none) so that city-only actions work. */
export function mockPinnedCity(g) {
  if (query.get('real') !== '1' || !g.state) return;
  const key = query.get('city') || 'valley';
  const city = CITIES.find(entry => entry.key === key);
  if (!city) return;
  g.state.player.x = city.x;
  g.state.player.z = city.z + 30;
  g.state.world.clock = (g.state.world.clock || 0) + 0.016;
  g.zone.city = city;
  g.zone.safe = true;
}

// keep the mock travel honest: moving to another city re-pins the hero there
export function mockTravel(g, cityKey) {
  const city = CITIES.find(entry => entry.key === cityKey);
  if (!city) return false;
  query.set('city', cityKey);
  g.state.world.discovered[cityKey] = 1;
  mockPinnedCity(g);
  emit('toast', { text: `Макет: вы приехали — ${city.name}`, kind: 'info' });
  return true;
}
