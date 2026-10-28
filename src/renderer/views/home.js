// Início: fileira com os jogos jogados recentemente e o fundo trocando para a arte do jogo selecionado.
import { h, cover, hours, when, sortRecent, dlBar, SOURCE_NAME } from '../lib/ui.js';
import { collectionsOf, gamesIn } from '../lib/collections.js';
import { showCollection } from './library.js';

const ROW_SIZE = 12;
const DL_SHOWN = 3;
// Prateleira da tela inicial: 'recent' ou o id de uma coleção. X passa para a próxima.
let shelfId = 'recent';
let firstKey = null;

// Rótulo do botão principal: jogo da Steam fora do PC instala, e durante o download abre a fila da Steam.
export function playLabel(g) {
  if (g.source !== 'steam' || g.installed !== false) return 'Jogar';
  return g.download ? 'Ver download' : 'Instalar';
}

function downloadsPanel(ctx) {
  const list = ctx.state.downloads;
  if (!list.length) return null;
  return h('div', { class: 'dl-list' },
    h('h3', {}, list.length === 1 ? 'Baixando' : `Baixando · ${list.length}`),
    list.slice(0, DL_SHOWN).map((d) => dlBar(d, d.update ? `${d.title} · atualização` : d.title)));
}

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
    // Só coleções com jogo viram prateleira.
    const shelves = [{ id: 'recent', label: 'Jogados recentemente' },
      ...collectionsOf(ctx).map((c) => ({ id: c.id, label: c.name, games: gamesIn(ctx, c) })).filter((s) => s.games.length)];
    const shelf = shelves.find((s) => s.id === shelfId) || shelves[0];
    shelfId = shelf.id;
    const games = shelf.games || sortRecent(ctx.state.games).slice(0, ROW_SIZE);
    firstKey = games[0] && games[0].key;
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
    const playBtn = h('button', { class: 'btn primary', onclick: () => ctx.launch(selected) }, 'Jogar');
    const showInfo = (g) => {
      selected = g;
      src.className = `src ${g.source}`;
      src.replaceChildren(h('i'), SOURCE_NAME[g.source]);
      title.textContent = g.title;
      meta.replaceChildren(...metaFor(g));
      playBtn.textContent = playLabel(g);
      ctx.setBackground(g);
    };

    // Nome do jogo ao lado do ícone em foco. Só aparece no tema PS5 (themes.css).
    const tileName = h('span', { class: 'tile-name' });
    const tiles = games.map((g) => {
      const t = cover(g, 'tile');
      Object.assign(t.dataset, { focus: '', key: g.key, selectFirst: '' });
      t.setAttribute('role', 'button');
      t.addEventListener('click', () => ctx.launch(g));
      t.addEventListener('focusin-nav', () => {
        showInfo(g);
        tileName.textContent = g.title;
        t.after(tileName);
      });
      return t;
    });
    const openLibrary = () => {
      if (shelf.games) showCollection(shelf.id);
      ctx.goTab('library');
    };
    const more = h('div', { class: 'cover tile more', 'data-focus': true, 'data-key': 'more', role: 'button', onclick: openLibrary }, shelf.games ? 'Ver coleção na Biblioteca' : 'Biblioteca completa');
    more.addEventListener('focusin-nav', () => { ctx.setBackground(null); tileName.remove(); });

    showInfo(selected);
    const el = h('div', { style: { display: 'contents' } },
      h('section', { class: 'home-info' }, downloadsPanel(ctx), src, title, meta,
        h('div', { class: 'actions' },
          playBtn,
          h('button', { class: 'btn', onclick: () => ctx.go('game', { key: selected.key }) }, 'Detalhes'))),
      h('h3', { class: `row-label ${shelves.length > 1 ? 'shelves' : ''}` }, shelves.map((s) => h('span', {
        class: s.id === shelf.id ? 'on' : '',
        onclick: () => { shelfId = s.id; ctx.sfx.tab(); ctx.rerender(); },
      }, s.label))),
      h('div', { class: 'row' }, tiles, more));

    return {
      el,
      keepBackground: true,
      hints: [['confirm', 'Jogar / Instalar'], ['y', 'Detalhes'], ...(shelves.length > 1 ? [['x', 'Trocar coleção']] : []), ['menu', 'Menu']],
      onAction(action, { focused }) {
        if (action === 'x' && shelves.length > 1) {
          shelfId = shelves[(shelves.indexOf(shelf) + 1) % shelves.length].id;
          ctx.sfx.tab();
          // A fileira é outra: volta para o começo dela, no primeiro jogo.
          ctx.rerender().then(() => {
            const row = document.querySelector('#view .row');
            if (row) { row.style.scrollBehavior = 'auto'; row.scrollLeft = 0; row.style.scrollBehavior = ''; }
            ctx.refocus(firstKey);
          });
          return true;
        }
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
