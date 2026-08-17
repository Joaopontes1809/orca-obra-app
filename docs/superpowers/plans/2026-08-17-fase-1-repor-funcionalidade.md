# Fase 1 — Repor funcionalidade e publicar

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pôr a aplicação a funcionar de verdade em produção — agenda com backend, custos extras persistidos, painel que não fica em branco quando uma rota falha — mantendo o desenho atual.

**Architecture:** O `server.js` é dividido em dois: `app.js` exporta `createApp(pool)` e `initDb(pool)`, e `server.js` fica apenas com o arranque (construir o Pool real, correr `initDb`, `listen`). Esta separação existe para os testes poderem injetar um pool falso e exercitar as rotas sem uma base de dados a correr. As rotas em si não mudam de comportamento nesta divisão.

**Tech Stack:** Node 24, Express 4, Postgres 16 via `pg`, `node:test` (incluído no Node, sem dependência nova), `jsdom` como devDependency para os testes de página.

**Spec:** `docs/superpowers/specs/2026-08-17-redesign-responsivo-design.md`

## Global Constraints

- Português de Portugal em todo o texto visível ao utilizador e nas mensagens de erro da API.
- Nenhuma alteração de aspeto nesta fase. O CSS e a estrutura visual do `admin.html` e do `pedido.html` ficam como estão.
- Toda a alteração de esquema em `initDb()` é idempotente (`CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`) — corre contra uma base de dados que já tem dados reais.
- O frontend lê `pedidoId` em camelCase e `data` como texto `YYYY-MM-DD`. As leituras da tabela `agenda` usam sempre `pedido_id AS "pedidoId"` e `to_char(data, 'YYYY-MM-DD') AS data`.
- Nenhuma dependência de produção nova. `jsdom` entra apenas em `devDependencies`.
- O `push` para `main` dispara deploy automático no Render. Não é executado sem aprovação explícita do utilizador (Task 8).

---

### Task 1: Separar `app.js` do `server.js` e montar os testes

Refactor puro: o comportamento das rotas não muda. O objetivo é tornar as rotas testáveis com um pool falso.

**Files:**
- Create: `app.js`
- Create: `test/helpers/harness.js`
- Create: `test/app.test.js`
- Modify: `server.js` (passa de 307 linhas para o arranque apenas)
- Modify: `package.json` (script `test`, devDependency `jsdom`)

**Interfaces:**
- Produces: `createApp(pool)` — recebe um objeto com método `query(text, values)` e devolve a app Express. `initDb(pool)` — cria tabelas e colunas, devolve Promise. `stubPool(handler)` e `listen(app)` em `test/helpers/harness.js`, usados por todos os ficheiros de teste das tarefas seguintes.
- Consumes: nada.

- [ ] **Step 1: Escrever o teste que falha**

Criar `test/helpers/harness.js`:

```js
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
```

Criar `test/app.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert');
const { createApp } = require('../app');
const { stubPool, listen } = require('./helpers/harness');

test('GET /api/config devolve as chaves de configuração', async () => {
  const pool = stubPool(() => ({
    rows: [
      { key: 'catalogo', value: { services: [], materials: [] } },
      { key: 'empresa', value: { nome: 'Sua Construtora' } }
    ]
  }));
  const srv = await listen(createApp(pool));
  try {
    const r = await fetch(`${srv.url}/api/config`);
    assert.strictEqual(r.status, 200);
    const body = await r.json();
    assert.deepStrictEqual(body.empresa, { nome: 'Sua Construtora' });
    assert.ok(body.catalogo);
  } finally {
    await srv.close();
  }
});

test('GET /api/pedidos devolve a lista', async () => {
  const pool = stubPool(() => ({ rows: [{ id: 1, nome_cliente: 'Ana Ferreira' }] }));
  const srv = await listen(createApp(pool));
  try {
    const r = await fetch(`${srv.url}/api/pedidos`);
    assert.strictEqual(r.status, 200);
    const body = await r.json();
    assert.strictEqual(body.length, 1);
    assert.strictEqual(body[0].nome_cliente, 'Ana Ferreira');
  } finally {
    await srv.close();
  }
});
```

- [ ] **Step 2: Correr o teste e confirmar que falha**

Acrescentar primeiro o script a `package.json`:

```json
"scripts": { "start": "node server.js", "test": "node --test test/" },
"devDependencies": { "jsdom": "^30.0.0" }
```

Run: `npm test`
Expected: FAIL com `Cannot find module '../app'`

- [ ] **Step 3: Criar `app.js`**

Mover para `app.js` todo o conteúdo de `server.js` **exceto** a construção do `Pool` e o `app.listen`. A estrutura fica:

```js
const express = require('express');
const path = require('path');

const DEFAULT_CATALOG = { /* copiar tal e qual de server.js linhas 15-34 */ };

async function initDb(pool) {
  // copiar tal e qual o corpo de initDb de server.js linhas 37-71,
  // trocando as chamadas `pool.query` para usarem o parâmetro `pool`
}

function createApp(pool) {
  const app = express();
  app.use(express.json());
  app.use(express.static(path.join(__dirname, 'public')));

  // copiar todas as rotas de server.js linhas 77-297 tal e qual.
  // As rotas já usam `pool.query`, que agora resolve para o parâmetro.
  // As rotas de página usam __dirname, que continua a ser a raiz do projeto.

  return app;
}

module.exports = { createApp, initDb, DEFAULT_CATALOG };
```

Substituir `server.js` inteiro por:

```js
const { Pool } = require('pg');
const { createApp, initDb } = require('./app');

const port = process.env.PORT || 3000;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && !process.env.DATABASE_URL.includes('localhost')
    ? { rejectUnauthorized: false }
    : false
});

initDb(pool)
  .then(() => {
    createApp(pool).listen(port, () => console.log('Orça Obra a correr na porta ' + port));
  })
  .catch(e => {
    console.error('Erro ao iniciar base de dados', e);
    process.exit(1);
  });
```

- [ ] **Step 4: Correr os testes e confirmar que passam**

Run: `npm test`
Expected: PASS, 2 testes

- [ ] **Step 5: Confirmar que nada se perdeu no refactor**

Run: `node -e "const {createApp}=require('./app'); const a=createApp({query:async()=>({rows:[]})}); const rotas=a._router.stack.filter(l=>l.route).map(l=>Object.keys(l.route.methods)[0].toUpperCase()+' '+l.route.path); console.log(rotas.join('\n')); console.log('total:', rotas.length);"`

Expected: 12 rotas listadas — as mesmas que existiam em `server.js`:
`GET /api/config`, `PUT /api/config/:key`, `GET /api/pedidos`, `POST /api/pedidos`, `POST /api/pedidos/manual`, `PATCH /api/pedidos/:id`, `DELETE /api/pedidos/:id`, `GET /pedido`, `GET /`, `POST /api/ai/parse-request`, `POST /api/ai/assist-admin`, `GET /api/pesquisar-preco`

- [ ] **Step 6: Commit**

```bash
git add app.js server.js package.json test/
git commit -m "refactor: separar createApp(pool) do arranque do servidor

Permite testar as rotas com um pool falso, sem base de dados a correr.
Comportamento das rotas inalterado."
```

---

### Task 2: Persistir os custos extras

**Files:**
- Modify: `app.js` (lista `allowed` do PATCH de pedidos, e `initDb`)
- Modify: `test/app.test.js`

**Interfaces:**
- Consumes: `createApp(pool)`, `initDb(pool)`, `stubPool` da Task 1.
- Produces: a coluna `pedidos.extras` (JSONB, default `'[]'`) e a aceitação do campo `extras` no `PATCH /api/pedidos/:id`.

- [ ] **Step 1: Escrever os testes que falham**

Acrescentar a `test/app.test.js`:

```js
test('PATCH /api/pedidos/:id grava os custos extras', async () => {
  const extras = [{ id: 'e1', nome: 'Ajudante — 2 dias', tipo: 'mao_de_obra', valor: 120 }];
  const pool = stubPool(() => ({ rows: [{ id: 3, extras }] }));
  const srv = await listen(createApp(pool));
  try {
    const r = await fetch(`${srv.url}/api/pedidos/3`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ extras })
    });
    assert.strictEqual(r.status, 200);
    const update = pool.calls.find(c => c.text.includes('UPDATE pedidos'));
    assert.ok(update, 'esperava um UPDATE em pedidos');
    assert.match(update.text, /extras = \$1/);
    // extras tem de ir serializado como JSON, tal como itens
    assert.strictEqual(update.values[0], JSON.stringify(extras));
  } finally {
    await srv.close();
  }
});

test('initDb cria a coluna extras de forma idempotente', async () => {
  const pool = stubPool(() => ({ rows: [{ ok: 1 }] }));
  await initDb(pool);
  const sql = pool.calls.map(c => c.text).join('\n');
  assert.match(sql, /ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS extras JSONB/);
});
```

Acrescentar `initDb` ao import no topo do ficheiro:

```js
const { createApp, initDb } = require('../app');
```

- [ ] **Step 2: Correr os testes e confirmar que falham**

Run: `npm test`
Expected: FAIL — `extras = $1` não aparece no UPDATE, e o ALTER TABLE não existe

- [ ] **Step 3: Implementar**

Em `app.js`, dentro de `initDb`, a seguir ao `CREATE TABLE pedidos`:

```js
await pool.query(`ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS extras JSONB NOT NULL DEFAULT '[]';`);
```

No `PATCH /api/pedidos/:id`, acrescentar `'extras'` à lista e serializar como `itens`:

```js
const allowed = ['nome_cliente', 'telefone', 'morada', 'tipo_servico', 'descricao',
  'quantidade', 'unidade', 'status', 'nome_orcamento', 'observacoes_internas',
  'itens', 'extras'];
```

```js
values.push(key === 'itens' || key === 'extras'
  ? JSON.stringify(req.body[key])
  : req.body[key]);
```

- [ ] **Step 4: Correr os testes e confirmar que passam**

Run: `npm test`
Expected: PASS, 4 testes

- [ ] **Step 5: Commit**

```bash
git add app.js test/app.test.js
git commit -m "fix: gravar os custos extras dos orcamentos

O admin.html ja enviava o campo extras no PATCH, mas o servidor
descartava-o por nao estar na lista de campos aceites, e a tabela nao
tinha a coluna. Os custos desapareciam ao recarregar a pagina."
```

---

### Task 3: Tabela `agenda` e `GET /api/agenda`

**Files:**
- Modify: `app.js`
- Create: `test/agenda.test.js`

**Interfaces:**
- Consumes: `createApp(pool)`, `initDb(pool)`, `stubPool`.
- Produces: tabela `agenda`; `GET /api/agenda` devolve um array de eventos com a forma `{ id, titulo, data, tipo, pedidoId, nota, created_at }`, onde `data` é texto `YYYY-MM-DD`. Ordenação por `data` ascendente, desempate por `id`.

- [ ] **Step 1: Escrever os testes que falham**

Criar `test/agenda.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert');
const { createApp, initDb } = require('../app');
const { stubPool, listen } = require('./helpers/harness');

test('initDb cria a tabela agenda de forma idempotente', async () => {
  const pool = stubPool(() => ({ rows: [{ ok: 1 }] }));
  await initDb(pool);
  const sql = pool.calls.map(c => c.text).join('\n');
  assert.match(sql, /CREATE TABLE IF NOT EXISTS agenda/);
  assert.match(sql, /pedido_id\s+INTEGER REFERENCES pedidos\(id\) ON DELETE SET NULL/);
});

test('GET /api/agenda devolve os eventos', async () => {
  const pool = stubPool(() => ({
    rows: [{ id: 1, titulo: 'Visita Ana', data: '2026-08-20', tipo: 'visita', pedidoId: 3, nota: null }]
  }));
  const srv = await listen(createApp(pool));
  try {
    const r = await fetch(`${srv.url}/api/agenda`);
    assert.strictEqual(r.status, 200);
    const body = await r.json();
    assert.strictEqual(body.length, 1);
    assert.strictEqual(body[0].titulo, 'Visita Ana');
  } finally {
    await srv.close();
  }
});

test('GET /api/agenda devolve pedidoId em camelCase e data como texto', async () => {
  const pool = stubPool(() => ({ rows: [] }));
  const srv = await listen(createApp(pool));
  try {
    await fetch(`${srv.url}/api/agenda`);
    const select = pool.calls.find(c => c.text.includes('FROM agenda'));
    assert.ok(select, 'esperava um SELECT em agenda');
    // o frontend le ev.pedidoId e trata ev.data como 'YYYY-MM-DD'
    assert.match(select.text, /pedido_id AS "pedidoId"/);
    assert.match(select.text, /to_char\(data, 'YYYY-MM-DD'\) AS data/);
    assert.match(select.text, /ORDER BY data ASC/);
  } finally {
    await srv.close();
  }
});
```

- [ ] **Step 2: Correr os testes e confirmar que falham**

Run: `npm test`
Expected: FAIL — `GET /api/agenda` devolve 404, e o CREATE TABLE não existe

- [ ] **Step 3: Implementar**

Em `app.js`, dentro de `initDb`, a seguir ao `ALTER TABLE pedidos`:

```js
await pool.query(`
  CREATE TABLE IF NOT EXISTS agenda (
    id         SERIAL PRIMARY KEY,
    titulo     TEXT NOT NULL,
    data       DATE NOT NULL,
    tipo       TEXT NOT NULL DEFAULT 'outro',
    pedido_id  INTEGER REFERENCES pedidos(id) ON DELETE SET NULL,
    nota       TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
`);
```

Em `createApp`, a seguir às rotas de pedidos, declarar a projeção partilhada e a rota de leitura:

```js
/* ---------------- agenda ---------------- */
const AGENDA_COLS = `id, titulo, tipo, nota, created_at,
  pedido_id AS "pedidoId", to_char(data, 'YYYY-MM-DD') AS data`;

app.get('/api/agenda', async (req, res) => {
  try {
    const r = await pool.query(`SELECT ${AGENDA_COLS} FROM agenda ORDER BY data ASC, id ASC`);
    res.json(r.rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'erro ao listar a agenda' });
  }
});
```

- [ ] **Step 4: Correr os testes e confirmar que passam**

Run: `npm test`
Expected: PASS, 7 testes

- [ ] **Step 5: Commit**

```bash
git add app.js test/agenda.test.js
git commit -m "feat: tabela agenda e GET /api/agenda

O admin.html ja chamava esta rota, que nunca existiu. Em producao devolvia
404 e derrubava o carregamento do painel inteiro."
```

---

### Task 4: `POST /api/agenda`

**Files:**
- Modify: `app.js`
- Modify: `test/agenda.test.js`

**Interfaces:**
- Consumes: `AGENDA_COLS` da Task 3.
- Produces: `POST /api/agenda` aceita `{ titulo, data, tipo, pedidoId, nota }`, devolve 400 se faltar `titulo` ou `data`, e devolve o evento criado com a mesma forma do `GET`.

- [ ] **Step 1: Escrever os testes que falham**

Acrescentar a `test/agenda.test.js`:

```js
test('POST /api/agenda cria um evento', async () => {
  const criado = { id: 5, titulo: 'Visita Pedro', data: '2026-08-25', tipo: 'visita', pedidoId: null, nota: null };
  const pool = stubPool(() => ({ rows: [criado] }));
  const srv = await listen(createApp(pool));
  try {
    const r = await fetch(`${srv.url}/api/agenda`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ titulo: 'Visita Pedro', data: '2026-08-25', tipo: 'visita' })
    });
    assert.strictEqual(r.status, 200);
    assert.deepStrictEqual(await r.json(), criado);
    const insert = pool.calls.find(c => c.text.includes('INSERT INTO agenda'));
    assert.deepStrictEqual(insert.values, ['Visita Pedro', '2026-08-25', 'visita', null, null]);
  } finally {
    await srv.close();
  }
});

test('POST /api/agenda recusa evento sem titulo', async () => {
  const pool = stubPool(() => ({ rows: [] }));
  const srv = await listen(createApp(pool));
  try {
    const r = await fetch(`${srv.url}/api/agenda`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: '2026-08-25' })
    });
    assert.strictEqual(r.status, 400);
    assert.ok(!pool.calls.some(c => c.text.includes('INSERT INTO agenda')));
  } finally {
    await srv.close();
  }
});

test('POST /api/agenda recusa evento sem data', async () => {
  const pool = stubPool(() => ({ rows: [] }));
  const srv = await listen(createApp(pool));
  try {
    const r = await fetch(`${srv.url}/api/agenda`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ titulo: 'Sem data' })
    });
    assert.strictEqual(r.status, 400);
  } finally {
    await srv.close();
  }
});

test('POST /api/agenda assume tipo "outro" por omissao', async () => {
  const pool = stubPool(() => ({ rows: [{ id: 6 }] }));
  const srv = await listen(createApp(pool));
  try {
    await fetch(`${srv.url}/api/agenda`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ titulo: 'Obra', data: '2026-09-01' })
    });
    const insert = pool.calls.find(c => c.text.includes('INSERT INTO agenda'));
    assert.strictEqual(insert.values[2], 'outro');
  } finally {
    await srv.close();
  }
});
```

- [ ] **Step 2: Correr os testes e confirmar que falham**

Run: `npm test`
Expected: FAIL — `POST /api/agenda` devolve 404

- [ ] **Step 3: Implementar**

Em `app.js`, a seguir ao `GET /api/agenda`:

```js
app.post('/api/agenda', async (req, res) => {
  try {
    const { titulo, data, tipo, pedidoId, nota } = req.body;
    if (!titulo || !data) {
      return res.status(400).json({ error: 'título e data são obrigatórios' });
    }
    const r = await pool.query(
      `INSERT INTO agenda (titulo, data, tipo, pedido_id, nota)
       VALUES ($1,$2,$3,$4,$5)
       RETURNING ${AGENDA_COLS}`,
      [titulo, data, tipo || 'outro', pedidoId || null, nota || null]
    );
    res.json(r.rows[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'erro ao criar evento' });
  }
});
```

- [ ] **Step 4: Correr os testes e confirmar que passam**

Run: `npm test`
Expected: PASS, 11 testes

- [ ] **Step 5: Commit**

```bash
git add app.js test/agenda.test.js
git commit -m "feat: POST /api/agenda"
```

---

### Task 5: `PATCH /api/agenda/:id` e `DELETE /api/agenda/:id`

**Files:**
- Modify: `app.js`
- Modify: `test/agenda.test.js`

**Interfaces:**
- Consumes: `AGENDA_COLS`.
- Produces: `PATCH /api/agenda/:id` aceita qualquer subconjunto de `titulo`, `data`, `tipo`, `pedidoId`, `nota`; devolve 404 se o evento não existir. `DELETE /api/agenda/:id` devolve `{ ok: true }`.

- [ ] **Step 1: Escrever os testes que falham**

Acrescentar a `test/agenda.test.js`:

```js
test('PATCH /api/agenda/:id atualiza so os campos enviados', async () => {
  const pool = stubPool(() => ({ rows: [{ id: 5, titulo: 'Visita adiada', data: '2026-08-27' }] }));
  const srv = await listen(createApp(pool));
  try {
    const r = await fetch(`${srv.url}/api/agenda/5`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ titulo: 'Visita adiada', data: '2026-08-27' })
    });
    assert.strictEqual(r.status, 200);
    const update = pool.calls.find(c => c.text.includes('UPDATE agenda'));
    assert.match(update.text, /titulo = \$1/);
    assert.match(update.text, /data = \$2/);
    assert.ok(!update.text.includes('tipo ='), 'tipo nao foi enviado, nao deve ser tocado');
    assert.deepStrictEqual(update.values, ['Visita adiada', '2026-08-27', '5']);
  } finally {
    await srv.close();
  }
});

test('PATCH /api/agenda/:id mapeia pedidoId para a coluna pedido_id', async () => {
  const pool = stubPool(() => ({ rows: [{ id: 5 }] }));
  const srv = await listen(createApp(pool));
  try {
    await fetch(`${srv.url}/api/agenda/5`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pedidoId: 7 })
    });
    const update = pool.calls.find(c => c.text.includes('UPDATE agenda'));
    assert.match(update.text, /pedido_id = \$1/);
    assert.strictEqual(update.values[0], 7);
  } finally {
    await srv.close();
  }
});

test('PATCH /api/agenda/:id converte pedidoId vazio em null', async () => {
  const pool = stubPool(() => ({ rows: [{ id: 5 }] }));
  const srv = await listen(createApp(pool));
  try {
    await fetch(`${srv.url}/api/agenda/5`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pedidoId: '' })
    });
    const update = pool.calls.find(c => c.text.includes('UPDATE agenda'));
    assert.strictEqual(update.values[0], null);
  } finally {
    await srv.close();
  }
});

test('PATCH /api/agenda/:id devolve 404 se o evento nao existir', async () => {
  const pool = stubPool(() => ({ rows: [] }));
  const srv = await listen(createApp(pool));
  try {
    const r = await fetch(`${srv.url}/api/agenda/999`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ titulo: 'Nao existe' })
    });
    assert.strictEqual(r.status, 404);
  } finally {
    await srv.close();
  }
});

test('DELETE /api/agenda/:id apaga o evento', async () => {
  const pool = stubPool(() => ({ rows: [] }));
  const srv = await listen(createApp(pool));
  try {
    const r = await fetch(`${srv.url}/api/agenda/5`, { method: 'DELETE' });
    assert.strictEqual(r.status, 200);
    assert.deepStrictEqual(await r.json(), { ok: true });
    const del = pool.calls.find(c => c.text.includes('DELETE FROM agenda'));
    assert.deepStrictEqual(del.values, ['5']);
  } finally {
    await srv.close();
  }
});
```

- [ ] **Step 2: Correr os testes e confirmar que falham**

Run: `npm test`
Expected: FAIL — ambas as rotas devolvem 404

- [ ] **Step 3: Implementar**

Em `app.js`, a seguir ao `POST /api/agenda`:

```js
app.patch('/api/agenda/:id', async (req, res) => {
  try {
    // chave enviada pelo frontend -> coluna na base de dados
    const allowed = { titulo: 'titulo', data: 'data', tipo: 'tipo', pedidoId: 'pedido_id', nota: 'nota' };
    const fields = [];
    const values = [];
    let i = 1;
    for (const [key, column] of Object.entries(allowed)) {
      if (Object.prototype.hasOwnProperty.call(req.body, key)) {
        fields.push(`${column} = $${i}`);
        // um pedido desassociado chega como '' do select do formulário
        values.push(key === 'pedidoId' && !req.body[key] ? null : req.body[key]);
        i++;
      }
    }
    if (fields.length === 0) return res.json({ ok: true });
    values.push(req.params.id);
    const r = await pool.query(
      `UPDATE agenda SET ${fields.join(', ')} WHERE id = $${i} RETURNING ${AGENDA_COLS}`,
      values
    );
    if (r.rows.length === 0) return res.status(404).json({ error: 'evento não encontrado' });
    res.json(r.rows[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'erro ao atualizar evento' });
  }
});

app.delete('/api/agenda/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM agenda WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'erro ao excluir evento' });
  }
});
```

- [ ] **Step 4: Correr os testes e confirmar que passam**

Run: `npm test`
Expected: PASS, 16 testes

- [ ] **Step 5: Commit**

```bash
git add app.js test/agenda.test.js
git commit -m "feat: PATCH e DELETE /api/agenda/:id"
```

---

### Task 6: Painel resistente a falhas de carregamento

**Files:**
- Modify: `public/admin.html` (função `loadAll`, e a procura de evento em `openAgendaModal`)
- Create: `test/admin-page.test.js`

**Interfaces:**
- Consumes: `GET /api/agenda` da Task 3.
- Produces: nada de que outras tarefas dependam.

- [ ] **Step 1: Escrever o teste que falha**

Criar `test/admin-page.test.js`:

```js
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
  const html = dom.window.document.getElementById('tab-agenda').innerHTML;
  assert.ok(html.trim().length > 0, 'a agenda nao pode ficar sem conteudo nenhum');
  dom.window.close();
});
```

- [ ] **Step 2: Correr os testes e confirmar que dois falham**

Run: `npm test`
Expected: o primeiro teste PASSA; os dois seguintes FALHAM, porque `tab-pendentes` fica vazio quando `/api/agenda` dá 404

- [ ] **Step 3: Implementar**

Em `public/admin.html`, substituir o corpo de `loadAll` (linhas 556-568) por:

```js
async function loadAll(){
  const [cfgR, listR, agR] = await Promise.allSettled([
    apiGet('/api/config'), apiGet('/api/pedidos'), apiGet('/api/agenda')
  ]);
  const falhas = [];

  if(cfgR.status === 'fulfilled'){
    const cfg = cfgR.value || {};
    catalog = cfg.catalogo || { services:[], materials:[] };
    companyName = (cfg.empresa && cfg.empresa.nome) || 'Sua Construtora';
  } else { falhas.push('catálogo'); }

  if(listR.status === 'fulfilled'){ pedidos = listR.value || []; }
  else { falhas.push('pedidos'); }

  if(agR.status === 'fulfilled'){ agenda = agR.value || []; }
  else { falhas.push('agenda'); }

  document.getElementById('company-name').textContent = companyName;
  renderAll();

  if(falhas.length){ showToast('Não foi possível carregar: ' + falhas.join(', ')); }
}
```

Na comparação de identificadores da agenda, `openAgendaModal` (linha 1305), trocar:

```js
const ev = id ? agenda.find(x=>x.id===id) : null;
```

por:

```js
// o id vem de dataset.agenda, que e sempre texto; o da base de dados e numero
const ev = id ? agenda.find(x=>String(x.id)===String(id)) : null;
```

- [ ] **Step 4: Correr os testes e confirmar que passam**

Run: `npm test`
Expected: PASS, 19 testes

- [ ] **Step 5: Commit**

```bash
git add public/admin.html test/admin-page.test.js
git commit -m "fix: uma rota em falha deixava o painel inteiro em branco

loadAll() usava Promise.all com um apiGet que lanca em resposta nao-OK.
Com /api/agenda a dar 404, renderAll() nunca corria e todos os separadores
ficavam vazios. Passa a Promise.allSettled: cada bloco carrega o que
consegue e as falhas sao comunicadas sem levar o resto atras.

Corrige tambem a procura de evento da agenda, que comparava um id numerico
com o texto vindo do dataset e nunca encontrava nada."
```

---

### Task 7: Arrumar o repositório

**Files:**
- Delete: `public/preview3-admin.html`, `public/preview3-pedido.html`
- Modify: índice do git (remover `node_modules` do controlo de versões)

**Interfaces:**
- Consumes: `.gitignore` (já criado no commit `5d9e59c`).
- Produces: nada de que outras tarefas dependam.

> **Confirmar com o utilizador antes deste passo.** Os dois ficheiros `preview3-*` não estão versionados: apagá-los não é reversível pelo git. São maquetes antigas com `fetch` simulado, já superadas pelas decisões da spec, mas a decisão de os apagar é do utilizador. Se preferir guardá-los, mover para fora de `public/` em vez de apagar — enquanto estiverem em `public/` são servidos publicamente pelo `express.static`.

- [ ] **Step 1: Confirmar o que está versionado indevidamente**

Run: `git ls-files | grep -c "^node_modules/"`
Expected: um número na ordem dos milhares (o `node_modules` inteiro)

- [ ] **Step 2: Retirar `node_modules` do controlo de versões**

O `--cached` desregista os ficheiros do git sem os apagar do disco.

```bash
git rm -r --cached node_modules --quiet
```

- [ ] **Step 3: Verificar que o disco não foi tocado**

Run: `ls node_modules | wc -l`
Expected: 112 — as pastas continuam lá, só deixaram de estar versionadas

Run: `git ls-files | grep -c "^node_modules/" || echo 0`
Expected: `0`

- [ ] **Step 4: Apagar as maquetes antigas (só após confirmação)**

```bash
rm public/preview3-admin.html public/preview3-pedido.html
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: tirar node_modules do controlo de versoes e apagar maquetes antigas

O .gitignore ja cobre node_modules/ e .superpowers/. As paginas preview3-*
eram maquetes com fetch simulado, servidas publicamente por estarem em
public/."
```

---

### Task 8: Verificar contra a base de dados real e publicar

Esta tarefa tem uma paragem obrigatória: o `push` para `main` dispara deploy automático no Render e é uma ação com efeito externo.

**Files:**
- Modify: nenhum ficheiro de código. Só operações de git.

**Interfaces:**
- Consumes: tudo o que as Tasks 1-7 produziram.
- Produces: `origin/main` atualizado, deploy no Render.

- [ ] **Step 1: Correr a suite completa**

Run: `npm test`
Expected: PASS, 19 testes, zero falhas

- [ ] **Step 2: Arrancar contra a base de dados real e exercitar todos os separadores**

Obter a connection string externa da base de dados `orca-obra-db` no painel do Render e arrancar localmente:

```bash
DATABASE_URL='<connection string externa do Render>' npm start
```

Abrir `http://localhost:3000` e confirmar, um a um:

- **Pendentes** — a lista carrega e mostra os pedidos existentes
- **Confirmados** — a lista carrega; abrir um orçamento, adicionar um custo extra, guardar, recarregar a página, confirmar que o custo continua lá
- **Agenda** — criar um evento, recarregar, confirmar que persiste; editar o evento e confirmar que a alteração persiste
- **Catálogo** — os serviços e materiais aparecem e podem ser editados
- **Estatística** — os números aparecem e o breakdown mostra material, mão de obra e custos adicionais
- **Página do cliente** — abrir `http://localhost:3000/pedido`, adicionar um trabalho, confirmar que a estimativa é calculada

Esta verificação é do conjunto, não só das rotas novas: a versão local do `admin.html` (1416 linhas) nunca correu contra a base de dados real.

Parar o servidor antes de continuar.

- [ ] **Step 3: Preparar o branch de publicação**

Os históricos local e remoto são independentes. Esta sequência preserva o histórico do GitHub e acrescenta o trabalho por cima, num único commit de conteúdo.

```bash
git branch -f publicar origin/main
git checkout publicar
git checkout master -- app.js server.js package.json public/ docs/ test/ .gitignore
git status --short
```

- [ ] **Step 4: Confirmar o que vai ser publicado**

Run: `git status --short && echo "---" && git diff --cached --stat origin/main`

Expected: aparecem `app.js`, `server.js`, `package.json`, `public/admin.html`, `public/pedido.html`, `test/`, `docs/`, `.gitignore`. **Não** pode aparecer nada dentro de `node_modules/` nem de `.superpowers/`. Se aparecer, parar e corrigir o `.gitignore` antes de seguir.

- [ ] **Step 5: Commit no branch de publicação**

```bash
git add -A
git commit -m "feat: repor agenda, custos extras e resiliencia do carregamento

Traz para producao o trabalho que estava por publicar, mais as correcoes:

- tabela agenda e rotas GET/POST/PATCH/DELETE em /api/agenda, que o
  admin.html ja chamava e nunca existiram
- coluna pedidos.extras e aceitacao do campo no PATCH; os custos extras
  eram silenciosamente descartados
- loadAll() com Promise.allSettled, para que uma rota em baixo nao deixe o
  painel inteiro em branco
- createApp(pool) separado do arranque, com testes das rotas
- node_modules fora do controlo de versoes"
```

- [ ] **Step 6: PARAR e pedir aprovação**

Mostrar ao utilizador o resultado de `git log --oneline origin/main..publicar` e de `git diff --stat origin/main..publicar`, e explicar que o passo seguinte publica em https://orca-obra-app-v2.onrender.com.

**Não executar o Step 7 sem um sim explícito.**

- [ ] **Step 7: Publicar (só após aprovação)**

```bash
git push origin publicar:main
```

- [ ] **Step 8: Confirmar o deploy**

Aguardar o fim do deploy no Render e verificar:

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://orca-obra-app-v2.onrender.com/api/agenda
```

Expected: `200`

Abrir https://orca-obra-app-v2.onrender.com e confirmar que os separadores carregam com dados reais.

- [ ] **Step 9: Alinhar o branch local**

```bash
git checkout master
git branch -f master publicar
git branch -d publicar
git branch --set-upstream-to=origin/main master
```

---

## Critérios de aceitação da fase

Retirados da secção 4.7 da spec:

- `GET /api/agenda` responde 200 com um array em produção
- Criar, editar e apagar um evento de agenda persiste após recarregar a página
- Um custo extra adicionado a um orçamento persiste após recarregar a página
- Com uma rota de dados indisponível, os restantes separadores continuam a mostrar conteúdo
- `git ls-files` não devolve nada dentro de `node_modules/`
