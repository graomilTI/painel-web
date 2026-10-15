// Relatórios — importação — importação de Resultado Diário e Produção Diária.
// Extraído de modules/relatorios.js em 15/10/2026 (era um único bloco autoexecutável de ~3.900 linhas).
// O código das funções e constantes foi movido sem alteração. Para publicar uma mudança em qualquer
// módulo relatorios-*.js, troque o token ?v=20261015-relatorios1 em TODOS os imports internos e no carregador
// (assets/js/relatorio-importador.js): tests/relatorios-modulos-versao.test.mjs garante que fiquem iguais.
import { loadXlsx, normalizeHeader, makeIsoDate, toIsoDate, findHeaderRow, normalizeNumberBr, normalizeText, pickHeaderIndex } from './relatorios-planilha.js?v=20261015-relatorios1';

  function parseDataFromSheetName(name) {
    const raw = String(name || '').trim();
    let m = raw.match(/^(\d{2})(\d{2})(\d{4})$/);
    if (m) return makeIsoDate(m[3], m[2], m[1]);
    m = raw.match(/^(\d{1,2})[\.\/-](\d{1,2})[\.\/-](\d{4})$/);
    if (m) return makeIsoDate(m[3], m[2], m[1]);
    return toIsoDate(raw);
  }

  async function readResultadoDiarioRowsFromFile(file) {
    const XLSX = await loadXlsx();
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
    const mapped = [];
    const dates = [];
    const diagnostics = [];

    for (const sheetName of workbook.SheetNames || []) {
      const sheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: true });
      if (!rows?.length) continue;

      const headerRow = findHeaderRow(rows, ['Data', 'Coordenação', 'Toneladas']);
      const headers = (rows[headerRow] || []).map((h, index) => String(h || `COLUNA_${index + 1}`).trim());
      const iOs = pickHeaderIndex(headers, ['O.S.', 'OS', 'Ordem de Serviço']);
      const iContrato = pickHeaderIndex(headers, ['Contrato']);
      const iProduto = pickHeaderIndex(headers, ['Produto']);
      const iData = pickHeaderIndex(headers, ['Data', 'Dt Data']);
      const iFuncionario = pickHeaderIndex(headers, ['Funcionário', 'Funcionario', 'Classificador']);
      const iCoordenacao = pickHeaderIndex(headers, ['Coordenação', 'Coordenacao', 'Regional']);
      const iSupervisao = pickHeaderIndex(headers, ['Supervisão', 'Supervisao']);
      const iCliNac = pickHeaderIndex(headers, ['Cliente Nacional', 'Cli. Nacional']);
      const iCliReg = pickHeaderIndex(headers, ['Cliente Regional', 'Cli. Regional']);
      const iCliFinal = pickHeaderIndex(headers, ['Cliente Final', 'Cli. Final']);
      const iLocal = pickHeaderIndex(headers, ['Local de Embarque', 'Local Embarque']);
      const iDestino = pickHeaderIndex(headers, ['Destino']);
      const iCargas = pickHeaderIndex(headers, ['Cargas', 'Carga']);
      const iTon = pickHeaderIndex(headers, ['Toneladas', 'Tons', 'Volume Classificado', 'Peso Toneladas']);
      const iValorTon = pickHeaderIndex(headers, ['R$/Ton', 'Valor Ton', 'Valor/Ton']);
      const iCadencia = pickHeaderIndex(headers, ['Cadência', 'Cadencia']);
      const iTonsCad = pickHeaderIndex(headers, ['Tons Cadência', 'Tons Cadencia']);
      const iEmbarcado = pickHeaderIndex(headers, ['Embarcado', 'Volume Embarcado']);
      const iValorEmbarcado = pickHeaderIndex(headers, ['Valor Embarcado']);
      const iValorAfla = pickHeaderIndex(headers, ['Valor Afla']);
      const iTotalAfla = pickHeaderIndex(headers, ['Total Afla']);
      const iValorVomitoxina = pickHeaderIndex(headers, ['Valor Vomitoxina']);
      const iTotalVomitoxina = pickHeaderIndex(headers, ['Total Vomitoxina']);
      const iValorFalling = pickHeaderIndex(headers, ['Valor Falling Number']);
      const iTotalFalling = pickHeaderIndex(headers, ['Total Falling Number']);
      const iValorIntacta = pickHeaderIndex(headers, ['Valor Intacta']);
      const iTotalIntacta = pickHeaderIndex(headers, ['Total Intacta']);
      const iValorGmo = pickHeaderIndex(headers, ['Valor GMO']);
      const iTotalGmo = pickHeaderIndex(headers, ['Total GMO']);
      const iTotalEmbTeste = pickHeaderIndex(headers, ['Total Embarcado + Teste', 'Total Embarcado Mais Teste', 'Total Embarcado']);
      const iRemanescente = pickHeaderIndex(headers, ['Remanescente']);
      const iMotivoNhe = pickHeaderIndex(headers, ['Motivo NHE']);
      const iObsNhe = pickHeaderIndex(headers, ['Observações NHE', 'Observacoes NHE']);
      const iSituacao = pickHeaderIndex(headers, ['Situação', 'Situacao']);
      const iObs = pickHeaderIndex(headers, ['Observações', 'Observacoes']);

      diagnostics.push({ sheetName, headerRow: headerRow + 1, headers: headers.slice(0, 40), indexes: { iData, iCoordenacao, iTon, iEmbarcado, iTotalEmbTeste, iCargas } });
      if (iData < 0 || iCoordenacao < 0 || iTon < 0 || iEmbarcado < 0) continue;

      rows.slice(headerRow + 1).forEach((row) => {
        const data = toIsoDate(row?.[iData]);
        const coordenacao = normalizeText(row?.[iCoordenacao]);
        if (!data || !coordenacao) return;
        const tons = iTon >= 0 ? normalizeNumberBr(row?.[iTon]) : null;
        const embarcadoBase = iEmbarcado >= 0 ? normalizeNumberBr(row?.[iEmbarcado]) : null;
        const totalEmbTeste = iTotalEmbTeste >= 0 ? normalizeNumberBr(row?.[iTotalEmbTeste]) : null;
        const cargas = iCargas >= 0 ? normalizeNumberBr(row?.[iCargas]) : null;
        const hasMetric = [tons, embarcadoBase, totalEmbTeste, cargas].some((v) => v !== null);
        if (!hasMetric) return;
        dates.push(data);
        mapped.push({
          file_name: file.name,
          os: iOs >= 0 ? normalizeText(row?.[iOs]) : null,
          contrato: iContrato >= 0 ? normalizeText(row?.[iContrato]) : null,
          produto: iProduto >= 0 ? normalizeText(row?.[iProduto]) : null,
          data,
          funcionario: iFuncionario >= 0 ? normalizeText(row?.[iFuncionario]) : null,
          coordenacao,
          supervisao: iSupervisao >= 0 ? normalizeText(row?.[iSupervisao]) : null,
          cliente_nacional: iCliNac >= 0 ? normalizeText(row?.[iCliNac]) : null,
          cliente_regional: iCliReg >= 0 ? normalizeText(row?.[iCliReg]) : null,
          cliente_final: iCliFinal >= 0 ? normalizeText(row?.[iCliFinal]) : null,
          local_embarque: iLocal >= 0 ? normalizeText(row?.[iLocal]) : null,
          destino: iDestino >= 0 ? normalizeText(row?.[iDestino]) : null,
          cargas: cargas || 0,
          toneladas: tons || 0,
          valor_ton: iValorTon >= 0 ? normalizeNumberBr(row?.[iValorTon]) || 0 : 0,
          cadencia: iCadencia >= 0 ? normalizeNumberBr(row?.[iCadencia]) || 0 : 0,
          tons_cadencia: iTonsCad >= 0 ? normalizeNumberBr(row?.[iTonsCad]) || 0 : 0,
          // Regra oficial do DRE:
          // Toneladas = Tons sem cadência / Volume Classificado
          // Embarcado = Tons com cadência / Volume Embarcado + NHE + cad
          // Total Embarcado + Teste fica salvo apenas para auditoria, não alimenta o DRE.
          embarcado: embarcadoBase ?? 0,
          valor_embarcado: iValorEmbarcado >= 0 ? normalizeNumberBr(row?.[iValorEmbarcado]) || 0 : 0,
          valor_afla: iValorAfla >= 0 ? normalizeNumberBr(row?.[iValorAfla]) || 0 : 0,
          total_afla: iTotalAfla >= 0 ? normalizeNumberBr(row?.[iTotalAfla]) || 0 : 0,
          valor_vomitoxina: iValorVomitoxina >= 0 ? normalizeNumberBr(row?.[iValorVomitoxina]) || 0 : 0,
          total_vomitoxina: iTotalVomitoxina >= 0 ? normalizeNumberBr(row?.[iTotalVomitoxina]) || 0 : 0,
          valor_falling_number: iValorFalling >= 0 ? normalizeNumberBr(row?.[iValorFalling]) || 0 : 0,
          total_falling_number: iTotalFalling >= 0 ? normalizeNumberBr(row?.[iTotalFalling]) || 0 : 0,
          valor_intacta: iValorIntacta >= 0 ? normalizeNumberBr(row?.[iValorIntacta]) || 0 : 0,
          total_intacta: iTotalIntacta >= 0 ? normalizeNumberBr(row?.[iTotalIntacta]) || 0 : 0,
          valor_gmo: iValorGmo >= 0 ? normalizeNumberBr(row?.[iValorGmo]) || 0 : 0,
          total_gmo: iTotalGmo >= 0 ? normalizeNumberBr(row?.[iTotalGmo]) || 0 : 0,
          total_embarcado_mais_teste: totalEmbTeste || 0,
          remanescente: iRemanescente >= 0 ? normalizeNumberBr(row?.[iRemanescente]) || 0 : 0,
          motivo_nhe: iMotivoNhe >= 0 ? normalizeText(row?.[iMotivoNhe]) : null,
          observacoes_nhe: iObsNhe >= 0 ? normalizeText(row?.[iObsNhe]) : null,
          situacao: iSituacao >= 0 ? normalizeText(row?.[iSituacao]) : null,
          observacoes: iObs >= 0 ? normalizeText(row?.[iObs]) : null,
        });
      });
    }

    const uniqueDates = [...new Set(dates)].sort();
    return {
      rows: mapped,
      period: uniqueDates.length ? { inicio: uniqueDates[0], fim: uniqueDates[uniqueDates.length - 1], totalDatas: uniqueDates.length } : null,
      diagnostics,
    };
  }

  async function importarResultadoDiarioDaPlanilha(file, opts, periodFromEntry = null) {
    const { rows, period, diagnostics } = await readResultadoDiarioRowsFromFile(file);
    const finalPeriod = period || periodFromEntry;
    if (!rows.length) {
      const detail = (diagnostics || []).map((d) => `${d.sheetName} linha ${d.headerRow}: ${d.headers.join(' | ')}`).join(' || ');
      throw new Error(`A planilha de Resultado Diário não possui linhas válidas. Cabeçalhos esperados: Data, Coordenação, Toneladas e Embarcado. Detectado: ${detail || 'nenhum cabeçalho'}`);
    }

    if (finalPeriod?.inicio && finalPeriod?.fim) {
      const { error: delError } = await opts.supabase
        .from('relatorio_resultado_diario')
        .delete()
        .gte('data', finalPeriod.inicio)
        .lte('data', finalPeriod.fim);
      if (delError) throw new Error(delError.message || 'Falha ao limpar período anterior do Resultado Diário.');
    }

    const batchSize = 500;
    let total = 0;
    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize);
      const { error } = await opts.supabase.from('relatorio_resultado_diario').insert(batch);
      if (error) throw new Error(error.message || 'Falha ao gravar Resultado Diário no Supabase.');
      total += batch.length;
    }

    const regionais = new Set(rows.map((r) => normalizeHeader(r.coordenacao)).filter(Boolean)).size;
    const totalTons = rows.reduce((acc, r) => acc + Number(r.toneladas || 0), 0);
    const totalEmbarcado = rows.reduce((acc, r) => acc + Number(r.embarcado || 0), 0);
    const totalCargas = rows.reduce((acc, r) => acc + Number(r.cargas || 0), 0);
    return {
      total_linhas: rows.length,
      importados: total,
      regionais,
      toneladas: totalTons,
      embarcado: totalEmbarcado,
      cargas: totalCargas,
      periodo_inicio: finalPeriod?.inicio || null,
      periodo_fim: finalPeriod?.fim || null,
    };
  }

  async function readProducaoDiariaRowsFromFile(file) {
    const XLSX = await loadXlsx();
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
    const mapped = [];
    const dates = [];
    const diagnostics = [];

    for (const sheetName of workbook.SheetNames || []) {
      const sheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: true });
      if (!rows?.length) continue;

      const headerRow = findHeaderRow(rows, ['Data', 'Funcionário', 'Tons']);
      const headers = (rows[headerRow] || []).map((h, index) => String(h || `COLUNA_${index + 1}`).trim());
      const iData = pickHeaderIndex(headers, ['Data', 'Data Produção', 'Data Producao', 'Data Referência', 'Data Referencia']);
      const iCoord = pickHeaderIndex(headers, ['Coordenação', 'Coordenacao', 'Regional']);
      const iSupervisao = pickHeaderIndex(headers, ['Supervisão', 'Supervisao']);
      const iFuncionario = pickHeaderIndex(headers, ['Funcionário', 'Funcionario', 'Colaborador', 'Nome']);
      const iTipo = pickHeaderIndex(headers, ['Tipo']);
      const iOs = pickHeaderIndex(headers, ['O.S.', 'O.S', 'OS', 'Ordem de Serviço', 'Ordem de Servico']);
      const iCliente = pickHeaderIndex(headers, ['Cliente']);
      const iServico = pickHeaderIndex(headers, ['Serviço', 'Servico']);
      const iCidade = pickHeaderIndex(headers, ['Cidade']);
      const iLocal = pickHeaderIndex(headers, ['Local de Embarque', 'Local Embarque', 'Embarque']);
      const iCheckin = pickHeaderIndex(headers, ['Check-in', 'Checkin', 'Entrada']);
      const iCheckout = pickHeaderIndex(headers, ['Check-out', 'Checkout', 'Saída', 'Saida']);
      const iCargas = pickHeaderIndex(headers, ['Cargas', 'Carga']);
      const iTons = pickHeaderIndex(headers, ['Tons', 'Toneladas', 'Tonelada']);

      diagnostics.push({ sheetName, headerRow: headerRow + 1, headers: headers.slice(0, 40), indexes: { iData, iFuncionario, iTons, iCargas, iOs } });
      if (iData < 0 || iFuncionario < 0 || (iTons < 0 && iCargas < 0)) continue;

      rows.slice(headerRow + 1).forEach((row) => {
        const data = toIsoDate(row?.[iData]) || parseDataFromSheetName(sheetName);
        const funcionario = iFuncionario >= 0 ? normalizeText(row?.[iFuncionario]) : null;
        if (!data || !funcionario) return;
        const tons = iTons >= 0 ? normalizeNumberBr(row?.[iTons]) : null;
        const cargas = iCargas >= 0 ? normalizeNumberBr(row?.[iCargas]) : null;
        if (tons === null && cargas === null) return;
        dates.push(data);
        mapped.push({
          data_referencia: data,
          data,
          coordenacao: iCoord >= 0 ? normalizeText(row?.[iCoord]) : null,
          supervisao: iSupervisao >= 0 ? normalizeText(row?.[iSupervisao]) : null,
          funcionario,
          tipo: iTipo >= 0 ? normalizeText(row?.[iTipo]) : null,
          os: iOs >= 0 ? normalizeText(row?.[iOs]) : null,
          cliente: iCliente >= 0 ? normalizeText(row?.[iCliente]) : null,
          servico: iServico >= 0 ? normalizeText(row?.[iServico]) : null,
          cidade: iCidade >= 0 ? normalizeText(row?.[iCidade]) : null,
          local_embarque: iLocal >= 0 ? normalizeText(row?.[iLocal]) : null,
          checkin: iCheckin >= 0 ? normalizeText(row?.[iCheckin]) : null,
          checkout: iCheckout >= 0 ? normalizeText(row?.[iCheckout]) : null,
          cargas: cargas ?? 0,
          tons: tons ?? 0,
        });
      });
    }

    const uniqueDates = [...new Set(dates)].sort();
    return {
      rows: mapped,
      period: uniqueDates.length ? { inicio: uniqueDates[0], fim: uniqueDates[uniqueDates.length - 1], totalDatas: uniqueDates.length } : null,
      diagnostics,
    };
  }

  async function detectarProducaoDiariaPorConteudo(file, detected) {
    if (!['outros', 'producao'].includes(detected?.tipo)) return detected;
    try {
      const res = await readProducaoDiariaRowsFromFile(file);
      if (res?.rows?.length) return { tipo: 'producao', titulo: 'Produção Diária' };
    } catch (_) {}
    return detected;
  }

  async function importarProducaoDiariaDaPlanilha(file, opts) {
    const { rows, period, diagnostics } = await readProducaoDiariaRowsFromFile(file);
    if (!rows.length) {
      const detail = (diagnostics || []).map((d) => `${d.sheetName} linha ${d.headerRow}: ${d.headers.join(' | ')}`).join(' || ');
      throw new Error(`A planilha de Produção Diária não possui linhas válidas. Cabeçalhos esperados: Data, Funcionário e Tons ou Cargas. Detectado: ${detail || 'nenhum cabeçalho'}`);
    }

    if (period?.inicio && period?.fim) {
      const { error: delError } = await opts.supabase
        .from('producao_snapshot')
        .delete()
        .gte('data', period.inicio)
        .lte('data', period.fim);
      if (delError) throw new Error(delError.message || 'Falha ao limpar período anterior da Produção Diária.');
    }

    const user = opts.user || opts.auth?.user || null;
    const { data: importacao, error: impError } = await opts.supabase
      .from('producao_importacoes')
      .insert({
        data_referencia: period?.fim || rows[0]?.data || null,
        arquivo_nome: file.name,
        origem: 'importar_relatorios_producao_diaria',
        importado_por: user?.id || null,
        status: 'processando',
        total_linhas: rows.length,
        observacoes: `Importado pelo menu Importar Relatórios${period?.inicio ? ` · ${period.inicio} a ${period.fim}` : ''}`,
      })
      .select()
      .single();
    if (impError) throw new Error(impError.message || 'Falha ao criar importação da Produção Diária.');

    const batchSize = 500;
    let total = 0;
    try {
      const withImport = rows.map((row) => ({ ...row, importacao_id: importacao.id }));
      for (let i = 0; i < withImport.length; i += batchSize) {
        const batch = withImport.slice(i, i + batchSize);
        const { error } = await opts.supabase.from('producao_snapshot').insert(batch);
        if (error) throw new Error(error.message || 'Falha ao gravar Produção Diária no Supabase.');
        total += batch.length;
      }
      await opts.supabase.from('producao_importacoes').update({ status: 'processado', total_linhas: total }).eq('id', importacao.id);
    } catch (err) {
      await opts.supabase.from('producao_importacoes').update({ status: 'erro' }).eq('id', importacao.id);
      throw err;
    }

    const colaboradores = new Set(rows.map((r) => normalizeHeader(r.funcionario)).filter(Boolean)).size;
    const totalTons = rows.reduce((acc, r) => acc + Number(r.tons || 0), 0);
    const totalCargas = rows.reduce((acc, r) => acc + Number(r.cargas || 0), 0);
    return {
      total_linhas: rows.length,
      importados: total,
      colaboradores,
      toneladas: totalTons,
      cargas: totalCargas,
      periodo_inicio: period?.inicio || null,
      periodo_fim: period?.fim || null,
      total_datas: period?.totalDatas || null,
    };
  }

export { readResultadoDiarioRowsFromFile, importarResultadoDiarioDaPlanilha, readProducaoDiariaRowsFromFile, detectarProducaoDiariaPorConteudo, importarProducaoDiariaDaPlanilha };
