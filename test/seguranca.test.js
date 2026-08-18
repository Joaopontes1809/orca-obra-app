const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const { createApp } = require('../app');
const { stubPool, listen } = require('./helpers/harness');

const PUBLICO = path.join(__dirname, '..', 'public');
const HTML = fs.readFileSync(path.join(PUBLICO, 'admin.html'), 'utf8')
  .replace(/<script src="\/([^"]+)"><\/script>/g, (o, f) => {
    const p = path.join(PUBLICO, f);
    return fs.existsSync(p) ? '<script>' + fs.readFileSync(p, 'utf8') + '</script>' : o;
  });

const CARGA = '<img src=x onerror="window.__INVADIDO__ = true">';

const CONFIG = {
  catalogo: { services: [{ id: 's-piso', name: 'Pavimento', laborPercent: 90, unit: 'm²' }], materials: [] },
  empresa: { nome: 'Krona' }
};

function pedidoCom(itens) {
  return [{
    id: 1, created_at: new Date().toISOString(), nome_cliente: 'Cliente', morada: 'Rua X',
    telefone: '', tipo_servico: 'Pavimento', descricao: '', observacoes_cliente: '',
    status: 'pendente', extras: [], itens
  }];
}

function carregar(pedidos) {
  return new Promise(resolve => {
    const dom = new JSDOM(HTML, {
      runScripts: 'dangerously',
      url: 'http://localhost/',
      pretendToBeVisual: true,
      beforeParse(window) {
        window.matchMedia = q => ({ matches: true, media: q, addListener(){}, removeListener(){}, addEventListener(){}, removeEventListener(){} });
        window.fetch = async (url) => {
          const u = String(url);
          if (u === '/api/sessao') return { ok: true, json: async () => ({ autenticado: true, configurado: true }) };
          if (u === '/api/config') return { ok: true, json: async () => CONFIG };
          if (u === '/api/pedidos') return { ok: true, json: async () => pedidos };
          if (u === '/api/agenda') return { ok: true, json: async () => [] };
          return { ok: false, status: 404, json: async () => ({}) };
        };
      }
    });
    dom.window.addEventListener('load', () => setTimeout(() => resolve(dom), 100));
  });
}

test('HTML vindo de um pedido do cliente nao entra no painel', async () => {
  // O corpo de POST /api/pedidos e publico: quem tiver o link do formulario
  // controla `itens` por inteiro, e o painel desenha-o. Se `quantity` entrar
  // cru no innerHTML, temos XSS armazenado a correr no browser da equipa.
  const dom = await carregar(pedidoCom([{
    id: 'a', serviceId: 's-piso', desc: 'Piso', unit: 'm²',
    quantity: CARGA, unitPrice: 10, laborPercent: 50
  }]));
  const doc = dom.window.document;

  const cartao = doc.querySelector('#tab-pendentes .card');
  assert.ok(cartao, 'esperava o pedido na lista');
  cartao.click();
  await new Promise(r => setTimeout(r, 200));

  const alvo = doc.querySelector('#detail-panel');
  assert.ok(!alvo.querySelector('img'), 'nenhum elemento do cliente pode entrar no painel');
  assert.ok(!/onerror/i.test(alvo.innerHTML), 'nao pode sobrar um manipulador de eventos');
  assert.strictEqual(dom.window.__INVADIDO__, undefined, 'nada do cliente pode executar');
  dom.window.close();
});

test('laborPercent com HTML tambem nao passa', async () => {
  const dom = await carregar(pedidoCom([{
    id: 'a', serviceId: 's-piso', desc: 'Piso', unit: 'm²',
    quantity: 10, unitPrice: 10, laborPercent: CARGA
  }]));
  const doc = dom.window.document;
  const cartao = doc.querySelector('#tab-pendentes .card');
  cartao.click();
  await new Promise(r => setTimeout(r, 200));
  const alvo = doc.querySelector('#detail-panel');
  assert.ok(!alvo.querySelector('img'));
  assert.ok(!/onerror/i.test(alvo.innerHTML));
  dom.window.close();
});

test('o servidor reduz os itens do pedido publico ao tipo esperado', async () => {
  const pool = stubPool(() => ({ rows: [{ id: 1 }] }));
  const srv = await listen(createApp(pool));
  try {
    await fetch(`${srv.url}/api/pedidos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nome_cliente: 'Cliente', morada: 'Rua X',
        itens: [{ id: 'a', desc: 'Piso', unit: 'm²', quantity: CARGA, unitPrice: 'xpto', laborPercent: {} }]
      })
    });
    const insert = pool.calls.find(c => c.text.includes('INSERT INTO pedidos'));
    const guardados = JSON.parse(insert.values[8]);
    assert.strictEqual(guardados[0].quantity, 0, 'quantidade nao numerica tem de virar 0');
    assert.strictEqual(guardados[0].unitPrice, 0);
    assert.strictEqual(guardados[0].laborPercent, 0);
    assert.ok(!JSON.stringify(guardados).includes('onerror'), 'nada de HTML guardado');
  } finally { await srv.close(); }
});

test('o servidor corta textos muito longos e limita o numero de itens', async () => {
  const pool = stubPool(() => ({ rows: [{ id: 1 }] }));
  const srv = await listen(createApp(pool));
  try {
    await fetch(`${srv.url}/api/pedidos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nome_cliente: 'a'.repeat(5000), morada: 'Rua X',
        itens: Array.from({ length: 500 }, (_, i) => ({ id: String(i), quantity: 1 }))
      })
    });
    const insert = pool.calls.find(c => c.text.includes('INSERT INTO pedidos'));
    assert.ok(insert.values[0].length <= 120, 'o nome tem de ser cortado');
    assert.ok(JSON.parse(insert.values[8]).length <= 60, 'o numero de itens tem de ser limitado');
  } finally { await srv.close(); }
});

test('campos desconhecidos enviados pelo cliente nao sobrevivem', async () => {
  const pool = stubPool(() => ({ rows: [{ id: 1 }] }));
  const srv = await listen(createApp(pool));
  try {
    await fetch(`${srv.url}/api/pedidos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nome_cliente: 'Cliente', morada: 'Rua X',
        itens: [{ id: 'a', quantity: 1, __proto__: { poluido: true }, extraCampo: 'nao devia passar' }]
      })
    });
    const insert = pool.calls.find(c => c.text.includes('INSERT INTO pedidos'));
    const guardados = JSON.parse(insert.values[8]);
    assert.ok(!('extraCampo' in guardados[0]), 'so os campos conhecidos podem ser guardados');
  } finally { await srv.close(); }
});
