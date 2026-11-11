// Quest log. Slices `quests` and `flags` (flags are registered in quest-rules.js). Pure.
// The engine calls handleWorldEvent(state, type, payload) for EVERY world event (see CLAUDE.md) —
// this is the single entry point: it also feeds the board (contracts/bounties) and story flags.
import { registerSlice, ok, fail } from './state.js';
import { emit } from '../core/events.js';
import { QUESTS, QUEST_LIST } from '../data/quests.js';
import { itemName } from '../data/items.js';
import { addItem, removeItem, removeItems, hasItems, canAddItems } from './inventory.js';
import { grantXp, addCoins } from './player.js';
import { addRep } from './reputation.js';
import { setCaravanListener } from './caravan-core.js';
import { boardWorldEvent, boardJournal } from './board.js';
import {
  getFlag, setFlagRaw, checkCondition, requirementConditions, rawQuestStatus,
  objectiveNeed, objectiveGain, liveAmount, objectiveMarker, npcPlace,
} from './quest-rules.js';

export { getFlag, checkCondition, CREATURE_FAMILIES } from './quest-rules.js';

/** A new game begins with the opening quests (auto, no requirements) already in the journal. */
function initialQuests() {
  const quests = { active: {}, done: {}, tracked: null };
  for (const quest of QUEST_LIST) {
    if (!quest.auto || quest.requires) continue;
    quests.active[quest.id] = { stage: 0, progress: quest.stages[0].objectives.map(() => 0), ready: false, startedDay: 1 };
    quests.tracked ??= quest.id;
  }
  return quests;
}

registerSlice('quests', {
  init: initialQuests,
  migrate(quests) {
    if (!quests.active || !quests.done) throw new Error('Повреждён журнал заданий');
    for (const questId of Object.keys(quests.active)) if (!QUESTS[questId]) delete quests.active[questId];
    if (quests.tracked && !quests.active[quests.tracked]) quests.tracked = null;
    return quests;
  },
});

const today = state => state.time?.day || 1;

// ───────────────────────── status ─────────────────────────

/** 'done' | 'ready' | 'active' | 'available' | 'locked' | 'unknown'. */
export function questStatus(state, questId) {
  const quest = QUESTS[questId];
  if (!quest) return 'unknown';
  const raw = rawQuestStatus(state, questId);
  if (raw !== 'none') return raw;
  return checkCondition(state, requirementConditions(quest.requires)) ? 'available' : 'locked';
}

/** Quests this npc can offer right now. */
export function availableQuests(state, npcId) {
  return QUEST_LIST.filter(quest => quest.giver === npcId && !quest.auto && questStatus(state, quest.id) === 'available');
}

/** Quests that can be turned in to this npc right now. */
export function readyQuests(state, npcId) {
  return QUEST_LIST.filter(quest => (quest.turnIn || quest.giver) === npcId && questStatus(state, quest.id) === 'ready');
}

/** Available main-chain quests with the giver's map point — "where the story continues". */
export function questLeads(state) {
  return QUEST_LIST
    .filter(quest => quest.category === 'main' && questStatus(state, quest.id) === 'available')
    .map(quest => ({ id: quest.id, title: quest.title, giver: quest.giver, marker: npcPlace(quest.giver) }));
}

// ───────────────────────── progress ─────────────────────────

const currentStage = (quest, entry) => quest.stages[entry.stage] || null;

function objectiveAmount(state, objective, counted) {
  const live = liveAmount(state, objective);
  const amount = live === null ? counted : Math.max(live, objective.type === 'collect' || objective.type === 'deliver' ? 0 : counted);
  return Math.min(objectiveNeed(objective), amount);
}

function stageComplete(state, quest, entry) {
  const stage = currentStage(quest, entry);
  return stage.objectives.every((objective, index) => objectiveAmount(state, objective, entry.progress[index] || 0) >= objectiveNeed(objective));
}

function enterStage(state, quest, entry) {
  const stage = currentStage(quest, entry);
  entry.progress = stage.objectives.map(() => 0);
}

/** Move a quest forward while its current stage is complete. Returns true if anything changed. */
function settleQuest(state, quest) {
  const entry = state.quests.active[quest.id];
  if (!entry) return false;
  let changed = false;
  if (entry.ready) {
    // deliverables may have been spent after the quest became ready
    if (hasItems(state, deliverBundle(quest))) return false;
    entry.ready = false;
    entry.stage = quest.stages.length - 1;
    emit('quest:updated', { id: quest.id });
    return true;
  }
  while (!entry.ready && stageComplete(state, quest, entry)) {
    const stage = currentStage(quest, entry);
    changed = true;
    if (entry.stage >= quest.stages.length - 1) {
      entry.ready = true;
    } else {
      entry.stage += 1;
      enterStage(state, quest, entry);
    }
    // effects run after the stage has moved on: they may re-enter this function through refreshQuests
    if (stage.onDone) applyEffects(state, stage.onDone);
    if (state.quests.active[quest.id] !== entry) return true;
  }
  if (!changed) return false;
  emit('quest:updated', { id: quest.id });
  if (entry.ready && quest.autoComplete) completeQuest(state, quest);
  else if (entry.ready) emit('toast', { text: `Задание выполнено: «${quest.title}». Вернись за наградой.`, kind: 'good' });
  return true;
}

function startAutoQuests(state) {
  let started = false;
  for (const quest of QUEST_LIST) {
    if (!quest.auto || questStatus(state, quest.id) !== 'available') continue;
    beginQuest(state, quest);
    started = true;
  }
  return started;
}

/** Re-evaluate live objectives and auto-starting quests. Called after anything that may matter. */
export function refreshQuests(state) {
  for (let pass = 0; pass < 8; pass++) {
    let changed = startAutoQuests(state);
    for (const questId of Object.keys(state.quests.active)) {
      if (QUESTS[questId] && settleQuest(state, QUESTS[questId])) changed = true;
    }
    if (!changed) break;
  }
}

// ───────────────────────── flags and effects ─────────────────────────

/** Set a story flag and let quests react. */
export function setFlag(state, name, value = true) {
  if (setFlagRaw(state, name, value)) refreshQuests(state);
}

function effectGive(state, bundle, results) {
  for (const [itemId, count] of Object.entries(bundle)) {
    const added = addItem(state, itemId, count);
    results.push({ kind: 'item', itemId, count: added, text: `Получено: ${itemName(itemId)} ×${added}` });
  }
}

function effectTake(state, bundle, results) {
  if (!removeItems(state, bundle).ok) return;
  for (const [itemId, count] of Object.entries(bundle)) results.push({ kind: 'item', itemId, count: -count, text: `Отдано: ${itemName(itemId)} ×${count}` });
}

function applyEffect(state, effect, results) {
  if (effect.startQuest) {
    const result = startQuest(state, effect.startQuest);
    if (result.ok) results.push({ kind: 'quest', id: effect.startQuest, text: `Новое задание: «${QUESTS[effect.startQuest].title}»` });
  }
  if (effect.turnIn) {
    const result = turnIn(state, effect.turnIn);
    results.push(result.ok
      ? { kind: 'questDone', id: effect.turnIn, rewards: result.rewards, text: `Задание завершено: «${QUESTS[effect.turnIn].title}»` }
      : { kind: 'fail', text: result.reason });
  }
  if (effect.talk) completeTalk(state, effect.talk[0], effect.talk[1]);
  if (effect.advance) advanceQuest(state, effect.advance);
  if (effect.give) effectGive(state, effect.give, results);
  if (effect.take) effectTake(state, effect.take, results);
  if (effect.coins) {
    addCoins(state, effect.coins);
    results.push({ kind: 'coins', amount: effect.coins, text: effect.coins > 0 ? `Получено монет: ${effect.coins}` : `Отдано монет: ${-effect.coins}` });
  }
  if (effect.xp) grantXp(state, effect.xp);
  if (effect.rep) {
    addRep(state, effect.rep[0], effect.rep[1]);
    results.push({ kind: 'rep', cityKey: effect.rep[0], amount: effect.rep[1], text: effect.rep[1] > 0 ? 'Репутация выросла' : 'Репутация упала' });
  }
  if (effect.flag) {
    const [name, value] = Array.isArray(effect.flag) ? effect.flag : [effect.flag, true];
    setFlagRaw(state, name, value);
  }
  if (effect.toast) emit('toast', { text: effect.toast, kind: 'info' });
}

/**
 * Apply declarative effects: {startQuest} {turnIn} {advance} {talk:[questId, objectiveIndex]} {give} {take} {coins} {xp} {rep} {flag} {toast}.
 * (`open` is a UI action — handled by sim/dialogue.js.) Returns the list of result notes.
 */
export function applyEffects(state, effects, results = []) {
  for (const effect of effects || []) applyEffect(state, effect, results);
  refreshQuests(state);
  return results;
}

// ───────────────────────── actions ─────────────────────────

function beginQuest(state, quest) {
  const entry = { stage: 0, progress: [], ready: false, startedDay: today(state) };
  state.quests.active[quest.id] = entry;
  enterStage(state, quest, entry);
  if (quest.category === 'main' || !state.quests.tracked) state.quests.tracked = quest.id;
  emit('quest:started', { id: quest.id });
  emit('toast', { text: `Новое задание: «${quest.title}»`, kind: 'info' });
  if (quest.onStart) applyEffects(state, quest.onStart);
}

/** Start a quest if its requirements are met. */
export function startQuest(state, questId) {
  const status = questStatus(state, questId);
  if (status === 'unknown') return fail('Нет такого задания');
  if (status === 'locked') return fail('Это задание пока недоступно');
  if (status !== 'available') return fail('Задание уже взято');
  beginQuest(state, QUESTS[questId]);
  refreshQuests(state);
  return ok({ id: questId });
}

/** Mark a `talk` objective done (used by dialogue topics). */
export function completeTalk(state, questId, objectiveIndex) {
  const entry = state.quests.active[questId];
  const quest = QUESTS[questId];
  if (!entry || entry.ready || !quest) return false;
  const objective = currentStage(quest, entry).objectives[objectiveIndex];
  if (!objective || objective.type !== 'talk') return false;
  entry.progress[objectiveIndex] = 1;
  if (!settleQuest(state, quest)) emit('quest:updated', { id: questId });
  return true;
}

/** Force the current stage of an active quest to complete (story shortcuts from dialogue). */
export function advanceQuest(state, questId) {
  const entry = state.quests.active[questId];
  const quest = QUESTS[questId];
  if (!entry || entry.ready || !quest) return fail('Задание не активно');
  entry.progress = currentStage(quest, entry).objectives.map(objectiveNeed);
  refreshQuests(state);
  return ok({ id: questId });
}

function rewardBundleFits(state, rewards) {
  return !rewards.items || canAddItems(state, rewards.items);
}

function deliverBundle(quest) {
  const bundle = {};
  for (const objective of quest.stages[quest.stages.length - 1].objectives) {
    if (objective.type === 'deliver') bundle[objective.itemId] = (bundle[objective.itemId] || 0) + objective.count;
  }
  return bundle;
}

function completeQuest(state, quest) {
  const rewards = quest.rewards || {};
  removeItems(state, deliverBundle(quest));
  for (const itemId of quest.takeOnDone || []) removeItem(state, itemId, 1);
  delete state.quests.active[quest.id];
  state.quests.done[quest.id] = today(state);
  if (state.quests.tracked === quest.id) state.quests.tracked = Object.keys(state.quests.active)[0] || null;
  if (rewards.coins) addCoins(state, rewards.coins);
  if (rewards.xp) grantXp(state, rewards.xp);
  for (const [cityKey, amount] of Object.entries(rewards.rep || {})) addRep(state, cityKey, amount);
  for (const [itemId, count] of Object.entries(rewards.items || {})) addItem(state, itemId, count);
  emit('quest:completed', { id: quest.id });
  emit('toast', { text: `Задание завершено: «${quest.title}»`, kind: 'good' });
  if (quest.onComplete) applyEffects(state, quest.onComplete);
}

/** Hand in a ready quest: takes `deliver` items, grants rewards, applies consequences. */
export function turnIn(state, questId) {
  const quest = QUESTS[questId];
  if (!quest) return fail('Нет такого задания');
  refreshQuests(state);
  const status = rawQuestStatus(state, questId);
  if (status === 'done') return fail('Задание уже сдано');
  if (status !== 'ready') return fail('Задание ещё не выполнено');
  if (!hasItems(state, deliverBundle(quest))) return fail('Не хватает предметов для сдачи');
  if (!rewardBundleFits(state, quest.rewards || {})) return fail('Освободи место в сумке для награды');
  completeQuest(state, quest);
  refreshQuests(state);
  return ok({ id: questId, rewards: quest.rewards || {} });
}

/** Choose the quest shown on the HUD (null = none). */
export function trackQuest(state, questId) {
  if (questId !== null && !state.quests.active[questId]) return fail('Задание не активно');
  state.quests.tracked = questId;
  emit('quest:updated', { id: questId });
  return ok({ id: questId });
}

// ───────────────────────── world events ─────────────────────────

function feedQuest(state, quest, type, payload) {
  const entry = state.quests.active[quest.id];
  if (!entry || entry.ready) return false;
  let touched = false;
  currentStage(quest, entry).objectives.forEach((objective, index) => {
    const need = objectiveNeed(objective);
    const before = entry.progress[index] || 0;
    if (before >= need) return;
    const gain = objectiveGain(objective, type, payload);
    if (gain <= 0) return;
    entry.progress[index] = Math.min(need, before + gain);
    touched = true;
  });
  return touched;
}

/**
 * Single entry for world events: world:kill, world:gather, world:talk, world:enter, world:poi-cleared, world:chest,
 * craft:done, trade:buy, trade:sell, time:newday — and caravan:* (delivered by the caravan module itself).
 */
export function handleWorldEvent(state, type, payload = {}) {
  if (type === 'world:poi-cleared' && payload.poiId) setFlagRaw(state, `poi:${payload.poiId}`, true);
  boardWorldEvent(state, type, payload);
  for (const questId of Object.keys(state.quests.active)) {
    const quest = QUESTS[questId];
    if (quest && feedQuest(state, quest, type, payload) && !stageWillSettle(state, quest)) emit('quest:updated', { id: questId });
  }
  refreshQuests(state);
}

function stageWillSettle(state, quest) {
  return stageComplete(state, quest, state.quests.active[quest.id]);
}

setCaravanListener(handleWorldEvent);

// ───────────────────────── journal ─────────────────────────

function objectiveView(state, objective, counted) {
  const need = objectiveNeed(objective);
  const cur = objectiveAmount(state, objective, counted);
  return { text: objective.text, cur, need, done: cur >= need, optional: false };
}

function questMarker(state, quest, entry) {
  if (entry.ready) return npcPlace(quest.turnIn || quest.giver);
  const stage = currentStage(quest, entry);
  for (let index = 0; index < stage.objectives.length; index++) {
    const objective = stage.objectives[index];
    if (objectiveAmount(state, objective, entry.progress[index] || 0) >= objectiveNeed(objective)) continue;
    const marker = objectiveMarker(objective);
    if (marker) return marker;
  }
  return null;
}

function questView(state, quest) {
  const entry = state.quests.active[quest.id];
  const doneDay = state.quests.done[quest.id];
  const base = {
    id: quest.id, title: quest.title, category: quest.category, act: quest.act || null,
    cityKey: quest.cityKey, giver: quest.giver, turnIn: quest.turnIn || quest.giver, desc: quest.desc,
    rewards: { coins: 0, xp: 0, rep: {}, items: {}, ...(quest.rewards || {}) },
    tracked: state.quests.tracked === quest.id,
  };
  if (!entry) return { ...base, stage: 'Завершено.', objectives: [], status: 'done', marker: null, doneDay };
  const stage = currentStage(quest, entry);
  return {
    ...base,
    stage: entry.ready ? (quest.readyText || 'Дело сделано. Осталось вернуться за наградой.') : stage.text,
    stageIndex: entry.stage, stageCount: quest.stages.length,
    objectives: stage.objectives.map((objective, index) => objectiveView(state, objective, entry.progress[index] || 0)),
    status: entry.ready ? 'ready' : 'active',
    marker: questMarker(state, quest, entry),
  };
}

const CATEGORY_ORDER = { main: 0, side: 1, contract: 2, bounty: 3 };

/**
 * Journal entries: active and ready quests plus accepted bounties (and finished quests with {includeDone:true}).
 * @returns {Array<{id,title,category,cityKey,giver,desc,stage,objectives:[{text,cur,need,done}],rewards,status,marker,tracked}>}
 */
export function listQuests(state, { includeDone = false } = {}) {
  refreshQuests(state);
  const list = Object.keys(state.quests.active).filter(id => QUESTS[id]).map(id => questView(state, QUESTS[id]));
  list.push(...boardJournal(state));
  if (includeDone) {
    for (const questId of Object.keys(state.quests.done)) if (QUESTS[questId]) list.push(questView(state, QUESTS[questId]));
  }
  return list.sort((a, b) => CATEGORY_ORDER[a.category] - CATEGORY_ORDER[b.category]);
}

/** The tracked quest as a journal entry, or null. */
export function trackedQuest(state) {
  const questId = state.quests.tracked;
  if (!questId || !state.quests.active[questId] || !QUESTS[questId]) return null;
  return questView(state, QUESTS[questId]);
}
