// Mods de uma instância do Minecraft: ver, atualizar, desativar e remover os instalados, e instalar novos do Modrinth.
// Y troca entre Instalados e Buscar. Nos instalados, A abre o mod e X atualiza tudo; na busca, A instala e X digita o nome.
import { h, keyPill, segBar } from '../lib/ui.js';

// O que já foi carregado, por instância: a tela redesenha (sincronização, downloads) sem perder a lista nem a busca.
const memo = new Map();

function mb(bytes) {
  const v = bytes / 1024 ** 2;
  return v >= 1 ? `${v.toFixed(1).replace('.', ',')} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function downloads(n) {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1).replace('.', ',')} mi downloads`;
  if (n >= 1e3) return `${Math.round(n / 1e3)} mil downloads`;
  return `${n} downloads`;
}

function icon(m) {
  const el = h('span', { class: 'mod-ico', style: { '--h': String([...m.name].reduce((s, c) => s + c.charCodeAt(0), 0) % 360) } }, m.icon ? null : m.name.slice(0, 1).toUpperCase());
  if (m.icon) el.style.backgroundImage = `url("${m.icon}")`;
  return el;
}

function message(title, text, ...extra) {
  return h('div', { class: 'empty search-empty' }, h('h2', {}, title), text ? h('p', {}, text) : null, ...extra);
}

export default {
  label: 'Mods',
  render(ctx, { key }) {
    const g = ctx.state.games.find((x) => x.key === key);
    if (!g) return { el: h('p', { class: 'muted', style: { marginTop: 'auto' } }, 'Esta instância não está mais na biblioteca.'), hints: [['back', 'Voltar']] };
    ctx.setBackground(g);
    // Voltando à tela depois de um tempo, lê a pasta de novo: os mods podem ter mudado pelo Prism.
    if (memo.has(key) && Date.now() - memo.get(key).at > 60000) memo.delete(key);
    if (!memo.has(key)) memo.set(key, { tab: 'installed', data: null, text: '', results: null, detail: null, confirmRemove: false, at: Date.now() });
    memo.get(key).at = Date.now();
    const m = memo.get(key);
    const id = g.instanceId;

    let alive = true;
    let busy = false;
    let hints = [];
    const body = h('div', { class: 'search-body' });
    const head = h('div', { class: 'lib-head search-head' });
    const bar = h('div', { class: 'search-bar' });
    const el = h('div', { class: 'search mods' }, head, bar, body);

    const setHints = (list) => {
      hints = list;
      const box = document.getElementById('hints');
      if (box && alive) box.replaceChildren(...ctx.hints(list));
    };
    const updates = () => (m.data && m.data.mods ? m.data.mods.filter((x) => x.update && x.enabled) : []);
    // O número de mods na página do jogo e na aba Minecraft acompanha o que mudou aqui.
    const syncCount = () => {
      if (m.data && m.data.mods) g.mods = m.data.mods.filter((x) => x.enabled).length;
    };

    function header() {
      const n = m.data && m.data.mods ? m.data.mods.length : null;
      const ups = updates().length;
      head.replaceChildren(...[
        h('div', { class: 'search-title' }, h('h2', {}, `Mods · ${g.title}`), h('small', {}, `Minecraft ${g.mcVersion || '?'} · ${g.loader} · Modrinth`)),
        m.tab === 'installed' && ups && !m.detail ? keyPill(ctx, 'x', `Atualizar tudo · ${ups}`, { class: 'warn', 'data-key': 'update-all', onclick: updateAll }) : null,
        m.tab === 'search' ? keyPill(ctx, 'x', m.text ? `Buscar · ${m.text}` : 'Digitar o nome', { 'data-key': 'term', onclick: askTerm }) : null,
      ].filter(Boolean));
      // Instalados e Buscar ficam na barra de baixo, como os filtros da Biblioteca (LT e RT trocam).
      bar.replaceChildren(segBar(ctx, [
        { key: 'tab:installed', label: 'Instalados', count: n, on: m.tab === 'installed', onclick: () => setTab('installed') },
        { key: 'tab:search', label: 'Buscar', on: m.tab === 'search', onclick: () => setTab('search') },
      ]));
    }

    function loading(text) {
      body.replaceChildren(h('p', { class: 'muted search-wait' }, text));
    }

    function failed(error, retry) {
      body.replaceChildren(message('Não deu certo', error,
        h('button', { class: 'btn', 'data-focus': true, 'data-autofocus': true, 'data-key': 'retry', onclick: retry }, 'Tentar de novo')));
      ctx.refocus('retry');
    }

    function setTab(tab) {
      if (tab === m.tab || busy) return;
      m.tab = tab;
      m.detail = null;
      ctx.sfx.tab();
      paint();
    }

    // ===== instalados =====

    async function loadInstalled(focusKey) {
      header();
      loading('Lendo os mods da instância e procurando atualizações…');
      setHints([['back', 'Voltar']]);
      const r = await ctx.api.modsList(id);
      if (!alive || m.tab !== 'installed') return;
      if (r.error) return failed(r.error, () => loadInstalled());
      m.data = r;
      syncCount();
      paintInstalled(focusKey);
    }

    function row(x) {
      const status = !x.enabled ? 'desativado' : x.update ? `${x.version} → ${x.update.number}` : x.version || (x.projectId ? '' : 'fora do Modrinth');
      return h('button', { class: `opt mod-row ${x.enabled ? '' : 'off'}`, 'data-focus': true, 'data-key': `mod:${x.file}`, onclick: () => openDetail(x) },
        icon(x),
        h('span', { class: 'txt' }, x.name, h('small', {}, status)),
        h('span', { class: `val ${x.update && x.enabled ? 'warn' : ''}` }, !x.enabled ? 'desativado' : x.update ? 'atualizar' : 'ok'));
    }

    function paintInstalled(focusKey) {
      header();
      const list = m.data.mods;
      if (!m.data.supported) {
        body.replaceChildren(message('Instância sem mods', `${g.title} é ${g.loader}. Para usar mods, a instância precisa de Fabric, Forge, NeoForge ou Quilt, e isso se troca no Prism (Editar › Versão).`));
        setHints([['back', 'Voltar']]);
        return ctx.refocus('tab:installed');
      }
      const notice = m.data.offline ? h('p', { class: 'muted mods-note' }, `${m.data.offline} Mostrando só os arquivos da pasta.`) : null;
      if (!list.length) {
        body.replaceChildren(message('Nenhum mod ainda', 'Aperte Y para buscar mods no Modrinth. O Cartucho só mostra os que servem nesta versão e neste loader, e já instala as dependências.'));
        setHints([['ltrt', 'Buscar mods'], ['back', 'Voltar']]);
        return ctx.refocus('tab:search');
      }
      // Atualizações primeiro, depois os ativos e por fim os desativados.
      const rank = (x) => (!x.enabled ? 2 : x.update ? 0 : 1);
      const sorted = [...list].sort((a, b) => rank(a) - rank(b));
      const rows = sorted.map(row);
      if (rows[0]) rows[0].setAttribute('data-autofocus', '');
      body.replaceChildren(...[notice, h('div', { class: 'set-list pick-list mod-list' }, rows)].filter(Boolean));
      setHints([['confirm', 'Abrir'], ...(updates().length ? [['x', 'Atualizar tudo']] : []), ['ltrt', 'Buscar mods'], ['back', 'Voltar']]);
      ctx.refocus(focusKey && body.querySelector(`[data-key="${CSS.escape(focusKey)}"]`) ? focusKey : `mod:${sorted[0].file}`);
    }

    function openDetail(x) {
      ctx.sfx.confirm();
      m.detail = x.file;
      m.confirmRemove = false;
      paintDetail();
    }

    function closeDetail() {
      const file = m.detail;
      m.detail = null;
      ctx.sfx.back();
      paintInstalled(`mod:${file}`);
    }

    function paintDetail(focusKey) {
      header();
      const x = m.data.mods.find((y) => y.file === m.detail);
      if (!x) {
        m.detail = null;
        return paintInstalled();
      }
      const info = [x.version && `Versão ${x.version}`, mb(x.size), x.file].filter(Boolean).join(' · ');
      const removeLabel = m.confirmRemove ? 'Aperte de novo para remover (vai para a Lixeira)' : 'Remover';
      body.replaceChildren(h('div', { class: 'mod-detail' },
        h('div', { class: 'mod-card' },
          icon(x),
          h('div', { style: { minWidth: 0 } },
            h('h3', {}, x.name),
            h('p', {}, x.description || (x.projectId ? '' : 'Este mod não está no Modrinth. Dá para ativar, desativar e remover, mas a atualização fica com você.')),
            h('small', { class: 'mono' }, info))),
        h('div', { class: 'menu-v' },
          x.update && x.enabled ? h('button', { class: 'btn primary', 'data-focus': true, 'data-key': 'd:update', onclick: () => updateOne(x) }, `Atualizar para ${x.update.number}`) : null,
          h('button', { class: 'btn', 'data-focus': true, 'data-key': 'd:toggle', onclick: () => toggle(x) }, x.enabled ? 'Desativar' : 'Ativar'),
          h('button', { class: `btn ${m.confirmRemove ? 'danger' : ''}`, 'data-focus': true, 'data-key': 'd:remove', onclick: () => remove(x) }, removeLabel),
          h('p', { class: 'muted mods-note' }, x.enabled ? 'Desativar deixa o arquivo na pasta, mas o jogo para de carregar o mod. É o mesmo que desmarcar no Prism.' : 'Este mod está desativado: o arquivo fica na pasta, mas o jogo não carrega.'))));
      setHints([['confirm', 'Selecionar'], ['back', 'Mods']]);
      ctx.refocus(focusKey || (x.update && x.enabled ? 'd:update' : 'd:toggle'));
    }

    async function run(text, fn) {
      if (busy) return null;
      busy = true;
      ctx.toast(text);
      const r = await fn().catch((err) => ({ error: err.message }));
      busy = false;
      if (r && r.error) {
        ctx.toast(r.error, { error: true });
        return null;
      }
      return r || {};
    }

    async function updateOne(x) {
      ctx.sfx.confirm();
      const r = await run(`Atualizando ${x.name}…`, () => ctx.api.modsUpdate(id, x.file));
      if (!r || !alive) return;
      ctx.toast(r.updated ? `${x.name} atualizado para ${r.version}.` : `${x.name} já está na versão mais nova.`);
      m.detail = null;
      loadInstalled();
    }

    async function updateAll() {
      const list = updates();
      if (!list.length || busy) return;
      ctx.sfx.confirm();
      busy = true;
      let done = 0;
      const failedNames = [];
      for (const x of list) {
        ctx.toast(`Atualizando ${done + 1} de ${list.length}: ${x.name}…`);
        const r = await ctx.api.modsUpdate(id, x.file).catch((err) => ({ error: err.message }));
        if (r && r.error) {
          failedNames.push(x.name);
          // Com o jogo aberto, nenhum vai dar certo: para logo.
          if (/Feche o Minecraft/.test(r.error)) {
            busy = false;
            return ctx.toast(r.error, { error: true });
          }
        } else done++;
      }
      busy = false;
      if (failedNames.length) ctx.toast(`${done} atualizados. Não consegui atualizar: ${failedNames.join(', ')}.`, { error: true });
      else ctx.toast(`${done} ${done === 1 ? 'mod atualizado' : 'mods atualizados'}. Vale na próxima vez que abrir a instância.`);
      if (alive && m.tab === 'installed') loadInstalled();
    }

    async function toggle(x) {
      const r = await run(x.enabled ? `Desativando ${x.name}…` : `Ativando ${x.name}…`, () => ctx.api.modsToggle(id, x.file));
      if (!r || !alive) return;
      ctx.sfx.tab();
      ctx.toast(r.enabled ? `${x.name} ativado.` : `${x.name} desativado. O arquivo continua na pasta.`);
      Object.assign(x, { file: r.file, enabled: r.enabled });
      m.detail = r.file;
      syncCount();
      paintDetail('d:toggle');
    }

    async function remove(x) {
      if (!m.confirmRemove) {
        m.confirmRemove = true;
        ctx.sfx.move();
        return paintDetail('d:remove');
      }
      const r = await run(`Removendo ${x.name}…`, () => ctx.api.modsRemove(id, x.file));
      if (!r || !alive) return;
      ctx.sfx.back();
      ctx.toast(`${x.name} foi para a Lixeira.`);
      m.data.mods = m.data.mods.filter((y) => y !== x);
      m.detail = null;
      syncCount();
      paintInstalled();
    }

    // ===== busca no Modrinth =====

    const askTerm = () => ctx.keyboard({
      title: 'Nome do mod',
      value: m.text,
      placeholder: 'Ex.: Sodium, JEI, Xaero',
      done: (raw) => {
        const value = raw.trim();
        if (value === m.text) return;
        m.text = value;
        m.results = null;
        loadSearch();
      },
    });

    const installedIds = () => new Set(m.data && m.data.mods ? m.data.mods.map((x) => x.projectId).filter(Boolean) : []);

    async function loadSearch(more = false) {
      header();
      if (!m.data) {
        // A busca marca o que já está instalado, então precisa da lista uma vez.
        const r = await ctx.api.modsList(id);
        if (!alive) return;
        if (!r.error) m.data = r;
      }
      if (m.data && !m.data.supported) {
        body.replaceChildren(message('Instância sem mods', `${g.title} é ${g.loader}. Troque o loader no Prism para Fabric, Forge, NeoForge ou Quilt antes de instalar mods.`));
        setHints([['ltrt', 'Instalados'], ['back', 'Voltar']]);
        return ctx.refocus('tab:search');
      }
      let focusKey = null;
      if (!m.results || more) {
        if (!more) loading(m.text ? `Procurando "${m.text}" no Modrinth…` : 'Carregando os mods mais baixados…');
        setHints([['back', 'Voltar']]);
        const offset = more ? m.results.items.length : 0;
        const r = await ctx.api.modsSearch(id, m.text, offset);
        if (!alive || m.tab !== 'search') return;
        if (r.error) return failed(r.error, () => loadSearch());
        m.results = more ? { ...r, items: [...m.results.items, ...r.items] } : r;
        // Depois de "Mostrar mais", a seleção vai para o primeiro mod que chegou.
        if (more && m.results.items[offset]) focusKey = `res:${m.results.items[offset].projectId}`;
      }
      paintSearch(focusKey);
    }

    function paintSearch(focusKey) {
      header();
      const { items, total } = m.results;
      const have = installedIds();
      const sub = m.text ? `${total} resultados para "${m.text}"` : `Os mais baixados para ${g.mcVersion} · ${g.loader}`;
      if (!items.length) {
        body.replaceChildren(message('Nada encontrado', `Nenhum mod com esse nome tem versão para Minecraft ${g.mcVersion} com ${g.loader}. Tente outro nome com X.`));
        setHints([['x', 'Buscar'], ['ltrt', 'Instalados'], ['back', 'Voltar']]);
        return ctx.refocus('term');
      }
      const rows = items.map((x, i) => {
        const on = have.has(x.projectId);
        return h('button', { class: `opt mod-row ${on ? 'have' : ''}`, 'data-focus': true, 'data-key': `res:${x.projectId}`, 'data-autofocus': i === 0, onclick: () => install(x) },
          icon(x),
          h('span', { class: 'txt' }, x.name, h('small', {}, x.description)),
          h('span', { class: 'val' }, on ? 'instalado' : downloads(x.downloads)));
      });
      if (items.length < total) rows.push(h('button', { class: 'opt more', 'data-focus': true, 'data-key': 'more', onclick: () => loadSearch(true) }, h('span', { class: 'txt' }, 'Mostrar mais')));
      body.replaceChildren(h('p', { class: 'muted mods-note' }, sub), h('div', { class: 'set-list pick-list mod-list' }, rows));
      setHints([['confirm', 'Instalar'], ['x', 'Buscar'], ['ltrt', 'Instalados'], ['back', 'Voltar']]);
      ctx.refocus(focusKey || `res:${items[0].projectId}`);
    }

    async function install(x) {
      if (installedIds().has(x.projectId)) return ctx.toast(`${x.name} já está nesta instância.`);
      ctx.sfx.confirm();
      const r = await run(`Instalando ${x.name}…`, () => ctx.api.modsInstall(id, x.projectId));
      if (!r || !alive) return;
      const deps = r.installed.filter((n) => n !== x.name);
      ctx.toast(deps.length ? `${x.name} instalado, junto com ${deps.join(', ')}.` : `${x.name} instalado.`);
      const list = await ctx.api.modsList(id);
      if (!alive) return;
      if (!list.error) {
        m.data = list;
        syncCount();
      }
      if (m.tab === 'search') paintSearch(`res:${x.projectId}`);
    }

    function paint() {
      if (m.tab === 'search') return loadSearch();
      if (!m.data) return loadInstalled();
      return m.detail ? paintDetail() : paintInstalled();
    }
    paint();

    return {
      el,
      keepBackground: true,
      get hints() { return hints; },
      onAction(action) {
        if (action === 'y' || action === 'lt' || action === 'rt') {
          setTab(m.tab === 'installed' ? 'search' : 'installed');
          return true;
        }
        if (action === 'x') {
          if (m.tab === 'search') askTerm();
          else if (!m.detail) updateAll();
          return true;
        }
        if (action === 'back' && m.detail) {
          closeDetail();
          return true;
        }
        if (action === 'back') memo.delete(key);
        return false;
      },
      destroy() {
        alive = false;
      },
    };
  },
};
