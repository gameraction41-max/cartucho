// Aba Coleções: uma prateleira de capas para cada coleção, na ordem em que os jogos foram postos.
// A abre a página do jogo, Y joga e X renomeia a coleção da prateleira em foco.
import { h, cover, hours, keyPill } from '../lib/ui.js';
import { collectionsOf, gamesIn, askName, createCollection, renameCollection } from '../lib/collections.js';

export default {
  label: 'Coleções',
  render(ctx) {
    const list = collectionsOf(ctx);
    const byKey = new Map(ctx.state.games.map((g) => [g.key, g]));

    const create = () => askName(ctx, {
      title: 'Nova coleção',
      done: async (name) => {
        const c = await createCollection(ctx, name);
        ctx.sfx.confirm();
        ctx.toast(`Coleção ${name} criada. Para pôr jogos nela, abra a página do jogo.`);
        await ctx.rerender();
        ctx.refocus(`empty:${c.id}`);
        const box = document.querySelector(`[data-key="empty:${c.id}"]`);
        if (box) box.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      },
    });
    const rename = (c) => askName(ctx, {
      title: `Renomear "${c.name}"`,
      value: c.name,
      done: async (name) => { await renameCollection(ctx, c.id, name); ctx.toast(`Agora se chama ${name}.`); ctx.rerender(); },
    });

    const shelf = (c) => {
      const games = gamesIn(ctx, c);
      const total = games.reduce((s, g) => s + (g.minutes || 0), 0);
      const tiles = games.map((g) => {
        const t = h('div', { class: 'shelf-item', 'data-focus': true, 'data-key': `${c.id}|${g.key}`, 'data-col': c.id, 'data-select-first': true, role: 'button', onclick: () => ctx.go('game', { key: g.key }) },
          cover(g));
        t.addEventListener('focusin-nav', () => ctx.setBackground(g));
        return t;
      });
      const empty = h('div', { class: 'shelf-empty', 'data-focus': true, 'data-key': `empty:${c.id}`, 'data-col': c.id, role: 'button', onclick: () => ctx.goTab('library') },
        h('b', {}, 'Coleção vazia'), h('span', {}, 'Abra um jogo e escolha "Pôr numa coleção". Aperte para ir à Biblioteca.'));
      empty.addEventListener('focusin-nav', () => ctx.setBackground(null));
      return h('section', { class: 'shelf' },
        h('h3', { class: 'shelf-head' }, c.name, h('small', {}, games.length ? `${games.length} ${games.length === 1 ? 'jogo' : 'jogos'} · ${hours(total)}` : '')),
        h('div', { class: 'shelf-row' }, tiles.length ? tiles : empty));
    };

    const el = h('div', { class: 'cols' },
      h('div', { class: 'lib-head' }, h('h2', {}, 'Coleções'),
        keyPill(ctx, null, '+ Nova coleção', { 'data-key': 'new', onclick: create }),
        list.length ? keyPill(ctx, null, '✎ Gerenciar', { 'data-key': 'manage', onclick: () => { ctx.sfx.confirm(); ctx.go('collectionpick'); } }) : null),
      h('div', { class: 'shelves' }, list.length ? list.map(shelf)
        : h('p', { class: 'muted' }, 'Nenhuma coleção ainda. Crie uma, como "Jogando agora" ou "Para zerar".')));

    // Começa no primeiro jogo da primeira coleção, não nos botões de cima.
    const first = el.querySelector('.shelves [data-focus]');
    if (first) first.setAttribute('data-autofocus', '');

    const focusedCol = (focused) => focused && list.find((c) => c.id === focused.dataset.col);
    return {
      el,
      keepBackground: true,
      hints: [['confirm', 'Detalhes'], ['y', 'Jogar'], ['x', 'Renomear coleção'], ['menu', 'Menu']],
      onAction(action, { focused }) {
        const c = focusedCol(focused);
        if (action === 'x' && c) { ctx.sfx.confirm(); rename(c); return true; }
        if (action === 'y' && c) {
          const g = byKey.get(focused.dataset.key.split('|')[1]);
          if (g) { ctx.launch(g); return true; }
        }
        return false;
      },
    };
  },
};
