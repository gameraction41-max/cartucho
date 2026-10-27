// Nível de jogador do Cartucho: 10 pontos por conquista, 100 extras por jogo 100%, 250 pontos por nível.
const XP_PER_ACHIEVEMENT = 10;
const XP_PER_PERFECT_GAME = 100;
const XP_PER_LEVEL = 250;

function computeLevel(unlocked, perfect) {
  const xp = unlocked * XP_PER_ACHIEVEMENT + perfect * XP_PER_PERFECT_GAME;
  return { level: Math.floor(xp / XP_PER_LEVEL) + 1, progress: (xp % XP_PER_LEVEL) / XP_PER_LEVEL, xp };
}

module.exports = { computeLevel };
