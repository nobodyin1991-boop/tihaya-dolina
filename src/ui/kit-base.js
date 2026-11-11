// Kit foundation: DOM builder, shared context, cursor tooltip and modal dialogs.
// Everything here is re-exported by kit.js — import from './kit.js' in screens.

const context = {
  root: null,
  caption: () => '',
};

/**
 * Wire the kit to the running UI (done once by createUI).
 * @param {{root?: HTMLElement, caption?: (action: string) => string}} opts
 *        `root` — layer that receives tooltips and modals; `caption` — key caption lookup for keyHint.
 */
export function setKitContext(opts) {
  if (opts.root) context.root = opts.root;
  if (opts.caption) context.caption = opts.caption;
}

export const kitRoot = () => context.root || document.body;
export const keyCaptionFor = action => {
  try {
    return context.caption(action) || '';
  } catch {
    return '';
  }
};

function appendChildren(node, children) {
  if (children === null || children === undefined || children === false) return;
  if (Array.isArray(children)) {
    for (const child of children) appendChildren(node, child);
    return;
  }
  node.append(children instanceof Node ? children : document.createTextNode(String(children)));
}

/**
 * Create a DOM element.
 * @param {string} tag   tag name, optionally with classes: `'div.kit-row.selected'`
 * @param {object|null} [props]  `class`, `text`, `html`, `style` (object or string), `dataset`, `attrs`,
 *        `onClick`/`onInput`/… listeners, any other key is assigned as a DOM property
 * @param {Node|string|Array} [children]  nested arrays and falsy values are allowed
 * @returns {HTMLElement}
 * @example el('div.card', { onClick: open }, [el('b', { text: 'Заголовок' }), 'текст'])
 */
export function el(tag, props, children) {
  const parts = tag.split('.');
  const node = document.createElement(parts[0] || 'div');
  if (parts.length > 1) node.className = parts.slice(1).join(' ');
  if (props) {
    for (const key of Object.keys(props)) {
      const value = props[key];
      if (value === undefined || value === null) continue;
      if (key === 'class') {
        if (value) node.className = node.className ? `${node.className} ${value}` : value;
      } else if (key === 'text') node.textContent = value;
      else if (key === 'html') node.innerHTML = value;
      else if (key === 'style') {
        if (typeof value === 'string') node.style.cssText = value;
        else for (const name of Object.keys(value)) {
          if (name.startsWith('--')) node.style.setProperty(name, value[name]);
          else node.style[name] = value[name];
        }
      } else if (key === 'dataset') Object.assign(node.dataset, value);
      else if (key === 'attrs') for (const name of Object.keys(value)) node.setAttribute(name, value[name]);
      else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2).toLowerCase(), value);
      else node[key] = value;
    }
  }
  appendChildren(node, children);
  return node;
}

/** Remove all children of a node and (optionally) append new ones. Returns the node. */
export function clear(node, children) {
  node.textContent = '';
  appendChildren(node, children);
  return node;
}

/** Write text only when it changed (cheap to call every frame). */
export function setText(node, text) {
  const value = String(text);
  if (node._text !== value) {
    node._text = value;
    node.textContent = value;
  }
}

/** Toggle a class only when the state changed (cheap to call every frame). */
export function setClass(node, name, on) {
  const key = `_c_${name}`;
  const flag = !!on;
  if (node[key] !== flag) {
    node[key] = flag;
    node.classList.toggle(name, flag);
  }
}

/** Russian plural: plural(3, 'монета', 'монеты', 'монет') → 'монеты'. */
export function plural(n, one, few, many) {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  if (b === 1) return one;
  return many;
}

/** 12500 → «12 500». */
export const formatNumber = n => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

// ───────────────────────── tooltip ─────────────────────────

let tipNode = null;
let tipOwner = null;

function tipElement() {
  if (!tipNode) {
    tipNode = el('div.kit-tooltip');
    tipNode.hidden = true;
  }
  if (tipNode.parentNode !== kitRoot()) kitRoot().append(tipNode);
  return tipNode;
}

function placeTip(x, y) {
  const node = tipNode;
  const margin = 10;
  const gap = 18;
  const w = node.offsetWidth;
  const h = node.offsetHeight;
  let left = x + gap;
  let top = y + gap;
  if (left + w > window.innerWidth - margin) left = x - gap - w;
  if (top + h > window.innerHeight - margin) top = y - gap - h;
  left = Math.max(margin, Math.min(left, window.innerWidth - margin - w));
  top = Math.max(margin, Math.min(top, window.innerHeight - margin - h));
  node.style.transform = `translate3d(${Math.round(left)}px, ${Math.round(top)}px, 0)`;
}

/**
 * Cursor tooltip (one shared element, always kept inside the viewport).
 * @example tooltip.attach(slot, () => itemTooltip('salve'));   // lazy content
 * @example tooltip.attach(button, 'Нужен 5 уровень');
 */
export const tooltip = {
  /** Show `content` (string | Node) near the point (x, y) in CSS pixels. */
  show(content, x, y) {
    if (content === null || content === undefined || content === '') {
      tooltip.hide();
      return;
    }
    const node = tipElement();
    clear(node, typeof content === 'string' ? el('div.kit-tip-text', { text: content }) : content);
    node.hidden = false;
    placeTip(x, y);
  },
  /** Follow the cursor. */
  move(x, y) {
    if (tipNode && !tipNode.hidden) placeTip(x, y);
  },
  hide() {
    if (tipNode) tipNode.hidden = true;
    tipOwner = null;
  },
  /**
   * Show a tooltip while the pointer is over `target`.
   * @param {HTMLElement} target
   * @param {string|Node|(() => string|Node|null)} content  a function is evaluated on every hover
   */
  attach(target, content) {
    target.addEventListener('mouseenter', event => {
      const value = typeof content === 'function' ? content() : content;
      tipOwner = target;
      tooltip.show(value, event.clientX, event.clientY);
      tipOwner = target;
    });
    target.addEventListener('mousemove', event => tooltip.move(event.clientX, event.clientY));
    target.addEventListener('mouseleave', () => {
      if (tipOwner === target) tooltip.hide();
    });
    return target;
  },
};

// ───────────────────────── modal ─────────────────────────

const openModals = [];

/**
 * Modal dialog over everything else.
 * @param {{title?: string, content?: Node|string|Array, buttons?: Array<{label: string, value?: any, primary?: boolean, danger?: boolean, onClick?: () => (boolean|void)}>, wide?: boolean, dismissable?: boolean}} opts
 *        a button closes the dialog with its `value` unless its `onClick` returns `false`
 * @returns {{el: HTMLElement, body: HTMLElement, close: (value?: any) => void, closed: Promise<any>}}
 * @example const m = modal({ title: 'Сколько продать?', content: stepper, buttons: [{ label: 'Продать', value: true, primary: true }, { label: 'Отмена' }] });
 *          if (await m.closed) sell(stepper.value);
 */
export function modal(opts = {}) {
  let resolve;
  const closed = new Promise(done => {
    resolve = done;
  });
  const body = el('div.kit-modal-body', null, typeof opts.content === 'string' ? el('p', { text: opts.content }) : opts.content);
  const buttons = el('div.kit-modal-buttons');
  const dialog = el('div.kit-modal', { class: opts.wide ? 'wide' : '' }, [
    opts.title ? el('div.kit-modal-title', { text: opts.title }) : null,
    opts.title ? el('div.kit-orn', null, el('i')) : null,
    body,
    buttons,
  ]);
  const veil = el('div.kit-modal-veil.interactive', null, dialog);
  const api = { el: veil, body, close, closed, dismissable: opts.dismissable !== false };
  let done = false;

  function close(value) {
    if (done) return;
    done = true;
    const index = openModals.indexOf(api);
    if (index >= 0) openModals.splice(index, 1);
    veil.classList.add('closing');
    setTimeout(() => veil.remove(), 140);
    resolve(value);
  }

  for (const def of opts.buttons || [{ label: 'Закрыть', primary: true }]) {
    const cls = `btn${def.primary ? ' primary' : ''}${def.danger ? ' danger' : ''}`;
    const node = el('button', { class: cls, text: def.label, onClick: () => {
      if (def.onClick && def.onClick() === false) return;
      close(def.value);
    } });
    if (def.primary) api.primary = node;
    buttons.append(node);
  }
  veil.addEventListener('mousedown', event => {
    if (event.target === veil && api.dismissable) close(undefined);
  });
  openModals.push(api);
  tooltip.hide();
  kitRoot().append(veil);
  return api;
}

/**
 * Yes/No confirmation.
 * @param {{title?: string, text?: string, yes?: string, no?: string, danger?: boolean}} opts
 * @returns {Promise<boolean>}
 * @example if (await confirmDialog({ title: 'Продать всё?', text: 'Вернуть будет нельзя.', yes: 'Продать' })) sellAll();
 */
export function confirmDialog(opts = {}) {
  const dialog = modal({
    title: opts.title || 'Подтверждение',
    content: opts.text ? el('p.kit-modal-text', { text: opts.text }) : null,
    buttons: [
      { label: opts.yes || 'Да', value: true, primary: true, danger: opts.danger },
      { label: opts.no || 'Отмена', value: false },
    ],
  });
  return dialog.closed.then(value => value === true);
}

/** True while at least one modal is open. */
export const hasModal = () => openModals.length > 0;

/** Close the top modal as if it was dismissed (Esc). Returns true when one was closed. */
export function dismissTopModal() {
  const top = openModals[openModals.length - 1];
  if (!top) return false;
  top.close(undefined);
  return true;
}

/** Press the primary button of the top modal (Enter). Returns true when handled. */
export function acceptTopModal() {
  const top = openModals[openModals.length - 1];
  if (!top || !top.primary) return false;
  top.primary.click();
  return true;
}
