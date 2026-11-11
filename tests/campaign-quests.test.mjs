// Quests, dialogue, board, time and reputation — including the whole main chain played end-to-end.
import test from 'node:test';
import assert from 'node:assert/strict';
import { hydrateState } from '../src/sim/state.js';
import { addItem, countItem } from '../src/sim/inventory.js';
import { addCoins } from '../src/sim/player.js';
import { on } from '../src/core/events.js';
import { MAIN_QUESTS, SIDE_QUESTS, QUESTS } from '../src/data/quests.js';
import { NPC_LIST } from '../src/data/npcs.js';
import {
  startQuest, handleWorldEvent, turnIn, listQuests, trackQuest, availableQuests, questStatus, questLeads, getFlag, trackedQuest,
} from '../src/sim/quests.js';
import { startDialogue, chooseOption, npcQuestMarker } from '../src/sim/dialogue.js';
import { listContracts, fulfilContract, pinContract, listBounties, acceptBounty, claimBounty } from '../src/sim/board.js';
import { tickTime, sleepUntil, isNight, formatTime, timeView, DAY_REAL_SECONDS, WEATHERS } from '../src/sim/time.js';
import { addRep, repRank, guardLimit, REP_RANKS } from '../src/sim/reputation.js';
import { RING_COMPLETE } from '../src/sim/caravan.js';
import { newGame, solveQuest } from './campaign-support.mjs';

test('time: day length, new day event, night, sleep, weather', () => {
  const state = newGame();
  assert.equal(DAY_REAL_SECONDS, 36 * 60);
  assert.equal(formatTime(state), 'День 1, 08:00');
  const days = [];
  const off = on('time:newday', payload => days.push(payload.day));
  let result = tickTime(state, DAY_REAL_SECONDS / 2);
  assert.equal(result.newDay, false);
  assert.ok(Math.abs(state.time.hour - 20) < 1e-6);
  assert.equal(isNight(state), false);
  result = tickTime(state, DAY_REAL_SECONDS / 4);
  assert.equal(result.newDay, true);
  assert.equal(state.time.day, 2);
  assert.ok(isNight(state));
  const slept = sleepUntil(state, 7);
  assert.ok(slept.ok);
  assert.equal(state.time.hour, 7);
  assert.equal(state.time.day, 2);
  assert.ok(sleepUntil(state, 6).newDay);
  assert.deepEqual(days, [2, 3]);
  off();
  const seen = new Set();
  for (let step = 0; step < 400; step++) {
    tickTime(state, DAY_REAL_SECONDS / 4);
    seen.add(state.time.weather);
    assert.ok(state.time.hour >= 0 && state.time.hour < 24);
  }
  assert.ok(seen.size >= 4, `weather variety: ${[...seen]}`);
  for (const weather of seen) assert.ok(WEATHERS.includes(weather));
  assert.ok(timeView(state).text.startsWith('День '));
});

test('reputation: ranks, clamping, guard limit', () => {
  const state = newGame();
  assert.equal(repRank(state, 'ford').name, 'Чужак');
  assert.equal(guardLimit(state, 'ford'), 1);
  const changes = [];
  const off = on('rep:changed', payload => changes.push(payload));
  addRep(state, 'ford', 20);
  assert.equal(repRank(state, 'ford').name, 'Знакомый');
  addRep(state, 'ford', 500);
  assert.equal(state.rep.ford, 100);
  assert.equal(repRank(state, 'ford').name, 'Почётный гражданин');
  assert.equal(repRank(state, 'ford').next, null);
  assert.equal(guardLimit(state, 'ford'), 4);
  addRep(state, 'ford', -1000);
  assert.equal(state.rep.ford, 0);
  off();
  assert.equal(changes.length, 3);
  assert.equal(REP_RANKS.length, 5);
});

test('dialogue: greeting, topics, services return a ui action', () => {
  const state = newGame();
  const first = startDialogue(state, 'valley:smith');
  assert.ok(first.ok);
  assert.equal(first.npc.name, 'Добрыня Горн');
  assert.ok(getFlag(state, 'met:valley:smith'));
  const second = startDialogue(state, 'valley:smith');
  assert.notEqual(second.node.text, first.node.text, 'first-meeting greeting is said once');

  const about = chooseOption(state, 'valley:smith', 'root', second.options.find(option => option.kind === 'about').index);
  assert.ok(about.node.text.includes('Гордей'));
  const back = chooseOption(state, 'valley:smith', about.node.id, 0);
  assert.equal(back.node.id, 'root');
  const rumor = chooseOption(state, 'valley:smith', 'root', back.options.find(option => option.kind === 'rumor').index);
  assert.ok(rumor.node.text.length > 20);
  const service = chooseOption(state, 'valley:smith', 'root', back.options.find(option => option.kind === 'service').index);
  assert.equal(service.node, null);
  assert.deepEqual(service.uiAction, { open: 'craft', npcId: 'valley:smith', cityKey: 'valley' });
  const bye = chooseOption(state, 'valley:smith', 'root', back.options.find(option => option.kind === 'leave').index);
  assert.equal(bye.node, null);
  assert.equal(bye.uiAction, undefined);
  assert.equal(chooseOption(state, 'valley:smith', 'root', 99).ok, false);
  assert.equal(startDialogue(state, 'nobody:here').ok, false);

  const captain = startDialogue(state, 'valley:captain');
  const opens = captain.options.filter(option => option.kind === 'service').map(option => chooseOption(state, 'valley:captain', 'root', option.index).uiAction.open);
  assert.deepEqual(opens, ['guards', 'bounties']);
});

test('every npc can be greeted and every root option can be chosen', () => {
  const state = newGame();
  for (const npc of NPC_LIST) {
    const view = startDialogue(state, npc.id);
    assert.ok(view.ok && view.node.text.length > 5, npc.id);
    for (const option of view.options) {
      if (option.kind === 'quest' || option.kind === 'questTalk') continue;
      const result = chooseOption(state, npc.id, 'root', option.index);
      assert.ok(result.ok, `${npc.id}: ${option.text}`);
      if (result.node) assert.ok(result.node.text.length > 1 && result.options.length >= 1, `${npc.id}: ${option.text}`);
    }
  }
});

test('quest flow: offer through dialogue, progress from world events, turn-in with rewards', () => {
  const state = newGame();
  const events = [];
  const offs = ['quest:started', 'quest:updated', 'quest:completed'].map(type => on(type, payload => events.push(`${type}:${payload.id}`)));
  assert.deepEqual(listQuests(state).map(quest => quest.id), ['m01-arrival'], 'the prologue starts by itself');
  assert.equal(npcQuestMarker(state, 'valley:elder'), 'talk');
  assert.equal(startQuest(state, 'm02-earn-bread').ok, false, 'locked');
  solveQuest(state, 'm01-arrival');
  assert.equal(questStatus(state, 'm01-arrival'), 'done');
  assert.deepEqual(availableQuests(state, 'valley:elder').map(quest => quest.id), ['m02-earn-bread']);
  assert.equal(npcQuestMarker(state, 'valley:elder'), 'offer');
  assert.ok(questLeads(state).some(lead => lead.id === 'm03-wolves' && lead.marker));

  assert.ok(startQuest(state, 'm03-wolves').ok);
  assert.equal(startQuest(state, 'm03-wolves').ok, false);
  handleWorldEvent(state, 'world:kill', { creatureId: 'rabbit', x: 0, z: 0, poiId: null });
  handleWorldEvent(state, 'world:kill', { creatureId: 'wolf', x: 0, z: 0, poiId: null });
  handleWorldEvent(state, 'world:kill', { creatureId: 'alpha_wolf', x: 0, z: 0, poiId: null });
  let journal = listQuests(state).find(quest => quest.id === 'm03-wolves');
  assert.deepEqual(journal.objectives.map(objective => [objective.cur, objective.need, objective.done]), [[2, 5, false]]);
  assert.equal(journal.status, 'active');
  assert.equal(journal.category, 'main');
  assert.ok(journal.rewards.coins > 0);
  assert.equal(turnIn(state, 'm03-wolves').ok, false);
  for (let n = 0; n < 5; n++) handleWorldEvent(state, 'world:kill', { creatureId: 'wolf', x: 0, z: 0, poiId: null });
  journal = listQuests(state).find(quest => quest.id === 'm03-wolves');
  assert.equal(journal.status, 'ready');
  assert.deepEqual(journal.marker, { x: 0, z: 0 }, 'marker points at the captain');
  assert.equal(npcQuestMarker(state, 'valley:captain'), 'turnIn');
  const coins = state.player.coins;
  const rep = state.rep.valley;
  assert.ok(turnIn(state, 'm03-wolves').ok);
  assert.ok(state.player.coins > coins && state.rep.valley > rep);
  assert.equal(turnIn(state, 'm03-wolves').ok, false);
  assert.ok(events.includes('quest:started:m03-wolves') && events.includes('quest:completed:m03-wolves'));
  offs.forEach(off => off());

  // deliver objectives: live count, items are taken at turn-in
  assert.ok(startQuest(state, 'm02-earn-bread').ok);
  assert.ok(trackQuest(state, 'm02-earn-bread').ok);
  assert.equal(trackedQuest(state).id, 'm02-earn-bread');
  addItem(state, 'wood', 10);
  addItem(state, 'herb', 6);
  assert.equal(listQuests(state).find(quest => quest.id === 'm02-earn-bread').status, 'ready');
  const view = startDialogue(state, 'valley:quartermaster');
  const option = view.options.find(entry => entry.kind === 'questTurnIn');
  const done = chooseOption(state, 'valley:quartermaster', 'root', option.index);
  assert.ok(done.node.text.includes('Сходится'));
  assert.ok(done.results.some(result => result.kind === 'questDone'));
  assert.equal(countItem(state, 'wood'), 0);
  assert.equal(countItem(state, 'bread'), 3);
});

test('choices have consequences: flags, reputation, items', () => {
  const state = newGame();
  addCoins(state, 1000);
  for (const quest of MAIN_QUESTS.slice(0, 6)) solveQuest(state, quest.id);
  assert.equal(questStatus(state, 'm07-kosoy'), 'available');
  const rep = state.rep.valley;
  const coins = state.player.coins;
  solveQuest(state, 'm07-kosoy'); // through the hunter: pays 150
  assert.ok(getFlag(state, 'kosoy:deal'));
  assert.ok(!getFlag(state, 'poi:camp-kosoy'));
  assert.ok(state.player.coins < coins + QUESTS['m07-kosoy'].rewards.coins, 'paid Kosoy off');
  assert.ok(state.rep.valley < rep + QUESTS['m07-kosoy'].rewards.rep.valley, 'the captain disapproves');

  solveQuest(state, 'sv-thief', { secondChoice: true });
  assert.ok(getFlag(state, 'senka:apprentice') && !getFlag(state, 'senka:jailed'));
  const carpenter = startDialogue(state, 'valley:carpenter');
  assert.ok(carpenter.ok);
});

for (const mode of [{ name: 'deals and decisions', options: {} }, { name: 'camps stormed', options: { preferPoi: true, secondChoice: true } }]) {
  test(`main chain is completable end-to-end (${mode.name})`, () => {
    const state = newGame();
    for (const quest of MAIN_QUESTS) {
      solveQuest(state, quest.id, mode.options);
      assert.equal(questStatus(state, quest.id), 'done', quest.id);
    }
    assert.equal(state.caravan.stage, RING_COMPLETE);
    assert.ok(getFlag(state, 'ring:restored'));
    assert.ok(getFlag(state, 'scout:leg0') && getFlag(state, 'scout:leg1') && getFlag(state, 'scout:leg2'));
    assert.equal(getFlag(state, 'poi:fort-raven'), !!mode.options.preferPoi);
    assert.ok(state.caravan.stats.arrived >= 4, 'three story legs and a guild run');
    assert.ok(state.player.level > 5);
    assert.ok(state.rep.valley >= 60);
    assert.equal(listQuests(state).filter(quest => quest.category === 'main').length, 0);
    assert.ok(listQuests(state, { includeDone: true }).filter(quest => quest.status === 'done').length >= MAIN_QUESTS.length);

    // every side quest is completable once the ring is whole
    for (const quest of SIDE_QUESTS) solveQuest(state, quest.id, mode.options);
    assert.equal(Object.keys(state.quests.active).length, 0);

    // the whole campaign state survives a save
    const copy = hydrateState(JSON.parse(JSON.stringify(state)));
    for (const slice of ['quests', 'flags', 'caravan', 'board', 'rep', 'time']) assert.deepEqual(copy[slice], state[slice], slice);
  });
}

test('save round-trip keeps an active quest and drops unknown ones', () => {
  const state = newGame();
  solveQuest(state, 'm01-arrival');
  startQuest(state, 'm03-wolves');
  handleWorldEvent(state, 'world:kill', { creatureId: 'wolf', x: 0, z: 0, poiId: null });
  startDialogue(state, 'valley:smith');
  assert.ok(getFlag(state, 'met:valley:smith'));
  const raw = JSON.parse(JSON.stringify(state));
  raw.quests.active['retired-quest'] = { stage: 0, progress: [], ready: false };
  const copy = hydrateState(raw);
  assert.equal(copy.quests.active['retired-quest'], undefined);
  assert.deepEqual(copy.quests.active['m03-wolves'], state.quests.active['m03-wolves']);
  assert.deepEqual(copy.flags, state.flags);
  assert.equal(listQuests(copy).find(quest => quest.id === 'm03-wolves').objectives[0].cur, 1);
  assert.throws(() => hydrateState({ ...JSON.parse(JSON.stringify(state)), quests: {} }));
});

test('board: deterministic daily contracts, fulfilment, pinning', () => {
  const state = newGame();
  const today = listContracts(state, 'valley');
  assert.ok(today.length >= 4 && today.length <= 6);
  assert.deepEqual(listContracts(newGame(), 'valley').map(c => [c.itemId, c.count, c.coins]), today.map(c => [c.itemId, c.count, c.coins]));
  assert.notDeepEqual(listContracts(state, 'ford').map(c => c.itemId), today.map(c => c.itemId));
  assert.equal(new Set(today.map(c => c.itemId)).size, today.length);

  const contract = today[0];
  assert.equal(fulfilContract(state, 'valley', contract.id).ok, false);
  addItem(state, contract.itemId, contract.count);
  assert.ok(listContracts(state, 'valley')[0].canFulfil);
  const coins = state.player.coins;
  const result = fulfilContract(state, 'valley', contract.id);
  assert.ok(result.ok);
  assert.equal(state.player.coins, coins + contract.coins);
  assert.ok(state.rep.valley >= 1);
  assert.equal(fulfilContract(state, 'valley', contract.id).ok, false);

  const pinned = today[1];
  assert.ok(pinContract(state, 'valley', pinned.id).ok);
  assert.ok(listQuests(state).some(quest => quest.category === 'contract' && quest.id === pinned.id));
  state.time.day = 2;
  handleWorldEvent(state, 'time:newday', { day: 2 });
  const tomorrow = listContracts(state, 'valley');
  assert.ok(tomorrow.some(c => c.id === pinned.id), 'pinned contract survives the refresh');
  assert.ok(!tomorrow.some(c => c.id === contract.id), 'finished contract is gone');
  assert.ok(tomorrow.some(c => c.id.startsWith('valley:2:')));
});

test('bounties: accept, count kills, claim, cooldown, named heads', () => {
  const state = newGame();
  const offered = listBounties(state, 'valley');
  assert.ok(offered.some(bounty => bounty.id === 'bv-wolves'));
  assert.ok(!offered.some(bounty => bounty.id === 'bv-southmead'), 'locked by caravan stage');
  handleWorldEvent(state, 'world:kill', { creatureId: 'wolf', x: 0, z: 0, poiId: null });
  assert.equal(claimBounty(state, 'bv-wolves').ok, false);
  assert.ok(acceptBounty(state, 'bv-wolves').ok);
  assert.equal(acceptBounty(state, 'bv-wolves').ok, false);
  for (let n = 0; n < 8; n++) handleWorldEvent(state, 'world:kill', { creatureId: 'wolf', x: 0, z: 0, poiId: null });
  const journal = listQuests(state).find(quest => quest.id === 'bv-wolves');
  assert.equal(journal.category, 'bounty');
  assert.equal(journal.status, 'ready');
  const coins = state.player.coins;
  assert.ok(claimBounty(state, 'bv-wolves').ok);
  assert.ok(state.player.coins > coins);
  assert.equal(listBounties(state, 'valley').find(bounty => bounty.id === 'bv-wolves').status, 'cooldown');
  assert.equal(acceptBounty(state, 'bv-wolves').ok, false);
  state.time.day += 2;
  assert.ok(acceptBounty(state, 'bv-wolves').ok);

  assert.ok(acceptBounty(state, 'bv-alpha').ok);
  handleWorldEvent(state, 'world:kill', { creatureId: 'alpha_wolf', x: 0, z: 0, poiId: null });
  assert.equal(listBounties(state, 'valley').find(bounty => bounty.id === 'bv-alpha').status, 'active', 'must be the one in the lair');
  handleWorldEvent(state, 'world:kill', { creatureId: 'alpha_wolf', x: 1060, z: -140, poiId: 'lair-wolf' });
  assert.ok(claimBounty(state, 'bv-alpha').ok);
  assert.equal(listBounties(state, 'valley').find(bounty => bounty.id === 'bv-alpha').status, 'done');
});
