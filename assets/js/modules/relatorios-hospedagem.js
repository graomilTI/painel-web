// Relatórios — importação — importação de Banco de Hotéis e Histórico de hospedagem.
// Extraído de modules/relatorios.js em 15/10/2026 (era um único bloco autoexecutável de ~3.900 linhas).
// O código das funções e constantes foi movido sem alteração. Para publicar uma mudança em qualquer
// módulo relatorios-*.js, troque o token ?v=20261015-relatorios1 em TODOS os imports internos e no carregador
// (assets/js/relatorio-importador.js): tests/relatorios-modulos-versao.test.mjs garante que fiquem iguais.
import { loadXlsx, normalizeHeader, toIsoDate, headerKey, findHeaderRow, normalizeNumberBr, financeiroHash, pickHeaderIndex } from './relatorios-planilha.js?v=20261015-relatorios1';

  async function readSpreadsheetAsObjects(file) {
    const XLSX = await loadXlsx();
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
    const allObjects = [];

    for (const sheetName of workbook.SheetNames || []) {
      const sheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false });
      if (!rows?.length) continue;

      const headerRow = findHeaderRow(rows, ['HOTEL', 'CIDADE']);
      const header = (rows[headerRow] || []).map(normalizeHeader);
      const hasHotel = header.includes('hotel') || header.includes('nome hotel') || header.includes('nome_hotel');
      const hasCity = header.includes('cidade') || header.includes('ciudad');
      const hasDailyRate = header.some((h) => ['valor', 'diaria', 'diaria r$', 'r$ por dia', 'vlr diaria', 'valor diaria', 'valor diario'].includes(h));

      // Para cadastro de hotéis, só importa abas que realmente tenham estrutura de hotel.
      // Isso evita ler abas auxiliares/observações como a "Página2".
      if (!hasHotel || (!hasCity && !hasDailyRate)) continue;

      const headers = (rows[headerRow] || []).map((h, index) => String(h || `COLUNA_${index + 1}`).trim());
      const dataRows = rows.slice(headerRow + 1);

      dataRows.forEach((row) => {
        const obj = { __aba: sheetName };
        headers.forEach((header, index) => {
          if (!header) return;
          obj[header] = row?.[index] ?? '';
        });
        if (Object.values(obj).some((value) => String(value ?? '').trim() !== '')) {
          allObjects.push(obj);
        }
      });
    }

    return allObjects;
  }

  async function detectarHoteisPorConteudo(file, detected) {
    if (detected?.tipo !== 'outros') return detected;
    try {
      const linhas = await readSpreadsheetAsObjects(file);
      if (linhas.length) return { tipo: 'hoteis', titulo: 'Banco de Hotéis' };
    } catch (_) {}
    return detected;
  }

  function splitCidadeUfHospedagem(value) {
    const text = String(value || '').trim().replace(/\s+/g, ' ');
    if (!text) return { cidade: null, uf: null };
    const ufs = new Set(['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO']);
    const parts = text.split(' ');
    const last = String(parts[parts.length - 1] || '').toUpperCase();
    if (ufs.has(last) && parts.length > 1) return { cidade: parts.slice(0, -1).join(' ').trim() || text, uf: last };
    return { cidade: text, uf: null };
  }

  function normalizeHospedagemStatus(value, observacao) {
    const raw = normalizeHeader(value || observacao || '');
    if (raw.includes('checkout') || raw.includes('check out') || raw.includes('saida')) return 'CHECKOUT_REALIZADO';
    if (raw.includes('cancel')) return 'CANCELADA';
    if (raw.includes('stay') || raw.includes('ativo') || raw.includes('hospedado') || raw.includes('reservado') || raw.includes('checkin')) return 'HOSPEDADO';
    return 'HOSPEDADO';
  }

  function findDuplicateHeaderIndex(headers, label, afterIndex) {
    const target = headerKey(label);
    for (let i = Math.max(0, Number(afterIndex || 0) + 1); i < (headers || []).length; i += 1) {
      if (headerKey(headers[i]) === target) return i;
    }
    return -1;
  }

  async function readHospedagemHistoricoRowsFromFile(file) {
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

      const headerRow = findHeaderRow(rows, ['DATA', 'REGIONAL', 'CIDADE', 'HOTEL', 'VALOR']);
      const headers = (rows[headerRow] || []).map((h, index) => String(h || `COLUNA_${index + 1}`).trim());
      const iData = pickHeaderIndex(headers, ['DATA', 'Data']);
      const iRegional = pickHeaderIndex(headers, ['REGIONAL', 'Coordenação', 'Coordenacao']);
      const iCidade = pickHeaderIndex(headers, ['CIDADE', 'Cidade']);
      const iColaborador = pickHeaderIndex(headers, ['FUNCIONÁRIO', 'Funcionario', 'Funcionário', 'Colaborador', 'Nome']);
      const explicitStatus = pickHeaderIndex(headers, ['Status Hospedagem', 'Status da Hospedagem', 'Movimento', 'Tipo Movimento', 'Check']);
      const iStatusHosp = explicitStatus >= 0 ? explicitStatus : findDuplicateHeaderIndex(headers, 'FUNCIONÁRIO', iColaborador);
      const iHotel = pickHeaderIndex(headers, ['HOTEL', 'Hotel', 'Nome Hotel']);
      const iLocalizacao = pickHeaderIndex(headers, ['LOCALIZAÇÃO', 'Localização', 'Link', 'Mapa']);
      const iTipoQuarto = pickHeaderIndex(headers, ['DIÁRIA', 'Diaria', 'Tipo de Quarto', 'Tipo Quarto', 'Quarto']);
      const iValorDiaria = pickHeaderIndex(headers, ['VALOR', 'Valor', 'Valor Diária', 'Valor Diaria', 'Vlr Diária']);
      const iLocal = pickHeaderIndex(headers, ['LOCAL', 'Local Embarque', 'Local de Embarque']);
      const iCliente = pickHeaderIndex(headers, ['CLIENTE', 'Cliente']);
      const iSaldo = pickHeaderIndex(headers, ['SALDO', 'Saldo']);
      const iSituacaoPagamento = pickHeaderIndex(headers, ['SITUAÇÃO', 'Situacao', 'Situação Pagamento', 'Pagamento']);
      const iNfs = pickHeaderIndex(headers, ['NFS', 'NF', 'Nota Fiscal', 'Nº NF', 'Numero NF']);
      const iObs = pickHeaderIndex(headers, ['OBSERVAÇÃO', 'Observação', 'Observacao', 'Obs']);

      const missing = [];
      if (iData < 0) missing.push('DATA');
      if (iColaborador < 0) missing.push('FUNCIONÁRIO');
      if (iHotel < 0) missing.push('HOTEL');
      if (iValorDiaria < 0) missing.push('VALOR');
      if (missing.length) {
        diagnostics.push(`${sheetName}: cabeçalhos ausentes (${missing.join(', ')})`);
        continue;
      }

      rows.slice(headerRow + 1).forEach((row, idx) => {
        if (!(row || []).some((cell) => cell !== null && cell !== undefined && String(cell).trim() !== '')) return;
        const data = toIsoDate(row?.[iData]);
        const colaborador = String(row?.[iColaborador] || '').trim();
        const hotel = String(row?.[iHotel] || '').trim();
        if (!data || !colaborador || !hotel) return;

        const cidadeUf = splitCidadeUfHospedagem(row?.[iCidade]);
        const statusRaw = iStatusHosp >= 0 ? String(row?.[iStatusHosp] || '').trim() : '';
        const obs = iObs >= 0 ? String(row?.[iObs] || '').trim() : '';
        const tipoQuarto = iTipoQuarto >= 0 ? String(row?.[iTipoQuarto] || '').trim() : '';
        const valorDiaria = iValorDiaria >= 0 ? normalizeNumberBr(row?.[iValorDiaria]) : null;
        const nfRaw = iNfs >= 0 ? row?.[iNfs] : null;
        const nf = nfRaw === null || nfRaw === undefined || String(nfRaw).trim() === '' ? null : String(nfRaw).trim();
        const regional = iRegional >= 0 ? String(row?.[iRegional] || '').trim() : '';
        const local = iLocal >= 0 ? String(row?.[iLocal] || '').trim() : '';
        const cliente = iCliente >= 0 ? String(row?.[iCliente] || '').trim() : '';
        const localizacao = iLocalizacao >= 0 ? String(row?.[iLocalizacao] || '').trim() : '';
        const situacaoPagamento = iSituacaoPagamento >= 0 ? String(row?.[iSituacaoPagamento] || '').trim() : '';

        dates.push(data);
        mapped.push({
          unique_hash: financeiroHash(['hospedagem_historico', data, regional, cidadeUf.cidade, colaborador, hotel, statusRaw, tipoQuarto, valorDiaria, nf]),
          data,
          regional: regional || null,
          cidade: cidadeUf.cidade || null,
          uf: cidadeUf.uf || null,
          colaborador,
          status_planilha: statusRaw || null,
          status_hospedagem: normalizeHospedagemStatus(statusRaw, obs),
          hotel,
          localizacao: localizacao || null,
          tipo_quarto: tipoQuarto || null,
          valor_diaria: valorDiaria,
          local_embarque: local || null,
          cliente: cliente || null,
          saldo: iSaldo >= 0 ? normalizeNumberBr(row?.[iSaldo]) : null,
          situacao_pagamento: situacaoPagamento || null,
          nfs: nf,
          observacao: obs || null,
          arquivo_origem: file.name,
          aba_origem: sheetName,
          linha_origem: headerRow + 2 + idx,
          raw: { data_original: row?.[iData] ?? null, status_original: statusRaw || null, cidade_original: row?.[iCidade] ?? null },
          updated_at: new Date().toISOString(),
        });
      });
    }

    const uniqueDates = [...new Set(dates)].sort();
    return { rows: mapped, period: uniqueDates.length ? { inicio: uniqueDates[0], fim: uniqueDates[uniqueDates.length - 1], totalDatas: uniqueDates.length } : null, diagnostics };
  }

  async function importarHospedagemHistoricoDaPlanilha(file, opts) {
    const result = await readHospedagemHistoricoRowsFromFile(file);
    const rows = result.rows || [];
    if (!rows.length) throw new Error(`Nenhum histórico de hospedagem válido encontrado.${result.diagnostics?.length ? ' Diagnóstico: ' + result.diagnostics.join(' | ') : ''}`);

    let total = 0;
    for (let i = 0; i < rows.length; i += 300) {
      const batch = rows.slice(i, i + 300);
      const { error } = await opts.supabase.from('hospedagem_historico_colaboradores').upsert(batch, { onConflict: 'unique_hash' });
      if (error) throw new Error(`${error.message}. Verifique se a migration hospedagem_historico_colaboradores foi aplicada no Supabase.`);
      total += batch.length;
    }

    const colaboradores = new Set(rows.map((r) => normalizeHeader(r.colaborador)).filter(Boolean)).size;
    const hoteis = new Set(rows.map((r) => normalizeHeader(r.hotel)).filter(Boolean)).size;
    const ativos = rows.filter((r) => r.status_hospedagem === 'HOSPEDADO').length;
    const checkouts = rows.filter((r) => r.status_hospedagem === 'CHECKOUT_REALIZADO').length;
    const valorTotal = rows.reduce((acc, r) => acc + Number(r.valor_diaria || 0), 0);
    return { total_linhas: rows.length, importados: total, colaboradores, hoteis, ativos, checkouts, valor_total: valorTotal, periodo_inicio: result.period?.inicio || null, periodo_fim: result.period?.fim || null, total_datas: result.period?.totalDatas || null };
  }

  async function detectarHospedagemHistoricoPorConteudo(file, detected) {
    if (detected?.tipo !== 'outros' && detected?.tipo !== 'hoteis' && detected?.tipo !== 'producao') return detected;
    if (!/\.(xlsx|xls|csv)$/i.test(file?.name || '')) return detected;
    try {
      const XLSX = await loadXlsx();
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
      for (const sheetName of workbook.SheetNames || []) {
        const sheet = workbook.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: true });
        if (!rows?.length) continue;
        const headerRow = findHeaderRow(rows, ['DATA', 'REGIONAL', 'CIDADE', 'HOTEL', 'VALOR']);
        const headers = (rows[headerRow] || []).map((h, index) => String(h || `COLUNA_${index + 1}`).trim());
        const hasData = pickHeaderIndex(headers, ['DATA']) >= 0;
        const hasRegional = pickHeaderIndex(headers, ['REGIONAL']) >= 0;
        const hasCidade = pickHeaderIndex(headers, ['CIDADE']) >= 0;
        const hasHotel = pickHeaderIndex(headers, ['HOTEL']) >= 0;
        const hasValor = pickHeaderIndex(headers, ['VALOR']) >= 0;
        const iFuncionario = pickHeaderIndex(headers, ['FUNCIONÁRIO', 'Funcionario', 'Colaborador']);
        const hasStatusDuplicado = iFuncionario >= 0 && findDuplicateHeaderIndex(headers, 'FUNCIONÁRIO', iFuncionario) >= 0;
        const sample = rows.slice(headerRow + 1, headerRow + 25).flat().map((v) => normalizeHeader(v)).join(' | ');
        const hasStayCheckout = sample.includes('checkout') || sample.includes('stay');
        if (hasData && hasRegional && hasCidade && hasHotel && hasValor && iFuncionario >= 0 && (hasStatusDuplicado || hasStayCheckout)) return { tipo: 'hospedagem_historico', titulo: 'Hospedagem · Histórico de Colaboradores' };
      }
    } catch (err) { console.warn('[RELATORIOS] Não foi possível detectar histórico de hospedagem:', err); }
    return detected;
  }

  async function importarHoteisDaPlanilha(file, opts) {
    const linhas = await readSpreadsheetAsObjects(file);
    if (!linhas.length) {
      throw new Error('A planilha de hotéis não possui linhas válidas para importar.');
    }

    const { data, error } = await opts.supabase.rpc('hospedagem_importar_hoteis_json', {
      p_linhas: linhas,
    });

    if (error) {
      throw new Error(error.message || 'Falha ao importar hotéis para o módulo Hospedagem.');
    }

    const resumo = Array.isArray(data) ? data[0] : data;
    return resumo || { total_linhas: linhas.length, inseridos: 0, atualizados: 0, ignorados: 0 };
  }

export { detectarHoteisPorConteudo, readHospedagemHistoricoRowsFromFile, importarHospedagemHistoricoDaPlanilha, detectarHospedagemHistoricoPorConteudo, importarHoteisDaPlanilha };
