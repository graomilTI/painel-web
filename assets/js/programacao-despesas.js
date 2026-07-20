// Etapa 3 — Despesas: 1 card por colaborador confirmado (Estadia + Alimentação +
// Deslocamento + Extras juntos), substituindo de fato o stepper clássico B-E
// (Estadia/Alimentação/Deslocamento/Extras de assets/js/programacao.js), que
// ficou inacessível pela UI do gestor depois que programacao-gestor-ajustes.js
// passou a reescrever #progSteps só com os botões das 3 etapas novas.
// Grava exatamente nas mesmas tabelas/onConflict do stepper clássico.
import { supabase } from './supabaseClient.js';
import { getUserContext } from './auth.js';
import { loadEquipeExistente, loadCustos, loadCruzamentoPlacas, loadCruzamentoTipoContrato, tipoContratoLetra } from './programacao-equipe.js?v=20260720-supfix1';
import { sincronizarJantaHotelFinanceiro } from './programacao-janta-hotel.js?v=20260716-jantahotel1';

let currentUserIsMaster = false;
let masterPermissionReady = null;

function ensureMasterPermission() {
  if (!masterPermissionReady) {
    masterPermissionReady = getUserContext()
      .then((ctx) => {
        currentUserIsMaster = !!ctx?.user?.is_master;
        return currentUserIsMaster;
      })
      .catch((error) => {
        console.warn('[programacao-despesas] não foi possível validar permissão master:', error);
        currentUserIsMaster = false;
        return false;
      });
  }
  return masterPermissionReady;
}

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

function onlyPlate(value) { return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 7); }
// Acha o ancestral scrollável de verdade (senão o scroll da página/window) —
// mesmo helper de programacao-equipe.js, usado pra não resetar a rolagem no
// refresh silencioso (ver carregar({silent}) abaixo).
function scrollParentDe(el) {
  let p = el && el.parentElement;
  while (p) {
    const oy = getComputedStyle(p).overflowY;
    if ((oy === 'auto' || oy === 'scroll') && p.scrollHeight > p.clientHeight + 4) return p;
    p = p.parentElement;
  }
  return document.scrollingElement || document.documentElement;
}
function todayIso() { const n = new Date(); return new Date(n.getTime() - n.getTimezoneOffset() * 60000).toISOString().slice(0, 10); }
function addDaysIso(iso, days) { const d = new Date(`${iso || todayIso()}T00:00:00`); d.setDate(d.getDate() + Number(days || 0)); return d.toISOString().slice(0, 10); }
function brl(value) { return (Number(value) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

const TIPOS_ESTADIA = ['CASA', 'PERNOITE', 'ALOJAMENTO', 'HOTEL'];
const COM_ESTADIA = new Set(['PERNOITE', 'ALOJAMENTO', 'HOTEL']);
// Só as 5 opções que fazem sentido pro gestor escolher aqui (pedido do
// usuário, 2026-07-17) — Ônibus/Outro removidos.
const TIPOS_DESLOC = ['NÃO PRECISA', 'MOTORISTA FROTA', 'CARONA FROTA', 'UBER/TÁXI', 'REEMBOLSO KM'];
const TIPOS_EXTRA = ['ESTADIA', 'RECARGA', 'LAVAGEM', 'MANUTENÇÃO VEÍCULO', 'PEDÁGIO', 'ESTACIONAMENTO', 'MATERIAL', 'OUTRO'];
const REFEICOES = [['cafe', 'Café'], ['almoco', 'Almoço'], ['janta', 'Janta']];

function estadiaLabel(t) { return ({ CASA: 'Casa', PERNOITE: 'Pernoite', ALOJAMENTO: 'Alojamento', HOTEL: 'Hotel' })[normalizeText(t)] || t; }
function deslocLabel(t) { return ({ 'NAO PRECISA': 'Não precisa', 'MOTORISTA FROTA': 'Frota', 'CARONA FROTA': 'Carona', 'UBER TAXI': 'Uber/Táxi', 'REEMBOLSO KM': 'Reemb. km', ONIBUS: 'Ônibus', OUTRO: 'Outro' })[normalizeText(t)] || t; }
function normalizeUF(v) { return String(v || '').trim().toUpperCase().slice(0, 2); }
function ufFromEmbarque(emb) { const m = /^([A-Z]{2})\s*-/.exec(String(emb || '').trim()); return m ? m[1].toUpperCase() : ''; }
function cidadeFromEmbarque(emb) { const m = /^[A-Z]{2}\s*-\s*([^(]+)/.exec(String(emb || '').trim()); return m ? m[1].trim() : ''; }
function diasFromEstadia(est) {
  if (est?.checkin && est?.checkout) {
    const diff = Math.round((new Date(`${est.checkout}T00:00:00`) - new Date(`${est.checkin}T00:00:00`)) / 86400000);
    return diff > 0 ? diff : 1;
  }
  return 1;
}

let alojamentosCache = null;
async function loadAlojamentos() {
  if (alojamentosCache) return alojamentosCache;
  try {
    const { data, error } = await supabase
      .from('hospedagem_alojamentos')
      .select('id,nome,cidade,uf,status')
      .eq('status', 'ATIVO')
      .order('cidade', { ascending: true });
    if (error) throw error;
    alojamentosCache = data || [];
  } catch (error) {
    console.warn('[despesas] alojamentos indisponíveis', error);
    alojamentosCache = [];
  }
  return alojamentosCache;
}

function alojamentoOptions(selectedId, uf) {
  const lista0 = alojamentosCache || [];
  const ufn = normalizeUF(uf);
  const rows = ufn ? lista0.filter((a) => normalizeUF(a.uf) === ufn) : lista0;
  const lista = rows.length ? rows : lista0;
  return '<option value="">Sugerir alojamento…</option>' + lista.map((a) => `<option value="${esc(a.id)}" ${String(selectedId || '') === String(a.id) ? 'selected' : ''}>${esc(`${a.nome} · ${a.cidade || '-'}/${a.uf || ''}`)}</option>`).join('');
}

// Campo do meio da estadia, contextual ao tipo — mesma lógica que existia no
// card de O.S. antes de virar tela própria (ver commit d5bbc6d).
function estadiaDestinoHtml(tipo, est, embarque) {
  const t = normalizeText(tipo);
  if (t === 'ALOJAMENTO') {
    return `<select class="peqd-inp peqd-inp-sm" data-tab="estadia" data-fld="alojamento_id">${alojamentoOptions(est.alojamento_id, ufFromEmbarque(embarque))}</select>`;
  }
  if (t === 'HOTEL' || t === 'PERNOITE') {
    // Só a cidade vinculada à O.S. — sem sugerir hotel específico (pedido do
    // usuário, 2026-07-16: a sugestão de hotel confundia, queria só a cidade).
    const cid = est.cidade || cidadeFromEmbarque(embarque);
    return `<input class="peqd-inp peqd-inp-sm" data-tab="estadia" data-fld="cidade" value="${esc(cid)}" placeholder="Cidade" />`;
  }
  return '<span class="peqd-inp-na">—</span>';
}

function injectStylesDespesas() {
  if (document.getElementById('progDespesasStyles')) return;
  const style = document.createElement('style');
  style.id = 'progDespesasStyles';
  style.textContent = `
    .peqd-card-erro{border-color:rgba(239,68,68,.6)!important}
    .peqd-erro-aviso{background:rgba(239,68,68,.14);border:1px solid rgba(239,68,68,.4);color:#fecaca;border-radius:10px;padding:7px 10px;font-size:11.5px;font-weight:700;margin-bottom:9px}
    .peqd-empty{border:1px dashed rgba(148,163,184,.22);border-radius:14px;padding:22px;text-align:center;color:#94a3b8;line-height:1.4}
    .peqd-loading{display:flex;align-items:center;justify-content:center;gap:10px;text-align:left}
    .peqd-spinner{width:24px;height:24px;border-radius:999px;border:3px solid rgba(111,208,165,.18);border-top-color:#6fd0a5;flex:0 0 auto;animation:peqdSpin .75s linear infinite}
    @keyframes peqdSpin{to{transform:rotate(360deg)}}
    .peqd-list{display:flex;flex-direction:column;gap:10px}
    .peqd-card{border:1px solid rgba(52,211,153,.18);border-radius:14px;background:rgba(2,6,23,.32);padding:12px 14px}
    .peqd-head{display:flex;align-items:center;gap:9px;margin-bottom:10px}
    .peqd-av{width:30px;height:30px;border-radius:999px;background:rgba(63,168,120,.22);color:#bbf7d0;display:flex;align-items:center;justify-content:center;font-size:11.5px;font-weight:900;flex:0 0 auto}
    .peqd-nome{font-size:13.5px;font-weight:850;color:#f8fafc}
    .peqd-os-ref{font-size:10.5px;color:#8ba79a;margin-top:1px}
    .peqd-sec{margin-top:10px;padding-top:10px;border-top:1px solid rgba(111,208,165,.12)}
    .peqd-sec:first-of-type{margin-top:0;padding-top:0;border-top:0}
    .peqd-sec-label{font-size:10.5px;font-weight:850;letter-spacing:.06em;text-transform:uppercase;color:#6fd0a5;margin-bottom:7px;display:flex;align-items:center;gap:6px}
    .peqd-row{display:flex;flex-wrap:wrap;align-items:center;gap:7px}
    .peqd-inp{min-height:34px;border:1px solid rgba(111,208,165,.3);background:#06130e;color:#eef7f2;border-radius:8px;padding:5px 8px;font-size:12px;color-scheme:dark;box-sizing:border-box}
    .peqd-inp-sm{flex:1 1 130px;min-width:100px}
    .peqd-inp-na{color:#5f7a6d;font-size:12px;flex:1 1 130px}
    .peqd-tipo-est{flex:0 0 120px}
    .peqd-dias{flex:0 0 60px;width:60px!important;text-align:center}
    .peqd-tipo-desl{flex:0 0 140px}
    .peqd-placa{flex:0 0 100px;text-transform:uppercase;font-family:ui-monospace,monospace}
    .peqd-km{flex:0 0 90px}
    .peqd-valor{flex:0 0 100px}
    .peqd-obs{flex:1 1 160px;min-width:120px}
    .peqd-chips{display:flex;gap:6px;flex-wrap:wrap}
    .peqd-chip{border:1px solid rgba(111,208,165,.28);background:transparent;color:#8ba79a;border-radius:9px;padding:6px 11px;font-size:12px;font-weight:700;cursor:pointer}
    .peqd-chip.on{border-color:rgba(111,208,165,.5);background:rgba(63,168,120,.18);color:#bbf7d0}
    .peqd-extra-list{display:flex;flex-direction:column;gap:6px}
    .peqd-extra-item{display:flex;flex-wrap:wrap;gap:6px;align-items:center;border:1px solid rgba(56,189,248,.22);background:rgba(15,23,42,.6);border-radius:9px;padding:6px 7px}
    .peqd-extra-tipo{flex:0 0 150px}
    .peqd-extra-desc{flex:1 1 140px;min-width:110px}
    .peqd-extra-valor{flex:0 0 90px}
    .peqd-extra-obs{flex:1 1 140px;min-width:110px}
    .peqd-extra-rm{border:1px solid rgba(248,113,113,.35);background:rgba(127,29,29,.18);color:#fecaca;border-radius:8px;height:32px;width:32px;font-size:14px;font-weight:950;cursor:pointer;flex:0 0 auto}
    .peqd-extra-rm:hover{background:rgba(127,29,29,.32)}
    .peqd-extra-add{border:1px solid rgba(134,239,172,.35);background:rgba(22,163,74,.16);color:#dcfce7;border-radius:8px;padding:0 12px;height:32px;font-size:11.5px;font-weight:900;cursor:pointer}
    .peqd-extra-add:hover{background:rgba(22,163,74,.3)}
    @media(max-width:600px){.peqd-inp-sm,.peqd-tipo-est,.peqd-tipo-desl,.peqd-placa,.peqd-km,.peqd-valor,.peqd-obs{flex:1 1 100%}}
    .prog-readonly-banner{display:flex;align-items:center;gap:8px;margin:0 0 12px;padding:10px 14px;border:1px solid rgba(234,179,8,.32);background:rgba(234,179,8,.1);border-radius:12px;color:#fde68a;font-size:12.5px;font-weight:800}
    .prog-readonly-scope{pointer-events:none!important;opacity:.55;filter:saturate(.6)}
  `;
  document.head.appendChild(style);
}

// Data no passado = só leitura, mesmo critério de programacao-equipe.js
// (isDataPassada) — duplicado aqui porque os módulos não compartilham
// estado além do que passa por window.__peqb*.
function isDataPassada(dataReferencia) {
  return !currentUserIsMaster && !!dataReferencia && dataReferencia < todayIso();
}

// Roster do dia: só quem foi de fato confirmado (programacao_equipe.confirmado),
// deduplicado por colaborador_id — a mesma pessoa pode aparecer em mais de uma
// linha se foi escalada como adicional em 2+ O.S. no mesmo dia. programacao_id
// vem direto da própria linha (mais correto sob "Todas" do que recalcular pela
// supervisão selecionada no combo).
export async function loadRosterDoDia(programacaoIdQuery) {
  const equipeRows = await loadEquipeExistente(programacaoIdQuery);
  const porColab = new Map();
  equipeRows.filter((r) => r.confirmado).forEach((r) => {
    const id = String(r.colaborador_id);
    if (!porColab.has(id)) {
      porColab.set(id, { colaboradorId: id, nome: r.nome_colaborador || id, programacaoId: r.programacao_id, osIds: new Set() });
    }
    if (r.os_id) porColab.get(id).osIds.add(r.os_id);
  });
  return [...porColab.values()];
}

export async function loadOsResumo(osIds) {
  if (!osIds.length) return new Map();
  const { data, error } = await supabase.from('operacional_os').select('id,numero_os,cliente,embarque').in('id', osIds);
  if (error) throw error;
  return new Map((data || []).map((o) => [String(o.id), o]));
}

export async function loadExtras(programacaoIdQuery, colaboradorIds) {
  if (!colaboradorIds.length) return new Map();
  const ids = Array.isArray(programacaoIdQuery) ? programacaoIdQuery : [programacaoIdQuery];
  const { data, error } = await supabase
    .from('programacao_extras')
    .select('*')
    .in('programacao_id', ids)
    .in('colaborador_id', colaboradorIds)
    .order('created_at', { ascending: true });
  if (error) throw error;
  const map = new Map();
  (data || []).forEach((r) => {
    const key = String(r.colaborador_id);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(r);
  });
  return map;
}

function extraItemHtml(r) {
  return `<div class="peqd-extra-item" data-extra-id="${esc(r.id)}">
    <select class="peqd-inp peqd-extra-tipo" data-extra-fld="tipo_despesa">${TIPOS_EXTRA.map((t) => `<option value="${esc(t)}" ${String(r.tipo_despesa || 'OUTRO').toUpperCase() === t ? 'selected' : ''}>${esc(t.charAt(0) + t.slice(1).toLowerCase())}</option>`).join('')}</select>
    <input class="peqd-inp peqd-extra-desc" data-extra-fld="descricao" value="${esc(r.descricao || '')}" placeholder="Descrição" />
    <input class="peqd-inp peqd-extra-valor" data-extra-fld="valor" type="text" value="${esc(r.valor ?? '')}" placeholder="R$ 0,00" />
    <input class="peqd-inp peqd-extra-obs" data-extra-fld="observacao" value="${esc(r.observacao || '')}" placeholder="Observação" />
    <button type="button" class="peqd-extra-rm" data-extra-remove="${esc(r.id)}" title="Excluir despesa">×</button>
  </div>`;
}

function colaboradorCardHtml(row, custos, placasPorCpf, tipoContratoPorCpf, osResumoPorId, extrasPorColab) {
  const est = custos.est.get(row.colaboradorId) || {};
  const ali = custos.ali.get(row.colaboradorId) || { almoco: true };
  const des = custos.des.get(row.colaboradorId) || {};
  const osList = [...row.osIds].map((id) => osResumoPorId.get(String(id))).filter(Boolean);
  const embarqueRef = osList[0]?.embarque || '';
  const osRefLabel = osList.length ? `Atendendo O.S. ${osList.map((o) => o.numero_os || '-').join(', ')}` : 'Sem O.S. vinculada';

  const tipoEst = normalizeText(est.tipo_estadia || 'CASA');
  const dias = diasFromEstadia(est);
  const placaAuto = placasPorCpf.get(String(row.colaboradorId).replace(/\D/g, '')) || '';
  const placa = des.placa_veiculo || placaAuto || '';
  const tipoDesl = des.tipo_deslocamento || (placa ? 'MOTORISTA FROTA' : 'NÃO PRECISA');
  const extras = extrasPorColab.get(row.colaboradorId) || [];
  const letraContrato = tipoContratoLetra(tipoContratoPorCpf.get(String(row.colaboradorId).replace(/\D/g, '')) || '');

  return `<article class="peqd-card" data-colab-id="${esc(row.colaboradorId)}" data-programacao-id="${esc(row.programacaoId)}" data-nome="${esc(row.nome)}" data-embarque="${esc(embarqueRef)}">
    <div class="peqd-head">
      <span class="peqd-av" title="Tipo de contrato">${esc(letraContrato)}</span>
      <div>
        <div class="peqd-nome">${esc(row.nome)}</div>
        <div class="peqd-os-ref">${esc(osRefLabel)}</div>
      </div>
    </div>

    <div class="peqd-sec" data-sec="estadia">
      <div class="peqd-sec-label">🛏 Estadia</div>
      <div class="peqd-row">
        <select class="peqd-inp peqd-tipo-est" data-tab="estadia" data-fld="tipo_estadia">${TIPOS_ESTADIA.map((t) => `<option value="${t}" ${tipoEst === t ? 'selected' : ''}>${estadiaLabel(t)}</option>`).join('')}</select>
        <span data-estadia-destino>${estadiaDestinoHtml(tipoEst, est, embarqueRef)}</span>
        <input class="peqd-inp peqd-dias" data-tab="estadia" data-fld="dias" type="number" min="1" value="${dias}" title="diárias" />
        <input class="peqd-inp peqd-obs" data-tab="estadia" data-fld="observacao" value="${esc(est.observacao || '')}" placeholder="Observação" />
      </div>
    </div>

    <div class="peqd-sec" data-sec="alimentacao">
      <div class="peqd-sec-label">🍽 Alimentação</div>
      <div class="peqd-chips">${REFEICOES.map(([k, l]) => `<button type="button" class="peqd-chip ${ali[k] ? 'on' : ''}" data-tab="alimentacao" data-ref="${k}">${l}</button>`).join('')}</div>
    </div>

    <div class="peqd-sec" data-sec="deslocamento">
      <div class="peqd-sec-label">🚐 Deslocamento</div>
      <div class="peqd-row">
        <select class="peqd-inp peqd-tipo-desl" data-tab="deslocamento" data-fld="tipo_deslocamento">${TIPOS_DESLOC.map((t) => `<option value="${esc(t)}" ${normalizeText(tipoDesl) === normalizeText(t) ? 'selected' : ''}>${esc(deslocLabel(t))}</option>`).join('')}</select>
        <input class="peqd-inp peqd-placa" data-tab="deslocamento" data-fld="placa_veiculo" value="${esc(onlyPlate(placa))}" placeholder="Placa" title="${placaAuto && !des.placa_veiculo ? 'Puxada da leitura do veículo' : 'Placa do veículo'}" />
        <input class="peqd-inp peqd-km" data-tab="deslocamento" data-fld="km" type="number" min="0" step="0.01" value="${esc(des.km ?? '')}" placeholder="KM" />
        <input class="peqd-inp peqd-valor" data-tab="deslocamento" data-fld="valor" type="text" value="${esc(des.valor || '')}" placeholder="R$ 0,00" />
        <input class="peqd-inp peqd-obs" data-tab="deslocamento" data-fld="observacao" value="${esc(des.observacao || '')}" placeholder="Observação" />
      </div>
    </div>

    <div class="peqd-sec" data-sec="extras">
      <div class="peqd-sec-label">💰 Extras</div>
      <div class="peqd-extra-list" data-extra-list>${extras.map(extraItemHtml).join('')}</div>
      <button type="button" class="peqd-extra-add" data-add-extra style="margin-top:7px">+ Adicionar despesa</button>
    </div>
  </article>`;
}

export async function renderProgramacaoDespesas(content, options = {}) {
  injectStylesDespesas();
  await ensureMasterPermission();
  const supervisao = String(options.supervisao || '').trim();
  const programacaoId = options.programacaoId || null;
  const programacaoIdMap = options.programacaoIdMap instanceof Map ? options.programacaoIdMap : new Map();
  const supervisaoQuery = programacaoIdMap.size ? [...programacaoIdMap.keys()] : supervisao;
  const programacaoIdQuery = programacaoIdMap.size ? [...programacaoIdMap.values()] : programacaoId;
  const readOnly = isDataPassada(options.dataReferencia);

  content.innerHTML = `
    <div class="prog-section-title">
      <h4>Despesas — Estadia · Alimentação · Deslocamento · Extras</h4>
      <span class="badge">Etapa 3</span>
    </div>
    ${readOnly ? '<div class="prog-readonly-banner">🔒 Data retroativa — somente leitura. Só é possível editar a programação de hoje em diante.</div>' : ''}
    <div class="peqd-list ${readOnly ? 'prog-readonly-scope' : ''}" id="peqdRoster"><div class="peqd-empty peqd-loading"><span class="peqd-spinner" aria-hidden="true"></span><span>Carregando equipe do dia...</span></div></div>
  `;

  const rootEl = content.querySelector('#peqdRoster');
  if (!supervisao || (!programacaoId && !programacaoIdMap.size)) {
    rootEl.innerHTML = '<div class="peqd-empty">Carregue o contexto (supervisão e data) para lançar despesas.</div>';
    return;
  }

  let roster = [];
  let custos = { est: new Map(), ali: new Map(), des: new Map() };
  let placasPorCpf = new Map();
  let tipoContratoPorCpf = new Map();
  let osResumoPorId = new Map();
  let extrasPorColab = new Map();

  async function carregar({ silent = false } = {}) {
    const scroller = silent ? scrollParentDe(rootEl) : null;
    const scrollPos = scroller ? scroller.scrollTop : 0;
    if (!silent) rootEl.innerHTML = '<div class="peqd-empty peqd-loading"><span class="peqd-spinner" aria-hidden="true"></span><span>Carregando equipe do dia...</span></div>';
    roster = await loadRosterDoDia(programacaoIdQuery);
    if (!roster.length) {
      rootEl.innerHTML = '<div class="peqd-empty">Nenhum colaborador confirmado ainda. Volte à Etapa 2 (Equipe + Mapa) e confirme quem vai atender antes de lançar despesas.</div>';
      return;
    }
    const osIds = [...new Set(roster.flatMap((r) => [...r.osIds]))];
    const colaboradorIds = roster.map((r) => r.colaboradorId);
    [custos, placasPorCpf, tipoContratoPorCpf, osResumoPorId, extrasPorColab] = await Promise.all([
      loadCustos(programacaoIdQuery),
      loadCruzamentoPlacas(supervisaoQuery),
      loadCruzamentoTipoContrato(supervisaoQuery),
      loadOsResumo(osIds),
      loadExtras(programacaoIdQuery, colaboradorIds),
    ]);
    await loadAlojamentos();
    rootEl.innerHTML = roster.map((row) => colaboradorCardHtml(row, custos, placasPorCpf, tipoContratoPorCpf, osResumoPorId, extrasPorColab)).join('');
    if (silent && scroller) scroller.scrollTop = scrollPos;
  }

  // Ponte pra refresh sem remontar a aba inteira (perdia a rolagem toda vez
  // que um vínculo era feito em outro lugar — drag no mapa, sugestão de
  // equipe, etc. — ver window.__pgcRefreshDespesas em
  // programacao-gestor-fluxo-avancado.js, que agora prefere este caminho).
  window.__pgcSilentRefreshDespesas = () => carregar({ silent: true });

  // Autosave falhava em silêncio (só console.error) — o campo continuava
  // mostrando a escolha do gestor na tela mesmo quando o upsert não ia pro
  // banco, dando a impressão de "salvo" quando não estava (relatado
  // 2026-07-17: Reembolso km selecionado na Etapa 3 não aparecia no PDF
  // porque nunca tinha sido gravado). Marca o card visualmente até salvar de novo com sucesso.
  function avisarFalhaSalvar(card, tabela, error) {
    card.classList.add('peqd-card-erro');
    let aviso = card.querySelector('.peqd-erro-aviso');
    if (!aviso) {
      aviso = document.createElement('div');
      aviso.className = 'peqd-erro-aviso';
      card.prepend(aviso);
    }
    aviso.textContent = `⚠ Não foi possível salvar (${tabela.replace('programacao_', '')}): ${error?.message || 'erro desconhecido'} — tente de novo.`;
  }
  function limparAvisoFalhaSalvar(card) {
    card.classList.remove('peqd-card-erro');
    card.querySelector('.peqd-erro-aviso')?.remove();
  }

  // --- Autosave (mesmo padrão de debounce 450ms do resto do projeto) ---
  async function saveCampo(card, tabela) {
    const colabId = card.dataset.colabId;
    const payload = {
      programacao_id: card.dataset.programacaoId,
      data_referencia: options.dataReferencia || null,
      colaborador_id: colabId,
      nome_colaborador: card.dataset.nome,
    };
    if (tabela === 'programacao_estadia') {
      const tipo = normalizeText(card.querySelector('[data-fld="tipo_estadia"]')?.value || 'CASA') || 'CASA';
      const diasVal = Math.max(1, Number(card.querySelector('[data-fld="dias"]')?.value || 1));
      const checkin = options.dataReferencia || todayIso();
      const cidadeInput = card.querySelector('[data-fld="cidade"]')?.value || '';
      let cidade = cidadeInput || (card.dataset.embarque ? cidadeFromEmbarque(card.dataset.embarque) : null);
      let alojamento_id = null; let alojamento_nome = null;
      const alojSel = card.querySelector('[data-fld="alojamento_id"]');
      if (alojSel && alojSel.value) {
        alojamento_id = alojSel.value;
        const a = (alojamentosCache || []).find((x) => String(x.id) === String(alojSel.value));
        alojamento_nome = a?.nome || null;
        if (a && !cidade) cidade = a.cidade || null;
      }
      Object.assign(payload, {
        tipo_estadia: tipo, tem_estadia: COM_ESTADIA.has(tipo), cidade, alojamento_id, alojamento_nome,
        checkin, checkout: addDaysIso(checkin, diasVal),
        observacao: card.querySelector('[data-tab="estadia"][data-fld="observacao"]')?.value || null,
      });
    } else if (tabela === 'programacao_deslocamento') {
      Object.assign(payload, {
        tipo_deslocamento: card.querySelector('[data-fld="tipo_deslocamento"]')?.value || 'NÃO PRECISA',
        placa_veiculo: onlyPlate(card.querySelector('[data-fld="placa_veiculo"]')?.value || ''),
        // km/valor são NOT NULL (default 0) no banco — enviar null explícito
        // ignora o default e viola a constraint (ex.: Uber/Táxi sem km digitado).
        // valor é campo de texto (formato BR): mesma parse dos extras (linha ~490).
        km: Number(card.querySelector('[data-fld="km"]')?.value || 0) || 0,
        valor: Number(String(card.querySelector('[data-tab="deslocamento"][data-fld="valor"]')?.value || '0').replace(',', '.')) || 0,
        observacao: card.querySelector('[data-tab="deslocamento"][data-fld="observacao"]')?.value || null,
      });
    } else if (tabela === 'programacao_alimentacao') {
      REFEICOES.forEach(([k]) => { payload[k] = !!card.querySelector(`[data-ref="${k}"]`)?.classList.contains('on'); });
    }
    const { error } = await supabase.from(tabela).upsert(payload, { onConflict: 'programacao_id,colaborador_id' });
    if (error) {
      console.error('[despesas]', tabela, error);
      avisarFalhaSalvar(card, tabela, error);
    } else {
      limparAvisoFalhaSalvar(card);
    }
    if (!error && tabela === 'programacao_estadia') {
      // Colaborador em hotel/alojamento/pernoite entra automaticamente na
      // janta (pedido do usuário, 2026-07-16): acende o chip da Etapa 3 (se
      // ainda não estiver aceso) e grava em Financeiro > Refeições.
      const jantaChip = card.querySelector('[data-ref="janta"]');
      if (payload.tem_estadia && jantaChip && !jantaChip.classList.contains('on')) {
        jantaChip.classList.add('on');
        const { error: aliErr } = await supabase.from('programacao_alimentacao').upsert({
          programacao_id: payload.programacao_id,
          data_referencia: payload.data_referencia,
          colaborador_id: colabId,
          nome_colaborador: card.dataset.nome,
          cafe: !!card.querySelector('[data-ref="cafe"]')?.classList.contains('on'),
          almoco: !!card.querySelector('[data-ref="almoco"]')?.classList.contains('on'),
          janta: true,
        }, { onConflict: 'programacao_id,colaborador_id' });
        if (aliErr) console.error('[despesas] auto-janta (chip)', aliErr);
      }
      // Não bloqueia o autosave da estadia — roda em paralelo.
      sincronizarJantaHotelFinanceiro({
        programacaoId: payload.programacao_id,
        colaboradorId: colabId,
        nome: card.dataset.nome,
        comEstadia: payload.tem_estadia,
        checkin: payload.checkin,
        checkout: payload.checkout,
      });
    }
  }

  const timers = new Map();
  function scheduleSaveCampo(card, tabela) {
    const key = `${tabela}:${card.dataset.colabId}`;
    clearTimeout(timers.get(key));
    timers.set(key, setTimeout(() => saveCampo(card, tabela), 450));
  }

  async function addExtraLocal(card) {
    const colabId = card.dataset.colabId;
    const { data, error } = await supabase.from('programacao_extras').insert({
      programacao_id: card.dataset.programacaoId,
      data_referencia: options.dataReferencia || null,
      colaborador_id: colabId,
      nome_colaborador: card.dataset.nome,
      tipo_despesa: 'OUTRO',
      descricao: '',
      valor: 0,
      observacao: '',
    }).select('*').single();
    if (error) { alert(error.message || 'Não foi possível adicionar a despesa.'); return; }
    const list = card.querySelector('[data-extra-list]');
    list.insertAdjacentHTML('beforeend', extraItemHtml(data));
  }

  const extraTimers = new Map();
  async function saveExtraItem(itemEl) {
    const extraId = itemEl.dataset.extraId;
    if (!extraId) return;
    const payload = {
      tipo_despesa: itemEl.querySelector('[data-extra-fld="tipo_despesa"]')?.value || 'OUTRO',
      descricao: itemEl.querySelector('[data-extra-fld="descricao"]')?.value || '',
      valor: Number(String(itemEl.querySelector('[data-extra-fld="valor"]')?.value || '0').replace(',', '.')) || 0,
      observacao: itemEl.querySelector('[data-extra-fld="observacao"]')?.value || '',
    };
    const { error } = await supabase.from('programacao_extras').update(payload).eq('id', extraId);
    if (error) console.error('[despesas] extra', error);
  }
  function scheduleSaveExtraItem(itemEl) {
    const key = itemEl.dataset.extraId;
    clearTimeout(extraTimers.get(key));
    extraTimers.set(key, setTimeout(() => saveExtraItem(itemEl), 450));
  }

  async function removeExtra(extraId, itemEl) {
    const { error } = await supabase.from('programacao_extras').delete().eq('id', extraId);
    if (error) { alert(error.message || 'Não foi possível excluir a despesa.'); return; }
    itemEl.remove();
  }

  rootEl.addEventListener('input', (event) => {
    if (readOnly) return;
    const inp = event.target;
    if (inp.matches('[data-extra-fld]')) {
      const itemEl = inp.closest('[data-extra-id]');
      if (itemEl) scheduleSaveExtraItem(itemEl);
      return;
    }
    if (!inp.matches('input[data-fld][data-tab]')) return;
    if (inp.dataset.fld === 'placa_veiculo') inp.value = inp.value.toUpperCase();
    const card = inp.closest('.peqd-card');
    if (card) scheduleSaveCampo(card, `programacao_${inp.dataset.tab}`);
  });

  rootEl.addEventListener('change', (event) => {
    if (readOnly) return;
    const sel = event.target;
    if (sel.matches('[data-extra-fld]')) {
      const itemEl = sel.closest('[data-extra-id]');
      if (itemEl) scheduleSaveExtraItem(itemEl);
      return;
    }
    if (!sel.matches('select[data-fld][data-tab]')) return;
    const card = sel.closest('.peqd-card');
    if (sel.dataset.fld === 'tipo_estadia' && card) {
      const destino = card.querySelector('[data-estadia-destino]');
      const est = custos.est.get(card.dataset.colabId) || {};
      if (destino) destino.innerHTML = estadiaDestinoHtml(sel.value, est, card.dataset.embarque);
    }
    if (card) scheduleSaveCampo(card, `programacao_${sel.dataset.tab}`);
  });

  rootEl.addEventListener('click', async (event) => {
    if (readOnly) return;
    const chip = event.target.closest('.peqd-chip[data-ref]');
    if (chip) {
      chip.classList.toggle('on');
      const card = chip.closest('.peqd-card');
      if (card) scheduleSaveCampo(card, 'programacao_alimentacao');
      return;
    }
    const addBtn = event.target.closest('[data-add-extra]');
    if (addBtn) {
      const card = addBtn.closest('.peqd-card');
      if (card) await addExtraLocal(card);
      return;
    }
    const rmBtn = event.target.closest('[data-extra-remove]');
    if (rmBtn) {
      const itemEl = rmBtn.closest('[data-extra-id]');
      if (itemEl) await removeExtra(rmBtn.dataset.extraRemove, itemEl);
    }
  });

  await carregar();
}
