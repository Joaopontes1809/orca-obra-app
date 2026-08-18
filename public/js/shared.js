function fmt(n) {
  return (Math.round((n || 0) * 100) / 100)
    .toLocaleString('pt-PT', { style: 'currency', currency: 'EUR' });
}

function fmtDate(s) {
  return s ? new Date(s).toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '';
}

// Converte para numero. Campos numericos vindos do formulario publico
// chegam como o cliente os enviou — foi por aqui que entrou um XSS.
function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Custo de um item, separado em material e mão de obra.
 *
 * A mão de obra vem do valor por unidade do material (laborUnitPrice). Se o
 * item não o tiver — porque é antigo, porque o cliente escolheu "a definir na
 * visita", ou porque veio da pesquisa de preços — recuamos para a percentagem
 * do serviço, que era o modelo anterior.
 *
 * Vive aqui porque as duas páginas precisam exactamente da mesma conta, e
 * dinheiro calculado em dois sítios acaba por divergir.
 */
function calcItem(it) {
  const quantidade = num(it && it.quantity);
  const materialCost = quantidade * num(it && it.unitPrice);
  const temValorMaoObra = it && it.laborUnitPrice !== null && it.laborUnitPrice !== undefined && it.laborUnitPrice !== '';
  const laborCost = temValorMaoObra
    ? quantidade * num(it.laborUnitPrice)
    : materialCost * (num(it && it.laborPercent) / 100);
  return { materialCost, laborCost, total: materialCost + laborCost };
}

function calcTotals(items) {
  return (items || []).reduce((acc, it) => {
    const c = calcItem(it);
    acc.material += c.materialCost;
    acc.labor += c.laborCost;
    acc.total += c.total;
    return acc;
  }, { material: 0, labor: 0, total: 0 });
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
