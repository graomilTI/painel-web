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
  aba: 'folhas',
  contas: [], contasCarregadas: false, contasErro: null, filtrosContas: null,
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
// quando o agente já lançou no GRM, quando o valor extraído é R$ 0,00 (não há
// o que lançar), ou quando o próprio status já indica que não sobrou nada
// pendente nele: DIVIDIDO (holerite de lote virou N linhas-filha — quem
// importa pro status daqui pra frente são as filhas, não a linha original) e
// DUPLICADO/CANCELADO (já resolvido por outra linha, ou descartado de
// propósito). Sem isso, um lote com holerite em lote ficava preso em
// "Pendente" pra sempre mesmo com todo mundo já lançado, porque a linha
// original (DIVIDIDO) nunca virava LANCADO — achado em produção, 04/09.
const STATUS_ITEM_RESOLVIDO = new Set(['LANCADO', 'DIVIDIDO', 'DUPLICADO', 'CANCELADO']);
function itemConcluido(item) {
  if (STATUS_ITEM_RESOLVIDO.has(item.status)) return true;
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
    .hp-grid input,.hp-grid textarea,.hp-grid select,.rh-filtros select{width:100%;box-sizing:border-box;border:1px solid rgba(148,163,184,.24);background:#0d0d18;color:#e2e2f0;border-radius:12px;padding:10px 12px;color-scheme:dark}
    .rh-filtros select{width:auto}
    .hp-grid input[type=checkbox]{width:auto;margin-right:8px}
    .hp-check{display:flex;align-items:center;font-size:13px}
    .hp-full{grid-column:1/-1}
    .hp-tabs{display:flex;gap:8px;flex-wrap:wrap}
    .hp-tab{border:1px solid rgba(255,255,255,.08);background:#0d0d18;color:#94a3b8;border-radius:999px;padding:9px 18px;font-size:13px;font-weight:700;cursor:pointer;transition:.15s;font-family:inherit}
    .hp-tab:hover:not(.active){color:#e2e2f0}
    .hp-tab.active{background:rgba(45,212,160,.15);border-color:rgba(45,212,160,.3);color:#e2e2f0}
    .hp-sub{display:block;font-size:12px;color:var(--muted);margin-top:2px}
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

// ---------------------------------------------------------------------------
// Aba "Contas": contas de pagamento fora do padrão "conta no CPF do próprio
// colaborador" — (1) colaborador que recebe em conta de outro titular, com a
// autorização anexada (opcional por enquanto) e (2) conta do beneficiário da
// pensão alimentícia. Tabela rh_contas_pagamento; anexo no bucket rh-anexos.
const TIPOS_CONTA = {
  outro_titular: {
    label: 'Conta de outro titular',
    ajuda: 'Colaborador que recebe numa conta de outra pessoa (CPF/CNPJ diferente do dele). Anexe a autorização do colaborador, se já tiver.',
    titular: 'Titular da conta *',
    documento: 'CPF/CNPJ do titular *',
    vinculo: 'Ex.: esposa, mãe, irmão',
  },
  pensao: {
    label: 'Pensão alimentícia',
    ajuda: 'Conta do beneficiário da pensão (quem recebe), usada no débito da pensão do colaborador.',
    titular: 'Beneficiário da pensão *',
    documento: 'CPF/CNPJ do beneficiário *',
    vinculo: 'Ex.: mãe do filho, responsável legal',
  },
};

const TIPOS_CONTA_BANCARIA = { corrente: 'Corrente', poupanca: 'Poupança', pagamento: 'Conta pagamento' };

const soDigitos = (v) => String(v ?? '').replace(/\D/g, '');
const semAcento = (v) => String(v || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

function fmtDocumento(valor) {
  const d = soDigitos(valor);
  if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
  return valor || '-';
}

function digitoVerificador(digitos, pesos) {
  const soma = pesos.reduce((acc, peso, i) => acc + Number(digitos[i]) * peso, 0);
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

const PESOS_CPF = [10, 9, 8, 7, 6, 5, 4, 3, 2];
const PESOS_CNPJ = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

// CPF (11) ou CNPJ (14) com dígito verificador; rejeita sequências repetidas.
function documentoValido(valor) {
  const d = soDigitos(valor);
  if ((d.length !== 11 && d.length !== 14) || /^(\d)\1+$/.test(d)) return false;
  const pesos = d.length === 11 ? PESOS_CPF : PESOS_CNPJ;
  const dv1 = digitoVerificador(d, pesos);
  const dv2 = digitoVerificador(d, [d.length === 11 ? 11 : 6, ...pesos]);
  return Number(d[pesos.length]) === dv1 && Number(d[pesos.length + 1]) === dv2;
}

function pill(label, ok) {
  const cor = ok ? ['#bbf7d0', 'rgba(22,101,52,.18)'] : ['#cbd5e1', 'rgba(148,163,184,.12)'];
  return `<span style="display:inline-flex;padding:4px 8px;border-radius:999px;font-size:12px;font-weight:800;color:${cor[0]};background:${cor[1]};border:1px solid rgba(148,163,184,.2)">${esc(label)}</span>`;
}

async function loadContas() {
  const { data, error } = await supabase.from('rh_contas_pagamento').select('*').order('created_at', { ascending: false }).limit(1000);
  if (error) console.warn('[Holerite e Pagamentos] contas', error);
  state.contas = data || [];
  state.contasErro = error ? error.message : null;
  state.contasCarregadas = true;
  renderContasTable();
}

function contasFiltradas() {
  const q = semAcento(state.filtrosContas?.nome);
  const tipo = state.filtrosContas?.tipo || '';
  return state.contas.filter((c) => {
    if (tipo && c.tipo !== tipo) return false;
    return !q || semAcento(`${c.colaborador_nome} ${c.titular_nome}`).includes(q);
  });
}

function contaDetalhes(c) {
  return [
    c.agencia ? `Ag ${c.agencia}` : '',
    c.conta ? `Conta ${c.conta}` : '',
    TIPOS_CONTA_BANCARIA[c.tipo_conta] || '',
  ].filter(Boolean).join(' · ');
}

function renderContasTable() {
  const body = document.getElementById('hpcBody');
  if (!body) return;
  if (state.contasErro) {
    body.innerHTML = `<tr><td colspan="8" class="hp-empty">Não foi possível carregar as contas: ${esc(state.contasErro)}</td></tr>`;
    return;
  }
  const rows = contasFiltradas();
  if (!rows.length) {
    body.innerHTML = `<tr><td colspan="8" class="hp-empty">${state.contas.length ? 'Nenhuma conta no filtro atual.' : 'Nenhuma conta cadastrada. Clique em <b>+ Nova Conta</b> para começar.'}</td></tr>`;
    return;
  }
  body.innerHTML = rows.map((c) => {
    const detalhes = contaDetalhes(c);
    const autorizacao = c.tipo === 'outro_titular'
      ? (c.anexo_url ? anexoBtnHtml(c.anexo_url) : '<span class="muted">Não anexada</span>')
      : '-';
    return `<tr>
      <td><b>${esc(c.colaborador_nome)}</b></td>
      <td>${esc(TIPOS_CONTA[c.tipo]?.label || c.tipo)}</td>
      <td>${esc(c.titular_nome)}<span class="hp-sub">${esc(fmtDocumento(c.titular_documento))}${c.vinculo ? ` · ${esc(c.vinculo)}` : ''}</span></td>
      <td>${esc(c.banco)}${detalhes ? `<span class="hp-sub">${esc(detalhes)}</span>` : ''}</td>
      <td>${esc(c.chave_pix || '-')}</td>
      <td>${autorizacao}</td>
      <td>${pill(c.ativo ? 'Ativa' : 'Inativa', c.ativo)}</td>
      <td>${acoesHtml(c.id)}</td>
    </tr>`;
  }).join('');
  bindAnexoButtons(body);
  bindAcoes(body, {
    table: 'rh_contas_pagamento',
    reload: loadContas,
    descricao: 'esta conta',
    onEdit: (id) => {
      const row = state.contas.find((r) => String(r.id) === String(id));
      if (row) openContaModal(row);
    },
  });
}

function exportarContas() {
  exportCsv('contas-pagamento', [
    { key: 'tipo', label: 'Tipo', fmt: (v) => TIPOS_CONTA[v]?.label || v },
    { key: 'colaborador_nome', label: 'Colaborador' },
    { key: 'colaborador_cpf', label: 'CPF do colaborador', fmt: (v) => v ? fmtDocumento(v) : '' },
    { key: 'titular_nome', label: 'Titular / Beneficiário' },
    { key: 'titular_documento', label: 'CPF/CNPJ do titular', fmt: fmtDocumento },
    { key: 'vinculo', label: 'Vínculo' },
    { key: 'banco', label: 'Banco' },
    { key: 'agencia', label: 'Agência' },
    { key: 'conta', label: 'Conta' },
    { key: 'tipo_conta', label: 'Tipo de conta', fmt: (v) => TIPOS_CONTA_BANCARIA[v] || '' },
    { key: 'chave_pix', label: 'Chave PIX' },
    { key: 'anexo_url', label: 'Autorização anexada', fmt: (v, r) => r.tipo === 'outro_titular' ? (v ? 'Sim' : 'Não') : '' },
    { key: 'ativo', label: 'Status', fmt: (v) => v ? 'Ativa' : 'Inativa' },
    { key: 'observacoes', label: 'Observações' },
    { key: 'created_at', label: 'Cadastrada em', fmt: dataHora },
  ], contasFiltradas());
}

function openContaModal(row = null) {
  const modal = document.getElementById('hpModal');
  const editando = Boolean(row);
  let selecionado = row ? { id: row.colaborador_id, nome: row.colaborador_nome, cpf: row.colaborador_cpf } : null;
  const optsTipo = (atual) => Object.entries(TIPOS_CONTA).map(([k, t]) => `<option value="${k}" ${k === atual ? 'selected' : ''}>${esc(t.label)}</option>`).join('');
  const optsTipoConta = (atual) => `<option value="">Não informado</option>${Object.entries(TIPOS_CONTA_BANCARIA).map(([k, l]) => `<option value="${k}" ${k === atual ? 'selected' : ''}>${esc(l)}</option>`).join('')}`;

  modal.innerHTML = `<div class="hp-modal-card">
    <div class="section-head"><div><h3>${editando ? 'Editar Conta' : 'Nova Conta'}</h3></div><button class="btn btn-secondary" id="mClose" type="button">Fechar</button></div>
    <div class="hp-grid mt-16">
      <label class="hp-full">Tipo de conta *<select id="hpcTipo">${optsTipo(row?.tipo || 'outro_titular')}</select></label>
      <p class="muted hp-full" id="hpcTipoAjuda" style="font-size:12px;margin:0"></p>
      <div class="hp-full" style="position:relative">
        <label>Colaborador *<input id="hpcColabInput" type="text" placeholder="Digite o nome para pesquisar..." autocomplete="off" value="${esc(row?.colaborador_nome || '')}"></label>
        <div id="hpcColabSug" style="display:none;position:absolute;top:100%;left:0;right:0;z-index:50;background:#071b13;border:1px solid var(--line);border-radius:14px;padding:6px;max-height:200px;overflow:auto;margin-top:4px"></div>
      </div>
      <label><span id="hpcTitularLbl"></span><input id="hpcTitular" type="text" autocomplete="off" value="${esc(row?.titular_nome || '')}"></label>
      <label><span id="hpcDocumentoLbl"></span><input id="hpcDocumento" type="text" inputmode="numeric" maxlength="18" autocomplete="off" value="${esc(row ? fmtDocumento(row.titular_documento) : '')}"></label>
      <label>Vínculo com o colaborador<input id="hpcVinculo" type="text" autocomplete="off" value="${esc(row?.vinculo || '')}"></label>
      <label>Tipo de conta bancária<select id="hpcTipoConta">${optsTipoConta(row?.tipo_conta || '')}</select></label>
      <label>Banco *<input id="hpcBanco" type="text" placeholder="Ex.: 341 - Itaú, Nubank" autocomplete="off" value="${esc(row?.banco || '')}"></label>
      <label>Agência<input id="hpcAgencia" type="text" autocomplete="off" value="${esc(row?.agencia || '')}"></label>
      <label>Conta (com dígito)<input id="hpcConta" type="text" autocomplete="off" value="${esc(row?.conta || '')}"></label>
      <label>Chave PIX<input id="hpcPix" type="text" autocomplete="off" value="${esc(row?.chave_pix || '')}"></label>
      <div class="hp-full" id="hpcAnexoWrap">
        ${anexoFieldHtml('hpcAnexo', { label: 'Autorização do colaborador (opcional)', atual: row?.anexo_url })}
        ${row?.anexo_url ? `<div class="mt-8">${anexoBtnHtml(row.anexo_url)}</div>` : ''}
      </div>
      <label class="hp-full">Observações<textarea id="hpcObs" rows="3">${esc(row?.observacoes || '')}</textarea></label>
      <label class="hp-full hp-check"><input id="hpcAtivo" type="checkbox" ${row && !row.ativo ? '' : 'checked'}>Conta ativa</label>
    </div>
    <p class="muted mt-8" style="font-size:12px">Informe agência e conta, ou a chave PIX.</p>
    <div class="hp-actions mt-16"><button class="btn btn-primary" id="hpcSalvar" type="button">Salvar</button><button class="btn btn-secondary" id="hpcCancelar" type="button">Cancelar</button></div>
    <span class="hp-feedback mt-8" id="hpcFeedback"></span>
  </div>`;
  modal.classList.add('open');

  const campo = (sel) => modal.querySelector(sel);
  const valor = (sel) => campo(sel).value.trim();
  const selTipo = campo('#hpcTipo');
  const inputColab = campo('#hpcColabInput');
  const inputDoc = campo('#hpcDocumento');

  // Rótulos e o campo de autorização acompanham o tipo escolhido: a
  // autorização só existe pra conta de outro titular.
  const aplicarTipo = () => {
    const t = TIPOS_CONTA[selTipo.value];
    campo('#hpcTipoAjuda').textContent = t.ajuda;
    campo('#hpcTitularLbl').textContent = t.titular;
    campo('#hpcDocumentoLbl').textContent = t.documento;
    campo('#hpcVinculo').placeholder = t.vinculo;
    campo('#hpcAnexoWrap').style.display = selTipo.value === 'outro_titular' ? '' : 'none';
  };
  selTipo.onchange = aplicarTipo;
  aplicarTipo();

  colabAutocomplete(modal, '#hpcColabInput', '#hpcColabSug', (c) => { selecionado = c; });
  inputDoc.addEventListener('blur', () => {
    const d = soDigitos(inputDoc.value);
    if (d.length === 11 || d.length === 14) inputDoc.value = fmtDocumento(d);
  });
  bindAnexoButtons(modal);
  const fechar = () => modal.classList.remove('open');
  campo('#mClose').onclick = fechar;
  campo('#hpcCancelar').onclick = fechar;

  campo('#hpcSalvar').onclick = async () => {
    const fb = campo('#hpcFeedback');
    fb.textContent = '';
    fb.classList.remove('err');
    const erro = (msg) => { fb.textContent = msg; fb.classList.add('err'); };

    const tipo = selTipo.value;
    const titular = valor('#hpcTitular');
    const documento = soDigitos(valor('#hpcDocumento'));
    const banco = valor('#hpcBanco');
    const agencia = valor('#hpcAgencia');
    const conta = valor('#hpcConta');
    const pix = valor('#hpcPix');
    const ativo = campo('#hpcAtivo').checked;

    // Precisa ser alguém da base: o id e o CPF vêm de lá. Digitar um nome sem
    // escolher na lista (ou alterar o nome de um registro editado) não vale.
    if (!selecionado?.id) return erro('Selecione o colaborador na lista de sugestões.');
    if (!titular) return erro(`Informe ${tipo === 'pensao' ? 'o beneficiário da pensão' : 'o titular da conta'}.`);
    if (!documentoValido(documento)) return erro('CPF/CNPJ do titular inválido. Confira os números.');
    const cpfColab = soDigitos(selecionado.cpf);
    if (tipo === 'outro_titular' && cpfColab && documento === cpfColab) {
      return erro('O CPF do titular é o mesmo do colaborador — essa é a conta dele e não precisa de cadastro aqui.');
    }
    if (!banco) return erro('Informe o banco.');
    if (!pix && !(agencia && conta)) return erro('Informe agência e conta, ou a chave PIX.');

    // Pra pagar, só uma conta de outro titular pode valer por vez.
    if (tipo === 'outro_titular' && ativo) {
      const jaTem = state.contas.some((c) => c.tipo === 'outro_titular' && c.ativo && c.colaborador_id === selecionado.id && c.id !== row?.id);
      if (jaTem && !confirm('Este colaborador já tem uma conta de outro titular ativa. Cadastrar esta como ativa também?')) return;
    }

    const botao = campo('#hpcSalvar');
    botao.disabled = true;
    try {
      const arquivo = await resolverAnexo(modal, 'hpcAnexo', 'contas-autorizacao', row?.anexo_url || null);
      const payload = {
        tipo,
        colaborador_id: selecionado.id,
        colaborador_nome: selecionado.nome,
        colaborador_cpf: cpfColab.length === 11 ? cpfColab : null,
        titular_nome: titular,
        titular_documento: documento,
        vinculo: valor('#hpcVinculo') || null,
        banco,
        agencia: agencia || null,
        conta: conta || null,
        tipo_conta: campo('#hpcTipoConta').value || null,
        chave_pix: pix || null,
        // Pensão não tem autorização; se o registro virou pensão, o anexo antigo fica como está.
        anexo_url: tipo === 'outro_titular' ? arquivo : (row?.anexo_url || null),
        observacoes: valor('#hpcObs') || null,
        ativo,
        updated_at: new Date().toISOString(),
      };
      const { error } = editando
        ? await supabase.from('rh_contas_pagamento').update(payload).eq('id', row.id)
        : await supabase.from('rh_contas_pagamento').insert({ ...payload, created_by: state.ctx?.user?.id || null });
      if (error) throw error;
      fechar();
      await loadContas();
    } catch (e) {
      erro(e.message);
    } finally {
      botao.disabled = false;
    }
  };
}

function selecionarAba(content, aba) {
  state.aba = aba;
  content.querySelectorAll('[data-hp-tab]').forEach((b) => {
    const ativa = b.dataset.hpTab === aba;
    b.classList.toggle('active', ativa);
    b.setAttribute('aria-selected', String(ativa));
  });
  content.querySelector('#hpPainelFolhas').hidden = aba !== 'folhas';
  content.querySelector('#hpPainelContas').hidden = aba !== 'contas';
  if (aba === 'contas' && !state.contasCarregadas) loadContas();
}

export async function renderContent(content, userContext) {
  state.ctx = userContext;
  content.innerHTML = `${styles()}<section class="hero-card"><div><div class="eyebrow">Recursos Humanos</div><h2>Folha e Holerite</h2><p>Folha de pagamento, holerites e contas de pagamento dos colaboradores.</p></div><div class="hero-badge-wrap"><span class="hero-badge">RH</span></div></section>
  <div class="hp-tabs mt-16" role="tablist">
    <button class="hp-tab active" data-hp-tab="folhas" type="button" role="tab" aria-selected="true">Folhas</button>
    <button class="hp-tab" data-hp-tab="contas" type="button" role="tab" aria-selected="false">Contas</button>
  </div>
  <div id="hpPainelFolhas">
    <div class="section-head mt-16"><div><h3>Folhas lançadas</h3><p class="muted">Uma linha por lote (empresa + holerites enviados). A busca também filtra por competência (ex.: 07/2026), já identificada pelo agente.</p></div><button class="btn btn-primary" id="hpNova" type="button">+ Nova Folha</button></div>
    ${filtrosHtml('hp', { periodo: false })}
    <div class="hp-table-wrap mt-16"><table class="hp-table"><thead><tr><th>Enviada em</th><th>Colaborador / Empresa</th><th>Competência</th><th>Líquido</th><th>Holerite</th><th>Status</th><th>Ações</th></tr></thead><tbody id="hpBody"><tr><td colspan="7" class="hp-empty">Carregando...</td></tr></tbody></table></div>
  </div>
  <div id="hpPainelContas" hidden>
    <div class="section-head mt-16"><div><h3>Contas de pagamento</h3><p class="muted">Contas fora do padrão: colaborador que recebe em conta de outro titular (CPF diferente do dele) e contas para débito de pensão. Na baixa dos holerites, o comprovante pago ao titular/beneficiário cadastrado aqui é casado com o colaborador — por isso o nome e o CPF do titular precisam estar certos.</p></div><button class="btn btn-primary" id="hpcNova" type="button">+ Nova Conta</button></div>
    <div class="rh-filtros mt-16">
      <input id="hpcFilNome" type="search" placeholder="Filtrar por colaborador ou titular..." autocomplete="off">
      <select id="hpcFilTipo"><option value="">Todos os tipos</option>${Object.entries(TIPOS_CONTA).map(([k, t]) => `<option value="${k}">${esc(t.label)}</option>`).join('')}</select>
      <button class="btn btn-secondary" id="hpcFilLimpar" type="button">Limpar</button>
      <button class="btn btn-secondary" id="hpcExportar" type="button">⬇ Exportar CSV</button>
    </div>
    <div class="hp-table-wrap mt-16"><table class="hp-table" style="min-width:980px"><thead><tr><th>Colaborador</th><th>Tipo</th><th>Titular / Beneficiário</th><th>Banco / Conta</th><th>PIX</th><th>Autorização</th><th>Status</th><th>Ações</th></tr></thead><tbody id="hpcBody"><tr><td colspan="8" class="hp-empty">Carregando...</td></tr></tbody></table></div>
  </div>
  <div class="hp-modal" id="hpModal"></div>`;
  content.querySelectorAll('[data-hp-tab]').forEach((b) => { b.onclick = () => selecionarAba(content, b.dataset.hpTab); });
  content.querySelector('#hpNova').onclick = () => openNovaFolhaModal();
  bindFiltros(content, 'hp', () => { state.filtros = lerFiltros(content, 'hp'); renderTable(); });
  content.querySelector('#hpExportar').onclick = exportar;

  const filtrarContas = () => {
    state.filtrosContas = { ...lerFiltros(content, 'hpc'), tipo: content.querySelector('#hpcFilTipo').value };
    renderContasTable();
  };
  content.querySelector('#hpcNova').onclick = () => openContaModal();
  bindFiltros(content, 'hpc', filtrarContas);
  content.querySelector('#hpcFilTipo').onchange = filtrarContas;
  // bindFiltros só limpa o texto; o tipo é resetado aqui e a lista refeita pelo handler dele.
  content.querySelector('#hpcFilLimpar').addEventListener('click', () => { content.querySelector('#hpcFilTipo').value = ''; filtrarContas(); });
  content.querySelector('#hpcExportar').onclick = exportarContas;
  await loadFolhas();
}

initProtectedPage('Folha e Holerite', renderContent);
