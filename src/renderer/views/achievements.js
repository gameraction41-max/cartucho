// Conquistas: nível de jogador do Cartucho e o progresso de cada jogo da Steam.
import { h, cover, when, hours, keyPill } from '../lib/ui.js';
import { emptyState } from './home.js';

const SORTS = [
  { id: 'near', label: 'Mais perto de completar', fn: (a, b) => done(a) - done(b) || pct(b) - pct(a) },
  { id: 'most', label: 'Mais conquistas', fn: (a, b) => b.unlocked - a.unlocked },
  { id: 'name', label: 'Nome', fn: (a, b) => a.title.localeCompare(b.title, 'pt-BR') },
];
const pct = (g) => g.unlocked / g.total;
const done = (g) => (g.unlocked === g.total ? 1 : 0);
let sortIndex = 0;

export function ring(level, progress) {
  const c = 2 * Math.PI * 50;
  return h('div', {
    html: `<svg viewBox="0 0 120 120" role="img" aria-label="Nível ${level}">
      <circle cx="60" cy="60" r="50" fill="none" stroke="rgba(255,255,255,.14)" stroke-width="8"/>
      <circle cx="60" cy="60" r="50" fill="none" stroke="var(--gold)" stroke-width="8" stroke-linecap="round" stroke-dasharray="${(progress * c).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 60 60)"/>
      <text x="60" y="52" text-anchor="middle" fill="var(--muted)" font-family="Barlow, sans-serif" font-size="10" letter-spacing="2">NÍVEL</text>
      <text x="60" y="80" text-anchor="middle" fill="var(--ink)" font-family="Oxanium, sans-serif" font-size="30" font-weight="800">${level}</text>
    </svg>`,
  });
}

const WEEKDAY = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

// Tempo jogado nos últimos 7 dias, somando Steam, Minecraft e Hytale.
function weekPanel(ctx, w) {
  const titles = new Map(ctx.state.games.map((g) => [g.key, g.title]));
  const max = Math.max(1, ...w.days.map((d) => d.minutes));
  const bars = h('div', { class: 'wbars' }, w.days.map((d, i) => h('div', { class: `wday ${i === 6 ? 'today' : ''}`, title: hours(d.minutes) },
    h('span', { class: 'col' }, h('i', { style: { height: `${Math.max(d.minutes ? 6 : 0, (d.minutes / max) * 100)}%` } })),
    h('small', {}, WEEKDAY[d.weekday]))));
  const empty = !w.total;
  return h('section', { class: 'panel week' },
    h('div', { class: 'week-head' }, h('h2', { class: 'panel-title', style: { margin: 0 } }, 'Últimos 7 dias'), h('b', { class: 'mono' }, hours(w.total))),
    bars,
    empty
      ? h('p', { class: 'muted', style: { margin: 0, fontSize: '.9rem' } }, 'O Cartucho começou a contar agora. Conforme você joga, o tempo de cada dia aparece aqui.')
      : h('div', { class: 'wtop' }, w.top.map((t) => h('div', {}, h('span', {}, titles.get(t.key) || t.key), h('b', { class: 'mono' }, hours(t.minutes))))));
}

export default {
  label: 'Conquistas',
  async render(ctx) {
    const [s, w] = await Promise.all([ctx.api.achievementSummary(), ctx.api.playWeek()]);
    const st = s.status || {};
    if (!s.total) {
      // Diz o que está acontecendo: ainda lendo, a Steam recusou, ou nada para mostrar.
      let title = 'Nenhuma conquista ainda';
      let text = 'Conecte sua conta da Steam nas configurações para ver suas conquistas e seu nível.';
      if (ctx.state.steamConfigured) {
        if (st.running) {
          title = 'Lendo suas conquistas…';
          text = `${st.done} de ${st.total} jogos lidos. Elas vão aparecendo aqui enquanto a leitura continua.`;
        } else if (st.failed && st.error) {
          title = 'Não deu para ler as conquistas';
          text = st.error;
        } else {
          text = 'As conquistas aparecem aqui depois da sincronização com a Steam. Aperte Sincronizar no menu rápido para tentar agora.';
        }
      }
      return {
        el: h('div', { style: { display: 'contents' } }, emptyState(ctx, { title, text })),
        hints: [['confirm', 'Selecionar']],
      };
    }

    const gamesByKey = new Map(ctx.state.games.map((g) => [g.key, g]));
    const sort = SORTS[sortIndex];
    const rows = [...s.games].sort(sort.fn).map((row) => {
      const g = gamesByKey.get(row.key) || { key: row.key, source: 'steam', title: row.title };
      const left = row.total - row.unlocked;
      return h('div', { class: 'gline', 'data-focus': true, 'data-key': row.key, role: 'button', onclick: () => ctx.go('game', { key: row.key }) },
        cover(g),
        h('div', { class: 'nm' }, row.title, h('div', { class: 'bar' }, h('i', { style: { width: `${pct(row) * 100}%` } }))),
        h('div', { class: 'n' }, `${row.unlocked}/${row.total}`, h('small', {}, left ? `faltam ${left}` : 'completo')));
    });

    const el = h('div', { class: 'ach-wrap' },
      h('div', { class: 'ach-side' },
      // O painel do nível leva para o perfil.
      h('section', { class: 'panel level', 'data-focus': true, 'data-key': 'profile', role: 'button', onclick: () => ctx.openProfile() },
        ring(s.level, s.progress),
        h('div', { class: 'counts' },
          h('span', {}, h('b', {}, s.unlocked), 'conquistas'),
          h('span', {}, h('b', {}, s.perfect), 'jogos 100%'),
          h('span', {}, h('b', {}, `+${s.month}`), 'últimos 30 dias')),
        s.latest ? h('div', { class: 'latest' }, h('span', { class: 'ico' }), h('div', {}, s.latest.name, h('small', {}, `${s.latest.game} · ${when(s.latest.unlocktime)}`))) : null),
      weekPanel(ctx, w)),
      h('section', { class: 'list-col' },
        h('div', { class: 'list-head' },
          h('h2', { class: 'panel-title', style: { margin: 0 } }, 'Seus jogos'),
          st.running ? h('span', { class: 'muted' }, `lendo ${st.done} de ${st.total}…`) : null,
          keyPill(ctx, 'y', sort.label, { 'data-key': 'sort', onclick: () => { sortIndex = (sortIndex + 1) % SORTS.length; ctx.sfx.tab(); ctx.rerender(); } })),
        h('div', { class: 'glist' }, rows)));

    return {
      el,
      // Y ordena, como na Biblioteca.
      hints: [['confirm', 'Abrir'], ['y', 'Ordenar'], ['menu', 'Menu']],
      onAction(action) {
        if (action !== 'y') return false;
        sortIndex = (sortIndex + 1) % SORTS.length;
        ctx.sfx.tab();
        ctx.rerender();
        return true;
      },
    };
  },
};
