const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const ss = require('../src/main/screenshots');

const touch = (file, at) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, 'x');
  fs.utimesSync(file, at / 1000, at / 1000);
};

test('tira a data do nome das capturas da Barra de Jogo', () => {
  assert.strictEqual(ss.gamebarTitle('Hades II 2026-10-27 22-08-55.png'), 'Hades II');
  assert.strictEqual(ss.gamebarTitle('Hollow Knight 1_5_2024 7_23_41 PM.mp4'), 'Hollow Knight');
  assert.strictEqual(ss.gamebarTitle('qualquer coisa.png'), null);
});

test('junta Steam, Barra de Jogo e Minecraft por jogo, sem área de trabalho nem outros programas, do mais recente para o mais antigo', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'ss-'));
  const t = Date.UTC(2026, 9, 27, 12);
  const steamRoot = path.join(home, 'Steam');
  const steamDir = path.join(steamRoot, 'userdata', '123', '760', 'remote', '1245620', 'screenshots');
  touch(path.join(steamDir, '2026_a.jpg'), t - 5000);
  touch(path.join(steamDir, 'thumbnails', '2026_a.jpg'), t - 5000);
  touch(path.join(steamDir, '2026_b.jpg'), t - 1000);
  const gamebarDir = path.join(home, 'Captures');
  touch(path.join(gamebarDir, 'ELDEN RING™ 2026-10-27 12-00-00.png'), t);
  touch(path.join(gamebarDir, 'Jogo Novo 2026-10-27 11-00-00.mp4'), t - 3600000);
  touch(path.join(gamebarDir, 'leiame.txt'), t);
  touch(path.join(gamebarDir, 'Explorador de Arquivos 2026-10-27 10-00-00.png'), t);
  touch(path.join(gamebarDir, 'Minecraft 1.21.1 - Singleplayer 2026-10-27 09-00-00.png'), t - 3 * 3600000);
  const inst = { id: 'FO', name: 'Fabulously Optimized', dir: path.join(home, 'FO') };
  touch(path.join(inst.dir, '.minecraft', 'screenshots', '2026-10-26_10.00.00.png'), t - 7200000);

  const groups = ss.scan({ gamebarDir, steamRoot, instances: [inst], games: [{ key: 'steam:1245620', title: 'ELDEN RING', appid: 1245620 }] });
  assert.deepStrictEqual(groups.map((g) => [g.key, g.title, g.shots.length]), [
    ['steam:1245620', 'ELDEN RING', 3],
    ['prism:FO', 'Fabulously Optimized', 1],
    ['minecraft', 'Minecraft', 1],
  ]);
  const elden = groups[0].shots;
  assert.deepStrictEqual(elden.map((s) => s.source), ['windows', 'steam', 'steam']);
  assert.ok(elden[2].thumb && elden[2].thumb.startsWith('file:'));
  assert.strictEqual(elden[1].thumb, null);
  assert.ok(!groups.some((g) => /Jogo Novo|Explorador/.test(g.title)));
});

test('sem pastas, devolve lista vazia', () => {
  assert.deepStrictEqual(ss.scan({ gamebarDir: '/nao/existe', steamRoot: '/nao/existe' }), []);
});
