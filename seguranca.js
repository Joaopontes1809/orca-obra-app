// Cabeçalhos de segurança e entrega das páginas com nonce na CSP.
//
// As duas páginas ainda têm um <script> embutido grande. Uma CSP que
// permitisse 'unsafe-inline' não travaria nada — e era exactamente um
// manipulador inline (<img onerror=...>) que servia de veículo ao XSS que
// apareceu nos pedidos. Com nonce, o browser só corre os scripts que nós
// marcámos, e recusa tudo o que venha dos dados.
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const FONTES_CSS = 'https://fonts.googleapis.com';
const FONTES_FICHEIROS = 'https://fonts.gstatic.com';

function politica(nonce) {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}'`,
    `style-src 'self' ${FONTES_CSS}`,
    `font-src 'self' ${FONTES_FICHEIROS}`,
    "img-src 'self' data:",
    "connect-src 'self'",
    "worker-src 'self'",
    "form-action 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'"
  ].join('; ');
}

function cabecalhos(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  // HSTS só faz sentido sobre TLS; em localhost prenderia o browser a https
  if (req.secure || req.headers['x-forwarded-proto'] === 'https') {
    res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
  }
  next();
}

// As páginas são lidas uma vez e guardadas em memória; por pedido só se
// substitui o nonce.
function servirPagina(ficheiro) {
  const caminho = path.join(__dirname, 'public', ficheiro);
  let original = null;

  return function (req, res) {
    if (original === null) original = fs.readFileSync(caminho, 'utf8');
    const nonce = crypto.randomBytes(16).toString('base64');
    const html = original
      .replace(/<script(?![^>]*\bsrc=)/g, `<script nonce="${nonce}"`)
      .replace(/<script src="/g, `<script nonce="${nonce}" src="`);
    res.setHeader('Content-Security-Policy', politica(nonce));
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  };
}

// O express.static serviria estas páginas sem nonce, e aí os scripts seriam
// bloqueados e a página aparecia vazia. Fechamos esses caminhos directos.
// O contrato só existe com um código, por isso não tem para onde redirigir:
// devolve 404.
function bloquearPaginasCruas(req, res, next) {
  if (req.path === '/admin.html') return res.redirect(301, '/');
  if (req.path === '/pedido.html') return res.redirect(301, '/pedido');
  if (req.path === '/contrato.html') return res.status(404).send('Não encontrado.');
  next();
}

module.exports = { cabecalhos, servirPagina, bloquearPaginasCruas, politica };
