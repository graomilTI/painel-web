// Relatórios — importação — importação de Funcionários/Colaboradores (RH) e da base de colaboradores.
// Extraído de modules/relatorios.js em 15/10/2026 (era um único bloco autoexecutável de ~3.900 linhas).
// O código das funções e constantes foi movido sem alteração. Para publicar uma mudança em qualquer
// módulo relatorios-*.js, troque o token ?v=20261015-relatorios1 em TODOS os imports internos e no carregador
// (assets/js/relatorio-importador.js): tests/relatorios-modulos-versao.test.mjs garante que fiquem iguais.
import { loadXlsx, normalizeHeader, toIsoDate, headerKey, findHeaderRow, pickValue, normalizeNumberBr, colaboradorNomeChave } from './relatorios-planilha.js?v=20261015-relatorios1';

  const COLAB_RH_ALIASES = {
    cpf: ['CPF', 'Cpf'],
    nome: ['Nome', 'NOME', 'Funcionário', 'Funcionario', 'Colaborador'],
    situacao: ['Situação', 'Situacao', 'STATUS', 'Status'],
    admissao: ['Admissão', 'Admissao', 'Data de Admissão', 'Data de Admissao', 'Dt Admissao'],
    desligamento: ['Desligamento', 'Data de Desligamento', 'Dt Desligamento'],
    salario: ['Salário', 'Salario'],
    conta_bancaria: ['C. Banc. Despesas', 'C Banc. Despesas', 'C Banc Despesas', 'Conta Bancária', 'Conta Bancaria'],
    empresa: ['Empresa'],
    coordenacao: ['Coordenação', 'Coordenacao'],
    supervisao: ['Supervisão', 'Supervisao'],
    tipo: ['Tipo'],
    cep: ['CEP', 'Cep'],
    estado: ['Estado', 'UF'],
    cidade: ['Cidade'],
    bairro: ['Bairro'],
    endereco: ['Endereço', 'Endereco'],
    complemento: ['Complemento'],
    data_nascimento: ['Data de Nascimento', 'Nascimento', 'Dt Nascimento'],
    cargo: ['Cargo', 'Função', 'Funcao'],
    whatsapp: ['Whatsapp', 'WhatsApp', 'Celular', 'Telefone', 'Fone'],
    email_pessoal: ['E-mail Pessoal', 'Email Pessoal'],
    email_empresa: ['E-mail da Empresa', 'Email da Empresa', 'E-mail Empresa', 'Email Empresa']
  };

  function normalizeCpfColabRh(value) {
    if (value === null || value === undefined || value === '') return null;
    const digits = String(value).replace(/\D/g, '');
    if (!digits) return null;
    return digits.length < 11 ? digits.padStart(11, '0') : digits.slice(-11);
  }

  function normalizePhoneColabRh(value) {
    if (value === null || value === undefined || value === '') return null;
    const digits = String(value).replace(/\D/g, '').replace(/^0+/, '');
    return digits || null;
  }

  function normalizeTextColabRh(value) {
    if (value === null || value === undefined) return null;
    const text = String(value).trim();
    return text || null;
  }

  function computeAtivoColabRh(situacao, desligamento) {
    if (desligamento) return false;
    const s = normalizeHeader(situacao || '');
    if (!s) return true;
    return !['nao ativo', 'nao ativa', 'inativo', 'inativa', 'deslig', 'demit'].some((status) => s.includes(status));
  }

  function pickRowValueByIndex(row, headerIndexes, aliases) {
    for (const alias of aliases || []) {
      const idx = headerIndexes.get(headerKey(alias));
      if (idx !== undefined) {
        const value = row?.[idx];
        if (value !== undefined && value !== null && String(value).trim() !== '') return value;
      }
    }
    return null;
  }

  function mapColaboradorRhRow(row, headerIndexes, dataReferencia, importacaoId) {
    const get = (campo) => pickRowValueByIndex(row, headerIndexes, COLAB_RH_ALIASES[campo] || []);
    const situacao = normalizeTextColabRh(get('situacao'));
    const desligamento = toIsoDate(get('desligamento'));
    const admissao = toIsoDate(get('admissao'));

    return {
      importacao_id: importacaoId,
      data_referencia: dataReferencia,
      cpf: normalizeCpfColabRh(get('cpf')),
      nome: normalizeTextColabRh(get('nome')),
      situacao,
      admissao,
      desligamento,
      salario: normalizeNumberBr(get('salario')),
      conta_bancaria: normalizeTextColabRh(get('conta_bancaria')),
      empresa: normalizeTextColabRh(get('empresa')),
      coordenacao: normalizeTextColabRh(get('coordenacao')),
      supervisao: normalizeTextColabRh(get('supervisao')),
      tipo: normalizeTextColabRh(get('tipo')),
      cep: normalizeTextColabRh(get('cep')),
      estado: normalizeTextColabRh(get('estado')),
      cidade: normalizeTextColabRh(get('cidade')),
      bairro: normalizeTextColabRh(get('bairro')),
      endereco: normalizeTextColabRh(get('endereco')),
      complemento: normalizeTextColabRh(get('complemento')),
      data_nascimento: toIsoDate(get('data_nascimento')),
      cargo: normalizeTextColabRh(get('cargo')),
      whatsapp: normalizePhoneColabRh(get('whatsapp')),
      email_pessoal: normalizeTextColabRh(get('email_pessoal')),
      email_empresa: normalizeTextColabRh(get('email_empresa')),
      ativo: computeAtivoColabRh(situacao, desligamento)
    };
  }

  async function readColaboradoresRhFromFile(file) {
    const XLSX = await loadXlsx();
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: true });
    if (!rows?.length) throw new Error('A planilha de funcionários está vazia.');

    const headerRow = findHeaderRow(rows, ['CPF', 'Nome', 'Admissão']);
    const header = rows[headerRow] || [];
    const headerIndexes = new Map();
    header.forEach((h, index) => {
      const key = headerKey(h);
      if (key) headerIndexes.set(key, index);
    });

    const obrigatorios = [
      ['CPF', COLAB_RH_ALIASES.cpf],
      ['Nome', COLAB_RH_ALIASES.nome],
      ['Admissão', COLAB_RH_ALIASES.admissao],
      ['Whatsapp', COLAB_RH_ALIASES.whatsapp]
    ];
    const faltantes = obrigatorios
      .filter(([, aliases]) => !aliases.some((alias) => headerIndexes.has(headerKey(alias))))
      .map(([label]) => label);

    if (faltantes.length) {
      throw new Error(`Cabeçalho(s) obrigatório(s) ausente(s) na planilha de funcionários: ${faltantes.join(', ')}`);
    }

    return rows
      .slice(headerRow + 1)
      .filter((row) => (row || []).some((cell) => cell !== null && cell !== undefined && String(cell).trim() !== ''));
  }

  async function insertBatchesSupabase_(supabase, table, rows, batchSize = 300, queryBuilder = 'insert') {
    for (let i = 0; i < rows.length; i += batchSize) {
      const chunk = rows.slice(i, i + batchSize);
      const query = queryBuilder === 'upsert'
        ? supabase.from(table).upsert(chunk, { onConflict: 'cpf' })
        : supabase.from(table).insert(chunk);
      const { error } = await query;
      if (error) throw new Error(error.message || `Falha ao gravar ${table}.`);
    }
  }

  function mapColaboradorSnapshotToHistorico(row) {
    const { conta_bancaria, ...rest } = row;
    return {
      ...rest,
      conta_bancaria_despesas: conta_bancaria ?? null
    };
  }

  async function limparHistoricoColaboradoresPorDatas(supabase, datas = []) {
    for (const data of datas) {
      if (!data) continue;
      const { error } = await supabase
        .from('historico_colaboradores')
        .delete()
        .eq('data_referencia', data);
      if (error) throw new Error(error.message || 'Falha ao limpar histórico de colaboradores.');
    }
  }

  function mapColaboradorSnapshotToCurrent(row) {
    return {
      cpf: row.cpf,
      nome: row.nome,
      situacao: row.situacao,
      admissao: row.admissao,
      desligamento: row.desligamento,
      salario: row.salario == null ? null : String(row.salario),
      conta_bancaria_despesas: row.conta_bancaria,
      empresa: row.empresa,
      coordenacao: row.coordenacao,
      supervisao: row.supervisao,
      tipo: row.tipo,
      cep: row.cep,
      estado: row.estado,
      cidade: row.cidade,
      bairro: row.bairro,
      endereco: row.endereco,
      complemento: row.complemento,
      data_nascimento: row.data_nascimento,
      cargo: row.cargo,
      whatsapp: row.whatsapp,
      email_pessoal: row.email_pessoal,
      email_empresa: row.email_empresa,
      updated_at: new Date().toISOString()
    };
  }

  async function importarColaboradoresRhDaPlanilha(file, opts) {
    const supabase = opts.supabase;
    const rawRows = await readColaboradoresRhFromFile(file);
    const dataReferencia = new Date().toISOString().slice(0, 10);
    const user = opts.user || opts.auth?.user || null;

    const { data: importacao, error: impError } = await supabase
      .from('colaborador_importacoes')
      .insert({
        data_referencia: dataReferencia,
        arquivo_nome: file.name,
        origem: 'importar_relatorios',
        importado_por: user?.id || null,
        status: 'processando',
        total_linhas: rawRows.length,
        observacoes: 'Importação automática pela Central de Importação'
      })
      .select()
      .single();

    if (impError) throw new Error(impError.message || 'Falha ao criar importação de colaboradores.');

    try {
      const XLSX = await loadXlsx();
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: true });
      const headerRow = findHeaderRow(rows, ['CPF', 'Nome', 'Admissão']);
      const header = rows[headerRow] || [];
      const headerIndexes = new Map();
      header.forEach((h, index) => {
        const key = headerKey(h);
        if (key) headerIndexes.set(key, index);
      });

      const mapped = rows
        .slice(headerRow + 1)
        .map((row) => mapColaboradorRhRow(row, headerIndexes, dataReferencia, importacao.id))
        .filter((row) => row.nome);

      if (!mapped.length) throw new Error('Nenhum funcionário válido encontrado para importar.');

      const datasHistorico = [...new Set(mapped.map((row) => row.data_referencia).filter(Boolean))];
      await limparHistoricoColaboradoresPorDatas(supabase, datasHistorico);
      await insertBatchesSupabase_(supabase, 'historico_colaboradores', mapped.map(mapColaboradorSnapshotToHistorico), 300, 'insert');
      await insertBatchesSupabase_(supabase, 'colaborador_snapshot', mapped, 300, 'insert');

      const currentRows = mapped
        .filter((row) => row.cpf)
        .map(mapColaboradorSnapshotToCurrent);

      if (currentRows.length) {
        await insertBatchesSupabase_(supabase, 'colaboradores', currentRows, 300, 'upsert');
      }

      // nova foto importada: descarta cache de colaboradoresCache.js (key v1)
      try { sessionStorage.removeItem('grm:colaboradores_atuais:v1'); } catch {}

      const ativos = mapped.filter((row) => row.ativo).length;
      const inativos = mapped.length - ativos;
      const coordenacoes = new Set(mapped.map((row) => row.coordenacao).filter(Boolean)).size;

      const { error: updError } = await supabase
        .from('colaborador_importacoes')
        .update({
          status: 'processado',
          total_linhas: mapped.length,
          observacoes: `Importação automática concluída. Ativos: ${ativos}. Inativos: ${inativos}.`
        })
        .eq('id', importacao.id);

      if (updError) throw new Error(updError.message || 'Falha ao finalizar importação de colaboradores.');

      return {
        importacao_id: importacao.id,
        data_referencia: dataReferencia,
        total_linhas: mapped.length,
        importados: mapped.length,
        ativos,
        inativos,
        coordenacoes,
        base_atualizada: currentRows.length
      };
    } catch (err) {
      await supabase
        .from('colaborador_importacoes')
        .update({
          status: 'erro',
          observacoes: `Erro na importação automática: ${err?.message || err}`
        })
        .eq('id', importacao.id);
      throw err;
    }
  }

  async function readColaboradoresBaseFromFile(file) {
    const XLSX = await loadXlsx();
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array', cellDates: false });
    const mapped = [];
    const seen = new Set();

    for (const sheetName of workbook.SheetNames || []) {
      const sheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: true });
      if (!rows?.length) continue;

      rows.forEach((row) => {
        const nome = String(pickValue(row, ['Nome', 'Colaborador', 'Funcionário', 'Funcionario']) || '').trim();
        const nomeChave = colaboradorNomeChave(nome);
        const latitude = normalizeNumberBr(pickValue(row, ['Latitude', 'Lat']));
        const longitude = normalizeNumberBr(pickValue(row, ['Longitude', 'Lng', 'Long']));
        const telefone = String(pickValue(row, ['Telefone', 'Telefono', 'Whatsapp', 'WhatsApp']) || '').trim();
        const email = String(pickValue(row, ['Email', 'E-mail', 'E-mail Pessoal', 'Email Pessoal']) || '').trim();
        const rua = String(pickValue(row, ['Rua', 'Endereço', 'Endereco', 'Logradouro']) || '').trim();
        const bairro = String(pickValue(row, ['Bairro']) || '').trim();
        const cidade = String(pickValue(row, ['Cidade', 'Município', 'Municipio']) || '').trim();
        const uf = String(pickValue(row, ['UF', 'Estado']) || '').trim().toUpperCase().slice(0, 2);
        const pais = String(pickValue(row, ['Pais', 'País']) || 'Brasil').trim() || 'Brasil';
        const tipoRaw = String(pickValue(row, ['Tipo', 'Tipo Mão de Obra', 'Tipo Mao de Obra', 'Mão de Obra', 'Mao de Obra']) || '').trim();
        const tipoNorm = tipoRaw
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .toLowerCase();
        const tipoMaoObra = tipoNorm.includes('diar') ? 'diarista' : 'efetivo';
        const valorDiaria = normalizeNumberBr(pickValue(row, ['Diária', 'Diaria', 'Valor Diária', 'Valor Diaria']));
        const valorAlimentacao = normalizeNumberBr(pickValue(row, ['Alimentação', 'Alimentacao', 'Almoço', 'Almoco']));

        if (!nome || !nomeChave) return;
        if (!Number.isFinite(Number(latitude)) || !Number.isFinite(Number(longitude))) return;
        if (seen.has(nomeChave)) return;
        seen.add(nomeChave);

        mapped.push({
          nome,
          nome_chave: nomeChave,
          latitude,
          longitude,
          telefone: telefone || null,
          email: email || null,
          rua: rua || null,
          bairro: bairro || null,
          cidade_base: cidade || null,
          uf_base: uf || null,
          pais: pais || 'Brasil',
          // A planilha de GPS dos colaboradores não possui coluna de tipo.
          // Para respeitar o CHECK do Supabase, grava sempre em minúsculo: efetivo ou diarista.
          // Depois o tipo real pode ser enriquecido pelo cadastro/base de colaboradores.
          tipo_mao_obra: tipoMaoObra,
          valor_diaria: valorDiaria,
          valor_alimentacao: valorAlimentacao ?? 30,
          origem: 'importar_relatorios_endereco_colaborador',
          ativo: true,
        });
      });
    }

    return mapped;
  }

  async function importarColaboradoresBaseDaPlanilha(file, opts) {
    const colaboradores = await readColaboradoresBaseFromFile(file);
    if (!colaboradores.length) {
      throw new Error('A planilha de endereço dos colaboradores não possui linhas válidas. Cabeçalhos esperados: Nome, Latitude, Longitude, Telefono/Telefone, Email, Rua, Bairro, Cidade, UF e Pais.');
    }

    const batchSize = 500;
    let total = 0;
    for (let i = 0; i < colaboradores.length; i += batchSize) {
      const batch = colaboradores.slice(i, i + batchSize);
      const { error } = await opts.supabase
        .from('operacional_colaborador_base')
        .upsert(batch, { onConflict: 'nome_chave' });
      if (error) throw new Error(error.message || 'Falha ao gravar endereços dos colaboradores no Supabase.');
      total += batch.length;
    }

    const cidades = new Set(colaboradores.map((c) => `${c.cidade_base || ''}/${c.uf_base || ''}`).filter((v) => v !== '/')).size;
    const ufs = new Set(colaboradores.map((c) => c.uf_base).filter(Boolean)).size;
    return { total_linhas: colaboradores.length, importados: total, cidades, ufs };
  }

export { importarColaboradoresRhDaPlanilha, importarColaboradoresBaseDaPlanilha };
