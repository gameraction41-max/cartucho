// Configurações do usuário. A chave da Steam API é guardada criptografada pelo Windows (safeStorage).
const path = require('node:path');
const { app, safeStorage } = require('electron');
const { JsonStore } = require('./store');

const DEFAULTS = {
  steamId: '',
  steamApiKeyEnc: '',
  prismDir: '',
  prismExe: '',
  hytaleExe: '',
  hytaleProcess: '',
  openAtLogin: false,
  returnAfterGame: true,
  showBoot: true,
  sounds: true,
  music: true,
  musicFile: '',
  volume: 0.5,
  captureBuffer: true,
};

let store;

function getStore() {
  if (!store) store = new JsonStore(path.join(app.getPath('userData'), 'config.json'), DEFAULTS);
  return store;
}

function encrypt(text) {
  if (!text) return '';
  if (safeStorage.isEncryptionAvailable()) return 'enc:' + safeStorage.encryptString(text).toString('base64');
  return 'raw:' + text;
}

function decrypt(value) {
  if (!value) return '';
  if (value.startsWith('raw:')) return value.slice(4);
  try {
    return safeStorage.decryptString(Buffer.from(value.slice(4), 'base64'));
  } catch {
    return '';
  }
}

function getSteamApiKey() {
  return decrypt(getStore().get('steamApiKeyEnc'));
}

// O que a interface pode ver: a chave nunca sai do processo principal, só os 4 últimos dígitos.
function getPublic() {
  const { steamApiKeyEnc, ...rest } = getStore().data;
  const key = getSteamApiKey();
  return { ...rest, hasSteamApiKey: !!key, steamApiKeyHint: key ? key.slice(-4) : '' };
}

function update(patch) {
  const s = getStore();
  const next = { ...patch };
  if ('steamApiKey' in next) {
    next.steamApiKeyEnc = encrypt(String(next.steamApiKey).trim());
    delete next.steamApiKey;
  }
  for (const key of Object.keys(next)) {
    if (!(key in DEFAULTS)) delete next[key];
  }
  if (typeof next.steamId === 'string') next.steamId = next.steamId.trim();
  s.patch(next);
  if ('openAtLogin' in next) applyLoginItem(next.openAtLogin);
  return getPublic();
}

// Só vale no app instalado: rodando com "npm start", o Windows abriria o Electron puro, sem o Cartucho.
function applyLoginItem(enabled) {
  if (!app.isPackaged || (process.platform !== 'win32' && process.platform !== 'darwin')) return;
  app.setLoginItemSettings({ openAtLogin: !!enabled, args: ['--startup'] });
}

function get(key) {
  return getStore().get(key);
}

module.exports = { get, getPublic, update, getSteamApiKey };
