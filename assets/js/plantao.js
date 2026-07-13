import { initProtectedPage } from './pageInit.js';
import { supabase } from './supabaseClient.js';

const DEFAULT_SETORES = ['RH', 'Caixas', 'Frotas', 'Logística', 'Troca de notas'];
const STORAGE_KEY = 'painel_rh_plantao_setores_extra';
const TEMPLATE_STORAGE_KEY = 'painel_rh_plantao_modelo_padrao';
const IMG_W = 1600;
const IMG_H = 900;
const WA_W  = 1080;

let setores = [...DEFAULT_SETORES];
let colaboradores = [];
let contatosMap = new Map();
let escala = {};
let modeloPlantao = [];
let currentUserContext = null;
let setorAtivo = DEFAULT_SETORES[0];

function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function norm(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase();
}

function onlyDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

function collaboratorKey(row) {
  const cpf = onlyDigits(row?.cpf);
  if (cpf) return cpf;
  return norm(row?.nome || row?.name || '');
}

function todayISO() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

function nextWeekendBase() {
  const d = new Date();
  const day = d.getDay();
  const diff = day === 6 ? 0 : (6 - day + 7) % 7;
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

function addDaysISO(iso, days) {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function dateFromISO(iso) {
  const [y, m, d] = String(iso || '').split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d, 12, 0, 0);
}

function isoFromDate(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatDateBR(iso) {
  if (!iso) return '';
  const [y, m, d] = String(iso).split('-');
  return `${d}/${m}/${y}`;
}

function weekdayBR(iso) {
  if (!iso) return '';
  const date = new Date(`${iso}T12:00:00`);
  return ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'][date.getDay()];
}

function getPlantaoDatesInRange() {
  const ini = document.getElementById('plantaoData')?.value || nextWeekendBase();
  const fim = document.getElementById('plantaoDataFim')?.value || ini;
  const start = dateFromISO(ini);
  const end = dateFromISO(fim);
  if (!start || !end) return [ini].filter(Boolean);

  const datas = [];
  const d = new Date(start);
  let safety = 0;
  while (d <= end && safety < 370) {
    datas.push(isoFromDate(d));
    d.setDate(d.getDate() + 1);
    safety += 1;
  }
  return datas.length ? datas : [ini].filter(Boolean);
}

function buildDateOptions(selected = '') {
  const datas = getPlantaoDatesInRange();
  const value = selected || datas[0] || nextWeekendBase();
  return datas.map((iso) => `<option value="${esc(iso)}" ${iso === value ? 'selected' : ''}>${esc(weekdayBR(iso))} · ${esc(formatDateBR(iso))}</option>`).join('');
}

function getHorarioPadrao() {
  return {
    hora_inicio: document.getElementById('plantaoPadraoInicio1')?.value || '08:00',
    hora_fim: document.getElementById('plantaoPadraoFim1')?.value || '12:00',
    hora_inicio_2: document.getElementById('plantaoPadraoInicio2')?.value || '13:30',
    hora_fim_2: document.getElementById('plantaoPadraoFim2')?.value || '18:00',
  };
}

function applyHorarioPadraoToForms() {
  const horario = getHorarioPadrao();
  document.querySelectorAll('.plantao-setor').forEach((section) => {
    Object.entries(horario).forEach(([field, value]) => {
      const input = section.querySelector(`[data-field="${field}"]`);
      if (input) input.value = value || '';
    });
  });
}

function formatPhone(value) {
  const d = onlyDigits(value);
  if (!d) return '';
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return value || '';
}

function formatTime(time) {
  if (!time) return '';
  return String(time).slice(0, 5).replace(':', ':') + 'h';
}

function buildHorario(row) {
  const parts = [];
  if (row.hora_inicio && row.hora_fim) parts.push(`${formatTime(row.hora_inicio)} às ${formatTime(row.hora_fim)}`);
  if (row.hora_inicio_2 && row.hora_fim_2) parts.push(`${formatTime(row.hora_inicio_2)} às ${formatTime(row.hora_fim_2)}`);
  return parts.join(' | ');
}

function getPersonDisplayName(person) {
  const apelido = String(person?.apelido || '').trim();
  return apelido || person?.nome || '';
}

function getPersonDateLabel(person) {
  const data = person?.data_plantao || '';
  if (!data) return '';
  return `${weekdayBR(data)} • ${formatDateBR(data)}`;
}

function shouldShowPersonDates(pessoas) {
  const dates = [...new Set((pessoas || []).map((p) => p?.data_plantao).filter(Boolean))];
  return dates.length > 1;
}


function getSavedExtraSetores() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
  } catch {
    return [];
  }
}

function saveExtraSetores(extra) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(extra));
  } catch {}
}

function injectPlantaoStyles() {
  if (document.getElementById('plantaoStyles')) return;
  const style = document.createElement('style');
  style.id = 'plantaoStyles';
  style.textContent = `
    @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=DM+Mono:wght@400;500&display=swap');

    /* === PLANTÃO === */
    .plantao-page{display:grid;gap:20px;font-family:'Plus Jakarta Sans',system-ui,sans-serif}

    /* KPIs */
    .plantao-mini-kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}
    .plantao-mini-kpi{background:#111820;border:1px solid rgba(255,255,255,.06);border-radius:16px;padding:16px 18px;transition:border-color .2s}
    .plantao-mini-kpi:hover{border-color:rgba(34,197,94,.2)}
    .plantao-mini-kpi .kpi-label{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#4b5563;display:block;margin-bottom:6px}
    .plantao-mini-kpi b{display:block;font-size:30px;font-weight:800;color:#e6edf3;line-height:1;font-family:'DM Mono',monospace}
    .plantao-mini-kpi .kpi-sub{font-size:11px;color:#4b5563;margin-top:5px;display:block}

    /* Tabs */
    .plantao-tabs{display:flex;gap:3px;padding:4px;background:#0b1117;border:1px solid rgba(255,255,255,.06);border-radius:16px;overflow-x:auto;scrollbar-width:none}
    .plantao-tabs::-webkit-scrollbar{display:none}
    .plantao-tab{flex:1;min-width:max-content;border:none;background:transparent;color:#6b7280;border-radius:12px;padding:10px 18px;font-weight:600;font-size:13px;cursor:pointer;transition:all .15s ease;font-family:'Plus Jakarta Sans',sans-serif;white-space:nowrap}
    .plantao-tab:hover{color:#d1d5db;background:rgba(255,255,255,.04)}
    .plantao-tab.active{background:#1a2332;color:#34d399;box-shadow:0 1px 6px rgba(0,0,0,.4)}

    /* Panels */
    .plantao-panel{display:none}
    .plantao-panel.active{display:grid;gap:16px}

    /* Cards */
    .plantao-card{background:#111820;border:1px solid rgba(255,255,255,.06);border-radius:18px;padding:20px}
    .plantao-card-title{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.12em;color:#4b5563;margin:0 0 16px;display:flex;align-items:center;gap:8px}
    .plantao-card-title::before{content:'';width:5px;height:5px;background:#22c55e;border-radius:50%;display:inline-block;box-shadow:0 0 8px rgba(34,197,94,.7)}

    /* Form */
    .plantao-config-grid,.plantao-grid{display:grid;grid-template-columns:repeat(12,1fr);gap:12px;align-items:end}
    .plantao-field{grid-column:span 12}
    .plantao-field.third{grid-column:span 4}
    .plantao-field.half{grid-column:span 6}
    .plantao-field.quarter{grid-column:span 3}
    .plantao-label{display:block;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#6b7280;margin-bottom:6px}
    .plantao-opt{font-weight:400;text-transform:none;letter-spacing:0;font-size:10px;color:#4b5563}
    .plantao-input,.plantao-select,.plantao-textarea{width:100%;background:#0b1117;color:#e6edf3;border:1px solid rgba(255,255,255,.07);border-radius:10px;padding:10px 12px;outline:none;font-size:14px;font-family:'Plus Jakarta Sans',sans-serif;transition:border-color .15s,box-shadow .15s;box-sizing:border-box}
    .plantao-input:focus,.plantao-select:focus,.plantao-textarea:focus{border-color:rgba(34,197,94,.5);box-shadow:0 0 0 3px rgba(34,197,94,.08)}
    .plantao-input[type=time],.plantao-input[type=date]{font-family:'DM Mono',monospace;font-size:13px}
    .plantao-textarea{min-height:72px;resize:vertical}

    /* Horário padrão inline */
    .plantao-horario-padrao{display:flex;align-items:center;gap:8px;flex-wrap:wrap;background:rgba(34,197,94,.04);border:1px solid rgba(34,197,94,.1);border-radius:12px;padding:12px 14px;margin-top:12px}
    .plantao-horario-padrao-label{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.09em;color:#34d399;white-space:nowrap;margin-right:4px}
    .plantao-horario-padrao .plantao-input[type=time]{max-width:110px;padding:8px 10px}
    .plantao-horario-padrao .sep{color:#4b5563;font-size:12px;font-weight:600;white-space:nowrap}

    /* Divider */
    .plantao-divider{height:1px;background:rgba(255,255,255,.05);margin:16px 0}

    /* Buttons */
    .plantao-actions{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
    .plantao-btn{border:none;border-radius:10px;padding:10px 16px;font-weight:700;font-size:13px;cursor:pointer;transition:all .15s ease;font-family:'Plus Jakarta Sans',sans-serif;white-space:nowrap;display:inline-flex;align-items:center;gap:6px}
    .plantao-btn.primary{background:#16a34a;color:#fff}
    .plantao-btn.primary:hover{background:#15803d;transform:translateY(-1px);box-shadow:0 4px 14px rgba(22,163,74,.3)}
    .plantao-btn.secondary{background:rgba(255,255,255,.05);color:#c9d1d9;border:1px solid rgba(255,255,255,.08)}
    .plantao-btn.secondary:hover{background:rgba(255,255,255,.09);color:#e6edf3}
    .plantao-btn.danger{background:rgba(239,68,68,.1);color:#f87171;border:1px solid rgba(239,68,68,.2)}
    .plantao-btn.danger:hover{background:rgba(239,68,68,.18)}
    .plantao-btn.sm{padding:7px 12px;font-size:12px}
    .plantao-btn:disabled{opacity:.4;cursor:not-allowed;transform:none!important;box-shadow:none!important}

    /* Feedback */
    .plantao-feedback{font-size:13px;color:#4ade80;line-height:1.5;padding-top:8px}
    .plantao-feedback.error{color:#f87171}
    .plantao-feedback:empty{display:none}

    /* Sector nav */
    .plantao-sector-nav{display:flex;gap:8px;flex-wrap:wrap}
    .plantao-sector-btn{display:inline-flex;align-items:center;gap:8px;border:1px solid rgba(255,255,255,.06);background:#0b1117;color:#9ca3af;border-radius:999px;padding:8px 14px 8px 12px;font-weight:600;font-size:13px;cursor:pointer;transition:all .15s ease;font-family:'Plus Jakarta Sans',sans-serif}
    .plantao-sector-btn:hover{border-color:rgba(34,197,94,.2);color:#d1d5db}
    .plantao-sector-btn.active{background:rgba(34,197,94,.1);color:#34d399;border-color:rgba(34,197,94,.32)}
    .plantao-sector-count{background:rgba(255,255,255,.07);color:#6b7280;border-radius:999px;padding:2px 8px;font-size:11px;font-weight:700;font-family:'DM Mono',monospace;min-width:22px;text-align:center;transition:all .15s}
    .plantao-sector-btn.active .plantao-sector-count,.plantao-sector-btn.has-people .plantao-sector-count{background:rgba(34,197,94,.15);color:#4ade80}

    /* Setor section */
    .plantao-setor{display:grid;gap:14px;margin-top:14px}
    .plantao-setor-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px}
    .plantao-setor-head h3{margin:0;font-size:17px;font-weight:800;color:#e6edf3;display:flex;align-items:center;gap:10px}
    .plantao-setor-head h3::before{content:'';width:3px;height:20px;background:#22c55e;border-radius:2px;display:inline-block}
    .plantao-hint{font-size:12px;color:#4b5563;margin:4px 0 0}

    /* Add form */
    .plantao-add-area{background:#0b1117;border:1px solid rgba(255,255,255,.06);border-radius:14px;padding:14px}
    .plantao-add-area-title{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.09em;color:#4b5563;margin:0 0 12px}
    .plantao-add-row1{display:grid;grid-template-columns:1.8fr 1fr;gap:10px;margin-bottom:10px}
    .plantao-add-times{display:grid;grid-template-columns:repeat(4,1fr) auto;gap:10px;align-items:end}
    .plantao-add-row3{display:grid;grid-template-columns:1.5fr 1fr;gap:10px;margin-top:10px}

    /* Divulgação cards (dois canvases) */
    .plantao-div-grid{display:grid;gap:16px;margin-top:4px}
    .plantao-div-card{background:#111820;border:1px solid rgba(255,255,255,.06);border-radius:18px;padding:20px}
    .plantao-div-head{display:flex;justify-content:space-between;align-items:center;padding-bottom:14px;margin-bottom:16px;border-bottom:1px solid rgba(255,255,255,.06)}
    .plantao-div-label{display:flex;align-items:center;gap:10px}
    .plantao-div-num{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:8px;background:rgba(34,197,94,.12);border:1px solid rgba(34,197,94,.24);color:#4ade80;font-size:12px;font-weight:700;letter-spacing:.04em;flex-shrink:0}
    .plantao-div-title{font-size:15px;font-weight:700;color:#e6edf3}
    .plantao-div-sub{font-size:12px;color:#6b7280;margin-top:2px}
    .plantao-canvas-img{display:block;max-width:100%;border:1px solid rgba(255,255,255,.06);border-radius:14px}

    /* Suggestions */
    .plantao-suggest-wrap{position:relative}
    .plantao-suggestions{position:absolute;top:calc(100% + 4px);left:0;right:0;background:#1a2332;border:1px solid rgba(34,197,94,.2);border-radius:12px;box-shadow:0 16px 40px rgba(0,0,0,.6);z-index:30;max-height:240px;overflow:auto;display:none}
    .plantao-suggestions.show{display:block}
    .plantao-suggestion{width:100%;display:block;text-align:left;border:none;background:transparent;color:#e6edf3;padding:10px 14px;cursor:pointer;border-bottom:1px solid rgba(255,255,255,.04);font-family:'Plus Jakarta Sans',sans-serif;font-size:13px;transition:background .1s}
    .plantao-suggestion:last-child{border-bottom:none}
    .plantao-suggestion:hover{background:rgba(34,197,94,.08)}
    .plantao-suggestion strong{color:#e6edf3;font-weight:700}
    .plantao-suggestion small{display:block;color:#6b7280;margin-top:2px;font-size:11px}

    /* Person list */
    .plantao-person-list{display:grid;gap:8px}
    .plantao-person{display:grid;grid-template-columns:1fr auto auto auto;gap:14px;align-items:center;background:#0b1117;border:1px solid rgba(255,255,255,.05);border-radius:12px;padding:12px 14px;transition:border-color .15s}
    .plantao-person:hover{border-color:rgba(255,255,255,.1)}
    .plantao-person-name{font-size:14px;font-weight:700;color:#e6edf3;margin-bottom:3px}
    .plantao-person-meta{font-size:11px;color:#6b7280}
    .plantao-person-col{font-size:12px;color:#6b7280}
    .plantao-person-col strong{display:block;font-size:13px;color:#c9d1d9;font-family:'DM Mono',monospace;font-weight:500}

    /* Date pill */
    .plantao-date-pill{display:inline-flex;align-items:center;gap:4px;border:1px solid rgba(34,197,94,.16);background:rgba(34,197,94,.07);color:#4ade80;border-radius:999px;padding:3px 9px;font-size:10px;font-weight:700;font-family:'DM Mono',monospace;margin-bottom:4px}

    /* Muted */
    .plantao-meta{font-size:13px;color:#6b7280;line-height:1.55}

    /* Tables */
    .plantao-table-wrap{overflow:auto;border:1px solid rgba(255,255,255,.05);border-radius:14px;margin-top:14px}
    .plantao-table{width:100%;min-width:780px;border-collapse:collapse}
    .plantao-table th{padding:10px 14px;color:#4b5563;font-size:10px;text-transform:uppercase;letter-spacing:.09em;font-weight:700;text-align:left;border-bottom:1px solid rgba(255,255,255,.05);background:#0b1117}
    .plantao-table td{padding:12px 14px;font-size:13px;color:#c9d1d9;border-bottom:1px solid rgba(255,255,255,.04);vertical-align:middle}
    .plantao-table tr:last-child td{border-bottom:none}
    .plantao-table tr:hover td{background:rgba(255,255,255,.02)}

    /* Radio */
    .plantao-radio-row{display:flex;gap:8px;flex-wrap:wrap}
    .plantao-radio-row label{display:inline-flex;gap:8px;align-items:center;background:#0b1117;border:1px solid rgba(255,255,255,.07);border-radius:8px;padding:8px 12px;color:#c9d1d9;font-size:13px;font-weight:500;cursor:pointer;transition:all .15s}
    .plantao-radio-row label:hover{border-color:rgba(34,197,94,.2)}

    /* Consulta */
    .plantao-consulta-list{display:grid;gap:10px}
    .plantao-consulta-item{display:grid;grid-template-columns:1fr auto;gap:16px;align-items:center;border:1px solid rgba(255,255,255,.05);background:#0b1117;border-radius:14px;padding:14px 16px;transition:border-color .15s}
    .plantao-consulta-item:hover{border-color:rgba(34,197,94,.15)}
    .plantao-consulta-title{display:flex;gap:8px;align-items:center;flex-wrap:wrap;font-weight:700;font-size:14px;color:#e6edf3;margin-bottom:4px}
    .plantao-consulta-tags{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}
    .plantao-tag{display:inline-flex;border:1px solid rgba(255,255,255,.05);background:rgba(255,255,255,.03);border-radius:6px;padding:3px 8px;color:#6b7280;font-size:11px;font-weight:600}

    /* Canvas */
    .plantao-canvas-wrap{display:grid;gap:12px;justify-items:start}
    #plantaoCanvas{max-width:100%;border:1px solid rgba(255,255,255,.06);border-radius:14px}

    /* Empty state */
    .plantao-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;padding:32px 20px;color:#4b5563;font-size:13px;text-align:center}

    /* New setor row */
    .plantao-new-setor-row{display:flex;gap:8px;align-items:center}
    .plantao-new-setor-row .plantao-input{max-width:190px}

    @media(max-width:960px){
      .plantao-field.third,.plantao-field.half,.plantao-field.quarter{grid-column:span 12}
      .plantao-mini-kpis{grid-template-columns:1fr 1fr}
      .plantao-add-times{grid-template-columns:1fr 1fr}
      .plantao-add-row1{grid-template-columns:1fr}
      .plantao-person{grid-template-columns:1fr auto}
    }
    @media(max-width:600px){
      .plantao-consulta-item{grid-template-columns:1fr}
      .plantao-add-times{grid-template-columns:1fr 1fr}
      .plantao-tabs{gap:2px}
      .plantao-tab{padding:9px 12px;font-size:12px}
    }
  `;
  document.head.appendChild(style);
}

async function loadSetores() {
  const extra = getSavedExtraSetores();
  setores = [...new Set([...DEFAULT_SETORES, ...extra])];

  const { data, error } = await supabase
    .from('rh_plantao_setores')
    .select('nome,ativo,ordem')
    .eq('ativo', true)
    .order('ordem', { ascending: true })
    .order('nome', { ascending: true });

  if (!error && Array.isArray(data) && data.length) {
    setores = [...new Set([...data.map((r) => r.nome).filter(Boolean), ...extra])];
  }
}

async function loadColaboradores() {
  const pageSize = 1000;
  let from = 0;
  const allRows = [];

  while (true) {
    let query = supabase
      .from('colaboradores')
      .select('cpf,nome,situacao,empresa,coordenacao,supervisao,cargo,email_empresa,email_pessoal,whatsapp,tipo')
      .eq('situacao', 'Ativo')
      .order('nome', { ascending: true })
      .range(from, from + pageSize - 1);

    const { data, error } = await query;
    if (error) throw error;

    const rows = data || [];
    allRows.push(...rows);
    if (rows.length < pageSize) break;
    from += pageSize;

    if (from > 20000) break;
  }

  const unique = new Map();
  allRows.forEach((r) => {
    const key = collaboratorKey(r);
    if (!key) return;
    unique.set(key, {
      ...r,
      key,
      telefone_base: r.whatsapp || '',
      email_base: r.email_empresa || r.email_pessoal || '',
    });
  });

  colaboradores = Array.from(unique.values()).sort((a, b) => String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR'));
}

async function loadContatos() {
  const { data, error } = await supabase
    .from('rh_plantao_contatos')
    .select('*')
    .order('nome', { ascending: true });

  contatosMap = new Map();
  if (!error && Array.isArray(data)) {
    data.forEach((row) => contatosMap.set(row.colaborador_key, row));
  }
}

function getContactForKey(key, baseRow = null) {
  const saved = contatosMap.get(key);
  return {
    telefone: saved?.telefone || baseRow?.telefone_base || baseRow?.whatsapp || '',
    email: saved?.email_corporativo || baseRow?.email_base || baseRow?.email_empresa || baseRow?.email_pessoal || '',
    setor_preferencial: saved?.setor_preferencial || '',
  };
}

function buildEmptyEscala() {
  escala = {};
  setores.forEach((setor) => {
    escala[setor] = [];
  });
}

function addEscalaRow(setor, row) {
  if (!escala[setor]) escala[setor] = [];
  const key = row.colaborador_key || collaboratorKey(row);
  escala[setor].push({
    uid: row.id || `${Date.now()}_${Math.random().toString(16).slice(2)}`,
    id: row.id || null,
    data_plantao: row.data_plantao || document.getElementById('plantaoData')?.value || nextWeekendBase(),
    evento: row.evento || document.getElementById('plantaoEvento')?.value || '',
    setor,
    colaborador_key: key,
    cpf: row.cpf || '',
    nome: row.nome || '',
    apelido: row.apelido || '',
    telefone: row.telefone || '',
    email_corporativo: row.email_corporativo || '',
    hora_inicio: row.hora_inicio || '',
    hora_fim: row.hora_fim || '',
    hora_inicio_2: row.hora_inicio_2 || '',
    hora_fim_2: row.hora_fim_2 || '',
    observacoes: row.observacoes || '',
  });
}

function getAllEscalaRows() {
  const rows = [];
  Object.entries(escala).forEach(([setor, pessoas]) => {
    pessoas.forEach((p, idx) => rows.push({ ...p, setor, ordem: idx + 1 }));
  });
  return rows;
}

function getSavedModeloLocal() {
  try {
    const parsed = JSON.parse(localStorage.getItem(TEMPLATE_STORAGE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveModeloLocal(rows) {
  try {
    localStorage.setItem(TEMPLATE_STORAGE_KEY, JSON.stringify(rows || []));
  } catch {}
}

async function loadModeloPlantao() {
  modeloPlantao = getSavedModeloLocal();

  const { data, error } = await supabase
    .from('rh_plantao_modelos')
    .select('*')
    .eq('nome_modelo', 'Padrão')
    .order('setor', { ascending: true })
    .order('ordem', { ascending: true });

  if (!error && Array.isArray(data) && data.length) {
    modeloPlantao = data.map((row) => ({
      setor: row.setor,
      colaborador_key: row.colaborador_key,
      cpf: row.cpf || '',
      nome: row.nome || '',
      apelido: row.apelido || '',
      telefone: row.telefone || '',
      email_corporativo: row.email_corporativo || '',
      hora_inicio: row.hora_inicio || '',
      hora_fim: row.hora_fim || '',
      hora_inicio_2: row.hora_inicio_2 || '',
      hora_fim_2: row.hora_fim_2 || '',
      dias_semana: Array.isArray(row.dias_semana) && row.dias_semana.length ? row.dias_semana : [6, 0],
      ordem: row.ordem || 1,
    }));
    saveModeloLocal(modeloPlantao);
  }
}

async function salvarModeloPlantao() {
  const feedback = document.getElementById('plantaoProgramacaoFeedback');
  const rows = getAllEscalaRows()
    .filter((r) => r.nome && r.hora_inicio && r.hora_fim)
    .map((r, idx) => ({
      setor: r.setor,
      colaborador_key: r.colaborador_key || collaboratorKey(r),
      cpf: r.cpf || '',
      nome: r.nome,
      apelido: r.apelido || '',
      telefone: r.telefone || '',
      email_corporativo: r.email_corporativo || '',
      hora_inicio: r.hora_inicio || '',
      hora_fim: r.hora_fim || '',
      hora_inicio_2: r.hora_inicio_2 || '',
      hora_fim_2: r.hora_fim_2 || '',
      dias_semana: [6, 0],
      ordem: idx + 1,
    }));

  if (!rows.length) {
    alert('Monte pelo menos uma escala com horário antes de salvar como modelo.');
    return;
  }

  modeloPlantao = rows;
  saveModeloLocal(rows);
  renderModeloTable();

  if (feedback) {
    feedback.classList.remove('error');
    feedback.textContent = 'Modelo local salvo. Salvando também no Supabase...';
  }

  try {
    const { error: delError } = await supabase
      .from('rh_plantao_modelos')
      .delete()
      .eq('nome_modelo', 'Padrão');
    if (delError) throw delError;

    const payload = rows.map((r) => ({
      nome_modelo: 'Padrão',
      setor: r.setor,
      colaborador_key: r.colaborador_key,
      cpf: r.cpf || null,
      nome: r.nome,
      apelido: r.apelido || null,
      telefone: r.telefone || null,
      email_corporativo: r.email_corporativo || null,
      hora_inicio: r.hora_inicio || null,
      hora_fim: r.hora_fim || null,
      hora_inicio_2: r.hora_inicio_2 || null,
      hora_fim_2: r.hora_fim_2 || null,
      dias_semana: r.dias_semana || [6, 0],
      ordem: r.ordem || 1,
      created_by: currentUserContext?.user?.id || null,
      updated_at: new Date().toISOString(),
    }));

    const { error: insertError } = await supabase
      .from('rh_plantao_modelos')
      .insert(payload);
    if (insertError) throw insertError;

    if (feedback) feedback.textContent = `Modelo padrão salvo com ${rows.length} linha(s).`;
  } catch (err) {
    console.warn('Modelo salvo localmente, mas não foi possível salvar no banco:', err);
    if (feedback) {
      feedback.classList.add('error');
      feedback.textContent = `Modelo salvo no navegador, mas o banco retornou erro: ${err.message || err}. Confira se a migration nova foi executada.`;
    }
  }
}

function getDiasSelecionadosProgramacao() {
  const dias = [];
  if (document.getElementById('progSabado')?.checked) dias.push(6);
  if (document.getElementById('progDomingo')?.checked) dias.push(0);
  if (document.getElementById('progSexta')?.checked) dias.push(5);
  return dias.length ? dias : [6, 0];
}

function getDatasProgramadas() {
  const inicio = dateFromISO(document.getElementById('progDataInicial')?.value || nextWeekendBase());
  const semanas = Math.max(1, Math.min(52, Number(document.getElementById('progSemanas')?.value || 1)));
  const dias = getDiasSelecionadosProgramacao();
  const datas = [];
  if (!inicio) return datas;

  const base = new Date(inicio);
  const currentDay = base.getDay();
  const firstSaturday = new Date(base);
  firstSaturday.setDate(base.getDate() + ((6 - currentDay + 7) % 7));

  for (let w = 0; w < semanas; w++) {
    dias.forEach((dia) => {
      const d = new Date(firstSaturday);
      const offset = dia === 0 ? 1 : dia - 6;
      d.setDate(firstSaturday.getDate() + (w * 7) + offset);
      datas.push(isoFromDate(d));
    });
  }

  return [...new Set(datas)].sort();
}

function aplicarModeloNaEscala() {
  const feedback = document.getElementById('plantaoProgramacaoFeedback');
  if (!modeloPlantao.length) {
    alert('Salve ou carregue um modelo antes de gerar a programação.');
    return;
  }

  const datas = getDatasProgramadas();
  if (!datas.length) {
    alert('Informe uma data inicial válida.');
    return;
  }

  const modo = document.querySelector('input[name="progModo"]:checked')?.value || 'substituir';
  const evento = document.getElementById('progEvento')?.value?.trim() || document.getElementById('plantaoEvento')?.value?.trim() || 'Plantão programado';

  if (modo === 'substituir') buildEmptyEscala();

  datas.forEach((dataPlantao) => {
    modeloPlantao.forEach((m) => {
      if (!setores.includes(m.setor)) {
        setores.push(m.setor);
        if (!escala[m.setor]) escala[m.setor] = [];
      }
      addEscalaRow(m.setor, {
        ...m,
        data_plantao: dataPlantao,
        evento,
      });
    });
  });

  document.getElementById('plantaoData').value = datas[0];
  document.getElementById('plantaoDataFim').value = datas[datas.length - 1];
  document.getElementById('plantaoEvento').value = evento;
  document.getElementById('plantaoImgData').value = datas[0];
  document.getElementById('plantaoImgDataFim').value = datas[datas.length - 1];

  renderSetores();
  updateKpis();
  if (feedback) {
    feedback.classList.remove('error');
    feedback.textContent = `Programação gerada: ${datas.length} data(s), ${modeloPlantao.length} linha(s) por data. Clique em “Salvar plantão” para gravar no banco.`;
  }
}

async function carregarModeloPadrao() {
  const feedback = document.getElementById('plantaoProgramacaoFeedback');
  if (feedback) {
    feedback.classList.remove('error');
    feedback.textContent = 'Carregando modelo padrão...';
  }
  await loadModeloPlantao();
  renderModeloTable();
  if (feedback) feedback.textContent = modeloPlantao.length ? `Modelo carregado com ${modeloPlantao.length} linha(s).` : 'Nenhum modelo salvo ainda. Monte uma escala e clique em “Salvar escala atual como modelo”.';
}

function renderModeloTable() {
  const tbody = document.getElementById('plantaoModeloBody');
  if (!tbody) return;
  tbody.innerHTML = modeloPlantao.length ? modeloPlantao.map((row, idx) => `
    <tr>
      <td>${esc(row.setor)}</td>
      <td><strong>${esc(row.nome)}</strong><div class="plantao-meta">${esc(row.cpf || row.colaborador_key || '')}</div></td>
      <td>${esc(formatPhone(row.telefone) || '-')}</td>
      <td>${esc(row.email_corporativo || '-')}</td>
      <td>${esc(buildHorario(row) || '-')}</td>
      <td><button type="button" class="plantao-btn danger" data-remove-modelo="${idx}">Remover</button></td>
    </tr>
  `).join('') : '<tr><td colspan="6">Nenhum modelo salvo. Monte um final de semana na aba Escala e salve como modelo.</td></tr>';

  tbody.querySelectorAll('[data-remove-modelo]').forEach((btn) => {
    btn.addEventListener('click', () => {
      modeloPlantao.splice(Number(btn.dataset.removeModelo), 1);
      saveModeloLocal(modeloPlantao);
      renderModeloTable();
    });
  });
}

async function loadEscalaFromDb() {
  const dataIni = document.getElementById('plantaoData')?.value || nextWeekendBase();
  const dataFim = document.getElementById('plantaoDataFim')?.value || addDaysISO(dataIni, 1);

  buildEmptyEscala();

  const { data, error } = await supabase
    .from('rh_plantao_escalas')
    .select('*')
    .gte('data_plantao', dataIni)
    .lte('data_plantao', dataFim)
    .order('data_plantao', { ascending: true })
    .order('setor', { ascending: true })
    .order('ordem', { ascending: true });

  if (error) throw error;

  (data || []).forEach((row) => {
    if (!setores.includes(row.setor)) {
      setores.push(row.setor);
      if (!escala[row.setor]) escala[row.setor] = [];
    }
    addEscalaRow(row.setor, row);
  });

  renderSetores();
  updateKpis();
  const feedback = document.getElementById('plantaoFeedback');
  if (feedback) feedback.textContent = `${data?.length || 0} plantonista(s) carregado(s).`;
}

async function loadEscalaSingleDate(dataPlantao) {
  if (!dataPlantao) return;
  const ini = document.getElementById('plantaoData');
  const fim = document.getElementById('plantaoDataFim');
  const imgIni = document.getElementById('plantaoImgData');
  const imgFim = document.getElementById('plantaoImgDataFim');
  if (ini) ini.value = dataPlantao;
  if (fim) fim.value = dataPlantao;
  if (imgIni) imgIni.value = dataPlantao;
  if (imgFim) imgFim.value = dataPlantao;
  await loadEscalaFromDb();
  switchTab('escala');
}

async function abrirImagemSingleDate(dataPlantao) {
  if (!dataPlantao) return;
  const imgIni = document.getElementById('plantaoImgData');
  const imgFim = document.getElementById('plantaoImgDataFim');
  if (imgIni) imgIni.value = dataPlantao;
  if (imgFim) imgFim.value = dataPlantao;
  await loadEscalaSingleDate(dataPlantao);
  switchTab('divulgacao');
}

function aggregateEscalasByDate(rows) {
  const map = new Map();
  (rows || []).forEach((row) => {
    const key = row.data_plantao;
    if (!map.has(key)) {
      map.set(key, {
        data_plantao: key,
        eventos: new Set(),
        setores: new Set(),
        total: 0,
        nomes: [],
      });
    }
    const item = map.get(key);
    item.total += 1;
    if (row.evento) item.eventos.add(row.evento);
    if (row.setor) item.setores.add(row.setor);
    if (row.nome && item.nomes.length < 8) item.nomes.push(row.nome);
  });

  return Array.from(map.values())
    .sort((a, b) => String(a.data_plantao).localeCompare(String(b.data_plantao)))
    .map((item) => ({
      ...item,
      eventos: Array.from(item.eventos),
      setores: Array.from(item.setores).sort((a, b) => a.localeCompare(b, 'pt-BR')),
    }));
}

async function consultarDatasPlantao() {
  const holder = document.getElementById('plantaoConsultaLista');
  const feedback = document.getElementById('plantaoConsultaFeedback');
  if (!holder) return;

  const dataIni = document.getElementById('consultaDataIni')?.value || todayISO();
  const dataFim = document.getElementById('consultaDataFim')?.value || addDaysISO(dataIni, 45);
  const setor = document.getElementById('consultaSetor')?.value || 'todos';
  const busca = norm(document.getElementById('consultaBusca')?.value || '');

  holder.innerHTML = '';
  if (feedback) {
    feedback.classList.remove('error');
    feedback.textContent = 'Consultando plantões salvos...';
  }

  try {
    let query = supabase
      .from('rh_plantao_escalas')
      .select('id,data_plantao,evento,setor,nome,colaborador_key,hora_inicio,hora_fim')
      .gte('data_plantao', dataIni)
      .lte('data_plantao', dataFim)
      .order('data_plantao', { ascending: true })
      .order('setor', { ascending: true })
      .order('ordem', { ascending: true });

    if (setor !== 'todos') query = query.eq('setor', setor);

    const { data, error } = await query;
    if (error) throw error;

    const filtered = busca
      ? (data || []).filter((r) => norm(`${r.data_plantao} ${r.evento} ${r.setor} ${r.nome}`).includes(busca))
      : (data || []);

    const grouped = aggregateEscalasByDate(filtered);

    if (!grouped.length) {
      holder.innerHTML = '<div class="plantao-meta">Nenhum plantão salvo encontrado para os filtros informados.</div>';
      if (feedback) feedback.textContent = '0 data(s) localizada(s).';
      return;
    }

    holder.innerHTML = grouped.map((item) => `
      <article class="plantao-consulta-item">
        <div>
          <div class="plantao-consulta-title">
            <span class="plantao-date-pill">${esc(weekdayBR(item.data_plantao))} · ${esc(formatDateBR(item.data_plantao))}</span>
            <span>${esc(item.eventos[0] || 'Plantão')}</span>
          </div>
          <div class="plantao-meta">${item.total} plantonista(s) · ${item.setores.length} setor(es)</div>
          <div class="plantao-consulta-tags">
            ${item.setores.slice(0, 8).map((s) => `<span class="plantao-tag">${esc(s)}</span>`).join('')}
            ${item.setores.length > 8 ? `<span class="plantao-tag">+${item.setores.length - 8}</span>` : ''}
          </div>
          <div class="plantao-meta" style="margin-top:8px;">${esc(item.nomes.join(', ') || '-')}</div>
        </div>
        <div class="plantao-actions" style="justify-content:flex-end;">
          <button type="button" class="plantao-btn secondary" data-consulta-carregar="${esc(item.data_plantao)}">Carregar</button>
          <button type="button" class="plantao-btn primary" data-consulta-imagem="${esc(item.data_plantao)}">Imagem</button>
        </div>
      </article>
    `).join('');

    holder.querySelectorAll('[data-consulta-carregar]').forEach((btn) => {
      btn.addEventListener('click', () => loadEscalaSingleDate(btn.dataset.consultaCarregar).catch(showLoadError));
    });
    holder.querySelectorAll('[data-consulta-imagem]').forEach((btn) => {
      btn.addEventListener('click', () => abrirImagemSingleDate(btn.dataset.consultaImagem).catch(showLoadError));
    });

    if (feedback) feedback.textContent = `${grouped.length} data(s) localizada(s), com ${filtered.length} plantonista(s).`;
  } catch (err) {
    console.error(err);
    if (feedback) {
      feedback.classList.add('error');
      feedback.textContent = `Erro ao consultar datas: ${err.message || err}`;
    }
  }
}

function renderKpis() {
  return `
    <div class="plantao-mini-kpis">
      <div class="plantao-mini-kpi">
        <span class="kpi-label">Setores</span>
        <b id="kpiSetores">${setores.length}</b>
      </div>
      <div class="plantao-mini-kpi">
        <span class="kpi-label">Plantonistas</span>
        <b id="kpiPessoas">0</b>
      </div>
      <div class="plantao-mini-kpi">
        <span class="kpi-label">Período</span>
        <b id="kpiPeriodo" style="font-size:15px;font-family:'Plus Jakarta Sans',sans-serif;font-weight:700;line-height:1.2;margin-top:4px">—</b>
      </div>
      <div class="plantao-mini-kpi">
        <span class="kpi-label">Contatos</span>
        <b id="kpiContatos">${contatosMap.size}</b>
      </div>
    </div>
  `;
}

function updateKpis() {
  const total = Object.values(escala).reduce((acc, rows) => acc + rows.length, 0);
  const dataIni = document.getElementById('plantaoData')?.value || '';
  const dataFim = document.getElementById('plantaoDataFim')?.value || '';
  const elSetores = document.getElementById('kpiSetores');
  const elPessoas = document.getElementById('kpiPessoas');
  const elPeriodo = document.getElementById('kpiPeriodo');
  const elContatos = document.getElementById('kpiContatos');
  if (elSetores) elSetores.textContent = String(setores.length);
  if (elPessoas) elPessoas.textContent = String(total);
  if (elPeriodo) elPeriodo.textContent = dataIni && dataFim ? `${formatDateBR(dataIni)} a ${formatDateBR(dataFim)}` : '—';
  if (elContatos) elContatos.textContent = String(contatosMap.size);
}

function setupSuggest(input, onSelect) {
  const wrap = input.closest('.plantao-suggest-wrap');
  const box = wrap.querySelector('.plantao-suggestions');

  function render(term) {
    const q = norm(term);
    if (!q || q.length < 2) {
      box.classList.remove('show');
      box.innerHTML = '';
      return;
    }

    const matches = colaboradores
      .filter((c) => norm(`${c.nome} ${c.cpf} ${c.supervisao} ${c.coordenacao}`).includes(q))
      .slice(0, 12);

    box.innerHTML = matches.length
      ? matches.map((c, idx) => `
          <button type="button" class="plantao-suggestion" data-idx="${idx}">
            <strong>${esc(c.nome)}</strong>
            <small>${esc(c.supervisao || c.coordenacao || c.cargo || '')} · ${esc(formatPhone(c.telefone_base) || 'sem telefone')} · ${esc(c.email_base || 'sem e-mail')}</small>
          </button>
        `).join('')
      : '<div class="plantao-suggestion">Nenhum colaborador localizado.</div>';

    box.querySelectorAll('button[data-idx]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const selected = matches[Number(btn.dataset.idx)];
        input.value = selected.nome;
        input.dataset.key = selected.key;
        input.dataset.cpf = selected.cpf || '';
        box.classList.remove('show');
        onSelect(selected);
      });
    });

    box.classList.add('show');
  }

  input.addEventListener('input', () => render(input.value));
  input.addEventListener('focus', () => render(input.value));
  document.addEventListener('click', (ev) => {
    if (!wrap.contains(ev.target)) box.classList.remove('show');
  });
}

function renderSetores() {
  const holder = document.getElementById('plantaoSetores');
  if (!holder) return;

  const setoresOrdenados = [...setores].sort((a, b) => {
    const ia = DEFAULT_SETORES.indexOf(a);
    const ib = DEFAULT_SETORES.indexOf(b);
    if (ia >= 0 && ib >= 0) return ia - ib;
    if (ia >= 0) return -1;
    if (ib >= 0) return 1;
    return a.localeCompare(b, 'pt-BR');
  });

  if (!setoresOrdenados.includes(setorAtivo)) setorAtivo = setoresOrdenados[0] || DEFAULT_SETORES[0];
  if (!escala[setorAtivo]) escala[setorAtivo] = [];

  const navHtml = `
    <div class="plantao-sector-nav" aria-label="Setores do plantão">
      ${setoresOrdenados.map((setor) => {
        const rows = escala[setor] || [];
        const hasP = rows.length > 0;
        return `
          <button type="button" class="plantao-sector-btn ${setor === setorAtivo ? 'active' : ''} ${hasP ? 'has-people' : ''}" data-setor-tab="${esc(setor)}">
            ${esc(setor)}
            <span class="plantao-sector-count">${rows.length}</span>
          </button>
        `;
      }).join('')}
    </div>
  `;

  const setor = setorAtivo;
  const rows = escala[setor] || [];
  holder.innerHTML = navHtml + `
    <section class="plantao-setor" data-setor="${esc(setor)}">
      <div class="plantao-setor-head">
        <div>
          <h3>${esc(setor)}</h3>
          <p class="plantao-hint">Busque o colaborador, defina a data e os horários para adicionar à escala.</p>
        </div>
        ${DEFAULT_SETORES.includes(setor) ? '' : `<button type="button" class="plantao-btn danger sm" data-remove-setor="${esc(setor)}">Remover setor</button>`}
      </div>

      <div class="plantao-add-area">
        <p class="plantao-add-area-title">Adicionar plantonista</p>

        <div class="plantao-add-row1">
          <div class="plantao-suggest-wrap">
            <label class="plantao-label">Colaborador</label>
            <input class="plantao-input plantao-colab-input" data-setor="${esc(setor)}" placeholder="Digite o nome para buscar..." autocomplete="off" />
            <div class="plantao-suggestions"></div>
          </div>
          <div>
            <label class="plantao-label">Data do plantão</label>
            <select class="plantao-select" data-field="data_plantao" data-setor="${esc(setor)}">${buildDateOptions()}</select>
          </div>
        </div>

        <div class="plantao-add-times">
          <div>
            <label class="plantao-label">Entrada 1</label>
            <input class="plantao-input" type="time" data-field="hora_inicio" data-setor="${esc(setor)}" value="${esc(getHorarioPadrao().hora_inicio)}" />
          </div>
          <div>
            <label class="plantao-label">Saída 1</label>
            <input class="plantao-input" type="time" data-field="hora_fim" data-setor="${esc(setor)}" value="${esc(getHorarioPadrao().hora_fim)}" />
          </div>
          <div>
            <label class="plantao-label">Entrada 2 <span class="plantao-opt">(opc.)</span></label>
            <input class="plantao-input" type="time" data-field="hora_inicio_2" data-setor="${esc(setor)}" value="" />
          </div>
          <div>
            <label class="plantao-label">Saída 2 <span class="plantao-opt">(opc.)</span></label>
            <input class="plantao-input" type="time" data-field="hora_fim_2" data-setor="${esc(setor)}" value="" />
          </div>
          <button type="button" class="plantao-btn primary" data-add="${esc(setor)}" style="align-self:end">Adicionar</button>
        </div>

        <div style="margin-top:10px;max-width:360px;">
          <label class="plantao-label">Apelido / nome social <span class="plantao-opt">(exibido na arte — deixe vazio para usar o nome completo)</span></label>
          <input class="plantao-input plantao-apelido-input" data-setor="${esc(setor)}" placeholder="Nome curto para a arte de divulgação" />
        </div>
      </div>

      <div class="plantao-person-list">
        ${rows.length ? rows.map((row, idx) => `
          <div class="plantao-person" data-row="${idx}" data-setor="${esc(setor)}">
            <div>
              <span class="plantao-date-pill">${esc(weekdayBR(row.data_plantao))} · ${esc(formatDateBR(row.data_plantao))}</span>
              <div class="plantao-person-name">${esc(row.apelido || row.nome)}</div>
              ${row.apelido ? `<div class="plantao-person-meta">${esc(row.nome)}</div>` : ''}
              ${(row.cpf || row.colaborador_key) ? `<div class="plantao-person-meta">${esc(row.cpf || row.colaborador_key)}</div>` : ''}
            </div>
            <div class="plantao-person-col">
              <span>Contato</span>
              <strong>${esc(formatPhone(row.telefone) || '—')}</strong>
            </div>
            <div class="plantao-person-col">
              <span>Horário</span>
              <strong>${esc(buildHorario(row) || '—')}</strong>
            </div>
            <button type="button" class="plantao-btn danger sm" data-remove-row="${idx}" data-setor="${esc(setor)}">Remover</button>
          </div>
        `).join('') : `
          <div class="plantao-empty">
            <span style="font-size:28px;opacity:.3">👤</span>
            Nenhum plantonista adicionado.<br>
            <span style="color:#374151">Use o formulário acima para incluir.</span>
          </div>
        `}
      </div>
    </section>
  `;

  holder.querySelectorAll('[data-setor-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      setorAtivo = btn.dataset.setorTab;
      renderSetores();
    });
  });

  holder.querySelectorAll('.plantao-colab-input').forEach((input) => {
    setupSuggest(input, (selected) => {
      const setor = input.dataset.setor;
      const section = input.closest('.plantao-setor');
      const contact = getContactForKey(selected.key, selected);
      section.dataset.selected = JSON.stringify({
        colaborador_key: selected.key,
        cpf: selected.cpf || '',
        nome: selected.nome || '',
        telefone: contact.telefone,
        email_corporativo: contact.email,
      });
    });
  });

  holder.querySelectorAll('[data-add]').forEach((btn) => {
    btn.addEventListener('click', () => addFromSetorForm(btn.dataset.add));
  });

  holder.querySelectorAll('[data-remove-row]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const setor = btn.dataset.setor;
      escala[setor].splice(Number(btn.dataset.removeRow), 1);
      renderSetores();
      updateKpis();
    });
  });

  holder.querySelectorAll('[data-remove-setor]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const setor = btn.dataset.removeSetor;
      setores = setores.filter((s) => s !== setor);
      delete escala[setor];
      saveExtraSetores(setores.filter((s) => !DEFAULT_SETORES.includes(s)));
      renderSetores();
      updateKpis();
    });
  });

  updateKpis();
}

function addFromSetorForm(setor) {
  const section = document.querySelector(`.plantao-setor[data-setor="${CSS.escape(setor)}"]`);
  const input = section.querySelector('.plantao-colab-input');
  let selected = null;

  try {
    selected = JSON.parse(section.dataset.selected || 'null');
  } catch {}

  if (!selected || norm(selected.nome) !== norm(input.value)) {
    const found = colaboradores.find((c) => norm(c.nome) === norm(input.value));
    if (found) {
      const contact = getContactForKey(found.key, found);
      selected = {
        colaborador_key: found.key,
        cpf: found.cpf || '',
        nome: found.nome || '',
        telefone: contact.telefone,
        email_corporativo: contact.email,
      };
    }
  }

  if (!selected?.nome) {
    alert('Selecione um colaborador da lista antes de adicionar.');
    return;
  }

  const getField    = (name) => section.querySelector(`[data-field="${name}"]`)?.value || '';
  const getFieldRaw = (name) => section.querySelector(`[data-field="${name}"]`)?.value ?? '';
  const padrao = getHorarioPadrao();
  const data_plantao  = getField('data_plantao') || document.getElementById('plantaoData').value;
  const hora_inicio   = getField('hora_inicio')  || padrao.hora_inicio;
  const hora_fim      = getField('hora_fim')     || padrao.hora_fim;
  const hora_inicio_2 = getFieldRaw('hora_inicio_2');
  const hora_fim_2    = getFieldRaw('hora_fim_2');
  const apelido       = section.querySelector('.plantao-apelido-input')?.value?.trim() || '';

  if (!data_plantao) {
    alert('Selecione o dia do plantão antes de adicionar.');
    return;
  }

  if (!hora_inicio || !hora_fim) {
    alert('Informe pelo menos o primeiro horário trabalhado.');
    return;
  }

  addEscalaRow(setor, {
    ...selected,
    apelido,
    data_plantao,
    evento: document.getElementById('plantaoEvento').value,
    hora_inicio,
    hora_fim,
    hora_inicio_2,
    hora_fim_2,
  });

  section.dataset.selected = '';
  renderSetores();
}

async function saveEscala() {
  const feedback = document.getElementById('plantaoFeedback');
  const btn = document.getElementById('btnSalvarPlantao');
  const dataIni = document.getElementById('plantaoData').value;
  const dataFim = document.getElementById('plantaoDataFim').value || dataIni;
  const evento = document.getElementById('plantaoEvento').value.trim();
  const observacoes = document.getElementById('plantaoObs').value.trim();

  const rows = [];
  Object.entries(escala).forEach(([setor, pessoas]) => {
    pessoas.forEach((p, idx) => {
      rows.push({
        data_plantao: p.data_plantao || dataIni,
        evento,
        setor,
        colaborador_key: p.colaborador_key || collaboratorKey(p),
        cpf: p.cpf || null,
        nome: p.nome,
        apelido: p.apelido || null,
        telefone: p.telefone || null,
        email_corporativo: p.email_corporativo || null,
        hora_inicio: p.hora_inicio || null,
        hora_fim: p.hora_fim || null,
        hora_inicio_2: p.hora_inicio_2 || null,
        hora_fim_2: p.hora_fim_2 || null,
        observacoes,
        ordem: idx + 1,
        created_by: currentUserContext?.user?.id || null,
        updated_at: new Date().toISOString(),
      });
    });
  });

  if (!rows.length) {
    alert('Adicione pelo menos um plantonista antes de salvar.');
    return;
  }

  btn.disabled = true;
  feedback.classList.remove('error');
  feedback.textContent = 'Salvando escala do plantão...';

  try {
    const { error: delError } = await supabase
      .from('rh_plantao_escalas')
      .delete()
      .gte('data_plantao', dataIni)
      .lte('data_plantao', dataFim);

    if (delError) throw delError;

    const { error: insertError } = await supabase
      .from('rh_plantao_escalas')
      .insert(rows);

    if (insertError) throw insertError;

    feedback.textContent = `Plantão salvo com ${rows.length} plantonista(s), separado por ${new Set(rows.map((r) => r.data_plantao)).size} data(s).`;
    if (document.getElementById('plantaoConsultaLista')) consultarDatasPlantao().catch(() => null);
    await loadEscalaFromDb();
  } catch (err) {
    console.error(err);
    feedback.classList.add('error');
    feedback.textContent = `Erro ao salvar: ${err.message || err}`;
  } finally {
    btn.disabled = false;
  }
}

function renderContatosTable() {
  const tbody = document.getElementById('plantaoContatosBody');
  if (!tbody) return;

  const q = norm(document.getElementById('plantaoContatoBusca')?.value || '');
  const rows = colaboradores
    .filter((c) => !q || norm(`${c.nome} ${c.supervisao} ${c.cpf}`).includes(q))
    .slice(0, 300);

  tbody.innerHTML = rows.map((c) => {
    const contact = getContactForKey(c.key, c);
    return `
      <tr data-key="${esc(c.key)}">
        <td><strong>${esc(c.nome)}</strong><div class="plantao-meta">${esc(c.supervisao || c.coordenacao || '')}</div></td>
        <td>${esc(c.cpf || '')}</td>
        <td><input class="plantao-input" data-contact-field="telefone" value="${esc(contact.telefone)}" /></td>
        <td><input class="plantao-input" data-contact-field="email_corporativo" value="${esc(contact.email)}" /></td>
        <td>
          <select class="plantao-select" data-contact-field="setor_preferencial">
            <option value="">Não definido</option>
            ${setores.map((s) => `<option value="${esc(s)}" ${contact.setor_preferencial === s ? 'selected' : ''}>${esc(s)}</option>`).join('')}
          </select>
        </td>
        <td><button type="button" class="plantao-btn secondary" data-save-contact="${esc(c.key)}">Salvar</button></td>
      </tr>
    `;
  }).join('');

  tbody.querySelectorAll('[data-save-contact]').forEach((btn) => {
    btn.addEventListener('click', () => saveContato(btn.dataset.saveContact));
  });
}

async function saveContato(key) {
  const tr = document.querySelector(`tr[data-key="${CSS.escape(key)}"]`);
  const base = colaboradores.find((c) => c.key === key);
  if (!tr || !base) return;

  const get = (name) => tr.querySelector(`[data-contact-field="${name}"]`)?.value?.trim() || '';
  const payload = {
    colaborador_key: key,
    cpf: base.cpf || null,
    nome: base.nome,
    telefone: get('telefone') || null,
    email_corporativo: get('email_corporativo') || null,
    setor_preferencial: get('setor_preferencial') || null,
    atualizado_por: currentUserContext?.user?.id || null,
    updated_at: new Date().toISOString(),
  };

  const feedback = document.getElementById('plantaoContatosFeedback');
  feedback.textContent = 'Salvando contato...';
  feedback.classList.remove('error');

  try {
    const { error } = await supabase
      .from('rh_plantao_contatos')
      .upsert(payload, { onConflict: 'colaborador_key' });

    if (error) throw error;
    contatosMap.set(key, payload);
    feedback.textContent = `Contato de ${base.nome} salvo.`;
    updateKpis();
  } catch (err) {
    console.error(err);
    feedback.classList.add('error');
    feedback.textContent = `Erro ao salvar contato: ${err.message || err}`;
  }
}

async function addSetor() {
  const input = document.getElementById('plantaoNovoSetor');
  const nome = input.value.trim();
  if (!nome) return;

  if (!setores.some((s) => norm(s) === norm(nome))) {
    setores.push(nome);
    escala[nome] = [];
    saveExtraSetores(setores.filter((s) => !DEFAULT_SETORES.includes(s)));

    await supabase
      .from('rh_plantao_setores')
      .upsert({ nome, ativo: true, ordem: setores.length }, { onConflict: 'nome' })
      .then(() => null);
  }

  input.value = '';
  renderSetores();
  renderContatosTable();
  updateKpis();
}

function drawRoundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}


function drawBackground(ctx, w, h) {
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, '#020c05');
  grad.addColorStop(0.5, '#030e07');
  grad.addColorStop(1, '#051209');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  const glow1 = ctx.createRadialGradient(120, h * 0.45, 0, 120, h * 0.45, 320);
  glow1.addColorStop(0, 'rgba(22,163,74,.2)');
  glow1.addColorStop(1, 'rgba(22,163,74,0)');
  ctx.fillStyle = glow1;
  ctx.fillRect(0, 0, w, h);

  const glow2 = ctx.createRadialGradient(w * 0.8, h * 0.1, 0, w * 0.8, h * 0.1, 280);
  glow2.addColorStop(0, 'rgba(34,197,94,.10)');
  glow2.addColorStop(1, 'rgba(34,197,94,0)');
  ctx.fillStyle = glow2;
  ctx.fillRect(0, 0, w, h);

  ctx.save();
  ctx.globalAlpha = 0.042;
  ctx.strokeStyle = '#6fd0a5';
  ctx.lineWidth = 1.2;
  const sp = 72;
  for (let i = -3; i < Math.ceil((w + h) / sp) + 2; i++) {
    ctx.beginPath();
    ctx.moveTo(i * sp, 0);
    ctx.lineTo(i * sp - h * 0.55, h);
    ctx.stroke();
  }
  ctx.restore();

  ctx.save();
  ctx.globalAlpha = 0.052;
  ctx.strokeStyle = '#6fd0a5';
  ctx.lineWidth = 1;
  const hexR = 26;
  const hexW = hexR * Math.sqrt(3);
  const hexH2 = hexR * 2;
  for (let row = -1; row < Math.ceil(h / (hexH2 * 0.75)) + 2; row++) {
    for (let col = -1; col < Math.ceil(w / hexW) + 2; col++) {
      const hx = col * hexW + (row % 2 === 0 ? 0 : hexW / 2);
      const hy = row * hexH2 * 0.75;
      ctx.beginPath();
      for (let a = 0; a < 6; a++) {
        const ang = Math.PI / 3 * a - Math.PI / 6;
        const px = hx + hexR * Math.cos(ang);
        const py = hy + hexR * Math.sin(ang);
        a === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.stroke();
    }
  }
  ctx.restore();
}

async function drawLogo(ctx, x = 25, y = 25, w = 150, h = 62) {
  try {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = './logo-grao1000.svg';
    await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = reject; });
    ctx.drawImage(img, x, y, w, h);
  } catch {
    ctx.fillStyle = '#6fd0a5';
    ctx.font = 'bold 28px Arial';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('GRÃO 1000', x, y + 6);
    ctx.font = '13px Arial';
    ctx.fillText('Rastreabilidade e Logística', x, y + 40);
  }
}

function drawRoundRectFilled(ctx, x, y, w, h, r, fillStyle, strokeStyle = '', lineWidth = 1) {
  drawRoundRect(ctx, x, y, w, h, r);
  if (fillStyle) { ctx.fillStyle = fillStyle; ctx.fill(); }
  if (strokeStyle) { ctx.strokeStyle = strokeStyle; ctx.lineWidth = lineWidth; ctx.stroke(); }
}

function fitText(ctx, value, maxWidth) {
  let text = String(value || '');
  if (!text) return '';
  if (ctx.measureText(text).width <= maxWidth) return text;
  while (text.length > 4 && ctx.measureText(`${text}…`).width > maxWidth) text = text.slice(0, -1);
  return `${text}…`;
}

function drawCalendarIcon(ctx, cx, cy, s) {
  ctx.save();
  ctx.strokeStyle = '#6fd0a5';
  ctx.lineWidth = 1.6;
  ctx.lineCap = 'round';
  ctx.strokeRect(cx - s * 0.85, cy - s * 0.6, s * 1.7, s * 1.3);
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.85, cy - s * 0.15); ctx.lineTo(cx + s * 0.85, cy - s * 0.15);
  ctx.moveTo(cx - s * 0.28, cy - s * 0.9); ctx.lineTo(cx - s * 0.28, cy - s * 0.28);
  ctx.moveTo(cx + s * 0.28, cy - s * 0.9); ctx.lineTo(cx + s * 0.28, cy - s * 0.28);
  ctx.stroke();
  ctx.restore();
}

function drawPhoneIcon(ctx, cx, cy, s) {
  ctx.save();
  ctx.strokeStyle = '#6fd0a5';
  ctx.lineWidth = 1.7;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.5, cy - s * 0.8);
  ctx.lineTo(cx - s * 0.5, cy + s * 0.8);
  ctx.arcTo(cx - s * 0.5, cy + s * 0.8, cx + s * 0.5, cy + s * 0.8, s * 0.3);
  ctx.lineTo(cx + s * 0.5, cy - s * 0.8);
  ctx.arcTo(cx + s * 0.5, cy - s * 0.8, cx - s * 0.5, cy - s * 0.8, s * 0.3);
  ctx.closePath();
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy + s * 0.5, s * 0.2, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawEmailIcon(ctx, cx, cy, s) {
  ctx.save();
  ctx.strokeStyle = '#6fd0a5';
  ctx.lineWidth = 1.7;
  ctx.lineCap = 'round';
  ctx.strokeRect(cx - s * 0.75, cy - s * 0.5, s * 1.5, s);
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.75, cy - s * 0.5);
  ctx.lineTo(cx, cy + s * 0.1);
  ctx.lineTo(cx + s * 0.75, cy - s * 0.5);
  ctx.stroke();
  ctx.restore();
}

function drawClockIcon(ctx, cx, cy, s) {
  ctx.save();
  ctx.strokeStyle = '#6fd0a5';
  ctx.lineWidth = 1.7;
  ctx.lineCap = 'round';
  ctx.beginPath(); ctx.arc(cx, cy, s * 0.78, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx, cy - s * 0.44); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + s * 0.32, cy + s * 0.2); ctx.stroke();
  ctx.restore();
}

function drawSectorIcon(ctx, cx, cy, r, setor) {
  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(22,101,52,.32)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(111,208,165,.45)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.strokeStyle = '#6fd0a5';
  ctx.lineWidth = 1.9;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const s = r * 0.46;
  if (setor === 'RH') {
    ctx.beginPath(); ctx.arc(cx, cy - s * 0.4, s * 0.38, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx - s * 0.72, cy + s * 0.88);
    ctx.quadraticCurveTo(cx - s * 0.72, cy + s * 0.1, cx, cy + s * 0.05);
    ctx.quadraticCurveTo(cx + s * 0.72, cy + s * 0.1, cx + s * 0.72, cy + s * 0.88);
    ctx.stroke();
  } else if (setor === 'Logística') {
    const bw = s * 1.3, bh = s * 1.05;
    ctx.strokeRect(cx - bw / 2, cy - bh / 2, bw, bh);
    ctx.beginPath();
    ctx.moveTo(cx - bw / 2, cy - bh / 2 + bh * 0.38); ctx.lineTo(cx + bw / 2, cy - bh / 2 + bh * 0.38);
    ctx.moveTo(cx, cy - bh / 2); ctx.lineTo(cx, cy - bh / 2 + bh * 0.38);
    ctx.stroke();
  } else if (setor === 'Frotas') {
    ctx.strokeRect(cx - s * 0.85, cy - s * 0.38, s * 1.15, s * 0.85);
    ctx.strokeRect(cx + s * 0.3, cy - s * 0.72, s * 0.55, s * 0.72);
    ctx.beginPath();
    ctx.arc(cx - s * 0.42, cy + s * 0.48, s * 0.2, 0, Math.PI * 2);
    ctx.arc(cx + s * 0.57, cy + s * 0.48, s * 0.2, 0, Math.PI * 2);
    ctx.stroke();
  } else if (setor === 'Caixas') {
    ctx.strokeRect(cx - s * 0.72, cy - s * 0.42, s * 1.44, s * 0.84);
    ctx.beginPath(); ctx.arc(cx, cy, s * 0.28, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx - s * 0.18, cy); ctx.lineTo(cx + s * 0.18, cy);
    ctx.moveTo(cx, cy - s * 0.28); ctx.lineTo(cx, cy + s * 0.28);
    ctx.stroke();
  } else if (setor === 'Troca de notas') {
    ctx.beginPath();
    ctx.moveTo(cx - s * 0.75, cy - s * 0.28); ctx.lineTo(cx + s * 0.35, cy - s * 0.28);
    ctx.moveTo(cx + s * 0.08, cy - s * 0.62); ctx.lineTo(cx + s * 0.75, cy - s * 0.28); ctx.lineTo(cx + s * 0.08, cy + s * 0.06);
    ctx.moveTo(cx + s * 0.75, cy + s * 0.28); ctx.lineTo(cx - s * 0.35, cy + s * 0.28);
    ctx.moveTo(cx - s * 0.08, cy - s * 0.06); ctx.lineTo(cx - s * 0.75, cy + s * 0.28); ctx.lineTo(cx - s * 0.08, cy + s * 0.62);
    ctx.stroke();
  } else {
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = Math.PI / 3 * i - Math.PI / 6;
      const px = cx + s * 0.82 * Math.cos(a), py = cy + s * 0.82 * Math.sin(a);
      i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    }
    ctx.closePath(); ctx.stroke();
  }
  ctx.restore();
}

function computeCardH(pessoas) {
  let h = 20 + 38 + 48 + 11;
  pessoas.forEach((p, i) => {
    h += 40;
    if (formatPhone(p.telefone)) h += 30;
    if (p.email_corporativo) h += 30;
    if (buildHorario(p)) h += 30;
    h += 10;
    if (i < pessoas.length - 1) h += 13;
  });
  return h + 20;
}

function drawPersonBlock(ctx, x, y, w, person, showDate = false) {
  const iS = 9;
  let cy = y;
  ctx.save();

  if (showDate) {
    const dateLabel = getPersonDateLabel(person);
    if (dateLabel) {
      ctx.font = 'bold 10px Arial';
      ctx.fillStyle = '#6fd0a5';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(fitText(ctx, dateLabel, w), x, cy);
      cy += 13;
    }
  }

  ctx.font = showDate ? 'bold 23px Arial' : 'bold 26px Arial';
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(fitText(ctx, getPersonDisplayName(person).toUpperCase(), w), x, cy);
  cy += showDate ? 27 : 40;

  function infoRow(drawIcon, label, value) {
    if (!value) return;
    const mid = cy + 15;
    drawIcon(ctx, x + iS, mid, iS);
    ctx.font = '12px Arial';
    ctx.fillStyle = 'rgba(185,210,195,.52)';
    ctx.textBaseline = 'top';
    ctx.fillText(label, x + iS * 2 + 7, cy + 1);
    ctx.font = '15px Arial';
    ctx.fillStyle = '#dff5e8';
    ctx.textBaseline = 'bottom';
    ctx.fillText(fitText(ctx, value, w - iS * 2 - 9), x + iS * 2 + 7, cy + 29);
    cy += 30;
  }

  const phone = formatPhone(person.telefone);
  const email = person.email_corporativo;
  const horario = buildHorario(person);
  if (phone) infoRow(drawPhoneIcon, 'Contato', phone);
  if (email) infoRow(drawEmailIcon, 'E-mail', email);
  if (horario) infoRow(drawClockIcon, 'Horário', horario);
  cy += 10;
  ctx.restore();
  return cy - y;
}

function drawSectorCard(ctx, x, y, w, setor, pessoas, dateLabel) {
  const pad = 20;
  const iconR = 18;
  const cardH = computeCardH(pessoas);
  const showPersonDates = shouldShowPersonDates(pessoas);
  drawRoundRectFilled(ctx, x, y, w, cardH, 18, 'rgba(3,10,6,.96)', 'rgba(22,163,74,.38)', 1.8);

  let cy = y + pad;

  // Date row
  ctx.save();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  drawCalendarIcon(ctx, x + pad + 8, cy + 14, 9);
  ctx.fillStyle = 'rgba(185,210,195,.72)';
  ctx.font = '15px Arial';
  ctx.fillText(dateLabel, x + pad + 26, cy + 14);
  ctx.restore();
  cy += 38;

  // Sector badge
  drawSectorIcon(ctx, x + pad + iconR, cy + iconR, iconR, setor);
  const badgeX = x + pad + iconR * 2 + 12;
  ctx.save();
  ctx.font = 'bold 18px Arial';
  const textW = ctx.measureText(setor).width;
  const bh = 34, by = cy + iconR - bh / 2;
  drawRoundRectFilled(ctx, badgeX, by, textW + 28, bh, 10, 'rgba(22,101,52,.28)', 'rgba(111,208,165,.28)', 1.2);
  ctx.fillStyle = '#dcfce7';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(setor, badgeX + 14, by + bh / 2 + 1);
  ctx.restore();
  cy += iconR * 2 + 12;

  // Divider
  ctx.fillStyle = 'rgba(111,208,165,.13)';
  ctx.fillRect(x + pad, cy, w - pad * 2, 1);
  cy += 10;

  // People
  pessoas.forEach((person, i) => {
    const usedH = drawPersonBlock(ctx, x + pad, cy, w - pad * 2, person, showPersonDates);
    cy += usedH;
    if (i < pessoas.length - 1) {
      ctx.fillStyle = 'rgba(111,208,165,.07)';
      ctx.fillRect(x + pad, cy - 5, w - pad * 2, 1);
      cy += 8;
    }
  });

  return cardH;
}

function getDateRangeText(pessoas) {
  const dates = [...new Set(pessoas.map((p) => p.data_plantao).filter(Boolean))].sort();
  if (!dates.length) return '';
  if (dates.length === 1) return `${weekdayBR(dates[0])} • ${formatDateBR(dates[0])}`;
  const wds = [...new Set(dates.map(weekdayBR))];
  const fmts = dates.map(formatDateBR);
  return wds.length <= 2
    ? `${wds.join(' e ')} • ${fmts[0]} e ${fmts[fmts.length - 1]}`
    : `${fmts[0]} a ${fmts[fmts.length - 1]}`;
}

function getRowsForDivulgacao(setorFiltro = 'todos') {
  const dataIni = document.getElementById('plantaoImgData')?.value || document.getElementById('plantaoData')?.value || '';
  const dataFim = document.getElementById('plantaoImgDataFim')?.value || document.getElementById('plantaoDataFim')?.value || dataIni;

  const rows = [];
  Object.entries(escala).forEach(([setor, pessoas]) => {
    pessoas.forEach((p) => {
      const date = p.data_plantao || dataIni;
      const inRange = date >= dataIni && date <= dataFim;
      const inSetor = setorFiltro === 'todos' ? true
        : setorFiltro === 'exceto_troca' ? setor !== 'Troca de notas'
        : setor === setorFiltro;
      if (inRange && inSetor) rows.push({ ...p, setor, data_plantao: date });
    });
  });

  rows.sort((a, b) => {
    const byDate = String(a.data_plantao || '').localeCompare(String(b.data_plantao || ''));
    if (byDate) return byDate;
    const bySetor = String(a.setor || '').localeCompare(String(b.setor || ''));
    if (bySetor) return bySetor;
    return String(a.nome || '').localeCompare(String(b.nome || ''));
  });
  return rows;
}

async function renderImagemPlantao(canvasEl = null, setorFiltro = 'todos', subtitleLabel = '') {
  const canvas = canvasEl || document.getElementById('plantaoCanvasGeral');
  if (!canvas) return;

  const rows = getRowsForDivulgacao(setorFiltro);

  const sidebarW = 200;
  const mainX = sidebarW + 20;
  const mainW = IMG_W - mainX - 20;
  const colGap = 20;
  const colW = (mainW - colGap) / 2;
  const headerH = 215;
  const footerH = 70;
  const cardGap = 20;

  // Group rows by sector preserving order
  const orderedSectors = setores.filter((s) =>
    setorFiltro === 'exceto_troca' ? s !== 'Troca de notas' :
    setorFiltro === 'todos' ? true : s === setorFiltro
  );
  const grouped = new Map();
  orderedSectors.forEach((s) => grouped.set(s, []));
  rows.forEach((row) => {
    if (!grouped.has(row.setor)) grouped.set(row.setor, []);
    grouped.get(row.setor).push(row);
  });
  const sectors = [...grouped.entries()].filter(([, p]) => p.length > 0);

  const col1 = sectors.filter((_, i) => i % 2 === 0);
  const col2 = sectors.filter((_, i) => i % 2 === 1);

  function colTotalH(col) {
    return col.reduce((sum, [, p], i) => sum + computeCardH(p) + (i > 0 ? cardGap : 0), 0);
  }

  const cardsH = sectors.length === 0 ? 180
    : sectors.length === 1 ? computeCardH(sectors[0][1])
    : Math.max(colTotalH(col1), colTotalH(col2));

  const canvasH = Math.max(IMG_H, headerH + cardsH + cardGap + footerH);

  canvas.width = IMG_W;
  canvas.height = canvasH;
  const ctx = canvas.getContext('2d');

  drawBackground(ctx, IMG_W, canvasH);
  await drawLogo(ctx, 25, 28, 150, 62);

  // Sidebar divider
  ctx.fillStyle = 'rgba(111,208,165,.15)';
  ctx.fillRect(sidebarW - 5, 18, 1, canvasH - 36);

  // Sidebar tagline at bottom
  const iconBoxSz = 58;
  const tagY = canvasH - 185;
  drawRoundRectFilled(ctx, 18, tagY, iconBoxSz, iconBoxSz, 14, 'rgba(22,101,52,.22)', 'rgba(111,208,165,.20)', 1.2);
  ctx.save();
  ctx.font = '28px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#6fd0a5';
  ctx.fillText('🎧', 18 + iconBoxSz / 2, tagY + iconBoxSz / 2);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillStyle = '#6fd0a5';
  ctx.font = 'bold 13px Arial';
  ['ATENDIMENTO', 'QUE MOVE', 'O AGRO.'].forEach((line, i) => ctx.fillText(line, 18, tagY + iconBoxSz + 10 + i * 18));
  ctx.restore();

  // Main header
  const subtitle = subtitleLabel || (setorFiltro === 'exceto_troca' ? 'Todos os setores' : setorFiltro === 'todos' ? 'Todos os setores' : `Setor: ${setorFiltro}`);
  const dataIni = document.getElementById('plantaoImgData')?.value || document.getElementById('plantaoData')?.value || '';
  const dataFim = document.getElementById('plantaoImgDataFim')?.value || document.getElementById('plantaoDataFim')?.value || dataIni;
  const dateText = dataIni === dataFim
    ? `${weekdayBR(dataIni)} • ${formatDateBR(dataIni)}`
    : `${formatDateBR(dataIni)} e ${formatDateBR(dataFim)}`;

  ctx.save();
  ctx.textAlign = 'left';

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 66px Arial';
  ctx.textBaseline = 'top';
  ctx.fillText('Escala de Plantão', mainX, 22);

  ctx.fillStyle = 'rgba(185,210,195,.6)';
  ctx.font = '20px Arial';
  ctx.fillText('Relação de plantonistas escalados para atendimento no período informado.', mainX, 100);

  // Info bar
  const barY = 136;
  ctx.font = 'bold 16px Arial';
  const slW = ctx.measureText(subtitle).width + 26;
  drawRoundRectFilled(ctx, mainX, barY, slW, 34, 999, 'rgba(255,255,255,.055)', 'rgba(111,208,165,.18)', 1);
  ctx.fillStyle = '#ffffff';
  ctx.textBaseline = 'middle';
  ctx.fillText(subtitle, mainX + 13, barY + 17);

  ctx.fillStyle = 'rgba(111,208,165,.22)';
  ctx.fillRect(mainX + slW + 13, barY + 7, 1, 20);

  const periodX = mainX + slW + 26;
  drawCalendarIcon(ctx, periodX + 8, barY + 17, 8);
  ctx.font = 'bold 16px Arial';
  ctx.fillStyle = 'rgba(185,210,195,.8)';
  ctx.textBaseline = 'middle';
  ctx.fillText(' Período:', periodX + 22, barY + 17);
  ctx.fillStyle = '#6fd0a5';
  ctx.fillText(dateText, periodX + 22 + ctx.measureText(' Período: ').width, barY + 17);

  ctx.fillStyle = 'rgba(111,208,165,.18)';
  ctx.fillRect(mainX, 186, mainW, 1.5);
  ctx.restore();

  // Cards
  const cardsY = headerH;

  if (sectors.length === 0) {
    drawRoundRectFilled(ctx, mainX, cardsY, mainW, 180, 18, 'rgba(3,10,6,.88)', 'rgba(22,163,74,.25)', 1.5);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 28px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Nenhum plantonista cadastrado', mainX + mainW / 2, cardsY + 90);
  } else if (sectors.length === 1) {
    const [[setor, pessoas]] = sectors;
    drawSectorCard(ctx, mainX, cardsY, mainW, setor, pessoas, getDateRangeText(pessoas));
  } else {
    let y1 = cardsY, y2 = cardsY;
    col1.forEach(([setor, pessoas]) => {
      const h = drawSectorCard(ctx, mainX, y1, colW, setor, pessoas, getDateRangeText(pessoas));
      y1 += h + cardGap;
    });
    col2.forEach(([setor, pessoas]) => {
      const h = drawSectorCard(ctx, mainX + colW + colGap, y2, colW, setor, pessoas, getDateRangeText(pessoas));
      y2 += h + cardGap;
    });
  }

  // Footer
  const footerY = canvasH - footerH + 8;
  ctx.save();
  ctx.fillStyle = 'rgba(111,208,165,.18)';
  ctx.fillRect(mainX, footerY, mainW, 1.5);
  drawRoundRectFilled(ctx, mainX, footerY + 12, 26, 26, 6, 'rgba(22,101,52,.2)', 'rgba(111,208,165,.18)', 1);
  ctx.font = '14px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#6fd0a5';
  ctx.fillText('📦', mainX + 13, footerY + 25);
  ctx.textAlign = 'left';
  ctx.font = 'italic 15px Arial';
  ctx.fillStyle = 'rgba(185,210,195,.65)';
  ctx.fillText('Compromisso, agilidade e confiança para manter o agro sempre em movimento.', mainX + 34, footerY + 25);
  ctx.textAlign = 'right';
  ctx.fillStyle = '#6fd0a5';
  ctx.font = 'bold 15px Arial';
  ctx.fillText('www.grao1000.com.br', mainX + mainW, footerY + 25);
  ctx.restore();
}

function baixarImagemPlantao(canvasEl = null, sufixo = '') {
  const canvas = canvasEl || document.getElementById('plantaoCanvasGeral');
  if (!canvas) return;
  const dataIni = document.getElementById('plantaoImgData')?.value || todayISO();
  const link = document.createElement('a');
  link.download = `plantao_${dataIni}${sufixo ? '_' + sufixo : ''}.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();
}

async function renderWhatsappStatus(canvasEl, setor) {
  if (!canvasEl || !setor) return;
  const rows = getRowsForDivulgacao(setor);

  if (!rows.length) {
    canvasEl.width = WA_W; canvasEl.height = 400;
    const ctx = canvasEl.getContext('2d');
    ctx.fillStyle = '#030e07'; ctx.fillRect(0, 0, WA_W, 400);
    ctx.fillStyle = 'rgba(185,210,195,.5)'; ctx.font = '30px Arial';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('Nenhum plantonista neste setor', WA_W / 2, 200);
    return;
  }

  const PAD = 56, HEADER_H = 360, FOOTER_H = 90, GAP = 18;
  const showPersonDates = shouldShowPersonDates(rows);

  function personH(p) {
    let h = 32 + 52; // top-pad + name
    if (showPersonDates && getPersonDateLabel(p)) h += 28;
    if (formatPhone(p.telefone)) h += 46;
    if (p.email_corporativo) h += 46;
    if (buildHorario(p)) h += 46;
    return h + 26; // bottom-pad
  }

  const cardsH = rows.reduce((s, p) => s + personH(p), 0) + (rows.length - 1) * GAP;
  const canvasH = Math.max(1080, HEADER_H + cardsH + 60 + FOOTER_H);

  canvasEl.width = WA_W; canvasEl.height = canvasH;
  const ctx = canvasEl.getContext('2d');

  drawBackground(ctx, WA_W, canvasH);

  // Acento lateral esquerdo
  const aG = ctx.createLinearGradient(0, 0, 0, canvasH);
  aG.addColorStop(0, 'rgba(111,208,165,.55)');
  aG.addColorStop(0.5, 'rgba(111,208,165,.18)');
  aG.addColorStop(1, 'rgba(111,208,165,.0)');
  ctx.fillStyle = aG; ctx.fillRect(0, 0, 8, canvasH);

  // Logo
  await drawLogo(ctx, PAD, 44, 190, 78);

  // Título
  ctx.save();
  ctx.font = 'bold 82px Arial'; ctx.fillStyle = '#fff';
  ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  ctx.fillText('Escala de Plantão', PAD, 150);
  ctx.restore();

  // Badge setor
  const iconR = 28, badgeY = 256;
  drawSectorIcon(ctx, PAD + iconR, badgeY + iconR, iconR, setor);
  const bx = PAD + iconR * 2 + 20, bH = 54, bW = WA_W - bx - PAD;
  drawRoundRectFilled(ctx, bx, badgeY + iconR - bH / 2, bW, bH, 16,
    'rgba(21,101,52,.3)', 'rgba(111,208,165,.3)', 1.5);
  ctx.save();
  ctx.font = 'bold 34px Arial'; ctx.fillStyle = '#dcfce7';
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillText(setor, bx + 22, badgeY + iconR + 1);
  ctx.restore();

  // Data
  const dateY = badgeY + iconR * 2 + 22;
  const iS = 14;
  drawCalendarIcon(ctx, PAD + iS, dateY + iS, iS);
  ctx.save();
  ctx.font = '28px Arial'; ctx.fillStyle = '#6fd0a5';
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillText(getDateRangeText(rows), PAD + iS * 2 + 14, dateY + iS);
  ctx.restore();

  // Divisor
  const divY = HEADER_H - 20;
  ctx.fillStyle = 'rgba(111,208,165,.22)'; ctx.fillRect(PAD, divY, WA_W - PAD * 2, 1.5);

  // Cards por pessoa
  const cardW = WA_W - PAD * 2;
  let cy = divY + 30;

  rows.forEach((person) => {
    const h = personH(person);
    drawRoundRectFilled(ctx, PAD, cy, cardW, h, 22,
      'rgba(3,12,7,.94)', 'rgba(22,163,74,.28)', 1.5);

    let iy = cy + 32;

    if (showPersonDates) {
      const dateLabel = getPersonDateLabel(person);
      if (dateLabel) {
        ctx.save();
        ctx.font = 'bold 20px Arial';
        ctx.fillStyle = '#6fd0a5';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText(fitText(ctx, dateLabel, cardW - 44), PAD + 22, iy);
        ctx.restore();
        iy += 28;
      }
    }

    ctx.save();
    ctx.font = 'bold 44px Arial'; ctx.fillStyle = '#fff';
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText(fitText(ctx, getPersonDisplayName(person).toUpperCase(), cardW - 44), PAD + 22, iy);
    ctx.restore();
    iy += 52;

    function infoRow(drawIcon, val) {
      if (!val) return;
      const s = 13, mid = iy + 23;
      drawIcon(ctx, PAD + 22 + s, mid, s);
      ctx.save();
      ctx.font = 'bold 26px Arial'; ctx.fillStyle = '#c8ead7';
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText(fitText(ctx, val, cardW - 68), PAD + 22 + s * 2 + 10, mid);
      ctx.restore();
      iy += 46;
    }

    infoRow(drawPhoneIcon, formatPhone(person.telefone));
    infoRow(drawEmailIcon, person.email_corporativo);
    infoRow(drawClockIcon, buildHorario(person));

    cy += h + GAP;
  });

  // Rodapé
  const footerY = canvasH - FOOTER_H + 12;
  ctx.fillStyle = 'rgba(111,208,165,.18)'; ctx.fillRect(PAD, footerY, WA_W - PAD * 2, 1.5);
  ctx.save();
  ctx.font = 'bold 26px Arial'; ctx.fillStyle = '#6fd0a5';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('www.grao1000.com.br', WA_W / 2, footerY + 38);
  ctx.restore();
}

async function renderAmbasImagens() {
  renderDivulgacaoControls();
  const canvasGeral = document.getElementById('plantaoCanvasGeral');
  const canvasTroca = document.getElementById('plantaoCanvasTroca');
  const canvasWA   = document.getElementById('plantaoCanvasWA');
  const waSetor    = document.getElementById('plantaoWASetor')?.value || setores[0] || '';
  await Promise.all([
    canvasGeral ? renderImagemPlantao(canvasGeral, 'exceto_troca', 'Escala Geral') : Promise.resolve(),
    canvasTroca ? renderImagemPlantao(canvasTroca, 'Troca de notas', 'Troca de Notas') : Promise.resolve(),
    (canvasWA && waSetor) ? renderWhatsappStatus(canvasWA, waSetor) : Promise.resolve(),
  ]);
}

function renderDivulgacaoControls() {
  const waSelect = document.getElementById('plantaoWASetor');
  if (!waSelect) return;
  const current = waSelect.value;
  waSelect.innerHTML = setores.map((s) => `<option value="${esc(s)}">${esc(s)}</option>`).join('');
  if (setores.includes(current)) waSelect.value = current;
}

function renderConsultaSetores() {
  const select = document.getElementById('consultaSetor');
  if (!select) return;
  const current = select.value || 'todos';
  select.innerHTML = `<option value="todos">Todos os setores</option>${setores.map((s) => `<option value="${esc(s)}">${esc(s)}</option>`).join('')}`;
  select.value = setores.includes(current) ? current : 'todos';
}

function switchTab(tab) {
  document.querySelectorAll('.plantao-tab').forEach((btn) => btn.classList.toggle('active', btn.dataset.tab === tab));
  document.querySelectorAll('.plantao-panel').forEach((panel) => panel.classList.toggle('active', panel.dataset.panel === tab));
  if (tab === 'programacao') renderModeloTable();
  if (tab === 'consulta') { renderConsultaSetores(); consultarDatasPlantao(); }
  if (tab === 'contatos') renderContatosTable();
  if (tab === 'divulgacao') {
    renderAmbasImagens();
  }
}

function renderPage(content) {
  const dataIni = nextWeekendBase();
  const dataFim = addDaysISO(dataIni, 1);

  content.innerHTML = `
    <section class="plantao-page">

      ${renderKpis()}

      <div class="plantao-tabs">
        <button type="button" class="plantao-tab active" data-tab="escala">Escala</button>
        <button type="button" class="plantao-tab" data-tab="programacao">Programação</button>
        <button type="button" class="plantao-tab" data-tab="consulta">Consultar datas</button>
        <button type="button" class="plantao-tab" data-tab="contatos">Contatos</button>
        <button type="button" class="plantao-tab" data-tab="divulgacao">Divulgação</button>
      </div>

      <!-- ── ESCALA ── -->
      <div class="plantao-panel active" data-panel="escala">

        <div class="plantao-card">
          <p class="plantao-card-title">Período e evento</p>
          <div class="plantao-config-grid">
            <div class="plantao-field quarter">
              <label class="plantao-label" for="plantaoData">Data inicial</label>
              <input class="plantao-input" type="date" id="plantaoData" value="${dataIni}" />
            </div>
            <div class="plantao-field quarter">
              <label class="plantao-label" for="plantaoDataFim">Data final</label>
              <input class="plantao-input" type="date" id="plantaoDataFim" value="${dataFim}" />
            </div>
            <div class="plantao-field half">
              <label class="plantao-label" for="plantaoEvento">Evento</label>
              <input class="plantao-input" id="plantaoEvento" placeholder="Ex.: Plantão final de semana, feriado..." />
            </div>
          </div>

          <div class="plantao-horario-padrao">
            <span class="plantao-horario-padrao-label">Horário padrão</span>
            <input class="plantao-input" type="time" id="plantaoPadraoInicio1" value="08:00" />
            <span class="sep">às</span>
            <input class="plantao-input" type="time" id="plantaoPadraoFim1" value="12:00" />
            <span class="sep">·</span>
            <input class="plantao-input" type="time" id="plantaoPadraoInicio2" value="13:30" />
            <span class="sep">às</span>
            <input class="plantao-input" type="time" id="plantaoPadraoFim2" value="18:00" />
            <button type="button" class="plantao-btn secondary sm" id="btnAplicarHorarioPadrao">Aplicar nos setores</button>
          </div>

          <div style="margin-top:12px;">
            <label class="plantao-label" for="plantaoObs">Observações internas <span class="plantao-opt">(opcional)</span></label>
            <textarea class="plantao-textarea" id="plantaoObs" placeholder="Anotações de controle interno"></textarea>
          </div>

          <div class="plantao-divider"></div>

          <div class="plantao-actions">
            <button type="button" class="plantao-btn secondary" id="btnCarregarPlantao">Carregar período</button>
            <button type="button" class="plantao-btn primary" id="btnSalvarPlantao">Salvar plantão</button>
            <div class="plantao-new-setor-row">
              <input class="plantao-input" id="plantaoNovoSetor" placeholder="Novo setor" />
              <button type="button" class="plantao-btn secondary" id="btnAddSetor">+ Setor</button>
            </div>
          </div>
          <div class="plantao-feedback" id="plantaoFeedback"></div>
        </div>

        <div class="plantao-card">
          <p class="plantao-card-title">Escala por setor</p>
          <div id="plantaoSetores"></div>
        </div>
      </div>

      <!-- ── PROGRAMAÇÃO ── -->
      <div class="plantao-panel" data-panel="programacao">
        <div class="plantao-card">
          <h3 style="margin:0 0 4px;font-size:16px;font-weight:800;color:#e6edf3">Programar várias semanas</h3>
          <p class="plantao-meta">Monte a escala-base uma vez, salve como modelo e gere automaticamente vários fins de semana de uma só vez.</p>

          <div class="plantao-actions" style="margin-top:16px;">
            <button type="button" class="plantao-btn secondary" id="btnSalvarModeloPlantao">Salvar escala atual como modelo</button>
            <button type="button" class="plantao-btn secondary" id="btnCarregarModeloPlantao">Carregar modelo padrão</button>
          </div>
          <div class="plantao-feedback" id="plantaoProgramacaoFeedback"></div>

          <div class="plantao-divider"></div>

          <div class="plantao-grid">
            <div class="plantao-field quarter">
              <label class="plantao-label" for="progDataInicial">Primeiro final de semana</label>
              <input class="plantao-input" type="date" id="progDataInicial" value="${dataIni}" />
            </div>
            <div class="plantao-field quarter">
              <label class="plantao-label" for="progSemanas">Quantidade de semanas</label>
              <input class="plantao-input" type="number" id="progSemanas" min="1" max="52" value="4" />
            </div>
            <div class="plantao-field half">
              <label class="plantao-label" for="progEvento">Evento / descrição</label>
              <input class="plantao-input" id="progEvento" placeholder="Ex.: Plantão final de semana" value="Plantão final de semana" />
            </div>
            <div class="plantao-field half">
              <label class="plantao-label">Dias incluídos</label>
              <div class="plantao-radio-row">
                <label><input type="checkbox" id="progSexta" /> Sexta</label>
                <label><input type="checkbox" id="progSabado" checked /> Sábado</label>
                <label><input type="checkbox" id="progDomingo" checked /> Domingo</label>
              </div>
            </div>
            <div class="plantao-field half">
              <label class="plantao-label">Modo de geração</label>
              <div class="plantao-radio-row">
                <label><input type="radio" name="progModo" value="substituir" checked /> Substituir escala atual</label>
                <label><input type="radio" name="progModo" value="somar" /> Somar na escala</label>
              </div>
            </div>
          </div>

          <div class="plantao-actions" style="margin-top:16px;">
            <button type="button" class="plantao-btn primary" id="btnGerarProgramacaoPlantao">Gerar programação</button>
            <button type="button" class="plantao-btn secondary" id="btnSalvarProgramacaoPlantao">Salvar programação gerada</button>
          </div>
        </div>

        <div class="plantao-card">
          <h3 style="margin:0 0 0;font-size:15px;font-weight:700;color:#e6edf3">Modelo padrão salvo</h3>
          <div class="plantao-table-wrap">
            <table class="plantao-table">
              <thead>
                <tr>
                  <th>Setor</th><th>Colaborador</th><th>Telefone</th>
                  <th>E-mail</th><th>Horário</th><th>Ação</th>
                </tr>
              </thead>
              <tbody id="plantaoModeloBody"></tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- ── CONSULTA ── -->
      <div class="plantao-panel" data-panel="consulta">
        <div class="plantao-card">
          <h3 style="margin:0 0 4px;font-size:16px;font-weight:800;color:#e6edf3">Consultar datas salvas</h3>
          <p class="plantao-meta">Localize qualquer plantão já salvo por período, setor ou nome. Carregue para editar ou gere a arte de divulgação daquela data.</p>

          <div class="plantao-grid" style="margin-top:14px;">
            <div class="plantao-field quarter">
              <label class="plantao-label" for="consultaDataIni">De</label>
              <input class="plantao-input" type="date" id="consultaDataIni" value="${dataIni}" />
            </div>
            <div class="plantao-field quarter">
              <label class="plantao-label" for="consultaDataFim">Até</label>
              <input class="plantao-input" type="date" id="consultaDataFim" value="${addDaysISO(dataIni, 60)}" />
            </div>
            <div class="plantao-field quarter">
              <label class="plantao-label" for="consultaSetor">Setor</label>
              <select class="plantao-select" id="consultaSetor"></select>
            </div>
            <div class="plantao-field quarter">
              <label class="plantao-label" for="consultaBusca">Buscar</label>
              <input class="plantao-input" id="consultaBusca" placeholder="Nome, setor ou evento" />
            </div>
          </div>

          <div class="plantao-actions" style="margin-top:14px;">
            <button type="button" class="plantao-btn primary" id="btnConsultarDatasPlantao">Consultar</button>
            <button type="button" class="plantao-btn secondary" id="btnConsultaProximos90">Próximos 90 dias</button>
          </div>
          <div class="plantao-feedback" id="plantaoConsultaFeedback"></div>
        </div>

        <div class="plantao-card">
          <div id="plantaoConsultaLista" class="plantao-consulta-list"></div>
        </div>
      </div>

      <!-- ── CONTATOS ── -->
      <div class="plantao-panel" data-panel="contatos">
        <div class="plantao-card">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px;flex-wrap:wrap;margin-bottom:14px;">
            <div>
              <h3 style="margin:0 0 4px;font-size:16px;font-weight:800;color:#e6edf3">Contatos do plantão</h3>
              <p class="plantao-meta">Ajuste telefone ou e-mail corporativo aqui — o ajuste fica salvo para os próximos plantões.</p>
            </div>
            <input class="plantao-input" id="plantaoContatoBusca" placeholder="Buscar colaborador" style="max-width:280px;" />
          </div>
          <div class="plantao-feedback" id="plantaoContatosFeedback"></div>
          <div class="plantao-table-wrap" style="margin-top:0;">
            <table class="plantao-table">
              <thead>
                <tr>
                  <th>Colaborador</th><th>CPF</th><th>Telefone</th>
                  <th>E-mail corporativo</th><th>Setor preferencial</th><th>Ação</th>
                </tr>
              </thead>
              <tbody id="plantaoContatosBody"></tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- ── DIVULGAÇÃO ── -->
      <div class="plantao-panel" data-panel="divulgacao">
        <div class="plantao-card">
          <h3 style="margin:0 0 14px;font-size:16px;font-weight:800;color:#e6edf3">Arte de divulgação</h3>
          <div class="plantao-grid">
            <div class="plantao-field half">
              <label class="plantao-label" for="plantaoImgData">Data inicial</label>
              <input class="plantao-input" type="date" id="plantaoImgData" value="${dataIni}" />
            </div>
            <div class="plantao-field half">
              <label class="plantao-label" for="plantaoImgDataFim">Data final</label>
              <input class="plantao-input" type="date" id="plantaoImgDataFim" value="${dataFim}" />
            </div>
          </div>
          <div class="plantao-actions" style="margin-top:14px;">
            <button type="button" class="plantao-btn secondary" id="btnAtualizarImagem">↻ Atualizar imagens</button>
          </div>
        </div>

        <div class="plantao-div-grid">
          <div class="plantao-div-card">
            <div class="plantao-div-head">
              <div class="plantao-div-label">
                <span class="plantao-div-num">01</span>
                <div>
                  <div class="plantao-div-title">Escala Geral</div>
                  <div class="plantao-div-sub">RH · Caixas · Frotas · Logística</div>
                </div>
              </div>
              <button type="button" class="plantao-btn primary" id="btnBaixarImagemGeral">Baixar PNG</button>
            </div>
            <canvas id="plantaoCanvasGeral" class="plantao-canvas-img" width="${IMG_W}" height="${IMG_H}"></canvas>
          </div>

          <div class="plantao-div-card">
            <div class="plantao-div-head">
              <div class="plantao-div-label">
                <span class="plantao-div-num">02</span>
                <div>
                  <div class="plantao-div-title">Troca de Notas</div>
                  <div class="plantao-div-sub">Setor exclusivo</div>
                </div>
              </div>
              <button type="button" class="plantao-btn primary" id="btnBaixarImagemTroca">Baixar PNG</button>
            </div>
            <canvas id="plantaoCanvasTroca" class="plantao-canvas-img" width="${IMG_W}" height="${IMG_H}"></canvas>
          </div>

          <div class="plantao-div-card">
            <div class="plantao-div-head">
              <div class="plantao-div-label">
                <span class="plantao-div-num" style="font-size:11px;letter-spacing:.5px;padding:0 8px;">WA</span>
                <div>
                  <div class="plantao-div-title">Status WhatsApp</div>
                  <div class="plantao-div-sub">1080×vertical · por setor</div>
                </div>
              </div>
              <div style="display:flex;gap:8px;align-items:center;">
                <select class="plantao-select" id="plantaoWASetor" style="min-width:160px;"></select>
                <button type="button" class="plantao-btn primary" id="btnBaixarWA">Baixar PNG</button>
              </div>
            </div>
            <canvas id="plantaoCanvasWA" class="plantao-canvas-img" width="${WA_W}" height="${WA_W}"></canvas>
          </div>
        </div>
      </div>

    </section>
  `;

  document.querySelectorAll('.plantao-tab').forEach((btn) => btn.addEventListener('click', () => switchTab(btn.dataset.tab)));
  document.getElementById('btnCarregarPlantao')?.addEventListener('click', () => loadEscalaFromDb().catch(showLoadError));
  document.getElementById('btnSalvarPlantao')?.addEventListener('click', saveEscala);
  document.getElementById('btnAplicarHorarioPadrao')?.addEventListener('click', applyHorarioPadraoToForms);
  document.getElementById('btnSalvarModeloPlantao')?.addEventListener('click', salvarModeloPlantao);
  document.getElementById('btnCarregarModeloPlantao')?.addEventListener('click', () => carregarModeloPadrao().catch(showLoadError));
  document.getElementById('btnGerarProgramacaoPlantao')?.addEventListener('click', aplicarModeloNaEscala);
  document.getElementById('btnSalvarProgramacaoPlantao')?.addEventListener('click', saveEscala);
  document.getElementById('btnAddSetor')?.addEventListener('click', addSetor);
  document.getElementById('btnConsultarDatasPlantao')?.addEventListener('click', consultarDatasPlantao);
  document.getElementById('btnConsultaProximos90')?.addEventListener('click', () => {
    const ini = todayISO();
    document.getElementById('consultaDataIni').value = ini;
    document.getElementById('consultaDataFim').value = addDaysISO(ini, 90);
    consultarDatasPlantao();
  });
  ['consultaDataIni','consultaDataFim','consultaSetor'].forEach((id) => document.getElementById(id)?.addEventListener('change', consultarDatasPlantao));
  document.getElementById('consultaBusca')?.addEventListener('input', () => {
    clearTimeout(window.__plantaoConsultaTimer);
    window.__plantaoConsultaTimer = setTimeout(consultarDatasPlantao, 250);
  });
  document.getElementById('plantaoContatoBusca')?.addEventListener('input', renderContatosTable);
  document.getElementById('btnAtualizarImagem')?.addEventListener('click', renderAmbasImagens);
  document.getElementById('btnBaixarImagemGeral')?.addEventListener('click', () => baixarImagemPlantao(document.getElementById('plantaoCanvasGeral'), 'geral'));
  document.getElementById('btnBaixarImagemTroca')?.addEventListener('click', () => baixarImagemPlantao(document.getElementById('plantaoCanvasTroca'), 'troca_notas'));
  document.getElementById('plantaoWASetor')?.addEventListener('change', async () => {
    const setor = document.getElementById('plantaoWASetor').value;
    const canvasWA = document.getElementById('plantaoCanvasWA');
    if (canvasWA && setor) await renderWhatsappStatus(canvasWA, setor);
  });
  document.getElementById('btnBaixarWA')?.addEventListener('click', () => {
    const setor = document.getElementById('plantaoWASetor')?.value || '';
    baixarImagemPlantao(document.getElementById('plantaoCanvasWA'), `wa_${setor.replace(/\s+/g, '_')}`);
  });
  document.getElementById('plantaoData')?.addEventListener('change', () => {
    const ini = document.getElementById('plantaoData').value;
    document.getElementById('plantaoDataFim').value = addDaysISO(ini, 1);
    document.getElementById('plantaoImgData').value = ini;
    document.getElementById('plantaoImgDataFim').value = addDaysISO(ini, 1);
    renderSetores();
    updateKpis();
  });
  document.getElementById('plantaoDataFim')?.addEventListener('change', () => {
    document.getElementById('plantaoImgDataFim').value = document.getElementById('plantaoDataFim').value;
    renderSetores();
    updateKpis();
  });
  ['plantaoPadraoInicio1','plantaoPadraoFim1','plantaoPadraoInicio2','plantaoPadraoFim2'].forEach((id) => {
    document.getElementById(id)?.addEventListener('change', applyHorarioPadraoToForms);
  });

  buildEmptyEscala();
  renderSetores();
  renderConsultaSetores();
  renderDivulgacaoControls();
}

function showLoadError(err) {
  console.error(err);
  const feedback = document.getElementById('plantaoFeedback');
  if (feedback) {
    feedback.classList.add('error');
    feedback.textContent = `Erro ao carregar plantão: ${err.message || err}`;
  }
}

export async function renderContent(content, userContext) {
  currentUserContext = userContext;
  injectPlantaoStyles();
  renderPage(content);

  const feedback = document.getElementById('plantaoFeedback');
  try {
    feedback.textContent = 'Carregando colaboradores, contatos e setores...';
    await Promise.all([loadSetores(), loadColaboradores(), loadContatos(), loadModeloPlantao()]);
    buildEmptyEscala();
    renderSetores();
    renderContatosTable();
    renderModeloTable();
    renderConsultaSetores();
    renderDivulgacaoControls();
    updateKpis();
    feedback.textContent = `Base carregada com ${colaboradores.length} colaborador(es). Preencha a escala, carregue um período salvo ou programe várias semanas.`;
  } catch (err) {
    console.error(err);
    feedback.classList.add('error');
    feedback.textContent = `Erro ao iniciar Plantão: ${err.message || err}`;
  }
}

initProtectedPage('Plantão', renderContent);
