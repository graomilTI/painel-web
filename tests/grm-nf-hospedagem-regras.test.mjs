import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

// Regras da NFS-e do hotel no agente de lançamento (módulo puro; o agente roda no servidor, fora do git).
const require = createRequire(import.meta.url);
const { applyHospedagemRules, coordenacaoPrincipal, descricaoHospedagem, isHospedagemRow } = require('../agentes-grm-sync/grm-nf-hospedagem-regras.js');
const le = (caminho) => readFileSync(new URL(`../${caminho}`, import.meta.url), 'utf8');

const ctx = {
  codigo: 'HOUT01', hotel: 'Hotel Girassol', checkin: '2026-11-03', checkout: '2026-11-06',
  itens: [{ nome: 'Ana Souza', coordenacao: 'SORRISO', diarias: 3 }, { nome: 'Bruno Lima', coordenacao: 'SORRISO', diarias: 3 }, { nome: 'Carla Dias', coordenacao: 'CUIABÁ', diarias: 2 }],
};

test('só o setor HOSPEDAGEM usa as regras do hotel', () => {
  assert.equal(isHospedagemRow({ setor: 'HOSPEDAGEM' }), true);
  assert.equal(isHospedagemRow({ setor: ' hospedagem ' }), true);
  assert.equal(isHospedagemRow({ setor: 'FROTAS' }), false);
  assert.equal(isHospedagemRow(null), false);
});

test('a coordenação com mais diárias leva o rateio; empate vai por ordem alfabética', () => {
  assert.deepEqual(coordenacaoPrincipal(ctx.itens), { coordenacao: 'SORRISO', outras: ['CUIABÁ'] });
  assert.deepEqual(coordenacaoPrincipal([{ coordenacao: 'B', diarias: 2 }, { coordenacao: 'A', diarias: 2 }]), { coordenacao: 'A', outras: ['B'] });
  assert.deepEqual(coordenacaoPrincipal([{ coordenacao: ' ', diarias: 2 }, {}]), { coordenacao: '', outras: [] });
  assert.deepEqual(coordenacaoPrincipal([{ coordenacao: 'X' }]), { coordenacao: 'X', outras: [] });
});

test('descrição: reserva, hotel, período e hospedados (até 6 nomes)', () => {
  assert.equal(descricaoHospedagem(ctx), 'Hospedagem HOUT01 - Hotel Girassol - 03/11 a 06/11 - Ana Souza, Bruno Lima, Carla Dias');
  const muitos = { ...ctx, itens: Array.from({ length: 9 }, (_, i) => ({ nome: `P${i}`, coordenacao: 'X', diarias: 1 })) };
  assert.match(descricaoHospedagem(muitos), /P0, P1, P2, P3, P4, P5 e mais 3$/);
  assert.equal(descricaoHospedagem({ codigo: 'H1', itens: [] }), 'Hospedagem H1');
  assert.equal(descricaoHospedagem({ ...ctx, hotel: 'x'.repeat(400) }).length, 250);
});

test('rateio na coordenação principal, valor igual ao da NF, GERAL de reserva e aviso das demais', () => {
  const data = applyHospedagemRules({ valor_total: 1200.5, rateio: { data_participacao: '24/10/2026', identificacao: 'GERAL', valor: 1200.5 } }, ctx);
  assert.equal(data.rateio.tipo_participacao, 'Coordenação');
  assert.equal(data.rateio.identificacao, 'SORRISO');
  assert.equal(data.rateio.identificacao_fallback, 'GERAL');
  assert.equal(data.rateio.valor, 1200.5);
  assert.equal(data.rateio.data_participacao, '24/10/2026');
  assert.equal(data.grupo_categoria, 'DESPESAS OPERACIONAIS');
  assert.equal(data.categoria, 'HOSPEDAGEM');
  assert.equal(data.hospedagem.reserva, 'HOUT01');
  assert.match(data.hospedagem.avisos[0], /Rateio inteiro em SORRISO.*CUIABÁ/);
});

test('sem coordenação cadastrada cai em GERAL com aviso; categoria já definida é mantida', () => {
  const data = applyHospedagemRules({ valor_total: 99, grupo_categoria: 'OUTRO GRUPO', categoria: 'OUTRA' }, { ...ctx, itens: [{ nome: 'Z', coordenacao: '' }] });
  assert.equal(data.rateio.identificacao, 'GERAL');
  assert.match(data.hospedagem.avisos[0], /sem coordenação/);
  assert.equal(data.grupo_categoria, 'OUTRO GRUPO');
  assert.equal(data.categoria, 'OUTRA');
});

test('o agente aplica as regras de Hospedagem antes dos ajustes manuais e lê só tabelas da reserva', () => {
  const fonte = le('agentes-grm-sync/grmserver-lancar-notas-fiscais-api.js');
  const posRegras = fonte.indexOf('applyHospedagemRules(data, ctxHospedagem');
  const posAjustes = fonte.indexOf('applyManualOverrides(data, row.ajustes_manuais)');
  assert.ok(posRegras > 0 && posAjustes > posRegras, 'applyHospedagemRules deve rodar antes de applyManualOverrides');
  assert.match(fonte, /\.eq\('grm_nf_lancamento_id', row\.id\)/);
  assert.match(fonte, /require\('\.\/grm-nf-hospedagem-regras'\)/);
});

test('migration da Fase 3: webhook (service_role) enfileira, retorno do GRM sincroniza e a baixa nasce desligada', () => {
  const sql = le('supabase/migrations/20261024200000_hospedagem_pagamento_nf_grm.sql');
  assert.match(sql, /coalesce\(\(select auth\.role\(\)\),''\)='service_role'/);
  assert.match(sql, /create trigger trg_sincronizar_nf_hospedagem[\s\S]*new\.setor = 'HOSPEDAGEM'/);
  assert.match(sql, /create trigger trg_sincronizar_pagamento_hospedagem[\s\S]*origem_tabela = 'hospedagem_pagamentos_v3'/);
  assert.match(sql, /values \('baixa_comprovante', false,/);
  assert.doesNotMatch(sql, /insert into public\.grm_sync_jobs/, 'o job do agente vem do gatilho grm_nf_lancamentos_enfileirar_job');
});
