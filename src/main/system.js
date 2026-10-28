// Desligar, reiniciar e suspender o PC pelo menu rápido, informações do hardware e o preset gráfico que combina com ele.
const fs = require('node:fs');
const os = require('node:os');
const { spawn } = require('node:child_process');

const COMMANDS = {
  win32: {
    shutdown: ['shutdown', ['/s', '/t', '0']],
    restart: ['shutdown', ['/r', '/t', '0']],
    // Suspensão de verdade (não hibernação), pelo mesmo caminho que o menu Iniciar usa.
    sleep: ['powershell', ['-NoProfile', '-WindowStyle', 'Hidden', '-Command', 'Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Application]::SetSuspendState([System.Windows.Forms.PowerState]::Suspend, $false, $false)']],
  },
  linux: { shutdown: ['systemctl', ['poweroff']], restart: ['systemctl', ['reboot']], sleep: ['systemctl', ['suspend']] },
  darwin: { shutdown: ['osascript', ['-e', 'tell app "System Events" to shut down']], restart: ['osascript', ['-e', 'tell app "System Events" to restart']] },
};

function power(action) {
  const cmd = (COMMANDS[process.platform] || {})[action];
  if (!cmd) return false;
  spawn(cmd[0], cmd[1], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
  return true;
}

// Placas integradas (a parte de vídeo do processador) aparecem com pouca memória. Abaixo de 2 GB não conta como placa de vídeo dedicada.
const DEDICATED_VRAM_MB = 2048;

// Escolhe o preset gráfico pelo hardware: memória da placa de vídeo, memória do PC e quantidade de threads do processador.
// As margens são um pouco abaixo de 8 e 4 GB porque as placas informam um pouco menos (uma RTX 4060 aparece com 8188 MB).
function recommendPreset({ gpu = [], memTotal = 0, threads = 0 }) {
  const vram = Math.max(0, ...gpu.map((g) => g.vram || 0));
  const ramGb = memTotal / 1024 ** 3;
  const best = gpu.reduce((a, g) => ((g.vram || 0) > (a ? a.vram || 0 : -1) ? g : a), null);
  const what = [best && vram >= DEDICATED_VRAM_MB ? best.model : 'vídeo integrado', `${Math.round(ramGb)} GB de memória`].join(', ');
  if (vram >= 7.5 * 1024 && ramGb >= 15 && threads >= 8) return { id: 'qualidade', reason: what };
  if (vram >= 3.5 * 1024 && ramGb >= 11) return { id: 'equilibrado', reason: what };
  return { id: 'desempenho', reason: what };
}

// O hardware não muda enquanto o app está aberto, então ele é lido uma vez só. Uso e temperatura são lidos a cada pedido.
// A aba PC pede a cada 2 s, por isso nada aqui abre o PowerShell depois da primeira leitura (no Windows, o
// systeminformation abre um PowerShell para a memória, a temperatura e os discos, e cada um pesa no processador).
const DISKS_EVERY_MS = 60000;
const TEMP_EVERY_MS = 10000;

let hardware = null;
let temp = { value: null, at: 0, missing: false };

// Espaço de um disco já conhecido, direto do sistema (sem PowerShell). null quando não dá para ler.
function diskUsage(mount) {
  try {
    const s = fs.statfsSync(process.platform === 'win32' && /^[a-z]:$/i.test(mount) ? `${mount}\\` : mount);
    const size = s.blocks * s.bsize;
    return { mount, size, used: size - s.bfree * s.bsize };
  } catch {
    return null;
  }
}

async function readDisks(si) {
  if (hardware.disks.length && typeof fs.statfsSync === 'function') {
    const list = hardware.disks.map((d) => diskUsage(d.mount));
    if (list.every(Boolean)) return list;
  }
  return si.fsSize().catch(() => hardware.disks);
}

// Muitos PCs (a maioria dos Ryzen, por exemplo) não informam a temperatura ao Windows. Se a primeira leitura vier
// vazia, o Cartucho não pergunta de novo; se vier, lê no máximo a cada 10 s.
async function readTemp(si) {
  if (temp.missing || Date.now() - temp.at < TEMP_EVERY_MS) return temp.value;
  const t = await si.cpuTemperature().catch(() => ({ main: null }));
  temp = { value: t.main || null, at: Date.now(), missing: !t.main };
  return temp.value;
}

async function stats() {
  const si = require('systeminformation');
  if (!hardware) {
    const [cpu, gpu, info, disks] = await Promise.all([si.cpu(), si.graphics().catch(() => ({ controllers: [] })), si.osInfo(), si.fsSize().catch(() => [])]);
    const gpus = gpu.controllers.filter((c) => c.model && !/basic|virtual|microsoft/i.test(c.model));
    hardware = {
      cpu: `${cpu.manufacturer} ${cpu.brand}`.trim(),
      cores: cpu.physicalCores,
      threads: cpu.cores,
      gpu: gpus.map((c) => ({ model: c.model, vram: c.vram || 0 })),
      os: `${info.distro} ${info.release}`.trim(),
      disksAt: Date.now(),
      disks: disks.map((d) => ({ mount: d.mount, used: d.used, size: d.size })),
    };
  }
  const [load, cpuTemp, disks] = await Promise.all([
    si.currentLoad().catch(() => ({ currentLoad: null })),
    readTemp(si),
    Date.now() - hardware.disksAt > DISKS_EVERY_MS ? readDisks(si) : hardware.disks,
  ]);
  if (disks !== hardware.disks) {
    hardware.disks = disks.map((d) => ({ mount: d.mount, used: d.used, size: d.size }));
    hardware.disksAt = Date.now();
  }
  // Memória em uso = total menos a disponível, a mesma conta do Gerenciador de Tarefas (e do systeminformation).
  const memTotal = os.totalmem();
  return {
    cpu: hardware.cpu,
    cores: hardware.cores,
    threads: hardware.threads,
    gpu: hardware.gpu,
    os: hardware.os,
    cpuLoad: load.currentLoad,
    cpuTemp,
    memUsed: memTotal - os.freemem(),
    memTotal,
    disks: hardware.disks.filter((d) => d.size > 0),
  };
}

// Desligar e ligar a tela (modo sofá). A tela desliga como no descanso do Windows e volta com teclado ou mouse.
// O controle não conta como uso para o Windows, então para ligar com ele o Cartucho simula uma tecla que não existe no teclado (F15).
const WM_SYSCOMMAND = 0x0112;
const SC_MONITORPOWER = 0xf170;
const HWND_BROADCAST = 0xffff;
const VK_F15 = 0x7e;
const KEYEVENTF_KEYUP = 0x0002;
let user32 = null;

function loadUser32() {
  if (user32 !== null || process.platform !== 'win32') return user32;
  try {
    const lib = require('koffi').load('user32.dll');
    user32 = {
      PostMessageW: lib.func('int __stdcall PostMessageW(intptr_t hWnd, uint32_t msg, uintptr_t wParam, intptr_t lParam)'),
      keybd_event: lib.func('void __stdcall keybd_event(uint8_t bVk, uint8_t bScan, uint32_t dwFlags, uintptr_t dwExtraInfo)'),
    };
  } catch {
    user32 = false;
  }
  return user32;
}

function screen(on) {
  const api = loadUser32();
  if (!api) return false;
  try {
    if (on) {
      api.keybd_event(VK_F15, 0, 0, 0);
      api.keybd_event(VK_F15, 0, KEYEVENTF_KEYUP, 0);
      api.PostMessageW(HWND_BROADCAST, WM_SYSCOMMAND, SC_MONITORPOWER, -1);
    } else {
      api.PostMessageW(HWND_BROADCAST, WM_SYSCOMMAND, SC_MONITORPOWER, 2);
    }
    return true;
  } catch {
    return false;
  }
}

module.exports = { power, screen, stats, recommendPreset };
