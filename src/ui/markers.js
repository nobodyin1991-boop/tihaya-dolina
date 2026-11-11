// Shared vocabulary for compass and map markers, status pips and difficulty colours.
import { POIS } from '../data/world-map.js';

const poiTypeById = new Map(POIS.map(p => [p.id, p.type]));

export const POI_TYPE_NAMES = {
  banditcamp: 'Лагерь разбойников', ruin: 'Руины', mine: 'Рудник', camp: 'Стоянка', farm: 'Хозяйство',
  lair: 'Логово', landmark: 'Ориентир', outpost: 'Застава', village: 'Деревня',
};
export const MARKER_KIND_NAMES = {
  city: 'Город', poi: 'Место', quest: 'Задание', caravan: 'Караван', ambush: 'Засада', obstacle: 'Завал на дороге',
};

/** Icon key of a POI type. */
export const poiIcon = type => (POI_TYPE_NAMES[type] ? type : 'landmark');

/** Icon key for a marker from g.markers() (honours an explicit `marker.icon`). */
export function markerIcon(marker) {
  if (marker.icon) return marker.icon;
  switch (marker.kind) {
    case 'city': return 'city';
    case 'poi': return poiIcon(poiTypeById.get(marker.id));
    case 'quest': return 'quest';
    case 'caravan': return 'wagon';
    case 'ambush': return 'ambush';
    case 'obstacle': return 'obstacle';
    default: return 'diamond';
  }
}

const STATUS_ICONS = {
  bleed: 'bleed', poison: 'poison', burn: 'fire', fire: 'fire', stun: 'stun', slow: 'frost', chill: 'frost', frost: 'frost',
  freeze: 'frost', shock: 'shock', regen: 'regen', heal: 'regen', hot: 'regen', shield: 'shield-up', guard: 'guard',
  block: 'guard', fortify: 'fortify', mark: 'mark', marked: 'mark', taunt: 'taunt', rally: 'rally', haste: 'dash',
  weaken: 'arrow-down', vulnerable: 'pierce', wellFed: 'meal', food: 'meal', root: 'trap', snare: 'trap', focus: 'focus',
};
const HARMFUL = new Set(['bleed', 'poison', 'burn', 'fire', 'stun', 'slow', 'chill', 'frost', 'freeze', 'shock', 'weaken', 'vulnerable', 'root', 'snare', 'mark', 'marked']);

/** Icon key of a status effect type (generic star for unknown buffs). */
export const statusIcon = type => STATUS_ICONS[type] || 'star';
/** True for debuffs (drawn in red). */
export const statusHarmful = type => HARMFUL.has(type);

/** CSS class describing how dangerous a level is for the hero: skull | hard | even | easy | trivial. */
export function difficultyClass(level, heroLevel) {
  const diff = level - heroLevel;
  if (diff >= 5) return 'lvl-skull';
  if (diff >= 2) return 'lvl-hard';
  if (diff >= -2) return 'lvl-even';
  if (diff >= -5) return 'lvl-easy';
  return 'lvl-trivial';
}

/** 1240 → «1,2 км», 86 → «86 м». */
export function formatDistance(metres) {
  if (metres >= 1000) return `${(metres / 1000).toFixed(1).replace('.', ',')} км`;
  return `${Math.round(metres)} м`;
}
