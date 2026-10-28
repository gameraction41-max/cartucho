// Descobre quando um jogo abriu e fechou, para contar o tempo e trazer o launcher de volta.
const path = require('node:path');
const { execFile } = require('node:child_process');

const POLL_MS = 4000;
const START_TIMEOUT_MS = 3 * 60 * 1000;

function run(cmd, args) {
  return new Promise((resolve) => {
    execFile(cmd, args, { windowsHide: true, maxBuffer: 8 * 1024 * 1024 }, (err, stdout) => resolve(err ? '' : stdout));
  });
}

// Leitura direta do Windows (koffi), sem abrir o tasklist.exe e o reg.exe a cada volta, o que pesava com o jogo aberto.
// Se algo der errado aqui, o Cartucho volta de vez para o tasklist e o reg, que sempre funcionaram.
let native;
function nativeApi() {
  if (native !== undefined) return native;
  native = null;
  if (process.platform !== 'win32') return native;
  try {
    const koffi = require('koffi');
    const kernel32 = koffi.load('kernel32.dll');
    const advapi32 = koffi.load('advapi32.dll');
    const ENTRY = koffi.struct('PROCESSENTRY32W', {
      dwSize: 'uint32',
      cntUsage: 'uint32',
      th32ProcessID: 'uint32',
      th32DefaultHeapID: 'uintptr',
      th32ModuleID: 'uint32',
      cntThreads: 'uint32',
      th32ParentProcessID: 'uint32',
      pcPriClassBase: 'int32',
      dwFlags: 'uint32',
      szExeFile: koffi.array('char16_t', 260, 'String'),
    });
    native = {
      size: koffi.sizeof(ENTRY),
      snapshot: kernel32.func('intptr __stdcall CreateToolhelp32Snapshot(uint32 flags, uint32 pid)'),
      first: kernel32.func('int __stdcall Process32FirstW(intptr snap, _Inout_ PROCESSENTRY32W *entry)'),
      next: kernel32.func('int __stdcall Process32NextW(intptr snap, _Inout_ PROCESSENTRY32W *entry)'),
      close: kernel32.func('int __stdcall CloseHandle(intptr handle)'),
      regDword: advapi32.func('long __stdcall RegGetValueW(intptr key, str16 subKey, str16 value, uint32 flags, void *type, _Out_ uint32 *data, _Inout_ uint32 *size)'),
    };
  } catch {
    native = null;
  }
  return native;
}

const TH32CS_SNAPPROCESS = 0x2;
// HKEY_CURRENT_USER é 0x80000001 com sinal (no Windows 64 bits vira 0xFFFFFFFF80000001).
const HKEY_CURRENT_USER = -2147483647;
const RRF_RT_REG_DWORD = 0x10;
const ERROR_FILE_NOT_FOUND = 2;

let nativeProcessesOk = true;
function nativeProcessNames() {
  const api = nativeApi();
  if (!api || !nativeProcessesOk) return null;
  try {
    const snap = api.snapshot(TH32CS_SNAPPROCESS, 0);
    if (snap === -1 || snap === 0) throw new Error('sem snapshot');
    const names = [];
    try {
      const entry = { dwSize: api.size };
      for (let ok = api.first(snap, entry); ok; ok = api.next(snap, entry)) names.push(String(entry.szExeFile).toLowerCase());
    } finally {
      api.close(snap);
    }
    // Conferência: o próprio Cartucho tem que estar na lista. Se não estiver, a leitura direta não é confiável.
    if (!names.includes(path.basename(process.execPath).toLowerCase())) throw new Error('lista incompleta');
    return names;
  } catch {
    nativeProcessesOk = false;
    return null;
  }
}

// Nomes dos processos abertos, em minúsculas (ex.: "hytaleclient.exe").
async function processNames() {
  if (process.platform === 'win32') {
    const names = nativeProcessNames();
    if (names) return names;
    const out = await run('tasklist', ['/FO', 'CSV', '/NH']);
    return out.split(/\r?\n/).map((l) => (l.match(/^"([^"]+)"/) || [])[1]).filter(Boolean).map((n) => n.toLowerCase());
  }
  const out = await run('ps', ['-A', '-o', 'comm=']);
  return out.split('\n').map((l) => l.trim().split('/').pop().toLowerCase()).filter(Boolean);
}

let nativeRegistryOk = true;
function nativeSteamAppId() {
  const api = nativeApi();
  if (!api || !nativeRegistryOk) return undefined;
  try {
    const data = [0];
    const rc = api.regDword(HKEY_CURRENT_USER, 'Software\\Valve\\Steam', 'RunningAppID', RRF_RT_REG_DWORD, null, data, [4]);
    if (rc === 0) return data[0];
    if (rc === ERROR_FILE_NOT_FOUND) return null;
    throw new Error(`RegGetValueW ${rc}`);
  } catch {
    nativeRegistryOk = false;
    return undefined;
  }
}

// Jogo da Steam rodando agora, lido do registro do Windows (0 quando nenhum).
async function steamRunningAppId() {
  if (process.platform !== 'win32') return null;
  const fast = nativeSteamAppId();
  if (fast !== undefined) return fast;
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
