// Painel do PC: processador, placa de vídeo, memória e discos, e troca do plano de energia do Windows.
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

    const plansBox = h('div', { class: 'plans' }, h('p', { class: 'muted' }, 'Carregando…'));
    const plansPanel = h('section', { class: 'panel pc-plans' },
      h('h2', { class: 'panel-title' }, 'Plano de energia'),
      h('p', { class: 'muted', style: { margin: '0 0 1rem' } }, '"Alto desempenho" deixa o processador sempre acelerado nos jogos. "Equilibrado" economiza energia no dia a dia.'),
      plansBox);

    async function loadPlans(focusGuid) {
      const plans = await ctx.api.powerPlans();
      if (!alive) return;
      if (!plans.length) {
        plansBox.replaceChildren(h('p', { class: 'muted' }, 'Os planos de energia só aparecem no Windows.'));
        return;
      }
      plansBox.replaceChildren(...plans.map((p) => h('button', {
        class: `opt plan ${p.active ? 'active' : ''}`, 'data-focus': true, 'data-key': `plan:${p.guid}`,
        onclick: async () => {
          if (p.active) return;
          const r = await ctx.api.setPowerPlan(p.guid);
          if (r && r.error) return ctx.toast(`Não deu para trocar o plano: ${r.error}`, { error: true });
          ctx.sfx.confirm();
          ctx.toast(`Plano "${p.name}" ativado.`);
          loadPlans(p.guid);
        },
      }, h('span', { class: 'txt' }, p.name), h('i', { class: `sw ${p.active ? 'on' : ''}` }))));
      if (plansBox.isConnected) ctx.refocus(focusGuid ? `plan:${focusGuid}` : null);
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
    loadPlans();

    const el = h('div', { class: 'pc' },
      h('section', { class: 'home-info', style: { marginBottom: '1.6rem', marginTop: 0 } },
        h('h1', { class: 'big-title' }, 'Seu PC'), osName),
      h('div', { class: 'pc-grid' }, hw, plansPanel));

    return {
      el,
      hints: [['confirm', 'Ativar plano'], ['menu', 'Menu']],
      destroy() {
        alive = false;
        clearTimeout(timer);
      },
    };
  },
};
