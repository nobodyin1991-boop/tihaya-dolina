// The game orchestrator: owns the renderer, world systems, runtime entities and the frame loop.
// UI talks to the game only through the object returned by createGame() (see "Контракт UI" in CLAUDE.md).
import * as THREE from 'three';
import { on, emit } from '../core/events.js';
import { createInput } from '../core/input.js';
import { saveGame, loadGame, hasSave, deleteSave, exportSave, importSave } from '../core/save.js';
import { createState } from '../sim/state.js';
import '../sim/registry.js';
import { tickTime, sleepUntil } from '../sim/time.js';
import { getCityLayout } from '../world/city-layout.js';
import { tickWorld, reveal, discover, pruneHarvested } from '../sim/worldstate.js';
import { economyNewDay } from '../sim/economy.js';
import { grantStarterKit } from '../sim/equipment.js';
import { CITIES, POIS } from '../data/world-map.js';
import { cityAt, poiAt, regionAt, isSafeZone, waterDepthAt, riverAt } from '../world/terrain.js';
import { createColliders } from '../world/collision.js';
import { shared } from '../world/materials.js';
import { QUALITY } from '../world/quality.js';
import { createRenderer } from '../world/renderer.js';
import { createSky } from '../world/sky.js';
import { createTerrain } from '../world/terrain-mesh.js';
import { createWater } from '../world/water.js';
import { createVegetation } from '../world/vegetation.js';
import { createWeather } from '../world/weather.js';
import { createAmbientLife } from '../world/ambient-life.js';
import { buildBridges } from '../world/bridges.js';
import { buildRoadside } from '../world/roadside.js';
import { createFx } from '../entities/fx.js';
import { createAudio } from '../audio/audio.js';
import { createCameraRig } from './camera.js';
import { createStreamer } from './streamer.js';
import { createMobs } from './mobs.js';
import { createPopulation } from './population.js';
import { createNpcs } from './npcs.js';
import { createHeroController } from './hero.js';
import { createCaravanRun } from './caravan-run.js';
import { createInteraction } from './interact.js';
import { createLightPool } from './lights.js';
import { handleWorldEvent } from './world-events.js';

const AUTOSAVE_SECONDS = 20;

export function createGame({ canvas, settings }) {
  const view = createRenderer({ canvas, quality: settings.quality });
  const { scene, camera } = view;
  const colliders = createColliders();
  const ctx = { scene, camera, renderer: view.renderer, colliders, quality: QUALITY[settings.quality] };

  const g = {
    settings, scene, camera, colliders, view,
    state: null,
    phase: 'title',            // 'title' | 'loading' | 'playing' | 'dead'
    paused: false,             // a full-screen menu is open
    time: 0,                   // real seconds since start (for effects)
    zone: { region: null, city: null, poi: null, safe: true },
    prompt: null,              // {key, text, sub?} — current interaction hint for the HUD
    fps: 60,
  };

  // —— world ——
  const sky = createSky(ctx);
  const terrain = createTerrain(ctx);
  const water = createWater(ctx);
  const vegetation = createVegetation(ctx);
  const weather = createWeather(ctx);
  const ambient = createAmbientLife(ctx);
  buildBridges(ctx);
  const roadside = buildRoadside(ctx);
  const streamer = createStreamer(ctx);
  const lights = createLightPool(scene, streamer);

  g.fx = createFx({ scene, camera });
  g.audio = createAudio(settings);
  g.input = createInput(canvas);
  g.cameraRig = createCameraRig(camera, colliders, settings);
  g.sky = sky;

  // —— entities ——
  g.mobs = createMobs(g);
  g.population = createPopulation(g);
  g.npcs = createNpcs(g);
  g.heroCtl = createHeroController(g);
  g.caravanRun = createCaravanRun(g);
  g.interaction = createInteraction(g);

  // helpers used across entity modules
  g.playerSideUnits = () => g.heroCtl.playerSideUnits();
  g.wagonUnit = () => g.caravanRun.wagonUnit();
  g.cargoLeft = () => g.caravanRun.cargoLeft();
  g.stealCargo = mob => g.caravanRun.stealCargo(mob);
  g.cargoEscaped = mob => g.caravanRun.cargoEscaped(mob);
  g.damageUnit = (target, amount, source, opts) => g.heroCtl.damageUnit(target, amount, source, opts);
  g.knockback = (unit, from, speed) => g.heroCtl.knockback(unit, from, speed);
  g.onMobKilled = (mob, killer) => g.heroCtl.onMobKilled(mob, killer);
  g.bark = (speaker, text) => emit('bark', { id: speaker.id, name: speaker.name, text, x: speaker.x, y: speaker.y + (speaker.height || 1.8), z: speaker.z });
  /** Publish a world event to the bus and feed it to the pure logic (quests, caravan, reputation). */
  g.worldEvent = (type, payload) => { emit(type, payload); handleWorldEvent(g.state, type, payload); };

  // ───────────── lifecycle ─────────────

  let loadingFrames = 0;

  function begin(state) {
    g.state = state;
    g.phase = 'loading';
    g.heroCtl.attach(state);
    g.caravanRun.attach(state);
    emit('game:loading', {});
    const p = state.player;
    streamer.preload(p.x, p.z);
    g.population.preload(p.x, p.z);
    g.heroCtl.settle();
    loadingFrames = 0;
  }

  /** Called every frame while loading: wait until the ground around the hero exists. */
  function finishLoading() {
    loadingFrames += 1;
    if (!terrain.readyAround(g.hero.x, g.hero.z, 260) && loadingFrames < 900) return;
    g.heroCtl.settle();
    g.phase = 'playing';
    emit('game:started', {});
    g.audio.unlock();
    announceZone(true);
  }

  // The world is built for one session: starting another game while one is running restarts the page first.
  const PENDING_KEY = 'tihaya-dolina-pending-start';
  function restartInto(request) {
    g.save();
    sessionStorage.setItem(PENDING_KEY, JSON.stringify(request));
    location.reload();
    return true;
  }
  g.newGame = ({ name, classId }) => {
    if (g.state) return restartInto({ name, classId });
    deleteSave();
    const s = createState({ name, classId });
    grantStarterKit(s);
    begin(s);
    return true;
  };
  g.continueGame = () => {
    if (g.state) return restartInto({ continue: true });
    const s = loadGame();
    if (s) begin(s);
    return !!s;
  };
  setTimeout(() => {
    const pending = sessionStorage.getItem(PENDING_KEY);
    if (!pending) return;
    sessionStorage.removeItem(PENDING_KEY);
    const request = JSON.parse(pending);
    if (request.continue) g.continueGame(); else g.newGame(request);
  }, 0);
  g.hasSave = hasSave;
  g.save = () => { if (g.state && g.phase !== 'title') { g.heroCtl.writeBack(); pruneHarvested(g.state); return saveGame(g.state); } return false; };
  g.exportSave = () => { g.heroCtl.writeBack(); return exportSave(g.state); };
  g.importSave = text => { const s = importSave(text); saveGame(s); location.reload(); };
  g.quitToTitle = () => { g.save(); location.reload(); };

  /** A full-screen UI is open: stop gameplay input and (optionally) simulation. */
  g.setPaused = paused => {
    g.paused = paused;
    g.input.setGameplay(!paused && g.phase === 'playing');
  };
  /** World systems read their preset at creation, so a quality change saves and restarts the page. */
  g.setQuality = name => { if (name === settings.quality) return; settings.set('quality', name); g.save(); location.reload(); };

  on('game:started', () => g.input.setGameplay(!g.paused));
  on('time:newday', () => { economyNewDay(g.state); handleWorldEvent(g.state, 'time:newday', { day: g.state.time.day }); g.save(); });
  for (const type of ['craft:done', 'trade:buy', 'trade:sell']) on(type, payload => { if (g.state) handleWorldEvent(g.state, type, payload); });
  on('settings:changed', ({ key }) => { if (key.startsWith('music') || key.startsWith('sfx')) g.audio.setVolumes(settings); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) { g.audio.suspend(); g.save(); } else g.audio.resume(); });
  window.addEventListener('beforeunload', () => g.save());
  window.addEventListener('resize', () => view.resize());

  // ───────────── zones ─────────────

  let zoneT = 0;
  function announceZone(force = false) {
    const h = g.hero;
    const region = regionAt(h.x, h.z);
    const city = cityAt(h.x, h.z);
    const poi = poiAt(h.x, h.z, 4);
    const z = g.zone;
    const changed = force || z.region !== region || z.city !== city || z.poi !== poi;
    if (!changed) return;
    const prevCity = z.city, prevPoi = z.poi, prevRegion = z.region;
    z.region = region; z.city = city; z.poi = poi; z.safe = isSafeZone(h.x, h.z);
    if (city && city !== prevCity) { discover(g.state, city.key, city.name); emit('zone:entered', { title: city.name, sub: city.desc, kind: 'city' }); }
    else if (poi && poi !== prevPoi) { discover(g.state, poi.id, poi.name); emit('zone:entered', { title: poi.name, sub: region.name, kind: 'poi' }); }
    else if (!city && region !== prevRegion) emit('zone:entered', { title: region.name, sub: `Уровень существ ${region.level[0]}–${region.level[1]}`, kind: 'region' });
    if (city !== prevCity || poi !== prevPoi || region !== prevRegion) {
      g.worldEvent('world:enter', { cityKey: city?.key || null, poiId: poi?.id || null, regionId: region.id });
    }
  }

  function musicMood() {
    if (g.heroCtl.inCombat()) return 'combat';
    if (g.caravanRun.active()) return 'caravan';
    if (g.zone.city) return 'town';
    if (sky.night > 0.6) return 'night';
    return g.zone.region && ['meadow', 'farmland', 'coast'].includes(g.zone.region.biome) ? 'road' : 'wild';
  }

  // ───────────── frame loop ─────────────

  let last = performance.now(), saveT = AUTOSAVE_SECONDS, slowT = 0, fpsAcc = 0, fpsN = 0;
  const focus = new THREE.Vector3();

  function frame(now, manual = false) {
    if (!manual) requestAnimationFrame(frame);
    const rawDt = (now - last) / 1000;
    last = now;
    const dt = Math.min(0.05, Math.max(0.0001, rawDt));
    fpsAcc += rawDt; fpsN++;
    if (fpsAcc >= 0.5) { g.fps = Math.round(fpsN / fpsAcc); fpsAcc = 0; fpsN = 0; }
    g.time += dt;
    shared.uTime.value = g.time;

    if (g.phase === 'title') {
      // slow cinematic orbit over the valley behind the title screen
      const a = g.time * 0.03;
      focus.set(CITIES[0].x, CITIES[0].y, CITIES[0].z);
      camera.position.set(focus.x + Math.cos(a) * 190, focus.y + 62, focus.z + Math.sin(a) * 190);
      camera.lookAt(focus.x, focus.y + 12, focus.z);
      streamer.update(dt, focus.x, focus.z);
      worldUpdate(dt, focus, 7.2 + (g.time * 0.02) % 2, 'clear');
      view.render(dt);
      emit('frame', dt);
      return;
    }

    if (g.phase === 'loading') finishLoading();
    const state = g.state;
    const simulate = g.phase === 'playing' || g.phase === 'dead';
    if (simulate && !g.paused) {
      tickTime(state, dt);
      tickWorld(state, dt);
      state.player.playSeconds += dt;
      const look = g.input.consumeLook();
      g.cameraRig.look(look.x, look.y, g.input.consumeWheel());
      g.heroCtl.update(dt);
      g.mobs.update(dt);
      g.npcs.update(dt);
      g.caravanRun.update(dt);
      g.population.update(dt);
      g.interaction.update(dt);

      zoneT -= dt;
      if (zoneT <= 0) { zoneT = 0.5; announceZone(); if (reveal(state, g.hero.x, g.hero.z)) emit('map:revealed', {}); }
      slowT -= dt;
      if (slowT <= 0) {
        slowT = 1;
        g.audio.setMusic(musicMood());
        const river = riverAt(g.hero.x, g.hero.z, 120);
        g.audio.setAmbience({
          biome: g.zone.region?.biome || 'meadow', night: sky.night,
          rain: state.time.weather === 'rain' ? 0.7 : state.time.weather === 'storm' ? 1 : 0,
          wind: state.time.weather === 'storm' ? 1 : 0.35,
          cityDistance: nearestCityDistance(), waterDistance: river ? river.dist : waterDepthAt(g.hero.x, g.hero.z) > 0 ? 0 : Infinity,
        });
      }
      saveT -= dt;
      if (saveT <= 0 && !g.heroCtl.inCombat()) { saveT = AUTOSAVE_SECONDS; g.save(); }
    } else {
      g.input.consumeLook(); g.input.consumeWheel();
    }

    focus.set(g.hero.x, g.hero.y, g.hero.z);
    g.cameraRig.update(dt, g.hero, g.hero.mounted ? 2.5 : 1.65, g.hero.body?.sprinting);
    streamer.update(dt, focus.x, focus.z);
    worldUpdate(dt, focus, state.time.hour, state.time.weather);
    lights.update(focus, sky.night);
    g.fx.update(dt);
    g.audio.setListener(camera.position.x, camera.position.y, camera.position.z, g.cameraRig.yaw);
    g.audio.update(dt);
    view.render(dt);
    emit('frame', dt);
  }

  function worldUpdate(dt, f, hour, weatherKind) {
    sky.update(dt, hour, weatherKind, f);
    terrain.update(f);
    water.update(dt, f);
    vegetation.update(dt, f);
    weather.update(dt, weatherKind, f, sky.night);
    ambient.update(dt, f, sky.night);
    roadside.update?.(f);
  }

  function nearestCityDistance() {
    let best = Infinity;
    for (const c of CITIES) best = Math.min(best, Math.max(0, Math.hypot(g.hero.x - c.x, g.hero.z - c.z) - c.radius * 0.5));
    return best;
  }

  const _proj = new THREE.Vector3();
  /** World point -> CSS pixels. `out` = {x, y, visible}. */
  g.project = (x, y, z, out) => {
    _proj.set(x, y, z).project(camera);
    out.visible = _proj.z > -1 && _proj.z < 1 && Math.abs(_proj.x) < 1.15 && Math.abs(_proj.y) < 1.15;
    out.x = (_proj.x * 0.5 + 0.5) * window.innerWidth;
    out.y = (-_proj.y * 0.5 + 0.5) * window.innerHeight;
    return out;
  };

  /** Coach travel between discovered cities (called by the stable screen after payment). */
  g.travelTo = cityKey => {
    const city = CITIES.find(c => c.key === cityKey);
    if (!city || !g.state) return false;
    const spot = getCityLayout(cityKey).spots.respawn || { x: city.x, z: city.z, yaw: 0 };
    g.heroCtl.teleport(spot.x, spot.z, spot.yaw || 0);
    streamer.preload(spot.x, spot.z);
    g.population.preload(spot.x, spot.z);
    g.heroCtl.settle();
    sleepUntil(g.state, (g.state.time.hour + 6) % 24);
    announceZone(true);
    g.save();
    return true;
  };

  // a placeholder hero position until a game starts (title camera uses the valley)
  g.hero = { x: 0, y: CITIES[0].y, z: 0, yaw: 0, alive: true, level: 1 };
  requestAnimationFrame(frame);

  // debug handle
  g.debug = {
    terrain, vegetation, streamer, sky, view, POIS,
    /** Run `n` frames synchronously (tests and hidden tabs where rAF is throttled). */
    step(n = 60, dt = 1 / 60) { for (let i = 0; i < n; i++) frame(last + dt * 1000, true); },
  };
  return g;
}
