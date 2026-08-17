// Autenticação do painel: uma password partilhada, guardada em variável de
// ambiente, e uma sessão num cookie assinado. Sem dependências novas — usa
// só o módulo crypto que vem no Node.
const crypto = require('node:crypto');

const NOME_COOKIE = 'krona_sessao';
const DURACAO_MS = 30 * 24 * 60 * 60 * 1000; // 30 dias

// As rotas que o formulário público do cliente precisa. Tudo o resto em /api
// exige sessão.
const ROTAS_PUBLICAS = [
  { metodo: 'GET', caminho: '/api/config' },
  { metodo: 'POST', caminho: '/api/pedidos' },
  { metodo: 'POST', caminho: '/api/ai/parse-request' },
  { metodo: 'GET', caminho: '/api/pesquisar-preco' },
  { metodo: 'POST', caminho: '/api/login' },
  { metodo: 'POST', caminho: '/api/logout' },
  { metodo: 'GET', caminho: '/api/sessao' }
];

function segredo() {
  // SESSION_SECRET é o ideal; sem ele, deriva-se da password para que uma só
  // variável baste. Trocar a password invalida as sessões, o que é desejável.
  const base = process.env.SESSION_SECRET || process.env.ADMIN_PASSWORD || '';
  return crypto.createHash('sha256').update('krona|' + base).digest();
}

function assinar(texto) {
  return crypto.createHmac('sha256', segredo()).update(texto).digest('base64url');
}

function criarSessao() {
  const expira = String(Date.now() + DURACAO_MS);
  return expira + '.' + assinar(expira);
}

function sessaoValida(valor) {
  if (typeof valor !== 'string') return false;
  const corte = valor.lastIndexOf('.');
  if (corte < 1) return false;
  const expira = valor.slice(0, corte);
  const assinatura = valor.slice(corte + 1);
  const esperada = assinar(expira);
  // comparação em tempo constante, para a assinatura não poder ser adivinhada
  // byte a byte pelo tempo de resposta
  const a = Buffer.from(assinatura);
  const b = Buffer.from(esperada);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;
  return Number(expira) > Date.now();
}

function passwordCorreta(recebida) {
  const esperada = process.env.ADMIN_PASSWORD;
  if (!esperada) return false;
  if (typeof recebida !== 'string') return false;
  // digerir primeiro iguala os comprimentos, que timingSafeEqual exige
  const a = crypto.createHash('sha256').update(recebida).digest();
  const b = crypto.createHash('sha256').update(esperada).digest();
  return crypto.timingSafeEqual(a, b);
}

function lerCookie(req, nome) {
  const bruto = req.headers.cookie;
  if (!bruto) return null;
  for (const parte of bruto.split(';')) {
    const igual = parte.indexOf('=');
    if (igual < 0) continue;
    if (parte.slice(0, igual).trim() === nome) {
      return decodeURIComponent(parte.slice(igual + 1).trim());
    }
  }
  return null;
}

function autenticado(req) {
  return sessaoValida(lerCookie(req, NOME_COOKIE));
}

function cookieSessao(valor, maxIdadeSegundos) {
  const partes = [
    `${NOME_COOKIE}=${encodeURIComponent(valor)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxIdadeSegundos}`
  ];
  // Secure só em produção: em localhost o browser recusaria o cookie
  if (process.env.NODE_ENV === 'production' || process.env.RENDER) partes.push('Secure');
  return partes.join('; ');
}

function ehPublica(req) {
  return ROTAS_PUBLICAS.some(r => r.metodo === req.method && r.caminho === req.path);
}

// Middleware: protege tudo em /api que não esteja na lista pública.
function exigirSessao(req, res, next) {
  if (!req.path.startsWith('/api/')) return next();
  if (ehPublica(req)) return next();
  if (autenticado(req)) return next();
  res.status(401).json({ error: 'sessão expirada ou inexistente' });
}

function registarRotas(app) {
  app.post('/api/login', (req, res) => {
    if (!process.env.ADMIN_PASSWORD) {
      return res.status(503).json({ error: 'painel sem password configurada' });
    }
    if (!passwordCorreta(req.body && req.body.password)) {
      return res.status(401).json({ error: 'password errada' });
    }
    res.setHeader('Set-Cookie', cookieSessao(criarSessao(), DURACAO_MS / 1000));
    res.json({ ok: true });
  });

  app.post('/api/logout', (req, res) => {
    res.setHeader('Set-Cookie', cookieSessao('', 0));
    res.json({ ok: true });
  });

  app.get('/api/sessao', (req, res) => {
    res.json({ autenticado: autenticado(req), configurado: !!process.env.ADMIN_PASSWORD });
  });
}

module.exports = {
  NOME_COOKIE, DURACAO_MS, exigirSessao, registarRotas,
  criarSessao, sessaoValida, passwordCorreta, autenticado, cookieSessao
};
