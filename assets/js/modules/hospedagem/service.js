// Regras da fila v3 da Hospedagem (ADM) sem DOM nem rede: filtros, quem pode ser reservado junto, composição de quartos
// da reserva manual, rateio da despesa extra e caminho do comprovante. Teste: tests/hospedagem-fila-service.test.mjs.

export const V3_LABELS = {
  AGUARDANDO: 'Aguardando', EM_COTACAO: 'Em cotação', AGUARDANDO_HOTEL: 'Aguardando hotel', RESERVADO: 'Reservado', ALTERACAO_PENDENTE: 'Alteração pendente',
  CHECKOUT_PENDENTE: 'Checkout pendente', CHECKOUT: 'Checkout', RECUSADO: 'Recusado',
};

// Só nestes status o colaborador ainda pode ser cotado, reservado ou recusado pelo ADM.
export const STATUS_ABERTOS = ['AGUARDANDO', 'EM_COTACAO'];

const GENEROS = [['MASCULINO', 'MASC'], ['FEMININO', 'FEM']];
const TIPO_POR_CAPACIDADE = { 1: 'INDIVIDUAL', 2: 'DUPLO', 3: 'TRIPLO', 4: 'QUADRUPLO' };

// Cor, ícone e tom do selo de cada status na tela (cards que filtram e coluna Status), no padrão das listas do Frotas.
export const V3_VISUAL = {
  AGUARDANDO: { tone: 'amber', icone: 'relogio', selo: 'warn' },
  EM_COTACAO: { tone: 'blue', icone: 'doc', selo: 'info' },
  AGUARDANDO_HOTEL: { tone: 'purple', icone: 'sinal', selo: 'info' },
  RESERVADO: { tone: 'green', icone: 'ok', selo: 'ok' },
  ALTERACAO_PENDENTE: { tone: 'amber', icone: 'alerta', selo: 'warn' },
  CHECKOUT_PENDENTE: { tone: 'amber', icone: 'calendario', selo: 'warn' },
  CHECKOUT: { tone: 'blue', icone: 'total', selo: 'info' },
  RECUSADO: { tone: 'red', icone: 'erro', selo: 'err' },
};

// Cancelados nunca aparecem na fila. filtro: { status ('todos' ou um status), busca }. A busca olha nome, cidade/UF, supervisão, hotel,
// códigos, solicitante e a data de entrada já formatada (dd/mm/aaaa), ignorando acento e caixa.
export function filtrarFila(itens, { status = 'todos', busca = '' } = {}, normalizeText, formatarData = (d) => d) {
  const q = normalizeText(busca);
  return itens.filter((i) => i.status_item !== 'CANCELADO'
    && (status === 'todos' || !status || i.status_item === status)
    && (!q || normalizeText([i.nome_colaborador, i.cidade, i.uf, i.supervisao, i.hotel, i.codigo_operacional, i.codigo_solicitacao, i.solicitante_nome, formatarData(i.data_checkin_prevista), i.sexo].join(' ')).includes(q)));
}

// Quantos colaboradores há em cada status (sem cancelados), para os cards.
export function contarPorStatus(itens) {
  const contagem = {};
  for (const i of itens) {
    if (i.status_item === 'CANCELADO') continue;
    contagem[i.status_item] = (contagem[i.status_item] || 0) + 1;
  }
  return contagem;
}

// Dois colaboradores podem ficar no mesmo pedido de reserva: mesma cidade/UF, períodos que se sobrepõem e ainda em aberto.
export function elegiveisJuntos(base, candidato) {
  return base.cidade === candidato.cidade && base.uf === candidato.uf
    && candidato.data_checkin_prevista < base.data_checkout_prevista && candidato.data_checkout_prevista > base.data_checkin_prevista
    && STATUS_ABERTOS.includes(candidato.status_item);
}

// Texto de apoio da reserva manual ("2 quarto(s) quádruplo(s) + 1 quarto para 3 masculino").
export function sugerirComposicao(itens) {
  const grupos = ['MASCULINO', 'FEMININO'].map((sexo) => ({ sexo, total: itens.filter((i) => i.sexo === sexo).length })).filter((g) => g.total);
  return grupos.map((g) => (g.total === 1
    ? `1 quarto individual ${g.sexo.toLowerCase()}`
    : `${Math.floor(g.total / 4)} quarto(s) quádruplo(s)${g.total % 4 ? ` + 1 quarto para ${g.total % 4}` : ''} ${g.sexo.toLowerCase()}`)).join('\n');
}

// Reserva manual: um quarto por linha, com a mesma diária e o texto digitado pelo ADM. De 4 em 4; quando sobra 1 a mais, o último vira triplo.
export function quartosDaReservaManual(itens, diaria, descricao) {
  const quartos = [];
  for (const [sexo, genero] of GENEROS) {
    let total = itens.filter((i) => i.sexo === sexo).length;
    while (total > 0) {
      let capacidade;
      if (total === 1) capacidade = 1;
      else if (total % 4 === 1) capacidade = 3;
      else capacidade = Math.min(4, total);
      quartos.push({ tipo_quarto: TIPO_POR_CAPACIDADE[capacidade], quantidade: 1, genero, capacidade, valor_diaria: diaria, descricao });
      total -= capacidade;
    }
  }
  return quartos;
}

// A parte indevida que vai para o caixa dos colaboradores não pode passar do valor da despesa.
export function rateioExcedeTotal(rateios, total) {
  return rateios.reduce((s, r) => s + r.valor, 0) > total;
}

// Caminho do comprovante no bucket hospedagem-documentos: pagamento + uuid + nome sem caracteres especiais.
export function caminhoComprovante(pagamentoId, nomeArquivo, uuid) {
  return `v3/comprovantes/${pagamentoId}/${uuid}-${String(nomeArquivo).replace(/[^a-zA-Z0-9._-]/g, '_')}`;
}
