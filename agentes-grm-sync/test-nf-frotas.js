'use strict';
// Regras da NF de manutenção de frota (sem GRM, sem Supabase). Rodar: node test-nf-frotas.js
const assert = require('assert');
const { isFrotasRow, descricaoFrotas, applyFrotasRules, codigoManutencao } = require('./grm-nf-frotas-regras');

assert.equal(isFrotasRow({ setor: 'FROTAS' }), true);
assert.equal(isFrotasRow({ setor: ' frotas ' }), true);
assert.equal(isFrotasRow({ setor: 'COMPRAS' }), false);
assert.equal(isFrotasRow(null), false);

const ctx = { numero: 7, os_numero: 'OS-000007', placa: 'ABC1D23', oficina: 'Auto Center Sorriso', descricao: 'Freio com ruído', coordenacao: 'MATO GROSSO' };
assert.equal(codigoManutencao(ctx), 'MAN-000007');
assert.equal(descricaoFrotas(ctx), 'Manutenção ABC1D23 - OS-000007 - Auto Center Sorriso - Freio com ruído');
assert.equal(descricaoFrotas({ numero: 9, placa: 'XYZ9K88' }), 'Manutenção XYZ9K88 - MAN-000009');
assert.equal(descricaoFrotas({ ...ctx, descricao: 'x'.repeat(400) }).length, 250);

// Rateio pela coordenação do veículo, com GERAL de reserva e valor igual ao da NF.
const data = applyFrotasRules({ valor_total: 1750.5, rateio: { data_participacao: '16/10/2026', tipo_participacao: 'Coordenação', identificacao: 'GERAL', valor: 1750.5 } }, ctx);
assert.equal(data.rateio.tipo_participacao, 'Coordenação');
assert.equal(data.rateio.identificacao, 'MATO GROSSO');
assert.equal(data.rateio.identificacao_fallback, 'GERAL');
assert.equal(data.rateio.valor, 1750.5);
assert.equal(data.rateio.data_participacao, '16/10/2026');
assert.equal(data.grupo_categoria, 'DESPESAS COM VEICULOS');
assert.equal(data.frotas.placa, 'ABC1D23');
assert.deepEqual(data.frotas.avisos, []);

// Categoria já decidida (ajustes manuais aplicam depois) não é sobrescrita pelo grupo padrão.
assert.equal(applyFrotasRules({ valor_total: 10, grupo_categoria: 'OUTRO GRUPO' }, ctx).grupo_categoria, 'OUTRO GRUPO');

// Veículo sem coordenação: GERAL e aviso.
const sem = applyFrotasRules({ valor_total: 99 }, { ...ctx, coordenacao: '  ' }, { fallback: 'GERAL' });
assert.equal(sem.rateio.identificacao, 'GERAL');
assert.match(sem.frotas.avisos[0], /sem coordenação/);

console.log('test-nf-frotas: ok');
