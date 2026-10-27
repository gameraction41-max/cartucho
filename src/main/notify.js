// Avisos pequenos no canto da tela durante o jogo ("Print salvo", "● Gravando"). A janela não pega o foco, deixa o
// mouse passar e fica fora das próprias capturas (setContentProtection), então não aparece nos prints nem nos vídeos.
const path = require('node:path');
const { BrowserWindow, screen } = require('electron');

const WIDTH = 420;
const HEIGHT = 170;
let win = null;
let ready = null;
let hideTimer = null;
let recording = null;

function ensure() {
  if (win && !win.isDestroyed()) return ready;
  win = new BrowserWindow({
    width: WIDTH,
    height: HEIGHT,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    resizable: false,
    movable: false,
    focusable: false,
    skipTaskbar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true, backgroundThrottling: false },
  });
  win.setIgnoreMouseEvents(true);
  win.setContentProtection(true);
  win.setAlwaysOnTop(true, 'screen-saver');
  win.on('closed', () => { win = null; });
  win.loadFile(path.join(__dirname, '..', 'renderer', 'notify.html'));
  ready = new Promise((resolve) => win.webContents.once('did-finish-load', resolve));
  return ready;
}

function place() {
  const { workArea } = screen.getPrimaryDisplay();
  win.setBounds({ x: workArea.x + workArea.width - WIDTH - 16, y: workArea.y + 16, width: WIDTH, height: HEIGHT });
}

async function render(toast) {
  await ensure();
  if (!win) return;
  place();
  win.webContents.send('notify:show', { toast, recording });
  if (!win.isVisible()) win.showInactive();
  win.setAlwaysOnTop(true, 'screen-saver');
  clearTimeout(hideTimer);
  if (!recording) hideTimer = setTimeout(() => { if (win && !recording) win.hide(); }, toast ? 3200 : 0);
}

function show(toast) {
  render(toast).catch(() => {});
}

function setRecording(since) {
  if ((since || null) === recording) return;
  recording = since || null;
  render(null).catch(() => {});
}

module.exports = { show, setRecording };
