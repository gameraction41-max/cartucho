// Gravação contínua com o ffmpeg, em pedaços de 2 s numa pasta temporária. Fica sempre só com os últimos segundos
// (KEEP_S), então "salvar os últimos 30 s" é juntar os pedaços mais novos, sem recodificar. "Gravar" segura os
// pedaços desde o começo da gravação até o fim e junta tudo num .mp4.
// O som chega de fora (pushAudio) e entra no ffmpeg num ritmo fixo, pelo relógio: se faltar som, entra silêncio, e
// o vídeo nunca fica esperando pelo áudio.
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const SEGMENT_S = 2;
const KEEP_S = 45;
const RATE = 48000;
const CHANNELS = 2;
const FRAME_BYTES = CHANNELS * 2;

// Imagem da tela pela Duplicação de Área de Trabalho do Windows, já na placa de vídeo.
const DESKTOP = ['-f', 'lavfi', '-i', 'ddagrab=output_idx=0:framerate=60:draw_mouse=0'];

// Do melhor para o pior: NVENC (NVIDIA), AMF (AMD) e, por último, o processador.
const ENCODERS = {
  nvenc: ['-c:v', 'h264_nvenc', '-preset', 'p4', '-rc', 'vbr', '-cq', '23', '-b:v', '0', '-maxrate', '50M', '-bufsize', '100M', '-g', '60', '-bf', '0'],
  amf: ['-c:v', 'h264_amf', '-quality', 'balanced', '-rc', 'cqp', '-qp_i', '22', '-qp_p', '24', '-g', '60'],
  x264: ['-vf', 'hwdownload,format=bgra', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-g', '60', '-pix_fmt', 'yuv420p'],
};

function bufferArgs({ dir, video = DESKTOP, encoder = ENCODERS.nvenc }) {
  return [
    '-hide_banner', '-nostats', '-y',
    ...video,
    '-f', 's16le', '-ar', String(RATE), '-ac', String(CHANNELS), '-thread_queue_size', '4096', '-i', 'pipe:0',
    '-map', '0:v', '-map', '1:a',
    ...encoder,
    '-c:a', 'aac', '-b:a', '160k',
    // Quando o som acaba (stdin fechado), o ffmpeg fecha o último pedaço direitinho e sai.
    '-shortest',
    // Os pedaços mantêm o relógio contínuo, então dá para emendar um no outro byte a byte.
    '-f', 'segment', '-segment_time', String(SEGMENT_S), '-segment_format', 'mpegts',
    '-segment_list', path.join(dir, 'list.csv'), '-segment_list_type', 'csv',
    path.join(dir, 'seg%06d.ts'),
  ];
}

// list.csv do ffmpeg: "seg000003.ts,6.000000,8.000000", uma linha por pedaço pronto.
function parseSegmentList(text) {
  return text.split(/\r?\n/).map((line) => line.split(',')).filter((p) => p.length >= 3 && p[0])
    .map(([file, start, end]) => ({ file, start: Number(start), end: Number(end) }))
    .filter((s) => Number.isFinite(s.start) && Number.isFinite(s.end));
}

function run(ffmpeg, args) {
  return new Promise((resolve, reject) => {
    const p = spawn(ffmpeg, args, { windowsHide: true });
    let err = '';
    p.stderr.on('data', (d) => { err = (err + d).slice(-2000); });
    p.on('error', reject);
    p.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(err.trim() || `ffmpeg saiu com código ${code}`))));
  });
}

// Junta os pedaços num .mp4 sem recodificar: MPEG-TS pode ser emendado byte a byte, e o ffmpeg só troca a embalagem.
async function concat(ffmpeg, files, out, tmpDir) {
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const joined = path.join(tmpDir, `join-${Date.now()}.ts`);
  const fd = fs.openSync(joined, 'w');
  try {
    for (const f of files) fs.writeSync(fd, fs.readFileSync(f));
  } finally {
    fs.closeSync(fd);
  }
  try {
    await run(ffmpeg, ['-hide_banner', '-nostats', '-y', '-i', joined, '-c', 'copy', '-bsf:a', 'aac_adtstoasc', '-movflags', '+faststart', out]);
  } finally {
    fs.rmSync(joined, { force: true });
  }
  return out;
}

// Som no ritmo do relógio: a cada 20 ms entra exatamente o que passou de tempo, com o que chegou ou com silêncio.
function createPump(write, { now = Date.now } = {}) {
  const queue = [];
  let queued = 0;
  let written = 0;
  const t0 = now();
  const tick = () => {
    const target = Math.floor(((now() - t0) / 1000) * RATE) * FRAME_BYTES;
    let need = target - written;
    if (need <= 0) return;
    const out = Buffer.alloc(need);
    let at = 0;
    while (at < need && queue.length) {
      const head = queue[0];
      const n = Math.min(head.length, need - at);
      head.copy(out, at, 0, n);
      at += n;
      if (n === head.length) queue.shift();
      else queue[0] = head.subarray(n);
      queued -= n;
    }
    written += need;
    write(out);
  };
  const timer = setInterval(tick, 20);
  return {
    push(buf) {
      const usable = buf.length - (buf.length % FRAME_BYTES);
      if (!usable) return;
      queue.push(buf.subarray(0, usable));
      queued += usable;
      // Se o som chegar adiantado, descarta o mais velho para não acumular atraso (mais de 0,3 s na fila).
      while (queued > RATE * FRAME_BYTES * 0.3 && queue.length > 1) queued -= queue.shift().length;
    },
    stop() { clearInterval(timer); },
  };
}

function createRecorder({ ffmpeg, tmpDir, video, encoders = ['nvenc', 'amf', 'x264'], encoderArgs = ENCODERS, log = () => {} }) {
  let proc = null;
  let pump = null;
  let poll = null;
  let segments = [];
  let listBytes = 0;
  let listRest = '';
  let recording = null; // { fromEnd, since }
  const locked = new Set();
  let workingEncoder = null;

  const lastEnd = () => (segments.length ? segments[segments.length - 1].end : 0);

  // A lista só cresce (uma linha a cada pedaço), então só o que foi escrito desde a última leitura é lido.
  // Numa partida de horas ela passa de milhares de linhas, e ler tudo duas vezes por segundo pesava à toa.
  function readList() {
    let chunk;
    try {
      const fd = fs.openSync(path.join(tmpDir, 'list.csv'), 'r');
      try {
        const size = fs.fstatSync(fd).size;
        if (size <= listBytes) return;
        const buf = Buffer.alloc(size - listBytes);
        fs.readSync(fd, buf, 0, buf.length, listBytes);
        listBytes = size;
        chunk = buf.toString('utf8');
      } finally {
        fs.closeSync(fd);
      }
    } catch {
      return;
    }
    // Uma linha pela metade (o ffmpeg ainda escrevendo) fica para a próxima leitura.
    const text = listRest + chunk;
    const cut = text.lastIndexOf('\n');
    listRest = text.slice(cut + 1);
    const fresh = cut < 0 ? [] : parseSegmentList(text.slice(0, cut));
    if (!fresh.length) return;
    segments.push(...fresh.map((s) => ({ ...s, path: path.join(tmpDir, s.file) })));
    prune();
  }

  function prune() {
    const keepFrom = lastEnd() - KEEP_S;
    segments = segments.filter((s) => {
      const keep = s.end > keepFrom || (recording && s.end > recording.fromEnd) || locked.has(s.path);
      if (!keep) fs.rmSync(s.path, { force: true });
      return keep;
    });
  }

  function waitForSegment(after, timeoutMs = 8000) {
    return new Promise((resolve, reject) => {
      const started = Date.now();
      const check = () => {
        readList();
        if (lastEnd() > after) return resolve(lastEnd());
        if (!proc) return reject(new Error('A gravação parou.'));
        if (Date.now() - started > timeoutMs) return reject(new Error('A gravação não respondeu.'));
        setTimeout(check, 200);
      };
      check();
    });
  }

  function spawnWith(name) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    fs.mkdirSync(tmpDir, { recursive: true });
    segments = [];
    listBytes = 0;
    listRest = '';
    const p = spawn(ffmpeg, bufferArgs({ dir: tmpDir, video, encoder: encoderArgs[name] }), { windowsHide: true });
    let err = '';
    p.stderr.on('data', (d) => { err = (err + d).slice(-2000); });
    p.stdin.on('error', () => {});
    return { p, err: () => err };
  }

  // Tenta cada encoder até um gerar o primeiro pedaço.
  async function start() {
    if (proc) return workingEncoder;
    const list = workingEncoder ? [workingEncoder] : encoders;
    for (const name of list) {
      const { p, err } = spawnWith(name);
      proc = p;
      pump = createPump((buf) => { if (p.stdin.writable) p.stdin.write(buf); });
      const exited = new Promise((resolve) => p.on('exit', resolve));
      poll = setInterval(readList, 500);
      const ok = await Promise.race([waitForSegment(0, 10000).then(() => true, () => false), exited.then(() => false)]);
      if (ok) {
        workingEncoder = name;
        p.on('exit', (code) => {
          if (proc !== p) return;
          log(`ffmpeg parou (${code}): ${err()}`);
          cleanup();
        });
        return name;
      }
      log(`encoder ${name} não funcionou: ${err()}`);
      cleanup();
      p.kill();
    }
    throw new Error('Não consegui gravar a tela neste PC.');
  }

  function cleanup() {
    if (pump) pump.stop();
    clearInterval(poll);
    pump = null;
    poll = null;
    proc = null;
  }

  // Fecha o som; com -shortest o ffmpeg termina o último pedaço e sai. Se demorar, encerra na força.
  async function stop() {
    if (!proc) return;
    const p = proc;
    cleanup();
    const exited = new Promise((resolve) => p.on('exit', resolve));
    p.stdin.end();
    const timer = setTimeout(() => p.kill(), 4000);
    await exited;
    clearTimeout(timer);
    readList();
  }

  async function withLocked(segs, fn) {
    segs.forEach((s) => locked.add(s.path));
    try {
      return await fn();
    } finally {
      segs.forEach((s) => locked.delete(s.path));
      prune();
    }
  }

  return {
    start,
    stop,
    isRunning: () => !!proc,
    // Ao fechar o app: no Windows o ffmpeg não morre junto sozinho.
    kill() { if (proc) { const p = proc; cleanup(); p.kill(); } },
    pushAudio(buf) { if (pump) pump.push(buf); },
    recordingSince: () => (recording ? recording.since : null),
    // Espera o pedaço atual fechar e junta os últimos `seconds` segundos.
    async saveLast(seconds, out) {
      if (!proc) throw new Error('A gravação dos últimos segundos está desligada.');
      const end = await waitForSegment(lastEnd());
      const segs = segments.filter((s) => s.end > end - seconds);
      return withLocked(segs, () => concat(ffmpeg, segs.map((s) => s.path), out, tmpDir));
    },
    startRecording() {
      if (!proc) throw new Error('A gravação não está rodando.');
      recording = { fromEnd: lastEnd(), since: Date.now() };
      return recording.since;
    },
    async stopRecording(out, { finalOnly = false } = {}) {
      if (!recording) return null;
      const rec = recording;
      if (!finalOnly && proc) await waitForSegment(lastEnd()).catch(() => {});
      const segs = segments.filter((s) => s.end > rec.fromEnd);
      recording = null;
      if (!segs.length) throw new Error('A gravação ficou vazia.');
      return withLocked(segs, () => concat(ffmpeg, segs.map((s) => s.path), out, tmpDir));
    },
  };
}

module.exports = { createRecorder, createPump, bufferArgs, parseSegmentList, run, ENCODERS, SEGMENT_S, KEEP_S };
