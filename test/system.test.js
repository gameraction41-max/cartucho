const test = require('node:test');
const assert = require('node:assert');
const { recommendPreset } = require('../src/main/system');

const GB = 1024 ** 3;

test('placa de 8 GB, 32 GB de memória e 12 threads pede Qualidade', () => {
  const r = recommendPreset({ gpu: [{ model: 'AMD Radeon(TM) Graphics', vram: 512 }, { model: 'NVIDIA GeForce RTX 4060', vram: 8188 }], memTotal: 31.2 * GB, threads: 12 });
  assert.strictEqual(r.id, 'qualidade');
  assert.match(r.reason, /RTX 4060/);
  assert.match(r.reason, /31 GB/);
});

test('placa intermediária pede Equilibrado', () => {
  assert.strictEqual(recommendPreset({ gpu: [{ model: 'GTX 1650', vram: 4096 }], memTotal: 16 * GB, threads: 8 }).id, 'equilibrado');
});

test('só vídeo integrado pede Desempenho', () => {
  const r = recommendPreset({ gpu: [{ model: 'Intel UHD Graphics', vram: 128 }], memTotal: 8 * GB, threads: 8 });
  assert.strictEqual(r.id, 'desempenho');
  assert.match(r.reason, /vídeo integrado/);
});
