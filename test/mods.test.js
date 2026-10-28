const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const mods = require('../src/main/mods');

const FABRIC = { loader: 'Fabric', mcVersion: '1.21.1' };

function instance(files = {}) {
  const inst = fs.mkdtempSync(path.join(os.tmpdir(), 'mods-'));
  const dir = path.join(inst, 'minecraft', 'mods');
  fs.mkdirSync(path.join(dir, '.index'), { recursive: true });
  for (const [name, content] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), content);
  return { inst, dir };
}

const sha1 = (s) => crypto.createHash('sha1').update(s).digest('hex');
const sha512 = (s) => crypto.createHash('sha512').update(s).digest('hex');

// Troca o fetch por respostas fixas, por endereço.
function fakeFetch(routes) {
  const calls = [];
  global.fetch = async (url, opts = {}) => {
    calls.push({ url, body: opts.body && JSON.parse(opts.body) });
    const hit = routes.find(([re]) => re.test(url));
    if (!hit) return { ok: false, status: 404, json: async () => null };
    const value = typeof hit[1] === 'function' ? hit[1](url, opts) : hit[1];
    if (Buffer.isBuffer(value)) return { ok: true, status: 200, arrayBuffer: async () => value };
    return { ok: true, status: 200, json: async () => value };
  };
  return calls;
}

test('parseToml lê o .pw.toml do Prism', () => {
  const t = mods.parseToml('filename = "sodium-0.6.jar"\nname = "Sodium"\nx-prismlauncher-loaders = [ "fabric", "quilt" ]\n\n[download]\nhash = "abc"\n\n[update]\n[update.modrinth]\nmod-id = "AANobbMI"\nversion = "v1"\n');
  assert.strictEqual(t.filename, 'sodium-0.6.jar');
  assert.strictEqual(t.name, 'Sodium');
  assert.deepStrictEqual(t['x-prismlauncher-loaders'], ['fabric', 'quilt']);
  assert.strictEqual(t['download.hash'], 'abc');
  assert.strictEqual(t['update.modrinth.mod-id'], 'AANobbMI');
});

test('tomlText volta pelo parseToml com os mesmos valores', () => {
  const text = mods.tomlText({ filename: 'a "b".jar', name: 'Mod', side: 'both', loader: 'fabric', mcVersion: '1.21.1', sha512: 'ff', url: 'https://cdn.modrinth.com/x.jar', projectId: 'P', versionId: 'V' });
  const t = mods.parseToml(text);
  assert.strictEqual(t.filename, 'a "b".jar');
  assert.strictEqual(t['update.modrinth.version'], 'V');
  assert.strictEqual(t['download.url'], 'https://cdn.modrinth.com/x.jar');
});

test('nameFromFile tira versão e loader do nome do arquivo', () => {
  assert.strictEqual(mods.nameFromFile('sodium-fabric-0.6.0+mc1.21.1.jar'), 'sodium');
  assert.strictEqual(mods.nameFromFile('cool_hud-1.0.jar.disabled'), 'cool hud');
});

test('pickVersion prefere a versão estável mais nova', () => {
  const list = [{ id: 'b', version_type: 'beta' }, { id: 'r', version_type: 'release' }, { id: 'r0', version_type: 'release' }];
  assert.strictEqual(mods.pickVersion(list).id, 'r');
  assert.strictEqual(mods.pickVersion([{ id: 'a', version_type: 'alpha' }]).id, 'a');
  assert.strictEqual(mods.pickVersion([]), null);
});

test('target recusa instância Vanilla', () => {
  assert.strictEqual(mods.target({ loader: 'Vanilla', mcVersion: '1.21.4' }), null);
  assert.deepStrictEqual(mods.target(FABRIC), { loader: 'fabric', loaders: ['fabric'], mcVersion: '1.21.1' });
  assert.deepStrictEqual(mods.target({ loader: 'Quilt', mcVersion: '1.21.1' }).loaders, ['quilt', 'fabric']);
});

test('list junta arquivos, nomes do Modrinth e atualizações', async () => {
  const { inst } = instance({ 'sodium-0.6.5.jar': 'S1', 'xaero.jar.disabled': 'X1', 'meu-mod-1.0.jar': 'M1', 'leia.txt': '' });
  const calls = fakeFetch([
    [/\/version_files\/update$/, { [sha1('S1')]: { id: 'v2', version_number: '0.6.13', date_published: '2026-10-01' } }],
    [/\/version_files$/, {
      [sha1('S1')]: { id: 'v1', project_id: 'sod', version_number: '0.6.5', date_published: '2026-01-01' },
      [sha1('X1')]: { id: 'x1', project_id: 'xae', version_number: '24.6', date_published: '2026-01-01' },
    }],
    [/\/projects\?ids=/, [{ id: 'sod', title: 'Sodium', slug: 'sodium', icon_url: 'https://cdn.modrinth.com/s.png' }, { id: 'xae', title: "Xaero's Minimap", slug: 'xaeros' }]],
  ]);
  const r = await mods.list(inst, FABRIC);
  assert.strictEqual(r.supported, true);
  assert.strictEqual(r.offline, null);
  assert.strictEqual(r.mods.length, 3);
  const [meu, sodium, xaero] = r.mods;
  assert.strictEqual(meu.name, 'meu mod');
  assert.strictEqual(meu.projectId, null);
  assert.deepStrictEqual(sodium.update, { id: 'v2', number: '0.6.13' });
  assert.strictEqual(sodium.icon, 'https://cdn.modrinth.com/s.png');
  assert.strictEqual(xaero.enabled, false);
  assert.strictEqual(xaero.update, null);
  // Desativados não entram na busca por atualização.
  const upd = calls.find((c) => /update$/.test(c.url));
  assert.deepStrictEqual(upd.body.hashes, [sha1('S1')]);
  assert.deepStrictEqual(upd.body.loaders, ['fabric']);
});

test('list sem internet ainda mostra os arquivos', async () => {
  const { inst } = instance({ 'sodium-0.6.5.jar': 'S1' });
  global.fetch = async () => { throw new Error('offline'); };
  const r = await mods.list(inst, FABRIC);
  assert.ok(r.offline);
  assert.strictEqual(r.mods[0].name, 'sodium');
});

test('install baixa o mod e a dependência obrigatória, com o .pw.toml', async () => {
  const { inst, dir } = instance();
  const jar = (name) => Buffer.from(`jar ${name}`);
  const version = (pid, name, deps = []) => ({
    id: `v-${pid}`, project_id: pid, name, version_number: '1.0', version_type: 'release', loaders: ['fabric'], game_versions: ['1.21.1'], dependencies: deps,
    files: [{ primary: true, filename: `${pid}-1.0.jar`, url: `https://cdn.modrinth.com/data/${pid}.jar`, size: 10, hashes: { sha512: sha512(jar(pid)) } }],
  });
  fakeFetch([
    [/\/project\/iris\/version/, [version('iris', 'Iris', [{ project_id: 'fapi', dependency_type: 'required' }, { project_id: 'opt', dependency_type: 'optional' }])]],
    [/\/project\/fapi\/version/, [version('fapi', 'Fabric API')]],
    [/\/projects\?ids=/, [{ id: 'iris', title: 'Iris Shaders', slug: 'iris', client_side: 'required', server_side: 'unsupported' }, { id: 'fapi', title: 'Fabric API', slug: 'fabric-api' }]],
    [/cdn\.modrinth\.com\/data\/(\w+)\.jar/, (url) => jar(url.match(/data\/(\w+)\.jar/)[1])],
  ]);
  const r = await mods.install(inst, FABRIC, 'iris');
  assert.deepStrictEqual(r.installed, ['Iris Shaders', 'Fabric API']);
  assert.ok(fs.existsSync(path.join(dir, 'iris-1.0.jar')));
  assert.ok(fs.existsSync(path.join(dir, 'fapi-1.0.jar')));
  const t = mods.parseToml(fs.readFileSync(path.join(dir, '.index', 'iris.pw.toml'), 'utf8'));
  assert.strictEqual(t.side, 'client');
  assert.strictEqual(t['update.modrinth.mod-id'], 'iris');
  assert.strictEqual(t['download.hash'], sha512(jar('iris')));
});

test('install recusa download com hash errado', async () => {
  const { inst, dir } = instance();
  fakeFetch([
    [/\/project\/x\/version/, [{ id: 'v', project_id: 'x', version_type: 'release', loaders: ['fabric'], game_versions: ['1.21.1'], dependencies: [], files: [{ primary: true, filename: 'x.jar', url: 'https://cdn.modrinth.com/x.jar', size: 3, hashes: { sha512: 'outro' } }] }]],
    [/\/projects\?ids=/, [{ id: 'x', title: 'X', slug: 'x' }]],
    [/cdn\.modrinth\.com\/x\.jar/, Buffer.from('abc')],
  ]);
  await assert.rejects(mods.install(inst, FABRIC, 'x'), /corrompido/);
  assert.ok(!fs.existsSync(path.join(dir, 'x.jar')));
});

test('update troca o arquivo e manda o antigo para a lixeira', async () => {
  const { inst, dir } = instance({ 'sodium-0.6.5.jar': 'S1' });
  fs.writeFileSync(path.join(dir, '.index', 'sodium.pw.toml'), 'filename = "sodium-0.6.5.jar"\nname = "Sodium"\n[update.modrinth]\nmod-id = "sod"\n');
  const trashed = [];
  mods.setTrash(async (f) => { trashed.push(path.basename(f)); fs.rmSync(f); });
  const next = Buffer.from('S2');
  fakeFetch([
    [/\/version_file\/\w+\/update/, { id: 'v2', project_id: 'sod', version_number: '0.6.13', version_type: 'release', files: [{ primary: true, filename: 'sodium-0.6.13.jar', url: 'https://cdn.modrinth.com/s2.jar', size: 2, hashes: { sha512: sha512(next) } }] }],
    [/\/version_file\/\w+\?/, { id: 'v1', project_id: 'sod' }],
    [/\/projects\?ids=/, [{ id: 'sod', title: 'Sodium', slug: 'sodium' }]],
    [/s2\.jar/, next],
  ]);
  const r = await mods.update(inst, FABRIC, 'sodium-0.6.5.jar');
  assert.deepStrictEqual(r, { updated: true, name: 'Sodium', version: '0.6.13' });
  assert.deepStrictEqual(trashed, ['sodium-0.6.5.jar']);
  assert.deepStrictEqual(fs.readdirSync(dir).filter((f) => f.endsWith('.jar')), ['sodium-0.6.13.jar']);
  assert.strictEqual(mods.parseToml(fs.readFileSync(path.join(dir, '.index', 'sodium.pw.toml'), 'utf8')).filename, 'sodium-0.6.13.jar');
});

test('toggle desativa e ativa; nomes fora da pasta são recusados', () => {
  const { inst, dir } = instance({ 'a.jar': 'A' });
  assert.deepStrictEqual(mods.toggle(inst, 'a.jar'), { file: 'a.jar.disabled', enabled: false });
  assert.ok(fs.existsSync(path.join(dir, 'a.jar.disabled')));
  assert.deepStrictEqual(mods.toggle(inst, 'a.jar.disabled'), { file: 'a.jar', enabled: true });
  assert.throws(() => mods.toggle(inst, '../instance.cfg'), /inválido/);
  assert.throws(() => mods.toggle(inst, '..\\..\\x.jar'), /Não achei|inválido/);
});
