// Adicionar jogo de fora da Steam: a lista dos programas do menu Iniciar e da Área de Trabalho que parecem jogos,
// para escolher com o controle, ou um .exe escolhido na janela do Windows. O jogo entra no Início e na Biblioteca.
import { h } from '../lib/ui.js';

let scanned = null; // a lista demora alguns segundos para montar; voltando à tela, aparece na hora

export default {
  label: 'Adicionar jogo',
  render(ctx) {
    ctx.setBackground(null);
    let alive = true;
    const added = new Set();
    const body = h('div', { class: 'add-body' });

    const add = async (item) => {
      const r = await ctx.api.addGame({ title: item.title, exe: item.exe });
      if (r && r.error) return ctx.toast(r.error, { error: true });
      ctx.sfx.confirm();
      added.add(item.exe);
      await ctx.reloadLibrary();
      ctx.toast(r.existed ? `${item.title} já estava no Cartucho.` : `${item.title} entrou no Cartucho. Em Opções dá para buscar a capa e mudar o nome.`);
      if (alive) draw();
    };
    const browse = async () => {
      ctx.sfx.confirm();
      const item = await ctx.api.pickGameExe();
      if (item) add(item);
    };

    function draw() {
      if (!scanned) {
        body.replaceChildren(h('p', { class: 'muted search-wait' }, 'Procurando jogos no menu Iniciar…'));
        return;
      }
      const list = scanned.filter((x) => !added.has(x.exe));
      body.replaceChildren(list.length
        ? h('div', { class: 'set-list add-list' }, list.map((x, i) => {
          const ico = h('span', { class: 'add-ico' }, x.icon ? null : x.title.slice(0, 1).toUpperCase());
          if (x.icon) ico.style.backgroundImage = `url("${x.icon}")`;
          return h('button', { class: 'opt add-row', 'data-focus': true, 'data-key': `add:${x.exe}`, 'data-autofocus': i === 0, onclick: () => add(x) },
            ico, h('span', { class: 'txt' }, x.title, h('small', {}, x.exe)), h('span', { class: 'val' }, '+ adicionar'));
        }))
        : h('div', { class: 'empty search-empty' }, h('h2', {}, 'Nada novo no menu Iniciar'),
          h('p', {}, 'Os jogos que achei já estão no Cartucho, ou o jogo não tem atalho. Use "Procurar .exe" para escolher o arquivo do jogo.')));
      ctx.refocus();
    }

    if (!scanned) {
      ctx.api.scanGames().then((list) => {
        scanned = list || [];
        if (alive) draw();
      }).catch(() => {
        scanned = [];
        if (alive) draw();
      });
    }
    draw();

    const el = h('div', { class: 'search addgame' },
      h('div', { class: 'lib-head search-head' },
        h('div', { class: 'search-title' }, h('h2', {}, 'Adicionar jogo'), h('small', {}, 'Programas do menu Iniciar e da Área de Trabalho que parecem jogos')),
        h('button', { class: 'pill', 'data-focus': true, 'data-key': 'browse', onclick: browse }, 'Procurar .exe'),
        h('button', { class: 'pill', 'data-focus': true, 'data-key': 'rescan', onclick: () => { scanned = null; draw(); ctx.api.scanGames().then((l) => { scanned = l || []; if (alive) draw(); }); } }, 'Procurar de novo')),
      body);

    return {
      el,
      hints: [['confirm', 'Adicionar'], ['x', 'Procurar .exe'], ['back', 'Voltar']],
      onAction(action) {
        if (action === 'x') { browse(); return true; }
        return false;
      },
      destroy() { alive = false; },
    };
  },
};
