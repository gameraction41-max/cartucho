const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const hytale = require('../src/main/hytale');

function fakeAppData() {
  const appdata = fs.mkdtempSync(path.join(os.tmpdir(), 'cartucho-hytale-'));
  const dir = path.join(appdata, 'Hytale', 'install', 'release', 'package', 'launcher');
  for (const v of ['2026.01.13-b6c7e88', '2026.10.21-4f1c9e2']) {
    fs.mkdirSync(path.join(dir, v), { recursive: true });
    fs.writeFileSync(path.join(dir, v, 'hytale-launcher.exe'), '');
  }
  return { appdata, dir };
}

test('acha o launcher da versão mais nova em %APPDATA%\\Hytale', () => {
  const { appdata, dir } = fakeAppData();
  const found = hytale.findLauncher('', { env: { APPDATA: appdata } });
  assert.strictEqual(found, path.join(dir, '2026.10.21-4f1c9e2', 'hytale-launcher.exe'));
});

test('o executável escolhido pela pessoa vale mais que o achado sozinho', () => {
  const { appdata } = fakeAppData();
  const mine = path.join(appdata, 'meu-hytale.exe');
  fs.writeFileSync(mine, '');
  assert.strictEqual(hytale.findLauncher(mine, { env: { APPDATA: appdata } }), mine);
});

test('executável escolhido que sumiu cai no automático', () => {
  const { appdata, dir } = fakeAppData();
  assert.strictEqual(hytale.findLauncher(path.join(appdata, 'apagado.exe'), { env: { APPDATA: appdata } }), path.join(dir, '2026.10.21-4f1c9e2', 'hytale-launcher.exe'));
});

test('sem Hytale instalado, devolve null', () => {
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'cartucho-hytale-'));
  assert.strictEqual(hytale.findLauncher('', { env: { APPDATA: empty } }), null);
});

test('procura também em Arquivos de Programas', () => {
  const list = hytale.launcherCandidates({ ProgramFiles: 'C:\\Program Files' });
  assert.ok(list.some((f) => f.includes('Hypixel Studios') && f.endsWith('hytale-launcher.exe')));
});
