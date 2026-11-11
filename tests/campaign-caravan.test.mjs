// Caravan simulation: preparation, full runs of every leg with a fake engine, failure, guild runs, saves.
import test from 'node:test';
import assert from 'node:assert/strict';
import { hydrateState } from '../src/sim/state.js';
import { addItem, countItem } from '../src/sim/inventory.js';
import { addCoins } from '../src/sim/player.js';
import { addRep } from '../src/sim/reputation.js';
import { on } from '../src/core/events.js';
import { legLength } from '../src/world/terrain.js';
import { CARAVAN_LEGS, FOLLOW_RADIUS } from '../src/data/caravans.js';
import {
  caravanOverview, readiness, contributeCargo, contributeAll, buyWagonUpgrade, hireGuard, dismissGuard, loadBonusCargo,
  unloadBonusCargo, launchCaravan, caravanTick, caravanReport, caravanPosition, repairWagon, abandonRun, selectGuildLeg,
  scoutedEvents, wagonMaxHp, manifestProgress, caravanResume, RING_COMPLETE,
} from '../src/sim/caravan.js';
import { handleWorldEvent, setFlag } from '../src/sim/quests.js';
import { newGame, fillManifest, movePlayerToCity, driveRun, runCurrentLeg } from './campaign-support.mjs';

test('manifest: partial contributions pay an advance and gate the launch', () => {
  const state = newGame();
  const coinsBefore = state.player.coins;
  assert.equal(contributeCargo(state, 'flour', 5).ok, false, 'nothing in the bag');
  assert.equal(contributeCargo(state, 'amber', 1).ok, false, 'not in the manifest');
  addItem(state, 'flour', 30);
  const result = contributeCargo(state, 'flour', 50);
  assert.ok(result.ok);
  assert.equal(result.accepted, 20, 'only what the line needs');
  assert.equal(countItem(state, 'flour'), 10);
  assert.ok(state.player.coins > coinsBefore, 'advance paid');
  movePlayerToCity(state, 0);
  assert.equal(launchCaravan(state).ok, false, 'manifest not full');
  const overview = caravanOverview(state);
  assert.equal(overview.manifest.find(line => line.itemId === 'flour').done, true);
  assert.equal(overview.leg.from, 'valley');
  assert.equal(overview.readiness.canLaunch, false);
  for (const line of overview.manifest) addItem(state, line.itemId, line.count);
  assert.ok(contributeAll(state).full);
  assert.equal(readiness(state).canLaunch, true);
  assert.ok(caravanOverview(state).expectedPayout.fee > 0);
});

test('preparation: wagon upgrades, guards limited by reputation, bonus cargo', () => {
  const state = newGame();
  addCoins(state, 5000);
  const hpBefore = wagonMaxHp(state);
  assert.ok(buyWagonUpgrade(state, 'reinforced').ok);
  assert.ok(wagonMaxHp(state) > hpBefore);
  assert.equal(buyWagonUpgrade(state, 'reinforced').ok, false, 'already installed');
  assert.equal(buyWagonUpgrade(state, 'ironAxles').ok, false, 'locked until stage 1');
  assert.equal(buyWagonUpgrade(state, 'tier2').ok, false, 'locked until stage 1');

  assert.ok(hireGuard(state).ok);
  assert.equal(hireGuard(state).ok, false, 'a stranger gets one guard');
  addRep(state, 'valley', 40);
  assert.ok(hireGuard(state).ok);
  assert.ok(hireGuard(state, 'valley-oleh').ok);
  assert.equal(caravanOverview(state).guards.hired.length, 3);
  const coins = state.player.coins;
  assert.ok(dismissGuard(state, 'valley-oleh').ok);
  assert.ok(state.player.coins > coins, 'half refunded');

  addItem(state, 'honey', 30);
  addItem(state, 'wood', 5);
  assert.equal(loadBonusCargo(state, 'wood', 5).ok, false, 'only trade goods');
  const loaded = loadBonusCargo(state, 'honey', 30);
  assert.ok(loaded.ok);
  assert.equal(loaded.loaded, 20, 'cart capacity');
  assert.ok(unloadBonusCargo(state, 'honey', 5).ok);
  assert.equal(countItem(state, 'honey'), 15);
  const overview = caravanOverview(state);
  assert.equal(overview.bonus.used, 15);
  assert.ok(overview.expectedPayout.bonusSale > 0);
  assert.ok(overview.readiness.danger.rating >= 0 && overview.readiness.danger.label);
});

test('readiness reacts to scouting and cleared camps', () => {
  const state = newGame();
  const before = readiness(state);
  assert.deepEqual(scoutedEvents(state), []);
  setFlag(state, 'scout:leg0');
  assert.ok(scoutedEvents(state).length >= 3, 'ambush points revealed');
  handleWorldEvent(state, 'world:poi-cleared', { poiId: 'camp-kosoy' });
  const after = readiness(state);
  assert.ok(after.danger.threat < before.danger.threat);
  assert.ok(after.prep.every(prep => prep.done));
});

for (const leg of [0, 1, 2]) {
  test(`full run of leg ${leg} with a fake engine`, () => {
    const state = newGame();
    state.caravan.stage = leg;
    addCoins(state, 2000);
    hireGuard(state);
    addItem(state, 'ration', 4);
    const trade = ['honey', 'toolCrate', 'amber'][leg];
    addItem(state, trade, 10);
    assert.ok(loadBonusCargo(state, trade, 10).ok);
    const events = [];
    const off = on('caravan:arrived', payload => events.push(payload));
    const coins = state.player.coins;
    const xp = state.player.xp;
    const run = runCurrentLeg(state);
    off();
    assert.equal(run.outcome, 'arrived');
    const spawns = run.directives.filter(directive => directive.type === 'spawn');
    const obstacles = run.directives.filter(directive => directive.type === 'obstacle');
    const banter = run.directives.filter(directive => directive.type === 'banter');
    assert.ok(spawns.length >= CARAVAN_LEGS[leg].events.length - 2, `spawns: ${spawns.length}`);
    assert.ok(obstacles.length >= 1);
    assert.ok(banter.length >= CARAVAN_LEGS[leg].banter.length);
    assert.ok(spawns.some(directive => directive.boss), 'the boss of the leg shows up when nothing was prepared');
    for (const directive of spawns) {
      assert.ok(directive.groups.length >= 1 && Number.isFinite(directive.x));
      for (const group of directive.groups) assert.ok(group.count >= 1 && group.level >= 1);
    }
    assert.ok(run.seconds >= legLength(leg) / 5, 'the wagon does not teleport');
    assert.equal(run.result.integrity, 1);
    assert.ok(run.result.perfectBonus > 0);
    assert.ok(run.result.tradeIncome > 0);
    assert.ok(state.player.coins > coins + run.result.fee - 1);
    assert.ok(state.player.xp > xp);
    assert.equal(state.caravan.stage, leg + 1);
    assert.equal(state.caravan.run, null);
    assert.deepEqual(state.caravan.delivered, {});
    assert.equal(events.length, 1);
    assert.ok(state.rep[run.result.to] > 0 && state.rep[run.result.from] > 0);
    assert.equal(countItem(state, 'ration'), 2, 'the guard ate two rations');
    if (leg === 2) assert.equal(state.caravan.stage, RING_COMPLETE);
  });
}

test('the wagon waits for the player and for the fight to end', () => {
  const state = newGame();
  fillManifest(state);
  movePlayerToCity(state, 0);
  assert.ok(launchCaravan(state).ok);
  const start = caravanPosition(state);
  let directives = caravanTick(state, 1, { playerX: start.x + FOLLOW_RADIUS + 20, playerZ: start.z, enemiesAlive: 0 });
  assert.equal(state.caravan.run.s, 0, 'player too far');
  assert.ok(directives.some(directive => directive.type === 'banter'));
  caravanTick(state, 1, { playerX: start.x, playerZ: start.z, enemiesAlive: 2 });
  assert.equal(state.caravan.run.s, 0, 'enemies alive');
  caravanTick(state, 1, { playerX: start.x, playerZ: start.z, enemiesAlive: 0 });
  const dry = state.caravan.run.s;
  assert.ok(dry > 3.5 && dry < 4.5);
  caravanTick(state, 1, { playerX: start.x, playerZ: start.z, enemiesAlive: 0, raining: true });
  assert.ok(state.caravan.run.s - dry < dry, 'rain slows the wagon');
  assert.ok(caravanPosition(state).moving);
  directives = [];
  assert.equal(contributeCargo(state, 'flour', 1).ok, false, 'no prep actions during the run');
});

test('prepared road: cleared camp and a deal change the events', () => {
  const unprepared = newGame();
  const raw = runCurrentLeg(unprepared);
  assert.ok(raw.directives.some(directive => directive.eventId === 'l0-toll'));
  assert.ok(raw.directives.some(directive => directive.boss === 'bandit_chief_kosoy'));

  const cleared = newGame();
  handleWorldEvent(cleared, 'world:poi-cleared', { poiId: 'camp-kosoy' });
  const afterClear = runCurrentLeg(cleared);
  assert.ok(!afterClear.directives.some(directive => directive.eventId === 'l0-toll'));
  assert.ok(!afterClear.directives.some(directive => directive.boss));
  assert.ok(afterClear.directives.some(directive => directive.eventId === 'l0-kosoy'), 'stragglers remain');

  const deal = newGame();
  setFlag(deal, 'kosoy:deal');
  const afterDeal = runCurrentLeg(deal);
  assert.ok(!afterDeal.directives.some(directive => ['l0-toll', 'l0-kosoy'].includes(directive.eventId)));
});

test('toll can be paid; night makes ambushes bigger and lanterns help', () => {
  const state = newGame();
  addCoins(state, 100);
  const coins = state.player.coins;
  let paid = 0;
  const run = runCurrentLeg(state, { onSpawn: directive => { if (directive.toll) { paid = directive.toll.coins; return 'pay'; } return undefined; } });
  assert.equal(run.outcome, 'arrived');
  assert.ok(paid > 0);
  assert.ok(run.directives.some(directive => directive.type === 'stand-down' && directive.eventId === 'l0-toll'));
  assert.ok(state.player.coins >= coins - paid);

  const headcount = hooks => {
    const game = newGame();
    addCoins(game, 1000);
    if (hooks.lanterns) assert.ok(buyWagonUpgrade(game, 'lanterns').ok);
    const result = runCurrentLeg(game, hooks);
    return result.directives.filter(d => d.type === 'spawn').reduce((sum, d) => sum + d.groups.reduce((n, group) => n + group.count, 0), 0);
  };
  const day = headcount({});
  const night = headcount({ night: true });
  const lit = headcount({ night: true, lanterns: true });
  assert.ok(night > day, `night ${night} > day ${day}`);
  assert.ok(lit < night && lit >= day, `lanterns ${lit}`);
});

test('obstacles: spare wheel, kits and slow work', () => {
  const state = newGame();
  state.caravan.stage = 1;
  addCoins(state, 1000);
  assert.ok(buyWagonUpgrade(state, 'spareWheel').ok);
  const withSpare = runCurrentLeg(state);
  const wheel = withSpare.directives.find(directive => directive.kind === 'wheel-break');
  assert.equal(wheel.needs, null);
  assert.equal(wheel.slowSeconds, wheel.workSeconds);
  assert.equal(state.caravan.wagon.upgrades.spareWheel, undefined, 'spare wheel is used up');

  const bare = newGame();
  bare.caravan.stage = 1;
  const without = runCurrentLeg(bare);
  const broken = without.directives.find(directive => directive.kind === 'wheel-break');
  assert.deepEqual(broken.needs, { spareWheel: 1 });
  assert.ok(broken.slowSeconds > broken.workSeconds * 3);

  const south = newGame();
  south.caravan.stage = 2;
  addItem(south, 'bridgeKit', 1);
  addItem(south, 'plank', 6);
  runCurrentLeg(south);
  assert.equal(countItem(south, 'bridgeKit'), 0, 'bridge kit consumed');
  assert.equal(countItem(south, 'plank'), 0, 'planks consumed');
});

test('damage, theft, dead guards, field repair', () => {
  const state = newGame();
  addCoins(state, 500);
  hireGuard(state);
  fillManifest(state);
  movePlayerToCity(state, 0);
  launchCaravan(state);
  const maxHp = wagonMaxHp(state);
  assert.ok(caravanReport(state, { type: 'wagon-damage', amount: 200 }).ok);
  assert.equal(state.caravan.wagon.hp, maxHp - 200);
  assert.equal(repairWagon(state).ok, false, 'no kit');
  addItem(state, 'wagonKit', 1);
  assert.ok(repairWagon(state).ok);
  assert.ok(state.caravan.wagon.hp > maxHp - 200);
  const stolen = caravanReport(state, { type: 'cargo-stolen', count: 34 });
  assert.equal(stolen.lost, 34);
  const guardId = state.caravan.guards[0].id;
  assert.ok(caravanReport(state, { type: 'guard-down', guardId }).ok);
  assert.equal(caravanReport(state, { type: 'guard-down', guardId }).ok, false);
  const run = driveRun(state);
  assert.equal(run.outcome, 'arrived');
  assert.equal(run.result.integrity, (136 - 34) / 136);
  assert.equal(run.result.perfectBonus, 0);
  assert.ok(run.result.fee < CARAVAN_LEGS[0].fee);
  assert.equal(run.result.guardsLost, 1);

  const covered = newGame();
  addCoins(covered, 500);
  buyWagonUpgrade(covered, 'cover');
  fillManifest(covered);
  movePlayerToCity(covered, 0);
  launchCaravan(covered);
  assert.equal(caravanReport(covered, { type: 'cargo-stolen', count: 10 }).lost, 5, 'the cover halves theft');
});

test('failure: destroyed wagon loses cargo, costs a tow fee, allows a retry', () => {
  const state = newGame();
  addItem(state, 'honey', 10);
  loadBonusCargo(state, 'honey', 10);
  fillManifest(state);
  movePlayerToCity(state, 0);
  launchCaravan(state);
  caravanTick(state, 1, { playerX: 105, playerZ: 0, enemiesAlive: 0 });
  const report = caravanReport(state, { type: 'wagon-damage', amount: 9999 });
  assert.equal(report.failed, true);
  const directives = caravanTick(state, 1, {});
  assert.equal(directives.at(-1).type, 'failed');
  assert.equal(directives.at(-1).reason, 'destroyed');
  assert.equal(state.caravan.run, null);
  assert.equal(state.caravan.stage, 0, 'stage does not advance');
  assert.equal(state.caravan.towDebt, CARAVAN_LEGS[0].towFee);
  assert.equal(state.caravan.bonus.honey, 5, 'half of the bonus cargo is gone');
  const progress = manifestProgress(state);
  assert.ok(!progress.full && progress.done > progress.total * 0.6, 'about a quarter of the cargo is lost');
  assert.ok(state.caravan.wagon.hp > 0);

  state.player.coins = 0;
  fillManifest(state); // pays advances
  state.player.coins = 0;
  assert.equal(launchCaravan(state).ok, false, 'tow fee must be paid');
  addCoins(state, 500);
  assert.ok(launchCaravan(state).ok);
  assert.equal(state.caravan.towDebt, 0);
  assert.equal(driveRun(state).outcome, 'arrived');
  assert.equal(state.caravan.stage, 1);
});

test('abandoning a run keeps the cargo that was not stolen', () => {
  const state = newGame();
  fillManifest(state);
  movePlayerToCity(state, 0);
  launchCaravan(state);
  assert.ok(abandonRun(state).ok);
  assert.equal(caravanTick(state, 1, {}).at(-1).reason, 'abandoned');
  assert.ok(manifestProgress(state).full);
  assert.equal(abandonRun(state).ok, false);
});

test('guild runs after the ring is complete: generated manifests, scaling, any leg', () => {
  const state = newGame();
  state.caravan.stage = RING_COMPLETE;
  assert.equal(caravanOverview(state).leg, null);
  assert.equal(caravanPosition(state), null);
  assert.equal(launchCaravan(state).ok, false);
  assert.ok(selectGuildLeg(state, 1).ok);
  const first = structuredClone(state.caravan.manifest);
  assert.equal(first.length, 6);
  assert.ok(selectGuildLeg(state, 2).ok, 'can change the mind before contributing');
  assert.ok(selectGuildLeg(state, 1).ok);
  assert.deepEqual(state.caravan.manifest, first, 'deterministic');
  const run = runCurrentLeg(state);
  assert.equal(run.outcome, 'arrived');
  assert.equal(run.result.guild, true);
  assert.ok(!run.directives.some(directive => directive.boss), 'story bosses do not return');
  assert.equal(state.caravan.stage, RING_COMPLETE);
  assert.equal(state.caravan.guildTier, 1);
  assert.equal(state.caravan.guildLeg, null);
  const feeTier0 = run.result.fee;
  selectGuildLeg(state, 1);
  assert.notDeepEqual(state.caravan.manifest, first, 'next contract differs');
  const second = runCurrentLeg(state);
  assert.ok(second.result.fee > feeTier0, 'pay grows with the tier');
});

test('save round-trip in the middle of a run', () => {
  const state = newGame();
  addCoins(state, 500);
  hireGuard(state);
  fillManifest(state);
  movePlayerToCity(state, 0);
  launchCaravan(state);
  let spawn = null;
  for (let second = 0; second < 400 && !spawn; second++) {
    const position = caravanPosition(state);
    spawn = caravanTick(state, 1, { playerX: position.x, playerZ: position.z, enemiesAlive: 0 }).find(directive => directive.type === 'spawn');
  }
  assert.ok(spawn, 'reached the first ambush');
  const copy = hydrateState(JSON.parse(JSON.stringify(state)));
  assert.deepEqual(copy.caravan.run.events, state.caravan.run.events);
  const position = caravanPosition(copy);
  const again = caravanTick(copy, 1, { playerX: position.x, playerZ: position.z, enemiesAlive: 0 });
  assert.deepEqual(again.find(directive => directive.type === 'spawn'), spawn, 'the open ambush is issued again after loading');
  caravanResume(copy);
  assert.equal(driveRun(copy).outcome, 'arrived');
  assert.equal(copy.caravan.stage, 1);
});
