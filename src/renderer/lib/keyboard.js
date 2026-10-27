// Teclado na tela para os campos de texto, para usar o Cartucho só com o controle.
// A digita a tecla, B apaga, Y põe espaço, X liga as maiúsculas e Start confirma. O teclado físico também funciona aqui.
import { h } from './ui.js';

const ROWS = [
  ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
  ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
  ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', 'ç'],
  ['z', 'x', 'c', 'v', 'b', 'n', 'm', '-', '_', '.'],
];

export function createKeyboard({ root, focus, sfx, hints, readClipboard }) {
  let state = null; // { value, caps, done, cancel, field, restore }

  const isOpen = () => !!state;

  function close(ok) {
    if (!state) return;
    const s = state;
    state = null;
    window.removeEventListener('keydown', onKey, true);
    root.hidden = true;
    root.replaceChildren();
    s.restore();
    if (ok) s.done(s.value);
  }

  function type(text) {
    if (!state || !text) return;
    state.value += text;
    sfx.move();
    paint();
  }

  function erase() {
    if (!state || !state.value) return;
    state.value = state.value.slice(0, -1);
    sfx.back();
    paint();
  }

  function toggleCaps() {
    state.caps = !state.caps;
    sfx.tab();
    render(focus.key);
  }

  async function paste() {
    const text = ((await readClipboard()) || '').replace(/[\r\n\t]+/g, ' ').trim();
    if (text) type(text);
  }

  function paint() {
    const field = root.querySelector('.vkb-field');
    if (!field) return;
    const shown = state.secret && !state.reveal ? '•'.repeat(state.value.length) : state.value;
    field.replaceChildren(shown ? h('span', {}, shown) : h('span', { class: 'ph' }, state.placeholder || 'Digite aqui'), h('i', { class: 'caret' }));
  }

  function key(label, fn, { cls = '', k = label } = {}) {
    const el = h('button', { class: `vkb-key ${cls}`, 'data-focus': true, 'data-key': `k:${k}` }, label);
    el.addEventListener('click', fn);
    return el;
  }

  function render(focusKey) {
    const up = (c) => (state.caps ? c.toUpperCase() : c);
    const rows = ROWS.map((row) => h('div', { class: 'vkb-row' }, row.map((c) => key(up(c), () => type(up(c)), { k: c }))));
    const actions = h('div', { class: 'vkb-row vkb-actions' },
      key(state.caps ? 'ABC' : 'abc', toggleCaps, { cls: `wide ${state.caps ? 'on' : ''}`, k: 'caps' }),
      key('Espaço', () => type(' '), { cls: 'space', k: 'space' }),
      key('⌫ Apagar', erase, { cls: 'wide', k: 'erase' }),
      key('Colar', paste, { cls: 'wide', k: 'paste' }),
      state.secret ? key(state.reveal ? 'Ocultar' : 'Mostrar', () => { state.reveal = !state.reveal; render(focus.key); }, { cls: 'wide', k: 'reveal' }) : null,
      key('Cancelar', () => { sfx.back(); close(false); }, { cls: 'wide', k: 'cancel' }),
      key('OK', () => { sfx.confirm(); close(true); }, { cls: 'wide ok', k: 'ok' }));
    const panel = h('div', { class: 'vkb', onclick: (e) => e.stopPropagation() },
      h('div', { class: 'vkb-title' }, state.title),
      h('div', { class: 'vkb-field' }),
      rows, actions,
      h('div', { class: 'vkb-hints' }, hints([['confirm', 'Tecla'], ['back', 'Apagar'], ['y', 'Espaço'], ['x', 'Maiúsculas'], ['menu', 'OK']])));
    root.replaceChildren(panel);
    paint();
    focus.setScope(root, focusKey || 'k:q', { scroll: false });
  }

  // Teclado físico: letras entram direto, Backspace apaga, Enter confirma, Esc cancela. As setas continuam navegando.
  function onKey(e) {
    if (!state) return;
    if (e.key.startsWith('Arrow')) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (e.key === 'Enter') return close(true);
    if (e.key === 'Escape') return close(false);
    if (e.key === 'Backspace') return erase();
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') return paste();
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) type(e.key);
  }

  return {
    isOpen,
    // done(valor) só é chamado no OK; restore() devolve o foco para a tela de trás.
    open({ title, value = '', placeholder = '', secret = false, done, restore }) {
      state = { title, value, placeholder, secret, reveal: false, caps: false, done, restore };
      root.hidden = false;
      window.addEventListener('keydown', onKey, true);
      render();
    },
    handle(action) {
      if (!state) return;
      if (action === 'back') return erase();
      if (action === 'y') return type(' ');
      if (action === 'x') return toggleCaps();
      if (action === 'menu') { sfx.confirm(); return close(true); }
      if (action === 'confirm') { if (focus.current) focus.current.click(); return; }
      if (['up', 'down', 'left', 'right'].includes(action) && focus.move(action)) sfx.move();
    },
  };
}
