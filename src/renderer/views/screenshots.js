// Capturas: prints e vídeos feitos pelo Cartucho e prints da Steam, separados por jogo.
// A abre em tela cheia; nela, esquerda e direita passam as fotos, A dá play no clipe, X apaga (com confirmação) e B volta para a grade.
import { h, when, keyPill, segBar } from '../lib/ui.js';

const CACHE_MS = 15 * 1000;
const SOURCE = { cartucho: 'Cartucho', steam: 'Steam' };
let cache = null; // { at, groups }
let filterKey = 'all';
let kind = 'prints'; // 'prints' ou 'videos'
let reopenAt = -1; // depois de apagar, a tela cheia volta aberta na captura seguinte
const KINDS = [{ id: 'prints', label: 'Prints', test: (s) => !s.video }, { id: 'videos', label: 'Vídeos', test: (s) => s.video }];

const fullDate = (ms) => new Date(ms).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

async function load(ctx) {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.groups;
  const games = ctx.state.games.map((g) => ({ key: g.key, title: g.title, appid: g.appid }));
  const groups = (await ctx.api.screenshots(games)) || [];
  cache = { at: Date.now(), groups };
  return groups;
}

function thumb(s) {
  if (s.video && !s.thumb) return h('video', { src: `${s.url}#t=1`, muted: true, preload: 'metadata' });
  return h('img', { src: s.thumb || s.url, loading: 'lazy', decoding: 'async', alt: '' });
}

export default {
  label: 'Capturas',
  async render(ctx) {
    const groups = await load(ctx);
    const total = groups.reduce((n, g) => n + g.shots.length, 0);
    if (!total) {
      return {
        el: h('div', { class: 'empty', style: { marginTop: 'auto', marginBottom: '6rem' } },
          h('h2', {}, 'Nenhuma captura ainda'),
          h('p', {}, 'Com um jogo aberto pelo Cartucho, Xbox + Y tira print, Xbox + X salva os últimos 30 segundos e Xbox + RB grava. Também dá pelo menu do botão Xbox. Os prints da Steam (F12) aparecem aqui junto.')),
        hints: [['menu', 'Menu']],
      };
    }

    // Prints e vídeos ficam separados; cada jogo só aparece se tiver algo do tipo escolhido.
    const kindTest = KINDS.find((k) => k.id === kind).test;
    const counts = Object.fromEntries(KINDS.map((k) => [k.id, groups.reduce((n, g) => n + g.shots.filter(k.test).length, 0)]));
    const byKind = groups.map((g) => ({ ...g, shots: g.shots.filter(kindTest) })).filter((g) => g.shots.length);
    if (filterKey !== 'all' && !byKind.some((g) => g.key === filterKey)) filterKey = 'all';
    const filters = [{ key: 'all', title: 'Todos os jogos', count: counts[kind] }, ...byKind.map((g) => ({ key: g.key, title: g.title, count: g.shots.length }))];
    const picked = filterKey === 'all' ? byKind : byKind.filter((g) => g.key === filterKey);
    const shots = picked.flatMap((g) => g.shots.map((s) => ({ ...s, game: g.title }))).sort((a, b) => b.at - a.at);

    const setFilter = (key) => { filterKey = key; ctx.sfx.tab(); ctx.rerender(); };
    const setKind = (id) => { kind = id; filterKey = 'all'; ctx.sfx.tab(); ctx.rerender(); };
    const stepFilter = (delta) => {
      const i = filters.findIndex((f) => f.key === filterKey);
      setFilter(filters[(i + delta + filters.length) % filters.length].key);
    };
    // Cabeçalho igual ao da Biblioteca: Y troca prints e vídeos, LT e RT trocam o jogo.
    const other = KINDS.find((k) => k.id !== kind);
    const filterBar = segBar(ctx, filters.map((f) => ({ key: `filter:${f.key}`, label: f.title, count: f.count, on: f.key === filterKey, onclick: () => setFilter(f.key) })));
    const kindLabel = kind === 'videos' ? (shots.length === 1 ? 'vídeo' : 'vídeos') : shots.length === 1 ? 'print' : 'prints';

    const cards = shots.map((s, i) => h('div', { class: 'shot', 'data-focus': true, 'data-key': `shot:${i}`, role: 'button', onclick: () => open(i) },
      h('span', { class: 'pic' }, thumb(s), s.video ? h('i', { class: 'play' }, '▶') : null),
      h('div', { class: 'info' }, filterKey === 'all' ? h('b', {}, s.game) : null, h('span', { class: 'mono' }, when(s.at)))));
    if (cards[0]) cards[0].setAttribute('data-autofocus', '');

    // ===== tela cheia =====
    const viewer = h('div', { class: 'shot-viewer', hidden: true, onclick: (e) => { if (e.target === viewer) close(); } });
    let index = -1;
    let confirming = false;
    let busy = false;
    let error = '';

    function paint() {
      const s = shots[index];
      const media = s.video
        ? h('video', { src: s.url, controls: true, autoplay: true })
        : h('img', { src: s.url, alt: '' });
      viewer.replaceChildren(
        media,
        h('div', { class: 'sv-top' },
          h('b', {}, s.game),
          h('span', {}, `${fullDate(s.at)} · ${SOURCE[s.source] || ''}${s.video ? ' · clipe' : ''}`)),
        h('button', { class: 'sv-nav prev', onclick: () => step(-1), disabled: index === 0 }, '‹'),
        h('button', { class: 'sv-nav next', onclick: () => step(1), disabled: index === shots.length - 1 }, '›'),
        h('div', { class: 'sv-bottom' },
          h('span', { class: 'mono' }, `${index + 1} / ${shots.length}`),
          h('div', { class: 'hints' }, ctx.hints([['lr', 'Passar'], ...(s.video ? [['confirm', 'Play/Pausa']] : []), ['x', 'Apagar'], ['back', 'Voltar']]))),
        confirming ? h('div', { class: 'sv-confirm' },
          h('div', { class: 'sv-box' },
            h('h3', {}, s.video ? 'Apagar este vídeo?' : 'Apagar este print?'),
            h('p', {}, error || 'Ele vai para a Lixeira do Windows, então dá para recuperar depois.'),
            h('div', { class: 'hints' }, ctx.hints(busy ? [] : [['confirm', 'Apagar'], ['back', 'Cancelar']])))) : null);
    }

    function askRemove() {
      confirming = true;
      error = '';
      viewer.querySelectorAll('video').forEach((v) => v.pause());
      ctx.sfx.move();
      paint();
    }

    function cancelRemove() {
      confirming = false;
      ctx.sfx.back();
      paint();
    }

    async function remove() {
      const s = shots[index];
      busy = true;
      paint();
      const res = await ctx.api.removeScreenshot(s.url).catch((err) => ({ error: err.message }));
      busy = false;
      if (res && res.error) {
        error = res.error;
        paint();
        return;
      }
      ctx.sfx.confirm();
      // Tira a captura da lista guardada e monta a tela de novo, com os números certos.
      if (cache) for (const g of cache.groups) g.shots = g.shots.filter((x) => x.url !== s.url);
      if (cache) cache.groups = cache.groups.filter((g) => g.shots.length);
      reopenAt = shots.length > 1 ? Math.min(index, shots.length - 2) : -1;
      index = -1;
      ctx.rerender();
    }

    function open(i, quiet = false) {
      index = i;
      confirming = false;
      if (!quiet) ctx.sfx.confirm();
      viewer.hidden = false;
      paint();
    }

    function step(d) {
      const next = index + d;
      if (next < 0 || next >= shots.length) return;
      index = next;
      ctx.sfx.move();
      paint();
    }

    function close() {
      viewer.querySelectorAll('video').forEach((v) => v.pause());
      viewer.hidden = true;
      viewer.replaceChildren();
      ctx.sfx.back();
      ctx.refocus(`shot:${index}`);
      const el = cards[index];
      if (el) el.scrollIntoView({ block: 'nearest' });
      index = -1;
    }

    const el = h('div', { style: { display: 'contents' } },
      h('div', { class: 'lib-head shots-head' },
        h('h2', {}, `${shots.length} ${kindLabel}`),
        keyPill(ctx, 'y', `Ver ${other.label.toLowerCase()} · ${counts[other.id]}`, { 'data-key': `kind:${other.id}`, onclick: () => setKind(other.id) })),
      h('div', { class: 'lib-bar' }, filterBar),
      h('div', { class: 'grid shots-grid' }, cards.length ? cards : h('p', { class: 'muted' }, kind === 'videos'
        ? 'Nenhum vídeo ainda. Com um jogo aberto, Xbox + X salva os últimos 30 segundos e Xbox + RB começa e para a gravação.'
        : 'Nenhum print ainda.')));
    // Fica no body, por cima da barra de abas e das dicas.
    document.body.append(viewer);
    if (reopenAt >= 0 && shots.length) open(Math.min(reopenAt, shots.length - 1), true);
    else if (reopenAt >= 0) ctx.refocus();
    reopenAt = -1;

    return {
      el,
      hints: [['confirm', 'Ver'], ['ltrt', 'Jogo'], ['y', kind === 'prints' ? 'Ver vídeos' : 'Ver prints'], ['menu', 'Menu']],
      onAction(action) {
        if (index >= 0 && confirming) {
          if (busy) return true;
          if (action === 'confirm') remove();
          else if (action === 'back') cancelRemove();
          return action !== 'menu' && action !== 'options' && action !== 'fullscreen';
        }
        if (index >= 0) {
          if (action === 'x') askRemove();
          else if (action === 'left' || action === 'up') step(-1);
          else if (action === 'right' || action === 'down') step(1);
          else if (action === 'back') close();
          else if (action === 'confirm') {
            const v = viewer.querySelector('video');
            if (v) { if (v.paused) v.play(); else v.pause(); }
          } else return action !== 'menu' && action !== 'options' && action !== 'fullscreen';
          return true;
        }
        if (action === 'y') {
          setKind(kind === 'prints' ? 'videos' : 'prints');
          return true;
        }
        if (action === 'lt' || action === 'rt' || action === 'x') {
          stepFilter(action === 'lt' ? -1 : 1);
          return true;
        }
        return false;
      },
      destroy() {
        viewer.querySelectorAll('video').forEach((v) => v.pause());
        viewer.remove();
      },
    };
  },
};
