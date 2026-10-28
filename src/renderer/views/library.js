// Biblioteca completa: todos os jogos em grade, com filtro por origem ou coleção e ordenação.
// LT e RT trocam o filtro, Y troca a ordem, X esconde ou mostra o jogo em foco. Jogos de fora da Steam entram por "Adicionar jogo".
import { h, cover, hours, sortRecent, keyPill, segBar } from '../lib/ui.js';
import { collectionsOf } from '../lib/collections.js';
import { shelfGames, isHidden, setHidden } from '../lib/shelf.js';
import { emptyState } from './home.js';

// all: só os que aparecem nas listas (Minecraft como um jogo só). Minecraft mostra cada instância.
const FILTERS = [
  { id: 'all', label: 'Todos', always: true, pick: (ctx) => shelfGames(ctx) },
  { id: 'installed', label: 'Instalados', always: true, pick: (ctx) => shelfGames(ctx).filter((g) => g.installed !== false) },
  { id: 'steam', label: 'Steam', pick: (ctx) => shelfGames(ctx).filter((g) => g.source === 'steam') },
  { id: 'prism', label: 'Minecraft', pick: (ctx) => ctx.state.games.filter((g) => g.source === 'prism' && !isHidden(ctx, g)) },
  { id: 'hytale', label: 'Hytale', pick: (ctx) => shelfGames(ctx).filter((g) => g.source === 'hytale') },
  { id: 'custom', label: 'Do PC', pick: (ctx) => shelfGames(ctx).filter((g) => g.source === 'custom') },
];
const HIDDEN = { id: 'hidden', label: 'Ocultos', hidden: true, pick: (ctx) => shelfGames(ctx, { hidden: true }) };
// Numa coleção, "Do meu jeito" mantém a ordem em que os jogos foram postos nela.
const SORTS = [
  { label: 'Recentes', fn: sortRecent },
  { label: 'Mais jogados', fn: (l) => [...l].sort((a, b) => b.minutes - a.minutes) },
  { label: 'A a Z', fn: (l) => [...l].sort((a, b) => a.title.localeCompare(b.title, 'pt-BR')) },
];
const MY_ORDER = { label: 'Do meu jeito', fn: (l) => l };
let filterId = 'all';
let sortIndex = 0;

// Filtros que têm jogo (Todos e Instalados sempre), depois as coleções e, se houver, os ocultos.
function filtersFor(ctx) {
  const base = FILTERS.map((f) => ({ ...f, games: f.pick(ctx) })).filter((f) => f.always || f.games.length);
  const all = new Map(ctx.state.games.map((g) => [g.key, g]));
  const cols = collectionsOf(ctx).map((c) => ({ id: `col:${c.id}`, label: c.name, collection: true, games: c.keys.map((k) => all.get(k)).filter((g) => g && !isHidden(ctx, g)) }));
  const hidden = { ...HIDDEN, games: HIDDEN.pick(ctx) };
  return [...base, ...cols, ...(hidden.games.length || filterId === 'hidden' ? [hidden] : [])];
}

export default {
  label: 'Biblioteca',
  render(ctx) {
    if (!ctx.state.games.length) {
      return {
        el: h('div', { style: { display: 'contents' } }, emptyState(ctx, { title: 'Biblioteca vazia', text: 'Conecte suas contas nas configurações para seus jogos aparecerem aqui.' })),
        hints: [['confirm', 'Selecionar']],
      };
    }
    const filters = filtersFor(ctx);
    let filterIndex = filters.findIndex((f) => f.id === filterId);
    if (filterIndex < 0) { filterIndex = 0; filterId = 'all'; }
    const filter = filters[filterIndex];
    const sorts = filter.collection ? [MY_ORDER, ...SORTS] : SORTS;
    if (sortIndex >= sorts.length) sortIndex = 0;
    const games = sorts[sortIndex].fn(filter.games);

    const setFilter = (i) => {
      const was = filters[filterIndex].collection;
      filterId = filters[i].id;
      // Entrando numa coleção, começa na ordem dela; saindo, volta para Recentes.
      if (!!filters[i].collection !== !!was) sortIndex = 0;
      ctx.sfx.tab();
      ctx.rerender();
    };
    const step = (delta) => setFilter((filterIndex + delta + filters.length) % filters.length);
    const nextSort = () => { sortIndex = (sortIndex + 1) % sorts.length; ctx.sfx.tab(); ctx.rerender(); };

    const filterBar = segBar(ctx, filters.map((f, i) => ({ key: `filter:${f.id}`, label: f.label, count: f.games.length, on: i === filterIndex, cls: f.collection ? 'col' : f.hidden ? 'hid' : '', onclick: () => setFilter(i) })));

    const cards = games.map((g) => h('div', { class: `card ${isHidden(ctx, g) ? 'is-hidden' : ''}`, 'data-focus': true, 'data-key': g.key, 'data-select-first': true, role: 'button', onclick: () => ctx.go('game', { key: g.key }) },
      cover(g),
      h('div', { class: 'info' }, h('span', { class: 'mono' }, hours(g.minutes)), g.ach && g.ach.total ? h('span', { class: 'mono' }, `${Math.round((g.ach.unlocked / g.ach.total) * 100)}%`) : null)));

    const empty = filter.collection ? 'Esta coleção ainda está vazia. Abra um jogo e escolha "Coleções".'
      : filter.hidden ? 'Nenhum jogo oculto. Para esconder um jogo, aperte X em cima dele.' : 'Nenhum jogo com esse filtro.';
    const title = filter.collection || filter.hidden ? filter.label : `${games.length} ${games.length === 1 ? 'jogo' : 'jogos'}`;
    const el = h('div', { class: 'lib' },
      h('div', { class: 'lib-head' },
        h('h2', {}, title),
        keyPill(ctx, 'y', sorts[sortIndex].label, { 'data-key': 'sort', onclick: nextSort }),
        keyPill(ctx, null, '+ Adicionar jogo', { 'data-key': 'add', onclick: () => { ctx.sfx.confirm(); ctx.go('addgame'); } }),
        keyPill(ctx, null, '✎ Coleções', { 'data-key': 'collections', onclick: () => { ctx.sfx.confirm(); ctx.go('collectionpick'); } })),
      filterBar,
      h('div', { class: 'grid' }, cards.length ? cards : h('p', { class: 'muted' }, empty)));

    // Começa com o foco no primeiro jogo, não nos botões.
    if (cards[0]) cards[0].setAttribute('data-autofocus', '');

    return {
      el,
      hints: [['confirm', 'Abrir'], ['ltrt', 'Filtro'], ['y', 'Ordenar'], ['x', filter.hidden ? 'Mostrar' : 'Ocultar']],
      onAction(action, { focused }) {
        if (action === 'lt' || action === 'rt') { step(action === 'lt' ? -1 : 1); return true; }
        if (action === 'y') { nextSort(); return true; }
        if (action === 'x' && focused) {
          const g = games.find((x) => x.key === focused.dataset.key);
          if (!g) return false;
          const hide = !isHidden(ctx, g);
          // Some da grade na hora; a seleção vai para o vizinho.
          const i = games.indexOf(g);
          const neighbor = games[i + 1] || games[i - 1];
          setHidden(ctx, g, hide).then(() => {
            ctx.sfx.back();
            ctx.toast(hide ? `${g.title} foi para Ocultos. Aperte X de novo lá para mostrar.` : `${g.title} voltou para a biblioteca.`);
            ctx.rerender().then(() => ctx.refocus(neighbor ? neighbor.key : 'sort'));
          });
          return true;
        }
        return false;
      },
    };
  },
};
