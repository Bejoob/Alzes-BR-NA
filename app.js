/**
 * Alzes Tracker (BR & NA) – app.js
 *
 * Instruções rápidas:
 * - Os dados são salvos localmente no navegador, na chave: "alzes_records_v1".
 * - Para resetar tudo: abra o console e execute: localStorage.removeItem('alzes_records_v1')
 * - Para migrar de uma chave antiga: recupere, transforme no formato abaixo e salve com saveData().
 * - Para exportar backup JSON: clique em "Backup JSON" no topo.
 *
 * Estrutura do registro:
 * { date: 'DD-MM-YYYY', br: number, na: number, notes?: string }
 */

// ========================= Constantes & Estado =========================
const STORAGE_KEY = 'alzes_records_v1';
const THEME_KEY = 'alzes_theme_v1';

let state = {
  records: [],          // Array<{date, br, na, notes}>
  filtered: [],         // Visão atual após filtros e modo de visualização
  sortDesc: true,       // true: mais recentes primeiro
  viewMode: 'daily',    // 'daily' | 'monthly'
};

// ========================= Utilidades =========================
const qs = (sel) => document.querySelector(sel);
const qsa = (sel) => Array.from(document.querySelectorAll(sel));

function showToast(message) {
  const toast = qs('#toast');
  toast.textContent = message;
  toast.classList.add('show');
  window.clearTimeout(showToast._t);
  showToast._t = window.setTimeout(() => toast.classList.remove('show'), 2200);
}

function parseDateString(ddmmyyyy) {
  const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(ddmmyyyy);
  if (!m) return null;
  const [_, dd, mm, yyyy] = m;
  const d = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
  // validação simples: mantém o mesmo dia/mês/ano após construir Date
  if (d.getFullYear() !== Number(yyyy) || d.getMonth() + 1 !== Number(mm) || d.getDate() !== Number(dd)) {
    return null;
  }
  return d;
}

function formatDate(d) {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = String(d.getFullYear());
  return `${dd}-${mm}-${yyyy}`;
}

function dateToKeyMonth(ddmmyyyy) {
  const d = parseDateString(ddmmyyyy);
  if (!d) return null;
  return `${String(d.getFullYear())}-${String(d.getMonth() + 1).padStart(2, '0')}`; // YYYY-MM
}

function sortByDateDesc(a, b) {
  const da = parseDateString(a.date);
  const db = parseDateString(b.date);
  return db - da;
}

function downloadFile(filename, text, mime = 'text/plain') {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ========================= Storage Layer =========================
function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    // normaliza chaves
    return data.map(r => ({
      date: r.date,
      br: Number(r.br) || 0,
      na: Number(r.na) || 0,
      notes: r.notes ? String(r.notes) : ''
    })).filter(r => parseDateString(r.date));
  } catch (e) {
    console.error('Erro ao carregar dados:', e);
    return [];
  }
}

function saveData(records) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  } catch (e) {
    console.error('Erro ao salvar dados:', e);
  }
}

// ========================= CRUD =========================
function addRecord(record) {
  const existsIdx = state.records.findIndex(r => r.date === record.date);
  if (existsIdx >= 0) {
    // sobrescreve a mesma data
    state.records[existsIdx] = record;
  } else {
    state.records.push(record);
  }
  state.records.sort(sortByDateDesc);
  saveData(state.records);
}

function editRecord(date, updated) {
  const idx = state.records.findIndex(r => r.date === date);
  if (idx >= 0) {
    state.records[idx] = { ...state.records[idx], ...updated };
    state.records.sort(sortByDateDesc);
    saveData(state.records);
  }
}

function deleteRecord(date) {
  state.records = state.records.filter(r => r.date !== date);
  saveData(state.records);
}

// ========================= Filtros =========================
function filterRecords(options = {}) {
  const { start, end, query, viewMode = state.viewMode } = options;
  const byDateRange = (r) => {
    const d = parseDateString(r.date);
    if (!d) return false;
    if (start) {
      const ds = parseDateString(start);
      if (!ds) return false;
      if (d < ds) return false;
    }
    if (end) {
      const de = parseDateString(end);
      if (!de) return false;
      if (d > de) return false;
    }
    return true;
  };

  let filtered = state.records.filter(byDateRange);

  if (query && query.trim()) {
    const q = query.trim();
    filtered = filtered.filter(r => r.date.includes(q));
  }

  if (viewMode === 'monthly') {
    const map = new Map(); // key: YYYY-MM -> { date: label, br, na }
    for (const r of filtered) {
      const key = dateToKeyMonth(r.date);
      if (!key) continue;
      const cur = map.get(key) || { date: key, br: 0, na: 0, notes: '' };
      cur.br += r.br;
      cur.na += r.na;
      map.set(key, cur);
    }
    filtered = Array.from(map.values()).sort((a, b) => b.date.localeCompare(a.date));
  } else {
    filtered.sort(sortByDateDesc);
  }

  state.filtered = filtered;
  return filtered;
}

// ========================= Export / Import =========================
function exportCSV(records) {
  const headers = ['data', 'alzes_BR', 'alzes_NA', 'total', 'notas'];
  const lines = [headers.join(',')];
  for (const r of records) {
    const total = r.br + r.na;
    const row = [r.date, r.br, r.na, total, (r.notes || '').replace(/,/g, ';')];
    lines.push(row.join(','));
  }
  const csv = lines.join('\n');
  downloadFile('alzes.csv', csv, 'text/csv');
}

function parseCSV(text) {
  // simples: divide por linhas e vírgulas (sem aspas escapadas avançadas)
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (lines.length === 0) return [];
  const [header, ...rows] = lines;
  const cols = header.split(',').map(s => s.trim().toLowerCase());
  const colIdx = {
    date: cols.indexOf('data'),
    br: cols.indexOf('alzes_br'),
    na: cols.indexOf('alzes_na'),
    notes: cols.indexOf('notas')
  };
  const out = [];
  for (const row of rows) {
    const parts = row.split(',');
    const date = parts[colIdx.date]?.trim();
    const br = Number(parts[colIdx.br] || 0);
    const na = Number(parts[colIdx.na] || 0);
    const notes = (colIdx.notes >= 0 ? parts[colIdx.notes] : '') || '';
    if (!date || parseDateString(date) === null || br < 0 || na < 0) continue;
    out.push({ date, br, na, notes });
  }
  return out;
}

function exportJSON(records) {
  downloadFile('alzes_backup.json', JSON.stringify(records, null, 2), 'application/json');
}

// ========================= Renderização =========================
function renderTable() {
  const tbody = qs('#recordsTbody');
  tbody.innerHTML = '';
  const rows = state.filtered;
  for (const r of rows) {
    const tr = document.createElement('tr');

    const tdSel = document.createElement('td');
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.className = 'row-select';
    cb.dataset.date = r.date;
    tdSel.appendChild(cb);

    const tdDate = document.createElement('td');
    tdDate.textContent = r.date;

    const tdBr = document.createElement('td');
    tdBr.textContent = r.br;

    const tdNa = document.createElement('td');
    tdNa.textContent = r.na;

    const tdTotal = document.createElement('td');
    tdTotal.textContent = r.br + r.na;

    const tdNotes = document.createElement('td');
    tdNotes.textContent = r.notes || '';

    const tdActions = document.createElement('td');
    tdActions.className = 'actions-col';
    const actions = document.createElement('div');
    actions.className = 'row-actions';
    const editBtn = document.createElement('button');
    editBtn.className = 'btn ghost';
    editBtn.textContent = 'Editar';
    editBtn.addEventListener('click', () => onEditRow(r));
    const delBtn = document.createElement('button');
    delBtn.className = 'btn danger ghost';
    delBtn.textContent = 'Excluir';
    delBtn.addEventListener('click', () => onDeleteRow(r));
    actions.append(editBtn, delBtn);
    tdActions.appendChild(actions);

    tr.append(tdSel, tdDate, tdBr, tdNa, tdTotal, tdNotes, tdActions);
    tbody.appendChild(tr);
  }
}

function renderSummary() {
  const wrap = qs('#summary');
  const data = state.filtered;
  const totalBR = data.reduce((s, r) => s + r.br, 0);
  const totalNA = data.reduce((s, r) => s + r.na, 0);
  const total = totalBR + totalNA;
  const count = data.length || 1;
  const avgBR = Math.round(totalBR / count);
  const avgNA = Math.round(totalNA / count);

  wrap.innerHTML = `
    <div class="pill"><div class="value">${totalBR.toLocaleString()}</div><div class="label">Total BR</div></div>
    <div class="pill"><div class="value">${totalNA.toLocaleString()}</div><div class="label">Total NA</div></div>
    <div class="pill"><div class="value">${total.toLocaleString()}</div><div class="label">Total geral</div></div>
    <div class="pill"><div class="value">${avgBR.toLocaleString()}</div><div class="label">Média diária BR</div></div>
    <div class="pill"><div class="value">${avgNA.toLocaleString()}</div><div class="label">Média diária NA</div></div>
    <div class="pill"><div class="value">${data.length}</div><div class="label">Registros no período</div></div>
  `;
}

let chartInstance = null;
function renderChart() {
  const ctx = qs('#alzesChart').getContext('2d');
  const sorted = [...state.filtered];
  if (state.viewMode === 'daily') sorted.sort(sortByDateDesc).reverse(); // asc para linha
  else sorted.sort((a, b) => a.date.localeCompare(b.date));

  const labels = sorted.map(r => r.date);
  const dataBR = sorted.map(r => r.br);
  const dataNA = sorted.map(r => r.na);
  const dataTotal = sorted.map(r => r.br + r.na);

  const ds = [
    { label: 'BR', data: dataBR, borderColor: '#6aa1ff', backgroundColor: 'rgba(106,161,255,0.2)' },
    { label: 'NA', data: dataNA, borderColor: '#63e2b7', backgroundColor: 'rgba(99,226,183,0.2)' },
    { label: 'Total', data: dataTotal, borderColor: '#ffce5c', backgroundColor: 'rgba(255,206,92,0.2)' },
  ];

  if (chartInstance) {
    chartInstance.data.labels = labels;
    chartInstance.data.datasets.forEach((d, i) => { d.data = ds[i].data; });
    chartInstance.update();
    return;
  }

  chartInstance = new Chart(ctx, {
    type: 'line',
    data: { labels, datasets: ds.map(d => ({
      label: d.label,
      data: d.data,
      fill: false,
      borderColor: d.borderColor,
      backgroundColor: d.backgroundColor,
      tension: 0.25,
      pointRadius: 3,
    })) },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: { legend: { display: true } },
      scales: { x: { display: true }, y: { beginAtZero: true } }
    }
  });
}

// ========================= Eventos UI =========================
function onSubmitForm(e) {
  e.preventDefault();
  const date = qs('#dateInput').value.trim();
  const br = Number(qs('#brInput').value);
  const na = Number(qs('#naInput').value);
  const notes = qs('#notesInput').value.trim();
  const errorEl = qs('#formError');

  // validação
  if (!date || !parseDateString(date)) {
    errorEl.textContent = 'Informe uma data válida no formato DD-MM-YYYY.';
    return;
  }
  if (Number.isNaN(br) || br < 0 || Number.isNaN(na) || na < 0) {
    errorEl.textContent = 'Informe valores numéricos maiores ou iguais a 0.';
    return;
  }
  errorEl.textContent = '';

  addRecord({ date, br, na, notes });
  applyCurrentFilters();
  renderTable();
  renderSummary();
  renderChart();
  highlightRow(date);
  showToast('Registro salvo.');
  qs('#entryForm').reset();
}

function highlightRow(date) {
  const row = qsa('#recordsTbody tr').find(tr => tr.children[1]?.textContent === date);
  if (row) {
    row.classList.remove('blink-add');
    // force reflow
    // eslint-disable-next-line no-unused-expressions
    row.offsetHeight;
    row.classList.add('blink-add');
  }
}

function onEditRow(record) {
  const newBR = prompt(`Editar Alzes BR para ${record.date}:`, String(record.br));
  if (newBR === null) return;
  const br = Number(newBR);
  const newNA = prompt(`Editar Alzes NA para ${record.date}:`, String(record.na));
  if (newNA === null) return;
  const na = Number(newNA);
  const newNotes = prompt(`Editar notas para ${record.date}:`, String(record.notes || ''));
  if (Number.isNaN(br) || br < 0 || Number.isNaN(na) || na < 0) {
    showToast('Valores inválidos.');
    return;
  }
  editRecord(record.date, { br, na, notes: newNotes || '' });
  applyCurrentFilters();
  renderTable();
  renderSummary();
  renderChart();
  showToast('Registro atualizado.');
}

function onDeleteRow(record) {
  if (confirm(`Excluir o registro de ${record.date}?`)) {
    deleteRecord(record.date);
    applyCurrentFilters();
    renderTable();
    renderSummary();
    renderChart();
    showToast('Registro excluído.');
  }
}

function onDeleteSelected() {
  const dates = qsa('.row-select:checked').map(cb => cb.dataset.date);
  if (dates.length === 0) return;
  if (!confirm(`Excluir ${dates.length} registro(s) selecionado(s)?`)) return;
  for (const d of dates) deleteRecord(d);
  applyCurrentFilters();
  renderTable();
  renderSummary();
  renderChart();
  showToast('Selecionados excluídos.');
}

function onImportCSV(file) {
  const reader = new FileReader();
  reader.onload = () => {
    const text = String(reader.result || '');
    const rows = parseCSV(text);
    if (rows.length === 0) {
      showToast('CSV vazio ou inválido.');
      return;
    }
    // detectar duplicatas por data
    const duplicates = rows.filter(r => state.records.some(x => x.date === r.date));
    let proceed = true;
    if (duplicates.length > 0) {
      proceed = confirm(`${duplicates.length} data(s) já existem. Deseja sobrescrever?`);
    }
    const merged = [...state.records];
    for (const r of rows) {
      const idx = merged.findIndex(x => x.date === r.date);
      if (idx >= 0) {
        if (proceed) merged[idx] = r; // sobrescreve
      } else {
        merged.push(r);
      }
    }
    merged.sort(sortByDateDesc);
    state.records = merged;
    saveData(state.records);
    applyCurrentFilters();
    renderTable();
    renderSummary();
    renderChart();
    showToast('Importação concluída.');
  };
  reader.readAsText(file);
}

function exportCurrentCSV() {
  exportCSV(state.filtered);
}

function applyCurrentFilters() {
  const start = qs('#dateStart').value.trim();
  const end = qs('#dateEnd').value.trim();
  const q = qs('#searchDate').value.trim();
  state.viewMode = qs('#viewMode').value;
  filterRecords({ start: start || undefined, end: end || undefined, query: q || undefined, viewMode: state.viewMode });
}

function clearFilters() {
  qs('#dateStart').value = '';
  qs('#dateEnd').value = '';
  qs('#searchDate').value = '';
  qs('#viewMode').value = 'daily';
  state.viewMode = 'daily';
  state.filtered = [...state.records].sort(sortByDateDesc);
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme');
  const next = current === 'light' ? null : 'light';
  if (next) document.documentElement.setAttribute('data-theme', next);
  else document.documentElement.removeAttribute('data-theme');
  localStorage.setItem(THEME_KEY, next || 'dark');
  qs('#toggleThemeBtn').setAttribute('aria-pressed', String(!!next));
}

function initTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  if (saved === 'light') {
    document.documentElement.setAttribute('data-theme', 'light');
    qs('#toggleThemeBtn').setAttribute('aria-pressed', 'true');
  }
}

// ========================= Inicialização =========================
function init() {
  initTheme();
  state.records = loadData();
  state.filtered = [...state.records].sort(sortByDateDesc);

  // Preencher data padrão (hoje)
  const today = new Date();
  qs('#dateInput').value = formatDate(today);

  // Eventos
  qs('#entryForm').addEventListener('submit', onSubmitForm);
  qs('#clearFormBtn').addEventListener('click', () => qs('#entryForm').reset());
  qs('#applyFiltersBtn').addEventListener('click', () => { applyCurrentFilters(); renderTable(); renderSummary(); renderChart(); });
  qs('#clearFiltersBtn').addEventListener('click', () => { clearFilters(); renderTable(); renderSummary(); renderChart(); });
  qs('#exportCsvBtn').addEventListener('click', exportCurrentCSV);
  qs('#exportJsonBtn').addEventListener('click', () => exportJSON(state.records));
  qs('#importCsvInput').addEventListener('change', (e) => { const f = e.target.files?.[0]; if (f) onImportCSV(f); e.target.value = ''; });
  qs('#deleteSelectedBtn').addEventListener('click', onDeleteSelected);
  qs('#selectAll').addEventListener('change', (e) => { qsa('.row-select').forEach(cb => cb.checked = e.target.checked); });
  qs('#toggleThemeBtn').addEventListener('click', toggleTheme);

  // Render inicial
  renderTable();
  renderSummary();
  renderChart();
}

document.addEventListener('DOMContentLoaded', init);

// ========================= API pública opcional (debug) =========================
window.AlzesApp = { loadData, saveData, addRecord, editRecord, deleteRecord, filterRecords, exportCSV, renderTable, renderSummary, renderChart };


