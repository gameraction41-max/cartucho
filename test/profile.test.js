const test = require('node:test');
const assert = require('node:assert');
const { rarest, playtime, roundPercentages } = require('../src/main/profile');

const a = (api, achieved, unlocktime = 1) => ({ api, name: api, description: '', achieved, unlocktime });

test('conquistas raras vêm da menor porcentagem para a maior, só as desbloqueadas', () => {
  const ach = { 10: { list: [a('x', true), a('y', true), a('z', false)] }, 20: { list: [a('w', true)] } };
  const rarity = { 10: { pct: { x: 40, y: 2.5, z: 0.1 } }, 20: { pct: { w: 9 } } };
  assert.deepStrictEqual(rarest(ach, rarity).map((r) => r.api), ['y', 'w', 'x']);
});

test('no máximo duas conquistas raras por jogo', () => {
  const ach = { 10: { list: [a('a', true), a('b', true), a('c', true)] }, 20: { list: [a('d', true)] } };
  const rarity = { 10: { pct: { a: 1, b: 2, c: 3 } }, 20: { pct: { d: 50 } } };
  assert.deepStrictEqual(rarest(ach, rarity).map((r) => r.api), ['a', 'b', 'd']);
});

test('jogo sem porcentagem lida fica de fora', () => {
  assert.deepStrictEqual(rarest({ 10: { list: [a('a', true)] } }, {}), []);
});

test('tempo jogado soma todas as fontes e lista os mais jogados', () => {
  const games = [
    { key: 's1', source: 'steam', title: 'A', minutes: 100 },
    { key: 'p1', source: 'prism', title: 'B', minutes: 300 },
    { key: 'h', source: 'hytale', title: 'Hytale', minutes: 50 },
    { key: 's2', source: 'steam', title: 'C', minutes: 0 },
  ];
  const t = playtime(games);
  assert.strictEqual(t.minutes, 450);
  assert.deepStrictEqual(t.bySource, { steam: 100, prism: 300, hytale: 50 });
  assert.strictEqual(t.played, 3);
  assert.deepStrictEqual(t.top.map((g) => g.key), ['p1', 's1', 'h']);
});

test('porcentagens ficam com uma casa decimal', () => {
  assert.deepStrictEqual(roundPercentages({ a: 12.3456, b: NaN }), { a: 12.3 });
});
