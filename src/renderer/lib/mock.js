// Dados de exemplo para abrir a interface no navegador, sem Electron (útil para mexer no visual).
const day = 86400000;
const now = Date.now();
const steamArt = (appid) => ({
  cover: [`https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/${appid}/library_600x900.jpg`],
  hero: [`https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/${appid}/library_hero.jpg`],
});

const games = [
  { key: 'steam:1145350', source: 'steam', appid: 1145350, title: 'Hades II', minutes: 3744, lastPlayed: now - day, ach: { unlocked: 31, total: 49 } },
  { key: 'prism:FO', source: 'prism', instanceId: 'FO', title: 'Fabulously Optimized', minutes: 2290, lastPlayed: now - 3600000, mcVersion: '1.21.1', loader: 'Fabric', mods: 94, art: null },
  { key: 'hytale', source: 'hytale', title: 'Hytale', minutes: 720, lastPlayed: now - 5 * day, installed: true, art: null },
  { key: 'steam:1245620', source: 'steam', appid: 1245620, title: 'ELDEN RING', minutes: 8592, lastPlayed: now - 3 * day, ach: { unlocked: 20, total: 42 } },
  { key: 'steam:1030300', source: 'steam', appid: 1030300, title: 'Hollow Knight: Silksong', minutes: 1158, lastPlayed: now - 9 * day, ach: { unlocked: 11, total: 50 } },
  { key: 'steam:105600', source: 'steam', appid: 105600, title: 'Terraria', minutes: 12642, lastPlayed: now - 17 * day, ach: { unlocked: 63, total: 88 } },
  { key: 'prism:CABE', source: 'prism', instanceId: 'CABE', title: 'Create: Above and Beyond', minutes: 4305, lastPlayed: now - 15 * day, mcVersion: '1.16.5', loader: 'Forge', mods: 187, art: null },
  { key: 'steam:413150', source: 'steam', appid: 413150, title: 'Stardew Valley', minutes: 6120, lastPlayed: now - 60 * day, ach: { unlocked: 49, total: 49 } },
  { key: 'prism:VS', source: 'prism', instanceId: 'VS', title: 'Vanilla Survival', minutes: 542, lastPlayed: now - 55 * day, mcVersion: '1.21.4', loader: 'Vanilla', mods: 0, art: null },
  { key: 'steam:504230', source: 'steam', appid: 504230, title: 'Celeste', minutes: 1320, lastPlayed: now - 120 * day, ach: { unlocked: 22, total: 32 } },
].map((g) => (g.source === 'steam' ? { ...g, art: steamArt(g.appid) } : g));

let config = {
  steamId: '76561198000000000', hasSteamApiKey: true, steamApiKeyHint: 'A91F', prismDir: '', prismExe: '', hytaleExe: 'C:\\Program Files\\Hytale\\Hytale.exe', hytaleProcess: '',
  openAtLogin: true, returnAfterGame: true, showBoot: true, sounds: true, music: true, musicFile: '', volume: 0.5,
  defaultPrismDir: 'C:\\Users\\Filipi\\AppData\\Roaming\\PrismLauncher', running: null,
};

const mcPresets = { FO: 'desempenho' };
const plans = [
  { guid: '381b4222-f694-41f0-9685-ff5bb260df2e', name: 'Equilibrado' },
  { guid: '8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c', name: 'Alto desempenho' },
  { guid: 'a1841308-3541-4fab-bc81-f71556f20b4a', name: 'Economia de energia' },
];
let activePlan = plans[0].guid;

const library = () => ({ games, profile: { name: 'Filipi', avatar: '' }, syncedAt: now, steamConfigured: true });

export const mock = {
  getConfig: async () => ({ ...config }),
  setConfig: async (patch) => {
    if ('steamApiKey' in patch) {
      config.hasSteamApiKey = !!patch.steamApiKey;
      config.steamApiKeyHint = String(patch.steamApiKey).slice(-4);
      delete patch.steamApiKey;
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
  gameAchievements: async (appid) => {
    const g = games.find((x) => x.appid === appid);
    if (!g || !g.ach) return null;
    return Array.from({ length: g.ach.total }, (_, i) => ({
      api: `A${i}`, achieved: i < g.ach.unlocked, unlocktime: i < g.ach.unlocked ? now - i * day : 0,
      name: `Conquista ${i + 1}`, description: 'Descrição de exemplo da conquista.', icon: '', percent: Math.max(1.2, 80 - i * 3.1),
    }));
  },
  launch: async () => ({ ok: true }),
  openInSource: async () => {},
  pickArt: async () => ({ canceled: true }),
  resetArt: async () => {},
  mcPresets: async () => [{ id: 'desempenho', label: 'Desempenho' }, { id: 'equilibrado', label: 'Equilibrado' }, { id: 'qualidade', label: 'Qualidade' }],
  getMcPreset: async (id) => mcPresets[id] ?? null,
  setMcPreset: async (id, preset) => { mcPresets[id] = preset; return { ok: true, preset }; },
  systemStats: async () => ({
    cpu: 'AMD Ryzen 7 5800X3D', cores: 8, threads: 16, gpu: [{ model: 'NVIDIA GeForce RTX 4070', vram: 12282 }], os: 'Microsoft Windows 11 Pro 10.0.26100',
    cpuLoad: 8 + Math.random() * 20, cpuTemp: 46 + Math.random() * 4, memUsed: 11.2 * 1024 ** 3, memTotal: 32 * 1024 ** 3,
    disks: [{ mount: 'C:', used: 402 * 1024 ** 3, size: 931 * 1024 ** 3 }, { mount: 'D:', used: 1.71 * 1024 ** 4, size: 1.82 * 1024 ** 4 }],
  }),
  powerPlans: async () => plans.map((p) => ({ ...p, active: p.guid === activePlan })),
  setPowerPlan: async (guid) => { activePlan = guid; return { ok: true }; },
  pickFile: async () => null,
  pickFolder: async () => null,
  power: async () => true,
  minimize: async () => {},
  releaseTop: async () => {},
  toggleFullscreen: async () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen().catch(() => {});
  },
  platform: 'win32',
  on: () => () => {},
};
