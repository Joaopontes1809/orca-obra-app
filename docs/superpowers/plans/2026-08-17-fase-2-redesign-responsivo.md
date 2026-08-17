# Fase 2 — Redesign responsivo

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir o desenho atual por um sistema visual neutro em grafite, com layout que funciona em telemóvel, tablet e computador, e eliminar os diálogos nativos do browser dos fluxos de trabalho.

**Architecture:** O CSS sai das duas páginas para ficheiros próprios servidos como estáticos pelo Express, sem passo de build. Três ficheiros partilhados (`tokens.css`, `base.css`, `components.css`) e um por página. As funções duplicadas nas duas páginas (`fmt`, `escapeHtml`, `apiGet`, `apiSend`) passam para `public/js/shared.js`. O painel ganha quatro pontos de rutura; acima de 1280px o detalhe do pedido aparece num painel lateral em vez de um modal, alimentado pela mesma função de render.

**Tech Stack:** HTML e CSS sem framework, JavaScript sem passo de build, `node:test` com `jsdom` para os testes estruturais.

**Spec:** `docs/superpowers/specs/2026-08-17-redesign-responsivo-design.md`

**Pré-requisito:** a Fase 1 tem de estar publicada e verificada. Este plano assume `app.js`, a suite de testes e a agenda a funcionar.

## Global Constraints

- Paleta fixada na secção 5.2 da spec. Nenhuma cor fora destes tokens:
  `--bg:#F8FAFC`, `--panel:#FFFFFF`, `--border:#E2E8F0`, `--text:#0F172A`, `--dim:#64748B`, `--accent:#1E293B`, `--accent-soft:#F1F5F9`, `--accent-fg:#FFFFFF`, `--pend:#C2410C`, `--pend-bg:#FFF7ED`, `--ok:#15803D`, `--ok-bg:#F0FDF4`, `--danger:#B91C1C`.
- Inter em toda a aplicação. As famílias Newsreader e IBM Plex Mono são removidas. Valores monetários usam `font-variant-numeric: tabular-nums`.
- Pontos de rutura: 768px, 1024px, 1280px. Mobile-first — as regras base servem o telemóvel, as media queries usam `min-width`.
- Nenhum atributo `style="..."` inline no HTML nem nas template strings de JavaScript.
- Nenhuma chamada a `prompt()` ou `confirm()` no `admin.html`.
- Português de Portugal em todo o texto visível.
- Alvos de toque com pelo menos 44px de altura em telemóvel.
- Sem modo escuro (fora de âmbito, secção 6 da spec).

---

### Task 1: Sistema visual e prova no formulário do cliente

O `pedido.html` é a página mais pequena e serve de prova ao sistema visual antes de o aplicar ao painel.

**Files:**
- Create: `public/css/tokens.css`, `public/css/base.css`, `public/css/components.css`, `public/css/pedido.css`
- Modify: `public/pedido.html`
- Create: `test/estilo.test.js`

**Interfaces:**
- Produces: as classes `.btn`, `.btn-primary`, `.btn-ghost`, `.btn-danger`, `.card`, `.field`, `.tag`, `.tag-pend`, `.tag-ok`, `.money`, `.stack`, `.row`, `.empty`, `.modal`, `.overlay`, usadas por todas as tarefas seguintes.

- [ ] **Step 1: Escrever o teste que falha**

Criar `test/estilo.test.js`:

```js
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
```

- [ ] **Step 2: Correr o teste e confirmar que falha**

Run: `npm test`
Expected: FAIL com `ENOENT` em `public/css/tokens.css`

- [ ] **Step 3: Criar `public/css/tokens.css`**

```css
:root {
  --bg: #F8FAFC;
  --panel: #FFFFFF;
  --border: #E2E8F0;
  --text: #0F172A;
  --dim: #64748B;

  --accent: #1E293B;
  --accent-soft: #F1F5F9;
  --accent-fg: #FFFFFF;

  --pend: #C2410C;
  --pend-bg: #FFF7ED;
  --ok: #15803D;
  --ok-bg: #F0FDF4;
  --danger: #B91C1C;

  --r-sm: 6px;
  --r: 8px;
  --r-lg: 12px;

  --s-1: 4px;
  --s-2: 8px;
  --s-3: 12px;
  --s-4: 16px;
  --s-5: 24px;
  --s-6: 32px;

  --shadow: 0 1px 2px rgba(15, 23, 42, .04), 0 4px 12px rgba(15, 23, 42, .06);
  --shadow-pop: 0 -8px 32px rgba(15, 23, 42, .12);

  --sidebar-w: 220px;
  --detail-w: 380px;
}
```

- [ ] **Step 4: Criar `public/css/base.css`**

```css
* { box-sizing: border-box; }

html, body { margin: 0; padding: 0; }

body {
  background: var(--bg);
  color: var(--text);
  font-family: Inter, -apple-system, "Segoe UI", system-ui, sans-serif;
  font-size: 15px;
  line-height: 1.45;
  min-height: 100vh;
  -webkit-tap-highlight-color: transparent;
}

h1, h2, h3 { margin: 0; font-weight: 600; line-height: 1.25; }
h1 { font-size: 19px; }
h2 { font-size: 16px; }
h3 { font-size: 15px; }
p { margin: 0; }

.money { font-variant-numeric: tabular-nums; font-weight: 600; }
.dim { color: var(--dim); }

label {
  display: block;
  font-size: 12px;
  font-weight: 500;
  color: var(--dim);
  margin: 0 0 var(--s-1) 2px;
}

input, select, textarea {
  width: 100%;
  min-height: 44px;
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: var(--r);
  color: var(--text);
  font: inherit;
  padding: 10px 12px;
}

textarea { min-height: 84px; resize: vertical; }

input:focus, select:focus, textarea:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-soft);
}

input::placeholder, textarea::placeholder { color: var(--dim); }

.field { margin-bottom: var(--s-3); }
.stack > * + * { margin-top: var(--s-2); }
.row { display: grid; grid-template-columns: 1fr; gap: var(--s-2); }

@media (min-width: 768px) {
  .row-2 { grid-template-columns: 1fr 1fr; }
  .row-3 { grid-template-columns: 1.4fr 1fr 1fr; }
}
```

O `<link>` das Google Fonts em cada página passa a carregar apenas Inter:

```html
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
```

- [ ] **Step 5: Criar `public/css/components.css`**

```css
/* --- botões --- */
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--s-2);
  min-height: 44px;
  padding: 10px 16px;
  border: 1px solid var(--border);
  border-radius: var(--r);
  background: var(--panel);
  color: var(--text);
  font: inherit;
  font-weight: 500;
  cursor: pointer;
}
.btn:hover { background: var(--accent-soft); }
.btn:active { transform: translateY(1px); }
.btn:disabled { opacity: .5; cursor: default; }
.btn-primary { background: var(--accent); border-color: var(--accent); color: var(--accent-fg); font-weight: 600; }
.btn-primary:hover { background: #0F172A; }
.btn-ghost { background: transparent; color: var(--dim); }
.btn-danger { background: transparent; border-color: var(--danger); color: var(--danger); }
.btn-danger:hover { background: #FEF2F2; }
.btn-block { width: 100%; }
.btn-sm { min-height: 36px; padding: 6px 12px; font-size: 13px; }

/* --- cartões --- */
.card {
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: var(--r-lg);
  padding: var(--s-4);
}
.card-clickable { cursor: pointer; }
.card-clickable:hover { border-color: var(--dim); }
.card-selected { border-color: var(--accent); box-shadow: 0 0 0 2px var(--accent-soft); }

/* --- etiquetas de estado --- */
.tag {
  display: inline-block;
  font-size: 11px;
  font-weight: 600;
  padding: 3px 9px;
  border-radius: 999px;
  background: var(--accent-soft);
  color: var(--dim);
}
.tag-pend { background: var(--pend-bg); color: var(--pend); }
.tag-ok { background: var(--ok-bg); color: var(--ok); }

/* --- linha de item --- */
.item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--s-3);
  padding: var(--s-3);
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: var(--r);
}
.item + .item { margin-top: var(--s-2); }
.item-del {
  background: none;
  border: none;
  color: var(--dim);
  font-size: 20px;
  line-height: 1;
  cursor: pointer;
  padding: var(--s-1) var(--s-2);
  min-height: 44px;
}
.item-del:hover { color: var(--danger); }

/* --- estado vazio --- */
.empty { text-align: center; padding: var(--s-6) var(--s-4); color: var(--dim); }
.empty h2 { color: var(--text); margin-bottom: var(--s-2); }

/* --- modal --- */
.overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, .35);
  display: none;
  align-items: flex-end;
  justify-content: center;
  z-index: 50;
}
.overlay.open { display: flex; }
.modal {
  background: var(--panel);
  width: 100%;
  max-width: 640px;
  max-height: 90vh;
  overflow-y: auto;
  border-radius: var(--r-lg) var(--r-lg) 0 0;
  padding: var(--s-5) var(--s-4) calc(var(--s-4) + env(safe-area-inset-bottom));
  box-shadow: var(--shadow-pop);
}
.modal-actions { display: flex; gap: var(--s-2); margin-top: var(--s-4); flex-wrap: wrap; }
.modal-actions .btn { flex: 1; min-width: 120px; }

@media (min-width: 768px) {
  .overlay { align-items: center; }
  .modal { border-radius: var(--r-lg); max-height: 85vh; }
}

/* --- toast --- */
.toast {
  position: fixed;
  left: 50%;
  bottom: 24px;
  transform: translateX(-50%);
  background: var(--text);
  color: var(--panel);
  padding: 10px 18px;
  border-radius: var(--r);
  font-size: 14px;
  opacity: 0;
  pointer-events: none;
  transition: opacity .2s;
  z-index: 60;
}
.toast.show { opacity: 1; }
```

- [ ] **Step 6: Criar `public/css/pedido.css` e reescrever `public/pedido.html`**

```css
.wrap { max-width: 620px; margin: 0 auto; padding: var(--s-5) var(--s-4) var(--s-6); }

.top { display: flex; align-items: center; gap: var(--s-3); margin-bottom: var(--s-5); }
.top img { width: 40px; height: 40px; border-radius: var(--r); }
.top p { font-size: 12px; color: var(--dim); }

.section-title {
  font-size: 16px;
  font-weight: 600;
  margin: var(--s-5) 0 var(--s-3);
  padding-bottom: var(--s-2);
  border-bottom: 1px solid var(--border);
}
.section-title:first-of-type { margin-top: 0; }

.estimate { border-top: 3px solid var(--accent); }
.estimate-top { display: flex; justify-content: space-between; align-items: baseline; }
.estimate-top .amt { font-size: 26px; color: var(--accent); }
.estimate-note { font-size: 12px; color: var(--dim); margin-top: var(--s-2); }

.result {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--s-2);
  padding: var(--s-3);
  border: 1px solid var(--border);
  border-radius: var(--r);
  margin-top: var(--s-2);
  cursor: pointer;
}
.result:hover { border-color: var(--accent); }

.error { color: var(--danger); font-size: 13px; margin-top: var(--s-3); display: none; }
.error.show { display: block; }

.hidden { display: none; }

@media (min-width: 1024px) {
  .wrap { max-width: 720px; padding-top: var(--s-6); }
}
```

Reescrever `public/pedido.html` mantendo intacto todo o JavaScript de comportamento (cálculo de estimativa, pesquisa de preços, chamada à IA, envio do pedido). Só muda o `<head>`, as classes no markup, e a remoção dos `style=` inline. Os `id` usados pelo script mantêm-se todos: `f-nome`, `f-telefone`, `f-morada`, `f-servico`, `f-material`, `f-search-text`, `f-search-results`, `f-search-selected`, `f-qty`, `f-qty-label`, `btn-add-item`, `f-items`, `f-items-header`, `f-items-count`, `estimate-box`, `estimate-total`, `f-descricao`, `f-obs`, `btn-enviar`, `form-error`, `ai-texto`, `btn-ai-analisar`, `ai-status`, `form-screen`, `done-screen`, `empresa-nome`.

Os `style=` inline hoje presentes no markup (`margin-top`, `flex-shrink`, `width:90px` no input de quantidade das linhas de item) passam a classes em `pedido.css`. A linha de item gerada em `renderItems()` usa `.item` e `.item-del` de `components.css`.

O `<head>` fica:

```html
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<meta name="theme-color" content="#F8FAFC">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/css/tokens.css">
<link rel="stylesheet" href="/css/base.css">
<link rel="stylesheet" href="/css/components.css">
<link rel="stylesheet" href="/css/pedido.css">
```

- [ ] **Step 7: Correr os testes e confirmar que passam**

Run: `npm test`
Expected: PASS, incluindo os 4 testes novos de `estilo.test.js`

- [ ] **Step 8: Ver a página nas quatro larguras**

Arrancar `npm start` com a base de dados e abrir `http://localhost:3000/pedido` a 375, 768, 1024 e 1440 px. Confirmar: sem scroll horizontal, nenhum controlo cortado, os botões com pelo menos 44px de altura em 375.

**Paragem para revisão do utilizador.** Esta página é a prova do sistema visual — antes de o aplicar ao painel inteiro, mostrar e recolher correções à paleta, aos espaçamentos e aos tamanhos de texto. As correções entram em `tokens.css` e `base.css`, e propagam-se sozinhas.

- [ ] **Step 9: Commit**

```bash
git add public/css/ public/pedido.html test/estilo.test.js
git commit -m "feat: sistema visual novo aplicado ao formulario do cliente

Tokens, base e componentes em ficheiros partilhados. Paleta neutra em
grafite, Inter como unica familia, valores em tabular-nums. Sem estilos
inline."
```

---

### Task 2: Extrair as funções partilhadas

**Files:**
- Create: `public/js/shared.js`
- Modify: `public/pedido.html`, `public/admin.html`
- Modify: `test/estilo.test.js`

**Interfaces:**
- Produces: `window.fmt(n)`, `window.fmtDate(s)`, `window.escapeHtml(s)`, `window.uid()`, `window.apiGet(url)`, `window.apiSend(url, method, body)`.

- [ ] **Step 1: Escrever o teste que falha**

Acrescentar a `test/estilo.test.js`:

```js
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
```

- [ ] **Step 2: Correr e confirmar que falha**

Run: `npm test`
Expected: FAIL com `ENOENT` em `public/js/shared.js`

- [ ] **Step 3: Criar `public/js/shared.js`**

```js
function fmt(n) {
  return (Math.round((n || 0) * 100) / 100)
    .toLocaleString('pt-PT', { style: 'currency', currency: 'EUR' });
}

function fmtDate(s) {
  return s ? new Date(s).toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '';
}

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

async function apiGet(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error('erro');
  return r.json();
}

async function apiSend(url, method, body) {
  const r = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined
  });
  if (!r.ok) throw new Error('erro');
  return r.json();
}
```

Nas duas páginas, carregar antes do script de comportamento e apagar as definições duplicadas:

```html
<script src="/js/shared.js"></script>
```

O `pedido.html` não tinha `apiGet`/`apiSend` nem `fmtDate` — passa a ter acesso a eles sem os declarar.

- [ ] **Step 4: Correr os testes e confirmar que passam**

Run: `npm test`
Expected: PASS. Os testes de `admin-page.test.js` da Fase 1 continuam a passar, o que confirma que o painel ainda carrega com as funções vindas de `shared.js`.

- [ ] **Step 5: Commit**

```bash
git add public/js/shared.js public/pedido.html public/admin.html test/estilo.test.js
git commit -m "refactor: extrair funcoes comuns para public/js/shared.js"
```

---

### Task 3: Estrutura do painel e pontos de rutura

**Files:**
- Create: `public/css/admin.css`
- Modify: `public/admin.html` (`<head>`, `<header>`, `<nav>`, `<main>` — não os renders)
- Modify: `test/estilo.test.js`

**Interfaces:**
- Produces: a estrutura `.app > .sidebar + .content + .detail`, e as classes `.sidebar-item`, `.sidebar-item.active`, `.detail-panel`, `.detail-open`.

- [ ] **Step 1: Escrever o teste que falha**

Acrescentar a `test/estilo.test.js`:

```js
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
```

- [ ] **Step 2: Correr e confirmar que falha**

Run: `npm test`
Expected: FAIL com `ENOENT` em `public/css/admin.css`

- [ ] **Step 3: Criar `public/css/admin.css`**

```css
/* telemóvel: cabeçalho com separadores, coluna única */
.app { display: block; }

.topbar {
  position: sticky;
  top: 0;
  z-index: 20;
  background: var(--panel);
  border-bottom: 1px solid var(--border);
}
.brand { display: flex; align-items: center; gap: var(--s-3); padding: var(--s-3) var(--s-4); }
.brand img { width: 32px; height: 32px; border-radius: var(--r-sm); }
.brand-name { font-weight: 600; }
.brand-sub { font-size: 11px; color: var(--dim); text-transform: uppercase; letter-spacing: .5px; }
.brand-actions { margin-left: auto; }

.nav { display: flex; overflow-x: auto; padding: 0 var(--s-2); }
.nav-item {
  flex: 1 0 auto;
  min-width: 84px;
  min-height: 44px;
  padding: 10px 12px;
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  color: var(--dim);
  font: inherit;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;
}
.nav-item.active { color: var(--accent); border-bottom-color: var(--accent); font-weight: 600; }
.nav-badge {
  display: inline-block;
  min-width: 18px;
  padding: 0 5px;
  margin-left: var(--s-1);
  background: var(--pend);
  color: #fff;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
}

.sidebar { display: none; }

.content { padding: var(--s-4); }
.content-head { margin-bottom: var(--s-4); }
.content-head p { font-size: 13px; color: var(--dim); }

.tab { display: none; }
.tab.active { display: block; }

.list { display: grid; grid-template-columns: 1fr; gap: var(--s-3); }

.detail-panel { display: none; }

/* tablet: cartões em duas colunas */
@media (min-width: 768px) {
  .content { padding: var(--s-5); max-width: 900px; margin: 0 auto; }
  .list { grid-template-columns: 1fr 1fr; }
}

/* computador: menu lateral fixo em vez de separadores */
@media (min-width: 1024px) {
  .app { display: flex; min-height: 100vh; align-items: stretch; }
  .topbar { display: none; }

  .sidebar {
    display: flex;
    flex-direction: column;
    gap: 2px;
    width: var(--sidebar-w);
    flex-shrink: 0;
    padding: var(--s-4) var(--s-3);
    background: var(--panel);
    border-right: 1px solid var(--border);
    position: sticky;
    top: 0;
    height: 100vh;
  }
  .sidebar .brand { padding: 0 var(--s-2) var(--s-4); }
  .sidebar-item {
    display: flex;
    align-items: center;
    gap: var(--s-2);
    min-height: 44px;
    padding: 10px 12px;
    border: none;
    border-radius: var(--r);
    background: none;
    color: var(--dim);
    font: inherit;
    font-weight: 500;
    text-align: left;
    cursor: pointer;
  }
  .sidebar-item:hover { background: var(--accent-soft); }
  .sidebar-item.active { background: var(--accent-soft); color: var(--accent); font-weight: 600; }
  .sidebar-foot { margin-top: auto; }

  .content { flex: 1; min-width: 0; max-width: none; margin: 0; padding: var(--s-5); }
}

/* ecrã largo: detalhe em painel lateral em vez de modal */
@media (min-width: 1280px) {
  .detail-panel {
    display: block;
    width: var(--detail-w);
    flex-shrink: 0;
    background: var(--panel);
    border-left: 1px solid var(--border);
    padding: var(--s-5);
    position: sticky;
    top: 0;
    height: 100vh;
    overflow-y: auto;
  }
  .content .list { grid-template-columns: 1fr; }
  .detail-panel .empty { padding-top: var(--s-6); }
}
```

- [ ] **Step 4: Reestruturar o `<body>` do `admin.html`**

O `<head>` passa a:

```html
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<meta name="theme-color" content="#F8FAFC">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/css/tokens.css">
<link rel="stylesheet" href="/css/base.css">
<link rel="stylesheet" href="/css/components.css">
<link rel="stylesheet" href="/css/admin.css">
```

O `user-scalable=no, maximum-scale=1` desaparece.

O corpo passa a ter a marca duplicada — uma no `.topbar` para telemóvel e tablet, outra na `.sidebar` para computador — e as duas listas de navegação partilham o atributo `data-tab`, para que o `switchTab` existente continue a funcionar sem alterações:

```html
<div class="app">
  <div class="topbar">
    <div class="brand"><!-- logo, nome, botão de link --></div>
    <nav class="nav">
      <button class="nav-item active" data-tab="pendentes">Pendentes<span class="nav-badge" id="badge-pendentes"></span></button>
      <!-- confirmados, agenda, catálogo, estatística -->
    </nav>
  </div>

  <aside class="sidebar">
    <div class="brand"><!-- logo e nome --></div>
    <button class="sidebar-item active" data-tab="pendentes">Pendentes<span class="nav-badge" id="badge-pendentes-side"></span></button>
    <!-- confirmados, agenda, catálogo, estatística -->
    <div class="sidebar-foot"><button class="btn btn-block" id="btn-share-link">Link p/ cliente</button></div>
  </aside>

  <main class="content">
    <section id="tab-pendentes" class="tab active"></section>
    <!-- restantes tabs -->
  </main>

  <aside class="detail-panel" id="detail-panel"></aside>
</div>
```

O seletor do `switchTab` passa de `.tab-btn` para `[data-tab]`, para apanhar os botões das duas navegações:

```js
document.querySelectorAll('[data-tab]').forEach(btn => {
  btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});
function switchTab(name){
  activeTab = name;
  document.querySelectorAll('[data-tab]').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
  document.querySelectorAll('.tab').forEach(s => s.classList.toggle('active', s.id === 'tab-' + name));
  if(name === 'agenda') loadAgendaPedidos();
}
```

O badge de pendentes passa a atualizar os dois elementos:

```js
['badge-pendentes', 'badge-pendentes-side'].forEach(id => {
  const el = document.getElementById(id);
  if(!el) return;
  el.textContent = list.length;
  el.hidden = list.length === 0;
});
```

- [ ] **Step 5: Correr os testes e confirmar que passam**

Run: `npm test`
Expected: PASS. Os testes de `admin-page.test.js` da Fase 1 têm de continuar verdes — confirmam que o painel ainda carrega e rende os pendentes.

- [ ] **Step 6: Ver nas quatro larguras**

Arrancar e confirmar a 375, 768, 1024 e 1440: abaixo de 1024 aparecem os separadores no topo e a sidebar está escondida; a partir de 1024 é o contrário; a partir de 1280 aparece a coluna de detalhe à direita.

- [ ] **Step 7: Commit**

```bash
git add public/css/admin.css public/admin.html test/estilo.test.js
git commit -m "feat: estrutura responsiva do painel com menu lateral

Separadores no topo ate 1024px, menu lateral acima disso, coluna de
detalhe a partir de 1280px. Sai o bloqueio de zoom do viewport."
```

---

### Task 4: Listas de pendentes e confirmados

**Files:**
- Modify: `public/admin.html` (`renderPendentes`, `renderConfirmados`)
- Modify: `test/admin-page.test.js`

**Interfaces:**
- Consumes: `.card`, `.tag-pend`, `.tag-ok`, `.money`, `.list` das tarefas anteriores.

- [ ] **Step 1: Escrever o teste que falha**

Acrescentar a `test/admin-page.test.js` (reutilizando o helper `carregar`):

```js
test('os cartoes de pendentes usam as classes do sistema visual', async () => {
  const dom = await carregar();
  const el = dom.window.document.getElementById('tab-pendentes');
  assert.ok(el.querySelector('.card'), 'esperava um .card');
  assert.ok(el.querySelector('.tag-pend'), 'esperava a etiqueta de pendente');
  assert.ok(!/\sstyle="/.test(el.innerHTML), 'estilo inline no markup gerado');
  dom.window.close();
});
```

- [ ] **Step 2: Correr e confirmar que falha**

Run: `npm test`
Expected: FAIL — o markup gerado ainda usa `.proj-card` e `style=` inline

- [ ] **Step 3: Reescrever os dois renders**

`renderPendentes` gera, por pedido:

```js
`<article class="card card-clickable" data-id="${p.id}">
  <div class="card-top">
    <div>
      <h3>${escapeHtml(p.nome_cliente || 'Sem nome')}</h3>
      <p class="dim">${escapeHtml(p.morada || '')}${p.telefone ? ' · ' + escapeHtml(p.telefone) : ''}</p>
    </div>
    ${t.total > 0 ? `<span class="money">~${fmt(t.total)}</span>` : ''}
  </div>
  <div class="card-tags">
    ${servicos.map(s => `<span class="tag tag-pend">${escapeHtml(s)}</span>`).join('')}
  </div>
  ${p.descricao ? `<p class="card-desc dim">${escapeHtml(p.descricao)}</p>` : ''}
</article>`
```

`renderConfirmados` gera a mesma estrutura com `.tag-ok` e sem o `~` no valor. O contentor dos dois passa a `<div class="list">`.

Acrescentar a `admin.css`:

```css
.card-top { display: flex; justify-content: space-between; align-items: flex-start; gap: var(--s-3); }
.card-top .money { color: var(--accent); white-space: nowrap; }
.card-tags { display: flex; gap: var(--s-1); flex-wrap: wrap; margin-top: var(--s-3); }
.card-desc { font-size: 13px; margin-top: var(--s-2); }
```

Os estados vazios passam a usar `.empty` de `components.css`, sem o `<img>` do ícone:

```js
`<div class="empty">
  <h2>Nenhum pedido pendente</h2>
  <p>Partilhe o link de pedido de orçamento com os clientes — os pedidos aparecem aqui automaticamente.</p>
</div>`
```

- [ ] **Step 4: Correr os testes e confirmar que passam**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add public/admin.html public/css/admin.css test/admin-page.test.js
git commit -m "feat: redesenhar as listas de pendentes e confirmados"
```

---

### Task 5: Detalhe em painel lateral acima de 1280px

**Files:**
- Modify: `public/admin.html` (`openPendingDetail`, `openConfirmedDetail`)
- Modify: `test/admin-page.test.js`

**Interfaces:**
- Produces: `mostrarDetalhe(html)` e `fecharDetalhe()`, usadas por todas as vistas de detalhe.

- [ ] **Step 1: Escrever o teste que falha**

```js
test('mostrarDetalhe escolhe painel ou modal conforme a largura', async () => {
  const dom = await carregar();
  const { window } = dom;
  // acima de 1280 o detalhe vai para o painel lateral
  window.matchMedia = q => ({ matches: /1280/.test(q), media: q, addListener(){}, removeListener(){} });
  window.mostrarDetalhe('<p id="prova">olá</p>');
  assert.ok(window.document.querySelector('#detail-panel #prova'), 'esperava o detalhe no painel');
  assert.ok(!window.document.getElementById('detail-overlay').classList.contains('open'));
  dom.window.close();
});

test('abaixo de 1280 o detalhe vai para o modal', async () => {
  const dom = await carregar();
  const { window } = dom;
  window.matchMedia = q => ({ matches: false, media: q, addListener(){}, removeListener(){} });
  window.mostrarDetalhe('<p id="prova">olá</p>');
  assert.ok(window.document.querySelector('#detail-overlay #prova'), 'esperava o detalhe no modal');
  assert.ok(window.document.getElementById('detail-overlay').classList.contains('open'));
  dom.window.close();
});
```

- [ ] **Step 2: Correr e confirmar que falha**

Run: `npm test`
Expected: FAIL com `window.mostrarDetalhe is not a function`

- [ ] **Step 3: Implementar**

Em `public/admin.html`:

```js
const ECRA_LARGO = '(min-width: 1280px)';

// Qual pedido esta aberto no detalhe, e como o voltar a desenhar quando a
// largura muda de lado do ponto de rutura.
let detalheAbertoId = null;
let detalheAbertoTipo = null; // 'pendente' | 'confirmado'

function ecraLargo(){
  return window.matchMedia(ECRA_LARGO).matches;
}

function reabrirDetalhe(){
  if(detalheAbertoId == null) return;
  if(detalheAbertoTipo === 'pendente') openPendingDetail(detalheAbertoId);
  else openConfirmedDetail(detalheAbertoId);
}

// Mesmo conteudo, contentor diferente conforme o espaco disponivel.
function mostrarDetalhe(html){
  const painel = document.getElementById('detail-panel');
  const overlay = document.getElementById('detail-overlay');
  const modal = document.getElementById('detail-modal-content');
  if(ecraLargo()){
    overlay.classList.remove('open');
    modal.innerHTML = '';
    painel.innerHTML = html;
    return painel;
  }
  painel.innerHTML = '';
  modal.innerHTML = html;
  overlay.classList.add('open');
  return modal;
}

function fecharDetalhe(){
  detalheAbertoId = null;
  detalheAbertoTipo = null;
  document.getElementById('detail-overlay').classList.remove('open');
  document.getElementById('detail-modal-content').innerHTML = '';
  document.getElementById('detail-panel').innerHTML = detalheVazio();
  document.querySelectorAll('.card-selected').forEach(c => c.classList.remove('card-selected'));
}

function detalheVazio(){
  return `<div class="empty"><p>Escolha um pedido para ver o orçamento.</p></div>`;
}
```

`openPendingDetail` e `openConfirmedDetail` passam a construir o HTML numa variável e a chamar `mostrarDetalhe(html)`, ligando os listeners ao elemento devolvido em vez de a `content`. Cada uma delas começa por registar o que está aberto:

```js
detalheAbertoId = id;
detalheAbertoTipo = 'pendente';   // 'confirmado' em openConfirmedDetail
```

e marca o cartão correspondente:

```js
document.querySelectorAll('.card-selected').forEach(c => c.classList.remove('card-selected'));
const cartao = document.querySelector(`.card[data-id="${id}"]`);
if(cartao) cartao.classList.add('card-selected');
```

Quando a largura atravessa o ponto de rutura com um detalhe aberto, o conteúdo é redesenhado no contentor certo:

```js
window.matchMedia(ECRA_LARGO).addEventListener('change', reabrirDetalhe);
```

O `detalhe-panel` arranca com `detalheVazio()` em `renderAll()`, para que a coluna da direita nunca fique em branco a 1440px.

- [ ] **Step 4: Correr os testes e confirmar que passam**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Verificar a olho**

A 1440px: clicar num pedido preenche a coluna da direita e o cartão fica marcado, sem modal. A 1024px: o mesmo clique abre modal. Reduzir a janela com o detalhe aberto e confirmar que o conteúdo muda de sítio sem se perder.

- [ ] **Step 6: Commit**

```bash
git add public/admin.html test/admin-page.test.js
git commit -m "feat: detalhe do pedido em painel lateral acima de 1280px

O mesmo render alimenta o painel e o modal; muda so o contentor."
```

---

### Task 6: Substituir os diálogos nativos do browser

**Files:**
- Modify: `public/admin.html`
- Modify: `test/estilo.test.js`

**Interfaces:**
- Produces: `confirmar({ titulo, texto, acao })` devolvendo `Promise<boolean>`; modal de custo extra com os campos `cx-desc`, `cx-tipo`, `cx-valor`.

- [ ] **Step 1: Escrever o teste que falha**

```js
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
```

- [ ] **Step 2: Correr e confirmar que falha**

Run: `npm test`
Expected: FAIL — há 5 `prompt(` e 2 `confirm(` no ficheiro

- [ ] **Step 3: Criar o diálogo de confirmação**

Markup, uma vez, junto dos outros overlays:

```html
<div class="overlay" id="confirm-overlay">
  <div class="modal">
    <h2 id="confirm-titulo"></h2>
    <p class="dim" id="confirm-texto"></p>
    <div class="modal-actions">
      <button class="btn btn-ghost" id="confirm-nao">Cancelar</button>
      <button class="btn btn-danger" id="confirm-sim"></button>
    </div>
  </div>
</div>
```

```js
function confirmar({ titulo, texto, acao }){
  return new Promise(resolve => {
    const overlay = document.getElementById('confirm-overlay');
    document.getElementById('confirm-titulo').textContent = titulo;
    document.getElementById('confirm-texto').textContent = texto;
    const sim = document.getElementById('confirm-sim');
    const nao = document.getElementById('confirm-nao');
    sim.textContent = acao;

    function fechar(resposta){
      overlay.classList.remove('open');
      sim.removeEventListener('click', aoSim);
      nao.removeEventListener('click', aoNao);
      resolve(resposta);
    }
    function aoSim(){ fechar(true); }
    function aoNao(){ fechar(false); }

    sim.addEventListener('click', aoSim);
    nao.addEventListener('click', aoNao);
    overlay.classList.add('open');
  });
}
```

Os dois `confirm()` passam a:

```js
if(!await confirmar({
  titulo: 'Recusar este pedido?',
  texto: 'O pedido é apagado e não pode ser recuperado.',
  acao: 'Recusar'
})) return;
```

```js
if(!await confirmar({
  titulo: 'Excluir este orçamento?',
  texto: 'O orçamento e os seus itens são apagados e não podem ser recuperados.',
  acao: 'Excluir'
})) return;
```

- [ ] **Step 4: Criar o modal de custo extra**

```html
<div class="overlay" id="custo-overlay">
  <div class="modal">
    <h2>Custo extra</h2>
    <p class="dim">Materiais novos, ajudantes, mão de obra extra — tudo o que não está nos itens.</p>
    <div class="field"><label for="cx-desc">Descrição</label>
      <input id="cx-desc" placeholder="Ex: Ajudante — 2 dias"></div>
    <div class="field"><label for="cx-tipo">Tipo</label>
      <select id="cx-tipo">
        <option value="mao_de_obra">Mão de obra / ajudante</option>
        <option value="material">Material extra</option>
        <option value="outro">Outro</option>
      </select></div>
    <div class="field"><label for="cx-valor">Valor (€)</label>
      <input id="cx-valor" type="number" inputmode="decimal" min="0" step="0.01" placeholder="0,00"></div>
    <p class="error" id="cx-erro">Preencha a descrição e um valor maior que zero.</p>
    <div class="modal-actions">
      <button class="btn btn-ghost" id="cx-cancelar">Cancelar</button>
      <button class="btn btn-primary" id="cx-confirmar">Adicionar</button>
    </div>
  </div>
</div>
```

O listener de `#ed-add-extra` deixa de encadear três `prompt()` e passa a abrir este modal. Ao confirmar, valida descrição não vazia e valor maior que zero, e só então acrescenta:

```js
p.extras.push({ id: uid(), nome, tipo, valor });
```

O campo `tipo` deixa de ser texto livre — os três valores vêm do `<select>`, o que elimina a necessidade de escrever `mao_de_obra_extra` à mão.

- [ ] **Step 5: Substituir os `prompt()` restantes**

O nome da empresa passa a edição inline: o `.brand-name` ganha `contenteditable="true"` com `aria-label`, guardando em `blur` e em `Enter`. Os dois `prompt()` de partilha do link (fallback quando não há `navigator.share` nem `navigator.clipboard`) passam a um modal com o link num `<input readonly>` selecionado ao abrir.

- [ ] **Step 6: Correr os testes e confirmar que passam**

Run: `npm test`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add public/admin.html test/estilo.test.js
git commit -m "feat: substituir prompt() e confirm() por dialogos proprios

O custo extra pedia tres prompt() encadeados, um deles obrigando a
escrever mao_de_obra_extra a mao. Passa a modal com select."
```

---

### Task 7: Agenda, catálogo e estatísticas

**Files:**
- Modify: `public/admin.html` (`renderAgenda`, `renderCatalogView`, `renderStats`), `public/css/admin.css`
- Modify: `test/admin-page.test.js`

- [ ] **Step 1: Escrever o teste que falha**

```js
test('os renders de agenda, catalogo e estatisticas nao geram estilo inline', async () => {
  const dom = await carregar();
  for (const id of ['tab-agenda', 'tab-catalogo', 'tab-stats']) {
    const html = dom.window.document.getElementById(id).innerHTML;
    assert.ok(!/\sstyle="/.test(html), `estilo inline em ${id}`);
  }
  dom.window.close();
});
```

- [ ] **Step 2: Correr e confirmar que falha**

Run: `npm test`
Expected: FAIL — os três renders usam `style=` inline

- [ ] **Step 3: Reescrever os três renders**

A agenda mantém o agrupamento por dia e o cabeçalho relativo ("Hoje", "Amanhã", "Ontem") já implementados em `fmtAgendaDate`. Os cartões passam a `.card` com a etiqueta de tipo em `.tag`. As cores por tipo saem do objeto `TIPO_AGENDA`, que deixa de guardar valores de cor e passa a guardar apenas a classe:

```js
const TIPO_AGENDA = {
  visita: { label: 'Visita', classe: 'tag-pend' },
  obra: { label: 'Obra', classe: 'tag-ok' },
  reuniao: { label: 'Reunião', classe: 'tag' },
  outro: { label: 'Outro', classe: 'tag' }
};
```

O catálogo passa as linhas de serviço e material a `.item`, com o input de preço a usar uma classe `.item-input` em vez de largura inline.

As estatísticas passam a uma grelha de `.stat`:

```css
.stats { display: grid; grid-template-columns: 1fr 1fr; gap: var(--s-3); }
.stat { background: var(--panel); border: 1px solid var(--border); border-radius: var(--r-lg); padding: var(--s-4); }
.stat .v { font-size: 24px; font-weight: 600; font-variant-numeric: tabular-nums; }
.stat .k { font-size: 12px; color: var(--dim); margin-top: var(--s-1); }
.stat-wide { grid-column: 1 / -1; }
.bar { margin-bottom: var(--s-3); }
.bar-top { display: flex; justify-content: space-between; font-size: 13px; margin-bottom: var(--s-1); }
.bar-track { height: 6px; border-radius: 999px; background: var(--accent-soft); overflow: hidden; }
.bar-fill { height: 100%; background: var(--accent); }

@media (min-width: 1024px) { .stats { grid-template-columns: repeat(4, 1fr); } }
```

O `grid-column: 1/-1` que hoje é inline passa à classe `.stat-wide`.

- [ ] **Step 4: Correr os testes e confirmar que passam**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add public/admin.html public/css/admin.css test/admin-page.test.js
git commit -m "feat: redesenhar agenda, catalogo e estatisticas"
```

---

### Task 8: Decidir os dois pontos de comportamento

Os pontos 4 e 5 da secção 5.4 da spec estão marcados como propostos, não decididos. Esta tarefa apresenta cada um ao utilizador com o comportamento já implementável e recolhe a decisão.

**Files:**
- Modify: `public/admin.html`, `app.js` (só se o ponto 4 for aceite)
- Modify: `test/app.test.js` (só se o ponto 4 for aceite)

- [ ] **Step 1: Apresentar o ponto 4 e obter decisão**

Hoje, "+ Novo orçamento" faz `POST /api/pedidos/manual` **antes** de o utilizador escrever nada, e fechar sem preencher deixa um registo vazio na base de dados. A alternativa é criar o orçamento em memória e só o enviar ao guardar.

Custo da mudança: `openConfirmedDetail` passa a aceitar um orçamento sem `id`, e o botão Guardar escolhe entre `POST /api/pedidos/manual` e `PATCH /api/pedidos/:id` conforme exista ou não `id`.

**Não implementar sem decisão do utilizador.**

- [ ] **Step 2: Implementar o ponto 4 se aceite**

Teste primeiro:

```js
test('POST /api/pedidos/manual aceita um orcamento ja preenchido', async () => {
  const pool = stubPool(() => ({ rows: [{ id: 9 }] }));
  const srv = await listen(createApp(pool));
  try {
    const r = await fetch(`${srv.url}/api/pedidos/manual`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nome_cliente: 'Rui Nunes', telefone: '910222333', morada: 'Praceta Verde 3',
        nome_orcamento: 'Telhado — Rui Nunes', itens: [], extras: []
      })
    });
    assert.strictEqual(r.status, 200);
    const insert = pool.calls.find(c => c.text.includes('INSERT INTO pedidos'));
    assert.strictEqual(insert.values[0], 'Rui Nunes');
  } finally {
    await srv.close();
  }
});
```

- [ ] **Step 3: Apresentar o ponto 5 e obter decisão**

Hoje, confirmar um pedido pendente chama `switchTab('confirmados')` e a seguir `openConfirmedDetail(id)`, dois saltos de contexto seguidos. Acima de 1280px o painel de detalhe pode simplesmente passar a mostrar o orçamento confirmado, sem mudar de separador. Abaixo dessa largura o comportamento atual mantém-se, por não haver espaço para as duas vistas.

**Não implementar sem decisão do utilizador.**

- [ ] **Step 4: Implementar o ponto 5 se aceite**

Em `openPendingDetail`, no listener de confirmar:

```js
pedidos = pedidos.map(x => x.id === id ? updated : x);
renderAll();
if(!ecraLargo()) switchTab('confirmados');
openConfirmedDetail(id);
showToast('Pedido confirmado — pode agora montar o orçamento');
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: ajustar os fluxos de novo orcamento e confirmacao"
```

---

### Task 9: Verificação responsiva e publicação

- [ ] **Step 1: Correr a suite completa**

Run: `npm test`
Expected: PASS, zero falhas

- [ ] **Step 2: Verificar as quatro larguras nas duas páginas**

Com `npm start` ligado à base de dados real, percorrer `http://localhost:3000` e `http://localhost:3000/pedido` a 375, 768, 1024 e 1440 px. Em cada largura e em cada separador confirmar:

- sem scroll horizontal no `body`
- nenhum elemento interativo cortado ou sobreposto
- os botões com pelo menos 44px de altura a 375px
- o zoom do browser funciona

- [ ] **Step 3: Confirmar que os critérios da spec estão cumpridos**

```bash
grep -c 'style="' public/admin.html public/pedido.html
grep -cE '\b(prompt|confirm|alert)\(' public/admin.html
```

Expected: `0` nas três contagens.

- [ ] **Step 4: PARAR e pedir aprovação para publicar**

Mostrar `git log --oneline origin/main..HEAD` e `git diff --stat origin/main..HEAD`. Explicar que o passo seguinte publica em https://orca-obra-app-v2.onrender.com.

**Não executar o Step 5 sem um sim explícito.**

- [ ] **Step 5: Publicar (só após aprovação)**

```bash
git push origin HEAD:main
```

- [ ] **Step 6: Confirmar em produção**

Abrir https://orca-obra-app-v2.onrender.com nas quatro larguras e confirmar que o desenho novo está no ar e que os dados reais carregam.

---

## Critérios de aceitação da fase

Retirados da secção 5.6 da spec:

- Nenhum atributo `style="..."` inline nas duas páginas
- Nenhuma chamada a `prompt()` ou `confirm()` no `admin.html`
- As duas páginas carregam `tokens.css`, `base.css` e `components.css`
- Nas larguras 375, 768, 1024 e 1440 não há scroll horizontal e nenhum elemento interativo fica cortado ou sobreposto
- Acima de 1280 o detalhe do pedido aparece em painel lateral, não em modal
- O zoom do browser funciona nas duas páginas
