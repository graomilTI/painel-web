import { initProtectedPage } from './pageInit.js';
import { supabase } from './supabaseClient.js';
import {
  esc, pageHeader, tabs, badge, loadingState, emptyState, errorState,
  table, toast,
} from './core/ui.js';
import { brDate, statusLabel, preferenciaLabel } from './adm-hotel-helpers.js';
import { getColaboradores } from './colaboradoresCache.js';

const UFS = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];

const state = {
  ctx: null,
  tab: 'nova',
  supervisoes: [],
  colaboradoresEquipe: [],
  selecionados: new Map(), // id/cpf/nome -> colaborador
  buscaColaborador: '',
  solicitacoes: [],
  solicitacoesStatus: 'idle', // idle | loading | loaded | error
  enviando: false,
};

function usuario() { return state.ctx?.user || {}; }

function norm(v) {
  return String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

async function safe(fn, fallback) {
  try {
    const { data, error } = await fn();
    if (error) throw error;
    return data ?? fallback;
  } catch (e) {
    console.warn('[hospedagem]', e);
    return fallback;
  }
}

// ---------- Escopo do gestor (mesma RPC já usada em Programação/Logística/Compras) ----------
async function carregarSupervisoesGestor() {
  const rows = await safe(() => supabase.rpc('programacao_listar_supervisoes'), []);
  state.supervisoes = (rows || []).map((r) => norm(r.nome)).filter(Boolean);
}

async function carregarColaboradoresEquipe() {
  const todos = await getColaboradores({ somenteAtivos: true });
  if (!state.supervisoes.length) { state.colaboradoresEquipe = []; return; }
  state.colaboradoresEquipe = todos.filter((c) => {
    const sup = norm(c.supervisao);
    if (!sup) return false;
    return state.supervisoes.some((g) => sup.includes(g) || g.includes(sup));
  });
}

function colaboradorChave(c) {
  return c.id || c.cpf || c.nome;
}

// ---------- "Minhas solicitações" ----------
async function carregarMinhasSolicitacoes() {
  state.solicitacoesStatus = 'loading';
  renderTabActive();
  const myId = usuario().id;
  const { data, error } = await supabase
    .from('hospedagem_minhas_solicitacoes')
    .select('*')
    .eq('solicitante_id', myId)
    .order('data_solicitacao', { ascending: false })
    .limit(200);
  if (error) {
    console.warn('[hospedagem] minhas solicitações:', error);
    state.solicitacoesStatus = 'error';
    renderTabActive();
    return;
  }
  state.solicitacoes = data || [];
  state.solicitacoesStatus = 'loaded';
  renderTabActive();
}

function statusBadge(row) {
  const s = row.status_solicitacao;
  if (s === 'CANCELADA') return badge(statusLabel(row), 'danger');
  if (s === 'CONCLUIDA' || s === 'RESERVADA') return badge(statusLabel(row), 'ok');
  return badge(statusLabel(row), 'warn');
}

function renderMinhasSolicitacoes() {
  if (state.solicitacoesStatus === 'idle' || state.solicitacoesStatus === 'loading') {
    return loadingState('Carregando suas solicitações...');
  }
  if (state.solicitacoesStatus === 'error') {
    return errorState('Não foi possível carregar suas solicitações.', { retryId: 'hospRetryMinhas' });
  }
  const linhas = state.solicitacoes.map((row) => `
    <tr>
      <td><b>${esc(row.codigo || '—')}</b><br><small class="muted">${esc(brDate(row.data_solicitacao))}</small></td>
      <td>${esc(row.cidade || '—')}${row.uf ? `/${esc(row.uf)}` : ''}</td>
      <td>${esc(brDate(row.data_checkin_prevista))} → ${esc(brDate(row.data_checkout_prevista))}</td>
      <td style="max-width:260px">${esc(row.colaboradores || '—')}</td>
      <td>${esc(preferenciaLabel(row))}</td>
      <td>${statusBadge(row)}</td>
    </tr>`).join('');
  return `
    <div class="hosp-note">Acompanhe aqui o status das suas solicitações. Detalhes do hotel reservado (nome, valores, check-in real) são tratados pelo administrativo e não aparecem nesta lista.</div>
    ${table({
      colunas: [
        { id: 'codigo', label: 'Código' },
        { id: 'cidade', label: 'Cidade/UF' },
        { id: 'periodo', label: 'Período previsto' },
        { id: 'colaboradores', label: 'Colaboradores' },
        { id: 'preferencia', label: 'Preferência' },
        { id: 'status', label: 'Status' },
      ],
      linhasHtml: linhas,
      vazio: 'Você ainda não fez nenhuma solicitação de hospedagem.',
      minWidth: 860,
    })}`;
}

// ---------- "Nova solicitação" ----------
function renderColaboradorLista() {
  const q = norm(state.buscaColaborador);
  const lista = q
    ? state.colaboradoresEquipe.filter((c) => norm(c.nome).includes(q))
    : state.colaboradoresEquipe;
  if (!state.colaboradoresEquipe.length) {
    return '<div class="hosp-note">Nenhum colaborador encontrado na sua supervisão.</div>';
  }
  if (!lista.length) return '<div class="hosp-note">Nenhum colaborador encontrado para essa busca.</div>';
  return `<div class="hosp-colab-list">${lista.slice(0, 40).map((c) => {
    const chave = colaboradorChave(c);
    const marcado = state.selecionados.has(chave);
    return `<label class="hosp-colab-item"><input type="checkbox" data-colab="${esc(chave)}" ${marcado ? 'checked' : ''}><span>${esc(c.nome)}</span><small class="muted">${esc(c.supervisao || '')}</small></label>`;
  }).join('')}</div>`;
}

function renderSelecionados() {
  if (!state.selecionados.size) return '<span class="muted">Nenhum colaborador selecionado ainda.</span>';
  return [...state.selecionados.values()].map((c) => `
    <span class="hosp-chip">${esc(c.nome)}<button type="button" data-remove-colab="${esc(colaboradorChave(c))}" aria-label="Remover">×</button></span>
  `).join('');
}

function renderNovaSolicitacao() {
  const hoje = new Date().toISOString().slice(0, 10);
  return `
    <form id="hospForm" class="hosp-form">
      <div class="hosp-form-grid">
        <div class="ds-field">
          <label for="hospUf">UF *</label>
          <select id="hospUf" required>
            <option value="">Selecione</option>
            ${UFS.map((uf) => `<option value="${uf}">${uf}</option>`).join('')}
          </select>
        </div>
        <div class="ds-field">
          <label for="hospCidade">Cidade *</label>
          <input id="hospCidade" type="text" required maxlength="120" placeholder="Ex.: Rondonópolis" />
        </div>
        <div class="ds-field">
          <label for="hospCliente">Cliente</label>
          <input id="hospCliente" type="text" maxlength="120" placeholder="Nome do cliente" />
        </div>
        <div class="ds-field">
          <label for="hospLocalEmbarque">Local de embarque</label>
          <input id="hospLocalEmbarque" type="text" maxlength="160" placeholder="Ex.: Posto X, BR-364 km 12" />
        </div>
        <div class="ds-field">
          <label for="hospLink">Link de localização</label>
          <input id="hospLink" type="url" maxlength="300" placeholder="Link do Google Maps (opcional)" />
        </div>
        <div class="ds-field">
          <label for="hospCheckin">Check-in *</label>
          <input id="hospCheckin" type="date" required min="${hoje}" value="${hoje}" />
        </div>
        <div class="ds-field">
          <label for="hospCheckout">Check-out *</label>
          <input id="hospCheckout" type="date" required min="${hoje}" />
        </div>
        <div class="ds-field">
          <label for="hospHorario">Horário de chegada previsto</label>
          <input id="hospHorario" type="time" />
        </div>
        <div class="ds-field">
          <label for="hospPreferencia">Preferência de hospedagem</label>
          <select id="hospPreferencia">
            <option value="SEM_PREFERENCIA">Sem preferência</option>
            <option value="HOTEL">Hotel</option>
            <option value="ALOJAMENTO">Alojamento</option>
          </select>
        </div>
      </div>

      <div class="ds-field" style="margin-top:12px">
        <label for="hospObservacao">Observação</label>
        <textarea id="hospObservacao" rows="3" maxlength="500" placeholder="Alguma informação importante para o administrativo?"></textarea>
      </div>

      <div class="hosp-colab-picker">
        <div class="section-head" style="margin-top:16px">
          <div><h4 style="margin:0">Colaboradores *</h4><p class="muted" style="margin:4px 0 0">Selecione quem vai se hospedar, entre os colaboradores da sua supervisão.</p></div>
        </div>
        <input id="hospBuscaColab" type="text" placeholder="Buscar por nome..." style="margin:10px 0" />
        <div id="hospColabLista">${renderColaboradorLista()}</div>
        <div class="hosp-colab-selecionados" id="hospColabSelecionados">${renderSelecionados()}</div>
      </div>

      <div class="hosp-form-actions">
        <span class="hosp-feedback" id="hospFeedback"></span>
        <button class="btn btn-primary" type="submit" id="hospSubmit" ${state.enviando ? 'disabled' : ''}>${state.enviando ? 'Enviando...' : 'Enviar solicitação'}</button>
      </div>
    </form>`;
}

// ---------- Estilos ----------
function styles() {
  return `<style>
    .hosp-note{font-size:13px;color:var(--muted);margin-bottom:12px;padding:10px 12px;border:1px solid var(--line);border-radius:12px;background:rgba(148,163,184,.06)}
    .hosp-form-grid{display:grid;grid-template-columns:repeat(3,minmax(160px,1fr));gap:12px}
    .hosp-colab-list{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:6px;max-height:260px;overflow:auto;border:1px solid var(--line);border-radius:12px;padding:10px}
    .hosp-colab-item{display:flex;align-items:center;gap:8px;font-size:13px;padding:4px 6px;border-radius:8px}
    .hosp-colab-item:hover{background:rgba(148,163,184,.08)}
    .hosp-colab-item small{margin-left:auto}
    .hosp-colab-selecionados{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px;min-height:28px}
    .hosp-chip{display:inline-flex;align-items:center;gap:6px;padding:5px 6px 5px 12px;border-radius:999px;background:rgba(22,163,74,.14);border:1px solid rgba(22,163,74,.3);font-size:12px;font-weight:700}
    .hosp-chip button{border:none;background:transparent;color:inherit;cursor:pointer;font-size:15px;line-height:1;padding:2px 4px}
    .hosp-form-actions{display:flex;align-items:center;gap:14px;justify-content:flex-end;margin-top:18px}
    .hosp-form-actions .btn-primary{width:auto;margin-top:0}
    .hosp-feedback{font-weight:700;font-size:13px}
    .hosp-feedback.err{color:#fecaca}
    .hosp-feedback.ok{color:#86efac}
    @media (max-width: 900px){ .hosp-form-grid{grid-template-columns:1fr 1fr} }
    @media (max-width: 600px){ .hosp-form-grid{grid-template-columns:1fr} }
  </style>`;
}

// ---------- Render raiz ----------
function renderTabActive() {
  const body = document.getElementById('hospTabBody');
  if (!body) return;
  body.innerHTML = state.tab === 'nova' ? renderNovaSolicitacao() : renderMinhasSolicitacoes();
  wireTabEvents();
}

function wireTabEvents() {
  if (state.tab === 'nova') {
    const form = document.getElementById('hospForm');
    form?.addEventListener('submit', onSubmit);
    document.getElementById('hospBuscaColab')?.addEventListener('input', (e) => {
      state.buscaColaborador = e.target.value;
      const lista = document.getElementById('hospColabLista');
      if (lista) lista.innerHTML = renderColaboradorLista();
      wireColaboradorCheckboxes();
    });
    wireColaboradorCheckboxes();
    document.getElementById('hospColabSelecionados')?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-remove-colab]');
      if (!btn) return;
      state.selecionados.delete(btn.dataset.removeColab);
      atualizarColaboradorUI();
    });
  } else {
    document.getElementById('hospRetryMinhas')?.addEventListener('click', carregarMinhasSolicitacoes);
  }
}

function wireColaboradorCheckboxes() {
  document.querySelectorAll('#hospColabLista [data-colab]').forEach((input) => {
    input.addEventListener('change', () => {
      const chave = input.dataset.colab;
      if (input.checked) {
        const c = state.colaboradoresEquipe.find((x) => colaboradorChave(x) === chave);
        if (c) state.selecionados.set(chave, c);
      } else {
        state.selecionados.delete(chave);
      }
      const sel = document.getElementById('hospColabSelecionados');
      if (sel) sel.innerHTML = renderSelecionados();
    });
  });
}

function atualizarColaboradorUI() {
  const lista = document.getElementById('hospColabLista');
  const sel = document.getElementById('hospColabSelecionados');
  if (lista) lista.innerHTML = renderColaboradorLista();
  if (sel) sel.innerHTML = renderSelecionados();
  wireColaboradorCheckboxes();
}

function setFeedback(msg, tipo = '') {
  const el = document.getElementById('hospFeedback');
  if (!el) return;
  el.textContent = msg || '';
  el.className = `hosp-feedback ${tipo}`.trim();
}

async function onSubmit(event) {
  event.preventDefault();
  if (state.enviando) return;

  const uf = document.getElementById('hospUf').value;
  const cidade = document.getElementById('hospCidade').value.trim();
  const checkin = document.getElementById('hospCheckin').value;
  const checkout = document.getElementById('hospCheckout').value;

  if (!uf || !cidade || !checkin || !checkout) {
    setFeedback('Preencha UF, cidade, check-in e check-out.', 'err');
    return;
  }
  if (checkout <= checkin) {
    setFeedback('O check-out deve ser depois do check-in.', 'err');
    return;
  }
  if (!state.selecionados.size) {
    setFeedback('Selecione ao menos um colaborador.', 'err');
    return;
  }

  state.enviando = true;
  setFeedback('Enviando solicitação...');
  document.getElementById('hospSubmit').disabled = true;
  document.getElementById('hospSubmit').textContent = 'Enviando...';

  const u = usuario();
  const p_solicitacao = {
    solicitante_nome: u.name || u.email || 'Gestor',
    solicitante_email: u.email || '',
    empresa: state.ctx?.empresa || '',
    coordenacao: state.ctx?.coordenacao || '',
    supervisao: state.ctx?.supervisao || '',
    cidade,
    uf,
    cliente: document.getElementById('hospCliente').value.trim(),
    local_embarque: document.getElementById('hospLocalEmbarque').value.trim(),
    link_local_embarque: document.getElementById('hospLink').value.trim(),
    data_checkin_prevista: checkin,
    data_checkout_prevista: checkout,
    horario_chegada_previsto: document.getElementById('hospHorario').value || null,
    observacao_gestor: document.getElementById('hospObservacao').value.trim(),
    preferencia_hospedagem: document.getElementById('hospPreferencia').value,
  };
  const p_colaboradores = [...state.selecionados.values()].map((c) => ({
    colaborador_id: c.id || null,
    nome_colaborador: c.nome,
    cpf: c.cpf || null,
    tipo_colaborador: c.tipo || null,
    empresa: c.empresa || null,
    coordenacao: c.coordenacao || null,
    supervisao: c.supervisao || null,
  }));

  const { data, error } = await supabase.rpc('hospedagem_criar_solicitacao', { p_solicitacao, p_colaboradores });

  state.enviando = false;
  if (error) {
    console.warn('[hospedagem] criar solicitação:', error);
    setFeedback(error.message || 'Erro ao enviar a solicitação.', 'err');
    document.getElementById('hospSubmit').disabled = false;
    document.getElementById('hospSubmit').textContent = 'Enviar solicitação';
    return;
  }

  toast(`Solicitação ${data?.codigo || ''} enviada com sucesso.`, 'ok');
  state.selecionados = new Map();
  state.buscaColaborador = '';
  state.solicitacoesStatus = 'idle';
  state.tab = 'minhas';
  renderShell();
  carregarMinhasSolicitacoes();
}

function renderShell() {
  const content = document.getElementById('pageContent');
  if (!content) return;
  content.innerHTML = `${styles()}
    <section class="card">
      ${pageHeader({
        titulo: 'Hospedagem',
        subtitulo: 'Solicite hospedagem para colaboradores da sua equipe. A solicitação vai direto para a fila do administrativo de Hotéis.',
      })}
      ${tabs({
        itens: [
          { id: 'nova', label: 'Nova solicitação' },
          { id: 'minhas', label: 'Minhas solicitações' },
        ],
        ativo: state.tab,
      })}
      <div id="hospTabBody" class="mt-16"></div>
    </section>`;

  content.querySelectorAll('[data-ds-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.tab = btn.dataset.dsTab;
      renderShell();
      if (state.tab === 'minhas' && state.solicitacoesStatus === 'idle') carregarMinhasSolicitacoes();
    });
  });

  renderTabActive();
}

export async function renderContent(content, userContext) {
  state.ctx = userContext;
  content.innerHTML = `${styles()}<section class="card">${loadingState('Carregando sua equipe...')}</section>`;

  await carregarSupervisoesGestor();
  if (!state.supervisoes.length) {
    content.innerHTML = `${styles()}<section class="card">${emptyState(
      'Você não está vinculado a nenhuma supervisão.',
      'Peça ao TI o vínculo em Programação para poder solicitar hospedagem para sua equipe.',
    )}</section>`;
    return;
  }
  await carregarColaboradoresEquipe();
  renderShell();
}

initProtectedPage('Hospedagem', renderContent);
