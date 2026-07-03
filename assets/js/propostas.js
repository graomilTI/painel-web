import { initProtectedPage } from './pageInit.js';
import { supabase } from './supabaseClient.js';

const STATUS_LABEL = {
  rascunho: 'Rascunho',
  gerada: 'Gerada',
  enviada: 'Enviada',
  aceita: 'Aceita',
  contrato: 'Contrato',
  recusada: 'Recusada',
};

const MONEY_FIELDS = [
  ['fob', 'FOB'],
  ['cad', 'CAD'],
  ['aud', 'AUD'],
  ['cif', 'CIF'],
  ['lacrar', 'LACRAR'],
  ['m_12h', 'M.12H'],
  ['m_8h', 'M.8H'],
  ['quality', 'QUALITY'],
  ['add_sup', 'ADD SUP'],
  ['add_claf', 'ADD CLAF'],
  ['t_aflas', 'T-AFLAS'],
  ['t_aflac', 'T-AFLAC'],
  ['t_gmos', 'T-GMOS'],
  ['t_gmoc', 'T-GMOC'],
  ['t_don', 'T-DON'],
  ['intacta', 'INTACTA'],
  ['tn', 'TN'],
];

const DEFAULT_MONEY_VALUES = {
  fob: 'R$ 2,20',
  cad: '200',
  aud: 'R$ 880,00',
  cif: 'R$ 600,00',
  lacrar: 'R$ 825,00',
  m_12h: 'R$ 15.000,00',
  m_8h: 'R$ 15.000,00',
  quality: 'R$ 10.450,00',
  add_sup: 'R$ 880,00',
  add_claf: 'R$ 825,00',
  t_aflas: 'R$ 2,20',
  t_aflac: 'R$ 0,35',
  t_gmos: 'R$ 1,10',
  t_gmoc: 'R$ 0,45',
  t_don: 'R$ 2,20',
  intacta: 'R$ 0,55',
  tn: 'R$ 1,10',
};

const DEFAULT_GESTORES_REGIONAIS = [
  { ordem: 10, regional: 'BAHIA', supervisor: 'DOUGLAS CANDIDO', contato: '(77) 9 9999-3585' },
  { ordem: 20, regional: 'GOIAS', supervisor: 'DILSON REBAU', contato: '(64) 9 9344-0641' },
  { ordem: 30, regional: 'GOIAS', supervisor: 'SIDNEI RIBEIRO', contato: '(64) 9 9223-3113' },
  { ordem: 40, regional: 'MARANHÃO', supervisor: 'MANUEL DE JESUS', contato: '(99) 9 8848-6088' },
  { ordem: 50, regional: 'MATO GROSSO DO SUL', supervisor: 'SAMUEL SANTA CRUZ', contato: '(67) 9 9119-4786' },
  { ordem: 60, regional: 'MATO GROSSO DO SUL', supervisor: 'CECILIA KAROLAYNE', contato: '(66) 9 8437-4326' },
  { ordem: 70, regional: 'MINAS GERAIS', supervisor: 'RICARDO ARAÚJO', contato: '(34) 9 9729-7489' },
  { ordem: 80, regional: 'MT1 - SINOP', supervisor: 'MARCO AUGUSTO', contato: '(66) 9 9714-3354' },
  { ordem: 90, regional: 'MT2 - RONDONOPOLIS/PRIMAVERA DO LESTE', supervisor: 'JEAN PABLO', contato: '(66) 9 9607-6403' },
  { ordem: 100, regional: 'MT3 - CONFRESA', supervisor: 'VANUZA PEREIRA', contato: '(66) 9 8457-8435' },
  { ordem: 110, regional: 'MT3 - QUERENCIA', supervisor: 'VANUZA PEREIRA', contato: '(66) 9 8457-8435' },
  { ordem: 120, regional: 'MT4 - CAMPO NOVO DO PARECIS', supervisor: 'CLEUTON ALBERNAZ', contato: '(66) 9 9690-9921' },
  { ordem: 130, regional: 'PARA', supervisor: 'JADSON SARAVA', contato: '(63) 9 9216-7795' },
  { ordem: 140, regional: 'PARAGUAI', supervisor: 'ANDERSON DO CARMO', contato: '(44) 9 9829-3822' },
  { ordem: 150, regional: 'PR - PONTA GROSSA E REGIÃO', supervisor: 'MICHAEL RIBAS', contato: '(42) 9 9834-4303' },
  { ordem: 160, regional: 'PR - CASCAVEL', supervisor: 'ANDERSON DO CARMO', contato: '(44) 9 9829-3822' },
  { ordem: 170, regional: 'PR - LONDRINA', supervisor: 'MICHAEL GONÇALVES', contato: '(43) 9 9182-6733' },
  { ordem: 180, regional: 'PR - MARINGÁ E TERMINAIS FERROVIÁRIOS', supervisor: 'JOSÉ BOA VENTURA', contato: '(44) 9 9836-1000' },
  { ordem: 190, regional: 'RIO GRANDE DO SUL', supervisor: 'DILMAR THOMET', contato: '(54) 9 9674-3775' },
  { ordem: 200, regional: 'SÃO PAULO', supervisor: 'MAYCKON INOUE', contato: '(43) 9 9604-1000' },
  { ordem: 210, regional: 'TOCANTINS', supervisor: 'KAIRO LEITE', contato: '(63) 9 9120-1087' },
];

const DEFAULT_PRAZO_FATURA = 'Semanalmente';
const DEFAULT_PRAZO_PGTO = '10ddl';

const state = {
  rows: [],
  filtered: [],
  gestores: DEFAULT_GESTORES_REGIONAIS,
  filters: { q: '', status: '' },
  activeTab: 'propostas',
  loading: false,
  editing: null,
  gestorEditing: null,
  gestoresError: '',
  userContext: null,
};

const esc = (value) => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function addYearsISO(isoDate, years) {
  const [y, m, d] = isoDate.split('-').map(Number);
  const date = new Date(y + years, m - 1, d);
  return date.toISOString().slice(0, 10);
}

function generateNumero() {
  const maxSeq = state.rows.reduce((max, row) => {
    const seq = parseInt(String(row.numero || '').split('.')[0], 10);
    return Number.isFinite(seq) && seq > max ? seq : max;
  }, 0);
  const seqPart = String(maxSeq + 1).padStart(3, '0');
  const now = new Date();
  const datePart = [
    String(now.getFullYear()).slice(-2),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('');
  return `${seqPart}.${datePart}`;
}

function formatDate(value) {
  if (!value) return '-';
  const [y, m, d] = String(value).slice(0, 10).split('-');
  return y && m && d ? `${d}/${m}/${y}` : '-';
}

function formatDateTime(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(date);
}

function normalize(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function ensureStyles() {
  if (document.getElementById('propostasStyles')) return;
  const style = document.createElement('style');
  style.id = 'propostasStyles';
  style.textContent = `
    .prop-shell{display:grid;gap:18px}
    .prop-hero{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;flex-wrap:wrap}
    .prop-hero h3{margin:0 0 6px;font-size:28px}
    .prop-hero p{margin:0;color:var(--muted)}
    .prop-actions{display:flex;gap:10px;flex-wrap:wrap}
    .prop-btn{border:1px solid transparent;border-radius:14px;padding:11px 14px;font-weight:800;cursor:pointer;transition:.18s ease}
    .prop-btn:hover{transform:translateY(-1px)}
    .prop-btn-primary{background:#16a34a;color:white}
    .prop-btn-secondary{background:#0d0d18;border-color:rgba(255,255,255,.08);color:#e2e8f0}
    .prop-btn-danger{background:#7f1d1d;color:white}
    .prop-btn-inline{padding:8px 10px;border-radius:11px;font-size:12px}
    .prop-tabs{display:flex;gap:10px;flex-wrap:wrap;padding:6px;background:rgba(2,6,23,.48);border:1px solid rgba(51,65,85,.7);border-radius:18px;width:max-content;max-width:100%}
    .prop-tab{border:1px solid transparent;border-radius:13px;padding:10px 14px;background:transparent;color:#94a3b8;font-weight:900;cursor:pointer}
    .prop-tab.is-active{background:#16a34a;color:#fff;box-shadow:0 10px 24px rgba(22,163,74,.18)}
    .prop-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px}
    .prop-kpi{background:linear-gradient(180deg,rgba(15,23,42,.96),rgba(2,6,23,.92));border:1px solid rgba(51,65,85,.8);border-radius:20px;padding:16px 18px;box-shadow:0 12px 28px rgba(2,6,23,.24)}
    .prop-kpi-label{font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}
    .prop-kpi-value{margin-top:10px;font-size:28px;font-weight:900;color:#dcfce7}
    .prop-panel{background:linear-gradient(180deg,rgba(15,23,42,.96),rgba(2,6,23,.92));border:1px solid rgba(51,65,85,.8);border-radius:24px;box-shadow:0 18px 34px rgba(2,6,23,.24);overflow:hidden}
    .prop-panel-head{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:20px 20px 0;flex-wrap:wrap}
    .prop-panel-head h3{margin:0;font-size:20px}
    .prop-panel-head p{margin:4px 0 0;color:var(--muted);font-size:14px}
    .prop-filter-grid{display:grid;grid-template-columns:2fr 1fr auto;gap:12px;padding:20px}
    .prop-field{display:flex;flex-direction:column;gap:6px}
    .prop-field label{font-size:12px;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);font-weight:800}
    .prop-input,.prop-select,.prop-textarea{width:100%;box-sizing:border-box;border-radius:14px;border:1px solid rgba(255,255,255,.08);background:#0d0d18;color:#e2e8f0;padding:12px 14px;outline:none}
    .prop-textarea{min-height:82px;resize:vertical}
    .prop-input:focus,.prop-select:focus,.prop-textarea:focus{border-color:#16a34a;box-shadow:0 0 0 2px rgba(22,163,74,.18)}
    .prop-table-wrap{padding:0 20px 20px;overflow:auto}
    .prop-table{width:100%;border-collapse:collapse;min-width:960px}
    .prop-table th,.prop-table td{padding:13px 12px;border-bottom:1px solid rgba(51,65,85,.45);vertical-align:top;text-align:left}
    .prop-table th{font-size:12px;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);background:rgba(15,23,42,.9)}
    .prop-table tbody tr:hover{background:rgba(15,23,42,.56)}
    .prop-name{display:flex;flex-direction:column;gap:4px}
    .prop-name strong{font-size:14px;color:#f8fafc}
    .prop-sub{font-size:12px;color:var(--muted)}
    .prop-chip{display:inline-flex;align-items:center;padding:6px 10px;border-radius:999px;border:1px solid rgba(51,65,85,.8);background:#10101e;color:#e2e8f0;font-size:12px;font-weight:800}
    .prop-chip-ok{background:rgba(22,101,52,.18);border-color:rgba(34,197,94,.3)}
    .prop-chip-warn{background:rgba(146,64,14,.18);border-color:rgba(251,191,36,.28)}
    .prop-chip-danger{background:rgba(127,29,29,.18);border-color:rgba(239,68,68,.28)}
    .prop-row-actions{display:flex;gap:6px;flex-wrap:wrap}
    .prop-feedback{display:none;margin:0 20px 20px;padding:12px 14px;border-radius:14px;border:1px solid rgba(255,255,255,.08);background:#0d0d18}
    .prop-feedback.is-visible{display:block}
    .prop-feedback.is-error{border-color:rgba(239,68,68,.35);background:rgba(127,29,29,.12)}
    .prop-feedback.is-success{border-color:rgba(34,197,94,.35);background:rgba(22,101,52,.12)}
    .prop-empty{padding:26px 20px;color:var(--muted)}
    .prop-overlay{position:fixed;inset:0;background:rgba(2,6,23,.76);display:none;align-items:center;justify-content:center;padding:20px;z-index:99999}
    .prop-overlay.is-open{display:flex}
    .prop-modal{width:min(1180px,100%);max-height:92vh;overflow:auto;background:#020617;border:1px solid rgba(51,65,85,.85);border-radius:26px;box-shadow:0 28px 60px rgba(0,0,0,.45)}
    .prop-modal-head{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;padding:22px 22px 0}
    .prop-modal-head h3{margin:0;font-size:24px}
    .prop-modal-head p{margin:6px 0 0;color:var(--muted)}
    .prop-close{width:42px;height:42px;border-radius:14px;border:1px solid rgba(255,255,255,.08);background:#0d0d18;color:#fff;font-size:20px;cursor:pointer}
    .prop-modal-body{padding:22px;display:grid;grid-template-columns:1fr;gap:18px}
    .prop-card{border:1px solid rgba(51,65,85,.72);border-radius:20px;padding:18px;background:#0d0d18}
    .prop-card h4{margin:0 0 14px;font-size:16px}
    .prop-form-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px}
    .prop-form-grid .span-2{grid-column:span 2}
    .prop-form-grid .full{grid-column:1 / -1}
    .prop-modal-actions{display:flex;justify-content:flex-end;gap:10px;flex-wrap:wrap;padding:0 22px 22px}
    .prop-link{color:#86efac;text-decoration:none;font-weight:800}
    .prop-link:hover{text-decoration:underline}
    .prop-loading{opacity:.72;pointer-events:none}
    .gestor-form{padding:20px;display:grid;grid-template-columns:1.3fr 1fr .8fr .35fr auto;gap:12px;align-items:end;border-top:1px solid rgba(51,65,85,.45)}
    .gestor-table{min-width:820px}
    @media (max-width: 1100px){.prop-grid,.prop-filter-grid,.prop-form-grid,.gestor-form{grid-template-columns:1fr}.prop-form-grid .span-2{grid-column:auto}.prop-tabs{width:100%}.prop-tab{flex:1}}
  `;
  document.head.appendChild(style);
}

function statusClass(status) {
  if (['aceita', 'contrato'].includes(status)) return 'prop-chip prop-chip-ok';
  if (['recusada'].includes(status)) return 'prop-chip prop-chip-danger';
  if (['gerada', 'enviada'].includes(status)) return 'prop-chip prop-chip-warn';
  return 'prop-chip';
}

function setFeedback(message, type = 'success') {
  const box = document.getElementById('propFeedback');
  if (!box) return;
  if (!message) {
    box.className = 'prop-feedback';
    box.textContent = '';
    return;
  }
  box.className = `prop-feedback is-visible ${type === 'error' ? 'is-error' : 'is-success'}`;
  box.textContent = message;
}

function setGestorFeedback(message, type = 'success') {
  const box = document.getElementById('gestorFeedback');
  if (!box) return;
  if (!message) {
    box.className = 'prop-feedback';
    box.textContent = '';
    return;
  }
  box.className = `prop-feedback is-visible ${type === 'error' ? 'is-error' : 'is-success'}`;
  box.textContent = message;
}

function applyFilters() {
  const q = normalize(state.filters.q);
  const status = normalize(state.filters.status);
  state.filtered = state.rows.filter((row) => {
    const matchesQ = !q || [
      row.numero,
      row.cliente,
      row.nome_contato,
      row.email_contato,
      row.whatsapp_contato,
      row.solicitante,
    ].some((value) => normalize(value).includes(q));
    const matchesStatus = !status || normalize(row.status) === status;
    return matchesQ && matchesStatus;
  });
}

function renderTabs() {
  return `
    <div class="prop-tabs" role="tablist" aria-label="Abas de propostas">
      <button class="prop-tab ${state.activeTab === 'propostas' ? 'is-active' : ''}" data-tab="propostas" type="button">Propostas</button>
      <button class="prop-tab ${state.activeTab === 'gestores' ? 'is-active' : ''}" data-tab="gestores" type="button">Gestores</button>
    </div>
  `;
}

function renderPropostasPanel() {
  const total = state.rows.length;
  const geradas = state.rows.filter((row) => row.link_proposta).length;
  const aceitas = state.rows.filter((row) => row.status === 'aceita' || row.data_aceite_proposta).length;
  const contratos = state.rows.filter((row) => row.link_contrato).length;

  return `
    <section class="prop-grid">
      <article class="prop-kpi"><div class="prop-kpi-label">Propostas</div><div class="prop-kpi-value">${total}</div></article>
      <article class="prop-kpi"><div class="prop-kpi-label">Com link</div><div class="prop-kpi-value">${geradas}</div></article>
      <article class="prop-kpi"><div class="prop-kpi-label">Aceitas</div><div class="prop-kpi-value">${aceitas}</div></article>
      <article class="prop-kpi"><div class="prop-kpi-label">Contratos</div><div class="prop-kpi-value">${contratos}</div></article>
    </section>

    <section class="prop-panel">
      <div class="prop-panel-head">
        <div>
          <h3>Base de propostas</h3>
          <p>${state.filtered.length} registro(s) exibido(s)</p>
        </div>
      </div>

      <div class="prop-filter-grid">
        <div class="prop-field">
          <label for="propSearch">Buscar</label>
          <input class="prop-input" id="propSearch" type="text" placeholder="Número, cliente, contato, e-mail, WhatsApp..." value="${esc(state.filters.q)}">
        </div>
        <div class="prop-field">
          <label for="propStatus">Status</label>
          <select class="prop-select" id="propStatus">
            <option value="">Todos</option>
            ${Object.entries(STATUS_LABEL).map(([value, label]) => `<option value="${esc(value)}" ${state.filters.status === value ? 'selected' : ''}>${esc(label)}</option>`).join('')}
          </select>
        </div>
        <div class="prop-field" style="justify-content:flex-end">
          <label>&nbsp;</label>
          <button class="prop-btn prop-btn-secondary" id="propClearBtn" type="button">Limpar</button>
        </div>
      </div>

      <div class="prop-feedback" id="propFeedback"></div>

      <div class="prop-table-wrap">
        ${state.filtered.length ? `
          <table class="prop-table">
            <thead>
              <tr>
                <th>Nº / Cliente</th>
                <th>Contato</th>
                <th>Prazo</th>
                <th>Status</th>
                <th>Links</th>
                <th>Atualização</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              ${state.filtered.map((row) => `
                <tr>
                  <td>
                    <div class="prop-name">
                      <strong>#${esc(row.numero || '-')} · ${esc(row.cliente || '-')}</strong>
                      <span class="prop-sub">${esc(row.estados || 'Sem estado informado')}</span>
                    </div>
                  </td>
                  <td>
                    <div class="prop-name">
                      <strong>${esc(row.nome_contato || '-')}</strong>
                      <span class="prop-sub">${esc(row.email_contato || '-')}</span>
                      <span class="prop-sub">${esc(row.whatsapp_contato || '-')}</span>
                    </div>
                  </td>
                  <td>${formatDate(row.prazo_inicial)} até ${formatDate(row.prazo_final)}<br><span class="prop-sub">Aceite: ${formatDate(row.data_aceite_proposta)}</span></td>
                  <td><span class="${statusClass(row.status)}">${esc(STATUS_LABEL[row.status] || row.status || '-')}</span></td>
                  <td>
                    ${row.link_proposta ? `<a class="prop-link" href="${esc(row.link_proposta)}" target="_blank" rel="noopener">Proposta</a>` : '<span class="prop-sub">Sem proposta</span>'}
                    <br>
                    ${row.link_contrato ? `<a class="prop-link" href="${esc(row.link_contrato)}" target="_blank" rel="noopener">Contrato</a>` : '<span class="prop-sub">Sem contrato</span>'}
                  </td>
                  <td>${formatDateTime(row.updated_at || row.created_at)}</td>
                  <td>
                    <div class="prop-row-actions">
                      <button class="prop-btn prop-btn-inline prop-btn-secondary" data-action="edit" data-id="${esc(row.id)}" type="button">Editar</button>
                      <button class="prop-btn prop-btn-inline prop-btn-primary" data-action="pdf" data-id="${esc(row.id)}" type="button">PDF</button>
                    </div>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        ` : `<div class="prop-empty">Nenhuma proposta encontrada.</div>`}
      </div>
    </section>
  `;
}

function renderGestoresPanel() {
  const editing = state.gestorEditing || {};
  return `
    <section class="prop-panel">
      <div class="prop-panel-head">
        <div>
          <h3>Gestores regionais</h3>
          <p>Esses contatos entram automaticamente na tabela do PDF da proposta.</p>
        </div>
        <div class="prop-actions">
          <button class="prop-btn prop-btn-secondary" id="gestorDefaultsBtn" type="button">Carregar padrão</button>
          <button class="prop-btn prop-btn-secondary" id="gestorRefreshBtn" type="button">Atualizar</button>
        </div>
      </div>

      <div class="gestor-form">
        <div class="prop-field">
          <label for="gRegional">Regional</label>
          <input class="prop-input" id="gRegional" type="text" value="${esc(editing.regional || '')}" placeholder="Ex.: PR - Cascavel">
        </div>
        <div class="prop-field">
          <label for="gSupervisor">Supervisor</label>
          <input class="prop-input" id="gSupervisor" type="text" value="${esc(editing.supervisor || '')}" placeholder="Nome do supervisor">
        </div>
        <div class="prop-field">
          <label for="gContato">Contato</label>
          <input class="prop-input" id="gContato" type="text" value="${esc(editing.contato || '')}" placeholder="(00) 9 0000-0000">
        </div>
        <div class="prop-field">
          <label for="gOrdem">Ordem</label>
          <input class="prop-input" id="gOrdem" type="number" value="${esc(editing.ordem ?? nextGestorOrdem())}">
        </div>
        <div class="prop-actions">
          ${state.gestorEditing ? '<button class="prop-btn prop-btn-secondary" id="gestorCancelBtn" type="button">Cancelar</button>' : ''}
          <button class="prop-btn prop-btn-primary" id="gestorSaveBtn" type="button">${state.gestorEditing ? 'Salvar ajuste' : 'Adicionar'}</button>
        </div>
      </div>

      <div class="prop-feedback ${state.gestoresError ? 'is-visible is-error' : ''}" id="gestorTableNotice">${esc(state.gestoresError)}</div>
      <div class="prop-feedback" id="gestorFeedback"></div>

      <div class="prop-table-wrap">
        ${state.gestores.length ? `
          <table class="prop-table gestor-table">
            <thead>
              <tr>
                <th>Ordem</th>
                <th>Regional</th>
                <th>Supervisor</th>
                <th>Contato</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              ${state.gestores.map((row) => `
                <tr>
                  <td>${esc(row.ordem ?? '-')}</td>
                  <td><strong>${esc(row.regional || '-')}</strong></td>
                  <td>${esc(row.supervisor || '-')}</td>
                  <td>${esc(row.contato || '-')}</td>
                  <td>
                    <div class="prop-row-actions">
                      <button class="prop-btn prop-btn-inline prop-btn-secondary" data-gestor-action="edit" data-id="${esc(row.id || row._key)}" type="button">Editar</button>
                      ${row.id ? `<button class="prop-btn prop-btn-inline prop-btn-danger" data-gestor-action="remove" data-id="${esc(row.id)}" type="button">Remover</button>` : ''}
                    </div>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        ` : `<div class="prop-empty">Nenhum gestor cadastrado.</div>`}
      </div>
    </section>
  `;
}

function renderPage(content) {
  applyFilters();
  content.innerHTML = `
    <section class="prop-shell ${state.loading ? 'prop-loading' : ''}">
      <section class="prop-hero">
        <div>
          <h3>Propostas comerciais</h3>
          <p>Gere o PDF da proposta e acompanhe aceite, contato, contrato e gestores regionais.</p>
        </div>
        <div class="prop-actions">
          <button class="prop-btn prop-btn-secondary" id="propRefreshBtn" type="button">Atualizar</button>
          <button class="prop-btn prop-btn-primary" id="propNewBtn" type="button">Nova proposta</button>
        </div>
      </section>
      ${renderTabs()}
      ${state.activeTab === 'gestores' ? renderGestoresPanel() : renderPropostasPanel()}
    </section>
  `;
  bindPageEvents(content);
}

function bindPageEvents(content) {
  content.querySelectorAll('[data-tab]').forEach((button) => {
    button.addEventListener('click', () => {
      state.activeTab = button.dataset.tab || 'propostas';
      state.gestorEditing = null;
      renderPage(content);
    });
  });
  content.querySelector('#propRefreshBtn')?.addEventListener('click', () => loadRows(content, true));
  content.querySelector('#propNewBtn')?.addEventListener('click', () => openModal());

  if (state.activeTab === 'gestores') {
    bindGestorEvents(content);
    return;
  }

  content.querySelector('#propSearch')?.addEventListener('input', (event) => {
    state.filters.q = event.target.value;
    renderPage(content);
  });
  content.querySelector('#propStatus')?.addEventListener('change', (event) => {
    state.filters.status = event.target.value;
    renderPage(content);
  });
  content.querySelector('#propClearBtn')?.addEventListener('click', () => {
    state.filters = { q: '', status: '' };
    renderPage(content);
  });
  content.querySelectorAll('[data-action="edit"]').forEach((button) => {
    button.addEventListener('click', () => openModal(getRow(button.dataset.id)));
  });
  content.querySelectorAll('[data-action="pdf"]').forEach((button) => {
    button.addEventListener('click', () => generateProposal(button.dataset.id, 'PDF', content));
  });
}

function bindGestorEvents(content) {
  content.querySelector('#gestorRefreshBtn')?.addEventListener('click', async () => {
    await loadGestores();
    renderPage(content);
    setGestorFeedback('Gestores atualizados.');
  });
  content.querySelector('#gestorDefaultsBtn')?.addEventListener('click', () => restoreDefaultGestores(content));
  content.querySelector('#gestorCancelBtn')?.addEventListener('click', () => {
    state.gestorEditing = null;
    renderPage(content);
  });
  content.querySelector('#gestorSaveBtn')?.addEventListener('click', () => saveGestor(content));
  content.querySelectorAll('[data-gestor-action="edit"]').forEach((button) => {
    button.addEventListener('click', () => {
      state.gestorEditing = getGestor(button.dataset.id);
      renderPage(content);
    });
  });
  content.querySelectorAll('[data-gestor-action="remove"]').forEach((button) => {
    button.addEventListener('click', () => removeGestor(button.dataset.id, content));
  });
}

function getRow(id) {
  return state.rows.find((row) => String(row.id) === String(id)) || null;
}

function nextGestorOrdem() {
  const max = state.gestores.reduce((acc, row) => Math.max(acc, Number(row.ordem) || 0), 0);
  return max + 10;
}

function gestorKey(row) {
  return row.id || `${row.ordem}-${normalize(row.regional)}-${normalize(row.supervisor)}-${normalize(row.contato)}`;
}

function getGestor(id) {
  return state.gestores.find((row) => String(gestorKey(row)) === String(id) || String(row.id) === String(id)) || null;
}

async function loadGestores() {
  try {
    state.gestoresError = '';
    const { data, error } = await supabase
      .from('propostas_gestores_regionais')
      .select('*')
      .eq('ativo', true)
      .order('ordem', { ascending: true })
      .order('regional', { ascending: true });
    if (error) throw error;
    const rows = (data || []).map((row, index) => ({
      ...row,
      _key: gestorKey(row) || `gestor-${index}`,
    }));
    state.gestores = rows.length ? rows : DEFAULT_GESTORES_REGIONAIS.map((row, index) => ({ ...row, _key: `default-${index}` }));
  } catch (error) {
    state.gestores = DEFAULT_GESTORES_REGIONAIS.map((row, index) => ({ ...row, _key: `default-${index}` }));
    state.gestoresError = `${error.message || 'Não foi possível carregar a tabela de gestores.'} Execute a migration propostas_gestores_regionais no Supabase.`;
  }
}

async function saveGestor(content) {
  const payload = {
    regional: document.getElementById('gRegional')?.value?.trim() || '',
    supervisor: document.getElementById('gSupervisor')?.value?.trim() || '',
    contato: document.getElementById('gContato')?.value?.trim() || '',
    ordem: Number(document.getElementById('gOrdem')?.value || 0) || nextGestorOrdem(),
    ativo: true,
    updated_at: new Date().toISOString(),
  };
  if (!payload.regional || !payload.supervisor || !payload.contato) {
    setGestorFeedback('Informe regional, supervisor e contato.', 'error');
    return;
  }
  try {
    const query = state.gestorEditing?.id
      ? supabase.from('propostas_gestores_regionais').update(payload).eq('id', state.gestorEditing.id)
      : supabase.from('propostas_gestores_regionais').insert(payload);
    const { error } = await query;
    if (error) throw error;
    state.gestorEditing = null;
    await loadGestores();
    renderPage(content);
    setGestorFeedback('Gestor salvo com sucesso. As próximas propostas já usarão essa tabela.');
  } catch (error) {
    setGestorFeedback(`${error.message || 'Erro ao salvar gestor.'} Verifique se a migration propostas_gestores_regionais foi executada.`, 'error');
  }
}

async function removeGestor(id, content) {
  const row = getGestor(id);
  if (!row?.id) return;
  if (!window.confirm(`Remover ${row.supervisor || 'gestor'} da tabela de contatos regionais?`)) return;
  try {
    const { error } = await supabase
      .from('propostas_gestores_regionais')
      .update({ ativo: false, updated_at: new Date().toISOString() })
      .eq('id', row.id);
    if (error) throw error;
    await loadGestores();
    renderPage(content);
    setGestorFeedback('Gestor removido da tabela.');
  } catch (error) {
    setGestorFeedback(error.message || 'Erro ao remover gestor.', 'error');
  }
}

async function restoreDefaultGestores(content) {
  try {
    const payload = DEFAULT_GESTORES_REGIONAIS.map((row) => ({ ...row, ativo: true, updated_at: new Date().toISOString() }));
    const { error } = await supabase
      .from('propostas_gestores_regionais')
      .upsert(payload, { onConflict: 'regional,supervisor,contato' });
    if (error) throw error;
    await loadGestores();
    renderPage(content);
    setGestorFeedback('Lista padrão carregada com sucesso.');
  } catch (error) {
    setGestorFeedback(`${error.message || 'Erro ao carregar lista padrão.'} Verifique se a migration propostas_gestores_regionais foi executada.`, 'error');
  }
}

function ensureModal() {
  let overlay = document.getElementById('propModalOverlay');
  if (overlay) return overlay;
  overlay = document.createElement('div');
  overlay.id = 'propModalOverlay';
  overlay.className = 'prop-overlay';
  overlay.innerHTML = `
    <div class="prop-modal" role="dialog" aria-modal="true" aria-labelledby="propModalTitle">
      <div class="prop-modal-head">
        <div>
          <h3 id="propModalTitle">Nova proposta</h3>
          <p id="propModalSubtitle">Preencha os dados usados nos marcadores do modelo.</p>
        </div>
        <button class="prop-close" id="propModalClose" type="button">×</button>
      </div>
      <div class="prop-modal-body">
        <section class="prop-card">
          <h4>Dados principais</h4>
          <div class="prop-form-grid">
            <div class="prop-field"><label for="pNumero">Nº</label><input class="prop-input" id="pNumero" type="text"></div>
            <div class="prop-field span-2"><label for="pCliente">Cliente</label><input class="prop-input" id="pCliente" type="text"></div>
            <div class="prop-field"><label for="pStatusModal">Status</label><select class="prop-select" id="pStatusModal">${Object.entries(STATUS_LABEL).map(([v,l]) => `<option value="${esc(v)}">${esc(l)}</option>`).join('')}</select></div>
            <div class="prop-field"><label for="pEstados">Estados</label><input class="prop-input" id="pEstados" type="text" placeholder="Ex.: Paraná"></div>
            <div class="prop-field"><label for="pData">Data proposta</label><input class="prop-input" id="pData" type="date"></div>
            <div class="prop-field"><label for="pPrazoInicial">Prazo inicial</label><input class="prop-input" id="pPrazoInicial" type="date"></div>
            <div class="prop-field"><label for="pPrazoFinal">Prazo final</label><input class="prop-input" id="pPrazoFinal" type="date"></div>
            <div class="prop-field"><label for="pPrazoFatura">Prazo fatura</label><input class="prop-input" id="pPrazoFatura" type="text"></div>
            <div class="prop-field"><label for="pPrazoPgto">Prazo pgto</label><input class="prop-input" id="pPrazoPgto" type="text"></div>
            <div class="prop-field"><label for="pSolicitante">Solicitante</label><input class="prop-input" id="pSolicitante" type="text"></div>
            <div class="prop-field"><label for="pCargo">Cargo</label><input class="prop-input" id="pCargo" type="text"></div>
            <div class="prop-field"><label for="pTelefone">Telefone</label><input class="prop-input" id="pTelefone" type="text"></div>
            <div class="prop-field"><label for="pEmail">E-mail Grão 1000</label><input class="prop-input" id="pEmail" type="email"></div>
          </div>
        </section>

        <section class="prop-card">
          <h4>Contato comercial e acompanhamento</h4>
          <div class="prop-form-grid">
            <div class="prop-field"><label for="pNomeContato">Nome contato</label><input class="prop-input" id="pNomeContato" type="text"></div>
            <div class="prop-field"><label for="pEmailContato">E-mail contato</label><input class="prop-input" id="pEmailContato" type="email"></div>
            <div class="prop-field"><label for="pWhatsappContato">WhatsApp contato</label><input class="prop-input" id="pWhatsappContato" type="text"></div>
            <div class="prop-field"><label for="pDataAceite">Data aceite proposta</label><input class="prop-input" id="pDataAceite" type="date"></div>
            <div class="prop-field span-2"><label for="pLinkProposta">Link proposta</label><input class="prop-input" id="pLinkProposta" type="url"></div>
            <div class="prop-field span-2"><label for="pLinkContrato">Link contrato</label><input class="prop-input" id="pLinkContrato" type="url"></div>
          </div>
        </section>

        <section class="prop-card">
          <h4>Valores e serviços do modelo</h4>
          <div class="prop-form-grid">
            ${MONEY_FIELDS.map(([key, label]) => `<div class="prop-field"><label for="p_${key}">${esc(label)}</label><input class="prop-input" id="p_${key}" type="text"></div>`).join('')}
          </div>
        </section>

        <section class="prop-card">
          <h4>Observações</h4>
          <div class="prop-form-grid">
            <div class="prop-field full"><label for="pObservacao">Observação interna</label><textarea class="prop-textarea" id="pObservacao"></textarea></div>
          </div>
        </section>
      </div>
      <div class="prop-feedback" id="propModalFeedback" style="margin:0 22px 18px"></div>
      <div class="prop-modal-actions">
        <button class="prop-btn prop-btn-secondary" id="propModalCancel" type="button">Cancelar</button>
        <button class="prop-btn prop-btn-secondary" id="propSaveBtn" type="button">Salvar</button>
        <button class="prop-btn prop-btn-primary" id="propSavePdfBtn" type="button">Salvar e gerar PDF</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) closeModal();
  });
  overlay.querySelector('#propModalClose')?.addEventListener('click', closeModal);
  overlay.querySelector('#propModalCancel')?.addEventListener('click', closeModal);
  overlay.querySelector('#propSaveBtn')?.addEventListener('click', () => saveModal());
  overlay.querySelector('#propSavePdfBtn')?.addEventListener('click', () => saveModal('PDF'));
  return overlay;
}

function setModalFeedback(message, type = 'success') {
  const box = document.getElementById('propModalFeedback');
  if (!box) return;
  if (!message) {
    box.className = 'prop-feedback';
    box.textContent = '';
    return;
  }
  box.className = `prop-feedback is-visible ${type === 'error' ? 'is-error' : 'is-success'}`;
  box.textContent = message;
}

function closeModal() {
  document.getElementById('propModalOverlay')?.classList.remove('is-open');
}

function setValue(id, value) {
  const el = document.getElementById(id);
  if (el) el.value = value ?? '';
}

function getValue(id) {
  return document.getElementById(id)?.value?.trim() || '';
}

function openModal(row = null) {
  state.editing = row;
  const overlay = ensureModal();
  overlay.querySelector('#propModalTitle').textContent = row ? 'Editar proposta' : 'Nova proposta';
  overlay.querySelector('#propModalSubtitle').textContent = row ? 'Atualize os dados e gere uma nova versão quando necessário.' : 'Preencha os dados usados nos marcadores do modelo.';
  setModalFeedback('');

  const dataProposta = row?.data_proposta || todayISO();
  setValue('pNumero', row?.numero || generateNumero());
  setValue('pCliente', row?.cliente || '');
  setValue('pStatusModal', row?.status || 'rascunho');
  setValue('pEstados', row?.estados || '');
  setValue('pData', dataProposta);
  setValue('pPrazoInicial', row?.prazo_inicial || dataProposta);
  setValue('pPrazoFinal', row?.prazo_final || addYearsISO(dataProposta, 1));
  setValue('pPrazoFatura', row?.prazo_fatura || DEFAULT_PRAZO_FATURA);
  setValue('pPrazoPgto', row?.prazo_pgto || DEFAULT_PRAZO_PGTO);
  setValue('pSolicitante', row?.solicitante || state.userContext?.user?.name || '');
  setValue('pCargo', row?.cargo || '');
  setValue('pTelefone', row?.telefone || '');
  setValue('pEmail', row?.email || state.userContext?.user?.email || '');
  setValue('pNomeContato', row?.nome_contato || '');
  setValue('pEmailContato', row?.email_contato || '');
  setValue('pWhatsappContato', row?.whatsapp_contato || '');
  setValue('pDataAceite', row?.data_aceite_proposta || '');
  setValue('pLinkProposta', row?.link_proposta || '');
  setValue('pLinkContrato', row?.link_contrato || '');
  setValue('pObservacao', row?.observacao || '');
  MONEY_FIELDS.forEach(([key]) => setValue(`p_${key}`, row?.[key] || row?.campos?.[key] || DEFAULT_MONEY_VALUES[key] || ''));

  overlay.classList.add('is-open');
}

function collectPayload() {
  const campos = {};
  MONEY_FIELDS.forEach(([key, label]) => {
    const value = getValue(`p_${key}`);
    campos[key] = value;
    campos[label] = value;
  });
  return {
    numero: getValue('pNumero'),
    cliente: getValue('pCliente'),
    status: getValue('pStatusModal') || 'rascunho',
    estados: getValue('pEstados'),
    data_proposta: getValue('pData') || todayISO(),
    prazo_inicial: getValue('pPrazoInicial') || null,
    prazo_final: getValue('pPrazoFinal') || null,
    prazo_fatura: getValue('pPrazoFatura'),
    prazo_pgto: getValue('pPrazoPgto'),
    solicitante: getValue('pSolicitante'),
    cargo: getValue('pCargo'),
    telefone: getValue('pTelefone'),
    email: getValue('pEmail'),
    nome_contato: getValue('pNomeContato'),
    email_contato: getValue('pEmailContato'),
    whatsapp_contato: getValue('pWhatsappContato'),
    data_aceite_proposta: getValue('pDataAceite') || null,
    link_proposta: getValue('pLinkProposta'),
    link_contrato: getValue('pLinkContrato'),
    observacao: getValue('pObservacao'),
    ...Object.fromEntries(MONEY_FIELDS.map(([key]) => [key, getValue(`p_${key}`)])),
    campos,
  };
}

async function saveModal(generateFormat = null) {
  const payload = collectPayload();
  if (!payload.numero) {
    setModalFeedback('Informe o número da proposta.', 'error');
    return;
  }
  if (!payload.cliente) {
    setModalFeedback('Informe o cliente.', 'error');
    return;
  }
  try {
    setModalFeedback('Salvando proposta...');
    let saved = null;
    if (state.editing?.id) {
      const { data, error } = await supabase
        .from('propostas_comerciais')
        .update(payload)
        .eq('id', state.editing.id)
        .select('*')
        .single();
      if (error) throw error;
      saved = data;
    } else {
      const insertPayload = {
        ...payload,
        created_by: state.userContext?.user?.id || null,
        created_by_nome: state.userContext?.user?.name || '',
      };
      const { data, error } = await supabase
        .from('propostas_comerciais')
        .insert(insertPayload)
        .select('*')
        .single();
      if (error) throw error;
      saved = data;
      state.editing = saved;
    }
    if (generateFormat) {
      setModalFeedback('Proposta salva. Gerando PDF...');
      await generateProposal(saved.id, generateFormat, document.getElementById('pageContent'), true);
      closeModal();
      return;
    }
    closeModal();
    await loadRows(document.getElementById('pageContent'), true);
    setFeedback('Proposta salva com sucesso.');
  } catch (error) {
    setModalFeedback(error.message || 'Erro ao salvar proposta.', 'error');
  }
}

async function generateProposal(id, formato, content, fromModal = false) {
  try {
    if (!fromModal) setFeedback('Gerando PDF...');
    const { data, error } = await supabase.functions.invoke('gerar-proposta', {
      body: { proposta_id: id },
    });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    await loadRows(content, true);
    const link = data?.link_proposta;
    setFeedback(`PDF gerado com sucesso.${link ? ' Link salvo na proposta.' : ''}`);
    if (link) window.open(link, '_blank', 'noopener');
  } catch (error) {
    const message = error.message || `Erro ao gerar ${formato}.`;
    if (fromModal) setModalFeedback(message, 'error');
    else setFeedback(message, 'error');
  }
}

async function loadRows(content, keepFeedback = false) {
  let loadError = null;
  try {
    state.loading = true;
    if (!keepFeedback) setFeedback('');
    renderPage(content);
    const { data, error } = await supabase
      .from('propostas_comerciais')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1000);
    if (error) throw error;
    state.rows = data || [];
    await loadGestores();
  } catch (error) {
    loadError = error;
  } finally {
    state.loading = false;
    renderPage(content);
    if (loadError) {
      setFeedback(`${loadError.message || 'Erro ao carregar propostas.'} Execute a migration do módulo PROPOSTAS no Supabase.`, 'error');
    }
  }
}

export async function renderContent(content, userContext) {
  state.userContext = userContext;
  ensureStyles();
  content.innerHTML = '<section class="prop-panel"><div class="prop-empty">Carregando propostas...</div></section>';
  await loadRows(content);
}

initProtectedPage('Propostas', renderContent);