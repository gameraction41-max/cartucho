// Menu rápido: abre com Start/Guide ou M, por cima de qualquer tela. Desligar e reiniciar pedem confirmação.
// O mesmo menu aparece por cima de um jogo aberto (overlay.js), com o jogo em destaque no topo.
import { h, loadFirst } from '../lib/ui.js';

function since(ms) {
  const min = Math.max(0, Math.round((Date.now() - ms) / 60000));
  if (min < 1) return 'agora há pouco';
  if (min < 60) return `há ${min} min`;
  const hh = Math.floor(min / 60);
  return `há ${hh} h ${String(min % 60).padStart(2, '0')}`;
}

// Cartão grande do jogo aberto, com a arte dele. Apertar volta para o jogo.
function nowPlaying(ctx, running, onResume) {
  const g = ctx.state.games.find((x) => x.key === running.key);
  const art = h('span', { class: 'art' });
  const urls = g && g.art ? [...(g.art.hero || []), ...(g.art.cover || [])] : [];
  if (urls.length) loadFirst(urls).then((url) => { if (url) art.style.backgroundImage = `url("${url}")`; });
  const el = h('button', { class: 'qnow', 'data-focus': true, 'data-key': 'resume' },
    art,
    h('span', { class: 'info' },
      h('small', {}, `Jogando agora · ${since(running.since)}`),
      h('b', {}, running.title),
      h('span', { class: 'cta' }, 'Voltar para o jogo')));
  el.addEventListener('click', () => { ctx.sfx.confirm(); onResume(); });
  return el;
}

export function createMenu({ ctx, focus, root, onClose }) {
  let open = false;
  let armed = null; // item de energia esperando o segundo aperto

  // how: 'dismiss' quando a pessoa só fechou o menu, 'navigate' quando escolheu um item que leva a outra tela.
  function close(how = 'dismiss') {
    if (!open) return;
    open = false;
    armed = null;
    root.hidden = true;
    root.replaceChildren();
    onClose(how);
  }

  function item(key, label, fn, { small = '', confirm = '' } = {}) {
    const el = h('button', { class: 'qitem', 'data-focus': true, 'data-key': key }, label, small ? h('small', {}, small) : null);
    el.addEventListener('click', () => {
      if (confirm && armed !== key) {
        armed = key;
        el.classList.add('confirm');
        el.firstChild.textContent = confirm;
        ctx.sfx.tab();
        return;
      }
      ctx.sfx.confirm();
      fn();
    });
    el.addEventListener('focusin-nav', () => {
      if (armed && armed !== key) render(key);
    });
    return el;
  }

  function render(focusKey) {
    armed = null;
    const running = ctx.state.running;
    const avatar = h('span', { class: 'avatar' });
    if (ctx.state.profile && ctx.state.profile.avatar) avatar.style.backgroundImage = `url("${ctx.state.profile.avatar}")`;
    const clock = h('span', { class: 'clock' }, new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }));
    const go = (fn) => () => { close('navigate'); fn(); };

    const panel = h('div', { class: 'qmenu', onclick: (e) => e.stopPropagation() },
      h('div', { class: 'qhead' }, h('div', { class: 'me' }, avatar, (ctx.state.profile && ctx.state.profile.name) || 'Jogador'), clock),
      running ? nowPlaying(ctx, running, go(() => ctx.resume())) : null,
      h('div', { class: 'qlist' },
        item('close', 'Fechar menu', () => close()),
        item('home', 'Início', go(() => ctx.goTab('home'))),
        item('library', 'Biblioteca', go(() => ctx.goTab('library'))),
        item('settings', 'Configurações', go(() => ctx.goTab('settings'))),
        item('sync', 'Sincronizar com a Steam', go(() => ctx.sync({ force: true, quiet: false }))),
        ctx.state.update && ctx.state.update.state === 'ready'
          ? item('update', `Atualizar para a ${ctx.state.update.version}`, () => ctx.api.installUpdate(), { small: 'reinicia o app' })
          : null),
      h('div', { class: 'qsep' }),
      h('div', { class: 'qlist' },
        item('quit', 'Sair para o Windows', () => ctx.api.power('quit')),
        item('sleep', 'Suspender o PC', () => { close(); ctx.api.power('sleep'); }, { confirm: 'Aperte de novo para suspender' }),
        item('shutdown', 'Desligar o PC', () => ctx.api.power('shutdown'), { confirm: 'Aperte de novo para desligar' }),
        item('restart', 'Reiniciar o PC', () => ctx.api.power('restart'), { confirm: 'Aperte de novo para reiniciar' })));

    root.replaceChildren(panel);
    focus.setScope(root, focusKey || (running ? 'resume' : 'close'));
  }

  root.addEventListener('click', (e) => { if (e.target === root) close(); });

  return {
    isOpen: () => open,
    close,
    open() {
      open = true;
      root.hidden = false;
      render();
    },
    handle(action) {
      if (action === 'back' || action === 'menu') { ctx.sfx.back(); close(); return; }
      if (action === 'confirm') { if (focus.current) focus.current.click(); return; }
      if (['up', 'down', 'left', 'right'].includes(action) && focus.move(action)) ctx.sfx.move();
    },
  };
}
