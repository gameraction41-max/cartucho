// Coleções montadas pela pessoa ("Jogando agora", "Para zerar"…). Ficam no config.json como uma lista simples.
const NAME_MAX = 32;
const LIMIT = 30;

const DEFAULT_COLLECTIONS = [
  { id: 'jogando', name: 'Jogando agora', keys: [] },
  { id: 'zerar', name: 'Para zerar', keys: [] },
];

// Limpa o que vem da interface: nome sem espaços sobrando, ids únicos e nenhum jogo repetido.
function sanitize(list) {
  if (!Array.isArray(list)) return [];
  const ids = new Set();
  const out = [];
  for (const c of list) {
    if (!c || typeof c !== 'object') continue;
    const name = String(c.name || '').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX);
    const id = String(c.id || '').trim();
    if (!name || !id || ids.has(id)) continue;
    ids.add(id);
    const keys = [...new Set((Array.isArray(c.keys) ? c.keys : []).filter((k) => typeof k === 'string' && k))];
    out.push({ id, name, keys });
    if (out.length >= LIMIT) break;
  }
  return out;
}

module.exports = { sanitize, DEFAULT_COLLECTIONS, NAME_MAX };
