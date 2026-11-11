// Settings screen (menu tab, also reachable from the title screen).
// Consumes: g.settings (+ settings.set), g.setQuality(name), g.view.gpuName, DEFAULT_BINDINGS.
import { on } from '../../core/events.js';
import { DEFAULT_BINDINGS, keyCaption } from '../../core/input.js';
import { icon } from '../icons.js';
import { el, sectionTitle, slider, toggle, segmented } from '../kit.js';

const QUALITY_OPTIONS = [
  { id: 'low', label: 'Низкое', title: 'Для встроенной графики: короткая дальность, без теней и травы' },
  { id: 'medium', label: 'Среднее', title: 'Тени и трава вблизи' },
  { id: 'high', label: 'Высокое', title: 'Полная дальность, мягкие тени, постобработка' },
  { id: 'ultra', label: 'Ультра', title: 'Для мощных видеокарт: максимум всего' },
];

/** Controls reference: [caption, actions…] — actions on one row are shown together. */
const CONTROL_GROUPS = [
  ['Движение', [
    ['Идти', ['forward', 'left', 'back', 'right']], ['Бег', ['sprint']], ['Шаг', ['walk']], ['Прыжок', ['jump']],
    ['Уклонение', ['dodge']], ['Сесть на лошадь', ['mount']],
  ]],
  ['Бой', [
    ['Атака', ['attack']], ['Выбор цели', ['target']], ['Умения', ['ability1', 'ability2', 'ability3', 'ability4', 'ability5']],
    ['Быстрые слоты', ['quick1', 'quick2', 'quick3', 'quick4']], ['Быстрое лечение', ['quickHeal']],
  ]],
  ['Мир', [
    ['Взаимодействие', ['interact']], ['Свободный курсор', ['cursor']], ['Скрыть интерфейс', ['hideHud']],
  ]],
  ['Экраны', [
    ['Инвентарь', ['inventory']], ['Персонаж', ['character']], ['Умения', ['skills']], ['Ремесло', ['crafting']],
    ['Журнал', ['journal']], ['Карта', ['map']], ['Караван', ['caravan']], ['Меню', ['menu']],
  ]],
];

const percent = value => `${Math.round(value * 100)}%`;

export function registerSettingsScreen(ui, g) {
  ui.registerScreen({
    id: 'settings',
    title: 'Настройки',
    tab: { order: 80, icon: 'settings' },
    when: () => true,
    create: () => createSettingsScreen(g),
  });
}

function createSettingsScreen(g) {
  const settings = g.settings;
  /** key → control element with a `value` property, for syncing on external changes. */
  const controls = new Map();

  function row(label, hint, control, key) {
    if (key) controls.set(key, control);
    return el('div.set-row', null, [
      el('div.set-label', null, [el('span', { text: label }), hint ? el('small', { text: hint }) : null]),
      el('div.set-control', null, control),
    ]);
  }
  const bind = key => value => settings.set(key, value);

  const gpuName = el('div.set-gpu-name');
  const left = el('div.set-column.kit-scroll.interactive', null, [
    sectionTitle('Графика'),
    row('Качество', 'Дальность прорисовки, тени, трава, постобработка',
      segmented({ options: QUALITY_OPTIONS, value: settings.quality, onChange: value => g.setQuality(value) }), 'quality'),
    row('Масштаб рендера', 'Меньше — быстрее, больше — чётче',
      slider({ value: settings.renderScale, min: 0.5, max: 1.5, step: 0.05, format: percent, onChange: bind('renderScale') }), 'renderScale'),
    row('Вертикальная синхронизация', null, toggle({ value: settings.vsync, onChange: bind('vsync') }), 'vsync'),
    row('Счётчик кадров', 'Кадры в секунду и нагрузка на видеокарту', toggle({ value: settings.showFps, onChange: bind('showFps') }), 'showFps'),

    sectionTitle('Звук'),
    row('Музыка', null, el('div.set-pair', null, [
      toggle({ value: settings.musicOn, onChange: bind('musicOn') }),
      slider({ value: settings.musicVolume, min: 0, max: 1, step: 0.05, format: percent, onChange: bind('musicVolume') }),
    ])),
    row('Звуки', null, el('div.set-pair', null, [
      toggle({ value: settings.sfxOn, onChange: bind('sfxOn') }),
      slider({ value: settings.sfxVolume, min: 0, max: 1, step: 0.05, format: percent, onChange: bind('sfxVolume') }),
    ])),

    sectionTitle('Управление'),
    row('Чувствительность мыши', null,
      slider({ value: settings.mouseSensitivity, min: 0.3, max: 2.5, step: 0.05, format: v => `×${v.toFixed(2).replace('.', ',')}`, onChange: bind('mouseSensitivity') }), 'mouseSensitivity'),
    row('Инверсия оси Y', 'Мышь вверх — камера вниз', toggle({ value: settings.invertY, onChange: bind('invertY') }), 'invertY'),

    sectionTitle('Интерфейс'),
    row('Размер интерфейса', 'Компас, полосы, панель умений',
      slider({ value: settings.hudScale, min: 0.8, max: 1.3, step: 0.05, format: percent, onChange: bind('hudScale') }), 'hudScale'),
    row('Числа урона', 'Всплывающие цифры над целью', toggle({ value: settings.damageNumbers, onChange: bind('damageNumbers') }), 'damageNumbers'),
  ]);

  const controlsTable = el('div.set-keys');
  for (const [caption, rows] of CONTROL_GROUPS) {
    controlsTable.append(el('div.set-keys-group', { text: caption }));
    for (const [label, actions] of rows) {
      const keys = el('span.set-keys-caps');
      for (const action of actions) {
        const code = (DEFAULT_BINDINGS[action] || [])[0];
        if (code) keys.append(el('span.key', { text: keyCaption(code) }));
      }
      controlsTable.append(el('div.set-keys-row', null, [el('span', { text: label }), el('i'), keys]));
    }
  }

  const right = el('div.set-column.kit-scroll.interactive', null, [
    sectionTitle('Видеокарта'),
    el('div.set-gpu', null, [
      icon('part'),
      el('div', null, [
        gpuName,
        el('div.set-gpu-hint', { text: 'Сборка для Electron принудительно выбирает дискретную видеокарту. В браузере выбор делает система: если здесь указана встроенная графика, назначьте браузеру «высокую производительность» в настройках графики Windows.' }),
      ]),
    ]),
    sectionTitle('Управление', 'назначения по умолчанию'),
    controlsTable,
  ]);

  on('settings:changed', payload => {
    const control = payload && controls.get(payload.key);
    if (control && control.value !== payload.value) control.value = payload.value;
  });

  return {
    el: el('div.set-view', null, [left, right]),
    onOpen() {
      gpuName.textContent = (g.view && g.view.gpuName) || 'Видеокарта не определена';
      for (const [key, control] of controls) {
        if (control.value !== settings[key]) control.value = settings[key];
      }
    },
  };
}
