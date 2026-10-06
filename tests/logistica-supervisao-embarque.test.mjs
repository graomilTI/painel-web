import assert from 'node:assert/strict';
import test from 'node:test';

import { avaliarSupervisao, chaveSupervisao, supervisaoEsperada } from '../assets/js/logistica-supervisao-embarque-regra.js';

// Cadastro de Diamantino/MT em 06/10/2026: só o Armazém AFS tem supervisão; as fazendas não.
const diamantino = [
  { nome_local: 'AFS ARMAZÉM GERAIS LTDA - EMILIO ANTÔNIO FERRARI RAMOS', tipo_local: 'Armazém / Silo', supervisao: 'MATO GROSSO MT4 - GERAL' },
  { nome_local: 'SILO SAO MICHEL', tipo_local: 'Armazém / Silo', supervisao: null },
  { nome_local: 'FAZENDA ESTRELA D ALVA', tipo_local: 'Fazenda', supervisao: null },
  { nome_local: 'FAZENDA TUCANO', tipo_local: 'Fazenda', supervisao: '' },
];

const buri = [
  { nome_local: 'ARMAZEM JEQUITIBA', tipo_local: 'Armazém / Silo', supervisao: 'SP - AVARE' },
  { nome_local: 'BURIGRÃOS', tipo_local: 'Armazém / Silo', supervisao: null },
  { nome_local: 'FAZENDA ESPLANADA', tipo_local: 'Fazenda', supervisao: null },
];

test('supervisão do próprio ponto vale mais que a da cidade', () => {
  const pontos = [...buri, { nome_local: 'COOP X', tipo_local: 'Armazém / Silo', supervisao: 'SP - Cândido Mota' }];
  assert.equal(supervisaoEsperada(pontos, 'COOP X', null), 'SP - Cândido Mota');
});

test('ponto sem supervisão herda da cidade só de pontos do mesmo tipo (Buri armazém -> Avaré)', () => {
  assert.equal(supervisaoEsperada(buri, 'BURIGRÃOS', null), 'SP - AVARE');
});

test('Fazenda em Diamantino NÃO herda a supervisão do Armazém (O.S. 94879/94881)', () => {
  assert.equal(supervisaoEsperada(diamantino, 'FAZENDA ESTRELA D ALVA', null), null);
  const r = avaliarSupervisao({ pontos: diamantino, nome: 'FAZENDA ESTRELA D ALVA', regional: 'MATO GROSSO MT1 - Lucas do Rio Verde/Nova Mutum', cidade: 'Diamantino', uf: 'MT' });
  assert.equal(r.ok, true);
});

test('Armazém em Diamantino sem supervisão herda MT4 e bloqueia MT1', () => {
  const r = avaliarSupervisao({ pontos: diamantino, nome: 'SILO SAO MICHEL', regional: 'MATO GROSSO MT1 - Lucas do Rio Verde/Nova Mutum', cidade: 'Diamantino', uf: 'MT' });
  assert.equal(r.ok, false);
  assert.equal(r.esperada, 'MATO GROSSO MT4 - GERAL');
  assert.match(r.motivo, /MATO GROSSO MT4 - GERAL/);
  assert.match(r.motivo, /MT1 - Lucas do Rio Verde/);
});

test('O.S. 94523: Buri/Armazém pedida em Araçatuba é bloqueada (cadastro diz Avaré)', () => {
  const r = avaliarSupervisao({ pontos: buri, nome: 'BURIGRÃOS', regional: 'SP - Araçatuba', cidade: 'Buri', uf: 'SP' });
  assert.equal(r.ok, false);
  assert.equal(r.esperada, 'SP - AVARE');
});

test('mesma supervisão com caixa, acento e espaços diferentes passa', () => {
  const r = avaliarSupervisao({ pontos: buri, nome: 'BURIGRÃOS', regional: '  sp -  Avaré ', cidade: 'Buri', uf: 'SP' });
  assert.equal(r.ok, true);
  assert.equal(chaveSupervisao('SP - AVARE'), chaveSupervisao('sp - Avaré'));
});

test('cidade com supervisões diferentes no mesmo tipo: não afirma nada', () => {
  const pontos = [
    { nome_local: 'A', tipo_local: 'Armazém / Silo', supervisao: 'SP - Avaré' },
    { nome_local: 'B', tipo_local: 'Armazém / Silo', supervisao: 'SP - Araçatuba' },
    { nome_local: 'C', tipo_local: 'Armazém / Silo', supervisao: null },
  ];
  assert.equal(supervisaoEsperada(pontos, 'C', null), null);
});

test('local fora do cadastro usa o tipo do espelho do GRM', () => {
  assert.equal(supervisaoEsperada(buri, 'ARMAZEM NOVO', 'Armazém / Silo'), 'SP - AVARE');
  assert.equal(supervisaoEsperada(buri, 'ARMAZEM NOVO', 'Fazenda'), null);
  assert.equal(supervisaoEsperada(buri, 'ARMAZEM NOVO', null), null);
});

test('sem pontos ou sem supervisão escolhida não bloqueia', () => {
  assert.equal(avaliarSupervisao({ pontos: [], nome: 'X', regional: 'SP - Avaré', cidade: 'Buri', uf: 'SP' }).ok, true);
  assert.equal(avaliarSupervisao({ pontos: buri, nome: 'BURIGRÃOS', regional: '', cidade: 'Buri', uf: 'SP' }).ok, true);
});
