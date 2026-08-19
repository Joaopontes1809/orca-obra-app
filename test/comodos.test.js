const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const { createApp, initDb } = require('../app');
const { stubPool, listen, fetchComSessao } = require('./helpers/harness');

const PUBLICO = path.join(__dirname, '..', 'public');
const HTML = fs.readFileSync(path.join(PUBLICO, 'pedido.html'), 'utf8')
  .replace(/<script src="\/([^"]+)"><\/script>/g, (o, f) => {
    const p = path.join(PUBLICO, f);
    return fs.existsSync(p) ? '<script>' + fs.readFileSync(p, 'utf8') + '</script>' : o;
  });

const CONFIG = {
  catalogo: {
    services: [{ id: 's-piso', name: 'Pavimento', laborPrice: 12, unit: 'm²' }],
    materials: [{ id: 'm-porc', name: 'Porcelânico', serviceId: 's-piso', unit: 'm²', price: 15 }]
  },
  empresa: { nome: 'Krona' }
};

function carregar() {
  return new Promise(resolve => {
    const dom = new JSDOM(HTML, {
      runScripts: 'dangerously',
      url: 'http://localhost/',
      pretendToBeVisual: true,
      beforeParse(window) {
        window.fetch = async (url) => {
          if (url === '/api/config') return { ok: true, json: async () => CONFIG };
          return { ok: false, status: 404, json: async () => ({}) };
        };
      }
    });
    dom.window.addEventListener('load', () => setTimeout(() => resolve(dom), 80));
  });
}

test('a caixa da IA saiu do formulario', async () => {
  const dom = await carregar();
  const d = dom.window.document;
  assert.strictEqual(d.getElementById('ai-texto'), null, 'a caixa de texto da IA tem de sair');
  assert.strictEqual(d.getElementById('btn-ai-analisar'), null, 'o botao da IA tem de sair');
  dom.window.close();
});

test('as divisoes aparecem como botoes escolhiveis', async () => {
  const dom = await carregar();
  const d = dom.window.document;
  const botoes = [...d.querySelectorAll('[data-comodo]')].map(b => b.textContent.trim());
  assert.ok(botoes.includes('Sala'), 'esperava Sala');
  assert.ok(botoes.includes('Cozinha'), 'esperava Cozinha');
  assert.ok(botoes.includes('Casa de banho'), 'esperava Casa de banho');
  assert.ok(botoes.includes('Outro'), 'esperava Outro');
  dom.window.close();
});

test('escolher e desescolher uma divisao', async () => {
  const dom = await carregar();
  const d = dom.window.document;
  const sala = () => d.querySelector('[data-comodo="Sala"]');

  sala().click();
  assert.ok(sala().classList.contains('escolhido'), 'devia ficar escolhida');
  assert.deepStrictEqual([...dom.window.comodosDoPedido()], ['Sala']);

  sala().click();
  assert.ok(!sala().classList.contains('escolhido'), 'devia deixar de estar escolhida');
  assert.deepStrictEqual([...dom.window.comodosDoPedido()], []);
  dom.window.close();
});

test('"Outro" abre um campo para escrever, e o que se escreve substitui a etiqueta', async () => {
  const dom = await carregar();
  const d = dom.window.document;
  const campo = d.getElementById('campo-outro-comodo');

  assert.ok(campo.classList.contains('hidden'), 'o campo comeca escondido');

  d.querySelector('[data-comodo="Cozinha"]').click();
  d.querySelector('[data-comodo="Outro"]').click();
  assert.ok(!campo.classList.contains('hidden'), 'escolher Outro tem de abrir o campo');

  d.getElementById('f-outro-comodo').value = 'Despensa';
  const enviados = [...dom.window.comodosDoPedido()];
  assert.ok(enviados.includes('Cozinha'));
  assert.ok(enviados.includes('Despensa'), 'o texto escrito substitui "Outro"');
  assert.ok(!enviados.includes('Outro'), '"Outro" nao pode seguir como etiqueta');
  dom.window.close();
});

test('desmarcar "Outro" limpa e esconde o campo', async () => {
  const dom = await carregar();
  const d = dom.window.document;

  d.querySelector('[data-comodo="Outro"]').click();
  d.getElementById('f-outro-comodo').value = 'Sótão';
  d.querySelector('[data-comodo="Outro"]').click();

  assert.ok(d.getElementById('campo-outro-comodo').classList.contains('hidden'));
  assert.strictEqual(d.getElementById('f-outro-comodo').value, '', 'o campo tem de ser limpo');
  assert.deepStrictEqual([...dom.window.comodosDoPedido()], []);
  dom.window.close();
});

test('"Outro" sem nada escrito nao envia uma divisao vazia', async () => {
  const dom = await carregar();
  const d = dom.window.document;
  d.querySelector('[data-comodo="Outro"]').click();
  assert.deepStrictEqual([...dom.window.comodosDoPedido()], [], 'nao pode enviar uma etiqueta vazia');
  dom.window.close();
});

/* ---------------- servidor ---------------- */

test('o servidor guarda as divisoes do pedido', async () => {
  const pool = stubPool(() => ({ rows: [{ id: 1 }] }));
  const srv = await listen(createApp(pool));
  try {
    await fetch(`${srv.url}/api/pedidos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nome_cliente: 'Cliente', morada: 'Rua X',
        comodos: ['Sala', 'Cozinha', 'Despensa']
      })
    });
    const insert = pool.calls.find(c => c.text.includes('INSERT INTO pedidos'));
    assert.match(insert.text, /comodos/);
    assert.deepStrictEqual(JSON.parse(insert.values[9]), ['Sala', 'Cozinha', 'Despensa']);
  } finally { await srv.close(); }
});

test('as divisoes tambem sao saneadas: sao publicas como o resto', async () => {
  const pool = stubPool(() => ({ rows: [{ id: 1 }] }));
  const srv = await listen(createApp(pool));
  try {
    await fetch(`${srv.url}/api/pedidos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nome_cliente: 'Cliente', morada: 'Rua X',
        comodos: ['Sala', '', '   ', 'x'.repeat(500), ...Array.from({ length: 50 }, (_, i) => 'div' + i)]
      })
    });
    const insert = pool.calls.find(c => c.text.includes('INSERT INTO pedidos'));
    const guardados = JSON.parse(insert.values[9]);
    assert.ok(guardados.length <= 20, 'o numero de divisoes tem de ser limitado');
    assert.ok(guardados.every(c => c.length <= 60), 'cada nome tem de ser cortado');
    assert.ok(!guardados.includes(''), 'nomes vazios nao entram');
  } finally { await srv.close(); }
});

test('initDb cria a coluna comodos de forma idempotente', async () => {
  const pool = stubPool(() => ({ rows: [{ ok: 1 }] }));
  await initDb(pool);
  const sql = pool.calls.map(c => c.text).join('\n');
  assert.match(sql, /ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS comodos JSONB/);
});
