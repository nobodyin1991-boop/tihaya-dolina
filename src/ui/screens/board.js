// Notice board {cityKey} and bounties {cityKey} (contextual): pinned paper notes.
// Sim: board (listContracts, fulfilContract, pinContract, listBounties, acceptBounty, claimBounty).
import { item as itemDef } from '../../data/items.js';
import { listContracts, fulfilContract, pinContract, listBounties, acceptBounty, claimBounty } from '../../sim/board.js';
import { repRank } from '../../sim/reputation.js';
import { icon } from '../icons.js';
import { el, button, bar, tag, coins, emptyState, itemTooltip } from '../kit.js';
import { act, live, safe, render, rewardLine, pageHead, fact, cityName, currentCityKey, STATE_EVENTS } from '../screen-kit.js';
import { trainButton } from './train.js';

const TILTS = [-1.2, 0.8, -0.4, 1.4, -0.9, 0.5];
const BOUNTY_STATUS = { open: null, active: ['взят', 'gold'], ready: ['выполнен', 'good'], cooldown: ['позже', ''], done: ['выплачено', 'good'] };

export function registerBoardScreens(ui, g) {
  ui.registerScreen({ id: 'board', title: 'Доска объявлений', create: () => createBoard(g, ui, 'board') });
  ui.registerScreen({ id: 'bounties', title: 'Награды за головы', create: () => createBoard(g, ui, 'bounties') });
}

function createBoard(g, ui, kind) {
  let cityKey = 'valley';
  const state = () => g.state;
  const head = el('div.brd-head');
  const wall = el('div.brd-wall.kit-scroll.interactive');

  function contractNote(contract, index) {
    const def = itemDef(contract.itemId);
    const progress = bar({ value: contract.have, max: contract.count, kind: contract.canFulfil ? 'stamina' : 'gold' });
    const goods = el('div.brd-goods.interactive', null, [icon(def.icon), el('b', { text: `${contract.itemName} ×${contract.count}` })]);
    ui.tooltip.attach(goods, () => itemTooltip(contract.itemId));
    return el('article.brd-note', { class: `${contract.done ? 'done' : ''} ${contract.pinned ? 'pinned' : ''}`, style: { '--tilt': `${TILTS[index % TILTS.length]}deg` } }, [
      el('i.brd-pin'),
      el('div.brd-note-from', { text: contract.requester }),
      el('p.brd-note-text', { text: `«${contract.text}»` }),
      goods,
      contract.done ? null : el('div.brd-progress', null, [progress, el('span.t-num', { text: `${contract.have} / ${contract.count}` })]),
      el('div.brd-reward', null, rewardLine({ coins: contract.coins, rep: { [cityKey]: contract.rep } })),
      contract.done
        ? el('div.brd-stamp', { text: 'Выполнено' })
        : el('div.brd-actions', null, [
          button('Отдать', { small: true, primary: contract.canFulfil, disabled: !contract.canFulfil, title: contract.canFulfil ? '' : 'Соберите товар в сумку', onClick: () => act(ui, () => fulfilContract(state(), cityKey, contract.id)) }),
          button(contract.pinned ? 'Снять заметку' : 'В журнал', { small: true, icon: 'journal', title: 'Заказ останется в журнале и на доске, пока вы его не выполните', onClick: () => act(ui, () => pinContract(state(), cityKey, contract.id, !contract.pinned), contract.pinned ? 'Убрано из журнала' : 'Заказ записан в журнал') }),
        ]),
    ]);
  }

  function bountyNote(bounty, index) {
    const status = BOUNTY_STATUS[bounty.status];
    const progress = bar({ value: bounty.cur, max: bounty.need, kind: bounty.status === 'ready' ? 'stamina' : 'bad' });
    let control = null;
    if (bounty.status === 'open') control = button('Взять заказ', { small: true, primary: true, onClick: () => act(ui, () => acceptBounty(state(), bounty.id)) });
    else if (bounty.status === 'ready') control = button('Получить награду', { small: true, primary: true, icon: 'coin', onClick: () => act(ui, () => claimBounty(state(), bounty.id)) });
    else if (bounty.status === 'active' && bounty.marker) control = button('На карте', { small: true, icon: 'map', onClick: () => ui.open('map', { focus: `quest:${bounty.id}` }) });
    return el('article.brd-note.bounty', { class: `${bounty.elite ? 'elite' : ''} s-${bounty.status}`, style: { '--tilt': `${TILTS[(index + 2) % TILTS.length]}deg` } }, [
      el('i.brd-pin'),
      el('div.brd-note-from', null, [icon(bounty.elite ? 'skull' : 'swords'), bounty.elite ? 'Особо опасен' : 'Приказ капитана', status ? tag(status[0], status[1]) : null]),
      el('div.brd-note-title', { text: bounty.title }),
      el('p.brd-note-text', { text: bounty.text }),
      el('div.brd-goal', { text: bounty.goal }),
      bounty.status === 'active' || bounty.status === 'ready' ? el('div.brd-progress', null, [progress, el('span.t-num', { text: `${bounty.cur} / ${bounty.need}` })]) : null,
      el('div.brd-reward', null, rewardLine(bounty.rewards)),
      control ? el('div.brd-actions', null, control) : null,
      bounty.status === 'done' ? el('div.brd-stamp', { text: 'Выплачено' }) : null,
    ]);
  }

  function refresh() {
    const st = state();
    if (!st) return;
    const rank = repRank(st, cityKey);
    const isBoard = kind === 'board';
    const role = isBoard ? 'elder' : 'captain';
    render(head, () => pageHead(isBoard ? 'Доска объявлений' : 'Награды за головы',
      isBoard ? `${cityName(cityKey)} · горожане просят и платят честно. Объявления меняются каждое утро.` : `${cityName(cityKey)} · капитан стражи платит за спокойные дороги. Убийства считаются только после того, как заказ взят.`, [
        fact('Репутация', `${rank.name} · ${Math.round(rank.value)}`),
        fact('Монеты', coins(st.player.coins)),
        trainButton(ui, g, role, cityKey, isBoard ? 'Учиться у старосты' : 'Учиться у капитана'),
        isBoard ? null : button('Нанять охрану', { small: true, icon: 'shield', onClick: () => ui.open('guards', { cityKey }) }),
      ]));
    render(wall, () => {
      const list = safe(() => (isBoard ? listContracts(st, cityKey) : listBounties(st, cityKey)), []) || [];
      if (!list.length) return emptyState(isBoard ? 'Доска пуста — загляните завтра' : 'Капитану пока некого заказывать', 'note');
      return list.map((entry, index) => (isBoard ? contractNote(entry, index) : bountyNote(entry, index)));
    });
  }

  const watch = live([...STATE_EVENTS, 'board:refreshed', 'board:contract-done'], refresh);
  return {
    el: el('div.brd-view', null, [head, wall]),
    onOpen(params = {}) {
      cityKey = (params && params.cityKey) || currentCityKey(g) || 'valley';
      watch.start();
      refresh();
    },
    onClose: () => watch.stop(),
    hints: () => [{ key: 'journal', label: 'Журнал', touch: false, onClick: () => ui.open('journal') }],
  };
}
