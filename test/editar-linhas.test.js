const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ADMIN = fs.readFileSync(path.join(__dirname, '..', 'public', 'admin.html'), 'utf8');

test('as quatro listas do orcamento abrem para edicao', () => {
  for (const marca of ['data-item-edit', 'data-extra-edit', 'data-pag-edit', 'data-desp-edit']) {
    assert.ok(ADMIN.includes(marca), 'falta ' + marca);
  }
});

test('editar substitui a linha em vez de acrescentar outra', () => {
  // o sinal de que e' edicao e nao criacao: escrever no indice, nao push
  assert.match(ADMIN, /draftItems\[itemEmEdicao\] = \{ \.\.\.antigo, \.\.\.dados \}/);
  assert.match(ADMIN, /p\.extras\[custoEmEdicao\] = \{[^}]*nome, tipo, valor \}/);
  assert.match(ADMIN, /p\.pagamentos\[pagamentoEmEdicao\] = \{[^}]*\.\.\.dados \}/);
  assert.match(ADMIN, /p\.despesas\[despesaEmEdicao\] = \{[^}]*\.\.\.dados \}/);
});

test('a edicao do item nao inventa uma unidade quando o servico desapareceu', () => {
  // um servico apagado do catalogo nao pode fazer o item mudar de unidade
  // sozinho: isso mexia no dinheiro sem ninguem mandar
  assert.match(ADMIN, /unit: fechado \? '' : \(s \? s\.unit : \(antigo \? antigo\.unit : ''\)\)/);
  assert.match(ADMIN, /Serviço já não está no catálogo/);
});

test('o formulario diz se esta a criar ou a editar', () => {
  for (const id of ['im-titulo', 'cx-titulo', 'pg-titulo', 'dp-titulo']) {
    assert.ok(ADMIN.includes(`id="${id}"`), 'falta o titulo ' + id);
  }
  assert.match(ADMIN, /textContent = it \? 'Editar item' : 'Adicionar item'/);
});

test('o contrato tem separador proprio', () => {
  assert.match(ADMIN, /data-tab="contrato">Contrato</);
  assert.match(ADMIN, /id="tab-contrato"/);
  // e ja nao vive dentro do catalogo
  const catalogo = ADMIN.slice(ADMIN.indexOf('id="tab-catalogo"'), ADMIN.indexOf('id="tab-contrato"'));
  assert.ok(!catalogo.includes('cat-contrato'), 'o modelo ainda esta no separador do catalogo');
});
