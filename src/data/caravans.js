// Caravan catalog: legs (manifest, pay, road events), wagons, upgrades, mercenaries, guild-run pools.
// Pure data. Logic lives in src/sim/caravan.js.
//
// Road event schema:
//   { id, at, jitter?, title, hint, boss?,
//     steps: [step…],            // played in order; the wagon stands until every step is cleared
//     skipIf?: cond,             // event is removed from the run
//     replaceIf?: [{if: cond, steps, title?}], // first matching replacement wins
//     weakIf?: [{if: cond, factor}],           // multiplies creature counts
//     variants?: [{steps, title?}]             // one is picked by the run seed (index 0 = the base `steps`)
//   }
// Step: {spawn: [group…], nightExtra?: [group…], toll?: {coins, text}}
//     | {obstacle: {kind, needs?, workSeconds, slowSeconds?, wagonSpare?, text}}
// Group: {creatureId, count: n | [min, max], side, role, level?: offset from the leg's base level}
// Conditions are flag conditions: {flag:'x'} | {notFlag:'x'} | {any:[…]} — see caravan.js `flagCond`.

/** Wagon moves at this speed (m/s) while escorted. */
export const WAGON_SPEED = 4;
/** The wagon only rolls while the player is this close (m). */
export const FOLLOW_RADIUS = 30;
/** Food units eaten by one hired guard per run. */
export const PROVISIONS_PER_GUARD = 2;
/** Food accepted as guard provisions, best first. */
export const GUARD_FOOD = ['ration', 'trailMeal', 'bread', 'flatbread', 'stew', 'grainMeal'];
/** Guild sells bonus cargo at the destination with this premium over the street price. */
export const GUILD_SALE_BONUS = 1.1;

/** Trade goods that may ride as bonus cargo (pinned in CLAUDE.md). */
export const TRADE_GOODS = [
  'honey', 'cheese', 'grainSack', 'lumberBale', 'oreCrate', 'coalSack', 'toolCrate', 'salt',
  'amber', 'wine', 'spice', 'fishBarrel', 'silk', 'pearls', 'furBale',
];

export const CARGO_CATEGORIES = {
  provisions: 'Провиант',
  materials: 'Материалы',
  goods: 'Изделия',
  medicine: 'Лекарства',
};

/** Wagon tiers. `bonusUnits` = how many units of own trade goods fit. */
export const WAGON_TIERS = [
  { tier: 1, id: 'cart', name: 'Крестьянская телега', maxHp: 300, bonusUnits: 20, price: 0, minStage: 0,
    desc: 'Скрипит, но едет. Борта низкие, оси деревянные.' },
  { tier: 2, id: 'tier2', name: 'Купеческий фургон', maxHp: 480, bonusUnits: 36, price: 420, minStage: 1,
    desc: 'Высокие борта, дубовая рама, место под лишний тюк.' },
  { tier: 3, id: 'tier3', name: 'Гильдейский обоз', maxHp: 700, bonusUnits: 54, price: 950, minStage: 2,
    desc: 'Окованная рама и двойная упряжь. На таких ходили по кольцу в лучшие годы.' },
];

/** Upgrades bought at the stablemaster. `consumable` ones are used up during a run. */
export const WAGON_UPGRADES = [
  { id: 'reinforced', name: 'Усиленные борта', price: 180, minStage: 0, hpBonus: 0.4,
    desc: 'Дубовые доски внахлёст и железные полосы.', effect: 'Прочность телеги +40%' },
  { id: 'spareWheel', name: 'Запасное колесо', price: 70, minStage: 0, consumable: true,
    desc: 'Привязано под днищем. Понадобится — вспомнишь добрым словом.', effect: 'Одна поломка колеса чинится сразу и без деталей' },
  { id: 'lanterns', name: 'Дорожные фонари', price: 130, minStage: 0, nightFactor: 0.4,
    desc: 'Четыре слюдяных фонаря по углам. В круге света не подкрасться.', effect: 'Ночные засады заметно слабее' },
  { id: 'cover', name: 'Просмолённый тент', price: 160, minStage: 0, theftFactor: 0.5,
    desc: 'Плотный тент на шнуровке — с наскока тюк не выдернешь.', effect: 'Мародёры уносят вдвое меньше груза' },
  { id: 'ironAxles', name: 'Кованые оси', price: 280, minStage: 1, speedBonus: 0.12, mudFactor: 0.5,
    desc: 'Железо из Каменного Брода вместо берёзовых осей.', effect: 'Ход телеги +12%, грязь и завалы проходятся вдвое быстрее' },
  { id: 'secondWagon', name: 'Вторая телега', price: 640, minStage: 2, bonusUnits: 30, hpBonus: 0.25,
    desc: 'Вторая упряжка и второй возница. Больше груза — больше глаз на него.', effect: 'Попутного груза +30 мест, прочность обоза +25%' },
];

/** Mercenaries for hire at the captain of the origin city. Level is an offset from the leg's base level. */
export const MERCS = {
  valley: [
    { id: 'valley-ivar', name: 'Ждан Косарь', level: 0, price: 45, line: 'Батрак с копьём. Крепок, не болтлив, волков не боится.' },
    { id: 'valley-nesta', name: 'Неста Тетива', level: 0, price: 55, line: 'Охотничья дочь. Стреляет зайца в прыжке.' },
    { id: 'valley-buyan', name: 'Буян', level: 1, price: 70, line: 'Бывший обозный. Ходил по кольцу, когда оно ещё было кольцом.' },
    { id: 'valley-oleh', name: 'Олех Рябой', level: 1, price: 80, line: 'Дозорный в отставке. Щит держит, как дверь в погреб.' },
  ],
  ford: [
    { id: 'ford-kremen', name: 'Кремень', level: 0, price: 95, line: 'Забойщик. Кайлом машет так же, как топором.' },
    { id: 'ford-vesna', name: 'Весна Сойка', level: 0, price: 110, line: 'Арбалетчица с перевала. Знает, откуда бьют дезертиры.' },
    { id: 'ford-dub', name: 'Дубыня', level: 1, price: 130, line: 'Вышибала из «Кирки и кружки». Клим отпустил на один рейс.' },
    { id: 'ford-zorya', name: 'Зоря Клин', level: 1, price: 150, line: 'Десятница, ушла из стражи со скандалом. Дело знает.' },
  ],
  harbor: [
    { id: 'harbor-shram', name: 'Шрам', level: 0, price: 170, line: 'Портовый грузчик и кулачный боец. Берёт вперёд.' },
    { id: 'harbor-lada', name: 'Милава Гарпун', level: 0, price: 190, line: 'Китобойная артель осталась без судна. Гарпун остался.' },
    { id: 'harbor-tur', name: 'Тур Молчан', level: 1, price: 230, line: 'Гильдейский охранник. Три рейса через топи, все три — живой.' },
    { id: 'harbor-iskra', name: 'Искра', level: 2, price: 280, line: 'Ученица мастера Лады. Дорогая, злая, быстрая.' },
  ],
};

const g = (creatureId, count, side, role = 'attacker', level = 0) => ({ creatureId, count, side, role, level });

/** Per-leg definitions, index = LEGS[].id. */
export const CARAVAN_LEGS = [
  // ───────────────────────────── 0: Тихая долина → Каменный Брод ─────────────────────────────
  {
    leg: 0, baseLevel: 4, fee: 320, xp: 600, rep: { from: 8, to: 12 }, towFee: 40, prepHours: 1,
    brief: 'Хлеб, доски и шкуры для горняков. Первая телега по Лесному тракту за два года.',
    manifest: [
      { itemId: 'flour', count: 20, category: 'provisions', advance: 2 },
      { itemId: 'bread', count: 12, category: 'provisions', advance: 3 },
      { itemId: 'meat', count: 14, category: 'provisions', advance: 2 },
      { itemId: 'provisionBarrel', count: 2, category: 'provisions', advance: 14 },
      { itemId: 'wood', count: 30, category: 'materials', advance: 1 },
      { itemId: 'plank', count: 24, category: 'materials', advance: 2 },
      { itemId: 'hide', count: 12, category: 'materials', advance: 2 },
      { itemId: 'handle', count: 8, category: 'goods', advance: 4 },
      { itemId: 'salve', count: 6, category: 'medicine', advance: 4 },
      { itemId: 'bandage', count: 8, category: 'medicine', advance: 3 },
    ],
    events: [
      {
        id: 'l0-wolves', at: 0.2, jitter: 0.03, title: 'Стая у опушки', hint: 'Волки выходят к дороге у Старого бора.',
        steps: [{ spawn: [g('wolf', [3, 4], 'left')], nightExtra: [g('wolf', 2, 'right')] }],
        variants: [{ title: 'Секач с выводком', steps: [{ spawn: [g('boar', 3, 'right'), g('thorn_boar', 1, 'right', 'attacker', 1)] }] }],
      },
      {
        id: 'l0-tree', at: 0.37, jitter: 0.03, title: 'Завал на тракте', hint: 'Поперёк дороги лежит сосна. Сама ли упала — вопрос.',
        steps: [{ obstacle: { kind: 'fallen-tree', workSeconds: 22, text: 'Сосна поперёк тракта. Берись за топор.' } }],
        variants: [{
          title: 'Завал с сюрпризом',
          steps: [
            { spawn: [g('bandit_thug', 2, 'left'), g('bandit_archer', 1, 'right')] },
            { obstacle: { kind: 'fallen-tree', workSeconds: 22, text: 'Подпилено. Растаскивай, пока новые не набежали.' } },
          ],
        }],
      },
      {
        id: 'l0-toll', at: 0.55, jitter: 0.04, title: 'Мытари Косого', hint: 'Люди Косого берут «дорожное» с каждой телеги.',
        steps: [{
          spawn: [g('bandit_thug', 3, 'front'), g('bandit_archer', 1, 'left')],
          toll: { coins: 35, text: '«Тракт наш. Тридцать пять монет — и катись. Или слезай, поговорим по-другому».' },
        }],
        skipIf: { any: [{ flag: 'kosoy:deal' }, { flag: 'poi:camp-kosoy' }] },
      },
      {
        id: 'l0-kosoy', at: 0.8, jitter: 0.03, title: 'Засада Косого', boss: 'bandit_chief_kosoy',
        hint: 'У Волчьей пади тракт идёт ложбиной. Лучшего места для засады не придумать.',
        steps: [
          { spawn: [g('bandit_thug', 3, 'left'), g('bandit_archer', 2, 'right'), g('bandit_looter', 1, 'rear', 'looter')] },
          { spawn: [g('bandit_chief_kosoy', 1, 'front', 'boss', 1), g('bandit_thug', 2, 'front')] },
        ],
        skipIf: { flag: 'kosoy:deal' },
        replaceIf: [{
          if: { flag: 'poi:camp-kosoy' }, title: 'Недобитки Косого',
          steps: [{ spawn: [g('bandit_thug', 2, 'left'), g('bandit_scout', 1, 'right')] }],
        }],
      },
    ],
    banter: [
      'Ну, с почином. Два года эта дорога тележного скрипа не слышала.',
      'Гляди по сторонам, а не на меня. Меня ты уже видел.',
      'Вон тот бор — Старый. За ним пост стражи, а дальше уж каждый сам за себя.',
      'Мой дед возил по этому тракту соль. Говорил: лошадь чует беду раньше человека. Моя пока жуёт.',
      'Брод уже близко. Чуешь — углём потянуло?',
    ],
  },
  // ───────────────────────────── 1: Каменный Брод → Янтарная Гавань ─────────────────────────────
  {
    leg: 1, baseLevel: 8, fee: 780, xp: 1500, rep: { from: 10, to: 14 }, towFee: 90, prepHours: 2.5,
    brief: 'Металл, инструмент и тёсаный камень для порта. Через Орлиный перевал, мимо заставы дезертиров.',
    manifest: [
      { itemId: 'ingot', count: 30, category: 'materials', advance: 4 },
      { itemId: 'steel', count: 12, category: 'materials', advance: 9 },
      { itemId: 'coal', count: 40, category: 'materials', advance: 1 },
      { itemId: 'cutStone', count: 24, category: 'materials', advance: 3 },
      { itemId: 'beam', count: 10, category: 'materials', advance: 6 },
      { itemId: 'toolCrate', count: 6, category: 'goods', advance: 16 },
      { itemId: 'harnessSet', count: 3, category: 'goods', advance: 18 },
      { itemId: 'buildingStone', count: 4, category: 'goods', advance: 15 },
      { itemId: 'tentBundle', count: 2, category: 'goods', advance: 18 },
      { itemId: 'ration', count: 16, category: 'provisions', advance: 4 },
      { itemId: 'provisionBarrel', count: 4, category: 'provisions', advance: 14 },
      { itemId: 'medicineChest', count: 3, category: 'medicine', advance: 20 },
      { itemId: 'antidote', count: 6, category: 'medicine', advance: 6 },
    ],
    events: [
      {
        id: 'l1-grade', at: 0.12, jitter: 0.02, title: 'Крутой подъём', hint: 'На первом взвозе гружёные телеги ломают колёса.',
        steps: [{ obstacle: { kind: 'wheel-break', needs: { spareWheel: 1 }, workSeconds: 15, slowSeconds: 90, wagonSpare: true,
          text: 'Хрустнуло. Обод лопнул на камне — ставь запасное или чини то, что есть.' } }],
      },
      {
        id: 'l1-beast', at: 0.27, jitter: 0.04, title: 'Хозяин склона', hint: 'У осыпей видели крупного зверя.',
        steps: [{ spawn: [g('bear', 1, 'right', 'attacker', 1)], nightExtra: [g('wolf', 3, 'left')] }],
        variants: [{ title: 'Кряжевый ящер', steps: [{ spawn: [g('ridge_drake', 1, 'left', 'attacker', 1), g('lizard', 2, 'left')] }] }],
      },
      {
        id: 'l1-crossbows', at: 0.42, jitter: 0.03, title: 'Арбалеты с двух сторон', hint: 'Дезертиры бьют с обоих склонов разом, по-военному.',
        steps: [
          { spawn: [g('deserter_crossbow', 3, 'left'), g('deserter_crossbow', 3, 'right')] },
          { spawn: [g('deserter', 3, 'front'), g('bandit_looter', 1, 'rear', 'looter')] },
        ],
        weakIf: [{ if: { any: [{ flag: 'poi:camp-deserters' }, { flag: 'sotnik:deal' }] }, factor: 0.5 }],
      },
      {
        id: 'l1-rockslide', at: 0.55, jitter: 0.03, title: 'Осыпь', hint: 'После дождей склон у Орлиной скалы сползает на дорогу.',
        steps: [{ obstacle: { kind: 'rockslide', workSeconds: 45, text: 'Камни по колено. Раскидывай — или ночуй тут.' } }],
        variants: [{
          title: 'Осыпь и её жильцы',
          steps: [
            { obstacle: { kind: 'rockslide', workSeconds: 45, text: 'Камни по колено. И под ними кто-то шевелится.' } },
            { spawn: [g('stoneback', 2, 'right')] },
          ],
        }],
      },
      {
        id: 'l1-roadblock', at: 0.68, jitter: 0.02, title: 'Рогатки Сотника', boss: 'bandit_chief_sotnik',
        hint: 'Сотник Лютобор перегородил дорогу рогатками и берёт всё, что едет.',
        steps: [
          { spawn: [g('deserter', 4, 'front'), g('deserter_crossbow', 2, 'left'), g('deserter_crossbow', 2, 'right')] },
          { spawn: [g('bandit_chief_sotnik', 1, 'front', 'boss', 1), g('deserter', 2, 'front')] },
          { obstacle: { kind: 'barricade', workSeconds: 30, text: 'Рогатки вкопаны на совесть. Военная работа.' } },
        ],
        skipIf: { flag: 'sotnik:deal' },
        replaceIf: [{
          if: { flag: 'poi:camp-deserters' }, title: 'Брошенные рогатки',
          steps: [{ obstacle: { kind: 'barricade', workSeconds: 30, text: 'Застава пуста. Осталось растащить рогатки.' } }],
        }],
      },
      {
        id: 'l1-looters', at: 0.85, jitter: 0.03, title: 'Шакалы Сухого дола', hint: 'Шайка из Сухого дола не дерётся — она тащит.',
        steps: [{
          spawn: [g('bandit_looter', 3, 'rear', 'looter'), g('bandit_thug', 2, 'left')],
          nightExtra: [g('bandit_looter', 2, 'right', 'looter'), g('bandit_scout', 2, 'front')],
        }],
        weakIf: [{ if: { flag: 'poi:camp-drydale' }, factor: 0.5 }],
      },
    ],
    banter: [
      'Перевал, значит. Тут воздух такой, что лошадь дышит за двоих.',
      'Видишь рогатый камень? За ним начинается земля Сотника. Была его, по крайней мере.',
      'Говорят, на Орлиной скале гнездятся птицы с телёнка. Врут. С козлёнка — видел сам.',
      'Вниз пошли. Теперь главное — тормоз, а не кнут.',
      'Солью тянет. Гавань за теми холмами, считай, доехали. Не сглазить бы.',
    ],
  },
  // ───────────────────────────── 2: Янтарная Гавань → Тихая долина ─────────────────────────────
  {
    leg: 2, baseLevel: 13, fee: 1650, xp: 3200, rep: { from: 12, to: 18 }, towFee: 160, prepHours: 4,
    brief: 'Самый большой обоз за десять лет: оружие, парусина, лазарет и гильдейский провиант. По старой южной дороге — через топи и лес Ворона.',
    manifest: [
      { itemId: 'weaponCrate', count: 6, category: 'goods', advance: 30 },
      { itemId: 'sailcloth', count: 8, category: 'goods', advance: 20 },
      { itemId: 'toolCrate', count: 8, category: 'goods', advance: 16 },
      { itemId: 'wagonKit', count: 4, category: 'goods', advance: 18 },
      { itemId: 'cobaltSteel', count: 16, category: 'materials', advance: 14 },
      { itemId: 'ironBeam', count: 12, category: 'materials', advance: 12 },
      { itemId: 'stoneBlock', count: 20, category: 'materials', advance: 6 },
      { itemId: 'reinforcedLeather', count: 16, category: 'materials', advance: 9 },
      { itemId: 'canvas', count: 20, category: 'materials', advance: 6 },
      { itemId: 'salt', count: 12, category: 'materials', advance: 5 },
      { itemId: 'guildProvisions', count: 6, category: 'provisions', advance: 28 },
      { itemId: 'provisionBarrel', count: 8, category: 'provisions', advance: 14 },
      { itemId: 'trailMeal', count: 20, category: 'provisions', advance: 5 },
      { itemId: 'fieldHospital', count: 3, category: 'medicine', advance: 40 },
      { itemId: 'medicineChest', count: 6, category: 'medicine', advance: 20 },
      { itemId: 'tonic', count: 12, category: 'medicine', advance: 7 },
    ],
    events: [
      {
        id: 'l2-lurkers', at: 0.1, jitter: 0.02, title: 'Топляки у гати', hint: 'В болотных окнах у самой дороги лежат топляки.',
        steps: [{ spawn: [g('marsh_lurker', [2, 3], 'left')], nightExtra: [g('marsh_lurker', 1, 'right')] }],
      },
      {
        id: 'l2-mud', at: 0.18, jitter: 0.02, title: 'Гать разошлась', hint: 'Старая гать сгнила, телега сядет по ступицу.',
        steps: [{ obstacle: { kind: 'mud', needs: { plank: 6 }, workSeconds: 18, slowSeconds: 70,
          text: 'Колёса ушли в жижу. Настели досок — или толкай до ночи.' } }],
      },
      {
        id: 'l2-marshgang', at: 0.28, jitter: 0.03, title: 'Топяное гнездо', hint: 'Болотная шайка знает тропы и бьёт из камыша.',
        steps: [
          { spawn: [g('bandit_archer', 3, 'left'), g('bandit_thug', 3, 'right')] },
          { spawn: [g('bandit_looter', 3, 'rear', 'looter'), g('bandit_brute', 1, 'front')] },
        ],
        skipIf: { flag: 'poi:camp-marsh' },
      },
      {
        id: 'l2-bridge', at: 0.4, jitter: 0.02, title: 'Гнилой мост', hint: 'Мост у крепостцы не выдержит гружёной телеги.',
        steps: [{ obstacle: { kind: 'broken-bridge', needs: { bridgeKit: 1 }, workSeconds: 25, slowSeconds: 180,
          text: 'Настил провален, сваи шатаются. С мостовым набором — четверть часа работы. Без него — вали лес и молись.' } }],
        variants: [{
          title: 'Гнилой мост и те, кто под ним',
          steps: [
            { spawn: [g('marsh_lurker', 2, 'left'), g('marsh_lurker', 1, 'right')] },
            { obstacle: { kind: 'broken-bridge', needs: { bridgeKit: 1 }, workSeconds: 25, slowSeconds: 180,
              text: 'Настил провален, сваи шатаются. С мостовым набором — четверть часа работы. Без него — вали лес и молись.' } },
          ],
        }],
      },
      {
        id: 'l2-spiders', at: 0.55, jitter: 0.03, title: 'Паутина поперёк дороги', hint: 'На въезде в Разбойничий лес — паучьи тенёта от ствола до ствола.',
        steps: [{ spawn: [g('giant_spider', 2, 'front'), g('spiderling', 5, 'left')], nightExtra: [g('spiderling', 4, 'right')] }],
      },
      {
        id: 'l2-raid', at: 0.66, jitter: 0.03, title: 'Налёт в три волны', hint: 'Люди Ворона изматывают обоз волнами и растаскивают груз.',
        steps: [
          { spawn: [g('bandit_scout', 3, 'left'), g('bandit_archer', 2, 'right')] },
          { spawn: [g('bandit_thug', 4, 'right'), g('bandit_looter', 3, 'rear', 'looter')] },
          { spawn: [g('bandit_brute', 2, 'front'), g('bandit_archer', 2, 'left'), g('bandit_looter', 2, 'rear', 'looter')] },
        ],
        weakIf: [{ if: { flag: 'leak:turned' }, factor: 0.6 }],
      },
      {
        id: 'l2-night', at: 0.78, jitter: 0.03, title: 'Тени за деревьями', hint: 'В лесу Ворона на обозы нападают в сумерках, без крика.',
        steps: [{
          spawn: [g('bandit_scout', 3, 'left'), g('shadow_cat', 1, 'right')],
          nightExtra: [g('bandit_scout', 3, 'right'), g('bandit_brute', 1, 'rear'), g('bandit_looter', 2, 'rear', 'looter')],
        }],
        weakIf: [{ if: { flag: 'ally:south' }, factor: 0.6 }],
      },
      {
        id: 'l2-raven', at: 0.92, jitter: 0.01, title: 'Атаман Ворон', boss: 'bandit_chief_raven',
        hint: 'Ворон не отдаст кольцо без боя. Он встретит обоз сам — у последней версты перед Южным дозором.',
        steps: [
          { spawn: [g('bandit_brute', 3, 'front', 'attacker', 1), g('bandit_archer', 4, 'left', 'attacker', 1), g('bandit_archer', 3, 'right', 'attacker', 1)] },
          { spawn: [g('bandit_thug', 5, 'rear'), g('bandit_looter', 4, 'rear', 'looter')] },
          { spawn: [g('bandit_chief_raven', 1, 'front', 'boss', 2), g('bandit_brute', 2, 'front', 'attacker', 2)] },
          { obstacle: { kind: 'barricade', workSeconds: 35, text: 'Тихо. Только вороньё орёт. Растащи завал — и домой.' } },
        ],
        replaceIf: [{
          if: { flag: 'poi:fort-raven' }, title: 'Последние из Вороньёва',
          steps: [
            { spawn: [g('bandit_brute', 2, 'front'), g('bandit_archer', 3, 'left')] },
            { obstacle: { kind: 'barricade', workSeconds: 35, text: 'Без атамана они и завал сложить толком не сумели.' } },
          ],
        }],
        weakIf: [{ if: { flag: 'leak:turned' }, factor: 0.75 }, { if: { flag: 'ally:south' }, factor: 0.85 }],
      },
    ],
    banter: [
      'Десять лет по этой дороге никто не возил больше мешка. А мы — обозом. Дураки или герои, вечером узнаем.',
      'Топи. Сойдёшь с гати — и поминай как звали. Держись колеи.',
      'Слышишь, как тихо? В добром лесу птицы орут. Здесь молчат.',
      'Крепостца вон там, за ольхой. При моём отце в ней сидел дозор. Теперь — кто попало.',
      'Это уже его лес. Вороньё. Гляди на деревья: зарубки — это их знаки.',
      'Если дойдём — я в «Тёплом жёрнове» неделю не просохну. Берта обещала в долг.',
      'Вон дозорная вышка. Долина. Мать честная, долина…',
    ],
  },
];

/**
 * Guild runs (stage 3): manifests are generated from these pools.
 * Each entry: [itemId, baseCount, category, advance]. `tierScale` multiplies counts per difficulty tier.
 */
export const GUILD_POOLS = [
  [
    ['flour', 24, 'provisions', 2], ['bread', 16, 'provisions', 3], ['provisionBarrel', 4, 'provisions', 14], ['ration', 12, 'provisions', 4],
    ['plank', 30, 'materials', 2], ['beam', 8, 'materials', 6], ['leather', 14, 'materials', 4], ['cloth', 14, 'materials', 4],
    ['handle', 10, 'goods', 4], ['tentBundle', 2, 'goods', 18], ['salve', 10, 'medicine', 4], ['bandage', 12, 'medicine', 3],
  ],
  [
    ['ingot', 30, 'materials', 4], ['steel', 14, 'materials', 9], ['cutStone', 24, 'materials', 3], ['coal', 40, 'materials', 1],
    ['toolCrate', 6, 'goods', 16], ['harnessSet', 4, 'goods', 18], ['buildingStone', 5, 'goods', 15], ['spareWheel', 3, 'goods', 12],
    ['ration', 18, 'provisions', 4], ['provisionBarrel', 5, 'provisions', 14], ['medicineChest', 3, 'medicine', 20], ['antidote', 8, 'medicine', 6],
  ],
  [
    ['weaponCrate', 5, 'goods', 30], ['sailcloth', 8, 'goods', 20], ['wagonKit', 4, 'goods', 18], ['toolCrate', 6, 'goods', 16],
    ['cobaltSteel', 12, 'materials', 14], ['ironBeam', 10, 'materials', 12], ['canvas', 18, 'materials', 6], ['reinforcedLeather', 12, 'materials', 9],
    ['guildProvisions', 5, 'provisions', 28], ['trailMeal', 18, 'provisions', 5], ['fieldHospital', 2, 'medicine', 40], ['tonic', 10, 'medicine', 7],
  ],
];

/** Guild-run tuning. */
export const GUILD_RUN = {
  lines: 6,            // manifest lines per run
  tierScale: 0.15,     // +15% cargo and enemy count per tier
  feeScale: 0.2,       // +20% fee per tier
  maxTier: 6,
  feeFactor: 0.8,      // guild runs pay a bit less than the story run of the same leg
};

/** Danger rating labels, index 0..4. */
export const DANGER_LABELS = ['Тихая дорога', 'Неспокойно', 'Опасно', 'Очень опасно', 'Гиблое дело'];

/**
 * Optional preparation per leg, shown in the readiness panel.
 * `flag` — done when the flag is set (several = any of them); `item` — done when the item is in the bag
 * (or the matching wagon upgrade is installed).
 */
export const LEG_PREP = [
  [
    { id: 'scout', flags: ['scout:leg0'], label: 'Разведать Лесной тракт', effect: 'Места засад отмечены на карте, врасплох не застанут' },
    { id: 'kosoy', flags: ['poi:camp-kosoy', 'kosoy:deal'], label: 'Разобраться с Косым: разорить лагерь или откупиться', effect: 'Ни мытарей, ни главной засады' },
  ],
  [
    { id: 'scout', flags: ['scout:leg1'], label: 'Разведать Орлиный перевал', effect: 'Места засад отмечены на карте, врасплох не застанут' },
    { id: 'sotnik', flags: ['poi:camp-deserters', 'sotnik:deal'], label: 'Разобраться с Сотником: взять заставу или привезти помилование', effect: 'Рогатки пусты, арбалетчиков вдвое меньше' },
    { id: 'drydale', flags: ['poi:camp-drydale'], label: 'Выжечь логово Сухого дола', effect: 'Мародёров у спуска вдвое меньше' },
    { id: 'wheel', item: 'spareWheel', upgrade: 'spareWheel', label: 'Взять запасное колесо', effect: 'Поломка на взвозе — минутное дело' },
  ],
  [
    { id: 'scout', flags: ['scout:leg2'], label: 'Разведать старую южную дорогу', effect: 'Места засад отмечены на карте, врасплох не застанут' },
    { id: 'marsh', flags: ['poi:camp-marsh'], label: 'Разорить Топяное гнездо', effect: 'Болотная шайка не выйдет к гати' },
    { id: 'bridge', item: 'bridgeKit', label: 'Запастись мостовым набором', effect: 'Гнилой мост чинится быстро' },
    { id: 'planks', item: 'plank', count: 6, label: 'Взять шесть досок на гать', effect: 'Грязь проходится без задержки' },
    { id: 'leak', flags: ['leak:turned'], label: 'Скормить Ворону ложное расписание', effect: 'Налёт и последняя засада слабее' },
    { id: 'ally', flags: ['ally:south'], label: 'Заручиться помощью Южного дозора', effect: 'Сумеречное нападение слабее, у последней версты подмога' },
    { id: 'raven', flags: ['poi:fort-raven'], label: 'Взять форт Вороньё до выезда', effect: 'Ворона на дороге не будет — только его недобитки' },
  ],
];
