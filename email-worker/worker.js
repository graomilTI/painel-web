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
  return String(value || '').trim();
}

function normalize(value) {
  return text(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
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

function extractRegional(content) {
  const source = normalize(content);
  const checks = [
    ['MATO GROSSO MT3', ['confresa', 'querencia', 'mt3', 'mato grosso mt3']],
    ['MATO GROSSO MT2', ['mt2', 'sorriso', 'sinop', 'lucas do rio verde']],
    ['MATO GROSSO MT1', ['mt1', 'rondonopolis', 'primavera do leste']],
    ['GOIÁS', ['goias', 'goiania', 'rio verde', 'jatai']],
    ['CASCAVEL', ['cascavel', 'oeste pr']],
    ['MARINGÁ E TERMINAIS', ['maringa', 'paranagua', 'terminal', 'terminais']],
    ['TOCANTINS', ['tocantins', 'palmas', 'gurupi']],
    ['PARANÁ', ['parana', ' pr ']]
  ];
  return checks.find(([, words]) => words.some((word) => source.includes(normalize(word))))?.[0] || null;
}

function extractData(content) {
  const raw = text(content);
  return {
    contrato: raw.match(/\bP\d{5}\.\d{3}\b/i)?.[0] || raw.match(/\b[A-Z]?\d{4,}[./-]?\d*\b/i)?.[0] || null,
    placa: raw.match(/\b[A-Z]{3}[0-9][A-Z0-9][0-9]{2}\b/i)?.[0] || raw.match(/\b[A-Z]{3}-?\d{4}\b/i)?.[0] || null,
    os: raw.match(/\bOS\s*[:#-]?\s*([A-Z0-9./-]{3,})\b/i)?.[1] || null,
    cnpj: raw.match(/\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/)?.[0] || null,
    cpf: raw.match(/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/)?.[0] || null,
    valor: raw.match(/R\$\s*[0-9.]+,[0-9]{2}/i)?.[0] || null
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

async function loadRules() {
  const { data, error } = await supabase.from('email_regras').select('*').eq('ativo', true).order('prioridade');
  if (error) throw error;
  return data || [];
}

function classifyByRules(message, rules) {
  const haystack = normalize([message.subject, message.fromText, message.text, message.html].join('\n'));
  const matched = rules.find((rule) => {
    const words = Array.isArray(rule.palavras_chave) ? rule.palavras_chave : [];
    return (!words.length || words.some((word) => haystack.includes(normalize(word))))
      && (!rule.remetente_contem || normalize(message.fromText).includes(normalize(rule.remetente_contem)))
      && (!rule.assunto_contem || normalize(message.subject).includes(normalize(rule.assunto_contem)));
  });
  const full = [message.subject, message.text, message.html].join('\n');
  return {
    regional: matched?.regional || extractRegional(full),
    categoria: matched?.categoria || 'GERAL',
    prioridade: matched?.prioridade_email || 'NORMAL',
    precisa_resposta: matched?.precisa_resposta ?? false,
    resumo_ia: text(message.text || message.html).replace(/\s+/g, ' ').slice(0, 420) || 'E-mail recebido sem texto suficiente para resumo.',
    dados_detectados: extractData(full),
    resposta_sugerida: matched?.resposta_modelo || '',
    auto_responder: matched?.auto_responder === true,
    classificado_por: matched ? `regra:${matched.nome}` : 'regras'
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

async function saveAttachment(emailId, attachment) {
  const filename = attachment.filename || `anexo-${Date.now()}`;
  const storagePath = `${emailId}/${Date.now()}-${filename}`.replace(/[^a-zA-Z0-9_./-]/g, '_');
  let stored = null;
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
    dados_extraidos: dadosExtraidos,
    interpretacao_status: status,
    interpretado_em: status ? new Date().toISOString() : null
  });

  return dadosExtraidos;
}

const MAX_RFC822_DEPTH = 1;

// Anexos com `related: true` são imagens referenciadas via cid: no HTML
// (logos/ícones de assinatura) e fazem parte do corpo do e-mail, não são
// anexos de verdade. E-mails encaminhados como anexo (message/rfc822) são
// abertos para extrair os anexos reais de dentro.
async function collectAttachments(parsed, depth = 0) {
  const result = [];
  for (const attachment of parsed.attachments || []) {
    if (attachment.related) continue;
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

async function syncAccount(account, rules) {
  console.log(`Sincronizando ${account.email}...`);
  const client = new ImapFlow({
    host: account.imap_host,
    port: account.imap_port,
    secure: account.imap_secure,
    auth: { user: account.username, pass: decryptCredential(account.password_cipher) },
    logger: false
  });
  let inserted = 0;
  try {
    await client.connect();
    const lock = await client.getMailboxLock(account.pasta_entrada || 'INBOX');
    try {
      const lastUid = Number(account.ultima_uid || 0);
      const range = lastUid > 0 ? `${lastUid + 1}:*` : '1:*';
      const limit = Number(account.limite_por_sync || 30);
      let maxUid = lastUid;
      const fetched = [];
      for await (const item of client.fetch(range, { uid: true, source: true, envelope: true, flags: true })) {
        if (item.uid) maxUid = Math.max(maxUid, Number(item.uid));
        fetched.push(item);
        if (fetched.length >= limit) break;
      }

      for (const item of fetched) {
        const parsed = await simpleParser(item.source);
        const id = messageId(parsed.messageId);
        const from = parsed.from?.value?.[0] || {};
        const exists = await supabase.from('email_messages').select('id').eq('account_id', account.id).eq('message_id', id).maybeSingle();
        if (exists.data?.id) continue;
        const input = { subject: parsed.subject || '(sem assunto)', fromText: parsed.from?.text || from.address || '', text: parsed.text || '', html: parsed.html || '' };
        const cls = await classifyWithAI(input, classifyByRules(input, rules));
        const { data: saved, error } = await supabase.from('email_messages').insert({
          account_id: account.id,
          uid: item.uid,
          message_id: id,
          in_reply_to: messageId(parsed.inReplyTo, false),
          references_header: Array.isArray(parsed.references) ? parsed.references.join(' ') : text(parsed.references) || null,
          remetente_nome: from.name || null,
          remetente_email: from.address || null,
          destinatario: parsed.to?.text || account.email,
          cc: parsed.cc?.text || null,
          assunto: parsed.subject || '(sem assunto)',
          corpo_texto: parsed.text || null,
          corpo_html: parsed.html || null,
          data_recebimento: parsed.date?.toISOString() || new Date().toISOString(),
          regional: cls.regional || null,
          categoria: cls.categoria || 'GERAL',
          prioridade: cls.prioridade || 'NORMAL',
          resumo_ia: cls.resumo_ia || null,
          dados_detectados: cls.dados_detectados || {},
          precisa_resposta: Boolean(cls.precisa_resposta),
          resposta_sugerida: cls.resposta_sugerida || null,
          status: cls.precisa_resposta ? 'RESPONDER' : 'NOVO',
          classificado_por: cls.classificado_por,
          raw: { flags: Array.from(item.flags || []), headers: { from: parsed.from?.text, to: parsed.to?.text } }
        }).select('id').single();
        if (error) throw error;
        inserted++;
        const attachmentsDados = {};
        for (const attachment of await collectAttachments(parsed)) {
          const extracted = await saveAttachment(saved.id, attachment);
          Object.assign(attachmentsDados, extracted);
        }
        if (Object.keys(attachmentsDados).length) {
          await supabase.from('email_messages').update({
            dados_detectados: { ...(cls.dados_detectados || {}), ...attachmentsDados },
            updated_at: new Date().toISOString()
          }).eq('id', saved.id);
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
      }

      await supabase.from('email_accounts').update({
        ultima_uid: maxUid,
        ultima_sync_em: new Date().toISOString(),
        ultima_sync_status: `OK - ${inserted} novo(s)`,
        ultima_sync_erro: null,
        updated_at: new Date().toISOString()
      }).eq('id', account.id);
    } finally {
      lock.release();
    }
    await client.logout();
  } catch (error) {
    console.error(`Erro ao sincronizar ${account.email}:`, error);
    try { await client.logout(); } catch {}
    await supabase.from('email_accounts').update({
      ultima_sync_em: new Date().toISOString(),
      ultima_sync_status: 'ERRO',
      ultima_sync_erro: String(error.message || error).slice(0, 1000),
      updated_at: new Date().toISOString()
    }).eq('id', account.id);
  }
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
      const info = await transporter.sendMail({
        from: `${account.nome || account.email} <${account.email}>`,
        to: row.para,
        cc: row.cc || undefined,
        bcc: row.bcc || undefined,
        subject: row.assunto,
        text: row.corpo
      });
      await supabase.from('email_outbox').update({
        status: 'ENVIADO',
        enviado_em: new Date().toISOString(),
        smtp_message_id: info.messageId || null,
        erro: null,
        updated_at: new Date().toISOString()
      }).eq('id', row.id);
      if (row.email_id) {
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
  const { data: accounts, error } = await supabase.from('email_accounts').select('*').eq('ativo', true).order('nome');
  if (error) throw error;
  for (const account of accounts || []) await syncAccount(account, rules);
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
