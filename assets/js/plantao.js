import { initProtectedPage } from './pageInit.js';
import { supabase } from './supabaseClient.js';

const DEFAULT_SETORES = ['RH', 'Logística', 'Frotas', 'Caixas', 'Troca de Notas'];
const SETORES_DIVULGACAO_PADRAO = ['RH', 'Logística', 'Frotas', 'Caixas', 'Troca de Notas'];
const STORAGE_KEY = 'painel_rh_plantao_setores_extra';
const TEMPLATE_STORAGE_KEY = 'painel_rh_plantao_modelo_padrao';
const COLAB_CACHE_KEY = 'grao1000:plantao-colab:v1';
const IMG_W = 1448;
const IMG_H = 1086;

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
    .plantao-page{display:grid;gap:18px}
    .plantao-tabs{display:flex;gap:10px;flex-wrap:wrap}
    .plantao-tab{border:1px solid var(--line);background:#15152a;color:var(--text);border-radius:14px;padding:10px 14px;font-weight:800;cursor:pointer}
    .plantao-tab.active{background:rgba(22,101,52,.28);color:#dcfce7;border-color:rgba(111,208,165,.28)}
    .plantao-panel{display:none}
    .plantao-panel.active{display:block}
    .plantao-sector-nav{display:grid;grid-template-columns:repeat(5,minmax(150px,1fr));gap:10px;margin:0 0 14px}
    .plantao-sector-btn{border:1px solid rgba(255,255,255,.08);background:#15152a;color:var(--text);border-radius:18px;padding:14px 16px;font-weight:900;cursor:pointer;text-align:left;box-shadow:0 14px 30px rgba(0,0,0,.12);transition:.16s ease}
    .plantao-sector-btn:hover{border-color:rgba(111,208,165,.22);transform:translateY(-1px)}
    .plantao-sector-btn.active{background:linear-gradient(135deg,rgba(22,101,52,.34),rgba(15,23,42,.74));color:#dcfce7;border-color:rgba(111,208,165,.38)}
    .plantao-sector-btn small{display:block;color:var(--muted);font-weight:700;margin-top:5px}
    .plantao-sector-btn.active small{color:#bbf7d0}
    .plantao-grid{display:grid;grid-template-columns:repeat(12,1fr);gap:14px}
    .plantao-field{grid-column:span 12}
    .plantao-field.third{grid-column:span 4}
    .plantao-field.half{grid-column:span 6}
    .plantao-field.quarter{grid-column:span 3}
    .plantao-label{display:block;font-size:13px;color:var(--muted);font-weight:800;margin-bottom:7px}
    .plantao-input,.plantao-select,.plantao-textarea{width:100%;background:#15152a;color:var(--text);border:1px solid rgba(255,255,255,0.08);border-radius:13px;padding:11px 12px;outline:none}
    .plantao-input:focus,.plantao-select:focus,.plantao-textarea:focus{border-color:#16a34a;box-shadow:0 0 0 2px rgba(22,163,74,.15)}
    .plantao-textarea{min-height:82px;resize:vertical}
    .plantao-card{background:var(--bg-card);border:1px solid var(--line);border-radius:22px;padding:18px;box-shadow:var(--shadow-soft)}
    .plantao-actions{display:flex;gap:10px;flex-wrap:wrap;align-items:center}
    .plantao-btn{border:0;border-radius:13px;padding:11px 14px;font-weight:800;cursor:pointer}
    .plantao-btn.primary{background:#15803d;color:#fff}
    .plantao-btn.secondary{background:#15152a;color:var(--text);border:1px solid rgba(255,255,255,0.08)}
    .plantao-btn.danger{background:rgba(220,38,38,.18);color:#fecaca;border:1px solid rgba(220,38,38,.28)}
    .plantao-btn:disabled{opacity:.55;cursor:not-allowed}
    .plantao-setores{display:grid;gap:16px}
    .plantao-setor{border:1px solid var(--line);border-radius:18px;padding:14px;background:#15152a}
    .plantao-setor-head{display:flex;justify-content:space-between;gap:12px;align-items:center;margin-bottom:12px}
    .plantao-setor-head h3{margin:0}
    .plantao-add-grid{display:grid;grid-template-columns:minmax(220px,1.5fr) minmax(155px,.75fr) repeat(4,minmax(92px,.65fr)) 120px;gap:10px;align-items:end}
    .plantao-person-list{display:grid;gap:8px;margin-top:12px}
    .plantao-person{display:grid;grid-template-columns:1.5fr 1fr 1fr auto;gap:10px;align-items:center;border:1px solid var(--line);background:#10101e;border-radius:14px;padding:10px}
    .plantao-person strong{display:block}
    .plantao-person span{color:var(--muted);font-size:13px}
    .plantao-suggest-wrap{position:relative}
    .plantao-suggestions{position:absolute;top:calc(100% + 6px);left:0;right:0;background:#15152a;border:1px solid rgba(255,255,255,0.08);border-radius:14px;box-shadow:0 20px 45px rgba(0,0,0,.35);z-index:20;max-height:260px;overflow:auto;display:none}
    .plantao-suggestions.show{display:block}
    .plantao-suggestion{width:100%;display:block;text-align:left;border:0;background:transparent;color:var(--text);padding:10px 12px;cursor:pointer;border-bottom:1px solid rgba(51,65,85,.4)}
    .plantao-suggestion:hover{background:rgba(22,101,52,.22)}
    .plantao-suggestion small{display:block;color:var(--muted);margin-top:3px}
    .plantao-meta{color:var(--muted);font-size:13px;line-height:1.5}
    .plantao-feedback{min-height:22px;color:#bbf7d0;font-size:14px}
    .plantao-feedback.error{color:#fecaca}
    .plantao-table-wrap{overflow:auto;border:1px solid var(--line);border-radius:16px}
    .plantao-table{width:100%;min-width:920px;border-collapse:collapse;background:#15152a}
    .plantao-table th,.plantao-table td{padding:11px 12px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}
    .plantao-table th{color:var(--muted);font-size:12px;text-transform:uppercase;letter-spacing:.06em}
    .plantao-canvas-wrap{display:grid;gap:12px;justify-items:start}
    #plantaoCanvas{max-width:100%;background:#050c09;border:1px solid var(--line);border-radius:18px}
    .plantao-mini-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}
    .plantao-mini-kpi{background:#15152a;border:1px solid var(--line);border-radius:16px;padding:12px}
    .plantao-mini-kpi b{display:block;font-size:22px;margin-top:4px}
    .plantao-radio-row{display:flex;gap:12px;flex-wrap:wrap;align-items:center}
    .plantao-radio-row label{display:inline-flex;gap:8px;align-items:center;background:#15152a;border:1px solid var(--line);border-radius:999px;padding:9px 12px;color:var(--text)}
    .plantao-date-pill{display:inline-flex;align-items:center;gap:6px;border:1px solid rgba(111,208,165,.22);background:rgba(22,101,52,.14);color:#dcfce7;border-radius:999px;padding:5px 9px;font-size:12px;font-weight:800;margin-bottom:5px}
    .plantao-consulta-list{display:grid;gap:10px}
    .plantao-consulta-item{display:grid;grid-template-columns:1fr auto;gap:12px;align-items:center;border:1px solid var(--line);background:#15152a;border-radius:16px;padding:12px}
    .plantao-consulta-title{display:flex;gap:8px;align-items:center;flex-wrap:wrap;font-weight:900}
    .plantao-consulta-tags{display:flex;gap:7px;flex-wrap:wrap;margin-top:8px}
    .plantao-tag{display:inline-flex;border:1px solid rgba(255,255,255,0.08);background:#10101e;border-radius:999px;padding:5px 8px;color:var(--muted);font-size:12px}
    @media (max-width:980px){
      .plantao-field.third,.plantao-field.half,.plantao-field.quarter{grid-column:span 12}
      .plantao-sector-nav{grid-template-columns:1fr 1fr}
      .plantao-add-grid,.plantao-person{grid-template-columns:1fr}
      .plantao-mini-kpis{grid-template-columns:1fr 1fr}
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

async function loadLatestReferenceDate() {
  const { data, error } = await supabase
    .from('colaborador_importacoes')
    .select('data_referencia')
    .eq('status', 'processado')
    .order('data_referencia', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return null;
  return data?.data_referencia || null;
}

async function loadColaboradores() {
  const latest = await loadLatestReferenceDate();

  // Cache por data de importação — dados não mudam até a próxima importação
  try {
    const raw = sessionStorage.getItem(COLAB_CACHE_KEY);
    if (raw) {
      const { date, data } = JSON.parse(raw);
      if (date === latest && Array.isArray(data)) { colaboradores = data; return; }
    }
  } catch {}

  const pageSize = 1000;
  let from = 0;
  const allRows = [];

  while (true) {
    let query = supabase
      .from('colaborador_snapshot')
      .select('cpf,nome,situacao,empresa,coordenacao,supervisao,cargo,email_empresa,email_pessoal,whatsapp,tipo')
      .order('nome', { ascending: true })
      .range(from, from + pageSize - 1);

    if (latest) query = query.eq('data_referencia', latest);
    query = query.eq('situacao', 'Ativo');

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
  try { sessionStorage.setItem(COLAB_CACHE_KEY, JSON.stringify({ date: latest, data: colaboradores })); } catch {}
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
  renderDivulgacaoControls();
  await renderImagemPlantao();
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
      <div class="plantao-mini-kpi"><span class="plantao-meta">Setores</span><b id="kpiSetores">${setores.length}</b></div>
      <div class="plantao-mini-kpi"><span class="plantao-meta">Plantonistas</span><b id="kpiPessoas">0</b></div>
      <div class="plantao-mini-kpi"><span class="plantao-meta">Período</span><b id="kpiPeriodo">-</b></div>
      <div class="plantao-mini-kpi"><span class="plantao-meta">Base contatos</span><b id="kpiContatos">${contatosMap.size}</b></div>
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
  if (elPeriodo) elPeriodo.textContent = dataIni && dataFim ? `${formatDateBR(dataIni)} a ${formatDateBR(dataFim)}` : '-';
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
        return `
          <button type="button" class="plantao-sector-btn ${setor === setorAtivo ? 'active' : ''}" data-setor-tab="${esc(setor)}">
            ${esc(setor)}
            <small>${rows.length} plantonista(s)</small>
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
          <div class="plantao-meta">Selecione a data, o colaborador e o horário do responsável por este setor.</div>
        </div>
        ${DEFAULT_SETORES.includes(setor) ? '' : `<button type="button" class="plantao-btn danger" data-remove-setor="${esc(setor)}">Remover setor</button>`}
      </div>

      <div class="plantao-add-grid">
        <div class="plantao-suggest-wrap">
          <label class="plantao-label">Colaborador</label>
          <input class="plantao-input plantao-colab-input" data-setor="${esc(setor)}" placeholder="Digite o nome do colaborador" autocomplete="off" />
          <div class="plantao-suggestions"></div>
        </div>
        <div>
          <label class="plantao-label">Data</label>
          <select class="plantao-select" data-field="data_plantao" data-setor="${esc(setor)}">${buildDateOptions()}</select>
        </div>
        <div>
          <label class="plantao-label">Início 1</label>
          <input class="plantao-input" type="time" data-field="hora_inicio" data-setor="${esc(setor)}" value="${esc(getHorarioPadrao().hora_inicio)}" />
        </div>
        <div>
          <label class="plantao-label">Fim 1</label>
          <input class="plantao-input" type="time" data-field="hora_fim" data-setor="${esc(setor)}" value="${esc(getHorarioPadrao().hora_fim)}" />
        </div>
        <div>
          <label class="plantao-label">Início 2</label>
          <input class="plantao-input" type="time" data-field="hora_inicio_2" data-setor="${esc(setor)}" value="${esc(getHorarioPadrao().hora_inicio_2)}" />
        </div>
        <div>
          <label class="plantao-label">Fim 2</label>
          <input class="plantao-input" type="time" data-field="hora_fim_2" data-setor="${esc(setor)}" value="${esc(getHorarioPadrao().hora_fim_2)}" />
        </div>
        <button type="button" class="plantao-btn primary" data-add="${esc(setor)}">Adicionar</button>
      </div>

      <div class="plantao-person-list">
        ${rows.length ? rows.map((row, idx) => `
          <div class="plantao-person" data-row="${idx}" data-setor="${esc(setor)}">
            <div>
              <span class="plantao-date-pill">${esc(weekdayBR(row.data_plantao))} · ${esc(formatDateBR(row.data_plantao))}</span>
              <strong>${esc(row.nome)}</strong>
              <span>${esc(row.cpf || row.colaborador_key || '')}</span>
            </div>
            <div><span>Contato</span><br>${esc(formatPhone(row.telefone) || '-')}</div>
            <div><span>Horário</span><br>${esc(buildHorario(row) || '-')}</div>
            <button type="button" class="plantao-btn danger" data-remove-row="${idx}" data-setor="${esc(setor)}">Remover</button>
          </div>
        `).join('') : '<div class="plantao-meta">Nenhum plantonista adicionado neste setor.</div>'}
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
      if (setorAtivo === setor) setorAtivo = DEFAULT_SETORES[0];
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

  const getField = (name) => section.querySelector(`[data-field="${name}"]`)?.value || '';
  const padrao = getHorarioPadrao();
  const data_plantao = getField('data_plantao') || document.getElementById('plantaoData').value;
  const hora_inicio = getField('hora_inicio') || padrao.hora_inicio;
  const hora_fim = getField('hora_fim') || padrao.hora_fim;
  const hora_inicio_2 = getField('hora_inicio_2') || padrao.hora_inicio_2;
  const hora_fim_2 = getField('hora_fim_2') || padrao.hora_fim_2;

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



function drawBackground(ctx) {
  // Fundo principal — gradiente diagonal mais profundo
  const grad = ctx.createLinearGradient(0, 0, IMG_W * .6, IMG_H);
  grad.addColorStop(0,   '#010503');
  grad.addColorStop(.30, '#050e08');
  grad.addColorStop(.65, '#061410');
  grad.addColorStop(1,   '#081e16');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, IMG_W, IMG_H);

  // Sidebar escura
  const sidebarW = 286;
  const sideGrad = ctx.createLinearGradient(0, 0, sidebarW, 0);
  sideGrad.addColorStop(0,   '#020705');
  sideGrad.addColorStop(.65, '#061008');
  sideGrad.addColorStop(1,   '#030d07');
  ctx.fillStyle = sideGrad;
  ctx.fillRect(0, 0, sidebarW, IMG_H);

  // Linha de separação verde nítida
  const lineGrad = ctx.createLinearGradient(0, 60, 0, IMG_H - 60);
  lineGrad.addColorStop(0,   'rgba(34,197,94,0)');
  lineGrad.addColorStop(.12, 'rgba(34,197,94,.95)');
  lineGrad.addColorStop(.88, 'rgba(34,197,94,.95)');
  lineGrad.addColorStop(1,   'rgba(34,197,94,0)');
  ctx.fillStyle = lineGrad;
  ctx.fillRect(sidebarW - 2, 0, 3, IMG_H);

  // Halo ao redor da linha
  const sideGlow = ctx.createLinearGradient(sidebarW - 22, 0, sidebarW + 18, 0);
  sideGlow.addColorStop(0,  'rgba(34,197,94,0)');
  sideGlow.addColorStop(.4, 'rgba(34,197,94,.07)');
  sideGlow.addColorStop(.6, 'rgba(34,197,94,.07)');
  sideGlow.addColorStop(1,  'rgba(34,197,94,0)');
  ctx.fillStyle = sideGlow;
  ctx.fillRect(sidebarW - 22, 0, 40, IMG_H);

  // Glow atmosférico central-superior
  const glow1 = ctx.createRadialGradient(860, 220, 20, 860, 220, 620);
  glow1.addColorStop(0,   'rgba(34,197,94,.14)');
  glow1.addColorStop(.5,  'rgba(34,197,94,.05)');
  glow1.addColorStop(1,   'rgba(34,197,94,0)');
  ctx.fillStyle = glow1;
  ctx.fillRect(0, 0, IMG_W, IMG_H);

  // Glow topo-direita (acento frio)
  const glow2 = ctx.createRadialGradient(1340, 90, 10, 1340, 90, 420);
  glow2.addColorStop(0, 'rgba(111,208,165,.16)');
  glow2.addColorStop(1, 'rgba(111,208,165,0)');
  ctx.fillStyle = glow2;
  ctx.fillRect(0, 0, IMG_W, IMG_H);

  // Glow baixo-esquerda (sidebar)
  const glow3 = ctx.createRadialGradient(143, 920, 10, 143, 920, 260);
  glow3.addColorStop(0, 'rgba(34,197,94,.09)');
  glow3.addColorStop(1, 'rgba(34,197,94,0)');
  ctx.fillStyle = glow3;
  ctx.fillRect(0, 600, 286, IMG_H - 600);

  // Padrões hexagonais
  drawHexPattern(ctx, 16, 160, 70, 6, 7, .07);
  drawHexPattern(ctx, 920, -44, 96, 6, 4, .032);
}

function drawHexPattern(ctx, startX, startY, r, cols, rows, alpha = .08) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = '#6fd0a5';
  ctx.lineWidth = 2;
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const x = startX + col * r * 1.55 + (row % 2 ? r * .78 : 0);
      const y = startY + row * r * 1.35;
      ctx.beginPath();
      for (let a = 0; a < 6; a += 1) {
        const px = x + r * Math.cos(Math.PI / 3 * a);
        const py = y + r * Math.sin(Math.PI / 3 * a);
        if (a === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.stroke();
    }
  }
  ctx.restore();
}

async function drawLogo(ctx) {
  try {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = './logo-grao1000.svg';
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
    });
    ctx.drawImage(img, 38, 60, 214, 90);
  } catch {
    ctx.fillStyle = '#6fd0a5';
    ctx.font = 'bold 43px Arial';
    ctx.fillText('GRÃO1000', 34, 112);
    ctx.font = '16px Arial';
    ctx.fillText('Sustentabilidade e Logística', 36, 140);
  }
}

function drawRoundRectFilled(ctx, x, y, w, h, r, fillStyle, strokeStyle = '', lineWidth = 1) {
  drawRoundRect(ctx, x, y, w, h, r);
  if (fillStyle) {
    ctx.fillStyle = fillStyle;
    ctx.fill();
  }
  if (strokeStyle) {
    ctx.strokeStyle = strokeStyle;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
  }
}

function fitText(ctx, value, maxWidth) {
  let text = String(value || '');
  if (!text) return '';
  if (ctx.measureText(text).width <= maxWidth) return text;
  while (text.length > 4 && ctx.measureText(`${text}…`).width > maxWidth) text = text.slice(0, -1);
  return `${text}…`;
}

function drawPill(ctx, x, y, text, options = {}) {
  const {
    bg = 'rgba(22,101,52,.22)',
    border = 'rgba(111,208,165,.28)',
    color = '#dcfce7',
    font = 'bold 22px Arial',
    px = 16,
    py = 10,
    radius = 999,
  } = options;

  ctx.save();
  ctx.font = font;
  const metrics = ctx.measureText(text);
  const h = 22 + py * 2;
  const w = Math.ceil(metrics.width + px * 2);
  drawRoundRectFilled(ctx, x, y, w, h, radius, bg, border, 1.5);
  ctx.fillStyle = color;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x + px, y + h / 2 + 1);
  ctx.restore();
  return { width: w, height: h };
}

function drawCanvasIcon(ctx, type, x, y, size = 28, color = '#66e36f') {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = Math.max(2, size / 12);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const s = size;
  if (type === 'phone') {
    ctx.beginPath();
    ctx.moveTo(x + s * .25, y + s * .18);
    ctx.quadraticCurveTo(x + s * .12, y + s * .25, x + s * .18, y + s * .42);
    ctx.quadraticCurveTo(x + s * .34, y + s * .78, x + s * .69, y + s * .86);
    ctx.quadraticCurveTo(x + s * .84, y + s * .90, x + s * .90, y + s * .74);
    ctx.lineTo(x + s * .74, y + s * .62);
    ctx.quadraticCurveTo(x + s * .67, y + s * .58, x + s * .60, y + s * .65);
    ctx.lineTo(x + s * .53, y + s * .72);
    ctx.quadraticCurveTo(x + s * .38, y + s * .66, x + s * .28, y + s * .47);
    ctx.lineTo(x + s * .36, y + s * .40);
    ctx.quadraticCurveTo(x + s * .43, y + s * .33, x + s * .38, y + s * .25);
    ctx.closePath();
    ctx.stroke();
  } else if (type === 'mail') {
    drawRoundRect(ctx, x + s * .12, y + s * .22, s * .76, s * .56, s * .06);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x + s * .16, y + s * .28);
    ctx.lineTo(x + s * .50, y + s * .54);
    ctx.lineTo(x + s * .84, y + s * .28);
    ctx.stroke();
  } else if (type === 'clock') {
    ctx.beginPath();
    ctx.arc(x + s * .5, y + s * .5, s * .34, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x + s * .5, y + s * .30);
    ctx.lineTo(x + s * .5, y + s * .52);
    ctx.lineTo(x + s * .66, y + s * .60);
    ctx.stroke();
  } else if (type === 'calendar') {
    drawRoundRect(ctx, x + s * .14, y + s * .18, s * .72, s * .68, s * .06);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x + s * .14, y + s * .38);
    ctx.lineTo(x + s * .86, y + s * .38);
    ctx.moveTo(x + s * .32, y + s * .10);
    ctx.lineTo(x + s * .32, y + s * .28);
    ctx.moveTo(x + s * .68, y + s * .10);
    ctx.lineTo(x + s * .68, y + s * .28);
    ctx.stroke();
  } else if (type === 'truck') {
    drawRoundRect(ctx, x + s * .10, y + s * .34, s * .48, s * .28, s * .04);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x + s * .58, y + s * .42);
    ctx.lineTo(x + s * .72, y + s * .42);
    ctx.lineTo(x + s * .86, y + s * .54);
    ctx.lineTo(x + s * .86, y + s * .62);
    ctx.lineTo(x + s * .58, y + s * .62);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x + s * .28, y + s * .70, s * .08, 0, Math.PI * 2);
    ctx.arc(x + s * .72, y + s * .70, s * .08, 0, Math.PI * 2);
    ctx.stroke();
  } else if (type === 'people') {
    ctx.beginPath();
    ctx.arc(x + s * .38, y + s * .34, s * .12, 0, Math.PI * 2);
    ctx.arc(x + s * .64, y + s * .40, s * .10, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x + s * .38, y + s * .78, s * .26, Math.PI, 0);
    ctx.arc(x + s * .64, y + s * .78, s * .20, Math.PI, 0);
    ctx.stroke();
  } else if (type === 'box') {
    ctx.beginPath();
    ctx.moveTo(x + s * .50, y + s * .14);
    ctx.lineTo(x + s * .82, y + s * .32);
    ctx.lineTo(x + s * .82, y + s * .68);
    ctx.lineTo(x + s * .50, y + s * .86);
    ctx.lineTo(x + s * .18, y + s * .68);
    ctx.lineTo(x + s * .18, y + s * .32);
    ctx.closePath();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x + s * .18, y + s * .32);
    ctx.lineTo(x + s * .50, y + s * .50);
    ctx.lineTo(x + s * .82, y + s * .32);
    ctx.moveTo(x + s * .50, y + s * .50);
    ctx.lineTo(x + s * .50, y + s * .86);
    ctx.stroke();
  } else if (type === 'cash') {
    drawRoundRect(ctx, x + s * .14, y + s * .28, s * .72, s * .46, s * .05);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x + s * .5, y + s * .51, s * .12, 0, Math.PI * 2);
    ctx.stroke();
  } else if (type === 'headset') {
    ctx.beginPath();
    ctx.arc(x + s * .5, y + s * .50, s * .32, Math.PI, 0);
    ctx.stroke();
    drawRoundRect(ctx, x + s * .18, y + s * .48, s * .14, s * .24, s * .06);
    drawRoundRect(ctx, x + s * .68, y + s * .48, s * .14, s * .24, s * .06);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x + s * .68, y + s * .75);
    ctx.lineTo(x + s * .55, y + s * .82);
    ctx.stroke();
  } else if (type === 'leaf') {
    ctx.beginPath();
    ctx.moveTo(x + s * .20, y + s * .78);
    ctx.quadraticCurveTo(x + s * .22, y + s * .18, x + s * .78, y + s * .16);
    ctx.quadraticCurveTo(x + s * .82, y + s * .72, x + s * .20, y + s * .78);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x + s * .22, y + s * .78);
    ctx.lineTo(x + s * .70, y + s * .26);
    ctx.stroke();
  }
  ctx.restore();
}

function sectorIcon(setor) {
  const n = norm(setor);
  if (n.includes('FROTA')) return 'truck';
  if (n === 'RH' || n.includes('RECURSOS')) return 'people';
  if (n.includes('LOGIST')) return 'box';
  if (n.includes('TROCA') || n.includes('NOTA')) return 'mail';
  if (n.includes('CAIXA')) return 'cash';
  return 'cash';
}

function formatPeriodText(dataIni, dataFim) {
  if (!dataIni || dataIni === dataFim) return formatDateBR(dataIni);
  return `${formatDateBR(dataIni)} e ${formatDateBR(dataFim)}`;
}

function formatCardDateLabel(dates) {
  const uniqueDates = [...new Set((dates || []).filter(Boolean))].sort();
  if (!uniqueDates.length) return '';
  if (uniqueDates.length === 1) return `${weekdayBR(uniqueDates[0])} • ${formatDateBR(uniqueDates[0])}`;
  const weekdays = [...new Set(uniqueDates.map(weekdayBR))];
  const weekLabel = weekdays.length === 2 && weekdays[0] === 'Sábado' && weekdays[1] === 'Domingo'
    ? 'Sábado e Domingo'
    : weekdays.join(' e ');
  return `${weekLabel} • ${uniqueDates.map(formatDateBR).join(' e ')}`;
}

function groupRowsForDivulgacao(rows) {
  const bySector = new Map();
  rows.forEach((row) => {
    const setor = row.setor || '';
    const key = [
      norm(row.nome),
      onlyDigits(row.telefone),
      norm(row.email_corporativo || row.email),
      row.hora_inicio || '',
      row.hora_fim || '',
      row.hora_inicio_2 || '',
      row.hora_fim_2 || '',
    ].join('|');
    if (!bySector.has(setor)) bySector.set(setor, new Map());
    const people = bySector.get(setor);
    if (!people.has(key)) people.set(key, { ...row, dates: [] });
    const item = people.get(key);
    if (row.data_plantao && !item.dates.includes(row.data_plantao)) item.dates.push(row.data_plantao);
  });

  return [...bySector.entries()].map(([setor, peopleMap]) => ({
    setor,
    people: [...peopleMap.values()].map((p) => ({ ...p, dates: p.dates.sort() })),
  }));
}

function getDivulgacaoSetores(titleSetor) {
  if (titleSetor !== 'todos') return [titleSetor];
  return [...SETORES_DIVULGACAO_PADRAO];
}

function shortDisplayName(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '';
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1]}`;
}

function drawInfoLine(ctx, icon, label, value, x, y, maxW, compact = false) {
  const iconSize = compact ? 24 : 28;
  drawRoundRectFilled(ctx, x, y - 2, iconSize + 12, iconSize + 12, 13, 'rgba(255,255,255,.04)', 'rgba(132,184,158,.16)', 1);
  drawCanvasIcon(ctx, icon, x + 6, y + 4, iconSize, '#72c99a');
  ctx.fillStyle = '#98b4a8';
  ctx.font = `bold ${compact ? 12 : 13}px Arial`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(label, x + iconSize + 26, y + 1);
  ctx.fillStyle = '#e6efea';
  ctx.font = `bold ${compact ? 16 : 18}px Arial`;
  ctx.fillText(fitText(ctx, value || '-', maxW - iconSize - 28), x + iconSize + 26, y + (compact ? 15 : 17));
}

function drawSectorCard(ctx, card, x, y, w, h, dateFallback) {
  // Fundo com gradiente diagonal
  ctx.save();
  drawRoundRect(ctx, x, y, w, h, 22);
  ctx.clip();
  const bgGrad = ctx.createLinearGradient(x, y, x + w * .7, y + h);
  bgGrad.addColorStop(0,   'rgba(14,32,24,.96)');
  bgGrad.addColorStop(.5,  'rgba(9,22,17,.92)');
  bgGrad.addColorStop(1,   'rgba(6,15,11,.94)');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(x, y, w, h);
  // Highlight sutil no topo
  const topHighlight = ctx.createLinearGradient(x, y, x, y + 90);
  topHighlight.addColorStop(0, 'rgba(111,208,165,.07)');
  topHighlight.addColorStop(1, 'rgba(111,208,165,0)');
  ctx.fillStyle = topHighlight;
  ctx.fillRect(x, y, w, h);
  ctx.restore();

  // Borda gradiente (canto superior-esquerdo mais brilhante)
  ctx.save();
  const borderGrad = ctx.createLinearGradient(x, y, x + w * .55, y + h * .55);
  borderGrad.addColorStop(0,  'rgba(111,208,165,.65)');
  borderGrad.addColorStop(.35,'rgba(111,208,165,.35)');
  borderGrad.addColorStop(1,  'rgba(111,208,165,.08)');
  ctx.strokeStyle = borderGrad;
  ctx.lineWidth = 1.5;
  drawRoundRect(ctx, x, y, w, h, 22);
  ctx.stroke();
  ctx.restore();

  // Barra de acento esquerda
  ctx.save();
  const accentGrad = ctx.createLinearGradient(0, y + 30, 0, y + h - 30);
  accentGrad.addColorStop(0,   'rgba(34,197,94,0)');
  accentGrad.addColorStop(.15, 'rgba(34,197,94,.95)');
  accentGrad.addColorStop(.85, 'rgba(34,197,94,.95)');
  accentGrad.addColorStop(1,   'rgba(34,197,94,0)');
  ctx.fillStyle = accentGrad;
  ctx.beginPath();
  ctx.roundRect(x, y + 22, 3, h - 44, [0, 2, 2, 0]);
  ctx.fill();
  ctx.restore();

  // --- Cabeçalho: data ---
  const dateLabel = formatCardDateLabel(card.people.flatMap((p) => p.dates || [])) || dateFallback;
  ctx.save();
  ctx.font = 'bold 16px Arial';
  const dateLabelW = ctx.measureText(dateLabel).width;
  drawRoundRectFilled(ctx, x + 20, y + 16, dateLabelW + 52, 32, 8,
    'rgba(34,197,94,.07)', 'rgba(34,197,94,.20)', 1);
  drawCanvasIcon(ctx, 'calendar', x + 26, y + 19, 20, '#5ed490');
  ctx.fillStyle = '#8fd9b5';
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  ctx.fillText(fitText(ctx, dateLabel, w - 56), x + 52, y + 22);
  ctx.restore();

  // --- Badge de setor ---
  const badgeY = y + 62;
  // Ícone com fundo brilhante
  drawRoundRectFilled(ctx, x + 20, badgeY, 52, 52, 13,
    'rgba(34,197,94,.10)', 'rgba(34,197,94,.28)', 1.5);
  drawCanvasIcon(ctx, sectorIcon(card.setor), x + 30, badgeY + 10, 32, '#5ed490');
  // Pill do setor
  drawPill(ctx, x + 84, badgeY + 8, card.setor, {
    bg: 'rgba(34,197,94,.10)',
    border: 'rgba(34,197,94,.30)',
    color: '#a8e8c4',
    font: 'bold 23px Arial',
    px: 16, py: 7, radius: 10,
  });

  // Separador após badge
  ctx.fillStyle = 'rgba(111,208,165,.12)';
  ctx.fillRect(x + 20, badgeY + 60, w - 40, 1);

  // --- Plantonistas ---
  const people = card.people.length
    ? card.people
    : [{ nome: 'Sem plantonista cadastrado', telefone: '', email: '', email_corporativo: '', dates: [] }];
  const compact = people.length > 1;
  const maxPeople = compact ? 2 : 1;
  let personY = badgeY + 72;

  people.slice(0, maxPeople).forEach((person, idx) => {
    // Nome — exibe nome completo, maior destaque
    const displayName = (person.nome || '-').trim();
    ctx.font = `bold ${compact ? 21 : 28}px Arial`;
    ctx.fillStyle = '#f0f7f2';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(fitText(ctx, displayName, w - 48), x + 20, personY);

    // Linha divisória fina
    const lineY = personY + (compact ? 29 : 37);
    const lineGrad = ctx.createLinearGradient(x + 20, 0, x + w - 20, 0);
    lineGrad.addColorStop(0, 'rgba(111,208,165,.22)');
    lineGrad.addColorStop(.6, 'rgba(111,208,165,.10)');
    lineGrad.addColorStop(1, 'rgba(111,208,165,0)');
    ctx.fillStyle = lineGrad;
    ctx.fillRect(x + 20, lineY, w - 40, 1);

    const infoY = lineY + 10;
    const phone   = formatPhone(person.telefone) || '-';
    const email   = person.email_corporativo || person.email || '-';
    const horario = buildHorario(person) || '-';
    const spacing = compact ? 40 : 48;

    drawInfoLine(ctx, 'phone', 'Contato', phone,   x + 20, infoY,             w - 40, compact);
    drawInfoLine(ctx, 'mail',  'E-mail',  email,   x + 20, infoY + spacing,   w - 40, compact);
    drawInfoLine(ctx, 'clock', 'Horário', horario, x + 20, infoY + spacing*2, w - 40, compact);

    personY += compact ? 168 : 0;

    if (compact && idx === 0) {
      ctx.fillStyle = 'rgba(111,208,165,.08)';
      ctx.fillRect(x + 20, personY - 8, w - 40, 1);
    }
  });

  if (people.length > maxPeople) {
    drawPill(ctx, x + 20, y + h - 38, `+ ${people.length - maxPeople} plantonista(s) na escala completa`, {
      bg: 'rgba(255,255,255,.03)', border: 'rgba(111,208,165,.14)',
      color: '#c4ddd1', font: 'bold 13px Arial', px: 12, py: 5, radius: 999,
    });
  }
}

function getRowsForDivulgacao(sectorOverride) {
  const dataIni = document.getElementById('plantaoImgData')?.value || document.getElementById('plantaoData')?.value || '';
  const dataFim = document.getElementById('plantaoImgDataFim')?.value || document.getElementById('plantaoDataFim')?.value || dataIni;
  const setorFiltro = sectorOverride !== undefined ? sectorOverride : 'todos';

  const rows = [];
  Object.entries(escala).forEach(([setor, pessoas]) => {
    pessoas.forEach((p) => {
      const date = p.data_plantao || dataIni;
      if (date >= dataIni && date <= dataFim && (setorFiltro === 'todos' || setorFiltro === setor)) {
        rows.push({ ...p, setor, data_plantao: date });
      }
    });
  });

  rows.sort((a, b) => {
    const orderA = SETORES_DIVULGACAO_PADRAO.findIndex((s) => norm(s) === norm(a.setor));
    const orderB = SETORES_DIVULGACAO_PADRAO.findIndex((s) => norm(s) === norm(b.setor));
    const fixedA = orderA < 0 ? 999 : orderA;
    const fixedB = orderB < 0 ? 999 : orderB;
    if (fixedA !== fixedB) return fixedA - fixedB;
    const bySetor = String(a.setor || '').localeCompare(String(b.setor || ''));
    if (bySetor) return bySetor;
    const byDate = String(a.data_plantao || '').localeCompare(String(b.data_plantao || ''));
    if (byDate) return byDate;
    return String(a.nome || '').localeCompare(String(b.nome || ''));
  });
  return rows;
}

async function renderImagemPlantao() {
  const canvas = document.getElementById('plantaoCanvas');
  if (!canvas) return;
  canvas.width = IMG_W;
  canvas.height = IMG_H;
  const ctx = canvas.getContext('2d');

  drawBackground(ctx);
  await drawLogo(ctx);

  const dataIni = document.getElementById('plantaoImgData')?.value || document.getElementById('plantaoData')?.value || '';
  const dataFim = document.getElementById('plantaoImgDataFim')?.value || document.getElementById('plantaoDataFim')?.value || dataIni;
  const titleSetor = document.getElementById('plantaoImgSetor')?.value || 'todos';
  const rows = getRowsForDivulgacao();
  const grouped = groupRowsForDivulgacao(rows);
  const bySetor = new Map(grouped.map((card) => [norm(card.setor), card]));
  const displaySetores = getDivulgacaoSetores(titleSetor);
  const cards = displaySetores.map((setor) => bySetor.get(norm(setor)) || { setor, people: [] });
  const dateText = formatPeriodText(dataIni, dataFim);
  const dateFallback = dataIni === dataFim
    ? `${weekdayBR(dataIni)} • ${formatDateBR(dataIni)}`
    : `${weekdayBR(dataIni)} e ${weekdayBR(dataFim)} • ${formatDateBR(dataIni)} e ${formatDateBR(dataFim)}`;

  const mainX = 342;

  // Linha decorativa antes do título
  const titleLineGrad = ctx.createLinearGradient(mainX - 18, 0, mainX + 340, 0);
  titleLineGrad.addColorStop(0, 'rgba(34,197,94,.7)');
  titleLineGrad.addColorStop(.5, 'rgba(34,197,94,.3)');
  titleLineGrad.addColorStop(1, 'rgba(34,197,94,0)');
  ctx.fillStyle = titleLineGrad;
  ctx.fillRect(mainX - 18, 50, 320, 2);

  // Título principal — maior, gradiente de cor
  ctx.save();
  const titleGrad = ctx.createLinearGradient(mainX, 62, mainX + 600, 62);
  titleGrad.addColorStop(0,   '#f0f7f2');
  titleGrad.addColorStop(.55, '#c8e8d6');
  titleGrad.addColorStop(1,   '#8fd9b5');
  ctx.fillStyle = titleGrad;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.font = 'bold 72px Arial';
  ctx.fillText('Escala de Plantão', mainX - 18, 60);
  ctx.restore();

  // Subtítulo
  ctx.fillStyle = '#7fa898';
  ctx.font = '20px Arial';
  ctx.fillText('Relação de plantonistas escalados para atendimento no período informado.', mainX - 16, 152);

  // Chips de setor e período
  const chipSetor = drawPill(ctx, mainX - 18, 196, titleSetor === 'todos' ? 'Todos os setores' : `Setor: ${titleSetor}`, {
    bg: 'rgba(34,197,94,.09)',
    border: 'rgba(34,197,94,.30)',
    color: '#a8e8c4',
    font: 'bold 20px Arial',
    px: 16, py: 8,
  });
  // Separador vertical
  ctx.fillStyle = 'rgba(111,208,165,.20)';
  ctx.fillRect(mainX - 18 + chipSetor.width + 20, 200, 1.5, 36);
  // Ícone + label período
  drawCanvasIcon(ctx, 'calendar', mainX - 18 + chipSetor.width + 40, 198, 34, '#5ed490');
  ctx.fillStyle = '#c0d8cc';
  ctx.font = 'bold 20px Arial';
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  ctx.fillText('Período:', mainX - 18 + chipSetor.width + 82, 200);
  ctx.fillStyle = '#8fd9b5';
  ctx.fillText(dateText, mainX - 18 + chipSetor.width + 194, 200);

  // Linha divisória principal
  const divGrad = ctx.createLinearGradient(mainX - 18, 0, IMG_W - 68, 0);
  divGrad.addColorStop(0,  'rgba(111,208,165,.28)');
  divGrad.addColorStop(.5, 'rgba(111,208,165,.12)');
  divGrad.addColorStop(1,  'rgba(111,208,165,0)');
  ctx.fillStyle = divGrad;
  ctx.fillRect(mainX - 18, 260, IMG_W - mainX - 50, 1.5);

  if (!rows.length) {
    drawRoundRectFilled(ctx, mainX - 18, 306, IMG_W - mainX - 68, 300, 26, 'rgba(7,18,14,.88)', 'rgba(111,208,165,.18)', 1.2);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 42px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('Nenhum plantonista cadastrado', mainX + (IMG_W - mainX - 68) / 2, 410);
    ctx.fillStyle = '#b7d8c9';
    ctx.font = '25px Arial';
    ctx.fillText('Ajuste os filtros e atualize a imagem.', mainX + (IMG_W - mainX - 68) / 2, 468);
  } else {
    const gridX = mainX - 18;
    const gridY = 284;
    const gap = 20;
    const cardW = Math.floor((IMG_W - gridX - 60 - gap) / 2);
    const cardH = 344;
    cards.slice(0, 4).forEach((card, idx) => {
      const x = gridX + (idx % 2) * (cardW + gap);
      const y = gridY + Math.floor(idx / 2) * (cardH + 18);
      drawSectorCard(ctx, card, x, y, cardW, cardH, dateFallback);
    });
  }

  // Sidebar — ícone de headset com glow
  const hsGlow = ctx.createRadialGradient(118, 838, 10, 118, 838, 70);
  hsGlow.addColorStop(0, 'rgba(34,197,94,.18)');
  hsGlow.addColorStop(1, 'rgba(34,197,94,0)');
  ctx.fillStyle = hsGlow;
  ctx.fillRect(48, 768, 140, 140);
  drawRoundRectFilled(ctx, 68, 790, 100, 100, 24, 'rgba(14,34,26,.72)', 'rgba(34,197,94,.35)', 1.5);
  drawCanvasIcon(ctx, 'headset', 84, 808, 62, '#4de090');

  ctx.fillStyle = '#5ed490';
  ctx.font = 'bold 21px Arial';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText('ATENDIMENTO', 50, 908);
  ctx.fillStyle = '#dceee4';
  ctx.font = 'bold 19px Arial';
  ctx.fillText('QUE MOVE', 50, 936);
  ctx.fillText('O AGRO.', 50, 962);

  // Rodapé
  const footerY = 1032;
  const footGrad = ctx.createLinearGradient(mainX - 18, 0, IMG_W - 68, 0);
  footGrad.addColorStop(0,  'rgba(111,208,165,.24)');
  footGrad.addColorStop(.5, 'rgba(111,208,165,.10)');
  footGrad.addColorStop(1,  'rgba(111,208,165,0)');
  ctx.fillStyle = footGrad;
  ctx.fillRect(mainX - 18, footerY - 18, IMG_W - mainX - 50, 1.5);
  drawCanvasIcon(ctx, 'box', mainX - 14, footerY - 10, 32, '#5ed490');
  ctx.fillStyle = '#a0c4b4';
  ctx.font = '18px Arial';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText('Compromisso, agilidade e confiança para manter o agro sempre em movimento.', mainX + 28, footerY - 2);
  ctx.fillStyle = 'rgba(111,208,165,.18)';
  ctx.fillRect(1084, footerY - 12, 1.5, 40);
  drawCanvasIcon(ctx, 'leaf', 1112, footerY - 10, 34, '#5ed490');
  ctx.fillStyle = '#7fd4a8';
  ctx.font = 'bold 18px Arial';
  ctx.fillText('www.grao1000.com.br', 1160, footerY - 2);
}

function baixarImagemPlantao() {
  const canvas = document.getElementById('plantaoCanvas');
  if (!canvas) return;
  const dataIni = document.getElementById('plantaoImgData')?.value || todayISO();
  const link = document.createElement('a');
  link.download = `plantao_${dataIni}.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();
}

function renderDivulgacaoControls() {
  const select = document.getElementById('plantaoImgSetor');
  if (!select) return;
  select.innerHTML = `<option value="todos">Todos os setores</option>${setores.map((s) => `<option value="${esc(s)}">${esc(s)}</option>`).join('')}`;
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
    renderDivulgacaoControls();
    renderImagemPlantao();
  }
}

function renderPage(content) {
  const dataIni = nextWeekendBase();
  const dataFim = addDaysISO(dataIni, 1);

  content.innerHTML = `
    <section class="plantao-page">
      <div class="section-heading">
        <div>
          <h2>Plantão</h2>
          <p class="section-subtitle">Escolha o setor no topo, informe data, colaborador e horário do responsável, consulte plantões salvos e gere a arte de divulgação.</p>
        </div>
      </div>

      ${renderKpis()}

      <div class="plantao-tabs">
        <button type="button" class="plantao-tab active" data-tab="escala">Escala</button>
        <button type="button" class="plantao-tab" data-tab="programacao">Programar várias semanas</button>
        <button type="button" class="plantao-tab" data-tab="consulta">Consultar datas</button>
        <button type="button" class="plantao-tab" data-tab="contatos">Contatos</button>
        <button type="button" class="plantao-tab" data-tab="divulgacao">Divulgação</button>
      </div>

      <div class="plantao-panel active" data-panel="escala">
        <div class="plantao-card">
          <div class="plantao-grid">
            <div class="plantao-field quarter">
              <label class="plantao-label" for="plantaoData">Data inicial</label>
              <input class="plantao-input" type="date" id="plantaoData" value="${dataIni}" />
            </div>
            <div class="plantao-field quarter">
              <label class="plantao-label" for="plantaoDataFim">Data final</label>
              <input class="plantao-input" type="date" id="plantaoDataFim" value="${dataFim}" />
            </div>
            <div class="plantao-field half">
              <label class="plantao-label" for="plantaoEvento">Evento / observação do final de semana</label>
              <input class="plantao-input" id="plantaoEvento" placeholder="Ex.: Sábado e domingo / feriado / plantão operação" />
            </div>
            <div class="plantao-field quarter">
              <label class="plantao-label" for="plantaoPadraoInicio1">Horário padrão · Início 1</label>
              <input class="plantao-input" type="time" id="plantaoPadraoInicio1" value="08:00" />
            </div>
            <div class="plantao-field quarter">
              <label class="plantao-label" for="plantaoPadraoFim1">Horário padrão · Fim 1</label>
              <input class="plantao-input" type="time" id="plantaoPadraoFim1" value="12:00" />
            </div>
            <div class="plantao-field quarter">
              <label class="plantao-label" for="plantaoPadraoInicio2">Horário padrão · Início 2</label>
              <input class="plantao-input" type="time" id="plantaoPadraoInicio2" value="13:30" />
            </div>
            <div class="plantao-field quarter">
              <label class="plantao-label" for="plantaoPadraoFim2">Horário padrão · Fim 2</label>
              <input class="plantao-input" type="time" id="plantaoPadraoFim2" value="18:00" />
            </div>
            <div class="plantao-field">
              <div class="plantao-actions">
                <button type="button" class="plantao-btn secondary" id="btnAplicarHorarioPadrao">Aplicar horário padrão nos campos</button>
                <span class="plantao-meta">Use este horário para preencher rápido os setores; depois ajuste individualmente quando precisar.</span>
              </div>
            </div>
            <div class="plantao-field">
              <label class="plantao-label" for="plantaoObs">Observações internas</label>
              <textarea class="plantao-textarea" id="plantaoObs" placeholder="Observações opcionais para controle interno"></textarea>
            </div>
          </div>

          <div class="plantao-actions" style="margin-top:14px;">
            <button type="button" class="plantao-btn secondary" id="btnCarregarPlantao">Carregar período</button>
            <button type="button" class="plantao-btn primary" id="btnSalvarPlantao">Salvar plantão</button>
            <input class="plantao-input" id="plantaoNovoSetor" placeholder="Adicionar novo setor" style="max-width:260px;" />
            <button type="button" class="plantao-btn secondary" id="btnAddSetor">Adicionar setor</button>
          </div>
          <div class="plantao-feedback" id="plantaoFeedback"></div>
        </div>

        <div class="plantao-card" style="padding:14px 16px;"><div class="plantao-meta">Setores fixos conforme controle atual: RH, Logística, Frotas, Caixas e Troca de Notas. Clique em um botão para preencher a escala do setor.</div></div>
        <div class="plantao-setores" id="plantaoSetores"></div>
      </div>

      <div class="plantao-panel" data-panel="programacao">
        <div class="plantao-card">
          <div class="section-heading">
            <div>
              <h3 style="margin:0 0 6px;">Programar escala por várias semanas</h3>
              <p class="plantao-meta">Monte uma escala-base uma única vez, salve como modelo e gere automaticamente vários finais de semana.</p>
            </div>
          </div>

          <div class="plantao-actions" style="margin-top:12px;">
            <button type="button" class="plantao-btn secondary" id="btnSalvarModeloPlantao">Salvar escala atual como modelo</button>
            <button type="button" class="plantao-btn secondary" id="btnCarregarModeloPlantao">Carregar modelo padrão</button>
          </div>
          <div class="plantao-feedback" id="plantaoProgramacaoFeedback"></div>

          <div class="plantao-grid" style="margin-top:14px;">
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
              <label class="plantao-label">Dias que entram na programação</label>
              <div class="plantao-radio-row">
                <label><input type="checkbox" id="progSexta" /> Sexta</label>
                <label><input type="checkbox" id="progSabado" checked /> Sábado</label>
                <label><input type="checkbox" id="progDomingo" checked /> Domingo</label>
              </div>
            </div>
            <div class="plantao-field half">
              <label class="plantao-label">Modo de geração</label>
              <div class="plantao-radio-row">
                <label><input type="radio" name="progModo" value="substituir" checked /> Substituir escala da tela</label>
                <label><input type="radio" name="progModo" value="somar" /> Somar na escala atual</label>
              </div>
            </div>
          </div>

          <div class="plantao-actions" style="margin-top:14px;">
            <button type="button" class="plantao-btn primary" id="btnGerarProgramacaoPlantao">Gerar programação</button>
            <button type="button" class="plantao-btn secondary" id="btnSalvarProgramacaoPlantao">Salvar programação gerada</button>
          </div>
        </div>

        <div class="plantao-card" style="margin-top:14px;">
          <h3 style="margin-top:0;">Modelo padrão salvo</h3>
          <div class="plantao-table-wrap">
            <table class="plantao-table">
              <thead>
                <tr>
                  <th>Setor</th>
                  <th>Colaborador</th>
                  <th>Telefone</th>
                  <th>E-mail</th>
                  <th>Horário</th>
                  <th>Ação</th>
                </tr>
              </thead>
              <tbody id="plantaoModeloBody"></tbody>
            </table>
          </div>
        </div>
      </div>


      <div class="plantao-panel" data-panel="consulta">
        <div class="plantao-card">
          <div class="section-heading">
            <div>
              <h3 style="margin:0 0 6px;">Consultar plantões salvos por data</h3>
              <p class="plantao-meta">Cada data fica salva separadamente. Use esta lista para localizar um plantão antigo, carregar para edição ou gerar a imagem de divulgação daquela data.</p>
            </div>
          </div>

          <div class="plantao-grid" style="margin-top:12px;">
            <div class="plantao-field quarter">
              <label class="plantao-label" for="consultaDataIni">Data inicial</label>
              <input class="plantao-input" type="date" id="consultaDataIni" value="${dataIni}" />
            </div>
            <div class="plantao-field quarter">
              <label class="plantao-label" for="consultaDataFim">Data final</label>
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
            <button type="button" class="plantao-btn primary" id="btnConsultarDatasPlantao">Consultar datas</button>
            <button type="button" class="plantao-btn secondary" id="btnConsultaProximos90">Próximos 90 dias</button>
          </div>
          <div class="plantao-feedback" id="plantaoConsultaFeedback"></div>
        </div>

        <div class="plantao-card" style="margin-top:14px;">
          <div id="plantaoConsultaLista" class="plantao-consulta-list"></div>
        </div>
      </div>

      <div class="plantao-panel" data-panel="contatos">
        <div class="plantao-card">
          <div class="section-heading">
            <div>
              <h3 style="margin:0 0 6px;">Contatos do plantão</h3>
              <p class="plantao-meta">Os dados vêm da base de colaboradores. Quando editar telefone ou e-mail corporativo aqui, o ajuste fica salvo para os próximos plantões.</p>
            </div>
            <input class="plantao-input" id="plantaoContatoBusca" placeholder="Buscar colaborador" style="max-width:320px;" />
          </div>
          <div class="plantao-feedback" id="plantaoContatosFeedback"></div>
          <div class="plantao-table-wrap" style="margin-top:14px;">
            <table class="plantao-table">
              <thead>
                <tr>
                  <th>Colaborador</th>
                  <th>CPF</th>
                  <th>Telefone</th>
                  <th>E-mail corporativo</th>
                  <th>Setor preferencial</th>
                  <th>Ação</th>
                </tr>
              </thead>
              <tbody id="plantaoContatosBody"></tbody>
            </table>
          </div>
        </div>
      </div>

      <div class="plantao-panel" data-panel="divulgacao">
        <div class="plantao-card">
          <div class="plantao-grid">
            <div class="plantao-field third">
              <label class="plantao-label" for="plantaoImgData">Data inicial da imagem</label>
              <input class="plantao-input" type="date" id="plantaoImgData" value="${dataIni}" />
            </div>
            <div class="plantao-field third">
              <label class="plantao-label" for="plantaoImgDataFim">Data final da imagem</label>
              <input class="plantao-input" type="date" id="plantaoImgDataFim" value="${dataFim}" />
            </div>
            <div class="plantao-field third">
              <label class="plantao-label" for="plantaoImgSetor">Setor</label>
              <select class="plantao-select" id="plantaoImgSetor"></select>
            </div>
          </div>
          <div class="plantao-actions" style="margin-top:14px;">
            <button type="button" class="plantao-btn secondary" id="btnAtualizarImagem">Atualizar imagem</button>
            <button type="button" class="plantao-btn primary" id="btnBaixarImagem">Baixar PNG</button>
          </div>
          <p class="plantao-meta">A arte usa o padrão escuro/verde dos modelos enviados. A versão resumida exibe até 5 plantonistas por imagem; se tiver mais, a escala completa permanece salva no painel.</p>
        </div>
        <div class="plantao-canvas-wrap plantao-card">
          <canvas id="plantaoCanvas" width="${IMG_W}" height="${IMG_H}"></canvas>
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
  document.getElementById('btnAtualizarImagem')?.addEventListener('click', renderImagemPlantao);
  document.getElementById('btnBaixarImagem')?.addEventListener('click', baixarImagemPlantao);
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

initProtectedPage('Plantão', async (content, userContext) => {
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
});
