// Painel do PC: processador, placa de vídeo, memória e discos. Ao lado, o preset gráfico que combina com esse hardware.
import { h } from '../lib/ui.js';

const REFRESH_MS = 2000;
const GB = 1024 ** 3;

const gb = (bytes) => `${(bytes / GB).toFixed(bytes >= 100 * GB ? 0 : 1).replace('.', ',')} GB`;
const pct = (v) => (v == null ? '–' : `${Math.round(v)}%`);

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
    const gpuName = h('p', { class: 'muted hw' }, '');
    const osName = h('span', { class: 'mono muted' }, '');
    const cpu = meter('Processador');
    const mem = meter('Memória');
    const disksBox = h('div', { class: 'disks' });

    const hw = h('section', { class: 'panel pc-hw' },
      h('div', { class: 'pc-block' }, cpu.el, cpuName),
      h('div', { class: 'pc-block' }, h('div', { class: 'meter-head' }, h('span', {}, 'Placa de vídeo')), gpuName),
      h('div', { class: 'pc-block' }, mem.el),
      h('div', { class: 'pc-block' }, h('div', { class: 'meter-head' }, h('span', {}, 'Discos')), disksBox));

    const presetsBox = h('div', { class: 'plans' }, h('p', { class: 'muted' }, 'Carregando…'));
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
        : 'Os presets valem para as instâncias do Minecraft e os jogos da Steam em Unreal Engine, e nenhum foi encontrado ainda.'));

    // Preset em uso: só aparece marcado quando todas as instâncias estão com o mesmo.
    async function currentPreset() {
      const ids = await Promise.all([
        ...instances.map((g) => ctx.api.getMcPreset(g.instanceId)),
        ...steamGames.map((g) => ctx.api.getGamePreset(g.appid).then((r) => r && r.preset)),
      ]);
      return ids.length && ids.every((id) => id && id === ids[0]) ? ids[0] : null;
    }

    async function loadPresets(focusId) {
      const [list, rec, current] = await Promise.all([ctx.api.mcPresets(), ctx.api.recommendedPreset(), currentPreset()]);
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
      gpuName.textContent = s.gpu.length ? s.gpu.map((g) => (g.vram ? `${g.model} · ${gb(g.vram * 1024 ** 2)}` : g.model)).join('\n') : 'Não identificada';
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

    const el = h('div', { class: 'pc' },
      h('section', { class: 'home-info', style: { marginBottom: '1.6rem', marginTop: 0 } },
        h('h1', { class: 'big-title' }, 'Seu PC'), osName),
      h('div', { class: 'pc-grid' }, hw, presetsPanel));

    return {
      el,
      hints: [['confirm', 'Aplicar preset'], ['menu', 'Menu']],
      destroy() {
        alive = false;
        clearTimeout(timer);
      },
    };
  },
};
