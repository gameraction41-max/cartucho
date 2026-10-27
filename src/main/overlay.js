// Menu rápido por cima do jogo. É uma janela transparente separada, só com o menu lateral,
// então o jogo continua aparecendo atrás em vez de o Cartucho inteiro cobrir a tela.
const path = require('node:path');
const { BrowserWindow, screen } = require('electron');
const { forceForeground, focusHandle, currentForeground } = require('./foreground');

let win = null;
let gameHwnd = null;

function create() {
  win = new BrowserWindow({
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    skipTaskbar: true,
    title: 'Cartucho',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: true,
    },
  });
  win.setAlwaysOnTop(true, 'screen-saver');
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.on('closed', () => { win = null; });
  win.loadFile(path.join(__dirname, '..', 'renderer', 'overlay.html'));
  return new Promise((resolve) => win.webContents.once('did-finish-load', resolve));
}

// Prepara a janela logo ao abrir o app, para o menu aparecer na hora quando o botão for apertado.
function prepare() {
  if (!win) create();
}

function isOpen() {
  return !!win && win.isVisible();
}

async function open(payload) {
  if (!win) await create();
  else if (win.webContents.isLoading()) await new Promise((r) => win.webContents.once('did-finish-load', r));
  gameHwnd = currentForeground();
  // Cobre a tela onde o jogo está (a do cursor, na prática), inteira.
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  win.setBounds(display.bounds);
  win.webContents.send('overlay:open', payload);
  win.showInactive();
  win.setAlwaysOnTop(true, 'screen-saver');
  forceForeground(win);
  win.focus();
}

// backToGame: devolve o foco para o jogo. Quando a pessoa escolheu ir para o Cartucho, quem chama traz a janela principal.
function close({ backToGame = true } = {}) {
  if (!isOpen()) return;
  win.hide();
  if (backToGame) focusHandle(gameHwnd, { restore: false });
  gameHwnd = null;
}

function send(channel, payload) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}

module.exports = { prepare, open, close, isOpen, send };
