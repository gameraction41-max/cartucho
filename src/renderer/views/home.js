// Início: fileira com os jogos jogados recentemente e o fundo trocando para a arte do jogo selecionado.
import { h, cover, hours, when, sortRecent, SOURCE_NAME } from '../lib/ui.js';

const ROW_SIZE = 12;

export function metaFor(g) {
  const parts = [h('span', {}, h('b', {}, hours(g.minutes)), ' jogadas')];
  if (g.ach && g.ach.total) parts.push(h('span', {}, h('b', {}, `${g.ach.unlocked}/${g.ach.total}`), ' conquistas'));
  if (g.source === 'prism') parts.push(h('span', {}, h('b', {}, g.mcVersion || '?'), ` · ${g.loader}`));
  parts.push(h('span', {}, when(g.lastPlayed)));
  return parts;
}

export function emptyState(ctx, { title, text }) {
  return h('div', { class: 'empty', style: { marginTop: 'auto', marginBottom: '6rem' } },
    h('h2', {}, title),
    h('p', {}, text),
    h('button', { class: 'btn primary', 'data-focus': true, onclick: () => ctx.goTab('settings') }, 'Abrir configurações'));
}

export default {
  label: 'Jogos',
  render(ctx) {
    const games = sortRecent(ctx.state.games).slice(0, ROW_SIZE);
    if (!games.length) {
      return {
        el: h('div', { style: { display: 'contents' } }, emptyState(ctx, {
          title: 'Bem-vindo ao Cartucho',
          text: 'Conecte sua conta da Steam, a pasta do Prism Launcher e o Hytale nas configurações. Seus jogos aparecem aqui logo depois.',
        })),
        hints: [['confirm', 'Selecionar'], ['menu', 'Menu']],
      };
    }

    let selected = games[0];
    const src = h('span', { class: 'src' });
    const title = h('h1', { class: 'big-title' });
    const meta = h('div', { class: 'meta' });
    const showInfo = (g) => {
      selected = g;
      src.className = `src ${g.source}`;
      src.replaceChildren(h('i'), SOURCE_NAME[g.source]);
      title.textContent = g.title;
      meta.replaceChildren(...metaFor(g));
      ctx.setBackground(g);
    };

    const tiles = games.map((g) => {
      const t = cover(g, 'tile');
      Object.assign(t.dataset, { focus: '', key: g.key, selectFirst: '' });
      t.setAttribute('role', 'button');
      t.addEventListener('click', () => ctx.launch(g));
      t.addEventListener('focusin-nav', () => showInfo(g));
      return t;
    });
    const more = h('div', { class: 'cover tile more', 'data-focus': true, 'data-key': 'more', role: 'button', onclick: () => ctx.goTab('library') }, 'Biblioteca completa');
    more.addEventListener('focusin-nav', () => ctx.setBackground(null));

    showInfo(selected);
    const el = h('div', { style: { display: 'contents' } },
      h('section', { class: 'home-info' }, src, title, meta,
        h('div', { class: 'actions' },
          h('button', { class: 'btn primary', onclick: () => ctx.launch(selected) }, 'Jogar'),
          h('button', { class: 'btn', onclick: () => ctx.go('game', { key: selected.key }) }, 'Detalhes'))),
      h('div', { class: 'row' }, tiles, more));

    return {
      el,
      keepBackground: true,
      hints: [['confirm', 'Jogar'], ['y', 'Detalhes'], ['menu', 'Menu']],
      onAction(action, { focused }) {
        if (action === 'y' && focused && focused.dataset.key !== 'more') {
          ctx.sfx.confirm();
          ctx.go('game', { key: focused.dataset.key });
          return true;
        }
        return false;
      },
    };
  },
};
