import { initProtectedPage } from './pageInit.js';
import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from './supabaseClient.js';
import { getCurrentUser, getUserContext } from './auth.js';
import { logActivity } from './activityLogger.js';
import { loadCustos, loadColaboradoresRegional, loadCruzamentoTipoContrato, tipoContratoLetra } from './programacao-equipe.js?v=20260828-desligamento-readmitido1';
import { loadRosterDoDia, loadOsResumo, loadExtras } from './programacao-despesas.js?v=20260917-deslocamento-persistido1';
import { renderProgramacaoListaDrawer } from './programacao-lista-drawer.js?v=20260918-os-reaproveitada-contexto1';
import { renderProgramacaoSemOs } from './programacao-sem-os.js?v=20260911-finaliza-libera-semos1';
import './programacao-persistencia-contexto.js?v=20260920-integrado1';
import './programacao-duplicacao-calendario.js?v=20260920-integrado1';
import './programacao-despesas-os-visual.js?v=20260920-integrado1';
import './programacao-compartilhar-os.js?v=20260920-integrado1';
import './programacao-carona-motorista.js?v=20260917-v6-carona-por-placa';
import './programacao-lista-prioridade-nao-atender.js?v=20260907-null-primeiro2';
import './gestor-mobile-modules-v2.js?v=20260813-modelos-v3';

// Constante usada pra representar "todas as supervisões" no combo de filtro
// (antes vivia em programacao-gestor-filtro-fix.js, incorporado nesta consolidação).
const TODAS_SUPERVISOES = '__TODAS__';

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
  // Colaborador readmitido mantém a data do desligamento ANTERIOR no GRM (só
  // `situacao` é atualizada pra "Ativo" na readmissão) — sem o "&& situacao
  // !== 'ATIVO'", ele ficava bloqueado pra sempre mesmo já reativado.
  if (desligamento && situacao !== 'ATIVO') return false;

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
        <button class="prog-save-main" type="button" id="progSaveProgramacao" disabled title="As alterações já são salvas automaticamente — este botão confirma e finaliza a programação. Para a O.S. aparecer no Mapa Operacional, marque-a como &quot;Atender&quot; na etapa de equipe e programe para a data de hoje.">Salvar</button>
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
      if (copiadas.length) {
        logActivity('action', 'programacao_duplicada', 'programacao', {
          programacao_origem_id: state.programacaoId,
          data_origem: state.dataReferencia,
          datas_copiadas: copiadas,
          datas_preservadas: ignoradas,
          supervisao: state.supervisao,
          copiar_estadias: el.duplicateCopyStays.checked,
        });
      }
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

    const programacaoIds = state.programacaoIdMap.size
      ? [...state.programacaoIdMap.values()]
      : [state.programacaoId];

    // Antes de upsertar, guarda quem já tinha linha nesta programação. A
    // promoção SEM EMBARQUE -> OK abaixo só pode valer pra quem NÃO existia
    // ainda (default de criação) — senão ela reclassifica, a cada "Carregar",
    // uma decisão manual que o gestor já tinha salvo (ex.: programação feita
    // um dia adiantada), fazendo a escolha "sumir" no carregamento seguinte.
    const { data: existentes, error: existentesError } = await supabase
      .from('programacao_colaboradores')
      .select('programacao_id,colaborador_id')
      .in('programacao_id', programacaoIds);
    if (existentesError) throw existentesError;
    const jaExistiam = new Set((existentes || []).map((r) => `${r.programacao_id}:${r.colaborador_id}`));

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

    // Promove SEM EMBARQUE → OK só para quem acabou de ser criado agora
    // (agrupado por programacao_id, pois sob "Todas" cada supervisão tem o seu)
    const porProgramacaoId = new Map();
    payload
      .filter((p) => p.disponibilidade === 'OK' && !jaExistiam.has(`${p.programacao_id}:${p.colaborador_id}`))
      .forEach((p) => {
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
      if (TIPOS_ESTADIA_BOTOES.includes(tipo) && cidadeEl && !cidadeEl.value && preencherCidadeDaOs(tr)) {
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
      if (TIPOS_ESTADIA_BOTOES.includes(tipo)) preencherCidadeDaOs(tr);
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
      el.saveBtn.textContent = 'Salvar';
    }
  }

  function setFeedback(message, type = '') {
    el.feedback.className = `feedback mt-16 ${type ? `prog-feedback-${type}` : ''}`;
    el.feedback.textContent = message;
  }

  init();
}

// --- Incorporado de programacao-supervisoes-cache.js — Cache de supervisões (TTL 5min) ---
{
// Programação: usa a relação programacao_usuario_supervisoes/RPC para não buscar todas as supervisões a cada carregamento.

// v5 invalida o cache amplo criado quando coordenação ainda expandia acesso.
// Regra de segurança: resposta vazia do RPC significa ZERO supervisões
// liberadas. Nunca deve cair para uma consulta irrestrita de supervisoes.
// v6: TTL caiu de 12h para 5min (mesmo padrão do grao1000:user-ctx:v1) —
// 12h deixava usuário vendo lista de supervisão desatualizada por até 12h
// depois de o cadastro (app_usuarios.supervisao / programacao_usuario_supervisoes)
// ser alterado por um admin, já que a chave só expira por tempo, não por mudança
// de dado (caso real: SARA KELCI RIBAS, 01/09/2026).
const CACHE_KEY_PREFIX = 'programacao_supervisoes_v6';
const CACHE_TTL_MS = 1000 * 60 * 5;
try {
  Object.keys(localStorage)
    .filter((key) => /^programacao_supervisoes_v[1-5](?::|$)/.test(key))
    .forEach((key) => localStorage.removeItem(key));
} catch (_) {}

const originalFrom = supabase.from.bind(supabase);
const originalRpc = supabase.rpc.bind(supabase);
let pending = null;
let lastResult = null;

// A chave PRECISA ser por usuário para não compartilhar permissões entre
// contas que usam o mesmo navegador/dispositivo.
async function cacheKey() {
  try {
    const { data } = await supabase.auth.getUser();
    return `${CACHE_KEY_PREFIX}:${data?.user?.id || 'anon'}`;
  } catch (_) {
    return `${CACHE_KEY_PREFIX}:anon`;
  }
}

async function readCache() {
  try {
    const raw = localStorage.getItem(await cacheKey());
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.rows)) return null;
    if (Date.now() - Number(parsed.ts || 0) > CACHE_TTL_MS) return null;
    return parsed.rows;
  } catch (_) {
    return null;
  }
}

async function writeCache(rows) {
  try {
    localStorage.setItem(await cacheKey(), JSON.stringify({ ts: Date.now(), rows: Array.isArray(rows) ? rows : [] }));
  } catch (_) {}
}

function normalizeRows(rows) {
  const map = new Map();
  (rows || []).forEach((row) => {
    const nome = String(row?.nome || row?.supervisao || '').trim();
    const key = nome.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
    if (nome && key && !map.has(key)) map.set(key, { nome });
  });
  return [...map.values()].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

async function fetchSupervisoes() {
  const cached = await readCache();
  // Array vazio é resultado válido: significa que o usuário não tem nenhuma
  // supervisão liberada. Não confundir com ausência de cache.
  if (Array.isArray(cached)) {
    lastResult = { data: cached, error: null };
    return { ...lastResult, fromCache: true };
  }

  if (pending) return pending;
  pending = (async () => {
    try {
      const { data, error } = await originalRpc('programacao_listar_supervisoes');
      if (error) throw error;

      const rows = normalizeRows(data);
      await writeCache(rows);
      lastResult = { data: rows, error: null };
      return lastResult;
    } catch (error) {
      // FAIL CLOSED: se a fonte de autorização falhar, não consulta a tabela
      // supervisoes sem escopo. Isso impediria um erro de rede/RPC de liberar
      // todas as regionais para um usuário restrito.
      console.error('[programacao-supervisoes-cache] falha ao resolver supervisões autorizadas.', error);
      lastResult = { data: [], error };
      return lastResult;
    }
  })().finally(() => { pending = null; });

  return pending;
}

function makeCachedSupervisoesBuilder() {
  const builder = {};
  ['select', 'eq', 'neq', 'order', 'limit', 'range'].forEach((method) => {
    builder[method] = () => builder;
  });
  builder.then = (resolve, reject) => fetchSupervisoes().then(resolve, reject);
  builder.catch = (reject) => fetchSupervisoes().catch(reject);
  builder.finally = (cb) => fetchSupervisoes().finally(cb);
  return builder;
}

supabase.from = function patchedFrom(table) {
  if (String(table) === 'supervisoes') return makeCachedSupervisoesBuilder();
  return originalFrom(table);
};

window.programacaoSupervisoesCache = {
  async clear() {
    try { localStorage.removeItem(await cacheKey()); } catch (_) {}
    lastResult = null;
  },
  getLast() { return lastResult; },
};
}

// --- Incorporado de programacao-ultima-programacao-fix.js — Atalho para reabrir a última programação ---
{
// Programação: força a reutilização da programação mais recente do dia/supervisão
// e evita que trocas de equipe deixem linhas antigas duplicando despesas.

const PATCH_KEY = '__progUltimaProgramacaoFixApplied';

if (!supabase[PATCH_KEY] && typeof supabase.from === 'function') {
  const originalFrom = supabase.from.bind(supabase);

  function patchProgramacaoDiaBuilder(builder) {
    if (!builder || typeof builder !== 'object' || builder.__progUltimaPatched) return builder;

    Object.defineProperty(builder, '__progUltimaPatched', { value: true });

    [
      'select', 'eq', 'neq', 'is', 'in', 'or', 'match', 'filter',
      'limit', 'range', 'order', 'not', 'contains', 'containedBy',
    ].forEach((method) => {
      const original = builder[method];
      if (typeof original !== 'function') return;
      builder[method] = function patchedMethod(...args) {
        return patchProgramacaoDiaBuilder(original.apply(this, args));
      };
    });

    if (typeof builder.maybeSingle === 'function') {
      const originalMaybeSingle = builder.maybeSingle.bind(builder);
      Object.defineProperty(builder, '__progOriginalMaybeSingle', { value: originalMaybeSingle });

      builder.maybeSingle = function patchedMaybeSingle(...args) {
        let target = builder;

        // O núcleo faz: programacao_dia -> data + supervisão -> limit(1) -> maybeSingle().
        // Sem ORDER BY o Supabase pode devolver uma programação antiga do mesmo dia.
        if (!target.__progUltimaOrdenada && typeof target.order === 'function') {
          try {
            target = target.order('updated_at', { ascending: false });
            target = target.order('created_at', { ascending: false });
            Object.defineProperty(target, '__progUltimaOrdenada', { value: true });
          } catch (error) {
            console.warn('[programacao] não foi possível ordenar última programação', error);
          }
        }

        const maybeSingle = target.__progOriginalMaybeSingle || originalMaybeSingle;
        return maybeSingle.apply(target, args);
      };
    }

    return builder;
  }

  async function limparEquipeAntiga(payload) {
    const rows = (Array.isArray(payload) ? payload : [payload])
      .filter((row) => row?.programacao_id && row?.os_id && row?.colaborador_id && row.confirmado === true);

    if (!rows.length) return;

    const grupos = new Map();
    rows.forEach((row) => {
      const key = `${row.programacao_id}::${row.os_id}`;
      if (!grupos.has(key)) {
        grupos.set(key, {
          programacaoId: row.programacao_id,
          osId: row.os_id,
          manter: new Set(),
        });
      }
      grupos.get(key).manter.add(String(row.colaborador_id));
    });

    for (const grupo of grupos.values()) {
      const { data, error } = await originalFrom('programacao_equipe')
        .select('id,colaborador_id')
        .eq('programacao_id', grupo.programacaoId)
        .eq('os_id', grupo.osId)
        .eq('confirmado', true);

      if (error) throw error;

      const idsParaExcluir = (data || [])
        .filter((row) => !grupo.manter.has(String(row.colaborador_id)))
        .map((row) => row.id)
        .filter(Boolean);

      if (idsParaExcluir.length) {
        const { error: delError } = await originalFrom('programacao_equipe')
          .delete()
          .in('id', idsParaExcluir);
        if (delError) throw delError;
      }
    }
  }

  function patchEquipeUpsertResult(builder, payload, meta = { skipCleanup: false, cleaned: false }) {
    if (!builder || typeof builder !== 'object' || builder.__progEquipeUpsertPatched) return builder;
    Object.defineProperty(builder, '__progEquipeUpsertPatched', { value: true });

    ['select', 'single', 'maybeSingle', 'limit', 'order'].forEach((method) => {
      const original = builder[method];
      if (typeof original !== 'function') return;
      builder[method] = function patchedEquipeMethod(...args) {
        if (method === 'select') meta.skipCleanup = true;
        return patchEquipeUpsertResult(original.apply(this, args), payload, meta);
      };
    });

    if (typeof builder.then === 'function') {
      const originalThen = builder.then.bind(builder);
      builder.then = async function patchedEquipeThen(onFulfilled, onRejected) {
        try {
          if (!meta.skipCleanup && !meta.cleaned) {
            meta.cleaned = true;
            await limparEquipeAntiga(payload);
          }
          return originalThen(onFulfilled, onRejected);
        } catch (error) {
          console.warn('[programacao] não foi possível limpar equipe antiga', error);
          if (typeof onRejected === 'function') return onRejected(error);
          throw error;
        }
      };
    }

    return builder;
  }

  function patchProgramacaoEquipeBuilder(builder) {
    if (!builder || typeof builder !== 'object' || builder.__progEquipePatched) return builder;
    Object.defineProperty(builder, '__progEquipePatched', { value: true });

    const originalUpsert = builder.upsert;
    if (typeof originalUpsert === 'function') {
      builder.upsert = function patchedEquipeUpsert(payload, ...args) {
        return patchEquipeUpsertResult(originalUpsert.apply(this, [payload, ...args]), payload);
      };
    }

    return builder;
  }

  supabase.from = function patchedFrom(table, ...args) {
    const builder = originalFrom(table, ...args);
    const tableName = String(table);
    if (tableName === 'programacao_dia') return patchProgramacaoDiaBuilder(builder);
    if (tableName === 'programacao_equipe') return patchProgramacaoEquipeBuilder(builder);
    return builder;
  };

  Object.defineProperty(supabase, PATCH_KEY, { value: true });
}
}

// --- Incorporado de programacao-kpi-inline-patch.js — KPIs inline no cabeçalho ---
{
// Programação: ajuste leve de fonte para manter cliente/local em linha única, sem reticências.
(function () {
  const MIN_FONT = 8.2;
  let scheduled = false;
  let observerReady = false;

  function fitText(el, maxFont) {
    if (!el) return;
    el.style.fontSize = `${maxFont}px`;
    el.style.transform = '';
    el.style.display = 'block';
    el.style.whiteSpace = 'nowrap';
    el.style.overflow = 'visible';
    el.style.textOverflow = 'clip';
    el.style.transformOrigin = 'left center';

    const width = el.clientWidth;
    if (!width || width < 40) return;

    let size = maxFont;
    while (el.scrollWidth > width && size > MIN_FONT) {
      size -= 0.35;
      el.style.fontSize = `${size.toFixed(2)}px`;
    }

    if (el.scrollWidth > width) {
      const scale = Math.max(0.72, width / el.scrollWidth);
      el.style.transform = `scaleX(${scale.toFixed(3)})`;
    }
  }

  function applyFit() {
    document.querySelectorAll('.peqb-os2-cliente').forEach((el) => fitText(el, window.innerWidth <= 1380 ? 11.2 : 12.4));
    document.querySelectorAll('.peqb-os2-emb').forEach((el) => fitText(el, window.innerWidth <= 1380 ? 9.7 : 10.2));
  }

  function scheduleFit() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      applyFit();
    });
  }

  function bindObserver() {
    if (observerReady) return;
    const list = document.getElementById('progList');
    if (!list) return;
    observerReady = true;
    new MutationObserver(scheduleFit).observe(list, { childList: true, subtree: true });
  }

  function boot() {
    bindObserver();
    scheduleFit();
    setTimeout(scheduleFit, 120);
    setTimeout(scheduleFit, 450);
    window.addEventListener('resize', scheduleFit);
    const rootObserver = new MutationObserver(() => {
      bindObserver();
      scheduleFit();
    });
    rootObserver.observe(document.body || document.documentElement, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
}());
}

// --- Incorporado de programacao-mobile-ui-fix.js — Ajustes de UI mobile ---
{
const STYLE_ID = 'programacaoMobileUiFixStyles';

function injectMobileStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    @media (max-width: 900px) {
      /* O redesign usa zoom:1.15 no desktop. Em celulares isso aumenta a
         largura calculada de toda a aplicação e fazia a lista/nav parecerem
         cortadas. O tamanho mobile já é definido abaixo, sem zoom global. */
      .app-shell {
        zoom: 1 !important;
      }

      html, body {
        width: 100%;
        max-width: 100%;
        overflow-x: hidden !important;
      }

      body {
        background: #090914;
      }

      .app-shell {
        display: block !important;
        width: 100% !important;
        min-width: 0 !important;
      }

      .sidebar {
        display: none !important;
      }

      .content-wrap {
        width: 100% !important;
        max-width: 100% !important;
        min-width: 0 !important;
        margin: 0 !important;
      }

      .topbar {
        position: sticky !important;
        top: 0 !important;
        z-index: 60 !important;
        padding: 12px max(12px, env(safe-area-inset-left)) !important;
        gap: 10px !important;
        align-items: center !important;
        background: rgba(9, 9, 20, .96) !important;
        backdrop-filter: blur(16px) !important;
        border-bottom: 1px solid rgba(255,255,255,.06) !important;
      }

      .topbar h1,
      #pageTitle {
        font-size: 20px !important;
        line-height: 1.05 !important;
        margin: 0 !important;
      }

      #welcomeUser,
      .topbar .meta {
        max-width: 54vw !important;
        white-space: nowrap !important;
        overflow: hidden !important;
        text-overflow: ellipsis !important;
        font-size: 12px !important;
      }

      .topbar-actions {
        display: flex !important;
        align-items: center !important;
        gap: 6px !important;
        flex-shrink: 0 !important;
      }

      #roleBadge {
        display: none !important;
      }

      #signOutBtn {
        min-height: 38px !important;
        padding: 0 12px !important;
        border-radius: 12px !important;
        font-size: 12px !important;
      }

      .page-main {
        width: 100% !important;
        max-width: 100% !important;
        min-width: 0 !important;
        padding: 12px max(10px, env(safe-area-inset-left)) calc(24px + env(safe-area-inset-bottom)) !important;
        overflow-x: hidden !important;
      }

      .card,
      .prog-toolbar,
      .prog-list-card {
        width: 100% !important;
        max-width: 100% !important;
        min-width: 0 !important;
        border-radius: 20px !important;
        padding: 12px !important;
        overflow: visible !important;
      }

      .prog-toolbar {
        position: sticky !important;
        top: 64px !important;
        z-index: 45 !important;
        background: rgba(13, 13, 24, .98) !important;
        backdrop-filter: blur(14px) !important;
        display: block !important;
      }

      body.mobile-gestor-mode .prog-toolbar {
        position: relative !important;
        top: 0 !important;
      }

      .prog-toolbar .prog-toolbar-row {
        display: grid !important;
        grid-template-columns: 1fr 1fr !important;
        gap: 10px !important;
        align-items: stretch !important;
      }

      .prog-toolbar .prog-toolbar-row + .prog-toolbar-row {
        margin-top: 10px !important;
        padding-top: 10px !important;
      }

      .prog-tfield-sup,
      .prog-tfield-search,
      .prog-save-main {
        grid-column: 1 / -1 !important;
        width: 100% !important;
        max-width: none !important;
        flex: none !important;
      }

      .prog-toolbar #progLoadContext,
      .prog-toolbar #progGerarPdf,
      .prog-toolbar #progCompartilhar {
        width: 100% !important;
        min-width: 0 !important;
        min-height: 44px !important;
        margin: 0 !important;
        padding: 0 10px !important;
        font-size: 13px !important;
        white-space: nowrap !important;
      }

      .prog-toolbar #progLoadContext { grid-column: 1 !important; }
      .prog-toolbar #progCompartilhar { grid-column: 2 !important; }
      .prog-toolbar #progGerarPdf {
        grid-column: 1 / -1 !important;
        order: initial !important;
      }

      .prog-tfield-date,
      .prog-tfield-os-status {
        width: 100% !important;
        max-width: none !important;
        flex: none !important;
      }

      .prog-tfield label {
        font-size: 10px !important;
      }

      .prog-tfield select,
      .prog-tfield input,
      #progLoadContext,
      .prog-save-main {
        min-height: 46px !important;
        font-size: 14px !important;
        border-radius: 14px !important;
      }

      .prog-toolbar-spacer {
        display: none !important;
      }

      .prog-toolbar-row-steps {
        grid-template-columns: 1fr !important;
        gap: 10px !important;
      }

      .prog-steps-compact,
      .steps-wrap {
        display: flex !important;
        flex-wrap: nowrap !important;
        width: 100% !important;
        gap: 5px !important;
        overflow: visible !important;
      }

      .prog-steps-compact .stepbtn,
      .stepbtn {
        flex: 1 1 0 !important;
        width: auto !important;
        min-width: 0 !important;
        min-height: 38px !important;
        white-space: normal !important;
        line-height: 1.1 !important;
        padding: 8px 2px !important;
        border-radius: 12px !important;
        text-align: center !important;
        font-size: 12px !important;
      }

      #progCtxFeedback,
      .prog-toolbar .feedback {
        width: 100% !important;
        max-width: none !important;
        white-space: normal !important;
        font-size: 12px !important;
        line-height: 1.35 !important;
        padding: 2px 1px !important;
      }

      .prog-list-card {
        margin-top: 10px !important;
      }

      /* Lista de O.S. do fluxo atual (lista + drawer). A implementação
         desktop é uma tabela larga; no celular cada linha vira um cartão
         sem alterar o DOM nem os listeners de clique. */
      #pldShell,
      #pldShell .pld-list-col,
      #pldListaBody,
      #pldShell .pld-table-wrap {
        width: 100% !important;
        max-width: 100% !important;
        min-width: 0 !important;
      }

      #pldShell .pld-filters {
        gap: 10px !important;
      }

      #pldShell .pld-filters-row {
        display: grid !important;
        grid-template-columns: 1fr 1fr !important;
        gap: 8px !important;
        width: 100% !important;
      }

      #pldShell .pld-filters-row > * {
        width: 100% !important;
        min-width: 0 !important;
        max-width: none !important;
      }

      #pldShell .pld-filters-row > :first-child {
        grid-column: auto !important;
      }

      #pldShell .pld-toggle {
        white-space: normal !important;
        line-height: 1.35 !important;
        align-items: flex-start !important;
      }

      #pldShell .pld-table-wrap {
        max-height: none !important;
        overflow: visible !important;
        border: 0 !important;
        background: transparent !important;
      }

      #pldShell .pld-table,
      #pldShell .pld-table tbody {
        display: block !important;
        width: 100% !important;
      }

      #pldShell .pld-table thead {
        display: none !important;
      }

      #pldShell .pld-row {
        position: relative !important;
        display: grid !important;
        grid-template-columns: minmax(0, 1fr) auto !important;
        gap: 8px 12px !important;
        width: 100% !important;
        margin-bottom: 9px !important;
        padding: 13px 38px 13px 14px !important;
        border: 1px solid rgba(52,211,153,.14) !important;
        border-radius: 16px !important;
        background: rgba(2,6,23,.34) !important;
      }

      #pldShell .pld-row td {
        display: block !important;
        width: auto !important;
        min-width: 0 !important;
        padding: 0 !important;
        background: transparent !important;
        overflow-wrap: anywhere !important;
      }

      #pldShell .pld-row td:nth-child(1),
      #pldShell .pld-row td:nth-child(2),
      #pldShell .pld-row td:nth-child(3) {
        grid-column: 1 !important;
      }

      #pldShell .pld-row td:nth-child(4) {
        grid-column: 2 !important;
        grid-row: 1 / span 2 !important;
        align-self: center !important;
        text-align: right !important;
      }

      #pldShell .pld-row td:nth-child(5) {
        position: absolute !important;
        right: 13px !important;
        top: 50% !important;
        transform: translateY(-50%) !important;
      }

      #pldShell .pld-os-num { font-size: 16px !important; }
      #pldShell .pld-cliente {
        font-size: 13px !important;
        line-height: 1.3 !important;
      }
      #pldShell .pld-local-uf { font-size: 11px !important; }
      #pldShell .pld-rem {
        max-width: 110px !important;
        font-size: 12px !important;
        color: #86efac !important;
      }

      #pldOverlayRoot .pld-drawer {
        width: 100% !important;
        max-width: 100% !important;
        padding: max(16px, env(safe-area-inset-top)) 16px calc(82px + env(safe-area-inset-bottom)) !important;
      }

      /* KPIs (Total filtrado, Na tela, Para atender...) só fazem sentido no desktop */
      #osLiteStats {
        display: none !important;
      }

      .prog-list,
      #progList {
        width: 100% !important;
        max-width: 100% !important;
        overflow: visible !important;
      }

      .prog-section-title {
        margin: 12px 0 8px !important;
        align-items: center !important;
      }

      .prog-section-title h4 {
        font-size: 14px !important;
      }

      .prog-table-wrap {
        width: 100% !important;
        max-width: 100% !important;
        overflow: visible !important;
        border: 0 !important;
        background: transparent !important;
      }

      .prog-table {
        display: block !important;
        width: 100% !important;
        min-width: 0 !important;
        border-collapse: separate !important;
        border-spacing: 0 !important;
      }

      .prog-table thead {
        display: none !important;
      }

      .prog-table tbody {
        display: grid !important;
        gap: 10px !important;
        width: 100% !important;
      }

      .prog-table tr {
        display: grid !important;
        width: 100% !important;
        min-width: 0 !important;
        gap: 9px !important;
        padding: 12px !important;
        border-radius: 18px !important;
        border: 1px solid rgba(52,211,153,.14) !important;
        background: rgba(15, 23, 42, .42) !important;
        box-shadow: 0 16px 38px rgba(0,0,0,.22) !important;
      }

      .prog-table td {
        display: grid !important;
        width: 100% !important;
        min-width: 0 !important;
        padding: 0 !important;
        border: 0 !important;
        background: transparent !important;
        gap: 6px !important;
        white-space: normal !important;
      }

      .prog-table td::before {
        content: attr(data-mobile-label);
        display: block;
        color: #86efac;
        font-size: 10px;
        font-weight: 950;
        letter-spacing: .08em;
        text-transform: uppercase;
      }

      .prog-table td[data-mobile-label="Colaborador"]::before {
        display: none;
      }

      .prog-table .colab-name {
        min-width: 0 !important;
        width: 100% !important;
        font-size: 16px !important;
        overflow-wrap: anywhere !important;
      }

      .prog-table .colab-meta {
        font-size: 12px !important;
      }

      .prog-table input,
      .prog-table select,
      .prog-table textarea {
        width: 100% !important;
        max-width: 100% !important;
        min-width: 0 !important;
        min-height: 44px !important;
        border-radius: 13px !important;
        font-size: 14px !important;
      }

      .prog-tipo-selector {
        display: grid !important;
        grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
        gap: 8px !important;
        width: 100% !important;
      }

      .prog-tipo-btn {
        width: 100% !important;
        min-height: 42px !important;
        white-space: normal !important;
        line-height: 1.1 !important;
        padding: 8px 7px !important;
      }

      .prog-indisponivel-wrap,
      .prog-placa-wrap {
        width: 100% !important;
        max-width: none !important;
        display: grid !important;
        grid-template-columns: 1fr !important;
      }

      .prog-placa-wrap input {
        width: 100% !important;
      }

      .prog-estadia-selector {
        display: grid !important;
        grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
        min-width: 0 !important;
        width: 100% !important;
        gap: 8px !important;
      }

      .prog-estadia-card {
        width: 100% !important;
        min-height: 88px !important;
        padding: 10px 8px !important;
      }

      .prog-extra-card {
        display: grid !important;
        grid-template-columns: 1fr !important;
        width: 100% !important;
        gap: 8px !important;
      }

      .prog-extra-total {
        text-align: left !important;
      }

      .prog-save-actions,
      .prog-os-modal-actions,
      .kg-modal-actions {
        display: grid !important;
        grid-template-columns: 1fr !important;
      }

      .prog-os-modal-backdrop {
        align-items: flex-end !important;
        padding: 10px !important;
      }

      .prog-os-modal {
        width: 100% !important;
        max-height: 88vh !important;
        padding: 16px !important;
        border-radius: 22px 22px 12px 12px !important;
      }

      .prog-os-modal-head {
        display: grid !important;
        gap: 10px !important;
      }

      .prog-os-modal-head h3 {
        font-size: 18px !important;
      }
    }

    @media (max-width: 380px) {
      .prog-steps-compact,
      .steps-wrap,
      .prog-tipo-selector,
      .prog-estadia-selector {
        grid-template-columns: 1fr !important;
      }

      .topbar h1,
      #pageTitle {
        font-size: 18px !important;
      }
    }

    /* Camada determinística para o App Gestor. Diversos módulos desta página
       injetam CSS assíncrono; ancorar no estado do shell impede que um patch
       desktop carregado depois reconstrua o cabeçalho como display:contents. */
    body.mobile-gestor-mode {
      min-width: 0 !important;
      overflow-x: clip !important;
      background: #06130e !important;
    }

    body.mobile-gestor-mode .app-shell {
      width: 100% !important;
      min-width: 0 !important;
      zoom: 1 !important;
      background: #06130e !important;
    }

    body.mobile-gestor-mode .page-main {
      width: 100% !important;
      min-width: 0 !important;
      padding-inline: 10px !important;
      background: #06130e !important;
    }

    body.mobile-gestor-mode .prog-toolbar {
      display: block !important;
      width: 100% !important;
      min-width: 0 !important;
      margin: 0 0 10px !important;
      padding: 12px !important;
      overflow: hidden !important;
      background: #0a1a12 !important;
      border: 1px solid rgba(111,208,165,.2) !important;
    }

    body.mobile-gestor-mode .prog-toolbar > .prog-toolbar-row {
      display: grid !important;
      grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
      gap: 9px !important;
      width: 100% !important;
      min-width: 0 !important;
      margin: 0 !important;
      padding: 0 !important;
      border: 0 !important;
    }

    body.mobile-gestor-mode .prog-toolbar > .prog-toolbar-row:first-child {
      grid-template-rows: auto 46px 46px 46px !important;
    }

    body.mobile-gestor-mode .prog-toolbar .prog-context-group,
    body.mobile-gestor-mode .prog-toolbar .prog-actions-block,
    body.mobile-gestor-mode .prog-toolbar .prog-action-row {
      display: contents !important;
    }

    body.mobile-gestor-mode .prog-toolbar > .prog-toolbar-row + .prog-toolbar-row {
      margin-top: 10px !important;
      padding-top: 10px !important;
      border-top: 1px solid rgba(111,208,165,.12) !important;
    }

    body.mobile-gestor-mode .prog-toolbar .prog-tfield-sup,
    body.mobile-gestor-mode .prog-toolbar .prog-tfield-date {
      display: flex !important;
      flex-direction: column !important;
      align-items: stretch !important;
      gap: 5px !important;
      width: 100% !important;
      min-width: 0 !important;
      max-width: none !important;
    }

    body.mobile-gestor-mode .prog-toolbar .prog-tfield-sup {
      grid-column: 1 !important;
      grid-row: 1 !important;
    }

    body.mobile-gestor-mode .prog-toolbar .prog-tfield-date {
      grid-column: 2 !important;
      grid-row: 1 !important;
    }

    body.mobile-gestor-mode .prog-toolbar .prog-tfield label {
      margin: 0 !important;
      white-space: nowrap !important;
      font-size: 10px !important;
      font-weight: 900 !important;
      line-height: 1.2 !important;
      letter-spacing: .08em !important;
      text-transform: uppercase !important;
    }

    body.mobile-gestor-mode .prog-toolbar #progSupCombo,
    body.mobile-gestor-mode .prog-toolbar #progDataRef {
      width: 100% !important;
      min-width: 0 !important;
      max-width: none !important;
      height: 44px !important;
      margin: 0 !important;
    }

    body.mobile-gestor-mode .prog-toolbar #progLoadContext,
    body.mobile-gestor-mode .prog-toolbar #progGerarPdf,
    body.mobile-gestor-mode .prog-toolbar #progCompartilhar,
    body.mobile-gestor-mode .prog-toolbar #progDuplicar {
      width: 100% !important;
      order: initial !important;
      min-width: 0 !important;
      padding-inline: 4px !important;
      font-size: 11.5px !important;
      min-height: 46px !important;
      height: 46px !important;
    }

    body.mobile-gestor-mode .prog-toolbar #progGerarPdf {
      grid-column: 1 !important;
      grid-row: 2 !important;
    }

    body.mobile-gestor-mode .prog-toolbar #progCompartilhar {
      grid-column: 2 !important;
      grid-row: 2 !important;
    }

    body.mobile-gestor-mode .prog-toolbar #progLoadContext {
      grid-column: 1 !important;
      grid-row: 3 !important;
    }

    body.mobile-gestor-mode .prog-toolbar #progDuplicar {
      grid-column: 2 !important;
      grid-row: 3 !important;
    }

    body.mobile-gestor-mode .prog-toolbar-spacer,
    body.mobile-gestor-mode #progSearchWrap {
      display: none !important;
    }

    /* Linha própria embaixo das ações — botão de segurança do gestor:
       autosave por campo já roda sozinho, isso só dá a confirmação visual. */
    body.mobile-gestor-mode .prog-toolbar #progSaveProgramacao {
      display: block !important;
      grid-column: 1 / -1 !important;
      grid-row: 4 !important;
      width: 100% !important;
      order: initial !important;
      min-width: 0 !important;
      min-height: 46px !important;
      height: 46px !important;
      padding-inline: 4px !important;
      font-size: 12.5px !important;
    }

    /* Só O.S./Sem O.S. (Recusas saiu da toolbar, 08/09/2026 — ver
       programacao-gestor-ajustes.js) — 2 colunas, não 3. */
    body.mobile-gestor-mode #progSteps {
      display: grid !important;
      grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
      gap: 7px !important;
      grid-column: 1 / -1 !important;
      width: 100% !important;
      min-width: 0 !important;
    }

    body.mobile-gestor-mode #progSteps .stepbtn {
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      gap: 4px !important;
      width: 100% !important;
      min-width: 0 !important;
      min-height: 42px !important;
      padding: 7px 5px !important;
      overflow: hidden !important;
    }

    body.mobile-gestor-mode #progSteps .stepbtn-label {
      display: inline !important;
      min-width: 0 !important;
      overflow: hidden !important;
      text-overflow: ellipsis !important;
      white-space: nowrap !important;
      font-size: 10px !important;
    }

    body.mobile-gestor-mode #progCtxFeedback {
      grid-column: 1 / -1 !important;
      width: 100% !important;
      margin: 0 !important;
      padding: 2px 0 0 !important;
      text-align: left !important;
      white-space: normal !important;
    }

    /* A Programação também é aberta pelo painel móvel por perfis que não têm
       o papel literal GESTOR. Nesse caminho o shell aplica mobile-panel-mode,
       portanto o grid não pode depender de mobile-gestor-mode. */
    body.mobile-panel-mode .prog-toolbar > .prog-toolbar-row:first-child {
      display: grid !important;
      grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
      grid-template-rows: auto 46px 46px !important;
      gap: 9px !important;
    }

    body.mobile-panel-mode .prog-toolbar .prog-context-group,
    body.mobile-panel-mode .prog-toolbar .prog-actions-block,
    body.mobile-panel-mode .prog-toolbar .prog-action-row {
      display: contents !important;
    }

    body.mobile-panel-mode .prog-toolbar .prog-tfield-sup,
    body.mobile-panel-mode .prog-toolbar .prog-tfield-date {
      display: flex !important;
      flex-direction: column !important;
      align-items: stretch !important;
      gap: 5px !important;
      width: 100% !important;
      min-width: 0 !important;
      max-width: none !important;
    }

    body.mobile-panel-mode .prog-toolbar .prog-tfield-sup {
      grid-column: 1 !important;
      grid-row: 1 !important;
    }

    body.mobile-panel-mode .prog-toolbar .prog-tfield-date {
      grid-column: 2 !important;
      grid-row: 1 !important;
    }

    body.mobile-panel-mode .prog-toolbar .prog-tfield label {
      margin: 0 !important;
      line-height: 1.2 !important;
      white-space: nowrap !important;
    }

    body.mobile-panel-mode .prog-toolbar #progSupCombo,
    body.mobile-panel-mode .prog-toolbar #progDataRef {
      width: 100% !important;
      min-width: 0 !important;
      max-width: none !important;
      height: 44px !important;
      margin: 0 !important;
    }

    body.mobile-panel-mode .prog-toolbar #progGerarPdf,
    body.mobile-panel-mode .prog-toolbar #progCompartilhar,
    body.mobile-panel-mode .prog-toolbar #progLoadContext,
    body.mobile-panel-mode .prog-toolbar #progDuplicar {
      width: 100% !important;
      min-width: 0 !important;
      min-height: 46px !important;
      height: 46px !important;
      margin: 0 !important;
      padding-inline: 4px !important;
      font-size: 11.5px !important;
      order: initial !important;
    }

    body.mobile-panel-mode .prog-toolbar #progGerarPdf {
      grid-column: 1 !important;
      grid-row: 2 !important;
    }

    body.mobile-panel-mode .prog-toolbar #progCompartilhar {
      grid-column: 2 !important;
      grid-row: 2 !important;
    }

    body.mobile-panel-mode .prog-toolbar #progLoadContext {
      grid-column: 1 !important;
      grid-row: 3 !important;
    }

    body.mobile-panel-mode .prog-toolbar #progDuplicar {
      grid-column: 2 !important;
      grid-row: 3 !important;
    }

    body.mobile-gestor-mode .prog-list-card,
    body.mobile-gestor-mode #progList,
    body.mobile-gestor-mode #pldShell,
    body.mobile-gestor-mode #pldShell .pld-list-col {
      width: 100% !important;
      min-width: 0 !important;
      max-width: 100% !important;
      background: #06130e !important;
    }

    body.mobile-gestor-mode #pldShell .pld-filters-row {
      display: grid !important;
      grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
      gap: 8px !important;
    }

    body.mobile-gestor-mode #pldShell .pld-filters-row > :first-child {
      grid-column: auto !important;
    }

    body.mobile-gestor-mode #pldShell .pld-filters-row input,
    body.mobile-gestor-mode #pldShell .pld-filters-row select,
    body.mobile-gestor-mode #pldShell .pld-filters-row .ssel-wrap,
    body.mobile-gestor-mode #pldShell .pld-filters-row .ssel-input {
      width: 100% !important;
      min-width: 0 !important;
      max-width: 100% !important;
      height: 40px !important;
      font-size: 11.5px !important;
      text-overflow: ellipsis !important;
    }

    body.mobile-gestor-mode #pldShell .pld-count-row {
      gap: 8px !important;
      flex-wrap: wrap !important;
    }
  `;
  document.head.appendChild(style);
}

function labelTableCells() {
  document.querySelectorAll('.prog-table').forEach((table) => {
    const labels = [...table.querySelectorAll('thead th')].map((th) => th.textContent.trim());
    table.querySelectorAll('tbody tr').forEach((tr) => {
      [...tr.children].forEach((td, index) => {
        if (!td.dataset.mobileLabel) td.dataset.mobileLabel = labels[index] || '';
      });
    });
  });
}

function applyMobileFix() {
  injectMobileStyles();
  labelTableCells();
}

let scheduled = false;
function scheduleApply() {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    applyMobileFix();
  });
}

new MutationObserver(scheduleApply).observe(document.body, { childList: true, subtree: true });
window.addEventListener('load', scheduleApply);
scheduleApply();
}

// --- Incorporado de programacao-pdf-tipo-fix.js — Geração de PDF (resumo por colaborador) e compartilhar via WhatsApp ---
{

function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}

function normalizeCpf(value) {
  return String(value || '').replace(/\D/g, '');
}

function firstFilled(...values) {
  return values.map((value) => String(value ?? '').trim()).find(Boolean) || '';
}

function todayIso() {
  const now = new Date();
  const tz = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - tz).toISOString().slice(0, 10);
}

function brDate(iso) {
  if (!iso) return '-';
  const [ano, mes, dia] = String(iso).split('-');
  return `${dia}/${mes}/${ano}`;
}

function parseEmbarqueDetalhes(embarque) {
  const texto = String(embarque || '').trim();
  if (!texto) return { cidade: '', local: '' };
  const comUf = texto.match(/^([A-Za-z]{2})\s*[–-]\s*(.+)$/);
  const restante = comUf ? comUf[2].trim() : texto;
  const partes = restante.match(/^([^(]+?)\s*\(([^)]*)\)\s*$/);
  return {
    cidade: (partes ? partes[1] : restante).trim(),
    local: partes ? partes[2].trim() : '',
  };
}

function estadiaLabel(tipo) {
  return ({
    CASA: 'Casa',
    PERNOITE: 'Pernoite',
    ALOJAMENTO: 'Alojamento',
    HOTEL: 'Hotel',
  })[normalizeText(tipo)] || '';
}

function setFeedback(message, type = '') {
  const feedback = document.getElementById('progCtxFeedback');
  if (!feedback) return;
  feedback.className = `feedback mt-16 ${type ? `prog-feedback-${type}` : ''}`;
  feedback.textContent = message;
}

async function loadJsPdf() {
  if (window.jspdf?.jsPDF) return window.jspdf.jsPDF;
  await new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js';
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
  return window.jspdf.jsPDF;
}

async function loadTiposPorColaborador(supervisaoQuery) {
  const porCpf = await loadCruzamentoTipoContrato(supervisaoQuery);
  const porNome = new Map();

  try {
    let query = supabase.from('colaborador_cruzamento').select('*');
    if (Array.isArray(supervisaoQuery)) {
      const supervisoes = supervisaoQuery.filter(Boolean);
      if (supervisoes.length) query = query.in('supervisao', supervisoes);
    } else if (supervisaoQuery) {
      query = query.eq('supervisao', supervisaoQuery);
    }

    const { data, error } = await query.limit(5000);
    if (error) throw error;

    (data || []).forEach((row) => {
      const tipo = firstFilled(row.tipo_contrato, row.tipo, row.regime, row.vinculo);
      if (!tipo) return;

      const cpf = normalizeCpf(firstFilled(row.cpf, row.cpf_colaborador, row.documento));
      if (cpf && !porCpf.has(cpf)) porCpf.set(cpf, tipo);

      const nome = normalizeText(firstFilled(
        row.nome,
        row.colaborador,
        row.funcionario,
        row.nome_colaborador,
        row.colaborador_nome,
      ));
      if (nome && !porNome.has(nome)) porNome.set(nome, tipo);
    });
  } catch (error) {
    console.warn('[pdf-tipo] fallback por nome indisponível', error);
  }

  return { porCpf, porNome };
}

function tipoLetra(tipos, colaboradorId, nome) {
  const cpf = normalizeCpf(colaboradorId);
  const tipo = (cpf && tipos.porCpf.get(cpf)) || tipos.porNome.get(normalizeText(nome));
  const letra = tipoContratoLetra(tipo);
  return ['E', 'I', 'D'].includes(letra) ? letra : '-';
}

async function desenharPdf(linhas, semOsLinhas, meta = {}) {
  const JsPDF = await loadJsPdf();
  const doc = new JsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const PW = 297;
  const PH = 210;
  const M = 10;
  const LH = 4.2;
  let y = M;

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
      const linhasPorColuna = cols.map((col) => doc.splitTextToSize(String(linha[col.key] ?? ''), col.width - 2));
      const numeroLinhas = Math.max(...linhasPorColuna.map((item) => item.length), 1);
      const alturaLinha = numeroLinhas * LH + 2;

      if (y + alturaLinha > PH - M) {
        doc.addPage();
        y = M;
        desenharCabecalho();
      }

      let x = M;
      cols.forEach((col, index) => {
        doc.text(linhasPorColuna[index], x + 1, y + LH);
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
  doc.text(`Supervisão: ${meta.supervisaoLabel || '-'}   ·   Data: ${brDate(meta.dataReferencia)}`, M, y);
  y += 6;

  desenharTabela([
    { key: 'os', label: 'O.S.', width: 15 },
    { key: 'colaborador', label: 'Colaborador', width: 33 },
    { key: 'tipo', label: 'Tipo', width: 10 },
    { key: 'cliente', label: 'Cliente', width: 33 },
    { key: 'local', label: 'Local', width: 29 },
    { key: 'cidade', label: 'Cidade', width: 20 },
    { key: 'deslocamento', label: 'Deslocamento', width: 25 },
    { key: 'estadia', label: 'Estadia', width: 20 },
    { key: 'cafe', label: 'Café', width: 10 },
    { key: 'almoco', label: 'Almoço', width: 11 },
    { key: 'janta', label: 'Janta', width: 10 },
    { key: 'extras', label: 'Extras', width: PW - 2 * M - (15 + 33 + 10 + 33 + 29 + 20 + 25 + 20 + 10 + 11 + 10) },
  ], linhas);

  if (semOsLinhas?.length) {
    y += 8;
    if (y + 16 > PH - M) {
      doc.addPage();
      y = M;
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text('Sem O.S. — colaboradores da regional sem atendimento hoje', M, y + 4);
    y += 8;
    desenharTabela([
      { key: 'colaborador', label: 'Colaborador', width: 55 },
      { key: 'tipo', label: 'Tipo', width: 13 },
      { key: 'situacao', label: 'Situação', width: 28 },
      { key: 'cafe', label: 'Café', width: 13 },
      { key: 'almoco', label: 'Almoço', width: 15 },
      { key: 'janta', label: 'Janta', width: 13 },
      { key: 'pernoite', label: 'Pernoite', width: 20 },
      { key: 'extras', label: 'Extras', width: 50 },
      { key: 'observacao', label: 'Observação', width: PW - 2 * M - (55 + 13 + 28 + 13 + 15 + 13 + 20 + 50) },
    ], semOsLinhas);
  }

  const supervisaoArquivo = meta.supervisaoLabel || 'programacao';
  const dataArquivo = meta.dataReferencia || todayIso();
  const nomeArquivo = `programacao_${supervisaoArquivo.toLowerCase().replace(/[^a-z0-9]+/g, '_')}_${dataArquivo}.pdf`;
  doc.save(nomeArquivo);
}

async function gerarPdfComTipo(button) {
  const programacaoIdMap = window.__progGetProgramacaoIdMap?.();
  const programacaoId = window.__progGetProgramacaoId?.();
  const temMapa = programacaoIdMap instanceof Map && programacaoIdMap.size > 0;

  if (!programacaoId && !temMapa) {
    setFeedback('Carregue um contexto antes de gerar o PDF.', 'warn');
    return;
  }

  const textoOriginal = button.textContent;
  button.disabled = true;
  button.textContent = 'Gerando...';

  try {
    const programacaoIdQuery = temMapa ? [...programacaoIdMap.values()] : programacaoId;
    const supervisaoQuery = temMapa
      ? [...programacaoIdMap.keys()]
      : document.getElementById('progSup')?.value;
    const dataReferencia = window.__progGetDataReferencia?.() || document.getElementById('progDataRef')?.value || todayIso();

    const roster = await loadRosterDoDia(programacaoIdQuery, supervisaoQuery);

    const osIds = [...new Set(roster.flatMap((row) => [...row.osIds]))];
    const colaboradorIds = roster.map((row) => row.colaboradorId);
    const [custos, osResumoPorId, extrasPorColab, tipos] = await Promise.all([
      loadCustos(programacaoIdQuery),
      loadOsResumo(osIds),
      loadExtras(programacaoIdQuery, colaboradorIds),
      loadTiposPorColaborador(supervisaoQuery),
    ]);

    const DESLOC_LABEL = {
      'NAO PRECISA': 'Não precisa',
      'MOTORISTA FROTA': 'Frota - Motorista',
      'CARONA FROTA': 'Frota - Carona',
      'UBER TAXI': 'Uber/Táxi',
      'REEMBOLSO KM': 'Reemb. km',
      ONIBUS: 'Ônibus',
      OUTRO: 'Outro',
    };

    const linhas = roster.map((row) => {
      const est = custos.est.get(row.colaboradorId) || {};
      const ali = custos.ali.get(row.colaboradorId) || { almoco: true };
      const des = custos.des.get(row.colaboradorId) || {};
      const extras = extrasPorColab.get(row.colaboradorId) || [];
      const osList = [...row.osIds].map((id) => osResumoPorId.get(String(id))).filter(Boolean);
      const embarqueDetalhes = osList.map((os) => parseEmbarqueDetalhes(os.embarque));
      const deslocLabel = DESLOC_LABEL[normalizeText(des.tipo_deslocamento || 'NÃO PRECISA')]
        || des.tipo_deslocamento
        || 'Não precisa';
      const temEstadia = est.tem_estadia === true
        || (!!est.tipo_estadia && normalizeText(est.tipo_estadia) !== 'CASA');
      const dias = est.checkin && est.checkout
        ? Math.max(1, Math.round((new Date(`${est.checkout}T00:00:00`) - new Date(`${est.checkin}T00:00:00`)) / 86400000))
        : 1;

      return {
        os: osList.length ? osList.map((os) => os.numero_os || '-').join(', ') : '-',
        colaborador: row.nome,
        tipo: tipoLetra(tipos, row.colaboradorId, row.nome),
        cliente: osList.length ? [...new Set(osList.map((os) => os.cliente || '-'))].join('; ') : '-',
        local: embarqueDetalhes.length ? [...new Set(embarqueDetalhes.map((item) => item.local || '-'))].join('; ') : '-',
        cidade: embarqueDetalhes.length ? [...new Set(embarqueDetalhes.map((item) => item.cidade || '-'))].join('; ') : '-',
        deslocamento: des.placa_veiculo ? `${deslocLabel} · ${des.placa_veiculo}` : deslocLabel,
        estadia: temEstadia ? `${estadiaLabel(est.tipo_estadia) || 'Hospedagem'} · ${dias}d` : 'Casa',
        cafe: ali.cafe ? 'Sim' : 'Não',
        almoco: ali.almoco !== false ? 'Sim' : 'Não',
        janta: ali.janta ? 'Sim' : 'Não',
        extras: extras.length
          ? extras.map((item) => `${item.tipo_despesa || 'Outro'} R$${(Number(item.valor) || 0).toFixed(2)}`).join('; ')
          : '-',
      };
    });

    const SITUACAO_LABEL = {
      ATESTADO: 'Atestado',
      FALTA: 'Falta',
      FERIAS: 'Férias',
      FOLGA: 'Folga',
    };
    const confirmadosIds = new Set(roster.map((row) => row.colaboradorId));
    const supervisoesAlvo = new Set((Array.isArray(supervisaoQuery) ? supervisaoQuery : [supervisaoQuery])
      .map((item) => normalizeText(item))
      .filter(Boolean));
    const regionalBruto = await loadColaboradoresRegional(supervisaoQuery);
    const semOsColabs = regionalBruto
      .filter((colaborador) => supervisoesAlvo.has(normalizeText(colaborador.supervisao)))
      .filter((colaborador) => !confirmadosIds.has(colaborador.colaboradorId));

    let situacoesPorColab = new Map();
    if (semOsColabs.length) {
      const idsProgramacao = Array.isArray(programacaoIdQuery) ? programacaoIdQuery : [programacaoIdQuery];
      const { data, error } = await supabase
        .from('programacao_colaboradores')
        .select('colaborador_id,disponibilidade,observacao')
        .in('programacao_id', idsProgramacao)
        .in('colaborador_id', semOsColabs.map((colaborador) => colaborador.colaboradorId));
      if (error) console.warn('[pdf-tipo] situações sem O.S.', error);
      situacoesPorColab = new Map((data || []).map((row) => [String(row.colaborador_id), row]));
    }

    const disponiveisIds = semOsColabs
      .filter((colaborador) => normalizeText(situacoesPorColab.get(colaborador.colaboradorId)?.disponibilidade) === 'DISPONIVEL')
      .map((colaborador) => colaborador.colaboradorId);
    const extrasDisponiveis = disponiveisIds.length
      ? await loadExtras(programacaoIdQuery, disponiveisIds)
      : new Map();
    const semOsLinhas = semOsColabs.map((colaborador) => {
      const row = situacoesPorColab.get(colaborador.colaboradorId);
      const ali = custos.ali.get(colaborador.colaboradorId) || {};
      const est = custos.est.get(colaborador.colaboradorId) || {};
      const extras = extrasDisponiveis.get(colaborador.colaboradorId) || [];
      return {
        colaborador: colaborador.nome,
        tipo: tipoLetra(tipos, colaborador.colaboradorId, colaborador.nome),
        situacao: normalizeText(row?.disponibilidade) === 'DISPONIVEL' ? 'Disponível' : (SITUACAO_LABEL[normalizeText(row?.disponibilidade || '')] || '-'),
        cafe: ali.cafe ? 'Sim' : '-',
        almoco: ali.almoco ? 'Sim' : '-',
        janta: ali.janta ? 'Sim' : '-',
        pernoite: normalizeText(est.tipo_estadia) === 'PERNOITE' ? 'Sim' : '-',
        extras: extras.length ? extras.map((item) => `${item.tipo_despesa || 'Outro'} R$${(Number(item.valor) || 0).toFixed(2)}`).join('; ') : '-',
        observacao: row?.observacao || '-',
      };
    });

    await desenharPdf(linhas, semOsLinhas, {
      supervisaoLabel: temMapa ? 'Todas' : (supervisaoQuery || '-'),
      dataReferencia,
    });
  } catch (error) {
    console.error(error);
    setFeedback(error.message || 'Falha ao gerar o PDF.', 'error');
  } finally {
    button.disabled = false;
    button.textContent = textoOriginal;
  }
}

document.addEventListener('click', (event) => {
  const button = event.target.closest?.('#progGerarPdf');
  if (!button) return;

  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
  void gerarPdfComTipo(button);
}, true);

// Mesma leitura de dados do PDF (roster + custos + resumo de O.S.), só que
// agrupada em texto pra compartilhar: por Local (quem atende ali) e por
// Motorista de Frota (quem pega carona com ele, casado pela placa gravada em
// programacao_deslocamento — mesmo campo que o card de despesas já usa pra
// "Frota - Motorista"/"Frota - Carona").
async function montarTextoCompartilhar() {
  const programacaoIdMap = window.__progGetProgramacaoIdMap?.();
  const programacaoId = window.__progGetProgramacaoId?.();
  const temMapa = programacaoIdMap instanceof Map && programacaoIdMap.size > 0;
  if (!programacaoId && !temMapa) throw new Error('Carregue um contexto antes de compartilhar.');

  const programacaoIdQuery = temMapa ? [...programacaoIdMap.values()] : programacaoId;
  const supervisaoQuery = temMapa
    ? [...programacaoIdMap.keys()]
    : document.getElementById('progSup')?.value;
  const dataReferencia = window.__progGetDataReferencia?.() || document.getElementById('progDataRef')?.value || todayIso();

  const roster = await loadRosterDoDia(programacaoIdQuery, supervisaoQuery);

  const osIds = [...new Set(roster.flatMap((row) => [...row.osIds]))];
  const [custos, osResumoPorId, vinculosRes] = await Promise.all([
    loadCustos(programacaoIdQuery),
    loadOsResumo(osIds),
    osIds.length ? supabase
      .from('operacional_os_colaboradores')
      .select('os_id,colaborador_key,colaborador_cpf,origem_sugestao')
      .in('os_id', osIds) : Promise.resolve({ data: [], error: null }),
  ]);
  if (vinculosRes.error) throw vinculosRes.error;

  const papelPorVinculo = new Map();
  (vinculosRes.data || []).forEach((vinculo) => {
    const colaborador = firstFilled(vinculo.colaborador_key, vinculo.colaborador_cpf);
    if (!colaborador) return;
    papelPorVinculo.set(
      `${String(vinculo.os_id)}|${normalizeCpf(colaborador) || colaborador}`,
      normalizeText(vinculo.origem_sugestao) === 'PROGRAMACAO FROTA LOGISTICA' ? 'LOGISTICA' : 'ATENDIMENTO',
    );
  });

  const locais = new Map(); // "cliente|cidade|local" -> { cliente, cidade, local, nomes: [] }
  const motoristasPorPlaca = new Map(); // placa -> nome
  const caronasPorPlaca = new Map(); // placa -> [nome]

  for (const row of roster) {
    const des = custos.des.get(row.colaboradorId) || {};
    const tipoDesl = normalizeText(des.tipo_deslocamento || '');
    const placa = String(des.placa_veiculo || '').trim().toUpperCase();

    const osAtendidas = [...row.osIds].filter((osId) => {
      const key = `${String(osId)}|${normalizeCpf(row.colaboradorId) || row.colaboradorId}`;
      return papelPorVinculo.get(key) !== 'LOGISTICA';
    });
    const somenteLogistica = row.osIds.size > 0 && osAtendidas.length === 0;

    if (somenteLogistica) {
      if (placa) motoristasPorPlaca.set(placa, row.nome);
      continue;
    }
    if (tipoDesl === 'CARONA FROTA' && placa) {
      caronasPorPlaca.set(placa, [...(caronasPorPlaca.get(placa) || []), row.nome]);
    }

    for (const osId of osAtendidas) {
      const os = osResumoPorId.get(String(osId));
      if (!os) continue;
      const { cidade, local } = parseEmbarqueDetalhes(os.embarque);
      const cliente = String(os.cliente || '').trim();
      const key = `${cliente}|${cidade}|${local}`;
      const grupo = locais.get(key) || { cliente, cidade, local, nomes: [] };
      if (!grupo.nomes.includes(row.nome)) grupo.nomes.push(row.nome);
      locais.set(key, grupo);
    }
  }

  const blocosLocal = [...locais.values()].map(({ cliente, cidade, local, nomes }) => {
    const rotulo = [local, cidade].filter(Boolean).join(' - ') || '-';
    return `Cliente: ${cliente || '-'}\nLocal: ${rotulo}\nColaboradores:\n${nomes.length ? nomes.join('\n') : '-'}`;
  });

  const placas = new Set([...motoristasPorPlaca.keys(), ...caronasPorPlaca.keys()]);
  const blocosMotorista = [...placas].map((placa) => {
    const nomeMotorista = motoristasPorPlaca.get(placa) || `Placa ${placa} (motorista não cadastrado nesta O.S.)`;
    const caronas = caronasPorPlaca.get(placa) || [];
    return `Motorista: ${nomeMotorista}\nCaronas:\n${caronas.length ? caronas.join('\n') : '-'}`;
  });

  const { data: disponiveisRows, error: disponiveisError } = await supabase
    .from('programacao_colaboradores')
    .select('programacao_id,colaborador_id,nome_colaborador')
    .in('programacao_id', Array.isArray(programacaoIdQuery) ? programacaoIdQuery : [programacaoIdQuery])
    .eq('disponibilidade', 'DISPONIVEL');
  if (disponiveisError) throw disponiveisError;
  const disponiveisIds = (disponiveisRows || []).map((row) => row.colaborador_id);
  const extrasDisponiveis = disponiveisIds.length ? await loadExtras(programacaoIdQuery, disponiveisIds) : new Map();
  const blocosDisponiveis = (disponiveisRows || []).map((row) => {
    const ali = custos.ali.get(row.colaborador_id) || {};
    const est = custos.est.get(row.colaborador_id) || {};
    const extras = extrasDisponiveis.get(row.colaborador_id) || [];
    const despesas = [
      ali.cafe ? 'Café' : '', ali.almoco ? 'Almoço' : '', ali.janta ? 'Janta' : '',
      normalizeText(est.tipo_estadia) === 'PERNOITE' ? 'Pernoite' : '',
      ...extras.map((item) => `${item.tipo_despesa || 'Extra'}${Number(item.valor) > 0 ? ` R$ ${(Number(item.valor)).toFixed(2)}` : ''}`),
    ].filter(Boolean);
    return `• ${row.nome_colaborador || row.colaborador_id}${despesas.length ? ` — ${despesas.join(', ')}` : ''}`;
  });

  const partes = [`📋 Programação — ${brDate(dataReferencia)}`, ...blocosLocal];
  if (blocosMotorista.length) partes.push(...blocosMotorista);
  if (blocosDisponiveis.length) partes.push(`Disponíveis:\n${blocosDisponiveis.join('\n')}`);
  return partes.join('\n\n');
}

async function compartilharPrograma(button) {
  const textoOriginal = button.textContent;
  button.disabled = true;
  button.textContent = 'Montando...';
  try {
    const texto = await montarTextoCompartilhar();
    // montarTextoCompartilhar faz consultas assíncronas. Ao final delas, a
    // ativação transitória do clique já pode ter expirado e navigator.share()
    // passa a lançar NotAllowedError em vários navegadores móveis. O link do
    // WhatsApp não depende dessa ativação e funciona com a mesma mensagem.
    const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(texto)}`;
    window.location.assign(whatsappUrl);
  } catch (error) {
    console.error(error);
    setFeedback(error.message || 'Falha ao montar a mensagem de compartilhamento.', 'error');
  } finally {
    button.disabled = false;
    button.textContent = textoOriginal;
  }
}

document.addEventListener('click', (event) => {
  const button = event.target.closest?.('#progCompartilhar');
  if (!button) return;

  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
  void compartilharPrograma(button);
}, true);
}

// --- Incorporado de programacao-indisponibilidade-sync.js — Sincroniza indisponibilidade do RH (férias/atestados/legado) na tela Sem O.S. ---
{

const TABELA_INFORMADOS = 'programacao_indisponibilidade_informados';
const STATUS_VALIDOS = new Set(['ATESTADO', 'FALTA', 'FERIAS', 'FOLGA']);

const state = {
  cacheDia: '',
  cache: null,
  carregando: null,
  user: null,
  processScheduled: false,
  obsTimers: new Map(),
};

function esc(value) {
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
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}

function normalizeCpf(value) {
  const digits = String(value ?? '').replace(/\D/g, '');
  return digits.length >= 9 ? digits : '';
}

function todayIso() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function dataReferenciaAtual() {
  const candidatos = [
    '#programacaoData', '#progData', '#pgcData', '#dataReferencia',
    'input[name="data_referencia"]', 'input[name="dataReferencia"]',
  ];
  for (const selector of candidatos) {
    const el = document.querySelector(selector);
    if (el?.value && /^\d{4}-\d{2}-\d{2}$/.test(el.value)) return el.value;
  }

  const visivel = [...document.querySelectorAll('input[type="date"]')]
    .find((el) => el.value && el.offsetParent !== null && !el.closest('.in-modal,.pso-modal,.pld-modal-ov'));
  return visivel?.value || todayIso();
}

function statusDoMotivo(value) {
  const motivo = normalizeText(value);
  if (motivo.includes('ATEST')) return 'ATESTADO';
  if (motivo.includes('FERI')) return 'FERIAS';
  if (motivo.includes('FALTA')) return 'FALTA';
  if (motivo.includes('FOLGA')) return 'FOLGA';
  return 'INDISPONIVEL';
}

function statusLabel(status) {
  return ({
    ATESTADO: 'Atestado',
    FALTA: 'Falta',
    FERIAS: 'Férias',
    FOLGA: 'Folga',
    INDISPONIVEL: 'Indisponível',
  })[status] || status;
}

function novoIndice() {
  const porId = new Map();
  const porNome = new Map();
  const todos = [];

  function add(row) {
    const registro = {
      id: String(row.id || '').trim(),
      cpf: normalizeCpf(row.cpf),
      nome: String(row.nome || '').trim(),
      status: row.status || 'INDISPONIVEL',
      label: row.label || statusLabel(row.status),
      fonte: row.fonte || 'RH',
    };
    const idKey = registro.cpf || registro.id;
    const nomeKey = normalizeText(registro.nome);
    if (idKey && !porId.has(idKey)) porId.set(idKey, registro);
    if (registro.id && !porId.has(registro.id)) porId.set(registro.id, registro);
    if (nomeKey && !porNome.has(nomeKey)) porNome.set(nomeKey, registro);
    todos.push(registro);
  }

  function match(id, nome) {
    const bruto = String(id || '').trim();
    const cpf = normalizeCpf(bruto);
    return (cpf && porId.get(cpf))
      || (bruto && porId.get(bruto))
      || porNome.get(normalizeText(nome))
      || null;
  }

  return { porId, porNome, todos, add, match };
}

async function carregarIndisponiveis(dia = dataReferenciaAtual()) {
  if (state.cache && state.cacheDia === dia) return state.cache;
  if (state.carregando && state.cacheDia === dia) return state.carregando;

  state.cacheDia = dia;
  state.carregando = (async () => {
    const indice = novoIndice();
    const [legadoRes, feriasRes, atestadosRes] = await Promise.all([
      supabase.from('indisponibilidades')
        .select('colaborador_cpf,colaborador_nome,motivo,data_inicio,data_fim')
        .lte('data_inicio', dia)
        .or(`data_fim.is.null,data_fim.gte.${dia}`),
      supabase.from('rh_ferias')
        .select('colaborador_id,colaborador_nome,data_inicio,data_fim')
        .in('status', ['programada', 'em_gozo'])
        .lte('data_inicio', dia)
        .gte('data_fim', dia),
      supabase.from('rh_atestados')
        .select('colaborador_id,colaborador_nome,data_inicio,data_fim')
        .in('status', ['lancado', 'aprovado'])
        .lte('data_inicio', dia)
        .gte('data_fim', dia),
    ]);

    if (legadoRes.error) console.warn('[programacao-indisponibilidade] indisponibilidades:', legadoRes.error);
    if (feriasRes.error) console.warn('[programacao-indisponibilidade] férias:', feriasRes.error);
    if (atestadosRes.error) console.warn('[programacao-indisponibilidade] atestados:', atestadosRes.error);

    (legadoRes.data || []).forEach((r) => {
      const status = statusDoMotivo(r.motivo);
      indice.add({
        cpf: r.colaborador_cpf,
        nome: r.colaborador_nome,
        status,
        label: statusLabel(status),
        fonte: 'RH > Indisponibilidade',
      });
    });

    const rhRows = [
      ...(feriasRes.data || []).map((r) => ({ ...r, status: 'FERIAS', label: 'Férias' })),
      ...(atestadosRes.data || []).map((r) => ({ ...r, status: 'ATESTADO', label: 'Atestado' })),
    ];

    const uuids = [...new Set(rhRows.map((r) => r.colaborador_id).filter(Boolean).map(String))];
    const cadPorId = new Map();
    if (uuids.length) {
      const { data: cadastros, error } = await supabase.from('colaboradores').select('id,cpf,nome').in('id', uuids);
      if (error) console.warn('[programacao-indisponibilidade] colaboradores:', error);
      (cadastros || []).forEach((c) => cadPorId.set(String(c.id), c));
    }

    rhRows.forEach((r) => {
      const cadastro = cadPorId.get(String(r.colaborador_id)) || {};
      indice.add({
        id: r.colaborador_id,
        cpf: cadastro.cpf,
        nome: cadastro.nome || r.colaborador_nome,
        status: r.status,
        label: r.label,
        fonte: r.status === 'FERIAS' ? 'RH > Férias' : 'RH > Atestados',
      });
    });

    state.cache = indice;
    return indice;
  })().finally(() => { state.carregando = null; });

  return state.carregando;
}

function nomeDoCard(card) {
  const el = card?.querySelector('.pso-nome');
  if (!el) return '';
  const clone = el.cloneNode(true);
  clone.querySelectorAll('.pso-indisp,.pso-sync-rh-badge').forEach((n) => n.remove());
  return clone.textContent.trim();
}

function nomeDaOpcao(option) {
  return String(option.dataset.nome || option.textContent || '')
    .replace(/^\s*♻\s*/, '')
    .replace(/\s*\((RH|indisponível).*$/i, '')
    .trim();
}

async function filtrarSeletoresDeColaborador() {
  const indice = await carregarIndisponiveis();
  const selects = document.querySelectorAll('select[data-add-colab-select]');
  selects.forEach((select) => {
    [...select.options].forEach((option) => {
      if (!option.value) return;
      const registro = indice.match(option.value, nomeDaOpcao(option));
      if (registro) option.remove();
    });
  });

  document.querySelectorAll('[data-confirmar-candidato]').forEach((btn) => {
    const wrap = btn.closest('.pld-cand-wrap');
    if (!wrap || wrap.dataset.indispTratada === '1') return;
    const id = btn.dataset.confirmarCandidato;
    const nome = wrap.querySelector('.peqb-cand-top strong,strong')?.textContent?.trim() || '';
    const registro = indice.match(id, nome);
    if (!registro) return;
    wrap.dataset.indispTratada = '1';
    wrap.innerHTML = `<div class="pld-lock">🔒 <b>${esc(nome || 'Colaborador')}</b> está ${esc(registro.label.toLowerCase())} e não pode ser indicado nesta O.S.</div>`;
  });
}

function badgeAutomatico(card, registro) {
  const nomeEl = card.querySelector('.pso-nome');
  if (!nomeEl || nomeEl.querySelector('.pso-indisp,.pso-sync-rh-badge')) return;
  const badge = document.createElement('span');
  badge.className = 'pso-sync-rh-badge';
  badge.textContent = `${registro.label} (RH)`;
  badge.title = `Status preenchido automaticamente por ${registro.fonte}`;
  nomeEl.appendChild(badge);
}

async function aplicarStatusAutomaticoSemOs() {
  const indice = await carregarIndisponiveis();
  document.querySelectorAll('.pso-card[data-colab-id]').forEach((card) => {
    const id = card.dataset.colabId;
    const nome = nomeDoCard(card);
    const registro = indice.match(id, nome);
    if (!registro) return;

    card.dataset.indisponivelRh = registro.status;
    badgeAutomatico(card, registro);

    if (!STATUS_VALIDOS.has(registro.status)) return;
    const btn = card.querySelector(`.pso-sit-btn[data-situacao="${registro.status}"]`);
    if (!btn || btn.disabled || btn.classList.contains('on')) return;

    card.dataset.rhAutoAplicando = '1';
    btn.click();
    queueMicrotask(() => { delete card.dataset.rhAutoAplicando; });
  });
}

function injetarStyles() {
  if (document.getElementById('progIndisponibilidadeSyncStyles')) return;
  const style = document.createElement('style');
  style.id = 'progIndisponibilidadeSyncStyles';
  style.textContent = `
    .pso-sync-rh-badge{display:inline-flex;align-items:center;margin-left:8px;padding:2px 8px;border-radius:999px;font-size:10px;font-weight:900;background:rgba(245,158,11,.14);color:#fde68a;border:1px solid rgba(245,158,11,.35);vertical-align:middle}
    .pso-rh-status{display:inline-flex;align-items:center;justify-content:center;min-width:58px;padding:4px 9px;border-radius:999px;font-size:11px;font-weight:900;white-space:nowrap;justify-self:end}
    .pso-rh-status.ok{background:rgba(34,197,94,.14);color:#4ade80;border:1px solid rgba(34,197,94,.35)}
    .pso-rh-status.err{background:rgba(239,68,68,.14);color:#fca5a5;border:1px solid rgba(239,68,68,.35)}
  `;
  document.head.appendChild(style);
}

async function userAtual() {
  if (!state.user) state.user = await getCurrentUser().catch(() => null);
  return state.user;
}

function dadosDoCard(card) {
  const meta = String(card.querySelector('.pso-meta')?.textContent || '').trim();
  const partes = meta.split('·').map((v) => v.trim());
  const id = String(card.dataset.colabId || '').trim();
  return {
    colaborador_id: id,
    colaborador_cpf: normalizeCpf(id) || null,
    colaborador_nome: nomeDoCard(card),
    cargo: partes[0] || null,
    supervisao: partes[1] || null,
    observacao: card.querySelector('.pso-obs')?.value?.trim() || null,
  };
}

// O badge mora num slot fixo (4ª coluna do grid de .pso-card, ver
// programacao-sem-os.js) em vez de ser inserido/removido como sibling solto
// — isso é o que evitava manter as colunas alinhadas (o texto de feedback
// entrava como um item extra no grid de 3 colunas e empurrava a Observação
// pra uma linha nova, reportado pela usuária 2026-07-29).
function setStatusRh(card, informado) {
  const el = card.querySelector('[data-rh-status]');
  if (!el) return;
  clearTimeout(el._timer);
  el.title = '';
  if (informado) {
    el.className = 'pso-rh-status ok';
    el.textContent = 'RH ✔';
  } else {
    el.className = 'pso-rh-status';
    el.textContent = '';
  }
}

function mostrarErroRh(card) {
  const el = card.querySelector('[data-rh-status]');
  if (!el) return;
  const classeAnterior = el.className;
  const textoAnterior = el.textContent;
  clearTimeout(el._timer);
  el.className = 'pso-rh-status err';
  el.textContent = 'Falha';
  el.title = 'Falha ao informar o RH.';
  el._timer = setTimeout(() => {
    el.className = classeAnterior;
    el.textContent = textoAnterior;
    el.title = '';
  }, 3500);
}

async function enviarAoRh(card, tipo, selecionado) {
  const user = await userAtual();
  const dados = dadosDoCard(card);
  if (!dados.colaborador_id || !dados.colaborador_nome) return;

  const agora = new Date().toISOString();
  const payload = {
    ...dados,
    data_referencia: dataReferenciaAtual(),
    tipo,
    origem: 'PROGRAMACAO_SEM_OS',
    status: selecionado ? 'PENDENTE' : 'CANCELADO',
    informado_por: user?.id || null,
    informado_por_nome: user?.user_metadata?.nome || user?.email || null,
    informado_em: agora,
    updated_at: agora,
  };
  if (selecionado) {
    payload.processado_por = null;
    payload.processado_por_nome = null;
    payload.processado_em = null;
    payload.observacao_rh = null;
  }

  const { error } = await supabase
    .from(TABELA_INFORMADOS)
    .upsert(payload, { onConflict: 'data_referencia,colaborador_id' });

  if (error) {
    console.error('[programacao-indisponibilidade] informar RH:', error);
    mostrarErroRh(card);
    return;
  }
  setStatusRh(card, selecionado);
}

function observarAcoesSemOs() {
  document.addEventListener('click', (event) => {
    const btn = event.target.closest('.pso-sit-btn[data-situacao]');
    if (!btn) return;
    const card = btn.closest('.pso-card[data-colab-id]');
    if (!card || card.dataset.rhAutoAplicando === '1') return;

    queueMicrotask(() => {
      const tipo = String(btn.dataset.situacao || '').trim();
      if (!STATUS_VALIDOS.has(tipo)) return;
      enviarAoRh(card, tipo, btn.classList.contains('on')).catch((error) => {
        console.error('[programacao-indisponibilidade] fila RH:', error);
      });
    });
  });

  document.addEventListener('input', (event) => {
    const input = event.target.closest('.pso-obs');
    if (!input) return;
    const card = input.closest('.pso-card[data-colab-id]');
    const ativo = card?.querySelector('.pso-sit-btn.on[data-situacao]');
    if (!card || !ativo || card.dataset.rhAutoAplicando === '1') return;
    const key = `${dataReferenciaAtual()}:${card.dataset.colabId}`;
    clearTimeout(state.obsTimers.get(key));
    state.obsTimers.set(key, setTimeout(() => {
      enviarAoRh(card, ativo.dataset.situacao, true).catch(() => {});
    }, 700));
  });
}

function agendarProcessamento() {
  if (state.processScheduled) return;
  state.processScheduled = true;
  requestAnimationFrame(async () => {
    state.processScheduled = false;
    try {
      await Promise.all([
        filtrarSeletoresDeColaborador(),
        aplicarStatusAutomaticoSemOs(),
      ]);
    } catch (error) {
      console.warn('[programacao-indisponibilidade] processamento:', error);
    }
  });
}

function boot() {
  injetarStyles();
  observarAcoesSemOs();
  const observer = new MutationObserver(agendarProcessamento);
  observer.observe(document.body, { childList: true, subtree: true });
  document.addEventListener('change', (event) => {
    if (event.target.matches('input[type="date"]')) {
      state.cache = null;
      state.cacheDia = '';
      agendarProcessamento();
    }
  });
  agendarProcessamento();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
else boot();
}

// --- Incorporado de programacao-indisponibilidade-rh-lock.js — Bloqueia edição de cards com indisponibilidade definida pelo RH ---
{
// Bloqueia no Gestor qualquer indisponibilidade definida pelo RH.
// O módulo programacao-indisponibilidade-sync.js identifica os cards e grava
// data-indisponivel-rh; este módulo transforma esses registros em somente leitura.

const STATUS_LABELS = {
  ATESTADO: 'Atestado',
  FALTA: 'Falta',
  FERIAS: 'Férias',
  FOLGA: 'Folga',
  INDISPONIVEL: 'Indisponível',
};

let scanAgendado = false;

function statusLabel(status) {
  return STATUS_LABELS[String(status || '').trim().toUpperCase()] || 'Indisponível';
}

function injetarStyles() {
  if (document.getElementById('programacaoIndisponibilidadeRhLockStyles')) return;
  const style = document.createElement('style');
  style.id = 'programacaoIndisponibilidadeRhLockStyles';
  style.textContent = `
    .pso-card.pso-rh-locked{
      border-color:rgba(245,158,11,.32)!important;
      background:rgba(120,53,15,.08)!important;
    }
    .pso-card.pso-rh-locked .pso-sit-btn,
    .pso-card.pso-rh-locked .pso-obs{
      cursor:not-allowed!important;
    }
    .pso-card.pso-rh-locked .pso-sit-btn:not(.on){
      opacity:.42!important;
    }
    .pso-card.pso-rh-locked .pso-sit-btn.on{
      opacity:1!important;
      border-color:rgba(245,158,11,.55)!important;
      background:rgba(245,158,11,.18)!important;
      color:#fde68a!important;
    }
    .pso-card.pso-rh-locked .pso-obs{
      opacity:.68!important;
    }
    .pso-rh-status.locked{
      background:rgba(245,158,11,.14)!important;
      color:#fde68a!important;
      border:1px solid rgba(245,158,11,.35)!important;
      cursor:help;
    }
    .pso-rh-status.locked.pulse{animation:psoRhLockPulse .45s ease}
    @keyframes psoRhLockPulse{
      50%{background:rgba(245,158,11,.3);transform:scale(1.05)}
    }
  `;
  document.head.appendChild(style);
}

function mostrarBloqueio(card) {
  const el = card?.querySelector('[data-rh-status]');
  if (!el) return;
  el.classList.remove('pulse');
  void el.offsetWidth;
  el.classList.add('pulse');
}

function bloquearCard(card) {
  const status = String(card?.dataset.indisponivelRh || '').trim().toUpperCase();
  if (!card || !status) return;

  card.dataset.rhLock = '1';
  card.classList.add('pso-rh-locked');

  card.querySelectorAll('.pso-sit-btn[data-situacao]').forEach((btn) => {
    btn.disabled = true;
    btn.setAttribute('aria-disabled', 'true');
    btn.title = 'Status definido pelo RH. Altere somente em RH > Indisponibilidade.';
  });

  const obs = card.querySelector('.pso-obs');
  if (obs) {
    obs.disabled = true;
    obs.readOnly = true;
    obs.setAttribute('aria-disabled', 'true');
    obs.title = 'Indisponibilidade definida pelo RH. A observação não pode ser alterada pelo Gestor.';
  }

  const el = card.querySelector('[data-rh-status]');
  if (!el) return;
  el.className = 'pso-rh-status locked';
  el.textContent = `🔒 ${statusLabel(status)}`;
  el.title = `${statusLabel(status)} definido pelo RH. Alterações somente em RH > Indisponibilidade.`;
}

function processarCards() {
  document.querySelectorAll('.pso-card[data-indisponivel-rh]').forEach(bloquearCard);
}

function agendarScan() {
  if (scanAgendado) return;
  scanAgendado = true;
  requestAnimationFrame(() => {
    scanAgendado = false;
    processarCards();
  });
}

function bloquearEventoDoGestor(event) {
  const alvo = event.target.closest?.('.pso-sit-btn[data-situacao], .pso-obs');
  if (!alvo) return;
  const card = alvo.closest('.pso-card[data-rh-lock="1"]');
  if (!card || card.dataset.rhAutoAplicando === '1') return;

  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
  mostrarBloqueio(card);
}

function boot() {
  injetarStyles();

  // Captura antes dos handlers originais do Sem O.S., evitando qualquer gravação.
  document.addEventListener('click', bloquearEventoDoGestor, true);
  document.addEventListener('input', bloquearEventoDoGestor, true);
  document.addEventListener('change', bloquearEventoDoGestor, true);

  const observer = new MutationObserver(agendarScan);
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['data-indisponivel-rh'],
  });

  agendarScan();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}
}

// --- Incorporado de programacao-hospedagem-colaboradores-fix.js — Ajustes pontuais de embarque/hospedagem (patch em supabase.from/rpc; precisa rodar ANTES do bloco de regional-colaboradores-strict abaixo, que empilha outro patch em supabase.from) ---
{
// Programação: correções pontuais carregadas antes do módulo de ajuste do gestor.
//
// 1) Programação → Hospedagem: normaliza o vínculo de colaboradores.
//    O fluxo automático antigo enviava colaborador_nome/colaborador_cpf, mas o
//    módulo de Hospedagem e a view usam nome_colaborador/cpf.
//
// 2) Programação → Embarque: Auditor e Administrativo não podem entrar como
//    sugestão/candidato de O.S. Suporte, Supervisor e Coordenador da regional
//    permanecem autorizáveis. A regra atua em 4 pontos:
//    - filtra a RPC de candidatos antes do auto-preencher;
//    - se o top da RPC ficar vazio após o filtro, injeta colaboradores elegíveis
//      da regional para o gestor sempre conseguir escolher alguém;
//    - filtra a lista completa do dropdown de troca;
//    - limpa, em segundo plano, os vínculos antigos já salvos no banco.
//
// 3) Programação → Alojamento: quando o gestor escolhe ALOJAMENTO, o select passa
//    a priorizar o alojamento mais próximo do ponto de embarque. Usa latitude/
//    longitude quando existir, tenta extrair do link do Maps e, se só houver
//    endereço textual, tenta geocodificar em memória para calcular a distância.

const PATCH_FLAG = '__programacaoAjustesPontuaisFixV6';
const colaboradoresElegiveisCache = new Map();
const alojamentosDistanciaCache = { rows: null, loading: null };
const geocodeCache = new Map();
let alojamentoSortScheduled = false;

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}

function cpfNorm(value) {
  return String(value || '').replace(/\D/g, '');
}

function colaboradorKey(row) {
  const cpf = cpfNorm(row?.cpf || row?.colaborador_id || row?.colaboradorId);
  return cpf || String(row?.nome || row?.colaborador_nome || '').trim();
}

function isCargoBloqueadoEmbarque(value) {
  const cargo = normalizeText(value);
  return cargo.includes('AUDITOR') || cargo.includes('ADMINISTRATIVO');
}

function isSituacaoInativa(value) {
  const s = normalizeText(value);
  return ['NAO ATIVO', 'NAO ATIVA', 'INATIVO', 'INATIVA', 'DESLIGADO', 'DESLIGADA', 'DEMITIDO', 'DEMITIDA'].includes(s);
}

function normalizeUF(value) {
  return String(value || '').trim().toUpperCase().slice(0, 2);
}

function ufFromEmbarque(value) {
  const m = /^([A-Z]{2})\s*[–-]/i.exec(String(value || '').trim());
  return m ? normalizeUF(m[1]) : '';
}

function firstValue(row, keys) {
  for (const key of keys) {
    if (row && row[key] !== undefined && row[key] !== null && String(row[key]).trim() !== '') return row[key];
  }
  return null;
}

function num(value) {
  const n = Number(String(value ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function hasGeo(lat, lng) {
  return Number.isFinite(Number(lat)) && Number.isFinite(Number(lng));
}

function kmEntre(aLat, aLng, bLat, bLng) {
  if (!hasGeo(aLat, aLng) || !hasGeo(bLat, bLng)) return null;
  const R = 6371;
  const rad = (d) => (Number(d) * Math.PI) / 180;
  const dLat = rad(Number(bLat) - Number(aLat));
  const dLng = rad(Number(bLng) - Number(aLng));
  const s = Math.sin(dLat / 2) ** 2
    + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.min(1, Math.sqrt(s))) * 10) / 10;
}

function parseMapsCoords(value) {
  const text = String(value || '');
  const patterns = [
    /@(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/,
    /[?&](?:q|ll)=(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/,
    /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/,
  ];
  for (const pattern of patterns) {
    const m = pattern.exec(text);
    if (m && hasGeo(m[1], m[2])) return { lat: Number(m[1]), lng: Number(m[2]) };
  }
  return null;
}

function normalizeHospedagemColaboradorRow(row) {
  const out = { ...(row || {}) };

  if (out.colaborador_nome && !out.nome_colaborador) out.nome_colaborador = out.colaborador_nome;
  if (out.colaborador_cpf && !out.cpf) out.cpf = out.colaborador_cpf;

  delete out.colaborador_nome;
  delete out.colaborador_cpf;

  if (out.nome_colaborador != null) out.nome_colaborador = String(out.nome_colaborador).trim();
  if (out.cpf != null) out.cpf = cpfNorm(out.cpf) || null;
  if (!out.status_colaborador) out.status_colaborador = 'ATIVO';

  return out;
}

function unique(values) {
  return [...new Set((values || []).filter((v) => v !== null && v !== undefined && String(v) !== '').map(String))];
}

async function carregarColaboradoresElegiveis(originalFrom, supervisao) {
  const sup = String(supervisao || '').trim();
  if (!sup) return [];
  if (colaboradoresElegiveisCache.has(sup)) return colaboradoresElegiveisCache.get(sup);

  try {
    const { data, error } = await originalFrom('colaboradores_atuais')
      .select('cpf,nome,cargo,coordenacao,supervisao,situacao,ativo,desligamento')
      .eq('supervisao', sup)
      .limit(5000);

    if (error) throw error;

    const seen = new Set();
    const rows = (data || [])
      .filter((r) => r?.nome)
      .filter((r) => r.ativo !== false)
      // Readmitido mantém no GRM a data do desligamento ANTERIOR (só
      // `situacao` vira "Ativo" na volta) — sem o "&& situação != ATIVO" ele
      // fica fora do embarque pra sempre mesmo já reativado.
      .filter((r) => !r.desligamento || normalizeText(r.situacao) === 'ATIVO')
      .filter((r) => !isSituacaoInativa(r.situacao))
      .filter((r) => !isCargoBloqueadoEmbarque(r.cargo))
      .map((r) => ({
        colaborador_id: colaboradorKey(r),
        nome: r.nome,
        cargo: r.cargo || null,
        coordenacao: r.coordenacao || null,
        supervisao: r.supervisao || sup,
      }))
      .filter((r) => {
        const key = String(r.colaborador_id || r.nome || '');
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a, b) => String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR'));

    colaboradoresElegiveisCache.set(sup, rows);
    return rows;
  } catch (error) {
    console.warn('[programacao] colaboradores elegíveis:', error);
    colaboradoresElegiveisCache.set(sup, []);
    return [];
  }
}

async function limparConfirmadosBloqueados(originalFrom, rows) {
  const ids = unique(rows.map((r) => r.id));
  const osColabPares = rows
    .filter((r) => r.os_id && r.colaborador_id)
    .map((r) => ({ osId: r.os_id, colaboradorId: String(r.colaborador_id) }));
  const pares = rows
    .filter((r) => r.programacao_id && r.colaborador_id)
    .map((r) => ({ programacaoId: r.programacao_id, colaboradorId: String(r.colaborador_id) }));

  try {
    if (ids.length) await originalFrom('programacao_equipe').delete().in('id', ids);
    // Apagar só o vínculo do colaborador bloqueado — filtrar apenas por
    // os_id apagava também colaboradores válidos que compartilham a mesma
    // O.S. (achado: O.S. 92489 perdendo colaborador "Efetivo" ao lado de um
    // "Intermitente" com cargo bloqueado, 2026-09-14).
    await Promise.all(osColabPares.map((p) => originalFrom('operacional_os_colaboradores')
      .delete()
      .eq('os_id', p.osId)
      .eq('colaborador_key', p.colaboradorId)));
    await Promise.all(pares.map((p) => originalFrom('programacao_colaboradores')
      .update({ disponibilidade: 'SEM EMBARQUE' })
      .eq('programacao_id', p.programacaoId)
      .eq('colaborador_id', p.colaboradorId)
      .in('disponibilidade', ['OK', 'LOGISTICA'])));
  } catch (error) {
    console.warn('[programacao] limpeza supervisor/coordenador/auditor:', error);
  }
}

function patchProgramacaoEquipeQuery(query, originalFrom) {
  if (!query || query.__progEquipeCargoPatch || typeof query.then !== 'function') return query;

  const originalThen = query.then.bind(query);
  query.then = function patchedThen(resolve, reject) {
    const wrappedResolve = async (payload) => {
      if (!payload || !Array.isArray(payload.data) || !payload.data.length) return payload;

      try {
        const rows = payload.data;
        const programacaoIds = unique(rows.map((r) => r.programacao_id));
        const colaboradorIds = unique(rows.map((r) => r.colaborador_id));
        if (!programacaoIds.length || !colaboradorIds.length) return payload;

        const { data: espelhos, error } = await originalFrom('programacao_colaboradores')
          .select('programacao_id,colaborador_id,nome_colaborador,cargo,disponibilidade')
          .in('programacao_id', programacaoIds)
          .in('colaborador_id', colaboradorIds);

        if (error || !Array.isArray(espelhos)) return payload;

        const cargoPorChave = new Map();
        espelhos.forEach((row) => {
          cargoPorChave.set(`${row.programacao_id}|${String(row.colaborador_id)}`, row.cargo || '');
        });

        const bloqueados = [];
        const filtrados = rows.filter((row) => {
          const cargo = cargoPorChave.get(`${row.programacao_id}|${String(row.colaborador_id)}`) || row.cargo || '';
          const bloqueado = isCargoBloqueadoEmbarque(cargo);
          if (bloqueado) bloqueados.push(row);
          return !bloqueado;
        });

        if (bloqueados.length) limparConfirmadosBloqueados(originalFrom, bloqueados);
        return { ...payload, data: filtrados };
      } catch (error) {
        console.warn('[programacao] filtro supervisor/coordenador/auditor:', error);
        return payload;
      }
    };

    return originalThen(
      (payload) => Promise.resolve(wrappedResolve(payload)).then(resolve),
      reject,
    );
  };

  query.__progEquipeCargoPatch = true;
  return query;
}

function patchFrom(originalFrom) {
  return function patchedFrom(table) {
    const builder = originalFrom(table);

    if (table === 'hospedagem_solicitacao_colaboradores' && !builder.__hospColabInsertPatched) {
      const originalInsert = builder.insert.bind(builder);
      builder.insert = function patchedInsert(values, options) {
        const normalized = Array.isArray(values)
          ? values.map(normalizeHospedagemColaboradorRow).filter((row) => row.nome_colaborador)
          : normalizeHospedagemColaboradorRow(values);

        if (Array.isArray(normalized) && !normalized.length) {
          throw new Error('A solicitação de hospedagem precisa ter pelo menos um colaborador.');
        }
        if (!Array.isArray(normalized) && !normalized.nome_colaborador) {
          throw new Error('A solicitação de hospedagem precisa ter o nome do colaborador.');
        }

        return originalInsert(normalized, options);
      };
      builder.__hospColabInsertPatched = true;
    }

    if (table === 'programacao_equipe' && !builder.__progEquipeSelectPatched) {
      const originalSelect = builder.select.bind(builder);
      builder.select = function patchedSelect(...args) {
        return patchProgramacaoEquipeQuery(originalSelect(...args), originalFrom);
      };
      builder.__progEquipeSelectPatched = true;
    }

    return builder;
  };
}

function fallbackCandidatosRows(osPayload, colaboradores, excluirIds, dataFiltrada) {
  const porOs = new Map();
  (dataFiltrada || []).forEach((row) => {
    const key = String(row.os_id || '');
    if (!porOs.has(key)) porOs.set(key, []);
    porOs.get(key).push(row);
  });

  const excluidos = new Set(unique(excluirIds));
  const disponiveis = (colaboradores || []).filter((c) => !excluidos.has(String(c.colaborador_id))).slice(0, 20);
  if (!disponiveis.length) return dataFiltrada || [];

  const out = [...(dataFiltrada || [])];
  (osPayload || []).forEach((osItem) => {
    const osId = String(osItem?.os_id || '');
    const atuais = porOs.get(osId) || [];
    if (atuais.length >= 8) return;

    const jaNaOs = new Set(atuais.map((r) => String(r.colaborador_id)));
    disponiveis
      .filter((c) => !jaNaOs.has(String(c.colaborador_id)))
      .slice(0, 8 - atuais.length)
      .forEach((c, idx) => {
        out.push({
          os_id: osItem.os_id,
          colaborador_id: c.colaborador_id,
          nome: c.nome,
          cargo: c.cargo || null,
          coordenacao: c.coordenacao || null,
          supervisao: c.supervisao || null,
          tipo_contrato: null,
          km: null,
          auditorias_qtd: null,
          auditorias_peso: null,
          veiculo_id: null,
          veiculo_placa: null,
          colab_lat: null,
          colab_lng: null,
          custo_total: null,
          score: 0.01 - idx * 0.0001,
          score_contrato: 0,
          score_distancia: 0,
          score_auditoria: 0,
        });
      });
  });
  return out;
}

function patchRpc(originalRpc, originalFrom) {
  return function patchedRpc(fn, params, options) {
    const result = originalRpc(fn, params, options);

    if (fn === 'programacao_colaboradores_supervisao') {
      return Promise.resolve(result).then(async (payload) => {
        if (!payload || !Array.isArray(payload.data)) return payload;
        const sup = params?.p_supervisao;
        const elegiveis = await carregarColaboradoresElegiveis(originalFrom, sup);
        if (elegiveis.length) return { ...payload, data: elegiveis };
        return { ...payload, data: payload.data.filter((row) => !isCargoBloqueadoEmbarque(row?.cargo)) };
      });
    }

    if (fn !== 'programacao_etapa_b_candidatos') return result;

    return Promise.resolve(result).then(async (payload) => {
      if (!payload || !Array.isArray(payload.data)) return payload;
      const filtrada = payload.data.filter((row) => !isCargoBloqueadoEmbarque(row?.cargo));
      const elegiveis = await carregarColaboradoresElegiveis(originalFrom, params?.p_supervisao);
      return {
        ...payload,
        data: fallbackCandidatosRows(params?.p_os || [], elegiveis, params?.p_excluir_colaborador_ids || [], filtrada),
      };
    });
  };
}

async function carregarAlojamentosDistancia() {
  if (alojamentosDistanciaCache.rows) return alojamentosDistanciaCache.rows;
  if (alojamentosDistanciaCache.loading) return alojamentosDistanciaCache.loading;

  alojamentosDistanciaCache.loading = supabase
    .from('hospedagem_alojamentos')
    .select('*')
    .then(({ data, error }) => {
      if (error) throw error;
      alojamentosDistanciaCache.rows = (data || [])
        .filter((a) => normalizeText(a.status || 'ATIVO') === 'ATIVO')
        .map((a) => ({
          ...a,
          _nome: firstValue(a, ['nome', 'alojamento', 'nome_alojamento']) || 'Alojamento sem nome',
          _cidade: firstValue(a, ['cidade', 'cidade_alojamento']) || '',
          _uf: normalizeUF(firstValue(a, ['uf', 'estado', 'uf_alojamento']) || ''),
        }));
      return alojamentosDistanciaCache.rows;
    })
    .catch((error) => {
      console.warn('[programacao] alojamentos/distância:', error);
      alojamentosDistanciaCache.rows = [];
      return [];
    });

  return alojamentosDistanciaCache.loading;
}

function coordsAlojamento(row) {
  const lat = num(firstValue(row, ['latitude', 'lat', 'geo_latitude', 'endereco_latitude']));
  const lng = num(firstValue(row, ['longitude', 'lng', 'lon', 'geo_longitude', 'endereco_longitude']));
  if (hasGeo(lat, lng)) return { lat, lng, fonte: 'coord' };

  const maps = [firstValue(row, ['link_maps', 'maps', 'google_maps', 'url_maps', 'localizacao']), firstValue(row, ['endereco', 'endereco_completo'])]
    .filter(Boolean)
    .map(parseMapsCoords)
    .find(Boolean);
  if (maps) return { ...maps, fonte: 'maps' };

  return null;
}

function enderecoAlojamento(row) {
  const endereco = firstValue(row, ['endereco', 'endereco_completo', 'logradouro', 'localizacao']);
  if (String(endereco || '').startsWith('http')) return '';
  return [endereco, row._cidade || row.cidade, row._uf || row.uf, 'Brasil']
    .filter(Boolean)
    .join(', ');
}

async function geocodeAlojamento(row) {
  const direct = coordsAlojamento(row);
  if (direct) return direct;

  const endereco = enderecoAlojamento(row);
  if (!endereco || endereco.length < 8) return null;
  const cacheKey = normalizeText(endereco);
  if (geocodeCache.has(cacheKey)) return geocodeCache.get(cacheKey);

  const p = fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=br&q=${encodeURIComponent(endereco)}`)
    .then((r) => r.ok ? r.json() : [])
    .then((data) => {
      const first = Array.isArray(data) ? data[0] : null;
      const lat = num(first?.lat);
      const lng = num(first?.lon);
      return hasGeo(lat, lng) ? { lat, lng, fonte: 'endereco' } : null;
    })
    .catch(() => null);

  geocodeCache.set(cacheKey, p);
  return p;
}

async function carregarOsParaAlojamento(osIds) {
  if (!osIds.length) return new Map();
  const { data, error } = await supabase
    .from('operacional_os')
    .select('id,embarque,ponto_embarque_id,ponto1_latitude,ponto1_longitude')
    .in('id', osIds);
  if (error) throw error;

  const rows = data || [];
  const pontosIds = unique(rows.filter((o) => !hasGeo(o.ponto1_latitude, o.ponto1_longitude)).map((o) => o.ponto_embarque_id));
  const pontos = new Map();
  if (pontosIds.length) {
    const p = await supabase
      .from('operacional_pontos_embarque')
      .select('id,latitude,longitude,nome_local')
      .in('id', pontosIds);
    (p.data || []).forEach((item) => pontos.set(String(item.id), item));
  }

  return new Map(rows.map((os) => {
    const ponto = pontos.get(String(os.ponto_embarque_id));
    const lat = num(os.ponto1_latitude) ?? num(ponto?.latitude);
    const lng = num(os.ponto1_longitude) ?? num(ponto?.longitude);
    return [String(os.id), { ...os, lat, lng, uf: ufFromEmbarque(os.embarque) }];
  }));
}

async function ordenarSelectAlojamento(select, os, alojamentos) {
  if (!select || select.dataset.distanciaOrdenando === '1') return;
  if (!os || !hasGeo(os.lat, os.lng)) return;

  select.dataset.distanciaOrdenando = '1';
  try {
    const selected = select.value;
    const uf = normalizeUF(os.uf || ufFromEmbarque(os.embarque));
    const ativos = alojamentos || [];
    const porUf = uf ? ativos.filter((a) => normalizeUF(a._uf || a.uf) === uf) : [];
    const base = (porUf.length ? porUf : ativos).slice(0, 80);

    const enriquecidos = await Promise.all(base.map(async (a) => {
      const geo = await geocodeAlojamento(a);
      const km = geo ? kmEntre(geo.lat, geo.lng, os.lat, os.lng) : null;
      return { a, geo, km };
    }));

    enriquecidos.sort((x, y) => {
      const dx = x.km == null ? 999999 : x.km;
      const dy = y.km == null ? 999999 : y.km;
      return dx - dy
        || String(x.a._cidade || '').localeCompare(String(y.a._cidade || ''), 'pt-BR')
        || String(x.a._nome || '').localeCompare(String(y.a._nome || ''), 'pt-BR');
    });

    const opts = ['<option value="">Sugerir alojamento mais próximo…</option>'];
    enriquecidos.forEach(({ a, km }) => {
      const id = String(a.id);
      const dist = km != null ? ` · ${km} km` : ' · sem km';
      const cidadeUf = [a._cidade || a.cidade || '-', a._uf || a.uf || ''].filter(Boolean).join('/');
      opts.push(`<option value="${String(id).replaceAll('"', '&quot;')}">${String(`${a._nome} · ${cidadeUf}${dist}`).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')}</option>`);
    });
    select.innerHTML = opts.join('');

    const existeSelecionado = selected && enriquecidos.some(({ a }) => String(a.id) === String(selected));
    if (existeSelecionado) {
      select.value = selected;
    } else if (!selected && enriquecidos[0]?.a?.id) {
      select.value = String(enriquecidos[0].a.id);
      select.dataset.sugeridoDistancia = '1';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    }

    const wrap = select.closest('[data-estadia-destino]');
    let hint = wrap?.querySelector('[data-aloj-dist-hint]');
    if (wrap && !hint) {
      hint = document.createElement('small');
      hint.dataset.alojDistHint = '1';
      hint.style.cssText = 'display:block;margin-top:3px;color:#8ba79a;font-size:10.5px;font-weight:800';
      wrap.appendChild(hint);
    }
    if (hint) {
      const best = enriquecidos.find((x) => x.km != null);
      hint.textContent = best ? `Mais próximo do embarque: ${best.km} km` : 'Alojamentos sem coordenada/endereço geocodificado.';
    }
  } catch (error) {
    console.warn('[programacao] ordenar alojamentos por distância:', error);
  } finally {
    select.dataset.distanciaOrdenando = '0';
  }
}

function agendarOrdenacaoAlojamentos() {
  if (alojamentoSortScheduled) return;
  alojamentoSortScheduled = true;
  setTimeout(async () => {
    alojamentoSortScheduled = false;
    try {
      const selects = [...document.querySelectorAll('.peqb-os2 select[data-fld="alojamento_id"]')]
        .filter((s) => s.offsetParent !== null);
      if (!selects.length) return;

      const osIds = unique(selects.map((s) => s.closest('.peqb-os2')?.dataset.osId));
      const [osMap, alojamentos] = await Promise.all([
        carregarOsParaAlojamento(osIds),
        carregarAlojamentosDistancia(),
      ]);

      await Promise.all(selects.map((select) => {
        const osId = String(select.closest('.peqb-os2')?.dataset.osId || '');
        return ordenarSelectAlojamento(select, osMap.get(osId), alojamentos);
      }));
    } catch (error) {
      console.warn('[programacao] sugestão de alojamento:', error);
    }
  }, 120);
}

function iniciarAlojamentosPorDistancia() {
  const boot = () => {
    agendarOrdenacaoAlojamentos();
    new MutationObserver(agendarOrdenacaoAlojamentos).observe(document.body || document.documentElement, { childList: true, subtree: true });
    document.addEventListener('change', (event) => {
      if (event.target?.matches?.('select[data-fld="tipo_estadia"]')) agendarOrdenacaoAlojamentos();
    });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
}

if (!supabase[PATCH_FLAG]) {
  const originalFrom = supabase.from.bind(supabase);
  supabase.from = patchFrom(originalFrom);
  supabase.rpc = patchRpc(supabase.rpc.bind(supabase), originalFrom);
  iniciarAlojamentosPorDistancia();
  supabase[PATCH_FLAG] = true;
}
}

// --- Incorporado de programacao-regional-colaboradores-strict.js — Restringe fallback de colaboradores da regional a match exato de supervisão ---
{

// Programação: a RPC `programacao_colaboradores_supervisao` é a fonte
// principal e já retorna somente a regional solicitada. O módulo
// `programacao-equipe.js`, porém, também executa um fallback em
// `colaboradores_atuais` e aplica um score aproximado por palavras. Esse score
// fazia "MATO GROSSO MT2 - Leste" e "MATO GROSSO MT2 - Campo Verde"
// aparecerem em "MATO GROSSO MT2 - Sul", porque todas compartilham os tokens
// MATO/GROSSO/MT2.
//
// Este patch atua SOMENTE nessa consulta de fallback e mantém apenas a
// supervisão exatamente selecionada. A RPC permanece intacta.

const originalFrom = supabase.from.bind(supabase);

function clean(value) {
  return String(value ?? '').trim();
}

function norm(value) {
  return clean(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}

function selectedSupervisao() {
  const value = clean(document.querySelector('#progSup')?.value);
  const normalized = norm(value);
  if (!value || ['TODAS', 'TODOS', 'GERAL'].includes(normalized)) return '';
  return value;
}

function isRegionalFallbackQuery(columns) {
  const signature = norm(columns).replaceAll(' ', '');
  return [
    'CPF',
    'NOME',
    'CARGO',
    'COORDENACAO',
    'SUPERVISAO',
    'SITUACAO',
    'ATIVO',
    'DESLIGAMENTO',
  ].every((column) => signature.includes(column));
}

function wrapBuilder(builder, context) {
  return new Proxy(builder, {
    get(target, prop, receiver) {
      if (prop === 'then') {
        return (onFulfilled, onRejected) => Promise.resolve(target)
          .then((result) => {
            if (
              result?.error
              || !Array.isArray(result?.data)
              || !isRegionalFallbackQuery(context.columns)
            ) {
              return result;
            }

            const supervisao = selectedSupervisao();
            if (!supervisao) return result;

            const targetSupervisao = norm(supervisao);
            const filtered = result.data.filter(
              (row) => norm(row?.supervisao) === targetSupervisao
            );

            console.info('[programacao-regional] fallback exato aplicado', {
              supervisao,
              recebidos: result.data.length,
              liberados: filtered.length,
            });

            return { ...result, data: filtered };
          })
          .then(onFulfilled, onRejected);
      }

      const value = Reflect.get(target, prop, receiver);
      if (typeof value !== 'function') return value;

      return (...args) => {
        if (prop === 'select') context.columns = clean(args[0]);
        const next = value.apply(target, args);
        if (next && typeof next === 'object') return wrapBuilder(next, context);
        return next;
      };
    },
  });
}

supabase.from = function regionalExactFrom(table) {
  const builder = originalFrom(table);
  if (String(table) !== 'colaboradores_atuais') return builder;
  return wrapBuilder(builder, { columns: '' });
};

window.programacaoRegionalColaboradores = {
  fonte: 'programacao_colaboradores_supervisao',
  fallback: 'colaboradores_atuais-supervisao-exata',
  versao: '20260802-v5',
  async diagnostico(supervisao) {
    const alvo = clean(
      supervisao || document.querySelector('#progSup')?.value || ''
    );

    if (!alvo) {
      return {
        supervisao: '',
        quantidade: 0,
        erro: 'Selecione uma supervisão.',
      };
    }

    const { data, error } = await supabase.rpc(
      'programacao_colaboradores_supervisao',
      { p_supervisao: alvo }
    );

    return {
      supervisao: alvo,
      quantidade: Array.isArray(data) ? data.length : 0,
      erro: error?.message || null,
      colaboradores: data || [],
    };
  },
};

console.info(
  '[programacao-regional] RPC oficial + fallback por supervisão exata (v5).'
);
}

// --- Incorporado de programacao-grm-despesas-sync.js — Publica versão de despesas da programação para a fila do agente GRM ---
{
// Publica a versão de despesas da Programação para a fila do agente GRM.
// Gatilhos: 5 min sem edição, Salvar programação, troca de tela/contexto e
// fechamento da aba. As alterações de cada campo continuam sendo gravadas
// pelos módulos atuais; esta camada só fecha uma versão depois do período de
// estabilidade e não interfere no autosave existente.

const FUNCTION_NAME = 'grm-liberacao-despesas-publicar';
// Era 5 minutos — o gestor via a despesa "parada" no painel por até 5min
// antes de qualquer tentativa de chegar no GRM, e mais o ciclo do worker
// (~1min) por cima. Reduzido pra poucos segundos pra ficar "tempo real" sem
// tocar na parte que já protege contra concorrência (fila versionada por
// hash + claim atômico no worker, RECONCILIACAO/SALVAR_MANUAL forçando com
// force:true, o guard de publishing simultâneo e o dedup de 15s abaixo) —
// pedido do usuário, 15/09/2026. O reason continua 'INATIVIDADE_5_MIN' de
// propósito: é só o valor de auditoria que a Edge Function já aceita
// (VALID_REASONS), renomear exigiria deploy dela sem ganho nenhum.
const IDLE_MS = 4000;
const SETTLE_MS = 1200;

let idleTimer = null;
let dirty = false;
let publishing = false;
let cachedAccessToken = '';
let cachedContext = { ids: [], key: '' };
let lastPublishedKey = '';
let lastPublishedAt = 0;

function unique(values) {
  return [...new Set((values || []).map((value) => String(value || '').trim()).filter(Boolean))];
}

function getProgramacaoIds() {
  try {
    const idMap = window.__progGetProgramacaoIdMap?.();
    if (idMap && typeof idMap.values === 'function') {
      const values = unique([...idMap.values()]);
      if (values.length) return values;
    }
  } catch (_) {}

  try {
    return unique([window.__progGetProgramacaoId?.()]);
  } catch (_) {
    return [];
  }
}

function contextKey(ids = getProgramacaoIds()) {
  const date = document.getElementById('progDataRef')?.value || '';
  const regional = document.getElementById('progSup')?.value || '';
  return `${unique(ids).sort().join(',')}|${date}|${regional}`;
}

function refreshContextSnapshot() {
  const ids = getProgramacaoIds();
  if (ids.length) cachedContext = { ids, key: contextKey(ids) };
  return cachedContext;
}

async function refreshToken() {
  try {
    const { data } = await supabase.auth.getSession();
    cachedAccessToken = data?.session?.access_token || cachedAccessToken || '';
  } catch (_) {}
  return cachedAccessToken;
}

function shouldMarkDirty(target, eventType) {
  if (!(target instanceof Element)) return false;
  // O drawer de Lista de OS é montado diretamente no <body>, fora de
  // #pageContent. As ações mais importantes (ATENDER e vincular colaborador)
  // acontecem nele e antes não armavam a publicação após 5 minutos.
  if (!target.closest('#pageContent, #pldDrawer')) return false;
  if (target.closest('#progSearch, #progGerarPdf, #progLoadContext')) return false;
  if (target.closest('a[href]')) return false;

  if (eventType === 'input' || eventType === 'change') return true;
  if (eventType !== 'click') return false;

  return !!target.closest([
    'button[data-status]',
    'button[data-action]',
    'button[data-ref]',
    'button[data-add-extra]',
    'button[data-remove]',
    'button[data-confirm]',
    'button[data-tipo]',
    '.peqd-chip',
    '.peqb-row-btn',
    '.prog-mini-btn',
    '[data-acao-status]',
    '[data-confirmar-candidato]',
    '[data-add-colab-confirm]',
    '[data-add-frota-confirm]',
    '[data-remover-colab]',
    '[data-disponivel]',
  ].join(','));
}

function scheduleIdlePublish() {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    // settleMs padrão (não 0 como antes) — com IDLE_MS na casa dos segundos,
    // ainda vale a margem de segurança pro autosave do campo (debounce de
    // 450ms) terminar antes da Edge Function ler o banco.
    publishVersion('INATIVIDADE_5_MIN', { settleMs: SETTLE_MS }).catch((error) => {
      console.warn('[programacao-grm-despesas] publicação por inatividade falhou:', error);
    });
  }, IDLE_MS);
}

function markDirty() {
  const ctx = refreshContextSnapshot();
  if (!ctx.ids.length) return;
  dirty = true;
  scheduleIdlePublish();
}

async function publishVersion(reason, { ids, settleMs = SETTLE_MS, force = false } = {}) {
  const selectedIds = unique(ids?.length ? ids : refreshContextSnapshot().ids);
  if (!selectedIds.length) return null;
  if (!force && !dirty) return null;
  if (publishing) return null;

  const key = `${contextKey(selectedIds)}|${reason}`;
  if (!force && key === lastPublishedKey && Date.now() - lastPublishedAt < 15000) return null;

  publishing = true;
  clearTimeout(idleTimer);
  try {
    const { data, error } = await supabase.functions.invoke(FUNCTION_NAME, {
      body: {
        programacaoIds: selectedIds,
        motivo: reason,
        settleMs,
      },
    });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    dirty = false;
    lastPublishedKey = key;
    lastPublishedAt = Date.now();
    window.dispatchEvent(new CustomEvent('programacao:grm-despesas-publicada', { detail: data }));
    console.info('[programacao-grm-despesas] versão publicada:', data);
    return data;
  } finally {
    publishing = false;
  }
}

async function publishKeepalive(reason, ids) {
  const selectedIds = unique(ids?.length ? ids : refreshContextSnapshot().ids);
  if (!dirty || !selectedIds.length) return;

  const token = cachedAccessToken || await refreshToken();
  if (!token) return;

  // O request é disparado antes de a página trocar/fechar. keepalive permite ao
  // navegador concluir a chamada mesmo depois do documento ser descarregado.
  dirty = false;
  clearTimeout(idleTimer);
  try {
    fetch(`${SUPABASE_URL}/functions/v1/${FUNCTION_NAME}`, {
      method: 'POST',
      keepalive: true,
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        programacaoIds: selectedIds,
        motivo: reason,
        settleMs: SETTLE_MS,
      }),
    }).catch((error) => console.warn('[programacao-grm-despesas] keepalive falhou:', error));
  } catch (error) {
    console.warn('[programacao-grm-despesas] não foi possível iniciar o keepalive:', error);
  }
}

function bind() {
  refreshToken();
  supabase.auth.onAuthStateChange((_event, session) => {
    cachedAccessToken = session?.access_token || '';
  });

  // Aguarda o núcleo de Programação expor os getters do contexto.
  const contextPoll = setInterval(() => {
    if (typeof window.__progGetProgramacaoId !== 'function') return;
    refreshContextSnapshot();
    clearInterval(contextPoll);
  }, 250);
  setTimeout(() => clearInterval(contextPoll), 30000);

  document.addEventListener('input', (event) => {
    if (shouldMarkDirty(event.target, 'input')) markDirty();
  }, true);
  document.addEventListener('change', (event) => {
    if (shouldMarkDirty(event.target, 'change')) markDirty();
  }, true);
  document.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;

    // Capture roda antes do listener do core: publica o contexto anterior sem
    // bloquear a troca de supervisão/data.
    if (target.closest('#progLoadContext')) {
      const previous = { ...cachedContext, ids: [...cachedContext.ids] };
      publishKeepalive('TROCA_DE_TELA', previous.ids);
      setTimeout(refreshContextSnapshot, 1800);
      return;
    }

    if (target.closest('#progSaveProgramacao')) {
      markDirty();
      setTimeout(() => {
        publishVersion('SALVAR_MANUAL', { settleMs: 0, force: true }).catch((error) => {
          console.warn('[programacao-grm-despesas] publicação após salvar falhou:', error);
        });
      }, 1600);
      return;
    }

    const anchor = target.closest('a[href]');
    if (anchor) {
      try {
        const url = new URL(anchor.href, window.location.href);
        if (url.origin === window.location.origin && url.href !== window.location.href) {
          publishKeepalive('TROCA_DE_TELA', cachedContext.ids);
        }
      } catch (_) {}
      return;
    }

    if (shouldMarkDirty(target, 'click')) markDirty();
  }, true);

  window.addEventListener('pagehide', () => {
    publishKeepalive('FECHAMENTO_JANELA', cachedContext.ids);
  });
  window.addEventListener('beforeunload', () => {
    publishKeepalive('FECHAMENTO_JANELA', cachedContext.ids);
  });

  window.__publicarGrmLiberacaoDespesas = (motivo = 'SALVAR_MANUAL') =>
    publishVersion(motivo, { force: true, settleMs: 0 });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind, { once: true });
else bind();
}

// --- Incorporado de programacao-gestor-ajustes.js — Botões de etapa (O.S./Sem O.S.) e combo de supervisão pesquisável ---
{
// Programação Gestor — cria os 3 botões de etapa (1 Situação da O.S., 2 Equipe
// + Mapa, 3 Despesas) e o combo de supervisão pesquisável. A renderização das
// 3 abas em si (todas de uma vez, sem reload ao trocar de aba) é feita por
// programacao-gestor-fluxo-avancado.js — este arquivo NÃO escreve mais em
// #progList sozinho (fazia isso antes e entrava em corrida com o fluxo novo,
// sobrescrevendo o wrapper das 3 abas e deixando os botões 2/3 mortos).

let currentUiStep = '1';
let supDropdownEl = null;
let supComboState = { input: null, onSelect: null };

// 2026-07-21: tela única "lista + painel lateral" (programacao-lista-drawer.js)
// substitui as antigas 4 etapas — Situação/Equipe+Mapa/Despesas viraram uma
// coisa só (a lista de O.S. + o painel que abre ao clicar). Só "Sem O.S."
// continua separado, por não ser sobre uma O.S. específica. "Recusas"
// (despesas recusadas pela conferência) existiu como 3ª aba de 30/07 a
// 09/09/2026 — removida por não ter mais uso (pedido do usuário); o módulo
// programacao-recusas.js e o painel '3' em programacao-gestor-fluxo-
// avancado.js foram removidos junto.
const STEP_LABELS = {
  '1': { label: 'Programação de O.S.', title: 'O.S.' },
  '2': { label: 'Colaboradores sem O.S.', title: 'Sem O.S.' },
};

function debounce(fn, wait) {
  let timer;
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

function normalize(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .trim();
}

function waitForElement(selector, timeout = 12000) {
  const found = document.querySelector(selector);
  if (found) return Promise.resolve(found);
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const observer = new MutationObserver(() => {
      const el = document.querySelector(selector);
      if (el) {
        observer.disconnect();
        resolve(el);
      } else if (Date.now() - started > timeout) {
        observer.disconnect();
        reject(new Error(`Elemento não encontrado: ${selector}`));
      }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  });
}

function injectGestorAjustesStyles() {
  if (document.getElementById('programacaoGestorAjustesStyles')) return;
  const style = document.createElement('style');
  style.id = 'programacaoGestorAjustesStyles';
  style.textContent = `
    .prog-toolbar{position:relative!important;z-index:9000!important;overflow:visible!important}
    .prog-toolbar-row{position:relative!important;z-index:9001!important;overflow:visible!important}
    .prog-tfield-sup{flex:1 1 320px!important;max-width:520px!important;position:relative!important;z-index:9010!important;overflow:visible!important}
    .prog-tfield-sup select,#progSup{position:relative!important;z-index:9020!important;min-width:320px!important;background:#020617!important;background-color:#020617!important;color:#f8fafc!important;border-color:rgba(52,211,153,.45)!important;opacity:1!important;color-scheme:dark!important;box-shadow:0 10px 26px rgba(0,0,0,.42)!important;backdrop-filter:none!important;-webkit-backdrop-filter:none!important}
    .prog-tfield-sup select:focus,#progSup:focus{background:#020617!important;background-color:#020617!important;color:#f8fafc!important;outline:2px solid rgba(52,211,153,.35)!important;outline-offset:1px!important}
    #progSup option,#progSup optgroup{background:#020617!important;background-color:#020617!important;color:#f8fafc!important;opacity:1!important;text-shadow:none!important}
    #progSup option:checked,#progSup option:hover{background:#064e3b!important;background-color:#064e3b!important;color:#ffffff!important}
    #progSteps,#progSteps .stepbtn{position:relative!important;z-index:0!important}
    #progCtxFeedback:empty{display:none!important}
    .prog-toolbar:has(#progSup:focus) .prog-toolbar-row-steps{opacity:0!important;visibility:hidden!important;pointer-events:none!important}
    .prog-list-card,#progList,#peqbOsList{position:relative;z-index:1;overflow:visible!important}
    .prog-os-lazy-card{border:1px dashed rgba(52,211,153,.22);border-radius:18px;padding:18px;background:rgba(15,23,42,.18);color:#94a3b8;display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap}
    .prog-os-lazy-card.is-loading{justify-content:flex-start}
    .prog-os-lazy-card strong{display:block;color:#f8fafc;margin-bottom:4px;font-size:14px}
    .prog-os-lazy-card p{margin:0;font-size:13px;line-height:1.35}
    .prog-os-lazy-card .btn{min-height:38px}
    .prog-spinner{width:28px;height:28px;border-radius:999px;border:3px solid rgba(111,208,165,.18);border-top-color:#6fd0a5;flex:0 0 auto;animation:progSpin .75s linear infinite}
    @keyframes progSpin{to{transform:rotate(360deg)}}
    .prog-sup-native-hidden{position:absolute!important;width:0!important;height:0!important;padding:0!important;border:0!important;opacity:0!important;pointer-events:none!important;overflow:hidden!important}
    /* A regra acima (classe) perdia pra #progSup{...} logo abaixo (seletor
       por ID, especificidade maior — ID sempre vence empate de !important,
       não importa a ordem de declaração) em 3 propriedades: position virava
       relative (não absolute), min-width:320px sobrepunha o width:0, e
       opacity:1 sobrepunha o opacity:0. Resultado: o select "escondido"
       nunca saiu do fluxo — continuava ocupando ~320px reais na linha
       (embora opacity:1 devesse deixá-lo visível também, um bug próprio),
       disputando espaço via flex-shrink com o combo visível (progSupCombo)
       logo ao lado, dentro do wrapper agora comprimido a 260px (cabeçalho
       numa linha só, 21/07) — essa disputa que estava empurrando o combo pra
       sobrepor o campo Data. ID+classe aqui garante especificidade maior que
       o #progSup sozinho, então SEMPRE vence, não importa a ordem dos
       estilos injetados. */
    #progSup.prog-sup-native-hidden{position:absolute!important;width:0!important;height:0!important;min-width:0!important;min-height:0!important;margin:0!important;opacity:0!important}
    /* min-width:320px!important daqui (pré-existente, 16/07) brigava com o
       max-width:260px!important do wrapper .prog-tfield-sup (compressão do
       cabeçalho numa linha só, ver programacao-toolbar.css, 21/07):
       como o wrapper tem overflow:visible, o input forçado a 320px vazava
       ~60-120px pra fora da própria caixa e pintava por cima do campo Data ao
       lado (reportado pela usuária com print, sobreposição real confirmada em
       harness por getBoundingClientRect). width:100% já basta — o input deve
       só preencher o wrapper, nunca forçar um piso maior que ele. */
    .prog-sup-combo-input{position:relative!important;z-index:9020!important;width:100%;box-sizing:border-box;padding:9px 12px;background:#020617!important;color:#f8fafc!important;border:1px solid rgba(52,211,153,.45)!important;border-radius:10px;font-size:13.5px;outline:none}
    .prog-sup-combo-input:focus{outline:2px solid rgba(52,211,153,.35)!important;outline-offset:1px!important}
    .prog-sup-combo-portal{position:fixed;background:#020617;border:1px solid rgba(52,211,153,.35);border-radius:10px;max-height:280px;overflow-y:auto;z-index:99999;box-shadow:0 14px 38px rgba(0,0,0,.55);opacity:1;backdrop-filter:none!important;-webkit-backdrop-filter:none!important}
    .prog-sup-combo-item{padding:9px 12px;cursor:pointer;font-size:13.5px;color:#f8fafc;background:#020617}
    .prog-sup-combo-item:hover,.prog-sup-combo-item.active{background:#064e3b;color:#ffffff}
    .prog-sup-combo-empty{padding:9px 12px;font-size:13px;color:#94a3b8;font-style:italic;background:#020617}
    @media(max-width:900px){
      .prog-tfield-sup select,#progSup,.prog-sup-combo-input{min-width:0!important}
      .prog-os-lazy-card{align-items:stretch}
      .prog-os-lazy-card .btn{width:100%;justify-content:center}
    }
    @media(max-width:720px){#progSteps .stepbtn-label{display:none}}
  `;
  document.head.appendChild(style);
}

function hideCoreControls() {
  // "Salvar programação" (progSaveProgramacao) fica visível de propósito: o
  // autosave por campo continua rodando, mas o gestor pediu um botão de
  // segurança pra ter a associação visual de "salvei" — antes ele ficava
  // escondido aqui pra todo mundo, sem nenhuma confirmação manual no lugar.
  ['progSearchWrap', 'progOsStatusTopWrap'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
}

function setActiveUiStep(step) {
  document.querySelectorAll('#progSteps .stepbtn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.uiStep === step);
  });
  document.body.classList.toggle('prog-step-a-os', false);
}

// Placeholder mostrado só antes do primeiro "Carregar" (ou depois de trocar a
// supervisão, antes de recarregar). Uma vez que o fluxo novo monta as 3 abas
// em #pgcPane1/2/3, os cliques nos botões de etapa são interceptados por
// programacao-gestor-fluxo-avancado.js antes de chegar aqui — este texto só
// aparece se o usuário ainda não clicou em Carregar.
function renderIdle() {
  const list = document.getElementById('progList');
  const feedback = document.getElementById('progCtxFeedback');
  const info = STEP_LABELS[currentUiStep] || STEP_LABELS['1'];
  if (feedback) {
    feedback.className = 'feedback mt-16 prog-feedback-ok';
    feedback.textContent = '';
  }
  if (!list) return;
  const sup = document.getElementById('progSup')?.value || '';
  list.innerHTML = `
    <div class="prog-section-title">
      <h4>${info.title}</h4>
      <span class="badge">Etapa ${currentUiStep}</span>
    </div>
    <div class="prog-os-lazy-card">
      <div>
        <strong>Tela pronta para carregar</strong>
        <p>${sup ? `Supervisão selecionada: ${escapeHtml(sup)}.` : 'Selecione a supervisão e a data no topo.'} Use o botão Carregar no topo para montar a tela final.</p>
      </div>
    </div>
  `;
}

// O núcleo (programacao.js) tem state.step = 'A' por padrão e, quando termina
// de carregar o contexto sozinho, escreve a Disponibilidade nativa em
// #progList — mesmo depois do fluxo novo (programacao-gestor-fluxo-avancado.js)
// já ter montado o wrapper #pgcTabsShell com as 3 abas. Sem esse guard, essa
// Disponibilidade nativa aparece por cima das abas. Ao contrário da versão
// antiga deste guard, NÃO renderizamos nada aqui: só detectamos o vazamento e
// pedimos pro fluxo novo remontar (window.__pgcProgramacaoReload, exposto por
// programacao-gestor-fluxo-avancado.js) — assim não competimos pelo #progList.
// Checagem barata (querySelector, sem serializar o textContent da árvore
// inteira toda hora): .colab-name/.colab-meta/.prog-status só existem no
// colabCell() do núcleo (programacao.js), nunca nos templates das 3 abas.
function listShowsCoreDisponibilidade() {
  const list = document.getElementById('progList');
  if (!list) return false;
  if (list.querySelector('#pgcTabsShell')) return false;
  return !!list.querySelector('.colab-name, .colab-meta, .prog-status, .table-empty');
}

function attachProgListGuard() {
  const list = document.getElementById('progList');
  if (!list || list.dataset.gestorGuard === '1') return;
  list.dataset.gestorGuard = '1';
  const guard = new MutationObserver(() => {
    if (!listShowsCoreDisponibilidade()) return;
    window.__pgcProgramacaoReload?.();
  });
  guard.observe(list, { childList: true });
}

// Defesa definitiva: os guards acima são REATIVOS (detectam o vazamento
// depois que ele já apareceu e pedem pro fluxo novo remontar) — dependem de
// timing de MutationObserver/polling que, na prática, às vezes não pega a
// tempo e o usuário chega a ver a Disponibilidade nativa por um bom tempo.
// Em vez de corrigir depois, intercepta a ESCRITA em si: sobrescreve o
// setter nativo de innerHTML só em #progList e ignora silenciosamente
// qualquer valor que pareça a Disponibilidade nativa (tem .colab-name/
// .colab-meta/.prog-status, exclusivos de colabCell() no núcleo) e não seja
// o wrapper das 3 abas nem o placeholder daqui. Todo o resto passa normal.
function installProgListWriteGuard(list) {
  if (!list || list.dataset.gestorWriteGuard === '1') return;
  list.dataset.gestorWriteGuard = '1';
  const descriptor = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML')
    || Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'innerHTML');
  const nativeSet = descriptor?.set;
  const nativeGet = descriptor?.get;
  if (!nativeSet || !nativeGet) return;
  Object.defineProperty(list, 'innerHTML', {
    configurable: true,
    get() { return nativeGet.call(this); },
    set(html) {
      if (typeof html === 'string' && !html.includes('id="pgcTabsShell"') && /colab-name|colab-meta|prog-status|table-empty/.test(html)) {
        console.warn('[gestor-ajustes] bloqueada escrita da Disponibilidade nativa em #progList');
        return;
      }
      nativeSet.call(this, html);
    },
  });
}

// Rede de segurança: o núcleo também escuta o Realtime de programacao_colaboradores
// (mesma tabela que os vínculos do mapa gravam) e chama sua própria renderRows()
// quando essa tabela muda — não só ao carregar o contexto. Isso pode clobbrar
// #progList bem depois do attachProgListGuard já ter sido "satisfeito" uma vez, e
// depende de detalhes de timing do MutationObserver que às vezes falham. Um
// polling simples (a cada 1.2s) é o jeito mais confiável de nunca deixar a
// Disponibilidade nativa visível por muito tempo, custando quase nada.
let ultimoReloadVazamento = 0;
function checarVazamentoPeriodico() {
  if (!listShowsCoreDisponibilidade()) return;
  const agora = Date.now();
  if (agora - ultimoReloadVazamento < 2000) return;
  ultimoReloadVazamento = agora;
  window.__pgcProgramacaoReload?.();
}
setInterval(checarVazamentoPeriodico, 1200);

function configureSteps() {
  const stepsWrap = document.getElementById('progSteps');
  if (!stepsWrap) return;

  const existing = [...stepsWrap.querySelectorAll('.stepbtn')];
  const layout = [
    { ui: '1', label: STEP_LABELS['1'].title },
    { ui: '2', label: STEP_LABELS['2'].title },
  ];

  layout.forEach((step, index) => {
    let btn = existing[index];
    if (!btn) {
      btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'stepbtn';
      stepsWrap.appendChild(btn);
    }
    btn.dataset.uiStep = step.ui;
    btn.innerHTML = `<span class="stepbtn-letter">${index + 1}</span><span class="stepbtn-label"> · ${step.label}</span>`;
  });
  existing.slice(layout.length).forEach((btn) => btn.remove());

  if (stepsWrap.dataset.gestorAjustado === '1') return;
  stepsWrap.dataset.gestorAjustado = '1';
  // Fallback: só roda se programacao-gestor-fluxo-avancado.js ainda não tiver
  // as abas montadas (state.panes null lá) — nesse caso ele deixa o clique
  // passar em vez de consumir com stopImmediatePropagation.
  stepsWrap.addEventListener('click', (event) => {
    const btn = event.target.closest('.stepbtn');
    if (!btn) return;
    event.preventDefault();
    currentUiStep = btn.dataset.uiStep;
    setActiveUiStep(currentUiStep);
    hideCoreControls();
    renderIdle();
  }, true);
}

function ensureSupDropdown() {
  if (supDropdownEl) return supDropdownEl;
  supDropdownEl = document.createElement('div');
  supDropdownEl.className = 'prog-sup-combo-portal';
  supDropdownEl.hidden = true;
  document.body.appendChild(supDropdownEl);

  document.addEventListener('mousedown', (event) => {
    if (supDropdownEl.hidden) return;
    const item = event.target.closest('.prog-sup-combo-item');
    if (item && supDropdownEl.contains(item)) {
      event.preventDefault();
      const { onSelect } = supComboState;
      const value = item.dataset.value;
      hideSupDropdown();
      if (onSelect) onSelect(value);
      return;
    }
    if (!supDropdownEl.contains(event.target) && event.target !== supComboState.input) {
      hideSupDropdown();
    }
  });

  const reposition = () => { if (supDropdownEl && !supDropdownEl.hidden && supComboState.input) positionSupDropdown(supDropdownEl, supComboState.input); };
  window.addEventListener('scroll', reposition, true);
  window.addEventListener('resize', reposition);
  return supDropdownEl;
}

function positionSupDropdown(dd, input) {
  const rect = input.getBoundingClientRect();
  dd.style.left = `${rect.left}px`;
  dd.style.top = `${rect.bottom + 4}px`;
  dd.style.width = `${rect.width}px`;
}

function hideSupDropdown() {
  if (supDropdownEl) supDropdownEl.hidden = true;
  supComboState = { input: null, onSelect: null };
}

function abrirDropdownSupervisao(input, nativeSelect, query) {
  const dd = ensureSupDropdown();
  supComboState = {
    input,
    onSelect: (value) => {
      nativeSelect.value = value;
      nativeSelect.dispatchEvent(new Event('change', { bubbles: true }));
      syncSupComboDisplay(nativeSelect, true);
      renderIdle();
    },
  };
  positionSupDropdown(dd, input);
  const norm = normalize(query);
  const options = [...nativeSelect.options]
    .filter((opt) => opt.value)
    .filter((opt) => !norm || normalize(opt.textContent).includes(norm));
  dd.hidden = false;
  dd.innerHTML = options.length
    ? options.map((opt) => `<div class="prog-sup-combo-item ${opt.value === nativeSelect.value ? 'active' : ''}" data-value="${escapeHtml(opt.value)}">${escapeHtml(opt.textContent)}</div>`).join('')
    : '<div class="prog-sup-combo-empty">Nenhuma supervisão encontrada.</div>';
}

function syncSupComboDisplay(nativeSelect, force = false) {
  const input = document.getElementById('progSupCombo');
  if (!input || (!force && document.activeElement === input)) return;
  const opt = nativeSelect.options[nativeSelect.selectedIndex];
  input.value = opt && opt.value ? opt.textContent : '';
}

function ensureSupCombo() {
  const nativeSelect = document.getElementById('progSup');
  if (!nativeSelect) return;

  // Defesa contra re-render duplicado do toolbar (ex.: initProtectedPage sendo
  // acionado 2x, uma via navegação suave e outra pelo boot interno do módulo):
  // se sobrar mais de um <select id="progSup"> ou mais de um combo já montado
  // no mesmo wrapper, mantém só o par oficial (o select atual + seu combo) e
  // remove o resto — evita a barra de Supervisão aparecer duplicada.
  const wrap = nativeSelect.closest('.prog-tfield-sup');
  if (wrap) {
    wrap.querySelectorAll('select#progSup').forEach((sel) => { if (sel !== nativeSelect) sel.remove(); });
    wrap.querySelectorAll('#progSupCombo').forEach((el, index) => { if (index > 0) el.remove(); });
  }

  let input = document.getElementById('progSupCombo');
  if (!input) {
    nativeSelect.classList.add('prog-sup-native-hidden');
    nativeSelect.tabIndex = -1;
    input = document.createElement('input');
    input.type = 'text';
    input.id = 'progSupCombo';
    input.className = 'prog-sup-combo-input';
    input.placeholder = 'Selecione a supervisão...';
    input.autocomplete = 'off';
    input.spellcheck = false;
    nativeSelect.insertAdjacentElement('beforebegin', input);

    input.addEventListener('focus', () => {
      input.select();
      abrirDropdownSupervisao(input, nativeSelect, '');
    });
    input.addEventListener('input', () => abrirDropdownSupervisao(input, nativeSelect, input.value));
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        hideSupDropdown();
        input.blur();
      }
      if (event.key === 'Enter') {
        const active = supDropdownEl?.querySelector('.prog-sup-combo-item.active') || supDropdownEl?.querySelector('.prog-sup-combo-item');
        if (active) {
          event.preventDefault();
          const value = active.dataset.value;
          hideSupDropdown();
          nativeSelect.value = value;
          nativeSelect.dispatchEvent(new Event('change', { bubbles: true }));
          syncSupComboDisplay(nativeSelect, true);
          input.blur();
          renderIdle();
        }
      }
    });
  }
  syncSupComboDisplay(nativeSelect);
  if (nativeSelect.dataset.comboBound !== '1') {
    nativeSelect.dataset.comboBound = '1';
    nativeSelect.addEventListener('change', () => {
      syncSupComboDisplay(nativeSelect, true);
      renderIdle();
    });
  }
}

function boot() {
  injectGestorAjustesStyles();
  waitForElement('#progSteps').then(() => {
    configureSteps();
    hideCoreControls();
    ensureSupCombo();
    attachProgListGuard();
    installProgListWriteGuard(document.getElementById('progList'));
    const sup = document.getElementById('progSup');
    if (sup) {
      const obsSup = new MutationObserver(() => ensureSupCombo());
      obsSup.observe(sup, { childList: true, subtree: true, attributes: true });
    }
    setActiveUiStep('1');
    renderIdle();
  }).catch(() => {});
}

const observer = new MutationObserver(debounce(() => {
  if (!document.getElementById('progSteps')) return;
  configureSteps();
  hideCoreControls();
  ensureSupCombo();
  attachProgListGuard();
  installProgListWriteGuard(document.getElementById('progList'));
}, 160));
observer.observe(document.documentElement, { childList: true, subtree: true });

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
else boot();
}

// --- Incorporado de programacao-gestor-fluxo-avancado.js — Monta as 2 abas (O.S. via renderProgramacaoListaDrawer, Sem O.S. via renderProgramacaoSemOs) sem reload ao trocar ---
{

// Programação Gestor (2026-07-21, "lista + painel lateral"): o botão Carregar
// monta 2 abas — O.S. (lista+drawer, programacao-lista-drawer.js) e Sem O.S.
// (renderProgramacaoSemOs, mantido à parte porque não é sobre uma O.S.
// específica, não cabe no modelo de painel lateral). Substitui o antigo
// sistema de 4 abas (Situação/Equipe+Mapa/Despesas/Sem O.S.) — ver
// [[programacao-redesign]] na memória do projeto pro histórico completo.
// O mapa do gestor e o drag-and-drop de colaboradores/motoristas eram
// exclusivos da antiga Aba 2 "Equipe + Mapa", que não existe mais nesta
// tela — removidos em 2026-07-22 (nunca mais eram acionados:
// scheduleEquipeAugment dependia de #peqbOsList, só criado pela antiga
// renderProgramacaoEquipe, também removida).

const state = {
  activeStep: '1',
  renderingAll: false,
  renderToken: 0,
  panes: null,
  lastOptionsKey: '',
};

function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}


function debounce(fn, wait = 180) {
  let t = null;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

function injectStyles() {
  if (document.getElementById('programacaoGestorFluxoAvancadoStyles')) return;
  const style = document.createElement('style');
  style.id = 'programacaoGestorFluxoAvancadoStyles';
  style.textContent = `
    .pgc-tabs-shell{display:block;width:100%}
    .pgc-tab-pane[hidden]{display:none!important}
    .pgc-tab-pane.pgc-prelayout{position:absolute!important;left:-100000px!important;top:0!important;width:min(1400px,100vw)!important;display:block!important;visibility:hidden!important;pointer-events:none!important;contain:layout style paint!important}
    .pgc-loading-card{border:1px dashed rgba(52,211,153,.22);border-radius:18px;padding:18px;background:rgba(15,23,42,.18);color:#94a3b8;display:flex;gap:12px;align-items:center}
    .pgc-spinner{width:26px;height:26px;border-radius:999px;border:3px solid rgba(111,208,165,.18);border-top-color:#6fd0a5;animation:pgcSpin .75s linear infinite;flex:0 0 auto}
    @keyframes pgcSpin{to{transform:rotate(360deg)}}

    /* Aba 1: OS em linha, sem cara de card pesado */
    #pgcPane1 .peqb-os-list{gap:6px;max-height:none;overflow:visible;padding-right:0}
    #pgcPane1 .peqs-row{border-radius:10px!important;padding:0!important;background:rgba(2,6,23,.20)!important;border-color:rgba(52,211,153,.12)!important}
    #pgcPane1 .peqs-row .peqb-os2-left{display:grid;grid-template-columns:minmax(120px,.8fr) minmax(220px,1.6fr) 120px 105px auto;gap:8px;align-items:center;padding:8px 10px!important;border:0!important}
    #pgcPane1 .peqs-row .peqb-os2-kpis{display:contents!important}
    #pgcPane1 .peqs-row .peqb-os2-kpi{padding:5px 8px!important;border-radius:8px!important;background:rgba(15,23,42,.42)!important;margin:0!important;min-width:0}
    #pgcPane1 .peqs-row .peqb-os2-kpi span{font-size:8.5px!important;color:#7d8aa3!important}
    #pgcPane1 .peqs-row .peqb-os2-kpi strong{font-size:11.5px!important;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    #pgcPane1 .peqs-row .peqb-os2-tagsrow{margin:0!important;justify-content:flex-end}
    #pgcPane1 .peqs-row .peqb-status-strip{margin:0!important;flex-wrap:nowrap}
    #pgcPane1 .peqs-row .peqb-st{height:28px!important;min-width:30px!important;font-size:11px!important}
    @media(max-width:980px){#pgcPane1 .peqs-row .peqb-os2-left{grid-template-columns:1fr 1fr}#pgcPane1 .peqs-row .peqb-os2-tagsrow{justify-content:flex-start}}
    @media(max-width:720px){#pgcPane1 .peqs-row .peqb-os2-left{display:block}#pgcPane1 .peqs-row .peqb-os2-kpis{display:grid!important;grid-template-columns:1fr 1fr}#pgcPane1 .peqs-row .peqb-os2-tagsrow{margin-top:8px!important}}

    /* Aba 2: os 4 KPIs da O.S. (Cliente/Local/Remanescente/OS) numa linha só
       (OS/Rem estreitos, Cliente/Local largos) — o card virou uma coluna só
       (ver .peqb-row.peqb-os2 em programacao-equipe.js), então sobra largura
       de sobra pra caber tudo numa linha em vez do 2x2/flex-wrap de antes
       (pedido do usuário, 2026-07-17). Só reposiciona visualmente
       (grid-column) — a ordem no HTML continua a mesma de sempre, então a
       Aba 1 (#pgcPane1, que trata esses 4 itens como "contents" dentro do
       próprio grid dela) não é afetada. */
    #pgcPane2 .peqb-os2-kpis{display:grid;grid-template-columns:minmax(60px,74px) minmax(220px,1.5fr) minmax(220px,1.5fr) minmax(64px,84px);gap:0}
    /* Tiles com borda própria viravam "caixa dentro de caixa" ao lado uma da
       outra — troca por uma única linha com divisores finos entre colunas
       (pedido do usuário, 2026-07-17: "menos poluído"). */
    #pgcPane2 .peqb-os2-kpi{min-width:0;flex:none;border:0!important;background:transparent!important;border-radius:0!important;padding:0 14px!important}
    #pgcPane2 .peqb-os2-kpi:nth-child(4){padding-left:0!important}
    #pgcPane2 .peqb-os2-kpi:nth-child(1),#pgcPane2 .peqb-os2-kpi:nth-child(2),#pgcPane2 .peqb-os2-kpi:nth-child(3){border-left:1px solid rgba(148,163,184,.14)!important}
    #pgcPane2 .peqb-os2-kpi span{font-size:8.5px!important;color:#7fa596!important}
    #pgcPane2 .peqb-os2-kpi strong{font-weight:750!important}
    /* grid-row:1 explícito em todo mundo — sem isso, o cursor de auto-placement
       do grid manda a OS (coluna 1, mas é o 4º item no HTML) pra uma 2ª linha
       só porque a coluna dela é "menor" que a do item anterior (regra do
       algoritmo de auto-placement pra layout "sparse"). */
    #pgcPane2 .peqb-os2-kpi:nth-child(1){grid-column:2;grid-row:1} /* Cliente */
    #pgcPane2 .peqb-os2-kpi:nth-child(2){grid-column:3;grid-row:1} /* Local de embarque */
    #pgcPane2 .peqb-os2-kpi:nth-child(3){grid-column:4;grid-row:1} /* Remanescente */
    #pgcPane2 .peqb-os2-kpi:nth-child(4){grid-column:1;grid-row:1} /* OS */
    @media(max-width:760px){
      #pgcPane2 .peqb-os2-kpis{grid-template-columns:1fr 1fr}
      #pgcPane2 .peqb-os2-kpi:nth-child(1),#pgcPane2 .peqb-os2-kpi:nth-child(2),#pgcPane2 .peqb-os2-kpi:nth-child(3),#pgcPane2 .peqb-os2-kpi:nth-child(4){grid-column:auto;grid-row:auto}
    }
    /* Local de embarque só tem 2 linhas de verdade (UF+cidade / local) — sem
       isso, cada parte quebrava palavra por palavra quando a coluna era
       estreita, virando 3-4 linhas em vez de 2 (pedido do usuário,
       2026-07-17). Trunca com "..." em vez de quebrar. */
    #pgcPane2 .peqb-os2-kpi .peqb-os2-emb-l1,#pgcPane2 .peqb-os2-kpi .peqb-os2-emb-l2{display:block!important;width:100%!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important}
    #pgcPane2 .peqb-os2-kpi .peqb-os2-uf{display:inline!important;white-space:nowrap!important}
    #pgcPane2 .peqb-os2-kpi strong br{display:none!important}

    /* Aba 2: lista arrastável + OS — uma janela só (pool + cards de O.S.) com
       rolagem própria, pra não empurrar o mapa (que fica logo abaixo) pra
       baixo conforme a quantidade de O.S. (pedido do usuário, 2026-07-17). */
    .pgc-equipe-split{display:grid;grid-template-columns:minmax(250px,320px) minmax(360px,1fr);gap:12px;align-items:start;max-height:min(560px,calc(100vh - 260px));overflow-y:auto;padding-right:6px;border:1px solid rgba(148,163,184,.14);border-radius:16px}
    @media(max-width:1080px){.pgc-equipe-split{grid-template-columns:1fr}.pgc-colab-pool{position:relative!important;top:auto!important;max-height:none!important}}
    .pgc-colab-pool{position:sticky;top:0;max-height:min(560px,calc(100vh - 260px));overflow:auto;border:1px solid rgba(148,163,184,.16);border-radius:16px;background:rgba(2,6,23,.34);padding:10px}
    .pgc-pool-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px}
    .pgc-pool-head strong{font-size:12.5px;color:#f8fafc}.pgc-pool-head span{font-size:10.5px;color:#9fb7aa}
    /* Pessoas/Frota — segmentado (inspirado no mockup de referência, 2026-07-21):
       o painel de recursos vira 2 abas em vez de uma lista só misturando
       colaborador e veículo, mais fácil de escanear quando o gestor já sabe
       o que está procurando. */
    .pgc-pool-tabs{display:flex;gap:4px;margin-bottom:8px;border:1px solid rgba(148,163,184,.16);border-radius:10px;padding:3px;background:rgba(2,6,23,.3)}
    .pgc-pool-tab{flex:1 1 0;border:0;border-radius:8px;background:transparent;color:#9fb7aa;font-size:11.5px;font-weight:850;padding:7px 0;cursor:pointer}
    .pgc-pool-tab:hover{color:#dcfce7}
    .pgc-pool-tab.active{background:rgba(22,163,74,.28);color:#dcfce7}
    .pgc-pool-search{width:100%;height:34px;margin:0 0 9px;border:1px solid rgba(148,163,184,.2);border-radius:10px;background:#06130e;color:#eef7f2;padding:0 10px;color-scheme:dark;box-sizing:border-box}
    .pgc-pool-search:focus{outline:none;border-color:rgba(52,211,153,.5)}
    .pgc-colab-list{display:flex;flex-direction:column;gap:6px}
    .pgc-colab-list[hidden]{display:none}
    .pgc-colab-card{display:grid;grid-template-columns:34px 1fr auto;gap:8px;align-items:center;border:1px solid rgba(148,163,184,.14);background:rgba(15,23,42,.55);border-radius:12px;padding:7px 8px;cursor:grab;color:#e2e8f0;user-select:none}
    .pgc-colab-card:hover{border-color:rgba(134,239,172,.42);background:rgba(22,101,52,.16)}
    .pgc-colab-card:active{cursor:grabbing}
    .pgc-colab-card.is-linked{border-color:rgba(34,197,94,.34);background:rgba(22,101,52,.18)}
    .pgc-colab-ico{width:30px;height:30px;border-radius:999px;display:inline-flex;align-items:center;justify-content:center;font-weight:950;font-size:12px;border:1px solid rgba(255,255,255,.75);box-shadow:0 0 0 1px rgba(0,0,0,.35)}
    .pgc-colab-ico.person{background:#eab308;color:#422006}.pgc-colab-card.is-linked .pgc-colab-ico.person{background:#22c55e;color:#052e16}
    .pgc-colab-ico.car{background:#eab308;color:#422006}.pgc-colab-card.is-linked .pgc-colab-ico.car{background:#22c55e;color:#052e16}
    .pgc-colab-main{min-width:0}
    .pgc-colab-name{font-size:12px;font-weight:900;color:#f8fafc;line-height:1.15;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.pgc-colab-meta{font-size:10.5px;color:#9fb7aa;margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .pgc-colab-tag{flex:0 0 auto;font-size:9.5px;font-weight:850;color:#6fd0a5;white-space:nowrap}
    .pgc-colab-tag.is-linked{color:#7d8aa3}
    .pgc-veiculo-card{cursor:default}
    .pgc-colab-empty{font-size:12px;color:#94a3b8;border:1px dashed rgba(148,163,184,.22);border-radius:12px;padding:12px;text-align:center}
    .peqb-row.pgc-drop-hot{outline:2px dashed rgba(134,239,172,.75);outline-offset:3px;background:rgba(22,101,52,.18)!important}
    .peqb-conf-name.pgc-drop-hot,.peqb-extra-colab.pgc-drop-hot{outline:2px dashed rgba(56,189,248,.75);outline-offset:3px;border-radius:10px}
    .pgc-dnd-note{font-size:10.5px;color:#9fb7aa;line-height:1.35;margin:7px 2px 0}
  `;
  document.head.appendChild(style);
}

function waitForElement(selector, timeout = 12000) {
  const found = document.querySelector(selector);
  if (found) return Promise.resolve(found);
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const obs = new MutationObserver(() => {
      const el = document.querySelector(selector);
      if (el) { obs.disconnect(); resolve(el); return; }
      if (Date.now() - started > timeout) { obs.disconnect(); reject(new Error(selector)); }
    });
    obs.observe(document.documentElement, { childList: true, subtree: true });
  });
}

function setFeedback(text, tone = 'ok') {
  const feedback = document.getElementById('progCtxFeedback');
  if (!feedback) return;
  feedback.className = `feedback mt-16 prog-feedback-${tone}`;
  feedback.textContent = text;
}

function setActiveStep(step) {
  state.activeStep = String(step || '1');
  document.querySelectorAll('#progSteps .stepbtn').forEach((btn) => {
    const ui = btn.dataset.uiStep || btn.dataset.step || '';
    btn.classList.toggle('active', ui === state.activeStep || (!ui && btn.textContent.trim().startsWith(state.activeStep)));
  });
  if (state.panes) {
    Object.entries(state.panes).forEach(([key, pane]) => { pane.hidden = key !== state.activeStep; });
  }
  // Além do refresh disparado ao editar a equipe, confira novamente ao abrir
  // Sem O.S. para absorver vínculos feitos por outro usuário/dispositivo.
  // Não aguardamos a rede: a troca visual da aba continua instantânea.
  if (state.activeStep === '2' && typeof window.__pgcSilentRefreshSemOs === 'function') {
    window.__pgcSilentRefreshSemOs().catch((error) => {
      console.warn('[programacao-fluxo] refresh Sem O.S.:', error);
    });
  }
  // O aquecimento de layout (ver prelayoutInactivePanes abaixo) só rodava
  // 1x, logo após "Carregar" — aquecia a aba que estava inativa NAQUELE
  // momento (normalmente a 2). A aba que ficava ativa (a 1) nunca era
  // aquecida, então só a 1ª troca (1→2) ficava fluida; a volta (2→1) não,
  // porque a aba 1 tinha acabado de ser escondida sem re-aquecimento
  // (reportado pela usuária, 2026-07-23: "fluida independente da direção").
  // Chamando aqui também, toda troca de aba re-aquece quem acabou de ficar
  // oculta, deixando a PRÓXIMA troca de volta igualmente fluida.
  prelayoutInactivePanes();
}

// `hidden` evita trabalho enquanto os dados das duas abas são montados, mas
// também faz o navegador adiar o primeiro layout da aba oculta até o clique.
// Em listas grandes esse layout aparecia para o usuário como uma transição
// lenta entre O.S. e Sem O.S. Aquecemos a aba pronta durante o tempo ocioso;
// depois disso o clique abaixo só alterna visibilidade.
function prelayoutInactivePanes() {
  const run = () => {
    if (!state.panes || state.renderingAll) return;
    Object.entries(state.panes).forEach(([key, pane]) => {
      if (!pane || key === state.activeStep || !pane.hidden) return;
      pane.classList.add('pgc-prelayout');
      pane.hidden = false;
      // Leitura intencional: força o cálculo de layout fora do clique.
      void pane.getBoundingClientRect().height;
      pane.hidden = true;
      pane.classList.remove('pgc-prelayout');
    });
  };
  if ('requestIdleCallback' in window) window.requestIdleCallback(run, { timeout: 800 });
  else window.setTimeout(run, 80);
}

function getContextOptions() {
  const supervisao = document.getElementById('progSup')?.value || '';
  const dataReferencia = document.getElementById('progDataRef')?.value || '';
  const isTodas = supervisao === TODAS_SUPERVISOES;
  const programacaoId = window.__progGetProgramacaoId?.() || null;
  const programacaoIdMap = isTodas ? (window.__progGetProgramacaoIdMap?.() || new Map()) : new Map();
  const supervisoesResolvidas = isTodas ? [...programacaoIdMap.keys()] : [supervisao].filter(Boolean);
  const programacaoIds = isTodas ? [...programacaoIdMap.values()].filter(Boolean) : [programacaoId].filter(Boolean);
  return { supervisao, dataReferencia, programacaoId, programacaoIdMap, supervisoesResolvidas, programacaoIds };
}

function contextReady(opts) { return !!(opts?.supervisao && (opts.programacaoId || opts.programacaoIdMap?.size)); }
function optionsKey(opts) { return [opts.supervisao, opts.dataReferencia, opts.programacaoId || '', [...(opts.programacaoIdMap || new Map()).values()].join(',')].join('|'); }

function loadingHtml(label) {
  return `<div class="pgc-loading-card"><span class="pgc-spinner" aria-hidden="true"></span><div><strong>${esc(label)}</strong><br><span>Carregando dados...</span></div></div>`;
}

function mountShell() {
  const list = document.getElementById('progList');
  if (!list) return null;
  list.innerHTML = `
    <div class="pgc-tabs-shell" id="pgcTabsShell">
      <section class="pgc-tab-pane" id="pgcPane1" data-pgc-pane="1">${loadingHtml('O.S.')}</section>
      <section class="pgc-tab-pane" id="pgcPane2" data-pgc-pane="2" hidden>${loadingHtml('Sem O.S.')}</section>
    </div>`;
  state.panes = {
    '1': document.getElementById('pgcPane1'),
    '2': document.getElementById('pgcPane2'),
  };
  setActiveStep(state.activeStep);
  return state.panes;
}

async function renderAllTabs({ force = false } = {}) {
  if (state.renderingAll) return;
  const opts = getContextOptions();
  if (!contextReady(opts)) {
    setFeedback('Selecione a supervisão/data e clique em Carregar.', 'warn');
    return;
  }
  const key = optionsKey(opts);
  if (!force && state.panes && state.lastOptionsKey === key) {
    setActiveStep(state.activeStep);
    return;
  }
  state.renderingAll = true;
  state.lastOptionsKey = key;
  const token = ++state.renderToken;
  const panes = mountShell();
  if (!panes) { state.renderingAll = false; return; }
  setFeedback('Carregando a programação...', 'ok');
  const common = {
    supervisao: opts.supervisao,
    supervisoesResolvidas: opts.supervisoesResolvidas,
    dataReferencia: opts.dataReferencia,
    programacaoId: opts.programacaoId,
    programacaoIdMap: opts.programacaoIdMap,
  };
  try {
    const results = await Promise.allSettled([
      renderProgramacaoListaDrawer(panes['1'], common),
      renderProgramacaoSemOs(panes['2'], common),
    ]);
    if (token !== state.renderToken) return;
    const falhas = results.filter((r) => r.status === 'rejected');
    if (falhas.length) {
      falhas.forEach((f) => console.error('[programacao-fluxo] falha ao carregar aba', f.reason));
      setFeedback(`Carregou com ${falhas.length} alerta(s). Confira as abas.`, 'warn');
    } else {
      setFeedback('Programação carregada.', 'ok');
    }
    setActiveStep(state.activeStep);
  } catch (error) {
    console.error('[programacao-fluxo] renderAllTabs:', error);
    setFeedback(error.message || 'Erro ao carregar as abas.', 'error');
  } finally {
    state.renderingAll = false;
  }
}

window.__pgcProgramacaoReload = () => renderAllTabs({ force: true });

function hookStepClicks() {
  document.addEventListener('click', (event) => {
    const btn = event.target.closest('#progSteps .stepbtn');
    if (!btn || !state.panes) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    const ui = btn.dataset.uiStep || btn.dataset.step || (btn.textContent.match(/\d/) || ['1'])[0];
    setActiveStep(ui);
  }, true);
}

// Espera window.__progLoadColaboradoresPromise (setada pelo próprio clique em
// programacao.js, ver bindEvents lá) em vez de adivinhar com setTimeout. Numa
// data nunca usada antes (programar adiantado) ensureProgramacaoDia() precisa
// criar a linha em programacao_dia — mais lento que reaproveitar uma
// existente — e os 3 timers fixos (650/1250/2100ms) do fluxo antigo podiam
// disparar renderAllTabs() ANTES do contexto (programacaoId da nova data)
// estar pronto: contextReady() falhava, a tela ficava com o conteúdo da data
// anterior (mountShell nunca rodava) e os botões de ação, presos a
// data-os/data-status da O.S. antiga, pareciam "não responder". poll curto
// como rede de segurança caso a promise ainda não tenha sido setada (ordem
// de anexação dos listeners no mesmo clique).
async function waitLoadColaboradores() {
  for (let tentativa = 0; tentativa < 20 && !window.__progLoadColaboradoresPromise; tentativa += 1) {
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  try { await window.__progLoadColaboradoresPromise; } catch (error) { console.warn('[programacao-fluxo] loadContext falhou', error); }
}

function hookLoadButton() {
  const loadBtn = document.getElementById('progLoadContext');
  if (!loadBtn || loadBtn.dataset.pgcAllTabsBound === '1') return;
  loadBtn.dataset.pgcAllTabsBound = '1';
  loadBtn.addEventListener('click', async () => {
    state.panes = null;
    state.lastOptionsKey = '';
    setFeedback('Carregando contexto e preparando a programação...', 'ok');
    await waitLoadColaboradores();
    await renderAllTabs({ force: true });
  }, false);
}

function observeEquipePane() {
  const obs = new MutationObserver(debounce(() => hookLoadButton(), 220));
  obs.observe(document.documentElement, { childList: true, subtree: true });
}

function boot() {
  injectStyles();
  hookStepClicks();
  observeEquipePane();
  waitForElement('#progLoadContext').then(() => hookLoadButton()).catch(() => {});
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
else boot();
}

// --- Incorporado de programacao-lista-drawer-fixo.js — Layout fixo do painel lateral da O.S. em telas desktop ---
{
// Programação: lista de O.S. comprimida + painel lateral fixo.
// Mantém a lógica e o autosave dos módulos existentes; altera só a composição visual.

const DESKTOP_QUERY = window.matchMedia('(min-width: 1050px)');
let scheduled = false;

function injectFixedLayoutStyles() {
  if (document.getElementById('pldFixedLayoutStyles')) return;

  const style = document.createElement('style');
  style.id = 'pldFixedLayoutStyles';
  style.textContent = `
    @media (min-width:1050px) {
      #pldShell.pld-fixed-layout {
        display:grid !important;
        grid-template-columns:minmax(0,1fr) clamp(310px,24vw,345px) !important;
        gap:12px;
        align-items:start;
        width:100%;
      }
      #pldShell.pld-fixed-layout .pld-list-col {
        width:100%;
        max-width:none !important;
        min-width:0;
      }
      #pldShell.pld-fixed-layout > #pldOverlayRoot.pld-fixed-side {
        position:relative !important;
        inset:auto !important;
        z-index:30 !important;
        width:100%;
        height:auto;
        min-width:0;
        pointer-events:auto !important;
        align-self:start;
      }
      #pldShell.pld-fixed-layout > #pldOverlayRoot.pld-fixed-side .pld-backdrop {
        display:none !important;
      }
      #pldShell.pld-fixed-layout > #pldOverlayRoot.pld-fixed-side .pld-drawer {
        position:sticky !important;
        top:74px !important;
        right:auto !important;
        z-index:30 !important;
        display:block !important;
        width:100% !important;
        height:auto !important;
        min-height:calc(100vh - 88px);
        max-height:calc(100vh - 88px);
        overflow-y:auto;
        transform:none !important;
        transition:none !important;
        border:1px solid rgba(52,211,153,.22);
        border-radius:14px;
        background:#081a12;
        padding:12px 13px 14px;
        box-shadow:0 14px 32px rgba(0,0,0,.25);
        scrollbar-width:thin;
        scrollbar-color:rgba(111,208,165,.35) transparent;
      }
      #pldShell.pld-fixed-layout .pld-table thead th,
      #pldShell.pld-fixed-layout .pld-row td {
        padding-left:9px;
        padding-right:9px;
      }
      #pldShell.pld-fixed-layout .pld-row td {font-size:11.5px}
      /* table-layout:fixed + largura garantida por coluna — sem isso, Cliente/
         Local (texto longo) espremiam a coluna Remanescente até cortar o
         valor (ex.: "840.460,00" virava "84"), a coluna ficando parcialmente
         escondida atrás do painel lateral fixo (reportado pela usuária,
         2026-07-30: "as informações da OS não podem ficar cobertas"). Cliente/
         Local agora quebram em várias linhas (aumentando a altura da linha)
         em vez de empurrar Remanescente pra fora da área visível. */
      #pldShell.pld-fixed-layout .pld-table {table-layout:fixed}
      #pldShell.pld-fixed-layout .pld-table th[data-sort-campo="numero_os"],
      #pldShell.pld-fixed-layout .pld-table td:nth-child(1) {width:20%}
      #pldShell.pld-fixed-layout .pld-table th[data-sort-campo="cliente"],
      #pldShell.pld-fixed-layout .pld-table td:nth-child(2) {width:24%}
      #pldShell.pld-fixed-layout .pld-table th[data-sort-campo="embarque"],
      #pldShell.pld-fixed-layout .pld-table td:nth-child(3) {width:28%}
      #pldShell.pld-fixed-layout .pld-table th[data-sort-campo="remanescente"],
      #pldShell.pld-fixed-layout .pld-table td:nth-child(4) {width:22%}
      #pldShell.pld-fixed-layout .pld-table th:last-child,
      #pldShell.pld-fixed-layout .pld-table td:nth-child(5) {width:22px}
      #pldShell.pld-fixed-layout .pld-cliente {
        min-width:0;
        line-height:1.3;
        overflow-wrap:break-word;
      }
      #pldShell.pld-fixed-layout .pld-local-uf {
        font-size:11px;
        line-height:1.35;
      }
      #pldShell.pld-fixed-layout .pld-rem {font-size:11.5px}
      /* Coluna da lista fica mais estreita nesse layout (grid com a coluna
         fixa do painel do lado) — os 4 filtros (busca/cliente/cidade/local)
         continuam em linha única (pedido do usuário, 2026-07-23), só que sem
         basis fixo de 150px por campo, senão não cabe 1 input + 3 selects
         lado a lado numa coluna mais estreita. */
      #pldShell.pld-fixed-layout .pld-filters-row input[type="text"] {
        flex:1.3 1 0;
        min-width:0;
      }
      #pldShell.pld-fixed-layout .pld-filters-row select {
        flex:1 1 0;
        min-width:0;
      }
    }

    /* Estado permanente antes de selecionar uma O.S. */
    #pldOverlayRoot .pld-fixed-empty {
      min-height:calc(100vh - 120px);
      display:flex;
      flex-direction:column;
      align-items:center;
      justify-content:center;
      gap:9px;
      padding:26px 15px;
      text-align:center;
      color:#789588;
    }
    #pldOverlayRoot .pld-fixed-empty-icon {
      width:42px;
      height:42px;
      border-radius:12px;
      display:flex;
      align-items:center;
      justify-content:center;
      border:1px solid rgba(111,208,165,.22);
      background:rgba(34,197,94,.08);
      color:#86efac;
      font-size:20px;
    }
    #pldOverlayRoot .pld-fixed-empty strong {color:#d8eee3;font-size:13px}
    #pldOverlayRoot .pld-fixed-empty span {max-width:230px;font-size:11.5px;line-height:1.45}

    /* Cabeçalho e ações compactos. */
    #pldOverlayRoot .pld-drawer-head {gap:7px}
    #pldOverlayRoot .pld-os-title {font-size:16px}
    #pldOverlayRoot .pld-drawer-sub {
      margin:8px 0 11px;
      padding-bottom:10px;
      gap:8px;
    }
    #pldOverlayRoot .pld-sub-left {font-size:11px;line-height:1.4}
    #pldOverlayRoot .pld-sub-emb {font-size:10px}
    #pldOverlayRoot .pld-sub-rem strong {font-size:14px}
    #pldOverlayRoot .pld-section-label {margin-bottom:6px}
    /* 6 ações (Pausar/Atender/Financeiro/Saldo KG/Laudo/Histórico) numa linha
       só — "Mais ações" (que escondia as 2 últimas atrás de um submenu) foi
       removido, então o grid ganhou uma coluna a mais (pedido do usuário,
       2026-07-22: "ajustar a distância entre as ações caiba todos os ícones
       em linha"). */
    #pldOverlayRoot .pld-acoes-row {
      display:grid;
      grid-template-columns:repeat(6,minmax(0,1fr));
      gap:2px;
      margin-bottom:12px;
    }
    #pldOverlayRoot .pld-acao-btn {
      width:auto;
      min-width:0;
      gap:3px;
      font-size:8px;
      line-height:1.1;
      padding:0;
    }
    #pldOverlayRoot .pld-acao-btn span.pld-acao-ico {
      width:30px;
      height:30px;
      font-size:12.5px;
    }

    /* Card do candidato sugerido (programacao-lista-drawer.js,
       candidatoSugeridoHtml) reaproveita candCardHtml de programacao-equipe.js,
       pensado pra uma tela mais larga — fontes/avatar/padding grandes demais
       pro painel lateral de 440px, destoando do resto (pedido do usuário,
       2026-07-22: "proporcional ao conteúdo da tela"). */
    /* Mesmo padrão visual (fundo/borda) da lista de O.S. à esquerda
       (.pld-table-wrap/.pld-row) em vez do verde vivo de "selecionado" que
       o componente usa por padrão numa lista de vários candidatos pra
       escolher — aqui é só 1 sugestão, não uma lista, e o brilho ficava
       destoando (reportado pela usuária com print, 2026-07-22). */
    #pldOverlayRoot .peqb-cand {gap:8px; padding:9px 10px; border-color:rgba(52,211,153,.16); background:rgba(2,6,23,.28); border-radius:14px}
    #pldOverlayRoot .peqb-cand:hover {border-color:rgba(52,211,153,.32); background:rgba(2,6,23,.4)}
    #pldOverlayRoot .peqb-cand-av {width:26px; height:26px; font-size:10px}
    #pldOverlayRoot .peqb-cand-top strong {font-size:12px}
    #pldOverlayRoot .peqb-cand-tag {font-size:8.5px; padding:2px 6px}
    #pldOverlayRoot .peqb-cand-veic {font-size:9.5px}
    #pldOverlayRoot .peqb-cand-flag {font-size:8.5px; padding:2px 6px}
    #pldOverlayRoot .peqb-cand-sub {font-size:10px}
    #pldOverlayRoot .peqb-cand-cost {font-size:12.5px}

    /* Colaborador como ficha simples, com recolhimento individual. */
    #pldOverlayRoot .pld-colab-card {
      border:0;
      border-top:1px solid rgba(111,208,165,.15);
      border-radius:0;
      background:transparent;
      padding:9px 0 0;
      margin:0 0 7px;
    }
    #pldOverlayRoot .pld-colab-card .peqd-card {
      border:0 !important;
      border-radius:0 !important;
      padding:0 !important;
      background:transparent !important;
    }
    #pldOverlayRoot .pld-colab-head {margin-bottom:3px;gap:6px}
    #pldOverlayRoot .pld-colab-head .peqb-avatar-badge {
      width:25px;
      height:25px;
      border-radius:6px;
    }
    #pldOverlayRoot .pld-colab-nome {font-size:11.5px}
    #pldOverlayRoot .pld-colab-tag {font-size:8.5px;padding:3px 6px}
    #pldOverlayRoot .pld-colab-collapse {
      width:22px;
      height:22px;
      flex:0 0 22px;
      display:flex;
      align-items:center;
      justify-content:center;
      border:0;
      border-radius:6px;
      background:transparent;
      color:#86efac;
      font-size:15px;
      line-height:1;
      cursor:pointer;
      transition:transform .15s ease,background .15s ease;
    }
    #pldOverlayRoot .pld-colab-collapse:hover {background:rgba(111,208,165,.1)}
    #pldOverlayRoot .pld-colab-card.pld-colab-collapsed .pld-colab-collapse {transform:rotate(-90deg)}
    #pldOverlayRoot .pld-colab-card.pld-colab-collapsed > .peqd-card {display:none !important}
    /* Card aberto (não colapsado) = em edição — ganha um destaque visual
       próprio pra diferenciar de relance dos demais colaboradores da lista,
       que ficam só como linhas flat (pedido do usuário, 2026-07-22). */
    #pldOverlayRoot .pld-colab-card:not(.pld-colab-collapsed) {
      background:rgba(63,168,120,.08);
      border-top-color:transparent;
      border-radius:12px;
      padding:9px 10px 11px;
      box-shadow:0 0 0 1px rgba(111,208,165,.28);
    }

    #pldOverlayRoot .peqd-sec {
      margin-top:0 !important;
      padding:10px 0 !important;
      border-top:1px solid rgba(111,208,165,.13) !important;
    }
    #pldOverlayRoot .peqd-sec-label {margin-bottom:6px;font-size:9.5px}
    #pldOverlayRoot .peqd-inp {min-height:31px;font-size:10.5px;border-radius:7px}
    #pldOverlayRoot .peqd-chip {padding:5px 9px;font-size:10.5px}

    /* Estadia: tipo + cidade + diárias numa linha só; observação removida.
       :not([hidden]) é necessário aqui: a linha de campos do Hotel (horário/
       UF/Sexo) também tem a classe .peqd-row e fica com o atributo [hidden]
       quando a Estadia não é Hotel — mas display:grid tem especificidade
       maior que o [hidden] nativo do navegador (que só é display:none) e
       vencia, fazendo a linha aparecer mesmo escondida (reportado pela
       usuária, 2026-09-17: Casa selecionada mas horário/UF/Sexo visíveis). */
    #pldOverlayRoot .peqd-sec[data-sec="estadia"] .peqd-row:not([hidden]) {
      display:grid;
      grid-template-columns:minmax(0,.85fr) minmax(0,1fr) 56px;
      gap:5px;
      align-items:center;
    }
    /* Linha de campos do Hotel (horário/UF/Sexo) tem conteúdo bem diferente da
       linha de cima (tipo/destino/dias) — UF só precisa de 2 letras, Sexo
       precisa mostrar "Masculino"/"Feminino" no combo (pedido do usuário,
       2026-09-17). Mais específico que a regra genérica acima (2 classes em
       vez de 1), então vence sem precisar de !important. */
    #pldOverlayRoot .peqd-sec[data-sec="estadia"] .peqd-hotel-fields:not([hidden]) {
      grid-template-columns:minmax(0,.9fr) 58px minmax(0,1.3fr);
    }
    #pldOverlayRoot .peqd-sec[data-sec="estadia"] .peqd-tipo-est,
    #pldOverlayRoot .peqd-sec[data-sec="estadia"] [data-estadia-destino] {
      width:100%;
      min-width:0;
      max-width:none;
      flex:none;
    }
    #pldOverlayRoot .peqd-sec[data-sec="estadia"] [data-estadia-destino] > * {
      width:100%;
      min-width:0;
    }
    #pldOverlayRoot .peqd-sec[data-sec="estadia"] .peqd-dias {
      width:56px !important;
      min-width:56px;
      justify-self:start;
    }
    #pldOverlayRoot .peqd-sec[data-sec="estadia"] .peqd-obs {
      display:none !important;
    }

    /* Deslocamento: só tipo + placa; KM, valor e observação saem da vista. */
    #pldOverlayRoot .peqd-sec[data-sec="deslocamento"] .peqd-row {
      display:grid;
      grid-template-columns:minmax(0,1fr) 84px;
      gap:5px;
      align-items:center;
    }
    #pldOverlayRoot .peqd-sec[data-sec="deslocamento"] .peqd-tipo-desl,
    #pldOverlayRoot .peqd-sec[data-sec="deslocamento"] .peqd-placa {
      width:100%;
      min-width:0;
      max-width:none;
      flex:none;
    }
    #pldOverlayRoot .peqd-sec[data-sec="deslocamento"] .peqd-km,
    #pldOverlayRoot .peqd-sec[data-sec="deslocamento"] .peqd-valor,
    #pldOverlayRoot .peqd-sec[data-sec="deslocamento"] .peqd-obs {
      display:none !important;
    }

    #pldOverlayRoot .peqd-extra-item {
      display:grid;
      grid-template-columns:minmax(0,1fr) 80px 30px;
      gap:5px;
    }
    #pldOverlayRoot .peqd-extra-tipo,
    #pldOverlayRoot .peqd-extra-desc,
    #pldOverlayRoot .peqd-extra-valor,
    #pldOverlayRoot .peqd-extra-obs {
      width:100%;
      min-width:0;
      max-width:none;
      flex:none;
    }
    #pldOverlayRoot .peqd-extra-desc {grid-column:1 / 3}
    #pldOverlayRoot .peqd-extra-obs {grid-column:1 / -1}
    #pldOverlayRoot .peqd-extra-rm {grid-column:3;grid-row:1}

    /* Adicionar colaborador fica limpo e só abre o seletor quando usado. */
    #pldOverlayRoot .pld-add-box {
      display:block;
      border:0;
      border-top:1px solid rgba(111,208,165,.15);
      background:transparent;
      border-radius:0;
      padding:10px 0 3px;
      margin:0 0 8px;
    }
    #pldOverlayRoot .pld-add-toggle {
      display:block;
      width:100%;
      border:0;
      background:transparent;
      color:#c9f7dc;
      font-size:11px;
      font-weight:850;
      text-align:center;
      cursor:pointer;
      padding:7px;
    }
    #pldOverlayRoot .pld-add-toggle:hover {color:#86efac}
    #pldOverlayRoot .pld-add-editor {
      display:grid;
      grid-template-columns:minmax(0,1fr) auto;
      gap:5px;
      margin-top:5px;
    }
    #pldOverlayRoot .pld-add-editor[hidden] {display:none !important}
    #pldOverlayRoot .pld-add-editor select {width:100%;min-width:0}
    /* "Escolha um colaborador" tem muitas opções -> searchableSelect.js
       (global) troca pelo combobox pesquisável (.ssel-wrap/.ssel-input),
       que por padrão vem sem cor nenhuma (herda o branco/azulado nativo do
       navegador) — mesmo caso já corrigido nos filtros da lista, agora
       aqui (reportado pela usuária com print, 2026-07-22). */
    #pldOverlayRoot .pld-add-editor .ssel-wrap {width:100%;min-width:0}
    #pldOverlayRoot .pld-add-editor .ssel-input {width:100%;box-sizing:border-box;height:34px;border:1px solid rgba(56,189,248,.3);background:#06130e;color:#eef7f2;border-radius:8px;padding:0 8px;font-size:12px}

    @media (max-width:1049px) {
      #pldOverlayRoot .pld-acoes-row {grid-template-columns:repeat(6,minmax(46px,1fr))}
      #pldOverlayRoot .pld-fixed-empty {display:none}
    }
  `;

  document.head.appendChild(style);
}

function fixedPlaceholderHtml() {
  return `
    <div class="pld-fixed-empty" data-pld-fixed-placeholder>
      <div class="pld-fixed-empty-icon">▤</div>
      <strong>Programação da O.S.</strong>
      <span>Selecione uma O.S. na lista para visualizar ou editar os colaboradores e despesas.</span>
    </div>
  `;
}

function ensureDesktopPanel(shell, overlayRoot) {
  const backdrop = overlayRoot.querySelector('#pldBackdrop');
  const drawer = overlayRoot.querySelector('#pldDrawer');
  if (!drawer) return;

  if (backdrop) {
    backdrop.hidden = true;
    backdrop.classList.remove('show');
  }

  drawer.hidden = false;
  drawer.classList.add('open');
  shell.classList.add('pld-panel-permanent');

  if (!drawer.innerHTML.trim()) drawer.innerHTML = fixedPlaceholderHtml();
}

// Colaborador e Frota usam a mesma caixa/patch — só mudam os atributos do
// select/confirm e o texto do link recolhido.
const ADD_BOX_VARIANTS = [
  { selectAttr: 'data-add-colab-select', confirmAttr: 'data-add-colab-confirm', label: '＋ Adicionar colaborador' },
  { selectAttr: 'data-add-frota-select', confirmAttr: 'data-add-frota-confirm', label: '＋ Adicionar Frota' },
];

function enhanceAddBoxes(root = document) {
  root.querySelectorAll('.pld-add-box:not([data-fixed-enhanced])').forEach((box) => {
    const variant = ADD_BOX_VARIANTS.find((v) => box.querySelector(`[${v.selectAttr}]`) && box.querySelector(`[${v.confirmAttr}]`));
    if (!variant) return;

    box.dataset.fixedEnhanced = '1';

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'pld-add-toggle';
    toggle.dataset.pldAddToggle = '1';
    toggle.dataset.openLabel = variant.label;
    toggle.textContent = variant.label;

    const editor = document.createElement('div');
    editor.className = 'pld-add-editor';
    editor.hidden = true;
    // Move TODOS os filhos atuais da caixa (não só select+confirm): o
    // searchableSelect.js (global, via pageInit.js) troca selects com muitas
    // opções por um combobox pesquisável, inserindo um <div class="ssel-wrap">
    // como IRMÃO do <select> (que fica com display:none escondido atrás dele).
    // Pegar só select+confirm aqui e descartar o resto via replaceChildren
    // jogava fora esse .ssel-wrap — sobrava um <select> invisível sem nada
    // clicável, e "Adicionar colaborador" parecia não abrir lista nenhuma.
    editor.append(...box.childNodes);

    box.replaceChildren(toggle, editor);
  });
}

function enhanceCollaboratorCards(root = document) {
  root.querySelectorAll('.pld-colab-card:not([data-collapse-enhanced])').forEach((card) => {
    const head = card.querySelector(':scope > .pld-colab-head');
    const name = head?.querySelector('.pld-colab-nome');
    const body = card.querySelector(':scope > .peqd-card');
    if (!head || !name || !body) return;

    card.dataset.collapseEnhanced = '1';

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'pld-colab-collapse';
    button.dataset.pldColabCollapse = '1';
    button.setAttribute('aria-expanded', 'true');
    button.title = 'Minimizar despesas';
    // Ícone de verdade (SVG) em vez do caractere "⌄" — cada fonte/SO desenha
    // esse glifo com peso/alinhamento diferente, ficando torto no botão
    // circular (pedido do usuário, 2026-07-22: "não um caractere").
    button.innerHTML = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"></polyline></svg>';
    name.insertAdjacentElement('afterend', button);
  });
}

function applyFixedLayout() {
  scheduled = false;
  injectFixedLayoutStyles();

  const shell = document.getElementById('pldShell');
  const overlayRoot = document.getElementById('pldOverlayRoot');
  if (!shell || !overlayRoot) return;

  if (DESKTOP_QUERY.matches) {
    shell.classList.add('pld-fixed-layout');
    overlayRoot.classList.add('pld-fixed-side');
    if (overlayRoot.parentElement !== shell) shell.appendChild(overlayRoot);
    ensureDesktopPanel(shell, overlayRoot);
  } else {
    shell.classList.remove('pld-fixed-layout', 'pld-panel-permanent');
    overlayRoot.classList.remove('pld-fixed-side');
    const placeholder = overlayRoot.querySelector('[data-pld-fixed-placeholder]');
    if (placeholder) placeholder.remove();
    if (overlayRoot.parentElement !== document.body) document.body.appendChild(overlayRoot);
  }

  enhanceAddBoxes(overlayRoot);
  enhanceCollaboratorCards(overlayRoot);
}

function scheduleApply() {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(applyFixedLayout);
}

document.addEventListener('click', (event) => {
  const collapse = event.target.closest('[data-pld-colab-collapse]');
  if (collapse) {
    event.preventDefault();
    event.stopPropagation();
    const card = collapse.closest('.pld-colab-card');
    if (!card) return;

    const collapsed = card.classList.toggle('pld-colab-collapsed');
    collapse.setAttribute('aria-expanded', String(!collapsed));
    collapse.title = collapsed ? 'Expandir despesas' : 'Minimizar despesas';
    return;
  }

  const toggle = event.target.closest('[data-pld-add-toggle]');
  if (!toggle) return;

  const editor = toggle.parentElement?.querySelector('.pld-add-editor');
  if (!editor) return;

  editor.hidden = !editor.hidden;
  toggle.textContent = editor.hidden ? (toggle.dataset.openLabel || '＋ Adicionar colaborador') : '− Fechar seleção';
  if (!editor.hidden) editor.querySelector('select')?.focus();
});

const observer = new MutationObserver(scheduleApply);
observer.observe(document.body, { childList: true, subtree: true });
DESKTOP_QUERY.addEventListener?.('change', scheduleApply);
window.addEventListener('resize', scheduleApply, { passive: true });

scheduleApply();
}

// --- Incorporado de programacao-lista-drawer-ux-hotfix.js — Ajustes finais de UX do painel lateral (abrir seletor de colaborador/recusar sugestão) ---
{
// Ajustes finais do painel lateral de Programação.
// Complementa programacao-lista-drawer-fixo.js sem alterar a lógica de persistência.

let hotfixScheduled = false;

function injectHotfixStyles() {
  if (document.getElementById('pldUxHotfixStyles')) return;

  const style = document.createElement('style');
  style.id = 'pldUxHotfixStyles';
  style.textContent = `
    /* O título "AÇÕES" é redundante: os ícones já explicam a faixa. */
    #pldOverlayRoot .pld-drawer-sub + .pld-section-label {
      display:none !important;
    }

    /* Ações mais baixas e compactas. */
    #pldOverlayRoot .pld-acoes-row {
      margin-top:4px !important;
      margin-bottom:9px !important;
      align-items:start;
    }
    #pldOverlayRoot .pld-acao-btn {
      gap:2px !important;
      font-size:8px !important;
      line-height:1.05 !important;
    }
    #pldOverlayRoot .pld-acao-btn span.pld-acao-ico {
      width:28px !important;
      height:28px !important;
      font-size:12px !important;
    }

    /* O seletor precisa aparecer acima do botão Salvar e sem ser clipado. */
    #pldOverlayRoot .pld-add-editor {
      position:relative;
      z-index:6;
    }
    #pldOverlayRoot .pld-add-editor:not([hidden]) {
      display:grid !important;
    }
  `;

  document.head.appendChild(style);
}

function getAddBoxFromElement(element) {
  return element?.closest('#pldProgBody')?.querySelector('.pld-add-box')
    || document.querySelector('#pldOverlayRoot .pld-add-box');
}

function setAddEditorOpen(box, open) {
  if (!box) return false;

  const toggle = box.querySelector('[data-pld-add-toggle]');
  const editor = box.querySelector('.pld-add-editor');

  // Estrutura já aprimorada pelo arquivo programacao-lista-drawer-fixo.js.
  if (editor) {
    editor.hidden = !open;
    if (toggle) {
      toggle.textContent = open ? '− Fechar seleção' : (toggle.dataset.openLabel || '＋ Adicionar colaborador');
      toggle.setAttribute('aria-expanded', String(open));
    }
    if (open) {
      requestAnimationFrame(() => {
        // Quando o searchableSelect.js já transformou o select num combobox
        // pesquisável, o campo de verdade (visível e focável) é o .ssel-input;
        // o <select> original fica com display:none escondido atrás dele.
        const foco = editor.querySelector('.ssel-input, [data-add-colab-select], select');
        foco?.focus();
        editor.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      });
    }
    return true;
  }

  // Fallback caso o clique aconteça antes do outro script reorganizar o box.
  const select = box.querySelector('[data-add-colab-select]');
  const confirm = box.querySelector('[data-add-colab-confirm]');
  if (!select || !confirm) return false;
  select.hidden = !open;
  confirm.hidden = !open;
  if (open) requestAnimationFrame(() => select.focus());
  return true;
}

function applyHotfixes() {
  hotfixScheduled = false;
  injectHotfixStyles();
}

function scheduleHotfixes() {
  if (hotfixScheduled) return;
  hotfixScheduled = true;
  requestAnimationFrame(applyHotfixes);
}

// Captura antes dos listeners antigos para impedir que o mesmo clique abra e
// feche o editor duas vezes. Esse era o motivo de "Adicionar colaborador" não
// aparentar responder em alguns renders do drawer.
document.addEventListener('click', (event) => {
  const addToggle = event.target.closest('[data-pld-add-toggle]');
  if (addToggle) {
    event.preventDefault();
    event.stopImmediatePropagation();
    const box = addToggle.closest('.pld-add-box');
    const editor = box?.querySelector('.pld-add-editor');
    setAddEditorOpen(box, editor?.hidden !== false);
    return;
  }

  // Recusar a sugestão (candidatoSugeridoHtml, programacao-lista-drawer.js):
  // abre direto a seleção manual de colaborador, mesmo destino que o antigo
  // botão "Outro" (pedido do usuário, 2026-07-22: "a sugestão tem que ter o
  // botão de recusar também").
  const reject = event.target.closest('[data-pld-reject-candidate]');
  if (reject) {
    event.preventDefault();
    event.stopImmediatePropagation();
    setAddEditorOpen(getAddBoxFromElement(reject), true);
  }
}, true);

const hotfixObserver = new MutationObserver(scheduleHotfixes);
hotfixObserver.observe(document.body, { childList: true, subtree: true });
window.addEventListener('resize', scheduleHotfixes, { passive: true });

scheduleHotfixes();
}

initProtectedPage('Programação', renderContent);
