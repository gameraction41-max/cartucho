// Ponte entre a interface e o processo principal. A interface só enxerga estas funções.
const { contextBridge, ipcRenderer } = require('electron');

const invoke = (channel) => (...args) => ipcRenderer.invoke(channel, ...args);

contextBridge.exposeInMainWorld('cartucho', {
  getConfig: invoke('config:get'),
  setConfig: invoke('config:set'),
  getLibrary: invoke('library:get'),
  sync: invoke('library:sync'),
  achievementSummary: invoke('achievements:summary'),
  gameAchievements: invoke('achievements:game'),
  launch: invoke('game:launch'),
  openInSource: invoke('game:open-source'),
  pickFile: invoke('dialog:file'),
  pickFolder: invoke('dialog:folder'),
  power: invoke('system:power'),
  minimize: invoke('window:minimize'),
  toggleFullscreen: invoke('window:fullscreen'),
  platform: process.platform,
  on(event, callback) {
    const listener = (_e, payload) => callback(payload);
    ipcRenderer.on(event, listener);
    return () => ipcRenderer.removeListener(event, listener);
  },
});
