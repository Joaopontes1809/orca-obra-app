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
function carregar(falhar = [], sessao = { autenticado: true, configurado: true }) {
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
          // o painel so arranca depois de confirmar a sessao
          if (url === '/api/sessao') return { ok: true, json: async () => sessao };
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

function largo(window) {
  window.matchMedia = q => ({ matches: true, media: q, addListener(){}, removeListener(){} });
}

test('abrir e fechar um novo orcamento sem guardar nao contacta o servidor', async () => {
  const dom = await carregar();
  const { window } = dom;
  const document = window.document;
  largo(window);

  let manualPosts = 0;
  const fetchOriginal = window.fetch;
  window.fetch = async (url, opts) => {
    if (String(url) === '/api/pedidos/manual') manualPosts++;
    return fetchOriginal(url, opts);
  };

  document.getElementById('btn-novo-orcamento').click();
  assert.ok(document.getElementById('ed-nome'), 'esperava o formulario do novo orcamento aberto');
  assert.strictEqual(manualPosts, 0, 'abrir o painel do novo orcamento nao deve contactar o servidor');

  document.getElementById('ed-close').click();
  assert.strictEqual(manualPosts, 0, 'fechar sem guardar nao deve contactar o servidor');
  assert.ok(!document.getElementById('ed-nome'), 'o painel deve fechar');

  dom.window.close();
});

test('excluir um novo orcamento por guardar nao contacta o servidor', async () => {
  const dom = await carregar();
  const { window } = dom;
  const document = window.document;
  largo(window);

  let deleteCalls = 0;
  const fetchOriginal = window.fetch;
  window.fetch = async (url, opts) => {
    if (opts && opts.method === 'DELETE') deleteCalls++;
    return fetchOriginal(url, opts);
  };

  document.getElementById('btn-novo-orcamento').click();
  document.getElementById('ed-delete').click();
  assert.strictEqual(deleteCalls, 0, 'excluir um orcamento nao guardado nao deve contactar o servidor');
  assert.ok(!document.getElementById('ed-nome'), 'o painel deve fechar');

  dom.window.close();
});

test('guardar um novo orcamento faz POST uma vez; a segunda gravacao faz PATCH', async () => {
  const dom = await carregar();
  const { window } = dom;
  const document = window.document;
  largo(window);

  const calls = [];
  window.fetch = async (url, opts) => {
    const method = (opts && opts.method) || 'GET';
    calls.push({ url: String(url), method });
    if (String(url) === '/api/pedidos/manual' && method === 'POST') {
      return { ok: true, json: async () => ({ id: 42, nome_cliente: 'Rui Nunes', nome_orcamento: 'Telhado', itens: [], extras: [], status: 'confirmado' }) };
    }
    if (String(url) === '/api/pedidos/42' && method === 'PATCH') {
      return { ok: true, json: async () => ({ id: 42, nome_cliente: 'Rui Nunes', nome_orcamento: 'Telhado', itens: [], extras: [], status: 'confirmado' }) };
    }
    return { ok: false, status: 404, json: async () => ({}) };
  };

  document.getElementById('btn-novo-orcamento').click();
  document.getElementById('ed-cliente').value = 'Rui Nunes';
  document.getElementById('ed-nome').value = 'Telhado';
  document.getElementById('ed-save').click();
  await new Promise(r => setTimeout(r, 30));

  let postsManual = calls.filter(c => c.url === '/api/pedidos/manual' && c.method === 'POST');
  assert.strictEqual(postsManual.length, 1, 'a primeira gravacao deve fazer POST uma unica vez');

  const cartao = document.querySelector('#tab-confirmados .card[data-id="42"]');
  assert.ok(cartao, 'o orcamento guardado deve aparecer na lista com o id devolvido pelo servidor');
  cartao.click();
  document.getElementById('ed-save').click();
  await new Promise(r => setTimeout(r, 30));

  postsManual = calls.filter(c => c.url === '/api/pedidos/manual' && c.method === 'POST');
  const patches = calls.filter(c => c.url === '/api/pedidos/42' && c.method === 'PATCH');
  assert.strictEqual(postsManual.length, 1, 'a segunda gravacao nao deve repetir o POST');
  assert.strictEqual(patches.length, 1, 'a segunda gravacao deve fazer PATCH ao orcamento ja criado');
  assert.strictEqual(document.querySelectorAll('#tab-confirmados .card').length, 1, 'nao deve sobrar nenhum orcamento duplicado');

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
