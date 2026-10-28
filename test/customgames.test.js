const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const customgames = require('../src/main/customgames');

test('sanitize guarda só .exe, com id e nome', () => {
  const list = customgames.sanitize([
    { exe: 'C:\\Jogos\\Celeste\\Celeste.exe' },
    { exe: 'C:\\Jogos\\leia.txt', title: 'Não é jogo' },
    null,
    { id: 'abc123', exe: 'C:\\Jogos\\Osu\\osu!.exe', title: '  Osu!  ' },
  ]);
  assert.strictEqual(list.length, 2);
  assert.strictEqual(list[0].title, 'Celeste');
  assert.match(list[0].id, /^[a-z0-9]{6,16}$/);
  assert.deepStrictEqual([list[1].id, list[1].title], ['abc123', 'Osu!']);
});

test('sanitize tira ids repetidos', () => {
  const list = customgames.sanitize([{ id: 'abc123', exe: 'a.exe' }, { id: 'abc123', exe: 'b.exe' }]);
  assert.strictEqual(list.length, 1);
});

test('looksLikeGame ignora desinstaladores, manuais e programas do Windows', () => {
  assert.ok(customgames.looksLikeGame('Hollow Knight', 'C:\\GOG Games\\Hollow Knight\\hollow_knight.exe'));
  assert.ok(customgames.looksLikeGame('Parasite Eve', 'C:\\Jogos\\Parasite\\pe.exe'));
  assert.ok(!customgames.looksLikeGame('Uninstall Hollow Knight', 'C:\\GOG Games\\Hollow Knight\\unins000.exe'));
  assert.ok(!customgames.looksLikeGame('Manual', 'C:\\Jogos\\X\\manual.exe'));
  assert.ok(!customgames.looksLikeGame('Steam', 'C:\\Program Files (x86)\\Steam\\steam.exe'));
  assert.ok(!customgames.looksLikeGame('Bloco de Notas', 'C:\\Windows\\System32\\notepad.exe'));
  assert.ok(!customgames.looksLikeGame('Site oficial', 'https://exemplo.com'));
});

test('startMenuGames lê os atalhos, tira repetidos e os que já estão no Cartucho', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cartucho-start-'));
  const programs = path.join(root, 'AppData', 'Microsoft', 'Windows', 'Start Menu', 'Programs');
  fs.mkdirSync(path.join(programs, 'Team Cherry'), { recursive: true });
  const targets = {
    'Hollow Knight.lnk': 'C:\\GOG\\HK\\hollow_knight.exe',
    'Team Cherry/Hollow Knight (2).lnk': 'C:\\GOG\\HK\\hollow_knight.exe',
    'Uninstall Hollow Knight.lnk': 'C:\\GOG\\HK\\unins000.exe',
    'Celeste.lnk': 'C:\\Jogos\\Celeste\\Celeste.exe',
    'Osu.lnk': 'C:\\Osu\\osu!.exe',
  };
  for (const name of Object.keys(targets)) fs.writeFileSync(path.join(programs, name), '');
  const readLink = (file) => ({ target: targets[path.relative(programs, file).split(path.sep).join('/')] });
  const list = customgames.startMenuGames(readLink, { env: { APPDATA: path.join(root, 'AppData') }, exists: () => true, known: ['c:\\osu\\OSU!.exe'] });
  assert.deepStrictEqual(list.map((g) => g.title), ['Celeste', 'Hollow Knight']);
});
