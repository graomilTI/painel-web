// Relatórios — importação — importação de Contas a Receber, Contas a Pagar e Relatório de Despesas.
// Extraído de modules/relatorios.js em 15/10/2026 (era um único bloco autoexecutável de ~3.900 linhas).
// O código das funções e constantes foi movido sem alteração. Para publicar uma mudança em qualquer
// módulo relatorios-*.js, troque o token ?v=20261015-relatorios1 em TODOS os imports internos e no carregador
// (assets/js/relatorio-importador.js): tests/relatorios-modulos-versao.test.mjs garante que fiquem iguais.
import { loadXlsx, normalizeHeader, toIsoDate, headerMatches, findHeaderRow, pickValue, normalizeNumberBr, financeiroHash, normalizeText } from './relatorios-planilha.js?v=20261015-relatorios1';

  function financeiroRowValue(row, aliases) {
    return pickValue(row, aliases);
  }

  async function readFinanceiroObjectsFromFile(file, requiredHeaders) {
    const XLSX = await loadXlsx();
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
    const allObjects = [];

    for (const sheetName of workbook.SheetNames || []) {
      const sheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: true });
      if (!rows?.length) continue;

      const headerRow = findHeaderRow(rows, requiredHeaders);
      const headerRaw = rows[headerRow] || [];
      const header = headerRaw.map((h, index) => String(h || `COLUNA_${index + 1}`).trim());
      const headerScore = (requiredHeaders || []).filter((name) => headerRaw.some((h) => headerMatches(h, name))).length;
      if (headerScore < Math.min(4, requiredHeaders.length)) continue;

      rows.slice(headerRow + 1).forEach((row) => {
        const obj = { __aba: sheetName };
        header.forEach((name, index) => {
          if (!name) return;
          obj[name] = row?.[index] ?? '';
        });
        const hasData = Object.entries(obj).some(([key, value]) => key !== '__aba' && String(value ?? '').trim() !== '');
        if (hasData) allObjects.push(obj);
      });
    }

    return allObjects;
  }

  function normalizeFinanceStatus(value) {
    return normalizeText(value) || 'A Vencer';
  }

  function buildFinanceiroReceberPayload(row, fileName) {
    const situacao = normalizeFinanceStatus(financeiroRowValue(row, ['Situação', 'Situacao', 'Status']));
    const codigo = normalizeText(financeiroRowValue(row, ['Código', 'Codigo', 'Cod', 'Cód.']));
    const fatura = normalizeText(financeiroRowValue(row, ['Fatura', 'Nº Fatura', 'Numero Fatura']));
    const cliente = normalizeText(financeiroRowValue(row, ['Cliente', 'Razão Social', 'Razao Social']));
    const conta = normalizeText(financeiroRowValue(row, ['Conta', 'Conta Bancária', 'Conta Bancaria']));
    const emissao_nf = toIsoDate(financeiroRowValue(row, ['Emissão N.F', 'Emissao N.F', 'Emissão NF', 'Emissao NF', 'Data NF']));
    const vencimento = toIsoDate(financeiroRowValue(row, ['Vencimento', 'Data Vencimento', 'Dt. Vencimento']));
    const recebimento = toIsoDate(financeiroRowValue(row, ['Recebimento', 'Data Recebimento', 'Dt. Recebimento']));
    const numero_nf = normalizeText(financeiroRowValue(row, ['N.F.', 'NF', 'Nº NF', 'Numero NF', 'Nota Fiscal']));
    const valor = normalizeNumberBr(financeiroRowValue(row, ['Valor', 'Valor Título', 'Valor Titulo', 'Valor Bruto'])) || 0;
    const desconto = normalizeNumberBr(financeiroRowValue(row, ['Desconto', 'Descontos'])) || 0;
    const juros = normalizeNumberBr(financeiroRowValue(row, ['Juros', 'Juro'])) || 0;
    const valor_pago = normalizeNumberBr(financeiroRowValue(row, ['Valor Pago', 'V. Pago', 'Pago'])) || 0;
    if (!codigo && !fatura && !cliente && !vencimento && !valor) return null;
    return { unique_hash: financeiroHash(['receber', codigo, fatura, cliente, vencimento, valor]), situacao, codigo, fatura, cliente, conta, emissao_nf, vencimento, recebimento, numero_nf, valor, desconto, juros, valor_pago, arquivo_origem: fileName, raw: row, updated_at: new Date().toISOString() };
  }

  function buildFinanceiroPagarPayload(row, fileName) {
    const empresa = normalizeText(financeiroRowValue(row, ['Empresa']));
    const situacao = normalizeFinanceStatus(financeiroRowValue(row, ['Situação', 'Situacao', 'Status']));
    const cod_grupo = normalizeText(financeiroRowValue(row, ['COD/Grupo', 'Cod/Grupo', 'Código', 'Codigo', 'Grupo']));
    const data_lancamento = toIsoDate(financeiroRowValue(row, ['Data', 'Data Lançamento', 'Data Lancamento']));
    const coordenacao = normalizeText(financeiroRowValue(row, ['Coordenação', 'Coordenacao']));
    const supervisao = normalizeText(financeiroRowValue(row, ['Supervisão', 'Supervisao']));
    const favorecido = normalizeText(financeiroRowValue(row, ['Favorecido', 'Fornecedor', 'Nome']));
    const cnpj_cpf = normalizeText(financeiroRowValue(row, ['CNPJ/CPF', 'CNPJ', 'CPF']));
    const identificacao = normalizeText(financeiroRowValue(row, ['Identificação', 'Identificacao']));
    const categoria = normalizeText(financeiroRowValue(row, ['Categoria']));
    const doc = normalizeText(financeiroRowValue(row, ['Doc', 'Documento', 'Nº Doc', 'Numero Doc']));
    const vencimento = toIsoDate(financeiroRowValue(row, ['Vencimento', 'Data Vencimento', 'Dt. Vencimento']));
    const parcela = normalizeText(financeiroRowValue(row, ['Parcela']));
    const valor_pago = normalizeNumberBr(financeiroRowValue(row, ['V. Pago', 'Valor Pago', 'Pago'])) || 0;
    const valor = normalizeNumberBr(financeiroRowValue(row, ['Valor', 'Valor Título', 'Valor Titulo'])) || 0;
    const usuario = normalizeText(financeiroRowValue(row, ['Usuário', 'Usuario']));
    const data_cadastro = toIsoDate(financeiroRowValue(row, ['Data de Cadastro', 'Cadastro']));
    if (!empresa && !cod_grupo && !favorecido && !doc && !vencimento && !valor) return null;
    return { unique_hash: financeiroHash(['pagar', empresa, cod_grupo, favorecido, doc, vencimento, parcela, valor]), empresa, situacao, cod_grupo, data_lancamento, coordenacao, supervisao, favorecido, cnpj_cpf, identificacao, categoria, doc, vencimento, parcela, valor_pago, valor, usuario, data_cadastro, arquivo_origem: fileName, raw: row, updated_at: new Date().toISOString() };
  }

  async function upsertFinanceiroRows(tableName, payloads, opts) {
    const supabase = opts.supabase;
    let total = 0;
    for (let i = 0; i < payloads.length; i += 500) {
      const chunk = payloads.slice(i, i + 500);
      const { error, data } = await supabase.from(tableName).upsert(chunk, { onConflict: 'unique_hash' }).select('id');
      if (error) throw error;
      total += data?.length || chunk.length;
    }
    return total;
  }

  async function importarFinanceiroReceberDaPlanilha(file, opts) {
    const rows = await readFinanceiroObjectsFromFile(file, ['Situação', 'Código', 'Fatura', 'Cliente', 'Vencimento', 'Valor']);
    const payloads = rows.map((row) => buildFinanceiroReceberPayload(row, file.name)).filter(Boolean);
    if (!payloads.length) throw new Error('Não encontrei linhas válidas de Contas a Receber na planilha.');
    const importados = await upsertFinanceiroRows('financeiro_contas_receber', payloads, opts);
    const periodDates = payloads.map((row) => row.vencimento).filter(Boolean).sort();
    return { importados, total_linhas: rows.length, periodo_inicio: periodDates[0] || null, periodo_fim: periodDates[periodDates.length - 1] || null, valor_total: payloads.reduce((sum, row) => sum + Number(row.valor || 0), 0) };
  }

  async function importarFinanceiroPagarDaPlanilha(file, opts) {
    const rows = await readFinanceiroObjectsFromFile(file, ['Empresa', 'Situação', 'COD/Grupo', 'Favorecido', 'Vencimento', 'Valor']);
    const payloads = rows.map((row) => buildFinanceiroPagarPayload(row, file.name)).filter(Boolean);
    if (!payloads.length) throw new Error('Não encontrei linhas válidas de Contas a Pagar na planilha.');
    const importados = await upsertFinanceiroRows('financeiro_contas_pagar', payloads, opts);
    const periodDates = payloads.map((row) => row.vencimento).filter(Boolean).sort();
    return { importados, total_linhas: rows.length, periodo_inicio: periodDates[0] || null, periodo_fim: periodDates[periodDates.length - 1] || null, valor_total: payloads.reduce((sum, row) => sum + Number(row.valor || 0), 0) };
  }

  // ── Despesas mensais por regional → dre_despesas_mensal ────────────────
  async function importarDespesasDaPlanilha(file, opts) {
    const XLSX = await loadXlsx();
    const buffer = await file.arrayBuffer();
    const wb = XLSX.read(buffer, { type: 'array', cellDates: true });

    const candidates = ['Despesas por Regional', 'Despesas', 'DESPESAS', 'Despesas_regionais'];
    const sheetName = wb.SheetNames.find(n => candidates.some(c => normalizeHeader(n).includes(normalizeHeader(c)))) || wb.SheetNames[0];
    if (!sheetName) throw new Error('Aba de Despesas não encontrada.');

    const ws = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true });
    if (!rows || rows.length < 3) throw new Error('Planilha de Despesas inválida.');

    const headerDates = rows[0] || [];
    const headerTypes = rows[1] || [];

    // Detecta coluna TOTAL por mês (chave: "YYYY-MM" → índice da coluna TOTAL)
    const totalColByMonth = new Map();
    let lastMonthKey = null;
    for (let c = 1; c < Math.max(headerDates.length, headerTypes.length); c++) {
      const dateCell = headerDates[c];
      if (dateCell != null && dateCell !== '') {
        let iso = null;
        if (dateCell instanceof Date && !isNaN(dateCell)) {
          iso = `${dateCell.getFullYear()}-${String(dateCell.getMonth() + 1).padStart(2, '0')}`;
        } else {
          const full = toIsoDate(dateCell);
          if (full) iso = full.slice(0, 7);
          else {
            const m = String(dateCell).trim().match(/^(\d{1,2})\/(\d{4})$/);
            if (m) iso = `${m[2]}-${m[1].padStart(2, '0')}`;
          }
        }
        if (iso) lastMonthKey = iso;
      }
      if (!lastMonthKey) continue;
      if (/^TOTAL\s*$/i.test(String(headerTypes[c] || '').trim())) {
        totalColByMonth.set(lastMonthKey, c);
      }
    }
    if (!totalColByMonth.size) throw new Error('Nenhuma coluna TOTAL encontrada. Verifique o formato da planilha de Despesas.');

    // Lê totais por regional e GERAL
    const byKey  = new Map(); // "COORD|YYYY-MM" → total
    const geralM = new Map(); // "YYYY-MM" → total
    const normUp = v => String(v || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toUpperCase();

    for (const row of rows.slice(2)) {
      const raw = String(row?.[0] || '').trim();
      if (!raw) continue;
      const norm = normUp(raw);
      if (!norm || /^TOTAL/i.test(norm)) continue;
      const isGeral = norm === 'GERAL';
      for (const [mk, ci] of totalColByMonth) {
        const val = normalizeNumberBr(row[ci]) || 0;
        if (!val) continue;
        if (isGeral) geralM.set(mk, (geralM.get(mk) || 0) + val);
        else         byKey.set(`${norm}|${mk}`, (byKey.get(`${norm}|${mk}`) || 0) + val);
      }
    }

    // Monta payloads com rateio
    const payloads = [];
    for (const mk of totalColByMonth.keys()) {
      const [yr, ms] = mk.split('-');
      const ano = Number(yr), mes = Number(ms);
      if (!ano || !mes) continue;

      let totalTodasRegionais = 0;
      const regionaisDoMes = new Map();
      for (const [k, v] of byKey) {
        const [coord, m] = k.split('|');
        if (m !== mk) continue;
        regionaisDoMes.set(coord, v);
        totalTodasRegionais += v;
      }

      const totalGeral = geralM.get(mk) || 0;
      for (const [coordenacao, total_coordenacao] of regionaisDoMes) {
        const rateio = totalTodasRegionais > 0 ? (total_coordenacao / totalTodasRegionais) * totalGeral : 0;
        payloads.push({ ano, mes, coordenacao, total_coordenacao, total_geral: totalGeral, total_todas_regionais: totalTodasRegionais, rateio, total_com_rateio: total_coordenacao + rateio, updated_at: new Date().toISOString() });
      }
    }
    if (!payloads.length) return { total: 0, meses: 0, regionais: 0 };

    for (let i = 0; i < payloads.length; i += 100) {
      const { error } = await opts.supabase.from('dre_despesas_mensal').upsert(payloads.slice(i, i + 100), { onConflict: 'ano,mes,coordenacao' });
      if (error) throw new Error('Erro ao salvar despesas: ' + error.message);
    }
    return { total: payloads.length, meses: new Set(payloads.map(p => `${p.mes}/${p.ano}`)).size, regionais: new Set(payloads.map(p => p.coordenacao)).size };
  }

export { importarFinanceiroReceberDaPlanilha, importarFinanceiroPagarDaPlanilha, importarDespesasDaPlanilha };
