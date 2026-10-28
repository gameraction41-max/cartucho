// Dados de exemplo para abrir a interface no navegador, sem Electron (útil para mexer no visual).
const day = 86400000;
const now = Date.now();
const steamArt = (appid) => ({
  cover: [`https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/${appid}/library_600x900.jpg`],
  hero: [`https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/${appid}/library_hero.jpg`],
});

const games = [
  { key: 'steam:1145350', source: 'steam', appid: 1145350, title: 'Hades II', minutes: 3744, lastPlayed: now - day, ach: { unlocked: 31, total: 49 } },
  { key: 'prism:FO', source: 'prism', instanceId: 'FO', title: 'Fabulously Optimized', minutes: 2290, lastPlayed: now - 3600000, mcVersion: '1.21.1', loader: 'Fabric', mods: 94, art: null, music: 'C:\\Users\\Filipi\\Music\\sweden.mp3', musicName: 'Sweden - C418' },
  { key: 'hytale', source: 'hytale', title: 'Hytale', minutes: 720, lastPlayed: now - 5 * day, installed: true, art: null },
  { key: 'steam:1245620', source: 'steam', appid: 1245620, title: 'ELDEN RING', minutes: 8592, lastPlayed: now - 3 * day, ach: { unlocked: 20, total: 42 } },
  { key: 'steam:1030300', source: 'steam', appid: 1030300, title: 'Hollow Knight: Silksong', minutes: 1158, lastPlayed: now - 9 * day, ach: { unlocked: 11, total: 50 } },
  { key: 'steam:105600', source: 'steam', appid: 105600, title: 'Terraria', minutes: 12642, lastPlayed: now - 17 * day, ach: { unlocked: 63, total: 88 } },
  { key: 'prism:CABE', source: 'prism', instanceId: 'CABE', title: 'Create: Above and Beyond', minutes: 4305, lastPlayed: now - 15 * day, mcVersion: '1.16.5', loader: 'Forge', mods: 187, art: null },
  { key: 'steam:413150', source: 'steam', appid: 413150, title: 'Stardew Valley', minutes: 6120, lastPlayed: now - 60 * day, ach: { unlocked: 49, total: 49 } },
  { key: 'prism:VS', source: 'prism', instanceId: 'VS', title: 'Vanilla Survival', minutes: 542, lastPlayed: now - 55 * day, mcVersion: '1.21.4', loader: 'Vanilla', mods: 0, art: null },
  { key: 'steam:504230', source: 'steam', appid: 504230, title: 'Celeste', minutes: 1320, lastPlayed: now - 120 * day, ach: { unlocked: 22, total: 32 } },
  { key: 'steam:1174180', source: 'steam', appid: 1174180, title: 'Red Dead Redemption 2', minutes: 5210, lastPlayed: now - 2 * day, ach: { unlocked: 24, total: 51 } },
  { key: 'steam:227300', source: 'steam', appid: 227300, title: 'Euro Truck Simulator 2', minutes: 9340, lastPlayed: now - 4 * day, ach: { unlocked: 58, total: 203 } },
  { key: 'steam:1091500', source: 'steam', appid: 1091500, title: 'Cyberpunk 2077', minutes: 6880, lastPlayed: now - 8 * day, ach: { unlocked: 33, total: 57 } },
].map((g) => (g.source === 'steam' ? { ...g, art: steamArt(g.appid), installed: true, size: 18.4 * 1024 ** 3 } : g));
// Na demo, Silksong está baixando, Celeste e Stardew não estão no PC e o Terraria tem atualização na fila.
for (const g of games) if ([1030300, 504230, 413150].includes(g.appid)) Object.assign(g, { installed: false, size: 0 });
// Na demo, os jogos da lista do gamepresets.js têm presets.
for (const g of games) if ([1174180, 227300, 1091500].includes(g.appid)) g.presets = true;

// Capturas de exemplo: paisagens em SVG, cada jogo com suas cores.
const fakeShot = (h1, h2, seed) => {
  const hills = [0, 1, 2].map((i) => {
    const y = 380 + i * 70 + ((seed * (i + 3)) % 40);
    return `<path d="M0 ${y} Q 320 ${y - 90 - ((seed * 7 + i * 31) % 80)} 640 ${y} T 1280 ${y - 20} V 720 H 0 Z" fill="hsl(${h2} ${45 - i * 8}% ${28 - i * 7}%)"/>`;
  }).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720"><defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="hsl(${h1} 60% 22%)"/><stop offset="1" stop-color="hsl(${h1 + 30} 70% 62%)"/></linearGradient></defs><rect width="1280" height="720" fill="url(#s)"/><circle cx="${200 + ((seed * 137) % 880)}" cy="${150 + ((seed * 53) % 120)}" r="${50 + (seed % 4) * 15}" fill="hsl(${h1 + 50} 90% 80%)" opacity=".85"/>${hills}</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
};
const shotGroups = [
  { key: 'steam:1145350', title: 'Hades II', h: [350, 10], n: 9, source: 'cartucho', clips: [2, 5] },
  { key: 'prism:FO', title: 'Fabulously Optimized', h: [200, 120], n: 7, source: 'cartucho' },
  { key: 'steam:1245620', title: 'ELDEN RING', h: [40, 30], n: 6, source: 'cartucho', clips: [1, 3] },
  { key: 'steam:105600', title: 'Terraria', h: [190, 100], n: 4, source: 'steam' },
].map((g, gi) => ({
  key: g.key, title: g.title, gameKey: g.key,
  shots: Array.from({ length: g.n }, (_, i) => {
    const clip = (g.clips || []).includes(i);
    const url = fakeShot(g.h[0] + i * 9, g.h[1] + i * 5, gi * 13 + i + 1);
    return { url, thumb: clip ? url : null, at: now - gi * 2 * day - i * 5 * 3600000, video: clip, source: g.source, name: `${g.title} ${i}.png` };
  }),
}));
const gamePresets = { 1174180: 'qualidade', 227300: 'qualidade', 1091500: 'equilibrado' };
// O que cada preset muda, como vem do gamepresets.js.
const gameNotes = {
  1174180: { desempenho: 'Sombras e volumétricos leves, texturas no alto', equilibrado: 'Texturas no ultra, sombras e luz no alto', qualidade: 'Quase tudo no alto, texturas no ultra, sem MSAA' },
  227300: { desempenho: 'Sombras baixas, sem oclusão de ambiente', equilibrado: 'Sombras altas e luzes vistas de mais longe', qualidade: 'Sombras no máximo, vegetação cheia' },
  1091500: { desempenho: 'Sombras, névoa e reflexos no baixo', equilibrado: 'Médio, com sombras distantes no alto', qualidade: 'Alto, sem ray tracing' },
};
let downloads = [
  { key: 'steam:1030300', appid: 1030300, title: 'Hollow Knight: Silksong', state: 'downloading', percent: 37, bytes: 0, total: 0, update: false },
  { key: 'steam:105600', appid: 105600, title: 'Terraria', state: 'queued', percent: 0, bytes: 0, total: 0, update: true },
];
setInterval(() => {
  downloads = downloads.map((d) => (d.state === 'downloading' ? { ...d, percent: Math.min(99, d.percent + 1) } : d));
  if (window.mockEmit) window.mockEmit('steam:downloads', downloads);
}, 1500);

let config = {
  steamId: '76561198000000000', hasSteamApiKey: true, steamApiKeyHint: 'A91F', hasSgdbApiKey: new URLSearchParams(location.search).get('sgdb') !== '0', sgdbApiKeyHint: '7C2E', prismDir: '', prismExe: '', hytaleExe: 'C:\\Program Files\\Hytale\\Hytale.exe', hytaleProcess: '',
  openAtLogin: true, returnAfterGame: true, captureBuffer: true, showBoot: true, sounds: true, music: true, musicFile: '', volume: 0.5,
  // Na demo dá para abrir já com um tema: index.html?tema=ps5
  theme: new URLSearchParams(location.search).get('tema') || 'cartucho',
  collections: [
    { id: 'jogando', name: 'Jogando agora', keys: ['steam:1145350', 'steam:1174180', 'prism:FO', 'steam:227300'] },
    { id: 'zerar', name: 'Para zerar', keys: ['steam:1245620', 'steam:1030300', 'steam:1091500', 'steam:504230', 'steam:1174180'] },
    { id: 'coop', name: 'Com a galera', keys: ['steam:105600', 'prism:CABE', 'steam:413150'] },
  ],
  defaultPrismDir: 'C:\\Users\\Filipi\\AppData\\Roaming\\PrismLauncher', running: null,
};

const mcPresets = { FO: 'desempenho' };
const friend = (steamId, name, status, extra = {}) => ({ steamId, name, avatar: '', status, appid: null, game: '', lastOnline: now - 2 * day, ...extra });
const friends = [
  friend('76561198000000001', 'Rafa', 'playing', { appid: 1245620, game: 'ELDEN RING' }),
  friend('76561198000000002', 'Duda', 'playing', { appid: 1086940, game: "Baldur's Gate 3" }),
  friend('76561198000000003', 'Thiago_BR', 'playing', { appid: 105600, game: 'Terraria' }),
  friend('76561198000000004', 'Lu', 'online'),
  friend('76561198000000005', 'Gabriel', 'away'),
  friend('76561198000000006', 'mari.exe', 'busy'),
  friend('76561198000000007', 'Pedro', 'offline', { lastOnline: now - 3600000 * 5 }),
  friend('76561198000000008', 'Caio', 'offline', { lastOnline: now - 4 * day }),
  friend('76561198000000009', 'Bia', 'offline', { lastOnline: now - 21 * day }),
];

const listeners = new Map();
// No navegador dá para simular eventos do processo principal, por exemplo: mockEmit('overlay:open', { running: {...} }).
window.mockEmit = (event, payload) => (listeners.get(event) || []).forEach((cb) => cb(payload));

const library = () => ({ games, profile: { name: 'Filipi', avatar: '' }, syncedAt: now, steamConfigured: true });

export const mock = {
  getConfig: async () => ({ ...config }),
  setConfig: async (patch) => {
    if ('steamApiKey' in patch) {
      config.hasSteamApiKey = !!patch.steamApiKey;
      config.steamApiKeyHint = String(patch.steamApiKey).slice(-4);
      delete patch.steamApiKey;
    }
    if ('sgdbApiKey' in patch) {
      config.hasSgdbApiKey = !!patch.sgdbApiKey;
      config.sgdbApiKeyHint = String(patch.sgdbApiKey).slice(-4);
      delete patch.sgdbApiKey;
    }
    config = { ...config, ...patch };
    return { ...config };
  },
  getLibrary: async () => library(),
  sync: async () => library(),
  achievementSummary: async () => {
    const list = games.filter((g) => g.ach);
    const unlocked = list.reduce((s, g) => s + g.ach.unlocked, 0);
    const perfect = list.filter((g) => g.ach.unlocked === g.ach.total).length;
    const xp = unlocked * 10 + perfect * 100;
    return {
      unlocked, total: list.reduce((s, g) => s + g.ach.total, 0), perfect, month: 27,
      latest: { name: 'Elden Lord', game: 'ELDEN RING', unlocktime: now - 3 * day },
      games: list.map((g) => ({ key: g.key, appid: g.appid, title: g.title, unlocked: g.ach.unlocked, total: g.ach.total })),
      level: Math.floor(xp / 250) + 1, progress: (xp % 250) / 250, xp,
    };
  },
  getProfile: async () => {
    const summary = await mock.achievementSummary();
    const bySource = { steam: 0, prism: 0, hytale: 0 };
    for (const g of games) bySource[g.source] += g.minutes;
    // Ícones de exemplo: um troféu com a cor de cada jogo.
    const icon = (hh) => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="hsl(${hh} 45% 22%)"/><path d="M20 14h24v10a12 12 0 0 1-24 0z M28 36h8v8h6v6H22v-6h6z" fill="hsl(${hh} 70% 62%)"/></svg>`)}`;
    const rare = [
      ['ELDEN RING', 1245620, 'Elden Lord', 'Alcançou o final Era da Fratura', 3.8, 40],
      ['Hades II', 1145350, 'Medo Absoluto', 'Venceu com 32 de Medo', 0.6, 350],
      ['Celeste', 504230, 'Coração Dourado', 'Terminou o Capítulo 9', 1.4, 300],
      ['Terraria', 105600, 'Fim de Jogo', 'Derrotou o Senhor da Lua', 4.9, 190],
      ['Stardew Valley', 413150, 'Lenda', 'Ganhou 10.000.000 de ouro', 2.7, 100],
      ['Euro Truck Simulator 2', 227300, 'Magnata', 'Comprou todas as garagens', 6.2, 210],
      ['Cyberpunk 2077', 1091500, 'O Lendário', 'Atingiu reputação de rua máxima', 9.8, 55],
      ['Hollow Knight: Silksong', 1030300, 'Rainha da Seda', 'Terminou o jogo em menos de 5 horas', 0.3, 280],
    ].map(([game, appid, name, description, percent, hh], i) => ({ appid, api: `R${i}`, key: `steam:${appid}`, game, name, description, percent, icon: icon(hh), unlocktime: now - i * 9 * day }))
      .sort((a, b) => a.percent - b.percent);
    return {
      player: { name: 'Filipi', avatar: '', steamLevel: 37, since: new Date(2014, 5, 2).getTime() },
      steamConfigured: true,
      summary,
      playtime: {
        minutes: games.reduce((s, g) => s + g.minutes, 0), bySource, games: games.length, played: games.filter((g) => g.minutes).length,
        top: [...games].sort((a, b) => b.minutes - a.minutes).slice(0, 4).map((g) => ({ key: g.key, title: g.title, source: g.source, minutes: g.minutes })),
      },
      rare: new URLSearchParams(location.search).get('raras') === '0' ? [] : rare,
      rarityStatus: { running: false, done: 0, total: 0 },
    };
  },
  gameAchievements: async (appid) => {
    const g = games.find((x) => x.appid === appid);
    if (!g || !g.ach) return null;
    return Array.from({ length: g.ach.total }, (_, i) => ({
      api: `A${i}`, achieved: i < g.ach.unlocked, unlocktime: i < g.ach.unlocked ? now - i * day : 0,
      name: `Conquista ${i + 1}`, description: 'Descrição de exemplo da conquista.', icon: '', percent: Math.max(1.2, 80 - i * 3.1),
    }));
  },
  launch: async () => ({ ok: true }),
  steamDownloads: async () => downloads,
  getGamePreset: async (appid) => ({ found: true, preset: gamePresets[appid] || null, canRestore: !!gamePresets[appid], notes: gameNotes[appid] }),
  setGamePreset: async (appid, id) => { gamePresets[appid] = id; return { ok: true }; },
  restoreGamePreset: async (appid) => { delete gamePresets[appid]; return { ok: true }; },
  installGame: async () => ({ ok: true }),
  uninstallGame: async () => ({ ok: true }),
  openDownloads: async () => {},
  openInSource: async () => {},
  pickArt: async () => ({ canceled: true }),
  // Busca na internet: imagens de exemplo no lugar do SteamGridDB e uma trilha de mentira no lugar do KHInsider.
  searchImages: async (game, kind, term) => {
    await new Promise((r) => setTimeout(r, 400));
    const name = term || game.title;
    const art = (i) => {
      const [w, ht] = kind === 'cover' ? [600, 900] : [1920, 620];
      const h1 = (name.length * 37 + i * 29) % 360;
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${ht}"><defs><linearGradient id="g" x1="0" y1="0" x2="${i % 2}" y2="1"><stop offset="0" stop-color="hsl(${h1} 65% 55%)"/><stop offset="1" stop-color="hsl(${h1 + 60} 60% 12%)"/></linearGradient></defs><rect width="${w}" height="${ht}" fill="url(#g)"/><circle cx="${w * (0.25 + (i % 3) * 0.25)}" cy="${ht * 0.35}" r="${Math.min(w, ht) * 0.22}" fill="hsl(${h1 + 30} 90% 75%)" opacity=".5"/><text x="50%" y="${kind === 'cover' ? '82%' : '70%'}" text-anchor="middle" font-family="sans-serif" font-weight="800" font-size="${kind === 'cover' ? 64 : 120}" fill="#fff">${name.replace(/[<&]/g, '')}</text></svg>`;
      return `data:image/svg+xml,${encodeURIComponent(svg)}`;
    };
    return { term: name, name, items: Array.from({ length: kind === 'cover' ? 14 : 8 }, (_, i) => ({ id: i + 1, url: art(i), thumb: art(i), author: ['Kirito', 'gridmaster', 'neon_arts', 'Vash'][i % 4] })) };
  },
  searchAlbums: async (game, term) => {
    await new Promise((r) => setTimeout(r, 400));
    const name = term || (game.source === 'prism' ? 'Minecraft' : game.title);
    return { term: name, items: [`${name} Original Soundtrack`, `${name} (Gamerip)`, `${name} - Volume Beta`, `${name} Deluxe Edition Soundtrack`].map((n, i) => ({ id: `album-${i}`, name: n })) };
  },
  albumTracks: async () => ['Main Theme', 'Title Screen', 'Into the Unknown', 'Boss Battle', 'Peaceful Village', 'Night Falls', 'Credits'].map((n, i) => ({ id: `/t/${i}`, name: n, duration: `${2 + (i % 3)}:${String(10 + i * 7).slice(-2)}` })),
  previewTrack: async () => ({ error: 'Na demonstração não dá para ouvir.' }),
  useImage: async () => ({ ok: true }),
  useTrack: async () => ({ ok: true }),
  searchDone: async () => {},
  resetArt: async () => {},
  mcPresets: async () => [
    { id: 'desempenho', label: 'Desempenho', desc: 'Mais FPS: sombras, reflexos e efeitos mais leves' },
    { id: 'equilibrado', label: 'Equilibrado', desc: 'Bonito e fluido: o meio-termo de cada jogo' },
    { id: 'qualidade', label: 'Qualidade', desc: 'Tudo no alto, no limite do que a placa de vídeo segura' },
  ],
  getMcPreset: async (id) => mcPresets[id] ?? null,
  setMcPreset: async (id, preset) => { mcPresets[id] = preset; return { ok: true, preset }; },
  systemStats: async () => ({
    cpu: 'AMD Ryzen 5 7600 6-Core Processor', cores: 6, threads: 12, gpu: [{ model: 'NVIDIA GeForce RTX 4060', vram: 8188 }], os: 'Microsoft Windows 11 Pro 10.0.26100',
    cpuLoad: 8 + Math.random() * 20, cpuTemp: 46 + Math.random() * 4, memUsed: 11.2 * 1024 ** 3, memTotal: 32 * 1024 ** 3,
    disks: [{ mount: 'C:', used: 402 * 1024 ** 3, size: 931 * 1024 ** 3 }, { mount: 'D:', used: 1.71 * 1024 ** 4, size: 1.82 * 1024 ** 4 }],
  }),
  recommendedPreset: async () => ({ id: 'qualidade', reason: 'NVIDIA GeForce RTX 4060, 32 GB de memória' }),
  setMcPresetAll: async (preset) => {
    for (const g of games.filter((x) => x.source === 'prism')) mcPresets[g.instanceId] = preset;
    for (const g of games.filter((x) => x.presets)) gamePresets[g.appid] = preset;
    return { applied: 3, skipped: 0 };
  },
  playWeek: async () => {
    const mins = [95, 0, 140, 60, 210, 35, 120];
    const days = mins.map((m, i) => ({ date: '', weekday: (new Date(now - (6 - i) * day)).getDay(), minutes: m }));
    return { days, total: mins.reduce((a, b) => a + b, 0), top: [{ key: 'steam:1245620', minutes: 320 }, { key: 'prism:FO', minutes: 210 }, { key: 'steam:105600', minutes: 95 }], trackingSince: '' };
  },
  getFriends: async () => ({ configured: true, friends }),
  screenshots: async () => shotGroups,
  removeScreenshot: async (url) => {
    for (const g of shotGroups) g.shots = g.shots.filter((s) => s.url !== url);
    return { error: null };
  },
  capture: async () => {},
  captureStatus: async () => ({ game: 'Hades II', buffer: true, recording: null }),
  sendAudio: () => {},
  sendAudioError: () => {},
  openProfile: async () => {},
  updateStatus: async () => ({ state: 'current', version: null }),
  checkUpdate: async () => {
    const emit = (st) => window.mockEmit('update:status', st);
    emit({ state: 'checking' });
    setTimeout(() => emit({ state: 'downloading', version: '0.4.2', percent: 37 }), 600);
    return { state: 'checking' };
  },
  installUpdate: async () => {},
  overlayClose: async () => {},
  overlayNavigate: async () => {},
  pickFile: async () => null,
  pickFolder: async () => null,
  power: async () => true,
  readClipboard: async () => 'A91F3C0D5E7B2468ACE13579BDF02468',
  minimize: async () => {},
  releaseTop: async () => {},
  toggleFullscreen: async () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen().catch(() => {});
  },
  platform: 'win32',
  on: (event, cb) => {
    listeners.set(event, [...(listeners.get(event) || []), cb]);
    return () => listeners.set(event, listeners.get(event).filter((x) => x !== cb));
  },
};
