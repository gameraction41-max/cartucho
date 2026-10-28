// Busca de capa, fundo e música na internet, para não precisar baixar e escolher o arquivo na mão.
// Imagens vêm do SteamGridDB (precisa de uma chave grátis) e músicas das trilhas sonoras do KHInsider.
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const SGDB = 'https://www.steamgriddb.com/api/v2';
const KHI = 'https://downloads.khinsider.com';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36';
const MAX_BYTES = 60 * 1024 ** 2;
const MAX_RESULTS = 40;

// Capa é a imagem vertical (600x900 e parecidas); fundo é a imagem larga que o SteamGridDB chama de hero.
const IMAGE_QUERY = {
  cover: (id) => `/grids/game/${id}?dimensions=600x900,342x482,660x930&types=static&mimes=image/png,image/jpeg,image/webp&nsfw=false&humor=false`,
  hero: (id) => `/heroes/game/${id}?types=static&mimes=image/png,image/jpeg,image/webp&nsfw=false&humor=false`,
};

class SearchError extends Error {}

async function get(url, opts = {}) {
  let res;
  try {
    res = await fetch(url, { ...opts, headers: { 'User-Agent': UA, ...(opts.headers || {}) }, signal: AbortSignal.timeout(20000) });
  } catch {
    throw new SearchError('Sem conexão. Confira sua internet.');
  }
  return res;
}

// ===== SteamGridDB =====

async function sgdb(key, route) {
  if (!key) throw new SearchError('Falta a chave do SteamGridDB em Configurações.');
  const res = await get(SGDB + route, { headers: { Authorization: `Bearer ${key}` } });
  if (res.status === 401 || res.status === 403) throw new SearchError('O SteamGridDB recusou a chave. Confira em Configurações.');
  if (res.status === 404) return null;
  if (!res.ok) throw new SearchError(`O SteamGridDB respondeu com erro ${res.status}. Tente de novo daqui a pouco.`);
  const body = await res.json().catch(() => null);
  return body && body.success ? body.data : null;
}

// Jogos fora da Steam (instâncias do Minecraft, Hytale) são procurados pelo nome.
function searchTerm(game) {
  if (game.source === 'prism') return 'Minecraft';
  return String(game.title || '').replace(/[™®©]/g, '').trim();
}

async function findGame(key, game, term) {
  if (!term && game.appid) {
    const found = await sgdb(key, `/games/steam/${game.appid}`);
    if (found) return found;
  }
  const q = term || searchTerm(game);
  if (!q) return null;
  const list = await sgdb(key, `/search/autocomplete/${encodeURIComponent(q)}`);
  return list && list.length ? list[0] : null;
}

// Mais votadas primeiro; o SteamGridDB já tira conteúdo adulto e de humor pelo filtro da busca.
function pickImages(list) {
  return (list || [])
    .filter((x) => x && x.url && !x.nsfw && !x.humor)
    .sort((a, b) => (b.score || 0) - (a.score || 0))
    .slice(0, MAX_RESULTS)
    .map((x) => ({ id: x.id, url: x.url, thumb: x.thumb || x.url, width: x.width, height: x.height, author: x.author && x.author.name }));
}

async function images(key, game, kind, term) {
  if (!IMAGE_QUERY[kind]) throw new SearchError('Tipo de imagem desconhecido.');
  const found = await findGame(key, game, term);
  if (!found) return { term: term || searchTerm(game), name: null, items: [] };
  const list = await sgdb(key, IMAGE_QUERY[kind](found.id));
  return { term: term || searchTerm(game), name: found.name, items: pickImages(list) };
}

// ===== KHInsider =====

const decode = (s) => s
  .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&apos;/g, "'")
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
  .trim();

// Na página de busca, cada álbum aparece com um link na imagem (sem texto) e outro no nome.
function parseAlbums(html) {
  const seen = new Map();
  const re = /<a href="\/game-soundtracks\/album\/([^"/?#]+)"[^>]*>([^<]+)<\/a>/g;
  let m;
  while ((m = re.exec(html))) {
    const name = decode(m[2]);
    if (name && !seen.has(m[1])) seen.set(m[1], { id: m[1], name });
  }
  return [...seen.values()].slice(0, MAX_RESULTS);
}

// Na página do álbum, cada faixa tem vários links para a mesma página: o nome, a duração e o tamanho.
function parseTracks(html, album) {
  const tracks = new Map();
  const re = new RegExp(`<a href="(/game-soundtracks/album/${album.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/[^"]+)"[^>]*>([^<]*)</a>`, 'g');
  let m;
  while ((m = re.exec(html))) {
    const text = decode(m[2]);
    const t = tracks.get(m[1]) || { id: m[1], name: '', duration: '' };
    if (!text) continue;
    if (!t.name) t.name = text;
    else if (!t.duration && /^\d+:\d{2}(:\d{2})?$/.test(text)) t.duration = text;
    tracks.set(m[1], t);
  }
  return [...tracks.values()].filter((t) => t.name);
}

// A página da faixa tem o player com o endereço do MP3 e um link para baixar.
function parseSongUrl(html) {
  const audio = html.match(/<audio[^>]*\ssrc="(https?:\/\/[^"]+)"/i);
  if (audio) return decode(audio[1]);
  const link = html.match(/href="(https?:\/\/[^"]+\.mp3)"/i);
  return link ? decode(link[1]) : null;
}

async function page(url) {
  const res = await get(url);
  if (!res.ok) throw new SearchError(`O site de trilhas respondeu com erro ${res.status}. Tente de novo daqui a pouco.`);
  return { html: await res.text(), url: res.url };
}

async function albums(game, term) {
  const q = term || searchTerm(game);
  const { html, url } = await page(`${KHI}/search?search=${encodeURIComponent(q)}`);
  // Com um resultado só, o site pode ir direto para a página do álbum.
  const direct = url.match(/\/game-soundtracks\/album\/([^/?#]+)/);
  if (direct) {
    const title = html.match(/<h2>([^<]+)<\/h2>/);
    return { term: q, items: [{ id: direct[1], name: title ? decode(title[1]) : decodeURIComponent(direct[1]) }] };
  }
  return { term: q, items: parseAlbums(html) };
}

async function tracks(album) {
  if (!/^[^/?#]+$/.test(album)) throw new SearchError('Álbum inválido.');
  const { html } = await page(`${KHI}/game-soundtracks/album/${album}`);
  return parseTracks(html, album);
}

// ===== arquivos =====

function extOf(url, fallback) {
  const ext = path.extname(new URL(url).pathname).toLowerCase();
  return /^\.[a-z0-9]{2,4}$/.test(ext) ? ext : fallback;
}

async function download(url, ext) {
  const res = await get(url);
  if (!res.ok) throw new SearchError(`Não consegui baixar o arquivo (erro ${res.status}).`);
  const size = Number(res.headers.get('content-length') || 0);
  if (size > MAX_BYTES) throw new SearchError('Arquivo grande demais.');
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > MAX_BYTES) throw new SearchError('Arquivo grande demais.');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cartucho-'));
  const file = path.join(dir, `download${ext}`);
  fs.writeFileSync(file, buf);
  return file;
}

// Só baixa de endereços que a própria busca devolveu.
function checkHost(url, hosts) {
  let u;
  try {
    u = new URL(url);
  } catch {
    throw new SearchError('Endereço inválido.');
  }
  if (u.protocol !== 'https:' || !hosts.some((h) => u.hostname === h || u.hostname.endsWith(`.${h}`))) throw new SearchError('Endereço inválido.');
  return u.href;
}

async function downloadImage(url) {
  const href = checkHost(url, ['steamgriddb.com']);
  return download(href, extOf(href, '.png'));
}

// A faixa é a página do KHInsider; o MP3 fica em outro servidor, que muda de álbum para álbum.
async function downloadTrack(trackId) {
  if (!/^\/game-soundtracks\/album\/[^"<>]+$/.test(trackId)) throw new SearchError('Faixa inválida.');
  const { html } = await page(KHI + trackId);
  const mp3 = parseSongUrl(html);
  if (!mp3 || !mp3.startsWith('https://')) throw new SearchError('Não achei o arquivo desta faixa.');
  return download(mp3, extOf(mp3, '.mp3'));
}

function cleanup(file) {
  if (file) fs.rmSync(path.dirname(file), { recursive: true, force: true });
}

module.exports = { images, albums, tracks, downloadImage, downloadTrack, cleanup, searchTerm, parseAlbums, parseTracks, parseSongUrl, pickImages, SearchError };
