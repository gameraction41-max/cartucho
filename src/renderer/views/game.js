// Página do jogo: arte em tela cheia, botão de jogar, tempo jogado e lista de conquistas.
import { h, hours, when, SOURCE_NAME } from '../lib/ui.js';

const OPEN_LABEL = { steam: 'Abrir na Steam', prism: 'Abrir no Prism', hytale: 'Mostrar pasta do Hytale' };

function chip(label, value) {
  return h('span', { class: 'chip' }, h('small', {}, label), h('b', {}, value));
}

function achRow(a) {
  const secret = a.hidden && !a.achieved;
  const ico = h('span', { class: `ico ${a.achieved ? 'on' : ''}` });
  if (a.icon) ico.style.backgroundImage = `url("${a.icon}")`;
  const pct = a.percent == null ? '' : `${a.percent.toFixed(1).replace('.', ',')}%`;
  return h('div', { class: `ach ${a.achieved ? '' : 'locked'}`, 'data-focus': true, 'data-key': `ach:${a.api}` },
    ico,
    h('div', { style: { minWidth: 0 } },
      h('div', { class: 'nm' }, secret ? 'Conquista secreta' : a.name),
      h('small', {}, a.achieved ? `Desbloqueada ${when(a.unlocktime)}` : secret ? 'Continue jogando para descobrir' : a.description || 'Bloqueada')),
    h('span', { class: `pct ${a.percent != null && a.percent < 10 ? 'rare' : ''}` }, pct));
}

function sortAchievements(list) {
  const got = list.filter((a) => a.achieved).sort((a, b) => b.unlocktime - a.unlocktime);
  const locked = list.filter((a) => !a.achieved).sort((a, b) => (b.percent ?? 0) - (a.percent ?? 0));
  return [...got, ...locked];
}

function sidePanel(ctx, g) {
  if (g.source === 'steam') {
    const total = g.ach ? g.ach.total : 0;
    const unlocked = g.ach ? g.ach.unlocked : 0;
    const list = h('div', { class: 'ach-list' }, h('p', { class: 'muted' }, total ? 'Carregando conquistas…' : 'Este jogo não tem conquistas, ou elas ainda não foram sincronizadas.'));
    if (total) {
      ctx.api.gameAchievements(g.appid).then((items) => {
        if (!items) return;
        list.replaceChildren(...sortAchievements(items).map(achRow));
      }).catch(() => {
        list.replaceChildren(h('p', { class: 'muted' }, 'Não foi possível carregar as conquistas agora.'));
      });
    }
    return h('section', { class: 'panel ach-panel' },
      h('div', { class: 'ach-head' }, h('h2', { class: 'panel-title', style: { margin: 0 } }, 'Conquistas'), h('span', { class: 'mono' }, `${unlocked}/${total}`)),
      total ? h('div', { class: 'bar', style: { marginBottom: '1rem' } }, h('i', { style: { width: `${(unlocked / total) * 100}%` } })) : null,
      list);
  }
  if (g.source === 'prism') {
    return h('section', { class: 'panel' },
      h('h2', { class: 'panel-title' }, 'Instância do Prism Launcher'),
      h('p', { class: 'muted', style: { margin: 0 } }, 'O Cartucho abre esta instância direto, sem passar pela janela do Prism. Mods e versões continuam sendo gerenciados no Prism.'));
  }
  return h('section', { class: 'panel' },
    h('h2', { class: 'panel-title' }, 'Tempo de jogo'),
    h('p', { class: 'muted', style: { margin: 0 } }, 'O Hytale ainda não tem conquistas nem estatísticas públicas. O Cartucho conta o tempo sozinho enquanto o jogo está aberto.'));
}

// Arte personalizada: capa (a imagem vertical das listas) e fundo (a imagem grande atrás da página do jogo).
async function changeArt(ctx, g, kind) {
  const r = await ctx.api.pickArt(g.key, kind);
  if (!r || r.canceled) return;
  if (r.error) return ctx.toast(r.error, { error: true });
  ctx.sfx.confirm();
  await ctx.reloadLibrary();
  ctx.toast(kind === 'cover' ? 'Capa trocada.' : 'Fundo trocado.');
}

async function resetArt(ctx, g) {
  await ctx.api.resetArt(g.key);
  await ctx.reloadLibrary();
  ctx.sfx.back();
  ctx.toast('Arte original de volta.');
}

// Preset gráfico do Minecraft: cada aperto passa para o próximo e grava no options.txt da instância.
function presetButton(ctx, g) {
  const btn = h('button', { class: 'btn', 'data-focus': true, 'data-key': 'preset' }, 'Preset gráfico: …');
  let presets = [];
  let currentId = null;
  let recommendedId = null;
  const label = () => {
    const p = presets.find((x) => x.id === currentId);
    btn.textContent = `Preset gráfico: ${p ? p.label : 'Personalizado'}${p && p.id === recommendedId ? ' · recomendado' : ''}`;
  };
  Promise.all([ctx.api.mcPresets(), ctx.api.getMcPreset(g.instanceId), ctx.api.recommendedPreset()]).then(([list, id, rec]) => {
    presets = list;
    currentId = id;
    recommendedId = rec && rec.id;
    label();
  });
  btn.addEventListener('click', async () => {
    if (!presets.length) return;
    const i = presets.findIndex((x) => x.id === currentId);
    const next = presets[(i + 1) % presets.length];
    const r = await ctx.api.setMcPreset(g.instanceId, next.id);
    if (r && r.error) return ctx.toast(r.error, { error: true });
    currentId = next.id;
    ctx.sfx.tab();
    label();
    ctx.toast(`${next.label} aplicado. Vale na próxima vez que abrir a instância.`);
  });
  return btn;
}

export default {
  label: 'Jogo',
  render(ctx, { key }) {
    const g = ctx.state.games.find((x) => x.key === key);
    if (!g) {
      return { el: h('p', { class: 'muted', style: { marginTop: 'auto' } }, 'Este jogo não está mais na biblioteca.'), hints: [['back', 'Voltar']] };
    }
    ctx.setBackground(g);

    const chips = [chip('Tempo total', hours(g.minutes))];
    if (g.source === 'steam') chips.push(chip('Últimas 2 semanas', hours(g.minutes2w || 0)));
    if (g.source === 'prism') chips.push(chip('Versão', g.mcVersion || '?'), chip('Loader', g.loader), chip('Mods', String(g.mods)));
    chips.push(chip('Última sessão', when(g.lastPlayed)));

    const el = h('div', { class: 'game' },
      h('div', { class: 'game-left' },
        h('span', { class: `src ${g.source}` }, h('i'), SOURCE_NAME[g.source], g.appid ? ` · ${g.appid}` : ''),
        h('h1', { class: 'big-title' }, g.title),
        h('div', { class: 'menu-v' },
          h('button', { class: 'btn primary', 'data-focus': true, 'data-autofocus': true, 'data-key': 'play', onclick: () => ctx.launch(g) }, 'Jogar'),
          g.source === 'prism' ? presetButton(ctx, g) : null,
          h('button', { class: 'btn', 'data-focus': true, 'data-key': 'open', onclick: () => ctx.api.openInSource(g) }, OPEN_LABEL[g.source]),
          h('div', { class: 'art-btns' },
            h('button', { class: 'btn small', 'data-focus': true, 'data-key': 'art-cover', onclick: () => changeArt(ctx, g, 'cover') }, 'Trocar capa'),
            h('button', { class: 'btn small', 'data-focus': true, 'data-key': 'art-hero', onclick: () => changeArt(ctx, g, 'hero') }, 'Trocar fundo'),
            g.customArt && g.customArt.length ? h('button', { class: 'btn small', 'data-focus': true, 'data-key': 'art-reset', onclick: () => resetArt(ctx, g) }, 'Restaurar') : null)),
        h('div', { class: 'chips' }, chips)),
      sidePanel(ctx, g));

    return { el, keepBackground: true, hints: [['confirm', 'Selecionar'], ['back', 'Voltar']] };
  },
};
