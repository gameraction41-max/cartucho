// Leitura das instâncias do Prism Launcher direto da pasta dele, sem precisar abrir o Prism.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');

const LOADERS = {
  'net.fabricmc.fabric-loader': 'Fabric',
  'org.quiltmc.quilt-loader': 'Quilt',
  'net.minecraftforge': 'Forge',
  'net.neoforged': 'NeoForge',
  'com.mumfrey.liteloader': 'LiteLoader',
};

function defaultPrismDir() {
  if (process.platform === 'win32') return path.join(process.env.APPDATA || '', 'PrismLauncher');
  if (process.platform === 'darwin') return path.join(os.homedir(), 'Library', 'Application Support', 'PrismLauncher');
  return path.join(os.homedir(), '.local', 'share', 'PrismLauncher');
}

// instance.cfg e prismlauncher.cfg são INI simples (chave=valor).
function parseIni(text) {
  const out = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#') || line.startsWith(';') || line.startsWith('[')) continue;
    const i = line.indexOf('=');
    if (i < 0) continue;
    let value = line.slice(i + 1).trim();
    if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    out[line.slice(0, i).trim()] = value;
  }
  return out;
}

function parseMmcPack(json) {
  const components = (json && json.components) || [];
  let mcVersion = '';
  let loader = 'Vanilla';
  for (const c of components) {
    if (c.uid === 'net.minecraft') mcVersion = c.version || c.cachedVersion || '';
    else if (LOADERS[c.uid]) loader = LOADERS[c.uid];
  }
  return { mcVersion, loader };
}

function readText(file) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return null;
  }
}

function instancesDir(prismDir) {
  const cfg = readText(path.join(prismDir, 'prismlauncher.cfg'));
  const dir = (cfg && parseIni(cfg).InstanceDir) || 'instances';
  return path.isAbsolute(dir) ? dir : path.join(prismDir, dir);
}

function countMods(instDir) {
  for (const sub of ['minecraft', '.minecraft']) {
    try {
      return fs.readdirSync(path.join(instDir, sub, 'mods')).filter((f) => f.endsWith('.jar')).length;
    } catch {}
  }
  return 0;
}

function iconFile(prismDir, iconKey) {
  if (!iconKey) return null;
  for (const ext of ['.png', '.jpg', '.jpeg', '.webp']) {
    const file = path.join(prismDir, 'icons', iconKey + ext);
    if (fs.existsSync(file)) return file;
  }
  return null;
}

function listInstances(prismDir) {
  const dir = instancesDir(prismDir);
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const out = [];
  for (const e of entries) {
    if (!e.isDirectory() || e.name.startsWith('.') || e.name === '_LAUNCHER_TEMP') continue;
    const instDir = path.join(dir, e.name);
    const cfgText = readText(path.join(instDir, 'instance.cfg'));
    if (!cfgText) continue;
    const cfg = parseIni(cfgText);
    let pack = { mcVersion: '', loader: 'Vanilla' };
    const packText = readText(path.join(instDir, 'mmc-pack.json'));
    if (packText) {
      try {
        pack = parseMmcPack(JSON.parse(packText));
      } catch {}
    }
    out.push({
      id: e.name,
      name: cfg.name || e.name,
      seconds: Number(cfg.totalTimePlayed) || 0,
      lastPlayed: Number(cfg.lastLaunchTime) || 0,
      mcVersion: pack.mcVersion,
      loader: pack.loader,
      mods: countMods(instDir),
      icon: iconFile(prismDir, cfg.iconKey),
      dir: instDir,
    });
  }
  return out;
}

function findExe(prismDir, configured) {
  const candidates = [configured];
  if (process.platform === 'win32') {
    candidates.push(
      path.join(prismDir, 'prismlauncher.exe'),
      path.join(process.env.LOCALAPPDATA || '', 'Programs', 'PrismLauncher', 'prismlauncher.exe'),
      path.join(process.env.ProgramFiles || 'C:\\Program Files', 'PrismLauncher', 'prismlauncher.exe'),
    );
  } else {
    candidates.push('/usr/bin/prismlauncher', '/usr/local/bin/prismlauncher', '/Applications/PrismLauncher.app/Contents/MacOS/prismlauncher');
  }
  return candidates.find((c) => c && fs.existsSync(c)) || null;
}

function launch(exe, args) {
  const child = spawn(exe, args, { detached: true, stdio: 'ignore' });
  child.unref();
}

function launchInstance(exe, instanceId) {
  launch(exe, ['--launch', instanceId]);
}

module.exports = { defaultPrismDir, parseIni, parseMmcPack, listInstances, findExe, launch, launchInstance };
