'use strict';
// Regras da NFS-e do hotel (sem GRM, sem Supabase). Rodar: node test-nf-hospedagem.js
const assert = require('assert');
const { isHospedagemRow, coordenacaoPrincipal, descricaoHospedagem, applyHospedagemRules } = require('./grm-nf-hospedagem-regras');

assert.equal(isHospedagemRow({ setor: 'HOSPEDAGEM' }), true);
assert.equal(isHospedagemRow({ setor: 'FROTAS' }), false);

const ctx = { codigo: 'HOUT01', hotel: 'Hotel Girassol', checkin: '2026-11-03', checkout: '2026-11-06', itens: [{ nome: 'Ana', coordenacao: 'SORRISO', diarias: 3 }, { nome: 'Carla', coordenacao: 'CUIABÁ', diarias: 2 }] };
assert.deepEqual(coordenacaoPrincipal(ctx.itens), { coordenacao: 'SORRISO', outras: ['CUIABÁ'] });
assert.equal(descricaoHospedagem(ctx), 'Hospedagem HOUT01 - Hotel Girassol - 03/11 a 06/11 - Ana, Carla');
const data = applyHospedagemRules({ valor_total: 100 }, ctx);
assert.equal(data.rateio.identificacao, 'SORRISO');
assert.equal(data.rateio.valor, 100);
assert.equal(data.categoria, 'HOSPEDAGEM');
console.log('test-nf-hospedagem: ok');
