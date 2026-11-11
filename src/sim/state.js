// Game state container. The state is one plain JSON-serialisable object made of named slices.
// Each sim module registers its slice here at import time:
//   registerSlice('caravan', { init: opts => ({...}), migrate: (slice, state) => slice })
// `init(opts)` builds a fresh slice for a new game (opts = {name, classId}).
// `migrate(slice, state)` runs on load; it must fill in fields missing from older saves and
// throw an Error('…') for a corrupted slice. It may return a replacement slice.

export const STATE_VERSION = 1;
const slices = new Map();

export function registerSlice(name, def) {
  slices.set(name, def);
}

export function createState(opts = {}) {
  const state = { version: STATE_VERSION, createdAt: Date.now() };
  for (const [name, def] of slices) state[name] = def.init(opts);
  return state;
}

/** Validate/upgrade a parsed save in place and return it. Throws on corruption. */
export function hydrateState(raw) {
  if (!raw || typeof raw !== 'object' || raw.version !== STATE_VERSION) throw new Error('Несовместимое сохранение');
  for (const [name, def] of slices) {
    if (raw[name] === undefined) raw[name] = def.init({ name: raw.player?.name, classId: raw.player?.classId });
    else if (def.migrate) raw[name] = def.migrate(raw[name], raw) ?? raw[name];
  }
  return raw;
}

export const sliceNames = () => [...slices.keys()];

/** Standard results for sim actions. */
export const ok = (extra = {}) => ({ ok: true, ...extra });
export const fail = reason => ({ ok: false, reason });
