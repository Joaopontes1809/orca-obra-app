// O painel exige sessão, por isso os testes precisam de uma password definida
// antes de app.js e auth.js serem carregados.
process.env.ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'password-de-teste';

const auth = require('../../auth');

// Pool falso: guarda as queries recebidas e devolve o que o teste mandar.
// handler(text, values) devolve { rows: [...] } ou lança.
function stubPool(handler) {
  const calls = [];
  return {
    calls,
    async query(text, values) {
      calls.push({ text, values });
      const result = handler ? await handler(text, values) : null;
      return result || { rows: [] };
    }
  };
}

// Arranca a app numa porta livre e devolve { url, close }.
async function listen(app) {
  const server = app.listen(0);
  await new Promise(resolve => server.once('listening', resolve));
  const { port } = server.address();
  return {
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise(resolve => server.close(resolve))
  };
}

// Um fetch que leva sempre um cookie de sessão válido. Os testes das rotas do
// painel usam-no para não terem de fazer login em cada chamada; os testes de
// autenticação usam o fetch normal, porque precisam de controlar o cookie.
function fetchComSessao(url, opts = {}) {
  const headers = {
    ...(opts.headers || {}),
    cookie: auth.NOME_COOKIE + '=' + auth.criarSessao()
  };
  return globalThis.fetch(url, { ...opts, headers });
}

module.exports = { stubPool, listen, fetchComSessao };
