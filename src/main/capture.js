// Prints e vídeos feitos pelo próprio Cartucho, só de jogos abertos por ele.
// Imagem: Duplicação de Área de Trabalho do Windows pelo ffmpeg, codificada na placa de vídeo (recorder.js).
// Som: o som do PC (loopback), capturado numa janela escondida (capture.html) e mandado para cá.
// Os arquivos vão para Imagens\Cartucho\<jogo> e Vídeos\Cartucho\<jogo>.
const fs = require('node:fs');
const path = require('node:path');
const { app, BrowserWindow, desktopCapturer, ipcMain, screen, session } = require('electron');
const { createRecorder, run } = require('./recorder');
const notify = require('./notify');
const { safeName } = require('./screenshots');

const CLIP_S = 30;
// A gravação dos últimos 30 s começa um tempo depois de o jogo aparecer, e não no clique em Jogar: ligar a captura da
// tela bem quando o jogo está abrindo (trocando de resolução, entrando em tela cheia) dava engasgo e às vezes derrubava o ffmpeg.
const BUFFER_DELAY_MS = 20000;

let recorder = null;
let audioWin = null;
let game = null; // { key, title }
let busy = false;
let bufferTimer = null;
let opts = { buffer: () => true, onStatus: () => {}, log: () => {} };

function ffmpegPath() {
  try {
    const p = require('ffmpeg-static');
    return p ? p.replace('app.asar', 'app.asar.unpacked') : null;
  } catch {
    return null;
  }
}

function stamp(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`;
}

const roots = () => ({ pictures: path.join(app.getPath('pictures'), 'Cartucho'), videos: path.join(app.getPath('videos'), 'Cartucho') });

function outFile(kind, ext) {
  const name = safeName(game.title);
  return path.join(roots()[kind], name, `${name} ${stamp()}.${ext}`);
}

function status() {
  return { game: game ? game.title : null, buffer: !!(recorder && recorder.isRunning()), recording: recorder ? recorder.recordingSince() : null };
}

function changed() {
  const s = status();
  notify.setRecording(s.recording);
  opts.onStatus(s);
}

// ===== som =====

function startAudio() {
  if (audioWin) return;
  audioWin = new BrowserWindow({
    show: false,
    skipTaskbar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: true,
      backgroundThrottling: false,
      autoplayPolicy: 'no-user-gesture-required',
    },
  });
  audioWin.on('closed', () => { audioWin = null; });
  audioWin.loadFile(path.join(__dirname, '..', 'renderer', 'capture.html'));
}

function stopAudio() {
  if (audioWin && !audioWin.isDestroyed()) audioWin.destroy();
  audioWin = null;
}

// ===== gravação contínua =====

async function startBuffer() {
  if (recorder && recorder.isRunning()) return true;
  const ffmpeg = ffmpegPath();
  if (!ffmpeg) return false;
  if (!recorder) recorder = createRecorder({ ffmpeg, tmpDir: path.join(app.getPath('temp'), 'cartucho-gravacao'), log: opts.log });
  startAudio();
  try {
    await recorder.start();
    changed();
    return true;
  } catch (err) {
    opts.log(`gravação: ${err.message}`);
    stopAudio();
    return false;
  }
}

async function stopBuffer() {
  if (recorder) await recorder.stop();
  stopAudio();
  changed();
}

// ===== ações =====

function needGame() {
  if (game) return true;
  notify.show({ title: 'Nenhum jogo aberto', text: 'Abra um jogo pelo Cartucho para tirar prints e gravar.', kind: 'error' });
  return false;
}

// Print da tela: ffmpeg pela Duplicação de Área de Trabalho; se falhar, pelo próprio Electron.
async function screenshot() {
  if (!needGame()) return;
  const out = outFile('pictures', 'png');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  try {
    const ffmpeg = ffmpegPath();
    if (!ffmpeg) throw new Error('sem ffmpeg');
    await run(ffmpeg, ['-hide_banner', '-nostats', '-y', '-f', 'lavfi', '-i', 'ddagrab=output_idx=0:draw_mouse=0,hwdownload,format=bgra', '-frames:v', '1', out]);
  } catch (err) {
    opts.log(`print pelo ffmpeg: ${err.message}`);
    const { width, height } = screen.getPrimaryDisplay().size;
    const f = screen.getPrimaryDisplay().scaleFactor;
    const [src] = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: width * f, height: height * f } });
    if (!src) throw new Error('Não consegui capturar a tela.');
    fs.writeFileSync(out, src.thumbnail.toPNG());
  }
  notify.show({ title: 'Print salvo', text: game.title, kind: 'shot' });
}

async function saveClip() {
  if (!needGame() || busy) return;
  if (!recorder || !recorder.isRunning()) {
    notify.show({ title: 'Últimos 30 s desligado', text: 'Ligue em Configurações > Capturas.', kind: 'error' });
    return;
  }
  busy = true;
  notify.show({ title: 'Salvando os últimos 30 s…', text: game.title, kind: 'clip' });
  try {
    await recorder.saveLast(CLIP_S, outFile('videos', 'mp4'));
    notify.show({ title: 'Clipe salvo', text: `Últimos 30 s de ${game.title}`, kind: 'clip' });
  } finally {
    busy = false;
  }
}

async function toggleRecording() {
  if (!needGame() || busy) return;
  if (recorder && recorder.recordingSince()) return finishRecording();
  if (!(await startBuffer())) throw new Error('Não consegui começar a gravar.');
  recorder.startRecording();
  notify.show({ title: 'Gravando', text: game.title, kind: 'rec' });
  changed();
}

async function finishRecording({ finalOnly = false } = {}) {
  if (!recorder || !recorder.recordingSince()) return;
  busy = true;
  const title = game ? game.title : '';
  const out = outFile('videos', 'mp4');
  notify.setRecording(null);
  try {
    await recorder.stopRecording(out, { finalOnly });
    notify.show({ title: 'Gravação salva', text: title, kind: 'rec' });
  } finally {
    busy = false;
    changed();
    // Sem os últimos 30 s ligados, a gravação contínua só existia por causa desta gravação.
    if (!finalOnly && !opts.buffer()) await stopBuffer();
  }
}

// Erros viram aviso na tela, para nunca derrubar o app.
const safe = (fn) => async () => {
  try {
    await fn();
  } catch (err) {
    opts.log(`captura: ${err.message}`);
    notify.show({ title: 'Não deu para capturar', text: err.message, kind: 'error' });
    changed();
  }
};

const actions = { screenshot: safe(screenshot), clip: safe(saveClip), record: safe(toggleRecording) };

// ===== ciclo do jogo =====

function gameStarted(running) {
  game = { key: running.key, title: running.title };
  changed();
}

// O processo do jogo apareceu (watch.js): agenda o começo dos últimos 30 s.
function gameRunning() {
  if (!game || bufferTimer) return;
  bufferTimer = setTimeout(() => {
    bufferTimer = null;
    if (game && opts.buffer()) startBuffer().catch(() => {});
  }, BUFFER_DELAY_MS);
}

async function gameEnded() {
  clearTimeout(bufferTimer);
  bufferTimer = null;
  if (!game) return;
  try {
    if (recorder && recorder.recordingSince()) {
      await recorder.stop();
      await finishRecording({ finalOnly: true });
    }
  } catch (err) {
    opts.log(`captura: ${err.message}`);
  }
  await stopBuffer();
  game = null;
  changed();
}

// Liga ou desliga os últimos 30 s no meio do jogo, quando a pessoa muda a opção.
async function setBuffer(on) {
  if (!game) return;
  if (on) await startBuffer();
  else if (!(recorder && recorder.recordingSince())) await stopBuffer();
}

function setup(options) {
  opts = { ...opts, ...options };
  // Só a janela escondida de som pede a tela, e só para pegar o som do PC (a imagem é descartada lá).
  session.defaultSession.setDisplayMediaRequestHandler((request, callback) => {
    const ok = audioWin && !audioWin.isDestroyed() && request.frame && request.frame === audioWin.webContents.mainFrame;
    if (!ok) return callback({});
    desktopCapturer.getSources({ types: ['screen'] })
      .then(([src]) => callback(src ? { video: src, audio: 'loopback' } : {}))
      .catch(() => callback({}));
  });
  ipcMain.on('capture:audio', (_e, data) => {
    if (recorder && data instanceof Uint8Array) recorder.pushAudio(Buffer.from(data.buffer, data.byteOffset, data.byteLength));
  });
  ipcMain.on('capture:audio-error', (_e, msg) => opts.log(`som da gravação: ${String(msg).slice(0, 300)}`));
}

function shutdown() {
  if (recorder) recorder.kill();
}

module.exports = { setup, shutdown, gameStarted, gameRunning, gameEnded, setBuffer, status, actions, roots, safeName, stamp };
