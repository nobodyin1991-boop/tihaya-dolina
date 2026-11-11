// Tiny synchronous event bus shared by sim, engine and UI.
// Event names are documented in CLAUDE.md ("События").

const listeners = new Map();

export function on(type, fn) {
  if (!listeners.has(type)) listeners.set(type, new Set());
  listeners.get(type).add(fn);
  return () => off(type, fn);
}

export function off(type, fn) {
  listeners.get(type)?.delete(fn);
}

export function emit(type, payload) {
  const set = listeners.get(type);
  if (set) for (const fn of [...set]) fn(payload);
  const any = listeners.get('*');
  if (any) for (const fn of [...any]) fn(type, payload);
}

/** Test helper. */
export function clearAllListeners() {
  listeners.clear();
}
