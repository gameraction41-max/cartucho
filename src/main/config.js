// Configurações do usuário. A chave da Steam API é guardada criptografada pelo Windows (safeStorage).
const path = require('node:path');
const { app, safeStorage } = require('electron');
const { JsonStore } = require('./store');
const collections = require('./collections');
const { normalize } = require('./sofa');
const customgames = require('./customgames');

const DEFAULTS = {
  steamId: '',
  steamApiKeyEnc: '',
  sgdbApiKeyEnc: '',
  prismDir: '',
  prismExe: '',
  hytaleExe: '',
  hytaleProcess: '',
  openAtLogin: false,
  returnAfterGame: true,
  showBoot: true,
  introAnim: true,
  // Sair para o Windows deixa o Cartucho escondido, esperando o botão Xbox.
  guideOpens: true,
  sounds: true,
  music: true,
  musicFile: '',
  volume: 0.5,
  // Só a música de fundo (tema e música dos jogos), por cima do volume geral.
  musicVolume: 1,
  captureBuffer: false,
  theme: 'cartucho',
  collections: collections.DEFAULT_COLLECTIONS,
  sofaAction: 'off',
  sofaMinutes: 30,
  // Jogos de fora da Steam adicionados pela pessoa, e chaves dos jogos que ela escondeu do Início e da Biblioteca.
  customGames: [],
  hiddenGames: [],
  // Último jogo aberto pelo Cartucho: a tela de perfil usa a arte dele no fundo.
  lastLaunched: '',
};

let store;

function getStore() {
  if (!store) {
    store = new JsonStore(path.join(app.getPath('userData'), 'config.json'), DEFAULTS);
    migrate(store);
  }
  return store;
}

// 0.20.1: os últimos 30 s passaram a vir desligados, porque gravar a tela o jogo inteiro dava travadas.
// O config.json guarda todas as opções, então quem já tinha o Cartucho recebe o desligado uma vez só;
// depois disso vale o que a pessoa escolher em Configurações > Capturas.
function migrate(s) {
  if (s.get('bufferOffByDefault')) return;
  s.patch({ captureBuffer: false, bufferOffByDefault: true });
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

function getSgdbApiKey() {
  return decrypt(getStore().get('sgdbApiKeyEnc'));
}

// O que a interface pode ver: as chaves nunca saem do processo principal, só os 4 últimos dígitos.
function getPublic() {
  const { steamApiKeyEnc, sgdbApiKeyEnc, ...rest } = getStore().data;
  const key = getSteamApiKey();
  const sgdb = getSgdbApiKey();
  return { ...rest, hasSteamApiKey: !!key, steamApiKeyHint: key ? key.slice(-4) : '', hasSgdbApiKey: !!sgdb, sgdbApiKeyHint: sgdb ? sgdb.slice(-4) : '' };
}

function update(patch) {
  const s = getStore();
  const next = { ...patch };
  for (const name of ['steamApiKey', 'sgdbApiKey']) {
    if (!(name in next)) continue;
    next[`${name}Enc`] = encrypt(String(next[name]).trim());
    delete next[name];
  }
  for (const key of Object.keys(next)) {
    if (!(key in DEFAULTS)) delete next[key];
  }
  if (typeof next.steamId === 'string') next.steamId = next.steamId.trim();
  if ('collections' in next) next.collections = collections.sanitize(next.collections);
  if ('customGames' in next) next.customGames = customgames.sanitize(next.customGames);
  if ('hiddenGames' in next) next.hiddenGames = Array.isArray(next.hiddenGames) ? [...new Set(next.hiddenGames.filter((k) => typeof k === 'string' && k.length < 120))].slice(0, 2000) : [];
  if ('lastLaunched' in next) next.lastLaunched = typeof next.lastLaunched === 'string' ? next.lastLaunched.slice(0, 120) : '';
  if ('sofaAction' in next || 'sofaMinutes' in next) {
    const sofa = normalize({ action: next.sofaAction ?? s.get('sofaAction'), minutes: next.sofaMinutes ?? s.get('sofaMinutes') });
    next.sofaAction = sofa.action;
    next.sofaMinutes = sofa.minutes;
  }
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

module.exports = { get, getPublic, update, getSteamApiKey, getSgdbApiKey };
