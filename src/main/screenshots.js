// Galeria: os prints e vídeos que o Cartucho fez (Imagens\Cartucho e Vídeos\Cartucho) e os prints da Steam (F12).
// Tudo é agrupado por jogo, do mais recente para o mais antigo.
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL, fileURLToPath } = require('node:url');

const IMAGE = /\.(png|jpe?g|webp|bmp|gif)$/i;
const VIDEO = /\.(mp4|webm)$/i;
const MEDIA = /\.(png|jpe?g|webp|bmp|gif|mp4|webm)$/i;
const MAX_PER_DIR = 2000;

// Nome do jogo que dá para usar como pasta e arquivo no Windows.
function safeName(title) {
  const name = String(title || 'Jogo').replace(/[<>:"/\\|?*\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().replace(/[. ]+$/, '');
  return (name || 'Jogo').slice(0, 80);
}

// Para achar o jogo da biblioteca pelo nome da pasta: "HADES II" e "Hades II™" viram a mesma coisa.
const norm = (s) => String(s).replace(/[™®©]/g, '').normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g, '');

function listFiles(dir, test) {
  let names;
  try { names = fs.readdirSync(dir); } catch { return []; }
  const out = [];
  for (const name of names) {
    if (!test.test(name)) continue;
    const file = path.join(dir, name);
    try {
      const st = fs.statSync(file);
      if (st.isFile()) out.push({ file, at: st.mtimeMs });
    } catch {}
  }
  return out.sort((a, b) => b.at - a.at).slice(0, MAX_PER_DIR);
}

const url = (file) => pathToFileURL(file).href;

function shot({ file, at }, source, thumb) {
  return { url: url(file), thumb: thumb && fs.existsSync(thumb) ? url(thumb) : null, at, video: VIDEO.test(file), source, name: path.basename(file) };
}

// Steam: userdata/<conta>/760/remote/<appid>/screenshots, com as miniaturas em thumbnails/.
function steamShots(steamRoot) {
  const out = [];
  const userdata = path.join(steamRoot, 'userdata');
  let accounts = [];
  try { accounts = fs.readdirSync(userdata); } catch { return out; }
  for (const acc of accounts) {
    const remote = path.join(userdata, acc, '760', 'remote');
    let apps = [];
    try { apps = fs.readdirSync(remote); } catch { continue; }
    for (const appid of apps) {
      if (!/^\d+$/.test(appid)) continue;
      const dir = path.join(remote, appid, 'screenshots');
      for (const f of listFiles(dir, IMAGE)) out.push({ appid: Number(appid), shot: shot(f, 'steam', path.join(dir, 'thumbnails', path.basename(f.file))) });
    }
  }
  return out;
}

// Pastas do Cartucho (Imagens\Cartucho e Vídeos\Cartucho): uma subpasta por jogo, com o nome dele.
function cartuchoShots(root) {
  let dirs = [];
  try { dirs = fs.readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name); } catch { return []; }
  return dirs.flatMap((name) => listFiles(path.join(root, name), MEDIA).map((f) => ({ folder: name, shot: shot(f, 'cartucho') })));
}

// games: [{ key, title, appid? }] da biblioteca. As pastas do Cartucho viram o jogo da biblioteca com o mesmo nome.
function scan({ cartuchoDirs = [], steamRoot, games = [], steamNames = new Map() } = {}) {
  const groups = new Map();
  const byTitle = new Map(games.map((g) => [norm(safeName(g.title)), g]));
  const add = (key, title, s, gameKey = null) => {
    if (!groups.has(key)) groups.set(key, { key, title, gameKey, shots: [] });
    groups.get(key).shots.push(s);
  };

  for (const root of cartuchoDirs) {
    for (const { folder, shot: s } of cartuchoShots(root)) {
      const g = byTitle.get(norm(folder));
      if (g) add(g.key, g.title, s, g.key);
      else add(`pasta:${norm(folder)}`, folder, s);
    }
  }
  if (steamRoot) {
    for (const { appid, shot: s } of steamShots(steamRoot)) {
      const g = games.find((x) => x.appid === appid);
      if (g) add(g.key, g.title, s, g.key);
      else add(`steam:${appid}`, steamNames.get(appid) || `Jogo ${appid}`, s);
    }
  }

  const list = [...groups.values()];
  for (const g of list) g.shots.sort((a, b) => b.at - a.at);
  return list.sort((a, b) => b.shots[0].at - a.shots[0].at);
}

// Para apagar: só aceita uma captura que a galeria mostra, dentro das pastas do Cartucho
// (<pasta>\<jogo>\arquivo) ou da Steam (userdata\<conta>\760\remote\<appid>\screenshots\arquivo).
// Devolve o arquivo e, na Steam, a miniatura dele; ou null se o endereço não for de uma captura.
function target(fileUrl, { cartuchoDirs = [], steamRoot } = {}) {
  let file;
  try { file = path.resolve(fileURLToPath(String(fileUrl))); } catch { return null; }
  if (!MEDIA.test(file)) return null;
  const dir = path.dirname(file);
  const same = (a, b) => path.relative(path.resolve(a), path.resolve(b)) === '';
  if (cartuchoDirs.some((root) => same(path.dirname(dir), root))) return { file, thumb: null };
  if (steamRoot && IMAGE.test(file) && path.basename(dir) === 'screenshots') {
    const app = path.dirname(dir);
    const remote = path.dirname(app);
    const account = path.dirname(path.dirname(remote));
    if (/^\d+$/.test(path.basename(app)) && path.basename(remote) === 'remote' && path.basename(path.dirname(remote)) === '760'
      && same(path.dirname(account), path.join(steamRoot, 'userdata'))) {
      return { file, thumb: path.join(dir, 'thumbnails', path.basename(file)) };
    }
  }
  return null;
}

module.exports = { scan, safeName, target };
