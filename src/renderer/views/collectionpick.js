// Escolher coleções: com um jogo (vindo da página dele), A põe ou tira o jogo de cada coleção. Sem jogo (Gerenciar), A renomeia.
// X renomeia, Y apaga (apertando de novo para confirmar) e a última linha cria uma coleção nova.
import { h, cover } from '../lib/ui.js';
import { collectionsOf, gamesIn, askName, createCollection, renameCollection, removeCollection, toggleGame } from '../lib/collections.js';

let confirmDel = null;

export default {
  label: 'Coleções',
  render(ctx, { key } = {}) {
    const g = key && ctx.state.games.find((x) => x.key === key);
    const list = collectionsOf(ctx);
    confirmDel = list.some((c) => c.id === confirmDel) ? confirmDel : null;

    const rename = (c) => askName(ctx, {
      title: `Renomear "${c.name}"`,
      value: c.name,
      done: async (name) => { await renameCollection(ctx, c.id, name); ctx.toast(`Agora se chama ${name}.`); ctx.rerender(); },
    });
    const remove = async (c) => {
      if (confirmDel !== c.id) { confirmDel = c.id; ctx.sfx.tab(); return ctx.rerender(); }
      confirmDel = null;
      await removeCollection(ctx, c.id);
      ctx.sfx.back();
      ctx.toast(`Coleção ${c.name} apagada. Os jogos continuam na biblioteca.`);
      ctx.rerender();
    };
    const create = () => askName(ctx, {
      title: g ? `Nova coleção com ${g.title}` : 'Nova coleção',
      done: async (name) => {
        const c = await createCollection(ctx, name, g ? [g.key] : []);
        ctx.sfx.confirm();
        ctx.toast(g ? `${g.title} entrou em ${name}.` : `Coleção ${name} criada.`);
        ctx.rerender();
        ctx.refocus(`col:${c.id}`);
      },
    });
    const toggle = async (c) => {
      const inside = await toggleGame(ctx, c.id, g.key);
      ctx.sfx[inside ? 'confirm' : 'back']();
      ctx.rerender();
    };

    const rows = list.map((c) => {
      const count = gamesIn(ctx, c).length;
      const deleting = confirmDel === c.id;
      const inside = g && c.keys.includes(g.key);
      return h('button', { class: `opt col-row ${deleting ? 'warn' : ''}`, 'data-focus': true, 'data-key': `col:${c.id}`, onclick: () => (g ? toggle(c) : rename(c)) },
        h('span', { class: 'txt' }, c.name,
          h('small', {}, deleting ? 'Aperte Y de novo para apagar a coleção' : `${count} ${count === 1 ? 'jogo' : 'jogos'}`)),
        g ? h('i', { class: `sw ${inside ? 'on' : ''}` }) : h('span', { class: 'val' }, 'renomear'));
    });
    const add = h('button', { class: 'opt col-new', 'data-focus': true, 'data-key': 'col:new', onclick: create },
      h('span', { class: 'txt' }, '+ Nova coleção', h('small', {}, g ? `Já entra com ${g.title}` : 'Dê um nome, como "Jogando agora" ou "Para zerar"')));

    const side = g
      ? h('div', { class: 'col-game' }, cover(g, 'col-cover'), h('h2', {}, g.title))
      : h('div', { class: 'col-game' }, h('h2', {}, 'Suas coleções'), h('p', { class: 'muted' }, 'Para pôr um jogo numa coleção, abra a página dele e escolha Coleções.'));

    const el = h('div', { class: 'col-wrap' }, side,
      h('div', { class: 'set-list' }, list.length ? null : h('p', { class: 'muted' }, 'Nenhuma coleção ainda.'), rows, add));
    if (g) ctx.setBackground(g);

    const byKey = (k) => list.find((c) => `col:${c.id}` === k);
    return {
      el,
      keepBackground: !!g,
      hints: [['confirm', g ? 'Pôr / Tirar' : 'Renomear'], ...(g ? [['x', 'Renomear']] : []), ['y', 'Apagar'], ['back', 'Voltar']],
      onAction(act, { focused }) {
        const c = focused && byKey(focused.dataset.key);
        if (act === 'x' && c && g) { ctx.sfx.confirm(); rename(c); return true; }
        if (act === 'y' && c) { remove(c); return true; }
        // Saiu da linha (ou apertou B): desiste de apagar, sem redesenhar a tela.
        if (confirmDel && ['up', 'down', 'left', 'right', 'back'].includes(act)) {
          const row = el.querySelector(`[data-key="col:${confirmDel}"]`);
          const was = byKey(`col:${confirmDel}`);
          confirmDel = null;
          if (row && was) {
            row.classList.remove('warn');
            const n = gamesIn(ctx, was).length;
            row.querySelector('small').textContent = `${n} ${n === 1 ? 'jogo' : 'jogos'}`;
          }
          if (act === 'back') { ctx.sfx.back(); return true; }
        }
        return false;
      },
    };
  },
};
