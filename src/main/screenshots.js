// Capturas de tela e clipes tirados nos jogos: os da Barra de Jogo do Windows (Vídeos\Capturas), os da Steam (F12)
// e os do Minecraft (F2) de cada instância do Prism.
// Tudo é agrupado por jogo, do mais recente para o mais antigo.
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const IMAGE = /\.(png|jpe?g|webp|bmp|gif)$/i;
const VIDEO = /\.(mp4|webm)$/i;
const MAX_PER_DIR = 2000;

// "Hades II 2026-10-27 22-08-55.png" (Windows 11) ou "Hades II 10_27_2026 10_08_55 PM.png" (Windows 10).
const GAMEBAR_DATE = /\s+(\d{4}[-_.]\d{1,2}[-_.]\d{1,2}|\d{1,2}[-_.]\d{1,2}[-_.]\d{4})\s+\d{1,2}[-_.]\d{2}[-_.]\d{2}.*$/;

function gamebarTitle(file) {
  const base = path.parse(file).name;
  const title = base.replace(GAMEBAR_DATE, '').replace(/\s+Screenshot$/i, '').trim();
  return title && title !== base ? title : null;
}

// Para achar o jogo da biblioteca pelo nome da janela: "HADES II" e "Hades II™" viram a mesma coisa.
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

// games: [{ key, title, appid? }] da biblioteca; instances: [{ id, name, dir }] do Prism.
function scan({ gamebarDir, steamRoot, instances = [], games = [], steamNames = new Map() } = {}) {
  const groups = new Map();
  const byTitle = new Map(games.map((g) => [norm(g.title), g]));
  const add = (key, title, s, gameKey = null) => {
    if (!groups.has(key)) groups.set(key, { key, title, gameKey, shots: [] });
    groups.get(key).shots.push(s);
  };

  if (steamRoot) {
    for (const { appid, shot: s } of steamShots(steamRoot)) {
      const g = games.find((x) => x.appid === appid);
      add(`steam:${appid}`, g ? g.title : steamNames.get(appid) || `Jogo ${appid}`, s, g ? g.key : null);
    }
  }
  if (gamebarDir) {
    for (const f of listFiles(gamebarDir, new RegExp(`${IMAGE.source}|${VIDEO.source}`, 'i'))) {
      const title = gamebarTitle(f.file);
      const g = title && byTitle.get(norm(title));
      // Só entra o que foi tirado num jogo da biblioteca. Área de trabalho, navegador e outros programas ficam de fora.
      if (g) add(g.key, g.title, shot(f, 'windows'), g.key);
      else if (title && /^minecraft/i.test(title)) add('minecraft', 'Minecraft', shot(f, 'windows'));
    }
  }
  for (const inst of instances) {
    for (const sub of ['minecraft', '.minecraft']) {
      const files = listFiles(path.join(inst.dir, sub, 'screenshots'), IMAGE);
      for (const f of files) add(`prism:${inst.id}`, inst.name, shot(f, 'minecraft'), `prism:${inst.id}`);
    }
  }

  const list = [...groups.values()];
  for (const g of list) g.shots.sort((a, b) => b.at - a.at);
  return list.sort((a, b) => b.shots[0].at - a.shots[0].at);
}

module.exports = { scan, gamebarTitle };
