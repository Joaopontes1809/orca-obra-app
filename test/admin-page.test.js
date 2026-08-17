const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const HTML = fs.readFileSync(path.join(__dirname, '..', 'public', 'admin.html'), 'utf8');

const CONFIG = {
  catalogo: {
    services: [{ id: 's-piso', name: 'Pavimento', laborPercent: 90, unit: 'm²' }],
    materials: [{ id: 'm-porc', name: 'Porcelânico', serviceId: 's-piso', unit: 'm²', price: 15 }]
  },
  empresa: { nome: 'Sua Construtora' }
};
const PEDIDOS = [{
  id: 1, created_at: new Date().toISOString(), nome_cliente: 'Ana Ferreira',
  morada: 'Rua das Flores 12', telefone: '912345678', tipo_servico: 'Pavimento',
  descricao: '', observacoes_cliente: '', status: 'pendente',
  itens: [{ id: 'a', serviceId: 's-piso', materialId: 'm-porc', desc: 'Porcelânico', quantity: 22, unit: 'm²', unitPrice: 15, laborPercent: 90 }],
  extras: []
}];

// Carrega a pagina com um fetch controlado. `falhar` e uma lista de caminhos
// que devem responder 404.
function carregar(falhar = []) {
  return new Promise(resolve => {
    const dom = new JSDOM(HTML, {
      runScripts: 'dangerously',
      url: 'http://localhost/',
      pretendToBeVisual: true,
      beforeParse(window) {
        window.fetch = async (url) => {
          if (falhar.some(f => String(url).startsWith(f))) {
            return { ok: false, status: 404, json: async () => ({ error: 'nao existe' }) };
          }
          if (url === '/api/config') return { ok: true, json: async () => CONFIG };
          if (url === '/api/pedidos') return { ok: true, json: async () => PEDIDOS };
          if (url === '/api/agenda') return { ok: true, json: async () => [] };
          return { ok: false, status: 404, json: async () => ({}) };
        };
      }
    });
    dom.window.addEventListener('load', () => setTimeout(() => resolve(dom), 60));
  });
}

test('o painel carrega os pedidos quando todas as rotas respondem', async () => {
  const dom = await carregar();
  const html = dom.window.document.getElementById('tab-pendentes').innerHTML;
  assert.match(html, /Ana Ferreira/);
  dom.window.close();
});

test('uma rota em falha nao deixa o painel em branco', async () => {
  // era isto que acontecia em producao: /api/agenda dava 404 e o
  // Promise.all rejeitava, por isso renderAll() nunca corria.
  const dom = await carregar(['/api/agenda']);
  const html = dom.window.document.getElementById('tab-pendentes').innerHTML;
  assert.match(html, /Ana Ferreira/, 'os pedidos tem de aparecer mesmo com a agenda em baixo');
  dom.window.close();
});

test('a agenda mostra o estado vazio quando a sua rota falha', async () => {
  const dom = await carregar(['/api/agenda']);
  // #tab-agenda tem sempre o <h2> estatico, por isso nao serve de prova.
  // #agenda-view e escrito por renderAgenda(), que so corre se renderAll() correr.
  const html = dom.window.document.getElementById('agenda-view').innerHTML;
  assert.match(html, /Sem eventos agendados/, 'renderAgenda() tem de correr mesmo com a rota em baixo');
  dom.window.close();
});
