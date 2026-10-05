'use strict';
const assert = require('assert');
const {
  categoriaDivergente,
  observacaoNaoRepete,
  valorMaiorQueMantido,
  motivoParaManterPendente,
} = require('./grm-despesas-guardas');
const {
  montarIndice,
  classificar,
  modeloParaCriar,
  MOTIVO_DUPLICADO,
} = require('./grm-sync-despesas-duplicadas');
const { decide } = require('./grm-sync-despesas-retroativas');

let seq = 5000;
function lanc(over) {
  seq += 1;
  return {
    ofmCode: seq, ofmType: 'D', ofmStatus: 'P', staCode: 7, staName: 'FULANO',
    oexName: 'Almoço', oexCode: 13, ofmValue: 30, ofmDate: '2026-10-02', ofmDescription: '', ...over,
  };
}
const decidir = (row, todos) => classificar(row, montarIndice(todos));

// observação de outra despesa: km, janta digitada como Salário de Intermitente, typo "Jajta"
assert.deepEqual(categoriaDivergente(lanc({ oexName: 'Salário de Intermitente', ofmValue: 104, ofmDescription: 'km rodado dia 22/09/2026' })), ['KM']);
assert.deepEqual(categoriaDivergente(lanc({ oexName: 'Salário de Intermitente', ofmValue: 30, ofmDescription: 'REFERENTE AO JANTAR LOCAL FAZENDA' })), ['JANTA']);
assert.deepEqual(categoriaDivergente(lanc({ ofmDescription: 'Jajta ref ao dia 1/10' })), ['JANTA']);
assert.equal(categoriaDivergente(lanc({ oexName: 'Serviços Terceirizados', ofmValue: 105, ofmDescription: 'Diária referente ao dia 24/09/2026' })), null);

// despesa de outra pessoa / extra: não é repetição
assert.equal(observacaoNaoRepete(lanc({ ofmDescription: 'Almoço do Bruno, funcionário em treinamento' })), 'observacao_cita_outra_pessoa');
assert.equal(observacaoNaoRepete(lanc({ ofmDescription: 'Almoço da equipe' })), 'observacao_cita_outra_pessoa');
assert.equal(observacaoNaoRepete(lanc({ ofmDescription: 'janta paga para o colaborador CPF 123' })), 'observacao_cita_outra_pessoa');
assert.equal(observacaoNaoRepete(lanc({ ofmDescription: 'COLABORADOR JOSE PEDRO - DESLOCAMENTO DE CAMPO VERDE' })), 'observacao_cita_outra_pessoa');
assert.equal(observacaoNaoRepete(lanc({ ofmDescription: 'almoço pago pelo cliente' })), 'observacao_cita_outra_pessoa');
assert.equal(observacaoNaoRepete(lanc({ oexName: 'Salário de Intermitente', ofmValue: 30.5, ofmDescription: 'SALARIO FAMILIA 08/2026' })), 'observacao_de_extra');
assert.equal(observacaoNaoRepete(lanc({ oexName: 'Salário de Intermitente', ofmValue: 67.54, ofmDescription: 'Sal Fam 08 2026' })), 'observacao_de_extra');
assert.equal(observacaoNaoRepete(lanc({ ofmDescription: 'almoço, diferença de valor' })), 'observacao_de_extra');
// observações comuns de duplicata continuam sem trava
for (const obs of ['', 'Almoço', 'almoço do dia 30/09', 'Diária armazém interfast cliente cofco', 'Embarque Copasul Novo Horizonte do Sul', 'FAZENDA NAO FORNECE RECIBO', 'Diária em viagem cooperbatata', 'lancei errado', 'Café da manhã']) {
  assert.equal(observacaoNaoRepete(lanc({ ofmDescription: obs })), null, obs);
}

// valor: só barra quando a recusada é MAIOR que a que fica
assert.equal(valorMaiorQueMantido(lanc({ ofmValue: 30 }), lanc({ ofmValue: 3 })), true);
assert.equal(valorMaiorQueMantido(lanc({ ofmValue: 30 }), lanc({ ofmValue: 30 })), false);
assert.equal(valorMaiorQueMantido(lanc({ ofmValue: 30 }), lanc({ ofmValue: 105 })), false);

// motivoParaManterPendente: data da observação só vale para o retroativo (comData)
{
  const aprovada = lanc({ ofmStatus: 'A', ofmDate: '2026-09-08' });
  const citaData = lanc({ ofmDate: '2026-09-08', ofmDescription: 'Referente ao dia 05/09/2026' });
  assert.equal(motivoParaManterPendente(citaData, aprovada, { comData: true }), 'observacao_cita_outra_data');
  assert.equal(motivoParaManterPendente(citaData, aprovada), null);
  assert.equal(motivoParaManterPendente(lanc({ ofmDate: '2026-09-08' }), aprovada, { comData: true }), null);
}

// ---- agente de duplicadas ----
// Orlean: Almoço R$ 3 aprovado x Almoço R$ 30 pendente -> não recusa, deixa p/ revisão humana
{
  const aprovada = lanc({ ofmStatus: 'A', ofmValue: 3 });
  const nova = lanc({ ofmValue: 30 });
  const r = decidir(nova, [aprovada, nova]);
  assert.equal(r.acao, 'REVISAR');
  assert.equal(r.motivo, 'valor_maior_que_o_mantido');
  assert.equal(r.referencia.ofmCode, aprovada.ofmCode);
}
// Jackson: Intermitente R$ 30 aprovado x R$ 75 pendente -> revisão
{
  const aprovada = lanc({ ofmStatus: 'A', oexName: 'Salário de Intermitente', ofmValue: 30 });
  const nova = lanc({ oexName: 'Salário de Intermitente', ofmValue: 75 });
  assert.equal(decidir(nova, [aprovada, nova]).acao, 'REVISAR');
}
// Lucas/Adriano: Intermitente R$ 30 pendente x R$ 105 aprovado (menor) -> continua recusando
{
  const aprovada = lanc({ ofmStatus: 'A', oexName: 'Salário de Intermitente', ofmValue: 105 });
  const nova = lanc({ oexName: 'Salário de Intermitente', ofmValue: 30 });
  // 30 é Almoço no grupo de duplicidade? Não: Salário de Intermitente é sempre DIARIA
  const r = decidir(nova, [aprovada, nova]);
  assert.equal(r.acao, 'RECUSAR');
  assert.equal(r.motivo, MOTIVO_DUPLICADO);
}
// Victor: "Almoço do Bruno, funcionário em treinamento" -> não é duplicata do almoço dele
{
  const aprovada = lanc({ ofmStatus: 'A' });
  const doBruno = lanc({ ofmDescription: 'Almoço do Bruno, funcionário em treinamento' });
  const r = decidir(doBruno, [aprovada, doBruno]);
  assert.equal(r.acao, 'REVISAR');
  assert.equal(r.motivo, 'observacao_cita_outra_pessoa');
  // e ela não conta como "melhor" lançamento para os outros
  const outra = lanc({});
  assert.equal(decidir(outra, [doBruno, outra]).acao, 'NADA');
}
// Salário Família digitado como Salário de Intermitente é extra, não repete a Diária
{
  const diaria = lanc({ ofmStatus: 'A', oexName: 'Salário de Intermitente', ofmValue: 105 });
  const familia = lanc({ oexName: 'Salário de Intermitente', ofmValue: 30.5, ofmDescription: 'SALARIO FAMILIA 08/2026' });
  assert.equal(decidir(familia, [diaria, familia]).acao, 'REVISAR');
}
// duplicata simples de mesmo valor segue sendo recusada
{
  const aprovada = lanc({ ofmStatus: 'A' });
  const nova = lanc({ ofmDescription: 'Almoço' });
  assert.equal(decidir(nova, [aprovada, nova]).acao, 'RECUSAR');
}

// data corrigida: Serviços Terceirizados <= 45 nasce como Almoço (código do Almoço lido do GRM)
{
  const almoco = lanc({ oexName: 'Almoço', oexCode: 13, odtCode: 1 });
  const todos = new Map([[almoco.ofmCode, almoco]]);
  const terceirizadoAlmoco = lanc({ oexName: 'Serviços Terceirizados', oexCode: 65, ofmValue: 30 });
  assert.equal(modeloParaCriar(terceirizadoAlmoco, todos).oexCode, 13);
  const diaria = lanc({ oexName: 'Serviços Terceirizados', oexCode: 65, ofmValue: 105 });
  assert.equal(modeloParaCriar(diaria, todos), diaria);
  // sem nenhum Almoço lido, copia o original em vez de inventar um código
  assert.equal(modeloParaCriar(terceirizadoAlmoco, new Map()), terceirizadoAlmoco);
}

// ---- agente retroativo: decide() informa qual lançamento fica ----
{
  const a = { ofmStatus: 'A', ofmCode: 9, ofmValue: 30 };
  const p = { ofmStatus: 'P', ofmCode: 10, ofmValue: 30 };
  assert.equal(decide([a, p]).mantido, a);
  assert.deepEqual(decide([a, p]).orphans, [p]);
  const p1 = { ofmStatus: 'P', ofmCode: 3, ofmValue: 30 };
  const p2 = { ofmStatus: 'P', ofmCode: 5, ofmValue: 30 };
  assert.equal(decide([p2, p1]).mantido, p1);
  assert.equal(decide([]).mantido, undefined);
}

console.log('test-despesas-guardas: ok');
