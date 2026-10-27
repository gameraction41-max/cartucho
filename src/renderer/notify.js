// Avisos no canto da tela durante o jogo: o toast de print/clipe salvo e o selo de gravação com o tempo.
const ICON = { shot: '📷', clip: '⏪', rec: '●', error: '!' };
const recEl = document.getElementById('nrec');
const toastEl = document.getElementById('ntoast');
let recSince = null;
let toastTimer = null;

const mmss = (ms) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${m}:${ss}` : `${m}:${ss}`;
};

setInterval(() => {
  if (recSince) recEl.querySelector('b').textContent = mmss(Date.now() - recSince);
}, 500);

window.cartucho.on('notify:show', ({ toast, recording }) => {
  recSince = recording;
  recEl.hidden = !recording;
  if (recording) recEl.querySelector('b').textContent = mmss(Date.now() - recording);
  if (!toast) return;
  toastEl.className = `k-${toast.kind || 'ok'}`;
  toastEl.querySelector('i').textContent = ICON[toast.kind] || '✓';
  toastEl.querySelector('b').textContent = toast.title;
  toastEl.querySelector('small').textContent = toast.text || '';
  toastEl.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toastEl.hidden = true; }, 3000);
});
