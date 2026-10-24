// Regras puras do webhook da Hospedagem: leitura da resposta que o hotel manda pelo WhatsApp (BotConversa).
// Sem Deno nem rede, para testar no Node: tests/hospedagem-webhook-regras.test.mjs. O index.ts só orquestra (Supabase e resposta HTTP).
// Movidas de index.ts sem mudar o comportamento (tipos removidos com node:module stripTypeScriptTypes).

export function digits(value) {
  return String(value ?? "").replace(/\D/g, "");
}

export function normalizeKey(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function pick(obj, paths) {
  for (const path of paths) {
    const value = path.split(".").reduce((acc, key) => acc?.[key], obj);
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return null;
}

export function normalizePhone(value) {
  const raw = digits(value);
  if (!raw) return "";
  if (raw.startsWith("55") && raw.length >= 12) return raw;
  return raw.length >= 10 ? `55${raw}` : raw;
}

export function extractCode(text) {
  return text.toUpperCase().match(/H(?:JAN|FEV|MAR|ABR|MAI|JUN|JUL|AGO|SET|OUT|NOV|DEZ)\d{2,}|HOSP[-\s]?\d{3,}/)?.[0]?.replace(/\s/g, "-") || null;
}

export function flattenValues(value, prefix = "", output = new Map()) {
  if (value === null || value === undefined) return output;
  if (Array.isArray(value)) {
    value.forEach((item, index) => flattenValues(item, `${prefix}.${index}`, output));
    return output;
  }
  if (typeof value === "object") {
    const record = value ;
    const fieldName = record.name ?? record.key ?? record.field ?? record.slug ?? record.label;
    const fieldValue = record.value ?? record.answer ?? record.response ?? record.content;
    if (fieldName !== undefined && fieldValue !== undefined && typeof fieldValue !== "object") {
      output.set(normalizeKey(fieldName), fieldValue);
    }
    Object.entries(record).forEach(([key, item]) => {
      const path = prefix ? `${prefix}.${key}` : key;
      flattenValues(item, path, output);
    });
    return output;
  }
  const full = normalizeKey(prefix);
  const leaf = normalizeKey(prefix.split(".").pop());
  if (full) output.set(full, value);
  if (leaf && !output.has(leaf)) output.set(leaf, value);
  return output;
}

export function parseLabelledText(text, output) {
  String(text || "").split(/\r?\n/).forEach((line) => {
    const match = line.match(/^\s*([^:=-]{2,60})\s*[:=-]\s*(.+?)\s*$/);
    if (!match) return;
    const key = normalizeKey(match[1]);
    if (key && !output.has(key)) output.set(key, match[2]);
  });
}

export function valueFrom(map, aliases) {
  const normalizedAliases = aliases.map(normalizeKey);
  for (const alias of normalizedAliases) {
    if (map.has(alias)) return map.get(alias);
  }
  for (const [key, value] of map.entries()) {
    if (normalizedAliases.some((alias) => key.endsWith(`_${alias}`))) return value;
  }
  return null;
}

export function parseBoolean(value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  const normalized = normalizeKey(value);
  if (!normalized) return null;
  if (["sim", "s", "yes", "true", "1", "disponivel", "disponibilidade_confirmada", "incluido", "aceita"].includes(normalized)) return true;
  if (["nao", "n", "no", "false", "0", "indisponivel", "sem_disponibilidade", "nao_incluido", "nao_aceita"].includes(normalized)) return false;
  if (normalized.includes("nao") || normalized.includes("indispon")) return false;
  if (normalized.includes("sim") || normalized.includes("disponiv")) return true;
  return null;
}

export function parseMoney(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  let raw = String(value ?? "").trim();
  if (!raw) return null;
  raw = raw.replace(/[^0-9,.-]/g, "");
  if (!raw) return null;
  if (raw.includes(",")) raw = raw.replace(/\./g, "").replace(",", ".");
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

export function quoteFields(body, text) {
  const values = flattenValues(body);
  parseLabelledText(text, values);
  return {
    code: String(valueFrom(values, ["codigo", "codigo_hospedagem", "solicitacao", "solicitacao_codigo"]) || ""),
    flowId: String(valueFrom(values, ["flow_id", "flowid", "fluxo_id", "id_fluxo"]) || ""),
    availability: parseBoolean(valueFrom(values, ["disponibilidade", "disponivel", "tem_disponibilidade", "possui_disponibilidade"])),
    dailyValue: parseMoney(valueFrom(values, ["valor_diaria", "diaria", "valor_da_diaria", "preco_diaria"])),
    totalValue: parseMoney(valueFrom(values, ["valor_total", "total", "total_cotacao", "valor_total_cotacao"])),
    acceptsCheckout: parseBoolean(valueFrom(values, ["aceita_pagamento_checkout", "pagamento_checkout", "aceita_checkout", "pagar_checkout"])),
    breakfastIncluded: parseBoolean(valueFrom(values, ["cafe_incluso", "cafe_da_manha", "cafe_da_manha_incluso", "inclui_cafe"])),
    lunchIncluded: parseBoolean(valueFrom(values, ["almoco_incluso", "almoco", "inclui_almoco"])),
    dinnerIncluded: parseBoolean(valueFrom(values, ["janta_inclusa", "jantar_incluso", "janta", "inclui_janta"])),
    parkingIncluded: parseBoolean(valueFrom(values, ["estacionamento_incluso", "estacionamento", "inclui_estacionamento"])),
    emitsInvoice: parseBoolean(valueFrom(values, ["emite_nota_fiscal", "emite_nf", "nota_fiscal", "emissao_nota_fiscal"])),
    paymentMethods: String(valueFrom(values, ["formas_pagamento", "forma_pagamento", "pagamento"]) || "").split(/[,;|/]+/).map((v)=>v.trim()).filter(Boolean),
    rooms: valueFrom(values, ["disponibilidade_quartos", "quartos", "composicao_quartos", "tipos_quartos"]),
    notes: String(valueFrom(values, ["observacoes", "observacao", "comentarios", "detalhes", "mensagem_final"]) || ""),
  };
}

export function hasStructuredQuote(fields) {
  return [
    fields.availability,
    fields.dailyValue,
    fields.totalValue,
    fields.acceptsCheckout,
    fields.breakfastIncluded,
    fields.parkingIncluded,
    fields.lunchIncluded,
    fields.dinnerIncluded,
    fields.emitsInvoice,
  ].some((value) => value !== null) || Boolean(fields.notes || fields.code);
}

export function quoteSummary(fields) {
  return [
    fields.availability === null ? "" : `Disponibilidade: ${fields.availability ? "Sim" : "Não"}`,
    fields.dailyValue === null ? "" : `Diária: R$ ${fields.dailyValue.toFixed(2)}`,
    fields.totalValue === null ? "" : `Total: R$ ${fields.totalValue.toFixed(2)}`,
    fields.breakfastIncluded === null ? "" : `Café: ${fields.breakfastIncluded ? "Sim" : "Não"}`,
    fields.lunchIncluded === null ? "" : `Almoço: ${fields.lunchIncluded ? "Sim" : "Não"}`,
    fields.dinnerIncluded === null ? "" : `Janta: ${fields.dinnerIncluded ? "Sim" : "Não"}`,
    fields.parkingIncluded === null ? "" : `Estacionamento: ${fields.parkingIncluded ? "Sim" : "Não"}`,
    fields.acceptsCheckout === null ? "" : `Pagamento no checkout: ${fields.acceptsCheckout ? "Sim" : "Não"}`,
    fields.emitsInvoice === null ? "" : `Emite NF: ${fields.emitsInvoice ? "Sim" : "Não"}`,
    fields.notes,
  ].filter(Boolean).join(" | ");
}
