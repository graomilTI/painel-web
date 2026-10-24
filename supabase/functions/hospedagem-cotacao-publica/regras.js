// Regras da resposta de cotação do hotel (link público da Hospedagem).
// Funções puras (sem Deno nem rede) para poder testar no Node: tests/hospedagem-cotacao-link.test.mjs.
// A página pública do hotel e o painel do ADM usam uma CÓPIA idêntica em assets/js/cotacaoHotelRegras.js (a Edge
// Function e o site são publicados separados). Alterou aqui? Copie para lá: o teste falha se os dois divergirem.

export const FORMAS_PAGAMENTO = ['PIX', 'Boleto', 'Cartão de crédito', 'Cartão de débito', 'Transferência', 'Dinheiro', 'Outra'];
// Tipos de quarto cotados: o preço é a diária POR QUARTO. A capacidade é a de pessoas por quarto.
export const TIPOS_QUARTO = { INDIVIDUAL: 'Individual', DUPLO: 'Duplo', TRIPLO: 'Triplo', QUADRUPLO: 'Quádruplo' };
export const CAPACIDADE_QUARTO = { INDIVIDUAL: 1, DUPLO: 2, TRIPLO: 3, QUADRUPLO: 4 };
export const REGIMES = { simples_nacional: 'Simples Nacional', lucro_presumido: 'Lucro Presumido', lucro_real: 'Lucro Real' };
// Extras que o hotel marca como inclusos na diária. Os quatro primeiros (café, almoço, janta, estacionamento) têm coluna própria
// (compatível com o comparativo e o relatório); os demais ficam em extras_outros (lista de chaves).
export const EXTRAS_OUTROS = {
  wifi: 'Wi-Fi', ar_condicionado: 'Ar-condicionado', tv: 'TV', frigobar: 'Frigobar', roupa_cama_banho: 'Roupa de cama e banho',
  lavanderia: 'Lavanderia', piscina: 'Piscina', academia: 'Academia', recepcao_24h: 'Recepção 24 horas', lanche_tarde: 'Café da tarde / lanche',
};
export const UFS = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'];
export const TOKEN_RE = /^[a-f0-9]{64}$/;
export const MAX_ENVIOS_POR_LINK = 10;
export const VALOR_MAXIMO = 100_000;

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
// Os quatro tipos de quarto são cotados; os que o pedido exige precisam de diária (ou "Não possuo"), os demais são opcionais.
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
        extras_outros: [], extras_outros_texto: null, empresa: null, endereco: null,
        aceita_pagamento_checkout: null, emite_nf: null, formas_pagamento: [],
        atendente_nome: atendente || null, atendente_telefone: telefone.length >= 10 && telefone.length <= 11 ? telefone : null, observacoes,
      },
    };
  }

  // Dados da empresa (as mesmas perguntas da cotação de Compras).
  const cnpj = soDigitos(b.cnpj);
  if (!cnpjValido(cnpj)) return { erro: 'Informe um CNPJ válido.' };
  const razao = limpa(b.razao_social, 200);
  if (razao.length < 3) return { erro: 'Informe a razão social.' };
  if (!Object.hasOwn(REGIMES, b.regime_tributario)) return { erro: 'Selecione o regime tributário.' };
  if (typeof b.emite_nf !== 'boolean') return { erro: 'Informe se emite nota fiscal.' };
  if (atendente.length < 2) return { erro: 'Informe o nome do atendente.' };
  if (telefone.length < 10 || telefone.length > 11) return { erro: 'Informe o telefone/WhatsApp com DDD.' };

  // Endereço do hotel.
  const e = b.endereco && typeof b.endereco === 'object' ? b.endereco : {};
  const cep = soDigitos(e.cep);
  const uf = String(e.uf ?? '').trim().toUpperCase();
  const endereco = {
    cep, logradouro: limpa(e.logradouro, 160), numero: limpa(e.numero, 20), complemento: limpa(e.complemento, 80),
    bairro: limpa(e.bairro, 80), cidade: limpa(e.cidade, 80), uf,
  };
  if (cep.length !== 8) return { erro: 'Informe o CEP do hotel (8 números).' };
  if (endereco.logradouro.length < 3) return { erro: 'Informe a rua/avenida do hotel.' };
  if (!endereco.numero) return { erro: 'Informe o número do endereço (ou S/N).' };
  if (endereco.bairro.length < 2) return { erro: 'Informe o bairro do hotel.' };
  if (endereco.cidade.length < 2) return { erro: 'Informe a cidade do hotel.' };
  if (!UFS.includes(uf)) return { erro: 'Informe a UF do hotel.' };

  const necessarios = tiposNecessarios(quartosNecessarios);
  const enviados = b.precos && typeof b.precos === 'object' ? b.precos : {};
  if (Object.keys(enviados).some((t) => !Object.hasOwn(TIPOS_QUARTO, t))) return { erro: 'Tipo de quarto inválido na cotação.' };
  const precos = {};
  for (const tipo of Object.keys(TIPOS_QUARTO)) {
    const bruto = enviados[tipo];
    const pedido = necessarios.includes(tipo);
    if (bruto === null || bruto === undefined || bruto === '') {
      if (!pedido) continue; // tipo que o pedido não usa: pode ficar em branco
      // Vazio só vale se o hotel marcou que não tem esse tipo de quarto.
      if (!Array.isArray(b.sem_tipo) || !b.sem_tipo.includes(tipo)) return { erro: `Informe a diária do quarto ${TIPOS_QUARTO[tipo].toLowerCase()} ou marque "Não possuo".` };
      precos[tipo] = null;
      continue;
    }
    const valor = lerValor(bruto);
    if (!Number.isFinite(valor) || valor <= 0 || valor > VALOR_MAXIMO) return { erro: `Diária inválida para o quarto ${TIPOS_QUARTO[tipo].toLowerCase()}.` };
    precos[tipo] = arredonda(valor);
  }
  if (!necessarios.some((t) => typeof precos[t] === 'number')) return { erro: 'Você marcou "Não possuo" em todos os quartos pedidos; use "Sem disponibilidade".' };

  for (const campo of ['cafe_incluso', 'almoco_incluso', 'janta_inclusa', 'estacionamento_incluso']) {
    if (typeof b[campo] !== 'boolean') return { erro: 'Marque o que está incluso na diária (café, almoço, janta, estacionamento e outros).' };
  }
  const outros = [...new Set(Array.isArray(b.extras_outros) ? b.extras_outros.map(String) : [])];
  if (outros.some((x) => !Object.hasOwn(EXTRAS_OUTROS, x))) return { erro: 'Item incluso inválido.' };
  if (typeof b.aceita_pagamento_checkout !== 'boolean') return { erro: 'Informe se aceita pagamento no checkout.' };

  const formas = [...new Set(Array.isArray(b.formas_pagamento) ? b.formas_pagamento.map(String) : [])];
  if (!formas.length) return { erro: 'Selecione ao menos uma forma de pagamento.' };
  if (formas.some((f) => !FORMAS_PAGAMENTO.includes(f))) return { erro: 'Forma de pagamento inválida.' };

  return {
    dados: {
      disponivel: true, precos, cafe_incluso: b.cafe_incluso, almoco_incluso: b.almoco_incluso, janta_inclusa: b.janta_inclusa,
      estacionamento_incluso: b.estacionamento_incluso, extras_outros: outros, extras_outros_texto: limpa(b.extras_outros_texto, 120) || null,
      aceita_pagamento_checkout: b.aceita_pagamento_checkout, emite_nf: b.emite_nf,
      empresa: { cnpj, razao_social: razao, regime_tributario: b.regime_tributario }, endereco,
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
