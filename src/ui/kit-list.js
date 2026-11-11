// Kit: the list-left / detail-right layout and tab strips. Re-exported by kit.js.
import { icon } from './icons.js';
import { el, clear, isMobileUi } from './kit-base.js';

/**
 * Standard content of a list row: icon, label (+ sub line) and a right-aligned value.
 * @param {{icon?: string, label: string, sub?: string, right?: string|Node, rarity?: string, dim?: boolean, badge?: string}} opts
 * @returns {HTMLElement}
 * @example renderRow: quest => listRow({ icon: 'quest', label: quest.title, sub: quest.region, right: `ур. ${quest.level}` })
 */
export function listRow(opts) {
  const node = el('div.kit-row-body', { class: opts.dim ? 'dim' : '' }, [
    opts.icon ? el('span.kit-row-icon', null, icon(opts.icon)) : null,
    el('span.kit-row-text', null, [
      el('span.kit-row-label', { text: opts.label }),
      opts.sub ? el('span.kit-row-sub', { text: opts.sub }) : null,
    ]),
    opts.badge ? el('span.kit-row-badge', { text: opts.badge }) : null,
    opts.right !== undefined && opts.right !== null ? el('span.kit-row-right.t-num', null, opts.right) : null,
  ]);
  if (opts.rarity) node.style.setProperty('--rarity', `var(--r-${opts.rarity})`);
  return node;
}

/**
 * Tab strip (sub-categories inside a screen; the main menu tabs are drawn by ui.js).
 * @param {{tabs: Array<{id: string, label: string, icon?: string, count?: number}>, active?: string, onChange?: (id: string) => void, small?: boolean}} opts
 * @returns {{el: HTMLElement, active: string, set: (id: string, silent?: boolean) => void, step: (dir: number) => void, setCount: (id: string, n: number|null) => void}}
 * @example const t = tabs({ tabs: [{ id: 'buy', label: 'Купить' }, { id: 'sell', label: 'Продать' }], onChange: show });
 */
export function tabs(opts) {
  const node = el('div.kit-tabs.interactive', { class: opts.small ? 'small' : '' });
  const api = { el: node, active: opts.active ?? (opts.tabs[0] && opts.tabs[0].id), set, step, setCount };

  function paint() {
    for (const child of node.children) child.classList.toggle('active', child.dataset.id === String(api.active));
  }
  /** On mobile the strip scrolls sideways: bring the active tab into view. */
  function reveal() {
    const child = [...node.children].find(c => c.dataset.id === String(api.active));
    if (!child || node.scrollWidth <= node.clientWidth) return;
    node.scrollLeft = child.offsetLeft - (node.clientWidth - child.offsetWidth) / 2;
  }
  function set(id, silent) {
    if (api.active === id) return;
    api.active = id;
    paint();
    reveal();
    if (!silent && opts.onChange) opts.onChange(id);
  }
  function step(dir) {
    const index = opts.tabs.findIndex(t => t.id === api.active);
    const next = opts.tabs[(index + dir + opts.tabs.length) % opts.tabs.length];
    if (next) set(next.id);
  }
  function setCount(id, n) {
    const child = [...node.children].find(c => c.dataset.id === String(id));
    if (!child) return;
    let badge = child.querySelector('.kit-tab-count');
    if (n === null || n === undefined) {
      if (badge) badge.remove();
      return;
    }
    if (!badge) {
      badge = el('span.kit-tab-count.t-num');
      child.append(badge);
    }
    badge.textContent = String(n);
  }

  for (const tab of opts.tabs) {
    node.append(el('button.kit-tab', { type: 'button', dataset: { id: tab.id }, onClick: () => set(tab.id) }, [
      tab.icon ? icon(tab.icon) : null,
      el('span', { text: tab.label }),
      tab.count !== undefined ? el('span.kit-tab-count.t-num', { text: String(tab.count) }) : null,
    ]));
  }
  paint();
  return api;
}

/**
 * Section switcher for the mobile layout: a column of big buttons (a «rail») that shows one group of
 * nodes at a time. On desktop the rail is hidden and every node stays visible, so a screen keeps its
 * multi-column layout there and only gains this element in the DOM.
 * Inactive nodes get the class `m-off` (hidden only under `html.m-ui`, see styles/mobile.css).
 *
 * @param {object} opts
 * @param {Array<{id: string, label: string, icon?: string, nodes: Array<Element|null>, badge?: string|number}>} opts.items
 * @param {string} [opts.active]            initial section (default: the first one)
 * @param {(id: string) => void} [opts.onChange]
 * @param {Node} [opts.footer]              extra node pinned under the buttons (an always reachable action)
 * @returns {{el: HTMLElement, active: string, set: (id: string, silent?: boolean) => void, setBadge: (id: string, text: string|number|null) => void}}
 * @example const rail = sections({ items: [{ id: 'bag', label: 'Сумка', icon: 'inventory', nodes: [bagEl] }, { id: 'doll', label: 'Снаряжение', nodes: [dollEl] }] });
 *          view.prepend(rail.el);
 */
export function sections(opts) {
  const node = el('nav.m-rail.interactive');
  const list = el('div.m-rail-list');
  const api = { el: node, active: opts.active ?? (opts.items[0] && opts.items[0].id), set, setBadge };

  function paint() {
    for (const child of list.children) child.classList.toggle('active', child.dataset.id === String(api.active));
    for (const item of opts.items) {
      for (const target of item.nodes || []) {
        if (target) target.classList.toggle('m-off', item.id !== api.active);
      }
    }
  }
  function set(id, silent) {
    if (api.active === id || !opts.items.some(item => item.id === id)) return;
    api.active = id;
    paint();
    if (!silent && opts.onChange) opts.onChange(id);
  }
  function setBadge(id, text) {
    const child = [...list.children].find(c => c.dataset.id === String(id));
    if (!child) return;
    const badge = child.querySelector('.m-rail-badge');
    badge.textContent = text === null || text === undefined ? '' : String(text);
    badge.hidden = badge.textContent === '';
  }

  for (const item of opts.items) {
    const empty = item.badge === undefined || item.badge === null || item.badge === '';
    list.append(el('button.m-rail-btn', { type: 'button', dataset: { id: item.id }, onClick: () => set(item.id) }, [
      item.icon ? icon(item.icon) : null,
      el('span.m-rail-label', { text: item.label }),
      el('span.m-rail-badge.t-num', { text: empty ? '' : String(item.badge), hidden: empty }),
    ]));
  }
  node.append(list);
  if (opts.footer) node.append(el('div.m-rail-foot', null, opts.footer));
  paint();
  return api;
}

/**
 * The ESO layout: a scrolling list on the left, details of the selected entry on the right.
 * ↑/↓/Home/End move the selection, Enter (or double click) activates, a filter strip narrows the list.
 * Mobile layout (`html.m-ui`): master → detail navigation. The list takes the whole width; a tap on a row
 * opens the detail pane full-width under a «‹ Назад» bar (class `show-detail`); Esc / the back button
 * returns to the list first (kit-base `dismissMobileBack`). The API is the same in both layouts.
 *
 * @param {object} opts
 * @param {Array} opts.items                      entries (any objects)
 * @param {(item: any, state: {selected: boolean, index: number}) => Node|string} opts.renderRow  row content (see listRow)
 * @param {(item: any) => Node|string|null} opts.renderDetail   right-hand side for the selected entry
 * @param {(item: any|null) => void} [opts.onSelect]
 * @param {(item: any) => void} [opts.onActivate]  Enter / double click
 * @param {string} [opts.emptyText]               shown when the (filtered) list is empty
 * @param {string} [opts.detailEmptyText]         shown on the right when nothing is selected
 * @param {Array<{id: string, label: string, icon?: string, test?: (item: any) => boolean}>} [opts.filters]
 *        category strip above the list; a filter without `test` shows everything
 * @param {(item: any) => string} [opts.keyOf]    stable key so the selection survives setItems (default: item.id ?? index)
 * @param {(item: any) => string|null} [opts.groupOf]  optional group caption; a heading is inserted when it changes
 * @param {string} [opts.title]                   caption above the list
 * @param {Node} [opts.listFooter]                extra node under the list (totals, buttons)
 * @param {string} [opts.class]
 * @returns {{el: HTMLElement, list: HTMLElement, detail: HTMLElement, selected: any, setItems: (items: Array, keepSelection?: boolean) => void,
 *            select: (keyOrIndex: string|number) => void, refresh: () => void, refreshDetail: () => void, setFilter: (id: string) => void,
 *            handleKey: (event: KeyboardEvent) => boolean, focus: () => void}}
 * @example
 * const view = listDetail({
 *   items: recipes, emptyText: 'Рецептов нет',
 *   filters: [{ id: 'all', label: 'Все' }, { id: 'can', label: 'Доступные', test: r => r.craftable }],
 *   renderRow: r => listRow({ icon: r.icon, label: r.name, right: r.level }),
 *   renderDetail: r => recipeCard(r),
 *   onActivate: r => craft(r),
 * });
 * screenEl.append(view.el);            // and in the screen object: onKey: e => view.handleKey(e)
 */
export function listDetail(opts) {
  const keyOf = opts.keyOf || ((entry, index) => (entry && entry.id !== undefined ? String(entry.id) : String(index)));
  let items = opts.items || [];
  let visible = [];
  let filterId = opts.filters && opts.filters.length ? opts.filters[0].id : null;
  let selectedKey = null;
  const rowNodes = new Map();

  const filterStrip = opts.filters && opts.filters.length
    ? tabs({ tabs: opts.filters, small: true, onChange: id => {
      filterId = id;
      rebuild(true);
    } })
    : null;
  const list = el('div.kit-list.kit-scroll.interactive', { tabIndex: 0 });
  const detail = el('div.kit-detail.kit-scroll.interactive');
  const backTitle = el('span.kit-detail-backtitle');
  const backBar = el('div.kit-detail-bar.interactive', null, [
    el('button.kit-detail-back.m-back', { type: 'button', onClick: () => showList() }, [icon('chevron-left'), el('span', { text: 'Назад' })]),
    backTitle,
  ]);
  const node = el('div.kit-listdetail', { class: opts.class || '' }, [
    el('div.kit-listdetail-left', null, [
      opts.title ? el('div.kit-list-title', { text: opts.title }) : null,
      filterStrip ? filterStrip.el : null,
      list,
      opts.listFooter || null,
    ]),
    backBar,
    detail,
  ]);
  const api = {
    el: node, list, detail, selected: null, setItems, select, refresh, refreshDetail, setFilter, handleKey, focus: () => list.focus(),
    showList, showDetail,
  };

  /** Mobile: back from the detail pane to the list. */
  function showList() {
    if (!node.classList.contains('show-detail')) return;
    node.classList.remove('show-detail');
    const row = selectedKey !== null ? rowNodes.get(selectedKey) : null;
    if (row) row.scrollIntoView({ block: 'nearest' });
  }
  /** Mobile: open the detail pane of the selected entry (no effect on desktop — both panes are visible). */
  function showDetail() {
    if (api.selected && isMobileUi()) node.classList.add('show-detail');
  }

  function currentFilter() {
    return opts.filters ? opts.filters.find(f => f.id === filterId) : null;
  }

  function renderDetail() {
    const entry = api.selected;
    if (!entry) {
      clear(detail, el('div.kit-empty', null, [el('i.kit-empty-diamond'), el('div.kit-empty-text', { text: opts.detailEmptyText || (visible.length ? 'Выберите запись слева' : '') })]));
      return;
    }
    const content = opts.renderDetail ? opts.renderDetail(entry) : null;
    const sameEntry = detail.dataset.key === selectedKey && node.classList.contains('show-detail');
    const keepScroll = sameEntry ? detail.scrollTop : 0;
    clear(detail, typeof content === 'string' ? el('p', { text: content }) : content);
    detail.dataset.key = selectedKey;
    detail.scrollTop = keepScroll;
    const row = rowNodes.get(selectedKey);
    const label = row ? row.querySelector('.kit-row-label') : null;
    backTitle.textContent = label ? label.textContent : '';
  }

  function applySelection(key, notify, scroll) {
    if (selectedKey !== null && rowNodes.has(selectedKey)) rowNodes.get(selectedKey).classList.remove('selected');
    selectedKey = key;
    const index = visible.findIndex((entry, i) => keyOf(entry, i) === key);
    api.selected = index >= 0 ? visible[index] : null;
    if (api.selected) {
      const row = rowNodes.get(key);
      row.classList.add('selected');
      if (scroll) row.scrollIntoView({ block: 'nearest' });
    }
    renderDetail();
    if (notify && opts.onSelect) opts.onSelect(api.selected);
  }

  function rebuild(keepSelection) {
    const filter = currentFilter();
    visible = filter && filter.test ? items.filter(filter.test) : items.slice();
    rowNodes.clear();
    clear(list);
    if (!visible.length) {
      list.append(el('div.kit-empty', null, [el('i.kit-empty-diamond'), el('div.kit-empty-text', { text: opts.emptyText || 'Пусто' })]));
    }
    let group = null;
    visible.forEach((entry, index) => {
      if (opts.groupOf) {
        const nextGroup = opts.groupOf(entry);
        if (nextGroup !== group && nextGroup) list.append(el('div.kit-list-group', { text: nextGroup }));
        group = nextGroup;
      }
      const key = keyOf(entry, index);
      const content = opts.renderRow(entry, { selected: key === selectedKey, index });
      const row = el('div.kit-row', { dataset: { key } }, typeof content === 'string' ? el('span.kit-row-label', { text: content }) : content);
      row.addEventListener('click', () => {
        applySelection(key, true, false);
        showDetail();
      });
      row.addEventListener('dblclick', () => {
        if (opts.onActivate) opts.onActivate(entry);
      });
      rowNodes.set(key, row);
      list.append(row);
    });
    const keep = keepSelection && selectedKey !== null && rowNodes.has(selectedKey);
    const key = keep ? selectedKey : visible.length ? keyOf(visible[0], 0) : null;
    const changed = key !== selectedKey;
    if (!keep) node.classList.remove('show-detail');
    selectedKey = null;
    applySelection(key, changed, false);
  }

  /** Replace the entries. The selection is kept when an entry with the same key still exists. */
  function setItems(next, keepSelection = true) {
    items = next || [];
    rebuild(keepSelection);
  }
  /** Select by key (string) or by visible index (number). */
  function select(keyOrIndex) {
    const key = typeof keyOrIndex === 'number' ? (visible[keyOrIndex] ? keyOf(visible[keyOrIndex], keyOrIndex) : null) : String(keyOrIndex);
    if (key !== null && rowNodes.has(key)) applySelection(key, true, true);
  }
  /** Re-render rows and detail from the same items (after state changed). */
  function refresh() {
    const top = list.scrollTop;
    rebuild(true);
    list.scrollTop = top;
  }
  function refreshDetail() {
    renderDetail();
  }
  function setFilter(id) {
    if (filterStrip) filterStrip.set(id);
  }
  function move(delta, absolute) {
    if (!visible.length) return;
    const current = visible.indexOf(api.selected);
    const target = absolute !== undefined ? absolute : Math.max(0, Math.min(visible.length - 1, current + delta));
    applySelection(keyOf(visible[target], target), true, true);
  }
  /** Keyboard navigation; returns true when the key was consumed. Call it from the screen's onKey. */
  function handleKey(event) {
    switch (event.code) {
      case 'ArrowDown': case 'KeyS': move(1); return true;
      case 'ArrowUp': case 'KeyW': move(-1); return true;
      case 'PageDown': move(8); return true;
      case 'PageUp': move(-8); return true;
      case 'Home': move(0, 0); return true;
      case 'End': move(0, visible.length - 1); return true;
      case 'Enter': case 'NumpadEnter':
        if (api.selected && opts.onActivate) {
          opts.onActivate(api.selected);
          return true;
        }
        return false;
      default: return false;
    }
  }

  rebuild(false);
  return api;
}
