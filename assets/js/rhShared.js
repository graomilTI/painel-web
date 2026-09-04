// Helpers compartilhados da "fase 2" das telas de RH (Cartão Ponto,
// Advertências, Folha/Holerite, Exames, Segurança do Trabalho, Contratos,
// Indisponibilidade): filtro por colaborador+período, editar/excluir,
// exportação CSV e anexo real no Storage (bucket privado rh-anexos).
//
// Convenção do anexo: a coluna *_url guarda OU uma URL http(s) legada
// (registros antigos, colados à mão) OU um path do Storage
// ("<pasta>/<arquivo>"). abrirAnexo() resolve os dois casos — http abre
// direto, path vira URL assinada de 1h (bucket é privado, documentos de RH
// são dado sensível de pessoa física).
import { supabase } from './supabaseClient.js';
import { searchColaboradores } from './colaboradoresCache.js';

export const RH_ANEXOS_BUCKET = 'rh-anexos';

export const esc = (v) => String(v ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
export const brDate = (v) => { const [y, m, d] = String(v || '').slice(0, 10).split('-'); return y && m && d ? `${d}/${m}/${y}` : '-'; };
export const todayIso = () => new Date().toISOString().slice(0, 10);

// Autocomplete de colaborador (mesma implementação que estava copiada em cada
// tela — centralizada aqui).
export function colabAutocomplete(modal, inputSel, sugSel, onPick) {
  const input = modal.querySelector(inputSel);
  const sug = modal.querySelector(sugSel);
  let debounce = null;
  input.addEventListener('input', () => {
    onPick(null);
    const q = input.value.trim();
    if (q.length < 2) { sug.style.display = 'none'; return; }
    clearTimeout(debounce);
    debounce = setTimeout(async () => {
      const lista = await searchColaboradores(q, { limite: 10 });
      if (!lista.length) { sug.style.display = 'none'; return; }
      sug.innerHTML = lista.map((c, idx) => `<button type="button" data-idx="${idx}" style="display:block;width:100%;text-align:left;border:1px solid rgba(148,163,184,.24);background:#0d0d18;color:#e2e2f0;border-radius:10px;padding:8px;margin-bottom:4px;cursor:pointer">${esc(c.nome)}</button>`).join('');
      sug.style.display = 'block';
      sug.querySelectorAll('button').forEach((b) => b.onmousedown = (ev) => { ev.preventDefault(); const c = lista[Number(b.dataset.idx)]; input.value = c.nome; sug.style.display = 'none'; onPick(c); });
    }, 250);
  });
}

// ---------------------------------------------------------------------------
// Filtros (colaborador + período) — barra padrão acima da tabela.
// `periodo:false` esconde os campos de data (ex.: Folha filtra por
// competência via busca de texto).
export function filtrosHtml(prefix, { periodo = true } = {}) {
  return `<div class="rh-filtros mt-16">
    <input id="${prefix}FilNome" type="search" placeholder="Filtrar por colaborador..." autocomplete="off">
    ${periodo ? `<label>De <input id="${prefix}FilDe" type="date"></label>
    <label>Até <input id="${prefix}FilAte" type="date"></label>` : ''}
    <button class="btn btn-secondary" id="${prefix}FilLimpar" type="button">Limpar</button>
    <button class="btn btn-secondary" id="${prefix}Exportar" type="button">⬇ Exportar CSV</button>
  </div>`;
}

export function filtrosStyle() {
  return `.rh-filtros{display:flex;gap:10px;flex-wrap:wrap;align-items:center}
    .rh-filtros input[type=search]{flex:1;min-width:200px;border:1px solid rgba(148,163,184,.24);background:#0d0d18;color:#e2e2f0;border-radius:12px;padding:10px 12px}
    .rh-filtros label{display:inline-flex;align-items:center;gap:6px;font-size:12px;color:var(--muted)}
    .rh-filtros input[type=date]{border:1px solid rgba(148,163,184,.24);background:#0d0d18;color:#e2e2f0;border-radius:12px;padding:8px 10px;color-scheme:dark}
    .rh-acoes-cell{display:flex;gap:6px;white-space:nowrap}
    .rh-acao-btn{border:1px solid rgba(148,163,184,.28);background:transparent;color:#cbd5e1;border-radius:9px;padding:6px 9px;font-size:12px;cursor:pointer}
    .rh-acao-btn:hover{border-color:rgba(59,130,246,.5);color:#fff}
    .rh-acao-btn.excluir:hover{border-color:rgba(248,113,113,.6);color:#fca5a5}
    .rh-anexo-btn{border:1px solid rgba(148,163,184,.28);background:transparent;color:#93c5fd;border-radius:9px;padding:5px 9px;font-size:12px;cursor:pointer}
    .rh-anexo-atual{font-size:11.5px;color:var(--muted);margin-top:4px;display:block}`;
}

export function bindFiltros(root, prefix, onChange) {
  let debounce = null;
  const disparar = () => { clearTimeout(debounce); debounce = setTimeout(onChange, 200); };
  const nome = root.querySelector(`#${prefix}FilNome`);
  const de = root.querySelector(`#${prefix}FilDe`);
  const ate = root.querySelector(`#${prefix}FilAte`);
  nome?.addEventListener('input', disparar);
  de?.addEventListener('change', onChange);
  ate?.addEventListener('change', onChange);
  root.querySelector(`#${prefix}FilLimpar`)?.addEventListener('click', () => {
    if (nome) nome.value = '';
    if (de) de.value = '';
    if (ate) ate.value = '';
    onChange();
  });
}

export function lerFiltros(root, prefix) {
  return {
    nome: (root.querySelector(`#${prefix}FilNome`)?.value || '').trim().toLowerCase(),
    de: root.querySelector(`#${prefix}FilDe`)?.value || '',
    ate: root.querySelector(`#${prefix}FilAte`)?.value || '',
  };
}

const semAcento = (v) => String(v || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

export function aplicarFiltros(rows, filtros, { nomeKey = 'colaborador_nome', dataKey = null } = {}) {
  if (!filtros) return rows;
  const q = semAcento(filtros.nome);
  return rows.filter((r) => {
    if (q && !semAcento(r[nomeKey]).includes(q)) return false;
    if (dataKey) {
      const d = String(r[dataKey] || '').slice(0, 10);
      if (filtros.de && (!d || d < filtros.de)) return false;
      if (filtros.ate && (!d || d > filtros.ate)) return false;
    }
    return true;
  });
}

// ---------------------------------------------------------------------------
// Export CSV — BOM UTF-8 + ";" (abre certo no Excel pt-BR sem assistente).
export function exportCsv(nomeArquivo, colunas, rows) {
  const celula = (v) => {
    const s = String(v ?? '');
    return /[";\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
  };
  const linhas = [
    colunas.map((c) => celula(c.label)).join(';'),
    ...rows.map((r) => colunas.map((c) => celula(c.fmt ? c.fmt(r[c.key], r) : r[c.key])).join(';')),
  ];
  const blob = new Blob(['﻿' + linhas.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${nomeArquivo}-${todayIso()}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

// ---------------------------------------------------------------------------
// Anexos — upload no bucket privado + abertura via URL assinada.
export function anexoFieldHtml(id, { label = 'Anexo', atual = null, full = true } = {}) {
  return `<label class="${full ? 'rh-anexo-full' : ''}" style="grid-column:1/-1">${esc(label)}
    <input id="${id}" type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.xls,.xlsx">
    ${atual ? `<span class="rh-anexo-atual">Anexo atual mantido se nenhum arquivo novo for escolhido.</span>` : ''}
  </label>`;
}

// Faz upload se um arquivo foi escolhido; senão preserva o valor atual.
export async function resolverAnexo(modal, inputId, pasta, atual = null) {
  const input = modal.querySelector(`#${inputId}`);
  const file = input?.files?.[0];
  if (!file) return atual;
  if (file.size > 20 * 1024 * 1024) throw new Error('Anexo acima de 20MB.');
  const nomeSeguro = file.name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80);
  const path = `${pasta}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${nomeSeguro}`;
  const { error } = await supabase.storage.from(RH_ANEXOS_BUCKET).upload(path, file, { upsert: false });
  if (error) throw new Error(`Falha no upload do anexo: ${error.message}`);
  return path;
}

export async function abrirAnexo(valor) {
  if (!valor) return;
  if (/^https?:\/\//i.test(valor)) { window.open(valor, '_blank', 'noopener'); return; }
  const { data, error } = await supabase.storage.from(RH_ANEXOS_BUCKET).createSignedUrl(valor, 3600);
  if (error || !data?.signedUrl) { alert(`Não foi possível abrir o anexo: ${error?.message || 'sem URL'}`); return; }
  window.open(data.signedUrl, '_blank', 'noopener');
}

export function anexoBtnHtml(valor) {
  return valor ? `<button class="rh-anexo-btn" data-rh-anexo="${esc(valor)}" type="button" title="Abrir anexo">📎 Abrir</button>` : '-';
}

export function bindAnexoButtons(root) {
  root.querySelectorAll('[data-rh-anexo]').forEach((b) => { b.onclick = () => abrirAnexo(b.dataset.rhAnexo); });
}

// ---------------------------------------------------------------------------
// Atestados — evita "acumular datas": se já existe um atestado ATIVO
// (lancado/aprovado) do mesmo colaborador cujo período se sobrepõe ou é
// adjacente (até 1 dia de intervalo) ao novo período, estende esse registro
// em vez de criar outro. Pedido da usuária, 2026-09-04: um atestado de um
// único período (ex.: 02 a 09) não pode virar 5+ linhas por causa de
// lançamentos dia a dia na Programação > Sem O.S. Usada tanto pelo "Lançar
// Atestado" do RH quanto pelo toggle Atestado da Programação.
export async function upsertAtestado({
  colaboradorId = null,
  colaboradorNome,
  dataInicio,
  dataFim,
  cid = null,
  medico = null,
  anexoUrl = null,
  observacoes = null,
  createdBy = null,
}) {
  const addDias = (iso, n) => { const d = new Date(`${iso}T00:00:00`); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
  const diasEntre = (ini, fim) => Math.max(1, Math.round((new Date(`${fim}T00:00:00`) - new Date(`${ini}T00:00:00`)) / 86400000) + 1);
  const nomeNorm = String(colaboradorNome || '').trim().toUpperCase();

  const { data: candidatos, error: buscaError } = await supabase
    .from('rh_atestados')
    .select('*')
    .in('status', ['lancado', 'aprovado'])
    .lte('data_inicio', addDias(dataFim, 1))
    .gte('data_fim', addDias(dataInicio, -1));
  if (buscaError) throw buscaError;

  const existente = (candidatos || []).find((r) => (
    (colaboradorId && r.colaborador_id === colaboradorId)
    || String(r.colaborador_nome || '').trim().toUpperCase() === nomeNorm
  ));

  if (existente) {
    const inicioFinal = existente.data_inicio < dataInicio ? existente.data_inicio : dataInicio;
    const fimFinal = existente.data_fim > dataFim ? existente.data_fim : dataFim;
    const payload = {
      data_inicio: inicioFinal,
      data_fim: fimFinal,
      dias: diasEntre(inicioFinal, fimFinal),
      cid: cid || existente.cid,
      medico: medico || existente.medico,
      anexo_url: anexoUrl || existente.anexo_url,
      observacoes: observacoes || existente.observacoes,
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabase.from('rh_atestados').update(payload).eq('id', existente.id);
    if (error) throw error;
    return { id: existente.id, merged: true };
  }

  const payload = {
    colaborador_id: colaboradorId,
    colaborador_nome: colaboradorNome,
    data_inicio: dataInicio,
    data_fim: dataFim,
    dias: diasEntre(dataInicio, dataFim),
    cid,
    medico,
    anexo_url: anexoUrl,
    observacoes,
    status: 'lancado',
    created_by: createdBy,
  };
  const { data, error } = await supabase.from('rh_atestados').insert(payload).select('id').single();
  if (error) throw error;
  return { id: data.id, merged: false };
}

// ---------------------------------------------------------------------------
// Ações de linha (editar/excluir).
export function acoesHtml(id) {
  return `<div class="rh-acoes-cell">
    <button class="rh-acao-btn" data-rh-editar="${esc(id)}" type="button" title="Editar">✏️</button>
    <button class="rh-acao-btn excluir" data-rh-excluir="${esc(id)}" type="button" title="Excluir">🗑</button>
  </div>`;
}

export function bindAcoes(root, { onEdit, table, reload, descricao = 'este registro' }) {
  root.querySelectorAll('[data-rh-editar]').forEach((b) => { b.onclick = () => onEdit(b.dataset.rhEditar); });
  root.querySelectorAll('[data-rh-excluir]').forEach((b) => {
    b.onclick = async () => {
      if (!confirm(`Excluir ${descricao}? Essa ação não pode ser desfeita.`)) return;
      const { error } = await supabase.from(table).delete().eq('id', b.dataset.rhExcluir);
      if (error) { alert(`Erro ao excluir: ${error.message}`); return; }
      await reload();
    };
  });
}
