// Configurações em lista grande, para dar para mexer com o controle. Campos de texto pedem o teclado.
import { h, when } from '../lib/ui.js';

const VOLUME_STEP = 0.1;

const UPDATE_TEXT = {
  downloading: (v) => [`Baixando a versão ${v}`, 'Ela é instalada quando você fechar o Cartucho'],
  ready: (v) => [`Versão ${v} pronta`, 'Aperte para reiniciar e atualizar agora'],
  current: () => ['Você está na versão mais nova', 'O Cartucho procura atualizações sozinho a cada 6 horas'],
  idle: () => ['Atualizações automáticas', 'O Cartucho procura versões novas no GitHub sozinho'],
};

function updateRow(ctx) {
  const u = ctx.state.update || { state: 'idle' };
  const [label, desc] = (UPDATE_TEXT[u.state] || UPDATE_TEXT.idle)(u.version);
  const ready = u.state === 'ready';
  return h(ready ? 'button' : 'div', { class: 'opt', 'data-focus': ready ? true : undefined, 'data-key': 'update', onclick: ready ? () => ctx.api.installUpdate() : undefined },
    h('span', { class: 'txt' }, label, h('small', {}, desc)),
    ready ? h('span', { class: 'val' }, 'atualizar') : null);
}

export default {
  label: 'Configurações',
  render(ctx) {
    const cfg = ctx.state.config;
    const save = async (patch, message) => {
      const next = await ctx.api.setConfig(patch);
      await ctx.applyConfig({ ...cfg, ...next, defaultPrismDir: cfg.defaultPrismDir, running: cfg.running });
      if (message) ctx.toast(message);
      ctx.rerender();
    };

    const toggle = (key, label, desc) => h('button', { class: 'opt', 'data-focus': true, 'data-key': key, onclick: () => { ctx.sfx.tab(); save({ [key]: !cfg[key] }); } },
      h('span', { class: 'txt' }, label, desc ? h('small', {}, desc) : null),
      h('i', { class: `sw ${cfg[key] ? 'on' : ''}` }));

    // Campo de texto: A começa a digitar, Enter salva, Esc cancela.
    const text = (key, label, desc, { secret = false, placeholder = '' } = {}) => {
      const input = h('input', { id: `cfg-${key}`, type: secret ? 'password' : 'text', value: secret ? '' : cfg[key] || '', placeholder, spellcheck: 'false', autocomplete: 'off' });
      const row = h('div', { class: 'opt', 'data-focus': true, 'data-key': key, 'data-input': key, role: 'button', onclick: () => input.focus() },
        h('span', { class: 'txt' }, label, desc ? h('small', {}, desc) : null), input);
      input.addEventListener('blur', () => {
        if (input.dataset.cancel) {
          delete input.dataset.cancel;
          input.value = secret ? '' : cfg[key] || '';
          return;
        }
        const value = input.value.trim();
        if (secret ? value : value !== (cfg[key] || '')) save({ [key]: value }, 'Salvo.');
      });
      return row;
    };

    const path = (key, label, desc, { folder = false, filters, fallback = 'não definido' } = {}) => {
      const value = cfg[key];
      const pick = async () => {
        const chosen = folder ? await ctx.api.pickFolder({ defaultPath: value || undefined }) : await ctx.api.pickFile({ filters, defaultPath: value || undefined });
        if (chosen) save({ [key]: chosen }, 'Caminho salvo.');
      };
      return h('button', { class: 'opt', 'data-focus': true, 'data-key': key, 'data-path': key, onclick: pick },
        h('span', { class: 'txt' }, label, h('small', {}, value || desc)),
        h('span', { class: `val ${value ? '' : 'warn'}` }, value ? 'definido' : fallback));
    };

    const action = (key, label, desc, fn, value = '') => h('button', { class: 'opt', 'data-focus': true, 'data-key': key, onclick: fn },
      h('span', { class: 'txt' }, label, desc ? h('small', {}, desc) : null), value ? h('span', { class: 'val' }, value) : null);

    const section = (cls, label) => h('div', { class: `set-section ${cls}` }, label);

    const volume = h('div', { class: 'opt', 'data-focus': true, 'data-key': 'volume', 'data-slider': true, role: 'slider', 'aria-valuenow': Math.round(cfg.volume * 100) },
      h('span', { class: 'txt' }, 'Volume', h('small', {}, 'Use ← e → para ajustar')),
      h('span', { class: 'slider' }, h('span', { class: 'bar' }, h('i', { style: { width: `${cfg.volume * 100}%` } })), h('span', { class: 'mono' }, `${Math.round(cfg.volume * 100)}%`)));

    const steamStatus = !ctx.state.steamConfigured ? 'falta a chave ou o SteamID' : ctx.state.syncedAt ? `sincronizado ${when(ctx.state.syncedAt)}` : 'ainda não sincronizado';

    const list = h('div', { class: 'set-list' },
      section('console', 'Modo console'),
      toggle('openAtLogin', 'Abrir quando o Windows iniciar', 'O Cartucho abre sozinho, em tela cheia, ao ligar o PC'),
      toggle('returnAfterGame', 'Voltar para o Cartucho ao fechar um jogo'),
      toggle('showBoot', 'Mostrar a tela de abertura'),
      action('fullscreen', 'Tela cheia', 'Também funciona com F11', () => ctx.api.toggleFullscreen()),

      section('steam', 'Steam'),
      text('steamApiKey', 'Chave da Steam Web API', 'Gere a sua em steamcommunity.com/dev/apikey. Fica guardada só neste PC.', {
        secret: true,
        placeholder: cfg.hasSteamApiKey ? `•••••••• ${cfg.steamApiKeyHint}` : 'cole a chave aqui',
      }),
      text('steamId', 'SteamID64', 'Número de 17 dígitos do seu perfil (dá para ver em steamid.io)', { placeholder: '7656119…' }),
      action('sync', 'Sincronizar agora', 'Seu perfil e os detalhes de jogo precisam estar públicos na Steam', () => ctx.sync({ force: true, quiet: false }), steamStatus),

      section('prism', 'Minecraft · Prism Launcher'),
      path('prismDir', 'Pasta do Prism Launcher', `Automático: ${cfg.defaultPrismDir}`, { folder: true, fallback: 'automático' }),
      path('prismExe', 'Executável do Prism', 'Procurado automaticamente nas pastas padrão', { filters: [{ name: 'Programas', extensions: ['exe'] }], fallback: 'automático' }),

      section('hytale', 'Hytale'),
      path('hytaleExe', 'Executável do Hytale', 'Escolha o .exe que abre o jogo', { filters: [{ name: 'Programas', extensions: ['exe'] }] }),
      text('hytaleProcess', 'Nome do processo do jogo', 'Opcional. Usado para contar o tempo quando o .exe acima é só o launcher', { placeholder: 'HytaleClient.exe' }),

      section('', 'Som'),
      toggle('sounds', 'Sons de navegação'),
      toggle('music', 'Música tema'),
      path('musicFile', 'Música personalizada', 'Opcional. Sem arquivo, toca a trilha do Cartucho', { filters: [{ name: 'Áudio', extensions: ['mp3', 'ogg', 'wav', 'flac', 'm4a'] }], fallback: 'trilha do Cartucho' }),
      volume,

      section('', 'Sobre'),
      h('div', { class: 'opt' }, h('span', { class: 'txt' }, 'Cartucho 0.3.0', h('small', {}, 'Use Q/E ou LB/RB para trocar de aba e M ou Start para o menu rápido'))),
      updateRow(ctx));

    const el = h('div', { class: 'set-wrap' }, list);

    return {
      el,
      hints: [['confirm', 'Alterar'], ['x', 'Limpar'], ['menu', 'Menu']],
      onAction(act, { focused }) {
        const typing = document.activeElement instanceof HTMLInputElement;
        if (typing) {
          const input = document.activeElement;
          if (act === 'confirm') { input.blur(); return true; }
          if (act === 'back') { input.dataset.cancel = '1'; input.blur(); return true; }
          return true;
        }
        if (!focused) return false;
        if ('slider' in focused.dataset && (act === 'left' || act === 'right')) {
          const v = Math.min(1, Math.max(0, Math.round((cfg.volume + (act === 'right' ? VOLUME_STEP : -VOLUME_STEP)) * 10) / 10));
          ctx.sfx.move();
          save({ volume: v });
          return true;
        }
        if (act === 'x' && (focused.dataset.path || focused.dataset.input)) {
          const key = focused.dataset.path || focused.dataset.input;
          save({ [key]: '' }, 'Removido.');
          return true;
        }
        return false;
      },
    };
  },
};
