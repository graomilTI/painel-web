import { initProtectedPage } from './pageInit.js';
import { supabase } from './supabaseClient.js';
import {
  esc, brDate, todayIso, colabAutocomplete,
  filtrosHtml, filtrosStyle, bindFiltros, lerFiltros, aplicarFiltros,
  exportCsv, acoesHtml, bindAcoes,
  resolverAnexo, anexoBtnHtml, bindAnexoButtons, RH_ANEXOS_BUCKET,
} from './rhShared.js';

const TABS = [
  { id: 'admissoes', label: 'Admissões' },
  { id: 'integracao', label: 'Integração' },
  { id: 'graint', label: 'Cadastro no Graint' },
  { id: 'inativacoes', label: 'Inativações' },
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

const STATUS_INTEGRACAO = { em_andamento: { label: 'Em andamento' }, concluida: { label: 'Concluída' } };

const state = { tab: 'admissoes', admissoes: [], integracoes: [], inativacoes: [], inativacoesPendentesCount: 0, ctx: null, filtros: null };

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
    .eq-table{width:100%;border-collapse:collapse;min-width:720px}
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
    .eq-etapa-add{display:flex;gap:8px;margin-top:8px}
    .eq-etapa-add input{flex:1;border:1px solid rgba(148,163,184,.24);background:#0d0d18;color:#e2e2f0;border-radius:10px;padding:8px 10px}
    .eq-tab-badge{display:inline-flex;align-items:center;justify-content:center;min-width:18px;height:18px;padding:0 5px;margin-left:6px;border-radius:999px;background:#dc2626;color:#fff;font-size:11px;font-weight:900}
    .eq-doc-row{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:9px 12px;border:1px solid rgba(148,163,184,.2);border-radius:12px}
    .eq-doc-acts{display:flex;gap:6px;align-items:center;flex-wrap:wrap}
    .eq-inativ-card{border:1px solid rgba(248,113,113,.22);background:rgba(2,6,23,.28);border-radius:14px;padding:14px;margin-bottom:10px}
    .eq-inativ-head{display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:flex-start}
    .eq-inativ-motivo{margin:8px 0 0;color:#e2e2f0;font-size:13.5px;line-height:1.4}
    .eq-inativ-actions{display:flex;gap:8px;margin-top:10px;flex-wrap:wrap;align-items:center}
    .eq-inativ-obs{flex:1;min-width:180px;border:1px solid rgba(148,163,184,.24);background:#0d0d18;color:#e2e2f0;border-radius:10px;padding:8px 10px;font-size:12.5px}
    ${filtrosStyle()}
  </style>`;
}

function tabsHtml() {
  return `<div class="eq-tabs mt-16">${TABS.map((t) => {
    const badge = t.id === 'inativacoes' && state.inativacoesPendentesCount
      ? `<span class="eq-tab-badge">${state.inativacoesPendentesCount}</span>`
      : '';
    return `<button class="btn btn-secondary${t.id === state.tab ? ' active' : ''}" data-eq-tab="${t.id}" type="button">${esc(t.label)}${badge}</button>`;
  }).join('')}</div>`;
}

async function safe(fn, fallback = []) {
  try { const { data, error } = await fn(); if (error) throw error; return data || fallback; }
  catch (e) { console.warn('[Equipe]', e); return fallback; }
}

// ---------- Admissões ----------

async function loadAdmissoes() {
  state.admissoes = await safe(() => supabase.from('rh_admissoes').select('*, rh_documentos_registro(*)').order('created_at', { ascending: false }).limit(500));
  renderAdmissoesTable();
}

function admissoesFiltradas() {
  return aplicarFiltros(state.admissoes, state.filtros, { nomeKey: 'nome', dataKey: 'data_admissao_prevista' });
}

function renderAdmissoesTable() {
  const body = document.getElementById('eqAdmBody');
  if (!body) return;
  const rows = admissoesFiltradas();
  if (!rows.length) {
    body.innerHTML = `<tr><td colspan="6" class="eq-empty">${state.admissoes.length ? 'Nenhuma admissão no filtro atual.' : 'Nenhuma admissão em andamento. Clique em <b>+ Nova Admissão</b> para começar.'}</td></tr>`;
    return;
  }
  body.innerHTML = rows.map((a) => {
    const docs = a.rh_documentos_registro || [];
    const recebidos = docs.filter((d) => d.status === 'recebido').length;
    return `<tr>
    <td><b>${esc(a.nome)}</b>${a.cpf ? `<br><small class="muted">CPF: ${esc(a.cpf)}</small>` : ''}</td>
    <td>${esc(a.cargo || '-')}</td>
    <td>${brDate(a.data_admissao_prevista)}</td>
    <td>${statusPill(a.status, STATUS_ADMISSAO)}${docs.length ? `<br><small class="muted">Docs: ${recebidos}/${docs.length}</small>` : ''}</td>
    <td><button class="btn btn-small btn-secondary" data-adm-ver="${esc(a.id)}" type="button">Ver</button></td>
    <td>${acoesHtml(a.id)}</td>
  </tr>`;
  }).join('');
  body.querySelectorAll('[data-adm-ver]').forEach((b) => b.onclick = () => openAdmissaoModal(b.dataset.admVer));
  bindAcoes(body, {
    table: 'rh_admissoes',
    reload: loadAdmissoes,
    descricao: 'esta admissão (os documentos registrados dela também serão removidos)',
    onEdit: (id) => {
      const row = state.admissoes.find((a) => String(a.id) === String(id));
      if (row) openNovaAdmissaoModal(row);
    },
  });
}

function exportarAdmissoes() {
  exportCsv('admissoes', [
    { key: 'nome', label: 'Candidato' },
    { key: 'cpf', label: 'CPF' },
    { key: 'cargo', label: 'Cargo' },
    { key: 'empresa', label: 'Empresa' },
    { key: 'coordenacao', label: 'Coordenação' },
    { key: 'supervisao', label: 'Supervisão' },
    { key: 'data_admissao_prevista', label: 'Admissão prevista', fmt: brDate },
    { key: 'telefone', label: 'Telefone' },
    { key: 'email', label: 'E-mail' },
    { key: 'status', label: 'Status', fmt: (v) => STATUS_ADMISSAO[v]?.label || v },
    { key: 'observacoes', label: 'Observações' },
  ], admissoesFiltradas());
}

function openNovaAdmissaoModal(row = null) {
  const modal = document.getElementById('eqModal');
  const d = (v) => v ? String(v).slice(0, 10) : '';
  modal.innerHTML = `<div class="eq-modal-card">
    <div class="section-head"><div><h3>${row ? 'Editar Admissão' : 'Nova Admissão'}</h3><p class="muted">${row ? 'Dados do processo de admissão.' : 'Cadastro inicial do processo de admissão.'}</p></div><button class="btn btn-secondary" id="mClose" type="button">Fechar</button></div>
    <div class="eq-grid mt-16">
      <label class="eq-full">Nome completo *<input id="admNome" type="text" required value="${esc(row?.nome || '')}"></label>
      <label>CPF<input id="admCpf" type="text" value="${esc(row?.cpf || '')}"></label>
      <label>Data de nascimento<input id="admNasc" type="date" value="${d(row?.data_nascimento)}"></label>
      <label>Cargo<input id="admCargo" type="text" value="${esc(row?.cargo || '')}"></label>
      <label>Empresa<input id="admEmpresa" type="text" value="${esc(row?.empresa || '')}"></label>
      <label>Coordenação<input id="admCoord" type="text" value="${esc(row?.coordenacao || '')}"></label>
      <label>Supervisão<input id="admSup" type="text" value="${esc(row?.supervisao || '')}"></label>
      <label>Data de admissão prevista<input id="admData" type="date" value="${d(row?.data_admissao_prevista)}"></label>
      <label>Telefone<input id="admTel" type="text" value="${esc(row?.telefone || '')}"></label>
      <label>E-mail<input id="admEmail" type="email" value="${esc(row?.email || '')}"></label>
      <label class="eq-full">Observações<textarea id="admObs" rows="2">${esc(row?.observacoes || '')}</textarea></label>
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
      };
      if (row) {
        payload.updated_at = new Date().toISOString();
        const { error } = await supabase.from('rh_admissoes').update(payload).eq('id', row.id);
        if (error) throw error;
      } else {
        payload.created_by = state.ctx?.user?.id || null;
        const { error } = await supabase.from('rh_admissoes').insert(payload);
        if (error) throw error;
      }
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
      <div style="display:grid;gap:8px">${docs.map((doc) => `<div class="eq-doc-row"><span>${esc(doc.tipo_documento)}</span><span class="eq-doc-acts">
        ${doc.arquivo_url ? anexoBtnHtml(doc.arquivo_url) : ''}
        <button class="btn btn-small btn-secondary" data-doc-anexar="${esc(doc.id)}" type="button">${doc.arquivo_url ? 'Trocar arquivo' : '📎 Anexar arquivo'}</button>
        ${doc.status === 'recebido' ? '<span style="color:#86efac;font-weight:700;font-size:12px">Recebido</span>' : `<button class="btn btn-small btn-secondary" data-doc-receber="${esc(doc.id)}" type="button">Marcar recebido</button>`}
      </span></div>`).join('') || '<p class="muted">Nenhum documento solicitado ainda.</p>'}</div>
      ${docsPendentes.length ? `<div class="mt-8"><select id="docTipoNovo" class="eq-full">${docsPendentes.map((t) => `<option value="${esc(t)}">${esc(t)}</option>`).join('')}</select><button class="btn btn-small btn-secondary mt-8" id="docSolicitar" type="button">+ Solicitar documento</button></div>` : ''}
      <input id="docFileInput" type="file" accept=".pdf,.png,.jpg,.jpeg,.webp" style="display:none">
    </div>
    <div class="eq-actions mt-16">
      ${cfg.next ? `<button class="btn btn-primary" id="admAvancar" type="button">${esc(cfg.nextLabel)}</button>` : ''}
      <button class="btn btn-secondary" id="admEditar" type="button">Editar dados</button>
    </div>
    <span class="eq-feedback mt-8" id="admModalFb"></span>
  </div>`;
  modal.classList.add('open');
  bindAnexoButtons(modal);
  modal.querySelector('#mClose').onclick = () => modal.classList.remove('open');
  modal.querySelector('#admEditar').onclick = () => openNovaAdmissaoModal(a);

  // Upload do documento digitalizado: um input file escondido compartilhado —
  // o clique em "Anexar" guarda o doc alvo e dispara o seletor de arquivo.
  const fileInput = modal.querySelector('#docFileInput');
  let docAlvo = null;
  modal.querySelectorAll('[data-doc-anexar]').forEach((b) => b.onclick = () => { docAlvo = b.dataset.docAnexar; fileInput.click(); });
  fileInput.onchange = async () => {
    const fb = modal.querySelector('#admModalFb');
    const file = fileInput.files?.[0];
    if (!file || !docAlvo) return;
    try {
      fb.textContent = 'Enviando arquivo...'; fb.classList.remove('err');
      if (file.size > 20 * 1024 * 1024) throw new Error('Arquivo acima de 20MB.');
      const nomeSeguro = file.name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80);
      const path = `admissoes/${a.id}/${Date.now()}-${nomeSeguro}`;
      const { error: upErr } = await supabase.storage.from(RH_ANEXOS_BUCKET).upload(path, file, { upsert: false });
      if (upErr) throw upErr;
      const { error } = await supabase.from('rh_documentos_registro').update({ arquivo_url: path, status: 'recebido', updated_at: new Date().toISOString() }).eq('id', docAlvo);
      if (error) throw error;
      await loadAdmissoes();
      openAdmissaoModal(id);
    } catch (e) { fb.textContent = `Falha no anexo: ${e.message}`; fb.classList.add('err'); }
  };

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
  ${filtrosHtml('adm')}
  <div class="eq-table-wrap mt-16"><table class="eq-table"><thead><tr><th>Candidato</th><th>Cargo</th><th>Admissão prevista</th><th>Status</th><th></th><th>Ações</th></tr></thead><tbody id="eqAdmBody"><tr><td colspan="6" class="eq-empty">Carregando...</td></tr></tbody></table></div>`;
  area.querySelector('#eqAdmNova').onclick = () => openNovaAdmissaoModal();
  bindFiltros(area, 'adm', () => { state.filtros = lerFiltros(area, 'adm'); renderAdmissoesTable(); });
  area.querySelector('#admExportar').onclick = exportarAdmissoes;
  loadAdmissoes();
}

// ---------- Integração ----------

async function loadIntegracoes() {
  state.integracoes = await safe(() => supabase.from('rh_integracao').select('*').order('created_at', { ascending: false }).limit(500));
  renderIntegracoesTable();
}

function integracoesFiltradas() {
  return aplicarFiltros(state.integracoes, state.filtros, {});
}

function progressoIntegracao(i) {
  const etapas = Array.isArray(i.etapas) ? i.etapas : [];
  const feitas = etapas.filter((e) => e.done).length;
  return `${feitas}/${etapas.length}`;
}

function renderIntegracoesTable() {
  const body = document.getElementById('eqIntBody');
  if (!body) return;
  const rows = integracoesFiltradas();
  if (!rows.length) {
    body.innerHTML = `<tr><td colspan="6" class="eq-empty">${state.integracoes.length ? 'Nenhuma integração no filtro atual.' : 'Nenhuma integração em andamento. Clique em <b>+ Nova Integração</b> para começar.'}</td></tr>`;
    return;
  }
  body.innerHTML = rows.map((i) => `<tr>
    <td><b>${esc(i.colaborador_nome)}</b></td>
    <td>${esc(i.responsavel || '-')}</td>
    <td>${progressoIntegracao(i)} etapas</td>
    <td>${statusPill(i.status, STATUS_INTEGRACAO)}</td>
    <td><button class="btn btn-small btn-secondary" data-int-ver="${esc(i.id)}" type="button">Ver</button></td>
    <td>${acoesHtml(i.id)}</td>
  </tr>`).join('');
  body.querySelectorAll('[data-int-ver]').forEach((b) => b.onclick = () => openIntegracaoModal(b.dataset.intVer));
  bindAcoes(body, {
    table: 'rh_integracao',
    reload: loadIntegracoes,
    descricao: 'esta integração',
    onEdit: (id) => {
      const row = state.integracoes.find((i) => String(i.id) === String(id));
      if (row) openNovaIntegracaoModal(row);
    },
  });
}

function exportarIntegracoes() {
  exportCsv('integracoes', [
    { key: 'colaborador_nome', label: 'Colaborador' },
    { key: 'responsavel', label: 'Responsável' },
    { key: 'etapas', label: 'Progresso', fmt: (v) => { const e = Array.isArray(v) ? v : []; return `${e.filter((x) => x.done).length}/${e.length}`; } },
    { key: 'status', label: 'Status', fmt: (v) => STATUS_INTEGRACAO[v]?.label || v },
    { key: 'data_conclusao', label: 'Concluída em', fmt: brDate },
  ], integracoesFiltradas());
}

function openNovaIntegracaoModal(row = null) {
  const modal = document.getElementById('eqModal');
  let selecionado = null;
  modal.innerHTML = `<div class="eq-modal-card">
    <div class="section-head"><div><h3>${row ? 'Editar Integração' : 'Nova Integração'}</h3><p class="muted">Checklist de onboarding do colaborador.</p></div><button class="btn btn-secondary" id="mClose" type="button">Fechar</button></div>
    <div class="mt-16" style="position:relative">
      <label class="eq-full">Colaborador *<input id="intColabInput" type="text" placeholder="Digite o nome para pesquisar..." autocomplete="off" value="${esc(row?.colaborador_nome || '')}"></label>
      <div id="intColabSug" style="display:none;position:absolute;top:100%;left:0;right:0;z-index:50;background:#071b13;border:1px solid var(--line);border-radius:14px;padding:6px;max-height:200px;overflow:auto;margin-top:4px"></div>
    </div>
    <label class="eq-full mt-16">Responsável pela integração<input id="intResp" type="text" value="${esc(row?.responsavel || '')}"></label>
    <div class="eq-actions mt-16"><button class="btn btn-primary" id="intSalvar" type="button">Salvar</button><button class="btn btn-secondary" id="intCancelar" type="button">Cancelar</button></div>
    <span class="eq-feedback mt-8" id="intFeedback"></span>
  </div>`;
  modal.classList.add('open');
  const input = modal.querySelector('#intColabInput');
  colabAutocomplete(modal, '#intColabInput', '#intColabSug', (c) => { selecionado = c; });
  modal.querySelector('#mClose').onclick = () => modal.classList.remove('open');
  modal.querySelector('#intCancelar').onclick = () => modal.classList.remove('open');
  modal.querySelector('#intSalvar').onclick = async () => {
    const fb = modal.querySelector('#intFeedback');
    const nome = selecionado?.nome || input.value.trim();
    if (!nome) { fb.textContent = 'Selecione o colaborador.'; fb.classList.add('err'); return; }
    try {
      if (row) {
        const payload = {
          colaborador_id: selecionado?.id || row.colaborador_id || null,
          colaborador_nome: nome,
          responsavel: modal.querySelector('#intResp').value.trim() || null,
          updated_at: new Date().toISOString(),
        };
        const { error } = await supabase.from('rh_integracao').update(payload).eq('id', row.id);
        if (error) throw error;
      } else {
        const payload = {
          colaborador_id: selecionado?.id || null,
          colaborador_nome: nome,
          responsavel: modal.querySelector('#intResp').value.trim() || null,
          etapas: ETAPAS_INTEGRACAO_PADRAO.map((label) => ({ label, done: false })),
          status: 'em_andamento',
        };
        const { error } = await supabase.from('rh_integracao').insert(payload);
        if (error) throw error;
      }
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
    <div class="section-head"><div><h3>${esc(i.colaborador_nome)}</h3><p class="muted">${statusPill(i.status, STATUS_INTEGRACAO)}</p></div><button class="btn btn-secondary" id="mClose" type="button">Fechar</button></div>
    <div class="eq-checklist mt-16">${etapas.map((e, idx) => `<label><input type="checkbox" data-etapa="${idx}" ${e.done ? 'checked' : ''}> ${esc(e.label)}</label>`).join('')}</div>
    ${i.status !== 'concluida' ? `<div class="eq-etapa-add"><input id="intEtapaNova" type="text" placeholder="Adicionar etapa extra (ex.: treinamento específico)"><button class="btn btn-small btn-secondary" id="intEtapaAdd" type="button">+ Adicionar</button></div>` : ''}
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
  modal.querySelector('#intEtapaAdd')?.addEventListener('click', async () => {
    const inp = modal.querySelector('#intEtapaNova');
    const label = inp.value.trim();
    if (!label) return;
    etapas.push({ label, done: false });
    await supabase.from('rh_integracao').update({ etapas }).eq('id', i.id);
    await loadIntegracoes();
    openIntegracaoModal(id);
  });
  modal.querySelector('#intConcluir')?.addEventListener('click', async () => {
    await supabase.from('rh_integracao').update({ status: 'concluida', data_conclusao: todayIso() }).eq('id', i.id);
    modal.classList.remove('open');
    await loadIntegracoes();
  });
}

function renderIntegracaoTab(area) {
  area.innerHTML = `<div class="section-head mt-16"><div><h3>Integração de Colaboradores</h3><p class="muted">Checklist de integração/onboarding dos colaboradores recém-admitidos.</p></div><button class="btn btn-primary" id="eqIntNova" type="button">+ Nova Integração</button></div>
  ${filtrosHtml('int', { periodo: false })}
  <div class="eq-table-wrap mt-16"><table class="eq-table"><thead><tr><th>Colaborador</th><th>Responsável</th><th>Progresso</th><th>Status</th><th></th><th>Ações</th></tr></thead><tbody id="eqIntBody"><tr><td colspan="6" class="eq-empty">Carregando...</td></tr></tbody></table></div>`;
  area.querySelector('#eqIntNova').onclick = () => openNovaIntegracaoModal();
  bindFiltros(area, 'int', () => { state.filtros = lerFiltros(area, 'int'); renderIntegracoesTable(); });
  area.querySelector('#intExportar').onclick = exportarIntegracoes;
  loadIntegracoes();
}

// ---------- Cadastro no Graint (manual, com apoio de "copiar dados") ----------

function textoGraint(a) {
  const linhas = [
    `Nome: ${a.nome || '-'}`,
    `CPF: ${a.cpf || '-'}`,
    `Nascimento: ${brDate(a.data_nascimento)}`,
    `Cargo: ${a.cargo || '-'}`,
    `Empresa: ${a.empresa || '-'}`,
    `Coordenação: ${a.coordenacao || '-'}`,
    `Supervisão: ${a.supervisao || '-'}`,
    `Admissão prevista: ${brDate(a.data_admissao_prevista)}`,
    `Telefone: ${a.telefone || '-'}`,
    `E-mail: ${a.email || '-'}`,
  ];
  return linhas.join('\n');
}

async function renderGraintTab(area) {
  area.innerHTML = `<div class="section-head mt-16"><div><h3>Cadastro no Graint</h3><p class="muted">Admissões prontas para cadastro manual no sistema Graint. O envio automático ainda não está disponível — use <b>Copiar dados</b>, cadastre no Graint e marque como concluído aqui.</p></div></div>
  <div class="eq-table-wrap mt-16"><table class="eq-table"><thead><tr><th>Candidato</th><th>CPF</th><th>Cargo</th><th>Admissão prevista</th><th>Ações</th></tr></thead><tbody id="eqGraintBody"><tr><td colspan="5" class="eq-empty">Carregando...</td></tr></tbody></table></div>`;
  const lista = await safe(() => supabase.from('rh_admissoes').select('*').eq('status', 'aguardando_graint').order('data_admissao_prevista', { ascending: true }));
  const body = area.querySelector('#eqGraintBody');
  if (!lista.length) { body.innerHTML = `<tr><td colspan="5" class="eq-empty">Nenhuma admissão aguardando cadastro no Graint.</td></tr>`; return; }
  body.innerHTML = lista.map((a) => `<tr>
    <td><b>${esc(a.nome)}</b>${a.telefone ? `<br><small class="muted">${esc(a.telefone)}</small>` : ''}</td>
    <td>${esc(a.cpf || '-')}</td>
    <td>${esc(a.cargo || '-')}</td>
    <td>${brDate(a.data_admissao_prevista)}</td>
    <td style="white-space:nowrap">
      <button class="btn btn-small btn-secondary" data-graint-copiar="${esc(a.id)}" type="button">📋 Copiar dados</button>
      <button class="btn btn-small btn-primary" data-graint-ok="${esc(a.id)}" type="button">Marcar como cadastrado</button>
    </td>
  </tr>`).join('');
  body.querySelectorAll('[data-graint-copiar]').forEach((b) => b.onclick = async () => {
    const a = lista.find((x) => String(x.id) === b.dataset.graintCopiar);
    if (!a) return;
    try {
      await navigator.clipboard.writeText(textoGraint(a));
      const original = b.textContent;
      b.textContent = '✓ Copiado';
      setTimeout(() => { b.textContent = original; }, 1500);
    } catch { alert(textoGraint(a)); }
  });
  body.querySelectorAll('[data-graint-ok]').forEach((b) => b.onclick = async () => {
    await supabase.from('rh_admissoes').update({ status: 'concluida' }).eq('id', b.dataset.graintOk);
    renderGraintTab(area);
  });
}

// ---------- Inativações (solicitadas pelo gestor na Programação > Sem O.S.) ----------

// Só conta pendentes (não depende de qual aba está aberta) — usado pro badge
// vermelho no botão da aba, pra RH perceber que tem pedido novo mesmo sem
// entrar na aba. Chamado uma vez no boot da tela.
async function refreshInativacoesBadge(container) {
  try {
    const { count, error } = await supabase.from('programacao_inativacao_solicitacoes').select('id', { count: 'exact', head: true }).eq('status', 'PENDENTE');
    if (error) throw error;
    state.inativacoesPendentesCount = count || 0;
  } catch (e) {
    console.warn('[Equipe] contagem inativações pendentes', e);
    state.inativacoesPendentesCount = 0;
  }
  const tabsEl = container.querySelector('.eq-tabs');
  if (tabsEl) tabsEl.outerHTML = tabsHtml();
  container.querySelectorAll('[data-eq-tab]').forEach((b) => b.onclick = () => { state.tab = b.dataset.eqTab; renderTab(container); });
}

async function loadInativacoes() {
  state.inativacoes = await safe(() => supabase.from('programacao_inativacao_solicitacoes').select('*').order('solicitado_em', { ascending: false }).limit(200));
}

function renderInativacoesList(area) {
  const pendentes = state.inativacoes.filter((r) => r.status === 'PENDENTE');
  const processadas = state.inativacoes.filter((r) => r.status !== 'PENDENTE').slice(0, 20);

  function cardHtml(r) {
    const isPendente = r.status === 'PENDENTE';
    const statusLabel = r.status === 'PROCESSADA' ? 'Processada' : r.status === 'CANCELADA' ? 'Cancelada' : 'Pendente';
    return `<div class="eq-inativ-card">
      <div class="eq-inativ-head">
        <div>
          <b>${esc(r.nome_colaborador)}</b>
          <div class="muted" style="font-size:12px">${esc(r.cargo || 'Colaborador')} · ${esc(r.coordenacao || r.supervisao || '-')} · pedido em ${brDate(r.solicitado_em)}</div>
        </div>
        ${statusPill(r.status, { PENDENTE: { label: 'Pendente' }, PROCESSADA: { label: 'Processada' }, CANCELADA: { label: 'Cancelada' } })}
      </div>
      <p class="eq-inativ-motivo"><b>Motivo:</b> ${esc(r.motivo)}</p>
      ${r.observacao_rh ? `<p class="eq-inativ-motivo"><b>Observação RH:</b> ${esc(r.observacao_rh)}</p>` : ''}
      ${isPendente ? `<div class="eq-inativ-actions">
        <input type="text" class="eq-inativ-obs" data-obs-rh="${esc(r.id)}" placeholder="Observação (opcional)">
        <button class="btn btn-small btn-primary" data-processar="${esc(r.id)}" type="button">Marcar como processada</button>
        <button class="btn btn-small btn-secondary" data-cancelar="${esc(r.id)}" type="button">Cancelar pedido</button>
      </div>` : (r.processado_por_nome ? `<div class="muted mt-8" style="font-size:12px">${statusLabel} por ${esc(r.processado_por_nome)} em ${brDate(r.processado_em)}</div>` : '')}
    </div>`;
  }

  area.innerHTML = `<div class="section-head mt-16"><div><h3>Inativações solicitadas</h3><p class="muted">Pedidos de inativação feitos pelo gestor na Programação (Etapa "Sem O.S."). O clique do gestor não desliga ninguém — processe aqui e realize a inativação no cadastro/GRM.</p></div></div>
  <div class="mt-16">${pendentes.length ? pendentes.map(cardHtml).join('') : '<p class="eq-empty">Nenhuma solicitação pendente.</p>'}</div>
  ${processadas.length ? `<div class="section-head mt-16"><div><h3>Histórico recente</h3></div></div><div class="mt-16">${processadas.map(cardHtml).join('')}</div>` : ''}`;

  area.querySelectorAll('[data-processar]').forEach((b) => b.onclick = async () => {
    const id = b.dataset.processar;
    const obs = area.querySelector(`[data-obs-rh="${id}"]`)?.value?.trim() || null;
    b.disabled = true;
    try {
      const { error } = await supabase.from('programacao_inativacao_solicitacoes').update({
        status: 'PROCESSADA',
        observacao_rh: obs,
        processado_por: state.ctx?.user?.id || null,
        processado_por_nome: state.ctx?.user?.email || null,
        processado_em: new Date().toISOString(),
      }).eq('id', id);
      if (error) throw error;
      await loadInativacoes();
      renderInativacoesList(area);
    } catch (e) { alert(e.message); b.disabled = false; }
  });
  area.querySelectorAll('[data-cancelar]').forEach((b) => b.onclick = async () => {
    if (!confirm('Cancelar esta solicitação de inativação?')) return;
    const id = b.dataset.cancelar;
    const obs = area.querySelector(`[data-obs-rh="${id}"]`)?.value?.trim() || null;
    b.disabled = true;
    try {
      const { error } = await supabase.from('programacao_inativacao_solicitacoes').update({
        status: 'CANCELADA',
        observacao_rh: obs,
        processado_por: state.ctx?.user?.id || null,
        processado_por_nome: state.ctx?.user?.email || null,
        processado_em: new Date().toISOString(),
      }).eq('id', id);
      if (error) throw error;
      await loadInativacoes();
      renderInativacoesList(area);
    } catch (e) { alert(e.message); b.disabled = false; }
  });
}

async function renderInativacoesTab(area, container) {
  area.innerHTML = `<div class="eq-empty mt-16">Carregando...</div>`;
  await loadInativacoes();
  renderInativacoesList(area);
  await refreshInativacoesBadge(container);
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
  state.filtros = null;
  area.innerHTML = `<div class="eq-empty mt-16">Carregando...</div>`;
  if (state.tab === 'admissoes') renderAdmissoesTab(area);
  else if (state.tab === 'integracao') renderIntegracaoTab(area);
  else if (state.tab === 'graint') renderGraintTab(area);
  else if (state.tab === 'inativacoes') renderInativacoesTab(area, container);
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
  if (state.tab !== 'inativacoes') refreshInativacoesBadge(content).catch(() => {});
}

initProtectedPage('Equipe', renderContent);
