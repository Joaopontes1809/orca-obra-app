const express = require('express');
const path = require('path');
const auth = require('./auth');

const DEFAULT_CATALOG = {
  services: [
    { id: 's-piso', name: 'Pavimento', laborPercent: 90, unit: 'm²' },
    { id: 's-pintura', name: 'Pintura', laborPercent: 250, unit: 'm²' },
    { id: 's-parede', name: 'Alvenaria / parede', laborPercent: 60, unit: 'm²' },
    { id: 's-telhado', name: 'Telhado', laborPercent: 60, unit: 'm²' },
    { id: 's-eletrica', name: 'Eletricidade', laborPercent: 80, unit: 'ponto' },
    { id: 's-hidraulica', name: 'Canalização', laborPercent: 80, unit: 'ponto' },
    { id: 's-outro', name: 'Outro / não sei especificar', laborPercent: 50, unit: 'un' }
  ],
  materials: [
    { id: 'm-porc', name: 'Pavimento porcelânico padrão', serviceId: 's-piso', unit: 'm²', price: 15 },
    { id: 'm-ceram', name: 'Pavimento cerâmico económico', serviceId: 's-piso', unit: 'm²', price: 8 },
    { id: 'm-tinta-lat', name: 'Tinta acrílica interior (2 demãos)', serviceId: 's-pintura', unit: 'm²', price: 3 },
    { id: 'm-tijolo', name: 'Tijolo / bloco (m² de parede)', serviceId: 's-parede', unit: 'm²', price: 25 },
    { id: 'm-telha', name: 'Telha cerâmica', serviceId: 's-telhado', unit: 'm²', price: 20 },
    { id: 'm-ponto-el', name: 'Ponto elétrico completo', serviceId: 's-eletrica', unit: 'ponto', price: 45 },
    { id: 'm-ponto-hid', name: 'Ponto de canalização completo', serviceId: 's-hidraulica', unit: 'ponto', price: 60 }
  ]
};

async function initDb(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS config (
      key TEXT PRIMARY KEY,
      value JSONB NOT NULL
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS pedidos (
      id SERIAL PRIMARY KEY,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      nome_cliente TEXT,
      telefone TEXT,
      morada TEXT,
      tipo_servico TEXT,
      descricao TEXT,
      quantidade NUMERIC,
      unidade TEXT,
      observacoes_cliente TEXT,
      status TEXT NOT NULL DEFAULT 'pendente',
      nome_orcamento TEXT,
      observacoes_internas TEXT,
      itens JSONB NOT NULL DEFAULT '[]',
      confirmado_em TIMESTAMPTZ
    );
  `);
  await pool.query(`ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS extras JSONB NOT NULL DEFAULT '[]';`);
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

  const cat = await pool.query("SELECT 1 FROM config WHERE key = 'catalogo'");
  if (cat.rows.length === 0) {
    await pool.query("INSERT INTO config (key, value) VALUES ('catalogo', $1)", [DEFAULT_CATALOG]);
  }
  const emp = await pool.query("SELECT 1 FROM config WHERE key = 'empresa'");
  if (emp.rows.length === 0) {
    await pool.query("INSERT INTO config (key, value) VALUES ('empresa', $1)", [{ nome: 'Krona' }]);
  }
}


// O corpo de POST /api/pedidos vem de um formulario publico, sem sessao. O que
// la vier e guardado como JSONB e mais tarde desenhado no painel, por isso os
// campos tem de ser reduzidos ao tipo e tamanho esperados antes de entrarem.
const LIMITE_TEXTO = 300;
const LIMITE_ITENS = 60;

function texto(v, limite) {
  if (v === null || v === undefined) return null;
  return String(v).slice(0, limite || LIMITE_TEXTO);
}

function numero(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function limparItens(itens) {
  if (!Array.isArray(itens)) return [];
  return itens.slice(0, LIMITE_ITENS).map(it => ({
    id: texto(it && it.id, 40) || '',
    serviceId: texto(it && it.serviceId, 40),
    materialId: texto(it && it.materialId, 40),
    desc: texto(it && it.desc, 200) || '',
    unit: texto(it && it.unit, 20) || '',
    quantity: numero(it && it.quantity),
    unitPrice: numero(it && it.unitPrice),
    laborPercent: numero(it && it.laborPercent)
  }));
}

function createApp(pool) {
  const app = express();
  app.use(express.json());
  app.use(express.static(path.join(__dirname, 'public')));

  // Login e sessao. O middleware protege tudo em /api excepto o que o
  // formulario publico do cliente precisa — ver ROTAS_PUBLICAS em auth.js.
  auth.registarRotas(app);
  app.use(auth.exigirSessao);

  /* ---------------- config ---------------- */
  app.get('/api/config', async (req, res) => {
    try {
      const r = await pool.query('SELECT key, value FROM config');
      const out = {};
      r.rows.forEach(row => { out[row.key] = row.value; });
      res.json(out);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'erro ao carregar configuração' });
    }
  });

  app.put('/api/config/:key', async (req, res) => {
    try {
      const { key } = req.params;
      await pool.query(
        `INSERT INTO config (key, value) VALUES ($1, $2)
         ON CONFLICT (key) DO UPDATE SET value = $2`,
        [key, req.body]
      );
      res.json({ ok: true });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'erro ao guardar configuração' });
    }
  });

  /* ---------------- pedidos ---------------- */
  app.get('/api/pedidos', async (req, res) => {
    try {
      const r = await pool.query('SELECT * FROM pedidos ORDER BY created_at DESC');
      res.json(r.rows);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'erro ao listar pedidos' });
    }
  });

  // criado pelo cliente através do link público
  app.post('/api/pedidos', async (req, res) => {
    try {
      const { nome_cliente, telefone, morada, tipo_servico, descricao, quantidade, unidade, observacoes_cliente, itens } = req.body;
      if (!nome_cliente || !morada) {
        return res.status(400).json({ error: 'nome e morada são obrigatórios' });
      }
      const r = await pool.query(
        `INSERT INTO pedidos (nome_cliente, telefone, morada, tipo_servico, descricao, quantidade, unidade, observacoes_cliente, itens, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'pendente') RETURNING *`,
        [texto(nome_cliente, 120), texto(telefone, 40), texto(morada, 200), texto(tipo_servico, 200),
         texto(descricao, 2000), quantidade == null ? null : numero(quantidade), texto(unidade, 20),
         texto(observacoes_cliente, 2000), JSON.stringify(limparItens(itens))]
      );
      res.json(r.rows[0]);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'erro ao enviar pedido' });
    }
  });

  // criado internamente pela equipa (já nasce confirmado)
  app.post('/api/pedidos/manual', async (req, res) => {
    try {
      const { nome_cliente, telefone, morada, nome_orcamento, itens, extras } = req.body;
      const r = await pool.query(
        `INSERT INTO pedidos (nome_cliente, telefone, morada, nome_orcamento, itens, extras, status, confirmado_em)
         VALUES ($1,$2,$3,$4,$5,$6,'confirmado', now()) RETURNING *`,
        [nome_cliente || '', telefone || null, morada || '', nome_orcamento || '', JSON.stringify(itens || []), JSON.stringify(extras || [])]
      );
      res.json(r.rows[0]);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'erro ao criar orçamento' });
    }
  });

  app.patch('/api/pedidos/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const allowed = ['nome_cliente', 'telefone', 'morada', 'tipo_servico', 'descricao', 'quantidade', 'unidade', 'status', 'nome_orcamento', 'observacoes_internas', 'itens', 'extras'];
      const fields = [];
      const values = [];
      let i = 1;
      for (const key of allowed) {
        if (Object.prototype.hasOwnProperty.call(req.body, key)) {
          fields.push(`${key} = $${i}`);
          values.push(key === 'itens' || key === 'extras' ? JSON.stringify(req.body[key]) : req.body[key]);
          i++;
        }
      }
      if (req.body.status === 'confirmado') {
        fields.push('confirmado_em = now()');
      }
      if (fields.length === 0) return res.json({ ok: true });
      values.push(id);
      const r = await pool.query(`UPDATE pedidos SET ${fields.join(', ')} WHERE id = $${i} RETURNING *`, values);
      res.json(r.rows[0]);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'erro ao atualizar pedido' });
    }
  });

  app.delete('/api/pedidos/:id', async (req, res) => {
    try {
      await pool.query('DELETE FROM pedidos WHERE id = $1', [req.params.id]);
      res.json({ ok: true });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'erro ao excluir pedido' });
    }
  });

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

  app.get('/pedido', (req, res) => res.sendFile(path.join(__dirname, 'public', 'pedido.html')));
  app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));

  /* ---------------- IA (Google Gemini — camada gratuita) ---------------- */
  async function callGemini(system, userText, maxTokens) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${process.env.GEMINI_API_KEY}`;
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: userText }] }],
        systemInstruction: { parts: [{ text: system }] },
        generationConfig: { maxOutputTokens: maxTokens || 800 }
      })
    });
    const data = await r.json();
    if (!r.ok) throw new Error((data && data.error && data.error.message) || 'erro na IA');
    const text = data.candidates && data.candidates[0] && data.candidates[0].content
      && data.candidates[0].content.parts && data.candidates[0].content.parts[0]
      && data.candidates[0].content.parts[0].text;
    return text || '';
  }
  function extractJson(text) {
    const match = text.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    return match ? JSON.parse(match[0]) : null;
  }

  // cliente: descreve em texto livre, IA sugere os itens do pedido
  app.post('/api/ai/parse-request', async (req, res) => {
    try {
      if (!process.env.GEMINI_API_KEY) return res.status(503).json({ error: 'IA não configurada' });
      const { texto, services } = req.body;
      if (!texto || !texto.trim()) return res.status(400).json({ error: 'escreva o que pretende primeiro' });

      const serviceList = (services || []).map(s => `- ${s.name} (unidade: ${s.unit})`).join('\n');
      const system = `És um assistente que interpreta pedidos de reforma/construção em português de Portugal e devolve APENAS um array JSON, sem texto antes ou depois.
Serviços disponíveis:
${serviceList}
Para cada trabalho identificado no texto do cliente, devolve um objeto com:
- "servico": o nome do serviço mais próximo da lista acima (usa exatamente o nome da lista)
- "material": um palpite curto do material/acabamento mencionado ou "" se não foi dito
- "quantidade": número (m² ou unidade correspondente) mencionado, ou null se não foi dito
Exemplo de resposta: [{"servico":"Pintura","material":"tinta branca","quantidade":20},{"servico":"Pavimento","material":"","quantidade":null}]
Se não conseguires identificar nenhum trabalho, devolve [].`;

      const text = await callGemini(system, texto, 600);
      const parsed = extractJson(text) || [];
      res.json({ itens: parsed });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'erro ao analisar pedido' });
    }
  });

  // equipa: sugere observações internas e itens de orçamento a partir do pedido
  app.post('/api/ai/assist-admin', async (req, res) => {
    try {
      if (!process.env.GEMINI_API_KEY) return res.status(503).json({ error: 'IA não configurada' });
      const { descricao, observacoes_cliente, tipo_servico, services } = req.body;

      const serviceList = (services || []).map(s => `- ${s.name} (unidade: ${s.unit})`).join('\n');
      const system = `És um assistente interno de uma empresa de remodelação em Portugal. Com base na descrição de um pedido de cliente, devolve APENAS um objeto JSON, sem texto antes ou depois, no formato:
{"resumo": "resumo curto e profissional em 1-2 frases para uso interno da equipa", "itens_sugeridos": [{"servico":"nome exato da lista","material":"palpite curto ou vazio","quantidade": numero ou null}]}
Serviços disponíveis:
${serviceList}
O "resumo" deve ser útil para a equipa perceber rapidamente o pedido antes da visita técnica.`;

      const userText = `Tipo de serviço indicado: ${tipo_servico || 'não indicado'}
Descrição do cliente: ${descricao || 'não indicado'}
Observações do cliente: ${observacoes_cliente || 'nenhuma'}`;

      const text = await callGemini(system, userText, 700);
      const parsed = extractJson(text) || { resumo: '', itens_sugeridos: [] };
      res.json(parsed);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'erro ao gerar sugestão' });
    }
  });

  /* ---------------- pesquisa de preços (SerpApi) ---------------- */
  app.get('/api/pesquisar-preco', async (req, res) => {
    try {
      const q = (req.query.q || '').toString().trim();
      if (!q) return res.status(400).json({ error: 'termo de pesquisa em falta' });
      if (!process.env.SERPAPI_KEY) return res.status(503).json({ error: 'pesquisa de preços não configurada' });

      const url = new URL('https://serpapi.com/search.json');
      url.searchParams.set('engine', 'google_shopping');
      url.searchParams.set('q', q);
      url.searchParams.set('gl', 'pt');
      url.searchParams.set('hl', 'pt-pt');
      url.searchParams.set('google_domain', 'google.pt');
      url.searchParams.set('api_key', process.env.SERPAPI_KEY);

      const r = await fetch(url.toString());
      const data = await r.json();
      const results = (data.shopping_results || []).slice(0, 8).map(item => ({
        title: item.title,
        price: item.extracted_price != null ? item.extracted_price : null,
        priceText: item.price || null,
        source: item.source || null,
        link: item.product_link || item.link || null
      })).filter(item => item.price != null);

      res.json({ results });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'erro ao pesquisar preços' });
    }
  });

  return app;
}

module.exports = { createApp, initDb, DEFAULT_CATALOG };
