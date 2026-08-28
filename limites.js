// Travão de tentativas, em memória. O serviço corre numa instância só, por
// isso um contador local chega; com várias instâncias isto teria de passar
// para a base de dados ou para um Redis.
const REGISTOS = new Map();

// Limpa periodicamente o que já expirou, para o mapa não crescer sem fim.
const LIMPEZA_MS = 10 * 60 * 1000;
let ultimaLimpeza = Date.now();

function limpar(agora) {
  if (agora - ultimaLimpeza < LIMPEZA_MS) return;
  ultimaLimpeza = agora;
  for (const [chave, registo] of REGISTOS) {
    if (registo.janelaAte <= agora) REGISTOS.delete(chave);
  }
}

function origem(req) {
  // Atrás do proxy do Render o endereço real vem no X-Forwarded-For; o
  // trust proxy da app faz o express.ip resolvê-lo.
  return req.ip || (req.socket && req.socket.remoteAddress) || 'desconhecido';
}

/**
 * Devolve um middleware que deixa passar no máximo `max` pedidos por origem
 * dentro de `janelaMs`. Quando `soFalhas` é verdadeiro só conta as respostas
 * de erro — serve para o login, onde acertar na password não deve gastar
 * tentativas.
 */
function limitar({ nome, max, janelaMs, soFalhas = false, mensagem }) {
  return function (req, res, next) {
    const agora = Date.now();
    limpar(agora);

    const chave = nome + '|' + origem(req);
    if (process.env.DIAGNOSTICO_LIMITES) {
      console.log('[limites]', nome, 'chave=', chave, 'xff=', req.headers['x-forwarded-for'], 'ip=', req.ip, 'socket=', req.socket && req.socket.remoteAddress);
    }
    let registo = REGISTOS.get(chave);
    if (!registo || registo.janelaAte <= agora) {
      registo = { contagem: 0, janelaAte: agora + janelaMs };
      REGISTOS.set(chave, registo);
    }

    if (registo.contagem >= max) {
      const faltam = Math.ceil((registo.janelaAte - agora) / 1000);
      res.setHeader('Retry-After', String(faltam));
      return res.status(429).json({ error: mensagem, retryAfter: faltam });
    }

    if (soFalhas) {
      // conta depois de saber o resultado, e só se tiver corrido mal
      res.on('finish', () => {
        if (res.statusCode >= 400) registo.contagem++;
        else REGISTOS.delete(chave); // entrou bem: limpa o historico
      });
    } else {
      registo.contagem++;
    }

    next();
  };
}

// exposto só para os testes poderem partir de um estado limpo
function reiniciar() {
  REGISTOS.clear();
}

module.exports = { limitar, reiniciar };
