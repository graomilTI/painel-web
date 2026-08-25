import { initProtectedPage } from './pageInit.js';
import { supabase } from './supabaseClient.js';
import { getCurrentUser, getUserContext } from './auth.js';
import { TODAS_SUPERVISOES } from './programacao-gestor-filtro-fix.js';
import { loadCustos, loadColaboradoresRegional } from './programacao-equipe.js?v=20260730-indisp-legado';
import { loadRosterDoDia, loadOsResumo, loadExtras } from './programacao-despesas.js?v=20260810-agrupar-hoteis';

const STEPS = [
  { code: 'A', label: 'Disponibilidade' },
  { code: 'B', label: 'Estadia' },
  { code: 'C', label: 'Alimentação' },
  { code: 'D', label: 'Deslocamento' },
  { code: 'E', label: 'Extras' },
];

const DISPONIBILIDADES = ['OK', 'LOGISTICA', 'DESLOCAMENTO', 'SEM EMBARQUE', 'INDISPONIVEL', 'ATESTADO', 'FALTA', 'FERIAS', 'FOLGA'];
// Etapa C (Disponibilidade) só lista quem não atende OS — "OK" agora é
// decidido só pela confirmação na etapa B (Organizar Equipe).
const DISPONIBILIDADES_ETAPA_C = ['LOGISTICA', 'DESLOCAMENTO', 'SEM EMBARQUE', 'INDISPONIVEL'];
const INDISPONIBILIDADE_MOTIVOS = ['ATESTADO', 'FALTA', 'FERIAS', 'FOLGA'];
const TIPOS_ESTADIA = ['CASA', 'PERNOITE', 'ALOJAMENTO', 'HOTEL'];
const TIPOS_ESTADIA_BOTOES = ['PERNOITE', 'ALOJAMENTO', 'HOTEL'];
const TIPOS_DESLOCAMENTO = ['NÃO PRECISA', 'MOTORISTA FROTA', 'CARONA FROTA', 'UBER/TÁXI', 'REEMBOLSO KM', 'ÔNIBUS', 'OUTRO'];
const TIPOS_EXTRA = ['ESTADIA', 'RECARGA', 'LAVAGEM', 'MANUTENÇÃO VEÍCULO', 'PEDÁGIO', 'ESTACIONAMENTO', 'MATERIAL', 'OUTRO'];
const SUPERVISAO_UF_MAP = {
  'BAHIA': 'BA',
  'CASCAVEL': 'PR',
  'GOIAS': 'GO',
  'LONDRINA': 'PR',
  'MARANHAO': 'MA',
  'MARINGA': 'PR',
  'MATO GROSSO DO SUL': 'MS',
  'MATO GROSSO': 'MT',
  'MINAS GERAIS': 'MG',
  'PARA': 'PA',
  'PONTA GROSSA': 'PR',
  'RIO GRANDE DO SUL': 'RS',
  'SP': 'SP',
  'TOCANTINS': 'TO',
};
const SUPERVISAO_UF_CHAVES = Object.keys(SUPERVISAO_UF_MAP).sort((a, b) => b.length - a.length);
const DISPONIBILIDADES_LIBERADAS = new Set(['', 'OK', 'DISPONIVEL', 'LIBERADO', 'LOGISTICA', 'DESLOCAMENTO']);

function debounce(fn, wait = 220) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function todayIso() {
  const now = new Date();
  const tz = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - tz).toISOString().slice(0, 10);
}

function brDate(iso) {
  if (!iso) return '-';
  const [ano, mes, dia] = String(iso).slice(0, 10).split('-');
  return ano && mes && dia ? `${dia}/${mes}/${ano}` : String(iso);
}

function normalizeCpf(value) {
  return String(value || '').replace(/\D/g, '');
}

function colaboradorKey(colab) {
  return normalizeCpf(colab.cpf) || String(colab.id || colab.nome || '').trim();
}

function toNumberBR(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const clean = String(value ?? '').replace(/\./g, '').replace(',', '.').replace(/[^0-9.-]/g, '');
  const parsed = Number(clean);
  return Number.isFinite(parsed) ? parsed : 0;
}

function moneyBR(value) {
  return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}

function normalizeUF(value) {
  return String(value || '').trim().toUpperCase().slice(0, 2);
}

function onlyPlate(value) {
  return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 7);
}

function firstFilled(...values) {
  return values.map((value) => String(value ?? '').trim()).find(Boolean) || '';
}

function splitPossibleNames(value) {
  return String(value || '')
    .split(/[;,|\n]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function pessoaMatchesColaborador(pessoa, colab) {
  if (!pessoa || !colab) return false;
  const cpfPessoa = normalizeCpf(pessoa.cpf || pessoa.documento || pessoa.cpf_colaborador || pessoa.colaborador_cpf);
  const cpfColab = normalizeCpf(colab.cpf);
  if (cpfPessoa && cpfColab && cpfPessoa === cpfColab) return true;

  const nomes = splitPossibleNames(firstFilled(pessoa.nome, pessoa.name, pessoa.motorista, pessoa.condutor, pessoa.colaborador, pessoa.responsavel));
  const nomeColab = normalizeText(colab.nome);
  if (!nomeColab) return false;
  return nomes.some((nome) => {
    const nomeNorm = normalizeText(nome);
    return nomeNorm && (nomeNorm === nomeColab || nomeNorm.includes(nomeColab) || nomeColab.includes(nomeNorm));
  });
}

function isColaboradorAtivo(colab) {
  if (!colab) return false;
  if (colab.ativo === false) return false;

  const situacao = normalizeAccessText(colab.situacao);
  const desligamento = String(colab.desligamento || '').trim();
  if (desligamento) return false;

  return ![
    'NAO ATIVO',
    'NAO ATIVA',
    'INATIVO',
    'INATIVA',
    'DESLIGADO',
    'DESLIGADA',
    'DEMITIDO',
    'DEMITIDA',
  ].some((status) => situacao.includes(status));
}


function normalizeAccessText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}

function getDeepValue(source, path) {
  return String(path || '').split('.').reduce((acc, key) => (acc && acc[key] !== undefined ? acc[key] : undefined), source);
}

function parseSupervisoes(value) {
  if (!value) return [];
  if (Array.isArray(value)) return [...new Set(value.flatMap(parseSupervisoes))];
  if (typeof value === 'object') {
    return parseSupervisoes(value.supervisoes || value.supervisao || value.nome || value.name);
  }

  const text = String(value).trim();
  if (!text) return [];

  if ((text.startsWith('[') && text.endsWith(']')) || (text.startsWith('{') && text.endsWith('}'))) {
    try { return parseSupervisoes(JSON.parse(text)); } catch (_) {}
  }

  return [...new Set(text.split(/[,;|\n]+/).map((item) => item.trim()).filter(Boolean))];
}

function looksLikeGestor(value) {
  const normalized = normalizeAccessText(value);
  return normalized === 'GESTOR' || normalized.startsWith('GESTOR ');
}

function buildAccessTokens(access) {
  const tokens = new Set();
  const sources = [access?.setor, access?.departmentName, access?.departmentCode, access?.role, ...(access?.allowedSupervisoes || [])];

  sources.forEach((source) => {
    const normalized = normalizeAccessText(source);
    if (!normalized) return;

    tokens.add(normalized);
    normalized
      .replace(/^GESTOR\s+/, '')
      .split(/\s+/)
      .filter((part) => part.length >= 4 && !['GERAL', 'SETOR', 'ADM', 'ADMINISTRADOR', 'GESTOR', 'MASTER', 'DIRETOR'].includes(part))
      .forEach((part) => tokens.add(part));
  });

  return [...tokens];
}

function filterAllowedSupervisoes(allSupervisoes, access) {
  const all = [...new Set((allSupervisoes || []).map((item) => String(item || '').trim()).filter(Boolean))];
  if (!access?.restricted) return all;

  const allowed = [...new Set((access.allowedSupervisoes || []).map((item) => String(item || '').trim()).filter(Boolean))];
  const allowedKeys = new Set(allowed.map(normalizeAccessText));
  const tokens = buildAccessTokens(access).filter(Boolean);

  let filtered = all.filter((sup) => {
    const key = normalizeAccessText(sup);
    if (allowedKeys.has(key)) return true;
    return tokens.some((token) => token.length >= 4 && key.includes(token));
  });

  if (!filtered.length && allowed.length) filtered = allowed;
  return [...new Set(filtered)].sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

function selectOptions(options, selected) {
  return options.map((opt) => `<option value="${escapeHtml(opt)}" ${String(selected || '') === opt ? 'selected' : ''}>${escapeHtml(opt)}</option>`).join('');
}

function disponibilidadeNorm(value) {
  return normalizeText(value).replace('INDISPONIVEL', 'INDISPONIVEL').replace('FERIAS', 'FERIAS');
}

function disponibilidadeCategoria(value) {
  const norm = disponibilidadeNorm(value);
  if (INDISPONIBILIDADE_MOTIVOS.includes(norm) || norm === 'INDISPONIVEL') return 'INDISPONIVEL';
  if (norm === 'SEM EMBARQUE') return 'SEM EMBARQUE';
  if (norm === 'LOGISTICA') return 'LOGISTICA';
  if (norm === 'DESLOCAMENTO') return 'DESLOCAMENTO';
  return 'OK';
}

function disponibilidadeMotivo(value) {
  const norm = disponibilidadeNorm(value);
  return INDISPONIBILIDADE_MOTIVOS.includes(norm) ? norm : '';
}

function disponibilidadeLabel(value) {
  const norm = disponibilidadeNorm(value);
  const labels = {
    OK: 'OK',
    LOGISTICA: 'Logística',
    DESLOCAMENTO: 'Deslocamento',
    'SEM EMBARQUE': 'Sem Embarque',
    INDISPONIVEL: 'Indisponível',
    ATESTADO: 'Atestado',
    FALTA: 'Falta',
    FERIAS: 'Férias',
    FOLGA: 'Folga',
  };
  return labels[norm] || String(value || 'OK');
}

function estadiaLabel(tipo) {
  return ({ CASA: 'Casa', PERNOITE: 'Pernoite', ALOJAMENTO: 'Alojamento', HOTEL: 'Hotel' })[normalizeText(tipo)] || '';
}

function estadiaIcon(tipo) {
  const key = normalizeText(tipo);
  if (key === 'CASA') return '<svg viewBox="0 0 48 48"><path d="M7 24L24 10l17 14"/><path d="M13 22v17h22V22"/><path d="M20 39V28h8v11"/></svg>';
  if (key === 'PERNOITE') return '<svg viewBox="0 0 48 48"><path d="M8 36h32"/><path d="M12 36V22l12-8 12 8v14"/><path d="M18 36v-9h12v9"/><path d="M6 26l18-12 18 12"/><path d="M36 12c4 2 6 5 6 9"/></svg>';
  if (key === 'ALOJAMENTO') return '<svg viewBox="0 0 48 48"><circle cx="16" cy="16" r="5"/><circle cx="32" cy="16" r="5"/><path d="M8 36c1-7 5-11 8-11s7 4 8 11"/><path d="M24 36c1-7 5-11 8-11s7 4 8 11"/></svg>';
  return '<svg viewBox="0 0 48 48"><path d="M12 40V10h24v30"/><path d="M8 40h32"/><path d="M18 16h4M26 16h4M18 23h4M26 23h4M18 30h4M26 30h4"/><path d="M22 40v-6h4v6"/></svg>';
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const a = Number(lat1), b = Number(lon1), c = Number(lat2), d = Number(lon2);
  if (![a,b,c,d].every(Number.isFinite)) return null;
  const R = 6371;
  const toRad = (deg) => deg * Math.PI / 180;
  const dLat = toRad(c - a);
  const dLon = toRad(d - b);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a)) * Math.cos(toRad(c)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function injectProgramacaoStyles() {
  if (document.getElementById('programacao-table-styles')) return;
  const style = document.createElement('style');
  style.id = 'programacao-table-styles';
  style.textContent = `
    .prog-toolbar{padding:14px 16px}
    .prog-toolbar-row{display:flex;align-items:flex-end;gap:10px;flex-wrap:wrap}
    .prog-toolbar-row + .prog-toolbar-row{margin-top:12px;padding-top:12px;border-top:1px solid rgba(255,255,255,.06)}
    .prog-tfield{display:flex;flex-direction:column;gap:4px;min-width:0}
    .prog-tfield label{font-size:10px;font-weight:800;letter-spacing:.07em;text-transform:uppercase;color:#7d8aa3;margin:0}
    .prog-tfield select,.prog-tfield input{min-height:38px;padding:8px 11px;border-radius:11px;border:1px solid rgba(52,211,153,.18);background:#0d0d18!important;color:#e2e2f0!important;font-size:13px;color-scheme:dark}
    .prog-tfield select option{background:#0d0d18;color:#e2e2f0}
    .prog-tfield-sup{flex:1 1 200px;max-width:300px}
    .prog-tfield-date{flex:0 0 148px}
    .prog-tfield-search{flex:1 1 220px}
    #progLoadContext{flex:0 0 auto;width:auto;margin-top:0;min-height:38px;padding:0 18px;white-space:nowrap;border-radius:11px}
    .prog-toolbar-spacer{flex:1 1 auto;min-width:8px}
    .prog-toolbar-row .prog-save-main{flex:0 0 auto;min-height:38px;padding:0 18px;white-space:nowrap}
    .prog-toolbar-row-steps{align-items:center;justify-content:space-between;flex-wrap:wrap}
    .prog-steps-compact{gap:6px;flex:1 1 auto}
    .prog-steps-compact .stepbtn{padding:8px 12px;border-radius:11px;font-size:12.5px}
    .prog-toolbar .feedback{margin:0;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:420px;flex:0 1 auto}
    .prog-list-card{padding:14px 16px}
    @media(max-width:900px){
      .prog-toolbar-row{align-items:stretch}
      .prog-tfield-sup,.prog-tfield-date,.prog-tfield-search,#progLoadContext,.prog-toolbar-row .prog-save-main{flex:1 1 100%;max-width:none}
      .prog-toolbar-spacer{display:none}
      .prog-toolbar-row-steps{flex-direction:column;align-items:stretch;gap:8px}
      .prog-toolbar .feedback{max-width:none;white-space:normal}
    }
    .prog-table-wrap{width:100%;overflow:auto;border:1px solid rgba(52,211,153,.18);border-radius:18px;background:rgba(2,6,23,.26)}
    .prog-table{width:100%;border-collapse:separate;border-spacing:0;min-width:980px;color:#e2e2f0}
    .prog-table th{position:sticky;top:0;z-index:1;background:#07170f;color:#c7f9df;font-size:12px;text-transform:uppercase;letter-spacing:.045em;text-align:left;padding:13px 12px;border-bottom:1px solid rgba(52,211,153,.2)}
    .prog-table td{padding:10px 12px;border-bottom:1px solid rgba(148,163,184,.12);vertical-align:middle;background:rgba(15,23,42,.28)}
    .prog-table tr:hover td{background:rgba(22,101,52,.12)}
    .prog-table .colab-name{font-weight:900;color:#f8fafc;line-height:1.15;min-width:240px}
    .prog-table .colab-meta{font-size:12px;color:#a7b5aa;margin-top:3px}
    .prog-table input,.prog-table select,.prog-table textarea,.prog-context-grid select{color-scheme:dark;background:#0d0d18!important;color:#e2e2f0!important;border:1px solid rgba(52,211,153,.18);border-radius:11px;padding:9px 10px;outline:none;width:100%;min-height:38px}
    .prog-table select option,.prog-context-grid select option{background:#0d0d18;color:#e2e2f0}
    .prog-table input[type="checkbox"]{width:18px;min-height:18px;accent-color:#16a34a}
    .prog-table input:disabled,.prog-table select:disabled,.prog-table textarea:disabled{opacity:.58;cursor:not-allowed;background:#10101e!important}
    .prog-status{display:inline-flex;align-items:center;gap:6px;border-radius:999px;padding:6px 10px;font-size:11px;font-weight:900;white-space:nowrap;border:1px solid rgba(148,163,184,.18)}
    .prog-status.ok{background:rgba(22,163,74,.14);color:#bbf7d0;border-color:rgba(34,197,94,.22)}
    .prog-status.block{background:rgba(239,68,68,.12);color:#fecaca;border-color:rgba(248,113,113,.22)}
    .prog-mini-btn{border:1px solid rgba(52,211,153,.28);background:rgba(22,101,52,.22);color:#dcfce7;border-radius:12px;padding:9px 12px;font-weight:800;cursor:pointer;white-space:nowrap}
    .prog-mini-btn:hover{background:rgba(22,101,52,.42)}
    .prog-mini-btn.danger{border-color:rgba(248,113,113,.22);background:rgba(127,29,29,.25);color:#fecaca}
    .prog-save-actions{display:flex;gap:10px;align-items:center;justify-content:flex-end;flex-wrap:wrap}
    .prog-save-main{border:1px solid rgba(187,247,208,.32);background:linear-gradient(135deg,#16a34a,#86efac);color:#052e16;border-radius:14px;padding:12px 18px;font-weight:950;cursor:pointer;box-shadow:0 14px 35px rgba(22,163,74,.18)}
    .prog-save-main:hover{filter:brightness(1.04)}
    .prog-save-main:disabled{opacity:.55;cursor:not-allowed;filter:none}
    .prog-extra-card{display:grid;grid-template-columns:160px 1.2fr 120px 1.2fr 86px;gap:8px;align-items:center;margin-bottom:8px;padding:8px;border:1px solid rgba(148,163,184,.14);border-radius:14px;background:rgba(15,23,42,.38)}
    .prog-extra-total{font-weight:900;color:#bbf7d0;text-align:right;white-space:nowrap}
    .prog-feedback-ok{color:#bbf7d0}.prog-feedback-error{color:#fecaca}.prog-feedback-warn{color:#fde68a}
    .prog-patrimonio-alert{display:none;margin-top:6px;border:1px solid rgba(250,204,21,.24);background:rgba(113,63,18,.20);color:#fde68a;border-radius:10px;padding:7px 9px;font-size:11px;font-weight:800;line-height:1.35}
    .prog-patrimonio-alert.show{display:block}
    .prog-section-title{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:18px 0 10px}
    .prog-section-title h4{margin:0;color:#f8fafc;font-size:15px;font-weight:950;letter-spacing:.02em}
    .prog-section-title .badge{display:inline-flex;align-items:center;border-radius:999px;padding:5px 10px;font-size:11px;font-weight:900;border:1px solid rgba(52,211,153,.22);background:rgba(22,101,52,.14);color:#bbf7d0}
    .prog-section-title.blocked .badge{border-color:rgba(248,113,113,.22);background:rgba(127,29,29,.18);color:#fecaca}
    .prog-empty-section{border:1px dashed rgba(148,163,184,.2);border-radius:16px;padding:14px;color:#6b7280;background:rgba(15,23,42,.18)}
    .prog-os-modal-backdrop{position:fixed;inset:0;z-index:9990;background:rgba(2,6,23,.72);backdrop-filter:blur(8px);display:flex;align-items:center;justify-content:center;padding:18px}
    .prog-tipo-selector{display:flex;gap:6px;flex-wrap:wrap}
    .prog-tipo-btn{border:1px solid rgba(52,211,153,.22);background:rgba(15,23,42,.5);color:#6b7280;border-radius:10px;padding:7px 11px;font-size:12px;font-weight:800;cursor:pointer;transition:all .15s}
    .prog-tipo-btn:hover{background:rgba(22,101,52,.25);color:#bbf7d0}
    .prog-tipo-btn.disabled,.prog-tipo-btn:disabled{opacity:.45;cursor:not-allowed;filter:grayscale(.45)}
    .prog-tipo-btn.disabled:hover,.prog-tipo-btn:disabled:hover{background:rgba(15,23,42,.5);color:#6b7280}
    .prog-tipo-btn.active{background:rgba(22,101,52,.35);color:#bbf7d0;border-color:rgba(52,211,153,.55)}
    .prog-tipo-btn.active[data-tipo="SEM EMBARQUE"],.prog-tipo-btn.active[data-tipo="INDISPONIVEL"]{background:rgba(127,29,29,.30);color:#fecaca;border-color:rgba(248,113,113,.45)}
    .prog-indisponivel-wrap{display:flex;align-items:center;gap:8px;margin-top:8px;max-width:260px}
    .prog-indisponivel-wrap select{min-height:34px!important;padding:6px 9px!important}
    .prog-estadia-selector{display:grid;grid-template-columns:repeat(3,minmax(78px,1fr));gap:7px;min-width:280px}
    .prog-estadia-card{border:1px solid rgba(52,211,153,.18);background:rgba(15,23,42,.56);color:#e2e2f0;border-radius:12px;padding:7px 6px;display:flex;flex-direction:column;align-items:center;gap:4px;cursor:pointer;font-weight:900;transition:all .15s;min-height:62px}
    .prog-estadia-card svg{width:22px;height:22px;stroke:#86efac;stroke-width:1.8;fill:none;stroke-linecap:round;stroke-linejoin:round}
    .prog-estadia-card:hover{background:rgba(22,101,52,.22);transform:translateY(-1px)}
    .prog-estadia-card.active{border-color:rgba(134,239,172,.70);background:rgba(22,101,52,.34);box-shadow:0 0 0 1px rgba(134,239,172,.16) inset}
    .prog-estadia-card span{font-size:10.5px;letter-spacing:.02em;text-align:center}
    .prog-required-note{margin-top:6px;font-size:11px;color:#fde68a;font-weight:800}
    .prog-required-note--info{color:#9ca3af}
    .prog-km-note{display:block;margin-top:4px;color:#6b7280;font-size:11px;line-height:1.35}
    .prog-placa-wrap{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:8px}
    .prog-placa-wrap input{width:130px!important;font-family:monospace;text-transform:uppercase;min-height:32px!important;padding:5px 8px!important}
    .prog-placa-suggest-btn{border:1px solid rgba(52,211,153,.28);background:rgba(22,101,52,.22);color:#dcfce7;border-radius:8px;padding:5px 9px;font-size:11px;font-weight:800;cursor:pointer;white-space:nowrap}
    .prog-placa-suggest-btn:hover{background:rgba(22,101,52,.42)}
    .prog-placa-alert{display:none;margin-top:6px;border:1px solid rgba(250,204,21,.24);background:rgba(113,63,18,.20);color:#fde68a;border-radius:10px;padding:6px 8px;font-size:11px;font-weight:700;line-height:1.35;width:100%}
    .prog-placa-alert.show{display:block}
    .prog-os-modal{width:min(920px,96vw);max-height:86vh;overflow:auto;border:1px solid rgba(52,211,153,.22);border-radius:24px;background:linear-gradient(180deg,#0d0d18,#07130d);box-shadow:0 30px 90px rgba(0,0,0,.55);color:#e2e2f0;padding:22px}
    .prog-os-modal-head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;margin-bottom:16px}.prog-os-modal-head h3{margin:0;color:#f8fafc;font-size:22px}.prog-os-modal-head p{margin:6px 0 0;color:#6b7280}
    .prog-os-list{display:grid;gap:10px}.prog-os-card{border:1px solid rgba(52,211,153,.16);background:rgba(15,23,42,.62);border-radius:18px;padding:14px}.prog-os-card.zero{box-shadow:inset 4px 0 0 #facc15}.prog-os-title{font-weight:950;color:#f8fafc}.prog-os-meta{font-size:12px;color:#6b7280;margin-top:4px}.prog-os-rem{display:inline-flex;border-radius:999px;padding:5px 10px;margin-top:8px;font-size:12px;font-weight:950;border:1px solid rgba(250,204,21,.25);color:#fde68a;background:rgba(113,63,18,.22)}
    .prog-os-modal-actions{display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap;margin-top:18px}.prog-os-close{border:1px solid rgba(148,163,184,.22);background:rgba(15,23,42,.72);color:#e2e2f0;border-radius:13px;padding:10px 14px;font-weight:900;cursor:pointer}.prog-os-go{border:1px solid rgba(187,247,208,.32);background:linear-gradient(135deg,#16a34a,#86efac);color:#052e16;border-radius:13px;padding:10px 14px;font-weight:950;cursor:pointer}
    .prog-duplicate-backdrop[hidden]{display:none}.prog-duplicate-backdrop{position:fixed;inset:0;z-index:9992;display:grid;place-items:center;padding:18px;background:rgba(1,8,5,.78);backdrop-filter:blur(9px)}
    .prog-duplicate-modal{width:min(560px,96vw);max-height:90vh;overflow:auto;border:1px solid rgba(111,208,165,.3);border-radius:24px;background:linear-gradient(155deg,#0d241a,#07120d 70%);box-shadow:0 30px 90px rgba(0,0,0,.58);padding:22px;color:#e8f6ee}
    .prog-duplicate-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}.prog-duplicate-head h3{margin:0;font-size:20px}.prog-duplicate-head p{margin:6px 0 0;color:#8ba79a;font-size:12px}.prog-duplicate-close{width:34px;height:34px;border:1px solid rgba(148,163,184,.18);border-radius:10px;background:rgba(2,6,23,.35);color:#b8ccc0;font-size:20px;cursor:pointer}
    .prog-duplicate-source{margin:16px 0 14px;padding:11px 13px;border:1px solid rgba(111,208,165,.15);border-radius:13px;background:rgba(63,168,120,.08);color:#b8ccc0;font-size:11px}.prog-duplicate-calendar-label{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:9px;color:#8ba79a;font-size:10px;font-weight:850;text-transform:uppercase;letter-spacing:.07em}.prog-duplicate-calendar-label span:last-child{color:#5f7d6e;font-weight:700;letter-spacing:0;text-transform:none}.prog-duplicate-dates{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px}.prog-duplicate-day{position:relative;min-width:0;min-height:92px;padding:10px 7px;border:1px solid rgba(111,208,165,.18);border-radius:14px;background:rgba(7,25,17,.74);color:#b8ccc0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;cursor:pointer;transition:transform .15s,border-color .15s,background .15s,box-shadow .15s}.prog-duplicate-day:hover{transform:translateY(-2px);border-color:rgba(111,208,165,.42);background:rgba(30,91,61,.22)}.prog-duplicate-day-week{font-size:9px;font-weight:900;letter-spacing:.08em;text-transform:uppercase;color:#759686}.prog-duplicate-day-number{font-size:25px;line-height:1;font-weight:950;color:#eef7f2}.prog-duplicate-day-month{font-size:10px;color:#8ba79a}.prog-duplicate-day-check{position:absolute;right:7px;top:7px;width:17px;height:17px;border:1px solid rgba(111,208,165,.28);border-radius:6px;display:grid;place-items:center;color:transparent;font-size:11px}.prog-duplicate-day.is-selected{border-color:#6fd0a5;background:linear-gradient(150deg,rgba(35,134,90,.52),rgba(15,61,40,.7));box-shadow:0 8px 24px rgba(31,111,74,.2),inset 0 0 0 1px rgba(111,208,165,.12)}.prog-duplicate-day.is-selected .prog-duplicate-day-check{background:#6fd0a5;color:#07331f;border-color:#6fd0a5}.prog-duplicate-day.is-selected .prog-duplicate-day-week{color:#bdebd2}
    .prog-duplicate-options{margin-top:14px;padding:12px 13px;border:1px solid rgba(111,208,165,.18);border-radius:13px;background:rgba(7,25,17,.62)}.prog-duplicate-checkbox{display:flex;align-items:flex-start;gap:10px;color:#d9eee3;font-size:12px;font-weight:850;cursor:pointer}.prog-duplicate-checkbox input{width:17px;height:17px;margin:0;flex:0 0 auto;accent-color:#6fd0a5}.prog-duplicate-checkbox small{display:block;margin-top:4px;color:#789486;font-size:10px;font-weight:650;line-height:1.4}.prog-duplicate-note{margin-top:13px;color:#789486;font-size:10px;line-height:1.5}.prog-duplicate-actions{display:flex;justify-content:flex-end;gap:9px;margin-top:18px}.prog-duplicate-actions button{min-height:40px;padding:0 15px;border-radius:12px;font-weight:900;cursor:pointer}.prog-duplicate-cancel{border:1px solid rgba(148,163,184,.18);background:rgba(15,23,42,.45);color:#cbd5e1}.prog-duplicate-confirm{border:1px solid rgba(111,208,165,.35);background:linear-gradient(135deg,#23865a,#6fd0a5);color:#042d1c}.prog-duplicate-confirm:disabled{opacity:.5;cursor:wait}
    @media(max-width:900px){.prog-extra-card{grid-template-columns:1fr}.prog-table{min-width:860px}.prog-os-modal{padding:16px}.prog-estadia-selector{grid-template-columns:repeat(3,minmax(70px,1fr));min-width:220px}}
    @media(max-width:560px){.prog-duplicate-dates{grid-template-columns:repeat(2,minmax(0,1fr))}.prog-duplicate-day:last-child{grid-column:1/-1}.prog-duplicate-modal{padding:17px}.prog-duplicate-actions{flex-direction:column-reverse}.prog-duplicate-actions button{width:100%}}
  `;
  document.head.appendChild(style);
}

export function renderContent(content) {
  injectProgramacaoStyles();

  content.innerHTML = `
    <section class="card prog-toolbar">
      <div class="prog-toolbar-row">
        <div class="prog-context-group">
          <div class="prog-tfield prog-tfield-sup">
            <label for="progSup">Supervisão</label>
            <select id="progSup"></select>
          </div>
          <div class="prog-tfield prog-tfield-date">
            <label for="progDataRef">Data</label>
            <input id="progDataRef" type="date" />
          </div>
          <button class="btn btn-primary" type="button" id="progLoadContext" title="Carregar colaboradores da supervisão/data selecionada">Carregar</button>
        </div>

        <div class="prog-toolbar-spacer"></div>

        <div class="prog-tfield prog-tfield-search" id="progSearchWrap">
          <label for="progSearch">Buscar</label>
          <input id="progSearch" type="text" placeholder="Nome, cargo ou supervisão..." />
        </div>
        <button class="prog-save-main" type="button" id="progSaveProgramacao" disabled title="As alterações já são salvas automaticamente — este botão confirma e finaliza a programação. Para a O.S. aparecer no Mapa Operacional, marque-a como &quot;Atender&quot; na etapa de equipe e programe para a data de hoje.">Salvar programação</button>
        <div class="prog-actions-block">
          <div class="prog-action-row">
            <button class="btn" type="button" id="progGerarPdf" title="Gera um PDF com OS, colaborador, deslocamento, estadia, refeições e extras do dia">📄 Gerar PDF</button>
            <button class="btn" type="button" id="progCompartilhar" title="Monta a mensagem de locais/colaboradores e motoristas/caronas do dia para compartilhar no WhatsApp">📤 Compartilhar</button>
          </div>
          <button class="btn prog-duplicate-btn" type="button" id="progDuplicar" title="Copia esta programação para até cinco datas">⧉ Duplicar</button>
        </div>
      </div>

      <div class="prog-toolbar-row prog-toolbar-row-steps">
        <div class="steps-wrap prog-steps-compact" id="progSteps" title="Clique em uma etapa para editar as necessidades em formato de tabela">
          ${STEPS.map((step) => `<button type="button" class="stepbtn ${step.code === 'A' ? 'active' : ''}" data-step="${step.code}">${step.code} · ${step.label}</button>`).join('')}
        </div>
        <div class="feedback" id="progCtxFeedback">Nenhuma programação carregada.</div>
      </div>
    </section>

    <section class="card mt-16 prog-list-card">
      <div class="prog-list" id="progList"></div>
    </section>
    <div class="prog-duplicate-backdrop" id="progDuplicateModal" hidden>
      <section class="prog-duplicate-modal" role="dialog" aria-modal="true" aria-labelledby="progDuplicateTitle">
        <header class="prog-duplicate-head"><div><h3 id="progDuplicateTitle">Selecione as datas para duplicar</h3><p>Você pode copiar a programação para até 5 dias.</p></div><button class="prog-duplicate-close" type="button" data-duplicate-close aria-label="Fechar">×</button></header>
        <div class="prog-duplicate-source" id="progDuplicateSource"></div>
        <div class="prog-duplicate-calendar-label"><span>Próximos 5 dias</span><span>Selecione um ou mais</span></div>
        <div class="prog-duplicate-dates" id="progDuplicateDates" role="group" aria-label="Próximos cinco dias"></div>
        <div class="prog-duplicate-options"><label class="prog-duplicate-checkbox" for="progDuplicateCopyStays"><input id="progDuplicateCopyStays" type="checkbox" checked><span>Copiar estadias?<small>Inclui hotel, alojamento, pernoite e novas solicitações de hospedagem.</small></span></label></div>
        <div class="prog-duplicate-note">Equipe por O.S., disponibilidade, alimentação, despesas e frota serão copiadas. Datas que já possuem programação serão preservadas.</div>
        <footer class="prog-duplicate-actions"><button class="prog-duplicate-cancel" type="button" data-duplicate-close>Cancelar</button><button class="prog-duplicate-confirm" id="progDuplicateConfirm" type="button">Duplicar programação</button></footer>
      </section>
    </div>
  `;

  const el = {
    dataRef: document.getElementById('progDataRef'),
    sup: document.getElementById('progSup'),
    loadBtn: document.getElementById('progLoadContext'),
    feedback: document.getElementById('progCtxFeedback'),
    steps: document.getElementById('progSteps'),
    list: document.getElementById('progList'),
    search: document.getElementById('progSearch'),
    saveBtn: document.getElementById('progSaveProgramacao'),
    pdfBtn: document.getElementById('progGerarPdf'),
    duplicateBtn: document.getElementById('progDuplicar'),
    duplicateModal: document.getElementById('progDuplicateModal'),
    duplicateSource: document.getElementById('progDuplicateSource'),
    duplicateDates: document.getElementById('progDuplicateDates'),
    duplicateCopyStays: document.getElementById('progDuplicateCopyStays'),
    duplicateConfirm: document.getElementById('progDuplicateConfirm'),
    statTotal: document.getElementById('progStatTotal'),
    statBlocked: document.getElementById('progStatBlocked'),
    currentStep: document.getElementById('progCurrentStep'),
    currentStepLabel: document.getElementById('progCurrentStepLabel'),
  };

  const state = {
    user: null,
    userContext: null,
    access: { restricted: false, allowedSupervisoes: [] },
    step: 'A',
    dataReferencia: todayIso(),
    supervisao: '',
    programacaoId: null,
    // Sob "Todas": programacaoId fica null e programacaoIdMap guarda
    // Map<supervisao, programacao_id> — cada colaborador/OS resolve o seu
    // próprio id de gravação pela própria supervisao (ver programacaoIdFor).
    programacaoIdMap: new Map(),
    supervisoesResolvidas: [],
    todasSupervisoes: [],
    colaboradores: [],
    colabsEmOsAtender: new Set(),
    cidades: [],
    alojamentos: [],
    veiculos: [],
    veiculoByPlaca: new Map(),
    pontosEmbarque: [],
    operacionalColabs: [],
    operacionalColabByCpf: new Map(),
    operacionalColabByNome: new Map(),
    kmCache: new Map(),
    osPorColaborador: new Map(),
    cruzamentoByCpf: new Map(),
    search: '',
    maps: {
      disponibilidade: new Map(),
      estadia: new Map(),
      alimentacao: new Map(),
      deslocamento: new Map(),
      extras: new Map(),
    },
    timers: new Map(),
  };

  el.dataRef.value = state.dataReferencia;

  async function init() {
    state.user = await getCurrentUser();
    try {
      state.userContext = await getUserContext(state.user?.id);
    } catch (error) {
      console.warn('Não foi possível carregar o contexto completo do usuário.', error);
      state.userContext = null;
    }
    state.access = await resolveProgramacaoAccess();
    bindEvents();
    await Promise.all([loadCidadesBrasil(), loadAlojamentos(), loadVeiculosFrota(), loadBaseOperacional()]);
    await fillSupervisoes();
  }

  function programacaoIdFor(colab) {
    if (state.programacaoIdMap.size) return state.programacaoIdMap.get(colab?.supervisao || '') || null;
    return state.programacaoId;
  }

  function bindEvents() {
    window.__progLoadColaboradores = loadContext;
    window.__progGetProgramacaoId = () => state.programacaoId;
    window.__progGetProgramacaoIdMap = () => state.programacaoIdMap;
    // data do contexto efetivamente carregado (pode divergir do #progDataRef
    // se o usuário mexeu no campo sem clicar em Carregar de novo) — usado pelo
    // "Compartilhar" em programacao-pdf-tipo-fix.js pra não escrever a data
    // errada no cabeçalho da mensagem.
    window.__progGetDataReferencia = () => state.dataReferencia;
    // programacao-gestor-fluxo-avancado.js precisa saber quando loadContext()
    // (assíncrono — cria programacao_dia se a data/supervisão for nova, ex.:
    // programar adiantado) realmente termina, em vez de adivinhar com
    // setTimeout — por isso o próprio clique guarda a promise em
    // window.__progLoadColaboradoresPromise (ver hookLoadButton lá).
    el.loadBtn.addEventListener('click', () => {
      window.__progLoadColaboradoresPromise = loadContext();
    });
    el.saveBtn.addEventListener('click', saveProgramacao);
    el.pdfBtn.addEventListener('click', gerarPdfProgramacao);
    el.duplicateBtn.addEventListener('click', openDuplicateModal);
    el.duplicateConfirm.addEventListener('click', duplicateProgramacao);
    el.duplicateModal.addEventListener('click', (event) => {
      if (event.target === el.duplicateModal || event.target.closest('[data-duplicate-close]')) closeDuplicateModal();
      const day = event.target.closest('[data-duplicate-date]');
      if (day) {
        day.classList.toggle('is-selected');
        day.setAttribute('aria-pressed', String(day.classList.contains('is-selected')));
      }
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !el.duplicateModal.hidden) closeDuplicateModal();
    });
    el.search.addEventListener('input', debounce(() => {
      state.search = el.search.value.trim().toLowerCase();
      renderRows();
    }, 220));
    el.steps.addEventListener('click', (event) => {
      const btn = event.target.closest('[data-step]');
      if (!btn) return;
      setStep(btn.dataset.step);
    });
    el.list.addEventListener('change', handleTableChange);
    el.list.addEventListener('input', handleTableInput);
    el.list.addEventListener('click', handleTableClick);
  }

  function addDaysIso(iso, days) {
    const date = new Date(`${iso}T12:00:00`);
    date.setDate(date.getDate() + days);
    return date.toISOString().slice(0, 10);
  }

  function renderDuplicateCalendar() {
    const baseIso = state.dataReferencia > todayIso() ? state.dataReferencia : todayIso();
    const weekdays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
    const months = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
    el.duplicateDates.innerHTML = Array.from({ length: 5 }, (_, index) => {
      const iso = addDaysIso(baseIso, index + 1);
      const date = new Date(`${iso}T12:00:00`);
      const selected = index === 0;
      return `<button class="prog-duplicate-day ${selected ? 'is-selected' : ''}" type="button" data-duplicate-date="${iso}" aria-pressed="${selected}" aria-label="${weekdays[date.getDay()]}, ${date.getDate()} de ${months[date.getMonth()]}"><span class="prog-duplicate-day-check">✓</span><span class="prog-duplicate-day-week">${weekdays[date.getDay()]}</span><strong class="prog-duplicate-day-number">${date.getDate()}</strong><span class="prog-duplicate-day-month">${months[date.getMonth()]}</span></button>`;
    }).join('');
  }

  function openDuplicateModal() {
    if (!state.programacaoId || state.programacaoIdMap.size) {
      setFeedback(state.programacaoIdMap.size ? 'Selecione uma única supervisão para duplicar a programação.' : 'Carregue uma programação antes de duplicar.', 'warn');
      return;
    }
    renderDuplicateCalendar();
    el.duplicateCopyStays.checked = true;
    el.duplicateSource.textContent = `Origem: ${state.supervisao} · ${brDate(state.dataReferencia)}`;
    el.duplicateModal.hidden = false;
    document.body.style.overflow = 'hidden';
  }

  function closeDuplicateModal() {
    el.duplicateModal.hidden = true;
    document.body.style.overflow = '';
    el.duplicateConfirm.disabled = false;
    el.duplicateConfirm.textContent = 'Duplicar programação';
  }

  async function duplicateProgramacao() {
    const unicas = [...el.duplicateDates.querySelectorAll('[data-duplicate-date].is-selected')].map((button) => button.dataset.duplicateDate);
    if (!unicas.length) {
      setFeedback('Selecione ao menos uma data para duplicar.', 'warn');
      return;
    }
    if (unicas.includes(state.dataReferencia)) {
      setFeedback('A data de destino deve ser diferente da data de origem.', 'warn');
      return;
    }
    try {
      el.duplicateConfirm.disabled = true;
      el.duplicateConfirm.textContent = 'Duplicando...';
      const { data, error } = await supabase.rpc('duplicar_programacao_dia', {
        p_programacao_id: state.programacaoId,
        p_datas: unicas,
        p_copiar_estadias: el.duplicateCopyStays.checked,
      });
      if (error) throw error;
      const copiadas = Array.isArray(data?.copiadas) ? data.copiadas : [];
      const ignoradas = Array.isArray(data?.ignoradas) ? data.ignoradas : [];
      closeDuplicateModal();
      const resumo = copiadas.length ? `Programação duplicada para ${copiadas.map(brDate).join(', ')}.` : 'Nenhuma programação foi duplicada.';
      const preservadas = ignoradas.length ? ` Datas já preenchidas e preservadas: ${ignoradas.map(brDate).join(', ')}.` : '';
      setFeedback(`${resumo}${preservadas}`, copiadas.length ? 'ok' : 'warn');
    } catch (error) {
      console.error('[programacao] duplicar:', error);
      el.duplicateConfirm.disabled = false;
      el.duplicateConfirm.textContent = 'Duplicar programação';
      setFeedback(error.message || 'Não foi possível duplicar a programação.', 'error');
    }
  }


  async function checkFobPendenciasBloqueantes(dataReferencia, supervisao) {
    if (!dataReferencia) return [];
    let query = supabase
      .from('logistica_fob')
      .select('id,data_referencia,numero_os,cliente,supervisao,funcionario,motivo,observacao,status')
      .eq('status', 'PENDENTE')
      .lt('data_referencia', dataReferencia)
      .order('data_referencia', { ascending: false })
      .limit(50);
    if (Array.isArray(supervisao)) {
      if (supervisao.length) query = query.in('supervisao', supervisao);
    } else if (supervisao) {
      query = query.eq('supervisao', supervisao);
    }
    const { data, error } = await query;
    if (error) {
      console.warn('Não foi possível validar pendências de FOB.', error);
      return [];
    }
    return data || [];
  }

  function showFobBlockedMessage(rows) {
    const detalhes = rows.slice(0, 5).map((r) => `OS ${r.numero_os || '-'} • ${brDate(r.data_referencia)} • ${r.cliente || '-'}`).join(' | ');
    setFeedback(`Programação bloqueada: existem ${rows.length} FOB(s) anteriores sem validação do gestor. Valide na aba Logística > FOB. ${detalhes}`, 'error');
    el.list.innerHTML = `<div class="table-empty">Programação bloqueada por FOB pendente de validação.<br>Abra <strong>Logística &gt; FOB</strong>, marque todos como válidos ou inválidos e carregue novamente.</div>`;
  }


  const CIDADES_CACHE_KEY = 'grm:cidades_ibge:v1';
  const CIDADES_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // municípios não mudam — cache de 30 dias

  function readCidadesCache() {
    try {
      const raw = localStorage.getItem(CIDADES_CACHE_KEY);
      if (!raw) return null;
      const { ts, data } = JSON.parse(raw);
      if (!ts || Date.now() - ts > CIDADES_CACHE_TTL_MS || !Array.isArray(data) || !data.length) return null;
      return data;
    } catch {
      return null;
    }
  }

  function writeCidadesCache(data) {
    try {
      localStorage.setItem(CIDADES_CACHE_KEY, JSON.stringify({ ts: Date.now(), data }));
    } catch {
      // localStorage indisponível/cheio — segue sem cache persistente.
    }
  }

  async function loadCidadesBrasil() {
    const cached = readCidadesCache();
    if (cached) {
      state.cidades = cached;
      ensureCidadeDatalist();
      return;
    }
    try {
      const resp = await fetch('https://servicodados.ibge.gov.br/api/v1/localidades/municipios?orderBy=nome');
      const data = await resp.json();
      state.cidades = (Array.isArray(data) ? data : []).map((m) => ({
        nome: m.nome,
        uf: m.microrregiao?.mesorregiao?.UF?.sigla || '',
        label: `${m.nome} - ${m.microrregiao?.mesorregiao?.UF?.sigla || ''}`,
        key: normalizeText(`${m.nome} ${m.microrregiao?.mesorregiao?.UF?.sigla || ''}`),
      })).filter((m) => m.nome && m.uf);
      ensureCidadeDatalist();
      writeCidadesCache(state.cidades);
    } catch (error) {
      console.warn('Não foi possível carregar cidades do IBGE.', error);
      state.cidades = [];
    }
  }

  async function loadAlojamentos() {
    try {
      const { data, error } = await supabase
        .from('hospedagem_alojamentos')
        .select('id,nome,cidade,uf,tipo,capacidade,quartos,status,prioridade,endereco')
        .eq('status', 'ATIVO')
        .order('cidade', { ascending: true });
      if (error) throw error;
      state.alojamentos = data || [];
    } catch (error) {
      console.warn('Não foi possível carregar alojamentos para sugestão.', error);
      state.alojamentos = [];
    }
  }

  async function loadVeiculosFrota() {
    const normalizeRows = (rows) => (rows || []).map((v) => {
      const placa = onlyPlate(v.placa || v.identificacao || v.patrimonio_placa || v.veiculo_placa || v.codigo || v.tombamento);
      if (!placa) return null;

      const motoristaNome = firstFilled(
        v.motorista_atual,
        v.motorista,
        v.condutor,
        v.condutor_atual,
        v.patrimonio_funcionario,
        v.colaborador,
        v.colaborador_nome,
        v.funcionario,
        v.responsavel,
        v.nome_responsavel
      );
      const motoristaCpf = normalizeCpf(firstFilled(
        v.motorista_cpf,
        v.condutor_cpf,
        v.colaborador_cpf,
        v.funcionario_cpf,
        v.responsavel_cpf,
        v.cpf
      ));

      return {
        placa,
        motoristaNome,
        motoristaCpf,
        raw: v,
        label: [placa, v.modelo || v.nome || v.descricao || v.marca, v.cor, motoristaNome ? `Atual: ${motoristaNome}` : 'sem vínculo identificado'].filter(Boolean).join(' · '),
      };
    }).filter(Boolean);
    try {
      const { data, error } = await supabase.from('frotas_veiculos').select('*').order('placa', { ascending: true }).limit(1000);
      if (error) throw error;
      state.veiculos = normalizeRows(data);
      if (state.veiculos.length) { indexVeiculos(); ensureVeiculosDatalist(); return; }
    } catch (error) {
      console.warn('Não foi possível carregar frotas_veiculos.', error);
    }
    try {
      const { data, error } = await supabase.from('patrimonios_snapshot').select('*').limit(1500);
      if (error) throw error;
      state.veiculos = normalizeRows(data);
    } catch (error) {
      console.warn('Não foi possível carregar patrimonios_snapshot para placas.', error);
      state.veiculos = [];
    }
    indexVeiculos();
    ensureVeiculosDatalist();
  }

  async function loadCruzamento(cpfs) {
    state.cruzamentoByCpf = new Map();
    if (!cpfs.length) return;
    try {
      const { data, error } = await supabase
        .from('colaborador_cruzamento')
        .select('cpf,veiculo_placa,latitude,longitude,tipo_contrato,auditorias_180d_qtd,auditorias_180d_peso')
        .in('cpf', cpfs);
      if (error) throw error;
      (data || []).forEach((row) => state.cruzamentoByCpf.set(normalizeCpf(row.cpf), row));
    } catch (error) {
      console.warn('Não foi possível carregar colaborador_cruzamento.', error);
    }
  }

  async function loadBaseOperacional() {
    try {
      const [colabs, pontos] = await Promise.all([
        supabase.from('operacional_colaborador_base').select('id,colaborador_id,nome,cpf,latitude,longitude,ativo').eq('ativo', true).limit(5000),
        supabase.from('operacional_pontos_embarque').select('id,nome_local,cidade,uf,latitude,longitude,ativo').eq('ativo', true).limit(8000),
      ]);
      if (!colabs.error) state.operacionalColabs = colabs.data || [];
      if (!pontos.error) state.pontosEmbarque = pontos.data || [];
    } catch (error) {
      console.warn('Não foi possível carregar base operacional para cálculo de KM.', error);
      state.operacionalColabs = [];
      state.pontosEmbarque = [];
    }
    state.operacionalColabByCpf = new Map();
    state.operacionalColabByNome = new Map();
    state.operacionalColabs.forEach((row) => {
      const cpf = normalizeCpf(row.cpf);
      if (cpf && !state.operacionalColabByCpf.has(cpf)) state.operacionalColabByCpf.set(cpf, row);
      const nome = normalizeText(row.nome);
      if (nome && !state.operacionalColabByNome.has(nome)) state.operacionalColabByNome.set(nome, row);
    });
    state.pontosEmbarqueById = new Map((state.pontosEmbarque || []).map((p) => [p.id, p]));
  }

  function findOperacionalColab(colab) {
    const cpf = normalizeCpf(colab?.cpf);
    if (cpf && state.operacionalColabByCpf.has(cpf)) return state.operacionalColabByCpf.get(cpf);
    const nome = normalizeText(colab?.nome);
    return (nome && state.operacionalColabByNome.get(nome)) || null;
  }

  function getOsForColab(colab) {
    if (!colab) return null;
    const base = findOperacionalColab(colab);
    const idKey = normalizeCpf(base?.colaborador_id);
    const cpfKey = normalizeCpf(colab.cpf || base?.cpf);
    const nomeKey = normalizeText(colab.nome || '').trim().toUpperCase();
    return state.osPorColaborador.get(idKey)
      || state.osPorColaborador.get(cpfKey)
      || state.osPorColaborador.get(nomeKey)
      || null;
  }

  function cidadeUfFromOs(os) {
    const raw = String(os?.embarque || os?.raw?.Embarque || os?.local_embarque || '').trim();
    if (!raw) return null;
    const semPonto = raw.replace(/\([^()]*\)\s*$/, '').trim();
    const partes = semPonto.split(/\s*-\s*/).map((p) => p.trim()).filter(Boolean);
    if (partes.length >= 2 && /^[A-Z]{2}$/i.test(partes[0])) {
      return { uf: partes[0].toUpperCase(), cidade: partes[1] };
    }
    return { cidade: raw, uf: '' };
  }

  function findPontoFromOs(os) {
    if (!os) return null;
    if (Number.isFinite(Number(os.ponto1_latitude)) && Number.isFinite(Number(os.ponto1_longitude))) {
      return { latitude: Number(os.ponto1_latitude), longitude: Number(os.ponto1_longitude), nome: os.embarque || 'Ponto da O.S.' };
    }
    if (os.ponto_embarque_id) {
      const ponto = state.pontosEmbarqueById?.get(os.ponto_embarque_id);
      if (ponto && Number.isFinite(Number(ponto.latitude)) && Number.isFinite(Number(ponto.longitude))) return ponto;
    }
    const emb = normalizeText(os.embarque || os.local_embarque || '');
    if (!emb) return null;
    const candidates = (state.pontosEmbarque || []).filter((p) => {
      const label = normalizeText(`${p.uf || ''} ${p.cidade || ''} ${p.nome_local || ''}`);
      return label && (label.includes(emb) || emb.includes(label) || normalizeText(p.nome_local).includes(emb) || emb.includes(normalizeText(p.nome_local)));
    }).filter((p) => Number.isFinite(Number(p.latitude)) && Number.isFinite(Number(p.longitude)));
    return candidates[0] || null;
  }

  function kmEstimadoColaborador(colab) {
    const cacheKey = String(colab?.id || '');
    if (cacheKey && state.kmCache.has(cacheKey)) return state.kmCache.get(cacheKey);

    const os = getOsForColab(colab);

    let result;
    if (!os) {
      result = { km: null, motivo: 'Sem O.S. vinculada ao colaborador.' };
    } else if (Number.isFinite(Number(os.distancia_km))) {
      result = { km: Number(os.distancia_km), motivo: 'Distância da indicação da O.S.' };
    } else {
      const base = findOperacionalColab(colab);
      const ponto = findPontoFromOs(os);
      if (!base || !Number.isFinite(Number(base.latitude)) || !Number.isFinite(Number(base.longitude))) {
        result = { km: null, motivo: 'Casa/base do colaborador sem coordenadas.' };
      } else if (!ponto) {
        result = { km: null, motivo: 'Ponto de embarque sem coordenadas.' };
      } else {
        const km = haversineKm(base.latitude, base.longitude, ponto.latitude, ponto.longitude);
        result = Number.isFinite(km) ? { km, motivo: `Casa → ${ponto.nome_local || ponto.nome || 'ponto de embarque'}` } : { km: null, motivo: 'Coordenadas insuficientes.' };
      }
    }

    if (cacheKey) state.kmCache.set(cacheKey, result);
    return result;
  }

  function ensureCidadeDatalist() {
    let list = document.getElementById('progCidadesBrasilList');
    if (!list) {
      list = document.createElement('datalist');
      list.id = 'progCidadesBrasilList';
      document.body.appendChild(list);
    }
    list.innerHTML = (state.cidades || []).map((c) => `<option value="${escapeHtml(c.label)}"></option>`).join('');
  }

  function ensureVeiculosDatalist() {
    let list = document.getElementById('progVeiculosFrotaList');
    if (!list) {
      list = document.createElement('datalist');
      list.id = 'progVeiculosFrotaList';
      document.body.appendChild(list);
    }
    list.innerHTML = (state.veiculos || []).map((v) => `<option value="${escapeHtml(v.placa)}">${escapeHtml(v.label)}</option>`).join('');
  }

  function matchCidade(value, ufValue = '') {
    const text = String(value || '').trim();
    const uf = normalizeUF(ufValue);
    const normalized = normalizeText(text.replace(/\s+-\s+[A-Z]{2}$/i, ''));
    const explicitUf = normalizeUF((text.match(/-\s*([A-Z]{2})$/i) || [])[1] || uf);
    return (state.cidades || []).find((c) => normalizeText(c.nome) === normalized && (!explicitUf || c.uf === explicitUf))
      || (state.cidades || []).find((c) => c.key === normalizeText(`${text} ${uf}`));
  }

  function ufFromSupervisao(supervisao) {
    const norm = normalizeText(supervisao || '');
    if (!norm) return '';
    const chave = SUPERVISAO_UF_CHAVES.find((k) => norm.startsWith(normalizeText(k)));
    return chave ? SUPERVISAO_UF_MAP[chave] : '';
  }

  function alojamentoOptions(selectedId, cidade, uf) {
    const cidadeNorm = normalizeText(cidade);
    const ufNorm = normalizeUF(uf) || ufFromSupervisao(state.supervisao);
    const porRegional = ufNorm ? (state.alojamentos || []).filter((a) => normalizeUF(a.uf) === ufNorm) : (state.alojamentos || []);
    const rows = cidadeNorm ? porRegional.filter((a) => normalizeText(a.cidade) === cidadeNorm) : porRegional;
    const all = rows.length ? rows : porRegional;
    return `<option value="">Selecionar alojamento</option>` + all.map((a) => {
      const label = `${a.nome} · ${a.cidade || '-'}/${a.uf || ''}${a.capacidade ? ` · Cap. ${a.capacidade}` : ''}`;
      return `<option value="${escapeHtml(a.id)}" ${String(selectedId || '') === String(a.id) ? 'selected' : ''}>${escapeHtml(label)}</option>`;
    }).join('');
  }

  function indexVeiculos() {
    state.veiculoByPlaca = new Map((state.veiculos || []).map((v) => [onlyPlate(v.placa), v]));
  }

  function findVeiculoByPlaca(placa) {
    const normalized = onlyPlate(placa);
    if (!normalized) return null;
    return state.veiculoByPlaca.get(normalized) || null;
  }

  function patrimonioMessageForRow(colab, tipoDeslocamento, placa) {
    const tipo = normalizeText(tipoDeslocamento);
    const normalizedPlate = onlyPlate(placa);
    if (tipo !== 'MOTORISTA FROTA' || !normalizedPlate || normalizedPlate.length < 7) return '';

    const veiculo = findVeiculoByPlaca(normalizedPlate);
    if (!veiculo) {
      return `Placa ${normalizedPlate} não localizada na base de patrimônios/frota. Solicitar leitura do patrimônio para confirmar o veículo.`;
    }

    // O spread de veiculo.raw vem ANTES dos campos calculados: frotas_veiculos
    // tem uma coluna "nome" que é o nome/apelido do veículo (ex.: "MOBI LIKE -
    // SHV7F36"), não do motorista — se viesse depois, sobrescrevia o nome
    // correto do motorista_atual e gerava falso alerta de divergência.
    const pessoa = {
      ...((veiculo.raw && typeof veiculo.raw === 'object') ? veiculo.raw : {}),
      nome: veiculo.motoristaNome,
      cpf: veiculo.motoristaCpf,
      motorista: veiculo.motoristaNome,
    };

    if (pessoaMatchesColaborador(pessoa, colab)) return '';

    const vinculo = veiculo.motoristaNome || 'sem colaborador vinculado identificado';
    return `Atenção: o veículo ${normalizedPlate} está vinculado a ${vinculo}, não a ${colab?.nome || 'este motorista'}. Solicitar leitura do patrimônio.`;
  }

  function updatePatrimonioAlert(tr) {
    if (!tr) return;
    const alert = tr.querySelector('[data-patrimonio-alert]');
    if (!alert) return;
    const colab = colabById(tr.dataset.colabId);
    const tipo = tr.querySelector('[data-field="tipo_deslocamento"]')?.value || '';
    const placa = tr.querySelector('[data-field="placa_veiculo"]')?.value || '';
    const message = patrimonioMessageForRow(colab, tipo, placa);
    alert.textContent = message;
    alert.classList.toggle('show', Boolean(message));
  }

  async function resolveProgramacaoAccess() {
    const context = state.userContext || {};
    let appUser = null;

    try {
      const { data, error } = await supabase
        .from('app_usuarios')
        .select('id,nome,email,setor,empresa,coordenacao,supervisao,status')
        .eq('auth_user_id', state.user?.id)
        .maybeSingle();
      if (!error) appUser = data || null;
    } catch (error) {
      console.warn('Não foi possível consultar app_usuarios para restrição de supervisão.', error);
    }

    const role = getDeepValue(context, 'user.role') || context.perfil_codigo || context.perfil_nome || context.role || appUser?.perfil_codigo || '';
    const setor = appUser?.setor || context.setor || getDeepValue(context, 'user.setor') || getDeepValue(context, 'department.name') || '';
    const departmentName = getDeepValue(context, 'department.name') || context.department_name || setor || '';
    const departmentCode = getDeepValue(context, 'department.code') || context.department_code || '';
    const isMaster = Boolean(getDeepValue(context, 'user.is_master') || context.is_master || normalizeAccessText(role) === 'MASTER');
    const isGestor = looksLikeGestor(role) || looksLikeGestor(setor) || looksLikeGestor(departmentName) || looksLikeGestor(departmentCode);

    const coordenacao = appUser?.coordenacao || getDeepValue(context, 'user.coordenacao') || '';

    const allowedSupervisoes = [
      ...parseSupervisoes(appUser?.supervisao),
      ...parseSupervisoes(coordenacao),
      ...parseSupervisoes(context.supervisoes),
      ...parseSupervisoes(context.supervisao),
      ...parseSupervisoes(getDeepValue(context, 'user.supervisoes')),
      ...parseSupervisoes(getDeepValue(context, 'user.supervisao')),
    ];

    return {
      restricted: !isMaster && (isGestor || allowedSupervisoes.length > 0),
      allowedSupervisoes: [...new Set(allowedSupervisoes)],
      role,
      setor,
      departmentName,
      departmentCode,
      coordenacao,
    };
  }

  async function loadOsAtender(dataReferencia, supervisao) {
    const set = new Set();
    state.osPorColaborador = new Map();
    try {
      let query = supabase
        .from('operacional_os')
        .select('*')
        .eq('status_gestor', 'ATENDER');
      query = Array.isArray(supervisao) ? query.in('supervisao', supervisao) : query.eq('supervisao', supervisao);
      const { data: osRows } = await query;
      const atenderRows = osRows || [];
      if (!atenderRows.length) return set;
      const osMap = new Map((atenderRows || []).map((r) => [String(r.id), r]));
      const { data: colabRows } = await supabase
        .from('operacional_os_colaboradores')
        .select('*')
        .in('os_id', atenderRows.map((r) => r.id));
      (colabRows || []).forEach((r) => {
        const os = { ...(osMap.get(String(r.os_id)) || {}), distancia_km: r.distancia_km };
        const cpf = normalizeCpf(r.colaborador_cpf || r.cpf);
        const key = String(r.colaborador_key || r.colaborador_id || '').trim();
        const nomeKey = normalizeText(r.colaborador_nome || r.nome_colaborador || r.nome || '').trim().toUpperCase();
        if (cpf) set.add(cpf);
        if (key) set.add(key);
        if (nomeKey) set.add(nomeKey);
        if (cpf) state.osPorColaborador.set(cpf, os);
        if (key) state.osPorColaborador.set(key, os);
        if (nomeKey) state.osPorColaborador.set(nomeKey, os);
      });
    } catch (e) {
      console.warn('Não foi possível carregar OS ATENDER.', e);
    }
    return set;
  }

  function colabEmOsAtender(colab) {
    if (!state.colabsEmOsAtender.size) return false;
    const cpf = normalizeCpf(colab.cpf);
    if (cpf && state.colabsEmOsAtender.has(cpf)) return true;
    const id = String(colab.id || '').trim();
    if (id && state.colabsEmOsAtender.has(id)) return true;
    const nomeKey = normalizeText(colab.nome || '').trim().toUpperCase();
    return Boolean(nomeKey && state.colabsEmOsAtender.has(nomeKey));
  }

  function colaboradorPodeFicarOk(colab) {
    return colabEmOsAtender(colab);
  }

  function suggestVeiculoForColab(colab) {
    // O cruzamento colaborador↔veículo é pré-calculado no banco (tabela
    // colaborador_cruzamento, atualizada por pg_cron) — aqui é só leitura
    // O(1), sem refazer matching de nome/CPF no navegador a cada colaborador.
    const cpfColab = normalizeCpf(colab?.cpf);
    const row = cpfColab ? state.cruzamentoByCpf.get(cpfColab) : null;
    return row?.veiculo_placa ? { placa: row.veiculo_placa } : null;
  }

  function updatePlacaLogisticaAlert(tr) {
    if (!tr) return;
    const alert = tr.querySelector('.prog-placa-alert');
    if (!alert) return;
    const colab = colabById(tr.dataset.colabId);
    const placa = tr.querySelector('[data-field="placa_veiculo"]')?.value || '';
    const msg = placa ? patrimonioMessageForRow(colab, 'MOTORISTA FROTA', placa) : '';
    alert.textContent = msg;
    alert.classList.toggle('show', Boolean(msg));
  }

  async function fillSupervisoes() {
    el.sup.innerHTML = '<option value="">Selecione...</option>';
    el.sup.disabled = false;

    const { data, error } = await supabase
      .from('supervisoes')
      .select('nome')
      .eq('ativo', true)
      .order('nome', { ascending: true });

    if (error) {
      setFeedback(`Erro ao carregar supervisões: ${error.message}`, 'error');
      return;
    }

    const todasSupervisoes = (data || []).map((r) => String(r.nome || '').trim()).filter(Boolean);
    state.todasSupervisoes = todasSupervisoes;
    const supervisoes = filterAllowedSupervisoes(todasSupervisoes, state.access);

    if (state.access?.restricted && !supervisoes.length) {
      el.sup.disabled = true;
      setFeedback('Seu usuário está como Gestor, mas não possui supervisão liberada. Ajuste a supervisão no cadastro do usuário.', 'error');
      return;
    }

    // Checagem por chave normalizada (não só valor exato) porque
    // programacao-gestor-filtro-fix.js roda em paralelo (MutationObserver +
    // window.load) e pode inserir opções no MESMO <select> nesta janela entre
    // o innerHTML de reset acima e este forEach — sem isso, a mesma
    // supervisão aparecia duplicada no dropdown (ex.: "SP - Avaré" 2x).
    const existing = new Set([...el.sup.options].map((opt) => normalizeAccessText(opt.value || opt.textContent)));
    supervisoes.forEach((sup) => {
      const key = normalizeAccessText(sup);
      if (key && existing.has(key)) return;
      const option = document.createElement('option');
      option.value = sup;
      option.textContent = sup;
      el.sup.appendChild(option);
      if (key) existing.add(key);
    });

    if (supervisoes.length === 1) {
      el.sup.value = supervisoes[0];
      el.sup.disabled = true;
      setFeedback(`Supervisão limitada ao acesso do usuário: ${supervisoes[0]}.`, 'ok');
    } else if (state.access?.restricted) {
      setFeedback(`Supervisões liberadas para este gestor: ${supervisoes.length}.`, 'ok');
    }
  }

  async function ensureProgramacaoDia(dataReferencia, supervisao, coordenacao = '') {
    const found = await supabase
      .from('programacao_dia')
      .select('*')
      .eq('data_referencia', dataReferencia)
      .eq('supervisao', supervisao)
      .limit(1)
      .maybeSingle();

    if (found.error) throw found.error;
    if (found.data) return found.data;

    const inserted = await supabase
      .from('programacao_dia')
      .insert({
        data_referencia: dataReferencia,
        supervisao,
        coordenacao: coordenacao || null,
        regional: supervisao || null,
        status: 'rascunho',
        criado_por: state.user?.id || null,
      })
      .select('*')
      .single();

    if (inserted.error) throw inserted.error;
    return inserted.data;
  }

  // Une a tabela legada `indisponibilidades` (importada, chaveada por CPF) com
  // os lançamentos novos do RH (rh_ferias/rh_atestados, chaveados por uuid de
  // `colaboradores` — resolvido pra CPF aqui). Sem a parte do RH, férias e
  // atestado lançados em RH > Indisponibilidade não pré-marcavam o colaborador
  // como INDISPONÍVEL no roster da programação.
  async function loadIndisponibilidades(dataReferencia) {
    try {
      const [legado, ferias, atestados] = await Promise.all([
        supabase
          .from('indisponibilidades')
          .select('colaborador_cpf, colaborador_nome, data_inicio, data_fim, motivo')
          .lte('data_inicio', dataReferencia)
          .or(`data_fim.is.null,data_fim.gte.${dataReferencia}`),
        supabase
          .from('rh_ferias')
          .select('colaborador_id, colaborador_nome, data_inicio, data_fim')
          .in('status', ['programada', 'em_gozo'])
          .lte('data_inicio', dataReferencia)
          .gte('data_fim', dataReferencia),
        supabase
          .from('rh_atestados')
          .select('colaborador_id, colaborador_nome, data_inicio, data_fim')
          .in('status', ['lancado', 'aprovado'])
          .lte('data_inicio', dataReferencia)
          .gte('data_fim', dataReferencia),
      ]);
      const map = new Map((legado.data || []).map((r) => [normalizeCpf(r.colaborador_cpf), r]));

      const rhRows = [
        ...(ferias.data || []).map((r) => ({ ...r, motivo: 'FERIAS' })),
        ...(atestados.data || []).map((r) => ({ ...r, motivo: 'ATESTADO' })),
      ];
      const ids = [...new Set(rhRows.map((r) => r.colaborador_id).filter(Boolean))];
      const cpfPorId = new Map();
      if (ids.length) {
        const { data: cads } = await supabase.from('colaboradores').select('id,cpf').in('id', ids);
        (cads || []).forEach((c) => cpfPorId.set(String(c.id), normalizeCpf(c.cpf)));
      }
      rhRows.forEach((r) => {
        const cpf = r.colaborador_id ? cpfPorId.get(String(r.colaborador_id)) : '';
        if (!cpf || map.has(cpf)) return;
        map.set(cpf, {
          colaborador_cpf: cpf,
          colaborador_nome: r.colaborador_nome,
          data_inicio: r.data_inicio,
          data_fim: r.data_fim,
          motivo: r.motivo,
        });
      });
      return map;
    } catch (_) {
      return new Map();
    }
  }

  async function loadContext() {
    const dataReferencia = el.dataRef.value;
    const supervisao = el.sup.value;
    if (!dataReferencia || !supervisao) {
      setFeedback('Selecione a data e a supervisão.', 'warn');
      return;
    }

    const isTodas = supervisao === TODAS_SUPERVISOES;

    if (!isTodas) {
      const allowedNow = filterAllowedSupervisoes([supervisao], state.access);
      if (state.access?.restricted && !allowedNow.includes(supervisao)) {
        setFeedback('Esta supervisão não está liberada para o seu usuário.', 'error');
        return;
      }
    }

    state.dataReferencia = dataReferencia;
    state.supervisao = supervisao;
    setFeedback('Carregando contexto...', 'warn');
    el.saveBtn.disabled = true;
    el.list.innerHTML = '<div class="table-empty">Carregando colaboradores...</div>';

    try {
      let supervisoesQuery = supervisao;
      if (isTodas) {
        const permitidas = filterAllowedSupervisoes(state.todasSupervisoes, state.access);
        const { data: comOs, error: comOsErr } = await supabase.rpc('programacao_supervisoes_com_os_acionavel', { p_supervisoes: permitidas });
        if (comOsErr) throw comOsErr;
        supervisoesQuery = (comOs || []).map((r) => r.supervisao).filter(Boolean);
        if (!supervisoesQuery.length) throw new Error('Nenhuma supervisão liberada tem O.S. acionável no momento.');
      }
      state.supervisoesResolvidas = isTodas ? supervisoesQuery : [supervisao];

      // As 3 consultas abaixo não dependem entre si — só de data/supervisão —
      // mas eram feitas em sequência (uma esperando a outra terminar). Isso
      // sozinho já multiplicava a latência de rede.
      const [fobsPendentes, indisponibilidades, colabsEmOsAtender] = await Promise.all([
        checkFobPendenciasBloqueantes(dataReferencia, supervisoesQuery),
        loadIndisponibilidades(dataReferencia),
        loadOsAtender(dataReferencia, supervisoesQuery),
      ]);

      if (fobsPendentes.length) {
        showFobBlockedMessage(fobsPendentes);
        el.saveBtn.disabled = true;
        return;
      }

      let colabQuery = supabase
        .from('colaboradores_atuais')
        .select('*')
        .order('nome', { ascending: true });
      colabQuery = isTodas ? colabQuery.in('supervisao', supervisoesQuery) : colabQuery.eq('supervisao', supervisao);
      const { data: colaboradores, error: colabError } = await colabQuery;

      if (colabError) throw colabError;

      const _seenColabs = new Set();
      const colaboradoresAtivos = (colaboradores || []).filter(isColaboradorAtivo).filter((colab) => {
        const cpf = normalizeCpf(colab.cpf);
        const key = cpf || normalizeText(String(colab.nome || '')).trim().toUpperCase();
        if (!key || _seenColabs.has(key)) return false;
        _seenColabs.add(key);
        return true;
      });

      if (isTodas) {
        const coordenacaoPorSupervisao = new Map();
        colaboradoresAtivos.forEach((colab) => {
          if (!coordenacaoPorSupervisao.has(colab.supervisao)) coordenacaoPorSupervisao.set(colab.supervisao, colab.coordenacao || '');
        });
        const idMap = new Map();
        await Promise.all(supervisoesQuery.map(async (sup) => {
          const programacao = await ensureProgramacaoDia(dataReferencia, sup, coordenacaoPorSupervisao.get(sup) || '');
          idMap.set(sup, programacao.id);
        }));
        state.programacaoIdMap = idMap;
        state.programacaoId = null;
      } else {
        const programacao = await ensureProgramacaoDia(dataReferencia, supervisao, colaboradoresAtivos?.[0]?.coordenacao || '');
        state.programacaoId = programacao.id;
        state.programacaoIdMap = new Map();
      }

      state.colaboradores = colaboradoresAtivos.map((colab) => {
        const key = colaboradorKey(colab);
        const indis = indisponibilidades.get(normalizeCpf(colab.cpf));
        return {
          id: key,
          cpf: normalizeCpf(colab.cpf),
          nome: colab.nome || 'Colaborador',
          cargo: colab.cargo || '',
          coordenacao: colab.coordenacao || '',
          supervisao: colab.supervisao || '',
          indisponibilidade: indis || null,
        };
      });

      state.colabsEmOsAtender = colabsEmOsAtender;
      state.kmCache = new Map();
      await loadCruzamento(state.colaboradores.map((colab) => colab.cpf).filter(Boolean));
      await ensureDefaultRows();
      await loadStageData();
      updateStats();
      renderRows();
      el.saveBtn.disabled = false;
      setFeedback(`Contexto carregado com ${state.colaboradores.length} colaboradores.`, 'ok');
    } catch (error) {
      console.error(error);
      setFeedback(error.message || 'Erro ao carregar contexto.', 'error');
      el.list.innerHTML = `<div class="table-empty">${escapeHtml(error.message || 'Erro ao carregar')}</div>`;
    }
  }

  async function ensureDefaultRows() {
    if (!state.programacaoId && !state.programacaoIdMap.size) return;
    if (!state.colaboradores.length) return;
    const payload = state.colaboradores.map((colab) => {
      const motivo = disponibilidadeNorm(colab.indisponibilidade?.motivo || '');
      const veiculoVinculado = !colab.indisponibilidade && !colaboradorPodeFicarOk(colab) ? suggestVeiculoForColab(colab) : null;
      const disponibilidade = colab.indisponibilidade
        ? (INDISPONIBILIDADE_MOTIVOS.includes(motivo) ? motivo : 'ATESTADO')
        : (colaboradorPodeFicarOk(colab) ? 'OK' : (veiculoVinculado ? 'LOGISTICA' : 'SEM EMBARQUE'));
      return {
        programacao_id: programacaoIdFor(colab),
        data_referencia: state.dataReferencia,
        colaborador_id: colab.id,
        nome_colaborador: colab.nome,
        cargo: colab.cargo || null,
        coordenacao: colab.coordenacao || null,
        supervisao: colab.supervisao || null,
        disponibilidade,
        placa_veiculo: veiculoVinculado ? onlyPlate(veiculoVinculado.placa) : null,
      };
    }).filter((p) => p.programacao_id);

    const { error } = await supabase
      .from('programacao_colaboradores')
      .upsert(payload, { onConflict: 'programacao_id,colaborador_id', ignoreDuplicates: true });
    if (error) throw error;

    // Promove SEM EMBARQUE → OK para colaboradores que agora têm OS em ATENDER
    // (agrupado por programacao_id, pois sob "Todas" cada supervisão tem o seu)
    const porProgramacaoId = new Map();
    payload.filter((p) => p.disponibilidade === 'OK').forEach((p) => {
      if (!porProgramacaoId.has(p.programacao_id)) porProgramacaoId.set(p.programacao_id, []);
      porProgramacaoId.get(p.programacao_id).push(p.colaborador_id);
    });
    await Promise.all([...porProgramacaoId.entries()].map(([pid, ids]) => supabase
      .from('programacao_colaboradores')
      .update({ disponibilidade: 'OK' })
      .eq('programacao_id', pid)
      .in('colaborador_id', ids)
      .eq('disponibilidade', 'SEM EMBARQUE')));
  }

  async function loadStageData() {
    const pids = state.programacaoIdMap.size ? [...state.programacaoIdMap.values()] : [state.programacaoId];
    const [disp, estadia, alimentacao, deslocamento, extras] = await Promise.all([
      supabase.from('programacao_colaboradores').select('*').in('programacao_id', pids),
      supabase.from('programacao_estadia').select('*').in('programacao_id', pids),
      supabase.from('programacao_alimentacao').select('*').in('programacao_id', pids),
      supabase.from('programacao_deslocamento').select('*').in('programacao_id', pids),
      supabase.from('programacao_extras').select('*').in('programacao_id', pids).order('created_at', { ascending: true }),
    ]);

    for (const res of [disp, estadia, alimentacao, deslocamento, extras]) {
      if (res.error) throw res.error;
    }

    state.maps.disponibilidade = new Map((disp.data || []).map((r) => [String(r.colaborador_id), r]));
    state.maps.estadia = new Map((estadia.data || []).map((r) => [String(r.colaborador_id), r]));
    state.maps.alimentacao = new Map((alimentacao.data || []).map((r) => [String(r.colaborador_id), r]));
    state.maps.deslocamento = new Map((deslocamento.data || []).map((r) => [String(r.colaborador_id), r]));
    const extrasMap = new Map();
    (extras.data || []).forEach((r) => {
      const key = String(r.colaborador_id);
      if (!extrasMap.has(key)) extrasMap.set(key, []);
      extrasMap.get(key).push(r);
    });
    state.maps.extras = extrasMap;
  }

  function setStep(step) {
    state.step = step;
    const meta = STEPS.find((s) => s.code === step) || STEPS[0];
    if (el.currentStep) el.currentStep.textContent = meta.code;
    if (el.currentStepLabel) el.currentStepLabel.textContent = meta.label;
    [...el.steps.querySelectorAll('.stepbtn')].forEach((btn) => btn.classList.toggle('active', btn.dataset.step === step));
    renderRows();
  }

  function disponibilidadeAtual(colab) {
    const row = state.maps.disponibilidade.get(String(colab.id));
    return disponibilidadeNorm(row?.disponibilidade || 'OK');
  }

  function isDisponibilidadeBloqueada(value) {
    const normalized = disponibilidadeNorm(value);
    return !DISPONIBILIDADES_LIBERADAS.has(normalized);
  }

  function isBlocked(colab) {
    const disp = disponibilidadeCategoria(disponibilidadeAtual(colab));
    if (disp === 'OK' && !colaboradorPodeFicarOk(colab)) return true;
    return isDisponibilidadeBloqueada(disponibilidadeAtual(colab));
  }

  function splitByDisponibilidade(rows) {
    const disponiveis = [];
    const bloqueados = [];
    (rows || []).forEach((colab) => (isBlocked(colab) ? bloqueados : disponiveis).push(colab));
    return { disponiveis, bloqueados };
  }

  function updateStats() {
    if (el.statTotal) el.statTotal.textContent = String(state.colaboradores.length);
    if (el.statBlocked) el.statBlocked.textContent = String(state.colaboradores.filter(isBlocked).length);
  }

  function filteredColaboradores() {
    return state.colaboradores.filter((colab) => {
      if (!state.search) return true;
      return `${colab.nome} ${colab.cargo} ${colab.supervisao} ${colab.coordenacao}`.toLowerCase().includes(state.search);
    });
  }

  function renderRows() {
    if (!state.programacaoId && !state.programacaoIdMap.size) {
      el.list.innerHTML = '<div class="table-empty">Carregue um contexto para iniciar a programação.</div>';
      return;
    }
    const rows = filteredColaboradores();
    if (!rows.length) {
      el.list.innerHTML = '<div class="table-empty">Nenhum colaborador encontrado.</div>';
      return;
    }
    if (state.step === 'A') return renderDisponibilidade(rows);
    if (state.step === 'B') return renderEstadia(rows);
    if (state.step === 'C') return renderAlimentacao(rows);
    if (state.step === 'D') return renderDeslocamento(rows);
    return renderExtras(rows);
  }

  function colabCell(colab) {
    const blocked = isBlocked(colab);
    return `
      <div class="colab-name">${escapeHtml(colab.nome)}</div>
      <div class="colab-meta">${escapeHtml(colab.cargo || 'Colaborador')} • ${escapeHtml(colab.supervisao || '-')}</div>
      ${colab.indisponibilidade ? `<div class="colab-meta">Indisponibilidade importada: ${escapeHtml(colab.indisponibilidade.motivo || 'Indisponível')}</div>` : ''}
      ${!colaboradorPodeFicarOk(colab) ? '<div class="colab-meta">Sem O.S. em ATENDER vinculada para permitir OK.</div>' : ''}
      <div style="margin-top:6px"><span class="prog-status ${blocked ? 'block' : 'ok'}">${blocked ? 'Bloqueado' : 'Liberado'}</span></div>
    `;
  }

  function renderDisponibilidade(rows) {
    // Quem já foi confirmado para atender uma O.S. na etapa B (Organizar
    // Equipe) não aparece mais aqui — esta etapa é só para quem não atende.
    const naoAtende = rows.filter((colab) => disponibilidadeCategoria(disponibilidadeAtual(colab)) !== 'OK');
    const { disponiveis, bloqueados } = splitByDisponibilidade(naoAtende);
    el.list.innerHTML = `
      ${renderDisponibilidadeTable('Disponíveis', disponiveis, false)}
      ${renderDisponibilidadeTable('Bloqueados', bloqueados, true)}
    `;
  }

  function renderDisponibilidadeTable(title, rows, blockedSection) {
    return `
      <div class="prog-section-title ${blockedSection ? 'blocked' : ''}">
        <h4>${escapeHtml(title)}</h4>
        <span class="badge">${rows.length}</span>
      </div>
      ${rows.length ? `
        <div class="prog-table-wrap">
          <table class="prog-table">
            <thead><tr><th>Colaborador</th><th>Disponibilidade</th><th>Observação</th></tr></thead>
            <tbody>
              ${rows.map((colab) => {
                const r = state.maps.disponibilidade.get(String(colab.id)) || {};
                const categoria = disponibilidadeCategoria(r.disponibilidade || 'OK');
                const motivo = disponibilidadeMotivo(r.disponibilidade || '');
                const placa = r.placa_veiculo || '';
                const sugestao = categoria === 'LOGISTICA' && !placa ? suggestVeiculoForColab(colab) : null;
                const placaSugerida = sugestao?.placa || '';
                const alertMsg = placa ? patrimonioMessageForRow(colab, 'MOTORISTA FROTA', placa) : '';
                return `<tr data-colab-id="${escapeHtml(colab.id)}" data-table="programacao_colaboradores">
                  <td>${colabCell(colab)}</td>
                  <td>
                    <div class="prog-tipo-selector">
                      ${DISPONIBILIDADES_ETAPA_C.map((op) => {
                        return `<button type="button" class="prog-tipo-btn${categoria === op ? ' active' : ''}" data-tipo="${escapeHtml(op)}">${escapeHtml(disponibilidadeLabel(op))}</button>`;
                      }).join('')}
                      <input type="hidden" data-field="disponibilidade" value="${escapeHtml(categoria === 'INDISPONIVEL' ? (motivo || 'ATESTADO') : categoria)}" />
                    </div>
                    ${categoria === 'INDISPONIVEL' ? `<div class="prog-indisponivel-wrap">
                      <select data-indisponivel-motivo>${INDISPONIBILIDADE_MOTIVOS.map((op) => `<option value="${escapeHtml(op)}" ${String(motivo || 'ATESTADO') === op ? 'selected' : ''}>${escapeHtml(disponibilidadeLabel(op))}</option>`).join('')}</select>
                    </div>` : ''}
                    ${categoria === 'LOGISTICA' ? `<div class="prog-placa-wrap">
                      <input data-field="placa_veiculo" list="progVeiculosFrotaList" type="text" maxlength="8" value="${escapeHtml(placa)}" placeholder="${placaSugerida ? 'Sugestão: ' + placaSugerida : 'Digite a placa'}" />
                      ${placaSugerida && !placa ? `<button type="button" class="prog-placa-suggest-btn" data-placa="${escapeHtml(placaSugerida)}">Usar ${escapeHtml(placaSugerida)}</button>` : ''}
                      <div class="prog-placa-alert${alertMsg ? ' show' : ''}">${escapeHtml(alertMsg)}</div>
                    </div>` : ''}
                  </td>
                  <td><input data-field="observacao" type="text" value="${escapeHtml(r.observacao || '')}" placeholder="Observação da disponibilidade" /></td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>` : `<div class="prog-empty-section">Nenhum colaborador em ${blockedSection ? 'Bloqueados' : 'Disponíveis'}.</div>`}
    `;
  }

  function renderBloqueadosResumo(rows) {
    if (!rows.length) return '';
    return `
      <div class="prog-section-title blocked">
        <h4>Bloqueados</h4>
        <span class="badge">${rows.length}</span>
      </div>
      <div class="prog-table-wrap">
        <table class="prog-table">
          <thead><tr><th>Colaborador</th><th>Motivo</th><th>Observação</th></tr></thead>
          <tbody>
            ${rows.map((colab) => {
              const r = state.maps.disponibilidade.get(String(colab.id)) || {};
              return `<tr data-colab-id="${escapeHtml(colab.id)}">
                <td>${colabCell(colab)}</td>
                <td><span class="prog-status block">${escapeHtml(disponibilidadeLabel(r.disponibilidade || 'BLOQUEADO'))}</span></td>
                <td>${escapeHtml(r.observacao || '-')}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>`;
  }

  function renderEstadia(rows) {
    const { disponiveis, bloqueados } = splitByDisponibilidade(rows);
    el.list.innerHTML = `
      <div class="prog-section-title">
        <h4>Disponíveis</h4>
        <span class="badge">${disponiveis.length}</span>
      </div>
      ${disponiveis.length ? `<div class="prog-table-wrap">
        <table class="prog-table">
          <thead><tr><th>Colaborador</th><th>Tipo de hospedagem</th><th>Cidade</th><th>UF</th><th>Alojamento sugerido</th><th>Check-in</th><th>Check-out</th><th>Observação</th></tr></thead>
          <tbody>
            ${disponiveis.map((colab) => {
              const r = state.maps.estadia.get(String(colab.id)) || {};
              const blocked = isBlocked(colab);
              const tipoAtual = normalizeText(r.tipo_estadia || '');
              return `<tr data-colab-id="${escapeHtml(colab.id)}" data-table="programacao_estadia">
                <td>${colabCell(colab)}</td>
                <td>
                  <div class="prog-estadia-selector" data-estadia-selector>
                    ${TIPOS_ESTADIA_BOTOES.map((tipo) => `<button type="button" class="prog-estadia-card${tipoAtual === tipo ? ' active' : ''}" data-estadia-tipo="${escapeHtml(tipo)}" ${blocked ? 'disabled' : ''}>${estadiaIcon(tipo)}<span>${escapeHtml(estadiaLabel(tipo))}</span></button>`).join('')}
                  </div>
                  <input data-field="tipo_estadia" type="hidden" value="${escapeHtml(tipoAtual)}" />
                  ${!tipoAtual ? '<div class="prog-required-note prog-required-note--info">Casa (nenhuma opção selecionada).</div>' : ''}
                </td>
                <td><input data-field="cidade" list="progCidadesBrasilList" type="text" value="${escapeHtml(r.cidade || '')}" placeholder="Digite e selecione a cidade" ${blocked ? 'disabled' : ''}/></td>
                <td><input data-field="uf" type="text" value="${escapeHtml(r.uf || '')}" placeholder="UF" maxlength="2" ${blocked ? 'disabled' : ''}/></td>
                <td><select data-field="alojamento_id" ${blocked ? 'disabled' : ''}>${alojamentoOptions(r.alojamento_id, r.cidade, r.uf)}</select><input data-field="alojamento_nome" type="hidden" value="${escapeHtml(r.alojamento_nome || '')}" /></td>
                <td><input data-field="checkin" type="date" value="${escapeHtml(r.checkin || todayIso())}" ${blocked ? 'disabled' : ''}/></td>
                <td><input data-field="checkout" type="date" value="${escapeHtml(r.checkout || '')}" ${blocked ? 'disabled' : ''}/></td>
                <td><input data-field="observacao" type="text" value="${escapeHtml(r.observacao || '')}" ${blocked ? 'disabled' : ''}/></td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>` : '<div class="prog-empty-section">Nenhum colaborador disponível para estadia.</div>'}
      ${renderBloqueadosResumo(bloqueados)}`;

    el.list.querySelectorAll('tr[data-table="programacao_estadia"]').forEach((tr) => {
      const tipo = String(tr.querySelector('[data-field="tipo_estadia"]')?.value || '').toUpperCase();
      const cidadeEl = tr.querySelector('[data-field="cidade"]');
      if (tipo === 'HOTEL' && cidadeEl && !cidadeEl.value && preencherCidadeDaOs(tr)) {
        atualizarSugestaoAlojamento(tr);
        scheduleSaveRow(tr);
      }
    });
  }

  function renderAlimentacao(rows) {
    const { disponiveis, bloqueados } = splitByDisponibilidade(rows);
    el.list.innerHTML = `
      <div class="prog-section-title">
        <h4>Disponíveis</h4>
        <span class="badge">${disponiveis.length}</span>
      </div>
      ${disponiveis.length ? `<div class="prog-table-wrap">
        <table class="prog-table">
          <thead><tr><th>Colaborador</th><th>Café</th><th>Almoço</th><th>Janta</th><th>Observação</th></tr></thead>
          <tbody>
            ${disponiveis.map((colab) => {
              const r = state.maps.alimentacao.get(String(colab.id)) || { almoco: true };
              const blocked = isBlocked(colab);
              return `<tr data-colab-id="${escapeHtml(colab.id)}" data-table="programacao_alimentacao">
                <td>${colabCell(colab)}</td>
                <td><input data-field="cafe" type="checkbox" ${r.cafe ? 'checked' : ''} ${blocked ? 'disabled' : ''}/></td>
                <td><input data-field="almoco" type="checkbox" ${r.almoco !== false ? 'checked' : ''} ${blocked ? 'disabled' : ''}/></td>
                <td><input data-field="janta" type="checkbox" ${r.janta ? 'checked' : ''} ${blocked ? 'disabled' : ''}/></td>
                <td><input data-field="observacao" type="text" value="${escapeHtml(r.observacao || '')}" ${blocked ? 'disabled' : ''}/></td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>` : '<div class="prog-empty-section">Nenhum colaborador disponível para alimentação.</div>'}
      ${renderBloqueadosResumo(bloqueados)}`;
  }

  function renderDeslocamento(rows) {
    const { disponiveis, bloqueados } = splitByDisponibilidade(rows);
    el.list.innerHTML = `
      <div class="prog-section-title">
        <h4>Disponíveis</h4>
        <span class="badge">${disponiveis.length}</span>
      </div>
      ${disponiveis.length ? `<div class="prog-table-wrap">
        <table class="prog-table">
          <thead><tr><th>Colaborador</th><th>Deslocamento</th><th>Placa</th><th>KM estimado</th><th>Valor</th><th>Observação</th></tr></thead>
          <tbody>
            ${disponiveis.map((colab) => {
              const r = state.maps.deslocamento.get(String(colab.id)) || {};
              const disp = state.maps.disponibilidade.get(String(colab.id)) || {};
              const isLogistica = disponibilidadeCategoria(disp.disponibilidade) === 'LOGISTICA';
              const kmInfo = kmEstimadoColaborador(colab);
              const kmValue = r.km || (Number.isFinite(kmInfo.km) ? kmInfo.km.toFixed(2) : '');
              const tipoDefault = isLogistica ? 'MOTORISTA FROTA' : 'NÃO PRECISA';
              const tipoValue = r.tipo_deslocamento || tipoDefault;
              const placaValue = r.placa_veiculo || (isLogistica ? disp.placa_veiculo || '' : '');
              const blocked = isBlocked(colab);
              return `<tr data-colab-id="${escapeHtml(colab.id)}" data-table="programacao_deslocamento">
                <td>${colabCell(colab)}</td>
                <td><select data-field="tipo_deslocamento" ${blocked ? 'disabled' : ''}>${selectOptions(TIPOS_DESLOCAMENTO, tipoValue)}</select></td>
                <td>
                  <input data-field="placa_veiculo" list="progVeiculosFrotaList" type="text" value="${escapeHtml(placaValue)}" placeholder="Placa" maxlength="7" ${blocked ? 'disabled' : ''}/>
                  ${(() => {
                    const message = patrimonioMessageForRow(colab, tipoValue, placaValue);
                    return `<div data-patrimonio-alert class="prog-patrimonio-alert ${message ? 'show' : ''}">${escapeHtml(message)}</div>`;
                  })()}
                </td>
                <td>
                  <input data-field="km" type="number" min="0" step="0.01" value="${escapeHtml(kmValue)}" placeholder="" ${blocked ? 'disabled' : ''}/>
                  <span class="prog-km-note">${escapeHtml(kmInfo.km == null ? kmInfo.motivo : kmInfo.motivo)}</span>
                </td>
                <td><input data-field="valor" type="text" value="${escapeHtml(r.valor || '')}" placeholder="R$ 0,00" ${blocked ? 'disabled' : ''}/></td>
                <td><input data-field="observacao" type="text" value="${escapeHtml(r.observacao || '')}" ${blocked ? 'disabled' : ''}/></td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>` : '<div class="prog-empty-section">Nenhum colaborador disponível para deslocamento.</div>'}
      ${renderBloqueadosResumo(bloqueados)}`;
  }

  function renderExtras(rows) {
    const { disponiveis, bloqueados } = splitByDisponibilidade(rows);
    el.list.innerHTML = `
      <div class="prog-section-title">
        <h4>Disponíveis</h4>
        <span class="badge">${disponiveis.length}</span>
      </div>
      ${disponiveis.length ? `<div class="prog-table-wrap">
        <table class="prog-table">
          <thead><tr><th style="width:280px">Colaborador</th><th>Despesas extras</th><th style="width:130px">Total</th><th style="width:150px">Ação</th></tr></thead>
          <tbody>
            ${disponiveis.map((colab) => {
              const blocked = isBlocked(colab);
              const extras = state.maps.extras.get(String(colab.id)) || [];
              const total = extras.reduce((acc, r) => acc + Number(r.valor || 0), 0);
              return `<tr data-colab-id="${escapeHtml(colab.id)}" data-table="programacao_extras">
                <td>${colabCell(colab)}</td>
                <td>
                  ${extras.length ? extras.map((r) => extraCard(r, blocked)).join('') : '<span class="muted">Nenhuma despesa extra lançada.</span>'}
                </td>
                <td class="prog-extra-total">${moneyBR(total)}</td>
                <td><button type="button" class="prog-mini-btn" data-action="add-extra" ${blocked ? 'disabled' : ''}>+ Adicionar</button></td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>` : '<div class="prog-empty-section">Nenhum colaborador disponível para extras.</div>'}
      ${renderBloqueadosResumo(bloqueados)}`;
  }

  function extraCard(r, blocked) {
    return `<div class="prog-extra-card" data-extra-id="${escapeHtml(r.id)}">
      <select data-extra-field="tipo_despesa" ${blocked ? 'disabled' : ''}>${selectOptions(TIPOS_EXTRA, r.tipo_despesa || 'OUTRO')}</select>
      <input data-extra-field="descricao" type="text" value="${escapeHtml(r.descricao || '')}" placeholder="Descrição" ${blocked ? 'disabled' : ''}/>
      <input data-extra-field="valor" type="text" value="${escapeHtml(r.valor || '')}" placeholder="R$ 0,00" ${blocked ? 'disabled' : ''}/>
      <input data-extra-field="observacao" type="text" value="${escapeHtml(r.observacao || '')}" placeholder="Observação" ${blocked ? 'disabled' : ''}/>
      <button type="button" class="prog-mini-btn danger" data-action="delete-extra" ${blocked ? 'disabled' : ''}>Excluir</button>
    </div>`;
  }


  function preencherUfPorCidade(tr) {
    if (!tr) return;
    const cidadeEl = tr.querySelector('[data-field="cidade"]');
    const ufEl = tr.querySelector('[data-field="uf"]');
    const match = matchCidade(cidadeEl?.value, ufEl?.value);
    if (match) {
      cidadeEl.value = match.nome;
      if (ufEl) ufEl.value = match.uf;
    }
    atualizarSugestaoAlojamento(tr);
  }

  function preencherAlojamentoSelecionado(tr) {
    if (!tr) return;
    const select = tr.querySelector('[data-field="alojamento_id"]');
    const hidden = tr.querySelector('[data-field="alojamento_nome"]');
    const aloj = (state.alojamentos || []).find((a) => String(a.id) === String(select?.value || ''));
    if (hidden) hidden.value = aloj?.nome || '';
    if (aloj) {
      const cidadeEl = tr.querySelector('[data-field="cidade"]');
      const ufEl = tr.querySelector('[data-field="uf"]');
      if (cidadeEl && !cidadeEl.value) cidadeEl.value = aloj.cidade || '';
      if (ufEl && !ufEl.value) ufEl.value = aloj.uf || '';
    }
  }

  function preencherCidadeDaOs(tr) {
    if (!tr) return false;
    const colab = colabById(tr.dataset.colabId);
    const os = getOsForColab(colab);
    const cidadeInfo = cidadeUfFromOs(os);
    if (!cidadeInfo) return false;
    const cidadeEl = tr.querySelector('[data-field="cidade"]');
    const ufEl = tr.querySelector('[data-field="uf"]');
    if (!cidadeEl) return false;
    cidadeEl.value = cidadeInfo.cidade || '';
    if (ufEl) ufEl.value = cidadeInfo.uf || '';
    return true;
  }

  function atualizarSugestaoAlojamento(tr) {
    if (!tr) return;
    const tipo = String(tr.querySelector('[data-field="tipo_estadia"]')?.value || '').toUpperCase();
    const select = tr.querySelector('[data-field="alojamento_id"]');
    if (!select) return;
    const cidade = tr.querySelector('[data-field="cidade"]')?.value || '';
    const uf = tr.querySelector('[data-field="uf"]')?.value || '';
    const current = select.value;
    select.innerHTML = alojamentoOptions(current, cidade, uf);
    if (tipo !== 'ALOJAMENTO') {
      select.value = '';
      const hidden = tr.querySelector('[data-field="alojamento_nome"]');
      if (hidden) hidden.value = '';
    }
  }

  function handleTableInput(event) {
    const tr = event.target.closest('tr');
    if (event.target.matches('[data-field="placa_veiculo"]')) {
      event.target.value = onlyPlate(event.target.value);
      if (tr?.dataset.table === 'programacao_colaboradores') updatePlacaLogisticaAlert(tr);
      else updatePatrimonioAlert(tr);
    }
    if (event.target.matches('[data-field]')) scheduleSaveRow(tr);
    if (event.target.matches('[data-extra-field]')) scheduleSaveExtra(event.target.closest('.prog-extra-card'));
  }

  function handleTableChange(event) {
    const tr = event.target.closest('tr');
    if (event.target.matches('[data-field="cidade"]')) preencherUfPorCidade(tr);
    if (event.target.matches('[data-field="uf"]')) event.target.value = normalizeUF(event.target.value);
    if (event.target.matches('[data-field="alojamento_id"]')) preencherAlojamentoSelecionado(tr);
    if (event.target.matches('[data-field="disponibilidade"]') && tr?.dataset.table === 'programacao_colaboradores') {
      const disp = event.target.value;
      const td = event.target.closest('td');
      let placaWrap = td?.querySelector('.prog-placa-wrap');
      if (disp === 'LOGISTICA') {
        if (!placaWrap) {
          const colab = colabById(tr.dataset.colabId);
          const sugestao = suggestVeiculoForColab(colab);
          placaWrap = document.createElement('div');
          placaWrap.className = 'prog-placa-wrap';
          placaWrap.innerHTML = `<input data-field="placa_veiculo" type="text" maxlength="8" value="" placeholder="${sugestao?.placa ? 'Sugestão: ' + sugestao.placa : 'Digite a placa'}" />${sugestao?.placa ? `<button type="button" class="prog-placa-suggest-btn" data-placa="${escapeHtml(sugestao.placa)}">Usar ${escapeHtml(sugestao.placa)}</button>` : ''}<div class="prog-placa-alert"></div>`;
          td.appendChild(placaWrap);
        }
      } else if (placaWrap) {
        placaWrap.remove();
      }
      const colabId = tr.dataset.colabId;
      const existing = state.maps.disponibilidade.get(colabId) || {};
      state.maps.disponibilidade.set(colabId, { ...existing, disponibilidade: disp });
      const statusSpan = tr.querySelector('.prog-status');
      const isNowBlocked = !DISPONIBILIDADES_LIBERADAS.has(disp.trim().toUpperCase());
      if (statusSpan) {
        statusSpan.className = `prog-status ${isNowBlocked ? 'block' : 'ok'}`;
        statusSpan.textContent = isNowBlocked ? 'Bloqueado' : 'Liberado';
      }
    }
    if (event.target.matches('[data-field="placa_veiculo"]')) {
      event.target.value = onlyPlate(event.target.value);
      if (tr?.dataset.table === 'programacao_colaboradores') updatePlacaLogisticaAlert(tr);
    }
    if (event.target.matches('[data-field="tipo_deslocamento"], [data-field="placa_veiculo"]') && tr?.dataset.table !== 'programacao_colaboradores') updatePatrimonioAlert(tr);
    if (event.target.matches('[data-indisponivel-motivo]')) {
      const hidden = tr?.querySelector('[data-field="disponibilidade"]');
      if (hidden) hidden.value = event.target.value || 'ATESTADO';
      scheduleSaveRow(tr);
      return;
    }
    if (event.target.matches('[data-field="tipo_estadia"]')) atualizarSugestaoAlojamento(tr);
    if (event.target.matches('[data-field]')) scheduleSaveRow(tr);
    if (event.target.matches('[data-extra-field]')) scheduleSaveExtra(event.target.closest('.prog-extra-card'));
  }

  async function handleTableClick(event) {
    const estadiaBtn = event.target.closest('.prog-estadia-card');
    if (estadiaBtn) {
      const tr = estadiaBtn.closest('tr');
      if (!tr || estadiaBtn.disabled) return;
      const wasActive = estadiaBtn.classList.contains('active');
      const tipo = wasActive ? '' : (estadiaBtn.dataset.estadiaTipo || '');
      const hidden = tr.querySelector('[data-field="tipo_estadia"]');
      if (hidden) hidden.value = tipo;
      tr.querySelectorAll('.prog-estadia-card').forEach((btn) => btn.classList.toggle('active', !wasActive && btn === estadiaBtn));
      const note = tr.querySelector('.prog-required-note');
      if (note) note.remove();
      if (tipo === 'HOTEL') preencherCidadeDaOs(tr);
      atualizarSugestaoAlojamento(tr);
      scheduleSaveRow(tr);
      return;
    }

    const tipoBtn = event.target.closest('.prog-tipo-btn');
    if (tipoBtn) {
      if (tipoBtn.disabled || tipoBtn.classList.contains('disabled')) return;
      const tipo = tipoBtn.dataset.tipo;
      const tr = tipoBtn.closest('tr');
      if (!tr) return;
      const colabId = tr.dataset.colabId;
      const colab = colabById(colabId);
      if (tipo === 'OK' && !colaboradorPodeFicarOk(colab)) {
        setFeedback('OK só pode ser marcado quando o colaborador tiver O.S. com status ATENDER no menu OS.', 'warn');
        return;
      }
      const existing = state.maps.disponibilidade.get(colabId) || {};
      const valorDisponibilidade = tipo === 'INDISPONIVEL' ? (disponibilidadeMotivo(existing.disponibilidade) || 'ATESTADO') : tipo;
      state.maps.disponibilidade.set(colabId, { ...existing, disponibilidade: valorDisponibilidade });
      const hiddenInput = tr.querySelector('[data-field="disponibilidade"]');
      if (hiddenInput) hiddenInput.value = valorDisponibilidade;
      tr.querySelectorAll('.prog-tipo-btn').forEach((b) => b.classList.toggle('active', b.dataset.tipo === tipo));
      let placaWrap = tr.querySelector('.prog-placa-wrap');
      let indisWrap = tr.querySelector('.prog-indisponivel-wrap');
      if (indisWrap && tipo !== 'INDISPONIVEL') indisWrap.remove();
      if (tipo === 'INDISPONIVEL' && !indisWrap) {
        const td = tipoBtn.closest('td');
        indisWrap = document.createElement('div');
        indisWrap.className = 'prog-indisponivel-wrap';
        indisWrap.innerHTML = `<select data-indisponivel-motivo>${INDISPONIBILIDADE_MOTIVOS.map((op) => `<option value="${escapeHtml(op)}" ${op === valorDisponibilidade ? 'selected' : ''}>${escapeHtml(disponibilidadeLabel(op))}</option>`).join('')}</select>`;
        const before = td.querySelector('.prog-placa-wrap');
        if (before) td.insertBefore(indisWrap, before); else td.appendChild(indisWrap);
      }
      if (tipo === 'LOGISTICA' && !placaWrap) {
        const td = tipoBtn.closest('td');
        placaWrap = document.createElement('div');
        placaWrap.className = 'prog-placa-wrap';
        const sugestao = suggestVeiculoForColab(colab);
        placaWrap.innerHTML = `<input data-field="placa_veiculo" list="progVeiculosFrotaList" type="text" maxlength="8" value="" placeholder="${sugestao?.placa ? 'Sugestão: ' + sugestao.placa : 'Digite a placa'}" />${sugestao?.placa ? `<button type="button" class="prog-placa-suggest-btn" data-placa="${escapeHtml(sugestao.placa)}">Usar ${escapeHtml(sugestao.placa)}</button>` : ''}<div class="prog-placa-alert"></div>`;
        td.appendChild(placaWrap);
      } else if (placaWrap && tipo !== 'LOGISTICA') {
        placaWrap.remove();
        if (existing.placa_veiculo) {
          state.maps.disponibilidade.set(colabId, { ...state.maps.disponibilidade.get(colabId), placa_veiculo: null });
        }
      }
      const statusSpan = tr.querySelector('.prog-status');
      const isNowBlocked = tipo === 'SEM EMBARQUE' || tipo === 'INDISPONIVEL' || (tipo === 'OK' && !colaboradorPodeFicarOk(colab));
      if (statusSpan) {
        statusSpan.className = `prog-status ${isNowBlocked ? 'block' : 'ok'}`;
        statusSpan.textContent = isNowBlocked ? 'Bloqueado' : 'Liberado';
      }
      scheduleSaveRow(tr);
      return;
    }

    const suggestBtn = event.target.closest('.prog-placa-suggest-btn');
    if (suggestBtn) {
      const tr = suggestBtn.closest('tr');
      if (!tr) return;
      const input = tr.querySelector('[data-field="placa_veiculo"]');
      if (input) {
        input.value = onlyPlate(suggestBtn.dataset.placa || '');
        suggestBtn.remove();
        updatePlacaLogisticaAlert(tr);
        scheduleSaveRow(tr);
      }
      return;
    }

    const addBtn = event.target.closest('[data-action="add-extra"]');
    if (addBtn) {
      const tr = addBtn.closest('tr');
      await addExtra(tr?.dataset.colabId);
      return;
    }
    const delBtn = event.target.closest('[data-action="delete-extra"]');
    if (delBtn) {
      const card = delBtn.closest('.prog-extra-card');
      await deleteExtra(card?.dataset.extraId);
    }
  }

  function scheduleSaveRow(tr) {
    if (!tr) return;
    const key = `${tr.dataset.table}:${tr.dataset.colabId}`;
    clearTimeout(state.timers.get(key));
    state.timers.set(key, setTimeout(() => saveRow(tr), 450));
  }

  function scheduleSaveExtra(card) {
    if (!card) return;
    const key = `extra:${card.dataset.extraId}`;
    clearTimeout(state.timers.get(key));
    state.timers.set(key, setTimeout(() => saveExtra(card), 450));
  }

  function colabById(id) {
    return state.colaboradores.find((c) => String(c.id) === String(id));
  }

  function getFieldPayload(container, attr = 'data-field') {
    const payload = {};
    container.querySelectorAll(`[${attr}]`).forEach((field) => {
      const key = field.getAttribute(attr);
      if (field.type === 'checkbox') payload[key] = !!field.checked;
      else if (['km', 'valor', 'diarias'].includes(key)) payload[key] = toNumberBR(field.value);
      else payload[key] = field.value || null;
    });
    return payload;
  }

  async function saveRow(tr) {
    const table = tr.dataset.table;
    const colab = colabById(tr.dataset.colabId);
    if (!table || !colab) return;

    const payload = {
      ...getFieldPayload(tr),
      programacao_id: programacaoIdFor(colab),
      data_referencia: state.dataReferencia,
      colaborador_id: colab.id,
      nome_colaborador: colab.nome,
    };
    if (!payload.programacao_id) {
      setFeedback(`Não foi possível resolver a programação do dia para ${colab.nome}.`, 'error');
      return;
    }

    if (table === 'programacao_estadia') {
      payload.uf = normalizeUF(payload.uf);
      if (payload.alojamento_id) {
        const aloj = (state.alojamentos || []).find((a) => String(a.id) === String(payload.alojamento_id));
        payload.alojamento_nome = aloj?.nome || payload.alojamento_nome || null;
      }
      payload.tipo_estadia = normalizeText(payload.tipo_estadia || '') || 'NAO PRECISA';
      payload.tem_estadia = TIPOS_ESTADIA_BOTOES.includes(payload.tipo_estadia);
    }
    if (table === 'programacao_deslocamento') {
      const disp = state.maps.disponibilidade.get(String(colab.id)) || {};
      if (disponibilidadeCategoria(disp.disponibilidade) === 'LOGISTICA') {
        payload.tipo_deslocamento = payload.tipo_deslocamento || 'MOTORISTA FROTA';
        payload.placa_veiculo = payload.placa_veiculo || disp.placa_veiculo || null;
      }
      payload.placa_veiculo = onlyPlate(payload.placa_veiculo);
    }
    if (table === 'programacao_colaboradores') {
      payload.placa_veiculo = payload.disponibilidade === 'LOGISTICA' ? onlyPlate(payload.placa_veiculo) : null;
    }

    const { data, error } = await supabase
      .from(table)
      .upsert(payload, { onConflict: 'programacao_id,colaborador_id' })
      .select('*')
      .single();

    if (error) {
      console.error(error);
      setFeedback(`Falha ao salvar ${colab.nome}: ${error.message}`, 'error');
      return;
    }

    if (table === 'programacao_colaboradores') state.maps.disponibilidade.set(String(colab.id), data);
    if (table === 'programacao_estadia') state.maps.estadia.set(String(colab.id), data);
    if (table === 'programacao_alimentacao') state.maps.alimentacao.set(String(colab.id), data);
    if (table === 'programacao_deslocamento') state.maps.deslocamento.set(String(colab.id), data);

    updateStats();
    setFeedback(`Salvo automaticamente em ${new Date().toLocaleTimeString('pt-BR')}.`, 'ok');

    if (table === 'programacao_colaboradores') renderRows();
  }

  async function addExtra(colabId) {
    const colab = colabById(colabId);
    if (!colab) return;
    const programacaoId = programacaoIdFor(colab);
    if (!programacaoId) return;

    const { data, error } = await supabase
      .from('programacao_extras')
      .insert({
        programacao_id: programacaoId,
        data_referencia: state.dataReferencia,
        colaborador_id: colab.id,
        nome_colaborador: colab.nome,
        tipo_despesa: 'OUTRO',
        descricao: '',
        valor: 0,
        observacao: '',
      })
      .select('*')
      .single();

    if (error) {
      console.error(error);
      setFeedback(`Falha ao adicionar extra: ${error.message}`, 'error');
      return;
    }

    const arr = state.maps.extras.get(String(colab.id)) || [];
    arr.push(data);
    state.maps.extras.set(String(colab.id), arr);
    renderRows();
    setFeedback('Despesa extra adicionada.', 'ok');
  }

  async function saveExtra(card, opts = {}) {
    const extraId = card?.dataset.extraId;
    if (!extraId) return;
    const payload = getFieldPayload(card, 'data-extra-field');

    const { data, error } = await supabase
      .from('programacao_extras')
      .update(payload)
      .eq('id', extraId)
      .select('*')
      .single();

    if (error) {
      console.error(error);
      setFeedback(`Falha ao salvar extra: ${error.message}`, 'error');
      return;
    }

    const arr = state.maps.extras.get(String(data.colaborador_id)) || [];
    const idx = arr.findIndex((r) => r.id === data.id);
    if (idx >= 0) arr[idx] = data;
    state.maps.extras.set(String(data.colaborador_id), arr);
    if (!opts.silent) {
      setFeedback(`Extra salvo em ${new Date().toLocaleTimeString('pt-BR')}.`, 'ok');
      renderRows();
    }
  }

  async function deleteExtra(extraId) {
    if (!extraId) return;
    const { error } = await supabase.from('programacao_extras').delete().eq('id', extraId);
    if (error) {
      console.error(error);
      setFeedback(`Falha ao excluir extra: ${error.message}`, 'error');
      return;
    }
    for (const [key, arr] of state.maps.extras.entries()) {
      state.maps.extras.set(key, arr.filter((r) => r.id !== extraId));
    }
    renderRows();
    setFeedback('Despesa extra excluída.', 'ok');
  }


  function draftValueFromDom(table, colabId, field) {
    const tr = el.list.querySelector(`tr[data-table="${table}"][data-colab-id="${CSS.escape(String(colabId))}"]`);
    return tr?.querySelector(`[data-field="${field}"]`)?.value ?? undefined;
  }

  function validarProgramacaoAntesSalvar() {
    const problemas = [];
    state.colaboradores.forEach((colab) => {
      const dispRow = state.maps.disponibilidade.get(String(colab.id)) || {};
      const disp = disponibilidadeCategoria(dispRow.disponibilidade || 'OK');
      const placaLogistica = onlyPlate((draftValueFromDom('programacao_colaboradores', colab.id, 'placa_veiculo') ?? dispRow.placa_veiculo) || '');
      if (disp === 'OK' && !colaboradorPodeFicarOk(colab)) problemas.push(`${colab.nome}: OK só é permitido quando existir O.S. com status ATENDER vinculada no menu OS.`);
      if (disp === 'LOGISTICA' && !placaLogistica) problemas.push(`${colab.nome}: informe ou selecione a placa na etapa A/Logística.`);
      if (disp === 'SEM EMBARQUE' || disp === 'INDISPONIVEL') return;

      const est = state.maps.estadia.get(String(colab.id)) || {};
      // Em branco = Casa (mesma leitura que o hint "Casa (nenhuma opção
      // selecionada)" já mostra na etapa B) — não bloqueia o salvamento.
      const tipoEstadia = normalizeText((draftValueFromDom('programacao_estadia', colab.id, 'tipo_estadia') ?? est.tipo_estadia) || '');
      const cidade = String((draftValueFromDom('programacao_estadia', colab.id, 'cidade') ?? est.cidade) || '').trim();
      const uf = normalizeUF((draftValueFromDom('programacao_estadia', colab.id, 'uf') ?? est.uf) || '');
      const alojamentoId = (draftValueFromDom('programacao_estadia', colab.id, 'alojamento_id') ?? est.alojamento_id) || '';
      if (['HOTEL', 'ALOJAMENTO', 'PERNOITE'].includes(tipoEstadia) && (!cidade || !uf)) problemas.push(`${colab.nome}: informe cidade/UF da hospedagem.`);
      if (tipoEstadia === 'ALOJAMENTO' && !alojamentoId) problemas.push(`${colab.nome}: selecione o alojamento sugerido/cadastrado.`);

      const desl = state.maps.deslocamento.get(String(colab.id)) || {};
      const tipoDeslocamento = String((draftValueFromDom('programacao_deslocamento', colab.id, 'tipo_deslocamento') ?? desl.tipo_deslocamento) || (disp === 'LOGISTICA' ? 'MOTORISTA FROTA' : '')).toUpperCase();
      const placaDeslocamento = onlyPlate((draftValueFromDom('programacao_deslocamento', colab.id, 'placa_veiculo') ?? desl.placa_veiculo) || (disp === 'LOGISTICA' ? placaLogistica : ''));
      if (['MOTORISTA FROTA', 'CARONA FROTA'].includes(tipoDeslocamento) && !placaDeslocamento) problemas.push(`${colab.nome}: informe a placa do veículo na etapa D.`);
    });
    return problemas;
  }

  async function saveProgramacao() {
    if (!state.programacaoId && !state.programacaoIdMap.size) {
      setFeedback('Carregue um contexto antes de salvar a programação.', 'warn');
      return;
    }

    const fobsPendentes = await checkFobPendenciasBloqueantes(state.dataReferencia, state.programacaoIdMap.size ? state.supervisoesResolvidas : state.supervisao);
    if (fobsPendentes.length) {
      showFobBlockedMessage(fobsPendentes);
      return;
    }

    const problemas = validarProgramacaoAntesSalvar();
    if (problemas.length) {
      setFeedback(problemas.slice(0, 3).join(' | ') + (problemas.length > 3 ? ` +${problemas.length - 3} pendência(s)` : ''), 'error');
      return;
    }

    try {
      el.saveBtn.disabled = true;
      el.saveBtn.textContent = 'Salvando...';
      setFeedback('Salvando programação...', 'warn');

      for (const timer of state.timers.values()) clearTimeout(timer);
      state.timers.clear();

      const rows = [...el.list.querySelectorAll('tr[data-table]:not([data-table="programacao_extras"])')];
      for (const tr of rows) await saveRow(tr);

      const extraCards = [...el.list.querySelectorAll('.prog-extra-card[data-extra-id]')];
      for (const card of extraCards) await saveExtra(card, { silent: true });

      // Sob "Todas" existe 1 programacao_dia por supervisão resolvida — cada
      // uma é finalizada e notificada separadamente.
      const idsPorSupervisao = state.programacaoIdMap.size
        ? [...state.programacaoIdMap.entries()]
        : [[state.supervisao, state.programacaoId]];

      for (const [, pid] of idsPorSupervisao) {
        const { error } = await supabase
          .from('programacao_dia')
          .update({ status: 'salvo', updated_at: new Date().toISOString() })
          .eq('id', pid);
        if (error) throw error;
      }

      setFeedback(`Programação salva com sucesso em ${new Date().toLocaleTimeString('pt-BR')}.`, 'ok');

      // Notifica o setor de Conferência (uma notificação por supervisão)
      try {
        const engine = window.__painelNotifEngine;
        const ctx = state.userContext || {};
        const criador = firstFilled(ctx?.user?.name, ctx?.user?.email, 'Gestor');
        const hoje = todayIso();
        if (engine) {
          await Promise.all(idsPorSupervisao.map(([sup, pid]) => {
            const supervisaoLabel = sup && sup !== TODAS_SUPERVISOES ? sup : firstFilled(ctx?.supervisao, ctx?.user?.supervisao, '');
            return engine.criarNotificacao({
              tipo: 'programacao_salva',
              titulo: `Programação realizada — ${criador}`,
              descricao: `Gestor ${criador} salvou a programação de despesas${supervisaoLabel ? ` (${supervisaoLabel})` : ''}.`,
              destinatario_modulo: 'conferencia',
              supervisao: supervisaoLabel || null,
              referencia_tabela: 'programacao_dia',
              referencia_id: pid,
              chave_dedup: `programacao_salva:${pid}:${hoje}`,
            });
          }));
        }
      } catch (_) {}

      // Dispara o cálculo das rotas do Mapa Operacional (Operacional > Mapa)
      // pra cada supervisão salva — não bloqueia o feedback de sucesso acima
      // nem impede o gestor de continuar editando se a chamada falhar (fica
      // pra próxima vez que ele salvar). Ver operacional-mapa-rotas/index.ts.
      // Falha aqui era só um console.warn silencioso — o gestor via "salvo
      // com sucesso" e o Mapa Operacional ficava sem a rota/O.S. sem nenhum
      // aviso. Agora contamos falhas e avisamos por cima do feedback de ok.
      try {
        const ctx = state.userContext || {};
        const falhasMapa = [];
        await Promise.all(idsPorSupervisao.map(([sup, pid]) => {
          const supervisaoReal = sup && sup !== TODAS_SUPERVISOES ? sup : firstFilled(ctx?.supervisao, ctx?.user?.supervisao, '');
          if (!supervisaoReal) return null;
          return supabase.functions.invoke('operacional-mapa-rotas', {
            body: { programacaoId: pid, supervisao: supervisaoReal, dataReferencia: state.dataReferencia },
          }).catch((err) => {
            console.warn('[programacao] operacional-mapa-rotas:', err);
            falhasMapa.push(supervisaoReal);
          });
        }));
        if (falhasMapa.length) {
          setFeedback(`Programação salva, mas o Mapa Operacional não pôde ser atualizado agora para: ${falhasMapa.join(', ')}. Tente salvar novamente em instantes.`, 'warn');
        }
      } catch (_) {}

    } catch (error) {
      console.error(error);
      setFeedback(error.message || 'Falha ao salvar programação.', 'error');
    } finally {
      el.saveBtn.disabled = false;
      el.saveBtn.textContent = 'Salvar programação';
    }
  }

  function setFeedback(message, type = '') {
    el.feedback.className = `feedback mt-16 ${type ? `prog-feedback-${type}` : ''}`;
    el.feedback.textContent = message;
  }

  // --- PDF pós-conclusão (pedido do usuário, 2026-07-16): resumo por
  // colaborador — OS | Colaborador | Deslocamento | Estadia | Café | Almoço |
  // Janta | Extras. Reusa os mesmos loaders da Etapa 3/Despesas em vez de
  // duplicar query (loadRosterDoDia/loadOsResumo/loadExtras de
  // programacao-despesas.js, loadCustos de programacao-equipe.js). Botão
  // manual — não roda sozinho ao salvar.
  async function gerarPdfProgramacao() {
    if (!state.programacaoId && !state.programacaoIdMap.size) {
      setFeedback('Carregue um contexto antes de gerar o PDF.', 'warn');
      return;
    }
    const textoOriginal = el.pdfBtn.textContent;
    el.pdfBtn.disabled = true;
    el.pdfBtn.textContent = 'Gerando...';
    try {
      const programacaoIdQuery = state.programacaoIdMap.size ? [...state.programacaoIdMap.values()] : state.programacaoId;
      const supervisaoQuery = state.programacaoIdMap.size ? [...state.programacaoIdMap.keys()] : state.supervisao;
      const roster = await loadRosterDoDia(programacaoIdQuery);
      if (!roster.length) {
        setFeedback('Nenhum colaborador confirmado nesta programação ainda.', 'warn');
        return;
      }
      const osIds = [...new Set(roster.flatMap((r) => [...r.osIds]))];
      const colaboradorIds = roster.map((r) => r.colaboradorId);
      const [custos, osResumoPorId, extrasPorColab] = await Promise.all([
        loadCustos(programacaoIdQuery),
        loadOsResumo(osIds),
        loadExtras(programacaoIdQuery, colaboradorIds),
      ]);

      const DESLOC_LABEL = { 'NAO PRECISA': 'Não precisa', 'MOTORISTA FROTA': 'Frota - Motorista', 'CARONA FROTA': 'Frota - Carona', 'UBER TAXI': 'Uber/Táxi', 'REEMBOLSO KM': 'Reemb. km', ONIBUS: 'Ônibus', OUTRO: 'Outro' };

      const linhas = roster.map((row) => {
        const est = custos.est.get(row.colaboradorId) || {};
        const ali = custos.ali.get(row.colaboradorId) || { almoco: true };
        const des = custos.des.get(row.colaboradorId) || {};
        const extras = extrasPorColab.get(row.colaboradorId) || [];
        const osList = [...row.osIds].map((id) => osResumoPorId.get(String(id))).filter(Boolean);
        const osLabel = osList.length ? osList.map((o) => o.numero_os || '-').join(', ') : '-';
        const clienteLabel = osList.length ? [...new Set(osList.map((o) => o.cliente || '-'))].join('; ') : '-';
        const embarqueDetalhes = osList.map((o) => parseEmbarqueDetalhes(o.embarque));
        const localLabel = embarqueDetalhes.length ? [...new Set(embarqueDetalhes.map((d) => d.local || '-'))].join('; ') : '-';
        const cidadeLabel = embarqueDetalhes.length ? [...new Set(embarqueDetalhes.map((d) => d.cidade || '-'))].join('; ') : '-';
        const deslocLabel = DESLOC_LABEL[normalizeText(des.tipo_deslocamento || 'NÃO PRECISA')] || (des.tipo_deslocamento || 'Não precisa');
        const deslocTexto = des.placa_veiculo ? `${deslocLabel} · ${des.placa_veiculo}` : deslocLabel;
        // est.tem_estadia é o booleano gravado no save (mais confiável que
        // re-derivar de tipo_estadia !== 'CASA' — mesma fonte usada pelo card
        // on-screen da Etapa 3, que já mostra certo).
        const temEstadia = est.tem_estadia === true || (!!est.tipo_estadia && normalizeText(est.tipo_estadia) !== 'CASA');
        const dias = est?.checkin && est?.checkout
          ? Math.max(1, Math.round((new Date(`${est.checkout}T00:00:00`) - new Date(`${est.checkin}T00:00:00`)) / 86400000))
          : 1;
        const estadiaTexto = temEstadia ? `${estadiaLabel(est.tipo_estadia) || 'Hospedagem'} · ${dias}d` : 'Casa';
        const extrasTexto = extras.length ? extras.map((x) => `${x.tipo_despesa || 'Outro'} R$${(Number(x.valor) || 0).toFixed(2)}`).join('; ') : '-';
        return {
          os: osLabel,
          colaborador: row.nome,
          cliente: clienteLabel,
          local: localLabel,
          cidade: cidadeLabel,
          deslocamento: deslocTexto,
          estadia: estadiaTexto,
          cafe: ali.cafe ? 'Sim' : 'Não',
          almoco: ali.almoco !== false ? 'Sim' : 'Não',
          janta: ali.janta ? 'Sim' : 'Não',
          extras: extrasTexto,
        };
      });

      // Sem O.S. — mesma regra da Etapa 4 (programacao-sem-os.js): regional
      // menos quem já está confirmado hoje, com match EXATO de supervisão
      // (loadColaboradoresRegional aceita match parecido por token, bom pra
      // sugestão de candidato mas errado aqui — ver commit da Etapa 4).
      const SITUACAO_LABEL = { ATESTADO: 'Atestado', FALTA: 'Falta', FERIAS: 'Férias', FOLGA: 'Folga' };
      const confirmadosIds = new Set(roster.map((r) => r.colaboradorId));
      const supervisoesAlvo = new Set((Array.isArray(supervisaoQuery) ? supervisaoQuery : [supervisaoQuery]).map((s) => normalizeText(s)).filter(Boolean));
      const regionalBruto = await loadColaboradoresRegional(supervisaoQuery);
      const semOsColabs = regionalBruto
        .filter((c) => supervisoesAlvo.has(normalizeText(c.supervisao)))
        .filter((c) => !confirmadosIds.has(c.colaboradorId));

      let situacoesPorColab = new Map();
      if (semOsColabs.length) {
        const idsProgramacao = Array.isArray(programacaoIdQuery) ? programacaoIdQuery : [programacaoIdQuery];
        const { data, error } = await supabase
          .from('programacao_colaboradores')
          .select('colaborador_id,disponibilidade,observacao')
          .in('programacao_id', idsProgramacao)
          .in('colaborador_id', semOsColabs.map((c) => c.colaboradorId));
        if (error) console.warn('[pdf] situações sem O.S.', error);
        situacoesPorColab = new Map((data || []).map((r) => [String(r.colaborador_id), r]));
      }
      const semOsLinhas = semOsColabs.map((c) => {
        const row = situacoesPorColab.get(c.colaboradorId);
        return {
          colaborador: c.nome,
          situacao: SITUACAO_LABEL[normalizeText(row?.disponibilidade || '')] || '-',
          observacao: row?.observacao || '-',
        };
      });

      await desenharPdfProgramacao(linhas, semOsLinhas, {
        supervisaoLabel: state.programacaoIdMap.size ? 'Todas' : (state.supervisao || '-'),
        dataReferencia: state.dataReferencia,
      });
    } catch (error) {
      console.error(error);
      setFeedback(error.message || 'Falha ao gerar o PDF.', 'error');
    } finally {
      el.pdfBtn.disabled = false;
      el.pdfBtn.textContent = textoOriginal;
    }
  }

  init();
}

// jsPDF via CDN sob demanda (mesmo padrão de assets/js/contato-cliente.js) —
// sem lib vendorizada localmente, projeto não tem build step.
async function loadJsPdfProgramacao() {
  if (window.jspdf?.jsPDF) return window.jspdf.jsPDF;
  await new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js';
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
  return window.jspdf.jsPDF;
}

// Mesma leitura de "UF – CIDADE (LOCAL)" já usada na Etapa 2 (embarqueHtml,
// programacao-equipe.js) — reimplementada aqui só pra cidade/local (sem UF)
// porque o PDF já tem colunas próprias pra Cliente/Local/Cidade.
function parseEmbarqueDetalhes(embarque) {
  const s = String(embarque || '').trim();
  if (!s) return { cidade: '', local: '' };
  const m = s.match(/^([A-Za-z]{2})\s*[–-]\s*(.+)$/);
  const resto = m ? m[2].trim() : s;
  const p = resto.match(/^([^(]+?)\s*\(([^)]*)\)\s*$/);
  const cidade = (p ? p[1] : resto).trim();
  const local = p ? p[2].trim() : '';
  return { cidade, local };
}

function brDateProgramacaoPdf(iso) {
  if (!iso) return '-';
  const [ano, mes, dia] = String(iso).split('-');
  return `${dia}/${mes}/${ano}`;
}

async function desenharPdfProgramacao(linhas, semOsLinhas, meta = {}) {
  const JsPDF = await loadJsPdfProgramacao();
  const doc = new JsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const PW = 297, PH = 210, M = 10;
  const LH = 4.2;
  let y = M;

  // Desenha uma tabela genérica (cabeçalho + linhas com paginação) a partir
  // da posição Y atual — usada tanto pra tabela principal (alocados numa
  // O.S.) quanto pra "Sem O.S." logo abaixo dela.
  function desenharTabela(cols, dados) {
    function desenharCabecalho() {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      let x = M;
      cols.forEach((col) => {
        doc.text(col.label, x + 1, y + 4);
        x += col.width;
      });
      doc.setDrawColor(180);
      doc.line(M, y + 6, PW - M, y + 6);
      y += 8;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
    }

    desenharCabecalho();
    dados.forEach((linha) => {
      const linhasPorCol = cols.map((col) => doc.splitTextToSize(String(linha[col.key] ?? ''), col.width - 2));
      const nLinhas = Math.max(...linhasPorCol.map((l) => l.length), 1);
      const alturaLinha = nLinhas * LH + 2;

      if (y + alturaLinha > PH - M) {
        doc.addPage();
        y = M;
        desenharCabecalho();
      }

      let x = M;
      cols.forEach((col, index) => {
        doc.text(linhasPorCol[index], x + 1, y + LH);
        x += col.width;
      });
      doc.setDrawColor(230);
      doc.line(M, y + alturaLinha - 1, PW - M, y + alturaLinha - 1);
      y += alturaLinha;
    });
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('Programação — resumo por colaborador', M, y + 4);
  y += 8;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.text(`Supervisão: ${meta.supervisaoLabel || '-'}   ·   Data: ${brDateProgramacaoPdf(meta.dataReferencia)}`, M, y);
  y += 6;

  desenharTabela([
    { key: 'os', label: 'O.S.', width: 16 },
    { key: 'colaborador', label: 'Colaborador', width: 34 },
    { key: 'cliente', label: 'Cliente', width: 34 },
    { key: 'local', label: 'Local', width: 28 },
    { key: 'cidade', label: 'Cidade', width: 20 },
    { key: 'deslocamento', label: 'Deslocamento', width: 24 },
    { key: 'estadia', label: 'Estadia', width: 20 },
    { key: 'cafe', label: 'Café', width: 11 },
    { key: 'almoco', label: 'Almoço', width: 11 },
    { key: 'janta', label: 'Janta', width: 11 },
    { key: 'extras', label: 'Extras', width: PW - 2 * M - (16 + 34 + 34 + 28 + 20 + 24 + 20 + 11 + 11 + 11) },
  ], linhas);

  if (semOsLinhas?.length) {
    y += 8;
    if (y + 16 > PH - M) { doc.addPage(); y = M; }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text('Sem O.S. — colaboradores da regional sem atendimento hoje', M, y + 4);
    y += 8;
    desenharTabela([
      { key: 'colaborador', label: 'Colaborador', width: 80 },
      { key: 'situacao', label: 'Situação', width: 40 },
      { key: 'observacao', label: 'Observação', width: PW - 2 * M - (80 + 40) },
    ], semOsLinhas);
  }

  const supervisaoArquivo = meta.supervisaoLabel || 'programacao';
  const dataArquivo = meta.dataReferencia || todayIso();
  const nomeArquivo = `programacao_${supervisaoArquivo.toLowerCase().replace(/[^a-z0-9]+/g, '_')}_${dataArquivo}.pdf`;
  doc.save(nomeArquivo);
}

initProtectedPage('Programação', renderContent);
