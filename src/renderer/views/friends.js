// Amigos da Steam: quem está jogando agora (com a arte do jogo), quem está online e quem está offline.
import { h, when } from '../lib/ui.js';
import { emptyState } from './home.js';

const REFRESH_MS = 60 * 1000;
const STATUS = { playing: 'Jogando', online: 'Online', away: 'Ausente', busy: 'Ocupado', offline: 'Offline' };
const ORDER = { online: 0, busy: 1, away: 2 };

const header = (appid) => [
  `https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/${appid}/header.jpg`,
  `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/header.jpg`,
];

function avatar(f, cls = '') {
  const el = h('span', { class: `avatar ${cls}` }, h('i', { class: `st ${f.status}` }));
  if (f.avatar) el.style.backgroundImage = `url("${f.avatar}")`;
  return el;
}

const byName = (a, b) => a.name.localeCompare(b.name, 'pt-BR');

export default {
  label: 'Amigos',
  async render(ctx) {
    const data = await ctx.api.getFriends();
    if (!data.configured || (!data.friends.length && data.error)) {
      return {
        el: h('div', { style: { display: 'contents' } }, emptyState(ctx, {
          title: data.configured ? 'Não deu para ver seus amigos' : 'Conecte a Steam',
          text: data.configured ? data.error : 'Coloque sua chave da Steam e o SteamID nas configurações para ver quem está online.',
        })),
        hints: [['confirm', 'Selecionar']],
      };
    }

    const owned = new Map(ctx.state.games.filter((g) => g.appid).map((g) => [g.appid, g]));
    const playing = data.friends.filter((f) => f.status === 'playing').sort((a, b) => a.game.localeCompare(b.game, 'pt-BR') || byName(a, b));
    const online = data.friends.filter((f) => f.status in ORDER).sort((a, b) => ORDER[a.status] - ORDER[b.status] || byName(a, b));
    const offline = data.friends.filter((f) => f.status === 'offline').sort((a, b) => b.lastOnline - a.lastOnline);

    // Apertar num amigo jogando algo que você também tem abre a página do jogo. Nos outros casos, abre o perfil na Steam.
    const open = (f) => {
      const g = f.appid && owned.get(f.appid);
      if (g) ctx.go('game', { key: g.key });
      else ctx.api.openProfile(f.steamId);
    };

    const playCards = playing.map((f) => {
      const art = h('span', { class: 'art' });
      const img = new Image();
      const urls = f.appid ? header(f.appid) : [];
      const tryNext = () => { const u = urls.shift(); if (u) img.src = u; };
      img.onload = () => { art.style.backgroundImage = `url("${img.src}")`; };
      img.onerror = tryNext;
      tryNext();
      return h('div', { class: 'fplay', 'data-focus': true, 'data-key': `f:${f.steamId}`, role: 'button', onclick: () => open(f) },
        art,
        h('div', { class: 'who' }, avatar(f), h('span', {}, h('b', {}, f.name), h('small', {}, f.game || 'Jogando'))),
        f.appid && owned.has(f.appid) ? h('span', { class: 'tag' }, 'Você tem') : null);
    });

    const line = (f) => h('div', { class: `fline ${f.status}`, 'data-focus': true, 'data-key': `f:${f.steamId}`, role: 'button', onclick: () => open(f) },
      avatar(f),
      h('span', { class: 'nm' }, f.name),
      h('small', {}, f.status === 'offline' ? (f.lastOnline ? `visto ${when(f.lastOnline)}` : 'offline') : STATUS[f.status]));

    const el = h('div', { class: 'friends' },
      h('section', { class: 'home-info', style: { marginBottom: '1.6rem' } },
        h('span', { class: 'src steam' }, h('i'), 'Steam'),
        h('h1', { class: 'big-title' }, 'Amigos'),
        h('div', { class: 'meta' },
          h('span', {}, h('b', {}, String(playing.length)), ' jogando'),
          h('span', {}, h('b', {}, String(online.length)), ' online'),
          h('span', {}, h('b', {}, String(data.friends.length)), ' no total'))),
      h('div', { class: 'friends-grid' },
        h('section', { class: 'fcol' },
          h('div', { class: 'label' }, 'Jogando agora'),
          playCards.length ? h('div', { class: 'glist fplays' }, playCards) : h('p', { class: 'muted' }, 'Ninguém está jogando agora.')),
        h('section', { class: 'fcol' },
          h('div', { class: 'label' }, 'Online e offline'),
          h('div', { class: 'glist flines' }, online.map(line), offline.length ? h('div', { class: 'fsep' }, `Offline · ${offline.length}`) : null, offline.map(line)))));

    const timer = setTimeout(() => ctx.rerender(), REFRESH_MS);
    return {
      el,
      hints: [['confirm', 'Abrir'], ['y', 'Perfil na Steam'], ['menu', 'Menu']],
      onAction(action, { focused }) {
        if (action !== 'y' || !focused || !focused.dataset.key.startsWith('f:')) return false;
        ctx.api.openProfile(focused.dataset.key.slice(2));
        return true;
      },
      destroy() {
        clearTimeout(timer);
      },
    };
  },
};
