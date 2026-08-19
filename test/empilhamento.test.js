const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const PUBLICO = path.join(__dirname, '..', 'public');
const HTML = fs.readFileSync(path.join(PUBLICO, 'admin.html'), 'utf8');
const CSS = ['tokens', 'base', 'components', 'admin']
  .map(f => fs.readFileSync(path.join(PUBLICO, 'css', f + '.css'), 'utf8'))
  .join('\n');

// Monta a página com o CSS embutido, para o jsdom poder calcular estilos.
function pagina() {
  const html = HTML.replace(/<link rel="stylesheet"[^>]*>/g, '')
    .replace('</head>', `<style>${CSS}</style></head>`);
  return new JSDOM(html, { pretendToBeVisual: true }).window;
}

function nivel(window, id) {
  const el = window.document.getElementById(id);
  if (!el) return null;
  return Number(window.getComputedStyle(el).zIndex);
}

test('todos os modais abrem por cima do detalhe do pedido', () => {
  // Isto já falhou duas vezes: a regra era uma lista de nomes, e cada modal
  // novo ficava de fora e abria por baixo do detalhe, inalcançável.
  const window = pagina();
  const detalhe = nivel(window, 'detail-overlay');
  assert.ok(Number.isFinite(detalhe), 'o detalhe tem de ter um nível definido');

  const overlays = [...window.document.querySelectorAll('.overlay')]
    .map(el => el.id)
    .filter(id => id && id !== 'detail-overlay');

  assert.ok(overlays.length >= 5, 'esperava vários modais para testar');

  for (const id of overlays) {
    const n = nivel(window, id);
    assert.ok(n > detalhe, `#${id} (${n}) tem de ficar acima do detalhe (${detalhe})`);
  }
});

test('o modal de pagamento em particular fica acima do detalhe', () => {
  const window = pagina();
  assert.ok(window.document.getElementById('pagamento-overlay'), 'o modal de pagamento tem de existir');
  assert.ok(nivel(window, 'pagamento-overlay') > nivel(window, 'detail-overlay'));
});

test('o toast fica acima de tudo, para os avisos nao ficarem tapados', () => {
  const window = pagina();
  const toast = Number(window.getComputedStyle(window.document.getElementById('toast')).zIndex);
  const overlays = [...window.document.querySelectorAll('.overlay')]
    .map(el => Number(window.getComputedStyle(el).zIndex))
    .filter(Number.isFinite);
  assert.ok(toast > Math.max(...overlays), 'o toast tem de estar acima dos modais');
});
