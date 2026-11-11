// HUD: on-screen controls for touch devices (phone or tablet held in landscape).
//  - left part of the screen: a floating stick (walk when pushed a little, sprint at the rim)
//  - anywhere else: drag to turn the camera, pinch to zoom
//  - buttons on the right: attack (hold), dodge, jump, target, quick heal; menu in the top corner
// Everything goes through g.input (setStick / addLook / virtualPress), so the game code is unchanged.
import { on } from '../../core/events.js';
import { icon } from '../icons.js';
import { el } from '../kit.js';

const STICK_RADIUS = 58;        // px the knob may travel
const STICK_ZONE = 0.42;        // left share of the screen that starts the stick
const WALK_BELOW = 0.42;        // stick deflection under which the hero walks
const SPRINT_ABOVE = 0.94;

/** Keep receiving this finger's events even when it slides off the element. */
function capture(node, e) {
  try { node.setPointerCapture(e.pointerId); } catch { /* pointer already gone */ }
}

export function createTouchControls(g, ui, layer) {
  const input = g.input;
  input.setTouchMode(true);
  g.cameraRig.touch = true;

  // —— stick + look surface ——
  const knob = el('i.touch-stick-knob');
  const base = el('div.touch-stick', null, [knob]);
  const surface = el('div.touch-surface.interactive', null, [base]);
  layer.prepend(surface);

  let stickId = null, stickOx = 0, stickOy = 0;
  const looks = new Map();       // pointerId -> {x, y}
  let pinch = 0;

  function setStick(dx, dy) {
    const len = Math.hypot(dx, dy);
    const k = len > STICK_RADIUS ? STICK_RADIUS / len : 1;
    const kx = dx * k, ky = dy * k;
    knob.style.transform = `translate(${kx}px, ${ky}px)`;
    const mag = Math.min(1, len / STICK_RADIUS);
    // screen right = strafe right; screen up = forward
    input.setStick(mag < 0.12 ? 0 : kx / STICK_RADIUS, mag < 0.12 ? 0 : -ky / STICK_RADIUS);
    if (mag > 0.12 && mag < WALK_BELOW) input.virtualPress('walk'); else input.virtualRelease('walk');
    if (mag > SPRINT_ABOVE) input.virtualPress('sprint'); else input.virtualRelease('sprint');
    base.classList.toggle('sprint', mag > SPRINT_ABOVE);
  }
  function endStick() {
    stickId = null;
    base.classList.remove('show', 'sprint');
    knob.style.transform = '';
    input.setStick(0, 0);
    input.virtualRelease('walk');
    input.virtualRelease('sprint');
  }

  surface.addEventListener('pointerdown', e => {
    e.preventDefault();
    capture(surface, e);
    if (stickId === null && e.clientX < window.innerWidth * STICK_ZONE) {
      stickId = e.pointerId; stickOx = e.clientX; stickOy = e.clientY;
      base.style.left = stickOx + 'px'; base.style.top = stickOy + 'px';
      base.classList.add('show');
      return;
    }
    looks.set(e.pointerId, { x: e.clientX, y: e.clientY });
    pinch = 0;
  });
  surface.addEventListener('pointermove', e => {
    if (e.pointerId === stickId) { setStick(e.clientX - stickOx, e.clientY - stickOy); return; }
    const p = looks.get(e.pointerId);
    if (!p) return;
    if (looks.size >= 2) {
      // pinch: distance between the first two look fingers controls the camera distance
      p.x = e.clientX; p.y = e.clientY;
      const [a, b] = [...looks.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch) {
        const delta = pinch - d;
        if (Math.abs(delta) > 22) { input.addZoom(Math.sign(delta)); pinch = d; }
      } else pinch = d;
      return;
    }
    input.addLook(e.clientX - p.x, e.clientY - p.y);
    p.x = e.clientX; p.y = e.clientY;
  });
  const up = e => {
    if (e.pointerId === stickId) endStick();
    looks.delete(e.pointerId);
    pinch = 0;
  };
  surface.addEventListener('pointerup', up);
  surface.addEventListener('pointercancel', up);
  surface.addEventListener('contextmenu', e => e.preventDefault());

  // —— action buttons ——
  function holdButton(cls, iconKey, action, label) {
    const node = el(`div.touch-btn.tb-${cls}.interactive`, { attrs: { 'aria-label': label } }, [icon(iconKey)]);
    const press = e => { e.preventDefault(); capture(node, e); node.classList.add('down'); input.virtualPress(action); };
    const release = () => { node.classList.remove('down'); input.virtualRelease(action); };
    node.addEventListener('pointerdown', press);
    node.addEventListener('pointerup', release);
    node.addEventListener('pointercancel', release);
    node.addEventListener('contextmenu', e => e.preventDefault());
    return node;
  }
  const mount = holdButton('mount', 'wagon', 'mount', 'Лошадь');
  const pad = el('div.touch-pad', null, [
    holdButton('attack', 'sword', 'attack', 'Атака'),
    holdButton('dodge', 'dash', 'dodge', 'Перекат'),
    holdButton('jump', 'arrow-up', 'jump', 'Прыжок'),
    holdButton('target', 'target', 'target', 'Цель'),
    holdButton('heal', 'heart', 'quickHeal', 'Лечение'),
    mount,
  ]);
  const menu = el('div.touch-btn.tb-menu.interactive', { attrs: { 'aria-label': 'Меню' } }, [icon('system')]);
  menu.addEventListener('pointerup', e => { e.preventDefault(); ui.open('inventory'); });
  layer.append(pad, menu);

  // releasing everything when gameplay stops (menu opened, death)
  function reset() {
    endStick();
    looks.clear();
    for (const a of ['attack', 'dodge', 'jump', 'target', 'quickHeal', 'mount']) input.virtualRelease(a);
  }
  on('hero:died', reset);
  on('ui:open', reset);

  // go full screen and lock landscape when a game starts (must run inside the tap that started it)
  on('game:loading', () => {
    try {
      const p = document.documentElement.requestFullscreen?.({ navigationUI: 'hide' });
      if (p && p.catch) p.catch(() => {});
      const lock = screen.orientation?.lock?.('landscape');
      if (lock && lock.catch) lock.catch(() => {});
    } catch { /* not supported — the game still works in the browser chrome */ }
  });
  // browsers start audio only from a gesture
  const unlock = () => { g.audio?.unlock?.(); };
  window.addEventListener('pointerup', unlock, { passive: true });

  let hadHorse = null;
  function update() {
    const horse = !!g.state?.world?.horse;
    if (horse !== hadHorse) { hadHorse = horse; mount.style.display = horse ? '' : 'none'; }
    if (g.paused && (stickId !== null || looks.size)) reset();
  }
  return { update };
}
