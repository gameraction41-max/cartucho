// Onde o Hytale fica instalado. O jogo não vem da Steam: o launcher oficial se instala sozinho em %APPDATA%\Hytale
// e guarda cada versão numa pasta com a data (install\release\package\launcher\2026.01.13-b6c7e88\hytale-launcher.exe).
const fs = require('node:fs');
const path = require('node:path');

const LAUNCHER_EXE = 'hytale-launcher.exe';
const CLIENT_EXE = 'HytaleClient.exe';

function hytaleRoot(env = process.env) {
  return env.APPDATA ? path.join(env.APPDATA, 'Hytale') : null;
}

// Pastas de versão do launcher, da mais nova para a mais velha (o nome começa pela data, então a ordem alfabética serve).
function versionDirs(dir) {
  try {
    return fs.readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort().reverse();
  } catch {
    return [];
  }
}

// Lugares onde o launcher pode estar, em ordem de preferência.
function launcherCandidates(env = process.env) {
  const list = [];
  const root = hytaleRoot(env);
  if (root) {
    const dir = path.join(root, 'install', 'release', 'package', 'launcher');
    for (const v of versionDirs(dir)) list.push(path.join(dir, v, LAUNCHER_EXE));
    list.push(path.join(dir, LAUNCHER_EXE), path.join(root, LAUNCHER_EXE));
  }
  for (const base of [env.ProgramFiles, env['ProgramFiles(x86)'], env.LOCALAPPDATA && path.join(env.LOCALAPPDATA, 'Programs')]) {
    if (!base) continue;
    list.push(path.join(base, 'Hypixel Studios', 'Hytale Launcher', LAUNCHER_EXE), path.join(base, 'Hytale Launcher', LAUNCHER_EXE), path.join(base, 'Hytale', LAUNCHER_EXE));
  }
  return list;
}

// O executável escolhido pela pessoa vale mais; sem ele, o primeiro launcher que existir.
function findLauncher(configured, { env = process.env, exists = fs.existsSync } = {}) {
  if (configured && exists(configured)) return configured;
  return launcherCandidates(env).find((f) => exists(f)) || null;
}

module.exports = { findLauncher, launcherCandidates, hytaleRoot, LAUNCHER_EXE, CLIENT_EXE };
