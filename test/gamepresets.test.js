const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const gp = require('../src/main/gamepresets');

const SAMPLE = '[/Script/Engine.GameUserSettings]\r\nbUseVSync=False\r\nResolutionSizeX=1920\r\n\r\n[ScalabilityGroups]\r\nsg.ShadowQuality=3\r\nsg.TextureQuality=3\r\n\r\n[Other]\r\nfoo=bar\r\n';

test('ini.set troca e acrescenta chaves só na seção certa e mantém o CRLF', () => {
  const out = gp.ini.set(SAMPLE, { ScalabilityGroups: { 'sg.ShadowQuality': '1', 'sg.FoliageQuality': '1' } });
  assert.strictEqual(gp.ini.get(out, 'ScalabilityGroups', 'sg.ShadowQuality'), '1');
  assert.strictEqual(gp.ini.get(out, 'ScalabilityGroups', 'sg.FoliageQuality'), '1');
  assert.strictEqual(gp.ini.get(out, 'ScalabilityGroups', 'sg.TextureQuality'), '3');
  assert.strictEqual(gp.ini.get(out, 'Other', 'foo'), 'bar');
  assert.ok(out.includes('sg.FoliageQuality=1\r\n\r\n[Other]'));
  assert.ok(!/[^\r]\n/.test(out));
});

test('ini.set cria a seção quando ela não existe', () => {
  const out = gp.ini.set('[A]\na=1\n', { B: { b: '2' } });
  assert.strictEqual(out, '[A]\na=1\n\n[B]\nb=2\n');
});

test('json.set grava caminhos com ponto e json.matches reconhece', () => {
  const out = gp.json.set('{"video":{"quality":3},"audio":1}', { 'video.quality': 1, 'video.shadows': false });
  assert.deepStrictEqual(JSON.parse(out), { video: { quality: 1, shadows: false }, audio: 1 });
  assert.ok(gp.json.matches(out, { 'video.quality': 1 }));
});

test('write faz backup do original uma vez, read reconhece o preset e restore desfaz', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'gp-'));
  const env = { LOCALAPPDATA: path.join(home, 'Local'), USERPROFILE: home };
  const file = path.join(env.LOCALAPPDATA, 'Jogo', 'Saved', 'Config', 'Windows', 'GameUserSettings.ini');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, SAMPLE);
  gp.setBackupDir(() => path.join(home, 'backups'));
  const catalog = { 42: gp.unreal('Jogo') };

  assert.deepStrictEqual(gp.read(42, { catalog, env }), { found: true, preset: null, canRestore: false });
  gp.write(42, 'desempenho', { catalog, env });
  assert.deepStrictEqual(gp.read(42, { catalog, env }), { found: true, preset: 'desempenho', canRestore: true });
  gp.write(42, 'qualidade', { catalog, env });
  assert.strictEqual(gp.read(42, { catalog, env }).preset, 'qualidade');
  gp.restore(42, { catalog, env });
  assert.strictEqual(fs.readFileSync(file, 'utf8'), SAMPLE);
  assert.strictEqual(gp.read(42, { catalog, env }).canRestore, false);
});

test('sem o arquivo do jogo, read avisa e write pede para abrir o jogo uma vez', () => {
  const env = { LOCALAPPDATA: path.join(os.tmpdir(), 'nao-existe-gp'), USERPROFILE: os.tmpdir() };
  const catalog = { 7: gp.unreal('Nada') };
  assert.deepStrictEqual(gp.read(7, { catalog, env }), { found: false, preset: null, canRestore: false });
  assert.throws(() => gp.write(7, 'equilibrado', { catalog, env }), /Abra o jogo uma vez/);
});
