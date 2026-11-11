// NPC catalog: 18 role NPCs per city, named NPCs at points of interest, ambient citizens. Pure data.
//
// NPC: { id, cityKey|null, poiId|null, role, name, title, gender:'m'|'f', age:'young'|'adult'|'old',
//        look:{hair, beard?, build, palette, extra?}  — free-form hints for the model builder,
//        bio, barks:[…], schedule:[{from, to, spot}] }      spot ∈ work | home | tavern | square | gate
// City NPC id = `${cityKey}:${role}`; POI NPC id = `${poiId}:${role}`.
import { CITIES, NPC_ROLES, POIS } from './world-map.js';
import { VALLEY_NPCS, VALLEY_CITIZENS, VALLEY_AMBIENT } from './npcs-valley.js';
import { FORD_NPCS, FORD_CITIZENS, FORD_AMBIENT } from './npcs-ford.js';
import { HARBOR_NPCS, HARBOR_CITIZENS, HARBOR_AMBIENT } from './npcs-harbor.js';

/** Daily routines. Hours are game hours 0..24; a range may wrap past midnight. */
export const SCHEDULES = {
  shop: [{ from: 7, to: 19, spot: 'work' }, { from: 19, to: 22, spot: 'tavern' }, { from: 22, to: 7, spot: 'home' }],
  crafter: [{ from: 6, to: 12, spot: 'work' }, { from: 12, to: 13, spot: 'square' }, { from: 13, to: 20, spot: 'work' }, { from: 20, to: 6, spot: 'home' }],
  clerk: [{ from: 8, to: 18, spot: 'work' }, { from: 18, to: 20, spot: 'square' }, { from: 20, to: 8, spot: 'home' }],
  elder: [{ from: 8, to: 12, spot: 'work' }, { from: 12, to: 14, spot: 'square' }, { from: 14, to: 18, spot: 'work' }, { from: 18, to: 20, spot: 'gate' }, { from: 20, to: 8, spot: 'home' }],
  guard: [{ from: 6, to: 10, spot: 'gate' }, { from: 10, to: 18, spot: 'work' }, { from: 18, to: 21, spot: 'gate' }, { from: 21, to: 23, spot: 'tavern' }, { from: 23, to: 6, spot: 'home' }],
  innkeeper: [{ from: 9, to: 2, spot: 'work' }, { from: 2, to: 9, spot: 'home' }],
  stable: [{ from: 5, to: 18, spot: 'work' }, { from: 18, to: 23, spot: 'tavern' }, { from: 23, to: 5, spot: 'home' }],
  trainer: [{ from: 7, to: 17, spot: 'work' }, { from: 17, to: 19, spot: 'square' }, { from: 19, to: 22, spot: 'tavern' }, { from: 22, to: 7, spot: 'home' }],
  farmer: [{ from: 5, to: 19, spot: 'work' }, { from: 19, to: 21, spot: 'square' }, { from: 21, to: 5, spot: 'home' }],
  outpost: [{ from: 0, to: 24, spot: 'work' }],
};

/** What each role offers: the `open` action of its service dialogue option(s). */
export const ROLE_SERVICES = {
  quartermaster: [{ open: 'caravan', label: 'Покажи грузовую ведомость.' }],
  elder: [{ open: 'board', label: 'Что нужно городу? Покажи доску заказов.' }],
  captain: [{ open: 'guards', label: 'Мне нужны бойцы в охрану каравана.' }, { open: 'bounties', label: 'За чьи головы платят?' }],
  innkeeper: [{ open: 'rest', label: 'Мне нужна койка до утра.' }, { open: 'shop', label: 'Что есть поесть и выпить?' }],
  stablemaster: [{ open: 'stable', label: 'Посмотрим, что можно сделать с телегой.' }],
  trainer: [{ open: 'train', label: 'Научи меня драться лучше.' }],
  weaponsmith: [{ open: 'shop', label: 'Покажи оружие.' }],
  armorer: [{ open: 'shop', label: 'Покажи броню.' }],
  grocer: [{ open: 'shop', label: 'Покажи товар.' }],
  trader: [{ open: 'trade', label: 'Поторгуем. Что у тебя на вывоз?' }],
  banker: [{ open: 'storage', label: 'Открой мой ларь.' }],
  apothecary: [{ open: 'craft', label: 'Пусти к ступке и котлу.' }],
  smith: [{ open: 'craft', label: 'Пусти к горну.' }],
  carpenter: [{ open: 'craft', label: 'Пусти к верстаку.' }],
  leatherworker: [{ open: 'craft', label: 'Пусти к дубильному чану.' }],
  farmer: [{ open: 'craft', label: 'Пусти к жерновам и печи.' }],
  tailor: [{ open: 'craft', label: 'Пусти к ткацкому стану.' }],
  mason: [{ open: 'craft', label: 'Пусти к камнерезному столу.' }],
};

/** Named NPCs outside the cities. */
const POI_NPCS = [
  {
    poiId: 'hunter-lodge', role: 'hunter', name: 'Данила Следопыт', title: 'охотник', gender: 'm', age: 'adult', home: 'valley',
    look: { hair: 'тёмные, до плеч', beard: 'густая', build: 'поджарый', palette: 'волчья безрукавка, зелёный капюшон', extra: 'лук за спиной' },
    bio: 'Живёт на заимке между Старым бором и Рудными холмами. Двоюродный брат Косого и единственный, кто ходит в его лагерь без ножа у горла. Не одобряет брата, но и не сдаст.',
    barks: ['Тише. Лес слушает.', 'След свежий. Утренний.', 'Косьма мне брат. Какой ни есть.', 'Рысь взять — не зайца гонять.', 'В лесу врать некому.'],
  },
  {
    poiId: 'mill', role: 'miller', name: 'Потап Жёрнов', title: 'мельник', gender: 'm', age: 'adult', home: 'valley',
    look: { hair: 'белые от муки', beard: 'белая от муки', build: 'толстый, весёлый', palette: 'мучной балахон' },
    bio: 'Мелет зерно на всю долину и торгуется из любви к искусству. Щедр на обещания; половину даже выполняет.',
    barks: ['Жёрнов гудит — душа поёт.', 'Десять мешков! Нет — пять. Ладно, десять.', 'Ветер есть, зерна нет.', 'Мука первый сорт. Второй тоже первый.', 'Не стой под крылом — зашибёт.'],
  },
  {
    poiId: 'sawmill', role: 'foreman', name: 'Фрол Пила', title: 'десятник лесорубов', gender: 'm', age: 'adult', home: 'valley',
    look: { hair: 'рыжий ёжик', beard: 'рыжая, в опилках', build: 'плечистый, громкий', palette: 'красная рубаха, топор за поясом' },
    bio: 'Командует артелью лесорубов, как сотней. Орёт так, что слышно в долине. За своих людей пойдёт на волка с топором, но предпочитает нанять кого-нибудь.',
    barks: ['Берегись! Валим!', 'Эй, лодыри, кости в сторону!', 'Сосна — на доску, дуб — на брус.', 'Пила должна петь, а не выть.', 'Я десятник, а не волкодав!'],
  },
  {
    poiId: 'far-farm', role: 'farmer', name: 'Авдотья Дальняя', title: 'хозяйка хутора', gender: 'f', age: 'adult', home: 'valley',
    look: { hair: 'русые с проседью, под платком', build: 'усталая, крепкая', palette: 'тёмная понёва, выцветший платок' },
    bio: 'Держит Хутор Дальний с мужем Егором и дочерью. Сын Митя весной ушёл «на заработки» и не вернулся. Каждый день выходит на дорогу посмотреть.',
    barks: ['Не видал парня? Рыжий, лопоухий.', 'Сыр свой, козий. Попробуй.', 'Егор, ворота запри — темнеет.', 'Далеко мы от долины. Случись что — не докричишься.', 'Матери — они ждут.'],
  },
  {
    poiId: 'apiary', role: 'beekeeper', name: 'дед Пахом', title: 'пасечник', gender: 'm', age: 'old', home: 'valley',
    look: { hair: 'лысый', beard: 'длинная, белая', build: 'сухонький', palette: 'белая рубаха до колен, сетка на шляпе' },
    bio: 'Сорок колод на Южных лугах. Разговаривает с пчёлами и уверяет, что они отвечают. Его мёд когда-то возили до самой Гавани.',
    barks: ['Пчёлки мои, труженицы.', 'Мёд липовый, прошлогодний — как янтарь.', 'Не маши руками, ужалят.', 'Косолапый, чтоб ему!', 'Пчела злая — к грозе.'],
  },
  {
    poiId: 'charcoal-camp', role: 'burner', name: 'Нил Сажа', title: 'углежог', gender: 'm', age: 'old', home: 'ford',
    look: { hair: 'чёрные от сажи', beard: 'чёрная от сажи', build: 'тощий, жилистый', palette: 'всё чёрное', extra: 'белеют только глаза и зубы' },
    bio: 'Старшой у углежогов в Рудных холмах. Жжёт ямы сорок лет, с людьми говорит неохотно и по делу. Своего не упустит: за овёс, съеденный чужой кобылой, выставит счёт.',
    barks: ['Яма дышит. Не лезь.', 'Уголь — чёрное золото.', 'Я углежог, а не благодетель.', 'Дуб на уголь — лучший.', 'Руки потом не отмоешь. И не надо.'],
  },
  {
    poiId: 'mine-copper', role: 'foreman', name: 'Устин Забой', title: 'штейгер', gender: 'm', age: 'adult', home: 'ford',
    look: { hair: 'чёрные, под кожаной каской', beard: 'короткая', build: 'коренастый', palette: 'брезент, фонарь на груди', extra: 'свежий шрам на предплечье' },
    bio: 'Штейгер медного рудника. Прямой, как штрек: что думает, то и пишет бургомистру, обычно в двух словах. Своих под обвал и под когти не пошлёт.',
    barks: ['Не пойдём — и точка.', 'Фонарь проверь. Дважды.', 'Медь идёт — город живёт.', 'Кайло от панциря отскакивает. Я пробовал.', 'Смена! Вниз!'],
  },
  {
    poiId: 'post-forest', role: 'sergeant', name: 'сержант Вакула', title: 'начальник поста дорожной стражи', gender: 'm', age: 'adult', home: 'valley',
    look: { hair: 'русые', beard: 'пышные усы', build: 'плотный', palette: 'синий плащ стражи долины, стёганка' },
    bio: 'Сидит с четырьмя бойцами на посту у Старого бора — последняя застава долины на Лесном тракте. Дальше не ходит: приказ Рады. Знает каждый завал и каждую ложбину.',
    barks: ['Дальше поста — на свой страх.', 'Четверо нас. На весь тракт.', 'В бору опять топоры стучали. Ночью.', 'Рада жива и злая? Добрый знак.', 'Костёр не гасить!'],
  },
  {
    poiId: 'post-drydale', role: 'sergeant', name: 'сержант Зарина Стриж', title: 'начальница заставы', gender: 'f', age: 'young', home: 'ford',
    look: { hair: 'чёрные, коротко острижены', build: 'невысокая, быстрая', palette: 'серый плащ стражи Брода, кольчуга' },
    bio: 'Осталась верна Броду, когда сотня ушла. Её младший брат Радко ушёл со всеми. Два года держит дальнюю заставу у Сухого дола — по ту сторону перевала от города, отрезанная от своих.',
    barks: ['Застава держится. Доложи капитану, если дойдёшь.', 'Радко… Нет, ничего.', 'Шакалы из дола лезут каждую ночь.', 'Два года без смены. Привыкли.', 'Стой, кто идёт!'],
  },
  {
    poiId: 'post-south', role: 'sergeant', name: 'сержант Борис Тын', title: 'начальник Южного дозора', gender: 'm', age: 'old', home: 'valley',
    look: { hair: 'седые', beard: 'седая, клочьями', build: 'кряжистый', palette: 'латаный синий плащ, ржавая кираса' },
    bio: 'Десять лет сидит с дюжиной копий на краю леса Ворона. Упрям, как пень. Меняется голубями с капитаном Остромиром из Гавани — когда голуби долетают.',
    barks: ['Десять лет стоим. И ещё постоим.', 'Лесные на той неделе щупали частокол.', 'Голубь с моря не прилетал?', 'Каша. Опять каша.', 'Южный дозор долгов не забывает.'],
  },
  {
    poiId: 'fisher-village', role: 'elder', name: 'Ерофей Сеть', title: 'старейший рыбак', gender: 'm', age: 'old', home: 'harbor',
    look: { hair: 'седые космы', beard: 'седая, просоленная', build: 'сухой, как вяленая рыба', palette: 'просмолённая куртка, вязаная шапка' },
    bio: 'Полжизни возил тростник с Гнилых топей, вторую половину ловит рыбу. Знает каждое окно и каждую кочку. Единственный в деревне умеет считать до ста.',
    barks: ['Вода не шевелится — значит, там он.', 'Гать цела до третьей версты. Дальше — сам.', 'Топи берут тех, кто спешит.', 'Три медяка — и те мои.', 'Засол нынче удался.'],
  },
  {
    poiId: 'fisher-village', role: 'fisher', name: 'Глаша Поплавок', title: 'рыбачка', gender: 'f', age: 'young', home: 'harbor',
    look: { hair: 'русая коса, выгоревшая', build: 'крепкая, босая', palette: 'подоткнутая юбка, сеть через плечо' },
    bio: 'Внучка вдовы Радомилы из затопленной усадьбы; о наследстве не знает. Латает сети быстрее всех в деревне и ругается на топляков так, что краснеют боцманы.',
    barks: ['Третья сеть за неделю!', 'Топляк, чтоб тебе пусто было!', 'Рыба свежая, утренняя.', 'Дед Ерофей опять про топи завёл.', 'Смотри на воду: где не рябит — там он.'],
  },
  {
    poiId: 'lm-lighthouse', role: 'keeper', name: 'Аристарх', title: 'смотритель маяка', gender: 'm', age: 'old', home: 'harbor',
    look: { hair: 'седые, длинные', beard: 'седая, до груди', build: 'высокий, сутулый', palette: 'выцветший бушлат, фонарь в руке' },
    bio: 'Тридцать лет не дал маяку погаснуть ни на одну ночь. Хранит под фонарём нишу с янтарём — по камню за каждого, кто ушёл южной дорогой и не вернулся. Не умеет молчать.',
    barks: ['Тридцать лет — ни одной тёмной ночи.', 'Сорок три камня. Я помню имена.', 'Шхунам бумага не светит.', 'С маяка видно топи. И огни в топях.', 'Поднимись вечером. Посмотришь, как он бьёт.'],
  },
];

function buildCityNpcs(cityKey, defs) {
  return defs.map(def => ({
    id: `${cityKey}:${def.role}`, cityKey, poiId: null,
    role: def.role, name: def.name, title: def.title, gender: def.gender, age: def.age,
    look: def.look, bio: def.bio, barks: def.barks,
    schedule: SCHEDULES[def.schedule || 'shop'],
    services: ROLE_SERVICES[def.role] || [],
  }));
}

function buildPoiNpcs() {
  return POI_NPCS.map(def => ({
    id: `${def.poiId}:${def.role}`, cityKey: null, poiId: def.poiId, homeCity: def.home,
    role: def.role, name: def.name, title: def.title, gender: def.gender, age: def.age,
    look: def.look, bio: def.bio, barks: def.barks,
    schedule: SCHEDULES.outpost, services: [],
  }));
}

/** Every named NPC. */
export const NPC_LIST = [
  ...buildCityNpcs('valley', VALLEY_NPCS),
  ...buildCityNpcs('ford', FORD_NPCS),
  ...buildCityNpcs('harbor', HARBOR_NPCS),
  ...buildPoiNpcs(),
];

/** NPCs by id. */
export const NPCS = Object.fromEntries(NPC_LIST.map(npc => [npc.id, npc]));

export const npcById = npcId => NPCS[npcId] || null;
export const npcName = npcId => NPCS[npcId]?.name || npcId;
export const npcsOfCity = cityKey => NPC_LIST.filter(npc => npc.cityKey === cityKey);
export const npcsOfPoi = poiId => NPC_LIST.filter(npc => npc.poiId === poiId);

/** Where the npc should be at `hour` (0..24): 'work' | 'home' | 'tavern' | 'square' | 'gate'. */
export function npcSpot(npcId, hour) {
  const npc = NPCS[npcId];
  if (!npc) return 'work';
  for (const slot of npc.schedule) {
    const inside = slot.from <= slot.to ? hour >= slot.from && hour < slot.to : hour >= slot.from || hour < slot.to;
    if (inside) return slot.spot;
  }
  return 'work';
}

/** Names of unnamed citizens per city (ambient crowd, notice-board requesters). */
export const CITIZEN_NAMES = { valley: VALLEY_CITIZENS, ford: FORD_CITIZENS, harbor: HARBOR_CITIZENS };

/** Ambient lines per city: [{text, stage?: [min, max]}]. */
export const AMBIENT_BARKS = { valley: VALLEY_AMBIENT, ford: FORD_AMBIENT, harbor: HARBOR_AMBIENT };

/** Ambient lines fitting the current caravan stage (0..3). */
export function ambientBarks(cityKey, stage = 0) {
  return (AMBIENT_BARKS[cityKey] || [])
    .filter(bark => !bark.stage || (stage >= bark.stage[0] && stage <= bark.stage[1]))
    .map(bark => bark.text);
}

// sanity: every city has every role
for (const city of CITIES) {
  for (const role of NPC_ROLES) if (!NPCS[`${city.key}:${role}`]) throw new Error(`Missing npc ${city.key}:${role}`);
}
for (const npc of NPC_LIST) {
  if (npc.poiId && !POIS.some(poi => poi.id === npc.poiId)) throw new Error(`Unknown poi for npc ${npc.id}`);
}
