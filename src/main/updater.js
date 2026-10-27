// Atualização automática: procura uma versão nova nas Releases do GitHub, baixa em segundo plano
// e instala quando o Cartucho fecha (ou na hora, pelo menu rápido). Só funciona no app instalado.
const { app } = require('electron');

const CHECK_EVERY_MS = 6 * 3600 * 1000;

let status = { state: 'idle', version: null };
let updater = null;

function watchUpdates(onStatus) {
  if (!app.isPackaged) return;
  ({ autoUpdater: updater } = require('electron-updater'));
  updater.autoDownload = true;
  updater.autoInstallOnAppQuit = true;
  const set = (next) => {
    status = { ...status, ...next };
    onStatus(status);
  };
  updater.on('update-available', (info) => set({ state: 'downloading', version: info.version }));
  updater.on('update-downloaded', (info) => set({ state: 'ready', version: info.version }));
  updater.on('update-not-available', () => set({ state: 'current' }));
  // Sem internet ou com o GitHub fora do ar, tenta de novo na próxima verificação; não incomoda ninguém.
  updater.on('error', () => { if (status.state !== 'ready') set({ state: 'idle' }); });
  const check = () => updater.checkForUpdates().catch(() => {});
  check();
  setInterval(check, CHECK_EVERY_MS);
}

function getStatus() {
  return status;
}

function installNow() {
  if (updater && status.state === 'ready') updater.quitAndInstall(true, true);
}

module.exports = { watchUpdates, getStatus, installNow };
