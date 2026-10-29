// assets/js/modules/notas-fiscais/components/completar.js
// Formulário do lápis (Pendentes): preenche o que o agente do GRM não achou na NF e devolve a NF à fila.
// Os valores vão pra grm_nf_lancamentos.ajustes_manuais (RPC completar_lancamento_nf) e o agente
// aplica por cima da extração (applyManualOverrides). Mesma lógica do ✎ de "Enviar Notas Fiscais".

import { openModal, closeModal, esc, toast } from '../../../core/ui.js';
import { supabase } from '../../../supabaseClient.js';
import { carregarLancamentoGrm, completarLancamentoGrm, anexarArquivoNaNf, ACEITA_ARQUIVO_NF } from '../service.js';

const FORMAS_PAGAMENTO_PADRAO = [
  'Boleto', 'Cartão de Crédito', 'Cartão de Débito', 'Cheque', 'Débito em Conta',
  'Depósito / Transferência', 'Dinheiro', 'PIX',
];

let catalogo = null;

async function carregarCatalogo() {
  if (catalogo) return catalogo;
  const { data, error } = await supabase.from('grm_nf_catalogo').select('tipo,nome,grupo').order('nome');
  if (error) throw error;
  const rows = data || [];
  catalogo = {
    categorias: rows.filter((r) => r.tipo === 'CATEGORIA'),
    formas: rows.filter((r) => r.tipo === 'FORMA_PAGAMENTO').map((r) => r.nome),
  };
  return catalogo;
}

// Pendência do agente (validacao_erros) → campo do formulário. data_participacao do rateio segue a data da conta.
export function campoDaPendencia(texto) {
  const t = String(texto || '');
  if (t === 'grupo_categoria' || t === 'categoria') return 'categoria';
  if (t === 'rateio.data_participacao') return 'data_conta';
  if (t === 'valor_total' || t.startsWith('rateio.valor')) return 'valor_total';
  return ['data_vencimento', 'forma_pagamento', 'numero_documento', 'data_conta'].includes(t) ? t : null;
}

function dataParaIso(valor) {
  const m = String(valor || '').match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return /^\d{4}-\d{2}-\d{2}/.test(String(valor || '')) ? String(valor).slice(0, 10) : '';
}

// "1.234,56" / "1234,56" / "1234.56" → "1234.56" (formato que a RPC aceita); '' se não for um valor válido.
function valorParaRpc(texto) {
  let s = String(texto ?? '').replace(/[^\d,.]/g, '');
  if (!s) return '';
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? n.toFixed(2) : '';
}

function valorParaTela(valor) {
  const n = Number(valor);
  return Number.isFinite(n) && n > 0 ? n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '';
}

function opcoesCategoria(categorias, atual) {
  const grupos = new Map();
  categorias.forEach((c) => {
    if (!grupos.has(c.grupo)) grupos.set(c.grupo, []);
    grupos.get(c.grupo).push(c);
  });
  const conhecida = categorias.some((c) => c.nome === atual);
  const extra = atual && !conhecida ? `<option value="${esc(atual)}" data-grupo="" selected>${esc(atual)}</option>` : '';
  return `<option value="">Selecione…</option>${extra}${[...grupos.entries()].sort(([a], [b]) => a.localeCompare(b, 'pt-BR')).map(([grupo, itens]) => `
    <optgroup label="${esc(grupo || 'Sem grupo')}">${itens.map((c) => `<option value="${esc(c.nome)}" data-grupo="${esc(c.grupo)}"${c.nome === atual ? ' selected' : ''}>${esc(c.nome)}</option>`).join('')}</optgroup>`).join('')}`;
}

function campo({ id, label, pendente, html }) {
  const aviso = pendente ? '<small style="color:#e0a93b">● pendente — o agente não achou na NF</small>' : '';
  return `<div class="ds-field"><label for="nfc_${id}">${esc(label)}</label>${html}${aviso}</div>`;
}

/** Abre o formulário da NF (grupo de agruparPorNf com grupo.grm). aoSalvar roda depois que a NF volta pra fila. */
export async function abrirCompletarNf(grupo, { aoSalvar } = {}) {
  let lancamento;
  let cat;
  try {
    [lancamento, cat] = await Promise.all([carregarLancamentoGrm(grupo.grm.id), carregarCatalogo()]);
  } catch (error) {
    toast(`Não foi possível abrir o formulário: ${String(error?.message || error)}`, 'err', 6000);
    return;
  }

  const extraido = lancamento.extraido_json || {};
  const erros = lancamento.validacao_erros || [];
  const pendencias = new Set(erros.map(campoDaPendencia).filter(Boolean));
  const foraDoAlcance = erros.filter((p) => !campoDaPendencia(p));
  const limpa = (v) => (/^PREENCHER/i.test(String(v || '')) ? '' : String(v || ''));
  const inicial = {
    data_vencimento: dataParaIso(extraido.data_vencimento),
    data_conta: dataParaIso(extraido.data_conta),
    forma_pagamento: limpa(extraido.forma_pagamento),
    categoria: limpa(extraido.categoria),
    numero_documento: limpa(extraido.numero_documento),
    valor_total: valorParaRpc(extraido.valor_total),
  };
  const formas = cat.formas.length ? cat.formas : FORMAS_PAGAMENTO_PADRAO;
  const optForma = `<option value="">Selecione…</option>${inicial.forma_pagamento && !formas.includes(inicial.forma_pagamento) ? `<option value="${esc(inicial.forma_pagamento)}" selected>${esc(inicial.forma_pagamento)}</option>` : ''}${formas.map((f) => `<option value="${esc(f)}"${f === inicial.forma_pagamento ? ' selected' : ''}>${esc(f)}</option>`).join('')}`;

  const campos = [
    campo({ id: 'valor_total', label: 'Valor total (R$)', pendente: pendencias.has('valor_total'), html: `<input id="nfc_valor_total" data-campo="valor_total" type="text" inputmode="decimal" placeholder="0,00" value="${esc(valorParaTela(extraido.valor_total))}">` }),
    campo({ id: 'data_conta', label: 'Data da conta (emissão)', pendente: pendencias.has('data_conta'), html: `<input id="nfc_data_conta" data-campo="data_conta" type="date" value="${esc(inicial.data_conta)}">` }),
    campo({ id: 'data_vencimento', label: 'Data de vencimento', pendente: pendencias.has('data_vencimento'), html: `<input id="nfc_data_vencimento" data-campo="data_vencimento" type="date" value="${esc(inicial.data_vencimento)}">` }),
    campo({ id: 'numero_documento', label: 'Número do documento', pendente: pendencias.has('numero_documento'), html: `<input id="nfc_numero_documento" data-campo="numero_documento" type="text" maxlength="60" value="${esc(inicial.numero_documento)}">` }),
    campo({ id: 'forma_pagamento', label: 'Forma de pagamento', pendente: pendencias.has('forma_pagamento'), html: `<select id="nfc_forma_pagamento" data-campo="forma_pagamento">${optForma}</select>` }),
    campo({ id: 'categoria', label: 'Categoria', pendente: pendencias.has('categoria'), html: `<select id="nfc_categoria" data-campo="categoria">${opcoesCategoria(cat.categorias, inicial.categoria)}</select>` }),
  ].join('');

  const aviso = foraDoAlcance.length
    ? `<p class="ds-modal-text" style="color:#e0a93b">Também pendente, mas não editável aqui: ${esc(foraDoAlcance.join(', '))}.</p>`
    : '';

  const arquivoAtual = /^https?:///i.test(String(grupo.nf_url || ''))
    ? `<a href="${esc(grupo.nf_url)}" target="_blank" rel="noopener">ver o arquivo que está nesta NF</a>`
    : 'sem arquivo anexado';
  const secaoArquivo = `
    <div class="ds-field" style="margin-top:14px;padding-top:12px;border-top:1px solid rgba(148,163,184,.2)">
      <label for="nfc_arquivo">Anexo da NF</label>
      <small>Anexou o arquivo errado (ou o comprovante duas vezes)? Envie o certo aqui — ${arquivoAtual}.</small>
      <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-top:6px">
        <select id="nfc_arquivo_modo" style="max-width:340px">
          <option value="trocar">Trocar o arquivo desta NF</option>
          <option value="adicionar">Adicionar como outro documento da compra</option>
        </select>
        <input id="nfc_arquivo" type="file" accept="${ACEITA_ARQUIVO_NF}">
        <button class="ds-btn" data-nfc-arquivo type="button" title="Envia o arquivo e a NF nova entra na fila do GRM">Enviar arquivo</button>
      </div>
    </div>`;

  const overlay = openModal({
    id: 'nfCompletarModal',
    conteudoHtml: `
      <h3 class="ds-modal-title">Completar dados da NF</h3>
      <p class="ds-modal-text">${esc(grupo.regional)} · ${esc(grupo.solicitante)} — preencha o que o agente não encontrou. Só os campos alterados são enviados; o resto segue como o agente leu.</p>
      ${aviso}
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;margin-top:8px">${campos}</div>
      ${secaoArquivo}
      <div class="ds-modal-actions">
        <button class="ds-btn" data-nfc-cancelar type="button">Cancelar</button>
        <button class="ds-btn ds-btn-primary" data-nfc-salvar type="button" title="Guarda os dados e devolve a NF pra fila: o agente lança sozinho no GRM">Salvar e lançar</button>
      </div>`,
  });

  const coletar = () => {
    const valores = {};
    overlay.querySelectorAll('[data-campo]').forEach((el) => {
      const nome = el.dataset.campo;
      const valor = nome === 'valor_total' ? valorParaRpc(el.value) : String(el.value || '').trim();
      if (!valor || valor === inicial[nome]) return;
      valores[nome] = valor;
      if (nome === 'categoria') valores.grupo_categoria = el.selectedOptions[0]?.dataset.grupo || '';
    });
    return valores;
  };

  overlay.querySelector('[data-nfc-arquivo]').addEventListener('click', async () => {
    const file = overlay.querySelector('#nfc_arquivo').files?.[0];
    const modo = overlay.querySelector('#nfc_arquivo_modo').value;
    if (!file) {
      toast('Escolha o arquivo da NF.', 'warn');
      return;
    }
    overlay.querySelectorAll('button').forEach((b) => { b.disabled = true; });
    try {
      await anexarArquivoNaNf(grupo, file, { modo });
      closeModal('nfCompletarModal');
      toast(modo === 'trocar'
        ? 'Arquivo trocado. A NF nova entrou na fila e o agente lê os dados dela em instantes.'
        : 'Arquivo adicionado como outro documento da compra e enviado à fila do GRM.', 'ok', 7000);
      if (aoSalvar) await aoSalvar();
    } catch (error) {
      overlay.querySelectorAll('button').forEach((b) => { b.disabled = false; });
      toast(String(error?.message || error), 'err', 7000);
    }
  });
  overlay.querySelector('[data-nfc-cancelar]').addEventListener('click', () => closeModal('nfCompletarModal'));
  overlay.querySelector('[data-nfc-salvar]').addEventListener('click', async () => {
    const digitado = overlay.querySelector('#nfc_valor_total')?.value.trim();
    if (digitado && !valorParaRpc(digitado)) {
      toast('Valor total inválido.', 'warn');
      return;
    }
    const valores = coletar();
    if (!Object.keys(valores).length) {
      toast('Nenhum campo foi alterado.', 'warn');
      return;
    }
    overlay.querySelectorAll('button').forEach((b) => { b.disabled = true; });
    try {
      await completarLancamentoGrm(grupo, valores);
      closeModal('nfCompletarModal');
      toast('Dados salvos. A NF voltou pra fila e o agente lança sozinho em instantes.', 'ok', 6000);
      if (aoSalvar) await aoSalvar();
    } catch (error) {
      overlay.querySelectorAll('button').forEach((b) => { b.disabled = false; });
      toast(`Erro ao salvar: ${String(error?.message || error)}`, 'err', 6000);
    }
  });
}
