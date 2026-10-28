'use strict';
// Testes da decisão de baixa quando UM comprovante paga MAIS DE UMA NF do Compras (sem rede, sem Supabase).
const assert = require('assert');
const { decidirGrupoNfs, ratearPagamento } = require('./grmserver-lancar-notas-fiscais-api');

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

// ---- desconto/juros quando o pago diverge das NFs (28/10) ----
{
  const um = ratearPagamento([{ valor: 1000, pinCode: 'a' }], 1000);
  assert.equal(um.ok, true);
  assert.deepEqual([um.itens[0].valor, um.itens[0].juros, um.itens[0].desconto], [1000, 0, 0], 'igual: sem ajuste');
  assert.equal(um.itens[0].pinCode, 'a', 'mantém os campos do item');

  const menor = ratearPagamento([{ valor: 1000 }], 985.5);
  assert.deepEqual([menor.itens[0].valor, menor.itens[0].juros, menor.itens[0].desconto], [985.5, 0, 14.5], 'pago menor = desconto');

  const maior = ratearPagamento([{ valor: 1000 }], 1012.34);
  assert.deepEqual([maior.itens[0].valor, maior.itens[0].juros, maior.itens[0].desconto], [1012.34, 12.34, 0], 'pago maior = juros');

  // rateio em centavos: a soma dos itens fecha exatamente com o comprovante
  const tres = ratearPagamento([{ valor: 100 }, { valor: 100 }, { valor: 100 }], 299.99);
  assert.equal(tres.ok, true);
  assert.equal(Math.round(tres.itens.reduce((s, i) => s + i.valor, 0) * 100), 29999);
  assert.equal(tres.desconto, 0.01);
  tres.itens.forEach((i) => assert.ok(i.juros === 0 && i.desconto >= 0));

  assert.equal(ratearPagamento([{ valor: 1000 }], 850).ok, false, '15% acima do limite de 10%');
  assert.equal(ratearPagamento([{ valor: 1000 }], 850, 20).ok, true, 'limite configurável');
  assert.equal(ratearPagamento([{ valor: 1000 }], null).ok, false, 'valor do comprovante não lido');
  assert.equal(ratearPagamento([{ valor: 0 }], 10).ok, false, 'NF sem valor');
}

console.log('test-compras-nfs-comprovante: OK');
