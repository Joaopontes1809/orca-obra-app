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

module.exports = { stubPool, listen };
