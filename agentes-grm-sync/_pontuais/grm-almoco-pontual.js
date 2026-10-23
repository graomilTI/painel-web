#!/usr/bin/env node
'use strict';

/*
 * EXECUÇÃO PONTUAL (23/10/2026) — não entra no SCRIPT_MAP/cron.
 *
 * Almoço que ficou só "liberado" no GRM e nunca foi lançado no Caixa porque o agente de
 * retroativas só cria Almoço quando existe linha em programacao_alimentacao com almoco=true
 * (sem linha a Programação, a Conferência, o PDF e a liberação assumem Sim). Pedido do usuário:
 * lançar só para Patrick de Oliveira e Alexandro Lambertes Brandão.
 *
 * Para cada CPF e cada dia com produção (embarque SIM) no intervalo:
 *   - almoço desmarcado na Programação (almoco=false)  -> não lança;
 *   - Pernoite ativo no Caixa do dia                  -> não lança (hospedagem cobre a refeição);
 *   - já existe Almoço aprovado                       -> nada;
 *   - existe Almoço pendente                          -> aprova;
 *   - não existe                                      -> cria e aprova.
 * Só Almoço: nunca mexe em salário, café, janta nem em outros colaboradores.
 *
 * Uso (sempre --dry-run antes; roda no servidor, com o token do dia em cache):
 *   GRM_ALMOCO_PONTUAL_CPFS=03730787063,02320957014 \
 *   GRM_ALMOCO_PONTUAL_DE=2026-10-01 GRM_ALMOCO_PONTUAL_ATE=2026-10-22 \
 *   node grm-almoco-pontual.js --dry-run
 *   ...mesmo comando sem --dry-run para lançar.
 */

require('dotenv').config();

let agente;
try { agente = require('../grm-sync-despesas-retroativas'); } catch (_) { agente = require('./grm-sync-despesas-retroativas'); }
const {
  norm, decide, temPernoiteAtivo, login, loadGrmData, findStaff, create, approve,
  recordAudit, isoToBr, digits, getSupabase,
} = agente;

const DRY_RUN = process.argv.includes('--dry-run');
const CPFS = String(process.env.GRM_ALMOCO_PONTUAL_CPFS || '').split(',').map((v) => digits(v)).filter((v) => v.length === 11);
const DE = process.env.GRM_ALMOCO_PONTUAL_DE || '';
const ATE = process.env.GRM_ALMOCO_PONTUAL_ATE || '';

function log(level, message, extra) {
  console.log(`[${new Date().toISOString()}] [${level}] ${message}${extra ? ` ${JSON.stringify(extra)}` : ''}`);
}

// O PostgREST corta em 1000 linhas: pagina até acabar.
async function lerTudo(montar) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await montar().range(from, from + 999);
    if (error) throw error;
    out.push(...(data || []));
    if (!data || data.length < 1000) return out;
  }
}

async function main() {
  if (!CPFS.length || !/^\d{4}-\d{2}-\d{2}$/.test(DE) || !/^\d{4}-\d{2}-\d{2}$/.test(ATE)) {
    throw new Error('Informe GRM_ALMOCO_PONTUAL_CPFS (11 dígitos, separados por vírgula), GRM_ALMOCO_PONTUAL_DE e GRM_ALMOCO_PONTUAL_ATE (AAAA-MM-DD).');
  }
  const sb = getSupabase();

  const { data: contratos, error: errC } = await sb
    .from('colaborador_cruzamento')
    .select('colaborador_id,cpf,nome,tipo_contrato,salario')
    .in('cpf', CPFS);
  if (errC) throw errC;
  const pessoas = new Map();
  for (const row of contratos || []) pessoas.set(digits(row.cpf), row);
  for (const cpf of CPFS) if (!pessoas.has(cpf)) throw new Error(`CPF ${cpf} sem contrato em colaborador_cruzamento.`);

  const token = await login();
  const resumo = { analisados: 0, ja_aprovado: 0, aprovar: 0, criar: 0, sem_producao: 0, desmarcado: 0, pernoite: 0, sem_gestor: 0, erros: 0 };

  for (const cpf of CPFS) {
    const pessoa = pessoas.get(cpf);
    const nameKey = norm(pessoa.nome);
    if (!['DIARISTA', 'INTERMITENTE', 'EFETIVO'].includes(norm(pessoa.tipo_contrato))) {
      throw new Error(`${pessoa.nome}: contrato ${pessoa.tipo_contrato} não elegível.`);
    }

    const prod = await lerTudo(() => sb.from('producao_snapshot').select('id,data,funcionario').gte('data', DE).lte('data', ATE).order('id'));
    const dias = [...new Set((prod || []).filter((r) => norm(r.funcionario) === nameKey).map((r) => String(r.data).slice(0, 10)))].sort();

    const alim = await lerTudo(() => sb.from('programacao_alimentacao').select('id,nome_colaborador,almoco,data_referencia').gte('data_referencia', DE).lte('data_referencia', ATE).order('id'));
    const desmarcados = new Set((alim || [])
      .filter((r) => norm(r.nome_colaborador) === nameKey && r.almoco === false)
      .map((r) => String(r.data_referencia).slice(0, 10)));

    log('INFO', `${pessoa.nome}: ${dias.length} dia(s) com produção em ${DE}..${ATE}.`, { dry_run: DRY_RUN });

    for (const date of dias) {
      resumo.analisados += 1;
      if (desmarcados.has(date)) { resumo.desmarcado += 1; log('INFO', `${pessoa.nome} ${date}: almoço desmarcado na Programação.`); continue; }

      const grm = await loadGrmData(token, date);
      const staff = findStaff({ cpf, nameKey }, grm.staff);
      if (!staff) { resumo.erros += 1; log('ERROR', `${pessoa.nome} ${date}: não localizado no GRM.`); continue; }
      if (temPernoiteAtivo(grm.movements, staff.staCode)) { resumo.pernoite += 1; log('INFO', `${pessoa.nome} ${date}: Pernoite ativo no Caixa; sem almoço.`); continue; }

      const lunch = grm.expenseTypes.get('ALMOCO');
      if (!lunch) throw new Error('Categoria Almoço não encontrada no GRM.');
      const valor = Number(lunch.oexMaxOperatingFlowValue || 30);
      const existing = grm.movements.filter((row) => Number(row.staCode) === Number(staff.staCode)
        && Number(row.oexCode) === Number(lunch.oexCode) && row.ofmType === 'D');
      const decision = decide(existing);

      const audit = {
        data_referencia: date,
        cpf,
        colaborador: pessoa.nome,
        sta_code: Number(staff.staCode),
        tipo_contrato: pessoa.tipo_contrato,
        tipo_despesa: lunch.oexName,
        oex_code: Number(lunch.oexCode),
        valor,
        acao: decision.action,
        dry_run: DRY_RUN,
        diagnostico: {
          execucao_pontual: true,
          motivo: 'almoco_sem_linha_de_alimentacao_nao_era_criado_pelo_retroativo',
          laudo: true,
          existentes: existing.map((r) => ({ ofmCode: r.ofmCode, status: r.ofmStatus, valor: r.ofmValue })),
        },
      };

      try {
        if (decision.action === 'NONE') {
          resumo.ja_aprovado += 1;
          log('INFO', `${pessoa.nome} ${date}: Almoço já aprovado (ofm ${decision.mantido.ofmCode}).`);
        } else if (decision.action === 'APPROVE') {
          resumo.aprovar += 1;
          audit.ofm_code = Number(decision.row.ofmCode);
          log('INFO', `${pessoa.nome} ${date}: aprovar Almoço pendente ofm ${decision.row.ofmCode}.`);
          if (!DRY_RUN) await approve(token, decision.row);
        } else {
          resumo.criar += 1;
          log('INFO', `${pessoa.nome} ${date}: criar Almoço R$ ${valor.toFixed(2)}.`);
          if (!DRY_RUN) {
            await create(token, staff, { ...lunch, amount: valor }, date);
            const refreshed = await agente.api(token, '/api/reports/finance/operatingFlow', {
              ofmDateFrom: isoToBr(date), ofmDateTo: isoToBr(date), ofmStatusReport: ['P', 'A', 'N'], reportType: 'flowList',
            });
            const created = (refreshed.searchData || [])
              .filter((row) => Number(row.staCode) === Number(staff.staCode) && Number(row.oexCode) === Number(lunch.oexCode))
              .sort((a, b) => Number(b.ofmCode) - Number(a.ofmCode))[0];
            if (!created) throw new Error('Lançamento não apareceu na conferência após criação.');
            audit.ofm_code = Number(created.ofmCode);
            if (created.ofmStatus === 'P') await approve(token, created);
          }
        }
        audit.sucesso = true;
      } catch (error) {
        resumo.erros += 1;
        audit.sucesso = false;
        audit.erro = error.message;
        log('ERROR', `${pessoa.nome} ${date}: ${error.message}`);
      }
      await recordAudit(audit);
    }
  }

  log(resumo.erros ? 'WARN' : 'SUCCESS', 'Concluído.', resumo);
  if (resumo.erros) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
