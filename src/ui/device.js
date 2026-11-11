// Device traits for the UI: touch input and compact (phone-in-landscape) screens.
// Sets classes on <html> so stylesheets can adapt:  .is-touch  .is-compact  .is-portrait
// `?touch=1` / `?touch=0` in the URL forces the touch mode (handy for testing on a desktop).

const params = new URLSearchParams(location.search);
const forced = params.get('touch');

/** True when the primary input is a finger (phones, tablets). */
export function isTouch() {
  if (forced === '1') return true;
  if (forced === '0') return false;
  return matchMedia('(pointer: coarse)').matches && navigator.maxTouchPoints > 0;
}

/** Compact = not enough height for the desktop layouts (a phone held sideways is ~360–430 px tall). */
export const COMPACT_HEIGHT = 560;
export function isCompact() {
  return window.innerHeight <= COMPACT_HEIGHT || window.innerWidth <= 900;
}

export const isPortrait = () => window.innerHeight > window.innerWidth;

function apply() {
  const root = document.documentElement;
  root.classList.toggle('is-touch', isTouch());
  root.classList.toggle('is-compact', isCompact());
  root.classList.toggle('is-portrait', isTouch() && isPortrait());
}

/** Call once at startup; keeps the classes in sync with rotation and resizing. */
export function watchDevice() {
  apply();
  window.addEventListener('resize', apply);
  window.addEventListener('orientationchange', apply);
}
