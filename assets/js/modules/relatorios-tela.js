// Relatórios — importação — tela de importação (openHome) e orquestração do envio (uploadAndRegister).
// Extraído de modules/relatorios.js em 15/10/2026 (era um único bloco autoexecutável de ~3.900 linhas).
// O código das funções e constantes foi movido sem alteração. Para publicar uma mudança em qualquer
// módulo relatorios-*.js, troque o token ?v=20261015-relatorios1 em TODOS os imports internos e no carregador
// (assets/js/relatorio-importador.js): tests/relatorios-modulos-versao.test.mjs garante que fiquem iguais.
import { importarColaboradoresRhDaPlanilha, importarColaboradoresBaseDaPlanilha } from './relatorios-colaboradores.js?v=20261015-relatorios1';
import { importarFinanceiroReceberDaPlanilha, importarFinanceiroPagarDaPlanilha, importarDespesasDaPlanilha } from './relatorios-financeiro.js?v=20261015-relatorios1';
import { importarUberCorridasDaPlanilha, importarPatrimoniosDaPlanilha, importarFrotasExcessoVelocidadeDaPlanilha } from './relatorios-frotas.js?v=20261015-relatorios1';
import { importarPontosEmbarqueDaPlanilha, importarAuditoriasOperacionalDaPlanilha, importarClinicasSstDaPlanilha, readBtgLogisticaRowsFromFile, importarBtgLogisticaDaPlanilha, readDistribuicaoOsRowsFromFile, importarDistribuicaoOsDaPlanilha } from './relatorios-operacional.js?v=20261015-relatorios1';
import { readResultadoDiarioRowsFromFile, importarResultadoDiarioDaPlanilha, readProducaoDiariaRowsFromFile, detectarProducaoDiariaPorConteudo, importarProducaoDiariaDaPlanilha } from './relatorios-producao.js?v=20261015-relatorios1';
import { detectarHoteisPorConteudo, readHospedagemHistoricoRowsFromFile, importarHospedagemHistoricoDaPlanilha, detectarHospedagemHistoricoPorConteudo, importarHoteisDaPlanilha } from './relatorios-hospedagem.js?v=20261015-relatorios1';
import { BUCKET, isEnterpriseUpload, checkExistingPeriod, registerSmartImport, isAllowedFile, invalidateDashboardCacheAfterImport, buildStoragePath, setProgress, uploadFileSmart } from './relatorios-upload.js?v=20261015-relatorios1';
import { detectFilePeriod, detectRelatorio } from './relatorios-deteccao.js?v=20261015-relatorios1';
import { styles } from './relatorios-estilos.js?v=20261015-relatorios1';

  const MONEY_FMT = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

  const state = {
    files: [],
    running: false,
    imported: 0,
    errors: 0,
  };

  function humanSize(bytes) {
    const value = Number(bytes || 0);
    if (value < 1024) return `${value} B`;
    if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
    return `${(value / 1024 / 1024).toFixed(1)} MB`;
  }

  function uploadModeLabel(file) {
    return isEnterpriseUpload(file) ? 'ENTERPRISE · CHUNKS' : 'SEGURO';
  }

  function formatPeriod(period) {
    if (!period?.inicio || !period?.fim) return 'período não detectado';
    const br = (iso) => String(iso).slice(0, 10).split('-').reverse().join('/');
    return period.inicio === period.fim ? br(period.inicio) : `${br(period.inicio)} a ${br(period.fim)}`;
  }

  function setButton(btn, mode, label) {
    btn.classList.remove('is-error', 'is-success');
    if (mode) btn.classList.add(mode);
    btn.innerHTML = label;
  }

  async function uploadAndRegister({ file, item, bar, status, entry }, opts) {
    const supabase = opts.supabase;
    let detected = entry?.detected || detectRelatorio(file.name);
    detected = await detectarProducaoDiariaPorConteudo(file, detected);
    detected = await detectarHospedagemHistoricoPorConteudo(file, detected);
    detected = await detectarHoteisPorConteudo(file, detected);
    if (entry) entry.detected = detected;
    const path = buildStoragePath(file);
    const user = opts.user || opts.auth?.user || null;
    const userMeta = user?.user_metadata || {};
    const userName = userMeta.full_name || userMeta.name || user?.email || null;

    status.textContent = isEnterpriseUpload(file) ? 'Iniciando upload enterprise...' : 'Gerando upload seguro...';
    setProgress(bar, 12);

    const uploadResult = await uploadFileSmart({ file, path, opts, bar, status });
    const finalStoragePath = uploadResult.storagePath || path;

    setProgress(bar, 72);
    status.textContent = 'Registrando importação...';

    let publicUrl = null;
    try {
      const { data } = supabase.storage.from(BUCKET).getPublicUrl(finalStoragePath);
      publicUrl = data?.publicUrl || null;
    } catch (_) {
      publicUrl = null;
    }

    let hoteisResumo = null;
    let hospedagemHistoricoResumo = null;
    let pontosResumo = null;
    let colaboradoresResumo = null;
    let colaboradoresRhResumo = null;
    let auditoriasResumo = null;
    let uberResumo = null;
    let patrimoniosResumo = null;
    let frotasExcessoResumo = null;
    let resultadoDiarioResumo = null;
    let despesasResumo = null;
    let producaoDiariaResumo = null;
    let financeiroReceberResumo = null;
    let financeiroPagarResumo = null;
    let clinicasResumo = null;
    let distribuicaoOsResumo = null;
    let btgLogisticaResumo = null;
    if (detected.tipo === 'hospedagem_historico') {
      status.textContent = 'Importando histórico de hospedagem dos colaboradores...';
      setProgress(bar, 82);
      hospedagemHistoricoResumo = await importarHospedagemHistoricoDaPlanilha(file, opts);
      if (hospedagemHistoricoResumo?.periodo_inicio) entry.period = { inicio: hospedagemHistoricoResumo.periodo_inicio, fim: hospedagemHistoricoResumo.periodo_fim, totalDatas: hospedagemHistoricoResumo.total_datas || null };
    }
    if (detected.tipo === 'hoteis') {
      status.textContent = 'Importando hotéis no módulo Hospedagem...';
      setProgress(bar, 82);
      hoteisResumo = await importarHoteisDaPlanilha(file, opts);
    }
    if (detected.tipo === 'pontos_embarque') {
      status.textContent = 'Importando pontos no módulo Operacional...';
      setProgress(bar, 82);
      pontosResumo = await importarPontosEmbarqueDaPlanilha(file, opts);
    }
    if (detected.tipo === 'colaboradores_operacional') {
      status.textContent = 'Importando endereços dos colaboradores no módulo Operacional...';
      setProgress(bar, 82);
      colaboradoresResumo = await importarColaboradoresBaseDaPlanilha(file, opts);
    }
    if (detected.tipo === 'colaboradores_rh') {
      status.textContent = 'Importando base de funcionários no RH...';
      setProgress(bar, 82);
      colaboradoresRhResumo = await importarColaboradoresRhDaPlanilha(file, opts);
    }
    if (detected.tipo === 'auditorias_operacional') {
      status.textContent = 'Importando histórico de auditorias no módulo Operacional...';
      setProgress(bar, 82);
      auditoriasResumo = await importarAuditoriasOperacionalDaPlanilha(file, opts);
    }
    if (detected.tipo === 'uber_corridas') {
      status.textContent = 'Importando corridas Uber na Conferência...';
      setProgress(bar, 82);
      uberResumo = await importarUberCorridasDaPlanilha(file, opts);
    }
    if (detected.tipo === 'patrimonios') {
      status.textContent = 'Importando leitura de patrimônios para cruzamento de frota...';
      setProgress(bar, 82);
      patrimoniosResumo = await importarPatrimoniosDaPlanilha(file, opts);
    }
    if (detected.tipo === 'frotas_excesso_velocidade') {
      status.textContent = 'Importando excessos de velocidade e cruzando com patrimônios...';
      setProgress(bar, 82);
      frotasExcessoResumo = await importarFrotasExcessoVelocidadeDaPlanilha(file, opts);
    }
    if (detected.tipo === 'despesas') {
      status.textContent = 'Consolidando Despesas por Regional para cálculo de bônus...';
      setProgress(bar, 82);
      try {
        despesasResumo = await importarDespesasDaPlanilha(file, opts);
      } catch (err) {
        console.warn('[RELATORIOS] Despesas: não foi possível consolidar no banco:', err?.message || err);
      }
    }
    if (detected.tipo === 'resultado-diario') {
      status.textContent = 'Consolidando Resultado Diário no banco para acelerar o DRE...';
      setProgress(bar, 82);
      resultadoDiarioResumo = await importarResultadoDiarioDaPlanilha(file, opts, entry?.period || null);
      if (resultadoDiarioResumo?.periodo_inicio) entry.period = { inicio: resultadoDiarioResumo.periodo_inicio, fim: resultadoDiarioResumo.periodo_fim, totalDatas: null };
    }
    if (detected.tipo === 'producao') {
      status.textContent = 'Consolidando Produção Diária no banco para pagamentos do Financeiro...';
      setProgress(bar, 82);
      producaoDiariaResumo = await importarProducaoDiariaDaPlanilha(file, opts);
      if (producaoDiariaResumo?.periodo_inicio) entry.period = { inicio: producaoDiariaResumo.periodo_inicio, fim: producaoDiariaResumo.periodo_fim, totalDatas: producaoDiariaResumo.total_datas || null };
    }
    if (detected.tipo === 'financeiro_contas_receber') {
      status.textContent = 'Importando Contas a Receber no módulo Financeiro...';
      setProgress(bar, 82);
      financeiroReceberResumo = await importarFinanceiroReceberDaPlanilha(file, opts);
      if (financeiroReceberResumo?.periodo_inicio) entry.period = { inicio: financeiroReceberResumo.periodo_inicio, fim: financeiroReceberResumo.periodo_fim, totalDatas: null };
    }
    if (detected.tipo === 'financeiro_contas_pagar') {
      status.textContent = 'Importando Contas a Pagar no módulo Financeiro...';
      setProgress(bar, 82);
      financeiroPagarResumo = await importarFinanceiroPagarDaPlanilha(file, opts);
      if (financeiroPagarResumo?.periodo_inicio) entry.period = { inicio: financeiroPagarResumo.periodo_inicio, fim: financeiroPagarResumo.periodo_fim, totalDatas: null };
    }
    if (detected.tipo === 'clinicas_sst') {
      status.textContent = 'Importando clínicas SST no módulo RH...';
      setProgress(bar, 82);
      clinicasResumo = await importarClinicasSstDaPlanilha(file, opts);
    }

    if (detected.tipo === 'operacional_os_distribuicao') {
      status.textContent = 'Salvando Distribuição de O.S. para conferência no BTG...';
      setProgress(bar, 82);
      distribuicaoOsResumo = await importarDistribuicaoOsDaPlanilha(file, opts);
    }
    if (detected.tipo === 'logistica_btg') {
      status.textContent = 'Salvando solicitações BTG para conferência da equipe...';
      setProgress(bar, 82);
      btgLogisticaResumo = await importarBtgLogisticaDaPlanilha(file, opts);
    }

    const importMode = opts.importMode || 'auto';
    let period = null;
    if (!['hoteis', 'pontos_embarque', 'colaboradores_operacional', 'colaboradores_rh', 'auditorias_operacional', 'patrimonios', 'clinicas_sst', 'operacional_os_distribuicao', 'logistica_btg'].includes(detected.tipo)) {
      if (hospedagemHistoricoResumo?.periodo_inicio) period = { inicio: hospedagemHistoricoResumo.periodo_inicio, fim: hospedagemHistoricoResumo.periodo_fim, totalDatas: hospedagemHistoricoResumo.total_datas || null };
      else if (resultadoDiarioResumo?.periodo_inicio) period = { inicio: resultadoDiarioResumo.periodo_inicio, fim: resultadoDiarioResumo.periodo_fim, totalDatas: null };
      else if (producaoDiariaResumo?.periodo_inicio) period = { inicio: producaoDiariaResumo.periodo_inicio, fim: producaoDiariaResumo.periodo_fim, totalDatas: producaoDiariaResumo.total_datas || null };
      else if (financeiroReceberResumo?.periodo_inicio) period = { inicio: financeiroReceberResumo.periodo_inicio, fim: financeiroReceberResumo.periodo_fim, totalDatas: null };
      else if (financeiroPagarResumo?.periodo_inicio) period = { inicio: financeiroPagarResumo.periodo_inicio, fim: financeiroPagarResumo.periodo_fim, totalDatas: null };
      else if (frotasExcessoResumo?.periodo_inicio) period = { inicio: frotasExcessoResumo.periodo_inicio, fim: frotasExcessoResumo.periodo_fim, totalDatas: null };
      else period = entry?.period || await detectFilePeriod(file, detected.tipo);
    }
    let check = { exists: false, total: 0, items: [] };

    if (period?.inicio && period?.fim) {
      status.textContent = 'Verificando período existente...';
      check = await checkExistingPeriod({ tipo: detected.tipo, period, opts });
    }

    const effectiveMode = importMode === 'auto'
      ? (check.exists ? 'replace' : 'append')
      : importMode;

    if (detected.tipo === 'hospedagem_historico') status.textContent = 'Registrando upload do histórico de hospedagem...';
    else if (detected.tipo === 'hoteis') status.textContent = 'Registrando upload da planilha de hotéis...';
    else if (detected.tipo === 'pontos_embarque') status.textContent = 'Registrando upload dos pontos de embarque...';
    else if (detected.tipo === 'logistica_mapa_embarque') status.textContent = 'Registrando Mapa de Embarque para Logística...';
    else if (detected.tipo === 'colaboradores_operacional') status.textContent = 'Registrando upload dos endereços dos colaboradores...';
    else if (detected.tipo === 'colaboradores_rh') status.textContent = 'Registrando upload da base de funcionários...';
    else if (detected.tipo === 'auditorias_operacional') status.textContent = 'Registrando upload das auditorias operacionais...';
    else if (detected.tipo === 'operacional_os_distribuicao') status.textContent = 'Registrando upload da Distribuição de O.S....';
    else if (detected.tipo === 'logistica_btg') status.textContent = 'Registrando upload das solicitações BTG...';
    else if (detected.tipo === 'uber_corridas') status.textContent = 'Registrando upload do relatório Uber...';
    else status.textContent = effectiveMode === 'replace' ? 'Registrando substituição inteligente...' : 'Registrando complemento inteligente...';

    const observacoesPayload = uploadResult.mode === 'chunked'
      ? {
          upload_mode: 'chunked',
          pipeline: 'browser-chunks-no-worker-merge',
          original_path: path,
          total_chunks: uploadResult.manifest?.total_chunks || 0,
          original_size: file.size,
          manifest: uploadResult.manifest,
        }
      : {
          upload_mode: 'single',
          pipeline: 'signed-url',
        };

    const payload = {
      mode: effectiveMode,
      check,
      importacao: {
        tipo_relatorio: detected.tipo,
        titulo_relatorio: detected.titulo,
        arquivo_nome_original: file.name,
        arquivo_nome_storage: finalStoragePath.split('/').pop(),
        storage_bucket: BUCKET,
        storage_path: finalStoragePath,
        tamanho_bytes: file.size || 0,
        mime_type: file.type || null,
        status: 'enviado',
        observacoes: JSON.stringify({
          ...observacoesPayload,
          import_mode_requested: importMode,
          import_mode_effective: effectiveMode,
          periodo: period || null,
          hoteis_importacao: hoteisResumo || null,
          hospedagem_historico_importacao: hospedagemHistoricoResumo || null,
          pontos_embarque_importacao: pontosResumo || null,
          colaboradores_operacional_importacao: colaboradoresResumo || null,
          colaboradores_rh_importacao: colaboradoresRhResumo || null,
          auditorias_operacional_importacao: auditoriasResumo || null,
          uber_corridas_importacao: uberResumo || null,
          patrimonios_importacao: patrimoniosResumo || null,
          frotas_excesso_velocidade_importacao: frotasExcessoResumo || null,
          resultado_diario_importacao: resultadoDiarioResumo || null,
          producao_diaria_importacao: producaoDiariaResumo || null,
          financeiro_contas_receber_importacao: financeiroReceberResumo || null,
          financeiro_contas_pagar_importacao: financeiroPagarResumo || null,
          clinicas_sst_importacao: clinicasResumo || null,
          distribuicao_os_importacao: distribuicaoOsResumo || null,
          btg_logistica_importacao: btgLogisticaResumo || null,
          replaced_count: effectiveMode === 'replace' ? Number(check.total || 0) : 0,
        }),
        importado_por: user?.id || null,
        importado_por_nome: userName,
        nome_arquivo: file.name,
        tipo: detected.tipo,
        path: finalStoragePath,
        url: publicUrl,
        usuario_id: user?.id || null,
        usuario_nome: userName,
        usuario_email: user?.email || null,
        periodo_inicio: period?.inicio || null,
        periodo_fim: period?.fim || null,
        modo_importacao: effectiveMode,
        substitui_importacoes: effectiveMode === 'replace' ? (check.items || []).map((x) => x.id) : [],
        total_periodo_registros: period?.totalDatas || null,
      }
    };

    const result = await registerSmartImport(payload, opts);
    if (detected.tipo === 'hospedagem_historico' && hospedagemHistoricoResumo) {
      status.textContent = `Hospedagem: ${hospedagemHistoricoResumo.importados || 0} registros · ${hospedagemHistoricoResumo.colaboradores || 0} colaboradores · ${hospedagemHistoricoResumo.checkouts || 0} checkout(s)`;
    } else if (detected.tipo === 'hoteis' && hoteisResumo) {
      status.textContent = `Hotéis: ${hoteisResumo.inseridos || 0} novos · ${hoteisResumo.atualizados || 0} atualizados · ${hoteisResumo.ignorados || 0} ignorados`;
    } else if (detected.tipo === 'pontos_embarque' && pontosResumo) {
      status.textContent = `Pontos: ${pontosResumo.importados || 0} importados · ${pontosResumo.cidades || 0} cidades · ${pontosResumo.supervisoes || 0} supervisões`;
    } else if (detected.tipo === 'logistica_mapa_embarque') {
      status.textContent = `Mapa de Embarque importado · disponível para Logística${period?.inicio ? ` · ${formatPeriod(period)}` : ''}`;
    } else if (detected.tipo === 'colaboradores_operacional' && colaboradoresResumo) {
      status.textContent = `Colaboradores: ${colaboradoresResumo.importados || 0} endereços importados · ${colaboradoresResumo.cidades || 0} cidades · ${colaboradoresResumo.ufs || 0} UFs`;
    } else if (detected.tipo === 'colaboradores_rh' && colaboradoresRhResumo) {
      status.textContent = `Funcionários: ${colaboradoresRhResumo.importados || 0} importados · ${colaboradoresRhResumo.ativos || 0} ativos · base atualizada`;
    } else if (detected.tipo === 'auditorias_operacional' && auditoriasResumo) {
      status.textContent = `Auditorias: ${auditoriasResumo.importados || 0} registros · ${auditoriasResumo.colaboradores || 0} colaboradores · ${auditoriasResumo.descontos || 0} descontos`;
    } else if (detected.tipo === 'uber_corridas' && uberResumo) {
      status.textContent = `Uber: ${uberResumo.importados || 0} corridas · ${uberResumo.colaboradores || 0} colaboradores · ${MONEY_FMT.format(uberResumo.valor_total || 0)}`;
    } else if (detected.tipo === 'patrimonios' && patrimoniosResumo) {
      status.textContent = `Patrimônios: ${patrimoniosResumo.importados || 0} atualizados · ${patrimoniosResumo.veiculos || 0} veículos · ${Number(patrimoniosResumo.frotas_associadas?.veiculos_atualizados || 0)} motorista(s) associados em Frotas`;
    } else if (detected.tipo === 'frotas_excesso_velocidade' && frotasExcessoResumo) {
      status.textContent = `Frotas: ${frotasExcessoResumo.importados || 0} excessos · ${frotasExcessoResumo.identificados || 0} identificados · ${frotasExcessoResumo.pendentes || 0} pendentes`;
    } else if (detected.tipo === 'despesas' && despesasResumo?.total) {
      status.textContent = `Despesas: ${despesasResumo.total} registros · ${despesasResumo.regionais} regionais · ${despesasResumo.meses} meses · bônus atualizado`;
    } else if (detected.tipo === 'resultado-diario' && resultadoDiarioResumo) {
      status.textContent = `Resultado Diário: ${resultadoDiarioResumo.importados || 0} linhas consolidadas · ${Number(resultadoDiarioResumo.toneladas || 0).toLocaleString('pt-BR')} tons · DRE rápido`;
    } else if (detected.tipo === 'producao' && producaoDiariaResumo) {
      status.textContent = `Produção Diária: ${producaoDiariaResumo.importados || 0} linhas · ${producaoDiariaResumo.colaboradores || 0} colaboradores · Financeiro liberado`;
    } else if (detected.tipo === 'financeiro_contas_receber' && financeiroReceberResumo) {
      status.textContent = `Financeiro Receber: ${financeiroReceberResumo.importados || 0} títulos atualizados · ${formatPeriod({ inicio: financeiroReceberResumo.periodo_inicio, fim: financeiroReceberResumo.periodo_fim })} · ${MONEY_FMT.format(financeiroReceberResumo.valor_total || 0)}`;
    } else if (detected.tipo === 'financeiro_contas_pagar' && financeiroPagarResumo) {
      status.textContent = `Financeiro Pagar: ${financeiroPagarResumo.importados || 0} títulos atualizados · ${formatPeriod({ inicio: financeiroPagarResumo.periodo_inicio, fim: financeiroPagarResumo.periodo_fim })} · ${MONEY_FMT.format(financeiroPagarResumo.valor_total || 0)}`;
    } else if (detected.tipo === 'clinicas_sst' && clinicasResumo) {
      status.textContent = `Clínicas SST: ${clinicasResumo.importados || 0} clínicas · ${clinicasResumo.estados || 0} estado(s) · ${clinicasResumo.cidades || 0} cidade(s)`;
    } else if (detected.tipo === 'operacional_os_distribuicao' && distribuicaoOsResumo) {
      status.textContent = `Distribuição de O.S.: ${distribuicaoOsResumo.importados || 0} vínculos salvos · ${distribuicaoOsResumo.ignorados_sem_lista_os || 0} ignorados sem Lista de O.S.`;
    } else if (detected.tipo === 'logistica_btg' && btgLogisticaResumo) {
      status.textContent = `BTG: ${btgLogisticaResumo.importados || 0} solicitações com contrato válido salvas`;
    } else if (result?.mode === 'replace' && result?.replaced_count) {
      status.textContent = `Importado · substituiu ${result.replaced_count} versão(ões)`;
    }

    setProgress(bar, 100);
    if (!(detected.tipo === 'hospedagem_historico' && hospedagemHistoricoResumo) && !(detected.tipo === 'hoteis' && hoteisResumo) && !(detected.tipo === 'pontos_embarque' && pontosResumo) && detected.tipo !== 'logistica_mapa_embarque' && !(detected.tipo === 'colaboradores_operacional' && colaboradoresResumo) && !(detected.tipo === 'colaboradores_rh' && colaboradoresRhResumo) && !(detected.tipo === 'auditorias_operacional' && auditoriasResumo) && !(detected.tipo === 'uber_corridas' && uberResumo) && !(detected.tipo === 'patrimonios' && patrimoniosResumo) && !(detected.tipo === 'frotas_excesso_velocidade' && frotasExcessoResumo) && !(detected.tipo === 'resultado-diario' && resultadoDiarioResumo) && !(detected.tipo === 'producao' && producaoDiariaResumo) && !(detected.tipo === 'financeiro_contas_receber' && financeiroReceberResumo) && !(detected.tipo === 'financeiro_contas_pagar' && financeiroPagarResumo) && !(detected.tipo === 'clinicas_sst' && clinicasResumo) && !(detected.tipo === 'operacional_os_distribuicao' && distribuicaoOsResumo) && !(detected.tipo === 'logistica_btg' && btgLogisticaResumo)) status.textContent = 'Importado';
    item.classList.add('is-success');
  }

  function openHome(container, opts = {}) {
    state.files = [];
    state.running = false;
    state.imported = 0;
    state.errors = 0;

    container.innerHTML = `
      ${styles}
      <section class="relatorios-importacao">
        <div class="relatorios-grid">
          <div class="import-card">
            <div class="import-head">
              <div>
                <h2 class="import-title">Central de importação</h2>
                <p class="import-subtitle">Selecione os arquivos, revise a lista e finalize no botão Concluir Importação.</p>
              </div>
              <span class="tag">XLSX · XLS · CSV</span>
            </div>

            <div class="dropzone" id="dropzone" role="button" tabindex="0">
              <input type="file" id="fileInput" multiple hidden accept=".xlsx,.xls,.xlsm,.csv" />
              <div>
                <div class="dropzone-main">Arraste arquivos aqui ou clique para selecionar</div>
                <div class="dropzone-hint">A importação só será enviada após confirmar no botão abaixo.</div>
              </div>
            </div>

            <div class="import-intelligence">
              <div class="import-intelligence-row">
                <div class="import-field">
                  <label for="modoImportacao">Modo de importação</label>
                  <select id="modoImportacao">
                    <option value="auto">Automático inteligente</option>
                    <option value="replace">Substituir período detectado</option>
                    <option value="append">Complementar dados existentes</option>
                  </select>
                </div>
                <div class="import-intelligence-note" id="intelligenceNote">
                  No automático, se o período já existir no banco, o painel substitui a versão anterior; planilhas de hotéis vão para Hospedagem, Mapa G1000 e Endereço Colaborador vão para Operacional, Patrimônios atualiza a leitura e Excesso de Velocidade vai para Frotas com cruzamento automático por placa.
                </div>
              </div>
            </div>

            <div class="file-list" id="fileList">
              <div class="file-empty">Nenhum arquivo selecionado.</div>
            </div>

            <div class="import-actions">
              <div class="import-summary" id="importSummary">0 arquivos prontos para importação.</div>
              <button class="btn-importar" id="btnConcluirImportacao" type="button" disabled>Concluir Importação</button>
            </div>

            <div class="import-log" id="importLog"></div>
          </div>
        </div>
      </section>
    `;

    const drop = container.querySelector('#dropzone');
    const input = container.querySelector('#fileInput');
    const list = container.querySelector('#fileList');
    const btn = container.querySelector('#btnConcluirImportacao');
    const modeSelect = container.querySelector('#modoImportacao');
    const summary = container.querySelector('#importSummary');
    const log = container.querySelector('#importLog');

    function updateSummary() {
      const count = state.files.length;
      const invalid = state.files.filter((entry) => !entry.valid).length;
      const valid = count - invalid;
      const pending = state.files.filter((entry) => entry.valid && entry.status === 'pendente').length;

      if (!count) {
        summary.textContent = '0 arquivos prontos para importação.';
      } else if (invalid) {
        summary.textContent = `${valid} arquivo(s) pronto(s) · ${invalid} arquivo(s) inválido(s).`;
      } else {
        summary.textContent = `${pending} arquivo(s) pronto(s) para importação.`;
      }

      btn.disabled = state.running || pending === 0;
    }

    function renderFiles() {
      if (!state.files.length) {
        list.innerHTML = '<div class="file-empty">Nenhum arquivo selecionado.</div>';
        updateSummary();
        return;
      }

      list.innerHTML = '';
      state.files.forEach((entry, index) => {
        const detected = entry.detected || detectRelatorio(entry.file.name);
        const item = document.createElement('div');
        item.className = 'file-item';
        if (isEnterpriseUpload(entry.file)) item.classList.add('is-enterprise');
        if (!entry.valid) item.classList.add('is-error');
        if (entry.status === 'importado') item.classList.add('is-success');
        if (entry.status === 'erro') item.classList.add('is-error');

        item.innerHTML = `
          <div>
            <div class="file-name">
              <span>📄</span>
              <span title="${entry.file.name.replace(/"/g, '&quot;')}">${entry.file.name}</span>
            </div>
            <div class="file-meta">${detected.titulo} · ${humanSize(entry.file.size)} <span class="upload-mode">${uploadModeLabel(entry.file)}</span>${entry.period ? `<span class="file-period">${formatPeriod(entry.period)}</span>` : ''}</div>
          </div>
          <div class="file-right">
            <div class="file-status-row">
              <span class="file-status">${entry.valid ? (entry.message || 'Pendente') : 'Formato inválido'}</span>
              <button class="file-remove" type="button" data-index="${index}" ${state.running ? 'disabled' : ''}>Remover</button>
            </div>
            <div class="progress"><div class="progress-bar" style="width:${entry.status === 'importado' ? '100' : entry.status === 'erro' ? '100' : '0'}%"></div></div>
          </div>
        `;

        entry.elements = {
          item,
          bar: item.querySelector('.progress-bar'),
          status: item.querySelector('.file-status'),
        };

        list.appendChild(item);
      });

      list.querySelectorAll('.file-remove').forEach((button) => {
        button.addEventListener('click', () => {
          const index = Number(button.dataset.index);
          state.files.splice(index, 1);
          renderFiles();
        });
      });

      updateSummary();
    }

    async function addFiles(fileList) {
      const incoming = Array.from(fileList || []);
      if (!incoming.length || state.running) return;

      const existingKey = new Set(state.files.map((entry) => `${entry.file.name}_${entry.file.size}`));

      incoming.forEach((file) => {
        const key = `${file.name}_${file.size}`;
        if (existingKey.has(key)) return;
        existingKey.add(key);

        const valid = isAllowedFile(file);
        const detected = detectRelatorio(file.name);
        const entry = {
          file,
          valid,
          period: null,
          status: valid ? 'pendente' : 'erro',
          message: valid ? 'Detectando período...' : 'Use XLSX, XLS ou CSV até 1GB',
          detected,
          elements: null,
        };
        state.files.push(entry);

        if (valid) {
          detectarHospedagemHistoricoPorConteudo(file, detected).then((novoDetectado) => {
            if (novoDetectado?.tipo !== 'hospedagem_historico') return;
            entry.detected = novoDetectado;
            entry.message = 'Pendente · importará histórico de hospedagem dos colaboradores';
            renderFiles();
            readHospedagemHistoricoRowsFromFile(file).then((res) => {
              const period = res?.period || null;
              entry.period = period;
              const total = Number(res?.rows?.length || 0);
              entry.message = period
                ? `Período: ${formatPeriod(period)} · ${total.toLocaleString('pt-BR')} registros · importará Hospedagem`
                : `Pendente · ${total.toLocaleString('pt-BR')} registros · sem período detectado`;
              renderFiles();
            }).catch((err) => {
              entry.period = null;
              entry.message = `Pendente · não foi possível pré-validar Hospedagem (${err?.message || 'erro de leitura'})`;
              renderFiles();
            });
          }).catch(() => {});

          if (detected.tipo === 'hoteis') {
            entry.message = 'Pendente · importará cadastro de hotéis';
          } else if (detected.tipo === 'pontos_embarque') {
            entry.message = 'Pendente · importará pontos de embarque operacional';
          } else if (detected.tipo === 'logistica_mapa_embarque') {
            entry.message = 'Pendente · atualizará Mapa de Embarque para Logística/Laudos';
            detectFilePeriod(file, detected.tipo).then((period) => {
              entry.period = period;
              entry.message = period
                ? `Período: ${formatPeriod(period)} · atualizará Mapa de Embarque`
                : 'Pendente · Mapa de Embarque sem período detectado';
              renderFiles();
            });
          } else if (detected.tipo === 'colaboradores_operacional') {
            entry.message = 'Pendente · importará endereços dos colaboradores no Operacional';
          } else if (detected.tipo === 'colaboradores_rh') {
            entry.message = 'Pendente · atualizará base de funcionários/colaboradores no RH';
          } else if (detected.tipo === 'auditorias_operacional') {
            entry.message = 'Pendente · importará auditorias no Operacional';
          } else if (detected.tipo === 'uber_corridas') {
            entry.message = 'Pendente · importará corridas Uber na Conferência';
            detectFilePeriod(file, detected.tipo).then((period) => {
              entry.period = period;
              entry.message = period ? `Período: ${formatPeriod(period)} · importará corridas Uber` : 'Pendente · Uber sem período detectado';
              renderFiles();
            });
          } else if (detected.tipo === 'patrimonios') {
            entry.message = 'Pendente · atualizará leitura de patrimônios';
          } else if (detected.tipo === 'frotas_excesso_velocidade') {
            entry.message = 'Pendente · cruzará excesso de velocidade com patrimônio';
            detectFilePeriod(file, detected.tipo).then((period) => {
              entry.period = period;
              entry.message = period ? `Período: ${formatPeriod(period)} · importará Frotas` : 'Pendente · Frotas sem período detectado';
              renderFiles();
            });
          } else if (detected.tipo === 'operacional_os_distribuicao') {
            entry.message = 'Pendente · salvará Distribuição de O.S. para conferência BTG';
            readDistribuicaoOsRowsFromFile(file).then((res) => {
              const total = Number(res?.rows?.length || 0);
              entry.message = `Pendente · ${total.toLocaleString('pt-BR')} vínculo(s) O.S. x colaborador · salvará Distribuição`;
              renderFiles();
            }).catch((err) => { entry.message = `Pendente · não foi possível pré-validar Distribuição (${err?.message || 'erro de leitura'})`; renderFiles(); });
          } else if (detected.tipo === 'logistica_btg') {
            entry.message = 'Pendente · salvará solicitações BTG para conferência';
            readBtgLogisticaRowsFromFile(file).then((res) => {
              const total = Number(res?.rows?.length || 0);
              entry.message = `Pendente · ${total.toLocaleString('pt-BR')} solicitação(ões) BTG · salvará para conferência`;
              renderFiles();
            }).catch((err) => { entry.message = `Pendente · não foi possível pré-validar BTG (${err?.message || 'erro de leitura'})`; renderFiles(); });
          } else if (detected.tipo === 'producao') {
            entry.message = 'Pendente · consolidará Produção Diária para pagamentos do Financeiro';
            readProducaoDiariaRowsFromFile(file).then((res) => {
              const period = res?.period || null;
              entry.period = period;
              const total = Number(res?.rows?.length || 0);
              entry.message = period
                ? `Período: ${formatPeriod(period)} · ${total.toLocaleString('pt-BR')} linhas · consolidará Produção Diária`
                : 'Pendente · Produção Diária sem período detectado';
              renderFiles();
            }).catch((err) => {
              entry.period = null;
              entry.message = `Pendente · não foi possível pré-validar Produção Diária (${err?.message || 'erro de leitura'})`;
              renderFiles();
            });
          } else if (detected.tipo === 'resultado-diario') {
            entry.message = 'Pendente · consolidará produção para DRE rápido';
            // Usa o próprio leitor do Resultado Diário para detectar o período.
            // Assim a mesma regra que importa também valida Data/Coordenação/Toneladas.
            readResultadoDiarioRowsFromFile(file).then((res) => {
              const period = res?.period || null;
              entry.period = period;
              const total = Number(res?.rows?.length || 0);
              entry.message = period
                ? `Período: ${formatPeriod(period)} · ${total.toLocaleString('pt-BR')} linhas · consolidará Resultado Diário`
                : 'Pendente · Resultado Diário sem período detectado';
              renderFiles();
            }).catch((err) => {
              entry.period = null;
              entry.message = `Pendente · não foi possível pré-validar Resultado Diário (${err?.message || 'erro de leitura'})`;
              renderFiles();
            });
          } else if (detected.tipo === 'financeiro_contas_receber') {
            detectFilePeriod(file, detected.tipo).then((period) => {
              entry.period = period;
              entry.message = period ? `Período: ${formatPeriod(period)} · importará Contas a Receber no Financeiro` : 'Pendente · Contas a Receber sem vencimento detectado';
              renderFiles();
            });
          } else if (detected.tipo === 'financeiro_contas_pagar') {
            detectFilePeriod(file, detected.tipo).then((period) => {
              entry.period = period;
              entry.message = period ? `Período: ${formatPeriod(period)} · importará Contas a Pagar no Financeiro` : 'Pendente · Contas a Pagar sem vencimento detectado';
              renderFiles();
            });
          } else if (detected.tipo === 'clinicas_sst') {
            entry.message = 'Pendente · atualizará cadastro de Clínicas SST no RH';
          } else {
            detectarHoteisPorConteudo(file, detected).then((newDetected) => {
              if (newDetected.tipo === 'hoteis') {
                entry.detected = newDetected;
                entry.message = 'Pendente · importará cadastro de hotéis';
                renderFiles();
              } else {
                detectFilePeriod(file, detected.tipo).then((period) => {
                  entry.period = period;
                  entry.message = period ? `Período: ${formatPeriod(period)}` : 'Pendente · período não detectado';
                  renderFiles();
                });
              }
            });
          }
        }
      });

      log.classList.remove('is-visible');
      log.innerHTML = '';
      renderFiles();
      input.value = '';
    }

    drop.addEventListener('click', () => input.click());
    drop.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        input.click();
      }
    });
    drop.addEventListener('dragover', (event) => {
      event.preventDefault();
      drop.classList.add('is-dragging');
    });
    drop.addEventListener('dragleave', () => drop.classList.remove('is-dragging'));
    drop.addEventListener('drop', (event) => {
      event.preventDefault();
      drop.classList.remove('is-dragging');
      addFiles(event.dataTransfer.files);
    });
    input.addEventListener('change', () => addFiles(input.files));

    btn.addEventListener('click', async () => {
      const queue = state.files.filter((entry) => entry.valid && entry.status === 'pendente');
      if (!queue.length || state.running) return;

      state.running = true;
      state.imported = 0;
      state.errors = 0;
      setButton(btn, null, '<span class="spinner"></span>Importando...');
      updateSummary();
      renderFiles();

      for (const entry of queue) {
        const { item, bar, status } = entry.elements || {};
        try {
          entry.status = 'processando';
          entry.message = 'Processando...';
          if (status) status.textContent = 'Processando...';
          if (bar) bar.style.width = '12%';

          await uploadAndRegister({ file: entry.file, item, bar, status, entry }, { ...opts, importMode: modeSelect?.value || 'auto' });

          entry.status = 'importado';
          entry.message = 'Importado';
          state.imported += 1;
        } catch (err) {
          console.error('[RELATORIOS] Erro ao importar:', err);
          entry.status = 'erro';
          entry.message = err?.message || 'Erro ao importar';
          state.errors += 1;

          if (item) item.classList.add('is-error');
          if (bar) bar.style.width = '100%';
          if (status) status.textContent = entry.message;
        }
      }

      state.running = false;
      if (state.imported > 0) {
        opts.cache?.bumpPainelCache?.('importacao_relatorios');
        await invalidateDashboardCacheAfterImport(opts);
      }
      updateSummary();

      if (state.errors) {
        setButton(btn, 'is-error', 'Revisar e tentar novamente');
        btn.disabled = !state.files.some((entry) => entry.valid && entry.status === 'pendente');
        log.innerHTML = `<strong>Importação parcial:</strong> ${state.imported} arquivo(s) importado(s) e ${state.errors} com erro.`;
      } else {
        setButton(btn, 'is-success', 'Importação concluída');
        btn.disabled = true;
        log.innerHTML = `<strong>Importação concluída:</strong> ${state.imported} arquivo(s) enviado(s) com sucesso.`;
      }

      log.classList.add('is-visible');
    });

    renderFiles();
  }

export { openHome };
