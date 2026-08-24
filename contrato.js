// Contrato de empreitada: gerar o link, mostrá-lo publicamente por código, e
// receber a assinatura.
//
// O contrato é público por código porque tem de poder ser aberto pelo cliente
// num telemóvel, a partir de uma mensagem. Quem tiver o link vê os dados
// daquele orçamento — é inerente a mandar um contrato por WhatsApp. O código
// é aleatório e longo o suficiente para não ser adivinhado.
const crypto = require('node:crypto');

// Uma assinatura é uma imagem PNG desenhada no ecrã. Limitamos o tamanho para
// ninguém usar este campo público como armazenamento.
const LIMITE_ASSINATURA = 200 * 1024; // 200 kB em base64
const PREFIXO_PNG = 'data:image/png;base64,';

function novoToken() {
  return crypto.randomBytes(24).toString('base64url');
}

function assinaturaValida(valor) {
  if (typeof valor !== 'string') return false;
  if (!valor.startsWith(PREFIXO_PNG)) return false;
  if (valor.length > LIMITE_ASSINATURA) return false;
  const base64 = valor.slice(PREFIXO_PNG.length);
  // tem de ser base64 verdadeiro, senão não é uma imagem
  return /^[A-Za-z0-9+/]+={0,2}$/.test(base64) && base64.length > 100;
}

// O que o cliente vê. Nunca devolve notas internas nem custos extra: são
// nossos, não dele.
function paraOCliente(pedido, empresa, modelo) {
  return {
    empresa: (empresa && empresa.nome) || 'Krona',
    cliente: pedido.nome_cliente || '',
    telefone: pedido.telefone || '',
    morada: pedido.morada || '',
    nomeOrcamento: pedido.nome_orcamento || '',
    itens: pedido.itens || [],
    modelo,
    assinado: !!(pedido.contrato && pedido.contrato.assinadoEm),
    contrato: pedido.contrato || null
  };
}

function registarRotas(app, pool, limitar) {
  // --- painel: criar ou recuperar o link do contrato ---
  app.post('/api/pedidos/:id/contrato', async (req, res) => {
    try {
      const r = await pool.query('SELECT contrato_token FROM pedidos WHERE id = $1', [req.params.id]);
      if (r.rows.length === 0) return res.status(404).json({ error: 'orçamento não encontrado' });

      let token = r.rows[0].contrato_token;
      if (!token) {
        token = novoToken();
        await pool.query('UPDATE pedidos SET contrato_token = $1 WHERE id = $2', [token, req.params.id]);
      }
      res.json({ token, caminho: '/contrato/' + token });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'erro ao preparar o contrato' });
    }
  });

  // --- público: ler o contrato pelo código ---
  app.get('/api/contrato/:token', async (req, res) => {
    try {
      const r = await pool.query(
        'SELECT nome_cliente, telefone, morada, nome_orcamento, itens, contrato FROM pedidos WHERE contrato_token = $1',
        [req.params.token]
      );
      if (r.rows.length === 0) return res.status(404).json({ error: 'contrato não encontrado' });

      const cfg = await pool.query("SELECT key, value FROM config WHERE key IN ('empresa','contrato')");
      const porChave = {};
      for (const linha of cfg.rows) porChave[linha.key] = linha.value;
      res.json(paraOCliente(r.rows[0], porChave.empresa, porChave.contrato));
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'erro ao carregar o contrato' });
    }
  });

  // --- público: assinar ---
  app.post('/api/contrato/:token/assinar',
    limitar({
      nome: 'assinar', max: 20, janelaMs: 60 * 60 * 1000,
      mensagem: 'Demasiadas tentativas. Tente mais tarde.'
    }),
    async (req, res) => {
      try {
        const { assinatura, nome } = req.body || {};
        if (!nome || !String(nome).trim()) {
          return res.status(400).json({ error: 'indique o seu nome' });
        }
        if (!assinaturaValida(assinatura)) {
          return res.status(400).json({ error: 'assinatura em falta ou inválida' });
        }

        const r = await pool.query(
          'SELECT id, itens, contrato FROM pedidos WHERE contrato_token = $1',
          [req.params.token]
        );
        if (r.rows.length === 0) return res.status(404).json({ error: 'contrato não encontrado' });

        // Assinar duas vezes seria substituir uma prova por outra: recusa-se.
        if (r.rows[0].contrato && r.rows[0].contrato.assinadoEm) {
          return res.status(409).json({ error: 'este contrato já foi assinado' });
        }

        const cfg = await pool.query("SELECT value FROM config WHERE key = 'contrato'");
        const registo = {
          nome: String(nome).trim().slice(0, 120),
          assinatura,
          assinadoEm: new Date().toISOString(),
          // guarda-se o texto tal como estava: mudá-lo depois não pode alterar
          // o que a pessoa assinou
          modeloAssinado: cfg.rows.length ? cfg.rows[0].value : null,
          itensAssinados: r.rows[0].itens || [],
          origem: (req.ip || '').slice(0, 60)
        };

        await pool.query('UPDATE pedidos SET contrato = $1 WHERE id = $2', [registo, r.rows[0].id]);
        res.json({ ok: true, assinadoEm: registo.assinadoEm });
      } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'erro ao registar a assinatura' });
      }
    }
  );
}

module.exports = { registarRotas, novoToken, assinaturaValida, LIMITE_ASSINATURA };
