// Minecraft: cada instância do Prism Launcher como um jogo separado.
import { h, cover, hours, when, sortRecent } from '../lib/ui.js';
import { emptyState } from './home.js';

export default {
  label: 'Minecraft',
  render(ctx) {
    const list = sortRecent(ctx.state.games.filter((g) => g.source === 'prism'));
    if (!list.length) {
      const dir = ctx.state.config.prismDir || ctx.state.config.defaultPrismDir;
      return {
        el: h('div', { style: { display: 'contents' } }, emptyState(ctx, {
          title: 'Nenhuma instância encontrada',
          text: `Procurei as instâncias do Prism Launcher em ${dir}. Se o Prism está em outra pasta, indique o caminho nas configurações.`,
        })),
        hints: [['confirm', 'Selecionar']],
      };
    }

    const cards = list.map((g) => {
      const card = h('div', { class: 'inst', 'data-focus': true, 'data-key': g.key, 'data-select-first': true, role: 'button', onclick: () => ctx.launch(g) },
        cover(g),
        h('div', { class: 'body' },
          h('span', { class: 'nm' }, g.title),
          h('div', { class: 'tags' }, h('span', {}, g.mcVersion || '?'), h('span', {}, g.loader), g.mods ? h('span', {}, `${g.mods} mods`) : null),
          h('span', { class: 'time' }, `${hours(g.minutes)} · ${when(g.lastPlayed)}`)));
      card.addEventListener('focusin-nav', () => ctx.setBackground(g));
      return card;
    });

    const el = h('div', { style: { display: 'contents' } },
      h('section', { class: 'home-info', style: { marginBottom: 0 } },
        h('span', { class: 'src prism' }, h('i'), `Prism Launcher · ${list.length} ${list.length === 1 ? 'instância' : 'instâncias'}`),
        h('h1', { class: 'big-title' }, 'Minecraft')),
      h('div', { class: 'mc-row', style: { marginBottom: '1rem' } }, cards));

    return {
      el,
      keepBackground: true,
      hints: [['confirm', 'Jogar'], ['y', 'Detalhes'], ['x', 'Abrir no Prism']],
      onAction(action, { focused }) {
        const g = focused && list.find((x) => x.key === focused.dataset.key);
        if (!g) return false;
        if (action === 'y') { ctx.go('game', { key: g.key }); return true; }
        if (action === 'x') { ctx.api.openInSource(g); return true; }
        return false;
      },
    };
  },
};
