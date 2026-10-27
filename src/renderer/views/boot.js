// Tela de abertura: logo, perfil e "Pressione A para começar", como ao ligar um console.
import { h } from '../lib/ui.js';

export function showBoot({ state, sfx, onDone }) {
  const avatar = h('span', { class: 'avatar' });
  if (state.profile && state.profile.avatar) avatar.style.backgroundImage = `url("${state.profile.avatar}")`;
  const who = h('button', { class: 'focused', onclick: () => finish() }, avatar, (state.profile && state.profile.name) || 'Jogador');
  const el = h('div', { class: 'boot' },
    h('div', { class: 'boot-logo' }, 'CARTU', h('span', {}, 'CHO')),
    h('div', { class: 'boot-press' }, h('i', { class: 'k a' }, 'A'), 'Pressione para começar'),
    h('div', { class: 'boot-who' }, who));
  document.body.append(el);
  setTimeout(() => sfx.boot(), 250);

  let done = false;
  function finish() {
    if (done) return;
    done = true;
    sfx.confirm();
    el.style.transition = 'opacity .4s';
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 420);
    onDone();
  }
  return (action) => {
    if (action === 'confirm' || action === 'menu') finish();
  };
}
