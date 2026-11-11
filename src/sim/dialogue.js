// Dialogue runtime: walks the data-driven trees, adds quest options, applies effects. Pure.
// The `flags` slice (story decisions, "met" marks) is shared with quests — see quest-rules.js.
//
//   startDialogue(state, npcId)                → ok({npc, node, options:[{index, text, kind, disabled}]})
//   chooseOption(state, npcId, nodeId, index)  → ok({node|null, options, uiAction?, results})
// `node` = {id, speaker, speakerName, text}; node === null means the conversation is over.
// `uiAction` = {open:'shop'|'craft'|'train'|'caravan'|'storage'|'board'|'bounties'|'stable'|'guards'|'rest'|'trade', npcId, cityKey}.
import { ok, fail } from './state.js';
import { hash2, seedFrom } from '../core/noise.js';
import { NPCS } from '../data/npcs.js';
import { DIALOGUES, COMMON_LINES } from '../data/dialogues.js';
import { QUESTS } from '../data/quests.js';
import {
  handleWorldEvent, availableQuests, readyQuests, applyEffects, checkCondition, setFlag, getFlag,
} from './quests.js';

export { getFlag, setFlag };

const DEFAULT_TALK = {
  ask: 'Есть для меня работа?',
  accept: 'Берусь.',
  decline: 'Не сейчас.',
  remind: 'Дело ещё не сделано. Возвращайся, когда закончишь.',
  done: 'Сделано? Добро. Держи, что обещано.',
  turnInLine: 'Дело сделано.',
  remindAsk: 'Напомни, что нужно сделать.',
};

const questTalk = quest => ({ ...DEFAULT_TALK, ...(quest.talk || {}) });

// ───────────────────────── text ─────────────────────────

function rotate(list, state, salt) {
  const day = state.time?.day || 1;
  const hour = Math.floor(state.time?.hour || 0);
  return list[Math.floor(hash2(day, hour, salt) * list.length)];
}

function nodeText(state, npcId, node, returning) {
  const salt = seedFrom(npcId) % 9973;
  if (returning && node.again) return rotate(node.again, state, salt);
  for (const variant of node.variants || []) if (checkCondition(state, variant.if)) return variant.text;
  const pool = (node.pool || []).filter(entry => checkCondition(state, entry.if));
  if (pool.length) return rotate(pool, state, salt).text;
  return node.text || '';
}

// ───────────────────────── quest options and virtual nodes ─────────────────────────

function activeQuestEntries(state) {
  return Object.entries(state.quests.active)
    .filter(([questId]) => QUESTS[questId])
    .map(([questId, entry]) => ({ quest: QUESTS[questId], entry }));
}

function talkTopicOptions(state, npcId) {
  const options = [];
  for (const { quest, entry } of activeQuestEntries(state)) {
    if (entry.ready) continue;
    quest.stages[entry.stage].objectives.forEach((objective, index) => {
      if (objective.type !== 'talk' || !objective.topic || objective.npcId !== npcId) return;
      if ((entry.progress[index] || 0) >= 1) return;
      if (!checkCondition(state, objective.topicIf)) return;
      options.push({
        text: objective.topic, kind: 'questTalk', questId: quest.id,
        effects: [{ talk: [quest.id, index] }], next: `q:${quest.id}:talk:${entry.stage}:${index}`,
      });
    });
  }
  return options;
}

function reminderOptions(state, npcId) {
  const options = [];
  for (const { quest, entry } of activeQuestEntries(state)) {
    if (entry.ready || quest.giver !== npcId || !quest.talk?.remind) continue;
    options.push({ text: `${DEFAULT_TALK.remindAsk} («${quest.title}»)`, kind: 'questRemind', questId: quest.id, next: `q:${quest.id}:remind` });
  }
  return options;
}

function questOptions(state, npcId) {
  const options = [];
  for (const quest of readyQuests(state, npcId)) {
    options.push({
      text: `${DEFAULT_TALK.turnInLine} («${quest.title}»)`, kind: 'questTurnIn', questId: quest.id,
      effects: [{ turnIn: quest.id }], next: `q:${quest.id}:done`,
    });
  }
  options.push(...talkTopicOptions(state, npcId));
  for (const quest of availableQuests(state, npcId)) {
    options.push({ text: questTalk(quest).ask, kind: 'quest', questId: quest.id, next: `q:${quest.id}:offer` });
  }
  options.push(...reminderOptions(state, npcId));
  return options;
}

const backToRoot = (text = COMMON_LINES.backToTopics) => ({ text, kind: 'back', next: 'root' });

/** Nodes generated from quest data: ids look like `q:<questId>:<kind>[:stage:index]`. */
function virtualNode(npcId, nodeId) {
  const [, questId, kind, stageIndex, objectiveIndex] = nodeId.split(':');
  const quest = QUESTS[questId];
  if (!quest) return null;
  const talk = questTalk(quest);
  if (kind === 'offer') {
    return {
      id: nodeId, speaker: npcId, text: talk.offer || quest.desc,
      options: [
        { text: talk.accept, kind: 'questAccept', questId, effects: [{ startQuest: questId }], next: 'root' },
        { text: talk.decline, kind: 'back', next: 'root' },
      ],
    };
  }
  if (kind === 'done') return { id: nodeId, speaker: npcId, text: talk.done, options: [backToRoot()] };
  if (kind === 'remind') return { id: nodeId, speaker: npcId, text: talk.remind, options: [backToRoot()] };
  if (kind === 'talk') {
    const objective = quest.stages[Number(stageIndex)]?.objectives[Number(objectiveIndex)];
    if (!objective) return null;
    return { id: nodeId, speaker: npcId, text: objective.reply || '…', options: [backToRoot()] };
  }
  return null;
}

function findNode(npcId, nodeId) {
  if (nodeId.startsWith('q:')) return virtualNode(npcId, nodeId);
  return DIALOGUES[npcId]?.nodes[nodeId] || null;
}

// ───────────────────────── views ─────────────────────────

/** Options of a node that are visible right now (quest options first on the root). */
function visibleOptions(state, npcId, node) {
  const dynamic = node.id === 'root' ? questOptions(state, npcId) : [];
  const fixed = node.options.filter(option => checkCondition(state, option.if));
  return [...dynamic, ...fixed];
}

function optionViews(state, options) {
  return options.map((option, index) => ({
    index, text: option.text, kind: option.kind || 'choice',
    questId: option.questId || null,
    disabled: !checkCondition(state, option.need),
  }));
}

function nodeView(state, npcId, node, returning) {
  return {
    id: node.id, speaker: node.speaker, speakerName: NPCS[node.speaker]?.name || '',
    text: nodeText(state, npcId, node, returning),
  };
}

// ───────────────────────── API ─────────────────────────

/** Begin talking to an npc. Also counts as `world:talk` for quests. */
export function startDialogue(state, npcId) {
  const npc = NPCS[npcId];
  const tree = DIALOGUES[npcId];
  if (!npc || !tree) return fail('С ним не о чем говорить');
  handleWorldEvent(state, 'world:talk', { npcId });
  const node = tree.nodes[tree.root];
  const view = nodeView(state, npcId, node, false);
  if (node.onEnter) applyEffects(state, node.onEnter);
  const options = optionViews(state, visibleOptions(state, npcId, node));
  return ok({ npc: { id: npc.id, name: npc.name, title: npc.title, cityKey: npc.cityKey, poiId: npc.poiId }, node: view, options });
}

function uiActionOf(option, npcId) {
  const open = (option.effects || []).find(effect => effect.open);
  if (!open) return null;
  const npc = NPCS[npcId];
  return { open: open.open, npcId, cityKey: npc.cityKey || npc.homeCity || null };
}

/**
 * Pick option `index` of node `nodeId` (indices as returned in `options`).
 * @returns ok({node|null, options, uiAction?, results:[{kind, text, …}]}) | fail
 */
export function chooseOption(state, npcId, nodeId, index) {
  const node = findNode(npcId, nodeId);
  if (!node) return fail('Разговор уже окончен');
  const option = visibleOptions(state, npcId, node)[index];
  if (!option) return fail('Такого ответа нет');
  if (!checkCondition(state, option.need)) return fail('Сейчас это невозможно');

  const results = applyEffects(state, (option.effects || []).filter(effect => !effect.open));
  const failed = results.some(result => result.kind === 'fail');
  const uiAction = uiActionOf(option, npcId);
  const nextId = failed ? 'root' : option.next;
  const nextNode = nextId ? findNode(npcId, nextId) : null;
  const response = { node: null, options: [], results };
  if (uiAction) response.uiAction = uiAction;
  if (!nextNode) return ok(response);
  response.node = nodeView(state, npcId, nextNode, nextId === 'root');
  response.options = optionViews(state, visibleOptions(state, npcId, nextNode));
  return ok(response);
}

/** Does this npc have something quest-related to say? For markers above heads: 'turnIn' | 'offer' | 'talk' | null. */
export function npcQuestMarker(state, npcId) {
  if (readyQuests(state, npcId).length) return 'turnIn';
  if (availableQuests(state, npcId).length) return 'offer';
  if (talkTopicOptions(state, npcId).length) return 'talk';
  return null;
}
