import { supabase } from './supabaseClient.js';

function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function brDate(value) {
  if (!value) return '-';
  const [year, month, day] = String(value).slice(0, 10).split('-');
  return year && month && day ? `${day}/${month}/${year}` : String(value);
}

function normalizeStr(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function todayStr() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function getDatesInRange(start, end) {
  if (!start || !end) return start ? [start] : [];
  const dates = [];
  let current = new Date(`${start}T00:00:00`);
  const last = new Date(`${end}T00:00:00`);
  while (current <= last && dates.length < 90) {
    dates.push(current.toISOString().slice(0, 10));
    current.setDate(current.getDate() + 1);
  }
  return dates;
}

function statusBadge(value) {
  const status = normalizeStr(value);
  if (['hospedado', 'reservada', 'checkin_previsto', 'stay', 'check'].some((key) => status.includes(key))) {
    return `<span class="hbadge ok">${esc(value)}</span>`;
  }
  if (['checkout_hoje', 'renovacao_necessaria'].some((key) => status.includes(key))) {
    return `<span class="hbadge warn">${esc(value)}</span>`;
  }
  if (!value) return '<span class="hbadge neutral">—</span>';
  return `<span class="hbadge neutral">${esc(value)}</span>`;
}

function downloadCSV(filename, header, rows) {
  const lines = [header.map(csvCell).join(';'), ...rows.map((row) => row.map(csvCell).join(';'))];
  const blob = new Blob([`\uFEFF${lines.join('\n')}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = Object.assign(document.createElement('a'), { href: url, download: filename });
  anchor.click();
  URL.revokeObjectURL(url);
}

function csvCell(value) {
  return `"${String(value ?? '').replaceAll('"', '""')}"`;
}

function injectStyles() {
  if (document.getElementById('hotelRelV2Styles')) return;
  const style = document.createElement('style');
  style.id = 'hotelRelV2Styles';
  style.textContent = `
    .hr-tabs{display:flex;gap:8px;flex-wrap:wrap;margin:16px 0}
    .hr-tab{width:auto!important;margin:0!important;border:1px solid var(--line-2);background:#15152a;color:var(--text);border-radius:999px;padding:10px 18px;cursor:pointer;font-size:13px;font-weight:900}
    .hr-tab.active{background:rgba(22,101,52,.32);color:#dcfce7;border-color:rgba(111,208,165,.36)}
    .hr-panel{display:none}.hr-panel.active{display:block}
    .hr-filter{display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap;margin-bottom:16px}
    .hr-ff{display:flex;flex-direction:column;gap:5px}
    .hr-ff label{font-size:11px;font-weight:900;text-transform:uppercase;letter-spacing:.06em;color:var(--muted)}
    .hr-ff input{border:1px solid rgba(255,255,255,.08);background:#15152a;color:var(--text);border-radius:12px;padding:10px 13px;outline:none;color-scheme:dark;font-size:13px}
    .hr-ff input:focus{border-color:var(--green-2);box-shadow:0 0 0 3px rgba(111,208,165,.12)}
    .hr-wrap{overflow:auto;border:1px solid var(--line);border-radius:18px}
    .hr-tbl{width:100%;border-collapse:collapse;min-width:780px;background:#15152a}
    .hr-tbl.compact{min-width:420px}
    .hr-tbl th,.hr-tbl td{padding:11px 14px;border-bottom:1px solid var(--line);text-align:left;vertical-align:middle}
    .hr-tbl th{font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.07em}
    .hr-tbl tr:last-child td{border-bottom:0}
    .hr-tbl tr.no-prod td{background:rgba(220,38,38,.07)!important}
    .hr-tbl tr.no-prod td:first-child{box-shadow:inset 3px 0 0 rgba(220,38,38,.6)}
    .hr-tbl tr:hover td{background:rgba(111,208,165,.03)}
    .hr-tbl tr.no-prod:hover td{background:rgba(220,38,38,.1)!important}
    .hbadge{display:inline-flex;align-items:center;padding:4px 9px;border-radius:999px;font-size:11px;font-weight:800;border:1px solid transparent}
    .hbadge.ok{color:#bbf7d0;background:rgba(22,101,52,.2);border-color:rgba(111,208,165,.24)}
    .hbadge.err{color:#fecaca;background:rgba(220,38,38,.12);border-color:rgba(220,38,38,.24)}
    .hbadge.warn{color:#fde68a;background:rgba(245,158,11,.1);border-color:rgba(245,158,11,.22)}
    .hbadge.neutral{color:var(--text);background:rgba(255,255,255,.05);border-color:rgba(255,255,255,.1)}
    .hr-summary{display:flex;gap:20px;flex-wrap:wrap;margin-bottom:14px;padding:12px 0;border-bottom:1px solid var(--line)}
    .hr-kpi{font-size:14px;font-weight:900;color:var(--text)}
    .hr-kpi small{color:var(--muted);font-weight:400;margin-left:5px;font-size:12px}
    .hr-muted{color:var(--muted);font-size:12px}
    .hr-fonte{display:block;font-size:10px;color:#6b7280;margin-top:2px}
    .ar-groups{display:grid;gap:14px}
    .ar-group{border:1px solid var(--line);border-radius:18px;background:#101022;overflow:hidden}
    .ar-group-head{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:14px 16px;border-bottom:1px solid var(--line);background:linear-gradient(135deg,rgba(22,101,52,.16),rgba(21,21,42,.7))}
    .ar-group-head h3{margin:0;color:var(--text);font-size:16px}
    .ar-group-count{display:inline-flex;min-width:30px;height:26px;padding:0 9px;align-items:center;justify-content:center;border-radius:999px;background:rgba(111,208,165,.14);border:1px solid rgba(111,208,165,.24);color:#bbf7d0;font-size:11px;font-weight:900}
    .ar-empty{padding:24px;text-align:center;color:var(--muted);border:1px dashed var(--line-2);border-radius:16px}
    @media(max-width:600px){
      .hr-filter{flex-direction:column;align-items:stretch}
      .hr-ff input{width:100%}
      .hr-filter .btn{width:100%!important}
      .hr-tabs{display:grid;grid-template-columns:1fr 1fr}
      .hr-tab{width:100%!important}
      .ar-group-head{align-items:flex-start}
    }
  `;
  document.head.appendChild(style);
}

async function loadHotelRows(de, ate, setMessage) {
  const activeStatuses = new Set(['HOSPEDADO', 'CHECKIN_PREVISTO', 'CHECKOUT_HOJE', 'RENOVACAO_NECESSARIA']);

  setMessage('Carregando hospedagens em hotéis...');
  const { data: painelData, error: painelError } = await supabase
    .from('hospedagem_painel_geral')
    .select('*')
    .not('status_solicitacao', 'in', '("CANCELADA","CONCLUIDA")')
    .limit(2000);
  if (painelError) throw painelError;

  const activePainel = (painelData || []).filter((row) => {
    const checkin = row.data_checkin || row.data_checkin_prevista || '';
    const checkout = row.data_checkout || row.data_checkout_prevista || '';
    if (!checkin || checkin > ate) return false;
    if (checkout && checkout < de) return false;
    const hospedagem = String(row.status_hospedagem || '').toUpperCase();
    const solicitacao = String(row.status_solicitacao || '').toUpperCase();
    return activeStatuses.has(hospedagem) || solicitacao === 'RESERVADA';
  });

  const solicitationIds = [...new Set(activePainel.map((row) => row.solicitacao_id).filter(Boolean))];
  const collaboratorMap = new Map();
  if (solicitationIds.length) {
    const { data: collaboratorData } = await supabase
      .from('hospedagem_solicitacao_colaboradores')
      .select('solicitacao_id,nome_colaborador,supervisao,regional,coordenacao')
      .in('solicitacao_id', solicitationIds);
    (collaboratorData || []).forEach((item) => {
      if (!collaboratorMap.has(item.solicitacao_id)) collaboratorMap.set(item.solicitacao_id, []);
      collaboratorMap.get(item.solicitacao_id).push(item);
    });
  }

  setMessage('Carregando histórico de hotéis...');
  const { data: historyData } = await supabase
    .from('hospedagem_historico_atual_colaboradores')
    .select('id,data,regional,cidade,uf,colaborador,status_hospedagem,status_planilha,hotel')
    .gte('data', de)
    .lte('data', ate)
    .limit(3000);

  const activeHistory = (historyData || []).filter((row) => {
    const status = String(row.status_hospedagem || row.status_planilha || '').toUpperCase().replace(/\s+/g, '_');
    return !['CHECKOUT_REALIZADO', 'CONCLUIDA', 'CANCELADA', 'CHECK_OUT'].includes(status) && !status.startsWith('CHECKOUT');
  });

  setMessage('Cruzando com a Produção Diária...');
  const { data: productionData } = await supabase
    .from('producao_snapshot')
    .select('data_referencia,funcionario')
    .gte('data_referencia', de)
    .lte('data_referencia', ate)
    .limit(10000);

  const productionSet = new Set();
  (productionData || []).forEach((item) => {
    if (item.funcionario && item.data_referencia) {
      productionSet.add(`${normalizeStr(item.funcionario)}__${item.data_referencia}`);
    }
  });

  const periodDates = getDatesInRange(de, ate);
  const rows = [];

  activePainel.forEach((row) => {
    const checkin = row.data_checkin || row.data_checkin_prevista || de;
    const checkout = row.data_checkout || row.data_checkout_prevista || ate;
    const stayDates = periodDates.filter((date) => date >= checkin && date <= checkout);
    const collaborators = collaboratorMap.get(row.solicitacao_id);
    const people = collaborators?.length
      ? collaborators.map((item) => ({ name: item.nome_colaborador || '-', regional: item.supervisao || item.regional || '' }))
      : String(row.colaboradores || row.colaborador || '')
        .split(/[\n\r,;]+/)
        .map((name) => name.trim())
        .filter(Boolean)
        .map((name) => ({ name, regional: row.supervisao_colaborador || row.regional_colaborador || '' }));

    people.forEach(({ name, regional }) => {
      if (!name || name === '-') return;
      const production = stayDates.map((date) => ({ date, found: productionSet.has(`${normalizeStr(name)}__${date}`) }));
      rows.push({
        collaborator: name,
        regional: regional || '-',
        hotel: row.hotel || '-',
        city: row.cidade || '',
        uf: row.uf || '',
        checkin,
        checkout,
        status: row.status_hospedagem || row.status_solicitacao || '',
        source: 'reserva',
        production,
        noProduction: production.length > 0 && production.every((item) => !item.found),
      });
    });
  });

  activeHistory.forEach((row) => {
    const date = row.data || '';
    const production = date ? [{ date, found: productionSet.has(`${normalizeStr(row.colaborador)}__${date}`) }] : [];
    rows.push({
      collaborator: row.colaborador || '-',
      regional: row.regional || '-',
      hotel: row.hotel || '-',
      city: row.cidade || '',
      uf: row.uf || '',
      checkin: date,
      checkout: '',
      status: row.status_hospedagem || row.status_planilha || '',
      source: 'historico',
      production,
      noProduction: production.length > 0 && production.every((item) => !item.found),
    });
  });

  rows.sort((a, b) => {
    if (a.noProduction !== b.noProduction) return a.noProduction ? -1 : 1;
    return a.collaborator.localeCompare(b.collaborator, 'pt-BR');
  });
  return rows;
}

function renderHotelRows(rows, de, ate, elements) {
  elements.message.textContent = '';
  elements.output.innerHTML = '';
  elements.summary.style.display = 'none';
  elements.exportButton.style.display = 'none';

  if (!rows.length) {
    elements.message.textContent = 'Nenhuma hospedagem em hotel encontrada no período selecionado.';
    return;
  }

  const noProduction = rows.filter((row) => row.noProduction).length;
  const isRange = de !== ate;
  elements.summary.style.display = 'flex';
  elements.summary.innerHTML = `
    <div class="hr-kpi">${rows.length}<small>hospedados</small></div>
    <div class="hr-kpi" style="color:#bbf7d0">${rows.length - noProduction}<small>com produção</small></div>
    <div class="hr-kpi" style="color:#fca5a5">${noProduction}<small>sem produção</small></div>
  `;
  elements.exportButton.style.display = '';

  elements.output.innerHTML = `
    <div class="hr-wrap"><table class="hr-tbl">
      <thead><tr>
        <th>Colaborador</th><th>Regional</th><th>Hotel / Local</th><th>Cidade / UF</th>
        <th>Check-in</th><th>Check-out</th><th>Status</th><th>Produção${isRange ? ' (período)' : ''}</th>
      </tr></thead>
      <tbody>${rows.map((row) => {
        const allFound = row.production.length > 0 && row.production.every((item) => item.found);
        const noneFound = row.production.length > 0 && row.production.every((item) => !item.found);
        let productionCell = '<span class="hbadge warn">Sem datas</span>';
        if (allFound) productionCell = `<span class="hbadge ok">Sim${isRange ? ` (${row.production.length}d)` : ''}</span>`;
        else if (noneFound) productionCell = '<span class="hbadge err">Não encontrada</span>';
        else if (row.production.length) {
          const found = row.production.filter((item) => item.found).length;
          productionCell = `<span class="hbadge warn">${found}/${row.production.length} dias</span>`;
        }
        return `<tr class="${row.noProduction ? 'no-prod' : ''}">
          <td><strong>${esc(row.collaborator)}</strong><span class="hr-fonte">${row.source === 'historico' ? 'histórico' : 'reserva'}</span></td>
          <td class="hr-muted">${esc(row.regional)}</td><td>${esc(row.hotel)}</td>
          <td class="hr-muted">${esc([row.city, row.uf].filter(Boolean).join(' / '))}</td>
          <td class="hr-muted">${brDate(row.checkin)}</td><td class="hr-muted">${row.checkout ? brDate(row.checkout) : '—'}</td>
          <td>${statusBadge(row.status)}</td><td>${productionCell}</td>
        </tr>`;
      }).join('')}</tbody>
    </table></div>`;
}

async function loadAccommodationRows(de, ate, setMessage) {
  setMessage('Carregando alojamentos marcados na Programação...');
  const [byReference, legacyByCheckin] = await Promise.all([
    supabase
      .from('programacao_estadia')
      .select('*')
      .gte('data_referencia', de)
      .lte('data_referencia', ate)
      .limit(10000),
    supabase
      .from('programacao_estadia')
      .select('*')
      .is('data_referencia', null)
      .gte('checkin', de)
      .lte('checkin', ate)
      .limit(3000),
  ]);

  if (byReference.error) throw byReference.error;
  if (legacyByCheckin.error) console.warn('[relatorio-alojamentos] histórico sem data_referencia:', legacyByCheckin.error);

  const rawRows = [...(byReference.data || []), ...(legacyByCheckin.data || [])]
    .filter((row) => normalizeStr(row.tipo_estadia) === 'alojamento')
    .filter((row) => row.alojamento_id || String(row.alojamento_nome || '').trim());

  const accommodationIds = [...new Set(rawRows.map((row) => row.alojamento_id).filter(Boolean))];
  const accommodationNameById = new Map();
  if (accommodationIds.length) {
    const { data: accommodations, error } = await supabase
      .from('hospedagem_alojamentos')
      .select('id,nome')
      .in('id', accommodationIds);
    if (error) console.warn('[relatorio-alojamentos] nomes dos alojamentos:', error);
    (accommodations || []).forEach((item) => accommodationNameById.set(String(item.id), item.nome));
  }

  const deduplicated = new Map();
  rawRows.forEach((row) => {
    const date = row.data_referencia || row.checkin || '';
    if (!date || date < de || date > ate) return;
    const collaborator = String(row.nome_colaborador || row.colaborador || row.colaborador_id || '').trim();
    if (!collaborator) return;
    const accommodation = String(
      row.alojamento_nome || accommodationNameById.get(String(row.alojamento_id)) || 'Alojamento não identificado',
    ).trim();
    const key = `${date}__${normalizeStr(collaborator)}__${normalizeStr(accommodation)}`;
    if (!deduplicated.has(key)) {
      deduplicated.set(key, {
        date,
        collaborator,
        accommodation,
        accommodationId: row.alojamento_id || null,
      });
    }
  });

  return [...deduplicated.values()].sort((a, b) =>
    a.accommodation.localeCompare(b.accommodation, 'pt-BR')
    || a.date.localeCompare(b.date)
    || a.collaborator.localeCompare(b.collaborator, 'pt-BR'));
}

function renderAccommodationRows(rows, elements) {
  elements.message.textContent = '';
  elements.output.innerHTML = '';
  elements.summary.style.display = 'none';
  elements.exportButton.style.display = 'none';

  if (!rows.length) {
    elements.message.textContent = 'Nenhum colaborador foi marcado com alojamento na Programação no período selecionado.';
    return;
  }

  const uniqueCollaborators = new Set(rows.map((row) => normalizeStr(row.collaborator))).size;
  const groups = new Map();
  rows.forEach((row) => {
    const key = normalizeStr(row.accommodation);
    if (!groups.has(key)) groups.set(key, { name: row.accommodation, rows: [] });
    groups.get(key).rows.push(row);
  });
  const sortedGroups = [...groups.values()].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));

  elements.summary.style.display = 'flex';
  elements.summary.innerHTML = `
    <div class="hr-kpi">${sortedGroups.length}<small>alojamentos</small></div>
    <div class="hr-kpi" style="color:#bbf7d0">${uniqueCollaborators}<small>colaboradores</small></div>
    <div class="hr-kpi">${rows.length}<small>marcações</small></div>
  `;
  elements.exportButton.style.display = '';
  elements.output.innerHTML = `<div class="ar-groups">${sortedGroups.map((group) => `
    <section class="ar-group">
      <header class="ar-group-head"><h3>${esc(group.name)}</h3><span class="ar-group-count">${group.rows.length}</span></header>
      <div class="hr-wrap" style="border:0;border-radius:0"><table class="hr-tbl compact">
        <thead><tr><th>Data</th><th>Colaborador</th></tr></thead>
        <tbody>${group.rows.map((row) => `<tr><td class="hr-muted">${brDate(row.date)}</td><td><strong>${esc(row.collaborator)}</strong></td></tr>`).join('')}</tbody>
      </table></div>
    </section>`).join('')}</div>`;
}

export function renderContent(content) {
  injectStyles();
  const today = todayStr();
  const initialTab = normalizeStr(window.location.hash.replace('#', '')) === 'alojamentos' ? 'alojamentos' : 'hoteis';
  const state = { activeTab: initialTab, hotelRows: [], accommodationRows: [] };

  content.innerHTML = `
    <section class="hero-card">
      <div><div class="eyebrow">Hospedagem</div><h2>Relatórios de Hospedagem</h2><p>Relatórios separados entre hotéis e alojamentos vinculados pela Programação.</p></div>
      <div class="hero-badge-wrap"><span class="hero-badge">RELATÓRIOS</span></div>
    </section>

    <div class="hr-tabs" role="tablist" aria-label="Tipo de relatório">
      <button type="button" class="hr-tab" data-hr-tab="hoteis">Hotéis</button>
      <button type="button" class="hr-tab" data-hr-tab="alojamentos">Alojamentos</button>
    </div>

    <article class="card hr-panel" id="hrPanelHoteis">
      <div class="hr-filter">
        <div class="hr-ff"><label>De</label><input id="hotelRelDe" type="date" value="${today}"></div>
        <div class="hr-ff"><label>Até</label><input id="hotelRelAte" type="date" value="${today}"></div>
        <button class="btn btn-primary" id="hotelRelBuscar" type="button" style="margin-bottom:0;align-self:flex-end">Buscar</button>
        <button class="btn btn-secondary" id="hotelRelExportar" type="button" style="margin-bottom:0;align-self:flex-end;display:none">Exportar CSV</button>
      </div>
      <div id="hotelRelSummary" class="hr-summary" style="display:none"></div>
      <div id="hotelRelMsg" style="font-size:13px;color:var(--muted);padding:8px 0">Carregando relatório de hotéis...</div>
      <div id="hotelRelOut"></div>
    </article>

    <article class="card hr-panel" id="hrPanelAlojamentos">
      <div class="hr-filter">
        <div class="hr-ff"><label>De</label><input id="alojRelDe" type="date" value="${today}"></div>
        <div class="hr-ff"><label>Até</label><input id="alojRelAte" type="date" value="${today}"></div>
        <button class="btn btn-primary" id="alojRelBuscar" type="button" style="margin-bottom:0;align-self:flex-end">Buscar</button>
        <button class="btn btn-secondary" id="alojRelExportar" type="button" style="margin-bottom:0;align-self:flex-end;display:none">Exportar CSV</button>
      </div>
      <div id="alojRelSummary" class="hr-summary" style="display:none"></div>
      <div id="alojRelMsg" style="font-size:13px;color:var(--muted);padding:8px 0">Carregando marcações da Programação...</div>
      <div id="alojRelOut"></div>
    </article>
  `;

  const hotelElements = {
    message: content.querySelector('#hotelRelMsg'),
    summary: content.querySelector('#hotelRelSummary'),
    output: content.querySelector('#hotelRelOut'),
    exportButton: content.querySelector('#hotelRelExportar'),
  };
  const accommodationElements = {
    message: content.querySelector('#alojRelMsg'),
    summary: content.querySelector('#alojRelSummary'),
    output: content.querySelector('#alojRelOut'),
    exportButton: content.querySelector('#alojRelExportar'),
  };

  function setTab(tab) {
    state.activeTab = tab === 'alojamentos' ? 'alojamentos' : 'hoteis';
    content.querySelectorAll('[data-hr-tab]').forEach((button) => button.classList.toggle('active', button.dataset.hrTab === state.activeTab));
    content.querySelector('#hrPanelHoteis').classList.toggle('active', state.activeTab === 'hoteis');
    content.querySelector('#hrPanelAlojamentos').classList.toggle('active', state.activeTab === 'alojamentos');
    const hash = state.activeTab === 'alojamentos' ? '#alojamentos' : '#hoteis';
    history.replaceState(history.state, '', `${window.location.pathname}${window.location.search}${hash}`);
  }

  async function runHotelReport() {
    const de = content.querySelector('#hotelRelDe').value || today;
    const ate = content.querySelector('#hotelRelAte').value || today;
    hotelElements.output.innerHTML = '';
    hotelElements.summary.style.display = 'none';
    hotelElements.exportButton.style.display = 'none';
    try {
      state.hotelRows = await loadHotelRows(de, ate, (message) => { hotelElements.message.textContent = message; });
      renderHotelRows(state.hotelRows, de, ate, hotelElements);
    } catch (error) {
      console.error('[relatorio-hoteis]', error);
      hotelElements.message.textContent = `Erro ao carregar hotéis: ${error.message || error}`;
    }
  }

  async function runAccommodationReport() {
    const de = content.querySelector('#alojRelDe').value || today;
    const ate = content.querySelector('#alojRelAte').value || today;
    accommodationElements.output.innerHTML = '';
    accommodationElements.summary.style.display = 'none';
    accommodationElements.exportButton.style.display = 'none';
    try {
      state.accommodationRows = await loadAccommodationRows(de, ate, (message) => { accommodationElements.message.textContent = message; });
      renderAccommodationRows(state.accommodationRows, accommodationElements);
    } catch (error) {
      console.error('[relatorio-alojamentos]', error);
      accommodationElements.message.textContent = `Erro ao carregar alojamentos: ${error.message || error}`;
    }
  }

  content.querySelectorAll('[data-hr-tab]').forEach((button) => button.addEventListener('click', () => {
    setTab(button.dataset.hrTab);
    if (button.dataset.hrTab === 'alojamentos' && !state.accommodationRows.length) runAccommodationReport();
    if (button.dataset.hrTab === 'hoteis' && !state.hotelRows.length) runHotelReport();
  }));
  content.querySelector('#hotelRelBuscar').addEventListener('click', runHotelReport);
  content.querySelector('#alojRelBuscar').addEventListener('click', runAccommodationReport);
  content.querySelector('#hotelRelExportar').addEventListener('click', () => {
    const de = content.querySelector('#hotelRelDe').value || today;
    downloadCSV(`hoteis-${de}.csv`, ['Colaborador', 'Regional', 'Hotel', 'Cidade', 'UF', 'Check-in', 'Check-out', 'Status', 'Produção'], state.hotelRows.map((row) => [
      row.collaborator, row.regional, row.hotel, row.city, row.uf, row.checkin, row.checkout, row.status,
      row.production.every((item) => item.found) ? 'Sim' : row.production.some((item) => item.found) ? 'Parcial' : 'Não',
    ]));
  });
  content.querySelector('#alojRelExportar').addEventListener('click', () => {
    const de = content.querySelector('#alojRelDe').value || today;
    downloadCSV(`alojamentos-${de}.csv`, ['Alojamento', 'Data', 'Colaborador'], state.accommodationRows.map((row) => [row.accommodation, row.date, row.collaborator]));
  });

  setTab(initialTab);
  if (initialTab === 'alojamentos') runAccommodationReport();
  else runHotelReport();
}
