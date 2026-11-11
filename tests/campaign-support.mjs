// Shared helpers for the campaign tests: a fake engine that drives caravan runs,
// and a "player" that completes quests only through the public API (world events + dialogue).
import assert from 'node:assert/strict';
import { createState } from '../src/sim/state.js';
import '../src/sim/player.js';
import '../src/sim/time.js';
import { addItem, countItem, hasItems } from '../src/sim/inventory.js';
import { addCoins, grantXp } from '../src/sim/player.js';
import { addRep } from '../src/sim/reputation.js';
import { CITIES, LEGS, REGIONS, poiById } from '../src/data/world-map.js';
import { QUESTS } from '../src/data/quests.js';
import { DIALOGUES } from '../src/data/dialogues.js';
import {
  caravanTick, caravanReport, caravanPosition, launchCaravan, contributeCargo, manifestLines, manifestProgress,
  payToll, selectGuildLeg, currentLeg,
} from '../src/sim/caravan.js';
import { handleWorldEvent, questStatus, getFlag, CREATURE_FAMILIES } from '../src/sim/quests.js';
import { startDialogue, chooseOption } from '../src/sim/dialogue.js';

export function newGame() {
  const state = createState({ name: 'Тест', classId: 'warrior' });
  state.inv.extraSlots = 400; // tests carry whole manifests in the bag
  return state;
}

// ───────────────────────── caravan ─────────────────────────

export function movePlayerToCity(state, cityIndex) {
  state.player.x = CITIES[cityIndex].x;
  state.player.z = CITIES[cityIndex].z;
}

/** Put every missing manifest unit into the bag and hand it in. */
export function fillManifest(state) {
  for (const line of manifestLines(state)) {
    const missing = line.count - (state.caravan.delivered[line.itemId] || 0);
    if (missing <= 0) continue;
    addItem(state, line.itemId, missing);
    const result = contributeCargo(state, line.itemId, missing);
    assert.ok(result.ok, result.reason);
  }
  assert.ok(manifestProgress(state).full);
}

/**
 * Fake engine: ticks the run, "kills" every spawn, clears every obstacle.
 * hooks: {onSpawn(directive) → 'pay' | undefined, onDirective(directive), night, raining}
 * @returns {{outcome:'arrived'|'failed'|'timeout', directives, seconds, result}}
 */
export function driveRun(state, hooks = {}) {
  const log = [];
  for (let second = 0; second < 6000; second++) {
    const position = caravanPosition(state);
    const ctx = { playerX: position?.x ?? 0, playerZ: position?.z ?? 0, enemiesAlive: 0, night: !!hooks.night, raining: !!hooks.raining };
    const directives = caravanTick(state, 1, ctx);
    for (const directive of directives) {
      log.push(directive);
      hooks.onDirective?.(directive);
      if (directive.type === 'arrived') return { outcome: 'arrived', directives: log, seconds: second, result: directive.result };
      if (directive.type === 'failed') return { outcome: 'failed', directives: log, seconds: second, result: directive.result };
      if (directive.type === 'spawn') {
        const answer = hooks.onSpawn?.(directive);
        if (answer === 'pay' && directive.toll) assert.ok(payToll(state).ok);
        else if (state.caravan.run) caravanReport(state, { type: 'event-cleared', eventId: directive.eventId });
      }
      if (directive.type === 'obstacle') {
        const usedItems = !!directive.needs && hasItems(state, directive.needs);
        assert.ok(caravanReport(state, { type: 'obstacle-cleared', usedItems }).ok);
      }
    }
  }
  return { outcome: 'timeout', directives: log, seconds: 6000, result: null };
}

/** Fill, launch and drive the leg that is currently being prepared. */
export function runCurrentLeg(state, hooks = {}) {
  const leg = currentLeg(state);
  fillManifest(state);
  movePlayerToCity(state, LEGS[leg].from);
  const launched = launchCaravan(state);
  assert.ok(launched.ok, launched.reason);
  return driveRun(state, hooks);
}

// ───────────────────────── dialogue walking ─────────────────────────

function pick(state, npcId, view, predicate, label) {
  const option = view.options.find(predicate);
  assert.ok(option, `нет нужной реплики (${label}) у ${npcId}: ${view.options.map(o => o.text).join(' | ')}`);
  assert.ok(!option.disabled, `реплика недоступна (${label}) у ${npcId}`);
  const result = chooseOption(state, npcId, view.node.id, option.index);
  assert.ok(result.ok, result.reason);
  return result;
}

function open(state, npcId) {
  const view = startDialogue(state, npcId);
  assert.ok(view.ok, `${npcId}: ${view.reason}`);
  return view;
}

/** Static search: which npc has an option whose effects satisfy `matches(effect)`? Returns {npcId, texts:[…]}. */
function findOptionPath(matches) {
  for (const [npcId, tree] of Object.entries(DIALOGUES)) {
    const walk = (nodeId, texts, depth) => {
      if (depth > 5) return null;
      for (const option of tree.nodes[nodeId].options) {
        const path = [...texts, option.text];
        if ((option.effects || []).some(matches)) return path;
        if (option.next && option.next !== 'root' && tree.nodes[option.next]) {
          const deeper = walk(option.next, path, depth + 1);
          if (deeper) return deeper;
        }
      }
      return null;
    };
    const texts = walk('root', [], 0);
    if (texts) return { npcId, texts };
  }
  return null;
}

/** Items a hidden option waits for (`if: {has}`), looked up in the static tree. */
function missingItemsFor(state, npcId, text) {
  const items = [];
  for (const node of Object.values(DIALOGUES[npcId].nodes)) {
    for (const option of node.options.filter(entry => entry.text === text)) {
      for (const cond of [].concat(option.if || [])) {
        for (const [itemId, count] of Object.entries(cond.has || {})) if (countItem(state, itemId) < count) items.push(itemId);
      }
    }
  }
  return items;
}

function replayPath(state, { npcId, texts }, depth = 0) {
  let view = open(state, npcId);
  for (const text of texts) {
    if (!view.options.some(option => option.text === text) && depth < 2) {
      // the option needs an item that another conversation hands out — go and get it first
      for (const itemId of missingItemsFor(state, npcId, text)) {
        const source = findOptionPath(effect => effect.give && effect.give[itemId]);
        assert.ok(source, `никто не выдаёт ${itemId}`);
        replayPath(state, source, depth + 1);
      }
      return replayPath(state, { npcId, texts }, depth + 1);
    }
    view = pick(state, npcId, view, option => option.text === text, text);
  }
  return view;
}

const flagOf = effect => (Array.isArray(effect.flag) ? effect.flag[0] : effect.flag);

/** Set a story flag the way a player would: through the dialogue option that sets it. */
export function reachFlag(state, flag) {
  if (getFlag(state, flag)) return;
  const path = findOptionPath(effect => flagOf(effect) === flag);
  assert.ok(path, `ни одна реплика не ставит флаг ${flag}`);
  replayPath(state, path);
  assert.ok(getFlag(state, flag), `флаг ${flag} не поставлен`);
}

// ───────────────────────── quest solving ─────────────────────────

function creatureFor(objective) {
  return objective.creatureId || CREATURE_FAMILIES[objective.family][0];
}

function killPoint(objective) {
  if (objective.poiId) return poiById(objective.poiId);
  if (objective.regionId) return REGIONS.find(region => region.id === objective.regionId);
  return { x: 50, z: 50 };
}

function solveCaravan(state, objective, hooks) {
  if (objective.guild && currentLeg(state) === null) assert.ok(selectGuildLeg(state, 0).ok);
  if (objective.event === 'manifest-full') return fillManifest(state);
  if (objective.event === 'launched') {
    fillManifest(state);
    movePlayerToCity(state, LEGS[currentLeg(state)].from);
    const launched = launchCaravan(state);
    return assert.ok(launched.ok, launched.reason);
  }
  if (objective.event === 'arrived') {
    if (!state.caravan.run) {
      fillManifest(state);
      movePlayerToCity(state, LEGS[currentLeg(state)].from);
      assert.ok(launchCaravan(state).ok);
    }
    const run = driveRun(state, hooks);
    return assert.equal(run.outcome, 'arrived');
  }
  throw new Error(`caravan objective ${objective.event}`);
}

function solveFlag(state, objective, options) {
  const names = objective.any || [objective.flag];
  const poiFlag = names.find(name => name.startsWith('poi:'));
  if (poiFlag && (options.preferPoi || names.length === 1)) {
    return handleWorldEvent(state, 'world:poi-cleared', { poiId: poiFlag.slice(4) });
  }
  const storyFlags = names.filter(name => !name.startsWith('poi:'));
  const index = options.secondChoice ? storyFlags.length - 1 : 0;
  return reachFlag(state, storyFlags[index]);
}

function solveTalk(state, questId, objective) {
  const view = open(state, objective.npcId);
  if (!objective.topic) return;
  pick(state, objective.npcId, view, option => option.kind === 'questTalk' && option.questId === questId, objective.topic);
}

function solveObjective(state, questId, objective, need, options) {
  switch (objective.type) {
    case 'kill': {
      const point = killPoint(objective);
      for (let n = 0; n < need; n++) {
        handleWorldEvent(state, 'world:kill', { creatureId: creatureFor(objective), level: 1, x: point.x, z: point.z, poiId: objective.poiId || null, boss: false });
      }
      return;
    }
    case 'gather': return handleWorldEvent(state, 'world:gather', { nodeType: objective.itemId, itemId: objective.itemId, count: need });
    case 'craft': return handleWorldEvent(state, 'craft:done', { recipeId: objective.recipeId || 'test', itemId: objective.itemId || 'plank', count: need });
    case 'collect':
    case 'deliver': {
      const missing = need - countItem(state, objective.itemId);
      if (missing > 0) assert.equal(addItem(state, objective.itemId, missing), missing);
      return;
    }
    case 'talk': return solveTalk(state, questId, objective);
    case 'visit': return handleWorldEvent(state, 'world:enter', { cityKey: objective.cityKey || null, poiId: objective.poiId || null, regionId: objective.regionId || null });
    case 'clearPoi': return handleWorldEvent(state, 'world:poi-cleared', { poiId: objective.poiId });
    case 'chest': return handleWorldEvent(state, 'world:chest', { poiId: objective.poiId });
    case 'caravan': return solveCaravan(state, objective, options.hooks);
    case 'trade': return handleWorldEvent(state, 'caravan:trade-profit', { profit: need });
    case 'level': return grantXp(state, 1e6);
    case 'rep': return void addRep(state, objective.cityKey, need);
    case 'flag': return solveFlag(state, objective, options);
    default: throw new Error(`unknown objective type ${objective.type}`);
  }
}

function acceptQuest(state, quest) {
  if (questStatus(state, quest.id) !== 'available') return;
  assert.ok(!quest.auto, `${quest.id}: авто-задание не стартовало`);
  let view = open(state, quest.giver);
  view = pick(state, quest.giver, view, option => option.kind === 'quest' && option.questId === quest.id, `взять ${quest.id}`);
  pick(state, quest.giver, view, option => option.kind === 'questAccept', `согласиться на ${quest.id}`);
}

/**
 * Complete a quest like a player: take it from the giver, satisfy objectives stage by stage, hand it in.
 * options: {preferPoi, secondChoice, hooks}
 */
export function solveQuest(state, questId, options = {}) {
  const quest = QUESTS[questId];
  if (state.player.coins < 500) addCoins(state, 1000);
  assert.notEqual(questStatus(state, questId), 'locked', `${questId} заперт`);
  acceptQuest(state, quest);
  for (let guard = 0; guard < 30 && questStatus(state, questId) === 'active'; guard++) {
    const entry = state.quests.active[questId];
    const stage = quest.stages[entry.stage];
    stage.objectives.forEach((objective, index) => {
      const live = state.quests.active[questId];
      if (!live || live.ready || live.stage !== entry.stage) return;
      const need = objective.type === 'trade' ? objective.profit : objective.type === 'rep' ? objective.value : objective.type === 'level' ? objective.level : objective.count || 1;
      solveObjective(state, questId, objective, need, options);
    });
    handleWorldEvent(state, 'world:enter', { cityKey: null, poiId: null, regionId: 'valley' });
  }
  if (questStatus(state, questId) === 'done') return;
  assert.equal(questStatus(state, questId), 'ready', `${questId} не дошёл до сдачи`);
  const turnInNpc = quest.turnIn || quest.giver;
  const view = open(state, turnInNpc);
  pick(state, turnInNpc, view, option => option.kind === 'questTurnIn' && option.questId === questId, `сдать ${questId}`);
  assert.equal(questStatus(state, questId), 'done', `${questId} не сдан`);
}
