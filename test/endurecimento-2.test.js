const test = require('node:test');
const assert = require('node:assert');

const { createApp } = require('../app');
const { stubPool, listen, fetchComSessao } = require('./helpers/harness');

const jsonPost = (url, corpo, cabecalhos = {}) => globalThis.fetch(url, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', ...cabecalhos },
  body: typeof corpo === 'string' ? corpo : JSON.stringify(corpo)
});

test('a IA publica tem travao: quem tiver o link nao pode gastar a conta', async () => {
  // sem GEMINI_API_KEY a rota responde 503, o que serve na mesma para contar
  // as chamadas — o que se testa e o travao, nao a IA
  const pool = stubPool(() => ({ rows: [] }));
  const srv = await listen(createApp(pool));
  try {
    let ultima = 0;
    for (let i = 0; i < 25; i++) {
      const r = await jsonPost(`${srv.url}/api/ai/parse-request`, { texto: 'pintar a sala' });
      ultima = r.status;
      if (ultima === 429) break;
    }
    assert.strictEqual(ultima, 429, 'a rota da IA ficou sem travao nenhum');
  } finally { await srv.close(); }
});

test('a pesquisa de precos tambem tem travao', async () => {
  const pool = stubPool(() => ({ rows: [] }));
  const srv = await listen(createApp(pool));
  try {
    let ultima = 0;
    for (let i = 0; i < 35; i++) {
      const r = await globalThis.fetch(`${srv.url}/api/pesquisar-preco?q=tinta`);
      ultima = r.status;
      if (ultima === 429) break;
    }
    assert.strictEqual(ultima, 429);
  } finally { await srv.close(); }
});

test('ler o contrato tem travao, para nao se martelar a base de dados', async () => {
  const pool = stubPool(() => ({ rows: [] }));
  const srv = await listen(createApp(pool));
  try {
    let ultima = 0;
    for (let i = 0; i < 70; i++) {
      const r = await globalThis.fetch(`${srv.url}/api/contrato/seja-o-que-for`);
      ultima = r.status;
      if (ultima === 429) break;
    }
    assert.strictEqual(ultima, 429);
  } finally { await srv.close(); }
});

test('um corpo enorme e recusado com uma resposta em JSON', async () => {
  const pool = stubPool(() => ({ rows: [] }));
  const srv = await listen(createApp(pool));
  try {
    const gigante = JSON.stringify({ nome_cliente: 'a'.repeat(400 * 1024), morada: 'x' });
    const r = await jsonPost(`${srv.url}/api/pedidos`, gigante);
    assert.strictEqual(r.status, 413);
    const corpo = await r.json();
    assert.strictEqual(corpo.error, 'pedido demasiado grande');
  } finally { await srv.close(); }
});

test('uma assinatura de 150 kB passa pelo limite do corpo', async () => {
  // o canvas de um telemovel com ecra bom faz PNGs grandes; se o limite do
  // corpo fosse o do express (100 kB), assinar falhava sem explicacao
  const pool = stubPool(text => {
    if (text.includes('SELECT id, itens, contrato')) return { rows: [{ id: 1, itens: [], contrato: null }] };
    return { rows: [] };
  });
  const srv = await listen(createApp(pool));
  try {
    const assinatura = 'data:image/png;base64,' + 'A'.repeat(150 * 1024);
    const r = await jsonPost(`${srv.url}/api/contrato/abc/assinar`, { nome: 'Ana', assinatura });
    assert.notStrictEqual(r.status, 413, 'o corpo foi cortado antes de a app o ver');
    assert.strictEqual(r.status, 200);
  } finally { await srv.close(); }
});

test('um JSON estragado nao devolve o rasto do erro', async () => {
  const pool = stubPool(() => ({ rows: [] }));
  const srv = await listen(createApp(pool));
  try {
    const r = await jsonPost(`${srv.url}/api/pedidos`, '{isto nao e json');
    assert.strictEqual(r.status, 400);
    const texto = await r.text();
    assert.strictEqual(JSON.parse(texto).error, 'pedido mal formado');
    assert.ok(!/at |\.js:\d+/.test(texto), 'a resposta leva rasto da pilha');
  } finally { await srv.close(); }
});

test('uma rota de api que nao existe responde em JSON, nao em HTML', async () => {
  const pool = stubPool(() => ({ rows: [] }));
  const srv = await listen(createApp(pool));
  try {
    const r = await fetchComSessao(`${srv.url}/api/nao-existe`);
    assert.strictEqual(r.status, 404);
    assert.match(r.headers.get('content-type') || '', /application\/json/);
  } finally { await srv.close(); }
});

test('nao se anuncia a framework nos cabecalhos', async () => {
  const pool = stubPool(() => ({ rows: [] }));
  const srv = await listen(createApp(pool));
  try {
    const r = await globalThis.fetch(`${srv.url}/pedido`);
    assert.strictEqual(r.headers.get('x-powered-by'), null);
  } finally { await srv.close(); }
});

test('a lista de servicos que vai no prompt da IA e cortada', async () => {
  const { createApp: _ } = require('../app');
  const fonte = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'app.js'), 'utf8');
  assert.match(fonte, /function listaDeServicos/);
  assert.match(fonte, /valor\.slice\(0, 60\)/);
  // e o texto livre do cliente tambem
  assert.match(fonte, /texto\(req\.body && req\.body\.texto, 2000\)/);
});
