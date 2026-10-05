'use strict';
const assert = require('assert');
const { avaliarRegra } = require('./grm-despesas-evidencia');
const { decidir, grupoAprovavel } = require('./grm-sync-aprovar-pendencias');

let seq = 9000;
function lanc(over) {
  seq += 1;
  return {
    ofmCode: seq, ofmType: 'D', ofmStatus: 'P', staCode: 7, staName: 'Fulano de Tal',
    oexName: 'Almoço', oexCode: 13, ofmValue: 30, ofmDate: '2026-10-02', ofmDescription: '', ...over,
  };
}
const NOME = 'FULANO DE TAL';
const evSem = { nomes: new Set(), laudos: new Map() };
const evMov = { nomes: new Set([NOME]), laudos: new Map() };
const evLaudo = (...horas) => ({ nomes: new Set(), laudos: new Map([[NOME, horas.map((h) => ({ laudo: 'L1', os: '9', hora: h, local: `2026-10-02 ${String(h).padStart(2, '0')}:10:00` }))]]) });
const dec = (row, ativos, ev) => decidir(row, [row, ...ativos], ev);

// despesas tratadas
assert.equal(grupoAprovavel(lanc({ oexName: 'Café' })), 'CAFE');
assert.equal(grupoAprovavel(lanc({ oexName: 'Salário de Intermitente' })), null);
assert.equal(grupoAprovavel(lanc({ oexName: 'Serviços Terceirizados', ofmValue: 30 })), null);

// Almoço: movimento no dia
assert.equal(dec(lanc({}), [], evMov).acao, 'APROVAR');
assert.equal(dec(lanc({}), [], evLaudo(11)).acao, 'APROVAR'); // laudo conta como movimento
assert.deepEqual(dec(lanc({}), [], evSem), { acao: 'MANTER', motivo: 'sem_embarque_na_data', refeicoes: undefined });

// Janta: laudo a partir das 19h; Café: laudo antes das 07h
assert.equal(dec(lanc({ oexName: 'Janta' }), [], evLaudo(19)).acao, 'APROVAR');
assert.equal(dec(lanc({ oexName: 'Janta' }), [], evLaudo(18)).motivo, 'sem_laudo_a_partir_das_19h_na_data');
assert.equal(dec(lanc({ oexName: 'Janta' }), [], evMov).motivo, 'sem_laudo_a_partir_das_19h_na_data'); // só movimento não basta
assert.equal(dec(lanc({ oexName: 'Café', ofmValue: 10 }), [], evLaudo(6)).acao, 'APROVAR');
assert.equal(dec(lanc({ oexName: 'Café', ofmValue: 10 }), [], evLaudo(8)).motivo, 'sem_laudo_antes_das_07h_na_data');

// Pernoite: movimento e sem Café/Almoço/Janta ativo no dia
assert.equal(dec(lanc({ oexName: 'Pernoite' }), [], evMov).acao, 'APROVAR');
{
  const almoco = lanc({ ofmStatus: 'A' });
  const r = dec(lanc({ oexName: 'Pernoite' }), [almoco], evMov);
  assert.equal(r.acao, 'MANTER');
  assert.equal(r.motivo, 'refeicao_lancada_no_dia');
  // refeição de outro dia ou de outro colaborador não bloqueia
  assert.equal(dec(lanc({ oexName: 'Pernoite' }), [lanc({ ofmDate: '2026-10-01' }), lanc({ staCode: 8 })], evMov).acao, 'APROVAR');
}
assert.equal(dec(lanc({ oexName: 'Pernoite' }), [], evSem).motivo, 'sem_embarque_na_data');

// valor fora do padrão fica para revisão (Almoço R$ 24,24; Pernoite R$ 10; Café R$ 30)
assert.equal(dec(lanc({ ofmValue: 24.24 }), [], evMov).motivo, 'valor_fora_do_padrao');
assert.equal(dec(lanc({ oexName: 'Pernoite', ofmValue: 10 }), [], evMov).motivo, 'valor_fora_do_padrao');
assert.equal(dec(lanc({ oexName: 'Café', ofmValue: 30 }), [], evLaudo(6)).motivo, 'valor_fora_do_padrao');

// outro lançamento ativo da mesma despesa no dia = duplicata: não aprova (é do agente de duplicadas)
{
  const outro = lanc({ ofmStatus: 'A' });
  assert.equal(dec(lanc({}), [outro], evMov).motivo, 'ha_outro_lancamento_ativo_no_dia');
  const terceirizadoAlmoco = lanc({ oexName: 'Serviços Terceirizados', ofmValue: 30, ofmStatus: 'A' });
  assert.equal(dec(lanc({}), [terceirizadoAlmoco], evMov).motivo, 'ha_outro_lancamento_ativo_no_dia'); // Terceirizados <= 45 conta como Almoço
  assert.equal(dec(lanc({}), [lanc({ staCode: 8, ofmStatus: 'A' }), lanc({ ofmDate: '2026-10-01', ofmStatus: 'A' }), lanc({ oexName: 'Janta', ofmStatus: 'A' })], evMov).acao, 'APROVAR');
}

// travas de observação (mesmas dos agentes que recusam)
assert.equal(dec(lanc({ ofmDescription: 'Janta' }), [], evMov).motivo, 'observacao_cita_outra_despesa');
assert.equal(dec(lanc({ ofmDescription: 'Almoço do Bruno, funcionário em treinamento' }), [], evMov).motivo, 'observacao_cita_outra_pessoa');
assert.equal(dec(lanc({ ofmDescription: 'almoço, diferença de valor' }), [], evMov).motivo, 'observacao_de_extra');
assert.equal(dec(lanc({ ofmDescription: 'Referente ao dia 28/09' }), [], evMov).motivo, 'observacao_cita_outra_data'); // é do agente de duplicadas
// observação comum não atrapalha
for (const obs of ['', 'Almoço', 'atender fazenda são Sebastião', 'Embarque Copasul Novo Horizonte do Sul', 'FAZENDA NAO FORNECE RECIBO']) {
  assert.equal(dec(lanc({ ofmDescription: obs }), [], evMov).acao, 'APROVAR', obs);
}
// data de hoje na observação ("referente ao dia 02/10" no próprio dia) não conta como outra data
assert.equal(dec(lanc({ ofmDescription: 'referente ao dia 02/10/2026' }), [], evMov).acao, 'APROVAR');

// avaliarRegra direto
assert.equal(avaliarRegra('ALMOCO', NOME, evMov).ok, true);
assert.equal(avaliarRegra('DIARIA', NOME, evMov).motivo, 'despesa_nao_tratada');

console.log('test-aprovar-pendencias: ok');
