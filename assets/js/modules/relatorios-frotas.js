// Relatórios — importação — importação de corridas Uber, Patrimônios e Excesso de velocidade.
// Extraído de modules/relatorios.js em 15/10/2026 (era um único bloco autoexecutável de ~3.900 linhas).
// O código das funções e constantes foi movido sem alteração. Para publicar uma mudança em qualquer
// módulo relatorios-*.js, troque o token ?v=20261015-relatorios1 em TODOS os imports internos e no carregador
// (assets/js/relatorio-importador.js): tests/relatorios-modulos-versao.test.mjs garante que fiquem iguais.
import { loadXlsx, normalizeHeader, makeIsoDate, toIsoDate, findHeaderRow, pickValue, normalizeNumberBr, normalizeText } from './relatorios-planilha.js?v=20261015-relatorios1';

  function normalizeKey(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '');
  }

  function normalizePlate(value) {
    return String(value || '')
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
      .slice(0, 7);
  }

  function extractPlateFromText(value) {
    const text = String(value || '').toUpperCase();
    const mercosul = text.match(/\b[A-Z]{3}[0-9][A-Z][0-9]{2}\b/);
    if (mercosul) return normalizePlate(mercosul[0]);
    const antigo = text.match(/\b[A-Z]{3}[0-9]{4}\b/);
    if (antigo) return normalizePlate(antigo[0]);
    return '';
  }

  function normalizeInteger(value) {
    if (value === null || value === undefined || value === '') return null;
    if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value);
    const n = Number(String(value).replace(/[^0-9-]/g, ''));
    return Number.isFinite(n) ? Math.trunc(n) : null;
  }

  function normalizeDateTimeExcel(value) {
    if (value === null || value === undefined || value === '') return null;
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
    if (typeof value === 'number' && window.XLSX?.SSF?.parse_date_code) {
      const parsed = window.XLSX.SSF.parse_date_code(value);
      if (!parsed) return null;
      const mm = String(parsed.m).padStart(2, '0');
      const dd = String(parsed.d).padStart(2, '0');
      const hh = String(parsed.H || 0).padStart(2, '0');
      const mi = String(parsed.M || 0).padStart(2, '0');
      const ss = String(Math.floor(parsed.S || 0)).padStart(2, '0');
      return `${parsed.y}-${mm}-${dd}T${hh}:${mi}:${ss}`;
    }
    const iso = toIsoDate(value);
    if (iso) {
      const s = String(value).trim();
      const t = s.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
      if (t) return `${iso}T${String(t[1]).padStart(2, '0')}:${t[2]}:${t[3] || '00'}`;
      return `${iso}T00:00:00`;
    }
    return null;
  }

  function hasAnyHeader(row, aliases = []) {
    if (!row || typeof row !== 'object') return false;
    const keys = Object.keys(row);
    const normalized = new Set(keys.map(normalizeKey));
    return aliases.some((alias) => keys.includes(alias) || normalized.has(normalizeKey(alias)));
  }

  function parseTimeText(value) {
    if (value === null || value === undefined || value === '') return null;
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return `${String(value.getHours()).padStart(2, '0')}:${String(value.getMinutes()).padStart(2, '0')}:${String(value.getSeconds()).padStart(2, '0')}`;
    }
    if (typeof value === 'number' && window.XLSX?.SSF?.parse_date_code) {
      const parsed = window.XLSX.SSF.parse_date_code(value);
      if (parsed) return `${String(parsed.H || 0).padStart(2, '0')}:${String(parsed.M || 0).padStart(2, '0')}:${String(Math.floor(parsed.S || 0)).padStart(2, '0')}`;
    }
    const s = String(value).trim();
    const m = s.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
    return m ? `${String(m[1]).padStart(2, '0')}:${m[2]}:${m[3] || '00'}` : (s || null);
  }

  function excelSerialToDate(serial) {
    const n = Number(serial);
    if (!Number.isFinite(n)) return null;
    // Excel serial date, with 1899-12-30 base used by SheetJS/Excel interop.
    const utcValue = (n - 25569) * 86400;
    const dateInfo = new Date(Math.round(utcValue * 1000));
    if (Number.isNaN(dateInfo.getTime())) return null;
    return dateInfo;
  }

  function inferUberMonthFromFileName(fileName) {
    const text = normalizeHeader(fileName || '');
    const map = { jan: 1, fev: 2, feb: 2, mar: 3, abr: 4, apr: 4, mai: 5, may: 5, jun: 6, jul: 7, ago: 8, aug: 8, set: 9, sep: 9, out: 10, oct: 10, nov: 11, dez: 12, dec: 12 };
    const monthKey = Object.keys(map).find((key) => text.includes(key));
    return monthKey ? map[monthKey] : null;
  }

  function parseUberStringDate(value, fileName) {
    const s = String(value || '').trim();
    if (!s) return null;
    let m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})(?:\s+.*)?$/);
    if (m) {
      const a = Number(m[1]);
      const b = Number(m[2]);
      const year = Number(m[3]);
      const monthHint = inferUberMonthFromFileName(fileName);

      // Relatórios Uber normalmente vêm em MM/DD/YYYY.
      // Quando o arquivo tem mês no nome, usamos isso para desfazer ambiguidade.
      if (monthHint && a === monthHint) return makeIsoDate(year, a, b);
      if (monthHint && b === monthHint) return makeIsoDate(year, b, a);

      if (a <= 12 && b > 12) return makeIsoDate(year, a, b); // MM/DD/YYYY
      if (b <= 12 && a > 12) return makeIsoDate(year, b, a); // DD/MM/YYYY

      // Na dúvida, prioriza padrão Uber/EUA para evitar mês 13 em datas como 03/13/2026.
      return makeIsoDate(year, a, b) || makeIsoDate(year, b, a);
    }

    m = s.match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})(?:\s+.*)?$/);
    if (m) return makeIsoDate(m[1], m[2], m[3]);

    return toIsoDate(value);
  }

  function toIsoDateUber(value, fileName) {
    if (value === null || value === undefined || value === '') return null;
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
    if (typeof value === 'number') {
      const date = excelSerialToDate(value);
      return date ? date.toISOString().slice(0, 10) : null;
    }
    return parseUberStringDate(value, fileName);
  }

  function toTimestampUber(value, fileName) {
    if (value === null || value === undefined || value === '') return null;
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
    if (typeof value === 'number') {
      const date = excelSerialToDate(value);
      return date ? date.toISOString() : null;
    }
    const iso = parseUberStringDate(value, fileName);
    return iso ? `${iso}T00:00:00Z` : null;
  }

  function normalizeUberTime(value) {
    if (value === null || value === undefined || value === '') return null;
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return `${String(value.getHours()).padStart(2, '0')}:${String(value.getMinutes()).padStart(2, '0')}`;
    }
    return String(value).trim() || null;
  }

  function buildUberImportHash(row) {
    const parts = [
      row.data_solicitacao_local || '',
      row.hora_solicitacao_local || '',
      row.nome || '',
      row.endereco_partida || '',
      row.endereco_destino || '',
      row.preco_liquido ?? '',
    ].map((v) => normalizeHeader(String(v)));
    return parts.join('|').slice(0, 500);
  }

  async function readUberCorridasFromFile(file) {
    const XLSX = await loadXlsx();
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
    const mapped = [];

    for (const sheetName of workbook.SheetNames || []) {
      const sheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: true });
      if (!rows?.length) continue;

      const headerRow = findHeaderRow(rows, ['NOME', 'Endereço de partida', 'Endereço de destino', 'Preço líquido do parceiro (moeda local)']);
      const rawHeader = rows[headerRow] || [];
      const normalizedHeader = rawHeader.map(normalizeHeader);
      const hasUberStructure = normalizedHeader.includes('nome')
        && normalizedHeader.some((h) => h.includes('endereco de partida'))
        && normalizedHeader.some((h) => h.includes('endereco de destino'))
        && normalizedHeader.some((h) => h.includes('preco liquido'));
      if (!hasUberStructure) continue;

      const headers = rawHeader.map((h, index) => String(h || `COLUNA_${index + 1}`).trim());
      rows.slice(headerRow + 1).forEach((row) => {
        const obj = {};
        headers.forEach((header, index) => {
          if (!header) return;
          obj[header] = row?.[index] ?? '';
        });

        const nome = String(pickValue(obj, ['NOME', 'Nome', 'Colaborador', 'Funcionário', 'Funcionario']) || '').trim();
        const enderecoPartida = String(pickValue(obj, ['Endereço de partida', 'Endereco de partida', 'Partida']) || '').trim();
        const enderecoDestino = String(pickValue(obj, ['Endereço de destino', 'Endereco de destino', 'Destino']) || '').trim();
        if (!nome || (!enderecoPartida && !enderecoDestino)) return;

        const registro = {
          data_hora_transacao_utc: toTimestampUber(pickValue(obj, ['Registro de data e hora da transação (UTC)', 'Registro de data e hora da transacao UTC']), file.name),
          hora_solicitacao_utc: normalizeUberTime(pickValue(obj, ['Hora da solicitação (UTC)', 'Hora da solicitacao UTC'])),
          data_solicitacao_local: toIsoDateUber(pickValue(obj, ['Data da solicitação (local)', 'Data da solicitacao local']), file.name),
          hora_solicitacao_local: normalizeUberTime(pickValue(obj, ['Hora da solicitação (local)', 'Hora da solicitacao local'])),
          data_chegada_utc: toIsoDateUber(pickValue(obj, ['Data de chegada (UTC)', 'Data chegada UTC']), file.name),
          hora_chegada_utc: normalizeUberTime(pickValue(obj, ['Hora de chegada (UTC)', 'Hora chegada UTC'])),
          data_chegada_local: toIsoDateUber(pickValue(obj, ['Data de chegada (local)', 'Data chegada local']), file.name),
          hora_chegada_local: normalizeUberTime(pickValue(obj, ['Hora de chegada (local)', 'Hora chegada local'])),
          nome,
          coord: String(pickValue(obj, ['Coord', 'Coordenação', 'Coordenacao']) || '').trim() || null,
          supervisao: String(pickValue(obj, ['Superv', 'Supervisão', 'Supervisao']) || '').trim() || null,
          grupo: String(pickValue(obj, ['Grupo']) || '').trim() || null,
          servico: String(pickValue(obj, ['Serviço', 'Servico']) || '').trim() || null,
          programa: String(pickValue(obj, ['Programa']) || '').trim() || null,
          cidade: String(pickValue(obj, ['Cidade']) || '').trim() || null,
          pais: String(pickValue(obj, ['País', 'Pais']) || '').trim() || null,
          distancia_mi: normalizeNumberBr(pickValue(obj, ['Distância (mi)', 'Distancia (mi)', 'Distância', 'Distancia'])),
          duracao_min: normalizeNumberBr(pickValue(obj, ['Duração (min)', 'Duracao (min)', 'Duração', 'Duracao'])),
          endereco_partida: enderecoPartida || null,
          endereco_destino: enderecoDestino || null,
          detalhamento_despesa: String(pickValue(obj, ['Detalhamento da despesa', 'Detalhamento']) || '').trim() || null,
          preco_liquido: normalizeNumberBr(pickValue(obj, ['Preço líquido do parceiro (moeda local)', 'Preco liquido do parceiro moeda local', 'Preço líquido', 'Preco liquido', 'Valor'])) || 0,
          arquivo_nome: file.name,
          status_validacao: 'ATENCAO',
        };
        registro.import_hash = buildUberImportHash(registro);
        mapped.push(registro);
      });
    }

    return mapped;
  }

  async function importarUberCorridasDaPlanilha(file, opts) {
    const corridas = await readUberCorridasFromFile(file);
    if (!corridas.length) {
      throw new Error('A planilha Uber não possui linhas válidas. Cabeçalhos esperados: NOME, Data da solicitação (local), Endereço de partida, Endereço de destino e Preço líquido do parceiro.');
    }

    const batchSize = 500;
    let total = 0;
    for (let i = 0; i < corridas.length; i += batchSize) {
      const batch = corridas.slice(i, i + batchSize);
      const { error } = await opts.supabase
        .from('conferencia_uber_corridas')
        .upsert(batch, { onConflict: 'import_hash' });
      if (error) throw new Error(error.message || 'Falha ao gravar corridas Uber no Supabase. Confira se rodou o SQL da Conferência Uber.');
      total += batch.length;
    }

    const periodos = corridas.map((r) => r.data_solicitacao_local).filter(Boolean).sort();
    const colaboradores = new Set(corridas.map((r) => normalizeHeader(r.nome)).filter(Boolean)).size;
    const valorTotal = corridas.reduce((sum, r) => sum + Number(r.preco_liquido || 0), 0);
    return {
      total_linhas: corridas.length,
      importados: total,
      colaboradores,
      valor_total: Math.round(valorTotal * 100) / 100,
      periodo_inicio: periodos[0] || null,
      periodo_fim: periodos[periodos.length - 1] || null,
    };
  }

  const PATRIMONIO_COL = {
    patrimonioCodigo: ['Patrimônio', 'Patrimonio'],
    coordenacao: ['Coordenação', 'Coordenacao'],
    supervisao: ['Supervisão', 'Supervisao'],
    funcionario: ['Funcionário', 'Funcionario'],
    identificacao: ['Identificação', 'Identificacao'],
    categoria: ['Categoria'],
    marca: ['Marca'],
    modelo: ['Modelo'],
    dataAquisicao: ['Data de Aquisição', 'Data de Aquisicao'],
    dataRegistro: ['Data de Registro'],
    situacao: ['Situação', 'Situacao'],
    ultimaLeitura: ['Ultima Leitura', 'Última Leitura'],
    diasSemLeitura: ['Dias sem Leitura']
  };

  function mapPatrimonioRow(row, importacaoId, dataUpload = null) {
    const patrimonioCodigo = normalizeText(pickValue(row, PATRIMONIO_COL.patrimonioCodigo));
    return {
      importacao_id: importacaoId,
      data_upload: dataUpload || null,
      patrimonio_codigo: patrimonioCodigo ? String(patrimonioCodigo).trim().toUpperCase() : null,
      coordenacao: normalizeText(pickValue(row, PATRIMONIO_COL.coordenacao)),
      supervisao: normalizeText(pickValue(row, PATRIMONIO_COL.supervisao)),
      funcionario: normalizeText(pickValue(row, PATRIMONIO_COL.funcionario)),
      identificacao: normalizeText(pickValue(row, PATRIMONIO_COL.identificacao)),
      categoria: normalizeText(pickValue(row, PATRIMONIO_COL.categoria)),
      marca: normalizeText(pickValue(row, PATRIMONIO_COL.marca)),
      modelo: normalizeText(pickValue(row, PATRIMONIO_COL.modelo)),
      data_aquisicao: normalizeDateTimeExcel(pickValue(row, PATRIMONIO_COL.dataAquisicao)),
      data_registro: normalizeDateTimeExcel(pickValue(row, PATRIMONIO_COL.dataRegistro)),
      situacao: normalizeText(pickValue(row, PATRIMONIO_COL.situacao)),
      ultima_leitura: normalizeDateTimeExcel(pickValue(row, PATRIMONIO_COL.ultimaLeitura)),
      dias_sem_leitura: normalizeInteger(pickValue(row, PATRIMONIO_COL.diasSemLeitura)),
      hash_linha: patrimonioCodigo ? String(patrimonioCodigo).trim().toUpperCase() : null,
    };
  }

  async function readPatrimoniosFromFile(file) {
    const XLSX = await loadXlsx();
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
    const sheetName = workbook.SheetNames.find((name) => normalizeHeader(name).includes('patrimonio')) || workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: null, raw: true });
    if (!rows.length) throw new Error('A planilha de patrimônios está vazia.');
    const first = rows[0] || {};
    const missing = [];
    if (!hasAnyHeader(first, PATRIMONIO_COL.patrimonioCodigo)) missing.push('Patrimônio');
    if (!hasAnyHeader(first, PATRIMONIO_COL.funcionario)) missing.push('Funcionário');
    if (!hasAnyHeader(first, PATRIMONIO_COL.situacao)) missing.push('Situação');
    if (missing.length) throw new Error(`Planilha de patrimônios inválida. Cabeçalho(s) ausente(s): ${missing.join(', ')}.`);
    return { rows, sheetName };
  }

  async function importarPatrimoniosDaPlanilha(file, opts) {
    const { rows, sheetName } = await readPatrimoniosFromFile(file);
    const user = opts.user || opts.auth?.user || null;
    const userMeta = user?.user_metadata || {};
    const userName = userMeta.full_name || userMeta.name || user?.email || null;
    const dataUpload = new Date().toISOString();

    const { data: importacao, error: impError } = await opts.supabase
      .from('patrimonios_importacoes')
      .insert({
        nome_arquivo: file.name,
        data_upload: dataUpload,
        origem: 'importar_relatorios',
        status: 'processando',
        total_linhas: rows.length,
        total_importadas: 0,
        total_erros: 0,
        observacoes: `Importado pela Central de Importação · Aba: ${sheetName}`,
        criado_por: user?.id || null,
        criado_por_nome: userName,
      })
      .select('id')
      .single();
    if (impError) throw new Error(impError.message || 'Falha ao criar importação de patrimônios.');

    const mappedRaw = rows.map((row) => mapPatrimonioRow(row, importacao.id, dataUpload)).filter((row) => row.patrimonio_codigo);
    const unique = new Map();
    mappedRaw.forEach((row) => unique.set(row.patrimonio_codigo, row));
    const mapped = Array.from(unique.values());

    if (!mapped.length) throw new Error('Nenhuma linha válida encontrada na planilha de patrimônios.');

    const { error: limparError } = await opts.supabase.rpc('limpar_patrimonios_snapshot');
    if (limparError) throw new Error(limparError.message || 'Falha ao limpar snapshot de patrimônios.');

    const batchSize = 500;
    let total = 0;
    for (let i = 0; i < mapped.length; i += batchSize) {
      const batch = mapped.slice(i, i + batchSize);
      const { error } = await opts.supabase.from('patrimonios_snapshot').upsert(batch, { onConflict: 'patrimonio_codigo' });
      if (error) throw new Error(error.message || 'Falha ao gravar patrimônios no Supabase.');
      total += batch.length;
    }

    for (let i = 0; i < mapped.length; i += batchSize) {
      const batch = mapped.slice(i, i + batchSize);
      const { error } = await opts.supabase.from('patrimonios_historico_leituras').insert(batch);
      if (error) throw new Error(error.message || 'Falha ao gravar histórico de patrimônios no Supabase.');
    }

    let frotaPatrimonioSync = null;
    try {
      const { data: syncData, error: syncError } = await opts.supabase.rpc('sincronizar_frotas_veiculos_patrimonios');
      if (syncError) console.warn('[RELATORIOS] Falha ao associar patrimônios aos veículos:', syncError);
      else frotaPatrimonioSync = syncData || null;
    } catch (syncErr) {
      console.warn('[RELATORIOS] Falha ao associar patrimônios aos veículos:', syncErr);
    }

    const { error: updError } = await opts.supabase
      .from('patrimonios_importacoes')
      .update({
        status: 'concluido',
        total_importadas: total,
        total_erros: Math.max(rows.length - total, 0),
        observacoes: `Central de Importação · Aba: ${sheetName}`,
      })
      .eq('id', importacao.id);
    if (updError) throw new Error(updError.message || 'Falha ao concluir importação de patrimônios.');

    const veiculos = mapped.filter((r) => normalizeHeader(r.categoria).includes('veiculo') || extractPlateFromText(r.identificacao)).length;
    return { total_linhas: rows.length, importados: total, veiculos, aba: sheetName, frotas_associadas: frotaPatrimonioSync };
  }

  function buildFrotasExcessoHash(row) {
    return [row.data_evento || '', row.hora_evento || '', row.placa || '', row.velocidade || '', row.latitude || '', row.longitude || '']
      .map((v) => normalizeHeader(String(v)))
      .join('|')
      .slice(0, 500);
  }

  async function loadPatrimonioVeiculosMap(opts) {
    const map = new Map();
    const pageSize = 1000;
    let from = 0;
    while (from < 10000) {
      const { data, error } = await opts.supabase
        .from('patrimonios_snapshot')
        .select('id,patrimonio_codigo,coordenacao,supervisao,funcionario,identificacao,categoria,situacao,ultima_leitura')
        .order('id', { ascending: true }) // desempate: sem chave única a paginação repete/pula linhas
        .range(from, from + pageSize - 1);
      if (error) {
        console.warn('[RELATORIOS] Não foi possível carregar patrimônios para cruzamento:', error);
        break;
      }
      const rows = Array.isArray(data) ? data : [];
      rows.forEach((r) => {
        const plate = extractPlateFromText(r.identificacao);
        if (!plate) return;
        const categoria = normalizeHeader(r.categoria);
        const situacao = normalizeHeader(r.situacao);
        if (categoria && !categoria.includes('veiculo')) return;
        if (situacao && !situacao.includes('ativo')) return;
        map.set(plate, r);
      });
      if (rows.length < pageSize) break;
      from += pageSize;
    }
    return map;
  }

  async function readFrotasExcessoFromFile(file) {
    const XLSX = await loadXlsx();
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
    const mapped = [];

    for (const sheetName of workbook.SheetNames || []) {
      const sheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: true });
      if (!rows?.length) continue;

      const headerRow = findHeaderRow(rows, ['Data', 'Hora', 'Alerta', 'Placa', 'Velocidade']);
      const headers = (rows[headerRow] || []).map((h, index) => String(h || `COLUNA_${index + 1}`).trim());
      const normalized = headers.map(normalizeHeader);
      const hasStructure = normalized.includes('data') && normalized.includes('hora') && normalized.includes('placa') && normalized.includes('velocidade');
      if (!hasStructure) continue;

      rows.slice(headerRow + 1).forEach((row) => {
        const obj = {};
        headers.forEach((header, index) => { obj[header] = row?.[index] ?? ''; });
        const placa = normalizePlate(pickValue(obj, ['Placa', 'Plate']));
        const dataEvento = toIsoDate(pickValue(obj, ['Data', 'Date']));
        const velocidade = normalizeNumberBr(pickValue(obj, ['Velocidade', 'Speed']));
        if (!placa || !dataEvento || !velocidade) return;

        const registro = {
          data_evento: dataEvento,
          hora_evento: parseTimeText(pickValue(obj, ['Hora', 'Time'])),
          alerta: normalizeText(pickValue(obj, ['Alerta', 'Alert'])) || 'Excesso de velocidade',
          ativo_rastreador: normalizeText(pickValue(obj, ['Ativo', 'Veículo', 'Veiculo', 'Vehicle'])),
          placa,
          motorista_planilha: normalizeText(pickValue(obj, ['Motorista', 'Condutor', 'Driver'])),
          velocidade,
          endereco: normalizeText(pickValue(obj, ['Endereco', 'Endereço', 'Address'])),
          latitude: normalizeNumberBr(pickValue(obj, ['Latitude', 'Lat'])),
          longitude: normalizeNumberBr(pickValue(obj, ['Longitude', 'Long', 'Lng'])),
          mapa_url: normalizeText(pickValue(obj, ['Ver mapa', 'Mapa', 'Map'])),
          arquivo_nome: file.name,
          origem: 'importar_relatorios',
          status_notificacao: 'PENDENTE',
        };
        registro.import_hash = buildFrotasExcessoHash(registro);
        mapped.push(registro);
      });
    }

    return mapped;
  }

  async function importarFrotasExcessoVelocidadeDaPlanilha(file, opts) {
    const registros = await readFrotasExcessoFromFile(file);
    if (!registros.length) {
      throw new Error('A planilha de excesso de velocidade não possui linhas válidas. Cabeçalhos esperados: Data, Hora, Alerta, Ativo, Placa, Motorista, Velocidade, Endereço, Latitude e Longitude.');
    }

    const patrimonioMap = await loadPatrimonioVeiculosMap(opts);
    const cruzados = registros.map((r) => {
      const pat = patrimonioMap.get(r.placa);
      return {
        ...r,
        patrimonio_id: pat?.id || null,
        patrimonio_codigo: pat?.patrimonio_codigo || null,
        patrimonio_funcionario: pat?.funcionario || null,
        patrimonio_identificacao: pat?.identificacao || null,
        coordenacao: pat?.coordenacao || null,
        supervisao: pat?.supervisao || null,
        status_cruzamento: pat?.funcionario ? 'MOTORISTA_IDENTIFICADO' : 'PENDENTE_CONFERENCIA',
      };
    });

    const batchSize = 500;
    let total = 0;
    for (let i = 0; i < cruzados.length; i += batchSize) {
      const batch = cruzados.slice(i, i + batchSize);
      const { error } = await opts.supabase
        .from('frotas_excesso_velocidade')
        .upsert(batch, { onConflict: 'import_hash' });
      if (error) throw new Error(error.message || 'Falha ao gravar excessos de velocidade. Rode o SQL do módulo Frotas antes.');
      total += batch.length;
    }

    const identificados = cruzados.filter((r) => r.patrimonio_funcionario).length;
    const placas = new Set(cruzados.map((r) => r.placa).filter(Boolean)).size;
    const motoristas = new Set(cruzados.map((r) => normalizeHeader(r.patrimonio_funcionario || r.motorista_planilha || '')).filter(Boolean)).size;
    const periodos = cruzados.map((r) => r.data_evento).filter(Boolean).sort();
    return {
      total_linhas: cruzados.length,
      importados: total,
      placas,
      motoristas,
      identificados,
      pendentes: total - identificados,
      periodo_inicio: periodos[0] || null,
      periodo_fim: periodos[periodos.length - 1] || null,
    };
  }

export { importarUberCorridasDaPlanilha, importarPatrimoniosDaPlanilha, importarFrotasExcessoVelocidadeDaPlanilha };
