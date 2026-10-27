// Capturas: prints e vídeos feitos pelo Cartucho e prints da Steam, separados por jogo.
// A abre em tela cheia; nela, esquerda e direita passam as fotos, A dá play no clipe e B volta para a grade.
import { h, when } from '../lib/ui.js';

const CACHE_MS = 15 * 1000;
const SOURCE = { cartucho: 'Cartucho', steam: 'Steam' };
let cache = null; // { at, groups }
let filterKey = 'all';
let kind = 'prints'; // 'prints' ou 'videos'
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
    const kindPills = KINDS.map((k) => h('button', { class: `pill ${k.id === kind ? 'on' : ''}`, 'data-focus': true, 'data-key': `kind:${k.id}`, onclick: () => setKind(k.id) },
      k.label, h('small', {}, String(counts[k.id]))));
    const pills = filters.map((f) => h('button', { class: `pill ${f.key === filterKey ? 'on' : ''}`, 'data-focus': true, 'data-key': `filter:${f.key}`, onclick: () => setFilter(f.key) },
      f.title, h('small', {}, String(f.count))));

    const cards = shots.map((s, i) => h('div', { class: 'shot', 'data-focus': true, 'data-key': `shot:${i}`, role: 'button', onclick: () => open(i) },
      h('span', { class: 'pic' }, thumb(s), s.video ? h('i', { class: 'play' }, '▶') : null),
      h('div', { class: 'info' }, filterKey === 'all' ? h('b', {}, s.game) : null, h('span', { class: 'mono' }, when(s.at)))));
    if (cards[0]) cards[0].setAttribute('data-autofocus', '');

    // ===== tela cheia =====
    const viewer = h('div', { class: 'shot-viewer', hidden: true, onclick: (e) => { if (e.target === viewer) close(); } });
    let index = -1;

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
          h('div', { class: 'hints' }, ctx.hints([['lr', 'Passar'], ...(s.video ? [['confirm', 'Play/Pausa']] : []), ['back', 'Voltar']]))));
    }

    function open(i) {
      index = i;
      ctx.sfx.confirm();
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
        h('div', { class: 'shots-kind' }, kindPills),
        h('div', { class: 'shots-filters' }, pills)),
      h('div', { class: 'grid shots-grid' }, cards.length ? cards : h('p', { class: 'muted' }, kind === 'videos'
        ? 'Nenhum vídeo ainda. Com um jogo aberto, Xbox + X salva os últimos 30 segundos e Xbox + RB começa e para a gravação.'
        : 'Nenhum print ainda.')));
    // Fica no body, por cima da barra de abas e das dicas.
    document.body.append(viewer);

    return {
      el,
      hints: [['confirm', 'Ver'], ['y', kind === 'prints' ? 'Ver vídeos' : 'Ver prints'], ['x', 'Trocar jogo'], ['menu', 'Menu']],
      onAction(action) {
        if (index >= 0) {
          if (action === 'left' || action === 'up') step(-1);
          else if (action === 'right' || action === 'down') step(1);
          else if (action === 'back') close();
          else if (action === 'confirm') {
            const v = viewer.querySelector('video');
            if (v) { if (v.paused) v.play(); else v.pause(); }
          } else return action !== 'menu' && action !== 'fullscreen';
          return true;
        }
        if (action === 'y') {
          setKind(kind === 'prints' ? 'videos' : 'prints');
          return true;
        }
        if (action === 'x') {
          const i = filters.findIndex((f) => f.key === filterKey);
          setFilter(filters[(i + 1) % filters.length].key);
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
