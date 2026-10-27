// Controle e teclado viram as mesmas ações: up, down, left, right, confirm, back, x, y, lb, rb, menu.
// Também avisa qual dispositivo foi usado por último, para o indicador no topo e as dicas de botões.

const KEYS = {
  ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
  Enter: 'confirm', ' ': 'confirm',
  Escape: 'back', Backspace: 'back',
  f: 'x', F: 'x', i: 'y', I: 'y',
  q: 'lb', Q: 'lb', e: 'rb', E: 'rb',
  m: 'menu', M: 'menu',
};

// Mapeamento padrão do navegador para controles de Xbox, PlayStation e genéricos.
const BUTTONS = { 0: 'confirm', 1: 'back', 2: 'x', 3: 'y', 4: 'lb', 5: 'rb', 8: 'menu', 9: 'menu', 12: 'up', 13: 'down', 14: 'left', 15: 'right', 16: 'menu' };
const REPEATABLE = new Set(['up', 'down', 'left', 'right']);
const REPEAT_DELAY = 380;
const REPEAT_RATE = 110;
const STICK = 0.55;

export function createInput({ onAction, onDevice }) {
  let device = 'keyboard';
  const held = new Map(); // ação -> { next }

  const setDevice = (d) => {
    if (d !== device) {
      device = d;
      onDevice(d);
    }
  };

  window.addEventListener('keydown', (e) => {
    const typing = e.target instanceof HTMLInputElement;
    if (typing && e.key !== 'Enter' && e.key !== 'Escape') return;
    if (e.key === 'F11') {
      e.preventDefault();
      onAction('fullscreen');
      return;
    }
    const action = KEYS[e.key];
    if (!action) return;
    e.preventDefault();
    setDevice('keyboard');
    if (e.repeat && !REPEATABLE.has(action)) return;
    onAction(action, { typing });
  });

  window.addEventListener('mousemove', () => setDevice('mouse'), { passive: true });
  window.addEventListener('gamepadconnected', () => setDevice('gamepad'));

  const poll = (now) => {
    requestAnimationFrame(poll);
    if (!document.hasFocus()) {
      held.clear();
      return;
    }
    const active = new Set();
    for (const pad of navigator.getGamepads()) {
      if (!pad) continue;
      pad.buttons.forEach((b, i) => {
        if (b.pressed && BUTTONS[i]) active.add(BUTTONS[i]);
      });
      const [x = 0, y = 0] = pad.axes;
      if (x < -STICK) active.add('left');
      if (x > STICK) active.add('right');
      if (y < -STICK) active.add('up');
      if (y > STICK) active.add('down');
    }
    for (const action of held.keys()) if (!active.has(action)) held.delete(action);
    for (const action of active) {
      const h = held.get(action);
      if (!h) {
        setDevice('gamepad');
        held.set(action, { next: now + REPEAT_DELAY });
        onAction(action, {});
      } else if (REPEATABLE.has(action) && now >= h.next) {
        h.next = now + REPEAT_RATE;
        onAction(action, {});
      }
    }
  };
  requestAnimationFrame(poll);

  return { get device() { return device; } };
}
