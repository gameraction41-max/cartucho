// Atualização automática: procura uma versão nova nas Releases do GitHub, baixa em segundo plano
// e instala quando o Cartucho fecha (ou na hora, pelo menu rápido). Só funciona no app instalado.
// Em Configurações > Sobre dá para procurar na hora; o último erro fica salvo em updater.log.
const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const CHECK_EVERY_MS = 6 * 3600 * 1000;

let status = { state: 'idle', version: null, percent: 0, error: null };
let updater = null;
let notify = () => {};
// Com um jogo aberto, a procura automática espera: baixar 150 MB no meio de uma partida online dá lag.
let playing = () => false;
let missed = false;

function set(next) {
  status = { ...status, ...next };
  notify(status);
}

function log(line) {
  try {
    fs.appendFileSync(path.join(app.getPath('userData'), 'updater.log'), `${new Date().toISOString()} ${line}\n`);
  } catch {}
}

// Mensagem curta para a tela; o texto completo vai para o log.
function friendly(err) {
  const msg = String((err && err.message) || err || '');
  if (/ENOTFOUND|ETIMEDOUT|ECONNRESET|ECONNREFUSED|net::/i.test(msg)) return 'Sem conexão com o GitHub';
  if (/404|latest\.yml/i.test(msg)) return 'Não achei a versão nova no GitHub';
  if (/sha512|checksum/i.test(msg)) return 'O download veio corrompido, tente de novo';
  if (/403|rate limit/i.test(msg)) return 'O GitHub limitou as consultas, tente mais tarde';
  return msg.split('\n')[0].slice(0, 90) || 'Erro desconhecido';
}

function watchUpdates(onStatus, { busy } = {}) {
  notify = onStatus;
  if (busy) playing = busy;
  if (!app.isPackaged) {
    status = { ...status, state: 'dev' };
    return;
  }
  ({ autoUpdater: updater } = require('electron-updater'));
  updater.autoDownload = true;
  updater.autoInstallOnAppQuit = true;
  updater.logger = { info: () => {}, warn: (m) => log(`aviso: ${m}`), error: (m) => log(`erro: ${m}`), debug: () => {} };
  updater.on('checking-for-update', () => { if (status.state !== 'ready') set({ state: 'checking', error: null }); });
  updater.on('update-available', (info) => set({ state: 'downloading', version: info.version, percent: 0 }));
  updater.on('download-progress', (p) => set({ state: 'downloading', percent: Math.round(p.percent || 0) }));
  updater.on('update-downloaded', (info) => set({ state: 'ready', version: info.version }));
  updater.on('update-not-available', () => set({ state: 'current', checkedAt: Date.now() }));
  // Sem internet ou com o GitHub fora do ar, tenta de novo na próxima verificação.
  updater.on('error', (err) => {
    log(`falhou: ${(err && err.stack) || err}`);
    if (status.state !== 'ready') set({ state: 'error', error: friendly(err) });
  });
  autoCheck();
  setInterval(autoCheck, CHECK_EVERY_MS);
}

function autoCheck() {
  if (playing()) {
    missed = true;
    return;
  }
  checkNow();
}

// O jogo fechou: faz a procura que ficou para depois.
function gameEnded() {
  if (!missed) return;
  missed = false;
  autoCheck();
}

function checkNow() {
  if (!updater || status.state === 'downloading' || status.state === 'ready') return status;
  updater.checkForUpdates().catch(() => {});
  return status;
}

function getStatus() {
  return status;
}

function installNow() {
  if (updater && status.state === 'ready') updater.quitAndInstall(true, true);
}

module.exports = { watchUpdates, checkNow, gameEnded, getStatus, installNow };
