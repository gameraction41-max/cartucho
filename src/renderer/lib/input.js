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
// O botão 16 (Guide/Xbox) quase nunca chega por aqui no Windows; lá ele é lido pelo processo principal (main/guide.js).
const BUTTONS = { 0: 'confirm', 1: 'back', 2: 'x', 3: 'y', 4: 'lb', 5: 'rb', 8: 'menu', 9: 'menu', 12: 'up', 13: 'down', 14: 'left', 15: 'right', 16: 'menu' };
const REPEATABLE = new Set(['up', 'down', 'left', 'right']);
const REPEAT_DELAY = 380;
const REPEAT_RATE = 110;
const STICK = 0.55;
// Analógico direito rola a tela. Abaixo disso é folga do próprio controle.
const SCROLL_DEADZONE = 0.2;

export function createInput({ onAction, onDevice, onScroll, nativeGuide = false }) {
  const buttons = { ...BUTTONS };
  if (nativeGuide) delete buttons[16];
  let device = 'keyboard';
  const held = new Map(); // ação -> { next }
  let last = 0;

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
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!document.hasFocus()) {
      held.clear();
      return;
    }
    const active = new Set();
    let sx = 0;
    let sy = 0;
    for (const pad of navigator.getGamepads()) {
      if (!pad) continue;
      pad.buttons.forEach((b, i) => {
        if (b.pressed && buttons[i]) active.add(buttons[i]);
      });
      const [x = 0, y = 0] = pad.axes;
      if (x < -STICK) active.add('left');
      if (x > STICK) active.add('right');
      if (y < -STICK) active.add('up');
      if (y > STICK) active.add('down');
      const [, , rx = 0, ry = 0] = pad.axes;
      if (Math.abs(rx) > Math.abs(sx)) sx = rx;
      if (Math.abs(ry) > Math.abs(sy)) sy = ry;
    }
    const dead = (v) => (Math.abs(v) < SCROLL_DEADZONE ? 0 : v);
    sx = dead(sx);
    sy = dead(sy);
    if (onScroll && (sx || sy)) {
      setDevice('gamepad');
      onScroll(sx, sy, dt);
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

  return { setDevice, get device() { return device; } };
}
