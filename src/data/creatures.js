// Creature catalog: beasts, monsters, bandits and friendly fighters. Pure data.
//
// CREATURES[id] = {
//   id, name, model: 'quadruped'|'lizard'|'spider'|'humanoid', variant (look key for the model),
//   family: 'beast'|'monster'|'bandit'|'guard', aggressive,
//   baseHp, baseDamage, armor   — level-1 numbers, scaled by sim/combat.js creatureStats()
//   speed (m/s run), attackRange (m), attackInterval (s), aggroRadius, leashRadius (m),
//   levelRange: [min, max], biomes: [...], packSize: [min, max],
//   ranged?: { projectileSpeed, keepDistance },
//   abilities?: [{ type: 'charge'|'poison'|'web'|'howl'|'heavy'|'volley'|'steal', cooldown, … }],
//   boss?, elite?, role? (bandit behaviour key), flees? (runs when hurt),
//   loot: { coins: [min, max] at level 1, items: [[itemId, chance, min, max]], skin?: {item, tier, count:[min,max]},
//           uniques?: [itemId], gearChance? },
//   xp (multiplier of the level xp), scale (model size)
// }

const beast = def => ({ family: 'beast', aggressive: true, armor: 0, attackRange: 1.8, attackInterval: 1.6, aggroRadius: 14, leashRadius: 45, packSize: [1, 1], scale: 1, ...def });
const bandit = def => ({ family: 'bandit', model: 'humanoid', aggressive: true, attackRange: 2.2, attackInterval: 1.5, aggroRadius: 20, leashRadius: 60, packSize: [2, 4], scale: 1, biomes: ['forest', 'darkforest', 'steppe', 'swamp', 'mountain'], ...def });

const SKIN = {
  small: { item: 'hide', tier: 1, count: [1, 1] },
  hide: { item: 'hide', tier: 1, count: [1, 2] },
  fine: { item: 'fineHide', tier: 2, count: [1, 2] },
  thick: { item: 'thickHide', tier: 3, count: [1, 2] },
  pristine: { item: 'pristineHide', tier: 4, count: [1, 2] },
};

const BANDIT_LOOT = [
  ['banditBadge', 0.35, 1, 1],
  ['flatbread', 0.3, 1, 2],
  ['bandage', 0.18, 1, 1],
  ['salve', 0.1, 1, 1],
];

const LIST = [
  // — мирная дичь —
  beast({
    id: 'rabbit', name: 'Заяц', model: 'quadruped', variant: 'rabbit', aggressive: false, flees: true,
    baseHp: 30, baseDamage: 3, speed: 7.6, levelRange: [1, 3], biomes: ['meadow', 'farmland', 'forest'], packSize: [1, 2],
    loot: { coins: [0, 0], items: [['meat', 0.8, 1, 1]], skin: SKIN.small }, xp: 0.3, scale: 0.45,
  }),
  beast({
    id: 'sheep', name: 'Луговая овца', model: 'quadruped', variant: 'sheep', aggressive: false,
    baseHp: 60, baseDamage: 5, speed: 4.6, levelRange: [1, 3], biomes: ['meadow', 'farmland'], packSize: [2, 4],
    loot: { coins: [0, 0], items: [['meat', 1, 1, 2], ['wool', 0.8, 1, 2]], skin: SKIN.hide }, xp: 0.4, scale: 0.8,
  }),
  beast({
    id: 'deer', name: 'Олень', model: 'quadruped', variant: 'deer', aggressive: false, flees: true,
    baseHp: 80, baseDamage: 8, speed: 7.8, levelRange: [1, 6], biomes: ['forest', 'meadow'], packSize: [1, 3],
    loot: { coins: [0, 0], items: [['meat', 1, 1, 3], ['antler', 0.3, 1, 1]], skin: SKIN.hide }, xp: 0.6, scale: 1.1,
  }),
  beast({
    id: 'goat', name: 'Горный козёл', model: 'quadruped', variant: 'goat', aggressive: false,
    baseHp: 75, baseDamage: 11, speed: 6.4, levelRange: [4, 14], biomes: ['highland', 'mountain', 'snow'], packSize: [1, 3],
    abilities: [{ type: 'charge', cooldown: 9, power: 1.6, range: 9 }],
    loot: { coins: [0, 0], items: [['meat', 1, 1, 2], ['goatHorn', 0.4, 1, 1]], skin: SKIN.hide }, xp: 0.7, scale: 0.9,
  }),
  beast({
    id: 'fox', name: 'Лиса', model: 'quadruped', variant: 'fox', aggressive: false, flees: true,
    baseHp: 60, baseDamage: 9, speed: 7.2, levelRange: [1, 5], biomes: ['forest', 'meadow', 'farmland', 'coast'],
    loot: { coins: [0, 0], items: [['foxPelt', 0.6, 1, 1], ['meat', 0.5, 1, 1]], skin: SKIN.small }, xp: 0.6, scale: 0.6,
  }),
  beast({
    id: 'elk', name: 'Великий лесной олень', model: 'quadruped', variant: 'elk', aggressive: false,
    baseHp: 180, baseDamage: 18, speed: 7.2, levelRange: [8, 18], biomes: ['forest', 'heath', 'lake'], packSize: [1, 2],
    abilities: [{ type: 'charge', cooldown: 10, power: 1.8, range: 10 }],
    loot: { coins: [0, 0], items: [['meat', 1, 2, 4], ['antler', 0.7, 1, 2]], skin: SKIN.thick }, xp: 1.3, scale: 1.5,
  }),

  // — хищники и опасные звери —
  beast({
    id: 'badger', name: 'Барсук', model: 'quadruped', variant: 'badger',
    baseHp: 85, baseDamage: 12, armor: 2, speed: 5.2, aggroRadius: 8, levelRange: [2, 5], biomes: ['forest', 'farmland'],
    loot: { coins: [0, 0], items: [['meat', 0.7, 1, 1], ['fang', 0.3, 1, 1]], skin: SKIN.hide }, xp: 0.8, scale: 0.6,
  }),
  beast({
    id: 'boar', name: 'Кабан', model: 'quadruped', variant: 'boar',
    baseHp: 135, baseDamage: 15, armor: 3, speed: 6.2, aggroRadius: 11, levelRange: [2, 6], biomes: ['forest', 'darkforest'], packSize: [1, 2],
    abilities: [{ type: 'charge', cooldown: 8, power: 1.7, range: 10 }],
    loot: { coins: [0, 0], items: [['meat', 1, 1, 3], ['boarTusk', 0.45, 1, 2]], skin: SKIN.fine }, xp: 1.1, scale: 1,
  }),
  beast({
    id: 'wolf', name: 'Волк', model: 'quadruped', variant: 'grey',
    baseHp: 110, baseDamage: 19, armor: 2, speed: 6.8, aggroRadius: 16, levelRange: [1, 8], biomes: ['forest', 'darkforest', 'highland', 'meadow'], packSize: [1, 3],
    loot: { coins: [0, 0], items: [['wolfPelt', 0.5, 1, 1], ['fang', 0.4, 1, 2], ['meat', 0.6, 1, 1]], skin: SKIN.hide }, xp: 1, scale: 1,
  }),
  beast({
    id: 'lynx', name: 'Рысь', model: 'quadruped', variant: 'lynx',
    baseHp: 95, baseDamage: 20, armor: 1, speed: 7.6, attackInterval: 1.3, aggroRadius: 13, levelRange: [4, 9], biomes: ['darkforest', 'highland', 'mountain'],
    abilities: [{ type: 'charge', cooldown: 7, power: 1.5, range: 8 }],
    loot: { coins: [0, 0], items: [['fang', 0.6, 1, 2], ['meat', 0.5, 1, 1]], skin: SKIN.fine }, xp: 1.1, scale: 0.9,
  }),
  beast({
    id: 'bear', name: 'Медведь', model: 'quadruped', variant: 'bear',
    baseHp: 270, baseDamage: 26, armor: 6, speed: 5.8, attackRange: 2.4, attackInterval: 2, aggroRadius: 12, levelRange: [5, 18], biomes: ['forest', 'darkforest', 'mountain'],
    abilities: [{ type: 'heavy', cooldown: 9, power: 2, windup: 1, knockback: 3 }],
    loot: { coins: [0, 0], items: [['meat', 1, 2, 4], ['bearClaw', 0.7, 1, 2]], skin: SKIN.thick, uniques: ['bearTotem'] }, xp: 2.2, scale: 1.5,
  }),
  beast({
    id: 'alpha_wolf', name: 'Матёрый волк', model: 'quadruped', variant: 'alpha', elite: true,
    baseHp: 250, baseDamage: 22, armor: 4, speed: 7, aggroRadius: 18, levelRange: [5, 10], biomes: ['darkforest'],
    abilities: [
      { type: 'howl', cooldown: 18, summon: 'wolf', count: 2, buffDamage: 0.2, duration: 8 },
      { type: 'charge', cooldown: 8, power: 1.6, range: 9 },
    ],
    loot: { coins: [0, 0], items: [['wolfPelt', 1, 1, 2], ['fang', 1, 2, 3], ['meat', 1, 1, 2]], skin: SKIN.fine, uniques: ['alphaFang'] }, xp: 3, scale: 1.3,
  }),
  beast({
    id: 'frost_wolf', name: 'Инеевый волк', model: 'quadruped', variant: 'frost',
    baseHp: 130, baseDamage: 19, armor: 4, speed: 7, aggroRadius: 17, levelRange: [12, 16], biomes: ['snow', 'mountain'], packSize: [2, 3],
    abilities: [{ type: 'howl', cooldown: 20, summon: null, count: 0, buffDamage: 0.2, duration: 8 }],
    loot: { coins: [0, 0], items: [['frostPelt', 0.45, 1, 1], ['fang', 0.6, 1, 2], ['meat', 0.6, 1, 1]], skin: SKIN.thick, uniques: ['frostEmitter'] }, xp: 1.2, scale: 1.15,
  }),
  beast({
    id: 'thorn_boar', name: 'Терновый вепрь', model: 'quadruped', variant: 'thorn',
    baseHp: 175, baseDamage: 18, armor: 8, speed: 6.4, aggroRadius: 13, levelRange: [10, 16], biomes: ['heath', 'darkforest', 'swamp'], packSize: [1, 2],
    abilities: [{ type: 'charge', cooldown: 7, power: 1.9, range: 11, bleed: 5 }],
    loot: { coins: [0, 0], items: [['meat', 1, 2, 3], ['boarTusk', 0.8, 1, 2]], skin: SKIN.thick }, xp: 1.4, scale: 1.25,
  }),
  beast({
    id: 'shadow_cat', name: 'Сумрачная кошка', model: 'quadruped', variant: 'shadow',
    baseHp: 125, baseDamage: 24, armor: 3, speed: 8, attackInterval: 1.2, aggroRadius: 12, levelRange: [14, 20], biomes: ['darkforest', 'mountain', 'highland', 'coast'],
    abilities: [{ type: 'charge', cooldown: 6, power: 1.8, range: 9, bleed: 4 }],
    loot: { coins: [0, 0], items: [['shadowPelt', 0.4, 1, 1], ['fang', 0.7, 1, 2]], skin: SKIN.pristine }, xp: 1.4, scale: 1.05,
  }),

  // — ящеры —
  beast({
    id: 'lizard', name: 'Степная ящерица', model: 'lizard', variant: 'green', family: 'monster',
    baseHp: 85, baseDamage: 12, armor: 4, speed: 5.8, aggroRadius: 10, levelRange: [3, 12], biomes: ['steppe', 'coast', 'highland'], packSize: [1, 3],
    abilities: [{ type: 'poison', cooldown: 10, duration: 6, value: 0.15 }],
    loot: { coins: [0, 0], items: [['lizardScale', 0.6, 1, 2], ['meat', 0.4, 1, 1]], skin: SKIN.hide }, xp: 0.8, scale: 0.8,
  }),
  beast({
    id: 'stoneback', name: 'Камнеспин', model: 'lizard', variant: 'stoneback', family: 'monster', elite: true,
    baseHp: 310, baseDamage: 22, armor: 30, speed: 4.4, attackRange: 2.6, attackInterval: 2.1, aggroRadius: 10, levelRange: [8, 14], biomes: ['mountain', 'steppe'],
    abilities: [{ type: 'heavy', cooldown: 8, power: 2.1, windup: 1.2, knockback: 4 }],
    loot: { coins: [0, 0], items: [['stoneShell', 0.9, 1, 2], ['lizardScale', 1, 1, 3], ['roughGem', 0.12, 1, 1]], skin: SKIN.thick, uniques: ['stonebackMaul'] }, xp: 2.4, scale: 1.6,
  }),
  beast({
    id: 'ridge_drake', name: 'Кряжевый ящер', model: 'lizard', variant: 'drake', family: 'monster', elite: true,
    baseHp: 400, baseDamage: 30, armor: 18, speed: 6, attackRange: 3, attackInterval: 1.9, aggroRadius: 16, leashRadius: 60, levelRange: [14, 20], biomes: ['mountain', 'highland'],
    abilities: [
      { type: 'charge', cooldown: 9, power: 2, range: 12 },
      { type: 'heavy', cooldown: 12, power: 2.4, windup: 1.2, knockback: 5 },
    ],
    loot: { coins: [0, 0], items: [['drakeScale', 1, 1, 3], ['meat', 1, 2, 4], ['roughGem', 0.2, 1, 1]], skin: SKIN.pristine, uniques: ['drakeLance'] }, xp: 3.2, scale: 2.1,
  }),
  beast({
    id: 'marsh_lurker', name: 'Болотный топляк', model: 'lizard', variant: 'lurker', family: 'monster',
    baseHp: 225, baseDamage: 20, armor: 10, speed: 5, attackRange: 2.4, aggroRadius: 9, levelRange: [11, 17], biomes: ['swamp', 'lake', 'coast'],
    abilities: [
      { type: 'poison', cooldown: 8, duration: 8, value: 0.2 },
      { type: 'charge', cooldown: 11, power: 1.7, range: 7 },
    ],
    loot: { coins: [0, 0], items: [['venomGland', 0.6, 1, 1], ['lizardScale', 0.8, 1, 3]], skin: SKIN.thick, uniques: ['lurkerSting'] }, xp: 1.8, scale: 1.5,
  }),

  // — пауки —
  beast({
    id: 'giant_spider', name: 'Гигантский паук', model: 'spider', variant: 'widow', family: 'monster',
    baseHp: 205, baseDamage: 21, armor: 8, speed: 6.4, attackRange: 2.4, aggroRadius: 14, levelRange: [13, 20], biomes: ['darkforest'],
    abilities: [
      { type: 'web', cooldown: 12, duration: 3, range: 12, value: 0.6 },
      { type: 'poison', cooldown: 9, duration: 8, value: 0.2 },
    ],
    loot: { coins: [0, 0], items: [['spiderSilk', 0.8, 1, 3], ['venomGland', 0.5, 1, 1]], uniques: ['widowBlades'] }, xp: 1.7, scale: 1.5,
  }),
  beast({
    id: 'spiderling', name: 'Паучонок', model: 'spider', variant: 'small', family: 'monster',
    baseHp: 45, baseDamage: 9, armor: 1, speed: 7, attackInterval: 1.2, aggroRadius: 12, levelRange: [13, 20], biomes: ['darkforest'], packSize: [3, 5],
    abilities: [{ type: 'poison', cooldown: 12, duration: 4, value: 0.1 }],
    loot: { coins: [0, 0], items: [['spiderSilk', 0.2, 1, 1]] }, xp: 0.4, scale: 0.5,
  }),

  // — разбойники —
  bandit({
    id: 'bandit_thug', name: 'Разбойник', variant: 'thug', role: 'melee',
    baseHp: 120, baseDamage: 15, armor: 4, speed: 5.6, levelRange: [3, 17],
    loot: { coins: [3, 8], items: BANDIT_LOOT, gearChance: 0.03 }, xp: 1.1,
  }),
  bandit({
    id: 'bandit_archer', name: 'Разбойник-лучник', variant: 'archer', role: 'kiter',
    baseHp: 85, baseDamage: 14, armor: 2, speed: 5.4, attackRange: 18, attackInterval: 1.9, aggroRadius: 24, levelRange: [3, 17],
    ranged: { projectileSpeed: 42, keepDistance: 11 },
    loot: { coins: [3, 8], items: [...BANDIT_LOOT, ['arrow', 0.3, 1, 2]], gearChance: 0.03 }, xp: 1,
  }),
  bandit({
    id: 'bandit_brute', name: 'Громила', variant: 'brute', role: 'heavy',
    baseHp: 225, baseDamage: 24, armor: 8, speed: 4.4, attackRange: 2.8, attackInterval: 2.3, levelRange: [6, 17], packSize: [1, 1],
    abilities: [{ type: 'heavy', cooldown: 7, power: 2.2, windup: 1.1, knockback: 4 }],
    loot: { coins: [6, 14], items: [...BANDIT_LOOT, ['stew', 0.3, 1, 1]], gearChance: 0.06 }, xp: 1.8, scale: 1.25,
  }),
  bandit({
    id: 'bandit_scout', name: 'Лазутчик', variant: 'scout', role: 'flanker',
    baseHp: 90, baseDamage: 13, armor: 2, speed: 7.2, attackInterval: 1.1, aggroRadius: 26, levelRange: [4, 17], packSize: [1, 2],
    abilities: [{ type: 'charge', cooldown: 8, power: 1.5, range: 9, bleed: 4 }],
    loot: { coins: [3, 9], items: BANDIT_LOOT, gearChance: 0.03 }, xp: 1, scale: 0.95,
  }),
  bandit({
    id: 'bandit_looter', name: 'Мародёр', variant: 'looter', role: 'looter', flees: true,
    baseHp: 100, baseDamage: 10, armor: 2, speed: 6.6, aggroRadius: 30, leashRadius: 120, levelRange: [4, 17], packSize: [1, 2],
    abilities: [{ type: 'steal', cooldown: 6, amount: 1, channel: 3, target: 'wagon' }],
    loot: { coins: [5, 12], items: [...BANDIT_LOOT, ['fieldnote', 0.05, 1, 1]], gearChance: 0.02 }, xp: 0.9,
  }),
  bandit({
    id: 'deserter', name: 'Дезертир', variant: 'deserter', role: 'shield',
    baseHp: 165, baseDamage: 16, armor: 14, speed: 5.2, levelRange: [7, 15], blockChance: 0.3,
    biomes: ['mountain', 'highland', 'steppe'],
    abilities: [{ type: 'heavy', cooldown: 10, power: 1.7, windup: 0.8, knockback: 2, stun: 1 }],
    loot: { coins: [5, 12], items: [...BANDIT_LOOT, ['ration', 0.2, 1, 1]], gearChance: 0.05 }, xp: 1.4,
  }),
  bandit({
    id: 'deserter_crossbow', name: 'Дезертир-арбалетчик', variant: 'crossbow', role: 'kiter',
    baseHp: 100, baseDamage: 22, armor: 8, speed: 5, attackRange: 22, attackInterval: 2.8, aggroRadius: 26, levelRange: [7, 15],
    biomes: ['mountain', 'highland', 'steppe'],
    ranged: { projectileSpeed: 60, keepDistance: 14 },
    abilities: [{ type: 'volley', cooldown: 14, shots: 3, power: 0.7, interval: 0.4 }],
    loot: { coins: [5, 12], items: [...BANDIT_LOOT, ['arrow', 0.4, 1, 3]], gearChance: 0.05 }, xp: 1.2,
  }),

  // — главари —
  bandit({
    id: 'bandit_chief_kosoy', name: 'Атаман Косой', variant: 'kosoy', role: 'boss', boss: true,
    baseHp: 850, baseDamage: 24, armor: 8, speed: 5.6, attackRange: 2.8, attackInterval: 1.7, aggroRadius: 24, leashRadius: 70,
    levelRange: [5, 6], packSize: [1, 1],
    abilities: [
      { type: 'heavy', cooldown: 8, power: 2.2, windup: 1, knockback: 3 },
      { type: 'howl', cooldown: 25, summon: 'bandit_thug', count: 2, buffDamage: 0.15, duration: 8, atHpBelow: 0.6 },
    ],
    loot: { coins: [70, 110], items: [['banditBadge', 1, 3, 3], ['tonic', 1, 1, 2], ['fieldnote', 1, 1, 1]], uniques: ['kosoyCleaver', 'kosoyFang', 'kosoyPatch'] },
    xp: 8, scale: 1.2,
  }),
  bandit({
    id: 'bandit_chief_sotnik', name: 'Сотник', variant: 'sotnik', role: 'boss', boss: true,
    baseHp: 1100, baseDamage: 26, armor: 20, speed: 5.2, attackRange: 2.6, attackInterval: 1.6, aggroRadius: 24, leashRadius: 70,
    levelRange: [9, 10], packSize: [1, 1], blockChance: 0.35,
    abilities: [
      { type: 'charge', cooldown: 10, power: 1.9, range: 12, stun: 1.5 },
      { type: 'volley', cooldown: 16, shots: 4, power: 0.6, interval: 0.35, by: 'deserter_crossbow' },
      { type: 'howl', cooldown: 30, summon: 'deserter', count: 2, buffDamage: 0.2, duration: 10, atHpBelow: 0.5 },
    ],
    loot: { coins: [140, 200], items: [['banditBadge', 1, 5, 5], ['fieldkit', 1, 1, 1], ['fieldnote', 1, 1, 2]], uniques: ['sotnikSabre', 'sotnikArbalest', 'sotnikShield', 'sotnikMedal'] },
    xp: 9, scale: 1.2,
  }),
  bandit({
    id: 'bandit_chief_raven', name: 'Ворон', variant: 'raven', role: 'boss', boss: true,
    baseHp: 1000, baseDamage: 28, armor: 12, speed: 6.6, attackRange: 2.6, attackInterval: 1.2, aggroRadius: 28, leashRadius: 80,
    levelRange: [16, 17], packSize: [1, 1],
    ranged: { projectileSpeed: 55, keepDistance: 0, swapBelowHp: 0.5 },
    abilities: [
      { type: 'volley', cooldown: 12, shots: 5, power: 0.6, interval: 0.25 },
      { type: 'charge', cooldown: 8, power: 1.8, range: 12, bleed: 6 },
      { type: 'poison', cooldown: 14, duration: 8, value: 0.2 },
    ],
    loot: { coins: [240, 340], items: [['banditBadge', 1, 8, 8], ['lunarElixir', 1, 1, 1], ['pearls', 1, 1, 2]], uniques: ['ravenBow', 'ravenTalon', 'ravenCloak'] },
    xp: 10, scale: 1.15,
  }),

  // — союзники —
  {
    id: 'guard', name: 'Стражник', model: 'humanoid', variant: 'guard', family: 'guard', aggressive: false,
    baseHp: 220, baseDamage: 20, armor: 16, speed: 5.4, attackRange: 2.4, attackInterval: 1.5, aggroRadius: 22, leashRadius: 50,
    levelRange: [5, 20], biomes: [], packSize: [1, 2],
    loot: { coins: [0, 0], items: [] }, xp: 0, scale: 1,
  },
  {
    id: 'merc', name: 'Наёмник', model: 'humanoid', variant: 'merc', family: 'guard', aggressive: false,
    baseHp: 180, baseDamage: 18, armor: 10, speed: 5.6, attackRange: 2.4, attackInterval: 1.4, aggroRadius: 22, leashRadius: 40,
    levelRange: [3, 18], biomes: [], packSize: [1, 1],
    loot: { coins: [0, 0], items: [] }, xp: 0, scale: 1,
  },
];

/** Every creature by id. */
export const CREATURES = Object.fromEntries(LIST.map(def => [def.id, def]));

export const CREATURE_IDS = LIST.map(def => def.id);

/** Creature definition or null. */
export const creature = id => CREATURES[id] || null;

/**
 * Wild creatures that can live in a region: biome matches and level ranges overlap.
 * Bandits are placed by camps and ambushes, so they are excluded unless `includeBandits`.
 */
export function creaturesForRegion(region, { includeBandits = false } = {}) {
  return LIST.filter(def => {
    if (def.family === 'guard' || def.boss) return false;
    if (def.family === 'bandit' && !includeBandits) return false;
    if (!def.biomes.includes(region.biome)) return false;
    return def.levelRange[0] <= region.level[1] && def.levelRange[1] >= region.level[0];
  });
}
