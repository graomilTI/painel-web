import { initProtectedPage } from './pageInit.js';
import { supabase } from './supabaseClient.js';

const ESTADOS_BR = ['AC','AL','AM','AP','BA','CE','DF','ES','GO','MA','MG','MS','MT','PA','PB','PE','PI','PR','RJ','RN','RO','RR','RS','SC','SE','SP','TO'];

const css = `
<style>
  .clinicas-wrap { max-width: 1400px; }

  .clinicas-toolbar {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    align-items: center;
    margin-bottom: 20px;
  }

  .clinicas-search {
    flex: 1;
    min-width: 220px;
    height: 40px;
    padding: 0 14px;
    border: 1px solid rgba(148,163,184,.22);
    border-radius: 12px;
    background: rgba(15,23,42,.7);
    color: #e2e2f0;
    font-size: 14px;
    outline: none;
  }
  .clinicas-search::placeholder { color: #6b7280; }
  .clinicas-search:focus { border-color: rgba(34,197,94,.5); }

  .clinicas-select {
    height: 40px;
    padding: 0 10px;
    border: 1px solid rgba(148,163,184,.22);
    border-radius: 12px;
    background: rgba(15,23,42,.7);
    color: #e2e2f0;
    font-size: 13px;
    outline: none;
    color-scheme: dark;
  }
  .clinicas-select:focus { border-color: rgba(34,197,94,.5); }

  .clinicas-count {
    font-size: 12px;
    color: #6b7280;
    margin-left: auto;
    white-space: nowrap;
  }

  .clinicas-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
    gap: 14px;
  }

  .clinica-card {
    border: 1px solid rgba(148,163,184,.16);
    border-radius: 16px;
    background: rgba(15,23,42,.72);
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    transition: border-color .15s;
  }
  .clinica-card:hover { border-color: rgba(34,197,94,.35); }

  .clinica-nome {
    font-size: 15px;
    font-weight: 800;
    color: #e2e2f0;
    line-height: 1.3;
  }

  .clinica-localidade {
    font-size: 12px;
    color: #22c55e;
    font-weight: 700;
    letter-spacing: .02em;
  }

  .clinica-rows { display: flex; flex-direction: column; gap: 5px; margin-top: 2px; }

  .clinica-row {
    display: flex;
    gap: 8px;
    align-items: flex-start;
    font-size: 12px;
    color: #94a3b8;
    line-height: 1.4;
  }

  .clinica-row-icon { flex-shrink: 0; width: 16px; text-align: center; margin-top: 1px; }
  .clinica-row-val { flex: 1; word-break: break-word; }

  .clinica-copy {
    background: none;
    border: none;
    color: #6b7280;
    cursor: pointer;
    padding: 0 4px;
    font-size: 11px;
    border-radius: 4px;
    flex-shrink: 0;
  }
  .clinica-copy:hover { color: #22c55e; background: rgba(34,197,94,.08); }

  .clinica-badge {
    display: inline-flex;
    align-items: center;
    padding: 2px 8px;
    border-radius: 999px;
    font-size: 10px;
    font-weight: 800;
    letter-spacing: .04em;
    background: rgba(34,197,94,.1);
    color: #bbf7d0;
    border: 1px solid rgba(34,197,94,.2);
  }

  .clinicas-empty {
    grid-column: 1/-1;
    padding: 40px;
    text-align: center;
    color: #6b7280;
    font-size: 14px;
    border: 1px dashed rgba(148,163,184,.16);
    border-radius: 16px;
  }

  .clinicas-loading {
    grid-column: 1/-1;
    padding: 40px;
    text-align: center;
    color: #6b7280;
    font-size: 14px;
  }

  @media (max-width: 600px) {
    .clinicas-grid { grid-template-columns: 1fr; }
    .clinicas-toolbar { flex-direction: column; align-items: stretch; }
    .clinicas-count { margin-left: 0; }
  }
</style>
`;

const state = {
  clinicas: [],
  search: '',
  estado: '',
  cidade: '',
  loading: false,
};

function norm(v) {
  return String(v || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

function filtered() {
  const q = norm(state.search);
  const uf = state.estado.toUpperCase();
  const cid = norm(state.cidade);

  return state.clinicas.filter((c) => {
    if (uf && (c.estado || '').toUpperCase() !== uf) return false;
    if (cid && !norm(c.cidade).includes(cid)) return false;
    if (!q) return true;
    return (
      norm(c.nome).includes(q) ||
      norm(c.cidade).includes(q) ||
      norm(c.endereco).includes(q) ||
      norm(c.dados_medico).includes(q) ||
      norm(c.telefone).includes(q) ||
      norm(c.celular).includes(q) ||
      norm(c.observacoes).includes(q) ||
      norm(c.exames).includes(q)
    );
  });
}

function cidadesDisponiveis() {
  const uf = state.estado.toUpperCase();
  const src = uf ? state.clinicas.filter(c => (c.estado || '').toUpperCase() === uf) : state.clinicas;
  return [...new Set(src.map(c => c.cidade).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

function copyText(text) {
  navigator.clipboard?.writeText(text).catch(() => {});
}

function renderCard(c) {
  const rows = [];

  if (c.telefone) {
    rows.push(`<div class="clinica-row">
      <span class="clinica-row-icon">📞</span>
      <span class="clinica-row-val">${c.telefone}</span>
      <button class="clinica-copy" data-copy="${c.telefone.replace(/"/g, '&quot;')}" title="Copiar">⧉</button>
    </div>`);
  }
  if (c.celular) {
    rows.push(`<div class="clinica-row">
      <span class="clinica-row-icon">📱</span>
      <span class="clinica-row-val">${c.celular}</span>
      <button class="clinica-copy" data-copy="${c.celular.replace(/"/g, '&quot;')}" title="Copiar">⧉</button>
    </div>`);
  }
  if (c.email && c.email !== '.') {
    rows.push(`<div class="clinica-row">
      <span class="clinica-row-icon">✉</span>
      <span class="clinica-row-val">${c.email}</span>
      <button class="clinica-copy" data-copy="${c.email.replace(/"/g, '&quot;')}" title="Copiar">⧉</button>
    </div>`);
  }
  if (c.endereco) {
    rows.push(`<div class="clinica-row">
      <span class="clinica-row-icon">📍</span>
      <span class="clinica-row-val">${c.endereco}</span>
    </div>`);
  }
  if (c.dados_medico && c.dados_medico !== '.') {
    rows.push(`<div class="clinica-row">
      <span class="clinica-row-icon">👨‍⚕️</span>
      <span class="clinica-row-val">${c.dados_medico}</span>
    </div>`);
  }
  if (c.chave_pix && c.chave_pix !== '.') {
    rows.push(`<div class="clinica-row">
      <span class="clinica-row-icon">💠</span>
      <span class="clinica-row-val">${c.chave_pix}</span>
      <button class="clinica-copy" data-copy="${c.chave_pix.replace(/"/g, '&quot;')}" title="Copiar PIX">⧉</button>
    </div>`);
  }
  if (c.exames && c.exames !== '.') {
    rows.push(`<div class="clinica-row">
      <span class="clinica-row-icon">🔬</span>
      <span class="clinica-row-val">${c.exames}</span>
    </div>`);
  }
  if (c.observacoes) {
    rows.push(`<div class="clinica-row">
      <span class="clinica-row-icon">📝</span>
      <span class="clinica-row-val">${c.observacoes}</span>
    </div>`);
  }

  return `
    <div class="clinica-card">
      <div class="clinica-nome">${c.nome}</div>
      <div class="clinica-localidade">${[c.cidade, c.estado].filter(Boolean).join(' · ')}</div>
      ${rows.length ? `<div class="clinica-rows">${rows.join('')}</div>` : ''}
    </div>
  `;
}

function renderGrid(container) {
  const grid = container.querySelector('#clinicasGrid');
  if (!grid) return;

  if (state.loading) {
    grid.innerHTML = '<div class="clinicas-loading">Carregando clínicas...</div>';
    return;
  }

  const list = filtered();
  const count = container.querySelector('#clinicasCount');
  if (count) count.textContent = `${list.length.toLocaleString('pt-BR')} clínica(s)`;

  if (!list.length) {
    grid.innerHTML = `<div class="clinicas-empty">Nenhuma clínica encontrada${state.search || state.estado || state.cidade ? ' para os filtros aplicados' : '. Importe a planilha em Importar Relatórios'}.</div>`;
    return;
  }

  grid.innerHTML = list.map(renderCard).join('');

  grid.querySelectorAll('[data-copy]').forEach((btn) => {
    btn.addEventListener('click', () => {
      copyText(btn.dataset.copy);
      const prev = btn.textContent;
      btn.textContent = '✓';
      setTimeout(() => { btn.textContent = prev; }, 1200);
    });
  });
}

function renderCidadeSelect(container) {
  const sel = container.querySelector('#filtroCidade');
  if (!sel) return;
  const cidades = cidadesDisponiveis();
  const cur = state.cidade;
  sel.innerHTML = `<option value="">Todas as cidades</option>` +
    cidades.map(c => `<option value="${c}"${c === cur ? ' selected' : ''}>${c}</option>`).join('');
}

async function loadClinicas(container) {
  state.loading = true;
  renderGrid(container);

  let all = [];
  const pageSize = 1000;
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from('rh_clinicas_sst')
      .select('estado,cidade,nome,telefone,celular,endereco,cep,dados_medico,email,observacoes,chave_pix,exames')
      .eq('ativo', true)
      .order('estado')
      .order('cidade')
      .order('nome')
      .range(from, from + pageSize - 1);

    if (error) { console.error('[clinicas-sst]', error); break; }
    if (!data?.length) break;
    all = all.concat(data);
    if (data.length < pageSize) break;
    from += pageSize;
  }

  state.clinicas = all;
  state.loading = false;
  renderCidadeSelect(container);
  renderGrid(container);
}

initProtectedPage('Clínicas SST', (content) => {
  content.innerHTML = `
    ${css}
    <div class="clinicas-wrap">
      <div class="clinicas-toolbar">
        <input class="clinicas-search" id="buscaClinica" type="search"
          placeholder="Buscar por nome, cidade, médico, exame..." autocomplete="off" />
        <select class="clinicas-select" id="filtroEstado">
          <option value="">Todos os estados</option>
          ${ESTADOS_BR.map(uf => `<option value="${uf}">${uf}</option>`).join('')}
        </select>
        <select class="clinicas-select" id="filtroCidade">
          <option value="">Todas as cidades</option>
        </select>
        <span class="clinicas-count" id="clinicasCount">—</span>
      </div>
      <div class="clinicas-grid" id="clinicasGrid">
        <div class="clinicas-loading">Carregando clínicas...</div>
      </div>
    </div>
  `;

  content.querySelector('#buscaClinica').addEventListener('input', (e) => {
    state.search = e.target.value;
    renderGrid(content);
  });

  content.querySelector('#filtroEstado').addEventListener('change', (e) => {
    state.estado = e.target.value;
    state.cidade = '';
    renderCidadeSelect(content);
    content.querySelector('#filtroCidade').value = '';
    renderGrid(content);
  });

  content.querySelector('#filtroCidade').addEventListener('change', (e) => {
    state.cidade = e.target.value;
    renderGrid(content);
  });

  state.search = '';
  state.estado = '';
  state.cidade = '';

  loadClinicas(content);
});
