// Descobre quando um jogo abriu e fechou, para contar o tempo e trazer o launcher de volta.
const { execFile } = require('node:child_process');

const POLL_MS = 4000;
const START_TIMEOUT_MS = 3 * 60 * 1000;

function run(cmd, args) {
  return new Promise((resolve) => {
    execFile(cmd, args, { windowsHide: true, maxBuffer: 8 * 1024 * 1024 }, (err, stdout) => resolve(err ? '' : stdout));
  });
}

// Nomes dos processos abertos, em minúsculas (ex.: "hytaleclient.exe").
async function processNames() {
  if (process.platform === 'win32') {
    const out = await run('tasklist', ['/FO', 'CSV', '/NH']);
    return out.split(/\r?\n/).map((l) => (l.match(/^"([^"]+)"/) || [])[1]).filter(Boolean).map((n) => n.toLowerCase());
  }
  const out = await run('ps', ['-A', '-o', 'comm=']);
  return out.split('\n').map((l) => l.trim().split('/').pop().toLowerCase()).filter(Boolean);
}

// Jogo da Steam rodando agora, lido do registro do Windows (0 quando nenhum).
async function steamRunningAppId() {
  if (process.platform !== 'win32') return null;
  const out = await run('reg', ['query', 'HKCU\\Software\\Valve\\Steam', '/v', 'RunningAppID']);
  const m = out.match(/RunningAppID\s+REG_DWORD\s+0x([0-9a-f]+)/i);
  return m ? parseInt(m[1], 16) : null;
}

// Fica de olho em isRunning() até o jogo abrir e depois fechar. Chama onEnd(ms jogados).
function watch(isRunning, { onStart, onEnd }) {
  const launchedAt = Date.now();
  let startedAt = null;
  let stopped = false;
  const tick = async () => {
    if (stopped) return;
    const running = await isRunning();
    if (running && !startedAt) {
      startedAt = Date.now();
      if (onStart) onStart();
    } else if (!running && startedAt) {
      stopped = true;
      return onEnd(Date.now() - startedAt);
    } else if (!running && !startedAt && Date.now() - launchedAt > START_TIMEOUT_MS) {
      stopped = true;
      return onEnd(0);
    }
    setTimeout(tick, POLL_MS);
  };
  setTimeout(tick, POLL_MS);
  return () => { stopped = true; };
}

function watchSteam(appid, handlers) {
  if (process.platform !== 'win32') return () => {};
  return watch(async () => (await steamRunningAppId()) === appid, handlers);
}

function watchProcesses(names, handlers) {
  const wanted = names.filter(Boolean).map((n) => n.toLowerCase());
  return watch(async () => {
    const running = await processNames();
    return wanted.some((n) => running.includes(n));
  }, handlers);
}

// Minecraft roda em Java: conta quantos javaw/java existiam antes e espera aparecer um novo.
async function watchJava(handlers) {
  const isJava = (n) => n === 'javaw.exe' || n === 'java.exe' || n === 'java';
  const baseline = (await processNames()).filter(isJava).length;
  return watch(async () => (await processNames()).filter(isJava).length > baseline, handlers);
}

module.exports = { watchSteam, watchProcesses, watchJava };
