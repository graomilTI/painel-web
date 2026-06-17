function esc(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;'
  })[char]);
}

function normalize(value) {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

function hasMotorista(row) {
  const value = normalize(row.motorista);
  return Boolean(value && value !== '-' && value !== '—' && value !== 'nao identificado');
}

function isArchived(row) {
  return Boolean(
    row.arquivada_em || row.arquivado_em || row.ok_em
    || row.status_arquivo === 'arquivada' || row.arquivada === true || row.ok === true
  );
}

function parseDate(value) {
  if (!value) return 0;
  const text = String(value).trim();
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])).getTime();
  const br = text.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (br) return new Date(Number(br[3]), Number(br[2]) - 1, Number(br[1])).getTime();
  const parsed = new Date(text).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
}

function fmtDate(value) {
  const timestamp = parseDate(value);
  if (!timestamp) return '—';
  return new Intl.DateTimeFormat('pt-BR').format(new Date(timestamp));
}

function infractionDate(row) {
  return row.data_infracao || row.data_auto || row.data_ocorrencia || row.data;
}

function autoNumber(row) {
  return row.numero_auto_infracao || row.auto || row.cod_auto || '—';
}

function statusText(row) {
  return row.status_multa || row.situacao || row.status || 'A PAGAR';
}

function selectSourceTab(container, row) {
  let target = 'todas';
  if (row.identificar_solicitado_em) target = 'identificar';
  else if (row.dobrar_solicitado_em) target = 'dobrar';
  container.querySelector(`[data-subtab="${target}"]`)?.click();
}

function openMotoristaInMain(container, row, close) {
  close();
  selectSourceTab(container, row);

  const filter = container.querySelector('[data-filter]');
  if (filter) {
    filter.value = 'todas';
    filter.dispatchEvent(new Event('change', { bubbles: true }));
  }

  const archive = container.querySelector('[data-archive-filter]');
  if (archive) {
    archive.value = 'ativas';
    archive.dispatchEvent(new Event('change', { bubbles: true }));
  }

  const lookup = autoNumber(row) === '—' ? row.placa : autoNumber(row);
  const search = container.querySelector('[data-search]');
  if (search) {
    search.value = String(lookup || '');
    search.dispatchEvent(new Event('input', { bubbles: true }));
  }

  window.setTimeout(() => {
    const rows = [...container.querySelectorAll('[data-multas-table] tr')];
    const target = rows.find((tableRow) => normalize(tableRow.textContent).includes(normalize(lookup)));
    target?.querySelector('[data-motorista]')?.click();
  }, 80);
}

function renderRows(modal, rows, container, close) {
  const query = normalize(modal.querySelector('[data-sem-motorista-search]')?.value);
  const filtered = rows.filter((row) => !query || normalize([
    row.placa, row.empresa, row.renavam, autoNumber(row), row.descricao, statusText(row)
  ].join(' ')).includes(query));

  const count = modal.querySelector('[data-sem-motorista-count]');
  if (count) count.textContent = `${filtered.length} de ${rows.length} multa(s)`;

  const tbody = modal.querySelector('[data-sem-motorista-table]');
  if (!filtered.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="fsm-empty">Nenhuma multa encontrada.</td></tr>';
    return;
  }

  tbody.innerHTML = filtered.map((row) => `
    <tr>
      <td><strong>${esc(row.placa || '—')}</strong><small>${esc(row.empresa || '')}</small></td>
      <td>${esc(fmtDate(infractionDate(row)))}</td>
      <td>${esc(autoNumber(row))}</td>
      <td>${esc(row.descricao || '—')}</td>
      <td><span class="fsm-status">${esc(statusText(row))}</span></td>
      <td><button type="button" class="fm-btn info" data-sem-motorista-open="${esc(row.id)}">Identificar motorista</button></td>
    </tr>
  `).join('');

  tbody.querySelectorAll('[data-sem-motorista-open]').forEach((button) => {
    button.addEventListener('click', () => {
      const row = rows.find((item) => String(item.id) === String(button.dataset.semMotoristaOpen));
      if (row) openMotoristaInMain(container, row, close);
    });
  });
}

function openWindow(container, rows) {
  document.querySelector('[data-sem-motorista-modal]')?.remove();
  const modal = document.createElement('div');
  modal.className = 'fsm-backdrop';
  modal.dataset.semMotoristaModal = '1';
  modal.innerHTML = `
    <div class="fsm-modal" role="dialog" aria-modal="true" aria-labelledby="fsm-title">
      <header class="fsm-header">
        <div>
          <h2 id="fsm-title">Sem Motorista</h2>
          <p>Multas ativas que ainda precisam de identificação do motorista.</p>
        </div>
        <button type="button" class="fsm-close" data-sem-motorista-close aria-label="Fechar">×</button>
      </header>
      <div class="fsm-tools">
        <input class="fm-input" data-sem-motorista-search placeholder="Buscar por placa, auto, RENAVAM ou empresa">
        <strong data-sem-motorista-count>${rows.length} multa(s)</strong>
      </div>
      <div class="fsm-table-wrap">
        <table class="fsm-table">
          <thead><tr><th>Placa / Empresa</th><th>Infração</th><th>Auto</th><th>Descrição</th><th>Status</th><th>Ação</th></tr></thead>
          <tbody data-sem-motorista-table></tbody>
        </table>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  const close = () => modal.remove();
  modal.querySelector('[data-sem-motorista-close]').addEventListener('click', close);
  modal.addEventListener('click', (event) => { if (event.target === modal) close(); });
  modal.querySelector('[data-sem-motorista-search]').addEventListener('input', () => renderRows(modal, rows, container, close));
  renderRows(modal, rows, container, close);
}

export async function installSemMotoristaWindow(container, supabase) {
  const subtabs = container.querySelector('[data-subtabs]');
  if (!subtabs || subtabs.querySelector('[data-sem-motorista-button]')) return;

  const style = document.createElement('style');
  style.textContent = `
    .fsm-backdrop{position:fixed;inset:0;z-index:10010;background:rgba(2,6,23,.78);display:flex;align-items:center;justify-content:center;padding:20px}
    .fsm-modal{width:min(1240px,100%);max-height:88vh;display:flex;flex-direction:column;border:1px solid rgba(34,197,94,.32);border-radius:18px;background:#07120f;color:#e2e8f0;box-shadow:0 28px 90px rgba(0,0,0,.55);overflow:hidden}
    .fsm-header{display:flex;align-items:flex-start;justify-content:space-between;gap:18px;padding:20px 22px;border-bottom:1px solid rgba(148,163,184,.15)}
    .fsm-header h2{margin:0;color:#fff;font-size:22px}.fsm-header p{margin:5px 0 0;color:#94a3b8}.fsm-close{border:0;background:transparent;color:#cbd5e1;font-size:30px;line-height:1;cursor:pointer}
    .fsm-tools{display:flex;align-items:center;gap:14px;padding:14px 22px}.fsm-tools .fm-input{flex:1}.fsm-tools strong{white-space:nowrap;color:#86efac;font-size:12px}
    .fsm-table-wrap{overflow:auto;border-top:1px solid rgba(148,163,184,.12)}.fsm-table{width:100%;border-collapse:collapse;min-width:980px}.fsm-table th{position:sticky;top:0;z-index:1;background:#0b1b17;color:#bfdbfe;text-align:left;text-transform:uppercase;letter-spacing:.07em;font-size:10px;padding:11px}.fsm-table td{padding:11px;border-top:1px solid rgba(148,163,184,.1);font-size:12px;vertical-align:middle}.fsm-table td:first-child strong,.fsm-table td:first-child small{display:block}.fsm-table td:first-child small{margin-top:3px;color:#94a3b8}.fsm-table td:nth-child(4){max-width:360px}.fsm-table .fm-btn{min-height:34px;border-radius:10px;font-size:11px;white-space:nowrap}.fsm-status{display:inline-flex;border:1px solid rgba(251,191,36,.3);border-radius:999px;padding:4px 8px;color:#fde68a;background:rgba(251,191,36,.1);white-space:nowrap}.fsm-empty{text-align:center;color:#94a3b8;padding:28px!important}
    @media(max-width:700px){.fsm-backdrop{padding:8px}.fsm-modal{max-height:94vh}.fsm-header,.fsm-tools{padding:14px}.fsm-tools{align-items:stretch;flex-direction:column}.fsm-tools strong{align-self:flex-start}}
  `;
  container.appendChild(style);

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'fm-subtab';
  button.dataset.semMotoristaButton = '1';
  button.innerHTML = 'Sem Motorista <span class="fm-subtab-badge" data-sem-motorista-badge></span>';
  subtabs.appendChild(button);

  let rows = [];
  async function loadRows() {
    button.disabled = true;
    const { data, error } = await supabase.from('frotas_multas').select('*');
    button.disabled = false;
    if (error) throw error;
    rows = (data || [])
      .filter((row) => !isArchived(row) && !hasMotorista(row))
      .sort((a, b) => parseDate(infractionDate(b)) - parseDate(infractionDate(a)));
    const badge = button.querySelector('[data-sem-motorista-badge]');
    badge.textContent = rows.length || '';
    return rows;
  }

  button.addEventListener('click', async () => {
    try {
      await loadRows();
      openWindow(container, rows);
    } catch (error) {
      console.error('Falha ao carregar multas sem motorista:', error);
      window.alert(`Falha ao carregar multas sem motorista: ${error.message || 'erro desconhecido'}.`);
    }
  });

  loadRows().catch((error) => console.warn('Falha ao contar multas sem motorista:', error));
}
