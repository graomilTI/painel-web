import { initProtectedPage } from './pageInit.js';
import { supabase } from './supabaseClient.js';

const DATE_FMT = new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC' });
const MONEY_FMT = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

const STATUS_LABELS = {
  PENDENTE: 'Pendente',
  EM_ANALISE: 'Em análise',
  CONFERIDO: 'Conferido',
  PENDENCIA: 'Pendência',
  CANCELADO: 'Cancelado',
};

const STATUS_CLASS = {
  PENDENTE: 'warn',
  EM_ANALISE: 'info',
  CONFERIDO: 'ok',
  PENDENCIA: 'danger',
  CANCELADO: 'neutral',
};

const state = {
  tab: 'despesas',
  despesas: [],
  conferenciaStatus: new Map(),
  auditoria: [],
  resultado: [],
  loading: false,
  filters: {
    inicio: '',
    fim: '',
    regional: '',
    colaborador: '',
    status: '',
  },
};

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase();
}

function todayISO() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function firstDayOfMonthISO() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}-01`;
}

function brDate(value) {
  if (!value) return '-';
  const raw = String(value).slice(0, 10);
  const parts = raw.split('-');
  if (parts.length !== 3) return escapeHtml(value);
  const date = new Date(`${parts[0]}-${parts[1]}-${parts[2]}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return escapeHtml(value);
  return DATE_FMT.format(date);
}

function money(value) {
  const number = Number(value || 0);
  return MONEY_FMT.format(Number.isFinite(number) ? number : 0);
}

function asNumber(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
}

function getStatus(row) {
  return normalizeText(row?.status_conferencia || row?.status || 'PENDENTE').replaceAll(' ', '_') || 'PENDENTE';
}

function statusChip(status) {
  const key = normalizeText(status || 'PENDENTE').replaceAll(' ', '_');
  return `<span class="conf-chip conf-chip-${STATUS_CLASS[key] || 'neutral'}">${escapeHtml(STATUS_LABELS[key] || status || 'Pendente')}</span>`;
}

function buildDespesaResumo(row) {
  const parts = [];

  if (row.programacao_status) parts.push(`Programação: ${row.programacao_status}`);

  if (row.disponibilidade_status && normalizeText(row.disponibilidade_status) !== 'OK') {
    parts.push(`Disponibilidade: ${row.disponibilidade_status}`);
  }
  if (row.estadia_tipo && !['NÃO PRECISA', 'NAO PRECISA', 'CASA'].includes(normalizeText(row.estadia_tipo))) {
    parts.push(`Estadia: ${row.estadia_tipo}${row.hotel_dias ? ` (${row.hotel_dias} diária(s))` : ''}`);
  }

  const refeicoes = [];
  if (row.cafe_valor) refeicoes.push('café');
  if (row.almoco_valor) refeicoes.push('almoço');
  if (row.janta_valor) refeicoes.push('janta');
  if (refeicoes.length) parts.push(`Alimentação: ${refeicoes.join(', ')}`);

  if (row.deslocamento_tipo && !['NÃO PRECISA', 'NAO PRECISA'].includes(normalizeText(row.deslocamento_tipo))) {
    parts.push(`Deslocamento: ${row.deslocamento_tipo}`);
  }

  if (row.deslocamento_valor || row.valor_deslocamento) {
    const valorDesloc = asNumber(row.deslocamento_valor || row.valor_deslocamento);
    if (valorDesloc > 0) parts.push(`Valor deslocamento: ${money(valorDesloc)}`);
  }

  const extras = getDespesaValor(row);
  if (extras > 0) parts.push(`Extras: ${money(extras)}`);

  if (Array.isArray(row.extras_itens) && row.extras_itens.length) {
    parts.push(`Extras lançados: ${row.extras_itens.map((e) => e.tipo_despesa || e.descricao || 'Outro').join(', ')}`);
  }
  if (row.manut_veic) parts.push(`Manutenção: ${row.manut_veic}`);

  return parts.length ? parts.join(' • ') : 'Sem despesa operacional marcada.';
}

function getDespesaValor(row) {
  return asNumber(row.extras_total)
    + asNumber(row.extras_recarga_valor)
    + asNumber(row.extras_passagem_valor)
    + asNumber(row.extras_lavagem_valor);
}

function isPedidoHospedagem(row) {
  return row.estadia_tipo && !['NÃO PRECISA', 'NAO PRECISA', 'CASA'].includes(normalizeText(row.estadia_tipo));
}

function isPedidoDeslocamento(row) {
  return row.deslocamento_tipo && !['NÃO PRECISA', 'NAO PRECISA'].includes(normalizeText(row.deslocamento_tipo));
}

function getUniqueRegionais() {
  const values = [...state.despesas, ...state.auditoria, ...state.resultado]
    .map((row) => row.supervisao || row.regional || row.coordenacao)
    .filter(Boolean);
  return [...new Set(values)].sort((a, b) => String(a).localeCompare(String(b), 'pt-BR'));
}

function applyLocalFilters(rows, kind) {
  const regional = normalizeText(state.filters.regional);
  const colaborador = normalizeText(state.filters.colaborador);
  const status = normalizeText(state.filters.status).replaceAll(' ', '_');

  return rows.filter((row) => {
    const rowRegional = normalizeText(row.supervisao || row.regional || row.coordenacao);
    const rowColaborador = normalizeText(row.colaborador || row.nome_colaborador || row.nome || row.funcionario || row.classificador);
    const rowStatus = kind === 'despesas' ? getStatus(row) : normalizeText(row.status || row.severidade || row.resultado).replaceAll(' ', '_');

    if (regional && rowRegional !== regional) return false;
    if (colaborador && !rowColaborador.includes(colaborador)) return false;
    if (status && kind === 'despesas' && rowStatus !== status) return false;
    return true;
  });
}

function summarize() {
  const despesas = applyLocalFilters(state.despesas, 'despesas');
  const auditoria = applyLocalFilters(state.auditoria, 'auditoria');
  const resultado = applyLocalFilters(state.resultado, 'resultado');

  const pendentes = despesas.filter((row) => ['PENDENTE', 'EM_ANALISE', 'PENDENCIA'].includes(getStatus(row))).length;
  const valorExtras = despesas.reduce((sum, row) => sum + getDespesaValor(row), 0);
  const hoteis = despesas.filter(isPedidoHospedagem).length;
  const deslocamentos = despesas.filter(isPedidoDeslocamento).length;
  const criticas = auditoria.filter((row) => ['ALTA', 'CRITICA', 'CRÍTICA'].includes(normalizeText(row.severidade))).length;
  const tons = resultado.reduce((sum, row) => sum + asNumber(row.toneladas || row.tons || row.embarcado), 0);

  return { despesas, auditoria, resultado, pendentes, valorExtras, hoteis, deslocamentos, criticas, tons };
}

function renderStyles() {
  return `
    <style>
      .conf-hero{display:flex;justify-content:space-between;gap:18px;align-items:center;background:radial-gradient(circle at top right,rgba(34,197,94,.15),transparent 32%),linear-gradient(180deg,rgba(8,22,17,.95),rgba(6,19,14,.95));border:1px solid var(--line);border-radius:28px;padding:24px;box-shadow:var(--shadow)}
      .conf-hero h2{font-size:30px;margin:6px 0 10px}.conf-hero p{margin:0;color:var(--muted)}
      .conf-actions{display:flex;gap:10px;flex-wrap:wrap;justify-content:flex-end}.conf-btn{border:1px solid rgba(111,208,165,.22);background:rgba(15,23,42,.78);color:#eef7f2;border-radius:14px;padding:11px 14px;font-weight:800;cursor:pointer}.conf-btn:hover{background:rgba(22,101,52,.28)}.conf-btn-primary{background:#3fa878;color:#04130d}.conf-btn-danger{background:rgba(220,38,38,.16);color:#fecaca;border-color:rgba(248,113,113,.32)}
      .conf-grid{display:grid;grid-template-columns:repeat(5,minmax(150px,1fr));gap:14px;margin-top:16px}.conf-card{background:rgba(8,22,17,.68);border:1px solid var(--line);border-radius:22px;padding:18px;box-shadow:var(--shadow-soft)}.conf-card h3{margin:0 0 10px;font-size:15px}.conf-metric{font-size:34px;line-height:1;font-weight:900;color:#dcfce7;margin:0 0 8px}.conf-card p{margin:0;color:var(--muted);font-size:13px}
      .conf-panel{margin-top:16px;background:rgba(8,22,17,.72);border:1px solid var(--line);border-radius:24px;padding:18px;box-shadow:var(--shadow-soft)}.conf-panel-head{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;margin-bottom:14px}.conf-panel-head h3{margin:0 0 6px}.conf-panel-head p{margin:0;color:var(--muted)}
      .conf-tabs{display:flex;gap:10px;flex-wrap:wrap}.conf-tab{border:1px solid rgba(111,208,165,.22);background:#0b1220;color:#e5e7eb;border-radius:999px;padding:10px 14px;font-weight:800;cursor:pointer}.conf-tab.active{background:rgba(34,197,94,.22);border-color:rgba(111,208,165,.45);color:#dcfce7}
      .conf-filters{display:grid;grid-template-columns:repeat(5,minmax(160px,1fr));gap:12px}.conf-field label{display:block;font-size:12px;color:#dcfce7;font-weight:800;text-transform:uppercase;letter-spacing:.06em;margin:0 0 6px}.conf-field input,.conf-field select{width:100%;border:1px solid rgba(96,165,250,.22);border-radius:14px;background:#0b1220;color:#e5e7eb;padding:12px 13px;color-scheme:dark}.conf-field option{background:#0f172a;color:#e5e7eb}.conf-filter-actions{display:flex;gap:10px;align-items:end;flex-wrap:wrap}
      .conf-table-wrap{overflow:auto;border:1px solid var(--line);border-radius:18px;background:#081611}.conf-table{width:100%;border-collapse:collapse;min-width:1180px}.conf-table th,.conf-table td{padding:13px 12px;border-bottom:1px solid rgba(148,163,184,.12);text-align:left;vertical-align:top}.conf-table th{background:rgba(15,23,42,.92);color:#dcfce7;font-size:12px;text-transform:uppercase;letter-spacing:.06em}.conf-table td{color:#e5e7eb}.conf-table small{display:block;color:var(--muted);margin-top:4px}.conf-empty{text-align:center;color:var(--muted);padding:24px!important}.conf-row-actions{display:flex;gap:8px;flex-wrap:wrap}.conf-row-actions button{font-size:12px;padding:8px 10px;border-radius:12px}
      .conf-chip{display:inline-flex;align-items:center;border-radius:999px;padding:7px 10px;font-size:12px;font-weight:900;border:1px solid rgba(148,163,184,.18)}.conf-chip-ok{background:rgba(34,197,94,.16);color:#bbf7d0;border-color:rgba(34,197,94,.28)}.conf-chip-warn{background:rgba(234,179,8,.14);color:#fde68a;border-color:rgba(234,179,8,.28)}.conf-chip-danger{background:rgba(220,38,38,.16);color:#fecaca;border-color:rgba(248,113,113,.32)}.conf-chip-info{background:rgba(59,130,246,.16);color:#bfdbfe;border-color:rgba(96,165,250,.30)}.conf-chip-neutral{background:rgba(148,163,184,.12);color:#cbd5e1}
      .conf-note{width:100%;min-height:74px;border:1px solid rgba(96,165,250,.22);border-radius:14px;background:#0b1220;color:#e5e7eb;padding:12px;resize:vertical}.conf-feedback{min-height:20px;margin-top:10px;color:var(--muted)}
      @media(max-width:1200px){.conf-grid{grid-template-columns:repeat(2,1fr)}.conf-filters{grid-template-columns:repeat(2,1fr)}}@media(max-width:760px){.conf-hero,.conf-panel-head{display:block}.conf-grid,.conf-filters{grid-template-columns:1fr}.conf-actions{justify-content:flex-start;margin-top:12px}}
    </style>
  `;
}

function renderShell(content) {
  state.filters.inicio = state.filters.inicio || firstDayOfMonthISO();
  state.filters.fim = state.filters.fim || todayISO();

  content.innerHTML = `
    ${renderStyles()}
    <section class="conf-hero">
      <div>
        <div class="eyebrow">Operação ADM</div>
        <h2>Conferência operacional</h2>
        <p>Central para conferir despesas solicitadas na programação, irregularidades de auditoria e produção do período.</p>
      </div>
      <div class="conf-actions">
        <button class="conf-btn" id="conf-export-csv" type="button">Exportar CSV</button>
        <button class="conf-btn conf-btn-primary" id="conf-refresh" type="button">Atualizar</button>
      </div>
    </section>

    <section class="conf-grid" id="conf-metrics"></section>

    <section class="conf-panel">
      <div class="conf-panel-head">
        <div>
          <h3>Filtros</h3>
          <p>Filtre por período, supervisão/regional, colaborador e status da conferência.</p>
        </div>
      </div>
      <form class="conf-filters" id="conf-filters">
        <div class="conf-field">
          <label for="conf-inicio">Data inicial</label>
          <input id="conf-inicio" type="date" value="${escapeHtml(state.filters.inicio)}" />
        </div>
        <div class="conf-field">
          <label for="conf-fim">Data final</label>
          <input id="conf-fim" type="date" value="${escapeHtml(state.filters.fim)}" />
        </div>
        <div class="conf-field">
          <label for="conf-regional">Supervisão / Regional</label>
          <select id="conf-regional"><option value="">Todas</option></select>
        </div>
        <div class="conf-field">
          <label for="conf-colaborador">Colaborador</label>
          <input id="conf-colaborador" type="search" placeholder="Nome do colaborador" value="${escapeHtml(state.filters.colaborador)}" />
        </div>
        <div class="conf-field">
          <label for="conf-status">Status</label>
          <select id="conf-status">
            <option value="">Todos</option>
            <option value="PENDENTE">Pendente</option>
            <option value="EM_ANALISE">Em análise</option>
            <option value="CONFERIDO">Conferido</option>
            <option value="PENDENCIA">Pendência</option>
            <option value="CANCELADO">Cancelado</option>
          </select>
        </div>
        <div class="conf-filter-actions">
          <button class="conf-btn conf-btn-primary" type="submit">Aplicar</button>
          <button class="conf-btn" id="conf-clear" type="button">Limpar</button>
        </div>
      </form>
      <div class="conf-feedback" id="conf-feedback"></div>
    </section>

    <section class="conf-panel">
      <div class="conf-panel-head">
        <div>
          <h3>Fila de conferência</h3>
          <p id="conf-table-subtitle">Despesas solicitadas na programação.</p>
        </div>
        <div class="conf-tabs">
          <button class="conf-tab active" data-tab="despesas" type="button">Despesas da programação</button>
          <button class="conf-tab" data-tab="auditoria" type="button">Auditoria</button>
          <button class="conf-tab" data-tab="resultado" type="button">Resultado diário</button>
        </div>
      </div>
      <div id="conf-table"></div>
    </section>
  `;

  bindEvents();
}

function renderRegionalOptions() {
  const select = document.getElementById('conf-regional');
  if (!select) return;
  const current = state.filters.regional;
  const options = getUniqueRegionais().map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join('');
  select.innerHTML = `<option value="">Todas</option>${options}`;
  select.value = current;
}

function renderMetrics() {
  const s = summarize();
  const html = [
    ['Pendentes', s.pendentes, 'Solicitações aguardando conferência.'],
    ['Despesas', s.despesas.length, 'Itens da programação no período.'],
    ['Extras', money(s.valorExtras), 'Recarga, passagem e lavagem.'],
    ['Hotel/Desloc.', `${s.hoteis}/${s.deslocamentos}`, 'Hospedagens e deslocamentos solicitados.'],
    ['Auditoria crítica', s.criticas, 'Ocorrências alta/crítica no período.'],
  ].map(([title, metric, desc]) => `
    <article class="conf-card">
      <h3>${escapeHtml(title)}</h3>
      <div class="conf-metric">${escapeHtml(metric)}</div>
      <p>${escapeHtml(desc)}</p>
    </article>
  `).join('');
  document.getElementById('conf-metrics').innerHTML = html;
}

function renderActiveTab() {
  document.querySelectorAll('.conf-tab').forEach((btn) => btn.classList.toggle('active', btn.dataset.tab === state.tab));
  renderMetrics();
  renderRegionalOptions();

  const subtitle = document.getElementById('conf-table-subtitle');
  if (subtitle) {
    subtitle.textContent = state.tab === 'despesas'
      ? 'Despesas solicitadas na programação.'
      : state.tab === 'auditoria'
        ? 'Ocorrências e divergências registradas na auditoria.'
        : 'Produção importada para comparação operacional.';
  }

  if (state.tab === 'despesas') return renderDespesasTable();
  if (state.tab === 'auditoria') return renderAuditoriaTable();
  return renderResultadoTable();
}

function renderDespesasTable() {
  const rows = applyLocalFilters(state.despesas, 'despesas');
  const target = document.getElementById('conf-table');
  if (!rows.length) {
    target.innerHTML = `<div class="conf-table-wrap"><table class="conf-table"><tbody><tr><td class="conf-empty">Nenhuma despesa encontrada para os filtros selecionados.</td></tr></tbody></table></div>`;
    return;
  }

  target.innerHTML = `
    <div class="conf-table-wrap">
      <table class="conf-table">
        <thead>
          <tr>
            <th>Data</th><th>Colaborador</th><th>Supervisão</th><th>Solicitação</th><th>Valor extra</th><th>Status</th><th>Observação ADM</th><th>Ações</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((row) => `
            <tr>
              <td>${brDate(row.data_referencia)}<small>${escapeHtml(row.queue_id || row.id || '')}</small></td>
              <td><strong>${escapeHtml(row.colaborador || row.nome_colaborador || '-')}</strong><small>${escapeHtml(row.solicitante ? `Solicitante: ${row.solicitante}` : '')}</small></td>
              <td>${escapeHtml(row.supervisao || '-')}<small>${escapeHtml(row.coordenacao || '')}</small></td>
              <td>${escapeHtml(buildDespesaResumo(row))}<small>${escapeHtml(row.extras_obs || row.disponibilidade_obs || row.estadia_obs || row.deslocamento_obs || row.alimentacao_obs || '')}</small></td>
              <td><strong>${money(getDespesaValor(row))}</strong></td>
              <td>${statusChip(getStatus(row))}</td>
              <td><textarea class="conf-note" data-note-id="${escapeHtml(row.id)}" placeholder="Observação da conferência...">${escapeHtml(row.observacao_conferencia || '')}</textarea></td>
              <td>
                <div class="conf-row-actions">
                  <button class="conf-btn" data-action="EM_ANALISE" data-id="${escapeHtml(row.id)}" type="button">Analisar</button>
                  <button class="conf-btn conf-btn-primary" data-action="CONFERIDO" data-id="${escapeHtml(row.id)}" type="button">Conferir</button>
                  <button class="conf-btn conf-btn-danger" data-action="PENDENCIA" data-id="${escapeHtml(row.id)}" type="button">Pendência</button>
                </div>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function renderAuditoriaTable() {
  const rows = applyLocalFilters(state.auditoria, 'auditoria');
  const target = document.getElementById('conf-table');
  if (!rows.length) {
    target.innerHTML = `<div class="conf-table-wrap"><table class="conf-table"><tbody><tr><td class="conf-empty">Nenhuma ocorrência de auditoria encontrada.</td></tr></tbody></table></div>`;
    return;
  }
  target.innerHTML = `
    <div class="conf-table-wrap">
      <table class="conf-table">
        <thead><tr><th>Data</th><th>Colaborador</th><th>Supervisão</th><th>Ocorrência</th><th>Resultado</th><th>Impacto</th></tr></thead>
        <tbody>
          ${rows.map((row) => `
            <tr>
              <td>${brDate(row.data_evento || row.data_classificacao)}</td>
              <td><strong>${escapeHtml(row.nome_colaborador)}</strong><small>${escapeHtml(row.tipo_funcionario || '')}</small></td>
              <td>${escapeHtml(row.supervisao || '-')}<small>${escapeHtml(row.coordenacao || '')}</small></td>
              <td>${escapeHtml(row.tipo_evento || row.motivo_recusa || '-')}<small>${escapeHtml(row.descricao || row.observacoes || '')}</small></td>
              <td>${escapeHtml(row.resultado || row.resultado_auditoria || row.resultado_recusa || '-')}</td>
              <td>${statusChip(row.severidade || 'baixa')}<small>Score: ${escapeHtml(row.score_impacto ?? row.diferenca ?? 0)}</small></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function renderResultadoTable() {
  const rows = applyLocalFilters(state.resultado, 'resultado');
  const target = document.getElementById('conf-table');
  if (!rows.length) {
    target.innerHTML = `<div class="conf-table-wrap"><table class="conf-table"><tbody><tr><td class="conf-empty">Nenhum resultado diário encontrado.</td></tr></tbody></table></div>`;
    return;
  }
  target.innerHTML = `
    <div class="conf-table-wrap">
      <table class="conf-table">
        <thead><tr><th>Data</th><th>Funcionário</th><th>Supervisão</th><th>Cliente / Local</th><th>OS</th><th>Cargas</th><th>Toneladas</th><th>Embarcado</th></tr></thead>
        <tbody>
          ${rows.map((row) => `
            <tr>
              <td>${brDate(row.data)}</td>
              <td><strong>${escapeHtml(row.funcionario || '-')}</strong></td>
              <td>${escapeHtml(row.supervisao || '-')}<small>${escapeHtml(row.coordenacao || '')}</small></td>
              <td>${escapeHtml(row.cliente_final || row.cliente_regional || row.cliente_nacional || '-')}<small>${escapeHtml(row.local_embarque || row.destino || '')}</small></td>
              <td>${escapeHtml(row.os || '-')}</td>
              <td>${escapeHtml(row.cargas || 0)}</td>
              <td>${escapeHtml(row.toneladas || 0)}</td>
              <td>${escapeHtml(row.embarcado || 0)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function getFilterValues() {
  state.filters.inicio = document.getElementById('conf-inicio')?.value || '';
  state.filters.fim = document.getElementById('conf-fim')?.value || '';
  state.filters.regional = document.getElementById('conf-regional')?.value || '';
  state.filters.colaborador = document.getElementById('conf-colaborador')?.value || '';
  state.filters.status = document.getElementById('conf-status')?.value || '';
}

function setFeedback(message, isError = false) {
  const el = document.getElementById('conf-feedback');
  if (!el) return;
  el.textContent = message || '';
  el.style.color = isError ? '#fecaca' : 'var(--muted)';
}

async function selectByProgramacoes(table, columns, programacaoIds) {
  if (!programacaoIds.length) return [];
  const { data, error } = await supabase
    .from(table)
    .select(columns)
    .in('programacao_id', programacaoIds)
    .limit(5000);

  if (error) {
    console.warn(`[Conferência] ${table} indisponível:`, error.message);
    return [];
  }
  return data || [];
}

function makeKey(programacaoId, colaboradorId) {
  return `${programacaoId}::${colaboradorId}`;
}

function baseRow(programacao, colaboradorId, nomeColaborador = '') {
  return {
    id: makeKey(programacao.id, colaboradorId),
    programacao_id: programacao.id,
    colaborador_id: colaboradorId,
    data_referencia: programacao.data_referencia,
    coordenacao: programacao.coordenacao || '',
    supervisao: programacao.supervisao || programacao.regional || '',
    regional: programacao.regional || programacao.supervisao || '',
    colaborador: nomeColaborador || 'Colaborador',
    nome_colaborador: nomeColaborador || 'Colaborador',
    programacao_status: programacao.status || 'rascunho',
    status_conferencia: 'PENDENTE',
    observacao_conferencia: '',
    extras_total: 0,
    extras_itens: [],
  };
}

async function loadDespesas() {
  let progQuery = supabase
    .from('programacao_dia')
    .select('*')
    .order('data_referencia', { ascending: false })
    .limit(500);

  if (state.filters.inicio) progQuery = progQuery.gte('data_referencia', state.filters.inicio);
  if (state.filters.fim) progQuery = progQuery.lte('data_referencia', state.filters.fim);

  const { data: programacoes, error: progError } = await progQuery;
  if (progError) throw new Error(`Programações: ${progError.message}`);

  const programacaoIds = (programacoes || []).map((p) => p.id).filter(Boolean);
  if (!programacaoIds.length) {
    state.despesas = [];
    return;
  }

  const programacaoMap = new Map((programacoes || []).map((p) => [p.id, p]));

  const [disp, estadia, alimentacao, deslocamento, extras, statusRows] = await Promise.all([
    selectByProgramacoes('programacao_colaboradores', '*', programacaoIds),
    selectByProgramacoes('programacao_estadia', '*', programacaoIds),
    selectByProgramacoes('programacao_alimentacao', '*', programacaoIds),
    selectByProgramacoes('programacao_deslocamento', '*', programacaoIds),
    selectByProgramacoes('programacao_extras', '*', programacaoIds),
    selectByProgramacoes('programacao_conferencia_status', '*', programacaoIds),
  ]);

  const rows = new Map();

  const getRow = (programacaoId, colaboradorId, nomeColaborador = '') => {
    const key = makeKey(programacaoId, colaboradorId);
    if (!rows.has(key)) rows.set(key, baseRow(programacaoMap.get(programacaoId) || {}, colaboradorId, nomeColaborador));
    const row = rows.get(key);
    if (nomeColaborador && (!row.colaborador || row.colaborador === 'Colaborador')) {
      row.colaborador = nomeColaborador;
      row.nome_colaborador = nomeColaborador;
    }
    return row;
  };

  disp.forEach((r) => {
    const row = getRow(r.programacao_id, r.colaborador_id, r.nome_colaborador);
    row.disponibilidade_status = r.disponibilidade || 'OK';
    row.disponibilidade_obs = r.observacao || '';
    row.cargo = r.cargo || row.cargo || '';
    row.coordenacao = r.coordenacao || row.coordenacao;
    row.supervisao = r.supervisao || row.supervisao;
  });

  estadia.forEach((r) => {
    const row = getRow(r.programacao_id, r.colaborador_id, r.nome_colaborador);
    row.estadia_tipo = r.tipo_estadia || 'NÃO PRECISA';
    row.estadia_obs = r.observacao || '';
    row.hotel_dias = r.diarias || 0;
    row.estadia_cidade = r.cidade || '';
    row.estadia_uf = r.uf || '';
    row.checkin = r.checkin || '';
    row.checkout = r.checkout || '';
  });

  alimentacao.forEach((r) => {
    const row = getRow(r.programacao_id, r.colaborador_id, r.nome_colaborador);
    row.cafe_valor = !!r.cafe;
    row.almoco_valor = !!r.almoco;
    row.janta_valor = !!r.janta;
    row.alimentacao_obs = r.observacao || '';
  });

  deslocamento.forEach((r) => {
    const row = getRow(r.programacao_id, r.colaborador_id, r.nome_colaborador);
    row.deslocamento_tipo = r.tipo_deslocamento || 'NÃO PRECISA';
    row.deslocamento_obs = r.observacao || '';
    row.deslocamento_origem = r.origem || '';
    row.deslocamento_destino = r.destino || '';
    row.deslocamento_km = r.km || 0;
    row.deslocamento_valor = r.valor || 0;
  });

  extras.forEach((r) => {
    const row = getRow(r.programacao_id, r.colaborador_id, r.nome_colaborador);
    row.extras_itens.push(r);
    row.extras_total += asNumber(r.valor);
    row.extras_obs = [row.extras_obs, r.observacao, r.descricao].filter(Boolean).join(' | ');
  });

  statusRows.forEach((r) => {
    const row = getRow(r.programacao_id, r.colaborador_id, r.nome_colaborador || '');
    row.status_conferencia = r.status_conferencia || 'PENDENTE';
    row.observacao_conferencia = r.observacao_conferencia || '';
    row.conferencia_status_id = r.id;
    row.conferido_em = r.conferido_em || null;
  });

  state.despesas = [...rows.values()].sort((a, b) => {
    const d = String(b.data_referencia || '').localeCompare(String(a.data_referencia || ''));
    if (d) return d;
    return String(a.colaborador || '').localeCompare(String(b.colaborador || ''), 'pt-BR');
  });
}

async function loadAuditoria() {
  let query = supabase
    .from('operacional_auditoria_colaborador')
    .select('*')
    .order('data_evento', { ascending: false, nullsFirst: false })
    .limit(500);

  if (state.filters.inicio) query = query.gte('data_evento', state.filters.inicio);
  if (state.filters.fim) query = query.lte('data_evento', state.filters.fim);

  const { data, error } = await query;
  if (error) {
    state.auditoria = [];
    console.warn('[Conferência] Auditoria indisponível:', error.message);
    return;
  }
  state.auditoria = data || [];
}

async function loadResultado() {
  let query = supabase
    .from('relatorio_resultado_diario')
    .select('*')
    .order('data', { ascending: false, nullsFirst: false })
    .limit(500);

  if (state.filters.inicio) query = query.gte('data', state.filters.inicio);
  if (state.filters.fim) query = query.lte('data', state.filters.fim);

  const { data, error } = await query;
  if (error) {
    state.resultado = [];
    console.warn('[Conferência] Resultado diário indisponível:', error.message);
    return;
  }
  state.resultado = data || [];
}

async function loadAll() {
  if (state.loading) return;
  state.loading = true;
  setFeedback('Carregando dados da conferência...');
  try {
    await Promise.all([loadDespesas(), loadAuditoria(), loadResultado()]);
    setFeedback('Dados atualizados.');
  } catch (error) {
    console.error(error);
    setFeedback(error.message || 'Erro ao carregar conferência.', true);
  } finally {
    state.loading = false;
    renderActiveTab();
  }
}

async function updateDespesaStatus(id, status) {
  const row = state.despesas.find((item) => String(item.id) === String(id));
  if (!row) return;

  const note = document.querySelector(`[data-note-id="${CSS.escape(id)}"]`)?.value || '';
  setFeedback('Salvando conferência...');

  const payload = {
    programacao_id: row.programacao_id,
    colaborador_id: row.colaborador_id,
    nome_colaborador: row.colaborador || row.nome_colaborador || null,
    data_referencia: row.data_referencia,
    coordenacao: row.coordenacao || null,
    supervisao: row.supervisao || row.regional || null,
    status_conferencia: status,
    observacao_conferencia: note,
    conferido_em: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('programacao_conferencia_status')
    .upsert(payload, { onConflict: 'programacao_id,colaborador_id' })
    .select('*')
    .single();

  if (error) {
    setFeedback(`Não foi possível salvar. Rode o SQL de estrutura enviado no ZIP. Detalhe: ${error.message}`, true);
    return;
  }

  Object.assign(row, {
    status_conferencia: data.status_conferencia,
    observacao_conferencia: data.observacao_conferencia,
    conferencia_status_id: data.id,
    conferido_em: data.conferido_em,
  });
  setFeedback('Status da conferência atualizado.');
  renderActiveTab();
}

function exportCsv() {
  const rows = state.tab === 'despesas'
    ? applyLocalFilters(state.despesas, 'despesas')
    : state.tab === 'auditoria'
      ? applyLocalFilters(state.auditoria, 'auditoria')
      : applyLocalFilters(state.resultado, 'resultado');

  if (!rows.length) {
    setFeedback('Não há dados para exportar.', true);
    return;
  }

  const headers = Object.keys(rows[0]);
  const csv = [headers.join(';')]
    .concat(rows.map((row) => headers.map((key) => `"${String(row[key] ?? '').replaceAll('"', '""')}"`).join(';')))
    .join('\n');

  const blob = new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `conferencia-${state.tab}-${todayISO()}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function bindEvents() {
  document.getElementById('conf-refresh')?.addEventListener('click', () => {
    getFilterValues();
    loadAll();
  });

  document.getElementById('conf-export-csv')?.addEventListener('click', exportCsv);

  document.getElementById('conf-filters')?.addEventListener('submit', (event) => {
    event.preventDefault();
    getFilterValues();
    loadAll();
  });

  document.getElementById('conf-clear')?.addEventListener('click', () => {
    state.filters = { inicio: firstDayOfMonthISO(), fim: todayISO(), regional: '', colaborador: '', status: '' };
    document.getElementById('conf-inicio').value = state.filters.inicio;
    document.getElementById('conf-fim').value = state.filters.fim;
    document.getElementById('conf-colaborador').value = '';
    document.getElementById('conf-status').value = '';
    document.getElementById('conf-regional').value = '';
    loadAll();
  });

  document.querySelectorAll('.conf-tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.tab = btn.dataset.tab;
      renderActiveTab();
    });
  });

  document.getElementById('conf-table')?.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-action][data-id]');
    if (!btn) return;
    updateDespesaStatus(btn.dataset.id, btn.dataset.action);
  });
}

initProtectedPage('ADM Conferência', async (content) => {
  renderShell(content);
  await loadAll();
});
