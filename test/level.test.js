const test = require('node:test');
const assert = require('node:assert');
const { computeLevel } = require('../src/main/level');

test('nível começa em 1 e sobe a cada 250 pontos', () => {
  assert.deepStrictEqual(computeLevel(0, 0), { level: 1, progress: 0, xp: 0 });
  assert.strictEqual(computeLevel(25, 0).level, 2);
  assert.strictEqual(computeLevel(24, 0).level, 1);
});

test('jogos 100% dão pontos extras', () => {
  assert.strictEqual(computeLevel(15, 1).xp, 250);
  assert.strictEqual(computeLevel(15, 1).level, 2);
});
