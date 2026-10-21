'use strict';
// Testes das funções puras do agente de cadastro de patrimônio (Compras) no GRM — sem rede, sem Supabase.
const assert = require('assert');
const {
  numeroValido, validarDados, resolverCategoria, tipoPadrao, resolverResponsavel, montarPayload,
} = require('./grmserver-cadastrar-patrimonio-api');
const { resolverMarca, resolverLocal, usoPorChave } = require('./grmserver-cadastrar-veiculo-api');

// ---- número da etiqueta ----
assert.equal(numeroValido('10039'), true);
assert.equal(numeroValido(' 10039 '), true);
assert.equal(numeroValido('0'), false, 'o registro de teste com "0" não vai pro GRM');
assert.equal(numeroValido('0123'), false);
assert.equal(numeroValido('1234567890'), false, 'mais de 9 dígitos');
assert.equal(numeroValido('P-10'), false);
assert.equal(numeroValido(''), false);
assert.equal(numeroValido(null), false);

// ---- dados mínimos ----
assert.deepEqual(validarDados({ numero: '10039', material: 'CALADOR', marca: 'CALLIBRA', responsavel: 'CARLOS' }), []);
const faltas = validarDados({ numero: '0', material: '', marca: '', responsavel: '' });
assert.equal(faltas.length, 4);
assert.ok(faltas.some((f) => /Marca/.test(f)));
assert.ok(faltas.some((f) => /Responsável/.test(f)));

// ---- categoria = nome do material ----
const categorias = [
  { pcaCode: 12, pcaName: 'CALADOR', pcaStatus: 'A' },
  { pcaCode: 13, pcaName: 'BALANÇA DE PRECISÃO', pcaStatus: 'A' },
  { pcaCode: 14, pcaName: 'JOGO DE PENEIRAS', pcaStatus: 'A' },
  { pcaCode: 15, pcaName: 'QUARTEADOR', pcaStatus: 'I' },
  { pcaCode: 70, pcaName: 'VEICULOS', pcaStatus: 'A' },
];
assert.equal(resolverCategoria('Calador', categorias).pcaCode, 12, 'caixa não importa');
assert.equal(resolverCategoria('balanca de precisao', categorias).pcaCode, 13, 'acento não importa');
assert.throws(() => resolverCategoria('QUARTEADOR', categorias), (e) => e.code === 'CATEGORIA_NAO_ENCONTRADA', 'categoria inativa não vale');
assert.throws(() => resolverCategoria('PENEIRA INDIVIDUAL', categorias), (e) => e.code === 'CATEGORIA_NAO_ENCONTRADA' && /JOGO DE PENEIRAS/.test(e.message), 'sugere parecidas');

// ---- tipo mais usado na categoria ----
const existentes = [
  { pcaCode: 12, patType: 'M' }, { pcaCode: 12, patType: 'M' }, { pcaCode: 12, patType: 'E' },
  { pcaCode: 13, patType: 'E' }, { pcaCode: 70, patType: 'M' },
];
assert.equal(tipoPadrao(existentes, 12), 'M');
assert.equal(tipoPadrao(existentes, 13), 'E');
assert.equal(tipoPadrao(existentes, 99), 'M', 'sem exemplo: Material');

// ---- responsável (colaboradores_atuais) ----
const colabs = [
  { nome: 'CARLOS HENRIQUE DELABENETA', cpf: '1', coordenacao: 'GERAL', supervisao: 'GERAL - Administrativo', situacao: 'Ativo', ativo: true },
  { nome: 'LUCAS DE OLIVEIRA ASSMANN', cpf: '2', coordenacao: 'GERAL', supervisao: 'GERAL - Administrativo', situacao: 'Não Ativo', ativo: false },
  { nome: 'JOSÉ DA SILVA', cpf: '3', coordenacao: 'BAHIA', supervisao: 'BAHIA - Geral', situacao: 'Ativo', ativo: true },
  { nome: 'JOSE DA SILVA', cpf: '4', coordenacao: 'GOIAS', supervisao: 'GOIAS 1 - Rio Verde', situacao: 'Ativo', ativo: true },
  { nome: 'SEM LOCAL', cpf: '5', coordenacao: '', supervisao: '', situacao: 'Ativo', ativo: true },
];
assert.equal(resolverResponsavel('Carlos Henrique Delabeneta', colabs).supervisao, 'GERAL - Administrativo');
assert.throws(() => resolverResponsavel('Lucas de Oliveira Assmann', colabs), (e) => e.code === 'RESPONSAVEL_INATIVO');
assert.throws(() => resolverResponsavel('Fulano Inexistente', colabs), (e) => e.code === 'RESPONSAVEL_NAO_ENCONTRADO');
assert.throws(() => resolverResponsavel('José da Silva', colabs), (e) => e.code === 'RESPONSAVEL_AMBIGUO', 'dois ativos com o mesmo nome (CPF diferente)');
assert.throws(() => resolverResponsavel('Sem Local', colabs), (e) => e.code === 'DADOS_INCOMPLETOS');

// ---- marca (catálogo do GRM, mais usada na categoria) ----
const marcas = [
  { pbrCode: 1, pbrName: 'CALLIBRA', pbrStatus: 'A' },
  { pbrCode: 2, pbrName: 'SEM MARCA', pbrStatus: 'A' },
  { pbrCode: 3, pbrName: 'B-MAX', pbrStatus: 'A' },
];
const uso = usoPorChave([{ pbrCode: 1 }, { pbrCode: 1 }, { pbrCode: 3 }], 'pbrCode');
assert.equal(resolverMarca('Callibra', marcas, uso).pbrCode, 1);
assert.equal(resolverMarca('sem marca', marcas, uso).pbrCode, 2);
assert.throws(() => resolverMarca('MARCA INVENTADA', marcas, uso), (e) => e.code === 'MARCA_NAO_ENCONTRADA');

// ---- local: coordenação/supervisão do responsável, conferidas com o funcionário do GRM ----
const ctx = {
  coordenacaoPorNome: new Map([['GERAL', { olcCode: 5, olcName: 'GERAL' }]]),
  supervisaoPorNome: new Map([['GERAL - ADMINISTRATIVO', { olsCode: 51, olsName: 'GERAL - Administrativo', olcCode: 5, olcName: 'GERAL' }]]),
};
const staff = { staCode: 900, staName: 'CARLOS HENRIQUE DELABENETA', olsCode: 51, olsName: 'GERAL - Administrativo', olcCode: 5, olcName: 'GERAL' };
assert.deepEqual(resolverLocal(ctx, { coordenacao: 'GERAL', supervisao: 'GERAL - Administrativo' }, staff), { olcCode: 5, olsCode: 51 });
assert.throws(() => resolverLocal(ctx, { coordenacao: 'GERAL', supervisao: 'GERAL - Administrativo' }, { ...staff, olsCode: 99 }), (e) => e.code === 'FUNCIONARIO_SUPERVISAO_DIVERGENTE');

// ---- payload ----
const payload = montarPayload({
  numero: '10039', material: 'Calador', categoria: categorias[0], marca: marcas[0], local: { olcCode: 5, olsCode: 51 }, staCode: 900, tipo: 'M',
});
assert.equal(payload.patNumber, '10039');
assert.equal(payload.patName, 'CALADOR');
assert.equal(payload.pcaCode, 12);
assert.equal(payload.pbrCode, 1);
assert.equal(payload.pmoCode, null, 'sem modelo, como os patrimônios existentes dessas categorias');
assert.equal(payload.olcCode, 5);
assert.equal(payload.olsCode, 51);
assert.equal(payload.staCode, 900);
assert.equal(payload.patSituation, 'A');
assert.equal(payload.patType, 'M');

console.log('test-cadastrar-patrimonio: OK');
