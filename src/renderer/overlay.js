// Janela do menu por cima do jogo. Só mostra o menu lateral; o jogo continua visível atrás.
import { api } from './lib/api.js';
import { createInput } from './lib/input.js';
import { createFocus } from './lib/focus.js';
import { sfx, configureSound } from './lib/sound.js';
import { createMenu } from './views/menu.js';
import { applyTheme } from './lib/themes.js';

const state = { games: [], profile: null, running: null, device: 'gamepad', capture: null };
const focus = createFocus();
const root = document.getElementById('overlay');

// Fechar o menu volta para o jogo. Escolher uma tela leva para a janela principal do Cartucho.
const navigate = (target) => api.overlayNavigate(target);
const ctx = {
  overlay: true,
  state,
  api,
  sfx,
  goTab: (tab) => navigate({ tab }),
  openProfile: () => navigate({ profile: true }),
  sync: () => navigate({ sync: true }),
  resume: () => api.overlayClose(),
};

const menu = createMenu({ ctx, focus, root, onClose: (how) => { if (how === 'dismiss') api.overlayClose(); } });

createInput({
  onAction: (action) => {
    if (menu.isOpen()) menu.handle(action);
  },
  onDevice: (d) => { state.device = d; },
  nativeGuide: api.platform === 'win32',
});

api.on('overlay:open', async ({ running }) => {
  const [cfg, lib, cap] = await Promise.all([api.getConfig(), api.getLibrary(), api.captureStatus()]);
  state.capture = cap;
  applyTheme(cfg);
  // Sem música aqui: o som do jogo continua tocando.
  configureSound({ sounds: cfg.sounds, music: false, volume: cfg.volume });
  state.games = lib.games || [];
  state.profile = lib.profile;
  state.running = running;
  if (menu.isOpen()) menu.close('navigate');
  menu.open();
  sfx.tab();
});

api.on('capture:status', (s) => { state.capture = s; });

api.on('input:guide', () => {
  if (menu.isOpen()) menu.handle('menu');
});
