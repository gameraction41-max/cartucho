// Capa, fundo e música escolhidos pela pessoa para cada jogo. Os arquivos são copiados para a pasta de dados,
// então continuam funcionando mesmo se o original for apagado ou mudar de lugar.
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');
const { app } = require('electron');
const { JsonStore } = require('./store');

const KINDS = ['cover', 'hero'];
const IMAGE_EXT = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];
const AUDIO_EXT = ['.mp3', '.ogg', '.wav', '.flac', '.m4a'];
const EXT = { cover: IMAGE_EXT, hero: IMAGE_EXT, music: AUDIO_EXT };

let store;
function custom() {
  if (!store) store = new JsonStore(path.join(app.getPath('userData'), 'custom-art.json'), { games: {} });
  return store;
}

function artDir() {
  return path.join(app.getPath('userData'), 'art');
}

function safeName(key) {
  return key.replace(/[^a-z0-9_-]/gi, '_');
}

// O ?v= muda a cada troca, senão a janela mostraria a imagem antiga que ficou guardada em cache.
function urlFor(entry) {
  return entry && fs.existsSync(entry.file) ? `${pathToFileURL(entry.file).href}?v=${entry.at}` : null;
}

// Coloca a arte personalizada na frente da original. A original continua na lista como reserva.
function apply(game) {
  const entry = custom().get('games')[game.key];
  if (!entry) return game;
  const art = { cover: [...((game.art && game.art.cover) || [])], hero: [...((game.art && game.art.hero) || [])] };
  for (const kind of KINDS) {
    const url = urlFor(entry[kind]);
    if (url) art[kind].unshift(url);
  }
  const music = entry.music && fs.existsSync(entry.music.file) ? entry.music.file : null;
  return { ...game, art, music, musicName: music ? entry.music.name || 'Música própria' : null, customArt: KINDS.filter((k) => urlFor(entry[k])) };
}

function set(key, kind, source) {
  if (!EXT[kind]) throw new Error('Tipo de arquivo desconhecido.');
  const ext = path.extname(source).toLowerCase();
  if (!EXT[kind].includes(ext)) throw new Error(kind === 'music' ? 'Escolha uma música MP3, OGG, WAV, FLAC ou M4A.' : 'Escolha uma imagem JPG, PNG, WEBP ou GIF.');
  fs.mkdirSync(artDir(), { recursive: true });
  const games = custom().get('games');
  const entry = games[key] || {};
  if (entry[kind]) fs.rmSync(entry[kind].file, { force: true });
  const file = path.join(artDir(), `${safeName(key)}-${kind}${ext}`);
  fs.copyFileSync(source, file);
  entry[kind] = { file, at: Date.now(), name: path.basename(source, ext) };
  games[key] = entry;
  custom().set('games', games);
}

// Sem kind, volta a capa e o fundo originais (a música fica). Com kind, tira só aquele arquivo.
function reset(key, kind) {
  const games = custom().get('games');
  const entry = games[key];
  if (!entry) return;
  for (const k of kind ? [kind] : KINDS) {
    if (!entry[k]) continue;
    fs.rmSync(entry[k].file, { force: true });
    delete entry[k];
  }
  if (Object.keys(entry).length) games[key] = entry;
  else delete games[key];
  custom().set('games', games);
}

module.exports = { apply, set, reset, EXT };
