// Pequenos ajudantes para montar a interface.

export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === false || v == null) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
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

export function cover(game, cls = '') {
  const isPrism = game.source === 'prism';
  const el = h('div', { class: `cover ${cls} ${isPrism ? 'blocks' : ''}`, style: { '--h': String(hue(game.title)) } },
    h('i', { class: `dot ${game.source}` }),
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
    img.onload = () => {
      img.classList.add('loaded');
      if (isPrism) el.classList.add('icon');
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
