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

test('nome do jogo vira um nome de pasta que o Windows aceita', () => {
  assert.strictEqual(ss.safeName('ELDEN RING™: Nightreign?'), 'ELDEN RING™ Nightreign');
  assert.strictEqual(ss.safeName('  ...  '), 'Jogo');
});

test('junta as capturas do Cartucho e da Steam por jogo, do mais recente para o mais antigo', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'ss-'));
  const t = Date.UTC(2026, 9, 27, 12);
  const steamRoot = path.join(home, 'Steam');
  const steamDir = path.join(steamRoot, 'userdata', '123', '760', 'remote', '1245620', 'screenshots');
  touch(path.join(steamDir, '2026_a.jpg'), t - 5000);
  touch(path.join(steamDir, 'thumbnails', '2026_a.jpg'), t - 5000);
  const pictures = path.join(home, 'Imagens', 'Cartucho');
  const videos = path.join(home, 'Videos', 'Cartucho');
  touch(path.join(pictures, 'ELDEN RING™', 'ELDEN RING™ 2026-10-27 12-00-00.png'), t);
  touch(path.join(videos, 'ELDEN RING™', 'ELDEN RING™ 2026-10-27 11-59-00.mp4'), t - 60000);
  touch(path.join(videos, 'ELDEN RING™', 'leiame.txt'), t);
  touch(path.join(pictures, 'Fabulously Optimized', 'Fabulously Optimized 2026-10-27 10-00-00.png'), t - 7200000);
  touch(path.join(pictures, 'Jogo Removido', 'Jogo Removido 2026-10-20 10-00-00.png'), t - 86400000);

  const groups = ss.scan({
    cartuchoDirs: [pictures, videos],
    steamRoot,
    games: [{ key: 'steam:1245620', title: 'ELDEN RING™', appid: 1245620 }, { key: 'prism:FO', title: 'Fabulously Optimized' }],
  });
  assert.deepStrictEqual(groups.map((g) => [g.key, g.title, g.shots.length]), [
    ['steam:1245620', 'ELDEN RING™', 3],
    ['prism:FO', 'Fabulously Optimized', 1],
    ['pasta:jogoremovido', 'Jogo Removido', 1],
  ]);
  const elden = groups[0].shots;
  assert.deepStrictEqual(elden.map((s) => [s.source, s.video]), [['cartucho', false], ['steam', false], ['cartucho', true]]);
  assert.ok(elden[1].thumb && elden[1].thumb.startsWith('file:'));
});

test('sem pastas, devolve lista vazia', () => {
  assert.deepStrictEqual(ss.scan({ cartuchoDirs: ['/nao/existe'], steamRoot: '/nao/existe' }), []);
});
