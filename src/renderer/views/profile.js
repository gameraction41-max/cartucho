// Perfil: nível do Cartucho e da Steam, horas somando todas as fontes, conquistas mais raras e jogos mais jogados.
import { h, cover, when, hours } from '../lib/ui.js';
import { ring } from './achievements.js';

const SOURCE_LABEL = { steam: 'Steam', prism: 'Minecraft', hytale: 'Hytale' };
const pctText = (p) => `${p < 10 ? p.toFixed(1).replace('.', ',') : Math.round(p)}%`;
// Faixas de raridade, como as cores de conquista nos consoles.
const tier = (p) => (p < 5 ? ['ultra', 'Ultra rara'] : p < 15 ? ['rare', 'Rara'] : ['common', 'Incomum']);
const num = (n) => n.toLocaleString('pt-BR');

function header(ctx, data) {
  const p = data.player || {};
  const s = data.summary;
  const avatar = h('span', { class: 'avatar prof-avatar' });
  if (p.avatar) avatar.style.backgroundImage = `url("${p.avatar}")`;
  const facts = [
    p.steamLevel != null ? h('span', { class: 'steam-lv' }, h('b', {}, p.steamLevel), 'nível na Steam') : null,
    p.since ? h('span', {}, `Na Steam desde ${new Date(p.since).getFullYear()}`) : null,
    h('span', {}, `${num(data.playtime.games)} jogos na biblioteca`),
  ];
  const steamId = ctx.state.config.steamId;
  const toNext = Math.round((1 - s.progress) * 250);
  return h('section', { class: 'prof-head' },
    avatar,
    h('div', { class: 'prof-id' },
      h('h1', { class: 'big-title' }, p.name || 'Jogador'),
      h('div', { class: 'prof-facts' }, facts),
      steamId ? h('button', { class: 'btn small', 'data-focus': true, 'data-key': 'steam-profile', onclick: () => ctx.api.openProfile(steamId) }, 'Abrir perfil na Steam') : null),
    h('div', { class: 'prof-level' },
      ring(s.level, s.progress),
      h('div', {},
        h('div', { class: 'label' }, 'Nível no Cartucho'),
        h('b', { class: 'mono' }, `${num(s.xp)} XP`),
        h('small', {}, `faltam ${toNext} XP para o nível ${s.level + 1}`))));
}

function stats(data) {
  const s = data.summary;
  const t = data.playtime;
  const stat = (value, label, extra) => h('div', { class: 'prof-stat' }, h('b', {}, value), h('span', {}, label), extra ? h('small', {}, extra) : null);
  return h('section', { class: 'prof-stats' },
    stat(hours(t.minutes), 'jogadas no total', `${num(t.played)} jogos com tempo`),
    stat(num(s.unlocked), 'conquistas', s.total ? `${Math.round((s.unlocked / s.total) * 100)}% de ${num(s.total)}` : null),
    stat(num(s.perfect), s.perfect === 1 ? 'jogo 100%' : 'jogos 100%', `de ${num(s.games.length)} com conquistas`),
    stat(`+${num(s.month)}`, 'conquistas em 30 dias', s.latest ? `última: ${when(s.latest.unlocktime)}` : null));
}

function rareCard(ctx, a) {
  const [cls, label] = tier(a.percent);
  const ico = h('span', { class: 'ico' });
  if (a.icon) ico.style.backgroundImage = `url("${a.icon}")`;
  return h('button', { class: `rare-card ${cls}`, 'data-focus': true, 'data-key': `rare:${a.appid}:${a.api}`, onclick: () => ctx.go('game', { key: a.key }) },
    ico,
    h('div', { class: 'txt' },
      h('b', {}, a.name),
      h('small', {}, a.game)),
    h('div', { class: 'rar' }, h('b', { class: 'mono' }, pctText(a.percent)), h('small', {}, label)));
}

function rarePanel(ctx, data) {
  const st = data.rarityStatus || {};
  let body;
  if (data.rare.length) {
    body = h('div', { class: 'rare-grid' }, data.rare.map((a) => rareCard(ctx, a)));
  } else {
    const text = st.running
      ? `Vendo quantos jogadores têm cada conquista… ${st.done} de ${st.total} jogos.`
      : data.summary.unlocked
        ? 'As conquistas mais raras aparecem aqui depois da próxima sincronização com a Steam.'
        : 'Desbloqueie conquistas nos jogos da Steam e as mais raras ficam em destaque aqui.';
    body = h('p', { class: 'muted', style: { margin: 0, fontSize: '1.05rem' } }, text);
  }
  return h('section', { class: 'panel prof-rare' },
    h('div', { class: 'list-head' },
      h('h2', { class: 'panel-title', style: { margin: 0 } }, 'Conquistas raras'),
      h('span', { class: 'muted' }, st.running && data.rare.length ? `atualizando ${st.done} de ${st.total}…` : 'as que menos jogadores têm')),
    body);
}

function playPanel(ctx, data) {
  const t = data.playtime;
  const gamesByKey = new Map(ctx.state.games.map((g) => [g.key, g]));
  const max = Math.max(1, ...t.top.map((g) => g.minutes));
  const total = Math.max(1, t.minutes);
  const sources = Object.entries(t.bySource).filter(([, m]) => m > 0);
  return h('section', { class: 'panel prof-play' },
    h('h2', { class: 'panel-title' }, 'Mais jogados'),
    h('div', { class: 'top-list' }, t.top.map((row) => {
      const g = gamesByKey.get(row.key) || row;
      return h('div', { class: 'top-line', 'data-focus': true, 'data-key': `top:${row.key}`, role: 'button', onclick: () => ctx.go('game', { key: row.key }) },
        cover(g),
        h('div', { class: 'nm' }, h('span', {}, row.title), h('div', { class: 'bar' }, h('i', { style: { width: `${(row.minutes / max) * 100}%` } }))),
        h('b', { class: 'mono' }, hours(row.minutes)));
    })),
    sources.length > 1 ? h('div', { class: 'split' },
      h('div', { class: 'split-bar' }, sources.map(([src, m]) => h('i', { class: src, style: { width: `${(m / total) * 100}%` } }))),
      h('div', { class: 'split-legend' }, sources.map(([src, m]) => h('span', { class: src }, h('i', {}), SOURCE_LABEL[src] || src, h('b', { class: 'mono' }, hours(m)))))) : null);
}

export default {
  label: 'Perfil',
  async render(ctx) {
    const data = await ctx.api.getProfile();
    // O fundo fica com a arte do jogo mais jogado.
    const fav = data.playtime.top[0] && ctx.state.games.find((g) => g.key === data.playtime.top[0].key);
    ctx.setBackground(fav || null);
    const el = h('div', { class: 'prof' },
      header(ctx, data),
      stats(data),
      h('div', { class: 'prof-body' }, rarePanel(ctx, data), playPanel(ctx, data)));
    return {
      el,
      keepBackground: true,
      hints: [['confirm', 'Ver jogo'], ['back', 'Voltar']],
    };
  },
};
