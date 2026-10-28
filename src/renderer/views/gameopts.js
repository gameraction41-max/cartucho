// Opções do jogo: tudo o que não é jogar, numa lista só, separada em Aparência e Jogo. Ao lado, a capa e o fundo atuais.
// Fica fora da página do jogo para ela mostrar só o principal.
import { h, cover } from '../lib/ui.js';
import { isHidden, setHidden } from '../lib/shelf.js';
import { presetBackend, renameInstance } from './game.js';

const OPEN_LABEL = { steam: ['Abrir na Steam', 'Página do jogo no app da Steam'], prism: ['Abrir no Prism', 'Janela do Prism Launcher com esta instância'], minecraft: ['Abrir o Prism Launcher', 'Para trocar versão e loader'], hytale: ['Mostrar a pasta do Hytale', 'Onde o launcher está instalado'], custom: ['Mostrar a pasta do jogo', 'Abre o Explorador de Arquivos no executável'] };

export default {
  label: 'Opções',
  render(ctx, params) {
    const g = ctx.state.games.find((x) => x.key === params.key);
    if (!g) return { el: h('p', { class: 'muted', style: { marginTop: 'auto' } }, 'Este jogo não está mais na biblioteca.'), hints: [['back', 'Voltar']] };
    ctx.setBackground(g);
    const inst = params.inst ? ctx.state.games.find((x) => x.key === params.inst) : null;
    const target = inst || g;

    let armed = null; // opção que pede um segundo aperto (tirar do Cartucho)
    const row = (key, label, desc, fn, { value = '', cls = '', confirm = '' } = {}) => {
      const txt = h('span', { class: 'txt' }, label, desc ? h('small', {}, desc) : null);
      const el = h('button', { class: `opt ${cls}`, 'data-focus': true, 'data-key': key }, txt, value ? h('span', { class: 'val' }, value) : null);
      el.addEventListener('click', () => {
        if (confirm && armed !== key) {
          armed = key;
          el.classList.add('warn');
          txt.firstChild.textContent = confirm;
          ctx.sfx.tab();
          return;
        }
        fn();
      });
      return el;
    };
    const section = (label) => h('div', { class: 'set-section' }, label);
    const go = (view, p) => () => { ctx.sfx.confirm(); ctx.go(view, p); };

    const pickArt = async (kind) => {
      const r = await ctx.api.pickArt(g.key, kind);
      if (!r || r.canceled) return;
      if (r.error) return ctx.toast(r.error, { error: true });
      ctx.sfx.confirm();
      await ctx.reloadLibrary();
      ctx.toast(kind === 'cover' ? 'Capa trocada.' : kind === 'hero' ? 'Fundo trocado.' : 'Música do jogo definida. Ela toca quando o jogo estiver selecionado.');
    };
    const dropMusic = async () => {
      await ctx.api.resetArt(g.key, 'music');
      await ctx.reloadLibrary();
      ctx.sfx.back();
      ctx.toast('Música do jogo removida. Volta a tocar a música tema.');
    };
    const resetArt = async () => {
      await ctx.api.resetArt(g.key);
      await ctx.reloadLibrary();
      ctx.sfx.back();
      ctx.toast('Arte original de volta.');
    };
    const toggleHidden = async () => {
      const hide = !isHidden(ctx, g);
      await setHidden(ctx, g, hide);
      ctx.sfx.confirm();
      ctx.toast(hide ? `${g.title} não aparece mais no Início, na Biblioteca nem nas Conquistas. Ele fica no filtro Ocultos.` : `${g.title} voltou para o Início, a Biblioteca e as Conquistas.`);
      ctx.rerender();
    };
    const rename = () => ctx.keyboard({
      title: 'Nome do jogo',
      value: g.title,
      done: async (raw) => {
        const name = raw.replace(/\s+/g, ' ').trim();
        if (!name || name === g.title) return;
        await ctx.api.updateGame(g.customId, { title: name });
        await ctx.reloadLibrary();
        ctx.toast(`Agora se chama ${name}.`);
      },
    });
    const remove = async () => {
      await ctx.api.removeGame(g.customId);
      ctx.sfx.back();
      ctx.toast(`${g.title} saiu do Cartucho. O jogo continua instalado no PC.`);
      await ctx.reloadLibrary();
      ctx.goTab('library');
    };

    const hasArt = g.customArt && g.customArt.length;
    const open = OPEN_LABEL[target.source];
    const restoreRow = h('div', { hidden: true });
    // O preset dos jogos da Steam guarda uma cópia do arquivo original; dá para voltar a ele.
    if (target.presets) {
      const backend = presetBackend(ctx, target);
      backend.get().then((st) => {
        if (!st || !st.canRestore) return;
        restoreRow.replaceWith(row('preset-restore', 'Voltar às opções gráficas originais', 'Desfaz o preset do Cartucho no arquivo de vídeo do jogo', async () => {
          const r = await backend.restore();
          if (r && r.error) return ctx.toast(r.error, { error: true });
          ctx.sfx.back();
          ctx.toast('As opções gráficas voltaram a ser as do jogo antes do Cartucho mexer.');
          ctx.rerender();
        }));
      });
    }

    const list = h('div', { class: 'set-list opts-list' },
      section('Aparência'),
      row('art-search', 'Buscar capa e fundo na internet', 'Artes do SteamGridDB feitas pela comunidade', go('artsearch', { key: g.key, mode: 'images' })),
      row('music-search', '♪ Buscar música na internet', 'Trilhas sonoras do KHInsider, com prévia antes de escolher', go('artsearch', { key: g.key, mode: 'music' })),
      row('art-cover', 'Capa do PC', 'Escolher uma imagem sua para a capa', () => pickArt('cover')),
      row('art-hero', 'Fundo do PC', 'Escolher uma imagem sua para o fundo', () => pickArt('hero')),
      g.music
        ? row('music', `♪ ${g.musicName}`, 'Música do jogo. Aperte para tirar e voltar à música tema', dropMusic, { value: 'tirar' })
        : row('music', '♪ Música do PC', 'Escolher um arquivo de áudio para tocar com o jogo selecionado', () => pickArt('music')),
      hasArt ? row('art-reset', 'Restaurar a arte original', 'Volta a capa e o fundo de antes', resetArt) : null,

      section('Jogo'),
      open ? row('open', open[0], open[1], () => { ctx.sfx.confirm(); ctx.api.openInSource(target); }) : null,
      restoreRow,
      inst ? row('rename-inst', 'Renomear a instância', 'Muda o nome no Cartucho e no Prism', () => renameInstance(ctx, inst), { value: inst.title }) : null,
      g.source === 'custom' ? row('rename', 'Renomear', 'O nome que aparece no Cartucho', rename, { value: g.title }) : null,
      row('hide', isHidden(ctx, g) ? 'Mostrar de novo' : 'Ocultar do Início, da Biblioteca e das Conquistas', isHidden(ctx, g) ? 'O jogo está escondido no filtro Ocultos' : 'Ele continua no filtro Ocultos da Biblioteca', toggleHidden),
      g.source === 'steam' && g.installed === true ? row('uninstall', 'Desinstalar', 'Pela janela da Steam, que pede confirmação', () => ctx.uninstall(g), { cls: 'danger' }) : null,
      g.source === 'custom' ? row('remove', 'Tirar do Cartucho', 'O jogo continua instalado no PC', remove, { cls: 'danger', confirm: 'Aperte de novo para tirar do Cartucho' }) : null);

    const heroBox = h('div', { class: 'opts-hero' });
    const heroUrl = g.art && g.art.hero && g.art.hero[0];
    if (heroUrl) heroBox.style.backgroundImage = `url("${heroUrl}")`;
    const el = h('div', { class: 'opts' },
      h('div', { class: 'opts-main' },
        h('div', { class: 'opts-head' }, h('span', { class: 'label' }, 'Opções'), h('h2', {}, g.title)),
        list),
      h('aside', { class: 'opts-side panel' },
        h('div', { class: 'label' }, 'Capa'),
        cover(g, 'opts-cover'),
        h('div', { class: 'label' }, 'Fundo'),
        heroBox));
    return { el, keepBackground: true, hints: [['confirm', 'Escolher'], ['back', 'Voltar']] };
  },
};
