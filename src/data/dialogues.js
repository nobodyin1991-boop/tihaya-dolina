// Dialogue trees. Pure data: profiles (dialogues-*.js) are expanded here into node graphs.
//
// Profile (what the writers fill in), keyed by npcId:
//   { greet,                  first meeting line
//     hello: [..],            later greetings (rotated)
//     about,                  answer to "Расскажи о себе."
//     rumors: [{text, if?}],  answers to "Что слышно?" (conditions pick what fits the story so far)
//     extra: [choice(...)] }  conditional custom branches (story decisions) — see dialogue-kit.js
//
// Tree: { root: 'root', nodes: { [id]: node } }
// Node: { id, speaker: npcId, text?, variants?: [{if, text}], pool?: [{text, if?}], onEnter?: [effect…],
//         options: [{ text, kind, if?, need?, effects?, next: nodeId | null }] }
//   text resolution: first matching `variants` entry → else a line from `pool` (rotates with time) → else `text`.
//   `if` hides an option, `need` shows it disabled. `next: null` ends the conversation.
// Quest options (offer / talk topic / turn-in / reminder) are not stored here — sim/dialogue.js adds them
// to the root node from the quest catalog.
import { NPC_LIST } from './npcs.js';
import { VALLEY_TALK } from './dialogues-valley.js';
import { FORD_TALK } from './dialogues-ford.js';
import { HARBOR_TALK } from './dialogues-harbor.js';
import { POI_TALK } from './dialogues-poi.js';

export const TALK_PROFILES = { ...VALLEY_TALK, ...FORD_TALK, ...HARBOR_TALK, ...POI_TALK };

/** Player lines shared by every tree. */
export const COMMON_LINES = {
  about: 'Расскажи о себе.',
  rumor: 'Что слышно?',
  moreRumor: 'А ещё что говорят?',
  back: 'Понятно.',
  backToTopics: 'У меня ещё вопрос.',
  bye: 'Бывай.',
  again: ['Что-нибудь ещё?', 'Ещё что?', 'Слушаю.', 'Ну?'],
  noRumor: 'Да ничего нового. Живём, как жили.',
};

const backOption = () => ({ text: COMMON_LINES.back, kind: 'back', next: 'root' });

/** Expand a custom branch into nodes; returns the option that leads into it. */
function addBranch(nodes, npcId, key, branch) {
  const option = { text: branch.text, kind: 'choice', next: 'root' };
  if (branch.if) option.if = branch.if;
  if (branch.need) option.need = branch.need;
  if (branch.effects) option.effects = branch.effects;
  if (!branch.reply) return option;
  const subOptions = (branch.options || []).map((sub, index) => addBranch(nodes, npcId, `${key}.${index}`, sub));
  nodes[key] = {
    id: key, speaker: npcId, text: branch.reply,
    options: subOptions.length ? subOptions : [backOption()],
  };
  option.next = key;
  return option;
}

function buildTree(npc, profile) {
  const nodes = {};
  const options = (profile.extra || []).map((branch, index) => addBranch(nodes, npc.id, `x${index}`, branch));
  options.push({ text: COMMON_LINES.about, kind: 'about', next: 'about' });
  if (profile.rumors?.length) options.push({ text: COMMON_LINES.rumor, kind: 'rumor', next: 'rumor' });
  for (const service of npc.services) {
    options.push({ text: service.label, kind: 'service', effects: [{ open: service.open }], next: null });
  }
  options.push({ text: COMMON_LINES.bye, kind: 'leave', next: null });

  nodes.root = {
    id: 'root', speaker: npc.id,
    variants: [{ if: { notFlag: `met:${npc.id}` }, text: profile.greet }],
    pool: profile.hello.map(text => ({ text })),
    again: COMMON_LINES.again,
    onEnter: [{ flag: `met:${npc.id}` }],
    options,
  };
  nodes.about = { id: 'about', speaker: npc.id, text: profile.about, options: [{ text: COMMON_LINES.backToTopics, kind: 'back', next: 'root' }] };
  nodes.rumor = {
    id: 'rumor', speaker: npc.id, text: COMMON_LINES.noRumor, pool: profile.rumors || [],
    options: [{ text: COMMON_LINES.backToTopics, kind: 'back', next: 'root' }],
  };
  return { root: 'root', nodes };
}

/** Dialogue tree per npc id. */
export const DIALOGUES = {};
for (const npc of NPC_LIST) {
  const profile = TALK_PROFILES[npc.id];
  if (!profile) throw new Error(`No dialogue profile for ${npc.id}`);
  DIALOGUES[npc.id] = buildTree(npc, profile);
}
