// Menu rápido: abre com o botão Xbox, View ou M, por cima de qualquer tela. Desligar e reiniciar pedem confirmação.
// O mesmo menu aparece por cima de um jogo aberto (overlay.js), com o jogo em destaque no topo.
import { h, loadFirst } from '../lib/ui.js';

// Ícones dos itens. No tema PS5 o menu vira uma fileira de botões redondos embaixo; nos outros, ficam ao lado do nome.
const svg = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const ICONS = {
  close: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
  profile: svg('<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>'),
  home: svg('<path d="M3 11l9-7 9 7v9h-6v-6H9v6H3z"/>'),
  achievements: svg('<path d="M8 4h8v5a4 4 0 0 1-8 0zM8 6H4.5a3 3 0 0 0 3.5 4M16 6h3.5a3 3 0 0 1-3.5 4M12 13v4M8.5 20h7M10 17h4"/>'),
  screenshots: svg('<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M8.5 6l1.5-2h4l1.5 2"/><circle cx="12" cy="12.5" r="3.2"/>'),
  library: svg('<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>'),
  settings: svg('<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>'),
  sync: svg('<path d="M20 11a8 8 0 0 0-14.5-4.5L4 8M4 4v4h4M4 13a8 8 0 0 0 14.5 4.5L20 16M20 20v-4h-4"/>'),
  update: svg('<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>'),
  'cap-shot': svg('<rect x="3" y="6" width="18" height="13" rx="2"/><circle cx="12" cy="12.5" r="3.5"/>'),
  'cap-clip': svg('<circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/>'),
  'cap-rec': svg('<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3" fill="currentColor"/>'),
  stop: svg('<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M9 9l6 6M15 9l-6 6"/>'),
  quit: svg('<path d="M10 4H5v16h5M14 8l4 4-4 4M18 12H9"/>'),
  sleep: svg('<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>'),
  shutdown: svg('<path d="M12 3v9M6.3 6.3a8 8 0 1 0 11.4 0"/>'),
  restart: svg('<path d="M4 12a8 8 0 1 0 2.3-5.7L4 8.6M4 4v4.6h4.6"/>'),
  musicvol: svg('<path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/>'),
};

const MUSIC_STEP = 0.1;

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

  // Linha embaixo da fileira de energia: diz o nome do botão em foco e pede a confirmação.
  const powerHint = h('div', { class: 'qpower-hint' });

  function item(key, label, fn, { small = '', confirm = '', short = '' } = {}) {
    // O texto fica como primeiro filho: o aviso de confirmação troca só ele. Na fileira de energia, aparece o nome curto.
    const el = h('button', { class: 'qitem', 'data-focus': true, 'data-key': key, title: short ? label : null }, short || label, small ? h('small', {}, small) : null,
      ICONS[key] ? h('i', { class: 'qico', html: ICONS[key] }) : null);
    el.addEventListener('focusin-nav', () => {
      powerHint.textContent = !short ? '' : armed === key ? confirm : label;
      powerHint.classList.toggle('warn', !!short && armed === key);
    });
    el.addEventListener('click', () => {
      if (confirm && armed !== key) {
        armed = key;
        el.classList.add('confirm');
        if (short) {
          powerHint.textContent = confirm;
          powerHint.classList.add('warn');
        } else {
          el.firstChild.textContent = confirm;
        }
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

  // Fechar o jogo aberto, só no menu por cima do jogo. Pede um segundo aperto, como os botões de energia.
  function closeGameItem(running) {
    if (!ctx.overlay || !running || !ctx.closeGame) return null;
    const el = item('stop', 'Fechar jogo', async () => {
      const r = await ctx.closeGame();
      if (r && r.error) {
        ctx.sfx.error();
        el.firstChild.textContent = r.error;
      }
    }, { small: running.title, confirm: 'Aperte de novo para fechar o jogo' });
    return h('div', { class: 'qlist qgame' }, el);
  }

  // Volume da música de fundo (tema e música dos jogos), só na janela do Cartucho: por cima do jogo ela não toca.
  // ← e → ajustam de 10 em 10%. Com o mouse, clicar na barra escolhe o ponto, e clicar no resto abaixa 20% (do 0 volta ao 100%).
  function musicItem() {
    if (ctx.overlay || !ctx.setMusicVolume) return null;
    const fill = h('i');
    const pct = h('b');
    const paint = (v) => {
      fill.style.width = `${v * 100}%`;
      pct.textContent = v ? `${Math.round(v * 100)}%` : 'mudo';
    };
    // Guardado aqui: apertos seguidos não esperam a configuração voltar do disco.
    let value = ctx.state.config.musicVolume ?? 1;
    const set = (v) => {
      value = Math.min(1, Math.max(0, Math.round(v * 10) / 10));
      paint(value);
      ctx.setMusicVolume(value);
    };
    const bar = h('span', { class: 'bar', onclick: (e) => {
      e.stopPropagation();
      const r = bar.getBoundingClientRect();
      ctx.sfx.move();
      set((e.clientX - r.left) / r.width);
    } }, fill);
    const el = item('musicvol', 'Música de fundo', () => set(value <= 0 ? 1 : value - 0.2));
    el.append(h('span', { class: 'qvol' }, bar, pct));
    el.step = (dir) => {
      const next = Math.min(1, Math.max(0, value + dir * MUSIC_STEP));
      if (next === value) return;
      ctx.sfx.move();
      set(next);
    };
    paint(value);
    return el;
  }

  function render(focusKey) {
    armed = null;
    powerHint.textContent = '';
    powerHint.classList.remove('warn');
    const running = ctx.state.running;
    const avatar = h('span', { class: 'avatar' });
    if (ctx.state.profile && ctx.state.profile.avatar) avatar.style.backgroundImage = `url("${ctx.state.profile.avatar}")`;
    const now = new Date();
    const clock = h('span', { class: 'clock' }, now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }));
    const date = h('small', { class: 'qdate' }, now.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }));
    const go = (fn) => () => { close('navigate'); fn(); };
    const name = (ctx.state.profile && ctx.state.profile.name) || 'Jogador';
    const label = (text) => h('div', { class: 'qlabel' }, text);

    const panel = h('div', { class: 'qmenu', onclick: (e) => e.stopPropagation() },
      h('div', { class: 'qhead' },
        h('div', { class: 'me' }, avatar, h('span', { class: 'qwho' }, name, h('small', {}, running ? 'Jogando agora' : 'No Cartucho'))),
        h('div', { class: 'qtime' }, clock, date)),
      running ? nowPlaying(ctx, running, go(() => ctx.resume())) : null,
      closeGameItem(running),
      label('Ir para'),
      h('div', { class: 'qlist qnav' },
        item('close', 'Fechar menu', () => close()),
        item('home', 'Início', go(() => ctx.goTab('home'))),
        item('library', 'Biblioteca', go(() => ctx.goTab('library'))),
        item('achievements', 'Conquistas', go(() => ctx.goTab('achievements'))),
        item('screenshots', 'Capturas', go(() => ctx.goTab('screenshots'))),
        item('profile', 'Perfil', go(() => ctx.openProfile())),
        item('settings', 'Configurações', go(() => ctx.goTab('settings')))),
      captureItems(running),
      label('Ferramentas'),
      h('div', { class: 'qlist qtools' },
        item('sync', 'Sincronizar com a Steam', go(() => ctx.sync({ force: true, quiet: false }))),
        ctx.state.update && ctx.state.update.state === 'ready'
          ? item('update', `Atualizar para a ${ctx.state.update.version}`, () => ctx.api.installUpdate(), { small: 'reinicia o app' })
          : null,
        musicItem()),
      h('div', { class: 'qsep' }),
      // Energia: uma fileira de botões no pé do menu. Os que desligam pedem um segundo aperto.
      h('div', { class: 'qlist qpower' },
        item('quit', 'Sair para o Windows', () => ctx.api.power('quit'), { short: 'Sair' }),
        item('sleep', 'Suspender o PC', () => { close(); ctx.api.power('sleep'); }, { short: 'Suspender', confirm: 'Aperte de novo para suspender' }),
        item('shutdown', 'Desligar o PC', () => ctx.api.power('shutdown'), { short: 'Desligar', confirm: 'Aperte de novo para desligar' }),
        item('restart', 'Reiniciar o PC', () => ctx.api.power('restart'), { short: 'Reiniciar', confirm: 'Aperte de novo para reiniciar' })),
      powerHint);

    root.replaceChildren(panel);
    focus.setScope(root, focusKey || (running ? 'resume' : 'close'), { sameRow: true });
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
      if (action === 'back' || action === 'menu' || action === 'options') { ctx.sfx.back(); close(); return; }
      if (action === 'confirm') { if (focus.current) focus.current.click(); return; }
      if ((action === 'left' || action === 'right') && focus.current && focus.current.step) { focus.current.step(action === 'right' ? 1 : -1); return; }
      if (['up', 'down', 'left', 'right'].includes(action) && focus.move(action)) ctx.sfx.move();
    },
  };
}
