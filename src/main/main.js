// Processo principal do Cartucho: janela em tela cheia, acesso a arquivos e abertura dos jogos.
const path = require('node:path');
const fs = require('node:fs');
const { spawn } = require('node:child_process');
const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const config = require('./config');
const library = require('./library');
const prism = require('./prism');
const watch = require('./watch');
const system = require('./system');

const windowed = process.argv.includes('--windowed');
let win = null;
let running = null;

// Música e sons tocam sem precisar de um clique antes, como num console.
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', bringToFront);
  app.whenReady().then(() => {
    registerIpc();
    createWindow();
  });
  app.on('window-all-closed', () => app.quit());
}

function createWindow() {
  win = new BrowserWindow({
    width: 1600,
    height: 900,
    fullscreen: !windowed,
    autoHideMenuBar: true,
    backgroundColor: '#0b0d14',
    show: false,
    title: 'Cartucho',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: true,
    },
  });
  win.removeMenu();
  win.once('ready-to-show', () => win.show());
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.on('focus', () => send('window:focus'));
  win.on('blur', () => send('window:blur'));
  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
}

function send(channel, payload) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}

// O Windows não deixa um app roubar o foco à toa; o truque do "sempre no topo" por um instante resolve.
function bringToFront() {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.setAlwaysOnTop(true);
  win.focus();
  win.setAlwaysOnTop(false);
}

function gameEnded(game) {
  running = null;
  send('game:ended', { key: game.key });
  send('library:changed');
  if (config.get('returnAfterGame')) bringToFront();
}

async function launchGame(game) {
  if (game.source === 'steam') {
    await shell.openExternal(`steam://rungameid/${game.appid}`);
    watch.watchSteam(game.appid, {
      onEnd: async () => {
        await library.refreshSteamGame(game.appid);
        gameEnded(game);
      },
    });
  } else if (game.source === 'prism') {
    const exe = prism.findExe(library.prismDir(), config.get('prismExe'));
    if (!exe) return { error: 'Não encontrei o Prism Launcher. Indique o executável em Configurações.' };
    prism.launchInstance(exe, game.instanceId);
    watch.watchJava({ onEnd: () => gameEnded(game) });
  } else if (game.source === 'hytale') {
    const exe = config.get('hytaleExe');
    if (!exe || !fs.existsSync(exe)) return { error: 'Não encontrei o Hytale. Indique o executável em Configurações.' };
    spawn(exe, [], { cwd: path.dirname(exe), detached: true, stdio: 'ignore' }).unref();
    // O executável pode ser o launcher do Hytale, que abre o jogo em outro processo. Por isso olhamos os dois nomes.
    const names = [config.get('hytaleProcess'), path.basename(exe), 'HytaleClient.exe'];
    watch.watchProcesses(names, {
      onEnd: (ms) => {
        library.addHytaleTime(ms);
        gameEnded(game);
      },
    });
  } else {
    return { error: 'Tipo de jogo desconhecido.' };
  }
  running = { key: game.key, title: game.title, since: Date.now() };
  send('game:started', running);
  return { ok: true };
}

function openInSource(game) {
  if (game.source === 'steam') return shell.openExternal(`steam://nav/games/details/${game.appid}`);
  if (game.source === 'prism') {
    const exe = prism.findExe(library.prismDir(), config.get('prismExe'));
    if (exe) prism.launch(exe, game.instanceId ? ['--show', game.instanceId] : []);
    return;
  }
  if (game.source === 'hytale' && config.get('hytaleExe')) shell.showItemInFolder(config.get('hytaleExe'));
}

function registerIpc() {
  ipcMain.handle('config:get', () => ({ ...config.getPublic(), defaultPrismDir: prism.defaultPrismDir(), running }));
  ipcMain.handle('config:set', (_e, patch) => config.update(patch || {}));
  ipcMain.handle('library:get', () => library.getLibrary());
  ipcMain.handle('library:sync', async (_e, opts = {}) => {
    try {
      const lib = await library.syncSteam();
      library.syncAchievements(opts).then(() => send('achievements:changed')).catch(() => {});
      return lib;
    } catch (err) {
      return { ...library.getLibrary(), error: err.message };
    }
  });
  ipcMain.handle('achievements:summary', () => library.achievementSummary());
  ipcMain.handle('achievements:game', (_e, appid) => library.gameAchievements(appid));
  ipcMain.handle('game:launch', (_e, game) => launchGame(game));
  ipcMain.handle('game:open-source', (_e, game) => openInSource(game));
  ipcMain.handle('dialog:file', async (_e, opts = {}) => {
    const r = await dialog.showOpenDialog(win, { properties: ['openFile'], filters: opts.filters, defaultPath: opts.defaultPath });
    return r.canceled ? null : r.filePaths[0];
  });
  ipcMain.handle('dialog:folder', async (_e, opts = {}) => {
    const r = await dialog.showOpenDialog(win, { properties: ['openDirectory'], defaultPath: opts.defaultPath });
    return r.canceled ? null : r.filePaths[0];
  });
  ipcMain.handle('system:power', (_e, action) => {
    if (action === 'quit') return app.quit();
    return system.power(action);
  });
  ipcMain.handle('window:minimize', () => win && win.minimize());
  ipcMain.handle('window:fullscreen', () => win && win.setFullScreen(!win.isFullScreen()));
}
