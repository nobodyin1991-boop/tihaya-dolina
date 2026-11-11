// HUD assembly. Every part updates on the engine's `frame` event (no own rAF), writes to the DOM only
// when a value changed and moves things with transforms. The HUD is skipped while a pausing screen is
// open, outside of gameplay phases, and when hidden with F9.
import { on } from '../../core/events.js';
import { createCompass } from './compass.js';
import { createVitals } from './vitals.js';
import { createHotbar } from './hotbar.js';
import { createTarget } from './target.js';
import { createLabels } from './labels.js';
import { createPrompt } from './prompt.js';
import { createTrackers } from './trackers.js';
import { createFeed } from './feed.js';
import { createOverlays } from './overlays.js';
import { createTouchControls } from './touch.js';
import { isTouch } from '../device.js';

export function createHud(g, ui) {
  const layer = ui.layers.hud;
  const labels = createLabels(g, ui, layer);
  const compass = createCompass(g, ui, layer);
  const target = createTarget(g, ui, layer);
  const vitals = createVitals(g, ui, layer);
  const hotbar = createHotbar(g, ui, layer, vitals.badge);
  const prompt = createPrompt(g, ui, layer);
  const trackers = createTrackers(g, ui, layer);
  const feed = createFeed(g, ui, layer);
  const overlays = createOverlays(g, ui, layer);
  const touch = isTouch() ? createTouchControls(g, ui, layer) : null;

  const hud = {
    hidden: false,
    /** F9: hide the whole HUD (toasts and system overlays stay). */
    setHidden(hidden) {
      hud.hidden = !!hidden;
      ui.root.dataset.hud = hud.hidden ? 'off' : '';
    },
    toast: feed.toast,
    log: feed.log,
    showBanner: overlays.showBanner,
  };

  /** One broken contract field must not take the whole HUD down: each part fails on its own, logged once. */
  const reported = new Set();
  function run(name, part, dt, extra) {
    try {
      part.update(dt, extra);
    } catch (error) {
      if (reported.has(name)) return;
      reported.add(name);
      console.error(`[hud] ${name}`, error);
    }
  }

  on('frame', dt => {
    run('feed', feed, dt);
    const phase = g.phase;
    const live = (phase === 'playing' || phase === 'dead') && !!g.hero;
    if (!live) {
      run('overlays', overlays, dt, false);
      return;
    }
    const covered = ui.root.dataset.menu === '1';
    if (!covered && !hud.hidden) {
      run('compass', compass, dt);
      run('vitals', vitals, dt);
      run('hotbar', hotbar, dt);
      run('target', target, dt);
      run('labels', labels, dt);
      run('prompt', prompt, dt);
      run('trackers', trackers, dt);
      if (touch) run('touch', touch, dt);
    }
    run('overlays', overlays, dt, !covered && phase === 'playing' && vitals.lowHealth());
  });

  return hud;
}
