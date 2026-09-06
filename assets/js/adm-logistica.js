import * as XLSX from 'https://cdn.sheetjs.com/xlsx-0.20.2/package/xlsx.mjs';
import { initProtectedPage } from './pageInit.js';
import { supabase } from './supabaseClient.js';
import { getCurrentUser } from './auth.js';
import { toPanelUrl } from './paths.js';

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

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Atualiza o hash da URL sem usar `window.location.hash = ...`. Essa forma
// direta dispara um evento de navegação (mesmo sendo só um "#" -- confirmado
// ao vivo via depurador: um `location.hash = 'x'` sozinho, sem nenhum outro
// código rodando, já faz a tela toda "piscar" com o fundo preto por um
// instante, sidebar incluída) — reportado pela usuária como bug na página
// unificada O.S (23/07/2026), mas a causa é aqui, no clique de aba
// compartilhado por TODAS as 9 abas de qualquer página de Logística ADM.
// `history.replaceState` atualiza a URL (inclusive `location.hash`) sem esse
// efeito colateral.
function setTabHash(tab) {
  history.replaceState(null, '', `${window.location.pathname}${window.location.search}#${tab}`);
}

const state = {
  user: null,
  tab: 'os',
  osLog: [],
  osLogLoaded: false,
  aberturaOs: [],
  aberturaOsLoaded: false,
  fob: [],
  fobLoaded: false,
  fobReportRows: [],
  fobReportStats: null,
  fobReportAutoLoaded: false,
  os: [],
  atribuicoes: [],
  alertas: [],
  producao: [],
  producaoLoaded: false,
  destinatariosRelatorios: [],
  ufsCargasLoaded: false,
  mapaRegionalUf: [], // [{estado, regional}] vindo de metas_producao
  filters: {
    data: todayIso(),
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
    .log-card-clickable{cursor:pointer;transition:border-color .15s,background .15s}.log-card-clickable:hover{border-color:rgba(134,239,172,.5)!important;background:rgba(22,101,52,.13)!important}
    .log-upload-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.log-upload-card{display:flex;flex-direction:column;gap:7px;border:1px dashed rgba(52,211,153,.28);border-radius:18px;background:rgba(15,23,42,.36);padding:14px;cursor:pointer;min-height:118px}.log-upload-card:hover{border-color:rgba(134,239,172,.55);background:rgba(22,101,52,.13)}.log-upload-card span{font-weight:950;color:#f8fafc}.log-upload-card small{color:#94a3b8;line-height:1.35}.log-upload-card b{margin-top:auto;color:#86efac;font-size:12px;word-break:break-word}.log-status-pendente{color:#fecaca!important}.log-status-ok{color:#bbf7d0!important}.log-status-dois{color:#fde68a!important}.log-report-actions{display:flex;gap:8px;flex-wrap:wrap}.log-subcard summary::marker{color:#86efac}
    @media(max-width:1100px){.log-grid{grid-template-columns:1fr 1fr}.log-mini-grid,.log-report-grid{grid-template-columns:1fr 1fr}.log-table{min-width:980px}}@media(max-width:720px){.log-grid,.log-mini-grid,.log-report-grid,.log-upload-grid{grid-template-columns:1fr}.log-report-grid .wide{grid-column:auto}.log-tabs{overflow:auto;flex-wrap:nowrap}.log-tab{white-space:nowrap}}
  `;
  document.head.appendChild(style);
}

export async function renderContent(content) {
  injectStyles();
  state.user = await getCurrentUser();

  content.innerHTML = `
    <section class="card mt-16">
      <div class="section-head">
        <div>
          <h3>Painel de Logística</h3>
          <p class="muted">Fluxo central para finalizar O.S., monitorar classificadores sem atualização, controlar suspensões e preparar relatórios operacionais dos clientes.</p>
        </div>
        <button id="logReload" class="btn btn-secondary" type="button">↻ Atualizar</button>
      </div>
      <div class="log-tabs" id="logTabs">
        <button class="log-tab active" data-tab="os" type="button">O.S.</button>
        <button class="log-tab" data-tab="abertura_os" type="button">Abertura de OS</button>
        <button class="log-tab" data-tab="ajuste" type="button">Ajuste</button>
        <button class="log-tab" data-tab="fob" type="button">FOB</button>
        <button class="log-tab" data-tab="finalizacao" type="button">Finalização ADM</button>
        <button class="log-tab" data-tab="classificadores" type="button">Classificadores</button>
        <button class="log-tab" data-tab="conferencias" type="button">Conferências</button>
        <button class="log-tab" data-tab="exportacoes" type="button">Exportações clientes</button>
        <button class="log-tab" data-tab="relatorios" type="button">Relatórios ao cliente</button>
      </div>
      <div class="filters-grid log-grid">
        <div class="field"><label>Data</label><input id="logData" class="log-input" type="date" value="${esc(state.filters.data)}" /></div>
        <div class="field"><label>Coordenação</label><select id="logCoord" class="log-input"></select></div>
        <div class="field"><label>Status logística</label><select id="logStatus" class="log-input"><option value="">Todos</option>${Object.entries(STATUS_LOGISTICA).map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select></div>
        <div class="field"><label>Buscar</label><input id="logBusca" class="log-input" type="text" placeholder="O.S., cliente, classificador, local..." /></div>
        <div class="field"><label>Atraso mínimo</label><select id="logAtraso" class="log-input"><option value="1">1 hora</option><option value="2">2 horas</option><option value="4">4 horas</option><option value="8">8 horas</option></select></div>
      </div>
      <div class="feedback mt-16" id="logFeedback">Carregando...</div>
    </section>

    <section class="grid-cards mt-16" id="logStats"></section>

    <section class="card mt-16 log-section" id="section-abertura_os">
      <div class="section-head">
        <div>
          <h3>Abertura de OS</h3>
          <p class="muted">Solicitações enviadas pelo Gestor para cadastro da O.S. pela Logística ADM.</p>
        </div>
        <button class="btn btn-secondary" id="aberturaOsReload" type="button">↻ Atualizar</button>
      </div>
      <div id="aberturaOsList"></div>
    </section>

    <section class="card mt-16 log-section active" id="section-os">
      <div class="section-head">
        <div><h3>O.S. para Logística</h3><p class="muted" id="osLogMeta">Carregando...</p></div>
        <button class="btn btn-secondary" id="osLogReload" type="button">↻ Atualizar</button>
      </div>
      <div id="osLogList"></div>
    </section>

    <section class="card mt-16 log-section" id="section-fob">
      <div class="section-head">
        <div>
          <h3>FOB — Comparação automática</h3>
          <p class="muted">Comparação gerada automaticamente com a base sincronizada pelos agentes (Distribuição de O.S., Produção Diária e NHE).</p>
        </div>
        <div class="log-inline-actions">
          <button id="fobReload" class="btn btn-secondary" type="button">↻ Atualizar histórico</button>
          <button id="fobSalvarPendentes" class="btn btn-secondary" type="button" disabled>Salvar pendentes no painel</button>
          <button id="fobExportCsv" class="btn btn-secondary" type="button" disabled>Exportar CSV</button>
        </div>
      </div>
      <div class="log-note">Regra aplicada: entra no FOB toda O.S. do mapa com <strong>Tons Hoje = 0</strong>. Status <strong>OK</strong> quando há NHE por O.S./data ou Produção com Cargas = NHE; <strong>DOIS EMBARQUES</strong> quando a mesma combinação Cliente + Cidade + Local + Data aparece 2+ vezes no mapa ou também no NHE; senão fica <strong>PENDENTE</strong>.</div>

      <div id="fobReportResult" class="mt-16"></div>

      <div class="card mt-16 log-subcard">
        <h4 style="margin:0 0 14px;color:#bbf7d0">Imagem por Regional</h4>
        <p class="muted" style="margin:-8px 0 14px">Equivalente ao script Regional.js: agrupa o relatório FOB acima por Supervisão (regional) e gera uma imagem para compartilhar.</p>
        <div class="log-report-grid" style="grid-template-columns:260px auto auto">
          <div class="field"><label>Regional</label><select id="logRegionalFob" class="log-input"><option value="">Selecione</option></select></div>
          <div class="field" style="align-self:end"><button id="logGerarImagemRegional" class="btn btn-primary" type="button">Gerar imagem</button></div>
          <div class="field" style="align-self:end"><button id="logGerarZipRegionais" class="btn btn-secondary" type="button">Gerar ZIP (todas)</button></div>
        </div>
        <div class="log-note" id="logRegionalFeedback" style="display:none"></div>
      </div>

      <details class="card mt-16 log-subcard">
        <summary style="cursor:pointer;font-weight:950;color:#bbf7d0">Lançamento manual / histórico de validação</summary>
        <div class="card mt-16">
          <h4 style="margin:0 0 14px;color:#bbf7d0">Registrar FOB 0 manualmente</h4>
          <div class="filters-grid log-grid" style="grid-template-columns:repeat(3,minmax(140px,1fr))">
            <div class="field"><label>Data *</label><input id="fobData" class="log-input" type="date" /></div>
            <div class="field"><label>O.S. (opcional)</label><input id="fobOs" class="log-input" type="text" placeholder="Número da OS" /></div>
            <div class="field"><label>Supervisão</label><input id="fobSup" class="log-input" type="text" placeholder="Regional" /></div>
            <div class="field"><label>Cliente</label><input id="fobCliente" class="log-input" type="text" placeholder="Nome do cliente" /></div>
            <div class="field"><label>Tons mov. diária</label><input id="fobMov" class="log-input" type="number" step="0.01" placeholder="0,00" /></div>
            <div class="field"><label>Tons prod. diária</label><input id="fobProd" class="log-input" type="number" step="0.01" placeholder="0,00" /></div>
            <div class="field"><label>Tons NH</label><input id="fobNh" class="log-input" type="number" step="0.01" placeholder="0,00" /></div>
            <div class="field" style="grid-column:span 2"><label>Observação</label><textarea id="fobObs" class="log-input log-textarea" placeholder="Motivo do FOB 0, referência do NH, detalhes da comparação..."></textarea></div>
          </div>
          <div class="mt-16"><button id="fobSalvar" class="btn btn-primary" type="button">Registrar FOB 0</button></div>
        </div>
        <div id="fobList" class="mt-16"></div>
      </details>
    </section>

    <section class="card mt-16 log-section" id="section-finalizacao">
      <div class="section-head"><div><h3>Fila de finalização</h3><p class="muted">O.S. enviadas pelo gestor com status <strong>Finalizar</strong>.</p></div></div>
      <div id="logFinalizacaoList"></div>
    </section>

    <section class="card mt-16 log-section" id="section-ajuste">
      <div class="section-head"><div><h3>Ajuste de saldo (KG)</h3><p class="muted">O.S. com aumento de saldo solicitado pelo gestor (Programação › <strong>Saldo</strong>), aguardando ajuste da Logística.</p></div></div>
      <div id="logAjusteList"></div>
    </section>

    <section class="card mt-16 log-section" id="section-classificadores">
      <div class="section-head"><div><h3>Monitor de classificadores</h3><p class="muted">Baseado no script de notificação: identifica O.S. sem atualização, registra notificação e resposta do classificador.</p></div></div>
      <div class="log-note">Resposta 1 = ativo. Resposta 2 = finalizado. Resposta 3 = embarque suspenso e gera alerta para logística.</div>
      <div id="logClassificadoresList" class="mt-16"></div>
    </section>

    <section class="card mt-16 log-section" id="section-conferencias">
      <div class="section-head"><div><h3>Conferências operacionais</h3><p class="muted">Resumo visual das rotinas Cargas, FOB e NHE dos scripts anexados.</p></div></div>
      <div id="logConferenciasList"></div>

      <div class="card mt-16 log-subcard">
        <div class="section-head"><div><h3>Laudos anexados</h3><p class="muted">O.S. com remanescente negativo e laudo anexado pelo gestor, aguardando conferência.</p></div></div>
        <div id="logConferenciasLaudos"></div>
      </div>
    </section>

    <section class="card mt-16 log-section" id="section-exportacoes">
      <div class="section-head"><div><h3>Exportações por cliente</h3><p class="muted">Agrupamento inspirado nos scripts LDC/COFCO, Sipal, Ouro Safra e Agrícola Alvorada.</p></div></div>
      <div class="field" style="max-width:360px"><label>Cliente</label><select id="logClienteExportacao" class="log-input"><option value="">Clientes dos scripts</option>${CLIENTES_EXPORTACAO.map((c) => `<option value="${esc(c)}">${esc(c)}</option>`).join('')}</select></div>
      <div id="logExportacoesList" class="mt-16"></div>

      <div class="card mt-16 log-subcard">
        <h4 style="margin:0 0 14px;color:#bbf7d0">Baixar Cargas por Cliente + UF</h4>
        <p class="muted" style="margin:-8px 0 14px">Equivalente ao "Baixar Cargas" do script antigo. Use o campo Cliente acima e escolha a UF — a UF é resolvida via <strong>Metas &gt; Produção</strong> (coordenação ↔ estado), já que a base de cargas sincronizada não traz UF diretamente.</p>
        <div class="log-report-grid" style="grid-template-columns:220px auto">
          <div class="field"><label>UF</label><select id="logUfCargas" class="log-input"><option value="">Selecione</option></select></div>
          <div class="field" style="align-self:end"><button id="logBaixarCargasBtn" class="btn btn-primary" type="button">Baixar XLSX</button></div>
        </div>
        <div class="log-note" id="logBaixarCargasFeedback" style="display:none"></div>
      </div>

      <div class="card mt-16 log-subcard">
        <h4 style="margin:0 0 14px;color:#bbf7d0">NHE — COFCO / AMAGGI</h4>
        <p class="muted" style="margin:-8px 0 14px">Equivalente ao script NHE.js: separa o NHE de hoje por Supervisão (COFCO: Supervisão começando com "Mato Grosso MT1" ou "MT4"; AMAGGI: "Rio Grande do Sul") em duas abas de um mesmo XLSX.</p>
        <div class="log-inline-actions">
          <button id="logBaixarNheBtn" class="btn btn-primary" type="button">Baixar XLSX (COFCO + AMAGGI)</button>
        </div>
        <div class="log-note" id="logBaixarNheFeedback" style="display:none"></div>
      </div>
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
        <button id="relGerarImagem" class="btn btn-secondary" type="button">Gerar imagem (WhatsApp)</button>
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
    aberturaOsList: document.getElementById('aberturaOsList'),
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
    relGerarImagem: document.getElementById('relGerarImagem'),
    relPreviewBox: document.getElementById('relPreviewBox'),
    relHistorico: document.getElementById('relHistorico'),
    reload: document.getElementById('logReload'),
    ufCargas: document.getElementById('logUfCargas'),
    baixarCargasBtn: document.getElementById('logBaixarCargasBtn'),
    baixarNheBtn: document.getElementById('logBaixarNheBtn'),
    baixarCargasFeedback: document.getElementById('logBaixarCargasFeedback'),
    regionalFob: document.getElementById('logRegionalFob'),
    gerarImagemRegional: document.getElementById('logGerarImagemRegional'),
    gerarZipRegionais: document.getElementById('logGerarZipRegionais'),
    regionalFeedback: document.getElementById('logRegionalFeedback'),
  };

  el.tabs.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-tab]');
    if (!btn) return;
    state.tab = btn.dataset.tab;
    setTabHash(state.tab);
    renderTabs();
    render();
  });

  // Cada página de Logística ADM é isolada numa única aba (ver
  // logistica-admin-entry.js: body[data-logistica-tab] força só uma
  // #section-* visível via CSS) — trocar state.tab aqui dentro não revela a
  // seção noutra página, então o card navega pra página dedicada da aba.
  el.stats.addEventListener('click', (event) => {
    const card = event.target.closest('[data-jump-tab]');
    if (!card) return;
    const tab = card.dataset.jumpTab;
    if (tab === state.tab) return;
    if (tab === 'abertura_os') { window.location.href = toPanelUrl('logistica-abertura-os'); return; }
    state.tab = tab;
    setTabHash(state.tab);
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
  el.relGerarImagem.addEventListener('click', gerarImagemRelatorioCliente);
  el.relSalvarDest.addEventListener('click', salvarDestinatarioFixo);
  el.relAplicarClienteDest.addEventListener('click', () => { el.relDestCliente.value = el.relCliente.value.trim(); });
  el.relCliente.addEventListener('change', () => { if (!el.relDestCliente.value) el.relDestCliente.value = el.relCliente.value.trim(); });
  el.reload.addEventListener('click', loadAll);
  el.baixarCargasBtn.addEventListener('click', baixarCargasClienteUf);
  el.baixarNheBtn.addEventListener('click', baixarNheCofcoAmaggi);
  el.gerarImagemRegional.addEventListener('click', () => gerarImagemRegional(el.regionalFob.value));
  el.gerarZipRegionais.addEventListener('click', gerarZipTodasRegionais);
  content.addEventListener('click', onClick);
  content.addEventListener('change', onChange);

  // Declaradas aqui (e não junto das funções lá embaixo) porque loadOsLog()/
  // loadAberturaOs() são chamadas logo abaixo, ainda dentro deste boot -- um
  // `let` declarado só perto da função ficava em temporal dead zone nesse
  // ponto da execução e lançava "Cannot access before initialization".
  let osLogInflight = null;
  let aberturaOsInflight = null;

  const hash = normalize(location.hash.replace('#', ''));
  if (hash.includes('ABERTURA')) state.tab = 'abertura_os';
  else if (hash.includes('AJUSTE')) state.tab = 'ajuste';
  else if (hash.includes('CLASSIFIC')) state.tab = 'classificadores';
  else if (hash.includes('CONFER')) state.tab = 'conferencias';
  else if (hash.includes('EXPORT')) state.tab = 'exportacoes';
  else if (hash.includes('FINALIZACAO') || hash.includes('FINALIZ')) state.tab = 'finalizacao';
  else if (hash.includes('FOB')) state.tab = 'fob';
  else state.tab = 'os';
  if (window.location.hash === '#relatorios') state.tab = 'relatorios';
  renderTabs();
  loadOsLog();
  loadAberturaOs();
  await loadAll();

  async function loadAll() {
    el.feedback.textContent = 'Carregando dados da logística...';
    // relatorio_resultado_diario (44MB) NÃO entra na carga inicial — é puxada
    // sob demanda por loadProducao() só nas abas administrativas que a usam.
    const [osRes, alertRes] = await Promise.all([
      supabase.from('operacional_os').select('*').limit(5000),
      supabase.from('logistica_alertas').select('*').order('created_at', { ascending: false }).limit(1000),
    ]);

    if (osRes.error) {
      console.error(osRes.error);
      el.feedback.textContent = `${osRes.error.message}. Confira se a tabela operacional_os existe e se o SQL da logística foi executado.`;
      return;
    }

    state.os = safeArray(osRes.data).sort((a, b) => String(dateKey(b.data_os || b.data)).localeCompare(String(dateKey(a.data_os || a.data))) || String(osNumber(a)).localeCompare(String(osNumber(b)), 'pt-BR'));
    state.alertas = alertRes.error ? [] : safeArray(alertRes.data);

    if (alertRes.error) console.warn('logistica_alertas indisponível:', alertRes.error);

    const ids = state.os.map((row) => row.id).filter(Boolean);
    if (ids.length) {
      // Em lotes: com milhares de O.S. carregadas, um .in() só com todos os ids
      // vira uma URL GET grande demais e o Supabase responde 400.
      const atribuicoes = [];
      for (let i = 0; i < ids.length; i += 300) {
        const chunk = ids.slice(i, i + 300);
        const atr = await supabase.from('operacional_os_colaboradores').select('*').in('os_id', chunk);
        if (atr.error) { console.warn('Falha ao carregar colaboradores da O.S.', atr.error); continue; }
        atribuicoes.push(...safeArray(atr.data));
      }
      state.atribuicoes = atribuicoes;
    } else {
      state.atribuicoes = [];
    }

    fillCoords();
    render();
    el.feedback.textContent = `Carregado: ${state.os.length} O.S. · ${state.alertas.length} alertas.`;
  }

  // Carrega produção sob demanda (tabela grande, só usada em abas administrativas).
  async function loadProducao() {
    if (state.producaoLoaded) return;
    state.producaoLoaded = true;
    const prodRes = await supabase.from('relatorio_resultado_diario')
      .select('*').order('data', { ascending: false }).limit(5000);
    if (prodRes.error) {
      state.producaoLoaded = false;
      console.warn('relatorio_resultado_diario indisponível para exportações/conferências:', prodRes.error);
      return;
    }
    state.producao = safeArray(prodRes.data);
    render();
  }

  // Baixar Cargas por Cliente + UF (equivalente a Cargas.js/ModalUF.html). grm_cargas_importacoes
  // não tem UF nativa (nem a fonte do GRM expõe isso) -- resolvemos via metas_producao, que já
  // mantém o par estado/regional e cujo "regional" bate com a "coordenacao" das cargas.
  async function loadUfsCargas() {
    if (state.ufsCargasLoaded) return;
    state.ufsCargasLoaded = true;
    const { data, error } = await supabase.from('metas_producao').select('estado,regional');
    if (error) {
      state.ufsCargasLoaded = false;
      console.warn('metas_producao indisponível para Baixar Cargas por UF:', error);
      return;
    }
    state.mapaRegionalUf = safeArray(data);
    const ufs = [...new Set(state.mapaRegionalUf.map((r) => String(r.estado || '').toUpperCase()).filter(Boolean))].sort();
    if (el.ufCargas) el.ufCargas.innerHTML = '<option value="">Selecione</option>' + ufs.map((uf) => `<option value="${esc(uf)}">${esc(uf)}</option>`).join('');
  }

  async function baixarCargasClienteUf() {
    const cliente = (el.clienteExportacao.value || state.filters.clienteExportacao || '').trim();
    const uf = el.ufCargas.value;
    const feedback = el.baixarCargasFeedback;
    feedback.style.display = 'block';
    if (!cliente) { feedback.textContent = 'Selecione um cliente no campo acima.'; return; }
    if (!uf) { feedback.textContent = 'Selecione uma UF.'; return; }

    const regionais = new Set(state.mapaRegionalUf.filter((r) => String(r.estado || '').toUpperCase() === uf).map((r) => normalize(r.regional)));
    if (!regionais.size) { feedback.textContent = `Nenhuma regional cadastrada em Metas > Produção para UF ${uf}.`; return; }

    el.baixarCargasBtn.disabled = true;
    feedback.textContent = 'Buscando cargas...';
    try {
      const nCliente = normalize(cliente);
      const { data, error } = await supabase
        .from('grm_cargas_importacoes')
        .select('os,cliente,coordenacao,supervisao,colaborador,placa,laudo,nota_fiscal,dados_json,data_classificacao')
        .ilike('cliente', `%${cliente}%`)
        .limit(20000);
      if (error) throw error;

      const linhas = safeArray(data).filter((row) => {
        if (!normalize(row.cliente).includes(nCliente)) return false;
        return regionais.has(normalize(row.coordenacao)) || regionais.has(normalize(row.supervisao));
      });

      if (!linhas.length) {
        feedback.textContent = `Nenhuma carga encontrada para "${cliente}" na UF ${uf}.`;
        return;
      }

      // Campos vindos de dados_json (a base sincronizada não tem Origem/Destino como o
      // script antigo tinha na aba "Dados Cargas" -- só o que o GRM realmente expõe hoje).
      const linhasXlsx = linhas.map((row) => {
        const j = row.dados_json || {};
        return {
          Cliente: row.cliente || j['Cliente'] || '-',
          'O.S.': row.os || j['O.S.'] || '-',
          Contrato: j['Contrato'] || '-',
          Laudo: row.laudo || j['Laudo'] || '-',
          Tons: j['Tons'] || '-',
          Produto: j['Produto'] || '-',
          Data: row.data_classificacao || j['Data'] || '-',
          Placa: row.placa || j['Placa'] || '-',
          'Nota Fiscal': row.nota_fiscal || j['Nota Fiscal'] || '-',
          Coordenacao: row.coordenacao || '-',
          Supervisao: row.supervisao || '-',
          Classificador: j['Classificador'] || row.colaborador || '-',
          Situacao: j['Situação'] || '-',
        };
      });

      const ws = XLSX.utils.json_to_sheet(linhasXlsx);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Cargas');
      XLSX.writeFile(wb, `Cargas_${cliente.replace(/[^a-zA-Z0-9]+/g, '_')}_${uf}.xlsx`);
      feedback.textContent = `${linhas.length} carga(s) exportada(s) para ${cliente} / ${uf}.`;
    } catch (error) {
      console.error('[Baixar Cargas]', error);
      feedback.textContent = error?.message || 'Erro ao gerar o XLSX de cargas.';
    } finally {
      el.baixarCargasBtn.disabled = false;
    }
  }

  // NHE -> COFCO/AMAGGI (equivalente a NHE.js). O script antigo processava a
  // aba NHE inteira sem filtrar por data/serviço; aqui restringe a hoje pra
  // não puxar as dezenas de milhares de linhas históricas de grm_nhe_importacoes.
  const HEADER_NHE_CLIENTE = ['OS', 'Data', 'Embarque', 'Cidade de Destino', 'Destino', 'Classificador', 'Motivo', 'Obs', 'Lote'];

  async function buscarNheHoje() {
    const hoje = hojeBr();
    const { data, error } = await supabase
      .from('grm_nhe_importacoes')
      .select('dados_json')
      .eq('dados_json->>Data', hoje)
      .limit(20000);
    if (error) throw error;
    return (data || []).map((row) => row.dados_json || {});
  }

  function montarNheClienteLinhas(rows, filtroFn) {
    return rows.filter(filtroFn).map((r) => [r['O.S.'], r.Data, r.Embarque, r['Cidade de Destino'], r.Destino, r.Classificador, r.Motivo, r.Obs, r.Lote]);
  }

  async function baixarNheCofcoAmaggi() {
    const feedback = document.getElementById('logBaixarNheFeedback');
    feedback.style.display = 'block';
    feedback.textContent = 'Buscando NHE de hoje...';
    el.baixarNheBtn.disabled = true;
    try {
      const rows = await buscarNheHoje();
      const linhasCofco = montarNheClienteLinhas(rows, (r) => {
        const cliente = normText(r.Cliente);
        const sup = normText(r['Supervisão']);
        return cliente.includes('COFCO') && (sup.startsWith('MATO GROSSO MT1') || sup.startsWith('MATO GROSSO MT4'));
      });
      const linhasAmaggi = montarNheClienteLinhas(rows, (r) => {
        const cliente = normText(r.Cliente);
        const sup = normText(r['Supervisão']);
        return cliente.includes('AMAGGI') && sup.startsWith('RIO GRANDE DO SUL');
      });
      if (!linhasCofco.length && !linhasAmaggi.length) {
        feedback.textContent = 'Nenhuma linha de NHE hoje bateu com as regras de COFCO ou AMAGGI.';
        return;
      }
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([HEADER_NHE_CLIENTE, ...linhasCofco]), 'COFCO');
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([HEADER_NHE_CLIENTE, ...linhasAmaggi]), 'AMAGGI');
      XLSX.writeFile(wb, `NHE_COFCO_AMAGGI_${new Date().toISOString().slice(0, 10)}.xlsx`);
      feedback.textContent = `COFCO: ${linhasCofco.length} linha(s) · AMAGGI: ${linhasAmaggi.length} linha(s).`;
    } catch (error) {
      console.error('[NHE COFCO/AMAGGI]', error);
      feedback.textContent = error?.message || 'Erro ao gerar o XLSX de NHE.';
    } finally {
      el.baixarNheBtn.disabled = false;
    }
  }

  function fillCoords() {
    const current = el.coord.value;
    const coords = [...new Set(state.os.map(coordOf).filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b), 'pt-BR'));
    el.coord.innerHTML = '<option value="">Todas</option>' + coords.map((c) => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
    if (current) el.coord.value = current;
  }

  function renderTabs() {
    [...el.tabs.querySelectorAll('.log-tab')].forEach((btn) => btn.classList.toggle('active', btn.dataset.tab === state.tab));
    ['os', 'abertura_os', 'ajuste', 'fob', 'finalizacao', 'classificadores', 'conferencias', 'exportacoes', 'relatorios'].forEach((tab) => {
      document.getElementById(`section-${tab}`)?.classList.toggle('active', tab === state.tab);
    });
    const isAdmTab = ['finalizacao', 'classificadores', 'conferencias', 'exportacoes', 'relatorios'].includes(state.tab);
    el.status.closest('.field').style.display = state.tab === 'finalizacao' ? '' : 'none';
    el.atraso.closest('.field').style.display = state.tab === 'classificadores' ? '' : 'none';
    document.querySelector('.filters-grid')?.style.setProperty('display', isAdmTab ? '' : 'none');
    if (state.tab === 'os' && !state.osLogLoaded) loadOsLog();
    if (state.tab === 'ajuste' && !state.osLogLoaded) loadOsLog();
    if (state.tab === 'abertura_os' && !state.aberturaOsLoaded) loadAberturaOs();
    if (state.tab === 'fob' && !state.fobLoaded) loadFob();
    if (state.tab === 'fob' && !state.fobReportAutoLoaded) { state.fobReportAutoLoaded = true; gerarRelatorioFobAutomatico(); }
    if (isAdmTab && !state.producaoLoaded) loadProducao(); // produção sob demanda
    if (state.tab === 'exportacoes' && !state.ufsCargasLoaded) loadUfsCargas();
  }

  function renderStats() {
    const finalizacao = selectedRowsFinalizacao();
    const atrasadas = selectedRowsAtrasadas();
    const pend = finalizacao.filter((r) => statusLog(r) === 'PENDENTE').length;
    const andamento = finalizacao.filter((r) => statusLog(r) === 'EM_ANDAMENTO').length;
    const finalizadas = finalizacao.filter((r) => statusLog(r) === 'FINALIZADA').length;
    const suspensos = state.alertas.filter((a) => normalize(a.tipo) === 'SUSPENSO' && dateKey(a.created_at) === dateKey(new Date().toISOString())).length;
    const solicitacoes = safeArray(state.aberturaOs).filter((r) => String(r.status || 'PENDENTE') === 'PENDENTE').length;
    el.stats.innerHTML = `
      <article class="card log-card-clickable" data-jump-tab="abertura_os" title="Ver solicitações de abertura de O.S."><h3>Solicitações</h3><p class="metric ${solicitacoes ? 'log-kpi-warn' : 'log-kpi-ok'}">${solicitacoes}</p><p class="muted">Gestor pediu abertura de O.S.</p></article>
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
      <div class="los-finalizacao-summary"><strong>${rows.length}</strong><span>aguardando decisão</span></div>
      <div class="log-table-wrap los-finalizacao-table-wrap"><table class="log-table los-finalizacao-table"><thead><tr>
        <th>O.S. / Regional</th><th>Cliente</th><th>Rota</th><th>Volume</th><th>Decisão</th>
      </tr></thead><tbody>
      ${rows.map((row) => {
        return `<tr data-os-id="${esc(row.id)}">
          <td><div class="los-os-line"><strong>${esc(osNumber(row))}</strong><span>${brDate(row.data_os || row.data)}</span></div><div class="log-meta">${esc(coordOf(row))}</div></td>
          <td><div class="log-title los-client">${esc(clienteOf(row))}</div><div class="los-request-tag">Finalizar OS</div></td>
          <td><div class="los-route"><span><b>Origem</b>${esc(origemOf(row))}</span><i>→</i><span><b>Destino</b>${esc(destinoOf(row))}</span></div></td>
          <td><div class="los-volume"><strong>${BR_NUM.format(numberBr(row.remanescente))}</strong><span>remanescente</span></div></td>
          <td><div class="los-decision-actions">${actionButtonsFinalizacao(row)}</div></td>
        </tr>`;
      }).join('')}
      </tbody></table></div>`;
  }

  function actionButtonsFinalizacao(row) {
    return `<button class="los-decision approve" type="button" data-action="aprovar-finalizacao" aria-label="Aprovar finalização" title="Aprovar">✓</button>
      <button class="los-decision reject" type="button" data-action="recusar-finalizacao" aria-label="Recusar finalização" title="Recusar">×</button>`;
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

    renderConferenciasLaudos();
  }

  // O gestor anexa laudo (assets/js/os.js, openLaudoModal) quando o
  // remanescente fica negativo -- grava em operacional_os.observacao_logistica
  // como "LAUDO:url1,url2,...". Sem esta lista, o laudo anexado não aparecia
  // em nenhuma tela para a Logística abrir/conferir. "Ajustado" só limpa
  // observacao_logistica (mesmo padrão do fluxo de KG em #osLogList/oslogOk)
  // -- NÃO usa status_conferencia='AJUSTADA' porque essa coluna já tem outro
  // dono (distribuir-os.js a usa, com status_gestor='ATENDER', pra marcar que
  // o colaborador foi distribuído); uma O.S. com laudo pode estar em ATENDER
  // ao mesmo tempo, e reaproveitar a coluna a faria sumir da fila de
  // distribuição sem ninguém ter distribuído colaborador nenhum.
  function selectedLaudos() {
    return state.os.filter((row) => String(row.observacao_logistica || '').startsWith('LAUDO:'));
  }

  function laudoUrls(row) {
    return String(row.observacao_logistica || '').slice('LAUDO:'.length).split(',').map((s) => s.trim()).filter(Boolean);
  }

  function renderConferenciasLaudos() {
    const list = document.getElementById('logConferenciasLaudos');
    if (!list) return;
    const rows = selectedLaudos();
    if (!rows.length) { list.innerHTML = '<div class="log-empty">Nenhum laudo pendente de conferência.</div>'; return; }
    list.innerHTML = `
      <div class="log-table-wrap"><table class="log-table"><thead><tr>
        <th>O.S.</th><th>Coordenação</th><th>Saldo</th><th>Remanescente</th><th>Ações</th>
      </tr></thead><tbody>
      ${rows.map((row) => `<tr data-os-id="${esc(String(row.id))}">
        <td><div class="log-title">${esc(osNumber(row))}</div><div class="log-meta">${brDate(row.data_os)}</div></td>
        <td><span class="log-badge info">${esc(coordOf(row))}</span></td>
        <td>${BR_NUM.format(numberBr(row.lote))}</td>
        <td><span class="log-badge danger">${BR_NUM.format(numberBr(row.remanescente))}</span></td>
        <td><div class="log-actions">
          <button class="btn btn-secondary" type="button" data-abrir-laudo="${esc(String(row.id))}">Abrir</button>
          <button class="btn btn-primary" type="button" data-ajustar-laudo="${esc(String(row.id))}">Ajustado</button>
        </div></td>
      </tr>`).join('')}
      </tbody></table></div>`;
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

  // Cada renderX() reconstrói a tabela inteira via innerHTML -- caro pra
  // seções com centenas de linhas (Finalização, Classificadores etc.), e como
  // só a .log-section do state.tab atual fica visível (as outras ficam
  // display:none), rodar as 6 sempre era trabalho jogado fora nas 5 ocultas.
  // Isso travava a thread principal por tempo suficiente pra virar um
  // "piscar com fundo preto" perceptível ao trocar de aba (reportado pela
  // usuária, 23/07/2026, na página unificada O.S. — mas o problema já
  // existia em qualquer tela com essas 9 abas). Gate por state.tab: só a aba
  // ativa é re-renderizada a cada clique/filtro, igual ao padrão que já
  // existia pra abertura_os/ajuste/fob.
  function render() {
    renderStats();
    if (state.tab === 'abertura_os') renderAberturaOs();
    if (state.tab === 'ajuste') renderAjuste();
    if (state.tab === 'fob') { renderFob(); renderFobReport(); }
    if (state.tab === 'finalizacao') renderFinalizacao();
    if (state.tab === 'classificadores') renderClassificadores();
    if (state.tab === 'conferencias') renderConferencias();
    if (state.tab === 'exportacoes') renderExportacoes();
    if (state.tab === 'relatorios') renderRelatorios();
  }

  // ── FOB 0 ────────────────────────────────────────────────────────────────

  const ICO_CHECK = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="pointer-events:none"><polyline points="20 6 9 17 4 12"/></svg>`;
  const ICO_X     = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="pointer-events:none"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;

  async function loadFob() {
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

    const pendentes  = state.fob.filter((r) => r.status === 'PENDENTE');
    const historico  = state.fob.filter((r) => r.status !== 'PENDENTE');

    function fobRow(r) {
      const isPendente = r.status === 'PENDENTE';
      const stBadge = isPendente
        ? badge('Pendente', 'warn')
        : r.status === 'VALIDO'
          ? badge('Válido', 'ok')
          : badge('Inválido', 'danger');
      return `<tr data-fob-id="${esc(r.id)}">
        <td><div class="log-title">${brDate(r.data_referencia)}</div><div class="log-meta">${esc(r.supervisao || '-')}</div></td>
        <td><div class="log-title">${esc(r.cliente || '-')}</div><div class="log-meta">OS: ${esc(r.numero_os || '-')}</div></td>
        <td>
          <div class="log-meta">Mov.: <b>${BR_NUM.format(numberBr(r.tons_movimento))}</b></div>
          <div class="log-meta">Prod.: <b>${BR_NUM.format(numberBr(r.tons_producao))}</b></div>
          <div class="log-meta">NH: <b>${BR_NUM.format(numberBr(r.tons_nh))}</b></div>
        </td>
        <td><div class="log-meta" style="max-width:220px">${esc(r.observacao || '-')}</div></td>
        <td>${stBadge}${r.observacao_gestor ? `<div class="log-meta" style="margin-top:4px">${esc(r.observacao_gestor)}</div>` : ''}${!isPendente && r.validado_em ? `<div class="log-meta">${brDate(r.validado_em, true)}</div>` : ''}</td>
        <td>
          ${isPendente ? `
            <textarea class="log-input log-textarea" data-fob-obs-gestor style="min-height:46px;font-size:12px;margin-bottom:6px" placeholder="Observação (opcional)"></textarea>
            <div style="display:flex;gap:8px">
              <button class="btn btn-primary" data-fob-valido="${esc(r.id)}" title="Válido — FOB 0 confirmado" type="button">${ICO_CHECK}</button>
              <button class="btn" style="background:rgba(239,68,68,.18);border-color:rgba(239,68,68,.45);color:#fca5a5" data-fob-invalido="${esc(r.id)}" title="Inválido — houve embarque" type="button">${ICO_X}</button>
            </div>
          ` : '—'}
        </td>
      </tr>`;
    }

    if (!state.fob.length) {
      list.innerHTML = '<div class="log-empty">Nenhum FOB 0 registrado ainda.</div>';
      return;
    }

    list.innerHTML = `
      ${pendentes.length ? `
        <h4 style="color:#fde68a;margin:0 0 10px">Pendentes de validação (${pendentes.length})</h4>
        <div class="log-table-wrap">
          <table class="log-table">
            <thead><tr><th>Data</th><th>Cliente / OS</th><th>Toneladas</th><th>Observação log.</th><th>Status</th><th>Ação gestor</th></tr></thead>
            <tbody>${pendentes.map(fobRow).join('')}</tbody>
          </table>
        </div>
      ` : '<div class="log-empty">Nenhum FOB 0 pendente de validação.</div>'}
      ${historico.length ? `
        <h4 style="margin:24px 0 10px">Histórico validado (${historico.length})</h4>
        <div class="log-table-wrap">
          <table class="log-table">
            <thead><tr><th>Data</th><th>Cliente / OS</th><th>Toneladas</th><th>Observação log.</th><th>Status</th><th></th></tr></thead>
            <tbody>${historico.map(fobRow).join('')}</tbody>
          </table>
        </div>
      ` : ''}
    `;
  }

  async function salvarFob() {
    const dataVal = document.getElementById('fobData')?.value;
    if (!dataVal) { el.feedback.textContent = 'Informe a data do FOB 0.'; return; }
    const btn = document.getElementById('fobSalvar');
    btn.disabled = true; btn.textContent = 'Salvando...';
    const { error } = await supabase.from('logistica_fob').insert({
      data_referencia: dataVal,
      numero_os:   document.getElementById('fobOs')?.value?.trim()    || null,
      supervisao:  document.getElementById('fobSup')?.value?.trim()   || null,
      cliente:     document.getElementById('fobCliente')?.value?.trim() || null,
      tons_movimento: Number(document.getElementById('fobMov')?.value)  || 0,
      tons_producao:  Number(document.getElementById('fobProd')?.value) || 0,
      tons_nh:        Number(document.getElementById('fobNh')?.value)   || 0,
      observacao:  document.getElementById('fobObs')?.value?.trim()   || null,
      status:      'PENDENTE',
      criado_por:  state.user?.id || null,
    });
    btn.disabled = false; btn.textContent = 'Registrar FOB 0';
    if (error) { el.feedback.textContent = error.message; return; }
    ['fobOs','fobSup','fobCliente','fobMov','fobProd','fobNh','fobObs'].forEach((id) => {
      const inp = document.getElementById(id);
      if (inp) inp.value = '';
    });
    el.feedback.textContent = 'FOB 0 registrado. Aguardando validação do gestor.';
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
      updated_at:   now,
    }).eq('id', id);
    if (error) { el.feedback.textContent = error.message; triggerBtn.disabled = false; return; }
    const idx = state.fob.findIndex((r) => String(r.id) === String(id));
    if (idx !== -1) Object.assign(state.fob[idx], { status, observacao_gestor, validado_em: now });
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

  // Núcleo da comparação FOB, usado pela comparação automática baseada nas
  // tabelas sincronizadas pelos agentes.
  // Regra: entra no FOB toda O.S. do mapa com Tons Hoje = 0. Status OK quando há NHE
  // por O.S./data ou Produção com Cargas = NHE; DOIS EMBARQUES quando a mesma combinação
  // Cliente + Cidade + Local + Data aparece 2+ vezes no mapa ou também no NHE; senão PENDENTE.
  function compararFob(movRows, prodRows, nheRows) {
    const setNheOsData = new Set();
    const setNheOsOnly = new Set();
    const setNheCcld = new Set();
    nheRows.forEach((row) => {
      const os = normOs(pickValue(row, ['O.S.', 'OS', 'O.S', 'O S']));
      const data = ymd(pickValue(row, ['Data', 'Última Atualização', 'Ultima Atualizacao']));
      if (os) setNheOsOnly.add(os);
      if (os && data) setNheOsData.add(`${os}|${data}`);
      const cli = pickValue(row, ['Cliente']);
      const cid = pickValue(row, ['Cidade de Embarque', 'Cidade']);
      const loc = pickValue(row, ['Embarque', 'Local', 'Local de Embarque']);
      if (cli && cid && loc && data) setNheCcld.add(`${normText(cli)}|${normText(cid)}|${normText(loc)}|${data}`);
    });

    const setProdNheOsData = new Set();
    const setProdNheOsOnly = new Set();
    prodRows.forEach((row) => {
      const os = normOs(pickValue(row, ['O.S.', 'OS']));
      const data = ymd(pickValue(row, ['Data']));
      const cargas = normText(pickValue(row, ['Cargas']));
      if (!os || cargas !== 'NHE') return;
      setProdNheOsOnly.add(os);
      if (data) setProdNheOsData.add(`${os}|${data}`);
    });

    const movCcldCount = new Map();
    movRows.forEach((row) => {
      const data = ymd(pickValue(row, ['Data', 'Última Atualização', 'Ultima Atualizacao']));
      const cli = pickValue(row, ['Cliente']);
      const cid = pickValue(row, ['Cidade']);
      const loc = pickValue(row, ['Local', 'Local de Embarque']);
      if (!data || !cli || !cid || !loc) return;
      const key = `${normText(cli)}|${normText(cid)}|${normText(loc)}|${data}`;
      movCcldCount.set(key, (movCcldCount.get(key) || 0) + 1);
    });

    const rows = [];
    movRows.forEach((row) => {
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
      const okNhe = setNheOsData.has(keyOsData) || setNheOsOnly.has(os);
      const okProd = setProdNheOsData.has(keyOsData) || setProdNheOsOnly.has(os);
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

    return {
      rows,
      stats: {
        movimento: movRows.length,
        producao: prodRows.length,
        nhe: nheRows.length,
        pendentes: rows.filter((r) => r.status === 'PENDENTE').length,
        ok: rows.filter((r) => r.status === 'OK').length,
        dois: rows.filter((r) => r.status === 'DOIS EMBARQUES').length,
      },
    };
  }

  // Comparação automática: usa as tabelas sincronizadas pelos agentes.
  // Movimentação ("Tons Hoje") vem de grm_mapa_embarque_importacoes (agente sync-mapa-embarque);
  // Produção e NHE vêm das importações do dia filtradas por Serviço = "Classificação FOB".
  function agentRowToHeaderObject(dadosJson) {
    const obj = {};
    Object.keys(dadosJson || {}).forEach((key) => { obj[normHeader(key)] = dadosJson[key]; });
    return obj;
  }

  async function buscarMovimentoAgente(dataRef) {
    const { data, error } = await supabase
      .from('grm_mapa_embarque_importacoes')
      .select('dados_json,created_at')
      .eq('dados_json->>Data', dataRef)
      .order('created_at', { ascending: false })
      .limit(20000);
    if (error) throw error;
    // o agente resincroniza o mapa várias vezes ao dia; mantém só a leitura mais recente por O.S.
    const vistos = new Set();
    const rows = [];
    (data || []).forEach((row) => {
      const os = String(row.dados_json?.OS ?? '').trim();
      if (!os || vistos.has(os)) return;
      vistos.add(os);
      rows.push(agentRowToHeaderObject(row.dados_json));
    });
    return rows;
  }

  async function buscarServicoFobAgente(tabela, dataRef) {
    const { data, error } = await supabase
      .from(tabela)
      .select('dados_json')
      .eq('dados_json->>Serviço', 'Classificação FOB')
      .eq('dados_json->>Data', dataRef)
      .limit(20000);
    if (error) throw error;
    return (data || []).map((row) => agentRowToHeaderObject(row.dados_json));
  }

  // sync-producao-diaria (Puppeteer/XLS -> grm_producao_diaria_importacoes) foi
  // pausado em 01/09, substituído por grmserver-producao-diaria-api-realtime.js,
  // que grava só em producao_snapshot (mesmo fix já aplicado em
  // logistica-fob-page-v9.js/PR #342 e grm-sync-lancar-nhe.js). Sem isso, a
  // comparação automática de FOB desta tela ficaria presa na foto de 31/08.
  // producao_snapshot tem colunas próprias (não dados_json) e "Cargas" agora é
  // numérico (countLoads da API), não mais o texto "NHE" — compararFob só usa
  // esse campo pra procurar cargas === 'NHE', então o sinal fica sempre vazio
  // (mesmo achado do v9: não tira nenhuma O.S. do escopo, setNheOsOnly via
  // grm_nhe_importacoes continua sendo a fonte de verdade real).
  async function buscarProducaoSnapshotFobAgente(dataRef) {
    const dataIso = ymd(dataRef);
    const { data, error } = await supabase
      .from('producao_snapshot')
      .select('os,cargas')
      .eq('servico', 'Classificação FOB')
      .eq('data', dataIso)
      .limit(20000);
    if (error) throw error;
    return (data || []).map((row) => agentRowToHeaderObject({ 'O.S.': row.os, Cargas: row.cargas }));
  }

  function hojeBr() {
    const d = new Date();
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
  }

  // Fechamento diário: assim como a planilha (Apps Script) é fechada no fim do dia,
  // a comparação automática deve olhar para ONTEM (dia já fechado pelos agentes),
  // nunca para hoje — hoje ainda está sendo sincronizado e sempre traria poucas linhas.
  function ontemBr() {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
  }

  async function gerarRelatorioFobAutomatico() {
    try {
      const dataRef = ontemBr();
      const [movRows, prodRows, nheRows] = await Promise.all([
        buscarMovimentoAgente(dataRef),
        buscarProducaoSnapshotFobAgente(dataRef),
        buscarServicoFobAgente('grm_nhe_importacoes', dataRef),
      ]);

      const { rows, stats } = compararFob(movRows, prodRows, nheRows);

      state.fobReportRows = rows;
      state.fobReportStats = {
        ...stats,
        dataRef,
        abaMovimento: 'Distribuição de O.S. (sincronizado pelo agente)',
        abaProducao: 'Produção Diária (sincronizado pelo agente)',
        abaNhe: 'NHE (sincronizado pelo agente)',
        fonte: 'agente',
      };
      renderFobReport();
      el.feedback.textContent = `Comparação FOB automática (${dataRef}): ${rows.length} linha(s), ${state.fobReportStats.pendentes} pendente(s).`;
    } catch (error) {
      console.error('[FOB automático]', error);
      el.feedback.textContent = `Falha ao gerar comparação automática do FOB: ${error.message || 'erro desconhecido'}. Use o reprocessamento manual.`;
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
    if (btnSave) btnSave.disabled = !rows.some((r) => r.status === 'PENDENTE');
    if (!rows.length) {
      box.innerHTML = `<div class="log-empty">Comparação automática de ${esc(stats?.dataRef || '-')} não encontrou nenhuma O.S. com Tons Hoje = 0 na base sincronizada pelos agentes.</div>`;
      return;
    }
    const preview = rows.slice(0, 250);
    box.innerHTML = `
      <section class="card">
        <div class="section-head">
          <div>
            <h3>Resultado da comparação FOB — ${esc(stats?.dataRef || '-')}</h3>
            <p class="muted">Fonte: <b>automática (agentes)</b> · Mov./Mapa <b>${esc(stats?.abaMovimento || '-')}</b> · Produção <b>${esc(stats?.abaProducao || '-')}</b> · NHE <b>${esc(stats?.abaNhe || '-')}</b></p>
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
        ${rows.length > preview.length ? `<div class="log-note">Prévia limitada a ${preview.length} linhas no painel. Use Exportar CSV para o relatório completo.</div>` : ''}
      </section>`;
    atualizarSelectRegionalFob();
  }

  // Imagem por Regional (equivalente a Regional.js/RegionalSelector.html). "Regional" é o
  // texto antes do "-" na Supervisão, igual ao script antigo; sem "-" usa o texto inteiro.
  function regionalDe(supervisao) {
    const s = String(supervisao || '').trim();
    if (!s) return 'SEM REGIONAL';
    const idx = s.indexOf('-');
    return (idx > 0 ? s.slice(0, idx) : s).trim().toUpperCase();
  }

  function atualizarSelectRegionalFob() {
    if (!el.regionalFob) return;
    const atual = el.regionalFob.value;
    const regionais = [...new Set((state.fobReportRows || []).map((r) => regionalDe(r.supervisao)))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    el.regionalFob.innerHTML = '<option value="">Selecione</option>' + regionais.map((r) => `<option value="${esc(r)}">${esc(r)}</option>`).join('');
    if (regionais.includes(atual)) el.regionalFob.value = atual;
  }

  async function ensureExportLibLocal(url, globalName) {
    if (window[globalName]) return;
    await new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = url;
      script.async = true;
      script.onload = resolve;
      script.onerror = () => reject(new Error(`Não foi possível carregar ${globalName}.`));
      document.head.appendChild(script);
    });
  }

  function buildRegionalTableNode(regional, rows) {
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;left:-99999px;top:0;background:#fff;padding:24px;font-family:Arial,sans-serif;width:1000px;color:#111';
    const statusColor = (status) => status === 'OK' ? '#16a34a' : status === 'DOIS EMBARQUES' ? '#ca8a04' : '#dc2626';
    host.innerHTML = `
      <h2 style="margin:0 0 4px">FOB — ${esc(regional)}</h2>
      <p style="margin:0 0 16px;color:#555">${new Date().toLocaleString('pt-BR')} · ${rows.length} O.S.</p>
      <table style="border-collapse:collapse;width:100%;font-size:13px">
        <thead><tr>${['DATA', 'OS', 'SUPERVISÃO', 'FUNCIONÁRIO', 'STATUS', 'OBS'].map((h) => `<th style="border:1px solid #ccc;padding:6px;background:#f1f5f9;text-align:left">${h}</th>`).join('')}</tr></thead>
        <tbody>${rows.map((r) => `<tr>
          <td style="border:1px solid #ddd;padding:6px">${esc(r.data_br)}</td>
          <td style="border:1px solid #ddd;padding:6px">${esc(r.os)}</td>
          <td style="border:1px solid #ddd;padding:6px">${esc(r.supervisao || '-')}</td>
          <td style="border:1px solid #ddd;padding:6px">${esc(r.funcionario || '-')}</td>
          <td style="border:1px solid #ddd;padding:6px;font-weight:700;color:${statusColor(r.status)}">${esc(r.status)}</td>
          <td style="border:1px solid #ddd;padding:6px">${esc(r.observacao || '')}</td>
        </tr>`).join('')}</tbody>
      </table>`;
    document.body.appendChild(host);
    return host;
  }

  async function domToPngRegional(node) {
    const canvas = await window.html2canvas(node, { scale: 2, backgroundColor: '#ffffff' });
    return canvas.toDataURL('image/png');
  }

  function baixarUrl(url, filename) {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  async function gerarImagemRegional(regional) {
    if (!regional) { el.regionalFeedback.style.display = 'block'; el.regionalFeedback.textContent = 'Selecione uma regional.'; return; }
    const rows = (state.fobReportRows || []).filter((r) => regionalDe(r.supervisao) === regional);
    if (!rows.length) { el.regionalFeedback.style.display = 'block'; el.regionalFeedback.textContent = 'Nenhuma linha para essa regional.'; return; }
    el.gerarImagemRegional.disabled = true;
    el.regionalFeedback.style.display = 'block';
    el.regionalFeedback.textContent = 'Gerando imagem...';
    let node;
    try {
      await ensureExportLibLocal('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js', 'html2canvas');
      node = buildRegionalTableNode(regional, rows);
      const dataUrl = await domToPngRegional(node);
      baixarUrl(dataUrl, `FOB_${regional.replace(/[^a-zA-Z0-9]+/g, '_')}.png`);
      el.regionalFeedback.textContent = `Imagem gerada: ${rows.length} O.S.`;
    } catch (error) {
      console.error('[Imagem Regional]', error);
      el.regionalFeedback.textContent = error?.message || 'Erro ao gerar imagem.';
    } finally {
      node?.remove();
      el.gerarImagemRegional.disabled = false;
    }
  }

  async function gerarZipTodasRegionais() {
    const rows = state.fobReportRows || [];
    if (!rows.length) { el.regionalFeedback.style.display = 'block'; el.regionalFeedback.textContent = 'Gere o relatório FOB antes.'; return; }
    el.gerarZipRegionais.disabled = true;
    el.regionalFeedback.style.display = 'block';
    el.regionalFeedback.textContent = 'Gerando ZIP...';
    const nodes = [];
    try {
      await ensureExportLibLocal('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js', 'html2canvas');
      await ensureExportLibLocal('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js', 'JSZip');
      const grupos = new Map();
      rows.forEach((r) => {
        const reg = regionalDe(r.supervisao);
        if (!grupos.has(reg)) grupos.set(reg, []);
        grupos.get(reg).push(r);
      });
      const zip = new window.JSZip();
      for (const [regional, regRows] of grupos) {
        const node = buildRegionalTableNode(regional, regRows);
        nodes.push(node);
        const dataUrl = await domToPngRegional(node);
        zip.file(`FOB_${regional.replace(/[^a-zA-Z0-9]+/g, '_')}.png`, dataUrl.split(',')[1], { base64: true });
      }
      const blob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(blob);
      baixarUrl(url, `FOB_regionais_${new Date().toISOString().slice(0, 10)}.zip`);
      URL.revokeObjectURL(url);
      el.regionalFeedback.textContent = `ZIP gerado com ${grupos.size} regional(is).`;
    } catch (error) {
      console.error('[ZIP Regionais]', error);
      el.regionalFeedback.textContent = error?.message || 'Erro ao gerar ZIP.';
    } finally {
      nodes.forEach((n) => n.remove());
      el.gerarZipRegionais.disabled = false;
    }
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

  async function salvarPendentesFobImportado() {
    const jaSalvos = new Set((state.fob || []).map((r) => `${r.numero_os || ''}|${String(r.data_referencia || '').slice(0, 10)}`));
    const pendentes = (state.fobReportRows || [])
      .filter((r) => r.status === 'PENDENTE')
      .filter((r) => !jaSalvos.has(`${r.os || ''}|${r.data}`));
    if (!pendentes.length) { el.feedback.textContent = 'Nenhuma pendência nova para salvar (as já existentes não são duplicadas).'; return; }
    const btn = document.getElementById('fobSalvarPendentes');
    if (btn) { btn.disabled = true; btn.textContent = 'Salvando...'; }
    try {
      const payload = pendentes.map((r) => ({
        data_referencia: r.data,
        numero_os: r.os || null,
        supervisao: r.supervisao || null,
        cliente: r.cliente || null,
        tons_movimento: r.tons_movimento || 0,
        tons_producao: 0,
        tons_nh: 0,
        observacao: [r.observacao, `Gerado por comparação automática (agentes). Local: ${r.cidade || '-'} / ${r.local || '-'}`].filter(Boolean).join(' | '),
        status: 'PENDENTE',
        criado_por: state.user?.id || null,
      }));
      let saved = 0;
      for (let i = 0; i < payload.length; i += 300) {
        const chunk = payload.slice(i, i + 300);
        const { error } = await supabase.from('logistica_fob').insert(chunk);
        if (error) throw error;
        saved += chunk.length;
      }
      el.feedback.textContent = `${saved} pendência(s) FOB salvas no painel.`;
      state.fobLoaded = false;
      await loadFob();
    } catch (error) {
      console.error('[FOB salvar pendentes]', error);
      el.feedback.textContent = `Falha ao salvar pendências: ${error.message || 'erro desconhecido'}`;
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Salvar pendentes no painel'; }
    }
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

  function relatorioRowsForCliente(payload) {
    const clienteFiltro = normalize(payload.cliente);
    const ini = payload.data_inicial;
    const fim = payload.data_final;
    return state.producao.filter((row) => {
      const d = dateKey(row.data || row.data_os);
      if (ini && d < ini) return false;
      if (fim && d > fim) return false;
      if (clienteFiltro && !normalize(clienteOf(row)).includes(clienteFiltro)) return false;
      return true;
    });
  }

  function relatorioRowsPreview(payload) {
    return relatorioRowsForCliente(payload).slice(0, 80);
  }

  // ── Imagem do relatório por cliente (pra WhatsApp) ──────────────────────
  // Réplica de LDC-COFCO.js/Sipal.js/OuroSafra.js/agricola_alvorada.js (script
  // antigo). LDC/COFCO/Sipal/Ouro Safra vêm de grm_mapa_embarque_importacoes,
  // que é o equivalente vivo da antiga aba "Movimentação_hoje" (tem UF, Cidade,
  // Lote, Aguardando, Carregando -- relatorio_resultado_diario NÃO tem esses
  // campos, só serve pra Agrícola Alvorada, que no script original já lia de
  // "Resultado_diario" mesmo). Cada cliente gera 1+ imagens (buckets por
  // regional/UF), viram ZIP quando é mais de uma.
  const CONTRATOS_IGNORADOS_LDC_COFCO = ['VAGOES', 'RECEBIMENTO', 'CIF'];

  function detectarRegraCliente(cliente) {
    const c = normalize(cliente);
    if (c.includes('LDC') || c.includes('LOUIS DREYFUS')) return 'LDC';
    if (c.includes('COFCO')) return 'COFCO';
    if (c.includes('SIPAL') || c.includes('USIMAT')) return 'SIPAL_USIMAT';
    if (c.includes('OURO SAFRA')) return 'OURO_SAFRA';
    if (c.includes('AGRICOLA ALVORADA')) return 'AGRICOLA_ALVORADA';
    return 'GENERICO';
  }

  // Regional exato de LDC-COFCO.js (mapRegional + ajustes manuais por O.S.).
  function mapRegionalLdc(uf, supervisao, os) {
    const osNorm = normOs(os);
    if (osNorm === '81020') return 'PR';
    if (osNorm === '80110') return 'MT_SUL';
    const sSup = normText(supervisao);
    const sUf = normText(uf);
    if (sSup.includes('MATO GROSSO MT3')) return 'MT3';
    if (sSup.includes('MATO GROSSO MT2')) return 'MT2';
    if (sUf === 'MG' || sUf === 'GO') return 'GO/MG';
    if (['PR', 'SP', 'RS'].includes(sUf)) return sUf;
    if (sSup.includes('MATO GROSSO MT4')) return 'MT4';
    return 'OUTROS';
  }

  const CABECALHO_BUCKET_REGIONAL = ['Data', 'OS', 'Contrato', 'Localização', 'Remanescente', 'Aguardando', 'Carregando', 'Carregado', 'Última Atualização', 'Observações'];

  // Agrupa por Local+Contrato dentro de cada bucket regional (LDC/COFCO),
  // igual unificarBucketImagem_ do script antigo. "Carregado" vem de Cargas Hoje.
  function montarBucketsPorRegional(linhasCliente, prefixo, regionalFn, nomesRegionais) {
    const grupos = new Map(); // nomeBucket -> Map(local|contrato -> registro)

    function addLinha(nomeBucket, row) {
      if (!grupos.has(nomeBucket)) grupos.set(nomeBucket, new Map());
      const mapaBucket = grupos.get(nomeBucket);
      const local = String(pickValue(row, ['Local']) || '').trim();
      const cidade = String(pickValue(row, ['Cidade']) || '').trim();
      const uf = String(pickValue(row, ['UF']) || '').trim();
      const contrato = String(pickValue(row, ['Contrato']) || '');
      const chave = `${normText(local)}|${normText(contrato)}`;
      const remanescente = toNumberLoose(pickValue(row, ['Remanescente']));
      const aguardando = toNumberLoose(pickValue(row, ['Aguardando']));
      const carregando = toNumberLoose(pickValue(row, ['Carregando']));
      const cargasHoje = toNumberLoose(pickValue(row, ['Cargas Hoje']));
      const obs = String(pickValue(row, ['Observacoes']) || '').trim();
      if (!mapaBucket.has(chave)) {
        mapaBucket.set(chave, {
          data: pickValue(row, ['Data']), os: pickValue(row, ['OS']), contrato,
          localizacao: `${local}/${cidade}/${uf}`,
          remanescente, aguardando, carregando, cargasHoje,
          ultimaAtualizacao: pickValue(row, ['Ultima Atualizacao']),
          obsSet: obs ? new Set([obs]) : new Set(),
        });
      } else {
        const g = mapaBucket.get(chave);
        g.remanescente += remanescente;
        g.aguardando += aguardando;
        g.carregando += carregando;
        g.cargasHoje += cargasHoje;
        if (obs) g.obsSet.add(obs);
        g.ultimaAtualizacao = pickValue(row, ['Ultima Atualizacao']) || g.ultimaAtualizacao;
      }
    }

    linhasCliente.forEach((row) => {
      addLinha(`${prefixo}_Geral`, row);
      const reg = regionalFn(row);
      if (nomesRegionais.includes(reg)) addLinha(`${prefixo}_${reg.replace('/', '_')}`, row);
    });

    const buckets = [];
    grupos.forEach((mapaBucket, nomeBucket) => {
      if (!mapaBucket.size) return;
      const linhas = [...mapaBucket.values()]
        .sort((a, b) => a.localizacao.localeCompare(b.localizacao, 'pt-BR'))
        .map((g) => ({
          destaque: g.aguardando === 0 && g.carregando === 0 && g.cargasHoje === 0,
          valores: [String(g.data || ''), g.os, g.contrato, g.localizacao, BR_NUM.format(g.remanescente), BR_INT.format(g.aguardando), BR_INT.format(g.carregando), BR_INT.format(g.cargasHoje), String(g.ultimaAtualizacao || ''), Array.from(g.obsSet).join(' | ')],
        }));
      buckets.push({ nome: nomeBucket, titulo: nomeBucket.replace(/_/g, ' '), header: CABECALHO_BUCKET_REGIONAL, linhas });
    });
    return buckets;
  }

  function montarBucketsLdc(rows) {
    const linhasCliente = rows.filter((r) => {
      const cli = normText(pickValue(r, ['Cliente']));
      const contrato = normText(pickValue(r, ['Contrato']));
      return cli.includes('LOUIS DREYFUS COMPANY BRASIL') && !CONTRATOS_IGNORADOS_LDC_COFCO.some((c) => contrato.includes(c));
    });
    return montarBucketsPorRegional(linhasCliente, 'LDC', (r) => mapRegionalLdc(pickValue(r, ['UF']), pickValue(r, ['Supervisao']), pickValue(r, ['OS'])), ['MT2', 'MT3', 'GO/MG', 'PR', 'SP', 'RS', 'MT4', 'MT_SUL']);
  }

  function montarBucketsCofco(rows) {
    const linhasCliente = rows.filter((r) => {
      const cli = normText(pickValue(r, ['Cliente']));
      const contrato = normText(pickValue(r, ['Contrato']));
      return cli.includes('COFCO INTERNATIONAL') && !CONTRATOS_IGNORADOS_LDC_COFCO.some((c) => contrato.includes(c));
    });
    return montarBucketsPorRegional(linhasCliente, 'COFCO', (r) => normText(pickValue(r, ['UF'])), ['MT', 'PR', 'RS']);
  }

  // Agrupa por Cliente+Local (Sipal/Usimat MT e Ouro Safra por UF) -- mesma
  // lógica de pegarDadosPorClientesUF_/pegarDadosOuroSafra_PorUF_ do script antigo.
  function montarBucketClienteLocal(linhas, nomeBucket, titulo) {
    const mapa = new Map();
    linhas.forEach((row) => {
      const cliente = normText(pickValue(row, ['Cliente']));
      const local = String(pickValue(row, ['Local']) || '').trim();
      const chave = `${cliente}|${normText(local)}`;
      const remanescente = toNumberLoose(pickValue(row, ['Remanescente']));
      const aguardando = toNumberLoose(pickValue(row, ['Aguardando']));
      const carregando = toNumberLoose(pickValue(row, ['Carregando']));
      const cargasHoje = toNumberLoose(pickValue(row, ['Cargas Hoje']));
      const obs = String(pickValue(row, ['Observacoes']) || '').trim();
      if (!mapa.has(chave)) {
        mapa.set(chave, { os: pickValue(row, ['OS']), local, remanescente, aguardando, carregando, cargasHoje, ultimaAtualizacao: pickValue(row, ['Ultima Atualizacao']), obsSet: obs ? new Set([obs]) : new Set() });
      } else {
        const g = mapa.get(chave);
        g.remanescente += remanescente;
        g.aguardando += aguardando;
        g.carregando += carregando;
        g.cargasHoje += cargasHoje;
        if (obs) g.obsSet.add(obs);
        g.ultimaAtualizacao = pickValue(row, ['Ultima Atualizacao']) || g.ultimaAtualizacao;
      }
    });
    if (!mapa.size) return null;
    const linhasOut = [...mapa.values()]
      .sort((a, b) => a.local.localeCompare(b.local, 'pt-BR'))
      .map((g) => ({ destaque: false, valores: [g.os, g.local, BR_NUM.format(g.remanescente), BR_INT.format(g.aguardando), BR_INT.format(g.carregando), BR_INT.format(g.cargasHoje), String(g.ultimaAtualizacao || ''), Array.from(g.obsSet).join(' | ')] }));
    return { nome: nomeBucket, titulo, header: ['OS', 'Local', 'Remanescente', 'Aguardando', 'Carregando', 'Cargas Hoje', 'Última Atualização', 'Observações'], linhas: linhasOut };
  }

  function montarBucketsSipalUsimat(rows) {
    const linhas = rows.filter((r) => {
      const cli = normText(pickValue(r, ['Cliente']));
      const uf = normText(pickValue(r, ['UF']));
      return (cli.includes('SIPAL') || cli.includes('USIMAT')) && uf === 'MT';
    });
    const b = montarBucketClienteLocal(linhas, 'SIPAL_USIMAT_MT', 'SIPAL/USIMAT — MT');
    return b ? [b] : [];
  }

  function montarBucketsOuroSafra(rows) {
    const linhasCliente = rows.filter((r) => normText(pickValue(r, ['Cliente'])).includes('OURO SAFRA'));
    const buckets = [];
    ['BA', 'PR', 'SP', 'RS'].forEach((uf) => {
      const linhasUf = linhasCliente.filter((r) => normText(pickValue(r, ['UF'])) === uf);
      const b = montarBucketClienteLocal(linhasUf, `OURO_SAFRA_${uf}`, `Ouro Safra — ${uf}`);
      if (b) buckets.push(b);
    });
    return buckets;
  }

  // Agrícola Alvorada e o fallback genérico continuam vindo de
  // relatorio_resultado_diario -- é a fonte certa pra eles (o script antigo já
  // lia Agrícola Alvorada de "Resultado_diario", não de "Movimentação_hoje").
  function montarSheetAgricolaAlvorada(rows) {
    return {
      header: ['Cliente', 'O.S.', 'Data', 'Local Embarque', 'Destino', 'Responsável', 'Carregado', 'Tons Carreg.', 'Saldo'],
      linhas: rows.map((r) => ({ destaque: false, valores: [clienteOf(r), r.os || '-', brDate(r.data), r.local_embarque || '-', r.destino || '-', r.funcionario || '-', BR_NUM.format(numberBr(r.embarcado)), BR_NUM.format(numberBr(r.toneladas)), BR_NUM.format(numberBr(r.remanescente))] })),
    };
  }

  function montarSheetGenerico(rows) {
    const grupos = new Map();
    rows.forEach((row) => {
      const key = [normalize(clienteOf(row)), normalize(row.local_embarque), normalize(row.destino), normalize(row.produto)].join('|');
      if (!grupos.has(key)) grupos.set(key, { cliente: clienteOf(row), origem: row.local_embarque || '-', destino: row.destino || '-', produto: row.produto || '-', cargas: 0, toneladas: 0, embarcado: 0, remanescente: 0 });
      const g = grupos.get(key);
      g.cargas += numberBr(row.cargas);
      g.toneladas += numberBr(row.toneladas);
      g.embarcado += numberBr(row.embarcado);
      g.remanescente += numberBr(row.remanescente);
    });
    return {
      header: ['Cliente', 'Origem', 'Destino', 'Produto', 'Cargas', 'Toneladas', 'Embarcado', 'Remanescente'],
      linhas: [...grupos.values()].sort((a, b) => String(a.cliente).localeCompare(String(b.cliente), 'pt-BR'))
        .map((g) => ({ destaque: false, valores: [g.cliente, g.origem, g.destino, g.produto, BR_INT.format(g.cargas), BR_NUM.format(g.toneladas), BR_NUM.format(g.embarcado), BR_NUM.format(g.remanescente)] })),
    };
  }

  function buildRelatorioImagemNode(cliente, bucket) {
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;left:-99999px;top:0;background:#fff;padding:24px;font-family:Arial,sans-serif;width:1100px;color:#111';
    host.innerHTML = `
      <h2 style="margin:0 0 4px">${esc(cliente)} — ${esc(bucket.titulo)}</h2>
      <p style="margin:0 0 16px;color:#555">${new Date().toLocaleString('pt-BR')} · ${bucket.linhas.length} linha(s)</p>
      <table style="border-collapse:collapse;width:100%;font-size:13px">
        <thead><tr>${bucket.header.map((h) => `<th style="border:1px solid #ccc;padding:6px;background:#f1f5f9;text-align:left">${esc(h)}</th>`).join('')}</tr></thead>
        <tbody>${bucket.linhas.map((l) => `<tr style="background:${l.destaque ? '#F8C8DC' : '#fff'}">${l.valores.map((v) => `<td style="border:1px solid #ddd;padding:6px">${esc(v)}</td>`).join('')}</tr>`).join('')}</tbody>
      </table>`;
    document.body.appendChild(host);
    return host;
  }

  async function gerarImagemRelatorioCliente() {
    const payload = getRelatorioPayload();
    if (!payload.cliente) { el.feedback.textContent = 'Informe o cliente para gerar a imagem.'; return; }

    const regra = detectarRegraCliente(payload.cliente);
    el.relGerarImagem.disabled = true;
    el.feedback.textContent = 'Buscando dados...';
    const nodes = [];
    try {
      let buckets;
      if (['LDC', 'COFCO', 'SIPAL_USIMAT', 'OURO_SAFRA'].includes(regra)) {
        const rows = await buscarMovimentoAgente(hojeBr()); // "Movimentação_hoje" via agente, sempre hoje (igual ao script antigo)
        if (regra === 'LDC') buckets = montarBucketsLdc(rows);
        else if (regra === 'COFCO') buckets = montarBucketsCofco(rows);
        else if (regra === 'SIPAL_USIMAT') buckets = montarBucketsSipalUsimat(rows);
        else buckets = montarBucketsOuroSafra(rows);
      } else {
        const rows = relatorioRowsForCliente(payload);
        const sheet = regra === 'AGRICOLA_ALVORADA' ? montarSheetAgricolaAlvorada(rows) : montarSheetGenerico(rows);
        buckets = sheet.linhas.length ? [{ nome: regra, titulo: payload.cliente, header: sheet.header, linhas: sheet.linhas }] : [];
      }

      if (!buckets.length) { el.feedback.textContent = 'Nenhum registro encontrado para este cliente (hoje, no caso de LDC/COFCO/Sipal/Ouro Safra).'; return; }

      el.feedback.textContent = 'Gerando imagem...';
      await ensureExportLibLocal('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js', 'html2canvas');
      const slug = payload.cliente.replace(/[^a-zA-Z0-9]+/g, '_');

      if (buckets.length === 1) {
        const node = buildRelatorioImagemNode(payload.cliente, buckets[0]);
        nodes.push(node);
        const dataUrl = await domToPngRegional(node);
        baixarUrl(dataUrl, `Relatorio_${slug}_${buckets[0].nome}.png`);
      } else {
        await ensureExportLibLocal('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js', 'JSZip');
        const zip = new window.JSZip();
        for (const bucket of buckets) {
          const node = buildRelatorioImagemNode(payload.cliente, bucket);
          nodes.push(node);
          const dataUrl = await domToPngRegional(node);
          zip.file(`${bucket.nome}.png`, dataUrl.split(',')[1], { base64: true });
        }
        const blob = await zip.generateAsync({ type: 'blob' });
        const url = URL.createObjectURL(blob);
        baixarUrl(url, `Relatorio_${slug}_imagens.zip`);
        URL.revokeObjectURL(url);
      }
      el.feedback.textContent = `${buckets.length} imagem(ns) gerada(s). Baixe e envie no grupo do WhatsApp.`;
    } catch (error) {
      console.error('[Imagem relatório cliente]', error);
      el.feedback.textContent = error?.message || 'Erro ao gerar imagem.';
    } finally {
      nodes.forEach((n) => n.remove());
      el.relGerarImagem.disabled = false;
    }
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
    if (event.target.closest('#aberturaOsReload')) { await loadAberturaOs(); return; }
    const cadastrarOsBtn = event.target.closest('[data-cadastrar-abertura-os]');
    if (cadastrarOsBtn) { await cadastrarAberturaOs(cadastrarOsBtn.dataset.cadastrarAberturaOs, cadastrarOsBtn); return; }

    // FOB 0 — form salvar
    if (event.target.closest('#fobSalvar')) { await salvarFob(); return; }
    if (event.target.closest('#fobReload')) { state.fobLoaded = false; await loadFob(); await gerarRelatorioFobAutomatico(); return; }
    if (event.target.closest('#fobSalvarPendentes')) { await salvarPendentesFobImportado(); return; }
    if (event.target.closest('#fobExportCsv')) { exportarCsvFob(); return; }

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
      // atualizar_resolvido_* é só um sinal aditivo pra aba "Atualizar" do Gestor >
      // Logística (logistica.js) saber que a Logística ADM concluiu a solicitação e
      // destacar o item em verde com um botão "OK" até o gestor confirmar — não
      // interfere em nada do resto do fluxo (observacao_logistica/status_gestor
      // continuam sendo a fonte de verdade operacional, como sempre foram).
      const resolvido = { atualizar_resolvido_tipo: type === 'kg' ? 'saldo' : 'finalizar', atualizar_resolvido_em: now, atualizar_resolvido_por: state.user?.id || null };
      const patch = type === 'kg'
        ? { observacao_logistica: null, updated_at: now, ...resolvido }
        : { status_gestor: 'AGUARDAR', status_logistica: 'FINALIZADA', finalizado_em: now, updated_at: now, ...resolvido };
      const { error } = await supabase.from('operacional_os').update(patch).eq('id', id);
      if (error) { alert(error.message); oslogOk.disabled = false; oslogOk.textContent = 'OK'; return; }
      state.osLog = state.osLog.filter((r) => String(r.id) !== String(id));
      renderOsLog();
      renderAjuste();
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

    const abrirLaudo = event.target.closest('[data-abrir-laudo]');
    if (abrirLaudo) {
      const row = state.os.find((r) => String(r.id) === String(abrirLaudo.dataset.abrirLaudo));
      if (row) laudoUrls(row).forEach((url) => window.open(url, '_blank', 'noopener'));
      return;
    }

    const ajustarLaudo = event.target.closest('[data-ajustar-laudo]');
    if (ajustarLaudo) {
      const id = ajustarLaudo.dataset.ajustarLaudo;
      const row = state.os.find((r) => String(r.id) === String(id));
      if (!row) return;
      ajustarLaudo.disabled = true;
      ajustarLaudo.textContent = '...';
      const now = new Date().toISOString();
      const previous = row.observacao_logistica;
      row.observacao_logistica = null;
      renderConferenciasLaudos();
      // Ver comentário em oslogOk: só marca atualizar_resolvido_* (sinal aditivo pra
      // aba "Atualizar" do Gestor), sem mudar o comportamento já existente.
      const { error } = await supabase.from('operacional_os').update({
        observacao_logistica: null,
        updated_at: now,
        atualizar_resolvido_tipo: 'conferencia',
        atualizar_resolvido_em: now,
        atualizar_resolvido_por: state.user?.id || null,
      }).eq('id', id);
      if (error) {
        row.observacao_logistica = previous;
        renderConferenciasLaudos();
        el.feedback.textContent = error.message;
      }
      return;
    }

    const btn = event.target.closest('[data-action]');
    if (!btn) return;
    const tr = btn.closest('[data-os-id]');
    const row = state.os.find((r) => String(r.id) === String(tr?.dataset.osId));
    if (!row) return;
    const action = btn.dataset.action;

    if (['aprovar-finalizacao', 'recusar-finalizacao'].includes(action)) {
      await decidirFinalizacao(row, action === 'aprovar-finalizacao', btn);
      return;
    }

    if (['assumir', 'finalizar', 'devolver', 'reabrir'].includes(action)) {
      await updateFinalizacao(row, action);
      return;
    }

    if (['notificar', 'resp1', 'resp2', 'resp3'].includes(action)) {
      await registrarAlertaClassificador(row, action);
    }
  }

  async function onChange(event) {
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

  async function decidirFinalizacao(row, aprovar, btn) {
    const botoes = btn.closest('.los-decision-actions')?.querySelectorAll('button') || [];
    botoes.forEach((item) => { item.disabled = true; });
    const { error } = await supabase.rpc('decidir_finalizacao_os_logistica', {
      p_os_id: row.id,
      p_aprovar: aprovar,
    });
    if (error) {
      botoes.forEach((item) => { item.disabled = false; });
      el.feedback.textContent = error.message;
      return;
    }
    state.os = state.os.filter((item) => String(item.id) !== String(row.id));
    render();
    el.feedback.textContent = aprovar
      ? 'Finalização aprovada e enviada ao agente.'
      : 'Solicitação de finalização recusada.';
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


  // Mesmo risco de chamada concorrente duplicada do loadOsLog (chamada direta no boot +
  // condicional em renderTabs quando a aba 'abertura_os' já vem selecionada pela hash).
  // (guard "aberturaOsInflight" declarado lá em cima, junto do boot -- ver comentário lá)
  async function loadAberturaOs() {
    if (aberturaOsInflight) return aberturaOsInflight;
    aberturaOsInflight = (async () => {
      const list = document.getElementById('aberturaOsList');
      if (list) list.innerHTML = '<div class="log-empty">Carregando solicitações de abertura...</div>';
      const { data, error } = await supabase
        .from('logistica_abertura_os')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1000);
      state.aberturaOsLoaded = true;
      if (error) {
        state.aberturaOs = [];
        if (list) list.innerHTML = `<div class="log-empty">${esc(error.message)}. Rode o SQL de abertura de OS no Supabase.</div>`;
        return;
      }
      state.aberturaOs = safeArray(data);
      renderAberturaOs();
      renderStats();
    })();
    try { return await aberturaOsInflight; } finally { aberturaOsInflight = null; }
  }

  function renderAberturaOs() {
    const list = document.getElementById('aberturaOsList');
    if (!list) return;
    const rows = safeArray(state.aberturaOs);
    if (!rows.length) { list.innerHTML = '<div class="log-empty">Nenhuma solicitação de abertura de O.S.</div>'; return; }
    const pendentes = rows.filter(r => String(r.status || 'PENDENTE') === 'PENDENTE').length;
    const cadastradas = rows.filter(r => String(r.status || '') === 'CADASTRADO').length;
    list.innerHTML = `
      <div class="log-mini-grid" style="margin-bottom:14px">
        <article class="card"><h3>Pendentes</h3><p class="metric log-kpi-warn">${BR_INT.format(pendentes)}</p><p class="muted">Aguardando cadastro da O.S.</p></article>
        <article class="card"><h3>Cadastradas</h3><p class="metric log-kpi-ok">${BR_INT.format(cadastradas)}</p><p class="muted">Número da O.S. devolvido ao gestor.</p></article>
      </div>
      <div class="log-table-wrap"><table class="log-table"><thead><tr>
        <th>Solicitação</th><th>Cliente / filial</th><th>Embarque</th><th>Destino</th><th>Produto</th><th>Status / cadastro</th>
      </tr></thead><tbody>
        ${rows.map(r => {
          const st = String(r.status || 'PENDENTE');
          const done = st === 'CADASTRADO';
          return `<tr>
            <td><div class="log-title">${brDate(r.created_at, true)}</div><div class="log-meta">Regional: ${esc(r.regional || '-')}</div><div class="log-meta">Solicitante: ${esc(r.solicitante_nome || '-')}</div></td>
            <td><div class="log-title">${esc(r.contratante_cliente || '-')}</div><div class="log-meta">Filial: ${esc(r.filial_pagadora || '-')}</div><div class="log-meta">Contrato: ${esc(r.numero_contrato || '-')}</div><div class="log-meta">Produtor: ${esc(r.produtor || '-')}</div></td>
            <td><div class="log-title">${esc(r.armazem_embarque || '-')}</div><div class="log-meta">${esc(r.cidade_embarque || '-')}</div></td>
            <td><div class="log-title">${esc(r.local_destino || '-')}</div><div class="log-meta">${esc(r.cidade_destino || '-')}</div></td>
            <td><div class="log-title">${esc(r.produto || '-')}</div><div class="log-meta">${esc(r.tipo_produto || '-')}</div><div class="log-meta">Volume: ${BR_NUM.format(Number(r.volume_inicial) || 0)} tons · Troca notas: ${esc(r.troca_notas || '-')}</div></td>
            <td>${done ? `<span class="log-badge ok">Cadastrado: OS ${esc(r.numero_os_cadastrada || '-')}</span>` : `<div class="log-inline-actions"><input class="log-input" data-numero-os-abertura="${esc(String(r.id))}" placeholder="Número da OS"><button class="btn btn-primary" data-cadastrar-abertura-os="${esc(String(r.id))}" type="button">Cadastrado</button></div>`}<textarea class="log-input log-textarea" data-obs-abertura="${esc(String(r.id))}" placeholder="Observação ADM">${esc(r.observacao_adm || '')}</textarea></td>
          </tr>`;
        }).join('')}
      </tbody></table></div>`;
  }

  async function cadastrarAberturaOs(id, btn) {
    const numero = document.querySelector(`[data-numero-os-abertura="${CSS.escape(String(id))}"]`)?.value?.trim();
    const obs = document.querySelector(`[data-obs-abertura="${CSS.escape(String(id))}"]`)?.value?.trim() || null;
    if (!numero) { alert('Informe o número da O.S. cadastrada.'); return; }
    btn.disabled = true;
    btn.textContent = 'Salvando...';
    const patch = {
      status: 'CADASTRADO',
      numero_os_cadastrada: numero,
      observacao_adm: obs,
      cadastrado_por: state.user?.id || null,
      cadastrado_em: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabase.from('logistica_abertura_os').update(patch).eq('id', id);
    if (error) { alert(error.message); btn.disabled = false; btn.textContent = 'Cadastrado'; return; }
    state.aberturaOs = state.aberturaOs.map(r => String(r.id) === String(id) ? { ...r, ...patch } : r);
    renderAberturaOs();
    renderStats();
    el.feedback.textContent = `O.S. ${numero} vinculada à solicitação e liberada para o Gestor.`;
  }

  // renderTabs() já chama loadOsLog() quando a aba inicial é 'os' (padrão), e o boot da
  // página também chama loadOsLog() direto pra pré-carregar essa aba independente de qual
  // esteja ativa -- as duas rodavam em paralelo (osLogLoaded só vira true depois do await,
  // tarde demais pra bloquear a 2a chamada), duplicando a consulta e piorando o
  // congestionamento de conexões concorrentes na carga inicial. Guard reusa a mesma chamada.
  // (guard "osLogInflight" declarado lá em cima, junto do boot -- ver comentário lá)
  async function loadOsLog() {
    if (osLogInflight) return osLogInflight;
    osLogInflight = (async () => {
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
      await carregarAnexosSaldo();
      renderOsLog();
      renderAjuste();
      const reloadBtn = document.getElementById('osLogReload');
      if (reloadBtn && !reloadBtn.dataset.osLogReloadBound) {
        reloadBtn.dataset.osLogReloadBound = '1';
        reloadBtn.addEventListener('click', () => { state.osLogLoaded = false; loadOsLog(); });
      }
    })();
    try { return await osLogInflight; } finally { osLogInflight = null; }
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

  // Aba "Ajuste": mesma fonte do loadOsLog (state.osLog), filtrada só nas O.S.
  // de aumento de saldo (Programação › Saldo -> observacao_logistica "KG solicitado...").
  // O botão "Ajustado" usa o mesmo handler data-oslog-type="kg", que limpa
  // observacao_logistica, marcando o saldo como resolvido pela Logística.
  function renderAjuste() {
    const list = document.getElementById('logAjusteList');
    if (!list) return;
    const rows = state.osLog.filter((r) => String(r.observacao_logistica || '').startsWith('KG solicitado'));
    if (!rows.length) { list.innerHTML = '<div class="log-empty">Nenhuma O.S. com aumento de saldo pendente.</div>'; return; }
    const BR = new Intl.NumberFormat('pt-BR');
    const fmt = (v) => BR.format(Number(v) || 0);
    const brD = (v) => { if (!v) return '-'; const [y,m,d] = String(v).slice(0,10).split('-'); return `${d}/${m}/${y}`; };
    const anexos = state.anexosSaldo || new Map();
    list.innerHTML = `
      <div class="log-table-wrap"><table class="log-table"><thead><tr>
        <th style="width:11%">O.S.</th>
        <th style="width:28%">Cliente / Rota</th>
        <th style="width:13%">Remanescente</th>
        <th style="width:23%">Saldo solicitado</th>
        <th style="width:13%">Anexo</th>
        <th style="width:12%">Ação</th>
      </tr></thead><tbody>
      ${rows.map((row) => {
        const rem = Number(row.remanescente);
        const anexo = anexos.get(row.id);
        const urls = safeArray(anexo?.arquivos_urls);
        const anexoCell = urls.length
          ? urls.map((url, i) => `<a href="${esc(url)}" target="_blank" rel="noopener" class="log-badge ok" style="margin:0 4px 4px 0">📎 ${i + 1}</a>`).join('')
          : '<span class="log-badge warn">Sem anexo</span>';
        return `<tr>
          <td><div class="log-title">${esc(row.numero_os || '-')}</div><div class="log-meta">${brD(row.data_os)}</div><div class="log-meta">${esc(row.supervisao || '-')}</div></td>
          <td><div class="log-title">${esc(row.cliente || '-')}</div><div class="log-meta">Emb.: ${esc(row.embarque || '-')}</div><div class="log-meta">Dest.: ${esc(row.destino || '-')}</div></td>
          <td><span class="log-badge ${rem <= 0 ? 'warn' : 'ok'}">${fmt(rem)}</span><div class="log-meta" style="margin-top:4px">Lote ${fmt(row.lote)}</div></td>
          <td><span class="log-badge danger">↑ KG</span><div class="log-meta" style="margin-top:4px">${esc(row.observacao_logistica)}</div></td>
          <td>${anexoCell}</td>
          <td><button class="btn btn-primary" data-oslog-ok="${esc(String(row.id))}" data-oslog-type="kg" type="button">Ajustado</button></td>
        </tr>`;
      }).join('')}
      </tbody></table></div>`;
  }

  // Anexo/print obrigatório de alguns clientes na ação Saldo (Gestor >
  // Programação, ver logistica_clientes_anexo_regras) fica salvo em
  // operacional_laudos com origem='programacao_saldo' -- NÃO reaproveita o
  // "LAUDO:" de observacao_logistica (que já é dono do texto "KG solicitado
  // ..." pra essas mesmas linhas). Carregado sob demanda junto do loadOsLog,
  // só pras O.S. que estão na fila de Ajuste.
  async function carregarAnexosSaldo() {
    const ids = state.osLog.filter((r) => String(r.observacao_logistica || '').startsWith('KG solicitado')).map((r) => r.id);
    if (!ids.length) { state.anexosSaldo = new Map(); return; }
    const { data, error } = await supabase
      .from('operacional_laudos')
      .select('os_id,arquivos_urls,enviado_em')
      .eq('origem', 'programacao_saldo')
      .in('os_id', ids)
      .order('enviado_em', { ascending: false });
    if (error) { console.warn('Falha ao carregar anexos de saldo:', error); state.anexosSaldo = new Map(); return; }
    const map = new Map();
    for (const row of safeArray(data)) {
      if (!map.has(row.os_id)) map.set(row.os_id, row); // ordenado desc: 1ª ocorrência = mais recente
    }
    state.anexosSaldo = map;
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
}

initProtectedPage('Painel de Logística', renderContent);
