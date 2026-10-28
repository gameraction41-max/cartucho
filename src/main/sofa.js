// Modo sofá: com o Cartucho parado na frente por um tempo, mostra as capas dos jogos, desliga a tela, suspende ou desliga o PC.
// Antes de desligar algo, a interface mostra uma contagem; qualquer botão do controle, tecla ou mexida no mouse cancela.
// As capas entram direto, sem contagem, e saem com qualquer botão.
// Nunca age com um jogo aberto, um download da Steam andando, uma gravação, ou com outro programa na frente.

const ACTIONS = ['off', 'covers', 'screen', 'sleep', 'shutdown'];
// Ações que não desligam nada e duram até alguém mexer: entram sem contagem.
const RESTS = ['covers'];
const MINUTES = [5, 10, 15, 20, 30, 45, 60, 90, 120];
const WARN_MS = 30 * 1000;
const TICK_MS = 1000;

function normalize({ action, minutes } = {}) {
  return {
    action: ACTIONS.includes(action) ? action : 'off',
    minutes: MINUTES.includes(minutes) ? minutes : 30,
  };
}

// settings() → { action, minutes }; busy() → motivo para não agir (ou null); inFront() → o Cartucho está na frente;
// systemIdleMs() → tempo sem teclado e mouse no Windows (o controle não conta lá, por isso activity()).
// onWarn({ action, seconds }), onCancel(), onRest(modo ou null) avisam a interface; act(action) faz a ação.
// Modo de descanso: 'covers' (capas na tela) ou 'screen' (tela desligada), até alguém mexer.
function createSofa({ settings, busy, inFront, systemIdleMs = () => Infinity, onWarn, onCancel, onRest, act, now = Date.now }) {
  let lastActivity = now();
  let warning = null; // { action, until }
  let resting = null;

  const cancel = () => {
    if (!warning) return;
    warning = null;
    onCancel();
  };

  const idleMs = () => Math.min(systemIdleMs(), now() - lastActivity);

  function tick() {
    const { action, minutes } = normalize(settings());
    if (action === 'off' || busy() || !inFront()) {
      lastActivity = now();
      return cancel();
    }
    // Teclado ou mouse mexeram desde a última volta: o Windows zera o tempo parado dele.
    if (systemIdleMs() < now() - lastActivity) activity();
    if (resting) return;
    if (warning) {
      if (warning.action !== action) return cancel();
      if (now() < warning.until) return;
      warning = null;
      onCancel();
      if (action === 'screen') {
        resting = 'screen';
        onRest('screen');
      }
      act(action);
      return;
    }
    if (idleMs() >= minutes * 60 * 1000 && RESTS.includes(action)) {
      resting = action;
      onRest(action);
    } else if (idleMs() >= minutes * 60 * 1000) {
      warning = { action, until: now() + WARN_MS };
      onWarn({ action, seconds: WARN_MS / 1000 });
    }
  }

  // Qualquer uso do controle, teclado ou mouse. Com a tela desligada, liga de volta; com as capas, volta para o Cartucho.
  function activity() {
    lastActivity = now();
    cancel();
    if (!resting) return;
    if (resting === 'screen') act('wake');
    resting = null;
    onRest(null);
  }

  // Voltando da suspensão o relógio começa de novo.
  function resumed() {
    lastActivity = now();
    warning = null;
    if (resting) onRest(null);
    resting = null;
  }

  return { tick, activity, resumed, get warning() { return warning; }, get resting() { return resting; } };
}

function start(opts) {
  const sofa = createSofa(opts);
  const timer = setInterval(sofa.tick, TICK_MS);
  return { ...sofa, stop: () => clearInterval(timer) };
}

module.exports = { ACTIONS, MINUTES, WARN_MS, normalize, createSofa, start };
