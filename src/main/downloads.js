// Acompanha as instalações da Steam lendo os appmanifest (steamlocal.js) de tempos em tempos.
// Com algo baixando, olha a cada poucos segundos para a barra andar; parado, só de vez em quando.
const fs = require('node:fs');
const path = require('node:path');
const steamlocal = require('./steamlocal');

const FAST_MS = 2500;
const SLOW_MS = 20000;
// Depois de pedir uma instalação, por quanto tempo esperamos o download aparecer para trazer o Cartucho de volta.
const PENDING_MS = 3 * 60 * 1000;

let root = null;
let apps = null; // Map appid -> estado; null quando a Steam não foi encontrada neste PC
let lastDownloads = '';
let lastInstalled = null;
let pending = null; // { appid, at }
let timer = null;
let tick = null;

function scan() {
  if (!root) root = steamlocal.steamDir();
  apps = fs.existsSync(path.join(root, 'steamapps')) ? steamlocal.scanApps(root) : null;
  return apps;
}

// Estado de um jogo para a biblioteca. Sem a Steam encontrada, não dá para saber: fica undefined.
function info(appid) {
  if (!apps) return {};
  const a = apps.get(appid);
  return a ? { installed: a.installed, download: a.download, size: a.size } : { installed: false, download: null };
}

// Pasta do jogo instalado (steamapps/common/...), para descobrir onde ele guarda as opções gráficas.
function installDir(appid) {
  const a = apps && apps.get(appid);
  return a && a.installed ? a.dir : null;
}

function list(names = new Map()) {
  if (!apps) return [];
  return [...apps.values()]
    .filter((a) => a.download)
    .map((a) => ({ key: `steam:${a.appid}`, appid: a.appid, title: names.get(a.appid) || a.name || String(a.appid), ...a.download }))
    .sort((a, b) => (a.state === 'downloading' ? -1 : 0) - (b.state === 'downloading' ? -1 : 0));
}

function expectInstall(appid) {
  pending = { appid, at: Date.now() };
}

// onDownloads(lista) quando a lista ou a porcentagem muda; onInstalledChange() quando um jogo termina de instalar ou é removido;
// onStarted(appid) quando aparece o download que o Cartucho pediu.
function start({ names, onDownloads, onInstalledChange, onStarted }) {
  tick = () => {
    try {
      scan();
    } catch {
      apps = null;
    }
    const downloads = list(names());
    const dKey = JSON.stringify(downloads.map((d) => [d.appid, d.state, d.percent]));
    if (dKey !== lastDownloads) {
      lastDownloads = dKey;
      onDownloads(downloads);
    }
    const iKey = apps ? [...apps.values()].filter((a) => a.installed).map((a) => a.appid).sort().join(',') : '';
    if (iKey !== lastInstalled) {
      const first = lastInstalled === null;
      lastInstalled = iKey;
      if (!first) onInstalledChange();
    }
    if (pending) {
      if (downloads.some((d) => d.appid === pending.appid) || (apps && apps.get(pending.appid)?.installed)) {
        onStarted(pending.appid);
        pending = null;
      } else if (Date.now() - pending.at > PENDING_MS) {
        pending = null;
      }
    }
    timer = setTimeout(tick, downloads.length || pending ? FAST_MS : SLOW_MS);
  };
  tick();
}

// Chamado logo depois de pedir algo à Steam, para não esperar a próxima volta lenta.
function poke() {
  if (!tick) return;
  clearTimeout(timer);
  timer = setTimeout(tick, 500);
}

module.exports = { start, info, installDir, list, expectInstall, scan, poke };
