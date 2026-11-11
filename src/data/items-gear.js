// Gear catalog: weapons, armour sets, shields, cloaks, trinkets, bags and tools. Pure data.
// Nothing is registered here — items-catalog.js collects GEAR_ITEMS and registers them.
//
// Extra gear fields used by sim/stats.js and sim/equipment.js:
//   stats   — flat bonuses added to derived stats: { maxHp, maxStamina, attack, armor, critChance,
//             moveSpeed, healPower, gatherSpeed, priceBonus, staminaRegen }
//   classes — list of classes allowed to equip (absent = everyone)
//   unique  — true for named boss/lair drops (never sold in shops)
//   tool    — { skills:[gathering skill ids], tier, speed } for gathering tools

/** Required hero level of weapon tiers 1..6. */
export const WEAPON_TIER_LEVEL = [1, 4, 8, 12, 16, 19];
/** Damage of weapon tiers 1..6. */
export const WEAPON_TIER_DAMAGE = [6, 11, 18, 26, 35, 44];
const WEAPON_TIER_VALUE = [20, 95, 270, 620, 1300, 2500];
const WEAPON_TIER_RARITY = ['common', 'common', 'fine', 'fine', 'rare', 'epic'];

/** Required hero level of armour tiers 1..5. */
export const ARMOR_TIER_LEVEL = [1, 5, 9, 13, 17];
const ARMOR_TIER_RARITY = ['common', 'common', 'fine', 'rare', 'epic'];
/** Whole-set numbers per tier for the heavy weight; lighter weights scale them down. */
const SET_ARMOR = [12, 36, 66, 102, 140];
const SET_VALUE = [150, 420, 1000, 2100, 4200];

export const ARMOR_SLOTS = ['armor', 'helmet', 'gloves', 'boots'];
/** Share of the set numbers carried by each slot. */
const SLOT_SHARE = { armor: 0.4, helmet: 0.2, gloves: 0.2, boots: 0.2 };
const SLOT_ICON = { armor: 'armor', helmet: 'helmet', gloves: 'gloves', boots: 'boots' };

export const ARMOR_WEIGHTS = {
  light: {
    name: 'Лёгкая',
    armorFactor: 0.42,
    valueFactor: 0.7,
    classes: null,
    setHp: [0, 15, 30, 45, 60],
    setBonus: { stat: 'maxStamina', values: [10, 20, 30, 40, 50] },
  },
  medium: {
    name: 'Средняя',
    armorFactor: 0.68,
    valueFactor: 0.85,
    classes: ['warrior', 'guardian', 'duelist', 'archer', 'engineer', 'medic'],
    setHp: [10, 30, 55, 80, 110],
    setBonus: { stat: 'critChance', values: [0.01, 0.02, 0.03, 0.04, 0.05] },
  },
  heavy: {
    name: 'Тяжёлая',
    armorFactor: 1,
    valueFactor: 1,
    classes: ['warrior', 'guardian'],
    setHp: [20, 50, 90, 130, 180],
    setBonus: null,
  },
};

/**
 * Armour sets: weight × tier. `ids` are stable item ids per slot, `names` the display names.
 */
export const ARMOR_SETS = [
  {
    key: 'light1', weight: 'light', tier: 1,
    desc: 'Простая суконная одежда путника: не стесняет движений, но и защищает едва-едва.',
    ids: { armor: 'paddedVest', helmet: 'clothCap', gloves: 'clothMitts', boots: 'clothShoes' },
    names: { armor: 'Стёганый жилет', helmet: 'Суконная шапка', gloves: 'Суконные рукавицы', boots: 'Мягкие башмаки' },
  },
  {
    key: 'light2', weight: 'light', tier: 2,
    desc: 'Плотная стёжка в несколько слоёв парусины гасит скользящие удары.',
    ids: { armor: 'paddedCoat', helmet: 'paddedHood', gloves: 'paddedGloves', boots: 'paddedBoots' },
    names: { armor: 'Стёганая куртка', helmet: 'Стёганый капюшон', gloves: 'Стёганые перчатки', boots: 'Стёганые сапоги' },
  },
  {
    key: 'light3', weight: 'light', tier: 3,
    desc: 'Полевая одежда из лугового волокна: лёгкая, прочная, со множеством карманов.',
    ids: { armor: 'fieldRobe', helmet: 'fieldHood', gloves: 'fieldGloves', boots: 'fieldBoots' },
    names: { armor: 'Полевой кафтан', helmet: 'Полевой капюшон', gloves: 'Полевые перчатки', boots: 'Полевые сапоги' },
  },
  {
    key: 'light4', weight: 'light', tier: 4,
    desc: 'Гильдейский крой с кожаными вставками — одежда мастеров, много времени проводящих в дороге.',
    ids: { armor: 'guildRobe', helmet: 'guildHood', gloves: 'guildGloves', boots: 'guildBoots' },
    names: { armor: 'Гильдейский кафтан', helmet: 'Гильдейский капюшон', gloves: 'Гильдейские перчатки', boots: 'Гильдейские сапоги' },
  },
  {
    key: 'light5', weight: 'light', tier: 5,
    desc: 'Звёздная ткань тонка как шёлк и держит удар не хуже дублёной кожи.',
    ids: { armor: 'starRobe', helmet: 'starHood', gloves: 'starGloves', boots: 'starBoots' },
    names: { armor: 'Кафтан звёздного пути', helmet: 'Капюшон звёздного пути', gloves: 'Перчатки звёздного пути', boots: 'Сапоги звёздного пути' },
  },
  {
    key: 'medium1', weight: 'medium', tier: 1,
    desc: 'Добротная рабочая кожа: в такой ходят лесорубы, возчики и начинающие искатели удачи.',
    ids: { armor: 'vest', helmet: 'leatherCap', gloves: 'gloves', boots: 'walkingBoots' },
    names: { armor: 'Кожаный жилет', helmet: 'Кожаный шлем', gloves: 'Рабочие перчатки', boots: 'Походные сапоги' },
  },
  {
    key: 'medium2', weight: 'medium', tier: 2,
    desc: 'Охотничья кожа с плотными накладками на плечах и предплечьях.',
    ids: { armor: 'hunterJacket', helmet: 'hunterHood', gloves: 'hunterGloves', boots: 'hunterBoots' },
    names: { armor: 'Куртка охотника', helmet: 'Капюшон охотника', gloves: 'Перчатки охотника', boots: 'Сапоги охотника' },
  },
  {
    key: 'medium3', weight: 'medium', tier: 3,
    desc: 'Укреплённая кожа следопытов: тихая в лесу и надёжная в драке.',
    ids: { armor: 'rangerArmor', helmet: 'rangerHelm', gloves: 'rangerGloves', boots: 'rangerBoots' },
    names: { armor: 'Доспех следопыта', helmet: 'Шлем следопыта', gloves: 'Перчатки следопыта', boots: 'Сапоги следопыта' },
  },
  {
    key: 'medium4', weight: 'medium', tier: 4,
    desc: 'Снаряжение егерей из шкур матёрого зверя, проклёпанное на груди и спине.',
    ids: { armor: 'wardenArmor', helmet: 'wardenHelm', gloves: 'wardenGloves', boots: 'wardenBoots' },
    names: { armor: 'Доспех егеря', helmet: 'Шлем егеря', gloves: 'Перчатки егеря', boots: 'Сапоги егеря' },
  },
  {
    key: 'medium5', weight: 'medium', tier: 5,
    desc: 'Кожа древнего зверя — лучшее, что носят проводники караванов на всём кольце.',
    ids: { armor: 'caravanArmor', helmet: 'caravanHelm', gloves: 'caravanGloves', boots: 'caravanBoots' },
    names: { armor: 'Доспех проводника', helmet: 'Шлем проводника', gloves: 'Перчатки проводника', boots: 'Сапоги проводника' },
  },
  {
    key: 'heavy1', weight: 'heavy', tier: 1,
    desc: 'Клёпаное снаряжение городского ополчения: грубое, тяжёлое, зато дешёвое.',
    ids: { armor: 'militiaCoat', helmet: 'militiaHelm', gloves: 'militiaGloves', boots: 'militiaBoots' },
    names: { armor: 'Клёпаная куртка ополченца', helmet: 'Шапель ополченца', gloves: 'Рукавицы ополченца', boots: 'Башмаки ополченца' },
  },
  {
    key: 'heavy2', weight: 'heavy', tier: 2,
    desc: 'Кольчужное плетение на кожаной основе держит и клинок, и клыки.',
    ids: { armor: 'mailCoat', helmet: 'ironHelm', gloves: 'mailGloves', boots: 'mailBoots' },
    names: { armor: 'Кольчужная куртка', helmet: 'Железный шлем', gloves: 'Кольчужные рукавицы', boots: 'Кольчужные сапоги' },
  },
  {
    key: 'heavy3', weight: 'heavy', tier: 3,
    desc: 'Стальные пластины латника — работа кузнецов Каменного Брода.',
    ids: { armor: 'plateCoat', helmet: 'plateHelm', gloves: 'plateGloves', boots: 'plateBoots' },
    names: { armor: 'Кираса латника', helmet: 'Шлем латника', gloves: 'Наручи латника', boots: 'Поножи латника' },
  },
  {
    key: 'heavy4', weight: 'heavy', tier: 4,
    desc: 'Доспех ветеранов дорожной стражи из кобальтовой стали, проверенный не одним походом.',
    ids: { armor: 'veteranCoat', helmet: 'steelHelm', gloves: 'veteranGauntlets', boots: 'veteranBoots' },
    names: { armor: 'Бригантина ветерана', helmet: 'Стальной шлем', gloves: 'Латные перчатки ветерана', boots: 'Сапоги ветерана' },
  },
  {
    key: 'heavy5', weight: 'heavy', tier: 5,
    desc: 'Мифриловый панцирь рубежа: лёгок для своего веса и почти не знает износа.',
    ids: { armor: 'frontierCoat', helmet: 'frontierHelm', gloves: 'frontierGauntlets', boots: 'frontierBoots' },
    names: { armor: 'Панцирь рубежа', helmet: 'Шлем рубежа', gloves: 'Латные перчатки рубежа', boots: 'Сапоги рубежа' },
  },
];

function buildArmorPiece(set, slot) {
  const weight = ARMOR_WEIGHTS[set.weight];
  const share = SLOT_SHARE[slot];
  const tierIndex = set.tier - 1;
  const stats = {};
  const hp = Math.round(weight.setHp[tierIndex] * share);
  if (hp > 0) stats.maxHp = hp;
  if (weight.setBonus) {
    const raw = weight.setBonus.values[tierIndex] * share;
    stats[weight.setBonus.stat] = weight.setBonus.stat === 'critChance' ? Math.round(raw * 1000) / 1000 : Math.round(raw);
  }
  const piece = {
    name: set.names[slot],
    type: 'armor',
    slot,
    icon: SLOT_ICON[slot],
    rarity: ARMOR_TIER_RARITY[tierIndex],
    tier: set.tier,
    cat: 'armor',
    weight: set.weight,
    set: set.key,
    armor: Math.max(1, Math.round(SET_ARMOR[tierIndex] * weight.armorFactor * share)),
    requiredLevel: ARMOR_TIER_LEVEL[tierIndex],
    value: Math.round(SET_VALUE[tierIndex] * weight.valueFactor * share),
    stats,
    desc: set.desc,
  };
  if (weight.classes) piece.classes = weight.classes;
  return piece;
}

function buildArmorSets() {
  const items = {};
  for (const set of ARMOR_SETS) {
    for (const slot of ARMOR_SLOTS) items[set.ids[slot]] = buildArmorPiece(set, slot);
  }
  return items;
}

/**
 * Weapon lines: one per class, six tiers each. Rows are [id, name, desc] in tier order.
 */
export const WEAPON_LINES = [
  {
    classId: 'warrior', weaponKind: 'greatsword', icon: 'greatsword',
    rows: [
      ['ironClaymore', 'Старый двуручник', 'Зазубренный, но тяжёлый — для первых стычек хватит.'],
      ['soldierClaymore', 'Солдатский двуручник', 'Простой железный клинок на длинной рукояти.'],
      ['steelClaymore', 'Стальной двуручник', 'Сталь Каменного Брода держит заточку и в долгом бою.'],
      ['cobaltClaymore', 'Кобальтовый двуручник', 'Синеватая сталь с кобальтом рубит кольчугу как холст.'],
      ['mithrilClaymore', 'Мифриловый двуручник', 'Широкий клинок из мифрилового сплава — оружие мастеров.'],
      ['frontierClaymore', 'Двуручник рубежа', 'Меч командиров дальних застав; таких куют единицы.'],
    ],
  },
  {
    classId: 'guardian', weaponKind: 'sword', icon: 'sword',
    rows: [
      ['trainingBlade', 'Походный клинок', 'Короткий меч ополченца, знавший лучшие времена.'],
      ['sword', 'Одноручный меч', 'Надёжный железный меч под щит.'],
      ['steelBlade', 'Стальной клинок', 'Хорошо уравновешенный стальной меч.'],
      ['masterBlade', 'Клинок мастера', 'Кобальтовая сталь и рука настоящего мастера.'],
      ['mithrilBlade', 'Клинок караванного стража', 'Мифриловый меч тех, кто водит караваны через всё кольцо.'],
      ['frontierBlade', 'Клинок рубежа', 'Парадное и боевое оружие командиров пограничной стражи.'],
    ],
  },
  {
    classId: 'duelist', weaponKind: 'blades', icon: 'blades',
    rows: [
      ['pairedKnives', 'Пара длинных ножей', 'Два тесака, с которых начинает любой дуэлянт.'],
      ['ironTwins', 'Железные близнецы', 'Парные клинки одинакового веса и длины.'],
      ['steelTwins', 'Стальные близнецы', 'Узкие стальные клинки для быстрых серий.'],
      ['cobaltTwins', 'Кобальтовые близнецы', 'Лёгкие и злые — пара, которая не прощает ошибок.'],
      ['mithrilTwins', 'Мифриловые близнецы', 'Клинки почти не весят, а режут как бритва.'],
      ['frontierTwins', 'Близнецы рубежа', 'Легендарная пара фехтмейстеров Янтарной Гавани.'],
    ],
  },
  {
    classId: 'archer', weaponKind: 'bow', icon: 'bow',
    rows: [
      ['bow', 'Простой лук', 'Гнутая палка и тетива — но стрелу посылает исправно.'],
      ['huntBow', 'Охотничий лук', 'Клеёный лук из твёрдой древесины.'],
      ['longbow', 'Дальний лук', 'Длинные плечи бьют далеко и тяжело.'],
      ['masterBow', 'Составной лук', 'Выдержанная древесина, склеенная в несколько слоёв.'],
      ['ironwoodBow', 'Лук железного дерева', 'Тугой как стальная пружина — не каждому по руке.'],
      ['frontierBow', 'Лук рубежа', 'Оружие лучших стрелков дозора.'],
    ],
  },
  {
    classId: 'engineer', weaponKind: 'crossbow', icon: 'crossbow',
    rows: [
      ['handCrossbow', 'Ручной самострел', 'Простой арбалет с деревянной дугой.'],
      ['lightCrossbow', 'Лёгкий арбалет', 'Механизм взвода ускоряет перезарядку.'],
      ['steelCrossbow', 'Стальной арбалет', 'Стальная дуга пробивает щит на двадцати шагах.'],
      ['repeaterCrossbow', 'Болтомёт', 'Магазин на шесть болтов и рычажный взвод.'],
      ['ironwoodCrossbow', 'Болтомёт железного дерева', 'Ложе из железного дерева гасит отдачу тяжёлой дуги.'],
      ['frontierCrossbow', 'Болтомёт рубежа', 'Вершина механики: точен, скор и безотказен.'],
    ],
  },
  {
    classId: 'scientist', weaponKind: 'device', icon: 'device',
    rows: [
      ['fieldEmitter', 'Учебный излучатель', 'Университетский прибор для полевых опытов.'],
      ['copperEmitter', 'Медный излучатель', 'Медные катушки дают устойчивый разряд.'],
      ['lensEmitter', 'Линзовый излучатель', 'Система линз собирает импульс в узкий пучок.'],
      ['cobaltEmitter', 'Кобальтовый излучатель', 'Кобальтовый сердечник выдерживает долгую работу на пределе.'],
      ['mithrilEmitter', 'Мифриловый излучатель', 'Мифриловые обмотки почти не греются.'],
      ['frontierEmitter', 'Излучатель рубежа', 'Штучный прибор, собранный для экспедиций на край карты.'],
    ],
  },
  {
    classId: 'medic', weaponKind: 'medkit', icon: 'kit',
    rows: [
      ['fieldSatchel', 'Сумка санитара', 'Трубка для дротиков, жгуты и пара склянок.'],
      ['herbalistKit', 'Набор травника', 'Удобная раскладка инструментов и запас дротиков.'],
      ['surgeonKit', 'Набор хирурга', 'Точные инструменты и сильные составы.'],
      ['masterKit', 'Набор мастера-лекаря', 'Всё лучшее из аптек Каменного Брода в одной сумке.'],
      ['lunarKit', 'Лунный набор', 'Дротики с лунным экстрактом и тончайшие инструменты.'],
      ['frontierKit', 'Набор рубежа', 'Снаряжение старших лекарей пограничных госпиталей.'],
    ],
  },
];

function buildWeaponLines() {
  const items = {};
  for (const line of WEAPON_LINES) {
    line.rows.forEach(([id, name, desc], index) => {
      items[id] = {
        name,
        type: 'weapon',
        slot: 'weapon',
        icon: line.icon,
        rarity: WEAPON_TIER_RARITY[index],
        tier: index + 1,
        cat: 'weapon',
        weaponKind: line.weaponKind,
        classes: [line.classId],
        damage: WEAPON_TIER_DAMAGE[index],
        requiredLevel: WEAPON_TIER_LEVEL[index],
        value: WEAPON_TIER_VALUE[index],
        desc,
      };
    });
  }
  return items;
}

const weapon = (name, classId, weaponKind, icon, rarity, tier, requiredLevel, damage, value, stats, desc) => ({
  name, type: 'weapon', slot: 'weapon', icon, rarity, tier, cat: 'weapon',
  weaponKind, classes: [classId], damage, requiredLevel, value, stats, desc,
});

/** Extra and unique named weapons (uniques drop from chiefs and lair beasts). */
const SPECIAL_WEAPONS = {
  veteranBlade: weapon('Клинок ветерана', 'guardian', 'sword', 'sword', 'fine', 4, 12, 27, 700,
    { maxHp: 15 }, 'Казённый меч дорожной стражи: проще клинка мастера, зато с крепкой гардой.'),
  kosoyCleaver: {
    ...weapon('Тесак Косого', 'warrior', 'greatsword', 'greatsword', 'rare', 2, 5, 15, 260,
      { critChance: 0.03 }, 'Широченный тесак атамана с лесного тракта. Говорят, им рубили и дрова, и долги.'),
    unique: true,
  },
  kosoyFang: {
    ...weapon('Клыки Косого', 'duelist', 'blades', 'blades', 'rare', 2, 5, 15, 260,
      { moveSpeed: 0.03 }, 'Пара кривых ножей, которые атаман прятал за голенищами.'),
    unique: true,
  },
  sotnikSabre: {
    ...weapon('Сабля Сотника', 'guardian', 'sword', 'sword', 'epic', 3, 9, 24, 760,
      { armor: 6, maxHp: 20 }, 'Офицерская сабля с клеймом полка, который Сотник предал.'),
    unique: true,
  },
  sotnikArbalest: {
    ...weapon('Полковой арбалет', 'engineer', 'crossbow', 'crossbow', 'epic', 3, 9, 24, 760,
      { critChance: 0.04 }, 'Казённый арбалет тонкой работы, унесённый дезертирами из арсенала.'),
    unique: true,
  },
  ravenBow: {
    ...weapon('Вороново крыло', 'archer', 'bow', 'bow', 'legendary', 5, 15, 41, 2400,
      { critChance: 0.06, moveSpeed: 0.03 }, 'Чёрный лук главаря форта Вороньё. Стрела с него слышна, только когда уже поздно.'),
    unique: true,
  },
  ravenTalon: {
    ...weapon('Коготь Ворона', 'duelist', 'blades', 'blades', 'legendary', 5, 15, 41, 2400,
      { critChance: 0.05, attack: 4 }, 'Парные клинки воронёной стали — трофей из оружейной форта Вороньё.'),
    unique: true,
  },
  stonebackMaul: {
    ...weapon('Панцирный колун', 'warrior', 'greatsword', 'greatsword', 'epic', 4, 11, 30, 1100,
      { armor: 8 }, 'Двуручник с обухом из пластины камнеспина: тяжёл, но проламывает любую защиту.'),
    unique: true,
  },
  frostEmitter: {
    ...weapon('Излучатель «Иней»', 'scientist', 'device', 'device', 'epic', 4, 14, 32, 1400,
      { maxStamina: 20, critChance: 0.03 }, 'Прибор пропавшей экспедиции, найденный в Ледяном гроте. Работает и на лютом морозе.'),
    unique: true,
  },
  lurkerSting: {
    ...weapon('Жало топляка', 'medic', 'medkit', 'kit', 'epic', 4, 13, 31, 1300,
      { healPower: 0.1 }, 'Набор с иглами из шипов топляка: держат остроту лучше стали.'),
    unique: true,
  },
  widowBlades: {
    ...weapon('Жвалы вдовы', 'duelist', 'blades', 'blades', 'epic', 5, 16, 38, 1700,
      { critChance: 0.04 }, 'Парные серпы из жвал паучихи с Паучьего оврага.'),
    unique: true,
  },
  drakeLance: {
    ...weapon('Гребень кряжевого ящера', 'warrior', 'greatsword', 'greatsword', 'epic', 5, 16, 38, 1700,
      { maxHp: 40 }, 'Клинок, выточенный из спинного гребня старого ящера.'),
    unique: true,
  },
};

const armorPiece = (name, slot, icon, rarity, tier, requiredLevel, armor, value, stats, desc, extra = {}) => ({
  name, type: 'armor', slot, icon, rarity, tier, cat: 'armor', armor, requiredLevel, value, stats, desc, ...extra,
});

const GUARDIAN_ONLY = { classes: ['guardian'], weight: 'heavy' };

const SHIELDS = {
  shield: armorPiece('Деревянный щит', 'offhand', 'shield', 'common', 1, 1, 4, 30,
    { blockPower: 0.5 }, 'Сбитые доски с ремнём — первый щит стража.', GUARDIAN_ONLY),
  ironShield: armorPiece('Окованный щит', 'offhand', 'shield', 'common', 2, 5, 10, 130,
    { blockPower: 0.55, maxHp: 10 }, 'Дубовая основа, окованная железной полосой.', GUARDIAN_ONLY),
  steelShield: armorPiece('Стальной щит', 'offhand', 'shield', 'fine', 3, 9, 18, 340,
    { blockPower: 0.6, maxHp: 20 }, 'Цельный стальной щит с умбоном.', GUARDIAN_ONLY),
  towerShield: armorPiece('Башенный щит', 'offhand', 'shield', 'rare', 4, 13, 28, 760,
    { blockPower: 0.66, maxHp: 35 }, 'Ростовой щит из кобальтовой стали: за ним можно укрыть товарища.', GUARDIAN_ONLY),
  mithrilShield: armorPiece('Мифриловый щит', 'offhand', 'shield', 'epic', 5, 17, 38, 1500,
    { blockPower: 0.72, maxHp: 50 }, 'Лёгкий щит из мифрила, не знающий вмятин.', GUARDIAN_ONLY),
  sotnikShield: armorPiece('Щит Сотника', 'offhand', 'shield', 'epic', 3, 9, 24, 800,
    { blockPower: 0.64, maxHp: 30 }, 'Полковой щит со сбитым гербом.', { ...GUARDIAN_ONLY, unique: true }),
};

const CLOAKS = {
  travelCloak: armorPiece('Дорожный плащ', 'cloak', 'cloak', 'common', 1, 1, 1, 40,
    { maxStamina: 5 }, 'Плотное сукно от дождя и ветра.', { weight: 'light' }),
  wolfCloak: armorPiece('Волчья накидка', 'cloak', 'cloak', 'common', 2, 5, 3, 140,
    { maxHp: 12 }, 'Тёплая накидка из волчьих шкур.', { weight: 'light' }),
  fieldCoat: armorPiece('Походный плащ', 'cloak', 'cloak', 'fine', 3, 9, 5, 380,
    { maxStamina: 15, moveSpeed: 0.02 }, 'Лёгкий плащ из лугового волокна, не цепляется за кусты.', { weight: 'light' }),
  stormCloak: armorPiece('Штормовой плащ', 'cloak', 'cloak', 'rare', 4, 13, 8, 800,
    { maxHp: 30, maxStamina: 15 }, 'Пропитанная ткань с кожаным подбоем: ни ветер, ни ливень не страшны.', { weight: 'light' }),
  starMantle: armorPiece('Плащ звёздного пути', 'cloak', 'cloak', 'epic', 5, 17, 11, 1600,
    { maxHp: 40, maxStamina: 25, moveSpeed: 0.03 }, 'Плащ из звёздной ткани — знак тех, кто прошёл всё кольцо.', { weight: 'light' }),
  ravenCloak: armorPiece('Плащ Ворона', 'cloak', 'cloak', 'legendary', 5, 15, 12, 2200,
    { maxHp: 45, critChance: 0.04, moveSpeed: 0.04 }, 'Чёрный плащ с оторочкой из вороньих перьев.', { weight: 'light', unique: true }),
};

const trinket = (name, icon, rarity, tier, requiredLevel, value, stats, desc, extra = {}) => ({
  name, type: 'armor', slot: 'trinket', icon, rarity, tier, cat: 'armor', armor: 0, requiredLevel, value, stats, desc, ...extra,
});

const TRINKETS = {
  luckyCoin: trinket('Счастливая монета', 'coin', 'common', 1, 1, 45,
    { priceBonus: 0.02 }, 'Затёртая монета старой чеканки. Купцы уважают такие приметы.'),
  hunterCharm: trinket('Ожерелье из клыков', 'trophy', 'common', 1, 3, 60,
    { critChance: 0.02 }, 'Охотничий знак: напоминает, куда бить зверя.'),
  ironRing: trinket('Железный перстень', 'part', 'common', 2, 5, 120,
    { maxHp: 20 }, 'Тяжёлый перстень бойца — заодно и кастет.'),
  compass: trinket('Дорожный компас', 'part', 'fine', 2, 6, 220,
    { moveSpeed: 0.03 }, 'С ним не теряешь времени на плутание.'),
  minerLamp: trinket('Шахтёрская лампа', 'part', 'fine', 2, 6, 200,
    { gatherSpeed: 0.1 }, 'Хороший свет — половина работы в забое и в лесу.'),
  amberPendant: trinket('Янтарная подвеска', 'amber', 'fine', 3, 9, 420,
    { maxStamina: 20, healPower: 0.05 }, 'Тёплый камень в медной оправе работы каменщика-ювелира.'),
  guildSeal: trinket('Печать торгового союза', 'coin', 'rare', 3, 10, 700,
    { priceBonus: 0.05 }, 'Знак полноправного члена союза: с ним торгуются уважительнее.'),
  gemRing: trinket('Перстень с самоцветом', 'gem', 'rare', 4, 13, 900,
    { critChance: 0.04, attack: 3 }, 'Огранённый самоцвет в мифриловой оправе.'),
  kosoyPatch: trinket('Повязка Косого', 'trophy', 'rare', 2, 5, 240,
    { critChance: 0.03, maxHp: 15 }, 'Кожаная повязка атамана. Носить её — дерзость, которую в долине оценят.', { unique: true }),
  sotnikMedal: trinket('Медаль Сотника', 'coin', 'epic', 3, 9, 640,
    { maxHp: 40, armor: 5 }, 'Боевая награда, которую её хозяин опозорил.', { unique: true }),
  alphaFang: trinket('Клык вожака', 'trophy', 'rare', 2, 5, 260,
    { attack: 2, critChance: 0.02 }, 'Клык матёрого волка на кожаном шнуре.', { unique: true }),
  bearTotem: trinket('Медвежий коготь', 'trophy', 'rare', 3, 7, 380,
    { maxHp: 45 }, 'Коготь хозяина берлоги, оправленный в медь.', { unique: true }),
};

const bag = (name, rarity, tier, slots, value, desc) => ({
  name, type: 'bag', slot: 'bag', icon: 'bag', rarity, tier, cat: 'bag', slots, value, desc,
});

const BAGS = {
  pouch: bag('Поясной кошель', 'common', 1, 4, 35, 'Небольшая сумка на ремне: +4 ячейки.'),
  satchel: bag('Холщовая торба', 'common', 1, 6, 70, 'Парусиновая сумка через плечо: +6 ячеек.'),
  bag: bag('Походная сумка', 'common', 2, 8, 120, 'Кожаная сумка с клапаном: +8 ячеек.'),
  expeditionBag: bag('Экспедиционный ранец', 'rare', 4, 18, 620, 'Жёсткий ранец с рамой: +18 ячеек.'),
  caravanPack: bag('Караванный вьюк', 'epic', 5, 24, 1500, 'Вьюк проводников из кожи древнего зверя: +24 ячейки.'),
};

const tool = (name, icon, rarity, tier, skills, speed, value, desc) => ({
  name, type: 'tool', slot: 'tool', icon, rarity, tier, cat: 'tool', value, desc,
  tool: { skills, tier, speed },
});

const HARVEST_SKILLS = ['herbalism', 'farming', 'fiber'];
const ROCK_SKILLS = ['mining', 'stonecutting'];

const TOOLS = {
  sickle: tool('Серп', 'tool', 'common', 1, HARVEST_SKILLS, 0.15, 30,
    'Для трав, колосьев и волокна. Нужен для редких растений.'),
  steelSickle: tool('Стальной серп', 'tool', 'fine', 2, HARVEST_SKILLS, 0.3, 140,
    'Режет чисто и не тупится на жёстких стеблях.'),
  masterSickle: tool('Серп мастера', 'tool', 'rare', 3, HARVEST_SKILLS, 0.45, 420,
    'Без него к лунному цвету и звёздному льну лучше не подходить.'),
  knife: tool('Рабочий нож', 'dagger', 'common', 1, ['skinning'], 0.15, 30,
    'Нож для снятия шкур и мелкой работы.'),
  steelKnife: tool('Стальной свежевальный нож', 'dagger', 'fine', 2, ['skinning'], 0.3, 140,
    'Тонкое лезвие не портит дорогую шкуру.'),
  masterKnife: tool('Нож скорняка', 'dagger', 'rare', 3, ['skinning'], 0.45, 420,
    'Инструмент для шкур древнего зверя.'),
  axe: tool('Лесорубный топор', 'tool', 'common', 1, ['logging'], 0.15, 45,
    'Нужен для твёрдой древесины и ускоряет любую рубку.'),
  steelAxe: tool('Стальной топор', 'tool', 'fine', 2, ['logging'], 0.3, 160,
    'Берёт выдержанные стволы, о которые железо тупится.'),
  masterAxe: tool('Топор мастера', 'tool', 'rare', 3, ['logging'], 0.45, 460,
    'Единственное, чем можно валить железное дерево.'),
  pickaxe: tool('Кирка', 'tool', 'common', 1, ROCK_SKILLS, 0.15, 45,
    'Для руды и камня. Без неё берётся лишь то, что лежит на поверхности.'),
  steelPickaxe: tool('Стальная кирка', 'tool', 'fine', 2, ROCK_SKILLS, 0.3, 160,
    'Дробит плотную руду, гранит и мрамор.'),
  masterPickaxe: tool('Кирка мастера', 'tool', 'rare', 3, ROCK_SKILLS, 0.45, 460,
    'Для кобальта, мифрила и чёрного базальта.'),
};

/** Every gear item by id (not yet registered). */
export const GEAR_ITEMS = {
  ...buildWeaponLines(),
  ...SPECIAL_WEAPONS,
  ...buildArmorSets(),
  ...SHIELDS,
  ...CLOAKS,
  ...TRINKETS,
  ...BAGS,
  ...TOOLS,
};

/** Ids of unique named gear (boss and lair drops). */
export const UNIQUE_GEAR_IDS = Object.keys(GEAR_ITEMS).filter(id => GEAR_ITEMS[id].unique);
