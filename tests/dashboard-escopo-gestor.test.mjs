import test from 'node:test';
import assert from 'node:assert/strict';
import { calcularEscopoGestor, chaveEscopo, somarMetasDasCoordenacoes } from '../assets/js/dashboardEscopoGestor.js';

// metas_producao.regional de 10/2026 (grafia exata das coordenações no banco).
const REGIONAIS = [
  'BAHIA', 'CASCAVEL', 'GOIAS', 'LONDRINA', 'MARANHAO', 'MARINGA E TERMINAIS', 'MATO GROSSO DO SUL',
  'MATO GROSSO MT1', 'MATO GROSSO MT2', 'MATO GROSSO MT3 - CONFRESA', 'MATO GROSSO MT3 - QUERENCIA',
  'MATO GROSSO MT4', 'MINAS GERAIS', 'PARA', 'PONTA GROSSA', 'RIO GRANDE DO SUL', 'SÃO PAULO', 'TOCANTINS',
];

const escopo = (principal, supervisoes) => calcularEscopoGestor({ principal, supervisoes, regionaisMetas: REGIONAIS });

test('Marco: 10 supervisões de MT1 a MT4 viram 5 coordenações, a principal primeiro', () => {
  const { coordenacoes, supervisoes } = escopo('MATO GROSSO MT1', [
    'MATO GROSSO MT1 - Geral', 'MATO GROSSO MT1 - Lucas do Rio Verde/Nova Mutum', 'MATO GROSSO MT1 - Sinop',
    'MATO GROSSO MT1 - Sorriso', 'MATO GROSSO MT2 - Campo Verde', 'MATO GROSSO MT2 - Leste', 'MATO GROSSO MT2 - Sul',
    'MATO GROSSO MT3 - Confresa', 'MATO GROSSO MT3 - Querencia', 'MATO GROSSO MT4 - Geral',
  ]);
  assert.deepEqual(coordenacoes, [
    'MATO GROSSO MT1', 'MATO GROSSO MT2', 'MATO GROSSO MT3 - CONFRESA', 'MATO GROSSO MT3 - QUERENCIA', 'MATO GROSSO MT4',
  ]);
  assert.equal(supervisoes.length, 10);
});

test('MT3: Confresa e Querência são coordenações separadas, sem uma engolir a outra', () => {
  const { coordenacoes } = escopo('MATO GROSSO MT3 - QUERENCIA', ['MATO GROSSO MT3 - Confresa', 'MATO GROSSO MT3 - Querencia']);
  assert.deepEqual(coordenacoes, ['MATO GROSSO MT3 - QUERENCIA', 'MATO GROSSO MT3 - CONFRESA']);
});

test('várias supervisões da mesma coordenação continuam sendo uma coordenação só', () => {
  assert.deepEqual(
    escopo('MATO GROSSO MT2', ['MATO GROSSO MT2 - Campo Verde', 'MATO GROSSO MT2 - Leste', 'MATO GROSSO MT2 - Sul']).coordenacoes,
    ['MATO GROSSO MT2'],
  );
  assert.deepEqual(escopo('MINAS GERAIS', ['MINAS GERAIS - Geral', 'MINAS GERAIS - Norte', 'MINAS GERAIS - Divisa Goiás']).coordenacoes, ['MINAS GERAIS']);
  assert.deepEqual(escopo('GOIAS', ['GOIAS 1 - Rio Verde', 'GOIAS 2 - Jataí']).coordenacoes, ['GOIAS']);
});

test('"SP - Avaré" é da coordenação SÃO PAULO e não duplica a principal', () => {
  assert.deepEqual(escopo('SÃO PAULO', ['SP - Araçatuba', 'SP - Avaré', 'SP - Cândido Mota']).coordenacoes, ['SÃO PAULO']);
  // Sem principal cadastrada, a coordenação vem só das supervisões.
  assert.deepEqual(escopo('', ['SP - Avaré']).coordenacoes, ['SÃO PAULO']);
});

test('nomes sem hífen e com outra caixa/acentuação casam com a grafia do banco', () => {
  assert.deepEqual(escopo('LONDRINA', ['Londrina']).coordenacoes, ['LONDRINA']);
  assert.deepEqual(escopo('', ['Maringa e Terminais']).coordenacoes, ['MARINGA E TERMINAIS']);
  assert.deepEqual(escopo('', ['CASCAVEL - Campo Mourão', 'CASCAVEL - Geral']).coordenacoes, ['CASCAVEL']);
});

test('MATO GROSSO DO SUL não é confundido com Mato Grosso', () => {
  assert.deepEqual(escopo('', ['MATO GROSSO DO SUL - Geral']).coordenacoes, ['MATO GROSSO DO SUL']);
});

test('supervisão que não é coordenação das metas é ignorada, mas fica na lista de supervisões', () => {
  const r = escopo('MATO GROSSO MT1', ['AGROTRADER', 'Master', 'GERAL - Frota', 'MATO GROSSO MT1 - Sinop']);
  assert.deepEqual(r.coordenacoes, ['MATO GROSSO MT1']);
  assert.equal(r.supervisoes.length, 4);
});

test('coordenação principal sem meta no mês continua valendo (Atendimento Geral e Estoque)', () => {
  assert.deepEqual(escopo('GERAL', ['GERAL - Administrativo', 'Geral - Estoque']).coordenacoes, ['GERAL']);
});

test('sem nada cadastrado devolve escopo vazio', () => {
  assert.deepEqual(escopo('', []), { coordenacoes: [], supervisoes: [] });
  assert.deepEqual(calcularEscopoGestor(), { coordenacoes: [], supervisoes: [] });
});

test('chaveEscopo: igual para o mesmo escopo em outra ordem, diferente para escopos diferentes', () => {
  const a = chaveEscopo({ coordenacoes: ['MATO GROSSO MT1', 'MATO GROSSO MT2'], supervisoes: ['MATO GROSSO MT1 - Sinop', 'MATO GROSSO MT2 - Leste'] });
  const b = chaveEscopo({ coordenacoes: ['MATO GROSSO MT2', 'MATO GROSSO MT1'], supervisoes: ['MATO GROSSO MT2 - Leste', 'MATO GROSSO MT1 - Sinop'] });
  assert.equal(a, b);

  // Mesma coordenação, supervisões diferentes (conta de O.S. diferente) não podem dividir cache.
  const soSinop = chaveEscopo({ coordenacoes: ['MATO GROSSO MT1'], supervisoes: ['MATO GROSSO MT1 - Sinop'] });
  const soSorriso = chaveEscopo({ coordenacoes: ['MATO GROSSO MT1'], supervisoes: ['MATO GROSSO MT1 - Sorriso'] });
  assert.notEqual(soSinop, soSorriso);

  // Uma coordenação a mais muda a chave.
  assert.notEqual(chaveEscopo({ coordenacoes: ['MATO GROSSO MT1'], supervisoes: [] }), chaveEscopo({ coordenacoes: ['MATO GROSSO MT1', 'MATO GROSSO MT2'], supervisoes: [] }));

  assert.equal(chaveEscopo({ coordenacoes: [], supervisoes: ['x'] }), 'sem_regional');
});

const METAS = [
  { regional: 'MATO GROSSO MT1', meta_tons: 1000 }, { regional: 'MATO GROSSO MT2', meta_tons: 800 },
  { regional: 'MATO GROSSO MT3 - CONFRESA', meta_tons: 400 }, { regional: 'MATO GROSSO MT3 - QUERENCIA', meta_tons: 500 },
  { regional: 'MATO GROSSO MT4', meta_tons: 600 }, { regional: 'CASCAVEL', meta_tons: 700 },
];

test('somarMetasDasCoordenacoes soma só as coordenações do gestor', () => {
  assert.equal(somarMetasDasCoordenacoes(METAS, ['MATO GROSSO MT1', 'MATO GROSSO MT2', 'MATO GROSSO MT3 - CONFRESA', 'MATO GROSSO MT3 - QUERENCIA', 'MATO GROSSO MT4']), 3300);
  assert.equal(somarMetasDasCoordenacoes(METAS, ['MATO GROSSO MT3 - QUERENCIA']), 500);
});

test('somarMetasDasCoordenacoes: sem linha exata usa o prefixo, sem contar a mesma meta duas vezes', () => {
  assert.equal(somarMetasDasCoordenacoes(METAS, ['MATO GROSSO MT1 - Sinop']), 1000);
  assert.equal(somarMetasDasCoordenacoes(METAS, ['MATO GROSSO MT1', 'MATO GROSSO MT1 - Sinop']), 1000);
});

test('somarMetasDasCoordenacoes devolve null quando nenhuma coordenação tem meta', () => {
  assert.equal(somarMetasDasCoordenacoes(METAS, ['GERAL']), null);
  assert.equal(somarMetasDasCoordenacoes(METAS, []), null);
  assert.equal(somarMetasDasCoordenacoes([], ['CASCAVEL']), null);
});
