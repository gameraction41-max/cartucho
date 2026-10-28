const test = require('node:test');
const assert = require('node:assert');
const { sanitize } = require('../src/main/collections');

test('coleções sem nome ou com id repetido saem da lista', () => {
  const out = sanitize([
    { id: 'a', name: '  Jogando   agora ', keys: ['steam:1'] },
    { id: 'a', name: 'Outra', keys: [] },
    { id: 'b', name: '   ', keys: [] },
    null,
  ]);
  assert.deepStrictEqual(out, [{ id: 'a', name: 'Jogando agora', keys: ['steam:1'] }]);
});

test('jogo repetido entra uma vez só e lixo some', () => {
  const [c] = sanitize([{ id: 'z', name: 'Para zerar', keys: ['steam:1', 'steam:1', 3, '', 'hytale'] }]);
  assert.deepStrictEqual(c.keys, ['steam:1', 'hytale']);
});

test('nome comprido é cortado e algo que não é lista vira lista vazia', () => {
  assert.strictEqual(sanitize([{ id: 'x', name: 'a'.repeat(80) }])[0].name.length, 32);
  assert.deepStrictEqual(sanitize('nada'), []);
});
