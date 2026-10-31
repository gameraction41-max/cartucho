// Animação de abertura: a câmera chega no console, o cartucho desce e entra na fenda, a chave liga,
// a luz acende e o nome aparece. Dura uns 4 segundos e qualquer botão pula. Desliga em Configurações › Modo console.
import { h } from './ui.js';

const TOTAL_MS = 4400;

// O console visto de cima e de frente: tampa com a fenda, chave POWER, botão RESET, saídas de ar,
// frente com a luz, o nome gravado e duas entradas de controle. Cada parte que mexe tem a sua classe.
const CONSOLE_SVG = `
<svg class="intro-console" viewBox="0 0 1000 440" aria-hidden="true">
  <defs>
    <linearGradient id="ic-top" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2a3263"/><stop offset="1" stop-color="#3a4480"/></linearGradient>
    <linearGradient id="ic-front" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1c2249"/><stop offset=".55" stop-color="#13173a"/><stop offset="1" stop-color="#0c0f26"/></linearGradient>
    <linearGradient id="ic-lip" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5a66b0"/><stop offset="1" stop-color="#2a3263"/></linearGradient>
    <linearGradient id="ic-bay" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#05060e"/><stop offset="1" stop-color="#1a1f44"/></linearGradient>
    <linearGradient id="ic-knob" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e9e8f1"/><stop offset="1" stop-color="#9c9aae"/></linearGradient>
    <linearGradient id="ic-sweep" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".28"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
    <radialGradient id="ic-floor" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#000" stop-opacity=".75"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>
    <radialGradient id="ic-glow" cx=".5" cy=".7" r=".5"><stop offset="0" stop-color="#ffb85c" stop-opacity=".7"/><stop offset=".45" stop-color="#f2a541" stop-opacity=".2"/><stop offset="1" stop-color="#f2a541" stop-opacity="0"/></radialGradient>
    <radialGradient id="ic-dust" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#c8d2ff" stop-opacity=".45"/><stop offset="1" stop-color="#c8d2ff" stop-opacity="0"/></radialGradient>
    <filter id="ic-blur" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="9"/></filter>
    <filter id="ic-shadow" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="10" stdDeviation="12" flood-color="#000" flood-opacity=".5"/></filter>
    <clipPath id="ic-slot"><rect x="0" y="-2000" width="1000" height="2157.5"/></clipPath>
    <clipPath id="ic-body"><path d="M170 96H830Q850 96 858 112L952 252V352Q952 384 920 384H80Q48 384 48 352V252L142 112Q150 96 170 96Z"/></clipPath>
  </defs>

  <ellipse cx="500" cy="398" rx="520" ry="40" fill="url(#ic-floor)"/>
  <g class="ic-feet" fill="#07091a"><rect x="110" y="380" width="90" height="14" rx="5"/><rect x="800" y="380" width="90" height="14" rx="5"/></g>

  <!-- tampa -->
  <path d="M170 96H830Q850 96 858 112L952 252H48L142 112Q150 96 170 96Z" fill="url(#ic-top)"/>
  <path d="M172 97.5H828" stroke="#fff" stroke-opacity=".14" stroke-width="2"/>
  <g stroke="#0a0c20" stroke-opacity=".7" stroke-width="5" stroke-linecap="round">
    <path d="M186 122H330M176 138H326M166 154H322"/>
    <path d="M670 122H814M674 138H824M678 154H834"/>
  </g>
  <g stroke="#fff" stroke-opacity=".07" stroke-width="2" stroke-linecap="round">
    <path d="M186 126H330M176 142H326M166 158H322"/>
    <path d="M670 126H814M674 142H824M678 158H834"/>
  </g>

  <!-- encaixe do cartucho -->
  <path d="M378 112H622Q632 112 636 121L668 200H332L364 121Q368 112 378 112Z" fill="url(#ic-bay)"/>
  <path d="M332 200H668" stroke="#7f8ad0" stroke-opacity=".55" stroke-width="3"/>
  <rect x="384" y="150" width="232" height="15" rx="7.5" fill="#000"/>
  <path d="M392 166.5H608" stroke="#fff" stroke-opacity=".12" stroke-width="2"/>

  <!-- luz que sai da fenda, o cartucho (cortado na fenda, para parecer que entra) e a poeira do encaixe -->
  <ellipse class="ic-bay-glow" cx="500" cy="130" rx="300" ry="140" fill="url(#ic-glow)" opacity="0"/>
  <g clip-path="url(#ic-slot)"><image class="ic-cart" href="img/logo.svg" x="332" y="-92" width="336" height="336" filter="url(#ic-shadow)"/></g>
  <ellipse class="ic-dust l" cx="380" cy="160" rx="50" ry="18" fill="url(#ic-dust)" opacity="0"/>
  <ellipse class="ic-dust r" cx="620" cy="160" rx="50" ry="18" fill="url(#ic-dust)" opacity="0"/>
  <g class="ic-sparks"></g>

  <!-- chave POWER -->
  <rect x="160" y="196" width="128" height="30" rx="15" fill="#0a0c1f"/>
  <rect x="160" y="196" width="128" height="30" rx="15" fill="none" stroke="#fff" stroke-opacity=".08" stroke-width="2"/>
  <rect class="ic-power-fill" x="166" y="202" width="116" height="18" rx="9" fill="#f2a541" opacity="0"/>
  <g class="ic-switch"><rect x="166" y="200" width="56" height="22" rx="11" fill="url(#ic-knob)"/><path d="M186 205V217M194 205V217M202 205V217" stroke="#6f6d82" stroke-width="2.5" stroke-linecap="round"/></g>
  <text x="224" y="248" text-anchor="middle" class="ic-label">POWER</text>

  <!-- botão RESET -->
  <rect x="712" y="196" width="128" height="30" rx="15" fill="#0a0c1f"/>
  <rect class="ic-reset" x="722" y="200" width="108" height="22" rx="11" fill="#2c3466" stroke="#fff" stroke-opacity=".12" stroke-width="2"/>
  <text x="776" y="248" text-anchor="middle" class="ic-label">RESET</text>

  <!-- quina entre a tampa e a frente -->
  <path d="M48 252H952V262H48Z" fill="url(#ic-lip)"/>
  <path d="M48 252.5H952" stroke="#fff" stroke-opacity=".3" stroke-width="2"/>

  <!-- frente -->
  <path d="M48 262H952V352Q952 384 920 384H80Q48 384 48 352Z" fill="url(#ic-front)"/>
  <path d="M60 296H940" stroke="#f2a541" stroke-opacity=".22" stroke-width="2"/>
  <path class="ic-stripe" d="M60 296H940" stroke="#f2a541" stroke-width="3" stroke-dasharray="880" stroke-dashoffset="880"/>

  <circle class="ic-led-glow" cx="104" cy="330" r="20" fill="#f2a541" filter="url(#ic-blur)" opacity="0"/>
  <circle class="ic-led" cx="104" cy="330" r="7" fill="#2c3360"/>
  <text x="128" y="335" class="ic-label small">ON</text>

  <text x="500" y="342" text-anchor="middle" class="ic-name ic-name-hi">CARTUCHO</text>
  <text x="500" y="340" text-anchor="middle" class="ic-name">CARTUCHO</text>

  <g fill="#060814" stroke="#fff" stroke-opacity=".09" stroke-width="2">
    <rect x="764" y="312" width="64" height="38" rx="9"/><rect x="850" y="312" width="64" height="38" rx="9"/>
  </g>
  <g fill="#3a4170"><rect x="776" y="328" width="40" height="6" rx="3"/><rect x="862" y="328" width="40" height="6" rx="3"/></g>
  <text x="796" y="370" text-anchor="middle" class="ic-label small">1</text>
  <text x="882" y="370" text-anchor="middle" class="ic-label small">2</text>

  <!-- reflexo que passa pelo console -->
  <g clip-path="url(#ic-body)"><rect class="ic-sweep" x="-260" y="80" width="200" height="320" fill="url(#ic-sweep)" transform="skewX(-18)"/></g>
</svg>`;

export function playIntro({ sfx, onDone }) {
  const console_ = h('div', { class: 'intro-console-wrap' });
  console_.innerHTML = CONSOLE_SVG;
  // Faíscas que sobem da fenda quando o console liga, cada uma num lugar e num tempo.
  const sparks = console_.querySelector('.ic-sparks');
  for (let i = 0; i < 18; i++) {
    const s = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    s.setAttribute('cx', (500 + (Math.random() * 2 - 1) * 190).toFixed(0));
    s.setAttribute('cy', '158');
    s.setAttribute('r', (2.5 + Math.random() * 3).toFixed(1));
    s.style.cssText = `--d:${(Math.random() * 0.9).toFixed(2)}s;--r:${(150 + Math.random() * 170).toFixed(0)}px`;
    sparks.append(s);
  }
  const word = h('div', { class: 'intro-word', 'data-text': 'CARTUCHO' },
    ...[...'CARTUCHO'].map((c, i) => h('span', { class: i >= 5 ? 'hi' : '', style: `--i:${i}` }, c)));
  const el = h('div', { class: 'intro' },
    h('div', { class: 'intro-spot' }),
    h('div', { class: 'intro-camera' },
      h('div', { class: 'intro-stage' },
        console_),
      h('div', { class: 'intro-brand' }, word, h('div', { class: 'intro-line' }))),
    h('div', { class: 'intro-vignette' }));
  document.body.append(el);
  requestAnimationFrame(() => el.classList.add('play'));

  const timers = [
    // O encaixe: tranco no console e estalo; logo depois a chave liga e toca o som de ligar.
    setTimeout(() => sfx.insert(), 1400),
    setTimeout(() => sfx.boot(), 1850),
    setTimeout(() => finish(), TOTAL_MS),
  ];

  let done = false;
  function finish() {
    if (done) return;
    done = true;
    timers.forEach(clearTimeout);
    el.classList.add('leaving');
    setTimeout(() => el.remove(), 600);
    onDone();
  }
  return () => finish();
}
