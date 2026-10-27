// Menu rápido: abre com Start/Guide ou M, por cima de qualquer tela. Desligar e reiniciar pedem confirmação.
// O mesmo menu aparece por cima de um jogo aberto (overlay.js), com o jogo em destaque no topo.
import { h, loadFirst } from '../lib/ui.js';

// Ícones dos itens. Só aparecem no tema PS5, em que o menu vira uma fileira de botões redondos embaixo.
const svg = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const ICONS = {
  close: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
  home: svg('<path d="M3 11l9-7 9 7v9h-6v-6H9v6H3z"/>'),
  library: svg('<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>'),
  settings: svg('<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>'),
  sync: svg('<path d="M20 11a8 8 0 0 0-14.5-4.5L4 8M4 4v4h4M4 13a8 8 0 0 0 14.5 4.5L20 16M20 20v-4h-4"/>'),
  update: svg('<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>'),
  'cap-shot': svg('<rect x="3" y="6" width="18" height="13" rx="2"/><circle cx="12" cy="12.5" r="3.5"/>'),
  'cap-clip': svg('<circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/>'),
  'cap-rec': svg('<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3" fill="currentColor"/>'),
  quit: svg('<path d="M10 4H5v16h5M14 8l4 4-4 4M18 12H9"/>'),
  sleep: svg('<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>'),
  shutdown: svg('<path d="M12 3v9M6.3 6.3a8 8 0 1 0 11.4 0"/>'),
  restart: svg('<path d="M4 12a8 8 0 1 0 2.3-5.7L4 8.6M4 4v4.6h4.6"/>'),
};

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
    // O texto fica como primeiro filho: o aviso de confirmação troca só ele.
    const el = h('button', { class: 'qitem', 'data-focus': true, 'data-key': key }, label, small ? h('small', {}, small) : null,
      ICONS[key] ? h('i', { class: 'qico', html: ICONS[key] }) : null);
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

  // Prints e gravação, só no menu por cima do jogo. O menu fecha antes da captura.
  function captureItems(running) {
    if (!ctx.overlay || !running) return null;
    const cap = ctx.state.capture || {};
    const doIt = (what) => () => { close('navigate'); ctx.api.capture(what); };
    return [
      h('div', { class: 'qsep' }),
      h('div', { class: 'qlist qcap' },
        item('cap-shot', 'Tirar print', doIt('screenshot'), { small: 'Xbox + Y' }),
        cap.buffer ? item('cap-clip', 'Salvar os últimos 30 s', doIt('clip'), { small: 'Xbox + X' }) : null,
        item('cap-rec', cap.recording ? 'Parar a gravação' : 'Gravar', doIt('record'), { small: cap.recording ? `começou ${since(cap.recording)}` : 'Xbox + RB' })),
    ];
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
      h('div', { class: 'qlist qnav' },
        item('close', 'Fechar menu', () => close()),
        item('home', 'Início', go(() => ctx.goTab('home'))),
        item('library', 'Biblioteca', go(() => ctx.goTab('library'))),
        item('settings', 'Configurações', go(() => ctx.goTab('settings'))),
        item('sync', 'Sincronizar com a Steam', go(() => ctx.sync({ force: true, quiet: false }))),
        ctx.state.update && ctx.state.update.state === 'ready'
          ? item('update', `Atualizar para a ${ctx.state.update.version}`, () => ctx.api.installUpdate(), { small: 'reinicia o app' })
          : null),
      captureItems(running),
      h('div', { class: 'qsep' }),
      h('div', { class: 'qlist qpower' },
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
