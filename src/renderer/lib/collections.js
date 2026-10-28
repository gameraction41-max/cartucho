// Coleções montadas pela pessoa. Ficam no config (collections: [{ id, name, keys }]) e qualquer mudança grava na hora.
export function collectionsOf(ctx) {
  return ctx.state.config.collections || [];
}

// Jogos da coleção, na ordem em que foram adicionados. Jogo que saiu da biblioteca some sozinho.
export function gamesIn(ctx, c) {
  const byKey = new Map(ctx.state.games.map((g) => [g.key, g]));
  return c.keys.map((k) => byKey.get(k)).filter(Boolean);
}

async function save(ctx, list) {
  const cfg = ctx.state.config;
  const next = await ctx.api.setConfig({ collections: list });
  await ctx.applyConfig({ ...cfg, collections: next.collections });
}

function newId(name) {
  const base = name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'colecao';
  return `${base}-${Date.now().toString(36)}`;
}

// Abre o teclado (ou pede o nome) e chama done(coleção) depois de gravar.
export function askName(ctx, { title, value = '', done }) {
  ctx.keyboard({
    title,
    value,
    placeholder: 'Ex.: Jogando agora',
    done: (raw) => {
      const name = raw.replace(/\s+/g, ' ').trim();
      if (name) done(name);
    },
  });
}

export async function createCollection(ctx, name, keys = []) {
  const c = { id: newId(name), name, keys };
  await save(ctx, [...collectionsOf(ctx), c]);
  return c;
}

export async function renameCollection(ctx, id, name) {
  await save(ctx, collectionsOf(ctx).map((c) => (c.id === id ? { ...c, name } : c)));
}

export async function removeCollection(ctx, id) {
  await save(ctx, collectionsOf(ctx).filter((c) => c.id !== id));
}

// Põe ou tira o jogo da coleção. Devolve true se ele ficou dentro.
export async function toggleGame(ctx, id, key) {
  let inside = false;
  await save(ctx, collectionsOf(ctx).map((c) => {
    if (c.id !== id) return c;
    inside = !c.keys.includes(key);
    return { ...c, keys: inside ? [...c.keys, key] : c.keys.filter((k) => k !== key) };
  }));
  return inside;
}
