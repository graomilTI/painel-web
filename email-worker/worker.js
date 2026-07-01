import 'dotenv/config';
import { createDecipheriv, createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import nodemailer from 'nodemailer';
import { XMLParser } from 'fast-xml-parser';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const EMAIL_CREDENTIALS_KEY = process.env.EMAIL_CREDENTIALS_KEY || '';
const INTERVAL_SECONDS = Number(process.env.EMAIL_WORKER_INTERVAL_SECONDS || 180);
const MAX_ANEXO_IA_BYTES = 8 * 1024 * 1024;
const DEFAULT_EXCLUDED_MAILBOXES = [
  '\\Sent',
  '\\Drafts',
  '\\Trash',
  '\\Junk',
  'sent',
  'sent items',
  'enviados',
  'itens enviados',
  'drafts',
  'rascunhos',
  'trash',
  'lixeira',
  'junk',
  'spam'
];
const xmlParser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Configure SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

// Carregado sob demanda: o pacote 'openai' usa um shim de detecção de runtime
// (_shims/auto/runtime) que não resolve em Node 14, então só importamos se a
// chave estiver configurada.
let openaiClientPromise = null;
function getOpenAI() {
  if (!process.env.OPENAI_API_KEY) return Promise.resolve(null);
  if (!openaiClientPromise) {
    openaiClientPromise = import('openai')
      .then(({ default: OpenAI }) => new OpenAI({ apiKey: process.env.OPENAI_API_KEY }))
      .catch((err) => {
        console.warn('Falha ao carregar pacote openai, seguindo só com regras:', err.message);
        return null;
      });
  }
  return openaiClientPromise;
}

function text(value) {
  return String(value || '').replace(/\u0000/g, '').trim();
}

function normalize(value) {
  return text(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function nullableText(value) {
  const cleaned = text(value);
  return cleaned || null;
}

function sanitizeForPostgres(value) {
  if (typeof value === 'string') return text(value);
  if (Array.isArray(value)) return value.map(sanitizeForPostgres);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, val]) => [key, sanitizeForPostgres(val)]));
  }
  return value;
}

function envList(name, fallback = []) {
  const value = text(process.env[name]);
  if (!value) return fallback;
  return value.split(',').map((item) => item.trim()).filter(Boolean);
}

function mailboxKey(value) {
  return normalize(value).replace(/^inbox$/i, 'inbox');
}

function mailboxFlagList(mailbox) {
  return Array.from(mailbox.flags || []).map((flag) => text(flag));
}

function shouldSyncMailbox(mailbox, account) {
  if (!mailbox?.path || mailbox.disabled) return false;
  const pathKey = mailboxKey(mailbox.path);
  const include = envList('EMAIL_WORKER_INCLUDE_MAILBOXES');
  if (include.length) return include.map(mailboxKey).includes(pathKey);

  const excluded = envList('EMAIL_WORKER_EXCLUDE_MAILBOXES', DEFAULT_EXCLUDED_MAILBOXES).map(mailboxKey);
  const flagKeys = mailboxFlagList(mailbox).map(mailboxKey);
  if (excluded.includes(pathKey) || flagKeys.some((flag) => excluded.includes(flag))) return false;

  const primary = mailboxKey(account.pasta_entrada || 'INBOX');
  return pathKey === primary || mailbox.listed !== false;
}

async function loadMailboxStates(accountId) {
  const { data, error } = await supabase
    .from('email_mailbox_states')
    .select('*')
    .eq('account_id', accountId);
  if (error) throw error;
  return new Map((data || []).map((row) => [row.mailbox_path, row]));
}

async function saveMailboxState(accountId, mailboxPath, payload) {
  const { error } = await supabase.from('email_mailbox_states').upsert({
    account_id: accountId,
    mailbox_path: mailboxPath,
    ...payload,
    updated_at: new Date().toISOString()
  }, { onConflict: 'account_id,mailbox_path' });
  if (error) throw error;
}

function decryptCredential(value) {
  const encrypted = String(value || '');
  if (!encrypted.startsWith('enc:v1:')) return encrypted;
  if (EMAIL_CREDENTIALS_KEY.length < 32) {
    throw new Error('EMAIL_CREDENTIALS_KEY deve ser igual no Supabase e no worker.');
  }

  const [, , ivBase64, payloadBase64] = encrypted.split(':');
  const payload = Buffer.from(payloadBase64, 'base64');
  const ciphertext = payload.subarray(0, -16);
  const authTag = payload.subarray(-16);
  const key = createHash('sha256').update(EMAIL_CREDENTIALS_KEY).digest();
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivBase64, 'base64'));
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

function messageId(value, fallback = true) {
  const cleaned = text(value).replace(/^<|>$/g, '');
  if (cleaned || !fallback) return cleaned || null;
  return `sem-message-id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

// Chaves alinhadas com email_gestores_regionais.regional. Priorizamos códigos de assunto
// de "PROGRAMAÇÃO" (pgo/mga/csc/br163/vale sul/ms norte-sul/pa pgm) e nomes de estado por
// extenso, que são inequívocos. Evitamos abreviações de 2-3 letras soltas (tipo "ma", "pa")
// e nomes de cidade tirados do cadastro de colaboradores porque aquele cadastro tem cidades
// repetidas em mais de uma regional (ex: "Rio Verde" aparece em Goiás e no MT2) — usar isso
// arriscaria encaminhar pro gestor errado.
function extractRegional(content) {
  const source = normalize(content);
  const checks = [
    ['MATO GROSSO MT3', ['vale sul', 'confresa', 'querencia', 'mt3', 'mato grosso mt3']],
    ['MATO GROSSO MT1', ['br163 sul', 'br163 norte', 'br 163', 'mt1', 'sinop', 'sorriso', 'lucas do rio verde']],
    ['MATO GROSSO MT2', ['mt2', 'rondonopolis', 'primavera do leste']],
    ['MATO GROSSO MT4', ['mt4', 'campo novo do parecis', 'comodoro']],
    ['PR PONTA GROSSA', ['pr pgo', 'ponta grossa']],
    ['PR CASCAVEL', ['pr csc', 'cascavel', 'oeste pr']],
    ['PR LONDRINA', ['londrina']],
    ['PR MARINGA', ['pr mga', 'maringa', 'paranagua', 'terminal', 'terminais']],
    ['GOIAS', ['goias', 'goiania', 'jatai']],
    ['MATO GROSSO DO SUL', ['ms norte', 'ms sul', 'mato grosso do sul']],
    ['MINAS GERAIS', ['minas gerais']],
    ['BAHIA', ['bahia']],
    ['MARANHAO', ['maranhao']],
    ['PARA', ['pa pgm', 'paragominas']],
    ['PARAGUAI', ['paraguai']],
    ['RIO GRANDE DO SUL', ['rio grande do sul']],
    ['SAO PAULO', ['sao paulo']],
    ['TOCANTINS', ['tocantins', 'palmas', 'gurupi']]
  ];
  return checks.find(([, words]) => words.some((word) => source.includes(normalize(word))))?.[0] || null;
}

function resolveEncaminhamento(rule, regional, gestores) {
  const para = [];
  if (rule?.destino_fixo_email) para.push(rule.destino_fixo_email);
  if (rule?.destino_regional && regional) {
    const gestor = gestores?.get(regional);
    if (gestor?.gestor_email) para.push(gestor.gestor_email);
  }
  return {
    encaminhar_sugerido_para: para.length ? [...new Set(para)].join(',') : null,
    encaminhar_sugerido_cc: rule?.cc_fixo_email || null
  };
}

// Remove artefatos de assinatura/HTML->texto que o Outlook deixa no corpo em texto puro:
// "[cid:xxxx]" (imagem quebrada) e "endereco<mailto:outro>"/"link<http://...>" (hyperlink
// cujo destino não bate com o texto visível). Sem isso, esses trechos entravam no resumo da
// IA e podiam confundir os regexes de dados detectados (ver extractData).
function stripArtifacts(content) {
  return text(content)
    .replace(/\[cid:[^\]]*\]/gi, ' ')
    .replace(/<(?:mailto|https?|cid):[^>]*>/gi, ' ')
    .replace(/[ \t]{2,}/g, ' ');
}

function extractData(content) {
  const raw = text(content);
  return {
    // Só o formato real usado nos contratos da empresa (ex: P31899.000). Um fallback
    // genérico de "4+ dígitos" já capturou telefone da assinatura em vez de contrato.
    contrato: raw.match(/\bP\d{5}\.\d{3}\b/i)?.[0] || null,
    placa: raw.match(/\b[A-Z]{3}[0-9][A-Z0-9][0-9]{2}\b/i)?.[0] || raw.match(/\b[A-Z]{3}-?\d{4}\b/i)?.[0] || null,
    // Limite de tamanho pra não capturar um trecho gigante de disclaimer/assinatura quando
    // o texto tem uma sequência longa de letras/números logo depois de "OS".
    os: raw.match(/\bOS\s*[:#-]?\s*([A-Z0-9./-]{3,15})\b/i)?.[1] || null,
    cnpj: raw.match(/\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/)?.[0] || null,
    cpf: raw.match(/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/)?.[0] || null,
    valor: raw.match(/R\$\s*[0-9.]+,[0-9]{2}/i)?.[0] || null
  };
}

function normalizeLabel(value) {
  return normalize(value).replace(/[^a-z0-9/ ]/g, '').trim();
}

// E-mails de solicitação de atendimento/embarque costumam vir como uma lista de
// "Rótulo: valor" (um por linha), mas cada remetente usa palavras um pouco diferentes pro
// mesmo campo (ex: "Fornecedor" e "Produtor" pro mesmo conceito). Por isso o match é por
// sinônimo normalizado, não por rótulo exato -- e quando o rótulo não aparece no e-mail, o
// campo fica null (nem todo e-mail desse tipo traz todos os campos).
const FORM_FIELD_SYNONYMS = {
  contratante_cliente: ['contratante/cliente', 'contratante cliente', 'contratante', 'cliente'],
  filial_pagadora: ['filial pagadora', 'filial'],
  produtor: ['produtor', 'fornecedor'],
  armazem_embarque: ['armazem de embarque', 'armazem embarque', 'local embarque', 'local de embarque'],
  cidade_embarque: ['cidade de embarque', 'cidade embarque'],
  cidade_destino: ['cidade destino', 'cidade de destino'],
  local_destino: ['local destino', 'local de destino'],
  numero_contrato: ['numero do contrato', 'numero contrato', 'no contrato'],
  produto_completo: ['produto'],
  volume_inicial: ['volume inicial', 'volume'],
  outros_a_cobrar: ['outros a cobrar', 'outros cobrar'],
  regional_informado: ['regional']
};

const PRODUTOS_CONHECIDOS = ['MILHO', 'SOJA', 'TRIGO', 'SORGO', 'ARROZ', 'FEIJÃO', 'FEIJAO', 'ALGODÃO', 'ALGODAO', 'FARELO DE SOJA', 'FARELO'];

// "Produto: MILHO EM GRAOS" junta produto + tipo numa linha só. Separa pelo nome de grão
// conhecido no começo do valor; se não reconhecer, guarda tudo em "produto" e deixa
// "tipo_produto" vazio em vez de arriscar um corte errado.
function splitProdutoTipo(valor) {
  const v = text(valor);
  const upper = v.toUpperCase();
  const match = PRODUTOS_CONHECIDOS.find((p) => upper.startsWith(p));
  if (!match) return { produto: v || null, tipo_produto: null };
  const resto = v.slice(match.length).trim();
  return { produto: match, tipo_produto: resto || null };
}

function extractFormFields(content) {
  const found = {};
  for (const line of text(content).split(/\r?\n/)) {
    const m = line.match(/^\s*([^:]{2,40}):\s*(.+?)\s*$/);
    if (!m) continue;
    const label = normalizeLabel(m[1]);
    const value = text(m[2]);
    if (!value) continue;
    for (const [field, synonyms] of Object.entries(FORM_FIELD_SYNONYMS)) {
      if (!found[field] && synonyms.includes(label)) found[field] = value;
    }
  }
  const { produto, tipo_produto } = found.produto_completo ? splitProdutoTipo(found.produto_completo) : { produto: null, tipo_produto: null };
  return {
    contratante_cliente: found.contratante_cliente || null,
    filial_pagadora: found.filial_pagadora || null,
    produtor: found.produtor || null,
    armazem_embarque: found.armazem_embarque || null,
    cidade_embarque: found.cidade_embarque || null,
    cidade_destino: found.cidade_destino || null,
    local_destino: found.local_destino || null,
    numero_contrato: found.numero_contrato || null,
    produto,
    tipo_produto,
    volume_inicial: found.volume_inicial || null,
    outros_a_cobrar: found.outros_a_cobrar || null,
    regional_informado: found.regional_informado || null
  };
}

function pickNonEmpty(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj || {})) {
    if (v !== null && v !== undefined && v !== '') out[k] = typeof v === 'object' ? v : String(v);
  }
  return out;
}

function interpretNfeXml(parsedXml) {
  const proc = parsedXml.nfeProc || parsedXml.NFe || parsedXml;
  const nfe = proc.NFe || proc;
  const infNFe = nfe?.infNFe;
  if (!infNFe) return null;
  const ide = infNFe.ide || {};
  const emit = infNFe.emit || {};
  const dest = infNFe.dest || {};
  const total = infNFe.total?.ICMSTot || {};
  const chave = text(infNFe['@_Id'] || proc.protNFe?.infProt?.chNFe).replace(/^NFe/i, '');
  return pickNonEmpty({
    tipo_documento: 'NF-e',
    chave_nfe: chave,
    numero_nf: ide.nNF,
    serie_nf: ide.serie,
    data_emissao_nf: ide.dhEmi || ide.dEmi,
    valor_nf: total.vNF,
    emitente_nome: emit.xNome,
    emitente_cnpj: emit.CNPJ,
    destinatario_nome: dest.xNome,
    destinatario_cnpj: dest.CNPJ || dest.CPF
  });
}

function interpretNfseXml(parsedXml) {
  const comp = parsedXml.CompNfse || parsedXml.ConsultarNfseResposta || parsedXml.GerarNfseResposta || parsedXml;
  const nfse = comp?.Nfse?.InfNfse || comp?.InfNfse || comp?.Nfse;
  if (!nfse) return null;
  const decl = nfse.DeclaracaoPrestacaoServico?.InfDeclaracaoPrestacaoServico;
  const servico = nfse.Servico || decl?.Servico;
  const valores = nfse.ValoresNfse || servico?.Valores || {};
  const prestador = nfse.PrestadorServico || decl?.Prestador || {};
  const tomador = nfse.TomadorServico || servico?.Tomador || decl?.Tomador || {};
  const prestadorId = prestador.IdentificacaoPrestador || {};
  const tomadorId = tomador.IdentificacaoTomador?.CpfCnpj || tomador.IdentificacaoTomador || {};
  return pickNonEmpty({
    tipo_documento: 'NFS-e',
    numero_nfse: nfse.Numero || decl?.Numero,
    data_emissao_nf: nfse.DataEmissao || decl?.DataEmissao,
    valor_servico: valores.ValorServicos || valores.ValorLiquidoNfse,
    prestador_nome: prestador.RazaoSocial,
    prestador_cnpj: prestadorId.Cnpj || prestador.Cnpj,
    tomador_nome: tomador.RazaoSocial,
    tomador_cnpj: tomadorId.Cnpj
  });
}

function interpretXmlAttachment(buffer) {
  try {
    const xml = xmlParser.parse(buffer.toString('utf-8'));
    return interpretNfeXml(xml) || interpretNfseXml(xml) || {};
  } catch (err) {
    console.warn('Falha ao interpretar XML do anexo:', err.message);
    return {};
  }
}

const ANEXO_IA_PROMPT = 'Extraia dados financeiros deste documento (boleto, comprovante de pagamento, recibo ou nota fiscal). Responda apenas JSON com os campos: tipo_documento (BOLETO, COMPROVANTE, RECIBO, NF-e, NFS-e ou OUTRO), valor (ex: "R$ 1.234,56"), vencimento (DD/MM/AAAA), favorecido_nome, favorecido_documento (CNPJ ou CPF), pagador_nome, chave_pix, numero_documento, banco. Use null para campos não encontrados na imagem/texto.';

async function interpretAttachmentWithAI(attachment) {
  const openai = await getOpenAI();
  if (!openai) return null;
  const mime = (attachment.contentType || '').toLowerCase();
  const buffer = attachment.content;
  if (!buffer || buffer.length > MAX_ANEXO_IA_BYTES) return null;
  try {
    if (/^image\/(jpe?g|png|webp|gif)$/.test(mime)) {
      const b64 = buffer.toString('base64');
      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: ANEXO_IA_PROMPT },
          { role: 'user', content: [
            { type: 'text', text: 'Extraia os dados da imagem a seguir.' },
            { type: 'image_url', image_url: { url: `data:${mime};base64,${b64}` } }
          ] }
        ]
      });
      return pickNonEmpty(JSON.parse(response.choices?.[0]?.message?.content || '{}'));
    }
    if (mime === 'application/pdf') {
      const { default: pdfParse } = await import('pdf-parse');
      const { text: pdfText } = await pdfParse(buffer);
      const clean = text(pdfText).replace(/\s+/g, ' ').slice(0, 6000);
      if (clean.length < 30) return null;
      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: ANEXO_IA_PROMPT },
          { role: 'user', content: `Texto extraído do PDF:\n\n${clean}` }
        ]
      });
      return pickNonEmpty(JSON.parse(response.choices?.[0]?.message?.content || '{}'));
    }
  } catch (err) {
    console.warn('Falha ao interpretar anexo com IA:', err.message);
  }
  return null;
}

const PROGRAMACAO_EMBARQUE_PROMPT = 'Esta imagem pode ser uma tabela de "Programação de Embarques" (linhas com Terminal, Cidade, Local e um status normalmente colorido: Aberto, Programado para iniciar, Suspenso ou Finalizado). Se for esse tipo de tabela, responda apenas JSON: {"eh_tabela_embarque": true, "linhas": [{"terminal": "...", "cidade": "...", "local": "...", "status": "Aberto|Programado para iniciar|Suspenso|Finalizado", "data": "DD/MM/AAAA ou null"}]}, incluindo TODAS as linhas da tabela, não só as suspensas. Se a imagem não for esse tipo de tabela (ex: logo, foto, ícone de assinatura), responda {"eh_tabela_embarque": false, "linhas": []}.';

// E-mails de programação de embarque (ex: COFCO) costumam colar essa tabela como imagem
// embutida no corpo, não como texto — por isso essa interpretação só roda pra imagens
// (collectAttachments já filtra por tamanho antes de chegar aqui).
async function interpretEmbarqueTable(attachment) {
  const openai = await getOpenAI();
  if (!openai) return null;
  const mime = (attachment.contentType || '').toLowerCase();
  const buffer = attachment.content;
  if (!buffer || buffer.length > MAX_ANEXO_IA_BYTES || !/^image\/(jpe?g|png|webp|gif)$/.test(mime)) return null;
  try {
    const b64 = buffer.toString('base64');
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: PROGRAMACAO_EMBARQUE_PROMPT },
        { role: 'user', content: [
          { type: 'text', text: 'Essa imagem é uma tabela de programação de embarque?' },
          { type: 'image_url', image_url: { url: `data:${mime};base64,${b64}` } }
        ] }
      ]
    });
    const parsed = JSON.parse(response.choices?.[0]?.message?.content || '{}');
    return { eh_tabela_embarque: parsed.eh_tabela_embarque === true, linhas: Array.isArray(parsed.linhas) ? parsed.linhas : [] };
  } catch (err) {
    console.warn('Falha ao interpretar imagem como tabela de embarque:', err.message);
    return null;
  }
}

// Cobre só os remetentes já conhecidos por mandar tabela de programação de embarque com
// status colorido. Outros domínios não geram sugestão até serem adicionados aqui.
const CLIENTE_HINT_POR_DOMINIO = [
  ['cofcointernational.com', 'COFCO'],
  ['cargill.com', 'CARGILL'],
  ['ldc.com', 'LDC']
];

function clienteHintFromEmail(fromText) {
  const from = normalize(fromText);
  return CLIENTE_HINT_POR_DOMINIO.find(([dominio]) => from.includes(dominio))?.[1] || null;
}

// Cruza uma linha "Suspenso" da tabela de embarque com public.operacional_os por
// Cliente + Cidade + Local de embarque (conforme confirmado com o usuário). Não decide
// sozinho quando ambíguo — devolve todos os candidatos pra escolha manual na Central de
// E-mails, e null quando não há como nem tentar (remetente desconhecido) ou não achou nada.
async function sugerirAguardarOS(linha, fromText) {
  const clienteHint = clienteHintFromEmail(fromText);
  if (!clienteHint) return null;
  let query = supabase.from('operacional_os')
    .select('id, numero_os, cliente, embarque, contrato, produto, data_os, status_gestor')
    .neq('status_gestor', 'FINALIZAR')
    .ilike('cliente', `%${clienteHint}%`);
  if (linha.cidade) query = query.ilike('embarque', `%${linha.cidade}%`);
  const { data, error } = await query.limit(20);
  if (error) {
    console.warn('Falha ao buscar OS pra sugestão de AGUARDAR:', error.message);
    return null;
  }
  let candidatos = data || [];
  if (candidatos.length > 1 && linha.local) {
    const porLocal = candidatos.filter((os) => normalize(os.embarque).includes(normalize(linha.local)));
    if (porLocal.length) candidatos = porLocal;
  }
  return { linha, candidatos: candidatos.slice(0, 5) };
}

async function loadRules() {
  const { data, error } = await supabase.from('email_regras').select('*').eq('ativo', true).order('prioridade');
  if (error) throw error;
  return data || [];
}

async function loadGestoresRegionais() {
  const { data, error } = await supabase.from('email_gestores_regionais').select('*').eq('ativo', true);
  if (error) throw error;
  return new Map((data || []).map((row) => [row.regional, row]));
}

function classifyByRules(message, rules, gestores) {
  const haystack = normalize([message.subject, message.fromText, message.text, message.html].join('\n'));
  const matched = rules.find((rule) => {
    const words = Array.isArray(rule.palavras_chave) ? rule.palavras_chave : [];
    return (!words.length || words.some((word) => haystack.includes(normalize(word))))
      && (!rule.remetente_contem || normalize(message.fromText).includes(normalize(rule.remetente_contem)))
      && (!rule.assunto_contem || normalize(message.subject).includes(normalize(rule.assunto_contem)));
  });
  const full = [message.subject, message.text, message.html].join('\n');
  const fullLimpo = stripArtifacts(full);
  const regional = matched?.regional || extractRegional(fullLimpo);
  return {
    regional,
    categoria: matched?.categoria || 'GERAL',
    prioridade: matched?.prioridade_email || 'NORMAL',
    precisa_resposta: matched?.precisa_resposta ?? false,
    resumo_ia: stripArtifacts(message.text || message.html).replace(/\s+/g, ' ').slice(0, 420) || 'E-mail recebido sem texto suficiente para resumo.',
    dados_detectados: { ...extractData(fullLimpo), ...extractFormFields(fullLimpo) },
    resposta_sugerida: matched?.resposta_modelo || '',
    auto_responder: matched?.auto_responder === true,
    risco: matched?.risco || null,
    classificado_por: matched ? `regra:${matched.nome}` : 'regras',
    ...resolveEncaminhamento(matched, regional, gestores)
  };
}

async function classifyWithAI(message, base) {
  const openai = await getOpenAI();
  if (!openai) return base;
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.1,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: 'Classifique e-mails corporativos. Responda só JSON com regional, categoria, prioridade, precisa_resposta, resumo_ia, dados_detectados e resposta_sugerida. Nunca prometa pagamentos, prazos ou decisões jurídicas/RH.' },
        { role: 'user', content: `Assunto: ${message.subject}\nRemetente: ${message.fromText}\nTexto: ${text(message.text || message.html).slice(0, 6000)}\nBase: ${JSON.stringify(base)}` }
      ]
    });
    const parsed = JSON.parse(response.choices?.[0]?.message?.content || '{}');
    return {
      ...base,
      ...parsed,
      auto_responder: base.auto_responder,
      dados_detectados: { ...(base.dados_detectados || {}), ...(parsed.dados_detectados || {}) },
      classificado_por: 'ia+regras'
    };
  } catch (error) {
    console.warn('Falha na IA, mantendo regras:', error.message);
    return base;
  }
}

function isDangerousAttachment(filename, mimeType) {
  const dangerousExts = /\.(exe|com|bat|cmd|msi|scr|vbs|jar|dll|sys|drv|ps1|pif|pst|reg|vsd)$/i;
  const dangerousMimes = ['application/x-msdownload', 'application/x-executable', 'application/x-msdos-program'];
  return dangerousExts.test(filename) || dangerousMimes.includes(mimeType);
}

async function saveAttachment(emailId, attachment) {
  const filename = attachment.filename || `anexo-${Date.now()}`;
  const storagePath = `${emailId}/${Date.now()}-${filename}`.replace(/[^a-zA-Z0-9_./-]/g, '_');
  let stored = null;
  const isDangerous = isDangerousAttachment(filename, attachment.contentType);

  try {
    const { error } = await supabase.storage.from('email-anexos').upload(storagePath, attachment.content, {
      contentType: attachment.contentType || 'application/octet-stream',
      upsert: false
    });
    if (error) console.warn(`Falha ao salvar anexo ${filename} no storage:`, error.message);
    else stored = storagePath;
  } catch (err) {
    console.warn(`Falha ao salvar anexo ${filename} no storage:`, err.message);
  }

  const mime = (attachment.contentType || '').toLowerCase();
  let dadosExtraidos = {};
  let status = null;
  try {
    if (mime === 'application/xml' || mime === 'text/xml' || /\.xml$/i.test(filename)) {
      dadosExtraidos = interpretXmlAttachment(attachment.content);
      status = Object.keys(dadosExtraidos).length ? 'OK' : 'SEM_DADOS';
    } else if (attachment.related && /^image\//.test(mime)) {
      // Imagem embutida grande (collectAttachments só deixa passar as grandes): pode ser um
      // print de tabela de programação de embarque, não um documento financeiro.
      const tabela = await interpretEmbarqueTable(attachment);
      if (tabela?.eh_tabela_embarque && tabela.linhas.length) {
        dadosExtraidos = { linhas_embarque: tabela.linhas };
        status = 'OK';
      } else {
        status = process.env.OPENAI_API_KEY ? 'SEM_DADOS' : 'SEM_IA';
      }
    } else if (/^image\/(jpe?g|png|webp|gif)$/.test(mime) || mime === 'application/pdf') {
      const ai = await interpretAttachmentWithAI(attachment);
      if (ai && Object.keys(ai).length) {
        dadosExtraidos = ai;
        status = 'OK';
      } else {
        status = process.env.OPENAI_API_KEY ? 'SEM_DADOS' : 'SEM_IA';
      }
    }
  } catch (err) {
    console.warn(`Falha ao interpretar anexo ${filename}:`, err.message);
    status = 'ERRO';
  }

  await supabase.from('email_attachments').insert({
    email_id: emailId,
    nome_arquivo: filename,
    mime_type: attachment.contentType || null,
    tamanho_bytes: attachment.size || attachment.content?.length || null,
    storage_path: stored,
    content_id: attachment.contentId || null,
    dados_extraidos: sanitizeForPostgres(dadosExtraidos),
    interpretacao_status: isDangerous ? 'PERIGO' : status,
    interpretado_em: new Date().toISOString()
  });

  return { dadosExtraidos, isDangerous };
}

const MAX_RFC822_DEPTH = 1;
const MIN_INLINE_IMAGE_BYTES = 40 * 1024;

// Anexos com `related: true` são imagens referenciadas via cid: no HTML e normalmente são
// logo/ícone de assinatura (pequenos) — mas às vezes (ex: print de tabela de programação de
// embarque colado no corpo) trazem dado operacional de verdade. Só vale abrir mão de
// ignorar quando a imagem é grande o bastante pra não ser um ícone. E-mails encaminhados
// como anexo (message/rfc822) são abertos para extrair os anexos reais de dentro.
async function collectAttachments(parsed, depth = 0) {
  const result = [];
  for (const attachment of parsed.attachments || []) {
    if (attachment.related) {
      const isImage = /^image\//.test(attachment.contentType || '');
      const isBigEnough = (attachment.content?.length || 0) >= MIN_INLINE_IMAGE_BYTES;
      if (isImage && isBigEnough) result.push(attachment);
      continue;
    }
    if (attachment.contentType === 'message/rfc822' && depth < MAX_RFC822_DEPTH) {
      try {
        const inner = await simpleParser(attachment.content);
        result.push(...await collectAttachments(inner, depth + 1));
      } catch (err) {
        console.warn(`Falha ao abrir e-mail encaminhado anexado (${attachment.filename || 'sem nome'}):`, err.message);
      }
      continue;
    }
    result.push(attachment);
  }
  return result;
}

async function processMailbox(client, account, rules, gestores, mailbox, state) {
  const mailboxPath = mailbox.path;
  const lock = await client.getMailboxLock(mailboxPath);
  let inserted = 0;
  let failed = 0;
  let maxUid = Number(state?.ultima_uid || 0);
  try {
    const uidValidity = client.mailbox?.uidValidity ? String(client.mailbox.uidValidity) : null;
    const stateUidValidity = state?.uid_validity ? String(state.uid_validity) : null;
    const primaryPath = account.pasta_entrada || 'INBOX';
    const legacyUid = mailboxPath === primaryPath && !state ? Number(account.ultima_uid || 0) : 0;
    const uidValidityChanged = stateUidValidity && uidValidity && stateUidValidity !== uidValidity;
    const lastUid = uidValidityChanged ? 0 : Math.max(Number(state?.ultima_uid || 0), legacyUid);
    const startUid = lastUid + 1;
    const uidNext = Number(client.mailbox?.uidNext || 0);
    const limit = Number(account.limite_por_sync || 30);
    const fetched = [];

    maxUid = lastUid;
    if (!uidNext || startUid < uidNext) {
      for await (const item of client.fetch(lastUid > 0 ? `${startUid}:*` : '1:*', { uid: true, source: true, flags: true }, { uid: true })) {
        if (item.uid) maxUid = Math.max(maxUid, Number(item.uid));
        fetched.push(item);
        if (fetched.length >= limit) break;
      }
    }

    for (const item of fetched) {
      try {
        const parsed = await simpleParser(item.source);
        const id = messageId(parsed.messageId);
        const from = parsed.from?.value?.[0] || {};
        const exists = await supabase.from('email_messages').select('id').eq('account_id', account.id).eq('message_id', id).maybeSingle();
        if (exists.data?.id) continue;
        const input = { subject: text(parsed.subject) || '(sem assunto)', fromText: text(parsed.from?.text || from.address), text: text(parsed.text), html: text(parsed.html) };
        const cls = await classifyWithAI(input, classifyByRules(input, rules, gestores));
        const { data: saved, error } = await supabase.from('email_messages').insert({
          account_id: account.id,
          uid: item.uid,
          message_id: id,
          in_reply_to: messageId(parsed.inReplyTo, false),
          references_header: nullableText(Array.isArray(parsed.references) ? parsed.references.join(' ') : parsed.references),
          remetente_nome: nullableText(from.name),
          remetente_email: nullableText(from.address),
          destinatario: nullableText(parsed.to?.text) || account.email,
          cc: nullableText(parsed.cc?.text),
          assunto: text(parsed.subject) || '(sem assunto)',
          corpo_texto: nullableText(parsed.text),
          corpo_html: nullableText(parsed.html),
          data_recebimento: parsed.date?.toISOString() || new Date().toISOString(),
          regional: cls.regional || null,
          categoria: cls.categoria || 'GERAL',
          prioridade: cls.prioridade || 'NORMAL',
          resumo_ia: nullableText(cls.resumo_ia),
          dados_detectados: sanitizeForPostgres(cls.dados_detectados || {}),
          precisa_resposta: Boolean(cls.precisa_resposta),
          resposta_sugerida: nullableText(cls.resposta_sugerida),
          status: cls.precisa_resposta ? 'RESPONDER' : 'NOVO',
          classificado_por: cls.classificado_por,
          risco: cls.risco || 'BAIXO',
          encaminhar_sugerido_para: nullableText(cls.encaminhar_sugerido_para),
          encaminhar_sugerido_cc: nullableText(cls.encaminhar_sugerido_cc),
          raw: {
            mailbox: mailboxPath,
            uid_validity: uidValidity,
            flags: Array.from(item.flags || []),
            headers: { from: nullableText(parsed.from?.text), to: nullableText(parsed.to?.text) }
          }
        }).select('id').single();
        if (error) throw error;
        inserted++;
        const attachmentsDados = {};
        const linhasEmbarque = [];
        let temAnexoPeigoso = false;
        for (const attachment of await collectAttachments(parsed)) {
          const { dadosExtraidos, isDangerous } = await saveAttachment(saved.id, attachment);
          // linhas_embarque vira sugestão de OS separada (ver abaixo), não faz sentido
          // misturar com os "Dados detectados" de contrato/CNPJ/etc.
          const { linhas_embarque, ...resto } = dadosExtraidos || {};
          if (Array.isArray(linhas_embarque)) linhasEmbarque.push(...linhas_embarque);
          Object.assign(attachmentsDados, resto);
          if (isDangerous) temAnexoPeigoso = true;
        }
        const updatePayload = { updated_at: new Date().toISOString() };
        if (Object.keys(attachmentsDados).length) {
          updatePayload.dados_detectados = sanitizeForPostgres({ ...(cls.dados_detectados || {}), ...attachmentsDados });
        }
        if (temAnexoPeigoso) {
          updatePayload.risco = 'CRITICO';
        }
        const linhasSuspensas = linhasEmbarque.filter((linha) => normalize(linha?.status).includes('suspenso'));
        if (linhasSuspensas.length) {
          const sugestoes = (await Promise.all(linhasSuspensas.map((linha) => sugerirAguardarOS(linha, message.fromText)))).filter(Boolean);
          if (sugestoes.length) updatePayload.os_sugestao_aguardar = sanitizeForPostgres(sugestoes);
        }
        if (Object.keys(updatePayload).length > 1) {
          await supabase.from('email_messages').update(updatePayload).eq('id', saved.id);
        }
        if (account.auto_responder && cls.auto_responder && cls.resposta_sugerida && from.address) {
          await supabase.from('email_outbox').insert({
            email_id: saved.id,
            account_id: account.id,
            para: from.address,
            assunto: /^re:/i.test(parsed.subject || '') ? parsed.subject : `Re: ${parsed.subject || ''}`,
            corpo: cls.resposta_sugerida,
            status: 'PENDENTE'
          });
        }
      } catch (itemError) {
        failed++;
        console.error(`Falha ao processar mensagem uid=${item.uid} de ${account.email} em ${mailboxPath}:`, itemError);
      }
    }

    await saveMailboxState(account.id, mailboxPath, {
      uid_validity: uidValidity,
      ultima_uid: maxUid,
      ultima_sync_em: new Date().toISOString(),
      ultima_sync_status: failed ? `OK - ${inserted} novo(s), ${failed} com falha` : `OK - ${inserted} novo(s)`,
      ultima_sync_erro: failed ? `${failed} mensagem(ns) pulada(s) por erro de parsing (ver logs)` : null
    });
    return { inserted, failed, maxUid, mailboxPath };
  } finally {
    lock.release();
  }
}

async function syncAccount(account, rules, gestores) {
  console.log(`Sincronizando ${account.email}...`);
  const client = new ImapFlow({
    host: account.imap_host,
    port: account.imap_port,
    secure: account.imap_secure,
    auth: { user: account.username, pass: decryptCredential(account.password_cipher) },
    tls: { rejectUnauthorized: false },
    logger: false
  });
  try {
    await client.connect();
    const states = await loadMailboxStates(account.id);
    const listed = await client.list();
    const mailboxes = listed.filter((mailbox) => shouldSyncMailbox(mailbox, account));
    if (!mailboxes.some((mailbox) => mailbox.path === (account.pasta_entrada || 'INBOX'))) {
      mailboxes.unshift({ path: account.pasta_entrada || 'INBOX', flags: new Set(['\\Inbox']), listed: true });
    }

    let inserted = 0;
    let failed = 0;
    let mailboxErrors = 0;
    let primaryMaxUid = Number(account.ultima_uid || 0);
    const syncedPaths = [];

    for (const mailbox of mailboxes) {
      try {
        const result = await processMailbox(client, account, rules, gestores, mailbox, states.get(mailbox.path));
        inserted += result.inserted;
        failed += result.failed;
        syncedPaths.push(mailbox.path);
        if (mailbox.path === (account.pasta_entrada || 'INBOX')) primaryMaxUid = result.maxUid;
      } catch (mailboxError) {
        mailboxErrors++;
        console.error(`Erro ao sincronizar pasta ${mailbox.path} de ${account.email}:`, mailboxError);
        await saveMailboxState(account.id, mailbox.path, {
          ultima_sync_em: new Date().toISOString(),
          ultima_sync_status: 'ERRO',
          ultima_sync_erro: String(mailboxError.responseText || mailboxError.message || mailboxError).slice(0, 1000)
        });
      }
    }

    await client.logout();
    await supabase.from('email_accounts').update({
      ultima_uid: primaryMaxUid,
      ultima_sync_em: new Date().toISOString(),
      ultima_sync_status: mailboxErrors
        ? `OK PARCIAL - ${inserted} novo(s), ${failed} com falha, ${mailboxErrors} pasta(s) com erro`
        : `OK - ${inserted} novo(s) em ${syncedPaths.length} pasta(s)`,
      ultima_sync_erro: mailboxErrors ? `${mailboxErrors} pasta(s) falharam. Ver email_mailbox_states/logs.` : null,
      updated_at: new Date().toISOString()
    }).eq('id', account.id);
  } catch (error) {
    console.error(`Erro ao sincronizar ${account.email}:`, error);
    try { await client.logout(); } catch {}
    await supabase.from('email_accounts').update({
      ultima_sync_em: new Date().toISOString(),
      ultima_sync_status: 'ERRO',
      ultima_sync_erro: String(error.responseText || error.message || error).slice(0, 1000),
      updated_at: new Date().toISOString()
    }).eq('id', account.id);
  }
}

// Encaminhamentos (tipo ENCAMINHAMENTO) reenviam os anexos originais da mensagem, baixados
// do bucket privado onde o worker já guardou uma cópia na hora de classificar o e-mail.
async function loadForwardAttachments(emailId) {
  if (!emailId) return [];
  const { data: attachments, error } = await supabase
    .from('email_attachments')
    .select('nome_arquivo, mime_type, storage_path')
    .eq('email_id', emailId)
    .not('storage_path', 'is', null);
  if (error) throw error;
  const result = [];
  for (const attachment of attachments || []) {
    const { data, error: downloadError } = await supabase.storage.from('email-anexos').download(attachment.storage_path);
    if (downloadError) {
      console.warn(`Falha ao baixar anexo ${attachment.nome_arquivo} pra encaminhamento:`, downloadError.message);
      continue;
    }
    result.push({
      filename: attachment.nome_arquivo || 'anexo',
      contentType: attachment.mime_type || undefined,
      content: Buffer.from(await data.arrayBuffer())
    });
  }
  return result;
}

async function processOutbox() {
  const { data: rows, error } = await supabase
    .from('email_outbox')
    .select('*, email_accounts(*)')
    .eq('status', 'PENDENTE')
    .order('created_at')
    .limit(20);
  if (error) throw error;

  for (const row of rows || []) {
    const account = row.email_accounts;
    if (!account?.ativo) continue;
    await supabase.from('email_outbox').update({ status: 'ENVIANDO', updated_at: new Date().toISOString() }).eq('id', row.id);
    try {
      const transporter = nodemailer.createTransport({
        host: account.smtp_host,
        port: account.smtp_port,
        secure: account.smtp_secure,
        auth: { user: account.username, pass: decryptCredential(account.password_cipher) }
      });
      const attachments = row.tipo === 'ENCAMINHAMENTO' ? await loadForwardAttachments(row.email_id) : [];
      const info = await transporter.sendMail({
        from: `${account.nome || account.email} <${account.email}>`,
        to: row.para,
        cc: row.cc || undefined,
        bcc: row.bcc || undefined,
        subject: row.assunto,
        text: row.corpo,
        attachments: attachments.length ? attachments : undefined
      });
      await supabase.from('email_outbox').update({
        status: 'ENVIADO',
        enviado_em: new Date().toISOString(),
        smtp_message_id: info.messageId || null,
        erro: null,
        updated_at: new Date().toISOString()
      }).eq('id', row.id);
      if (row.email_id && row.tipo === 'ENCAMINHAMENTO') {
        await supabase.from('email_historico').insert({ email_id: row.email_id, outbox_id: row.id, acao: 'ENCAMINHAMENTO_ENVIADO', detalhes: { para: row.para, cc: row.cc, smtp_message_id: info.messageId } });
      } else if (row.email_id) {
        await supabase.from('email_messages').update({ status: 'RESPONDIDO', updated_at: new Date().toISOString() }).eq('id', row.email_id);
        await supabase.from('email_historico').insert({ email_id: row.email_id, outbox_id: row.id, acao: 'EMAIL_ENVIADO', detalhes: { smtp_message_id: info.messageId } });
      }
    } catch (error) {
      await supabase.from('email_outbox').update({
        status: 'ERRO',
        erro: String(error.message || error).slice(0, 1000),
        updated_at: new Date().toISOString()
      }).eq('id', row.id);
    }
  }
}

async function runOnce() {
  const rules = await loadRules();
  const gestores = await loadGestoresRegionais();
  const { data: accounts, error } = await supabase.from('email_accounts').select('*').eq('ativo', true).order('nome');
  if (error) throw error;
  for (const account of accounts || []) await syncAccount(account, rules, gestores);
  await processOutbox();
}

async function main() {
  const once = process.argv.includes('--once');
  do {
    await runOnce().catch((error) => console.error('Falha no ciclo:', error));
    if (once) break;
    await new Promise((resolve) => setTimeout(resolve, INTERVAL_SECONDS * 1000));
  } while (true);
}

main();
