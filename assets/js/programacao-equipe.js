// Etapa B da Programação: "quem vai atender as OS disponíveis".
// Lista compacta de OS em ATENDER, cada uma com um dropdown de candidatos
// ranqueados (Contrato 50% / Distância 30% / Auditoria 20%, calculado no
// banco pela RPC programacao_etapa_b_candidatos) e um mapa à direita
// mostrando a rota do colaborador focado até o ponto de embarque — reta por
// padrão, ou a rota real (OSRM, agrupando até 4 colaboradores por veículo)
// quando o gestor pedir "Ver rotas no mapa" (reaproveita a Edge Function já
// usada em Frotas Roteirização, ver supabase/functions/frotas-roteirizar).
import { supabase } from './supabaseClient.js';
import { getUserContext, getCurrentUser } from './auth.js';
import { anexarLaudoComGeolocalizacao, capturarGeolocalizacao } from './laudoUpload.js';
import { marcarMapaRotasPendente } from './programacao-equipe-mapa-rotas-trigger.js';

let currentUserIsMaster = false;
let masterPermissionReady = null;

// Precisa ser chamada (e aguardada) por quem for usar isDataPassada() — sem
// isso currentUserIsMaster nunca sai de false e usuários master ficam presos
// no bloqueio de data retroativa igual usuário comum. Antes só era chamada
// pelas renderProgramacaoSituacao/renderProgramacaoEquipe (removidas,
// 2026-07-22); o painel lateral novo (programacao-lista-drawer.js) precisa
// chamar explicitamente.
export function ensureMasterPermission() {
  if (!masterPermissionReady) {
    masterPermissionReady = getUserContext()
      .then((ctx) => {
        currentUserIsMaster = !!ctx?.user?.is_master;
        return currentUserIsMaster;
      })
      .catch((error) => {
        console.warn('[programacao] não foi possível validar permissão master:', error);
        currentUserIsMaster = false;
        return false;
      });
  }
  return masterPermissionReady;
}

const BRI = new Intl.NumberFormat('pt-BR');

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
  return cargo.includes('AUDITOR') || cargo.includes('ADMINISTRATIVO');
}

// Exceção pontual pedida pela usuária (2026-08-06): a supervisão "GERAL -
// Administrativo" existe justamente pra escalar pessoal administrativo em
// O.S. (uso interno/teste), então os colaboradores dela ficam de fora do
// bloqueio de cargo/coordenação acima — que continua valendo pra qualquer
// outra supervisão.
function isSupervisaoExcecaoBloqueioCargo(supervisao) {
  return normalizeText(supervisao) === 'GERAL ADMINISTRATIVO';
}

function isColaboradorInativo(row) {
  if (row?.ativo === false) return true;
  const situacao = normalizeText(row?.situacao || row?.status || row?.disponibilidade);
  // Colaborador readmitido mantém no GRM a data do desligamento ANTERIOR à
  // volta (só `situacao` vira "Ativo" na readmissão) — sem o "&& situacao !==
  // 'ATIVO'", ele fica fora do pool da própria supervisão pra sempre mesmo já
  // reativado (caso real: GABRIEL MARIANO DA SILVA, 28/08/2026).
  if (String(row?.desligamento || '').trim() && situacao !== 'ATIVO') return true;
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

// Perto do embarque tem prioridade. Acima disso o colaborador segue possível,
// mas a tela recomenda hospedagem em vez de deslocamento longo.
const EMBARQUE_PROXIMO_KM = 400;
const HOTEL_KM_THRESHOLD = EMBARQUE_PROXIMO_KM;

export function precisaHotel(km) { return km != null && km >= HOTEL_KM_THRESHOLD; }
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
export function ordenarCandidatosPorEmbarque(lista = []) {
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
function contratoLabel(tipo) {
  const norm = normalizeText(tipo);
  if (norm.includes('EFETIVO')) return 'Efetivo';
  if (norm.includes('INTERMITENTE')) return 'Intermitente';
  if (norm.includes('DIARISTA')) return 'Diarista';
  return 'Não informado';
}

export function injectStyles() {
  if (document.getElementById('progEquipeStyles')) return;
  const style = document.createElement('style');
  style.id = 'progEquipeStyles';
  style.textContent = `
    .peqs-finalizadas-title{margin-top:16px!important;opacity:.85}
    /* KPIs numa faixa só com divisórias finas, em vez de 3 caixas soltas num
       grid de 2 colunas que sobrava espaço vazio ao lado do 3º número — e sem
       scroll interno pra um conteúdo que nunca chega a precisar (pedido do
       usuário, 2026-07-21: "menos poluído / mais intuitivo"). */
    .peqb-kpis-window{margin-bottom:12px}
    .peqb-kpis{display:flex;flex-wrap:wrap;border:1px solid rgba(148,163,184,.16);background:rgba(2,6,23,.3);border-radius:12px;overflow:hidden;margin-bottom:10px}
    .peqb-kpi{padding:9px 18px;flex:1 1 auto;min-width:112px}
    .peqb-kpi+.peqb-kpi{border-left:1px solid rgba(148,163,184,.14)}
    .peqb-kpi span{display:block;color:#93c5fd;font-size:9.5px;font-weight:950;letter-spacing:.08em;text-transform:uppercase;white-space:nowrap}
    .peqb-kpi strong{display:block;margin-top:4px;color:#fff;font-size:17px}
    /* KPI com ícone (inspirado no mockup de referência, 2026-07-21): círculo
       colorido + texto ao lado, em vez de só rótulo-em-cima-do-número. */
    .peqb-kpi-ic{display:flex;align-items:center;gap:10px}
    .peqb-kpi-icon{flex:0 0 auto;width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:15px}
    .peqb-kpi-icon.tone-blue{background:rgba(59,130,246,.18)}
    .peqb-kpi-icon.tone-amber{background:rgba(245,158,11,.18)}
    .peqb-kpi-icon.tone-green{background:rgba(34,197,94,.18)}
    .peqb-kpi-icon.tone-purple{background:rgba(168,85,247,.18)}
    .peqb-kpi-body{min-width:0}
    .peqb-kpi-body small{display:block;color:#7d8aa3;font-size:9.5px;margin-top:1px;white-space:nowrap}
    .peqb-os2-kpis{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:8px}
    .peqb-os2-kpi{border:1px solid rgba(148,163,184,.14);background:rgba(2,6,23,.24);border-radius:10px;padding:7px 9px;flex:1 1 90px;min-width:90px}
    .peqb-os2-kpi span{display:block;color:#93c5fd;font-size:9px;font-weight:950;letter-spacing:.06em;text-transform:uppercase}
    .peqb-os2-kpi strong{display:block;margin-top:3px;color:#fff;font-size:13px;font-weight:800;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .peqb-os2-kpi-wide{flex-basis:160px}
    .peqb-toolbar{display:flex;gap:8px;flex-wrap:wrap;align-items:center;justify-content:flex-end}
    .peqb-toolbar-msg{font-size:11.5px;color:#9fb7aa;align-self:center}
    .peqb-btn{border:1px solid rgba(134,239,172,.35);background:rgba(22,163,74,.16);color:#dcfce7;border-radius:999px;padding:8px 14px;font-size:12px;font-weight:950;cursor:pointer;white-space:nowrap}
    .peqb-btn:hover{background:rgba(22,163,74,.3)}
    .peqb-btn:disabled{opacity:.55;cursor:not-allowed}
    /* Ações secundárias (não são "o botão principal da etapa") ganham peso
       visual menor — sem isso todo botão vira mais um retângulo verde e a
       tela inteira pisca a mesma cor, obscurecendo qual ação é a principal. */
    .peqb-btn-ghost{background:transparent;border-color:rgba(148,163,184,.28);color:#cbd5e1}
    .peqb-btn-ghost:hover{background:rgba(148,163,184,.1);border-color:rgba(148,163,184,.42)}
    .peqb-grid{display:grid;grid-template-columns:minmax(360px,1fr) minmax(320px,.85fr);gap:14px;align-items:start}
    @media(max-width:1080px){.peqb-grid{grid-template-columns:1fr}}
    .peqb-os-list{display:flex;flex-direction:column;gap:10px;max-height:calc(100vh - 320px);min-height:300px;overflow:auto;padding-right:2px}
    .peqb-row{border:1px solid rgba(148,163,184,.14);border-radius:14px;background:rgba(2,6,23,.32);padding:10px 12px;cursor:pointer}
    .peqb-row:hover,.peqb-row.focus{border-color:rgba(52,211,153,.4);background:rgba(34,197,94,.06)}
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
    .peqb-cand{display:flex;align-items:flex-start;gap:11px;width:100%;text-align:left;cursor:pointer;border:1px solid rgba(148,163,184,.16);background:rgba(15,23,42,.4);border-radius:13px;padding:11px 12px;margin-top:8px;color:var(--text,#eef7f2);font:inherit}
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
    .peqb-legend{display:flex;gap:12px;flex-wrap:wrap;align-items:center;margin:0 0 12px;font-size:10px;color:#7d8aa3}
    .peqb-legend-lbl{font-weight:850;color:#8ba79a;text-transform:uppercase;letter-spacing:.06em;font-size:9px}
    .peqb-legend i{display:inline-block;width:11px;height:5px;border-radius:2px;margin-right:4px;vertical-align:middle;opacity:.85}
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
    .peqb-row.peqb-os2{display:block!important;padding:0!important;overflow:visible!important}
    /* Card focado sobe acima dos vizinhos para o dropdown de troca "passar" por cima. */
    .peqb-row.peqb-os2:focus-within{position:relative;z-index:30}
    .peqb-os2-left{padding:14px 15px}
    .peqb-os2-right{padding:13px 15px;background:rgba(8,13,24,.4);border-top:1px solid rgba(148,163,184,.1);border-radius:0 0 13px 13px}
    .peqb-os2-cliente{font-size:13.5px;font-weight:850;color:#f8fafc;line-height:1.25}
    .peqb-os2-emb{font-size:11.5px;color:#8ba79a;margin-top:3px;overflow-wrap:anywhere}
    .peqb-os2-uf{color:#6fd0a5;font-weight:900}
    .peqb-os2-emb-l1,.peqb-os2-emb-l2{display:block!important;width:100%!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important}
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
    /* Uma pilula só (borda única) em vez de nome+deslocamento+botão como 3
       caixas separadas — os <select> nativos mantinham contorno do sistema
       mesmo com border/background "transparent" (faltava appearance:none),
       o que empilhava caixa dentro de caixa (pedido do usuário, 2026-07-17:
       "menos poluído"). */
    .peqb-conf-name{display:flex;align-items:center;flex-wrap:nowrap;gap:0;min-width:0;flex:1 1 140px;border:1px solid rgba(148,163,184,.16);background:rgba(15,23,42,.45);border-radius:10px;padding:3px 4px}
    .peqb-conf-tagwrap{display:flex;align-items:center;gap:6px;flex:0 0 auto;padding:0 6px}
    .peqb-conf-tag{flex:0 0 auto;white-space:nowrap}
    .peqb-name-sel{appearance:none;-webkit-appearance:none;-moz-appearance:none;flex:1 1 0;min-width:0;max-width:100%;overflow:hidden;white-space:nowrap;border:0;background:transparent;color:#f8fafc;font-size:13.5px;font-weight:850;cursor:pointer;border-radius:7px;padding:5px 22px 5px 8px;color-scheme:dark;text-overflow:ellipsis}
    .peqb-name-sel:hover{background:rgba(111,208,165,.1)}
    .peqb-name-sel:focus{outline:none;background:rgba(111,208,165,.14)}
    .peqb-name-sel option{background:#0c1f17;color:#eef7f2;font-weight:600}
    .peqb-desloc-inline{appearance:none;-webkit-appearance:none;-moz-appearance:none;flex:0 0 auto;background:transparent;border:0;border-left:1px solid rgba(111,208,165,.18);border-radius:0;color:#cfe7da;font-size:12px;font-weight:800;padding:5px 20px 5px 10px}
    .peqb-desloc-inline:hover{background:rgba(111,208,165,.1)}
    .peqb-add-colab{width:26px;height:26px;min-height:26px;margin:0 3px 0 2px;padding:0;border-radius:7px;border:0;background:transparent;color:#7dd3fc;font-size:16px;font-weight:950;cursor:pointer;flex:0 0 auto;line-height:1}
    .peqb-add-colab:hover{background:rgba(56,189,248,.16);color:#e0f2fe}
    .peqb-extra-colabs{display:flex;flex-direction:column;gap:6px;width:100%;margin:-2px 0 7px}
    .peqb-extra-colab{display:flex;align-items:center;flex-wrap:nowrap;gap:0;width:100%;border:1px solid rgba(148,163,184,.14);border-left:2px solid rgba(56,189,248,.5);background:rgba(15,23,42,.4);border-radius:10px;padding:3px 4px;box-sizing:border-box}
    .peqb-extra-colab .peqb-conf-tagwrap{padding:0 6px}
    .peqb-extra-colab .peqb-name-sel{flex:1 1 0;background:transparent;cursor:default;padding:5px 8px}
    .peqb-extra-colab .peqb-desloc-inline{border-left-color:rgba(148,163,184,.16)}
    .peqb-extra-colab button{width:26px;height:26px;margin:0 2px;border-radius:7px;border:0;background:transparent;color:#fca5a5;font-size:14px;font-weight:950;cursor:pointer;padding:0;line-height:1;flex:0 0 auto}
    .peqb-extra-colab button:hover{background:rgba(239,68,68,.16);color:#fecaca}
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
    /* Avatar com iniciais (inspirado no mockup de referência, 2026-07-21) —
       identifica rápido "quem é quem" na O.S. sem precisar ler o nome inteiro. */
    .peqb-avatar-badge{flex:0 0 auto;width:24px;height:24px;border-radius:50%;margin:0 6px 0 2px;display:flex;align-items:center;justify-content:center;font-size:9.5px;font-weight:950;color:#fff;text-shadow:0 1px 1px rgba(0,0,0,.35)}
    /* Zona da equipe + card de deslocamento lado a lado — o deslocamento do
       colaborador confirmado (frota/uber/carona/reembolso) ganha destaque
       visual próprio em vez de um <select> apertado dentro da pílula do
       nome (mesmo <select data-desloc-colab>/mesmo handler, só reposicionado
       e restilizado, ver deslocamentoCardHtml()). */
    .peqb-team-row{display:flex;gap:10px;align-items:stretch}
    .peqb-team-zone{flex:1 1 auto;min-width:0}
    .peqb-desloc-card{position:relative;flex:0 0 172px;display:flex;align-items:center;gap:8px;padding:9px 11px;border-radius:12px;border:1px dashed rgba(148,163,184,.3);background:rgba(148,163,184,.06);color:#94a3b8}
    .peqb-desloc-icon{flex:0 0 auto;font-size:16px;line-height:1}
    .peqb-desloc-icon::before{content:"➕"}
    .peqb-desloc-main{min-width:0;display:flex;flex-direction:column;gap:1px}
    .peqb-desloc-label{font-size:12px;font-weight:850;color:inherit}
    .peqb-desloc-label::after{content:"Definir deslocamento"}
    .peqb-desloc-main strong{font-size:12.5px;font-weight:900;color:#fff;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .peqb-desloc-main small{font-size:9.5px;color:#9fb7aa;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .peqb-desloc-select{position:absolute;inset:0;width:100%;height:100%;opacity:0;cursor:pointer;appearance:none;border:0;background:transparent}
    .peqb-desloc-select:disabled{cursor:not-allowed}
    .peqb-desloc-card.tone-frota{border-style:solid;border-color:rgba(34,197,94,.35);background:rgba(22,163,74,.14);color:#bbf7d0}
    .peqb-desloc-card.tone-frota .peqb-desloc-icon::before{content:"🚛"}
    .peqb-desloc-card:has(option[value="UBER/TÁXI"]:checked){border-style:solid;border-color:rgba(168,85,247,.35);background:rgba(147,51,234,.14);color:#e9d5ff}
    .peqb-desloc-card:has(option[value="UBER/TÁXI"]:checked) .peqb-desloc-icon::before{content:"🚕"}
    .peqb-desloc-card:has(option[value="UBER/TÁXI"]:checked) .peqb-desloc-label::after{content:"Uber/Táxi"}
    .peqb-desloc-card:has(option[value="CARONA FROTA"]:checked){border-style:solid;border-color:rgba(59,130,246,.35);background:rgba(37,99,235,.14);color:#bfdbfe}
    .peqb-desloc-card:has(option[value="CARONA FROTA"]:checked) .peqb-desloc-icon::before{content:"🤝"}
    .peqb-desloc-card:has(option[value="CARONA FROTA"]:checked) .peqb-desloc-label::after{content:"Carona"}
    .peqb-desloc-card:has(option[value="REEMBOLSO KM"]:checked){border-style:solid;border-color:rgba(245,158,11,.35);background:rgba(217,119,6,.14);color:#fde68a}
    .peqb-desloc-card:has(option[value="REEMBOLSO KM"]:checked) .peqb-desloc-icon::before{content:"💵"}
    .peqb-desloc-card:has(option[value="REEMBOLSO KM"]:checked) .peqb-desloc-label::after{content:"Reembolso km"}
    @media(max-width:640px){.peqb-team-row{flex-direction:column}.peqb-desloc-card{flex-basis:auto}}
    .peqb-map-band{margin-top:14px;border:1px solid rgba(111,208,165,.14);border-radius:16px;overflow:hidden;background:rgba(2,6,23,.36)}
    .peqb-map-band-head{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:10px 14px;border-bottom:1px solid rgba(111,208,165,.14);font-size:12.5px;font-weight:850;color:#cfe7da}
    .peqb-map-band .peqb-map{height:min(420px,60vh);position:relative}
    @media(max-width:760px){.peqb-crow,.peqb-crow-2,.peqb-crow-3{grid-template-columns:1fr!important}}
    @media(max-width:600px){.peqb-cand-cost{align-self:flex-start}}
    .prog-readonly-banner{display:flex;align-items:center;gap:8px;margin:0 0 12px;padding:10px 14px;border:1px solid rgba(234,179,8,.32);background:rgba(234,179,8,.1);border-radius:12px;color:#fde68a;font-size:12.5px;font-weight:800}
    .prog-readonly-scope{pointer-events:none!important;opacity:.55;filter:saturate(.6)}
  `;
  document.head.appendChild(style);
}

// Data no passado (antes de hoje) = só leitura: gestor pode ver a
// programação de um dia que já passou, mas não editar (status_gestor,
// equipe, drag-and-drop) — evita mexer retroativamente numa O.S. cujo
// resultado real já aconteceu. Comparação por string funciona porque
// dataReferencia/todayIso() são sempre 'YYYY-MM-DD'.
export function isDataPassada(dataReferencia) {
  return !currentUserIsMaster && !!dataReferencia && dataReferencia < todayIso();
}

// Carrega as OS acionáveis da supervisão (pendentes/aguardar/atender) — as
// FINALIZAR já saíram do fluxo do dia. A triagem (mudar status) e a atribuição
// passam a conviver na mesma tela.
const OS_COLUNAS = 'id,numero_os,contrato,cliente,servico,embarque,destino,ponto_embarque_id,ponto1_latitude,ponto1_longitude,supervisao,status_gestor,remanescente,observacao_logistica,data_os,configurada_em';
const OS_PAGE_SIZE = 1000;

async function loadOsAbertasPaginadas(supervisao) {
  const rows = [];

  for (let from = 0; ; from += OS_PAGE_SIZE) {
    let query = supabase
      .from('operacional_os')
      .select(OS_COLUNAS)
      .or('status_gestor.is.null,status_gestor.eq.PENDENTE,status_gestor.eq.AGUARDAR,status_gestor.eq.ATENDER');
    query = Array.isArray(supervisao) ? query.in('supervisao', supervisao) : query.eq('supervisao', supervisao);

    const { data, error } = await query
      .order('data_os', { ascending: false })
      .order('numero_os', { ascending: false })
      .range(from, from + OS_PAGE_SIZE - 1);
    if (error) throw error;

    const page = data || [];
    rows.push(...page);
    if (page.length < OS_PAGE_SIZE) break;
  }

  return rows;
}

// dataReferencia é opcional (só a Etapa 1 passa) — quando informada, também
// busca as O.S. FINALIZAR do dia (configurada_em na data selecionada) pra
// exibir num grupo separado (pedido do usuário: finalizar não pode mais
// sumir da tela na hora). Sem dataReferencia, mantém o comportamento antigo
// (só as não finalizadas) — usado pela Etapa 2/mapa, que já filtra por
// ATENDER na frente e não precisa do histórico de finalizadas.
export async function loadOsRelevantes(supervisao, dataReferencia) {
  const abertas = await loadOsAbertasPaginadas(supervisao);

  let finalizadas = [];
  if (dataReferencia) {
    let queryFin = supabase.from('operacional_os').select(OS_COLUNAS).eq('status_gestor', 'FINALIZAR');
    queryFin = Array.isArray(supervisao) ? queryFin.in('supervisao', supervisao) : queryFin.eq('supervisao', supervisao);
    const inicio = `${dataReferencia}T00:00:00`;
    const fimData = new Date(`${dataReferencia}T00:00:00`);
    fimData.setDate(fimData.getDate() + 1);
    const fim = fimData.toISOString().slice(0, 19);
    const finResult = await queryFin.gte('configurada_em', inicio).lt('configurada_em', fim).order('numero_os', { ascending: false }).limit(200);
    if (finResult.error) console.warn('[equipe] O.S. finalizadas do dia:', finResult.error);
    finalizadas = finResult.data || [];
  }
  const porId = new Map();
  [...abertas, ...finalizadas].forEach((os) => porId.set(String(os.id), os));
  return [...porId.values()];
}

export async function loadOsRelevantePorNumero(supervisao, numeroOs) {
  let query = supabase
    .from('operacional_os')
    .select(OS_COLUNAS)
    .eq('numero_os', String(numeroOs).trim())
    .or('status_gestor.is.null,status_gestor.eq.PENDENTE,status_gestor.eq.AGUARDAR,status_gestor.eq.ATENDER');
  query = Array.isArray(supervisao) ? query.in('supervisao', supervisao) : query.eq('supervisao', supervisao);

  const { data, error } = await query.limit(1);
  if (error) throw error;
  return data?.[0] || null;
}

export function statusNorm(os) {
  return normalizeText(os?.status_gestor || '') || 'PENDENTE';
}

export async function loadPontos(ids) {
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

// Tipo de contrato do colaborador confirmado (programacao_equipe/roster não
// guarda cargo/tipo_contrato, só score/km) — igual à placa acima, lido de
// colaborador_cruzamento e indexado por CPF normalizado. Usado pra trocar o
// avatar (sigla do nome) pela letra do tipo de contrato (E/I/D).
export async function loadCruzamentoTipoContrato(supervisao) {
  try {
    let query = supabase.from('colaborador_cruzamento').select('cpf,tipo_contrato');
    query = Array.isArray(supervisao) ? query.in('supervisao', supervisao) : query.eq('supervisao', supervisao);
    const { data, error } = await query.limit(5000);
    if (error) throw error;
    const map = new Map();
    (data || []).forEach((r) => { if (r.tipo_contrato) map.set(String(r.cpf || '').replace(/\D/g, ''), r.tipo_contrato); });
    return map;
  } catch (error) {
    console.warn('[equipe] cruzamento de tipo de contrato indisponível', error);
    return new Map();
  }
}

// E/I/D pro avatar — mesmo critério de contratoLabel, só que reduzido a 1 letra.
export function tipoContratoLetra(tipo) {
  const norm = normalizeText(tipo);
  if (norm.includes('EFETIVO')) return 'E';
  if (norm.includes('INTERMITENTE')) return 'I';
  if (norm.includes('DIARISTA')) return 'D';
  return '?';
}

// Lista COMPLETA de colaboradores ativos da supervisão (regional liberada do
// usuário), para o dropdown de troca poder escolher qualquer um — não só os 8
// candidatos ranqueados. Os já escalados em outra OS são marcados com ♻ na UI.
// programacao-lista-drawer.js e programacao-sem-os.js chamam essa função em
// paralelo (Promise.allSettled das 2 abas) com a MESMA supervisão — sem
// cache, isso dobrava a consulta mais pesada daqui (colaboradores_atuais,
// até 12000 linhas) rodando 2x ao mesmo tempo, esticando o carregamento da
// aba Sem O.S. e fazendo a troca de tela parecer lenta logo depois de
// "Carregar" (reportado pela usuária, 2026-07-23). Cacheia a PROMISE (não só
// o resultado) por 60s, então a 2ª chamada concorrente reaproveita a mesma
// requisição em vez de disparar outra.
let regionalCache = { key: '', promise: null, ts: 0 };
const REGIONAL_CACHE_TTL_MS = 60000;
export function loadColaboradoresRegional(supervisao) {
  const key = (Array.isArray(supervisao) ? supervisao : [supervisao]).filter(Boolean).sort().join('|');
  const agora = Date.now();
  if (key && regionalCache.key === key && regionalCache.promise && (agora - regionalCache.ts) < REGIONAL_CACHE_TTL_MS) {
    return regionalCache.promise;
  }
  const promise = loadColaboradoresRegionalFresh(supervisao);
  regionalCache = { key, promise, ts: agora };
  return promise;
}
async function loadColaboradoresRegionalFresh(supervisao) {
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
    .filter((r) => (isSupervisaoExcecaoBloqueioCargo(r.supervisao) || !isCargoBloqueado(r.cargo)) && !isColaboradorInativo(r))
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
export async function loadDisponibilidadeConfirmados(programacaoId, colaboradorIds) {
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

// ---------------------------------------------------------------------------
// Indisponibilidade (RH) — férias programadas/em gozo e atestados vigentes na
// data da programação (tela RH > Indisponibilidade, tabelas rh_ferias e
// rh_atestados). Colaborador indisponível não entra como candidato na Etapa 2
// nem como opção de troca; no "Sem O.S." (Etapa 4) aparece com o motivo.
// A RPC de candidatos usa CPF normalizado (ou o nome, quando sem CPF) como
// colaborador_id, enquanto o RH grava o uuid de `colaboradores` — por isso
// resolvemos uuid -> cpf/nome aqui e casamos por chave de CPF E por nome
// normalizado. Falha aberta: qualquer erro devolve "ninguém indisponível"
// (melhor sugerir alguém de férias do que travar a programação inteira).
export async function loadIndisponiveisNaData(dataReferencia) {
  const vazio = { chavesRpc: [], match: () => false, motivo: () => null };
  const dia = String(dataReferencia || todayIso()).slice(0, 10);
  try {
    const [ferias, atestados, legado] = await Promise.all([
      supabase.from('rh_ferias')
        .select('colaborador_id,colaborador_nome')
        .in('status', ['programada', 'em_gozo'])
        .lte('data_inicio', dia).gte('data_fim', dia),
      supabase.from('rh_atestados')
        .select('colaborador_id,colaborador_nome')
        .in('status', ['lancado', 'aprovado'])
        .lte('data_inicio', dia).gte('data_fim', dia),
      // Tabela legada `indisponibilidades` (colaborador_cpf/colaborador_nome,
      // sem colaborador_id) — cadastro avulso feito direto na tela de
      // Programação (programacao-indisponibilidade-sync.js), separado do
      // fluxo oficial de RH acima. Um colaborador cadastrado só aqui (caso
      // real: atestado registrado nessa tabela mas nunca lançado em
      // rh_atestados) passava batido por este filtro e virava sugestão da
      // Etapa 2 mesmo indisponível — só era bloqueado DEPOIS, na hora de
      // confirmar (pedido do usuário, 2026-07-30: não pode nem aparecer
      // como sugestão). Motivo textual livre; mapeado pra um rótulo fixo.
      supabase.from('indisponibilidades')
        .select('colaborador_cpf,colaborador_nome,motivo')
        .lte('data_inicio', dia)
        .or(`data_fim.is.null,data_fim.gte.${dia}`),
    ]);
    if (ferias.error) throw ferias.error;
    if (atestados.error) throw atestados.error;
    if (legado.error) throw legado.error;
    const motivoLegado = (m) => {
      const n = normalizeText(m);
      if (n.includes('FERI')) return 'Férias';
      if (n.includes('FALTA')) return 'Falta';
      if (n.includes('FOLGA')) return 'Folga';
      return 'Atestado';
    };
    const rows = [
      ...(ferias.data || []).map((r) => ({ ...r, motivoLabel: 'Férias' })),
      ...(atestados.data || []).map((r) => ({ ...r, motivoLabel: 'Atestado' })),
      ...(legado.data || []).map((r) => ({
        colaborador_id: null,
        colaborador_nome: r.colaborador_nome,
        colaborador_cpf: r.colaborador_cpf,
        motivoLabel: motivoLegado(r.motivo),
      })),
    ];
    if (!rows.length) return vazio;

    const uuids = [...new Set(rows.map((r) => r.colaborador_id).filter(Boolean))];
    const porUuid = new Map();
    if (uuids.length) {
      const { data, error } = await supabase.from('colaboradores').select('id,cpf,nome').in('id', uuids);
      if (error) throw error;
      (data || []).forEach((c) => porUuid.set(String(c.id), c));
    }

    const motivoPorChave = new Map(); // cpf norm / uuid / nome cru -> motivo
    const motivoPorNome = new Map();  // nome normalizado -> motivo
    rows.forEach((r) => {
      const cadastro = r.colaborador_id ? porUuid.get(String(r.colaborador_id)) : null;
      const registra = (k) => { if (k && !motivoPorChave.has(k)) motivoPorChave.set(k, r.motivoLabel); };
      registra(cpfNorm(cadastro?.cpf ?? r.colaborador_cpf));
      registra(r.colaborador_id ? String(r.colaborador_id) : '');
      [cadastro?.nome, r.colaborador_nome].forEach((nome) => {
        const cru = String(nome || '').trim();
        if (!cru) return;
        registra(cru);
        const norm = normalizeText(cru);
        if (norm && !motivoPorNome.has(norm)) motivoPorNome.set(norm, r.motivoLabel);
      });
    });

    const motivo = (c) => {
      const id = String(c?.colaboradorId ?? c?.colaborador_id ?? '').trim();
      return (id && motivoPorChave.get(id)) || motivoPorNome.get(normalizeText(c?.nome)) || null;
    };
    return { chavesRpc: [...motivoPorChave.keys()], match: (c) => motivo(c) != null, motivo };
  } catch (e) {
    console.warn('[equipe] indisponibilidade RH indisponível (ignorando)', e);
    return vazio;
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

// O ranking de candidatos (Contrato/Distância/Auditoria) é calculado no banco
// pela RPC programacao_etapa_b_candidatos (ver migração
// 20260625130000_programacao_etapa_b_candidatos_rpc.sql e seguintes), que já
// filtra pelos top 8 por OS usando colaborador_cruzamento pré-computado.
// A RPC programacao_etapa_b_candidatos filtra o pool de colaboradores por uma
// única supervisão — sob "Todas" (múltiplas supervisões na mesma tela),
// agrupamos as O.S. pela própria supervisão (já vem em os.supervisao) e
// chamamos a RPC uma vez por grupo, mesclando os resultados no final.
export async function loadCandidatosPorOs(supervisao, osComPonto, excluirIds) {
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
    // Suportes, supervisores e coordenadores da própria regional podem ser
    // autorizados na O.S. Auditor e administrativo continuam fora da equipe
    // operacional, salvo a supervisão administrativa explicitamente liberada.
    if (!isSupervisaoExcecaoBloqueioCargo(row.supervisao) && isCargoBloqueado(row.cargo)) return;
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

export function aplicarSugestoesRegionais(porOs, osComPonto, colaboradoresRegional, excluirIds) {
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

export function brl(value) {
  return value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function iniciais(nome) {
  return String(nome || '?').trim().split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase() || '?';
}

// Paleta fixa (não aleatória) pra cor do avatar ficar ESTÁVEL pro mesmo
// colaborador entre renders — hash simples da string do id/nome, sem depender
// de nenhuma ordem de carregamento.
const AVATAR_PALETTE = ['#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6', '#f59e0b', '#22c55e', '#06b6d4', '#f97316'];
function avatarColor(seed) {
  const s = String(seed || '');
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return AVATAR_PALETTE[h % AVATAR_PALETTE.length];
}
export function avatarBadgeHtml(nome, seed) {
  return `<span class="peqb-avatar-badge" style="background:${avatarColor(seed || nome)}">${esc(iniciais(nome))}</span>`;
}

export function tipoTone(label) {
  const n = normalizeText(label);
  if (n.includes('EFETIVO')) return 'ok';
  if (n.includes('INTERMITENTE')) return 'warn';
  if (n.includes('DIARISTA')) return 'info';
  return 'muted';
}

// Barra de score quebrada em Contrato / Distância / Auditoria (pesos 50/30/20
// vindos da RPC) — torna visível o que está sustentando o ranking.
export function scoreSeg(cand) {
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

// Cartão selecionável de candidato — substitui cada <option> do antigo select.
export function candCardHtml(cand, selected, minCustoId) {
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

function todayIso() { const n = new Date(); return new Date(n.getTime() - n.getTimezoneOffset() * 60000).toISOString().slice(0, 10); }

// operacional_os.data_os não é confiável pra saber "de que dia é essa
// confirmação" — o trigger do banco só a ajusta na 1ª promoção pra ATENDER,
// então uma O.S. reaproveitada num novo dia de programação fica com data_os
// da vez anterior (achado 11/08: 98% das O.S. confirmadas hoje com data_os
// desalinhada de programacao_dia.data_referencia). A referência real é a
// própria programação sendo editada.
const dataReferenciaCache = new Map();
async function dataReferenciaDaProgramacao(programacaoId) {
  if (!programacaoId) return null;
  if (dataReferenciaCache.has(programacaoId)) return dataReferenciaCache.get(programacaoId);
  const { data, error } = await supabase.from('programacao_dia').select('data_referencia').eq('id', programacaoId).maybeSingle();
  const valor = error ? null : (data?.data_referencia || null);
  dataReferenciaCache.set(programacaoId, valor);
  return valor;
}

const AGENTE_DISTRIBUICAO_OS = 'aplicar-distribuicao-os';

async function enfileirarDistribuicaoOs() {
  const { data: jobAtivo, error: consultaError } = await supabase
    .from('grm_sync_jobs')
    .select('id')
    .eq('agente_id', AGENTE_DISTRIBUICAO_OS)
    .in('status', ['pendente', 'rodando'])
    .limit(1)
    .maybeSingle();
  if (consultaError) throw new Error(`A O.S. voltou para a fila, mas não foi possível verificar o disparo do agente: ${consultaError.message}`);
  if (jobAtivo) return;

  const { error: disparoError } = await supabase
    .from('grm_sync_jobs')
    .insert({ agente_id: AGENTE_DISTRIBUICAO_OS, status: 'pendente' });
  if (disparoError) throw new Error(`A O.S. voltou para a fila, mas o novo disparo do agente falhou: ${disparoError.message}`);
}

async function reabrirDistribuicaoOs(osId, updatedAt = new Date().toISOString()) {
  if (!osId) return;
  const { error } = await supabase
    .from('operacional_os')
    .update({
      status_conferencia: 'PENDENTE',
      conferido_por: null,
      conferido_em: null,
      updated_at: updatedAt,
    })
    .eq('id', osId);
  if (error) throw new Error(`A O.S. foi alterada, mas não voltou para a fila de distribuição: ${error.message}`);
  await enfileirarDistribuicaoOs();
}

// Embarque vem como "UF – CIDADE (FAZENDA…)". Divide em 2 linhas: a 1ª com
// UF - Cidade (UF destacada) e a 2ª com o local em si (o que vier entre
// parênteses, ou o restante do texto quando não houver parênteses).
export function embarqueHtml(embarque) {
  const s = String(embarque == null ? '' : embarque).trim();
  if (!s || s === '-') return '-';
  const m = s.match(/^([A-Za-z]{2})\s*[–-]\s*(.+)$/);
  if (!m) return `<span class="peqb-os2-emb-l1">${esc(s)}</span>`;
  const uf = m[1].toUpperCase();
  const resto = m[2].trim();
  const p = resto.match(/^([^(]+?)\s*\(([^)]*)\)\s*$/);
  const cidade = (p ? p[1] : resto).trim();
  const local = p ? p[2].trim() : '';
  const linha1 = `<span class="peqb-os2-emb-l1"><span class="peqb-os2-uf">${esc(uf)}</span> - ${esc(cidade)}</span>`;
  const linha2 = local ? `<span class="peqb-os2-emb-l2">${esc(local)}</span>` : '';
  return linha1 + linha2;
}

// Núcleo (sem UI) de atualizarStatusOs/openKgModal/openLaudoModal, que viviam
// como closures dentro das antigas renderProgramacaoEquipe/renderProgramacaoSituacao
// (dependiam de osComCandidatosAtual/carregarERenderizar, já removidas). Extraído pra ser
// reaproveitado pelo painel lateral novo (programacao-lista-drawer.js), que
// não tem acesso a esses closures — mesma tabela/mesmo patch, sem UI.
export async function atualizarStatusOsCore(os, nextStatus, currentUserId, dataReferencia) {
  const agoraIso = new Date().toISOString();
  const kgAtivo = String(os?.observacao_logistica || '').startsWith('KG solicitado');
  const patch = {
    status_gestor: nextStatus,
    configurada_em: agoraIso,
    status_conferencia: 'PENDENTE',
    conferido_por: null,
    conferido_em: null,
    updated_at: agoraIso,
  };
  // data_os é quando a O.S. está sendo atendida, não quando foi aberta — ela
  // pode ter sido aberta dias atrás e só ser atendida dias à frente, conforme
  // a necessidade do cliente (esclarecido pelo usuário, 2026-08-03). Move
  // junto com o "Atender" pra bater com o filtro de data do Mapa Operacional.
  if (nextStatus === 'ATENDER' && dataReferencia) patch.data_os = dataReferencia;
  if (!kgAtivo) patch.observacao_logistica = null;
  if (nextStatus === 'FINALIZAR') {
    patch.status_logistica = 'PENDENTE';
    patch.enviado_logistica_em = agoraIso;
    patch.logistica_solicitado_por = currentUserId || null;
  } else {
    patch.status_logistica = null;
    patch.enviado_logistica_em = null;
    patch.logistica_solicitado_por = null;
  }
  const { error } = await supabase.from('operacional_os').update(patch).eq('id', os.id);
  if (error) throw error;
  if (nextStatus === 'ATENDER') {
    await enfileirarDistribuicaoOs();
    marcarMapaRotasPendente(os?.supervisao, patch.data_os || os?.data_os || dataReferencia);
  }
}

export async function registrarSaldoKg(osId, kg) {
  const kgText = `KG solicitado pelo gestor: ${BRI.format(kg)} kg`;
  const { error } = await supabase.from('operacional_os').update({ observacao_logistica: kgText, status_gestor: 'AGUARDAR', configurada_em: null, updated_at: new Date().toISOString() }).eq('id', osId);
  if (error) throw error;
}

// ── Regras de anexo obrigatório na ação Saldo (por cliente) ─────────────────
// Tabela logistica_clientes_anexo_regras: levantamento da usuária de quais
// clientes exigem comprovante/print pra autorizar aumento de saldo (23/07/2026).
// Carregada 1x e cacheada em memória -- poucas dezenas de linhas, sem custo
// de refazer a consulta a cada abertura do modal de Saldo.
let regrasAnexoSaldoCache = null;
let regrasAnexoSaldoPromise = null;

function normalizeClienteChave(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

async function carregarRegrasAnexoSaldo() {
  if (!regrasAnexoSaldoPromise) {
    regrasAnexoSaldoPromise = supabase
      .from('logistica_clientes_anexo_regras')
      .select('cliente,aliases,precisa_anexo,excecao_origem_igual_cliente,observacao')
      .then(({ data, error }) => {
        if (error) { console.warn('[programacao] falha ao carregar regras de anexo de saldo:', error); return []; }
        return (data || []).map((r) => ({
          ...r,
          chaves: [r.cliente, ...(r.aliases || [])].map(normalizeClienteChave).filter(Boolean),
        }));
      });
  }
  regrasAnexoSaldoCache = await regrasAnexoSaldoPromise;
  return regrasAnexoSaldoCache;
}

// Chamar (e aguardar) antes de abrir o modal de Saldo -- mesmo padrão de
// ensureMasterPermission(): precisaAnexoSaldo() é síncrona e depende do
// cache já estar carregado.
export function ensureRegrasAnexoSaldo() {
  return carregarRegrasAnexoSaldo();
}

// operacional_os.cliente segue o padrão "<RAZÃO SOCIAL> - <FILIAL/CIDADE>"
// (ex.: "CARGILL AGRICOLA - SAPEZAL"), por isso o match é por substring
// normalizada (sem acento/pontuação/espaço) contra o cliente da regra OU
// qualquer alias -- em ambas as direções, pra cobrir tanto abreviação
// (BTG ⊂ BTG PACTUAL COMMODITIES...) quanto nome completo batendo com um
// alias mais curto cadastrado na regra.
export function precisaAnexoSaldo(os) {
  const regras = regrasAnexoSaldoCache;
  if (!regras || !regras.length) return { precisaAnexo: false };
  const clienteChave = normalizeClienteChave(os?.cliente);
  if (!clienteChave) return { precisaAnexo: false };
  const regra = regras.find((r) => r.chaves.some((chave) => chave && (clienteChave.includes(chave) || chave.includes(clienteChave))));
  if (!regra || !regra.precisa_anexo) return { precisaAnexo: false };
  if (regra.excecao_origem_igual_cliente) {
    const embarqueChave = normalizeClienteChave(os?.embarque);
    if (embarqueChave && regra.chaves.some((chave) => chave && embarqueChave.includes(chave))) {
      return { precisaAnexo: false };
    }
  }
  return { precisaAnexo: true, cliente: regra.cliente };
}

// Anexo de comprovante da ação Saldo (obrigatório pra alguns clientes, ver
// precisaAnexoSaldo). Guarda em operacional_laudos (mesma tabela/bucket do
// laudo de Conferência) com origem própria pra não se confundir com o laudo
// de remanescente negativo -- NÃO mexe em observacao_logistica (esse campo
// já é usado por registrarSaldoKg pro texto "KG solicitado...").
export async function anexarAnexoSaldo(osId, files, { usuario } = {}) {
  const geo = await capturarGeolocalizacao();
  const urls = [];
  for (const file of files) {
    const path = `${osId}/saldo_${Date.now()}_${(file.name || 'anexo.png').replace(/\s+/g, '_')}`;
    const { data: up, error: upErr } = await supabase.storage.from('os-laudos').upload(path, file, { upsert: true });
    if (upErr) throw upErr;
    const { data: urlData } = supabase.storage.from('os-laudos').getPublicUrl(up.path);
    urls.push(urlData.publicUrl);
  }
  // Diferente do laudo de Conferência (onde esse insert é só auditoria/sinal
  // pra aba Alertas, e o "sinal real" já foi gravado em observacao_logistica):
  // aqui este insert É a única prova do anexo -- não pode falhar em silêncio,
  // senão a exigência vira letra morta sem ninguém perceber.
  const { error } = await supabase.from('operacional_laudos').insert({
    os_id: osId,
    arquivos_urls: urls,
    origem: 'programacao_saldo',
    geo_capturada: !!geo,
    geo_latitude: geo?.lat ?? null,
    geo_longitude: geo?.lng ?? null,
    geo_precisao_m: geo?.accuracy ?? null,
    enviado_por: usuario?.id ?? null,
    enviado_por_nome: usuario?.nome ?? usuario?.email ?? null,
  });
  if (error) throw error;
  return urls;
}

export async function anexarLaudo(osId, files) {
  const user = await getCurrentUser().catch(() => null);
  return anexarLaudoComGeolocalizacao(osId, files, {
    origem: 'programacao',
    usuario: user ? { id: user.id, email: user.email } : null,
  });
}

export async function confirmarCandidato(programacaoId, os, cand) {
  if (!programacaoId) throw new Error('Programação da supervisão não encontrada. Recarregue a data e tente novamente.');
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
  const { data: equipeRow, error } = await supabase.from('programacao_equipe')
    .upsert(payload, { onConflict: 'programacao_id,os_id,colaborador_id' })
    .select('*')
    .single();
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

  // Quem é aceito como sugestão atende a O.S., mesmo que também tenha veículo
  // cadastrado. Somente a ação explícita "Adicionar Frota" marca LOGISTICA.
  //
  // supervisao/coordenacao vêm da própria O.S. (sempre carregada nesse ponto),
  // não do candidato — a lista de candidatos pode ter sido montada antes da
  // O.S. terminar de resolver esses campos, gravando null no espelho em ~15%
  // dos casos num dia (achado em auditoria de dados, 2026-08-03).
  const espelho = {
    programacao_id: programacaoId,
    colaborador_id: cand.colaboradorId,
    nome_colaborador: cand.nome,
    cargo: cand.cargo || null,
    coordenacao: os.coordenacao || cand.coordenacao || null,
    supervisao: os.supervisao || cand.supervisao || null,
    disponibilidade: 'OK',
  };
  const { error: espelhoErr } = await supabase.from('programacao_colaboradores').upsert(espelho, { onConflict: 'programacao_id,colaborador_id' });
  if (espelhoErr) console.warn('[programacao-equipe] falha ao espelhar disponibilidade.', espelhoErr);
  await reabrirDistribuicaoOs(os.id);
  // Confirmar candidato aqui é quem de fato promove a O.S. pra ATENDER (via
  // trigger programacao_equipe_marca_os_atender no banco) — não passa por
  // atualizarStatusOsCore. Sem isto o Mapa Operacional ficava sem
  // Colaborador/Veículo/Rota mesmo com a O.S. atendida (achado 11/08).
  marcarMapaRotasPendente(os?.supervisao, await dataReferenciaDaProgramacao(programacaoId));
  return equipeRow;
}

let frotasMotoristasCache = null;
const FROTAS_MOTORISTAS_CACHE_TTL_MS = 60000;

// Motorista de Frota: entra na O.S. pelo mesmo pipeline de colaborador
// (programacao_equipe/operacional_os_colaboradores/programacao_colaboradores),
// só que a busca vem do cadastro de Frotas > Motoristas em vez da base
// regional — ele leva colaboradores até a O.S., mas não atende ela. O card
// de despesas já entende MOTORISTA FROTA como um tipo de deslocamento
// normal, então ele ganha as mesmas opções (Almoço/Estadia/Extras) de quem
// atende.
export async function loadFrotasMotoristas() {
  const agora = Date.now();
  if (frotasMotoristasCache && (agora - frotasMotoristasCache.ts) < FROTAS_MOTORISTAS_CACHE_TTL_MS) {
    return frotasMotoristasCache.promise;
  }
  const promise = (async () => {
    const { data, error } = await supabase
      .from('frotas_motoristas')
      .select('id,nome,cpf,status')
      .eq('status', 'ATIVO')
      .not('cpf', 'is', null)
      .order('nome');
    if (error) throw error;
    return (data || [])
      .map((r) => ({ colaboradorId: cpfNorm(r.cpf), nome: r.nome }))
      .filter((r) => r.colaboradorId && r.nome);
  })();
  frotasMotoristasCache = { promise, ts: agora };
  return promise;
}

export async function adicionarFrotaOs(programacaoId, os, motorista) {
  const equipeRow = await adicionarColaboradorOs(programacaoId, os, motorista);

  // Persiste a intenção no vínculo da O.S. para relatórios/Compartilhar não
  // inferirem o papel pelo tipo de deslocamento ou pelo cadastro do motorista.
  const { error: vinculoPapelErr } = await supabase.from('operacional_os_colaboradores')
    .update({ origem_sugestao: 'PROGRAMACAO_FROTA_LOGISTICA' })
    .eq('os_id', os.id)
    .eq('colaborador_key', motorista.colaboradorId);
  if (vinculoPapelErr) console.warn('[programacao-equipe] falha ao marcar vínculo de Frota.', vinculoPapelErr);

  // adicionarColaboradorOs só marca disponibilidade: 'LOGISTICA' quando o
  // candidato já vem com veiculoId preenchido (colaborador com veículo
  // cruzado em colaborador_cruzamento) — não é o caso do motorista de Frota,
  // que entra sem esse cruzamento e cairia em 'OK' por padrão, contando como
  // atendimento normal em qualquer tela que use essa convenção. Corrige aqui
  // por cima, sem mexer em adicionarColaboradorOs (usado por colaboradores
  // de verdade).
  const { error: espelhoErr } = await supabase.from('programacao_colaboradores')
    .update({ disponibilidade: 'LOGISTICA' })
    .eq('programacao_id', programacaoId)
    .eq('colaborador_id', motorista.colaboradorId);
  if (espelhoErr) console.warn('[programacao-equipe] falha ao marcar motorista de frota como LOGISTICA.', espelhoErr);

  // Pré-marca o deslocamento como "Frota - Motorista" pra já abrir o card
  // nesse tipo — a placa fica pro gestor preencher no próprio card (mesmo
  // campo usado por qualquer colaborador com deslocamento de frota/carona).
  const { error: deslocErr } = await supabase.from('programacao_deslocamento').upsert({
    programacao_id: programacaoId,
    colaborador_id: motorista.colaboradorId,
    nome_colaborador: motorista.nome,
    tipo_deslocamento: 'MOTORISTA FROTA',
    km: 0,
    valor: 0,
  }, { onConflict: 'programacao_id,colaborador_id', ignoreDuplicates: true });
  if (deslocErr) console.warn('[programacao-equipe] falha ao pré-marcar deslocamento do motorista de frota.', deslocErr);

  return equipeRow;
}

export async function adicionarColaboradorOs(programacaoId, os, cand) {
  if (!programacaoId) throw new Error('Programação da supervisão não encontrada. Recarregue a data e tente novamente.');
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
      coordenacao: os.coordenacao || cand.coordenacao || null,
      supervisao: os.supervisao || cand.supervisao || null,
      // "Adicionar colaborador" significa atendimento. Ter veículo cadastrado
      // não transforma automaticamente essa associação em apoio logístico.
      disponibilidade: 'OK',
    }, { onConflict: 'programacao_id,colaborador_id' }),
  ]);
  if (vinculoRes?.error) console.warn('[programacao-equipe] falha ao gravar colaborador adicional da OS.', vinculoRes.error);
  if (espelhoRes?.error) console.warn('[programacao-equipe] falha ao espelhar colaborador adicional.', espelhoRes.error);
  await reabrirDistribuicaoOs(os.id);
  marcarMapaRotasPendente(os?.supervisao, await dataReferenciaDaProgramacao(programacaoId));

  return upsertRows?.[0] || { ...payload, id: null };
}

export async function removerConfirmacao(programacaoId, equipeRowId) {
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
    await reabrirDistribuicaoOs(osId);
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
