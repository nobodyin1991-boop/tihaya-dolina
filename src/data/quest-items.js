// Quest-only items: letters, keys, finds and boss trophies. Registered at import time.
import { registerItems } from './items.js';

const quest = (name, icon, desc, extra = {}) => ({ name, type: 'quest', icon, rarity: 'fine', value: 0, desc, ...extra });

export const QUEST_ITEMS = {
  letterDobrynya: quest('Письмо Добрыни', 'note', 'Сложено вчетверо, залито воском. На обороте — следы трёх зачёркнутых начал.'),
  savvaNote: quest('Расписка Саввы', 'note', 'Долг за телегу, груз и десять лет молчания. Внизу одна строчка от руки.'),
  recruitBadge: quest('Бляха дозорного', 'trophy', 'Медная бляха стражи Тихой долины. К ней привязана недописанная записка.'),
  amnestyLetter: quest('Грамота о помиловании', 'note', 'Печать бургомистра Каменного Брода. Всем, кроме зачинщиков.', { rarity: 'rare' }),
  mineSurvey: quest('Планы маркшейдера', 'note', 'Чертежи жил старой штольни. Пахнут мышами, но читаются.'),
  vaultKey: quest('Ключ с тремя бородками', 'key', 'Тяжёлый железный ключ от третьего засова хранилища Брода.'),
  ravenLedger: quest('Тетрадь писаря', 'note', 'Даты выезда обозов, груз, число охраны. Десять лет аккуратным конторским почерком.', { rarity: 'rare' }),
  feverMixture: quest('Микстура от лихорадки', 'potion', 'По ложке на заре и на закате. Пахнет болотом и надеждой.'),
  smugglerCrate: quest('Ящик без клейма', 'crate', 'Запечатан смолой. Внутри что-то перекатывается и стоит дороже, чем кажется.'),
  widowPearls: quest('Шкатулка с цаплей', 'gem', 'Герб на крышке — цапля на волне. Десять лет пролежала в омуте.', { rarity: 'rare' }),
  brotherTag: quest('Солдатский жетон', 'trophy', 'Жетон стражи Брода с выбитым именем «Радко». В него завёрнуто письмо.'),
  // трофеи — выпадают с разбойников; капитаны принимают как доказательство
  banditInsignia: quest('Разбойничья зарубка', 'trophy', 'Деревянная бирка с зарубками. У каждой шайки свой узор.', { rarity: 'common', value: 4 }),
  deserterBadge: quest('Знак различия беглого', 'trophy', 'Споротая нашивка стражи Каменного Брода.', { rarity: 'common', value: 6 }),
  kosoyKnife: quest('Нож Косого', 'dagger', 'Возчицкий нож с костяной рукоятью. Им резали хлеб, потом — не только хлеб.', { rarity: 'rare', value: 40 }),
  sotnikSeal: quest('Печать сотника', 'trophy', 'Сотенная печать стражи Брода. Лютобор не расставался с ней до конца.', { rarity: 'rare', value: 80 }),
  ravenRing: quest('Перстень Ворона', 'gem', 'Гильдейский перстень счетовода с чёрным камнем. Он так и не снял его.', { rarity: 'epic', value: 200 }),
};

registerItems(QUEST_ITEMS);
