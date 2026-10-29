// Início: fileira com os jogos que estão no PC (e os que saíram dele há pouco), do aberto mais recente para o mais antigo.
// O fundo troca para a arte do jogo selecionado. A abre a página do jogo e Y joga direto.
import { h, cover, hours, when, dlBar, SOURCE_NAME } from '../lib/ui.js';
import { homeGames } from '../lib/shelf.js';

const ROW_SIZE = 24;
const DL_SHOWN = 3;

// Janelinha que o botão Menu abre embaixo do jogo em foco: pasta do jogo e desinstalar. Funciona sem o sistema de
// foco da tela: enquanto está aberta, a tela manda cima/baixo/A/B para ela.
function gameMenu(ctx, g, tile, onClose) {
  const items = [];
  const add = (label, desc, fn, cls = '') => items.push(h('button', { class: `gmenu-item ${cls}`, onclick: () => { close(); fn(); } }, label, desc ? h('small', {}, desc) : null));
  if (g.installed !== false) {
    add('Abrir pasta do jogo', g.group ? 'Pasta das instâncias do Prism' : 'No Explorador de Arquivos', async () => {
      ctx.sfx.confirm();
      const r = await ctx.api.openGameFolder(g);
      if (r && r.error) ctx.toast(r.error, { error: true });
    });
  }
  if (g.source === 'steam' && g.installed === false && !g.download) add('Instalar', 'Pela janela da Steam', () => ctx.install(g));
  if (g.source === 'steam' && g.installed === true) add('Desinstalar', 'Pela janela da Steam, que pede confirmação', () => ctx.uninstall(g), 'danger');
  if (g.source === 'custom') add('Opções do jogo', 'Renomear ou tirar do Cartucho', () => { ctx.sfx.confirm(); ctx.go('gameopts', { key: g.key }); });
  add('Menu do Cartucho', '', () => ctx.openMenu(), 'quiet');

  let index = 0;
  const el = h('div', { class: 'gmenu' }, h('div', { class: 'gmenu-title' }, g.title), items);
  const paint = () => items.forEach((it, i) => it.classList.toggle('focused', i === index));
  items.forEach((it, i) => it.addEventListener('mouseenter', () => { index = i; paint(); }));
  paint();
  document.body.append(el);
  // Embaixo da capa; se não couber (tema com a fileira no pé da tela), em cima dela.
  const r = tile.getBoundingClientRect();
  const left = Math.min(r.left, window.innerWidth - el.offsetWidth - 16);
  const below = r.bottom + 12 + el.offsetHeight < window.innerHeight - 16;
  el.style.left = `${Math.max(16, left)}px`;
  el.style.top = `${below ? r.bottom + 12 : r.top - 12 - el.offsetHeight}px`;
  requestAnimationFrame(() => el.classList.add('on'));

  let open = true;
  function close() {
    if (!open) return;
    open = false;
    el.remove();
    onClose();
  }
  return {
    close,
    handle(action) {
      if (action === 'up' || action === 'down') {
        const next = Math.max(0, Math.min(items.length - 1, index + (action === 'down' ? 1 : -1)));
        if (next !== index) { index = next; paint(); ctx.sfx.move(); }
      } else if (action === 'confirm') items[index].click();
      else if (action === 'back' || action === 'menu') { ctx.sfx.back(); close(); }
      return true;
    },
  };
}

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
  if (g.group) parts.push(h('span', {}, h('b', {}, g.instances.length), g.instances.length === 1 ? ' instância' : ' instâncias'));
  if (g.installed === false) parts.push(h('span', {}, 'fora do PC'));
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
  label: 'Início',
  render(ctx) {
    const games = homeGames(ctx).slice(0, ROW_SIZE);
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
      playBtn.dataset.play = g.key;
      ctx.markLaunching();
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
      t.addEventListener('click', () => { ctx.sfx.confirm(); ctx.go('game', { key: g.key }); });
      t.addEventListener('focusin-nav', () => {
        showInfo(g);
        tileName.textContent = g.title;
        t.after(tileName);
      });
      return t;
    });
    const more = h('div', { class: 'cover tile more', 'data-focus': true, 'data-key': 'more', role: 'button', onclick: () => ctx.goTab('library') }, 'Biblioteca completa');
    more.addEventListener('focusin-nav', () => { ctx.setBackground(null); tileName.remove(); });

    showInfo(selected);
    const el = h('div', { style: { display: 'contents' } },
      h('section', { class: 'home-info' }, downloadsPanel(ctx), src, title, meta,
        h('div', { class: 'actions' },
          playBtn,
          h('button', { class: 'btn', onclick: () => ctx.go('game', { key: selected.key }) }, 'Detalhes'))),
      h('h3', { class: 'row-label' }, 'No seu PC'),
      h('div', { class: 'row' }, tiles, more));

    let popup = null;
    return {
      el,
      keepBackground: true,
      hints: [['confirm', 'Detalhes'], ['y', 'Jogar'], ['menu', 'Opções']],
      onAction(action, { focused }) {
        if (popup) return popup.handle(action);
        const g = focused && games.find((x) => x.key === focused.dataset.key);
        if (g && action === 'y') {
          ctx.launch(g);
          return true;
        }
        // Menu em cima de um jogo abre a janelinha dele; o botão Xbox continua abrindo o menu do Cartucho.
        if (g && action === 'menu') {
          ctx.sfx.confirm();
          popup = gameMenu(ctx, g, focused, () => { popup = null; });
          return true;
        }
        return false;
      },
      destroy() { if (popup) popup.close(); },
    };
  },
};
