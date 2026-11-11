// Consumables catalog: food, medicine, combat supplies and misc usable items. Pure data.
// items-catalog.js registers CONSUMABLE_ITEMS.
//
// use: {
//   heal            — instant hp
//   healOverTime    — { amount, duration } hp spread over `duration` seconds
//   stamina         — instant stamina
//   cure            — list of status ids removed ('poison' | 'bleed' | 'burn')
//   buff            — { id, name, stat, value, duration } timed bonus; `stat` is a derived-stat key,
//                     keys ending with "Mult" are multiplicative (+0.1 = +10 %), others are additive
// }
// cooldownGroup: 'food' | 'medicine' | 'gear' (whetstones and oils do not block healing).
// value = null → derived from the recipe.

const MINUTE = 60;

const food = (name, icon, rarity, tier, value, use, desc) => ({
  name, type: 'consumable', icon, rarity, tier, cat: 'meal', cooldownGroup: 'food', use, desc, value,
});

const medicine = (name, icon, rarity, tier, value, use, desc) => ({
  name, type: 'consumable', icon, rarity, tier, cat: 'medicine', cooldownGroup: 'medicine', use, desc, value,
});

const supply = (name, icon, rarity, tier, value, use, desc) => ({
  name, type: 'consumable', icon, rarity, tier, cat: 'medicine', cooldownGroup: 'gear', use, desc, value,
});

const overTime = (amount, duration) => ({ amount, duration });
const buff = (id, name, stat, value, minutes) => ({ id, name, stat, value, duration: minutes * MINUTE });

const FOOD = {
  flatbread: food('Лепёшка', 'bread', 'common', 1, null,
    { healOverTime: overTime(20, 10) }, 'Пресная лепёшка: +20 здоровья за 10 с.'),
  roastMeat: food('Жареное мясо', 'meat', 'common', 1, null,
    { healOverTime: overTime(28, 10) }, 'Дичь с костра: +28 здоровья за 10 с.'),
  bread: food('Хлеб', 'bread', 'common', 1, null,
    { healOverTime: overTime(40, 12) }, 'Каравай долины: +40 здоровья за 12 с.'),
  driedMeat: food('Вяленое мясо', 'meat', 'common', 1, null,
    { healOverTime: overTime(35, 10) }, 'Долго хранится в дороге: +35 здоровья за 10 с.'),
  stew: food('Мясная похлёбка', 'meal', 'common', 2, null,
    { healOverTime: overTime(65, 14) }, 'Горячая похлёбка с травами: +65 здоровья за 14 с.'),
  ration: food('Походный паёк', 'meal', 'fine', 2, null,
    { healOverTime: overTime(90, 15) }, 'Хлеб, мясо и целебный лист: +90 здоровья за 15 с.'),
  honeyCake: food('Медовая коврижка', 'bread', 'fine', 2, null,
    { healOverTime: overTime(60, 12), buff: buff('sweet', 'Сладкое', 'staminaRegenMult', 0.2, 5) },
    '+60 здоровья за 12 с и восстановление сил +20 % на 5 мин.'),
  fishSoup: food('Рыбацкая уха', 'meal', 'fine', 2, null,
    { healOverTime: overTime(100, 15) }, 'Густая уха Янтарного берега: +100 здоровья за 15 с.'),
  cheesePie: food('Сырный пирог', 'bread', 'fine', 2, null,
    { healOverTime: overTime(110, 15), buff: buff('wellFed', 'Сытость', 'maxHp', 15, 10) },
    '+110 здоровья за 15 с и +15 к запасу здоровья на 10 мин.'),
  trailMeal: food('Дорожный обед', 'meal', 'fine', 3, null,
    { healOverTime: overTime(130, 15), buff: buff('wellFed', 'Сытость', 'maxHp', 25, 10) },
    '+130 здоровья за 15 с и +25 к запасу здоровья на 10 мин.'),
  ale: food('Ржаной эль', 'wine', 'fine', 3, null,
    { stamina: 40, buff: buff('ale', 'Кураж', 'attackMult', 0.05, 5) },
    'Сразу +40 сил и +5 % урона на 5 мин.'),
  feast: food('Обед экспедиции', 'meal', 'rare', 4, null,
    { healOverTime: overTime(190, 15), buff: buff('wellFed', 'Сытость', 'maxHp', 40, 15) },
    '+190 здоровья за 15 с и +40 к запасу здоровья на 15 мин.'),
  spicedMeal: food('Пряный паёк', 'meal', 'epic', 5, null,
    { healOverTime: overTime(240, 15), buff: buff('spiced', 'Пряный жар', 'attackMult', 0.06, 15) },
    '+240 здоровья за 15 с и +6 % урона на 15 мин.'),
  guildFeast: food('Пир торгового союза', 'meal', 'epic', 5, null,
    { healOverTime: overTime(320, 15), buff: buff('wellFed', 'Сытость', 'maxHp', 70, 20) },
    '+320 здоровья за 15 с и +70 к запасу здоровья на 20 мин.'),
  herbalTea: food('Травяной чай', 'potion', 'common', 1, null,
    { stamina: 25, buff: buff('tea', 'Бодрость', 'staminaRegenMult', 0.25, 5) },
    'Сразу +25 сил и восстановление сил +25 % на 5 мин.'),
};

const MEDICINE = {
  salve: medicine('Лечебная мазь', 'salve', 'common', 1, null,
    { heal: 35 }, 'Сразу восстанавливает 35 здоровья.'),
  bandage: medicine('Перевязочный набор', 'bandage', 'common', 1, null,
    { heal: 15, healOverTime: overTime(30, 10), cure: ['bleed'] },
    'Останавливает кровотечение: +15 здоровья сразу и ещё 30 за 10 с.'),
  antidote: medicine('Противоядие', 'potion', 'fine', 2, null,
    { heal: 20, cure: ['poison'] }, 'Снимает отравление и восстанавливает 20 здоровья.'),
  stypticPowder: medicine('Кровоостанавливающий порошок', 'salve', 'fine', 2, null,
    { cure: ['bleed', 'burn'], heal: 10 }, 'Снимает кровотечение и ожог, +10 здоровья.'),
  tonic: medicine('Укрепляющий настой', 'potion', 'fine', 2, null,
    { heal: 95 }, 'Сразу восстанавливает 95 здоровья.'),
  staminaTonic: medicine('Настой бодрости', 'potion', 'fine', 3, null,
    { stamina: 70, buff: buff('vigor', 'Прилив сил', 'staminaRegenMult', 0.4, 3) },
    'Сразу +70 сил и восстановление сил +40 % на 3 мин.'),
  ironSkinSalve: medicine('Дубящая мазь', 'salve', 'fine', 3, null,
    { buff: buff('ironSkin', 'Дублёная кожа', 'armor', 20, 5) },
    'Грубит кожу: +20 брони на 5 мин.'),
  focusDrops: medicine('Капли сосредоточения', 'potion', 'rare', 3, null,
    { buff: buff('focus', 'Сосредоточенность', 'critChance', 0.08, 5) },
    'Обостряют зрение и реакцию: +8 % шанса точного удара на 5 мин.'),
  fieldkit: medicine('Хирургический набор', 'kit', 'rare', 4, null,
    { heal: 170, cure: ['bleed', 'poison'] }, '+170 здоровья, снимает кровотечение и яд.'),
  swiftnessBrew: medicine('Настой лёгкого шага', 'potion', 'rare', 4, null,
    { buff: buff('swift', 'Лёгкий шаг', 'moveSpeedMult', 0.15, 3) },
    'Скорость бега +15 % на 3 мин.'),
  lunarSalve: medicine('Лунная мазь', 'salve', 'epic', 5, null,
    { healOverTime: overTime(220, 20), cure: ['burn'] },
    'Затягивает раны на глазах: +220 здоровья за 20 с, снимает ожог.'),
  lunarElixir: medicine('Лунный эликсир', 'potion', 'epic', 5, null,
    { heal: 320, cure: ['bleed', 'poison', 'burn'] },
    'Сильнейшее лекарство кольца: +320 здоровья и снятие всех недугов.'),
};

const SUPPLIES = {
  whetstone: supply('Точильный камень', 'stone', 'common', 1, null,
    { buff: buff('sharp', 'Острая кромка', 'attackMult', 0.06, 10) },
    'Правит клинок и наконечники: +6 % урона на 10 мин.'),
  weaponOil: supply('Оружейное масло', 'potion', 'fine', 2, null,
    { buff: buff('oiled', 'Смазанный механизм', 'critChance', 0.05, 10) },
    'Смазка для клинков, тетивы и механизмов: +5 % шанса точного удара на 10 мин.'),
};

/** Non-consumed utility and knowledge items. */
const MISC = {
  torch: {
    name: 'Факел', type: 'tool', slot: 'tool', icon: 'tool', rarity: 'common', tier: 1, cat: 'tool',
    value: null, light: { radius: 14 },
    desc: 'Смоляной факел: освещает дорогу ночью и в штольнях.',
  },
  fieldnote: {
    name: 'Заметки исследователя', type: 'note', icon: 'note', rarity: 'fine', tier: 2, cat: 'misc',
    value: 30, professionXp: 60,
    desc: 'Наблюдения прежних путников. Прочтите, чтобы получить опыт основной профессии.',
  },
};

/** Every consumable and misc usable item by id (not yet registered). */
export const CONSUMABLE_ITEMS = {
  ...FOOD,
  ...MEDICINE,
  ...SUPPLIES,
  ...MISC,
};
