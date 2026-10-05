'use strict';
// Baixa de holerites considerando as contas da aba "Contas" (rh_contas_pagamento):
// comprovante pro titular de conta de outro titular / beneficiário de pensão
// casa com a parcela do colaborador. Rodar: node test-baixa-contas-cadastradas.js
const assert = require('assert');
const {
  findCandidates, compararDocumento, contasDoFavorecido, findCandidatesViaContas,
  unirCandidatos, diagnosticarViaContas, buildPaymentPayload,
} = require('./grmserver-baixa-notas-fiscais-api');

// Parcelas abertas no formato do payInvoice/getRecords (campos que o agente usa).
const parcela = (over) => ({
  pinStatus: 'A', scpCode: 4, patCode: 5, pinCode: 1, pinInstallmentValue: 1000,
  favoredName: 'FULANO DE TAL', favoredDocument: '111.444.777-35', pinDueDate: '2026-08-06', pinDocNumber: 'X',
  ...over,
});
const matheus = { favoredName: 'MATHEUS MIOTTO DAL MORO', favoredDocument: '086.401.359-08' };
const abertas = [
  parcela({ ...matheus, pinCode: 116115, patCode: 5, pinInstallmentValue: 1620, pinDocNumber: '1063-JULHO-2026' }),
  parcela({ ...matheus, pinCode: 116117, patCode: 2, pinInstallmentValue: 1854.99, pinDocNumber: '1070-JULHO-2026' }),
  parcela({ favoredName: 'JOAO DA SILVA', favoredDocument: '529.982.247-25', pinCode: 200, pinInstallmentValue: 1500 }),
  parcela({ favoredName: 'JOAO DA SILVA', favoredDocument: '111.222.333-96', pinCode: 201, pinInstallmentValue: 1500 }), // homônimo, outro CPF
  parcela({ favoredName: 'JOAO DA SILVA', favoredDocument: '529.982.247-25', pinCode: 202, pinInstallmentValue: 900, scpCode: 3 }), // outra empresa
];

const contaPensao = {
  id: 'p1', tipo: 'pensao', colaborador_nome: 'MATHEUS MIOTTO DAL MORO', colaborador_cpf: '08640135908',
  titular_nome: 'CARLA OLIK', titular_documento: '52998224725',
};
const contaTerceiro = {
  id: 't1', tipo: 'outro_titular', colaborador_nome: 'JOAO DA SILVA', colaborador_cpf: '52998224725',
  titular_nome: 'MARIA DA SILVA', titular_documento: '11144477735',
};
const contas = [contaPensao, contaTerceiro];

// --- documento do comprovante: completo, mascarado ou ausente
assert.deepEqual(compararDocumento('529.982.247-25', '52998224725'), { igual: true, completo: true });
assert.deepEqual(compararDocumento('52998224725', '52998224725'), { igual: true, completo: true });
assert.deepEqual(compararDocumento('529.982.247-24', '52998224725'), { igual: false, completo: true });
assert.deepEqual(compararDocumento('11.222.333/0001-81', '11222333000181'), { igual: true, completo: true });
assert.deepEqual(compararDocumento('***.982.247-**', '52998224725'), { igual: true, completo: false });
assert.deepEqual(compararDocumento('***.111.222-**', '52998224725'), { igual: false, completo: false });
assert.deepEqual(compararDocumento(null, '52998224725'), { igual: null, completo: false });
assert.deepEqual(compararDocumento('', '52998224725'), { igual: null, completo: false });
assert.deepEqual(compararDocumento('texto qualquer', '52998224725'), { igual: null, completo: false });
assert.deepEqual(compararDocumento('***.982.247-**', '11222333000181'), { igual: null, completo: false }); // máscara de CPF x CNPJ cadastrado

// --- quem recebeu o comprovante é titular cadastrado?
const quem = (favorecidoNome, favorecidoDocumento = null) => contasDoFavorecido(contas, { favorecidoNome, favorecidoDocumento }).map((c) => c.id);
assert.deepEqual(quem('CARLA OLIK'), ['p1']); // só nome
assert.deepEqual(quem('Carla Olik', '***.982.247-**'), ['p1']); // nome + máscara coerente
assert.deepEqual(quem('MARIA DA SILVA'), ['t1']);
assert.deepEqual(quem('MARIA SILVA'), ['t1']); // conector faltando, mesma tolerância do casamento por nome
assert.deepEqual(quem('CARLA OLIK', '***.111.222-**'), []); // documento conflita: outra pessoa
assert.deepEqual(quem('CARLA OLIK', '123.456.789-09'), []); // CPF completo diferente
assert.deepEqual(quem('NOME DIFERENTE', '529.982.247-25'), ['p1']); // CPF completo igual basta
assert.deepEqual(quem('NOME DIFERENTE', '***.982.247-**'), []); // máscara não basta sem o nome
assert.deepEqual(quem('BEATRIZ QUALQUER'), []);
assert.deepEqual(quem(null), []);

// --- pensão: favorecido CARLA OLIK, R$ 599,77 (caso real: "MATHEUS MIOTTO PENSAO.pdf")
const diretosPensao = findCandidates(abertas, { scpCode: 4, valor: 599.77, favorecidoNome: 'CARLA OLIK' });
assert.equal(diretosPensao.length, 0); // por nome nunca achava
let via = findCandidatesViaContas(abertas, [contaPensao], { scpCode: 4, valor: 599.77 });
assert.equal(via.length, 0); // sem parcela de 599,77 em aberto: continua revisão
assert.equal(
  diagnosticarViaContas(abertas, [contaPensao], { scpCode: 4, valor: 599.77, favorecidoNome: 'CARLA OLIK' }),
  '"CARLA OLIK" é beneficiário de pensão cadastrado na aba Contas (colaborador MATHEUS MIOTTO DAL MORO), mas nenhuma parcela em aberto no nome de MATHEUS MIOTTO DAL MORO bate com R$ 599,77 (em aberto: R$ 1.620,00, 1.854,99).',
);

// ...agora com o lançamento da pensão no GRM (parcela própria, favorecido = colaborador)
const comPensaoLancada = [...abertas, parcela({ ...matheus, pinCode: 116200, pinInstallmentValue: 599.77, pinDocNumber: 'PENSAO-JULHO-2026' })];
via = findCandidatesViaContas(comPensaoLancada, [contaPensao], { scpCode: 4, valor: 599.77 });
assert.equal(via.length, 1);
assert.equal(via[0].inv.pinCode, 116200);
assert.equal(via[0].conta.tipo, 'pensao');
assert.equal(unirCandidatos([], via).length, 1);

// --- conta de outro titular: PIX pra MARIA DA SILVA no valor do holerite do JOAO DA SILVA
assert.equal(findCandidates(abertas, { scpCode: 4, valor: 1500, favorecidoNome: 'MARIA DA SILVA' }).length, 0);
via = findCandidatesViaContas(abertas, [contaTerceiro], { scpCode: 4, valor: 1500 });
assert.equal(via.length, 1, 'o homônimo com outro CPF no GRM não pode entrar');
assert.equal(via[0].inv.pinCode, 200);
assert.equal(findCandidatesViaContas(abertas, [contaTerceiro], { scpCode: 4, valor: 1499.99 }).length, 0); // valor diferente
assert.equal(findCandidatesViaContas(abertas, [contaTerceiro], { scpCode: 3, valor: 1500 }).length, 0); // outra empresa
// cadastro sem CPF do colaborador: não dá pra separar homônimo, então os dois entram (empate -> revisão)
const semCpf = { ...contaTerceiro, colaborador_cpf: null };
assert.equal(findCandidatesViaContas(abertas, [semCpf], { scpCode: 4, valor: 1500 }).length, 2);

// --- empate por mês seguinte: o vencimento mais recente ganha (mesma regra do casamento por nome)
const doisMeses = [
  parcela({ favoredName: 'JOAO DA SILVA', pinCode: 300, pinInstallmentValue: 1500, pinDueDate: '2026-08-06' }),
  parcela({ favoredName: 'JOAO DA SILVA', pinCode: 301, pinInstallmentValue: 1500, pinDueDate: '2026-09-05' }),
];
const viaMeses = findCandidatesViaContas(doisMeses, [{ ...contaTerceiro, colaborador_cpf: null }], { scpCode: 4, valor: 1500 });
assert.deepEqual(unirCandidatos([], viaMeses).map((c) => c.pinCode), [301]);

// --- por nome e por conta apontando parcelas diferentes = empate (revisão)
const diretoOutro = parcela({ favoredName: 'MARIA DA SILVA', favoredDocument: '999.888.777-66', pinCode: 400, pinInstallmentValue: 1500 });
const diretos = findCandidates([...abertas, diretoOutro], { scpCode: 4, valor: 1500, favorecidoNome: 'MARIA DA SILVA' });
assert.deepEqual(diretos.map((c) => c.pinCode), [400]);
const viaMaria = findCandidatesViaContas(abertas, [contaTerceiro], { scpCode: 4, valor: 1500 });
assert.equal(unirCandidatos(diretos, viaMaria).length, 2);
// mesma parcela pelos dois caminhos não duplica
assert.equal(unirCandidatos([abertas[2]], viaMaria).length, 1);

// --- descrição do movimento no GRM
const itens = [{ pinCode: '200', patCode: 5, valor: 1500, pinDocNumber: 'DOC-1' }];
const base = { itens, baccCode: 22, favorecidoNome: 'MARIA DA SILVA', valor: 1500, dataPagamento: '2026-10-05' };
assert.equal(buildPaymentPayload(base).ppyMovBancDescription, 'Pagamento MARIA DA SILVA. Doc DOC-1. Conta: 200');
assert.equal(
  buildPaymentPayload({ ...base, viaConta: { tipo: 'outro_titular', colaborador_nome: 'JOAO DA SILVA' } }).ppyMovBancDescription,
  'Pagamento MARIA DA SILVA (conta de outro titular de JOAO DA SILVA). Doc DOC-1. Conta: 200',
);
assert.equal(
  buildPaymentPayload({ ...base, favorecidoNome: 'CARLA OLIK', viaConta: { tipo: 'pensao', colaborador_nome: 'MATHEUS MIOTTO DAL MORO' } }).ppyMovBancDescription,
  'Pagamento CARLA OLIK (pensão de MATHEUS MIOTTO DAL MORO). Doc DOC-1. Conta: 200',
);

console.log('test-baixa-contas-cadastradas: ok');
