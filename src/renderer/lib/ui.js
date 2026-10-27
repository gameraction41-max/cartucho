// Pequenos ajudantes para montar a interface.

export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === false || v == null) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') {
      // Variáveis do CSS (--h) só entram com setProperty; Object.assign ignora sem avisar.
      for (const [prop, val] of Object.entries(v)) {
        if (prop.startsWith('--')) el.style.setProperty(prop, val);
        else el.style[prop] = val;
      }
    }
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'html') el.innerHTML = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export const SOURCE_NAME = { steam: 'Steam', prism: 'Prism Launcher', hytale: 'Hytale' };

export function hue(text) {
  let n = 0;
  for (const ch of String(text)) n = (n * 31 + ch.charCodeAt(0)) % 360;
  return n;
}

// Carrega a primeira imagem da lista que existir.
export function loadFirst(urls) {
  return new Promise((resolve) => {
    const list = [...(urls || [])];
    const next = () => {
      const url = list.shift();
      if (!url) return resolve(null);
      const img = new Image();
      img.onload = () => resolve(url);
      img.onerror = next;
      img.src = url;
    };
    next();
  });
}

// Cor de fundo da capa de cada loader do Minecraft, para dar para reconhecer a instância de longe.
const LOADER_HUE = { Vanilla: 125, Fabric: 38, Quilt: 280, Forge: 215, NeoForge: 18 };

// Capa gerada para as instâncias do Minecraft: um bloco de grama em pixel art sobre um fundo com a cor do loader.
// Os pixels variam com o nome da instância, então cada uma fica um pouco diferente.
function blockArt(game) {
  let seed = hue(game.title) + 1;
  const rand = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
  const px = [];
  const cube = { top: [[50, 40], [80, 57], [50, 74], [20, 57]], left: [[20, 57], [50, 74], [50, 108], [20, 91]], right: [[50, 74], [80, 57], [80, 91], [50, 108]] };
  const poly = (pts, fill) => `<polygon points="${pts.map((p) => p.join(',')).join(' ')}" fill="${fill}"/>`;
  // Manchas de textura em cada face, em losangos pequenos, como os pixels do Minecraft.
  for (let i = 0; i < 26; i++) {
    const u = rand();
    const v = rand();
    const face = i % 3;
    let x;
    let y;
    if (face === 0) { x = 20 + 30 * (u + v); y = 57 + 17 * (v - u); }
    else if (face === 1) { x = 20 + 30 * u; y = 57 + 17 * u + 34 * v; }
    else { x = 50 + 30 * u; y = 74 - 17 * u + 34 * v; }
    const shade = face === 0 ? (rand() > 0.5 ? '#6fb43a' : '#4e8a2a') : rand() > 0.5 ? '#7a5434' : '#5a3b22';
    px.push(`<rect x="${(x - 2).toFixed(1)}" y="${(y - 2).toFixed(1)}" width="4" height="4" fill="${shade}" opacity=".8"/>`);
  }
  // O fundo fica no CSS (--lh), assim o bloco cabe inteiro tanto nas capas verticais quanto nos cartões largos.
  return `<svg viewBox="10 30 80 92" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">
    <ellipse cx="50" cy="114" rx="30" ry="6" fill="#000" opacity=".35"/>
    ${poly(cube.left, '#6b4a2e')}${poly(cube.right, '#86603b')}${poly(cube.top, '#5c9e33')}
    ${poly([[20, 57], [50, 74], [50, 80], [20, 63]], '#4f8c2b')}${poly([[50, 74], [80, 57], [80, 63], [50, 80]], '#66a83a')}
    <g clip-path="none">${px.join('')}</g>
  </svg>`;
}

const DL_TEXT = { downloading: (d) => `${d.percent}%`, paused: () => 'Pausado', queued: () => 'Na fila' };

export function downloadText(d) {
  return (DL_TEXT[d.state] || DL_TEXT.queued)(d);
}

// Barra de download que o app.js atualiza no lugar pelo data-dl, sem redesenhar a tela.
export function dlBar(d, label = '') {
  return h('div', { class: `dl ${d.state !== 'downloading' ? 'paused' : ''}`, 'data-dl': d.key },
    h('div', { class: 'dl-top' }, label ? h('span', { class: 'dl-name' }, label) : null, h('span', { class: 'dl-pct mono' }, downloadText(d))),
    h('div', { class: 'bar' }, h('i', { style: { width: `${d.percent}%` } })));
}

export function cover(game, cls = '') {
  const isPrism = game.source === 'prism';
  const missing = game.installed === false;
  const el = h('div', { class: `cover ${cls} ${isPrism ? 'blocks' : ''} ${missing ? 'not-installed' : ''}`, style: { '--h': String(hue(game.title)) } },
    missing && !game.download ? h('span', { class: 'inst-tag' }, '⤓ Instalar') : null,
    game.download ? dlBar(game.download) : null,
    isPrism ? h('span', { class: 'mc-art', style: { '--lh': String(LOADER_HUE[game.loader] ?? 125) }, html: blockArt(game) }) : null,
    isPrism && game.loader ? h('span', { class: 'mc-tag' }, `${game.mcVersion || ''} ${game.loader}`.trim()) : null,
    h('span', { class: 't' }, game.title));
  const urls = game.art && game.art.cover;
  if (urls && urls.length) {
    const img = h('img', { alt: '', loading: 'lazy', decoding: 'async' });
    const list = [...urls];
    img.onerror = () => {
      const url = list.shift();
      if (url) img.src = url;
      else img.remove();
    };
    // No Minecraft, a imagem é o ícone da instância (fica pequeno, por cima do bloco), a não ser que seja uma capa escolhida pela pessoa.
    const customCover = (game.customArt || []).includes('cover');
    img.onload = () => {
      img.classList.add('loaded');
      const isCustom = customCover && img.src === new URL(urls[0], location.href).href;
      if (isPrism && !isCustom) el.classList.add('icon');
      else el.classList.add('has-art');
    };
    img.src = list.shift();
    el.prepend(img);
  }
  return el;
}

export function hours(minutes) {
  if (!minutes) return '0 h';
  if (minutes < 60) return `${minutes} min`;
  const h = minutes / 60;
  return `${h < 100 ? h.toFixed(1).replace('.', ',') : Math.round(h)} h`;
}

export function when(ms) {
  if (!ms) return 'nunca jogado';
  const days = Math.floor((startOfDay(Date.now()) - startOfDay(ms)) / 86400000);
  if (days <= 0) return 'hoje';
  if (days === 1) return 'ontem';
  if (days < 7) return `há ${days} dias`;
  return new Date(ms).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: days > 300 ? '2-digit' : undefined });
}

function startOfDay(ms) {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function sortRecent(games) {
  return [...games].sort((a, b) => (b.lastPlayed || 0) - (a.lastPlayed || 0) || (b.minutes || 0) - (a.minutes || 0));
}
