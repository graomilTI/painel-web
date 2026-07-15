// Etapa B da Programação: "quem vai atender as OS disponíveis".
// Lista compacta de OS em ATENDER, cada uma com um dropdown de candidatos
// ranqueados (Contrato 50% / Distância 30% / Auditoria 20%, calculado no
// banco pela RPC programacao_etapa_b_candidatos) e um mapa à direita
// mostrando a rota do colaborador focado até o ponto de embarque — reta por
// padrão, ou a rota real (OSRM, agrupando até 4 colaboradores por veículo)
// quando o gestor pedir "Ver rotas no mapa" (reaproveita a Edge Function já
// usada em Frotas Roteirização, ver supabase/functions/frotas-roteirizar).
import { supabase } from './supabaseClient.js';
import { getCurrentUser } from './auth.js';
import { logActivity } from './activityLogger.js';

let currentUser = null;
const BRI = new Intl.NumberFormat('pt-BR');
const STATUS_OPTS = ['AGUARDAR', 'ATENDER', 'FINALIZAR'];

function debounce(fn, wait = 400) {
  let t = null;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), wait); };
}
// Etapa 1 (Situação da O.S.) e Etapa 2 (Equipe + Mapa) buscam dados de forma
// independente (cada uma 1x, dentro de renderAllTabs). Autorizar/retirar uma
// O.S. na Etapa 1 não atualiza sozinho o snapshot da Etapa 2 -- sem isso, o
// mapa só reflete a mudança depois que o gestor mexe nele (arrastar um
// marcador aciona afterWrite(), que aí sim atualiza o snapshot). Debounced
// pra não martelar o refresh completo da Etapa 2 a cada clique quando o
// gestor está triando várias O.S. em sequência.
const refreshEquipeSnapshot = debounce(() => window.__peqbSilentRefresh?.(), 400);

const LEAFLET_CSS_ID = 'leaflet-css-prog-equipe';
const LEAFLET_JS_ID = 'leaflet-js-prog-equipe';

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
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}

function cpfNorm(value) { return String(value || '').replace(/\D/g, ''); }

function isCargoBloqueado(value) {
  const cargo = normalizeText(value);
  return cargo.includes('SUPERVISOR')
    || cargo.includes('AUDITOR')
    || cargo.includes('COORDENADOR')
    || cargo.includes('COORDENADORA')
    || cargo.includes('ADMINISTRATIVO')
    || cargo === 'COORDENACAO'
    || cargo.startsWith('COORDENACAO ');
}

function isCoordenacaoBloqueada(value) {
  const coord = normalizeText(value);
  return coord === 'GERAL' || coord.endsWith(' GERAL');
}

function isColaboradorInativo(row) {
  if (row?.ativo === false) return true;
  if (String(row?.desligamento || '').trim()) return true;
  const situacao = normalizeText(row?.situacao || row?.status || row?.disponibilidade);
  return ['INATIVO', 'INATIVA', 'DESLIGADO', 'DESLIGADA', 'DEMITIDO', 'DEMITIDA', 'ATESTADO', 'FALTA', 'FERIAS', 'FOLGA', 'INDISPONIVEL']
    .some((status) => situacao.includes(status));
}

function colaboradorKey(row) {
  return String(row?.colaborador_id || row?.colaboradorId || cpfNorm(row?.cpf) || row?.id || row?.nome || row?.nome_colaborador || '').trim();
}

function colaboradorNome(row) {
  return String(row?.nome || row?.nome_colaborador || row?.colaborador_nome || '').trim();
}

function regionalScore(row, supervisao) {
  if (Array.isArray(supervisao)) {
    if (!supervisao.length) return 1;
    return Math.max(...supervisao.map((s) => regionalScore(row, s)));
  }
  const alvo = normalizeText(supervisao);
  if (!alvo) return 1;
  const campos = [row?.supervisao, row?.coordenacao, row?.regional, row?.cidade].map(normalizeText).filter(Boolean);
  if (campos.some((c) => c === alvo)) return 100;
  if (campos.some((c) => c.includes(alvo) || alvo.includes(c))) return 80;
  const tokens = alvo.split(' ').filter((t) => t.length >= 3);
  return tokens.filter((t) => campos.some((c) => c.includes(t) || t.includes(c))).length;
}

function hasGeo(lat, lng) {
  return Number.isFinite(Number(lat)) && Number.isFinite(Number(lng));
}

function round1(n) { return Math.round(n * 10) / 10; }

// Caronas: orçamento de desvio do frota (km) e capacidade de caronas por carro.
const CARONA_DESVIO_KM = 5;
const CARONA_CAP = 4;
// Distância em km entre dois pontos (Haversine).
function kmEntre(aLat, aLng, bLat, bLng) {
  if (aLat == null || aLng == null || bLat == null || bLng == null) return null;
  const R = 6371, rad = (d) => (Number(d) * Math.PI) / 180;
  const dLat = rad(bLat - aLat), dLng = rad(bLng - aLng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

// Perto do embarque tem prioridade. Acima disso o colaborador segue possível,
// mas a tela recomenda hospedagem em vez de deslocamento longo.
const EMBARQUE_PROXIMO_KM = 400;
const HOTEL_KM_THRESHOLD = EMBARQUE_PROXIMO_KM;
const HOTEL_DIARIA_EST = 120; // R$ estimado por diária (referência básica)

function precisaHotel(km) { return km != null && km >= HOTEL_KM_THRESHOLD; }
function kmValido(km) { return km != null && Number.isFinite(Number(km)); }
function kmSortValue(km) { return kmValido(km) ? Number(km) : Number.POSITIVE_INFINITY; }
function candidatoPerto(cand) { return kmValido(cand?.km) && Number(cand.km) <= EMBARQUE_PROXIMO_KM; }
function custoSortValue(cand) {
  return cand?.custoTotal != null && Number.isFinite(Number(cand.custoTotal))
    ? Number(cand.custoTotal)
    : Number.POSITIVE_INFINITY;
}
// Dentro do raio de embarque viável, o candidato sugerido (principal do card)
// é sempre o de menor custo estimado — km só desempata quando o custo empata
// ou nenhum dos dois tem custo calculado.
function ordenarCandidatosPorEmbarque(lista = []) {
  return [...lista].sort((a, b) => {
    const pa = candidatoPerto(a) ? 0 : 1;
    const pb = candidatoPerto(b) ? 0 : 1;
    if (pa !== pb) return pa - pb;
    const ca = custoSortValue(a);
    const cb = custoSortValue(b);
    if (ca !== cb) return ca - cb;
    const ka = kmSortValue(a?.km);
    const kb = kmSortValue(b?.km);
    if (ka !== kb) return ka - kb;
    return (Number(b?.score) || 0) - (Number(a?.score) || 0);
  });
}
function melhorCandidatoEmbarque(disponiveis = []) {
  const perto = disponiveis.filter(candidatoPerto);
  const pool = perto.length ? perto : disponiveis;
  const comCusto = pool.filter((c) => c.custoTotal != null);
  if (comCusto.length) return comCusto.reduce((a, b) => {
    if (a.custoTotal !== b.custoTotal) return a.custoTotal <= b.custoTotal ? a : b;
    return kmSortValue(a.km) <= kmSortValue(b.km) ? a : b;
  });
  return ordenarCandidatosPorEmbarque(pool)[0] || null;
}
function estimarCustoKm(km) {
  if (km == null) return null;
  return Math.round((km * 2 / 10) * 7 * 100) / 100;
}
function parseEmbarqueUfCidade(embarque) {
  const m = /^([A-Z]{2})\s*-\s*([^(]+)/.exec(embarque || '');
  if (!m) return { uf: '', cidade: '' };
  return { uf: m[1].trim(), cidade: m[2].trim() };
}

// Rastreia OS que já tiveram hotel solicitado nesta sessão para atualizar o botão
const hotelSolicitadoIds = new Set();

function contratoLabel(tipo) {
  const norm = normalizeText(tipo);
  if (norm.includes('EFETIVO')) return 'Efetivo';
  if (norm.includes('INTERMITENTE')) return 'Intermitente';
  if (norm.includes('DIARISTA')) return 'Diarista';
  return 'Não informado';
}

function loadCss(href, id) {
  if (document.getElementById(id)) return;
  const link = document.createElement('link');
  link.id = id;
  link.rel = 'stylesheet';
  link.href = href;
  document.head.appendChild(link);
}

function loadScript(src, id) {
  if (document.getElementById(id)) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.id = id;
    script.src = src;
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

async function ensureLeaflet() {
  if (window.L) return true;
  try {
    loadCss('https://unpkg.com/leaflet@1.9.4/dist/leaflet.css', LEAFLET_CSS_ID);
    await loadScript('https://unpkg.com/leaflet@1.9.4/dist/leaflet.js', LEAFLET_JS_ID);
    return !!window.L;
  } catch {
    return false;
  }
}

function injectStyles() {
  if (document.getElementById('progEquipeStyles')) return;
  const style = document.createElement('style');
  style.id = 'progEquipeStyles';
  style.textContent = `
    .peqb-kpis{display:grid;grid-template-columns:repeat(2,minmax(140px,1fr));gap:10px;margin-bottom:12px}
    .peqb-kpi{border:1px solid rgba(34,197,94,.18);background:rgba(2,6,23,.32);border-radius:12px;padding:10px}
    .peqb-kpi span{display:block;color:#93c5fd;font-size:9.5px;font-weight:950;letter-spacing:.08em;text-transform:uppercase}
    .peqb-kpi strong{display:block;margin-top:4px;color:#fff;font-size:18px}
    .peqb-os2-kpis{display:grid;grid-template-columns:repeat(4,minmax(90px,1fr));gap:8px;margin-bottom:8px}
    .peqb-os2-kpi{border:1px solid rgba(34,197,94,.16);background:rgba(2,6,23,.28);border-radius:10px;padding:7px 9px;min-width:0}
    .peqb-os2-kpi span{display:block;color:#93c5fd;font-size:9px;font-weight:950;letter-spacing:.06em;text-transform:uppercase}
    .peqb-os2-kpi strong{display:block;margin-top:3px;color:#fff;font-size:13px;font-weight:800;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .peqb-os2-kpi-wide{grid-column:span 1}
    @media(max-width:640px){.peqb-os2-kpis{grid-template-columns:repeat(2,minmax(90px,1fr))}.peqb-os2-kpi-wide{grid-column:span 2}}
    .peqb-toolbar{display:flex;gap:8px;flex-wrap:wrap;align-items:center;justify-content:flex-end;margin-bottom:12px}
    .peqb-btn{border:1px solid rgba(134,239,172,.35);background:rgba(22,163,74,.16);color:#dcfce7;border-radius:999px;padding:8px 14px;font-size:12px;font-weight:950;cursor:pointer;white-space:nowrap}
    .peqb-btn:hover{background:rgba(22,163,74,.3)}
    .peqb-btn:disabled{opacity:.55;cursor:not-allowed}
    .peqb-grid{display:grid;grid-template-columns:minmax(360px,1fr) minmax(320px,.85fr);gap:14px;align-items:start}
    @media(max-width:1080px){.peqb-grid{grid-template-columns:1fr}}
    .peqb-os-list{display:flex;flex-direction:column;gap:8px;max-height:calc(100vh - 320px);min-height:300px;overflow:auto;padding-right:2px}
    .peqb-row{border:1px solid rgba(52,211,153,.18);border-radius:14px;background:rgba(2,6,23,.32);padding:10px 12px;cursor:pointer}
    .peqb-row:hover,.peqb-row.focus{border-color:rgba(52,211,153,.45);background:rgba(34,197,94,.08)}
    .peqb-row-head{display:flex;justify-content:space-between;gap:8px;align-items:flex-start;color:#f8fafc;font-weight:950;font-size:12.5px}
    .peqb-row-head small{color:#bbf7d0;font-size:10.5px;white-space:nowrap}
    .peqb-row-meta{color:#94a3b8;font-size:10.5px;margin-top:2px;line-height:1.3}
    .peqb-chip{display:inline-flex;align-items:center;border-radius:999px;padding:2px 8px;font-size:9.5px;font-weight:850;border:1px solid rgba(148,163,184,.18);background:rgba(15,23,42,.6);color:#cbd5e1;white-space:nowrap;margin-top:4px}
    .peqb-chip.ok{border-color:rgba(34,197,94,.35);background:rgba(22,101,52,.22);color:#bbf7d0}
    .peqb-chip.warn{border-color:rgba(245,158,11,.32);background:rgba(245,158,11,.12);color:#fde68a}
    .peqb-row-actions{display:flex;gap:6px;margin-top:7px;align-items:center}
    .peqb-select{flex:1;min-width:0;height:32px;border:1px solid rgba(148,163,184,.22);border-radius:8px;background:#0d0d18;color:#e2e2f0;padding:0 8px;font-size:11.5px;outline:none;color-scheme:dark}
    .peqb-row-btn{border:1px solid rgba(134,239,172,.35);background:rgba(22,163,74,.16);color:#dcfce7;border-radius:8px;padding:0 10px;height:32px;font-size:11px;font-weight:900;cursor:pointer;white-space:nowrap}
    .peqb-row-btn.danger{border-color:rgba(239,68,68,.35);background:rgba(239,68,68,.14);color:#fecaca}
    .peqb-row-btn:disabled{opacity:.6;cursor:not-allowed}
    .peqb-map-wrap{border:1px solid rgba(148,163,184,.14);border-radius:18px;background:rgba(2,6,23,.36);overflow:hidden;position:sticky;top:8px}
    .peqb-map{height:min(560px,calc(100vh - 280px));min-height:340px;position:relative}
    #peqbMapEl{position:absolute;inset:0}
    .peqb-map-empty{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#94a3b8;text-align:center;padding:20px;font-size:12.5px}
    .leaflet-tooltip.peqb-tt{background:rgba(2,6,23,.92)!important;border:1px solid rgba(34,197,94,.35)!important;color:#f8fafc!important;border-radius:8px!important;font-size:11px!important;padding:4px 8px!important;font-weight:700!important;box-shadow:none!important}
    .leaflet-control-attribution{background:rgba(2,6,23,.65)!important;color:#6b7280!important;font-size:10px!important}
    .peqb-empty{border:1px dashed rgba(148,163,184,.22);border-radius:14px;padding:22px;text-align:center;color:#94a3b8;line-height:1.4}
    .peqb-loading{display:flex;align-items:center;justify-content:center;gap:10px;text-align:left}
    .peqb-spinner{width:24px;height:24px;border-radius:999px;border:3px solid rgba(111,208,165,.18);border-top-color:#6fd0a5;flex:0 0 auto;animation:peqbSpin .75s linear infinite}
    @keyframes peqbSpin{to{transform:rotate(360deg)}}
    .peqb-chip-hotel{border-color:rgba(251,191,36,.4)!important;background:rgba(251,191,36,.1)!important;color:#fbbf24!important;font-weight:950!important}
    .peqb-row-btn.hotel{border-color:rgba(251,191,36,.45);background:rgba(251,191,36,.12);color:#fbbf24}
    .peqb-row-btn.hotel:hover{background:rgba(251,191,36,.22)}
    .peqb-row-btn.hotel.done{border-color:rgba(34,197,94,.4);background:rgba(22,163,74,.15);color:#86efac;cursor:default}
    .peqs-row{padding:0;cursor:default}
    .peqs-row:hover{border-color:rgba(52,211,153,.18);background:rgba(2,6,23,.32)}
    .peqs-row .peqb-os2-left{padding:14px 15px;border-right:0}
    /* Cartões de candidato (Fase 2 do redesenho) — substituem o <select> apertado */
    .peqb-cand{display:flex;align-items:flex-start;gap:11px;width:100%;text-align:left;cursor:pointer;border:1px solid var(--line-2,rgba(111,208,165,.22));background:rgba(8,22,17,.5);border-radius:13px;padding:11px 12px;margin-top:8px;color:var(--text,#eef7f2);font:inherit}
    .peqb-cand:hover{border-color:var(--green-2,#6fd0a5);background:rgba(63,168,120,.12)}
    .peqb-cand.sel{border-color:var(--green-2,#6fd0a5);background:rgba(63,168,120,.16);box-shadow:0 0 0 1px rgba(111,208,165,.25) inset}
    .peqb-cand-confirmado{cursor:default}
    .peqb-cand-av{flex:0 0 auto;width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:rgba(63,168,120,.2);color:#bbf7d0;font-size:12px;font-weight:900}
    .peqb-cand-main{flex:1;min-width:0;display:flex;flex-direction:column;gap:5px}
    .peqb-cand-top{display:flex;align-items:center;gap:7px;flex-wrap:wrap}
    .peqb-cand-top strong{font-size:14px;color:#f8fafc;font-weight:850}
    .peqb-cand-tag{font-size:10px;font-weight:850;padding:2px 8px;border-radius:999px;border:1px solid rgba(148,163,184,.25)}
    .peqb-cand-tag.t-ok{background:rgba(22,163,74,.18);color:#bbf7d0;border-color:rgba(34,197,94,.3)}
    .peqb-cand-tag.t-warn{background:rgba(245,158,11,.14);color:#fde68a;border-color:rgba(245,158,11,.3)}
    .peqb-cand-tag.t-info{background:rgba(59,130,246,.16);color:#bfdbfe;border-color:rgba(59,130,246,.3)}
    .peqb-cand-tag.t-muted{background:rgba(148,163,184,.14);color:#cbd5e1}
    .peqb-cand-veic{font-size:10.5px;color:#bbf7d0}
    .peqb-cand-flag{font-size:10px;font-weight:850;padding:2px 8px;border-radius:999px}
    .peqb-cand-flag.hotel{background:rgba(251,191,36,.12);color:#fbbf24;border:1px solid rgba(251,191,36,.35)}
    .peqb-cand-flag.menor{background:rgba(22,163,74,.18);color:#bbf7d0;border:1px solid rgba(34,197,94,.3)}
    .peqb-cand-best{font-size:10px;font-weight:850;padding:2px 8px;border-radius:999px;background:rgba(63,168,120,.2);color:#bbf7d0}
    .peqb-cand-sub{font-size:11.5px;color:#9fb7aa}
    .peqb-cand-cost{flex:0 0 auto;font-size:15px;font-weight:900;color:#f8fafc;white-space:nowrap;align-self:center}
    .peqb-score{display:flex;height:5px;border-radius:3px;overflow:hidden;background:rgba(148,163,184,.18);max-width:240px}
    .peqb-score i{display:block;height:100%}
    .peqb-score .seg-c{background:#22c55e}
    .peqb-score .seg-d{background:#38bdf8}
    .peqb-score .seg-a{background:#fbbf24}
    .peqb-cand-more{margin-top:8px;width:100%;border:1px dashed rgba(111,208,165,.3);background:transparent;color:#9fb7aa;border-radius:11px;padding:9px;font-size:12.5px;font-weight:800;cursor:pointer}
    .peqb-cand-more:hover{color:#bbf7d0;border-color:rgba(111,208,165,.5)}
    .peqb-cand-more.open{color:#bbf7d0}
    .peqb-cand-list{display:flex;flex-direction:column}
    .peqb-cand-list[hidden]{display:none}
    .peqb-legend{display:flex;gap:14px;flex-wrap:wrap;align-items:center;margin:-2px 0 12px;font-size:11px;color:#9fb7aa}
    .peqb-legend b{font-weight:850;color:#cbd5e1}
    .peqb-legend i{display:inline-block;width:13px;height:6px;border-radius:2px;margin-right:5px;vertical-align:middle}
    .peqb-legend .lg-c{background:#22c55e}.peqb-legend .lg-d{background:#38bdf8}.peqb-legend .lg-a{background:#fbbf24}
    .peqb-block-head{font-size:11px;font-weight:850;letter-spacing:.06em;text-transform:uppercase;color:#6fd0a5;margin:2px 0 9px}
    .peqb-status-strip{display:flex;gap:5px;flex-wrap:wrap;margin:9px 0 4px}
    .peqb-st{border:1px solid rgba(111,208,165,.22);background:rgba(8,22,17,.55);color:#cfe7da;border-radius:999px;min-width:34px;height:32px;padding:0 9px;font-weight:900;font-size:12.5px;cursor:pointer;display:inline-flex;align-items:center;justify-content:center}
    .peqb-st:hover{border-color:rgba(111,208,165,.45)}
    .peqb-st.warn.on{background:#fde68a;color:#713f12;border-color:#fde68a}
    .peqb-st.ok.on{background:linear-gradient(135deg,#16a34a,#86efac);color:#052e16;border-color:#86efac}
    .peqb-st.danger.on{background:#fecaca;color:#7f1d1d;border-color:#fecaca}
    .peqb-st.kg{color:#90cdf4;border-color:rgba(99,179,237,.35)}.peqb-st.kg.on{background:rgba(99,179,237,.3);color:#0c2942}
    .peqb-st.conf{color:#c4b5fd;border-color:rgba(167,139,250,.35)}.peqb-st.conf.on{background:rgba(167,139,250,.3);color:#2a1d52}
    .peqb-st:disabled{opacity:.5;cursor:not-allowed}
    .peqb-modal-ov{position:fixed;inset:0;background:rgba(2,6,23,.7);display:flex;align-items:center;justify-content:center;z-index:9999;padding:16px}
    .peqb-modal{background:#0c1f17;border:1px solid rgba(111,208,165,.25);border-radius:16px;padding:18px;width:100%;max-width:380px;display:flex;flex-direction:column;gap:10px}
    .peqb-modal h3{margin:0;font-size:15px;color:#f8fafc}.peqb-modal p{margin:0;font-size:12px;color:#9fb7aa}
    .peqb-modal input{padding:9px 10px;border-radius:9px;border:1px solid rgba(111,208,165,.3);background:#0a1e17;color:#f8fafc;font-size:14px}
    .peqb-modal-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:4px}
    /* Card de O.S. em duas colunas (esquerda OS+status / direita colaborador+custos) */
    .peqb-os-list-full{max-height:none!important;overflow:visible!important}
    .peqb-row.peqb-os2{display:grid!important;grid-template-columns:minmax(0,0.8fr) minmax(0,1.2fr)!important;padding:0!important;gap:0!important;overflow:visible!important;align-items:stretch}
    /* Card focado sobe acima dos vizinhos para o dropdown de troca "passar" por cima. */
    .peqb-row.peqb-os2:focus-within{position:relative;z-index:30}
    .peqb-os2-left{padding:14px 15px;border-right:1px solid rgba(111,208,165,.14)}
    .peqb-os2-right{padding:14px 15px;background:rgba(16,40,30,.45);border-radius:0 13px 13px 0}
    .peqb-os2-cliente{font-size:13.5px;font-weight:850;color:#f8fafc;line-height:1.25}
    .peqb-os2-emb{font-size:11.5px;color:#8ba79a;margin-top:3px;overflow-wrap:anywhere}
    .peqb-os2-uf{color:#6fd0a5;font-weight:900}
    .peqb-os2-emb-l1,.peqb-os2-emb-l2{display:block}
    .peqb-os2-emb-l2{font-size:10.5px;color:#8ba79a;margin-top:1px}
    .peqb-os2-tags{display:flex;gap:6px;flex-wrap:wrap;margin:10px 0}
    .peqb-os2-tagsrow{display:flex;gap:7px;flex-wrap:wrap;align-items:center;margin-top:10px}
    .peqb-os2-tagsrow .peqb-status-strip{margin:0}
    .peqb-tag{font-size:11px;font-weight:850;padding:4px 9px;border-radius:999px}
    .peqb-tag.g{background:rgba(63,168,120,.16);color:#6fd0a5}
    .peqb-tag.b{background:rgba(99,179,237,.14);color:#bfdbfe}
    .peqb-conf-head{display:flex;align-items:center;gap:8px;margin-bottom:8px;flex-wrap:wrap}
    .peqb-conf-head .peqb-row-btn{height:32px;font-size:12px;padding:0 11px;white-space:nowrap;flex:0 0 auto}
    .peqb-conf-head .peqb-row-btn.hotel{font-weight:850}
    .peqb-conf-name{display:flex;align-items:center;gap:6px;min-width:0;flex:1 1 140px}
    .peqb-conf-tag{flex:0 0 auto;white-space:nowrap}
    .peqb-name-sel{flex:1 1 140px;min-width:0;max-width:100%;border:1px solid transparent;background:transparent;color:#f8fafc;font-size:13.5px;font-weight:850;cursor:pointer;border-radius:8px;padding:4px 24px 4px 7px;color-scheme:dark;text-overflow:ellipsis}
    .peqb-name-sel:hover{border-color:rgba(111,208,165,.35);background:rgba(8,22,17,.55)}
    .peqb-name-sel:focus{border-color:rgba(111,208,165,.55);outline:none;background:#06130e}
    .peqb-name-sel option{background:#0c1f17;color:#eef7f2;font-weight:600}
    .peqb-add-colab{width:28px;height:28px;min-height:28px;padding:0;border-radius:9px;border:1px solid rgba(56,189,248,.42);background:rgba(14,116,144,.16);color:#bfdbfe;font-size:16px;font-weight:950;cursor:pointer;flex:0 0 auto;line-height:1}
    .peqb-add-colab:hover{background:rgba(14,116,144,.28);color:#e0f2fe}
    .peqb-extra-colabs{display:flex;flex-direction:column;gap:6px;width:100%;margin:-2px 0 7px}
    .peqb-extra-colab{display:flex;align-items:center;gap:6px;width:100%;border:1px solid rgba(56,189,248,.24);background:rgba(15,23,42,.74);border-radius:10px;padding:5px 7px;box-sizing:border-box}
    .peqb-extra-colab .peqb-name-sel{background:rgba(15,23,42,.9);border-color:rgba(56,189,248,.18);cursor:default}
    .peqb-extra-colab button{width:28px;height:28px;border-radius:9px;border:1px solid rgba(248,113,113,.3);background:rgba(127,29,29,.18);color:#fecaca;font-size:14px;font-weight:950;cursor:pointer;padding:0;line-height:1;flex:0 0 auto}
    .peqb-extra-colab button:hover{background:rgba(127,29,29,.3)}
    .peqb-add-box{display:flex;gap:6px;align-items:center;width:100%;margin:-1px 0 7px;border:1px solid rgba(56,189,248,.28);background:rgba(15,23,42,.72);border-radius:10px;padding:5px 7px;box-sizing:border-box}
    .peqb-add-box[hidden]{display:none}
    .peqb-add-box .peqb-cand-av{width:28px;height:28px;font-size:12px;background:rgba(14,116,144,.24);color:#bfdbfe}
    .peqb-add-box .peqb-name-sel{height:30px;min-height:30px;flex:1 1 auto;background:rgba(15,23,42,.9);border-color:rgba(56,189,248,.18)}
    .peqb-add-box .peqb-row-btn{height:30px;min-height:30px;font-size:11px;border-color:rgba(56,189,248,.42);background:rgba(14,116,144,.2);color:#bfdbfe}
    .peqb-add-box .peqb-row-btn:hover{background:rgba(14,116,144,.34)}
    .peqb-conf-sub{font-size:11px;color:#8ba79a}
    .peqb-conf-km{font-size:11px;color:#9fb7aa;font-weight:800;white-space:nowrap;display:inline-flex;align-items:center;gap:3px}
    .peqb-clab{font-size:15px;line-height:1;flex:0 0 auto;opacity:.9}
    .peqb-map-band{margin-top:14px;border:1px solid rgba(111,208,165,.14);border-radius:16px;overflow:hidden;background:rgba(2,6,23,.36)}
    .peqb-map-band-head{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:10px 14px;border-bottom:1px solid rgba(111,208,165,.14);font-size:12.5px;font-weight:850;color:#cfe7da}
    .peqb-map-band .peqb-map{height:min(420px,60vh);position:relative}
    @media(max-width:760px){.peqb-row.peqb-os2{grid-template-columns:1fr!important}.peqb-os2-left{border-right:0;border-bottom:1px solid rgba(111,208,165,.14)}.peqb-os2-right{border-radius:0 0 13px 13px}.peqb-crow,.peqb-crow-2,.peqb-crow-3{grid-template-columns:1fr!important}}
    @media(max-width:600px){.peqb-cand-cost{align-self:flex-start}}
  `;
  document.head.appendChild(style);
}

// Carrega as OS acionáveis da supervisão (pendentes/aguardar/atender) — as
// FINALIZAR já saíram do fluxo do dia. A triagem (mudar status) e a atribuição
// passam a conviver na mesma tela.
async function loadOsRelevantes(supervisao) {
  let query = supabase
    .from('operacional_os')
    .select('id,numero_os,cliente,servico,embarque,destino,ponto_embarque_id,ponto1_latitude,ponto1_longitude,supervisao,status_gestor,remanescente,observacao_logistica,data_os,configurada_em');
  query = Array.isArray(supervisao) ? query.in('supervisao', supervisao) : query.eq('supervisao', supervisao);
  const { data, error } = await query
    .or('status_gestor.is.null,status_gestor.eq.PENDENTE,status_gestor.eq.AGUARDAR,status_gestor.eq.ATENDER')
    .order('data_os', { ascending: false })
    .order('numero_os', { ascending: false })
    .limit(400);
  if (error) throw error;
  return data || [];
}

function statusNorm(os) {
  return normalizeText(os?.status_gestor || '') || 'PENDENTE';
}

// status_gestor é global à O.S. (persiste entre dias até FINALIZAR — a
// mesma O.S. pode continuar "aguardando"/"atender" em várias datas até o
// supervisor encerrar). Mas o realce visual do botão (.on) precisa refletir
// "essa ação foi tomada PARA O DIA selecionado" — senão o botão continua
// aceso ao trocar de data mesmo sem nenhuma ação nesse dia. Comparamos
// configurada_em (gravado a cada clique de status) com a data de referência
// selecionada; sem tocar em status_gestor nem no fluxo de negócio.
function localDateFromIso(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

// Tira de status/saldo/conferir reaproveitada da triagem (os-programacao-lite),
// agora dentro da própria tela de equipe.
function statusStripHtml(os, dataReferencia) {
  const st = statusNorm(os);
  const configuradaHoje = !dataReferencia || localDateFromIso(os.configurada_em) === dataReferencia;
  const btn = (status, label, icon, cls) =>
    `<button type="button" class="peqb-st ${cls} ${st === status && configuradaHoje ? 'on' : ''}" data-status="${status}" data-os="${esc(os.id)}" title="${label}">${icon}</button>`;
  const kgAtivo = String(os.observacao_logistica || '').startsWith('KG solicitado');
  const laudoAtivo = String(os.observacao_logistica || '').startsWith('LAUDO:');
  return `<div class="peqb-status-strip">
    ${btn('AGUARDAR', 'Aguardar', '❚❚', 'warn')}
    ${btn('ATENDER', 'Atender', '✓', 'ok')}
    ${btn('FINALIZAR', 'Finalizar', '＄', 'danger')}
    <button type="button" class="peqb-st kg ${kgAtivo ? 'on' : ''}" data-kg="${esc(os.id)}" title="Aumentar saldo">＋</button>
    <button type="button" class="peqb-st conf ${laudoAtivo ? 'on' : ''}" data-conf="${esc(os.id)}" title="Conferir / anexar laudo">▣</button>
  </div>`;
}

async function loadPontos(ids) {
  if (!ids.length) return new Map();
  const { data, error } = await supabase
    .from('operacional_pontos_embarque')
    .select('id,nome_local,latitude,longitude')
    .in('id', ids);
  if (error) throw error;
  return new Map((data || []).map((p) => [p.id, p]));
}

export async function loadEquipeExistente(programacaoId) {
  let query = supabase.from('programacao_equipe').select('*');
  query = Array.isArray(programacaoId) ? query.in('programacao_id', programacaoId) : query.eq('programacao_id', programacaoId);
  const { data, error } = await query.order('created_at', { ascending: true });
  if (error) throw error;
  return data || [];
}

// Placa do veículo já vinculado ao colaborador (leitura de patrimônio,
// pré-calculada em colaborador_cruzamento). Carrega pela supervisão e indexa
// por CPF normalizado (o cpf na tabela pode vir formatado), igual ao resto do
// painel — assim a placa casa de forma confiável.
export async function loadCruzamentoPlacas(supervisao) {
  try {
    let query = supabase.from('colaborador_cruzamento').select('cpf,veiculo_placa');
    query = Array.isArray(supervisao) ? query.in('supervisao', supervisao) : query.eq('supervisao', supervisao);
    const { data, error } = await query.limit(5000);
    if (error) throw error;
    const map = new Map();
    (data || []).forEach((r) => { if (r.veiculo_placa) map.set(String(r.cpf || '').replace(/\D/g, ''), r.veiculo_placa); });
    return map;
  } catch (error) {
    console.warn('[equipe] cruzamento de placas indisponível', error);
    return new Map();
  }
}

// Lista COMPLETA de colaboradores ativos da supervisão (regional liberada do
// usuário), para o dropdown de troca poder escolher qualquer um — não só os 8
// candidatos ranqueados. Os já escalados em outra OS são marcados com ♻ na UI.
async function loadColaboradoresRegional(supervisao) {
  const fontes = [];
  const listaSupervisoes = Array.isArray(supervisao) ? supervisao : [supervisao];
  try {
    const resultados = await Promise.all(listaSupervisoes.map((sup) =>
      supabase.rpc('programacao_colaboradores_supervisao', { p_supervisao: sup })
    ));
    resultados.forEach(({ data, error }, idx) => {
      if (error) throw error;
      // A RPC não devolve a supervisão (só colaborador_id/nome/cargo) — sem
      // marcar aqui com a supervisão da própria chamada, o mapa acaba
      // descartando esses colaboradores no filtro por supervisão quando a
      // busca cobre mais de uma (modo "Todas").
      const sup = listaSupervisoes[idx];
      fontes.push(...(data || []).map((r) => ({ ...r, supervisao: r.supervisao || sup, _scoreRegional: 100, _fonteRegional: 1 })));
    });
  } catch (error) {
    console.warn('[equipe] lista de colaboradores da regional via RPC indisponível', error);
  }

  try {
    const { data, error } = await supabase
      .from('colaboradores_atuais')
      .select('cpf,nome,cargo,coordenacao,supervisao,situacao,ativo,desligamento')
      .limit(12000);
    if (error) throw error;
    fontes.push(...(data || [])
      .map((r) => ({ ...r, colaborador_id: cpfNorm(r.cpf) || r.nome, _scoreRegional: regionalScore(r, supervisao), _fonteRegional: 2 }))
      .filter((r) => r._scoreRegional > 0));
  } catch (error) {
    console.warn('[equipe] colaboradores indisponível para fallback regional', error);
  }

  const seenIds = new Set();
  const seenNomes = new Set();
  return fontes
    .filter((r) => !isCargoBloqueado(r.cargo) && !isCoordenacaoBloqueada(r.coordenacao) && !isColaboradorInativo(r))
    .sort((a, b) => (b._scoreRegional || 0) - (a._scoreRegional || 0) || colaboradorNome(a).localeCompare(colaboradorNome(b), 'pt-BR'))
    .map((r) => ({
      colaboradorId: colaboradorKey(r),
      nome: colaboradorNome(r),
      cargo: r.cargo || null,
      coordenacao: r.coordenacao || null,
      supervisao: r.supervisao || (Array.isArray(supervisao) ? null : supervisao) || null,
      tipoLabel: r.tipo_contrato ? contratoLabel(r.tipo_contrato) : 'Regional',
      km: null,
      auditPeso: null,
      veiculoId: null,
      veiculoPlaca: null,
      lat: null,
      lng: null,
      custoTotal: null,
      score: 0,
      scoreContrato: 0,
      scoreDistancia: 0,
      scoreAuditoria: 0,
      origemRegional: true,
    }))
    .filter((c) => {
      const id = String(c.colaboradorId || '');
      const nome = normalizeText(c.nome);
      if (!id || !nome || seenIds.has(id) || seenNomes.has(nome)) return false;
      seenIds.add(id);
      seenNomes.add(nome);
      return true;
    });
}

// Custos já lançados (estadia/alimentação/deslocamento) por colaborador, para
// pré-preencher os campos inline dos cartões confirmados.
// Estado atual de Atendimento(OK)/Logística de cada colaborador confirmado —
// só pra refletir no toggle do card; o valor em si já é escrito/mantido por
// confirmarCandidato/adicionarColaboradorOs (auto) ou pelo próprio toggle.
async function loadDisponibilidadeConfirmados(programacaoId, colaboradorIds) {
  const ids = [...new Set((colaboradorIds || []).filter(Boolean))];
  if (!ids.length) return new Map();
  const pids = Array.isArray(programacaoId) ? programacaoId : [programacaoId];
  try {
    const { data, error } = await supabase
      .from('programacao_colaboradores')
      .select('colaborador_id,disponibilidade')
      .in('programacao_id', pids)
      .in('colaborador_id', ids);
    if (error) throw error;
    return new Map((data || []).map((r) => [String(r.colaborador_id), r.disponibilidade]));
  } catch (error) {
    console.warn('[equipe] disponibilidade dos confirmados indisponível', error);
    return new Map();
  }
}

export async function loadCustos(programacaoId) {
  const ids = Array.isArray(programacaoId) ? programacaoId : [programacaoId];
  const [est, ali, des] = await Promise.all([
    supabase.from('programacao_estadia').select('*').in('programacao_id', ids),
    supabase.from('programacao_alimentacao').select('*').in('programacao_id', ids),
    supabase.from('programacao_deslocamento').select('*').in('programacao_id', ids),
  ]);
  return {
    est: new Map((est.data || []).map((r) => [String(r.colaborador_id), r])),
    ali: new Map((ali.data || []).map((r) => [String(r.colaborador_id), r])),
    des: new Map((des.data || []).map((r) => [String(r.colaborador_id), r])),
  };
}

function pontoDaOs(os, pontosPorId) {
  if (hasGeo(os.ponto1_latitude, os.ponto1_longitude)) {
    return { lat: Number(os.ponto1_latitude), lng: Number(os.ponto1_longitude), nome: os.embarque };
  }
  const ponto = os.ponto_embarque_id ? pontosPorId.get(os.ponto_embarque_id) : null;
  if (ponto && hasGeo(ponto.latitude, ponto.longitude)) {
    return { lat: Number(ponto.latitude), lng: Number(ponto.longitude), nome: ponto.nome_local || os.embarque };
  }
  return null;
}

// O ranking de candidatos (Contrato/Distância/Auditoria) é calculado no banco
// pela RPC programacao_etapa_b_candidatos (ver migração
// 20260625130000_programacao_etapa_b_candidatos_rpc.sql e seguintes), que já
// filtra pelos top 8 por OS usando colaborador_cruzamento pré-computado.
// A RPC programacao_etapa_b_candidatos filtra o pool de colaboradores por uma
// única supervisão — sob "Todas" (múltiplas supervisões na mesma tela),
// agrupamos as O.S. pela própria supervisão (já vem em os.supervisao) e
// chamamos a RPC uma vez por grupo, mesclando os resultados no final.
async function loadCandidatosPorOs(supervisao, osComPonto, excluirIds) {
  const grupos = new Map();
  osComPonto.forEach((item) => {
    const sup = item.os?.supervisao || supervisao;
    if (!grupos.has(sup)) grupos.set(sup, []);
    grupos.get(sup).push(item);
  });
  const resultados = await Promise.all(
    [...grupos.entries()].map(([sup, itens]) => loadCandidatosPorOsUnico(sup, itens, excluirIds))
  );
  const porOsFinal = new Map();
  resultados.forEach((mapa) => mapa.forEach((valor, chave) => porOsFinal.set(chave, valor)));
  return porOsFinal;
}

async function loadCandidatosPorOsUnico(supervisao, osComPonto, excluirIds) {
  const osPayload = osComPonto
    .filter(({ candidatosNecessarios }) => candidatosNecessarios)
    .map(({ os, ponto }) => ({ os_id: os.id, lat: ponto?.lat ?? null, lng: ponto?.lng ?? null }));
  if (!osPayload.length) return new Map();

  const { data, error } = await supabase.rpc('programacao_etapa_b_candidatos', {
    p_supervisao: supervisao,
    p_excluir_colaborador_ids: [...excluirIds],
    p_os: osPayload,
  });
  if (error) throw error;

  const porOs = new Map();
  (data || []).forEach((row) => {
    const lista = porOs.get(row.os_id) || [];
    lista.push({
      nome: row.nome,
      cargo: row.cargo,
      coordenacao: row.coordenacao,
      supervisao: row.supervisao,
      colaboradorId: row.colaborador_id,
      tipoLabel: contratoLabel(row.tipo_contrato),
      km: row.km != null ? Number(row.km) : null,
      auditPeso: row.auditorias_peso != null ? Number(row.auditorias_peso) : null,
      veiculoId: row.veiculo_id || null,
      veiculoPlaca: row.veiculo_placa || null,
      lat: row.colab_lat != null ? Number(row.colab_lat) : null,
      lng: row.colab_lng != null ? Number(row.colab_lng) : null,
      custoTotal: row.custo_total != null ? Number(row.custo_total) : null,
      score: Number(row.score),
      scoreContrato: Number(row.score_contrato),
      scoreDistancia: Number(row.score_distancia),
      scoreAuditoria: Number(row.score_auditoria),
    });
    porOs.set(row.os_id, lista);
  });
  porOs.forEach((lista, osId) => porOs.set(osId, ordenarCandidatosPorEmbarque(lista)));
  return porOs;
}

function aplicarSugestoesRegionais(porOs, osComPonto, colaboradoresRegional, excluirIds) {
  if (!colaboradoresRegional?.length) return porOs;
  const bloqueados = new Set([...excluirIds].map(String));
  const nomesBloqueados = new Set();
  porOs.forEach((lista) => {
    (lista || []).forEach((c) => {
      const id = String(c.colaboradorId || '');
      const nome = normalizeText(c.nome);
      if (id) bloqueados.add(id);
      if (nome) nomesBloqueados.add(nome);
    });
  });
  osComPonto.forEach(({ os }) => {
    const atuais = porOs.get(os.id) || [];
    if (atuais.length) return;
    const sugestao = colaboradoresRegional.find((c) => {
      const id = String(c.colaboradorId || '');
      const nome = normalizeText(c.nome);
      return id && nome && !bloqueados.has(id) && !nomesBloqueados.has(nome);
    });
    if (!sugestao) return;
    bloqueados.add(String(sugestao.colaboradorId));
    nomesBloqueados.add(normalizeText(sugestao.nome));
    porOs.set(os.id, ordenarCandidatosPorEmbarque([{ ...sugestao, tipoLabel: sugestao.tipoLabel || 'Regional' }]));
  });
  return porOs;
}

// Tipo de contrato (Efetivo/Intermitente/Diarista) do colaborador confirmado
// em cada O.S. — reaproveita o que já veio no ranking de candidatos (se o
// confirmado estiver no top-8) e só consulta colaborador_cruzamento por CPF
// para os que faltarem (trocados manualmente / fora do ranking).
async function loadTipoContratoConfirmados(confirmadosPorOs, candidatosPorOs) {
  const mapa = new Map();
  candidatosPorOs.forEach((lista) => {
    lista.forEach((c) => {
      const id = String(c.colaboradorId || '');
      if (id && c.tipoLabel && !mapa.has(id)) mapa.set(id, c.tipoLabel);
    });
  });
  const idsConfirmados = [...confirmadosPorOs.values()].map((r) => String(r.colaborador_id));
  const cpfsFaltantes = [...new Set(idsConfirmados.filter((id) => !mapa.has(id) && /^\d+$/.test(id)))];
  if (cpfsFaltantes.length) {
    const { data, error } = await supabase.from('colaborador_cruzamento').select('cpf,tipo_contrato').in('cpf', cpfsFaltantes);
    if (!error) {
      (data || []).forEach((r) => {
        if (r.cpf && !mapa.has(r.cpf)) mapa.set(r.cpf, contratoLabel(r.tipo_contrato));
      });
    }
  }
  return mapa;
}

function brl(value) {
  return value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function candidatoOptionLabel(cand) {
  const km = cand.km != null ? `${cand.km}km` : 'sem coord.';
  const custo = cand.custoTotal != null ? `R$${brl(cand.custoTotal)}` : 'sem custo';
  const logistica = cand.veiculoId ? ' 🚐' : '';
  const hotel = precisaHotel(cand.km) ? ' 🏨' : '';
  return `${cand.nome} — ${km} — ${custo} — score ${(cand.score * 100).toFixed(0)}${logistica}${hotel}`;
}

function iniciais(nome) {
  return String(nome || '?').trim().split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase() || '?';
}

function tipoTone(label) {
  const n = normalizeText(label);
  if (n.includes('EFETIVO')) return 'ok';
  if (n.includes('INTERMITENTE')) return 'warn';
  if (n.includes('DIARISTA')) return 'info';
  return 'muted';
}

// Barra de score quebrada em Contrato / Distância / Auditoria (pesos 50/30/20
// vindos da RPC) — torna visível o que está sustentando o ranking.
function scoreSeg(cand) {
  const c = Math.max(0, Number(cand.scoreContrato) || 0);
  const d = Math.max(0, Number(cand.scoreDistancia) || 0);
  const a = Math.max(0, Number(cand.scoreAuditoria) || 0);
  const sum = c + d + a;
  if (!sum) return '<span class="peqb-score peqb-score-empty" title="Sem dados de ranking — candidato de reserva"></span>';
  const cw = Math.round((c / sum) * 100);
  const dw = Math.round((d / sum) * 100);
  const aw = Math.max(0, 100 - cw - dw);
  return `<span class="peqb-score" title="Score: Contrato / Distância / Auditoria"><i class="seg-c" style="width:${cw}%"></i><i class="seg-d" style="width:${dw}%"></i><i class="seg-a" style="width:${aw}%"></i></span>`;
}

function osHeadHtml(os, confirmado) {
  return `
    <div class="peqb-row-head"><span>${esc(os.cliente || '-')}</span><small>OS ${esc(os.numero_os || '-')}</small></div>
    <div class="peqb-row-meta">📍 ${esc(os.embarque || '-')}</div>
    <span class="peqb-chip ${confirmado ? 'ok' : 'warn'}">${confirmado ? 'Equipe confirmada' : 'Aguardando confirmação'}</span>
  `;
}

// Cartão selecionável de candidato — substitui cada <option> do antigo select.
function candCardHtml(cand, selected, minCustoId) {
  const hotel = precisaHotel(cand.km);
  const km = cand.km != null ? `${cand.km} km` : 'sem coord.';
  const custo = cand.custoTotal != null ? `R$ ${brl(cand.custoTotal)}` : 's/ custo';
  const tone = tipoTone(cand.tipoLabel);
  const ehMenor = minCustoId && cand.colaboradorId === minCustoId;
  return `<button type="button" class="peqb-cand${selected ? ' sel' : ''}" data-pick-cand="${esc(cand.colaboradorId)}">
    <span class="peqb-cand-av">${esc(iniciais(cand.nome))}</span>
    <span class="peqb-cand-main">
      <span class="peqb-cand-top">
        <strong>${esc(cand.nome)}</strong>
        <span class="peqb-cand-tag t-${tone}">${esc(cand.tipoLabel)}</span>
        ${cand.veiculoPlaca ? `<span class="peqb-cand-veic">🚐 ${esc(cand.veiculoPlaca)}</span>` : ''}
        ${hotel ? '<span class="peqb-cand-flag hotel">🏨 sugerir hotel</span>' : ''}
        ${ehMenor ? '<span class="peqb-cand-flag menor">menor custo</span>' : ''}
      </span>
      <span class="peqb-cand-sub">${esc(km)} · score ${Math.round((Number(cand.score) || 0) * 100)}</span>
      ${scoreSeg(cand)}
    </span>
    <span class="peqb-cand-cost">${esc(custo)}</span>
  </button>`;
}

function onlyPlate(value) { return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 7); }
function todayIso() { const n = new Date(); return new Date(n.getTime() - n.getTimezoneOffset() * 60000).toISOString().slice(0, 10); }

// Embarque vem como "UF – CIDADE (FAZENDA…)". Divide em 2 linhas: a 1ª com
// UF - Cidade (UF destacada) e a 2ª com o local em si (o que vier entre
// parênteses, ou o restante do texto quando não houver parênteses).
function embarqueHtml(embarque) {
  const s = String(embarque == null ? '' : embarque).trim();
  if (!s || s === '-') return '📍 -';
  const m = s.match(/^([A-Za-z]{2})\s*[–-]\s*(.+)$/);
  if (!m) return `<span class="peqb-os2-emb-l1">📍 ${esc(s)}</span>`;
  const uf = m[1].toUpperCase();
  const resto = m[2].trim();
  const p = resto.match(/^([^(]+?)\s*\(([^)]*)\)\s*$/);
  const cidade = (p ? p[1] : resto).trim();
  const local = p ? p[2].trim() : '';
  const linha1 = `<span class="peqb-os2-emb-l1">📍 <span class="peqb-os2-uf">${esc(uf)}</span> · ${esc(cidade)}</span>`;
  const linha2 = local ? `<span class="peqb-os2-emb-l2">${esc(local)}</span>` : '';
  return linha1 + linha2;
}

// Passo 2 (KPIs do atendimento): Cliente / Local de Embarque / Remanescente /
// OS sempre visíveis como tiles, no mesmo estilo visual do resumo
// "Km total estimado / OS com equipe" do topo da tela (.peqb-kpi) — antes
// eram chips inline junto do nome do cliente.
function osLeftHtml(os, { hideStatusStrip = false, dataReferencia = null } = {}) {
  const rem = os.remanescente;
  return `<div class="peqb-os2-left">
    <div class="peqb-os2-kpis">
      <div class="peqb-os2-kpi peqb-os2-kpi-wide"><span>Cliente</span><strong>${esc(os.cliente || '-')}</strong></div>
      <div class="peqb-os2-kpi peqb-os2-kpi-wide"><span>Local de embarque</span><strong>${embarqueHtml(os.embarque)}</strong></div>
      <div class="peqb-os2-kpi"><span>Remanescente</span><strong>${rem != null && rem !== '' ? BRI.format(Number(rem) || 0) : '-'}</strong></div>
      <div class="peqb-os2-kpi"><span>OS</span><strong>${esc(os.numero_os || '-')}</strong></div>
    </div>
    ${hideStatusStrip ? '' : `<div class="peqb-os2-tagsrow">${statusStripHtml(os, dataReferencia)}</div>`}
  </div>`;
}

// Opções do dropdown de TROCA: todos os colaboradores ativos da regional
// (item.colaboradoresRegional). Os já escalados em OUTRA OS recebem ♻ + nº da
// OS. O confirmado atual fica selecionado (e entra na lista mesmo se já não
// estiver no snapshot ativo).
function trocarOptionsHtml(item) {
  const confirmadoRow = item.confirmadoRow;
  const currentId = String(confirmadoRow.colaborador_id);
  const escalados = item.escaladosPorColab || new Map();
  const osNumero = item.os?.numero_os;
  const lista = (item.colaboradoresRegional || []).slice();
  if (!lista.some((c) => String(c.colaboradorId) === currentId)) {
    lista.unshift({ colaboradorId: currentId, nome: confirmadoRow.nome_colaborador });
  }
  return lista.map((c) => {
    const id = String(c.colaboradorId);
    const escaladoEmOutra = escalados.has(id) && escalados.get(id) != null && escalados.get(id) !== osNumero;
    const label = `${escaladoEmOutra ? '♻ ' : ''}${c.nome}${escaladoEmOutra ? ` · OS ${escalados.get(id)}` : ''}`;
    return `<option value="${esc(id)}" ${id === currentId ? 'selected' : ''}>${esc(label)}</option>`;
  }).join('');
}

function equipeIds(item) {
  return new Set((item.equipeRows || []).map((r) => String(r.colaborador_id)).filter(Boolean));
}

function addColabOptionsHtml(item) {
  const atuais = equipeIds(item);
  const escalados = item.escaladosPorColab || new Map();
  const osNumero = item.os?.numero_os;
  const candidatos = [...(item.candidatos || []), ...(item.colaboradoresRegional || [])];
  const seen = new Set();
  const options = candidatos
    .filter((c) => {
      const id = String(c.colaboradorId || '');
      if (!id || atuais.has(id) || seen.has(id)) return false;
      seen.add(id);
      return true;
    })
    .map((c) => {
      const id = String(c.colaboradorId);
      const escaladoEmOutra = escalados.has(id) && escalados.get(id) != null && escalados.get(id) !== osNumero;
      const label = `${escaladoEmOutra ? '♻ ' : ''}${c.nome}${escaladoEmOutra ? ` · OS ${escalados.get(id)}` : ''}`;
      return `<option value="${esc(id)}">${esc(label)}</option>`;
    });
  return options.length ? options.join('') : '<option value="">Sem colaborador disponível</option>';
}

function colabsExtrasHtml(item) {
  const extras = (item.equipeRows || []).filter((r) => String(r.colaborador_id) !== String(item.confirmadoRow?.colaborador_id));
  if (!extras.length) return '';
  return `<div class="peqb-extra-colabs">${extras.map((r) => `
    <span class="peqb-extra-colab" title="Colaborador adicional nesta O.S.">
      <span class="peqb-cand-av">${esc(iniciais(r.nome_colaborador || r.colaborador_id))}</span>
      <span class="peqb-cand-tag peqb-conf-tag t-info">Adicional</span>
      <span class="peqb-name-sel">${esc(r.nome_colaborador || r.colaborador_id)}</span>
      <button type="button" data-remover-adicional="${esc(r.id)}" title="Remover colaborador">×</button>
    </span>`).join('')}</div>`;
}

// Motorista com frota vinculada (placaAuto) pode ser marcado como
// Atendimento (disponibilidade=OK) ou Logística (LOGISTICA) — hoje isso é
// só um efeito colateral automático de confirmarCandidato/adicionarColaboradorOs;
// este toggle deixa a escolha explícita pro gestor.
function dispToggleHtml(colaboradorId, dispAtual) {
  const isLogistica = disponibilidadeCategoriaLocal(dispAtual) === 'LOGISTICA';
  const btn = (valor, label, ativo) =>
    `<button type="button" class="peqb-row-btn ${ativo ? '' : ''}" data-disp-toggle="${esc(valor)}" data-disp-colab="${esc(colaboradorId)}" style="${ativo ? 'border-color:rgba(134,239,172,.5);background:rgba(22,163,74,.28);color:#bbf7d0' : ''}">${label}</button>`;
  return `<div class="peqb-row-actions" style="margin-top:6px" title="Motorista com frota vinculada — Atendimento ou Logística no dia">
    <span class="peqb-clab" style="align-self:center">🚗</span>
    ${btn('OK', 'Atendimento', !isLogistica)}
    ${btn('LOGISTICA', 'Logística', isLogistica)}
  </div>`;
}
function disponibilidadeCategoriaLocal(value) {
  return normalizeText(value || '') === 'LOGISTICA' ? 'LOGISTICA' : 'OK';
}

function osRowHtml(item) {
  const { os, confirmadoRow, candidatos } = item;
  const confirmado = !!confirmadoRow;

  let right;
  if (confirmado) {
    const km = confirmadoRow.km_estimado != null ? Number(confirmadoRow.km_estimado) : null;
    const custoKm = estimarCustoKm(km);
    const hotelJaPedido = hotelSolicitadoIds.has(os.id);
    const hotelBtn = precisaHotel(km)
      ? (hotelJaPedido
        ? '<button type="button" class="peqb-row-btn hotel done" disabled>✓ Hotel solicitado</button>'
        : `<button type="button" class="peqb-row-btn hotel" data-pedir-hotel title="Combustível ida+volta estimado: R$${custoKm != null ? brl(custoKm) : '?'} — hotel pode ser mais econômico">🏨 Pedir hotel</button>`)
      : '';
    right = `<div class="peqb-os2-right">
      <div class="peqb-conf-head">
        <span class="peqb-conf-name">
          <span class="peqb-cand-av">${esc(iniciais(confirmadoRow.nome_colaborador))}</span>
          <span class="peqb-cand-tag peqb-conf-tag t-${tipoTone(item.confirmadoTipoLabel)}">${esc(item.confirmadoTipoLabel)}</span>
          <select class="peqb-name-sel" data-trocar-colab title="Trocar o colaborador (♻ = já escalado em outra OS)">
            ${trocarOptionsHtml(item)}
          </select>
          <button type="button" class="peqb-add-colab" data-toggle-add-colab title="Adicionar outro colaborador nesta O.S.">+</button>
        </span>
        ${hotelBtn}
      </div>
      ${item.custos?.placaAuto ? dispToggleHtml(confirmadoRow.colaborador_id, item.custos.dispAtual) : ''}
      ${colabsExtrasHtml(item)}
      <div class="peqb-add-box" data-add-box hidden>
        <span class="peqb-cand-av">+</span>
        <span class="peqb-cand-tag peqb-conf-tag t-info">Adicionar</span>
        <select class="peqb-name-sel" data-add-colab-select>${addColabOptionsHtml(item)}</select>
        <button type="button" class="peqb-row-btn" data-add-colab-confirm>Adicionar</button>
      </div>
      <div class="peqb-conf-km" title="Distância do colaborador até o ponto de embarque">📍 ${km != null ? `${round1(km)} km até o embarque` : 'sem coordenada do ponto'}</div>
    </div>`;
  } else {
    const selecionadoId = candidatos[0]?.colaboradorId || '';
    const comCusto = candidatos.filter((c) => c.custoTotal != null);
    const minCustoId = comCusto.length
      ? comCusto.reduce((a, b) => (a.custoTotal <= b.custoTotal ? a : b)).colaboradorId
      : null;
    const principal = candidatos[0] || null;
    const outros = candidatos.slice(1);
    const candHtml = principal
      ? candCardHtml(principal, true, minCustoId)
      : '<div class="peqb-empty" style="margin:0">Nenhum candidato disponível para esta O.S.</div>';
    const outrosHtml = outros.length
      ? `<button type="button" class="peqb-cand-more" data-toggle-outros>▾ Ver outros ${outros.length} candidato${outros.length > 1 ? 's' : ''}</button>
         <div class="peqb-cand-list" data-outros hidden>${outros.map((c) => candCardHtml(c, false, minCustoId)).join('')}</div>`
      : '';
    right = `<div class="peqb-os2-right">
      <input type="hidden" data-select-colaborador value="${esc(selecionadoId)}" />
      ${candHtml}
      ${outrosHtml}
      <div class="peqb-row-actions">
        <button type="button" class="peqb-row-btn" data-confirmar ${candidatos.length ? '' : 'disabled'}>Confirmar selecionado</button>
      </div>
    </div>`;
  }

  return `<article class="peqb-row peqb-os2 ${confirmado ? 'peqb-os2-done' : ''}" data-os-id="${esc(os.id)}">${osLeftHtml(os, { hideStatusStrip: true })}${right}</article>`;
}

function atualizarKpis(root, osComCandidatos, confirmadosPorOs) {
  const kpiKmEl = root.querySelector('#peqbKpiKm');
  const kpiOsEl = root.querySelector('#peqbKpiOs');
  const kmTotal = osComCandidatos.reduce((soma, { os }) => {
    const km = confirmadosPorOs.get(os.id)?.km_estimado;
    return soma + (Number.isFinite(km) ? km : 0);
  }, 0);
  if (kpiKmEl) kpiKmEl.textContent = `${round1(kmTotal)} km`;
  if (kpiOsEl) kpiOsEl.textContent = String(confirmadosPorOs.size);
}

// --- Mapa: desenho de preview (reta) e de rota real (frotas-roteirizar) ---
// Reaproveita o padrão visual/técnico de assets/js/modules/frotas-roteirizacao.js
// (tiles CartoDB dark, layer groups, polyline verde, marcadores circulares).

// Ícone de volante (motorista/logística — quem está com a leitura do veículo
// no patrimônio) e ícone de pin vermelho de check-in (ponto de embarque),
// no mesmo estilo visual do resto do painel.
const ICON_WHEEL_SVG = `
  <svg width="26" height="26" viewBox="0 0 26 26" xmlns="http://www.w3.org/2000/svg">
    <circle cx="13" cy="13" r="11.5" fill="#16a34a" stroke="#dcfce7" stroke-width="2"/>
    <circle cx="13" cy="13" r="7" fill="none" stroke="#052e16" stroke-width="2"/>
    <circle cx="13" cy="13" r="2" fill="#052e16"/>
    <line x1="13" y1="6.5" x2="13" y2="9.7" stroke="#052e16" stroke-width="2"/>
    <line x1="8.2" y1="16.2" x2="11.1" y2="14.4" stroke="#052e16" stroke-width="2"/>
    <line x1="17.8" y1="16.2" x2="14.9" y2="14.4" stroke="#052e16" stroke-width="2"/>
  </svg>`;
const ICON_PIN_SVG = `
  <svg width="26" height="34" viewBox="0 0 26 34" xmlns="http://www.w3.org/2000/svg">
    <path d="M13 33C13 33 24 20.5 24 12.5C24 6.15 18.85 1 12.5 1S1 6.15 1 12.5C1 20.5 13 33 13 33Z" fill="#ef4444" stroke="#fecaca" stroke-width="1.5"/>
    <circle cx="12.5" cy="12.5" r="5.2" fill="#fff"/>
  </svg>`;

function iconWheel() {
  return window.L.divIcon({ className: '', html: ICON_WHEEL_SVG, iconSize: [26, 26], iconAnchor: [13, 13] });
}
function iconPin() {
  return window.L.divIcon({ className: '', html: ICON_PIN_SVG, iconSize: [26, 34], iconAnchor: [13, 33] });
}

function criarMapState() {
  return { map: null, layerRota: null, layerPontos: null, ready: false };
}

async function garantirMapa(mapState, mountEl) {
  if (mapState.ready) return mapState.map;
  const ok = await ensureLeaflet();
  if (!ok || !window.L) return null;
  const L = window.L;
  mapState.map = L.map(mountEl, { zoomControl: true, scrollWheelZoom: true, center: [-14.235, -51.925], zoom: 4 });
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    maxZoom: 19,
    attribution: '&copy; OSM &copy; CARTO',
    subdomains: 'abcd',
  }).addTo(mapState.map);
  mapState.layerRota = L.layerGroup().addTo(mapState.map);
  mapState.layerPontos = L.layerGroup().addTo(mapState.map);
  mapState.ready = true;
  return mapState.map;
}

function desenharPolyline(mapState, bounds, { coords, geometria, dashed }) {
  const L = window.L;
  if (geometria?.type === 'LineString' && Array.isArray(geometria.coordinates)) {
    const latlngs = geometria.coordinates.map(([lng, lat]) => [lat, lng]);
    L.polyline(latlngs, { color: '#22c55e', weight: 4, opacity: 0.85 }).addTo(mapState.layerRota);
    latlngs.forEach((p) => bounds.push(p));
  } else if (Array.isArray(coords) && coords.length >= 2) {
    L.polyline(coords, { color: '#22c55e', weight: 4, opacity: 0.85, dashArray: dashed ? '6 6' : null }).addTo(mapState.layerRota);
    coords.forEach((p) => bounds.push(p));
  }
}

// Preview simples: 1 colaborador -> 1 embarque (reta), usado antes de calcular
// rotas reais ou quando a OS focada não está em nenhuma rota calculada.
function desenharNoMapa(mapState, { pontoEmbarque, colaborador, linha }) {
  const L = window.L;
  if (!L || !mapState.map) return;
  mapState.layerRota.clearLayers();
  mapState.layerPontos.clearLayers();

  const bounds = [];
  if (pontoEmbarque && hasGeo(pontoEmbarque.lat, pontoEmbarque.lng)) {
    const marker = L.marker([pontoEmbarque.lat, pontoEmbarque.lng], { icon: iconPin() });
    marker.bindTooltip(esc(pontoEmbarque.titulo || 'Embarque'), { className: 'peqb-tt' });
    mapState.layerPontos.addLayer(marker);
    bounds.push([pontoEmbarque.lat, pontoEmbarque.lng]);
  }
  if (colaborador && hasGeo(colaborador.lat, colaborador.lng)) {
    const marker = colaborador.logistica
      ? L.marker([colaborador.lat, colaborador.lng], { icon: iconWheel() })
      : L.circleMarker([colaborador.lat, colaborador.lng], { radius: 7, color: '#fff', weight: 2, fillColor: '#60a5fa', fillOpacity: 0.95 });
    marker.bindTooltip(esc(colaborador.titulo), { className: 'peqb-tt' });
    mapState.layerPontos.addLayer(marker);
    bounds.push([colaborador.lat, colaborador.lng]);
  }
  if (linha) desenharPolyline(mapState, bounds, linha);

  if (bounds.length) mapState.map.fitBounds(bounds, { padding: [28, 28], maxZoom: 13 });
}

// Desenha todas as rotas calculadas de uma vez (chamado por "Ver rotas no
// mapa"): origem do veículo com ícone de volante (é onde o motorista/
// logística está agora), paradas de coleta em azul, embarque com pin
// vermelho de check-in.
function desenharTodasRotas(mapState, rotas) {
  const L = window.L;
  if (!L || !mapState.map) return;
  mapState.layerRota.clearLayers();
  mapState.layerPontos.clearLayers();

  const bounds = [];
  rotas.forEach((rota) => {
    if (!rota.paradas.length) return;
    const coords = [rota.origem, ...rota.paradas].map((p) => [p.lat, p.lng]);
    desenharPolyline(mapState, bounds, { coords, geometria: rota.geometria });

    if (hasGeo(rota.origem?.lat, rota.origem?.lng)) {
      const marker = L.marker([rota.origem.lat, rota.origem.lng], { icon: iconWheel() });
      marker.bindTooltip(esc(`Motorista: ${rota.motorista || 'Não identificado'} · ${rota.placa}`), { className: 'peqb-tt' });
      mapState.layerPontos.addLayer(marker);
    }
    rota.paradas.forEach((p) => {
      if (!hasGeo(p.lat, p.lng)) return;
      const marker = p.tipo === 'embarque'
        ? L.marker([p.lat, p.lng], { icon: iconPin() })
        : L.circleMarker([p.lat, p.lng], { radius: 7, color: '#fff', weight: 2, fillColor: '#60a5fa', fillOpacity: 0.95 });
      const titulo = p.tipo === 'embarque' ? (p.ponto_nome || 'Embarque') : `Coleta: ${p.colaborador_nome}`;
      marker.bindTooltip(esc(titulo), { className: 'peqb-tt' });
      mapState.layerPontos.addLayer(marker);
    });
  });

  if (bounds.length) mapState.map.fitBounds(bounds, { padding: [28, 28], maxZoom: 12 });
}

// Acha o ancestral que realmente rola, para preservar a posição num refresh
// silencioso (sem isso, trocar o innerHTML joga a rolagem pro topo).
function scrollParentDe(el) {
  let p = el && el.parentElement;
  while (p) {
    const oy = getComputedStyle(p).overflowY;
    if ((oy === 'auto' || oy === 'scroll') && p.scrollHeight > p.clientHeight + 4) return p;
    p = p.parentElement;
  }
  return document.scrollingElement || document.documentElement;
}

// Etapa 1 — Situação da O.S.: só os 4 tiles (Cliente/Local de embarque/
// Remanescente/OS) + a tira de status AGUARDAR/ATENDER/FINALIZAR (+ saldo KG
// e laudo), via osLeftHtml/statusStripHtml (compartilhadas com a Etapa 2 —
// mudar o layout desses tiles afeta as duas telas). Sem colaborador, sem
// candidatos, sem mapa — isso é tudo Etapa 2 (renderProgramacaoEquipe).
export async function renderProgramacaoSituacao(content, options = {}) {
  injectStyles();
  const supervisao = String(options.supervisao || '').trim();
  const programacaoIdMap = options.programacaoIdMap instanceof Map ? options.programacaoIdMap : new Map();
  const supervisaoQuery = programacaoIdMap.size ? [...programacaoIdMap.keys()] : supervisao;

  content.innerHTML = `
    <div class="prog-section-title">
      <h4>Situação da O.S.</h4>
      <span class="badge">Etapa 1</span>
    </div>
    <div class="peqb-os-list peqb-os-list-full" id="peqsOsList"><div class="peqb-empty peqb-loading"><span class="peqb-spinner" aria-hidden="true"></span><span>Carregando O.S....</span></div></div>
  `;

  if (!currentUser) getCurrentUser().then((u) => { currentUser = u; }).catch(() => {});

  const listEl = content.querySelector('#peqsOsList');
  if (!supervisao || (!options.programacaoId && !programacaoIdMap.size)) {
    listEl.innerHTML = '<div class="peqb-empty">Carregue o contexto (supervisão e data) para ver a situação das O.S.</div>';
    return;
  }

  let osListAtual = [];

  async function carregar({ silent = false } = {}) {
    const scroller = silent ? scrollParentDe(listEl) : null;
    const scrollPos = scroller ? scroller.scrollTop : 0;
    if (!silent) listEl.innerHTML = '<div class="peqb-empty peqb-loading"><span class="peqb-spinner" aria-hidden="true"></span><span>Carregando O.S....</span></div>';
    osListAtual = await loadOsRelevantes(supervisaoQuery);
    listEl.innerHTML = osListAtual.length
      ? osListAtual.map((os) => `<article class="peqb-row peqs-row" data-os-id="${esc(os.id)}">${osLeftHtml(os, { dataReferencia: options.dataReferencia || null })}</article>`).join('')
      : '<div class="peqb-empty">Nenhuma O.S. pendente para esta supervisão.</div>';
    if (silent && scroller) scroller.scrollTop = scrollPos;
  }

  async function atualizarStatusOsLocal(osId, nextStatus, btn) {
    if (btn?.disabled) return;
    if (btn) { btn.disabled = true; btn.style.opacity = '.5'; }
    try {
      const agoraIso = new Date().toISOString();
      const patch = { status_gestor: nextStatus, configurada_em: agoraIso, observacao_logistica: null, updated_at: agoraIso };
      if (nextStatus === 'FINALIZAR') {
        patch.status_logistica = 'PENDENTE';
        patch.enviado_logistica_em = agoraIso;
        patch.logistica_solicitado_por = currentUser?.id || null;
      } else {
        patch.status_logistica = null;
        patch.enviado_logistica_em = null;
        patch.logistica_solicitado_por = null;
      }
      const { error } = await supabase.from('operacional_os').update(patch).eq('id', osId);
      if (error) throw error;
      await carregar({ silent: true });
      refreshEquipeSnapshot();
    } catch (error) {
      console.error('[programacao-situacao] status:', error);
      if (btn) { btn.disabled = false; btn.style.opacity = ''; }
      alert(error.message || 'Não foi possível atualizar a O.S.');
    }
  }

  function openKgModalLocal(osId) {
    const os = osListAtual.find((o) => String(o.id) === String(osId));
    if (!os) return;
    const ov = document.createElement('div');
    ov.className = 'peqb-modal-ov';
    ov.innerHTML = `<div class="peqb-modal"><h3>Quanto somar na O.S.?</h3><p>O.S. <b style="color:#bbf7d0">${esc(os.numero_os || '-')}</b> — vai para a Logística como saldo.</p><input id="peqsKgInput" type="number" min="1" placeholder="Inserir KG" inputmode="numeric"/><div class="peqb-modal-actions"><button type="button" class="peqb-row-btn" data-kg-cancel>Cancelar</button><button type="button" class="peqb-row-btn" data-kg-ok style="border-color:rgba(134,239,172,.4);color:#bbf7d0">Confirmar</button></div></div>`;
    document.body.appendChild(ov);
    const input = ov.querySelector('#peqsKgInput');
    input.focus();
    const close = () => ov.remove();
    ov.addEventListener('click', (e) => { if (e.target === ov) close(); });
    ov.querySelector('[data-kg-cancel]').addEventListener('click', close);
    ov.querySelector('[data-kg-ok]').addEventListener('click', async () => {
      const kg = Number(input.value);
      if (!kg || kg <= 0) { input.focus(); return; }
      const kgText = `KG solicitado pelo gestor: ${BRI.format(kg)} kg`;
      close();
      try {
        const { error } = await supabase.from('operacional_os').update({ observacao_logistica: kgText, status_gestor: 'AGUARDAR', configurada_em: null, updated_at: new Date().toISOString() }).eq('id', osId);
        if (error) throw error;
        await carregar({ silent: true });
        refreshEquipeSnapshot();
      } catch (error) { alert(error.message || 'Não foi possível solicitar saldo.'); }
    });
  }

  function openLaudoModalLocal(osId) {
    const os = osListAtual.find((o) => String(o.id) === String(osId));
    if (!os) return;
    const ov = document.createElement('div');
    ov.className = 'peqb-modal-ov';
    ov.innerHTML = `<div class="peqb-modal"><h3>Conferir · anexar laudo</h3><p>O.S. <b style="color:#bbf7d0">${esc(os.numero_os || '-')}</b> — anexe o(s) arquivo(s).</p><input id="peqsLaudoFile" type="file" multiple/><div id="peqsLaudoList" style="font-size:11px;color:#9fb7aa"></div><div class="peqb-modal-actions"><button type="button" class="peqb-row-btn" data-laudo-cancel>Cancelar</button><button type="button" class="peqb-row-btn" data-laudo-ok style="border-color:rgba(134,239,172,.4);color:#bbf7d0">Enviar</button></div></div>`;
    document.body.appendChild(ov);
    const fileInput = ov.querySelector('#peqsLaudoFile');
    const listInfo = ov.querySelector('#peqsLaudoList');
    let files = [];
    fileInput.addEventListener('change', () => { files = [...(fileInput.files || [])]; listInfo.textContent = files.map((f) => f.name).join(', '); });
    const close = () => ov.remove();
    ov.addEventListener('click', (e) => { if (e.target === ov) close(); });
    ov.querySelector('[data-laudo-cancel]').addEventListener('click', close);
    ov.querySelector('[data-laudo-ok]').addEventListener('click', async () => {
      if (!files.length) { fileInput.focus(); return; }
      const okBtn = ov.querySelector('[data-laudo-ok]');
      okBtn.disabled = true; okBtn.textContent = 'Enviando...';
      try {
        const urls = [];
        for (const file of files) {
          const path = `${osId}/${Date.now()}_${file.name.replace(/\s+/g, '_')}`;
          const { data: up, error: upErr } = await supabase.storage.from('os-laudos').upload(path, file, { upsert: true });
          if (upErr) throw upErr;
          const { data: urlData } = supabase.storage.from('os-laudos').getPublicUrl(up.path);
          urls.push(urlData.publicUrl);
        }
        const laudoText = `LAUDO:${urls.join(',')}`;
        const { error } = await supabase.from('operacional_os').update({ observacao_logistica: laudoText, updated_at: new Date().toISOString() }).eq('id', osId);
        if (error) throw error;
        close();
        await carregar({ silent: true });
      } catch (error) {
        okBtn.disabled = false; okBtn.textContent = 'Enviar';
        alert(error.message || 'Não foi possível anexar o laudo.');
      }
    });
  }

  listEl.addEventListener('click', async (event) => {
    const statusBtn = event.target.closest('[data-status]');
    if (statusBtn) { await atualizarStatusOsLocal(statusBtn.dataset.os, statusBtn.dataset.status, statusBtn); return; }
    const kgBtn = event.target.closest('[data-kg]');
    if (kgBtn) { openKgModalLocal(kgBtn.dataset.kg); return; }
    const confBtn = event.target.closest('[data-conf]');
    if (confBtn) { openLaudoModalLocal(confBtn.dataset.conf); return; }
  });

  await carregar();
}

export async function renderProgramacaoEquipe(content, options = {}) {
  injectStyles();
  const supervisao = String(options.supervisao || '').trim();
  const programacaoId = options.programacaoId || null;
  const programacaoIdMap = options.programacaoIdMap instanceof Map ? options.programacaoIdMap : new Map();
  // Sob "Todas" (programacaoIdMap populado), cada O.S. resolve seu próprio
  // programacao_id pela própria supervisão; fora disso, todas usam o único id.
  const supervisaoQuery = programacaoIdMap.size ? [...programacaoIdMap.keys()] : supervisao;
  const programacaoIdQuery = programacaoIdMap.size ? [...programacaoIdMap.values()] : programacaoId;
  function programacaoIdParaOs(os) {
    return programacaoIdMap.size ? (programacaoIdMap.get(os?.supervisao) || null) : programacaoId;
  }

  content.innerHTML = `
    <div class="prog-section-title">
      <h4>Equipe + Mapa — colaborador por O.S.</h4>
      <span class="badge">Etapa 2</span>
    </div>
    <div class="peqb-kpis">
      <div class="peqb-kpi"><span>Km total estimado</span><strong id="peqbKpiKm">0 km</strong></div>
      <div class="peqb-kpi"><span>OS com equipe</span><strong id="peqbKpiOs">0</strong></div>
    </div>
    <div class="peqb-legend"><b>Score:</b> <span><i class="lg-c"></i>Contrato 50%</span> <span><i class="lg-d"></i>Distância 30%</span> <span><i class="lg-a"></i>Auditoria 20%</span></div>
    <div class="peqb-toolbar">
      <button type="button" class="peqb-btn" id="peqbAutoPreencher">Auto-preencher equipe</button>
      <button type="button" class="peqb-btn" id="peqbSugerirCaronas" title="Motorista/carona por frota (desvio ≤ ${CARONA_DESVIO_KM} km), sobra vira próprio/Uber">Sugerir caronas</button>
      <span id="peqbCaronasMsg" style="font-size:11.5px;color:#9fb7aa;align-self:center"></span>
      <button type="button" class="peqb-btn" id="peqbVerMapa">🗺️ Ver mapa do gestor</button>
    </div>
    <div id="peqbMapBand" hidden></div>
    <div class="peqb-os-list peqb-os-list-full" id="peqbOsList"><div class="peqb-empty peqb-loading"><span class="peqb-spinner" aria-hidden="true"></span><span>Carregando O.S....</span></div></div>
  `;

  // Ponte para o módulo do mapa (programacao-mapa-gestor.js), carregado à
  // parte e só ativado no clique de "Ver mapa do gestor" — mantém o mapa
  // (Leaflet + geocodificação) fora do caminho crítico do render da lista de
  // O.S., que já travou a tela 2x no passado quando isso era síncrono.
  window.__peqbGetEquipeSnapshot = () => ({
    osComCandidatosAtual,
    supervisoesResolvidas: programacaoIdMap.size ? [...programacaoIdMap.keys()] : [supervisao],
    programacaoIdParaOs,
    dataReferencia: options.dataReferencia || null,
  });

  // Ponte pro drag-and-drop do mapa (programacao-gestor-hotfix-manual-v3.js):
  // atualização incremental depois de vincular um marcador. carregarERenderizar
  // com silent:true só troca #peqbOsList (a lista de O.S.) e o snapshot acima —
  // não mexe em #peqbMapBand, então a instância do Leaflet continua viva e só
  // repinta os marcadores, sem o "piscar" de recriar as 3 abas do zero.
  window.__peqbSilentRefresh = () => carregarERenderizar({ silent: true });

  // currentUser é opcional (só preenche logistica_solicitado_por ao FINALIZAR).
  // Busca SEM bloquear o render — assim o #peqbOsList já existe acima e o
  // observer da Fase 1 não re-renderiza em loop se a chamada de auth demorar.
  if (!currentUser) getCurrentUser().then((u) => { currentUser = u; }).catch(() => {});

  const listEl = content.querySelector('#peqbOsList');
  const mapMount = content.querySelector('#peqbMapEl');
  const mapEmptyEl = content.querySelector('#peqbMapEmpty');
  const mapState = criarMapState();

  if (!supervisao || (!programacaoId && !programacaoIdMap.size)) {
    listEl.innerHTML = '<div class="peqb-empty">Carregue o contexto (supervisão e data) para organizar a equipe.</div>';
    return;
  }

  let carregando = false;
  let autoPreencherPendente = !!options.autoPreencher;
  let osComCandidatosAtual = [];
  let osTodasAtual = [];

  // Confirma o candidato de menor custo para cada O.S. ainda sem equipe.
  // Usado pelo botão "Auto-preencher" e pelo preenchimento automático inicial
  // (que roda antes do 1º render, pra não mostrar os cards não confirmados).
  async function confirmarPendentesAuto() {
    // Decide as escalas EM MEMÓRIA (rápido, sem rede), evitando escalar a mesma
    // pessoa em duas O.S., e só então grava tudo em LOTE (poucas chamadas).
    const pendentes = osComCandidatosAtual.filter((it) => !it.confirmadoRow && it.candidatos.length);
    const usados = new Set();
    const atribuicoes = [];
    for (const item of pendentes) {
      const disponiveis = item.candidatos.filter((c) => !usados.has(c.colaboradorId));
      const melhor = melhorCandidatoEmbarque(disponiveis);
      if (!melhor) continue;
      usados.add(melhor.colaboradorId);
      atribuicoes.push({ os: item.os, cand: melhor });
    }
    if (atribuicoes.length) await confirmarCandidatosEmLote(programacaoIdParaOs, atribuicoes);
  }

  // Sugere caronas: por ponto de embarque, quem tem frota é MOTORISTA; passageiros
  // entram como CARONA se o DESVIO do frota (dMP+dPE−dME) ≤ T, atribuídos ao frota
  // de menor desvio (cap CARONA_CAP). Quem sobra: REEMBOLSO KM se na relação de
  // veículo próprio, senão UBER/TÁXI. Grava tipo_deslocamento em lote e devolve o resumo.
  async function sugerirCaronas() {
    // Sob "Todas" a RPC (escopada a 1 programacao_id) roda uma vez por
    // supervisão resolvida; cada linha guarda de qual programacao_id veio,
    // pra gravar tipo_deslocamento no registro certo mais abaixo.
    const idsAlvo = programacaoIdMap.size ? [...programacaoIdMap.values()] : [programacaoId];
    const resultadosRpc = await Promise.all(idsAlvo.map((pid) => supabase.rpc('programacao_caronas_dados', { p_programacao_id: pid })));
    const rows = [];
    resultadosRpc.forEach(({ data, error }, idx) => {
      if (error) throw error;
      (data || []).forEach((r) => rows.push({ ...r, __programacaoId: idsAlvo[idx] }));
    });
    const resultado = new Map();

    const porPonto = new Map();
    rows.forEach((r) => {
      const key = r.ponto_id || `__sem_ponto__${r.colaborador_id}`;
      if (!porPonto.has(key)) porPonto.set(key, []);
      porPonto.get(key).push(r);
    });

    porPonto.forEach((grupo) => {
      const motoristas = grupo
        .filter((r) => r.tem_frota && r.lat != null && r.emb_lat != null)
        .map((r) => ({ r, vagas: CARONA_CAP }));
      const passageiros = grupo.filter((r) => !r.tem_frota);

      motoristas.forEach(({ r }) => resultado.set(r.colaborador_id, { tipo: 'MOTORISTA FROTA', placa: r.veiculo_placa || '' }));

      const pares = [];
      passageiros.forEach((p) => {
        if (p.lat == null || p.emb_lat == null) return;
        motoristas.forEach((m) => {
          const dME = kmEntre(m.r.lat, m.r.lng, p.emb_lat, p.emb_lng);
          const dMP = kmEntre(m.r.lat, m.r.lng, p.lat, p.lng);
          const dPE = kmEntre(p.lat, p.lng, p.emb_lat, p.emb_lng);
          if (dME == null || dMP == null || dPE == null) return;
          const desvio = dMP + dPE - dME;
          if (desvio <= CARONA_DESVIO_KM) pares.push({ p, m, desvio });
        });
      });
      pares.sort((a, b) => a.desvio - b.desvio);
      const atribuido = new Set();
      pares.forEach(({ p, m }) => {
        if (atribuido.has(p.colaborador_id) || m.vagas <= 0) return;
        m.vagas -= 1;
        atribuido.add(p.colaborador_id);
        // Carona carrega a PLACA do frota (igual ao motorista) — é o vínculo visível.
        resultado.set(p.colaborador_id, { tipo: 'CARONA FROTA', placa: m.r.veiculo_placa || '' });
      });

      passageiros.forEach((p) => {
        if (atribuido.has(p.colaborador_id)) return;
        resultado.set(p.colaborador_id, {
          tipo: p.veiculo_proprio ? 'REEMBOLSO KM' : 'UBER/TÁXI',
          placa: '',
        });
      });
    });

    const payload = [];
    rows.forEach((r) => {
      const res = resultado.get(r.colaborador_id);
      if (!res) return;
      payload.push({
        programacao_id: r.__programacaoId || programacaoId,
        data_referencia: options.dataReferencia || null,
        colaborador_id: r.colaborador_id,
        nome_colaborador: r.nome || '',
        tipo_deslocamento: res.tipo,
        placa_veiculo: onlyPlate(res.placa || ''),
      });
    });
    if (payload.length) {
      const { error: upErr } = await supabase.from('programacao_deslocamento').upsert(payload, { onConflict: 'programacao_id,colaborador_id' });
      if (upErr) throw upErr;
    }

    const cont = { mot: 0, car: 0, prop: 0, uber: 0 };
    resultado.forEach((v) => {
      if (v.tipo === 'MOTORISTA FROTA') cont.mot += 1;
      else if (v.tipo === 'CARONA FROTA') cont.car += 1;
      else if (v.tipo === 'REEMBOLSO KM') cont.prop += 1;
      else cont.uber += 1;
    });
    return cont;
  }
  let rotasPorOsId = new Map(); // os_id -> rota completa (frotas-roteirizar), só após "Ver rotas no mapa"
  let rotasCompletas = []; // todas as rotas relevantes (sem duplicar veículo), desenhadas juntas no mapa
  let focoOsId = null;

  function candidatoSelecionado(item) {
    const select = listEl.querySelector(`[data-os-id="${item.os.id}"] [data-select-colaborador]`);
    const id = select?.value || item.confirmadoRow?.colaborador_id || item.candidatos[0]?.colaboradorId;
    return item.candidatos.find((c) => c.colaboradorId === id) || null;
  }

  async function atualizarMapaParaOs(osId) {
    focoOsId = osId;
    listEl.querySelectorAll('.peqb-row').forEach((row) => row.classList.toggle('focus', row.dataset.osId === osId));
    if (!mapMount) return; // mapa removido desta tela

    const item = osComCandidatosAtual.find((it) => String(it.os.id) === osId);
    if (!item || !item.ponto) {
      mapEmptyEl.style.display = 'flex';
      mapEmptyEl.textContent = 'Sem coordenadas de embarque para esta OS.';
      return;
    }

    const map = await garantirMapa(mapState, mapMount);
    if (!map) {
      mapEmptyEl.style.display = 'flex';
      mapEmptyEl.textContent = 'Não foi possível carregar o mapa (sem conexão com o Leaflet).';
      return;
    }
    mapEmptyEl.style.display = 'none';

    // Com "Ver rotas no mapa" já calculado, todas as rotas ficam visíveis ao
    // mesmo tempo — clicar numa OS só dá zoom/foco na rota dela específica.
    if (rotasCompletas.length) {
      desenharTodasRotas(mapState, rotasCompletas);
      const rotaDaOs = rotasPorOsId.get(osId);
      if (rotaDaOs) {
        const bounds = [rotaDaOs.origem, ...rotaDaOs.paradas].map((p) => [p.lat, p.lng]);
        map.fitBounds(bounds, { padding: [40, 40], maxZoom: 13 });
      }
      return;
    }

    const cand = candidatoSelecionado(item);
    desenharNoMapa(mapState, {
      pontoEmbarque: { lat: item.ponto.lat, lng: item.ponto.lng, titulo: item.ponto.nome || 'Embarque' },
      colaborador: cand && hasGeo(cand.lat, cand.lng) ? { lat: cand.lat, lng: cand.lng, titulo: cand.nome, logistica: !!cand.veiculoId } : null,
      linha: cand && hasGeo(cand.lat, cand.lng) ? { coords: [[cand.lat, cand.lng], [item.ponto.lat, item.ponto.lng]], dashed: true } : null,
    });
    if (!cand || !hasGeo(cand?.lat, cand?.lng)) {
      mapEmptyEl.style.display = 'flex';
      mapEmptyEl.textContent = 'Colaborador sem coordenadas — mostrando só o ponto de embarque.';
    }
  }

  // silent = refresh sem piscar: mantém a lista visível durante o fetch e
  // preserva a rolagem (em vez de zerar com "Carregando..." e pular pro topo).
  async function carregarERenderizar({ silent = false } = {}) {
    if (carregando) return;
    carregando = true;
    const scroller = silent ? scrollParentDe(listEl) : null;
    const scrollPos = scroller ? scroller.scrollTop : 0;
    if (!silent) listEl.innerHTML = '<div class="peqb-empty peqb-loading"><span class="peqb-spinner" aria-hidden="true"></span><span>Carregando O.S. da supervisão...</span></div>';
    try {
      const [osTodas, equipeRows, custos] = await Promise.all([loadOsRelevantes(supervisaoQuery), loadEquipeExistente(programacaoIdQuery), loadCustos(programacaoIdQuery)]);
      osTodasAtual = osTodas;
      const placasPorCpf = await loadCruzamentoPlacas(supervisaoQuery);
      const colaboradoresRegional = await loadColaboradoresRegional(supervisaoQuery);
      if (!osTodas.length) {
        listEl.innerHTML = '<div class="peqb-empty">Nenhuma O.S. pendente para esta supervisão.</div>';
        osComCandidatosAtual = [];
        return;
      }

      const atenderRows = osTodas.filter((os) => statusNorm(os) === 'ATENDER');

      const pontosPorId = await loadPontos([...new Set(atenderRows.map((os) => os.ponto_embarque_id).filter(Boolean))]);

      const confirmadosPorOs = new Map();
      const equipeRowsPorOs = new Map();
      equipeRows.filter((r) => r.confirmado).forEach((r) => {
        const lista = equipeRowsPorOs.get(r.os_id) || [];
        lista.push(r);
        equipeRowsPorOs.set(r.os_id, lista);
        if (!confirmadosPorOs.has(r.os_id)) confirmadosPorOs.set(r.os_id, r);
      });
      const colaboradoresConfirmadosEmOutraOs = new Set(equipeRows.filter((r) => r.confirmado).map((r) => r.colaborador_id));
      // Mapa colaborador_id -> OS onde já está escalado (para marcar ♻ no dropdown de troca).
      const numeroPorOsId = new Map(osTodas.map((o) => [o.id, o.numero_os]));
      const escaladosPorColab = new Map();
      equipeRows.filter((r) => r.confirmado).forEach((r) => escaladosPorColab.set(String(r.colaborador_id), numeroPorOsId.get(r.os_id) || null));

      const osComPonto = atenderRows.map((os) => {
        const confirmadoRow = confirmadosPorOs.get(os.id) || null;
        // Carrega candidatos para TODAS as OS (inclusive confirmadas), para o
        // dropdown de troca do nome ter alternativas.
        return { os, ponto: pontoDaOs(os, pontosPorId), confirmadoRow, candidatosNecessarios: true };
      });
      const candidatosPorOs = aplicarSugestoesRegionais(
        await loadCandidatosPorOs(supervisao, osComPonto, colaboradoresConfirmadosEmOutraOs),
        osComPonto,
        colaboradoresRegional,
        colaboradoresConfirmadosEmOutraOs,
      );
      const tipoLabelPorColaborador = await loadTipoContratoConfirmados(confirmadosPorOs, candidatosPorOs);
      const dispPorColaborador = await loadDisponibilidadeConfirmados(programacaoIdQuery, [...confirmadosPorOs.values()].map((r) => r.colaborador_id));

      osComCandidatosAtual = osComPonto.map(({ os, ponto, confirmadoRow }) => {
        const equipeRowsOs = equipeRowsPorOs.get(os.id) || (confirmadoRow ? [confirmadoRow] : []);
        return {
          os,
          ponto,
          confirmadoRow,
          equipeRows: equipeRowsOs,
          confirmadoTipoLabel: confirmadoRow ? (tipoLabelPorColaborador.get(String(confirmadoRow.colaborador_id)) || 'Não informado') : null,
          candidatos: ordenarCandidatosPorEmbarque(confirmadoRow
            ? [{ colaboradorId: confirmadoRow.colaborador_id, nome: confirmadoRow.nome_colaborador, km: confirmadoRow.km_estimado != null ? Number(confirmadoRow.km_estimado) : null, custoTotal: null }, ...(candidatosPorOs.get(os.id) || [])]
            : (candidatosPorOs.get(os.id) || [])),
          colaboradoresRegional,
          escaladosPorColab,
          custos: confirmadoRow ? {
            est: custos.est.get(String(confirmadoRow.colaborador_id)) || {},
            ali: custos.ali.get(String(confirmadoRow.colaborador_id)) || { almoco: true },
            des: custos.des.get(String(confirmadoRow.colaborador_id)) || {},
            placaAuto: placasPorCpf.get(String(confirmadoRow.colaborador_id).replace(/\D/g, '')) || '',
            dispAtual: confirmadoRow ? (dispPorColaborador.get(String(confirmadoRow.colaborador_id)) || null) : null,
          } : null,
        };
      });

      // Auto-preenchimento de menor custo ANTES do 1º render visível: evita
      // exibir os cards não confirmados (que pareciam um bug). Roda só uma vez.
      if (autoPreencherPendente && osComCandidatosAtual.some((it) => !it.confirmadoRow && it.candidatos.length)) {
        autoPreencherPendente = false;
        listEl.innerHTML = '<div class="peqb-empty peqb-loading"><span class="peqb-spinner" aria-hidden="true"></span><span>Preparando equipe de menor custo...</span></div>';
        await confirmarPendentesAuto();
        carregando = false;
        return carregarERenderizar({ silent: true });
      }

      listEl.innerHTML = osComCandidatosAtual.length
        ? `<div class="peqb-block-head">Equipe da O.S. · ${osComCandidatosAtual.length}</div>${osComCandidatosAtual.map(osRowHtml).join('')}`
        : '<div class="peqb-empty">Nenhuma O.S. marcada para atender ainda. Volte à Etapa 1 (Situação da O.S.) e marque ATENDER nas O.S. desejadas.</div>';
      if (silent && scroller) scroller.scrollTop = scrollPos;

      // Persiste (uma vez) a placa puxada da leitura do veículo para motoristas
      // confirmados sem deslocamento gravado — assim a placa fica salva sem o
      // gestor precisar tocar. Na próxima carga já vem de des.placa_veiculo.
      osComCandidatosAtual.forEach((it) => {
        if (it.confirmadoRow && it.custos?.placaAuto && !it.custos.des?.placa_veiculo) {
          supabase.from('programacao_deslocamento').upsert({
            programacao_id: programacaoIdParaOs(it.os),
            data_referencia: options.dataReferencia || null,
            colaborador_id: String(it.confirmadoRow.colaborador_id),
            nome_colaborador: it.confirmadoRow.nome_colaborador || '',
            tipo_deslocamento: 'MOTORISTA FROTA',
            placa_veiculo: onlyPlate(it.custos.placaAuto),
          }, { onConflict: 'programacao_id,colaborador_id' }).then(({ error }) => { if (error) console.warn('[equipe] auto-placa', error); });
        }
      });

      atualizarKpis(content, osComCandidatosAtual, confirmadosPorOs);

      if (mapMount && osComCandidatosAtual.length) {
        const manterFoco = focoOsId && osComCandidatosAtual.some((it) => String(it.os.id) === focoOsId);
        await atualizarMapaParaOs(manterFoco ? focoOsId : String(osComCandidatosAtual[0].os.id));
      }
    } catch (error) {
      console.error('[programacao-equipe] render:', error);
      listEl.innerHTML = `<div class="peqb-empty">${esc(error.message || 'Erro ao montar a equipe.')}</div>`;
    } finally {
      carregando = false;
    }
  }

  async function atualizarStatusOs(osId, nextStatus, btn) {
    if (btn?.disabled) return;
    if (btn) { btn.disabled = true; btn.style.opacity = '.5'; }
    try {
      const agoraIso = new Date().toISOString();
      const patch = { status_gestor: nextStatus, configurada_em: agoraIso, observacao_logistica: null, updated_at: agoraIso };
      if (nextStatus === 'FINALIZAR') {
        patch.status_logistica = 'PENDENTE';
        patch.enviado_logistica_em = agoraIso;
        patch.logistica_solicitado_por = currentUser?.id || null;
      } else {
        patch.status_logistica = null;
        patch.enviado_logistica_em = null;
        patch.logistica_solicitado_por = null;
      }
      const { error } = await supabase.from('operacional_os').update(patch).eq('id', osId);
      if (error) throw error;
      await carregarERenderizar({ silent: true });
    } catch (error) {
      console.error('[programacao-equipe] status:', error);
      if (btn) { btn.disabled = false; btn.style.opacity = ''; }
      alert(error.message || 'Não foi possível atualizar a O.S.');
    }
  }

  function openKgModal(osId) {
    const os = osTodasAtual.find((o) => String(o.id) === String(osId));
    if (!os) return;
    const ov = document.createElement('div');
    ov.className = 'peqb-modal-ov';
    ov.innerHTML = `<div class="peqb-modal"><h3>Quanto somar na O.S.?</h3><p>O.S. <b style="color:#bbf7d0">${esc(os.numero_os || '-')}</b> — vai para a Logística como saldo.</p><input id="peqbKgInput" type="number" min="1" placeholder="Inserir KG" inputmode="numeric"/><div class="peqb-modal-actions"><button type="button" class="peqb-row-btn" data-kg-cancel>Cancelar</button><button type="button" class="peqb-row-btn" data-kg-ok style="border-color:rgba(134,239,172,.4);color:#bbf7d0">Confirmar</button></div></div>`;
    document.body.appendChild(ov);
    const input = ov.querySelector('#peqbKgInput');
    input.focus();
    const close = () => ov.remove();
    ov.addEventListener('click', (e) => { if (e.target === ov) close(); });
    ov.querySelector('[data-kg-cancel]').addEventListener('click', close);
    ov.querySelector('[data-kg-ok]').addEventListener('click', async () => {
      const kg = Number(input.value);
      if (!kg || kg <= 0) { input.focus(); return; }
      const kgText = `KG solicitado pelo gestor: ${BRI.format(kg)} kg`;
      close();
      try {
        const { error } = await supabase.from('operacional_os').update({ observacao_logistica: kgText, status_gestor: 'AGUARDAR', configurada_em: null, updated_at: new Date().toISOString() }).eq('id', osId);
        if (error) throw error;
        await carregarERenderizar({ silent: true });
      } catch (error) { alert(error.message || 'Não foi possível solicitar saldo.'); }
    });
  }

  // "2 no ponto": ao adicionar o 2º+ colaborador numa mesma O.S., o gestor
  // precisa justificar o motivo — registrado em app_logs_usuarios (via
  // logActivity), não existe tabela dedicada pra isso na base atual.
  function openJustificativaModal(os, colaboradoresAtuais, novoColaborador) {
    return new Promise((resolve) => {
      const nomesAtuais = colaboradoresAtuais.map((c) => c.nome_colaborador || c.nome).filter(Boolean).join(', ');
      const ov = document.createElement('div');
      ov.className = 'peqb-modal-ov';
      ov.innerHTML = `<div class="peqb-modal">
        <h3>Justificar 2+ colaboradores na O.S.</h3>
        <p>O.S. <b style="color:#bbf7d0">${esc(os.numero_os || '-')}</b> já tem <b>${esc(nomesAtuais || '-')}</b>.
        Adicionar <b style="color:#bbf7d0">${esc(novoColaborador.nome || '-')}</b> também — informe o motivo (obrigatório):</p>
        <textarea id="peqbJustifInput" rows="3" placeholder="Ex.: volume da carga exige 2 pessoas no ponto" style="width:100%;resize:vertical;background:#0d0d18;color:#e2e2f0;border:1px solid rgba(52,211,153,.28);border-radius:10px;padding:9px 10px;font-size:13px"></textarea>
        <div class="peqb-modal-actions">
          <button type="button" class="peqb-row-btn" data-justif-cancel>Cancelar</button>
          <button type="button" class="peqb-row-btn" data-justif-ok style="border-color:rgba(134,239,172,.4);color:#bbf7d0">Confirmar</button>
        </div>
      </div>`;
      document.body.appendChild(ov);
      const input = ov.querySelector('#peqbJustifInput');
      input.focus();
      const close = (motivo) => { ov.remove(); resolve(motivo); };
      ov.addEventListener('click', (e) => { if (e.target === ov) close(null); });
      ov.querySelector('[data-justif-cancel]').addEventListener('click', () => close(null));
      ov.querySelector('[data-justif-ok]').addEventListener('click', () => {
        const motivo = input.value.trim();
        if (!motivo) { input.focus(); return; }
        close(motivo);
      });
    });
  }

  function openLaudoModal(osId) {
    const os = osTodasAtual.find((o) => String(o.id) === String(osId));
    if (!os) return;
    const ov = document.createElement('div');
    ov.className = 'peqb-modal-ov';
    ov.innerHTML = `<div class="peqb-modal"><h3>Conferir · anexar laudo</h3><p>O.S. <b style="color:#bbf7d0">${esc(os.numero_os || '-')}</b> — anexe o(s) arquivo(s).</p><input id="peqbLaudoFile" type="file" multiple/><div id="peqbLaudoList" style="font-size:11px;color:#9fb7aa"></div><div class="peqb-modal-actions"><button type="button" class="peqb-row-btn" data-laudo-cancel>Cancelar</button><button type="button" class="peqb-row-btn" data-laudo-ok style="border-color:rgba(134,239,172,.4);color:#bbf7d0">Enviar</button></div></div>`;
    document.body.appendChild(ov);
    const fileInput = ov.querySelector('#peqbLaudoFile');
    const listInfo = ov.querySelector('#peqbLaudoList');
    let files = [];
    fileInput.addEventListener('change', () => { files = [...(fileInput.files || [])]; listInfo.textContent = files.map((f) => f.name).join(', '); });
    const close = () => ov.remove();
    ov.addEventListener('click', (e) => { if (e.target === ov) close(); });
    ov.querySelector('[data-laudo-cancel]').addEventListener('click', close);
    ov.querySelector('[data-laudo-ok]').addEventListener('click', async () => {
      if (!files.length) { fileInput.focus(); return; }
      const okBtn = ov.querySelector('[data-laudo-ok]');
      okBtn.disabled = true; okBtn.textContent = 'Enviando...';
      try {
        const urls = [];
        for (const file of files) {
          const path = `${osId}/${Date.now()}_${file.name.replace(/\s+/g, '_')}`;
          const { data: up, error: upErr } = await supabase.storage.from('os-laudos').upload(path, file, { upsert: true });
          if (upErr) throw upErr;
          const { data: urlData } = supabase.storage.from('os-laudos').getPublicUrl(up.path);
          urls.push(urlData.publicUrl);
        }
        const laudoText = `LAUDO:${urls.join(',')}`;
        const { error } = await supabase.from('operacional_os').update({ observacao_logistica: laudoText, updated_at: new Date().toISOString() }).eq('id', osId);
        if (error) throw error;
        close();
        await carregarERenderizar({ silent: true });
      } catch (error) {
        okBtn.disabled = false; okBtn.textContent = 'Enviar';
        alert(error.message || 'Não foi possível anexar o laudo.');
      }
    });
  }

  async function copiarCustosDoPrincipal(item, cand) {
    if (!item?.confirmadoRow || !cand?.colaboradorId) return;
    const origemId = String(item.confirmadoRow.colaborador_id);
    const destinoBase = {
      programacao_id: programacaoIdParaOs(item.os),
      data_referencia: options.dataReferencia || null,
      colaborador_id: cand.colaboradorId,
      nome_colaborador: cand.nome || '',
    };
    const est = item.custos?.est || {};
    const ali = item.custos?.ali || { almoco: true };
    const des = item.custos?.des || {};
    await Promise.all([
      (Object.keys(est).length || origemId) ? supabase.from('programacao_estadia').upsert({
        ...destinoBase,
        tipo_estadia: est.tipo_estadia || 'CASA',
        tem_estadia: !!est.tem_estadia,
        cidade: est.cidade || null,
        alojamento_id: est.alojamento_id || null,
        alojamento_nome: est.alojamento_nome || null,
        hotel_id: est.hotel_id || null,
        nome_hotel: est.nome_hotel || null,
        checkin: est.checkin || options.dataReferencia || todayIso(),
        checkout: est.checkout || options.dataReferencia || todayIso(),
      }, { onConflict: 'programacao_id,colaborador_id' }) : null,
      supabase.from('programacao_alimentacao').upsert({
        ...destinoBase,
        cafe: !!ali.cafe,
        almoco: ali.almoco !== false,
        janta: !!ali.janta,
      }, { onConflict: 'programacao_id,colaborador_id' }),
      supabase.from('programacao_deslocamento').upsert({
        ...destinoBase,
        tipo_deslocamento: des.tipo_deslocamento || 'NÃO PRECISA',
        placa_veiculo: onlyPlate(des.placa_veiculo || ''),
      }, { onConflict: 'programacao_id,colaborador_id' }),
    ]);
  }

  listEl.addEventListener('click', async (event) => {
    // Triagem embutida: status / saldo / conferir (vale para os dois blocos)
    const statusBtn = event.target.closest('[data-status]');
    if (statusBtn) { await atualizarStatusOs(statusBtn.dataset.os, statusBtn.dataset.status, statusBtn); return; }
    const kgBtn = event.target.closest('[data-kg]');
    if (kgBtn) { openKgModal(kgBtn.dataset.kg); return; }
    const confBtn = event.target.closest('[data-conf]');
    if (confBtn) { openLaudoModal(confBtn.dataset.conf); return; }

    const dispToggleBtn = event.target.closest('[data-disp-toggle]');
    if (dispToggleBtn) {
      const colabRow = event.target.closest('.peqb-row');
      const item = osComCandidatosAtual.find((it) => String(it.os.id) === colabRow?.dataset.osId);
      const colaboradorId = dispToggleBtn.dataset.dispColab;
      const valor = dispToggleBtn.dataset.dispToggle;
      if (!item || !colaboradorId) return;
      dispToggleBtn.disabled = true;
      try {
        const { error } = await supabase.from('programacao_colaboradores')
          .update({ disponibilidade: valor })
          .eq('programacao_id', programacaoIdParaOs(item.os))
          .eq('colaborador_id', colaboradorId);
        if (error) throw error;
        if (item.custos) item.custos.dispAtual = valor;
        if (colabRow) colabRow.outerHTML = osRowHtml(item);
      } catch (error) {
        dispToggleBtn.disabled = false;
        alert(error.message || 'Não foi possível atualizar Atendimento/Logística.');
      }
      return;
    }

    const toggleOutros = event.target.closest('[data-toggle-outros]');
    const toggleAddColab = event.target.closest('[data-toggle-add-colab]');
    const addColabConfirm = event.target.closest('[data-add-colab-confirm]');
    const removerAdicional = event.target.closest('[data-remover-adicional]');
    const pickBtn = event.target.closest('[data-pick-cand]');
    const btnConfirmar = event.target.closest('[data-confirmar]');
    const btnRemover = event.target.closest('[data-remover]');
    const btnHotelEl = event.target.closest('[data-pedir-hotel]');
    const row = event.target.closest('.peqb-row');

    if (toggleAddColab && row) {
      const box = row.querySelector('[data-add-box]');
      if (box) box.hidden = !box.hidden;
      return;
    }

    if (addColabConfirm && row) {
      const item = osComCandidatosAtual.find((it) => String(it.os.id) === row.dataset.osId);
      const sel = row.querySelector('[data-add-colab-select]');
      const cand = item?.candidatos.find((c) => String(c.colaboradorId) === String(sel?.value))
        || item?.colaboradoresRegional?.find((c) => String(c.colaboradorId) === String(sel?.value));
      if (!item || !cand) return;
      // A caixa "+ colaborador" só aparece em O.S. que já tem 1+ confirmado
      // (ver osRowHtml/data-add-box) — logo todo clique aqui é o 2º+.
      const colaboradoresAtuais = item.equipeRows || [];
      const motivo = await openJustificativaModal(item.os, colaboradoresAtuais, { nome: cand.nome, colaboradorId: cand.colaboradorId });
      if (!motivo) return;
      addColabConfirm.disabled = true;
      logActivity('action', 'justificativa_multiplos_colaboradores_os', 'programacao', {
        os_id: item.os.id,
        numero_os: item.os.numero_os,
        colaboradores: [...colaboradoresAtuais.map((c) => c.colaborador_id), cand.colaboradorId],
        nomes: [...colaboradoresAtuais.map((c) => c.nome_colaborador), cand.nome],
        motivo,
      });
      try {
        // Grava e atualiza só esta linha no DOM — recarregar a lista inteira
        // (49+ O.S., cada uma com candidatos/custos) pra refletir 1 pessoa
        // adicionada deixava a confirmação visivelmente lenta.
        const [novaLinha] = await Promise.all([
          adicionarColaboradorOs(programacaoIdParaOs(item.os), item.os, cand),
          copiarCustosDoPrincipal(item, cand),
        ]);
        item.equipeRows = [...(item.equipeRows || []), novaLinha];
        row.outerHTML = osRowHtml(item);
      } catch (error) {
        console.error('[equipe] adicionar colaborador:', error);
        addColabConfirm.disabled = false;
        alert(error.message || 'Não foi possível adicionar o colaborador.');
      }
      return;
    }

    if (removerAdicional && row) {
      const item = osComCandidatosAtual.find((it) => String(it.os.id) === row.dataset.osId);
      const equipeRowId = removerAdicional.dataset.removerAdicional;
      removerAdicional.disabled = true;
      try {
        await removerConfirmacao(item ? programacaoIdParaOs(item.os) : programacaoId, equipeRowId);
        if (item) {
          item.equipeRows = (item.equipeRows || []).filter((r) => String(r.id) !== String(equipeRowId));
          row.outerHTML = osRowHtml(item);
        }
      } catch (error) {
        console.error('[equipe] remover colaborador adicional:', error);
        removerAdicional.disabled = false;
        alert(error.message || 'Não foi possível remover o colaborador.');
      }
      return;
    }

    // Abre/fecha a lista de candidatos alternativos
    if (toggleOutros && row) {
      const lista = row.querySelector('[data-outros]');
      if (lista) {
        lista.hidden = !lista.hidden;
        toggleOutros.classList.toggle('open', !lista.hidden);
      }
      return;
    }

    // Seleciona um candidato (grava no input oculto que confirmar/mapa leem)
    if (pickBtn && row) {
      const hidden = row.querySelector('[data-select-colaborador]');
      if (hidden) hidden.value = pickBtn.dataset.pickCand || '';
      row.querySelectorAll('.peqb-cand').forEach((c) => c.classList.toggle('sel', c === pickBtn));
      await atualizarMapaParaOs(row.dataset.osId);
      return;
    }

    if (!btnConfirmar && !btnRemover && !btnHotelEl && row) {
      await atualizarMapaParaOs(row.dataset.osId);
      return;
    }
    if (!btnConfirmar && !btnRemover && !btnHotelEl) return;

    const btn = btnConfirmar || btnRemover || btnHotelEl;
    const osId = row?.dataset.osId;
    btn.disabled = true;
    try {
      if (btnConfirmar) {
        const item = osComCandidatosAtual.find((it) => String(it.os.id) === osId);
        const selectEl = row.querySelector('[data-select-colaborador]');
        const cand = item?.candidatos.find((c) => c.colaboradorId === selectEl?.value);
        if (item && cand) await confirmarCandidato(programacaoIdParaOs(item.os), item.os, cand);
      } else if (btnRemover) {
        const item = osComCandidatosAtual.find((it) => String(it.os.id) === osId);
        await removerConfirmacao(item ? programacaoIdParaOs(item.os) : programacaoId, btn.dataset.remover);
      } else if (btnHotelEl) {
        const item = osComCandidatosAtual.find((it) => String(it.os.id) === osId);
        if (item) {
          const sol = await solicitarHospedagem(item.os, item.confirmadoRow, options.dataReferencia || null);
          hotelSolicitadoIds.add(osId);
          btn.textContent = '✓ Hotel solicitado';
          btn.classList.add('done');
          btn.disabled = true;
          if (sol?.codigo) {
            const info = document.createElement('span');
            info.className = 'peqb-chip peqb-chip-hotel';
            info.style.cssText = 'margin-left:4px;font-size:9px';
            info.textContent = sol.codigo;
            btn.after(info);
          }
          return; // não precisa recarregar a lista toda
        }
      }
      await carregarERenderizar({ silent: true });
    } catch (error) {
      console.error('[programacao-equipe] ação:', error);
      btn.disabled = false;
      alert(error.message || 'Erro ao salvar. Tente novamente.');
    }
  });

  listEl.addEventListener('change', async (event) => {
    // Trocar colaborador pelo dropdown do nome
    const trocarSel = event.target.closest('[data-trocar-colab]');
    if (trocarSel) {
      const card = trocarSel.closest('.peqb-os2');
      const item = osComCandidatosAtual.find((it) => String(it.os.id) === card?.dataset.osId);
      // Preferimos o candidato ranqueado (traz km/score/veículo); se o gestor
      // escolheu alguém fora do top-8, montamos o cand a partir da lista da regional.
      const cand = item?.candidatos.find((c) => String(c.colaboradorId) === trocarSel.value)
        || item?.colaboradoresRegional?.find((c) => String(c.colaboradorId) === trocarSel.value);
      if (item && cand && String(cand.colaboradorId) !== String(item.confirmadoRow?.colaborador_id)) {
        trocarSel.disabled = true;
        try {
          await confirmarCandidato(programacaoIdParaOs(item.os), item.os, cand);
          await carregarERenderizar({ silent: true });
        } catch (error) {
          console.error('[equipe] trocar colaborador:', error);
          trocarSel.disabled = false;
          alert(error.message || 'Não foi possível trocar o colaborador.');
        }
      }
      return;
    }
    const select = event.target.closest('[data-select-colaborador]');
    const row = event.target.closest('.peqb-row');
    if (!select || !row) return;
    atualizarMapaParaOs(row.dataset.osId);
  });

  const autoPreencherBtn = content.querySelector('#peqbAutoPreencher');
  autoPreencherBtn.addEventListener('click', async () => {
    autoPreencherBtn.disabled = true;
    autoPreencherBtn.textContent = 'Preenchendo...';
    try {
      await confirmarPendentesAuto();
      await carregarERenderizar({ silent: true });
    } catch (error) {
      console.error('[programacao-equipe] auto-preencher:', error);
      alert(error.message || 'Erro ao auto-preencher.');
    } finally {
      autoPreencherBtn.disabled = false;
      autoPreencherBtn.textContent = 'Auto-preencher';
    }
  });

  const caronasBtn = content.querySelector('#peqbSugerirCaronas');
  caronasBtn?.addEventListener('click', async () => {
    caronasBtn.disabled = true;
    const orig = caronasBtn.textContent;
    caronasBtn.textContent = 'Sugerindo...';
    const msgEl = content.querySelector('#peqbCaronasMsg');
    try {
      const c = await sugerirCaronas();
      await carregarERenderizar({ silent: true });
      if (msgEl) msgEl.textContent = `${c.mot} motorista(s) · ${c.car} carona(s) · ${c.prop} próprio · ${c.uber} Uber/Táxi`;
    } catch (error) {
      console.error('[programacao-equipe] caronas:', error);
      alert(error.message || 'Não foi possível sugerir caronas.');
    } finally {
      caronasBtn.disabled = false;
      caronasBtn.textContent = orig;
    }
  });

  const verRotasBtn = content.querySelector('#peqbVerRotas');
  if (verRotasBtn) verRotasBtn.addEventListener('click', async () => {
    verRotasBtn.disabled = true;
    verRotasBtn.textContent = 'Calculando rotas...';
    try {
      const osIds = osComCandidatosAtual.map((it) => String(it.os.id));
      const { data, error } = await supabase.functions.invoke('frotas-roteirizar', {
        body: { osIds, maxParadas: 4, publicar: false },
      });
      if (error) throw new Error(error.message || 'Falha ao calcular rotas.');
      if (data?.error) throw new Error(data.error);

      rotasPorOsId = new Map();
      // Só as rotas que atendem alguma OS desta tela (a function devolve
      // também veículos sem embarque hoje, que não interessam aqui).
      rotasCompletas = (data?.rotas || []).filter((rota) => rota.paradas.some((p) => p.os_id));
      rotasCompletas.forEach((rota) => {
        rota.paradas.filter((p) => p.os_id).forEach((p) => rotasPorOsId.set(p.os_id, rota));
      });
      if (!rotasPorOsId.size) alert('Nenhuma rota calculada (colaboradores sem coordenadas ou sem veículo disponível).');
      if (focoOsId) await atualizarMapaParaOs(focoOsId);
      else if (rotasCompletas.length) {
        const map = await garantirMapa(mapState, mapMount);
        if (map) { mapEmptyEl.style.display = 'none'; desenharTodasRotas(mapState, rotasCompletas); }
      }
    } catch (error) {
      console.error('[programacao-equipe] ver rotas:', error);
      alert(error.message || 'Erro ao calcular rotas.');
    } finally {
      verRotasBtn.disabled = false;
      verRotasBtn.textContent = 'Ver rotas no mapa';
    }
  });

  await carregarERenderizar();
}


async function solicitarHospedagem(os, confirmadoRow, dataReferencia) {
  const { uf, cidade } = parseEmbarqueUfCidade(os.embarque);
  const data = dataReferencia || new Date().toISOString().slice(0, 10);
  const nome = confirmadoRow?.nome_colaborador || '';
  const km = confirmadoRow?.km_estimado;

  const payload = {
    data_solicitacao: data,
    cidade: cidade || os.embarque || '',
    uf: uf || '',
    cliente: os.cliente || null,
    local_embarque: os.embarque || '',
    data_checkin_prevista: data,
    data_checkout_prevista: data,
    quantidade_diarias_prevista: 1,
    observacao_gestor: `Sugestão automática via Programação — ${nome}${km != null ? ` a ${km}km` : ''} do ponto de embarque.`,
    status_solicitacao: 'SOLICITADA',
  };

  const { data: sol, error } = await supabase.from('hospedagem_solicitacoes').insert(payload).select('id,codigo').single();
  if (error) throw error;

  const cpf = confirmadoRow?.colaborador_id && /^\d+$/.test(confirmadoRow.colaborador_id)
    ? confirmadoRow.colaborador_id : null;
  await supabase.from('hospedagem_solicitacao_colaboradores').insert({
    solicitacao_id: sol.id,
    nome_colaborador: nome,
    cpf,
  });

  return sol;
}

async function confirmarCandidato(programacaoId, os, cand) {
  const payload = {
    programacao_id: programacaoId,
    os_id: os.id,
    colaborador_id: cand.colaboradorId,
    nome_colaborador: cand.nome,
    score: cand.score,
    score_contrato: cand.scoreContrato,
    score_distancia: cand.scoreDistancia,
    score_auditoria: cand.scoreAuditoria,
    km_estimado: cand.km,
    confirmado: true,
  };
  const { error } = await supabase.from('programacao_equipe').upsert(payload, { onConflict: 'programacao_id,os_id,colaborador_id' });
  if (error) throw error;

  // operacional_os_colaboradores é o vínculo OS<->colaborador usado por outras
  // telas (Frotas Roteirização, relatórios) — replica aqui o mesmo padrão
  // "substitui a atribuição da OS" que a distribuição manual já fazia.
  const { error: delErr } = await supabase.from('operacional_os_colaboradores').delete().eq('os_id', os.id);
  if (delErr) console.warn('[programacao-equipe] falha ao limpar vínculo anterior da OS.', delErr);
  const cpfCandidato = /^\d+$/.test(cand.colaboradorId) ? cand.colaboradorId : null;
  const { error: vinculoErr } = await supabase.from('operacional_os_colaboradores').insert({
    os_id: os.id,
    colaborador_key: cand.colaboradorId,
    colaborador_nome: cand.nome,
    colaborador_cpf: cpfCandidato,
    distancia_km: cand.km,
    origem_sugestao: 'PROGRAMACAO_ETAPA_B',
  });
  if (vinculoErr) console.warn('[programacao-equipe] falha ao gravar vínculo OS<->colaborador.', vinculoErr);

  // Colaborador que já é motorista de um veículo cadastrado (colaborador_cruzamento.veiculo_id)
  // entra como "Logística" em vez de "OK", mesma convenção usada em programacao.js/ensureDefaultRows.
  const espelho = {
    programacao_id: programacaoId,
    colaborador_id: cand.colaboradorId,
    nome_colaborador: cand.nome,
    cargo: cand.cargo || null,
    coordenacao: cand.coordenacao || null,
    supervisao: cand.supervisao || null,
    disponibilidade: cand.veiculoId ? 'LOGISTICA' : 'OK',
  };
  const { error: espelhoErr } = await supabase.from('programacao_colaboradores').upsert(espelho, { onConflict: 'programacao_id,colaborador_id' });
  if (espelhoErr) console.warn('[programacao-equipe] falha ao espelhar disponibilidade.', espelhoErr);
}

async function adicionarColaboradorOs(programacaoId, os, cand) {
  const payload = {
    programacao_id: programacaoId,
    os_id: os.id,
    colaborador_id: cand.colaboradorId,
    nome_colaborador: cand.nome,
    score: cand.score || 0,
    score_contrato: cand.scoreContrato || 0,
    score_distancia: cand.scoreDistancia || 0,
    score_auditoria: cand.scoreAuditoria || 0,
    km_estimado: cand.km,
    confirmado: true,
  };
  const { data: upsertRows, error } = await supabase.from('programacao_equipe').upsert(payload, { onConflict: 'programacao_id,os_id,colaborador_id' }).select().limit(1);
  if (error) throw error;

  const cpfCandidato = /^\d+$/.test(String(cand.colaboradorId)) ? String(cand.colaboradorId) : null;
  const [vinculoRes, espelhoRes] = await Promise.all([
    supabase.from('operacional_os_colaboradores').delete().eq('os_id', os.id).eq('colaborador_key', cand.colaboradorId)
      .then(() => supabase.from('operacional_os_colaboradores').insert({
        os_id: os.id,
        colaborador_key: cand.colaboradorId,
        colaborador_nome: cand.nome,
        colaborador_cpf: cpfCandidato,
        distancia_km: cand.km,
        origem_sugestao: 'PROGRAMACAO_ETAPA_B_ADICIONAL',
      })),
    supabase.from('programacao_colaboradores').upsert({
      programacao_id: programacaoId,
      colaborador_id: cand.colaboradorId,
      nome_colaborador: cand.nome,
      cargo: cand.cargo || null,
      coordenacao: cand.coordenacao || null,
      supervisao: cand.supervisao || null,
      disponibilidade: cand.veiculoId ? 'LOGISTICA' : 'OK',
    }, { onConflict: 'programacao_id,colaborador_id' }),
  ]);
  if (vinculoRes?.error) console.warn('[programacao-equipe] falha ao gravar colaborador adicional da OS.', vinculoRes.error);
  if (espelhoRes?.error) console.warn('[programacao-equipe] falha ao espelhar colaborador adicional.', espelhoRes.error);

  return upsertRows?.[0] || { ...payload, id: null };
}

// Versão em LOTE de confirmarCandidato: grava N atribuições ({os, cand}) com
// ~4 chamadas no total (em vez de ~4 por O.S.). Usada no auto-preencher, que
// antes fazia uma confirmação sequencial por O.S. e ficava lento (37 O.S.).
async function confirmarCandidatosEmLote(programacaoIdParaOs, atribuicoes) {
  if (!atribuicoes.length) return;
  const resolverId = typeof programacaoIdParaOs === 'function' ? programacaoIdParaOs : () => programacaoIdParaOs;

  const equipeRows = atribuicoes.map(({ os, cand }) => ({
    programacao_id: resolverId(os),
    os_id: os.id,
    colaborador_id: cand.colaboradorId,
    nome_colaborador: cand.nome,
    score: cand.score,
    score_contrato: cand.scoreContrato,
    score_distancia: cand.scoreDistancia,
    score_auditoria: cand.scoreAuditoria,
    km_estimado: cand.km,
    confirmado: true,
  }));
  const { error } = await supabase.from('programacao_equipe').upsert(equipeRows, { onConflict: 'programacao_id,os_id,colaborador_id' });
  if (error) throw error;

  // Substitui o vínculo OS<->colaborador de todas as O.S. de uma vez.
  const osIds = atribuicoes.map(({ os }) => os.id);
  const { error: delErr } = await supabase.from('operacional_os_colaboradores').delete().in('os_id', osIds);
  if (delErr) console.warn('[programacao-equipe] lote: limpar vínculos', delErr);

  const vinculos = atribuicoes.map(({ os, cand }) => ({
    os_id: os.id,
    colaborador_key: cand.colaboradorId,
    colaborador_nome: cand.nome,
    colaborador_cpf: /^\d+$/.test(cand.colaboradorId) ? cand.colaboradorId : null,
    distancia_km: cand.km,
    origem_sugestao: 'PROGRAMACAO_ETAPA_B',
  }));
  const { error: vErr } = await supabase.from('operacional_os_colaboradores').insert(vinculos);
  if (vErr) console.warn('[programacao-equipe] lote: gravar vínculos', vErr);

  // Espelho de disponibilidade — um por colaborador (dedup por colaborador_id).
  const espMap = new Map();
  atribuicoes.forEach(({ os, cand }) => {
    espMap.set(String(cand.colaboradorId), {
      programacao_id: resolverId(os),
      colaborador_id: cand.colaboradorId,
      nome_colaborador: cand.nome,
      cargo: cand.cargo || null,
      coordenacao: cand.coordenacao || null,
      supervisao: cand.supervisao || null,
      disponibilidade: cand.veiculoId ? 'LOGISTICA' : 'OK',
    });
  });
  const { error: espErr } = await supabase.from('programacao_colaboradores').upsert([...espMap.values()], { onConflict: 'programacao_id,colaborador_id' });
  if (espErr) console.warn('[programacao-equipe] lote: espelhar disponibilidade', espErr);
}

async function removerConfirmacao(programacaoId, equipeRowId) {
  const { data: rows, error: selErr } = await supabase.from('programacao_equipe').select('colaborador_id,os_id').eq('id', equipeRowId).limit(1);
  if (selErr) throw selErr;
  const colaboradorId = rows?.[0]?.colaborador_id;
  const osId = rows?.[0]?.os_id;

  const { error } = await supabase.from('programacao_equipe').delete().eq('id', equipeRowId);
  if (error) throw error;

  if (osId) {
    const { error: vinculoErr } = await supabase
      .from('operacional_os_colaboradores')
      .delete()
      .eq('os_id', osId)
      .eq('colaborador_key', colaboradorId);
    if (vinculoErr) console.warn('[programacao-equipe] falha ao remover vínculo OS<->colaborador.', vinculoErr);
  }

  if (colaboradorId) {
    const { error: updErr } = await supabase
      .from('programacao_colaboradores')
      .update({ disponibilidade: 'SEM EMBARQUE' })
      .eq('programacao_id', programacaoId)
      .eq('colaborador_id', colaboradorId);
    if (updErr) console.warn('[programacao-equipe] falha ao reverter disponibilidade.', updErr);
  }
}
