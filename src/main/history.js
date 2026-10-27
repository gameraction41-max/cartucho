// Tempo jogado por dia. A Steam e o Prism só informam o total de cada jogo, então o Cartucho guarda uma "foto"
// dos totais e, quando um total aumenta, soma a diferença no dia de hoje. Assim conta até o que foi jogado fora do Cartucho.
const KEEP_DAYS = 60;
const DAY = 24 * 3600 * 1000;

function dayKey(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Compara os totais atuais com a última foto. Jogo visto pela primeira vez só entra na foto, sem contar tempo.
// Devolve true quando algo mudou e precisa ser salvo.
function record(data, games, now = Date.now()) {
  data.snapshot = data.snapshot || {};
  data.days = data.days || {};
  let changed = false;
  const today = dayKey(now);
  for (const g of games) {
    const before = data.snapshot[g.key];
    const minutes = g.minutes || 0;
    if (before === minutes) continue;
    if (before != null && minutes > before) {
      const day = (data.days[today] = data.days[today] || {});
      day[g.key] = (day[g.key] || 0) + (minutes - before);
    }
    data.snapshot[g.key] = minutes;
    changed = true;
  }
  const oldest = dayKey(now - KEEP_DAYS * DAY);
  for (const k of Object.keys(data.days)) {
    if (k < oldest) {
      delete data.days[k];
      changed = true;
    }
  }
  return changed;
}

// Os últimos 7 dias (de 6 dias atrás até hoje), o total e os jogos mais jogados no período.
function week(data, now = Date.now()) {
  const days = [];
  const perGame = {};
  for (let i = 6; i >= 0; i--) {
    const ms = now - i * DAY;
    const entry = (data.days || {})[dayKey(ms)] || {};
    let minutes = 0;
    for (const [key, m] of Object.entries(entry)) {
      minutes += m;
      perGame[key] = (perGame[key] || 0) + m;
    }
    days.push({ date: dayKey(ms), weekday: new Date(ms).getDay(), minutes });
  }
  const top = Object.entries(perGame).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([key, minutes]) => ({ key, minutes }));
  const since = Object.keys(data.days || {}).sort()[0] || null;
  return { days, total: days.reduce((s, d) => s + d.minutes, 0), top, trackingSince: since || (data.snapshot && Object.keys(data.snapshot).length ? dayKey(now) : null) };
}

module.exports = { record, week, dayKey };
