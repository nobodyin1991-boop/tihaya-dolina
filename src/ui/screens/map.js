// World map screen (menu tab, action `map`).
// Base bitmap comes from map-render.js (rendered once); this file draws the live overlay: roads, river,
// fog of war from state.world.explored, region names, markers, the player arrow — with pan, zoom and selection.
import { on } from '../../core/events.js';
import { WORLD, CITIES, POIS, REGIONS, LEGS } from '../../data/world-map.js';
import { MAP_CELL } from '../../sim/worldstate.js';
import { regionAt, levelAt } from '../../world/terrain.js';
import { icon } from '../icons.js';
import { el, clear, setText, button, sectionTitle, statRow, tag, progressRing, tooltip } from '../kit.js';
import { getMapBitmap, getMapVectors } from '../map-render.js';
import { markerIcon, poiIcon, POI_TYPE_NAMES, MARKER_KIND_NAMES, formatDistance } from '../markers.js';

const ZOOMS = [1, 1.9, 3.4, 6];
const HALF = WORLD.half;
const FOG_CELLS = Math.round((HALF * 2) / MAP_CELL);
const BIOME_NAMES = {
  meadow: 'Луга', farmland: 'Пашни', forest: 'Лес', darkforest: 'Глухой лес', highland: 'Холмы', mountain: 'Горы',
  snow: 'Ледники', steppe: 'Степь', coast: 'Побережье', swamp: 'Болота', heath: 'Пустошь', lake: 'Озёрный край',
};
const FACTION_NOTES = { bandit: 'Разбойники', beast: 'Дикие твари', friendly: 'Мирное место', none: 'Заброшено' };
const LEGEND = [
  ['city', 'Город'], ['village', 'Деревня'], ['outpost', 'Застава'], ['farm', 'Хозяйство'], ['camp', 'Стоянка'],
  ['mine', 'Рудник'], ['ruin', 'Руины'], ['landmark', 'Ориентир'], ['banditcamp', 'Разбойники'], ['lair', 'Логово'],
  ['quest', 'Задание'], ['wagon', 'Караван'],
];

const within = (target, selector) => !!(target && target.closest && target.closest(selector));

function poiDescription(poi) {
  const lines = [];
  if (poi.type === 'banditcamp') {
    const leg = LEGS[poi.leg];
    lines.push(leg ? `Пока лагерь стоит, засады на пути «${leg.name}» злее и чаще.` : 'Гнездо лихих людей вдали от дорог.');
    if (poi.boss) lines.push('Здесь засел главарь шайки.');
  } else if (poi.type === 'lair') lines.push('Логово матёрого зверя. Без подготовки сюда лучше не соваться.');
  else if (poi.type === 'ruin') lines.push('Старые стены давно без хозяина — но не без обитателей.');
  else if (poi.type === 'mine') lines.push(poi.faction === 'friendly' ? 'Действующий рудник: руда, уголь и работа для крепких рук.' : 'Заброшенные выработки. Жилы ещё не выбраны.');
  else if (poi.type === 'farm') lines.push('Крестьянское хозяйство. Здесь можно перевести дух.');
  else if (poi.type === 'camp') lines.push('Рабочая стоянка: костёр, навес и свежие новости.');
  else if (poi.type === 'village') lines.push('Небольшое поселение у дороги.');
  else if (poi.type === 'outpost') lines.push('Пост дорожной стражи. Рядом с ним на тракте спокойнее.');
  else lines.push('Приметное место, известное каждому путнику.');
  if (poi.chest) lines.push('Говорят, где-то здесь спрятан тайник.');
  return lines.join(' ');
}

export function registerMapScreen(ui, g) {
  // warm the bitmap up in the background shortly after the game starts
  on('game:started', () => setTimeout(() => getMapBitmap().start(), 4000));

  ui.registerScreen({
    id: 'map',
    title: 'Карта',
    action: 'map',
    tab: { order: 60, icon: 'map' },
    create: () => createMapScreen(g, ui),
  });
}

function createMapScreen(g, ui) {
  const bitmap = getMapBitmap();
  const vectors = getMapVectors();
  const canvas = el('canvas.map-canvas');
  const ctx = canvas.getContext('2d');
  const markerLayer = el('div.map-markers');
  const ring = progressRing({ value: 0, label: '0%', size: '5em' });
  const progress = el('div.map-progress', null, [ring, el('div.map-progress-text', { text: 'Картограф чертит карту…' })]);
  const zoomLabel = el('span.map-zoom-label.t-num');
  const controls = el('div.map-controls', null, [
    el('button.map-ctl', { type: 'button', onClick: () => zoomBy(1) }, icon('plus')),
    zoomLabel,
    el('button.map-ctl', { type: 'button', onClick: () => zoomBy(-1) }, icon('minus')),
    el('button.map-ctl', { type: 'button', onClick: centreOnPlayer }, icon('target')),
  ]);
  tooltip.attach(controls.lastChild, 'К герою — Пробел');
  const rose = el('div.map-rose', null, [icon('arrow-up'), el('span', { text: 'С' })]);
  const stage = el('div.map-stage.interactive', null, [canvas, markerLayer, el('i.map-frame'), rose, controls, progress]);
  const side = el('aside.map-side.kit-scroll.interactive');
  const view = el('div.map-view', null, [stage, side]);

  const fogSmall = document.createElement('canvas');
  fogSmall.width = FOG_CELLS;
  fogSmall.height = FOG_CELLS;
  const fog = document.createElement('canvas');
  fog.width = FOG_CELLS * 4;
  fog.height = FOG_CELLS * 4;

  let width = 0;
  let height = 0;
  let dpr = 1;
  let zoomIndex = 1;
  let firstOpen = true;
  let scale = 0;          // CSS px per metre (animated)
  let targetScale = 0;
  let cx = 0;
  let cz = 0;
  let dirty = true;
  let isOpen = false;
  let markers = [];
  let selected = null;    // {kind, id, ...}
  let drag = null;
  let playerMarker = null;

  const explored = () => (g.state && g.state.world && g.state.world.explored) || {};
  const discovered = () => (g.state && g.state.world && g.state.world.discovered) || {};
  const isExploredAt = (x, z) => !!explored()[`${Math.floor(x / MAP_CELL)},${Math.floor(z / MAP_CELL)}`];
  const fitScale = () => (Math.min(width, height) / (HALF * 2)) * 0.98;

  // ───────────── fog ─────────────
  function rebuildFog() {
    const small = fogSmall.getContext('2d');
    const image = small.createImageData(FOG_CELLS, FOG_CELLS);
    const data = image.data;
    const ex = explored();
    const half = FOG_CELLS / 2;
    for (let j = 0; j < FOG_CELLS; j++) {
      for (let i = 0; i < FOG_CELLS; i++) {
        const o = (j * FOG_CELLS + i) * 4;
        data[o] = 17;
        data[o + 1] = 15;
        data[o + 2] = 12;
        data[o + 3] = ex[`${i - half},${j - half}`] ? 0 : 236;
      }
    }
    small.putImageData(image, 0, 0);
    const big = fog.getContext('2d');
    big.clearRect(0, 0, fog.width, fog.height);
    big.filter = 'blur(3.2px)';
    big.imageSmoothingEnabled = true;
    big.drawImage(fogSmall, 0, 0, fog.width, fog.height);
    big.filter = 'none';
    dirty = true;
  }

  // ───────────── markers ─────────────
  function addMarker(data) {
    const glyph = icon(data.icon);
    const label = data.caption ? el('span.map-marker-label', { text: data.caption }) : null;
    const node = el('div.map-marker', { class: data.class || '' }, [el('span.map-marker-glyph', null, glyph), label]);
    tooltip.attach(node, () => (data.tip ? data.tip() : data.name));
    node.addEventListener('click', event => {
      event.stopPropagation();
      select(data);
    });
    node.addEventListener('dblclick', () => toggleTrack(data));
    markerLayer.append(node);
    const marker = { ...data, node };
    markers.push(marker);
    return marker;
  }

  function rebuildMarkers() {
    clear(markerLayer);
    markers = [];
    const known = discovered();
    for (const city of CITIES) {
      if (!known[city.key]) continue;
      addMarker({ kind: 'city', id: city.key, x: city.x, z: city.z, icon: 'city', name: city.name, caption: city.name, class: 'mk-city', ref: city });
    }
    for (const poi of POIS) {
      if (!known[poi.id]) continue;
      addMarker({
        kind: 'poi', id: poi.id, x: poi.x, z: poi.z, icon: poiIcon(poi.type), name: poi.name, caption: poi.name,
        class: `mk-poi f-${poi.faction}`, ref: poi, tip: () => `${poi.name} · ${POI_TYPE_NAMES[poi.type] || 'Место'}`,
      });
    }
    for (const m of g.markers() || []) {
      if (m.kind === 'city' || m.kind === 'poi') continue;
      addMarker({ kind: m.kind, id: m.id, x: m.x, z: m.z, icon: markerIcon(m), name: m.label || MARKER_KIND_NAMES[m.kind], class: `mk-${m.kind}`, ref: m });
    }
    playerMarker = addMarker({ kind: 'player', id: '@player', x: g.hero.x, z: g.hero.z, icon: 'player', name: 'Вы здесь', class: 'mk-player' });
    paintTracked();
    dirty = true;
  }

  function paintTracked() {
    const tracked = ui.trackedMarker;
    for (const m of markers) m.node.classList.toggle('tracked', m.id === tracked);
    for (const m of markers) m.node.classList.toggle('selected', !!selected && selected.id === m.id);
  }

  function toggleTrack(data) {
    if (data.kind === 'player' || data.kind === 'region') return;
    const on = ui.trackedMarker !== data.id;
    ui.trackMarker(on ? data.id : null);
    ui.toast(on ? `Метка на компасе: ${data.name}` : 'Метка снята', 'info');
    paintTracked();
    renderSide();
  }

  // ───────────── side panel ─────────────
  function placeCard() {
    if (!selected) {
      return el('div.map-card.empty', null, [
        el('div.kit-empty-text', { text: 'Выберите место на карте, чтобы узнать о нём больше.' }),
      ]);
    }
    const s = selected;
    const hero = g.hero;
    const rows = [];
    let typeLine = '';
    let description = '';
    let tags = [];
    if (s.kind === 'city') {
      const level = levelAt(s.ref.x, s.ref.z);
      typeLine = 'Город';
      description = s.ref.desc;
      rows.push(statRow('Окрестности', `ур. ${level.min}–${level.max}`));
      tags = [tag('Безопасно', 'good'), tag('Торговля', 'gold')];
    } else if (s.kind === 'poi') {
      typeLine = POI_TYPE_NAMES[s.ref.type] || 'Место';
      description = poiDescription(s.ref);
      rows.push(statRow('Уровень', s.ref.level));
      rows.push(statRow('Хозяева', FACTION_NOTES[s.ref.faction] || '—'));
      if (s.ref.faction === 'bandit' || s.ref.faction === 'beast') tags.push(tag('Опасно', 'bad'));
      if (s.ref.boss || s.ref.creature) tags.push(tag('Вожак', 'warn'));
      if (s.ref.chest) tags.push(tag('Тайник', 'gold'));
    } else if (s.kind === 'region') {
      typeLine = BIOME_NAMES[s.ref.biome] || 'Край';
      description = `Существа ${s.ref.level[0]}–${s.ref.level[1]} уровня.`;
      rows.push(statRow('Уровень существ', `${s.ref.level[0]}–${s.ref.level[1]}`));
      const heroLevel = hero.level || 1;
      if (s.ref.level[0] > heroLevel + 2) tags.push(tag('Слишком опасно', 'bad'));
      else if (s.ref.level[1] < heroLevel - 3) tags.push(tag('Спокойные места', 'good'));
    } else if (s.kind === 'player') {
      const region = regionAt(hero.x, hero.z);
      typeLine = 'Ваше положение';
      description = `${region.name}. Существа ${region.level[0]}–${region.level[1]} уровня.`;
    } else {
      typeLine = MARKER_KIND_NAMES[s.kind] || 'Метка';
      description = s.ref && s.ref.desc ? s.ref.desc : '';
    }
    if (s.kind !== 'player') rows.push(statRow('Расстояние', formatDistance(Math.hypot(s.x - hero.x, s.z - hero.z))));
    const tracked = ui.trackedMarker === s.id;
    const canTrack = s.kind !== 'player' && s.kind !== 'region';
    return el('div.map-card', null, [
      el('div.map-card-head', null, [
        el('div.map-card-icon', { class: s.class || '' }, icon(s.icon || 'diamond')),
        el('div', null, [el('div.map-card-name', { text: s.name }), el('div.map-card-type', { text: typeLine })]),
      ]),
      tags.length ? el('div.map-card-tags', null, tags) : null,
      description ? el('p.map-card-desc', { text: description }) : null,
      rows,
      canTrack ? button(tracked ? 'Снять метку' : 'Отметить на компасе', { small: true, primary: !tracked, icon: 'target', onClick: () => toggleTrack(s) }) : null,
    ]);
  }

  function renderSide() {
    const z = g.zone || {};
    const here = (z.city && z.city.name) || (z.region && z.region.name) || '';
    const found = Object.keys(discovered()).length;
    clear(side, [
      el('div.map-side-title', { text: 'Карта мира' }),
      el('div.map-side-here', { text: here ? `Вы находитесь: ${here}` : '' }),
      el('div.kit-orn', null, el('i')),
      placeCard(),
      sectionTitle('Обозначения', `открыто мест: ${found} / ${CITIES.length + POIS.length}`),
      el('div.map-legend', null, LEGEND.map(([key, label]) => el('div.map-legend-item', { class: `lg-${key}` }, [icon(key), el('span', { text: label })]))),
    ]);
  }

  function select(data) {
    selected = data;
    paintTracked();
    renderSide();
    dirty = true;
  }

  // ───────────── view ─────────────
  function clampCentre() {
    const spanX = width / 2 / scale;
    const spanZ = height / 2 / scale;
    const limitX = Math.max(0, HALF * 1.02 - spanX);
    const limitZ = Math.max(0, HALF * 1.02 - spanZ);
    cx = Math.max(-limitX, Math.min(limitX, cx));
    cz = Math.max(-limitZ, Math.min(limitZ, cz));
  }

  function resize() {
    const rect = stage.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    width = rect.width;
    height = rect.height;
    dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    targetScale = fitScale() * ZOOMS[zoomIndex];
    scale = targetScale;
    clampCentre();
    dirty = true;
  }
  new ResizeObserver(resize).observe(stage);

  function zoomBy(direction, anchorX, anchorY) {
    const next = Math.max(0, Math.min(ZOOMS.length - 1, zoomIndex + direction));
    if (next === zoomIndex) return;
    // keep the world point under the cursor in place
    const ax = anchorX === undefined ? width / 2 : anchorX;
    const ay = anchorY === undefined ? height / 2 : anchorY;
    const wx = cx + (ax - width / 2) / scale;
    const wz = cz + (ay - height / 2) / scale;
    zoomIndex = next;
    targetScale = fitScale() * ZOOMS[zoomIndex];
    zoomAnchor = { wx, wz, ax, ay };
    setText(zoomLabel, `×${ZOOMS[zoomIndex].toFixed(1).replace('.0', '').replace('.', ',')}`);
    dirty = true;
  }
  let zoomAnchor = null;

  function centreOnPlayer() {
    cx = g.hero.x;
    cz = g.hero.z;
    clampCentre();
    dirty = true;
  }

  stage.addEventListener('wheel', event => {
    event.preventDefault();
    const rect = stage.getBoundingClientRect();
    zoomBy(event.deltaY < 0 ? 1 : -1, event.clientX - rect.left, event.clientY - rect.top);
  }, { passive: false });
  stage.addEventListener('mousedown', event => {
    if (event.button !== 0 || within(event.target, '.map-controls')) return;
    drag = { x: event.clientX, y: event.clientY, cx, cz, moved: false };
    stage.classList.add('dragging');
  });
  window.addEventListener('mousemove', event => {
    if (!drag) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
    cx = drag.cx - dx / scale;
    cz = drag.cz - dy / scale;
    clampCentre();
    dirty = true;
  });
  window.addEventListener('mouseup', event => {
    if (!drag) return;
    const wasClick = !drag.moved;
    drag = null;
    stage.classList.remove('dragging');
    if (!wasClick || within(event.target, '.map-marker') || within(event.target, '.map-controls')) return;
    const rect = stage.getBoundingClientRect();
    const wx = cx + (event.clientX - rect.left - width / 2) / scale;
    const wz = cz + (event.clientY - rect.top - height / 2) / scale;
    if (Math.abs(wx) > HALF || Math.abs(wz) > HALF || !isExploredAt(wx, wz)) {
      select(null);
      return;
    }
    const region = regionAt(wx, wz);
    select({ kind: 'region', id: `region:${region.id}`, x: region.x, z: region.z, icon: 'map', name: region.name, ref: region });
  });

  // ───────────── drawing ─────────────
  function drawVectors() {
    const px = 1 / scale;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(52, 84, 98, 0.9)';
    ctx.lineWidth = Math.max(vectors.riverWidth, 3.4 * px);
    ctx.stroke(vectors.river);
    ctx.strokeStyle = 'rgba(134, 170, 172, 0.85)';
    ctx.lineWidth = Math.max(vectors.riverWidth * 0.45, 1.3 * px);
    ctx.stroke(vectors.river);

    ctx.strokeStyle = 'rgba(58, 40, 22, 0.75)';
    ctx.lineWidth = 1.5 * px;
    ctx.setLineDash([5 * px, 4 * px]);
    ctx.stroke(vectors.sides);
    ctx.setLineDash([]);
    ctx.strokeStyle = 'rgba(46, 30, 16, 0.85)';
    ctx.lineWidth = 4.2 * px;
    ctx.stroke(vectors.legs);
    ctx.strokeStyle = '#ecd9a6';
    ctx.lineWidth = 1.9 * px;
    ctx.stroke(vectors.legs);

    ctx.strokeStyle = '#2c1d10';
    ctx.lineWidth = 1.4 * px;
    for (const bridge of vectors.bridges) {
      const along = Math.max(bridge.length / 2, 5 * px);
      const across = 4.5 * px;
      ctx.save();
      ctx.translate(bridge.x, bridge.z);
      ctx.rotate(-bridge.yaw + Math.PI / 2);
      ctx.beginPath();
      ctx.moveTo(-along - 2 * px, -across - 2 * px);
      ctx.lineTo(-along, -across);
      ctx.lineTo(along, -across);
      ctx.lineTo(along + 2 * px, -across - 2 * px);
      ctx.moveTo(-along - 2 * px, across + 2 * px);
      ctx.lineTo(-along, across);
      ctx.lineTo(along, across);
      ctx.lineTo(along + 2 * px, across + 2 * px);
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawRegionNames() {
    const size = Math.max(11, Math.min(22, 9 + scale * 30));
    ctx.font = `600 ${size}px Cormorant, serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if ('letterSpacing' in ctx) ctx.letterSpacing = `${(size * 0.22).toFixed(1)}px`;
    const placed = [];
    // keep clear of marker glyphs and city captions
    for (const m of markers) {
      const mx = width / 2 + (m.x - cx) * scale;
      const my = height / 2 + (m.z - cz) * scale;
      if (m.kind === 'city') placed.push([mx - 96, my - 24, mx + 96, my + 46]);
      else placed.push([mx - 15, my - 15, mx + 15, my + 15]);
    }
    const collides = box => placed.some(p => box[0] < p[2] && box[2] > p[0] && box[1] < p[3] && box[3] > p[1]);
    for (const region of REGIONS) {
      const seen = isExploredAt(region.x, region.z) || isExploredAt(region.x + 130, region.z) || isExploredAt(region.x - 130, region.z)
        || isExploredAt(region.x, region.z + 130) || isExploredAt(region.x, region.z - 130);
      if (!seen || CITIES.some(c => Math.hypot(c.x - region.x, c.z - region.z) < c.radius + 80)) continue;
      const x = width / 2 + (region.x - cx) * scale;
      const baseY = height / 2 + (region.z - cz) * scale;
      if (x < -200 || x > width + 200 || baseY < -40 || baseY > height + 40) continue;
      const text = region.name.toUpperCase();
      const half = ctx.measureText(text).width / 2 + 6;
      let y = null;
      for (const shift of [0, 1.7, -1.7, 3.2, -3.2]) {
        const candidate = baseY + shift * size;
        if (!collides([x - half, candidate - size * 0.7, x + half, candidate + size * 0.7])) {
          y = candidate;
          break;
        }
      }
      if (y === null) continue;
      placed.push([x - half, y - size * 0.7, x + half, y + size * 0.7]);
      ctx.strokeStyle = 'rgba(240, 226, 188, 0.38)';
      ctx.lineWidth = 2.5;
      ctx.strokeText(text, x, y);
      ctx.fillStyle = 'rgba(40, 26, 12, 0.92)';
      ctx.fillText(text, x, y);
    }
    if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
  }

  function draw() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#100e0b';
    ctx.fillRect(0, 0, width, height);
    ctx.save();
    ctx.translate(width / 2 - cx * scale, height / 2 - cz * scale);
    ctx.scale(scale, scale);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap.canvas, -HALF, -HALF, HALF * 2, HALF * 2);
    drawVectors();
    ctx.drawImage(fog, -HALF, -HALF, HALF * 2, HALF * 2);
    ctx.strokeStyle = 'rgba(200, 164, 90, 0.5)';
    ctx.lineWidth = 1.5 / scale;
    ctx.strokeRect(-HALF, -HALF, HALF * 2, HALF * 2);
    ctx.restore();
    drawRegionNames();

    for (const m of markers) {
      const x = width / 2 + (m.x - cx) * scale;
      const y = height / 2 + (m.z - cz) * scale;
      const visible = x > -20 && x < width + 20 && y > -20 && y < height + 20;
      if (m.node.hidden === visible) m.node.hidden = !visible;
      if (visible) m.node.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0)`;
    }
    markerLayer.dataset.zoom = String(zoomIndex);
  }

  bitmap.onProgress((value, done) => {
    ring.set(value, `${Math.round(value * 100)}%`);
    progress.classList.toggle('done', done);
    dirty = true;
  });
  on('map:revealed', () => {
    if (isOpen) rebuildFog();
  });
  on('world:discovered', () => {
    if (isOpen) rebuildMarkers();
  });

  let redrawIn = 0;

  return {
    el: view,
    hints: () => [
      { key: 'ЛКМ', label: 'Двигать карту' },
      { key: 'Колесо', label: 'Масштаб' },
      { key: 'Пробел', label: 'К герою', onClick: centreOnPlayer },
      { key: '2×ЛКМ', label: 'Метка на компасе' },
    ],
    onOpen(params) {
      isOpen = true;
      bitmap.start();
      progress.classList.toggle('done', bitmap.done);
      ring.set(bitmap.progress, `${Math.round(bitmap.progress * 100)}%`);
      resize();
      rebuildFog();
      rebuildMarkers();
      if (params && params.focus) {
        const target = markers.find(m => m.id === params.focus);
        if (target) {
          cx = target.x;
          cz = target.z;
          select(target);
        }
      } else if (firstOpen || zoomIndex > 0) centreOnPlayer();
      firstOpen = false;
      setText(zoomLabel, `×${ZOOMS[zoomIndex].toFixed(1).replace('.0', '').replace('.', ',')}`);
      renderSide();
      requestAnimationFrame(resize);
    },
    onClose() {
      isOpen = false;
      drag = null;
    },
    onKey(event) {
      const step = 140 / scale;
      switch (event.code) {
        case 'Equal': case 'NumpadAdd': zoomBy(1); return true;
        case 'Minus': case 'NumpadSubtract': zoomBy(-1); return true;
        case 'Space': centreOnPlayer(); return true;
        case 'ArrowLeft': case 'KeyA': cx -= step; break;
        case 'ArrowRight': case 'KeyD': cx += step; break;
        case 'ArrowUp': case 'KeyW': cz -= step; break;
        case 'ArrowDown': case 'KeyS': cz += step; break;
        default: return false;
      }
      clampCentre();
      dirty = true;
      return true;
    },
    update(dt) {
      if (!width) return;
      if (Math.abs(targetScale - scale) > targetScale * 0.002) {
        scale += (targetScale - scale) * Math.min(1, dt * 16);
        if (zoomAnchor) {
          cx = zoomAnchor.wx - (zoomAnchor.ax - width / 2) / scale;
          cz = zoomAnchor.wz - (zoomAnchor.ay - height / 2) / scale;
        }
        clampCentre();
        dirty = true;
      } else if (scale !== targetScale) {
        scale = targetScale;
        zoomAnchor = null;
        clampCentre();
        dirty = true;
      }
      // the hero keeps moving under non-pausing conditions (and the caravan marker too)
      redrawIn -= dt;
      if (playerMarker && (playerMarker.x !== g.hero.x || playerMarker.z !== g.hero.z || redrawIn <= 0)) {
        redrawIn = 1;
        playerMarker.x = g.hero.x;
        playerMarker.z = g.hero.z;
        playerMarker.node.firstChild.style.transform = `rotate(${(180 - (g.hero.yaw || 0) * 180 / Math.PI).toFixed(1)}deg)`;
        dirty = true;
      }
      if (dirty) {
        dirty = false;
        draw();
      }
    },
  };
}
