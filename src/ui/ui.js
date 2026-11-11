// UI framework: layers, the screen manager (main menu with tabs), key hints, toasts and shared services.
// Contract: CLAUDE.md «Каркас UI». The UI reads `g`, listens to the bus and never mutates state directly.
//
// Registering a screen:
//   ui.registerScreen({
//     id: 'inventory', title: 'Инвентарь', action: 'inventory', tab: { order: 10, icon: 'inventory' },
//     create(g, ui) {
//       const view = el('div.my-screen');
//       return { el: view, onOpen(params) {}, onClose() {}, update(dt) {}, onKey(event) { return false; },
//                hints: () => [{ key: 'interact', label: 'Использовать', onClick: use }] };
//     },
//   });
import { on } from '../core/events.js';
import { icon } from './icons.js';
import { el, clear, setText, tooltip, confirmDialog, setKitContext, keyHint, coins } from './kit.js';
import { hasModal, dismissTopModal, acceptTopModal } from './kit-base.js';
import { createHud } from './hud/hud.js';
import { createTitle } from './screens/title.js';
import { registerSettingsScreen } from './screens/settings.js';
import { registerSystemScreen } from './screens/system.js';
import { registerMapScreen } from './screens/map.js';

const SCREEN_ACTIONS = new Set(['inventory', 'character', 'skills', 'journal', 'map', 'crafting', 'caravan']);
const DEFAULT_MENU_SCREEN = 'system';

const isTyping = event => {
  const t = event.target;
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
};

/**
 * Build the whole UI over `#ui`.
 * @param {object} g  engine object (or the mock from mock-game.js)
 * @param {{root?: HTMLElement, gameScreens?: boolean}} [opts]  `gameScreens: false` skips the optional screens/index.js
 * @returns {object} ui — see the method docs below
 */
export function createUI(g, opts = {}) {
  const root = opts.root || document.getElementById('ui');
  clear(root);

  // ───────────── layers ─────────────
  const hudLayer = el('div.hud-layer');
  const titleLayer = el('div.title-layer');
  const tabBar = el('div.menu-tabs');
  const headTitle = el('div.menu-headtitle');
  const menuTop = el('header.menu-top', null, [tabBar, headTitle]);
  const menuBody = el('div.menu-body');
  const hintBar = el('div.menu-hints');
  const purse = el('span.menu-purse');
  const clock = el('span.menu-clock');
  const menuBottom = el('footer.menu-bottom', null, [hintBar, el('div.menu-status', null, [clock, purse])]);
  const menu = el('div.menu.interactive', { hidden: true }, [el('div.menu-veil'), menuTop, menuBody, menuBottom]);
  const rawLayer = el('div.raw-layer');
  const overlayLayer = el('div.overlay-layer');
  const toastLayer = el('div.toast-layer');
  const kitLayer = el('div.kit-layer');
  root.append(hudLayer, titleLayer, menu, rawLayer, overlayLayer, toastLayer, kitLayer);
  setKitContext({ root: kitLayer, caption: action => g.input.caption(action) });

  // ───────────── state ─────────────
  const defs = new Map();
  const instances = new Map();
  /** Open screens, bottom → top: [{def, inst, params}] */
  const stack = [];
  const escapeHandlers = [];
  const phaseListeners = [];
  let phase = null;
  let pausedByUi = false;
  let extraHints = null;
  let hideTimer = 0;
  let statusTimer = 0;
  let trackedMarker = null;
  let questProvider = null;

  const ui = {
    g,
    root,
    layers: { hud: hudLayer, title: titleLayer, overlay: overlayLayer, toast: toastLayer, kit: kitLayer },
    tooltip,
    registerScreen,
    open,
    close,
    closeAll,
    toggle,
    isOpen,
    current: () => (stack.length ? stack[stack.length - 1].def.id : null),
    screens: () => [...defs.values()],
    /** Yes/No dialog → Promise<boolean>. `{title, text, yes, no, danger}` */
    confirm: confirmDialog,
    /** Show a toast: kind ∈ info | good | warn | bad. */
    toast: (text, kind = 'info') => ui.hud.toast(text, kind),
    setHints,
    refreshHints: renderHints,
    refreshTabs: renderTabs,
    /** Handler tried on Esc before screens close; return true to consume. Returns an unsubscribe function. */
    onEscape(fn) {
      escapeHandlers.push(fn);
      return () => {
        const index = escapeHandlers.indexOf(fn);
        if (index >= 0) escapeHandlers.splice(index, 1);
      };
    },
    /** Subscribe to phase changes: fn(phase, previous). */
    onPhase(fn) {
      phaseListeners.push(fn);
    },
    get phase() {
      return phase;
    },
    /** Quest tracker source: fn() → [{title, objectives: [{text, cur, need, done}]}] (or null to clear). */
    setQuestTrackerProvider(fn) {
      questProvider = fn || null;
    },
    get questTrackerProvider() {
      return questProvider;
    },
    /** Track a marker id on the compass and the map (null clears). */
    trackMarker(id) {
      trackedMarker = id || null;
    },
    get trackedMarker() {
      return trackedMarker;
    },
  };

  // ───────────── screen manager ─────────────

  /**
   * Register a screen.
   * @param {{id: string, title: string, action?: string, tab?: {order: number, icon: string, label?: string},
   *          pauses?: boolean, chrome?: boolean, when?: (g: object) => boolean,
   *          create: (g: object, ui: object) => {el: HTMLElement, onOpen?: Function, onClose?: Function, update?: Function, onKey?: Function, hints?: Array|Function}}} def
   *        `tab` puts the screen into the main menu; `pauses` (default true) stops the simulation while open;
   *        `chrome: false` mounts the element full-screen without the menu frame (dialogue-style overlays);
   *        `when(g)` — availability (default: only while playing or dead).
   */
  function registerScreen(def) {
    if (!def || !def.id || typeof def.create !== 'function') throw new Error('registerScreen: нужен id и create()');
    defs.set(def.id, def);
    instances.delete(def.id);
    renderTabs();
    return def;
  }

  const available = def => (def.when ? !!def.when(g) : phase === 'playing' || phase === 'dead');
  const menuTabs = () => [...defs.values()].filter(d => d.tab && available(d)).sort((a, b) => a.tab.order - b.tab.order);
  const top = () => stack[stack.length - 1] || null;

  function instanceOf(def) {
    let inst = instances.get(def.id);
    if (!inst) {
      inst = def.create(g, ui);
      inst.el.classList.add('screen', `screen-${def.id}`);
      instances.set(def.id, inst);
    }
    return inst;
  }

  function mount(entry, animate) {
    const { def, inst } = entry;
    const withChrome = def.chrome !== false;
    clearTimeout(hideTimer);
    if (withChrome) {
      if (inst.el.parentNode !== menuBody) clear(menuBody, inst.el);
      clear(rawLayer);
      menu.hidden = false;
      menu.classList.remove('closing');
      menu.classList.toggle('tabbed', !!def.tab);
      setText(headTitle, def.title || '');
    } else {
      menu.hidden = true;
      clear(rawLayer, inst.el);
    }
    if (animate) {
      inst.el.classList.remove('screen-in');
      void inst.el.offsetWidth;
      inst.el.classList.add('screen-in');
    }
    renderTabs();
    renderHints();
    renderStatus();
  }

  function unmountAll() {
    clear(rawLayer);
    if (!menu.hidden) {
      menu.classList.add('closing');
      hideTimer = setTimeout(() => {
        menu.hidden = true;
        menu.classList.remove('closing');
        clear(menuBody);
      }, 150);
    }
  }

  function syncPause() {
    const want = stack.some(entry => entry.def.pauses !== false);
    root.dataset.menu = want ? '1' : '';
    root.dataset.screen = top() ? top().def.id : '';
    const canPause = phase === 'playing' || phase === 'dead';
    if (want !== pausedByUi && (canPause || !want)) {
      pausedByUi = want;
      if (canPause) g.setPaused(want);
    }
  }

  function leave(entry) {
    try {
      if (entry.inst.onClose) entry.inst.onClose();
    } catch (error) {
      console.error(`[ui] onClose(${entry.def.id})`, error);
    }
  }

  /** Open a screen (switches tab when a tab screen is already on top). Returns true when opened. */
  function open(id, params) {
    const def = defs.get(id);
    if (!def || !available(def)) return false;
    tooltip.hide();
    extraHints = null;
    const current = top();
    if (current && current.def.id === id) {
      current.params = params;
      if (current.inst.onOpen) current.inst.onOpen(params);
      renderHints();
      return true;
    }
    const entry = { def, inst: instanceOf(def), params };
    const fresh = stack.length === 0;
    if (current && current.def.tab && def.tab) {
      leave(stack.pop());
    }
    stack.push(entry);
    menu.classList.toggle('fresh', fresh);
    mount(entry, true);
    syncPause();
    try {
      if (entry.inst.onOpen) entry.inst.onOpen(params);
    } catch (error) {
      console.error(`[ui] onOpen(${id})`, error);
    }
    renderHints();
    return true;
  }

  /** Close the top screen (the one below it, if any, comes back). */
  function close() {
    const entry = stack.pop();
    if (!entry) return;
    tooltip.hide();
    extraHints = null;
    leave(entry);
    const next = top();
    if (next) mount(next, true);
    else unmountAll();
    syncPause();
  }

  function closeAll() {
    while (stack.length) leave(stack.pop());
    extraHints = null;
    tooltip.hide();
    unmountAll();
    syncPause();
  }

  function toggle(id, params) {
    if (isOpen(id)) close();
    else open(id, params);
  }

  /** isOpen() — any screen is open; isOpen(id) — that screen is the visible one. */
  function isOpen(id) {
    if (id === undefined) return stack.length > 0;
    return !!top() && top().def.id === id;
  }

  function stepTab(dir) {
    const current = top();
    if (!current || !current.def.tab) return;
    const tabs = menuTabs();
    const index = tabs.indexOf(current.def);
    const next = tabs[(index + dir + tabs.length) % tabs.length];
    if (next && next !== current.def) open(next.id);
  }

  // ───────────── chrome: tabs, hints, status ─────────────

  function renderTabs() {
    const current = top();
    const tabs = menuTabs();
    clear(tabBar);
    if (!current || !current.def.tab) return;
    if (tabs.length > 1) tabBar.append(keyHint('Q'));
    for (const def of tabs) {
      const node = el('button.menu-tab', { type: 'button', class: def === current.def ? 'active' : '', onClick: () => open(def.id) }, [
        icon(def.tab.icon),
        el('span', { text: def.tab.label || def.title }),
      ]);
      if (def.action) tooltip.attach(node, `${def.title} — ${g.input.caption(def.action)}`);
      tabBar.append(node);
    }
    if (tabs.length > 1) tabBar.append(keyHint('E'));
  }

  /**
   * Contextual key hints of the current screen (bottom bar). Each: {key, label, onClick?} where `key`
   * is an input action or a literal caption. The frame always adds «Esc — Закрыть».
   */
  function setHints(hints) {
    extraHints = hints || null;
    renderHints();
  }

  function renderHints() {
    const current = top();
    clear(hintBar);
    if (!current) return;
    let list = extraHints;
    if (!list) {
      const own = current.inst.hints;
      list = typeof own === 'function' ? own() : own;
    }
    for (const hint of list || []) hintBar.append(keyHint(hint.key, hint.label, { onClick: hint.onClick }));
    hintBar.append(keyHint('Esc', stack.length > 1 ? 'Назад' : 'Закрыть', { onClick: close }));
  }

  function renderStatus() {
    const state = g.state;
    if (!state || phase === 'title') {
      clear(purse);
      clear(clock);
      return;
    }
    if (state.player) clear(purse, coins(state.player.coins));
    if (state.time) {
      const hour = Math.floor(state.time.hour);
      const minutes = Math.floor((state.time.hour - hour) * 60);
      setText(clock, `День ${state.time.day} · ${String(hour).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`);
    }
  }

  // ───────────── input ─────────────

  function escape() {
    if (dismissTopModal()) return;
    for (let i = escapeHandlers.length - 1; i >= 0; i--) {
      if (escapeHandlers[i]()) return;
    }
    if (stack.length) {
      close();
      return;
    }
    if (phase === 'playing' || phase === 'dead') {
      if (!open(DEFAULT_MENU_SCREEN)) {
        const first = menuTabs()[0];
        if (first) open(first.id);
      }
    }
  }

  g.input.onAction((action, pressed) => {
    if (!pressed) return;
    if (action === 'menu') {
      escape();
      return;
    }
    if (action === 'hideHud') {
      ui.hud.setHidden(!ui.hud.hidden);
      return;
    }
    if (!SCREEN_ACTIONS.has(action) || hasModal() || phase !== 'playing') return;
    const def = [...defs.values()].find(d => d.action === action);
    if (!def) return;
    const current = top();
    if (current && current.def.chrome === false && current.def !== def) return;
    toggle(def.id);
  });

  window.addEventListener('keydown', event => {
    if (hasModal()) {
      if ((event.code === 'Enter' || event.code === 'NumpadEnter') && !isTyping(event) && acceptTopModal()) event.preventDefault();
      return;
    }
    const current = top();
    if (!current) return;
    if (current.inst.onKey && current.inst.onKey(event)) {
      event.preventDefault();
      return;
    }
    if (isTyping(event) || !current.def.tab || event.ctrlKey || event.altKey) return;
    if (event.code === 'KeyQ') stepTab(-1);
    else if (event.code === 'KeyE') stepTab(1);
    else if (event.code === 'ArrowLeft' && !event.defaultPrevented) stepTab(-1);
    else if (event.code === 'ArrowRight' && !event.defaultPrevented) stepTab(1);
  });
  root.addEventListener('contextmenu', event => event.preventDefault());

  // ───────────── bus ─────────────

  on('ui:open', payload => {
    if (payload && payload.screen) open(payload.screen, payload.params);
  });
  on('ui:close', () => close());
  on('coins:changed', () => {
    if (stack.length) renderStatus();
  });
  on('hero:died', () => closeAll());
  on('game:loading', () => closeAll());
  on('settings:changed', applySettings);

  function applySettings() {
    const scale = Number(g.settings && g.settings.hudScale) || 1;
    root.style.setProperty('--hud-scale', String(Math.max(0.7, Math.min(1.4, scale))));
  }

  function setPhase(next) {
    const previous = phase;
    phase = next;
    root.dataset.phase = next;
    if (next === 'title' || next === 'loading') {
      if (stack.length && next === 'loading') closeAll();
      pausedByUi = false;
    }
    renderTabs();
    for (const fn of phaseListeners) fn(next, previous);
  }

  on('frame', dt => {
    if (g.phase !== phase) setPhase(g.phase);
    const current = top();
    if (current) {
      if (current.inst.update) {
        try {
          current.inst.update(dt);
        } catch (error) {
          if (!current.failed) console.error(`[ui] update(${current.def.id})`, error);
          current.failed = true;
        }
      }
      statusTimer -= dt;
      if (statusTimer <= 0) {
        statusTimer = 1;
        renderStatus();
      }
    }
  });

  // ───────────── assemble ─────────────

  applySettings();
  ui.hud = createHud(g, ui);
  ui.title = createTitle(g, ui);
  registerSettingsScreen(ui, g);
  registerSystemScreen(ui, g);
  registerMapScreen(ui, g);
  setPhase(g.phase || 'title');

  /** Resolves when the optional gameplay screens (src/ui/screens/index.js) have been registered. */
  const optional = opts.gameScreens === false ? Promise.resolve({}) : import('./screens/index.js');
  ui.ready = optional
    .then(module => {
      if (typeof module.registerGameScreens === 'function') module.registerGameScreens(ui, g);
    })
    .catch(() => { /* gameplay screens are optional */ })
    .then(() => ui);

  return ui;
}
