// Financeiro — pagamentos de Compras: itens → linha da fila, agrupamento, divisão parcial, baixa dos itens e EPI.
// Extraído de setor-pagamentos.js em 30/10/2026; o código das funções foi movido sem alteração (só saiu de dentro da fábrica).
// Ao editar, troque o token v=20261030-fin13 em TODOS os imports internos (ver tests/financeiro-modulos-versao.test.mjs).
import { supabase } from '../../supabaseClient.js';
import { safe, normalize, isMissingColumnError, hashText } from './util.js?v=20261030-fin13';

export function compraItemToPagamento(row) {
  const s = row.compras_solicitacoes || {};
  const quantidade = row.quantidade || row.unidade || 1;
  const partes = [
    `- ${quantidade} un ${row.material || '-'}`,
    row.tamanho ? `  Tamanho/Detalhe: ${row.tamanho}` : '',
    row.colaborador_nome ? `  Colaborador: ${row.colaborador_nome}` : ''
  ].filter(Boolean);
  return {
    ...row,
    id: `compra_${row.id}`,
    _source_table: 'compras_itens',
    origem: 'COMPRAS',
    origem_id: row.id,
    descricao: partes.join('\n'),
    conteudo: partes.join('\n'),
    fornecedor: row.fornecedor || row.favorecido || s.fornecedor || '',
    favorecido: row.fornecedor || row.favorecido || s.fornecedor || '',
    contato: row.contato || '',
    contato_fornecedor: s.telefone_fornecedor || row.contato_fornecedor || '',
    valor: row.valor_total || 0,
    status: row.status === 'aguardando_nf' ? 'AGUARDANDO NF' : 'PENDENTE',
    created_at: row.updated_at || row.created_at || s.created_at || s.data_solicitacao,
    data_solicitacao: s.data_solicitacao || row.created_at,
    dados_pagamento: row.dados_pagamento || '',
    forma_pagamento: row.forma_pagamento || '',
    comprovante_url: row.comprovante_url || '',
    _codigo_pagamento: row.codigo_pagamento || '',
    _raw_compra_item_id: row.id,
    _compra_item_ids: [row.id],
    _gestor: s.solicitante || '',
    _coordenacao: s.coordenacao || ''
  };
}

export function groupCompraPagamentos(rows = []) {
  const map = new Map();
  rows.forEach((row) => {
    const base = compraItemToPagamento(row);
    const key = [
      base.forma_pagamento || '',
      base.dados_pagamento || '',
      base._gestor || '',
      base._coordenacao || '',
      base.status || ''
    ].map((v) => normalize(v)).join('|');

    if (!map.has(key)) {
      map.set(key, {
        ...base,
        id: `compra_grp_${Math.abs(hashText(key).replace('fin_', '').split('_')[0] || Date.now())}`,
        origem_id: `grupo_${key}`,
        descricao: '',
        conteudo: '',
        valor: 0,
        _source_table: 'compras_itens_group',
        _compra_item_ids: [],
        _codigo_pagamento: '',
        _raw_compra_item_id: null
      });
    }

    const group = map.get(key);
    group.valor += Number(base.valor || 0);
    group._compra_item_ids.push(...(base._compra_item_ids || []));
    if (base._codigo_pagamento && !String(group._codigo_pagamento || '').split(' / ').includes(base._codigo_pagamento)) {
      group._codigo_pagamento = group._codigo_pagamento ? `${group._codigo_pagamento} / ${base._codigo_pagamento}` : base._codigo_pagamento;
    }
    group.descricao += (group.descricao ? '\n' : '') + base.descricao;
    group.conteudo = group.descricao;
    if (new Date(base.created_at || 0).getTime() > new Date(group.created_at || 0).getTime()) {
      group.created_at = base.created_at;
    }
  });

  return [...map.values()];
}

export function idsItensCompra(row) {
  const ids = Array.isArray(row._compra_item_ids) && row._compra_item_ids.length
    ? row._compra_item_ids
    : (Array.isArray(row.compras_item_ids) && row.compras_item_ids.length ? row.compras_item_ids : (row.origem_id && !String(row.origem_id).startsWith('grupo_') ? [row.origem_id] : []));
  return [...new Set(ids.map((id) => String(id || '').replace(/^compra_/, '')).filter(Boolean))];
}

// Divide um pagamento real de Compras: os itens selecionados viram um
// registro PAGO (com o comprovante) e o restante continua pendente.
async function dividirPagamentoCompras(row, itensSel, itensRest, comprovanteUrl) {
  const soma = (lista) => lista.reduce((s, i) => s + Number(i.valor_total || 0), 0);
  const descricao = (lista) => `Compra: ${lista.map((i) => `${i.quantidade || i.unidade || 1} un ${i.material}`).join(' | ')}`;
  const linhas = String(row.dados_pagamento || '').split('\n');
  const prefixo = (i) => `${i.material}: `;
  const dadosDe = (lista, outros) => linhas
    .filter((l) => lista.some((i) => l.startsWith(prefixo(i))) || !outros.some((i) => l.startsWith(prefixo(i))))
    .join('\n') || null;
  const base = {
    origem: row.origem, origem_setor: row.origem_setor || 'COMPRAS', favorecido: row.favorecido, fornecedor: row.fornecedor,
    contato: row.contato, forma_pagamento: row.forma_pagamento, vencimento: row.vencimento || null,
  };
  // O pedaço pago mantém o código do pagamento com um sufixo (PAG-…-001-1), o resto fica com o original.
  let codigoPago = null;
  if (row.codigo) {
    const { count } = await supabase.from('financeiro_pagamentos').select('id', { count: 'exact', head: true }).like('codigo', `${row.codigo}-%`);
    codigoPago = `${row.codigo}-${(count || 0) + 1}`;
  }
  const { error: insErr } = await supabase.from('financeiro_pagamentos').insert({
    ...base,
    codigo: codigoPago,
    origem_id: itensSel[0].id,
    compras_item_ids: itensSel.map((i) => i.id),
    descricao: descricao(itensSel),
    valor: soma(itensSel),
    dados_pagamento: dadosDe(itensSel, itensRest),
    status: 'PAGO',
    pago_em: new Date().toISOString(),
    comprovante_url: comprovanteUrl,
  });
  if (insErr) throw insErr;
  const { error: updErr } = await supabase.from('financeiro_pagamentos').update({
    origem_id: itensRest[0].id,
    compras_item_ids: itensRest.map((i) => i.id),
    descricao: descricao(itensRest),
    valor: soma(itensRest),
    dados_pagamento: dadosDe(itensRest, itensSel),
  }).eq('id', row.id);
  if (updErr) throw updErr;
  if (codigoPago) await supabase.from('compras_itens').update({ codigo_pagamento: codigoPago }).in('id', itensSel.map((i) => i.id));
}

export async function enviarComprovanteParcial(row, itensSel, itensRest, comprovanteUrl) {
  const idsSel = itensSel.map((i) => i.id);
  const { error } = await supabase.from('compras_itens')
    .update({ status: 'aguardando_nf', comprovante_url: comprovanteUrl })
    .in('id', idsSel).eq('status', 'pendente_pagamento');
  if (error) throw error;
  if (!String(row.id).startsWith('compra_')) await dividirPagamentoCompras(row, itensSel, itensRest, comprovanteUrl);
  await safe(() => supabase.from('rh_epi_registros').update({ status: 'pendente' }).in('compra_item_id', idsSel).eq('status', 'aguardando_pagamento'), null);
}

export async function ativarEpiRegistros(row) {
  const ids = (row._compra_item_ids || [])
    .map((id) => String(id || '').replace(/^compra_/, ''))
    .filter(Boolean);
  const seedId = ids[0] || (row.origem_id ? String(row.origem_id).replace(/^compra_/, '') : null);
  if (!seedId) return;
  const { data: seedItem } = await supabase.from('compras_itens').select('solicitacao_id').eq('id', seedId).maybeSingle();
  if (!seedItem?.solicitacao_id) return;
  const { data: solItens } = await supabase.from('compras_itens').select('id').eq('solicitacao_id', seedItem.solicitacao_id);
  const allIds = (solItens || []).map((i) => i.id);
  if (!allIds.length) return;
  await safe(() => supabase.from('rh_epi_registros').update({ status: 'pendente' }).in('compra_item_id', allIds).eq('status', 'aguardando_pagamento'), null);
}

export async function updateComprasComprovante(row, comprovanteUrl) {
  const ids = idsItensCompra(row);

  const forma = row.forma_pagamento || '';
  const dados = row.dados_pagamento || '';

  // Boletos de Compras já entram como "comprado" (NF anexada na origem —
  // vai direto pra Notas Fiscais, sem esperar o Financeiro pagar). Não
  // regride pra "aguardando_nf" um item que já passou dessa etapa; só
  // itens ainda "pendente_pagamento" avançam aqui.
  let q = supabase.from('compras_itens');
  if (ids.length) {
    q = q.update({ status: 'aguardando_nf', comprovante_url: comprovanteUrl }).in('id', ids).eq('status', 'pendente_pagamento');
  } else if (dados) {
    q = q.update({ status: 'aguardando_nf', comprovante_url: comprovanteUrl }).eq('dados_pagamento', dados).eq('status', 'pendente_pagamento');
    if (forma) q = q.eq('forma_pagamento', forma);
  } else if (row.origem_id) {
    q = q.update({ status: 'aguardando_nf', comprovante_url: comprovanteUrl }).eq('id', String(row.origem_id).replace(/^compra_/, '')).eq('status', 'pendente_pagamento');
  } else {
    return;
  }

  let { error } = await q;
  if (!error) return;

  if (isMissingColumnError(error)) {
    let retry = supabase.from('compras_itens');
    if (ids.length) retry = retry.update({ status: 'aguardando_nf' }).in('id', ids).eq('status', 'pendente_pagamento');
    else if (dados) {
      retry = retry.update({ status: 'aguardando_nf' }).eq('dados_pagamento', dados).eq('status', 'pendente_pagamento');
      if (forma) retry = retry.eq('forma_pagamento', forma);
    } else if (row.origem_id) retry = retry.update({ status: 'aguardando_nf' }).eq('id', String(row.origem_id).replace(/^compra_/, '')).eq('status', 'pendente_pagamento');
    const res = await retry;
    if (res.error) throw res.error;
    return;
  }

  throw error;
}
