// Botão do Xbox (Guide). O navegador não enxerga esse botão, então lemos direto do driver do controle (XInput),
// pela função escondida XInputGetStateEx (ordinal 100), a mesma que a Steam e outros launchers usam.
// Como funciona fora da janela, o botão também traz o Cartucho de volta quando um jogo está aberto.

const GUIDE = 0x0400;
// Botões que, apertados com o Xbox segurado, viram atalho em vez de abrir o menu.
const COMBOS = { y: 0x8000, x: 0x4000, rb: 0x0200 };
const SLOTS = 4;
const POLL_MS = 50;
const RESCAN_MS = 2000; // controles desconectados são caros de consultar, então são verificados com menos frequência
const ERROR_SUCCESS = 0;

function loadXInput() {
  if (process.platform !== 'win32') return null;
  let koffi;
  try {
    koffi = require('koffi');
  } catch {
    return null;
  }
  const STATE = koffi.struct('XINPUT_STATE_EX', {
    packet: 'uint32',
    buttons: 'uint16',
    leftTrigger: 'uint8',
    rightTrigger: 'uint8',
    thumbLX: 'int16',
    thumbLY: 'int16',
    thumbRX: 'int16',
    thumbRY: 'int16',
    reserved: 'uint32',
  });
  for (const dll of ['xinput1_4.dll', 'xinput1_3.dll']) {
    try {
      const lib = koffi.load(dll);
      const getStateEx = lib.func('__stdcall', 100, 'uint32', ['uint32', koffi.out(koffi.pointer(STATE))]);
      return (slot) => {
        const state = {};
        return getStateEx(slot, state) === ERROR_SUCCESS ? state : null;
      };
    } catch {}
  }
  return null;
}

// Abaixo disso é folga do analógico e dos gatilhos, que não conta como uso (modo sofá).
const STICK_DEAD = 9000;
const TRIGGER_DEAD = 40;

// Resumo do que está apertado, para saber se alguém mexeu no controle mesmo com o Cartucho atrás de outra janela.
function inputKey(s) {
  if (!s) return '';
  const stick = (v) => (v > STICK_DEAD ? 1 : v < -STICK_DEAD ? -1 : 0);
  return [s.buttons, s.leftTrigger > TRIGGER_DEAD, s.rightTrigger > TRIGGER_DEAD, stick(s.thumbLX), stick(s.thumbLY), stick(s.thumbRX), stick(s.thumbRY)].join();
}

// O menu abre quando o botão Xbox é solto, para dar tempo de saber se ele virou atalho (Xbox + Y, por exemplo).
// onActivity() é chamado sempre que algo muda no controle.
function watchGuideButton(onPress, onCombo = () => {}, onActivity = () => {}) {
  const getState = loadXInput();
  if (!getState) return () => {};
  const connected = new Array(SLOTS).fill(false);
  const held = new Array(SLOTS).fill(false);
  const comboUsed = new Array(SLOTS).fill(false);
  const prevButtons = new Array(SLOTS).fill(0);
  const prevInput = new Array(SLOTS).fill('');
  let lastScan = 0;

  const timer = setInterval(() => {
    const now = Date.now();
    const rescan = now - lastScan > RESCAN_MS;
    if (rescan) lastScan = now;
    for (let slot = 0; slot < SLOTS; slot++) {
      if (!connected[slot] && !rescan) continue;
      const state = getState(slot);
      connected[slot] = !!state;
      const buttons = state ? state.buttons : 0;
      const key = inputKey(state);
      if (key !== prevInput[slot]) {
        if (prevInput[slot] && key) onActivity();
        prevInput[slot] = key;
      }
      const down = (buttons & GUIDE) !== 0;
      if (down) {
        if (!held[slot]) comboUsed[slot] = false;
        for (const [name, mask] of Object.entries(COMBOS)) {
          if ((buttons & mask) && !(prevButtons[slot] & mask)) {
            comboUsed[slot] = true;
            onCombo(name);
          }
        }
      } else if (held[slot] && !comboUsed[slot]) {
        onPress();
      }
      held[slot] = down;
      prevButtons[slot] = buttons;
    }
  }, POLL_MS);
  return () => clearInterval(timer);
}

module.exports = { watchGuideButton };
