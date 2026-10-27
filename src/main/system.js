// Desligar e reiniciar o PC pelo menu rápido.
const { spawn } = require('node:child_process');

const COMMANDS = {
  win32: { shutdown: ['shutdown', ['/s', '/t', '0']], restart: ['shutdown', ['/r', '/t', '0']] },
  linux: { shutdown: ['systemctl', ['poweroff']], restart: ['systemctl', ['reboot']] },
  darwin: { shutdown: ['osascript', ['-e', 'tell app "System Events" to shut down']], restart: ['osascript', ['-e', 'tell app "System Events" to restart']] },
};

function power(action) {
  const cmd = (COMMANDS[process.platform] || {})[action];
  if (!cmd) return false;
  spawn(cmd[0], cmd[1], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
  return true;
}

module.exports = { power };
