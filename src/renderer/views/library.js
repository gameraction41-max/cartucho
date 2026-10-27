// Biblioteca completa: todos os jogos em grade, com filtro por origem e ordenação.
import { h, cover, hours, sortRecent } from '../lib/ui.js';
import { emptyState } from './home.js';

const FILTERS = [
  { id: 'all', label: 'Todos', test: () => true },
  { id: 'steam', label: 'Steam', test: (g) => g.source === 'steam' },
  { id: 'prism', label: 'Minecraft', test: (g) => g.source === 'prism' },
  { id: 'hytale', label: 'Hytale', test: (g) => g.source === 'hytale' },
];
const SORTS = [
  { label: 'Recentes', fn: sortRecent },
  { label: 'Mais jogados', fn: (l) => [...l].sort((a, b) => b.minutes - a.minutes) },
  { label: 'A a Z', fn: (l) => [...l].sort((a, b) => a.title.localeCompare(b.title, 'pt-BR')) },
];
let filterIndex = 0;
let sortIndex = 0;

export default {
  label: 'Biblioteca',
  render(ctx) {
    if (!ctx.state.games.length) {
      return {
        el: h('div', { style: { display: 'contents' } }, emptyState(ctx, { title: 'Biblioteca vazia', text: 'Conecte suas contas nas configurações para seus jogos aparecerem aqui.' })),
        hints: [['confirm', 'Selecionar']],
      };
    }
    const filter = FILTERS[filterIndex];
    const games = SORTS[sortIndex].fn(ctx.state.games.filter(filter.test));

    const setFilter = (i) => { filterIndex = i; ctx.sfx.tab(); ctx.rerender(); };
    const pills = FILTERS.map((f, i) => h('button', { class: `pill ${i === filterIndex ? 'on' : ''}`, 'data-focus': true, 'data-key': `filter:${f.id}`, onclick: () => setFilter(i) }, f.label));
    const sortPill = h('button', { class: 'pill', 'data-focus': true, 'data-key': 'sort', onclick: () => { sortIndex = (sortIndex + 1) % SORTS.length; ctx.sfx.tab(); ctx.rerender(); } }, `Ordenar: ${SORTS[sortIndex].label}`);

    const cards = games.map((g) => h('div', { class: 'card', 'data-focus': true, 'data-key': g.key, 'data-select-first': true, role: 'button', onclick: () => ctx.go('game', { key: g.key }) },
      cover(g),
      h('div', { class: 'info' }, h('span', { class: 'mono' }, hours(g.minutes)), g.ach && g.ach.total ? h('span', { class: 'mono' }, `${Math.round((g.ach.unlocked / g.ach.total) * 100)}%`) : null)));

    const el = h('div', { style: { display: 'contents' } },
      h('div', { class: 'lib-head' }, h('h2', {}, `${games.length} ${games.length === 1 ? 'jogo' : 'jogos'}`), pills, sortPill),
      h('div', { class: 'grid' }, cards.length ? cards : h('p', { class: 'muted' }, 'Nenhum jogo com esse filtro.')));

    // Começa com o foco no primeiro jogo, não nos filtros.
    if (cards[0]) cards[0].setAttribute('data-autofocus', '');

    return {
      el,
      hints: [['confirm', 'Abrir'], ['x', 'Filtrar'], ['y', 'Jogar']],
      onAction(action, { focused }) {
        if (action === 'x') { setFilter((filterIndex + 1) % FILTERS.length); return true; }
        if (action === 'y' && focused) {
          const g = games.find((x) => x.key === focused.dataset.key);
          if (g) { ctx.launch(g); return true; }
        }
        return false;
      },
    };
  },
};
