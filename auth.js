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
  const base = process.env.SESSION_SECRET || process.env.ADMIN_PASSWORD_HASH || process.env.ADMIN_PASSWORD || '';
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

// Formato do hash: scrypt$<sal em hex>$<derivada em hex>
function criarHash(password) {
  const sal = crypto.randomBytes(16);
  const derivada = crypto.scryptSync(password, sal, 64);
  return ['scrypt', sal.toString('hex'), derivada.toString('hex')].join('$');
}

function confereHash(recebida, hash) {
  const partes = String(hash).split('$');
  if (partes.length !== 3 || partes[0] !== 'scrypt') return false;
  let sal, esperada;
  try {
    sal = Buffer.from(partes[1], 'hex');
    esperada = Buffer.from(partes[2], 'hex');
  } catch (e) { return false; }
  if (sal.length === 0 || esperada.length === 0) return false;
  const derivada = crypto.scryptSync(recebida, sal, esperada.length);
  return crypto.timingSafeEqual(derivada, esperada);
}

function haPassword() {
  return !!(process.env.ADMIN_PASSWORD_HASH || process.env.ADMIN_PASSWORD);
}

function passwordCorreta(recebida) {
  if (typeof recebida !== 'string') return false;

  // Preferimos o hash. O ADMIN_PASSWORD em texto ainda funciona, para nao
  // trancar ninguem de fora durante a transicao, mas e o caminho a abandonar.
  const hash = process.env.ADMIN_PASSWORD_HASH;
  if (hash) return confereHash(recebida, hash);

  const esperada = process.env.ADMIN_PASSWORD;
  if (!esperada) return false;
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

// O contrato é aberto pelo cliente a partir de um link, sem sessão: o código
// no caminho é que dá acesso, e é longo e aleatório. Note-se que
// POST /api/pedidos/:id/contrato — gerar o link — NÃO cai aqui, e continua a
// exigir sessão: só a equipa cria contratos.
function ehContratoPublico(req) {
  return req.path.startsWith('/api/contrato/');
}

function ehPublica(req) {
  if (ehContratoPublico(req)) return true;
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
    if (!haPassword()) {
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
    res.json({ autenticado: autenticado(req), configurado: haPassword() });
  });
}

module.exports = {
  NOME_COOKIE, DURACAO_MS, exigirSessao, registarRotas,
  criarSessao, sessaoValida, passwordCorreta, autenticado, cookieSessao,
  criarHash, haPassword
};
