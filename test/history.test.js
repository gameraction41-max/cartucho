const test = require('node:test');
const assert = require('node:assert');
const { record, week, dayKey } = require('../src/main/history');

const DAY = 24 * 3600 * 1000;
const now = new Date(2026, 9, 27, 20, 0).getTime();

test('a primeira foto não conta tempo; depois, a diferença vai para o dia', () => {
  const data = {};
  assert.strictEqual(record(data, [{ key: 'steam:1', minutes: 600 }], now - 2 * DAY), true);
  assert.deepStrictEqual(data.days, {});
  record(data, [{ key: 'steam:1', minutes: 690 }], now - DAY);
  record(data, [{ key: 'steam:1', minutes: 720 }, { key: 'prism:FO', minutes: 50 }], now);
  record(data, [{ key: 'steam:1', minutes: 740 }, { key: 'prism:FO', minutes: 95 }], now);
  assert.deepStrictEqual(data.days[dayKey(now - DAY)], { 'steam:1': 90 });
  assert.deepStrictEqual(data.days[dayKey(now)], { 'steam:1': 50, 'prism:FO': 45 });
});

test('sem mudança, não pede para salvar', () => {
  const data = {};
  record(data, [{ key: 'a', minutes: 10 }], now);
  assert.strictEqual(record(data, [{ key: 'a', minutes: 10 }], now), false);
});

test('a semana soma os 7 dias e ordena os jogos mais jogados', () => {
  const data = { snapshot: { a: 1 }, days: { [dayKey(now)]: { a: 30, b: 90 }, [dayKey(now - 3 * DAY)]: { a: 100 }, [dayKey(now - 9 * DAY)]: { c: 500 } } };
  const w = week(data, now);
  assert.strictEqual(w.days.length, 7);
  assert.strictEqual(w.total, 220);
  assert.deepStrictEqual(w.top, [{ key: 'a', minutes: 130 }, { key: 'b', minutes: 90 }]);
  assert.strictEqual(w.days[6].minutes, 120);
});

test('dias com mais de 60 dias são apagados', () => {
  const data = { snapshot: {}, days: { [dayKey(now - 70 * DAY)]: { a: 5 } } };
  assert.strictEqual(record(data, [], now), true);
  assert.deepStrictEqual(data.days, {});
});
