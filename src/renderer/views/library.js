// Biblioteca completa: todos os jogos em grade, com filtro por origem ou coleção e ordenação.
import { h, cover, hours, sortRecent } from '../lib/ui.js';
import { collectionsOf } from '../lib/collections.js';
import { emptyState } from './home.js';

const FILTERS = [
  { id: 'all', label: 'Todos', test: () => true },
  { id: 'installed', label: 'Instalados', test: (g) => g.installed !== false },
  { id: 'steam', label: 'Steam', test: (g) => g.source === 'steam' },
  { id: 'prism', label: 'Minecraft', test: (g) => g.source === 'prism' },
  { id: 'hytale', label: 'Hytale', test: (g) => g.source === 'hytale' },
];
// Numa coleção, "Do meu jeito" mantém a ordem em que os jogos foram postos nela.
const SORTS = [
  { label: 'Recentes', fn: sortRecent },
  { label: 'Mais jogados', fn: (l) => [...l].sort((a, b) => b.minutes - a.minutes) },
  { label: 'A a Z', fn: (l) => [...l].sort((a, b) => a.title.localeCompare(b.title, 'pt-BR')) },
];
const MY_ORDER = { label: 'Do meu jeito', fn: (l) => l };
let filterId = 'all';
let sortIndex = 0;

// A tela inicial usa para abrir a Biblioteca já na coleção da prateleira.
export function showCollection(id) {
  filterId = `col:${id}`;
}

function filtersFor(ctx) {
  const cols = collectionsOf(ctx).map((c) => {
    const keys = new Set(c.keys);
    return { id: `col:${c.id}`, label: c.name, test: (g) => keys.has(g.key), order: c.keys, collection: true };
  });
  return [...FILTERS, ...cols];
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
    let games = ctx.state.games.filter(filter.test);
    if (filter.order) games = filter.order.map((k) => games.find((g) => g.key === k)).filter(Boolean);
    games = sorts[sortIndex].fn(games);

    const setFilter = (i) => {
      const was = filters[filterIndex].collection;
      filterId = filters[i].id;
      // Entrando numa coleção, começa na ordem dela; saindo, volta para Recentes.
      if (!!filters[i].collection !== !!was) sortIndex = 0;
      ctx.sfx.tab();
      ctx.rerender();
    };
    const pills = filters.map((f, i) => h('button', { class: `pill ${f.collection ? 'col' : ''} ${i === filterIndex ? 'on' : ''}`, 'data-focus': true, 'data-key': `filter:${f.id}`, onclick: () => setFilter(i) }, f.label));
    const sortPill = h('button', { class: 'pill', 'data-focus': true, 'data-key': 'sort', onclick: () => { sortIndex = (sortIndex + 1) % sorts.length; ctx.sfx.tab(); ctx.rerender(); } }, `Ordenar: ${sorts[sortIndex].label}`);
    const manage = h('button', { class: 'pill', 'data-focus': true, 'data-key': 'collections', onclick: () => { ctx.sfx.confirm(); ctx.go('collections'); } }, '✎ Coleções');

    const cards = games.map((g) => h('div', { class: 'card', 'data-focus': true, 'data-key': g.key, 'data-select-first': true, role: 'button', onclick: () => ctx.go('game', { key: g.key }) },
      cover(g),
      h('div', { class: 'info' }, h('span', { class: 'mono' }, hours(g.minutes)), g.ach && g.ach.total ? h('span', { class: 'mono' }, `${Math.round((g.ach.unlocked / g.ach.total) * 100)}%`) : null)));

    const empty = filter.collection ? 'Esta coleção ainda está vazia. Abra um jogo e escolha "Pôr numa coleção".' : 'Nenhum jogo com esse filtro.';
    const el = h('div', { style: { display: 'contents' } },
      h('div', { class: 'lib-head' }, h('h2', {}, filter.collection ? filter.label : `${games.length} ${games.length === 1 ? 'jogo' : 'jogos'}`),
        h('div', { class: 'lib-pills' }, pills), sortPill, manage),
      h('div', { class: 'grid' }, cards.length ? cards : h('p', { class: 'muted' }, empty)));

    // Começa com o foco no primeiro jogo, não nos filtros.
    if (cards[0]) cards[0].setAttribute('data-autofocus', '');

    return {
      el,
      hints: [['confirm', 'Abrir'], ['x', 'Filtrar'], ['y', 'Jogar']],
      onAction(action, { focused }) {
        if (action === 'x') { setFilter((filterIndex + 1) % filters.length); return true; }
        if (action === 'y' && focused) {
          const g = games.find((x) => x.key === focused.dataset.key);
          if (g) { ctx.launch(g); return true; }
        }
        return false;
      },
    };
  },
};
