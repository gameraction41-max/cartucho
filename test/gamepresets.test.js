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

  assert.deepStrictEqual(gp.read(42, { catalog, env }), { found: true, preset: null, canRestore: false, engine: 'Unreal Engine' });
  gp.write(42, 'desempenho', { catalog, env });
  assert.deepStrictEqual(gp.read(42, { catalog, env }), { found: true, preset: 'desempenho', canRestore: true, engine: 'Unreal Engine' });
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

test('reconhece sozinho um jogo em Unreal Engine pela pasta de instalação', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'gp-ue-'));
  const env = { LOCALAPPDATA: path.join(home, 'Local'), USERPROFILE: home };
  const game = path.join(home, 'steamapps', 'common', 'Meu Jogo');
  fs.mkdirSync(path.join(game, 'Engine', 'Binaries', 'Win64'), { recursive: true });
  fs.mkdirSync(path.join(game, 'Projeto', 'Binaries', 'Win64'), { recursive: true });
  // Sem o arquivo de opções, ainda não dá para usar.
  assert.strictEqual(gp.detectUnreal(game, env), null);
  const ini = path.join(env.LOCALAPPDATA, 'Projeto', 'Saved', 'Config', 'WindowsNoEditor', 'GameUserSettings.ini');
  fs.mkdirSync(path.dirname(ini), { recursive: true });
  fs.writeFileSync(ini, SAMPLE);
  const recipe = gp.detectUnreal(game, env);
  assert.ok(recipe && recipe.engine === 'Unreal Engine');
  gp.setBackupDir(() => path.join(home, 'backups'));
  gp.write(99, 'equilibrado', { catalog: {}, env, dir: game });
  assert.strictEqual(gp.ini.get(fs.readFileSync(ini, 'utf8'), 'ScalabilityGroups', 'sg.ShadowQuality'), '2');
});

// ===== jogos do CATALOG (0.10.3) =====

function fakeGame(rel, text, { install = false } = {}) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'gp-cat-'));
  const env = { LOCALAPPDATA: path.join(home, 'AppData', 'Local'), USERPROFILE: home };
  const dir = path.join(home, 'steamapps', 'common', 'Jogo');
  const file = install ? path.join(dir, rel) : gp.expand(rel, env);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
  gp.setBackupDir(() => path.join(home, 'backups'));
  return { env, dir, file, opts: install ? { env, dir } : { env } };
}

test('Euro Truck Simulator 2: troca os uset que existem e mantém o resto do config.cfg', () => {
  const cfg = 'SiiNunit\r\n{\r\nuset g_lang "pt_br"\r\nuset r_sun_shadow_quality "2"\r\nuset r_ssao "0"\r\n}\r\n';
  const { file, opts } = fakeGame('%DOCUMENTS%/Euro Truck Simulator 2/config.cfg', cfg);
  gp.write(227300, 'qualidade', opts);
  const out = fs.readFileSync(file, 'utf8');
  assert.ok(out.includes('uset r_sun_shadow_quality "4"\r\n'));
  assert.ok(out.includes('uset r_ssao "3"'));
  assert.ok(out.includes('uset g_lang "pt_br"'));
  assert.ok(!out.includes('g_vegetation_detail'), 'não inventa chaves que não estavam no arquivo');
  assert.strictEqual(gp.read(227300, opts).preset, 'qualidade');
  assert.strictEqual(gp.read(227300, opts).notes.qualidade, 'Sombras no máximo, vegetação cheia');
});

test('Red Dead Redemption 2: muda texto e atributo value no system.xml', () => {
  const xmlText = '<?xml version="1.0" encoding="UTF-8"?>\n<rage__fwuiSystemSettingsCollection>\n\t<graphics>\n\t\t<shadowQuality>kSettingLevel_Ultra</shadowQuality>\n\t\t<textureQuality>kSettingLevel_Medium</textureQuality>\n\t\t<msaa value="4" />\n\t</graphics>\n</rage__fwuiSystemSettingsCollection>\n';
  const { file, opts } = fakeGame('%DOCUMENTS%/Rockstar Games/Red Dead Redemption 2/Settings/system.xml', xmlText);
  gp.write(1174180, 'desempenho', opts);
  const out = fs.readFileSync(file, 'utf8');
  assert.ok(out.includes('<shadowQuality>kSettingLevel_Medium</shadowQuality>'));
  assert.ok(out.includes('<textureQuality>kSettingLevel_High</textureQuality>'));
  assert.ok(out.includes('<msaa value="0" />'));
  assert.strictEqual(gp.read(1174180, opts).preset, 'desempenho');
  gp.restore(1174180, opts);
  assert.strictEqual(fs.readFileSync(file, 'utf8'), xmlText);
});

test('Cyberpunk 2077: troca opções por grupo e nome, só quando o tipo bate', () => {
  const data = { version: 3, data: [
    { group_name: '/graphics/advanced', options: [
      { name: 'ContactShadows', type: 'bool', value: true, default_value: true },
      { name: 'CascadedShadowsResolution', type: 'name', value: 'High', default_value: 'High' },
      { name: 'AmbientOcclusion', type: 'name', value: 'High', default_value: 'High' },
    ] },
    { group_name: '/video/display', options: [{ name: 'Resolution', type: 'name', value: '1920x1080' }] },
  ] };
  const text = JSON.stringify(data, null, 4).replace(/\n/g, '\r\n');
  const { file, opts } = fakeGame('%LOCALAPPDATA%/CD Projekt Red/Cyberpunk 2077/UserSettings.json', text);
  gp.write(1091500, 'desempenho', opts);
  const raw = fs.readFileSync(file, 'utf8');
  assert.ok(raw.includes('\r\n    "version"'), 'mantém o recuo e o CRLF');
  const out = JSON.parse(raw);
  const adv = out.data[0].options;
  assert.strictEqual(adv[0].value, false);
  assert.strictEqual(adv[1].value, 'Low');
  assert.strictEqual(adv[2].value, 'Low');
  assert.strictEqual(out.data[1].options[0].value, '1920x1080');
  assert.strictEqual(gp.read(1091500, opts).preset, 'desempenho');
});

test('arquivo de um formato desconhecido: nada é gravado e nem backup é feito', () => {
  const { file, env, opts } = fakeGame('%DOCUMENTS%/Euro Truck Simulator 2/config.cfg', 'outra coisa\n');
  assert.throws(() => gp.write(227300, 'qualidade', opts), /diferente do que o Cartucho conhece/);
  assert.strictEqual(fs.readFileSync(file, 'utf8'), 'outra coisa\n');
  assert.strictEqual(gp.read(227300, { env }).canRestore, false);
});
