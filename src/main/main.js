// Processo principal do Cartucho: janela em tela cheia, acesso a arquivos e abertura dos jogos.
const path = require('node:path');
const fs = require('node:fs');
const { spawn } = require('node:child_process');
const { app, BrowserWindow, ipcMain, shell, dialog, clipboard } = require('electron');
const config = require('./config');
const library = require('./library');
const prism = require('./prism');
const watch = require('./watch');
const system = require('./system');
const art = require('./art');
const mcoptions = require('./mcoptions');
const { watchGuideButton } = require('./guide');
const { forceForeground } = require('./foreground');
const overlay = require('./overlay');
const updater = require('./updater');
const downloads = require('./downloads');
const gamepresets = require('./gamepresets');

const windowed = process.argv.includes('--windowed');
let win = null;
let running = null;
let recommended = null; // preset gráfico que combina com o hardware, calculado uma vez

// Música e sons tocam sem precisar de um clique antes, como num console.
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', bringToFront);
  app.whenReady().then(() => {
    registerIpc();
    gamepresets.setBackupDir(() => path.join(app.getPath('userData'), 'backups'));
    createWindow();
    overlay.prepare();
    watchGuideButton(onGuide);
    updater.watchUpdates((status) => send('update:status', status));
    downloads.start({
      names: library.steamNames,
      onDownloads: (list) => send('steam:downloads', list),
      onInstalledChange: () => send('library:changed'),
      // A janela de instalação é da Steam. Quando o download começa, o Cartucho volta para a frente.
      onStarted: (appid) => {
        bringToFront();
        send('steam:install-started', { appid });
      },
    });
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

// O Windows não deixa um app roubar o foco à toa. Primeiro tenta o jeito nativo (foreground.js);
// o "sempre no topo" por um instante cobre o caso em que ele não está disponível.
function bringToFront() {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.show();
  forceForeground(win);
  win.setAlwaysOnTop(true);
  win.focus();
  win.setAlwaysOnTop(false);
}

// Botão do Xbox com outro app ou jogo na frente: o Cartucho fica por cima de tudo até o menu fechar,
// senão o jogo (principalmente em tela cheia sem bordas) continua cobrindo a janela.
let overApp = false;

function showOverApp() {
  overApp = true;
  if (win.isMinimized()) win.restore();
  win.setAlwaysOnTop(true, 'screen-saver');
  win.show();
  forceForeground(win);
  win.focus();
}

function releaseTop() {
  if (!overApp) return;
  overApp = false;
  win.setAlwaysOnTop(false);
}

// Botão do Xbox: com o Cartucho na frente, abre ou fecha o menu rápido. Com um jogo aberto na frente,
// abre só o menu lateral por cima dele (overlay.js). Com outro programa na frente, traz o Cartucho já com o menu aberto.
function onGuide() {
  if (!win || win.isDestroyed()) return;
  if (overlay.isOpen()) return overlay.send('input:guide');
  if (running && !win.isFocused()) return overlay.open({ running });
  const fromBackground = !win.isFocused();
  if (fromBackground) showOverApp();
  send('input:guide', { fromBackground });
}

function gameEnded(game) {
  running = null;
  overlay.close({ backToGame: false });
  send('game:ended', { key: game.key });
  send('library:changed');
  if (config.get('returnAfterGame')) bringToFront();
}

// Conquistas novas aparecem como aviso na tela do Cartucho. Com um jogo aberto, a própria Steam já avisa por cima dele.
function notifyUnlocks(list) {
  if (list && list.length) send('achievements:unlocked', list);
}

function instanceDir(instanceId) {
  const inst = prism.listInstances(library.prismDir()).find((i) => i.id === instanceId);
  return inst ? inst.dir : null;
}

async function launchGame(game) {
  if (game.source === 'steam') {
    await shell.openExternal(`steam://rungameid/${game.appid}`);
    watch.watchSteam(game.appid, {
      onEnd: async () => {
        const unlocked = await library.refreshSteamGame(game.appid);
        gameEnded(game);
        notifyUnlocks(unlocked);
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
      library.syncAchievements({ ...opts, onProgress: () => send('achievements:changed') }).then((unlocked) => {
        send('achievements:changed');
        notifyUnlocks(unlocked);
      }).catch(() => {});
      return lib;
    } catch (err) {
      return { ...library.getLibrary(), error: err.message };
    }
  });
  ipcMain.handle('achievements:summary', () => library.achievementSummary());
  ipcMain.handle('achievements:game', (_e, appid) => library.gameAchievements(appid));
  ipcMain.handle('game:launch', (_e, game) => launchGame(game));
  ipcMain.handle('game:open-source', (_e, game) => openInSource(game));
  ipcMain.handle('art:pick', async (_e, key, kind) => {
    if (!art.EXT[kind]) return { error: 'Tipo de arquivo desconhecido.' };
    const name = kind === 'music' ? 'Músicas' : 'Imagens';
    const r = await dialog.showOpenDialog(win, { properties: ['openFile'], filters: [{ name, extensions: art.EXT[kind].map((e) => e.slice(1)) }] });
    if (r.canceled) return { canceled: true };
    try {
      art.set(key, kind, r.filePaths[0]);
      return { ok: true };
    } catch (err) {
      return { error: err.message };
    }
  });
  ipcMain.handle('art:reset', (_e, key, kind) => art.reset(key, kind));
  ipcMain.handle('prism:presets', () => mcoptions.PRESET_LIST);
  ipcMain.handle('prism:preset-get', (_e, instanceId) => {
    const dir = instanceDir(instanceId);
    return dir ? mcoptions.readPreset(dir) : null;
  });
  ipcMain.handle('prism:preset-set', (_e, instanceId, presetId) => {
    const dir = instanceDir(instanceId);
    if (!dir) return { error: 'Não encontrei a pasta desta instância.' };
    if (running && running.key === `prism:${instanceId}`) return { error: 'Feche o jogo antes de trocar o preset. O Minecraft regrava o options.txt ao sair.' };
    try {
      return { ok: true, preset: mcoptions.writePreset(dir, presetId) };
    } catch (err) {
      return { error: err.message };
    }
  });
  ipcMain.handle('system:stats', () => system.stats());
  ipcMain.handle('system:recommended-preset', async () => {
    if (!recommended) recommended = system.stats().then(system.recommendPreset).catch(() => null);
    return recommended;
  });
  // Aplica o mesmo preset em todas as instâncias do Minecraft, menos a que estiver aberta.
  ipcMain.handle('prism:preset-all', (_e, presetId) => {
    let applied = 0;
    let skipped = 0;
    for (const inst of prism.listInstances(library.prismDir())) {
      if (running && running.key === `prism:${inst.id}`) { skipped++; continue; }
      try {
        mcoptions.writePreset(inst.dir, presetId);
        applied++;
      } catch {
        skipped++;
      }
    }
    return { applied, skipped };
  });
  ipcMain.handle('friends:get', () => library.friends());
  ipcMain.handle('history:week', () => library.playWeek());
  // Presets dos jogos da Steam: com o jogo aberto não dá, porque ele regrava o arquivo ao fechar.
  const steamPreset = (fn, { changes = true } = {}) => (_e, appid, ...rest) => {
    if (!Number.isInteger(appid)) return { error: 'Jogo inválido.' };
    if (changes && running && running.key === `steam:${appid}`) return { error: 'Feche o jogo antes de trocar o preset. Ele regrava as opções ao sair.' };
    try {
      return fn(appid, ...rest) ?? { ok: true };
    } catch (err) {
      return { error: err.message };
    }
  };
  ipcMain.handle('steam:preset-get', steamPreset(gamepresets.read, { changes: false }));
  ipcMain.handle('steam:preset-set', steamPreset(gamepresets.write));
  ipcMain.handle('steam:preset-restore', steamPreset(gamepresets.restore));
  ipcMain.handle('steam:downloads', () => downloads.list(library.steamNames()));
  ipcMain.handle('steam:install', async (_e, appid) => {
    if (!Number.isInteger(appid) || appid <= 0) return { error: 'Jogo inválido.' };
    downloads.expectInstall(appid);
    await shell.openExternal(`steam://install/${appid}`);
    downloads.poke();
    return { ok: true };
  });
  ipcMain.handle('steam:uninstall', async (_e, appid) => {
    if (!Number.isInteger(appid) || appid <= 0) return { error: 'Jogo inválido.' };
    await shell.openExternal(`steam://uninstall/${appid}`);
    return { ok: true };
  });
  ipcMain.handle('steam:open-downloads', () => shell.openExternal('steam://open/downloads'));
  ipcMain.handle('steam:profile', (_e, steamId) => /^\d{17}$/.test(String(steamId)) && shell.openExternal(`steam://url/SteamIDPage/${steamId}`));
  ipcMain.handle('update:status', () => updater.getStatus());
  ipcMain.handle('update:install', () => updater.installNow());
  ipcMain.handle('update:check', () => updater.checkNow());
  ipcMain.handle('overlay:close', () => overlay.close());
  ipcMain.handle('overlay:navigate', (_e, target) => {
    overlay.close({ backToGame: false });
    bringToFront();
    send('menu:navigate', target || {});
  });
  ipcMain.handle('dialog:file', async (_e, opts = {}) => {
    const r = await dialog.showOpenDialog(win, { properties: ['openFile'], filters: opts.filters, defaultPath: opts.defaultPath });
    return r.canceled ? null : r.filePaths[0];
  });
  ipcMain.handle('dialog:folder', async (_e, opts = {}) => {
    const r = await dialog.showOpenDialog(win, { properties: ['openDirectory'], defaultPath: opts.defaultPath });
    return r.canceled ? null : r.filePaths[0];
  });
  ipcMain.handle('clipboard:read', () => clipboard.readText().slice(0, 500));
  ipcMain.handle('system:power', (_e, action) => {
    if (action === 'quit') return app.quit();
    return system.power(action);
  });
  ipcMain.handle('window:minimize', () => {
    if (!win) return;
    releaseTop();
    win.minimize();
  });
  ipcMain.handle('window:release-top', () => win && releaseTop());
  ipcMain.handle('window:fullscreen', () => win && win.setFullScreen(!win.isFullScreen()));
}
