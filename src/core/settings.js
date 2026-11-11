// User settings (separate from the character save).
import { loadSettings, saveSettings } from './save.js';
import { emit } from './events.js';

export const DEFAULT_SETTINGS = {
  quality: 'high',          // low | medium | high | ultra
  renderScale: 1,           // 0.5 .. 1.5 of device pixels (further capped by quality)
  vsync: true,
  musicOn: true, musicVolume: 0.3,
  sfxOn: true, sfxVolume: 0.5,
  mouseSensitivity: 1,
  invertY: false,
  damageNumbers: true,
  showFps: false,
  hudScale: 1,
};

export function createSettings() {
  const settings = loadSettings(DEFAULT_SETTINGS);
  /** Change one setting, persist, notify listeners ('settings:changed' {key, value}). */
  settings.set = function set(key, value) {
    if (settings[key] === value) return;
    settings[key] = value;
    const { set: _omit, ...plain } = settings;
    saveSettings(plain);
    emit('settings:changed', { key, value });
  };
  return settings;
}
