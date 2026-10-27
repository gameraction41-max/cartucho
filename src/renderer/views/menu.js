// Menu rápido: abre com Start/Guide ou M, por cima de qualquer tela. Desligar e reiniciar pedem confirmação.
import { h, hours } from '../lib/ui.js';

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
      running ? h('div', { class: 'qlabel' }, 'Jogando agora') : null,
      running ? h('div', { class: 'qlist' }, item('resume', `Voltar para ${running.title}`, go(() => ctx.api.minimize()), { small: hours(Math.round((Date.now() - running.since) / 60000)) })) : null,
      h('div', { class: 'qlist' },
        item('close', 'Fechar menu', () => close()),
        item('home', 'Início', go(() => ctx.goTab('home'))),
        item('library', 'Biblioteca', go(() => ctx.goTab('library'))),
        item('settings', 'Configurações', go(() => ctx.goTab('settings'))),
        item('sync', 'Sincronizar com a Steam', go(() => ctx.sync({ force: true, quiet: false })))),
      h('div', { class: 'qsep' }),
      h('div', { class: 'qlist' },
        item('quit', 'Sair para o Windows', () => ctx.api.power('quit')),
        item('shutdown', 'Desligar o PC', () => ctx.api.power('shutdown'), { confirm: 'Aperte de novo para desligar' }),
        item('restart', 'Reiniciar o PC', () => ctx.api.power('restart'), { confirm: 'Aperte de novo para reiniciar' })));

    root.replaceChildren(panel);
    focus.setScope(root, focusKey || (running ? 'resume' : 'close'));
  }

  root.addEventListener('click', (e) => { if (e.target === root) close(); });

  return {
    isOpen: () => open,
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
