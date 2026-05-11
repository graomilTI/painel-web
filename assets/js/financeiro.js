import { initProtectedPage } from './pageInit.js';
import { supabase } from './supabaseClient.js';
import * as XLSX from 'https://cdn.sheetjs.com/xlsx-0.20.2/package/xlsx.mjs';

const RECEBER_COLUMNS = {
  situacao: ['situação', 'situacao'],
  codigo: ['código', 'codigo'],
  fatura: ['fatura'],
  cliente: ['cliente'],
  conta: ['conta'],
  emissao_nf: ['emissão n.f', 'emissao n.f', 'emissão nf', 'emissao nf'],
  vencimento: ['vencimento'],
  recebimento: ['recebimento'],
  numero_nf: ['n.f.', 'nf', 'n.f'],
  valor: ['valor'],
  desconto: ['desconto'],
  juros: ['juros'],
  valor_pago: ['valor pago']
};

const PAGAR_COLUMNS = {
  empresa: ['empresa'],
  situacao: ['situação', 'situacao'],
  cod_grupo: ['cod/grupo', 'código/grupo', 'codigo/grupo'],
  data_lancamento: ['data'],
  coordenacao: ['coordenação', 'coordenacao'],
  supervisao: ['supervisão', 'supervisao'],
  favorecido: ['favorecido'],
  cnpj_cpf: ['cnpj/cpf'],
  identificacao: ['identificação', 'identificacao'],
  categoria: ['categoria'],
  doc: ['doc'],
  vencimento: ['vencimento'],
  parcela: ['parcela'],
  valor_pago: ['v. pago', 'valor pago'],
  valor: ['valor'],
  usuario: ['usuário', 'usuario'],
  data_cadastro: ['data de cadastro']
};

const state = {
  fluxo: [],
  receber: [],
  pagar: [],
  currentDate: new Date().toISOString().slice(0, 10),
  filters: {
    inicio: new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10),
    fim: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10)
  }
};

function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function normalize(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

function money(value) {
  return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function brDate(value) {
  if (!value) return '-';
  const [y, m, d] = String(value).slice(0, 10).split('-');
  return y && m && d ? `${d}/${m}/${y}` : String(value);
}

function toNumber(value) {
  if (value === null || value === undefined || value === '') return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const text = String(value)
    .replace(/R\$/gi, '')
    .replace(/\s/g, '')
    .replace(/\./g, '')
    .replace(',', '.')
    .replace(/[^0-9.-]/g, '');
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toDateISO(value) {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  if (typeof value === 'number') {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (!parsed || !parsed.y || !parsed.m || !parsed.d) return null;
    if (parsed.y < 2020 || parsed.y > 2100) return null;
    return `${String(parsed.y).padStart(4, '0')}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`;
  }
  const raw = String(value).trim();
  if (!raw) return null;
  const br = raw.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/);
  if (br) {
    let [, d, m, y] = br;
    if (y.length === 2) y = `20${y}`;
    const year = Number(y);
    if (year < 2020 || year > 2100) return null;
    return `${String(year).padStart(4, '0')}-${String(Number(m)).padStart(2, '0')}-${String(Number(d)).padStart(2, '0')}`;
  }
  const dt = new Date(raw);
  if (Number.isNaN(dt.getTime())) return null;
  const year = dt.getFullYear();
  if (year < 2020 || year > 2100) return null;
  return dt.toISOString().slice(0, 10);
}

function hashText(value) {
  let hash = 0;
  const text = normalize(value);
  for (let i = 0; i < text.length; i += 1) {
    hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0;
  }
  return `fin_${Math.abs(hash)}_${text.length}`;
}

function pick(row, map, key) {
  const aliases = map[key] || [key];
  const rowKeys = Object.keys(row || {});
  const found = rowKeys.find((rk) => aliases.some((alias) => normalize(rk) === normalize(alias)));
  return found ? row[found] : null;
}

async function upsertChunk(table, rows, onConflict = 'unique_hash') {
  const chunkSize = 450;
  let saved = 0;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const { error } = await supabase.from(table).upsert(chunk, { onConflict });
    if (error) throw error;
    saved += chunk.length;
  }
  return saved;
}

function readWorkbookRows(file) {
  return file.arrayBuffer().then((buffer) => {
    const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
    const firstSheet = workbook.SheetNames[0];
    const sheet = workbook.Sheets[firstSheet];
    return XLSX.utils.sheet_to_json(sheet, { defval: '', raw: true });
  });
}

function mapReceber(rows, fileName) {
  return rows.map((row) => {
    const payload = {
      situacao: pick(row, RECEBER_COLUMNS, 'situacao') || null,
      codigo: String(pick(row, RECEBER_COLUMNS, 'codigo') || '').trim() || null,
      fatura: String(pick(row, RECEBER_COLUMNS, 'fatura') || '').trim() || null,
      cliente: String(pick(row, RECEBER_COLUMNS, 'cliente') || '').trim() || null,
      conta: String(pick(row, RECEBER_COLUMNS, 'conta') || '').trim() || null,
      emissao_nf: toDateISO(pick(row, RECEBER_COLUMNS, 'emissao_nf')),
      vencimento: toDateISO(pick(row, RECEBER_COLUMNS, 'vencimento')),
      recebimento: toDateISO(pick(row, RECEBER_COLUMNS, 'recebimento')),
      numero_nf: String(pick(row, RECEBER_COLUMNS, 'numero_nf') || '').trim() || null,
      valor: toNumber(pick(row, RECEBER_COLUMNS, 'valor')),
      desconto: toNumber(pick(row, RECEBER_COLUMNS, 'desconto')),
      juros: toNumber(pick(row, RECEBER_COLUMNS, 'juros')),
      valor_pago: toNumber(pick(row, RECEBER_COLUMNS, 'valor_pago')),
      arquivo_origem: fileName,
      raw: row
    };
    payload.unique_hash = hashText([payload.codigo, payload.fatura, payload.cliente, payload.vencimento, payload.valor].join('|'));
    return payload;
  }).filter((row) => row.vencimento && (row.codigo || row.fatura || row.cliente) && row.valor !== 0);
}

function mapPagar(rows, fileName) {
  return rows.map((row) => {
    const payload = {
      empresa: String(pick(row, PAGAR_COLUMNS, 'empresa') || '').trim() || null,
      situacao: pick(row, PAGAR_COLUMNS, 'situacao') || null,
      cod_grupo: String(pick(row, PAGAR_COLUMNS, 'cod_grupo') || '').trim() || null,
      data_lancamento: toDateISO(pick(row, PAGAR_COLUMNS, 'data_lancamento')),
      coordenacao: String(pick(row, PAGAR_COLUMNS, 'coordenacao') || '').trim() || null,
      supervisao: String(pick(row, PAGAR_COLUMNS, 'supervisao') || '').trim() || null,
      favorecido: String(pick(row, PAGAR_COLUMNS, 'favorecido') || '').trim() || null,
      cnpj_cpf: String(pick(row, PAGAR_COLUMNS, 'cnpj_cpf') || '').trim() || null,
      identificacao: String(pick(row, PAGAR_COLUMNS, 'identificacao') || '').trim() || null,
      categoria: String(pick(row, PAGAR_COLUMNS, 'categoria') || '').trim() || null,
      doc: String(pick(row, PAGAR_COLUMNS, 'doc') || '').trim() || null,
      vencimento: toDateISO(pick(row, PAGAR_COLUMNS, 'vencimento')),
      parcela: String(pick(row, PAGAR_COLUMNS, 'parcela') || '').trim() || null,
      valor_pago: toNumber(pick(row, PAGAR_COLUMNS, 'valor_pago')),
      valor: toNumber(pick(row, PAGAR_COLUMNS, 'valor')),
      usuario: String(pick(row, PAGAR_COLUMNS, 'usuario') || '').trim() || null,
      data_cadastro: toDateISO(pick(row, PAGAR_COLUMNS, 'data_cadastro')),
      arquivo_origem: fileName,
      raw: row
    };
    payload.unique_hash = hashText([payload.empresa, payload.cod_grupo, payload.favorecido, payload.doc, payload.vencimento, payload.parcela, payload.valor].join('|'));
    return payload;
  }).filter((row) => row.vencimento && (row.favorecido || row.doc || row.cod_grupo) && row.valor !== 0);
}

function statusClass(value) {
  return normalize(value).includes('atencao') || normalize(value).includes('atenção') ? 'danger' : 'ok';
}

initProtectedPage('Financeiro', (content, userContext) => {
  content.innerHTML = `
    <style>
      .fin-wrap{display:grid;gap:18px}.fin-hero{border:1px solid rgba(148,163,184,.18);border-radius:24px;padding:22px;background:linear-gradient(135deg,rgba(15,23,42,.96),rgba(22,101,52,.28));box-shadow:0 20px 50px rgba(2,6,23,.22)}
      .fin-hero h2{margin:0 0 6px;font-size:28px;color:#f8fafc}.fin-hero p{margin:0;color:#cbd5e1}.fin-actions-row{display:flex;gap:10px;flex-wrap:wrap;margin-top:16px}.fin-grid{display:grid;grid-template-columns:repeat(5,minmax(140px,1fr));gap:12px}.fin-kpi{border:1px solid rgba(148,163,184,.16);border-radius:20px;padding:16px;background:rgba(15,23,42,.86)}.fin-kpi span{display:block;color:#94a3b8;font-size:12px;text-transform:uppercase;letter-spacing:.08em}.fin-kpi strong{display:block;margin-top:8px;color:#f8fafc;font-size:22px}.fin-kpi small{color:#94a3b8}.fin-card{border:1px solid rgba(148,163,184,.16);border-radius:22px;background:rgba(15,23,42,.82);padding:18px;box-shadow:0 18px 42px rgba(2,6,23,.18)}
      .fin-head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;margin-bottom:14px}.fin-head h3{margin:0;color:#f8fafc}.fin-head p{margin:4px 0 0;color:#94a3b8}.fin-tabs{display:flex;gap:8px;flex-wrap:wrap}.fin-tab{border:1px solid rgba(148,163,184,.2);background:#0f172a;color:#cbd5e1;border-radius:999px;padding:9px 14px;cursor:pointer}.fin-tab.active{background:#166534;color:#fff;border-color:#22c55e}.fin-panel{display:none}.fin-panel.active{display:block}.fin-form{display:grid;grid-template-columns:repeat(4,minmax(150px,1fr));gap:12px}.fin-field{display:grid;gap:6px}.fin-field.full{grid-column:1/-1}.fin-field label{font-size:12px;color:#94a3b8;text-transform:uppercase;letter-spacing:.06em}.fin-field input,.fin-field select,.fin-field textarea{width:100%;border:1px solid rgba(148,163,184,.22);border-radius:14px;background:#0f172a;color:#e5e7eb;padding:10px 12px;color-scheme:dark}.fin-field textarea{min-height:78px;resize:vertical}.fin-table-wrap{overflow:auto;border-radius:18px;border:1px solid rgba(148,163,184,.14)}.fin-table{width:100%;border-collapse:collapse;min-width:860px}.fin-table th,.fin-table td{padding:12px;border-bottom:1px solid rgba(148,163,184,.12);text-align:left;color:#e5e7eb}.fin-table th{background:rgba(15,23,42,.96);color:#94a3b8;font-size:12px;text-transform:uppercase;letter-spacing:.06em}.fin-table tr:hover td{background:rgba(34,197,94,.06)}.fin-muted{display:block;color:#94a3b8;font-size:12px;margin-top:3px}.fin-status{display:inline-flex;align-items:center;border-radius:999px;padding:5px 10px;font-size:12px;font-weight:800}.fin-status.ok{background:rgba(34,197,94,.14);color:#86efac}.fin-status.danger{background:rgba(239,68,68,.14);color:#fecaca}.fin-status.neutral{background:rgba(148,163,184,.14);color:#cbd5e1}.fin-import-grid{display:grid;grid-template-columns:repeat(2,minmax(260px,1fr));gap:14px}.fin-drop{border:1px dashed rgba(34,197,94,.45);border-radius:20px;padding:18px;background:rgba(22,101,52,.1)}.fin-feedback{color:#94a3b8;font-size:13px}.fin-feedback.ok{color:#86efac}.fin-feedback.err{color:#fecaca}.fin-empty{text-align:center;color:#94a3b8;padding:24px!important}.fin-small{padding:8px 12px!important;font-size:13px!important}@media(max-width:1100px){.fin-grid{grid-template-columns:repeat(2,1fr)}.fin-form,.fin-import-grid{grid-template-columns:1fr}}@media(max-width:700px){.fin-grid{grid-template-columns:1fr}.fin-head{display:grid}}
    </style>
    <section class="fin-wrap">
      <div class="fin-hero">
        <h2>Financeiro · Fluxo de Caixa</h2>
        <p>Saldo manual do dia, contas a receber, contas a pagar e provisões consolidadas sem duplicar os relatórios importados.</p>
        <div class="fin-actions-row">
          <button class="btn btn-primary" id="btnReload" type="button">Atualizar fluxo</button>
          <button class="btn btn-secondary" data-tab-target="importar" type="button">Importar relatórios</button>
          <button class="btn btn-secondary" data-tab-target="config" type="button">Ajustar saldo/provisão</button>
        </div>
      </div>

      <div class="fin-grid">
        <article class="fin-kpi"><span>Saldo do dia</span><strong id="kpiSaldo">R$ 0,00</strong><small>Manual</small></article>
        <article class="fin-kpi"><span>Contas a receber</span><strong id="kpiReceber">R$ 0,00</strong><small>Relatório importado</small></article>
        <article class="fin-kpi"><span>Contas a pagar</span><strong id="kpiPagar">R$ 0,00</strong><small>Relatório importado</small></article>
        <article class="fin-kpi"><span>Provisão do dia</span><strong id="kpiProvisao">R$ 0,00</strong><small>Auto + ajuste</small></article>
        <article class="fin-kpi"><span>Saldo projetado</span><strong id="kpiProjetado">R$ 0,00</strong><small id="kpiStatus">OK</small></article>
      </div>

      <article class="fin-card">
        <div class="fin-head">
          <div><h3>Visão diária</h3><p>Filtre o período do fluxo de caixa.</p></div>
          <div class="fin-tabs">
            <button class="fin-tab active" data-tab="fluxo" type="button">Fluxo</button>
            <button class="fin-tab" data-tab="importar" type="button">Importar</button>
            <button class="fin-tab" data-tab="config" type="button">Saldo e Provisão</button>
            <button class="fin-tab" data-tab="detalhes" type="button">Detalhes</button>
          </div>
        </div>

        <div class="fin-panel active" id="tab-fluxo">
          <form class="fin-form" id="periodForm">
            <div class="fin-field"><label>Data inicial</label><input id="filterInicio" type="date" value="${esc(state.filters.inicio)}"></div>
            <div class="fin-field"><label>Data final</label><input id="filterFim" type="date" value="${esc(state.filters.fim)}"></div>
            <div class="fin-field"><label>&nbsp;</label><button class="btn btn-primary" type="submit">Aplicar período</button></div>
          </form>
          <br>
          <div class="fin-table-wrap"><table class="fin-table"><thead><tr><th>Data</th><th>Saldo do dia</th><th>Receber</th><th>Pagar</th><th>Provisão</th><th>Saldo projetado</th><th>Status</th><th>Ação</th></tr></thead><tbody id="fluxoTbody"><tr><td colspan="8" class="fin-empty">Carregando...</td></tr></tbody></table></div>
        </div>

        <div class="fin-panel" id="tab-importar">
          <div class="fin-import-grid">
            <div class="fin-drop">
              <h3>Contas a Receber</h3>
              <p class="fin-muted">Use o relatório com colunas Código, Fatura, Cliente, Vencimento, Valor e Valor Pago.</p><br>
              <input id="fileReceber" type="file" accept=".xlsx,.xls,.csv">
              <div class="fin-actions-row"><button class="btn btn-primary" id="btnImportReceber" type="button">Importar receber</button><span id="fbReceber" class="fin-feedback"></span></div>
            </div>
            <div class="fin-drop">
              <h3>Contas a Pagar</h3>
              <p class="fin-muted">Use o relatório com colunas Empresa, COD/Grupo, Favorecido, Doc, Vencimento, Parcela e Valor.</p><br>
              <input id="filePagar" type="file" accept=".xlsx,.xls,.csv">
              <div class="fin-actions-row"><button class="btn btn-primary" id="btnImportPagar" type="button">Importar pagar</button><span id="fbPagar" class="fin-feedback"></span></div>
            </div>
          </div>
        </div>

        <div class="fin-panel" id="tab-config">
          <form class="fin-form" id="configForm">
            <div class="fin-field"><label>Data</label><input id="cfgData" type="date" value="${esc(state.currentDate)}" required></div>
            <div class="fin-field"><label>Saldo do dia</label><input id="cfgSaldo" type="number" step="0.01" placeholder="0,00"></div>
            <div class="fin-field"><label>Provisão automática</label><input id="cfgProvAuto" type="number" step="0.01" placeholder="0,00"></div>
            <div class="fin-field"><label>Ajuste manual provisão</label><input id="cfgProvManual" type="number" step="0.01" placeholder="0,00"></div>
            <div class="fin-field full"><label>Observações</label><textarea id="cfgObs" placeholder="Observações do financeiro"></textarea></div>
            <div class="fin-field"><label>&nbsp;</label><button class="btn btn-primary" type="submit">Salvar ajustes</button></div>
            <div class="fin-field"><label>&nbsp;</label><span id="fbConfig" class="fin-feedback"></span></div>
          </form>
        </div>

        <div class="fin-panel" id="tab-detalhes">
          <div class="fin-head"><div><h3>Detalhes do dia selecionado</h3><p id="detalhesData">Selecione uma data no fluxo.</p></div></div>
          <div class="fin-table-wrap"><table class="fin-table"><thead><tr><th>Tipo</th><th>Situação</th><th>Nome/Favorecido</th><th>Documento</th><th>Valor</th><th>Vencimento</th></tr></thead><tbody id="detalhesTbody"><tr><td colspan="6" class="fin-empty">Nenhuma data selecionada.</td></tr></tbody></table></div>
        </div>
      </article>
    </section>
  `;

  function setFeedback(id, text, type = '') {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = text || '';
    el.className = `fin-feedback ${type}`.trim();
  }

  function setTab(tab) {
    document.querySelectorAll('.fin-tab').forEach((btn) => btn.classList.toggle('active', btn.dataset.tab === tab));
    document.querySelectorAll('.fin-panel').forEach((panel) => panel.classList.remove('active'));
    document.getElementById(`tab-${tab}`)?.classList.add('active');
  }

  async function loadFluxo() {
    const { data, error } = await supabase
      .from('financeiro_fluxo_caixa_diario')
      .select('*')
      .gte('data', state.filters.inicio)
      .lte('data', state.filters.fim)
      .order('data', { ascending: true });

    if (error) {
      document.getElementById('fluxoTbody').innerHTML = `<tr><td colspan="8" class="fin-empty">${esc(error.message)}<br>Execute a migration do módulo financeiro no Supabase.</td></tr>`;
      return;
    }
    state.fluxo = data || [];
    renderFluxo();
    updateKpis();
  }

  async function loadDetalhes(date) {
    state.currentDate = date;
    document.getElementById('detalhesData').textContent = `Data: ${brDate(date)}`;
    const [receberRes, pagarRes, saldoRes, provisaoRes] = await Promise.all([
      supabase.from('financeiro_contas_receber').select('*').eq('vencimento', date).order('cliente'),
      supabase.from('financeiro_contas_pagar').select('*').eq('vencimento', date).order('favorecido'),
      supabase.from('financeiro_saldos_dia').select('*').eq('data', date).maybeSingle(),
      supabase.from('financeiro_provisoes').select('*').eq('data', date).maybeSingle()
    ]);
    state.receber = receberRes.data || [];
    state.pagar = pagarRes.data || [];
    document.getElementById('cfgData').value = date;
    document.getElementById('cfgSaldo').value = saldoRes.data?.saldo_dia ?? '';
    document.getElementById('cfgObs').value = saldoRes.data?.observacoes || provisaoRes.data?.observacoes || '';
    document.getElementById('cfgProvAuto').value = provisaoRes.data?.valor_automatico ?? '';
    document.getElementById('cfgProvManual').value = provisaoRes.data?.ajuste_manual ?? '';
    renderDetalhes();
    setTab('detalhes');
  }

  function updateKpis() {
    const today = state.fluxo.find((row) => row.data === new Date().toISOString().slice(0, 10)) || state.fluxo[0] || {};
    document.getElementById('kpiSaldo').textContent = money(today.saldo_dia);
    document.getElementById('kpiReceber').textContent = money(today.contas_receber);
    document.getElementById('kpiPagar').textContent = money(today.contas_pagar);
    document.getElementById('kpiProvisao').textContent = money(today.provisoes_dia);
    document.getElementById('kpiProjetado').textContent = money(today.saldo_projetado);
    document.getElementById('kpiStatus').textContent = today.status || 'OK';
  }

  function renderFluxo() {
    const tbody = document.getElementById('fluxoTbody');
    if (!state.fluxo.length) {
      tbody.innerHTML = `<tr><td colspan="8" class="fin-empty">Nenhum dia encontrado no período.</td></tr>`;
      return;
    }
    tbody.innerHTML = state.fluxo.map((row) => `
      <tr>
        <td><strong>${brDate(row.data)}</strong></td>
        <td>${money(row.saldo_dia)}</td>
        <td>${money(row.contas_receber)}</td>
        <td>${money(row.contas_pagar)}</td>
        <td>${money(row.provisoes_dia)}</td>
        <td><strong>${money(row.saldo_projetado)}</strong></td>
        <td><span class="fin-status ${statusClass(row.status)}">${esc(row.status || 'OK')}</span></td>
        <td><button class="btn btn-secondary fin-small" data-detail-date="${esc(row.data)}" type="button">Abrir</button></td>
      </tr>
    `).join('');
  }

  function renderDetalhes() {
    const tbody = document.getElementById('detalhesTbody');
    const rows = [
      ...state.receber.map((r) => ({ tipo: 'Receber', situacao: r.situacao, nome: r.cliente, doc: r.fatura || r.numero_nf || r.codigo, valor: Number(r.valor || 0) - Number(r.valor_pago || 0), vencimento: r.vencimento })),
      ...state.pagar.map((r) => ({ tipo: 'Pagar', situacao: r.situacao, nome: r.favorecido, doc: r.doc || r.cod_grupo || r.parcela, valor: Number(r.valor || 0) - Number(r.valor_pago || 0), vencimento: r.vencimento }))
    ];
    if (!rows.length) {
      tbody.innerHTML = `<tr><td colspan="6" class="fin-empty">Nenhum lançamento encontrado para esta data.</td></tr>`;
      return;
    }
    tbody.innerHTML = rows.map((r) => `
      <tr><td>${esc(r.tipo)}</td><td>${esc(r.situacao || '-')}</td><td><strong>${esc(r.nome || '-')}</strong></td><td>${esc(r.doc || '-')}</td><td>${money(r.valor)}</td><td>${brDate(r.vencimento)}</td></tr>
    `).join('');
  }

  async function importFile(kind) {
    const input = document.getElementById(kind === 'receber' ? 'fileReceber' : 'filePagar');
    const fb = kind === 'receber' ? 'fbReceber' : 'fbPagar';
    const file = input.files?.[0];
    if (!file) return setFeedback(fb, 'Selecione uma planilha primeiro.', 'err');
    try {
      setFeedback(fb, 'Lendo planilha...');
      const rows = await readWorkbookRows(file);
      const mapped = kind === 'receber' ? mapReceber(rows, file.name) : mapPagar(rows, file.name);
      if (!mapped.length) throw new Error('Nenhuma linha válida encontrada. Confira os cabeçalhos e as datas.');
      setFeedback(fb, `Importando ${mapped.length} linhas...`);
      const table = kind === 'receber' ? 'financeiro_contas_receber' : 'financeiro_contas_pagar';
      const saved = await upsertChunk(table, mapped);
      setFeedback(fb, `${saved} registros atualizados sem duplicar.`, 'ok');
      await loadFluxo();
    } catch (err) {
      setFeedback(fb, err.message || 'Erro ao importar.', 'err');
    }
  }

  async function saveConfig(event) {
    event.preventDefault();
    const date = document.getElementById('cfgData').value;
    const saldo = Number(document.getElementById('cfgSaldo').value || 0);
    const provAuto = Number(document.getElementById('cfgProvAuto').value || 0);
    const provManual = Number(document.getElementById('cfgProvManual').value || 0);
    const obs = document.getElementById('cfgObs').value.trim() || null;
    const responsavel = userContext?.user?.name || userContext?.user?.email || userContext?.email || null;
    try {
      setFeedback('fbConfig', 'Salvando...');
      const saldoRes = await supabase.from('financeiro_saldos_dia').upsert({ data: date, saldo_dia: saldo, observacoes: obs, responsavel }, { onConflict: 'data' });
      if (saldoRes.error) throw saldoRes.error;
      const provRes = await supabase.from('financeiro_provisoes').upsert({ data: date, descricao: 'Provisão do dia', valor_automatico: provAuto, ajuste_manual: provManual, observacoes: obs, responsavel }, { onConflict: 'data' });
      if (provRes.error) throw provRes.error;
      setFeedback('fbConfig', 'Ajustes salvos.', 'ok');
      await loadFluxo();
    } catch (err) {
      setFeedback('fbConfig', err.message || 'Erro ao salvar.', 'err');
    }
  }

  document.querySelectorAll('.fin-tab').forEach((btn) => btn.addEventListener('click', () => setTab(btn.dataset.tab)));
  document.querySelectorAll('[data-tab-target]').forEach((btn) => btn.addEventListener('click', () => setTab(btn.dataset.tabTarget)));
  document.getElementById('btnReload').addEventListener('click', loadFluxo);
  document.getElementById('btnImportReceber').addEventListener('click', () => importFile('receber'));
  document.getElementById('btnImportPagar').addEventListener('click', () => importFile('pagar'));
  document.getElementById('configForm').addEventListener('submit', saveConfig);
  document.getElementById('periodForm').addEventListener('submit', (event) => {
    event.preventDefault();
    state.filters.inicio = document.getElementById('filterInicio').value;
    state.filters.fim = document.getElementById('filterFim').value;
    loadFluxo();
  });
  content.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-detail-date]');
    if (btn) loadDetalhes(btn.dataset.detailDate);
  });

  loadFluxo();
});
