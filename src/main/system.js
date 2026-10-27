// Desligar e reiniciar o PC pelo menu rápido, informações do hardware e plano de energia do Windows.
const { spawn, execFile } = require('node:child_process');

const COMMANDS = {
  win32: { shutdown: ['shutdown', ['/s', '/t', '0']], restart: ['shutdown', ['/r', '/t', '0']] },
  linux: { shutdown: ['systemctl', ['poweroff']], restart: ['systemctl', ['reboot']] },
  darwin: { shutdown: ['osascript', ['-e', 'tell app "System Events" to shut down']], restart: ['osascript', ['-e', 'tell app "System Events" to restart']] },
};

function power(action) {
  const cmd = (COMMANDS[process.platform] || {})[action];
  if (!cmd) return false;
  spawn(cmd[0], cmd[1], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
  return true;
}

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { windowsHide: true, timeout: 8000 }, (err, stdout) => (err ? reject(err) : resolve(stdout)));
  });
}

// Saída do "powercfg /list". O texto muda com o idioma do Windows, então só confiamos no GUID, no nome entre parênteses e no * do plano ativo.
function parsePowerPlans(text) {
  const plans = [];
  for (const line of String(text).split(/\r?\n/)) {
    const m = line.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\s*\((.+)\)\s*(\*)?\s*$/i);
    if (m) plans.push({ guid: m[1].toLowerCase(), name: m[2].trim(), active: !!m[3] });
  }
  return plans;
}

async function powerPlans() {
  if (process.platform !== 'win32') return [];
  try {
    return parsePowerPlans(await run('powercfg', ['/list']));
  } catch {
    return [];
  }
}

async function setPowerPlan(guid) {
  if (process.platform !== 'win32' || !/^[0-9a-f-]{36}$/i.test(guid)) return false;
  await run('powercfg', ['/setactive', guid]);
  return true;
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

module.exports = { power, stats, powerPlans, setPowerPlan, parsePowerPlans };
