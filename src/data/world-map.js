// Static geography of the world. Pure data — no DOM, no three.
// Axes: +x = east, +z = south, +y = up. Units are metres.

export const WORLD = {
  half: 3000,          // playable square is [-half, half]
  seaLevel: 0,         // global water plane; anything below is water
  seed: 20261,
};

/**
 * Cities. `key` is the stable id used everywhere (saves, npc ids, quests).
 * `gates` are points on the wall where roads enter; `style` drives architecture.
 */
export const CITIES = [
  {
    id: 0, key: 'valley', name: 'Тихая долина', x: 0, z: 0, y: 14, radius: 105,
    style: 'timber', color: '#c9b37a',
    desc: 'Пашни, мельницы и первые мастерские. Отсюда начинается торговое кольцо.',
    gates: [{ id: 'east', x: 105, z: 0 }, { id: 'south', x: 0, z: 105 }, { id: 'west', x: -105, z: 0 }, { id: 'north', x: 0, z: -105 }],
  },
  {
    id: 1, key: 'ford', name: 'Каменный Брод', x: 1500, z: -950, y: 62, radius: 115,
    style: 'stone', color: '#a9b8c4',
    desc: 'Горняцкий город у переправы. Руда, уголь и суровые люди.',
    gates: [{ id: 'west', x: 1385, z: -950 }, { id: 'south', x: 1500, z: -835 }, { id: 'north', x: 1500, z: -1065 }],
  },
  {
    id: 2, key: 'harbor', name: 'Янтарная Гавань', x: 1900, z: 1400, y: 5, radius: 125,
    style: 'harbor', color: '#dcae72',
    desc: 'Богатый порт на янтарном берегу. Здесь сходятся все товары мира.',
    gates: [{ id: 'north', x: 1900, z: 1275 }, { id: 'west', x: 1775, z: 1400 }],
  },
];

/** Roles of named NPCs present in EVERY city. npcId = `${city.key}:${role}`. */
export const NPC_ROLES = [
  'quartermaster', // интендант — караваны, грузовая ведомость
  'elder',         // староста / бургомистр — сюжет города
  'captain',       // капитан стражи — наём охраны, награды за головы
  'innkeeper',     // трактирщик — отдых, слухи, еда
  'stablemaster',  // конюх — лошадь, улучшения телеги
  'trainer',       // боевой наставник — ранги умений
  'weaponsmith',   // оружейник (лавка)
  'armorer',       // бронник (лавка)
  'grocer',        // лавочник — расходники, инструменты
  'trader',        // купец — торговые товары (арбитраж между городами)
  'banker',        // хранитель склада — личное хранилище
  // мастера профессий
  'apothecary', 'smith', 'carpenter', 'leatherworker', 'farmer', 'tailor', 'mason',
];

/**
 * Caravan legs. The trade ring: valley -> ford -> harbor -> valley.
 * `path` are control points (smoothed by terrain.js into the actual road).
 */
export const LEGS = [
  {
    id: 0, key: 'forest-road', name: 'Лесной тракт', from: 0, to: 1,
    path: [[105, 0], [260, -90], [480, -330], [760, -520], [1000, -700], [1200, -860], [1300, -935], [1385, -950]],
  },
  {
    id: 1, key: 'eagle-pass', name: 'Орлиный перевал', from: 1, to: 2,
    path: [[1500, -835], [1560, -650], [1700, -380], [1850, -120], [1980, 150], [2100, 450], [2150, 800], [2050, 1100], [1930, 1250], [1900, 1275]],
  },
  {
    id: 2, key: 'old-south-road', name: 'Старая южная дорога', from: 2, to: 0,
    path: [[1775, 1400], [1550, 1480], [1250, 1560], [950, 1520], [650, 1420], [380, 1300], [150, 1050], [20, 750], [0, 420], [0, 105]],
  },
];

/** Side roads (not caravan routes) — spur tracks to settlements. */
export const SIDE_ROADS = [
  { key: 'mill-track', path: [[-105, 0], [-200, 120], [-300, 300]] },
  { key: 'sawmill-track', path: [[0, -105], [-120, -230], [-250, -350]] },
  { key: 'farm-track', path: [[-300, 300], [-520, 240], [-700, 150]] },
  { key: 'mine-track', path: [[1500, -1065], [1620, -1140], [1750, -1200]] },
  { key: 'fisher-track', path: [[2050, 1100], [2180, 1120], [2250, 1150]] },
];

/** The river: control points with water-surface height. Flows north -> south-east into the sea. */
export const RIVER = {
  name: 'Быстрица', width: 16, depth: 2.6,
  path: [
    [1750, -2600, 130], [1500, -1700, 95], [1370, -1100, 60], [1330, -850, 56], [1050, -560, 38],
    [560, -260, 20], [380, 150, 11], [520, 700, 7], [900, 1500, 1.5], [1250, 2000, 0],
  ],
};

/**
 * Regions. Terrain macro-shape is a smooth blend of the nearest regions:
 * elev = base elevation, rough = noise amplitude, ridged = mountain crests.
 * biome ∈ meadow | farmland | forest | darkforest | highland | mountain | snow | steppe | coast | swamp | heath | lake
 * level = [min,max] level of wild creatures.
 */
export const REGIONS = [
  { id: 'valley',     name: 'Тихая долина',        biome: 'meadow',     x: 0,     z: 0,     level: [1, 2],   elev: 14,  rough: 4 },
  { id: 'fields',     name: 'Пригородные поля',    biome: 'farmland',   x: -380,  z: 260,   level: [1, 3],   elev: 13,  rough: 3 },
  { id: 'boarwood',   name: 'Кабаний лог',         biome: 'forest',     x: -520,  z: -480,  level: [2, 4],   elev: 20,  rough: 10 },
  { id: 'southmead',  name: 'Южные луга',          biome: 'meadow',     x: -80,   z: 640,   level: [3, 5],   elev: 15,  rough: 7 },
  { id: 'oldwood',    name: 'Старый бор',          biome: 'forest',     x: 620,   z: -520,  level: [2, 5],   elev: 26,  rough: 12 },
  { id: 'wolfglen',   name: 'Волчья падь',         biome: 'darkforest', x: 1020,  z: -220,  level: [4, 6],   elev: 34,  rough: 16 },
  { id: 'orehills',   name: 'Рудные холмы',        biome: 'highland',   x: 1120,  z: -1050, level: [4, 7],   elev: 62,  rough: 24 },
  { id: 'fordlands',  name: 'Предместья Брода',    biome: 'highland',   x: 1500,  z: -950,  level: [5, 7],   elev: 62,  rough: 9 },
  { id: 'northridge', name: 'Северное нагорье',    biome: 'mountain',   x: 520,   z: -1850, level: [8, 12],  elev: 150, rough: 95, ridged: true },
  { id: 'icepeaks',   name: 'Ледяные пики',        biome: 'snow',       x: 2000,  z: -2050, level: [12, 16], elev: 230, rough: 130, ridged: true },
  { id: 'eaglepass',  name: 'Орлиный перевал',     biome: 'mountain',   x: 1900,  z: -150,  level: [7, 10],  elev: 105, rough: 60, ridged: true },
  { id: 'drydale',    name: 'Сухой дол',           biome: 'steppe',     x: 2400,  z: 520,   level: [8, 11],  elev: 42,  rough: 13 },
  { id: 'ambercoast', name: 'Янтарный берег',      biome: 'coast',      x: 1900,  z: 1400,  level: [9, 12],  elev: 7,   rough: 5 },
  { id: 'rotmarsh',   name: 'Гнилые топи',         biome: 'swamp',      x: 1100,  z: 1520,  level: [11, 14], elev: 1.0, rough: 2.4 },
  { id: 'banditwood', name: 'Разбойничий лес',     biome: 'darkforest', x: 330,   z: 1320,  level: [13, 16], elev: 22,  rough: 14 },
  { id: 'heath',      name: 'Вересковая пустошь',  biome: 'heath',      x: -900,  z: 950,   level: [10, 14], elev: 30,  rough: 12 },
  { id: 'mirrorlake', name: 'Зеркальное озеро',    biome: 'lake',       x: -1550, z: 1650,  level: [14, 17], elev: -5,  rough: 2 },
  { id: 'lakeshore',  name: 'Озёрный край',        biome: 'forest',     x: -2100, z: 2200,  level: [15, 18], elev: 16,  rough: 10 },
  { id: 'westridge',  name: 'Западные кряжи',      biome: 'mountain',   x: -1950, z: -250,  level: [14, 18], elev: 135, rough: 85, ridged: true },
  { id: 'gloomwood',  name: 'Сумрачная чаща',      biome: 'darkforest', x: -1050, z: -1250, level: [15, 20], elev: 36,  rough: 18 },
  { id: 'mistplateau', name: 'Туманное плато',     biome: 'highland',   x: -2200, z: -2100, level: [18, 20], elev: 120, rough: 30 },
  { id: 'saltflats',  name: 'Солёные отмели',      biome: 'coast',      x: 2550,  z: 1250,  level: [10, 13], elev: 5,   rough: 4 },
  { id: 'southshore', name: 'Дальний берег',       biome: 'coast',      x: 300,   z: 2400,  level: [16, 19], elev: 10,  rough: 8 },
  { id: 'redcliffs',  name: 'Красные утёсы',       biome: 'steppe',     x: 2600,  z: -900,  level: [11, 14], elev: 85,  rough: 40, ridged: true },
];

/**
 * Points of interest. Terrain is flattened around each (radius `r`).
 * type ∈ banditcamp | ruin | mine | camp | farm | lair | landmark | outpost | village
 * `faction`: 'bandit' | 'beast' | 'friendly' | 'none'
 */
export const POIS = [
  // — разбойничьи лагеря (зачистка ослабляет засады на соответствующем этапе) —
  { id: 'camp-kosoy',     type: 'banditcamp', name: 'Лагерь Косого',          x: 830,  z: -280,  r: 34, level: 4,  faction: 'bandit', chest: true, leg: 0, boss: 'bandit_chief_kosoy' },
  { id: 'camp-deserters', type: 'banditcamp', name: 'Застава дезертиров',     x: 1730, z: 30,    r: 36, level: 8,  faction: 'bandit', chest: true, leg: 1, boss: 'bandit_chief_sotnik' },
  { id: 'camp-drydale',   type: 'banditcamp', name: 'Логово Сухого дола',     x: 2360, z: 660,   r: 34, level: 10, faction: 'bandit', chest: true, leg: 1 },
  { id: 'camp-marsh',     type: 'banditcamp', name: 'Топяное гнездо',         x: 1210, z: 1760,  r: 32, level: 12, faction: 'bandit', chest: true, leg: 2 },
  { id: 'fort-raven',     type: 'banditcamp', name: 'Форт Вороньё',           x: 440,  z: 1520,  r: 46, level: 15, faction: 'bandit', chest: true, leg: 2, boss: 'bandit_chief_raven' },
  // — руины и ориентиры —
  { id: 'ruin-watchtower', type: 'ruin',     name: 'Старая сторожевая башня', x: 400,  z: -540,  r: 24, level: 3,  faction: 'none', chest: true },
  { id: 'ruin-outpost',    type: 'ruin',     name: 'Руины заставы',           x: 2020, z: -470,  r: 28, level: 8,  faction: 'beast', chest: true },
  { id: 'ruin-manor',      type: 'ruin',     name: 'Затопленная усадьба',     x: 1040, z: 1340,  r: 30, level: 12, faction: 'beast', chest: true },
  { id: 'ruin-bridgefort', type: 'ruin',     name: 'Мостовая крепостца',      x: 760,  z: 1340,  r: 24, level: 13, faction: 'bandit', chest: true },
  { id: 'lm-patriarch',    type: 'landmark', name: 'Дуб-патриарх',            x: -1100, z: -1300, r: 26, level: 16, faction: 'none', chest: true },
  { id: 'lm-lighthouse',   type: 'landmark', name: 'Янтарный маяк',           x: 2085, z: 1375,  r: 18, level: 9,  faction: 'friendly' },
  { id: 'lm-stones',       type: 'landmark', name: 'Межевые камни',           x: -820, z: 880,   r: 22, level: 11, faction: 'none', chest: true },
  { id: 'lm-eaglerock',    type: 'landmark', name: 'Орлиная скала',           x: 1960, z: -40,   r: 18, level: 9,  faction: 'none' },
  // — рудники —
  { id: 'mine-old',        type: 'mine',     name: 'Заброшенная штольня',     x: 1230, z: -1260, r: 26, level: 6,  faction: 'beast', chest: true },
  { id: 'mine-copper',     type: 'mine',     name: 'Медный рудник',           x: 1750, z: -1200, r: 30, level: 6,  faction: 'friendly' },
  { id: 'mine-cobalt',     type: 'mine',     name: 'Кобальтовый разрез',      x: 2520, z: -820,  r: 28, level: 12, faction: 'beast', chest: true },
  // — мирные стоянки и хозяйства —
  { id: 'sawmill',         type: 'camp',     name: 'Лесопилка',               x: -250, z: -350,  r: 30, level: 1,  faction: 'friendly' },
  { id: 'mill',            type: 'farm',     name: 'Мельница',                x: -300, z: 300,   r: 30, level: 1,  faction: 'friendly' },
  { id: 'far-farm',        type: 'farm',     name: 'Хутор Дальний',           x: -700, z: 150,   r: 34, level: 2,  faction: 'friendly' },
  { id: 'apiary',          type: 'farm',     name: 'Пасека',                  x: 210,  z: 480,   r: 22, level: 2,  faction: 'friendly' },
  { id: 'hunter-lodge',    type: 'camp',     name: 'Охотничья заимка',        x: 700,  z: -720,  r: 24, level: 3,  faction: 'friendly' },
  { id: 'charcoal-camp',   type: 'camp',     name: 'Лагерь углежогов',        x: 900,  z: -1150, r: 24, level: 5,  faction: 'friendly' },
  { id: 'fisher-village',  type: 'village',  name: 'Рыбацкая деревня',        x: 2250, z: 1150,  r: 40, level: 9,  faction: 'friendly' },
  { id: 'post-forest',     type: 'outpost',  name: 'Пост дорожной стражи',    x: 1010, z: -735,  r: 20, level: 4,  faction: 'friendly' },
  { id: 'post-drydale',    type: 'outpost',  name: 'Застава у Сухого дола',   x: 2135, z: 560,   r: 20, level: 9,  faction: 'friendly' },
  { id: 'post-south',      type: 'outpost',  name: 'Южный дозор',             x: 40,   z: 560,   r: 20, level: 4,  faction: 'friendly' },
  // — логова зверей и чудовищ —
  { id: 'lair-wolf',       type: 'lair',     name: 'Волчье логово',           x: 1060, z: -140,  r: 24, level: 5,  faction: 'beast', chest: true, creature: 'alpha_wolf' },
  { id: 'lair-bear',       type: 'lair',     name: 'Медвежья берлога',        x: 1320, z: -330,  r: 22, level: 7,  faction: 'beast', chest: true, creature: 'bear' },
  { id: 'lair-stoneback',  type: 'lair',     name: 'Логово камнеспина',       x: 600,  z: -1700, r: 26, level: 11, faction: 'beast', chest: true, creature: 'stoneback' },
  { id: 'lair-spider',     type: 'lair',     name: 'Паучий овраг',            x: -900, z: -1000, r: 28, level: 16, faction: 'beast', chest: true, creature: 'giant_spider' },
  { id: 'lair-marsh',      type: 'lair',     name: 'Омут топляка',            x: 1320, z: 1420,  r: 24, level: 13, faction: 'beast', chest: true, creature: 'marsh_lurker' },
  { id: 'lair-frost',      type: 'lair',     name: 'Ледяной грот',            x: 1800, z: -1900, r: 24, level: 14, faction: 'beast', chest: true, creature: 'frost_wolf' },
];

export const cityByKey = key => CITIES.find(c => c.key === key) || null;
export const poiById = id => POIS.find(p => p.id === id) || null;
