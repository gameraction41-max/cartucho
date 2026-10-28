// Página do jogo: arte em tela cheia, botão de jogar, tempo jogado e lista de conquistas.
import { h, hours, when, dlBar, SOURCE_NAME } from '../lib/ui.js';
import { playLabel } from './home.js';
import { collectionsOf } from '../lib/collections.js';

const OPEN_LABEL = { steam: 'Abrir na Steam', prism: 'Abrir no Prism', hytale: 'Mostrar pasta do Hytale' };

function gb(bytes) {
  const v = bytes / 1024 ** 3;
  return v >= 1 ? `${v.toFixed(1).replace('.', ',')} GB` : `${Math.max(1, Math.round(bytes / 1024 ** 2))} MB`;
}

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
      h('p', { class: 'muted', style: { margin: 0 } }, 'O Cartucho abre esta instância direto, sem passar pela janela do Prism. Em Mods dá para atualizar, desativar, remover e instalar mods do Modrinth. A versão do Minecraft e o loader continuam sendo trocados no Prism.'));
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

async function changeMusic(ctx, g) {
  if (g.music) {
    await ctx.api.resetArt(g.key, 'music');
    await ctx.reloadLibrary();
    ctx.sfx.back();
    return ctx.toast('Música do jogo removida. Volta a tocar a música tema.');
  }
  const r = await ctx.api.pickArt(g.key, 'music');
  if (!r || r.canceled) return;
  if (r.error) return ctx.toast(r.error, { error: true });
  ctx.sfx.confirm();
  await ctx.reloadLibrary();
  ctx.toast('Música do jogo definida. Ela toca quando o jogo estiver selecionado.');
}

async function resetArt(ctx, g) {
  await ctx.api.resetArt(g.key);
  await ctx.reloadLibrary();
  ctx.sfx.back();
  ctx.toast('Arte original de volta.');
}

// Onde cada tipo de jogo guarda o preset: options.txt da instância (Minecraft) ou o arquivo de vídeo do jogo da Steam (gamepresets.js).
function presetBackend(ctx, g) {
  if (g.source === 'prism') {
    return {
      get: async () => ({ found: true, preset: await ctx.api.getMcPreset(g.instanceId) }),
      set: (id) => ctx.api.setMcPreset(g.instanceId, id),
      applied: 'Vale na próxima vez que abrir a instância.',
    };
  }
  return {
    get: () => ctx.api.getGamePreset(g.appid),
    set: (id) => ctx.api.setGamePreset(g.appid, id),
    restore: () => ctx.api.restoreGamePreset(g.appid),
    applied: 'Vale na próxima vez que abrir o jogo.',
  };
}

// Preset gráfico: cada aperto passa para o próximo e grava no arquivo do jogo.
function presetButton(ctx, g) {
  const backend = presetBackend(ctx, g);
  const btn = h('button', { class: 'btn', 'data-focus': true, 'data-key': 'preset' }, 'Preset gráfico: …');
  const restoreBtn = h('button', { class: 'btn small', 'data-focus': true, 'data-key': 'preset-restore', hidden: true }, 'Voltar às opções originais do jogo');
  // O que o preset muda neste jogo, quando a receita dele explica (jogos do CATALOG).
  const note = h('p', { class: 'muted preset-note', hidden: true });
  let presets = [];
  let state = { found: true, preset: null, canRestore: false };
  let recommendedId = null;
  // Fora do recomendado, o botão sugere o preset que combina com o hardware (aba PC).
  const suggestion = () => {
    const rec = presets.find((x) => x.id === recommendedId);
    return rec ? ` · sugerido: ${rec.label}` : '';
  };
  const label = () => {
    const p = presets.find((x) => x.id === state.preset);
    btn.textContent = !state.found ? 'Preset gráfico: abra o jogo uma vez antes'
      : `Preset gráfico: ${p ? p.label : 'Personalizado'}${p && p.id === recommendedId ? ' · recomendado' : suggestion()}`;
    restoreBtn.hidden = !state.canRestore;
    const text = p && state.notes && state.notes[p.id];
    note.textContent = text || '';
    note.hidden = !text;
  };
  Promise.all([ctx.api.mcPresets(), backend.get(), ctx.api.recommendedPreset()]).then(([list, st, rec]) => {
    presets = list;
    state = { ...state, ...(st || {}) };
    recommendedId = rec && rec.id;
    label();
  });
  btn.addEventListener('click', async () => {
    if (!presets.length) return;
    const i = presets.findIndex((x) => x.id === state.preset);
    const next = presets[(i + 1) % presets.length];
    const r = await backend.set(next.id);
    if (r && r.error) return ctx.toast(r.error, { error: true });
    state = { ...state, found: true, preset: next.id, canRestore: !!backend.restore };
    ctx.sfx.tab();
    label();
    ctx.toast(`${next.label} aplicado. ${backend.applied}`);
  });
  restoreBtn.addEventListener('click', async () => {
    const r = await backend.restore();
    if (r && r.error) return ctx.toast(r.error, { error: true });
    ctx.sfx.back();
    state = { ...state, ...(await backend.get()) };
    label();
    ctx.refocus('preset');
    ctx.toast('As opções gráficas voltaram a ser as do jogo antes do Cartucho mexer.');
  });
  return [btn, note, restoreBtn];
}

// Mostra em quais coleções o jogo está; abre a tela para pôr e tirar.
function collectionsButton(ctx, g) {
  const names = collectionsOf(ctx).filter((c) => c.keys.includes(g.key)).map((c) => c.name);
  const label = names.length ? `Coleções: ${names.join(', ')}` : 'Pôr numa coleção';
  return h('button', { class: `btn col-btn ${names.length ? 'on' : ''}`, 'data-focus': true, 'data-key': 'collections', onclick: () => { ctx.sfx.confirm(); ctx.go('collectionpick', { key: g.key }); } }, label);
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
    if (g.size) chips.push(chip('No disco', gb(g.size)));
    const steamOnPc = g.source === 'steam' && g.installed === true;

    const el = h('div', { class: 'game' },
      h('div', { class: 'game-left' },
        h('span', { class: `src ${g.source}` }, h('i'), SOURCE_NAME[g.source], g.appid ? ` · ${g.appid}` : ''),
        h('h1', { class: 'big-title' }, g.title),
        h('div', { class: 'menu-v' },
          g.download ? dlBar(g.download, g.download.update ? 'Atualizando' : 'Baixando') : null,
          h('button', { class: 'btn primary', 'data-focus': true, 'data-autofocus': true, 'data-key': 'play', onclick: () => ctx.launch(g) }, playLabel(g)),
          g.source === 'prism' ? h('button', { class: 'btn', 'data-focus': true, 'data-key': 'mods', onclick: () => { ctx.sfx.confirm(); ctx.go('mods', { key: g.key }); } }, g.mods ? `Mods · ${g.mods}` : 'Mods') : null,
          g.source === 'prism' || g.presets ? presetButton(ctx, g) : null,
          h('button', { class: 'btn', 'data-focus': true, 'data-key': 'open', onclick: () => ctx.api.openInSource(g) }, OPEN_LABEL[g.source]),
          collectionsButton(ctx, g),
          h('div', { class: 'art-btns' },
            h('button', { class: 'btn small', 'data-focus': true, 'data-key': 'art-search', onclick: () => { ctx.sfx.confirm(); ctx.go('artsearch', { key: g.key, mode: 'images' }); } }, 'Buscar capa e fundo'),
            h('button', { class: 'btn small', 'data-focus': true, 'data-key': 'music-search', onclick: () => { ctx.sfx.confirm(); ctx.go('artsearch', { key: g.key, mode: 'music' }); } }, '♪ Buscar música')),
          h('div', { class: 'art-btns' },
            h('button', { class: 'btn small', 'data-focus': true, 'data-key': 'art-cover', onclick: () => changeArt(ctx, g, 'cover') }, 'Capa do PC'),
            h('button', { class: 'btn small', 'data-focus': true, 'data-key': 'art-hero', onclick: () => changeArt(ctx, g, 'hero') }, 'Fundo do PC'),
            g.customArt && g.customArt.length ? h('button', { class: 'btn small', 'data-focus': true, 'data-key': 'art-reset', onclick: () => resetArt(ctx, g) }, 'Restaurar') : null),
          h('button', { class: `btn small music-btn ${g.music ? 'on' : ''}`, 'data-focus': true, 'data-key': 'music', onclick: () => changeMusic(ctx, g) },
            g.music ? `♪ ${g.musicName} · tirar` : '♪ Música do PC'),
          steamOnPc ? h('button', { class: 'btn small', 'data-focus': true, 'data-key': 'uninstall', onclick: () => ctx.uninstall(g) }, 'Desinstalar') : null),
        h('div', { class: 'chips' }, chips)),
      sidePanel(ctx, g));

    return { el, keepBackground: true, hints: [['confirm', 'Selecionar'], ['back', 'Voltar']] };
  },
};
