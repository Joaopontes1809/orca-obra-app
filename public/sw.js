// Service worker: guarda a app no telemóvel/tablet para ela abrir de imediato.
//
// O alojamento adormece quando ninguém usa a app, e ao acordar mostra uma
// página de espera que não é nossa e que não podemos mudar. Com isto, quem já
// abriu a app uma vez recebe as páginas e o estilo do próprio aparelho: a
// nossa tela aparece logo, e só os dados é que esperam pelo servidor.
//
// Regras: /api nunca é guardado (dinheiro e dados têm de ser sempre frescos);
// o resto é servido do aparelho e actualizado em segundo plano.
const VERSAO = 'krona-v1';

const ESSENCIAIS = [
  '/css/tokens.css',
  '/css/base.css',
  '/css/components.css',
  '/css/admin.css',
  '/css/pedido.css',
  '/css/contrato.css',
  '/js/shared.js',
  '/icons/icon-32.png',
  '/icons/icon-192.png',
  '/manifest.json'
];

self.addEventListener('install', evento => {
  evento.waitUntil(
    caches.open(VERSAO)
      // um ficheiro em falta não pode impedir a instalação de tudo o resto
      .then(cache => Promise.allSettled(ESSENCIAIS.map(f => cache.add(f))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', evento => {
  evento.waitUntil(
    caches.keys()
      .then(nomes => Promise.all(nomes.filter(n => n !== VERSAO).map(n => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

// Guarda a resposta e devolve-a. Só respostas completas e nossas.
function guardar(pedido, resposta) {
  if (!resposta || !resposta.ok || resposta.type !== 'basic') return resposta;
  const copia = resposta.clone();
  caches.open(VERSAO).then(cache => cache.put(pedido, copia));
  return resposta;
}

// Serve o que está guardado e vai buscar a versão nova em segundo plano, para
// a próxima abertura já ser a actual.
async function doAparelhoEActualizar(pedido) {
  const cache = await caches.open(VERSAO);
  const guardada = await cache.match(pedido);
  const rede = fetch(pedido).then(r => guardar(pedido, r)).catch(() => null);
  if (guardada) return guardada;
  const resposta = await rede;
  if (resposta) return resposta;
  throw new Error('sem ligação e sem cópia guardada');
}

self.addEventListener('fetch', evento => {
  const pedido = evento.request;
  if (pedido.method !== 'GET') return;

  const url = new URL(pedido.url);
  if (url.origin !== self.location.origin) return;   // tipos de letra, etc.
  if (url.pathname.startsWith('/api/')) return;      // dados: sempre da rede

  evento.respondWith(doAparelhoEActualizar(pedido));
});
