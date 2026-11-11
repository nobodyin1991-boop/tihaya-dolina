// Passive talents ("навыки"), each taught by a specific NPC role for learning points and coins.
// Pure data. Effects are plain numbers summed into derived stats by sim/stats.js.
//
// PERKS[id] = { id, name, desc, teacher (npc role), city? (only this city teaches it),
//               lp, coins, level, rep? (city reputation 0..100), requires? (perk id), effects }
// Effect keys:
//   priceBonus, maxHpMult, staminaRegenMult, critChance, healPower, foodBonus, mountSpeedMult,
//   nearWagonDamage (bonus damage within WAGON_PERK_RADIUS metres of the player's wagon),
//   damageVsBandit, damageVsBeast, banditCoinMult, craftSaveChance, craftXpMult,
//   bagSlots, wagonRepairBonus, gatherSpeed, gatherYield:{skill: chance of +1 unit}

/** Radius (m) around the caravan wagon in which «Страж каравана» works. */
export const WAGON_PERK_RADIUS = 25;

export const PERKS = {
  caravanGuard: {
    id: 'caravanGuard', name: 'Страж каравана', teacher: 'captain',
    desc: '+15 % урона, пока вы в 25 м от своей телеги.',
    lp: 2, coins: 150, level: 3,
    effects: { nearWagonDamage: 0.15 },
  },
  toughness: {
    id: 'toughness', name: 'Закалка', teacher: 'captain',
    desc: '+10 % к запасу здоровья.',
    lp: 2, coins: 220, level: 5,
    effects: { maxHpMult: 0.1 },
  },
  banditHunter: {
    id: 'banditHunter', name: 'Гроза разбойников', teacher: 'captain',
    desc: '+10 % урона по разбойникам и на четверть больше монет с них.',
    lp: 2, coins: 400, level: 8, rep: 25,
    effects: { damageVsBandit: 0.1, banditCoinMult: 0.25 },
  },
  tradeSense: {
    id: 'tradeSense', name: 'Торговая хватка', teacher: 'trader',
    desc: 'Цены у всех торговцев лучше на 6 %.',
    lp: 2, coins: 200, level: 3,
    effects: { priceBonus: 0.06 },
  },
  haggler: {
    id: 'haggler', name: 'Мастер торга', teacher: 'trader',
    desc: 'Ещё 6 % к выгоде в любой сделке.',
    lp: 3, coins: 900, level: 10, rep: 40, requires: 'tradeSense',
    effects: { priceBonus: 0.06 },
  },
  rider: {
    id: 'rider', name: 'Наездник', teacher: 'stablemaster',
    desc: 'Верхом вы движетесь на 15 % быстрее.',
    lp: 1, coins: 180, level: 4,
    effects: { mountSpeedMult: 0.15 },
  },
  packMule: {
    id: 'packMule', name: 'Вьючная сноровка', teacher: 'stablemaster',
    desc: 'Грамотная укладка: +6 ячеек сумки.',
    lp: 2, coins: 300, level: 6,
    effects: { bagSlots: 6 },
  },
  wagonWright: {
    id: 'wagonWright', name: 'Обозный мастер', teacher: 'quartermaster',
    desc: 'Ремкомплект чинит телегу в полтора раза лучше.',
    lp: 1, coins: 250, level: 5,
    effects: { wagonRepairBonus: 0.5 },
  },
  heartyEater: {
    id: 'heartyEater', name: 'Крепкий едок', teacher: 'innkeeper',
    desc: 'Еда восстанавливает на 25 % больше, а сытость держится в полтора раза дольше.',
    lp: 1, coins: 120, level: 2,
    effects: { foodBonus: 0.25 },
  },
  beastHunter: {
    id: 'beastHunter', name: 'Зверобой', teacher: 'innkeeper',
    desc: 'Охотничьи байки не прошли даром: +10 % урона по зверям и тварям.',
    lp: 2, coins: 350, level: 7,
    effects: { damageVsBeast: 0.1 },
  },
  secondWind: {
    id: 'secondWind', name: 'Ровное дыхание', teacher: 'trainer',
    desc: 'Силы восстанавливаются на 20 % быстрее.',
    lp: 2, coins: 200, level: 4,
    effects: { staminaRegenMult: 0.2 },
  },
  sharpEye: {
    id: 'sharpEye', name: 'Верный глаз', teacher: 'trainer',
    desc: '+5 % шанса точного удара.',
    lp: 2, coins: 450, level: 9,
    effects: { critChance: 0.05 },
  },
  fieldMedic: {
    id: 'fieldMedic', name: 'Полевая медицина', teacher: 'apothecary',
    desc: 'Лекарства и лечебные умения действуют на 20 % сильнее.',
    lp: 2, coins: 260, level: 5,
    effects: { healPower: 0.2 },
  },
  herbalist: {
    id: 'herbalist', name: 'Травник', teacher: 'apothecary',
    desc: 'Каждый третий сбор трав приносит лишнее растение.',
    lp: 1, coins: 140, level: 2,
    effects: { gatherYield: { herbalism: 0.33 } },
  },
  prospector: {
    id: 'prospector', name: 'Рудознатец', teacher: 'smith',
    desc: 'Каждая третья жила даёт лишний кусок руды.',
    lp: 1, coins: 140, level: 2,
    effects: { gatherYield: { mining: 0.33 } },
  },
  woodsman: {
    id: 'woodsman', name: 'Лесовик', teacher: 'carpenter',
    desc: 'Каждое третье дерево даёт лишнее бревно.',
    lp: 1, coins: 140, level: 2,
    effects: { gatherYield: { logging: 0.33 } },
  },
  skinner: {
    id: 'skinner', name: 'Скорняк', teacher: 'leatherworker',
    desc: 'С каждой третьей туши удаётся снять лишнюю шкуру.',
    lp: 1, coins: 140, level: 2,
    effects: { gatherYield: { skinning: 0.33 } },
  },
  greenThumb: {
    id: 'greenThumb', name: 'Лёгкая рука', teacher: 'farmer',
    desc: 'Жатва и сбор волокна нередко приносят лишний сноп.',
    lp: 1, coins: 140, level: 2,
    effects: { gatherYield: { farming: 0.33, fiber: 0.33 } },
  },
  quarryman: {
    id: 'quarryman', name: 'Каменотёс', teacher: 'mason',
    desc: 'Каждый третий выход камня даёт лишнюю глыбу.',
    lp: 1, coins: 140, level: 2,
    effects: { gatherYield: { stonecutting: 0.33 } },
  },
  thriftyCrafter: {
    id: 'thriftyCrafter', name: 'Бережливый мастер', teacher: 'tailor',
    desc: '10 % шанс не потратить материалы при изготовлении.',
    lp: 2, coins: 380, level: 7,
    effects: { craftSaveChance: 0.1 },
  },
  quickHands: {
    id: 'quickHands', name: 'Спорые руки', teacher: 'grocer',
    desc: 'Сбор любых ресурсов на 15 % быстрее.',
    lp: 1, coins: 160, level: 3,
    effects: { gatherSpeed: 0.15 },
  },
  masterCraftsman: {
    id: 'masterCraftsman', name: 'Школа мастеров', teacher: 'elder',
    desc: 'Ремесло даёт на 20 % больше опыта профессии.',
    lp: 2, coins: 500, level: 8, rep: 30,
    effects: { craftXpMult: 0.2 },
  },
};

export const PERK_IDS = Object.keys(PERKS);

/** Perks taught by an NPC role (optionally limited to a city). */
export function perksTaughtBy(role, cityKey) {
  return Object.values(PERKS).filter(perk => perk.teacher === role && (!perk.city || perk.city === cityKey));
}
