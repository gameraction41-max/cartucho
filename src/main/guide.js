// Botão do Xbox (Guide). O navegador não enxerga esse botão, então lemos direto do driver do controle (XInput),
// pela função escondida XInputGetStateEx (ordinal 100), a mesma que a Steam e outros launchers usam.
// Como funciona fora da janela, o botão também traz o Cartucho de volta quando um jogo está aberto.

const GUIDE = 0x0400;
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

function watchGuideButton(onPress) {
  const getState = loadXInput();
  if (!getState) return () => {};
  const connected = new Array(SLOTS).fill(false);
  const pressed = new Array(SLOTS).fill(false);
  let lastScan = 0;

  const timer = setInterval(() => {
    const now = Date.now();
    const rescan = now - lastScan > RESCAN_MS;
    if (rescan) lastScan = now;
    for (let slot = 0; slot < SLOTS; slot++) {
      if (!connected[slot] && !rescan) continue;
      const state = getState(slot);
      connected[slot] = !!state;
      const down = !!state && (state.buttons & GUIDE) !== 0;
      if (down && !pressed[slot]) onPress();
      pressed[slot] = down;
    }
  }, POLL_MS);
  return () => clearInterval(timer);
}

module.exports = { watchGuideButton };
