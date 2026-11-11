// HUD: compass ribbon with sliding markers, zone caption, clock/weather and coin purse.
// Consumes: g.cameraRig.yaw, g.hero.{x,z}, g.markers(), g.zone, g.state.time, g.state.player.coins, ui.trackedMarker.
import { on } from '../../core/events.js';
import { icon, setIcon } from '../icons.js';
import { el, setText, setClass, formatNumber } from '../kit.js';
import { markerIcon, formatDistance } from '../markers.js';

const FOV = 150;                 // degrees visible across the ribbon
const DEG = 180 / Math.PI;
const MARKER_REFRESH = 0.25;     // seconds between g.markers() polls
const POI_RANGE = 900;           // undirected POIs farther than this are not shown
const MAX_MARKERS = 24;
const WEATHER_ICONS = { clear: 'sun', cloudy: 'cloud', rain: 'rain', fog: 'fog', storm: 'storm' };

const wrap180 = deg => ((deg + 180) % 360 + 360) % 360 - 180;

function buildStrip() {
  const strip = el('div.compass-strip');
  const letters = { 0: 'Ю', 90: 'З', 180: 'С', 270: 'В' };
  for (let deg = -180; deg < 540; deg += 15) {
    const norm = ((deg % 360) + 360) % 360;
    const left = `${((deg + 180) / 720) * 100}%`;
    if (letters[norm]) strip.append(el('span.compass-letter', { class: norm === 180 ? 'north' : '', text: letters[norm], style: { left } }));
    else strip.append(el('i.compass-tick', { class: norm % 45 === 0 ? 'mid' : '', style: { left } }));
  }
  return strip;
}

export function createCompass(g, ui, layer) {
  const strip = buildStrip();
  const markerBox = el('div.compass-markers');
  const windowEl = el('div.compass-window', null, [strip, markerBox]);
  const focusName = el('span.compass-focus-name');
  const focusDist = el('span.compass-focus-dist.t-num');
  const focus = el('div.compass-focus', null, [focusName, focusDist]);
  const zone = el('div.compass-zone');
  const clockIcon = icon('sun');
  const clockText = el('span.t-num');
  const clock = el('div.hud-clock', null, [clockIcon, clockText]);
  const purseText = el('span.t-num');
  const purse = el('div.hud-purse', null, [el('i.kit-coin'), purseText]);
  const ribbon = el('div.compass', null, [
    el('i.compass-cap.left'), windowEl, el('i.compass-cap.right'), el('i.compass-needle'),
  ]);
  const rootEl = el('div.hud-top', null, [
    el('div.compass-row', null, [clock, ribbon, purse]),
    focus,
    zone,
  ]);
  layer.append(rootEl);

  let width = 0;
  const measure = () => {
    width = windowEl.clientWidth;
  };
  new ResizeObserver(measure).observe(windowEl);

  /** Pooled marker nodes. */
  const pool = [];
  let shown = [];
  let refreshIn = 0;
  let slowIn = 0;
  let lastStripX = NaN;
  let zoneName = '';

  function nodeAt(index) {
    while (pool.length <= index) {
      const glyph = icon('diamond');
      const node = el('div.compass-marker', null, glyph);
      node.glyph = glyph;
      node.hidden = true;
      markerBox.append(node);
      pool.push(node);
    }
    return pool[index];
  }

  function refreshMarkers() {
    const hero = g.hero;
    const tracked = ui.trackedMarker;
    const list = g.markers() || [];
    shown = [];
    for (let i = 0; i < list.length; i++) {
      const m = list[i];
      const isTracked = m.id === tracked;
      if ((m.kind === 'city' || m.kind === 'poi') && !m.discovered && !isTracked) continue;
      const dist = Math.hypot(m.x - hero.x, m.z - hero.z);
      if (m.kind === 'poi' && dist > POI_RANGE && !isTracked) continue;
      shown.push({ id: m.id, kind: m.kind, x: m.x, z: m.z, label: m.label, icon: markerIcon(m), tracked: isTracked, dist });
    }
    shown.sort((a, b) => (b.tracked - a.tracked) || (a.dist - b.dist));
    if (shown.length > MAX_MARKERS) shown.length = MAX_MARKERS;
    for (let i = 0; i < pool.length || i < shown.length; i++) {
      const node = nodeAt(i);
      const m = shown[i];
      if (!m) {
        node.hidden = true;
        continue;
      }
      node.hidden = false;
      setIcon(node.glyph, m.icon);
      const cls = `compass-marker mk-${m.kind}${m.tracked ? ' tracked' : ''}`;
      if (node._cls !== cls) {
        node._cls = cls;
        node._c_edge = undefined;
        node.className = cls;
      }
    }
  }

  function updateSlow() {
    const state = g.state;
    if (state && state.time) {
      const hour = Math.floor(state.time.hour);
      const minutes = Math.floor((state.time.hour - hour) * 60);
      setText(clockText, `${String(hour).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`);
      const night = state.time.hour >= 21 || state.time.hour < 5;
      const weather = state.time.weather;
      setIcon(clockIcon, weather && weather !== 'clear' ? WEATHER_ICONS[weather] || 'cloud' : night ? 'moon' : 'sun');
    }
    if (state && state.player) setText(purseText, formatNumber(state.player.coins));
    const z = g.zone || {};
    const name = (z.city && z.city.name) || (z.poi && z.poi.name) || (z.region && z.region.name) || '';
    if (name !== zoneName) {
      zoneName = name;
      zone.classList.remove('show');
      void zone.offsetWidth;
      zone.textContent = name;
      zone.classList.add('show');
      setClass(zone, 'safe', !!z.safe);
    }
  }

  on('coins:changed', () => {
    slowIn = 0;
  });

  function update(dt) {
    if (!width) measure();
    const yawDeg = (g.cameraRig ? g.cameraRig.yaw : 0) * DEG;
    const pxPerDeg = width / FOV;
    // The strip shows screen-angle a = −bearing; its left edge is a = −180°.
    const centre = ((-yawDeg % 360) + 360) % 360;
    const stripX = Math.round((width / 2 - (centre + 180) * pxPerDeg) * 2) / 2;
    if (stripX !== lastStripX) {
      lastStripX = stripX;
      strip.style.transform = `translate3d(${stripX}px, 0, 0)`;
    }

    refreshIn -= dt;
    if (refreshIn <= 0) {
      refreshIn = MARKER_REFRESH;
      refreshMarkers();
    }
    slowIn -= dt;
    if (slowIn <= 0) {
      slowIn = 0.5;
      updateSlow();
    }

    const hero = g.hero;
    const limit = FOV / 2 - 5;
    let best = null;
    let bestAbs = 7;
    for (let i = 0; i < shown.length; i++) {
      const m = shown[i];
      const node = pool[i];
      const dx = m.x - hero.x;
      const dz = m.z - hero.z;
      m.dist = Math.hypot(dx, dz);
      const rel = wrap180(yawDeg - Math.atan2(dx, dz) * DEG);
      const clamped = rel < -limit ? -limit : rel > limit ? limit : rel;
      const x = Math.round(width / 2 + clamped * pxPerDeg);
      if (node._x !== x) {
        node._x = x;
        node.style.transform = `translate3d(${x}px, 0, 0)`;
      }
      setClass(node, 'edge', clamped !== rel);
      const abs = Math.abs(rel);
      if (abs < bestAbs) {
        bestAbs = abs;
        best = m;
      }
      if (m.tracked && !best) best = m;
    }
    if (best) {
      setText(focusName, best.label || '');
      setText(focusDist, formatDistance(best.dist));
    }
    setClass(focus, 'show', !!best);
  }

  return { update };
}
