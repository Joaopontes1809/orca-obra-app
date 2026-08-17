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
