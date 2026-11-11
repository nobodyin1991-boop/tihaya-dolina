// Professions and gathering skills. Pure data.
// A hero has one main profession (and may buy a second one later); gathering skills are open to
// everyone and grow by use.

export const PROFESSION_MAX_LEVEL = 15;
export const GATHER_MAX_LEVEL = 15;

/** Requirements for buying the second profession slot. */
export const SECOND_PROFESSION = { level: 8, coins: 600 };

/**
 * Highest recipe level a profession master teaches (trainer recipes) or sells notes for, per city.
 */
export const RECIPE_CITY_CAP = { valley: 6, ford: 11, harbor: 15 };

/**
 * PROFESSIONS[id] = { id, name, gatherSkill, station, product, color, desc }
 * The master NPC role of a profession has the same id (npcId = `${cityKey}:${id}`).
 */
export const PROFESSIONS = {
  apothecary: {
    id: 'apothecary',
    name: 'Аптекарь',
    gatherSkill: 'herbalism',
    station: 'Аптекарский стол',
    product: 'salve',
    color: 0x879f71,
    desc: 'Мази, настои и лекарские наборы. Готовит аптечные сундуки для караванов.',
  },
  smith: {
    id: 'smith',
    name: 'Кузнец',
    gatherSkill: 'mining',
    station: 'Горн и наковальня',
    product: 'ingot',
    color: 0xb78865,
    desc: 'Слитки, инструмент, клинки и тяжёлые доспехи. Собирает ящики инструментов и оружия.',
  },
  carpenter: {
    id: 'carpenter',
    name: 'Столяр',
    gatherSkill: 'logging',
    station: 'Столярный верстак',
    product: 'plank',
    color: 0xc3a469,
    desc: 'Доски, луки, арбалеты и всё для телеги: колёса, ремкомплекты, мостовые наборы.',
  },
  leatherworker: {
    id: 'leatherworker',
    name: 'Кожевник',
    gatherSkill: 'skinning',
    station: 'Кожевенный станок',
    product: 'leather',
    color: 0xa77c5c,
    desc: 'Кожа, сумки, упряжь и доспехи следопытов.',
  },
  farmer: {
    id: 'farmer',
    name: 'Земледелец-пекарь',
    gatherSkill: 'farming',
    station: 'Печь',
    product: 'flour',
    color: 0xd5b75e,
    desc: 'Хлеб, походная еда и бочки провизии для обозов.',
  },
  tailor: {
    id: 'tailor',
    name: 'Портной',
    gatherSkill: 'fiber',
    station: 'Ткацкий стан',
    product: 'cloth',
    color: 0x789bac,
    desc: 'Полотно, плащи, лёгкая одежда, палатки и парусина.',
  },
  mason: {
    id: 'mason',
    name: 'Каменщик',
    gatherSkill: 'stonecutting',
    station: 'Камнерезный двор',
    product: 'cutStone',
    color: 0x90918b,
    desc: 'Тёсаный камень, опоры мостов, точильные камни и украшения.',
  },
};

export const PROFESSION_IDS = Object.keys(PROFESSIONS);

/** GATHER_SKILLS[id] = { id, name, profession, verb } */
export const GATHER_SKILLS = {
  herbalism: { id: 'herbalism', name: 'Травничество', profession: 'apothecary', verb: 'Сбор трав' },
  mining: { id: 'mining', name: 'Горное дело', profession: 'smith', verb: 'Добыча руды' },
  logging: { id: 'logging', name: 'Лесозаготовка', profession: 'carpenter', verb: 'Рубка леса' },
  skinning: { id: 'skinning', name: 'Снятие шкур', profession: 'leatherworker', verb: 'Свежевание' },
  farming: { id: 'farming', name: 'Земледелие', profession: 'farmer', verb: 'Жатва' },
  fiber: { id: 'fiber', name: 'Сбор волокна', profession: 'tailor', verb: 'Сбор волокна' },
  stonecutting: { id: 'stonecutting', name: 'Каменное дело', profession: 'mason', verb: 'Добыча камня' },
};

export const GATHER_SKILL_IDS = Object.keys(GATHER_SKILLS);

/** Profession xp needed to go from `level` to `level + 1`. */
export const professionXpToNext = level => 80 + 40 * (level - 1) + 5 * (level - 1) ** 2;

/** Gathering-skill xp needed to go from `level` to `level + 1`. */
export const gatherXpToNext = level => 30 + 22 * (level - 1) + 3 * (level - 1) ** 2;

function levelForXp(xp, xpToNext, maxLevel) {
  let level = 1;
  let remaining = xp;
  while (level < maxLevel && remaining >= xpToNext(level)) {
    remaining -= xpToNext(level);
    level++;
  }
  return { level, current: remaining, required: level >= maxLevel ? 0 : xpToNext(level) };
}

/** {level, current, required} for a profession xp total. */
export const professionProgress = xp => levelForXp(xp, professionXpToNext, PROFESSION_MAX_LEVEL);

/** {level, current, required} for a gathering-skill xp total. */
export const gatherProgress = xp => levelForXp(xp, gatherXpToNext, GATHER_MAX_LEVEL);

/**
 * Share of recipe xp granted when the recipe is `gap` levels below the crafter:
 * full within 2 levels, then fading to a token amount ("серый рецепт").
 */
export function craftXpFactor(gap) {
  if (gap <= 2) return 1;
  if (gap <= 4) return 0.5;
  if (gap <= 6) return 0.2;
  return 0.05;
}
