// Programação — tela única "lista + painel lateral" (2026-07-21), substitui o
// sistema de 4 abas (Situação da O.S. / Equipe + Mapa / Despesas / Sem O.S.)
// por um modelo de referência que a usuária mandou (mockup "GuiM Logística"):
// lista de O.S. à esquerda (filtro/paginação) + painel lateral (drawer) que
// abre ao clicar na O.S., com Ações de status + Colaboradores da O.S. (cada
// um com Deslocamento/Estadia/Alimentação/Extras) + Justificativa + Salvar.
//
// Não reimplementa a lógica de dados — reaproveita 100% do que já existe em
// programacao-equipe.js (candidatos/custos/status/etc.) e programacao-despesas.js
// (colaboradorCardHtml + autosave via wireDespesasCards), só com uma
// apresentação nova. "Sem O.S." continua como aba separada (renderProgramacaoSemOs)
// porque não é sobre uma O.S. — não cabe no modelo de painel lateral.
import { supabase } from './supabaseClient.js';
import { logActivity } from './activityLogger.js';
import { getCurrentUser } from './auth.js';
import { confirmar } from './core/ui.js';
import {
  loadOsRelevantes, loadOsRelevantePorNumero, loadEquipeExistente, loadCustos, loadCruzamentoPlacas, loadCruzamentoTipoContrato,
  loadColaboradoresRegional, loadIndisponiveisNaData, loadPontos, loadCandidatosPorOs,
  aplicarSugestoesRegionais, loadDisponibilidadeConfirmados,
  ordenarCandidatosPorEmbarque, candCardHtml, tipoTone, avatarBadgeHtml, embarqueHtml,
  brl, statusNorm, isDataPassada,
  confirmarCandidato, adicionarColaboradorOs, removerConfirmacao,
  loadFrotasMotoristas, adicionarFrotaOs,
  atualizarStatusOsCore, registrarSaldoKg, anexarLaudo,
  injectStyles as injectStylesEquipe, ensureMasterPermission,
  ensureRegrasAnexoSaldo, precisaAnexoSaldo, anexarAnexoSaldo,
} from './programacao-equipe.js?v=20260828-desligamento-readmitido1';
import { loadExtras, colaboradorCardHtml, wireDespesasCards, loadAlojamentos, loadVeiculosAtivos, injectStylesDespesas } from './programacao-despesas.js?v=20260810-agrupar-hoteis';

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
function todayIso() { const n = new Date(); return new Date(n.getTime() - n.getTimezoneOffset() * 60000).toISOString().slice(0, 10); }

let currentUser = null;
getCurrentUser().then((u) => { currentUser = u; }).catch(() => {});

const state = {
  busca: '',
  cliente: '',
  cidade: '',
  local: '',
  soRemanescente: false,
  osAbertaId: null,
  sortField: null,
  sortDir: 'asc',
};

// Mesma extração de "UF - Cidade (Local)" usada em programacao-despesas.js/
// programacao-hospedagem-colaboradores-fix.js — só a cidade, sem o local
// específico entre parênteses.
function cidadeFromEmbarque(embarque) {
  const m = /^[A-Z]{2}\s*-\s*([^(]+)/.exec(String(embarque || '').trim());
  return m ? m[1].trim() : '';
}

function injectStyles() {
  if (document.getElementById('pldStyles')) return;
  const style = document.createElement('style');
  style.id = 'pldStyles';
  style.textContent = `
    /* Lista sempre em largura total; o painel de programação abre como OVERLAY
       fixo à direita, sem comprimir os filtros/lista (que antes "amassavam"
       num grid de 2 colunas quando o painel abria — reportado pela usuária,
       2026-07-21). */
    .pld-shell{position:relative}
    .pld-list-col{min-width:0;max-width:1100px}
    .pld-backdrop{position:fixed;inset:0;background:rgba(2,6,23,.45);z-index:180;opacity:0;transition:opacity .18s ease}
    .pld-backdrop.show{opacity:1}
    .pld-backdrop[hidden]{display:none}
    .pld-title{margin:0;font-size:22px;font-weight:950;color:#f8fafc;letter-spacing:.01em}
    .pld-subtitle{margin:4px 0 14px;color:#8ba79a;font-size:13px}
    /* Os 4 campos de filtro (busca/cliente/cidade/local) ficam SEMPRE numa
       linha só, sem quebrar (pedido do usuário, 2026-07-23) — .pld-filters-row
       tem flex-wrap:nowrap e cada campo com flex-basis 0 (min-width:0 pra
       poder encolher em vez de forçar quebra). O toggle "só remanescente" é
       um irmão de fora dessa row, sempre na linha de baixo — não depende mais
       do truque de flex-basis:100%+order (pedido do usuário, 2026-07-22:
       "não consumir tanto espaço de tela"). */
    .pld-filters{display:flex;flex-direction:column;gap:8px;margin-bottom:12px}
    .pld-filters-row{display:flex;flex-wrap:nowrap;gap:8px;align-items:center}
    .pld-filters-row input[type="text"],.pld-filters-row select{height:38px;border:1px solid rgba(52,211,153,.22);background:#0d0d18;color:#e2e2f0;border-radius:11px;padding:0 12px;font-size:12.5px;color-scheme:dark}
    .pld-filters-row input[type="text"]{flex:1.3 1 0;min-width:0}
    .pld-filters-row select{flex:1 1 0;min-width:0}
    /* Cliente/Cidade/Local têm muitas opções -> searchableSelect.js (global)
       troca o <select> por um combobox pesquisável (.ssel-wrap/.ssel-input),
       que por padrão vem com width:100% e sem cor nenhuma (herda o
       branco/azulado nativo do navegador) — cada campo ficava sozinho numa
       linha inteira e com uma cara clara destoando do resto do painel
       (pedido do usuário, 2026-07-22). Aqui eles ganham o mesmo tamanho/tema
       do <select> que substituem, encolhendo junto com o resto da linha.
    */
    .pld-filters-row .ssel-wrap{width:auto;flex:1 1 0;min-width:0}
    .pld-filters-row .ssel-input{height:38px;box-sizing:border-box;border:1px solid rgba(52,211,153,.22);background:#0d0d18;color:#e2e2f0;border-radius:11px;padding:0 12px;font-size:12.5px}
    .pld-toggle{display:flex;align-items:center;gap:8px;font-size:12px;color:#8ba79a;white-space:nowrap;cursor:pointer}
    .pld-toggle input{accent-color:#16a34a;width:16px;height:16px}
    .pld-count-row{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;font-size:12.5px;color:#8ba79a}
    .pld-count-row b{color:#6fd0a5}
    /* A lista rola dentro da própria caixa (altura travada ao viewport), em
       vez de crescer com a página inteira — assim ela tem rolagem
       independente do painel lateral fixo (que já rola sozinho, ver
       .pld-drawer em programacao-lista-drawer-fixo.js), e cabem todas as O.S.
       de uma vez sem paginação (pedido do usuário, 2026-07-22). */
    .pld-table-wrap{border:1px solid rgba(52,211,153,.16);border-radius:16px;background:rgba(2,6,23,.28);max-height:calc(100vh - 300px);overflow-y:auto}
    .pld-table{width:100%;border-collapse:separate;border-spacing:0}
    .pld-table thead th{position:sticky;top:0;z-index:2;text-align:left;font-size:10.5px;font-weight:850;letter-spacing:.06em;text-transform:uppercase;color:#93c5fd;padding:11px 14px;border-bottom:1px solid rgba(52,211,153,.16);background:#0a1710}
    .pld-th-sort{cursor:pointer;user-select:none;white-space:nowrap}
    .pld-th-sort:hover{color:#bfe3ff}
    .pld-th-sort .pld-sort-arrow{margin-left:4px;color:#6fd0a5;font-size:9px}
    .pld-row{cursor:pointer;border-bottom:1px solid rgba(148,163,184,.1)}
    .pld-row:last-child{border-bottom:0}
    .pld-row:hover td{background:rgba(34,197,94,.06)}
    /* Destaque mais forte que um simples tingimento de fundo — faixa verde
       na borda esquerda + fundo mais evidente, pra achar de relance qual
       O.S. está aberta no painel lateral (pedido do usuário, 2026-07-22:
       "faltou o destaque da OS selecionada"). */
    .pld-row.active td{background:rgba(34,197,94,.16)}
    .pld-row.active td:first-child{box-shadow:inset 3px 0 0 #22c55e}
    .pld-row td{padding:12px 14px;vertical-align:middle;font-size:13px;color:#e2e2f0}
    .pld-os-num{display:flex;align-items:center;gap:8px;font-weight:900;color:#f8fafc}
    .pld-os-contrato{margin:2px 0 0 16px;font-size:10.5px;color:#7d8aa3}
    .pld-dot{width:8px;height:8px;border-radius:50%;flex:0 0 auto}
    .pld-dot.tone-pendente{background:#64748b}
    .pld-dot.tone-aguardar{background:#f59e0b}
    .pld-dot.tone-atender{background:#22c55e}
    .pld-dot.tone-finalizar{background:#475569}
    .pld-cliente{font-weight:750;color:#f8fafc}
    .pld-local-uf{color:#6fd0a5;font-weight:900}
    .pld-local-cid{color:#8ba79a;font-size:11.5px;margin-top:1px}
    .pld-rem{font-weight:900;color:#f8fafc;white-space:nowrap}
    .pld-chevron{color:#6b7a86;font-size:15px}
    .pld-empty{padding:26px;text-align:center;color:#94a3b8}

    /* Painel lateral — overlay fixo, desliza da direita. O backdrop e o drawer
       vivem direto no <body> (fora de #pageContent) porque position:fixed vira
       relativo a QUALQUER ancestral com transform/filter/will-change — e vários
       ancestrais têm :hover{transform:...}, o que fazia o painel "pular"
       conforme o mouse (reportado pela usuária, 2026-07-21). Ancorado no body,
       fica imune a isso. box-sizing:border-box pra a largura já incluir o
       padding (senão o painel passava dos 440px pedidos). */
    /* z-index alto pra o painel (top:0, altura total) ficar ACIMA da topbar
       fixa do app — senão o cabeçalho do painel (nº da O.S. + botão fechar)
       fica cortado atrás dela. Abaixo dos modais (.pld-modal-ov = 9999), que
       precisam abrir por cima do painel (KG/laudo/justificativa). */
    .pld-overlay-root{position:fixed;inset:0;z-index:9990;pointer-events:none}
    .pld-overlay-root .pld-backdrop,.pld-overlay-root .pld-drawer{pointer-events:auto}
    .pld-drawer{box-sizing:border-box;position:fixed;top:0;right:0;z-index:190;width:min(440px,94vw);height:100vh;overflow-y:auto;border-left:1px solid rgba(52,211,153,.22);background:#0a1a12;padding:20px 22px;box-shadow:-18px 0 48px rgba(0,0,0,.5);transform:translateX(100%);transition:transform .2s ease}
    .pld-drawer.open{transform:translateX(0)}
    .pld-drawer[hidden]{display:none}
    .pld-drawer-head{display:flex;align-items:center;justify-content:space-between;gap:10px}
    .pld-os-title{display:flex;align-items:center;gap:10px;font-size:19px;color:#f8fafc}
    .pld-os-title b{font-weight:950}
    .pld-status-badge{font-size:10.5px;font-weight:900;padding:4px 10px;border-radius:999px;background:rgba(34,197,94,.18);color:#86efac;border:1px solid rgba(34,197,94,.32)}
    .pld-status-badge.tone-fim{background:rgba(100,116,139,.18);color:#cbd5e1;border-color:rgba(100,116,139,.32)}
    .pld-drawer-close{border:0;background:transparent;color:#8ba79a;font-size:20px;cursor:pointer;line-height:1;padding:4px}
    .pld-drawer-close:hover{color:#f8fafc}
    .pld-drawer-sub{display:flex;justify-content:space-between;align-items:flex-start;gap:14px;margin:14px 0 18px;padding-bottom:16px;border-bottom:1px solid rgba(111,208,165,.14)}
    .pld-sub-left{font-size:13px;color:#e2e2f0;line-height:1.5}
    .pld-sub-emb{color:#8ba79a;font-size:12px;margin-top:2px}
    .pld-sub-rem{text-align:right;flex:0 0 auto}
    .pld-sub-rem span{display:block;font-size:10px;color:#7d8aa3;text-transform:uppercase;letter-spacing:.06em;font-weight:850}
    .pld-sub-rem strong{display:block;margin-top:3px;font-size:17px;color:#f8fafc}
    .pld-section-label{font-size:10.5px;font-weight:900;letter-spacing:.08em;text-transform:uppercase;color:#7d8aa3;margin:0 0 10px;display:flex;align-items:center;justify-content:space-between}
    .pld-section-label a,.pld-section-label button.pld-link{background:none;border:0;color:#6fd0a5;font-size:11.5px;font-weight:850;cursor:pointer;padding:0}
    .pld-acoes-row{display:flex;gap:8px;margin-bottom:22px;flex-wrap:wrap}
    .pld-acao-btn{display:flex;flex-direction:column;align-items:center;gap:6px;background:none;border:0;cursor:pointer;color:#9fb7aa;font-size:10px;font-weight:800;width:66px}
    .pld-acao-btn span.pld-acao-ico{width:44px;height:44px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:17px;background:rgba(148,163,184,.12);color:#cbd5e1;border:1px solid rgba(148,163,184,.16)}
    .pld-acao-btn:hover span.pld-acao-ico{border-color:rgba(148,163,184,.35)}
    .pld-acao-btn.on span.pld-acao-ico{background:rgba(22,163,74,.28);color:#86efac;border-color:rgba(34,197,94,.5)}
    .pld-acao-btn[disabled]{opacity:.4;cursor:not-allowed}
    .pld-lock{border:1px dashed rgba(148,163,184,.25);border-radius:14px;padding:20px;text-align:center;color:#8ba79a;font-size:12.5px;line-height:1.5}
    .pld-lock b{color:#cbd5e1}
    /* Candidato sugerido sempre visível (nome/tag/veículo, ver candCardHtml)
       ao lado dos botões de confirmar/recusar — antes o card ficava
       escondido (só "Confirmar"/"Outro" em texto) e o gestor confirmava sem
       saber quem estava sendo sugerido (pedido do usuário, 2026-07-22).
       sub-linha (km/score) e barra de score escondidas; botões em quadrado
       arredondado (em vez de círculo) pra casar com o padrão visual das
       tags do próprio colaborador (pedido 29/07), EMPILHADOS um sobre o
       outro (não lado a lado) pra sobrar mais largura horizontal pro
       card do nome (pedido 29/07). align-items:stretch (em vez de center)
       + botões com flex:1 (em vez de altura fixa) fazem a coluna de ações
       ocupar exatamente a altura do card, nunca mais nem menos — antes os
       dois botões de 34px empilhados ultrapassavam a altura do card em
       cards de 1 linha só (pedido 30/07). Confirmar/recusar viram o MESMO
       "layout" de cor (gradiente diagonal + borda na mesma tonalidade),
       só trocando verde por vermelho, em vez de um sólido e outro
       translúcido (pedido 30/07). Fontes do card em si compactadas junto
       com o resto do painel lateral, ver #pldOverlayRoot .peqb-cand-* em
       programacao-lista-drawer-fixo.js. */
    .pld-cand-wrap{display:flex;align-items:stretch;gap:8px;margin-bottom:10px}
    .pld-cand-wrap .peqb-cand{width:auto;flex:1 1 auto;margin-top:0}
    .pld-cand-wrap .peqb-cand-sub,.pld-cand-wrap .peqb-score,.pld-cand-wrap .peqb-cand-cost{display:none}
    .pld-cand-actions{flex:0 0 auto;display:flex;flex-direction:column;gap:6px;width:34px}
    .pld-cand-confirm,.pld-cand-reject{flex:1 1 0;min-height:0;border-radius:13px;font-size:14px;font-weight:950;cursor:pointer;display:flex;align-items:center;justify-content:center}
    .pld-cand-confirm{border:1px solid rgba(134,239,172,.5);background:linear-gradient(135deg,#16a34a,#86efac);color:#052e16}
    .pld-cand-confirm:hover{filter:brightness(1.08)}
    .pld-cand-reject{border:1px solid rgba(252,165,165,.5);background:linear-gradient(135deg,#b91c1c,#fca5a5);color:#450a0a}
    .pld-cand-reject:hover{filter:brightness(1.08)}
    .pld-cand-confirm:disabled{opacity:.5;cursor:not-allowed;filter:grayscale(.4)}
    .pld-colab-card{border:1px solid rgba(52,211,153,.18);border-radius:14px;background:rgba(2,6,23,.3);padding:12px 14px;margin-bottom:12px}
    .pld-colab-card .peqd-card{border:0;padding:0;background:transparent}
    .pld-colab-card .peqd-head{display:none}
    .pld-colab-head{display:flex;align-items:center;gap:9px;margin-bottom:11px}
    .pld-colab-head .peqb-avatar-badge{width:28px;height:28px;font-size:10.5px}
    .pld-colab-nome{font-size:13.5px;font-weight:850;color:#f8fafc;flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .pld-colab-tag{font-size:10px;font-weight:850;padding:3px 9px;border-radius:999px;border:1px solid rgba(148,163,184,.25);white-space:nowrap}
    .pld-colab-tag.t-ok{background:rgba(22,163,74,.18);color:#bbf7d0;border-color:rgba(34,197,94,.3)}
    .pld-colab-tag.t-warn{background:rgba(245,158,11,.14);color:#fde68a;border-color:rgba(245,158,11,.3)}
    .pld-colab-tag.t-info{background:rgba(59,130,246,.16);color:#bfdbfe;border-color:rgba(59,130,246,.3)}
    .pld-colab-tag.t-muted{background:rgba(148,163,184,.14);color:#cbd5e1}
    /* Destaque verde pra colaborador já confirmado em outra O.S. hoje (evita escalar 2x sem perceber). */
    .pld-colab-card.ja-outra-os{border-color:rgba(34,197,94,.55);box-shadow:0 0 0 1px rgba(34,197,94,.2) inset}
    .pld-colab-outra-os-badge{font-size:10px;font-weight:850;padding:3px 9px;border-radius:999px;background:rgba(34,197,94,.18);color:#86efac;border:1px solid rgba(34,197,94,.4);white-space:nowrap}
    .pld-colab-remover{flex:0 0 auto;width:22px;height:22px;border-radius:6px;border:0;background:none;color:#8ba79a;font-size:12px;cursor:pointer;display:flex;align-items:center;justify-content:center}
    .pld-colab-remover:hover{background:rgba(239,68,68,.14);color:#fca5a5}
    .pld-add-box{display:flex;gap:8px;align-items:center;border:1px solid rgba(56,189,248,.28);background:rgba(15,23,42,.72);border-radius:11px;padding:8px;margin-bottom:12px}
    .pld-add-box select{flex:1 1 auto;height:34px;border:1px solid rgba(56,189,248,.3);background:#06130e;color:#eef7f2;border-radius:8px;padding:0 8px;font-size:12px;color-scheme:dark}
    .pld-add-box button{height:34px;padding:0 12px;border-radius:8px;border:1px solid rgba(56,189,248,.42);background:rgba(14,116,144,.2);color:#bfdbfe;font-size:11.5px;font-weight:850;cursor:pointer}
    .pld-loading{display:flex;align-items:center;gap:10px;color:#94a3b8;padding:18px;font-size:12.5px}
    .pld-spinner{width:20px;height:20px;border-radius:999px;border:3px solid rgba(111,208,165,.18);border-top-color:#6fd0a5;flex:0 0 auto;animation:pldSpin .75s linear infinite}
    @keyframes pldSpin{to{transform:rotate(360deg)}}
    .pld-modal-ov{position:fixed;inset:0;background:rgba(2,6,23,.72);display:flex;align-items:center;justify-content:center;z-index:9999;padding:16px}
    .pld-modal{background:#0c1f17;border:1px solid rgba(111,208,165,.25);border-radius:16px;padding:18px;width:100%;max-width:420px;display:flex;flex-direction:column;gap:10px;max-height:80vh;overflow-y:auto}
    .pld-modal h3{margin:0;font-size:15px;color:#f8fafc}
    .pld-modal p{margin:0;font-size:12px;color:#9fb7aa}
    .pld-modal input,.pld-modal textarea{padding:9px 10px;border-radius:9px;border:1px solid rgba(111,208,165,.3);background:#0a1e17;color:#f8fafc;font-size:13px;color-scheme:dark}
    .pld-modal-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:4px}
    .pld-modal-btn{border:1px solid rgba(148,163,184,.28);background:rgba(15,23,42,.6);color:#e2e2f0;border-radius:9px;padding:8px 14px;font-size:12.5px;font-weight:800;cursor:pointer}
    .pld-modal-btn.primary{border-color:rgba(134,239,172,.4);color:#bbf7d0;background:rgba(22,163,74,.16)}
    .pld-anexo-area{border:1px dashed rgba(111,208,165,.4);border-radius:10px;padding:14px 10px;display:flex;flex-direction:column;align-items:center;gap:6px;text-align:center;cursor:pointer;color:#9fb7aa;font-size:12px}
    .pld-anexo-area:hover,.pld-anexo-area:focus{border-color:rgba(134,239,172,.7);outline:none}
    .pld-anexo-pick{color:#6fd0a5;font-weight:800;text-decoration:underline;cursor:pointer}
    .pld-anexo-list{display:flex;flex-wrap:wrap;gap:6px}
    .pld-anexo-chip{background:rgba(111,208,165,.14);border:1px solid rgba(111,208,165,.3);color:#bbf7d0;border-radius:999px;padding:4px 9px;font-size:11px;font-weight:700;max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .pld-anexo-erro{color:#fca5a5!important;font-weight:800}
    .prog-readonly-banner{display:flex;align-items:center;gap:8px;margin:0 0 12px;padding:10px 14px;border:1px solid rgba(234,179,8,.32);background:rgba(234,179,8,.1);border-radius:12px;color:#fde68a;font-size:12.5px;font-weight:800}
    @media(max-width:560px){.pld-drawer{width:100vw}}
  `;
  document.head.appendChild(style);
}

function fmtRem(value) {
  const n = Number(value);
  return Number.isFinite(n) ? brl(n) : '-';
}

function statusToneClass(os) {
  const st = statusNorm(os);
  if (st === 'ATENDER') return 'tone-atender';
  if (st === 'AGUARDAR') return 'tone-aguardar';
  if (st === 'FINALIZAR') return 'tone-finalizar';
  return 'tone-pendente';
}

function programacaoIdParaOs(os, programacaoId, programacaoIdMap) {
  return programacaoIdMap?.size ? (programacaoIdMap.get(os?.supervisao) || null) : programacaoId;
}

export async function renderProgramacaoListaDrawer(content, options = {}) {
  injectStyles();
  // Os cards de Estadia/Alimentação/Deslocamento/Extras usam as classes .peqd-*
  // definidas em programacao-despesas.js — sem chamar renderProgramacaoDespesas
  // (a tela antiga), o CSS delas nunca era injetado e os cards ficavam sem
  // estilo dentro do painel lateral (reportado pela usuária, 2026-07-21).
  injectStylesDespesas();
  // Mesmo caso pro candidato sugerido (candCardHtml/.peqb-cand-*): o CSS
  // delas vivia em programacao-equipe.js, só injetado pelas antigas
  // renderProgramacaoSituacao/renderProgramacaoEquipe. Removidas essas 2
  // (código morto, 2026-07-22), injectStyles() ficou órfã — sem chamá-la
  // aqui, o card do candidato sugerido voltava a ficar sem estilo.
  injectStylesEquipe();
  // Idem ensureMasterPermission(): isDataPassada() (usada logo abaixo, em
  // abrirDrawer) só isenta usuário master do bloqueio de data retroativa se
  // isso já tiver sido resolvido. Também só era chamada pelas renders
  // antigas removidas — sem aguardar aqui, gestor master ficava travado
  // como usuário comum em datas passadas.
  await Promise.all([ensureMasterPermission(), ensureRegrasAnexoSaldo()]);
  const supervisao = String(options.supervisao || '').trim();
  const programacaoId = options.programacaoId || null;
  const programacaoIdMap = options.programacaoIdMap instanceof Map ? options.programacaoIdMap : new Map();
  const supervisaoQuery = programacaoIdMap.size ? [...programacaoIdMap.keys()] : supervisao;
  const programacaoIdQuery = programacaoIdMap.size ? [...programacaoIdMap.values()] : programacaoId;
  const readOnly = isDataPassada(options.dataReferencia);

  content.innerHTML = `
    ${readOnly ? '<div class="prog-readonly-banner">🔒 Data retroativa — somente leitura. Só é possível editar a programação de hoje em diante.</div>' : ''}
    <div class="pld-shell" id="pldShell">
      <div class="pld-list-col">
        <div class="pld-filters">
          <div class="pld-filters-row">
            <input type="text" id="pldBusca" placeholder="Buscar O.S. ou cliente..." />
            <select id="pldCliente"><option value="">Todos os clientes</option></select>
            <select id="pldCidade"><option value="">Todas as cidades</option></select>
            <select id="pldLocal"><option value="">Todos os locais</option></select>
          </div>
          <label class="pld-toggle"><input type="checkbox" id="pldSoRemanescente" /> Exibir apenas O.S. com remanescente</label>
        </div>
        <div id="pldListaBody"><div class="pld-loading"><span class="pld-spinner" aria-hidden="true"></span><span>Carregando O.S. da supervisão...</span></div></div>
      </div>
    </div>
  `;

  // Backdrop + drawer ancorados no <body> (não em #pageContent) — ver comentário
  // no CSS de .pld-overlay-root: position:fixed quebra dentro de ancestral com
  // transform, e há :hover{transform} em vários lugares, o que fazia o painel
  // "pular" com o mouse. Remove um root anterior antes de criar (o Carregar
  // re-renderiza a tela, senão vazaria um overlay órfão no body a cada clique).
  document.getElementById('pldOverlayRoot')?.remove();
  const overlayRoot = document.createElement('div');
  overlayRoot.id = 'pldOverlayRoot';
  overlayRoot.className = 'pld-overlay-root';
  overlayRoot.innerHTML = `
    <div class="pld-backdrop" id="pldBackdrop" hidden></div>
    <aside class="pld-drawer" id="pldDrawer" hidden></aside>
  `;
  document.body.appendChild(overlayRoot);

  const listaBody = content.querySelector('#pldListaBody');
  const backdropEl = overlayRoot.querySelector('#pldBackdrop');
  if (!supervisao || (!programacaoId && !programacaoIdMap.size)) {
    listaBody.innerHTML = '<div class="pld-empty">Carregue o contexto (supervisão e data) para ver as O.S.</div>';
    return;
  }

  let osTodasAtual = [];
  let equipeRowsAtual = [];
  const shellEl = content.querySelector('#pldShell');
  const drawerEl = overlayRoot.querySelector('#pldDrawer');

  // Memo de dados que dependem só de supervisão/data (fixos durante todo o
  // render): sem isso, cada abertura de painel refazia loadColaboradoresRegional
  // (que bate no colaborador_snapshot, o gargalo lento do projeto) DUAS vezes —
  // uma no candidato sugerido, outra no popularAddBox — além de placas/contrato/
  // indisponíveis a cada O.S. Reportado pela usuária como carregamento lento
  // (2026-07-21). A promise é guardada (não o resultado) pra que chamadas
  // concorrentes na mesma abertura compartilhem o mesmo fetch.
  const memo = {};
  function memoized(chave, fn) {
    if (!memo[chave]) memo[chave] = fn();
    return memo[chave];
  }
  const getRegional = () => memoized('regional', () => loadColaboradoresRegional(supervisaoQuery));
  const getIndisponiveis = () => memoized('indisp', () => loadIndisponiveisNaData(options.dataReferencia));
  const getPlacas = () => memoized('placas', () => loadCruzamentoPlacas(supervisaoQuery));
  const getTipoContrato = () => memoized('tipoContrato', () => loadCruzamentoTipoContrato(supervisaoQuery));
  const getVeiculos = () => memoized('veiculos', () => loadVeiculosAtivos(supervisaoQuery));

  async function recarregarEquipeRows() {
    equipeRowsAtual = await loadEquipeExistente(programacaoIdQuery);
    return equipeRowsAtual;
  }

  // O upsert devolve a linha que o banco acabou de confirmar. Usa essa linha
  // imediatamente no estado da tela em vez de depender de uma segunda leitura
  // geral, que pode chegar atrasada e fazer o colaborador "sumir" logo depois
  // do salvamento. A chave também cobre o caso de um registro já existente.
  function aplicarEquipeRowSalva(row) {
    if (!row) return;
    const mesmaLinha = (atual) => String(atual.id || '') === String(row.id || '')
      || (String(atual.programacao_id) === String(row.programacao_id)
        && String(atual.os_id) === String(row.os_id)
        && String(atual.colaborador_id) === String(row.colaborador_id));
    equipeRowsAtual = [...equipeRowsAtual.filter((atual) => !mesmaLinha(atual)), row];
  }

  function confirmadosPorOsMap() {
    const map = new Map();
    equipeRowsAtual.filter((r) => r.confirmado).forEach((r) => {
      if (!map.has(r.os_id)) map.set(r.os_id, r);
    });
    return map;
  }

  function equipeRowsDaOs(osId) {
    return equipeRowsAtual.filter((r) => r.confirmado && String(r.os_id) === String(osId));
  }

  function popularFiltros() {
    const clienteSel = content.querySelector('#pldCliente');
    const cidadeSel = content.querySelector('#pldCidade');
    const localSel = content.querySelector('#pldLocal');
    const clienteAtual = clienteSel.value;
    const cidadeAtual = cidadeSel.value;
    const localAtual = localSel.value;
    const clientes = [...new Set(osTodasAtual.map((os) => os.cliente).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    const cidades = [...new Set(osTodasAtual.map((os) => cidadeFromEmbarque(os.embarque)).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    const locais = [...new Set(osTodasAtual.map((os) => os.embarque).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    clienteSel.innerHTML = '<option value="">Todos os clientes</option>' + clientes.map((c) => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
    cidadeSel.innerHTML = '<option value="">Todas as cidades</option>' + cidades.map((c) => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
    localSel.innerHTML = '<option value="">Todos os locais</option>' + locais.map((l) => `<option value="${esc(l)}">${esc(l)}</option>`).join('');
    clienteSel.value = clientes.includes(clienteAtual) ? clienteAtual : '';
    cidadeSel.value = cidades.includes(cidadeAtual) ? cidadeAtual : '';
    localSel.value = locais.includes(localAtual) ? localAtual : '';
  }

  function osFiltradas() {
    const busca = normalizeText(state.busca);
    const filtradas = osTodasAtual.filter((os) => {
      if (state.cliente && os.cliente !== state.cliente) return false;
      if (state.cidade && cidadeFromEmbarque(os.embarque) !== state.cidade) return false;
      if (state.local && os.embarque !== state.local) return false;
      if (state.soRemanescente && !(Number(os.remanescente) > 0)) return false;
      if (busca && !normalizeText(`${os.numero_os} ${os.cliente} ${os.embarque}`).includes(busca)) return false;
      return true;
    });
    if (!state.sortField) return filtradas;
    const dir = state.sortDir === 'desc' ? -1 : 1;
    const campo = state.sortField;
    return [...filtradas].sort((a, b) => {
      if (campo === 'numero_os' || campo === 'remanescente') {
        return ((Number(a[campo]) || 0) - (Number(b[campo]) || 0)) * dir;
      }
      return String(a[campo] || '').localeCompare(String(b[campo] || ''), 'pt-BR') * dir;
    });
  }

  const COLUNAS_ORDENAVEIS = [
    ['numero_os', 'OS'],
    ['cliente', 'Cliente'],
    ['embarque', 'Local'],
    ['remanescente', 'Remanescente'],
  ];

  function thSortHtml(campo, label) {
    const ativa = state.sortField === campo;
    const seta = ativa ? `<span class="pld-sort-arrow">${state.sortDir === 'desc' ? '▼' : '▲'}</span>` : '';
    return `<th class="pld-th-sort" data-sort-campo="${campo}">${esc(label)}${seta}</th>`;
  }

  function renderLista() {
    const filtradas = osFiltradas();

    // .pld-table-wrap (a rolagem da lista) é recriado do zero aqui — clicar
    // numa ação de uma O.S. abaixo da dobra (depois de rolar) chamava
    // refreshAposAcao → renderLista() e a rolagem voltava pro topo, feio
    // visualmente (reportado pela usuária, 2026-07-23). Guarda o scrollTop
    // do wrap antigo antes de substituir e restaura no novo.
    const scrollTopAnterior = listaBody.querySelector('.pld-table-wrap')?.scrollTop || 0;

    const linhas = filtradas.map((os) => {
      const emb = embarqueHtml(os.embarque);
      return `<tr class="pld-row ${String(os.id) === String(state.osAbertaId) ? 'active' : ''}" data-os-id="${esc(os.id)}">
        <td>
          <span class="pld-os-num"><span class="pld-dot ${statusToneClass(os)}"></span>${esc(os.numero_os || '-')}</span>
          ${os.contrato ? `<div class="pld-os-contrato">Contrato ${esc(os.contrato)}</div>` : ''}
        </td>
        <td class="pld-cliente">${esc(os.cliente || '-')}</td>
        <td><span class="pld-local-uf">${emb}</span></td>
        <td class="pld-rem">${fmtRem(os.remanescente)}</td>
        <td><span class="pld-chevron">›</span></td>
      </tr>`;
    }).join('');

    listaBody.innerHTML = `
      <div class="pld-count-row"><span><b>${filtradas.length}</b> O.S. encontradas</span></div>
      <div class="pld-table-wrap">
        <table class="pld-table">
          <thead><tr>${COLUNAS_ORDENAVEIS.map(([campo, label]) => thSortHtml(campo, label)).join('')}<th></th></tr></thead>
          <tbody>${linhas || '<tr><td colspan="5" class="pld-empty">Nenhuma O.S. encontrada com esses filtros.</td></tr>'}</tbody>
        </table>
      </div>
    `;

    if (scrollTopAnterior) {
      const novoWrap = listaBody.querySelector('.pld-table-wrap');
      if (novoWrap) novoWrap.scrollTop = scrollTopAnterior;
    }
  }

  async function carregarLista({ manterDrawer = false } = {}) {
    listaBody.innerHTML = '<div class="pld-loading"><span class="pld-spinner" aria-hidden="true"></span><span>Carregando O.S. da supervisão...</span></div>';
    try {
      const [osTodas] = await Promise.all([
        loadOsRelevantes(supervisaoQuery, options.dataReferencia),
        recarregarEquipeRows(),
      ]);
      osTodasAtual = osTodas;
      popularFiltros();
      renderLista();
      if (manterDrawer && state.osAbertaId) {
        const os = osTodasAtual.find((o) => String(o.id) === String(state.osAbertaId));
        if (os) await abrirDrawer(os, { silent: true }); else fecharDrawer();
      }
    } catch (error) {
      console.error('[programacao-lista-drawer] carregarLista:', error);
      listaBody.innerHTML = `<div class="pld-empty">${esc(error.message || 'Erro ao carregar as O.S.')}</div>`;
    }
  }

  // Refresh leve pós-ação (status/vínculo): NÃO refaz loadOsRelevantes (até 400
  // O.S., o que a usuária sentia como lentidão a cada clique) — a lista de O.S.
  // em si não muda com essas ações, só status_gestor (patcheado localmente) ou
  // a equipe. Só recarrega programacao_equipe quando pedido (add/remover) e
  // remonta o corpo do painel da O.S. aberta.
  async function refreshAposAcao(os, { equipe = false, equipeRow = null } = {}) {
    if (equipeRow) aplicarEquipeRowSalva(equipeRow);
    else if (equipe) await recarregarEquipeRows();
    renderLista();
    if (String(state.osAbertaId) === String(os.id)) await abrirDrawer(os, { silent: true });
    // A aba Sem O.S. é montada em paralelo e mantinha a fotografia anterior
    // da equipe. Depois de adicionar/remover alguém, atualize-a em segundo
    // plano para que um colaborador vinculado a uma O.S. desapareça antes
    // mesmo de o usuário trocar de aba.
    if (equipe && typeof window.__pgcSilentRefreshSemOs === 'function') {
      window.__pgcSilentRefreshSemOs().catch((error) => {
        console.warn('[programacao-lista-drawer] refresh Sem O.S.:', error);
      });
    }
  }

  // --- Drawer: candidato sugerido (O.S. ATENDER sem ninguém confirmado ainda) ---
  async function carregarCandidatoSugerido(os) {
    const [ponto, colaboradoresRegionalBruto, indisponiveis] = await Promise.all([
      loadPontos([os.ponto_embarque_id].filter(Boolean)).then((m) => m.get(os.ponto_embarque_id) || null),
      getRegional(),
      getIndisponiveis(),
    ]);
    const supervisoesAlvo = new Set((Array.isArray(supervisaoQuery) ? supervisaoQuery : [supervisaoQuery]).map((s) => normalizeText(s)).filter(Boolean));
    const colaboradoresRegional = colaboradoresRegionalBruto
      .filter((c) => !supervisoesAlvo.size || supervisoesAlvo.has(normalizeText(c.supervisao)))
      .filter((c) => !indisponiveis.match(c));
    const jaEscalados = new Set(equipeRowsAtual.filter((r) => r.confirmado).map((r) => r.colaborador_id));
    const excluir = new Set([...jaEscalados, ...indisponiveis.chavesRpc]);
    const osComPonto = [{ os, ponto, confirmadoRow: null, candidatosNecessarios: true }];
    const candidatosBrutos = await loadCandidatosPorOs(os.supervisao || supervisao, osComPonto, excluir);
    const listaBruta = (candidatosBrutos.get(os.id) || []).filter((c) => !indisponiveis.match(c));
    candidatosBrutos.set(os.id, listaBruta);
    const candidatosPorOs = aplicarSugestoesRegionais(candidatosBrutos, osComPonto, colaboradoresRegional, jaEscalados);
    return { candidatos: ordenarCandidatosPorEmbarque(candidatosPorOs.get(os.id) || []), colaboradoresRegional };
  }

  function candidatoSugeridoHtml(candidatos) {
    if (!candidatos.length) {
      return '<div class="pld-lock">Nenhum candidato disponível pra sugerir automaticamente. Use "Adicionar colaborador" pra escolher manualmente.</div>';
    }
    const comCusto = candidatos.filter((c) => c.custoTotal != null);
    const minCustoId = comCusto.length ? comCusto.reduce((a, b) => (a.custoTotal <= b.custoTotal ? a : b)).colaboradorId : null;
    return `<div class="pld-cand-wrap">
      ${candCardHtml(candidatos[0], false, minCustoId)}
      <span class="pld-cand-actions">
        <button type="button" class="pld-cand-confirm" data-confirmar-candidato="${esc(candidatos[0].colaboradorId)}" title="Confirmar ${esc(candidatos[0].nome)}">✓</button>
        <button type="button" class="pld-cand-reject" data-pld-reject-candidate="1" title="Recusar sugestão e escolher outro colaborador">✕</button>
      </span>
    </div>`;
  }

  // --- Drawer: colaboradores confirmados + despesas por colaborador ---
  async function carregarColaboradoresConfirmados(os, rows) {
    const colaboradorIds = rows.map((r) => r.colaborador_id);
    // getVeiculos() só precisa rodar (popula o cache do combo de placa em
    // programacao-despesas.js) — o resultado em si não é usado aqui.
    const [custos, placasPorCpf, tipoContratoPorCpf, extrasPorColab, dispPorColaborador] = await Promise.all([
      loadCustos(programacaoIdQuery),
      getPlacas(),
      getTipoContrato(),
      loadExtras(programacaoIdQuery, colaboradorIds),
      loadDisponibilidadeConfirmados(programacaoIdQuery, colaboradorIds),
      getVeiculos(),
    ]);
    await loadAlojamentos();
    const osResumoPorId = new Map([[String(os.id), { id: os.id, numero_os: os.numero_os, cliente: os.cliente, embarque: os.embarque }]]);
    return { custos, placasPorCpf, tipoContratoPorCpf, extrasPorColab, osResumoPorId, dispPorColaborador };
  }

  function colaboradorRowWrapHtml(row, custos, placasPorCpf, tipoContratoPorCpf, osResumoPorId, extrasPorColab, escaladoEmOutra) {
    const cpf = String(row.colaboradorId || '').replace(/\D/g, '');
    const tipoLabelTexto = tipoContratoPorCpf.get(cpf) || 'Não informado';
    const ehFrotaMotorista = normalizeText(custos.des.get(row.colaboradorId)?.tipo_deslocamento || '') === 'MOTORISTA FROTA';
    const cardHtml = colaboradorCardHtml(row, custos, placasPorCpf, tipoContratoPorCpf, osResumoPorId, extrasPorColab);
    return `<div class="pld-colab-card${escaladoEmOutra ? ' ja-outra-os' : ''}" data-colab-wrap="${esc(row.colaboradorId)}" data-equipe-row-id="${esc(row.equipeRowId || '')}">
      <div class="pld-colab-head">
        ${avatarBadgeHtml(row.nome, row.colaboradorId)}
        <span class="pld-colab-nome">${esc(row.nome)}</span>
        ${ehFrotaMotorista
          ? '<span class="pld-colab-tag t-info" title="Leva colaboradores até a O.S., não atende">🚚 Frota</span>'
          : `<span class="pld-colab-tag t-${tipoTone(tipoLabelTexto)}">${esc(tipoLabelTexto)}</span>`}
        ${escaladoEmOutra ? '<span class="pld-colab-outra-os-badge" title="Este colaborador também está confirmado em outra O.S. hoje">♻ Outra O.S.</span>' : ''}
        <button type="button" class="pld-colab-remover" data-remover-colab="${esc(row.equipeRowId || '')}" title="Remover da O.S.">✕</button>
      </div>
      ${cardHtml}
    </div>`;
  }

  async function montarProgramacaoBody(os) {
    const progBody = drawerEl.querySelector('#pldProgBody');
    const lockNote = drawerEl.querySelector('#pldProgLockNote');
    const st = statusNorm(os);
    if (st !== 'ATENDER') {
      lockNote.innerHTML = '🔒 Disponível após Atender a O.S.';
      progBody.innerHTML = `<div class="pld-lock">Marque <b>Atender</b> nas Ações acima pra liberar colaboradores, deslocamento, estadia, alimentação e extras dessa O.S.</div>`;
      return;
    }
    lockNote.textContent = '';
    progBody.innerHTML = '<div class="pld-loading"><span class="pld-spinner" aria-hidden="true"></span><span>Carregando equipe da O.S....</span></div>';
    try {
      const rows = equipeRowsDaOs(os.id);
      const escaladosPorColab = new Map();
      equipeRowsAtual.filter((r) => r.confirmado).forEach((r) => {
        if (String(r.os_id) !== String(os.id)) escaladosPorColab.set(String(r.colaborador_id), true);
      });

      if (!rows.length) {
        const { candidatos } = await carregarCandidatoSugerido(os);
        progBody.innerHTML = `
          ${candidatoSugeridoHtml(candidatos)}
          <div class="pld-add-box" data-add-box>
            <select data-add-colab-select><option value="">Escolha um colaborador…</option></select>
            <button type="button" data-add-colab-confirm>Adicionar</button>
          </div>
          <div class="pld-add-box" data-add-frota-box>
            <select data-add-frota-select data-searchable-select><option value="">Escolha um motorista de Frota…</option></select>
            <button type="button" data-add-frota-confirm>+ Adicionar Frota</button>
          </div>
        `;
        await popularAddBox(os, []);
        await popularAddFrotaBox(os, []);
        return;
      }

      const programacaoIdDaOs = rows[0]?.programacao_id || programacaoIdParaOs(os, programacaoId, programacaoIdMap);
      const { custos, placasPorCpf, tipoContratoPorCpf, extrasPorColab, osResumoPorId } = await carregarColaboradoresConfirmados(os, rows);
      const cardsHtml = rows.map((r) => colaboradorRowWrapHtml(
        { colaboradorId: r.colaborador_id, nome: r.nome_colaborador || r.colaborador_id, programacaoId: r.programacao_id || programacaoIdDaOs, osIds: new Set([os.id]), equipeRowId: r.id },
        custos, placasPorCpf, tipoContratoPorCpf, osResumoPorId, extrasPorColab,
        escaladosPorColab.has(String(r.colaborador_id)),
      )).join('');

      progBody.innerHTML = `
        ${cardsHtml}
        <div class="pld-add-box" data-add-box>
          <select data-add-colab-select><option value="">Escolha um colaborador…</option></select>
          <button type="button" data-add-colab-confirm>Adicionar</button>
        </div>
        <div class="pld-add-box" data-add-frota-box>
          <select data-add-frota-select data-searchable-select><option value="">Escolha um motorista de Frota…</option></select>
          <button type="button" data-add-frota-confirm>+ Adicionar Frota</button>
        </div>
      `;
      wireDespesasCards(progBody, {
        getDataReferencia: () => options.dataReferencia,
        getCustos: () => custos,
        isReadOnly: () => readOnly,
      });
      await popularAddBox(os, rows);
      await popularAddFrotaBox(os, rows);
    } catch (error) {
      console.error('[programacao-lista-drawer] montarProgramacaoBody:', error);
      progBody.innerHTML = `<div class="pld-empty">${esc(error.message || 'Erro ao carregar a equipe desta O.S.')}</div>`;
    }
  }

  async function popularAddBox(os, rowsAtuais) {
    const sel = progBodySelectAtual();
    if (!sel) return;
    const jaNaOs = new Set(rowsAtuais.map((r) => String(r.colaborador_id)));
    const regional = await getRegional();
    const escalados = new Set(equipeRowsAtual.filter((r) => r.confirmado).map((r) => String(r.colaborador_id)));
    const opcoes = regional.filter((c) => c.colaboradorId && !jaNaOs.has(String(c.colaboradorId)));
    sel.innerHTML = '<option value="">Escolha um colaborador…</option>' + opcoes.map((c) => {
      const id = String(c.colaboradorId);
      const jaEmOutra = escalados.has(id);
      // <option> aceita pouco CSS, mas color/background-color funcionam nos principais navegadores
      // (Chrome/Edge/Firefox) — dá pra destacar em verde quem já está confirmado em outra O.S. hoje.
      const estilo = jaEmOutra ? ' style="color:#16a34a;font-weight:700"' : '';
      return `<option value="${esc(id)}" data-nome="${esc(c.nome)}"${estilo}>${jaEmOutra ? '♻ ' : ''}${esc(c.nome)}</option>`;
    }).join('');
  }

  async function popularAddFrotaBox(os, rowsAtuais) {
    const sel = progBodyFrotaSelectAtual();
    if (!sel) return;
    const jaNaOs = new Set(rowsAtuais.map((r) => String(r.colaborador_id)));
    const motoristas = await loadFrotasMotoristas();
    const opcoes = motoristas.filter((m) => m.colaboradorId && !jaNaOs.has(String(m.colaboradorId)));
    sel.innerHTML = '<option value="">Escolha um motorista de Frota…</option>' + opcoes.map((m) =>
      `<option value="${esc(m.colaboradorId)}" data-nome="${esc(m.nome)}">${esc(m.nome)}</option>`
    ).join('');
  }

  function progBodyFrotaSelectAtual() {
    return drawerEl.querySelector('[data-add-frota-select]');
  }

  function progBodySelectAtual() {
    return drawerEl.querySelector('[data-add-colab-select]');
  }

  async function abrirDrawer(os, { silent = false } = {}) {
    state.osAbertaId = os.id;
    // Marca a linha da O.S. aberta na lista — sem isso a classe "active" só
    // era aplicada no <tr> na hora do renderLista() inicial (quando
    // osAbertaId ainda era null), nunca atualizada ao clicar numa linha
    // depois (reportado pela usuária, 2026-07-22: "faltou o destaque da OS
    // selecionada"). Troca a classe direto em vez de chamar renderLista()
    // de novo, que perderia a posição do scroll da lista.
    listaBody.querySelectorAll('.pld-row.active').forEach((tr) => tr.classList.remove('active'));
    listaBody.querySelector(`.pld-row[data-os-id="${CSS.escape(String(os.id))}"]`)?.classList.add('active');
    backdropEl.hidden = false;
    drawerEl.hidden = false;
    requestAnimationFrame(() => { backdropEl.classList.add('show'); drawerEl.classList.add('open'); });
    shellEl.classList.add('pld-drawer-open');
    const st = statusNorm(os);
    const badgeTone = st === 'FINALIZAR' ? 'tone-fim' : '';
    const badgeLabel = st === 'FINALIZAR' ? 'FINALIZADA' : 'EM ABERTO';
    drawerEl.innerHTML = `
      <div class="pld-drawer-head">
        <div class="pld-os-title">OS <b>${esc(os.numero_os || '-')}</b> <span class="pld-status-badge ${badgeTone}">${badgeLabel}</span></div>
        <button type="button" class="pld-drawer-close" id="pldDrawerClose" title="Fechar">×</button>
      </div>
      <div class="pld-drawer-sub">
        <div class="pld-sub-left">
          📍 ${esc(os.cliente || '-')}<br/>
          <span class="pld-sub-emb">${embarqueHtml(os.embarque)}</span>
        </div>
        <div class="pld-sub-rem"><span>Remanescente</span><strong>${fmtRem(os.remanescente)}</strong></div>
      </div>
      <div class="pld-section-label">AÇÕES</div>
      <div class="pld-acoes-row">
        <button type="button" class="pld-acao-btn ${st === 'AGUARDAR' ? 'on' : ''}" data-acao-status="AGUARDAR" ${readOnly ? 'disabled' : ''}><span class="pld-acao-ico">⏸</span>Pausar</button>
        <button type="button" class="pld-acao-btn ${st === 'ATENDER' ? 'on' : ''}" data-acao-status="ATENDER" ${readOnly ? 'disabled' : ''}><span class="pld-acao-ico">✓</span>Atender</button>
        <button type="button" class="pld-acao-btn ${st === 'FINALIZAR' ? 'on' : ''}" data-acao-status="FINALIZAR" ${readOnly ? 'disabled' : ''}><span class="pld-acao-ico">$</span>Finalizar</button>
        <button type="button" class="pld-acao-btn" data-abrir-kg ${readOnly ? 'disabled' : ''}><span class="pld-acao-ico">💰</span>Saldo</button>
        <button type="button" class="pld-acao-btn" data-abrir-laudo ${readOnly ? 'disabled' : ''}><span class="pld-acao-ico">📎</span>Conferir</button>
      </div>
      <div class="pld-section-label">PROGRAMAÇÃO <span id="pldProgLockNote"></span></div>
      <div id="pldProgBody"></div>
    `;
    drawerEl.scrollTop = 0;
    await montarProgramacaoBody(os);
  }

  function fecharDrawer() {
    state.osAbertaId = null;
    listaBody.querySelectorAll('.pld-row.active').forEach((tr) => tr.classList.remove('active'));
    shellEl.classList.remove('pld-drawer-open');
    backdropEl.classList.remove('show');
    drawerEl.classList.remove('open');
    // Espera a transição de saída (translateX) antes de esconder/limpar, senão
    // o painel some na hora em vez de deslizar pra fora.
    setTimeout(() => {
      if (state.osAbertaId) return; // reabriu nesse meio-tempo
      backdropEl.hidden = true;
      drawerEl.hidden = true;
      drawerEl.innerHTML = '';
    }, 200);
  }

  function abrirModalOv(html) {
    const ov = document.createElement('div');
    ov.className = 'pld-modal-ov';
    ov.innerHTML = html;
    document.body.appendChild(ov);
    ov.addEventListener('click', (e) => { if (e.target === ov) ov.remove(); });
    return ov;
  }

  // Alguns clientes exigem anexo/print pra autorizar o aumento de saldo (ver
  // logistica_clientes_anexo_regras, carregada por ensureRegrasAnexoSaldo() no
  // boot do drawer). Quando exige, o modal ganha uma área de anexo que aceita
  // tanto escolher um arquivo quanto colar (Ctrl+V) uma captura de tela — sem
  // pelo menos 1 anexo, o Confirmar mostra "Essa ação é obrigatória." e não
  // envia a solicitação.
  function abrirModalKg(os) {
    const regraAnexo = precisaAnexoSaldo(os);
    const anexoObrigatorio = regraAnexo.precisaAnexo === true;
    const ov = abrirModalOv(`<div class="pld-modal">
      <h3>Quanto somar na O.S.?</h3>
      <p>O.S. <b style="color:#bbf7d0">${esc(os.numero_os || '-')}</b> — vai para a Logística como saldo.</p>
      <input id="pldKgInput" type="number" min="1" placeholder="Inserir KG" inputmode="numeric" />
      ${anexoObrigatorio ? `
      <p>Cliente <b style="color:#bbf7d0">${esc(regraAnexo.cliente || os.cliente || '-')}</b> exige anexo pra liberar o saldo.</p>
      <label class="pld-anexo-area" id="pldKgAnexoArea" tabindex="0">
        <span>Cole aqui (Ctrl+V) uma captura de tela ou <span class="pld-anexo-pick">escolha um arquivo</span></span>
        <input id="pldKgAnexoFile" type="file" accept="image/*,.pdf" multiple hidden>
      </label>
      <div id="pldKgAnexoList" class="pld-anexo-list"></div>
      <p class="pld-anexo-erro" id="pldKgAnexoErro" hidden>Essa ação é obrigatória.</p>
      ` : ''}
      <div class="pld-modal-actions"><button type="button" class="pld-modal-btn" data-cancel>Cancelar</button><button type="button" class="pld-modal-btn primary" data-ok>Confirmar</button></div>
    </div>`);
    const input = ov.querySelector('#pldKgInput');
    input.focus();

    let anexos = [];
    if (anexoObrigatorio) {
      const fileInput = ov.querySelector('#pldKgAnexoFile');
      const lista = ov.querySelector('#pldKgAnexoList');
      const erro = ov.querySelector('#pldKgAnexoErro');
      const addAnexos = (novos) => {
        if (!novos.length) return;
        anexos.push(...novos);
        lista.innerHTML = anexos.map((f) => `<span class="pld-anexo-chip">📎 ${esc(f.name || 'captura.png')}</span>`).join('');
        erro.hidden = true;
      };
      fileInput.addEventListener('change', () => { addAnexos([...(fileInput.files || [])]); fileInput.value = ''; });
      ov.addEventListener('paste', (e) => {
        const itens = [...(e.clipboardData?.items || [])];
        const imagens = itens.filter((it) => it.kind === 'file' && it.type.startsWith('image/')).map((it) => it.getAsFile()).filter(Boolean);
        addAnexos(imagens);
      });
    }

    ov.querySelector('[data-cancel]').addEventListener('click', () => ov.remove());
    ov.querySelector('[data-ok]').addEventListener('click', async () => {
      const kg = Number(input.value);
      if (!kg || kg <= 0) { input.focus(); return; }
      if (anexoObrigatorio && !anexos.length) { ov.querySelector('#pldKgAnexoErro').hidden = false; return; }
      const okBtn = ov.querySelector('[data-ok]');
      okBtn.disabled = true; okBtn.textContent = '...';
      try {
        if (anexos.length) await anexarAnexoSaldo(os.id, anexos, { usuario: currentUser });
        await registrarSaldoKg(os.id, kg);
        ov.remove();
        await carregarLista({ manterDrawer: true });
      } catch (error) {
        okBtn.disabled = false; okBtn.textContent = 'Confirmar';
        alert(error.message || 'Não foi possível solicitar saldo.');
      }
    });
  }

  function abrirModalLaudo(os) {
    const ov = abrirModalOv(`<div class="pld-modal">
      <h3>Conferir · anexar laudo</h3>
      <p>O.S. <b style="color:#bbf7d0">${esc(os.numero_os || '-')}</b> — anexe o(s) arquivo(s).</p>
      <input id="pldLaudoFile" type="file" multiple />
      <div id="pldLaudoList" style="font-size:11px;color:#9fb7aa"></div>
      <div class="pld-modal-actions"><button type="button" class="pld-modal-btn" data-cancel>Cancelar</button><button type="button" class="pld-modal-btn primary" data-ok>Enviar</button></div>
    </div>`);
    const fileInput = ov.querySelector('#pldLaudoFile');
    const listInfo = ov.querySelector('#pldLaudoList');
    let files = [];
    fileInput.addEventListener('change', () => { files = [...(fileInput.files || [])]; listInfo.textContent = files.map((f) => f.name).join(', '); });
    ov.querySelector('[data-cancel]').addEventListener('click', () => ov.remove());
    ov.querySelector('[data-ok]').addEventListener('click', async () => {
      if (!files.length) { fileInput.focus(); return; }
      const okBtn = ov.querySelector('[data-ok]');
      okBtn.disabled = true; okBtn.textContent = 'Enviando...';
      try {
        await anexarLaudo(os.id, files);
        ov.remove();
        await carregarLista({ manterDrawer: true });
      } catch (error) {
        okBtn.disabled = false; okBtn.textContent = 'Enviar';
        alert(error.message || 'Não foi possível anexar o laudo.');
      }
    });
  }

  function abrirModalJustificativaAoAdicionar(os, nomesAtuais, novoNome) {
    return new Promise((resolve) => {
      const ov = abrirModalOv(`<div class="pld-modal">
        <h3>Justificar 2+ colaboradores</h3>
        <p>O.S. <b style="color:#bbf7d0">${esc(os.numero_os || '-')}</b> já tem <b>${esc(nomesAtuais || '-')}</b>. Adicionar <b style="color:#bbf7d0">${esc(novoNome || '-')}</b> também — informe o motivo:</p>
        <textarea id="pldJustifModalTxt" rows="3" placeholder="Ex.: volume da carga exige 2 pessoas no ponto"></textarea>
        <div class="pld-modal-actions"><button type="button" class="pld-modal-btn" data-cancel>Cancelar</button><button type="button" class="pld-modal-btn primary" data-ok>Confirmar</button></div>
      </div>`);
      const input = ov.querySelector('#pldJustifModalTxt');
      input.focus();
      ov.querySelector('[data-cancel]').addEventListener('click', () => { ov.remove(); resolve(null); });
      ov.querySelector('[data-ok]').addEventListener('click', () => {
        const motivo = input.value.trim();
        if (!motivo) { input.focus(); return; }
        ov.remove();
        resolve(motivo);
      });
    });
  }

  // --- Eventos: lista (filtros, ordenação, clique na linha) ---
  let buscaRemotaTimer = null;
  let buscaRemotaSeq = 0;
  content.querySelector('#pldBusca').addEventListener('input', (e) => {
    state.busca = e.target.value;
    renderLista();

    clearTimeout(buscaRemotaTimer);
    const numeroOs = String(e.target.value || '').trim();
    if (!/^\d{4,}$/.test(numeroOs) || osTodasAtual.some((os) => String(os.numero_os) === numeroOs)) return;

    const seq = ++buscaRemotaSeq;
    buscaRemotaTimer = setTimeout(async () => {
      try {
        const os = await loadOsRelevantePorNumero(supervisaoQuery, numeroOs);
        if (seq !== buscaRemotaSeq || String(state.busca || '').trim() !== numeroOs || !os) return;
        if (!osTodasAtual.some((row) => String(row.id) === String(os.id))) osTodasAtual.push(os);
        renderLista();
      } catch (error) {
        console.warn('[programacao-lista-drawer] busca remota de O.S.:', error);
      }
    }, 250);
  });
  content.querySelector('#pldCliente').addEventListener('change', (e) => { state.cliente = e.target.value; renderLista(); });
  content.querySelector('#pldCidade').addEventListener('change', (e) => { state.cidade = e.target.value; renderLista(); });
  content.querySelector('#pldLocal').addEventListener('change', (e) => { state.local = e.target.value; renderLista(); });
  content.querySelector('#pldSoRemanescente').addEventListener('change', (e) => { state.soRemanescente = e.target.checked; renderLista(); });

  listaBody.addEventListener('click', async (event) => {
    const th = event.target.closest('[data-sort-campo]');
    if (th) {
      const campo = th.dataset.sortCampo;
      state.sortDir = state.sortField === campo && state.sortDir === 'asc' ? 'desc' : 'asc';
      state.sortField = campo;
      renderLista();
      return;
    }
    const row = event.target.closest('.pld-row[data-os-id]');
    if (row) {
      const os = osTodasAtual.find((o) => String(o.id) === row.dataset.osId);
      if (os) await abrirDrawer(os);
    }
  });
  content.addEventListener('input', (e) => { if (e.target.id === 'pldBusca') { /* já tratado acima */ } });

  // --- Eventos: drawer (delegados no #pldShell, sobrevivem ao innerHTML do drawer) ---
  // Handlers no overlayRoot (não no shell) porque backdrop+drawer agora vivem
  // no <body>, fora de #pldShell — os cliques deles não borbulham pro shell.
  overlayRoot.addEventListener('click', async (event) => {
    const osAtual = () => osTodasAtual.find((o) => String(o.id) === String(state.osAbertaId));

    if (event.target.closest('#pldDrawerClose') || event.target === backdropEl) { fecharDrawer(); return; }

    const statusBtn = event.target.closest('[data-acao-status]');
    if (statusBtn) {
      const os = osAtual();
      if (!os || statusBtn.disabled) return;
      statusBtn.disabled = true;
      try {
        const novoStatus = statusBtn.dataset.acaoStatus;
        await atualizarStatusOsCore(os, novoStatus, currentUser?.id, options.dataReferencia);
        // Patcheia o objeto local em vez de refazer a lista inteira do banco.
        os.status_gestor = novoStatus;
        os.configurada_em = new Date().toISOString();
        if (novoStatus === 'ATENDER' && options.dataReferencia) os.data_os = options.dataReferencia;
        await refreshAposAcao(os);
      } catch (error) {
        alert(error.message || 'Não foi possível atualizar a O.S.');
      } finally {
        statusBtn.disabled = false;
      }
      return;
    }

    if (event.target.closest('[data-abrir-kg]')) { const os = osAtual(); if (os) abrirModalKg(os); return; }
    if (event.target.closest('[data-abrir-laudo]')) { const os = osAtual(); if (os) abrirModalLaudo(os); return; }

    const confirmarCandBtn = event.target.closest('[data-confirmar-candidato]');
    if (confirmarCandBtn) {
      const os = osAtual();
      if (!os) return;
      confirmarCandBtn.disabled = true;
      try {
        const { candidatos } = await carregarCandidatoSugerido(os);
        const cand = candidatos.find((c) => String(c.colaboradorId) === confirmarCandBtn.dataset.confirmarCandidato) || candidatos[0];
        if (cand) {
          const equipeRow = await confirmarCandidato(programacaoIdParaOs(os, programacaoId, programacaoIdMap), os, cand);
          await refreshAposAcao(os, { equipe: true, equipeRow });
        }
      } catch (error) {
        alert(error.message || 'Não foi possível confirmar o colaborador.');
      }
      return;
    }

    const addConfirmBtn = event.target.closest('[data-add-colab-confirm]');
    if (addConfirmBtn) {
      const os = osAtual();
      const sel = progBodySelectAtual();
      if (!os || !sel || !sel.value) return;
      const opt = sel.selectedOptions[0];
      const cand = { colaboradorId: sel.value, nome: opt?.dataset.nome || sel.value };
      const rowsAtuais = equipeRowsDaOs(os.id);
      if (rowsAtuais.length) {
        const nomesAtuais = rowsAtuais.map((r) => r.nome_colaborador).filter(Boolean).join(', ');
        const motivo = await abrirModalJustificativaAoAdicionar(os, nomesAtuais, cand.nome);
        if (!motivo) return;
        addConfirmBtn.disabled = true;
        try {
          const equipeRow = await adicionarColaboradorOs(programacaoIdParaOs(os, programacaoId, programacaoIdMap), os, cand);
          logActivity('action', 'justificativa_multiplos_colaboradores_os', 'programacao', {
            os_id: os.id, numero_os: os.numero_os,
            colaboradores: [...rowsAtuais.map((r) => r.colaborador_id), cand.colaboradorId],
            nomes: [...rowsAtuais.map((r) => r.nome_colaborador), cand.nome],
            motivo,
          });
          await refreshAposAcao(os, { equipe: true, equipeRow });
        } catch (error) {
          alert(error.message || 'Não foi possível adicionar o colaborador.');
        } finally {
          addConfirmBtn.disabled = false;
        }
      } else {
        addConfirmBtn.disabled = true;
        try {
          const equipeRow = await confirmarCandidato(programacaoIdParaOs(os, programacaoId, programacaoIdMap), os, cand);
          await refreshAposAcao(os, { equipe: true, equipeRow });
        } catch (error) {
          alert(error.message || 'Não foi possível adicionar o colaborador.');
        } finally {
          addConfirmBtn.disabled = false;
        }
      }
      return;
    }

    const addFrotaConfirmBtn = event.target.closest('[data-add-frota-confirm]');
    if (addFrotaConfirmBtn) {
      const os = osAtual();
      const sel = progBodyFrotaSelectAtual();
      if (!os || !sel || !sel.value) return;
      const opt = sel.selectedOptions[0];
      const motorista = { colaboradorId: sel.value, nome: opt?.dataset.nome || sel.value };
      addFrotaConfirmBtn.disabled = true;
      try {
        const equipeRow = await adicionarFrotaOs(programacaoIdParaOs(os, programacaoId, programacaoIdMap), os, motorista);
        await refreshAposAcao(os, { equipe: true, equipeRow });
      } catch (error) {
        alert(error.message || 'Não foi possível adicionar o motorista de Frota.');
      } finally {
        addFrotaConfirmBtn.disabled = false;
      }
      return;
    }

    const removerBtn = event.target.closest('[data-remover-colab]');
    if (removerBtn) {
      const os = osAtual();
      if (!os || !removerBtn.dataset.removerColab) return;
      if (!(await confirmar({ titulo: 'Remover colaborador', mensagem: 'Remover este colaborador da O.S.?' }))) return;
      try {
        await removerConfirmacao(programacaoIdParaOs(os, programacaoId, programacaoIdMap), removerBtn.dataset.removerColab);
        await refreshAposAcao(os, { equipe: true });
      } catch (error) {
        alert(error.message || 'Não foi possível remover o colaborador.');
      }
      return;
    }

  });

  await carregarLista();
}
