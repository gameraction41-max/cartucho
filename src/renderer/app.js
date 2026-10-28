// Interface do Cartucho: guarda o estado, troca de tela e distribui as ações do controle.
import { api, isDemo } from './lib/api.js';
import { createInput } from './lib/input.js';
import { createFocus } from './lib/focus.js';
import { createKeyboard } from './lib/keyboard.js';
import { sfx, configureSound, setMusicPaused, setGameTrack } from './lib/sound.js';
import { h, hue, loadFirst, downloadText } from './lib/ui.js';
import { applyTheme } from './lib/themes.js';
import home from './views/home.js';
import game from './views/game.js';
import achievements from './views/achievements.js';
import minecraft from './views/minecraft.js';
import library from './views/library.js';
import settings from './views/settings.js';
import pc from './views/pc.js';
import friends from './views/friends.js';
import screenshots from './views/screenshots.js';
import artsearch from './views/artsearch.js';
import { showBoot } from './views/boot.js';
import { createMenu } from './views/menu.js';

const VIEWS = { home, game, artsearch, achievements, minecraft, friends, library, screenshots, pc, settings };
const TABS = ['home', 'minecraft', 'achievements', 'friends', 'library', 'screenshots', 'pc', 'settings'];
const SCROLLERS = '.shots-filters, .set-list, .glist, .grid, .row, .mc-row, .ach-list';

const GLYPHS = {
  gamepad: { confirm: ['A', 'a'], back: ['B', 'b'], x: ['X', 'x'], y: ['Y', 'y'], lb: ['LB', ''], rb: ['RB', ''], lt: ['LT', ''], rt: ['RT', ''], ltrt: ['LT RT', ''], menu: ['☰', ''], lr: ['◀ ▶', ''] },
  keyboard: { confirm: ['Enter', 'key'], back: ['Esc', 'key'], x: ['F', 'key'], y: ['I', 'key'], lb: ['Q', 'key'], rb: ['E', 'key'], lt: ['PgUp', 'key'], rt: ['PgDn', 'key'], ltrt: ['PgUp PgDn', 'key'], menu: ['M', 'key'], lr: ['← →', 'key'] },
};
const ICONS = {
  gamepad: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 9h4M8 7v4M15 10h.01M18 8h.01"/><path d="M7 4h10a5 5 0 0 1 5 5v4a4 4 0 0 1-7 2.6L14 14h-4l-1 1.6A4 4 0 0 1 2 13V9a5 5 0 0 1 5-5z"/></svg>',
  keyboard: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M6 9h.01M10 9h.01M14 9h.01M18 9h.01M6 13h.01M18 13h.01M9 15.5h6"/></svg>',
  mouse: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="6" y="3" width="12" height="18" rx="6"/><path d="M12 7v4"/></svg>',
};
const DEVICE_NAME = { gamepad: 'Controle', keyboard: 'Teclado', mouse: 'Mouse' };

const state = { downloads: [], update: null, config: {}, games: [], profile: null, steamConfigured: false, syncedAt: 0, running: null, device: 'keyboard' };
const stack = []; // [{ id, params }]
let current = null; // { id, params, view: resultado do render }
let menu = null;
let focusBeforeMenu = null;
let menuOverApp = false; // menu aberto pelo botão do Xbox com outro app ou jogo na frente
let renderToken = 0;

const $ = (id) => document.getElementById(id);
const focus = createFocus();
const vkb = createKeyboard({ root: document.getElementById('vkb-root'), focus, sfx, hints: (list) => hintEls(list), readClipboard: () => api.readClipboard() });

// ===== interface comum =====

function toast(message, { error = false } = {}) {
  const el = $('toast');
  el.textContent = message;
  el.classList.toggle('error', error);
  el.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove('show'), 3800);
  if (error) sfx.error();
}

function renderTopbar() {
  const tabs = $('tabs');
  const rootId = stack[0] && stack[0].id;
  tabs.replaceChildren(
    h('span', { class: 'shoulder' }, GLYPHS[glyphSet()].lb[0]),
    ...TABS.map((id) => h('button', { class: id === rootId ? 'on' : '', onclick: () => goTab(id) }, VIEWS[id].label)),
    h('span', { class: 'shoulder' }, GLYPHS[glyphSet()].rb[0]),
  );
  $('me-name').textContent = (state.profile && state.profile.name) || 'Jogador';
  $('me-avatar').style.backgroundImage = state.profile && state.profile.avatar ? `url("${state.profile.avatar}")` : '';
}

function glyphSet() {
  return state.device === 'gamepad' ? 'gamepad' : 'keyboard';
}

function hintEls(hints) {
  const glyphs = GLYPHS[glyphSet()];
  return hints.map(([action, label]) => {
    const [text, cls] = glyphs[action];
    return h('span', {}, h('i', { class: `k ${cls}` }, text), label);
  });
}

function renderHints() {
  $('hints').replaceChildren(...hintEls((current && current.view.hints) || []));
}

function renderDevice() {
  const pill = $('input-pill');
  pill.innerHTML = ICONS[state.device];
  pill.append(DEVICE_NAME[state.device]);
  document.body.classList.toggle('hide-cursor', state.device === 'gamepad');
  renderHints();
  renderTopbar();
}

function tickClock() {
  const text = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  document.querySelectorAll('.clock').forEach((el) => { el.textContent = text; });
}

// Fundo da tela: arte do jogo selecionado, ou um degradê com a cor do nome dele.
let bgFront = 0;
let bgWanted = null;
// A música do jogo só entra depois de a seleção parar um instante nele, para não trocar a cada capa ao passar pela lista.
const TRACK_DELAY = 700;
let trackTimer = null;

async function setBackground(g) {
  clearTimeout(trackTimer);
  trackTimer = setTimeout(() => setGameTrack(g && g.music), g && g.music ? TRACK_DELAY : 0);
  // A arte entra na comparação para o fundo mudar na hora quando a pessoa troca a imagem do jogo.
  const key = g ? `${g.key}|${JSON.stringify(g.art)}` : null;
  if (key === bgWanted) return;
  bgWanted = key;
  const urls = g && g.art ? [...(g.art.hero || []), ...(g.source === 'prism' ? [] : g.art.cover || [])] : [];
  const url = urls.length ? await loadFirst(urls) : null;
  if (bgWanted !== key) return;
  const layers = document.querySelectorAll('.bg-layer');
  const next = layers[1 - bgFront];
  const hh = g ? hue(g.title) : 225;
  next.style.backgroundImage = url
    ? `url("${url}")`
    : `radial-gradient(circle at 72% 30%, hsl(${hh} 55% 45%) 0%, hsl(${hh} 50% 18%) 35%, hsl(${hh} 40% 6%) 75%)`;
  next.classList.add('on');
  layers[bgFront].classList.remove('on');
  bgFront = 1 - bgFront;
}

// Aviso de conquista desbloqueada, um de cada vez, no canto da tela, como nos consoles.
const notices = [];
let noticeShowing = false;
function notifyAchievements(list) {
  notices.push(...list);
  if (!noticeShowing) nextNotice();
}

function nextNotice() {
  const a = notices.shift();
  const box = $('notice');
  if (!a) {
    noticeShowing = false;
    return;
  }
  noticeShowing = true;
  const ico = h('span', { class: 'ico' });
  if (a.icon) ico.style.backgroundImage = `url("${a.icon}")`;
  box.replaceChildren(ico, h('div', { class: 'txt' },
    h('small', {}, `Conquista desbloqueada · ${a.game}`),
    h('b', {}, a.name),
    a.description ? h('span', {}, a.description) : null));
  box.classList.add('show');
  sfx.achievement();
  setTimeout(() => {
    box.classList.remove('show');
    setTimeout(nextNotice, 450);
  }, 5200);
}

// ===== navegação entre telas =====

const ctx = {
  state,
  api,
  sfx,
  toast,
  setBackground,
  go: (id, params = {}) => {
    stack[stack.length - 1].focusKey = focus.key;
    stack.push({ id, params });
    return show();
  },
  back,
  goTab,
  launch,
  install,
  uninstall,
  sync,
  resume: () => api.minimize(),
  rerender: () => show({ keepFocus: true }),
  // Teclado na tela. Ao fechar, a seleção volta para onde estava.
  keyboard: (opts) => {
    const back = focus.key;
    vkb.open({ ...opts, restore: () => focus.setScope(menu.isOpen() ? $('overlay') : $('view'), back, { scroll: false }) });
  },
  // Para telas que ganham itens depois de abrir (dados que chegam depois): coloca a seleção de volta.
  refocus: (key) => { if (!menu.isOpen()) focus.setScope($('view'), key || focus.key, { scroll: false }); },
  reloadLibrary: async () => { await loadLibrary(await api.getLibrary()); show({ keepFocus: true }); },
  applyConfig,
  hints: (list) => hintEls(list),
};

async function show({ keepFocus = false } = {}) {
  const top = stack[stack.length - 1];
  const token = ++renderToken;
  const prevKey = keepFocus ? focus.key : top.focusKey;
  if (current && current.view.destroy) current.view.destroy();
  const view = await VIEWS[top.id].render(ctx, top.params);
  if (token !== renderToken) return;
  current = { ...top, view };
  const root = $('view');
  // Ao redesenhar a mesma tela (volume, sincronização), as listas mantêm a rolagem em vez de voltar ao topo.
  const scrolls = keepFocus ? [...root.querySelectorAll(SCROLLERS)].map((el) => [el.scrollTop, el.scrollLeft]) : [];
  root.replaceChildren(view.el);
  root.querySelectorAll(SCROLLERS).forEach((el, i) => {
    if (!scrolls[i]) return;
    el.style.scrollBehavior = 'auto';
    [el.scrollTop, el.scrollLeft] = scrolls[i];
    el.style.scrollBehavior = '';
  });
  if (!keepFocus) {
    view.el.classList.add('view-enter');
  }
  if (!view.keepBackground) setBackground(null);
  focus.setScope(root, prevKey, { scroll: !keepFocus });
  renderTopbar();
  renderHints();
}

// Abas por onde a pessoa passou. O B volta por elas, uma de cada vez, até a primeira; depois disso vai para a tela de perfil.
const HISTORY_MAX = 40;
const tabHistory = []; // [{ id, focusKey }]

function back() {
  if (stack.length > 1) {
    stack.pop();
    sfx.back();
    show();
    return true;
  }
  const prev = tabHistory.pop();
  if (prev) {
    stack.length = 0;
    stack.push({ id: prev.id, params: {}, focusKey: prev.focusKey });
    sfx.back();
    show();
    return true;
  }
  sfx.back();
  openBoot();
  return true;
}

function goTab(id) {
  if (stack.length === 1 && stack[0].id === id) return;
  if (stack[0]) {
    tabHistory.push({ id: stack[0].id, focusKey: stack.length === 1 ? focus.key : stack[0].focusKey });
    if (tabHistory.length > HISTORY_MAX) tabHistory.shift();
  }
  stack.length = 0;
  stack.push({ id, params: {} });
  sfx.tab();
  show();
}

function cycleTab(delta) {
  const i = TABS.indexOf(stack[0].id);
  goTab(TABS[(i + delta + TABS.length) % TABS.length]);
}

// ===== jogos e dados =====

async function launch(g) {
  // Jogo da Steam que não está neste PC: Jogar vira Instalar.
  if (g.source === 'steam' && g.installed === false) return g.download ? api.openDownloads() : install(g);
  sfx.confirm();
  toast(`Abrindo ${g.title}…`);
  const r = await api.launch(g);
  if (r && r.error) toast(r.error, { error: true });
}

async function install(g) {
  sfx.confirm();
  toast(`Confirme a instalação de ${g.title} na janela da Steam. O Cartucho volta sozinho quando o download começar.`);
  const r = await api.installGame(g.appid);
  if (r && r.error) toast(r.error, { error: true });
}

async function uninstall(g) {
  sfx.back();
  toast(`Confirme na janela da Steam para desinstalar ${g.title}.`);
  const r = await api.uninstallGame(g.appid);
  if (r && r.error) toast(r.error, { error: true });
}

// ===== downloads da Steam =====

function mergeDownloads() {
  const byKey = new Map(state.downloads.map((d) => [d.key, d]));
  for (const g of state.games) if (g.source === 'steam') g.download = byKey.get(g.key) || null;
}

// A barra anda sem redesenhar a tela: só a largura e o texto de cada [data-dl] mudam.
function onDownloads(list) {
  const before = state.downloads.map((d) => d.key).join();
  state.downloads = list || [];
  mergeDownloads();
  if (state.downloads.map((d) => d.key).join() !== before) return refreshLive();
  for (const d of state.downloads) {
    document.querySelectorAll(`[data-dl="${d.key}"]`).forEach((el) => {
      const bar = el.querySelector('.bar i');
      if (bar) bar.style.width = `${d.percent}%`;
      const txt = el.querySelector('.dl-pct');
      if (txt) txt.textContent = downloadText(d);
      el.classList.toggle('paused', d.state !== 'downloading');
    });
  }
}

async function loadLibrary(lib) {
  state.games = lib.games || [];
  mergeDownloads();
  state.profile = lib.profile;
  state.steamConfigured = lib.steamConfigured;
  state.syncedAt = lib.syncedAt;
}

async function sync({ force = false, quiet = true } = {}) {
  const lib = await api.sync({ force });
  await loadLibrary(lib);
  if (lib.error) toast(lib.error, { error: true });
  else if (!quiet) toast('Biblioteca sincronizada.');
  refreshLive();
}

// Atualiza a tela atual com dados novos, sem perder a seleção. A tela de configurações não, para não atrapalhar quem está digitando.
function refreshLive() {
  if (!current || menu.isOpen() || current.id === 'settings') return;
  show({ keepFocus: true });
}

async function applyConfig(cfg) {
  state.config = cfg;
  applyTheme(cfg);
  configureSound({ sounds: cfg.sounds, music: cfg.music, volume: cfg.volume, musicFile: cfg.musicFile });
}

// ===== ações do controle =====

function handleAction(action, info = {}) {
  if (action === 'fullscreen') return api.toggleFullscreen();
  if (bootHandler) return bootHandler(action);
  if (vkb.isOpen()) return vkb.handle(action);
  if (menu.isOpen()) return menu.handle(action);

  if (current && current.view.onAction && current.view.onAction(action, { ...info, focused: focus.current })) return;

  switch (action) {
    case 'up': case 'down': case 'left': case 'right':
      if (focus.move(action)) sfx.move();
      break;
    case 'confirm':
      if (focus.current) focus.current.click();
      break;
    case 'back':
      back();
      break;
    case 'lb': cycleTab(-1); break;
    case 'rb': cycleTab(1); break;
    case 'menu': openMenu(); break;
  }
}

// ===== analógico direito: rola a lista em que o foco está =====

const SCROLL_SPEED = 1600; // px por segundo com o analógico no máximo
let scrollSettle = null;

function canScroll(el, axis) {
  const style = getComputedStyle(el);
  const overflow = axis === 'y' ? style.overflowY : style.overflowX;
  if (overflow !== 'auto' && overflow !== 'scroll') return false;
  return axis === 'y' ? el.scrollHeight > el.clientHeight + 1 : el.scrollWidth > el.clientWidth + 1;
}

function scrollerFor(axis) {
  const root = menu.isOpen() ? $('overlay') : $('view');
  for (let el = focus.current; el && el !== root.parentElement; el = el.parentElement) {
    if (root.contains(el) && canScroll(el, axis)) return el;
  }
  // Sem foco numa lista: rola a maior que existir na tela.
  let best = null;
  for (const el of root.querySelectorAll('*')) {
    if (canScroll(el, axis) && (!best || el.clientHeight * el.clientWidth > best.clientHeight * best.clientWidth)) best = el;
  }
  return best;
}

function handleScroll(x, y, dt) {
  if (bootHandler || vkb.isOpen()) return;
  const axis = Math.abs(y) >= Math.abs(x) ? 'y' : 'x';
  const v = axis === 'y' ? y : x;
  const el = scrollerFor(axis);
  if (!el) return;
  const delta = Math.sign(v) * v * v * SCROLL_SPEED * dt;
  el.style.scrollBehavior = 'auto';
  if (axis === 'y') el.scrollTop += delta;
  else el.scrollLeft += delta;
  el.style.scrollBehavior = '';
  // Quando o analógico para, o foco vai para o item visível mais perto, para o direcional continuar dali.
  clearTimeout(scrollSettle);
  scrollSettle = setTimeout(() => refocusVisible(el), 180);
}

function refocusVisible(scroller) {
  const view = scroller.getBoundingClientRect();
  const inView = (r) => r.top >= view.top - 1 && r.bottom <= view.bottom + 1 && r.left >= view.left - 1 && r.right <= view.right + 1;
  if (focus.current && scroller.contains(focus.current) && inView(focus.current.getBoundingClientRect())) return;
  const items = [...scroller.querySelectorAll('[data-focus]')].filter((el) => el.offsetParent !== null && !el.disabled);
  const from = focus.current ? focus.current.getBoundingClientRect() : view;
  let best = null;
  let bestDist = Infinity;
  for (const el of items) {
    const r = el.getBoundingClientRect();
    if (!inView(r)) continue;
    const d = Math.abs(r.top - from.top) + Math.abs(r.left - from.left);
    if (d < bestDist) { bestDist = d; best = el; }
  }
  if (best) focus.set(best, { scroll: false });
}

function openMenu() {
  focusBeforeMenu = focus.key;
  sfx.tab();
  menu.open();
}

// Com o mouse, o primeiro clique numa capa só seleciona; o segundo abre. Assim dá para ver o jogo antes.
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-focus]');
  if (!el || !e.isTrusted) return;
  if (el.hasAttribute('data-select-first') && !el.classList.contains('focused')) {
    e.stopPropagation();
    e.preventDefault();
    focus.set(el, { scroll: false });
    sfx.move();
    return;
  }
  if (!el.classList.contains('focused')) focus.set(el, { scroll: false });
}, true);

let bootHandler = null;

// Tela de perfil (abertura). Aparece ao ligar e quando o B não tem mais para onde voltar. A entra de novo pelo Início.
function openBoot({ first = false } = {}) {
  if (bootHandler) return;
  if (!first) {
    tabHistory.length = 0;
    stack.length = 0;
    stack.push({ id: 'home', params: {} });
  }
  bootHandler = showBoot({ state, sfx, first, onDone: enterFromBoot });
}

async function enterFromBoot() {
  bootHandler = null;
  $('topbar').hidden = false;
  await show();
}

async function start() {
  const cfg = await api.getConfig();
  await applyConfig(cfg);
  state.running = cfg.running;
  await loadLibrary(await api.getLibrary());

  menu = createMenu({
    ctx,
    focus,
    root: $('overlay'),
    onClose: (how) => {
      focus.setScope($('view'), focusBeforeMenu, { scroll: false });
      if (!menuOverApp) return;
      menuOverApp = false;
      // Fechar o menu volta para o que estava na frente (o jogo). Escolher uma tela fica no Cartucho.
      if (how === 'dismiss') api.minimize();
      else api.releaseTop();
    },
  });

  const input = createInput({
    onAction: handleAction,
    onScroll: handleScroll,
    onDevice: (d) => { state.device = d; renderDevice(); },
    nativeGuide: api.platform === 'win32',
  });
  renderDevice();
  tickClock();
  setInterval(tickClock, 10000);

  api.on('library:changed', async () => { await loadLibrary(await api.getLibrary()); refreshLive(); });
  api.on('achievements:changed', () => refreshLive());
  api.on('achievements:unlocked', notifyAchievements);
  const onUpdate = (status) => {
    const wasReady = state.update && state.update.state === 'ready';
    state.update = status;
    if (status.state === 'ready' && !wasReady) toast(`Versão ${status.version} baixada. Ela é instalada quando você fechar o Cartucho, ou agora pelo menu.`);
    // A linha de atualização em Configurações acompanha o estado (procurando, baixando, erro…).
    const typing = document.activeElement instanceof HTMLInputElement;
    if (current && current.id === 'settings' && !menu.isOpen() && !typing) show({ keepFocus: true });
  };
  api.on('update:status', onUpdate);
  api.on('steam:downloads', onDownloads);
  api.on('steam:install-started', ({ appid }) => {
    const g = state.games.find((x) => x.appid === appid);
    toast(g ? `${g.title} está baixando. Dá para acompanhar na tela inicial.` : 'O download começou.');
  });
  api.steamDownloads().then(onDownloads).catch(() => {});
  api.updateStatus().then(onUpdate).catch(() => {});
  // Item escolhido no menu que abriu por cima do jogo: a janela principal vem para a frente e vai para a tela pedida.
  api.on('menu:navigate', (target) => {
    if (menu.isOpen()) menu.close('navigate');
    if (target.tab) goTab(target.tab);
    if (target.sync) sync({ force: true, quiet: false });
  });
  api.on('game:started', (r) => { state.running = r; });
  api.on('game:ended', () => { state.running = null; });
  api.on('window:blur', () => setMusicPaused(true));
  api.on('window:focus', () => setMusicPaused(false));
  api.on('input:guide', ({ fromBackground }) => {
    input.setDevice('gamepad');
    if (bootHandler) return bootHandler('confirm');
    if (fromBackground) {
      menuOverApp = true;
      if (!menu.isOpen()) openMenu();
    } else if (menu.isOpen()) {
      menu.handle('menu');
    } else {
      openMenu();
    }
  });

  stack.push({ id: 'home', params: {} });
  if (cfg.showBoot) {
    openBoot({ first: true });
  } else {
    await enterFromBoot();
  }
  sync({ quiet: true }).catch(() => {});
  if (isDemo) {
    document.title = 'Cartucho (demonstração)';
    window.demoNotice = notifyAchievements;
  }
}

start();
