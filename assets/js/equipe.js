import { initProtectedPage } from './pageInit.js';
import { supabase } from './supabaseClient.js';
import { searchColaboradores } from './colaboradoresCache.js';

const TABS = [
  { id: 'admissoes', label: 'Admissões' },
  { id: 'integracao', label: 'Integração' },
  { id: 'graint', label: 'Cadastro no Graint' },
  { id: 'consultar', label: 'Consultar Base' },
  { id: 'contatos', label: 'Contatos e Cadastros' },
];

const DOCUMENTOS_PADRAO = ['RG', 'CPF', 'CTPS/PIS', 'Comprovante de Residência', 'Certidão (Nasc./Casamento)', 'Exame Admissional'];
const ETAPAS_INTEGRACAO_PADRAO = ['Apresentação da empresa', 'Treinamento de segurança', 'Entrega de EPI', 'Apresentação da equipe', 'Acesso a sistemas'];

const STATUS_ADMISSAO = {
  documentos_pendentes: { label: 'Documentos pendentes', next: 'exame_pendente', nextLabel: 'Avançar para exame' },
  exame_pendente: { label: 'Exame pendente', next: 'aguardando_graint', nextLabel: 'Avançar para cadastro no Graint' },
  aguardando_graint: { label: 'Aguardando cadastro no Graint', next: 'concluida', nextLabel: 'Marcar como concluída' },
  concluida: { label: 'Concluída', next: null, nextLabel: null },
};

const state = { tab: 'admissoes', admissoes: [], integracoes: [], ctx: null };

const esc = (v) => String(v ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const brDate = (v) => { const [y, m, d] = String(v || '').slice(0, 10).split('-'); return y && m && d ? `${d}/${m}/${y}` : '-'; };
const today = () => new Date().toISOString().slice(0, 10);

function statusPill(status, map) {
  const label = map?.[status]?.label || status || '-';
  const cor = status === 'concluida' || status === 'concluido' ? ['#bbf7d0', 'rgba(22,101,52,.18)'] : ['#fde68a', 'rgba(245,158,11,.1)'];
  return `<span style="display:inline-flex;padding:4px 8px;border-radius:999px;font-size:12px;font-weight:800;color:${cor[0]};background:${cor[1]};border:1px solid rgba(148,163,184,.2)">${esc(label)}</span>`;
}

function styles() {
  return `<style>
    .eq-tabs{display:flex;gap:8px;flex-wrap:wrap}
    .eq-tabs .active{background:#166534!important;color:#fff!important}
    .eq-table-wrap{overflow:auto;border:1px solid var(--line);border-radius:18px}
    .eq-table{width:100%;border-collapse:collapse;min-width:640px}
    .eq-table th,.eq-table td{padding:14px;border-bottom:1px solid var(--line);text-align:left;vertical-align:middle}
    .eq-table th{font-size:12px;color:var(--muted);text-transform:uppercase}
    .eq-empty{text-align:center;color:var(--muted)}
    .eq-modal{position:fixed;inset:0;background:rgba(2,6,23,.75);z-index:9999;display:none;align-items:center;justify-content:center;padding:20px}
    .eq-modal.open{display:flex}
    .eq-modal-card{width:min(640px,100%);max-height:90vh;overflow:auto;background:#15152a;border:1px solid rgba(255,255,255,.06);border-radius:22px;padding:24px;color:#e2e2f0}
    .eq-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}
    .eq-grid input,.eq-grid textarea,.eq-grid select{width:100%;box-sizing:border-box;border:1px solid rgba(148,163,184,.24);background:#0d0d18;color:#e2e2f0;border-radius:12px;padding:10px 12px;color-scheme:dark}
    .eq-full{grid-column:1/-1}
    .eq-actions{display:flex;gap:10px;flex-wrap:wrap}
    .eq-feedback{font-weight:700;display:block}
    .eq-feedback.err{color:#fecaca}
    .eq-checklist label{display:flex;align-items:center;gap:10px;padding:9px 12px;border:1px solid rgba(148,163,184,.18);border-radius:12px;cursor:pointer;background:#0d0d18;margin-bottom:8px}
    .eq-checklist input{width:18px;height:18px;accent-color:#4ade80}
  </style>`;
}

function tabsHtml() {
  return `<div class="eq-tabs mt-16">${TABS.map((t) => `<button class="btn btn-secondary${t.id === state.tab ? ' active' : ''}" data-eq-tab="${t.id}" type="button">${esc(t.label)}</button>`).join('')}</div>`;
}

async function safe(fn, fallback = []) {
  try { const { data, error } = await fn(); if (error) throw error; return data || fallback; }
  catch (e) { console.warn('[Equipe]', e); return fallback; }
}

// ---------- Admissões ----------

async function loadAdmissoes() {
  state.admissoes = await safe(() => supabase.from('rh_admissoes').select('*, rh_documentos_registro(*)').order('created_at', { ascending: false }).limit(200));
  renderAdmissoesTable();
}

function renderAdmissoesTable() {
  const body = document.getElementById('eqAdmBody');
  if (!body) return;
  if (!state.admissoes.length) {
    body.innerHTML = `<tr><td colspan="5" class="eq-empty">Nenhuma admissão em andamento. Clique em <b>+ Nova Admissão</b> para começar.</td></tr>`;
    return;
  }
  body.innerHTML = state.admissoes.map((a) => `<tr>
    <td><b>${esc(a.nome)}</b>${a.cpf ? `<br><small class="muted">CPF: ${esc(a.cpf)}</small>` : ''}</td>
    <td>${esc(a.cargo || '-')}</td>
    <td>${brDate(a.data_admissao_prevista)}</td>
    <td>${statusPill(a.status, STATUS_ADMISSAO)}</td>
    <td><button class="btn btn-small btn-secondary" data-adm-ver="${esc(a.id)}" type="button">Ver</button></td>
  </tr>`).join('');
  body.querySelectorAll('[data-adm-ver]').forEach((b) => b.onclick = () => openAdmissaoModal(b.dataset.admVer));
}

function openNovaAdmissaoModal() {
  const modal = document.getElementById('eqModal');
  modal.innerHTML = `<div class="eq-modal-card">
    <div class="section-head"><div><h3>Nova Admissão</h3><p class="muted">Cadastro inicial do processo de admissão.</p></div><button class="btn btn-secondary" id="mClose" type="button">Fechar</button></div>
    <div class="eq-grid mt-16">
      <label class="eq-full">Nome completo *<input id="admNome" type="text" required></label>
      <label>CPF<input id="admCpf" type="text"></label>
      <label>Data de nascimento<input id="admNasc" type="date"></label>
      <label>Cargo<input id="admCargo" type="text"></label>
      <label>Empresa<input id="admEmpresa" type="text"></label>
      <label>Coordenação<input id="admCoord" type="text"></label>
      <label>Supervisão<input id="admSup" type="text"></label>
      <label>Data de admissão prevista<input id="admData" type="date"></label>
      <label>Telefone<input id="admTel" type="text"></label>
      <label>E-mail<input id="admEmail" type="email"></label>
      <label class="eq-full">Observações<textarea id="admObs" rows="2"></textarea></label>
    </div>
    <div class="eq-actions mt-16"><button class="btn btn-primary" id="admSalvar" type="button">Salvar</button><button class="btn btn-secondary" id="admCancelar" type="button">Cancelar</button></div>
    <span class="eq-feedback mt-8" id="admFeedback"></span>
  </div>`;
  modal.classList.add('open');
  modal.querySelector('#mClose').onclick = () => modal.classList.remove('open');
  modal.querySelector('#admCancelar').onclick = () => modal.classList.remove('open');
  modal.querySelector('#admSalvar').onclick = async () => {
    const btn = modal.querySelector('#admSalvar');
    const fb = modal.querySelector('#admFeedback');
    const nome = modal.querySelector('#admNome').value.trim();
    if (!nome) { fb.textContent = 'Informe o nome do candidato.'; fb.classList.add('err'); return; }
    btn.disabled = true; fb.textContent = 'Salvando...'; fb.classList.remove('err');
    try {
      const payload = {
        nome,
        cpf: modal.querySelector('#admCpf').value.trim() || null,
        data_nascimento: modal.querySelector('#admNasc').value || null,
        cargo: modal.querySelector('#admCargo').value.trim() || null,
        empresa: modal.querySelector('#admEmpresa').value.trim() || null,
        coordenacao: modal.querySelector('#admCoord').value.trim() || null,
        supervisao: modal.querySelector('#admSup').value.trim() || null,
        data_admissao_prevista: modal.querySelector('#admData').value || null,
        telefone: modal.querySelector('#admTel').value.trim() || null,
        email: modal.querySelector('#admEmail').value.trim() || null,
        observacoes: modal.querySelector('#admObs').value.trim() || null,
        created_by: state.ctx?.user?.id || null,
      };
      const { error } = await supabase.from('rh_admissoes').insert(payload);
      if (error) throw error;
      modal.classList.remove('open');
      await loadAdmissoes();
    } catch (e) { fb.textContent = e.message; fb.classList.add('err'); btn.disabled = false; }
  };
}

async function openAdmissaoModal(id) {
  const a = state.admissoes.find((x) => String(x.id) === String(id));
  if (!a) return;
  const modal = document.getElementById('eqModal');
  const docs = a.rh_documentos_registro || [];
  const docsPendentes = DOCUMENTOS_PADRAO.filter((tipo) => !docs.some((d) => d.tipo_documento === tipo));
  const cfg = STATUS_ADMISSAO[a.status] || {};
  modal.innerHTML = `<div class="eq-modal-card">
    <div class="section-head"><div><h3>${esc(a.nome)}</h3><p class="muted">${esc(a.cargo || '-')} · ${statusPill(a.status, STATUS_ADMISSAO)}</p></div><button class="btn btn-secondary" id="mClose" type="button">Fechar</button></div>
    <div class="eq-grid mt-16">
      <div><span class="muted">CPF</span><br><b>${esc(a.cpf || '-')}</b></div>
      <div><span class="muted">Admissão prevista</span><br><b>${brDate(a.data_admissao_prevista)}</b></div>
      <div><span class="muted">Coordenação</span><br><b>${esc(a.coordenacao || '-')}</b></div>
      <div><span class="muted">Supervisão</span><br><b>${esc(a.supervisao || '-')}</b></div>
      <div><span class="muted">Telefone</span><br><b>${esc(a.telefone || '-')}</b></div>
      <div><span class="muted">E-mail</span><br><b>${esc(a.email || '-')}</b></div>
    </div>
    ${a.observacoes ? `<div class="mt-16"><span class="muted">Observações</span><p>${esc(a.observacoes)}</p></div>` : ''}
    <div class="mt-16">
      <p style="font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:var(--muted);font-weight:700;margin-bottom:10px">Documentos de registro</p>
      <div style="display:grid;gap:8px">${docs.map((d) => `<div style="display:flex;justify-content:space-between;align-items:center;padding:9px 12px;border:1px solid rgba(148,163,184,.2);border-radius:12px"><span>${esc(d.tipo_documento)}</span>${d.status === 'recebido' ? '<span style="color:#86efac;font-weight:700;font-size:12px">Recebido</span>' : `<button class="btn btn-small btn-secondary" data-doc-receber="${esc(d.id)}" type="button">Marcar recebido</button>`}</div>`).join('') || '<p class="muted">Nenhum documento solicitado ainda.</p>'}</div>
      ${docsPendentes.length ? `<div class="mt-8"><select id="docTipoNovo" class="eq-full">${docsPendentes.map((t) => `<option value="${esc(t)}">${esc(t)}</option>`).join('')}</select><button class="btn btn-small btn-secondary mt-8" id="docSolicitar" type="button">+ Solicitar documento</button></div>` : ''}
    </div>
    <div class="eq-actions mt-16">
      ${cfg.next ? `<button class="btn btn-primary" id="admAvancar" type="button">${esc(cfg.nextLabel)}</button>` : ''}
    </div>
    <span class="eq-feedback mt-8" id="admModalFb"></span>
  </div>`;
  modal.classList.add('open');
  modal.querySelector('#mClose').onclick = () => modal.classList.remove('open');
  modal.querySelectorAll('[data-doc-receber]').forEach((b) => b.onclick = async () => {
    await supabase.from('rh_documentos_registro').update({ status: 'recebido' }).eq('id', b.dataset.docReceber);
    await loadAdmissoes();
    openAdmissaoModal(id);
  });
  modal.querySelector('#docSolicitar')?.addEventListener('click', async () => {
    const tipo = modal.querySelector('#docTipoNovo').value;
    await supabase.from('rh_documentos_registro').insert({ admissao_id: a.id, tipo_documento: tipo, status: 'solicitado' });
    await loadAdmissoes();
    openAdmissaoModal(id);
  });
  modal.querySelector('#admAvancar')?.addEventListener('click', async () => {
    const fb = modal.querySelector('#admModalFb');
    try {
      await supabase.from('rh_admissoes').update({ status: cfg.next, updated_at: new Date().toISOString() }).eq('id', a.id);
      modal.classList.remove('open');
      await loadAdmissoes();
    } catch (e) { fb.textContent = e.message; fb.classList.add('err'); }
  });
}

function renderAdmissoesTab(area) {
  area.innerHTML = `<div class="section-head mt-16"><div><h3>Admissões</h3><p class="muted">Cadastro e acompanhamento do processo de admissão de novos colaboradores.</p></div><button class="btn btn-primary" id="eqAdmNova" type="button">+ Nova Admissão</button></div>
  <div class="eq-table-wrap mt-16"><table class="eq-table"><thead><tr><th>Candidato</th><th>Cargo</th><th>Admissão prevista</th><th>Status</th><th></th></tr></thead><tbody id="eqAdmBody"><tr><td colspan="5" class="eq-empty">Carregando...</td></tr></tbody></table></div>`;
  area.querySelector('#eqAdmNova').onclick = openNovaAdmissaoModal;
  loadAdmissoes();
}

// ---------- Integração ----------

async function loadIntegracoes() {
  state.integracoes = await safe(() => supabase.from('rh_integracao').select('*').order('created_at', { ascending: false }).limit(200));
  renderIntegracoesTable();
}

function progressoIntegracao(i) {
  const etapas = Array.isArray(i.etapas) ? i.etapas : [];
  const feitas = etapas.filter((e) => e.done).length;
  return `${feitas}/${etapas.length}`;
}

function renderIntegracoesTable() {
  const body = document.getElementById('eqIntBody');
  if (!body) return;
  if (!state.integracoes.length) {
    body.innerHTML = `<tr><td colspan="5" class="eq-empty">Nenhuma integração em andamento. Clique em <b>+ Nova Integração</b> para começar.</td></tr>`;
    return;
  }
  body.innerHTML = state.integracoes.map((i) => `<tr>
    <td><b>${esc(i.colaborador_nome)}</b></td>
    <td>${esc(i.responsavel || '-')}</td>
    <td>${progressoIntegracao(i)} etapas</td>
    <td>${statusPill(i.status, { em_andamento: { label: 'Em andamento' }, concluida: { label: 'Concluída' } })}</td>
    <td><button class="btn btn-small btn-secondary" data-int-ver="${esc(i.id)}" type="button">Ver</button></td>
  </tr>`).join('');
  body.querySelectorAll('[data-int-ver]').forEach((b) => b.onclick = () => openIntegracaoModal(b.dataset.intVer));
}

function openNovaIntegracaoModal() {
  const modal = document.getElementById('eqModal');
  let selecionado = null;
  let debounce = null;
  modal.innerHTML = `<div class="eq-modal-card">
    <div class="section-head"><div><h3>Nova Integração</h3><p class="muted">Checklist de onboarding do colaborador.</p></div><button class="btn btn-secondary" id="mClose" type="button">Fechar</button></div>
    <div class="mt-16" style="position:relative">
      <label class="eq-full">Colaborador *<input id="intColabInput" type="text" placeholder="Digite o nome para pesquisar..." autocomplete="off"></label>
      <div id="intColabSug" style="display:none;position:absolute;top:100%;left:0;right:0;z-index:50;background:#071b13;border:1px solid var(--line);border-radius:14px;padding:6px;max-height:200px;overflow:auto;margin-top:4px"></div>
    </div>
    <label class="eq-full mt-16">Responsável pela integração<input id="intResp" type="text"></label>
    <div class="eq-actions mt-16"><button class="btn btn-primary" id="intSalvar" type="button">Salvar</button><button class="btn btn-secondary" id="intCancelar" type="button">Cancelar</button></div>
    <span class="eq-feedback mt-8" id="intFeedback"></span>
  </div>`;
  modal.classList.add('open');
  const input = modal.querySelector('#intColabInput');
  const sug = modal.querySelector('#intColabSug');
  input.addEventListener('input', () => {
    selecionado = null;
    const q = input.value.trim();
    if (q.length < 2) { sug.style.display = 'none'; return; }
    clearTimeout(debounce);
    debounce = setTimeout(async () => {
      const lista = await searchColaboradores(q, { limite: 10 });
      if (!lista.length) { sug.style.display = 'none'; return; }
      sug.innerHTML = lista.map((c, idx) => `<button type="button" data-idx="${idx}" style="display:block;width:100%;text-align:left;border:1px solid rgba(148,163,184,.24);background:#0d0d18;color:#e2e2f0;border-radius:10px;padding:8px;margin-bottom:4px;cursor:pointer">${esc(c.nome)}</button>`).join('');
      sug.style.display = 'block';
      sug.querySelectorAll('button').forEach((b) => b.onmousedown = (ev) => { ev.preventDefault(); selecionado = lista[Number(b.dataset.idx)]; input.value = selecionado.nome; sug.style.display = 'none'; });
    }, 250);
  });
  modal.querySelector('#mClose').onclick = () => modal.classList.remove('open');
  modal.querySelector('#intCancelar').onclick = () => modal.classList.remove('open');
  modal.querySelector('#intSalvar').onclick = async () => {
    const fb = modal.querySelector('#intFeedback');
    const nome = selecionado?.nome || input.value.trim();
    if (!nome) { fb.textContent = 'Selecione o colaborador.'; fb.classList.add('err'); return; }
    try {
      const payload = {
        colaborador_id: selecionado?.id || null,
        colaborador_nome: nome,
        responsavel: modal.querySelector('#intResp').value.trim() || null,
        etapas: ETAPAS_INTEGRACAO_PADRAO.map((label) => ({ label, done: false })),
        status: 'em_andamento',
      };
      const { error } = await supabase.from('rh_integracao').insert(payload);
      if (error) throw error;
      modal.classList.remove('open');
      await loadIntegracoes();
    } catch (e) { fb.textContent = e.message; fb.classList.add('err'); }
  };
}

async function openIntegracaoModal(id) {
  const i = state.integracoes.find((x) => String(x.id) === String(id));
  if (!i) return;
  const modal = document.getElementById('eqModal');
  const etapas = Array.isArray(i.etapas) ? i.etapas : [];
  modal.innerHTML = `<div class="eq-modal-card">
    <div class="section-head"><div><h3>${esc(i.colaborador_nome)}</h3><p class="muted">${statusPill(i.status, { em_andamento: { label: 'Em andamento' }, concluida: { label: 'Concluída' } })}</p></div><button class="btn btn-secondary" id="mClose" type="button">Fechar</button></div>
    <div class="eq-checklist mt-16">${etapas.map((e, idx) => `<label><input type="checkbox" data-etapa="${idx}" ${e.done ? 'checked' : ''}> ${esc(e.label)}</label>`).join('')}</div>
    <div class="eq-actions mt-16">${i.status !== 'concluida' ? `<button class="btn btn-primary" id="intConcluir" type="button">Marcar integração como concluída</button>` : ''}</div>
    <span class="eq-feedback mt-8" id="intModalFb"></span>
  </div>`;
  modal.classList.add('open');
  modal.querySelector('#mClose').onclick = () => modal.classList.remove('open');
  modal.querySelectorAll('[data-etapa]').forEach((cb) => cb.onchange = async () => {
    const idx = Number(cb.dataset.etapa);
    etapas[idx].done = cb.checked;
    await supabase.from('rh_integracao').update({ etapas }).eq('id', i.id);
    await loadIntegracoes();
  });
  modal.querySelector('#intConcluir')?.addEventListener('click', async () => {
    await supabase.from('rh_integracao').update({ status: 'concluida', data_conclusao: today() }).eq('id', i.id);
    modal.classList.remove('open');
    await loadIntegracoes();
  });
}

function renderIntegracaoTab(area) {
  area.innerHTML = `<div class="section-head mt-16"><div><h3>Integração de Colaboradores</h3><p class="muted">Checklist de integração/onboarding dos colaboradores recém-admitidos.</p></div><button class="btn btn-primary" id="eqIntNova" type="button">+ Nova Integração</button></div>
  <div class="eq-table-wrap mt-16"><table class="eq-table"><thead><tr><th>Colaborador</th><th>Responsável</th><th>Progresso</th><th>Status</th><th></th></tr></thead><tbody id="eqIntBody"><tr><td colspan="5" class="eq-empty">Carregando...</td></tr></tbody></table></div>`;
  area.querySelector('#eqIntNova').onclick = openNovaIntegracaoModal;
  loadIntegracoes();
}

// ---------- Cadastro no Graint (placeholder manual) ----------

async function renderGraintTab(area) {
  area.innerHTML = `<div class="section-head mt-16"><div><h3>Cadastro no Graint</h3><p class="muted">Admissões prontas para cadastro manual no sistema Graint. O envio automático ainda não está disponível — cadastre no Graint e marque como concluído aqui.</p></div></div>
  <div class="eq-table-wrap mt-16"><table class="eq-table"><thead><tr><th>Candidato</th><th>Cargo</th><th>Admissão prevista</th><th></th></tr></thead><tbody id="eqGraintBody"><tr><td colspan="4" class="eq-empty">Carregando...</td></tr></tbody></table></div>`;
  const lista = await safe(() => supabase.from('rh_admissoes').select('*').eq('status', 'aguardando_graint').order('data_admissao_prevista', { ascending: true }));
  const body = area.querySelector('#eqGraintBody');
  if (!lista.length) { body.innerHTML = `<tr><td colspan="4" class="eq-empty">Nenhuma admissão aguardando cadastro no Graint.</td></tr>`; return; }
  body.innerHTML = lista.map((a) => `<tr><td><b>${esc(a.nome)}</b></td><td>${esc(a.cargo || '-')}</td><td>${brDate(a.data_admissao_prevista)}</td><td><button class="btn btn-small btn-primary" data-graint-ok="${esc(a.id)}" type="button">Marcar como cadastrado</button></td></tr>`).join('');
  body.querySelectorAll('[data-graint-ok]').forEach((b) => b.onclick = async () => {
    await supabase.from('rh_admissoes').update({ status: 'concluida' }).eq('id', b.dataset.graintOk);
    renderGraintTab(area);
  });
}

// ---------- Consultar Base (delega para consultarColaboradores.js) ----------

async function renderConsultarTab(area) {
  area.innerHTML = `<div class="eq-empty mt-16">Carregando...</div>`;
  document.documentElement.classList.add('is-route-transitioning');
  try {
    const mod = await import('./consultarColaboradores.js');
    area.innerHTML = '';
    await mod.renderContent(area);
  } finally {
    document.documentElement.classList.remove('is-route-transitioning');
  }
}

// ---------- Contatos e Cadastros (delega para window.CONTATOS) ----------

async function renderContatosTab(area) {
  area.innerHTML = `<div class="eq-empty mt-16">Carregando...</div>`;
  await import('./modules/contatos.js?v=20260512-google-job-real-v1');
  area.innerHTML = '';
  window.CONTATOS.openHome(area, { supabase, auth: state.ctx, user: state.ctx?.user || null });
}

// ---------- Boot ----------

async function renderTab(container) {
  container.querySelectorAll('[data-eq-tab]').forEach((b) => b.classList.toggle('active', b.dataset.eqTab === state.tab));
  const area = container.querySelector('#eqTabContent');
  if (!area) return;
  area.innerHTML = `<div class="eq-empty mt-16">Carregando...</div>`;
  if (state.tab === 'admissoes') renderAdmissoesTab(area);
  else if (state.tab === 'integracao') renderIntegracaoTab(area);
  else if (state.tab === 'graint') renderGraintTab(area);
  else if (state.tab === 'consultar') renderConsultarTab(area);
  else if (state.tab === 'contatos') renderContatosTab(area);
}

export async function renderContent(content, userContext) {
  state.ctx = userContext;
  content.innerHTML = `${styles()}<section class="hero-card"><div><div class="eyebrow">Recursos Humanos</div><h2>Equipe</h2><p>Admissões, integração de colaboradores e cadastros da equipe.</p></div><div class="hero-badge-wrap"><span class="hero-badge">RH</span></div></section>
  ${tabsHtml()}
  <div id="eqTabContent"></div>
  <div class="eq-modal" id="eqModal"></div>`;
  content.querySelectorAll('[data-eq-tab]').forEach((b) => b.onclick = () => { state.tab = b.dataset.eqTab; renderTab(content); });
  await renderTab(content);
}

initProtectedPage('Equipe', renderContent);
