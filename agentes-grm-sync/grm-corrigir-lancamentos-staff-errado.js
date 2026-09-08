#!/usr/bin/env node
'use strict';

/**
 * Correção pontual: holerites de AGOSTO/2026 lançados no Contas a Pagar do
 * GRM com o FUNCIONÁRIO ERRADO — bug corrigido em grmserver-lancar-notas-
 * fiscais-api.js (resolveFuncionario aceitava sem checar o nome o único
 * resultado de uma busca por matrícula pura; como matrícula é reaproveitada
 * quando um funcionário desliga e outro é contratado com o mesmo número, o
 * holerite acabava vinculado ao DONO ATUAL da matrícula, não à pessoa do
 * holerite). Confirmado ao vivo em 08/09: 133 de 468 lançamentos de agosto
 * (vencimento 2026-09-05) estão com favoredName diferente do
 * fornecedor_nome da nossa fila — todos ainda pinStatus 'A' (nenhum pago).
 *
 * Este script NÃO cria nem exclui lançamento nenhum — só corrige o campo
 * staCode (funcionário vinculado) de registros que JÁ EXISTEM no GRM,
 * mantendo valor, vencimento, categoria e número do documento intocados.
 * Reaproveita resolveFuncionario() (já corrigido) do agente de lançamento
 * pra achar o staCode certo pelo NOME completo (nunca pela matrícula
 * sozinha, é exatamente o bug que estamos corrigindo).
 *
 * Uso:
 *   node grm-corrigir-lancamentos-staff-errado.js                (dry-run, todos)
 *   node grm-corrigir-lancamentos-staff-errado.js --pin-code 118861   (1 registro, dry-run)
 *   node grm-corrigir-lancamentos-staff-errado.js --pin-code 118861 --real  (aplica só esse)
 *   node grm-corrigir-lancamentos-staff-errado.js --real --limit 10  (aplica até 10)
 *
 * Sempre roda em dry-run a menos que --real seja passado explicitamente.
 * Depois de cada correção real, busca o registro de novo no GRM e confere
 * que SÓ staCode/favoredName mudaram (valor, vencimento, doc, categoria
 * continuam iguais) — se algo mais mudou, para e avisa.
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const lancar = require('./grmserver-lancar-notas-fiscais-api.js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });

const args = process.argv.slice(2);
const REAL = args.includes('--real');
const pinCodeArgIdx = args.indexOf('--pin-code');
const SOMENTE_PIN_CODE = pinCodeArgIdx >= 0 ? args[pinCodeArgIdx + 1] : null;
const limitArgIdx = args.indexOf('--limit');
const LIMIT = limitArgIdx >= 0 ? Number(args[limitArgIdx + 1]) : Infinity;

function log(level, msg, extra) {
  const suffix = extra === undefined ? '' : ` ${JSON.stringify(extra)}`;
  console.log(`[${level}] ${new Date().toISOString()} - ${msg}${suffix}`);
}

function normalizeText(value) {
  return String(value || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ').trim().toUpperCase();
}

// Campos "de verdade" (editáveis) de um payInvoice, na mesma forma que o
// agente de lançamento usa pra INSERIR (buildPayInvoicePayload) — usados
// aqui pra reconstruir o payload de EDIÇÃO a partir do registro atual, sem
// reinventar nomes de campo. Tudo que getRecords devolve além disso
// (favoredName, picName, scpName, olcName, ..., payment) é decoração de
// leitura, não deve voltar no setRecord.
function buildEditPayload(live, novoStaCode) {
  return {
    pinCode: live.pinCode,
    scpCode: live.scpCode,
    pinTitle: live.pinTitle,
    typeFavored: 'staCode',
    staCode: novoStaCode,
    supCode: 0,
    picCode: live.picCode,
    payInvoiceMainCategory: live.payInvoiceMainCategory,
    pinDate: live.pinDate,
    pinDueDate: live.pinDueDate,
    pinInstallmentTotal: live.pinInstallmentTotal,
    pinInstallmentNumber: live.pinInstallmentNumber,
    pinInstallmentInterval: live.pinInstallmentInterval,
    pinTotalValue: live.pinTotalValue,
    pdtCode: live.pdtCode,
    pinDocNumber: live.pinDocNumber,
    patCode: live.patCode,
    pinDescription: live.pinDescription || '',
    pinStatus: live.pinStatus,
    pinDividedProrated: live.pinDividedProrated,
    // Tentativa 2: a 1ª tentativa (sem proratedInvoices) foi um NO-OP no GRM
    // (isInsert:false mas nada mudou) — hipótese: o rateio é obrigatório pro
    // setRecord aplicar qualquer mudança. Reconstrói o rateio por
    // Coordenação (mesmo formato de buildRateioEntry no agente de
    // lançamento, pipType 'C' pra holerite) usando o olcCode do próprio
    // registro atual.
    proratedInvoices: [{
      pipStatus: 'A', pipDate: live.pinDate, pipType: 'C',
      olcCode: live.olcCode || 0, olsCode: 0, staCode: 0, vehCode: 0,
      pipValue: live.pinTotalValue, pipPercentage: 100,
    }],
    pinInstallment: [{
      pinInstallmentNumber: live.pinInstallmentNumber,
      pinInstallmentValue: live.pinInstallmentValue,
      pinDueDate: live.pinDueDate,
      pinStatus: live.pinStatus,
    }],
    isEditRecord: 'S',
    moreThenOneCompany: 'S',
  };
}

async function getPayInvoiceMainCategory(picCode) {
  const resp = await lancar.apiPost('payInvoiceCategory/getRecords', {});
  if (!resp.result) throw new Error(`payInvoiceCategory/getRecords falhou: ${resp.message}`);
  const found = (resp.searchData || []).find((c) => Number(c.picCode) === Number(picCode));
  return found ? found.picParent : null;
}

async function fetchOpenInvoices() {
  const resp = await lancar.apiPost('payInvoice/getRecords', { pinStatus: 'A', moreThenOneCompany: 'S' });
  if (!resp.result) throw new Error(`payInvoice/getRecords falhou: ${resp.message}`);
  return resp.searchData || [];
}

async function fetchOne(pinCode) {
  const resp = await lancar.apiPost('payInvoice/getRecords', { pinCode: [Number(pinCode)], moreThenOneCompany: 'S' });
  if (!resp.result) throw new Error(`payInvoice/getRecords falhou: ${resp.message}`);
  return (resp.searchData || [])[0] || null;
}

async function achaLancamentosErrados() {
  const abertos = await fetchOpenInvoices();
  const porPinCode = new Map(abertos.map((r) => [String(r.pinCode), r]));

  let query = supabase.from('grm_nf_lancamentos')
    .select('id,fornecedor_nome,valor_total,grm_codigo,numero_documento')
    .eq('status', 'LANCADO')
    .eq('data_vencimento', '2026-09-05')
    .not('grm_codigo', 'is', null);
  if (SOMENTE_PIN_CODE) query = query.eq('grm_codigo', String(SOMENTE_PIN_CODE));
  const { data: rows, error } = await query;
  if (error) throw error;

  const errados = [];
  for (const row of rows) {
    const live = porPinCode.get(String(row.grm_codigo));
    if (!live) continue; // já pago ou pinCode não existe mais — fora do escopo desta correção
    const esperado = normalizeText(row.fornecedor_nome);
    const real = normalizeText(live.favoredName);
    if (esperado === real || real.includes(esperado) || esperado.includes(real)) continue;
    errados.push({ row, live });
  }
  return errados;
}

async function main() {
  log('INFO', `=== Correção de staff errado em payInvoice (${REAL ? 'REAL' : 'DRY-RUN'}) ===`);
  lancar.loadConfig();

  const errados = await achaLancamentosErrados();
  log('INFO', `${errados.length} lançamento(s) com funcionário errado encontrados.`);

  const resultado = { corrigidos: [], semStaffEncontrado: [], nomeAindaDivergente: [], divergenciaInesperada: [], erros: [] };
  let processados = 0;

  for (const { row, live } of errados) {
    if (processados >= LIMIT) break;
    processados += 1;

    try {
      const staff = await lancar.resolveFuncionario({ funcionario_nome: row.fornecedor_nome, funcionario_registro: null });
      if (!staff) {
        log('WARN', `${row.fornecedor_nome} (pinCode ${row.grm_codigo}): funcionário não encontrado no GRM pelo nome.`);
        resultado.semStaffEncontrado.push({ fornecedor_nome: row.fornecedor_nome, pinCode: row.grm_codigo });
        continue;
      }
      if (normalizeText(staff.staName) !== normalizeText(row.fornecedor_nome)) {
        log('WARN', `${row.fornecedor_nome} (pinCode ${row.grm_codigo}): melhor achado foi "${staff.staName}", não é exato — pulando por segurança.`);
        resultado.nomeAindaDivergente.push({ fornecedor_nome: row.fornecedor_nome, achado: staff.staName, pinCode: row.grm_codigo });
        continue;
      }

      log('INFO', `${row.fornecedor_nome} (pinCode ${row.grm_codigo}): ${live.favoredName} (staCode ${live.staCode}) -> ${staff.staName} (staCode ${staff.staCode}). Valor R$ ${live.pinInstallmentValue}, doc ${live.pinDocNumber}.`);

      if (!REAL) continue;

      const payInvoiceMainCategory = live.payInvoiceMainCategory ?? await getPayInvoiceMainCategory(live.picCode);
      const payload = buildEditPayload({ ...live, payInvoiceMainCategory }, staff.staCode);
      const resp = await lancar.apiPost('payInvoice/setRecord', payload);
      if (!resp.result) throw new Error(`setRecord falhou: ${resp.message || 'erro'}`);

      // Achado no teste do pinCode 118861: ler de volta IMEDIATAMENTE às
      // vezes ainda mostra o valor antigo (o GRM parece levar um instante
      // pra refletir a escrita) — dá uma folga antes de conferir.
      await new Promise((r) => setTimeout(r, 1500));
      const depois = await fetchOne(live.pinCode);
      const diffsInesperados = ['pinTotalValue', 'pinInstallmentValue', 'pinDueDate', 'pinDocNumber', 'picCode', 'pdtCode', 'patCode', 'scpCode']
        .filter((campo) => String(depois[campo]) !== String(live[campo]));

      if (normalizeText(depois.favoredName) !== normalizeText(staff.staName)) {
        throw new Error(`Depois da correção, favoredName ficou "${depois.favoredName}", esperado "${staff.staName}".`);
      }
      if (diffsInesperados.length) {
        throw new Error(`Campos além do staCode mudaram: ${diffsInesperados.map((c) => `${c} ${live[c]}->${depois[c]}`).join(', ')}`);
      }

      log('SUCCESS', `${row.fornecedor_nome} (pinCode ${row.grm_codigo}): corrigido pra staCode ${staff.staCode} (${depois.favoredName}). Valor/vencimento/doc confirmados intactos.`);
      resultado.corrigidos.push({ fornecedor_nome: row.fornecedor_nome, pinCode: row.grm_codigo, staCodeAntigo: live.staCode, favoredNameAntigo: live.favoredName, staCodeNovo: staff.staCode });
    } catch (error) {
      log('ERROR', `${row.fornecedor_nome} (pinCode ${row.grm_codigo}): ${error.message}`);
      resultado.erros.push({ fornecedor_nome: row.fornecedor_nome, pinCode: row.grm_codigo, erro: error.message });
    }
  }

  const logPath = path.join(__dirname, 'logs', `correcao-staff-errado-${Date.now()}.json`);
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  fs.writeFileSync(logPath, JSON.stringify(resultado, null, 2));
  log('SUCCESS', `Concluído. Log salvo em ${logPath}.`, {
    corrigidos: resultado.corrigidos.length,
    semStaffEncontrado: resultado.semStaffEncontrado.length,
    nomeAindaDivergente: resultado.nomeAindaDivergente.length,
    erros: resultado.erros.length,
    dryRun: !REAL,
  });
}

main().catch((error) => {
  log('ERROR', `Erro fatal: ${error.stack || error.message}`);
  process.exitCode = 1;
});
