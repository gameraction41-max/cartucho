// Painel do PC: processador, placa de vídeo, memória e discos em cartões, com uma foto de setup no fundo.
// Ao lado, o preset gráfico que combina com esse hardware. Y troca a foto do fundo por uma sua (a do seu setup, por exemplo).
import { h } from '../lib/ui.js';

const svg = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const ICONS = {
  cpu: svg('<rect x="6" y="6" width="12" height="12" rx="2"/><rect x="9.5" y="9.5" width="5" height="5" rx="1"/><path d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3"/>'),
  gpu: svg('<rect x="2" y="7" width="20" height="11" rx="2"/><circle cx="9" cy="12.5" r="3"/><circle cx="16.5" cy="12.5" r="2"/><path d="M5 18v3M10 18v3"/>'),
  mem: svg('<rect x="2" y="7" width="20" height="10" rx="1.5"/><path d="M6 10v4M10 10v4M14 10v4M18 10v4M5 17v3M19 17v3"/>'),
  disk: svg('<rect x="3" y="4" width="18" height="16" rx="2.5"/><circle cx="12" cy="11" r="4"/><circle cx="12" cy="11" r=".8"/><path d="M7 17h2"/>'),
};
const DEFAULT_BG = 'img/bg/pc.svg';
const BG_KEY = 'cartucho:pc';

const REFRESH_MS = 2000;
const GB = 1024 ** 3;

const gb = (bytes) => `${(bytes / GB).toFixed(bytes >= 100 * GB ? 0 : 1).replace('.', ',')} GB`;
const pct = (v) => (v == null ? '–' : `${Math.round(v)}%`);

function card(icon, title, ...body) {
  return h('section', { class: 'pc-card' }, h('div', { class: 'pc-card-head' }, h('i', { class: 'pc-ico', html: ICONS[icon] }), h('span', {}, title)), ...body);
}

function meter(label) {
  const fill = h('i');
  const value = h('b', { class: 'mono' }, '–');
  const detail = h('small', {}, '');
  const el = h('div', { class: 'meter' }, h('div', { class: 'meter-head' }, h('span', {}, label), value), h('div', { class: 'bar' }, fill), detail);
  return {
    el,
    update(ratio, text, sub = '') {
      fill.style.width = `${Math.min(100, Math.max(0, ratio * 100))}%`;
      fill.classList.toggle('hot', ratio > 0.9);
      value.textContent = text;
      detail.textContent = sub;
    },
  };
}

export default {
  label: 'PC',
  async render(ctx) {
    const cpuName = h('p', { class: 'muted hw' }, 'Lendo o hardware…');
    const gpuName = h('p', { class: 'pc-big' }, '');
    const osName = h('span', { class: 'mono muted' }, '');
    const cpu = meter('Uso agora');
    const mem = meter('Em uso');
    const disksBox = h('div', { class: 'disks' });

    const gpuVram = h('small', { class: 'muted' }, '');
    const hw = h('div', { class: 'pc-cards' },
      card('cpu', 'Processador', cpu.el, cpuName),
      card('gpu', 'Placa de vídeo', gpuName, gpuVram),
      card('mem', 'Memória', mem.el),
      card('disk', 'Discos', disksBox));

    const presetsBox = h('div', { class: 'plans' }, h('p', { class: 'muted' }, 'Carregando…'));
    // Jogos da Steam com preset, um por linha, com o preset em uso em cada um.
    const gamesBox = h('div', { class: 'preset-games' });
    const intro = h('p', { class: 'muted', style: { margin: '0 0 1rem' } }, 'Vendo o seu hardware…');
    const instances = ctx.state.games.filter((g) => g.source === 'prism');
    const steamGames = ctx.state.games.filter((g) => g.source === 'steam' && g.presets);
    const total = instances.length + steamGames.length;
    const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
    const coverage = [instances.length ? plural(instances.length, 'instância do Minecraft', 'instâncias do Minecraft') : null, steamGames.length ? plural(steamGames.length, 'jogo da Steam', 'jogos da Steam') : null].filter(Boolean).join(' e ');
    const presetsPanel = h('section', { class: 'panel pc-plans' },
      h('h2', { class: 'panel-title' }, 'Presets gráficos'),
      intro,
      presetsBox,
      h('p', { class: 'muted note' }, total
        ? `Vale para ${coverage}. Dá para trocar um a um na página de cada jogo.`
        : 'Os presets valem para as instâncias do Minecraft, os jogos da Steam em Unreal Engine e os da lista do Cartucho, e nenhum foi encontrado ainda.'),
      gamesBox);

    // Preset em uso: só aparece marcado quando todas as instâncias estão com o mesmo. Jogos que ainda não
    // criaram o arquivo de opções ficam de fora da conta.
    async function currentPreset(list) {
      const steam = await Promise.all(steamGames.map((g) => ctx.api.getGamePreset(g.appid).catch(() => null)));
      const label = (id) => (list.find((p) => p.id === id) || {}).label || 'Personalizado';
      gamesBox.replaceChildren(...steamGames.map((g, i) => {
        const r = steam[i];
        return h('div', { class: 'preset-game' },
          h('span', { class: 'name' }, g.title),
          h('span', { class: 'muted' }, r && r.found ? label(r.preset) : 'abra o jogo uma vez'));
      }));
      const ids = [
        ...(await Promise.all(instances.map((g) => ctx.api.getMcPreset(g.instanceId)))),
        ...steam.filter((r) => r && r.found).map((r) => r.preset),
      ];
      return ids.length && ids.every((id) => id && id === ids[0]) ? ids[0] : null;
    }

    async function loadPresets(focusId) {
      const [list, rec] = await Promise.all([ctx.api.mcPresets(), ctx.api.recommendedPreset()]);
      const current = await currentPreset(list);
      if (!alive) return;
      const recLabel = rec && (list.find((p) => p.id === rec.id) || {}).label;
      intro.textContent = rec ? `Pelo seu PC (${rec.reason}), o recomendado é ${recLabel}.` : 'Não deu para ler o hardware, mas dá para escolher na mão.';
      presetsBox.replaceChildren(...list.map((p) => h('button', {
        class: `opt plan ${p.id === current ? 'active' : ''}`, 'data-focus': true, 'data-key': `preset:${p.id}`,
        'data-autofocus': rec && p.id === rec.id ? true : undefined,
        disabled: !total,
        onclick: async () => {
          const r = await ctx.api.setMcPresetAll(p.id);
          ctx.sfx.confirm();
          ctx.toast(r.skipped ? `${p.label} aplicado em ${plural(r.applied, 'jogo', 'jogos')}. ${r.skipped} ficou de fora (aberto agora ou sem o arquivo de opções).` : `${p.label} aplicado em ${plural(r.applied, 'jogo', 'jogos')}.`);
          loadPresets(p.id);
        },
      },
      h('span', { class: 'txt' }, p.label, rec && p.id === rec.id ? h('em', { class: 'rec' }, 'recomendado') : null, h('small', {}, p.desc)),
      h('i', { class: `sw ${p.id === current ? 'on' : ''}` }))));
      if (presetsBox.isConnected) ctx.refocus(focusId ? `preset:${focusId}` : null);
    }

    let timer = null;
    let alive = true;
    async function tick() {
      let s;
      try {
        s = await ctx.api.systemStats();
      } catch {
        cpuName.textContent = 'Não foi possível ler o hardware.';
        return;
      }
      if (!alive) return;
      cpuName.textContent = `${s.cpu} · ${s.cores} núcleos, ${s.threads} threads`;
      cpu.update((s.cpuLoad || 0) / 100, pct(s.cpuLoad), s.cpuTemp ? `${Math.round(s.cpuTemp)} °C` : '');
      // A placa dedicada (a de mais memória) fica em destaque; a integrada do processador vai embaixo, menor.
      const gpus = [...s.gpu].sort((a, b) => (b.vram || 0) - (a.vram || 0));
      gpuName.textContent = gpus.length ? gpus[0].model : 'Não identificada';
      gpuVram.textContent = [gpus[0] && gpus[0].vram ? `${gb(gpus[0].vram * 1024 ** 2)} de memória de vídeo` : '', ...gpus.slice(1).map((g) => `também: ${g.model}`)].filter(Boolean).join('\n');
      mem.update(s.memUsed / s.memTotal, pct((s.memUsed / s.memTotal) * 100), `${gb(s.memUsed)} de ${gb(s.memTotal)}`);
      disksBox.replaceChildren(...s.disks.slice(0, 4).map((d) => {
        const m = meter(d.mount);
        m.update(d.used / d.size, `${gb(d.size - d.used)} livres`, `${gb(d.used)} de ${gb(d.size)}`);
        return m.el;
      }));
      osName.textContent = s.os;
      timer = setTimeout(tick, REFRESH_MS);
    }
    tick();
    loadPresets();

    // Fundo: a foto escolhida pela pessoa ou o desenho de setup do Cartucho.
    const bg = h('div', { class: 'pc-bg' });
    let customBg = null;
    const loadBg = async () => {
      customBg = ctx.api.artUrl ? await ctx.api.artUrl(BG_KEY, 'hero').catch(() => null) : null;
      bg.style.backgroundImage = `url("${customBg || DEFAULT_BG}")`;
      bg.classList.toggle('photo', !!customBg);
    };
    loadBg();
    const changeBg = async () => {
      const r = await ctx.api.pickArt(BG_KEY, 'hero');
      if (!r || r.canceled) return;
      if (r.error) return ctx.toast(r.error, { error: true });
      ctx.sfx.confirm();
      await loadBg();
      ctx.toast('Fundo da aba PC trocado. X volta para o desenho do Cartucho.');
    };
    const resetBg = async () => {
      if (!customBg) return;
      await ctx.api.resetArt(BG_KEY);
      ctx.sfx.back();
      await loadBg();
    };

    // Fica no body, atrás da tela inteira: dentro da tela, a animação de entrada prendia o fundo numa caixa.
    document.body.append(bg);
    const el = h('div', { class: 'pc' },
      h('section', { class: 'home-info pc-hero' },
        h('span', { class: 'label' }, 'Seu setup'),
        h('h1', { class: 'big-title' }, 'Seu PC'), osName),
      h('div', { class: 'pc-grid' }, hw, presetsPanel));

    return {
      el,
      hints: [['confirm', 'Aplicar preset'], ['y', 'Trocar fundo'], ['x', 'Fundo padrão'], ['menu', 'Menu']],
      onAction(action) {
        if (action === 'y') { changeBg(); return true; }
        if (action === 'x') { resetBg(); return true; }
        return false;
      },
      destroy() {
        alive = false;
        clearTimeout(timer);
        bg.remove();
      },
    };
  },
};
