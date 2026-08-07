import { initProtectedPage } from './pageInit.js';
import { supabase } from './supabaseClient.js';
import {
  esc, brDate, todayIso, colabAutocomplete,
  filtrosHtml, filtrosStyle, bindFiltros, lerFiltros, aplicarFiltros,
  exportCsv, acoesHtml, bindAcoes,
  resolverAnexo, anexoBtnHtml, bindAnexoButtons, RH_ANEXOS_BUCKET,
} from './rhShared.js';

const TABS = [
  { id: 'gestores', label: 'Gestores' },
  { id: 'administracao', label: 'Administração' },
  { id: 'plantao', label: 'Plantão' },
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

const state = { tab: 'gestores', admissoes: [], integracoes: [], inativacoes: [], tiposContratoInativacoes: new Map(), gestores: [], administracao: [], usuarios: [], plantaoConfig: [], plantaoEditores: [], inativacoesPendentesCount: 0, ctx: null, filtros: null };

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
    .eq-table tbody tr:hover{background:rgba(255,255,255,.025)}
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
    .eq-inativ-grid{overflow:hidden;border:1px solid rgba(148,163,184,.16);border-radius:14px;background:rgba(2,6,23,.2)}
    .eq-inativ-grid-head,.eq-inativ-card{display:grid;grid-template-columns:minmax(240px,1.25fr) minmax(120px,.65fr) minmax(150px,.8fr) minmax(220px,1.2fr) 48px 48px;align-items:center;min-width:0}
    .eq-inativ-grid-head{min-height:34px;background:rgba(255,255,255,.025);border-bottom:1px solid rgba(148,163,184,.16);color:#8ca397;font-size:10px;font-weight:900;letter-spacing:.07em;text-transform:uppercase}
    .eq-inativ-grid-head>span,.eq-inativ-cell{min-width:0;padding:8px 12px;border-right:1px solid rgba(148,163,184,.1);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .eq-inativ-grid-head>span:last-child,.eq-inativ-cell:last-child{border-right:0}
    .eq-inativ-card{min-height:44px;border-bottom:1px solid rgba(148,163,184,.1);color:#dbe7e1;font-size:12.5px;transition:background .15s ease}
    .eq-inativ-card:last-child{border-bottom:0}.eq-inativ-card:hover{background:rgba(34,197,94,.035)}
    .eq-inativ-name{color:#f8fafc;font-weight:850}.eq-inativ-type{color:#b7d7c7}.eq-inativ-reason{color:#cbd5e1}
    .eq-inativ-action{display:grid;place-items:center;padding:4px}
    .eq-inativ-icon-btn{width:30px;height:30px;display:grid;place-items:center;border-radius:8px;border:1px solid rgba(148,163,184,.18);background:rgba(255,255,255,.025);font:inherit;font-size:17px;font-weight:900;cursor:pointer;transition:.15s ease}
    .eq-inativ-icon-btn.process{color:#86efac}.eq-inativ-icon-btn.cancel{color:#fca5a5}.eq-inativ-icon-btn:hover{transform:translateY(-1px);background:rgba(255,255,255,.06)}.eq-inativ-icon-btn:disabled{cursor:wait;opacity:.5}
    .eq-inativ-result{font-size:17px;font-weight:900}.eq-inativ-result.ok{color:#86efac}.eq-inativ-result.cancel{color:#fca5a5}.eq-inativ-result.muted{color:#64748b}
    .eq-person{display:flex;align-items:center;gap:10px;min-width:190px}.eq-avatar{width:34px;height:34px;display:grid;place-items:center;flex:0 0 auto;border-radius:11px;background:rgba(34,197,94,.12);border:1px solid rgba(74,222,128,.22);color:#86efac;font-size:12px;font-weight:900}.eq-person small{display:block;color:var(--muted);margin-top:2px}.eq-sector{display:inline-flex;padding:6px 10px;border-radius:999px;background:rgba(59,130,246,.1);border:1px solid rgba(96,165,250,.2);color:#bfdbfe;font-size:12px;font-weight:800}.eq-structure-intro{display:grid;grid-template-columns:1fr auto;gap:16px;align-items:center}.eq-structure-intro h3{margin:0 0 5px}.eq-structure-intro p{margin:0}.eq-row-actions{display:flex;gap:6px;white-space:nowrap}.eq-row-actions .btn{padding:7px 10px}.eq-form-help{font-size:12px;color:var(--muted);margin-top:5px;display:block}
    .eq-duty-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.eq-duty-card{border:1px solid rgba(148,163,184,.18);border-radius:18px;padding:18px;background:rgba(2,6,23,.28)}.eq-duty-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px}.eq-duty-head h4{margin:0;font-size:18px}.eq-duty-lock{font-size:11px;font-weight:900;text-transform:uppercase;letter-spacing:.06em;padding:5px 8px;border-radius:999px;background:rgba(245,158,11,.1);border:1px solid rgba(245,158,11,.22);color:#fcd34d}.eq-duty-lock.can{background:rgba(34,197,94,.1);border-color:rgba(34,197,94,.22);color:#86efac}.eq-duty-times{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin-top:16px}.eq-duty-times label{font-size:11px;color:var(--muted)}.eq-duty-times input{width:100%;box-sizing:border-box;margin-top:5px;border:1px solid rgba(148,163,184,.24);background:#0d0d18;color:#e2e2f0;border-radius:10px;padding:9px;color-scheme:dark}.eq-duty-editors{display:flex;gap:7px;flex-wrap:wrap;margin-top:14px}.eq-duty-editor{display:inline-flex;align-items:center;gap:6px;padding:6px 9px;border-radius:999px;background:#10101e;border:1px solid rgba(255,255,255,.08);font-size:12px}.eq-duty-editor button{border:0;background:transparent;color:#fca5a5;cursor:pointer;padding:0}.eq-duty-add{display:flex;gap:8px;margin-top:10px}.eq-duty-add select{flex:1;min-width:0;border:1px solid rgba(148,163,184,.24);background:#0d0d18;color:#e2e2f0;border-radius:10px;padding:9px;color-scheme:dark}
    @media(max-width:900px){.eq-duty-grid{grid-template-columns:1fr}.eq-inativ-grid-head{display:none}.eq-inativ-grid{border:0;background:transparent;overflow:visible}.eq-inativ-card{grid-template-columns:1fr 1fr 42px 42px;margin-bottom:8px;border:1px solid rgba(148,163,184,.16);border-radius:12px;background:rgba(2,6,23,.28)}.eq-inativ-cell{border-right:0}.eq-inativ-name,.eq-inativ-reason{grid-column:1/-1}.eq-inativ-cell::before{content:attr(data-label);display:block;margin-bottom:3px;color:#71877c;font-size:9px;font-weight:900;letter-spacing:.06em;text-transform:uppercase}.eq-inativ-action::before{display:none}}
    @media(max-width:760px){.eq-grid{grid-template-columns:1fr}.eq-full{grid-column:auto}.eq-structure-intro{grid-template-columns:1fr}.eq-structure-intro .btn{width:100%}.eq-duty-times{grid-template-columns:repeat(2,1fr)}}
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
  const cpfs = [...new Set(state.inativacoes.map((r) => String(r.colaborador_id || '').replace(/\D/g, '')).filter(Boolean))];
  const contratos = cpfs.length
    ? await safe(() => supabase.from('colaborador_cruzamento').select('cpf,tipo_contrato').in('cpf', cpfs))
    : [];
  state.tiposContratoInativacoes = new Map(contratos.map((r) => [String(r.cpf || '').replace(/\D/g, ''), r.tipo_contrato]));
}

function renderInativacoesList(area) {
  const pendentes = state.inativacoes.filter((r) => r.status === 'PENDENTE');
  const processadas = state.inativacoes.filter((r) => r.status !== 'PENDENTE').slice(0, 20);
  const gridHead = `<div class="eq-inativ-grid-head"><span>Colaborador</span><span>Tipo</span><span>Supervisão</span><span>Motivo</span><span title="Processar">✓</span><span title="Cancelar">×</span></div>`;

  function cardHtml(r) {
    const isPendente = r.status === 'PENDENTE';
    const tipoRaw = state.tiposContratoInativacoes.get(String(r.colaborador_id || '').replace(/\D/g, '')) || '';
    const tipoNorm = String(tipoRaw).toUpperCase();
    const tipo = tipoNorm.includes('INTERMITENTE') ? 'Intermitente' : tipoNorm.includes('DIARISTA') ? 'Diarista' : tipoNorm.includes('EFETIVO') ? 'Efetivo' : 'Não informado';
    const supervisao = r.supervisao || r.coordenacao || 'Não informada';
    return `<div class="eq-inativ-card">
      <div class="eq-inativ-cell eq-inativ-name" data-label="Colaborador" title="${esc(r.nome_colaborador)}">${esc(r.nome_colaborador)}</div>
      <div class="eq-inativ-cell eq-inativ-type" data-label="Tipo">${esc(tipo)}</div>
      <div class="eq-inativ-cell" data-label="Supervisão" title="${esc(supervisao)}">${esc(supervisao)}</div>
      <div class="eq-inativ-cell eq-inativ-reason" data-label="Motivo" title="${esc(r.motivo)}">${esc(r.motivo)}</div>
      ${isPendente
        ? `<div class="eq-inativ-cell eq-inativ-action"><button class="eq-inativ-icon-btn process" data-processar="${esc(r.id)}" type="button" title="Marcar como processada" aria-label="Marcar ${esc(r.nome_colaborador)} como processada">✓</button></div>
          <div class="eq-inativ-cell eq-inativ-action"><button class="eq-inativ-icon-btn cancel" data-cancelar="${esc(r.id)}" type="button" title="Cancelar pedido" aria-label="Cancelar pedido de ${esc(r.nome_colaborador)}">×</button></div>`
        : `<div class="eq-inativ-cell eq-inativ-action"><span class="eq-inativ-result ${r.status === 'PROCESSADA' ? 'ok' : 'muted'}" title="${r.status === 'PROCESSADA' ? 'Processada' : 'Não processada'}">${r.status === 'PROCESSADA' ? '✓' : '—'}</span></div>
          <div class="eq-inativ-cell eq-inativ-action"><span class="eq-inativ-result ${r.status === 'CANCELADA' ? 'cancel' : 'muted'}" title="${r.status === 'CANCELADA' ? 'Cancelada' : 'Não cancelada'}">${r.status === 'CANCELADA' ? '×' : '—'}</span></div>`}
    </div>`;
  }

  area.innerHTML = `<div class="section-head mt-16"><div><h3>Inativações solicitadas</h3><p class="muted">Pedidos de inativação feitos pelo gestor na Programação (Etapa "Sem O.S."). O clique do gestor não desliga ninguém — processe aqui e realize a inativação no cadastro/GRM.</p></div></div>
  <div class="mt-16">${pendentes.length ? `<div class="eq-inativ-grid">${gridHead}${pendentes.map(cardHtml).join('')}</div>` : '<p class="eq-empty">Nenhuma solicitação pendente.</p>'}</div>
  ${processadas.length ? `<div class="section-head mt-16"><div><h3>Histórico recente</h3></div></div><div class="mt-16 eq-inativ-grid">${gridHead}${processadas.map(cardHtml).join('')}</div>` : ''}`;

  area.querySelectorAll('[data-processar]').forEach((b) => b.onclick = async () => {
    const id = b.dataset.processar;
    b.disabled = true;
    try {
      const { error } = await supabase.from('programacao_inativacao_solicitacoes').update({
        status: 'PROCESSADA',
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
    b.disabled = true;
    try {
      const { error } = await supabase.from('programacao_inativacao_solicitacoes').update({
        status: 'CANCELADA',
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

// ---------- Estrutura da equipe (Gestores e Administração) ----------

function usuario(id) {
  return state.usuarios.find((item) => String(item.id) === String(id)) || null;
}

function iniciais(nome = '') {
  return String(nome).trim().split(/\s+/).slice(0, 2).map((parte) => parte[0] || '').join('').toUpperCase() || '?';
}

function pessoaHtml(id, vazio = 'Não definido') {
  const item = usuario(id);
  if (!item) return `<span class="muted">${esc(vazio)}</span>`;
  return `<div class="eq-person"><span class="eq-avatar">${esc(iniciais(item.nome || item.email))}</span><span><b>${esc(item.nome || item.email || '-')}</b><small>${esc(item.email || item.setor || '')}</small></span></div>`;
}

function usuarioOptions(selectedId = '', filtro = null) {
  const lista = filtro ? state.usuarios.filter(filtro) : state.usuarios;
  return `<option value="">Selecione...</option>${lista.map((item) => `<option value="${esc(item.id)}" ${String(selectedId) === String(item.id) ? 'selected' : ''}>${esc(item.nome || item.email)}${item.setor ? ` — ${esc(item.setor)}` : ''}</option>`).join('')}`;
}

async function loadEstrutura() {
  const [usuariosRes, gestoresRes, administracaoRes] = await Promise.all([
    supabase.rpc('equipe_listar_usuarios'),
    supabase.from('equipe_gestores_regionais').select('*').order('regional'),
    supabase.from('equipe_administracao_usuarios').select('*').order('setor').order('funcao'),
  ]);
  if (usuariosRes.error) throw usuariosRes.error;
  if (gestoresRes.error) throw gestoresRes.error;
  if (administracaoRes.error) throw administracaoRes.error;
  state.usuarios = usuariosRes.data || [];
  state.gestores = gestoresRes.data || [];
  state.administracao = administracaoRes.data || [];
}

function openGestorModal(row = null) {
  const modal = document.getElementById('eqModal');
  modal.innerHTML = `<div class="eq-modal-card">
    <div class="section-head"><div><h3>${row ? 'Editar regional' : 'Relacionar regional'}</h3><p class="muted">Defina quem responde pela supervisão e pelo suporte desta regional.</p></div><button class="btn btn-secondary" id="mClose" type="button">Fechar</button></div>
    <div class="eq-grid mt-16">
      <label class="eq-full">Regional *<input id="egRegional" type="text" maxlength="120" value="${esc(row?.regional || '')}" placeholder="Ex.: MATO GROSSO MT2"></label>
      <label>Supervisor<select id="egSupervisor">${usuarioOptions(row?.supervisor_usuario_id)}</select></label>
      <label>Suporte<select id="egSuporte">${usuarioOptions(row?.suporte_usuario_id)}</select></label>
    </div>
    <span class="eq-form-help">É necessário informar ao menos um responsável.</span>
    <div class="eq-actions mt-16"><button class="btn btn-primary" id="egSalvar" type="button">Salvar relação</button><button class="btn btn-secondary" id="egCancelar" type="button">Cancelar</button></div>
    <span class="eq-feedback mt-8" id="egFeedback"></span>
  </div>`;
  modal.classList.add('open');
  const close = () => modal.classList.remove('open');
  modal.querySelector('#mClose').onclick = close;
  modal.querySelector('#egCancelar').onclick = close;
  modal.querySelector('#egSalvar').onclick = async () => {
    const fb = modal.querySelector('#egFeedback');
    const payload = {
      regional: modal.querySelector('#egRegional').value.trim(),
      supervisor_usuario_id: modal.querySelector('#egSupervisor').value || null,
      suporte_usuario_id: modal.querySelector('#egSuporte').value || null,
    };
    if (!payload.regional || (!payload.supervisor_usuario_id && !payload.suporte_usuario_id)) {
      fb.textContent = 'Informe a regional e ao menos um responsável.'; fb.classList.add('err'); return;
    }
    try {
      const query = row
        ? supabase.from('equipe_gestores_regionais').update(payload).eq('id', row.id)
        : supabase.from('equipe_gestores_regionais').insert(payload);
      const { error } = await query;
      if (error) throw error;
      close();
      await renderGestoresTab(document.getElementById('eqTabContent'));
    } catch (e) { fb.textContent = e.code === '23505' ? 'Esta regional já está cadastrada.' : e.message; fb.classList.add('err'); }
  };
}

async function renderGestoresTab(area) {
  area.innerHTML = '<div class="eq-empty mt-16">Carregando estrutura...</div>';
  try { await loadEstrutura(); } catch (e) { area.innerHTML = `<div class="eq-empty mt-16">Não foi possível carregar: ${esc(e.message)}</div>`; return; }
  area.innerHTML = `<section class="card mt-16">
    <div class="eq-structure-intro"><div><h3>Gestores regionais</h3><p class="muted">Relação oficial de Supervisor e Suporte responsável por cada regional.</p></div><button class="btn btn-primary" id="egNovo" type="button">+ Relacionar regional</button></div>
    <div class="eq-table-wrap mt-16"><table class="eq-table"><thead><tr><th>Regional</th><th>Supervisor</th><th>Suporte</th><th>Ações</th></tr></thead><tbody>
      ${state.gestores.length ? state.gestores.map((row) => `<tr><td><b>${esc(row.regional)}</b></td><td>${pessoaHtml(row.supervisor_usuario_id)}</td><td>${pessoaHtml(row.suporte_usuario_id)}</td><td><div class="eq-row-actions"><button class="btn btn-small btn-secondary" data-eg-edit="${esc(row.id)}" type="button">Editar</button><button class="btn btn-small btn-secondary" data-eg-del="${esc(row.id)}" type="button">Excluir</button></div></td></tr>`).join('') : '<tr><td colspan="4" class="eq-empty">Nenhuma regional relacionada.</td></tr>'}
    </tbody></table></div>
  </section>`;
  area.querySelector('#egNovo').onclick = () => openGestorModal();
  area.querySelectorAll('[data-eg-edit]').forEach((btn) => btn.onclick = () => openGestorModal(state.gestores.find((row) => String(row.id) === btn.dataset.egEdit)));
  area.querySelectorAll('[data-eg-del]').forEach((btn) => btn.onclick = async () => {
    const row = state.gestores.find((item) => String(item.id) === btn.dataset.egDel);
    if (!row || !confirm(`Excluir a relação da regional ${row.regional}?`)) return;
    const { error } = await supabase.from('equipe_gestores_regionais').delete().eq('id', row.id);
    if (error) return alert(error.message);
    renderGestoresTab(area);
  });
}

function openAdministracaoModal(row = null) {
  const modal = document.getElementById('eqModal');
  const setores = [...new Set([...state.administracao.map((item) => item.setor), ...state.usuarios.map((item) => item.setor)].filter(Boolean))].sort();
  modal.innerHTML = `<div class="eq-modal-card">
    <div class="section-head"><div><h3>${row ? 'Editar integrante' : 'Adicionar integrante'}</h3><p class="muted">Relacione o usuário ao setor e descreva sua função.</p></div><button class="btn btn-secondary" id="mClose" type="button">Fechar</button></div>
    <div class="eq-grid mt-16">
      <label>Setor *<input id="eaSetor" type="text" list="eaSetores" maxlength="100" value="${esc(row?.setor || '')}" placeholder="Ex.: Financeiro"><datalist id="eaSetores">${setores.map((setor) => `<option value="${esc(setor)}">`).join('')}</datalist></label>
      <label>Usuário *<select id="eaUsuario">${usuarioOptions(row?.usuario_id)}</select></label>
      <label class="eq-full">Função *<input id="eaFuncao" type="text" maxlength="120" value="${esc(row?.funcao || '')}" placeholder="Ex.: Analista financeiro"></label>
    </div>
    <div class="eq-actions mt-16"><button class="btn btn-primary" id="eaSalvar" type="button">Salvar integrante</button><button class="btn btn-secondary" id="eaCancelar" type="button">Cancelar</button></div>
    <span class="eq-feedback mt-8" id="eaFeedback"></span>
  </div>`;
  modal.classList.add('open');
  const close = () => modal.classList.remove('open');
  modal.querySelector('#mClose').onclick = close;
  modal.querySelector('#eaCancelar').onclick = close;
  modal.querySelector('#eaSalvar').onclick = async () => {
    const fb = modal.querySelector('#eaFeedback');
    const payload = { setor: modal.querySelector('#eaSetor').value.trim(), usuario_id: modal.querySelector('#eaUsuario').value || null, funcao: modal.querySelector('#eaFuncao').value.trim() };
    if (!payload.setor || !payload.usuario_id || !payload.funcao) { fb.textContent = 'Preencha setor, usuário e função.'; fb.classList.add('err'); return; }
    try {
      const query = row
        ? supabase.from('equipe_administracao_usuarios').update(payload).eq('id', row.id)
        : supabase.from('equipe_administracao_usuarios').insert(payload);
      const { error } = await query;
      if (error) throw error;
      close();
      await renderAdministracaoTab(document.getElementById('eqTabContent'));
    } catch (e) { fb.textContent = e.code === '23505' ? 'Este usuário já está relacionado ao setor.' : e.message; fb.classList.add('err'); }
  };
}

async function renderAdministracaoTab(area) {
  area.innerHTML = '<div class="eq-empty mt-16">Carregando estrutura...</div>';
  try { await loadEstrutura(); } catch (e) { area.innerHTML = `<div class="eq-empty mt-16">Não foi possível carregar: ${esc(e.message)}</div>`; return; }
  area.innerHTML = `<section class="card mt-16">
    <div class="eq-structure-intro"><div><h3>Administração</h3><p class="muted">Usuários organizados por setor, com a função exercida por cada integrante.</p></div><button class="btn btn-primary" id="eaNovo" type="button">+ Adicionar integrante</button></div>
    <div class="eq-table-wrap mt-16"><table class="eq-table"><thead><tr><th>Setor</th><th>Usuário</th><th>Função</th><th>Ações</th></tr></thead><tbody>
      ${state.administracao.length ? state.administracao.map((row) => `<tr><td><span class="eq-sector">${esc(row.setor)}</span></td><td>${pessoaHtml(row.usuario_id, 'Usuário indisponível')}</td><td><b>${esc(row.funcao)}</b></td><td><div class="eq-row-actions"><button class="btn btn-small btn-secondary" data-ea-edit="${esc(row.id)}" type="button">Editar</button><button class="btn btn-small btn-secondary" data-ea-del="${esc(row.id)}" type="button">Excluir</button></div></td></tr>`).join('') : '<tr><td colspan="4" class="eq-empty">Nenhum integrante relacionado.</td></tr>'}
    </tbody></table></div>
  </section>`;
  area.querySelector('#eaNovo').onclick = () => openAdministracaoModal();
  area.querySelectorAll('[data-ea-edit]').forEach((btn) => btn.onclick = () => openAdministracaoModal(state.administracao.find((row) => String(row.id) === btn.dataset.eaEdit)));
  area.querySelectorAll('[data-ea-del]').forEach((btn) => btn.onclick = async () => {
    const row = state.administracao.find((item) => String(item.id) === btn.dataset.eaDel);
    if (!row || !confirm(`Remover ${usuario(row.usuario_id)?.nome || 'este usuário'} do setor ${row.setor}?`)) return;
    const { error } = await supabase.from('equipe_administracao_usuarios').delete().eq('id', row.id);
    if (error) return alert(error.message);
    renderAdministracaoTab(area);
  });
}

function timeValue(value) {
  return value ? String(value).slice(0, 5) : '';
}

async function loadPlantaoConfig() {
  if (!state.usuarios.length) {
    const { data, error } = await supabase.rpc('equipe_listar_usuarios');
    if (error) throw error;
    state.usuarios = data || [];
  }
  const [configRes, editoresRes] = await Promise.all([
    supabase.rpc('rh_plantao_setores_acesso'),
    supabase.from('rh_plantao_setor_editores').select('*').order('setor'),
  ]);
  if (configRes.error) throw configRes.error;
  if (editoresRes.error) throw editoresRes.error;
  state.plantaoConfig = configRes.data || [];
  state.plantaoEditores = editoresRes.data || [];
}

async function salvarHorarioSetor(card, config) {
  const payload = {
    hora_inicio: card.querySelector('[data-duty-time="hora_inicio"]').value,
    hora_fim: card.querySelector('[data-duty-time="hora_fim"]').value,
    hora_inicio_2: card.querySelector('[data-duty-time="hora_inicio_2"]').value || null,
    hora_fim_2: card.querySelector('[data-duty-time="hora_fim_2"]').value || null,
    updated_at: new Date().toISOString(),
  };
  const feedback = card.querySelector('[data-duty-feedback]');
  try {
    const { error } = await supabase.from('rh_plantao_setor_config').update(payload).eq('setor', config.setor);
    if (error) throw error;
    feedback.textContent = 'Horário padrão atualizado.';
    feedback.classList.remove('err');
  } catch (e) { feedback.textContent = e.message; feedback.classList.add('err'); }
}

function openNovoSetorPlantaoModal() {
  const modal = document.getElementById('eqModal');
  modal.innerHTML = `<div class="eq-modal-card"><div class="section-head"><div><h3>Novo setor no Plantão</h3><p class="muted">Cadastre o horário padrão; depois libere os usuários responsáveis.</p></div><button class="btn btn-secondary" id="mClose" type="button">Fechar</button></div><div class="eq-grid mt-16"><label class="eq-full">Setor *<input id="dutySetor" maxlength="100" placeholder="Ex.: Financeiro"></label><label>Entrada 1<input id="dutyI1" type="time" value="08:00"></label><label>Saída 1<input id="dutyF1" type="time" value="12:00"></label><label>Entrada 2<input id="dutyI2" type="time" value="13:30"></label><label>Saída 2<input id="dutyF2" type="time" value="18:00"></label></div><div class="eq-actions mt-16"><button class="btn btn-primary" id="dutyCreate" type="button">Criar setor</button><button class="btn btn-secondary" id="dutyCancel" type="button">Cancelar</button></div><span class="eq-feedback mt-8" id="dutyFb"></span></div>`;
  modal.classList.add('open');
  const close = () => modal.classList.remove('open');
  modal.querySelector('#mClose').onclick = close;
  modal.querySelector('#dutyCancel').onclick = close;
  modal.querySelector('#dutyCreate').onclick = async () => {
    const fb = modal.querySelector('#dutyFb');
    const payload = { setor: modal.querySelector('#dutySetor').value.trim(), hora_inicio: modal.querySelector('#dutyI1').value, hora_fim: modal.querySelector('#dutyF1').value, hora_inicio_2: modal.querySelector('#dutyI2').value || null, hora_fim_2: modal.querySelector('#dutyF2').value || null };
    if (!payload.setor || !payload.hora_inicio || !payload.hora_fim) { fb.textContent = 'Informe o setor e o primeiro período.'; fb.classList.add('err'); return; }
    const { error } = await supabase.from('rh_plantao_setor_config').insert(payload);
    if (error) { fb.textContent = error.code === '23505' ? 'Este setor já existe.' : error.message; fb.classList.add('err'); return; }
    close();
    renderPlantaoTab(document.getElementById('eqTabContent'));
  };
}

async function renderPlantaoTab(area) {
  area.innerHTML = '<div class="eq-empty mt-16">Carregando configurações do Plantão...</div>';
  try { await loadPlantaoConfig(); } catch (e) { area.innerHTML = `<div class="eq-empty mt-16">Não foi possível carregar: ${esc(e.message)}</div>`; return; }
  const isMaster = !!state.ctx?.user?.is_master;
  area.innerHTML = `<section class="card mt-16"><div class="eq-structure-intro"><div><h3>Plantão por setor</h3><p class="muted">Configure o horário padrão e controle exatamente quem pode editar a escala de cada setor.</p></div><div class="eq-actions"><a class="btn btn-secondary" href="./plantao.html">Abrir escala completa</a>${isMaster ? '<button class="btn btn-primary" id="dutyNewSector" type="button">+ Novo setor</button>' : ''}</div></div><div class="eq-duty-grid mt-16">
    ${state.plantaoConfig.map((config) => {
      const editores = state.plantaoEditores.filter((item) => item.setor === config.setor);
      const disabled = config.pode_editar ? '' : 'disabled';
      const disponiveis = state.usuarios.filter((item) => !editores.some((editor) => String(editor.app_usuario_id) === String(item.id)));
      return `<article class="eq-duty-card" data-duty-card="${esc(config.setor)}"><div class="eq-duty-head"><div><h4>${esc(config.setor)}</h4><small class="muted">Horário usado ao adicionar plantonistas</small></div><span class="eq-duty-lock ${config.pode_editar ? 'can' : ''}">${config.pode_editar ? 'Pode editar' : 'Somente leitura'}</span></div><div class="eq-duty-times"><label>Entrada 1<input type="time" data-duty-time="hora_inicio" value="${esc(timeValue(config.hora_inicio))}" ${disabled}></label><label>Saída 1<input type="time" data-duty-time="hora_fim" value="${esc(timeValue(config.hora_fim))}" ${disabled}></label><label>Entrada 2<input type="time" data-duty-time="hora_inicio_2" value="${esc(timeValue(config.hora_inicio_2))}" ${disabled}></label><label>Saída 2<input type="time" data-duty-time="hora_fim_2" value="${esc(timeValue(config.hora_fim_2))}" ${disabled}></label></div>${config.pode_editar ? '<button class="btn btn-small btn-secondary mt-8" data-duty-save type="button">Salvar horário</button>' : ''}<span class="eq-feedback mt-8" data-duty-feedback></span><div class="eq-duty-editors">${editores.length ? editores.map((editor) => { const user = usuario(editor.app_usuario_id); return `<span class="eq-duty-editor">${esc(user?.nome || user?.email || 'Usuário')}${isMaster ? `<button type="button" title="Remover acesso" data-duty-remove-editor="${esc(editor.id)}">×</button>` : ''}</span>`; }).join('') : '<span class="muted">Nenhum editor liberado.</span>'}</div>${isMaster ? `<div class="eq-duty-add"><select data-duty-user>${usuarioOptions('', (item) => disponiveis.some((u) => String(u.id) === String(item.id)))}</select><button class="btn btn-small btn-secondary" data-duty-add-editor type="button">Liberar edição</button></div>` : ''}</article>`;
    }).join('') || '<div class="eq-empty">Nenhum setor configurado.</div>'}
  </div></section>`;
  area.querySelector('#dutyNewSector')?.addEventListener('click', openNovoSetorPlantaoModal);
  area.querySelectorAll('[data-duty-card]').forEach((card) => {
    const config = state.plantaoConfig.find((item) => item.setor === card.dataset.dutyCard);
    card.querySelector('[data-duty-save]')?.addEventListener('click', () => salvarHorarioSetor(card, config));
    card.querySelector('[data-duty-add-editor]')?.addEventListener('click', async () => {
      const app_usuario_id = card.querySelector('[data-duty-user]').value;
      if (!app_usuario_id) return;
      const { error } = await supabase.from('rh_plantao_setor_editores').insert({ setor: config.setor, app_usuario_id, created_by: state.ctx?.user?.id || null });
      if (error) return alert(error.message);
      renderPlantaoTab(area);
    });
  });
  area.querySelectorAll('[data-duty-remove-editor]').forEach((btn) => btn.addEventListener('click', async () => {
    if (!confirm('Remover a permissão de edição deste usuário?')) return;
    const { error } = await supabase.from('rh_plantao_setor_editores').delete().eq('id', btn.dataset.dutyRemoveEditor);
    if (error) return alert(error.message);
    renderPlantaoTab(area);
  }));
}

// ---------- Boot ----------

async function renderTab(container) {
  container.querySelectorAll('[data-eq-tab]').forEach((b) => b.classList.toggle('active', b.dataset.eqTab === state.tab));
  const area = container.querySelector('#eqTabContent');
  if (!area) return;
  state.filtros = null;
  area.innerHTML = `<div class="eq-empty mt-16">Carregando...</div>`;
  if (state.tab === 'gestores') renderGestoresTab(area);
  else if (state.tab === 'administracao') renderAdministracaoTab(area);
  else if (state.tab === 'plantao') renderPlantaoTab(area);
  else if (state.tab === 'admissoes') renderAdmissoesTab(area);
  else if (state.tab === 'integracao') renderIntegracaoTab(area);
  else if (state.tab === 'graint') renderGraintTab(area);
  else if (state.tab === 'inativacoes') renderInativacoesTab(area, container);
  else if (state.tab === 'consultar') renderConsultarTab(area);
  else if (state.tab === 'contatos') renderContatosTab(area);
}

export async function renderContent(content, userContext) {
  state.ctx = userContext;
  content.innerHTML = `${styles()}<section class="hero-card"><div><div class="eyebrow">Pessoas & estrutura</div><h2>Equipe</h2><p>Responsáveis regionais, setores administrativos e rotinas de Recursos Humanos.</p></div><div class="hero-badge-wrap"><span class="hero-badge">Equipe</span></div></section>
  ${tabsHtml()}
  <div id="eqTabContent"></div>
  <div class="eq-modal" id="eqModal"></div>`;
  content.querySelectorAll('[data-eq-tab]').forEach((b) => b.onclick = () => { state.tab = b.dataset.eqTab; renderTab(content); });
  await renderTab(content);
  if (state.tab !== 'inativacoes') refreshInativacoesBadge(content).catch(() => {});
}

initProtectedPage('Equipe', renderContent);
