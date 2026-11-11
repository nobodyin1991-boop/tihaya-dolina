// Notice-board data: what citizens ask for, and the captains' bounties. Pure data.

export const BOARD_TUNING = {
  minOpen: 4, maxOpen: 6,       // contracts per city per day
  premiumMin: 1.3, premiumMax: 1.7, // pay = street sell price × count × premium
  minCoins: 8,
  bigOrder: 60,                 // orders worth more than this give 2 reputation
  xpPerCoin: 0.6,
};

const ask = (itemId, min, max, why, minStage = 0) => ({ itemId, count: [min, max], why, minStage });

/** Per city: pool of requests. `why` is the note pinned to the board. */
export const CONTRACT_POOLS = {
  valley: [
    ask('herb', 6, 12, 'Корова занемогла, а травница дерёт втридорога. Соберите кто-нибудь травы, заплачу честно.'),
    ask('wood', 10, 20, 'Крышу перекрываю, сам в лес не ходок — нога. Нужны дрова и жерди.'),
    ask('meat', 4, 8, 'Свадьба у дочери, а кабана валить некому. Мясо возьму любое, лишь бы свежее.'),
    ask('hide', 4, 8, 'Шью упряжь на продажу. Шкуры нужны, хоть заячьи.'),
    ask('plank', 6, 12, 'Амбар прохудился. Доска нужна сухая, не из-под пилы.'),
    ask('flour', 6, 10, 'Мельница далеко, а печь стынет. Муки бы мешок-другой.'),
    ask('bread', 4, 8, 'Косцам в поле нечего дать. Хлеба — сколько донесёте.'),
    ask('salve', 2, 5, 'Спину сорвал на покосе. Мазь бы, да покрепче.'),
    ask('stone', 8, 16, 'Погреб обкладываю. Камень нужен, любой, только не речной голыш.'),
    ask('flax', 6, 10, 'Пряжа кончилась, а зима спросит. Лён куплю.'),
    ask('bandage', 3, 6, 'Дозорные просят бинтов. Собираем всем миром.'),
    ask('ingot', 3, 6, 'Лемех лопнул. Железо из Брода теперь возят — так привезите и мне.', 1),
    ask('salt', 3, 6, 'Капусту квасить нечем. Соль из Брода — на вес серебра.', 1),
    ask('fishBarrel', 1, 3, 'Двадцать лет не ел морской рыбы. Говорят, кольцо снова ходит?', 3),
    ask('wine', 2, 4, 'На сход старосте нужно гаванское. Не брагой же гостей поить.', 3),
  ],
  ford: [
    ask('bread', 6, 12, 'Смена в забое двенадцать человек, а пекарь слёг. Хлеба!'),
    ask('meat', 6, 10, 'Горняк на каше кайло не поднимет. Мясо беру, плачу рудой или монетой.'),
    ask('plank', 8, 16, 'Настил в штреке сгнил. Доска нужна вчера.'),
    ask('beam', 2, 5, 'Крепь трещит. Брус, да потолще — жить охота.'),
    ask('leather', 4, 8, 'Рукавицы горят за неделю. Кожи бы.'),
    ask('salve', 3, 6, 'Обвал придавил троих. Живы, но мази надо много.'),
    ask('bandage', 4, 8, 'В лазарете при руднике рвут рубахи на бинты. Помогите.'),
    ask('herb', 8, 14, 'У нас на камнях трава не растёт. Лекарке нужны травы с низин.'),
    ask('coal', 10, 20, 'Горн простаивает, углежоги запили. Уголь куплю весь.'),
    ask('cloth', 4, 8, 'Детям не в чем в зиму. Ткань любую.'),
    ask('flour', 8, 14, 'Долина снова возит муку? Тогда и мне мешок.'),
    ask('honey', 2, 5, 'Кашель рудничный мёдом лечат. Долинского бы.'),
    ask('antidote', 2, 4, 'Ящерицы в старой штольне кусаются, и укус гниёт. Нужно противоядие.', 1),
    ask('ration', 4, 8, 'Дозор на перевале сидит на сухарях. Паёк им бы настоящий.', 1),
    ask('canvas', 3, 6, 'Навес над отвалом унесло. Парусина нужна гаванская.', 2),
  ],
  harbor: [
    ask('plank', 10, 18, 'Причал номер три гниёт, гильдия жмётся. Доска нужна корабельная.'),
    ask('canvas', 4, 8, 'Шторм порвал грот. Парусину беру не торгуясь.'),
    ask('ingot', 4, 8, 'Якорные цепи не из воздуха куют. Железо!'),
    ask('steel', 2, 5, 'Гарпуны нужны к путине. Сталь бродовская — лучшая.'),
    ask('leather', 4, 8, 'Сапоги рыбакам. Кожа нужна толстая, чтоб воду держала.'),
    ask('bread', 6, 12, 'Артель уходит на неделю. Хлеба в дорогу.'),
    ask('ration', 4, 8, 'Команде в рейс. Паёк, чтоб не протух на третий день.'),
    ask('tonic', 2, 5, 'После болотной лихорадки ноги не держат. Лекарь велел тоник.'),
    ask('antidote', 2, 5, 'Сети чинил — укололся о какую-то дрянь из топей. Рука чернеет.'),
    ask('thread', 4, 8, 'Сети плести нечем. Нить нужна крепкая.'),
    ask('cutStone', 6, 12, 'Мол осыпается. Тёсаный камень куплю, сколько привезёте.'),
    ask('honey', 2, 5, 'Жена ждёт, просит долинского мёда. Найдите — озолочу.'),
    ask('cheese', 2, 4, 'Купец из-за моря хочет «тот самый сыр из долины». Где я его возьму?'),
    ask('coal', 10, 18, 'Кузни порта стоят без угля. Плачу вперёд.'),
    ask('furBale', 1, 2, 'Заморские гости спрашивают мех. Цена — какую назовёте, в разумном.', 2),
  ],
};

const kill = (target, goal) => ({ target, goal });

/**
 * Bounties at the captains. `target`: {creatureId|family, count, regionId?, poiId?}.
 * `once` bounties are named heads; others repeat after `repeatDays`.
 */
export const BOUNTIES = [
  // ── Тихая долина ──
  { id: 'bv-wolves', cityKey: 'valley', title: 'Волчьи хвосты', coins: 40, xp: 120, rep: 2, repeatDays: 2,
    text: 'Стая режет овец у самых изгородей. За восемь хвостов плачу сразу.',
    ...kill({ family: 'wolves', count: 8 }, 'Убить волков: 8') },
  { id: 'bv-boars', cityKey: 'valley', title: 'Потрава на полях', coins: 35, xp: 110, rep: 2, repeatDays: 2,
    text: 'Кабаны перерыли озимые. Шесть голов — и мужики скинутся на премию.',
    ...kill({ family: 'boars', count: 6, regionId: 'fields' }, 'Убить кабанов в Пригородных полях: 6') },
  { id: 'bv-road', cityKey: 'valley', title: 'Чистый тракт', coins: 70, xp: 200, rep: 3, repeatDays: 3,
    text: 'Шайки по Старому бору — как грибы после дождя. Пятерых уложишь — дорога неделю дышит.',
    ...kill({ family: 'bandits', count: 5, regionId: 'oldwood' }, 'Убить разбойников в Старом бору: 5') },
  { id: 'bv-kosoy', cityKey: 'valley', title: 'Голова Косого', coins: 220, xp: 500, rep: 8, once: true, elite: true,
    text: 'Косой. Левый глаз смотрит в лес, правый — на твой кошелёк. Два года кормится с нашего тракта. Живым не нужен.',
    ...kill({ creatureId: 'bandit_chief_kosoy', count: 1 }, 'Убить Косого') },
  { id: 'bv-alpha', cityKey: 'valley', title: 'Седой', coins: 120, xp: 320, rep: 4, once: true, elite: true,
    text: 'Вожак стаи из Волчьей пади. Седой загривок, рваное ухо. Умён, как человек, и злее.',
    ...kill({ creatureId: 'alpha_wolf', count: 1, poiId: 'lair-wolf' }, 'Убить вожака в Волчьем логове') },
  { id: 'bv-southmead', cityKey: 'valley', title: 'Южные луга', coins: 90, xp: 260, rep: 3, repeatDays: 3, minStage: 1,
    text: 'За Южным дозором зверьё обнаглело. Сержант Борис просит подмоги — шесть хищников, любых.',
    ...kill({ family: 'predators', count: 6, regionId: 'southmead' }, 'Убить хищников на Южных лугах: 6') },
  // ── Каменный Брод ──
  { id: 'bf-lizards', cityKey: 'ford', title: 'Ящеры на отвалах', coins: 75, xp: 240, rep: 2, repeatDays: 2,
    text: 'Греются на тёплой породе и кусают возчиков. Восемь штук — и отвалы наши.',
    ...kill({ family: 'lizards', count: 8 }, 'Убить ящеров: 8') },
  { id: 'bf-deserters', cityKey: 'ford', title: 'Беглые', coins: 130, xp: 380, rep: 3, repeatDays: 3,
    text: 'Они присягали этому городу, а теперь грабят его обозы. Шестерых — на счёт. Знаки различия неси мне.',
    ...kill({ family: 'deserters', count: 6 }, 'Убить дезертиров: 6') },
  { id: 'bf-bear', cityKey: 'ford', title: 'Хозяин берлоги', coins: 160, xp: 420, rep: 4, once: true, elite: true,
    text: 'Медведь задрал двух углежогов и лошадь. Берлога под Волчьей падью. Трактирщик Клим добавит от себя — у него к этому зверю личное.',
    ...kill({ creatureId: 'bear', count: 1, poiId: 'lair-bear' }, 'Убить медведя в Медвежьей берлоге') },
  { id: 'bf-sotnik', cityKey: 'ford', title: 'Сотник Лютобор', coins: 380, xp: 900, rep: 8, once: true, elite: true,
    text: 'Мой бывший сотник. Лучший, кого я учил. Плачу из своего кармана — и не спрашивай, каково мне это писать.',
    ...kill({ creatureId: 'bandit_chief_sotnik', count: 1 }, 'Убить Сотника Лютобора') },
  { id: 'bf-stoneback', cityKey: 'ford', title: 'Камнеспин', coins: 240, xp: 600, rep: 4, once: true, elite: true, minStage: 1,
    text: 'В северном логове живёт тварь с панцирем, как мельничный жёрнов. Кайло её не берёт. Может, ты возьмёшь.',
    ...kill({ creatureId: 'stoneback', count: 1, poiId: 'lair-stoneback' }, 'Убить камнеспина в его логове') },
  { id: 'bf-drydale', cityKey: 'ford', title: 'Шакалы Сухого дола', coins: 150, xp: 420, rep: 3, repeatDays: 3, minStage: 1,
    text: 'За перевалом шайка мародёров — в бой не лезут, тащат с телег. Шестерых прижмёшь — остальные притихнут.',
    ...kill({ family: 'bandits', count: 6, regionId: 'drydale' }, 'Убить разбойников в Сухом доле: 6') },
  // ── Янтарная Гавань ──
  { id: 'bh-lurkers', cityKey: 'harbor', title: 'Топляки', coins: 180, xp: 520, rep: 3, repeatDays: 2,
    text: 'Лежит в воде, как бревно, пока не наступишь. Четверых — и сборщики тростника снова выйдут на топи.',
    ...kill({ family: 'lurkers', count: 4 }, 'Убить болотных топляков: 4') },
  { id: 'bh-marsh', cityKey: 'harbor', title: 'Болотная шайка', coins: 210, xp: 600, rep: 3, repeatDays: 3,
    text: 'В Гнилых топях сидят те, кого не взяли даже к Ворону. Восемь голов — плачу янтарём по весу. Шучу. Монетой.',
    ...kill({ family: 'bandits', count: 8, regionId: 'rotmarsh' }, 'Убить разбойников в Гнилых топях: 8') },
  { id: 'bh-spiders', cityKey: 'harbor', title: 'Тенёта', coins: 230, xp: 640, rep: 3, repeatDays: 3,
    text: 'Паутина на южной дороге такая, что лошадь вязнет. Десяток пауков, больших и малых.',
    ...kill({ family: 'spiders', count: 10 }, 'Убить пауков: 10') },
  { id: 'bh-omut', cityKey: 'harbor', title: 'Тот, что в омуте', coins: 300, xp: 800, rep: 5, once: true, elite: true,
    text: 'Старый топляк в омуте у затопленной усадьбы. Рыбаки зовут его Дедом и оставляют ему рыбу. Я оставлю ему тебя.',
    ...kill({ creatureId: 'marsh_lurker', count: 1, poiId: 'lair-marsh' }, 'Убить топляка в Омуте') },
  { id: 'bh-raven', cityKey: 'harbor', title: 'Атаман Ворон', coins: 800, xp: 2000, rep: 12, once: true, elite: true,
    text: 'Десять лет он держит южную дорогу. Гильдия платит восемьсот. Я бы добавил свои, да у портового капитана своих не бывает.',
    ...kill({ creatureId: 'bandit_chief_raven', count: 1 }, 'Убить атамана Ворона') },
  { id: 'bh-forest', cityKey: 'harbor', title: 'Вороньё', coins: 320, xp: 900, rep: 4, repeatDays: 3, minStage: 2,
    text: 'Каждый убитый в Разбойничьем лесу — это стрела, которая не прилетит в наш обоз. Десятерых.',
    ...kill({ family: 'bandits', count: 10, regionId: 'banditwood' }, 'Убить разбойников в Разбойничьем лесу: 10') },
];
