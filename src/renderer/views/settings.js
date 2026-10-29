// Configurações em lista grande, para dar para mexer com o controle. Campos de texto pedem o teclado.
import { h, when } from '../lib/ui.js';
import { THEMES, themeOf } from '../lib/themes.js';
import { SOFA_ACTIONS, SOFA_MINUTES, minutesText } from '../lib/sofa.js';

const VOLUME_STEP = 0.1;

const UPDATE_TEXT = {
  checking: () => ['Procurando atualização…', 'Consultando as versões no GitHub'],
  downloading: (u) => [`Baixando a versão ${u.version}${u.percent ? ` · ${u.percent}%` : ''}`, 'Ela é instalada quando você fechar o Cartucho'],
  ready: (u) => [`Versão ${u.version} pronta`, 'Aperte para reiniciar e atualizar agora'],
  current: () => ['Você está na versão mais nova', 'Aperte para procurar de novo'],
  error: (u) => ['Não deu para atualizar', `${u.error}. Aperte para tentar de novo`],
  dev: () => ['Atualizações', 'Só funcionam no Cartucho instalado'],
  idle: () => ['Procurar atualização', 'O Cartucho também procura sozinho a cada 6 horas'],
};

const UPDATE_VALUE = { ready: 'atualizar', checking: '', downloading: '', dev: '' };

function updateRow(ctx) {
  const u = ctx.state.update || { state: 'idle' };
  const [label, desc] = (UPDATE_TEXT[u.state] || UPDATE_TEXT.idle)(u);
  const value = u.state in UPDATE_VALUE ? UPDATE_VALUE[u.state] : 'procurar';
  const onclick = () => {
    ctx.sfx.tab();
    if (u.state === 'ready') return ctx.api.installUpdate();
    if (u.state === 'checking' || u.state === 'downloading') return;
    ctx.api.checkUpdate().catch(() => {});
  };
  return h('button', { class: `opt ${u.state === 'error' ? 'warn' : ''}`, 'data-focus': true, 'data-key': 'update', onclick },
    h('span', { class: 'txt' }, label, h('small', {}, desc)),
    value ? h('span', { class: 'val' }, value) : null);
}

export default {
  label: 'Configurações',
  render(ctx) {
    const cfg = ctx.state.config;
    const save = async (patch, message) => {
      const next = await ctx.api.setConfig(patch);
      await ctx.applyConfig({ ...cfg, ...next, defaultPrismDir: cfg.defaultPrismDir, defaultHytaleExe: cfg.defaultHytaleExe, running: cfg.running, appVersion: cfg.appVersion });
      if (message) ctx.toast(message);
      ctx.rerender();
    };

    const toggle = (key, label, desc) => h('button', { class: 'opt', 'data-focus': true, 'data-key': key, onclick: () => { ctx.sfx.tab(); save({ [key]: !cfg[key] }); } },
      h('span', { class: 'txt' }, label, desc ? h('small', {}, desc) : null),
      h('i', { class: `sw ${cfg[key] ? 'on' : ''}` }));

    // Campo de texto: A começa a digitar, Enter salva, Esc cancela.
    const text = (key, label, desc, { secret = false, placeholder = '' } = {}) => {
      const input = h('input', { id: `cfg-${key}`, type: secret ? 'password' : 'text', value: secret ? '' : cfg[key] || '', placeholder, spellcheck: 'false', autocomplete: 'off' });
      // Com o controle, abre o teclado na tela; com teclado e mouse, digita direto no campo.
      const edit = () => {
        if (ctx.state.device !== 'gamepad') return input.focus();
        ctx.sfx.confirm();
        ctx.keyboard({
          title: label,
          value: secret ? '' : cfg[key] || '',
          placeholder: secret ? 'Cole ou digite a chave' : placeholder,
          secret,
          done: (raw) => {
            const value = raw.trim();
            if (secret ? value : value !== (cfg[key] || '')) save({ [key]: value }, 'Salvo.');
          },
        });
      };
      const row = h('div', { class: 'opt', 'data-focus': true, 'data-key': key, 'data-input': key, role: 'button', onclick: edit },
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

    // Tema: A ou → passa para o próximo, ← volta. Muda na hora.
    const theme = themeOf(cfg);
    const stepTheme = (delta) => {
      const i = THEMES.indexOf(theme);
      const next = THEMES[(i + delta + THEMES.length) % THEMES.length];
      ctx.sfx.tab();
      save({ theme: next.id }, `Tema ${next.label}.`);
    };
    // Linha de escolha: A ou → passa para a próxima opção, ← volta.
    const steps = {};
    const choice = (key, label, desc, value, step) => {
      steps[key] = step;
      return h('button', { class: 'opt', 'data-focus': true, 'data-key': key, 'data-choice': key, onclick: () => step(1) },
        h('span', { class: 'txt' }, label, h('small', {}, desc)),
        h('span', { class: 'choice' }, h('i', {}, '◀'), h('span', { class: 'val' }, value), h('i', {}, '▶')));
    };
    const cycle = (list, value, delta) => list[(list.indexOf(value) + delta + list.length) % list.length];
    const themeRow = choice('theme', 'Tema', theme.desc, theme.label, stepTheme);

    // Modo sofá: o que fazer e depois de quanto tempo parado.
    const sofaKeys = Object.keys(SOFA_ACTIONS);
    const sofaAction = SOFA_ACTIONS[cfg.sofaAction] ? cfg.sofaAction : 'off';
    const sofaMinutes = SOFA_MINUTES.includes(cfg.sofaMinutes) ? cfg.sofaMinutes : 30;
    const sofaRows = [
      choice('sofaAction', 'Quando o Cartucho ficar parado', SOFA_ACTIONS[sofaAction].desc, SOFA_ACTIONS[sofaAction].label, (delta) => {
        ctx.sfx.tab();
        save({ sofaAction: cycle(sofaKeys, sofaAction, delta) });
      }),
      choice('sofaMinutes', 'Depois de', sofaAction === 'off' ? 'Escolha o que fazer na linha de cima' : `Sem mexer em nada por ${minutesText(sofaMinutes)}.${sofaAction === 'covers' ? '' : ' Antes, aparece uma contagem de 30 s'}`, minutesText(sofaMinutes), (delta) => {
        ctx.sfx.tab();
        save({ sofaMinutes: cycle(SOFA_MINUTES, sofaMinutes, delta) });
      }),
      h('div', { class: 'opt' }, h('span', { class: 'txt' }, 'Quando ele não age', h('small', {}, 'Com um jogo aberto, um download da Steam, uma gravação, ou com outro programa na frente'))),
    ];

    const steamStatus = !ctx.state.steamConfigured ? 'falta a chave ou o SteamID' : ctx.state.syncedAt ? `sincronizado ${when(ctx.state.syncedAt)}` : 'ainda não sincronizado';

    const list = h('div', { class: 'set-list' },
      section('console', 'Modo console'),
      toggle('openAtLogin', 'Abrir quando o Windows iniciar', 'O Cartucho abre sozinho, em tela cheia, ao ligar o PC'),
      toggle('returnAfterGame', 'Voltar para o Cartucho ao fechar um jogo'),
      toggle('guideOpens', 'Botão Xbox abre o Cartucho', 'Sair para o Windows deixa o Cartucho escondido perto do relógio; o botão Xbox traz de volta'),
      toggle('introAnim', 'Animação do cartucho ao abrir', 'O cartucho encaixa no console antes da tela de perfil'),
      toggle('showBoot', 'Mostrar a tela de abertura'),
      action('fullscreen', 'Tela cheia', 'Também funciona com F11', () => ctx.api.toggleFullscreen()),

      section('', 'Modo sofá'),
      ...sofaRows,

      section('', 'Aparência'),
      themeRow,

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
      // Sem nada escolhido, vale o launcher oficial que o Cartucho acha sozinho em %APPDATA%\Hytale.
      path('hytaleExe', 'Executável do Hytale', cfg.defaultHytaleExe ? `Automático: ${cfg.defaultHytaleExe}` : 'Não achei o launcher do Hytale. Escolha o .exe que abre o jogo', {
        filters: [{ name: 'Programas', extensions: ['exe'] }], fallback: cfg.defaultHytaleExe ? 'automático' : 'não encontrado',
      }),
      text('hytaleProcess', 'Nome do processo do jogo', 'Opcional. Usado para contar o tempo quando o .exe acima é só o launcher', { placeholder: 'HytaleClient.exe' }),

      section('', 'Outros jogos'),
      action('addgame', 'Adicionar jogo de fora da Steam', 'Qualquer jogo do PC: escolha da lista do menu Iniciar ou procure o .exe', () => { ctx.sfx.confirm(); ctx.go('addgame'); }),

      section('', 'Capas e músicas'),
      text('sgdbApiKey', 'Chave do SteamGridDB', 'Para buscar capas e fundos. Grátis em steamgriddb.com › Preferências › API. Fica guardada só neste PC.', {
        secret: true,
        placeholder: cfg.hasSgdbApiKey ? `•••••••• ${cfg.sgdbApiKeyHint}` : 'cole a chave aqui',
      }),

      section('', 'Capturas'),
      toggle('captureBuffer', 'Guardar os últimos 30 segundos enquanto joga', 'Grava em segundo plano pela placa de vídeo. Os arquivos vão para Imagens e Vídeos › Cartucho'),
      action('captureKeys', 'Atalhos durante o jogo', 'Xbox + Y print · Xbox + X últimos 30 s · Xbox + RB gravar · no teclado, Alt+Shift+P, G e R', () => {}),

      section('', 'Som'),
      toggle('sounds', 'Sons de navegação'),
      toggle('music', 'Música tema'),
      path('musicFile', 'Música personalizada', 'Opcional. Sem arquivo, toca a trilha do Cartucho', { filters: [{ name: 'Áudio', extensions: ['mp3', 'ogg', 'wav', 'flac', 'm4a'] }], fallback: 'trilha do Cartucho' }),
      volume,

      section('', 'Sobre'),
      h('div', { class: 'opt' }, h('span', { class: 'txt' }, `Cartucho ${cfg.appVersion || ''}`.trim(), h('small', {}, 'Use Q/E ou LB/RB para trocar de aba e M ou Start para o menu rápido'))),
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
        if (steps[focused.dataset.choice] && (act === 'left' || act === 'right')) {
          steps[focused.dataset.choice](act === 'right' ? 1 : -1);
          return true;
        }
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
