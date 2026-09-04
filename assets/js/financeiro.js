import { initProtectedPage } from './pageInit.js';
import { supabase } from './supabaseClient.js';
import * as XLSX from 'https://cdn.sheetjs.com/xlsx-0.20.2/package/xlsx.mjs';

async function safe(fn, fallback = []) {
  try {
    const { data, error } = await fn();
    if (error) throw error;
    return data || fallback;
  } catch (e) {
    console.warn(e);
    return fallback;
  }
}

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
  financeiroPagamentos: [],
  pagamentosSetorFilter: 'todos',
  currentDate: new Date().toISOString().slice(0, 10),
  filters: {
    inicio: new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10),
    fim: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10)
  },
  detSort: { col: null, dir: 1 },
  detFilter: { tipo: '', situacao: '', favorecido: '', doc: '' },
  adiantSort: { col: null, dir: 1 },
  notasFiscais: [],
  notasFiscaisLoaded: false,
  notasFiscaisFiltro: { cliente: '', situacao: '' }
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

function brDateTime(value) {
  if (!value) return '-';
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return String(value || '-');
  return dt.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

function origemPagamentoLabel(value) {
  const raw = String(value || '').trim();
  const key = normalize(raw);
  if (key.includes('compra')) return 'Compras';
  if (key.includes('hotel') || key.includes('hosped')) return 'Hospedagem';
  if (key.includes('auditoria')) return 'Auditoria';
  if (key === 'rh' || key.includes('recursos humanos')) return 'RH';
  if (key.includes('logistica')) return 'Logística';
  if (key.includes('frota')) return 'Frotas';
  return raw || '-';
}

function statusPagamentoClass(value) {
  const key = normalize(value || '');
  if (key.includes('pago') || key.includes('concluido') || key.includes('finalizado')) return 'pago';
  if (key.includes('recus') || key.includes('cancel')) return 'danger';
  if (key.includes('pend')) return 'pendente';
  return 'neutral';
}

function parseConteudoPagamento(row) {
  const descricaoBase = row.descricao || row.conteudo || row.observacao || row.detalhes || '';
  const linhas = String(descricaoBase || '')
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/^tipo\s*:/i.test(line))
    .filter((line) => !/^forma\s*:/i.test(line))
    .filter((line) => !/^dados\s*:/i.test(line));

  const dados = row.dados_pagamento || row.link_pagamento || row.chave_pix || row.boleto_url || '';
  const forma = row.forma_pagamento ? `Forma: ${row.forma_pagamento}` : '';
  const fornecedor = row.fornecedor || row.favorecido || row.beneficiario || '';
  const contato = row.contato || row.contato_fornecedor || '';

  const partes = [...linhas];
  if (fornecedor && !partes.some((p) => normalize(p).startsWith('fornecedor:'))) partes.push(`Fornecedor: ${fornecedor}`);
  if (contato && !partes.some((p) => normalize(p).startsWith('contato:'))) partes.push(`Contato: ${contato}`);
  if (forma) partes.push(forma);
  if (dados) partes.push(`Dados: ${dados}`);
  if (!partes.length) partes.push(`Solicitação de ${origemPagamentoLabel(row.origem || row.setor || row.modulo_origem)}`);
  return partes.join('\n');
}

function pagamentoUrl(row) {
  const value = row.dados_pagamento || row.boleto_url || row.link_pagamento || row.comprovante_url || '';
  return /^https?:\/\//i.test(String(value)) ? String(value) : '';
}

function ensureHttps(url) {
  const s = String(url || '').trim();
  return /^https?:\/\//i.test(s) ? s : `https://${s}`;
}

function isBoleto(row) { return /boleto/i.test(row.forma_pagamento || ''); }
function isPix(row) { return /^pix$/i.test((row.forma_pagamento || '').trim()); }

function safeStorageFileName(name) {
  return String(name || 'comprovante')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .slice(0, 120);
}

async function uploadComprovantePagamento(file, row) {
  if (!file) throw new Error('Anexe o comprovante do pagamento.');
  const ano = new Date().getFullYear();
  const origem = safeStorageFileName(origemPagamentoLabel(row?.origem || row?.setor || row?.modulo_origem || 'financeiro')).toLowerCase();
  const path = `financeiro/comprovantes/${ano}/${origem}/${Date.now()}_${safeStorageFileName(file.name)}`;
  const { error } = await supabase.storage
    .from('notas-fiscais')
    .upload(path, file, { upsert: false, contentType: file.type || 'application/octet-stream' });
  if (error) throw new Error(`Falha ao enviar comprovante: ${error.message}`);
  const { data } = supabase.storage.from('notas-fiscais').getPublicUrl(path);
  return data?.publicUrl || path;
}

function isMissingColumnError(error) {
  const msg = String(error?.message || error?.details || error?.hint || '').toLowerCase();
  return error?.code === 'PGRST204' || msg.includes('schema cache') || msg.includes('could not find') || msg.includes('column');
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

function rowToObjectsFromMatrix(matrix) {
  const rows = matrix || [];
  const headerCandidates = [
    'situacao', 'data', 'conta', 'funcionario', 'cpf', 'data de nascimento', 'valor', 'descricao',
    'categoria', 'status', 'data de solicitacao', 'coordenacao', 'supervisao', 'fornecedor', 'cidade',
    'codigo', 'fatura', 'cliente', 'vencimento', 'valor pago', 'favorecido', 'doc'
  ];

  let headerIndex = 0;
  let bestScore = -1;
  rows.slice(0, 15).forEach((row, idx) => {
    const normalizedCells = (row || []).map((cell) => normalize(cell));
    const score = normalizedCells.filter((cell) => headerCandidates.includes(cell)).length;
    if (score > bestScore) {
      bestScore = score;
      headerIndex = idx;
    }
  });

  const headers = (rows[headerIndex] || []).map((header, idx) => String(header || `Coluna ${idx + 1}`).trim() || `Coluna ${idx + 1}`);
  return rows.slice(headerIndex + 1).map((row) => {
    const obj = {};
    headers.forEach((header, idx) => { obj[header] = row?.[idx] ?? ''; });
    return obj;
  }).filter((row) => Object.values(row).some((value) => String(value ?? '').trim() !== ''));
}

function readWorkbookRows(file) {
  return file.arrayBuffer().then((buffer) => {
    const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
    const firstSheet = workbook.SheetNames[0];
    const sheet = workbook.Sheets[firstSheet];
    const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: true });
    return rowToObjectsFromMatrix(matrix);
  });
}


const PAGAMENTO_VALOR_REFEICAO = Object.freeze({
  CAFE: 15,
  ALMOCO: 30,
  JANTA: 30
});
const PAGAMENTO_IFOOD_CNPJ = '29.666.679/0001-34';

function onlyDigits(value) {
  return String(value ?? '').replace(/\D/g, '');
}

function normalizeName(value) {
  return normalize(value).replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
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

function getAny(row, names = []) {
  const keys = Object.keys(row || {});
  for (const name of names) {
    const found = keys.find((key) => normalize(key) === normalize(name));
    if (found) return row[found];
  }
  return null;
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
      banco: row.conta_bancaria_despesas || row.conta_bancaria || row['C. Banc. Despesas'] || '',
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

// Fonte: colaboradores (sincronizada pelo agente grmserver-colaboradores-sync a cada
// ciclo do worker, dado atual — sem dimensão de data). Antes lia de colaborador_snapshot,
// uma base legada alimentada por upload manual (importarColaboradores.js) que parou de
// ser atualizada em 2026-06-18 — CPF/conta bancária ficavam presos num estado de ~1 mês
// atrás (ex.: colaborador ainda aparecia com conta ALELO muito depois de a GRM já ter
// zerado/trocado o campo). dataReferencia não é mais usado (colaboradores não tem
// histórico por data); mantido no parâmetro só para não quebrar o chamador.
async function loadColaboradoresPagamento(_dataReferencia = null) {
  const pageSize = 1000;
  const rows = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from('colaboradores')
      .select('nome,cpf,salario,conta_bancaria_despesas,empresa,coordenacao,supervisao,tipo,data_nascimento,whatsapp,email_pessoal,email_empresa')
      .range(from, from + pageSize - 1);
    if (error) throw error;
    const page = data || [];
    rows.push(...page);
    if (page.length < pageSize) break;
    from += pageSize;
  }

  return buildLatestColaboradorMap(rows || []);
}

const TIPO_BENEFICIO_LABEL = { CAFE: 'Café', ALMOCO: 'Almoço', JANTA: 'Janta' };

// Fonte: financeiro_alimentacao_colaboradores, gravada pelo agente sync-login-alimentacao
// (login no GRM a até 1km de um Local de Embarque, classificado por turno: Café 06:00-07:30,
// Almoço 11:00-12:30, Janta 19:00-20:30 — coluna tipo_beneficio). Cruza com a base RH só
// para achar CPF/conta bancária (Flash/iFood) — mesma lógica de destino já usada em
// Adiantamentos/antiga apuração de produção.
function apurarAlmocoRows(rows, rhMap) {
  const flashMap = new Map();
  const ifoodMap = new Map();
  const conferencia = [];
  const logs = [];

  (rows || []).forEach((row) => {
    const funcionario = String(row.colaborador || '').trim();
    const dataRef = row.data_ref;
    if (!funcionario || !dataRef) return;

    const tipoLabel = TIPO_BENEFICIO_LABEL[row.tipo_beneficio] || 'Refeição';
    const composicaoBase = [row.local_nome, row.hora_identificada, row.distancia_m != null ? `${row.distancia_m}m` : null].filter(Boolean).join(' · ');
    const rh = rhMap.get(normalizeName(funcionario));
    if (!rh) {
      logs.push({ data: dataRef, funcionario, status: 'ERRO', mensagem: 'Colaborador não localizado na base RH.' });
      conferencia.push({ data: dataRef, funcionario, cpf: '', destino: 'Pendente', tipo: tipoLabel, valor: 0, composicao: composicaoBase, coordenacao: row.coordenacao || '', supervisao: row.supervisao || '', observacao: 'Colaborador não localizado na base RH.', _almoco_id: row.id, status_pagamento: row.status && row.status !== 'PENDENTE' ? String(row.status).toUpperCase() : undefined });
      return;
    }
    if (!rh.cpf || rh.cpf.length !== 11) {
      logs.push({ data: dataRef, funcionario: rh.nome || funcionario, status: 'ERRO', mensagem: 'CPF ausente ou inválido na base RH.' });
      conferencia.push({ data: dataRef, funcionario: rh.nome || funcionario, cpf: rh.cpf || '', destino: 'Pendente', tipo: tipoLabel, valor: 0, composicao: composicaoBase, coordenacao: rh.coordenacao || row.coordenacao || '', supervisao: rh.supervisao || row.supervisao || '', observacao: 'CPF ausente ou inválido.', _almoco_id: row.id, status_pagamento: row.status && row.status !== 'PENDENTE' ? String(row.status).toUpperCase() : undefined });
      return;
    }

    const valor = PAGAMENTO_VALOR_REFEICAO[String(row.tipo_beneficio || '').toUpperCase()] ?? PAGAMENTO_VALOR_REFEICAO.ALMOCO;
    const bancoNorm = normalize(rh.banco).replace(/\s+/g, '');
    let destino = 'Pendente';
    if (bancoNorm.includes('graomilflash') || bancoNorm.includes('flash')) destino = 'Flash';
    if (bancoNorm.includes('graomilifood') || bancoNorm.includes('ifood')) destino = 'iFood';

    const confRow = {
      data: dataRef,
      funcionario: rh.nome || funcionario,
      cpf: rh.cpf,
      destino,
      tipo: tipoLabel,
      valor: roundNumber(valor),
      composicao: composicaoBase || `${tipoLabel} ${money(valor)}`,
      coordenacao: rh.coordenacao || row.coordenacao || '',
      supervisao: rh.supervisao || row.supervisao || '',
      banco: rh.banco || '',
      observacao: destino === 'Pendente' ? `C. Banc. Despesas sem destino reconhecido: ${rh.banco || '(vazio)'}` : 'OK',
      _almoco_id: row.id,
      status_pagamento: row.status && row.status !== 'PENDENTE' ? String(row.status).toUpperCase() : undefined
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


function paymentStatusClass(value) {
  const s = normalize(value || 'OK');
  if (s === 'pago') return 'pago';
  if (s === 'pendente') return 'pendente';
  if (s.includes('erro')) return 'danger';
  return 'ok';
}

function makePaymentHash(row) {
  return hashText([
    row.data || '', row.funcionario || '', row.cpf || '', row.destino || '', row.tipo || '', row.valor || 0, row.composicao || ''
  ].join('|'));
}

function normalizePaymentRows(apuracao = {}, defaultStatus = 'OK') {
  const status = ['OK', 'PENDENTE'].includes(String(defaultStatus || '').toUpperCase()) ? String(defaultStatus).toUpperCase() : 'OK';
  const conferencia = (apuracao.conferencia || []).map((row) => ({
    ...row,
    unique_hash: row.unique_hash || makePaymentHash(row),
    status_pagamento: row.status_pagamento || (normalize(row.observacao).includes('ok') ? status : status)
  }));
  return { ...apuracao, conferencia };
}

function buildPaymentOutputs(conferencia = []) {
  const okRows = (conferencia || []).filter((row) => String(row.status_pagamento || 'OK').toUpperCase() === 'OK');
  const flashMap = new Map();
  const ifoodMap = new Map();
  const alelo = [];

  okRows.forEach((row) => {
    const destinoNorm = normalize(row.destino);
    const cpf = onlyDigits(row.cpf).padStart(11, '0').slice(0, 11);
    const valor = roundNumber(row.valor);
    if (!cpf || cpf.length !== 11 || !valor) return;
    if (destinoNorm.includes('flash')) {
      if (!flashMap.has(cpf)) flashMap.set(cpf, { cpf, nome: row.funcionario, valor: 0 });
      flashMap.get(cpf).valor = roundNumber(flashMap.get(cpf).valor + valor);
      return;
    }
    if (destinoNorm.includes('ifood')) {
      if (!ifoodMap.has(cpf)) {
        ifoodMap.set(cpf, {
          cnpj: PAGAMENTO_IFOOD_CNPJ,
          nome: row.funcionario,
          cpf,
          nascimento: row.nascimento || '',
          email: row.email || '',
          celular: row.celular || '',
          centro_custo: row.coordenacao || row.supervisao || '',
          livre: 0
        });
      }
      ifoodMap.get(cpf).livre = roundNumber(ifoodMap.get(cpf).livre + valor);
      return;
    }
    if (destinoNorm.includes('alelo')) {
      alelo.push({ serie: row.serie || '', cpf, valor, observacao: row.composicao || row.observacao || '', nome: row.funcionario });
    }
  });

  return {
    flash: Array.from(flashMap.values()).sort((a, b) => String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR')),
    ifood: Array.from(ifoodMap.values()).sort((a, b) => String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR')),
    alelo,
    okRows
  };
}

async function fetchAlreadyPaidMap(hashes = []) {
  const result = new Map();
  const clean = [...new Set((hashes || []).filter(Boolean))];
  if (!clean.length) return result;
  for (let i = 0; i < clean.length; i += 500) {
    const slice = clean.slice(i, i + 500);
    const { data, error } = await supabase
      .from('financeiro_pagamentos_linhas')
      .select('unique_hash,status,pago_em')
      .in('unique_hash', slice);
    if (error) {
      console.warn('[Financeiro] Tabela financeiro_pagamentos_linhas indisponível:', error.message);
      return result;
    }
    (data || []).forEach((row) => {
      if (String(row.status || '').toUpperCase() === 'PAGO') result.set(row.unique_hash, row);
    });
  }
  return result;
}

async function syncPaidStatus(apuracao = {}) {
  const rows = apuracao.conferencia || [];
  const paid = await fetchAlreadyPaidMap(rows.map((row) => row.unique_hash));
  if (!paid.size) return apuracao;
  return {
    ...apuracao,
    conferencia: rows.map((row) => paid.has(row.unique_hash) ? { ...row, status_pagamento: 'PAGO', observacao: 'PAGO - bloqueado para evitar duplicidade' } : row)
  };
}

function groupNotasFiscaisResumo(rows = [], execucaoId = null) {
  const map = new Map();
  rows.forEach((row) => {
    const regional = row.coordenacao || row.supervisao || 'Sem regional';
    const destino = row.destino || 'Pagamento';
    const key = `${regional}|${destino}`;
    if (!map.has(key)) map.set(key, { pagamento_execucao_id: execucaoId, data_pagamento: new Date().toISOString().slice(0, 10), regional, destino, valor_total: 0, quantidade: 0, modulo_origem: 'FINANCEIRO' });
    const item = map.get(key);
    item.valor_total = roundNumber(item.valor_total + Number(row.valor || 0));
    item.quantidade += 1;
  });
  return Array.from(map.values());
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

// ── Sincronização automática com os agentes (Contas a Pagar/Receber) ───────
// Mapeia o dump bruto do ERP (campos pin*/rin*) para o mesmo formato que a
// importação manual de planilha já grava em financeiro_contas_pagar/receber,
// incluindo o mesmo cálculo de unique_hash — assim os dois caminhos convivem
// sem duplicar lançamentos e o fluxo de caixa (view) reflete tudo automaticamente.
function agentDateOnly(value) {
  if (!value) return null;
  return toDateISO(String(value).slice(0, 10));
}

function mapPagarFromAgente(d, fileTag) {
  const payload = {
    empresa: String(d?.scpName || '').trim() || null,
    situacao: d?.pinStatus === 'P' ? 'PAGO' : 'ABERTO',
    cod_grupo: String(d?.pinMainCode ?? '').trim() || null,
    data_lancamento: agentDateOnly(d?.pinDate),
    coordenacao: String(d?.olcName || '').trim() || null,
    supervisao: String(d?.olsName || '').trim() || null,
    favorecido: String(d?.favoredName || '').trim() || null,
    cnpj_cpf: String(d?.favoredDocument || '').trim() || null,
    identificacao: String(d?.pinDocNumber || '').trim() || null,
    categoria: String(d?.groupCategoryName || d?.picName || '').trim() || null,
    doc: String(d?.pinDocNumber || '').trim() || null,
    vencimento: agentDateOnly(d?.pinDueDate),
    parcela: d?.pinInstallmentTotal ? `${d.pinInstallmentNumber}/${d.pinInstallmentTotal}` : null,
    valor_pago: toNumber(d?.pinPaidValue),
    valor: toNumber(d?.pinTotalValue),
    usuario: String(d?.userName || '').trim() || null,
    data_cadastro: agentDateOnly(d?.pinRegisterDate),
    arquivo_origem: fileTag,
    raw: d
  };
  payload.unique_hash = hashText([payload.empresa, payload.cod_grupo, payload.favorecido, payload.doc, payload.vencimento, payload.parcela, payload.valor].join('|'));
  return payload;
}

function mapReceberFromAgente(d, fileTag) {
  const valor = toNumber(d?.rinTotalValue ?? d?.rinValue);
  const payload = {
    situacao: d?.rinStatus === 'P' ? 'PAGO' : 'ABERTO',
    codigo: String(d?.rinCode ?? '').trim() || null,
    fatura: String(d?.biiNumber ?? '').trim() || null,
    cliente: String(d?.cliName || '').trim() || null,
    conta: String(d?.baccFullName || d?.baccName || '').trim() || null,
    emissao_nf: agentDateOnly(d?.biiDate),
    vencimento: agentDateOnly(d?.rinDueDate),
    recebimento: agentDateOnly(d?.rinPaidDate),
    numero_nf: String(d?.biiNumber ?? '').trim() || null,
    valor,
    desconto: toNumber(d?.rinDiscount),
    juros: 0,
    valor_pago: d?.rinPaidDate ? valor : 0,
    arquivo_origem: fileTag,
    raw: d
  };
  payload.unique_hash = hashText([payload.codigo, payload.fatura, payload.cliente, payload.vencimento, payload.valor].join('|'));
  return payload;
}

function dedupByHash(rows) {
  const map = new Map();
  rows.forEach((row) => { if (row.unique_hash) map.set(row.unique_hash, row); });
  return [...map.values()];
}

async function buscarUltimoLoteAgente(tabela, limite) {
  const { data: maxRows, error: maxErr } = await supabase
    .from(tabela).select('created_at').order('created_at', { ascending: false }).limit(1);
  if (maxErr) throw maxErr;
  const maxCreatedAt = maxRows?.[0]?.created_at;
  if (!maxCreatedAt) return [];
  // o agente recarrega a tabela inteira a cada sincronização; pegamos só o lote mais recente
  // (margem de 5 min cobre a duração do próprio carregamento em lote).
  const threshold = new Date(new Date(maxCreatedAt).getTime() - 5 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from(tabela).select('dados_json').gte('created_at', threshold).limit(limite);
  if (error) throw error;
  return (data || []).map((row) => row.dados_json);
}

async function sincronizarContasAgente() {
  try {
    const [pagarRows, receberRows] = await Promise.all([
      buscarUltimoLoteAgente('grm_contas_pagar_importacoes', 8000),
      buscarUltimoLoteAgente('grm_contas_receber_importacoes', 20000),
    ]);

    const pagarPayload = dedupByHash(pagarRows
      .map((d) => mapPagarFromAgente(d, 'agente:grm_contas_pagar_importacoes'))
      .filter((row) => row.vencimento && (row.favorecido || row.doc || row.cod_grupo) && row.valor !== 0));
    const receberPayload = dedupByHash(receberRows
      .map((d) => mapReceberFromAgente(d, 'agente:grm_contas_receber_importacoes'))
      .filter((row) => row.vencimento && (row.codigo || row.fatura || row.cliente) && row.valor !== 0));

    const [savedPagar, savedReceber] = await Promise.all([
      upsertChunk('financeiro_contas_pagar', pagarPayload),
      upsertChunk('financeiro_contas_receber', receberPayload),
    ]);
    console.info(`[financeiro] sincronização automática: ${savedPagar} contas a pagar, ${savedReceber} contas a receber.`);
  } catch (error) {
    console.warn('[financeiro] falha na sincronização automática via agente', error);
  }
}

export function renderContent(content, userContext) {
  content.innerHTML = `
    <style>
      .fin-wrap{display:grid;gap:20px}.fin-hero{border:1px solid rgba(148,163,184,.18);border-radius:24px;padding:22px;background:linear-gradient(135deg,rgba(15,23,42,.96),rgba(22,101,52,.28));box-shadow:0 20px 50px rgba(2,6,23,.22)}
      .fin-hero h2{margin:0 0 6px;font-size:28px;color:#f8fafc}.fin-hero p{margin:0;color:#cbd5e1}.fin-actions-row{display:flex;gap:10px;flex-wrap:wrap;margin-top:16px}.fin-grid{display:grid;grid-template-columns:repeat(5,minmax(140px,1fr));gap:12px}.fin-kpi{border:1px solid rgba(148,163,184,.16);border-radius:20px;padding:16px;background:rgba(15,23,42,.86)}.fin-kpi span{display:block;color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:.08em}.fin-kpi strong{display:block;margin-top:8px;color:#f8fafc;font-size:22px}.fin-kpi small{color:#6b7280}.fin-card{border:1px solid rgba(148,163,184,.13);border-radius:24px;background:rgba(8,15,26,.75);padding:20px 22px;box-shadow:0 20px 50px rgba(2,6,23,.22);backdrop-filter:blur(10px)}
      .fin-head{display:flex;align-items:center;justify-content:space-between;gap:14px;margin-bottom:18px;padding-bottom:16px;border-bottom:1px solid rgba(148,163,184,.1)}.fin-head h3{margin:0;color:#f8fafc;font-size:17px;font-weight:700;letter-spacing:-.01em}.fin-head p{margin:3px 0 0;color:#64748b;font-size:13px}.pay-grid{display:grid;grid-template-columns:repeat(2,minmax(280px,1fr));gap:14px}.pay-card{border:1px solid rgba(148,163,184,.16);border-radius:22px;background:rgba(2,6,23,.34);padding:16px}.pay-card h4{margin:0 0 6px;color:#f8fafc;font-size:18px}.pay-card p{margin:0 0 14px;color:#6b7280}.pay-summary{display:grid;grid-template-columns:repeat(4,minmax(120px,1fr));gap:10px;margin:14px 0}.pay-mini{border:1px solid rgba(148,163,184,.14);border-radius:16px;padding:12px;background:rgba(15,23,42,.7)}.pay-mini span{display:block;color:#6b7280;font-size:11px;text-transform:uppercase;letter-spacing:.06em}.pay-mini strong{display:block;margin-top:5px;color:#f8fafc;font-size:18px}.pay-subtabs{display:flex;gap:8px;flex-wrap:wrap;margin:14px 0}.pay-subtab{border:1px solid rgba(148,163,184,.13);background:rgba(15,23,42,.5);color:#64748b;border-radius:10px;padding:7px 13px;cursor:pointer;font-size:13px;font-weight:600;transition:all .14s}.pay-subtab:hover{color:#e2e8f0;background:rgba(15,23,42,.85)}.pay-subtab.active{background:linear-gradient(135deg,#14532d,#166534);color:#fff;border-color:transparent;box-shadow:0 2px 8px rgba(22,101,52,.35)}.pay-table{display:none}.pay-table.active{display:block}@media(max-width:1100px){.pay-grid,.pay-summary{grid-template-columns:1fr 1fr}}@media(max-width:700px){.pay-grid,.pay-summary{grid-template-columns:1fr}}.fin-tabs{display:flex;gap:4px;flex-wrap:wrap}.fin-tab{border:1px solid rgba(148,163,184,.13);background:rgba(15,23,42,.5);color:#64748b;border-radius:10px;padding:8px 14px;cursor:pointer;font-size:13px;font-weight:600;transition:all .14s;letter-spacing:.01em}.fin-tab:hover{color:#e2e8f0;background:rgba(15,23,42,.85);border-color:rgba(148,163,184,.25)}.fin-tab.active{background:linear-gradient(135deg,#166534,#16a34a);color:#fff;border-color:transparent;font-weight:700;box-shadow:0 2px 10px rgba(22,101,52,.4)}.fin-panel{display:none}.fin-panel.active{display:block}.fin-form{display:grid;grid-template-columns:repeat(4,minmax(150px,1fr));gap:12px}.fin-field{display:grid;gap:6px}.fin-field.full{grid-column:1/-1}.fin-field label{font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:.06em}.fin-field input,.fin-field select,.fin-field textarea{width:100%;border:1px solid rgba(148,163,184,.18);border-radius:11px;background:rgba(15,23,42,.8);color:#e2e2f0;padding:10px 13px;color-scheme:dark;transition:border-color .14s}.fin-field input:focus,.fin-field select:focus,.fin-field textarea:focus{outline:0;border-color:rgba(52,211,153,.45);box-shadow:0 0 0 3px rgba(52,211,153,.08)}.fin-field textarea{min-height:78px;resize:vertical}.fin-table-wrap{overflow:auto;border-radius:18px;border:1px solid rgba(148,163,184,.14)}.fin-table{width:100%;border-collapse:collapse;min-width:860px}.fin-table th,.fin-table td{padding:12px 14px;border-bottom:1px solid rgba(148,163,184,.08);text-align:left;color:#e2e8f0;font-size:14px}.fin-table th{background:rgba(8,15,26,.96);color:#64748b;font-size:11px;text-transform:uppercase;letter-spacing:.08em;font-weight:700;position:sticky;top:0;z-index:1}.fin-table tbody tr:hover td{background:rgba(34,197,94,.05)}.fin-table tbody tr:nth-child(even) td{background:rgba(255,255,255,.015)}.fin-muted{display:block;color:#6b7280;font-size:12px;margin-top:3px}.fin-status{display:inline-flex;align-items:center;border-radius:999px;padding:5px 10px;font-size:12px;font-weight:800}.fin-status.ok{background:rgba(34,197,94,.14);color:#86efac}.fin-status.danger{background:rgba(239,68,68,.14);color:#fecaca}.fin-status.neutral{background:rgba(148,163,184,.14);color:#cbd5e1}.fin-import-grid{display:grid;grid-template-columns:repeat(2,minmax(260px,1fr));gap:14px}.fin-drop{border:1px dashed rgba(34,197,94,.35);border-radius:16px;padding:18px;background:rgba(22,101,52,.08);transition:border-color .14s,background .14s}.fin-drop:hover{border-color:rgba(34,197,94,.55);background:rgba(22,101,52,.14)}.pay-upload{border:1px dashed rgba(34,197,94,.45);border-radius:18px;background:rgba(22,101,52,.08);padding:14px;min-height:78px;display:flex;align-items:center;justify-content:center;text-align:center;cursor:pointer;transition:.16s ease}.pay-upload:hover,.pay-upload.dragging{border-color:#22c55e;background:rgba(22,101,52,.18);transform:translateY(-1px)}.pay-upload input{display:none}.pay-upload strong{display:block;color:#e2e2f0;font-size:13px}.pay-upload span{display:block;color:#6b7280;font-size:12px;margin-top:4px;word-break:break-word}.pay-upload.has-file{border-style:solid;background:rgba(34,197,94,.14)}.fin-feedback{color:#6b7280;font-size:13px}.fin-feedback.ok{color:#86efac}.fin-feedback.err{color:#fecaca}.fin-empty{text-align:center;color:#6b7280;padding:24px!important}.fin-small{padding:8px 12px!important;font-size:13px!important}@media(max-width:1100px){.fin-grid{grid-template-columns:repeat(2,1fr)}.fin-form,.fin-import-grid{grid-template-columns:1fr}}@media(max-width:700px){.fin-grid{grid-template-columns:1fr}.fin-head{display:grid}}

      .pay-mode-switch{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:16px}.pay-mode-btn{border:1px solid rgba(148,163,184,.15);background:rgba(15,23,42,.6);color:#6b7280;border-radius:12px;padding:11px 18px;font-weight:700;font-size:13px;cursor:pointer;transition:all .14s;letter-spacing:.02em}.pay-mode-btn:hover{color:#e2e8f0;background:rgba(15,23,42,.9)}.pay-mode-btn.active{background:linear-gradient(135deg,#166534,#16a34a);color:#fff;border-color:transparent;box-shadow:0 3px 12px rgba(22,101,52,.35)}.pay-mode-panel{display:none}.pay-mode-panel.active{display:block}.pay-toolbar{display:flex;align-items:end;justify-content:space-between;gap:14px;flex-wrap:wrap;margin:14px 0}.pay-filter-grid{display:grid;grid-template-columns:repeat(4,minmax(150px,1fr));gap:12px;align-items:end}.pay-status-toggle{display:inline-flex;align-items:stretch;min-width:168px;overflow:hidden;border:2px solid rgba(226,232,240,.78);border-radius:999px;background:#020617;box-shadow:inset 0 0 0 1px rgba(15,23,42,.75)}.pay-status-btn{flex:1;border:0;background:transparent;color:#e2e2f0;padding:9px 14px;font-weight:900;font-size:12px;letter-spacing:.02em;cursor:pointer;transition:background .16s ease,color .16s ease,transform .16s ease}.pay-status-btn + .pay-status-btn{border-left:2px solid rgba(226,232,240,.78)}.pay-status-btn:hover{filter:brightness(1.06)}.pay-status-btn.active-ok{background:linear-gradient(135deg,#16a34a,#22c55e);color:#052e16}.pay-status-btn.active-pendente{background:linear-gradient(135deg,#dc2626,#ef4444);color:#fff7f7}.pay-status-btn.is-inactive{background:#0d0d18;color:#cbd5e1}.pay-status-paid{display:inline-flex;align-items:center;justify-content:center;min-width:168px;padding:9px 14px;border-radius:999px;border:2px solid rgba(59,130,246,.4);background:linear-gradient(135deg,rgba(29,78,216,.25),rgba(59,130,246,.2));color:#bfdbfe;font-size:12px;font-weight:900;letter-spacing:.04em}.pay-footer{position:sticky;bottom:12px;z-index:2;margin-top:16px;border:1px solid rgba(34,197,94,.24);border-radius:20px;background:rgba(2,6,23,.94);backdrop-filter:blur(12px);padding:14px;display:flex;align-items:center;justify-content:space-between;gap:14px;box-shadow:0 18px 45px rgba(2,6,23,.38)}.pay-footer strong{display:block;color:#f8fafc}.pay-footer span{display:block;color:#6b7280;font-size:12px;margin-top:3px}.btn-pay-final{border:0;border-radius:16px;background:linear-gradient(135deg,#16a34a,#22c55e);color:#052e16;font-weight:1000;padding:14px 28px;cursor:pointer}.btn-pay-final:disabled{opacity:.45;cursor:not-allowed}.pay-note{border:1px solid rgba(59,130,246,.24);background:rgba(37,99,235,.10);border-radius:16px;padding:12px;color:#bfdbfe;font-size:13px}.fin-status.pendente{background:rgba(245,158,11,.14);color:#fde68a}.fin-status.pago{background:rgba(59,130,246,.14);color:#bfdbfe}@media(max-width:900px){.pay-filter-grid{grid-template-columns:1fr 1fr}.pay-footer{position:static;display:grid}.btn-pay-final{width:100%}}@media(max-width:620px){.pay-filter-grid{grid-template-columns:1fr}.pay-status-toggle,.pay-status-paid{min-width:138px}}.pay-search-panel{margin:14px 0;display:grid;grid-template-columns:minmax(260px,1fr) auto;gap:10px;align-items:end}.pay-search-field{display:grid;gap:6px}.pay-search-field label{font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:.06em}.pay-search-input{width:100%;border:1px solid rgba(148,163,184,.22);border-radius:14px;background:#0d0d18;color:#e2e2f0;padding:12px 14px;color-scheme:dark}.pay-search-count{color:#6b7280;font-size:12px;margin-top:4px}@media(max-width:620px){.pay-search-panel{grid-template-columns:1fr}}

      .fin-setor-filter{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0}.fin-setor-btn{border:1px solid rgba(148,163,184,.22);background:#08111f;color:#cbd5e1;border-radius:999px;padding:9px 14px;font-weight:900;cursor:pointer}.fin-setor-btn.active{background:#166534;color:#fff;border-color:#22c55e}.fin-text-block{white-space:pre-wrap;line-height:1.45}.fin-pay-actions{display:flex;gap:8px;flex-wrap:wrap}.fin-pay-actions a{text-decoration:none}

      .fin-pay-modal{position:fixed;inset:0;background:rgba(2,6,23,.72);z-index:9999;display:none;align-items:center;justify-content:center;padding:20px}.fin-pay-modal.open{display:flex}.fin-pay-modal-card{width:min(820px,100%);max-height:90vh;overflow:auto;border:1px solid rgba(148,163,184,.22);border-radius:22px;background:#15152a;color:#e2e2f0;padding:20px;box-shadow:0 24px 70px rgba(2,6,23,.45)}.fin-pay-preview{border:1px solid rgba(148,163,184,.16);border-radius:16px;background:rgba(15,23,42,.58);padding:14px}.mt-16{margin-top:16px}

      .cf-header{display:flex;align-items:center;flex-wrap:wrap;gap:10px;border:1px solid rgba(148,163,184,.12);border-radius:18px;padding:13px 18px;background:rgba(8,15,26,.72);backdrop-filter:blur(14px)}
      .cf-balance-block{display:flex;align-items:center;gap:12px;padding-right:14px;border-right:1px solid rgba(52,211,153,.15);flex-shrink:0}
      .cf-balance-label{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#6ee7b7;display:block}
      .cf-balance-value{font-size:24px;font-weight:900;color:#f8fafc;line-height:1;display:block;white-space:nowrap;letter-spacing:-.02em}
      .cf-balance-sub{font-size:10px;color:#475569;display:block;margin-top:1px}
      .cf-right-block{display:flex;align-items:center;gap:8px;flex:1;flex-wrap:wrap;justify-content:space-between}
      .cf-kpi-row{display:flex;gap:5px;flex-wrap:wrap}
      .cf-kpi-pill{border:0!important;border-radius:10px!important;padding:8px 11px!important;background:rgba(15,23,42,.65)!important;transition:background .14s}
      .cf-kpi-pill:hover{background:rgba(15,23,42,.9)!important}
      .cf-kpi-pill span{display:block;color:#64748b;font-size:10px;text-transform:uppercase;letter-spacing:.08em;font-weight:700}
      .cf-kpi-pill strong{display:block;margin-top:2px;color:#f8fafc;font-size:15px;font-weight:900}
      .cf-kpi-pill small{display:none}
      .cf-kpi-pill.cf-receber strong{color:#86efac}
      .cf-kpi-pill.cf-pagar strong{color:#fca5a5}
      .cf-kpi-pill.cf-projected small.ok-label{color:#4ade80}
      .cf-kpi-pill.cf-projected small.danger-label{color:#f87171}
      .cf-actions-row{display:flex;gap:6px;flex-wrap:wrap}
      .cf-flow-mini{display:grid;grid-template-columns:repeat(3,1fr) 2fr;gap:12px;margin-bottom:18px;padding:16px;border:1px solid rgba(148,163,184,.1);border-radius:16px;background:rgba(8,15,26,.5);backdrop-filter:blur(8px)}
      .cf-flow-mini-item{display:flex;flex-direction:column;gap:4px}
      .cf-flow-mini-item .cf-fm-label{font-size:10px;text-transform:uppercase;letter-spacing:.09em;color:#64748b;font-weight:700}
      .cf-flow-mini-item .cf-fm-val{font-size:20px;font-weight:900;color:#f8fafc}
      .cf-flow-mini-item.cf-fm-receber .cf-fm-val{color:#86efac}
      .cf-flow-mini-item.cf-fm-pagar .cf-fm-val{color:#fca5a5}
      .cf-flow-mini-item.cf-fm-liquido .cf-fm-val{color:#93c5fd}
      .cf-flow-bar-wrap{display:flex;flex-direction:column;justify-content:center;gap:6px}
      .cf-flow-bar-label{font-size:10px;text-transform:uppercase;letter-spacing:.09em;color:#64748b;font-weight:700}
      .cf-flow-bar-track{height:8px;border-radius:999px;background:rgba(148,163,184,.1);overflow:hidden;display:flex}
      .cf-flow-bar-recv{height:100%;background:linear-gradient(90deg,#16a34a,#4ade80);transition:width .4s ease}
      .cf-flow-bar-pay{height:100%;background:linear-gradient(90deg,#dc2626,#f87171);transition:width .4s ease}
      @media(max-width:900px){.cf-balance-block{border-right:none;border-bottom:1px solid rgba(52,211,153,.12);padding-right:0;padding-bottom:10px;width:100%}.cf-flow-mini{grid-template-columns:repeat(2,1fr)}}
      @media(max-width:640px){.cf-flow-mini{grid-template-columns:1fr 1fr}}

      .dash-kpi-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:18px}.dash-kpi-card{border-radius:22px;padding:20px;display:flex;align-items:center;gap:16px;border:1px solid rgba(148,163,184,.16);transition:transform .18s,box-shadow .18s}.dash-kpi-card:hover{transform:translateY(-3px);box-shadow:0 24px 50px rgba(2,6,23,.3)}.dash-kpi-saldo{background:linear-gradient(135deg,rgba(6,78,59,.55),rgba(4,47,46,.4));border-color:rgba(52,211,153,.22)}.dash-kpi-receber{background:linear-gradient(135deg,rgba(76,29,149,.5),rgba(46,16,101,.4));border-color:rgba(167,139,250,.22)}.dash-kpi-pagar{background:linear-gradient(135deg,rgba(127,29,29,.5),rgba(69,10,10,.4));border-color:rgba(252,165,165,.22)}.dash-kpi-projetado{background:linear-gradient(135deg,rgba(120,53,15,.5),rgba(69,26,3,.4));border-color:rgba(253,186,116,.22)}.dash-kpi-icon-wrap{width:48px;height:48px;border-radius:14px;display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0}.dash-kpi-saldo .dash-kpi-icon-wrap{background:rgba(52,211,153,.18)}.dash-kpi-receber .dash-kpi-icon-wrap{background:rgba(167,139,250,.18)}.dash-kpi-pagar .dash-kpi-icon-wrap{background:rgba(252,165,165,.18)}.dash-kpi-projetado .dash-kpi-icon-wrap{background:rgba(253,186,116,.18)}.dash-kpi-info{flex:1;min-width:0}.dash-kpi-label{display:block;font-size:11px;text-transform:uppercase;letter-spacing:.1em;color:#6b7280;font-weight:700}.dash-kpi-value{display:block;font-size:22px;font-weight:900;color:#f8fafc;margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.dash-kpi-change{display:inline-flex;align-items:center;gap:4px;font-size:12px;font-weight:700;margin-top:5px;padding:3px 8px;border-radius:999px}.dash-kpi-change.up{background:rgba(34,197,94,.15);color:#86efac}.dash-kpi-change.down{background:rgba(239,68,68,.15);color:#fca5a5}.dash-kpi-change.neutral{background:rgba(148,163,184,.12);color:#6b7280}.dash-charts-row{display:grid;grid-template-columns:1.5fr 1fr;gap:16px;margin-bottom:18px}.dash-chart-card{border:1px solid rgba(148,163,184,.16);border-radius:22px;background:rgba(15,23,42,.82);padding:20px}.dash-chart-card h3{margin:0;color:#f8fafc;font-size:16px}.dash-chart-card p{margin:3px 0 14px;color:#64748b;font-size:12px}.dash-chart-inner{position:relative;height:220px}.dash-bottom-row{display:grid;grid-template-columns:1fr;gap:16px}.dash-transactions-card{border:1px solid rgba(148,163,184,.16);border-radius:22px;background:rgba(15,23,42,.82);padding:20px}.dash-section-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:14px}.dash-section-head h3{margin:0;color:#f8fafc;font-size:16px}.dash-tx-list{display:flex;flex-direction:column;gap:2px}.dash-tx-row{display:grid;grid-template-columns:36px 1fr auto auto;align-items:center;gap:12px;padding:10px 12px;border-radius:12px;transition:background .14s}.dash-tx-row:hover{background:rgba(255,255,255,.04)}.dash-tx-icon{width:36px;height:36px;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:900;flex-shrink:0}.dash-tx-icon.receber{background:rgba(52,211,153,.14);color:#34d399}.dash-tx-icon.pagar{background:rgba(252,165,165,.14);color:#f87171}.dash-tx-name{font-weight:600;color:#e2e8f0;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.dash-tx-sub{font-size:12px;color:#64748b;margin-top:1px}.dash-tx-date{font-size:12px;color:#64748b;text-align:right;white-space:nowrap}.dash-tx-value{font-weight:700;font-size:14px;text-align:right;white-space:nowrap}.dash-tx-value.receber{color:#86efac}.dash-tx-value.pagar{color:#fca5a5}.dash-loading{text-align:center;color:#64748b;padding:32px;font-size:14px}@media(max-width:1100px){.dash-kpi-grid{grid-template-columns:1fr 1fr}.dash-charts-row{grid-template-columns:1fr}}@media(max-width:640px){.dash-kpi-grid{grid-template-columns:1fr}}
      .spay-items{display:flex;flex-direction:column;gap:2px;margin-bottom:5px;font-size:13px;color:#e2e8f0}
      .spay-meta{font-size:13px;color:#e2e8f0;margin-top:3px;display:flex;align-items:baseline;gap:5px}
      .spay-meta-label{color:#64748b;font-size:10px;text-transform:uppercase;letter-spacing:.08em;font-weight:700;flex-shrink:0}
      .spay-link{color:#38bdf8;text-decoration:none;word-break:break-all}
      .spay-link:hover{text-decoration:underline}
      .spay-dados-details{margin-top:3px}
      .spay-dados-details summary{cursor:pointer;font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:.06em;font-weight:700;list-style:none}
      .spay-dados-details summary::-webkit-details-marker{display:none}
      .spay-dados-details summary:before{content:'▸ ';font-size:10px}
      .spay-dados-details[open] summary:before{content:'▾ '}
      .spay-dados-details .spay-meta{margin-top:4px;max-width:520px;word-break:break-word}
      .spay-empty{color:#64748b;font-size:13px}
      .fin-btn-recusar{border:1px solid rgba(220,38,38,.3);background:rgba(220,38,38,.1);color:#fca5a5;border-radius:10px;padding:7px 12px;font-size:12px;font-weight:700;cursor:pointer;transition:all .14s;white-space:nowrap}
      .fin-btn-recusar:hover{background:rgba(220,38,38,.22);border-color:rgba(220,38,38,.5);color:#fecaca}
      .fin-det-filters{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px;align-items:center}
      .fin-det-filters select,.fin-det-filters input{border:1px solid rgba(148,163,184,.18);border-radius:10px;background:rgba(15,23,42,.8);color:#e5e7eb;padding:8px 12px;font-size:13px;color-scheme:dark;transition:border-color .14s;outline:0}
      .fin-det-filters select:focus,.fin-det-filters input:focus{border-color:rgba(52,211,153,.45);box-shadow:0 0 0 3px rgba(52,211,153,.08)}
      .det-th-sort{cursor:pointer;user-select:none;white-space:nowrap;transition:color .14s}
      .det-th-sort:hover{color:#e2e8f0!important}
      .det-th-active{color:#34d399!important}
      .det-sort-icon{margin-left:4px;opacity:.6;font-size:10px}
      .det-th-active .det-sort-icon{opacity:1;color:#34d399}
      .adiant-subtab{border:1px solid rgba(148,163,184,.13);background:rgba(15,23,42,.5);color:#64748b;border-radius:10px;padding:7px 13px;cursor:pointer;font-size:13px;font-weight:600;transition:all .14s}.adiant-subtab:hover{color:#e2e8f0;background:rgba(15,23,42,.85)}.adiant-subtab.active{background:linear-gradient(135deg,#14532d,#166534);color:#fff;border-color:transparent;box-shadow:0 2px 8px rgba(22,101,52,.35)}.adiant-table{display:none}.adiant-table.active{display:block}
      .adiant-th-sort{cursor:pointer;user-select:none;white-space:nowrap;transition:color .14s}
      .adiant-th-sort:hover{color:#e2e8f0!important}
      .adiant-th-active{color:#34d399!important}
      .adiant-sort-icon{margin-left:4px;opacity:.6;font-size:10px}
      .adiant-th-active .adiant-sort-icon{opacity:1;color:#34d399}
      .hist-colab-card{border:1px solid rgba(148,163,184,.16);border-radius:18px;background:rgba(15,23,42,.6);padding:16px;margin-bottom:14px}
      .hist-colab-head{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;padding-bottom:0;border-bottom:0;cursor:pointer;user-select:none}
      .hist-colab-card.expanded .hist-colab-head{margin-bottom:14px;padding-bottom:12px;border-bottom:1px solid rgba(148,163,184,.1)}
      .hist-colab-name{font-size:15px;font-weight:800;color:#f8fafc;display:flex;align-items:center;gap:8px}
      .hist-colab-toggle{display:inline-block;font-size:11px;color:#6b7280;transition:transform .16s ease}
      .hist-colab-card.expanded .hist-colab-toggle{transform:rotate(90deg)}
      .hist-colab-meta{display:flex;gap:18px;flex-wrap:wrap}
      .hist-colab-meta span{display:block;font-size:10px;color:#6b7280;text-transform:uppercase;letter-spacing:.06em}
      .hist-colab-meta strong{display:block;margin-top:2px;font-size:15px;color:#f8fafc}
      .hist-cal-row{display:none;gap:16px;flex-wrap:wrap}
      .hist-colab-card.expanded .hist-cal-row{display:flex}
      .hist-cal{width:238px}
      .hist-cal-title{font-size:12px;font-weight:700;color:#9fb7aa;text-transform:capitalize;margin-bottom:6px;text-align:center}
      .hist-cal-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:3px}
      .hist-cal-dow{font-size:9px;color:#475569;text-align:center;font-weight:700;padding-bottom:2px}
      .hist-cal-day{min-height:34px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;border-radius:6px;font-size:11px;color:#475569;background:rgba(255,255,255,.02)}
      .hist-cal-day .d{font-weight:700;line-height:1}
      .hist-cal-day .v{font-size:8px;line-height:1;opacity:.85}
      .hist-cal-day.paid{background:linear-gradient(135deg,#16a34a,#22c55e);color:#052e16}
      .hist-cal-day.recusado{background:linear-gradient(135deg,#dc2626,#ef4444);color:#fff7f7}
      .hist-cal-day.removido{background:linear-gradient(135deg,#475569,#64748b);color:#f1f5f9}
      .hist-cal-day.blank{background:transparent}
      .fin-tab-icon{margin-left:auto;border:1px solid rgba(148,163,184,.13);background:rgba(15,23,42,.5);color:#9fb7aa;border-radius:10px;width:36px;height:36px;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;font-size:16px;transition:all .14s}
      .fin-tab-icon:hover{color:#fff;background:linear-gradient(135deg,#166534,#16a34a);border-color:transparent}
      .ajustes-subtab{border:1px solid rgba(148,163,184,.13);background:rgba(15,23,42,.5);color:#64748b;border-radius:10px;padding:7px 13px;cursor:pointer;font-size:13px;font-weight:600;transition:all .14s}
      .ajustes-subtab:hover{color:#e2e8f0;background:rgba(15,23,42,.85)}
      .ajustes-subtab.active{background:linear-gradient(135deg,#14532d,#166534);color:#fff;border-color:transparent;box-shadow:0 2px 8px rgba(22,101,52,.35)}
      .ajustes-panel{display:none}
      .ajustes-panel.active{display:block}
    </style>
    <section class="fin-wrap">
      <div class="cf-header">
        <div class="cf-balance-block">
          <div class="cf-balance-label">Saldo do dia</div>
          <div class="cf-balance-value" id="kpiSaldo">R$ 0,00</div>
          <div class="cf-balance-sub">Manual · hoje</div>
        </div>
        <div class="cf-right-block">
          <div class="cf-kpi-row">
            <article class="fin-kpi cf-kpi-pill cf-receber"><span>A Receber</span><strong id="kpiReceber">R$ 0,00</strong><small>–</small></article>
            <article class="fin-kpi cf-kpi-pill cf-pagar"><span>A Pagar</span><strong id="kpiPagar">R$ 0,00</strong><small>–</small></article>
            <article class="fin-kpi cf-kpi-pill"><span>Provisão</span><strong id="kpiProvisao">R$ 0,00</strong><small>–</small></article>
            <article class="fin-kpi cf-kpi-pill cf-projected"><span>Saldo Projetado</span><strong id="kpiProjetado">R$ 0,00</strong><small id="kpiStatus">OK</small></article>
          </div>
        </div>
      </div>

      <article class="fin-card">
        <div class="fin-head">
          <div><h3>Fluxo de Caixa</h3><p>Selecione uma visão do módulo financeiro.</p></div>
          <div class="fin-tabs">
            <button class="fin-tab active" data-tab="dashboard" type="button">Dashboard</button>
            <button class="fin-tab" data-tab="fluxo" type="button">Fluxo</button>
            <button class="fin-tab" data-tab="despesas" type="button">Despesas</button>
            <button class="fin-tab" data-tab="pagamentos" type="button">Pagamentos</button>
            <button class="fin-tab" data-tab="notas-fiscais" type="button">Notas Fiscais</button>
            <button class="fin-tab" data-tab="ajustes" type="button">Ajustes</button>
            <button class="fin-tab-icon" id="btnReload" type="button" title="Atualizar fluxo">↻</button>
          </div>
        </div>

        <div class="fin-panel active" id="tab-dashboard">
          <div class="dash-kpi-grid">
            <div class="dash-kpi-card dash-kpi-saldo">
              <div class="dash-kpi-icon-wrap">💼</div>
              <div class="dash-kpi-info">
                <span class="dash-kpi-label">Saldo do Mês</span>
                <strong class="dash-kpi-value" id="dKpiSaldo">–</strong>
                <span class="dash-kpi-change neutral" id="dKpiSaldoChange">–</span>
              </div>
            </div>
            <div class="dash-kpi-card dash-kpi-receber">
              <div class="dash-kpi-icon-wrap">📈</div>
              <div class="dash-kpi-info">
                <span class="dash-kpi-label">A Receber (mês)</span>
                <strong class="dash-kpi-value" id="dKpiReceber">–</strong>
                <span class="dash-kpi-change neutral" id="dKpiReceberChange">–</span>
              </div>
            </div>
            <div class="dash-kpi-card dash-kpi-pagar">
              <div class="dash-kpi-icon-wrap">📉</div>
              <div class="dash-kpi-info">
                <span class="dash-kpi-label">A Pagar (mês)</span>
                <strong class="dash-kpi-value" id="dKpiPagar">–</strong>
                <span class="dash-kpi-change neutral" id="dKpiPagarChange">–</span>
              </div>
            </div>
            <div class="dash-kpi-card dash-kpi-projetado">
              <div class="dash-kpi-icon-wrap">🎯</div>
              <div class="dash-kpi-info">
                <span class="dash-kpi-label">Saldo Projetado</span>
                <strong class="dash-kpi-value" id="dKpiProjetado">–</strong>
                <span class="dash-kpi-change neutral" id="dKpiProjetadoChange">–</span>
              </div>
            </div>
          </div>
          <div class="dash-charts-row">
            <div class="dash-chart-card">
              <h3>Despesas Diárias</h3>
              <p>Próximos 15 dias</p>
              <div class="dash-chart-inner"><canvas id="dashLineChart"></canvas></div>
            </div>
            <div class="dash-chart-card">
              <h3>Categorias de Despesas</h3>
              <p>Últimos 90 dias</p>
              <div class="dash-chart-inner"><canvas id="dashDonutChart"></canvas></div>
            </div>
          </div>
          <div class="dash-bottom-row">
            <div class="dash-transactions-card">
              <div class="dash-section-head">
                <h3>Vencimentos de Hoje</h3>
                <button class="btn btn-secondary fin-small" data-tab-target="fluxo" type="button">Ver todos</button>
              </div>
              <div id="dashTransactions" class="dash-tx-list"><div class="dash-loading">Carregando...</div></div>
            </div>
          </div>
        </div>

        <div class="fin-panel" id="tab-fluxo">
          <div id="fluxoListaView">
            <div class="cf-flow-mini" id="cfFlowMini" style="display:none">
              <div class="cf-flow-mini-item cf-fm-receber">
                <span class="cf-fm-label">Total Receber</span>
                <span class="cf-fm-val" id="cfFmReceber">R$ 0,00</span>
              </div>
              <div class="cf-flow-mini-item cf-fm-pagar">
                <span class="cf-fm-label">Total Pagar</span>
                <span class="cf-fm-val" id="cfFmPagar">R$ 0,00</span>
              </div>
              <div class="cf-flow-mini-item cf-fm-liquido">
                <span class="cf-fm-label">Fluxo Líquido</span>
                <span class="cf-fm-val" id="cfFmLiquido">R$ 0,00</span>
              </div>
              <div class="cf-flow-bar-wrap">
                <span class="cf-flow-bar-label">Receber vs Pagar</span>
                <div class="cf-flow-bar-track">
                  <div class="cf-flow-bar-recv" id="cfBarRecv" style="width:50%"></div>
                  <div class="cf-flow-bar-pay" id="cfBarPay" style="width:50%"></div>
                </div>
              </div>
            </div>
            <form class="fin-form" id="periodForm">
              <div class="fin-field"><label>Data inicial</label><input id="filterInicio" type="date" value="${esc(state.filters.inicio)}"></div>
              <div class="fin-field"><label>Data final</label><input id="filterFim" type="date" value="${esc(state.filters.fim)}"></div>
              <div class="fin-field"><label>&nbsp;</label><button class="btn btn-primary" type="submit">Aplicar período</button></div>
            </form>
            <br>
            <div class="fin-table-wrap"><table class="fin-table"><thead><tr><th>Data</th><th>Saldo do dia</th><th>Receber</th><th>Pagar</th><th>Provisão</th><th>Saldo projetado</th><th>Status</th><th>Ação</th></tr></thead><tbody id="fluxoTbody"><tr><td colspan="8" class="fin-empty">Carregando...</td></tr></tbody></table></div>
          </div>

          <div id="fluxoDetalhesView" style="display:none">
            <div class="fin-head">
              <div><h3>Detalhes do dia selecionado</h3><p id="detalhesData">Selecione uma data no fluxo.</p></div>
              <button class="btn btn-secondary" id="btnVoltarFluxo" type="button">← Voltar</button>
            </div>
            <div class="fin-det-filters">
              <select id="detFiltroTipo"><option value="">Tipo</option><option value="Receber">Receber</option><option value="Pagar">Pagar</option></select>
              <select id="detFiltroSituacao"><option value="">Situação</option><option value="Recebida">Recebida</option><option value="A vencer">A vencer</option><option value="Vencida">Vencida</option><option value="Paga">Paga</option></select>
              <input type="text" id="detFiltroFavorecido" placeholder="Favorecido...">
              <input type="text" id="detFiltroDoc" placeholder="Documento...">
            </div>
            <div class="fin-table-wrap"><table class="fin-table"><thead><tr>
              <th data-det-sort="tipo" class="det-th-sort">Tipo <span class="det-sort-icon">↕</span></th>
              <th data-det-sort="situacao" class="det-th-sort">Situação <span class="det-sort-icon">↕</span></th>
              <th data-det-sort="nome" class="det-th-sort">Nome/Favorecido <span class="det-sort-icon">↕</span></th>
              <th data-det-sort="doc" class="det-th-sort">Documento <span class="det-sort-icon">↕</span></th>
              <th data-det-sort="valor" class="det-th-sort">Valor <span class="det-sort-icon">↕</span></th>
              <th data-det-sort="vencimento" class="det-th-sort">Vencimento <span class="det-sort-icon">↕</span></th>
            </tr></thead><tbody id="detalhesTbody"><tr><td colspan="6" class="fin-empty">Nenhuma data selecionada.</td></tr></tbody></table></div>
          </div>
        </div>

        <div class="fin-panel" id="tab-ajustes">
          <div class="fin-head"><div><h3>Ajustes</h3><p>Saldo e provisão manual, e importação de relatórios (contingência).</p></div></div>
          <div class="pay-subtabs">
            <button class="ajustes-subtab active" data-ajustes-tab="saldo" type="button">Saldo e Provisão</button>
            <button class="ajustes-subtab" data-ajustes-tab="importar" type="button">Importar relatórios</button>
          </div>

          <div class="ajustes-panel active" id="ajustes-saldo">
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

          <div class="ajustes-panel" id="ajustes-importar">
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
        </div>


        <div class="fin-panel" id="tab-despesas">
          <div class="fin-head">
            <div><h3>Despesas</h3><p>Adiantamentos e pagamentos de diária/almoço ficam concentrados aqui.</p></div>
          </div>

          <div class="pay-mode-switch">
            <button class="pay-mode-btn active" data-pay-mode="adiantamentos" type="button">ADIANTAMENTOS</button>
            <button class="pay-mode-btn" data-pay-mode="almoco" type="button">REFEIÇÕES</button>
            <button class="pay-mode-btn" data-pay-mode="diarias" type="button">DIÁRIAS</button>
          </div>

          <section class="pay-card pay-mode-panel active" id="pay-mode-adiantamentos">
            <h4>ADIANTAMENTOS</h4>
            <p>Solicitações de Caixa Operacional sincronizadas automaticamente do GRM (agente sync-adiantamentos, a cada 15min). Marque ✓ para incluir no pagamento ou ✗ para recusar (motivo fica no histórico).</p>
            <div class="pay-filter-grid">
              <div class="fin-field"><label>&nbsp;</label><button class="btn btn-secondary" id="btnAtualizarAdiantamentos" type="button">↻ Atualizar</button></div>
              <div class="fin-field full"><label>&nbsp;</label><span id="fbAdiantamentos" class="fin-feedback"></span></div>
            </div>

            <div class="pay-summary">
              <div class="pay-mini"><span>Pendentes</span><strong id="adiantPendentes">0</strong></div>
              <div class="pay-mini"><span>Selecionados ✓</span><strong id="adiantSelecionados">0</strong></div>
              <div class="pay-mini"><span>Total selecionado</span><strong id="adiantTotalSelecionado">R$ 0,00</strong></div>
              <div class="pay-mini"><span>Recusados</span><strong id="adiantRecusados">0</strong></div>
            </div>

            <div class="pay-note">Somente linhas marcadas com <strong>✓</strong> entram no botão <strong>PAGAR</strong>. Ao pagar, recusar (motivo obrigatório) ou sair da lista de pendentes do GRM (resolvido direto por lá), a linha sai daqui e vai para <strong>Histórico de Pagamentos</strong> — evita pagamento duplicado.</div>

            <div class="pay-subtabs">
              <button class="adiant-subtab active" data-adiant-tab="ativos" type="button">Solicitações</button>
              <button class="adiant-subtab" data-adiant-tab="historico" type="button">Histórico de Pagamentos</button>
            </div>

            <div class="adiant-table active" id="adiant-ativos">
              <div class="fin-table-wrap">
                <table class="fin-table">
                  <thead><tr>
                    <th data-adiant-sort="data_solicitacao" class="adiant-th-sort">Data <span class="adiant-sort-icon">↕</span></th>
                    <th data-adiant-sort="colaborador" class="adiant-th-sort">Colaborador <span class="adiant-sort-icon">↕</span></th>
                    <th data-adiant-sort="coordenacao" class="adiant-th-sort">Coordenação <span class="adiant-sort-icon">↕</span></th>
                    <th data-adiant-sort="supervisao" class="adiant-th-sort">Supervisão <span class="adiant-sort-icon">↕</span></th>
                    <th data-adiant-sort="valor" class="adiant-th-sort">Valor <span class="adiant-sort-icon">↕</span></th>
                    <th data-adiant-sort="saldo" class="adiant-th-sort">Saldo <span class="adiant-sort-icon">↕</span></th>
                    <th data-adiant-sort="embarque" class="adiant-th-sort">Embarque <span class="adiant-sort-icon">↕</span></th>
                    <th data-adiant-sort="leitura_mais_antiga" class="adiant-th-sort">Leitura <span class="adiant-sort-icon">↕</span></th>
                    <th data-adiant-sort="descricao" class="adiant-th-sort">Descrição <span class="adiant-sort-icon">↕</span></th>
                    <th>Ação</th>
                  </tr></thead>
                  <tbody id="adiantTbody"><tr><td colspan="10" class="fin-empty">Carregando...</td></tr></tbody>
                </table>
              </div>

              <div class="pay-footer">
                <div><strong id="adiantFooterTotal">Total pronto para pagar: R$ 0,00</strong><span id="adiantFooterHint">Marque ✓ nas solicitações para liberar o botão.</span></div>
                <button class="btn-pay-final" id="btnPagarAdiantamentos" type="button" disabled>PAGAR</button>
              </div>
            </div>

            <div class="adiant-table" id="adiant-historico">
              <input id="histColaboradorFiltro" class="pay-search-input" type="search" placeholder="Filtrar por colaborador..." style="margin-bottom:14px">
              <div id="adiantHistoricoContent"><div class="fin-empty">Nenhum pagamento registrado ainda.</div></div>
            </div>
          </section>

          <section class="pay-card pay-mode-panel" id="pay-mode-almoco">
            <h4>REFEIÇÕES</h4>
            <p>Colaboradores identificados automaticamente pelo relatório de login do GRM, a até 1km de um Local de Embarque, classificados pela coluna <strong>Tipo</strong> conforme o horário do login: <strong>Café</strong> 06:00-07:30, <strong>Almoço</strong> 11:00-12:30, <strong>Janta</strong> 19:00-20:30 (agente sync-login-alimentacao). Marque cada linha como OK ou PENDENTE antes de pagar.</p>
            <div class="pay-filter-grid">
              <div class="fin-field"><label>Data</label><input id="almocoData" type="date" value="${esc(state.currentDate)}"></div>
              <div class="fin-field"><label>Status padrão</label><select id="payDefaultStatus"><option value="OK" selected>OK</option><option value="PENDENTE">PENDENTE</option></select></div>
              <div class="fin-field"><label>&nbsp;</label><button class="btn btn-primary" id="btnGerarAlmoco" type="button">Consultar</button></div>
              <div class="fin-field full"><span id="fbAlimentacao" class="fin-feedback"></span></div>
            </div>

            <div class="pay-summary">
              <div class="pay-mini"><span>Tipo</span><strong id="payTipo">-</strong></div>
              <div class="pay-mini"><span>Período</span><strong id="payPeriodo">-</strong></div>
              <div class="pay-mini"><span>Registros OK</span><strong id="payRegistros">0</strong></div>
              <div class="pay-mini"><span>Total OK</span><strong id="payTotal">R$ 0,00</strong></div>
            </div>

            <div class="pay-note">Somente linhas marcadas como <strong>OK</strong> entram no botão <strong>PAGAR</strong>. Linhas <strong>PENDENTES</strong> permanecem para o financeiro resolver depois. Linhas <strong>PAGO</strong> são bloqueadas para evitar duplicidade.</div>

            <div class="pay-search-panel">
              <div class="pay-search-field">
                <label>Pesquisar colaborador para bloquear</label>
                <input id="payColaboradorFiltro" class="pay-search-input" type="search" placeholder="Digite nome, CPF, supervisão ou destino">
                <span id="payFiltroInfo" class="pay-search-count">Mostrando todos os colaboradores.</span>
              </div>
              <button class="btn btn-secondary" id="btnLimparPayFiltro" type="button">Limpar filtro</button>
            </div>

            <div class="pay-toolbar">
              <div class="pay-subtabs">
                <button class="pay-subtab active" data-pay-tab="conferencia" type="button">Conferência</button>
                <button class="pay-subtab" data-pay-tab="flash" type="button">Flash</button>
                <button class="pay-subtab" data-pay-tab="ifood" type="button">iFood</button>
                <button class="pay-subtab" data-pay-tab="alelo" type="button">Alelo</button>
                <button class="pay-subtab" data-pay-tab="logs" type="button">Pendências</button>
                <button class="pay-subtab" data-pay-tab="historico" type="button">Histórico</button>
              </div>
              <div class="fin-actions-row">
                <button class="btn btn-secondary fin-small" id="btnExportarTudo" type="button">Exportar arquivos</button>
              </div>
            </div>

            <div class="pay-table active" id="pay-conferencia"><div class="fin-table-wrap"><table class="fin-table"><thead><tr><th>Status</th><th>Data</th><th>Colaborador</th><th>CPF</th><th>Destino</th><th>Tipo</th><th>Valor</th><th>Composição</th><th>Supervisão</th><th>Observação</th></tr></thead><tbody id="payConferenciaTbody"><tr><td colspan="10" class="fin-empty">Gere um pagamento para conferir.</td></tr></tbody></table></div></div>
            <div class="pay-table" id="pay-flash"><div class="fin-table-wrap"><table class="fin-table"><thead><tr><th>CPF</th><th>Nome</th><th>Valor</th></tr></thead><tbody id="payFlashTbody"><tr><td colspan="3" class="fin-empty">Nenhum arquivo Flash gerado.</td></tr></tbody></table></div></div>
            <div class="pay-table" id="pay-ifood"><div class="fin-table-wrap"><table class="fin-table"><thead><tr><th>CNPJ</th><th>Nome</th><th>CPF</th><th>Nascimento</th><th>Email</th><th>Celular</th><th>Centro de custo</th><th>Livre</th></tr></thead><tbody id="payIfoodTbody"><tr><td colspan="8" class="fin-empty">Nenhum arquivo iFood gerado.</td></tr></tbody></table></div></div>
            <div class="pay-table" id="pay-alelo"><div class="fin-table-wrap"><table class="fin-table"><thead><tr><th>Número de Série</th><th>CPF</th><th>Valor da Carga</th><th>Observação</th><th>Nome</th></tr></thead><tbody id="payAleloTbody"><tr><td colspan="5" class="fin-empty">Nenhum arquivo Alelo gerado.</td></tr></tbody></table></div></div>
            <div class="pay-table" id="pay-logs"><div class="fin-table-wrap"><table class="fin-table"><thead><tr><th>Data/Linha</th><th>Colaborador</th><th>Status</th><th>Mensagem</th></tr></thead><tbody id="payLogsTbody"><tr><td colspan="4" class="fin-empty">Nenhuma pendência.</td></tr></tbody></table></div></div>
            <div class="pay-table" id="pay-historico"><div class="fin-table-wrap"><table class="fin-table"><thead><tr><th>Data</th><th>Tipo</th><th>Colaborador</th><th>Coordenação</th><th>Supervisão</th><th>Local</th><th>Pago em</th></tr></thead><tbody id="payHistoricoTbody"><tr><td colspan="7" class="fin-empty">Carregando...</td></tr></tbody></table></div></div>

            <div class="pay-footer">
              <div><strong id="payFooterTotal">Total pronto para pagar: R$ 0,00</strong><span id="payFooterHint">Gere ou importe pagamentos para liberar o botão.</span></div>
              <button class="btn-pay-final" id="btnPagarBeneficios" type="button" disabled>PAGAR</button>
            </div>
          </section>

          <section class="pay-card pay-mode-panel" id="pay-mode-diarias">
            <h4>DIÁRIAS</h4>
            <p>Apuração automática: dias com colaborador <b>confirmado na Programação</b> × valor/dia do GRM (colaborador_cruzamento). Só Intermitente/Diarista — Efetivo não recebe diária. Confira e exporte; o pagamento em lote entra numa próxima fase.</p>
            <div class="pay-filter-grid">
              <div class="fin-field"><label>De</label><input id="diariasDe" type="date"></div>
              <div class="fin-field"><label>Até</label><input id="diariasAte" type="date"></div>
              <div class="fin-field"><label>&nbsp;</label><button class="btn btn-secondary" id="btnAtualizarDiarias" type="button">↻ Apurar</button></div>
              <div class="fin-field"><label>&nbsp;</label><button class="btn btn-secondary" id="btnExportarDiarias" type="button">⬇ Exportar CSV</button></div>
              <div class="fin-field full"><label>&nbsp;</label><span id="fbDiarias" class="fin-feedback"></span></div>
            </div>
            <div class="pay-summary">
              <div class="pay-mini"><span>Colaboradores</span><strong id="diariasColabs">0</strong></div>
              <div class="pay-mini"><span>Diárias no período</span><strong id="diariasQtd">0</strong></div>
              <div class="pay-mini"><span>Sem valor no GRM</span><strong id="diariasSemValor">0</strong></div>
              <div class="pay-mini"><span>Total apurado</span><strong id="diariasTotal">R$ 0,00</strong></div>
            </div>
            <div class="fin-table-wrap" style="overflow:auto">
              <table class="fin-table" style="min-width:760px">
                <thead><tr><th>Colaborador</th><th>Tipo</th><th>Supervisão</th><th>Dias</th><th>Valor/dia</th><th>Total</th></tr></thead>
                <tbody id="diariasBody"><tr><td colspan="6" class="fin-empty">Selecione o período e clique em Apurar.</td></tr></tbody>
              </table>
            </div>
          </section>
        </div>

        <div class="fin-panel" id="tab-pagamentos">
          <div class="fin-head">
            <div>
              <h3>Pagamentos solicitados pelos setores</h3>
              <p>Fila de despesas enviadas por Compras, Hospedagem, RH e outros módulos para o financeiro realizar o pagamento.</p>
            </div>
            <button class="btn btn-secondary" id="btnReloadSetorPagamentos" type="button">↻ Atualizar pagamentos</button>
          </div>

          <div class="fin-setor-filter" id="setorPagamentoFilter">
            <button class="fin-setor-btn active" data-setor-pay="todos" type="button">Todos</button>
            <button class="fin-setor-btn" data-setor-pay="COMPRAS" type="button">Compras</button>
            <button class="fin-setor-btn" data-setor-pay="HOSPEDAGEM" type="button">Hospedagem</button>
            <button class="fin-setor-btn" data-setor-pay="RH" type="button">RH</button>
            <button class="fin-setor-btn" data-setor-pay="AUDITORIA" type="button">Auditoria</button>
            <button class="fin-setor-btn" data-setor-pay="OUTROS" type="button">Outros</button>
          </div>

          <div class="fin-table-wrap">
            <table class="fin-table">
              <thead>
                <tr>
                  <th>Setor</th>
                  <th>Data/Hora</th>
                  <th>Gestor</th>
                  <th>Coordenação</th>
                  <th>Conteúdo</th>
                  <th>Valor</th>
                  <th>Status</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody id="setorPagamentosTbody">
                <tr><td colspan="8" class="fin-empty">Clique em Atualizar pagamentos.</td></tr>
              </tbody>
            </table>
          </div>
        </div>

        <div class="fin-panel" id="tab-notas-fiscais">
          <div class="fin-head">
            <div>
              <h3>Notas Fiscais</h3>
              <p>Sincronizado automaticamente pelo agente sync-notas-fiscais. Dados de faturamento por nota fiscal.</p>
            </div>
            <button class="btn btn-secondary" id="nfReloadBtn" type="button">↻ Atualizar</button>
          </div>

          <div class="pay-summary" id="nfSummary"></div>

          <div class="fin-form" style="margin:14px 0 0">
            <div class="fin-field">
              <label>Cliente</label>
              <input id="nfFiltroCliente" type="text" placeholder="Buscar cliente..." />
            </div>
            <div class="fin-field">
              <label>Situação</label>
              <select id="nfFiltroSituacao">
                <option value="">Todas</option>
                <option value="Paga">Paga</option>
                <option value="Aguardando Pagamento">Aguardando Pagamento</option>
              </select>
            </div>
          </div>

          <div class="fin-table-wrap mt-16">
            <table class="fin-table">
              <thead>
                <tr>
                  <th>N.F.</th><th>Data N.F.</th><th>Cliente</th><th>Coordenação</th>
                  <th>Tons</th><th>Valor Bruto</th><th>Imposto</th><th>Valor da N.F.</th><th>Situação</th>
                </tr>
              </thead>
              <tbody id="nfTbody">
                <tr><td colspan="9" class="fin-empty">Carregando...</td></tr>
              </tbody>
            </table>
          </div>
          <div class="fin-muted" id="nfPreviewNote"></div>
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
    const tab = String(window.location.hash || '').replace(/^#/, '').split('?')[0].toLowerCase();
    return ['dashboard', 'fluxo', 'despesas', 'pagamentos', 'notas-fiscais', 'ajustes'].includes(tab) ? tab : 'dashboard';
  }

  function payModeFromHash() {
    const query = String(window.location.hash || '').split('?')[1] || '';
    return new URLSearchParams(query).get('modo') || 'adiantamentos';
  }

  function mostrarFluxoLista() {
    const lista = document.getElementById('fluxoListaView');
    const det = document.getElementById('fluxoDetalhesView');
    if (lista) lista.style.display = '';
    if (det) det.style.display = 'none';
  }

  function mostrarFluxoDetalhes() {
    const lista = document.getElementById('fluxoListaView');
    const det = document.getElementById('fluxoDetalhesView');
    if (lista) lista.style.display = 'none';
    if (det) det.style.display = '';
  }

  function setAjustesTab(tab) {
    document.querySelectorAll('.ajustes-subtab').forEach((btn) => btn.classList.toggle('active', btn.dataset.ajustesTab === tab));
    document.querySelectorAll('.ajustes-panel').forEach((panel) => panel.classList.remove('active'));
    document.getElementById(`ajustes-${tab}`)?.classList.add('active');
  }

  function setTab(tab) {
    document.querySelectorAll('.fin-tab').forEach((btn) => btn.classList.toggle('active', btn.dataset.tab === tab));
    document.querySelectorAll('.fin-panel').forEach((panel) => panel.classList.remove('active'));
    document.getElementById(`tab-${tab}`)?.classList.add('active');
    if (tab === 'fluxo') mostrarFluxoLista();
    if (tab === 'despesas') setPayMode(payModeFromHash());
    if (tab === 'pagamentos') loadSetorPagamentos();
    if (tab === 'dashboard') loadDashboardData();
    if (tab === 'notas-fiscais' && !state.notasFiscaisLoaded) loadNotasFiscais();
  }

  // ── Notas Fiscais (sincronizado pelo agente sync-notas-fiscais) ───────────
  // Tela nova, somente leitura — não existia destino estruturado pra esse agente antes.
  async function loadNotasFiscais() {
    const tbody = document.getElementById('nfTbody');
    if (tbody) tbody.innerHTML = '<tr><td colspan="9" class="fin-empty">Carregando...</td></tr>';
    try {
      const { data: maxRows, error: maxErr } = await supabase
        .from('grm_notas_fiscais_importacoes').select('created_at').order('created_at', { ascending: false }).limit(1);
      if (maxErr) throw maxErr;
      const maxCreatedAt = maxRows?.[0]?.created_at;
      if (!maxCreatedAt) { state.notasFiscais = []; }
      else {
        // o agente recarrega a tabela inteira a cada sincronização; pegamos só o lote mais recente.
        const threshold = new Date(new Date(maxCreatedAt).getTime() - 5 * 60 * 1000).toISOString();
        const { data, error } = await supabase
          .from('grm_notas_fiscais_importacoes').select('dados_json').gte('created_at', threshold).limit(5000);
        if (error) throw error;
        state.notasFiscais = (data || []).map((row) => row.dados_json);
      }
      state.notasFiscaisLoaded = true;
    } catch (error) {
      console.warn('[financeiro] falha ao carregar notas fiscais do agente', error);
      state.notasFiscais = [];
    }
    renderNotasFiscais();
  }

  function notasFiscaisFiltradas() {
    const clienteFiltro = normalize(state.notasFiscaisFiltro.cliente);
    const situacaoFiltro = state.notasFiscaisFiltro.situacao;
    return state.notasFiscais.filter((nf) => {
      if (clienteFiltro && !normalize(nf?.Cliente).includes(clienteFiltro)) return false;
      if (situacaoFiltro && nf?.Situação !== situacaoFiltro) return false;
      return true;
    });
  }

  function renderNotasFiscais() {
    const tbody = document.getElementById('nfTbody');
    const summary = document.getElementById('nfSummary');
    const note = document.getElementById('nfPreviewNote');
    if (!tbody || !summary) return;

    const rows = notasFiscaisFiltradas();
    const valorBrutoTotal = rows.reduce((sum, nf) => sum + toNumber(nf?.['Valor Bruto']), 0);
    const valorNfTotal = rows.reduce((sum, nf) => sum + toNumber(nf?.['Valor da N.F.']), 0);
    const pagas = rows.filter((nf) => nf?.Situação === 'Paga').length;
    const aguardando = rows.filter((nf) => nf?.Situação === 'Aguardando Pagamento').length;

    summary.innerHTML = `
      <div class="pay-mini"><span>Total de N.F.</span><strong>${rows.length}</strong></div>
      <div class="pay-mini"><span>Valor Bruto</span><strong>${money(valorBrutoTotal)}</strong></div>
      <div class="pay-mini"><span>Valor da N.F.</span><strong>${money(valorNfTotal)}</strong></div>
      <div class="pay-mini"><span>Pagas / Aguardando</span><strong>${pagas} / ${aguardando}</strong></div>
    `;

    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="9" class="fin-empty">Nenhuma nota fiscal encontrada.</td></tr>';
      if (note) note.textContent = '';
      return;
    }

    const sorted = [...rows].sort((a, b) => String(b?.['Data N.F.'] || '').localeCompare(String(a?.['Data N.F.'] || '')));
    const preview = sorted.slice(0, 300);
    tbody.innerHTML = preview.map((nf) => `
      <tr>
        <td>${esc(nf?.['N.F.'] ?? '-')}</td>
        <td>${esc(nf?.['Data N.F.'] || '-')}</td>
        <td>${esc(nf?.Cliente || '-')}</td>
        <td>${esc(nf?.Coordenação || '-')}</td>
        <td>${esc(nf?.Tons ?? '-')}</td>
        <td>${money(toNumber(nf?.['Valor Bruto']))}</td>
        <td>${money(toNumber(nf?.Imposto))}</td>
        <td>${money(toNumber(nf?.['Valor da N.F.']))}</td>
        <td><span class="fin-status ${nf?.Situação === 'Paga' ? 'ok' : 'neutral'}">${esc(nf?.Situação || '-')}</span></td>
      </tr>
    `).join('');
    if (note) note.textContent = sorted.length > preview.length ? `Mostrando ${preview.length} de ${sorted.length} notas fiscais.` : '';
  }

  function filteredSetorPagamentos() {
    const filter = state.pagamentosSetorFilter || 'todos';
    if (filter === 'todos') return state.financeiroPagamentos || [];
    if (filter === 'OUTROS') {
      return (state.financeiroPagamentos || []).filter((row) => {
        const origem = normalize(row.origem || row.setor || row.modulo_origem);
        return !origem.includes('compra') && !origem.includes('hotel') && !origem.includes('hosped') && !origem.includes('auditoria') && origem !== 'rh' && !origem.includes('recursos humanos');
      });
    }
    return (state.financeiroPagamentos || []).filter((row) => {
      const origem = normalize(row.origem || row.setor || row.modulo_origem);
      return normalize(filter).split(' ').every((part) => origem.includes(part)) ||
        (filter === 'HOSPEDAGEM' && (origem.includes('hotel') || origem.includes('hosped'))) ||
        (filter === 'RH' && (origem === 'rh' || origem.includes('recursos humanos'))) ||
        (filter === 'AUDITORIA' && origem.includes('auditoria')); 
    });
  }

  function getGestorCoordenacao(row) {
    const gestor = row._gestor || row.gestor || row.solicitante || '';
    const coordenacao = row._coordenacao || row.coordenacao || '';
    if (gestor || coordenacao) return { gestor, coordenacao };
    const texto = String(row.descricao || row.conteudo || '');
    const gMatch = texto.match(/gestor:\s*(.+)/i);
    const cMatch = texto.match(/coordena[çc][ãa]o:\s*(.+)/i);
    return { gestor: gMatch ? gMatch[1].trim() : '', coordenacao: cMatch ? cMatch[1].trim() : '' };
  }

  function isLinkDados(value) {
    const s = String(value || '').trim();
    return /^https?:\/\//i.test(s) || /^[\w.-]+\.[a-z]{2,}(\/|$)/i.test(s);
  }

  function renderConteudoHtml(row) {
    const descricaoBase = row.descricao || row.conteudo || row.observacao || row.detalhes || '';
    const linhas = String(descricaoBase)
      .split(/\n+/)
      .map((l) => l.trim())
      .filter(Boolean)
      .filter((l) => !/^gestor\s*:/i.test(l))
      .filter((l) => !/^coordena[çc][ãa]o\s*:/i.test(l))
      .filter((l) => !/^forma\s*:/i.test(l))
      .filter((l) => !/^dados\s*:/i.test(l))
      .filter((l) => !/^tipo\s*:/i.test(l));

    const forma = row.forma_pagamento || '';
    const dados = row.dados_pagamento || row.link_pagamento || row.chave_pix || row.boleto_url || '';

    const parts = [];
    if (linhas.length) parts.push(`<div class="spay-items">${linhas.map((l) => esc(l)).join('<br>')}</div>`);
    if (forma) parts.push(`<div class="spay-meta"><span class="spay-meta-label">Forma:</span> ${esc(forma)}</div>`);
    if (dados) {
      // dados pode ser um bloco de várias linhas (link do produto + endereço
      // de entrega, um por linha) — linkifica só o trecho que é URL em cada
      // linha, em vez de tentar tratar o bloco inteiro como um link só.
      // Fica recolhido por padrão (details/summary) pra não estourar a
      // altura da linha da tabela com link grande + endereço.
      const dadosHtml = String(dados)
        .split(/\n+/)
        .map((linha) => {
          const m = linha.match(/https?:\/\/\S+/i);
          if (!m) return esc(linha);
          const url = m[0];
          const antes = linha.slice(0, m.index);
          const depois = linha.slice(m.index + url.length);
          return `${esc(antes)}<a class="spay-link" href="${esc(ensureHttps(url))}" target="_blank" rel="noopener">${esc(url)}</a>${esc(depois)}`;
        })
        .join('<br>');
      parts.push(`<details class="spay-dados-details"><summary>Ver dados${isLinkDados(dados) || /https?:\/\//i.test(dados) ? ' e link' : ''}</summary><div class="spay-meta">${dadosHtml}</div></details>`);
    }
    if (!parts.length) return `<span class="spay-empty">—</span>`;
    return parts.join('');
  }

  function renderSetorPagamentos() {
    const tbody = document.getElementById('setorPagamentosTbody');
    if (!tbody) return;
    const rows = filteredSetorPagamentos();
    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="8" class="fin-empty">Nenhum pagamento localizado para o filtro selecionado.</td></tr>';
      return;
    }
    tbody.innerHTML = rows.map((row) => {
      const status = row.status || row.situacao || 'PENDENTE';
      const dtRaw = row.created_at || row.data_solicitacao || row.solicitado_em || row.data_hora || row.data;
      const dt = dtRaw ? new Date(dtRaw) : null;
      const dtDate = dt && !isNaN(dt) ? dt.toLocaleDateString('pt-BR') : '-';
      const dtTime = dt && !isNaN(dt) ? dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '';
      const { gestor, coordenacao } = getGestorCoordenacao(row);
      return `<tr>
        <td><strong>${esc(origemPagamentoLabel(row.origem || row.setor || row.modulo_origem))}</strong></td>
        <td style="white-space:nowrap">${dtDate}${dtTime ? `<br><small style="color:#6b7280">${dtTime}</small>` : ''}</td>
        <td>${esc(gestor) || '<span class="spay-empty">—</span>'}</td>
        <td>${esc(coordenacao) || '<span class="spay-empty">—</span>'}</td>
        <td>${renderConteudoHtml(row)}</td>
        <td style="white-space:nowrap">${money(row.valor || row.valor_total || row.total)}</td>
        <td><span class="fin-status ${statusPagamentoClass(status)}">${esc(status)}</span></td>
        <td>
          <div class="fin-pay-actions" style="flex-wrap:wrap;gap:4px">
            ${isBoleto(row)
              ? `<button class="btn btn-secondary fin-small" data-ok-setor="${esc(row.id)}" type="button">OK</button>`
              : `<button class="btn btn-primary fin-small" data-pagar-setor="${esc(row.id)}" type="button">PAGAR</button>`}
            <button class="btn fin-small fin-btn-recusar" data-recusar-setor="${esc(row.id)}" type="button">RECUSAR</button>
          </div>
        </td>
      </tr>`;
    }).join('');
    tbody.querySelectorAll('[data-pagar-setor]').forEach((btn) => {
      btn.addEventListener('click', () => abrirModalComprovantePagamento(btn.dataset.pagarSetor));
    });
    tbody.querySelectorAll('[data-ok-setor]').forEach((btn) => {
      btn.addEventListener('click', () => abrirModalCienteBoleto(btn.dataset.okSetor));
    });
    tbody.querySelectorAll('[data-recusar-setor]').forEach((btn) => {
      btn.addEventListener('click', () => recusarPagamento(btn.dataset.recusarSetor));
    });
  }


  function compraItemToPagamento(row) {
    const s = row.compras_solicitacoes || {};
    const quantidade = row.quantidade || row.unidade || 1;
    const partes = [
      `- ${quantidade} un ${row.material || '-'}`,
      row.tamanho ? `  Tamanho/Detalhe: ${row.tamanho}` : '',
      row.colaborador_nome ? `  Colaborador: ${row.colaborador_nome}` : ''
    ].filter(Boolean);
    return {
      ...row,
      id: `compra_${row.id}`,
      _source_table: 'compras_itens',
      origem: 'COMPRAS',
      origem_id: row.id,
      descricao: partes.join('\n'),
      conteudo: partes.join('\n'),
      fornecedor: row.fornecedor || row.favorecido || s.fornecedor || '',
      favorecido: row.fornecedor || row.favorecido || s.fornecedor || '',
      contato: row.contato || '',
      contato_fornecedor: s.telefone_fornecedor || row.contato_fornecedor || '',
      valor: row.valor_total || 0,
      status: row.status === 'aguardando_nf' ? 'AGUARDANDO NF' : 'PENDENTE',
      created_at: row.updated_at || row.created_at || s.created_at || s.data_solicitacao,
      data_solicitacao: s.data_solicitacao || row.created_at,
      dados_pagamento: row.dados_pagamento || '',
      forma_pagamento: row.forma_pagamento || '',
      comprovante_url: row.comprovante_url || '',
      _raw_compra_item_id: row.id,
      _compra_item_ids: [row.id],
      _gestor: s.solicitante || '',
      _coordenacao: s.coordenacao || ''
    };
  }

  function groupCompraPagamentos(rows = []) {
    const map = new Map();
    rows.forEach((row) => {
      const base = compraItemToPagamento(row);
      const key = [
        base.forma_pagamento || '',
        base.dados_pagamento || '',
        base._gestor || '',
        base._coordenacao || '',
        base.status || ''
      ].map((v) => normalize(v)).join('|');

      if (!map.has(key)) {
        map.set(key, {
          ...base,
          id: `compra_grp_${Math.abs(hashText(key).replace('fin_', '').split('_')[0] || Date.now())}`,
          origem_id: `grupo_${key}`,
          descricao: '',
          conteudo: '',
          valor: 0,
          _source_table: 'compras_itens_group',
          _compra_item_ids: [],
          _raw_compra_item_id: null
        });
      }

      const group = map.get(key);
      group.valor += Number(base.valor || 0);
      group._compra_item_ids.push(...(base._compra_item_ids || []));
      group.descricao += (group.descricao ? '\n' : '') + base.descricao;
      group.conteudo = group.descricao;
      if (new Date(base.created_at || 0).getTime() > new Date(group.created_at || 0).getTime()) {
        group.created_at = base.created_at;
      }
    });

    return [...map.values()];
  }


  async function loadSetorPagamentos() {
    const tbody = document.getElementById('setorPagamentosTbody');
    if (tbody) tbody.innerHTML = '<tr><td colspan="8" class="fin-empty">Carregando pagamentos enviados pelos setores...</td></tr>';

    const [pagamentosRes, comprasRes] = await Promise.all([
      supabase
        .from('financeiro_pagamentos')
        .select('*')
        .neq('status', 'PAGO')
        .neq('status', 'RECUSADO')
        .is('comprovante_url', null)
        .order('created_at', { ascending: false })
        .limit(500),
      supabase
        .from('compras_itens')
        .select('*, compras_solicitacoes(*)')
        .in('status', ['pendente_pagamento'])
        .is('comprovante_url', null)
        .order('updated_at', { ascending: false })
        .limit(500)
    ]);

    const pagamentos = pagamentosRes.error ? [] : (pagamentosRes.data || []);
    const comprasAgrupadas = comprasRes.error ? [] : groupCompraPagamentos(comprasRes.data || []);

    // Deduplica por id de compras_itens (não por texto de forma+dados — a
    // partir de agora um financeiro_pagamentos de COMPRAS grava
    // compras_item_ids com os itens reais que ele cobre, mais confiável que
    // comparar texto livre que pode divergir entre o registro consolidado do
    // lote e o item individual).
    const idsJaCobertos = new Set(
      pagamentos
        .filter((row) => normalize(row.origem || row.setor || row.modulo_origem).includes('compra'))
        .flatMap((row) => Array.isArray(row.compras_item_ids) ? row.compras_item_ids.map(String) : [])
    );

    const comprasSemDuplicar = comprasAgrupadas.filter((row) => {
      const ids = (row._compra_item_ids || []).map((id) => String(id || '').replace(/^compra_/, ''));
      if (ids.length && ids.every((id) => idsJaCobertos.has(id))) return false;
      return true;
    });

    if (pagamentosRes.error && comprasRes.error) {
      if (tbody) tbody.innerHTML = `<tr><td colspan="8" class="fin-empty">${esc(pagamentosRes.error.message)}<br>${esc(comprasRes.error.message)}<br>Execute a migration de pagamentos do financeiro no Supabase.</td></tr>`;
      return;
    }

    state.financeiroPagamentos = [...comprasSemDuplicar, ...pagamentos].sort((a, b) => {
      const da = new Date(a.created_at || a.data_solicitacao || 0).getTime();
      const db = new Date(b.created_at || b.data_solicitacao || 0).getTime();
      return db - da;
    });

    renderSetorPagamentos();
  }


  function getPagamentoRowById(id) {
    return (state.financeiroPagamentos || []).find((row) => String(row.id) === String(id));
  }

  function renderConteudoModal(row) {
    const descricaoBase = row.descricao || row.conteudo || row.observacao || row.detalhes || '';
    const linhas = String(descricaoBase).split(/\n+/).map((l) => l.trim()).filter(Boolean)
      .filter((l) => !/^tipo\s*:/i.test(l))
      .filter((l) => !/^forma\s*:/i.test(l))
      .filter((l) => !/^dados\s*:/i.test(l));
    const dados = row.dados_pagamento || row.link_pagamento || row.chave_pix || row.boleto_url || '';
    const forma = row.forma_pagamento || '';
    const fornecedor = row.fornecedor || row.favorecido || row.beneficiario || '';
    const contato = row.contato || row.contato_fornecedor || '';
    const parts = [];
    if (linhas.length) parts.push(linhas.map((l) => esc(l)).join('<br>'));
    if (fornecedor) parts.push(`Fornecedor: ${esc(fornecedor)}`);
    if (contato) parts.push(`Contato: ${esc(contato)}`);
    if (forma) parts.push(`Forma: <strong>${esc(forma)}</strong>`);
    if (dados) {
      // dados pode ter várias linhas (link do produto + "Entrega: ...") —
      // linkifica só o trecho que é URL em cada linha, não o bloco inteiro.
      const dadosDisplay = String(dados)
        .split(/\n+/)
        .map((linha) => {
          const m = linha.match(/https?:\/\/\S+/i);
          if (!m) return `<strong style="word-break:break-all">${esc(linha)}</strong>`;
          const url = m[0];
          const antes = linha.slice(0, m.index);
          const depois = linha.slice(m.index + url.length);
          return `${esc(antes)}<a href="${esc(ensureHttps(url))}" target="_blank" rel="noopener" style="color:#34d399;word-break:break-all">${esc(url)}</a>${esc(depois)}`;
        })
        .join('<br>');
      parts.push(`Dados: ${dadosDisplay}`);
    }
    // Itens derivados direto de compras_itens (não agrupados num
    // financeiro_pagamentos real) trazem entrega_tipo/entrega_endereco como
    // colunas próprias, não dentro de dados_pagamento — mostra também.
    if (row.entrega_tipo === 'entrega' && row.entrega_endereco) {
      parts.push(`Entrega: <strong>${esc(row.entrega_endereco)}</strong>`);
    } else if (row.entrega_tipo === 'retirada') {
      parts.push(`Retirada`);
    }
    return parts.join('<br>') || `Solicitação de ${esc(origemPagamentoLabel(row.origem || row.setor || row.modulo_origem))}`;
  }

  function crc16Pix(str) {
    let crc = 0xFFFF;
    for (const ch of str) {
      crc ^= ch.charCodeAt(0) << 8;
      for (let i = 0; i < 8; i++) crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) & 0xFFFF : (crc << 1) & 0xFFFF;
    }
    return crc;
  }

  function gerarPayloadPix(chave, { valor, nome, cidade } = {}) {
    const tlv = (id, v) => `${id}${String(v.length).padStart(2, '0')}${v}`;
    const gui = tlv('00', 'BR.GOV.BCB.PIX') + tlv('01', chave);
    const valorStr = valor ? String(parseFloat(valor).toFixed(2)) : '';
    const nomeLimpo = (nome || 'Pagamento PIX').replace(/[^A-Za-z0-9 ]/g, ' ').trim().substring(0, 25);
    const cidadeLimpa = (cidade || 'BRASIL').replace(/[^A-Za-z0-9 ]/g, ' ').trim().substring(0, 15);
    const payload = [
      tlv('00', '01'),
      tlv('01', '12'),
      tlv('26', gui),
      tlv('52', '0000'),
      tlv('53', '986'),
      valorStr ? tlv('54', valorStr) : '',
      tlv('58', 'BR'),
      tlv('59', nomeLimpo),
      tlv('60', cidadeLimpa),
      tlv('62', tlv('05', '***')),
      '6304',
    ].join('');
    return payload + crc16Pix(payload).toString(16).toUpperCase().padStart(4, '0');
  }

  async function sendComprovanteViaBotConversa(phone, comprovanteUrl, fornecedor) {
    const tel = String(phone || '').replace(/\D/g, '');
    if (!tel) return { ok: false, error: 'Telefone inválido.' };
    try {
      const mensagem = `Olá${fornecedor ? `, ${fornecedor}` : ''}! Segue o comprovante de pagamento referente à sua solicitação.`;
      const { data, error } = await supabase.functions.invoke('botconversa-send', {
        body: { phone: tel, message: mensagem, fileUrl: comprovanteUrl, nome: fornecedor || '' }
      });
      if (error) return { ok: false, error: error.message || 'Erro na Edge Function.' };
      return data?.ok ? { ok: true } : { ok: false, error: data?.error || 'Falha ao enviar.' };
    } catch (e) {
      return { ok: false, error: e.message || 'Erro ao conectar.' };
    }
  }

  function abrirModalComprovantePagamento(id) {
    const row = getPagamentoRowById(id);
    if (!row) return;
    let modal = document.getElementById('finPagamentoModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'finPagamentoModal';
      modal.className = 'fin-pay-modal';
      document.body.appendChild(modal);
    }

    const dados = row.dados_pagamento || row.link_pagamento || row.chave_pix || row.boleto_url || '';
    const pixSection = isPix(row) && dados ? `
      <div style="text-align:center;margin:16px 0;padding:16px;background:rgba(52,211,153,.06);border:1px solid rgba(52,211,153,.18);border-radius:14px">
        <p style="color:#94a3b8;font-size:12px;text-transform:uppercase;letter-spacing:.06em;margin:0 0 12px">QR Code PIX</p>
        <img src="https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(gerarPayloadPix(dados, { valor: row.valor || row.valor_total || row.total, nome: row.favorecido_nome || row.fornecedor || row.favorecido || row.beneficiario, cidade: 'BRASIL' }))}" alt="QR Code PIX" style="width:200px;height:200px;border-radius:10px;background:#fff;padding:6px;display:block;margin:0 auto">
        <p style="color:#e2e8f0;font-size:13px;margin:10px 0 0;word-break:break-all">${esc(dados)}</p>
      </div>` : '';

    modal.innerHTML = `<div class="fin-pay-modal-card">
      <div class="fin-head">
        <div>
          <h3>Anexar comprovante</h3>
          <p>Após enviar, o comprovante retorna para o setor de origem.</p>
        </div>
        <button class="btn btn-secondary" id="finPayClose" type="button">Fechar</button>
      </div>
      <div class="pay-summary">
        <div class="pay-mini"><span>Setor</span><strong>${esc(origemPagamentoLabel(row.origem || row.setor || row.modulo_origem))}</strong></div>
        <div class="pay-mini"><span>Valor</span><strong>${money(row.valor || row.valor_total || row.total)}</strong></div>
      </div>
      <div class="fin-pay-preview" style="line-height:1.7;padding:14px;border:1px solid rgba(148,163,184,.14);border-radius:12px;background:rgba(15,23,42,.5);color:#e2e8f0;font-size:14px">${renderConteudoModal(row)}</div>
      ${pixSection}
      <div class="fin-field full mt-16">
        <label>Comprovante de pagamento</label>
        <input id="finPayComprovante" type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.xls,.xlsx">
      </div>
      <div class="fin-field full mt-16" style="padding:12px 14px;background:rgba(52,211,153,.04);border:1px solid rgba(52,211,153,.16);border-radius:12px">
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;margin-bottom:10px">
          <input id="finPaySendWpp" type="checkbox" ${(row.contato || row.contato_fornecedor) ? 'checked' : ''}>
          <span>Enviar comprovante por WhatsApp ao fornecedor</span>
        </label>
        <input id="finPayWppPhone" type="tel" placeholder="WhatsApp do fornecedor (ex: 5511999999999)" value="${esc(row.contato || row.contato_fornecedor || '')}" style="width:100%;background:rgba(15,23,42,.6);border:1px solid rgba(148,163,184,.2);border-radius:8px;padding:8px 12px;color:#e2e8f0;font-size:14px">
      </div>
      <div class="fin-actions-row mt-16">
        <button class="btn btn-primary" id="finPaySend" type="button">ENVIAR</button>
        <span id="finPayFeedback" class="fin-feedback"></span>
      </div>
    </div>`;
    modal.classList.add('open');
    modal.querySelector('#finPayClose').onclick = () => modal.classList.remove('open');
    modal.querySelector('#finPaySend').onclick = () => enviarComprovantePagamento(row);
  }

  function abrirModalCienteBoleto(id) {
    const row = getPagamentoRowById(id);
    if (!row) return;
    let modal = document.getElementById('finBoletoModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'finBoletoModal';
      modal.className = 'fin-pay-modal';
      document.body.appendChild(modal);
    }
    const dados = row.dados_pagamento || row.link_pagamento || row.boleto_url || '';
    const dadosHtml = isLinkDados(dados)
      ? `<a href="${esc(ensureHttps(dados))}" target="_blank" rel="noopener" style="color:#34d399;word-break:break-all">${esc(dados)}</a>`
      : `<strong style="word-break:break-all">${esc(dados)}</strong>`;
    modal.innerHTML = `<div class="fin-pay-modal-card">
      <div class="fin-head">
        <div><h3>Boleto registrado</h3><p>Pagamento via boleto — será quitado na data de vencimento.</p></div>
        <button class="btn btn-secondary" id="finBoletoClose" type="button">Fechar</button>
      </div>
      <div class="pay-summary">
        <div class="pay-mini"><span>Setor</span><strong>${esc(origemPagamentoLabel(row.origem || row.setor || row.modulo_origem))}</strong></div>
        <div class="pay-mini"><span>Valor</span><strong>${money(row.valor || row.valor_total || row.total)}</strong></div>
      </div>
      <div class="fin-pay-preview" style="line-height:1.7;padding:14px;border:1px solid rgba(148,163,184,.14);border-radius:12px;background:rgba(15,23,42,.5);color:#e2e8f0;font-size:14px">${renderConteudoModal(row)}</div>
      ${dados ? `<div style="margin-top:14px;padding:12px 14px;background:rgba(59,130,246,.1);border:1px solid rgba(59,130,246,.24);border-radius:12px;font-size:14px;color:#bfdbfe">Boleto: ${dadosHtml}</div>` : ''}
      <div class="fin-actions-row mt-16">
        <button class="btn btn-secondary" id="finBoletoOk" type="button">OK — Ciente</button>
        <span id="finBoletoFeedback" class="fin-feedback"></span>
      </div>
    </div>`;
    modal.classList.add('open');
    modal.querySelector('#finBoletoClose').onclick = () => modal.classList.remove('open');
    modal.querySelector('#finBoletoOk').onclick = () => modal.classList.remove('open');
  }

  async function ativarEpiRegistros(row) {
    const ids = (row._compra_item_ids || [])
      .map((id) => String(id || '').replace(/^compra_/, ''))
      .filter(Boolean);
    const seedId = ids[0] || (row.origem_id ? String(row.origem_id).replace(/^compra_/, '') : null);
    if (!seedId) return;
    const { data: seedItem } = await supabase.from('compras_itens').select('solicitacao_id').eq('id', seedId).maybeSingle();
    if (!seedItem?.solicitacao_id) return;
    const { data: solItens } = await supabase.from('compras_itens').select('id').eq('solicitacao_id', seedItem.solicitacao_id);
    const allIds = (solItens || []).map((i) => i.id);
    if (!allIds.length) return;
    await safe(() => supabase.from('rh_epi_registros').update({ status: 'pendente' }).in('compra_item_id', allIds).eq('status', 'aguardando_pagamento'), null);
  }

  async function updateComprasComprovante(row, comprovanteUrl) {
    const ids = (row._compra_item_ids || [])
      .map((id) => String(id || '').replace(/^compra_/, ''))
      .filter(Boolean);

    const forma = row.forma_pagamento || '';
    const dados = row.dados_pagamento || '';

    // Boletos de Compras já entram como "comprado" (NF anexada na origem —
    // vai direto pra Notas Fiscais, sem esperar o Financeiro pagar). Não
    // regride pra "aguardando_nf" um item que já passou dessa etapa; só
    // itens ainda "pendente_pagamento" avançam aqui.
    let q = supabase.from('compras_itens');
    if (ids.length) {
      q = q.update({ status: 'aguardando_nf', comprovante_url: comprovanteUrl }).in('id', ids).eq('status', 'pendente_pagamento');
    } else if (dados) {
      q = q.update({ status: 'aguardando_nf', comprovante_url: comprovanteUrl }).eq('dados_pagamento', dados).eq('status', 'pendente_pagamento');
      if (forma) q = q.eq('forma_pagamento', forma);
    } else if (row.origem_id) {
      q = q.update({ status: 'aguardando_nf', comprovante_url: comprovanteUrl }).eq('id', String(row.origem_id).replace(/^compra_/, '')).eq('status', 'pendente_pagamento');
    } else {
      return;
    }

    let { error } = await q;
    if (!error) return;

    if (isMissingColumnError(error)) {
      let retry = supabase.from('compras_itens');
      if (ids.length) retry = retry.update({ status: 'aguardando_nf' }).in('id', ids).eq('status', 'pendente_pagamento');
      else if (dados) {
        retry = retry.update({ status: 'aguardando_nf' }).eq('dados_pagamento', dados).eq('status', 'pendente_pagamento');
        if (forma) retry = retry.eq('forma_pagamento', forma);
      } else if (row.origem_id) retry = retry.update({ status: 'aguardando_nf' }).eq('id', String(row.origem_id).replace(/^compra_/, '')).eq('status', 'pendente_pagamento');
      const res = await retry;
      if (res.error) throw res.error;
      return;
    }

    throw error;
  }

  function recusarPagamento(id) {
    const row = getPagamentoRowById(id);
    if (!row) return;
    let modal = document.getElementById('finRecusaModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'finRecusaModal';
      modal.className = 'fin-pay-modal';
      document.body.appendChild(modal);
    }
    modal.innerHTML = `<div class="fin-pay-modal-card">
      <div class="fin-head">
        <div>
          <h3>Recusar pagamento</h3>
          <p>Informe o motivo da recusa para o setor.</p>
        </div>
        <button class="btn btn-secondary" id="finRecusaClose" type="button">Fechar</button>
      </div>
      <div class="pay-summary">
        <div class="pay-mini"><span>Setor</span><strong>${esc(origemPagamentoLabel(row.origem || row.setor || row.modulo_origem))}</strong></div>
        <div class="pay-mini"><span>Valor</span><strong>${money(row.valor || row.valor_total || row.total)}</strong></div>
      </div>
      <div class="fin-field full mt-16">
        <label>Motivo da recusa <span style="color:#f87171">*</span></label>
        <textarea id="finRecusaMotivo" rows="4" placeholder="Descreva o motivo para recusar este pagamento..." style="width:100%;background:rgba(255,255,255,.06);border:1px solid rgba(148,163,184,.2);border-radius:10px;color:#e2e8f0;padding:10px 12px;font-size:14px;resize:vertical"></textarea>
      </div>
      <div class="fin-actions-row mt-16">
        <button class="btn fin-btn-recusar" id="finRecusaConfirm" type="button">CONFIRMAR RECUSA</button>
        <span id="finRecusaFeedback" class="fin-feedback"></span>
      </div>
    </div>`;
    modal.classList.add('open');
    modal.querySelector('#finRecusaClose').onclick = () => modal.classList.remove('open');
    modal.querySelector('#finRecusaConfirm').onclick = () => confirmarRecusa(row, modal);
  }

  async function confirmarRecusa(row, modal) {
    const motivoEl = modal.querySelector('#finRecusaMotivo');
    const fb = modal.querySelector('#finRecusaFeedback');
    const motivo = (motivoEl?.value || '').trim();
    if (!motivo) {
      if (fb) { fb.textContent = 'Informe o motivo da recusa.'; fb.style.color = '#f87171'; }
      motivoEl?.focus();
      return;
    }
    const confirmBtn = modal.querySelector('#finRecusaConfirm');
    if (confirmBtn) { confirmBtn.disabled = true; confirmBtn.textContent = 'Recusando...'; }
    if (fb) { fb.textContent = ''; }
    try {
      // 'recusado_financeiro' é distinto de 'recusado' (recusa do próprio
      // Compras antes de comprar) — aparece na aba Recusados do Painel de
      // Compras rotulado "Recusa Financeiro".
      const isCompra = String(row.id || '').startsWith('compra_') || row._source_table === 'compras_itens' || row._source_table === 'compras_itens_group';
      if (isCompra) {
        const ids = (row._compra_item_ids || []).map((id) => String(id || '').replace(/^compra_/, '')).filter(Boolean);
        let q = supabase.from('compras_itens');
        if (ids.length) {
          q = q.update({ status: 'recusado_financeiro', motivo_recusa: motivo }).in('id', ids);
        } else {
          const rawId = String(row.origem_id || row.id || '').replace(/^compra_grp_|^compra_/, '');
          q = q.update({ status: 'recusado_financeiro', motivo_recusa: motivo }).eq('id', rawId);
        }
        let { error } = await q;
        if (error && isMissingColumnError(error)) {
          let retry = supabase.from('compras_itens');
          if (ids.length) retry = retry.update({ status: 'recusado_financeiro' }).in('id', ids);
          else {
            const rawId = String(row.origem_id || row.id || '').replace(/^compra_grp_|^compra_/, '');
            retry = retry.update({ status: 'recusado_financeiro' }).eq('id', rawId);
          }
          const res = await retry;
          if (res.error) throw res.error;
        } else if (error) {
          throw error;
        }
      } else {
        const rawId = String(row.id || '');
        let { error } = await supabase.from('financeiro_pagamentos').update({ status: 'RECUSADO', motivo_recusa: motivo }).eq('id', rawId);
        if (error && isMissingColumnError(error)) {
          const res = await supabase.from('financeiro_pagamentos').update({ status: 'RECUSADO' }).eq('id', rawId);
          if (res.error) throw res.error;
        } else if (error) {
          throw error;
        }
        // Registro real de financeiro_pagamentos: propaga a recusa de volta
        // pros compras_itens ligados (compras_item_ids), senão o Compras
        // nunca fica sabendo que o Financeiro recusou.
        const itemIds = Array.isArray(row.compras_item_ids) && row.compras_item_ids.length
          ? row.compras_item_ids.map(String)
          : (row.origem_id ? [String(row.origem_id)] : []);
        if (itemIds.length) {
          await supabase.from('compras_itens').update({ status: 'recusado_financeiro', motivo_recusa: motivo }).in('id', itemIds);
        }
      }
      modal.classList.remove('open');
      await loadSetorPagamentos();
    } catch (err) {
      if (fb) { fb.textContent = `Erro: ${err.message}`; fb.style.color = '#f87171'; }
      if (confirmBtn) { confirmBtn.disabled = false; confirmBtn.textContent = 'CONFIRMAR RECUSA'; }
    }
  }

  async function enviarComprovantePagamento(row) {
    const fb = document.getElementById('finPayFeedback');
    const file = document.getElementById('finPayComprovante')?.files?.[0];
    try {
      if (fb) {
        fb.textContent = 'Enviando comprovante...';
        fb.className = 'fin-feedback';
      }
      const comprovanteUrl = await uploadComprovantePagamento(file, row);
      const isCompras = normalize(row.origem || row.setor || row.modulo_origem).includes('compra') || String(row.id).startsWith('compra_');

      if (String(row.id).startsWith('compra_grp_') || String(row.id).startsWith('compra_')) {
        await updateComprasComprovante(row, comprovanteUrl);
        await ativarEpiRegistros(row);
      } else {
        const payload = { status: 'PAGO', pago_em: new Date().toISOString(), comprovante_url: comprovanteUrl };
        let { error } = await supabase.from('financeiro_pagamentos').update(payload).eq('id', row.id);
        if (error && isMissingColumnError(error)) {
          const retry = await supabase.from('financeiro_pagamentos').update({ status: 'PAGO', comprovante_url: comprovanteUrl }).eq('id', row.id);
          error = retry.error;
        }
        if (error) throw error;
        if (isCompras) {
          await updateComprasComprovante(row, comprovanteUrl);
          await ativarEpiRegistros(row);
        }
      }

      const sendWpp = document.getElementById('finPaySendWpp')?.checked;
      const wppPhone = document.getElementById('finPayWppPhone')?.value?.trim();
      if (sendWpp && wppPhone) {
        if (fb) { fb.textContent = 'Enviando por WhatsApp...'; fb.className = 'fin-feedback'; }
        const fornecedor = row.favorecido || row.fornecedor || row.beneficiario || '';
        const wppResult = await sendComprovanteViaBotConversa(wppPhone, comprovanteUrl, fornecedor);
        if (!wppResult.ok && fb) {
          fb.textContent = `Comprovante salvo, mas WhatsApp falhou: ${wppResult.error}`;
          fb.className = 'fin-feedback err';
          await loadSetorPagamentos();
          return;
        }
      }

      document.getElementById('finPagamentoModal')?.classList.remove('open');
      await loadSetorPagamentos();
    } catch (error) {
      if (fb) {
        fb.textContent = error.message || 'Erro ao enviar comprovante.';
        fb.className = 'fin-feedback err';
      }
      alert(error.message || 'Erro ao enviar comprovante.');
    }
  }


  const dashCharts = { line: null, donut: null };

  async function loadDashboardData() {
    const hoje = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const hojeStr = `${hoje.getFullYear()}-${pad(hoje.getMonth() + 1)}-${pad(hoje.getDate())}`;
    const seisMesesAtras = new Date(hoje);
    seisMesesAtras.setMonth(seisMesesAtras.getMonth() - 5);
    const inicioPeriodo = `${seisMesesAtras.getFullYear()}-${String(seisMesesAtras.getMonth() + 1).padStart(2, '0')}-01`;
    const novDiasAtras = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
    const quinzeDias = new Date(hoje);
    quinzeDias.setDate(quinzeDias.getDate() + 14);
    const fimPeriodo = `${quinzeDias.getFullYear()}-${pad(quinzeDias.getMonth() + 1)}-${pad(quinzeDias.getDate())}`;

    const [fluxoRes, fluxoDiarioRes, categoriaRes, receberRes, pagarRes] = await Promise.all([
      supabase.from('financeiro_fluxo_caixa_diario')
        .select('data,contas_receber,contas_pagar,saldo_dia,saldo_projetado')
        .gte('data', inicioPeriodo)
        .order('data', { ascending: true }),
      supabase.from('financeiro_fluxo_caixa_diario')
        .select('data,contas_pagar,contas_receber')
        .gte('data', hojeStr)
        .lte('data', fimPeriodo)
        .order('data', { ascending: true }),
      supabase.from('financeiro_contas_pagar')
        .select('categoria,valor')
        .gte('vencimento', novDiasAtras),
      supabase.from('financeiro_contas_receber')
        .select('cliente,valor,vencimento,situacao')
        .eq('vencimento', hojeStr)
        .order('cliente'),
      supabase.from('financeiro_contas_pagar')
        .select('favorecido,valor,vencimento,situacao')
        .eq('vencimento', hojeStr)
        .order('favorecido')
    ]);

    renderDashboard({
      fluxo: fluxoRes.data || [],
      fluxoDiario: fluxoDiarioRes.data || [],
      categorias: (categoriaRes.data || []).filter((r) => r.categoria),
      receber: receberRes.data || [],
      pagar: pagarRes.data || [],
      hojeStr
    });
  }

  function renderDashboard({ fluxo, fluxoDiario, categorias, receber, pagar, hojeStr }) {
    const hoje = new Date();
    const byMonth = {};
    fluxo.forEach((row) => {
      const mes = String(row.data).slice(0, 7);
      if (!byMonth[mes]) byMonth[mes] = { receber: 0, pagar: 0, saldo: 0, projetado: 0 };
      byMonth[mes].receber += Number(row.contas_receber || 0);
      byMonth[mes].pagar += Number(row.contas_pagar || 0);
      byMonth[mes].saldo += Number(row.saldo_dia || 0);
      byMonth[mes].projetado = Math.max(byMonth[mes].projetado, Number(row.saldo_projetado || 0));
    });

    const meses = Object.keys(byMonth).sort();
    const mesAtualKey = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`;
    const mesAnteriorDate = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
    const mesAnteriorKey = `${mesAnteriorDate.getFullYear()}-${String(mesAnteriorDate.getMonth() + 1).padStart(2, '0')}`;
    const atual = byMonth[mesAtualKey] || { receber: 0, pagar: 0, saldo: 0, projetado: 0 };
    const anterior = byMonth[mesAnteriorKey] || null;

    function setChange(id, curr, prev, invertido) {
      const el = document.getElementById(id);
      if (!el) return;
      if (!prev) { el.textContent = 'mês atual'; el.className = 'dash-kpi-change neutral'; return; }
      const pct = ((curr - prev) / Math.abs(prev)) * 100;
      const isGood = invertido ? pct < 0 : pct > 0;
      el.textContent = `${pct > 0 ? '▲' : '▼'} ${Math.abs(pct).toFixed(1)}%`;
      el.className = `dash-kpi-change ${isGood ? 'up' : 'down'}`;
    }

    const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = money(val); };
    setVal('dKpiSaldo', atual.saldo);
    setVal('dKpiReceber', atual.receber);
    setVal('dKpiPagar', atual.pagar);
    setVal('dKpiProjetado', atual.projetado);
    setChange('dKpiSaldoChange', atual.saldo, anterior?.saldo, false);
    setChange('dKpiReceberChange', atual.receber, anterior?.receber, false);
    setChange('dKpiPagarChange', atual.pagar, anterior?.pagar, true);
    setChange('dKpiProjetadoChange', atual.projetado, anterior?.projetado, false);

    const byDay = {};
    fluxoDiario.forEach((row) => {
      const dia = String(row.data).slice(0, 10);
      byDay[dia] = { pagar: Number(row.contas_pagar || 0), receber: Number(row.contas_receber || 0) };
    });
    const dias = Object.keys(byDay).sort();

    const diaLabels = dias.map((d) => {
      const [, mo, dy] = d.split('-');
      return `${dy}/${mo}`;
    });

    const lineCtx = document.getElementById('dashLineChart');
    if (lineCtx && typeof Chart !== 'undefined') {
      if (dashCharts.line) { dashCharts.line.destroy(); dashCharts.line = null; }
      dashCharts.line = new Chart(lineCtx, {
        type: 'line',
        data: {
          labels: diaLabels,
          datasets: [
            { label: 'A Receber', data: dias.map((d) => byDay[d].receber), borderColor: '#34d399', backgroundColor: 'rgba(52,211,153,.1)', borderWidth: 2.5, pointBackgroundColor: '#34d399', pointRadius: 4, fill: true, tension: 0.35 },
            { label: 'A Pagar', data: dias.map((d) => byDay[d].pagar), borderColor: '#f87171', backgroundColor: 'rgba(248,113,113,.07)', borderWidth: 2.5, pointBackgroundColor: '#f87171', pointRadius: 4, fill: true, tension: 0.35 }
          ]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: {
            legend: { labels: { color: '#6b7280', font: { size: 12 }, usePointStyle: true } },
            tooltip: { backgroundColor: 'rgba(15,23,42,.95)', borderColor: 'rgba(148,163,184,.18)', borderWidth: 1, titleColor: '#e2e8f0', bodyColor: '#6b7280', callbacks: { label: (ctx) => ` ${money(ctx.raw)}` } }
          },
          scales: {
            x: { grid: { color: 'rgba(148,163,184,.07)' }, ticks: { color: '#64748b', font: { size: 11 } } },
            y: { grid: { color: 'rgba(148,163,184,.07)' }, ticks: { color: '#64748b', font: { size: 11 }, callback: (v) => `R$ ${(v / 1000).toFixed(0)}k` } }
          }
        }
      });
    }

    const catMap = {};
    categorias.forEach((row) => { const cat = row.categoria || 'Outros'; catMap[cat] = (catMap[cat] || 0) + Number(row.valor || 0); });
    const catEntries = Object.entries(catMap).sort((a, b) => b[1] - a[1]).slice(0, 7);
    const donutColors = ['#34d399', '#818cf8', '#f87171', '#fb923c', '#a78bfa', '#38bdf8', '#fbbf24'];

    const donutCtx = document.getElementById('dashDonutChart');
    if (donutCtx && typeof Chart !== 'undefined') {
      if (dashCharts.donut) { dashCharts.donut.destroy(); dashCharts.donut = null; }
      if (catEntries.length) {
        dashCharts.donut = new Chart(donutCtx, {
          type: 'doughnut',
          data: {
            labels: catEntries.map(([k]) => k),
            datasets: [{ data: catEntries.map(([, v]) => v), backgroundColor: donutColors, borderColor: 'rgba(15,23,42,.9)', borderWidth: 3, hoverOffset: 8 }]
          },
          options: {
            responsive: true, maintainAspectRatio: false, cutout: '62%',
            plugins: {
              legend: { position: 'bottom', labels: { color: '#6b7280', font: { size: 11 }, padding: 10, usePointStyle: true } },
              tooltip: { backgroundColor: 'rgba(15,23,42,.95)', borderColor: 'rgba(148,163,184,.18)', borderWidth: 1, titleColor: '#e2e8f0', bodyColor: '#6b7280', callbacks: { label: (ctx) => ` ${money(ctx.raw)}` } }
            }
          }
        });
      } else {
        const pEl = donutCtx.closest('.dash-chart-card')?.querySelector('p');
        if (pEl) pEl.textContent = 'Sem dados de categorias nos últimos 90 dias.';
      }
    }

    const txEl = document.getElementById('dashTransactions');
    if (!txEl) return;
    const combined = [
      ...receber.map((r) => ({ tipo: 'receber', nome: r.cliente, valor: Number(r.valor || 0), data: r.vencimento, situacao: r.situacao })),
      ...pagar.map((r) => ({ tipo: 'pagar', nome: r.favorecido, valor: Number(r.valor || 0), data: r.vencimento, situacao: r.situacao }))
    ].sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));

    if (!combined.length) {
      txEl.innerHTML = '<div class="dash-loading">Nenhum vencimento para hoje.</div>';
      return;
    }
    txEl.innerHTML = combined.map((tx) => `
      <div class="dash-tx-row">
        <div class="dash-tx-icon ${esc(tx.tipo)}">${tx.tipo === 'receber' ? '↑' : '↓'}</div>
        <div style="min-width:0">
          <div class="dash-tx-name">${esc(tx.nome || '-')}</div>
          <div class="dash-tx-sub">${esc(tx.situacao || (tx.tipo === 'receber' ? 'A Receber' : 'A Pagar'))}</div>
        </div>
        <div class="dash-tx-date">${brDate(tx.data)}</div>
        <div class="dash-tx-value ${esc(tx.tipo)}">${tx.tipo === 'pagar' ? '−' : '+'}${money(tx.valor)}</div>
      </div>
    `).join('');
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
    setTab('fluxo');
    mostrarFluxoDetalhes();
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
    const statusEl = document.getElementById('kpiStatus');
    statusEl.textContent = state.fluxo.length ? (hasAttention ? 'ATENÇÃO' : 'OK') : 'SEM DADOS';
    statusEl.className = hasAttention ? 'danger-label' : 'ok-label';
    document.querySelectorAll('.fin-kpi small').forEach((el, idx) => {
      if (idx < 4) el.textContent = dateRangeLabel(state.filters.inicio, state.filters.fim);
    });
    const miniEl = document.getElementById('cfFlowMini');
    if (miniEl && state.fluxo.length) {
      miniEl.style.display = '';
      const liquido = total.receber - total.pagar;
      document.getElementById('cfFmReceber').textContent = money(total.receber);
      document.getElementById('cfFmPagar').textContent = money(total.pagar);
      document.getElementById('cfFmLiquido').textContent = money(liquido);
      const sumBar = total.receber + total.pagar;
      const recvPct = sumBar > 0 ? Math.round((total.receber / sumBar) * 100) : 50;
      const payPct = 100 - recvPct;
      document.getElementById('cfBarRecv').style.width = recvPct + '%';
      document.getElementById('cfBarPay').style.width = payPct + '%';
    }
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
        <td><button class="btn btn-secondary fin-small" data-detail-date="${esc(row.data)}" type="button">Detalhes</button></td>
      </tr>
    `).join('');
  }

  function renderDetalhes() {
    const tbody = document.getElementById('detalhesTbody');
    let rows = [
      ...state.receber.map((r) => ({ tipo: 'Receber', situacao: r.situacao, nome: r.cliente, doc: r.fatura || r.numero_nf || r.codigo, valor: Number(r.valor || 0) - Number(r.valor_pago || 0), vencimento: r.vencimento })),
      ...state.pagar.map((r) => ({ tipo: 'Pagar', situacao: r.situacao, nome: r.favorecido, doc: r.doc || r.cod_grupo || r.parcela, valor: Number(r.valor || 0) - Number(r.valor_pago || 0), vencimento: r.vencimento }))
    ];

    const { tipo, situacao, favorecido, doc } = state.detFilter;
    if (tipo) rows = rows.filter((r) => r.tipo === tipo);
    if (situacao) rows = rows.filter((r) => (r.situacao || '').toLowerCase() === situacao.toLowerCase());
    if (favorecido) rows = rows.filter((r) => (r.nome || '').toLowerCase().includes(favorecido.toLowerCase()));
    if (doc) rows = rows.filter((r) => (r.doc || '').toLowerCase().includes(doc.toLowerCase()));

    const { col, dir } = state.detSort;
    if (col) {
      rows = [...rows].sort((a, b) => {
        const av = col === 'valor' ? a[col] : (a[col] || '');
        const bv = col === 'valor' ? b[col] : (b[col] || '');
        return col === 'valor' ? (av - bv) * dir : String(av).localeCompare(String(bv)) * dir;
      });
    }

    document.querySelectorAll('.det-th-sort').forEach((th) => {
      const c = th.dataset.detSort;
      const icon = th.querySelector('.det-sort-icon');
      if (icon) icon.textContent = c === col ? (dir === 1 ? '▲' : '▼') : '↕';
      th.classList.toggle('det-th-active', c === col);
    });

    if (!rows.length) {
      tbody.innerHTML = `<tr><td colspan="6" class="fin-empty">Nenhum lançamento encontrado.</td></tr>`;
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



  state.pagamentos = { tipo: null, periodo: '', conferencia: [], flash: [], ifood: [], alelo: [], logs: [], modo: 'adiantamentos' };
  state.adiantamentosRows = [];
  state.adiantamentosLoaded = false;
  state.almocoLoaded = false;

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
    const outputs = buildPaymentOutputs(p.conferencia || []);
    const total = outputs.okRows.reduce((sum, row) => sum + Number(row.valor || 0), 0);
    const registros = outputs.okRows.length;
    if (document.getElementById('payTipo')) document.getElementById('payTipo').textContent = p.tipo || '-';
    if (document.getElementById('payPeriodo')) document.getElementById('payPeriodo').textContent = p.periodo || '-';
    if (document.getElementById('payRegistros')) document.getElementById('payRegistros').textContent = String(registros);
    if (document.getElementById('payTotal')) document.getElementById('payTotal').textContent = money(total);
    if (document.getElementById('payFooterTotal')) document.getElementById('payFooterTotal').textContent = `Total pronto para pagar: ${money(total)}`;
    if (document.getElementById('payFooterHint')) {
      const pendentes = (p.conferencia || []).filter((row) => String(row.status_pagamento || '').toUpperCase() === 'PENDENTE').length;
      const pagos = (p.conferencia || []).filter((row) => String(row.status_pagamento || '').toUpperCase() === 'PAGO').length;
      document.getElementById('payFooterHint').textContent = `${registros} OK · ${pendentes} pendente(s) · ${pagos} já pago(s)`;
    }
    if (document.getElementById('btnPagarBeneficios')) document.getElementById('btnPagarBeneficios').disabled = registros <= 0;
    state.pagamentos.flash = outputs.flash;
    state.pagamentos.ifood = outputs.ifood;
    state.pagamentos.alelo = outputs.alelo;
  }

  function getPayFilteredEntries() {
    const termo = normalize(document.getElementById('payColaboradorFiltro')?.value || '');
    const entries = (state.pagamentos.conferencia || []).map((row, idx) => ({ row, idx }));
    if (!termo) return { entries, termo };
    const filtered = entries.filter(({ row }) => normalize([
      row.funcionario,
      row.cpf,
      row.destino,
      row.tipo,
      row.composicao,
      row.supervisao,
      row.observacao
    ].filter(Boolean).join(' ')).includes(termo));
    return { entries: filtered, termo };
  }

  function renderPayTables() {
    const p = state.pagamentos;
    updatePaySummary();
    const filtered = getPayFilteredEntries();
    const entries = filtered.entries;
    const filtroInfo = document.getElementById('payFiltroInfo');
    if (filtroInfo) {
      filtroInfo.textContent = filtered.termo
        ? `${entries.length} de ${(p.conferencia || []).length} colaborador(es) encontrados.`
        : `Mostrando ${(p.conferencia || []).length} colaborador(es).`;
    }

    document.getElementById('payConferenciaTbody').innerHTML = entries.length ? entries.map(({ row: r, idx }) => {
      const st = String(r.status_pagamento || 'OK').toUpperCase();
      const statusCell = st === 'PAGO'
        ? `<span class="pay-status-paid">PAGO</span>`
        : `
          <div class="pay-status-toggle" role="group" aria-label="Status do pagamento de ${esc(r.funcionario || 'colaborador')}">
            <button class="pay-status-btn ${st === 'OK' ? 'active-ok' : 'is-inactive'}" type="button" data-pay-status-index="${idx}" data-pay-status-value="OK">OK</button>
            <button class="pay-status-btn ${st === 'PENDENTE' ? 'active-pendente' : 'is-inactive'}" type="button" data-pay-status-index="${idx}" data-pay-status-value="PENDENTE">PENDENTE</button>
          </div>`;
      return `<tr><td>${statusCell}</td><td>${brDate(r.data)}</td><td><strong>${esc(r.funcionario || '-')}</strong></td><td>${esc(r.cpf || '-')}</td><td>${esc(r.destino || '-')}</td><td>${esc(r.tipo || '-')}</td><td>${money(r.valor)}</td><td>${esc(r.composicao || '-')}</td><td>${esc(r.supervisao || '-')}</td><td>${esc(r.observacao || '-')}</td></tr>`;
    }).join('') : `<tr><td colspan="10" class="fin-empty">${filtered.termo ? 'Nenhum colaborador encontrado nesse filtro.' : 'Nenhuma conferência gerada.'}</td></tr>`;

    document.getElementById('payFlashTbody').innerHTML = p.flash?.length ? p.flash.map((r) => `
      <tr><td>${esc(r.cpf || '-')}</td><td><strong>${esc(r.nome || '-')}</strong></td><td>${money(r.valor)}</td></tr>
    `).join('') : `<tr><td colspan="3" class="fin-empty">Nenhum pagamento Flash OK.</td></tr>`;

    document.getElementById('payIfoodTbody').innerHTML = p.ifood?.length ? p.ifood.map((r) => `
      <tr><td>${esc(r.cnpj || '-')}</td><td><strong>${esc(r.nome || '-')}</strong></td><td>${esc(r.cpf || '-')}</td><td>${esc(formatDateForXlsx(r.nascimento) || '-')}</td><td>${esc(r.email || '-')}</td><td>${esc(r.celular || '-')}</td><td>${esc(r.centro_custo || '-')}</td><td>${money(r.livre ?? r.valor)}</td></tr>
    `).join('') : `<tr><td colspan="8" class="fin-empty">Nenhum pagamento iFood OK.</td></tr>`;

    document.getElementById('payAleloTbody').innerHTML = p.alelo?.length ? p.alelo.map((r) => `
      <tr><td>${esc(r.serie || '-')}</td><td>${esc(r.cpf || '-')}</td><td>${money(r.valor)}</td><td>${esc(r.observacao || '-')}</td><td>${esc(r.nome || '-')}</td></tr>
    `).join('') : `<tr><td colspan="5" class="fin-empty">Nenhum pagamento Alelo OK.</td></tr>`;

    document.getElementById('payLogsTbody').innerHTML = p.logs?.length ? p.logs.map((r) => `
      <tr><td>${esc(r.data ? brDate(r.data) : (r.linha ? `Linha ${r.linha}` : '-'))}</td><td><strong>${esc(r.funcionario || '-')}</strong></td><td><span class="fin-status ${paymentStatusClass(r.status || r.tipo)}">${esc(r.status || r.tipo || '-')}</span></td><td>${esc(r.mensagem || '-')}</td></tr>
    `).join('') : `<tr><td colspan="4" class="fin-empty">Nenhuma pendência.</td></tr>`;
    updatePaySummary();
  }

  async function carregarAlmoco() {
    const data = document.getElementById('almocoData')?.value;
    if (!data) return paySetFeedback('fbAlimentacao', 'Informe a data.', 'err');
    try {
      paySetFeedback('fbAlimentacao', 'Consultando colaboradores elegíveis (login x embarque) e base de colaboradores...');
      const [rhMap, almoco] = await Promise.all([
        loadColaboradoresPagamento(data),
        supabase.from('financeiro_alimentacao_colaboradores')
          .select('id,data_ref,colaborador,cpf,coordenacao,supervisao,hora_identificada,local_nome,distancia_m,status,tipo_beneficio')
          .eq('data_ref', data)
          .eq('ativo', true)
          .neq('status', 'PAGO')
      ]);
      if (almoco.error) throw almoco.error;

      let apuracao = apurarAlmocoRows(almoco.data || [], rhMap);
      apuracao = await syncPaidStatus(normalizePaymentRows(apuracao, document.getElementById('payDefaultStatus')?.value || 'OK'));
      if (!apuracao.conferencia.length) {
        paySetFeedback('fbAlimentacao', 'Nenhum colaborador elegível para almoço nessa data (login entre 10:30-12:00 a até 1km de um embarque).', 'err');
      }
      state.pagamentos = { tipo: 'Almoço', periodo: brDate(data), modo: 'almoco', ...apuracao };
      renderPayTables();
      setPayTab('conferencia');
      paySetFeedback('fbAlimentacao', `Gerado: ${apuracao.conferencia.length} colaborador(es), ${apuracao.flash.length} Flash, ${apuracao.ifood.length} iFood, ${apuracao.logs.length} pendências.`, 'ok');
    } catch (err) {
      console.error(err);
      paySetFeedback('fbAlimentacao', err.message || 'Erro ao consultar almoço.', 'err');
    }
  }

  // Histórico do Almoço: linhas já PAGAS somem da Conferência (carregarAlmoco filtra
  // status<>PAGO) e aparecem só aqui — evita que o financeiro gere o XLS de novo pra
  // quem já foi pago no mesmo dia.
  async function carregarHistoricoAlmoco() {
    const tbody = document.getElementById('payHistoricoTbody');
    if (tbody) tbody.innerHTML = '<tr><td colspan="7" class="fin-empty">Carregando...</td></tr>';
    try {
      const { data, error } = await supabase
        .from('financeiro_alimentacao_colaboradores')
        .select('data_ref,colaborador,coordenacao,supervisao,local_nome,processado_em,tipo_beneficio')
        .eq('status', 'PAGO')
        .order('processado_em', { ascending: false })
        .limit(500);
      if (error) throw error;
      if (!tbody) return;
      tbody.innerHTML = (data || []).length ? data.map((row) => `
        <tr>
          <td>${brDate(row.data_ref)}</td>
          <td>${esc(TIPO_BENEFICIO_LABEL[row.tipo_beneficio] || 'Refeição')}</td>
          <td><strong>${esc(row.colaborador || '-')}</strong></td>
          <td>${esc(row.coordenacao || '-')}</td>
          <td>${esc(row.supervisao || '-')}</td>
          <td>${esc(row.local_nome || '-')}</td>
          <td>${row.processado_em ? new Date(row.processado_em).toLocaleString('pt-BR') : '-'}</td>
        </tr>
      `).join('') : '<tr><td colspan="7" class="fin-empty">Nenhum pagamento registrado ainda.</td></tr>';
    } catch (err) {
      console.error(err);
      if (tbody) tbody.innerHTML = `<tr><td colspan="7" class="fin-empty">Erro ao carregar histórico: ${esc(err.message)}</td></tr>`;
    }
  }


  // ── Adiantamentos (sincronizado do GRM pelo agente sync-adiantamentos) ────
  // Fonte: grm_adiantamentos_importacoes (espelho GRM) + financeiro_adiantamentos_decisoes
  // (decisão local ✓/✗, não altera nada no GRM). Merge feito aqui no cliente por ofr_code.
  async function carregarAdiantamentos() {
    paySetFeedback('fbAdiantamentos', 'Carregando solicitações...');
    try {
      const [{ data: importadas, error: e1 }, { data: decisoes, error: e2 }] = await Promise.all([
        supabase.from('grm_adiantamentos_importacoes')
          .select('ofr_code,data_solicitacao,data_registro,colaborador,cpf,coordenacao,supervisao,conta,valor,saldo,embarque,leitura_mais_antiga,descricao,pendente_no_grm,saiu_pendente_em')
          .order('data_registro', { ascending: false })
          .limit(500),
        supabase.from('financeiro_adiantamentos_decisoes')
          .select('ofr_code,status,motivo_recusa,decidido_por,decidido_em,execucao_id,pago_em')
      ]);
      if (e1) throw e1;
      if (e2) throw e2;

      const decisaoMap = new Map((decisoes || []).map((d) => [d.ofr_code, d]));
      state.adiantamentosRows = (importadas || []).map((row) => ({ ...row, decisao: decisaoMap.get(row.ofr_code) || null }));
      renderAdiantamentosTable();
      paySetFeedback('fbAdiantamentos', `${state.adiantamentosRows.length} solicitação(ões) carregada(s).`, 'ok');
    } catch (err) {
      console.error(err);
      paySetFeedback('fbAdiantamentos', err.message || 'Erro ao carregar adiantamentos.', 'err');
    }
  }

  function adiantAcaoHtml(row) {
    const st = row.decisao?.status || 'pendente';
    if (st === 'pago') return `<span class="pay-status-paid">PAGO</span>`;
    const motivoAttr = row.decisao?.motivo_recusa ? ` title="${esc(row.decisao.motivo_recusa)}"` : '';
    return `
      <div class="pay-status-toggle" role="group" aria-label="Ação para ${esc(row.colaborador || 'colaborador')}">
        <button class="pay-status-btn ${st === 'ok' ? 'active-ok' : 'is-inactive'}" type="button" data-adiant-ok="${row.ofr_code}">✓</button>
        <button class="pay-status-btn ${st === 'recusado' ? 'active-pendente' : 'is-inactive'}"${motivoAttr} type="button" data-adiant-recusar="${row.ofr_code}">✗</button>
      </div>`;
  }

  function setAdiantTab(tab) {
    document.querySelectorAll('.adiant-subtab').forEach((btn) => btn.classList.toggle('active', btn.dataset.adiantTab === tab));
    document.querySelectorAll('.adiant-table').forEach((panel) => panel.classList.remove('active'));
    document.getElementById(`adiant-${tab}`)?.classList.add('active');
  }

  function renderAdiantamentosTable() {
    const rows = state.adiantamentosRows || [];
    // Sai da lista de Solicitações (e vai pro Histórico automaticamente) tanto quem já foi
    // pago/recusado pelo financeiro quanto quem deixou de aparecer como pendente no GRM
    // (resolvido/baixado direto por lá, fora do fluxo do painel).
    const ativos = rows.filter((r) => r.pendente_no_grm !== false && !['pago', 'recusado'].includes(r.decisao?.status));
    const historico = rows.filter((r) => r.pendente_no_grm === false || ['pago', 'recusado'].includes(r.decisao?.status))
      .sort((a, b) => String(b.decisao?.decidido_em || b.saiu_pendente_em || '').localeCompare(String(a.decisao?.decidido_em || a.saiu_pendente_em || '')));

    const { col: sortCol, dir: sortDir } = state.adiantSort;
    if (sortCol) {
      const numericCols = ['valor', 'saldo'];
      ativos.sort((a, b) => {
        if (numericCols.includes(sortCol)) return ((Number(a[sortCol]) || 0) - (Number(b[sortCol]) || 0)) * sortDir;
        return String(a[sortCol] || '').localeCompare(String(b[sortCol] || ''), 'pt-BR') * sortDir;
      });
    }
    document.querySelectorAll('.adiant-th-sort').forEach((th) => {
      const c = th.dataset.adiantSort;
      const icon = th.querySelector('.adiant-sort-icon');
      if (icon) icon.textContent = c === sortCol ? (sortDir === 1 ? '▲' : '▼') : '↕';
      th.classList.toggle('adiant-th-active', c === sortCol);
    });

    const tbody = document.getElementById('adiantTbody');
    if (tbody) {
      tbody.innerHTML = ativos.length ? ativos.map((row) => `
        <tr>
          <td>${brDate(row.data_solicitacao)}</td>
          <td><strong>${esc(row.colaborador || '-')}</strong></td>
          <td>${esc(row.coordenacao || '-')}</td>
          <td>${esc(row.supervisao || '-')}</td>
          <td>${money(row.valor)}</td>
          <td>${money(row.saldo)}</td>
          <td>${row.embarque ? brDate(row.embarque) : '-'}</td>
          <td>${row.leitura_mais_antiga ? brDate(row.leitura_mais_antiga) : '-'}</td>
          <td>${esc(row.descricao || '-')}</td>
          <td>${adiantAcaoHtml(row)}</td>
        </tr>
      `).join('') : '<tr><td colspan="10" class="fin-empty">Nenhuma solicitação pendente.</td></tr>';

      tbody.querySelectorAll('[data-adiant-ok]').forEach((btn) => btn.addEventListener('click', () => decidirAdiantamentoOk(Number(btn.dataset.adiantOk))));
      tbody.querySelectorAll('[data-adiant-recusar]').forEach((btn) => btn.addEventListener('click', () => abrirModalRecusaAdiantamento(Number(btn.dataset.adiantRecusar))));
    }

    state.adiantamentosHistorico = historico;
    renderHistoricoAgrupado(historico);

    const pendentes = ativos.filter((r) => (r.decisao?.status || 'pendente') === 'pendente').length;
    const selecionados = ativos.filter((r) => r.decisao?.status === 'ok');
    const recusados = historico.filter((r) => r.decisao?.status === 'recusado').length;
    const totalSelecionado = selecionados.reduce((sum, r) => sum + Number(r.valor || 0), 0);

    if (document.getElementById('adiantPendentes')) document.getElementById('adiantPendentes').textContent = String(pendentes);
    if (document.getElementById('adiantSelecionados')) document.getElementById('adiantSelecionados').textContent = String(selecionados.length);
    if (document.getElementById('adiantTotalSelecionado')) document.getElementById('adiantTotalSelecionado').textContent = money(totalSelecionado);
    if (document.getElementById('adiantRecusados')) document.getElementById('adiantRecusados').textContent = String(recusados);
    if (document.getElementById('adiantFooterTotal')) document.getElementById('adiantFooterTotal').textContent = `Total pronto para pagar: ${money(totalSelecionado)}`;
    if (document.getElementById('adiantFooterHint')) document.getElementById('adiantFooterHint').textContent = `${selecionados.length} selecionado(s) · ${pendentes} pendente(s) · ${recusados} recusado(s)`;
    if (document.getElementById('btnPagarAdiantamentos')) document.getElementById('btnPagarAdiantamentos').disabled = selecionados.length === 0;
  }

  const HIST_DOW_LABELS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
  const HIST_MES_LABELS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

  function moneyCompact(v) {
    return Number(v || 0).toLocaleString('pt-BR', { maximumFractionDigits: 0 });
  }

  function calendarioMesHtml(mesKey, diasMap) {
    const [ano, mes] = mesKey.split('-').map(Number);
    const diasNoMes = new Date(ano, mes, 0).getDate();
    const offset = new Date(ano, mes - 1, 1).getDay();

    const celulas = [];
    for (let i = 0; i < offset; i++) celulas.push('<div class="hist-cal-day blank"></div>');
    for (let d = 1; d <= diasNoMes; d++) {
      const iso = `${ano}-${String(mes).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const info = diasMap.get(iso);
      if (!info || (!info.pago && !info.recusado && !info.removido)) {
        celulas.push(`<div class="hist-cal-day"><span class="d">${d}</span></div>`);
        continue;
      }
      let cls, valor, titulo;
      if (info.pago > 0) { cls = 'paid'; valor = info.pago; titulo = money(valor); }
      else if (info.recusado > 0) { cls = 'recusado'; valor = info.recusado; titulo = money(valor); }
      else { cls = 'removido'; valor = info.removido; titulo = `${money(valor)} · saiu do GRM sem decisão do financeiro`; }
      celulas.push(`<div class="hist-cal-day ${cls}" title="${esc(titulo)}"><span class="d">${d}</span><span class="v">${moneyCompact(valor)}</span></div>`);
    }

    return `
      <div class="hist-cal">
        <div class="hist-cal-title">${HIST_MES_LABELS[mes - 1]}/${ano}</div>
        <div class="hist-cal-grid">
          ${HIST_DOW_LABELS.map((l) => `<div class="hist-cal-dow">${l}</div>`).join('')}
          ${celulas.join('')}
        </div>
      </div>`;
  }

  function renderHistoricoAgrupado(historico) {
    const container = document.getElementById('adiantHistoricoContent');
    if (!container) return;
    if (!historico.length) {
      container.innerHTML = '<div class="fin-empty">Nenhum pagamento registrado ainda.</div>';
      return;
    }

    const termo = normalize(document.getElementById('histColaboradorFiltro')?.value || '');
    const grupos = new Map();
    historico.forEach((row) => {
      const key = row.cpf || row.colaborador || '-';
      if (!grupos.has(key)) grupos.set(key, { nome: row.colaborador || '-', totalPago: 0, totalRecusado: 0, totalRemovido: 0, dias: new Map() });
      const g = grupos.get(key);
      const status = row.decisao?.status;
      // Saiu da lista de pendentes do GRM sem o financeiro ter marcado ✓/✗ aqui.
      const removidoSemDecisao = row.pendente_no_grm === false && !['pago', 'recusado'].includes(status);
      const valor = Number(row.valor || 0);
      const dia = String(row.decisao?.decidido_em || row.saiu_pendente_em || row.data_solicitacao || '').slice(0, 10);
      if (status === 'pago') g.totalPago += valor;
      else if (status === 'recusado') g.totalRecusado += valor;
      else if (removidoSemDecisao) g.totalRemovido += valor;
      if (dia) {
        const atual = g.dias.get(dia) || { pago: 0, recusado: 0, removido: 0 };
        if (status === 'pago') atual.pago += valor;
        else if (status === 'recusado') atual.recusado += valor;
        else if (removidoSemDecisao) atual.removido += valor;
        g.dias.set(dia, atual);
      }
    });

    let lista = Array.from(grupos.values()).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    if (termo) lista = lista.filter((g) => normalize(g.nome).includes(termo));

    if (!lista.length) {
      container.innerHTML = '<div class="fin-empty">Nenhum colaborador encontrado nesse filtro.</div>';
      return;
    }

    container.innerHTML = lista.map((g) => {
      const diasPagos = Array.from(g.dias.values()).filter((d) => d.pago > 0).length;
      const diasRecusados = Array.from(g.dias.values()).filter((d) => d.recusado > 0).length;
      const diasRemovidos = Array.from(g.dias.values()).filter((d) => d.removido > 0).length;
      const meses = new Set(Array.from(g.dias.keys()).map((dia) => dia.slice(0, 7)));
      const calendariosHtml = Array.from(meses).sort().map((mesKey) => calendarioMesHtml(mesKey, g.dias)).join('');

      return `
        <div class="hist-colab-card">
          <div class="hist-colab-head" data-hist-toggle>
            <div class="hist-colab-name"><span class="hist-colab-toggle">▸</span>${esc(g.nome)}</div>
            <div class="hist-colab-meta">
              <div><span>Total recebido</span><strong style="color:#86efac">${money(g.totalPago)}</strong></div>
              <div><span>Dias pagos</span><strong>${diasPagos}</strong></div>
              <div><span>Total recusado</span><strong style="color:#fca5a5">${money(g.totalRecusado)}</strong></div>
              <div><span>Dias recusados</span><strong>${diasRecusados}</strong></div>
              <div><span>Saiu do GRM sem decisão</span><strong style="color:#cbd5e1">${diasRemovidos}</strong></div>
            </div>
          </div>
          <div class="hist-cal-row">${calendariosHtml}</div>
        </div>`;
    }).join('');

    container.querySelectorAll('[data-hist-toggle]').forEach((head) => {
      head.addEventListener('click', () => head.closest('.hist-colab-card')?.classList.toggle('expanded'));
    });
  }

  async function decidirAdiantamentoOk(ofrCode) {
    const row = (state.adiantamentosRows || []).find((r) => r.ofr_code === ofrCode);
    if (!row || ['pago','recusado'].includes(row.decisao?.status)) return;
    const novoStatus = row.decisao?.status === 'ok' ? 'pendente' : 'ok';
    const payload = {
      ofr_code: ofrCode,
      status: novoStatus,
      motivo_recusa: null,
      decidido_por: userContext?.user?.name || userContext?.user?.email || null,
      decidido_em: new Date().toISOString()
    };
    const { error } = await supabase.from('financeiro_adiantamentos_decisoes').upsert(payload, { onConflict: 'ofr_code' });
    if (error) { paySetFeedback('fbAdiantamentos', error.message, 'err'); return; }
    row.decisao = { ...row.decisao, ...payload };
    renderAdiantamentosTable();
  }

  function abrirModalRecusaAdiantamento(ofrCode) {
    const row = (state.adiantamentosRows || []).find((r) => r.ofr_code === ofrCode);
    if (!row || ['pago','recusado'].includes(row.decisao?.status)) return;
    let modal = document.getElementById('adiantRecusaModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'adiantRecusaModal';
      modal.className = 'fin-pay-modal';
      document.body.appendChild(modal);
    }
    modal.innerHTML = `<div class="fin-pay-modal-card">
      <div class="fin-head">
        <div>
          <h3>Recusar adiantamento</h3>
          <p>Informe o motivo da recusa. Fica registrado no histórico.</p>
        </div>
        <button class="btn btn-secondary" id="adiantRecusaClose" type="button">Fechar</button>
      </div>
      <div class="pay-summary">
        <div class="pay-mini"><span>Colaborador</span><strong>${esc(row.colaborador || '-')}</strong></div>
        <div class="pay-mini"><span>Valor</span><strong>${money(row.valor)}</strong></div>
      </div>
      <div class="fin-field full mt-16">
        <label>Motivo da recusa <span style="color:#f87171">*</span></label>
        <textarea id="adiantRecusaMotivo" rows="4" placeholder="Descreva o motivo para recusar esta solicitação..." style="width:100%;background:rgba(255,255,255,.06);border:1px solid rgba(148,163,184,.2);border-radius:10px;color:#e2e8f0;padding:10px 12px;font-size:14px;resize:vertical">${esc(row.decisao?.motivo_recusa || '')}</textarea>
      </div>
      <div class="fin-actions-row mt-16">
        <button class="btn fin-btn-recusar" id="adiantRecusaConfirm" type="button">CONFIRMAR RECUSA</button>
        <span id="adiantRecusaFeedback" class="fin-feedback"></span>
      </div>
    </div>`;
    modal.classList.add('open');
    modal.querySelector('#adiantRecusaClose').onclick = () => modal.classList.remove('open');
    modal.querySelector('#adiantRecusaConfirm').onclick = () => confirmarRecusaAdiantamento(ofrCode, modal);
  }

  async function confirmarRecusaAdiantamento(ofrCode, modal) {
    const motivoEl = modal.querySelector('#adiantRecusaMotivo');
    const fb = modal.querySelector('#adiantRecusaFeedback');
    const motivo = (motivoEl?.value || '').trim();
    if (!motivo) {
      if (fb) { fb.textContent = 'Informe o motivo da recusa.'; fb.style.color = '#f87171'; }
      motivoEl?.focus();
      return;
    }
    const btn = modal.querySelector('#adiantRecusaConfirm');
    if (btn) { btn.disabled = true; btn.textContent = 'Recusando...'; }
    try {
      const payload = {
        ofr_code: ofrCode,
        status: 'recusado',
        motivo_recusa: motivo,
        decidido_por: userContext?.user?.name || userContext?.user?.email || null,
        decidido_em: new Date().toISOString()
      };
      const { error } = await supabase.from('financeiro_adiantamentos_decisoes').upsert(payload, { onConflict: 'ofr_code' });
      if (error) throw error;
      const row = (state.adiantamentosRows || []).find((r) => r.ofr_code === ofrCode);
      if (row) row.decisao = { ...row.decisao, ...payload };
      modal.classList.remove('open');
      renderAdiantamentosTable();
    } catch (err) {
      if (fb) { fb.textContent = `Erro: ${err.message}`; fb.style.color = '#f87171'; }
      if (btn) { btn.disabled = false; btn.textContent = 'CONFIRMAR RECUSA'; }
    }
  }

  // PAGAR (Adiantamentos): por enquanto gera os arquivos de upload em conta bancária
  // (mesmo modelo Flash/iFood/Alelo já usado em Diárias e Almoço) e registra a execução
  // para conferência/dedup — não chama a Edge Function de pagamento automático ainda.
  async function pagarAdiantamentos() {
    const selecionados = (state.adiantamentosRows || []).filter((r) => r.decisao?.status === 'ok');
    if (!selecionados.length) return paySetFeedback('fbAdiantamentos', 'Marque ✓ em pelo menos uma solicitação antes de pagar.', 'err');

    const conferenciaRows = selecionados.map((row) => {
      const contaNorm = normalize(row.conta);
      const destino = contaNorm.includes('ifood') ? 'iFood' : contaNorm.includes('flash') ? 'Flash' : contaNorm.includes('alelo') ? 'Alelo' : 'Pendente';
      const conf = {
        data: row.data_solicitacao,
        funcionario: row.colaborador,
        cpf: onlyDigits(row.cpf),
        destino,
        tipo: 'Adiantamento',
        valor: roundNumber(row.valor),
        composicao: row.descricao || 'Adiantamento',
        coordenacao: row.coordenacao,
        supervisao: row.supervisao,
        banco: row.conta,
        observacao: 'OK'
      };
      return { ...conf, unique_hash: makePaymentHash(conf), _ofr_code: row.ofr_code };
    });

    const pagaveis = conferenciaRows.filter((row) => row.destino !== 'Pendente');
    const semDestino = conferenciaRows.filter((row) => row.destino === 'Pendente');
    if (!pagaveis.length) return paySetFeedback('fbAdiantamentos', 'Nenhuma linha selecionada tem Conta reconhecida (Flash/iFood/Alelo).', 'err');

    const btn = document.getElementById('btnPagarAdiantamentos');
    try {
      if (btn) btn.disabled = true;
      paySetFeedback('fbAdiantamentos', 'Conferindo duplicidades e gerando arquivos de pagamento...');

      const paid = await fetchAlreadyPaidMap(pagaveis.map((r) => r.unique_hash));
      const elegiveis = pagaveis.filter((r) => !paid.has(r.unique_hash));
      const jaPagos = pagaveis.filter((r) => paid.has(r.unique_hash));

      if (elegiveis.length) {
        const outputs = buildPaymentOutputs(elegiveis.map((r) => ({ ...r, status_pagamento: 'OK' })));
        const periodo = new Date().toISOString().slice(0, 10);
        const total = elegiveis.reduce((sum, r) => sum + Number(r.valor || 0), 0);

        const { data: execucao, error: execError } = await supabase.from('financeiro_pagamentos_execucoes').insert({
          tipo: 'Adiantamentos',
          periodo,
          status: 'PAGO',
          total_valor: roundNumber(total),
          total_linhas: elegiveis.length,
          responsavel: userContext?.user?.name || userContext?.user?.email || null
        }).select('id').single();
        if (execError) throw execError;

        await registrarLinhasPagamento(elegiveis, execucao.id, 'PAGO');
        await salvarResumoNotasFiscais(elegiveis, execucao.id);

        const arquivos = [];
        if (outputs.flash.length) { downloadWorkbook(`PGTO_FLASH_${compactDate(periodo)}.xlsx`, [{ name: 'PGTO_FLASH', ws: worksheetFromObjects(outputs.flash, flashCols) }]); arquivos.push(`Flash (${outputs.flash.length})`); }
        if (outputs.ifood.length) { downloadWorkbook(`PGTO_IFOOD_${compactDate(periodo)}.xlsx`, [{ name: 'PGTO_IFOOD', ws: worksheetFromObjects(outputs.ifood, ifoodCols) }]); arquivos.push(`iFood (${outputs.ifood.length})`); }
        if (outputs.alelo.length) { downloadCsv(`PGTO_ALELO_${compactDate(periodo)}.csv`, outputs.alelo, aleloCols); arquivos.push(`Alelo (${outputs.alelo.length})`); }
        downloadWorkbook(`CONFERENCIA_ADIANTAMENTOS_${compactDate(periodo)}.xlsx`, [{ name: 'Conferencia', ws: worksheetFromObjects(elegiveis, confCols) }]);

        const pagoEm = new Date().toISOString();
        const responsavel = userContext?.user?.name || userContext?.user?.email || null;
        const decisoesPagas = elegiveis.map((r) => ({ ofr_code: r._ofr_code, status: 'pago', execucao_id: execucao.id, pago_em: pagoEm, decidido_por: responsavel, decidido_em: pagoEm }));
        const { error: decError } = await supabase.from('financeiro_adiantamentos_decisoes').upsert(decisoesPagas, { onConflict: 'ofr_code' });
        if (decError) throw decError;
        decisoesPagas.forEach((d) => {
          const row = (state.adiantamentosRows || []).find((x) => x.ofr_code === d.ofr_code);
          if (row) row.decisao = { ...row.decisao, ...d };
        });

        paySetFeedback('fbAdiantamentos', `Arquivo(s) gerado(s): ${arquivos.join(', ') || 'nenhum (sem CPF válido)'}${jaPagos.length ? ` · ${jaPagos.length} já estavam pagas` : ''}${semDestino.length ? ` · ${semDestino.length} sem conta reconhecida (não incluída)` : ''}.`, 'ok');
      } else {
        paySetFeedback('fbAdiantamentos', 'Todas as linhas selecionadas já constavam como PAGO. Nenhum arquivo novo foi gerado.', 'ok');
      }

      jaPagos.forEach((r) => {
        const row = (state.adiantamentosRows || []).find((x) => x.ofr_code === r._ofr_code);
        if (row && row.decisao?.status !== 'pago') row.decisao = { ...row.decisao, status: 'pago' };
      });

      renderAdiantamentosTable();
      setAdiantTab('historico');
    } catch (err) {
      console.error(err);
      paySetFeedback('fbAdiantamentos', err.message || 'Erro ao gerar pagamento.', 'err');
      renderAdiantamentosTable();
    }
  }


  // ---------- DIÁRIAS (apuração, sem pagamento automático) ----------
  // Dias com colaborador CONFIRMADO na programação (programacao_equipe ×
  // programacao_dia) × valor/dia do GRM (colaborador_cruzamento.salario, que
  // pra Intermitente/Diarista é diária — mesma convenção do motor de custo da
  // Etapa 2; Efetivo fica de fora). Um dia conta UMA diária, mesmo com 2 O.S.
  // no mesmo dia. Não grava nada: conferência + CSV; pagamento em lote fica
  // pra uma próxima fase com regra de aprovação definida.
  async function carregarDiarias() {
    const fb = (msg, tone) => paySetFeedback('fbDiarias', msg, tone);
    const de = document.getElementById('diariasDe')?.value;
    const ate = document.getElementById('diariasAte')?.value;
    if (!de || !ate) { fb('Informe o período (De/Até).', 'err'); return; }
    if (de > ate) { fb('Data inicial maior que a final.', 'err'); return; }
    fb('Apurando...');
    try {
      const { data: dias, error: e1 } = await supabase
        .from('programacao_dia')
        .select('id,data_referencia,supervisao')
        .gte('data_referencia', de)
        .lte('data_referencia', ate)
        .limit(2000);
      if (e1) throw e1;
      const diaPorProg = new Map((dias || []).map((d) => [String(d.id), d]));
      if (!diaPorProg.size) { state.diariasRows = []; renderDiarias(); fb('Nenhuma programação no período.'); return; }

      const progIds = [...diaPorProg.keys()];
      const equipe = [];
      // .in() com centenas de ids estoura o limite de URL do PostgREST — corta em lotes.
      for (let i = 0; i < progIds.length; i += 100) {
        const { data, error } = await supabase
          .from('programacao_equipe')
          .select('programacao_id,colaborador_id,nome_colaborador')
          .eq('confirmado', true)
          .in('programacao_id', progIds.slice(i, i + 100))
          .limit(10000);
        if (error) throw error;
        equipe.push(...(data || []));
      }
      if (!equipe.length) { state.diariasRows = []; renderDiarias(); fb('Nenhum colaborador confirmado no período.'); return; }

      // Agrupa por colaborador: dias distintos + supervisões vistas.
      const porColab = new Map();
      equipe.forEach((r) => {
        const key = String(r.colaborador_id || '').trim();
        if (!key) return;
        const dia = diaPorProg.get(String(r.programacao_id));
        if (!dia) return;
        const atual = porColab.get(key) || { key, nome: r.nome_colaborador || key, dias: new Set(), supervisoes: new Set() };
        atual.dias.add(String(dia.data_referencia).slice(0, 10));
        if (dia.supervisao) atual.supervisoes.add(dia.supervisao);
        if (!atual.nome && r.nome_colaborador) atual.nome = r.nome_colaborador;
        porColab.set(key, atual);
      });

      // Valor/dia e tipo de contrato do cruzamento (linha mais recente por CPF).
      const cpfs = [...porColab.keys()].filter((k) => /^\d{6,}$/.test(k));
      const taxaPorCpf = new Map();
      for (let i = 0; i < cpfs.length; i += 150) {
        const { data, error } = await supabase
          .from('colaborador_cruzamento')
          .select('cpf,tipo_contrato,salario,atualizado_em')
          .in('cpf', cpfs.slice(i, i + 150))
          .order('atualizado_em', { ascending: false })
          .limit(10000);
        if (error) throw error;
        (data || []).forEach((r) => { if (!taxaPorCpf.has(r.cpf)) taxaPorCpf.set(r.cpf, r); });
      }

      const rows = [];
      porColab.forEach((c) => {
        const cz = taxaPorCpf.get(c.key) || null;
        const tipo = String(cz?.tipo_contrato || '').toUpperCase();
        if (tipo.includes('EFETIVO')) return; // efetivo não recebe diária
        const valorDia = Number(cz?.salario || 0);
        rows.push({
          nome: c.nome,
          tipo: cz?.tipo_contrato || 'Sem cadastro no GRM',
          supervisao: [...c.supervisoes].join(', ') || '-',
          dias: c.dias.size,
          valorDia,
          total: valorDia > 0 ? valorDia * c.dias.size : 0,
          semValor: !(valorDia > 0),
        });
      });
      rows.sort((a, b) => b.total - a.total || a.nome.localeCompare(b.nome, 'pt-BR'));
      state.diariasRows = rows;
      renderDiarias();
      fb(rows.length ? `Apurado: ${de.split('-').reverse().join('/')} a ${ate.split('-').reverse().join('/')}.` : 'Nenhum Intermitente/Diarista confirmado no período.');
    } catch (err) {
      console.error('[financeiro] diárias:', err);
      fb(err.message || 'Erro ao apurar diárias.', 'err');
    }
  }

  function renderDiarias() {
    const rows = state.diariasRows || [];
    const body = document.getElementById('diariasBody');
    if (!body) return;
    const comValor = rows.filter((r) => !r.semValor);
    document.getElementById('diariasColabs').textContent = String(rows.length);
    document.getElementById('diariasQtd').textContent = String(rows.reduce((s, r) => s + r.dias, 0));
    document.getElementById('diariasSemValor').textContent = String(rows.length - comValor.length);
    document.getElementById('diariasTotal').textContent = money(comValor.reduce((s, r) => s + r.total, 0));
    if (!rows.length) {
      body.innerHTML = '<tr><td colspan="6" class="fin-empty">Nenhuma diária apurada no período.</td></tr>';
      return;
    }
    body.innerHTML = rows.map((r) => `<tr>
      <td><b>${esc(r.nome)}</b></td>
      <td>${esc(r.tipo)}</td>
      <td>${esc(r.supervisao)}</td>
      <td>${r.dias}</td>
      <td>${r.semValor ? '<span style="color:#fde68a;font-weight:700">sem valor</span>' : esc(money(r.valorDia))}</td>
      <td><b>${r.semValor ? '-' : esc(money(r.total))}</b></td>
    </tr>`).join('');
  }

  function exportarDiariasCsv() {
    const rows = state.diariasRows || [];
    if (!rows.length) { paySetFeedback('fbDiarias', 'Apure um período antes de exportar.', 'err'); return; }
    const de = document.getElementById('diariasDe')?.value || 'inicio';
    const ate = document.getElementById('diariasAte')?.value || 'fim';
    const num = (v) => String(v ?? '').replace('.', ',');
    const cel = (v) => { const s = String(v ?? ''); return /[";\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s; };
    const linhas = [
      ['Colaborador', 'Tipo', 'Supervisão', 'Dias', 'Valor/dia', 'Total'].join(';'),
      ...rows.map((r) => [cel(r.nome), cel(r.tipo), cel(r.supervisao), r.dias, r.semValor ? '' : num(r.valorDia.toFixed(2)), r.semValor ? '' : num(r.total.toFixed(2))].join(';')),
    ];
    const blob = new Blob(['﻿' + linhas.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `diarias-${de}-a-${ate}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }

  function setPayMode(mode) {
    const clean = ['almoco', 'diarias'].includes(mode) ? mode : 'adiantamentos';
    state.pagamentos.modo = clean;
    document.querySelectorAll('.pay-mode-btn').forEach((btn) => btn.classList.toggle('active', btn.dataset.payMode === clean));
    document.querySelectorAll('.pay-mode-panel').forEach((panel) => panel.classList.remove('active'));
    document.getElementById(`pay-mode-${clean}`)?.classList.add('active');
    if (clean === 'adiantamentos' && !state.adiantamentosLoaded) {
      state.adiantamentosLoaded = true;
      carregarAdiantamentos();
    }
    if (clean === 'almoco' && !state.almocoLoaded) {
      state.almocoLoaded = true;
      carregarAlmoco();
    }
    if (clean === 'diarias' && !state.diariasLoaded) {
      state.diariasLoaded = true;
      const hoje = new Date();
      const primeiroDia = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-01`;
      const hojeIso = new Date(hoje.getTime() - hoje.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
      const de = document.getElementById('diariasDe');
      const ate = document.getElementById('diariasAte');
      if (de && !de.value) de.value = primeiroDia;
      if (ate && !ate.value) ate.value = hojeIso;
      document.getElementById('btnAtualizarDiarias')?.addEventListener('click', carregarDiarias);
      document.getElementById('btnExportarDiarias')?.addEventListener('click', exportarDiariasCsv);
      carregarDiarias();
    }
  }

  async function salvarResumoNotasFiscais(rows, execucaoId = null) {
    const resumo = groupNotasFiscaisResumo(rows, execucaoId);
    if (!resumo.length) return;
    const { error } = await supabase.from('financeiro_notas_fiscais_resumo').upsert(resumo, {
      onConflict: 'data_pagamento,regional,destino,modulo_origem'
    });
    if (error) throw error;
  }

  async function registrarLinhasPagamento(rows, execucaoId, status = 'PAGO', apiRetorno = null) {
    const payload = (rows || []).map((row) => ({
      execucao_id: execucaoId,
      unique_hash: row.unique_hash || makePaymentHash(row),
      data: row.data || null,
      funcionario: row.funcionario || null,
      cpf: onlyDigits(row.cpf) || null,
      destino: row.destino || null,
      tipo: row.tipo || null,
      valor: Number(row.valor || 0),
      composicao: row.composicao || null,
      coordenacao: row.coordenacao || null,
      supervisao: row.supervisao || null,
      banco: row.banco || null,
      observacao: row.observacao || null,
      status,
      pago_em: status === 'PAGO' ? new Date().toISOString() : null,
      api_retorno: apiRetorno
    }));
    if (!payload.length) return;
    const { error } = await supabase.from('financeiro_pagamentos_linhas').upsert(payload, { onConflict: 'unique_hash' });
    if (error) throw error;
  }

  async function pagarBeneficios() {
    const outputs = buildPaymentOutputs(state.pagamentos.conferencia || []);
    const rows = outputs.okRows.filter((row) => ['flash', 'ifood'].some((destino) => normalize(row.destino).includes(destino)));
    if (!rows.length) return paySetFeedback('fbAlimentacao', 'Nenhuma linha OK de Flash/iFood para pagar.', 'err');

    try {
      document.getElementById('btnPagarBeneficios').disabled = true;
      paySetFeedback('fbAlimentacao', 'Conferindo duplicidades e enviando pagamento para Flash/iFood...');

      const paid = await fetchAlreadyPaidMap(rows.map((row) => row.unique_hash || makePaymentHash(row)));
      const elegiveis = rows.filter((row) => !paid.has(row.unique_hash || makePaymentHash(row)));
      if (!elegiveis.length) {
        paySetFeedback('fbAlimentacao', 'Todos os registros OK já constam como PAGO. Nenhum pagamento duplicado foi enviado.', 'ok');
        state.pagamentos.conferencia = state.pagamentos.conferencia.map((row) => paid.has(row.unique_hash) ? { ...row, status_pagamento: 'PAGO', observacao: 'PAGO - bloqueado para evitar duplicidade' } : row);
        renderPayTables();
        return;
      }

      const total = elegiveis.reduce((sum, row) => sum + Number(row.valor || 0), 0);
      const { data: execucao, error: execError } = await supabase.from('financeiro_pagamentos_execucoes').insert({
        tipo: state.pagamentos.tipo || 'Pagamento',
        periodo: state.pagamentos.periodo || null,
        status: 'PROCESSANDO',
        total_valor: roundNumber(total),
        total_linhas: elegiveis.length,
        responsavel: userContext?.user?.name || userContext?.user?.email || null
      }).select('id').single();
      if (execError) throw execError;

      const apiPayload = {
        execucao_id: execucao.id,
        tipo: state.pagamentos.tipo,
        periodo: state.pagamentos.periodo,
        flash: buildPaymentOutputs(elegiveis).flash,
        ifood: buildPaymentOutputs(elegiveis).ifood,
        linhas: elegiveis
      };

      const { data: apiData, error: apiError } = await supabase.functions.invoke('financeiro-pagar-beneficios', { body: apiPayload });
      if (apiError) throw new Error(apiError.message || 'Falha na API de pagamento Flash/iFood.');
      if (apiData?.ok === false) throw new Error(apiData?.error || 'API de pagamento retornou erro.');

      await registrarLinhasPagamento(elegiveis, execucao.id, 'PAGO', apiData || null);
      await salvarResumoNotasFiscais(elegiveis, execucao.id);
      await supabase.from('financeiro_pagamentos_execucoes').update({ status: 'PAGO', api_retorno: apiData || null }).eq('id', execucao.id);

      const almocoIds = elegiveis.map((row) => row._almoco_id).filter(Boolean);
      if (almocoIds.length) {
        await supabase.from('financeiro_alimentacao_colaboradores').update({ status: 'PAGO', processado_em: new Date().toISOString() }).in('id', almocoIds);
      }

      const paidHashes = new Set(elegiveis.map((row) => row.unique_hash || makePaymentHash(row)));
      state.pagamentos.conferencia = state.pagamentos.conferencia.map((row) => paidHashes.has(row.unique_hash || makePaymentHash(row)) ? { ...row, status_pagamento: 'PAGO', observacao: 'PAGO - bloqueado para evitar duplicidade' } : row);
      renderPayTables();
      setPayTab('conferencia');
      paySetFeedback('fbAlimentacao', `Pagamento enviado e registrado: ${elegiveis.length} linha(s), ${money(total)}. Resumo enviado para Notas Fiscais.`, 'ok');
    } catch (err) {
      console.error(err);
      paySetFeedback('fbAlimentacao', err.message || 'Erro ao pagar.', 'err');
      updatePaySummary();
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

  // Um único botão baixa todos os arquivos necessários (cada categoria com dados vira um
  // arquivo, no formato exigido pra upload na respectiva plataforma) em vez de exigir um
  // clique por categoria.
  function exportarTudo() {
    const p = state.pagamentos;
    const periodo = compactDate(p.periodo) || compactDate(new Date().toISOString());
    const gerados = [];

    if (p.flash?.length) {
      downloadWorkbook(`PGTO_FLASH_${periodo}.xlsx`, [{ name: 'PGTO_FLASH', ws: worksheetFromObjects(p.flash, flashCols) }]);
      gerados.push('Flash');
    }
    if (p.ifood?.length) {
      downloadWorkbook(`PGTO_IFOOD_${periodo}.xlsx`, [{ name: 'PGTO_IFOOD', ws: worksheetFromObjects(p.ifood, ifoodCols) }]);
      gerados.push('iFood');
    }
    if (p.alelo?.length) {
      downloadCsv(`PGTO_ALELO_${periodo}.csv`, p.alelo, aleloCols);
      gerados.push('Alelo');
    }
    if (p.conferencia?.length) {
      downloadWorkbook(`CONFERENCIA_PAGAMENTOS_${periodo}.xlsx`, [
        { name: 'Conferencia', ws: worksheetFromObjects(p.conferencia, confCols) },
        { name: 'Flash', ws: worksheetFromObjects(p.flash || [], flashCols) },
        { name: 'iFood', ws: worksheetFromObjects(p.ifood || [], ifoodCols) },
        { name: 'Alelo', ws: worksheetFromObjects(p.alelo || [], aleloCols) }
      ]);
      gerados.push('Conferência');
    }

    if (!gerados.length) alert('Nenhum registro para exportar.');
  }

  document.querySelectorAll('.fin-tab').forEach((btn) => btn.addEventListener('click', () => { setTab(btn.dataset.tab); if (btn.dataset.tab && btn.dataset.tab !== 'fluxo') history.replaceState(null, '', `#${btn.dataset.tab}`); }));
  document.querySelectorAll('[data-tab-target]').forEach((btn) => btn.addEventListener('click', () => { setTab(btn.dataset.tabTarget); if (btn.dataset.tabTarget && btn.dataset.tabTarget !== 'fluxo') history.replaceState(null, '', `#${btn.dataset.tabTarget}`); }));
  document.getElementById('btnReload').addEventListener('click', loadFluxo);
  document.getElementById('btnReloadSetorPagamentos')?.addEventListener('click', loadSetorPagamentos);
  document.getElementById('nfReloadBtn')?.addEventListener('click', loadNotasFiscais);
  document.getElementById('nfFiltroCliente')?.addEventListener('input', (event) => { state.notasFiscaisFiltro.cliente = event.target.value; renderNotasFiscais(); });
  document.getElementById('nfFiltroSituacao')?.addEventListener('change', (event) => { state.notasFiscaisFiltro.situacao = event.target.value; renderNotasFiscais(); });
  document.querySelectorAll('[data-setor-pay]').forEach((btn) => btn.addEventListener('click', () => {
    state.pagamentosSetorFilter = btn.dataset.setorPay || 'todos';
    document.querySelectorAll('[data-setor-pay]').forEach((item) => item.classList.toggle('active', item === btn));
    renderSetorPagamentos();
  }));
  document.getElementById('btnImportReceber').addEventListener('click', () => importFile('receber'));
  document.getElementById('btnImportPagar').addEventListener('click', () => importFile('pagar'));
  document.getElementById('configForm').addEventListener('submit', saveConfig);

  document.querySelectorAll('.det-th-sort').forEach((th) => {
    th.style.cursor = 'pointer';
    th.addEventListener('click', () => {
      const col = th.dataset.detSort;
      if (state.detSort.col === col) { state.detSort.dir *= -1; } else { state.detSort.col = col; state.detSort.dir = 1; }
      renderDetalhes();
    });
  });
  document.querySelectorAll('.adiant-th-sort').forEach((th) => {
    th.addEventListener('click', () => {
      const col = th.dataset.adiantSort;
      if (state.adiantSort.col === col) { state.adiantSort.dir *= -1; } else { state.adiantSort.col = col; state.adiantSort.dir = 1; }
      renderAdiantamentosTable();
    });
  });
  document.getElementById('detFiltroTipo')?.addEventListener('change', (e) => { state.detFilter.tipo = e.target.value; renderDetalhes(); });
  document.getElementById('detFiltroSituacao')?.addEventListener('change', (e) => { state.detFilter.situacao = e.target.value; renderDetalhes(); });
  document.getElementById('detFiltroFavorecido')?.addEventListener('input', (e) => { state.detFilter.favorecido = e.target.value; renderDetalhes(); });
  document.getElementById('detFiltroDoc')?.addEventListener('input', (e) => { state.detFilter.doc = e.target.value; renderDetalhes(); });

  document.getElementById('btnGerarAlmoco')?.addEventListener('click', carregarAlmoco);
  document.getElementById('btnAtualizarAdiantamentos')?.addEventListener('click', carregarAdiantamentos);
  document.getElementById('btnPagarAdiantamentos')?.addEventListener('click', pagarAdiantamentos);
  document.querySelectorAll('.adiant-subtab').forEach((btn) => btn.addEventListener('click', () => setAdiantTab(btn.dataset.adiantTab)));
  document.getElementById('histColaboradorFiltro')?.addEventListener('input', () => renderHistoricoAgrupado(state.adiantamentosHistorico || []));
  document.querySelectorAll('.pay-mode-btn').forEach((btn) => btn.addEventListener('click', () => setPayMode(btn.dataset.payMode)));
  document.getElementById('btnPagarBeneficios').addEventListener('click', pagarBeneficios);
  document.getElementById('payColaboradorFiltro')?.addEventListener('input', renderPayTables);
  document.getElementById('btnLimparPayFiltro')?.addEventListener('click', () => {
    const input = document.getElementById('payColaboradorFiltro');
    if (input) input.value = '';
    renderPayTables();
  });
  content.addEventListener('click', (event) => {
    const statusBtn = event.target.closest('[data-pay-status-index][data-pay-status-value]');
    if (!statusBtn) return;
    const idx = Number(statusBtn.dataset.payStatusIndex);
    const value = String(statusBtn.dataset.payStatusValue || '').toUpperCase();
    if (!Number.isInteger(idx) || !state.pagamentos.conferencia?.[idx]) return;
    if (!['OK', 'PENDENTE'].includes(value)) return;
    const row = state.pagamentos.conferencia[idx];
    row.status_pagamento = value;
    renderPayTables();
    if (row._almoco_id) {
      supabase.from('financeiro_alimentacao_colaboradores').update({ status: value, updated_at: new Date().toISOString() }).eq('id', row._almoco_id)
        .then(({ error }) => { if (error) console.warn('[financeiro] falha ao persistir status do almoço', error); });
    }
  });
  document.querySelectorAll('.pay-subtab').forEach((btn) => btn.addEventListener('click', () => setPayTab(btn.dataset.payTab)));
  document.querySelector('[data-pay-tab="historico"]')?.addEventListener('click', carregarHistoricoAlmoco);
  document.getElementById('btnExportarTudo').addEventListener('click', exportarTudo);
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
  document.getElementById('btnVoltarFluxo')?.addEventListener('click', mostrarFluxoLista);
  document.querySelectorAll('.ajustes-subtab').forEach((btn) => btn.addEventListener('click', () => setAjustesTab(btn.dataset.ajustesTab)));

  window.addEventListener('hashchange', () => setTab(tabFromHash()));
  setPayMode('adiantamentos');
  setTab(tabFromHash());
  sincronizarContasAgente().then(loadFluxo, loadFluxo);
}

initProtectedPage('Financeiro', renderContent);
