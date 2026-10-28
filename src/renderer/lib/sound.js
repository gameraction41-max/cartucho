// Sons de navegação e música tema. Tudo é gerado na hora com Web Audio, então o app não precisa de arquivos de som.
// Se o usuário escolher um arquivo de música nas configurações, ele toca no lugar da trilha gerada.

let ctx = null;
let master = null;
let sfxGain = null;
let musicGain = null;
let settings = { sounds: true, music: true, volume: 0.5, musicFile: '' };
let pad = null;
let audioEl = null;
let paused = false;
let gameTrack = null; // música do jogo selecionado, no lugar da música tema
let quietTimer = null;
// Tempo para a música sumir antes de parar de vez (o volume cai com constante de 0,4 s).
const FADE_MS = 2500;

function ensure() {
  if (ctx) return;
  ctx = new AudioContext();
  master = ctx.createGain();
  master.connect(ctx.destination);
  sfxGain = ctx.createGain();
  sfxGain.connect(master);
  musicGain = ctx.createGain();
  musicGain.gain.value = 0;
  musicGain.connect(master);
  applyVolume();
}

function applyVolume() {
  if (!ctx) return;
  master.gain.setTargetAtTime(settings.volume, ctx.currentTime, 0.05);
  sfxGain.gain.value = settings.sounds ? 0.5 : 0;
  if (audioEl) audioEl.volume = settings.volume * 0.6;
}

function blip(freq, { dur = 0.07, type = 'sine', gain = 0.25, slide = 0 } = {}) {
  if (!settings.sounds) return;
  ensure();
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  const t = ctx.currentTime;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(freq * slide, t + dur);
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(sfxGain);
  o.start(t);
  o.stop(t + dur + 0.02);
}

export const sfx = {
  move: () => blip(880, { dur: 0.045, gain: 0.12 }),
  confirm: () => { blip(660, { dur: 0.08, gain: 0.2 }); setTimeout(() => blip(990, { dur: 0.12, gain: 0.18 }), 60); },
  back: () => blip(520, { dur: 0.1, gain: 0.18, slide: 0.6 }),
  tab: () => blip(740, { dur: 0.06, type: 'triangle', gain: 0.14 }),
  achievement: () => { [784, 988, 1319].forEach((f, i) => setTimeout(() => blip(f, { dur: 0.22, gain: 0.14, type: 'triangle' }), i * 110)); },
  error: () => blip(180, { dur: 0.2, type: 'square', gain: 0.08 }),
  // Cartucho encaixando: um tranco grave e o estalo da trava.
  insert: () => { blip(150, { dur: 0.16, type: 'sine', gain: 0.35, slide: 0.5 }); setTimeout(() => blip(2400, { dur: 0.03, type: 'square', gain: 0.05 }), 70); },
  boot: () => { [330, 494, 659, 988].forEach((f, i) => setTimeout(() => blip(f, { dur: 0.5, gain: 0.12, type: 'triangle' }), i * 140)); },
};

// Trilha ambiente: acordes lentos (Lá menor, Fá, Dó, Sol) com um filtro suave, no clima de menu de console.
const CHORDS = [[220, 261.63, 329.63], [174.61, 220, 261.63], [196, 261.63, 329.63], [196, 246.94, 293.66]];
const CHORD_SECONDS = 8;

function startPad() {
  if (pad) return;
  ensure();
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 900;
  filter.connect(musicGain);
  let i = 0;
  const play = () => {
    const t = ctx.currentTime;
    for (const f of CHORDS[i % CHORDS.length]) {
      for (const detune of [-6, 6]) {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = 'sine';
        o.frequency.value = f;
        o.detune.value = detune;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.05, t + 2.5);
        g.gain.exponentialRampToValueAtTime(0.0001, t + CHORD_SECONDS + 2);
        o.connect(g).connect(filter);
        o.start(t);
        o.stop(t + CHORD_SECONDS + 2.2);
      }
    }
    i++;
  };
  play();
  pad = setInterval(play, CHORD_SECONDS * 1000);
}

function stopPad() {
  clearInterval(pad);
  pad = null;
}

function fileUrl(path) {
  return 'file:///' + path.replace(/\\/g, '/').replace(/^\/+/, '').split('/').map((p, i) => (i === 0 && /^[a-z]:$/i.test(p) ? p : encodeURIComponent(p))).join('/');
}

function refreshMusic() {
  ensure();
  const want = settings.music && !paused;
  const file = gameTrack || settings.musicFile;
  if (audioEl && (!want || !file || audioEl.dataset.src !== file)) {
    audioEl.pause();
    audioEl = null;
  }
  clearTimeout(quietTimer);
  if (!want) {
    musicGain.gain.setTargetAtTime(0, ctx.currentTime, 0.4);
    // Depois de sumir, a trilha para de verdade em vez de seguir tocando em silêncio. Com o Cartucho atrás do jogo,
    // o áudio inteiro dorme e não gasta nada; um som de aviso acorda ele (blip).
    quietTimer = setTimeout(() => {
      stopPad();
      if (paused && ctx.state === 'running') ctx.suspend().catch(() => {});
    }, FADE_MS);
    return;
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  if (file) {
    stopPad();
    musicGain.gain.value = 0;
    if (!audioEl) {
      audioEl = new Audio(fileUrl(file));
      audioEl.dataset.src = file;
      audioEl.loop = true;
      audioEl.volume = settings.volume * 0.6;
      audioEl.play().catch(() => {});
    }
  } else {
    startPad();
    musicGain.gain.setTargetAtTime(1, ctx.currentTime, 0.8);
  }
}

export function configureSound(next) {
  settings = { ...settings, ...next };
  ensure();
  applyVolume();
  refreshMusic();
}

// Jogo com música própria selecionado: ela toca no lugar da música tema. null volta para a tema.
export function setGameTrack(file) {
  if ((file || null) === gameTrack) return;
  gameTrack = file || null;
  if (ctx) refreshMusic();
}

// Quando um jogo abre, o launcher perde o foco e a música para, como num console.
export function setMusicPaused(value) {
  paused = value;
  if (ctx) refreshMusic();
}
