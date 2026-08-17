const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const raiz = path.join(__dirname, '..');
const ler = p => fs.readFileSync(path.join(raiz, p), 'utf8');

test('pedido.html carrega as folhas de estilo partilhadas', () => {
  const html = ler('public/pedido.html');
  assert.match(html, /href="\/css\/tokens\.css"/);
  assert.match(html, /href="\/css\/base\.css"/);
  assert.match(html, /href="\/css\/components\.css"/);
  assert.match(html, /href="\/css\/pedido\.css"/);
});

test('pedido.html nao tem estilos inline nem bloco <style>', () => {
  const html = ler('public/pedido.html');
  assert.ok(!/\sstyle="/.test(html), 'encontrado atributo style= inline');
  assert.ok(!/<style[\s>]/.test(html), 'encontrado bloco <style>');
});

test('tokens.css define a paleta da spec e nao a antiga', () => {
  const css = ler('public/css/tokens.css');
  for (const token of ['--bg:#F8FAFC', '--accent:#1E293B', '--pend:#C2410C', '--ok:#15803D']) {
    assert.ok(css.replace(/\s/g, '').includes(token.replace(/\s/g, '')), `falta ${token}`);
  }
  // cores da identidade abandonada
  assert.ok(!/#12312B/i.test(css), 'verde-escuro antigo ainda presente');
  assert.ok(!/#FAFAF8/i.test(css), 'creme antigo ainda presente');
});

test('as fontes antigas foram removidas', () => {
  for (const p of ['public/pedido.html', 'public/css/base.css']) {
    const conteudo = ler(p);
    assert.ok(!/Newsreader/i.test(conteudo), `Newsreader ainda em ${p}`);
    assert.ok(!/IBM\+?Plex\+?Mono/i.test(conteudo), `IBM Plex Mono ainda em ${p}`);
  }
});

test('shared.js expoe as funcoes comuns', () => {
  const js = ler('public/js/shared.js');
  for (const nome of ['fmt', 'fmtDate', 'escapeHtml', 'uid', 'apiGet', 'apiSend']) {
    assert.match(js, new RegExp(`function ${nome}\\b`), `falta ${nome}`);
  }
});

test('as paginas carregam shared.js e nao redefinem as funcoes', () => {
  for (const p of ['public/pedido.html', 'public/admin.html']) {
    const html = ler(p);
    assert.match(html, /src="\/js\/shared\.js"/, `${p} nao carrega shared.js`);
    assert.ok(!/function escapeHtml\b/.test(html), `${p} ainda define escapeHtml`);
    assert.ok(!/const fmt =/.test(html), `${p} ainda define fmt`);
  }
});

test('admin.css define os quatro pontos de rutura da spec', () => {
  const css = ler('public/css/admin.css');
  for (const bp of ['768px', '1024px', '1280px']) {
    assert.match(css, new RegExp(`min-width:\\s*${bp}`), `falta o ponto de rutura ${bp}`);
  }
});

test('o admin deixa de bloquear o zoom', () => {
  const html = ler('public/admin.html');
  assert.ok(!/user-scalable\s*=\s*no/.test(html), 'viewport ainda bloqueia zoom');
  assert.ok(!/maximum-scale/.test(html), 'viewport ainda limita a escala');
});

test('admin.html carrega as folhas partilhadas e nao tem bloco <style>', () => {
  const html = ler('public/admin.html');
  assert.match(html, /href="\/css\/tokens\.css"/);
  assert.match(html, /href="\/css\/admin\.css"/);
  assert.ok(!/<style[\s>]/.test(html), 'encontrado bloco <style>');
});

test('o admin nao usa dialogos nativos do browser', () => {
  const html = ler('public/admin.html');
  assert.ok(!/\bprompt\(/.test(html), 'ainda ha prompt()');
  assert.ok(!/\bconfirm\(/.test(html), 'ainda ha confirm()');
  assert.ok(!/\balert\(/.test(html), 'ainda ha alert()');
});

test('existe modal de custo extra com os tres campos', () => {
  const html = ler('public/admin.html');
  for (const id of ['cx-desc', 'cx-tipo', 'cx-valor']) {
    assert.match(html, new RegExp(`id="${id}"`), `falta o campo ${id}`);
  }
});
