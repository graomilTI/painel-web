import { initProtectedPage } from './pageInit.js';
import { supabase } from './supabaseClient.js';
import {
  esc, tabs, badge, loadingState, emptyState, errorState,
  table, toast,
} from './core/ui.js';
import { brDate, statusLabel, preferenciaLabel } from './adm-hotel-helpers.js';
import { getColaboradores } from './colaboradoresCache.js?v=20260911-hosp-v3';

const UFS = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];

const state = {
  ctx: null,
  tab: 'nova',
  supervisoes: [],
  colaboradoresEquipe: [],
  selecionados: new Map(), // id/cpf/nome -> colaborador
  solicitacoes: [],
  checkoutDecisoes: [],
  solicitacoesStatus: 'idle', // idle | loading | loaded | error
  enviando: false,
  alojamentos: [],
  alojamentosStatus: 'idle', // idle | loading | loaded | error
  ocupantesAtuais: [],
  ocupantesHistorico: [],
  hospAModo: 'atual', // atual | historico
  hospAHistoricoCarregado: false,
  buscaAlojamento: '',
  alojEnviando: false,
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
  const [itens, decisoes] = await Promise.all([
    supabase.from('hospedagem_v3_itens').select('*').eq('solicitante_id', myId).order('solicitado_em', { ascending: false }).limit(500),
    supabase.from('hospedagem_checkout_decisoes').select('*').in('status',['AGUARDANDO_GESTOR','SEM_RESPOSTA']).order('data_checkout_prevista'),
  ]);
  const { data, error } = itens;
  if (error) {
    console.warn('[hospedagem] minhas solicitações:', error);
    state.solicitacoesStatus = 'error';
    renderTabActive();
    return;
  }
  state.solicitacoes = data || [];
  state.checkoutDecisoes = decisoes.data || [];
  state.solicitacoesStatus = 'loaded';
  renderTabActive();
}

function statusBadge(row) {
  const labels = { AGUARDANDO:'Aguardando',EM_COTACAO:'Em cotação',AGUARDANDO_HOTEL:'Em cotação',RESERVADO:'Reservado',ALTERACAO_PENDENTE:'Alteração solicitada',CHECKOUT_PENDENTE:'Checkout pendente',CHECKOUT:'Checkout',RECUSADO:'Recusado',CANCELADO:'Cancelado' };
  const s = row.status_item;
  return badge(labels[s] || s || 'Aguardando', ['CANCELADO','RECUSADO'].includes(s) ? 'danger' : ['RESERVADO','CHECKOUT'].includes(s) ? 'ok' : 'warn');
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
      <td><b>${esc(row.codigo_operacional || row.codigo_solicitacao || '—')}</b><br><small class="muted">${esc(brDate(row.solicitado_em))}</small></td>
      <td>${esc(row.cidade || '—')}${row.uf ? `/${esc(row.uf)}` : ''}</td>
      <td>${esc(brDate(row.data_checkin_prevista))} → ${esc(brDate(row.data_checkout_prevista))}</td>
      <td style="max-width:260px"><b>${esc(row.nome_colaborador || '—')}</b>${row.motivo_recusa ? `<br><small class="muted">${esc(row.motivo_recusa)}</small>` : ''}</td>
      <td>${statusBadge(row)}${row.hotel ? `<br><small>${esc(row.hotel)}</small>${row.hotel_localizacao ? ` · <a href="${esc(row.hotel_localizacao)}" target="_blank" rel="noopener">localização</a>` : ''}` : ''}</td>
      <td>${state.checkoutDecisoes.find((d)=>d.solicitacao_colaborador_id===row.item_id) ? `<button type="button" class="btn btn-primary btn-sm" data-checkout-item="${esc(state.checkoutDecisoes.find((d)=>d.solicitacao_colaborador_id===row.item_id).id)}">Responder checkout</button>` : row.status_item === 'AGUARDANDO' ? `<button type="button" class="btn btn-secondary btn-sm" data-editar-solicitacao="${esc(row.solicitacao_id)}">Editar</button> <button type="button" class="btn btn-secondary btn-sm" data-cancelar-item="${esc(row.item_id)}">Cancelar</button>` : row.status_item === 'RESERVADO' ? `<button type="button" class="btn btn-secondary btn-sm" data-alterar-item="${esc(row.item_id)}">Solicitar alteração</button>` : ''}</td>
    </tr>`).join('');
  return `
    <div class="hosp-note">Cada colaborador é acompanhado separadamente. Ao reservar, o hotel e sua localização aparecem aqui.</div>
    ${table({
      colunas: [
        { id: 'codigo', label: 'Código' },
        { id: 'cidade', label: 'Cidade/UF' },
        { id: 'periodo', label: 'Período previsto' },
        { id: 'colaboradores', label: 'Colaboradores' },
        { id: 'status', label: 'Status' },
        { id: 'acoes', label: 'Ações' },
      ],
      linhasHtml: linhas,
      vazio: 'Você ainda não fez nenhuma solicitação de hospedagem.',
      minWidth: 860,
    })}`;
}

// ---------- "Alojamento" (informar colaborador alojado) ----------
function alojamentoNaSupervisao(aloj) {
  const sups = [...new Set([
    ...(Array.isArray(aloj.supervisoes) ? aloj.supervisoes : []),
    aloj.supervisao,
  ].map(norm).filter(Boolean))];
  return sups.some((s) => state.supervisoes.some((g) => s.includes(g) || g.includes(s)));
}

async function carregarAlojamentosRegional() {
  state.alojamentosStatus = 'loading';
  renderTabActive();
  const { data, error } = await supabase
    .from('hospedagem_alojamentos')
    .select('id,nome,cidade,uf,status,supervisao,supervisoes')
    .neq('status', 'INATIVO')
    .order('cidade', { ascending: true })
    .order('nome', { ascending: true });
  if (error) {
    console.warn('[hospedagem] alojamentos:', error);
    state.alojamentosStatus = 'error';
    renderTabActive();
    return;
  }
  state.alojamentos = (data || []).filter(alojamentoNaSupervisao);
  await carregarOcupantesAtuais();
  state.alojamentosStatus = 'loaded';
  renderTabActive();
}

function ocupanteEstaAtivo(row, hoje) {
  if (String(row.tipo_estadia).toUpperCase() !== 'ALOJAMENTO') return false;
  if (row.tem_estadia === false) return false;
  if (!row.alojamento_id) return false;
  const referencia = row.data_referencia || row.checkin || '';
  const checkout = row.checkout || '';
  return referencia <= hoje && (!checkout || checkout >= hoje);
}

function mapOcupanteRow(row, alojPorId) {
  const aloj = alojPorId.get(String(row.alojamento_id));
  return {
    id: row.id,
    nome: row.nome_colaborador || 'Colaborador',
    checkin: row.checkin || row.data_referencia || null,
    checkout: row.checkout || null,
    alojamentoId: row.alojamento_id,
    alojamentoNome: aloj?.nome || row.alojamento_nome || 'Alojamento',
  };
}

async function carregarOcupantesAtuais() {
  const ids = state.alojamentos.map((a) => a.id);
  if (!ids.length) { state.ocupantesAtuais = []; return; }
  const hoje = new Date().toISOString().slice(0, 10);
  const colunas = 'id,nome_colaborador,alojamento_id,alojamento_nome,checkin,checkout,data_referencia,tipo_estadia,tem_estadia';
  const [atual, legado] = await Promise.all([
    supabase.from('programacao_estadia').select(colunas).eq('data_referencia', hoje).in('alojamento_id', ids),
    supabase.from('programacao_estadia').select(colunas).is('data_referencia', null).in('alojamento_id', ids),
  ]);
  const alojPorId = new Map(state.alojamentos.map((a) => [String(a.id), a]));
  const rows = [...(atual.data || []), ...(legado.data || [])].filter((row) => ocupanteEstaAtivo(row, hoje));
  state.ocupantesAtuais = rows
    .map((row) => mapOcupanteRow(row, alojPorId))
    .sort((a, b) => a.alojamentoNome.localeCompare(b.alojamentoNome, 'pt-BR') || a.nome.localeCompare(b.nome, 'pt-BR'));
}

const HOSP_A_HISTORICO_DIAS = 180;

async function carregarHistoricoOcupantes() {
  const ids = state.alojamentos.map((a) => a.id);
  state.ocupantesHistorico = [];
  state.hospAHistoricoCarregado = false;
  if (!ids.length) { state.hospAHistoricoCarregado = true; return; }
  const hoje = new Date().toISOString().slice(0, 10);
  const desde = new Date(Date.now() - HOSP_A_HISTORICO_DIAS * 86400000).toISOString().slice(0, 10);
  const colunas = 'id,nome_colaborador,alojamento_id,alojamento_nome,checkin,checkout,data_referencia,tipo_estadia,tem_estadia';
  const [legado, snapshots] = await Promise.all([
    supabase.from('programacao_estadia').select(colunas).is('data_referencia', null).in('alojamento_id', ids),
    supabase.from('programacao_estadia').select(colunas).gte('data_referencia', desde).in('alojamento_id', ids),
  ]);
  const alojPorId = new Map(state.alojamentos.map((a) => [String(a.id), a]));
  const rows = [...(legado.data || []), ...(snapshots.data || [])].filter((row) => {
    if (String(row.tipo_estadia).toUpperCase() !== 'ALOJAMENTO') return false;
    if (row.tem_estadia === false) return false;
    return !!row.alojamento_id;
  });
  state.ocupantesHistorico = rows
    .map((row) => {
      const mapeado = mapOcupanteRow(row, alojPorId);
      if (!mapeado.checkout && row.data_referencia && row.data_referencia < hoje) mapeado.checkout = row.data_referencia;
      return mapeado;
    })
    .sort((a, b) => (b.checkin || '').localeCompare(a.checkin || ''));
  state.hospAHistoricoCarregado = true;
}

function renderAlojamentoOpcoes() {
  return `<option value="">Selecione o alojamento...</option>${state.alojamentos
    .map((a) => `<option value="${esc(a.id)}">${esc(a.nome)}${a.cidade ? ` — ${esc(a.cidade)}/${esc(a.uf || '')}` : ''}</option>`)
    .join('')}`;
}

function renderColaboradorOpcoes() {
  const ordenados = [...state.colaboradoresEquipe].sort((a, b) => String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR'));
  return `<option value="">Selecione o colaborador...</option>${ordenados
    .map((c) => `<option value="${esc(colaboradorChave(c))}">${esc(c.nome)}</option>`)
    .join('')}`;
}

function renderOcupantesTabela() {
  const historico = state.hospAModo === 'historico';
  if (historico && !state.hospAHistoricoCarregado) return loadingState('Carregando histórico...');
  const origem = historico ? state.ocupantesHistorico : state.ocupantesAtuais;
  const q = norm(state.buscaAlojamento);
  const filtrados = !q ? origem : origem.filter((o) => norm(`${o.alojamentoNome} ${o.nome}`).includes(q));
  const linhas = filtrados.map((o) => `
    <tr>
      <td>${esc(o.alojamentoNome)}</td>
      <td>${esc(o.nome)}</td>
      <td>${esc(brDate(o.checkin))}</td>
      <td>${o.checkout ? esc(brDate(o.checkout)) : badge('Hospedado atualmente', 'ok')}</td>
      <td>${o.checkout ? '' : `<button type="button" class="btn btn-secondary btn-sm" data-encerrar-estadia="${esc(o.id)}">Encerrar</button>`}</td>
    </tr>`).join('');
  return table({
    colunas: [
      { id: 'alojamento', label: 'Alojamento' },
      { id: 'colaborador', label: 'Colaborador' },
      { id: 'checkin', label: 'Entrada' },
      { id: 'checkout', label: 'Saída' },
      { id: 'acao', label: '' },
    ],
    linhasHtml: linhas,
    vazio: !state.alojamentos.length
      ? 'Nenhum alojamento cadastrado na sua regional ainda. Fale com o time de Hospedagem para vincular um alojamento à sua supervisão.'
      : (historico ? 'Nenhuma entrada registrada nos últimos meses.' : 'Nenhum colaborador hospedado no momento.'),
    minWidth: 720,
  });
}

function renderAlojamento() {
  if (state.alojamentosStatus === 'idle' || state.alojamentosStatus === 'loading') {
    return loadingState('Carregando alojamentos da sua regional...');
  }
  if (state.alojamentosStatus === 'error') {
    return errorState('Não foi possível carregar os alojamentos.', { retryId: 'hospARetry' });
  }
  return `
    <div class="hosp-note">Informe aqui quem da sua equipe está hospedado em cada alojamento da sua regional. Isso não passa pela fila do administrativo — é atualizado na hora.</div>
    <div class="hosp-aloj-add">
      <div class="ds-field">
        <label for="hospAAlojSelect">Alojamento *</label>
        <select id="hospAAlojSelect">${renderAlojamentoOpcoes()}</select>
      </div>
      <div class="ds-field">
        <label for="hospAColabSelect">Colaborador *</label>
        <select id="hospAColabSelect">${renderColaboradorOpcoes()}</select>
      </div>
      <button class="btn btn-primary" type="button" id="hospAAddBtn" ${state.alojEnviando ? 'disabled' : ''}>${state.alojEnviando ? 'Adicionando...' : 'Adicionar'}</button>
    </div>
    <span class="hosp-feedback" id="hospAFeedback"></span>
    <div class="hosp-aloj-toolbar">
      <div class="hosp-aloj-modebar">
        <button type="button" class="btn btn-secondary btn-sm ${state.hospAModo === 'atual' ? 'active' : ''}" data-hosp-a-modo="atual">Hospedados agora</button>
        <button type="button" class="btn btn-secondary btn-sm ${state.hospAModo === 'historico' ? 'active' : ''}" data-hosp-a-modo="historico">Histórico</button>
      </div>
      <input id="hospABusca" type="text" placeholder="Buscar alojamento ou colaborador..." value="${esc(state.buscaAlojamento)}" />
    </div>
    <div id="hospAOcupantes">${renderOcupantesTabela()}</div>`;
}

function setAlojFeedback(msg, tipo = '') {
  const el = document.getElementById('hospAFeedback');
  if (!el) return;
  el.textContent = msg || '';
  el.className = `hosp-feedback ${tipo}`.trim();
}

async function onAdicionarAlojamento() {
  if (state.alojEnviando) return;
  const alojId = document.getElementById('hospAAlojSelect').value;
  const colabChave = document.getElementById('hospAColabSelect').value;
  if (!alojId) { setAlojFeedback('Selecione o alojamento.', 'err'); return; }
  if (!colabChave) { setAlojFeedback('Selecione o colaborador.', 'err'); return; }
  const aloj = state.alojamentos.find((a) => String(a.id) === String(alojId));
  const colaborador = state.colaboradoresEquipe.find((c) => colaboradorChave(c) === colabChave);
  if (!aloj || !colaborador) { setAlojFeedback('Seleção inválida.', 'err'); return; }

  state.alojEnviando = true;
  setAlojFeedback('Adicionando...');
  renderTabActive();

  const cpf = colaborador.cpf ? String(colaborador.cpf).replace(/\D/g, '') : '';
  const colaboradorId = cpf || norm(colaborador.nome) || colaborador.nome;
  const hoje = new Date().toISOString().slice(0, 10);
  const { error } = await supabase.from('programacao_estadia').insert({
    colaborador_id: colaboradorId,
    nome_colaborador: colaborador.nome,
    tem_estadia: true,
    tipo_estadia: 'ALOJAMENTO',
    diarias: 1,
    checkin: hoje,
    checkout: null,
    data_referencia: null,
    alojamento_id: aloj.id,
    alojamento_nome: aloj.nome,
    cidade: aloj.cidade || null,
    uf: aloj.uf || null,
  });

  state.alojEnviando = false;
  if (error) {
    console.warn('[hospedagem] adicionar alojamento:', error);
    setAlojFeedback(error.message || 'Não foi possível adicionar.', 'err');
    renderTabActive();
    return;
  }

  toast(`${colaborador.nome} adicionado a ${aloj.nome}.`, 'ok');
  state.hospAHistoricoCarregado = false;
  await carregarOcupantesAtuais();
  if (state.hospAModo === 'historico') await carregarHistoricoOcupantes();
  renderTabActive();
}

async function onEncerrarEstadia(estadiaId) {
  if (!window.confirm('Confirmar o encerramento desta estadia?')) return;
  const ontem = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const { error } = await supabase.from('programacao_estadia').update({ checkout: ontem }).eq('id', estadiaId);
  if (error) {
    console.warn('[hospedagem] encerrar estadia:', error);
    toast(error.message || 'Erro ao encerrar estadia.', 'err');
    return;
  }
  state.hospAHistoricoCarregado = false;
  await carregarOcupantesAtuais();
  if (state.hospAModo === 'historico') await carregarHistoricoOcupantes();
  renderTabActive();
}

// ---------- "Nova solicitação" ----------
function contagemNomesEquipe() {
  const contagem = new Map();
  state.colaboradoresEquipe.forEach((c) => {
    const k = norm(c.nome);
    contagem.set(k, (contagem.get(k) || 0) + 1);
  });
  return contagem;
}

function rotuloColaborador(c, contagem) {
  return contagem.get(norm(c.nome)) > 1 ? `${c.nome} — ${c.supervisao || 'Sem supervisão'}` : c.nome;
}

function renderColaboradorAdd() {
  if (!state.colaboradoresEquipe.length) {
    return '<div class="hosp-note">Nenhum colaborador encontrado na sua supervisão.</div>';
  }
  const contagem = contagemNomesEquipe();
  const disponiveis = state.colaboradoresEquipe.filter((c) => !state.selecionados.has(colaboradorChave(c)));
  const opcoes = disponiveis
    .map((c) => `<option value="${esc(rotuloColaborador(c, contagem))}">`).join('');
  return `
    <div class="hosp-colab-add-row">
      <input id="hospColabInput" type="text" list="hospColabOptions" placeholder="Digite o nome do colaborador..." autocomplete="off" />
      <datalist id="hospColabOptions">${opcoes}</datalist>
      <button type="button" class="btn btn-primary hosp-colab-add-btn" id="hospColabAddBtn" aria-label="Adicionar colaborador">+</button>
    </div>
    <p class="hosp-colab-add-erro" id="hospColabAddErro"></p>`;
}

function localizarColaboradorPorTexto(texto) {
  const alvo = norm(texto);
  if (!alvo) return { erro: 'Digite o nome de um colaborador.' };
  const contagem = contagemNomesEquipe();
  const candidatos = state.colaboradoresEquipe
    .filter((c) => !state.selecionados.has(colaboradorChave(c)))
    .map((c) => ({ c, rotulo: rotuloColaborador(c, contagem) }));
  let achado = candidatos.find((x) => norm(x.rotulo) === alvo) || candidatos.find((x) => norm(x.c.nome) === alvo);
  if (!achado) {
    const parciais = candidatos.filter((x) => norm(x.c.nome).includes(alvo));
    if (parciais.length === 1) achado = parciais[0];
    else if (parciais.length > 1) return { erro: 'Mais de um colaborador encontrado — escolha uma opção da lista ou digite o nome completo.' };
  }
  if (!achado) return { erro: 'Colaborador não encontrado na sua equipe.' };
  return { colaborador: achado.c };
}

function adicionarColaboradorPorTexto() {
  const input = document.getElementById('hospColabInput');
  const erroEl = document.getElementById('hospColabAddErro');
  if (!input) return;
  const { colaborador, erro } = localizarColaboradorPorTexto(input.value);
  if (erro) { if (erroEl) erroEl.textContent = erro; return; }
  state.selecionados.set(colaboradorChave(colaborador), {
    ...colaborador,
    _hosp: { checkin: new Date().toISOString().slice(0, 10), horario: '', dias: 1, sexo: colaborador.sexo || '' },
  });
  if (erroEl) erroEl.textContent = '';
  atualizarColaboradorUI();
}

function renderSelecionados() {
  if (!state.selecionados.size) return '<span class="muted">Nenhum colaborador selecionado ainda.</span>';
  const hoje = new Date().toISOString().slice(0, 10);
  return [...state.selecionados.entries()].map(([chave,c]) => `
    <article class="hosp-colab-draft" data-draft="${esc(chave)}">
      <header><b>${esc(c.nome)}</b><button type="button" data-remove-colab="${esc(chave)}" aria-label="Remover">×</button></header>
      <div class="hosp-draft-grid">
        <label>Data *<input type="date" min="${hoje}" data-draft-field="checkin" value="${esc(c._hosp?.checkin || hoje)}" required></label>
        <label>Horário de chegada *<input type="time" data-draft-field="horario" value="${esc(c._hosp?.horario || '')}" required></label>
        <label>Diárias previstas *<input type="number" min="1" max="365" data-draft-field="dias" value="${esc(c._hosp?.dias || 1)}" required></label>
        <label>Sexo *<select data-draft-field="sexo" required><option value="">Selecione</option><option value="MASCULINO" ${c._hosp?.sexo === 'MASCULINO' || c.sexo === 'MASCULINO' ? 'selected' : ''}>Masculino</option><option value="FEMININO" ${c._hosp?.sexo === 'FEMININO' || c.sexo === 'FEMININO' ? 'selected' : ''}>Feminino</option></select></label>
      </div>
    </article>`).join('');
}

function renderNovaSolicitacao() {
  const hoje = new Date().toISOString().slice(0, 10);
  return `
    <form id="hospForm" class="hosp-form">
      <div class="hosp-form-grid">
        <div class="ds-field hosp-field-uf-cidade">
          <div class="hosp-uf-cidade-row">
            <div class="ds-field hosp-field-uf">
              <label for="hospUf">UF *</label>
              <select id="hospUf" required>
                <option value="">--</option>
                ${UFS.map((uf) => `<option value="${uf}">${uf}</option>`).join('')}
              </select>
            </div>
            <div class="ds-field">
              <label for="hospCidade">Cidade *</label>
              <input id="hospCidade" type="text" required maxlength="120" placeholder="Ex.: Rondonópolis" />
            </div>
          </div>
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
      </div>

      <div class="ds-field" style="margin-top:12px">
        <label for="hospObservacao">Observação</label>
        <textarea id="hospObservacao" rows="3" maxlength="500" placeholder="Alguma informação importante para o administrativo?"></textarea>
      </div>

      <div class="hosp-colab-picker">
        <div class="section-head" style="margin-top:16px">
          <div><h4 style="margin:0">Colaboradores *</h4><p class="muted" style="margin:4px 0 0">Digite o nome de quem vai se hospedar e clique em + pra adicionar.</p></div>
        </div>
        <div id="hospColabAddWrap">${renderColaboradorAdd()}</div>
        <p class="hosp-colab-hint">Depois de adicionar, informe no card abaixo a data de entrada, o horário de chegada, as diárias previstas e o sexo.</p>
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
    .hosp-uf-cidade-row{display:flex;gap:10px}
    .hosp-uf-cidade-row .hosp-field-uf{flex:none;width:64px}
    .hosp-uf-cidade-row .ds-field:not(.hosp-field-uf){flex:1;min-width:0}
    .hosp-colab-hint{font-size:12px;color:var(--muted);margin:8px 0}
    .hosp-colab-add-row{display:flex;gap:8px;align-items:stretch}
    .hosp-colab-add-row input{flex:1;min-width:0}
    .hosp-colab-add-btn{width:44px;flex:none;padding:0;font-size:20px;line-height:1;border-radius:11px}
    .hosp-colab-add-erro{min-height:16px;margin:6px 0 0;font-size:12px;color:#fca5a5}

    /* Abas em sublinhado (padrão adm-conferencia-entry.js), não em botão/pill
       como o .ds-tab padrão do design system — escopado em .hosp-shell pra não
       afetar as abas de outras telas que usam o mesmo componente. */
    .hosp-shell .ds-tabs{gap:2px;flex-wrap:nowrap;overflow-x:auto}
    .hosp-shell .ds-tab{border:0;border-radius:0;background:transparent;padding:14px 16px 12px;color:#a9b8b1;font-weight:800;font-size:13px;white-space:nowrap;border-bottom:2px solid transparent}
    .hosp-shell .ds-tab:hover{color:#d9fbe8;background:rgba(34,197,94,.035)}
    .hosp-shell .ds-tab.active{color:#35e990;background:transparent;border-bottom-color:#22e58a}

    /* Padrão de cores/campos alinhado ao usado em adm-conferencia.js (pedido
       11/09): rótulo pequeno em maiúsculas, campo escuro com borda azulada,
       botões em pill — só dentro de #hospTabBody pra não vazar pro resto do app. */
    #hospTabBody .ds-field label,#hospTabBody .hosp-colab-picker>.section-head h4{font-size:11px;color:#dcfce7;font-weight:800;text-transform:uppercase;letter-spacing:.05em;margin:0 0 4px}
    #hospTabBody .ds-field input,#hospTabBody .ds-field select,#hospTabBody .ds-field textarea,#hospTabBody .hosp-colab-add-row input{
      width:100%;border:1px solid rgba(96,165,250,.22);border-radius:11px;background:#15152a;color:#e2e2f0;
      padding:7px 10px;font-size:13px;color-scheme:dark;box-sizing:border-box;
    }
    #hospTabBody .btn{border:1px solid rgba(111,208,165,.22);background:rgba(15,23,42,.78);color:#eef7f2;border-radius:12px;font-weight:800}
    #hospTabBody .btn:hover{background:rgba(22,101,52,.28)}
    #hospTabBody .btn-primary{background:#3fa878;color:#04130d;border-color:transparent}
    #hospTabBody .btn-primary:hover{background:#35a06e}
    #hospTabBody .btn-secondary{background:rgba(15,23,42,.78)}
    #hospTabBody .btn-secondary.active{background:rgba(22,163,74,.18);border-color:rgba(22,163,74,.4)}
    .hosp-colab-selecionados{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:10px;margin-top:10px;min-height:28px}
    .hosp-colab-draft{border:1px solid rgba(22,163,74,.35);border-radius:12px;padding:12px;background:rgba(22,163,74,.05)}
    .hosp-colab-draft header{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px}.hosp-colab-draft header button{border:0;background:transparent;color:var(--muted);font-size:20px;cursor:pointer}
    .hosp-draft-grid{display:grid;grid-template-columns:repeat(2,minmax(120px,1fr));gap:8px}
    .hosp-draft-grid label{font-size:11px;color:#dcfce7;font-weight:800;text-transform:uppercase;letter-spacing:.05em}
    .hosp-draft-grid input,.hosp-draft-grid select{margin-top:4px;width:100%;border:1px solid rgba(96,165,250,.22);border-radius:11px;background:#15152a;color:#e2e2f0;padding:7px 10px;font-size:13px;color-scheme:dark;box-sizing:border-box}
    .hosp-chip{display:inline-flex;align-items:center;gap:6px;padding:5px 6px 5px 12px;border-radius:999px;background:rgba(22,163,74,.14);border:1px solid rgba(22,163,74,.3);font-size:12px;font-weight:700}
    .hosp-chip button{border:none;background:transparent;color:inherit;cursor:pointer;font-size:15px;line-height:1;padding:2px 4px}
    .hosp-form-actions{display:flex;align-items:center;gap:14px;justify-content:flex-end;margin-top:18px}
    .hosp-form-actions .btn-primary{width:auto;margin-top:0}
    .hosp-feedback{font-weight:700;font-size:13px}
    .hosp-feedback.err{color:#fecaca}
    .hosp-feedback.ok{color:#86efac}
    .hosp-aloj-add{display:grid;grid-template-columns:1fr 1fr auto;gap:12px;align-items:end;margin-bottom:10px}
    .hosp-aloj-add .btn-primary{width:auto}
    .hosp-aloj-toolbar{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:16px 0 10px}
    .hosp-aloj-modebar{display:flex;gap:8px}
    .hosp-aloj-modebar .btn.active{background:rgba(22,163,74,.18);border-color:rgba(22,163,74,.4)}
    .hosp-aloj-toolbar input{flex:1 1 240px;min-width:180px}
    .btn-sm{padding:5px 10px;font-size:12px;width:auto}
    @media (max-width: 900px){ .hosp-form-grid{grid-template-columns:1fr 1fr} .hosp-aloj-add{grid-template-columns:1fr} }
    @media (max-width: 600px){ .hosp-form-grid{grid-template-columns:1fr} }
  </style>`;
}

// ---------- Render raiz ----------
function renderTabActive() {
  const body = document.getElementById('hospTabBody');
  if (!body) return;
  if (state.tab === 'nova') body.innerHTML = renderNovaSolicitacao();
  else if (state.tab === 'alojamento') body.innerHTML = renderAlojamento();
  else body.innerHTML = renderMinhasSolicitacoes();
  wireTabEvents();
}

function wireTabEvents() {
  if (state.tab === 'nova') {
    const form = document.getElementById('hospForm');
    form?.addEventListener('submit', onSubmit);
    document.getElementById('hospColabAddBtn')?.addEventListener('click', adicionarColaboradorPorTexto);
    document.getElementById('hospColabInput')?.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      adicionarColaboradorPorTexto();
    });
    document.getElementById('hospColabSelecionados')?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-remove-colab]');
      if (!btn) return;
      state.selecionados.delete(btn.dataset.removeColab);
      atualizarColaboradorUI();
    });
    document.getElementById('hospColabSelecionados')?.addEventListener('change', (e) => {
      const field = e.target.closest('[data-draft-field]');
      const card = e.target.closest('[data-draft]');
      if (!field || !card) return;
      const c = state.selecionados.get(card.dataset.draft);
      if (!c) return;
      c._hosp ||= {};
      c._hosp[field.dataset.draftField] = field.value;
    });
  } else if (state.tab === 'alojamento') {
    document.getElementById('hospARetry')?.addEventListener('click', carregarAlojamentosRegional);
    document.getElementById('hospAAddBtn')?.addEventListener('click', onAdicionarAlojamento);
    document.getElementById('hospABusca')?.addEventListener('input', (e) => {
      state.buscaAlojamento = e.target.value;
      const wrap = document.getElementById('hospAOcupantes');
      if (wrap) wrap.innerHTML = renderOcupantesTabela();
    });
    document.querySelectorAll('[data-hosp-a-modo]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const modo = btn.dataset.hospAModo;
        if (modo === state.hospAModo) return;
        state.hospAModo = modo;
        if (modo === 'historico' && !state.hospAHistoricoCarregado) {
          renderTabActive();
          await carregarHistoricoOcupantes();
        }
        renderTabActive();
      });
    });
    wireOcupantesEvents();
  } else {
    document.getElementById('hospRetryMinhas')?.addEventListener('click', carregarMinhasSolicitacoes);
    const tabBody = document.getElementById('hospTabBody');
    if (tabBody) tabBody.onclick = async (e) => {
      const cancelar = e.target.closest('[data-cancelar-item]');
      if (cancelar) {
        if (!window.confirm('Cancelar esta solicitação de hotel?')) return;
        const { error } = await supabase.rpc('hospedagem_v3_cancelar_item', { p_item_id: cancelar.dataset.cancelarItem });
        if (error) return toast(error.message || 'Não foi possível cancelar.', 'err');
        toast('Solicitação cancelada.', 'ok'); await carregarMinhasSolicitacoes(); return;
      }
      const editar = e.target.closest('[data-editar-solicitacao]');
      if (editar) {
        const rows=state.solicitacoes.filter((r)=>r.solicitacao_id===editar.dataset.editarSolicitacao);
        const cidade=window.prompt('Cidade da hospedagem:',rows[0]?.cidade||'')?.trim(); if(!cidade)return;
        const uf=window.prompt('UF:',rows[0]?.uf||'')?.trim().toUpperCase(); if(!uf)return;
        const colaboradores=[];
        for(const row of rows){const checkin=window.prompt(`Entrada de ${row.nome_colaborador}:`,row.data_checkin_prevista)?.trim();if(!checkin)return;const horario=window.prompt(`Horário de chegada de ${row.nome_colaborador}:`,String(row.horario_chegada_previsto||'').slice(0,5))?.trim();if(!horario)return;const dias=Number(window.prompt(`Dias de hotel para ${row.nome_colaborador}:`,String(row.quantidade_diarias_prevista||1)));if(!Number.isInteger(dias)||dias<=0)return;const sexo=window.prompt(`Sexo de ${row.nome_colaborador} (MASCULINO/FEMININO):`,row.sexo||'')?.trim().toUpperCase();if(!['MASCULINO','FEMININO'].includes(sexo))return;colaboradores.push({item_id:row.item_id,data_checkin_prevista:checkin,horario_chegada_previsto:horario,quantidade_diarias_prevista:dias,sexo});}
        const {error}=await supabase.rpc('hospedagem_v3_editar_solicitacao',{p_solicitacao_id:editar.dataset.editarSolicitacao,p_solicitacao:{cidade,uf,cliente:rows[0]?.cliente||'',local_embarque:rows[0]?.local_embarque||'',link_local_embarque:rows[0]?.link_local_embarque||'',observacao_gestor:rows[0]?.observacao_gestor||''},p_colaboradores:colaboradores});if(error)return toast(error.message||'Não foi possível editar.','err');toast('Solicitação atualizada.','ok');await carregarMinhasSolicitacoes();return;
      }
      const alterar = e.target.closest('[data-alterar-item]');
      if (alterar) {
        const tipo = window.prompt('Tipo: PRORROGACAO, CANCELAMENTO, MUDANCA_DATAS ou MUDANCA_CIDADE', 'PRORROGACAO')?.trim().toUpperCase();
        if (!['PRORROGACAO','CANCELAMENTO','MUDANCA_DATAS','MUDANCA_CIDADE'].includes(tipo)) return;
        let dados={};
        if(tipo==='PRORROGACAO'){const n=Number(window.prompt('Quantos dias adicionais?','1'));if(!Number.isInteger(n)||n<=0)return;dados={dias_adicionais:n};}
        if(tipo==='MUDANCA_DATAS'){const entrada=window.prompt('Nova data de entrada (AAAA-MM-DD):')?.trim();const dias=Number(window.prompt('Quantidade de dias:','1'));if(!entrada||!Number.isInteger(dias)||dias<=0)return;dados={data_checkin:entrada,dias};}
        if(tipo==='MUDANCA_CIDADE'){const cidade=window.prompt('Nova cidade:')?.trim();const uf=window.prompt('Nova UF:')?.trim().toUpperCase();if(!cidade||!uf)return;dados={cidade,uf};}
        const { error } = await supabase.rpc('hospedagem_v3_solicitar_alteracao', { p_item_id: alterar.dataset.alterarItem, p_tipo: tipo, p_dados: dados });
        if (error) return toast(error.message || 'Não foi possível solicitar a alteração.', 'err');
        toast('Alteração enviada para Hospedagem.', 'ok'); await carregarMinhasSolicitacoes();
      }
      const responder = e.target.closest('[data-checkout-item]');
      if (responder) {
        const manter = window.confirm('O colaborador precisa permanecer hospedado?\nOK = prorrogar | Cancelar = realizar checkout');
        let dias = null;
        if (manter) { dias = Number(window.prompt('Quantos dias adicionais?', '1')); if (!Number.isInteger(dias) || dias <= 0) return toast('Informe uma quantidade válida de dias.', 'err'); }
        const { error } = await supabase.rpc('hospedagem_v3_responder_checkout',{p_decisao_id:responder.dataset.checkoutItem,p_decisao:manter?'PRORROGAR':'CHECKOUT',p_dias_adicionais:dias});
        if (error) return toast(error.message || 'Não foi possível registrar a decisão.', 'err');
        toast('Decisão enviada ao hotel e atualizada no painel.', 'ok'); await carregarMinhasSolicitacoes();
      }
    };
  }
}

function wireOcupantesEvents() {
  document.getElementById('hospAOcupantes')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-encerrar-estadia]');
    if (!btn) return;
    onEncerrarEstadia(btn.dataset.encerrarEstadia);
  });
}

function atualizarColaboradorUI() {
  const addWrap = document.getElementById('hospColabAddWrap');
  const sel = document.getElementById('hospColabSelecionados');
  if (addWrap) addWrap.innerHTML = renderColaboradorAdd();
  if (sel) sel.innerHTML = renderSelecionados();
  document.getElementById('hospColabAddBtn')?.addEventListener('click', adicionarColaboradorPorTexto);
  document.getElementById('hospColabInput')?.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    adicionarColaboradorPorTexto();
  });
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

  if (!uf || !cidade) {
    setFeedback('Preencha UF e cidade.', 'err');
    return;
  }
  if (!state.selecionados.size) {
    setFeedback('Selecione ao menos um colaborador.', 'err');
    return;
  }
  const incompleto = [...state.selecionados.values()].find((c) => !c._hosp?.checkin || !c._hosp?.horario || !Number(c._hosp?.dias) || !c._hosp?.sexo);
  if (incompleto) { setFeedback(`Complete período, horário e sexo de ${incompleto.nome}.`, 'err'); return; }

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
    observacao_gestor: document.getElementById('hospObservacao').value.trim(),
    origem_solicitacao: 'FORMULARIO',
  };
  const p_colaboradores = [...state.selecionados.values()].map((c) => ({
    colaborador_id: c.id || null,
    nome_colaborador: c.nome,
    cpf: c.cpf || null,
    tipo_colaborador: c.tipo || null,
    empresa: c.empresa || null,
    coordenacao: c.coordenacao || null,
    supervisao: c.supervisao || null,
    data_checkin_prevista: c._hosp.checkin,
    horario_chegada_previsto: c._hosp.horario,
    quantidade_diarias_prevista: Number(c._hosp.dias),
    sexo: c._hosp.sexo,
  }));

  const { data, error } = await supabase.rpc('hospedagem_v3_criar_solicitacao', { p_solicitacao, p_colaboradores });

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
  state.solicitacoesStatus = 'idle';
  state.tab = 'minhas';
  renderShell();
  carregarMinhasSolicitacoes();
}

function renderShell() {
  const content = document.getElementById('pageContent');
  if (!content) return;
  content.innerHTML = `${styles()}
    <section class="card hosp-shell">
      ${tabs({
        itens: [
          { id: 'nova', label: 'Nova solicitação' },
          { id: 'minhas', label: 'Minhas solicitações' },
          { id: 'alojamento', label: 'Alojamento' },
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
      if (state.tab === 'alojamento' && state.alojamentosStatus === 'idle') carregarAlojamentosRegional();
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
