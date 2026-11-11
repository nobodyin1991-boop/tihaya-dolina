// Fake engine for UI development: implements the whole «Контракт UI ↔ движок» with animated,
// plausible data so the HUD and screens can be built and screenshot-tested without three.js.
//   const g = createMockGame({ canvas, phase: 'playing' });  const ui = createUI(g);
import { emit } from '../core/events.js';
import { createInput } from '../core/input.js';
import { DEFAULT_SETTINGS } from '../core/settings.js';
import { createState } from '../sim/state.js';
import '../sim/player.js';
import '../sim/inventory.js';
import '../sim/time.js';
import { reveal } from '../sim/worldstate.js';
import '../data/items-catalog.js';
import '../sim/registry.js';
import { seedRealState, mockHeroCtl, mockPinnedCity, mockTravel } from './mock-seed.js';
import { CITIES, POIS, LEGS } from '../data/world-map.js';
import { regionAt, cityAt, poiAt, legPoint, legLength } from '../world/terrain.js';

const ABILITIES = [
  { abilityId: 'aimed', name: 'Прицельный выстрел', icon: 'snipe', cooldownTotal: 6, staminaCost: 15 },
  { abilityId: 'volley', name: 'Залп', icon: 'volley', cooldownTotal: 11, staminaCost: 25 },
  { abilityId: 'roll', name: 'Отскок', icon: 'dash', cooldownTotal: 8, staminaCost: 20 },
  { abilityId: 'mark', name: 'Метка охотника', icon: 'mark', cooldownTotal: 18, staminaCost: 10 },
  { abilityId: 'rain', name: 'Ливень стрел', icon: 'trap', cooldownTotal: 40, staminaCost: 40, lockedReason: 'Откроется на 12 уровне' },
];
const TARGETS = [
  null,
  { id: 'm1', name: 'Серый волк', level: 5, maxHp: 140, kind: 'mob', team: 'hostile', elite: false, boss: false },
  { id: 'm2', name: 'Матёрый кабан', level: 8, maxHp: 420, kind: 'mob', team: 'hostile', elite: true, boss: false },
  { id: 'm3', name: 'Косой, главарь шайки', level: 9, maxHp: 1600, kind: 'mob', team: 'hostile', elite: false, boss: true },
  { id: 'n1', name: 'Интендант Велена', level: 6, maxHp: 200, kind: 'npc', team: 'friendly', elite: false, boss: false },
];
const TOASTS = [
  ['Найдена редкая трава', 'good'], ['Сумка почти полна', 'warn'], ['Игра сохранена', 'info'],
  ['Телега повреждена!', 'bad'], ['Репутация в Тихой долине выросла', 'good'],
];
const BARKS = [
  'Говорят, на Лесном тракте опять шалит Косой.', 'Свежий хлеб! Ещё тёплый!', 'Телегу проверь — ось скрипит.',
  'К ночи будет дождь, кости ломит.', 'Руда из Брода нынче в цене.',
];

export function createMockGame(opts = {}) {
  const canvas = opts.canvas || document.createElement('canvas');
  const g = { phase: opts.phase || 'title', paused: false, fps: 118, time: 0, isMock: true };
  let saved = opts.hasSave !== false;

  // —— settings (in memory, never touches the player's real settings) ——
  const settings = { ...DEFAULT_SETTINGS, ...(opts.settings || {}) };
  settings.set = (key, value) => {
    if (settings[key] === value) return;
    settings[key] = value;
    emit('settings:changed', { key, value });
  };
  g.settings = settings;
  g.view = { gpuName: 'NVIDIA GeForce RTX 4070 (макет)', info: () => ({ calls: 212, triangles: 1040000 }) };
  g.input = createInput(canvas);

  // —— state ——
  function freshState(name = 'Ярослава', classId = 'archer') {
    const state = createState({ name, classId });
    state.player.xp = 1900;
    state.player.level = 5;
    state.player.coins = 1284;
    state.player.playSeconds = 5 * 3600 + 23 * 60;
    state.player.kills = 86;
    state.player.deaths = 2;
    state.time.day = 4;
    state.time.hour = 17.4;
    state.savedAt = Date.now() - 7 * 60000;
    Object.assign(state.inv.items, { salve: 3, bread: 5, herb: 12, ore: 7, tonic: 1 });
    seedRealState(state);
    // explore the valley, the forest road to Ford and a bit of the south road
    for (let s = 0; s < legLength(0); s += 60) {
      const p = legPoint(0, s);
      reveal(state, p.x, p.z, 260);
    }
    for (let s = legLength(2) - 900; s < legLength(2); s += 60) {
      const p = legPoint(2, s);
      reveal(state, p.x, p.z, 220);
    }
    for (let s = 0; s < 700; s += 60) {
      const p = legPoint(1, s);
      reveal(state, p.x, p.z, 200);
    }
    reveal(state, 0, 0, 520);
    reveal(state, -320, 250, 380);
    reveal(state, CITIES[1].x, CITIES[1].z, 420);
    for (const id of ['valley', 'ford', 'camp-kosoy', 'ruin-watchtower', 'sawmill', 'mill', 'apiary', 'hunter-lodge', 'post-forest', 'lair-wolf', 'far-farm', 'post-south', 'mine-copper']) {
      state.world.discovered[id] = 1;
    }
    return state;
  }
  g.state = g.phase === 'title' ? null : freshState();

  // —— hero ——
  const hero = {
    x: 150, y: 14, z: -30, yaw: 0, level: 5, hp: 236, maxHp: 280, stamina: 74, maxStamina: 100,
    alive: true, mounted: false, statuses: [], target: null,
  };
  g.hero = hero;
  g.cameraRig = { yaw: 0 };
  g.zone = { region: regionAt(hero.x, hero.z), city: null, poi: null, safe: false };
  g.prompt = null;
  g.interaction = { channel: null };

  const cooldowns = [0, 0, 0, 0, 0];
  const hotbar = ABILITIES.map((a, i) => ({ slot: i + 1, rank: 1 + (i % 3), cooldown: 0, usable: true, lockedReason: null, ...a }));
  const quick = [
    { slot: 1, itemId: 'salve', count: 3, cooldown: 0, cooldownTotal: 12 },
    { slot: 2, itemId: 'bread', count: 5, cooldown: 0, cooldownTotal: 20 },
    { slot: 3, itemId: null, count: 0, cooldown: 0, cooldownTotal: 0 },
    { slot: 4, itemId: 'tonic', count: 1, cooldown: 0, cooldownTotal: 30 },
  ];
  g.heroCtl = {
    inCombat: () => !!hero.target && hero.target.team === 'hostile',
    hotbar: () => hotbar,
    quickSlots: () => quick,
    setQuickSlot(slot, itemId) {
      quick[slot - 1].itemId = itemId;
    },
    useAbility(slot) {
      const a = hotbar[slot - 1];
      if (a && !a.lockedReason && cooldowns[slot - 1] <= 0) cooldowns[slot - 1] = a.cooldownTotal;
    },
    useItem() {},
    stats: () => ({ maxHp: hero.maxHp, maxStamina: hero.maxStamina, attack: 31, armor: 24, critChance: 0.12 }),
  };

  // real sim-backed hero controls and npc stubs for the gameplay screens (see mock-seed.js)
  Object.assign(g.heroCtl, mockHeroCtl(g, quick));
  g.npcs = { byId: () => null, setTalking() {} };

  // —— world labels & projection (a simple chase camera) ——
  const labelDefs = [
    { id: 'npc:1', dx: 3, dz: 7, text: 'Велена', sub: 'Интендант', kind: 'npc', hp: null, hostile: false, level: 6, h: 1.95 },
    { id: 'npc:2', dx: -6, dz: 10, text: 'Дед Прохор', sub: 'Пасечник', kind: 'npc', hp: null, hostile: false, level: 3, h: 1.9 },
    { id: 'mob:1', dx: 5, dz: 15, text: 'Серый волк', sub: '', kind: 'mob', hp: 0.62, hostile: true, level: 5, h: 1.3 },
    { id: 'mob:2', dx: -9, dz: 19, text: 'Матёрый кабан', sub: '', kind: 'mob', hp: 1, hostile: true, level: 8, h: 1.4 },
    { id: 'node:1', dx: -3, dz: 5, text: 'Лекарственная трава', sub: '', kind: 'node', hp: null, hostile: false, level: 0, h: 0.8 },
    { id: 'chest:1', dx: 8, dz: 8, text: 'Тайник', sub: '', kind: 'chest', hp: null, hostile: false, level: 0, h: 1 },
    { id: 'wagon:1', dx: 0, dz: 24, text: 'Караван', sub: 'Лесной тракт', kind: 'wagon', hp: 0.84, hostile: false, level: 0, h: 2.6 },
  ];
  const labels = labelDefs.map(d => ({ ...d, x: 0, y: 0, z: 0, dist: 0, targeted: false }));
  g.labels = () => labels;
  g.project = (x, y, z, out) => {
    const yaw = g.cameraRig.yaw;
    const camX = hero.x - Math.sin(yaw) * 7;
    const camZ = hero.z - Math.cos(yaw) * 7;
    const dx = x - camX;
    const dz = z - camZ;
    const forward = dx * Math.sin(yaw) + dz * Math.cos(yaw);
    const side = dx * Math.cos(yaw) - dz * Math.sin(yaw);
    const focal = window.innerHeight * 0.95;
    out.visible = forward > 0.5;
    out.x = window.innerWidth / 2 - (side / forward) * focal;
    out.y = window.innerHeight * 0.46 - ((y - (hero.y + 3.2)) / forward) * focal;
    if (out.x < -100 || out.x > window.innerWidth + 100 || out.y < -100 || out.y > window.innerHeight + 100) out.visible = false;
    return out;
  };

  // —— markers ——
  const caravan = { progress: 0.34, hp: 520, status: 'moving', leg: 0 };
  g.markers = () => {
    const known = g.state ? g.state.world.discovered : {};
    const list = [];
    for (const c of CITIES) list.push({ id: c.key, kind: 'city', x: c.x, z: c.z, label: c.name, discovered: !!known[c.key] });
    for (const p of POIS) list.push({ id: p.id, kind: 'poi', x: p.x, z: p.z, label: p.name, discovered: !!known[p.id] });
    list.push({ id: 'quest:kosoy', kind: 'quest', x: 830, z: -280, label: 'Голова Косого', discovered: true });
    list.push({ id: 'quest:herbs', kind: 'quest', x: -260, z: 180, label: 'Травы для аптекаря', discovered: true });
    const wagon = legPoint(caravan.leg, caravan.progress * legLength(caravan.leg));
    list.push({ id: 'caravan', kind: 'caravan', x: wagon.x, z: wagon.z, label: 'Ваш караван', discovered: true });
    list.push({ id: 'ambush:1', kind: 'ambush', x: 620, z: -420, label: 'Засада', discovered: true });
    return list;
  };
  g.caravanRun = {
    active: () => true,
    hud: () => (g.mockOptions.caravan ? {
      legName: LEGS[caravan.leg].name, progress: caravan.progress, hp: caravan.hp, maxHp: 600, status: caravan.status,
      cargoLeft: caravan.status === 'combat' ? 10 : 12, cargoTotal: 12, distance: 24 + Math.sin(g.time) * 6,
      guards: [
        { name: 'Гордей', hp: 140, maxHp: 180, alive: true },
        { name: 'Злата', hp: caravan.status === 'combat' ? 60 : 150, maxHp: 150, alive: true },
        { name: 'Ждан', hp: 0, maxHp: 160, alive: false },
      ],
    } : null),
  };
  g.mockOptions = { caravan: true, events: opts.events !== false, target: opts.target };

  // —— lifecycle ——
  function begin(state) {
    g.state = state;
    g.phase = 'loading';
    emit('game:loading', {});
    setTimeout(() => {
      g.phase = 'playing';
      emit('game:started', {});
      emit('zone:entered', { title: 'Тихая долина', sub: CITIES[0].desc, kind: 'city' });
    }, opts.loadingMs ?? 2600);
  }
  g.newGame = ({ name, classId }) => {
    saved = true;
    begin(freshState(name, classId));
  };
  g.continueGame = () => {
    begin(freshState());
    return true;
  };
  g.hasSave = () => saved;
  g.save = () => {
    if (g.state) g.state.savedAt = Date.now();
    saved = true;
    return true;
  };
  g.exportSave = () => JSON.stringify(g.state);
  g.importSave = text => {
    const parsed = JSON.parse(text);
    if (!parsed || parsed.version !== 1) throw new Error('Несовместимое сохранение');
    emit('toast', { text: 'Макет: сохранение принято', kind: 'good' });
  };
  g.quitToTitle = () => {
    g.phase = 'title';
    g.paused = false;
  };
  g.setPaused = paused => {
    g.paused = paused;
  };
  g.setQuality = name => settings.set('quality', name);
  g.travelTo = cityKey => mockTravel(g, cityKey);

  // —— handy triggers for previews ——
  g.mock = {
    die() {
      g.phase = 'dead';
      hero.alive = false;
      hero.hp = 0;
      emit('hero:died', { reason: 'Вас одолел Косой, главарь шайки.' });
    },
    respawn() {
      g.phase = 'playing';
      hero.alive = true;
      hero.hp = hero.maxHp;
      emit('hero:respawned', {});
    },
    levelUp() {
      hero.level += 1;
      g.state.player.level = hero.level;
      emit('player:levelup', { level: hero.level, gained: 1 });
    },
    banner(kind = 'city') {
      if (kind === 'city') emit('zone:entered', { title: 'Каменный Брод', sub: CITIES[1].desc, kind: 'city' });
      else emit('zone:entered', { title: 'Волчья падь', sub: 'Уровень существ 4–6', kind: 'region' });
    },
    loading() {
      g.phase = 'loading';
      emit('game:loading', {});
    },
    setTarget(index) {
      g.mockOptions.target = index;
    },
    combat(on) {
      caravan.status = on ? 'combat' : 'moving';
    },
    lowHealth() {
      hero.hp = 52;
    },
    burst() {
      emit('toast', { text: 'Найдена редкая трава', kind: 'good' });
      emit('toast', { text: 'Телега повреждена!', kind: 'bad' });
      emit('log', { text: 'Гордей: «Держу левый борт!»' });
      emit('loot:gained', { coins: 46, items: { hide: 2, steel: 1, richOre: 3 }, source: 'mob' });
      emit('player:xp', { amount: 120 });
      emit('bark', { id: 'npc:1', name: 'Велена', text: BARKS[0], x: 0, y: 0, z: 0 });
    },
  };

  // —— simulation ——
  let eventIn = 3;
  let eventIndex = 0;
  let targetIn = 2;
  let targetIndex = 1;
  let promptIn = 4;
  let channelLeft = 0;

  function simulate(dt) {
    const state = g.state;
    // the hero strolls in a wide circle east of the valley gate
    const angle = g.time * 0.05;
    hero.x = 190 + Math.cos(angle) * 110;
    hero.z = -40 + Math.sin(angle) * 110;
    hero.yaw = Math.atan2(-Math.sin(angle), Math.cos(angle));
    g.cameraRig.yaw = hero.yaw + Math.sin(g.time * 0.21) * 0.5;
    state.player.x = hero.x;
    state.player.z = hero.z;
    state.time.hour = (state.time.hour + dt * 0.01) % 24;
    state.player.playSeconds += dt;

    const yaw = g.cameraRig.yaw;
    for (const label of labels) {
      label.x = hero.x + label.dx * Math.cos(yaw) + label.dz * Math.sin(yaw);
      label.z = hero.z - label.dx * Math.sin(yaw) + label.dz * Math.cos(yaw);
      label.y = hero.y + label.h;
      label.dist = Math.hypot(label.dx, label.dz);
      label.targeted = !!hero.target && hero.target.id === (label.id === 'mob:1' ? 'm1' : label.id === 'mob:2' ? 'm2' : '');
    }
    labels[2].hp = 0.35 + 0.3 * Math.sin(g.time * 0.7);

    g.zone.region = regionAt(hero.x, hero.z);
    g.zone.city = cityAt(hero.x, hero.z);
    g.zone.poi = poiAt(hero.x, hero.z, 4);
    g.zone.safe = !!g.zone.city;
    if (reveal(state, hero.x, hero.z)) emit('map:revealed', {});
    mockPinnedCity(g);

    // vitals breathe
    hero.stamina = 60 + 38 * Math.sin(g.time * 0.6);
    if (hero.alive && hero.hp > 60) hero.hp = Math.min(hero.maxHp, hero.hp + dt * 2.5);

    // abilities fire on their own
    for (let i = 0; i < hotbar.length; i++) {
      if (cooldowns[i] > 0) cooldowns[i] = Math.max(0, cooldowns[i] - dt);
      else if (!hotbar[i].lockedReason && Math.random() < dt * 0.14) cooldowns[i] = hotbar[i].cooldownTotal;
      hotbar[i].cooldown = cooldowns[i];
      hotbar[i].usable = hero.stamina >= hotbar[i].staminaCost;
    }
    quick[0].cooldown = Math.max(0, quick[0].cooldown - dt);

    // target rotation
    targetIn -= dt;
    if (g.mockOptions.target !== undefined) {
      const def = TARGETS[g.mockOptions.target];
      if (!def) hero.target = null;
      else if (!hero.target || hero.target.id !== def.id) hero.target = { ...def, hp: def.maxHp * 0.64, statuses: [{ type: 'bleed', t: 4, total: 6 }, { type: 'mark', t: 9, total: 12 }] };
    } else if (targetIn <= 0) {
      targetIn = 9;
      const def = TARGETS[targetIndex++ % TARGETS.length];
      hero.target = def ? { ...def, hp: def.maxHp, statuses: def.team === 'hostile' ? [{ type: 'bleed', t: 6, total: 6 }, { type: 'slow', t: 3, total: 4 }] : [] } : null;
    }
    if (hero.target) {
      if (hero.target.team === 'hostile') hero.target.hp = Math.max(hero.target.maxHp * 0.08, hero.target.hp - dt * hero.target.maxHp * 0.06);
      for (const status of hero.target.statuses) status.t = status.t > 0 ? status.t - dt : status.total;
    }
    hero.statuses = hero.statuses.filter(s => (s.t -= dt) > 0);

    // prompt / channel
    promptIn -= dt;
    if (channelLeft > 0) {
      channelLeft -= dt;
      g.interaction.channel = channelLeft > 0 ? { text: 'Сбор: лекарственная трава', progress: 1 - channelLeft / 2.4 } : null;
    } else if (promptIn <= 0) {
      promptIn = 7;
      if (g.prompt) {
        g.prompt = null;
        channelLeft = 2.4;
      } else g.prompt = { key: 'interact', text: 'Собрать лекарственную траву', sub: 'Нужен серп' };
    }

    // caravan
    caravan.progress = (caravan.progress + dt * 0.004) % 1;
    if (g.mockOptions.events) {
      eventIn -= dt;
      if (eventIn <= 0) {
        eventIn = 5.5;
        const step = eventIndex++ % 8;
        if (step === 0) emit('toast', { text: TOASTS[eventIndex % TOASTS.length][0], kind: TOASTS[eventIndex % TOASTS.length][1] });
        else if (step === 1) emit('bark', { id: 'npc:1', name: 'Велена', text: BARKS[eventIndex % BARKS.length], x: labels[0].x, y: labels[0].y, z: labels[0].z });
        else if (step === 2) emit('loot:gained', { coins: 18, items: { hide: 1, herb: 2 }, source: 'mob' });
        else if (step === 3) {
          hero.hp = Math.max(40, hero.hp - 46);
          hero.statuses.push({ type: 'bleed', t: 6, total: 6 });
          emit('hero:damaged', { amount: 46, crit: eventIndex % 3 === 0 });
        } else if (step === 4) emit('player:xp', { amount: 85 });
        else if (step === 5) {
          caravan.status = caravan.status === 'combat' ? 'moving' : 'combat';
          emit('toast', { text: caravan.status === 'combat' ? 'Разбойники напали на караван!' : 'Нападение отбито', kind: caravan.status === 'combat' ? 'bad' : 'good' });
        } else if (step === 6) emit('log', { text: 'Гордей: «Держу левый борт!»' });
        else hero.statuses.push({ type: 'regen', t: 10, total: 10 });
      }
    }
  }

  let last = performance.now();
  function frame(now) {
    if (!opts.timer) requestAnimationFrame(frame);
    const dt = Math.min(0.05, Math.max(0.0001, (now - last) / 1000));
    last = now;
    g.time += dt;
    g.fps = Math.round(1 / dt);
    if ((g.phase === 'playing' || g.phase === 'dead') && !g.paused && g.state) simulate(dt);
    emit('frame', dt);
  }
  // `timer: true` drives frames from a timer — keeps the mock alive in a background / throttled tab
  if (opts.timer) setInterval(() => frame(performance.now()), 16);
  else requestAnimationFrame(frame);
  if (g.state) simulate(0.016);
  return g;
}
