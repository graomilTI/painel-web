#!/usr/bin/env node
'use strict';

/**
 * Integra o reconhecimento de holerites ao agente existente
 * grm-sync-lancar-notas-fiscais.js.
 *
 * O agente continua consumindo a mesma fila grm_nf_lancamentos alimentada por
 * https://grao1000.com.br/painel/upload-notas-fiscais. O patch apenas adiciona
 * um roteador interno: HOLERITE usa regras de folha; os demais documentos
 * seguem pelo fluxo atual de NF/documento financeiro.
 */

const fs = require('fs');
const path = require('path');
const childProcess = require('child_process');

const root = path.resolve(process.argv[2] || __dirname);
const target = path.join(root, 'grm-sync-lancar-notas-fiscais.js');
const marker = '// [HOLERITE-INTEGRACAO-V1]';

function fail(message) {
  console.error(`[ERRO] ${message}`);
  process.exit(1);
}

function replaceOnce(source, search, replacement, description) {
  if (!source.includes(search)) {
    fail(`Trecho não encontrado para ${description}. O agente pode estar em outra versão.`);
  }
  return source.replace(search, replacement);
}

if (!fs.existsSync(target)) fail(`Arquivo não encontrado: ${target}`);

let source = fs.readFileSync(target, 'utf8');
if (source.includes(marker)) {
  console.log('[OK] Integração de holerites já aplicada. Nenhuma alteração necessária.');
  process.exit(0);
}

const backup = `${target}.backup-holerite-${new Date().toISOString().replace(/[:.]/g, '-')}`;
fs.copyFileSync(target, backup);

const helperBlock = String.raw`
${marker}
const PAYROLL_MONTHS = [
  'JANEIRO', 'FEVEREIRO', 'MARÇO', 'ABRIL', 'MAIO', 'JUNHO',
  'JULHO', 'AGOSTO', 'SETEMBRO', 'OUTUBRO', 'NOVEMBRO', 'DEZEMBRO',
];
const PAYROLL_MONTH_NUMBER = {
  JANEIRO: 1, FEVEREIRO: 2, MARCO: 3, ABRIL: 4, MAIO: 5, JUNHO: 6,
  JULHO: 7, AGOSTO: 8, SETEMBRO: 9, OUTUBRO: 10, NOVEMBRO: 11, DEZEMBRO: 12,
};

function payrollDate(year, month, day) {
  return {
    iso: String(year).padStart(4, '0') + '-' +
      String(month).padStart(2, '0') + '-' +
      String(day).padStart(2, '0'),
    br:
      String(day).padStart(2, '0') + '/' +
      String(month).padStart(2, '0') + '/' +
      String(year).padStart(4, '0'),
  };
}

function payrollReference(text) {
  const normalized = normalizeText(text);
  const match = normalized.match(/\b(JANEIRO|FEVEREIRO|MARCO|ABRIL|MAIO|JUNHO|JULHO|AGOSTO|SETEMBRO|OUTUBRO|NOVEMBRO|DEZEMBRO)\s+DE\s+(20\d{2})\b/);
  if (!match) return null;
  const month = PAYROLL_MONTH_NUMBER[match[1]];
  if (!month) return null;
  return {
    month,
    year: Number(match[2]),
    label: PAYROLL_MONTHS[month - 1] + ' ' + match[2],
    iso: String(match[2]) + '-' + String(month).padStart(2, '0') + '-01',
  };
}

function payrollLastDay(year, month) {
  const date = new Date(Date.UTC(year, month, 0));
  return payrollDate(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

function payrollHolidaySet() {
  const values = Array.isArray(config?.holerite?.feriados) ? config.holerite.feriados : [];
  return new Set(values.map((value) => toIsoDate(value)).filter(Boolean));
}

function payrollFifthBusinessDay(year, month) {
  const saturdayIsBusinessDay = config?.holerite?.sabado_dia_util !== false;
  const holidays = payrollHolidaySet();
  const date = new Date(Date.UTC(year, month, 1));
  let count = 0;
  while (count < 5) {
    const weekDay = date.getUTCDay();
    const current = payrollDate(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
    const business = weekDay !== 0 && (saturdayIsBusinessDay || weekDay !== 6) && !holidays.has(current.iso);
    if (business) count += 1;
    if (count < 5) date.setUTCDate(date.getUTCDate() + 1);
  }
  return payrollDate(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

function payrollEmployees(text) {
  const unique = new Map();
  const lines = String(text || '').replace(/\r/g, '').split('\n');
  const patterns = [
    /^\s*(\d{1,8})\s+([A-ZÀ-ÖØ-Ý][A-ZÀ-ÖØ-Ý .'-]{4,}?)\s+(\d{5,7})\s+(\d+)\s+(\d+)\s*$/i,
    /^\s*(\d{1,8})\s{2,}([A-ZÀ-ÖØ-Ý][A-ZÀ-ÖØ-Ý .'-]{4,}?)\s{2,}(\d{5,7})\b/i,
  ];
  for (const line of lines) {
    for (const pattern of patterns) {
      const match = line.match(pattern);
      if (!match) continue;
      const registration = match[1].trim();
      const name = String(match[2]).replace(/\s+/g, ' ').trim();
      if (registration && name) unique.set(registration, { registration, name });
      break;
    }
  }
  if (!unique.size) {
    const fallback = String(text || '').match(/C[oó]digo\s+Nome\s+do\s+Funcion[aá]rio[\s\S]{0,500}?\n\s*(\d{1,8})\s+([A-ZÀ-ÖØ-Ý][A-ZÀ-ÖØ-Ý .'-]{4,}?)\s+(\d{5,7})\s+\d+\s+\d+/i);
    if (fallback) {
      const registration = fallback[1].trim();
      unique.set(registration, {
        registration,
        name: String(fallback[2]).replace(/\s+/g, ' ').trim(),
      });
    }
  }
  return Array.from(unique.values());
}

function payrollMoneyValues(text) {
  return Array.from(String(text || '').matchAll(/\b\d{1,3}(?:\.\d{3})*,\d{2}\b/g))
    .map((match) => ({ raw: match[0], value: parseMoney(match[0]), index: match.index || 0 }))
    .filter((item) => item.value != null);
}

function payrollNetValue(text, extractedValue) {
  const raw = String(text || '');
  const anchors = [];
  const anchorRegex = /TOTAL\s+DE\s+VENCIMENTOS|VALOR\s+L[IÍ]QUIDO/ig;
  let anchor;
  while ((anchor = anchorRegex.exec(raw))) anchors.push(anchor.index);
  const segments = anchors.map((index) => raw.slice(Math.max(0, index - 200), index + 1800));
  segments.push(raw);

  for (const segment of segments) {
    const values = payrollMoneyValues(segment);
    for (let i = 0; i < values.length; i += 1) {
      for (let j = i + 1; j < Math.min(values.length, i + 8); j += 1) {
        for (let k = j + 1; k < Math.min(values.length, j + 8); k += 1) {
          const gross = values[i].value;
          const discounts = values[j].value;
          const net = values[k].value;
          if (gross > 0 && discounts >= 0 && net > 0 && Math.abs((gross - discounts) - net) <= 0.02) return net;
        }
      }
    }
  }

  const sameLine = raw.match(/VALOR\s+L[IÍ]QUIDO[^\n\d]{0,80}(\d{1,3}(?:\.\d{3})*,\d{2})/i);
  if (sameLine) return parseMoney(sameLine[1]);
  return parseMoney(extractedValue);
}

function detectDocumentKind(extracted, row) {
  if (extensionOf(row?.arquivo_nome) === '.xml') return 'NOTA_FISCAL';
  const text = normalizeText([
    row?.arquivo_nome,
    extracted?.texto_extraido,
    extracted?.natureza_operacao,
  ].filter(Boolean).join(' '));
  let score = 0;
  if (text.includes('HOLERITE') || text.includes('CONTRACHEQUE') || text.includes('RECIBO DE PAGAMENTO')) score += 4;
  if (text.includes('FOLHA MENSAL')) score += 4;
  if (text.includes('VALOR LIQUIDO')) score += 2;
  if (text.includes('NOME DO FUNCIONARIO')) score += 2;
  if (text.includes('SALARIO BASE')) score += 1;
  if (/\bCBO\b/.test(text)) score += 1;
  if (text.includes('MENSALISTA') || text.includes('INTERMITENTE')) score += 2;
  if (text.includes('DIAS NORMAIS') && (text.includes('I.N.S.S') || /\bINSS\b/.test(text))) score += 1;
  return score >= 6 ? 'HOLERITE' : 'NOTA_FISCAL';
}

function applyPayslipRules(extracted, row) {
  const text = String(extracted.texto_extraido || '');
  const reference = payrollReference(text);
  const employees = payrollEmployees(text);
  const employee = employees.length === 1 ? employees[0] : null;
  const normalized = normalizeText(text);
  const intermitente = normalized.includes('INTERMITENTE');
  const mensalista = normalized.includes('MENSALISTA');
  const employmentType = intermitente ? 'Intermitente' : (mensalista ? 'Mensalista' : null);
  const category = intermitente ? 'SALÁRIO DE INTERMITENTE' : (mensalista ? 'SALÁRIO FIXO' : null);
  const accountDate = reference ? payrollLastDay(reference.year, reference.month) : null;
  const dueDate = reference ? payrollFifthBusinessDay(reference.year, reference.month) : null;
  const companyDocument = allCnpjs(text).find((documento) => resolveEmpresa(documento)) || null;
  const companyByName = (config.empresas || []).find((entry) => normalized.includes(normalizeText(entry.nome)))?.nome || null;
  const company = resolveEmpresa(companyDocument) || companyByName || null;
  const value = payrollNetValue(text, extracted.valor_total);
  const documentNumber = employee && reference ? employee.registration + '-' + reference.label : null;

  let data = deepMerge(config.defaults, extracted);
  data = deepMerge(data, {
    tipo_documento_fluxo: 'HOLERITE',
    empresa: company,
    destinatario_cnpj: companyDocument,
    tipo_favorecido: 'Funcionário',
    fornecedor: employee?.name || null,
    fornecedor_cnpj: null,
    funcionario_registro: employee?.registration || null,
    funcionario_nome: employee?.name || null,
    funcionarios_encontrados: employees,
    tipo_contrato: employmentType,
    competencia_iso: reference?.iso || null,
    competencia: reference?.label || null,
    data_conta: accountDate?.br || null,
    data_emissao: accountDate?.br || null,
    data_vencimento: dueDate?.br || null,
    valor_total: value,
    grupo_categoria: 'FOLHA DE PAGAMENTO',
    categoria: category,
    intervalo_cobranca: 'Não Parcelar',
    tipo_documento: 'Holerite',
    numero_documento: documentNumber,
    forma_pagamento: 'PIX',
    identificacao: documentNumber ? 'HOLERITE ' + documentNumber : null,
    descricao: employee && reference ? 'Holerite ' + employee.name + ' - ' + reference.label : 'Holerite enviado pelo painel',
    parcelas: [],
    rateio: {
      data_participacao: accountDate?.br || null,
      tipo_participacao: 'Funcionário',
      identificacao: employee?.name || null,
      valor: value,
    },
  });

  data.valor_total = parseMoney(data.valor_total);
  data.rateio.valor = parseMoney(data.rateio.valor);
  data.numero_documento = String(data.numero_documento || '').trim() || null;
  data.data_conta = toBrDate(data.data_conta);
  data.data_vencimento = toBrDate(data.data_vencimento);
  data.data_emissao = toBrDate(data.data_emissao || data.data_conta);
  data.fingerprint = fingerprintOf(data);
  data.setor = row.setor || 'RH';
  data.origem_extracao = String(data.origem_extracao || 'PDF') + '_HOLERITE';
  return data;
}
`;

source = replaceOnce(
  source,
  "const prompt = 'Transcreva literalmente todo o texto visível neste documento fiscal (nota fiscal, DANFe ou NFS-e), sem resumir e sem interpretar nada. Responda apenas com o texto transcrito, sem markdown e sem comentários.';",
  "const prompt = 'Transcreva literalmente todo o texto visível neste documento financeiro, fiscal ou trabalhista (nota fiscal, DANFe, NFS-e, comprovante ou holerite), sem resumir e sem interpretar nada. Responda apenas com o texto transcrito, sem markdown e sem comentários.';",
  'ampliar o OCR para holerites',
);

source = replaceOnce(
  source,
  '\nasync function extractFileData(filePath, file) {',
  `${helperBlock}\nasync function extractFileData(filePath, file) {`,
  'inserir o reconhecedor de holerites',
);

source = replaceOnce(
  source,
  "    const extracted = await extractFileData(localPath, { name: row.arquivo_nome });\n    const data = applyRules(extracted, row);",
  "    const extracted = await extractFileData(localPath, { name: row.arquivo_nome });\n    const documentKind = detectDocumentKind(extracted, row);\n    const data = documentKind === 'HOLERITE'\n      ? applyPayslipRules(extracted, row)\n      : applyRules(extracted, row);\n    data.tipo_documento_fluxo = documentKind;",
  'rotear documentos para NF ou holerite',
);

source = replaceOnce(
  source,
  "  const supplierSearch = data.fornecedor_cnpj || data.fornecedor;\n  const supplierTarget = data.fornecedor_cnpj || data.fornecedor;\n  await selectField(page, 'Fornecedor', supplierTarget, { search: supplierSearch, mode: 'contains' });",
  "  const supplierSearch = data.fornecedor_cnpj || data.fornecedor;\n  const supplierTarget = data.fornecedor_cnpj || data.fornecedor;\n  const favoredField = normalizeText(data.tipo_favorecido) === 'FUNCIONARIO' ? 'Funcionário' : 'Fornecedor';\n  await selectField(page, favoredField, supplierTarget, { search: supplierSearch, mode: 'contains' });",
  'selecionar Funcionário no favorecido',
);

source = replaceOnce(
  source,
  "  if (!data.categoria || /^PREENCHER/i.test(String(data.categoria))) classificationMissing.push('categoria');\n  if (Array.isArray(data.parcelas)",
  "  if (!data.categoria || /^PREENCHER/i.test(String(data.categoria))) classificationMissing.push('categoria');\n  if (data.tipo_documento_fluxo === 'HOLERITE') {\n    if (!data.funcionario_registro) missing.push('funcionario_registro');\n    if (!data.funcionario_nome) missing.push('funcionario_nome');\n    if (!data.competencia_iso) missing.push('competencia');\n    if (!data.tipo_contrato) classificationMissing.push('tipo_contrato Mensalista/Intermitente');\n    if (Array.isArray(data.funcionarios_encontrados) && data.funcionarios_encontrados.length > 1) {\n      missing.push('o PDF contém mais de um funcionário; envie um arquivo por funcionário');\n    }\n  }\n  if (Array.isArray(data.parcelas)",
  'validar dados específicos de holerite',
);

source = replaceOnce(
  source,
  "    log('INFO', `${row.arquivo_nome}: ${DRY_RUN ? 'validando no GRM (dry-run)' : 'lançando no GRM'} - NF ${data.numero_documento}, ${data.fornecedor || data.fornecedor_cnpj}, R$ ${formatMoneyInput(data.valor_total)}.`);",
  "    const documentLabel = data.tipo_documento_fluxo === 'HOLERITE' ? 'Holerite' : 'NF';\n    log('INFO', `${row.arquivo_nome}: ${DRY_RUN ? 'validando no GRM (dry-run)' : 'lançando no GRM'} - ${documentLabel} ${data.numero_documento}, ${data.fornecedor || data.fornecedor_cnpj}, R$ ${formatMoneyInput(data.valor_total)}.`);",
  'ajustar log do tipo de documento',
);

fs.writeFileSync(target, source, 'utf8');
const check = childProcess.spawnSync(process.execPath, ['--check', target], { encoding: 'utf8' });
if (check.status !== 0) {
  fs.copyFileSync(backup, target);
  fail(`A versão gerada não passou no node --check e o backup foi restaurado. ${check.stderr || check.stdout}`);
}

console.log(`[OK] Integração de holerites aplicada em ${target}`);
console.log(`[OK] Backup criado em ${backup}`);
console.log('[OK] O mesmo agente continua consumindo grm_nf_lancamentos e agora reconhece HOLERITE automaticamente.');
