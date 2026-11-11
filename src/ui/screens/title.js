// Title screen (phase 'title', the world orbits behind it) and the new-game flow: name + class picker.
// Consumes: g.hasSave(), g.continueGame(), g.newGame({name, classId}), g.view.gpuName; optional data/classes.js.
import { icon } from '../icons.js';
import { el, clear, button, tag, tooltip, sectionTitle } from '../kit.js';

const GAME_VERSION = '1.0.0';
const CLASS_ORDER = ['warrior', 'guardian', 'scientist', 'duelist', 'archer', 'medic', 'engineer'];
const ROLE_KIND = { 'урон': 'bad', 'защита': 'teal', 'дальний бой': 'gold', 'поддержка': 'good' };

/** Built-in class sheet: used when data/classes.js is missing, and for fields it does not carry. */
const FALLBACK_CLASSES = {
  warrior: {
    name: 'Двуручный мечник', icon: 'greatsword', roles: ['урон'], difficulty: 1, weapon: 'Двуручный меч · тяжёлые доспехи',
    desc: 'Тяжёлый клинок и широкий замах: достаёт сразу нескольких врагов и держит удар в тяжёлых доспехах. Прост в освоении и силён в самой гуще боя.',
  },
  guardian: {
    name: 'Щитоносец', icon: 'shield', roles: ['защита'], difficulty: 1, weapon: 'Меч и щит · тяжёлые доспехи',
    desc: 'Меч, щит и глухая оборона. Принимает удары на себя и прикрывает телегу с охраной, пока враг выдыхается. Единственный, кто носит щит.',
  },
  scientist: {
    name: 'Учёный', icon: 'device', roles: ['дальний бой'], difficulty: 3, weapon: 'Полевой излучатель · лёгкая одежда',
    desc: 'Полевой прибор бьёт холодом, разрядом и жаром с расстояния. Хрупок, но при верном расчёте не подпустит врага на длину клинка.',
  },
  duelist: {
    name: 'Дуэлянт', icon: 'blades', roles: ['урон'], difficulty: 3, weapon: 'Парные клинки · лёгкая броня',
    desc: 'Скорость, уклонение и точные серии парными клинками. Наносит больше всех, пока не ошибается, — лёгкая броня ошибок не прощает.',
  },
  archer: {
    name: 'Лучник', icon: 'bow', roles: ['дальний бой'], difficulty: 2, weapon: 'Длинный лук · средняя броня',
    desc: 'Дистанция и точность. Выбивает стрелков и вожаков раньше, чем те добегут до каравана, и держит врага на расстоянии.',
  },
  medic: {
    name: 'Полевой лекарь', icon: 'kit', roles: ['поддержка'], difficulty: 2, weapon: 'Инструменты и дротики · лёгкая броня',
    desc: 'Перевязки, снадобья и дротики с вытяжками. Лечит себя и охрану и выигрывает долгие бои там, где другие остаются без сил.',
  },
  engineer: {
    name: 'Инженер', icon: 'crossbow', roles: ['дальний бой', 'поддержка'], difficulty: 2, weapon: 'Арбалет-болтомёт · средняя броня',
    desc: 'Бьёт из болтомёта издалека, пока заводной страж держит врага на себе. Ловушки, починка на ходу и холодный расчёт вместо грубой силы.',
  },
};

async function loadClassSheets() {
  let module = null;
  try {
    module = await import('../../data/classes.js');
  } catch {
    module = null;
  }
  const catalog = (module && module.CLASSES) || {};
  const abilityCatalog = (module && module.ABILITIES) || {};
  return CLASS_ORDER.map(id => {
    const base = FALLBACK_CLASSES[id];
    const data = catalog[id] || {};
    const short = data.desc || data.description || '';
    const abilities = [];
    for (const entry of data.abilities || []) {
      const ability = typeof entry === 'string' ? abilityCatalog[entry] : entry;
      if (ability && ability.name) abilities.push({ name: ability.name, icon: ability.icon || 'diamond', desc: ability.desc || ability.description || '' });
    }
    return {
      id,
      name: data.name || base.name,
      icon: base.icon,
      roles: data.roles || base.roles,
      difficulty: data.difficulty || base.difficulty,
      weapon: base.weapon,
      lead: short,
      desc: short.length > 110 ? short : base.desc,
      abilities,
    };
  });
}

function difficultyPips(level) {
  const names = ['', 'Простой', 'Средний', 'Сложный'];
  const pips = el('span.class-pips');
  for (let i = 1; i <= 3; i++) pips.append(el('i', { class: i <= level ? 'on' : '' }));
  return el('div.class-difficulty', null, [el('span', { text: 'Сложность' }), pips, el('span.class-difficulty-name', { text: names[level] || '' })]);
}

export function createTitle(g, ui) {
  const layer = ui.layers.title;
  const menu = el('nav.title-menu');
  const main = el('div.title-main.interactive', null, [
    el('div.title-logo', null, [
      el('div.title-eyebrow', null, [el('i'), el('span', { text: 'Торговое кольцо трёх городов' }), el('i')]),
      el('h1.title-name', null, [el('span', { text: 'Тихая' }), el('span', { text: 'долина' })]),
      el('div.title-tagline', { text: 'Кольцо караванов' }),
    ]),
    menu,
  ]);
  const picker = el('div.title-new.interactive', { hidden: true });
  const gpu = el('span.title-gpu');
  const foot = el('div.title-foot', null, [el('span', { text: `Версия ${GAME_VERSION}` }), gpu]);
  layer.append(el('div.title-shade'), main, picker, foot);

  let classes = null;
  let chosen = 'warrior';
  let busy = false;
  let nameInput = null;

  function menuItem(label, onClick, opts = {}) {
    return el('button.title-item', { type: 'button', class: opts.primary ? 'primary' : '', onClick }, [el('i.title-item-mark'), el('span', { text: label })]);
  }

  function renderMenu() {
    const items = [];
    if (g.hasSave()) items.push(menuItem('Продолжить', continueGame, { primary: true }));
    items.push(menuItem('Новая игра', openPicker, { primary: !g.hasSave() }));
    items.push(menuItem('Настройки', () => ui.open('settings')));
    if (navigator.userAgent.includes('Electron')) items.push(menuItem('Выход', () => window.close()));
    clear(menu, items);
    gpu.textContent = g.view && g.view.gpuName ? g.view.gpuName : '';
  }

  function continueGame() {
    if (busy) return;
    busy = true;
    if (g.continueGame() === false) {
      busy = false;
      ui.toast('Сохранение не удалось загрузить', 'bad');
      renderMenu();
    }
  }

  // ───────────── new game ─────────────
  async function openPicker() {
    if (!classes) classes = await loadClassSheets();
    renderPicker();
    picker.hidden = false;
    layer.classList.add('picking');
    if (nameInput) nameInput.focus();
  }

  function closePicker() {
    picker.hidden = true;
    layer.classList.remove('picking');
  }

  function classDetail(sheet) {
    const abilityRow = sheet.abilities.length
      ? el('div.class-abilities', null, sheet.abilities.map(ability => {
        const node = el('div.class-ability', null, icon(ability.icon));
        tooltip.attach(node, () => el('div', null, [
          el('div.kit-tip-name', { text: ability.name }),
          ability.desc ? el('div.kit-tip-desc', { text: ability.desc }) : null,
        ]));
        return node;
      }))
      : null;
    return el('div.class-detail', null, [
      el('div.class-head', null, [
        el('div.class-emblem', null, icon(sheet.icon)),
        el('div', null, [
          el('div.class-name', { text: sheet.name }),
          el('div.class-roles', null, sheet.roles.map(role => tag(role, ROLE_KIND[role] || ''))),
        ]),
      ]),
      sheet.lead && sheet.lead !== sheet.desc ? el('p.class-lead', { text: sheet.lead }) : null,
      el('p.class-desc', { text: sheet.desc }),
      el('div.class-facts', null, [
        el('div.class-weapon', null, [icon('swords'), el('span', { text: sheet.weapon })]),
        difficultyPips(sheet.difficulty),
      ]),
      abilityRow ? sectionTitle('Умения') : null,
      abilityRow,
    ]);
  }

  function renderPicker() {
    const previousName = nameInput ? nameInput.value : 'Путник';
    const sheet = classes.find(c => c.id === chosen) || classes[0];
    const list = el('div.class-list', null, classes.map(c => el('button.class-row', {
      type: 'button', class: c.id === sheet.id ? 'selected' : '', onClick: () => {
        chosen = c.id;
        renderPicker();
      },
    }, [el('span.class-row-icon', null, icon(c.icon)), el('span.class-row-name', { text: c.name }), el('span.class-row-role', { text: c.roles[0] })])));
    nameInput = el('input.title-input', { type: 'text', maxLength: 18, value: previousName, spellcheck: false, placeholder: 'Имя героя' });
    nameInput.addEventListener('keydown', event => {
      if (event.code === 'Enter') startNewGame();
    });
    clear(picker, [
      el('div.title-new-head', null, [
        el('div.title-new-title', { text: 'Новый путь' }),
        el('div.title-new-sub', { text: 'Кем вы войдёте в долину? Класс определяет оружие и умения — ремёсла доступны каждому.' }),
      ]),
      el('div.title-new-body', null, [list, classDetail(sheet)]),
      el('div.title-new-foot', null, [
        el('label.title-field', null, [el('span', { text: 'Имя' }), nameInput]),
        el('div.title-new-buttons', null, [
          button('Назад', { onClick: closePicker }),
          button('Начать путь', { primary: true, onClick: startNewGame }),
        ]),
      ]),
    ]);
    if (!picker.hidden) nameInput.focus();
  }

  async function startNewGame() {
    if (busy) return;
    const name = (nameInput.value || '').trim().replace(/\s+/g, ' ');
    if (name.length < 2) {
      ui.toast('Назовите героя — хотя бы двумя буквами', 'warn');
      nameInput.focus();
      return;
    }
    if (g.hasSave()) {
      const agreed = await ui.confirm({
        title: 'Начать заново?',
        text: 'Прежнее сохранение будет стёрто без возможности вернуть.',
        yes: 'Начать заново',
        no: 'Отмена',
        danger: true,
      });
      if (!agreed) return;
    }
    busy = true;
    closePicker();
    g.newGame({ name, classId: chosen });
  }

  ui.onEscape(() => {
    if (ui.phase !== 'title' || picker.hidden) return false;
    closePicker();
    return true;
  });
  ui.onPhase(phase => {
    if (phase === 'title') {
      busy = false;
      closePicker();
      renderMenu();
    }
  });
  window.addEventListener('keydown', event => {
    if (ui.phase !== 'title' || picker.hidden || ui.isOpen()) return;
    const index = classes.findIndex(c => c.id === chosen);
    if (event.code === 'ArrowDown' || event.code === 'ArrowUp') {
      const next = classes[(index + (event.code === 'ArrowDown' ? 1 : -1) + classes.length) % classes.length];
      chosen = next.id;
      renderPicker();
      event.preventDefault();
    }
  });

  renderMenu();
  return { refresh: renderMenu, openPicker };
}
