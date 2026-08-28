// Etapa 4 — "Sem O.S.": colaboradores da regional que hoje NÃO estão
// confirmados em nenhuma O.S. (programacao_equipe.confirmado). Pra cada um,
// só situação (Atestado/Falta/Férias/Folga) + observação — grava em
// programacao_colaboradores (mesma tabela/colunas já usadas pela
// Disponibilidade clássica de programacao.js, hoje inacessível pela UI nova).
import { supabase } from './supabaseClient.js';
import { getCurrentUser } from './auth.js';
import { loadEquipeExistente, loadColaboradoresRegional, loadCruzamentoTipoContrato, tipoContratoLetra, loadIndisponiveisNaData } from './programacao-equipe.js?v=20260828-desligamento-readmitido1';
import { anexoFieldHtml, resolverAnexo } from './rhShared.js';
import { getColaboradores } from './colaboradoresCache.js';

const SITUACOES = [['ATESTADO', 'Atestado'], ['FALTA', 'Falta'], ['FERIAS', 'Férias'], ['FOLGA', 'Folga']];
const TIPOS_EXTRA_DISPONIVEL = ['RECARGA', 'LAVANDERIA', 'LAVAGEM DE VEÍCULO', 'COMBUSTÍVEL'];

const cpfNorm = (value) => String(value || '').replace(/\D/g, '');
const diasEntre = (ini, fim) => Math.max(1, Math.round((new Date(`${fim}T00:00:00`) - new Date(`${ini}T00:00:00`)) / 86400000) + 1);

// Ao marcar Atestado aqui o gestor não tem acesso ao RH > Indisponibilidade,
// então o atestado nunca era formalizado (só virava um texto solto em
// programacao_colaboradores.disponibilidade) — pedido da usuária, 2026-08-06:
// abrir a mesma caixa de anexo do RH e gravar direto em rh_atestados, pra
// aparecer lá também. resolverColaboradorRh tenta achar o uuid/cpf reais em
// colaboradores (cache) pra casar certinho com loadIndisponiveisNaData depois;
// segue sem eles (nome basta pro match) se não achar.
async function resolverColaboradorRh(colab) {
  try {
    const lista = await getColaboradores();
    const cpfAlvo = cpfNorm(colab.colaboradorId);
    if (cpfAlvo.length >= 9) {
      const porCpf = lista.find((c) => cpfNorm(c.cpf) === cpfAlvo);
      if (porCpf) return porCpf;
    }
    const nomeAlvo = normalizeText(colab.nome);
    return lista.find((c) => normalizeText(c.nome) === nomeAlvo) || null;
  } catch {
    return null;
  }
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

function todayIso() {
  const n = new Date();
  return new Date(n.getTime() - n.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function addDaysIso(iso, amount) {
  const date = new Date(`${iso}T12:00:00`);
  date.setDate(date.getDate() + amount);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
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
    .pso-card{display:grid;grid-template-columns:minmax(180px,1.2fr) auto minmax(180px,1fr) auto;gap:12px;align-items:center;border:1px solid rgba(52,211,153,.16);background:rgba(2,6,23,.28);border-radius:14px;padding:11px 14px}
    .pso-name{display:flex;align-items:center;gap:10px;min-width:0}
    .pso-av{width:32px;height:32px;border-radius:999px;flex:0 0 auto;display:flex;align-items:center;justify-content:center;font-weight:950;font-size:12px;background:rgba(59,130,246,.18);color:#bfdbfe;border:1px solid rgba(59,130,246,.35)}
    .pso-name-txt{min-width:0}
    .pso-nome{font-weight:900;color:#f8fafc;line-height:1.15;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .pso-meta{font-size:11px;color:#9fb7aa;margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .pso-indisp{display:inline-flex;align-items:center;gap:3px;margin-left:8px;padding:2px 8px;border-radius:999px;font-size:10.5px;font-weight:900;vertical-align:middle;background:rgba(245,158,11,.14);color:#fde68a;border:1px solid rgba(245,158,11,.35)}
    .pso-situacoes{display:flex;gap:6px;flex-wrap:wrap}
    .pso-sit-btn{border:1px solid rgba(111,208,165,.28);background:transparent;color:#8ba79a;border-radius:9px;padding:7px 12px;font-size:12px;font-weight:800;cursor:pointer;white-space:nowrap}
    .pso-sit-btn.on{border-color:rgba(111,208,165,.5);background:rgba(63,168,120,.18);color:#bbf7d0}
    .pso-obs{min-height:38px;padding:8px 11px;border-radius:11px;border:1px solid rgba(52,211,153,.18);background:#0d0d18;color:#e2e2f0;font-size:13px;width:100%;box-sizing:border-box}
    @media(max-width:820px){.pso-card{grid-template-columns:1fr}}
    .pso-inativar-btn{border:1px solid rgba(248,113,113,.4);background:rgba(127,29,29,.18);color:#fca5a5;border-radius:9px;padding:6px 10px;font-size:11px;font-weight:800;cursor:pointer;white-space:nowrap;flex:0 0 auto}
    .pso-inativar-btn[disabled]{opacity:.6;cursor:default}
    .pso-inativar-btn.pendente{border-color:rgba(251,191,36,.4);background:rgba(120,53,15,.22);color:#fde68a}
    .pso-disponivel-btn{border:1px solid rgba(96,165,250,.42);background:rgba(30,64,175,.18);color:#bfdbfe;border-radius:9px;padding:6px 11px;font-size:11px;font-weight:900;cursor:pointer;white-space:nowrap}
    .pso-disponivel-btn.on{border-color:rgba(52,211,153,.48);background:rgba(6,95,70,.28);color:#a7f3d0}
    .pso-modal{position:fixed;inset:0;background:rgba(2,6,23,.75);z-index:9999;display:none;align-items:center;justify-content:center;padding:20px}
    .pso-modal.open{display:flex}
    .pso-modal-card{width:min(480px,100%);background:#15152a;border:1px solid rgba(255,255,255,.08);border-radius:18px;padding:22px;color:#e2e2f0}
    .pso-modal-card h3{margin:0 0 4px}
    .pso-modal-card textarea{width:100%;box-sizing:border-box;border:1px solid rgba(148,163,184,.28);background:#0d0d18;color:#e2e2f0;border-radius:12px;padding:10px 12px;font-size:13px;margin-top:12px;resize:vertical}
    .pso-modal-actions{display:flex;gap:10px;margin-top:14px;flex-wrap:wrap}
    .pso-modal-fb{display:block;margin-top:8px;font-weight:700;font-size:12.5px}
    .pso-modal-fb.err{color:#fca5a5}
    .pso-ate-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:12px}
    .pso-ate-grid label{font-size:12px;color:var(--muted)}
    .pso-ate-grid input{width:100%;box-sizing:border-box;border:1px solid rgba(148,163,184,.28);background:#0d0d18;color:#e2e2f0;border-radius:11px;padding:8px 10px;margin-top:4px;color-scheme:dark}
    .pso-modal-card label[for],.pso-modal-card label{font-size:12.5px}
    .pso-modal-card input[type=file]{display:block;width:100%;box-sizing:border-box;border:1px solid rgba(148,163,184,.28);background:#0d0d18;color:#e2e2f0;border-radius:11px;padding:8px 10px;margin-top:6px;font-size:12px}
    .pso-disp-origin{margin:12px 0;padding:10px 12px;border:1px solid rgba(96,165,250,.24);border-radius:12px;background:rgba(30,64,175,.12);color:#bfdbfe;font-size:12px}
    .pso-disp-options{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px;margin-top:14px}
    .pso-disp-option{display:flex;align-items:center;gap:8px;padding:10px 12px;border:1px solid rgba(148,163,184,.22);border-radius:12px;background:#0d0d18;color:#e2e2f0;font-weight:800;cursor:pointer}
    .pso-disp-extra-fields{display:grid;grid-template-columns:1fr 1.4fr .8fr;gap:8px;margin-top:10px}
    .pso-disp-extra-fields input,.pso-disp-extra-fields select{width:100%;box-sizing:border-box;border:1px solid rgba(148,163,184,.28);background:#0d0d18;color:#e2e2f0;border-radius:11px;padding:9px 10px}
    @media(max-width:560px){.pso-disp-options,.pso-disp-extra-fields{grid-template-columns:1fr}.pso-modal-card{max-height:88vh;overflow:auto}}
  `;
  document.head.appendChild(style);
}

function cardHtml(colab, row, readOnly, pendente, tipoContratoCru, indispMotivo) {
  const situacaoAtual = normalizeText(row?.disponibilidade || '');
  const dis = readOnly ? 'disabled' : '';
  const inativarDis = readOnly || pendente ? 'disabled' : '';
  const inativarLabel = pendente ? 'Inativação solicitada' : 'Inativar';
  const indispBadge = indispMotivo
    ? `<span class="pso-indisp" title="Lançado em RH > Indisponibilidade — não aparece como candidato na Etapa 2">${indispMotivo === 'Férias' ? '🏖' : '🤒'} ${esc(indispMotivo)} (RH)</span>`
    : '';
  const disponivel = situacaoAtual === 'DISPONIVEL';
  return `<article class="pso-card" data-colab-id="${esc(colab.colaboradorId)}">
    <div class="pso-name">
      <span class="pso-av" title="Tipo de contrato">${esc(tipoContratoLetra(tipoContratoCru || colab.tipoLabel))}</span>
      <div class="pso-name-txt">
        <div class="pso-nome">${esc(colab.nome)}${indispBadge}</div>
        <div class="pso-meta">${esc(colab.cargo || 'Colaborador')} · ${esc(colab.coordenacao || colab.supervisao || '-')}</div>
      </div>
    </div>
    <div class="pso-situacoes">
      <button type="button" class="pso-disponivel-btn ${disponivel ? 'on' : ''}" data-disponivel ${dis}>${disponivel ? 'Disponível ✓' : 'Disponível'}</button>
      <button type="button" class="pso-inativar-btn ${pendente ? 'pendente' : ''}" data-inativar ${inativarDis}>${esc(inativarLabel)}</button>
      ${SITUACOES.map(([valor, label]) => `<button type="button" class="pso-sit-btn ${situacaoAtual === valor ? 'on' : ''}" data-situacao="${esc(valor)}" ${dis}>${esc(label)}</button>`).join('')}
    </div>
    <input class="pso-obs" type="text" data-obs value="${esc(row?.observacao || '')}" placeholder="Observação" ${dis} />
    <span class="pso-rh-status" data-rh-status></span>
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
  `;

  const listEl = content.querySelector('#psoList');
  const kpiEl = content.querySelector('#psoKpiTotal');
  // O modal vivia dentro de #content (dentro de #pgcPane2, várias camadas de
  // ancestrais abaixo) — position:fixed some vira relativo ao 1º ancestral
  // com transform/filter/will-change (ou o zoom:1.15 do .app-shell) em vez
  // do viewport, então o modal abria fora da área visível em vez de
  // centralizado (reportado pela usuária, 2026-07-22: "fica lá embaixo").
  // Ancorado direto no <body>, igual o painel lateral de programacao-lista-
  // drawer.js já faz pelo mesmo motivo, fica imune a isso.
  document.getElementById('psoModalRoot')?.remove();
  const modalEl = document.createElement('div');
  modalEl.id = 'psoModalRoot';
  modalEl.className = 'pso-modal';
  document.body.appendChild(modalEl);
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
        const patrimonioPromise = supabase
          .from('patrimonios_snapshot')
          .select('patrimonio_codigo,identificacao')
          .ilike('funcionario', colab.nome)
          .limit(100);
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
        const { data: patrimonios, error: patrimonioError } = await patrimonioPromise;
        if (patrimonioError) console.warn('[sem-os] consulta de patrimônios para recolhimento:', patrimonioError);
        if (patrimonios?.length) {
          modalEl.innerHTML = `<div class="pso-modal-card">
            <h3>Materiais precisam ser recolhidos</h3>
            <p class="muted" style="margin:0">A solicitação de inativação de <strong>${esc(colab.nome)}</strong> foi registrada, mas existem ${patrimonios.length} ${patrimonios.length === 1 ? 'patrimônio' : 'patrimônios'} em seu nome. Providencie o recolhimento:</p>
            <div style="margin:14px 0;padding:12px;border:1px solid rgba(251,146,60,.35);border-radius:12px;background:rgba(124,45,18,.16);max-height:220px;overflow:auto">${patrimonios.map((item) => `<div style="padding:5px 0"><strong>${esc(item.patrimonio_codigo || '-')}</strong> — ${esc(item.identificacao || 'Material sem identificação')}</div>`).join('')}</div>
            <div class="pso-modal-actions"><button type="button" class="btn btn-primary" id="psoEntendi">Entendi, vou recolher</button></div>
          </div>`;
          modalEl.querySelector('#psoEntendi').onclick = async () => {
            fecharModal();
            await carregar({ silent: true });
          };
        } else {
          fecharModal();
          await carregar({ silent: true });
        }
      } catch (error) {
        fb.textContent = error.message || 'Não foi possível registrar a solicitação.';
        fb.classList.add('err');
        btn.disabled = false;
      }
    };
  }

  function abrirModalAtestado(colab, colaboradorId) {
    const hoje = options.dataReferencia || todayIso();
    modalEl.innerHTML = `<div class="pso-modal-card">
      <h3>Atestado de ${esc(colab.nome)}</h3>
      <p class="muted" style="margin:0">Anexe o atestado médico — fica disponível em Recursos Humanos &gt; Indisponibilidade &gt; Atestados.</p>
      <div class="pso-ate-grid">
        <label>Início *<input id="psoAteInicio" type="date" value="${esc(hoje)}"></label>
        <label>Fim *<input id="psoAteFim" type="date" value="${esc(hoje)}"></label>
      </div>
      ${anexoFieldHtml('psoAteAnexo', { label: 'Atestado digitalizado (PDF/foto) *' })}
      <div class="pso-modal-actions">
        <button type="button" class="btn btn-primary" id="psoAteConfirmar">Confirmar</button>
        <button type="button" class="btn btn-secondary" id="psoAteCancelar">Cancelar</button>
      </div>
      <span class="pso-modal-fb" id="psoAteFb"></span>
    </div>`;
    modalEl.classList.add('open');
    modalEl.querySelector('#psoAteCancelar').onclick = fecharModal;
    modalEl.querySelector('#psoAteConfirmar').onclick = async () => {
      const fb = modalEl.querySelector('#psoAteFb');
      fb.classList.remove('err');
      const inicio = modalEl.querySelector('#psoAteInicio').value;
      const fim = modalEl.querySelector('#psoAteFim').value;
      if (!inicio || !fim) { fb.textContent = 'Informe o início e o fim do atestado.'; fb.classList.add('err'); return; }
      if (fim < inicio) { fb.textContent = 'O fim não pode ser antes do início.'; fb.classList.add('err'); return; }
      if (!modalEl.querySelector('#psoAteAnexo')?.files?.[0]) { fb.textContent = 'Anexe o atestado digitalizado.'; fb.classList.add('err'); return; }
      const btn = modalEl.querySelector('#psoAteConfirmar');
      btn.disabled = true;
      fb.textContent = 'Enviando...';
      try {
        const anexo = await resolverAnexo(modalEl, 'psoAteAnexo', 'atestados');
        const cadastro = await resolverColaboradorRh(colab);
        const { error } = await supabase.from('rh_atestados').insert({
          colaborador_id: cadastro?.id || null,
          colaborador_nome: colab.nome,
          data_inicio: inicio,
          data_fim: fim,
          dias: diasEntre(inicio, fim),
          anexo_url: anexo,
          status: 'lancado',
          created_by: currentUser?.id || null,
        });
        if (error) throw error;
        fecharModal();
        await salvar(colaboradorId, { disponibilidade: 'ATESTADO' });
        await carregar({ silent: true });
      } catch (error) {
        fb.textContent = error.message || 'Não foi possível registrar o atestado.';
        fb.classList.add('err');
        btn.disabled = false;
      }
    };
  }

  async function buscarEstadiaAnterior(colab) {
    const dataAtual = options.dataReferencia || todayIso();
    const dataAnterior = addDaysIso(dataAtual, -1);
    const { data: programas, error: progError } = await supabase
      .from('programacao_dia')
      .select('id')
      .eq('data_referencia', dataAnterior)
      .limit(500);
    if (progError) throw progError;
    const ids = (programas || []).map((row) => row.id).filter(Boolean);
    if (!ids.length) return null;
    const { data, error } = await supabase
      .from('programacao_estadia')
      .select('tipo_estadia,alojamento_nome,cidade,observacao')
      .in('programacao_id', ids)
      .eq('colaborador_id', colab.colaboradorId)
      .in('tipo_estadia', ['PERNOITE', 'HOTEL', 'ALOJAMENTO'])
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return data || null;
  }

  async function abrirModalDisponivel(colab) {
    modalEl.innerHTML = '<div class="pso-modal-card"><h3>Validando disponibilidade…</h3><p class="muted">Consultando a estadia do dia anterior.</p></div>';
    modalEl.classList.add('open');
    try {
      const estadiaAnterior = await buscarEstadiaAnterior(colab);
      if (!estadiaAnterior) {
        modalEl.innerHTML = `<div class="pso-modal-card"><h3>Disponibilidade não liberada</h3><p class="muted">${esc(colab.nome)} não possui Pernoite, Hotel ou Alojamento registrado no dia anterior.</p><div class="pso-modal-actions"><button type="button" class="btn btn-secondary" id="psoDispFechar">Fechar</button></div></div>`;
        modalEl.querySelector('#psoDispFechar').onclick = fecharModal;
        return;
      }
      const tipoAnterior = normalizeText(estadiaAnterior.tipo_estadia);
      modalEl.innerHTML = `<div class="pso-modal-card">
        <h3>Liberar despesas de ${esc(colab.nome)}</h3>
        <p class="muted" style="margin:0">Selecione somente as despesas autorizadas para o dia disponível.</p>
        <div class="pso-disp-origin">Dia anterior: <strong>${esc(estadiaAnterior.tipo_estadia)}</strong>${estadiaAnterior.alojamento_nome ? ` · ${esc(estadiaAnterior.alojamento_nome)}` : ''}${estadiaAnterior.cidade ? ` · ${esc(estadiaAnterior.cidade)}` : ''}</div>
        <div class="pso-disp-options">
          <label class="pso-disp-option"><input type="checkbox" data-disp-ref="cafe"> Café</label>
          <label class="pso-disp-option"><input type="checkbox" data-disp-ref="almoco"> Almoço</label>
          <label class="pso-disp-option"><input type="checkbox" data-disp-ref="janta"> Janta</label>
          ${tipoAnterior === 'PERNOITE' ? '<label class="pso-disp-option"><input type="checkbox" data-disp-ref="pernoite"> Pernoite</label>' : ''}
          <label class="pso-disp-option"><input type="checkbox" data-disp-ref="extras"> Extras</label>
        </div>
        <div class="pso-disp-extra-fields" id="psoDispExtraFields" hidden>
          <select id="psoDispExtraTipo">${TIPOS_EXTRA_DISPONIVEL.map((tipo) => `<option value="${esc(tipo)}">${esc(tipo)}</option>`).join('')}</select>
          <input id="psoDispExtraDesc" placeholder="Descrição do extra">
          <input id="psoDispExtraValor" inputmode="decimal" placeholder="R$ 0,00">
        </div>
        <div class="pso-modal-actions">
          <button type="button" class="btn btn-primary" id="psoDispSalvar">Liberar e sincronizar</button>
          <button type="button" class="btn btn-secondary" id="psoDispCancelar">Cancelar</button>
        </div>
        <span class="pso-modal-fb" id="psoDispFb"></span>
      </div>`;
      const extrasCheck = modalEl.querySelector('[data-disp-ref="extras"]');
      extrasCheck.onchange = () => { modalEl.querySelector('#psoDispExtraFields').hidden = !extrasCheck.checked; };
      modalEl.querySelector('#psoDispCancelar').onclick = fecharModal;
      modalEl.querySelector('#psoDispSalvar').onclick = async () => {
        const fb = modalEl.querySelector('#psoDispFb');
        const btn = modalEl.querySelector('#psoDispSalvar');
        const selected = (key) => !!modalEl.querySelector(`[data-disp-ref="${key}"]`)?.checked;
        if (!['cafe', 'almoco', 'janta', 'pernoite', 'extras'].some(selected)) {
          fb.textContent = 'Selecione ao menos uma despesa.'; fb.classList.add('err'); return;
        }
        const programacaoId = programacaoIdParaColab(colab);
        const dataReferencia = options.dataReferencia || todayIso();
        const extraDescricao = modalEl.querySelector('#psoDispExtraDesc')?.value.trim() || '';
        if (selected('extras') && !extraDescricao) {
          fb.textContent = 'Descreva o extra que será liberado.'; fb.classList.add('err'); return;
        }
        btn.disabled = true; fb.textContent = 'Salvando e enviando para sincronização…'; fb.classList.remove('err');
        try {
          const base = { programacao_id: programacaoId, data_referencia: dataReferencia, colaborador_id: colab.colaboradorId, nome_colaborador: colab.nome };
          const writes = [
            supabase.from('programacao_colaboradores').upsert({ ...base, cargo: colab.cargo || null, coordenacao: colab.coordenacao || null, supervisao: colab.supervisao || null, disponibilidade: 'DISPONIVEL', observacao: `Disponível após ${estadiaAnterior.tipo_estadia}` }, { onConflict: 'programacao_id,colaborador_id' }),
            supabase.from('programacao_alimentacao').upsert({ ...base, cafe: selected('cafe'), almoco: selected('almoco'), janta: selected('janta'), observacao: 'Liberado no fluxo Disponível' }, { onConflict: 'programacao_id,colaborador_id' }),
          ];
          if (selected('pernoite')) writes.push(supabase.from('programacao_estadia').upsert({ ...base, tipo_estadia: 'PERNOITE', tem_estadia: true, checkin: dataReferencia, checkout: addDaysIso(dataReferencia, 1), observacao: 'Pernoite liberado no fluxo Disponível' }, { onConflict: 'programacao_id,colaborador_id' }));
          const results = await Promise.all(writes);
          const writeError = results.find((result) => result.error)?.error;
          if (writeError) throw writeError;
          if (!selected('pernoite')) {
            const { error: estadiaDeleteError } = await supabase.from('programacao_estadia')
              .delete()
              .eq('programacao_id', programacaoId)
              .eq('colaborador_id', colab.colaboradorId)
              .eq('observacao', 'Pernoite liberado no fluxo Disponível');
            if (estadiaDeleteError) throw estadiaDeleteError;
          }
          const { error: extraDeleteError } = await supabase.from('programacao_extras').delete().eq('programacao_id', programacaoId).eq('colaborador_id', colab.colaboradorId).eq('observacao', 'Liberado no fluxo Disponível');
          if (extraDeleteError) throw extraDeleteError;
          if (selected('extras')) {
            const valor = Number(String(modalEl.querySelector('#psoDispExtraValor')?.value || '0').replace(',', '.')) || 0;
            const extraTipoSelecionado = modalEl.querySelector('#psoDispExtraTipo').value;
            const combustivel = normalizeText(extraTipoSelecionado) === 'COMBUSTIVEL';
            const { error: extraError } = await supabase.from('programacao_extras').insert({ ...base, tipo_despesa: combustivel ? 'OUTROS' : extraTipoSelecionado, descricao: combustivel ? `Combustível — ${extraDescricao}` : extraDescricao, valor, observacao: 'Liberado no fluxo Disponível' });
            if (extraError) throw extraError;
          }
          await window.__publicarGrmLiberacaoDespesas?.('SALVAR_MANUAL');
          fecharModal();
          await carregar({ silent: true });
        } catch (error) {
          fb.textContent = error.message || 'Não foi possível liberar as despesas.'; fb.classList.add('err'); btn.disabled = false;
        }
      };
    } catch (error) {
      modalEl.innerHTML = `<div class="pso-modal-card"><h3>Falha ao validar</h3><p class="muted">${esc(error.message || 'Não foi possível consultar a estadia anterior.')}</p><div class="pso-modal-actions"><button type="button" class="btn btn-secondary" id="psoDispFechar">Fechar</button></div></div>`;
      modalEl.querySelector('#psoDispFechar').onclick = fecharModal;
    }
  }

  async function carregar({ silent = false } = {}) {
    const scroller = silent ? scrollParentDe(listEl) : null;
    const scrollPos = scroller ? scroller.scrollTop : 0;
    if (!silent) listEl.innerHTML = '<div class="pso-empty pso-loading"><span class="pso-spinner" aria-hidden="true"></span><span>Carregando colaboradores...</span></div>';

    const [regionalBruto, equipeRows, tipoContratoPorCpf, indisponiveis] = await Promise.all([
      loadColaboradoresRegional(supervisaoQuery),
      loadEquipeExistente(programacaoIdQuery),
      loadCruzamentoTipoContrato(supervisaoQuery),
      loadIndisponiveisNaData(options.dataReferencia),
    ]);
    // loadColaboradoresRegional foi feita pra sugestão de candidato (Etapa 2)
    // e aceita match "parecido" (regionalScore por token) quando a RPC não
    // devolve ninguém — bom pra sugerir alguém próximo, ruim aqui: listava
    // colaborador de OUTRA regional só por compartilhar uma palavra
    // (ex.: "MATO GROSSO MT4" aparecendo pra "MATO GROSSO DO SUL"). Etapa 4
    // exige match exato de supervisão.
    const supervisoesAlvo = new Set((Array.isArray(supervisaoQuery) ? supervisaoQuery : [supervisaoQuery]).map((s) => normalizeText(s)).filter(Boolean));
    const regional = regionalBruto.filter((c) => supervisoesAlvo.has(normalizeText(c.supervisao)));
    // colaboradorId chega em 2 formatos possíveis (CPF puro ou CPF formatado
    // com pontuação, dependendo de qual fonte alimentou a linha) — comparar
    // a string crua deixava passar colaborador já confirmado numa O.S. na
    // lista de "Sem O.S." sempre que os formatos não batiam byte a byte
    // (reportado pela usuária, 2026-07-22). idKey() normaliza os 2 lados
    // pro mesmo formato (só dígitos quando é CPF) antes de comparar.
    const idKey = (value) => {
      const digits = String(value || '').replace(/\D/g, '');
      return digits.length >= 9 ? digits : String(value || '').trim();
    };
    // Ainda vazava mesmo com idKey (colaborador confirmado continuava
    // aparecendo, reportado 2026-07-23 com nome real: "Henrique Lopes").
    // Causa: quando o colaborador não vem da RPC de regional (só do
    // fallback colaboradores_atuais) E o CPF dele está vazio nessa tabela,
    // loadColaboradoresRegional() usa o NOME como colaboradorId (ver
    // colaboradorKey() em programacao-equipe.js) — não tem CPF nenhum pra
    // normalizar, e nunca vai bater com o CPF gravado em
    // programacao_equipe.colaborador_id no momento da confirmação. Nome
    // normalizado como 2ª rede de segurança: se bater o nome, também conta
    // como confirmado.
    const confirmadosPorId = new Set(equipeRows.filter((r) => r.confirmado).map((r) => idKey(r.colaborador_id)));
    const confirmadosPorNome = new Set(equipeRows.filter((r) => r.confirmado).map((r) => normalizeText(r.nome_colaborador)));
    const semOs = regional.filter((c) => !confirmadosPorId.has(idKey(c.colaboradorId)) && !confirmadosPorNome.has(normalizeText(c.nome)));

    const ids = semOs.map((c) => c.colaboradorId);
    let situacoesPorColab = new Map();
    pendentesAtual = new Set();
    // As 2 consultas abaixo não dependem uma da outra (só de `ids`) — rodavam
    // em sequência (await uma, depois await a outra), somando os 2 tempos de
    // ida-e-volta ao banco só pra montar a Etapa 4. Como essa aba já é a mais
    // lenta pra carregar (regional inteira + várias consultas), essa espera
    // extra é o que a usuária sentia como "troca de tela lenta" pro Sem O.S.
    // (reportado 2026-07-23). Em paralelo.
    if (ids.length) {
      const idsProgramacao = Array.isArray(programacaoIdQuery) ? programacaoIdQuery : [programacaoIdQuery];
      const [situacoesRes, pendentesRes] = await Promise.all([
        supabase.from('programacao_colaboradores')
          .select('colaborador_id,disponibilidade,observacao')
          .in('programacao_id', idsProgramacao)
          .in('colaborador_id', ids),
        supabase.from('programacao_inativacao_solicitacoes')
          .select('colaborador_id')
          .eq('status', 'PENDENTE')
          .in('colaborador_id', ids),
      ]);
      if (situacoesRes.error) console.warn('[sem-os] situações:', situacoesRes.error);
      situacoesPorColab = new Map((situacoesRes.data || []).map((r) => [String(r.colaborador_id), r]));
      if (pendentesRes.error) console.warn('[sem-os] inativações pendentes:', pendentesRes.error);
      pendentesAtual = new Set((pendentesRes.data || []).map((r) => String(r.colaborador_id)));
    }

    colabsAtual = semOs;
    kpiEl.textContent = String(semOs.length);
    listEl.innerHTML = semOs.length
      ? semOs.map((c) => cardHtml(c, situacoesPorColab.get(c.colaboradorId), readOnly, pendentesAtual.has(String(c.colaboradorId)), tipoContratoPorCpf.get(String(c.colaboradorId).replace(/\D/g, '')), indisponiveis.motivo(c))).join('')
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
    const disponivelBtn = event.target.closest('[data-disponivel]');
    if (disponivelBtn) {
      const card = disponivelBtn.closest('.pso-card');
      const colab = colabsAtual.find((c) => c.colaboradorId === card?.dataset.colabId);
      if (colab) abrirModalDisponivel(colab);
      return;
    }
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
    if (!jaAtivo && btn.dataset.situacao === 'ATESTADO') {
      const colab = colabsAtual.find((c) => c.colaboradorId === colaboradorId);
      if (colab) abrirModalAtestado(colab, colaboradorId);
      return;
    }
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
