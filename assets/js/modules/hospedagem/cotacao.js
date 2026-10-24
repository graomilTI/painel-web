// Cotação de hospedagem por link (ADM): composição de quartos, link/mensagem para o hotel e comparação das respostas.
// Funções puras, sem DOM nem rede: a tela fica em cotacao-ui.js e o teste em tests/hospedagem-cotacao-link.test.mjs.
import { CAPACIDADE_QUARTO, TIPOS_QUARTO, estimarTotal } from '../../cotacaoHotelRegras.js?v=20261024-hosp-mod1';

export const VALIDADE_LINK_DIAS = 7;
const GENEROS = [['MASCULINO', 'MASC'], ['FEMININO', 'FEM']];
const ROTULO_GENERO = { MASC: 'masc.', FEM: 'fem.' };
const NOME_TIPO = { 1: 'INDIVIDUAL', 2: 'DUPLO', 3: 'TRIPLO', 4: 'QUADRUPLO' };

const brDia = (d) => String(d || '').split('-').reverse().join('/');
const soDigitos = (v) => String(v ?? '').replace(/\D/g, '');

// Quartos de um grupo do mesmo sexo: de 4 em 4; quando sobra 1 pessoa a mais, o último quarto vira triplo
// (evita um quarto individual sobrando). 1 pessoa = individual. Ex.: 5 → 3 + 2, 6 → 4 + 2, 9 → 3 + 4 + 2.
export function capacidadesDoGrupo(total) {
  const caps = [];
  let resta = Number(total) || 0;
  while (resta > 0) {
    const cap = resta === 1 ? 1 : resta % 4 === 1 ? 3 : Math.min(4, resta);
    caps.push(cap);
    resta -= cap;
  }
  return caps;
}

// itens: colaboradores com { sexo: 'MASCULINO' | 'FEMININO' }. Devolve a composição agrupada por tipo e gênero.
export function montarQuartos(itens) {
  const quartos = [];
  for (const [sexo, genero] of GENEROS) {
    const total = (itens || []).filter((i) => i.sexo === sexo).length;
    const porCapacidade = new Map();
    for (const cap of capacidadesDoGrupo(total)) porCapacidade.set(cap, (porCapacidade.get(cap) || 0) + 1);
    for (const [cap, quantidade] of [...porCapacidade].sort((a, b) => a[0] - b[0])) {
      quartos.push({ tipo_quarto: NOME_TIPO[cap], genero, capacidade: cap, quantidade });
    }
  }
  return quartos;
}

export function descreverQuartos(quartos) {
  return (quartos || []).map((q) => `${q.quantidade} × ${TIPOS_QUARTO[q.tipo_quarto] || q.tipo_quarto} ${ROTULO_GENERO[q.genero] || ''}`.trim()).join(' + ');
}

export function urlDoLink(token, origem = globalThis.location?.origin || 'https://grao1000.com.br') {
  const host = /grao1000\.com\.br$/i.test(new URL(origem).hostname) ? 'https://grao1000.com.br' : origem;
  // Sem ".html": o roteador do painel manda /painel/*.html para a home do site.
  return `${host}/painel/cotacao-hotel?t=${token}`;
}

export function linkAberto(cotacao, agora = new Date()) {
  return !!cotacao?.token && cotacao.link_status === 'aberta' && new Date(cotacao.expira_em).getTime() > agora.getTime();
}

// Texto para o ADM colar no WhatsApp do hotel.
export function mensagemDoLink(cot, cidade, uf, url) {
  const fim = new Date(cot.expira_em).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  const periodo = cot.checkin_previsto ? `${brDia(cot.checkin_previsto)} a ${brDia(cot.checkout_previsto)} (${Number(cot.diarias_previstas)} diária(s))` : '';
  return [
    `Olá! Aqui é do Grão 1000. Gostaríamos de cotar hospedagem${cidade ? ` em ${cidade}${uf ? `/${uf}` : ''}` : ''}${periodo ? `, ${periodo}` : ''}.`,
    cot.quartos_necessarios?.length ? `Quartos: ${descreverQuartos(cot.quartos_necessarios)}` : '',
    `Responda pelo link (leva 2 minutos): ${url}`,
    `Válido até ${fim}.`,
  ].filter(Boolean).join('\n');
}

// Número do hotel para wa.me (DDI 55 quando vier só com DDD).
export function linkWhatsapp(telefone, texto = '') {
  const d = soDigitos(telefone);
  if (d.length < 10) return '';
  const numero = d.length <= 11 ? `55${d}` : d;
  return `https://wa.me/${numero}${texto ? `?text=${encodeURIComponent(texto)}` : ''}`;
}

// Situação de uma cotação para a lista do ADM.
export function situacaoDaCotacao(cot, agora = new Date()) {
  if (cot.status === 'INDISPONIVEL') return { chave: 'indisponivel', rotulo: 'Sem disponibilidade' };
  if (cot.status === 'RESPONDIDA') return { chave: 'respondida', rotulo: 'Respondida' };
  if (cot.link_status === 'encerrada') return { chave: 'encerrada', rotulo: 'Encerrada' };
  if (!linkAberto(cot, agora)) return { chave: 'expirada', rotulo: 'Expirada' };
  return { chave: 'aguardando', rotulo: 'Aguardando resposta' };
}

const ORDEM = { completa: 0, incompleta: 1, aguardando: 2, encerrada: 3, expirada: 3, indisponivel: 4 };

// Cotações de um pedido, da melhor para a pior: respostas completas pelo menor total, depois as que não
// cobrem todos os tipos de quarto, depois as ainda sem resposta e, por último, as sem vaga.
export function compararCotacoes(cotacoes, agora = new Date()) {
  const itens = cotacoes.map((cot) => {
    const situacao = situacaoDaCotacao(cot, agora);
    const estimativa = situacao.chave === 'respondida' ? estimarTotal(cot.quartos_necessarios, cot.precos_quartos, cot.diarias_previstas) : null;
    const grupo = situacao.chave === 'respondida' ? (estimativa.completo ? 'completa' : 'incompleta') : situacao.chave;
    return { cot, situacao, estimativa, grupo };
  });
  return itens.sort((a, b) => (ORDEM[a.grupo] - ORDEM[b.grupo])
    || ((a.estimativa?.total ?? Infinity) - (b.estimativa?.total ?? Infinity))
    || String(b.cot.created_at).localeCompare(String(a.cot.created_at)));
}

// Pedido de reserva a partir dos quartos e dos preços finais (editáveis na tela). precos: { TIPO: número }.
// Devolve { erro } se faltar preço de algum tipo, senão { valorDiaria, quartos } no formato da RPC.
export function montarPedidoReserva(quartos, precos) {
  const lista = [];
  for (const q of quartos) {
    const preco = Number(precos?.[q.tipo_quarto]);
    if (!Number.isFinite(preco) || preco <= 0) return { erro: `Informe a diária do quarto ${TIPOS_QUARTO[q.tipo_quarto].toLowerCase()}.` };
    lista.push({
      tipo_quarto: q.tipo_quarto, quantidade: q.quantidade, genero: q.genero, capacidade: q.capacidade ?? CAPACIDADE_QUARTO[q.tipo_quarto],
      valor_diaria: Math.round(preco * 100) / 100, descricao: `${q.quantidade} × ${TIPOS_QUARTO[q.tipo_quarto]} ${ROTULO_GENERO[q.genero] || ''}`.trim(),
    });
  }
  if (!lista.length) return { erro: 'Não há quartos para reservar.' };
  return { valorDiaria: Math.min(...lista.map((q) => q.valor_diaria)), quartos: lista };
}
