const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const rec = require('../src/main/recorder');

test('lê a lista de pedaços do ffmpeg', () => {
  assert.deepStrictEqual(rec.parseSegmentList('seg000000.ts,0.000000,2.000000\r\nseg000001.ts,2.000000,4.000000\n\n'), [
    { file: 'seg000000.ts', start: 0, end: 2 },
    { file: 'seg000001.ts', start: 2, end: 4 },
  ]);
});

test('o som entra no ritmo do relógio, com silêncio quando falta', async () => {
  let t = 0;
  const out = [];
  const pump = rec.createPump((b) => out.push(b), { now: () => t });
  pump.push(Buffer.alloc(4 * 100, 1));
  t = 10; // 10 ms = 480 quadros
  await new Promise((r) => setTimeout(r, 30));
  pump.stop();
  const all = Buffer.concat(out);
  assert.strictEqual(all.length, 480 * 4);
  assert.strictEqual(all[0], 1);
  assert.strictEqual(all[all.length - 1], 0);
});

// O teste de verdade usa o ffmpeg do sistema (as máquinas do GitHub Actions já têm). O ffmpeg-static de Linux
// trava lendo MPEG-TS; o de Windows, que vai no instalador, é outra versão.
const ffmpeg = 'ffmpeg';
const hasFfmpeg = spawnSync(ffmpeg, ['-version']).status === 0;

const duration = (file) => {
  const r = spawnSync(ffmpeg, ['-hide_banner', '-i', file], { encoding: 'utf8' });
  const m = r.stderr.match(/Duration: (\d+):(\d+):([\d.]+)/);
  return { seconds: m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : 0, audio: /Audio: aac/.test(r.stderr), video: /Video: h264/.test(r.stderr) };
};

test('grava em pedaços, salva os últimos segundos e grava do começo ao fim', { skip: !hasFfmpeg && 'ffmpeg não instalado', timeout: 60000 }, async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'rec-'));
  const r = rec.createRecorder({
    ffmpeg,
    tmpDir: path.join(home, 'buffer'),
    video: ['-re', '-f', 'lavfi', '-i', 'testsrc2=size=320x240:rate=30'],
    encoders: ['quebrado', 'sw'],
    encoderArgs: { quebrado: ['-c:v', 'nao_existe'], sw: ['-c:v', 'libx264', '-preset', 'ultrafast', '-g', '30', '-pix_fmt', 'yuv420p'] },
  });
  assert.strictEqual(await r.start(), 'sw');
  await new Promise((res) => setTimeout(res, 7000));
  const clip = await r.saveLast(4, path.join(home, 'out', 'clipe.mp4'));
  const c = duration(clip);
  assert.ok(c.video && c.audio, 'tem vídeo e som');
  assert.ok(c.seconds >= 3.5 && c.seconds <= 6.5, `clipe com ${c.seconds}s`);

  r.startRecording();
  await new Promise((res) => setTimeout(res, 3000));
  const full = await r.stopRecording(path.join(home, 'out', 'gravacao.mp4'));
  const g = duration(full);
  assert.ok(g.seconds >= 2.5 && g.seconds <= 7, `gravação com ${g.seconds}s`);
  await r.stop();
  assert.strictEqual(r.isRunning(), false);
});
