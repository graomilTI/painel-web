// Estrutura o texto extraído de prints/PDFs de solicitação de O.S.
// Prioridade: campos explicitamente rotulados -> IA nativa do Chrome -> leitura anterior.
// A IA roda localmente pelo Prompt API/Gemini Nano quando disponível.

const KEYS = [
  'contratante_cliente',
  'filial_pagadora',
  'produtor',
  'armazem_embarque',
  'cidade_embarque',
  'cidade_destino',
  'local_destino',
  'numero_contrato',
  'produto',
  'tipo_produto',
  'servico',
  'volume_inicial',
  'regional',
  'troca_notas',
];

const FIELD_ALIASES = [
  ['contratante_cliente', ['contratante / cliente', 'cliente contratante', 'contratante', 'cliente nacional', 'cliente']],
  ['filial_pagadora', ['filial pagadora', 'cliente final / filial', 'cliente final', 'filial']],
  ['produtor', ['nome do produtor', 'produtor']],
  ['armazem_embarque', ['armazem de embarque', 'armazém de embarque', 'local de embarque', 'ponto de embarque', 'fazenda de origem', 'origem']],
  ['cidade_embarque', ['cidade de embarque', 'cidade embarque', 'municipio de embarque', 'município de embarque', 'cidade origem', 'municipio origem', 'município origem']],
  ['cidade_destino', ['cidade de destino', 'cidade destino', 'municipio de destino', 'município de destino', 'municipio destino', 'município destino']],
  ['local_destino', ['local de destino', 'local destino', 'destino final', 'ponto de destino', 'porto destino']],
  ['numero_contrato', ['numero do contrato', 'número do contrato', 'numero contrato', 'número contrato', 'nº contrato', 'n° contrato', 'contrato']],
  ['tipo_produto', ['tipo de produto', 'tipo produto', 'tecnologia do produto', 'tecnologia', 'variedade']],
  ['produto', ['produto', 'cultura', 'mercadoria', 'grao', 'grão']],
  ['servico', ['tipo de servico', 'tipo de serviço', 'servico', 'serviço', 'operacao', 'operação']],
  ['volume_inicial', ['volume inicial (tons)', 'volume inicial tons', 'volume inicial', 'volume em tons', 'volume', 'quantidade tons', 'toneladas']],
  ['regional', ['supervisao', 'supervisão', 'regional', 'coordenacao', 'coordenação']],
  ['troca_notas', ['troca de notas', 'troca notas', 'troca de nf', 'troca nf', 'troca nfe']],
];

function normalize(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[“”‘’]/g, '')
    .replace(/\s+/g, ' ');
}

function clean(value) {
  return String(value ?? '')
    .replace(/^[\s*:#=\-–—|.;]+/, '')
    .replace(/[\s|;]+$/, '')
    .trim();
}

function hasValue(value) {
  return value !== null && value !== undefined && String(value).trim() !== '';
}

function blankFields() {
  return Object.fromEntries(KEYS.map((key) => [key, key === 'volume_inicial' ? null : '']));
}

function stripListPrefix(line) {
  return String(line ?? '')
    .replace(/^\s*[•*\-–—]+\s*/, '')
    .replace(/^\s*\d{1,2}\s*(?:[.)º°:-]\s*)?/, '')
    .trim();
}

function findLabel(line) {
  const original = stripListPrefix(line).replace(/\s+/g, ' ');
  const normalized = normalize(original);

  for (const [key, aliases] of FIELD_ALIASES) {
    for (const alias of aliases.sort((a, b) => b.length - a.length)) {
      const wanted = normalize(alias);
      if (
        normalized === wanted
        || normalized.startsWith(`${wanted}:`)
        || normalized.startsWith(`${wanted}=`)
        || normalized.startsWith(`${wanted} -`)
        || normalized.startsWith(`${wanted} `)
      ) {
        let value = clean(original.slice(alias.length));
        if (!value && normalized.length > wanted.length) value = clean(original.slice(wanted.length));
        return { key, value };
      }
    }
  }
  return null;
}

function canonicalYesNo(value) {
  const text = normalize(value);
  if (!text) return '';
  if (/^(nao|n|no|false|0|sem)\b/.test(text)) return 'NAO';
  if (/^(sim|s|yes|true|1|com)\b/.test(text)) return 'SIM';
  return '';
}

function canonicalProduct(value, wholeText = '') {
  const text = normalize(value || wholeText);
  if (text.includes('soja')) return 'Soja';
  if (text.includes('milho')) return 'Milho';
  if (text.includes('trigo')) return 'Trigo';
  if (text.includes('sorgo')) return 'Sorgo';
  if (text.includes('ervilha')) return 'Ervilha';
  return clean(value);
}

function canonicalProductType(value) {
  const text = normalize(value);
  if (!text) return '';
  if (text.includes('aflatox') && text.includes('neg')) return 'Aflatoxina Negativo';
  // "Declarada" sozinho já significa "Declarado Intacta" no vocabulário da
  // operação (confirmado pelo usuário 04/08) — não precisa da palavra
  // "intacta" junto pra bater.
  if (text.includes('declar') || (text.includes('intacta') && text.includes('nf'))) return 'Declarado Intacta';
  if (text.includes('intacta') && text.includes('neg')) return 'Intacta Negativo';
  if (text.includes('intacta') && text.includes('pos')) return 'Intacta Positivo';
  if (text.includes('teste')) return 'OS com teste';
  if (text.includes('particip')) return 'Participante';
  if (text.includes('transgen')) return 'Transgênico';
  if (text.includes('convenc')) return 'Convencional';
  if (text.includes('nao defin') || text.includes('não defin')) return 'Não Definido';
  return clean(value);
}

function canonicalService(value) {
  const text = normalize(value);
  if (!text) return '';
  if (text.includes('transb') && text.includes('saida')) return 'CLASSIFICAÇÃO TRANSB. SAÍDA';
  if (text.includes('transb') && text.includes('entrada')) return 'CLASSIFICAÇÃO TRANSB. ENTRADA';
  if (text.includes('acompanh') && text.includes('embarque')) return 'ACOMPANHAMENTO DE EMBARQUE';
  if (text.includes('auditoria')) return 'AUDITORIA';
  if (/\bfob\b/.test(text)) return 'FOB';
  if (/\bcif\b/.test(text)) return 'CIF';
  return clean(value).toUpperCase();
}

function parseNumber(value) {
  let text = String(value ?? '').replace(/\s/g, '').replace(/[^0-9,.-]/g, '');
  if (!text) return null;
  if (text.includes(',') && text.includes('.')) {
    text = text.lastIndexOf(',') > text.lastIndexOf('.')
      ? text.replace(/\./g, '').replace(',', '.')
      : text.replace(/,/g, '');
  } else if (text.includes(',')) {
    text = text.replace(/\./g, '').replace(',', '.');
  }
  const number = Number(text);
  return Number.isFinite(number) ? number : null;
}

const ALL_ALIASES = FIELD_ALIASES.flatMap(([, aliases]) => aliases);

// Falha de leitura já vista ao vivo: a IA/OCR devolve o próprio texto dos
// RÓTULOS dos campos como se fosse valor (ex.: produto = "Tipo de produto *
// Serviço * Volume inicial ("), normalmente quando o documento lido é a
// própria tela de Abrir OS ou tem várias etiquetas coladas sem separador
// que o parser reconheça. Um valor de verdade não contém 2+ nomes de OUTROS
// campos — se contiver, é lixo de leitura, não dado real.
function looksLikeLabelBleed(value) {
  const text = normalize(value);
  if (!text) return false;
  let hits = 0;
  for (const alias of ALL_ALIASES) {
    if (text.includes(normalize(alias))) {
      hits += 1;
      if (hits >= 2) return true;
    }
  }
  return false;
}

function discardLabelBleed(fields) {
  const result = { ...fields };
  for (const key of KEYS) {
    if (key === 'volume_inicial') continue;
    if (looksLikeLabelBleed(result[key])) result[key] = '';
  }
  return result;
}

function canonicalize(fields, wholeText = '') {
  const result = { ...blankFields(), ...discardLabelBleed(fields || {}) };
  result.produto = canonicalProduct(result.produto, wholeText);
  result.tipo_produto = canonicalProductType(result.tipo_produto);
  result.servico = canonicalService(result.servico);
  result.troca_notas = canonicalYesNo(result.troca_notas);
  result.volume_inicial = parseNumber(result.volume_inicial);
  result.numero_contrato = clean(result.numero_contrato).replace(/\s+/g, '');
  return result;
}

// numero_contrato e volume_inicial são os únicos campos legitimamente
// numéricos. Nos outros, um valor puramente numérico quase sempre é lixo de
// tabela (ex.: cabeçalho "PRODUTO" sozinho seguido, na linha de baixo, por um
// código NCM de outra coluna — visto ao vivo com e-mail da Cargill).
const NUMERIC_VALUE_ALLOWED = new Set(['numero_contrato', 'volume_inicial']);

function isNumericOnly(value) {
  return /^\d+([.,]\d+)?$/.test(String(value ?? '').trim());
}

function parseExplicitLabels(text) {
  const result = blankFields();
  const lines = String(text ?? '')
    .replace(/\r/g, '')
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  for (let index = 0; index < lines.length; index += 1) {
    const match = findLabel(lines[index]);
    if (!match) continue;

    let value = match.value;
    if (!value && lines[index + 1] && !findLabel(lines[index + 1])) value = clean(lines[index + 1]);
    if (!value) continue;
    if (isNumericOnly(value) && !NUMERIC_VALUE_ALLOWED.has(match.key)) continue;
    result[match.key] = value;
  }

  // Alguns OCRs juntam toda a mensagem em uma linha. Recria quebras antes de campos numerados.
  if (Object.values(result).filter(hasValue).length < 3) {
    const labelPattern = FIELD_ALIASES.flatMap(([, aliases]) => aliases)
      .sort((a, b) => b.length - a.length)
      .map((alias) => normalize(alias).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('|');
    const normalizedText = normalize(text);
    const regex = new RegExp(`(?:^|\\s)(?:\\d{1,2}\\s*)?(${labelPattern})\\s*[:=-]\\s*(.*?)(?=\\s+(?:\\d{1,2}\\s*)?(?:${labelPattern})\\s*[:=-]|$)`, 'gi');
    let match;
    while ((match = regex.exec(normalizedText))) {
      const label = normalize(match[1]);
      const item = FIELD_ALIASES.find(([, aliases]) => aliases.some((alias) => normalize(alias) === label));
      const candidate = clean(match[2]);
      if (item && !hasValue(result[item[0]]) && !(isNumericOnly(candidate) && !NUMERIC_VALUE_ALLOWED.has(item[0]))) {
        result[item[0]] = candidate;
      }
    }
  }

  return canonicalize(result, text);
}

function parseJsonObject(value) {
  const raw = String(value ?? '').trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const parsed = JSON.parse(raw.slice(start, end + 1));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

async function chromeAiFields(text, onProgress) {
  const LanguageModelApi = globalThis.LanguageModel;
  if (!LanguageModelApi?.availability || !LanguageModelApi?.create) return null;

  let availability;
  try {
    availability = await LanguageModelApi.availability();
  } catch {
    return null;
  }
  if (availability === 'unavailable') return null;

  if (availability === 'downloadable' || availability === 'downloading') {
    onProgress?.('preparando IA local do Chrome');
  } else {
    onProgress?.('IA local identificando os campos');
  }

  let session;
  try {
    session = await LanguageModelApi.create({
      monitor(monitor) {
        monitor.addEventListener('downloadprogress', (event) => {
          const loaded = Number(event.loaded || 0);
          const percent = loaded <= 1 ? Math.round(loaded * 100) : Math.round(loaded);
          onProgress?.(`baixando IA local · ${Math.max(0, Math.min(100, percent))}%`);
        });
      },
    });

    const prompt = `You extract fields from Brazilian Portuguese logistics requests for opening an O.S. (service order).
The source may be a WhatsApp screenshot, paragraph, list, forwarded message, table, or noisy OCR. Labels and order can vary.
Return ONLY one valid JSON object. Never invent a value. Use an empty string when absent, and null for an absent numeric volume.

Required JSON keys:
{
  "contratante_cliente": "",
  "filial_pagadora": "",
  "produtor": "",
  "armazem_embarque": "",
  "cidade_embarque": "",
  "cidade_destino": "",
  "local_destino": "",
  "numero_contrato": "",
  "produto": "",
  "tipo_produto": "",
  "servico": "",
  "volume_inicial": null,
  "regional": "",
  "troca_notas": ""
}

Interpretation rules:
- ORIGEM, fazenda, armazém or ponto de origem normally means armazem_embarque, not cidade_embarque.
- Keep cidade_embarque and cidade_destino separate from local/armazém.
- Preserve leading zeroes in numero_contrato.
- volume_inicial is a number in tons.
- troca_notas must be SIM, NAO, or empty.
- Canonical tipo_produto options: Aflatoxina Negativo, Convencional, Declarado Intacta, Intacta Negativo, Intacta Positivo, Não Definido, OS com teste, Participante, Transgênico.
- Canonical servico options: FOB, CIF, AUDITORIA, CLASSIFICAÇÃO TRANSB. SAÍDA, ACOMPANHAMENTO DE EMBARQUE, CLASSIFICAÇÃO TRANSB. ENTRADA.
- Phrases such as "Intacta declarada", "declarada Intacta" or "Intacta declarada NF" map to "Declarado Intacta".

SOURCE TEXT:
${String(text).slice(0, 12000)}`;

    const response = await session.prompt(prompt);
    const parsed = parseJsonObject(response);
    return parsed ? canonicalize(parsed, text) : null;
  } catch (error) {
    console.warn('[logistica-os-ai] IA local indisponível:', error);
    return null;
  } finally {
    try { session?.destroy?.(); } catch { /* sem ação */ }
  }
}

function mergeFields(existing, ai, explicit) {
  const result = canonicalize(existing || {});

  // A IA preenche lacunas e interpreta texto livre.
  for (const key of KEYS) {
    if (!hasValue(result[key]) && hasValue(ai?.[key])) result[key] = ai[key];
  }

  // Valores encontrados ao lado de rótulos explícitos têm precedência máxima.
  for (const key of KEYS) {
    if (hasValue(explicit?.[key])) result[key] = explicit[key];
  }

  return canonicalize(result);
}

// produtor é o único campo opcional do formulário — tolera ele (e mais um)
// faltando antes de considerar "já tá bom o suficiente".
const CAMPOS_MINIMOS_SEM_IA_LOCAL = KEYS.length - 2;

// Falha já vista ao vivo: depois que o download do modelo chega a 100%, o
// Chrome ainda precisa carregar/inicializar o Gemini Nano, e isso pode
// travar indefinidamente em máquinas sem GPU/NPU compatível (o await de
// `session.create` nunca resolve nem rejeita). Sem limite de tempo aqui, o
// botão fica preso em "baixando IA local · 100%" pra sempre. Se estourar o
// prazo, segue sem IA local — a leitura por rótulo explícito já cobre a
// maioria dos casos.
const AI_LOCAL_TIMEOUT_MS = 20000;

function withTimeout(promise, ms, onTimeout) {
  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      onTimeout?.();
      resolve(null);
    }, ms);
    promise.then(
      (value) => { if (!settled) { settled = true; clearTimeout(timer); resolve(value); } },
      () => { if (!settled) { settled = true; clearTimeout(timer); resolve(null); } },
    );
  });
}

export async function enhanceLogisticaOsFields(text, existingFields = {}, onProgress) {
  const explicit = parseExplicitLabels(text);

  // A IA local do Chrome (Gemini Nano) é a parte mais lenta do pipeline —
  // pode baixar dezenas de MB na primeira vez que roda no navegador. Antes
  // de pagar esse custo, tenta só com o que já veio do provedor online (se
  // houve) + leitura por rótulo explícito (regex, instantâneo); só recorre
  // à IA local quando sobra pouco preenchido.
  const semIaLocal = mergeFields(existingFields, null, explicit);
  const preenchidos = KEYS.filter((key) => hasValue(semIaLocal[key])).length;
  if (preenchidos >= CAMPOS_MINIMOS_SEM_IA_LOCAL) return semIaLocal;

  const ai = await withTimeout(
    chromeAiFields(text, onProgress),
    AI_LOCAL_TIMEOUT_MS,
    () => onProgress?.('IA local demorou demais, seguindo sem ela...'),
  );
  return mergeFields(semIaLocal, ai, explicit);
}
