// Mods das instâncias do Prism Launcher: ver os instalados, procurar atualização e instalar novos pelo Modrinth.
// Os mods são reconhecidos pelo hash do .jar, então funciona também com mods que não vieram do Modrinth pelo Prism.
// Cada mod instalado ou atualizado ganha o arquivo .pw.toml em mods/.index, o mesmo que o Prism grava, para o Prism continuar sabendo de onde ele veio.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const API = 'https://api.modrinth.com/v2';
const UA = `gameraction41-max/cartucho/${require('../../package.json').version}`;
const LOADER_ID = { Fabric: 'fabric', Quilt: 'quilt', Forge: 'forge', NeoForge: 'neoforge' };
const PAGE = 30;
const MAX_DEPS = 20;
const MAX_BYTES = 200 * 1024 ** 2;

class ModError extends Error {}

// Quem apaga o arquivo velho. O main.js troca por shell.trashItem, para o mod ir para a Lixeira.
let trash = async (file) => fs.rmSync(file, { force: true });
function setTrash(fn) {
  trash = fn;
}

// ===== Modrinth =====

async function api(route, { method = 'GET', body } = {}) {
  let res;
  try {
    res = await fetch(API + route, {
      method,
      headers: { 'User-Agent': UA, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(20000),
    });
  } catch {
    throw new ModError('Sem conexão com o Modrinth. Confira sua internet.');
  }
  if (res.status === 404) return null;
  if (res.status === 429) throw new ModError('O Modrinth pediu para esperar um pouco. Tente de novo em um minuto.');
  if (!res.ok) throw new ModError(`O Modrinth respondeu com erro ${res.status}. Tente de novo daqui a pouco.`);
  return res.json();
}

const q = (value) => encodeURIComponent(JSON.stringify(value));

// Loader e versão da instância no formato do Modrinth. Vanilla e LiteLoader não têm mods por aqui.
function target(game) {
  const loader = LOADER_ID[game.loader];
  if (!loader || !game.mcVersion) return null;
  // O Quilt também carrega mods feitos para Fabric.
  return { loader, loaders: loader === 'quilt' ? ['quilt', 'fabric'] : [loader], mcVersion: game.mcVersion };
}

function requireTarget(game) {
  const t = target(game);
  if (!t) throw new ModError('Esta instância não tem Fabric, Forge, NeoForge nem Quilt. Troque o loader no Prism para usar mods.');
  return t;
}

// A versão mais nova que serve na instância: estável primeiro, beta ou alfa só se não houver estável.
function pickVersion(list) {
  if (!list || !list.length) return null;
  return list.find((v) => v.version_type === 'release') || list.find((v) => v.version_type === 'beta') || list[0];
}

function primaryFile(version) {
  const files = (version && version.files) || [];
  return files.find((f) => f.primary) || files[0] || null;
}

async function projects(ids) {
  if (!ids.length) return new Map();
  const list = (await api(`/projects?ids=${q(ids)}`)) || [];
  return new Map(list.map((p) => [p.id, p]));
}

// ===== arquivos da instância =====

function modsDir(instDir) {
  for (const sub of ['minecraft', '.minecraft']) {
    const dir = path.join(instDir, sub, 'mods');
    if (fs.existsSync(dir)) return dir;
  }
  const game = fs.existsSync(path.join(instDir, '.minecraft')) ? '.minecraft' : 'minecraft';
  return path.join(instDir, game, 'mods');
}

const isMod = (name) => name.endsWith('.jar') || name.endsWith('.jar.disabled');
const enabledName = (name) => name.replace(/\.disabled$/, '');

// Só nomes de arquivo simples, de dentro da pasta de mods.
function modPath(dir, file) {
  if (typeof file !== 'string' || path.basename(file) !== file || !isMod(file)) throw new ModError('Mod inválido.');
  const full = path.join(dir, file);
  if (!fs.existsSync(full)) throw new ModError('Não achei este mod na pasta da instância. Ele pode ter sido apagado pelo Prism.');
  return full;
}

// TOML do jeito que o Prism e o packwiz gravam: chave = valor e seções [a.b]. Só o necessário para ler esses arquivos.
function parseToml(text) {
  const out = {};
  let section = '';
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const sec = line.match(/^\[([^\]]+)\]$/);
    if (sec) {
      section = `${sec[1].trim()}.`;
      continue;
    }
    const kv = line.match(/^("?)([^"=]+)\1\s*=\s*(.+)$/);
    if (!kv) continue;
    let value = kv[3].trim();
    if (value.startsWith('"')) {
      try {
        value = JSON.parse(value);
      } catch {
        value = value.slice(1, -1);
      }
    } else if (value.startsWith('[')) {
      value = [...value.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1]);
    }
    out[section + kv[2].trim()] = value;
  }
  return out;
}

function readIndex(dir) {
  const indexDir = path.join(dir, '.index');
  const byFile = new Map();
  let names = [];
  try {
    names = fs.readdirSync(indexDir).filter((n) => n.endsWith('.pw.toml'));
  } catch {
    return byFile;
  }
  for (const n of names) {
    try {
      const t = parseToml(fs.readFileSync(path.join(indexDir, n), 'utf8'));
      if (t.filename) byFile.set(enabledName(t.filename), { toml: path.join(indexDir, n), name: t.name, projectId: t['update.modrinth.mod-id'] || null });
    } catch {}
  }
  return byFile;
}

const str = (s) => JSON.stringify(String(s));

function tomlText({ filename, name, side, loader, mcVersion, versionType, sha512, url, projectId, versionId }) {
  return [
    `filename = ${str(filename)}`,
    `name = ${str(name)}`,
    `side = ${str(side)}`,
    `x-prismlauncher-loaders = [ ${str(loader)} ]`,
    `x-prismlauncher-mc-versions = [ ${str(mcVersion)} ]`,
    `x-prismlauncher-release-type = ${str(versionType || 'release')}`,
    '',
    '[download]',
    `hash = ${str(sha512)}`,
    'hash-format = "sha512"',
    'mode = "url"',
    `url = ${str(url)}`,
    '',
    '[update]',
    '[update.modrinth]',
    `mod-id = ${str(projectId)}`,
    `version = ${str(versionId)}`,
    '',
  ].join('\n');
}

function sideOf(project) {
  if (project.server_side === 'unsupported') return 'client';
  if (project.client_side === 'unsupported') return 'server';
  return 'both';
}

// Nome legível para mods que o Modrinth não conhece: "sodium-fabric-0.6.0+mc1.21.1.jar" vira "sodium fabric".
function nameFromFile(file) {
  const base = enabledName(file).replace(/\.jar$/, '');
  const words = base.split(/[-_ ]+/).filter((w) => w && !/^(v?\d|mc\d|\d)/i.test(w) && !/^(fabric|forge|neoforge|quilt)$/i.test(w));
  return words.length ? words.join(' ') : base;
}

function hashFile(file, algo) {
  return crypto.createHash(algo).update(fs.readFileSync(file)).digest('hex');
}

function localMods(dir) {
  let names = [];
  try {
    names = fs.readdirSync(dir).filter(isMod);
  } catch {}
  const index = readIndex(dir);
  return names.map((file) => {
    const full = path.join(dir, file);
    const idx = index.get(enabledName(file)) || null;
    return { file, enabled: !file.endsWith('.disabled'), sha1: hashFile(full, 'sha1'), size: fs.statSync(full).size, index: idx };
  });
}

// ===== o que a tela usa =====

// Lista dos mods da instância com nome, ícone e atualização disponível. Sem internet, ainda mostra os arquivos.
async function list(instDir, game) {
  const dir = modsDir(instDir);
  const local = localMods(dir);
  const t = target(game);
  let current = {};
  let latest = {};
  let info = new Map();
  let offline = null;
  if (local.length) {
    try {
      const hashes = local.map((m) => m.sha1);
      current = (await api('/version_files', { method: 'POST', body: { hashes, algorithm: 'sha1' } })) || {};
      if (t) {
        const enabled = local.filter((m) => m.enabled && current[m.sha1]).map((m) => m.sha1);
        if (enabled.length) latest = (await api('/version_files/update', { method: 'POST', body: { hashes: enabled, algorithm: 'sha1', loaders: t.loaders, game_versions: [t.mcVersion] } })) || {};
      }
      info = await projects([...new Set(Object.values(current).map((v) => v.project_id))]);
    } catch (err) {
      offline = err instanceof ModError ? err.message : 'Não deu para falar com o Modrinth agora.';
    }
  }
  const mods = local.map((m) => {
    const v = current[m.sha1];
    const p = v && info.get(v.project_id);
    const next = latest[m.sha1];
    return {
      file: m.file,
      enabled: m.enabled,
      size: m.size,
      name: (p && p.title) || (m.index && m.index.name) || nameFromFile(m.file),
      description: (p && p.description) || '',
      icon: (p && p.icon_url) || null,
      projectId: (v && v.project_id) || (m.index && m.index.projectId) || null,
      slug: (p && p.slug) || null,
      version: (v && v.version_number) || '',
      update: next && v && next.id !== v.id && new Date(next.date_published) > new Date(v.date_published)
        ? { id: next.id, number: next.version_number }
        : null,
    };
  });
  mods.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' }));
  return { mods, offline, supported: !!t, dir };
}

// Mods do Modrinth que servem na versão e no loader da instância. Sem texto, mostra os mais baixados.
async function search(game, text, offset = 0) {
  const t = requireTarget(game);
  const facets = [t.loaders.map((l) => `categories:${l}`), [`versions:${t.mcVersion}`], ['project_type:mod']];
  const query = String(text || '').trim();
  const r = await api(`/search?query=${encodeURIComponent(query)}&facets=${q(facets)}&index=${query ? 'relevance' : 'downloads'}&limit=${PAGE}&offset=${Math.max(0, offset | 0)}`);
  const hits = ((r && r.hits) || []).map((x) => ({
    projectId: x.project_id, slug: x.slug, name: x.title, description: x.description, icon: x.icon_url || null, downloads: x.downloads || 0, author: x.author,
  }));
  return { items: hits, total: (r && r.total_hits) || 0, offset };
}

async function bestVersion(projectId, t) {
  return pickVersion(await api(`/project/${encodeURIComponent(projectId)}/version?loaders=${q(t.loaders)}&game_versions=${q([t.mcVersion])}`));
}

function checkUrl(url) {
  let u;
  try {
    u = new URL(url);
  } catch {
    throw new ModError('Endereço de download inválido.');
  }
  if (u.protocol !== 'https:' || !(u.hostname === 'cdn.modrinth.com' || u.hostname.endsWith('.modrinth.com'))) throw new ModError('Endereço de download inválido.');
  return u.href;
}

// Baixa o .jar, confere o hash do Modrinth e grava junto com o .pw.toml.
async function writeVersion(dir, version, project, t) {
  const f = primaryFile(version);
  if (!f) throw new ModError(`${project.title} não tem arquivo para baixar.`);
  if (path.basename(f.filename) !== f.filename || !f.filename.endsWith('.jar')) throw new ModError(`O arquivo de ${project.title} não é um mod (.jar).`);
  if (f.size > MAX_BYTES) throw new ModError(`O arquivo de ${project.title} é grande demais.`);
  let res;
  try {
    res = await fetch(checkUrl(f.url), { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(120000) });
  } catch {
    throw new ModError(`Não consegui baixar ${project.title}. Confira sua internet.`);
  }
  if (!res.ok) throw new ModError(`Não consegui baixar ${project.title} (erro ${res.status}).`);
  const buf = Buffer.from(await res.arrayBuffer());
  const sha512 = crypto.createHash('sha512').update(buf).digest('hex');
  if (f.hashes && f.hashes.sha512 && f.hashes.sha512 !== sha512) throw new ModError(`O download de ${project.title} veio corrompido. Tente de novo.`);
  fs.mkdirSync(path.join(dir, '.index'), { recursive: true });
  const tmp = path.join(dir, `.${f.filename}.cartucho-tmp`);
  fs.writeFileSync(tmp, buf);
  fs.renameSync(tmp, path.join(dir, f.filename));
  const slug = String(project.slug || project.id).replace(/[^a-z0-9._-]/gi, '-');
  fs.writeFileSync(path.join(dir, '.index', `${slug}.pw.toml`), tomlText({
    filename: f.filename, name: project.title, side: sideOf(project), loader: t.loader, mcVersion: t.mcVersion,
    versionType: version.version_type, sha512, url: f.url, projectId: project.id, versionId: version.id,
  }));
  return f.filename;
}

// Arquivos e .pw.toml de um projeto que já está na pasta, para trocar pela versão nova sem deixar duas cópias.
async function installedProjects(dir, local) {
  const byProject = new Map();
  for (const m of local) if (m.index && m.index.projectId) byProject.set(m.index.projectId, m);
  const unknown = local.filter((m) => !(m.index && m.index.projectId));
  if (unknown.length) {
    const found = (await api('/version_files', { method: 'POST', body: { hashes: unknown.map((m) => m.sha1), algorithm: 'sha1' } })) || {};
    for (const m of unknown) if (found[m.sha1]) byProject.set(found[m.sha1].project_id, m);
  }
  return byProject;
}

async function removeLocal(dir, m) {
  if (m.index && m.index.toml && fs.existsSync(m.index.toml)) fs.rmSync(m.index.toml, { force: true });
  const full = path.join(dir, m.file);
  if (fs.existsSync(full)) await trash(full);
}

// Instala o mod e as dependências obrigatórias que ainda não estão na instância (Fabric API, por exemplo).
async function install(instDir, game, projectId) {
  const t = requireTarget(game);
  const dir = modsDir(instDir);
  fs.mkdirSync(dir, { recursive: true });
  const installed = await installedProjects(dir, localMods(dir));
  if (installed.has(projectId)) throw new ModError('Este mod já está na instância.');

  const plan = [];
  const seen = new Set();
  const queue = [{ projectId }];
  while (queue.length) {
    const item = queue.shift();
    let version = null;
    if (item.versionId) version = await api(`/version/${encodeURIComponent(item.versionId)}`);
    const pid = item.projectId || (version && version.project_id);
    if (!pid || seen.has(pid) || installed.has(pid)) continue;
    seen.add(pid);
    if (!version || !(version.loaders || []).some((l) => t.loaders.includes(l)) || !(version.game_versions || []).includes(t.mcVersion)) version = await bestVersion(pid, t);
    if (!version) {
      if (!plan.length) throw new ModError(`Este mod não tem versão para Minecraft ${t.mcVersion} com ${game.loader}.`);
      throw new ModError(`Uma dependência obrigatória não tem versão para Minecraft ${t.mcVersion} com ${game.loader}. Nada foi instalado.`);
    }
    plan.push(version);
    if (plan.length > MAX_DEPS) throw new ModError('Este mod puxa dependências demais. Instale pelo Prism.');
    for (const d of version.dependencies || []) {
      if (d.dependency_type === 'required' && (d.project_id || d.version_id)) queue.push({ projectId: d.project_id, versionId: d.version_id });
    }
  }
  const info = await projects(plan.map((v) => v.project_id));
  const names = [];
  for (const v of plan) {
    const p = info.get(v.project_id) || { id: v.project_id, title: v.name, slug: v.project_id };
    await writeVersion(dir, v, p, t);
    names.push(p.title);
  }
  return { installed: names };
}

// Troca o mod pela versão mais nova que serve na instância. O arquivo antigo vai para a Lixeira.
async function update(instDir, game, file) {
  const t = requireTarget(game);
  const dir = modsDir(instDir);
  const full = modPath(dir, file);
  const old = localMods(dir).find((m) => m.file === file);
  const sha1 = hashFile(full, 'sha1');
  const current = await api(`/version_file/${sha1}?algorithm=sha1`);
  if (!current) throw new ModError('Este mod não está no Modrinth, então o Cartucho não sabe procurar a versão nova.');
  const next = await api(`/version_file/${sha1}/update?algorithm=sha1`, { method: 'POST', body: { loaders: t.loaders, game_versions: [t.mcVersion] } });
  if (!next || next.id === current.id) return { updated: false };
  const [project] = (await projects([current.project_id])).values();
  const p = project || { id: current.project_id, title: nameFromFile(file), slug: current.project_id };
  const nextFile = primaryFile(next);
  if (nextFile && nextFile.filename !== enabledName(file)) {
    await removeLocal(dir, old);
  } else if (old && old.index && old.index.toml) {
    fs.rmSync(old.index.toml, { force: true });
  }
  await writeVersion(dir, next, p, t);
  return { updated: true, name: p.title, version: next.version_number };
}

// Desativar é o mesmo que o Prism faz: o arquivo ganha ".disabled" no fim e o jogo deixa de carregar.
function toggle(instDir, file) {
  const dir = modsDir(instDir);
  const full = modPath(dir, file);
  const next = file.endsWith('.disabled') ? enabledName(file) : `${file}.disabled`;
  if (fs.existsSync(path.join(dir, next))) throw new ModError('Já existe outro arquivo com esse nome na pasta de mods.');
  fs.renameSync(full, path.join(dir, next));
  return { file: next, enabled: !next.endsWith('.disabled') };
}

async function remove(instDir, file) {
  const dir = modsDir(instDir);
  modPath(dir, file);
  const m = localMods(dir).find((x) => x.file === file);
  await removeLocal(dir, m);
  return { ok: true };
}

module.exports = { list, search, install, update, toggle, remove, setTrash, parseToml, tomlText, nameFromFile, pickVersion, modsDir, target, ModError };
