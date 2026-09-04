import { initProtectedPage } from './pageInit.js';
import { supabase } from './supabaseClient.js';
import {
  esc, colabAutocomplete,
  filtrosHtml, filtrosStyle, bindFiltros, lerFiltros, aplicarFiltros,
  exportCsv, acoesHtml, bindAcoes,
  anexoFieldHtml, resolverAnexo, anexoBtnHtml, bindAnexoButtons,
} from './rhShared.js';

const STATUS_FOLHA = {
  gerada: { label: 'Gerada' },
  paga: { label: 'Paga' },
  pendente: { label: 'Pendente' },
  concluida: { label: 'Concluída' },
  erro: { label: 'Erro' },
};

const NOTAS_FISCAIS_BUCKET = 'notas-fiscais';

const state = {
  folhas: [], ctx: null, filtros: null, itensPorFolha: {}, empresas: null,
};

const money = (v) => v == null ? '-' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

function dataHora(value) {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function statusPill(status) {
  const label = STATUS_FOLHA[status]?.label || status || '-';
  let cor = ['#fde68a', 'rgba(245,158,11,.1)'];
  if (status === 'paga' || status === 'concluida') cor = ['#bbf7d0', 'rgba(22,101,52,.18)'];
  else if (status === 'erro') cor = ['#fecaca', 'rgba(153,27,27,.18)'];
  return `<span style="display:inline-flex;padding:4px 8px;border-radius:999px;font-size:12px;font-weight:800;color:${cor[0]};background:${cor[1]};border:1px solid rgba(148,163,184,.2)">${esc(label)}</span>`;
}

// Um item da fila de Notas Fiscais é considerado resolvido pra fins da Folha
// quando o agente já lançou no GRM, ou quando o valor extraído é R$ 0,00 (não
// há o que lançar).
function itemConcluido(item) {
  if (item.status === 'LANCADO') return true;
  return item.valor_total != null && Number(item.valor_total) === 0;
}

function statusDoLote(itens) {
  if (!itens.length) return 'pendente';
  if (itens.some((i) => i.status === 'ERRO')) return 'erro';
  return itens.every(itemConcluido) ? 'concluida' : 'pendente';
}

function competenciaDoLote(itens) {
  return itens.map((i) => i.extraido_json?.competencia).find(Boolean) || null;
}

function liquidoDoLote(itens) {
  if (!itens.some((i) => i.valor_total != null)) return null;
  return itens.reduce((soma, i) => soma + (Number(i.valor_total) || 0), 0);
}

async function loadEmpresasRh() {
  if (state.empresas) return state.empresas;
  state.empresas = await safe(() => supabase.from('rh_empresas').select('razao_social').eq('ativo', true).order('razao_social'));
  return state.empresas;
}

function styles() {
  return `<style>
    .hp-table-wrap{overflow:auto;border:1px solid var(--line);border-radius:18px}
    .hp-table{width:100%;border-collapse:collapse;min-width:760px}
    .hp-table th,.hp-table td{padding:14px;border-bottom:1px solid var(--line);text-align:left;vertical-align:middle}
    .hp-table th{font-size:12px;color:var(--muted);text-transform:uppercase}
    .hp-empty{text-align:center;color:var(--muted)}
    .hp-modal{position:fixed;inset:0;background:rgba(2,6,23,.75);z-index:9999;display:none;align-items:center;justify-content:center;padding:20px}
    .hp-modal.open{display:flex}
    .hp-modal-card{width:min(560px,100%);max-height:90vh;overflow:auto;background:#15152a;border:1px solid rgba(255,255,255,.06);border-radius:22px;padding:24px;color:#e2e2f0}
    .hp-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}
    .hp-grid input,.hp-grid textarea{width:100%;box-sizing:border-box;border:1px solid rgba(148,163,184,.24);background:#0d0d18;color:#e2e2f0;border-radius:12px;padding:10px 12px;color-scheme:dark}
    .hp-full{grid-column:1/-1}
    .hp-actions{display:flex;gap:10px;flex-wrap:wrap}
    .hp-feedback{font-weight:700;display:block}
    .hp-feedback.err{color:#fecaca}
    ${filtrosStyle()}
  </style>`;
}

async function safe(fn, fallback = []) {
  try { const { data, error } = await fn(); if (error) throw error; return data || fallback; }
  catch (e) { console.warn('[Holerite e Pagamentos]', e); return fallback; }
}

async function loadFolhas() {
  state.folhas = await safe(() => supabase.from('rh_folha').select('*').order('created_at', { ascending: false }).limit(500));
  const loteIds = state.folhas.filter((f) => f.empresa).map((f) => f.id);
  state.itensPorFolha = {};
  if (loteIds.length) {
    const itens = await safe(() => supabase.from('grm_nf_lancamentos')
      .select('id,rh_folha_id,arquivo_nome,status,valor_total,extraido_json')
      .in('rh_folha_id', loteIds));
    itens.forEach((it) => {
      (state.itensPorFolha[it.rh_folha_id] ??= []).push(it);
    });
  }
  renderTable();
}

// A busca de texto também cobre a competência (MM/AAAA) — não há coluna de
// data pura na folha, então a barra de filtros fica sem o período.
function folhasFiltradas() {
  const q = (state.filtros?.nome || '').trim().toLowerCase();
  if (!q) return state.folhas;
  const porNome = aplicarFiltros(state.folhas, state.filtros, {});
  const porCompetencia = state.folhas.filter((f) => String(f.competencia || '').toLowerCase().includes(q));
  const ids = new Set([...porNome, ...porCompetencia].map((f) => f.id));
  return state.folhas.filter((f) => ids.has(f.id));
}

function renderTable() {
  const body = document.getElementById('hpBody');
  if (!body) return;
  const rows = folhasFiltradas();
  if (!rows.length) {
    body.innerHTML = `<tr><td colspan="7" class="hp-empty">${state.folhas.length ? 'Nenhuma folha no filtro atual.' : 'Nenhuma folha lançada. Clique em <b>+ Nova Folha</b> para começar.'}</td></tr>`;
    return;
  }
  body.innerHTML = rows.map((f) => {
    const isLote = Boolean(f.empresa);
    const itens = state.itensPorFolha[f.id] || [];
    const competencia = isLote ? competenciaDoLote(itens) : f.competencia;
    const liquido = isLote ? liquidoDoLote(itens) : f.valor_liquido;
    const status = isLote ? statusDoLote(itens) : f.status;
    const holeriteCell = isLote
      ? (itens.length ? `${itens.length} arquivo(s)` : 'Aguardando envio')
      : anexoBtnHtml(f.arquivo_url);
    return `<tr>
      <td>${esc(dataHora(f.created_at))}</td>
      <td><b>${esc(isLote ? f.empresa : f.colaborador_nome)}</b></td>
      <td>${esc(competencia || '-')}</td>
      <td>${money(liquido)}</td>
      <td>${holeriteCell}</td>
      <td>${statusPill(status)}${(!isLote && status !== 'paga') ? ` <button class="btn btn-small btn-secondary" data-hp-pagar="${esc(f.id)}" type="button">Marcar paga</button>` : ''}</td>
      <td>${acoesHtml(f.id)}</td>
    </tr>`;
  }).join('');
  bindAnexoButtons(body);
  body.querySelectorAll('[data-hp-pagar]').forEach((b) => b.onclick = async () => {
    await supabase.from('rh_folha').update({ status: 'paga', updated_at: new Date().toISOString() }).eq('id', b.dataset.hpPagar);
    await loadFolhas();
  });
  bindAcoes(body, {
    table: 'rh_folha',
    reload: loadFolhas,
    descricao: 'esta folha',
    onEdit: (id) => {
      const row = state.folhas.find((r) => String(r.id) === String(id));
      if (!row) return;
      if (row.empresa) openLoteModal(row);
      else openFolhaModal(row);
    },
  });
}

function exportar() {
  exportCsv('folha-holerite', [
    { key: 'created_at', label: 'Enviada em', fmt: dataHora },
    { key: 'colaborador_nome', label: 'Colaborador', fmt: (v, r) => v || r.empresa || '' },
    { key: 'competencia', label: 'Competência', fmt: (v, r) => v || (r.empresa ? competenciaDoLote(state.itensPorFolha[r.id] || []) : '') || '' },
    { key: 'valor_bruto', label: 'Valor bruto', fmt: (v) => v == null ? '' : String(v).replace('.', ',') },
    { key: 'valor_liquido', label: 'Valor líquido', fmt: (v, r) => { const val = v ?? (r.empresa ? liquidoDoLote(state.itensPorFolha[r.id] || []) : null); return val == null ? '' : String(val).replace('.', ','); } },
    { key: 'status', label: 'Status', fmt: (v, r) => STATUS_FOLHA[r.empresa ? statusDoLote(state.itensPorFolha[r.id] || []) : v]?.label || v },
  ], folhasFiltradas());
}

// Edição de folhas lançadas manualmente (fluxo legado, anterior ao envio por
// lote). Lotes criados via "+ Nova Folha" (linhas com `empresa`) usam
// openLoteModal() abaixo.
function openFolhaModal(row) {
  const modal = document.getElementById('hpModal');
  let selecionado = null;
  modal.innerHTML = `<div class="hp-modal-card">
    <div class="section-head"><div><h3>Editar Folha</h3></div><button class="btn btn-secondary" id="mClose" type="button">Fechar</button></div>
    <div class="mt-16" style="position:relative">
      <label class="hp-full">Colaborador *<input id="hpColabInput" type="text" placeholder="Digite o nome para pesquisar..." autocomplete="off" value="${esc(row?.colaborador_nome || '')}"></label>
      <div id="hpColabSug" style="display:none;position:absolute;top:100%;left:0;right:0;z-index:50;background:#071b13;border:1px solid var(--line);border-radius:14px;padding:6px;max-height:200px;overflow:auto;margin-top:4px"></div>
    </div>
    <div class="hp-grid mt-16">
      <label>Competência (MM/AAAA) *<input id="hpCompetencia" type="text" placeholder="07/2026" value="${esc(row?.competencia || '')}"></label>
      <label>Valor bruto (R$)<input id="hpBruto" type="number" step="0.01" min="0" value="${esc(row?.valor_bruto ?? '')}"></label>
      <label>Valor líquido (R$)<input id="hpLiquido" type="number" step="0.01" min="0" value="${esc(row?.valor_liquido ?? '')}"></label>
      ${anexoFieldHtml('hpArquivo', { label: 'Holerite (PDF)', atual: row?.arquivo_url })}
    </div>
    <div class="hp-actions mt-16"><button class="btn btn-primary" id="hpSalvar" type="button">Salvar</button><button class="btn btn-secondary" id="hpCancelar" type="button">Cancelar</button></div>
    <span class="hp-feedback mt-8" id="hpFeedback"></span>
  </div>`;
  modal.classList.add('open');
  const input = modal.querySelector('#hpColabInput');
  colabAutocomplete(modal, '#hpColabInput', '#hpColabSug', (c) => { selecionado = c; });
  modal.querySelector('#mClose').onclick = () => modal.classList.remove('open');
  modal.querySelector('#hpCancelar').onclick = () => modal.classList.remove('open');
  modal.querySelector('#hpSalvar').onclick = async () => {
    const fb = modal.querySelector('#hpFeedback');
    const nome = selecionado?.nome || input.value.trim();
    const competencia = modal.querySelector('#hpCompetencia').value.trim();
    if (!nome) { fb.textContent = 'Selecione o colaborador.'; fb.classList.add('err'); return; }
    if (!competencia) { fb.textContent = 'Informe a competência (mês/ano).'; fb.classList.add('err'); return; }
    try {
      const arquivo = await resolverAnexo(modal, 'hpArquivo', 'holerites', row?.arquivo_url || null);
      const payload = {
        colaborador_id: selecionado?.id || row?.colaborador_id || null,
        colaborador_nome: nome,
        competencia,
        valor_bruto: modal.querySelector('#hpBruto').value ? Number(modal.querySelector('#hpBruto').value) : null,
        valor_liquido: modal.querySelector('#hpLiquido').value ? Number(modal.querySelector('#hpLiquido').value) : null,
        arquivo_url: arquivo,
        updated_at: new Date().toISOString(),
      };
      const { error } = await supabase.from('rh_folha').update(payload).eq('id', row.id);
      if (error) throw error;
      modal.classList.remove('open');
      await loadFolhas();
    } catch (e) { fb.textContent = e.message; fb.classList.add('err'); }
  };
}

// "+ Nova Folha": só pede a Empresa e os holerites. Cada arquivo vira uma
// linha na fila de Notas Fiscais (grm_nf_lancamentos, bucket notas-fiscais) —
// o agente que já lança notas/holerites no Contas a Pagar do GRM identifica o
// colaborador e a competência sozinho a partir do próprio arquivo. Esta linha
// de rh_folha representa o lote (empresa + N holerites), não mais 1 pessoa.
function openNovaFolhaModal() {
  const modal = document.getElementById('hpModal');
  modal.innerHTML = `<div class="hp-modal-card">
    <div class="section-head"><div><h3>Nova Folha</h3></div><button class="btn btn-secondary" id="mClose" type="button">Fechar</button></div>
    <div class="hp-grid mt-16">
      <label class="hp-full">Empresa *<select id="hpEmpresa"><option value="">Carregando...</option></select></label>
      <label class="hp-full">Holerites (PDF ou imagem) *<input id="hpArquivos" type="file" multiple accept=".pdf,.png,.jpg,.jpeg,.webp"></label>
    </div>
    <p class="muted mt-8" style="font-size:12px">Anexe um arquivo por colaborador. O agente do GRM identifica cada holerite automaticamente e lança no Contas a Pagar.</p>
    <div class="hp-actions mt-16"><button class="btn btn-primary" id="hpSalvar" type="button">Enviar</button><button class="btn btn-secondary" id="hpCancelar" type="button">Cancelar</button></div>
    <span class="hp-feedback mt-8" id="hpFeedback"></span>
  </div>`;
  modal.classList.add('open');
  modal.querySelector('#mClose').onclick = () => modal.classList.remove('open');
  modal.querySelector('#hpCancelar').onclick = () => modal.classList.remove('open');

  const selEmpresa = modal.querySelector('#hpEmpresa');
  loadEmpresasRh().then((empresas) => {
    selEmpresa.innerHTML = `<option value="">Selecione...</option>${empresas.map((e) => `<option value="${esc(e.razao_social)}">${esc(e.razao_social)}</option>`).join('')}`;
  });

  modal.querySelector('#hpSalvar').onclick = async () => {
    const fb = modal.querySelector('#hpFeedback');
    fb.textContent = '';
    fb.classList.remove('err');
    const empresa = selEmpresa.value;
    const arquivos = Array.from(modal.querySelector('#hpArquivos').files || []);
    if (!empresa) { fb.textContent = 'Selecione a empresa.'; fb.classList.add('err'); return; }
    if (!arquivos.length) { fb.textContent = 'Anexe ao menos um holerite.'; fb.classList.add('err'); return; }

    const botao = modal.querySelector('#hpSalvar');
    botao.disabled = true;
    botao.textContent = 'Enviando...';
    try {
      const userId = state.ctx?.user?.id || null;
      const { data: lote, error: loteError } = await supabase.from('rh_folha')
        .insert({ empresa, status: 'pendente', created_by: userId })
        .select('id').single();
      if (loteError) throw loteError;

      let falhas = 0;
      for (const arquivo of arquivos) {
        try {
          await enviarHoleriteParaNotasFiscais(arquivo, lote.id, userId);
        } catch (e) {
          falhas += 1;
          console.warn('[Nova Folha]', e);
        }
      }
      if (falhas) {
        fb.textContent = `${falhas} de ${arquivos.length} arquivo(s) falharam no envio. Reabra a folha em "Editar" pra conferir.`;
        fb.classList.add('err');
      } else {
        modal.classList.remove('open');
      }
      await loadFolhas();
    } catch (e) {
      fb.textContent = e.message; fb.classList.add('err');
    } finally {
      botao.disabled = false;
      botao.textContent = 'Enviar';
    }
  };
}

function safeFileName(name) {
  return String(name || 'arquivo').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 180);
}

async function enviarHoleriteParaNotasFiscais(file, loteId, userId) {
  const ano = new Date().getFullYear();
  const path = `financeiro/lancamento-nf/${ano}/${Date.now()}_${safeFileName(file.name)}`;
  const { error: uploadError } = await supabase.storage.from(NOTAS_FISCAIS_BUCKET).upload(path, file, {
    upsert: false,
    contentType: file.type || 'application/octet-stream',
  });
  if (uploadError) throw new Error(`Falha ao enviar "${file.name}": ${uploadError.message}`);
  const { error } = await supabase.from('grm_nf_lancamentos').insert({
    storage_bucket: NOTAS_FISCAIS_BUCKET,
    storage_path: path,
    arquivo_nome: file.name,
    arquivo_mime_type: file.type || null,
    setor: 'RH',
    status: 'NOVO',
    enviado_por: userId,
    rh_folha_id: loteId,
  });
  if (error) throw error;
}

// Visualização/edição de um lote (linha de rh_folha criada por "+ Nova
// Folha"). Cada holerite já é gerenciado na fila de Notas Fiscais — aqui só
// dá pra trocar a empresa e acompanhar o status de cada arquivo do lote.
function openLoteModal(row) {
  const modal = document.getElementById('hpModal');
  const itens = state.itensPorFolha[row.id] || [];
  modal.innerHTML = `<div class="hp-modal-card">
    <div class="section-head"><div><h3>Folha — ${esc(row.empresa)}</h3></div><button class="btn btn-secondary" id="mClose" type="button">Fechar</button></div>
    <div class="hp-grid mt-16">
      <label class="hp-full">Empresa<select id="hpEmpresaEdit"><option value="">Carregando...</option></select></label>
    </div>
    <div class="mt-16">
      <b>Holerites enviados (${itens.length})</b>
      <div style="margin-top:8px;display:grid;gap:6px">
        ${itens.length ? itens.map((i) => `<div style="display:flex;justify-content:space-between;gap:10px;font-size:13px">
          <span>${esc(i.extraido_json?.funcionario_nome || i.arquivo_nome || '-')}</span>
          ${statusPill(itemConcluido(i) ? 'concluida' : (i.status === 'ERRO' ? 'erro' : 'pendente'))}
        </div>`).join('') : '<span class="muted">Nenhum holerite vinculado ainda.</span>'}
      </div>
      <p class="muted mt-8" style="font-size:12px">Pra cancelar, relançar ou ver detalhes de um arquivo, use a página Notas Fiscais.</p>
    </div>
    <div class="hp-actions mt-16"><button class="btn btn-primary" id="hpSalvar" type="button">Salvar</button><button class="btn btn-secondary" id="hpCancelar" type="button">Cancelar</button></div>
    <span class="hp-feedback mt-8" id="hpFeedback"></span>
  </div>`;
  modal.classList.add('open');
  modal.querySelector('#mClose').onclick = () => modal.classList.remove('open');
  modal.querySelector('#hpCancelar').onclick = () => modal.classList.remove('open');

  const selEmpresa = modal.querySelector('#hpEmpresaEdit');
  loadEmpresasRh().then((empresas) => {
    selEmpresa.innerHTML = empresas.map((e) => `<option value="${esc(e.razao_social)}" ${e.razao_social === row.empresa ? 'selected' : ''}>${esc(e.razao_social)}</option>`).join('');
  });

  modal.querySelector('#hpSalvar').onclick = async () => {
    const fb = modal.querySelector('#hpFeedback');
    try {
      const { error } = await supabase.from('rh_folha')
        .update({ empresa: selEmpresa.value, updated_at: new Date().toISOString() })
        .eq('id', row.id);
      if (error) throw error;
      modal.classList.remove('open');
      await loadFolhas();
    } catch (e) { fb.textContent = e.message; fb.classList.add('err'); }
  };
}

export async function renderContent(content, userContext) {
  state.ctx = userContext;
  content.innerHTML = `${styles()}<section class="hero-card"><div><div class="eyebrow">Recursos Humanos</div><h2>Folha e Holerite</h2><p>Folha de pagamento e holerites dos colaboradores.</p></div><div class="hero-badge-wrap"><span class="hero-badge">RH</span></div></section>
  <div class="section-head mt-16"><div><h3>Folhas lançadas</h3><p class="muted">Uma linha por lote (empresa + holerites enviados). A busca também filtra por competência (ex.: 07/2026), já identificada pelo agente.</p></div><button class="btn btn-primary" id="hpNova" type="button">+ Nova Folha</button></div>
  ${filtrosHtml('hp', { periodo: false })}
  <div class="hp-table-wrap mt-16"><table class="hp-table"><thead><tr><th>Enviada em</th><th>Colaborador / Empresa</th><th>Competência</th><th>Líquido</th><th>Holerite</th><th>Status</th><th>Ações</th></tr></thead><tbody id="hpBody"><tr><td colspan="7" class="hp-empty">Carregando...</td></tr></tbody></table></div>
  <div class="hp-modal" id="hpModal"></div>`;
  content.querySelector('#hpNova').onclick = () => openNovaFolhaModal();
  bindFiltros(content, 'hp', () => { state.filtros = lerFiltros(content, 'hp'); renderTable(); });
  content.querySelector('#hpExportar').onclick = exportar;
  await loadFolhas();
}

initProtectedPage('Folha e Holerite', renderContent);
