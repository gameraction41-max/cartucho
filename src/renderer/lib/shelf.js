// Que jogos aparecem nas listas. As instâncias do Minecraft ficam dentro do jogo "Minecraft" (a página dele lista
// cada uma), e os jogos que a pessoa escondeu só aparecem no filtro Ocultos da Biblioteca.
import { sortRecent } from './ui.js';

// Jogo fora do PC continua no Início por este tempo depois da última vez que foi jogado (desinstalado há pouco).
export const RECENT_UNINSTALL_DAYS = 14;
const DAY = 86400000;

export function hiddenKeys(ctx) {
  return new Set(ctx.state.config.hiddenGames || []);
}

export function isHidden(ctx, g) {
  return hiddenKeys(ctx).has(g.key);
}

// Todos os jogos que entram nas listas, uma vez cada: sem as instâncias soltas do Minecraft e sem os escondidos.
export function shelfGames(ctx, { hidden = false } = {}) {
  const keys = hiddenKeys(ctx);
  return ctx.state.games.filter((g) => !g.instanceId && keys.has(g.key) === hidden);
}

// Início: só o que está no PC, mais o que saiu do PC há pouco, do aberto mais recente para o mais antigo.
export function homeGames(ctx, now = Date.now()) {
  const recent = (g) => g.lastPlayed && now - g.lastPlayed < RECENT_UNINSTALL_DAYS * DAY;
  return sortRecent(shelfGames(ctx).filter((g) => g.installed !== false || g.download || recent(g)));
}

export async function setHidden(ctx, g, hide) {
  const keys = hiddenKeys(ctx);
  if (hide) keys.add(g.key);
  else keys.delete(g.key);
  const cfg = ctx.state.config;
  const next = await ctx.api.setConfig({ hiddenGames: [...keys] });
  await ctx.applyConfig({ ...cfg, hiddenGames: next.hiddenGames });
}

// Instâncias do Minecraft, da jogada mais recente para a mais antiga.
export function instancesOf(ctx, group) {
  const byKey = new Map(ctx.state.games.map((g) => [g.key, g]));
  return (group.instances || []).map((k) => byKey.get(k)).filter(Boolean);
}
