// Inline SVG icon set: item vocabulary, UI glyphs and ability glyphs.
// Every icon is drawn on a 24×24 grid with `currentColor` strokes of one weight,
// so colour and size come from CSS (`color`, `font-size`).
//
//   import { icon } from './icons.js';
//   row.append(icon('sword'), icon('coin', { size: 14, title: 'Монеты' }));
import { ITEM_ICONS } from './icons-items.js';
import { ABILITY_ICONS } from './icons-abilities.js';

/** UI glyphs: tabs, map markers, status and service symbols. */
const UI_ICONS = {
  // — menu tabs —
  inventory: 'M6 9h12l2 10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z|M9 9V6a3 3 0 0 1 6 0v3|M4.700 14h14.600|M12 12.500v3',
  character: 'c:12,7.500,4|M4 21c0-5 3.500-8 8-8s8 3 8 8|M9 21l3-5 3 5',
  skills: 'M12 2l2.600 6.400L21 9l-5 4.300 1.600 6.700L12 16.400 6.400 20 8 13.300 3 9l6.400-.600z',
  crafting: 'M3 9h10l4-2v3c0 2-2 3-4 3h-1l1 4h3v3H6v-3h3l1-4C6 13 3 12 3 9z|M15 3l5 2-1 2',
  journal: 'M5 4h12a2 2 0 0 1 2 2v14H7a2 2 0 0 1-2-2z|M5 18a2 2 0 0 1 2-2h12|M9 8h6M9 11h4',
  map: 'M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z|M9 4v14M15 6v14',
  caravan: 'M3 15V8c3-3 11-3 14 0v7z|M17 11h3l1.500 4H17|c:7,17.500,2.500|c:17,17.500,2.500|M3 15h1.500M9.500 15h5',
  settings: 'c:12,12,3|M10.300 3h3.400l.500 2.600 2 1.200 2.500-.900 1.700 3-2 1.700v2.400l2 1.700-1.700 3-2.500-.900-2 1.200-.500 2.600h-3.400l-.500-2.600-2-1.200-2.500 .900-1.700-3 2-1.700V10.600l-2-1.700 1.700-3 2.500 .900 2-1.200z',
  system: 'M12 3l8 9-8 9-8-9z|M8.500 12h7M12 8.500v7',
  // — compass & map —
  'arrow-up': 'f:M12 3l6.500 17L12 16l-6.500 4z',
  'arrow-down': 'M12 4v15M6 13l6 6 6-6',
  'chevron-left': 'M15 5l-7 7 7 7',
  'chevron-right': 'M9 5l7 7-7 7',
  'chevron-up': 'M5 15l7-7 7 7',
  'chevron-down': 'M5 9l7 7 7-7',
  player: 'f:M12 2l7 19-7-4.500L5 21z',
  quest: 'M12 2l7 10-7 10-5-7.200z|f:M12 7.500l3.200 4.500L12 16.500 8.800 12z',
  'quest-done': 'M12 2l7 10-7 10-7-10z|M8.500 12l2.500 2.500 4.500-5',
  city: 'M3 21V10l3-2 3 2v11|M9 21V6l3-3 3 3v15|M15 21V10l3-2 3 2v11|M2 21h20|M11 13h2M11 9h2',
  village: 'M3 21v-7l4.500-4 4.500 4v7z|M13 21v-5l4-3.500 4 3.500v5z|M6 21v-3.500h3V21|M2 21h20',
  camp: 'M3 20L12 5l9 15z|M12 5l-2-3M12 5l2-3|M12 20v-6l-3 6',
  banditcamp: 'M3 20L11 8l8 12z|M11 20v-5|M16 3v9|M16 3l5 2-5 2.500',
  ruin: 'M4 21V9l2-2 1 3 2-5 2 4v12|M14 21v-9l3-2 1 2 2-1v10|M2 21h20|M7 14h1.500M16.500 16H18',
  mine: 'M3 21l6-10h6l6 10z|M9 21v-5a3 3 0 0 1 6 0v5|M7 5c3-2.500 7-2.500 10 0|M12 3v6',
  farm: 'M4 21V11l8-6 8 6v10z|M4 11h16|M9 21v-6h6v6|M12 5V2',
  lair: 'M2 20c1-9 5-14 10-14s9 5 10 14z|M8 20c0-4 1.500-6.500 4-6.500s4 2.500 4 6.500|M10 17l1 1.500M14 17l-1 1.500',
  landmark: 'M12 2l3 6-1.500 13h-3L9 8z|M6 21h12|M9.500 12h5',
  outpost: 'M8 21V8h8v13|M6 8V4h2.500v2h2V4h3v2h2V4H18v4z|M11 21v-4h2v4|M11 11h2',
  wagon: 'M3 15V8c3-3 11-3 14 0v7z|M17 11h3l1.500 4H17|c:7,17.500,2.500|c:17,17.500,2.500',
  ambush: 'M5 5l14 14M19 5L5 19|M5 5l-.500 4M5 5l4-.500M19 5l.500 4M19 5l-4-.500',
  obstacle: 'M12 3l10 17H2z|M12 10v5|fc:12,17.500,.900',
  chest: 'M4 11a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v8H4z|M4 12.500h16|M11 11h2v3.500h-2z',
  node: 'M12 3l2.500 6.500L21 12l-6.500 2.500L12 21l-2.500-6.500L3 12l6.500-2.500z',
  npc: 'c:12,8,3.500|M5 21c0-4.500 3-7.500 7-7.500s7 3 7 7.500',
  // — status —
  coin: 'c:12,12,8|M12 8l3 4-3 4-3-4z',
  lock: 'M6 11h12v9.500H6z|M8.500 11V8a3.500 3.500 0 0 1 7 0v3|M12 14.500v2.500',
  check: 'M4 12.500l5.500 5.500L20 6.500',
  cross: 'M5.500 5.500l13 13M18.500 5.500l-13 13',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  sword: 'M20 4l-4 .500-9 9 3.500 3.500 9-9z|M5 12l7 7|M7.500 16.500L4 20',
  swords: 'M4 4l11 11M20 4L9 15|M4 4h3.500M4 4v3.500M20 4h-3.500M20 4v3.500|M13 17l4-4M11 17l-4-4|M16 16l4 4M8 16l-4 4',
  shield: 'M12 3l8 3v6c0 5-3.500 7.500-8 9-4.500-1.500-8-4-8-9V6z',
  heart: 'M12 20.500S4 15.500 4 9.500A4.300 4.300 0 0 1 12 7a4.300 4.300 0 0 1 8 2.500c0 6-8 11-8 11z',
  stamina: 'M13 2L5 13.500h6L10 22l9-12.500h-6z',
  clock: 'c:12,12,8.500|M12 7v5l3.500 2',
  sun: 'c:12,12,4|M12 2.500v3M12 18.500v3M2.500 12h3M18.500 12h3M5.300 5.300l2.100 2.100M16.600 16.600l2.100 2.100M18.700 5.300l-2.100 2.100M7.400 16.600l-2.100 2.100',
  moon: 'M19.500 14.500A8 8 0 0 1 9.500 4.500a8 8 0 1 0 10 10z',
  cloud: 'M7 18.500a4.500 4.500 0 0 1 .500-9 5.500 5.500 0 0 1 10.500 1.500A3.800 3.800 0 0 1 17.500 18.500z',
  rain: 'M7 14.500a4.300 4.300 0 0 1 .500-8.500 5.500 5.500 0 0 1 10.500 1.500A3.600 3.600 0 0 1 17.500 14.500z|M8 17.500l-1 3M12 17.500l-1 3M16 17.500l-1 3',
  storm: 'M7 13.500a4.300 4.300 0 0 1 .500-8.500 5.500 5.500 0 0 1 10.500 1.500A3.600 3.600 0 0 1 17.500 13.500z|M12.500 12l-3 5h4l-2 4.500',
  fog: 'M4 8h13M7 12h13M4 16h11M6 20h12|M19.500 8h.500M3.500 12h.500M17.500 16h2.500',
  skull: 'M5 11a7 7 0 0 1 14 0c0 2.500-1 4-2.500 5v3.500h-9V16C6 15 5 13.500 5 11z|c:9.300,11.500,1.500|c:14.700,11.500,1.500|M10.500 19.500v-2M13.500 19.500v-2',
  star: 'M12 2l2.600 6.400L21 9l-5 4.300 1.600 6.700L12 16.400 6.400 20 8 13.300 3 9l6.400-.600z',
  diamond: 'M12 3l7 9-7 9-7-9z',
  warning: 'M12 3l10 17H2z|M12 10v5|fc:12,17.500,.900',
  info: 'c:12,12,8.500|M12 11v6|fc:12,8,.900',
  eye: 'M2 12c3-5 6.500-7 10-7s7 2 10 7c-3 5-6.500 7-10 7s-7-2-10-7z|c:12,12,3',
  hand: 'M8 13V5.500a1.500 1.500 0 0 1 3 0V11V4a1.500 1.500 0 0 1 3 0v7-5.500a1.500 1.500 0 0 1 3 0V15c0 4-2 6.500-5.500 6.500-3 0-4.500-1.500-6-4l-2-4a1.500 1.500 0 0 1 2.500-1.500z',
  speech: 'M4 5h16v11H11l-5 4v-4H4z|M8 9h8M8 12h5',
  level: 'M12 3l7 9-7 9-7-9z|M8.500 13.500L12 10l3.500 3.500',
  // — system menu —
  play: 'M7 4l13 8-13 8z',
  save: 'M4 4h13l3 3v13H4z|M8 4v5h7V4|M7 20v-6h10v6',
  export: 'M12 15V3|M7.500 7.500L12 3l4.500 4.500|M4 14v6h16v-6',
  import: 'M12 3v12|M7.500 10.500L12 15l4.500-4.500|M4 14v6h16v-6',
  exit: 'M10 4H5v16h5|M9 12h11|M16 8l4 4-4 4',
  back: 'M20 12H5|M11 6l-6 6 6 6',
  trash: 'M4 7h16|M9 7V4h6v3|M6 7l1 13.500h10L18 7|M10 11v6M14 11v6',
  search: 'c:10.500,10.500,6|M15 15l5.500 5.500',
  target: 'c:12,12,8|c:12,12,3|M12 2v4M12 18v4M2 12h4M18 12h4',
  legend: 'M4 6h2M4 12h2M4 18h2|M9 6h11M9 12h11M9 18h11',
};

const ALL = { ...ABILITY_ICONS, ...UI_ICONS, ...ITEM_ICONS };

/** Unicode placeholders used by early ability catalogs → drawn glyphs. */
const GLYPH_ALIASES = {
  '↻': 'whirl', '▼': 'execute', '↑': 'rally', '⚔': 'cleave', '◎': 'pulse', '▣': 'guard', '⬡': 'fortify',
  '＋': 'heal', '➤': 'thrust', '⛨': 'shield-up', '❄': 'frost', 'ϟ': 'spark', '◆': 'mark', '✺': 'fire',
  '❅': 'frost', 'Ⅱ': 'flurry', '╳': 'parry', 'Ⅲ': 'whirl', '◈': 'focus', '⋔': 'volley', '↶': 'riposte',
  '➶': 'arrow', '☄': 'snipe', '•': 'dart', '✚': 'regen', '✙': 'bandage', '⚙': 'gear', '⇈': 'leap', '⁂': 'bomb',
};

/** Every icon key understood by {@link icon}. */
export const ICON_KEYS = Object.freeze(Object.keys(ALL));
/** Keys of the item vocabulary only. */
export const ITEM_ICON_KEYS = Object.freeze(Object.keys(ITEM_ICONS));
/** Keys of the ability glyphs only. */
export const ABILITY_ICON_KEYS = Object.freeze(Object.keys(ABILITY_ICONS));

const SVG_NS = 'http://www.w3.org/2000/svg';
const markupCache = new Map();

function circleMarkup(args, filled) {
  const [cx, cy, r] = args.split(',');
  const paint = filled ? 'fill="currentColor" stroke="none"' : '';
  return `<circle cx="${cx}" cy="${cy}" r="${r}" ${paint}/>`;
}

function compile(source) {
  let out = '';
  for (const segment of source.split('|')) {
    if (segment.startsWith('fc:')) out += circleMarkup(segment.slice(3), true);
    else if (segment.startsWith('c:')) out += circleMarkup(segment.slice(2), false);
    else if (segment.startsWith('f:')) out += `<path d="${segment.slice(2)}" fill="currentColor" stroke="none"/>`;
    else out += `<path d="${segment}"/>`;
  }
  return out;
}

/** Inner SVG markup of an icon (falls back to the neutral diamond). */
export function iconMarkup(key) {
  let markup = markupCache.get(key);
  if (markup === undefined) {
    const resolved = Object.prototype.hasOwnProperty.call(GLYPH_ALIASES, key) ? GLYPH_ALIASES[key] : key;
    const source = Object.prototype.hasOwnProperty.call(ALL, resolved) ? ALL[resolved] : ALL.diamond;
    markup = compile(source);
    markupCache.set(key, markup);
  }
  return markup;
}

/** True when `key` has its own drawing. */
export const hasIcon = key => Object.prototype.hasOwnProperty.call(ALL, key);

/**
 * Build an inline SVG icon. Never throws: an unknown key renders a neutral diamond.
 * @param {string} key   key from {@link ICON_KEYS}
 * @param {{size?: number|string, title?: string, class?: string}} [opts]
 *        `size` — px number or any CSS length (default `1em`, so the icon follows font-size)
 * @returns {SVGSVGElement}
 */
export function icon(key, opts = {}) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.5');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', opts.title ? 'false' : 'true');
  svg.setAttribute('class', opts.class ? `ico ${opts.class}` : 'ico');
  svg.dataset.icon = key;
  const size = opts.size === undefined ? '1em' : typeof opts.size === 'number' ? `${opts.size}px` : opts.size;
  svg.style.width = size;
  svg.style.height = size;
  let markup = iconMarkup(String(key));
  if (opts.title) markup = `<title>${String(opts.title).replace(/[<&>]/g, '')}</title>${markup}`;
  svg.innerHTML = markup;
  return svg;
}

/** Swap the drawing of an existing icon element in place (no re-layout of the parent). */
export function setIcon(svg, key) {
  if (svg.dataset.icon === key) return;
  svg.dataset.icon = key;
  svg.innerHTML = iconMarkup(String(key));
}
