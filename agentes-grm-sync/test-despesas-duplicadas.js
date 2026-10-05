'use strict';
const assert = require('assert');
const {
  dateFromObs,
  grupoDespesa,
  categoriaDivergente,
  montarIndice,
  classificar,
  MOTIVO_DUPLICADO,
  MOTIVO_DUPLICATA,
} = require('./grm-sync-despesas-duplicadas');

let seq = 1000;
function lanc(over) {
  seq += 1;
  return {
    ofmCode: seq, ofmType: 'D', ofmStatus: 'P', staCode: 7, staName: 'FULANO',
    oexName: 'Almoço', oexCode: 13, ofmValue: 30, ofmDate: '2026-10-01', ofmDescription: '', ...over,
  };
}
const decidir = (row, todos) => classificar(row, montarIndice(todos));

// datas na observação
assert.equal(dateFromObs('referente ao dia 28/09', '2026-10-01'), '2026-09-28');
assert.equal(dateFromObs('ontem', '2026-10-01'), '2026-09-30');
assert.equal(dateFromObs('5.5 litros', '2026-10-01'), null);
assert.equal(dateFromObs('', '2026-10-01'), null);

// categorias tratadas
assert.equal(grupoDespesa({ oexName: 'Salário de Intermitente', ofmValue: 120 }), 'DIARIA');
assert.equal(grupoDespesa({ oexName: 'Serviços Terceirizados', ofmValue: 120 }), 'DIARIA');
assert.equal(grupoDespesa({ oexName: 'Serviços Terceirizados', ofmValue: 30 }), 'ALMOCO');
assert.equal(grupoDespesa({ oexName: 'Combustível', ofmValue: 30 }), null);

// 1) duplicada na data, sem observação -> "lançamento duplicado"
{
  const aprovada = lanc({ ofmStatus: 'A' });
  const nova = lanc({});
  const r = decidir(nova, [aprovada, nova]);
  assert.equal(r.acao, 'RECUSAR');
  assert.equal(r.motivo, MOTIVO_DUPLICADO);
  assert.equal(r.referencia.ofmCode, aprovada.ofmCode);
}

// pendência única na data: nada a fazer
{
  const sozinha = lanc({});
  assert.equal(decidir(sozinha, [sozinha]).acao, 'NADA');
}

// duas pendências na mesma data: fica a de menor ofmCode, recusa a outra
{
  const a = lanc({}); const b = lanc({});
  assert.equal(decidir(a, [a, b]).acao, 'NADA');
  const r = decidir(b, [a, b]);
  assert.equal(r.acao, 'RECUSAR');
  assert.equal(r.motivo, MOTIVO_DUPLICADO);
}

// outro colaborador / outra despesa / outra data não são duplicata
{
  const base = lanc({});
  const outros = [
    lanc({ staCode: 8 }), lanc({ oexName: 'Janta', oexCode: 15 }), lanc({ ofmDate: '2026-09-30' }),
  ];
  assert.equal(decidir(base, [base, ...outros]).acao, 'NADA');
}

// Diária: Salário de Intermitente e Serviços Terceirizados são o mesmo grupo
{
  const sal = lanc({ ofmStatus: 'A', oexName: 'Salário de Intermitente', oexCode: 63, ofmValue: 120 });
  const serv = lanc({ oexName: 'Serviços Terceirizados', oexCode: 65, ofmValue: 120 });
  assert.equal(decidir(serv, [sal, serv]).acao, 'RECUSAR');
}

// 2) observação com data diferente e já existe despesa nessa data -> "Duplicata"
{
  const existente = lanc({ ofmStatus: 'A', ofmDate: '2026-09-28' });
  const nova = lanc({ ofmDate: '2026-10-01', ofmDescription: 'ref dia 28/09' });
  const r = decidir(nova, [existente, nova]);
  assert.equal(r.acao, 'RECUSAR');
  assert.equal(r.motivo, MOTIVO_DUPLICATA);
  assert.equal(r.info.dataEf, '2026-09-28');
}

// observação com data diferente e nada na data -> avalia as regras (corrigir data)
{
  const nova = lanc({ ofmDescription: 'ref dia 28/09' });
  const outraNoDiaDoLancamento = lanc({ ofmStatus: 'A' }); // 01/10: não conta, a efetiva é 28/09
  const r = decidir(nova, [nova, outraNoDiaDoLancamento]);
  assert.equal(r.acao, 'AVALIAR_DATA');
  assert.equal(r.info.dataEf, '2026-09-28');
}

// pendência lançada direto na data tem preferência sobre a que aponta a data na observação
{
  const direta = lanc({ ofmDate: '2026-09-28' });
  const aponta = lanc({ ofmDate: '2026-10-01', ofmDescription: '28/09' });
  assert.equal(decidir(direta, [aponta, direta]).acao, 'NADA');
  const r = decidir(aponta, [aponta, direta]);
  assert.equal(r.acao, 'RECUSAR');
  assert.equal(r.motivo, MOTIVO_DUPLICATA);
}

// observação sem data reconhecível conta como "sem observação"
{
  const aprovada = lanc({ ofmStatus: 'A' });
  const nova = lanc({ ofmDescription: 'esqueci de lançar' });
  assert.equal(decidir(nova, [aprovada, nova]).motivo, MOTIVO_DUPLICADO);
}

// lançamento na despesa errada (observação cita outra): não é duplicata, fica fora
{
  assert.deepEqual(categoriaDivergente(lanc({ oexName: 'Pernoite', ofmDescription: 'Referente ao dia 20/09 janta' })), ['JANTA']);
  assert.deepEqual(categoriaDivergente(lanc({ ofmDescription: 'Na verdade é janta data 01/10/2026' })), ['JANTA']);
  assert.equal(categoriaDivergente(lanc({ ofmDescription: 'Almoço referente ao dia 24/09/2026' })), null);
  assert.equal(categoriaDivergente(lanc({ oexName: 'Salário de Intermitente', ofmValue: 120, ofmDescription: 'Diária em viagem' })), null);
  assert.equal(categoriaDivergente(lanc({ ofmDescription: 'lancei errado' })), null);
  const aprovada = lanc({ ofmStatus: 'A' });
  const errada = lanc({ ofmDescription: 'Janta' }); // Almoço com obs "Janta"
  // regra de 05/10: campo errado = recusa imediata com o texto padrão (antes ficava pendente)
  const rec = classificar(errada, montarIndice([aprovada, errada]));
  assert.equal(rec.acao, 'RECUSAR');
  assert.equal(rec.motivo, 'Tipo de despesa incorreto. lançar despesa no campo correspondente');
  assert.deepEqual(rec.tipoCitado, ['JANTA']);
  assert.equal(rec.referencia, undefined);
  // sozinha (sem outro Almoço no dia) também é recusada: não depende de duplicata
  assert.equal(classificar(errada, montarIndice([errada])).acao, 'RECUSAR');
  // observação de km/combustível só segura (não recusa)
  const km = lanc({ oexName: 'Salário de Intermitente', ofmValue: 105, ofmDescription: 'km rodado dia 22/09/2026' });
  assert.equal(classificar(km, montarIndice([km])).acao, 'NADA');
  // Pernoite com "café da manhã incluso" não é campo errado
  const hotel = lanc({ oexName: 'Pernoite', ofmDescription: 'Hotel Ibis, café da manhã incluso' });
  assert.equal(classificar(hotel, montarIndice([hotel])).acao, 'NADA');
  // e ela não conta como "melhor" lançamento para os outros
  const outra = lanc({});
  assert.equal(classificar(outra, montarIndice([errada, outra])).acao, 'NADA');
}

console.log('test-despesas-duplicadas: ok');
