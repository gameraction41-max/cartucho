// Capa e fundo escolhidos pela pessoa para cada jogo. As imagens são copiadas para a pasta de dados,
// então continuam funcionando mesmo se o arquivo original for apagado ou mudar de lugar.
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');
const { app } = require('electron');
const { JsonStore } = require('./store');

const KINDS = ['cover', 'hero'];
const IMAGE_EXT = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];

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
  return { ...game, art, customArt: KINDS.filter((k) => urlFor(entry[k])) };
}

function set(key, kind, source) {
  if (!KINDS.includes(kind)) throw new Error('Tipo de arte desconhecido.');
  const ext = path.extname(source).toLowerCase();
  if (!IMAGE_EXT.includes(ext)) throw new Error('Escolha uma imagem JPG, PNG, WEBP ou GIF.');
  fs.mkdirSync(artDir(), { recursive: true });
  const games = custom().get('games');
  const entry = games[key] || {};
  if (entry[kind]) fs.rmSync(entry[kind].file, { force: true });
  const file = path.join(artDir(), `${safeName(key)}-${kind}${ext}`);
  fs.copyFileSync(source, file);
  entry[kind] = { file, at: Date.now() };
  games[key] = entry;
  custom().set('games', games);
}

function reset(key) {
  const games = custom().get('games');
  const entry = games[key];
  if (!entry) return;
  for (const kind of KINDS) if (entry[kind]) fs.rmSync(entry[kind].file, { force: true });
  delete games[key];
  custom().set('games', games);
}

module.exports = { apply, set, reset, IMAGE_EXT };
