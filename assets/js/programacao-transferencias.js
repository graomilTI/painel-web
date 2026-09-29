// Etapa 3 — Transferências: o gestor pede a transferência de um colaborador
// da sua supervisão para outra, dizendo se os patrimônios vão junto. O gestor
// da supervisão de destino é notificado (central + push) e aceita ou recusa
// aqui. Aceita => o agente sync-transferir-colaborador troca a Supervisão no
// cadastro do GRM (grmserver-transferir-colaborador-api.js).
// Regras e permissões ficam nas RPCs programacao_transferencia_* (migration
// 20260926120000_programacao_transferencias.sql); esta tela só as chama.
//
// Layout (27/09): cabeçalho com "Nova transferência" (formulário em modal),
// filtros Para aceitar / Enviadas / Todas + busca, e lista compacta com um
// único status por linha; detalhes abrem ao clicar na linha.
import { supabase } from './supabaseClient.js';

const TODAS_SUPERVISOES = '__TODAS__';

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

function formatDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit' });
}

function iniciais(nome) {
  const partes = String(nome || '').trim().split(/\s+/).filter(Boolean);
  return ((partes[0]?.[0] || '') + (partes.length > 1 ? partes[partes.length - 1][0] : '')).toUpperCase() || '?';
}

function rpcErrorMessage(error) {
  return String(error?.message || error || 'Erro inesperado.').replace(/^.*?ERROR:\s*/i, '');
}

// Um status só por linha, juntando o aceite e o andamento no GRM.
function statusInfo(t) {
  if (t.status === 'PENDENTE') return { label: 'Aguardando aceite', cls: 'wait' };
  if (t.status === 'RECUSADA') return { label: 'Recusada', cls: 'err' };
  if (t.status === 'CANCELADA') return { label: 'Cancelada', cls: 'off' };
  if (t.grm_status === 'APLICADA') return { label: 'Concluída', cls: 'ok' };
  if (t.grm_status === 'ERRO') return { label: 'Erro no GRM', cls: 'err' };
  return { label: 'Atualizando GRM', cls: 'info' };
}

function todayIso() {
  const n = new Date();
  return new Date(n.getTime() - n.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

// Data pura (YYYY-MM-DD) -> dd/mm/aaaa, sem passar por fuso.
function formatDateIso(iso) {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
}

// Colaborador transferido que ainda não chegou (bloqueado na Programação).
function aguardandoChegada(t) {
  return t.status === 'ACEITA' && t.em_deslocamento && !t.chegada_confirmada_em
    && String(t.chegada_prevista || '') > todayIso();
}

function patrimoniosResumo(t) {
  const qtd = Array.isArray(t.patrimonios) ? t.patrimonios.length : 0;
  if (!qtd) return 'Sem patrimônios';
  return `${qtd} patrimônio${qtd > 1 ? 's' : ''} ${t.transferir_patrimonios ? 'vão junto' : 'ficam'}`;
}

function injectStyles() {
  if (document.getElementById('progTransferenciasStyles')) return;
  const style = document.createElement('style');
  style.id = 'progTransferenciasStyles';
  style.textContent = `
    .ptr{display:flex;flex-direction:column;gap:14px}
    .ptr-head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;flex-wrap:wrap}
    .ptr-head h4{margin:0;font-size:17px;color:#f8fafc}
    .ptr-head p{margin:4px 0 0;font-size:12.5px;color:#94a3b8;max-width:620px;line-height:1.45}
    .ptr-new{white-space:nowrap}
    .ptr-toolbar{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}
    .ptr-tabs{display:inline-flex;padding:3px;border-radius:12px;background:rgba(15,23,42,.55);border:1px solid rgba(148,163,184,.14);gap:2px}
    .ptr-tab{border:0;background:transparent;color:#94a3b8;font-size:12.5px;font-weight:800;padding:7px 13px;border-radius:9px;cursor:pointer;display:inline-flex;align-items:center;gap:6px}
    .ptr-tab:hover{color:#e2e8f0}
    .ptr-tab.on{background:rgba(52,211,153,.14);color:#d1fae5}
    .ptr-tab .ptr-n{font-size:10.5px;min-width:18px;height:18px;padding:0 5px;border-radius:999px;display:inline-flex;align-items:center;justify-content:center;background:rgba(148,163,184,.16);color:#cbd5e1}
    .ptr-tab .ptr-n.hot{background:#f59e0b;color:#1c1917}
    .ptr-search{min-height:36px;width:min(260px,100%);padding:7px 12px;border-radius:10px;border:1px solid rgba(148,163,184,.2);background:rgba(2,6,23,.45);color:#e2e8f0;font-size:13px;box-sizing:border-box}
    .ptr-list{border:1px solid rgba(148,163,184,.14);border-radius:14px;overflow:hidden;background:rgba(2,6,23,.22)}
    .ptr-row{border-top:1px solid rgba(148,163,184,.1)}
    .ptr-row:first-child{border-top:0}
    .ptr-row.mine{box-shadow:inset 3px 0 0 #f59e0b}
    .ptr-line{display:grid;grid-template-columns:minmax(200px,1.3fr) minmax(220px,1.6fr) 140px auto;gap:14px;align-items:center;padding:11px 14px;cursor:pointer}
    .ptr-line:hover{background:rgba(148,163,184,.05)}
    .ptr-who{display:flex;align-items:center;gap:10px;min-width:0}
    .ptr-av{width:32px;height:32px;border-radius:999px;flex:0 0 auto;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:11.5px;background:rgba(52,211,153,.12);color:#a7f3d0}
    .ptr-name{font-weight:800;color:#f8fafc;font-size:13.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .ptr-sub{font-size:11.5px;color:#94a3b8;margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .ptr-route{display:flex;align-items:center;gap:8px;min-width:0;font-size:12.5px;color:#cbd5e1}
    .ptr-route span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .ptr-route b{color:#f8fafc;font-weight:800}
    .ptr-arrow{color:#64748b;flex:0 0 auto}
    .ptr-pill{display:inline-flex;align-items:center;gap:6px;font-size:11.5px;font-weight:800;color:#cbd5e1;white-space:nowrap}
    .ptr-pill::before{content:"";width:7px;height:7px;border-radius:999px;background:#94a3b8}
    .ptr-pill.wait::before{background:#f59e0b}
    .ptr-pill.ok::before{background:#22c55e}
    .ptr-pill.err::before{background:#ef4444}
    .ptr-pill.info::before{background:#60a5fa}
    .ptr-pill.off{color:#64748b}
    .ptr-acts{display:flex;gap:6px;justify-content:flex-end;flex-wrap:wrap}
    .ptr-btn{border-radius:9px;padding:6px 12px;font-size:12px;font-weight:800;cursor:pointer;border:1px solid transparent;white-space:nowrap;background:transparent}
    .ptr-btn[disabled]{opacity:.55;cursor:default}
    .ptr-btn.pri{background:#10b981;color:#052e1c}
    .ptr-btn.pri:hover{background:#34d399}
    .ptr-btn.ghost{color:#cbd5e1;border-color:rgba(148,163,184,.3)}
    .ptr-btn.ghost:hover{border-color:rgba(148,163,184,.55)}
    .ptr-btn.danger{color:#fca5a5;border-color:rgba(248,113,113,.35)}
    .ptr-detail{display:none;padding:0 14px 12px 56px;font-size:12px;color:#94a3b8;line-height:1.6}
    .ptr-row.open .ptr-detail{display:block}
    .ptr-detail dl{display:grid;grid-template-columns:max-content 1fr;gap:2px 14px;margin:0}
    .ptr-detail dt{color:#64748b}
    .ptr-detail dd{margin:0;color:#cbd5e1}
    .ptr-detail .err{color:#fca5a5}
    .ptr-empty{padding:28px 16px;text-align:center;color:#94a3b8;font-size:13px}
    .ptr-modal{position:fixed;inset:0;background:rgba(2,6,23,.72);z-index:9999;display:none;align-items:center;justify-content:center;padding:18px}
    .ptr-modal.open{display:flex}
    .ptr-card{width:min(520px,100%);max-height:calc(100vh - 36px);overflow:auto;background:#0f172a;border:1px solid rgba(148,163,184,.16);border-radius:18px;padding:22px;color:#e2e8f0;box-sizing:border-box}
    .ptr-card h3{margin:0;font-size:17px}
    .ptr-card .ptr-hint{margin:4px 0 16px;font-size:12.5px;color:#94a3b8}
    .ptr-field{display:flex;flex-direction:column;gap:6px;margin-bottom:14px}
    .ptr-field > label,.ptr-field > .ptr-lbl{font-size:12px;font-weight:800;color:#cbd5e1}
    .ptr-field select,.ptr-field textarea{min-height:40px;padding:8px 11px;border-radius:10px;border:1px solid rgba(148,163,184,.24);background:#020617;color:#e2e8f0;font-size:13px;width:100%;box-sizing:border-box}
    .ptr-field textarea{resize:vertical;min-height:64px}
    .ptr-seg{display:grid;grid-template-columns:1fr 1fr;gap:6px}
    .ptr-seg button{border:1px solid rgba(148,163,184,.24);background:transparent;color:#94a3b8;border-radius:10px;padding:9px 10px;font-size:12.5px;font-weight:800;cursor:pointer}
    .ptr-seg button.on{border-color:#10b981;background:rgba(16,185,129,.14);color:#d1fae5}
    .ptr-seg button[disabled]{opacity:.45;cursor:default}
    .ptr-patr-note{font-size:12px;color:#94a3b8}
    .ptr-patr-note summary{cursor:pointer;color:#a7f3d0;font-weight:700}
    .ptr-patr-list{margin:8px 0 0;padding:0;list-style:none;display:flex;flex-direction:column;gap:3px;max-height:150px;overflow:auto}
    .ptr-patr-list li{font-size:12px;color:#cbd5e1}
    .ptr-patr-list li b{color:#f8fafc;margin-right:6px}
    .ptr-card-foot{display:flex;align-items:center;justify-content:flex-end;gap:10px;margin-top:6px;flex-wrap:wrap}
    .ptr-tag{display:inline-flex;align-items:center;gap:4px;margin-left:8px;padding:1px 8px;border-radius:999px;font-size:10.5px;font-weight:800;background:rgba(245,158,11,.14);color:#fde68a;border:1px solid rgba(245,158,11,.35);vertical-align:middle;white-space:nowrap}
    .ptr-desloc{border:1px solid rgba(245,158,11,.3);background:rgba(120,53,15,.16);border-radius:12px;padding:11px 12px;margin-bottom:14px}
    .ptr-desloc label.ptr-check{display:flex;align-items:flex-start;gap:8px;font-size:12.5px;font-weight:800;color:#fde68a;cursor:pointer}
    .ptr-desloc input[type=date]{margin-top:10px;min-height:38px;padding:7px 10px;border-radius:10px;border:1px solid rgba(148,163,184,.24);background:#020617;color:#e2e8f0;font-size:13px;width:100%;box-sizing:border-box;color-scheme:dark}
    .ptr-desloc small{display:block;margin-top:6px;font-size:11.5px;color:#cbd5e1;line-height:1.4}
    .ptr-fb{font-size:12.5px;font-weight:700;margin-right:auto}
    .ptr-fb.err{color:#fca5a5}
    .ptr-fb.ok{color:#86efac}
    .ptr-toast{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);background:#065f46;color:#ecfdf5;padding:10px 16px;border-radius:12px;font-size:13px;font-weight:700;z-index:10000;box-shadow:0 10px 30px rgba(0,0,0,.35)}
    @media(max-width:860px){
      .ptr-line{grid-template-columns:1fr auto;gap:8px 12px}
      .ptr-route{grid-column:1 / -1;order:3}
      .ptr-pill{order:2;justify-self:end}
      .ptr-acts{grid-column:1 / -1;order:4;justify-content:flex-start}
      .ptr-detail{padding-left:14px}
      .ptr-search{width:100%}
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

// Todas as supervisões ativas (não só as liberadas do usuário): quem decide é
// o gestor de destino. Não usa from('supervisoes') porque na Programação essa
// consulta é interceptada e devolve só as supervisões liberadas.
async function loadSupervisoesDestino() {
  const { data, error } = await supabase.rpc('programacao_transferencia_destinos');
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

function rowHtml(t, minhas, aberta) {
  const souDestino = minhas.has(normalize(t.supervisao_destino));
  const souOrigem = minhas.has(normalize(t.supervisao_origem));
  const pendente = t.status === 'PENDENTE';
  const st = statusInfo(t);
  const acoes = [];
  if (pendente && souDestino) {
    acoes.push(`<button type="button" class="ptr-btn pri" data-ptr-acao="aceitar" data-id="${esc(t.id)}">Aceitar</button>`);
    acoes.push(`<button type="button" class="ptr-btn danger" data-ptr-acao="recusar" data-id="${esc(t.id)}">Recusar</button>`);
  } else if (pendente && souOrigem) {
    acoes.push(`<button type="button" class="ptr-btn ghost" data-ptr-acao="cancelar" data-id="${esc(t.id)}">Cancelar</button>`);
  }
  if (aguardandoChegada(t) && souDestino) {
    acoes.push(`<button type="button" class="ptr-btn pri" data-ptr-acao="chegada" data-id="${esc(t.id)}">Confirmar chegada</button>`);
  }
  if (t.status === 'ACEITA' && t.grm_status === 'ERRO') {
    acoes.push(`<button type="button" class="ptr-btn ghost" data-ptr-acao="reenviar" data-id="${esc(t.id)}">Reenviar ao GRM</button>`);
  }
  const detalhes = [
    ['Pedido', `${esc(t.solicitado_por_nome || '—')} · ${esc(formatDateTime(t.solicitado_em))}`],
    t.respondido_em && [t.status === 'CANCELADA' ? 'Cancelado' : 'Resposta', `${esc(t.respondido_por_nome || '—')} · ${esc(formatDateTime(t.respondido_em))}`],
    ['Patrimônios', esc(patrimoniosResumo(t)) + (t.transferir_patrimonios || !t.patrimonios?.length ? '' : ' na origem')],
    t.em_deslocamento && ['Deslocamento', t.chegada_confirmada_em
      ? `Chegada confirmada por ${esc(t.chegada_confirmada_por_nome || '—')} · ${esc(formatDateTime(t.chegada_confirmada_em))}`
      : `Chegada prevista em ${esc(formatDateIso(t.chegada_prevista))} — até lá não pode ser escalado em O.S.`],
    t.motivo && ['Motivo', esc(t.motivo)],
    t.motivo_recusa && ['Recusa', `<span class="err">${esc(t.motivo_recusa)}</span>`],
    t.grm_aplicado_em && ['GRM', `Atualizado em ${esc(formatDateTime(t.grm_aplicado_em))}`],
    t.grm_status === 'ERRO' && t.grm_erro && ['Erro', `<span class="err">${esc(t.grm_erro)}</span>`],
  ].filter(Boolean);
  return `
    <div class="ptr-row ${pendente && souDestino ? 'mine' : ''} ${aberta ? 'open' : ''}" data-row="${esc(t.id)}">
      <div class="ptr-line">
        <div class="ptr-who">
          <div class="ptr-av">${esc(iniciais(t.colaborador_nome))}</div>
          <div style="min-width:0">
            <div class="ptr-name">${esc(t.colaborador_nome)}${aguardandoChegada(t) ? `<span class="ptr-tag" title="Ainda não chegou na supervisão de destino">🚚 chega ${esc(formatDateIso(t.chegada_prevista).slice(0, 5))}</span>` : ''}</div>
            <div class="ptr-sub">${esc([t.colaborador_cargo, formatDate(t.solicitado_em)].filter(Boolean).join(' · '))}</div>
          </div>
        </div>
        <div class="ptr-route"><span>${esc(t.supervisao_origem)}</span><span class="ptr-arrow">→</span><span><b>${esc(t.supervisao_destino)}</b></span></div>
        <span class="ptr-pill ${st.cls}">${esc(st.label)}</span>
        <div class="ptr-acts">${acoes.join('')}</div>
      </div>
      <div class="ptr-detail"><dl>${detalhes.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl></div>
    </div>`;
}

export function atualizarBadgeTransferencias(qtd) {
  const btn = document.querySelector('#progSteps .stepbtn[data-ui-step="3"]');
  if (!btn) return;
  let badge = btn.querySelector('.ptr-step-badge');
  if (!qtd) { badge?.remove(); return; }
  if (!badge) {
    badge = document.createElement('span');
    badge.className = 'ptr-step-badge';
    badge.style.cssText = 'margin-left:6px;min-width:18px;height:18px;padding:0 5px;border-radius:999px;display:inline-flex;align-items:center;justify-content:center;font-size:10.5px;font-weight:900;background:#f59e0b;color:#1c1917';
    btn.appendChild(badge);
  }
  badge.textContent = String(qtd);
}

function toast(text) {
  const el = document.createElement('div');
  el.className = 'ptr-toast';
  el.textContent = text;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

let realtimeChannel = null;

export async function renderProgramacaoTransferencias(content, options = {}) {
  injectStyles();
  const supervisao = String(options.supervisao || '').trim();
  const supervisoesOrigem = (options.supervisoesResolvidas?.length ? options.supervisoesResolvidas : [supervisao])
    .filter((s) => s && s !== TODAS_SUPERVISOES);

  content.innerHTML = `
    <div class="ptr">
      <div class="ptr-head">
        <div>
          <h4>Transferências</h4>
          <p>Mova colaboradores entre supervisões. O gestor de destino aceita ou recusa, e o GRM é atualizado automaticamente depois do aceite.</p>
        </div>
        <button type="button" class="btn btn-primary ptr-new" id="ptrNova">+ Nova transferência</button>
      </div>
      <div class="ptr-toolbar">
        <div class="ptr-tabs" role="tablist">
          <button type="button" class="ptr-tab" data-filtro="aceitar">Para aceitar <span class="ptr-n" id="ptrNAceitar">0</span></button>
          <button type="button" class="ptr-tab" data-filtro="enviadas">Enviadas <span class="ptr-n" id="ptrNEnviadas">0</span></button>
          <button type="button" class="ptr-tab" data-filtro="todas">Todas</button>
        </div>
        <input type="search" class="ptr-search" id="ptrBusca" placeholder="Buscar colaborador ou supervisão">
      </div>
      <div class="ptr-list" id="ptrLista"><div class="ptr-empty">Carregando...</div></div>
    </div>
  `;

  document.getElementById('ptrModalRoot')?.remove();
  const modalEl = document.createElement('div');
  modalEl.id = 'ptrModalRoot';
  modalEl.className = 'ptr-modal';
  document.body.appendChild(modalEl);

  const listaEl = content.querySelector('#ptrLista');
  const buscaEl = content.querySelector('#ptrBusca');

  let colaboradores = [];
  let destinos = [];
  let dadosProntos = null;
  let transferencias = [];
  let filtro = null;
  const abertas = new Set();

  function grupos() {
    const minhas = minhasSupervisoes();
    const aceitar = transferencias.filter((t) => t.status === 'PENDENTE' && minhas.has(normalize(t.supervisao_destino)));
    const enviadas = transferencias.filter((t) => minhas.has(normalize(t.supervisao_origem)) && !aceitar.includes(t));
    return { minhas, aceitar, enviadas, todas: transferencias };
  }

  function renderLista() {
    const g = grupos();
    if (!filtro) filtro = g.aceitar.length ? 'aceitar' : 'todas';
    const nAceitar = content.querySelector('#ptrNAceitar');
    nAceitar.textContent = String(g.aceitar.length);
    nAceitar.classList.toggle('hot', g.aceitar.length > 0);
    content.querySelector('#ptrNEnviadas').textContent = String(g.enviadas.filter((t) => t.status === 'PENDENTE').length);
    content.querySelectorAll('.ptr-tab').forEach((tab) => tab.classList.toggle('on', tab.dataset.filtro === filtro));
    atualizarBadgeTransferencias(g.aceitar.length);

    const termo = normalize(buscaEl.value);
    const itens = g[filtro].filter((t) => !termo
      || normalize(`${t.colaborador_nome} ${t.supervisao_origem} ${t.supervisao_destino}`).includes(termo));
    const vazio = {
      aceitar: 'Nenhuma transferência aguardando seu aceite.',
      enviadas: 'Você ainda não pediu nenhuma transferência.',
      todas: 'Nenhuma transferência ainda.',
    };
    listaEl.innerHTML = itens.length
      ? itens.map((t) => rowHtml(t, g.minhas, abertas.has(t.id))).join('')
      : `<div class="ptr-empty">${termo ? 'Nada encontrado para essa busca.' : vazio[filtro]}</div>`;
  }

  async function recarregarListas() {
    try {
      transferencias = await loadTransferencias();
    } catch (error) {
      listaEl.innerHTML = `<div class="ptr-empty">Erro ao carregar: ${esc(rpcErrorMessage(error))}</div>`;
      return;
    }
    renderLista();
  }

  function fecharModal() { modalEl.classList.remove('open'); modalEl.innerHTML = ''; }
  modalEl.addEventListener('click', (event) => { if (event.target === modalEl) fecharModal(); });
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && modalEl.classList.contains('open')) fecharModal(); });

  function abrirModalRecusa(id) {
    modalEl.innerHTML = `<div class="ptr-card" role="dialog" aria-modal="true" aria-label="Recusar transferência">
      <h3>Recusar transferência</h3>
      <p class="ptr-hint">Quem pediu recebe o motivo na central de notificações.</p>
      <div class="ptr-field">
        <label for="ptrMotivoRecusa">Motivo</label>
        <textarea id="ptrMotivoRecusa" rows="3" placeholder="Obrigatório"></textarea>
      </div>
      <div class="ptr-card-foot">
        <span class="ptr-fb err" id="ptrModalFb"></span>
        <button type="button" class="ptr-btn ghost" data-fechar>Voltar</button>
        <button type="button" class="ptr-btn pri" id="ptrConfirmarRecusa" style="background:#ef4444;color:#fff">Recusar</button>
      </div>
    </div>`;
    modalEl.classList.add('open');
    modalEl.querySelector('#ptrMotivoRecusa').focus();
    modalEl.querySelector('[data-fechar]').onclick = fecharModal;
    modalEl.querySelector('#ptrConfirmarRecusa').onclick = async (event) => {
      const btn = event.currentTarget;
      const motivo = modalEl.querySelector('#ptrMotivoRecusa').value.trim();
      const fb = modalEl.querySelector('#ptrModalFb');
      if (!motivo) { fb.textContent = 'Informe o motivo.'; return; }
      btn.disabled = true;
      const { error } = await supabase.rpc('programacao_transferencia_responder', { p_id: id, p_aceitar: false, p_motivo: motivo });
      if (error) { fb.textContent = rpcErrorMessage(error); btn.disabled = false; return; }
      fecharModal();
      toast('Transferência recusada.');
      await recarregarListas();
    };
  }

  async function abrirModalNova(cpfPreSelecionado = '', opcoes = {}) {
    modalEl.innerHTML = `<div class="ptr-card" role="dialog" aria-modal="true" aria-label="Nova transferência">
      <h3>Nova transferência</h3>
      <p class="ptr-hint">O gestor da supervisão de destino será avisado para aceitar ou recusar.</p>
      <form id="ptrForm" autocomplete="off">
        <div class="ptr-field">
          <label for="ptrColab">Colaborador</label>
          <select id="ptrColab"><option value="">Carregando...</option></select>
        </div>
        <div class="ptr-field">
          <label for="ptrDestino">Supervisão de destino</label>
          <select id="ptrDestino"><option value="">Carregando...</option></select>
        </div>
        <div class="ptr-field">
          <span class="ptr-lbl">Os patrimônios vão junto?</span>
          <div class="ptr-seg" role="radiogroup">
            <button type="button" data-patr="S" disabled>Sim, transferir</button>
            <button type="button" data-patr="N" disabled>Não, ficam na origem</button>
          </div>
          <div class="ptr-patr-note" id="ptrPatr">Selecione o colaborador para ver os patrimônios.</div>
        </div>
        <div class="ptr-desloc">
          <label class="ptr-check"><input type="checkbox" id="ptrDesloc"> <span>Colaborador em deslocamento — ainda não chegou na supervisão de destino</span></label>
          <div id="ptrDeslocData" hidden>
            <input type="date" id="ptrChegada" min="${todayIso()}" aria-label="Data prevista de chegada">
            <small>Até essa data (ou até o gestor de destino confirmar a chegada) o colaborador não poderá ser escalado em O.S. na programação do destino.</small>
          </div>
        </div>
        <div class="ptr-field">
          <label for="ptrMotivo">Motivo <span style="color:#64748b;font-weight:600">(opcional)</span></label>
          <textarea id="ptrMotivo" rows="2" placeholder="Ex.: reforço de equipe na safra"></textarea>
        </div>
        <div class="ptr-card-foot">
          <span class="ptr-fb" id="ptrFb"></span>
          <button type="button" class="ptr-btn ghost" data-fechar>Cancelar</button>
          <button type="submit" class="ptr-btn pri" id="ptrEnviar">Solicitar</button>
        </div>
      </form>
    </div>`;
    modalEl.classList.add('open');

    const f = {
      form: modalEl.querySelector('#ptrForm'),
      colab: modalEl.querySelector('#ptrColab'),
      destino: modalEl.querySelector('#ptrDestino'),
      patr: modalEl.querySelector('#ptrPatr'),
      seg: [...modalEl.querySelectorAll('[data-patr]')],
      motivo: modalEl.querySelector('#ptrMotivo'),
      desloc: modalEl.querySelector('#ptrDesloc'),
      deslocData: modalEl.querySelector('#ptrDeslocData'),
      chegada: modalEl.querySelector('#ptrChegada'),
      enviar: modalEl.querySelector('#ptrEnviar'),
      fb: modalEl.querySelector('#ptrFb'),
    };
    let transferirPatrimonios = null;
    let patrimoniosToken = 0;
    const setFb = (text, tone = '') => { f.fb.className = `ptr-fb ${tone}`; f.fb.textContent = text; };
    const colabSelecionado = () => colaboradores.find((c) => c.cpf === f.colab.value) || null;

    modalEl.querySelector('[data-fechar]').onclick = fecharModal;

    function renderDestinos() {
      const origem = normalize(colabSelecionado()?.supervisao || (supervisoesOrigem.length === 1 ? supervisoesOrigem[0] : ''));
      const atual = f.destino.value;
      f.destino.innerHTML = '<option value="">Selecione...</option>'
        + destinos.filter((nome) => normalize(nome) !== origem)
          .map((nome) => `<option value="${esc(nome)}" ${nome === atual ? 'selected' : ''}>${esc(nome)}</option>`).join('');
    }

    function setSeg(valor) {
      transferirPatrimonios = valor;
      f.seg.forEach((b) => b.classList.toggle('on', valor !== null && (b.dataset.patr === 'S') === valor));
    }

    async function atualizarPatrimonios() {
      const colab = colabSelecionado();
      setSeg(null);
      renderDestinos();
      f.seg.forEach((b) => { b.disabled = !colab; });
      if (!colab) { f.patr.textContent = 'Selecione o colaborador para ver os patrimônios.'; return; }
      const token = ++patrimoniosToken;
      f.patr.textContent = 'Buscando patrimônios...';
      try {
        const lista = await loadPatrimoniosColaborador(colab.nome);
        if (token !== patrimoniosToken) return;
        f.patr.innerHTML = lista.length
          ? `<details><summary>${lista.length} patrimônio${lista.length > 1 ? 's' : ''} no nome do colaborador</summary><ul class="ptr-patr-list">${lista.map((p) => `<li><b>${esc(p.patrimonio_codigo)}</b>${esc(p.identificacao || p.categoria || '')}</li>`).join('')}</ul></details>`
          : 'Nenhum patrimônio ativo no nome do colaborador.';
      } catch (error) {
        if (token !== patrimoniosToken) return;
        f.patr.textContent = `Não foi possível listar os patrimônios (${rpcErrorMessage(error)}).`;
      }
    }

    f.seg.forEach((b) => b.addEventListener('click', () => setSeg(b.dataset.patr === 'S')));
    const syncDesloc = () => { f.deslocData.hidden = !f.desloc.checked; };
    f.desloc.addEventListener('change', syncDesloc);
    f.desloc.checked = !!opcoes.deslocamento;
    syncDesloc();
    f.colab.addEventListener('change', () => { setFb(''); atualizarPatrimonios(); });

    f.form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const colab = colabSelecionado();
      if (!colab) { setFb('Selecione o colaborador.', 'err'); return; }
      if (!f.destino.value) { setFb('Selecione a supervisão de destino.', 'err'); return; }
      if (transferirPatrimonios === null) { setFb('Diga se os patrimônios vão junto.', 'err'); return; }
      const emDeslocamento = f.desloc.checked;
      if (emDeslocamento && !f.chegada.value) { setFb('Informe a data prevista de chegada.', 'err'); return; }
      if (emDeslocamento && f.chegada.value < todayIso()) { setFb('A data de chegada não pode ser no passado.', 'err'); return; }
      f.enviar.disabled = true;
      setFb('Enviando...');
      const destino = f.destino.value;
      const { error } = await supabase.rpc('programacao_transferencia_solicitar', {
        p_colaborador_cpf: colab.cpf,
        p_supervisao_destino: destino,
        p_transferir_patrimonios: transferirPatrimonios,
        p_motivo: f.motivo.value.trim() || null,
        p_em_deslocamento: emDeslocamento,
        p_chegada_prevista: emDeslocamento ? f.chegada.value : null,
      });
      if (error) { f.enviar.disabled = false; setFb(rpcErrorMessage(error), 'err'); return; }
      fecharModal();
      toast(`Pedido enviado. O gestor de ${destino} foi avisado.`);
      filtro = 'enviadas';
      await recarregarListas();
    });

    const ok = await dadosProntos;
    if (!modalEl.contains(f.colab)) return;
    const multi = supervisoesOrigem.length > 1;
    f.colab.innerHTML = colaboradores.length
      ? '<option value="">Selecione...</option>' + colaboradores
        .map((c) => `<option value="${esc(c.cpf)}">${esc(c.nome)}${c.cargo ? ` — ${esc(c.cargo)}` : ''}${multi ? ` (${esc(c.supervisao)})` : ''}</option>`).join('')
      : `<option value="">${ok.colabErro ? 'Erro ao carregar colaboradores' : 'Nenhum colaborador ativo'}</option>`;
    if (ok.destinoErro) f.destino.innerHTML = '<option value="">Erro ao carregar supervisões</option>';
    else renderDestinos();
    // Vindo do Sem O.S. (Deslocamento): colaborador já escolhido. Se ele não
    // estiver na lista (ex.: cadastro sem CPF), fica em "Selecione...".
    const cpfAlvo = String(cpfPreSelecionado || '').replace(/\D/g, '');
    if (cpfAlvo && colaboradores.some((c) => c.cpf === cpfAlvo)) {
      f.colab.value = cpfAlvo;
      atualizarPatrimonios();
    }
  }

  // Chamado pelo Sem O.S.: leva pra aba Transferências e abre o pedido.
  window.__pgcAbrirTransferencia = (cpf, opcoes = {}) => {
    document.querySelector('#progSteps .stepbtn[data-ui-step="3"]')?.click();
    return abrirModalNova(cpf, opcoes);
  };

  async function executarAcao(btn) {
    const id = btn.dataset.id;
    const acao = btn.dataset.ptrAcao;
    if (acao === 'recusar') { abrirModalRecusa(id); return; }
    const confirmacoes = {
      cancelar: 'Cancelar este pedido de transferência?',
      reenviar: 'Reenviar esta transferência para o agente do GRM?',
      chegada: 'Confirmar que o colaborador já chegou? Ele passa a poder ser escalado em O.S. na sua programação.',
    };
    // Aceitar não pede confirmação: o botão já é a decisão do gestor de destino.
    if (confirmacoes[acao] && !window.confirm(confirmacoes[acao])) return;
    btn.disabled = true;
    const chamadas = {
      aceitar: () => supabase.rpc('programacao_transferencia_responder', { p_id: id, p_aceitar: true, p_motivo: null }),
      cancelar: () => supabase.rpc('programacao_transferencia_cancelar', { p_id: id }),
      reenviar: () => supabase.rpc('programacao_transferencia_reenviar_grm', { p_id: id }),
      chegada: () => supabase.rpc('programacao_transferencia_confirmar_chegada', { p_id: id }),
    };
    const { error } = await chamadas[acao]();
    if (error) {
      btn.disabled = false;
      window.alert(rpcErrorMessage(error));
      return;
    }
    toast({ aceitar: 'Transferência aceita. O GRM será atualizado.', cancelar: 'Pedido cancelado.', reenviar: 'Reenviado ao GRM.', chegada: 'Chegada confirmada. O colaborador já pode ser escalado.' }[acao]);
    await recarregarListas();
  }

  content.addEventListener('click', (event) => {
    const acaoBtn = event.target.closest('[data-ptr-acao]');
    if (acaoBtn && content.contains(acaoBtn)) { executarAcao(acaoBtn); return; }
    const tab = event.target.closest('.ptr-tab');
    if (tab) { filtro = tab.dataset.filtro; renderLista(); return; }
    if (event.target.closest('#ptrNova')) { abrirModalNova(); return; }
    const line = event.target.closest('.ptr-line');
    if (line) {
      const row = line.closest('.ptr-row');
      const id = row.dataset.row;
      if (abertas.has(id)) abertas.delete(id); else abertas.add(id);
      row.classList.toggle('open', abertas.has(id));
    }
  });
  buscaEl.addEventListener('input', renderLista);

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

  // Colaboradores/destinos só são usados no modal: carregam em paralelo com a
  // lista e o modal espera por eles se abrir antes.
  dadosProntos = Promise.allSettled([loadColaboradoresOrigem(supervisoesOrigem), loadSupervisoesDestino()])
    .then(([colabsRes, destinosRes]) => {
      colaboradores = colabsRes.status === 'fulfilled' ? colabsRes.value : [];
      destinos = destinosRes.status === 'fulfilled' ? destinosRes.value : [];
      return { colabErro: colabsRes.status === 'rejected', destinoErro: destinosRes.status === 'rejected' };
    });

  await recarregarListas();
}
