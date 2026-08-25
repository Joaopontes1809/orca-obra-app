const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const FONTE = fs.readFileSync(path.join(__dirname, '..', 'public', 'sw.js'), 'utf8');

// O service worker corre num sítio que o Node não tem. Damos-lhe um `self` e
// um `caches` de mentira e ficamos com as funções para testar à parte.
function carregarSw() {
  const guardados = new Map();
  const caches = {
    async open() {
      return {
        async put(pedido, resposta) {
          guardados.set(typeof pedido === 'string' ? pedido : pedido.url, resposta);
        },
        async match(pedido) {
          return guardados.get(typeof pedido === 'string' ? pedido : pedido.url) || undefined;
        }
      };
    },
    async keys() { return []; },
    async delete() { return true; }
  };
  const self = {
    addEventListener() {},
    skipWaiting() {},
    clients: { claim() {} },
    location: { origin: 'https://exemplo.pt' }
  };
  // eslint-disable-next-line no-new-func
  const fabrica = new Function('self', 'caches', 'fetch', FONTE + '\nreturn { ehNosso, guardar, VERSAO };');
  return { api: fabrica(self, caches, globalThis.fetch), guardados };
}

function resposta(corpo, tipo, opcoes = {}) {
  const r = new Response(corpo, {
    status: opcoes.status || 200,
    headers: { 'Content-Type': tipo }
  });
  // as respostas nossas são 'basic'; o type é só de leitura, por isso força-se
  Object.defineProperty(r, 'type', { value: opcoes.type || 'basic' });
  return r;
}

const PAGINA_NOSSA = '<!DOCTYPE html><html lang="pt-PT"><head><meta charset="UTF-8">\n<meta name="krona-pagina" content="1"><title>Krona</title></head><body></body></html>';
const PAGINA_DO_ALOJAMENTO = '<html><head><title>Render - Application loading</title></head><body>SERVICE WAKING UP ...</body></html>';

test('reconhece uma pagina nossa', async () => {
  const { api } = carregarSw();
  assert.strictEqual(await api.ehNosso(resposta(PAGINA_NOSSA, 'text/html; charset=UTF-8')), true);
});

test('recusa a pagina de espera do alojamento', async () => {
  const { api } = carregarSw();
  assert.strictEqual(await api.ehNosso(resposta(PAGINA_DO_ALOJAMENTO, 'text/html; charset=UTF-8')), false);
});

test('a pagina de espera nao entra na copia guardada', async () => {
  // é o caso que interessa: com o servico a dormir, o alojamento responde 200
  // a tudo com a pagina dele. Se ela ficasse guardada, a app passava a abrir
  // sempre na pagina preta.
  const { api, guardados } = carregarSw();
  await api.guardar(new Request('https://exemplo.pt/pedido'), resposta(PAGINA_DO_ALOJAMENTO, 'text/html'));
  assert.strictEqual(guardados.size, 0);
});

test('a pagina de espera nao entra disfarcada de folha de estilo', async () => {
  const { api, guardados } = carregarSw();
  await api.guardar(new Request('https://exemplo.pt/css/base.css'), resposta(PAGINA_DO_ALOJAMENTO, 'text/html'));
  assert.strictEqual(guardados.size, 0);
});

test('guarda o que e mesmo nosso', async () => {
  const { api, guardados } = carregarSw();
  await api.guardar(new Request('https://exemplo.pt/pedido'), resposta(PAGINA_NOSSA, 'text/html'));
  await api.guardar(new Request('https://exemplo.pt/css/base.css'), resposta('body{}', 'text/css'));
  assert.strictEqual(guardados.size, 2);
});

test('nao guarda respostas de erro nem de outros sitios', async () => {
  const { api, guardados } = carregarSw();
  await api.guardar(new Request('https://exemplo.pt/pedido'), resposta(PAGINA_NOSSA, 'text/html', { status: 500 }));
  await api.guardar(new Request('https://outro.pt/x.css'), resposta('body{}', 'text/css', { type: 'cors' }));
  assert.strictEqual(guardados.size, 0);
});

test('as nossas paginas levam a marca que o service worker procura', () => {
  for (const ficheiro of ['admin.html', 'pedido.html', 'contrato.html']) {
    const html = fs.readFileSync(path.join(__dirname, '..', 'public', ficheiro), 'utf8');
    assert.match(html, /name="krona-pagina"/, ficheiro + ' sem a marca');
  }
});

test('os dados nunca sao guardados', () => {
  assert.match(FONTE, /pathname\.startsWith\('\/api\/'\)/);
});
