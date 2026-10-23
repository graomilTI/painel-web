'use strict';
// Testes das funções puras do agente de cadastro de fornecedor no GRM — sem rede, sem Supabase.
const assert = require('assert');
const {
  cnpjValido, formatarCnpj, formatarCep, formatarTelefone, emailValido,
  normalizarBrasilApi, normalizarReceitaWs, resolverTipoLogradouro, resolverCidade,
  derivarCategoriaFornecedor, validarReceita, montarPayload, resolverCategoriaPagamento,
  consultarReceita, completarPeloCep,
} = require('./grmserver-cadastrar-fornecedor-api');

(async () => {
  // ---- CNPJ ----
  assert.equal(cnpjValido('21.948.503/0001-63'), true, 'CALLIBRA MT');
  assert.equal(cnpjValido('37085274000130'), true, 'MULTILAR');
  assert.equal(cnpjValido('63922368000127'), true, 'SHIFT MOBILE');
  assert.equal(cnpjValido('21948503000164'), false, 'dígito verificador errado');
  assert.equal(cnpjValido('11111111111111'), false, 'todos iguais');
  assert.equal(cnpjValido('123'), false);
  assert.equal(formatarCnpj('21948503000163'), '21.948.503/0001-63');
  assert.equal(formatarCep('78070300'), '78070-300');
  assert.equal(formatarCep('7807030'), '');

  // ---- telefone / e-mail (opcionais: inválido vira vazio) ----
  assert.equal(formatarTelefone('6535412345'), '(65) 3541-2345');
  assert.equal(formatarTelefone('65996251212'), '(65) 99625-1212');
  assert.equal(formatarTelefone('(65) 3541-2345 / (65) 3541-0000'), '(65) 3541-2345', 'primeiro número');
  assert.equal(formatarTelefone('3541'), '');
  assert.equal(formatarTelefone('1199999999'), '', 'número de enchimento da Receita');
  assert.equal(formatarTelefone('1100000000'), '');
  assert.equal(formatarTelefone(null), '');
  assert.equal(emailValido(' COMERCIAL@Empresa.com.br '), 'comercial@empresa.com.br');
  assert.equal(emailValido('sem-arroba'), '');

  // ---- BrasilAPI / ReceitaWS -> forma única ----
  const brasil = normalizarBrasilApi({
    razao_social: 'CALLIBRA MT COMERCIO DE EQUIPAMENTOS LTDA', nome_fantasia: 'CALLIBRA', situacao_cadastral: 2, descricao_situacao_cadastral: 'ATIVA',
    descricao_tipo_de_logradouro: 'AVENIDA', logradouro: 'GENERAL MELLO', numero: '3589', complemento: 'SALA 2', bairro: 'JARDIM CALIFORNIA',
    cep: '78070300', municipio: 'CUIABA', uf: 'mt', codigo_municipio_ibge: 5103403, ddd_telefone_1: '6592627101', email: 'COMERCIALMS@CALLIBRA.COM.BR',
  });
  assert.equal(brasil.ativa, true);
  assert.equal(brasil.uf, 'MT');
  assert.equal(brasil.ibge, '5103403');
  assert.equal(normalizarBrasilApi({ message: 'CNPJ não encontrado' }), null);
  assert.equal(normalizarBrasilApi({ razao_social: 'X', situacao_cadastral: 8, descricao_situacao_cadastral: 'BAIXADA' }).ativa, false);
  const rws = normalizarReceitaWs({ status: 'OK', nome: 'ABCOMPRAS UTILIDADES LTDA', situacao: 'ATIVA', logradouro: 'R DAS FLORES', numero: '10', bairro: 'CENTRO', cep: '78.070-300', municipio: 'Cuiabá', uf: 'MT', telefone: '(65) 3541-2345 / (65) 1', email: '' });
  assert.equal(rws.ativa, true);
  assert.equal(rws.cep, '78070300');
  assert.equal(rws.ibge, '');
  assert.equal(normalizarReceitaWs({ status: 'ERROR', message: 'CNPJ inválido' }), null);

  // ---- situação cadastral / campos obrigatórios ----
  assert.throws(() => validarReceita({ ...brasil, ativa: false, situacao: 'BAIXADA' }, '21948503000163'), (e) => e.code === 'CNPJ_INATIVO' && /BAIXADA/.test(e.message));
  assert.deepEqual(validarReceita(brasil, '21948503000163'), []);
  assert.deepEqual(validarReceita({ ...brasil, cep: '', logradouro: '' }, '21948503000163'), ['CEP', 'logradouro']);

  // ---- tipo de logradouro ----
  const tipos = [{ satCode: 1, satName: 'Alameda' }, { satCode: 2, satName: 'Avenida' }, { satCode: 7, satName: 'Estrada' }, { satCode: 11, satName: 'Rodovia' }, { satCode: 12, satName: 'Rua' }];
  assert.equal(resolverTipoLogradouro({ tipoLogradouro: 'AVENIDA', logradouro: 'GENERAL MELLO' }, tipos).tipo.satCode, 2, 'tipo vindo da Receita');
  assert.equal(resolverTipoLogradouro({ tipoLogradouro: '', logradouro: 'AV GENERAL MELLO' }, tipos).tipo.satCode, 2, 'abreviatura no começo');
  assert.equal(resolverTipoLogradouro({ tipoLogradouro: '', logradouro: 'ROD BR 163' }, tipos).tipo.satCode, 11);
  assert.equal(resolverTipoLogradouro({ tipoLogradouro: '', logradouro: 'ESTRADA VELHA' }, tipos).tipo.satCode, 7, 'nome por extenso');
  const padrao = resolverTipoLogradouro({ tipoLogradouro: 'TRAVESSA', logradouro: 'DAS FLORES' }, tipos);
  assert.equal(padrao.tipo.satCode, 12);
  assert.equal(padrao.padrao, true, 'sem correspondência cai em Rua e avisa');
  assert.equal(resolverTipoLogradouro({ tipoLogradouro: '', logradouro: 'X' }, [{ satCode: 1, satName: 'Alameda' }]), null);

  // ---- cidade (IBGE; senão pelo nome) ----
  const cidades = [{ citCode: 5103403, citName: 'CUIABÁ', citStatus: 'A' }, { citCode: 5100201, citName: 'ÁGUA BOA', citStatus: 'A' }, { citCode: 5100102, citName: 'ACORIZAL', citStatus: 'I' }];
  assert.equal(resolverCidade({ ibge: '5103403', municipio: 'qualquer' }, cidades).citCode, 5103403);
  assert.equal(resolverCidade({ ibge: '', municipio: 'Agua Boa' }, cidades).citCode, 5100201, 'sem IBGE: nome sem acento');
  assert.equal(resolverCidade({ ibge: '9999999', municipio: 'Cuiabá' }, cidades).citCode, 5103403, 'IBGE desconhecido cai no nome');
  assert.equal(resolverCidade({ ibge: '5100102', municipio: 'Acorizal' }, cidades), null, 'cidade inativa não vale');

  // ---- categoria do fornecedor derivada da categoria da NF ----
  const sca = [
    ['MATERIAL EXPEDIENTE', 40], ['HOSPEDAGEM', 28], ['DIVERSOS', 16], ['INSUMOS DIVERSOS', 34], ['PATRIMONIO', 49], ['TELEFONE/INTERNET', 67],
    ['DESPESAS COM VEICULOS', 73], ['COMBUSTIVEIS', 10], ['SAÚDE E SEGURANÇA DO TRABALHO', 58], ['DESPESAS RH', 75], ['teste', 84],
  ].map(([scaName, scaCode]) => ({ scaName, scaCode, scaStatus: 'A' }));
  const sc = (cat, grupo) => derivarCategoriaFornecedor(cat, grupo, sca);
  assert.deepEqual([sc('MATERIAL EXPEDIENTE', 'DESPESAS ADMINISTRATIVAS').categoria.scaCode, sc('MATERIAL EXPEDIENTE').motivo], [40, 'mesmo nome']);
  assert.equal(sc('Hospedagem', 'DESPESAS OPERACIONAIS').categoria.scaCode, 28, 'caixa/acento não importam');
  assert.deepEqual([sc('INSUMOS OPERAÇÃO', 'DESPESAS OPERACIONAIS').categoria.scaCode, sc('INSUMOS OPERAÇÃO').motivo], [34, 'mapeamento']);
  assert.equal(sc('INTERNET/TELEFONE', 'DESPESAS ADMINISTRATIVAS').categoria.scaCode, 67);
  assert.equal(sc('EPI - EQUIP DE PROTECAO INDIVIDUAL', 'DESPESAS RH').categoria.scaCode, 58, 'mapeamento vale mais que o grupo');
  assert.equal(sc('UNIFORME/CRACHA', 'DESPESAS RH').categoria.scaCode, 75);
  assert.deepEqual([sc('LAVAGEM DE VEICULO', 'DESPESAS COM VEICULOS').categoria.scaCode, sc('LAVAGEM DE VEICULO', 'DESPESAS COM VEICULOS').motivo], [73, 'grupo da categoria']);
  assert.equal(sc('COMBUSTIVEL', 'COMBUSTIVEIS E LUBRIFICANTES').categoria.scaCode, 10);
  assert.deepEqual([sc('TAXAS', 'DESPESAS ADMINISTRATIVAS').categoria.scaCode, sc('TAXAS', 'DESPESAS ADMINISTRATIVAS').motivo], [16, 'padrão']);
  assert.equal(derivarCategoriaFornecedor('SALÁRIO FIXO', 'FOLHA DE PAGAMENTO', sca).categoria.scaCode, 16, 'sem correspondência: DIVERSOS');
  const semAlvo = sca.map((c) => (c.scaName === 'HOSPEDAGEM' ? { ...c, scaStatus: 'I' } : c));
  assert.equal(derivarCategoriaFornecedor('HOSPEDAGEM', 'X', semAlvo).categoria.scaCode, 16, 'categoria inativa não vale');
  assert.throws(() => derivarCategoriaFornecedor('X', 'Y', [{ scaName: 'HOSPEDAGEM', scaCode: 28, scaStatus: 'A' }]), (e) => e.code === 'CATEGORIA_FORNECEDOR_NAO_ENCONTRADA');

  // ---- categoria de pagamento = a da NF (folha) ----
  const pic = [
    { picCode: 25, picParent: 0, picName: 'DESPESAS ADMINISTRATIVAS', picStatus: 'A' },
    { picCode: 100, picParent: 25, picName: 'MATERIAL EXPEDIENTE', picStatus: 'A', picParentName: 'DESPESAS ADMINISTRATIVAS' },
    { picCode: 101, picParent: 25, picName: 'TAXAS ', picStatus: 'I' },
  ];
  assert.equal(resolverCategoriaPagamento('material expediente', pic).picCode, 100);
  assert.throws(() => resolverCategoriaPagamento('TAXAS', pic), (e) => e.code === 'CATEGORIA_NF_NAO_ENCONTRADA', 'inativa');
  assert.throws(() => resolverCategoriaPagamento('DESPESAS ADMINISTRATIVAS', pic), (e) => e.code === 'CATEGORIA_NF_NAO_ENCONTRADA', 'grupo (pai) não é categoria de NF');
  assert.throws(() => resolverCategoriaPagamento('', pic), (e) => e.code === 'DADOS_INCOMPLETOS');

  // ---- payload (mesmo formato do formulário do Graint) ----
  const avisos = [];
  const payload = montarPayload({
    cnpj: '21948503000163', receita: brasil, categoriaFornecedor: { scaCode: 40 }, categoriaPagamento: { picCode: 100 },
    local: { olcCode: 1, olsCode: 4 }, tipoLogradouro: { satCode: 2 }, cidade: { citCode: 5103403, citName: 'CUIABÁ' }, aviso: (t) => avisos.push(t),
  });
  assert.deepEqual(payload, {
    supType: 'PJ', supName: 'CALLIBRA MT COMERCIO DE EQUIPAMENTOS LTDA', scaCode: 40, supDocument: '21.948.503/0001-63', supIE: '',
    supEmail: 'comercialms@callibra.com.br', supPhone: '(65) 9262-7101', supCellPhone: '', supContact: '', olcCode: 1, olsCode: 4,
    supCEP: '78070-300', staAbreviation: 'MT', citCode: 5103403, supCitName: 'CUIABÁ', supCitUF: 'MT', supDistrict: 'JARDIM CALIFORNIA',
    satCode: 2, supAddress: 'GENERAL MELLO', supAddressNumber: '3589', supAddressComplement: 'SALA 2', bnkCode: '', supAgencyNumber: '',
    supAccountNumber: '', supMaxInvoiceValue: '0', supBiled: '', supTaxesCredits: '', supShowMobile: '', supVehicleTracker: 'N', picCode: 100,
  });
  assert.equal(avisos.length, 0);
  const semNumero = montarPayload({
    cnpj: '21948503000163', receita: { ...brasil, numero: 'S/N' }, categoriaFornecedor: { scaCode: 40 }, categoriaPagamento: { picCode: 100 },
    local: { olcCode: 1, olsCode: 4 }, tipoLogradouro: { satCode: 2 }, cidade: { citCode: 1, citName: 'X' }, aviso: (t) => avisos.push(t),
  });
  assert.equal(semNumero.supAddressNumber, '0', 'S/N vira 0 (o Graint exige número)');
  assert.equal(avisos.length, 1);

  // ---- consulta na Receita: BrasilAPI -> ReceitaWS; 404 nas duas = CNPJ não existe ----
  const resp = (status, json) => ({ status, ok: status >= 200 && status < 300, json: async () => json });
  const ok = await consultarReceita('21948503000163', { fetchImpl: async (url) => (url.includes('brasilapi') ? resp(200, { razao_social: 'CALLIBRA', situacao_cadastral: 2 }) : assert.fail('não devia chamar a segunda fonte')) });
  assert.equal(ok.fonte, 'brasilapi');
  const urls = [];
  const fallback = await consultarReceita('21948503000163', {
    fetchImpl: async (url) => { urls.push(new URL(url).host); return url.includes('brasilapi') ? resp(503, {}) : resp(200, { status: 'OK', nome: 'CALLIBRA', situacao: 'ATIVA' }); },
  });
  assert.equal(fallback.fonte, 'receitaws');
  assert.deepEqual(urls, ['brasilapi.com.br', 'receitaws.com.br']);
  await assert.rejects(() => consultarReceita('21948503000163', { fetchImpl: async () => resp(404, {}) }), (e) => e.code === 'CNPJ_NAO_ENCONTRADO');
  await assert.rejects(() => consultarReceita('21948503000163', { fetchImpl: async () => resp(500, {}) }), (e) => e.code === 'RECEITA_INDISPONIVEL', 'fora do ar = tenta de novo depois');

  // ---- ViaCEP completa o que a Receita não trouxe ----
  const completo = await completarPeloCep({ ...brasil, bairro: '', ibge: '' }, { fetchImpl: async () => resp(200, { bairro: 'Jardim Califórnia', ibge: '5103403', logradouro: 'Avenida General Mello', localidade: 'Cuiabá', uf: 'MT' }) });
  assert.equal(completo.bairro, 'JARDIM CALIFÓRNIA');
  assert.equal(completo.ibge, '5103403');
  assert.equal(completo.logradouro, 'GENERAL MELLO', 'o que a Receita já trouxe não é trocado');
  const intacto = await completarPeloCep(brasil, { fetchImpl: async () => assert.fail('nada a completar') });
  assert.equal(intacto, brasil);
  const viacepFora = await completarPeloCep({ ...brasil, bairro: '' }, { fetchImpl: async () => resp(500, {}) });
  assert.equal(viacepFora.bairro, '', 'ViaCEP fora do ar não derruba o cadastro');

  console.log('test-cadastrar-fornecedor: ok');
})().catch((error) => { console.error(error); process.exit(1); });
