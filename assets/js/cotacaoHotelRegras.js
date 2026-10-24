// Regras da resposta de cotação do hotel (link público da Hospedagem).
// Funções puras (sem Deno nem rede) para poder testar no Node: tests/hospedagem-cotacao-link.test.mjs.
// A página pública do hotel e o painel do ADM usam uma CÓPIA idêntica em assets/js/cotacaoHotelRegras.js (a Edge
// Function e o site são publicados separados). Alterou aqui? Copie para lá: o teste falha se os dois divergirem.

export const FORMAS_PAGAMENTO = ['PIX', 'Boleto', 'Cartão de crédito', 'Cartão de débito', 'Transferência', 'Dinheiro', 'Outra'];
// Tipos de quarto cotados: o preço é a diária POR QUARTO. A capacidade é a de pessoas por quarto.
export const TIPOS_QUARTO = { INDIVIDUAL: 'Individual', DUPLO: 'Duplo', TRIPLO: 'Triplo', QUADRUPLO: 'Quádruplo' };
export const CAPACIDADE_QUARTO = { INDIVIDUAL: 1, DUPLO: 2, TRIPLO: 3, QUADRUPLO: 4 };
export const TOKEN_RE = /^[a-f0-9]{64}$/;
export const MAX_ENVIOS_POR_LINK = 10;
export const VALOR_MAXIMO = 100_000;

export function soDigitos(v) {
  return String(v ?? '').replace(/\D/g, '');
}

// Aceita "180", "180,50", "180.50" e "1.234,56". Devolve NaN se não for número.
export function lerValor(v) {
  if (typeof v === 'number') return v;
  let s = String(v ?? '').trim().replace(/^R\$\s*/, '');
  if (!s) return NaN;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  return /^\d+(\.\d+)?$/.test(s) ? Number(s) : NaN;
}

const limpa = (v, max) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const arredonda = (v) => Math.round(v * 100) / 100;

// Tipos de quarto pedidos na cotação (sem repetir, na ordem INDIVIDUAL → QUADRUPLO).
export function tiposNecessarios(quartos) {
  const usados = new Set((Array.isArray(quartos) ? quartos : []).map((q) => q?.tipo_quarto));
  return Object.keys(TIPOS_QUARTO).filter((t) => usados.has(t));
}

// Valida o corpo do POST contra a composição de quartos pedida. Devolve { erro } ou { dados } já normalizado.
export function validarResposta(body, quartosNecessarios) {
  const b = body && typeof body === 'object' ? body : {};
  if (typeof b.disponivel !== 'boolean') return { erro: 'Informe se há disponibilidade.' };
  const observacoes = limpa(b.observacoes, 500);
  const atendente = limpa(b.atendente_nome, 120);
  const telefone = soDigitos(b.atendente_telefone).replace(/^55(?=\d{10,11}$)/, '');

  if (!b.disponivel) {
    // Sem vaga: só o motivo (opcional) e, se o hotel quiser, o contato.
    return {
      dados: {
        disponivel: false, precos: {}, cafe_incluso: null, almoco_incluso: null, janta_inclusa: null, estacionamento_incluso: null,
        aceita_pagamento_checkout: null, emite_nf: null, formas_pagamento: [],
        atendente_nome: atendente || null, atendente_telefone: telefone.length >= 10 && telefone.length <= 11 ? telefone : null, observacoes,
      },
    };
  }

  if (atendente.length < 2) return { erro: 'Informe o nome do atendente.' };
  if (telefone.length < 10 || telefone.length > 11) return { erro: 'Informe o telefone/WhatsApp com DDD.' };

  const tipos = tiposNecessarios(quartosNecessarios);
  const enviados = b.precos && typeof b.precos === 'object' ? b.precos : {};
  if (Object.keys(enviados).some((t) => !tipos.includes(t))) return { erro: 'Tipo de quarto inválido na cotação.' };
  const precos = {};
  for (const tipo of tipos) {
    const bruto = enviados[tipo];
    if (bruto === null || bruto === undefined || bruto === '') {
      // Vazio só vale se o hotel marcou que não tem esse tipo de quarto.
      if (!Array.isArray(b.sem_tipo) || !b.sem_tipo.includes(tipo)) return { erro: `Informe a diária do quarto ${TIPOS_QUARTO[tipo].toLowerCase()} ou marque "Não possuo".` };
      precos[tipo] = null;
      continue;
    }
    const valor = lerValor(bruto);
    if (!Number.isFinite(valor) || valor <= 0 || valor > VALOR_MAXIMO) return { erro: `Diária inválida para o quarto ${TIPOS_QUARTO[tipo].toLowerCase()}.` };
    precos[tipo] = arredonda(valor);
  }
  if (!Object.values(precos).some((v) => v !== null)) return { erro: 'Você marcou "Não possuo" em todos os quartos; use "Sem disponibilidade".' };

  for (const campo of ['cafe_incluso', 'almoco_incluso', 'janta_inclusa', 'estacionamento_incluso']) {
    if (typeof b[campo] !== 'boolean') return { erro: 'Responda o que está incluso na diária (café, almoço, janta e estacionamento).' };
  }
  if (typeof b.aceita_pagamento_checkout !== 'boolean') return { erro: 'Informe se aceita pagamento no checkout.' };
  if (typeof b.emite_nf !== 'boolean') return { erro: 'Informe se emite nota fiscal.' };

  const formas = [...new Set(Array.isArray(b.formas_pagamento) ? b.formas_pagamento.map(String) : [])];
  if (!formas.length) return { erro: 'Selecione ao menos uma forma de pagamento.' };
  if (formas.some((f) => !FORMAS_PAGAMENTO.includes(f))) return { erro: 'Forma de pagamento inválida.' };

  return {
    dados: {
      disponivel: true, precos, cafe_incluso: b.cafe_incluso, almoco_incluso: b.almoco_incluso, janta_inclusa: b.janta_inclusa,
      estacionamento_incluso: b.estacionamento_incluso, aceita_pagamento_checkout: b.aceita_pagamento_checkout, emite_nf: b.emite_nf,
      formas_pagamento: formas, atendente_nome: atendente, atendente_telefone: telefone, observacoes,
    },
  };
}

// Estimativa da hospedagem com a diária por quarto respondida pelo hotel.
// porNoite: soma de (quartos × diária). total: porNoite × diárias. Se faltar preço de algum tipo pedido,
// o total fica nulo e `faltam` lista os tipos sem preço (o hotel não tem ou não respondeu).
export function estimarTotal(quartosNecessarios, precos, diarias) {
  const quartos = Array.isArray(quartosNecessarios) ? quartosNecessarios : [];
  const tabela = precos && typeof precos === 'object' ? precos : {};
  let porNoite = 0;
  const faltam = [];
  for (const q of quartos) {
    const preco = tabela[q.tipo_quarto];
    if (typeof preco !== 'number' || !Number.isFinite(preco)) {
      if (!faltam.includes(q.tipo_quarto)) faltam.push(q.tipo_quarto);
      continue;
    }
    porNoite += Number(q.quantidade || 1) * preco;
  }
  const noites = Number(diarias) > 0 ? Number(diarias) : 0;
  const completo = faltam.length === 0 && quartos.length > 0;
  return { completo, faltam, porNoite: arredonda(porNoite), total: completo && noites ? arredonda(porNoite * noites) : null };
}

// O link só aceita resposta enquanto está aberto e dentro da validade.
export function situacaoDoLink(cotacao, agora = new Date()) {
  if (!cotacao || !cotacao.token) return 'invalido';
  if (cotacao.link_status !== 'aberta') return 'encerrada';
  if (!cotacao.expira_em || new Date(cotacao.expira_em).getTime() <= agora.getTime()) return 'expirada';
  return 'aberta';
}
