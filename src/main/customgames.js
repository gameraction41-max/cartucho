// Jogos que não são da Steam nem do Minecraft/Hytale: qualquer .exe que a pessoa adicionar.
// Ficam em config (customGames) e o tempo jogado em playtime.json, contado pelo processo do jogo.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

// Caminhos de jogo são sempre do Windows; path.win32 entende \ e / em qualquer sistema (inclusive nos testes).
const win = path.win32;

const MAX_GAMES = 200;
// Atalhos do menu Iniciar que não são jogos: desinstaladores, manuais, sites, atualizadores.
const NOT_A_GAME = /\b(uninstall\w*|unins\d*|desinstal\w*|readme|leia-?me|manual|help|ajuda|documenta\w*|website|site|support|suporte|update\w*|updater|atualiz\w*|setup|install\w*|crash\w*|license|licen[çc]a|changelog|release notes)\b/i;
// Programas do Windows e de lojas que o Cartucho já lê por conta própria.
const SKIP_EXE = /^(steam|steamwebhelper|prismlauncher|hytale-launcher|hytaleclient|explorer|cmd|powershell|notepad|msedge|chrome|firefox|control|mmc|rundll32|msiexec)\.exe$/i;
const SKIP_DIR = /\\windows\\|\\windowsapps\\|\\microsoft\\|\\windows kits\\|\\common files\\/i;

function sanitize(list) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const out = [];
  for (const g of list) {
    if (!g || typeof g.exe !== 'string' || !g.exe.toLowerCase().endsWith('.exe')) continue;
    const id = typeof g.id === 'string' && /^[a-z0-9]{6,16}$/.test(g.id) ? g.id : newId();
    if (seen.has(id)) continue;
    seen.add(id);
    const title = String(g.title || win.basename(g.exe, win.extname(g.exe))).trim().slice(0, 80) || 'Jogo';
    out.push({ id, title, exe: g.exe, args: typeof g.args === 'string' ? g.args.slice(0, 300) : '', process: typeof g.process === 'string' ? g.process.trim().slice(0, 80) : '', addedAt: Number(g.addedAt) || Date.now() });
    if (out.length >= MAX_GAMES) break;
  }
  return out;
}

function newId() {
  return crypto.randomBytes(5).toString('hex');
}

// Nome a partir do atalho ou do arquivo: "Hollow Knight.lnk" → "Hollow Knight".
function niceName(file) {
  return win.basename(file, win.extname(file)).replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim();
}

// Atalho do menu Iniciar que aponta para um jogo: precisa ser .exe e não ser desinstalador, manual nem programa do Windows.
function looksLikeGame(name, target) {
  if (!target || !target.toLowerCase().endsWith('.exe')) return false;
  if (NOT_A_GAME.test(name) || NOT_A_GAME.test(win.basename(target))) return false;
  if (SKIP_EXE.test(win.basename(target))) return false;
  if (SKIP_DIR.test(target)) return false;
  return true;
}

function walk(dir, depth, out) {
  if (depth < 0) return;
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, depth - 1, out);
    else if (e.name.toLowerCase().endsWith('.lnk')) out.push(full);
  }
}

// Programas do menu Iniciar e da Área de Trabalho que parecem jogos. readLink vem do Electron (shell.readShortcutLink).
function startMenuGames(readLink, { env = process.env, exists = fs.existsSync, known = [] } = {}) {
  const roots = [
    env.ProgramData && path.join(env.ProgramData, 'Microsoft', 'Windows', 'Start Menu', 'Programs'),
    env.APPDATA && path.join(env.APPDATA, 'Microsoft', 'Windows', 'Start Menu', 'Programs'),
    env.USERPROFILE && path.join(env.USERPROFILE, 'Desktop'),
    env.PUBLIC && path.join(env.PUBLIC, 'Desktop'),
  ].filter(Boolean);
  const links = [];
  for (const r of roots) walk(r, 3, links);
  const taken = new Set(known.map((f) => f.toLowerCase()));
  const byExe = new Map();
  for (const link of links) {
    let target;
    try {
      target = readLink(link).target;
    } catch {
      continue;
    }
    const name = niceName(link);
    if (!looksLikeGame(name, target) || !exists(target)) continue;
    const k = target.toLowerCase();
    if (taken.has(k) || byExe.has(k)) continue;
    byExe.set(k, { title: name, exe: target, args: '' });
  }
  return [...byExe.values()].sort((a, b) => a.title.localeCompare(b.title, 'pt-BR'));
}

module.exports = { sanitize, newId, niceName, looksLikeGame, startMenuGames, MAX_GAMES };
