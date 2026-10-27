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
    let best = null;
    let bestScore = Infinity;
    for (const el of list) {
      if (el === current) continue;
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const dx = cx - fx;
      const dy = cy - fy;
      let main;
      let cross;
      if (dir === 'left') { main = -dx; cross = Math.abs(dy); }
      else if (dir === 'right') { main = dx; cross = Math.abs(dy); }
      else if (dir === 'up') { main = -dy; cross = Math.abs(dx); }
      else { main = dy; cross = Math.abs(dx); }
      if (main <= 1) continue;
      const score = main + cross * 2.5;
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
