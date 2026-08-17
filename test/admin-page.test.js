const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const PUBLICO = path.join(__dirname, '..', 'public');

// O jsdom nao vai buscar <script src="..."> a rede, e nao ha servidor a correr
// nos testes. Substituimos cada src local pelo conteudo do ficheiro, que e o
// que o browser acaba por executar de qualquer forma.
function inlineScripts(html) {
  return html.replace(/<script src="\/([^"]+)"><\/script>/g, (original, ficheiro) => {
    const caminho = path.join(PUBLICO, ficheiro);
    if (!fs.existsSync(caminho)) return original;
    return '<script>' + fs.readFileSync(caminho, 'utf8') + '</script>';
  });
}

const HTML = inlineScripts(fs.readFileSync(path.join(PUBLICO, 'admin.html'), 'utf8'));

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

test('os cartoes de pendentes usam as classes do sistema visual', async () => {
  const dom = await carregar();
  const el = dom.window.document.getElementById('tab-pendentes');
  assert.ok(el.querySelector('.card'), 'esperava um .card');
  assert.ok(el.querySelector('.tag-pend'), 'esperava a etiqueta de pendente');
  assert.ok(!/\sstyle="/.test(el.innerHTML), 'estilo inline no markup gerado');
  dom.window.close();
});

test('mostrarDetalhe escolhe painel ou modal conforme a largura', async () => {
  const dom = await carregar();
  const { window } = dom;
  // acima de 1280 o detalhe vai para o painel lateral
  window.matchMedia = q => ({ matches: /1280/.test(q), media: q, addListener(){}, removeListener(){} });
  window.mostrarDetalhe('<p id="prova">olá</p>');
  assert.ok(window.document.querySelector('#detail-panel #prova'), 'esperava o detalhe no painel');
  assert.ok(!window.document.getElementById('detail-overlay').classList.contains('open'));
  dom.window.close();
});

test('os renders de agenda, catalogo e estatisticas nao geram estilo inline', async () => {
  const dom = await carregar();
  for (const id of ['tab-agenda', 'tab-catalogo', 'tab-stats']) {
    const html = dom.window.document.getElementById(id).innerHTML;
    assert.ok(!/\sstyle="/.test(html), `estilo inline em ${id}`);
  }
  dom.window.close();
});

test('abaixo de 1280 o detalhe vai para o modal', async () => {
  const dom = await carregar();
  const { window } = dom;
  window.matchMedia = q => ({ matches: false, media: q, addListener(){}, removeListener(){} });
  window.mostrarDetalhe('<p id="prova">olá</p>');
  assert.ok(window.document.querySelector('#detail-overlay #prova'), 'esperava o detalhe no modal');
  assert.ok(window.document.getElementById('detail-overlay').classList.contains('open'));
  dom.window.close();
});
