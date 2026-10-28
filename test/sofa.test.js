const test = require('node:test');
const assert = require('node:assert');
const { createSofa, normalize, WARN_MS } = require('../src/main/sofa');

const MIN = 60 * 1000;

function setup({ action = 'screen', minutes = 10, busy = null, inFront = true } = {}) {
  const t = { now: 0, idle: Infinity, events: [], acts: [], settings: { action, minutes }, busy, inFront };
  t.sofa = createSofa({
    settings: () => t.settings,
    busy: () => t.busy,
    inFront: () => t.inFront,
    systemIdleMs: () => t.idle,
    onWarn: (w) => t.events.push(['warn', w.action]),
    onCancel: () => t.events.push(['cancel']),
    onScreen: (off) => t.events.push(['screen', off]),
    act: (a) => t.acts.push(a),
    now: () => t.now,
  });
  // Avança o relógio de segundo em segundo, como o timer de verdade.
  t.wait = (ms) => {
    for (let end = t.now + ms; t.now < end;) {
      t.now += 1000;
      t.sofa.tick();
    }
  };
  return t;
}

test('desligado por padrão e valores estranhos voltam para o padrão', () => {
  assert.deepStrictEqual(normalize({}), { action: 'off', minutes: 30 });
  assert.deepStrictEqual(normalize({ action: 'explodir', minutes: 7 }), { action: 'off', minutes: 30 });
  assert.deepStrictEqual(normalize({ action: 'sleep', minutes: 60 }), { action: 'sleep', minutes: 60 });
});

test('avisa no tempo escolhido e age 30 s depois', () => {
  const t = setup({ action: 'sleep', minutes: 10 });
  t.wait(10 * MIN - 1000);
  assert.deepStrictEqual(t.events, []);
  t.wait(1000);
  assert.deepStrictEqual(t.events, [['warn', 'sleep']]);
  t.wait(WARN_MS - 1000);
  assert.deepStrictEqual(t.acts, []);
  t.wait(1000);
  assert.deepStrictEqual(t.acts, ['sleep']);
});

test('qualquer botão durante a contagem cancela e o tempo recomeça', () => {
  const t = setup();
  t.wait(10 * MIN + 5000);
  t.sofa.activity();
  assert.deepStrictEqual(t.events, [['warn', 'screen'], ['cancel']]);
  t.wait(5 * MIN);
  assert.strictEqual(t.events.length, 2);
  assert.deepStrictEqual(t.acts, []);
});

test('mexer no mouse ou teclado (tempo parado do Windows) também cancela', () => {
  const t = setup();
  t.wait(10 * MIN + 5000);
  t.idle = 500;
  t.wait(1000);
  assert.deepStrictEqual(t.events, [['warn', 'screen'], ['cancel']]);
});

test('com jogo, download ou outro programa na frente não faz nada', () => {
  for (const opts of [{ busy: 'jogo' }, { busy: 'download' }, { inFront: false }]) {
    const t = setup(opts);
    t.wait(30 * MIN);
    assert.deepStrictEqual(t.events, []);
    assert.deepStrictEqual(t.acts, []);
  }
});

test('um jogo que abre durante a contagem cancela, e o tempo só conta de novo depois que ele fecha', () => {
  const t = setup();
  t.wait(10 * MIN + 2000);
  t.busy = 'jogo';
  t.wait(60 * MIN);
  assert.deepStrictEqual(t.events, [['warn', 'screen'], ['cancel']]);
  t.busy = null;
  t.wait(10 * MIN - 2000);
  assert.strictEqual(t.events.length, 2);
});

test('tela desligada liga de novo com o controle e não desliga de novo em seguida', () => {
  const t = setup();
  t.wait(10 * MIN + WARN_MS);
  assert.deepStrictEqual(t.acts, ['screen']);
  t.wait(30 * MIN);
  assert.deepStrictEqual(t.acts, ['screen']);
  t.sofa.activity();
  assert.deepStrictEqual(t.acts, ['screen', 'wake']);
  assert.deepStrictEqual(t.events.at(-1), ['screen', false]);
  t.wait(5 * MIN);
  assert.deepStrictEqual(t.acts, ['screen', 'wake']);
});

test('desligar o modo sofá no meio da contagem cancela', () => {
  const t = setup();
  t.wait(10 * MIN + 2000);
  t.settings = { action: 'off', minutes: 10 };
  t.wait(1000);
  assert.deepStrictEqual(t.events, [['warn', 'screen'], ['cancel']]);
  t.wait(WARN_MS);
  assert.deepStrictEqual(t.acts, []);
});
