// Dentro do Electron usa a ponte do preload. Aberto direto no navegador, usa dados de exemplo para dar para ver a interface.
export const api = window.cartucho || (await import('./mock.js')).mock;
export const isDemo = !window.cartucho;
