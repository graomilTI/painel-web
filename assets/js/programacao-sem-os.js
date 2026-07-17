// Etapa 4 — "Sem O.S.": colaboradores da regional que hoje NÃO estão
// confirmados em nenhuma O.S. (programacao_equipe.confirmado). Pra cada um,
// só situação (Atestado/Falta/Férias/Folga) + observação — grava em
// programacao_colaboradores (mesma tabela/colunas já usadas pela
// Disponibilidade clássica de programacao.js, hoje inacessível pela UI nova).
import { supabase } from './supabaseClient.js';
import { getCurrentUser } from './auth.js';
import { loadEquipeExistente, loadColaboradoresRegional, loadCruzamentoTipoContrato, tipoContratoLetra } from './programacao-equipe.js?v=20260717-declutter1';

const SITUACOES = [['ATESTADO', 'Atestado'], ['FALTA', 'Falta'], ['FERIAS', 'Férias'], ['FOLGA', 'Folga']];

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

function todayIso() {
  const n = new Date();
  return new Date(n.getTime() - n.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

// Mesma regra das outras 3 etapas (ver isDataPassada em programacao-equipe.js).
function isDataPassada(dataReferencia) {
  return !!dataReferencia && String(dataReferencia) < todayIso();
}

function readonlyBannerHtml() {
  return '<div class="prog-readonly-banner">🔒 Data retroativa — somente leitura. Só é possível editar a programação de hoje em diante.</div>';
}

function scrollParentDe(el) {
  let p = el && el.parentElement;
  while (p) {
    const oy = getComputedStyle(p).overflowY;
    if ((oy === 'auto' || oy === 'scroll') && p.scrollHeight > p.clientHeight + 4) return p;
    p = p.parentElement;
  }
  return document.scrollingElement || document.documentElement;
}

function injectStyles() {
  if (document.getElementById('progSemOsStyles')) return;
  const style = document.createElement('style');
  style.id = 'progSemOsStyles';
  style.textContent = `
    .pso-kpis{display:grid;grid-template-columns:repeat(2,minmax(140px,1fr));gap:10px;margin-bottom:12px}
    .pso-kpi{border:1px solid rgba(34,197,94,.18);background:rgba(2,6,23,.32);border-radius:12px;padding:10px}
    .pso-kpi span{display:block;color:#93c5fd;font-size:9.5px;font-weight:950;letter-spacing:.08em;text-transform:uppercase}
    .pso-kpi strong{display:block;margin-top:2px;font-size:18px;color:#f8fafc}
    .pso-list{display:flex;flex-direction:column;gap:8px}
    .pso-empty{border:1px dashed rgba(148,163,184,.22);border-radius:14px;padding:22px;text-align:center;color:#94a3b8;line-height:1.4}
    .pso-loading{display:flex;align-items:center;justify-content:center;gap:10px;text-align:left}
    .pso-spinner{width:24px;height:24px;border-radius:999px;border:3px solid rgba(111,208,165,.18);border-top-color:#6fd0a5;flex:0 0 auto;animation:psoSpin .75s linear infinite}
    @keyframes psoSpin{to{transform:rotate(360deg)}}
    .pso-card{display:grid;grid-template-columns:minmax(180px,1.2fr) auto minmax(220px,1.4fr);gap:12px;align-items:center;border:1px solid rgba(52,211,153,.16);background:rgba(2,6,23,.28);border-radius:14px;padding:11px 14px}
    .pso-name{display:flex;align-items:center;gap:10px;min-width:0}
    .pso-av{width:32px;height:32px;border-radius:999px;flex:0 0 auto;display:flex;align-items:center;justify-content:center;font-weight:950;font-size:12px;background:rgba(59,130,246,.18);color:#bfdbfe;border:1px solid rgba(59,130,246,.35)}
    .pso-name-txt{min-width:0}
    .pso-nome{font-weight:900;color:#f8fafc;line-height:1.15;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .pso-meta{font-size:11px;color:#9fb7aa;margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .pso-situacoes{display:flex;gap:6px;flex-wrap:wrap}
    .pso-sit-btn{border:1px solid rgba(111,208,165,.28);background:transparent;color:#8ba79a;border-radius:9px;padding:7px 12px;font-size:12px;font-weight:800;cursor:pointer;white-space:nowrap}
    .pso-sit-btn.on{border-color:rgba(111,208,165,.5);background:rgba(63,168,120,.18);color:#bbf7d0}
    .pso-obs{min-height:38px;padding:8px 11px;border-radius:11px;border:1px solid rgba(52,211,153,.18);background:#0d0d18;color:#e2e2f0;font-size:13px;width:100%;box-sizing:border-box}
    @media(max-width:820px){.pso-card{grid-template-columns:1fr}}
    .pso-inativar-btn{border:1px solid rgba(248,113,113,.4);background:rgba(127,29,29,.18);color:#fca5a5;border-radius:9px;padding:6px 10px;font-size:11px;font-weight:800;cursor:pointer;white-space:nowrap;flex:0 0 auto}
    .pso-inativar-btn[disabled]{opacity:.6;cursor:default}
    .pso-inativar-btn.pendente{border-color:rgba(251,191,36,.4);background:rgba(120,53,15,.22);color:#fde68a}
    .pso-modal{position:fixed;inset:0;background:rgba(2,6,23,.75);z-index:9999;display:none;align-items:center;justify-content:center;padding:20px}
    .pso-modal.open{display:flex}
    .pso-modal-card{width:min(480px,100%);background:#15152a;border:1px solid rgba(255,255,255,.08);border-radius:18px;padding:22px;color:#e2e2f0}
    .pso-modal-card h3{margin:0 0 4px}
    .pso-modal-card textarea{width:100%;box-sizing:border-box;border:1px solid rgba(148,163,184,.28);background:#0d0d18;color:#e2e2f0;border-radius:12px;padding:10px 12px;font-size:13px;margin-top:12px;resize:vertical}
    .pso-modal-actions{display:flex;gap:10px;margin-top:14px;flex-wrap:wrap}
    .pso-modal-fb{display:block;margin-top:8px;font-weight:700;font-size:12.5px}
    .pso-modal-fb.err{color:#fca5a5}
  `;
  document.head.appendChild(style);
}

function cardHtml(colab, row, readOnly, pendente, tipoContratoCru) {
  const situacaoAtual = normalizeText(row?.disponibilidade || '');
  const dis = readOnly ? 'disabled' : '';
  const inativarDis = readOnly || pendente ? 'disabled' : '';
  const inativarLabel = pendente ? 'Inativação solicitada' : 'Inativar';
  return `<article class="pso-card" data-colab-id="${esc(colab.colaboradorId)}">
    <div class="pso-name">
      <span class="pso-av" title="Tipo de contrato">${esc(tipoContratoLetra(tipoContratoCru || colab.tipoLabel))}</span>
      <div class="pso-name-txt">
        <div class="pso-nome">${esc(colab.nome)}</div>
        <div class="pso-meta">${esc(colab.cargo || 'Colaborador')} · ${esc(colab.coordenacao || colab.supervisao || '-')}</div>
      </div>
    </div>
    <div class="pso-situacoes">
      <button type="button" class="pso-inativar-btn ${pendente ? 'pendente' : ''}" data-inativar ${inativarDis}>${esc(inativarLabel)}</button>
      ${SITUACOES.map(([valor, label]) => `<button type="button" class="pso-sit-btn ${situacaoAtual === valor ? 'on' : ''}" data-situacao="${esc(valor)}" ${dis}>${esc(label)}</button>`).join('')}
    </div>
    <input class="pso-obs" type="text" data-obs value="${esc(row?.observacao || '')}" placeholder="Observação" ${dis} />
  </article>`;
}

export async function renderProgramacaoSemOs(content, options = {}) {
  injectStyles();
  const supervisao = String(options.supervisao || '').trim();
  const programacaoIdMap = options.programacaoIdMap instanceof Map ? options.programacaoIdMap : new Map();
  const supervisaoQuery = programacaoIdMap.size ? [...programacaoIdMap.keys()] : supervisao;
  const programacaoIdQuery = programacaoIdMap.size ? [...programacaoIdMap.values()] : options.programacaoId;
  const readOnly = isDataPassada(options.dataReferencia);

  function programacaoIdParaColab(colab) {
    return programacaoIdMap.size ? (programacaoIdMap.get(colab?.supervisao || '') || null) : options.programacaoId;
  }

  content.innerHTML = `
    <div class="prog-section-title">
      <h4>Sem O.S. — colaboradores da regional sem atendimento hoje</h4>
      <span class="badge">Etapa 4</span>
    </div>
    ${readOnly ? readonlyBannerHtml() : ''}
    <div class="pso-kpis">
      <div class="pso-kpi"><span>Sem O.S.</span><strong id="psoKpiTotal">0</strong></div>
    </div>
    <div class="pso-list ${readOnly ? 'prog-readonly-scope' : ''}" id="psoList"><div class="pso-empty pso-loading"><span class="pso-spinner" aria-hidden="true"></span><span>Carregando colaboradores...</span></div></div>
    <div class="pso-modal" id="psoModal"></div>
  `;

  const listEl = content.querySelector('#psoList');
  const kpiEl = content.querySelector('#psoKpiTotal');
  const modalEl = content.querySelector('#psoModal');
  if (!supervisao || (!options.programacaoId && !programacaoIdMap.size)) {
    listEl.innerHTML = '<div class="pso-empty">Carregue o contexto (supervisão e data) para ver quem está sem O.S.</div>';
    return;
  }

  let currentUser = null;
  getCurrentUser().then((u) => { currentUser = u; }).catch(() => {});

  let colabsAtual = [];
  let pendentesAtual = new Set();

  function fecharModal() { modalEl.classList.remove('open'); modalEl.innerHTML = ''; }

  function abrirModalInativar(colab) {
    modalEl.innerHTML = `<div class="pso-modal-card">
      <h3>Inativar ${esc(colab.nome)}</h3>
      <p class="muted" style="margin:0">Isso NÃO inativa o colaborador agora — registra um pedido para o setor de Recursos Humanos (Equipe &gt; Inativações) processar.</p>
      <textarea id="psoMotivo" rows="3" placeholder="Explique o motivo da inativação..."></textarea>
      <div class="pso-modal-actions">
        <button type="button" class="btn btn-primary" id="psoConfirmar">Confirmar solicitação</button>
        <button type="button" class="btn btn-secondary" id="psoCancelar">Cancelar</button>
      </div>
      <span class="pso-modal-fb" id="psoModalFb"></span>
    </div>`;
    modalEl.classList.add('open');
    modalEl.querySelector('#psoCancelar').onclick = fecharModal;
    modalEl.querySelector('#psoConfirmar').onclick = async () => {
      const fb = modalEl.querySelector('#psoModalFb');
      const motivo = modalEl.querySelector('#psoMotivo').value.trim();
      if (!motivo) { fb.textContent = 'Descreva o motivo.'; fb.classList.add('err'); return; }
      const btn = modalEl.querySelector('#psoConfirmar');
      btn.disabled = true;
      fb.textContent = 'Enviando...';
      fb.classList.remove('err');
      try {
        const { error } = await supabase.from('programacao_inativacao_solicitacoes').insert({
          colaborador_id: colab.colaboradorId,
          nome_colaborador: colab.nome,
          cargo: colab.cargo || null,
          coordenacao: colab.coordenacao || null,
          supervisao: colab.supervisao || null,
          motivo,
          data_referencia: options.dataReferencia || todayIso(),
          programacao_id: programacaoIdParaColab(colab),
          solicitado_por: currentUser?.id || null,
          solicitado_por_nome: currentUser?.email || currentUser?.user_metadata?.nome || null,
        });
        if (error) throw error;
        fecharModal();
        await carregar({ silent: true });
      } catch (error) {
        fb.textContent = error.message || 'Não foi possível registrar a solicitação.';
        fb.classList.add('err');
        btn.disabled = false;
      }
    };
  }

  async function carregar({ silent = false } = {}) {
    const scroller = silent ? scrollParentDe(listEl) : null;
    const scrollPos = scroller ? scroller.scrollTop : 0;
    if (!silent) listEl.innerHTML = '<div class="pso-empty pso-loading"><span class="pso-spinner" aria-hidden="true"></span><span>Carregando colaboradores...</span></div>';

    const [regionalBruto, equipeRows, tipoContratoPorCpf] = await Promise.all([
      loadColaboradoresRegional(supervisaoQuery),
      loadEquipeExistente(programacaoIdQuery),
      loadCruzamentoTipoContrato(supervisaoQuery),
    ]);
    // loadColaboradoresRegional foi feita pra sugestão de candidato (Etapa 2)
    // e aceita match "parecido" (regionalScore por token) quando a RPC não
    // devolve ninguém — bom pra sugerir alguém próximo, ruim aqui: listava
    // colaborador de OUTRA regional só por compartilhar uma palavra
    // (ex.: "MATO GROSSO MT4" aparecendo pra "MATO GROSSO DO SUL"). Etapa 4
    // exige match exato de supervisão.
    const supervisoesAlvo = new Set((Array.isArray(supervisaoQuery) ? supervisaoQuery : [supervisaoQuery]).map((s) => normalizeText(s)).filter(Boolean));
    const regional = regionalBruto.filter((c) => supervisoesAlvo.has(normalizeText(c.supervisao)));
    const confirmados = new Set(equipeRows.filter((r) => r.confirmado).map((r) => String(r.colaborador_id)));
    const semOs = regional.filter((c) => !confirmados.has(String(c.colaboradorId)));

    const ids = semOs.map((c) => c.colaboradorId);
    let situacoesPorColab = new Map();
    if (ids.length) {
      const idsProgramacao = Array.isArray(programacaoIdQuery) ? programacaoIdQuery : [programacaoIdQuery];
      const { data, error } = await supabase
        .from('programacao_colaboradores')
        .select('colaborador_id,disponibilidade,observacao')
        .in('programacao_id', idsProgramacao)
        .in('colaborador_id', ids);
      if (error) console.warn('[sem-os] situações:', error);
      situacoesPorColab = new Map((data || []).map((r) => [String(r.colaborador_id), r]));
    }

    pendentesAtual = new Set();
    if (ids.length) {
      const { data, error } = await supabase
        .from('programacao_inativacao_solicitacoes')
        .select('colaborador_id')
        .eq('status', 'PENDENTE')
        .in('colaborador_id', ids);
      if (error) console.warn('[sem-os] inativações pendentes:', error);
      pendentesAtual = new Set((data || []).map((r) => String(r.colaborador_id)));
    }

    colabsAtual = semOs;
    kpiEl.textContent = String(semOs.length);
    listEl.innerHTML = semOs.length
      ? semOs.map((c) => cardHtml(c, situacoesPorColab.get(c.colaboradorId), readOnly, pendentesAtual.has(String(c.colaboradorId)), tipoContratoPorCpf.get(String(c.colaboradorId).replace(/\D/g, '')))).join('')
      : '<div class="pso-empty">Ninguém da regional sem O.S. no momento.</div>';

    if (silent && scroller) scroller.scrollTop = scrollPos;
  }

  async function salvar(colaboradorId, patch) {
    const colab = colabsAtual.find((c) => c.colaboradorId === colaboradorId);
    if (!colab) return;
    const programacaoId = programacaoIdParaColab(colab);
    if (!programacaoId) return;
    const { error } = await supabase.from('programacao_colaboradores').upsert({
      programacao_id: programacaoId,
      colaborador_id: colaboradorId,
      nome_colaborador: colab.nome,
      cargo: colab.cargo || null,
      coordenacao: colab.coordenacao || null,
      supervisao: colab.supervisao || null,
      ...patch,
    }, { onConflict: 'programacao_id,colaborador_id' });
    if (error) console.error('[sem-os] salvar', error);
  }

  const obsTimers = new Map();
  listEl.addEventListener('click', (event) => {
    if (readOnly) return;
    const inativarBtn = event.target.closest('[data-inativar]');
    if (inativarBtn) {
      const card = inativarBtn.closest('.pso-card');
      const colab = colabsAtual.find((c) => c.colaboradorId === card?.dataset.colabId);
      if (colab) abrirModalInativar(colab);
      return;
    }
    const btn = event.target.closest('[data-situacao]');
    if (!btn) return;
    const card = btn.closest('.pso-card');
    const colaboradorId = card?.dataset.colabId;
    if (!colaboradorId) return;
    const jaAtivo = btn.classList.contains('on');
    card.querySelectorAll('[data-situacao]').forEach((b) => b.classList.remove('on'));
    if (!jaAtivo) btn.classList.add('on');
    salvar(colaboradorId, { disponibilidade: jaAtivo ? null : btn.dataset.situacao });
  });

  listEl.addEventListener('input', (event) => {
    if (readOnly) return;
    const input = event.target.closest('[data-obs]');
    if (!input) return;
    const card = input.closest('.pso-card');
    const colaboradorId = card?.dataset.colabId;
    if (!colaboradorId) return;
    clearTimeout(obsTimers.get(colaboradorId));
    obsTimers.set(colaboradorId, setTimeout(() => salvar(colaboradorId, { observacao: input.value }), 450));
  });

  window.__pgcSilentRefreshSemOs = () => carregar({ silent: true });

  await carregar();
}
