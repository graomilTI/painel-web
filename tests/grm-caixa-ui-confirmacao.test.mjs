import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const caixaUi = require('../agentes-grm-sync/grm-caixa-ui.js');

// Página simulada: 1ª chamada de evaluate localiza o botão SALVAR; as seguintes leem a confirmação na tela.
// `leituras` define, em ordem, o que cada leitura da tela devolve (a última se repete).
function paginaFalsa(leituras) {
  const estado = { cliques: 0, leituras: 0, preparou: false };
  return {
    estado,
    click: async () => { estado.cliques += 1; },
    evaluate: async () => {
      if (!estado.preparou) { estado.preparou = true; return { selector: '[data-grm-bonus-save-expense="1"]' }; }
      const i = estado.leituras;
      estado.leituras += 1;
      return leituras[Math.min(i, leituras.length - 1)];
    },
  };
}

const ABERTO_SEM_SINAL = { formStillOpen: true, messages: [], successMessage: null, errorMessage: null, signalType: null };
const SUCESSO = { formStillOpen: true, messages: ['Registro cadastrado..! O registro foi cadastrado com sucesso.'], successMessage: 'Registro cadastrado..! O registro foi cadastrado com sucesso.', errorMessage: null, signalType: 'success' };
const ERRO_GRM = { formStillOpen: true, messages: ['Erro no processo! Você não tem permissão para executar esta ação.'], successMessage: null, errorMessage: 'Erro no processo! Você não tem permissão para executar esta ação.', signalType: 'error' };
const FECHADO = { formStillOpen: false, messages: [], successMessage: null, errorMessage: null, signalType: null };

test('saveExpense: aviso de sucesso que chega DEPOIS da primeira leitura é aceito (antes virava "não confirmou o salvamento")', async () => {
  process.env.GRM_CAIXA_CONFIRMACAO_MS = '8000';
  const pagina = paginaFalsa([ABERTO_SEM_SINAL, ABERTO_SEM_SINAL, SUCESSO]);
  const r = await caixaUi.saveExpense(pagina, 'Bônus');
  assert.equal(r.confirmedBy, 'GRM_SUCCESS_MESSAGE');
  assert.equal(pagina.estado.leituras, 3, 'releu a tela até o aviso aparecer');
  assert.equal(pagina.estado.cliques, 1, 'clicou em Salvar UMA vez só (nunca reenvia)');
});

test('saveExpense: erro explícito do GRM sai na hora, sem esperar', async () => {
  process.env.GRM_CAIXA_CONFIRMACAO_MS = '8000';
  const pagina = paginaFalsa([ERRO_GRM]);
  const t0 = Date.now();
  await assert.rejects(() => caixaUi.saveExpense(pagina, 'Bônus'), /GRM recusou o salvamento do Bônus: Erro no processo! Você não tem permissão/);
  assert.equal(pagina.estado.leituras, 1);
  assert.ok(Date.now() - t0 < 4000, 'não ficou esperando depois de um erro claro');
});

test('saveExpense: formulário que fecha sozinho é confirmação (como antes)', async () => {
  process.env.GRM_CAIXA_CONFIRMACAO_MS = '8000';
  const pagina = paginaFalsa([ABERTO_SEM_SINAL, FECHADO]);
  const r = await caixaUi.saveExpense(pagina, 'Bônus');
  assert.equal(r.confirmedBy, 'FORM_CLOSED');
  assert.equal(pagina.estado.leituras, 2);
});

test('saveExpense: silêncio total (formulário aberto, nenhum aviso) falha SÓ depois de esgotar a espera', async () => {
  process.env.GRM_CAIXA_CONFIRMACAO_MS = '1800';
  const pagina = paginaFalsa([ABERTO_SEM_SINAL]);
  const t0 = Date.now();
  await assert.rejects(() => caixaUi.saveExpense(pagina, 'Bônus'), /GRM não confirmou o salvamento do Bônus\./);
  const gasto = Date.now() - t0;
  assert.ok(pagina.estado.leituras >= 3, `releu várias vezes (${pagina.estado.leituras})`);
  assert.ok(gasto >= 1800, `esperou o prazo configurado (${gasto} ms)`);
  assert.equal(pagina.estado.cliques, 1, 'mesmo falhando, não reenvia o clique');
});

test('saveExpense: GRM_CAIXA_CONFIRMACAO_MS=0 mantém o comportamento antigo (uma leitura só)', async () => {
  process.env.GRM_CAIXA_CONFIRMACAO_MS = '0';
  const pagina = paginaFalsa([ABERTO_SEM_SINAL, SUCESSO]);
  await assert.rejects(() => caixaUi.saveExpense(pagina, 'Bônus'), /GRM não confirmou o salvamento/);
  assert.equal(pagina.estado.leituras, 1);
});

test('selectExactStaffRow: 1ª espera pelo CPF entre os Ativos sobe para 15 s na rota do túnel (5 s direto) e respeita o override', async () => {
  // Pelo túnel a tabela de Funcionários demora mais que 5 s; o agente trocava para "Não Ativos" cedo demais e
  // quem é Ativo virava "não localizado nem em Ativos nem em Não Ativos".
  const primeiraEspera = async () => {
    const esperas = [];
    const pagina = {
      waitForFunction: async (_fn, opcoes) => { esperas.push(opcoes.timeout); return true; },
      evaluate: async () => ({ ok: false, reason: 'ROW_NOT_UNIQUE', matches: 0 }),
    };
    await caixaUi.selectExactStaffRow(pagina, '123.456.789-09').catch(() => {});
    return esperas[0];
  };
  const antesRota = process.env.GRM_EGRESS_ROTA;
  const antesBusca = process.env.GRM_CAIXA_BUSCA_CPF_MS;
  try {
    delete process.env.GRM_EGRESS_ROTA;
    delete process.env.GRM_CAIXA_BUSCA_CPF_MS;
    assert.equal(await primeiraEspera(), 5000, 'direto pela VPS: como sempre');
    process.env.GRM_EGRESS_ROTA = 'tunel';
    assert.equal(await primeiraEspera(), 15000, 'rota do túnel: 15 s');
    process.env.GRM_CAIXA_BUSCA_CPF_MS = '9000';
    assert.equal(await primeiraEspera(), 9000, 'override por variável');
  } finally {
    if (antesRota === undefined) delete process.env.GRM_EGRESS_ROTA; else process.env.GRM_EGRESS_ROTA = antesRota;
    if (antesBusca === undefined) delete process.env.GRM_CAIXA_BUSCA_CPF_MS; else process.env.GRM_CAIXA_BUSCA_CPF_MS = antesBusca;
  }
});
