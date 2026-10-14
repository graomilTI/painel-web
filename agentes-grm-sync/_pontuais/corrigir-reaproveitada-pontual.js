#!/usr/bin/env node

/**
 * Correção pontual (não roda em cron): aplica em lote, via Supabase JS, a
 * mesma reconciliação que loadEquipeReaproveitada() + reancorarDespesasJaLancadas()
 * (assets/js/programacao-despesas.js) fazem no navegador — só que ali elas só
 * disparam quando ALGUÉM carrega a aba de Despesas ou a Lista de O.S. daquela
 * supervisão/data. Achado 15/09/2026: várias supervisões (MATO GROSSO MT1 -
 * Lucas do Rio Verde/Nova Mutum, MATO GROSSO MT2 - Campo Verde, entre outras)
 * já tinham o programacao_dia de hoje criado (por Gerar PDF/Carregar), mas
 * ninguém tinha aberto Despesas/Lista de O.S. pra essa combinação ainda —
 * então nenhuma confirmação nem despesa tinha sido levada pro id de hoje, e a
 * Conferência (que não chama loadEquipeReaproveitada) não achava nada.
 *
 * Escopo: toda O.S. ainda ATENDER cuja supervisão tem um programacao_dia de
 * HOJE (data_referencia = hoje) e que ainda não tem confirmação sob esse id.
 * Usa a confirmação mais recente (por os_id) de qualquer dia anterior, move
 * pro id de hoje, e reancora alimentação/estadia/deslocamento/extras do(s)
 * colaborador(es) pro mesmo id — só quando o lançamento já tem
 * data_referencia de hoje mas ficou preso no programacao_id antigo (nunca
 * sobrescreve uma linha já legítima no destino).
 *
 * Uso:
 *   node corrigir-reaproveitada-pontual.js              (dry-run, só mostra o que faria)
 *   node corrigir-reaproveitada-pontual.js --apply       (grava de verdade)
 *   node corrigir-reaproveitada-pontual.js --apply --supervisao="MATO GROSSO MT2 - Campo Verde"
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY
);

const APPLY = process.argv.includes('--apply');
const supArg = process.argv.find((a) => a.startsWith('--supervisao='));
const SUPERVISAO_FILTRO = supArg ? supArg.split('=')[1] : null;

function log(level, msg) { console.log(`[${level}] ${new Date().toISOString()} - ${msg}`); }

function todayIsoSaoPaulo() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

async function main() {
  const hoje = todayIsoSaoPaulo();
  log('INFO', `=== Reconciliação de O.S. reaproveitada — data de referência ${hoje}${APPLY ? '' : ' (DRY-RUN, use --apply pra gravar)'} ===`);

  let progHojeQuery = supabase.from('programacao_dia').select('id,supervisao').eq('data_referencia', hoje);
  if (SUPERVISAO_FILTRO) progHojeQuery = progHojeQuery.eq('supervisao', SUPERVISAO_FILTRO);
  const { data: programacoesHoje, error: progError } = await progHojeQuery;
  if (progError) throw progError;
  if (!programacoesHoje?.length) { log('INFO', 'Nenhum programacao_dia de hoje encontrado pro filtro informado.'); return; }

  const hojeIdPorSupervisao = new Map(programacoesHoje.map((p) => [p.supervisao, p.id]));
  log('INFO', `${hojeIdPorSupervisao.size} supervisão(ões) com programacao_dia de hoje: ${[...hojeIdPorSupervisao.keys()].join(', ')}`);

  let totalConfirmacoes = 0;
  let totalDespesasReancoradas = 0;

  for (const [supervisao, programacaoIdHoje] of hojeIdPorSupervisao) {
    const { data: osAbertas, error: osError } = await supabase
      .from('operacional_os')
      .select('id')
      .eq('status_gestor', 'ATENDER')
      .eq('supervisao', supervisao);
    if (osError) { log('ERROR', `${supervisao}: falha ao buscar O.S. ATENDER: ${osError.message}`); continue; }
    if (!osAbertas?.length) continue;

    const osIds = osAbertas.map((o) => o.id);

    const { data: jaHoje, error: jaHojeError } = await supabase
      .from('programacao_equipe')
      .select('os_id')
      .eq('programacao_id', programacaoIdHoje)
      .in('os_id', osIds);
    if (jaHojeError) { log('ERROR', `${supervisao}: falha ao checar confirmações de hoje: ${jaHojeError.message}`); continue; }
    const osComHoje = new Set((jaHoje || []).map((r) => r.os_id));
    const osFaltantes = osIds.filter((id) => !osComHoje.has(id));
    if (!osFaltantes.length) continue;

    const { data: confirmadas, error: confError } = await supabase
      .from('programacao_equipe')
      .select('os_id,colaborador_id,nome_colaborador,score,score_contrato,score_distancia,score_auditoria,km_estimado,ordem_rota,duracao_min,updated_at')
      .eq('confirmado', true)
      .in('os_id', osFaltantes)
      .order('updated_at', { ascending: false });
    if (confError) { log('ERROR', `${supervisao}: falha ao buscar confirmações anteriores: ${confError.message}`); continue; }

    const vencedoraPorOs = new Map();
    (confirmadas || []).forEach((row) => { if (!vencedoraPorOs.has(row.os_id)) vencedoraPorOs.set(row.os_id, row); });
    const paraGravar = [...vencedoraPorOs.values()];
    if (!paraGravar.length) continue;

    log('INFO', `${supervisao}: ${paraGravar.length} O.S. sem confirmação de hoje — ${paraGravar.map((r) => r.nome_colaborador).join(', ')}`);
    totalConfirmacoes += paraGravar.length;

    // Grava linha a linha (não em lote): um colaborador "escalado" pra outra
    // regional ontem pode disparar uma validação real do banco ("colaborador
    // não pertence à regional") — em lote, essa 1 falha rejeitava a
    // transação inteira e nenhum dos outros colaboradores da supervisão era
    // gravado (achado ao vivo 15/09, Campo Verde/MT2-Leste/Palmeira das
    // Missões: 0 gravado nas 3 por causa de 1 colaborador escalado em cada).
    const colaboradoresGravados = new Set();
    if (APPLY) {
      for (const r of paraGravar) {
        const { error: upsertError } = await supabase
          .from('programacao_equipe')
          .upsert({
            programacao_id: programacaoIdHoje,
            os_id: r.os_id,
            colaborador_id: r.colaborador_id,
            nome_colaborador: r.nome_colaborador,
            score: r.score,
            score_contrato: r.score_contrato,
            score_distancia: r.score_distancia,
            score_auditoria: r.score_auditoria,
            km_estimado: r.km_estimado,
            ordem_rota: r.ordem_rota,
            duracao_min: r.duracao_min,
            confirmado: true,
          }, { onConflict: 'programacao_id,os_id,colaborador_id' });
        if (upsertError) {
          log('ERROR', `  ${r.nome_colaborador} (os_id=${r.os_id}): falha ao gravar confirmação de hoje: ${upsertError.message}`);
          continue;
        }
        colaboradoresGravados.add(r.colaborador_id);
      }
    } else {
      paraGravar.forEach((r) => colaboradoresGravados.add(r.colaborador_id));
    }
    if (!colaboradoresGravados.size) continue;

    const colaboradorIds = [...colaboradoresGravados];
    const tabelasUnicas = ['programacao_alimentacao', 'programacao_estadia', 'programacao_deslocamento'];
    for (const tabela of tabelasUnicas) {
      const { data: existentes, error: existentesError } = await supabase
        .from(tabela).select('colaborador_id').eq('programacao_id', programacaoIdHoje).in('colaborador_id', colaboradorIds);
      if (existentesError) { log('ERROR', `${supervisao}/${tabela}: falha ao checar colisão: ${existentesError.message}`); continue; }
      const jaNoDestino = new Set((existentes || []).map((r) => r.colaborador_id));
      const idsSemColisao = colaboradorIds.filter((id) => !jaNoDestino.has(id));
      if (!idsSemColisao.length) continue;

      const { data: origemRows, error: origemError } = await supabase
        .from(tabela).select('id,colaborador_id,programacao_id').eq('data_referencia', hoje).in('colaborador_id', idsSemColisao).neq('programacao_id', programacaoIdHoje);
      if (origemError) { log('ERROR', `${supervisao}/${tabela}: falha ao buscar origem: ${origemError.message}`); continue; }
      if (!origemRows?.length) continue;

      log('INFO', `  ${tabela}: reancorando ${origemRows.length} linha(s) — ${origemRows.map((r) => r.colaborador_id).join(', ')}`);
      totalDespesasReancoradas += origemRows.length;
      if (APPLY) {
        for (const row of origemRows) {
          const { error: updError } = await supabase.from(tabela).update({ programacao_id: programacaoIdHoje }).eq('id', row.id);
          if (updError) log('ERROR', `  ${tabela} id=${row.id}: falha ao reancorar: ${updError.message}`);
        }
      }
    }

    const { data: extrasOrigem, error: extrasError } = await supabase
      .from('programacao_extras').select('id,colaborador_id').eq('data_referencia', hoje).in('colaborador_id', colaboradorIds).neq('programacao_id', programacaoIdHoje);
    if (extrasError) { log('ERROR', `${supervisao}/extras: falha ao buscar origem: ${extrasError.message}`); }
    else if (extrasOrigem?.length) {
      log('INFO', `  programacao_extras: reancorando ${extrasOrigem.length} linha(s)`);
      totalDespesasReancoradas += extrasOrigem.length;
      if (APPLY) {
        for (const row of extrasOrigem) {
          const { error: updError } = await supabase.from('programacao_extras').update({ programacao_id: programacaoIdHoje }).eq('id', row.id);
          if (updError) log('ERROR', `  extras id=${row.id}: falha ao reancorar: ${updError.message}`);
        }
      }
    }
  }

  log('SUCCESS', `Concluído: ${totalConfirmacoes} confirmação(ões) ${APPLY ? 'gravada(s)' : 'a gravar'}, ${totalDespesasReancoradas} despesa(s) ${APPLY ? 'reancorada(s)' : 'a reancorar'}.`);
}

main().catch((error) => { log('ERROR', error.stack || error.message); process.exitCode = 1; });
