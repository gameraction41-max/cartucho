const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { applyPreset, detectPreset, writePreset, readPreset } = require('../src/main/mcoptions');

const SAMPLE = 'version:3955\nrenderDistance:16\nsimulationDistance:12\ngraphicsMode:1\nparticles:0\nkey_key.jump:key.keyboard.space\nsoundCategory_master:0.8\n';

test('applyPreset troca só as opções de vídeo e mantém o resto', () => {
  const out = applyPreset(SAMPLE, 'desempenho');
  assert.match(out, /^renderDistance:8$/m);
  assert.match(out, /^graphicsMode:0$/m);
  assert.match(out, /^key_key\.jump:key\.keyboard\.space$/m);
  assert.match(out, /^soundCategory_master:0\.8$/m);
  assert.match(out, /^version:3955$/m);
  assert.strictEqual(out.match(/^renderDistance:/gm).length, 1);
});

test('detectPreset reconhece o preset aplicado e devolve null quando é personalizado', () => {
  assert.strictEqual(detectPreset(applyPreset(SAMPLE, 'qualidade')), 'qualidade');
  assert.strictEqual(detectPreset(SAMPLE), null);
  assert.strictEqual(detectPreset(''), null);
});

test('versões antigas usam fancyGraphics', () => {
  const out = applyPreset('fancyGraphics:true\nrenderDistance:12\n', 'desempenho');
  assert.match(out, /^fancyGraphics:false$/m);
  assert.doesNotMatch(out, /graphicsMode/);
});

test('writePreset cria backup na primeira vez e grava o preset', () => {
  const inst = fs.mkdtempSync(path.join(os.tmpdir(), 'inst-'));
  fs.mkdirSync(path.join(inst, 'minecraft'));
  const file = path.join(inst, 'minecraft', 'options.txt');
  fs.writeFileSync(file, SAMPLE);
  writePreset(inst, 'equilibrado');
  writePreset(inst, 'desempenho');
  assert.strictEqual(fs.readFileSync(`${file}.cartucho-backup`, 'utf8'), SAMPLE);
  assert.strictEqual(readPreset(inst), 'desempenho');
});
