// Contas da tela de perfil: conquistas mais raras e tempo jogado somando todas as fontes.
const RARE_LIMIT = 8;
const RARE_PER_GAME = 2;

// Guarda só uma casa decimal: o cache fica menor e a tela mostra assim mesmo.
function roundPercentages(map) {
  const out = {};
  for (const [api, pct] of Object.entries(map || {})) if (Number.isFinite(pct)) out[api] = Math.round(pct * 10) / 10;
  return out;
}

// As conquistas desbloqueadas que menos gente tem. No máximo duas por jogo, para o destaque não ficar todo de um jogo só.
function rarest(ach, rarity, { limit = RARE_LIMIT, perGame = RARE_PER_GAME } = {}) {
  const all = [];
  for (const [appid, entry] of Object.entries(ach || {})) {
    const pct = rarity[appid] && rarity[appid].pct;
    if (!entry.list || !pct) continue;
    for (const a of entry.list) {
      if (a.achieved && pct[a.api] != null) all.push({ appid: Number(appid), api: a.api, name: a.name, description: a.description, unlocktime: a.unlocktime, percent: pct[a.api] });
    }
  }
  all.sort((a, b) => a.percent - b.percent || b.unlocktime - a.unlocktime);
  const perApp = new Map();
  const out = [];
  for (const a of all) {
    const n = perApp.get(a.appid) || 0;
    if (n >= perGame) continue;
    perApp.set(a.appid, n + 1);
    out.push(a);
    if (out.length >= limit) break;
  }
  return out;
}

// Horas totais, quanto veio de cada fonte e os jogos mais jogados.
function playtime(games, top = 4) {
  const bySource = { steam: 0, prism: 0, hytale: 0 };
  let minutes = 0;
  let played = 0;
  for (const g of games) {
    const m = g.minutes || 0;
    minutes += m;
    if (m > 0) played++;
    bySource[g.source] = (bySource[g.source] || 0) + m;
  }
  const most = [...games].filter((g) => g.minutes > 0).sort((a, b) => b.minutes - a.minutes).slice(0, top)
    .map((g) => ({ key: g.key, title: g.title, source: g.source, minutes: g.minutes }));
  return { minutes, bySource, games: games.length, played, top: most };
}

module.exports = { roundPercentages, rarest, playtime };
