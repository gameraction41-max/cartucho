// Animação de abertura: o cartucho desce, encaixa no console, a luz acende e o nome aparece.
// Dura uns 3 segundos e qualquer botão pula. Desliga em Configurações › Modo console.
import { h } from './ui.js';

const TOTAL_MS = 3200;

export function playIntro({ sfx, onDone }) {
  const el = h('div', { class: 'intro' },
    h('div', { class: 'intro-stage' },
      h('img', { class: 'intro-cart', src: 'img/logo.svg', alt: '' }),
      h('div', { class: 'intro-console' },
        h('span', { class: 'intro-slot' }),
        h('span', { class: 'intro-flash' }),
        h('span', { class: 'intro-led' }),
        h('span', { class: 'intro-vents' }))),
    h('div', { class: 'intro-word' }, 'CARTU', h('span', {}, 'CHO')));
  document.body.append(el);
  requestAnimationFrame(() => el.classList.add('play'));

  const timers = [
    // O encaixe: tranco no console, estalo e a luz acendendo.
    setTimeout(() => sfx.insert(), 1150),
    setTimeout(() => sfx.boot(), 1500),
    setTimeout(() => finish(), TOTAL_MS),
  ];

  let done = false;
  function finish() {
    if (done) return;
    done = true;
    timers.forEach(clearTimeout);
    el.classList.add('leaving');
    setTimeout(() => el.remove(), 500);
    onDone();
  }
  return () => finish();
}
