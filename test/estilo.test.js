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
