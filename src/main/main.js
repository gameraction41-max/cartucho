// Processo principal do Cartucho: janela em tela cheia, acesso a arquivos e abertura dos jogos.
const path = require('node:path');
const fs = require('node:fs');
const { spawn } = require('node:child_process');
const { app, BrowserWindow, ipcMain, shell, dialog, clipboard, globalShortcut, powerMonitor, Tray, Menu } = require('electron');
const config = require('./config');
const library = require('./library');
const prism = require('./prism');
const watch = require('./watch');
const system = require('./system');
const art = require('./art');
const artsearch = require('./artsearch');
const mcoptions = require('./mcoptions');
const { watchGuideButton } = require('./guide');
const { forceForeground } = require('./foreground');
const overlay = require('./overlay');
const updater = require('./updater');
const downloads = require('./downloads');
const gamepresets = require('./gamepresets');
const screenshots = require('./screenshots');
const capture = require('./capture');
const steamlocal = require('./steamlocal');
const mods = require('./mods');
const sofa = require('./sofa');
const hytale = require('./hytale');
const customgames = require('./customgames');

const windowed = process.argv.includes('--windowed');
let win = null;
let running = null;
let recommended = null; // preset gráfico que combina com o hardware, calculado uma vez
let couch = null; // modo sofá (sofa.js)
let tray = null; // ícone perto do relógio enquanto o Cartucho espera o botão Xbox
let quitting = false;

// Música e sons tocam sem precisar de um clique antes, como num console.
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', bringToFront);
  app.whenReady().then(() => {
    registerIpc();
    gamepresets.setBackupDir(() => path.join(app.getPath('userData'), 'backups'));
    gamepresets.setInstallDir(downloads.installDir);
    mods.setTrash((file) => shell.trashItem(file));
    createWindow();
    capture.setup({
      buffer: () => config.get('captureBuffer') !== false,
      onStatus: (s) => { send('capture:status', s); overlay.send('capture:status', s); },
      log: (line) => {
        try { fs.appendFileSync(path.join(app.getPath('userData'), 'capture.log'), `${new Date().toISOString()} ${line}\n`); } catch {}
      },
    });
    watchGuideButton(onGuide, onGuideCombo, () => couch && couch.activity());
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
    startSofa();
  });
  app.on('before-quit', () => { quitting = true; });
  app.on('window-all-closed', () => app.quit());
  app.on('will-quit', () => {
    globalShortcut.unregisterAll();
    capture.shutdown();
  });
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
    icon: path.join(__dirname, '..', 'renderer', 'img', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: true,
    },
  });
  win.removeMenu();
  // A janela do menu sobre o jogo fica pronta logo depois, para não disputar a abertura com a tela principal.
  win.once('ready-to-show', () => {
    win.show();
    setTimeout(() => overlay.prepare(), 2000);
  });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.on('focus', () => send('window:focus'));
  win.on('blur', () => send('window:blur'));
  // Fechar a janela (Alt+F4) também só esconde, se o botão Xbox estiver ligado para abrir o Cartucho.
  win.on('close', (e) => {
    if (quitting || config.get('guideOpens') === false) return;
    e.preventDefault();
    hideToTray();
  });
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

// "Sair para o Windows" esconde o Cartucho em vez de fechar: ele fica quietinho perto do relógio
// lendo o botão Xbox, que traz a tela de volta. Para fechar de vez, é pelo ícone perto do relógio.
function hideToTray() {
  if (!win || win.isDestroyed()) return;
  releaseTop();
  win.hide();
  send('window:blur');
  if (tray) return;
  tray = new Tray(path.join(__dirname, '..', 'renderer', 'img', 'icon.png'));
  tray.setToolTip('Cartucho: aperte o botão Xbox do controle para abrir');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Abrir o Cartucho', click: () => bringToFront() },
    { type: 'separator' },
    { label: 'Fechar de vez', click: () => app.quit() },
  ]));
  tray.on('click', () => bringToFront());
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
  // Escondido perto do relógio (Sair para o Windows): volta direto para a tela, sem abrir o menu.
  if (!win.isVisible()) {
    bringToFront();
    return send('window:focus');
  }
  const fromBackground = !win.isFocused();
  if (fromBackground) showOverApp();
  send('input:guide', { fromBackground });
}

// Botão Xbox + Y tira print, + X salva os últimos 30 s, + RB começa ou para a gravação.
const COMBO_ACTION = { y: 'screenshot', x: 'clip', rb: 'record' };
function onGuideCombo(button) {
  const action = COMBO_ACTION[button];
  if (action && running) capture.actions[action]();
}

// Atalhos do teclado durante o jogo. Não usam os do app da NVIDIA (Alt+F1, F9, F10) para não capturar duas vezes.
const SHORTCUTS = { 'Alt+Shift+P': 'screenshot', 'Alt+Shift+G': 'clip', 'Alt+Shift+R': 'record' };
function captureShortcuts(on) {
  for (const [accel, action] of Object.entries(SHORTCUTS)) {
    if (on) { try { globalShortcut.register(accel, () => capture.actions[action]()); } catch {} } else globalShortcut.unregister(accel);
  }
}

function gameEnded(game) {
  running = null;
  captureShortcuts(false);
  capture.gameEnded();
  overlay.close({ backToGame: false });
  send('game:ended', { key: game.key });
  send('library:changed');
  if (config.get('returnAfterGame')) bringToFront();
}

// O que impede o modo sofá de agir. Download na fila ou pausado não conta, só o que está baixando.
function sofaBusy() {
  if (running) return 'jogo';
  if (downloads.list().some((d) => d.state === 'downloading')) return 'download';
  if (capture.status().recording) return 'gravação';
  if (updater.getStatus().state === 'downloading') return 'atualização';
  return null;
}

function startSofa() {
  couch = sofa.start({
    settings: () => ({ action: config.get('sofaAction'), minutes: config.get('sofaMinutes') }),
    busy: sofaBusy,
    inFront: () => !!win && !win.isDestroyed() && win.isFocused() && !win.isMinimized() && !overlay.isOpen(),
    systemIdleMs: () => powerMonitor.getSystemIdleTime() * 1000,
    onWarn: (w) => send('sofa:warn', w),
    onCancel: () => send('sofa:cancel'),
    onRest: (mode) => send('sofa:rest', { mode }),
    act: (action) => {
      if (action === 'covers') return;
      if (action === 'screen') return system.screen(false);
      if (action === 'wake') return system.screen(true);
      return system.power(action);
    },
  });
  powerMonitor.on('resume', () => couch.resumed());
}

function syncRarity() {
  return library.syncRarity({ onProgress: () => send('achievements:changed') });
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
    const exe = library.hytaleExe();
    if (!exe) return { error: 'Não encontrei o Hytale. Indique o executável em Configurações.' };
    spawn(exe, [], { cwd: path.dirname(exe), detached: true, stdio: 'ignore' }).unref();
    // O executável costuma ser o launcher do Hytale, que abre o jogo em outro processo. Por isso olhamos os dois nomes.
    const names = [config.get('hytaleProcess'), path.basename(exe), hytale.CLIENT_EXE];
    watch.watchProcesses(names, {
      onEnd: (ms) => {
        library.addHytaleTime(ms);
        gameEnded(game);
      },
    });
  } else if (game.source === 'custom') {
    const c = (config.get('customGames') || []).find((x) => x.id === game.customId);
    if (!c || !fs.existsSync(c.exe)) return { error: 'Não encontrei o executável deste jogo. Ele pode ter mudado de pasta.' };
    const args = c.args ? (c.args.match(/"[^"]*"|\S+/g) || []).map((a) => a.replace(/^"|"$/g, '')) : [];
    spawn(c.exe, args, { cwd: path.dirname(c.exe), detached: true, stdio: 'ignore' }).unref();
    watch.watchProcesses([c.process, path.basename(c.exe)], {
      onEnd: (ms) => {
        library.addCustomTime(c.id, ms);
        gameEnded(game);
      },
    });
  } else {
    return { error: 'Tipo de jogo desconhecido.' };
  }
  running = { key: game.key, title: game.title, since: Date.now() };
  config.update({ lastLaunched: game.key });
  send('game:started', running);
  captureShortcuts(true);
  capture.gameStarted(running);
  return { ok: true };
}

function openInSource(game) {
  if (game.source === 'steam') return shell.openExternal(`steam://nav/games/details/${game.appid}`);
  if (game.source === 'prism' || game.source === 'minecraft') {
    const exe = prism.findExe(library.prismDir(), config.get('prismExe'));
    if (exe) prism.launch(exe, game.instanceId ? ['--show', game.instanceId] : []);
    return;
  }
  if (game.source === 'hytale' && library.hytaleExe()) shell.showItemInFolder(library.hytaleExe());
  if (game.source === 'custom' && game.exe && fs.existsSync(game.exe)) shell.showItemInFolder(game.exe);
}

// Pasta do jogo no Explorador: a de instalação da Steam, a da instância do Prism, a das instâncias (Minecraft) ou a do executável.
function openGameFolder(game) {
  if (game.source === 'steam') {
    const app = steamlocal.scanApps().get(Number(game.appid));
    if (!app || !app.dir || !fs.existsSync(app.dir)) return { error: 'Não achei a pasta deste jogo. Ele está instalado neste PC?' };
    return shell.openPath(app.dir).then(() => ({ ok: true }));
  }
  if (game.source === 'prism') {
    const inst = prism.listInstances(library.prismDir()).find((i) => i.id === game.instanceId);
    if (!inst) return { error: 'Não achei esta instância na pasta do Prism.' };
    return shell.openPath(inst.dir).then(() => ({ ok: true }));
  }
  if (game.source === 'minecraft') {
    const dir = prism.instancesDir(library.prismDir());
    if (!fs.existsSync(dir)) return { error: 'Não achei a pasta de instâncias do Prism.' };
    return shell.openPath(dir).then(() => ({ ok: true }));
  }
  const exe = game.source === 'hytale' ? library.hytaleExe() : game.exe;
  if (!exe || !fs.existsSync(exe)) return { error: 'Não achei a pasta deste jogo.' };
  shell.showItemInFolder(exe);
  return { ok: true };
}

function registerIpc() {
  ipcMain.handle('config:get', () => ({ ...config.getPublic(), defaultPrismDir: prism.defaultPrismDir(), defaultHytaleExe: hytale.findLauncher(null), running }));
  ipcMain.handle('config:set', (_e, patch) => {
    const out = config.update(patch || {});
    if (patch && 'captureBuffer' in patch) capture.setBuffer(patch.captureBuffer !== false);
    return out;
  });
  ipcMain.handle('capture:status', () => capture.status());
  // Pelo menu: fecha o menu antes, para ele não sair na captura.
  ipcMain.handle('capture:do', (_e, what) => {
    if (!capture.actions[what]) return;
    const fromOverlay = overlay.isOpen();
    overlay.close();
    setTimeout(() => capture.actions[what](), fromOverlay ? 350 : 0);
  });
  ipcMain.handle('library:get', () => library.getLibrary());
  ipcMain.handle('library:sync', async (_e, opts = {}) => {
    try {
      const lib = await library.syncSteam();
      library.syncAchievements({ ...opts, onProgress: () => send('achievements:changed') }).then((unlocked) => {
        send('achievements:changed');
        notifyUnlocks(unlocked);
        return syncRarity();
      }).catch(() => {});
      return lib;
    } catch (err) {
      return { ...library.getLibrary(), error: err.message };
    }
  });
  ipcMain.handle('achievements:summary', () => library.achievementSummary());
  // Abrir o perfil já começa a ler a raridade que falta; a tela se atualiza com achievements:changed.
  ipcMain.handle('profile:get', () => {
    syncRarity().catch(() => {});
    return library.profile();
  });
  ipcMain.handle('achievements:game', (_e, appid) => library.gameAchievements(appid));
  ipcMain.handle('game:launch', (_e, game) => launchGame(game));
  ipcMain.handle('game:open-source', (_e, game) => openInSource(game));
  ipcMain.handle('game:folder', (_e, game) => openGameFolder(game));
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
  // Imagem escolhida para algo que não é jogo (o fundo da aba PC usa a chave cartucho:pc).
  ipcMain.handle('art:url', (_e, key, kind = 'hero') => {
    const a = art.apply({ key: String(key), art: { cover: [], hero: [] } }).art;
    return (a[kind] && a[kind][0]) || null;
  });
  // Busca de capa, fundo e música na internet. Erros voltam como { error } para a tela mostrar.
  const searching = (fn) => async (_e, ...args) => {
    try {
      return await fn(...args);
    } catch (err) {
      return err instanceof artsearch.SearchError ? { error: err.message, blocked: !!err.blocked } : { error: 'Não deu para buscar agora. Tente de novo.' };
    }
  };
  const previews = new Map(); // faixa → arquivo baixado para ouvir, reaproveitado se a pessoa escolher a faixa
  const clearPreviews = () => {
    for (const file of previews.values()) artsearch.cleanup(file);
    previews.clear();
  };
  const trackFile = async (trackId) => {
    if (!previews.has(trackId)) previews.set(trackId, await artsearch.downloadTrack(trackId));
    return previews.get(trackId);
  };
  ipcMain.handle('artsearch:images', searching((game, kind, term) => artsearch.images(config.getSgdbApiKey(), game, kind, term)));
  ipcMain.handle('artsearch:albums', searching((game, term) => artsearch.albums(game, term)));
  ipcMain.handle('artsearch:tracks', searching((album) => artsearch.tracks(album)));
  ipcMain.handle('artsearch:preview', searching(async (trackId) => ({ file: await trackFile(trackId) })));
  ipcMain.handle('artsearch:use-image', searching(async (key, kind, url) => {
    const file = await artsearch.downloadImage(url);
    try {
      art.set(key, kind, file);
    } finally {
      artsearch.cleanup(file);
    }
    return { ok: true };
  }));
  ipcMain.handle('artsearch:use-track', searching(async (key, trackId, name) => {
    art.set(key, 'music', await trackFile(trackId), name);
    return { ok: true };
  }));
  ipcMain.handle('artsearch:done', () => clearPreviews());
  ipcMain.handle('artsearch:open-site', (_e, game, term) => shell.openExternal(artsearch.siteSearchUrl(game, term)));
  app.on('will-quit', clearPreviews);
  ipcMain.handle('prism:rename', (_e, instanceId, name) => {
    if (running && running.key === `prism:${instanceId}`) return { error: 'Feche o Minecraft antes de renomear esta instância.' };
    try {
      prism.renameInstance(library.prismDir(), instanceId, name);
      return { ok: true };
    } catch (err) {
      return { error: err.message };
    }
  });
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
  // Mods das instâncias do Prism. A instância vem pelo id, e a pasta é achada aqui, nunca pela tela.
  const modding = (fn, { changes = true } = {}) => async (_e, instanceId, ...args) => {
    const inst = prism.listInstances(library.prismDir()).find((i) => i.id === instanceId);
    if (!inst) return { error: 'Não encontrei a pasta desta instância.' };
    if (changes && running && running.key === `prism:${instanceId}`) return { error: 'Feche o Minecraft antes de mexer nos mods desta instância.' };
    try {
      return await fn(inst.dir, { loader: inst.loader, mcVersion: inst.mcVersion }, ...args);
    } catch (err) {
      return { error: err instanceof mods.ModError ? err.message : `Não deu certo: ${err.message}` };
    }
  };
  ipcMain.handle('mods:list', modding((dir, game) => mods.list(dir, game), { changes: false }));
  ipcMain.handle('mods:search', modding((_dir, game, text, offset) => mods.search(game, text, offset), { changes: false }));
  ipcMain.handle('mods:install', modding((dir, game, projectId) => mods.install(dir, game, projectId)));
  ipcMain.handle('mods:update', modding((dir, game, file) => mods.update(dir, game, file)));
  ipcMain.handle('mods:toggle', modding((dir, _game, file) => mods.toggle(dir, file)));
  ipcMain.handle('mods:remove', modding((dir, _game, file) => mods.remove(dir, file)));
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
    // Jogos da Steam que o Cartucho sabe ajustar (gamepresets.js) entram junto.
    for (const appid of library.steamNames().keys()) {
      if (!gamepresets.supported(appid)) continue;
      if (running && running.key === `steam:${appid}`) { skipped++; continue; }
      try {
        gamepresets.write(appid, presetId);
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
  // Capturas: a lista de jogos vem da interface, só para dar nome certo às capturas da Barra de Jogo.
  ipcMain.handle('screenshots:list', (_e, games) => {
    const list = (Array.isArray(games) ? games : []).slice(0, 5000)
      .filter((g) => g && typeof g.key === 'string' && typeof g.title === 'string')
      .map((g) => ({ key: g.key, title: g.title, appid: Number.isInteger(g.appid) ? g.appid : null }));
    return screenshots.scan({
      cartuchoDirs: Object.values(capture.roots()),
      steamRoot: steamlocal.steamDir(),
      games: list,
      steamNames: (() => { try { return library.steamNames(); } catch { return new Map(); } })(),
    });
  });
  // Apagar uma captura: vai para a Lixeira do Windows, então dá para recuperar se foi engano.
  ipcMain.handle('screenshots:remove', async (_e, fileUrl) => {
    const t = screenshots.target(fileUrl, { cartuchoDirs: Object.values(capture.roots()), steamRoot: steamlocal.steamDir() });
    if (!t) return { error: 'Essa captura não está numa pasta que o Cartucho conhece.' };
    try {
      await shell.trashItem(t.file);
    } catch (err) {
      return { error: fs.existsSync(t.file) ? `Não consegui apagar: ${err.message}` : null };
    }
    if (t.thumb && fs.existsSync(t.thumb)) { try { await shell.trashItem(t.thumb); } catch {} }
    return { error: null };
  });
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
  // Jogos de fora da Steam: a lista do menu Iniciar (para escolher com o controle) ou um .exe escolhido na janela do Windows.
  ipcMain.handle('custom:scan', async () => {
    const known = (config.get('customGames') || []).map((c) => c.exe);
    const list = customgames.startMenuGames((f) => shell.readShortcutLink(f), { known });
    return Promise.all(list.map(async (g) => {
      try {
        return { ...g, icon: (await app.getFileIcon(g.exe, { size: 'large' })).toDataURL() };
      } catch {
        return g;
      }
    }));
  });
  ipcMain.handle('custom:pick', async () => {
    const r = await dialog.showOpenDialog(win, { title: 'Escolha o executável do jogo', properties: ['openFile'], filters: [{ name: 'Programas', extensions: ['exe'] }] });
    if (r.canceled) return null;
    return { title: customgames.niceName(r.filePaths[0]), exe: r.filePaths[0] };
  });
  ipcMain.handle('custom:add', (_e, g) => {
    if (!g || typeof g.exe !== 'string' || !fs.existsSync(g.exe)) return { error: 'Não encontrei esse executável.' };
    const list = config.get('customGames') || [];
    const found = list.find((c) => c.exe.toLowerCase() === g.exe.toLowerCase());
    if (found) return { key: `custom:${found.id}`, existed: true };
    const id = customgames.newId();
    config.update({ customGames: [...list, { id, title: g.title, exe: g.exe, args: g.args || '', addedAt: Date.now() }] });
    send('library:changed');
    return { key: `custom:${id}` };
  });
  ipcMain.handle('custom:update', (_e, id, patch = {}) => {
    const list = (config.get('customGames') || []).map((c) => (c.id === id ? { ...c, ...(typeof patch.title === 'string' && patch.title.trim() ? { title: patch.title.trim() } : {}) } : c));
    config.update({ customGames: list });
    send('library:changed');
    return { ok: true };
  });
  ipcMain.handle('custom:remove', (_e, id) => {
    config.update({ customGames: (config.get('customGames') || []).filter((c) => c.id !== id) });
    art.reset(`custom:${id}`);
    art.reset(`custom:${id}`, 'music');
    send('library:changed');
    return { ok: true };
  });
  ipcMain.handle('dialog:file', async (_e, opts = {}) => {
    const r = await dialog.showOpenDialog(win, { properties: ['openFile'], filters: opts.filters, defaultPath: opts.defaultPath });
    return r.canceled ? null : r.filePaths[0];
  });
  ipcMain.handle('dialog:folder', async (_e, opts = {}) => {
    const r = await dialog.showOpenDialog(win, { properties: ['openDirectory'], defaultPath: opts.defaultPath });
    return r.canceled ? null : r.filePaths[0];
  });
  ipcMain.handle('sofa:activity', () => couch && couch.activity());
  ipcMain.handle('clipboard:read', () => clipboard.readText().slice(0, 500));
  ipcMain.handle('system:power', (_e, action) => {
    if (action === 'quit') return config.get('guideOpens') === false ? app.quit() : hideToTray();
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
