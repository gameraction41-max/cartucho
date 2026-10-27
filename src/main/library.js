// Junta Steam, instâncias do Prism e Hytale numa biblioteca só, com cache em disco para abrir rápido e funcionar offline.
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');
const { app } = require('electron');
const { JsonStore } = require('./store');
const config = require('./config');
const steam = require('./steam');
const prism = require('./prism');
const { computeLevel } = require('./level');

const ACH_CONCURRENCY = 4;

let cache;
let playtime;

function stores() {
  if (!cache) {
    const dir = app.getPath('userData');
    cache = new JsonStore(path.join(dir, 'steam-cache.json'), { owned: [], syncedAt: 0, profile: null, ach: {}, schema: {} });
    playtime = new JsonStore(path.join(dir, 'playtime.json'), { hytale: { seconds: 0, lastPlayed: 0 } });
  }
  return { cache, playtime };
}

function steamCreds() {
  const key = config.getSteamApiKey();
  const steamId = config.get('steamId');
  return key && steamId ? { key, steamId } : null;
}

function prismDir() {
  return config.get('prismDir') || prism.defaultPrismDir();
}

function achCounts(appid) {
  const entry = stores().cache.get('ach')[appid];
  if (!entry || !entry.list) return null;
  return { unlocked: entry.list.filter((a) => a.achieved).length, total: entry.list.length };
}

function steamGames() {
  return stores().cache.get('owned').map((g) => ({
    key: `steam:${g.appid}`,
    source: 'steam',
    appid: g.appid,
    title: g.name,
    minutes: g.minutes,
    minutes2w: g.minutes2w,
    lastPlayed: g.lastPlayed,
    art: steam.art(g.appid),
    ach: achCounts(g.appid),
  }));
}

function prismGames() {
  return prism.listInstances(prismDir()).map((i) => ({
    key: `prism:${i.id}`,
    source: 'prism',
    instanceId: i.id,
    title: i.name,
    minutes: Math.round(i.seconds / 60),
    lastPlayed: i.lastPlayed,
    mcVersion: i.mcVersion,
    loader: i.loader,
    mods: i.mods,
    art: i.icon ? { cover: [pathToFileURL(i.icon).href], hero: [] } : null,
  }));
}

function hytaleGame() {
  const exe = config.get('hytaleExe');
  if (!exe) return [];
  const t = stores().playtime.get('hytale');
  return [{
    key: 'hytale',
    source: 'hytale',
    title: 'Hytale',
    minutes: Math.round(t.seconds / 60),
    lastPlayed: t.lastPlayed,
    installed: fs.existsSync(exe),
    art: null,
  }];
}

function getLibrary() {
  const { cache } = stores();
  return {
    games: [...steamGames(), ...prismGames(), ...hytaleGame()],
    profile: cache.get('profile'),
    syncedAt: cache.get('syncedAt'),
    steamConfigured: !!steamCreds(),
  };
}

// Atualiza a lista de jogos da Steam. As conquistas vêm depois, em segundo plano (syncAchievements).
async function syncSteam() {
  const creds = steamCreds();
  if (!creds) return getLibrary();
  const { cache } = stores();
  const [owned, profile] = await Promise.all([
    steam.getOwnedGames(creds.key, creds.steamId),
    steam.getPlayerSummary(creds.key, creds.steamId).catch(() => cache.get('profile')),
  ]);
  const previous = new Map(cache.get('owned').map((g) => [g.appid, g]));
  for (const g of owned) {
    const before = previous.get(g.appid);
    g.changed = !before || before.minutes !== g.minutes;
  }
  cache.patch({ owned, profile, syncedAt: Date.now() });
  return getLibrary();
}

// Busca conquistas só dos jogos que mudaram desde a última vez, para não fazer centenas de chamadas.
async function syncAchievements({ force = false } = {}) {
  const creds = steamCreds();
  if (!creds) return;
  const { cache } = stores();
  const ach = cache.get('ach');
  const queue = cache.get('owned').filter((g) => g.hasStats && g.minutes > 0 && (force || g.changed || g.minutes2w > 0 || !ach[g.appid]));
  const worker = async () => {
    while (queue.length) {
      const g = queue.shift();
      try {
        const list = await steam.getPlayerAchievements(creds.key, creds.steamId, g.appid);
        ach[g.appid] = { list, fetchedAt: Date.now() };
      } catch {
        // Um jogo com erro não impede os outros; tenta de novo na próxima sincronização.
      }
    }
  };
  await Promise.all(Array.from({ length: ACH_CONCURRENCY }, worker));
  cache.set('ach', ach);
}

function achievementSummary() {
  const { cache } = stores();
  const ach = cache.get('ach');
  const names = new Map(cache.get('owned').map((g) => [String(g.appid), g.name]));
  const monthAgo = Date.now() - 30 * 24 * 3600 * 1000;
  let unlocked = 0;
  let total = 0;
  let perfect = 0;
  let month = 0;
  let latest = null;
  const games = [];
  for (const [appid, entry] of Object.entries(ach)) {
    if (!entry.list || !entry.list.length) continue;
    const got = entry.list.filter((a) => a.achieved);
    unlocked += got.length;
    total += entry.list.length;
    if (got.length === entry.list.length) perfect++;
    for (const a of got) {
      if (a.unlocktime > monthAgo) month++;
      if (!latest || a.unlocktime > latest.unlocktime) latest = { ...a, game: names.get(appid) || appid };
    }
    games.push({ key: `steam:${appid}`, appid: Number(appid), title: names.get(appid) || appid, unlocked: got.length, total: entry.list.length });
  }
  return { unlocked, total, perfect, month, latest, games, ...computeLevel(unlocked, perfect) };
}

// Detalhes de um jogo: nomes, ícones e raridade de cada conquista.
async function gameAchievements(appid) {
  const creds = steamCreds();
  const { cache } = stores();
  const entry = cache.get('ach')[appid];
  if (!creds || !entry || !entry.list) return null;
  const schemas = cache.get('schema');
  if (!schemas[appid]) {
    try {
      schemas[appid] = await steam.getSchema(creds.key, appid);
      cache.set('schema', schemas);
    } catch {
      schemas[appid] = [];
    }
  }
  const pct = await steam.getGlobalPercentages(appid).catch(() => ({}));
  const byApi = new Map(schemas[appid].map((s) => [s.api, s]));
  return entry.list.map((a) => {
    const s = byApi.get(a.api) || {};
    return { ...a, name: s.name || a.name, description: s.description || a.description, icon: a.achieved ? s.icon : s.iconGray, hidden: !!s.hidden, percent: pct[a.api] ?? null };
  });
}

// Atualiza um jogo da Steam depois que ele fecha, para as horas e conquistas novas aparecerem na hora.
async function refreshSteamGame(appid) {
  const creds = steamCreds();
  if (!creds) return;
  await syncSteam().catch(() => {});
  const { cache } = stores();
  const ach = cache.get('ach');
  try {
    ach[appid] = { list: await steam.getPlayerAchievements(creds.key, creds.steamId, appid), fetchedAt: Date.now() };
    cache.set('ach', ach);
  } catch {}
}

function addHytaleTime(ms) {
  const { playtime } = stores();
  const t = playtime.get('hytale');
  playtime.set('hytale', { seconds: t.seconds + Math.round(ms / 1000), lastPlayed: Date.now() });
}

module.exports = { getLibrary, syncSteam, syncAchievements, achievementSummary, gameAchievements, refreshSteamGame, addHytaleTime, prismDir };
