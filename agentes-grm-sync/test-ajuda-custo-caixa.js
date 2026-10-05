'use strict';
// Regras do agente sync-ajuda-custo-caixa (sem abrir o GRM). Rodar: node test-ajuda-custo-caixa.js
const assert = require('assert');
const {
  dataLancamentoBr, descricaoGrm, brMoneyText, movimentoDaLinha, avaliarExistente, linhaTemValor,
} = require('./grm-ajuda-custo-caixa-regras');

// --- data: 'YYYY-MM-DD' (coluna date) -> 'DD/MM/YYYY' (campo Data do GRM)
assert.equal(dataLancamentoBr({ data_lancamento: '2026-10-15' }), '15/10/2026');
assert.equal(dataLancamentoBr({ data_lancamento: '2026-10-15T00:00:00+00:00' }), '15/10/2026');
assert.throws(() => dataLancamentoBr({ data_lancamento: null }), /Data de lançamento inválida/);
assert.throws(() => dataLancamentoBr({ data_lancamento: '15/10/2026' }), /Data de lançamento inválida/);

// --- descrição final já vem da RPC ("<descrição do RH> - MM/AAAA")
assert.equal(descricaoGrm({ descricao_grm: '  Auxílio moradia - 10/2026 ' }), 'Auxílio moradia - 10/2026');
assert.equal(descricaoGrm({ descricao_grm: 'x'.repeat(300) }).length, 250);
assert.throws(() => descricaoGrm({ descricao_grm: '   ' }), /sem descrição/);

assert.equal(brMoneyText(1234.5), '1.234,50');
assert.equal(brMoneyText(300), '300,00');

// Linhas como o agente lê da lista do Caixa (texto da linha + células).
const adiantamento = {
  text: '15/10/2026 Auxílio moradia - 10/2026 1.234,50 Adiantamento',
  cells: ['15/10/2026', 'Auxílio moradia - 10/2026', '1.234,50'],
};
const comprovante = {
  text: '15/10/2026 Auxílio moradia - 10/2026 Ajuda de Custo Cupom Fiscal 0 1.234,50',
  cells: ['15/10/2026', 'Auxílio moradia - 10/2026', 'Ajuda de Custo', 'Cupom Fiscal', '0', '1.234,50'],
};
const jobAd = { movimento: 'ADIANTAMENTO', valor: 1234.5 };
const jobComp = { movimento: 'COMPROVANTE', valor: 1234.5 };

// --- só o Comprovante tem a célula de categoria
assert.equal(movimentoDaLinha(adiantamento), 'ADIANTAMENTO');
assert.equal(movimentoDaLinha(comprovante), 'COMPROVANTE');
assert.equal(movimentoDaLinha({ text: 'x', cells: ['Ajuda de Custo mensal'] }), 'ADIANTAMENTO'); // célula só contém, não é igual
assert.equal(linhaTemValor(adiantamento, 1234.5), true);
assert.equal(linhaTemValor(adiantamento, 1000), false);

// --- duplicidade: os dois movimentos têm a mesma descrição e NÃO podem se confundir
assert.deepEqual(avaliarExistente([], jobAd), { acao: 'CRIAR' });
assert.deepEqual(avaliarExistente([], jobComp), { acao: 'CRIAR' });

// Adiantamento já lançado: o Comprovante (mesma descrição) ainda precisa ser criado
assert.deepEqual(avaliarExistente([adiantamento], jobComp), { acao: 'CRIAR' });
// ...e o Adiantamento é visto como já existente (não duplica)
assert.equal(avaliarExistente([adiantamento], jobAd).acao, 'JA_EXISTE');
// Comprovante lançado e Adiantamento não: o Adiantamento ainda precisa ser criado
assert.deepEqual(avaliarExistente([comprovante], jobAd), { acao: 'CRIAR' });
assert.equal(avaliarExistente([comprovante], jobComp).acao, 'JA_EXISTE');
// Os dois já lançados: cada um vê o seu
assert.equal(avaliarExistente([adiantamento, comprovante], jobAd).row, adiantamento);
assert.equal(avaliarExistente([adiantamento, comprovante], jobComp).row, comprovante);

// Mesmo tipo e descrição com valor diferente: bloqueia em vez de duplicar
const outroValor = { ...adiantamento, text: adiantamento.text.replace('1.234,50', '999,00'), cells: ['15/10/2026', 'Auxílio moradia - 10/2026', '999,00'] };
const diverg = avaliarExistente([outroValor], jobAd);
assert.equal(diverg.acao, 'DIVERGENTE');
assert.equal(diverg.rows.length, 1);
// ...mas valor diferente em OUTRO tipo não bloqueia
assert.deepEqual(avaliarExistente([outroValor], jobComp), { acao: 'CRIAR' });

// Tipo da Despesa configurável (GRM_AJUDA_CUSTO_CAIXA_TIPO_DESPESA)
const compOutroTipo = { text: 'x', cells: ['Auxílio', 'Auxilio Moradia', '1.234,50'] };
assert.equal(movimentoDaLinha(compOutroTipo, 'Auxilio Moradia'), 'COMPROVANTE');
assert.equal(movimentoDaLinha(compOutroTipo), 'ADIANTAMENTO');

console.log('test-ajuda-custo-caixa: ok');
