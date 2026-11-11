// Caravan result {kind:'arrived'|'failed', reason?, result} (contextual): the summary card of a finished run.
// Reads only the `result` object produced by sim/caravan-run.js (falls back to state.caravan.lastResult).
import { LEGS } from '../../data/world-map.js';
import { icon } from '../icons.js';
import { el, button, coins, statRow, ornament, tag, formatNumber } from '../kit.js';
import { render, rewardLine, itemChip, cityName, percent } from '../screen-kit.js';

const NEXT_STAGE = [
  null,
  'Открыт второй перегон: Каменный Брод → Янтарная Гавань. У конюха появились фургон и кованые оси.',
  'Открыт третий перегон: Янтарная Гавань → Тихая долина. Самая опасная дорога — и самая щедрая.',
  'Торговое кольцо замкнулось! Гильдия открывает подряды на все три дороги.',
];

export function registerCaravanResultScreen(ui, g) {
  ui.registerScreen({ id: 'caravan-result', title: 'Итог рейса', create: () => createResult(g, ui) });
}

function createResult(g, ui) {
  const root = el('div.res-view');

  function arrived(result) {
    const sold = result.sold || [];
    const rows = [
      statRow('Плата гильдии', coins(result.fee || 0)),
      result.perfectBonus ? statRow('Надбавка за рейс без потерь', coins(result.perfectBonus)) : null,
      sold.length ? statRow('Продан попутный груз', coins(result.tradeIncome || 0), result.tradeProfit ? `${result.tradeProfit > 0 ? '+' : '−'}${formatNumber(Math.abs(result.tradeProfit))} прибыли` : null) : null,
    ];
    const lossy = (result.stolen || 0) > 0 || (result.guardsLost || 0) > 0;
    return el('article.res-card.arrived', null, [
      el('div.res-icon', null, icon('caravan')),
      el('div.res-kicker', { text: result.guild ? 'Гильдейский подряд выполнен' : 'Караван дошёл' }),
      el('div.res-title', { text: `${cityName(result.from)} → ${cityName(result.to)}` }),
      el('div.res-sub', { text: LEGS[result.leg] ? LEGS[result.leg].name : '' }),
      ornament(),
      el('div.res-total', null, [el('span', { text: 'Выплата' }), coins(result.coins || 0)]),
      el('div.res-rows', null, rows),
      sold.length ? el('div.res-sold', null, sold.map(entry => el('span.res-sold-item', null, [itemChip(entry.itemId, entry.count), el('small.t-num', { text: `по ${entry.price}` })]))) : null,
      el('div.res-rows', null, [
        statRow('Сохранность груза', percent(result.integrity ?? 1), (result.integrity ?? 1) >= 1 ? 'весь цел' : null),
        statRow('Украдено тюков', result.stolen || 0),
        statRow('Потеряно бойцов', result.guardsLost || 0),
      ]),
      el('div.res-gains', null, rewardLine({ xp: result.xp, rep: result.rep })),
      el('div.res-tags', null, [lossy ? null : tag('рейс без потерь', 'good'), tag(`${cityName(result.to)}: город окреп`, 'gold')]),
      !result.guild && NEXT_STAGE[result.stage] ? el('p.res-next', null, [icon('quest'), el('span', { text: NEXT_STAGE[result.stage] })]) : null,
      result.guild ? el('p.res-next', null, [icon('quest'), el('span', { text: 'Гильдия поднимает ступень подрядов: грузы тяжелее, плата выше.' })]) : null,
    ]);
  }

  function failed(result, reason) {
    const destroyed = (reason || result.reason) === 'destroyed';
    const lost = Object.entries(result.bonusLost || {}).filter(([, count]) => count > 0);
    return el('article.res-card.failed', null, [
      el('div.res-icon', null, icon(destroyed ? 'skull' : 'back')),
      el('div.res-kicker', { text: destroyed ? 'Телега разбита' : 'Рейс брошен' }),
      el('div.res-title', { text: LEGS[result.leg] ? LEGS[result.leg].name : 'Караван' }),
      ornament(),
      el('p.res-text', { text: result.text || 'Караван не дошёл.' }),
      el('div.res-rows', null, [
        statRow('Груза вернулось в ведомость', percent(result.cargoKept ?? 0)),
        statRow('Долг за буксировку', coins(result.towFee || 0)),
      ]),
      lost.length ? el('div.res-sold', null, [el('span.t-dim', { text: 'Пропал попутный груз:' }), ...lost.map(([itemId, count]) => itemChip(itemId, count))]) : null,
      el('p.res-next', null, [icon('info'), el('span', { text: `Долг спишется при следующем выезде. ${destroyed ? 'Почините телегу у конюха, доберите груз — и снова в путь.' : 'Доберите недостающий груз и выезжайте снова.'}` })]),
    ]);
  }

  return {
    el: root,
    onOpen(params = {}) {
      const result = (params && params.result) || (g.state && g.state.caravan && g.state.caravan.lastResult);
      const kind = (params && params.kind) || (result && result.type) || 'arrived';
      render(root, () => {
        if (!result) return el('article.res-card', null, el('p.res-text', { text: 'Сведений о рейсе нет.' }));
        return [
          kind === 'failed' ? failed(result, params && params.reason) : arrived(result),
          el('div.gs-actions.center', null, [
            button('Продолжить', { primary: true, onClick: () => ui.close() }),
            button('К каравану', { icon: 'caravan', onClick: () => {
              ui.close();
              ui.open('caravan');
            } }),
          ]),
        ];
      });
    },
    onKey(event) {
      if (event.code === 'Enter' || event.code === 'NumpadEnter' || event.code === 'KeyE' || event.code === 'Space') {
        ui.close();
        return true;
      }
      return false;
    },
    hints: () => [{ key: 'Enter', label: 'Продолжить', touch: false, onClick: () => ui.close() }],
  };
}
