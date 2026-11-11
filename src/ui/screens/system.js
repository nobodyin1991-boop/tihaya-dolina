// System screen (menu tab, opened by Esc): continue, save, export / import, quit to title.
// Consumes: g.save(), g.exportSave(), g.importSave(text), g.quitToTitle(), g.state.player, g.state.time.
import { xpProgress } from '../../sim/player.js';
import { icon } from '../icons.js';
import { el, clear, statRow, ornament } from '../kit.js';

function playTime(seconds) {
  const total = Math.floor(seconds || 0);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  return hours ? `${hours} ч ${minutes} мин` : `${minutes} мин`;
}

export function registerSystemScreen(ui, g) {
  ui.registerScreen({
    id: 'system',
    title: 'Меню',
    tab: { order: 90, icon: 'system' },
    create: () => createSystemScreen(g, ui),
  });
}

function createSystemScreen(g, ui) {
  const card = el('div.sys-card');
  const fileInput = el('input', { type: 'file', accept: '.json,application/json', hidden: true });

  function item(iconKey, label, note, onClick, cls) {
    return el('button.sys-item', { type: 'button', class: cls || '', onClick }, [
      el('span.sys-item-icon', null, icon(iconKey)),
      el('span.sys-item-text', null, [el('span.sys-item-label', { text: label }), note ? el('small', { text: note }) : null]),
    ]);
  }

  function save() {
    if (g.save()) ui.toast('Игра сохранена', 'good');
    else ui.toast('Сохранить не удалось', 'bad');
    renderCard();
  }

  function exportSave() {
    try {
      const text = g.exportSave();
      const name = (g.state.player.name || 'hero').replace(/[^\p{L}\p{N}_-]+/gu, '_');
      const stamp = new Date().toISOString().slice(0, 10);
      const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
      const link = el('a', { href: url, download: `tihaya-dolina-${name}-${stamp}.json` });
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      ui.toast('Сохранение выгружено в файл', 'good');
    } catch (error) {
      ui.toast(`Экспорт не удался: ${error.message}`, 'bad');
    }
  }

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files && fileInput.files[0];
    fileInput.value = '';
    if (!file) return;
    const agreed = await ui.confirm({
      title: 'Загрузить сохранение?',
      text: `Текущий прогресс будет заменён данными из файла «${file.name}».`,
      yes: 'Загрузить',
      danger: true,
    });
    if (!agreed) return;
    try {
      g.importSave(await file.text());
      ui.toast('Сохранение загружено', 'good');
    } catch (error) {
      ui.toast(error && error.message ? error.message : 'Файл сохранения повреждён', 'bad');
    }
  });

  async function quit() {
    const agreed = await ui.confirm({
      title: 'Выйти в главное меню?',
      text: 'Игра будет сохранена.',
      yes: 'Выйти',
    });
    if (!agreed) return;
    ui.closeAll();
    g.quitToTitle();
  }

  function renderCard() {
    const state = g.state;
    if (!state || !state.player) {
      clear(card);
      return;
    }
    const p = state.player;
    const xp = xpProgress(state);
    const saved = state.savedAt ? new Date(state.savedAt).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) : 'ещё не сохранялась';
    clear(card, [
      el('div.sys-hero-name', { text: p.name }),
      el('div.sys-hero-sub', { text: `${g.hero.level || p.level} уровень` }),
      ornament(),
      statRow('Опыт', xp.required ? `${xp.current} / ${xp.required}` : 'предел'),
      statRow('В пути', playTime(p.playSeconds)),
      statRow('День', state.time ? state.time.day : 1),
      statRow('Побеждено врагов', p.kills || 0),
      statRow('Поражений', p.deaths || 0),
      el('div.sys-saved', { text: `Последнее сохранение: ${saved}` }),
    ]);
  }

  const menu = el('div.sys-menu', null, [
    item('play', 'Продолжить', 'Вернуться в игру', () => ui.close(), 'primary'),
    item('save', 'Сохранить', 'Игра также сохраняется сама', save),
    item('export', 'Экспорт сохранения', 'Выгрузить прогресс в файл .json', exportSave),
    item('import', 'Импорт сохранения', 'Загрузить прогресс из файла', () => fileInput.click()),
    item('settings', 'Настройки', 'Графика, звук, управление', () => ui.open('settings')),
    item('exit', 'Выйти в главное меню', 'С сохранением', quit, 'quit'),
  ]);

  return {
    el: el('div.sys-view', null, [
      el('div.sys-column.interactive', null, [el('div.sys-title', { text: 'Тихая долина' }), ornament(), menu, fileInput]),
      el('div.sys-side', null, card),
    ]),
    onOpen: renderCard,
  };
}
