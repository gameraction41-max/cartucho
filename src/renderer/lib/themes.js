// Temas visuais. Cada um é um bloco [data-theme] em themes.css; o padrão (Cartucho) é o styles.css.
export const THEMES = [
  { id: 'cartucho', label: 'Cartucho', desc: 'O visual de sempre, com o laranja do Cartucho' },
  { id: 'ps5', label: 'PS5', desc: 'Arte do jogo em tela cheia, ícones no topo e menu rápido embaixo' },
  { id: 'bigpicture', label: 'Big Picture', desc: 'Prateleiras de capas e barra de botões no rodapé, como o Steam' },
];

export function themeOf(cfg) {
  return THEMES.find((t) => t.id === (cfg && cfg.theme)) || THEMES[0];
}

export function applyTheme(cfg) {
  document.documentElement.dataset.theme = themeOf(cfg).id;
}
