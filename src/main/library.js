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
const profileData = require('./profile');
const art = require('./art');
const history = require('./history');
const downloads = require('./downloads');
const gamepresets = require('./gamepresets');
const hytale = require('./hytale');

const ACH_CONCURRENCY = 4;

let cache;
let playtime;
let historyStore;

function stores() {
  if (!cache) {
    const dir = app.getPath('userData');
    cache = new JsonStore(path.join(dir, 'steam-cache.json'), { owned: [], syncedAt: 0, profile: null, ach: {}, schema: {}, rarity: {} });
    playtime = new JsonStore(path.join(dir, 'playtime.json'), { hytale: { seconds: 0, lastPlayed: 0 } });
    historyStore = new JsonStore(path.join(dir, 'history.json'), { snapshot: {}, days: {} });
  }
  return { cache, playtime, history: historyStore };
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
    ...downloads.info(g.appid),
    presets: gamepresets.supported(g.appid),
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

// Sem executável escolhido, o Cartucho procura o launcher oficial do Hytale nas pastas padrão (hytale.js).
function hytaleExe() {
  return hytale.findLauncher(config.get('hytaleExe'));
}

function hytaleGame() {
  const exe = hytaleExe();
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

// Jogos adicionados pela pessoa (customgames.js). O tempo fica em playtime.json, em custom:<id>.
function customGames() {
  const times = stores().playtime;
  return (config.get('customGames') || []).map((c) => {
    const t = times.get(`custom:${c.id}`) || { seconds: 0, lastPlayed: 0 };
    return {
      key: `custom:${c.id}`,
      source: 'custom',
      customId: c.id,
      title: c.title,
      exe: c.exe,
      minutes: Math.round(t.seconds / 60),
      lastPlayed: t.lastPlayed || 0,
      addedAt: c.addedAt,
      installed: fs.existsSync(c.exe),
      art: null,
    };
  });
}

// Todas as instâncias do Prism viram um jogo só, "Minecraft", no Início e na Biblioteca. As instâncias continuam
// na lista (com instanceId), para o tempo da semana, os presets e a página do Minecraft, que mostra uma por uma.
function minecraftGroup(games) {
  const list = games.filter((g) => g.source === 'prism').sort((a, b) => (b.lastPlayed || 0) - (a.lastPlayed || 0));
  if (!list.length) return null;
  return {
    key: 'minecraft',
    source: 'minecraft',
    title: 'Minecraft',
    group: true,
    instances: list.map((g) => g.key),
    minutes: list.reduce((s, g) => s + (g.minutes || 0), 0),
    lastPlayed: Math.max(0, ...list.map((g) => g.lastPlayed || 0)),
    mods: list.reduce((s, g) => s + (g.mods || 0), 0),
    installed: true,
    art: null,
  };
}

function getLibrary() {
  const { cache } = stores();
  const games = [...steamGames(), ...prismGames(), ...hytaleGame(), ...customGames()].map(art.apply);
  // Toda vez que a biblioteca é montada, os totais novos viram tempo jogado no dia (history.js).
  // O grupo do Minecraft entra depois, para o tempo das instâncias não contar duas vezes.
  if (history.record(historyStore.data, games)) historyStore.save();
  const mc = minecraftGroup(games);
  if (mc) games.push(art.apply(mc));
  return {
    games,
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
  const [owned, summary, steamLevel] = await Promise.all([
    steam.getOwnedGames(creds.key, creds.steamId),
    steam.getPlayerSummary(creds.key, creds.steamId).catch(() => null),
    steam.getSteamLevel(creds.key, creds.steamId).catch(() => null),
  ]);
  const before = cache.get('profile') || {};
  const profile = summary ? { ...summary, steamLevel: steamLevel ?? before.steamLevel ?? null } : cache.get('profile');
  const previous = new Map(cache.get('owned').map((g) => [g.appid, g]));
  for (const g of owned) {
    const before = previous.get(g.appid);
    g.changed = !before || before.minutes !== g.minutes;
  }
  cache.patch({ owned, profile, syncedAt: Date.now() });
  return getLibrary();
}

// Busca conquistas só dos jogos que mudaram desde a última vez, para não fazer centenas de chamadas.
// Na primeira vez podem ser centenas de jogos, então o progresso é salvo aos poucos: fechar o app no meio não perde o que já veio.
const SAVE_EVERY = 10;
let achStatus = { running: false, done: 0, total: 0, failed: 0, error: null };

async function syncAchievements({ force = false, onProgress = () => {} } = {}) {
  const creds = steamCreds();
  if (!creds || achStatus.running) return [];
  const { cache } = stores();
  const ach = cache.get('ach');
  const unlocked = [];
  // Jogo guardado "sem conquistas" é conferido de novo uma vez por dia, porque a resposta pode ter vindo de um perfil privado.
  const stale = (e) => !e || (!e.list && Date.now() - (e.fetchedAt || 0) > 24 * 3600 * 1000);
  const queue = cache.get('owned').filter((g) => g.hasStats && g.minutes > 0 && (force || g.changed || g.minutes2w > 0 || stale(ach[g.appid])));
  achStatus = { running: true, done: 0, total: queue.length, failed: 0, error: null };
  const worker = async () => {
    while (queue.length) {
      const g = queue.shift();
      try {
        const list = await steam.getPlayerAchievements(creds.key, creds.steamId, g.appid);
        unlocked.push(...newUnlocks(g.appid, ach[g.appid], list));
        ach[g.appid] = { list, fetchedAt: Date.now() };
      } catch (err) {
        // Um jogo com erro não impede os outros; tenta de novo na próxima sincronização.
        achStatus.failed++;
        achStatus.error = err.status === 401 || err.status === 403
          ? 'A Steam não liberou suas conquistas. Em Perfil > Editar perfil > Privacidade, deixe "Detalhes de jogo" como Público.'
          : err.message;
      }
      achStatus.done++;
      if (achStatus.done % SAVE_EVERY === 0) {
        cache.set('ach', ach);
        onProgress();
      }
    }
  };
  try {
    await Promise.all(Array.from({ length: ACH_CONCURRENCY }, worker));
  } finally {
    cache.set('ach', ach);
    achStatus.running = false;
  }
  return describeUnlocks(unlocked);
}

function achievementStatus() {
  return achStatus;
}

// Conquistas que estavam bloqueadas na última leitura e agora estão desbloqueadas.
// Na primeira leitura de um jogo não há com o que comparar, então nada conta como novo.
function newUnlocks(appid, before, list) {
  if (!before || !before.list) return [];
  const had = new Set(before.list.filter((a) => a.achieved).map((a) => a.api));
  return list.filter((a) => a.achieved && !had.has(a.api)).map((a) => ({ appid, api: a.api, name: a.name, unlocktime: a.unlocktime }));
}

// Completa as conquistas novas com nome traduzido e ícone (do schema, que fica em cache) para o aviso na tela.
async function describeUnlocks(list) {
  if (!list.length) return [];
  const creds = steamCreds();
  const { cache } = stores();
  const schemas = cache.get('schema');
  const names = new Map(cache.get('owned').map((g) => [g.appid, g.name]));
  for (const appid of new Set(list.map((a) => a.appid))) {
    if (schemas[appid] || !creds) continue;
    try {
      schemas[appid] = await steam.getSchema(creds.key, appid);
    } catch {}
  }
  cache.set('schema', schemas);
  return list
    .sort((a, b) => a.unlocktime - b.unlocktime)
    .map((a) => {
      const s = (schemas[a.appid] || []).find((x) => x.api === a.api) || {};
      return { appid: a.appid, game: names.get(a.appid) || String(a.appid), name: s.name || a.name || a.api, description: s.description || '', icon: s.icon || '' };
    });
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
  return { unlocked, total, perfect, month, latest, games, status: achStatus, ...computeLevel(unlocked, perfect) };
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
  if (!creds) return [];
  await syncSteam().catch(() => {});
  const { cache } = stores();
  const ach = cache.get('ach');
  try {
    const list = await steam.getPlayerAchievements(creds.key, creds.steamId, appid);
    const unlocked = newUnlocks(appid, ach[appid], list);
    ach[appid] = { list, fetchedAt: Date.now() };
    cache.set('ach', ach);
    return describeUnlocks(unlocked);
  } catch {
    return [];
  }
}

// Raridade das conquistas (porcentagem de jogadores que têm cada uma), para a tela de perfil.
// Só entra quem tem alguma conquista desbloqueada. A porcentagem muda devagar, então é lida de novo uma vez por semana.
const RARITY_TTL = 7 * 24 * 3600 * 1000;
const RETRY_AFTER = 24 * 3600 * 1000;
let rarityStatus = { running: false, done: 0, total: 0 };

async function syncRarity({ onProgress = () => {} } = {}) {
  if (!steamCreds() || rarityStatus.running) return;
  const { cache } = stores();
  const ach = cache.get('ach');
  const rarity = cache.get('rarity') || {};
  const queue = Object.entries(ach)
    .filter(([appid, e]) => e.list && e.list.some((a) => a.achieved) && !(rarity[appid] && Date.now() - rarity[appid].fetchedAt < RARITY_TTL))
    .map(([appid]) => appid);
  if (!queue.length) return;
  rarityStatus = { running: true, done: 0, total: queue.length };
  const worker = async () => {
    while (queue.length) {
      const appid = queue.shift();
      try {
        rarity[appid] = { pct: profileData.roundPercentages(await steam.getGlobalPercentages(appid)), fetchedAt: Date.now() };
      } catch {
        // Sem a porcentagem, tenta de novo no dia seguinte; senão cada abertura do perfil buscaria tudo outra vez.
        rarity[appid] = { pct: (rarity[appid] && rarity[appid].pct) || null, fetchedAt: Date.now() - RARITY_TTL + RETRY_AFTER };
      }
      rarityStatus.done++;
      if (rarityStatus.done % SAVE_EVERY === 0) {
        cache.set('rarity', rarity);
        onProgress();
      }
    }
  };
  try {
    await Promise.all(Array.from({ length: ACH_CONCURRENCY }, worker));
  } finally {
    cache.set('rarity', rarity);
    rarityStatus.running = false;
  }
  await rareIcons();
  onProgress();
}

// Ícones das conquistas em destaque vêm do schema de cada jogo, buscado só para os jogos que aparecem no perfil.
async function rareIcons() {
  const creds = steamCreds();
  const { cache } = stores();
  const schemas = cache.get('schema');
  const rare = profileData.rarest(cache.get('ach'), cache.get('rarity') || {});
  let changed = false;
  for (const appid of new Set(rare.map((a) => a.appid))) {
    if (schemas[appid] || !creds) continue;
    try {
      schemas[appid] = await steam.getSchema(creds.key, appid);
      changed = true;
    } catch {}
  }
  if (changed) cache.set('schema', schemas);
}

function profile() {
  const { cache } = stores();
  const lib = getLibrary();
  const schemas = cache.get('schema');
  const names = new Map(cache.get('owned').map((g) => [String(g.appid), g.name]));
  const rare = profileData.rarest(cache.get('ach'), cache.get('rarity') || {}).map((a) => {
    const s = (schemas[a.appid] || []).find((x) => x.api === a.api) || {};
    return { ...a, key: `steam:${a.appid}`, game: names.get(String(a.appid)) || String(a.appid), name: s.name || a.name, description: s.description || a.description, icon: s.icon || '' };
  });
  return {
    player: lib.profile,
    steamConfigured: lib.steamConfigured,
    summary: achievementSummary(),
    playtime: profileData.playtime(lib.games.filter((g) => !g.group)),
    rare,
    rarityStatus,
  };
}

// Amigos mudam de status o tempo todo, então a lista fica guardada só por um minuto.
const FRIENDS_TTL = 60 * 1000;
let friendsCache = null;

async function friends() {
  const creds = steamCreds();
  if (!creds) return { configured: false, friends: [] };
  if (friendsCache && Date.now() - friendsCache.at < FRIENDS_TTL) return friendsCache.data;
  try {
    const data = { configured: true, friends: await steam.getFriends(creds.key, creds.steamId) };
    friendsCache = { at: Date.now(), data };
    return data;
  } catch (err) {
    return { configured: true, friends: friendsCache ? friendsCache.data.friends : [], error: err.message };
  }
}

// Nomes dos jogos da Steam, para a lista de downloads mostrar o nome certo mesmo antes do manifest ter um.
function steamNames() {
  return new Map(stores().cache.get('owned').map((g) => [g.appid, g.name]));
}

function playWeek() {
  const { history: store } = stores();
  return history.week(store.data);
}

function addCustomTime(id, ms) {
  const { playtime } = stores();
  const key = `custom:${id}`;
  const t = playtime.get(key) || { seconds: 0, lastPlayed: 0 };
  playtime.set(key, { seconds: t.seconds + Math.round(ms / 1000), lastPlayed: Date.now() });
}

function addHytaleTime(ms) {
  const { playtime } = stores();
  const t = playtime.get('hytale');
  playtime.set('hytale', { seconds: t.seconds + Math.round(ms / 1000), lastPlayed: Date.now() });
}

module.exports = { profile, syncRarity, steamNames, playWeek, friends, newUnlocks, getLibrary, syncSteam, syncAchievements, achievementSummary, gameAchievements, refreshSteamGame, addHytaleTime, addCustomTime, hytaleExe, prismDir, minecraftGroup };
