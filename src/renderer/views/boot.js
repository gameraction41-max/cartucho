// Tela de perfil (abertura): aparece ao ligar e quando o B não tem mais para onde voltar, como a tela de escolher
// usuário de um console. O fundo é a arte do último jogo aberto pelo Cartucho, e o cartão do perfil mostra o resumo de quem vai entrar.
import { h, hours, when, loadFirst, sortRecent } from '../lib/ui.js';

// O último jogo aberto pelo Cartucho; antes do primeiro, o último jogado. Jogos ocultos nunca entram. Uma instância do
// Minecraft usa a arte do Minecraft.
export function lastGame(state) {
  const games = state.games || [];
  const hidden = new Set((state.config && state.config.hiddenGames) || []);
  const shown = (g) => g && !hidden.has(g.key);
  let g = games.find((x) => x.key === (state.config && state.config.lastLaunched));
  if (g && g.instanceId) {
    const group = games.find((x) => x.group);
    return shown(g) && shown(group) ? { ...group, title: g.title, lastPlayed: g.lastPlayed || group.lastPlayed } : fallback();
  }
  return shown(g) ? g : fallback();

  function fallback() {
    return sortRecent(games.filter((x) => !x.instanceId && x.lastPlayed && shown(x)))[0] || null;
  }
}

export function showBoot({ state, sfx, first = true, sound = true, onDone }) {
  const name = (state.profile && state.profile.name) || 'Jogador';
  const avatar = h('span', { class: 'avatar' });
  if (state.profile && state.profile.avatar) avatar.style.backgroundImage = `url("${state.profile.avatar}")`;
  const g = lastGame(state);
  const total = (state.games || []).filter((x) => !x.group).reduce((s, x) => s + (x.minutes || 0), 0);
  const count = (state.games || []).filter((x) => !x.instanceId).length;

  const bg = h('div', { class: 'boot-bg' });
  if (g && g.art) {
    const urls = [...(g.art.hero || []), ...(g.source === 'prism' || g.source === 'minecraft' ? [] : g.art.cover || [])];
    loadFirst(urls).then((url) => { if (url) { bg.style.backgroundImage = `url("${url}")`; bg.classList.add('on'); } });
  }

  const now = new Date();
  const card = h('button', { class: 'boot-card focused', onclick: () => finish() },
    h('span', { class: 'boot-ring' }, avatar),
    h('b', { class: 'boot-name' }, name),
    h('span', { class: 'boot-facts' },
      h('span', {}, h('b', {}, hours(total)), ' jogadas'),
      h('span', {}, h('b', {}, count), count === 1 ? ' jogo' : ' jogos')),
    g ? h('span', { class: 'boot-last' }, h('small', {}, 'Último jogo'), h('span', {}, g.title, h('em', {}, ` · ${when(g.lastPlayed)}`))) : null);

  const el = h('div', { class: `boot ${first ? 'first' : ''}` },
    bg,
    h('div', { class: 'boot-shade' }),
    h('div', { class: 'boot-top' },
      h('div', { class: 'boot-logo' }, h('img', { src: 'img/logo.svg', alt: '' }), h('b', {}, 'CARTU', h('span', {}, 'CHO'))),
      h('div', { class: 'boot-clock' },
        h('b', { class: 'clock' }, now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })),
        h('small', {}, now.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })))),
    h('div', { class: 'boot-center' },
      h('div', { class: 'boot-ask' }, 'Quem vai jogar?'),
      card),
    h('div', { class: 'boot-press' }, h('i', { class: 'k a' }, 'A'), 'Entrar'));
  document.body.append(el);
  if (first && sound) setTimeout(() => sfx.boot(), 250);

  let done = false;
  function finish() {
    if (done) return;
    done = true;
    sfx.confirm();
    el.classList.add('leaving');
    setTimeout(() => el.remove(), 420);
    onDone();
  }
  return (action) => {
    if (action === 'confirm' || action === 'menu') finish();
  };
}
