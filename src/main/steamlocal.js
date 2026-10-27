// O que a Steam tem instalado neste PC: lê as pastas de biblioteca e os appmanifest_*.acf de cada jogo.
// É assim que o Cartucho sabe se um jogo está instalado e acompanha os downloads sem precisar da API.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

// Bits do StateFlags do appmanifest (EAppState da Steam).
const FLAG = {
  installed: 4,
  updateRunning: 256,
  updatePaused: 512,
  updateStarted: 1024,
  downloading: 1048576,
  staging: 2097152,
  committing: 4194304,
};

// Formato KeyValues (VDF) da Valve: "chave" "valor" e "chave" { ... }.
function parseVdf(text) {
  const tokens = [];
  const re = /"((?:\\.|[^"\\])*)"|([{}])|\/\/[^\n]*/g;
  let m;
  while ((m = re.exec(text))) {
    if (m[1] !== undefined) tokens.push({ str: m[1].replace(/\\(.)/g, (_, c) => (c === 'n' ? '\n' : c === 't' ? '\t' : c)) });
    else if (m[2]) tokens.push({ brace: m[2] });
  }
  let i = 0;
  const obj = () => {
    const out = {};
    while (i < tokens.length) {
      const t = tokens[i++];
      if (t.brace === '}') return out;
      if (t.str === undefined) continue;
      const next = tokens[i++];
      if (!next) break;
      out[t.str] = next.brace === '{' ? obj() : next.str;
    }
    return out;
  };
  return obj();
}

function steamDir() {
  if (process.platform === 'win32') {
    try {
      const out = execFileSync('reg', ['query', 'HKCU\\Software\\Valve\\Steam', '/v', 'SteamPath'], { encoding: 'utf8', windowsHide: true });
      const m = out.match(/SteamPath\s+REG_SZ\s+(.+)/);
      if (m) return path.normalize(m[1].trim());
    } catch {}
    return 'C:\\Program Files (x86)\\Steam';
  }
  return path.join(require('node:os').homedir(), '.steam', 'steam');
}

// Pastas de biblioteca: a da própria Steam e as que a pessoa adicionou em outros discos.
function libraryDirs(root) {
  const dirs = new Set([path.normalize(root)]);
  try {
    const data = parseVdf(fs.readFileSync(path.join(root, 'steamapps', 'libraryfolders.vdf'), 'utf8'));
    const folders = data.libraryfolders || data.LibraryFolders || {};
    for (const v of Object.values(folders)) {
      const p = typeof v === 'string' ? v : v && v.path;
      if (p && /[\\/]/.test(p)) dirs.add(path.normalize(p));
    }
  } catch {}
  return [...dirs];
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

// Estado de um appmanifest: instalado, baixando (com porcentagem), pausado ou na fila.
function appState(manifest) {
  const flags = num(manifest.StateFlags);
  const toDownload = num(manifest.BytesToDownload);
  const downloaded = num(manifest.BytesDownloaded);
  const installed = (flags & FLAG.installed) !== 0;
  const busy = (flags & (FLAG.updateRunning | FLAG.updateStarted | FLAG.downloading | FLAG.staging | FLAG.committing | FLAG.updatePaused)) !== 0;
  let download = null;
  if (busy || (!installed && toDownload > 0)) {
    const paused = (flags & FLAG.updatePaused) !== 0;
    const running = (flags & (FLAG.downloading | FLAG.staging | FLAG.committing | FLAG.updateRunning)) !== 0;
    download = {
      state: paused ? 'paused' : running ? 'downloading' : 'queued',
      percent: toDownload > 0 ? Math.min(100, Math.floor((downloaded / toDownload) * 100)) : 0,
      bytes: downloaded,
      total: toDownload,
      update: installed,
    };
  }
  return { installed, download };
}

function scanApps(root = steamDir()) {
  const apps = new Map();
  for (const lib of libraryDirs(root)) {
    const dir = path.join(lib, 'steamapps');
    let files = [];
    try { files = fs.readdirSync(dir); } catch { continue; }
    for (const f of files) {
      if (!/^appmanifest_\d+\.acf$/.test(f)) continue;
      try {
        const m = parseVdf(fs.readFileSync(path.join(dir, f), 'utf8')).AppState;
        if (!m || !m.appid) continue;
        apps.set(Number(m.appid), { appid: Number(m.appid), name: m.name || '', size: num(m.SizeOnDisk), library: lib, dir: m.installdir ? path.join(dir, 'common', m.installdir) : null, ...appState(m) });
      } catch {}
    }
  }
  return apps;
}

module.exports = { parseVdf, appState, libraryDirs, scanApps, steamDir, FLAG };
