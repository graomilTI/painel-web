// Financeiro — contas a pagar/receber: colunas das planilhas, mapeamento e sincronização com o agente.
// Extraído de assets/js/financeiro.js em 15/10/2026 (arquivo de ~2.800 linhas). O código das funções e constantes
// foi movido sem alteração. Para publicar uma mudança em qualquer módulo de assets/js/modules/financeiro/, troque o
// token ?v=20261030-fin7 em TODOS os imports internos e nos carregadores (assets/js/financeiro.js, financeiro.html):
// tests/financeiro-modulos-versao.test.mjs garante que fiquem iguais.
import { supabase } from '../../supabaseClient.js';
import { toNumber, toDateISO, hashText, pick } from './util.js?v=20261030-fin7';

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

  // O PostgREST tem um teto de linhas por requisição (Max Rows do projeto, hoje 1000)
  // que corta silenciosamente qualquer resultado maior — o antigo .limit(limite) nunca
  // furava esse teto, então lotes de milhares de linhas (ex.: Contas a Receber) chegavam
  // truncados nas primeiras ~1000 linhas físicas da tabela, não necessariamente as mais
  // relevantes. Pagina com .range() até esgotar o lote ou atingir `limite`, mesmo padrão
  // de loadColaboradoresPagamento() neste arquivo.
  const pageSize = 1000;
  const rows = [];
  let from = 0;
  while (rows.length < limite) {
    const { data, error } = await supabase
      .from(tabela).select('dados_json').gte('created_at', threshold).order('created_at').order('id').range(from, from + pageSize - 1); // desempate: sem chave única a paginação repete/pula linhas
    if (error) throw error;
    const page = data || [];
    rows.push(...page.map((row) => row.dados_json));
    if (page.length < pageSize) break;
    from += pageSize;
  }
  return rows.slice(0, limite);
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

export { upsertChunk, mapReceber, mapPagar, sincronizarContasAgente };
