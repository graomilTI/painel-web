'use strict';
// Testes das funções puras do agente de cadastro de veículo no GRM (sem rede, sem Supabase).
// Fixtures copiadas de registros reais do GRM lidos em 08/10/2026.
const assert = require('assert');
const {
  formatPlacaGrm, chavePlaca, placasNoTexto, tipoParaGrm, situacaoParaGrm, validarDados,
  usoPorChave, resolverMarca, resolverModelo, resolverLocal, montarPatName,
  montarPayloadPatrimonio, montarPayloadVeiculo,
} = require('./grmserver-cadastrar-veiculo-api');

// ---- placa ----
assert.equal(formatPlacaGrm('seh5j49'), 'SEH-5J49');
assert.equal(formatPlacaGrm('ABC-1234'), 'ABC-1234');
assert.equal(chavePlaca('AXT5G42'), chavePlaca('AXT5642'), 'Mercosul == placa antiga equivalente');
assert.notEqual(chavePlaca('AXT5G42'), chavePlaca('AXT5G43'));
assert.deepEqual(placasNoTexto('ANY0G55 FIAT UNO VIVACE BRANCA'), ['ANY0G55']);
assert.deepEqual(placasNoTexto('bbe-1b14 peugeot'), ['BBE1B14']);

// ---- tipo / situação ----
assert.equal(tipoParaGrm('Próprio'), 'P');
assert.equal(tipoParaGrm('PROPIO'), 'P');
assert.equal(tipoParaGrm('Locado'), 'A');
assert.equal(tipoParaGrm('Alugado'), 'A');
assert.equal(tipoParaGrm('Terceirizado'), 'T');
assert.equal(tipoParaGrm(''), null);
assert.equal(tipoParaGrm('Emprestado'), null);
assert.equal(situacaoParaGrm('ATIVO'), 'A');
assert.equal(situacaoParaGrm('MANUTENCAO'), 'M');
assert.equal(situacaoParaGrm('Manutenção'), 'M');
assert.equal(situacaoParaGrm('VENDIDO'), 'B');
assert.equal(situacaoParaGrm('INATIVO'), 'E');

// ---- catálogo real (duplicado por nome: FIAT 147/225, modelos repetidos por código) ----
const marcas = [
  { pbrCode: 147, pbrName: 'FIAT', pbrStatus: 'A' },
  { pbrCode: 225, pbrName: 'FIAT', pbrStatus: 'A' },
  { pbrCode: 227, pbrName: 'VOLKSWAGEN/VW', pbrStatus: 'A' },
  { pbrCode: 153, pbrName: 'VOLKWAGEN', pbrStatus: 'A' },
  { pbrCode: 239, pbrName: 'HONDA ', pbrStatus: 'A' },
  { pbrCode: 156, pbrName: 'CHEVROLET', pbrStatus: 'A' },
  { pbrCode: 235, pbrName: 'CHEVROLET', pbrStatus: 'A' },
  { pbrCode: 300, pbrName: 'ANTIGA', pbrStatus: 'N' },
];
const modelos = [
  { pmoCode: 31, pbrCode: 147, pmoName: 'ARGO 1.0 6V FLEX\r\n', pmoStatus: 'A' },
  { pmoCode: 33, pbrCode: 225, pmoName: 'ARGO 1.0 6V FLEX', pmoStatus: 'A' },
  { pmoCode: 172, pbrCode: 147, pmoName: 'ARGO 1.3 FLEX', pmoStatus: 'A' },
  { pmoCode: 95, pbrCode: 147, pmoName: 'UNO VIVACE', pmoStatus: 'A' },
  { pmoCode: 99, pbrCode: 147, pmoName: 'UNO WAY', pmoStatus: 'A' },
  { pmoCode: 103, pbrCode: 147, pmoName: 'UNO WAY 1.0', pmoStatus: 'A' },
  { pmoCode: 97, pbrCode: 225, pmoName: 'UNO VIVACE', pmoStatus: 'A' },
  { pmoCode: 135, pbrCode: 227, pmoName: 'GOL', pmoStatus: 'A' },
  { pmoCode: 151, pbrCode: 239, pmoName: 'CIVIC', pmoStatus: 'A' },
  { pmoCode: 29, pbrCode: 235, pmoName: 'ONIX', pmoStatus: 'A' },
  { pmoCode: 27, pbrCode: 156, pmoName: 'ONIX', pmoStatus: 'A' },
  { pmoCode: 400, pbrCode: 147, pmoName: 'MODELO INATIVO', pmoStatus: 'N' },
];
// 147 (FIAT) é o mais usado; 156 mais que 235
const usoMarca = new Map([[147, 182], [225, 53], [156, 4], [235, 3], [227, 20]]);
const usoModelo = new Map([[31, 32], [33, 6], [95, 32], [97, 2], [99, 5], [27, 4], [29, 3]]);

assert.equal(resolverMarca('fiat', marcas, usoMarca).pbrCode, 147, 'marca duplicada -> código mais usado');
assert.equal(resolverMarca('Chevrolet', marcas, usoMarca).pbrCode, 156);
assert.equal(resolverMarca('VW', marcas, usoMarca).pbrCode, 227, 'alias dentro de VOLKSWAGEN/VW');
assert.equal(resolverMarca('Volkswagen', marcas, usoMarca).pbrCode, 227);
assert.equal(resolverMarca('honda', marcas, usoMarca).pbrCode, 239, 'espaço sobrando no nome do GRM');
assert.throws(() => resolverMarca('Antiga', marcas, usoMarca), (e) => e.code === 'MARCA_NAO_ENCONTRADA' && /Marcas disponíveis/.test(e.message));
assert.throws(() => resolverMarca('Tesla', marcas, usoMarca), (e) => e.code === 'MARCA_NAO_ENCONTRADA');

const fiat = resolverMarca('FIAT', marcas, usoMarca);
const argo = resolverModelo('ARGO 1.0 6V FLEX', fiat, marcas, modelos, usoModelo);
assert.deepEqual(argo, { pbrCode: 147, pbrName: 'FIAT', pmoCode: 31, pmoName: 'ARGO 1.0 6V FLEX' }, 'modelo mais usado entre marcas irmãs, \\r\\n removido');
assert.equal(resolverModelo('fiat uno vivace', fiat, marcas, modelos, usoModelo).pmoCode, 95, 'ignora o nome da marca na frente');
assert.equal(resolverModelo('ARGO 1.0', fiat, marcas, modelos, usoModelo).pmoCode, 31, 'prefixo único do catálogo');
assert.throws(() => resolverModelo('UNO', fiat, marcas, modelos, usoModelo), (e) => e.code === 'MODELO_NAO_ENCONTRADO' && /UNO VIVACE/.test(e.message), 'prefixo ambíguo vira erro com sugestões');
assert.throws(() => resolverModelo('MODELO INATIVO', fiat, marcas, modelos, usoModelo), (e) => e.code === 'MODELO_NAO_ENCONTRADO');
assert.throws(() => resolverModelo('Palio', fiat, marcas, modelos, usoModelo), (e) => e.code === 'MODELO_NAO_ENCONTRADO');
const onix = resolverModelo('ONIX', resolverMarca('Chevrolet', marcas, usoMarca), marcas, modelos, usoModelo);
assert.equal(onix.pbrCode, 156);
assert.equal(onix.pmoCode, 27);
assert.deepEqual([...usoPorChave([{ pbrCode: 1 }, { pbrCode: 1 }, { pbrCode: 2 }, { pbrCode: 0 }], 'pbrCode')], [[1, 2], [2, 1]]);

// ---- local ----
const ctx = {
  coordenacaoPorNome: new Map([
    ['MARINGA E TERMINAIS', { olcCode: 14, olcName: 'MARINGA E TERMINAIS' }],
    ['CASCAVEL', { olcCode: 8, olcName: 'CASCAVEL' }],
  ]),
  supervisaoPorNome: new Map([
    ['MARINGA E TERMINAIS', { olsCode: 39, olcCode: 14, olsName: 'Maringa e Terminais', olcName: 'MARINGA E TERMINAIS' }],
    ['CASCAVEL - CAMPO MOURAO', { olsCode: 85, olcCode: 8, olsName: 'CASCAVEL - Campo Mourão', olcName: 'CASCAVEL' }],
  ]),
};
assert.deepEqual(resolverLocal(ctx, { coordenacao: 'Maringa e Terminais', supervisao: 'Maringa e Terminais' }, null), { olcCode: 14, olsCode: 39 });
assert.deepEqual(resolverLocal(ctx, { coordenacao: '', supervisao: 'Cascavel - Campo Mourão' }, null), { olcCode: 8, olsCode: 85 }, 'coordenação vem da supervisão');
assert.deepEqual(resolverLocal(ctx, { coordenacao: 'Cascavel', supervisao: '' }, null), { olcCode: 8, olsCode: null }, 'só coordenação');
assert.throws(() => resolverLocal(ctx, { coordenacao: 'Cascavel', supervisao: 'Maringa e Terminais' }, null), (e) => e.code === 'LOCAL_DIVERGENTE');
assert.throws(() => resolverLocal(ctx, { coordenacao: '', supervisao: 'Inexistente' }, null), (e) => e.code === 'SUPERVISAO_NAO_ENCONTRADA');
assert.throws(() => resolverLocal(ctx, { coordenacao: 'Inexistente', supervisao: '' }, null), (e) => e.code === 'COORDENACAO_NAO_ENCONTRADA');
assert.throws(() => resolverLocal(ctx, { coordenacao: '', supervisao: '' }, null), (e) => e.code === 'DADOS_INCOMPLETOS');
const staff = { staCode: 240, staName: 'JOAO PEDRO', olsCode: 39, olcCode: 14, olsName: 'Maringa e Terminais', olcName: 'MARINGA E TERMINAIS' };
assert.deepEqual(resolverLocal(ctx, { coordenacao: '', supervisao: '' }, staff), { olcCode: 14, olsCode: 39 }, 'sem local: herda do funcionário');
assert.deepEqual(resolverLocal(ctx, { coordenacao: 'Maringa e Terminais', supervisao: 'Maringa e Terminais' }, staff), { olcCode: 14, olsCode: 39 });
assert.throws(() => resolverLocal(ctx, { coordenacao: 'Cascavel', supervisao: 'Cascavel - Campo Mourão' }, staff), (e) => e.code === 'FUNCIONARIO_SUPERVISAO_DIVERGENTE');

// ---- validação ----
const base = {
  placa: 'ANY0G55', renavam: '01344613532', marca: 'FIAT', modelo: 'UNO VIVACE', ano: 2023, cor: 'branca',
  tipo: 'Próprio', grm_patrimonio_numero: '1923', coordenacao: 'Maringa e Terminais', supervisao: 'Maringa e Terminais',
  motorista_atual: '', status: 'ATIVO', hodometro: 0, chassi: '9bd358accpym58634',
};
assert.deepEqual(validarDados(base), []);
assert.ok(validarDados({ ...base, renavam: '123' }).some((m) => /Renavam/.test(m)));
assert.ok(validarDados({ ...base, grm_patrimonio_numero: '12A' }).some((m) => /Patrimônio/.test(m)));
assert.ok(validarDados({ ...base, grm_patrimonio_numero: '' }).some((m) => /Patrimônio/.test(m)));
assert.ok(validarDados({ ...base, ano: 23 }).some((m) => /Ano/.test(m)));
assert.ok(validarDados({ ...base, tipo: null }).some((m) => /Tipo/.test(m)));
assert.ok(validarDados({ ...base, coordenacao: '', supervisao: '' }).some((m) => /Coordenação/.test(m)));
assert.ok(validarDados({ ...base, tipo: 'Alugado' }).some((m) => /Valor mensal/.test(m)));
assert.deepEqual(validarDados({ ...base, tipo: 'Alugado', valor_mensal: 3000, dia_vencimento: 10 }), []);
assert.ok(validarDados({ ...base, tipo: 'Terceiro' }).some((m) => /R\$\/Km/.test(m)));
assert.deepEqual(validarDados({ ...base, tipo: 'Terceiro', valor_km: 1.5 }), []);

// ---- payloads ----
const marca = { pbrCode: 147, pbrName: 'FIAT', pmoCode: 95, pmoName: 'UNO VIVACE' };
const local = { olcCode: 14, olsCode: 39 };
assert.equal(montarPatName('any0g55', 'FIAT', 'UNO VIVACE', 'branca'), 'ANY0G55 FIAT UNO VIVACE BRANCA', 'mesmo formato dos 315 patrimônios existentes');
const pat = montarPayloadPatrimonio({ veic: base, marca, local, staCode: 240, pcaCode: 70 });
assert.deepEqual(pat, {
  patNumber: '1923', oldPatNumber: null, patName: 'ANY0G55 FIAT UNO VIVACE BRANCA', pcaCode: 70, pbrCode: 147, pmoCode: 95,
  olcCode: 14, olsCode: 39, staCode: 240, patSituation: 'A', patType: 'M', patComments: '', patAcquisitionDate: '',
  supCode: null, patSerialNumber: '', patIMEI: '', patPhoneLine: '', patIsPersonal: null,
});
assert.equal(montarPayloadPatrimonio({ veic: { ...base, status: 'MANUTENCAO' }, marca, local, staCode: null, pcaCode: 70 }).patSituation, 'M');
const veh = montarPayloadVeiculo({ veic: base, marca, local, staCode: null });
assert.equal(veh.vehName, 'ANY-0G55');
assert.equal(veh.vehLicensePlate, 'ANY-0G55');
assert.equal(veh.vehRenavam, '01344613532');
assert.equal(veh.vehColor, 'BRANCA');
assert.equal(veh.vehType, 'P');
assert.equal(veh.vehYear, 2023);
assert.equal(veh.vehHodometer, 0);
assert.equal(veh.vehChassis, '9BD358ACCPYM58634');
assert.equal(veh.vehYearModel, 2023);
assert.equal(veh.vehRentalMonthValue, null);
assert.equal('vehChassis' in montarPayloadVeiculo({ veic: base, marca, local, staCode: null }, { comExtras: false }), false);
const alugado = montarPayloadVeiculo({ veic: { ...base, tipo: 'Alugado', valor_mensal: '3500.5', dia_vencimento: '10' }, marca, local, staCode: 240 });
assert.equal(alugado.vehType, 'A');
assert.equal(alugado.vehRentalMonthValue, 3500.5);
assert.equal(alugado.vehRentalMonthDay, 10);
assert.equal(alugado.vehValueKilometer, null);
assert.equal(alugado.staCode, 240);
const terceiro = montarPayloadVeiculo({ veic: { ...base, tipo: 'Terceiro', valor_km: 1.5 }, marca, local, staCode: null });
assert.equal(terceiro.vehValueKilometer, 1.5);
assert.equal(terceiro.vehRentalMonthValue, null);

console.log('test-cadastrar-veiculo: OK');
