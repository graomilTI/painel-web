// Relatórios — importação — importação de Auditorias, Lista de O.S., Pontos de embarque, Clínicas SST, Distribuição de O.S. e Logística BTG.
// Extraído de modules/relatorios.js em 15/10/2026 (era um único bloco autoexecutável de ~3.900 linhas).
// O código das funções e constantes foi movido sem alteração. Para publicar uma mudança em qualquer
// módulo relatorios-*.js, troque o token ?v=20261015-relatorios1 em TODOS os imports internos e no carregador
// (assets/js/relatorio-importador.js): tests/relatorios-modulos-versao.test.mjs garante que fiquem iguais.
import { loadXlsx, normalizeHeader, toIsoDate, headerMatches, findHeaderRow, pickValue, normalizeNumberBr, normalizeText, colaboradorNomeChave } from './relatorios-planilha.js?v=20261015-relatorios1';

  async function readPontosEmbarqueFromFile(file) {
    const XLSX = await loadXlsx();
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array', cellDates: false });
    const sheetName = workbook.SheetNames.find((name) => normalizeHeader(name) === 'dados') || workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: true });

    const mapped = [];
    const seen = new Set();

    rows.forEach((row) => {
      const tipoLocal = String(pickValue(row, ['Tipo do Local', 'Tipo Local', 'Tipo']) || '').trim();
      const nomeLocal = String(pickValue(row, ['Local', 'Nome Local', 'Ponto', 'Ponto de Embarque']) || '').trim();
      const uf = String(pickValue(row, ['UF', 'Estado']) || '').trim().toUpperCase().slice(0, 2);
      const cidade = String(pickValue(row, ['Cidade', 'Município', 'Municipio']) || '').trim();
      const latitude = normalizeNumberBr(pickValue(row, ['Latitude', 'Lat']));
      const longitude = normalizeNumberBr(pickValue(row, ['Longitude', 'Lng', 'Long']));
      const supervisao = String(pickValue(row, ['Supervisão', 'Supervisao']) || '').trim();
      const coordenacao = String(pickValue(row, ['Coordenação', 'Coordenacao']) || '').trim();

      if (!nomeLocal || !cidade || !uf) return;
      const key = `${nomeLocal.toUpperCase()}|${cidade.toUpperCase()}|${uf}`;
      if (seen.has(key)) return;
      seen.add(key);

      mapped.push({
        tipo_local: tipoLocal || null,
        nome_local: nomeLocal,
        uf,
        cidade,
        latitude,
        longitude,
        supervisao: supervisao || null,
        coordenacao: coordenacao || null,
        origem: 'importar_relatorios',
        ativo: true,
      });
    });

    return mapped;
  }

  async function importarPontosEmbarqueDaPlanilha(file, opts) {
    const pontos = await readPontosEmbarqueFromFile(file);
    if (!pontos.length) {
      throw new Error('A planilha de pontos de embarque não possui linhas válidas. Cabeçalhos esperados: Tipo do Local, Local, UF, Cidade, Latitude, Longitude, Supervisão e Coordenação.');
    }

    const batchSize = 500;
    let total = 0;
    for (let i = 0; i < pontos.length; i += batchSize) {
      const batch = pontos.slice(i, i + batchSize);
      const { error } = await opts.supabase
        .from('operacional_pontos_embarque')
        .upsert(batch, { onConflict: 'nome_local,cidade,uf' });
      if (error) throw new Error(error.message || 'Falha ao gravar pontos de embarque no Supabase.');
      total += batch.length;
    }

    const cidades = new Set(pontos.map((ponto) => `${ponto.cidade}/${ponto.uf}`)).size;
    const supervisoes = new Set(pontos.map((ponto) => ponto.supervisao).filter(Boolean)).size;
    return { total_linhas: pontos.length, importados: total, cidades, supervisoes };
  }

  function auditoriaImportHash(row) {
    const base = [
      pickValue(row, ['Classificador']),
      pickValue(row, ['O.S', 'OS']),
      pickValue(row, ['Placa']),
      pickValue(row, ['Data Resultado', 'Data da Class.', 'Data da Classificacao', 'Data da Classificação']),
      pickValue(row, ['Motivo da recusa', 'Motivo Recusa']),
      pickValue(row, ['Resultado']),
    ].map((v) => colaboradorNomeChave(v)).join('|');
    return base || String(Date.now());
  }

  function inferAuditoriaImpacto(resultado, motivoRecusa, diferenca, descontoKg) {
    const res = normalizeHeader(resultado || '');
    const motivo = normalizeHeader(motivoRecusa || '');
    const diff = Math.abs(Number(diferenca || 0));
    const desconto = Math.abs(Number(descontoKg || 0));
    if (res.includes('produto padrao') || res.includes('padrão')) return { impacto: 0, severidade: 'baixa', tipo: 'Produto padrão' };
    if (res.includes('desconto') || desconto > 0) {
      const impacto = Math.min(35, Math.max(8, 8 + diff * 2 + Math.min(desconto / 1500, 10)));
      return { impacto: Math.round(impacto * 100) / 100, severidade: impacto >= 18 ? 'alta' : 'media', tipo: 'Desconto' };
    }
    if (motivo) return { impacto: 6, severidade: 'media', tipo: 'Apontamento' };
    return { impacto: 0, severidade: 'baixa', tipo: 'Auditoria' };
  }

  async function readAuditoriasOperacionalFromFile(file) {
    const XLSX = await loadXlsx();
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
    const preferred = workbook.SheetNames.find((name) => normalizeHeader(name).includes('unificada'))
      || workbook.SheetNames.find((name) => normalizeHeader(name).includes('descritiva'))
      || workbook.SheetNames[0];
    const sheet = workbook.Sheets[preferred];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: true });
    const mapped = [];
    const seen = new Set();

    rows.forEach((row) => {
      const nome = String(pickValue(row, ['Classificador', 'Colaborador', 'Funcionário', 'Funcionario']) || '').trim();
      const nomeChave = colaboradorNomeChave(nome);
      if (!nome || !nomeChave) return;

      const resultado = String(pickValue(row, ['Resultado']) || '').trim();
      const motivo = String(pickValue(row, ['Motivo da recusa', 'Motivo Recusa']) || '').trim();
      const diferenca = normalizeNumberBr(pickValue(row, ['Diferença', 'Diferenca']));
      const descontoKg = normalizeNumberBr(pickValue(row, ['Desconto Kg', 'Desconto'])) || 0;
      const impacto = inferAuditoriaImpacto(resultado, motivo, diferenca, descontoKg);
      const importHash = auditoriaImportHash(row);
      if (seen.has(importHash)) return;
      seen.add(importHash);

      mapped.push({
        import_hash: importHash,
        nome_colaborador: nome,
        nome_chave: nomeChave,
        tipo_funcionario: String(pickValue(row, ['Tipo Funcionario', 'Tipo Funcionário']) || '').trim() || null,
        data_evento: toIsoDate(pickValue(row, ['Data Resultado', 'Data Abertura', 'Data da Class.', 'Data da Classificacao', 'Data da Classificação'])),
        data_classificacao: toIsoDate(pickValue(row, ['Data da Class.', 'Data da Classificacao', 'Data da Classificação'])),
        referencia: String(pickValue(row, ['Referência', 'Referencia']) || '').trim() || null,
        uf_destino: String(pickValue(row, ['UF Dest.', 'UF Dest', 'UF Destino']) || '').trim().toUpperCase().slice(0, 2) || null,
        cidade_destino: String(pickValue(row, ['Cid. Dest.', 'Cid Dest', 'Cidade Destino']) || '').trim() || null,
        destino: String(pickValue(row, ['Destino']) || '').trim() || null,
        placa: String(pickValue(row, ['Placa']) || '').trim() || null,
        os: String(pickValue(row, ['O.S', 'OS']) || '').trim() || null,
        contrato: String(pickValue(row, ['Contrato']) || '').trim() || null,
        nf: String(pickValue(row, ['N.F.', 'NF']) || '').trim() || null,
        produto: String(pickValue(row, ['Produto']) || '').trim() || null,
        servico: String(pickValue(row, ['Serviço', 'Servico']) || '').trim() || null,
        peso_kg: normalizeNumberBr(pickValue(row, ['Peso (Kg)', 'Peso Kg', 'Peso'])),
        cliente_nacional: String(pickValue(row, ['Cli. Nacional', 'Cliente Nacional']) || '').trim() || null,
        cliente_regional: String(pickValue(row, ['Cli. Regional', 'Cliente Regional']) || '').trim() || null,
        cliente_final: String(pickValue(row, ['Cli. Final', 'Cliente Final']) || '').trim() || null,
        estado_embarque: String(pickValue(row, ['Est. Embarq', 'Estado Embarque']) || '').trim().toUpperCase().slice(0, 2) || null,
        cidade_embarque: String(pickValue(row, ['Cid. Embarq', 'Cidade Embarque']) || '').trim() || null,
        local_embarque: String(pickValue(row, ['Local Embarque']) || '').trim() || null,
        coordenacao: String(pickValue(row, ['Coordenação', 'Coordenacao']) || '').trim() || null,
        supervisao: String(pickValue(row, ['Supervisão', 'Supervisao']) || '').trim() || null,
        auditor: String(pickValue(row, ['Auditor']) || '').trim() || null,
        motivo_recusa: motivo || null,
        resultado_origem: String(pickValue(row, ['Result. Origem', 'Resultado Origem']) || '').trim() || null,
        resultado_recusa: String(pickValue(row, ['Result. Recusa', 'Resultado Recusa']) || '').trim() || null,
        resultado_auditoria: String(pickValue(row, ['Result. Auditoria', 'Resultado Auditoria']) || '').trim() || null,
        resultado: resultado || null,
        diferenca,
        desconto_kg: descontoKg,
        tipo_evento: impacto.tipo,
        severidade: impacto.severidade,
        score_impacto: impacto.impacto,
        descricao: [resultado, motivo].filter(Boolean).join(' · ') || null,
        origem: 'importar_relatorios_auditoria',
        ativo: true,
      });
    });

    return mapped;
  }

  async function importarAuditoriasOperacionalDaPlanilha(file, opts) {
    const auditorias = await readAuditoriasOperacionalFromFile(file);
    if (!auditorias.length) {
      throw new Error('A planilha de auditorias não possui linhas válidas. Cabeçalhos esperados: Classificador, Data Resultado, Resultado e campos de embarque/auditoria.');
    }

    const batchSize = 500;
    let total = 0;
    for (let i = 0; i < auditorias.length; i += batchSize) {
      const batch = auditorias.slice(i, i + batchSize);
      const { error } = await opts.supabase
        .from('operacional_auditoria_colaborador')
        .upsert(batch, { onConflict: 'import_hash' });
      if (error) throw new Error(error.message || 'Falha ao gravar auditorias no Supabase.');
      total += batch.length;
    }

    const colaboradores = new Set(auditorias.map((a) => a.nome_chave).filter(Boolean)).size;
    const descontos = auditorias.filter((a) => normalizeHeader(a.resultado || '').includes('desconto') || Number(a.desconto_kg || 0) > 0).length;
    const padrao = auditorias.filter((a) => normalizeHeader(a.resultado || '').includes('padrao')).length;
    return { total_linhas: auditorias.length, importados: total, colaboradores, descontos, produto_padrao: padrao };
  }

  async function readClinicasSstFromFile(file) {
    const XLSX = await loadXlsx();
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array', cellDates: false });
    const sheetName = workbook.SheetNames.find((n) => normalizeHeader(n).includes('clinica')) || workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const raw = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false });
    if (!raw?.length) throw new Error('A planilha de clínicas está vazia.');

    const headerRow = findHeaderRow(raw, ['NOME', 'ESTADO', 'CIDADE']);
    const header = (raw[headerRow] || []).map((h) => normalizeHeader(String(h || '')));
    const idx = (aliases) => {
      for (const alias of aliases) {
        const i = header.findIndex((h) => headerMatches(h, alias));
        if (i >= 0) return i;
      }
      return -1;
    };

    const iNome   = idx(['NOME', 'nome']);
    const iEstado = idx(['ESTADO', 'estado', 'UF', 'uf']);
    const iCidade = idx(['CIDADE', 'cidade']);
    const iTel    = idx(['TELEFONE', 'telefone']);
    const iCel    = idx(['CELULAR', 'celular']);
    const iEnd    = idx(['Endereço', 'ENDEREÇO', 'ENDERECO', 'endereco']);
    const iCep    = idx(['CEP', 'cep']);
    const iMed    = idx(['DADOS DO MÉDICO', 'dados do medico', 'dados medico', 'medico']);
    const iEmail  = idx(['E-mail', 'E-MAIL', 'email', 'EMAIL']);
    const iObs    = idx(['OBSERVAÇÕES', 'OBSERVACOES', 'observacoes', 'observações']);
    const iPix    = idx(['Chave PIX', 'CHAVE PIX', 'chave pix', 'pix']);
    const iExm    = idx(['EXAMES', 'exames']);

    const get = (row, i) => i >= 0 ? (String(row[i] || '').trim() || null) : null;
    const ts  = new Date().toISOString();

    const rows = raw.slice(headerRow + 1)
      .map((row) => {
        const nome = get(row, iNome);
        if (!nome) return null;
        return {
          nome,
          estado:      get(row, iEstado),
          cidade:      get(row, iCidade),
          telefone:    get(row, iTel),
          celular:     get(row, iCel),
          endereco:    get(row, iEnd),
          cep:         get(row, iCep),
          dados_medico: get(row, iMed),
          email:       get(row, iEmail),
          observacoes: get(row, iObs),
          chave_pix:   get(row, iPix),
          exames:      get(row, iExm),
          ativo:       true,
          updated_at:  ts,
        };
      })
      .filter(Boolean);

    return { rows, sheetName };
  }

  async function importarClinicasSstDaPlanilha(file, opts) {
    const { rows } = await readClinicasSstFromFile(file);
    if (!rows.length) {
      throw new Error('A planilha de clínicas não possui linhas válidas. Cabeçalhos esperados: ESTADO, CIDADE, NOME, TELEFONE, CELULAR, Endereço, DADOS DO MÉDICO, E-mail, OBSERVAÇÕES, Chave PIX, EXAMES.');
    }
    // Deduplica por (nome, cidade, estado) — planilha pode ter entradas repetidas
    const seen = new Map();
    rows.forEach((r) => {
      const key = `${r.nome || ''}|${r.cidade || ''}|${r.estado || ''}`;
      if (!seen.has(key)) seen.set(key, r);
    });
    const deduped = Array.from(seen.values());
    let total = 0;
    for (let i = 0; i < deduped.length; i += 300) {
      const batch = deduped.slice(i, i + 300);
      const { error } = await opts.supabase
        .from('rh_clinicas_sst')
        .upsert(batch, { onConflict: 'nome,cidade,estado' });
      if (error) throw new Error(error.message || 'Falha ao gravar clínicas SST no Supabase.');
      total += batch.length;
    }
    const estados = new Set(deduped.map((r) => r.estado).filter(Boolean)).size;
    const cidades = new Set(deduped.map((r) => `${r.cidade || ''}/${r.estado || ''}`).filter((v) => v !== '/')).size;
    return { total_linhas: rows.length, importados: total, estados, cidades };
  }

  function objectFromHeaderRow(headers, row, sheetName) {
    const obj = { __aba: sheetName };
    (headers || []).forEach((header, index) => {
      const key = String(header || `COLUNA_${index + 1}`).trim() || `COLUNA_${index + 1}`;
      obj[key] = row?.[index] ?? '';
    });
    return obj;
  }

  function findOperacionalOsHeaderRow(raw) {
    for (let i = 0; i < Math.min(raw.length, 40); i += 1) {
      const rowNorm = (raw[i] || []).map((c) => normalizeHeader(c));
      const joined = rowNorm.join(' ');
      const hasOs = rowNorm.some((h) => ['o s', 'os', 'o.s.', 'o.s', 'ordem de servico', 'ordem servico', 'numero os', 'n os'].includes(h)) || joined.includes('ordem de servico');
      const hasCliente = rowNorm.some((h) => h === 'cliente' || h.includes('cliente'));
      const hasRem = rowNorm.some((h) => h.includes('remanescente'));
      if (hasOs && (hasCliente || hasRem)) return i;
    }
    return 0;
  }

  async function readOperacionalOsRowsFromFile(file) {
    const XLSX = await loadXlsx();
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
    const preferred = workbook.SheetNames.find((name) => {
      const key = normalizeHeader(name);
      return key.includes('os') || key.includes('lista');
    }) || workbook.SheetNames[0];
    const sheet = workbook.Sheets[preferred];
    const raw = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: true });
    const headerRow = findOperacionalOsHeaderRow(raw);
    const headers = (raw[headerRow] || []).map((h, index) => String(h || `COLUNA_${index + 1}`).trim());
    const rows = raw.slice(headerRow + 1).map((row) => objectFromHeaderRow(headers, row, preferred));
    const mapped = [];
    const datas = [];

    rows.forEach((row) => {
      const numero = String(pickValue(row, [
        'O.S.', 'O.S', 'OS', 'O S', 'Nº OS', 'N OS', 'Número OS', 'Numero OS', 'Ordem de Serviço', 'Ordem de Servico'
      ]) || '').trim();
      if (!numero || ['OS', 'O.S.', 'O.S', 'O S'].includes(normalizeHeader(numero).toUpperCase())) return;

      const embarque = String(pickValue(row, ['Embarque', 'Ponto 1', 'Ponto1', 'Local Embarque', 'Local de Embarque']) || '').trim();
      const dataOs = toIsoDate(pickValue(row, ['Data', 'Data OS', 'Data O.S.', 'Data O.S'])) || null;
      if (dataOs) datas.push(dataOs);

      const contrato = normalizeText(pickValue(row, [
        'Contrato', 'Nº Contrato', 'N° Contrato', 'N Contrato', 'Número Contrato', 'Numero Contrato',
        'Contrato Cliente', 'Contrato BTG', 'Contrato Original', 'Contrato Origem', 'Nº Contrato Cliente'
      ]));

      mapped.push({
        numero_os: numero,
        situacao: normalizeText(pickValue(row, ['Situação', 'Situacao'])),
        financeiro: normalizeText(pickValue(row, ['Financeiro'])),
        data_os: dataOs,
        servico: normalizeText(pickValue(row, ['Serviço', 'Servico'])),
        cliente: normalizeText(pickValue(row, ['Cliente', 'Cliente Nacional', 'Cliente Regional', 'Cliente Final'])),
        embarque: embarque || null,
        destino: normalizeText(pickValue(row, ['Destino', 'Local Destino', 'Local de Destino'])),
        supervisao: normalizeText(pickValue(row, ['Supervisão', 'Supervisao', 'Regional'])),
        contrato,
        produto: normalizeText(pickValue(row, ['Produto', 'Commodity'])),
        lote: normalizeNumberBr(pickValue(row, ['Lote', 'Qtde Contrato', 'Qtde. Contrato', 'Quantidade', 'Volume'])) || 0,
        embarcado: normalizeNumberBr(pickValue(row, ['Embarcado'])) || 0,
        remanescente: normalizeNumberBr(pickValue(row, ['Remanescente', 'Prod. Remanescente', 'Produto Remanescente'])) || 0,
        raw: row,
        updated_at: new Date().toISOString(),
      });
    });

    const uniqueDates = [...new Set(datas)].sort();
    return {
      rows: mapped,
      period: uniqueDates.length ? { inicio: uniqueDates[0], fim: uniqueDates[uniqueDates.length - 1], totalDatas: uniqueDates.length } : null,
    };
  }

  async function importarOperacionalOsDaPlanilha(file, opts) {
    const result = await readOperacionalOsRowsFromFile(file);
    const rows = result.rows || [];
    if (!rows.length) {
      throw new Error('A planilha de O.S. não possui linhas válidas. Cabeçalhos esperados: O.S., Data, Serviço, Cliente, Embarque, Destino, Supervisão, Contrato, Produto, Lote, Embarcado e Remanescente.');
    }

    const { error: errColab } = await opts.supabase
      .from('operacional_os_colaboradores')
      .delete()
      .not('id', 'is', null);
    if (errColab) throw new Error('Falha ao limpar colaboradores das O.S. anteriores: ' + (errColab.message || ''));

    const { error: errOs } = await opts.supabase
      .from('operacional_os')
      .delete()
      .not('id', 'is', null);
    if (errOs) throw new Error('Falha ao limpar O.S. anteriores: ' + (errOs.message || ''));

    const batchSize = 500;
    let total = 0;
    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize);
      const { error } = await opts.supabase
        .from('operacional_os')
        .insert(batch);
      if (error) throw new Error(error.message || 'Falha ao gravar lista de O.S. no Supabase. Confira se rodou o SQL operacional_os.');
      total += batch.length;
    }

    const supervisoes = new Set(rows.map((r) => normalizeHeader(r.supervisao)).filter(Boolean)).size;
    const remanescenteZero = rows.filter((r) => Number(r.remanescente || 0) === 0).length;
    const ate555 = rows.filter((r) => Number(r.remanescente || 0) > 0 && Number(r.remanescente || 0) <= 555000).length;
    const ate300 = rows.filter((r) => Number(r.remanescente || 0) > 0 && Number(r.remanescente || 0) <= 300000).length;
    const semContrato = rows.filter((r) => !String(r.contrato || '').trim()).length;

    opts.cache?.invalidateCacheByPrefix?.('os:');
    opts.cache?.bumpPainelCache?.('importacao_operacional_os');

    return {
      total_linhas: rows.length,
      importados: total,
      supervisoes,
      remanescente_zero: remanescenteZero,
      ate_555: ate555,
      ate_300: ate300,
      sem_contrato: semContrato,
      periodo_inicio: result.period?.inicio || null,
      periodo_fim: result.period?.fim || null,
      total_datas: result.period?.totalDatas || null,
    };
  }

  // ── BTG / Distribuição de O.S. persistidos para conferência da equipe ─────────
  const CONTRATO_BTG_IMPORT_RE = /^P\d{5}\.\d{3}$/i;

  function btgNormImport(value) { return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9 ]+/g, ' ').trim(); }

  function btgCleanImport(value) { return String(value ?? '').trim(); }

  function btgContratoNormImport(value) { return btgCleanImport(value).toUpperCase().replace(/\s+/g, ''); }

  function btgContratoValidoImport(value) { return CONTRATO_BTG_IMPORT_RE.test(btgContratoNormImport(value)); }

  function btgContratoLabelImport(value) { const c = btgContratoNormImport(value); return CONTRATO_BTG_IMPORT_RE.test(c) ? c : ''; }

  function btgFindHeaderRowImport(raw, checks, maxRows = 25) {
    for (let i = 0; i < Math.min(maxRows, raw.length); i += 1) {
      const text = btgNormImport((raw[i] || []).map((c) => String(c ?? '')).join(' '));
      if (checks.every((check) => text.includes(check))) return i;
    }
    return 0;
  }

  function btgColIndexImport(header, matchers) {
    const normalized = (header || []).map((cell) => btgNormImport(cell));
    for (const matcher of matchers) { const idx = normalized.findIndex(matcher); if (idx >= 0) return idx; }
    return -1;
  }

  async function readBtgLogisticaRowsFromFile(file) {
    const XLSX = await loadXlsx();
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
    const rows = [];
    for (const sheetName of workbook.SheetNames || []) {
      const raw = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: '', raw: true });
      if (!raw.length) continue;
      const headerIndex = btgFindHeaderRowImport(raw, ['CONTRATO']);
      const header = raw[headerIndex] || [];
      const ci = {
        contrato: btgColIndexImport(header, [c => c === 'CONTRATO' || c.includes('CONTRATO')]),
        portal: btgColIndexImport(header, [
          c => c === 'ORDEM DE SERVICO' || c === 'ORDEM SERVICO',
          c => c.includes('ORDEM') && c.includes('SERVI'),
        ]),
        ordemFrete: btgColIndexImport(header, [c => c === 'ORDEM DE FRETE' || (c.includes('ORDEM') && c.includes('FRETE'))]),
        tipo: btgColIndexImport(header, [c => c.includes('TIPO'), c => c.includes('SOLICITACAO'), c => c.includes('OPERACAO'), c => c.includes('MOVIMENTO')]),
        cliente: btgColIndexImport(header, [c => c.includes('CLIENTE'), c => c.includes('COMPRADOR'), c => c.includes('TOMADOR')]),
        commodity: btgColIndexImport(header, [c => c.includes('COMMODITY'), c => c.includes('PRODUTO')]),
        quantidade: btgColIndexImport(header, [c => c.includes('QTDE'), c => c.includes('QUANTIDADE'), c => c.includes('VOLUME'), c => c.includes('TON')]),
        cidade: btgColIndexImport(header, [c => c.includes('CIDADE'), c => c.includes('ORIGEM'), c => c.includes('DESTINO')]),
      };
      if (ci.contrato < 0) continue;
      raw.slice(headerIndex + 1).forEach((line, idx) => {
        if (!line?.some?.(Boolean)) return;
        const contratoOriginal = btgContratoNormImport(line[ci.contrato]);
        if (!contratoOriginal) return;
        const tipoSolicitacao = btgCleanImport(line[ci.tipo]) || btgCleanImport(line[ci.commodity]) || btgCleanImport(line[ci.cidade]) || 'Relatório BTG';
        rows.push({
          contrato_original: contratoOriginal,
          contrato_status: btgContratoLabelImport(contratoOriginal) || 'CORRIGIR CONTRATO',
          numero_os_relatorio: btgCleanImport(line[ci.portal]) || null,
          tipo_solicitacao: tipoSolicitacao,
          cliente: btgCleanImport(line[ci.cliente]) || null,
          commodity: btgCleanImport(line[ci.commodity]) || null,
          quantidade: normalizeNumberBr(line[ci.quantidade]) || 0,
          aba: sheetName,
          linha: headerIndex + idx + 2,
          raw: { headers: header, values: line, ordem_frete: ci.ordemFrete >= 0 ? btgCleanImport(line[ci.ordemFrete]) : null },
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
      });
    }
    return { rows, period: null };
  }

  async function importarBtgLogisticaDaPlanilha(file, opts) {
    const result = await readBtgLogisticaRowsFromFile(file);
    const rows = result.rows || [];
    if (!rows.length) throw new Error('O relatório BTG não possui solicitações válidas para gravar. Confira se há linhas abaixo dos cabeçalhos Ordem de Serviço e Contrato.');
    const { error: clearError } = await opts.supabase.from('logistica_btg_solicitacoes').delete().not('id', 'is', null);
    if (clearError) throw new Error('Falha ao limpar solicitações BTG anteriores: ' + (clearError.message || ''));
    let total = 0;
    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await opts.supabase.from('logistica_btg_solicitacoes').insert(rows.slice(i, i + 500));
      if (error) throw new Error(error.message || 'Falha ao salvar solicitações BTG no Supabase. Rode o SQL logistica_btg_conferencia.sql.');
      total += rows.slice(i, i + 500).length;
    }
    opts.cache?.bumpPainelCache?.('importacao_btg_logistica');
    return { total_linhas: rows.length, importados: total, ignorados_contrato_invalido: 0 };
  }

  async function readDistribuicaoOsRowsFromFile(file) {
    const XLSX = await loadXlsx();
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
    const rows = [];
    for (const sheetName of workbook.SheetNames || []) {
      const raw = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: '', raw: true });
      if (!raw.length) continue;
      const headerIndex = btgFindHeaderRowImport(raw, ['FUNCION', 'REMANESCENTE']);
      const header = raw[headerIndex] || [];
      const ci = {
        os: btgColIndexImport(header, [c => c === 'O S' || c === 'OS' || c === 'O S ' || c.includes('ORDEM')]),
        colaborador: btgColIndexImport(header, [c => c.includes('FUNCION'), c => c.includes('COLABORADOR')]),
        supervisao: btgColIndexImport(header, [c => c.includes('SUPERVIS'), c => c.includes('COORDENA'), c => c.includes('REGIONAL')]),
        cliente: btgColIndexImport(header, [c => c.includes('CLIENTE')]),
        lote: btgColIndexImport(header, [c => c === 'LOTE']),
        remanescente: btgColIndexImport(header, [c => c.includes('REMANESCENTE')]),
      };
      if (ci.os < 0 || ci.colaborador < 0) continue;
      raw.slice(headerIndex + 1).forEach((line) => {
        if (!line?.some?.(Boolean)) return;
        const numeroOs = btgCleanImport(line[ci.os]);
        const colaborador = btgCleanImport(line[ci.colaborador]);
        if (!numeroOs || !colaborador || normalizeHeader(numeroOs) === 'o s' || normalizeHeader(colaborador) === 'funcionario') return;
        rows.push({
          numero_os: numeroOs,
          colaborador_nome: colaborador,
          supervisao: btgCleanImport(line[ci.supervisao]) || null,
          cliente: btgCleanImport(line[ci.cliente]) || null,
          lote: normalizeNumberBr(line[ci.lote]) || 0,
          remanescente: normalizeNumberBr(line[ci.remanescente]) || 0
        });
      });
    }
    return { rows, period: null };
  }

  async function importarDistribuicaoOsDaPlanilha(file, opts) {
    const result = await readDistribuicaoOsRowsFromFile(file);
    const rows = result.rows || [];
    if (!rows.length) throw new Error('A Distribuição de O.S. não possui vínculos válidos de O.S. x colaborador.');

    const distPayload = rows.map((row) => ({
      numero_os: row.numero_os,
      colaborador: row.colaborador_nome,
      supervisao: row.supervisao,
      lote: row.lote,
      remanescente: row.remanescente,
      updated_at: new Date().toISOString(),
    }));
    const { error: clearDist } = await opts.supabase.from('logistica_btg_distribuicao').delete().not('id', 'is', null);
    if (clearDist) throw new Error('Falha ao limpar Distribuição BTG anterior: ' + (clearDist.message || ''));
    for (let i = 0; i < distPayload.length; i += 500) {
      const { error } = await opts.supabase.from('logistica_btg_distribuicao').insert(distPayload.slice(i, i + 500));
      if (error) throw new Error(error.message || 'Falha ao salvar Distribuição BTG no Supabase.');
    }

    const numeros = [...new Set(rows.map((r) => String(r.numero_os || '').trim()).filter(Boolean))];
    const osMap = new Map();
    for (let i = 0; i < numeros.length; i += 800) {
      const { data, error } = await opts.supabase.from('operacional_os').select('id, numero_os').in('numero_os', numeros.slice(i, i + 800));
      if (error) throw new Error('Falha ao consultar Lista de O.S. antes de vincular colaboradores: ' + (error.message || ''));
      (data || []).forEach((item) => osMap.set(String(item.numero_os), item.id));
    }
    const payload = [];
    const seen = new Set();
    for (const row of rows) {
      const osId = osMap.get(String(row.numero_os));
      if (!osId) continue;
      const colabKey = btgNormImport(row.colaborador_nome);
      const key = `${osId}|${colabKey}`;
      if (seen.has(key)) continue;
      seen.add(key);
      payload.push({
        os_id: osId,
        colaborador_key: colabKey,
        colaborador_nome: row.colaborador_nome,
        origem_sugestao: 'DISTRIBUICAO_OS',
        observacao: 'Importado pela Distribuição de O.S.',
        updated_at: new Date().toISOString(),
      });
    }

    const osIds = [...new Set(payload.map((r) => r.os_id))];
    for (let i = 0; i < osIds.length; i += 800) {
      const { error } = await opts.supabase
        .from('operacional_os_colaboradores')
        .delete()
        .in('os_id', osIds.slice(i, i + 800))
        .eq('origem_sugestao', 'DISTRIBUICAO_OS');
      if (error) throw new Error('Falha ao substituir vínculos antigos da Distribuição de O.S.: ' + (error.message || ''));
    }

    let total = 0;
    for (let i = 0; i < payload.length; i += 500) {
      const { error } = await opts.supabase
        .from('operacional_os_colaboradores')
        .upsert(payload.slice(i, i + 500), { onConflict: 'os_id,colaborador_key' });
      if (error) throw new Error(error.message || 'Falha ao salvar Distribuição de O.S. no Supabase.');
      total += payload.slice(i, i + 500).length;
    }
    opts.cache?.invalidateCacheByPrefix?.('os:');
    opts.cache?.bumpPainelCache?.('importacao_distribuicao_os');
    return { total_linhas: rows.length, importados: total, ignorados_sem_lista_os: rows.length - total, colaboradores: new Set(payload.map((r) => btgNormImport(r.colaborador_nome))).size };
  }

export { importarPontosEmbarqueDaPlanilha, importarAuditoriasOperacionalDaPlanilha, importarClinicasSstDaPlanilha, readBtgLogisticaRowsFromFile, importarBtgLogisticaDaPlanilha, readDistribuicaoOsRowsFromFile, importarDistribuicaoOsDaPlanilha };
