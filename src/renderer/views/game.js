// Página do jogo: arte em tela cheia, uma barra de ações (Jogar, preset gráfico, coleções, opções), números do jogo
// e, ao lado, as conquistas (Steam) ou as instâncias (Minecraft). Trocar capa, música e o resto fica em Opções (gameopts.js).
import { h, cover, hours, when, dlBar, SOURCE_NAME } from '../lib/ui.js';
import { playLabel } from './home.js';
import { collectionsOf } from '../lib/collections.js';
import { instancesOf } from '../lib/shelf.js';

export function gb(bytes) {
  const v = bytes / 1024 ** 3;
  return v >= 1 ? `${v.toFixed(1).replace('.', ',')} GB` : `${Math.max(1, Math.round(bytes / 1024 ** 2))} MB`;
}

function stat(label, value) {
  return h('div', { class: 'gstat' }, h('small', {}, label), h('b', {}, value));
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

function achPanel(ctx, g) {
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

function infoPanel(title, text) {
  return h('section', { class: 'panel' }, h('h2', { class: 'panel-title' }, title), h('p', { class: 'muted', style: { margin: 0 } }, text));
}

// Renomeia a instância no instance.cfg do Prism, então o nome novo aparece no Prism também.
export function renameInstance(ctx, inst) {
  ctx.keyboard({
    title: 'Nome da instância',
    value: inst.title,
    done: async (raw) => {
      const name = raw.replace(/\s+/g, ' ').trim();
      if (!name || name === inst.title) return;
      const r = await ctx.api.renameInstance(inst.instanceId, name);
      if (r && r.error) return ctx.toast(r.error, { error: true });
      ctx.sfx.confirm();
      await ctx.reloadLibrary();
      ctx.toast(`Agora a instância se chama ${name}.`);
    },
  });
}

// Minecraft: a lista de instâncias do Prism. A escolhe a instância; a barra de ações da esquerda passa a valer para ela.
function instancesPanel(ctx, list, chosen, choose) {
  const rows = list.map((g) => h('div', { class: `inst-line ${g.key === chosen.key ? 'on' : ''}`, 'data-focus': true, 'data-key': `inst:${g.key}`, role: 'button', onclick: () => choose(g) },
    cover(g),
    h('div', { class: 'nm' },
      h('b', {}, g.title),
      h('small', {}, [g.mcVersion || '?', g.loader, g.mods ? `${g.mods} mods` : null].filter(Boolean).join(' · '))),
    h('div', { class: 'tm' }, h('b', { class: 'mono' }, hours(g.minutes)), h('small', {}, when(g.lastPlayed))),
    h('i', { class: 'tick' }, g.key === chosen.key ? '✓' : '')));
  return h('section', { class: 'panel inst-panel' },
    h('div', { class: 'ach-head' }, h('h2', { class: 'panel-title', style: { margin: 0 } }, 'Instâncias'), h('span', { class: 'mono' }, String(list.length))),
    h('div', { class: 'inst-list' }, rows));
}

// Onde cada tipo de jogo guarda o preset: options.txt da instância (Minecraft) ou o arquivo de vídeo do jogo da Steam (gamepresets.js).
export function presetBackend(ctx, g) {
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

// Preset gráfico: cada aperto passa para o próximo e grava no arquivo do jogo. Voltar ao original fica em Opções.
function presetButton(ctx, g) {
  const backend = presetBackend(ctx, g);
  const value = h('b', {}, '…');
  const btn = h('button', { class: 'btn act', 'data-focus': true, 'data-key': 'preset' }, h('small', {}, 'Preset gráfico'), value);
  // O que o preset muda neste jogo, quando a receita dele explica (jogos do CATALOG).
  const note = h('p', { class: 'muted preset-note', hidden: true });
  let presets = [];
  let state = { found: true, preset: null };
  let recommendedId = null;
  const label = () => {
    const p = presets.find((x) => x.id === state.preset);
    const rec = presets.find((x) => x.id === recommendedId);
    if (!state.found) {
      value.textContent = 'abra o jogo uma vez';
      note.textContent = 'O jogo cria o arquivo de opções gráficas na primeira vez que abre. Depois disso dá para trocar aqui.';
      note.hidden = false;
      return;
    }
    value.textContent = p ? p.label : 'Personalizado';
    const text = [p && state.notes && state.notes[p.id], rec && (!p || p.id !== rec.id) ? `Para o seu PC, o sugerido é ${rec.label}.` : null].filter(Boolean).join(' ');
    note.textContent = text;
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
    state = { ...state, found: true, preset: next.id };
    ctx.sfx.tab();
    label();
    ctx.toast(`${next.label} aplicado. ${backend.applied}`);
  });
  return { btn, note };
}

// Mostra em quantas coleções o jogo está; abre a tela para pôr e tirar.
function collectionsButton(ctx, g) {
  const names = collectionsOf(ctx).filter((c) => c.keys.includes(g.key)).map((c) => c.name);
  return h('button', { class: `btn act col-btn ${names.length ? 'on' : ''}`, 'data-focus': true, 'data-key': 'collections', onclick: () => { ctx.sfx.confirm(); ctx.go('collectionpick', { key: g.key }); } },
    h('small', {}, 'Coleções'), h('b', {}, names.length ? names.join(', ') : 'nenhuma'));
}

function statsFor(g, inst) {
  const list = [stat('Tempo total', hours(g.minutes))];
  if (g.source === 'steam') list.push(stat('Últimas 2 semanas', hours(g.minutes2w || 0)));
  if (g.ach && g.ach.total) list.push(stat('Conquistas', `${Math.round((g.ach.unlocked / g.ach.total) * 100)}%`));
  if (inst) list.push(stat('Versão', `${inst.mcVersion || '?'} ${inst.loader || ''}`.trim()), stat('Tempo nesta', hours(inst.minutes)));
  list.push(stat('Última sessão', when((inst || g).lastPlayed)));
  if (g.size) list.push(stat('No disco', gb(g.size)));
  return h('div', { class: 'gstats' }, list);
}

export default {
  label: 'Jogo',
  render(ctx, params) {
    let g = ctx.state.games.find((x) => x.key === params.key);
    if (!g) {
      return { el: h('p', { class: 'muted', style: { marginTop: 'auto' } }, 'Este jogo não está mais na biblioteca.'), hints: [['back', 'Voltar']] };
    }
    // Uma instância do Minecraft abre a página do Minecraft com ela escolhida.
    const group = g.instanceId && ctx.state.games.find((x) => x.group);
    if (group) {
      params.inst = g.key;
      params.key = group.key;
      g = group;
    }
    ctx.setBackground(g);

    // No Minecraft, as ações valem para a instância escolhida na lista (a jogada por último, se nenhuma foi escolhida).
    const instances = g.group ? instancesOf(ctx, g) : [];
    const inst = g.group ? instances.find((x) => x.key === params.inst) || instances[0] : null;
    const target = inst || g;
    const choose = (x) => {
      params.inst = x.key;
      ctx.sfx.confirm();
      ctx.rerender();
      ctx.refocus('play');
    };

    const preset = target.source === 'prism' || target.presets ? presetButton(ctx, target) : null;
    const play = h('button', { class: 'btn primary play', 'data-focus': true, 'data-autofocus': true, 'data-key': 'play', 'data-play': target.key, onclick: () => ctx.launch(target) },
      inst ? h('span', {}, 'Jogar ', h('small', {}, inst.title)) : playLabel(g));
    const actions = h('div', { class: 'game-actions' },
      play,
      inst ? h('button', { class: 'btn act', 'data-focus': true, 'data-key': 'mods', onclick: () => { ctx.sfx.confirm(); ctx.go('mods', { key: inst.key }); } }, h('small', {}, 'Mods'), h('b', {}, inst.mods ? `${inst.mods} instalados` : 'nenhum')) : null,
      preset ? preset.btn : null,
      collectionsButton(ctx, g),
      h('button', { class: 'btn act more', 'data-focus': true, 'data-key': 'options', onclick: () => { ctx.sfx.confirm(); ctx.go('gameopts', { key: g.key, inst: inst && inst.key }); } }, h('small', {}, 'Capa, música e mais'), h('b', {}, '⋯ Opções')));

    let side;
    if (g.group) side = instancesPanel(ctx, instances, inst, choose);
    else if (g.source === 'steam') side = achPanel(ctx, g);
    else if (g.source === 'hytale') side = infoPanel('Tempo de jogo', 'O Hytale ainda não tem conquistas nem estatísticas públicas. O Cartucho conta o tempo sozinho enquanto o jogo está aberto.');
    else side = infoPanel('Jogo do PC', `O Cartucho abre ${g.exe ? g.exe.split('\\').pop() : 'o executável'} e conta o tempo enquanto o jogo está aberto. Em Opções dá para buscar a capa, renomear ou tirar o jogo do Cartucho.`);

    const src = inst ? `Prism Launcher · ${instances.length} ${instances.length === 1 ? 'instância' : 'instâncias'}` : `${SOURCE_NAME[g.source]}${g.appid ? ` · ${g.appid}` : ''}`;
    const el = h('div', { class: 'game' },
      h('div', { class: 'game-left' },
        h('span', { class: `src ${g.source}` }, h('i'), src),
        h('h1', { class: 'big-title' }, g.title),
        g.download ? dlBar(g.download, g.download.update ? 'Atualizando' : 'Baixando') : null,
        actions,
        preset ? preset.note : null,
        statsFor(g, inst)),
      side);

    return {
      el,
      keepBackground: true,
      // No Minecraft, X renomeia a instância em foco (ou a escolhida).
      hints: [['confirm', 'Selecionar'], ['y', 'Jogar'], ...(inst ? [['x', 'Renomear']] : []), ['options', 'Opções'], ['back', 'Voltar']],
      onAction(action, { focused }) {
        // Opções aqui é o mesmo botão "⋯ Opções" da página (capa, música e mais).
        if (action === 'options') {
          ctx.sfx.confirm();
          ctx.go('gameopts', { key: g.key, inst: inst && inst.key });
          return true;
        }
        if (action !== 'y' && !(action === 'x' && inst)) return false;
        // Y joga direto; numa instância da lista, joga aquela.
        const k = focused && focused.dataset.key;
        const picked = k && k.startsWith('inst:') ? instances.find((x) => `inst:${x.key}` === k) : null;
        if (action === 'x') {
          renameInstance(ctx, picked || inst);
          return true;
        }
        ctx.launch(picked || target);
        return true;
      },
    };
  },
};
