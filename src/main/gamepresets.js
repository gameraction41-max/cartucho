// Presets gráficos dos jogos da Steam. Cada jogo guarda as opções de vídeo num arquivo próprio, então cada jogo
// suportado tem uma receita: onde fica o arquivo, o formato e os valores de cada preset. Jogos em Unreal Engine são
// reconhecidos sozinhos pela pasta de instalação; os outros entram à mão no CATALOG (RDR2, Euro Truck 2 e
// Cyberpunk 2077, desde a 0.10.3).
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

// Formatos "planos": cada jogo tem um jeito de escrever chave e valor, mas a regra é a mesma. Só troca o que já existe
// no arquivo (o jogo escreve todas as opções dele ao salvar), para não inventar chaves que uma versão nova não conhece.
// Se nada bater, o arquivo é de um formato diferente do esperado e nada é gravado.
function flat({ get, put }) {
  return {
    get,
    set(text, values) {
      let out = text;
      let hits = 0;
      for (const [key, value] of Object.entries(values)) {
        const next = put(out, key, String(value));
        if (next == null) continue;
        out = next;
        hits++;
      }
      if (!hits) throw new Error('O arquivo de opções deste jogo está diferente do que o Cartucho conhece. Nada foi mudado.');
      return out;
    },
    // Bate quando todas as chaves que existem no arquivo estão com o valor do preset (e pelo menos uma existe).
    matches(text, values) {
      const found = Object.entries(values).map(([k, v]) => [get(text, k), String(v)]).filter(([cur]) => cur != null);
      return found.length > 0 && found.every(([cur, v]) => cur === v);
    },
  };
}

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Euro Truck Simulator 2 (config.cfg): uset r_sun_shadow_quality "3"
const cfg = flat({
  get(text, key) {
    const m = text.match(new RegExp(`^\\s*uset\\s+${escape(key)}\\s+"([^"]*)"`, 'm'));
    return m ? m[1] : null;
  },
  put(text, key, value) {
    const re = new RegExp(`^(\\s*uset\\s+${escape(key)}\\s+)"[^"]*"`, 'm');
    return re.test(text) ? text.replace(re, (_m, head) => `${head}"${value}"`) : null;
  },
});

// Red Dead Redemption 2 (system.xml): <shadowQuality>kSettingLevel_High</shadowQuality> ou <msaa value="0" />
const xml = flat({
  get(text, key) {
    const k = escape(key);
    const m = text.match(new RegExp(`<${k}>([^<]*)</${k}>`)) || text.match(new RegExp(`<${k}\\s+value="([^"]*)"\\s*/>`));
    return m ? m[1] : null;
  },
  put(text, key, value) {
    const k = escape(key);
    const inner = new RegExp(`(<${k}>)[^<]*(</${k}>)`);
    if (inner.test(text)) return text.replace(inner, (_m, a, b) => `${a}${value}${b}`);
    const attr = new RegExp(`(<${k}\\s+value=")[^"]*("\\s*/>)`);
    return attr.test(text) ? text.replace(attr, (_m, a, b) => `${a}${value}${b}`) : null;
  },
});

// Cyberpunk 2077 (UserSettings.json): { data: [{ group_name: "/graphics/advanced", options: [{ name, type, value }] }] }.
// A chave é "grupo/nome", e o valor só troca se for do mesmo tipo do que o jogo gravou.
function cpOption(data, key) {
  const i = key.lastIndexOf('/');
  const group = (data.data || []).find((g) => g && g.group_name === key.slice(0, i));
  return group && Array.isArray(group.options) ? group.options.find((o) => o && o.name === key.slice(i + 1)) || null : null;
}

const cpjson = {
  get(text, key) {
    const opt = cpOption(json.read(text), key);
    return opt ? opt.value : null;
  },
  set(text, values) {
    const data = JSON.parse(text);
    let hits = 0;
    for (const [key, value] of Object.entries(values)) {
      const opt = cpOption(data, key);
      if (!opt || typeof opt.value !== typeof value) continue;
      opt.value = value;
      hits++;
    }
    if (!hits) throw new Error('O arquivo de opções deste jogo está diferente do que o Cartucho conhece. Nada foi mudado.');
    const indent = (text.match(/\n([ \t]+)\S/) || [, '  '])[1];
    const eol = text.includes('\r\n') ? '\r\n' : '\n';
    return JSON.stringify(data, null, indent).replace(/\n/g, eol);
  },
  matches(text, values) {
    const data = json.read(text);
    const found = Object.entries(values).map(([k, v]) => [cpOption(data, k), v]).filter(([o]) => o);
    return found.length > 0 && found.every(([o, v]) => o.value === v);
  },
};

const FORMATS = { ini, json, cfg, xml, cpjson };

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

// Monta os três presets a partir de uma tabela chave -> [desempenho, equilibrado, qualidade].
function levels(table) {
  const ids = ['desempenho', 'equilibrado', 'qualidade'];
  return Object.fromEntries(ids.map((id, i) => [id, Object.fromEntries(Object.entries(table).map(([k, v]) => [k, v[i]]))]));
}

// Red Dead Redemption 2: o "Qualidade" fica no alto, e não no ultra, porque é o que uma placa de 8 GB segura
// a 60 FPS. Texturas ficam no ultra em todos, porque só pesam na memória de vídeo.
const RDR = (l) => `kSettingLevel_${l}`;
const rdr2 = {
  format: 'xml',
  engine: 'RAGE',
  files: ['%DOCUMENTS%/Rockstar Games/Red Dead Redemption 2/Settings/system.xml'],
  presets: levels({
    textureQuality: [RDR('High'), RDR('Ultra'), RDR('Ultra')],
    shadowQuality: [RDR('Medium'), RDR('High'), RDR('High')],
    farShadowQuality: [RDR('Low'), RDR('Medium'), RDR('High')],
    reflectionQuality: [RDR('Low'), RDR('Medium'), RDR('High')],
    mirrorQuality: [RDR('Low'), RDR('Medium'), RDR('High')],
    ssao: [RDR('Medium'), RDR('Medium'), RDR('High')],
    tessellation: [RDR('Low'), RDR('Medium'), RDR('High')],
    particleQuality: [RDR('Low'), RDR('Medium'), RDR('High')],
    volumetricsQuality: [RDR('Low'), RDR('Medium'), RDR('High')],
    lightingQuality: [RDR('Medium'), RDR('High'), RDR('High')],
    ambientLightingQuality: [RDR('Medium'), RDR('Medium'), RDR('High')],
    taa: [RDR('Medium'), RDR('High'), RDR('High')],
    fxaaEnabled: ['false', 'false', 'false'],
    msaa: ['0', '0', '0'],
  }),
  notes: {
    desempenho: 'Sombras e volumétricos leves, texturas no alto',
    equilibrado: 'Texturas no ultra, sombras e luz no alto',
    qualidade: 'Quase tudo no alto, texturas no ultra, sem MSAA',
  },
};

// Euro Truck Simulator 2: as opções ficam em Documentos/Euro Truck Simulator 2/config.cfg.
const ets2 = {
  format: 'cfg',
  engine: 'Prism3D',
  files: ['%DOCUMENTS%/Euro Truck Simulator 2/config.cfg'],
  presets: levels({
    r_sun_shadow_quality: ['1', '3', '4'],
    r_sun_shadow_texture_size: ['2048', '4096', '4096'],
    r_cloud_shadows: ['0', '1', '1'],
    r_ssao: ['0', '1', '3'],
    g_vegetation_detail: ['0', '1', '2'],
    g_light_distance_factor: ['1', '2', '3'],
  }),
  notes: {
    desempenho: 'Sombras baixas, sem oclusão de ambiente',
    equilibrado: 'Sombras altas e luzes vistas de mais longe',
    qualidade: 'Sombras no máximo, vegetação cheia',
  },
};

// Cyberpunk 2077: avançadas do UserSettings.json, sem ray tracing (na 4060 ele só vale com DLSS no desempenho).
const CP = '/graphics/advanced/';
const cyberpunk = {
  format: 'cpjson',
  engine: 'REDengine',
  files: ['%LOCALAPPDATA%/CD Projekt Red/Cyberpunk 2077/UserSettings.json'],
  presets: levels({
    [`${CP}ContactShadows`]: [false, true, true],
    [`${CP}CascadedShadowsRange`]: ['Low', 'Medium', 'High'],
    [`${CP}CascadedShadowsResolution`]: ['Low', 'Medium', 'High'],
    [`${CP}DistantShadowsResolution`]: ['Low', 'High', 'High'],
    [`${CP}LocalShadowsQuality`]: ['Low', 'Medium', 'High'],
    [`${CP}VolumetricFogResolution`]: ['Low', 'Medium', 'High'],
    [`${CP}VolumetricCloudsQuality`]: ['Medium', 'Medium', 'High'],
    [`${CP}ScreenSpaceReflectionsQuality`]: ['Low', 'Medium', 'High'],
    [`${CP}SubsurfaceScatteringQuality`]: ['Low', 'Medium', 'High'],
    [`${CP}AmbientOcclusion`]: ['Low', 'Medium', 'High'],
    [`${CP}MirrorQuality`]: ['Low', 'Medium', 'High'],
    [`${CP}ColorPrecision`]: ['Medium', 'High', 'High'],
  }),
  notes: {
    desempenho: 'Sombras, névoa e reflexos no baixo',
    equilibrado: 'Médio, com sombras distantes no alto',
    qualidade: 'Alto, sem ray tracing',
  },
};

// appid -> receita feita à mão, para jogos que a detecção automática não pega.
// Cada lista nova que o Filipi manda entra aqui e sai num patch.
const CATALOG = {
  1174180: rdr2, // Red Dead Redemption 2
  227300: ets2, // Euro Truck Simulator 2
  1091500: cyberpunk, // Cyberpunk 2077
};

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
    if (findFile(recipe, env, dir)) return recipe;
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

function expand(p, env = process.env, install = null) {
  const home = env.USERPROFILE || os.homedir();
  const vars = {
    INSTALL: install,
    LOCALAPPDATA: env.LOCALAPPDATA || path.join(home, 'AppData', 'Local'),
    APPDATA: env.APPDATA || path.join(home, 'AppData', 'Roaming'),
    LOCALLOW: path.join(home, 'AppData', 'LocalLow'),
    USERPROFILE: home,
    DOCUMENTS: path.join(home, 'Documents'),
    SAVEDGAMES: path.join(home, 'Saved Games'),
  };
  return path.normalize(p.replace(/%(\w+)%/g, (m, name) => vars[name] || m));
}

// Caminhos com %INSTALL% só valem quando a pasta de instalação do jogo é conhecida.
function findFile(recipe, env, install) {
  return recipe.files.filter((f) => install || !f.includes('%INSTALL%')).map((f) => expand(f, env, install)).find((f) => fs.existsSync(f)) || null;
}

const installOf = (appid, opts) => opts.dir || installDir(appid);

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
  const file = findFile(recipe, env, installOf(appid, opts));
  if (!file) return { found: false, preset: null, canRestore: false };
  const text = fs.readFileSync(file, 'utf8');
  const fmt = FORMATS[recipe.format];
  const preset = Object.keys(recipe.presets).find((id) => fmt.matches(text, recipe.presets[id])) || null;
  const out = { found: true, preset, canRestore: fs.existsSync(backupPath(appid, file)), engine: recipe.engine || null };
  if (recipe.notes) out.notes = recipe.notes;
  return out;
}

function write(appid, presetId, opts = {}) {
  const recipe = recipeFor(appid, opts);
  const { env } = opts;
  if (!recipe || !recipe.presets[presetId]) throw new Error('Este jogo ainda não tem presets no Cartucho.');
  const file = findFile(recipe, env, installOf(appid, opts));
  if (!file) throw new Error('Não achei o arquivo de configuração. Abra o jogo uma vez e feche, para ele criar o arquivo.');
  const text = fs.readFileSync(file, 'utf8');
  // O texto novo sai antes do backup: se o arquivo for de um formato desconhecido, nada é tocado.
  const next = FORMATS[recipe.format].set(text, recipe.presets[presetId]);
  const backup = backupPath(appid, file);
  if (!fs.existsSync(backup)) {
    fs.mkdirSync(path.dirname(backup), { recursive: true });
    fs.copyFileSync(file, backup);
  }
  fs.writeFileSync(file, next);
  return presetId;
}

function restore(appid, opts = {}) {
  const recipe = recipeFor(appid, opts);
  const { env } = opts;
  const file = recipe && findFile(recipe, env, installOf(appid, opts));
  if (!file) throw new Error('Não achei o arquivo de configuração deste jogo.');
  const backup = backupPath(appid, file);
  if (!fs.existsSync(backup)) throw new Error('Não há backup: o Cartucho ainda não mexeu neste jogo.');
  fs.copyFileSync(backup, file);
  fs.rmSync(backup);
}

module.exports = { CATALOG, supported, recipeFor, setInstallDir, detectUnreal, read, write, restore, setBackupDir, unreal, expand, ini, json, cfg, xml, cpjson };
