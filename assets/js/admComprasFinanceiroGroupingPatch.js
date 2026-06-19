import { supabase } from './supabaseClient.js';

const PATCH_FLAG = '__admComprasFinanceiroGroupingPatch';

function normalize(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function sameText(a, b) {
  return normalize(a) === normalize(b);
}

function paymentKey(payload) {
  const fornecedor = payload?.fornecedor || payload?.favorecido || '';
  const forma = payload?.forma_pagamento || '';
  const dados = payload?.dados_pagamento || '';
  return [fornecedor, forma, dados].map(normalize).join('|');
}

function isComprasPayment(payload) {
  if (!payload || Array.isArray(payload)) return false;
  if (normalize(payload.origem) !== 'COMPRAS') return false;
  if (!Number.isFinite(Number(payload.valor)) || Number(payload.valor) <= 0) return false;
  return true;
}

function mergeDescription(current, incoming) {
  const atual = String(current || '').trim();
  const novo = String(incoming || '').trim();
  if (!atual) return novo;
  if (!novo) return atual;
  if (normalize(atual).includes(normalize(novo))) return atual;
  return `${atual} | ${novo.replace(/^Compra:\s*/i, '')}`;
}

async function findOpenComprasPayment(originalFrom, payload) {
  const status = payload.status || 'PENDENTE';
  const forma = payload.forma_pagamento || null;
  const targetKey = paymentKey(payload);

  let query = originalFrom('financeiro_pagamentos')
    .select('id,origem,origem_id,descricao,favorecido,fornecedor,forma_pagamento,dados_pagamento,valor,status,created_at')
    .eq('origem', 'COMPRAS')
    .eq('status', status)
    .order('created_at', { ascending: false })
    .limit(200);

  if (forma) query = query.eq('forma_pagamento', forma);

  const { data, error } = await query;
  if (error) {
    console.warn('[compras-financeiro-grouping] Falha ao buscar pagamentos existentes:', error);
    return null;
  }

  return (data || []).find((row) => {
    if (String(row.origem_id || '') === String(payload.origem_id || '')) return false;
    if (!sameText(row.forma_pagamento || '', payload.forma_pagamento || '')) return false;
    return paymentKey(row) === targetKey;
  }) || null;
}

async function mergeOrInsertComprasPayment(originalFrom, payload, options) {
  const existing = await findOpenComprasPayment(originalFrom, payload);

  if (!existing) {
    return originalFrom('financeiro_pagamentos').insert(payload, options);
  }

  const valorAtual = Number(existing.valor || 0);
  const valorNovo = Number(payload.valor || 0);
  const updatePayload = {
    valor: valorAtual + valorNovo,
    descricao: mergeDescription(existing.descricao, payload.descricao),
    favorecido: payload.favorecido || existing.favorecido || payload.fornecedor || null,
    fornecedor: payload.fornecedor || existing.fornecedor || null,
    contato: payload.contato || existing.contato || null,
    dados_pagamento: payload.dados_pagamento || existing.dados_pagamento || null,
  };

  console.info('[compras-financeiro-grouping] Pagamento agrupado ao lançamento existente:', {
    pagamento_id: existing.id,
    valor_anterior: valorAtual,
    valor_adicionado: valorNovo,
    valor_total: updatePayload.valor,
  });

  return originalFrom('financeiro_pagamentos')
    .update(updatePayload)
    .eq('id', existing.id)
    .select('*');
}

function installComprasFinanceiroGroupingPatch() {
  if (window[PATCH_FLAG]) return;
  window[PATCH_FLAG] = true;

  const originalFrom = supabase.from.bind(supabase);

  supabase.from = function patchedFrom(table) {
    const builder = originalFrom(table);
    if (table !== 'financeiro_pagamentos') return builder;

    return new Proxy(builder, {
      get(target, prop, receiver) {
        if (prop !== 'insert') {
          const value = Reflect.get(target, prop, receiver);
          return typeof value === 'function' ? value.bind(target) : value;
        }

        return function patchedInsert(payload, options) {
          if (!isComprasPayment(payload)) return target.insert(payload, options);
          return mergeOrInsertComprasPayment(originalFrom, payload, options);
        };
      },
    });
  };
}

installComprasFinanceiroGroupingPatch();
