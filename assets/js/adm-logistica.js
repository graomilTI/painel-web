import * as XLSX from 'https://cdn.sheetjs.com/xlsx-0.20.2/package/xlsx.mjs';
import { initProtectedPage } from './pageInit.js';
import { supabase } from './supabaseClient.js';
import { getCurrentUser } from './auth.js';

const BR_INT = new Intl.NumberFormat('pt-BR');
const BR_NUM = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const STATUS_LOGISTICA = {
  PENDENTE: 'Pendente',
  EM_ANDAMENTO: 'Em andamento',
  FINALIZADA: 'Finalizada',
  DEVOLVIDA: 'Devolvida ao gestor',
};

const ALERT_STATUS = {
  PENDENTE: 'Pendente',
  ENVIADA: 'Notificado',
  RESPONDIDA_1: 'Ativo',
  RESPONDIDA_2: 'Finalizado',
  RESPONDIDA_3_SUSPENSO: 'Suspenso',
};

const CLIENTES_EXPORTACAO = [
  'LOUIS DREYFUS COMPANY BRASIL',
  'LDC',
  'COFCO',
  'SIPAL',
  'OURO SAFRA',
  'AGRICOLA ALVORADA',
  'AGRÍCOLA ALVORADA',
];


const ICO_CHECK = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="pointer-events:none"><polyline points="20 6 9 17 4 12"/></svg>`;
const ICO_X = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="pointer-events:none"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;

const FOB_DETECT_CONFIGS = {
  movimento: {
    label: 'Mapa / Movimentação Diária',
    required: [['Data', 'Última Atualização'], ['OS', 'O.S.'], ['Cliente'], ['Supervisão'], ['Cidade'], ['Local', 'Local de Embarque'], ['Tons Hoje']],
    preferred: ['Movimentação Diária', 'Movimentacao Diaria', 'Movimento Diário', 'Movimento Diario', 'Movimentação_hoje', 'Mapa'],
  },
  producao: {
    label: 'Produção Diária',
    required: [['Data'], ['O.S.', 'OS'], ['Cargas']],
    preferred: ['Produção Diária', 'Producao Diaria', 'Resultado_diario', 'Resultado Diário', 'Lista'],
  },
  nhe: {
    label: 'NHE',
    required: [['O.S.', 'OS'], ['Data'], ['Cliente'], ['Cidade de Embarque', 'Cidade'], ['Embarque', 'Local']],
    preferred: ['NHE', 'Lista'],
  },
};

const state = {
  user: null,
  tab: 'os',
  osLog: [],
  osLogLoaded: false,
  fob: [],
  fobLoaded: false,
  fobReportRows: [],
  fobReportStats: null,
  fobReportFiles: { uploads: [], movimento: null, producao: null, nhe: null },
  colaboradoresFob: [],
  os: [],
  atribuicoes: [],
  alertas: [],
  producao: [],
  destinatariosRelatorios: [],
  filters: {
    data: '',
    coordenacao: '',
    status: '',
    busca: '',
    atrasoMin: '1',
    clienteExportacao: '',
    relCliente: '',
    relDataInicial: '',
    relDataFinal: '',
    relFormato: 'CSV',
    relDestinatarios: '',
  },
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
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\u00A0/g, ' ')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .toUpperCase();
}

function numberBr(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const s = String(value ?? '').trim();
  if (!s) return 0;
  const parsed = Number(s.replace(/\./g, '').replace(',', '.').replace(/[^0-9.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function dateKey(value) {
  return String(value || '').slice(0, 10);
}

function brDate(value, withTime = false) {
  if (!value) return '-';
  const d = new Date(value);
  if (!Number.isNaN(d.getTime())) {
    return withTime ? d.toLocaleString('pt-BR') : d.toLocaleDateString('pt-BR');
  }
  const raw = String(value).slice(0, 10);
  const [y, m, day] = raw.split('-');
  return y && m && day ? `${day}/${m}/${y}` : esc(value);
}

function safeArray(data) {
  return Array.isArray(data) ? data : [];
}

function coordOf(row) {
  return row.coordenacao || row.coordenacao_os || row.supervisao || row.regional || '-';
}

function statusLog(row) {
  return normalize(row.status_logistica || 'PENDENTE') || 'PENDENTE';
}

function osNumber(row) {
  return row.numero_os || row.os || row['O.S.'] || row['OS'] || '-';
}

function clienteOf(row) {
  return row.cliente || row.cliente_nacional || row.cliente_regional || row.cliente_final || '-';
}

function origemOf(row) {
  return row.embarque || row.local_embarque || row.local || row.origem || '-';
}

function destinoOf(row) {
  return row.destino || row.local_destino || '-';
}

function lastUpdateOf(row) {
  return row.ultima_atualizacao || row.ultimaAtualizacao || row.updated_at || row.configurada_em || row.enviado_logistica_em || row.data_os || row.data || row.created_at;
}

function hoursSince(value) {
  const d = new Date(value);
  if (!value || Number.isNaN(d.getTime())) return null;
  return Math.max(0, (Date.now() - d.getTime()) / 36e5);
}

function badge(text, type = 'neutral') {
  return `<span class="log-badge ${type}">${esc(text)}</span>`;
}

function statusBadge(status) {
  const st = normalize(status || 'PENDENTE');
  const label = STATUS_LOGISTICA[st] || ALERT_STATUS[st] || status || '-';
  const type = st === 'FINALIZADA' || st === 'RESPONDIDA_1' ? 'ok'
    : st === 'EM_ANDAMENTO' || st === 'ENVIADA' ? 'info'
    : st === 'DEVOLVIDA' || st === 'RESPONDIDA_3_SUSPENSO' ? 'danger'
    : 'warn';
  return badge(label, type);
}

function atribuicoes(osId) {
  return state.atribuicoes.filter((a) => String(a.os_id) === String(osId));
}

function selectedRowsFinalizacao() {
  const data = state.filters.data;
  const coord = normalize(state.filters.coordenacao);
  const st = normalize(state.filters.status);
  const busca = normalize(state.filters.busca);

  return state.os.filter((row) => {
    if (normalize(row.status_gestor || '') !== 'FINALIZAR') return false;
    if (data && dateKey(row.data_os || row.data) !== data) return false;
    if (coord && normalize(coordOf(row)) !== coord) return false;
    if (st && statusLog(row) !== st) return false;
    if (busca) {
      const colabs = atribuicoes(row.id).map((a) => a.colaborador_nome || a.nome).join(' ');
      const text = `${osNumber(row)} ${clienteOf(row)} ${origemOf(row)} ${destinoOf(row)} ${coordOf(row)} ${colabs} ${row.observacao_logistica || ''}`;
      if (!normalize(text).includes(busca)) return false;
    }
    return true;
  });
}

function selectedRowsAtrasadas() {
  const min = Number(state.filters.atrasoMin || 1);
  const busca = normalize(state.filters.busca);
  const coord = normalize(state.filters.coordenacao);
  return state.os.filter((row) => {
    const stGestor = normalize(row.status_gestor || '');
    if (['FINALIZAR'].includes(stGestor)) return false;
    const h = hoursSince(lastUpdateOf(row));
    if (h == null || h < min) return false;
    if (coord && normalize(coordOf(row)) !== coord) return false;
    if (busca) {
      const colabs = atribuicoes(row.id).map((a) => a.colaborador_nome || a.nome).join(' ');
      const text = `${osNumber(row)} ${clienteOf(row)} ${origemOf(row)} ${coordOf(row)} ${colabs}`;
      if (!normalize(text).includes(busca)) return false;
    }
    return true;
  }).sort((a, b) => (hoursSince(lastUpdateOf(b)) || 0) - (hoursSince(lastUpdateOf(a)) || 0));
}

function getAlertForOs(row) {
  const os = String(osNumber(row));
  return state.alertas.find((a) => String(a.os || '') === os && dateKey(a.created_at) === dateKey(new Date().toISOString()));
}

function selectedProducao() {
  const data = state.filters.data;
  const clienteFiltro = normalize(state.filters.clienteExportacao);
  const busca = normalize(state.filters.busca);
  return state.producao.filter((row) => {
    if (data && dateKey(row.data) !== data) return false;
    const cliente = normalize(clienteOf(row));
    const bateClienteScript = CLIENTES_EXPORTACAO.some((c) => cliente.includes(normalize(c)) || normalize(c).includes(cliente));
    if (clienteFiltro && !cliente.includes(clienteFiltro)) return false;
    if (!clienteFiltro && !bateClienteScript) return false;
    if (busca) {
      const text = `${clienteOf(row)} ${row.contrato || ''} ${origemOf(row)} ${destinoOf(row)} ${row.produto || ''} ${row.os || row.numero_os || ''}`;
      if (!normalize(text).includes(busca)) return false;
    }
    return true;
  });
}

function groupedExportacoes() {
  const map = new Map();
  selectedProducao().forEach((row) => {
    const cliente = clienteOf(row);
    const origem = origemOf(row);
    const destino = destinoOf(row);
    const produto = row.produto || '-';
    const key = [normalize(cliente), normalize(origem), normalize(destino), normalize(produto)].join('|');
    if (!map.has(key)) {
      map.set(key, { cliente, origem, destino, produto, cargas: 0, toneladas: 0, embarcado: 0, remanescente: 0, oss: new Set(), rows: 0 });
    }
    const item = map.get(key);
    item.rows += 1;
    item.cargas += numberBr(row.cargas);
    item.toneladas += numberBr(row.toneladas);
    item.embarcado += numberBr(row.embarcado);
    item.remanescente += numberBr(row.remanescente);
    const os = row.os || row.numero_os;
    if (os) item.oss.add(String(os));
  });
  return [...map.values()].sort((a, b) => String(a.cliente).localeCompare(String(b.cliente), 'pt-BR'));
}

function injectStyles() {
  if (document.getElementById('adm-logistica-v2-styles')) return;
  const style = document.createElement('style');
  style.id = 'adm-logistica-v2-styles';
  style.textContent = `
    .log-tabs{display:flex;gap:10px;flex-wrap:wrap;margin:16px 0}.log-report-grid{display:grid;grid-template-columns:repeat(4,minmax(170px,1fr));gap:12px}.log-report-grid .wide{grid-column:span 2}.log-report-history{margin-top:16px}.log-tab{border:1px solid rgba(52,211,153,.2);background:#0d0d18;color:#e2e2f0;border-radius:999px;padding:10px 14px;font-weight:900;cursor:pointer}.log-tab.active{background:rgba(22,101,52,.38);color:#dcfce7;border-color:rgba(74,222,128,.42)}
    .log-grid{display:grid;grid-template-columns:170px 210px 210px 1fr 160px;gap:12px}.log-input{width:100%;min-height:40px;border-radius:12px;border:1px solid rgba(52,211,153,.18);background:#0d0d18!important;color:#e2e2f0!important;color-scheme:dark;padding:9px}.log-input option{background:#0d0d18;color:#e2e2f0}.log-textarea{min-height:70px;resize:vertical}.log-table-wrap{overflow:auto;border:1px solid rgba(52,211,153,.16);border-radius:18px;background:rgba(2,6,23,.25)}.log-table{width:100%;min-width:1160px;border-collapse:separate;border-spacing:0;color:#e2e2f0}.log-table th{position:sticky;top:0;background:#07170f;color:#bbf7d0;text-align:left;padding:10px;font-size:12px;text-transform:uppercase;letter-spacing:.04em;border-bottom:1px solid rgba(52,211,153,.18);z-index:1}.log-table td{padding:10px;border-bottom:1px solid rgba(148,163,184,.12);vertical-align:top;background:rgba(15,23,42,.24)}.log-table tr:hover td{background:rgba(22,101,52,.1)}.log-title{font-weight:950;color:#f8fafc;font-size:14px;line-height:1.2}.log-meta{font-size:12px;color:#6b7280;margin-top:4px;line-height:1.35}.log-badge{display:inline-flex;align-items:center;gap:6px;border-radius:999px;padding:5px 9px;font-size:11px;font-weight:900;border:1px solid rgba(148,163,184,.18);white-space:nowrap}.log-badge.ok{background:rgba(22,163,74,.13);color:#bbf7d0}.log-badge.warn{background:rgba(250,204,21,.14);color:#fde68a}.log-badge.info{background:rgba(59,130,246,.13);color:#bfdbfe}.log-badge.danger{background:rgba(239,68,68,.12);color:#fecaca}.log-badge.neutral{background:rgba(148,163,184,.12);color:#e2e8f0}.log-empty{border:1px dashed rgba(148,163,184,.2);border-radius:18px;padding:18px;color:#6b7280;background:rgba(15,23,42,.16)}.log-actions{display:flex;flex-direction:column;gap:8px}.log-actions .btn{width:100%;justify-content:center}.log-kpi-warn{color:#fde68a!important}.log-kpi-danger{color:#fecaca!important}.log-kpi-ok{color:#bbf7d0!important}.log-section{display:none}.log-section.active{display:block}.log-note{border:1px solid rgba(59,130,246,.2);background:rgba(59,130,246,.08);color:#bfdbfe;border-radius:16px;padding:12px;margin-top:12px;font-size:13px}.log-mini-grid{display:grid;grid-template-columns:repeat(4,minmax(150px,1fr));gap:12px}.log-pill-row{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px}.log-inline-actions{display:flex;gap:8px;flex-wrap:wrap}.log-inline-actions .btn{width:auto!important;margin-top:0!important}.log-copy{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;white-space:pre-wrap;background:rgba(15,23,42,.7);border:1px solid rgba(148,163,184,.2);border-radius:12px;padding:10px;font-size:12px;color:#e2e8f0;max-height:180px;overflow:auto}
    .log-upload-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.log-upload-card{display:flex;flex-direction:column;gap:7px;border:1px dashed rgba(52,211,153,.28);border-radius:18px;background:rgba(15,23,42,.36);padding:14px;cursor:pointer;min-height:118px}.log-upload-card:hover{border-color:rgba(134,239,172,.55);background:rgba(22,101,52,.13)}.log-upload-card span{font-weight:950;color:#f8fafc}.log-upload-card small{color:#94a3b8;line-height:1.35}.log-upload-card b{margin-top:auto;color:#86efac;font-size:12px;word-break:break-word}.log-status-pendente{color:#fecaca!important}.log-status-ok{color:#bbf7d0!important}.log-status-dois{color:#fde68a!important}.log-report-actions{display:flex;gap:8px;flex-wrap:wrap}.log-subcard summary::marker{color:#86efac}
    @media(max-width:1100px){.log-grid{grid-template-columns:1fr 1fr}.log-mini-grid,.log-report-grid{grid-template-columns:1fr 1fr}.log-table{min-width:980px}}@media(max-width:720px){.log-grid,.log-mini-grid,.log-report-grid,.log-upload-grid{grid-template-columns:1fr}.log-report-grid .wide{grid-column:auto}.log-tabs{overflow:auto;flex-wrap:nowrap}.log-tab{white-space:nowrap}}
  `;
  document.head.appendChild(style);
}

initProtectedPage('Painel de Logística', async (content) => {
  injectStyles();
  state.user = await getCurrentUser();

  content.innerHTML = `
    <section class="card mt-16">
      <div class="section-head">
        <div>
          <h3>Painel de Logística</h3>
          <p class="muted">Fluxo central para finalizar O.S., monitorar classificadores sem atualização, controlar suspensões e preparar relatórios operacionais dos clientes.</p>
        </div>
        <button id="logReload" class="btn btn-secondary" type="button">Atualizar</button>
      </div>
      <div class="log-tabs" id="logTabs">
        <button class="log-tab active" data-tab="os" type="button">O.S.</button>
        <button class="log-tab" data-tab="fob" type="button">FOB</button>
        <button class="log-tab" data-tab="report" type="button">Report</button>
        <button class="log-tab" data-tab="conferir" type="button">Conferir</button>
        <button class="log-tab" data-tab="finalizacao" type="button">Finalização ADM</button>
        <button class="log-tab" data-tab="classificadores" type="button">Classificadores</button>
        <button class="log-tab" data-tab="conferencias" type="button">Conferências</button>
        <button class="log-tab" data-tab="exportacoes" type="button">Exportações clientes</button>
        <button class="log-tab" data-tab="relatorios" type="button">Relatórios ao cliente</button>
      </div>
      <div class="filters-grid log-grid">
        <div class="field"><label>Data</label><input id="logData" class="log-input" type="date" /></div>
        <div class="field"><label>Coordenação</label><select id="logCoord" class="log-input"></select></div>
        <div class="field"><label>Status logística</label><select id="logStatus" class="log-input"><option value="">Todos</option>${Object.entries(STATUS_LOGISTICA).map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select></div>
        <div class="field"><label>Buscar</label><input id="logBusca" class="log-input" type="text" placeholder="O.S., cliente, classificador, local..." /></div>
        <div class="field"><label>Atraso mínimo</label><select id="logAtraso" class="log-input"><option value="1">1 hora</option><option value="2">2 horas</option><option value="4">4 horas</option><option value="8">8 horas</option></select></div>
      </div>
      <div class="feedback mt-16" id="logFeedback">Carregando...</div>
    </section>

    <section class="grid-cards mt-16" id="logStats"></section>

    <section class="card mt-16 log-section active" id="section-os">
      <div class="section-head">
        <div><h3>O.S. para Logística</h3><p class="muted" id="osLogMeta">Carregando...</p></div>
        <button class="btn btn-secondary" id="osLogReload" type="button">Atualizar</button>
      </div>
      <div id="osLogList"></div>
    </section>

    <section class="card mt-16 log-section" id="section-fob">
      <div class="section-head">
        <div>
          <h3>FOB — Comparação automática</h3>
          <p class="muted">Anexe Produção Diária, NHE e Mapa/Movimentação de Embarque. O ADM gera e salva a base geral; cada gestor confere apenas os FOBs da sua regional no menu Logística > FOB.</p>
        </div>
        <button id="fobReload" class="btn btn-secondary" type="button">Atualizar histórico</button>
      </div>

      <div class="card mt-16 log-subcard">
        <h4 style="margin:0 0 14px;color:#bbf7d0">Importar arquivos para comparação</h4>
        <div class="log-upload-grid" style="grid-template-columns:1fr">
          <label class="log-upload-card" for="fobFiles" style="min-height:132px">
            <span>Anexar relatórios juntos *</span>
            <small>Selecione Produção Diária, NHE e Mapa/Movimentação de Embarque no mesmo envio. O painel identifica cada arquivo automaticamente pelo cabeçalho.</small>
            <input id="fobFiles" type="file" accept=".xlsx,.xls,.csv" multiple hidden />
            <b id="fobFilesName">Selecionar arquivos</b>
          </label>
        </div>
        <div id="fobDetectedFiles" class="log-note" style="margin-top:12px">Nenhum arquivo selecionado.</div>
        <div class="log-inline-actions mt-16">
          <button id="fobGerarRelatorio" class="btn btn-primary" type="button">Gerar e salvar FOB</button>
          <button id="fobSalvarPendentes" class="btn btn-secondary" type="button" disabled>Salvar/atualizar no painel</button>
          <button id="fobExportCsv" class="btn btn-secondary" type="button" disabled>Baixar CSV</button>
          <button id="fobLimparImportacao" class="btn btn-secondary" type="button">Limpar importação</button>
        </div>
        <div class="log-note">Regra aplicada: entra no FOB toda O.S. do mapa com <strong>Tons Hoje = 0</strong>. Status <strong>OK</strong> somente quando há NHE na mesma O.S. e mesma Data, ou Produção na mesma O.S. e mesma Data com Cargas = NHE; <strong>DOIS EMBARQUES</strong> quando a mesma combinação Cliente + Cidade + Local + Data aparece 2+ vezes no mapa ou também no NHE na mesma data; senão fica <strong>PENDENTE</strong>.</div>
      </div>

      <div id="fobReportResult" class="mt-16"></div>

      <details class="card mt-16 log-subcard" open>
        <summary style="cursor:pointer;font-weight:950;color:#bbf7d0">Histórico geral de FOB — ADM (todas as regionais)</summary>
        <div class="card mt-16">
          <h4 style="margin:0 0 14px;color:#bbf7d0">Adicionar FOB manualmente pelo ADM</h4>
          <div class="filters-grid log-grid" style="grid-template-columns:repeat(3,minmax(140px,1fr))">
            <div class="field"><label>Data *</label><input id="fobData" class="log-input" type="date" /></div>
            <div class="field"><label>O.S. *</label><input id="fobOs" class="log-input" type="text" placeholder="Número da OS" /></div>
            <div class="field" style="align-self:end"><button id="fobBuscarOs" class="btn btn-secondary" type="button">Buscar OS</button></div>
            <div class="field"><label>Supervisão</label><input id="fobSup" class="log-input" type="text" placeholder="Puxado da OS" /></div>
            <div class="field"><label>Cliente</label><input id="fobCliente" class="log-input" type="text" placeholder="Puxado da OS" /></div>
            <div class="field"><label>Local / Embarque</label><input id="fobLocal" class="log-input" type="text" placeholder="Puxado da OS" /></div>
            <div class="field"><label>Colaborador *</label><input id="fobFuncionario" class="log-input" list="fobColaboradoresList" type="text" placeholder="Digite para localizar" /></div>
            <div class="field"><label>Motivo *</label><input id="fobMotivo" class="log-input" type="text" placeholder="Motivo do FOB" /></div>
            <div class="field" style="grid-column:span 3"><label>Observação</label><textarea id="fobObs" class="log-input log-textarea" placeholder="Detalhes adicionais..."></textarea></div>
          </div>
          <datalist id="fobColaboradoresList"></datalist>
          <div class="mt-16"><button id="fobSalvar" class="btn btn-primary" type="button">+ Adicionar FOB</button></div>
        </div>
        <div id="fobList" class="mt-16"></div>
      </details>
    </section>

    <section class="card mt-16 log-section" id="section-report">
      <div class="log-empty">Módulo <strong>Report</strong> em desenvolvimento.</div>
    </section>

    <section class="card mt-16 log-section" id="section-conferir">
      <div class="log-empty">Módulo <strong>Conferir</strong> em desenvolvimento.</div>
    </section>

    <section class="card mt-16 log-section" id="section-finalizacao">
      <div class="section-head"><div><h3>Fila de finalização</h3><p class="muted">O.S. enviadas pelo gestor com status <strong>Finalizar</strong>.</p></div></div>
      <div id="logFinalizacaoList"></div>
    </section>

    <section class="card mt-16 log-section" id="section-classificadores">
      <div class="section-head"><div><h3>Monitor de classificadores</h3><p class="muted">Baseado no script de notificação: identifica O.S. sem atualização, registra notificação e resposta do classificador.</p></div></div>
      <div class="log-note">Resposta 1 = ativo. Resposta 2 = finalizado. Resposta 3 = embarque suspenso e gera alerta para logística.</div>
      <div id="logClassificadoresList" class="mt-16"></div>
    </section>

    <section class="card mt-16 log-section" id="section-conferencias">
      <div class="section-head"><div><h3>Conferências operacionais</h3><p class="muted">Resumo visual das rotinas Cargas, FOB e NHE dos scripts anexados.</p></div></div>
      <div id="logConferenciasList"></div>
    </section>

    <section class="card mt-16 log-section" id="section-exportacoes">
      <div class="section-head"><div><h3>Exportações por cliente</h3><p class="muted">Agrupamento inspirado nos scripts LDC/COFCO, Sipal, Ouro Safra e Agrícola Alvorada.</p></div></div>
      <div class="field" style="max-width:360px"><label>Cliente</label><select id="logClienteExportacao" class="log-input"><option value="">Clientes dos scripts</option>${CLIENTES_EXPORTACAO.map((c) => `<option value="${esc(c)}">${esc(c)}</option>`).join('')}</select></div>
      <div id="logExportacoesList" class="mt-16"></div>
    </section>

    <section class="card mt-16 log-section" id="section-relatorios">
      <div class="section-head"><div><h3>Relatórios ao cliente</h3><p class="muted">Gera e envia relatório por e-mail usando a integração <strong>SMTP_RELATORIOS_LOGISTICA</strong> cadastrada em TI &gt; Integrações.</p></div></div>
      <div class="log-note">O envio roda em Supabase Edge Function. A lista fixa abaixo é usada automaticamente em todo envio, sem precisar redigitar diariamente. Destinatários manuais continuam disponíveis para envios pontuais.</div>
      <div class="log-report-grid mt-16">
        <div class="field"><label>Cliente</label><input id="relCliente" class="log-input" type="text" placeholder="Ex.: LDC, COFCO, Sipal..."></div>
        <div class="field"><label>Data inicial</label><input id="relDataInicial" class="log-input" type="date"></div>
        <div class="field"><label>Data final</label><input id="relDataFinal" class="log-input" type="date"></div>
        <div class="field"><label>Formato</label><select id="relFormato" class="log-input"><option value="CSV">CSV</option><option value="HTML">HTML no corpo</option><option value="CSV_HTML">CSV + HTML</option></select></div>
        <div class="field wide"><label>Destinatários manuais / extras</label><textarea id="relDestinatarios" class="log-input log-textarea" placeholder="Use apenas para e-mails extras deste envio. A lista fixa é carregada automaticamente."></textarea></div>
        <div class="field wide"><label>Observação / mensagem</label><textarea id="relMensagem" class="log-input log-textarea" placeholder="Mensagem opcional para aparecer no e-mail"></textarea></div>
      </div>

      <div class="card mt-16 log-subcard">
        <div class="section-head"><div><h4>Lista fixa de destinatários</h4><p class="muted">Cadastre aqui os e-mails que devem receber automaticamente os relatórios. Use cliente vazio para enviar em todos os relatórios.</p></div></div>
        <div class="log-report-grid mt-16">
          <div class="field"><label>Cliente / grupo</label><input id="relDestCliente" class="log-input" type="text" placeholder="Vazio = todos os clientes"></div>
          <div class="field"><label>E-mail</label><input id="relDestEmail" class="log-input" type="email" placeholder="cliente@empresa.com.br"></div>
          <div class="field"><label>Nome</label><input id="relDestNome" class="log-input" type="text" placeholder="Nome opcional"></div>
          <div class="field"><label>Tipo</label><select id="relDestTipo" class="log-input"><option value="TO">Para</option><option value="CC">Cc</option></select></div>
        </div>
        <div class="log-inline-actions mt-16">
          <button id="relSalvarDest" class="btn btn-secondary" type="button">Adicionar à lista fixa</button>
          <button id="relAplicarClienteDest" class="btn btn-secondary" type="button">Usar cliente do relatório</button>
        </div>
        <div id="relDestinatariosFixos" class="log-report-history"></div>
      </div>
      <div class="log-inline-actions mt-16">
        <button id="relPreview" class="btn btn-secondary" type="button">Pré-visualizar</button>
        <button id="relEnviar" class="btn btn-primary" type="button">Gerar e enviar</button>
      </div>
      <div id="relPreviewBox" class="log-copy mt-16" style="display:none"></div>
      <div id="relHistorico" class="log-report-history"></div>
    </section>
  `;

  const el = {
    tabs: document.getElementById('logTabs'),
    data: document.getElementById('logData'),
    coord: document.getElementById('logCoord'),
    status: document.getElementById('logStatus'),
    busca: document.getElementById('logBusca'),
    atraso: document.getElementById('logAtraso'),
    clienteExportacao: document.getElementById('logClienteExportacao'),
    feedback: document.getElementById('logFeedback'),
    stats: document.getElementById('logStats'),
    finalizacao: document.getElementById('logFinalizacaoList'),
    classificadores: document.getElementById('logClassificadoresList'),
    conferencias: document.getElementById('logConferenciasList'),
    exportacoes: document.getElementById('logExportacoesList'),
    relCliente: document.getElementById('relCliente'),
    relDataInicial: document.getElementById('relDataInicial'),
    relDataFinal: document.getElementById('relDataFinal'),
    relFormato: document.getElementById('relFormato'),
    relDestinatarios: document.getElementById('relDestinatarios'),
    relMensagem: document.getElementById('relMensagem'),
    relDestCliente: document.getElementById('relDestCliente'),
    relDestEmail: document.getElementById('relDestEmail'),
    relDestNome: document.getElementById('relDestNome'),
    relDestTipo: document.getElementById('relDestTipo'),
    relSalvarDest: document.getElementById('relSalvarDest'),
    relAplicarClienteDest: document.getElementById('relAplicarClienteDest'),
    relDestinatariosFixos: document.getElementById('relDestinatariosFixos'),
    relPreview: document.getElementById('relPreview'),
    relEnviar: document.getElementById('relEnviar'),
    relPreviewBox: document.getElementById('relPreviewBox'),
    relHistorico: document.getElementById('relHistorico'),
    reload: document.getElementById('logReload'),
  };

  el.tabs.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-tab]');
    if (!btn) return;
    state.tab = btn.dataset.tab;
    window.location.hash = state.tab;
    renderTabs();
    render();
  });
  el.data.addEventListener('change', () => { state.filters.data = el.data.value; render(); });
  el.coord.addEventListener('change', () => { state.filters.coordenacao = el.coord.value; render(); });
  el.status.addEventListener('change', () => { state.filters.status = el.status.value; render(); });
  el.busca.addEventListener('input', () => { state.filters.busca = el.busca.value; render(); });
  el.atraso.addEventListener('change', () => { state.filters.atrasoMin = el.atraso.value; render(); });
  el.clienteExportacao.addEventListener('change', () => { state.filters.clienteExportacao = el.clienteExportacao.value; render(); });
  el.relPreview.addEventListener('click', previewRelatorioCliente);
  el.relEnviar.addEventListener('click', enviarRelatorioCliente);
  el.relSalvarDest.addEventListener('click', salvarDestinatarioFixo);
  el.relAplicarClienteDest.addEventListener('click', () => { el.relDestCliente.value = el.relCliente.value.trim(); });
  el.relCliente.addEventListener('change', () => { if (!el.relDestCliente.value) el.relDestCliente.value = el.relCliente.value.trim(); });
  el.reload.addEventListener('click', loadAll);
  content.addEventListener('click', onClick);
  content.addEventListener('change', onChange);

  const hash = normalize(location.hash.replace('#', ''));
  if (hash.includes('CLASSIFIC')) state.tab = 'classificadores';
  else if (hash.includes('CONFER') && !hash.includes('CONFERIR')) state.tab = 'conferencias';
  else if (hash.includes('EXPORT')) state.tab = 'exportacoes';
  else if (hash.includes('FINALIZACAO') || hash.includes('FINALIZ')) state.tab = 'finalizacao';
  else if (hash.includes('FOB')) state.tab = 'fob';
  else if (hash.includes('REPORT')) state.tab = 'report';
  else if (hash.includes('CONFERIR')) state.tab = 'conferir';
  else state.tab = 'os';
  if (window.location.hash === '#relatorios') state.tab = 'relatorios';
  renderTabs();
  loadOsLog();
  await loadAll();

  async function loadAll() {
    el.feedback.textContent = 'Carregando dados da logística...';
    const [osRes, prodRes, alertRes] = await Promise.all([
      supabase.from('operacional_os').select('*').limit(5000),
      supabase.from('relatorio_resultado_diario').select('*').order('data', { ascending: false }).limit(5000),
      supabase.from('logistica_alertas').select('*').order('created_at', { ascending: false }).limit(1000),
    ]);

    if (osRes.error) {
      console.error(osRes.error);
      el.feedback.textContent = `${osRes.error.message}. Confira se a tabela operacional_os existe e se o SQL da logística foi executado.`;
      return;
    }

    state.os = safeArray(osRes.data).sort((a, b) => String(dateKey(b.data_os || b.data)).localeCompare(String(dateKey(a.data_os || a.data))) || String(osNumber(a)).localeCompare(String(osNumber(b)), 'pt-BR'));
    state.producao = prodRes.error ? [] : safeArray(prodRes.data);
    state.alertas = alertRes.error ? [] : safeArray(alertRes.data);

    if (prodRes.error) console.warn('relatorio_resultado_diario indisponível para exportações/conferências:', prodRes.error);
    if (alertRes.error) console.warn('logistica_alertas indisponível:', alertRes.error);

    const ids = state.os.map((row) => row.id).filter(Boolean);
    if (ids.length) {
      const atr = await supabase.from('operacional_os_colaboradores').select('*').in('os_id', ids);
      state.atribuicoes = atr.error ? [] : safeArray(atr.data);
      if (atr.error) console.warn('Falha ao carregar colaboradores da O.S.', atr.error);
    } else {
      state.atribuicoes = [];
    }

    fillCoords();
    render();
    el.feedback.textContent = `Carregado: ${state.os.length} O.S. · ${state.producao.length} registros de produção · ${state.alertas.length} alertas.`;
  }

  function fillCoords() {
    const current = el.coord.value;
    const coords = [...new Set(state.os.map(coordOf).filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b), 'pt-BR'));
    el.coord.innerHTML = '<option value="">Todas</option>' + coords.map((c) => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
    if (current) el.coord.value = current;
  }

  function renderTabs() {
    [...el.tabs.querySelectorAll('.log-tab')].forEach((btn) => btn.classList.toggle('active', btn.dataset.tab === state.tab));
    ['os', 'fob', 'report', 'conferir', 'finalizacao', 'classificadores', 'conferencias', 'exportacoes', 'relatorios'].forEach((tab) => {
      document.getElementById(`section-${tab}`)?.classList.toggle('active', tab === state.tab);
    });
    const isAdmTab = ['finalizacao', 'classificadores', 'conferencias', 'exportacoes', 'relatorios'].includes(state.tab);
    el.status.closest('.field').style.display = state.tab === 'finalizacao' ? '' : 'none';
    el.atraso.closest('.field').style.display = state.tab === 'classificadores' ? '' : 'none';
    document.querySelector('.filters-grid')?.style.setProperty('display', isAdmTab ? '' : 'none');
    if (state.tab === 'os' && !state.osLogLoaded) loadOsLog();
    if (state.tab === 'fob' && !state.fobLoaded) loadFob();
  }

  function renderStats() {
    const finalizacao = selectedRowsFinalizacao();
    const atrasadas = selectedRowsAtrasadas();
    const pend = finalizacao.filter((r) => statusLog(r) === 'PENDENTE').length;
    const andamento = finalizacao.filter((r) => statusLog(r) === 'EM_ANDAMENTO').length;
    const finalizadas = finalizacao.filter((r) => statusLog(r) === 'FINALIZADA').length;
    const suspensos = state.alertas.filter((a) => normalize(a.tipo) === 'SUSPENSO' && dateKey(a.created_at) === dateKey(new Date().toISOString())).length;
    el.stats.innerHTML = `
      <article class="card"><h3>Fila pendente</h3><p class="metric log-kpi-warn">${pend}</p><p class="muted">Gestor solicitou finalizar.</p></article>
      <article class="card"><h3>Em andamento</h3><p class="metric">${andamento}</p><p class="muted">Assumidas pela logística.</p></article>
      <article class="card"><h3>Finalizadas</h3><p class="metric log-kpi-ok">${finalizadas}</p><p class="muted">Concluídas no painel.</p></article>
      <article class="card"><h3>Sem atualização</h3><p class="metric log-kpi-danger">${atrasadas.length}</p><p class="muted">Atraso acima do filtro.</p></article>
      <article class="card"><h3>Suspensos hoje</h3><p class="metric log-kpi-danger">${suspensos}</p><p class="muted">Resposta 3/classificador.</p></article>`;
  }

  function renderFinalizacao() {
    const rows = selectedRowsFinalizacao();
    if (!rows.length) {
      el.finalizacao.innerHTML = '<div class="log-empty">Nenhuma O.S. na fila de finalização com os filtros atuais.</div>';
      return;
    }
    el.finalizacao.innerHTML = `
      <div class="log-table-wrap"><table class="log-table"><thead><tr>
        <th>O.S.</th><th>Rota / Cliente</th><th>Colaborador</th><th>Status</th><th>Observação</th><th>Ações</th>
      </tr></thead><tbody>
      ${rows.map((row) => {
        const colabs = atribuicoes(row.id);
        return `<tr data-os-id="${esc(row.id)}">
          <td><div class="log-title">${esc(osNumber(row))}</div><div class="log-meta">Data: ${brDate(row.data_os || row.data)}</div><div class="log-meta">Coord.: ${esc(coordOf(row))}</div></td>
          <td><div class="log-title">${esc(clienteOf(row))}</div><div class="log-meta">Origem: ${esc(origemOf(row))}</div><div class="log-meta">Destino: ${esc(destinoOf(row))}</div><div class="log-meta">Remanescente: ${BR_NUM.format(numberBr(row.remanescente))}</div></td>
          <td>${colabs.length ? colabs.map((a) => `<div class="log-title">${esc(a.colaborador_nome || a.nome || '-')}</div><div class="log-meta">${a.distancia_km != null ? `${BR_NUM.format(numberBr(a.distancia_km))} km · ` : ''}${esc(a.origem_sugestao || '')}</div>`).join('') : '<span class="muted">Sem colaborador vinculado</span>'}</td>
          <td>${statusBadge(row.status_logistica)}<div class="log-meta">Gestor: ${esc(row.status_gestor || '-')}</div>${row.enviado_logistica_em ? `<div class="log-meta">Enviado: ${brDate(row.enviado_logistica_em, true)}</div>` : ''}${row.finalizado_em ? `<div class="log-meta">Finalizado: ${brDate(row.finalizado_em, true)}</div>` : ''}</td>
          <td><textarea class="log-input log-textarea" data-obs-logistica placeholder="Observação da logística">${esc(row.observacao_logistica || '')}</textarea></td>
          <td><div class="log-actions">${actionButtonsFinalizacao(row)}</div></td>
        </tr>`;
      }).join('')}
      </tbody></table></div>`;
  }

  function actionButtonsFinalizacao(row) {
    const st = statusLog(row);
    if (st === 'FINALIZADA') return '<button class="btn btn-secondary" type="button" data-action="reabrir">Reabrir</button>';
    if (st === 'DEVOLVIDA') return '<button class="btn btn-secondary" type="button" data-action="reabrir">Reabrir</button>';
    return `
      ${st !== 'EM_ANDAMENTO' ? '<button class="btn btn-secondary" type="button" data-action="assumir">Assumir</button>' : ''}
      <button class="btn btn-primary" type="button" data-action="finalizar">Finalizar</button>
      <button class="btn btn-secondary" type="button" data-action="devolver">Devolver</button>`;
  }

  function renderClassificadores() {
    const rows = selectedRowsAtrasadas();
    if (!rows.length) {
      el.classificadores.innerHTML = '<div class="log-empty">Nenhuma O.S. com atraso acima do filtro.</div>';
      return;
    }
    el.classificadores.innerHTML = `
      <div class="log-table-wrap"><table class="log-table"><thead><tr>
        <th>O.S.</th><th>Classificador / contato</th><th>Cliente / local</th><th>Atraso</th><th>Status aviso</th><th>Ações</th>
      </tr></thead><tbody>
      ${rows.map((row) => {
        const colabs = atribuicoes(row.id);
        const classificador = colabs[0]?.colaborador_nome || row.atualizado_por || row.funcionario || '-';
        const alerta = getAlertForOs(row);
        const h = hoursSince(lastUpdateOf(row));
        return `<tr data-os-id="${esc(row.id)}">
          <td><div class="log-title">${esc(osNumber(row))}</div><div class="log-meta">Coord.: ${esc(coordOf(row))}</div></td>
          <td><div class="log-title">${esc(classificador)}</div><div class="log-meta">${colabs.length > 1 ? `${colabs.length} colaboradores vinculados` : 'Vínculo principal da O.S.'}</div></td>
          <td><div class="log-title">${esc(clienteOf(row))}</div><div class="log-meta">${esc(origemOf(row))}</div></td>
          <td>${badge(`${BR_NUM.format(h || 0)}h`, h >= 4 ? 'danger' : 'warn')}<div class="log-meta">Última atualização: ${brDate(lastUpdateOf(row), true)}</div></td>
          <td>${statusBadge(alerta?.status || 'PENDENTE')}<div class="log-meta">${alerta?.resposta ? `Resposta: ${esc(alerta.resposta)}` : 'Sem resposta registrada'}</div></td>
          <td><div class="log-actions"><button class="btn btn-secondary" type="button" data-action="notificar">Registrar notificação</button><button class="btn btn-secondary" type="button" data-action="resp1">Resp. 1 Ativo</button><button class="btn btn-secondary" type="button" data-action="resp2">Resp. 2 Finalizado</button><button class="btn btn-primary" type="button" data-action="resp3">Resp. 3 Suspenso</button></div></td>
        </tr>`;
      }).join('')}
      </tbody></table></div>`;
  }

  function renderConferencias() {
    const rows = selectedProducao();
    const total = rows.reduce((acc, r) => {
      acc.cargas += numberBr(r.cargas);
      acc.toneladas += numberBr(r.toneladas);
      acc.embarcado += numberBr(r.embarcado);
      acc.remanescente += numberBr(r.remanescente);
      return acc;
    }, { cargas: 0, toneladas: 0, embarcado: 0, remanescente: 0 });

    const byStatus = rows.reduce((acc, r) => {
      const okNhe = numberBr(r.embarcado) > 0 || numberBr(r.cargas) > 0;
      const key = okNhe ? 'OK/Com movimento' : 'Pendente';
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});

    el.conferencias.innerHTML = `
      <div class="log-mini-grid">
        <article class="card"><h3>Cargas</h3><p class="metric">${BR_INT.format(total.cargas)}</p><p class="muted">Soma das cargas filtradas.</p></article>
        <article class="card"><h3>Toneladas</h3><p class="metric">${BR_NUM.format(total.toneladas)}</p><p class="muted">Base para conferência.</p></article>
        <article class="card"><h3>Embarcado</h3><p class="metric">${BR_NUM.format(total.embarcado)}</p><p class="muted">FOB/NHE quando disponível.</p></article>
        <article class="card"><h3>Remanescente</h3><p class="metric">${BR_NUM.format(total.remanescente)}</p><p class="muted">Saldo operacional.</p></article>
      </div>
      <div class="log-note">Nesta etapa o painel replica a lógica de leitura/conferência dos scripts. A geração de XLSX/e-mail por cliente fica como próxima automação, usando estes agrupamentos já exibidos.</div>
      <div class="log-pill-row">${Object.entries(byStatus).map(([k, v]) => badge(`${k}: ${v}`, k.includes('Pendente') ? 'warn' : 'ok')).join('') || badge('Sem dados', 'neutral')}</div>`;
  }

  function renderExportacoes() {
    const groups = groupedExportacoes();
    if (!groups.length) {
      el.exportacoes.innerHTML = '<div class="log-empty">Nenhum registro encontrado para os clientes dos scripts com os filtros atuais.</div>';
      return;
    }
    el.exportacoes.innerHTML = `
      <div class="log-table-wrap"><table class="log-table"><thead><tr>
        <th>Cliente</th><th>Origem / destino</th><th>Produto</th><th>Volumes</th><th>O.S.</th><th>Prévia</th>
      </tr></thead><tbody>
      ${groups.map((g, idx) => `<tr>
        <td><div class="log-title">${esc(g.cliente)}</div><div class="log-meta">${g.rows} linha(s) agrupada(s)</div></td>
        <td><div class="log-title">${esc(g.origem)}</div><div class="log-meta">Destino: ${esc(g.destino)}</div></td>
        <td>${esc(g.produto)}</td>
        <td><div class="log-meta">Cargas: <b>${BR_INT.format(g.cargas)}</b></div><div class="log-meta">Toneladas: <b>${BR_NUM.format(g.toneladas)}</b></div><div class="log-meta">Embarcado: <b>${BR_NUM.format(g.embarcado)}</b></div><div class="log-meta">Remanescente: <b>${BR_NUM.format(g.remanescente)}</b></div></td>
        <td>${[...g.oss].slice(0, 6).map((os) => badge(os, 'neutral')).join('')}${g.oss.size > 6 ? badge(`+${g.oss.size - 6}`, 'info') : ''}</td>
        <td><button class="btn btn-secondary" type="button" data-copy-export="${idx}">Copiar resumo</button><template data-export-text="${idx}">${esc(exportText(g))}</template></td>
      </tr>`).join('')}
      </tbody></table></div>`;
  }

  function exportText(g) {
    return [
      `Cliente: ${g.cliente}`,
      `Origem: ${g.origem}`,
      `Destino: ${g.destino}`,
      `Produto: ${g.produto}`,
      `Cargas: ${BR_INT.format(g.cargas)}`,
      `Toneladas: ${BR_NUM.format(g.toneladas)}`,
      `Embarcado: ${BR_NUM.format(g.embarcado)}`,
      `Remanescente: ${BR_NUM.format(g.remanescente)}`,
      `OS: ${[...g.oss].join(', ') || '-'}`,
    ].join('\n');
  }

  function render() {
    renderStats();
    renderFinalizacao();
    renderClassificadores();
    renderConferencias();
    renderExportacoes();
    renderRelatorios();
    if (state.tab === 'fob') { renderFob(); renderFobReport(); }
  }

  // ── FOB 0 ────────────────────────────────────────────────────────────────

  async function loadFob() {
    await loadColaboradoresFob().catch(() => null);
    const list = document.getElementById('fobList');
    if (list) list.innerHTML = '<div class="log-empty">Carregando...</div>';
    const { data, error } = await supabase
      .from('logistica_fob')
      .select('*')
      .order('data_referencia', { ascending: false })
      .order('criado_em', { ascending: false })
      .limit(300);
    state.fob = safeArray(data);
    state.fobLoaded = true;
    if (error) console.warn('[FOB]', error);
    renderFob();
  }

  function renderFob() {
    const list = document.getElementById('fobList');
    if (!list) return;

    const pendentes = state.fob.filter((r) => r.status === 'PENDENTE');
    const historico = state.fob.filter((r) => r.status !== 'PENDENTE');

    function compBadge(r) {
      const st = r.status_comparacao || r.status_origem || 'PENDENTE';
      if (st === 'OK') return badge('Comparação OK', 'ok');
      if (st === 'DOIS EMBARQUES') return badge('Dois embarques', 'warn');
      return badge('Comparação pendente', 'danger');
    }

    function fobRow(r) {
      const isPendente = r.status === 'PENDENTE';
      const novo = r.visualizado === false || r.visualizado == null;
      const stBadge = isPendente
        ? badge(novo ? 'Não visualizado' : 'Pendente', 'warn')
        : r.status === 'VALIDO'
          ? badge('FOB válida', 'ok')
          : badge('FOB inválida', 'danger');
      const motivo = r.motivo || r.observacao || r.observacao_logistica || '-';
      return `<tr data-fob-id="${esc(r.id)}" class="${novo && isPendente ? 'log-fob-unread' : ''}" style="${novo && isPendente ? 'background:rgba(148,163,184,.10)' : ''}">
        <td><div class="log-title">${brDate(r.data_referencia)}</div><div class="log-meta">${esc(r.supervisao || '-')}</div></td>
        <td><div class="log-title">${esc(r.cliente || '-')}</div><div class="log-meta">OS: ${esc(r.numero_os || '-')}</div><div class="log-meta">Local: ${esc(r.local_embarque || r.cidade || '-')}</div></td>
        <td><div class="log-title">${esc(r.funcionario || '-')}</div><div class="log-meta">${esc(motivo)}</div></td>
        <td>
          ${compBadge(r)}
          <div class="log-meta">Mov.: <b>${BR_NUM.format(numberBr(r.tons_movimento))}</b> · Prod.: <b>${BR_NUM.format(numberBr(r.tons_producao))}</b> · NHE: <b>${BR_NUM.format(numberBr(r.tons_nh))}</b></div>
        </td>
        <td>${stBadge}${r.observacao_gestor ? `<div class="log-meta" style="margin-top:4px">${esc(r.observacao_gestor)}</div>` : ''}${!isPendente && r.validado_em ? `<div class="log-meta">${brDate(r.validado_em, true)}</div>` : ''}</td>
        <td>
          ${isPendente ? `
            <textarea class="log-input log-textarea" data-fob-obs-gestor style="min-height:46px;font-size:12px;margin-bottom:6px" placeholder="Observação do gestor (opcional)"></textarea>
            <div style="display:flex;gap:8px;align-items:center">
              <button class="btn btn-primary" data-fob-valido="${esc(r.id)}" title="Check — FOB válida" type="button">${ICO_CHECK}</button>
              <button class="btn" style="background:rgba(239,68,68,.18);border-color:rgba(239,68,68,.45);color:#fca5a5" data-fob-invalido="${esc(r.id)}" title="X — FOB inválida" type="button">${ICO_X}</button>
            </div>
          ` : '—'}
        </td>
      </tr>`;
    }

    if (!state.fob.length) {
      list.innerHTML = '<div class="log-empty">Nenhum FOB registrado ainda.</div>';
      return;
    }

    list.innerHTML = `
      ${pendentes.length ? `
        <h4 style="color:#fde68a;margin:0 0 10px">FOBs aguardando validação pelos gestores (${pendentes.length})</h4>
        <div class="log-table-wrap">
          <table class="log-table">
            <thead><tr><th>Data</th><th>Cliente / OS</th><th>Colaborador / Motivo</th><th>Comparação</th><th>Status gestor</th><th>Ação</th></tr></thead>
            <tbody>${pendentes.map(fobRow).join('')}</tbody>
          </table>
        </div>
      ` : '<div class="log-empty">Nenhum FOB pendente de validação.</div>'}
      ${historico.length ? `
        <h4 style="margin:24px 0 10px">Histórico geral validado (${historico.length})</h4>
        <div class="log-table-wrap">
          <table class="log-table">
            <thead><tr><th>Data</th><th>Cliente / OS</th><th>Colaborador / Motivo</th><th>Comparação</th><th>Status gestor</th><th></th></tr></thead>
            <tbody>${historico.map(fobRow).join('')}</tbody>
          </table>
        </div>
      ` : ''}
    `;
  }

  async function loadColaboradoresFob() {
    if (state.colaboradoresFob?.length) return state.colaboradoresFob;
    const { data } = await supabase
      .from('colaborador_snapshot')
      .select('nome,cpf,supervisao,coordenacao,data_referencia')
      .order('data_referencia', { ascending: false })
      .limit(2000);
    const seen = new Set();
    state.colaboradoresFob = safeArray(data).filter((r) => {
      const key = normalize(r.cpf || r.nome);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    const dl = document.getElementById('fobColaboradoresList');
    if (dl) dl.innerHTML = state.colaboradoresFob.map((c) => `<option value="${esc(c.nome)}">${esc([c.cpf, c.supervisao].filter(Boolean).join(' · '))}</option>`).join('');
    return state.colaboradoresFob;
  }

  async function buscarOsParaFob() {
    const os = document.getElementById('fobOs')?.value?.trim();
    if (!os) { el.feedback.textContent = 'Informe a O.S. para buscar.'; return; }
    const btn = document.getElementById('fobBuscarOs');
    if (btn) { btn.disabled = true; btn.textContent = 'Buscando...'; }
    try {
      const { data, error } = await supabase
        .from('operacional_os')
        .select('numero_os,data_os,cliente,supervisao,embarque,destino,remanescente,servico,produto')
        .eq('numero_os', os)
        .maybeSingle();
      if (error) throw error;
      if (!data) { el.feedback.textContent = 'O.S. não encontrada no banco operacional.'; return; }
      const set = (id, value) => { const node = document.getElementById(id); if (node && !node.value) node.value = value || ''; };
      set('fobData', data.data_os || new Date().toISOString().slice(0, 10));
      set('fobSup', data.supervisao || '');
      set('fobCliente', data.cliente || '');
      set('fobLocal', data.embarque || data.destino || '');
      el.feedback.textContent = `O.S. ${os} carregada para lançamento de FOB.`;
    } catch (error) {
      el.feedback.textContent = error.message || 'Erro ao buscar O.S.';
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Buscar OS'; }
    }
  }

  async function salvarFob() {
    await loadColaboradoresFob();
    const dataVal = document.getElementById('fobData')?.value;
    const numeroOs = document.getElementById('fobOs')?.value?.trim();
    const funcionario = document.getElementById('fobFuncionario')?.value?.trim();
    const motivo = document.getElementById('fobMotivo')?.value?.trim();
    if (!dataVal) { el.feedback.textContent = 'Informe a data do FOB.'; return; }
    if (!numeroOs) { el.feedback.textContent = 'Informe a O.S. do FOB.'; return; }
    if (!funcionario) { el.feedback.textContent = 'Informe o colaborador do FOB.'; return; }
    if (!motivo) { el.feedback.textContent = 'Informe o motivo do FOB.'; return; }
    const btn = document.getElementById('fobSalvar');
    btn.disabled = true; btn.textContent = 'Salvando...';
    const payload = [{
      data: dataVal,
      os: numeroOs,
      supervisao: document.getElementById('fobSup')?.value?.trim() || null,
      cliente: document.getElementById('fobCliente')?.value?.trim() || null,
      funcionario,
      cidade: null,
      local: document.getElementById('fobLocal')?.value?.trim() || null,
      status: 'PENDENTE',
      motivo,
      observacao: document.getElementById('fobObs')?.value?.trim() || motivo,
      origem: 'MANUAL_GESTOR',
    }];
    const { error } = await supabase.rpc('salvar_logistica_fob_importacao', { p_linhas: payload });
    btn.disabled = false; btn.textContent = '+ Adicionar FOB';
    if (error) { el.feedback.textContent = error.message; return; }
    ['fobOs','fobSup','fobCliente','fobLocal','fobFuncionario','fobMotivo','fobObs'].forEach((id) => {
      const inp = document.getElementById(id);
      if (inp) inp.value = '';
    });
    el.feedback.textContent = 'FOB registrado. Aguardando validação do gestor.';
    state.fobLoaded = false;
    await loadFob();
  }

  async function validarFob(id, status, triggerBtn) {
    const tr = triggerBtn.closest('[data-fob-id]');
    const obsEl = tr?.querySelector('[data-fob-obs-gestor]');
    const observacao_gestor = obsEl?.value?.trim() || null;
    triggerBtn.disabled = true;
    const now = new Date().toISOString();
    const { error } = await supabase.from('logistica_fob').update({
      status,
      observacao_gestor,
      validado_por: state.user?.id || null,
      validado_em:  now,
      visualizado: true,
      updated_at:   now,
    }).eq('id', id);
    if (error) { el.feedback.textContent = error.message; triggerBtn.disabled = false; return; }
    const idx = state.fob.findIndex((r) => String(r.id) === String(id));
    if (idx !== -1) Object.assign(state.fob[idx], { status, observacao_gestor, validado_em: now, visualizado: true });
    renderFob();
    el.feedback.textContent = `FOB 0 marcado como ${status === 'VALIDO' ? 'Válido ✓' : 'Inválido ✗'}.`;
  }


  // ── Importação e comparação FOB por planilhas ────────────────────────────

  function stripAccents(value) {
    return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  function normHeader(value) {
    return stripAccents(value).replace(/\u00A0/g, ' ').replace(/[^a-zA-Z0-9]+/g, ' ').trim().toUpperCase();
  }

  function normText(value) {
    return stripAccents(value).replace(/\u00A0/g, ' ').replace(/\s+/g, ' ').trim().toUpperCase();
  }

  function normOs(value) {
    let s = String(value ?? '').trim();
    if (!s) return '';
    if (/^\d+(\.0+)?$/.test(s)) s = s.replace(/\.0+$/, '');
    if (s.includes('/')) s = s.split('/')[0].trim();
    return s.replace(/\s+/g, ' ').trim();
  }

  function excelSerialToDate(serial) {
    const n = Number(serial);
    if (!Number.isFinite(n)) return null;
    const utc = Math.round((n - 25569) * 86400 * 1000);
    const d = new Date(utc);
    return Number.isNaN(d.getTime()) ? null : new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  }

  function parseDateOnly(value) {
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return new Date(value.getFullYear(), value.getMonth(), value.getDate());
    }
    if (typeof value === 'number') return excelSerialToDate(value);
    const s = String(value ?? '').trim();
    if (!s) return null;
    if (/^\d+(\.\d+)?$/.test(s)) return excelSerialToDate(Number(s));
    let m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
    if (m) return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
    m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }

  function ymd(value) {
    const d = parseDateOnly(value);
    if (!d) return '';
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function brDateFromAny(value) {
    const d = parseDateOnly(value);
    if (!d) return '-';
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
  }

  function toNumberLoose(value) {
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    const s = String(value ?? '').trim();
    if (!s || s === '--') return 0;
    const cleaned = s.replace(/\./g, '').replace(',', '.').replace(/[^0-9.-]/g, '');
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : 0;
  }

  function pickValue(row, aliases) {
    const keys = aliases.map(normHeader);
    for (const key of keys) {
      if (Object.prototype.hasOwnProperty.call(row, key)) return row[key];
    }
    return '';
  }

  function detectSheetRows(workbook, requiredAliases, preferredNames = []) {
    const preferred = workbook.SheetNames
      .map((name) => ({ name, n: normHeader(name) }))
      .sort((a, b) => {
        const ai = preferredNames.findIndex((p) => a.n.includes(normHeader(p)));
        const bi = preferredNames.findIndex((p) => b.n.includes(normHeader(p)));
        return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
      });

    let best = { rows: [], sheetName: '', score: -1 };
    for (const item of preferred) {
      const sheet = workbook.Sheets[item.name];
      if (!sheet) continue;
      const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' });
      for (let i = 0; i < Math.min(matrix.length, 8); i += 1) {
        const header = (matrix[i] || []).map(normHeader);
        const score = requiredAliases.reduce((sum, aliases) => sum + (aliases.some((a) => header.includes(normHeader(a))) ? 1 : 0), 0);
        if (score > best.score) {
          const rows = matrix.slice(i + 1).map((line) => {
            const obj = {};
            header.forEach((h, idx) => { if (h) obj[h] = line[idx] ?? ''; });
            return obj;
          }).filter((obj) => Object.values(obj).some((v) => String(v ?? '').trim()));
          best = { rows, sheetName: item.name, score };
        }
      }
    }
    const requiredMin = Math.max(2, Math.min(requiredAliases.length, Math.ceil(requiredAliases.length * 0.55)));
    if (best.score < requiredMin) {
      throw new Error(`Não encontrei uma aba compatível. Colunas localizadas insuficientes (${best.score}/${requiredAliases.length}).`);
    }
    return { ...best, requiredMin, requiredTotal: requiredAliases.length };
  }

  function fileNameBoostForType(fileName, tipo) {
    const n = normalize(fileName || '');
    if (tipo === 'nhe' && n.includes('NHE')) return 3;
    if (tipo === 'producao' && (n.includes('PRODUCAO') || n.includes('PRODUCAO DIARIA') || n.includes('RESULTADO'))) return 3;
    if (tipo === 'movimento' && (n.includes('MOVIMENTO') || n.includes('MOVIMENTACAO') || n.includes('MAPA') || n.includes('EMBARQUE'))) return 3;
    return 0;
  }

  function classificarArquivosFob(items) {
    const classified = {};
    Object.entries(FOB_DETECT_CONFIGS).forEach(([tipo, cfg]) => {
      let best = null;
      items.forEach((item) => {
        try {
          const detected = detectSheetRows(item.workbook, cfg.required, cfg.preferred);
          const score = (detected.score || 0) + fileNameBoostForType(item.file.name, tipo);
          if (!best || score > best.score) best = { ...item, detected, score };
        } catch (_error) {
          // Esse arquivo não parece ser deste tipo de relatório.
        }
      });
      if (best) classified[tipo] = best;
    });
    const missing = Object.entries(FOB_DETECT_CONFIGS)
      .filter(([tipo]) => !classified[tipo])
      .map(([, cfg]) => cfg.label);
    if (missing.length) {
      throw new Error(`Não consegui identificar automaticamente: ${missing.join(', ')}. Confira se os relatórios foram anexados juntos e se os cabeçalhos estão no modelo esperado.`);
    }
    return classified;
  }

  function renderFobFileDetection(classified = null) {
    const box = document.getElementById('fobDetectedFiles');
    const label = document.getElementById('fobFilesName');
    const uploads = safeArray(state.fobReportFiles?.uploads);
    if (label) label.textContent = uploads.length ? `${uploads.length} arquivo(s) selecionado(s)` : 'Selecionar arquivos';
    if (!box) return;
    if (!uploads.length) {
      box.innerHTML = 'Nenhum arquivo selecionado.';
      return;
    }
    const selected = uploads.map((file) => `<div>• ${esc(file.name)}</div>`).join('');
    if (!classified) {
      box.innerHTML = `<strong>Arquivos anexados:</strong>${selected}<div class="log-meta" style="margin-top:6px">A identificação automática será feita ao clicar em <strong>Gerar relatório FOB</strong>.</div>`;
      return;
    }
    box.innerHTML = `
      <strong>Identificação automática:</strong>
      <div>• Mapa/Movimentação: <b>${esc(classified.movimento.file.name)}</b> — aba ${esc(classified.movimento.detected.sheetName)}</div>
      <div>• Produção Diária: <b>${esc(classified.producao.file.name)}</b> — aba ${esc(classified.producao.detected.sheetName)}</div>
      <div>• NHE: <b>${esc(classified.nhe.file.name)}</b> — aba ${esc(classified.nhe.detected.sheetName)}</div>`;
  }

  async function readWorkbookFile(file) {
    if (!file) throw new Error('Arquivo não informado.');
    const buffer = await file.arrayBuffer();
    return XLSX.read(buffer, { type: 'array', cellDates: true });
  }

  async function gerarRelatorioFobPorPlanilhas() {
    const files = state.fobReportFiles || {};
    const uploadFiles = safeArray(files.uploads).length
      ? safeArray(files.uploads)
      : [files.movimento, files.producao, files.nhe].filter(Boolean);
    if (!uploadFiles.length) {
      el.feedback.textContent = 'Anexe os relatórios de Produção Diária, NHE e Mapa/Movimentação de Embarque no mesmo envio.';
      return;
    }
    const btn = document.getElementById('fobGerarRelatorio');
    if (btn) { btn.disabled = true; btn.textContent = 'Identificando...'; }
    try {
      const workbookItems = await Promise.all(uploadFiles.map(async (file) => ({
        file,
        workbook: await readWorkbookFile(file),
      })));
      const classified = classificarArquivosFob(workbookItems);
      state.fobReportFiles = {
        uploads: uploadFiles,
        movimento: classified.movimento.file,
        producao: classified.producao.file,
        nhe: classified.nhe.file,
      };
      renderFobFileDetection(classified);
      if (btn) btn.textContent = 'Comparando...';

      const movData = classified.movimento.detected;
      const prodData = classified.producao.detected;
      const nheData = classified.nhe.detected;

      const setNheOsData = new Set();
      const setNheCcld = new Set();
      nheData.rows.forEach((row) => {
        const os = normOs(pickValue(row, ['O.S.', 'OS', 'O.S', 'O S']));
        const data = ymd(pickValue(row, ['Data', 'Última Atualização', 'Ultima Atualizacao']));
        if (os && data) setNheOsData.add(`${os}|${data}`);
        const cli = pickValue(row, ['Cliente']);
        const cid = pickValue(row, ['Cidade de Embarque', 'Cidade']);
        const loc = pickValue(row, ['Embarque', 'Local', 'Local de Embarque']);
        if (cli && cid && loc && data) setNheCcld.add(`${normText(cli)}|${normText(cid)}|${normText(loc)}|${data}`);
      });

      const setProdNheOsData = new Set();
      prodData.rows.forEach((row) => {
        const os = normOs(pickValue(row, ['O.S.', 'OS']));
        const data = ymd(pickValue(row, ['Data']));
        const cargas = normText(pickValue(row, ['Cargas']));
        if (!os || cargas !== 'NHE') return;
        if (data) setProdNheOsData.add(`${os}|${data}`);
      });

      const movCcldCount = new Map();
      movData.rows.forEach((row) => {
        const data = ymd(pickValue(row, ['Data', 'Última Atualização', 'Ultima Atualizacao']));
        const cli = pickValue(row, ['Cliente']);
        const cid = pickValue(row, ['Cidade']);
        const loc = pickValue(row, ['Local', 'Local de Embarque']);
        if (!data || !cli || !cid || !loc) return;
        const key = `${normText(cli)}|${normText(cid)}|${normText(loc)}|${data}`;
        movCcldCount.set(key, (movCcldCount.get(key) || 0) + 1);
      });

      const rows = [];
      movData.rows.forEach((row) => {
        const os = normOs(pickValue(row, ['OS', 'O.S.', 'O.S']));
        const data = ymd(pickValue(row, ['Data', 'Última Atualização', 'Ultima Atualizacao']));
        if (!os || !data) return;
        const tonsHoje = toNumberLoose(pickValue(row, ['Tons Hoje', 'TonsHoje', 'Tons']));
        if (tonsHoje !== 0) return;
        const cliente = pickValue(row, ['Cliente']);
        const cidade = pickValue(row, ['Cidade']);
        const local = pickValue(row, ['Local', 'Local de Embarque']);
        const keyOsData = `${os}|${data}`;
        let status = 'PENDENTE';
        // Correspondência obrigatória por DATA: não usa mais fallback apenas por OS.
        const okNhe = setNheOsData.has(keyOsData);
        const okProd = setProdNheOsData.has(keyOsData);
        if (okNhe || okProd) {
          status = 'OK';
        } else {
          const keyCcld = `${normText(cliente)}|${normText(cidade)}|${normText(local)}|${data}`;
          if ((movCcldCount.get(keyCcld) || 0) >= 2 || setNheCcld.has(keyCcld)) status = 'DOIS EMBARQUES';
        }
        rows.push({
          data,
          data_br: brDateFromAny(data),
          os,
          supervisao: pickValue(row, ['Supervisão', 'Supervisao']),
          funcionario: pickValue(row, ['Atualizado por', 'Atualizado Por', 'Classificador', 'Funcionário', 'Funcionario']),
          cliente,
          cidade,
          local,
          tons_movimento: tonsHoje,
          status,
          observacao: pickValue(row, ['Observações', 'Observacoes', 'Obs']),
        });
      });

      const rank = { PENDENTE: 0, 'DOIS EMBARQUES': 1, OK: 2 };
      rows.sort((a, b) => (rank[a.status] ?? 99) - (rank[b.status] ?? 99)
        || String(a.data).localeCompare(String(b.data))
        || String(a.supervisao || '').localeCompare(String(b.supervisao || ''), 'pt-BR'));

      state.fobReportRows = rows;
      state.fobReportStats = {
        movimento: movData.rows.length,
        producao: prodData.rows.length,
        nhe: nheData.rows.length,
        abaMovimento: movData.sheetName,
        abaProducao: prodData.sheetName,
        abaNhe: nheData.sheetName,
        arquivoMovimento: classified.movimento.file.name,
        arquivoProducao: classified.producao.file.name,
        arquivoNhe: classified.nhe.file.name,
        pendentes: rows.filter((r) => r.status === 'PENDENTE').length,
        ok: rows.filter((r) => r.status === 'OK').length,
        dois: rows.filter((r) => r.status === 'DOIS EMBARQUES').length,
      };
      renderFobReport();
      await salvarPendentesFobImportado({ silent: true });
      el.feedback.textContent = `Relatório FOB gerado e salvo no histórico: ${rows.length} linha(s), ${state.fobReportStats.pendentes} pendente(s).`;
    } catch (error) {
      console.error('[FOB comparação]', error);
      el.feedback.textContent = `Falha ao gerar FOB: ${error.message || 'erro desconhecido'}`;
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Gerar relatório FOB'; }
    }
  }

  function renderFobReport() {
    const box = document.getElementById('fobReportResult');
    if (!box) return;
    const rows = state.fobReportRows || [];
    const stats = state.fobReportStats;
    const btnCsv = document.getElementById('fobExportCsv');
    const btnSave = document.getElementById('fobSalvarPendentes');
    if (btnCsv) btnCsv.disabled = !rows.length;
    if (btnSave) btnSave.disabled = !rows.length;
    if (!rows.length) {
      box.innerHTML = '<div class="log-empty">Anexe os arquivos e clique em <strong>Gerar e salvar FOB</strong> para gravar a comparação no histórico.</div>';
      return;
    }
    const preview = rows.slice(0, 250);
    box.innerHTML = `
      <section class="card">
        <div class="section-head">
          <div>
            <h3>Resultado da comparação FOB</h3>
            <p class="muted">Arquivos identificados: Mov./Mapa <b>${esc(stats?.arquivoMovimento || '-')}</b> · Produção <b>${esc(stats?.arquivoProducao || '-')}</b> · NHE <b>${esc(stats?.arquivoNhe || '-')}</b></p>
            <p class="muted">Abas usadas: Mov./Mapa <b>${esc(stats?.abaMovimento || '-')}</b> · Produção <b>${esc(stats?.abaProducao || '-')}</b> · NHE <b>${esc(stats?.abaNhe || '-')}</b></p>
            <p class="muted"><strong>Comparação por data:</strong> a O.S. só fica OK quando a confirmação estiver na mesma data do mapa.</p>
          </div>
        </div>
        <div class="log-mini-grid mt-16">
          <article class="card"><h3>Pendentes</h3><p class="metric log-kpi-danger">${BR_INT.format(stats?.pendentes || 0)}</p></article>
          <article class="card"><h3>Dois embarques</h3><p class="metric log-kpi-warn">${BR_INT.format(stats?.dois || 0)}</p></article>
          <article class="card"><h3>OK</h3><p class="metric log-kpi-ok">${BR_INT.format(stats?.ok || 0)}</p></article>
          <article class="card"><h3>Total FOB</h3><p class="metric">${BR_INT.format(rows.length)}</p></article>
        </div>
        <div class="log-table-wrap mt-16">
          <table class="log-table">
            <thead><tr><th>DATA</th><th>OS</th><th>SUPERVISÃO</th><th>FUNCIONÁRIO</th><th>STATUS</th><th>OBS</th></tr></thead>
            <tbody>${preview.map((r) => `<tr>
              <td>${esc(r.data_br)}</td>
              <td><div class="log-title">${esc(r.os)}</div><div class="log-meta">${esc(r.cliente || '-')}</div></td>
              <td>${esc(r.supervisao || '-')}</td>
              <td>${esc(r.funcionario || '-')}</td>
              <td><strong class="${r.status === 'OK' ? 'log-status-ok' : r.status === 'DOIS EMBARQUES' ? 'log-status-dois' : 'log-status-pendente'}">${esc(r.status)}</strong></td>
              <td><div class="log-meta">${esc(r.observacao || '')}</div></td>
            </tr>`).join('')}</tbody>
          </table>
        </div>
        ${rows.length > preview.length ? `<div class="log-note">Prévia limitada a ${preview.length} linhas no painel. Use Baixar CSV para o relatório completo.</div>` : ''}
      </section>`;
  }

  function fobRowsToCsv(rows) {
    const header = ['DATA', 'OS', 'SUPERVISÃO', 'FUNCIONÁRIO', 'STATUS', 'OBS'];
    const lines = [header, ...rows.map((r) => [r.data_br, r.os, r.supervisao, r.funcionario, r.status, r.observacao])];
    return lines.map((line) => line.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(';')).join('\n');
  }

  function exportarCsvFob() {
    const rows = state.fobReportRows || [];
    if (!rows.length) return;
    const blob = new Blob(['\ufeff' + fobRowsToCsv(rows)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `FOB_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function salvarPendentesFobImportado(options = {}) {
    const rows = state.fobReportRows || [];
    if (!rows.length) { el.feedback.textContent = 'Nenhum FOB para salvar.'; return; }
    const btn = document.getElementById('fobSalvarPendentes');
    if (btn) { btn.disabled = true; btn.textContent = 'Salvando...'; }
    try {
      const stats = state.fobReportStats || {};
      const payloadRpc = rows.map((r) => ({
        data: r.data,
        os: r.os || null,
        cliente: r.cliente || null,
        supervisao: r.supervisao || null,
        funcionario: r.funcionario || null,
        cidade: r.cidade || null,
        local: r.local || null,
        status: r.status || 'PENDENTE',
        motivo: r.status === 'OK' ? 'FOB confirmado por NHE/Produção na mesma data' : r.status === 'DOIS EMBARQUES' ? 'Possível dois embarques na mesma data' : 'FOB pendente sem confirmação na mesma data',
        observacao: r.observacao || null,
        tons_movimento: r.tons_movimento || 0,
        tons_producao: 0,
        tons_nh: 0,
        arquivo_movimentacao: stats.arquivoMovimento || null,
        arquivo_producao: stats.arquivoProducao || null,
        arquivo_nhe: stats.arquivoNhe || null,
        origem: 'IMPORTACAO_FOB',
      }));
      const { data: rpcData, error: rpcError } = await supabase.rpc('salvar_logistica_fob_importacao', { p_linhas: payloadRpc });
      if (rpcError) throw rpcError;
      const saved = Number(rpcData?.total_salvo || rows.length);
      if (!options.silent) el.feedback.textContent = `${saved} FOB(s) salvos/atualizados no painel.`;
      state.fobLoaded = false;
      await loadFob();
    } catch (error) {
      console.error('[FOB salvar]', error);
      el.feedback.textContent = `Falha ao salvar FOB: ${error.message || 'erro desconhecido'}`;
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Salvar/atualizar no painel'; }
    }
  }

  function limparImportacaoFob() {
    state.fobReportRows = [];
    state.fobReportStats = null;
    state.fobReportFiles = { uploads: [], movimento: null, producao: null, nhe: null };
    ['fobFiles', 'fobMovimentoFile', 'fobProducaoFile', 'fobNheFile'].forEach((id) => { const input = document.getElementById(id); if (input) input.value = ''; });
    ['fobMovimentoName', 'fobProducaoName', 'fobNheName'].forEach((id) => { const node = document.getElementById(id); if (node) node.textContent = 'Selecionar arquivo'; });
    renderFobFileDetection();
    renderFobReport();
    el.feedback.textContent = 'Importação FOB limpa.';
  }


  function parseDestinatarios(value) {
    return String(value || '')
      .split(/[;,\n]+/g)
      .map((v) => v.trim())
      .filter(Boolean);
  }

  function getRelatorioPayload() {
    const cliente = el.relCliente.value.trim();
    const dataInicial = el.relDataInicial.value || state.filters.data || '';
    const dataFinal = el.relDataFinal.value || dataInicial || '';
    const destinatarios = parseDestinatarios(el.relDestinatarios.value);
    return {
      cliente,
      data_inicial: dataInicial,
      data_final: dataFinal,
      formato: el.relFormato.value || 'CSV',
      destinatarios,
      incluir_lista_fixa: true,
      mensagem: el.relMensagem.value.trim(),
      solicitado_por: state.user?.id || null,
    };
  }

  function relatorioRowsPreview(payload) {
    const clienteFiltro = normalize(payload.cliente);
    const ini = payload.data_inicial;
    const fim = payload.data_final;
    return state.producao.filter((row) => {
      const d = dateKey(row.data || row.data_os);
      if (ini && d < ini) return false;
      if (fim && d > fim) return false;
      if (clienteFiltro && !normalize(clienteOf(row)).includes(clienteFiltro)) return false;
      return true;
    }).slice(0, 80);
  }

  function previewRelatorioCliente() {
    const payload = getRelatorioPayload();
    const rows = relatorioRowsPreview(payload);
    const fixos = destinatariosFixosParaCliente(payload.cliente);
    if (!payload.cliente) {
      el.feedback.textContent = 'Informe o cliente para pré-visualizar o relatório.';
      return;
    }
    if (!rows.length) {
      el.relPreviewBox.style.display = 'block';
      el.relPreviewBox.textContent = 'Nenhum registro encontrado na base carregada para este cliente/período.';
      return;
    }
    const totalTons = rows.reduce((sum, r) => sum + numberBr(r.toneladas), 0);
    const totalCargas = rows.reduce((sum, r) => sum + numberBr(r.cargas), 0);
    const linhas = rows.slice(0, 20).map((r) => `${dateKey(r.data)} | OS ${r.os || r.numero_os || '-'} | ${clienteOf(r)} | ${origemOf(r)} → ${destinoOf(r)} | ${BR_NUM.format(numberBr(r.toneladas))} tons`).join('\n');
    el.relPreviewBox.style.display = 'block';
    el.relPreviewBox.textContent = `Prévia do relatório\nCliente: ${payload.cliente}\nPeríodo: ${payload.data_inicial || '-'} até ${payload.data_final || '-'}\nLista fixa: ${fixos.map((d) => d.email).join(', ') || '-'}\nDestinatários extras: ${payload.destinatarios.join(', ') || '-'}\nLinhas encontradas: ${rows.length}\nCargas: ${BR_INT.format(totalCargas)}\nToneladas: ${BR_NUM.format(totalTons)}\n\n${linhas}`;
  }

  async function enviarRelatorioCliente() {
    const payload = getRelatorioPayload();
    if (!payload.cliente) return el.feedback.textContent = 'Informe o cliente.';
    if (!payload.data_inicial || !payload.data_final) return el.feedback.textContent = 'Informe data inicial e final.';
    // Destinatários manuais são opcionais; a Edge Function também busca a lista fixa cadastrada.
    el.relEnviar.disabled = true;
    el.feedback.textContent = 'Gerando e enviando relatório...';
    try {
      const { data, error } = await supabase.functions.invoke('enviar-relatorio-cliente', { body: payload });
      if (error) throw error;
      el.feedback.textContent = data?.message || 'Relatório enviado.';
      await carregarHistoricoRelatorios();
      await carregarDestinatariosFixos();
    } catch (err) {
      console.error('[Logística] enviar relatório:', err);
      el.feedback.textContent = err?.message || 'Erro ao enviar relatório. Confira a Edge Function e a integração SMTP.';
    } finally {
      el.relEnviar.disabled = false;
    }
  }


  function destinatariosFixosParaCliente(cliente) {
    const nCliente = normalize(cliente);
    return (state.destinatariosRelatorios || []).filter((d) => {
      if (d.ativo === false) return false;
      const dc = normalize(d.cliente || '');
      return !dc || dc === 'TODOS' || !nCliente || nCliente.includes(dc) || dc.includes(nCliente);
    });
  }

  async function carregarDestinatariosFixos() {
    if (!el.relDestinatariosFixos) return;
    const { data, error } = await supabase
      .from('logistica_relatorios_destinatarios')
      .select('*')
      .order('cliente', { ascending: true, nullsFirst: true })
      .order('email', { ascending: true });
    if (error) {
      el.relDestinatariosFixos.innerHTML = '<div class="log-empty">Lista fixa indisponível. Rode o SQL atualizado de destinatários.</div>';
      return;
    }
    state.destinatariosRelatorios = safeArray(data);
    renderDestinatariosFixos();
  }

  function renderDestinatariosFixos() {
    const list = state.destinatariosRelatorios || [];
    if (!list.length) {
      el.relDestinatariosFixos.innerHTML = '<div class="log-empty">Nenhum destinatário fixo cadastrado.</div>';
      return;
    }
    el.relDestinatariosFixos.innerHTML = `<div class="log-table-wrap"><table class="log-table"><thead><tr><th>Cliente/grupo</th><th>E-mail</th><th>Nome</th><th>Tipo</th><th>Status</th><th>Ações</th></tr></thead><tbody>${list.map((r) => `<tr><td>${esc(!r.cliente || normalize(r.cliente) === 'TODOS' ? 'Todos' : r.cliente)}</td><td>${esc(r.email || '-')}</td><td>${esc(r.nome || '-')}</td><td>${esc(r.tipo || 'TO')}</td><td>${r.ativo === false ? statusBadge('INATIVO') : statusBadge('ATIVO')}</td><td><button class="btn btn-secondary btn-sm" data-dest-toggle="${esc(r.id)}" type="button">${r.ativo === false ? 'Ativar' : 'Inativar'}</button></td></tr>`).join('')}</tbody></table></div>`;
  }

  async function salvarDestinatarioFixo() {
    const email = String(el.relDestEmail.value || '').trim();
    if (!email || !email.includes('@')) {
      el.feedback.textContent = 'Informe um e-mail válido para a lista fixa.';
      return;
    }
    const payload = {
      cliente: String(el.relDestCliente.value || '').trim() || 'TODOS',
      email,
      nome: String(el.relDestNome.value || '').trim() || null,
      tipo: String(el.relDestTipo.value || 'TO').trim().toUpperCase(),
      ativo: true,
      atualizado_por: state.user?.id || null,
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabase.from('logistica_relatorios_destinatarios').upsert(payload, { onConflict: 'cliente,email' });
    if (error) {
      console.error('[Logística] salvar destinatário fixo:', error);
      el.feedback.textContent = error.message || 'Erro ao salvar destinatário fixo.';
      return;
    }
    el.relDestEmail.value = '';
    el.relDestNome.value = '';
    el.feedback.textContent = 'Destinatário fixo salvo.';
    await carregarDestinatariosFixos();
  }

  async function carregarHistoricoRelatorios() {
    if (!el.relHistorico) return;
    const { data, error } = await supabase
      .from('logistica_relatorios_envios')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(12);
    if (error) {
      el.relHistorico.innerHTML = '<div class="log-empty">Histórico indisponível. Rode o SQL do relatório ao cliente.</div>';
      return;
    }
    if (!data?.length) {
      el.relHistorico.innerHTML = '<div class="log-empty">Nenhum envio registrado ainda.</div>';
      return;
    }
    el.relHistorico.innerHTML = `<div class="log-table-wrap"><table class="log-table"><thead><tr><th>Data</th><th>Cliente</th><th>Período</th><th>Destinatários</th><th>Status</th><th>Mensagem</th></tr></thead><tbody>${data.map((r) => `<tr><td>${brDate(r.created_at, true)}</td><td>${esc(r.cliente || '-')}</td><td>${brDate(r.data_inicial)} até ${brDate(r.data_final)}</td><td>${esc((r.destinatarios || []).join(', '))}</td><td>${statusBadge(r.status || '-')}</td><td><div class="log-meta">${esc(r.mensagem || r.erro || '-')}</div></td></tr>`).join('')}</tbody></table></div>`;
  }

  function renderRelatorios() {
    if (state.tab === 'relatorios') {
      carregarHistoricoRelatorios();
      carregarDestinatariosFixos();
    }
  }

  async function onClick(event) {
    // FOB 0 — form salvar
    if (event.target.closest('#fobSalvar')) { await salvarFob(); return; }
    if (event.target.closest('#fobBuscarOs')) { await buscarOsParaFob(); return; }
    if (event.target.closest('#fobReload')) { state.fobLoaded = false; await loadFob(); return; }
    if (event.target.closest('#fobGerarRelatorio')) { await gerarRelatorioFobPorPlanilhas(); return; }
    if (event.target.closest('#fobSalvarPendentes')) { await salvarPendentesFobImportado(); return; }
    if (event.target.closest('#fobExportCsv')) { exportarCsvFob(); return; }
    if (event.target.closest('#fobLimparImportacao')) { limparImportacaoFob(); return; }

    // FOB 0 — validar / invalidar
    const fobValido = event.target.closest('[data-fob-valido]');
    if (fobValido) { await validarFob(fobValido.dataset.fobValido, 'VALIDO', fobValido); return; }
    const fobInvalido = event.target.closest('[data-fob-invalido]');
    if (fobInvalido) { await validarFob(fobInvalido.dataset.fobInvalido, 'INVALIDO', fobInvalido); return; }

    const oslogOk = event.target.closest('[data-oslog-ok]');
    if (oslogOk) {
      const id = oslogOk.dataset.oslogOk;
      const type = oslogOk.dataset.oslogType;
      oslogOk.disabled = true;
      oslogOk.textContent = '...';
      const now = new Date().toISOString();
      const patch = type === 'kg'
        ? { observacao_logistica: null, updated_at: now }
        : { status_gestor: 'AGUARDAR', status_logistica: 'FINALIZADA', finalizado_em: now, updated_at: now };
      const { error } = await supabase.from('operacional_os').update(patch).eq('id', id);
      if (error) { alert(error.message); oslogOk.disabled = false; oslogOk.textContent = 'OK'; return; }
      state.osLog = state.osLog.filter((r) => String(r.id) !== String(id));
      renderOsLog();
      const meta = document.getElementById('osLogMeta');
      const f = state.osLog.filter((r) => String(r.status_gestor || '') === 'FINALIZAR').length;
      const k = state.osLog.filter((r) => String(r.observacao_logistica || '').startsWith('KG solicitado')).length;
      if (meta) meta.textContent = `${f} para finalizar · ${k} aumento de saldo`;
      return;
    }

    const copy = event.target.closest('[data-copy-export]');
    if (copy) {
      const tpl = content.querySelector(`template[data-export-text="${copy.dataset.copyExport}"]`);
      const text = tpl?.innerHTML ? tpl.innerHTML.replaceAll('&amp;', '&').replaceAll('&lt;', '<').replaceAll('&gt;', '>') : '';
      await navigator.clipboard?.writeText(text);
      el.feedback.textContent = 'Resumo copiado.';
      return;
    }

    const destToggle = event.target.closest('[data-dest-toggle]');
    if (destToggle) {
      const id = destToggle.dataset.destToggle;
      const row = (state.destinatariosRelatorios || []).find((d) => String(d.id) === String(id));
      if (row) {
        const { error } = await supabase.from('logistica_relatorios_destinatarios').update({ ativo: row.ativo === false, updated_at: new Date().toISOString() }).eq('id', id);
        if (error) el.feedback.textContent = error.message || 'Erro ao alterar destinatário.';
        else await carregarDestinatariosFixos();
      }
      return;
    }

    const btn = event.target.closest('[data-action]');
    if (!btn) return;
    const tr = btn.closest('[data-os-id]');
    const row = state.os.find((r) => String(r.id) === String(tr?.dataset.osId));
    if (!row) return;
    const action = btn.dataset.action;

    if (['assumir', 'finalizar', 'devolver', 'reabrir'].includes(action)) {
      await updateFinalizacao(row, action);
      return;
    }

    if (['notificar', 'resp1', 'resp2', 'resp3'].includes(action)) {
      await registrarAlertaClassificador(row, action);
    }
  }

  async function onChange(event) {
    const fobFilesInput = event.target.closest('#fobFiles');
    if (fobFilesInput) {
      const uploads = Array.from(fobFilesInput.files || []);
      state.fobReportFiles = { uploads, movimento: null, producao: null, nhe: null };
      state.fobReportRows = [];
      state.fobReportStats = null;
      renderFobFileDetection();
      renderFobReport();
      return;
    }

    const fobFileInput = event.target.closest('[data-fob-file]');
    if (fobFileInput) {
      const tipo = fobFileInput.dataset.fobFile;
      const file = fobFileInput.files?.[0] || null;
      state.fobReportFiles[tipo] = file;
      state.fobReportFiles.uploads = [state.fobReportFiles.movimento, state.fobReportFiles.producao, state.fobReportFiles.nhe].filter(Boolean);
      const labelId = tipo === 'movimento' ? 'fobMovimentoName' : tipo === 'producao' ? 'fobProducaoName' : 'fobNheName';
      const label = document.getElementById(labelId);
      if (label) label.textContent = file ? file.name : 'Selecionar arquivo';
      renderFobFileDetection();
      renderFobReport();
      return;
    }
    const obs = event.target.closest('[data-obs-logistica]');
    if (!obs) return;
    const row = state.os.find((r) => String(r.id) === String(obs.closest('[data-os-id]')?.dataset.osId));
    if (!row) return;
    row.observacao_logistica = obs.value;
    const { error } = await supabase.from('operacional_os').update({ observacao_logistica: obs.value, updated_at: new Date().toISOString() }).eq('id', row.id);
    if (error) el.feedback.textContent = error.message;
  }

  async function updateFinalizacao(row, action) {
    const now = new Date().toISOString();
    const patch = { updated_at: now };
    if (action === 'assumir') Object.assign(patch, { status_logistica: 'EM_ANDAMENTO', logistica_responsavel_id: state.user?.id || null, logistica_assumido_em: now });
    if (action === 'finalizar') Object.assign(patch, { status_logistica: 'FINALIZADA', finalizado_por: state.user?.id || null, finalizado_em: now });
    if (action === 'devolver') Object.assign(patch, { status_logistica: 'DEVOLVIDA', status_gestor: 'AGUARDAR', logistica_devolvido_em: now });
    if (action === 'reabrir') Object.assign(patch, { status_logistica: 'PENDENTE', status_gestor: 'AGUARDAR', finalizado_por: null, finalizado_em: null, logistica_devolvido_em: null });

    const previous = { ...row };
    Object.assign(row, patch);
    render();
    const { error } = await supabase.from('operacional_os').update(patch).eq('id', row.id);
    if (error) {
      Object.assign(row, previous);
      render();
      el.feedback.textContent = error.message;
      return;
    }
    await addLog(row, action.toUpperCase(), patch);
    el.feedback.textContent = 'O.S. atualizada na logística.';
  }

  async function registrarAlertaClassificador(row, action) {
    const now = new Date().toISOString();
    const colabs = atribuicoes(row.id);
    const classificador = colabs[0]?.colaborador_nome || row.atualizado_por || row.funcionario || '';
    const status = action === 'notificar' ? 'ENVIADA' : action === 'resp1' ? 'RESPONDIDA_1' : action === 'resp2' ? 'RESPONDIDA_2' : 'RESPONDIDA_3_SUSPENSO';
    const resposta = action === 'notificar' ? null : action === 'resp1' ? '1' : action === 'resp2' ? '2' : '3';
    const tipo = action === 'resp3' ? 'SUSPENSO' : 'OS_ATRASADA';
    const payload = {
      os_id: row.id,
      os: String(osNumber(row)),
      tipo,
      status,
      resposta,
      classificador,
      cliente: clienteOf(row),
      local: origemOf(row),
      coordenacao: coordOf(row),
      ultima_atualizacao: lastUpdateOf(row),
      atraso_horas: hoursSince(lastUpdateOf(row)),
      mensagem: montarMensagemClassificador(row, action),
      criado_por: state.user?.id || null,
      updated_at: now,
    };

    const { data, error } = await supabase.from('logistica_alertas').insert(payload).select('*').single();
    if (error) {
      el.feedback.textContent = `${error.message}. Confira se o SQL logistica_alertas foi executado.`;
      return;
    }
    state.alertas.unshift(data || payload);
    render();
    el.feedback.textContent = action === 'resp3' ? 'Suspensão registrada e disponível para a logística.' : 'Registro salvo.';
  }

  function montarMensagemClassificador(row, action) {
    if (action === 'resp3') {
      return `🚨 EMBARQUE SUSPENSO\nOS: ${osNumber(row)}\nCliente: ${clienteOf(row)}\nLocal: ${origemOf(row)}\nClassificador: ${atribuicoes(row.id)[0]?.colaborador_nome || row.atualizado_por || '-'}`;
    }
    return `OS: ${osNumber(row)}\nCliente: ${clienteOf(row)}\nLocal: ${origemOf(row)}`;
  }

  async function loadOsLog() {
    const meta = document.getElementById('osLogMeta');
    const list = document.getElementById('osLogList');
    if (meta) meta.textContent = 'Carregando...';
    const { data, error } = await supabase
      .from('operacional_os')
      .select('id,numero_os,data_os,cliente,embarque,destino,supervisao,remanescente,lote,embarcado,status_gestor,observacao_logistica')
      .or('status_gestor.eq.FINALIZAR,observacao_logistica.ilike.KG solicitado*')
      .order('data_os', { ascending: false })
      .limit(1000);
    state.osLog = safeArray(data);
    state.osLogLoaded = true;
    const finalizarCount = state.osLog.filter((r) => String(r.status_gestor || '') === 'FINALIZAR').length;
    const kgCount = state.osLog.filter((r) => String(r.observacao_logistica || '').startsWith('KG solicitado')).length;
    if (meta) meta.textContent = `${finalizarCount} para finalizar · ${kgCount} aumento de saldo`;
    if (error) { if (list) list.innerHTML = `<div class="log-empty">${esc(error.message)}</div>`; return; }
    renderOsLog();
    document.getElementById('osLogReload')?.addEventListener('click', () => { state.osLogLoaded = false; loadOsLog(); });
  }

  function renderOsLog() {
    const list = document.getElementById('osLogList');
    if (!list) return;
    if (!state.osLog.length) { list.innerHTML = '<div class="log-empty">Nenhuma O.S. pendente para a Logística.</div>'; return; }
    const BR = new Intl.NumberFormat('pt-BR');
    const fmt = (v) => BR.format(Number(v) || 0);
    const brD = (v) => { if (!v) return '-'; const [y,m,d] = String(v).slice(0,10).split('-'); return `${d}/${m}/${y}`; };
    list.innerHTML = `
      <div class="log-table-wrap"><table class="log-table"><thead><tr>
        <th style="width:10%">O.S.</th>
        <th style="width:32%">Cliente / Rota</th>
        <th style="width:13%">Remanescente</th>
        <th style="width:30%">Solicitação</th>
        <th style="width:15%">Ação</th>
      </tr></thead><tbody>
      ${state.osLog.map((row) => {
        const isKg = String(row.observacao_logistica || '').startsWith('KG solicitado');
        const type = isKg ? 'kg' : 'finalizar';
        const badge = isKg
          ? `<span class="log-badge danger">↑ KG</span><div class="log-meta" style="margin-top:4px">${esc(row.observacao_logistica)}</div>`
          : `<span class="log-badge info">$ Finalizar</span>`;
        const rem = Number(row.remanescente);
        return `<tr>
          <td><div class="log-title">${esc(row.numero_os || '-')}</div><div class="log-meta">${brD(row.data_os)}</div><div class="log-meta">${esc(row.supervisao || '-')}</div></td>
          <td><div class="log-title">${esc(row.cliente || '-')}</div><div class="log-meta">Emb.: ${esc(row.embarque || '-')}</div><div class="log-meta">Dest.: ${esc(row.destino || '-')}</div></td>
          <td><span class="log-badge ${rem <= 0 ? 'warn' : 'ok'}">${fmt(rem)}</span><div class="log-meta" style="margin-top:4px">Lote ${fmt(row.lote)}</div></td>
          <td>${badge}</td>
          <td><button class="btn btn-primary" data-oslog-ok="${esc(String(row.id))}" data-oslog-type="${type}" type="button">OK</button></td>
        </tr>`;
      }).join('')}
      </tbody></table></div>`;
  }

  async function addLog(row, action, payload) {
    try {
      await supabase.from('logistica_alertas').insert({
        os_id: row.id,
        os: String(osNumber(row)),
        tipo: 'FINALIZACAO_OS',
        status: payload.status_logistica || row.status_logistica || action,
        cliente: clienteOf(row),
        local: origemOf(row),
        coordenacao: coordOf(row),
        mensagem: `Ação logística: ${action}`,
        payload,
        criado_por: state.user?.id || null,
        updated_at: new Date().toISOString(),
      });
    } catch (error) {
      console.warn('Falha ao registrar log de logística', error);
    }
  }
});
