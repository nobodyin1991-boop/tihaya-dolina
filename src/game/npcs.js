// People of the world: named NPCs on daily schedules, wandering citizens, gate guards, settlers at POIs.
// They are peaceful scenery + interaction targets; combat-capable guards for caravans live in mobs.js.
import { on } from '../core/events.js';
import { makeRng, seedFrom } from '../core/noise.js';
import { NPC_ROLES, cityByKey, poiById } from '../data/world-map.js';
import { NPCS, npcsOfPoi, ambientBarks, CITIZEN_NAMES } from '../data/npcs.js';
import { getCityLayout } from '../world/city-layout.js';
import { getPoiLayout } from '../world/poi-layout.js';
import { createNpc } from '../entities/npc-models.js';
import { walkHeightAt } from '../world/terrain.js';
import { turnToward } from './units.js';

let VISIBLE_RADIUS = 95;
let MAX_VISIBLE = 26;
let CITIZENS_PER_CITY = 14;
const WALK_SPEED = 1.35;

export function createNpcs(g) {
  if (g.settings.quality === 'mobile') { VISIBLE_RADIUS = 55; MAX_VISIBLE = 12; CITIZENS_PER_CITY = 8; }
  const npcs = [];
  const graphs = new Map();   // cityKey -> {nodes, adj}

  // ───────────── street graph path-finding ─────────────

  function graphFor(cityKey) {
    let gr = graphs.get(cityKey);
    if (gr) return gr;
    const { nodes, edges } = getCityLayout(cityKey).walk;
    const adj = nodes.map(() => []);
    for (const [a, b] of edges) {
      const d = Math.hypot(nodes[a].x - nodes[b].x, nodes[a].z - nodes[b].z);
      adj[a].push({ to: b, d }); adj[b].push({ to: a, d });
    }
    graphs.set(cityKey, gr = { nodes, adj });
    return gr;
  }
  function nearestNode(gr, x, z) {
    let best = 0, bd = Infinity;
    for (let i = 0; i < gr.nodes.length; i++) {
      const d = (gr.nodes[i].x - x) ** 2 + (gr.nodes[i].z - z) ** 2;
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }
  /** Dijkstra over the (small) street graph. Returns a list of points ending at (tx,tz). */
  function findPath(cityKey, x, z, tx, tz) {
    const gr = graphFor(cityKey);
    const start = nearestNode(gr, x, z), goal = nearestNode(gr, tx, tz);
    const dist = new Float32Array(gr.nodes.length).fill(Infinity);
    const prev = new Int32Array(gr.nodes.length).fill(-1);
    const done = new Uint8Array(gr.nodes.length);
    dist[start] = 0;
    for (;;) {
      let u = -1, best = Infinity;
      for (let i = 0; i < dist.length; i++) if (!done[i] && dist[i] < best) { best = dist[i]; u = i; }
      if (u < 0 || u === goal) break;
      done[u] = 1;
      for (const e of gr.adj[u]) if (dist[u] + e.d < dist[e.to]) { dist[e.to] = dist[u] + e.d; prev[e.to] = u; }
    }
    const path = [{ x: tx, z: tz }];
    for (let n = goal; n >= 0 && n !== start; n = prev[n]) path.push(gr.nodes[n]);
    path.reverse();
    return path;
  }

  // ───────────── creation ─────────────

  function addNpc(spec) {
    const npc = {
      kind: 'npc', id: spec.id, name: spec.name, title: spec.title || '', role: spec.role, cityKey: spec.cityKey || null, poiId: spec.poiId || null,
      named: !!spec.named, barks: spec.barks || [], schedule: spec.schedule || null,
      x: spec.x, z: spec.z, y: walkHeightAt(spec.x, spec.z), yaw: spec.yaw || 0,
      spot: null, path: null, pathI: 0, speedNow: 0, pauseT: Math.random() * 5, stance: spec.stance || 'idle',
      home: spec.home || null, hidden: false, talking: false, barkT: 4 + Math.random() * 20,
      modelSpec: spec.model, actor: null, radius: 0.4, height: 1.8, wander: !!spec.wander, guard: !!spec.guard,
    };
    npcs.push(npc);
    return npc;
  }

  function loadCity(cityKey) {
    const city = cityByKey(cityKey);
    const layout = getCityLayout(cityKey);
    const rng = makeRng(seedFrom('people:' + cityKey));
    // named role NPCs
    NPC_ROLES.forEach((role, i) => {
      const data = NPCS[`${cityKey}:${role}`] || { name: role, title: '' };
      const spot = layout.spots[role];
      if (!spot) return;
      addNpc({
        id: `${cityKey}:${role}`, named: true, role, cityKey, name: data.name, title: data.title, barks: data.barks, schedule: data.schedule,
        x: spot.x, z: spot.z, yaw: spot.yaw, stance: 'work', home: layout.homes[i % layout.homes.length],
        model: { role, cityStyle: city.style, seed: seedFrom(`${cityKey}:${role}`), gender: data.gender, age: data.age, look: data.look },
      });
    });
    // wandering citizens
    const barks = ambientBarks(cityKey, g.state?.caravan?.stage || 0);
    const names = CITIZEN_NAMES[cityKey] || [];
    for (let i = 0; i < CITIZENS_PER_CITY; i++) {
      const node = layout.walk.nodes[Math.floor(rng() * layout.walk.nodes.length)];
      const kind = rng() < 0.12 ? 'child' : rng() < 0.3 ? 'merchant' : rng() < 0.5 ? 'farmer' : 'citizen';
      addNpc({
        id: `${cityKey}:citizen${i}`, role: kind, cityKey, name: kind === 'child' ? 'Ребёнок' : (typeof names[i] === 'string' ? names[i] : names[i]?.name) || 'Горожанин', barks,
        x: node.x, z: node.z, wander: true, home: layout.homes[(i * 3 + 5) % layout.homes.length],
        model: { role: kind, cityStyle: city.style, seed: seedFrom(`${cityKey}:c${i}`) },
      });
    }
    // gate guards
    layout.walls.gates.forEach((gate, i) => {
      for (const side of [-1, 1]) {
        const off = (gate.width || 9) / 2 + 1.2;
        const gx = gate.x + Math.cos(gate.yaw) * off * side - Math.sin(gate.yaw) * 2.5 * 0;
        const gz = gate.z - Math.sin(gate.yaw) * off * side;
        addNpc({
          id: `${cityKey}:guard${i}${side}`, role: 'guard', cityKey, name: 'Стражник', guard: true, stance: 'guard',
          x: gx, z: gz, yaw: gate.yaw + Math.PI, barks: ['Проходи, не задерживайся.', 'На тракте неспокойно. Гляди в оба.', 'За стенами — сам за себя.'],
          model: { role: 'guard', cityStyle: city.style, seed: seedFrom(`${cityKey}:g${i}${side}`) },
        });
      }
    });
  }

  function loadPoi(poiId) {
    const poi = poiById(poiId);
    if (poi.faction !== 'friendly') return;
    const layout = getPoiLayout(poiId);
    const named = npcsOfPoi(poiId);
    (layout.spots.npcs || []).forEach((s, i) => {
      const id = `${poiId}:${i}`;
      // named settlers take the spots whose role matches theirs first, then any remaining spot in order
      const data = named.find(n => !n.placed && n.role === s.role) || named.find(n => !n.placed) || null;
      if (data) data.placed = true;
      addNpc({
        id: data?.id || id, named: !!data, role: data?.role || s.role || 'citizen', poiId, name: data?.name || roleName(s.role), title: data?.title || poi.name, barks: data?.barks || [],
        x: s.x, z: s.z, yaw: s.yaw || 0, stance: s.role === 'guard' ? 'guard' : 'work',
        model: { role: s.role || 'citizen', cityStyle: 'timber', seed: seedFrom(id), gender: data?.gender, age: data?.age, look: data?.look },
      });
    });
    for (const n of named) delete n.placed;
  }
  const roleName = role => ({ hunter: 'Охотник', farmer: 'Крестьянин', miner: 'Рудокоп', fisher: 'Рыбак', guard: 'Дозорный', merchant: 'Торговец' }[role] || 'Житель');

  function unload(pred) {
    for (let i = npcs.length - 1; i >= 0; i--) {
      if (!pred(npcs[i])) continue;
      dropActor(npcs[i]);
      npcs.splice(i, 1);
    }
  }
  function dropActor(npc) {
    if (!npc.actor) return;
    g.scene.remove(npc.actor.group);
    npc.actor.dispose();
    npc.actor = null;
  }

  on('stream:city-loaded', ({ cityKey }) => loadCity(cityKey));
  on('stream:city-unloading', ({ cityKey }) => unload(n => n.cityKey === cityKey));
  on('stream:poi-loaded', ({ poiId }) => loadPoi(poiId));
  on('stream:poi-unloading', ({ poiId }) => unload(n => n.poiId === poiId));

  // ───────────── behaviour ─────────────

  /** Where a named NPC should be at this hour: {x, z, yaw, stance, hidden}. */
  function scheduledSpot(npc, hour) {
    const layout = getCityLayout(npc.cityKey);
    let where = 'work';
    for (const s of npc.schedule || []) {
      const inRange = s.from <= s.to ? hour >= s.from && hour < s.to : hour >= s.from || hour < s.to;
      if (inRange) { where = s.spot; break; }
    }
    const work = layout.spots[npc.role];
    if (where === 'home' && npc.home) return { ...npc.home, stance: 'idle', hidden: true };
    if (where === 'tavern') {
      const inn = layout.spots.innkeeper;
      const k = seedFrom(npc.id) % 7;
      return { x: inn.x + Math.cos(k) * 3.5, z: inn.z + Math.sin(k) * 3.5 + 3, yaw: k, stance: 'idle' };
    }
    if (where === 'square') {
      const k = seedFrom(npc.id) % 9;
      return { x: layout.spots.square.x + Math.cos(k * 0.7) * 6, z: layout.spots.square.z + Math.sin(k * 0.7) * 6, yaw: k, stance: 'idle' };
    }
    if (where === 'gate') {
      const gate = layout.walls.gates[0];
      return { x: gate.x - Math.sin(gate.yaw) * 6, z: gate.z - Math.cos(gate.yaw) * 6, yaw: gate.yaw, stance: 'idle' };
    }
    return { x: work.x, z: work.z, yaw: work.yaw, stance: 'work' };
  }

  function followPath(npc, dt) {
    const p = npc.path[npc.pathI];
    const dx = p.x - npc.x, dz = p.z - npc.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.35) {
      npc.pathI++;
      if (npc.pathI >= npc.path.length) { npc.path = null; npc.speedNow = 0; return true; }
      return false;
    }
    const step = Math.min(d, WALK_SPEED * dt);
    npc.x += dx / d * step; npc.z += dz / d * step;
    npc.y = walkHeightAt(npc.x, npc.z);
    npc.speedNow = WALK_SPEED;
    turnToward(npc, Math.atan2(dx, dz), 6, dt);
    return false;
  }

  function thinkNamed(npc, dt, hour) {
    if (!npc.cityKey || !npc.schedule) return;
    const want = scheduledSpot(npc, hour);
    if (npc.path) {
      if (followPath(npc, dt)) { npc.yaw = want.yaw ?? npc.yaw; npc.stance = want.stance; npc.hidden = !!want.hidden; }
      return;
    }
    if (Math.hypot(want.x - npc.x, want.z - npc.z) > 1.2) {
      npc.hidden = false;
      npc.stance = 'idle';
      npc.path = findPath(npc.cityKey, npc.x, npc.z, want.x, want.z);
      npc.pathI = 0;
    }
  }

  function thinkCitizen(npc, dt, hour) {
    const night = hour >= 22 || hour < 5.5;
    if (npc.path) {
      if (followPath(npc, dt)) {
        npc.pauseT = 4 + Math.random() * 14;
        if (npc.goingHome) { npc.hidden = true; }
        else if (npc.spot) { npc.yaw = npc.spot.yaw ?? npc.yaw; npc.stance = npc.spot.kind === 'sit' ? 'sit' : npc.spot.kind === 'lean' ? 'lean' : 'idle'; }
      }
      return;
    }
    npc.pauseT -= dt;
    if (npc.pauseT > 0) return;
    const layout = getCityLayout(npc.cityKey);
    npc.stance = 'idle';
    if (night && npc.home) {
      if (npc.hidden) { npc.pauseT = 20; return; }
      npc.goingHome = true; npc.spot = null;
      npc.path = findPath(npc.cityKey, npc.x, npc.z, npc.home.x, npc.home.z);
    } else {
      npc.hidden = false; npc.goingHome = false;
      if (Math.random() < 0.45 && layout.idle.length) {
        npc.spot = layout.idle[Math.floor(Math.random() * layout.idle.length)];
        npc.path = findPath(npc.cityKey, npc.x, npc.z, npc.spot.x, npc.spot.z);
      } else {
        const node = layout.walk.nodes[Math.floor(Math.random() * layout.walk.nodes.length)];
        npc.spot = null;
        npc.path = findPath(npc.cityKey, npc.x, npc.z, node.x, node.z);
      }
    }
    npc.pathI = 0;
  }

  const byDistance = (a, b) => a.distHero - b.distHero;
  const visible = [];

  function update(dt) {
    const hero = g.hero;
    const hour = g.state.time?.hour ?? 12;
    visible.length = 0;
    for (const npc of npcs) {
      npc.distHero = Math.hypot(npc.x - hero.x, npc.z - hero.z);
      if (!npc.talking) {
        if (npc.named) thinkNamed(npc, dt, hour);
        else if (npc.wander) thinkCitizen(npc, dt, hour);
      } else {
        npc.speedNow = 0;
        turnToward(npc, Math.atan2(hero.x - npc.x, hero.z - npc.z), 5, dt);
      }
      if (!npc.hidden && npc.distHero < VISIBLE_RADIUS) visible.push(npc);
      // ambient barks when the hero walks by
      if (!npc.hidden && npc.distHero < 7 && npc.barks.length && !npc.talking) {
        npc.barkT -= dt;
        if (npc.barkT <= 0) {
          npc.barkT = 35 + Math.random() * 50;
          g.bark(npc, npc.barks[Math.floor(Math.random() * npc.barks.length)]);
        }
      }
    }
    visible.sort(byDistance);
    for (const npc of npcs) {
      const show = !npc.hidden && npc.distHero < VISIBLE_RADIUS && visible.indexOf(npc) < MAX_VISIBLE;
      if (show && !npc.actor) {
        npc.actor = createNpc(npc.modelSpec);
        npc.height = npc.actor.height || 1.8;
        npc.shownStance = null;
        g.scene.add(npc.actor.group);
      } else if (!show && npc.actor && (npc.hidden || npc.distHero > VISIBLE_RADIUS + 15)) {
        dropActor(npc);
      }
      if (!npc.actor) continue;
      npc.actor.group.visible = show;
      if (!show) continue;
      npc.actor.group.position.set(npc.x, npc.y, npc.z);
      npc.actor.group.rotation.y = npc.yaw;
      const stance = npc.speedNow > 0.1 ? 'idle' : npc.talking ? 'idle' : npc.stance;
      if (stance !== npc.shownStance) { npc.actor.setStance(stance); npc.shownStance = stance; }
      npc.actor.setLod(npc.distHero < 22 ? 0 : npc.distHero < 50 ? 1 : 2);
      npc.actor.update(dt, { speed: npc.speedNow });
    }
  }

  return {
    list: npcs, update,
    byId: id => npcs.find(n => n.id === id) || null,
    /** Nearest visible NPC the hero could talk to. */
    nearest(x, z, r) {
      let best = null, bd = r;
      for (const n of npcs) {
        if (n.hidden) continue;
        const d = Math.hypot(n.x - x, n.z - z);
        if (d < bd) { bd = d; best = n; }
      }
      return best;
    },
    setTalking(npc, on) { if (npc) { npc.talking = on; if (on && npc.actor) npc.actor.play('talk', 2); } },
  };
}
