// Etapa 3 — Transferências: o gestor pede a transferência de um colaborador
// da sua supervisão para outra, dizendo se os patrimônios vão junto. O gestor
// da supervisão de destino é notificado (central + push) e aceita ou recusa
// aqui. Aceita => o agente sync-transferir-colaborador troca a Supervisão no
// cadastro do GRM (grmserver-transferir-colaborador-api.js).
// Regras e permissões ficam nas RPCs programacao_transferencia_* (migration
// 20260926120000_programacao_transferencias.sql); esta tela só as chama.
import { supabase } from './supabaseClient.js';

const TODAS_SUPERVISOES = '__TODAS__';

const STATUS_META = {
  PENDENTE: { label: 'Aguardando aceite', cls: 'wait' },
  ACEITA: { label: 'Aceita', cls: 'ok' },
  RECUSADA: { label: 'Recusada', cls: 'err' },
  CANCELADA: { label: 'Cancelada', cls: 'off' },
};

const GRM_META = {
  NA_FILA: { label: 'GRM: na fila', cls: 'wait' },
  PROCESSANDO: { label: 'GRM: aplicando…', cls: 'wait' },
  APLICADA: { label: 'GRM: concluída', cls: 'ok' },
  ERRO: { label: 'GRM: erro', cls: 'err' },
};

function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function normalize(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function formatDateTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}

function rpcErrorMessage(error) {
  return String(error?.message || error || 'Erro inesperado.').replace(/^.*?ERROR:\s*/i, '');
}

function injectStyles() {
  if (document.getElementById('progTransferenciasStyles')) return;
  const style = document.createElement('style');
  style.id = 'progTransferenciasStyles';
  style.textContent = `
    .ptr-wrap{display:flex;flex-direction:column;gap:16px}
    .ptr-block{border:1px solid rgba(52,211,153,.16);background:rgba(2,6,23,.28);border-radius:14px;padding:14px}
    .ptr-block h5{margin:0 0 10px;font-size:13px;font-weight:900;color:#f8fafc;display:flex;align-items:center;gap:8px}
    .ptr-count{display:inline-flex;min-width:20px;height:20px;padding:0 6px;border-radius:999px;align-items:center;justify-content:center;font-size:11px;background:rgba(245,158,11,.2);color:#fde68a;border:1px solid rgba(245,158,11,.4)}
    .ptr-empty{border:1px dashed rgba(148,163,184,.22);border-radius:12px;padding:16px;text-align:center;color:#94a3b8;font-size:13px}
    .ptr-form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
    .ptr-field{display:flex;flex-direction:column;gap:5px;min-width:0}
    .ptr-field.full{grid-column:1 / -1}
    .ptr-field label,.ptr-label{font-size:11px;font-weight:900;letter-spacing:.06em;text-transform:uppercase;color:#93c5fd}
    .ptr-field select,.ptr-field input,.ptr-field textarea{min-height:40px;padding:8px 11px;border-radius:11px;border:1px solid rgba(52,211,153,.22);background:#0d0d18;color:#e2e2f0;font-size:13px;width:100%;box-sizing:border-box}
    .ptr-field textarea{resize:vertical;min-height:60px}
    .ptr-patr{border:1px solid rgba(148,163,184,.18);border-radius:12px;padding:10px 12px;background:rgba(15,23,42,.35)}
    .ptr-patr-list{margin:6px 0 10px;padding:0;list-style:none;display:flex;flex-wrap:wrap;gap:6px}
    .ptr-patr-list li{font-size:11.5px;padding:3px 8px;border-radius:8px;background:rgba(59,130,246,.14);color:#bfdbfe;border:1px solid rgba(59,130,246,.3)}
    .ptr-choice{display:flex;gap:8px;flex-wrap:wrap}
    .ptr-choice button{border:1px solid rgba(111,208,165,.28);background:transparent;color:#8ba79a;border-radius:9px;padding:8px 14px;font-size:12.5px;font-weight:800;cursor:pointer}
    .ptr-choice button.on{border-color:rgba(111,208,165,.6);background:rgba(63,168,120,.2);color:#bbf7d0}
    .ptr-actions{display:flex;gap:10px;align-items:center;flex-wrap:wrap;grid-column:1 / -1}
    .ptr-fb{font-size:12.5px;font-weight:700}
    .ptr-fb.err{color:#fca5a5}
    .ptr-fb.ok{color:#86efac}
    .ptr-card{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;align-items:center;border:1px solid rgba(148,163,184,.14);border-radius:12px;padding:10px 12px;background:rgba(2,6,23,.25)}
    .ptr-card + .ptr-card{margin-top:8px}
    .ptr-card.is-pendente-mim{border-color:rgba(245,158,11,.45);background:rgba(120,53,15,.14)}
    .ptr-nome{font-weight:900;color:#f8fafc}
    .ptr-rota{font-size:12.5px;color:#cbd5e1;margin-top:2px}
    .ptr-meta{font-size:11px;color:#9fb7aa;margin-top:3px;line-height:1.4}
    .ptr-tags{display:flex;gap:6px;flex-wrap:wrap;margin-top:6px}
    .ptr-tag{font-size:10.5px;font-weight:900;padding:2px 8px;border-radius:999px;border:1px solid}
    .ptr-tag.wait{background:rgba(245,158,11,.14);color:#fde68a;border-color:rgba(245,158,11,.35)}
    .ptr-tag.ok{background:rgba(34,197,94,.14);color:#bbf7d0;border-color:rgba(34,197,94,.35)}
    .ptr-tag.err{background:rgba(239,68,68,.14);color:#fecaca;border-color:rgba(239,68,68,.35)}
    .ptr-tag.off{background:rgba(148,163,184,.12);color:#cbd5e1;border-color:rgba(148,163,184,.3)}
    .ptr-tag.info{background:rgba(59,130,246,.14);color:#bfdbfe;border-color:rgba(59,130,246,.3)}
    .ptr-card-actions{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}
    .ptr-btn{border-radius:9px;padding:7px 12px;font-size:12px;font-weight:900;cursor:pointer;border:1px solid;white-space:nowrap}
    .ptr-btn[disabled]{opacity:.55;cursor:default}
    .ptr-btn.aceitar{background:rgba(6,95,70,.35);color:#a7f3d0;border-color:rgba(52,211,153,.5)}
    .ptr-btn.recusar{background:rgba(127,29,29,.22);color:#fca5a5;border-color:rgba(248,113,113,.45)}
    .ptr-btn.neutro{background:transparent;color:#cbd5e1;border-color:rgba(148,163,184,.35)}
    .ptr-erro{font-size:11.5px;color:#fca5a5;margin-top:4px}
    .ptr-modal{position:fixed;inset:0;background:rgba(2,6,23,.75);z-index:9999;display:none;align-items:center;justify-content:center;padding:20px}
    .ptr-modal.open{display:flex}
    .ptr-modal-card{width:min(460px,100%);background:#15152a;border:1px solid rgba(255,255,255,.08);border-radius:18px;padding:22px;color:#e2e2f0}
    .ptr-modal-card h3{margin:0 0 6px}
    .ptr-modal-card textarea{width:100%;box-sizing:border-box;border:1px solid rgba(148,163,184,.28);background:#0d0d18;color:#e2e2f0;border-radius:12px;padding:10px 12px;font-size:13px;margin-top:10px;resize:vertical}
    .ptr-modal-actions{display:flex;gap:10px;margin-top:14px;flex-wrap:wrap}
    @media(max-width:720px){
      .ptr-form{grid-template-columns:1fr}
      .ptr-card{grid-template-columns:1fr}
      .ptr-card-actions{justify-content:flex-start}
    }
  `;
  document.head.appendChild(style);
}

// Supervisões liberadas pro usuário = as opções do combo da Programação
// (mesma fonte que já decide o que ele pode programar). Só controla quais
// botões aparecem; quem valida de verdade são as RPCs.
function minhasSupervisoes() {
  const select = document.getElementById('progSup');
  if (!select) return new Set();
  return new Set([...select.options].map((opt) => opt.value).filter((v) => v && v !== TODAS_SUPERVISOES).map(normalize));
}

async function loadColaboradoresOrigem(supervisoes) {
  if (!supervisoes.length) return [];
  const { data, error } = await supabase
    .from('colaboradores_atuais')
    .select('cpf,nome,cargo,supervisao,ativo,desligamento')
    .in('supervisao', supervisoes)
    .order('nome')
    .limit(3000);
  if (error) throw error;
  const vistos = new Set();
  return (data || []).filter((c) => {
    const cpf = String(c.cpf || '').replace(/\D/g, '');
    if (c.ativo === false || c.desligamento || cpf.length < 11 || vistos.has(cpf)) return false;
    vistos.add(cpf);
    c.cpf = cpf;
    return true;
  });
}

async function loadSupervisoesDestino() {
  const { data, error } = await supabase.from('supervisoes').select('nome').eq('ativo', true).order('nome');
  if (error) throw error;
  return (data || []).map((r) => r.nome).filter(Boolean);
}

async function loadPatrimoniosColaborador(nome) {
  const { data, error } = await supabase
    .from('patrimonios_snapshot')
    .select('patrimonio_codigo,identificacao,categoria,situacao,funcionario')
    .ilike('funcionario', nome)
    .neq('situacao', 'Baixado')
    .order('patrimonio_codigo')
    .limit(200);
  if (error) throw error;
  return data || [];
}

async function loadTransferencias() {
  const { data, error } = await supabase
    .from('programacao_transferencias')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(150);
  if (error) throw error;
  return data || [];
}

function tagsHtml(t) {
  const status = STATUS_META[t.status] || { label: t.status, cls: 'off' };
  const tags = [`<span class="ptr-tag ${status.cls}">${esc(status.label)}</span>`];
  if (t.status === 'ACEITA' && GRM_META[t.grm_status]) {
    tags.push(`<span class="ptr-tag ${GRM_META[t.grm_status].cls}">${esc(GRM_META[t.grm_status].label)}</span>`);
  }
  const qtd = Array.isArray(t.patrimonios) ? t.patrimonios.length : 0;
  tags.push(`<span class="ptr-tag info">${t.transferir_patrimonios ? `Patrimônios vão junto (${qtd})` : `Patrimônios ficam na origem${qtd ? ` (${qtd})` : ''}`}</span>`);
  return tags.join('');
}

function cardHtml(t, minhas) {
  const souDestino = minhas.has(normalize(t.supervisao_destino));
  const souOrigem = minhas.has(normalize(t.supervisao_origem));
  const pendente = t.status === 'PENDENTE';
  const acoes = [];
  if (pendente && souDestino) {
    acoes.push(`<button type="button" class="ptr-btn aceitar" data-ptr-acao="aceitar" data-id="${esc(t.id)}">✓ Aceitar</button>`);
    acoes.push(`<button type="button" class="ptr-btn recusar" data-ptr-acao="recusar" data-id="${esc(t.id)}">✕ Recusar</button>`);
  }
  if (pendente && souOrigem && !souDestino) {
    acoes.push(`<button type="button" class="ptr-btn neutro" data-ptr-acao="cancelar" data-id="${esc(t.id)}">Cancelar pedido</button>`);
  }
  if (t.status === 'ACEITA' && t.grm_status === 'ERRO') {
    acoes.push(`<button type="button" class="ptr-btn neutro" data-ptr-acao="reenviar" data-id="${esc(t.id)}">↻ Reenviar ao GRM</button>`);
  }
  const resposta = t.respondido_em
    ? ` · ${t.status === 'CANCELADA' ? 'cancelada' : 'respondida'} por ${esc(t.respondido_por_nome || '—')} em ${esc(formatDateTime(t.respondido_em))}`
    : '';
  return `
    <div class="ptr-card ${pendente && souDestino ? 'is-pendente-mim' : ''}">
      <div>
        <div class="ptr-nome">${esc(t.colaborador_nome)}${t.colaborador_cargo ? ` <span class="ptr-meta">· ${esc(t.colaborador_cargo)}</span>` : ''}</div>
        <div class="ptr-rota">${esc(t.supervisao_origem)} → <strong>${esc(t.supervisao_destino)}</strong></div>
        <div class="ptr-meta">Pedido por ${esc(t.solicitado_por_nome || '—')} em ${esc(formatDateTime(t.solicitado_em))}${resposta}${t.motivo ? `<br>Motivo: ${esc(t.motivo)}` : ''}${t.motivo_recusa ? `<br>Recusa: ${esc(t.motivo_recusa)}` : ''}</div>
        <div class="ptr-tags">${tagsHtml(t)}</div>
        ${t.grm_status === 'ERRO' && t.grm_erro ? `<div class="ptr-erro">${esc(t.grm_erro)}</div>` : ''}
      </div>
      <div class="ptr-card-actions">${acoes.join('')}</div>
    </div>`;
}

export function atualizarBadgeTransferencias(qtd) {
  const btn = document.querySelector('#progSteps .stepbtn[data-ui-step="3"]');
  if (!btn) return;
  let badge = btn.querySelector('.ptr-step-badge');
  if (!qtd) { badge?.remove(); return; }
  if (!badge) {
    badge = document.createElement('span');
    badge.className = 'ptr-count ptr-step-badge';
    badge.style.marginLeft = '6px';
    btn.appendChild(badge);
  }
  badge.textContent = String(qtd);
}

let realtimeChannel = null;

export async function renderProgramacaoTransferencias(content, options = {}) {
  injectStyles();
  const supervisao = String(options.supervisao || '').trim();
  const supervisoesOrigem = (options.supervisoesResolvidas?.length ? options.supervisoesResolvidas : [supervisao])
    .filter((s) => s && s !== TODAS_SUPERVISOES);

  content.innerHTML = `
    <div class="prog-section-title">
      <h4>Transferências de colaboradores entre supervisões</h4>
      <span class="badge">Etapa 3</span>
    </div>
    <div class="ptr-wrap">
      <section class="ptr-block" id="ptrRecebidasBlock">
        <h5>Para você aceitar <span class="ptr-count" id="ptrRecebidasCount">0</span></h5>
        <div id="ptrRecebidas"><div class="ptr-empty">Carregando...</div></div>
      </section>
      <section class="ptr-block">
        <h5>Nova transferência</h5>
        <form class="ptr-form" id="ptrForm" autocomplete="off">
          <div class="ptr-field">
            <label for="ptrColab">Colaborador (${esc(supervisoesOrigem.length > 1 ? 'suas supervisões' : supervisoesOrigem[0] || '—')})</label>
            <select id="ptrColab" required><option value="">Carregando...</option></select>
          </div>
          <div class="ptr-field">
            <label for="ptrDestino">Supervisão de destino</label>
            <select id="ptrDestino" required><option value="">Carregando...</option></select>
          </div>
          <div class="ptr-field full">
            <span class="ptr-label">Patrimônios do colaborador</span>
            <div class="ptr-patr" id="ptrPatr"><span class="ptr-meta">Selecione o colaborador.</span></div>
          </div>
          <div class="ptr-field full">
            <label for="ptrMotivo">Motivo (opcional)</label>
            <textarea id="ptrMotivo" rows="2" placeholder="Ex.: reforço de equipe na safra, mudança de cidade..."></textarea>
          </div>
          <div class="ptr-actions">
            <button type="submit" class="btn btn-primary" id="ptrEnviar">Solicitar transferência</button>
            <span class="ptr-fb" id="ptrFb"></span>
          </div>
        </form>
      </section>
      <section class="ptr-block">
        <h5>Histórico</h5>
        <div id="ptrHistorico"><div class="ptr-empty">Carregando...</div></div>
      </section>
    </div>
  `;

  document.getElementById('ptrModalRoot')?.remove();
  const modalEl = document.createElement('div');
  modalEl.id = 'ptrModalRoot';
  modalEl.className = 'ptr-modal';
  document.body.appendChild(modalEl);

  const el = {
    recebidas: content.querySelector('#ptrRecebidas'),
    recebidasCount: content.querySelector('#ptrRecebidasCount'),
    historico: content.querySelector('#ptrHistorico'),
    form: content.querySelector('#ptrForm'),
    colab: content.querySelector('#ptrColab'),
    destino: content.querySelector('#ptrDestino'),
    patr: content.querySelector('#ptrPatr'),
    motivo: content.querySelector('#ptrMotivo'),
    enviar: content.querySelector('#ptrEnviar'),
    fb: content.querySelector('#ptrFb'),
  };

  let colaboradores = [];
  let destinos = [];
  let transferirPatrimonios = null;
  let patrimoniosToken = 0;

  function setFb(text, tone = '') {
    el.fb.className = `ptr-fb ${tone}`;
    el.fb.textContent = text;
  }

  function colabSelecionado() {
    return colaboradores.find((c) => c.cpf === el.colab.value) || null;
  }

  function renderDestinos() {
    const origem = normalize(colabSelecionado()?.supervisao || (supervisoesOrigem.length === 1 ? supervisoesOrigem[0] : ''));
    const atual = el.destino.value;
    el.destino.innerHTML = '<option value="">Selecione...</option>'
      + destinos.filter((nome) => normalize(nome) !== origem)
        .map((nome) => `<option value="${esc(nome)}" ${nome === atual ? 'selected' : ''}>${esc(nome)}</option>`).join('');
  }

  function renderChoice(qtd) {
    const choice = `
      <div class="ptr-choice" role="radiogroup" aria-label="Transferir patrimônios">
        <button type="button" data-patr="S" class="${transferirPatrimonios === true ? 'on' : ''}">Sim, transferir junto</button>
        <button type="button" data-patr="N" class="${transferirPatrimonios === false ? 'on' : ''}">Não, ficam na supervisão atual</button>
      </div>`;
    return qtd
      ? `<div class="ptr-meta" style="margin-top:0">Os patrimônios serão transferidos também?</div>${choice}`
      : `<div class="ptr-meta" style="margin:0 0 8px">Nenhum patrimônio ativo no nome deste colaborador. Confirme mesmo assim:</div>${choice}`;
  }

  async function atualizarPatrimonios() {
    const colab = colabSelecionado();
    transferirPatrimonios = null;
    renderDestinos();
    if (!colab) {
      el.patr.innerHTML = '<span class="ptr-meta">Selecione o colaborador.</span>';
      return;
    }
    const token = ++patrimoniosToken;
    el.patr.innerHTML = '<span class="ptr-meta">Buscando patrimônios...</span>';
    try {
      const lista = await loadPatrimoniosColaborador(colab.nome);
      if (token !== patrimoniosToken) return;
      el.patr.dataset.qtd = String(lista.length);
      el.patr.innerHTML = (lista.length
        ? `<strong>${lista.length} patrimônio(s) no nome dele(a):</strong><ul class="ptr-patr-list">${lista.map((p) => `<li title="${esc(p.categoria || '')}">${esc(p.patrimonio_codigo)} · ${esc(p.identificacao || p.categoria || '')}</li>`).join('')}</ul>`
        : '') + renderChoice(lista.length);
    } catch (error) {
      if (token !== patrimoniosToken) return;
      el.patr.dataset.qtd = '0';
      el.patr.innerHTML = `<div class="ptr-erro" style="margin:0 0 8px">Não foi possível listar os patrimônios (${esc(rpcErrorMessage(error))}).</div>${renderChoice(0)}`;
    }
  }

  async function recarregarListas() {
    let lista;
    try {
      lista = await loadTransferencias();
    } catch (error) {
      el.recebidas.innerHTML = `<div class="ptr-empty">Erro ao carregar: ${esc(rpcErrorMessage(error))}</div>`;
      el.historico.innerHTML = '';
      return;
    }
    const minhas = minhasSupervisoes();
    const recebidas = lista.filter((t) => t.status === 'PENDENTE' && minhas.has(normalize(t.supervisao_destino)));
    const recebidasIds = new Set(recebidas.map((t) => t.id));
    const historico = lista.filter((t) => !recebidasIds.has(t.id));
    el.recebidasCount.textContent = String(recebidas.length);
    el.recebidas.innerHTML = recebidas.length
      ? recebidas.map((t) => cardHtml(t, minhas)).join('')
      : '<div class="ptr-empty">Nenhuma transferência aguardando seu aceite.</div>';
    el.historico.innerHTML = historico.length
      ? historico.map((t) => cardHtml(t, minhas)).join('')
      : '<div class="ptr-empty">Nenhuma transferência ainda.</div>';
    atualizarBadgeTransferencias(recebidas.length);
  }

  function fecharModal() { modalEl.classList.remove('open'); modalEl.innerHTML = ''; }

  function abrirModalRecusa(id) {
    const t = id;
    modalEl.innerHTML = `<div class="ptr-modal-card">
      <h3>Recusar transferência</h3>
      <p class="muted" style="margin:0">O gestor de origem recebe o motivo na central de notificações.</p>
      <textarea id="ptrMotivoRecusa" rows="3" placeholder="Motivo da recusa (obrigatório)"></textarea>
      <div class="ptr-modal-actions">
        <button type="button" class="btn btn-primary" id="ptrConfirmarRecusa">Recusar</button>
        <button type="button" class="btn btn-secondary" id="ptrFecharModal">Voltar</button>
      </div>
      <span class="ptr-fb err" id="ptrModalFb"></span>
    </div>`;
    modalEl.classList.add('open');
    modalEl.querySelector('#ptrMotivoRecusa').focus();
    modalEl.querySelector('#ptrFecharModal').onclick = fecharModal;
    modalEl.querySelector('#ptrConfirmarRecusa').onclick = async (event) => {
      const motivo = modalEl.querySelector('#ptrMotivoRecusa').value.trim();
      const fb = modalEl.querySelector('#ptrModalFb');
      if (!motivo) { fb.textContent = 'Informe o motivo.'; return; }
      event.currentTarget.disabled = true;
      const { error } = await supabase.rpc('programacao_transferencia_responder', { p_id: t, p_aceitar: false, p_motivo: motivo });
      if (error) {
        fb.textContent = rpcErrorMessage(error);
        event.currentTarget.disabled = false;
        return;
      }
      fecharModal();
      await recarregarListas();
    };
  }

  modalEl.addEventListener('click', (event) => { if (event.target === modalEl) fecharModal(); });

  async function executarAcao(btn) {
    const id = btn.dataset.id;
    const acao = btn.dataset.ptrAcao;
    if (acao === 'recusar') { abrirModalRecusa(id); return; }
    const confirmacoes = {
      aceitar: 'Aceitar a transferência? O agente vai mudar a supervisão do colaborador no GRM.',
      cancelar: 'Cancelar este pedido de transferência?',
      reenviar: 'Reenviar esta transferência para o agente do GRM?',
    };
    if (!window.confirm(confirmacoes[acao])) return;
    btn.disabled = true;
    const chamadas = {
      aceitar: () => supabase.rpc('programacao_transferencia_responder', { p_id: id, p_aceitar: true, p_motivo: null }),
      cancelar: () => supabase.rpc('programacao_transferencia_cancelar', { p_id: id }),
      reenviar: () => supabase.rpc('programacao_transferencia_reenviar_grm', { p_id: id }),
    };
    const { error } = await chamadas[acao]();
    if (error) {
      btn.disabled = false;
      window.alert(rpcErrorMessage(error));
      return;
    }
    await recarregarListas();
  }

  content.addEventListener('click', (event) => {
    const acaoBtn = event.target.closest('[data-ptr-acao]');
    if (acaoBtn && content.contains(acaoBtn)) { executarAcao(acaoBtn); return; }
    const patrBtn = event.target.closest('[data-patr]');
    if (patrBtn && el.patr.contains(patrBtn)) {
      transferirPatrimonios = patrBtn.dataset.patr === 'S';
      el.patr.querySelectorAll('[data-patr]').forEach((b) => b.classList.toggle('on', b === patrBtn));
    }
  });

  el.colab.addEventListener('change', () => { setFb(''); atualizarPatrimonios(); });

  el.form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const colab = colabSelecionado();
    if (!colab) { setFb('Selecione o colaborador.', 'err'); return; }
    if (!el.destino.value) { setFb('Selecione a supervisão de destino.', 'err'); return; }
    if (transferirPatrimonios === null) { setFb('Informe se os patrimônios serão transferidos.', 'err'); return; }
    el.enviar.disabled = true;
    setFb('Enviando...');
    const { error } = await supabase.rpc('programacao_transferencia_solicitar', {
      p_colaborador_cpf: colab.cpf,
      p_supervisao_destino: el.destino.value,
      p_transferir_patrimonios: transferirPatrimonios,
      p_motivo: el.motivo.value.trim() || null,
    });
    el.enviar.disabled = false;
    if (error) { setFb(rpcErrorMessage(error), 'err'); return; }
    setFb(`Pedido enviado. O gestor de ${el.destino.value} foi notificado.`, 'ok');
    el.colab.value = '';
    el.motivo.value = '';
    await atualizarPatrimonios();
    await recarregarListas();
  });

  // Atualiza sozinho quando a outra ponta responde ou o agente conclui.
  if (realtimeChannel) supabase.removeChannel(realtimeChannel);
  let rtTimer = null;
  realtimeChannel = supabase
    .channel('programacao_transferencias_rt')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'programacao_transferencias' }, () => {
      clearTimeout(rtTimer);
      rtTimer = setTimeout(() => { if (content.isConnected) recarregarListas(); }, 400);
    })
    .subscribe();

  const [colabsRes, destinosRes] = await Promise.allSettled([
    loadColaboradoresOrigem(supervisoesOrigem),
    loadSupervisoesDestino(),
    recarregarListas(),
  ]);
  colaboradores = colabsRes.status === 'fulfilled' ? colabsRes.value : [];
  destinos = destinosRes.status === 'fulfilled' ? destinosRes.value : [];
  const multi = supervisoesOrigem.length > 1;
  el.colab.innerHTML = colaboradores.length
    ? '<option value="">Selecione...</option>' + colaboradores
      .map((c) => `<option value="${esc(c.cpf)}">${esc(c.nome)}${c.cargo ? ` — ${esc(c.cargo)}` : ''}${multi ? ` (${esc(c.supervisao)})` : ''}</option>`).join('')
    : `<option value="">${colabsRes.status === 'rejected' ? 'Erro ao carregar colaboradores' : 'Nenhum colaborador ativo'}</option>`;
  renderDestinos();
  if (destinosRes.status === 'rejected') el.destino.innerHTML = '<option value="">Erro ao carregar supervisões</option>';
}
