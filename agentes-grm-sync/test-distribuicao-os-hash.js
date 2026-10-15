'use strict';
// Teste do controle por mudança da distribuição de O.S. (grm-distribuicao-os-hash.js):
// só vai ao GRM a supervisão/data cuja Programação mudou desde a última aplicação confirmada.
const assert = require('assert');
const { normalizar, chaveGrupo, hashGrupo, separarGrupos } = require('./grm-distribuicao-os-hash');

const prog = (...nomes) => nomes.map((nome_colaborador) => ({ nome_colaborador }));
const grupo = (coordenacao, data, itens) => ({
  data,
  coordenacao,
  itens: itens.map(([numero, programados, extra = {}]) => ({ os: { numero_os: numero, ...extra }, programados })),
});

// 1) normalização e chave: a mesma que o agente grava em grm_distribuicao_os_estado
assert.equal(normalizar('Maringá e  Terminais'), 'MARINGA E TERMINAIS');
assert.equal(chaveGrupo({ data: '2026-10-15T00:00:00Z', coordenacao: 'Maringá e Terminais' }), '2026-10-15|MARINGA E TERMINAIS');

// 2) o hash não depende da ordem, de maiúsculas/acentos nem de nomes repetidos
const base = grupo('Maringa e Terminais', '2026-10-15', [
  [94001, prog('João Silva', 'Maria Souza')],
  [94002, prog('Pedro Lima')],
]);
const hBase = hashGrupo(base);
assert.equal(hBase, hashGrupo(grupo('MARINGÁ E TERMINAIS', '2026-10-15', [
  [94002, prog('PEDRO LIMA')],
  [94001, prog('maria souza', 'joao silva', 'Maria Souza')],
])), 'ordem, caixa, acento e repetição não mudam o hash');

// 3) campos que não decidem a distribuição não entram no hash (a própria aplicação muda status_conferencia)
assert.equal(hBase, hashGrupo(grupo('Maringa e Terminais', '2026-10-15', [
  [94001, prog('João Silva', 'Maria Souza'), { status_conferencia: 'AJUSTADA', conferido_em: 'x' }],
  [94002, prog('Pedro Lima'), { status_conferencia: 'PENDENTE' }],
])), 'status e horários não entram no hash');

// 4) mudanças que decidem o resultado mudam o hash
const alterados = [
  grupo('Maringa e Terminais', '2026-10-15', [[94001, prog('João Silva')], [94002, prog('Pedro Lima')]]), // saiu uma pessoa
  grupo('Maringa e Terminais', '2026-10-15', [[94001, prog('João Silva', 'Maria Souza', 'Ana')], [94002, prog('Pedro Lima')]]), // entrou
  grupo('Maringa e Terminais', '2026-10-15', [[94001, prog('João Silva', 'Maria Souza')], [94002, prog('Pedro Lima')], [94003, prog()]]), // O.S. nova
  grupo('Maringa e Terminais', '2026-10-15', [[94001, prog('João Silva', 'Maria Souza')]]), // O.S. saiu
  grupo('Maringa e Terminais', '2026-10-16', [[94001, prog('João Silva', 'Maria Souza')], [94002, prog('Pedro Lima')]]), // outra data
  grupo('Cascavel', '2026-10-15', [[94001, prog('João Silva', 'Maria Souza')], [94002, prog('Pedro Lima')]]), // outra supervisão
  grupo('Maringa e Terminais', '2026-10-15', [[94001, prog('João Silva', 'Maria Souza')], [94002, prog()]]), // O.S. ficou sem ninguém
];
for (const g of alterados) assert.notEqual(hashGrupo(g), hBase, 'mudança tem de alterar o hash');

// 5) separarGrupos
const g1 = base;
const g2 = grupo('Cascavel', '2026-10-15', [[95001, prog('Ana')]]);
const estado = new Map([
  [chaveGrupo(g1), { hash_aplicado: hashGrupo(g1), aplicado_em: new Date().toISOString() }],
]);
let r = separarGrupos([g1, g2], estado);
assert.deepEqual(r.inalterados.map((x) => x.grupo), [g1], 'hash igual = pulado (nenhuma chamada ao GRM)');
assert.deepEqual(r.aProcessar.map((x) => x.grupo), [g2], 'sem estado guardado = processa');
assert.equal(r.aProcessar[0].hash, hashGrupo(g2), 'devolve o hash para gravar depois da aplicação');

const g1mudou = grupo('Maringa e Terminais', '2026-10-15', [[94001, prog('João Silva')], [94002, prog('Pedro Lima')]]);
r = separarGrupos([g1mudou], estado);
assert.equal(r.aProcessar.length, 1, 'Programação mudou = processa');
assert.equal(r.inalterados.length, 0);

r = separarGrupos([g1, g2], estado, { forcar: true });
assert.equal(r.aProcessar.length, 2, 'rodada de novo dia força todos');
assert.equal(r.inalterados.length, 0);

r = separarGrupos([g1, g2], new Map());
assert.equal(r.aProcessar.length, 2, 'primeira rodada (sem estado) processa tudo uma vez');

// 6) reverificação opcional (desligada por padrão)
const antigo = new Map([[chaveGrupo(g1), { hash_aplicado: hashGrupo(g1), aplicado_em: new Date(Date.now() - 5 * 3600000).toISOString() }]]);
assert.equal(separarGrupos([g1], antigo).inalterados.length, 1, 'padrão: nunca reprocessa grupo inalterado');
assert.equal(separarGrupos([g1], antigo, { reverificarHoras: 6 }).inalterados.length, 1, 'ainda dentro do prazo');
assert.equal(separarGrupos([g1], antigo, { reverificarHoras: 4 }).aProcessar.length, 1, 'passou do prazo: reprocessa');
const semData = new Map([[chaveGrupo(g1), { hash_aplicado: hashGrupo(g1) }]]);
assert.equal(separarGrupos([g1], semData, { reverificarHoras: 4 }).aProcessar.length, 1, 'sem data de aplicação: reprocessa');

// 7) contas do dia: 34 supervisões/data, nada mudou = 0 chamadas; 1 mudou = 1 grupo
const muitos = Array.from({ length: 34 }, (_, i) => grupo(`Supervisao ${i}`, '2026-10-15', [[1000 + i, prog(`Pessoa ${i}`)]]));
const estadoTodos = new Map(muitos.map((g) => [chaveGrupo(g), { hash_aplicado: hashGrupo(g), aplicado_em: new Date().toISOString() }]));
assert.equal(separarGrupos(muitos, estadoTodos).aProcessar.length, 0, '34 supervisões sem mudança: nenhuma chamada');
const um = muitos.map((g, i) => (i === 7 ? grupo('Supervisao 7', '2026-10-15', [[1007, prog('Pessoa 7', 'Nova Pessoa')]]) : g));
assert.equal(separarGrupos(um, estadoTodos).aProcessar.length, 1, 'só a supervisão alterada vai ao GRM');

console.log('ok test-distribuicao-os-hash');
