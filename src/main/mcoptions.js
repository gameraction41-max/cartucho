// Presets gráficos do Minecraft: mexe só nas linhas de vídeo do options.txt de cada instância e mantém o resto.
const fs = require('node:fs');
const path = require('node:path');

// Valores no formato que o Minecraft 1.19+ grava. Versões antigas usam fancyGraphics no lugar de graphicsMode.
const PRESETS = {
  desempenho: {
    label: 'Desempenho',
    desc: 'Mais FPS: sombras, reflexos e efeitos mais leves',
    values: { renderDistance: '8', simulationDistance: '6', graphicsMode: '0', particles: '2', renderClouds: '"false"', entityShadows: 'false', ao: 'false', biomeBlendRadius: '0', mipmapLevels: '0', maxFps: '260', enableVsync: 'false', entityDistanceScaling: '0.75' },
  },
  equilibrado: {
    label: 'Equilibrado',
    desc: 'Bonito e fluido: o meio-termo de cada jogo',
    values: { renderDistance: '12', simulationDistance: '10', graphicsMode: '1', particles: '1', renderClouds: '"fast"', entityShadows: 'true', ao: 'true', biomeBlendRadius: '2', mipmapLevels: '2', maxFps: '144', enableVsync: 'false', entityDistanceScaling: '1.0' },
  },
  qualidade: {
    label: 'Qualidade',
    desc: 'Tudo no alto, no limite do que a placa de vídeo segura',
    values: { renderDistance: '20', simulationDistance: '12', graphicsMode: '2', particles: '0', renderClouds: '"true"', entityShadows: 'true', ao: 'true', biomeBlendRadius: '4', mipmapLevels: '4', maxFps: '260', enableVsync: 'true', entityDistanceScaling: '1.25' },
  },
};

function parse(text) {
  const entries = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line) continue;
    const i = line.indexOf(':');
    entries.push(i < 0 ? { raw: line } : { key: line.slice(0, i), value: line.slice(i + 1) });
  }
  return entries;
}

function serialize(entries) {
  return entries.map((e) => (e.raw != null ? e.raw : `${e.key}:${e.value}`)).join('\n') + '\n';
}

// O gráfico "Fabuloso" não funciona com Sodium, Iris, Embeddium, Rubidium nem OptiFine (eles caem no rápido ou
// desligam os shaders). Nessas instâncias o Qualidade usa o "Bonito".
const NO_FABULOUS = /^(sodium|iris|embeddium|rubidium|optifine)/i;

function presetValues(presetId, { fabulous = true } = {}) {
  const preset = PRESETS[presetId];
  if (!preset) throw new Error(`Preset desconhecido: ${presetId}`);
  const values = { ...preset.values };
  if (!fabulous && values.graphicsMode === '2') values.graphicsMode = '1';
  return values;
}

// Aplica o preset em cima do options.txt existente. Linhas que não são de vídeo ficam como estavam.
function applyPreset(text, presetId, opts) {
  const values = presetValues(presetId, opts);
  const entries = parse(text || '');
  const byKey = new Map(entries.filter((e) => e.key).map((e) => [e.key, e]));
  // Versões antigas (até 1.15) usam fancyGraphics:true/false em vez de graphicsMode.
  if (byKey.has('fancyGraphics') && !byKey.has('graphicsMode')) {
    byKey.get('fancyGraphics').value = values.graphicsMode === '0' ? 'false' : 'true';
    delete values.graphicsMode;
  }
  for (const [key, value] of Object.entries(values)) {
    const entry = byKey.get(key);
    if (entry) entry.value = value;
    else entries.push({ key, value });
  }
  return serialize(entries);
}

// Descobre qual preset está em uso, olhando só as chaves que mais pesam. null quando é personalizado.
function detectPreset(text, opts) {
  if (!text) return null;
  const map = new Map(parse(text).filter((e) => e.key).map((e) => [e.key, e.value]));
  const keys = ['renderDistance', 'simulationDistance', 'graphicsMode', 'particles'];
  for (const id of Object.keys(PRESETS)) {
    const values = presetValues(id, opts);
    if (keys.every((k) => !map.has(k) || map.get(k) === values[k]) && keys.some((k) => map.has(k))) return id;
  }
  return null;
}

function optionsFile(instDir) {
  for (const sub of ['minecraft', '.minecraft']) {
    const dir = path.join(instDir, sub);
    if (fs.existsSync(dir)) return path.join(dir, 'options.txt');
  }
  return path.join(instDir, 'minecraft', 'options.txt');
}

// Olha a pasta mods da instância para saber se o "Fabuloso" pode ser usado.
function instanceOpts(instDir) {
  let mods = [];
  try { mods = fs.readdirSync(path.join(path.dirname(optionsFile(instDir)), 'mods')); } catch {}
  return { fabulous: !mods.some((m) => NO_FABULOUS.test(m)) };
}

function readPreset(instDir) {
  try {
    return detectPreset(fs.readFileSync(optionsFile(instDir), 'utf8'), instanceOpts(instDir));
  } catch {
    return null;
  }
}

// Guarda uma cópia do options.txt original na primeira vez, para dar para desfazer na mão.
function writePreset(instDir, presetId) {
  const file = optionsFile(instDir);
  let text = '';
  try {
    text = fs.readFileSync(file, 'utf8');
    const backup = `${file}.cartucho-backup`;
    if (!fs.existsSync(backup)) fs.writeFileSync(backup, text);
  } catch {}
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, applyPreset(text, presetId, instanceOpts(instDir)));
  return presetId;
}

const PRESET_LIST = Object.entries(PRESETS).map(([id, p]) => ({ id, label: p.label, desc: p.desc }));

module.exports = { PRESET_LIST, applyPreset, detectPreset, readPreset, writePreset, optionsFile };
