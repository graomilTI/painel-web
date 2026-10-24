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

// filtros: { status, date, city, person, supervision }. Cancelados nunca aparecem na fila.
export function filtrarFila(itens, f, normalizeText) {
  return itens.filter((i) => i.status_item !== 'CANCELADO'
    && (!f.status || i.status_item === f.status) && (!f.date || i.data_checkin_prevista === f.date)
    && (!f.city || normalizeText(`${i.cidade} ${i.uf}`).includes(normalizeText(f.city)))
    && (!f.person || normalizeText(i.nome_colaborador).includes(normalizeText(f.person)))
    && (!f.supervision || normalizeText(i.supervisao).includes(normalizeText(f.supervision))));
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
