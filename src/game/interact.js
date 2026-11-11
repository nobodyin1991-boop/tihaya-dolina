// "Press E": finds what the hero can interact with, runs channelled actions (gathering, clearing obstacles),
// and builds the world labels / markers the HUD draws.
import { emit } from '../core/events.js';
import { addItem } from '../sim/inventory.js';
import { addCoins } from '../sim/player.js';
import { gatherNode } from '../sim/gathering.js';
import { rollChest } from '../sim/loot.js';
import { markHarvested, markChestOpened, isDiscovered } from '../sim/worldstate.js';
import { itemName } from '../data/items.js';
import { CITIES, POIS } from '../data/world-map.js';
import { getCityLayout } from '../world/city-layout.js';
import { listQuests } from '../sim/quests.js';

const REACH = 3.4;

export function createInteraction(g) {
  const api = { channel: null };
  let current = null;         // the candidate under the prompt
  let scanT = 0;
  let channel = null;         // {text, t, total, onDone, anim}

  // ───────────── candidates ─────────────

  function consider(best, cand, x, z, bonus = 0) {
    const d = Math.hypot(cand.x - x, cand.z - z) - bonus;
    if (d < best.d) { best.d = d; best.c = cand; }
  }

  function findCandidate() {
    const h = g.hero;
    const best = { d: REACH, c: null };
    const wagon = g.caravanRun.interactable?.();
    if (wagon) consider(best, wagon, h.x, h.z, 2.2);
    for (const ob of g.caravanRun.obstacles?.() || []) consider(best, ob, h.x, h.z, 3.5);
    for (const m of g.mobs.list) if (!m.alive && !m.looted && m.team === 'hostile' && m.loot) consider(best, m, h.x, h.z, 0.4);
    const npc = g.npcs.nearest(h.x, h.z, REACH + 0.4);
    if (npc) consider(best, npc, h.x, h.z, 0.3);
    g.population.forEachInteractable(h.x, h.z, REACH + 1, c => consider(best, c, h.x, h.z, 0.5));
    if (g.zone.city) {
      const board = getCityLayout(g.zone.city.key).spots.board;
      if (board) consider(best, { kind: 'board', x: board.x, z: board.z, cityKey: g.zone.city.key }, h.x, h.z, 0.6);
    }
    return best.c;
  }

  function describe(c) {
    const key = g.input.caption('interact');
    switch (c.kind) {
      case 'npc': return { key, text: c.named ? `Поговорить: ${c.name}` : c.name, sub: c.title || '' };
      case 'node': return { key, text: `Собрать: ${c.def?.name || itemName(c.nodeType)}`, sub: '' };
      case 'chest': return g.population.poiHostile(c.poiId) ? { key: '', text: 'Сундук под охраной', sub: 'Сначала разберитесь с хозяевами' } : { key, text: 'Открыть сундук', sub: '' };
      case 'mob': return { key, text: `Обыскать: ${c.name}`, sub: '' };
      case 'board': return { key, text: 'Доска объявлений', sub: 'Заказы горожан и награды' };
      case 'wagon': return { key, text: c.promptText || 'Караван', sub: c.promptSub || '' };
      case 'obstacle': return { key, text: c.promptText || 'Расчистить путь', sub: c.promptSub || '' };
      default: return null;
    }
  }

  // ───────────── actions ─────────────

  function startChannel(text, seconds, onDone, anim = 'gather') {
    channel = { text, t: 0, total: Math.max(0.2, seconds), onDone, anim, x: g.hero.x, z: g.hero.z, animT: 0 };
    api.channel = { text, progress: 0 };
    g.heroCtl.playAction(anim, 1.1);
  }
  function cancelChannel() {
    channel = null;
    api.channel = null;
  }

  function gather(node) {
    const stats = g.heroCtl.stats();
    const seconds = (node.def?.gatherTime || 2.5) / (stats.gatherSpeed || 1);
    const sound = { herbalism: 'gather-herb', mining: 'gather-ore', logging: 'gather-wood', stonecutting: 'gather-stone' }[node.def?.skill] || 'gather-herb';
    g.heroCtl.faceTo(node.x, node.z);
    startChannel(node.def?.name || 'Сбор', seconds, () => {
      const res = gatherNode(g.state, node.nodeType, Math.random);
      if (!res.ok) { emit('toast', { text: res.reason, kind: 'warn' }); g.audio.play('error'); return; }
      markHarvested(g.state, node.key, node.def?.respawnSeconds || 300);
      g.population.nodeHarvested(node);
      const items = { [res.itemId]: res.count };
      for (const b of res.bonus || []) items[b.itemId] = (items[b.itemId] || 0) + b.count;
      emit('loot:gained', { coins: 0, items, source: 'gather' });
      g.worldEvent('world:gather', { nodeType: node.nodeType, itemId: res.itemId, count: res.count });
    });
    channel.sound = sound;
  }

  function lootCorpse(mob) {
    const loot = mob.loot;
    const got = {};
    if (loot.coins) { addCoins(g.state, loot.coins); }
    let left = false;
    for (const [id, n] of Object.entries(loot.items || {})) {
      const added = addItem(g.state, id, n);
      if (added) got[id] = added;
      if (added < n) { loot.items[id] = n - added; left = true; } else delete loot.items[id];
    }
    if (loot.coins || Object.keys(got).length) emit('loot:gained', { coins: loot.coins || 0, items: got, source: 'corpse' });
    loot.coins = 0;
    g.heroCtl.playAction('gather', 0.7);
    g.audio.play(Object.keys(got).length ? 'equip' : 'coin');
    if (left) emit('toast', { text: 'Сумка полна — часть добычи осталась', kind: 'warn' });
    else mob.looted = true;
  }

  function openChest(chest) {
    if (g.population.poiHostile(chest.poiId)) { emit('toast', { text: 'Сундук под охраной', kind: 'warn' }); return; }
    const poi = POIS.find(p => p.id === chest.poiId);
    startChannel('Сундук', 1.4, () => {
      const loot = rollChest(poi.level, Math.random);
      const got = {};
      addCoins(g.state, loot.coins || 0);
      for (const [id, n] of Object.entries(loot.items || {})) { const a = addItem(g.state, id, n); if (a) got[id] = a; }
      markChestOpened(g.state, chest.poiId);
      g.population.openChest(chest);
      g.audio.play('chest');
      emit('loot:gained', { coins: loot.coins || 0, items: got, source: 'chest' });
      g.worldEvent('world:chest', { poiId: chest.poiId });
    }, 'use');
  }

  function interact() {
    if (channel) return;
    const c = current;
    if (!c || g.hero.mounted && c.kind !== 'npc') return;
    switch (c.kind) {
      case 'npc':
        if (!c.named) { if (c.barks?.length) g.bark(c, c.barks[Math.floor(Math.random() * c.barks.length)]); return; }
        g.heroCtl.faceTo(c.x, c.z);
        g.npcs.setTalking(c, true);
        g.worldEvent('world:talk', { npcId: c.id });
        emit('ui:open', { screen: 'dialogue', params: { npcId: c.id } });
        break;
      case 'node': gather(c); break;
      case 'chest': openChest(c); break;
      case 'mob': lootCorpse(c); break;
      case 'board': emit('ui:open', { screen: 'board', params: { cityKey: c.cityKey } }); break;
      case 'wagon': case 'obstacle': g.caravanRun.interact(c, startChannel); break;
    }
  }

  g.input.onAction((action, pressed) => { if (action === 'interact' && pressed && g.phase === 'playing' && !g.paused) interact(); });

  // ───────────── update ─────────────

  function update(dt) {
    if (channel) {
      const moved = Math.hypot(g.hero.x - channel.x, g.hero.z - channel.z) > 0.6;
      if (moved || !g.hero.alive || g.heroCtl.recentlyHit()) { cancelChannel(); }
      else {
        channel.t += dt;
        channel.animT -= dt;
        if (channel.animT <= 0) { channel.animT = 1.0; g.heroCtl.playAction(channel.anim, 1.0); if (channel.sound) g.audio.play(channel.sound, { volume: 0.7 }); }
        api.channel.progress = Math.min(1, channel.t / channel.total);
        if (channel.t >= channel.total) { const done = channel.onDone; cancelChannel(); done(); }
      }
    }
    scanT -= dt;
    if (scanT <= 0) {
      scanT = 0.12;
      current = channel || !g.hero.alive ? null : findCandidate();
      g.prompt = current ? describe(current) : null;
    }
  }

  // ───────────── labels & markers for the HUD ─────────────

  const labelPool = [];
  const labels = [];
  function pushLabel(id, x, y, z, text, sub, kind, hp, hostile, level, dist, targeted) {
    let l = labelPool[labels.length];
    if (!l) labelPool.push(l = {});
    l.id = id; l.x = x; l.y = y; l.z = z; l.text = text; l.sub = sub; l.kind = kind; l.hp = hp; l.hostile = hostile; l.level = level; l.dist = dist; l.targeted = targeted;
    labels.push(l);
  }

  g.labels = function buildLabels() {
    labels.length = 0;
    const h = g.hero, target = h.target;
    for (const m of g.mobs.list) {
      if (m.distHero > 45) continue;
      if (!m.alive) { if (!m.looted && m.loot && m.distHero < 12 && m.team === 'hostile') pushLabel('m' + m.id, m.x, m.y + 0.8, m.z, m.name, 'добыча', 'corpse', null, false, m.level, m.distHero, false); continue; }
      const targeted = target === m;
      const damaged = m.hp < m.maxHp;
      if (!targeted && !damaged && m.distHero > 22) continue;
      pushLabel('m' + m.id, m.x, m.y + m.height + 0.35, m.z, m.name, m.boss ? 'главарь' : m.elite ? 'матёрый' : '', 'mob', targeted || damaged ? m.hp / m.maxHp : null, m.team === 'hostile' && (m.def.aggressive || m.provoked || m.scripted), m.level, m.distHero, targeted);
    }
    for (const n of g.npcs.list) {
      if (n.hidden || n.distHero > (n.named ? 20 : 9) || !n.actor) continue;
      pushLabel(n.id, n.x, n.y + n.height + 0.3, n.z, n.name, n.named ? n.title : '', 'npc', null, false, 0, n.distHero, false);
    }
    g.population.forEachInteractable(h.x, h.z, 16, c => {
      if (c.kind === 'node') pushLabel(c.key, c.x, c.y + (c.model?.userData.height || 1.4) + 0.2, c.z, c.def?.name || itemName(c.nodeType), '', 'node', null, false, 0, Math.hypot(c.x - h.x, c.z - h.z), false);
      else pushLabel('chest' + c.poiId, c.x, c.y + 1.2, c.z, 'Сундук', '', 'chest', null, false, 0, Math.hypot(c.x - h.x, c.z - h.z), false);
    });
    g.caravanRun.pushLabels?.(pushLabel);
    return labels;
  };

  let markerCache = null, markerT = -1;
  g.markers = function buildMarkers() {
    if (markerCache && g.time - markerT < 0.5) return markerCache;
    markerT = g.time;
    const out = [];
    for (const c of CITIES) out.push({ id: c.key, kind: 'city', x: c.x, z: c.z, label: c.name, discovered: isDiscovered(g.state, c.key) });
    for (const p of POIS) if (isDiscovered(g.state, p.id)) out.push({ id: p.id, kind: 'poi', poiType: p.type, x: p.x, z: p.z, label: p.name, discovered: true });
    for (const q of listQuests(g.state)) {
      if (q.status === 'done' || !q.marker) continue;
      out.push({ id: 'quest:' + q.id, kind: 'quest', x: q.marker.x, z: q.marker.z, label: q.title, discovered: true, tracked: !!q.tracked, ready: q.status === 'ready' });
    }
    g.caravanRun.pushMarkers?.(out);
    return markerCache = out;
  };

  api.update = update;
  api.cancel = cancelChannel;
  api.busy = () => !!channel;
  return api;
}
