// Materials catalog: raw resources, crafted intermediates, trophies, trade goods and caravan cargo.
// Pure data; items-catalog.js registers MATERIAL_ITEMS.
//
// Rows are [id, name, icon, rarity, tier, value, desc].
// value = null means "derive from the recipe" (see deriveCraftedValues in items-catalog.js).
// `cat` (category) drives city price multipliers in data/economy.js.

const RAW = {
  herb: [
    ['herb', 'Лекарственная трава', 'herb', 'common', 1, 3, 'Обычный сбор для мазей и отваров, растёт по лугам и опушкам.'],
    ['rareHerb', 'Серебристый лист', 'herb', 'fine', 2, 12, 'Лесное растение с сильным заживляющим соком.'],
    ['mountainHerb', 'Горный тысячелистник', 'herb', 'rare', 3, 28, 'Цепкая трава каменистых склонов, основа крепких настоев.'],
    ['moonHerb', 'Лунный цвет', 'flower', 'epic', 4, 46, 'Раскрывается ночью в топях и чащах; аптекари платят за него не торгуясь.'],
  ],
  ore: [
    ['ore', 'Железная руда', 'ore', 'common', 1, 4, 'Бурая руда из лесных и холмовых выходов.'],
    ['copperOre', 'Медная руда', 'ore', 'fine', 2, 12, 'Зеленоватая руда для катушек, инструмента и сплавов.'],
    ['coal', 'Уголь', 'coal', 'common', 2, 10, 'Каменный уголь — без него не выплавить сталь.'],
    ['richOre', 'Плотная руда', 'ore', 'fine', 2, 13, 'Тяжёлая руда с высоким содержанием железа.'],
    ['cobaltOre', 'Кобальтовая руда', 'ore', 'rare', 3, 30, 'Синеватая порода Красных утёсов.'],
    ['mithrilOre', 'Мифриловая руда', 'ore', 'epic', 4, 48, 'Серебристые жилы, вмёрзшие в лёд высоких пиков.'],
  ],
  wood: [
    ['wood', 'Древесина', 'wood', 'common', 1, 3, 'Сосна и берёза — на доски, рукояти и дрова.'],
    ['hardwood', 'Твёрдая древесина', 'wood', 'fine', 2, 12, 'Дуб и ясень из старого леса.'],
    ['ancientWood', 'Выдержанная древесина', 'wood', 'rare', 3, 28, 'Смолистые стволы вековых деревьев.'],
    ['ironwood', 'Железное дерево', 'wood', 'epic', 4, 46, 'Тонет в воде и тупит топоры; растёт только в глухих чащах.'],
    ['resin', 'Смола', 'wood', 'common', 1, 2, 'Живица: клей, факелы и пропитка.'],
  ],
  hide: [
    ['hide', 'Шкура', 'hide', 'common', 1, 5, 'Сырая шкура некрупного зверя.'],
    ['fineHide', 'Плотная шкура', 'hide', 'fine', 2, 14, 'Толстая шкура кабана, рыси или оленя.'],
    ['thickHide', 'Шкура матёрого зверя', 'hide', 'rare', 3, 30, 'Тяжёлая шкура крупного хищника.'],
    ['pristineHide', 'Шкура древнего зверя', 'hide', 'epic', 4, 50, 'Редкая шкура старых тварей дальних земель.'],
  ],
  crop: [
    ['wheat', 'Пшеница', 'grain', 'common', 1, 3, 'Хлеб долины.'],
    ['rye', 'Рожь', 'grain', 'fine', 2, 9, 'Неприхотливое зерно для дорожных смесей и эля.'],
    ['saffron', 'Дикий шафран', 'spice', 'rare', 3, 34, 'Пряность сухих степей и пустошей.'],
    ['seed', 'Семена пшеницы', 'grain', 'common', 1, 2, 'Отборное зерно на посев и на корм.'],
  ],
  fiber: [
    ['flax', 'Лён', 'fiber', 'common', 1, 3, 'Стебли для нити и полотна.'],
    ['silkFiber', 'Луговое волокно', 'fiber', 'fine', 2, 13, 'Шелковистый пух луговых трав.'],
    ['starFlax', 'Звёздный лён', 'fiber', 'epic', 4, 46, 'Тонкий белый лён пустошей и озёрных берегов.'],
  ],
  stone: [
    ['stone', 'Известняк', 'stone', 'common', 1, 3, 'Мягкий камень для кладки и раствора.'],
    ['granite', 'Гранит', 'stone', 'fine', 2, 11, 'Крепкий камень нагорий.'],
    ['marble', 'Мрамор', 'stone', 'rare', 3, 28, 'Белый камень для опор и тонкой работы.'],
    ['basalt', 'Чёрный базальт', 'stone', 'epic', 4, 44, 'Тяжёлая порода степных утёсов.'],
    ['roughGem', 'Необработанный самоцвет', 'gem', 'rare', 3, 60, 'Изредка попадается в рудной породе.'],
  ],
  food: [
    ['meat', 'Мясо', 'meat', 'common', 1, 3, 'Свежая дичь. Сырым есть не стоит.'],
    ['fish', 'Свежая рыба', 'fish', 'common', 1, 4, 'Улов рыбаков Янтарного берега.'],
  ],
};

const CRAFTED = {
  medicine: [
    ['tannin', 'Дубильный состав', 'potion', 'common', 1, null, 'Отвар для выделки кож.'],
    ['glue', 'Столярный клей', 'potion', 'common', 1, null, 'Смоляной клей для луков и мебели.'],
    ['concentrate', 'Лекарственный концентрат', 'potion', 'rare', 3, null, 'Выпаренный горный настой — основа сильных лекарств.'],
    ['lunarExtract', 'Лунный экстракт', 'potion', 'epic', 4, null, 'Вытяжка лунного цвета.'],
  ],
  metal: [
    ['ingot', 'Железный слиток', 'ingot', 'common', 1, null, 'Кричное железо, готовое к ковке.'],
    ['fastener', 'Крепёж', 'part', 'common', 1, null, 'Гвозди, скобы и заклёпки.'],
    ['copperIngot', 'Медный слиток', 'ingot', 'fine', 2, null, 'Мягкий металл для проволоки и оправ.'],
    ['instruments', 'Лекарские инструменты', 'part', 'fine', 2, null, 'Ланцеты, щипцы и иглы.'],
    ['mechanism', 'Механизм', 'part', 'fine', 2, null, 'Шестерни, пружины и рычаги.'],
    ['coil', 'Медная катушка', 'part', 'fine', 2, null, 'Обмотка для полевых приборов.'],
    ['steel', 'Сталь', 'ingot', 'fine', 2, null, 'Прокованная сталь Каменного Брода.'],
    ['cobaltSteel', 'Кобальтовая сталь', 'ingot', 'rare', 3, null, 'Синеватый сплав, твёрже обычной стали.'],
    ['mithril', 'Мифриловый сплав', 'ingot', 'epic', 4, null, 'Лёгкий светлый сплав высочайшей прочности.'],
  ],
  timber: [
    ['plank', 'Доски', 'plank', 'common', 1, null, 'Пилёная доска.'],
    ['handle', 'Рукоять', 'part', 'common', 1, null, 'Заготовка для инструмента и оружия.'],
    ['arrow', 'Набор стрел', 'arrow', 'common', 1, null, 'Связка оперённых стрел; ходовой товар у стражи.'],
    ['cask', 'Бочонок', 'barrel', 'common', 1, null, 'Пустой бочонок под провизию.'],
    ['beam', 'Усиленная балка', 'beam', 'fine', 2, null, 'Клеёный брус из твёрдой древесины.'],
    ['carvedChest', 'Резной ларь', 'crate', 'rare', 3, null, 'Мебель тонкой работы — в Гавани за такую платят щедро.'],
    ['ironBeam', 'Балка железного дерева', 'beam', 'epic', 4, null, 'Несущий брус, которому не страшны ни гниль, ни жучок.'],
  ],
  leather: [
    ['leather', 'Выделанная кожа', 'leather', 'common', 1, null, 'Мягкая дублёная кожа.'],
    ['strap', 'Кожаные ремни', 'leather', 'common', 1, null, 'Ремни и шнуры.'],
    ['reinforcedLeather', 'Укреплённая кожа', 'leather', 'fine', 2, null, 'Многослойная кожа для доспехов.'],
    ['elderLeather', 'Кожа древнего зверя', 'leather', 'epic', 4, null, 'Плотная и гибкая, почти не режется ножом.'],
  ],
  meal: [
    ['flour', 'Мука', 'flour', 'common', 1, null, 'Пшеничная мука грубого помола.'],
    ['grainMeal', 'Зерновая смесь', 'flour', 'fine', 2, null, 'Ржаная и пшеничная крупа для дорожных блюд.'],
    ['fodder', 'Кормовая смесь', 'grain', 'common', 1, null, 'Зерно с отрубями для тягловых лошадей.'],
  ],
  cloth: [
    ['cloth', 'Льняное полотно', 'cloth', 'common', 1, null, 'Домотканое полотно.'],
    ['thread', 'Крепкая нить', 'thread', 'common', 1, null, 'Кручёная льняная нить.'],
    ['canvas', 'Парусина', 'cloth', 'common', 2, null, 'Плотная ткань для тентов и стёганок.'],
    ['fineCloth', 'Луговой шёлк', 'cloth', 'fine', 3, null, 'Гладкая ткань из лугового волокна.'],
    ['starCloth', 'Звёздная ткань', 'cloth', 'epic', 4, null, 'Тончайшая ткань из звёздного льна.'],
  ],
  stonework: [
    ['cutStone', 'Тёсаный камень', 'block', 'common', 1, null, 'Обтёсанные известняковые бруски.'],
    ['mortar', 'Раствор', 'stone', 'common', 1, null, 'Известковая смесь для кладки.'],
    ['stoneBlock', 'Гранитный блок', 'block', 'fine', 2, null, 'Блок для стен и опор.'],
    ['millstone', 'Мельничный жёрнов', 'block', 'fine', 2, null, 'Гранитный жёрнов: мельники долины ждут такие месяцами.'],
    ['milestone', 'Дорожный указатель', 'block', 'fine', 2, null, 'Верстовой камень с высеченными знаками.'],
    ['furnaceLining', 'Огнеупорная кладка', 'block', 'fine', 2, null, 'Футеровка для горнов и печей.'],
    ['marbleSlab', 'Мраморная плита', 'block', 'rare', 3, null, 'Полированная плита для богатых домов.'],
    ['statuette', 'Мраморная статуэтка', 'trophy', 'rare', 3, null, 'Небольшая фигурка тонкой резьбы.'],
    ['foundation', 'Опора моста', 'block', 'rare', 3, null, 'Мраморно-гранитный устой для переправ.'],
    ['cutGem', 'Огранённый самоцвет', 'gem', 'rare', 3, null, 'Камень после рук мастера.'],
    ['basaltBlock', 'Базальтовый блок', 'block', 'epic', 4, null, 'Чёрный блок на века.'],
    ['waystone', 'Камень дальнего пути', 'block', 'epic', 5, null, 'Резной путевой знак торгового союза — венец работы каменщика.'],
  ],
  trophy: [
    ['wolfPelt', 'Волчья шкура', 'fur', 'common', 1, 10, 'Густой серый мех.'],
    ['foxPelt', 'Лисий мех', 'fur', 'fine', 1, 14, 'Рыжий мех на оторочку.'],
    ['wool', 'Овечья шерсть', 'fiber', 'common', 1, 4, 'Руно луговой овцы.'],
    ['fang', 'Клык', 'trophy', 'common', 1, 5, 'Клык хищника — на амулеты и рукояти.'],
    ['boarTusk', 'Кабаний бивень', 'trophy', 'common', 1, 8, 'Жёлтый изогнутый бивень.'],
    ['antler', 'Олений рог', 'trophy', 'common', 1, 10, 'На рукояти и украшения.'],
    ['goatHorn', 'Козий рог', 'trophy', 'common', 1, 7, 'Крепкий витой рог.'],
    ['bearClaw', 'Медвежий коготь', 'trophy', 'fine', 2, 20, 'Трофей, которым не стыдно похвастать.'],
    ['lizardScale', 'Чешуя ящерицы', 'trophy', 'common', 1, 8, 'Гибкие роговые пластинки.'],
    ['stoneShell', 'Пластина камнеспина', 'trophy', 'rare', 3, 42, 'Кусок панциря, твёрдый как сланец.'],
    ['drakeScale', 'Чешуя кряжевого ящера', 'trophy', 'epic', 4, 70, 'Щиток размером с ладонь.'],
    ['spiderSilk', 'Паучий шёлк', 'fiber', 'rare', 3, 30, 'Липкая и невероятно прочная нить.'],
    ['venomGland', 'Ядовитая железа', 'trophy', 'rare', 3, 28, 'Осторожно: содержимое всё ещё опасно.'],
    ['frostPelt', 'Инеевая шкура', 'fur', 'rare', 3, 55, 'Белый мех с серебристым отливом.'],
    ['shadowPelt', 'Шкура сумрачной кошки', 'fur', 'epic', 4, 80, 'Чёрный мех, почти не отражающий свет.'],
    ['banditBadge', 'Разбойничья метка', 'trophy', 'common', 1, 12, 'Знак шайки. Капитаны стражи платят за такие.'],
  ],
};

/** Trade goods: bought cheap where they are produced, sold dear elsewhere. */
const TRADE = [
  ['honey', 'Луговой мёд', 'barrel', 'common', 1, 14, 'Мёд с пасеки у южной дороги.'],
  ['cheese', 'Головка сыра', 'meal', 'common', 1, 16, 'Выдержанный сыр хуторов долины.'],
  ['grainSack', 'Мешок зерна', 'grain', 'common', 1, 12, 'Зерно нового урожая.'],
  ['lumberBale', 'Вязанка строевого леса', 'wood', 'common', 1, 18, 'Отборные брёвна с лесопилки.'],
  ['oreCrate', 'Ящик руды', 'ore', 'common', 2, 34, 'Обогащённая руда из шахт Брода.'],
  ['coalSack', 'Мешок угля', 'coal', 'common', 2, 28, 'Жаркий каменный уголь.'],
  ['toolCrate', 'Ящик инструментов', 'crate', 'fine', 2, null, 'Топоры, пилы, кирки и гвозди — всё, что нужно стройке.'],
  ['salt', 'Каменная соль', 'salt', 'common', 2, 22, 'Соль из копей нагорья.'],
  ['amber', 'Янтарь', 'amber', 'fine', 3, 90, 'Солнечный камень прибрежных отмелей.'],
  ['wine', 'Заморское вино', 'wine', 'fine', 3, 55, 'Бочонок вина из трюмов Гавани.'],
  ['spice', 'Заморские пряности', 'spice', 'fine', 3, 70, 'Перец, гвоздика и корица.'],
  ['fishBarrel', 'Бочка солёной рыбы', 'barrel', 'common', 2, 40, 'Сельдь крепкого посола.'],
  ['silk', 'Заморский шёлк', 'cloth', 'rare', 4, 120, 'Отрез блестящей ткани.'],
  ['pearls', 'Жемчуг', 'gem', 'rare', 4, 200, 'Нитка речного и морского жемчуга.'],
  ['furBale', 'Тюк пушнины', 'fur', 'fine', 2, 110, 'Увязанные шкуры — товар охотников и кожевников.'],
];

/** Caravan cargo goods crafted by the professions (toolCrate is both cargo and a trade good). */
const CARGO = [
  ['medicineChest', 'Аптечный сундук', 'crate', 'fine', 2, null, 'Мази и перевязка на целый обоз.'],
  ['provisionBarrel', 'Бочка провизии', 'barrel', 'fine', 2, null, 'Хлеб и вяленое мясо в дорогу.'],
  ['tentBundle', 'Связка палаток', 'cloth', 'fine', 2, null, 'Парусиновые палатки с жердями.'],
  ['spareWheel', 'Запасное колесо', 'part', 'fine', 2, null, 'Колесо для обозной телеги.'],
  ['harnessSet', 'Комплект упряжи', 'leather', 'fine', 2, null, 'Хомут, вожжи и постромки.'],
  ['buildingStone', 'Строительный камень', 'block', 'fine', 2, null, 'Поддон тёсаного камня с раствором.'],
  ['wagonKit', 'Ремкомплект телеги', 'part', 'fine', 2, null, 'Доски, крепёж и клей для починки повозки в пути.'],
  ['weaponCrate', 'Ящик оружия', 'crate', 'rare', 3, null, 'Клинки и стрелы для городского арсенала.'],
  ['fieldHospital', 'Полевой госпиталь', 'crate', 'rare', 3, null, 'Хирургические наборы и палатка для раненых.'],
  ['guildProvisions', 'Припасы торгового союза', 'barrel', 'rare', 3, null, 'Отборная провизия с пряностями.'],
  ['sailcloth', 'Парусное полотно', 'cloth', 'rare', 3, null, 'Тяжёлые рулоны для корабельных мастеров.'],
  ['bridgeKit', 'Мостовой набор', 'beam', 'rare', 3, null, 'Балки, опора и крепёж для переправы.'],
];

/** Ids of every caravan cargo product. */
export const CARGO_GOOD_IDS = ['toolCrate', ...CARGO.map(row => row[0])];

function expandRows(rows, extra) {
  const items = {};
  for (const [id, name, icon, rarity, tier, value, desc] of rows) {
    items[id] = { name, icon, rarity, tier, desc, ...extra };
    if (value !== null) items[id].value = value;
  }
  return items;
}

function buildMaterials() {
  const items = {};
  for (const group of [RAW, CRAFTED]) {
    for (const [cat, rows] of Object.entries(group)) {
      Object.assign(items, expandRows(rows, { type: 'material', cat }));
    }
  }
  Object.assign(items, expandRows(TRADE, { type: 'trade', cat: 'trade' }));
  Object.assign(items, expandRows(CARGO, { type: 'material', cat: 'cargo' }));
  return items;
}

/** Every material, trophy, trade good and cargo good by id (not yet registered). */
export const MATERIAL_ITEMS = buildMaterials();

/** Ids of the pinned trade goods. */
export const TRADE_GOOD_IDS = TRADE.map(row => row[0]);
