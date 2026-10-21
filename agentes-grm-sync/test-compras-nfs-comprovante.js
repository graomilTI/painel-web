'use strict';
// Testes da decisão de baixa quando UM comprovante paga MAIS DE UMA NF do Compras (sem rede, sem Supabase).
const assert = require('assert');
const { decidirGrupoNfs } = require('./grmserver-lancar-notas-fiscais-api');

const nf = (extra = {}) => ({
  chave: 'compras/nf/2026/a.pdf', status: 'LANCADO', pinCode: '120500', valor: 1000, doc: '1001',
  cnpj: '12.345.678/0001-90', empresa: 'GRAO1000', parcelas: 1, arquivo: 'a.pdf', ...extra,
});

// ---- tudo lançado, mesmo favorecido/empresa: baixa única com um item por NF ----
{
  const r = decidirGrupoNfs([nf({ atual: true, pinCode: '120500', valor: 100.1 }), nf({ chave: 'b', pinCode: '120501', valor: 200.2, doc: '1002', arquivo: 'b.pdf' })]);
  assert.equal(r.estado, 'PRONTO');
  assert.equal(r.valorTotal, 300.3, 'soma sem erro de ponto flutuante');
  assert.deepEqual(r.itens, [
    { pinCode: '120500', valor: 100.1, pinDocNumber: '1001' },
    { pinCode: '120501', valor: 200.2, pinDocNumber: '1002' },
  ]);
}

// ---- a outra NF ainda não foi lançada: espera (a baixa sai quando a última for lançada) ----
for (const status of ['NOVO', 'PROCESSANDO', 'AGUARDANDO_DADOS', 'AGUARDANDO_CLASSIFICACAO', 'ERRO', 'SEM_FILA']) {
  const r = decidirGrupoNfs([nf({ atual: true }), nf({ chave: 'b', status, pinCode: null, arquivo: 'b.pdf' })]);
  assert.equal(r.estado, 'AGUARDANDO', `status ${status}`);
  assert.match(r.motivo, /b\.pdf/);
}

// ---- NF irmã que já existia no GRM (lançada à mão): não dá para agrupar sozinho ----
{
  const r = decidirGrupoNfs([nf({ atual: true }), nf({ chave: 'b', status: 'DUPLICADO', pinCode: null, arquivo: 'b.pdf' })]);
  assert.equal(r.estado, 'MANUAL');
  assert.match(r.motivo, /fora do agente/);
}

// ---- travas: favorecido, empresa, parcelas, valores ----
const par = (extraB) => [nf({ atual: true }), nf({ chave: 'b', pinCode: '120501', doc: '1002', arquivo: 'b.pdf', ...extraB })];
assert.equal(decidirGrupoNfs(par({ cnpj: '98.765.432/0001-10' })).estado, 'MANUAL', 'favorecidos diferentes');
assert.equal(decidirGrupoNfs(par({ cnpj: null })).estado, 'MANUAL', 'CNPJ não lido');
assert.equal(decidirGrupoNfs(par({ empresa: 'OUTRA EMPRESA' })).estado, 'MANUAL', 'empresas diferentes');
assert.equal(decidirGrupoNfs(par({ parcelas: 3 })).estado, 'MANUAL', 'NF parcelada');
assert.equal(decidirGrupoNfs(par({ valor: 0 })).estado, 'MANUAL', 'valor não lido');
assert.equal(decidirGrupoNfs(par({ pinCode: null })).estado, 'MANUAL', 'sem código do GRM');
assert.equal(decidirGrupoNfs(par({ empresa: 'grao1000 ' })).estado, 'PRONTO', 'empresa igual ignorando caixa/espaço');
assert.equal(decidirGrupoNfs(par({ cnpj: '12345678000190' })).estado, 'PRONTO', 'CNPJ igual com e sem máscara');

// ---- três NFs ----
{
  const r = decidirGrupoNfs([nf({ atual: true, valor: 10 }), nf({ chave: 'b', pinCode: '2', valor: 20 }), nf({ chave: 'c', pinCode: '3', valor: 30 })]);
  assert.equal(r.estado, 'PRONTO');
  assert.equal(r.valorTotal, 60);
  assert.equal(r.itens.length, 3);
}

console.log('test-compras-nfs-comprovante: OK');
