// Cotação por link (Compras ADM): leitura dos links/respostas e comparação entre fornecedores.
// Funções puras + consultas simples; a tela (modais, cards) fica em adm-compras.js.

export const VALIDADE_LINK_DIAS = 7;
const LOTE = 80; // evita URL gigante do PostgREST em .in()

const qtdDe = (r) => Number(r?.quantidade || r?.unidade || 1);
const r2 = (v) => Math.round(Number(v || 0) * 100) / 100;

export function urlDoLink(token, origem = globalThis.location?.origin || 'https://grao1000.com.br') {
  const host = /grao1000\.com\.br$/i.test(new URL(origem).hostname) ? 'https://grao1000.com.br' : origem;
  return `${host}/painel/cotacao-fornecedor.html?t=${token}`;
}

export function linkAberto(cotacao, agora = new Date()) {
  return cotacao?.status === 'aberta' && new Date(cotacao.expira_em).getTime() > agora.getTime();
}

const emLotes = (lista) => Array.from({ length: Math.ceil(lista.length / LOTE) }, (_, i) => lista.slice(i * LOTE, (i + 1) * LOTE));

// itemIds -> { porItem: Map(itemId -> [cotacaoId]), cotacoes: Map(id -> cotacao), respostas: [resposta com itens] }
export async function carregarCotacoesDosItens(supabase, itemIds) {
  const porItem = new Map();
  const cotacoes = new Map();
  const respostas = [];
  for (const lote of emLotes([...new Set(itemIds.map(String))])) {
    const { data, error } = await supabase.from('compras_cotacao_itens').select('compra_item_id,cotacao_id').in('compra_item_id', lote);
    if (error) throw error;
    (data || []).forEach((v) => { const k = String(v.compra_item_id); porItem.set(k, [...(porItem.get(k) || []), v.cotacao_id]); });
  }
  const cotIds = [...new Set([...porItem.values()].flat())];
  for (const lote of emLotes(cotIds)) {
    const [{ data: cots, error: e1 }, { data: resps, error: e2 }] = await Promise.all([
      supabase.from('compras_cotacao_links').select('*').in('id', lote),
      supabase.from('compras_cotacao_respostas').select('*, compras_cotacao_resposta_itens(compra_item_id,valor_unitario)').in('cotacao_id', lote),
    ]);
    if (e1) throw e1;
    if (e2) throw e2;
    (cots || []).forEach((c) => cotacoes.set(c.id, c));
    respostas.push(...(resps || []));
  }
  return { porItem, cotacoes, respostas };
}

// Propostas dos fornecedores (um por CNPJ) para os itens dados. Se o mesmo CNPJ respondeu em mais de um link,
// vale a resposta mais recente de cada item. valores[itemId]: número = preço unitário; null = "Não possuo";
// undefined = esse fornecedor não foi consultado para o item.
export function montarPropostas(itens, info) {
  const porCnpj = new Map();
  for (const resp of info.respostas) {
    const lista = porCnpj.get(resp.cnpj) || [];
    lista.push(resp);
    porCnpj.set(resp.cnpj, lista);
  }
  const propostas = [];
  for (const [cnpj, resps] of porCnpj) {
    resps.sort((a, b) => String(b.atualizado_em).localeCompare(String(a.atualizado_em)));
    const valores = {};
    for (const resp of resps) {
      for (const it of resp.compras_cotacao_resposta_itens || []) {
        const id = String(it.compra_item_id);
        if (!(id in valores)) valores[id] = it.valor_unitario === null ? null : Number(it.valor_unitario);
      }
    }
    const consultados = itens.filter((i) => String(i.id) in valores);
    if (!consultados.length) continue; // respondeu só outros itens
    const cobertos = itens.filter((i) => valores[String(i.id)] > 0);
    const total = r2(cobertos.reduce((s, i) => s + valores[String(i.id)] * qtdDe(i), 0));
    const base = resps[0];
    propostas.push({
      cnpj, razao_social: base.razao_social, emite_nf: base.emite_nf, prazo_entrega: base.prazo_entrega,
      formas_pagamento: base.formas_pagamento || [], tem_desconto: !!base.tem_desconto, descontos: base.descontos || [],
      atualizado_em: base.atualizado_em, valores, cobertos: cobertos.length, total, completo: cobertos.length === itens.length,
    });
  }
  // Quem cobre tudo vem antes (menor total primeiro); depois os parciais, também do menor para o maior total.
  return propostas.sort((a, b) => Number(b.completo) - Number(a.completo) || a.total - b.total);
}

// Texto curto do estado de cotação de um item (cards da aba COTAÇÕES).
export function situacaoDoItem(itemId, info, agora = new Date()) {
  const cotIds = info?.porItem?.get(String(itemId)) || [];
  if (!cotIds.length) return { codigo: 'sem', texto: 'Sem cotação' };
  const respondeu = new Set();
  for (const resp of info.respostas) {
    if (!cotIds.includes(resp.cotacao_id)) continue;
    const it = (resp.compras_cotacao_resposta_itens || []).find((x) => String(x.compra_item_id) === String(itemId));
    if (it && it.valor_unitario > 0) respondeu.add(resp.cnpj);
  }
  if (respondeu.size) return { codigo: 'respostas', texto: `${respondeu.size} ${respondeu.size === 1 ? 'resposta' : 'respostas'}` };
  const aberto = cotIds.some((id) => linkAberto(info.cotacoes.get(id), agora));
  return aberto ? { codigo: 'enviado', texto: 'Link enviado' } : { codigo: 'encerrado', texto: 'Link encerrado' };
}

export function descreverDescontos(p) {
  if (!p.tem_desconto || !p.descontos?.length) return 'Não';
  return p.descontos.map((d) => `${d.forma}: ${d.tipo === 'percentual' ? `${d.valor}%` : `R$ ${Number(d.valor).toFixed(2).replace('.', ',')}`}`).join(' · ');
}

export function mensagemDoLink(url, expiraEm) {
  const ate = new Date(expiraEm).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  return `Olá! Segue o link para cotação de materiais da Grão 1000. Preencha os valores e confirme no final (disponível até ${ate}):\n${url}`;
}

export function formatarCnpj(c) {
  const d = String(c || '').replace(/\D/g, '');
  return d.length === 14 ? d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : d;
}
