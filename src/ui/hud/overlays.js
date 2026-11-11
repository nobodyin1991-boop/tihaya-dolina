// HUD overlays: zone banner, «discovered» line, damage / low-health vignettes, death screen, loading screen, FPS readout.
// Consumes events: zone:entered {title, sub, kind}, world:discovered {id, name}, hero:damaged {amount, crit},
//                  hero:died {reason}, hero:respawned, game:loading, game:started; g.fps, g.view.info(), g.settings.showFps.
import { on } from '../../core/events.js';
import { el, setText, setClass } from '../kit.js';

const BANNER_SECONDS = 4.2;
const TIPS = [
  'Зачищенный лагерь разбойников ослабляет засады на своём участке тракта.',
  'Попутный груз дёшев там, где его добывают, и дорог за перевалом.',
  'Телега не ждёт: отойдёте слишком далеко — караван остановится.',
  'Уклонение тратит выносливость, но спасает от тяжёлого удара.',
  'Мастера профессий в каждом городе учат новым рецептам.',
  'Ночью на дорогах опаснее, зато в городах дешевле ночлег.',
  'Охрана каравана стоит монет, но разбитая телега стоит дороже.',
  'Редкие травы и руды требуют инструмента получше.',
  'Отметьте место на карте — и оно появится на компасе.',
  'Еда лечит постепенно; мази и перевязки — быстро, но с перерывом.',
];
const KIND_EYEBROW = { city: 'Город', poi: '', region: '' };

export function createOverlays(g, ui, hudLayer) {
  // —— banner ——
  const eyebrow = el('div.banner-eyebrow');
  const title = el('div.banner-title');
  const sub = el('div.banner-sub');
  const banner = el('div.zone-banner', null, [eyebrow, title, el('div.kit-orn', null, el('i')), sub]);
  const hitVignette = el('div.vignette-hit');
  const lowVignette = el('div.vignette-low');
  const fps = el('div.fps-readout.t-num');
  hudLayer.append(lowVignette, hitVignette, banner, fps);

  let bannerLeft = 0;
  let pendingDiscovery = null;

  function showBanner(data) {
    setText(eyebrow, data.eyebrow || '');
    setText(title, data.title || '');
    setText(sub, data.sub || '');
    banner.className = `zone-banner kind-${data.kind || 'region'}`;
    void banner.offsetWidth;
    banner.classList.add('show');
    bannerLeft = BANNER_SECONDS;
  }

  on('world:discovered', payload => {
    if (!payload || !payload.name) return;
    const discovery = { name: payload.name };
    pendingDiscovery = discovery;
    // The engine announces the zone right after discovering it; if it does not, show the discovery on its own.
    setTimeout(() => {
      if (pendingDiscovery !== discovery) return;
      pendingDiscovery = null;
      showBanner({ eyebrow: 'Открыто', title: discovery.name, sub: 'Место отмечено на карте', kind: 'poi' });
    }, 80);
  });
  on('zone:entered', payload => {
    if (!payload || !payload.title) return;
    const discovered = pendingDiscovery && pendingDiscovery.name === payload.title;
    pendingDiscovery = null;
    showBanner({
      eyebrow: discovered ? 'Открыто' : KIND_EYEBROW[payload.kind] || '',
      title: payload.title,
      sub: payload.sub,
      kind: payload.kind,
    });
  });
  on('hero:damaged', payload => {
    hitVignette.classList.remove('show', 'crit');
    void hitVignette.offsetWidth;
    hitVignette.classList.add('show');
    if (payload && payload.crit) hitVignette.classList.add('crit');
  });

  // —— death ——
  const deathReason = el('div.death-reason');
  const death = el('div.death-screen.interactive', { hidden: true }, [
    el('div.death-title', { text: 'Вы пали' }),
    el('div.kit-orn', null, el('i')),
    deathReason,
    el('div.death-wait', null, [el('i.death-shimmer'), el('span', { text: 'Вас несут в ближайший город…' })]),
  ]);
  // —— loading ——
  const tip = el('div.loading-tip');
  const loading = el('div.loading-screen.interactive', { hidden: true }, [
    el('div.loading-mark', null, [
      el('div.loading-title', { text: 'Тихая долина' }),
      el('div.loading-tagline', { text: 'Кольцо караванов' }),
    ]),
    el('div.loading-foot', null, [
      el('div.loading-caption', { text: 'Мир просыпается' }),
      el('div.loading-track', null, el('i')),
      tip,
    ]),
  ]);
  ui.layers.overlay.append(death, loading);

  let tipIndex = Math.floor(Math.random() * TIPS.length);
  let tipTimer = 0;
  let hideTimer = 0;

  function nextTip() {
    tipIndex = (tipIndex + 1) % TIPS.length;
    tip.classList.remove('show');
    void tip.offsetWidth;
    tip.textContent = TIPS[tipIndex];
    tip.classList.add('show');
  }

  function showLoading() {
    clearTimeout(hideTimer);
    loading.hidden = false;
    loading.classList.remove('out');
    nextTip();
    clearInterval(tipTimer);
    tipTimer = setInterval(nextTip, 5200);
  }
  function hideLoading() {
    clearInterval(tipTimer);
    loading.classList.add('out');
    hideTimer = setTimeout(() => {
      loading.hidden = true;
    }, 700);
  }
  function showDeath(reason) {
    setText(deathReason, reason || 'Раны оказались слишком тяжёлыми.');
    death.hidden = false;
    death.classList.remove('out');
    void death.offsetWidth;
    death.classList.add('show');
  }
  function hideDeath() {
    if (death.hidden) return;
    death.classList.add('out');
    setTimeout(() => {
      death.hidden = true;
      death.classList.remove('show', 'out');
    }, 600);
  }

  on('game:loading', showLoading);
  on('game:started', () => {
    hideLoading();
    hideDeath();
  });
  on('hero:died', payload => showDeath(payload && payload.reason));
  on('hero:respawned', hideDeath);
  ui.onPhase(phase => {
    if (phase === 'loading' && loading.hidden) showLoading();
    if (phase === 'title') {
      hideDeath();
      if (!loading.hidden) hideLoading();
    }
  });

  let fpsIn = 0;

  function update(dt, lowHealth) {
    if (bannerLeft > 0) {
      bannerLeft -= dt;
      if (bannerLeft <= 0) banner.classList.remove('show');
    }
    setClass(lowVignette, 'show', !!lowHealth);
    const showFps = !!(g.settings && g.settings.showFps);
    setClass(fps, 'show', showFps);
    if (showFps) {
      fpsIn -= dt;
      if (fpsIn <= 0) {
        fpsIn = 0.5;
        const info = g.view && g.view.info ? g.view.info() : null;
        const extra = info ? ` · ${info.calls} вызовов · ${Math.round(info.triangles / 1000)} тыс. треуг.` : '';
        setText(fps, `${g.fps || 0} к/с${extra}`);
      }
    }
  }

  return { update, showLoading, hideLoading, showBanner };
}
