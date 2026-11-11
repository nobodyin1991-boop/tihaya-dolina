// Classes and their abilities. Pure data.
// No magic: fighters rely on technique, the scientist on a field emitter with capsules,
// the medic on medicine and darts, the engineer on a crossbow and a mechanical companion.
//
// Ability schema (the engine implements the `shape`s):
//   { id, classId, slot (1..5), name, desc, icon, cooldown, staminaCost, range, requiredLevel,
//     shape, params, ranks: [5 × { power, … }], effects: [{ type, key?, duration?, value?, stat? }], fx }
// Rank rows may override effect numbers with `<key>Duration` / `<key>Value`, where key is the
// effect's `key` (or its `type`). resolveAbility() applies the overrides.
// Effect value conventions: buff — change of `stat` (keys ending in "Mult" are multiplicative);
// heal / shield — share of the hero's max hp; hot — share of max hp PER SECOND for `duration`;
// slow / weaken / mark — fraction; knockback — metres;
// burn / bleed / poison — share of the attack stat per tick (see STATUS in sim/combat.js).

export const ATTRIBUTES = {
  strength: { id: 'strength', name: 'Сила', desc: 'Урон силовых классов и немного брони.' },
  agility: { id: 'agility', name: 'Ловкость', desc: 'Урон ловких классов, шанс точного удара и скорость.' },
  endurance: { id: 'endurance', name: 'Выносливость', desc: 'Запас здоровья и сил.' },
  wits: { id: 'wits', name: 'Смекалка', desc: 'Урон приборов и лекарств, сила лечения, ремесло и торг.' },
};
export const ATTRIBUTE_IDS = Object.keys(ATTRIBUTES);

/** Hero level at which each ability slot opens. */
export const SLOT_REQUIRED_LEVEL = [1, 1, 3, 6, 12];
export const ABILITY_MAX_RANK = 5;

/** Turn column arrays into five rank rows: ranks({power:[…5]}) -> [{power}, …]. */
function ranks(columns) {
  const rows = [];
  for (let index = 0; index < ABILITY_MAX_RANK; index++) {
    const row = {};
    for (const [key, values] of Object.entries(columns)) row[key] = values[index];
    rows.push(row);
  }
  return rows;
}

const fx = (color, anim, sound) => ({ color, anim, sound });

/** Class ability lists; classId, slot and requiredLevel are filled in by buildAbilities(). */
const ABILITY_ROWS = {
  warrior: [
    {
      id: 'sweep', name: 'Круговой удар', icon: '↻', cooldown: 7, staminaCost: 20, range: 4,
      desc: 'Широкий мах двуручником по всем врагам вокруг.',
      shape: 'aoe-self', params: { radius: 4, maxTargets: 4 },
      ranks: ranks({ power: [1.5, 1.65, 1.8, 1.95, 2.15] }),
      effects: [], fx: fx(0xf3bd65, 'attack', 'sword'),
    },
    {
      id: 'crush', name: 'Сокрушение', icon: '▼', cooldown: 10, staminaCost: 25, range: 3.5,
      desc: 'Тяжёлый удар сверху, оглушающий цель.',
      shape: 'melee-single', params: {},
      ranks: ranks({ power: [2.4, 2.6, 2.85, 3.1, 3.4], stunDuration: [2, 2, 2.5, 2.5, 3] }),
      effects: [{ type: 'stun', duration: 2 }], fx: fx(0xee794d, 'attack', 'impact'),
    },
    {
      id: 'rally', name: 'Боевой настрой', icon: '↑', cooldown: 18, staminaCost: 15, range: 0,
      desc: 'Собраться перед схваткой: больше урона и меньше получаемых повреждений.',
      shape: 'self-buff', params: {},
      ranks: ranks({ power: [0, 0, 0, 0, 0], powerValue: [0.3, 0.35, 0.4, 0.45, 0.5], powerDuration: [6, 6, 7, 7, 8], guardDuration: [6, 6, 7, 7, 8] }),
      effects: [
        { type: 'buff', key: 'power', stat: 'attackMult', value: 0.3, duration: 6 },
        { type: 'buff', key: 'guard', stat: 'damageTakenMult', value: -0.15, duration: 6 },
      ],
      fx: fx(0xffdb83, 'cast', 'shield'),
    },
    {
      id: 'cleave', name: 'Рассекающий удар', icon: '⚔', cooldown: 11, staminaCost: 28, range: 4,
      desc: 'Мощный косой удар по врагам перед собой, оставляющий кровоточащие раны.',
      shape: 'melee-arc', params: { angle: 120, maxTargets: 3 },
      ranks: ranks({ power: [2.3, 2.5, 2.7, 2.95, 3.2], bleedDuration: [5, 5, 6, 6, 7] }),
      effects: [{ type: 'bleed', duration: 5, value: 0.18 }], fx: fx(0xf2a55e, 'attack', 'sword'),
    },
    {
      id: 'earthbreak', name: 'Удар по земле', icon: '◎', cooldown: 20, staminaCost: 40, range: 6,
      desc: 'Удар клинком в землю: враги вокруг отброшены и оглушены.',
      shape: 'aoe-self', params: { radius: 6, maxTargets: 6 },
      ranks: ranks({ power: [2.6, 2.8, 3.05, 3.3, 3.6], stunDuration: [2, 2, 2.5, 2.5, 3] }),
      effects: [{ type: 'stun', duration: 2 }, { type: 'knockback', value: 3 }], fx: fx(0xd4a66d, 'attack', 'impact'),
    },
  ],

  guardian: [
    {
      id: 'bash', name: 'Удар щитом', icon: '▣', cooldown: 8, staminaCost: 20, range: 3.2,
      desc: 'Удар кромкой щита, оглушающий противника.',
      shape: 'melee-single', params: {},
      ranks: ranks({ power: [1.2, 1.35, 1.5, 1.65, 1.8], stunDuration: [3, 3, 3.5, 3.5, 4] }),
      effects: [{ type: 'stun', duration: 3 }], fx: fx(0x9ccde9, 'block', 'shield'),
    },
    {
      id: 'wall', name: 'Глухая оборона', icon: '⬡', cooldown: 16, staminaCost: 20, range: 12,
      desc: 'Уйти за щит и вызвать врагов на себя: получаемый урон резко снижен.',
      shape: 'self-buff', params: { radius: 12 },
      ranks: ranks({ power: [0, 0, 0, 0, 0], guardValue: [-0.5, -0.55, -0.6, -0.65, -0.7], guardDuration: [7, 7, 8, 8, 9] }),
      effects: [
        { type: 'buff', key: 'guard', stat: 'damageTakenMult', value: -0.5, duration: 7 },
        { type: 'taunt', duration: 5 },
      ],
      fx: fx(0x6fa7f0, 'block', 'shield'),
    },
    {
      id: 'resolve', name: 'Второе дыхание', icon: '＋', cooldown: 20, staminaCost: 15, range: 0,
      desc: 'Перевести дух и восстановить часть здоровья.',
      shape: 'heal-self', params: {},
      ranks: ranks({ power: [0, 0, 0, 0, 0], healValue: [0.25, 0.28, 0.32, 0.36, 0.4] }),
      effects: [{ type: 'heal', value: 0.25 }], fx: fx(0xa4e2c8, 'cast', 'heal'),
    },
    {
      id: 'challenge', name: 'Натиск щита', icon: '➤', cooldown: 12, staminaCost: 28, range: 7,
      desc: 'Рывок со щитом вперёд: сбивает врагов на пути и приковывает их внимание.',
      shape: 'dash', params: { dashDistance: 6, maxTargets: 3 },
      ranks: ranks({ power: [2.0, 2.2, 2.4, 2.6, 2.85], stunDuration: [2, 2, 2.5, 2.5, 3] }),
      effects: [{ type: 'stun', duration: 2 }, { type: 'taunt', duration: 6 }], fx: fx(0xa5c5e4, 'block', 'impact'),
    },
    {
      id: 'bastion', name: 'Бастион', icon: '⛨', cooldown: 24, staminaCost: 35, range: 0,
      desc: 'Несокрушимая стойка: долгая защита и постепенное восстановление здоровья.',
      shape: 'self-buff', params: {},
      ranks: ranks({ power: [0, 0, 0, 0, 0], guardDuration: [10, 10, 11, 11, 12], hotValue: [0.04, 0.045, 0.05, 0.055, 0.06] }),
      effects: [
        { type: 'buff', key: 'guard', stat: 'damageTakenMult', value: -0.5, duration: 10 },
        { type: 'hot', value: 0.04, duration: 8 },
      ],
      fx: fx(0x91c6ca, 'block', 'shield'),
    },
  ],

  scientist: [
    {
      id: 'frost', name: 'Холодный импульс', icon: '❄', cooldown: 7, staminaCost: 18, range: 18,
      desc: 'Капсула хладагента: урон и сильное замедление цели.',
      shape: 'projectile', params: { projectileSpeed: 34 },
      ranks: ranks({ power: [1.2, 1.35, 1.5, 1.65, 1.85], slowDuration: [5, 5, 6, 6, 7] }),
      effects: [{ type: 'slow', duration: 5, value: 0.45 }], fx: fx(0x91e5ff, 'cast', 'ice'),
    },
    {
      id: 'arc', name: 'Цепной разряд', icon: 'ϟ', cooldown: 10, staminaCost: 24, range: 18,
      desc: 'Разряд излучателя перескакивает с цели на стоящих рядом врагов.',
      shape: 'chain', params: { jumps: 3, radius: 5 },
      ranks: ranks({ power: [1.6, 1.75, 1.9, 2.1, 2.3], jumps: [3, 3, 4, 4, 5] }),
      effects: [], fx: fx(0xd3b5ff, 'cast', 'spark'),
    },
    {
      id: 'heat', name: 'Горячая капсула', icon: '◆', cooldown: 13, staminaCost: 24, range: 18,
      desc: 'Зажигательная капсула: урон и горение.',
      shape: 'projectile', params: { projectileSpeed: 30 },
      ranks: ranks({ power: [1.5, 1.65, 1.8, 2.0, 2.2], burnDuration: [5, 5, 6, 6, 7] }),
      effects: [{ type: 'burn', duration: 5, value: 0.25 }], fx: fx(0xff8451, 'cast', 'fire'),
    },
    {
      id: 'overload', name: 'Перегрузка', icon: '✺', cooldown: 14, staminaCost: 32, range: 20,
      desc: 'Мощный разряд по группе: поражённые враги бьют слабее.',
      shape: 'aoe-target', params: { radius: 5, maxTargets: 4 },
      ranks: ranks({ power: [2.5, 2.7, 2.95, 3.2, 3.5], weakenDuration: [5, 5, 6, 6, 7] }),
      effects: [{ type: 'weaken', duration: 5, value: 0.2 }], fx: fx(0xb7a2ee, 'cast', 'spark'),
    },
    {
      id: 'blizzard', name: 'Криокапсула', icon: '❅', cooldown: 22, staminaCost: 40, range: 21,
      desc: 'Большая капсула хладагента сковывает и замедляет целую группу.',
      shape: 'aoe-target', params: { radius: 6, maxTargets: 5 },
      ranks: ranks({ power: [2.2, 2.4, 2.6, 2.85, 3.1], stunDuration: [2, 2, 2.5, 2.5, 3], slowDuration: [8, 8, 9, 9, 10] }),
      effects: [{ type: 'stun', duration: 2 }, { type: 'slow', duration: 8, value: 0.5 }], fx: fx(0x9ceaff, 'cast', 'ice'),
    },
  ],

  duelist: [
    {
      id: 'double', name: 'Двойной выпад', icon: 'Ⅱ', cooldown: 6, staminaCost: 18, range: 3.4,
      desc: 'Два быстрых укола по одной цели.',
      shape: 'melee-single', params: { hits: 2 },
      ranks: ranks({ power: [2.0, 2.2, 2.4, 2.6, 2.85] }),
      effects: [], fx: fx(0xf2b6db, 'attack', 'sword'),
    },
    {
      id: 'parry', name: 'Парирование', icon: '╳', cooldown: 12, staminaCost: 15, range: 0,
      desc: 'Отвести удары клинками и ответить точнее.',
      shape: 'self-buff', params: {},
      ranks: ranks({ power: [0, 0, 0, 0, 0], guardDuration: [4, 4, 5, 5, 6], powerValue: [0.2, 0.25, 0.3, 0.35, 0.4] }),
      effects: [
        { type: 'buff', key: 'guard', stat: 'damageTakenMult', value: -0.6, duration: 4 },
        { type: 'buff', key: 'power', stat: 'attackMult', value: 0.2, duration: 6 },
      ],
      fx: fx(0xd9e2f4, 'block', 'sword'),
    },
    {
      id: 'lunge', name: 'Рывок', icon: '➤', cooldown: 12, staminaCost: 20, range: 7,
      desc: 'Стремительный бросок к врагу с уколом на ходу и короткое ускорение.',
      shape: 'dash', params: { dashDistance: 6, maxTargets: 1 },
      ranks: ranks({ power: [1.3, 1.45, 1.6, 1.75, 1.95], hasteDuration: [4, 4, 5, 5, 6] }),
      effects: [{ type: 'buff', key: 'haste', stat: 'moveSpeedMult', value: 0.3, duration: 4 }],
      fx: fx(0xd49aff, 'attack', 'sword'),
    },
    {
      id: 'flurry', name: 'Серия выпадов', icon: 'Ⅲ', cooldown: 11, staminaCost: 28, range: 3.5,
      desc: 'Три удара подряд, вскрывающие защиту: цель истекает кровью.',
      shape: 'melee-single', params: { hits: 3 },
      ranks: ranks({ power: [3.0, 3.25, 3.5, 3.8, 4.1], bleedDuration: [5, 5, 6, 6, 7] }),
      effects: [{ type: 'bleed', duration: 5, value: 0.18 }], fx: fx(0xe6b4ca, 'attack', 'sword'),
    },
    {
      id: 'precision', name: 'Точная стойка', icon: '◈', cooldown: 23, staminaCost: 30, range: 0,
      desc: 'Полная сосредоточенность: урон, точность и скорость надолго возрастают.',
      shape: 'self-buff', params: {},
      ranks: ranks({ power: [0, 0, 0, 0, 0], powerValue: [0.3, 0.34, 0.38, 0.42, 0.48], powerDuration: [10, 10, 11, 11, 12] }),
      effects: [
        { type: 'buff', key: 'power', stat: 'attackMult', value: 0.3, duration: 10 },
        { type: 'buff', key: 'crit', stat: 'critChance', value: 0.15, duration: 10 },
        { type: 'buff', key: 'haste', stat: 'moveSpeedMult', value: 0.2, duration: 6 },
      ],
      fx: fx(0xc5b6f4, 'cast', 'sword'),
    },
  ],

  archer: [
    {
      id: 'aim', name: 'Прицельный выстрел', icon: '◎', cooldown: 8, staminaCost: 20, range: 25,
      desc: 'Тщательно выверенная стрела на большую дистанцию.',
      shape: 'projectile', params: { projectileSpeed: 60 },
      ranks: ranks({ power: [2.3, 2.5, 2.75, 3.0, 3.3] }),
      effects: [], fx: fx(0xf4d477, 'shoot', 'bow'),
    },
    {
      id: 'fan', name: 'Веер стрел', icon: '⋔', cooldown: 10, staminaCost: 24, range: 21,
      desc: 'Три стрелы разом по врагам возле цели.',
      shape: 'aoe-target', params: { radius: 6, maxTargets: 3 },
      ranks: ranks({ power: [1.3, 1.45, 1.6, 1.75, 1.95], maxTargets: [3, 3, 4, 4, 5] }),
      effects: [], fx: fx(0xb9d87c, 'shoot', 'bow'),
    },
    {
      id: 'retreat', name: 'Отскок', icon: '↶', cooldown: 12, staminaCost: 15, range: 0,
      desc: 'Прыжок назад от врага и короткое ускорение.',
      shape: 'leap-back', params: { dashDistance: 5 },
      ranks: ranks({ power: [0, 0, 0, 0, 0], hasteDuration: [4, 4, 5, 5, 6] }),
      effects: [{ type: 'buff', key: 'haste', stat: 'moveSpeedMult', value: 0.3, duration: 4 }],
      fx: fx(0x8bdcc4, 'cast', 'bow'),
    },
    {
      id: 'pin', name: 'Пригвождающая стрела', icon: '➶', cooldown: 12, staminaCost: 26, range: 25,
      desc: 'Стрела в ногу: цель обездвижена и становится уязвимее.',
      shape: 'projectile', params: { projectileSpeed: 55 },
      ranks: ranks({ power: [2.4, 2.6, 2.85, 3.1, 3.4], stunDuration: [3, 3, 3.5, 3.5, 4] }),
      effects: [{ type: 'stun', duration: 3 }, { type: 'mark', duration: 6, value: 0.15 }], fx: fx(0xe1c57c, 'shoot', 'bow'),
    },
    {
      id: 'volley', name: 'Залп', icon: '☄', cooldown: 20, staminaCost: 38, range: 25,
      desc: 'Навесной залп накрывает группу врагов и сбивает им шаг.',
      shape: 'aoe-target', params: { radius: 7, maxTargets: 5 },
      ranks: ranks({ power: [2.3, 2.5, 2.75, 3.0, 3.3], slowDuration: [4, 4, 5, 5, 6] }),
      effects: [{ type: 'slow', duration: 4, value: 0.35 }], fx: fx(0xbce19a, 'shoot', 'bow'),
    },
  ],

  medic: [
    {
      id: 'dressing', name: 'Перевязка', icon: '＋', cooldown: 8, staminaCost: 15, range: 0,
      desc: 'Быстро обработать рану: мгновенное лечение и остановка кровотечения.',
      shape: 'heal-self', params: {},
      ranks: ranks({ power: [0, 0, 0, 0, 0], healValue: [0.3, 0.33, 0.37, 0.41, 0.46] }),
      effects: [{ type: 'heal', value: 0.3 }], fx: fx(0xc8e8b0, 'cast', 'heal'),
    },
    {
      id: 'sedative', name: 'Седативный дротик', icon: '•', cooldown: 10, staminaCost: 20, range: 13,
      desc: 'Дротик со снотворным: цель ненадолго отключается и потом еле движется.',
      shape: 'projectile', params: { projectileSpeed: 40 },
      ranks: ranks({ power: [1.4, 1.55, 1.7, 1.9, 2.1], stunDuration: [2, 2, 2.5, 2.5, 3], slowDuration: [5, 5, 6, 6, 7] }),
      effects: [{ type: 'stun', duration: 2 }, { type: 'slow', duration: 5, value: 0.4 }], fx: fx(0xc5cba0, 'shoot', 'impact'),
    },
    {
      id: 'recovery', name: 'Восстановление', icon: '✚', cooldown: 18, staminaCost: 20, range: 0,
      desc: 'Принять восстанавливающий состав: здоровье возвращается постепенно.',
      shape: 'heal-self', params: {},
      ranks: ranks({ power: [0, 0, 0, 0, 0], hotValue: [0.065, 0.07, 0.08, 0.085, 0.095] }),
      effects: [{ type: 'hot', value: 0.065, duration: 7 }], fx: fx(0x81dbb8, 'cast', 'heal'),
    },
    {
      id: 'stimulant', name: 'Стимулятор', icon: '↑', cooldown: 14, staminaCost: 22, range: 13,
      desc: 'Укол стимулятора себе и дротик с ядом врагу: вы быстрее и сильнее, цель отравлена.',
      shape: 'projectile', params: { projectileSpeed: 40 },
      ranks: ranks({ power: [1.6, 1.75, 1.9, 2.1, 2.3], powerValue: [0.25, 0.28, 0.32, 0.36, 0.4], poisonDuration: [6, 6, 7, 7, 8] }),
      effects: [
        { type: 'buff', key: 'power', stat: 'attackMult', value: 0.25, duration: 8 },
        { type: 'buff', key: 'haste', stat: 'moveSpeedMult', value: 0.2, duration: 6 },
        { type: 'poison', duration: 6, value: 0.2 },
      ],
      fx: fx(0xcddba5, 'shoot', 'impact'),
    },
    {
      id: 'triage', name: 'Экстренная помощь', icon: '✙', cooldown: 24, staminaCost: 35, range: 0,
      desc: 'Всё лучшее из сумки разом: сильное лечение и временная защита.',
      shape: 'heal-self', params: {},
      ranks: ranks({ power: [0, 0, 0, 0, 0], healValue: [0.5, 0.55, 0.6, 0.66, 0.75], shieldValue: [0.15, 0.18, 0.21, 0.24, 0.28] }),
      effects: [{ type: 'heal', value: 0.5 }, { type: 'shield', value: 0.15, duration: 6 }],
      fx: fx(0xa6e6c2, 'cast', 'heal'),
    },
  ],

  engineer: [
    {
      id: 'bolt', name: 'Усиленный болт', icon: '⚙', cooldown: 7, staminaCost: 18, range: 18,
      desc: 'Тяжёлый болт с усиленным взводом отбрасывает цель.',
      shape: 'projectile', params: { projectileSpeed: 65 },
      ranks: ranks({ power: [2.0, 2.2, 2.4, 2.6, 2.85] }),
      effects: [{ type: 'knockback', value: 2 }], fx: fx(0xffd087, 'shoot', 'impact'),
    },
    {
      id: 'shock', name: 'Разряд катушки', icon: 'ϟ', cooldown: 13, staminaCost: 25, range: 5,
      desc: 'Катушка на поясе бьёт током всех, кто подошёл вплотную.',
      shape: 'aoe-self', params: { radius: 5, maxTargets: 4 },
      ranks: ranks({ power: [1.2, 1.35, 1.5, 1.65, 1.8], stunDuration: [2, 2, 2.5, 2.5, 3] }),
      effects: [{ type: 'stun', duration: 2 }], fx: fx(0x83dcea, 'cast', 'spark'),
    },
    {
      id: 'overdrive', name: 'Форсаж', icon: '⇈', cooldown: 18, staminaCost: 22, range: 0,
      desc: 'Механический спутник работает на пределе: его урон и скорость резко растут.',
      shape: 'companion', params: {},
      ranks: ranks({ power: [0, 0, 0, 0, 0], companionValue: [0.6, 0.7, 0.8, 0.9, 1.0], companionDuration: [7, 7, 8, 8, 9] }),
      effects: [
        { type: 'buff', key: 'companion', stat: 'companionAttackMult', value: 0.6, duration: 7 },
        { type: 'buff', key: 'haste', stat: 'moveSpeedMult', value: 0.2, duration: 7 },
      ],
      fx: fx(0xffa758, 'cast', 'spark'),
    },
    {
      id: 'shrapnel', name: 'Картечь', icon: '⁂', cooldown: 13, staminaCost: 30, range: 17,
      desc: 'Заряд рубленого железа накрывает группу и оставляет рваные раны.',
      shape: 'aoe-target', params: { radius: 5, maxTargets: 4 },
      ranks: ranks({ power: [2.3, 2.5, 2.75, 3.0, 3.3], bleedDuration: [5, 5, 6, 6, 7] }),
      effects: [{ type: 'bleed', duration: 5, value: 0.15 }], fx: fx(0xecc184, 'shoot', 'impact'),
    },
    {
      id: 'barrier', name: 'Защитный контур', icon: '⬡', cooldown: 24, staminaCost: 35, range: 0,
      desc: 'Спутник разворачивает щитки вокруг хозяина и чинит себя: прочный заслон на несколько секунд.',
      shape: 'companion', params: {},
      ranks: ranks({ power: [0, 0, 0, 0, 0], shieldValue: [0.3, 0.34, 0.38, 0.43, 0.5], guardDuration: [8, 8, 9, 9, 10] }),
      effects: [
        { type: 'shield', value: 0.3, duration: 8 },
        { type: 'buff', key: 'guard', stat: 'damageTakenMult', value: -0.25, duration: 8 },
        { type: 'buff', key: 'companion', stat: 'companionAttackMult', value: 0.4, duration: 8 },
      ],
      fx: fx(0x9adbd6, 'block', 'shield'),
    },
  ],
};

/**
 * CLASSES[id] = { id, name, desc, color, weaponKind, primary, hp, hpPerLevel, attack,
 *                 attrs, basicAttack, companion?, abilities:[5 ids] }
 * basicAttack = { range, interval, power, shape, params, fx }
 */
export const CLASSES = {
  warrior: {
    id: 'warrior', name: 'Двуручный мечник', desc: 'Сила и широкий удар. Тяжёлые доспехи.',
    color: 0xb97a53, weaponKind: 'greatsword', primary: 'strength',
    hp: 100, hpPerLevel: 14, attack: 14,
    attrs: { strength: 8, agility: 4, endurance: 6, wits: 3 },
    basicAttack: { range: 3.2, interval: 1.3, power: 1, shape: 'melee-arc', params: { angle: 110, maxTargets: 2 }, fx: fx(0xe8c9a0, 'attack', 'sword') },
  },
  guardian: {
    id: 'guardian', name: 'Щитоносец', desc: 'Меч, щит и глухая защита. Единственный, кто носит щит.',
    color: 0x718eaa, weaponKind: 'sword', primary: 'strength',
    hp: 115, hpPerLevel: 16, attack: 12,
    attrs: { strength: 7, agility: 3, endurance: 8, wits: 3 },
    basicAttack: { range: 2.8, interval: 1.1, power: 1, shape: 'melee-single', params: {}, fx: fx(0xc8d8e8, 'attack', 'sword') },
  },
  scientist: {
    id: 'scientist', name: 'Учёный', desc: 'Полевой излучатель: холод, разряды и жар на расстоянии.',
    color: 0x80c6cc, weaponKind: 'device', primary: 'wits',
    hp: 80, hpPerLevel: 10, attack: 13,
    attrs: { strength: 3, agility: 4, endurance: 5, wits: 9 },
    basicAttack: { range: 17, interval: 1.3, power: 1, shape: 'projectile', params: { projectileSpeed: 38 }, fx: fx(0x9fe6f0, 'cast', 'spark') },
  },
  duelist: {
    id: 'duelist', name: 'Дуэлянт', desc: 'Парные клинки, скорость и точные серии.',
    color: 0xae8094, weaponKind: 'blades', primary: 'agility',
    hp: 90, hpPerLevel: 12, attack: 12,
    attrs: { strength: 5, agility: 9, endurance: 5, wits: 3 },
    basicAttack: { range: 2.8, interval: 0.8, power: 0.72, shape: 'melee-single', params: {}, fx: fx(0xf0c8dc, 'attack', 'sword') },
  },
  archer: {
    id: 'archer', name: 'Лучник', desc: 'Дистанция и точность.',
    color: 0x8faa67, weaponKind: 'bow', primary: 'agility',
    hp: 85, hpPerLevel: 11, attack: 13,
    attrs: { strength: 4, agility: 9, endurance: 5, wits: 4 },
    basicAttack: { range: 20, interval: 1.25, power: 1, shape: 'projectile', params: { projectileSpeed: 55 }, fx: fx(0xe8dca0, 'shoot', 'bow') },
  },
  medic: {
    id: 'medic', name: 'Полевой лекарь', desc: 'Медицина, дротики и живучесть.',
    color: 0xd4d7bb, weaponKind: 'medkit', primary: 'wits',
    hp: 95, hpPerLevel: 12, attack: 11,
    attrs: { strength: 4, agility: 5, endurance: 6, wits: 7 },
    basicAttack: { range: 12, interval: 1.15, power: 0.95, shape: 'projectile', params: { projectileSpeed: 40 }, fx: fx(0xd8e0b8, 'shoot', 'impact') },
  },
  engineer: {
    id: 'engineer', name: 'Инженер', desc: 'Арбалет-болтомёт и механический спутник, который дерётся рядом.',
    color: 0xcfa85f, weaponKind: 'crossbow', primary: 'wits',
    hp: 95, hpPerLevel: 12, attack: 10,
    attrs: { strength: 4, agility: 6, endurance: 5, wits: 7 },
    basicAttack: { range: 16, interval: 1.5, power: 1.05, shape: 'projectile', params: { projectileSpeed: 65 }, fx: fx(0xf0d8a0, 'shoot', 'bow') },
    companion: {
      name: 'Механический спутник',
      hpShare: 0.6,        // of the engineer's max hp
      attackShare: 0.45,   // of the engineer's attack per hit
      interval: 1.6,
      range: 2.5,
      followDistance: 3,
    },
  },
};

export const CLASS_IDS = Object.keys(CLASSES);

function buildAbilities() {
  const abilities = {};
  for (const [classId, rows] of Object.entries(ABILITY_ROWS)) {
    rows.forEach((row, index) => {
      abilities[row.id] = { ...row, classId, slot: index + 1, requiredLevel: SLOT_REQUIRED_LEVEL[index] };
    });
    CLASSES[classId].abilities = rows.map(row => row.id);
  }
  return abilities;
}

/** Every ability by id. */
export const ABILITIES = buildAbilities();

/** The five abilities of a class in slot order. */
export const abilitiesOf = classId => (CLASSES[classId]?.abilities || []).map(id => ABILITIES[id]);

/** Hero level needed for `rank` (1..5) of an ability; slot 5 uses a tighter step so rank 5 fits level 20. */
export function rankRequiredLevel(abilityId, rank) {
  const ability = ABILITIES[abilityId];
  const step = ability.slot === 5 ? 2 : 3;
  return ability.requiredLevel + (rank - 1) * step;
}

/**
 * Flatten an ability at a rank: returns a copy with `rank`, `power`, rank numbers merged into
 * `params` (hits, jumps, maxTargets) and effect durations/values overridden by the rank row.
 */
export function resolveAbility(abilityId, rank) {
  const ability = ABILITIES[abilityId];
  if (!ability) return null;
  const clampedRank = Math.max(1, Math.min(ABILITY_MAX_RANK, rank));
  const row = ability.ranks[clampedRank - 1];
  const params = { ...ability.params };
  for (const key of ['hits', 'jumps', 'maxTargets']) {
    if (row[key] !== undefined) params[key] = row[key];
  }
  const effects = ability.effects.map(effect => {
    const key = effect.key || effect.type;
    const resolved = { ...effect };
    if (row[`${key}Duration`] !== undefined) resolved.duration = row[`${key}Duration`];
    if (row[`${key}Value`] !== undefined) resolved.value = row[`${key}Value`];
    return resolved;
  });
  return { ...ability, rank: clampedRank, power: row.power, params, effects };
}
