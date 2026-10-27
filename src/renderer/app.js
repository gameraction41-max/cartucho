// Interface do Cartucho: guarda o estado, troca de tela e distribui as ações do controle.
import { api, isDemo } from './lib/api.js';
import { createInput } from './lib/input.js';
import { createFocus } from './lib/focus.js';
import { sfx, configureSound, setMusicPaused } from './lib/sound.js';
import { h, hue, loadFirst } from './lib/ui.js';
import home from './views/home.js';
import game from './views/game.js';
import achievements from './views/achievements.js';
import minecraft from './views/minecraft.js';
import library from './views/library.js';
import settings from './views/settings.js';
import { showBoot } from './views/boot.js';
import { createMenu } from './views/menu.js';

const VIEWS = { home, game, achievements, minecraft, library, settings };
const TABS = ['home', 'minecraft', 'achievements', 'library', 'settings'];

const GLYPHS = {
  gamepad: { confirm: ['A', 'a'], back: ['B', 'b'], x: ['X', 'x'], y: ['Y', 'y'], lb: ['LB', ''], rb: ['RB', ''], menu: ['☰', ''] },
  keyboard: { confirm: ['Enter', 'key'], back: ['Esc', 'key'], x: ['F', 'key'], y: ['I', 'key'], lb: ['Q', 'key'], rb: ['E', 'key'], menu: ['M', 'key'] },
};
const ICONS = {
  gamepad: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 9h4M8 7v4M15 10h.01M18 8h.01"/><path d="M7 4h10a5 5 0 0 1 5 5v4a4 4 0 0 1-7 2.6L14 14h-4l-1 1.6A4 4 0 0 1 2 13V9a5 5 0 0 1 5-5z"/></svg>',
  keyboard: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M6 9h.01M10 9h.01M14 9h.01M18 9h.01M6 13h.01M18 13h.01M9 15.5h6"/></svg>',
  mouse: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="6" y="3" width="12" height="18" rx="6"/><path d="M12 7v4"/></svg>',
};
const DEVICE_NAME = { gamepad: 'Controle', keyboard: 'Teclado', mouse: 'Mouse' };

const state = { config: {}, games: [], profile: null, steamConfigured: false, syncedAt: 0, running: null, device: 'keyboard' };
const stack = []; // [{ id, params }]
let current = null; // { id, params, view: resultado do render }
let menu = null;
let focusBeforeMenu = null;
let renderToken = 0;

const $ = (id) => document.getElementById(id);
const focus = createFocus();

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

function renderHints() {
  const hints = (current && current.view.hints) || [];
  const glyphs = GLYPHS[glyphSet()];
  $('hints').replaceChildren(...hints.map(([action, label]) => {
    const [text, cls] = glyphs[action];
    return h('span', {}, h('i', { class: `k ${cls}` }, text), label);
  }));
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
async function setBackground(g) {
  const key = g ? g.key : null;
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
  sync,
  rerender: () => show({ keepFocus: true }),
  applyConfig,
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
  root.replaceChildren(view.el);
  if (!keepFocus) {
    view.el.classList.add('view-enter');
  }
  if (!view.keepBackground) setBackground(null);
  focus.setScope(root, prevKey);
  renderTopbar();
  renderHints();
}

function back() {
  if (stack.length <= 1) return false;
  stack.pop();
  sfx.back();
  show();
  return true;
}

function goTab(id) {
  if (stack.length === 1 && stack[0].id === id) return;
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
  sfx.confirm();
  toast(`Abrindo ${g.title}…`);
  const r = await api.launch(g);
  if (r && r.error) toast(r.error, { error: true });
}

async function loadLibrary(lib) {
  state.games = lib.games || [];
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
  configureSound({ sounds: cfg.sounds, music: cfg.music, volume: cfg.volume, musicFile: cfg.musicFile });
}

// ===== ações do controle =====

function handleAction(action, info = {}) {
  if (action === 'fullscreen') return api.toggleFullscreen();
  if (bootHandler) return bootHandler(action);
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
      if (!back() && state.device !== 'gamepad') openMenu();
      break;
    case 'lb': cycleTab(-1); break;
    case 'rb': cycleTab(1); break;
    case 'menu': openMenu(); break;
  }
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

async function start() {
  const cfg = await api.getConfig();
  await applyConfig(cfg);
  state.running = cfg.running;
  await loadLibrary(await api.getLibrary());

  menu = createMenu({ ctx, focus, root: $('overlay'), onClose: () => focus.setScope($('view'), focusBeforeMenu) });

  createInput({
    onAction: handleAction,
    onDevice: (d) => { state.device = d; renderDevice(); },
  });
  renderDevice();
  tickClock();
  setInterval(tickClock, 10000);

  api.on('library:changed', async () => { await loadLibrary(await api.getLibrary()); refreshLive(); });
  api.on('achievements:changed', () => refreshLive());
  api.on('game:started', (r) => { state.running = r; });
  api.on('game:ended', () => { state.running = null; });
  api.on('window:blur', () => setMusicPaused(true));
  api.on('window:focus', () => setMusicPaused(false));

  stack.push({ id: 'home', params: {} });
  const enter = async () => {
    bootHandler = null;
    $('topbar').hidden = false;
    await show();
  };
  if (cfg.showBoot) {
    bootHandler = showBoot({ state, sfx, onDone: enter });
  } else {
    await enter();
  }
  sync({ quiet: true }).catch(() => {});
  if (isDemo) document.title = 'Cartucho (demonstração)';
}

start();
