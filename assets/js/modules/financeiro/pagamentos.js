// Financeiro — pagamentos: origem/status, comprovantes, saídas de pagamento e resumo de notas fiscais.
// Extraído de assets/js/financeiro.js em 15/10/2026 (arquivo de ~2.800 linhas). O código das funções e constantes
// foi movido sem alteração. Para publicar uma mudança em qualquer módulo de assets/js/modules/financeiro/, troque o
// token ?v=20261019-fin5 em TODOS os imports internos e nos carregadores (assets/js/financeiro.js, financeiro.html):
// tests/financeiro-modulos-versao.test.mjs garante que fiquem iguais.
import { supabase } from '../../supabaseClient.js';
import { normalize, hashText, onlyDigits, roundNumber } from './util.js?v=20261019-fin5';

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

const PAGAMENTO_IFOOD_CNPJ = '29.666.679/0001-34';

function makePaymentHash(row) {
  return hashText([
    row.data || '', row.funcionario || '', row.cpf || '', row.destino || '', row.tipo || '', row.valor || 0, row.composicao || ''
  ].join('|'));
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

function statusClass(value) {
  return normalize(value).includes('atencao') || normalize(value).includes('atenção') ? 'danger' : 'ok';
}

export { origemPagamentoLabel, statusPagamentoClass, ensureHttps, isBoleto, isPix, uploadComprovantePagamento, makePaymentHash, buildPaymentOutputs, fetchAlreadyPaidMap, groupNotasFiscaisResumo, statusClass };
