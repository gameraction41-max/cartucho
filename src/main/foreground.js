// Traz a janela do Cartucho para a frente de verdade, inclusive por cima de um jogo.
// O Windows bloqueia SetForegroundWindow quando o app não é o que está em uso. O truque conhecido
// (o mesmo de outros launchers) é simular um toque na tecla Alt antes de chamar a função.

const VK_MENU = 0x12;
const KEYEVENTF_KEYUP = 0x0002;
const SW_RESTORE = 9;

let user32 = null;
let loaded = false;

function load() {
  if (loaded) return user32;
  loaded = true;
  if (process.platform !== 'win32') return null;
  try {
    const koffi = require('koffi');
    const lib = koffi.load('user32.dll');
    user32 = {
      keybd_event: lib.func('void __stdcall keybd_event(uint8_t bVk, uint8_t bScan, uint32_t dwFlags, uintptr_t dwExtraInfo)'),
      SetForegroundWindow: lib.func('int __stdcall SetForegroundWindow(intptr_t hWnd)'),
      ShowWindow: lib.func('int __stdcall ShowWindow(intptr_t hWnd, int nCmdShow)'),
    };
  } catch {
    user32 = null;
  }
  return user32;
}

function hwndOf(win) {
  const buf = win.getNativeWindowHandle();
  return buf.length >= 8 ? buf.readBigInt64LE(0) : BigInt(buf.readInt32LE(0));
}

function forceForeground(win) {
  const api = load();
  if (!api) return false;
  try {
    const hwnd = hwndOf(win);
    api.ShowWindow(hwnd, SW_RESTORE);
    api.keybd_event(VK_MENU, 0, 0, 0);
    api.SetForegroundWindow(hwnd);
    api.keybd_event(VK_MENU, 0, KEYEVENTF_KEYUP, 0);
    return true;
  } catch {
    return false;
  }
}

module.exports = { forceForeground };
