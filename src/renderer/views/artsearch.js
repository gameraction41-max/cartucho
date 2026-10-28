// Buscar capa, fundo e música na internet, sem baixar e escolher arquivo na mão.
// Imagens: grade do SteamGridDB, LT/RT (ou Y) troca entre capas e fundos, A usa a imagem.
// Música: lista de trilhas sonoras do KHInsider, A abre o álbum; nas faixas, Y ouve e A usa no jogo.
import { h, keyPill, segBar } from '../lib/ui.js';
import { setGameTrack } from '../lib/sound.js';

const KIND_LABEL = { cover: 'Capas', hero: 'Fundos' };
const cache = new Map(); // resultados já buscados, para voltar à tela sem esperar de novo
let keepKey = null; // imagem escolhida: a seleção volta para ela quando a tela redesenha com a arte nova

async function cached(id, fn) {
  if (!cache.has(id)) {
    const r = await fn();
    if (r && r.error) return r;
    cache.set(id, r);
  }
  return cache.get(id);
}

function message(title, text, ...extra) {
  return h('div', { class: 'empty search-empty' }, h('h2', {}, title), text ? h('p', {}, text) : null, ...extra);
}

// Sem a chave do SteamGridDB, a tela explica como conseguir e deixa colar ali mesmo.
function needKey(ctx, onSaved) {
  const paste = () => ctx.keyboard({
    title: 'Chave do SteamGridDB',
    value: '',
    placeholder: 'Cole ou digite a chave',
    secret: true,
    done: async (raw) => {
      const value = raw.trim();
      if (!value) return;
      const next = await ctx.api.setConfig({ sgdbApiKey: value });
      await ctx.applyConfig({ ...ctx.state.config, ...next });
      ctx.toast('Chave salva.');
      onSaved();
    },
  });
  return message('Falta a chave do SteamGridDB',
    'As capas e os fundos vêm do SteamGridDB, um site grátis com milhares de artes feitas pela comunidade. Ele pede uma chave, que você só precisa colocar uma vez:',
    h('ol', { class: 'search-steps' },
      h('li', {}, 'Entre em steamgriddb.com e faça login com a sua conta Steam.'),
      h('li', {}, 'Abra Preferências › API e aperte "Generate API Key".'),
      h('li', {}, 'Copie a chave e cole aqui (também dá em Configurações › Capas e músicas).')),
    h('button', { class: 'btn primary', 'data-focus': true, 'data-autofocus': true, 'data-key': 'sgdb-key', onclick: paste }, 'Colar a chave'));
}

export default {
  label: 'Buscar',
  render(ctx, { key, mode = 'images', kind: startKind = 'cover' }) {
    const g = ctx.state.games.find((x) => x.key === key);
    if (!g) return { el: h('p', { class: 'muted', style: { marginTop: 'auto' } }, 'Este jogo não está mais na biblioteca.'), hints: [['back', 'Voltar']] };
    ctx.setBackground(g);
    const game = { key: g.key, title: g.title, source: g.source, appid: g.appid };

    let alive = true;
    let kind = startKind;
    let term = '';
    let album = null; // álbum aberto, na busca de música
    let playing = null; // faixa tocando a prévia
    let hints = [];

    const body = h('div', { class: 'search-body' });
    const head = h('div', { class: 'lib-head search-head' });
    const bar = h('div', { class: 'search-bar' });
    const el = h('div', { class: 'search' }, head, bar, body);

    const setHints = (list) => {
      hints = list;
      const box = document.getElementById('hints');
      if (box && alive) box.replaceChildren(...ctx.hints(list));
    };

    const askTerm = () => ctx.keyboard({
      title: mode === 'music' ? 'Nome do jogo ou da trilha' : 'Nome do jogo',
      value: term,
      placeholder: g.title,
      done: (raw) => {
        const value = raw.trim();
        if (!value || value === term) return;
        term = value;
        album = null;
        load();
      },
    });

    // Cabeçalho igual ao da Biblioteca: título e botões em cima, Capas e Fundos na barra de baixo com LT e RT.
    function header(title, sub) {
      head.replaceChildren(
        h('div', { class: 'search-title' }, h('h2', {}, title), sub ? h('small', {}, sub) : null),
        keyPill(ctx, 'x', `Buscar outro nome${term ? ` · ${term}` : ''}`, { 'data-key': 'term', onclick: askTerm }));
      bar.replaceChildren(...(mode === 'images'
        ? [segBar(ctx, Object.entries(KIND_LABEL).map(([id, label]) => ({ key: `kind:${id}`, label, on: id === kind, onclick: () => setKind(id) })))]
        : []));
    }

    function loading(text) {
      body.replaceChildren(h('p', { class: 'muted search-wait' }, text));
    }

    // Site de trilhas recusando a busca: dá para abrir no navegador e depois escolher o arquivo baixado.
    async function pickLocalMusic() {
      const r = await ctx.api.pickArt(g.key, 'music');
      if (!r || r.canceled) return;
      if (r.error) return ctx.toast(r.error, { error: true });
      ctx.sfx.confirm();
      await ctx.reloadLibrary();
      ctx.toast('Música do jogo definida. Ela toca quando o jogo estiver selecionado.');
    }

    function failed(r) {
      const blocked = r.blocked && mode === 'music';
      body.replaceChildren(message('Não deu para buscar', r.error,
        h('div', { class: 'actions' },
          blocked ? h('button', { class: 'btn primary', 'data-focus': true, 'data-autofocus': true, 'data-key': 'site', onclick: () => { ctx.sfx.confirm(); ctx.api.openMusicSite(game, term || undefined); } }, 'Abrir o site no navegador') : null,
          blocked ? h('button', { class: 'btn', 'data-focus': true, 'data-key': 'local', onclick: pickLocalMusic }, '♪ Música do PC') : null,
          h('button', { class: 'btn', 'data-focus': true, 'data-autofocus': !blocked, 'data-key': 'retry', onclick: () => load() }, 'Tentar de novo'))));
      ctx.refocus(blocked ? 'site' : 'retry');
    }

    // ===== imagens =====

    function setKind(id) {
      if (id === kind) return;
      kind = id;
      ctx.sfx.tab();
      load();
    }

    async function useImage(item) {
      ctx.sfx.confirm();
      ctx.toast(kind === 'cover' ? 'Baixando a capa…' : 'Baixando o fundo…');
      const r = await ctx.api.useImage(g.key, kind, item.url);
      if (r && r.error) return ctx.toast(r.error, { error: true });
      ctx.toast(kind === 'cover' ? 'Capa trocada.' : 'Fundo trocado.');
      keepKey = `img:${item.id}`;
      await ctx.reloadLibrary();
    }

    async function loadImages() {
      header(`${KIND_LABEL[kind]} para ${g.title}`, 'SteamGridDB');
      if (!ctx.state.config.hasSgdbApiKey) {
        body.replaceChildren(needKey(ctx, () => load()));
        setHints([['confirm', 'Selecionar'], ['back', 'Voltar']]);
        return ctx.refocus('sgdb-key');
      }
      loading('Buscando imagens…');
      setHints([['back', 'Voltar']]);
      const r = await cached(`img|${g.key}|${kind}|${term}`, () => ctx.api.searchImages(game, kind, term || undefined));
      if (!alive) return;
      if (r.error) return failed(r);
      header(`${KIND_LABEL[kind]} para ${r.name || g.title}`, r.items.length ? `${r.items.length} opções do SteamGridDB` : 'SteamGridDB');
      if (!r.items.length) {
        body.replaceChildren(message(r.name ? 'Nenhuma imagem desse tipo' : 'Jogo não encontrado',
          r.name ? `O SteamGridDB ainda não tem ${kind === 'cover' ? 'capas' : 'fundos'} para ${r.name}.` : `Não achei "${r.term}" no SteamGridDB. Tente outro nome com X.`));
      } else {
        const tiles = r.items.map((item, i) => h('div', { class: `pick pick-${kind}`, 'data-focus': true, 'data-key': `img:${item.id}`, 'data-autofocus': i === 0, role: 'button', onclick: () => useImage(item) },
          h('img', { src: item.thumb, loading: 'lazy', decoding: 'async', alt: '' }),
          item.author ? h('small', {}, item.author) : null));
        body.replaceChildren(h('div', { class: `grid pick-grid pick-${kind}s` }, tiles));
      }
      setHints([['confirm', 'Usar'], ['ltrt', kind === 'cover' ? 'Ver fundos' : 'Ver capas'], ['x', 'Outro nome'], ['back', 'Voltar']]);
      ctx.refocus(keepKey || (r.items.length ? `img:${r.items[0].id}` : 'term'));
      const kept = keepKey && body.querySelector(`[data-key="${keepKey}"]`);
      if (kept) kept.scrollIntoView({ block: 'nearest' });
      keepKey = null;
    }

    // ===== música =====

    function stopPreview() {
      if (!playing) return;
      playing = null;
      setGameTrack(g.music);
      body.querySelectorAll('.track.playing').forEach((x) => x.classList.remove('playing'));
    }

    async function preview(track, row) {
      if (playing === track.id) {
        ctx.sfx.back();
        return stopPreview();
      }
      stopPreview();
      playing = track.id;
      row.classList.add('playing', 'wait');
      const r = await ctx.api.previewTrack(track.id);
      row.classList.remove('wait');
      if (!alive || playing !== track.id) return;
      if (r.error) {
        row.classList.remove('playing');
        playing = null;
        return ctx.toast(r.error, { error: true });
      }
      setGameTrack(r.file);
    }

    async function useTrack(track) {
      ctx.sfx.confirm();
      ctx.toast('Baixando a música…');
      const r = await ctx.api.useTrack(g.key, track.id, track.name);
      if (r && r.error) return ctx.toast(r.error, { error: true });
      stopPreview();
      ctx.toast(`${track.name} é a música do jogo agora.`);
      ctx.back();
      await ctx.reloadLibrary();
    }

    async function loadAlbums() {
      header(`Trilhas para ${g.title}`, 'KHInsider');
      loading('Buscando trilhas sonoras…');
      setHints([['back', 'Voltar']]);
      const r = await cached(`alb|${g.key}|${term}`, () => ctx.api.searchAlbums(game, term || undefined));
      if (!alive || album) return;
      if (r.error) return failed(r);
      if (!r.items.length) {
        body.replaceChildren(message('Nenhuma trilha encontrada', `Não achei trilhas sonoras para "${r.term}". Tente outro nome com X, por exemplo só a primeira palavra do jogo.`));
      } else {
        body.replaceChildren(h('div', { class: 'set-list pick-list' }, r.items.map((a, i) => h('button', { class: 'opt', 'data-focus': true, 'data-key': `alb:${a.id}`, 'data-autofocus': i === 0, onclick: () => openAlbum(a) },
          h('span', { class: 'txt' }, a.name), h('span', { class: 'val' }, 'abrir')))));
      }
      setHints([['confirm', 'Abrir'], ['x', 'Outro nome'], ['back', 'Voltar']]);
      ctx.refocus(lastAlbum && r.items.some((a) => a.id === lastAlbum) ? `alb:${lastAlbum}` : r.items.length ? `alb:${r.items[0].id}` : 'term');
    }

    let lastAlbum = null;
    async function openAlbum(a) {
      ctx.sfx.confirm();
      album = a;
      lastAlbum = a.id;
      header(a.name, 'Dá para ouvir cada faixa antes de escolher');
      loading('Abrindo o álbum…');
      const r = await cached(`trk|${a.id}`, async () => {
        const list = await ctx.api.albumTracks(a.id);
        return list && list.error ? list : { items: list || [] };
      });
      if (!alive || album !== a) return;
      if (r.error) return failed(r);
      if (!r.items.length) {
        body.replaceChildren(message('Álbum vazio', 'Não achei faixas neste álbum.'));
      } else {
        body.replaceChildren(h('div', { class: 'set-list pick-list' }, r.items.map((t, i) => {
          const row = h('button', { class: 'opt track', 'data-focus': true, 'data-key': `trk:${i}`, 'data-autofocus': i === 0, onclick: () => useTrack(t) },
            h('span', { class: 'txt' }, h('i', { class: 'eq' }, '♪'), t.name), h('span', { class: 'val' }, t.duration || ''));
          row.track = t;
          return row;
        })));
      }
      setHints([['confirm', 'Usar no jogo'], ['y', 'Ouvir / parar'], ['back', 'Álbuns']]);
      ctx.refocus('trk:0');
    }

    function load() {
      return mode === 'music' ? (album ? openAlbum(album) : loadAlbums()) : loadImages();
    }
    load();

    return {
      el,
      keepBackground: true,
      get hints() { return hints; },
      onAction(action, { focused } = {}) {
        if (action === 'x') {
          askTerm();
          return true;
        }
        if (mode === 'images' && (action === 'lt' || action === 'rt')) {
          setKind(kind === 'cover' ? 'hero' : 'cover');
          return true;
        }
        if (action === 'y') {
          if (mode === 'images') setKind(kind === 'cover' ? 'hero' : 'cover');
          else if (focused && focused.track) preview(focused.track, focused);
          return true;
        }
        if (action === 'back' && mode === 'music' && album) {
          stopPreview();
          album = null;
          ctx.sfx.back();
          loadAlbums();
          return true;
        }
        return false;
      },
      destroy() {
        alive = false;
        if (mode === 'music') {
          if (playing) setGameTrack(null);
          ctx.api.searchDone();
        }
      },
    };
  },
};
