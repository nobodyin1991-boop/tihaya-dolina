// Entry point: settings → engine → UI. Any failure on the way shows a readable fatal screen.
import { createSettings } from './core/settings.js';
import { watchDevice, isTouch } from './ui/device.js';

function showFatal(title, text, detail) {
  const box = document.createElement('div');
  box.className = 'fatal';
  const inner = document.createElement('div');
  inner.className = 'fatal-box';
  const heading = document.createElement('div');
  heading.className = 'fatal-title';
  heading.textContent = title;
  const body = document.createElement('p');
  body.className = 'fatal-text';
  body.textContent = text;
  inner.append(heading, body);
  if (detail) {
    const pre = document.createElement('pre');
    pre.className = 'fatal-detail';
    pre.textContent = detail;
    inner.append(pre);
  }
  const reload = document.createElement('button');
  reload.className = 'btn primary';
  reload.textContent = 'Перезапустить';
  reload.addEventListener('click', () => location.reload());
  inner.append(reload);
  box.append(inner);
  document.body.append(box);
}

function hasWebGL2() {
  try {
    return !!document.createElement('canvas').getContext('webgl2');
  } catch {
    return false;
  }
}

async function boot() {
  const canvas = document.getElementById('game');
  if (!hasWebGL2()) {
    showFatal(
      'Нужна поддержка WebGL 2',
      'Видеокарта или драйвер не поддерживают WebGL 2. Обновите драйвер видеокарты и включите аппаратное ускорение — без него мир долины не отрисовать.',
    );
    return;
  }
  try {
    watchDevice();
    const settings = createSettings(isTouch() ? { quality: 'mobile' } : {});
    const { createGame } = await import('./game/game.js');
    const g = createGame({ canvas, settings });
    const { createUI } = await import('./ui/ui.js');
    const ui = createUI(g);
    window.__game = g;
    window.__ui = ui;
  } catch (error) {
    console.error(error);
    showFatal(
      'Игра не запустилась',
      'При запуске произошла ошибка. Попробуйте перезапустить игру; если не поможет — передайте разработчику текст ниже.',
      error && error.stack ? String(error.stack) : String(error),
    );
  }
}

window.addEventListener('error', event => {
  if (document.querySelector('.fatal') || window.__ui) return;
  showFatal('Игра не запустилась', 'Ошибка при загрузке модулей игры.', event.message || 'Неизвестная ошибка');
});

boot();
