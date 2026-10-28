// Navegação espacial: as setas levam ao elemento [data-focus] mais próximo naquela direção.

export function createFocus() {
  let scope = document.body;
  let current = null;

  const items = () => [...scope.querySelectorAll('[data-focus]')].filter((el) => el.offsetParent !== null && !el.disabled);

  function set(el, { scroll = true } = {}) {
    if (!el) return;
    if (current) current.classList.remove('focused');
    current = el;
    el.classList.add('focused');
    if (scroll) el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
    el.dispatchEvent(new CustomEvent('focusin-nav', { bubbles: true }));
  }

  function setScope(root, preferredKey, { scroll = true } = {}) {
    if (current) current.classList.remove('focused');
    scope = root;
    current = null;
    const list = items();
    const byKey = preferredKey && list.find((el) => el.dataset.key === preferredKey);
    const initial = byKey || list.find((el) => el.hasAttribute('data-autofocus')) || list[0];
    if (initial) set(initial, { scroll: scroll && !!byKey });
  }

  function move(dir) {
    const list = items();
    if (!current || !list.includes(current)) {
      if (list[0]) set(list[0]);
      return !!list[0];
    }
    const from = current.getBoundingClientRect();
    const fx = from.left + from.width / 2;
    const fy = from.top + from.height / 2;
    // Distância entre as bordas no eixo de lado (0 quando os dois se sobrepõem). Assim, descendo de um botão largo,
    // os dois botões menores logo abaixo dele ganham do botão largo que está mais longe.
    const gap = (a1, a2, b1, b2) => Math.max(0, b1 - a2, a1 - b2);
    let best = null;
    let bestScore = Infinity;
    for (const el of list) {
      if (el === current) continue;
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const dx = cx - fx;
      const dy = cy - fy;
      const vertical = dir === 'up' || dir === 'down';
      let main;
      if (dir === 'left') main = -dx;
      else if (dir === 'right') main = dx;
      else if (dir === 'up') main = -dy;
      else main = dy;
      if (main <= 1) continue;
      const cross = vertical ? gap(from.left, from.right, r.left, r.right) : gap(from.top, from.bottom, r.top, r.bottom);
      // Empate (dois botões lado a lado debaixo do atual): fica o que está mais perto do centro, e depois o da esquerda.
      const center = Math.abs(vertical ? dx : dy);
      const score = main + cross * 2.5 + center * 0.05;
      if (score < bestScore) {
        bestScore = score;
        best = el;
      }
    }
    if (best) set(best);
    return !!best;
  }

  return {
    set,
    setScope,
    move,
    get current() { return current; },
    get key() { return current && current.dataset.key; },
  };
}
