'use strict';
// Pensão alimentícia do holerite: leitura da linha de desconto e montagem do
// lançamento próprio da pensão. Sem rede: o Supabase é simulado e o texto é
// sintético (nomes e valores fictícios) no layout do `pdftotext -layout`.
const assert = require('assert');
const A = require('./grmserver-lancar-notas-fiscais-api');

A.loadConfig();

// O PDF traz o holerite duas vezes (as duas vias na mesma página).
function via({ pensao = [], extras = [] }) {
  const linhas = [
    '                     RECIBO DE PAGAMENTO DE SALARIO         FOLHA MENSAL',
    '                     GRAOMIL LTDA          CNPJ 29.666.679/0001-34',
    'Referência: SETEMBRO DE 2026',
    'Código   Nome do Funcionário                    CBO     Departamento  Filial',
    ' 1070    FULANO DE TAL SILVA                   515110   1   1',
    '         INTERMITENTE',
    ' 8781    SALARIO BASE                         30,00           3.125,00',
    ' 998     I.N.S.S.                             11,00             343,75',
    ...pensao,
    ...extras,
    '                         TOTAL DE VENCIMENTOS    TOTAL DE DESCONTOS    VALOR LIQUIDO',
    '                              3.125,00              1.443,75             1.681,25',
  ];
  return linhas.join('\n');
}
const texto = (opts) => `${via(opts)}\n\f${via(opts)}`;

const LINHA = (cod, nome, ref, valor, cauda = '') => `  ${cod}        ${nome}${' '.repeat(60)}${ref}${' '.repeat(40)}${valor}${cauda}`;

// --- leitura da linha: uma pensão, duas vias do holerite = conta uma vez só
let p = A.payrollPensao(texto({ pensao: [LINHA(55, 'PENSAO ALIMENTICIA', '37,00', '599,77')] }));
assert.equal(p.total, 599.77);
assert.equal(p.linhas.length, 1);

// linha com campo de assinatura colado no fim (recibo)
p = A.payrollPensao(texto({ pensao: [LINHA(246, 'PENSAO ALIMENTICIA', '30,00', '486,30', '   ____/____/_______')] }));
assert.equal(p.total, 486.30);

// sem código à esquerda
p = A.payrollPensao(texto({ pensao: ['             PENSAO ALIMENTICIA    36,20     586,80'] }));
assert.equal(p.total, 586.80);

// pensão + pensão retroativa = uma soma
p = A.payrollPensao(texto({ pensao: [LINHA(258, 'PENSAO ALIMENTICIA', '30,00', '486,30'), LINHA(259, 'PENSAO ALIMENTICIA RETROATIVA', '300,00', '300,00')] }));
assert.equal(p.linhas.length, 2);
assert.equal(p.total, 786.30);

// "BASE ... PENSAO" (base de cálculo no rodapé) e holerite sem pensão não contam
p = A.payrollPensao(texto({ extras: ['   BASE CALCULO PENSAO ALIMENTICIA              3.125,00'] }));
assert.equal(p.total, 0);
assert.equal(A.payrollPensao(texto({})).total, 0);
assert.equal(A.payrollPensao('').total, 0);

// --- montagem do lançamento da pensão
function supabaseCom(contas) {
  const consulta = {
    select() { return consulta; },
    eq() { return consulta; },
    then(resolve) { resolve({ data: contas, error: null }); },
  };
  return { from: (tabela) => { assert.equal(tabela, 'rh_contas_pagamento'); return consulta; } };
}
const conta = { id: 'c1', colaborador_nome: 'Fulano de Tal Silva', titular_nome: 'BENEFICIARIA TESTE', titular_documento: '11111111111' };

(async () => {
  const extraido = { texto_extraido: texto({ pensao: [LINHA(55, 'PENSAO ALIMENTICIA', '37,00', '599,77')] }), valor_total: 1681.25 };
  const row = { arquivo_nome: 'HOLERITE 1070 - FULANO DE TAL SILVA.pdf', setor: 'RH' };

  // o holerite normal continua com o líquido
  const holerite = A.applyPayslipRules(extraido, row);
  assert.equal(holerite.valor_total, 1681.25);
  assert.equal(holerite.categoria, 'SALÁRIO DE INTERMITENTE');
  assert.equal(holerite.eh_pensao, undefined);
  const fpHolerite = A.fingerprintOf(holerite);

  // com conta cadastrada: lançamento da pensão válido, mesma competência/vencimento
  A._teste.setSupabase(supabaseCom([conta]));
  const pensao = await A.applyPensaoRules(A.applyPayslipRules(extraido, row), extraido.texto_extraido);
  pensao.fingerprint = A.fingerprintOf(pensao);
  assert.equal(pensao.valor_total, 599.77);
  assert.equal(pensao.rateio.valor, 599.77);
  assert.equal(pensao.grupo_categoria, 'FOLHA DE PAGAMENTO');
  assert.equal(pensao.categoria, 'PENSAO ALIMENTICIA');
  assert.equal(pensao.tipo_favorecido, 'Funcionário');
  assert.equal(pensao.funcionario_nome, 'FULANO DE TAL SILVA');
  assert.equal(pensao.numero_documento, 'PENSAO-1070-SETEMBRO 2026');
  assert.equal(pensao.data_vencimento, holerite.data_vencimento);
  assert.equal(pensao.data_conta, holerite.data_conta);
  assert.equal(pensao.descricao, 'PENSÃO ALIMENTÍCIA SETEMBRO 2026');
  assert.deepEqual(pensao.pensao.contas.map((c) => c.id), ['c1']);
  assert.notEqual(pensao.fingerprint, fpHolerite);
  assert.equal(A.validateData(pensao).ok, true);
  // a pensão sai no payload com descrição; o holerite continua sem
  const resolved = { scpCode: 1, picCode: 2, payInvoiceMainCategory: 3, pdtCode: 4, patCode: 5, isEmployee: true, staCode: 6, supCode: 0, olcCode: 0, moreThenOneCompany: 'N' };
  assert.equal(A.buildPayInvoicePayload(pensao, resolved).pinDescription, 'PENSÃO ALIMENTÍCIA SETEMBRO 2026');
  assert.equal(A.buildPayInvoicePayload(pensao, resolved).pinTotalValue, 599.77);
  assert.equal(A.buildPayInvoicePayload(holerite, resolved).pinDescription, '');

  // fingerprint do holerite comum não mudou de fórmula (sem marca extra)
  assert.equal(A.fingerprintOf({ ...holerite, eh_pensao: undefined }), fpHolerite);

  // sem conta cadastrada: segura em revisão, com a pendência dizendo o que fazer
  A._teste.setSupabase(supabaseCom([]));
  const semConta = await A.applyPensaoRules(A.applyPayslipRules(extraido, row), extraido.texto_extraido);
  const validacao = A.validateData(semConta);
  assert.equal(validacao.ok, false);
  assert.ok(validacao.missing.some((m) => /conta de pensão de FULANO DE TAL SILVA não cadastrada/.test(m)), validacao.missing.join(' | '));

  // conta de outro colaborador não vale
  A._teste.setSupabase(supabaseCom([{ ...conta, colaborador_nome: 'OUTRA PESSOA' }]));
  assert.equal(A.validateData(await A.applyPensaoRules(A.applyPayslipRules(extraido, row), extraido.texto_extraido)).ok, false);

  // duas contas ativas: lança o total e avisa
  A._teste.setSupabase(supabaseCom([conta, { ...conta, id: 'c2' }]));
  const duas = await A.applyPensaoRules(A.applyPayslipRules(extraido, row), extraido.texto_extraido);
  assert.equal(duas.pensao.avisos.length, 1);
  assert.equal(A.validateData(duas).ok, true);

  // texto sem linha de pensão: não pode sobrar o valor do líquido
  A._teste.setSupabase(supabaseCom([conta]));
  const semLinha = { texto_extraido: texto({}), valor_total: 1681.25 };
  const vazio = await A.applyPensaoRules(A.applyPayslipRules(semLinha, row), semLinha.texto_extraido);
  assert.equal(vazio.valor_total, null);
  assert.equal(A.validateData(vazio).ok, false);

  // ajuste manual de contrato não troca a categoria da pensão
  const ajustado = A.applyManualOverrides(await A.applyPensaoRules(A.applyPayslipRules(extraido, row), extraido.texto_extraido), { tipo_contrato: 'Mensalista' });
  assert.equal(ajustado.categoria, 'PENSAO ALIMENTICIA');
  assert.equal(ajustado.tipo_contrato, 'Mensalista');

  console.log('test-pensao-holerite: ok');
})().catch((e) => { console.error(e); process.exit(1); });
