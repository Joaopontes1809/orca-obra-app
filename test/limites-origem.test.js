const test = require('node:test');
const assert = require('node:assert');

const { createApp } = require('../app');
const { stubPool, listen } = require('./helpers/harness');

// Em produção há dois intermediários à frente da app: a Cloudflare que serve
// o Render, e um proxy interno do Render cujo endereço muda de pedido para
// pedido. O travão contava por esse endereço interno, por isso cada pedido
// abria um contador novo e nunca travava nada. Estes testes prendem o
// comportamento certo: contar por cliente, pelo cf-connecting-ip.
function pedir(url, ip, interno) {
  return globalThis.fetch(url, {
    headers: {
      'cf-connecting-ip': ip,
      // é este que mudava a cada pedido em produção
      'x-forwarded-for': `${ip}, 172.70.246.123, ${interno}`
    }
  });
}

test('o travao conta por cliente, mesmo com o proxy interno a mudar', async () => {
  const pool = stubPool(() => ({ rows: [] }));
  const srv = await listen(createApp(pool));
  try {
    let ultima = 0;
    for (let i = 0; i < 70; i++) {
      // proxy interno diferente em cada pedido, como acontece no Render
      const r = await pedir(`${srv.url}/api/contrato/x${i}`, '188.83.114.11', `10.197.67.${i % 250}`);
      ultima = r.status;
      if (ultima === 429) break;
    }
    assert.strictEqual(ultima, 429, 'o travao voltou a contar pelo proxy em vez do cliente');
  } finally { await srv.close(); }
});

test('travar um cliente nao trava os outros', async () => {
  const pool = stubPool(() => ({ rows: [] }));
  const srv = await listen(createApp(pool));
  try {
    let bloqueado = 0;
    for (let i = 0; i < 70; i++) {
      const r = await pedir(`${srv.url}/api/contrato/y${i}`, '10.0.0.1', '10.197.67.5');
      bloqueado = r.status;
      if (bloqueado === 429) break;
    }
    assert.strictEqual(bloqueado, 429);

    const outro = await pedir(`${srv.url}/api/contrato/z`, '10.0.0.2', '10.197.67.5');
    assert.notStrictEqual(outro.status, 429, 'um cliente travado estava a travar toda a gente');
  } finally { await srv.close(); }
});

test('um cf-connecting-ip inventado nao envenena a chave', async () => {
  const pool = stubPool(() => ({ rows: [] }));
  const srv = await listen(createApp(pool));
  try {
    const r = await globalThis.fetch(`${srv.url}/api/contrato/w`, {
      headers: { 'cf-connecting-ip': '<script>'.repeat(500) }
    });
    // valor recusado: cai para o endereço da ligação e a app responde na mesma
    assert.ok(r.status === 404 || r.status === 429);
  } finally { await srv.close(); }
});

test('o diagnostico temporario saiu do codigo', () => {
  const fonte = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'limites.js'), 'utf8');
  assert.ok(!fonte.includes('DIAGNOSTICO_LIMITES'), 'ficou registo de diagnostico ligado por variavel');
  assert.ok(!fonte.includes('console.log'), 'ficou um console.log no travao');
});
