// Desligar, reiniciar e suspender o PC pelo menu rápido, informações do hardware e o preset gráfico que combina com ele.
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
let hardware = null;

async function stats() {
  const si = require('systeminformation');
  if (!hardware) {
    const [cpu, gpu, os, disks] = await Promise.all([si.cpu(), si.graphics().catch(() => ({ controllers: [] })), si.osInfo(), si.fsSize().catch(() => [])]);
    const gpus = gpu.controllers.filter((c) => c.model && !/basic|virtual|microsoft/i.test(c.model));
    hardware = {
      cpu: `${cpu.manufacturer} ${cpu.brand}`.trim(),
      cores: cpu.physicalCores,
      threads: cpu.cores,
      gpu: gpus.map((c) => ({ model: c.model, vram: c.vram || 0 })),
      os: `${os.distro} ${os.release}`.trim(),
      disksAt: Date.now(),
      disks,
    };
  }
  const [load, mem, temp, disks] = await Promise.all([
    si.currentLoad().catch(() => ({ currentLoad: null })),
    si.mem(),
    si.cpuTemperature().catch(() => ({ main: null })),
    Date.now() - hardware.disksAt > 60000 ? si.fsSize().catch(() => hardware.disks) : hardware.disks,
  ]);
  hardware.disks = disks;
  hardware.disksAt = Date.now();
  return {
    cpu: hardware.cpu,
    cores: hardware.cores,
    threads: hardware.threads,
    gpu: hardware.gpu,
    os: hardware.os,
    cpuLoad: load.currentLoad,
    cpuTemp: temp.main || null,
    memUsed: mem.active,
    memTotal: mem.total,
    disks: disks.filter((d) => d.size > 0).map((d) => ({ mount: d.mount, used: d.used, size: d.size })),
  };
}

module.exports = { power, stats, recommendPreset };
