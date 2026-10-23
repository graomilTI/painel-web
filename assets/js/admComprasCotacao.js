// Cotação por link (Compras ADM): leitura dos links/respostas e comparação entre fornecedores.
// Funções puras + consultas simples; a tela (modais, cards) fica em adm-compras.js.

export const VALIDADE_LINK_DIAS = 7;
const LOTE = 80; // evita URL gigante do PostgREST em .in()

const qtdDe = (r) => Number(r?.quantidade || r?.unidade || 1);
const r2 = (v) => Math.round(Number(v || 0) * 100) / 100;

const normTxt = (v) => String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

// Cidade do pedido (solicitação). Pedido sem cidade conta como "sem cidade" e não se mistura com cidade informada.
export function chaveCidade(item) {
  const s = item?.compras_solicitacoes || {};
  return `${normTxt(s.cidade)}|${normTxt(s.uf)}`;
}
export function rotuloCidade(item) {
  const s = item?.compras_solicitacoes || {};
  return s.cidade ? `${s.cidade}${s.uf ? `/${s.uf}` : ''}` : 'sem cidade';
}

// Cotar ou comprar juntos só vale para pedidos da mesma cidade. Devolve a mensagem de erro, ou null se pode.
export function validarMesmaCidade(itens) {
  const cidades = new Map();
  for (const i of itens) if (!cidades.has(chaveCidade(i))) cidades.set(chaveCidade(i), rotuloCidade(i));
  if (cidades.size <= 1) return null;
  return `Não é possível unir pedidos de cidades diferentes (${[...cidades.values()].join(', ')}). Selecione só pedidos da mesma cidade.`;
}

// Card da cotação antes de existir link: mesmo gestor + mesma cidade (sem cidade também agrupa, entre si).
export function chaveGrupoPedido(item) {
  const gestor = normTxt(item?.compras_solicitacoes?.solicitante);
  return gestor ? `cot:${gestor}|${chaveCidade(item)}` : `solo:${item?.id}`;
}

export function urlDoLink(token, origem = globalThis.location?.origin || 'https://grao1000.com.br') {
  const host = /grao1000\.com\.br$/i.test(new URL(origem).hostname) ? 'https://grao1000.com.br' : origem;
  // Sem ".html": o roteador do painel manda /painel/*.html para a home do site (igual toPanelUrl).
  return `${host}/painel/cotacao-fornecedor?t=${token}`;
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
      cnpj, razao_social: base.razao_social, regime_tributario: base.regime_tributario || null,
      atendente_nome: base.atendente_nome || null, atendente_telefone: base.atendente_telefone || null, emite_nf: base.emite_nf, prazo_entrega: base.prazo_entrega,
      frete_pagador: base.frete_pagador || null, frete_valor: base.frete_valor == null ? null : Number(base.frete_valor),
      formas_pagamento: base.formas_pagamento || [], tem_desconto: !!base.tem_desconto, descontos: base.descontos || [],
      atualizado_em: base.atualizado_em, valores, cobertos: cobertos.length, total, completo: cobertos.length === itens.length,
    });
    const p = propostas[propostas.length - 1];
    p.totalComFrete = r2(p.total + (p.frete_pagador === 'cliente' ? p.frete_valor || 0 : 0));
  }
  // Quem cobre tudo vem antes (menor custo, já com o frete estimado quando é do cliente); depois os parciais.
  return propostas.sort((a, b) => Number(b.completo) - Number(a.completo) || a.totalComFrete - b.totalComFrete);
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

export const REGIMES = { simples_nacional: 'Simples Nacional', lucro_presumido: 'Lucro Presumido', lucro_real: 'Lucro Real' };

export function formatarTelefone(t) {
  const d = String(t || '').replace(/\D/g, '');
  if (d.length === 11) return d.replace(/^(\d{2})(\d{5})(\d{4})$/, '($1) $2-$3');
  if (d.length === 10) return d.replace(/^(\d{2})(\d{4})(\d{4})$/, '($1) $2-$3');
  return d;
}

export function descreverContato(p) {
  return [p.atendente_nome, formatarTelefone(p.atendente_telefone)].filter(Boolean).join(' · ') || '-';
}

export function descreverFrete(p) {
  if (p.frete_pagador === 'empresa') return 'Pago pela empresa (fornecedor)';
  if (p.frete_pagador === 'cliente') return `Pago pelo cliente${p.frete_valor ? ` · estimativa R$ ${Number(p.frete_valor).toFixed(2).replace('.', ',')}` : ''}`;
  return '-';
}

export function mensagemDoLink(url, expiraEm) {
  const ate = new Date(expiraEm).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  return `Olá! Segue o link para cotação de materiais da Grão 1000. Preencha os valores e confirme no final (disponível até ${ate}):\n${url}`;
}

export function formatarCnpj(c) {
  const d = String(c || '').replace(/\D/g, '');
  return d.length === 14 ? d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : d;
}
