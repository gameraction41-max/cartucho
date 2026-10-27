// Presets gráficos dos jogos da Steam. Cada jogo guarda as opções de vídeo num arquivo próprio, então cada jogo
// suportado tem uma receita: onde fica o arquivo, o formato e os valores de cada preset. Jogos em Unreal Engine são
// reconhecidos sozinhos pela pasta de instalação; os outros entram à mão no CATALOG.
// Antes da primeira mudança, o arquivo original é copiado para a pasta do Cartucho e pode ser restaurado.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// ===== formatos =====

// INI: mexe só nas chaves do preset, na seção certa, e mantém o resto do arquivo como estava.
const ini = {
  get(text, section, key) {
    let current = '';
    for (const line of text.split(/\r?\n/)) {
      const s = line.match(/^\s*\[(.+)\]\s*$/);
      if (s) { current = s[1]; continue; }
      if (current !== section) continue;
      const i = line.indexOf('=');
      if (i > 0 && line.slice(0, i).trim() === key) return line.slice(i + 1).trim();
    }
    return null;
  },
  set(text, values) {
    const eol = text.includes('\r\n') ? '\r\n' : '\n';
    const lines = text.length ? text.split(/\r?\n/) : [];
    for (const [section, pairs] of Object.entries(values)) {
      let start = lines.findIndex((l) => l.trim() === `[${section}]`);
      if (start < 0) {
        if (lines.length && lines[lines.length - 1].trim() !== '') lines.push('');
        lines.push(`[${section}]`);
        start = lines.length - 1;
      }
      let end = start + 1;
      while (end < lines.length && !/^\s*\[.+\]\s*$/.test(lines[end])) end++;
      for (const [key, value] of Object.entries(pairs)) {
        const at = lines.slice(start + 1, end).findIndex((l) => { const i = l.indexOf('='); return i > 0 && l.slice(0, i).trim() === key; });
        if (at >= 0) {
          lines[start + 1 + at] = `${key}=${value}`;
        } else {
          // Entra antes das linhas em branco do fim da seção, para não colar na seção seguinte.
          let pos = end;
          while (pos > start + 1 && lines[pos - 1].trim() === '') pos--;
          lines.splice(pos, 0, `${key}=${value}`);
          end++;
        }
      }
    }
    return lines.join(eol) + (text.endsWith('\n') || !text ? eol : '');
  },
  matches(text, values) {
    return Object.entries(values).every(([section, pairs]) => Object.entries(pairs).every(([k, v]) => ini.get(text, section, k) === String(v)));
  },
};

// JSON: chaves com pontos viram caminhos ("video.quality").
const json = {
  read(text) {
    try { return JSON.parse(text); } catch { return {}; }
  },
  set(text, values) {
    const data = text.trim() ? JSON.parse(text) : {};
    for (const [dotted, value] of Object.entries(values)) {
      const keys = dotted.split('.');
      let obj = data;
      for (const k of keys.slice(0, -1)) obj = obj[k] && typeof obj[k] === 'object' ? obj[k] : (obj[k] = {});
      obj[keys[keys.length - 1]] = value;
    }
    return JSON.stringify(data, null, 2);
  },
  matches(text, values) {
    const data = json.read(text);
    return Object.entries(values).every(([dotted, value]) => dotted.split('.').reduce((o, k) => (o == null ? o : o[k]), data) === value);
  },
};

const FORMATS = { ini, json };

// ===== receitas =====

// Jogos em Unreal Engine guardam tudo no GameUserSettings.ini, com os grupos de escala de 0 (baixo) a 3 (épico).
const UE_GROUPS = ['ViewDistanceQuality', 'AntiAliasingQuality', 'ShadowQuality', 'GlobalIlluminationQuality', 'ReflectionQuality', 'PostProcessQuality', 'TextureQuality', 'EffectsQuality', 'FoliageQuality', 'ShadingQuality'];
const UE_LEVEL = { desempenho: 1, equilibrado: 2, qualidade: 3 };

const UE_FOLDERS = ['Windows', 'WindowsNoEditor', 'WindowsClient'];

function unreal(project, { folders = UE_FOLDERS } = {}) {
  const scal = (level) => ({ 'ScalabilityGroups': Object.fromEntries([['sg.ResolutionQuality', '100'], ...UE_GROUPS.map((g) => [`sg.${g}`, String(level)])]) });
  return {
    format: 'ini',
    engine: 'Unreal Engine',
    files: folders.flatMap((f) => [
      `%LOCALAPPDATA%/${project}/Saved/Config/${f}/GameUserSettings.ini`,
      `%DOCUMENTS%/My Games/${project}/Saved/Config/${f}/GameUserSettings.ini`,
    ]),
    presets: Object.fromEntries(Object.entries(UE_LEVEL).map(([id, level]) => [id, scal(level)])),
  };
}

// appid -> receita feita à mão, para jogos que a detecção automática não pega.
const CATALOG = {};

// Detecção automática: um jogo em Unreal Engine tem, dentro da pasta de instalação, uma pasta com o nome do projeto
// (com Binaries/Win64 ou Content/Paks). As opções dele ficam em %LOCALAPPDATA%/<projeto>/Saved/Config.
function detectUnreal(dir, env) {
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return null; }
  for (const e of entries) {
    if (!e.isDirectory() || e.name === 'Engine') continue;
    const base = path.join(dir, e.name);
    if (!fs.existsSync(path.join(base, 'Binaries', 'Win64')) && !fs.existsSync(path.join(base, 'Content', 'Paks'))) continue;
    const recipe = unreal(e.name);
    if (findFile(recipe, env)) return recipe;
  }
  return null;
}

// Pasta de instalação de cada jogo, fornecida pelo main.js (vem do downloads.js).
let installDir = () => null;
const detected = new Map(); // appid -> { recipe, at }
const DETECT_TTL = 10 * 60 * 1000;

function setInstallDir(fn) {
  installDir = fn;
}

function recipeFor(appid, { catalog = CATALOG, env, dir } = {}) {
  if (catalog[appid]) return catalog[appid];
  if (catalog !== CATALOG && !dir) return null;
  const cached = detected.get(appid);
  if (!dir && cached && Date.now() - cached.at < DETECT_TTL) return cached.recipe;
  const d = dir || installDir(appid);
  const recipe = d ? detectUnreal(d, env) : null;
  if (!dir) detected.set(appid, { recipe, at: Date.now() });
  return recipe;
}

// ===== arquivos =====

function expand(p, env = process.env) {
  const home = env.USERPROFILE || os.homedir();
  const vars = {
    LOCALAPPDATA: env.LOCALAPPDATA || path.join(home, 'AppData', 'Local'),
    APPDATA: env.APPDATA || path.join(home, 'AppData', 'Roaming'),
    LOCALLOW: path.join(home, 'AppData', 'LocalLow'),
    USERPROFILE: home,
    DOCUMENTS: path.join(home, 'Documents'),
    SAVEDGAMES: path.join(home, 'Saved Games'),
  };
  return path.normalize(p.replace(/%(\w+)%/g, (m, name) => vars[name] || m));
}

function findFile(recipe, env) {
  return recipe.files.map((f) => expand(f, env)).find((f) => fs.existsSync(f)) || null;
}

let backupDir = () => path.join(os.tmpdir(), 'cartucho-backups');

function setBackupDir(fn) {
  backupDir = fn;
}

function backupPath(appid, file) {
  return path.join(backupDir(), `steam-${appid}-${path.basename(file)}.original`);
}

// ===== API =====

const supported = (appid) => !!recipeFor(appid);

function read(appid, opts = {}) {
  const recipe = recipeFor(appid, opts);
  const { env } = opts;
  if (!recipe) return null;
  const file = findFile(recipe, env);
  if (!file) return { found: false, preset: null, canRestore: false };
  const text = fs.readFileSync(file, 'utf8');
  const fmt = FORMATS[recipe.format];
  const preset = Object.keys(recipe.presets).find((id) => fmt.matches(text, recipe.presets[id])) || null;
  return { found: true, preset, canRestore: fs.existsSync(backupPath(appid, file)), engine: recipe.engine || null };
}

function write(appid, presetId, opts = {}) {
  const recipe = recipeFor(appid, opts);
  const { env } = opts;
  if (!recipe || !recipe.presets[presetId]) throw new Error('Este jogo ainda não tem presets no Cartucho.');
  const file = findFile(recipe, env);
  if (!file) throw new Error('Não achei o arquivo de configuração. Abra o jogo uma vez e feche, para ele criar o arquivo.');
  const text = fs.readFileSync(file, 'utf8');
  const backup = backupPath(appid, file);
  if (!fs.existsSync(backup)) {
    fs.mkdirSync(path.dirname(backup), { recursive: true });
    fs.copyFileSync(file, backup);
  }
  fs.writeFileSync(file, FORMATS[recipe.format].set(text, recipe.presets[presetId]));
  return presetId;
}

function restore(appid, opts = {}) {
  const recipe = recipeFor(appid, opts);
  const { env } = opts;
  const file = recipe && findFile(recipe, env);
  if (!file) throw new Error('Não achei o arquivo de configuração deste jogo.');
  const backup = backupPath(appid, file);
  if (!fs.existsSync(backup)) throw new Error('Não há backup: o Cartucho ainda não mexeu neste jogo.');
  fs.copyFileSync(backup, file);
  fs.rmSync(backup);
}

module.exports = { CATALOG, supported, recipeFor, setInstallDir, detectUnreal, read, write, restore, setBackupDir, unreal, expand, ini, json };
