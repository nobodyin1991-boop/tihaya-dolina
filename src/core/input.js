// Keyboard / mouse input with pointer lock. One instance for the whole game.
// Gameplay reads continuous state (isDown, consumeLook) and subscribes to discrete actions (onAction).

/** Default bindings: action -> list of KeyboardEvent.code (or 'Mouse0'..'Mouse2'). */
export const DEFAULT_BINDINGS = {
  forward: ['KeyW', 'ArrowUp'], back: ['KeyS', 'ArrowDown'], left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'],
  jump: ['Space'], sprint: ['ShiftLeft', 'ShiftRight'], walk: ['CapsLock'], dodge: ['Mouse2', 'ControlLeft'],
  attack: ['Mouse0'], target: ['Tab'], interact: ['KeyE'], quickHeal: ['KeyQ'], mount: ['KeyH'], cursor: ['AltLeft'],
  ability1: ['Digit1'], ability2: ['Digit2'], ability3: ['Digit3'], ability4: ['Digit4'], ability5: ['Digit5'],
  quick1: ['Digit6'], quick2: ['Digit7'], quick3: ['Digit8'], quick4: ['Digit9'],
  inventory: ['KeyI'], character: ['KeyC'], skills: ['KeyK'], journal: ['KeyJ'], map: ['KeyM'], crafting: ['KeyP'],
  caravan: ['KeyL'], menu: ['Escape'], hideHud: ['F9'], debug: ['F3'],
};

/** Human-readable key caption for UI hints. */
export function keyCaption(code) {
  if (!code) return '';
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  const map = { Mouse0: 'ЛКМ', Mouse1: 'СКМ', Mouse2: 'ПКМ', Space: 'Пробел', ShiftLeft: 'Shift', ShiftRight: 'Shift', ControlLeft: 'Ctrl', AltLeft: 'Alt', Escape: 'Esc', Tab: 'Tab', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', CapsLock: 'Caps' };
  return map[code] || code;
}

export function createInput(canvas, bindings = DEFAULT_BINDINGS) {
  const down = new Set();
  const codeToActions = new Map();
  for (const [action, codes] of Object.entries(bindings)) for (const c of codes) {
    if (!codeToActions.has(c)) codeToActions.set(c, []);
    codeToActions.get(c).push(action);
  }
  const handlers = new Set();
  let lookX = 0, lookY = 0, wheel = 0;
  let enabled = false;        // gameplay input enabled (false while a UI screen is open)
  let wantLock = false;
  let touchMode = false;      // on-screen controls drive the game: no pointer lock, mouse events ignored
  let stickX = 0, stickZ = 0; // virtual stick, -1..1 (x = strafe right, z = forward)

  const fire = (action, pressed) => { for (const h of handlers) h(action, pressed); };
  const locked = () => document.pointerLockElement === canvas;

  function press(code, e) {
    const actions = codeToActions.get(code);
    if (!actions) return;
    // UI-level actions always fire; gameplay actions only when enabled
    for (const a of actions) {
      const ui = UI_ACTIONS.has(a);
      if (!ui && !enabled) continue;
      if (e && (ui || enabled)) e.preventDefault();
      if (!down.has(a)) { down.add(a); fire(a, true); }
    }
  }
  function release(code) {
    const actions = codeToActions.get(code);
    if (!actions) return;
    for (const a of actions) if (down.delete(a)) fire(a, false);
  }

  const typing = e => { const t = e.target; return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable); };

  window.addEventListener('keydown', e => {
    if (typing(e)) { if (e.code === 'Escape') press('Escape', e); return; }
    if (e.repeat) { if (codeToActions.has(e.code) && enabled) e.preventDefault(); return; }
    press(e.code, e);
  });
  window.addEventListener('keyup', e => release(e.code));
  window.addEventListener('blur', () => { for (const a of [...down]) { down.delete(a); fire(a, false); } });

  canvas.addEventListener('mousedown', e => {
    if (!enabled || touchMode) return;
    if (!locked() && wantLock) { requestLock(); }
    press('Mouse' + e.button, e);
  });
  window.addEventListener('mouseup', e => { if (!touchMode) release('Mouse' + e.button); });
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  window.addEventListener('mousemove', e => {
    if (!enabled || touchMode) return;
    if (locked() || (e.buttons & 2)) {
      // ignore absurd deltas some drivers produce on lock/unlock
      if (Math.abs(e.movementX) < 400 && Math.abs(e.movementY) < 400) { lookX += e.movementX; lookY += e.movementY; }
    }
  });
  canvas.addEventListener('wheel', e => { if (enabled) { wheel += Math.sign(e.deltaY); e.preventDefault(); } }, { passive: false });

  function requestLock() {
    if (touchMode) return;
    try { const p = canvas.requestPointerLock?.(); if (p && p.catch) p.catch(() => {}); } catch { /* ignore */ }
  }
  document.addEventListener('pointerlockchange', () => { for (const h of handlers) h('pointerlock', locked()); });

  return {
    /** Subscribe to discrete actions: fn(action, pressed). Returns unsubscribe. */
    onAction(fn) { handlers.add(fn); return () => handlers.delete(fn); },
    isDown: action => down.has(action),
    /** Accumulated mouse look since last call: {x, y} in pixels. */
    consumeLook() { const r = { x: lookX, y: lookY }; lookX = lookY = 0; return r; },
    consumeWheel() { const w = wheel; wheel = 0; return w; },
    /** Enable gameplay input and capture the mouse; disable to hand the cursor to the UI. */
    setGameplay(on) {
      enabled = on; wantLock = on;
      if (on) requestLock();
      else {
        if (locked()) document.exitPointerLock();
        for (const a of [...down]) if (!UI_ACTIONS.has(a)) { down.delete(a); fire(a, false); }
        lookX = lookY = wheel = 0;
        stickX = stickZ = 0;
      }
    },
    /** Temporarily free the cursor without disabling gameplay (Alt held). */
    setCursorFree(free) { wantLock = enabled && !free; if (free) { if (locked()) document.exitPointerLock(); } else if (enabled) requestLock(); },
    get gameplay() { return enabled; },
    get locked() { return locked(); },
    caption: action => (touchMode ? '' : keyCaption((bindings[action] || [])[0])),

    // —— on-screen (touch) controls ——
    /** Switch to touch mode: the on-screen controls below replace mouse and pointer lock. */
    setTouchMode(on) { touchMode = !!on; if (touchMode && locked()) document.exitPointerLock(); },
    get touchMode() { return touchMode; },
    /** Virtual stick position, each axis -1..1. */
    setStick(x, z) { stickX = enabled ? x : 0; stickZ = enabled ? z : 0; },
    /** Movement axes from keys or the virtual stick: {x: strafe right, z: forward}, each -1..1. */
    moveAxis(out) {
      out.x = stickX || ((down.has('right') ? 1 : 0) - (down.has('left') ? 1 : 0));
      out.z = stickZ || ((down.has('forward') ? 1 : 0) - (down.has('back') ? 1 : 0));
      return out;
    },
    /** Camera drag in pixels and zoom steps coming from touch gestures. */
    addLook(dx, dy) { if (enabled) { lookX += dx; lookY += dy; } },
    addZoom(steps) { if (enabled) wheel += steps; },
    /** Press/release an action from an on-screen button (same rules as a key). */
    virtualPress(action) {
      if (!UI_ACTIONS.has(action) && !enabled) return;
      if (!down.has(action)) { down.add(action); fire(action, true); }
    },
    virtualRelease(action) { if (down.delete(action)) fire(action, false); },
  };
}

/** Actions that must work even while a screen is open (to toggle screens). */
const UI_ACTIONS = new Set(['menu', 'inventory', 'character', 'skills', 'journal', 'map', 'crafting', 'caravan', 'hideHud', 'debug']);
