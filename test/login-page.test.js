const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const PUBLICO = path.join(__dirname, '..', 'public');

function inlineScripts(html) {
  return html.replace(/<script src="\/([^"]+)"><\/script>/g, (original, ficheiro) => {
    const caminho = path.join(PUBLICO, ficheiro);
    if (!fs.existsSync(caminho)) return original;
    return '<script>' + fs.readFileSync(caminho, 'utf8') + '</script>';
  });
}

const HTML = inlineScripts(fs.readFileSync(path.join(PUBLICO, 'admin.html'), 'utf8'));

const CONFIG = {
  catalogo: { services: [], materials: [] },
  empresa: { nome: 'Krona' }
};
const PEDIDOS = [{
  id: 1, created_at: new Date().toISOString(), nome_cliente: 'Ana Ferreira',
  morada: 'Rua das Flores 12', telefone: '912345678', tipo_servico: 'Pavimento',
  descricao: '', observacoes_cliente: '', status: 'pendente', itens: [], extras: []
}];

// Carrega a página com uma sessão por autenticar, para exercitar o ecrã de
// entrada. `aoEntrar` decide o que /api/login responde.
function carregar(sessao, aoEntrar) {
  return new Promise(resolve => {
    const dom = new JSDOM(HTML, {
      runScripts: 'dangerously',
      url: 'http://localhost/',
      pretendToBeVisual: true,
      beforeParse(window) {
        window.fetch = async (url) => {
          const u = String(url);
          if (u === '/api/sessao') return { ok: true, json: async () => sessao };
          if (u === '/api/login') return aoEntrar();
          if (u === '/api/config') return { ok: true, json: async () => CONFIG };
          if (u === '/api/pedidos') return { ok: true, json: async () => PEDIDOS };
          if (u === '/api/agenda') return { ok: true, json: async () => [] };
          return { ok: false, status: 404, json: async () => ({}) };
        };
      }
    });
    dom.window.addEventListener('load', () => setTimeout(() => resolve(dom), 80));
  });
}

const entradaAceite = () => ({ ok: true, status: 200, json: async () => ({ ok: true }) });
const entradaRecusada = () => ({ ok: false, status: 401, json: async () => ({ error: 'password errada' }) });

test('sem sessao o painel fica escondido e aparece o ecra de entrada', async () => {
  const dom = await carregar({ autenticado: false, configurado: true }, entradaAceite);
  const doc = dom.window.document;
  assert.strictEqual(doc.getElementById('app').hidden, true, 'o painel tem de ficar escondido');
  assert.strictEqual(doc.getElementById('login-screen').hidden, false, 'o ecra de entrada tem de aparecer');
  assert.strictEqual(doc.getElementById('tab-pendentes').innerHTML.trim(), '', 'nao pode ter carregado dados');
  dom.window.close();
});

test('com sessao valida o painel abre sem passar pelo ecra de entrada', async () => {
  const dom = await carregar({ autenticado: true, configurado: true }, entradaAceite);
  const doc = dom.window.document;
  assert.strictEqual(doc.getElementById('app').hidden, false);
  assert.strictEqual(doc.getElementById('login-screen').hidden, true);
  assert.match(doc.getElementById('tab-pendentes').innerHTML, /Ana Ferreira/);
  dom.window.close();
});

test('entrar com a password certa abre o painel e carrega os dados', async () => {
  const dom = await carregar({ autenticado: false, configurado: true }, entradaAceite);
  const doc = dom.window.document;

  doc.getElementById('login-password').value = 'a-password';
  doc.getElementById('login-btn').click();
  await new Promise(r => setTimeout(r, 100));

  assert.strictEqual(doc.getElementById('app').hidden, false, 'o painel tem de abrir');
  assert.strictEqual(doc.getElementById('login-screen').hidden, true);
  assert.match(doc.getElementById('tab-pendentes').innerHTML, /Ana Ferreira/, 'os dados tem de carregar');
  dom.window.close();
});

test('password errada mantem o painel fechado e avisa', async () => {
  const dom = await carregar({ autenticado: false, configurado: true }, entradaRecusada);
  const doc = dom.window.document;

  doc.getElementById('login-password').value = 'errada';
  doc.getElementById('login-btn').click();
  await new Promise(r => setTimeout(r, 100));

  assert.strictEqual(doc.getElementById('app').hidden, true, 'o painel nao pode abrir');
  assert.strictEqual(doc.getElementById('login-erro').hidden, false, 'tem de aparecer o aviso');
  assert.match(doc.getElementById('login-erro').textContent, /errada/i);
  assert.strictEqual(doc.getElementById('login-password').value, '', 'o campo deve limpar');
  dom.window.close();
});

test('sem password configurada no servidor, o ecra explica porque', async () => {
  const dom = await carregar({ autenticado: false, configurado: false }, entradaAceite);
  const doc = dom.window.document;
  assert.strictEqual(doc.getElementById('login-erro').hidden, false);
  assert.match(doc.getElementById('login-erro').textContent, /password/i);
  dom.window.close();
});
