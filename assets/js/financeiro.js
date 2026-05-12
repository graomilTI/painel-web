import { initProtectedPage } from './pageInit.js';
import { supabase } from './supabaseClient.js';
import * as XLSX from 'https://cdn.sheetjs.com/xlsx-0.20.2/package/xlsx.mjs';

const RECEBER_COLUMNS = {
  situacao: ['situação', 'situacao'],
  codigo: ['código', 'codigo'],
  fatura: ['fatura'],
  cliente: ['cliente'],
  conta: ['conta'],
  emissao_nf: ['emissão n.f', 'emissao n.f', 'emissão nf', 'emissao nf'],
  vencimento: ['vencimento'],
  recebimento: ['recebimento'],
  numero_nf: ['n.f.', 'nf', 'n.f'],
  valor: ['valor'],
  desconto: ['desconto'],
  juros: ['juros'],
  valor_pago: ['valor pago']
};

const PAGAR_COLUMNS = {
  empresa: ['empresa'],
  situacao: ['situação', 'situacao'],
  cod_grupo: ['cod/grupo', 'código/grupo', 'codigo/grupo'],
  data_lancamento: ['data'],
  coordenacao: ['coordenação', 'coordenacao'],
  supervisao: ['supervisão', 'supervisao'],
  favorecido: ['favorecido'],
  cnpj_cpf: ['cnpj/cpf'],
  identificacao: ['identificação', 'identificacao'],
  categoria: ['categoria'],
  doc: ['doc'],
  vencimento: ['vencimento'],
  parcela: ['parcela'],
  valor_pago: ['v. pago', 'valor pago'],
  valor: ['valor'],
  usuario: ['usuário', 'usuario'],
  data_cadastro: ['data de cadastro']
};

const state = {
  fluxo: [],
  receber: [],
  pagar: [],
  currentDate: new Date().toISOString().slice(0, 10),
  filters: {
    inicio: new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10),
    fim: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10)
  }
};

function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function normalize(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

function money(value) {
  return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function brDate(value) {
  if (!value) return '-';
  const [y, m, d] = String(value).slice(0, 10).split('-');
  return y && m && d ? `${d}/${m}/${y}` : String(value);
}

function toNumber(value) {
  if (value === null || value === undefined || value === '') return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const text = String(value)
    .replace(/R\$/gi, '')
    .replace(/\s/g, '')
    .replace(/\./g, '')
    .replace(',', '.')
    .replace(/[^0-9.-]/g, '');
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toDateISO(value) {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  if (typeof value === 'number') {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (!parsed || !parsed.y || !parsed.m || !parsed.d) return null;
    if (parsed.y < 2020 || parsed.y > 2100) return null;
    return `${String(parsed.y).padStart(4, '0')}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`;
  }
  const raw = String(value).trim();
  if (!raw) return null;
  const br = raw.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/);
  if (br) {
    let [, d, m, y] = br;
    if (y.length === 2) y = `20${y}`;
    const year = Number(y);
    if (year < 2020 || year > 2100) return null;
    return `${String(year).padStart(4, '0')}-${String(Number(m)).padStart(2, '0')}-${String(Number(d)).padStart(2, '0')}`;
  }
  const dt = new Date(raw);
  if (Number.isNaN(dt.getTime())) return null;
  const year = dt.getFullYear();
  if (year < 2020 || year > 2100) return null;
  return dt.toISOString().slice(0, 10);
}

function hashText(value) {
  let hash = 0;
  const text = normalize(value);
  for (let i = 0; i < text.length; i += 1) {
    hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0;
  }
  return `fin_${Math.abs(hash)}_${text.length}`;
}

function pick(row, map, key) {
  const aliases = map[key] || [key];
  const rowKeys = Object.keys(row || {});
  const found = rowKeys.find((rk) => aliases.some((alias) => normalize(rk) === normalize(alias)));
  return found ? row[found] : null;
}

async function upsertChunk(table, rows, onConflict = 'unique_hash') {
  const chunkSize = 450;
  let saved = 0;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const { error } = await supabase.from(table).upsert(chunk, { onConflict });
    if (error) throw error;
    saved += chunk.length;
  }
  return saved;
}

function readWorkbookRows(file) {
  return file.arrayBuffer().then((buffer) => {
    const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
    const firstSheet = workbook.SheetNames[0];
    const sheet = workbook.Sheets[firstSheet];
    return XLSX.utils.sheet_to_json(sheet, { defval: '', raw: true });
  });
}


const PAGAMENTO_VALOR_ALMOCO = 30;
const PAGAMENTO_IFOOD_CNPJ = '29.666.679/0001-34';
const ALELO_SERIE_DIGITOS = 15;

function onlyDigits(value) {
  return String(value ?? '').replace(/\D/g, '');
}

function normalizeName(value) {
  return normalize(value).replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
}

function normConta(value) {
  return normalize(value).toUpperCase().replace(/[^A-Z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function dateRangeLabel(inicio, fim) {
  if (!inicio && !fim) return 'período não informado';
  if (inicio === fim) return brDate(inicio);
  return `${brDate(inicio)} a ${brDate(fim)}`;
}

function compactDate(value) {
  return String(value || '').replace(/\D/g, '');
}

function parseDateLoose(value) {
  return toDateISO(value);
}

function formatDateForXlsx(value) {
  return value ? brDate(value) : '';
}

function buildCpfToSerieMap(rows) {
  const map = new Map();
  rows.forEach((row) => {
    const cpf = onlyDigits(row.CPF ?? row.Cpf ?? row.cpf);
    const serie = row['N de Série'] ?? row['N de Serie'] ?? row['Nº de Série'] ?? row['Nº de Serie'] ?? row['Numero de Serie'] ?? row['Número de Série'] ?? '';
    if (cpf) map.set(cpf, String(serie || '').trim());
  });
  return map;
}

function getAny(row, names = []) {
  const keys = Object.keys(row || {});
  for (const name of names) {
    const found = keys.find((key) => normalize(key) === normalize(name));
    if (found) return row[found];
  }
  return null;
}

function makeAleloRows(extratoRows, fonteRows) {
  const mapCpfToSerie = buildCpfToSerieMap(fonteRows || []);
  const alelo = [];
  const ifood = [];
  const flash = [];
  const logs = [];

  (extratoRows || []).forEach((row, index) => {
    const conta = normConta(getAny(row, ['Conta']));
    const cpf = onlyDigits(getAny(row, ['CPF']));
    const valor = toNumber(getAny(row, ['Valor']));
    const obs = String(getAny(row, ['Descrição', 'Descricao', 'Observacao', 'Observação']) || '').slice(0, 30);
    const nome = String(getAny(row, ['Funcionário', 'Funcionario', 'Nome']) || '').trim();
    const nasc = getAny(row, ['Data de Nascimento', 'Nascimento']);

    if (!conta) return;
    if (!cpf || cpf.length > 11) logs.push({ linha: index + 2, tipo: 'Atenção', mensagem: `CPF inválido ou ausente para ${nome || 'linha sem nome'}.` });

    if (conta.includes('ALELO') && (conta.includes('BVGRAIN') || conta.includes('EXCELENCIA') || conta.includes('GRAOMIL'))) {
      let serie = onlyDigits(mapCpfToSerie.get(cpf) || '');
      if (serie.length < ALELO_SERIE_DIGITOS) serie = serie.padStart(ALELO_SERIE_DIGITOS, '0');
      if (serie.length > ALELO_SERIE_DIGITOS) serie = serie.slice(0, ALELO_SERIE_DIGITOS);
      if (!serie || /^0+$/.test(serie)) logs.push({ linha: index + 2, tipo: 'Alelo', mensagem: `Número de série não localizado para ${nome || cpf}.` });
      alelo.push({ serie: `'${serie}`, cpf: `'${cpf.padStart(11, '0').slice(0, 11)}`, valor, observacao: obs, nome });
      return;
    }

    if (conta.includes('IFOOD') && conta.includes('GRAOMIL')) {
      ifood.push({ cnpj: PAGAMENTO_IFOOD_CNPJ, nome, cpf, nascimento: nasc, email: '', celular: '', centro_custo: '', livre: valor });
      return;
    }

    if (conta.includes('FLASH') && conta.includes('GRAOMIL')) {
      flash.push({ cpf, valor, nome });
    }
  });

  return { alelo, ifood, flash, logs };
}

function buildLatestColaboradorMap(rows) {
  const map = new Map();
  (rows || []).forEach((row) => {
    const key = normalizeName(row.nome);
    if (!key || map.has(key)) return;
    map.set(key, {
      nome: row.nome,
      cpf: onlyDigits(row.cpf).padStart(11, '0').slice(0, 11),
      salario: toNumber(row.salario),
      banco: row.conta_bancaria || row['C. Banc. Despesas'] || '',
      empresa: row.empresa || '',
      coordenacao: row.coordenacao || '',
      supervisao: row.supervisao || '',
      tipoRh: row.tipo || '',
      nascimento: row.data_nascimento || row.nascimento || '',
      whatsapp: row.whatsapp || '',
      emailPessoal: row.email_pessoal || '',
      emailEmpresa: row.email_empresa || ''
    });
  });
  return map;
}

async function loadColaboradoresPagamento() {
  const { data, error } = await supabase
    .from('colaborador_snapshot')
    .select('nome,cpf,salario,conta_bancaria,empresa,coordenacao,supervisao,tipo,data_nascimento,whatsapp,email_pessoal,email_empresa,data_referencia,ativo')
    .order('data_referencia', { ascending: false, nullsFirst: false })
    .limit(10000);
  if (error) throw error;
  return buildLatestColaboradorMap(data || []);
}

function pickFirst(row, keys) {
  for (const key of keys) {
    if (row && row[key] !== undefined && row[key] !== null && row[key] !== '') return row[key];
  }
  return '';
}

function mapProducaoSnapshotRows(rows, origem) {
  return (rows || []).map((row) => {
    const data = pickFirst(row, ['data', 'data_referencia', 'data_producao', 'dt_data', 'periodo', 'dia']);
    const funcionario = pickFirst(row, ['funcionario', 'Funcionário', 'Funcionario', 'colaborador', 'nome_colaborador', 'classificador', 'nome']);
    return {
      data,
      data_referencia: pickFirst(row, ['data_referencia', 'data', 'data_producao', 'dt_data', 'periodo', 'dia']),
      funcionario,
      tipo: pickFirst(row, ['tipo', 'tipo_funcionario', 'tipoRh', 'tipo_rh']),
      coordenacao: pickFirst(row, ['coordenacao', 'coordenação', 'regional']),
      supervisao: pickFirst(row, ['supervisao', 'supervisão']),
      cliente: pickFirst(row, ['cliente', 'cliente_final', 'cliente_regional', 'cliente_nacional']),
      os: pickFirst(row, ['os', 'o_s', 'ordem_servico', 'O.S.']),
      toneladas: pickFirst(row, ['toneladas', 'tons', 'volume_classificado']) || 0,
      cargas: pickFirst(row, ['cargas', 'carga']) || 0,
      origem
    };
  }).filter((row) => row.funcionario && row.data);
}

function addDaysIso(dateIso, days) {
  const d = new Date(`${dateIso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return dateIso;
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

async function fetchRowsPaged(table, select, dateColumn, inicio, fim, origem) {
  const out = [];
  const pageSize = 1000;
  let from = 0;
  const fimExclusivo = addDaysIso(fim, 1);
  while (true) {
    // Usa limite final exclusivo para funcionar tanto com colunas DATE quanto TIMESTAMP/TIMESTAMPTZ.
    // Com .lte(fim) em TIMESTAMP, registros do próprio dia após 00:00 ficavam fora da busca.
    let q = supabase
      .from(table)
      .select(select)
      .gte(dateColumn, inicio)
      .lt(dateColumn, fimExclusivo)
      .range(from, from + pageSize - 1);

    const { data, error } = await q;
    if (error) {
      return { rows: [], raw: 0, error, origem };
    }
    const batch = data || [];
    out.push(...batch);
    if (batch.length < pageSize) break;
    from += pageSize;
  }
  return { rows: out, raw: out.length, error: null, origem };
}

async function fetchUltimasDatasProducaoPagamento() {
  const fontes = [
    ['producao_snapshot', 'data', 'producao_snapshot.data'],
    ['producao_snapshot', 'data_referencia', 'producao_snapshot.data_referencia'],
    ['relatorio_resultado_diario', 'data', 'relatorio_resultado_diario']
  ];
  const out = [];
  for (const [table, dateColumn, origem] of fontes) {
    const { data, error } = await supabase
      .from(table)
      .select(dateColumn)
      .not(dateColumn, 'is', null)
      .order(dateColumn, { ascending: false })
      .limit(30);
    if (error) {
      out.push({ origem, erro: error.message || String(error), datas: [] });
      continue;
    }
    const datas = [...new Set((data || []).map((row) => parseDateLoose(row?.[dateColumn])).filter(Boolean))].slice(0, 8);
    out.push({ origem, datas });
  }
  return out;
}

function dedupeProducaoPagamento(rows) {
  const seen = new Set();
  const out = [];
  (rows || []).forEach((row) => {
    const key = [parseDateLoose(row.data), normalizeName(row.funcionario), row.os || '', row.toneladas || '', row.cargas || ''].join('|');
    if (seen.has(key)) return;
    seen.add(key);
    out.push(row);
  });
  return out;
}

async function loadProducaoPagamento(inicio, fim) {
  const attempts = [];
  const mapped = [];

  // Base oficial da Produção Diária importada pelo painel.
  for (const [table, dateColumn, origem] of [
    ['producao_snapshot', 'data', 'producao_snapshot.data'],
    ['producao_snapshot', 'data_referencia', 'producao_snapshot.data_referencia'],
    ['relatorio_resultado_diario', 'data', 'relatorio_resultado_diario']
  ]) {
    const res = await fetchRowsPaged(table, '*', dateColumn, inicio, fim, origem);
    attempts.push({ origem, raw: res.raw, erro: res.error?.message || '' });
    if (!res.error && res.rows.length) mapped.push(...mapProducaoSnapshotRows(res.rows, origem));
  }

  const finalRows = dedupeProducaoPagamento(mapped);
  finalRows._diagnostics = attempts;
  return finalRows;
}

function apurarAlimentacaoRows(producaoRows, rhMap) {
  const flashMap = new Map();
  const ifoodMap = new Map();
  const conferencia = [];
  const logs = [];
  const vistosDia = new Set();

  (producaoRows || []).forEach((row) => {
    const funcionario = String(row.funcionario || '').trim();
    const dataRef = parseDateLoose(row.data);
    if (!funcionario || !dataRef) return;

    const chaveDia = `${dataRef}|${normalizeName(funcionario)}`;
    if (vistosDia.has(chaveDia)) return;
    vistosDia.add(chaveDia);

    const rh = rhMap.get(normalizeName(funcionario));
    if (!rh) {
      logs.push({ data: dataRef, funcionario, status: 'ERRO', mensagem: 'Colaborador não localizado na base RH.' });
      conferencia.push({ data: dataRef, funcionario, cpf: '', destino: 'Pendente', tipo: row.tipo || '', valor: 0, observacao: 'Colaborador não localizado na base RH.' });
      return;
    }
    if (!rh.cpf || rh.cpf.length !== 11) {
      logs.push({ data: dataRef, funcionario, status: 'ERRO', mensagem: 'CPF ausente ou inválido na base RH.' });
      conferencia.push({ data: dataRef, funcionario: rh.nome || funcionario, cpf: rh.cpf || '', destino: 'Pendente', tipo: row.tipo || rh.tipoRh || '', valor: 0, observacao: 'CPF ausente ou inválido.' });
      return;
    }

    const tipoProd = String(row.tipo || rh.tipoRh || '').trim();
    const isDiarista = normalize(tipoProd).includes('diarista');
    let valor = PAGAMENTO_VALOR_ALMOCO;
    let composicao = `Almoço ${money(PAGAMENTO_VALOR_ALMOCO)}`;
    if (isDiarista) {
      if (!rh.salario || rh.salario <= 0) {
        logs.push({ data: dataRef, funcionario: rh.nome || funcionario, status: 'ERRO', mensagem: 'Tipo Diarista, mas salário/diária não encontrado no RH.' });
        conferencia.push({ data: dataRef, funcionario: rh.nome || funcionario, cpf: rh.cpf, destino: 'Pendente', tipo: tipoProd, valor: 0, observacao: 'Diarista sem valor de diária no RH.' });
        return;
      }
      valor += rh.salario;
      composicao += ` + diária ${money(rh.salario)}`;
    }

    const bancoNorm = normalize(rh.banco).replace(/\s+/g, '');
    let destino = 'Pendente';
    if (bancoNorm.includes('graomilflash') || bancoNorm.includes('flash')) destino = 'Flash';
    if (bancoNorm.includes('graomilifood') || bancoNorm.includes('ifood')) destino = 'iFood';

    const confRow = {
      data: dataRef,
      funcionario: rh.nome || funcionario,
      cpf: rh.cpf,
      destino,
      tipo: tipoProd,
      valor: roundNumber(valor),
      composicao,
      coordenacao: rh.coordenacao || row.coordenacao || '',
      supervisao: rh.supervisao || row.supervisao || '',
      banco: rh.banco || '',
      observacao: destino === 'Pendente' ? `C. Banc. Despesas sem destino reconhecido: ${rh.banco || '(vazio)'}` : 'OK'
    };
    conferencia.push(confRow);

    if (destino === 'Flash') {
      const key = rh.cpf;
      if (!flashMap.has(key)) flashMap.set(key, { cpf: rh.cpf, nome: rh.nome, valor: 0 });
      flashMap.get(key).valor = roundNumber(flashMap.get(key).valor + valor);
    } else if (destino === 'iFood') {
      const key = rh.cpf;
      if (!ifoodMap.has(key)) {
        ifoodMap.set(key, {
          cnpj: PAGAMENTO_IFOOD_CNPJ,
          nome: rh.nome,
          cpf: rh.cpf,
          nascimento: rh.nascimento || '',
          email: rh.emailEmpresa || rh.emailPessoal || '',
          celular: onlyDigits(rh.whatsapp),
          centro_custo: rh.coordenacao || '',
          livre: 0
        });
      }
      ifoodMap.get(key).livre = roundNumber(ifoodMap.get(key).livre + valor);
    } else {
      logs.push({ data: dataRef, funcionario: rh.nome || funcionario, status: 'ERRO', mensagem: confRow.observacao });
    }
  });

  return {
    conferencia: conferencia.sort((a, b) => `${a.data}|${a.funcionario}`.localeCompare(`${b.data}|${b.funcionario}`, 'pt-BR')),
    flash: Array.from(flashMap.values()).sort((a, b) => String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR')),
    ifood: Array.from(ifoodMap.values()).sort((a, b) => String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR')),
    logs
  };
}

function roundNumber(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function worksheetFromObjects(rows, columns) {
  const data = [columns.map((c) => c.label)];
  rows.forEach((row) => data.push(columns.map((c) => c.format ? c.format(row[c.key], row) : row[c.key])));
  return XLSX.utils.aoa_to_sheet(data);
}

function downloadWorkbook(filename, sheets) {
  const wb = XLSX.utils.book_new();
  sheets.forEach((sheet) => {
    XLSX.utils.book_append_sheet(wb, sheet.ws, sheet.name.slice(0, 31));
  });
  XLSX.writeFile(wb, filename);
}

function downloadCsv(filename, rows, columns) {
  const sep = ';';
  const escCsv = (value) => {
    const text = String(value ?? '');
    return /[;"\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const lines = [columns.map((c) => escCsv(c.label)).join(sep)];
  rows.forEach((row) => lines.push(columns.map((c) => escCsv(c.format ? c.format(row[c.key], row) : row[c.key])).join(sep)));
  const blob = new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function mapReceber(rows, fileName) {
  return rows.map((row) => {
    const payload = {
      situacao: pick(row, RECEBER_COLUMNS, 'situacao') || null,
      codigo: String(pick(row, RECEBER_COLUMNS, 'codigo') || '').trim() || null,
      fatura: String(pick(row, RECEBER_COLUMNS, 'fatura') || '').trim() || null,
      cliente: String(pick(row, RECEBER_COLUMNS, 'cliente') || '').trim() || null,
      conta: String(pick(row, RECEBER_COLUMNS, 'conta') || '').trim() || null,
      emissao_nf: toDateISO(pick(row, RECEBER_COLUMNS, 'emissao_nf')),
      vencimento: toDateISO(pick(row, RECEBER_COLUMNS, 'vencimento')),
      recebimento: toDateISO(pick(row, RECEBER_COLUMNS, 'recebimento')),
      numero_nf: String(pick(row, RECEBER_COLUMNS, 'numero_nf') || '').trim() || null,
      valor: toNumber(pick(row, RECEBER_COLUMNS, 'valor')),
      desconto: toNumber(pick(row, RECEBER_COLUMNS, 'desconto')),
      juros: toNumber(pick(row, RECEBER_COLUMNS, 'juros')),
      valor_pago: toNumber(pick(row, RECEBER_COLUMNS, 'valor_pago')),
      arquivo_origem: fileName,
      raw: row
    };
    payload.unique_hash = hashText([payload.codigo, payload.fatura, payload.cliente, payload.vencimento, payload.valor].join('|'));
    return payload;
  }).filter((row) => row.vencimento && (row.codigo || row.fatura || row.cliente) && row.valor !== 0);
}

function mapPagar(rows, fileName) {
  return rows.map((row) => {
    const payload = {
      empresa: String(pick(row, PAGAR_COLUMNS, 'empresa') || '').trim() || null,
      situacao: pick(row, PAGAR_COLUMNS, 'situacao') || null,
      cod_grupo: String(pick(row, PAGAR_COLUMNS, 'cod_grupo') || '').trim() || null,
      data_lancamento: toDateISO(pick(row, PAGAR_COLUMNS, 'data_lancamento')),
      coordenacao: String(pick(row, PAGAR_COLUMNS, 'coordenacao') || '').trim() || null,
      supervisao: String(pick(row, PAGAR_COLUMNS, 'supervisao') || '').trim() || null,
      favorecido: String(pick(row, PAGAR_COLUMNS, 'favorecido') || '').trim() || null,
      cnpj_cpf: String(pick(row, PAGAR_COLUMNS, 'cnpj_cpf') || '').trim() || null,
      identificacao: String(pick(row, PAGAR_COLUMNS, 'identificacao') || '').trim() || null,
      categoria: String(pick(row, PAGAR_COLUMNS, 'categoria') || '').trim() || null,
      doc: String(pick(row, PAGAR_COLUMNS, 'doc') || '').trim() || null,
      vencimento: toDateISO(pick(row, PAGAR_COLUMNS, 'vencimento')),
      parcela: String(pick(row, PAGAR_COLUMNS, 'parcela') || '').trim() || null,
      valor_pago: toNumber(pick(row, PAGAR_COLUMNS, 'valor_pago')),
      valor: toNumber(pick(row, PAGAR_COLUMNS, 'valor')),
      usuario: String(pick(row, PAGAR_COLUMNS, 'usuario') || '').trim() || null,
      data_cadastro: toDateISO(pick(row, PAGAR_COLUMNS, 'data_cadastro')),
      arquivo_origem: fileName,
      raw: row
    };
    payload.unique_hash = hashText([payload.empresa, payload.cod_grupo, payload.favorecido, payload.doc, payload.vencimento, payload.parcela, payload.valor].join('|'));
    return payload;
  }).filter((row) => row.vencimento && (row.favorecido || row.doc || row.cod_grupo) && row.valor !== 0);
}

function statusClass(value) {
  return normalize(value).includes('atencao') || normalize(value).includes('atenção') ? 'danger' : 'ok';
}

initProtectedPage('Financeiro', (content, userContext) => {
  content.innerHTML = `
    <style>
      .fin-wrap{display:grid;gap:18px}.fin-hero{border:1px solid rgba(148,163,184,.18);border-radius:24px;padding:22px;background:linear-gradient(135deg,rgba(15,23,42,.96),rgba(22,101,52,.28));box-shadow:0 20px 50px rgba(2,6,23,.22)}
      .fin-hero h2{margin:0 0 6px;font-size:28px;color:#f8fafc}.fin-hero p{margin:0;color:#cbd5e1}.fin-actions-row{display:flex;gap:10px;flex-wrap:wrap;margin-top:16px}.fin-grid{display:grid;grid-template-columns:repeat(5,minmax(140px,1fr));gap:12px}.fin-kpi{border:1px solid rgba(148,163,184,.16);border-radius:20px;padding:16px;background:rgba(15,23,42,.86)}.fin-kpi span{display:block;color:#94a3b8;font-size:12px;text-transform:uppercase;letter-spacing:.08em}.fin-kpi strong{display:block;margin-top:8px;color:#f8fafc;font-size:22px}.fin-kpi small{color:#94a3b8}.fin-card{border:1px solid rgba(148,163,184,.16);border-radius:22px;background:rgba(15,23,42,.82);padding:18px;box-shadow:0 18px 42px rgba(2,6,23,.18)}
      .fin-head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;margin-bottom:14px}.fin-head h3{margin:0;color:#f8fafc}.fin-head p{margin:4px 0 0;color:#94a3b8}.pay-grid{display:grid;grid-template-columns:repeat(2,minmax(280px,1fr));gap:14px}.pay-card{border:1px solid rgba(148,163,184,.16);border-radius:22px;background:rgba(2,6,23,.34);padding:16px}.pay-card h4{margin:0 0 6px;color:#f8fafc;font-size:18px}.pay-card p{margin:0 0 14px;color:#94a3b8}.pay-summary{display:grid;grid-template-columns:repeat(4,minmax(120px,1fr));gap:10px;margin:14px 0}.pay-mini{border:1px solid rgba(148,163,184,.14);border-radius:16px;padding:12px;background:rgba(15,23,42,.7)}.pay-mini span{display:block;color:#94a3b8;font-size:11px;text-transform:uppercase;letter-spacing:.06em}.pay-mini strong{display:block;margin-top:5px;color:#f8fafc;font-size:18px}.pay-subtabs{display:flex;gap:8px;flex-wrap:wrap;margin:14px 0}.pay-subtab{border:1px solid rgba(148,163,184,.2);background:#0f172a;color:#cbd5e1;border-radius:999px;padding:8px 12px;cursor:pointer}.pay-subtab.active{background:#14532d;color:#fff;border-color:#22c55e}.pay-table{display:none}.pay-table.active{display:block}@media(max-width:1100px){.pay-grid,.pay-summary{grid-template-columns:1fr 1fr}}@media(max-width:700px){.pay-grid,.pay-summary{grid-template-columns:1fr}}.fin-tabs{display:flex;gap:8px;flex-wrap:wrap}.fin-tab{border:1px solid rgba(148,163,184,.2);background:#0f172a;color:#cbd5e1;border-radius:999px;padding:9px 14px;cursor:pointer}.fin-tab.active{background:#166534;color:#fff;border-color:#22c55e}.fin-panel{display:none}.fin-panel.active{display:block}.fin-form{display:grid;grid-template-columns:repeat(4,minmax(150px,1fr));gap:12px}.fin-field{display:grid;gap:6px}.fin-field.full{grid-column:1/-1}.fin-field label{font-size:12px;color:#94a3b8;text-transform:uppercase;letter-spacing:.06em}.fin-field input,.fin-field select,.fin-field textarea{width:100%;border:1px solid rgba(148,163,184,.22);border-radius:14px;background:#0f172a;color:#e5e7eb;padding:10px 12px;color-scheme:dark}.fin-field textarea{min-height:78px;resize:vertical}.fin-table-wrap{overflow:auto;border-radius:18px;border:1px solid rgba(148,163,184,.14)}.fin-table{width:100%;border-collapse:collapse;min-width:860px}.fin-table th,.fin-table td{padding:12px;border-bottom:1px solid rgba(148,163,184,.12);text-align:left;color:#e5e7eb}.fin-table th{background:rgba(15,23,42,.96);color:#94a3b8;font-size:12px;text-transform:uppercase;letter-spacing:.06em}.fin-table tr:hover td{background:rgba(34,197,94,.06)}.fin-muted{display:block;color:#94a3b8;font-size:12px;margin-top:3px}.fin-status{display:inline-flex;align-items:center;border-radius:999px;padding:5px 10px;font-size:12px;font-weight:800}.fin-status.ok{background:rgba(34,197,94,.14);color:#86efac}.fin-status.danger{background:rgba(239,68,68,.14);color:#fecaca}.fin-status.neutral{background:rgba(148,163,184,.14);color:#cbd5e1}.fin-import-grid{display:grid;grid-template-columns:repeat(2,minmax(260px,1fr));gap:14px}.fin-drop{border:1px dashed rgba(34,197,94,.45);border-radius:20px;padding:18px;background:rgba(22,101,52,.1)}.pay-upload{border:1px dashed rgba(34,197,94,.45);border-radius:18px;background:rgba(22,101,52,.08);padding:14px;min-height:78px;display:flex;align-items:center;justify-content:center;text-align:center;cursor:pointer;transition:.16s ease}.pay-upload:hover,.pay-upload.dragging{border-color:#22c55e;background:rgba(22,101,52,.18);transform:translateY(-1px)}.pay-upload input{display:none}.pay-upload strong{display:block;color:#e5e7eb;font-size:13px}.pay-upload span{display:block;color:#94a3b8;font-size:12px;margin-top:4px;word-break:break-word}.pay-upload.has-file{border-style:solid;background:rgba(34,197,94,.14)}.fin-feedback{color:#94a3b8;font-size:13px}.fin-feedback.ok{color:#86efac}.fin-feedback.err{color:#fecaca}.fin-empty{text-align:center;color:#94a3b8;padding:24px!important}.fin-small{padding:8px 12px!important;font-size:13px!important}@media(max-width:1100px){.fin-grid{grid-template-columns:repeat(2,1fr)}.fin-form,.fin-import-grid{grid-template-columns:1fr}}@media(max-width:700px){.fin-grid{grid-template-columns:1fr}.fin-head{display:grid}}
    </style>
    <section class="fin-wrap">
      <div class="fin-hero">
        <h2>Financeiro · Fluxo de Caixa</h2>
        <p>Saldo manual do dia, contas a receber, contas a pagar e provisões consolidadas sem duplicar os relatórios importados.</p>
        <div class="fin-actions-row">
          <button class="btn btn-primary" id="btnReload" type="button">Atualizar fluxo</button>
          <button class="btn btn-secondary" data-tab-target="importar" type="button">Importar relatórios</button>
          <button class="btn btn-secondary" data-tab-target="config" type="button">Ajustar saldo/provisão</button>
          <button class="btn btn-secondary" data-tab-target="pagamentos" type="button">Pagamentos</button>
        </div>
      </div>

      <div class="fin-grid">
        <article class="fin-kpi"><span>Saldo do dia</span><strong id="kpiSaldo">R$ 0,00</strong><small>Manual</small></article>
        <article class="fin-kpi"><span>Contas a receber</span><strong id="kpiReceber">R$ 0,00</strong><small>Relatório importado</small></article>
        <article class="fin-kpi"><span>Contas a pagar</span><strong id="kpiPagar">R$ 0,00</strong><small>Relatório importado</small></article>
        <article class="fin-kpi"><span>Provisão do dia</span><strong id="kpiProvisao">R$ 0,00</strong><small>Auto + ajuste</small></article>
        <article class="fin-kpi"><span>Saldo projetado</span><strong id="kpiProjetado">R$ 0,00</strong><small id="kpiStatus">OK</small></article>
      </div>

      <article class="fin-card">
        <div class="fin-head">
          <div><h3>Visão diária</h3><p>Filtre o período do fluxo de caixa.</p></div>
          <div class="fin-tabs">
            <button class="fin-tab active" data-tab="fluxo" type="button">Fluxo</button>
            <button class="fin-tab" data-tab="importar" type="button">Importar</button>
            <button class="fin-tab" data-tab="config" type="button">Saldo e Provisão</button>
            <button class="fin-tab" data-tab="detalhes" type="button">Detalhes</button>
            <button class="fin-tab" data-tab="pagamentos" type="button">Pagamentos</button>
          </div>
        </div>

        <div class="fin-panel active" id="tab-fluxo">
          <form class="fin-form" id="periodForm">
            <div class="fin-field"><label>Data inicial</label><input id="filterInicio" type="date" value="${esc(state.filters.inicio)}"></div>
            <div class="fin-field"><label>Data final</label><input id="filterFim" type="date" value="${esc(state.filters.fim)}"></div>
            <div class="fin-field"><label>&nbsp;</label><button class="btn btn-primary" type="submit">Aplicar período</button></div>
          </form>
          <br>
          <div class="fin-table-wrap"><table class="fin-table"><thead><tr><th>Data</th><th>Saldo do dia</th><th>Receber</th><th>Pagar</th><th>Provisão</th><th>Saldo projetado</th><th>Status</th><th>Ação</th></tr></thead><tbody id="fluxoTbody"><tr><td colspan="8" class="fin-empty">Carregando...</td></tr></tbody></table></div>
        </div>

        <div class="fin-panel" id="tab-importar">
          <div class="fin-import-grid">
            <div class="fin-drop">
              <h3>Contas a Receber</h3>
              <p class="fin-muted">Use o relatório com colunas Código, Fatura, Cliente, Vencimento, Valor e Valor Pago.</p><br>
              <input id="fileReceber" type="file" accept=".xlsx,.xls,.csv">
              <div class="fin-actions-row"><button class="btn btn-primary" id="btnImportReceber" type="button">Importar receber</button><span id="fbReceber" class="fin-feedback"></span></div>
            </div>
            <div class="fin-drop">
              <h3>Contas a Pagar</h3>
              <p class="fin-muted">Use o relatório com colunas Empresa, COD/Grupo, Favorecido, Doc, Vencimento, Parcela e Valor.</p><br>
              <input id="filePagar" type="file" accept=".xlsx,.xls,.csv">
              <div class="fin-actions-row"><button class="btn btn-primary" id="btnImportPagar" type="button">Importar pagar</button><span id="fbPagar" class="fin-feedback"></span></div>
            </div>
          </div>
        </div>

        <div class="fin-panel" id="tab-config">
          <form class="fin-form" id="configForm">
            <div class="fin-field"><label>Data</label><input id="cfgData" type="date" value="${esc(state.currentDate)}" required></div>
            <div class="fin-field"><label>Saldo do dia</label><input id="cfgSaldo" type="number" step="0.01" placeholder="0,00"></div>
            <div class="fin-field"><label>Provisão automática</label><input id="cfgProvAuto" type="number" step="0.01" placeholder="0,00"></div>
            <div class="fin-field"><label>Ajuste manual provisão</label><input id="cfgProvManual" type="number" step="0.01" placeholder="0,00"></div>
            <div class="fin-field full"><label>Observações</label><textarea id="cfgObs" placeholder="Observações do financeiro"></textarea></div>
            <div class="fin-field"><label>&nbsp;</label><button class="btn btn-primary" type="submit">Salvar ajustes</button></div>
            <div class="fin-field"><label>&nbsp;</label><span id="fbConfig" class="fin-feedback"></span></div>
          </form>
        </div>

        <div class="fin-panel" id="tab-detalhes">
          <div class="fin-head"><div><h3>Detalhes do dia selecionado</h3><p id="detalhesData">Selecione uma data no fluxo.</p></div></div>
          <div class="fin-table-wrap"><table class="fin-table"><thead><tr><th>Tipo</th><th>Situação</th><th>Nome/Favorecido</th><th>Documento</th><th>Valor</th><th>Vencimento</th></tr></thead><tbody id="detalhesTbody"><tr><td colspan="6" class="fin-empty">Nenhuma data selecionada.</td></tr></tbody></table></div>
        </div>


        <div class="fin-panel" id="tab-pagamentos">
          <div class="fin-head">
            <div><h3>Pagamentos</h3><p>Gere, confira em tela e exporte arquivos de pagamento.</p></div>
          </div>
          <div class="pay-grid">
            <section class="pay-card">
              <h4>ADIANTAMENTOS</h4>
              <p>Importe o Extrato_Solicitações e a Fonte_ALELO para gerar PGTO_ALELO, PGTO_IFOOD e PGTO_FLASH com conferência na tela.</p>
              <div class="fin-form">
                <div class="fin-field"><label>Extrato_Solicitações</label><label class="pay-upload" for="adiantFileExtrato" data-drop-for="adiantFileExtrato"><input id="adiantFileExtrato" type="file" accept=".xlsx,.xls,.csv"><span><strong>Arraste aqui ou clique para escolher</strong><span id="adiantFileExtratoName">Nenhum arquivo selecionado</span></span></label></div>
                <div class="fin-field"><label>Fonte_ALELO</label><label class="pay-upload" for="adiantFileAlelo" data-drop-for="adiantFileAlelo"><input id="adiantFileAlelo" type="file" accept=".xlsx,.xls,.csv"><span><strong>Arraste aqui ou clique para escolher</strong><span id="adiantFileAleloName">Nenhum arquivo selecionado</span></span></label></div>
                <div class="fin-field"><label>&nbsp;</label><button class="btn btn-primary" id="btnGerarAdiantamentos" type="button">Gerar adiantamentos</button></div>
                <div class="fin-field"><label>&nbsp;</label><span id="fbAdiantamentos" class="fin-feedback"></span></div>
              </div>
            </section>
            <section class="pay-card">
              <h4>ALIMENTAÇÃO</h4>
              <p>Usa a produção diária já importada no painel, cruza com a base de colaboradores e gera Flash/iFood.</p>
              <div class="fin-form">
                <div class="fin-field"><label>Data inicial</label><input id="alimInicio" type="date" value="${esc(state.filters.inicio)}"></div>
                <div class="fin-field"><label>Data final</label><input id="alimFim" type="date" value="${esc(state.currentDate)}"></div>
                <div class="fin-field"><label>&nbsp;</label><button class="btn btn-primary" id="btnGerarAlimentacao" type="button">Gerar alimentação</button></div>
                <div class="fin-field"><label>&nbsp;</label><span id="fbAlimentacao" class="fin-feedback"></span></div>
              </div>
            </section>
          </div>

          <div class="pay-summary">
            <div class="pay-mini"><span>Tipo</span><strong id="payTipo">-</strong></div>
            <div class="pay-mini"><span>Período</span><strong id="payPeriodo">-</strong></div>
            <div class="pay-mini"><span>Registros</span><strong id="payRegistros">0</strong></div>
            <div class="pay-mini"><span>Total</span><strong id="payTotal">R$ 0,00</strong></div>
          </div>

          <div class="fin-actions-row">
            <button class="btn btn-secondary" id="btnExportFlash" type="button">Baixar Flash XLSX</button>
            <button class="btn btn-secondary" id="btnExportIfood" type="button">Baixar iFood XLSX</button>
            <button class="btn btn-secondary" id="btnExportAlelo" type="button">Baixar Alelo CSV</button>
            <button class="btn btn-secondary" id="btnExportConferencia" type="button">Baixar conferência XLSX</button>
          </div>

          <div class="pay-subtabs">
            <button class="pay-subtab active" data-pay-tab="conferencia" type="button">Conferência</button>
            <button class="pay-subtab" data-pay-tab="flash" type="button">Flash</button>
            <button class="pay-subtab" data-pay-tab="ifood" type="button">iFood</button>
            <button class="pay-subtab" data-pay-tab="alelo" type="button">Alelo</button>
            <button class="pay-subtab" data-pay-tab="logs" type="button">Pendências</button>
          </div>

          <div class="pay-table active" id="pay-conferencia"><div class="fin-table-wrap"><table class="fin-table"><thead><tr><th>Data</th><th>Colaborador</th><th>CPF</th><th>Destino</th><th>Tipo</th><th>Valor</th><th>Composição</th><th>Supervisão</th><th>Observação</th></tr></thead><tbody id="payConferenciaTbody"><tr><td colspan="9" class="fin-empty">Gere um pagamento para conferir.</td></tr></tbody></table></div></div>
          <div class="pay-table" id="pay-flash"><div class="fin-table-wrap"><table class="fin-table"><thead><tr><th>CPF</th><th>Nome</th><th>Valor</th></tr></thead><tbody id="payFlashTbody"><tr><td colspan="3" class="fin-empty">Nenhum arquivo Flash gerado.</td></tr></tbody></table></div></div>
          <div class="pay-table" id="pay-ifood"><div class="fin-table-wrap"><table class="fin-table"><thead><tr><th>CNPJ</th><th>Nome</th><th>CPF</th><th>Nascimento</th><th>Email</th><th>Celular</th><th>Centro de custo</th><th>Livre</th></tr></thead><tbody id="payIfoodTbody"><tr><td colspan="8" class="fin-empty">Nenhum arquivo iFood gerado.</td></tr></tbody></table></div></div>
          <div class="pay-table" id="pay-alelo"><div class="fin-table-wrap"><table class="fin-table"><thead><tr><th>Número de Série</th><th>CPF</th><th>Valor da Carga</th><th>Observação</th><th>Nome</th></tr></thead><tbody id="payAleloTbody"><tr><td colspan="5" class="fin-empty">Nenhum arquivo Alelo gerado.</td></tr></tbody></table></div></div>
          <div class="pay-table" id="pay-logs"><div class="fin-table-wrap"><table class="fin-table"><thead><tr><th>Data/Linha</th><th>Colaborador</th><th>Status</th><th>Mensagem</th></tr></thead><tbody id="payLogsTbody"><tr><td colspan="4" class="fin-empty">Nenhuma pendência.</td></tr></tbody></table></div></div>
        </div>
      </article>
    </section>
  `;

  function setFeedback(id, text, type = '') {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = text || '';
    el.className = `fin-feedback ${type}`.trim();
  }


  function tabFromHash() {
    const tab = String(window.location.hash || '').replace(/^#/, '').toLowerCase();
    return ['fluxo', 'importar', 'config', 'detalhes', 'pagamentos'].includes(tab) ? tab : 'fluxo';
  }

  function setTab(tab) {
    document.querySelectorAll('.fin-tab').forEach((btn) => btn.classList.toggle('active', btn.dataset.tab === tab));
    document.querySelectorAll('.fin-panel').forEach((panel) => panel.classList.remove('active'));
    document.getElementById(`tab-${tab}`)?.classList.add('active');
  }

  async function loadFluxo() {
    const { data, error } = await supabase
      .from('financeiro_fluxo_caixa_diario')
      .select('*')
      .gte('data', state.filters.inicio)
      .lte('data', state.filters.fim)
      .order('data', { ascending: true });

    if (error) {
      document.getElementById('fluxoTbody').innerHTML = `<tr><td colspan="8" class="fin-empty">${esc(error.message)}<br>Execute a migration do módulo financeiro no Supabase.</td></tr>`;
      return;
    }
    state.fluxo = data || [];
    renderFluxo();
    updateKpis();
  }

  async function loadDetalhes(date) {
    state.currentDate = date;
    document.getElementById('detalhesData').textContent = `Data: ${brDate(date)}`;
    const [receberRes, pagarRes, saldoRes, provisaoRes] = await Promise.all([
      supabase.from('financeiro_contas_receber').select('*').eq('vencimento', date).order('cliente'),
      supabase.from('financeiro_contas_pagar').select('*').eq('vencimento', date).order('favorecido'),
      supabase.from('financeiro_saldos_dia').select('*').eq('data', date).maybeSingle(),
      supabase.from('financeiro_provisoes').select('*').eq('data', date).maybeSingle()
    ]);
    state.receber = receberRes.data || [];
    state.pagar = pagarRes.data || [];
    document.getElementById('cfgData').value = date;
    document.getElementById('cfgSaldo').value = saldoRes.data?.saldo_dia ?? '';
    document.getElementById('cfgObs').value = saldoRes.data?.observacoes || provisaoRes.data?.observacoes || '';
    document.getElementById('cfgProvAuto').value = provisaoRes.data?.valor_automatico ?? '';
    document.getElementById('cfgProvManual').value = provisaoRes.data?.ajuste_manual ?? '';
    renderDetalhes();
    setTab('detalhes');
  }

  function updateKpis() {
    const total = state.fluxo.reduce((acc, row) => {
      acc.saldo += Number(row.saldo_dia || 0);
      acc.receber += Number(row.contas_receber || 0);
      acc.pagar += Number(row.contas_pagar || 0);
      acc.provisao += Number(row.provisoes_dia || 0);
      acc.projetado += Number(row.saldo_projetado || 0);
      return acc;
    }, { saldo: 0, receber: 0, pagar: 0, provisao: 0, projetado: 0 });
    const hasAttention = state.fluxo.some((row) => statusClass(row.status) === 'danger') || total.projetado < 0;
    document.getElementById('kpiSaldo').textContent = money(total.saldo);
    document.getElementById('kpiReceber').textContent = money(total.receber);
    document.getElementById('kpiPagar').textContent = money(total.pagar);
    document.getElementById('kpiProvisao').textContent = money(total.provisao);
    document.getElementById('kpiProjetado').textContent = money(total.projetado);
    document.getElementById('kpiStatus').textContent = state.fluxo.length ? (hasAttention ? 'ATENÇÃO' : 'OK') : 'SEM DADOS';
    document.querySelectorAll('.fin-kpi small').forEach((el, idx) => {
      if (idx < 4) el.textContent = dateRangeLabel(state.filters.inicio, state.filters.fim);
    });
  }

  function renderFluxo() {
    const tbody = document.getElementById('fluxoTbody');
    if (!state.fluxo.length) {
      tbody.innerHTML = `<tr><td colspan="8" class="fin-empty">Nenhum dia encontrado no período.</td></tr>`;
      return;
    }
    tbody.innerHTML = state.fluxo.map((row) => `
      <tr>
        <td><strong>${brDate(row.data)}</strong></td>
        <td>${money(row.saldo_dia)}</td>
        <td>${money(row.contas_receber)}</td>
        <td>${money(row.contas_pagar)}</td>
        <td>${money(row.provisoes_dia)}</td>
        <td><strong>${money(row.saldo_projetado)}</strong></td>
        <td><span class="fin-status ${statusClass(row.status)}">${esc(row.status || 'OK')}</span></td>
        <td><button class="btn btn-secondary fin-small" data-detail-date="${esc(row.data)}" type="button">Abrir</button></td>
      </tr>
    `).join('');
  }

  function renderDetalhes() {
    const tbody = document.getElementById('detalhesTbody');
    const rows = [
      ...state.receber.map((r) => ({ tipo: 'Receber', situacao: r.situacao, nome: r.cliente, doc: r.fatura || r.numero_nf || r.codigo, valor: Number(r.valor || 0) - Number(r.valor_pago || 0), vencimento: r.vencimento })),
      ...state.pagar.map((r) => ({ tipo: 'Pagar', situacao: r.situacao, nome: r.favorecido, doc: r.doc || r.cod_grupo || r.parcela, valor: Number(r.valor || 0) - Number(r.valor_pago || 0), vencimento: r.vencimento }))
    ];
    if (!rows.length) {
      tbody.innerHTML = `<tr><td colspan="6" class="fin-empty">Nenhum lançamento encontrado para esta data.</td></tr>`;
      return;
    }
    tbody.innerHTML = rows.map((r) => `
      <tr><td>${esc(r.tipo)}</td><td>${esc(r.situacao || '-')}</td><td><strong>${esc(r.nome || '-')}</strong></td><td>${esc(r.doc || '-')}</td><td>${money(r.valor)}</td><td>${brDate(r.vencimento)}</td></tr>
    `).join('');
  }

  async function importFile(kind) {
    const input = document.getElementById(kind === 'receber' ? 'fileReceber' : 'filePagar');
    const fb = kind === 'receber' ? 'fbReceber' : 'fbPagar';
    const file = input.files?.[0];
    if (!file) return setFeedback(fb, 'Selecione uma planilha primeiro.', 'err');
    try {
      setFeedback(fb, 'Lendo planilha...');
      const rows = await readWorkbookRows(file);
      const mapped = kind === 'receber' ? mapReceber(rows, file.name) : mapPagar(rows, file.name);
      if (!mapped.length) throw new Error('Nenhuma linha válida encontrada. Confira os cabeçalhos e as datas.');
      setFeedback(fb, `Importando ${mapped.length} linhas...`);
      const table = kind === 'receber' ? 'financeiro_contas_receber' : 'financeiro_contas_pagar';
      const saved = await upsertChunk(table, mapped);
      setFeedback(fb, `${saved} registros atualizados sem duplicar.`, 'ok');
      await loadFluxo();
    } catch (err) {
      setFeedback(fb, err.message || 'Erro ao importar.', 'err');
    }
  }

  async function saveConfig(event) {
    event.preventDefault();
    const date = document.getElementById('cfgData').value;
    const saldo = Number(document.getElementById('cfgSaldo').value || 0);
    const provAuto = Number(document.getElementById('cfgProvAuto').value || 0);
    const provManual = Number(document.getElementById('cfgProvManual').value || 0);
    const obs = document.getElementById('cfgObs').value.trim() || null;
    const responsavel = userContext?.user?.name || userContext?.user?.email || userContext?.email || null;
    try {
      setFeedback('fbConfig', 'Salvando...');
      const saldoRes = await supabase.from('financeiro_saldos_dia').upsert({ data: date, saldo_dia: saldo, observacoes: obs, responsavel }, { onConflict: 'data' });
      if (saldoRes.error) throw saldoRes.error;
      const provRes = await supabase.from('financeiro_provisoes').upsert({ data: date, descricao: 'Provisão do dia', valor_automatico: provAuto, ajuste_manual: provManual, observacoes: obs, responsavel }, { onConflict: 'data' });
      if (provRes.error) throw provRes.error;
      setFeedback('fbConfig', 'Ajustes salvos.', 'ok');
      await loadFluxo();
    } catch (err) {
      setFeedback('fbConfig', err.message || 'Erro ao salvar.', 'err');
    }
  }



  state.pagamentos = { tipo: null, periodo: '', conferencia: [], flash: [], ifood: [], alelo: [], logs: [] };

  function paySetFeedback(id, text, type = '') {
    setFeedback(id, text, type);
  }

  function setPayTab(tab) {
    document.querySelectorAll('.pay-subtab').forEach((btn) => btn.classList.toggle('active', btn.dataset.payTab === tab));
    document.querySelectorAll('.pay-table').forEach((panel) => panel.classList.remove('active'));
    document.getElementById(`pay-${tab}`)?.classList.add('active');
  }

  function updatePaySummary() {
    const p = state.pagamentos;
    const total = [...(p.conferencia || []), ...(p.alelo || [])].reduce((sum, row) => sum + Number(row.valor || 0), 0);
    const registros = (p.conferencia || []).length || ((p.flash || []).length + (p.ifood || []).length + (p.alelo || []).length);
    document.getElementById('payTipo').textContent = p.tipo || '-';
    document.getElementById('payPeriodo').textContent = p.periodo || '-';
    document.getElementById('payRegistros').textContent = String(registros);
    document.getElementById('payTotal').textContent = money(total);
  }

  function renderPayTables() {
    const p = state.pagamentos;
    document.getElementById('payConferenciaTbody').innerHTML = p.conferencia?.length ? p.conferencia.map((r) => `
      <tr><td>${brDate(r.data)}</td><td><strong>${esc(r.funcionario || '-')}</strong></td><td>${esc(r.cpf || '-')}</td><td>${esc(r.destino || '-')}</td><td>${esc(r.tipo || '-')}</td><td>${money(r.valor)}</td><td>${esc(r.composicao || '-')}</td><td>${esc(r.supervisao || '-')}</td><td>${esc(r.observacao || '-')}</td></tr>
    `).join('') : `<tr><td colspan="9" class="fin-empty">Nenhuma conferência gerada.</td></tr>`;

    document.getElementById('payFlashTbody').innerHTML = p.flash?.length ? p.flash.map((r) => `
      <tr><td>${esc(r.cpf || '-')}</td><td><strong>${esc(r.nome || '-')}</strong></td><td>${money(r.valor)}</td></tr>
    `).join('') : `<tr><td colspan="3" class="fin-empty">Nenhum arquivo Flash gerado.</td></tr>`;

    document.getElementById('payIfoodTbody').innerHTML = p.ifood?.length ? p.ifood.map((r) => `
      <tr><td>${esc(r.cnpj || '-')}</td><td><strong>${esc(r.nome || '-')}</strong></td><td>${esc(r.cpf || '-')}</td><td>${esc(formatDateForXlsx(r.nascimento) || '-')}</td><td>${esc(r.email || '-')}</td><td>${esc(r.celular || '-')}</td><td>${esc(r.centro_custo || '-')}</td><td>${money(r.livre ?? r.valor)}</td></tr>
    `).join('') : `<tr><td colspan="8" class="fin-empty">Nenhum arquivo iFood gerado.</td></tr>`;

    document.getElementById('payAleloTbody').innerHTML = p.alelo?.length ? p.alelo.map((r) => `
      <tr><td>${esc(r.serie || '-')}</td><td>${esc(r.cpf || '-')}</td><td>${money(r.valor)}</td><td>${esc(r.observacao || '-')}</td><td>${esc(r.nome || '-')}</td></tr>
    `).join('') : `<tr><td colspan="5" class="fin-empty">Nenhum arquivo Alelo gerado.</td></tr>`;

    document.getElementById('payLogsTbody').innerHTML = p.logs?.length ? p.logs.map((r) => `
      <tr><td>${esc(r.data ? brDate(r.data) : (r.linha ? `Linha ${r.linha}` : '-'))}</td><td><strong>${esc(r.funcionario || '-')}</strong></td><td>${esc(r.status || r.tipo || '-')}</td><td>${esc(r.mensagem || '-')}</td></tr>
    `).join('') : `<tr><td colspan="4" class="fin-empty">Nenhuma pendência.</td></tr>`;
    updatePaySummary();
  }

  async function gerarAlimentacao() {
    const inicio = document.getElementById('alimInicio').value;
    const fim = document.getElementById('alimFim').value;
    if (!inicio || !fim) return paySetFeedback('fbAlimentacao', 'Informe data inicial e final.', 'err');
    if (inicio > fim) return paySetFeedback('fbAlimentacao', 'A data inicial não pode ser maior que a final.', 'err');
    try {
      paySetFeedback('fbAlimentacao', 'Buscando produção e colaboradores...');
      const [rhMap, producao] = await Promise.all([loadColaboradoresPagamento(), loadProducaoPagamento(inicio, fim)]);
      if (!producao.length) {
        const diag = (producao._diagnostics || [])
          .map((d) => `${d.origem}: ${d.erro ? d.erro : `${d.raw || 0} registros brutos`}`)
          .join(' | ');
        const ultimas = await fetchUltimasDatasProducaoPagamento();
        const datasMsg = ultimas
          .map((d) => d.erro ? `${d.origem}: ${d.erro}` : `${d.origem}: ${d.datas.length ? d.datas.map(brDate).join(', ') : 'sem datas encontradas'}`)
          .join(' | ');
        throw new Error(`Nenhuma produção com colaborador localizada no período selecionado. ${diag ? `Diagnóstico do filtro: ${diag}. ` : ''}${datasMsg ? `Últimas datas disponíveis: ${datasMsg}` : ''}`);
      }
      const apuracao = apurarAlimentacaoRows(producao, rhMap);
      state.pagamentos = { tipo: 'Alimentação', periodo: dateRangeLabel(inicio, fim), ...apuracao };
      renderPayTables();
      setPayTab('conferencia');
      paySetFeedback('fbAlimentacao', `Gerado: ${apuracao.conferencia.length} conferências, ${apuracao.flash.length} Flash, ${apuracao.ifood.length} iFood, ${apuracao.logs.length} pendências.`, 'ok');
    } catch (err) {
      console.error(err);
      paySetFeedback('fbAlimentacao', err.message || 'Erro ao gerar alimentação.', 'err');
    }
  }

  async function gerarAdiantamentos() {
    const extratoFile = document.getElementById('adiantFileExtrato').files?.[0];
    const aleloFile = document.getElementById('adiantFileAlelo').files?.[0];
    if (!extratoFile) return paySetFeedback('fbAdiantamentos', 'Selecione o Extrato_Solicitações.', 'err');
    try {
      paySetFeedback('fbAdiantamentos', 'Lendo arquivos...');
      const [extratoRows, fonteRows] = await Promise.all([readWorkbookRows(extratoFile), aleloFile ? readWorkbookRows(aleloFile) : Promise.resolve([])]);
      const apuracao = makeAleloRows(extratoRows, fonteRows);
      const conferencia = [
        ...apuracao.alelo.map((r) => ({ data: '', funcionario: r.nome, cpf: String(r.cpf || '').replace(/^'/, ''), destino: 'Alelo', tipo: 'Adiantamento', valor: r.valor, composicao: r.observacao || 'Adiantamento', supervisao: '', observacao: r.serie ? 'OK' : 'Sem série' })),
        ...apuracao.ifood.map((r) => ({ data: '', funcionario: r.nome, cpf: r.cpf, destino: 'iFood', tipo: 'Adiantamento', valor: r.livre, composicao: 'Adiantamento', supervisao: '', observacao: 'OK' })),
        ...apuracao.flash.map((r) => ({ data: '', funcionario: r.nome, cpf: r.cpf, destino: 'Flash', tipo: 'Adiantamento', valor: r.valor, composicao: 'Adiantamento', supervisao: '', observacao: 'OK' }))
      ];
      state.pagamentos = { tipo: 'Adiantamentos', periodo: extratoFile.name, conferencia, flash: apuracao.flash, ifood: apuracao.ifood, alelo: apuracao.alelo, logs: apuracao.logs };
      renderPayTables();
      setPayTab('conferencia');
      paySetFeedback('fbAdiantamentos', `Gerado: ${apuracao.alelo.length} Alelo, ${apuracao.ifood.length} iFood, ${apuracao.flash.length} Flash, ${apuracao.logs.length} pendências.`, 'ok');
    } catch (err) {
      console.error(err);
      paySetFeedback('fbAdiantamentos', err.message || 'Erro ao gerar adiantamentos.', 'err');
    }
  }

  const flashCols = [{ key: 'cpf', label: 'CPF' }, { key: 'valor', label: 'Valor' }];
  const ifoodCols = [
    { key: 'cnpj', label: 'CNPJ' }, { key: 'nome', label: 'Nome' }, { key: 'cpf', label: 'CPF' },
    { key: 'nascimento', label: 'Data de nascimento', format: formatDateForXlsx }, { key: 'email', label: 'Email' },
    { key: 'celular', label: 'Celular' }, { key: 'centro_custo', label: 'Centro de custo' }, { key: 'convencao', label: 'Convenção Coletiva' },
    { key: 'grupo_entrega', label: 'Grupo de entrega' }, { key: 'matricula', label: 'Matricula' }, { key: 'filtro', label: 'Filtro para relatorio de recarga' },
    { key: 'refeicao', label: 'Refeição (Aderente ao PAT)' }, { key: 'alimentacao', label: 'Alimentação (Aderente ao PAT)' }, { key: 'livre', label: 'Livre' }
  ];
  const aleloCols = [{ key: 'serie', label: 'Numero de Serie' }, { key: 'cpf', label: 'CPF' }, { key: 'valor', label: 'Valor da Carga' }, { key: 'observacao', label: 'Observacao' }];
  const confCols = [
    { key: 'data', label: 'Data', format: formatDateForXlsx }, { key: 'funcionario', label: 'Colaborador' }, { key: 'cpf', label: 'CPF' },
    { key: 'destino', label: 'Destino' }, { key: 'tipo', label: 'Tipo' }, { key: 'valor', label: 'Valor' },
    { key: 'composicao', label: 'Composição' }, { key: 'coordenacao', label: 'Coordenação' }, { key: 'supervisao', label: 'Supervisão' },
    { key: 'banco', label: 'C. Banc. Despesas' }, { key: 'observacao', label: 'Observação' }
  ];

  function exportPagamento(kind) {
    const p = state.pagamentos;
    if (kind === 'flash') {
      if (!p.flash?.length) return alert('Nenhum registro Flash para exportar.');
      return downloadWorkbook(`PGTO_FLASH_${compactDate(p.periodo) || compactDate(new Date().toISOString())}.xlsx`, [{ name: 'PGTO_FLASH', ws: worksheetFromObjects(p.flash, flashCols) }]);
    }
    if (kind === 'ifood') {
      if (!p.ifood?.length) return alert('Nenhum registro iFood para exportar.');
      return downloadWorkbook(`PGTO_IFOOD_${compactDate(p.periodo) || compactDate(new Date().toISOString())}.xlsx`, [{ name: 'PGTO_IFOOD', ws: worksheetFromObjects(p.ifood, ifoodCols) }]);
    }
    if (kind === 'alelo') {
      if (!p.alelo?.length) return alert('Nenhum registro Alelo para exportar.');
      return downloadCsv(`PGTO_ALELO_${compactDate(new Date().toISOString())}.csv`, p.alelo, aleloCols);
    }
    if (!p.conferencia?.length) return alert('Nenhuma conferência para exportar.');
    return downloadWorkbook(`CONFERENCIA_PAGAMENTOS_${compactDate(new Date().toISOString())}.xlsx`, [
      { name: 'Conferencia', ws: worksheetFromObjects(p.conferencia, confCols) },
      { name: 'Flash', ws: worksheetFromObjects(p.flash || [], flashCols) },
      { name: 'iFood', ws: worksheetFromObjects(p.ifood || [], ifoodCols) },
      { name: 'Alelo', ws: worksheetFromObjects(p.alelo || [], aleloCols) }
    ]);
  }

  document.querySelectorAll('.fin-tab').forEach((btn) => btn.addEventListener('click', () => { setTab(btn.dataset.tab); if (btn.dataset.tab && btn.dataset.tab !== 'fluxo') history.replaceState(null, '', `#${btn.dataset.tab}`); }));
  document.querySelectorAll('[data-tab-target]').forEach((btn) => btn.addEventListener('click', () => { setTab(btn.dataset.tabTarget); if (btn.dataset.tabTarget && btn.dataset.tabTarget !== 'fluxo') history.replaceState(null, '', `#${btn.dataset.tabTarget}`); }));
  document.getElementById('btnReload').addEventListener('click', loadFluxo);
  document.getElementById('btnImportReceber').addEventListener('click', () => importFile('receber'));
  document.getElementById('btnImportPagar').addEventListener('click', () => importFile('pagar'));
  document.getElementById('configForm').addEventListener('submit', saveConfig);

  function setupPagamentoDropzone(inputId) {
    const input = document.getElementById(inputId);
    const zone = document.querySelector(`[data-drop-for="${inputId}"]`);
    const nameEl = document.getElementById(`${inputId}Name`);
    if (!input || !zone || !nameEl) return;

    const setFileLabel = () => {
      const file = input.files && input.files[0];
      nameEl.textContent = file ? file.name : 'Nenhum arquivo selecionado';
      zone.classList.toggle('has-file', !!file);
    };

    input.addEventListener('change', setFileLabel);

    ['dragenter', 'dragover'].forEach((evtName) => {
      zone.addEventListener(evtName, (event) => {
        event.preventDefault();
        event.stopPropagation();
        zone.classList.add('dragging');
      });
    });

    ['dragleave', 'drop'].forEach((evtName) => {
      zone.addEventListener(evtName, (event) => {
        event.preventDefault();
        event.stopPropagation();
        zone.classList.remove('dragging');
      });
    });

    zone.addEventListener('drop', (event) => {
      const file = event.dataTransfer?.files?.[0];
      if (!file) return;
      const ok = /\.(xlsx|xls|csv)$/i.test(file.name);
      if (!ok) {
        paySetFeedback('fbAdiantamentos', 'Arquivo inválido. Envie XLSX, XLS ou CSV.', 'err');
        return;
      }
      const dt = new DataTransfer();
      dt.items.add(file);
      input.files = dt.files;
      setFileLabel();
      paySetFeedback('fbAdiantamentos', `${file.name} carregado.`, 'ok');
    });

    setFileLabel();
  }

  setupPagamentoDropzone('adiantFileExtrato');
  setupPagamentoDropzone('adiantFileAlelo');
  document.getElementById('btnGerarAlimentacao').addEventListener('click', gerarAlimentacao);
  document.getElementById('btnGerarAdiantamentos').addEventListener('click', gerarAdiantamentos);
  document.querySelectorAll('.pay-subtab').forEach((btn) => btn.addEventListener('click', () => setPayTab(btn.dataset.payTab)));
  document.getElementById('btnExportFlash').addEventListener('click', () => exportPagamento('flash'));
  document.getElementById('btnExportIfood').addEventListener('click', () => exportPagamento('ifood'));
  document.getElementById('btnExportAlelo').addEventListener('click', () => exportPagamento('alelo'));
  document.getElementById('btnExportConferencia').addEventListener('click', () => exportPagamento('conferencia'));
  document.getElementById('periodForm').addEventListener('submit', (event) => {
    event.preventDefault();
    state.filters.inicio = document.getElementById('filterInicio').value;
    state.filters.fim = document.getElementById('filterFim').value;
    loadFluxo();
  });
  content.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-detail-date]');
    if (btn) loadDetalhes(btn.dataset.detailDate);
  });

  window.addEventListener('hashchange', () => setTab(tabFromHash()));
  setTab(tabFromHash());
  loadFluxo();
});
