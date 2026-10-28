// Modo sofá na interface: a contagem antes de desligar a tela ou o PC, e o aviso de uso para o processo principal (main/sofa.js).
// Qualquer botão cancela a contagem. O botão que liga a tela de volta não faz mais nada, para não abrir um jogo sem querer.
import { h } from './ui.js';

export const SOFA_ACTIONS = {
  off: { label: 'Desligado', desc: 'O Cartucho nunca desliga nada sozinho' },
  screen: { label: 'Desligar a tela', desc: 'A tela apaga e volta com qualquer botão do controle', title: 'A tela vai desligar' },
  sleep: { label: 'Suspender o PC', desc: 'O PC dorme e acorda rápido, com tudo como estava', title: 'O PC vai suspender' },
  shutdown: { label: 'Desligar o PC', desc: 'O PC desliga de vez', title: 'O PC vai desligar' },
};
export const SOFA_MINUTES = [5, 10, 15, 20, 30, 45, 60, 90, 120];

// Avisos de uso vão para o processo principal no máximo a cada poucos segundos, a não ser que tenha contagem na tela.
const REPORT_EVERY = 5000;
// Depois que a tela liga, os botões ainda apertados não contam.
const WAKE_GRACE = 700;

export function minutesText(m) {
  return m < 60 ? `${m} min` : m % 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m / 60} h`;
}

export function createSofa({ api, root, sfx, hints, setMusicPaused }) {
  let countdown = null; // { until, timer }
  let screenOff = false;
  let graceUntil = 0;
  let reported = 0;

  const close = () => {
    if (!countdown) return;
    clearInterval(countdown.timer);
    countdown = null;
    root.classList.remove('show');
    setTimeout(() => { if (!countdown) root.hidden = true; }, 300);
  };

  const draw = () => {
    const left = Math.max(0, Math.ceil((countdown.until - Date.now()) / 1000));
    root.querySelector('.sofa-num').textContent = left;
    root.querySelector('.sofa-ring').style.setProperty('--p', left / countdown.seconds);
    if (left > 0 && left <= 5 && left !== countdown.last) sfx.move();
    countdown.last = left;
  };

  function warn({ action, seconds }) {
    close();
    const info = SOFA_ACTIONS[action] || SOFA_ACTIONS.screen;
    root.replaceChildren(h('div', { class: 'sofa-box' },
      h('div', { class: 'sofa-ring' }, h('span', { class: 'sofa-num' }, seconds)),
      h('small', {}, 'Modo sofá'),
      h('b', {}, info.title),
      h('p', {}, 'O Cartucho ficou parado por um tempo. Aperte qualquer botão para continuar.'),
      h('div', { class: 'sofa-hint' }, ...hints([['confirm', 'Continuar']]))));
    root.hidden = false;
    requestAnimationFrame(() => root.classList.add('show'));
    countdown = { until: Date.now() + seconds * 1000, seconds, last: seconds, timer: setInterval(draw, 250) };
    sfx.tab();
  }

  function setScreen(off) {
    screenOff = off;
    if (!off) graceUntil = Date.now() + WAKE_GRACE;
    setMusicPaused(off);
  }

  // Chamado em toda ação do controle ou teclado. Devolve true quando a ação foi usada só para acordar ou cancelar.
  function input() {
    const now = Date.now();
    const swallow = !!countdown || screenOff || now < graceUntil;
    if (swallow || now - reported > REPORT_EVERY) {
      reported = now;
      api.sofaActivity().catch(() => {});
    }
    if (countdown) {
      close();
      sfx.back();
    }
    return swallow;
  }

  api.on('sofa:warn', warn);
  api.on('sofa:cancel', close);
  api.on('sofa:screen', ({ off }) => setScreen(off));

  return { input, warn, get open() { return !!countdown; } };
}
