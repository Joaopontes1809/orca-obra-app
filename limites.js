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

// Um endereço só, limpo, para servir de chave. Recusa lixo e trunca, para o
// mapa não crescer com valores inventados por quem chama.
function limparEndereco(valor) {
  if (typeof valor !== 'string') return null;
  const primeiro = valor.split(',')[0].trim();
  if (!primeiro || primeiro.length > 45) return null;
  return /^[0-9a-fA-F:.]+$/.test(primeiro) ? primeiro : null;
}

/**
 * Quem está do outro lado.
 *
 * Isto pareceu resolvido durante muito tempo e não estava: em produção há
 * dois intermediários à frente da app — a Cloudflare que serve o Render, e um
 * proxy interno do Render. Com `trust proxy 1`, o req.ip do express é o do
 * proxy interno, que muda de pedido para pedido. Resultado: cada pedido
 * abria um contador novo e o travão nunca chegava a travar. Confirmado nos
 * registos do servidor:
 *
 *   xff = 188.83.114.11, 172.70.246.123, 10.197.67.155
 *   req.ip = 10.197.67.155   (e no pedido seguinte já era 10.198.253.251)
 *
 * O cf-connecting-ip é escrito pela Cloudflare à entrada, por cima do que o
 * cliente tenha mandado, e traz o endereço verdadeiro. É esse que se usa; o
 * req.ip fica como recurso para quando não houver Cloudflare à frente, como
 * acontece a correr isto localmente.
 */
function origem(req) {
  return limparEndereco(req.headers && req.headers['cf-connecting-ip'])
    || limparEndereco(req.ip)
    || limparEndereco(req.socket && req.socket.remoteAddress)
    || 'desconhecido';
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
