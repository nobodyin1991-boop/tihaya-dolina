// Save/load to localStorage with export/import. Browser-only wrapper around sim/state.js.
import { hydrateState } from '../sim/state.js';

export const SAVE_KEY = 'tihaya-dolina-save-v1';
export const SETTINGS_KEY = 'tihaya-dolina-settings-v1';

export function hasSave() {
  try { return !!localStorage.getItem(SAVE_KEY); } catch { return false; }
}

export function saveGame(state) {
  try {
    state.savedAt = Date.now();
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
    return true;
  } catch { return false; }
}

/** Returns a hydrated state, or null if there is no usable save. */
export function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    return raw ? hydrateState(JSON.parse(raw)) : null;
  } catch (e) {
    console.warn('Сохранение не загружено:', e);
    return null;
  }
}

export function deleteSave() {
  try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ }
}

export const exportSave = state => JSON.stringify(state);
/** Parse + validate an exported save. Throws with a Russian message on bad data. */
export const importSave = text => hydrateState(JSON.parse(text));

export function loadSettings(defaults) {
  try { return { ...defaults, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') }; } catch { return { ...defaults }; }
}
export function saveSettings(settings) {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch { /* ignore */ }
}
