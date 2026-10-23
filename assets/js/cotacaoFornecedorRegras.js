// Regras da resposta de cotação do fornecedor (link público de Compras).
// Funções puras (sem Deno nem rede) para poder testar no Node: tests/compras-cotacao-link.test.mjs.
// A página pública do fornecedor usa uma CÓPIA idêntica em assets/js/cotacaoFornecedorRegras.js (a Edge Function e o
// site são publicados separados). Alterou aqui? Copie para lá: o teste falha se os dois arquivos divergirem.

export const FORMAS_PAGAMENTO = ['PIX', 'Boleto', 'Cartão de crédito', 'Cartão de débito', 'Transferência', 'Dinheiro', 'Outra'];
// Quem paga o frete: a empresa (fornecedor, frete incluso) ou o cliente (Grão 1000, com estimativa de valor).
export const FRETE_PAGADORES = ['empresa', 'cliente'];
export const REGIMES = { simples_nacional: 'Simples Nacional', lucro_presumido: 'Lucro Presumido', lucro_real: 'Lucro Real' };
export const TOKEN_RE = /^[a-f0-9]{64}$/;
export const MAX_RESPOSTAS_POR_LINK = 30;

export function soDigitos(v) {
  return String(v ?? '').replace(/\D/g, '');
}

export function cnpjValido(v) {
  const c = soDigitos(v);
  if (c.length !== 14 || /^(\d)\1{13}$/.test(c)) return false;
  const dv = (base) => {
    let soma = 0;
    let peso = base.length - 7;
    for (const d of base) {
      soma += Number(d) * peso--;
      if (peso < 2) peso = 9;
    }
    const r = soma % 11;
    return r < 2 ? 0 : 11 - r;
  };
  const d1 = dv(c.slice(0, 12));
  const d2 = dv(c.slice(0, 12) + d1);
  return c.endsWith(`${d1}${d2}`);
}

// Aceita "12,50", "12.50" e "1.234,56". Devolve NaN se não for número.
export function lerValor(v) {
  if (typeof v === 'number') return v;
  let s = String(v ?? '').trim().replace(/^R\$\s*/, '');
  if (!s) return NaN;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  return /^\d+(\.\d+)?$/.test(s) ? Number(s) : NaN;
}

const limpa = (v, max) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

// Valida o corpo do POST contra os itens do link. Devolve { erro } ou { dados } já normalizado.
export function validarResposta(body, idsDoLink) {
  const b = body && typeof body === 'object' ? body : {};
  const cnpj = soDigitos(b.cnpj);
  if (!cnpjValido(cnpj)) return { erro: 'CNPJ inválido.' };
  const razao = limpa(b.razao_social, 200);
  if (razao.length < 3) return { erro: 'Informe a razão social.' };
  if (!Object.hasOwn(REGIMES, b.regime_tributario)) return { erro: 'Selecione o regime tributário.' };
  const atendente = limpa(b.atendente_nome, 120);
  if (atendente.length < 2) return { erro: 'Informe o nome do atendente.' };
  const telefone = soDigitos(b.atendente_telefone).replace(/^55(?=\d{10,11}$)/, '');
  if (telefone.length < 10 || telefone.length > 11) return { erro: 'Informe o telefone/WhatsApp com DDD.' };
  if (typeof b.emite_nf !== 'boolean') return { erro: 'Informe se emite nota fiscal.' };
  const prazo = limpa(b.prazo_entrega, 300);
  if (!prazo) return { erro: 'Informe o prazo de entrega.' };

  const ids = new Set(idsDoLink);
  const enviados = Array.isArray(b.itens) ? b.itens : [];
  const vistos = new Set();
  const itens = [];
  for (const it of enviados) {
    const id = String(it?.id ?? '');
    if (!ids.has(id) || vistos.has(id)) return { erro: 'Item inválido na cotação.' };
    vistos.add(id);
    if (it.valor === null || it.valor === undefined || it.valor === '') {
      if (it.nao_possuo !== true) return { erro: 'Informe o valor de todos os itens ou marque "Não possuo".' };
      itens.push({ id, valor_unitario: null });
      continue;
    }
    const valor = lerValor(it.valor);
    if (!Number.isFinite(valor) || valor <= 0 || valor > 10_000_000) return { erro: 'Valor de item inválido.' };
    itens.push({ id, valor_unitario: Math.round(valor * 100) / 100 });
  }
  if (itens.length !== ids.size) return { erro: 'Responda todos os itens da cotação.' };
  if (!itens.some((i) => i.valor_unitario !== null)) return { erro: 'Você marcou "Não possuo" em todos os itens; não há o que enviar.' };

  if (!FRETE_PAGADORES.includes(b.frete_pagador)) return { erro: 'Informe quem paga o frete.' };
  let freteValor = null;
  if (b.frete_pagador === 'cliente') {
    freteValor = lerValor(b.frete_valor);
    if (!Number.isFinite(freteValor) || freteValor <= 0 || freteValor > 10_000_000) return { erro: 'Informe a estimativa do valor do frete.' };
    freteValor = Math.round(freteValor * 100) / 100;
  }

  const formas = [...new Set(Array.isArray(b.formas_pagamento) ? b.formas_pagamento.map(String) : [])];
  if (!formas.length) return { erro: 'Selecione ao menos uma forma de pagamento.' };
  if (formas.some((f) => !FORMAS_PAGAMENTO.includes(f))) return { erro: 'Forma de pagamento inválida.' };

  if (typeof b.tem_desconto !== 'boolean') return { erro: 'Informe se possui desconto por forma de pagamento.' };
  const descontos = [];
  if (b.tem_desconto) {
    const lista = Array.isArray(b.descontos) ? b.descontos : [];
    if (!lista.length) return { erro: 'Informe a forma de pagamento e o desconto.' };
    for (const d of lista) {
      const forma = String(d?.forma ?? '');
      const tipo = d?.tipo === 'valor' ? 'valor' : 'percentual';
      const valor = lerValor(d?.valor);
      if (!formas.includes(forma)) return { erro: 'O desconto precisa ser de uma forma de pagamento selecionada.' };
      if (!Number.isFinite(valor) || valor <= 0 || (tipo === 'percentual' && valor > 100)) return { erro: 'Desconto inválido.' };
      descontos.push({ forma, tipo, valor: Math.round(valor * 100) / 100 });
    }
  }

  return {
    dados: {
      cnpj, razao_social: razao, regime_tributario: b.regime_tributario, atendente_nome: atendente, atendente_telefone: telefone, emite_nf: b.emite_nf, prazo_entrega: prazo,
      frete_pagador: b.frete_pagador, frete_valor: freteValor,
      formas_pagamento: formas, tem_desconto: b.tem_desconto, descontos, itens,
    },
  };
}

// O link só aceita resposta enquanto está aberto e dentro da validade.
export function situacaoDoLink(cotacao, agora = new Date()) {
  if (!cotacao) return 'invalido';
  if (cotacao.status !== 'aberta') return 'encerrada';
  if (new Date(cotacao.expira_em).getTime() <= agora.getTime()) return 'expirada';
  return 'aberta';
}
