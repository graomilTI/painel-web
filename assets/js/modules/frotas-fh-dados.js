// Frotas — Fora do horário — busca, sincronização com o BFleet e ações (notificar, recalcular).
// Extraído de modules/frotas.js em 14/10/2026 (era um único bloco autoexecutável de ~4.100 linhas).
// O código das funções e constantes foi movido sem alteração. Para publicar uma mudança em qualquer
// módulo frotas-*.js deste conjunto, troque o token ?v=20261015-frotas-dos1 em TODOS os imports internos (e os do
// carregador da página): o teste tests/frotas-modulos-versao.test.mjs garante que fiquem iguais.
import { BFLEET_EXCESSO_FUNCTION, BFLEET_FORA_HORARIO_FUNCTION, BFLEET_FORA_HORARIO_REPORT_ID, FORA_HORARIO_DOSSIE_FUNCTION, FORA_HORARIO_LISTA_COLUNAS, state, resolveSupabase, formatDateBR, callEdgeFunction, copyText, toast } from './frotas-base.js?v=20261015-frotas-dos1';
import { fetchImportedExcessos } from './frotas-excessos-dados.js?v=20261015-frotas-dos1';
import { readForaHorarioReportPeriod, formatKmForaHorario, formatMoneyForaHorario, fhAtualizarStatusExcessos } from './frotas-fh-util.js?v=20261015-frotas-dos1';
import { atualizarRodapeDossie, fhRenderDossieAberto, renderForaHorarioList } from './frotas-fh-dossie.js?v=20261015-frotas-dos1';

  async function sincronizarForaHorario(root, opts = {}, mode = 'yesterday') {
    const isPeriod = mode === 'period';
    const btn = root.querySelector(isPeriod ? '[data-sync-bfleet-fora-horario-periodo]' : '[data-sync-bfleet-fora-horario]');
    const originalText = btn?.textContent || (isPeriod ? 'Sincronizar período' : 'Sincronizar ontem');
    try {
      if (btn) {
        btn.disabled = true;
        btn.textContent = 'Sincronizando...';
      }

      const body = { mode: 'sync', forceRefreshToken: true, reportId: BFLEET_FORA_HORARIO_REPORT_ID, rangeTimeVal: 'yesterday' };
      let label = 'yesterday';

      if (isPeriod) {
        const { start, end } = readForaHorarioReportPeriod(root);
        if (!start || !end) {
          toast('Informe a data inicial e a data final do relatório para sincronizar o período.', 'error');
          return;
        }
        if (start > end) {
          toast('A data inicial do relatório não pode ser maior que a data final.', 'error');
          return;
        }
        body.dataInicial = start;
        body.dataFinal = end;
        body.startDate = start;
        body.endDate = end;
        delete body.rangeTimeVal;
        label = `${formatDateBR(start)} a ${formatDateBR(end)}`;
      }

      // Excessos de velocidade do mesmo período (antes tinham botão próprio na aba "Excessos em lote").
      try {
        toast(`Sincronizando excessos de velocidade da BFleet (${label})...`);
        const resExcessos = await callEdgeFunction(opts, BFLEET_EXCESSO_FUNCTION, { mode: 'sync', forceRefreshToken: true, preferWebReport: true,
          ...(isPeriod ? { dataInicial: body.dataInicial, dataFinal: body.dataFinal, startDate: body.startDate, endDate: body.endDate } : { rangeTimeVal: 'yesterday' }) });
        const novos = Number(resExcessos?.inserted || resExcessos?.inseridos || resExcessos?.created || resExcessos?.novos || 0);
        toast(`Excessos de velocidade sincronizados: ${novos} novo(s).`, 'success');
        await fetchImportedExcessos(root, opts);
      } catch (excessoErr) {
        console.error('[FROTAS] Sync BFleet excesso:', excessoErr);
        toast(excessoErr.message || 'Não foi possível sincronizar os excessos de velocidade.', 'error');
      }

      toast(`Sincronizando relatório Fora do horário da BFleet (${label})...`);
      const res = await callEdgeFunction(opts, BFLEET_FORA_HORARIO_FUNCTION, body);
      if (res?.em_andamento) {
        // A BFleet leva alguns minutos no relatório pesado: a function segue gravando em segundo plano.
        toast('A BFleet ainda está gerando o relatório. A sincronização continua em segundo plano — atualize a lista em alguns minutos.');
        return;
      }
      const inserted = Number(res?.inserted || res?.inseridos || res?.created || res?.novos || 0);
      const updated = Number(res?.updated || res?.atualizados || 0);
      const total = Number(res?.total || res?.total_registros || res?.linhas || inserted + updated || 0);
      const errors = Number(res?.errors || res?.erros || 0);
      toast(`BFleet sincronizado: ${total || 'N'} registro(s) lido(s), ${inserted} novo(s), ${updated} atualizado(s)${errors ? ` · ${errors} erro(s)` : ''}.`, errors ? 'error' : 'success');
      // Refaz o dossiê (cruza viagens × informativos × produção × celular) do período recém-sincronizado e recarrega a lista.
      await recalcularDossieForaHorario(root, opts, { silencioso: true });
    } catch (err) {
      console.error('[FROTAS] Sync BFleet fora do horário:', err);
      toast(err.message || 'Falha ao sincronizar relatório Fora do horário da BFleet.', 'error');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = originalText;
      }
    }
  }

  async function fetchForaHorario(root, opts = {}, periodOverride = null) {
    const supabase = resolveSupabase(opts);
    if (!supabase || typeof supabase.from !== 'function') {
      state.foraHorarioLoaded = true;
      renderForaHorarioList(root);
      return;
    }

    // Se a data mudar de novo enquanto esta consulta roda, só a última resposta vale.
    const pedido = ++state.foraHorarioPedido;
    try {
      state.foraHorarioLoaded = false;
      renderForaHorarioList(root);
      const period = periodOverride || readForaHorarioReportPeriod(root);

      // O PostgREST devolve no máximo 1000 linhas por chamada: pagina até acabar (teto de 5 mil).
      const paginar = async (montar) => {
        const rows = [];
        for (let from = 0; from < 5000; from += 1000) {
          const { data, error } = await montar().range(from, from + 999);
          if (error) throw error;
          const page = Array.isArray(data) ? data : [];
          rows.push(...page);
          if (page.length < 1000) break;
        }
        return rows;
      };

      // O dossiê é calculado todo dia de madrugada e fica no banco: aqui só se lê (view já junta ocorrência + dossiê).
      state.foraHorarioDossieDisponivel = true;
      const lerLista = async () => {
        try {
          return await paginar(() => {
            let query = supabase.from('frotas_fora_horario_lista').select(FORA_HORARIO_LISTA_COLUNAS);
            if (period.start) query = query.gte('data_evento', period.start);
            if (period.end) query = query.lte('data_evento', period.end);
            return query.order('data_evento', { ascending: false }).order('placa', { ascending: true });
          });
        } catch (listaErr) {
          // Ambiente sem a view: cai para o relatório bruto, sem dossiê.
          console.warn('[FROTAS] Lista do dossiê indisponível:', listaErr);
          state.foraHorarioDossieDisponivel = false;
          return paginar(() => {
            let query = supabase.from('frotas_fora_horario_ocorrencias')
              .select('id,data_evento,placa,motorista,km_00_05,valor_km,valor_caixa,status_calculo,status_notificacao,status_caixa');
            if (period.start) query = query.gte('data_evento', period.start);
            if (period.end) query = query.lte('data_evento', period.end);
            return query.order('data_evento', { ascending: false }).order('placa', { ascending: true });
          });
        }
      };
      const lerControle = async () => {
        try {
          let query = supabase.from('frotas_fora_horario_sync_dia').select('data_evento,status,dossie_em,atualizado_em');
          if (period.start) query = query.gte('data_evento', period.start);
          if (period.end) query = query.lte('data_evento', period.end);
          const { data, error } = await query.order('data_evento', { ascending: false }).limit(62);
          if (error) throw error;
          return Array.isArray(data) ? data : [];
        } catch (controleErr) {
          console.warn('[FROTAS] Andamento da sincronização indisponível:', controleErr);
          return [];
        }
      };

      const lerFeriados = async () => {
        try {
          let query = supabase.from('frotas_feriados').select('data,nome');
          if (period.start) query = query.gte('data', period.start);
          if (period.end) query = query.lte('data', period.end);
          const { data, error } = await query;
          if (error) throw error;
          return Array.isArray(data) ? data : [];
        } catch (feriadosErr) {
          console.warn('[FROTAS] Feriados indisponíveis:', feriadosErr);
          return [];
        }
      };

      const [linhas, controle, feriados] = await Promise.all([lerLista(), lerControle(), lerFeriados()]);
      if (pedido !== state.foraHorarioPedido) return;
      state.foraHorarioSync = controle;
      state.foraHorarioFeriados = Object.fromEntries(feriados.map((f) => [f.data, f.nome]));
      state.foraHorario = linhas.map((linha) => ({
        ...linha,
        semOcorrencia: !!linha.sem_ocorrencia,
        dossie: linha.dossie_id ? linha : null
      }));
    } catch (err) {
      if (pedido !== state.foraHorarioPedido) return;
      console.warn('[FROTAS] Não foi possível carregar ocorrências de fora do horário:', err);
      state.foraHorario = [];
      state.foraHorarioSync = [];
    }
    state.foraHorarioLoaded = true;
    renderForaHorarioList(root);
  }

  async function agirForaHorario(root, opts, rowId, action) {
    const supabase = resolveSupabase(opts);
    if (!supabase || typeof supabase.rpc !== 'function') return toast('Supabase indisponível.', 'error');
    const row = (state.foraHorario || []).find((item) => String(item.id) === String(rowId));
    if (!row) return toast('Ocorrência não localizada.', 'error');

    let justificativa = null;
    if (action === 'JUSTIFICAR') {
      justificativa = window.prompt('Informe a justificativa para o uso do veículo fora do expediente:');
      if (justificativa === null) return;
      justificativa = String(justificativa || '').trim();
      if (!justificativa) return toast('Informe a justificativa.', 'error');
    }

    if (action === 'CAIXA') {
      const km = Number(row.km_00_05 || 0);
      if (!(km > 0)) return toast('A quilometragem entre 00h e 04h ainda não foi calculada.', 'error');
      const valor = km * Number(row.valor_km || 4);
      const ok = window.confirm(`Enviar ao Caixa: ${formatKmForaHorario(km)} km × R$ 4,00 = ${formatMoneyForaHorario(valor)}?`);
      if (!ok) return;
    }

    try {
      const { data, error } = await supabase.rpc('frotas_fora_horario_acao_v2', {
        p_ocorrencia_id: row.id,
        p_acao: action,
        p_justificativa: justificativa
      });
      if (error) throw error;

      if (action === 'GERAR') {
        const message = String(data?.message || '');
        if (message) {
          try { await navigator.clipboard.writeText(message); } catch (_) {}
          toast('Notificação gerada e copiada.');
        } else {
          toast('Notificação gerada.');
        }
      } else if (action === 'JUSTIFICAR') {
        toast('Justificativa registrada.');
      } else if (action === 'CAIXA') {
        const agentReady = data?.agent_ready !== false;
        const valor = formatMoneyForaHorario(data?.valor || (Number(row.km_00_05 || 0) * 4));
        toast(agentReady ? `Lançamento de ${valor} enviado ao Caixa.` : `Lançamento de ${valor} preparado; agente do Caixa ainda está desativado.`, agentReady ? 'success' : 'error');
      }

      await fetchForaHorario(root, opts);
    } catch (err) {
      console.error('[FROTAS] Ação fora do horário:', err);
      toast(err.message || 'Não foi possível concluir a ação.', 'error');
    }
  }

  // Gera a notificação única do dia (fora do horário + excesso), copia o texto e atualiza lista, prints e dossiê aberto.
  async function fhNotificarDia(root, opts, dataDia) {
    const dos = state.foraHorarioDossieAberto;
    const supabase = resolveSupabase(opts);
    if (!dos || !supabase || typeof supabase.rpc !== 'function') return toast('Dossiê não carregado.', 'error');
    try {
      const { data, error } = await supabase.rpc('frotas_dossie_notificar', { p_data: dataDia || dos.data_evento, p_placa: dos.placa });
      if (error) throw error;
      const mensagem = String(data?.message || '');
      if (mensagem) { try { await copyText(mensagem); } catch (_) { /* a mensagem fica no banco; segue sem copiar */ } }
      const partes = [data?.fora_horario ? 'uso fora do horário' : '', data?.excesso ? 'excesso de velocidade' : ''].filter(Boolean).join(' e ');
      toast(mensagem ? `Notificação gerada e copiada (${partes}).` : `Notificação gerada (${partes}).`);
      await Promise.all([fetchForaHorario(root, opts), fetchImportedExcessos(root, opts)]);
      await fhAtualizarStatusExcessos(supabase, dos);
      fhRenderDossieAberto(root);
      atualizarRodapeDossie(root);
    } catch (err) {
      console.error('[FROTAS] Notificação do dia:', err);
      toast(err.message || 'Não foi possível gerar a notificação.', 'error');
    }
  }

  // Recalcula os dossiês do período pela Edge Function (a RPC é pesada demais para o papel `authenticated`).
  async function recalcularDossieForaHorario(root, opts = {}, { silencioso = false } = {}) {
    if (state.foraHorarioRecalculando) return;
    const { start, end } = readForaHorarioReportPeriod(root);
    if (!start || !end) { if (!silencioso) toast('Informe a data inicial e a final para recalcular o dossiê.', 'error'); return; }
    if (start > end) { if (!silencioso) toast('A data inicial não pode ser maior que a data final.', 'error'); return; }

    const dias = [];
    for (let cursor = new Date(`${start}T12:00:00Z`); cursor <= new Date(`${end}T12:00:00Z`) && dias.length <= 40; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
      dias.push(cursor.toISOString().slice(0, 10));
    }
    if (dias.length > 31) { toast('Recalcule no máximo 31 dias por vez.', 'error'); return; }

    const btn = root.querySelector('[data-recalcular-dossie]');
    const textoOriginal = btn?.textContent || 'Recalcular dossiê';
    state.foraHorarioRecalculando = true;
    if (btn) btn.disabled = true;
    let erros = 0;
    let gerados = 0;
    try {
      for (let i = 0; i < dias.length; i += 3) {
        const lote = dias.slice(i, i + 3);
        if (btn) btn.textContent = `Recalculando ${Math.min(i + lote.length, dias.length)}/${dias.length}...`;
        try {
          const res = await callEdgeFunction(opts, FORA_HORARIO_DOSSIE_FUNCTION, { dataInicial: lote[0], dataFinal: lote[lote.length - 1] });
          gerados += Number(res?.dossies || 0);
          erros += Number(res?.erros || 0);
        } catch (err) {
          erros += lote.length;
          console.error('[FROTAS] Recalcular dossiê:', err);
          if (!silencioso) toast(err.message || 'Falha ao recalcular o dossiê.', 'error');
        }
      }
      if (!silencioso || erros) {
        toast(erros ? `Dossiê recalculado com ${erros} falha(s): ${gerados} veículo(s)/dia gerado(s).` : `Dossiê recalculado: ${gerados} veículo(s)/dia.`, erros ? 'error' : 'success');
      }
    } finally {
      state.foraHorarioRecalculando = false;
      if (btn) { btn.disabled = false; btn.textContent = textoOriginal; }
    }
    await fetchForaHorario(root, opts, { start, end });
  }

export { sincronizarForaHorario, fetchForaHorario, agirForaHorario, fhNotificarDia, recalcularDossieForaHorario };
