const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { parseVdf, appState, scanApps, FLAG } = require('../src/main/steamlocal');

test('lê o formato VDF da Steam, com blocos aninhados e barras escapadas', () => {
  const data = parseVdf(`"libraryfolders"
{
  // comentário
  "0" { "path" "C:\\\\Program Files (x86)\\\\Steam" "apps" { "570" "123" } }
  "1" { "path" "D:\\\\SteamLibrary" }
}`);
  assert.strictEqual(data.libraryfolders['0'].path, 'C:\\Program Files (x86)\\Steam');
  assert.strictEqual(data.libraryfolders['0'].apps['570'], '123');
  assert.strictEqual(data.libraryfolders['1'].path, 'D:\\SteamLibrary');
});

test('jogo instalado e sem atualização não tem download', () => {
  assert.deepStrictEqual(appState({ StateFlags: '4', BytesToDownload: '0' }), { installed: true, download: null });
});

test('jogo baixando pela primeira vez mostra a porcentagem e ainda não está instalado', () => {
  const s = appState({ StateFlags: String(FLAG.downloading | FLAG.updateRunning | 2), BytesToDownload: '1000', BytesDownloaded: '250' });
  assert.strictEqual(s.installed, false);
  assert.deepStrictEqual(s.download, { state: 'downloading', percent: 25, bytes: 250, total: 1000, update: false });
});

test('atualização pausada de um jogo instalado', () => {
  const s = appState({ StateFlags: String(FLAG.installed | FLAG.updatePaused | 2), BytesToDownload: '400', BytesDownloaded: '100' });
  assert.strictEqual(s.installed, true);
  assert.strictEqual(s.download.state, 'paused');
  assert.strictEqual(s.download.update, true);
});

test('procura os appmanifest em todas as bibliotecas', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'steam-'));
  const other = fs.mkdtempSync(path.join(os.tmpdir(), 'lib-'));
  for (const d of [root, other]) fs.mkdirSync(path.join(d, 'steamapps'));
  fs.writeFileSync(path.join(root, 'steamapps', 'libraryfolders.vdf'), `"libraryfolders" { "0" { "path" "${root.replace(/\\/g, '\\\\')}" } "1" { "path" "${other.replace(/\\/g, '\\\\')}" } }`);
  fs.writeFileSync(path.join(root, 'steamapps', 'appmanifest_570.acf'), '"AppState" { "appid" "570" "name" "Dota 2" "StateFlags" "4" "SizeOnDisk" "5000" }');
  fs.writeFileSync(path.join(other, 'steamapps', 'appmanifest_1245620.acf'), `"AppState" { "appid" "1245620" "name" "ELDEN RING" "StateFlags" "${FLAG.downloading | 2}" "BytesToDownload" "200" "BytesDownloaded" "50" }`);
  const apps = scanApps(root);
  assert.strictEqual(apps.size, 2);
  assert.strictEqual(apps.get(570).installed, true);
  assert.strictEqual(apps.get(1245620).installed, false);
  assert.strictEqual(apps.get(1245620).download.percent, 25);
});
