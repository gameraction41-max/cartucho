// Cliente da Steam Web API. Documentação: https://developer.valvesoftware.com/wiki/Steam_Web_API
const API = 'https://api.steampowered.com';
const LANG = 'brazilian';

class SteamError extends Error {}

async function call(pathname, params) {
  const url = new URL(API + pathname);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  let res;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  } catch {
    throw new SteamError('Sem conexão com a Steam. Confira sua internet.');
  }
  if (res.status === 401 || res.status === 403) {
    const err = new SteamError('A Steam recusou a chave da API. Confira a chave nas configurações.');
    err.status = res.status;
    throw err;
  }
  if (res.status === 429) throw new SteamError('A Steam pediu para esperar um pouco antes de sincronizar de novo.');
  if (!res.ok) {
    const err = new SteamError(`A Steam respondeu com erro ${res.status}.`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

async function getOwnedGames(key, steamId) {
  const data = await call('/IPlayerService/GetOwnedGames/v1/', {
    key,
    steamid: steamId,
    include_appinfo: 1,
    include_played_free_games: 1,
    format: 'json',
  });
  const games = data.response && data.response.games;
  if (!games) {
    throw new SteamError('Não foi possível ler seus jogos. Deixe o perfil e os detalhes de jogo públicos na Steam (Privacidade do perfil).');
  }
  return games.map((g) => ({
    appid: g.appid,
    name: g.name,
    minutes: g.playtime_forever || 0,
    minutes2w: g.playtime_2weeks || 0,
    lastPlayed: (g.rtime_last_played || 0) * 1000,
    hasStats: !!g.has_community_visible_stats,
  }));
}

async function getPlayerSummary(key, steamId) {
  const data = await call('/ISteamUser/GetPlayerSummaries/v2/', { key, steamids: steamId });
  const p = data.response && data.response.players && data.response.players[0];
  if (!p) return null;
  return { name: p.personaname, avatar: p.avatarfull || p.avatarmedium || '', since: (p.timecreated || 0) * 1000 };
}

// Nível da conta na Steam (o das insígnias). Vem null quando o perfil é privado.
async function getSteamLevel(key, steamId) {
  const data = await call('/IPlayerService/GetSteamLevel/v1/', { key, steamid: steamId });
  const level = data.response && data.response.player_level;
  return Number.isFinite(level) ? level : null;
}

const PERSONA = { 0: 'offline', 1: 'online', 2: 'busy', 3: 'away', 4: 'away', 5: 'online', 6: 'online' };

// Amigos com status e o jogo que estão jogando. Precisa da lista de amigos pública no perfil da Steam.
async function getFriends(key, steamId) {
  let data;
  try {
    data = await call('/ISteamUser/GetFriendList/v1/', { key, steamid: steamId, relationship: 'friend' });
  } catch (err) {
    // Com a chave certa, um 401 aqui quer dizer que a lista de amigos não é pública.
    if (err.status === 401) {
      throw new SteamError('Sua lista de amigos está privada. Em Perfil > Editar perfil > Privacidade, deixe "Lista de amigos" como Pública.');
    }
    throw err;
  }
  const ids = ((data.friendslist && data.friendslist.friends) || []).map((f) => f.steamid);
  const out = [];
  // A Steam aceita até 100 perfis por chamada.
  for (let i = 0; i < ids.length; i += 100) {
    const res = await call('/ISteamUser/GetPlayerSummaries/v2/', { key, steamids: ids.slice(i, i + 100).join(',') });
    for (const p of (res.response && res.response.players) || []) {
      out.push({
        steamId: p.steamid,
        name: p.personaname,
        avatar: p.avatarfull || p.avatarmedium || '',
        status: p.gameid ? 'playing' : PERSONA[p.personastate] || 'offline',
        appid: p.gameid ? Number(p.gameid) : null,
        game: p.gameextrainfo || '',
        lastOnline: (p.lastlogoff || 0) * 1000,
      });
    }
  }
  return out;
}

// Retorna null quando o jogo não tem conquistas (a Steam responde 400 nesse caso).
async function getPlayerAchievements(key, steamId, appid) {
  try {
    const data = await call('/ISteamUserStats/GetPlayerAchievements/v1/', { key, steamid: steamId, appid, l: LANG });
    const stats = data.playerstats || {};
    // Perfil privado pode vir com status 200 e success: false. Sem isso, o jogo pareceria não ter conquistas.
    if (stats.success === false && stats.error && !/no stats/i.test(stats.error)) {
      throw new SteamError(stats.error);
    }
    const list = stats.achievements;
    if (!list) return null;
    return list.map((a) => ({
      api: a.apiname,
      achieved: a.achieved === 1,
      unlocktime: (a.unlocktime || 0) * 1000,
      name: a.name || a.apiname,
      description: a.description || '',
    }));
  } catch (err) {
    if (err.status === 400) return null;
    throw err;
  }
}

async function getSchema(key, appid) {
  const data = await call('/ISteamUserStats/GetSchemaForGame/v2/', { key, appid, l: LANG });
  const list = data.game && data.game.availableGameStats && data.game.availableGameStats.achievements;
  return (list || []).map((a) => ({
    api: a.name,
    name: a.displayName,
    description: a.description || '',
    icon: a.icon,
    iconGray: a.icongray,
    hidden: a.hidden === 1,
  }));
}

async function getGlobalPercentages(appid) {
  const data = await call('/ISteamUserStats/GetGlobalAchievementPercentagesForApp/v2/', { gameid: appid });
  const list = (data.achievementpercentages && data.achievementpercentages.achievements) || [];
  const out = {};
  for (const a of list) out[a.name] = Number(a.percent);
  return out;
}

// A Steam tem dois endereços de CDN para a arte; a interface tenta um depois do outro.
function art(appid) {
  const a = `https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/${appid}`;
  const b = `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}`;
  return {
    cover: [`${a}/library_600x900.jpg`, `${b}/library_600x900.jpg`],
    hero: [`${a}/library_hero.jpg`, `${b}/library_hero.jpg`, `${a}/header.jpg`, `${b}/header.jpg`],
  };
}

module.exports = { SteamError, getOwnedGames, getPlayerSummary, getSteamLevel, getFriends, getPlayerAchievements, getSchema, getGlobalPercentages, art };
