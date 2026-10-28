// Modo sofá na interface: as capas dos jogos passando na tela, a contagem antes de desligar a tela ou o PC,
// e o aviso de uso para o processo principal (main/sofa.js).
// Qualquer botão cancela a contagem. O botão que liga a tela de volta não faz mais nada, para não abrir um jogo sem querer.
import { h, hue, hours, loadFirst } from './ui.js';

export const SOFA_ACTIONS = {
  off: { label: 'Desligado', desc: 'O Cartucho nunca desliga nada sozinho' },
  covers: { label: 'Mostrar as capas', desc: 'As artes dos seus jogos passam na tela até você apertar um botão' },
  screen: { label: 'Desligar a tela', desc: 'A tela apaga e volta com qualquer botão do controle', title: 'A tela vai desligar' },
  sleep: { label: 'Suspender o PC', desc: 'O PC dorme e acorda rápido, com tudo como estava', title: 'O PC vai suspender' },
  shutdown: { label: 'Desligar o PC', desc: 'O PC desliga de vez', title: 'O PC vai desligar' },
};
export const SOFA_MINUTES = [5, 10, 15, 20, 30, 45, 60, 90, 120];

// Avisos de uso vão para o processo principal no máximo a cada poucos segundos, a não ser que tenha contagem na tela.
const REPORT_EVERY = 5000;
// Depois que a tela liga, os botões ainda apertados não contam.
const WAKE_GRACE = 700;
// Quanto tempo cada jogo fica na tela no descanso com capas.
const SLIDE_MS = 9000;

export function minutesText(m) {
  return m < 60 ? `${m} min` : m % 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m / 60} h`;
}

export function createSofa({ api, root, saver, sfx, hints, setMusicPaused, games }) {
  let countdown = null; // { until, timer }
  let resting = null; // 'covers' ou 'screen'
  let slides = null; // { list, i, timer }
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

  // Descanso com capas: um jogo por vez, com o fundo do jogo devagar se aproximando. Os jogados mais recentemente aparecem primeiro.
  async function nextSlide() {
    if (!slides) return;
    const g = slides.list[slides.i++ % slides.list.length];
    const urls = g.art ? [...(g.art.hero || []), ...(g.source === 'prism' ? [] : g.art.cover || [])] : [];
    const url = urls.length ? await loadFirst(urls) : null;
    if (!slides) return;
    const hh = hue(g.title);
    const slide = h('div', { class: 'saver-slide' },
      h('div', { class: 'saver-img', style: { backgroundImage: url ? `url("${url}")` : `radial-gradient(circle at 70% 35%, hsl(${hh} 55% 42%) 0%, hsl(${hh} 50% 16%) 40%, hsl(${hh} 40% 5%) 80%)` } }),
      h('div', { class: 'saver-info' }, h('b', {}, g.title), g.minutes ? h('span', {}, `${hours(g.minutes)} jogadas`) : null));
    saver.querySelector('.saver-slides').append(slide);
    saver.querySelector('.clock').textContent = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    requestAnimationFrame(() => requestAnimationFrame(() => slide.classList.add('on')));
    // A anterior some depois que a nova já apareceu.
    const old = [...saver.querySelectorAll('.saver-slide')].slice(0, -1);
    setTimeout(() => old.forEach((el) => el.remove()), 2000);
    slides.timer = setTimeout(nextSlide, SLIDE_MS);
  }

  function showCovers() {
    const list = games().filter((g) => g.installed !== false || g.minutes).sort((a, b) => (b.lastPlayed || 0) - (a.lastPlayed || 0));
    if (!list.length) return;
    saver.replaceChildren(h('div', { class: 'saver-slides' }),
      h('div', { class: 'saver-top' }, h('span', { class: 'clock' }), h('small', {}, 'Aperte qualquer botão para voltar')));
    saver.hidden = false;
    requestAnimationFrame(() => saver.classList.add('show'));
    slides = { list, i: 0, timer: null };
    nextSlide();
  }

  function hideCovers() {
    if (!slides) return;
    clearTimeout(slides.timer);
    slides = null;
    saver.classList.remove('show');
    setTimeout(() => { if (!slides) saver.hidden = true; }, 500);
  }

  function rest(mode) {
    resting = mode;
    if (!mode) graceUntil = Date.now() + WAKE_GRACE;
    if (mode === 'covers') showCovers();
    else hideCovers();
    setMusicPaused(mode === 'screen');
  }

  // Chamado em toda ação do controle ou teclado. Devolve true quando a ação foi usada só para acordar ou cancelar.
  function input() {
    const now = Date.now();
    const swallow = !!countdown || !!resting || now < graceUntil;
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
  api.on('sofa:rest', ({ mode }) => rest(mode));

  return { input, warn, rest, get open() { return !!countdown; } };
}
