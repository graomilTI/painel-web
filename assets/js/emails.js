import { initProtectedPage } from './pageInit.js';
import { supabase } from './supabaseClient.js';

const state = {
  tab: 'entrada',
  status: 'NOVO,PENDENTE,RESPONDER',
  conta: '',
  busca: '',
  accounts: [],
  emails: [],
  selected: null,
  attachments: [],
  outbox: []
};

function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function brDate(value) {
  if (!value) return '-';
  try {
    return new Date(value).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return String(value);
  }
}

function onlyText(htmlOrText) {
  return String(htmlOrText || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function statusBadge(status) {
  const cls = String(status || 'NOVO').toLowerCase();
  return `<span class="em-badge ${esc(cls)}">${esc(status || 'NOVO')}</span>`;
}

function prioBadge(prioridade) {
  const p = String(prioridade || 'NORMAL').toUpperCase();
  return `<span class="em-prio ${esc(p.toLowerCase())}">${esc(p)}</span>`;
}

const AVATAR_PALETTE = ['#2563eb', '#7c3aed', '#0ea5e9', '#16a34a', '#ea580c', '#db2777', '#0891b2', '#ca8a04', '#dc2626', '#4f46e5'];

function avatarColor(seed) {
  const s = String(seed || '');
  let hash = 0;
  for (let i = 0; i < s.length; i += 1) hash = (hash * 31 + s.charCodeAt(i)) >>> 0;
  return AVATAR_PALETTE[hash % AVATAR_PALETTE.length];
}

function initials(nome, email) {
  const name = String(nome || '').trim();
  if (name) {
    const parts = name.split(/\s+/).filter(Boolean);
    return parts.length >= 2 ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase() : parts[0].slice(0, 2).toUpperCase();
  }
  const at = String(email || '').trim();
  return at ? at.slice(0, 2).toUpperCase() : '??';
}

function decodeEntities(html) {
  const ta = document.createElement('textarea');
  ta.innerHTML = html;
  return ta.value;
}

// Converte HTML em texto preservando quebras de parágrafo/linha e listas,
// para não virar um bloco único de texto corrido.
function htmlToText(html) {
  let s = String(html || '');
  s = s.replace(/<style[\s\S]*?<\/style>/gi, ' ');
  s = s.replace(/<script[\s\S]*?<\/script>/gi, ' ');
  s = s.replace(/<(br|hr)\s*\/?>/gi, '\n');
  s = s.replace(/<\/(p|div|tr|li|h[1-6]|table)>/gi, '\n');
  s = s.replace(/<li[^>]*>/gi, '• ');
  s = s.replace(/<[^>]+>/g, '');
  return decodeEntities(s);
}

// Limpa artefatos que o Outlook deixa na versão em texto puro do e-mail: "[cid:xxxx]"
// (imagem de assinatura quebrada) e "endereço<mailto:outro>"/"link<http://...>" (hyperlink
// cujo destino não bate com o texto visível). Isso já existia nos e-mails antes dessa
// limpeza, então é aplicado na exibição — não precisa reprocessar nada no worker.
function cleanEmailArtifacts(value) {
  return String(value || '')
    .replace(/\[cid:[^\]]*\]/gi, ' ')
    .replace(/<(?:mailto|https?|cid):[^>]*>/gi, ' ')
    .replace(/[ \t]{2,}/g, ' ');
}

// Resumo seguro para exibição: e-mails processados antes da correção do worker
// (28/07/2026) podem ter resumo_ia gravado com HTML bruto (<!DOCTYPE html>...),
// porque o fallback usava corpo_html sem conversão quando o e-mail não tinha
// versão em texto. Aqui detectamos esse caso e convertemos para texto legível,
// cobrindo também os registros antigos já salvos no banco.
function resumoLegivel(value) {
  const raw = String(value || '');
  if (!raw) return '';
  const parece_html = /<!DOCTYPE|<html|<head|<body|<meta|<style|<div|<span|<table|<td|<p[\s>]/i.test(raw);
  let limpo = parece_html ? htmlToText(raw).replace(/\s+/g, ' ').trim() : raw;
  // Resquícios de CSS que sobram quando o resumo foi gravado a partir de HTML
  // cujo <style> não veio fechado (ex.: "body { font-family: Verdana... }").
  limpo = limpo
    .replace(/[a-zA-Z0-9_.#*>\[\]="'-]+\s*\{\s*[a-zA-Z-]+\s*:[^{}]*\}/g, ' ')
    .replace(/[a-zA-Z0-9_.#*>\[\]="'-]+\s*\{\s*[a-zA-Z-]+\s*:[^{}]*$/g, ' ')
    .replace(/@(?:media|import|font-face|charset)[^;{]*[;{]?/gi, ' ');
  // Entidades HTML que sobraram em texto puro (&ocirc; &atilde; &amp; etc.)
  if (/&[a-zA-Z]{2,8};|&#\d{2,6};/.test(limpo)) limpo = decodeEntities(limpo);
  return cleanEmailArtifacts(limpo).replace(/\s{2,}/g, ' ').trim();
}

function emailBodyText(e) {
  const source = (e.corpo_texto && e.corpo_texto.trim()) ? e.corpo_texto : htmlToText(e.corpo_html);
  return cleanEmailArtifacts(source)
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const DADOS_LABELS = {
  contrato: 'Contrato', placa: 'Placa', os: 'OS', cnpj: 'CNPJ', cpf: 'CPF', valor: 'Valor',
  tipo_documento: 'Tipo de documento',
  chave_nfe: 'Chave NF-e', numero_nf: 'Número NF', serie_nf: 'Série NF', data_emissao_nf: 'Emissão',
  valor_nf: 'Valor da NF', emitente_nome: 'Emitente', emitente_cnpj: 'CNPJ emitente',
  destinatario_nome: 'Destinatário', destinatario_cnpj: 'CNPJ/CPF destinatário',
  numero_nfse: 'Número NFS-e', valor_servico: 'Valor do serviço',
  prestador_nome: 'Prestador', prestador_cnpj: 'CNPJ prestador',
  tomador_nome: 'Tomador', tomador_cnpj: 'CNPJ tomador',
  vencimento: 'Vencimento', favorecido_nome: 'Favorecido', favorecido_documento: 'Documento do favorecido',
  pagador_nome: 'Pagador', chave_pix: 'Chave PIX', numero_documento: 'Número do documento', banco: 'Banco',
  contratante_cliente: 'Contratante/Cliente', filial_pagadora: 'Filial pagadora',
  produtor: 'Produtor/Fornecedor', armazem_embarque: 'Armazém de embarque',
  cidade_embarque: 'Cidade de embarque', cidade_destino: 'Cidade destino', local_destino: 'Local de destino',
  numero_contrato: 'Número do contrato', produto: 'Produto', tipo_produto: 'Tipo de produto',
  volume_inicial: 'Volume inicial', outros_a_cobrar: 'Outros a cobrar',
  regional_informado: 'Regional (informado no e-mail)'
};

function prettyKey(key) {
  return String(key).replace(/_/g, ' ').replace(/\b\p{L}/gu, (c) => c.toUpperCase());
}

const CATEGORIA_LABELS = {
  'LOGÍSTICA': 'Logística / Embarque',
  'QUALIDADE': 'Qualidade da carga',
  'NOTAS FISCAIS': 'Notas fiscais',
  'FINANCEIRO': 'Financeiro',
  'FROTAS': 'Frotas / Multas',
  'RH': 'Recursos Humanos',
  'PHISHING': '⚠️ Suspeita de golpe',
  'PROPOSTA': 'Proposta comercial (interno)',
  'GERAL': 'Sem categoria definida'
};

const CATEGORIA_DESC = {
  'LOGÍSTICA': 'Ordem de serviço, fechamento de frete, liberação ou programação de embarque.',
  'QUALIDADE': 'Carga recusada, fora do padrão ou com impureza — vai com cópia pra auditoria.',
  'NOTAS FISCAIS': 'Nota fiscal (NF-e/NFS-e), XML ou danfe anexado — vai pro faturamento.',
  'FINANCEIRO': 'Boleto, comprovante, pagamento ou cobrança.',
  'FROTAS': 'Multa, infração ou documento de veículo.',
  'RH': 'Atestado, admissão, rescisão ou outro assunto de pessoal.',
  'PHISHING': 'Sinais de golpe/phishing. Não abra anexos nem clique em links deste e-mail.',
  'PROPOSTA': 'Encaminhamento interno de proposta comercial — não precisa agir por aqui.',
  'GERAL': 'Não bateu com nenhuma regra automática. Vale conferir manualmente.'
};

function categoriaLabel(categoria) {
  return CATEGORIA_LABELS[categoria] || categoria || 'Sem categoria definida';
}

function categoriaDesc(categoria) {
  return CATEGORIA_DESC[categoria] || '';
}

const REGIONAL_LABELS = {
  BAHIA: 'Bahia',
  GOIAS: 'Goiás',
  MARANHAO: 'Maranhão',
  'MATO GROSSO DO SUL': 'Mato Grosso do Sul',
  'MINAS GERAIS': 'Minas Gerais',
  'MATO GROSSO MT1': 'Mato Grosso — MT1 (Sinop)',
  'MATO GROSSO MT2': 'Mato Grosso — MT2 (Rondonópolis/Primavera do Leste)',
  'MATO GROSSO MT3': 'Mato Grosso — MT3 (Confresa/Querência)',
  'MATO GROSSO MT4': 'Mato Grosso — MT4 (Campo Novo do Parecis)',
  PARA: 'Pará',
  PARAGUAI: 'Paraguai',
  'PR PONTA GROSSA': 'Paraná — Ponta Grossa',
  'PR CASCAVEL': 'Paraná — Cascavel',
  'PR LONDRINA': 'Paraná — Londrina',
  'PR MARINGA': 'Paraná — Maringá e terminais',
  'RIO GRANDE DO SUL': 'Rio Grande do Sul',
  'SAO PAULO': 'São Paulo',
  TOCANTINS: 'Tocantins'
};

function regionalLabel(regional) {
  return REGIONAL_LABELS[regional] || regional || 'Sem regional identificado';
}

function classificadoPorLabel(valor) {
  const v = String(valor || '');
  if (v === 'ia+regras') return 'Regras + Inteligência Artificial';
  if (v === 'regras') return 'Palavras-chave (sem regra específica)';
  if (v.startsWith('regra:')) return `Regra automática: ${v.slice(6)}`;
  return v || '—';
}

// "contrato" só é confiável no formato real da empresa (ex: P31899.000); qualquer outra
// coisa (como o fallback genérico que já existiu no worker) tende a ser telefone/data/CEP
// pego por engano. O limite de tamanho é só pros campos que deveriam ser um código curto
// (ex: "os") — campos de endereço/nome (armazém, produtor, local) são naturalmente longos.
const DADOS_VALIDATORS = {
  contrato: (v) => /^P\d{5}\.\d{3}$/i.test(v)
};

const DADOS_MAX_LEN = {
  os: 30, placa: 12, contrato: 15, cnpj: 20, cpf: 16, valor: 20, numero_nf: 20,
  serie_nf: 10, chave_nfe: 50, numero_nfse: 20, numero_documento: 30, chave_pix: 80,
  numero_contrato: 20, cidade_embarque: 60, cidade_destino: 60
};

function dadosDetectadosEntries(dados) {
  return Object.entries(dados || {}).filter(([k, v]) => {
    if (v === null || v === undefined) return false;
    const s = String(v).trim();
    if (!s) return false;
    if (typeof v === 'object') return true;
    if (DADOS_VALIDATORS[k] && !DADOS_VALIDATORS[k](s)) return false;
    return s.length <= (DADOS_MAX_LEN[k] || 200);
  });
}

const ATTACHMENT_ICONS = {
  pdf: '📄', doc: '📝', docx: '📝', xls: '📊', xlsx: '📊', csv: '📊',
  jpg: '🖼️', jpeg: '🖼️', png: '🖼️', gif: '🖼️', webp: '🖼️',
  zip: '🗜️', rar: '🗜️', '7z': '🗜️', txt: '📃', xml: '🧾', eml: '✉️'
};

const DANGEROUS_EXTENSIONS = /\.(exe|com|bat|cmd|msi|scr|vbs|js|jar|dll|sys|drv|ps1|pif|pst|reg|vsd|ppt|pptx|doc|docx|xls|xlsx)$/i;
const DANGEROUS_MIMETYPES = ['application/x-msdownload', 'application/x-executable', 'application/x-msdos-program', 'application/x-dosexec'];
const EMAIL_LIST_SELECT = 'id,account_id,remetente_nome,remetente_email,assunto,data_recebimento,regional,categoria,prioridade,resumo_ia,precisa_resposta,status,risco';

function isDangerousAttachment(filename, mimeType) {
  return DANGEROUS_EXTENSIONS.test(filename) || DANGEROUS_MIMETYPES.includes(mimeType);
}

function attachmentIcon(filename) {
  const ext = String(filename || '').split('.').pop().toLowerCase();
  return ATTACHMENT_ICONS[ext] || '📎';
}

function formatBytes(bytes) {
  const n = Number(bytes);
  if (!n) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

const INTERPRETACAO_BADGES = {
  OK: { icon: '✅', title: 'Dados extraídos automaticamente deste anexo' },
  SEM_DADOS: { icon: '➖', title: 'Nenhum dado foi identificado neste anexo' },
  SEM_IA: { icon: '⚠️', title: 'IA não configurada no worker para interpretar este anexo' },
  ERRO: { icon: '❌', title: 'Falha ao interpretar este anexo' }
};

async function updateEmail(id, payload, userContext) {
  const { error } = await supabase.from('email_messages').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
  await supabase.from('email_historico').insert({
    email_id: id,
    usuario_id: userContext?.user?.id || null,
    usuario_nome: userContext?.profile?.full_name || userContext?.user?.email || null,
    acao: 'ATUALIZACAO_MANUAL',
    detalhes: payload
  });
}

export function renderContent(content, userContext) {
  content.innerHTML = `
    <style>
      .em-wrap{display:grid;gap:24px;position:relative}

      .em-hero{border:1px solid var(--line);border-radius:24px;padding:32px;background:var(--bg-card);box-shadow:var(--shadow-soft);position:relative;overflow:hidden}
      .em-hero h2{margin:0 0 8px;color:var(--text);font-size:32px;font-family:'Syne',sans-serif;font-weight:800;letter-spacing:-0.03em;position:relative;z-index:1}
      .em-hero p{margin:0;color:var(--muted);max-width:1000px;font-size:14px;line-height:1.6;position:relative;z-index:1}

      .em-guia{border:1px solid var(--green-2);border-radius:20px;background:var(--green-soft);padding:20px 22px;display:grid;gap:12px}
      .em-guia-head{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}
      .em-guia-head strong{color:var(--text);font-size:15px;font-family:'DM Sans',sans-serif}
      .em-guia-passos{margin:0;padding-left:0;list-style:none;display:grid;gap:8px}
      .em-guia-passos li{color:var(--text);font-size:13px;line-height:1.6;font-family:'DM Sans',sans-serif}
      .em-guia-passos li b{color:var(--green-2);margin-right:6px}
      .em-guia-toggle{align-self:flex-start;border:none;background:none;color:var(--muted);font-size:12px;cursor:pointer;text-decoration:underline;padding:0;font-family:'DM Sans',sans-serif}
      .em-guia-toggle:hover{color:var(--green-2)}

      .em-tabs{display:flex;gap:12px;flex-wrap:wrap;align-items:center;border-bottom:1px solid var(--line);padding-bottom:16px}
      .em-tab{border:1px solid var(--line);border-radius:16px;padding:10px 16px;background:transparent;color:var(--muted);cursor:pointer;font-weight:700;font-size:12px;font-family:'DM Sans',sans-serif;text-transform:uppercase;letter-spacing:.06em;transition:all 200ms;position:relative}
      .em-tab:hover{border-color:var(--green-2);background:rgba(63,168,120,.08);color:var(--green-2)}
      .em-tab.active{background:var(--green-soft);color:var(--green-2);border-color:var(--green-2)}

      .em-card{border:1px solid var(--line);border-radius:24px;background:var(--bg-card);padding:20px;min-width:0;box-shadow:var(--shadow-soft);position:relative}

      .em-grid{display:grid;grid-template-columns:420px minmax(0,1fr);gap:20px;align-items:start}
      .em-grid-3{display:grid;grid-template-columns:330px minmax(0,1.35fr) minmax(300px,1fr);gap:20px;align-items:start}

      .em-step-head{display:flex;align-items:center;gap:12px;margin-bottom:16px;padding-bottom:14px;border-bottom:1px solid var(--line)}
      .em-step-num{flex:none;width:30px;height:30px;border-radius:50%;background:var(--green-soft);color:var(--green-2);border:1.5px solid var(--green-2);display:flex;align-items:center;justify-content:center;font-family:'Syne',sans-serif;font-weight:800;font-size:14px}
      .em-step-title{color:var(--text);font-size:14px;font-family:'Syne',sans-serif;font-weight:700;letter-spacing:-.01em;line-height:1.3}
      .em-step-sub{display:block;color:var(--muted);font-size:10.5px;text-transform:uppercase;letter-spacing:.05em;font-family:'DM Sans',sans-serif;margin-top:2px}
      .em-col-list,.em-col-main{position:relative}
      .em-col-list::after,.em-col-main::after{content:'›';position:absolute;top:44px;right:-15px;color:var(--green-2);font-size:26px;font-weight:800;opacity:.55;z-index:2;font-family:'Syne',sans-serif}
      @media(max-width:1280px){.em-grid-3{grid-template-columns:1fr}.em-col-list::after,.em-col-main::after{display:none}}

      .em-filter{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
      .em-filter .em-field{display:contents}
      .em-filter label{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)}
      .em-filter select{border:1px solid var(--line);border-radius:14px;background:var(--bg-soft);color:var(--text);padding:11px 14px;font-size:13px;color-scheme:dark;font-family:inherit;cursor:pointer}
      .em-filter input{flex:1;min-width:200px;border:1px solid var(--line);border-radius:14px;background:var(--bg-soft);color:var(--text);padding:11px 14px;font-size:13px;font-family:inherit}
      .em-filter select:focus,.em-filter input:focus{border-color:var(--green-2);background:var(--bg);box-shadow:0 0 0 3px var(--green-soft);outline:none}
      .em-filter button{white-space:nowrap}

      .em-field{display:grid;gap:8px}.em-field label{font-size:12px;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;font-family:'DM Sans',sans-serif;font-weight:700}
      .em-field input,.em-field select,.em-field textarea{border:1px solid var(--line);border-radius:16px;background:var(--bg-soft);color:var(--text);padding:12px 14px;color-scheme:dark;min-width:0;font-family:inherit;transition:all 150ms;font-size:14px}
      .em-field input:focus,.em-field select:focus,.em-field textarea:focus{border-color:var(--green-2);background:var(--bg);box-shadow:0 0 0 3px var(--green-soft);outline:none}
      .em-field textarea{min-height:120px;resize:vertical;line-height:1.45}

      .em-insight-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
      .em-insight-cell{border:1px solid var(--line);background:var(--bg-soft);border-radius:14px;padding:12px 14px;min-width:0}
      .em-insight-cell span{display:block;font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;font-family:'DM Sans',sans-serif;font-weight:700;margin-bottom:4px}
      .em-insight-cell b{color:var(--green-2);font-size:13px;font-weight:700;font-family:'DM Sans',sans-serif;line-height:1.4;word-break:break-word}

      .em-recipients-toggle{border:1px solid var(--line);background:var(--bg-soft);border-radius:12px;padding:9px 14px;font-size:12px;color:var(--green-2);cursor:pointer;font-weight:700;display:inline-flex;align-items:center;gap:6px;font-family:'DM Sans',sans-serif}
      .em-recipients-toggle:hover{border-color:var(--green-2);background:var(--green-soft)}
      .em-recipients-full{margin-top:8px;font-size:12px;color:var(--muted);line-height:1.7;word-break:break-word}

      .em-list{display:grid;gap:10px;max-height:72vh;overflow:auto;padding-right:6px}
      .em-list::-webkit-scrollbar{width:8px}
      .em-list::-webkit-scrollbar-track{background:transparent}
      .em-list::-webkit-scrollbar-thumb{background:var(--line-2);border-radius:4px}
      .em-list::-webkit-scrollbar-thumb:hover{background:var(--green-soft)}

      .em-row{border:1px solid var(--line);background:var(--bg-soft);border-radius:16px;padding:14px;cursor:pointer;display:grid;gap:8px;transition:all 180ms;position:relative;overflow:hidden}
      .em-row::before{content:'';position:absolute;left:0;top:0;bottom:0;width:3px;background:transparent;transition:all 180ms}
      .em-row:hover{border-color:var(--green-2);background:rgba(63,168,120,.08)}
      .em-row:hover::before{background:var(--green-2)}
      .em-row.active{border-color:var(--green-2);background:var(--green-soft)}
      .em-row.active::before{background:var(--green-2)}

      .em-row-top{display:flex;align-items:center;justify-content:space-between;gap:10px}.em-row-from{display:flex;align-items:center;gap:10px;min-width:0;flex:1}
      .em-subject{color:var(--text);font-weight:700;line-height:1.4;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:16px}
      .em-meta{font-size:12px;color:var(--muted)}.em-snippet{font-size:13px;color:var(--muted);line-height:1.5}

      .em-badge,.em-prio{display:inline-flex;align-items:center;padding:6px 10px;border-radius:999px;font-size:11px;font-weight:700;letter-spacing:.05em;border:1px solid currentColor;white-space:nowrap;font-family:'DM Sans',sans-serif;text-transform:uppercase}
      .em-badge.novo{background:var(--green-soft);color:var(--green-2);border-color:var(--green-2)}
      .em-badge.pendente,.em-badge.responder{background:rgba(245,158,11,.15);color:#fbbf24;border-color:#fbbf24}
      .em-badge.respondido,.em-badge.resolvido{background:var(--green-soft);color:var(--green-2);border-color:var(--green-2)}
      .em-badge.arquivado,.em-badge.ignorado{background:rgba(111,208,165,.08);color:var(--muted);border-color:var(--line-2)}
      .em-badge.erro{background:rgba(220,38,38,.2);color:#ff6b6b;border-color:#ff6b6b;font-weight:800}
      .em-prio.baixa{background:rgba(111,208,165,.08);color:var(--muted)}.em-prio.normal{background:var(--green-soft);color:var(--green-2)}.em-prio.alta{background:rgba(245,158,11,.15);color:#fbbf24}.em-prio.urgente{background:rgba(220,38,38,.18);color:#ff6b6b;font-weight:800}

      .em-detail{display:grid;gap:20px}
      .em-envelope{display:flex;gap:16px;align-items:flex-start;padding-bottom:20px;border-bottom:1px solid var(--line)}
      .em-avatar{flex:none;width:54px;height:54px;border-radius:24px;display:flex;align-items:center;justify-content:center;font-family:'Syne',sans-serif;font-weight:800;font-size:18px;color:#fff;box-shadow:var(--shadow-soft);border:1px solid var(--line)}
      .em-avatar.sm{width:32px;height:32px;border-radius:12px;font-size:12px;box-shadow:var(--shadow-soft)}
      .em-envelope-main{flex:1;min-width:0}
      .em-envelope-main h3{margin:0 0 14px;color:var(--text);font-size:26px;font-family:'Syne',sans-serif;font-weight:800;line-height:1.3;word-break:break-word;padding-bottom:10px;border-bottom:1px solid var(--line)}
      .em-from{font-size:14px;color:var(--text);font-family:'DM Sans',sans-serif;line-height:1.6;margin-top:10px}.em-from b{font-weight:700;color:var(--green-2);font-size:15px}
      .em-to{margin-top:8px;font-size:12px;color:var(--muted);word-break:break-word;font-family:'DM Sans',sans-serif;line-height:1.5}
      .em-envelope-meta{flex:none;display:flex;flex-direction:column;align-items:flex-end;gap:10px;text-align:right}
      .em-date{font-size:12px;color:var(--muted);line-height:1.6;white-space:nowrap;font-family:'DM Sans',sans-serif}

      .em-insights{display:flex;flex-wrap:wrap;gap:10px}
      .em-chip{display:flex;align-items:center;gap:8px;border:1px solid var(--line);background:var(--bg-soft);border-radius:16px;padding:10px 14px;font-size:12px;color:var(--muted);font-family:'DM Sans',sans-serif;text-transform:uppercase;letter-spacing:.04em}
      .em-chip b{color:var(--green-2);font-weight:700}

      .em-summary{border:1px solid var(--line);background:var(--bg-soft);border-radius:16px;padding:16px 18px;display:grid;gap:8px}
      .em-summary-label{font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:var(--green-2);font-weight:700;font-family:'DM Sans',sans-serif}
      .em-summary p{margin:0;color:var(--text);line-height:1.7;font-size:14px}

      .em-section-label{display:block;font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:var(--green-2);font-weight:700;margin-bottom:12px;font-family:'DM Sans',sans-serif;border-bottom:1px solid var(--line);padding-bottom:8px}
      .em-extracted{border:1px solid var(--line);border-radius:16px;background:var(--bg-soft);padding:14px 16px}
      .em-dl{display:grid;grid-template-columns:auto 1fr;gap:8px 20px;margin:0;font-size:13px}
      .em-dl dt{color:var(--muted);font-family:'DM Sans',sans-serif;font-weight:600}.em-dl dd{margin:0;color:var(--text);font-weight:600;word-break:break-word}

      .em-attachments{display:flex;flex-wrap:wrap;gap:10px}
      .em-attachment{display:inline-flex;align-items:center;gap:8px;border:1px solid var(--line);background:var(--bg-soft);border-radius:16px;padding:10px 14px;font-size:12px;color:var(--muted);font-family:'DM Sans',sans-serif;cursor:pointer;transition:all 150ms;text-transform:uppercase;letter-spacing:.03em;font-weight:600}
      .em-attachment:hover:not(:disabled){border-color:var(--green-2);background:var(--green-soft);color:var(--green-2);box-shadow:0 4px 12px var(--green-soft)}
      .em-attachment:disabled{cursor:default;opacity:.5}
      .em-attachment[style*="dc2626"]{border-color:var(--danger);background:rgba(220,38,38,.1);color:var(--danger)}
      .em-attachment[style*="dc2626"]:hover:not(:disabled){border-color:var(--danger);background:rgba(220,38,38,.2);box-shadow:0 0 16px rgba(220,38,38,.2)}

      .em-letter{position:relative;border:1px solid var(--line);border-radius:16px;background:var(--bg-soft);padding:24px;overflow:hidden}
      .em-letter::before{content:'';position:absolute;left:0;top:0;bottom:0;width:3px;background:var(--green-2)}
      .em-letter pre{white-space:pre-wrap;word-break:break-word;color:var(--text);line-height:1.8;font-size:14px;font-family:'DM Sans',monospace;margin:0;max-height:480px;overflow:auto;padding-right:8px;text-align:left}

      .em-reply{border:1px solid var(--line);border-radius:16px;background:var(--bg-soft);padding:18px;display:grid;gap:12px}
      .em-btn-full{width:100%;text-align:center}
      .em-reply-divider{height:1px;background:var(--line);margin:4px 0}
      .em-secondary-label{display:block;font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;font-family:'DM Sans',sans-serif;font-weight:700;margin-bottom:10px}
      .em-btn-ghost{background:transparent;border:1px solid var(--line);color:var(--muted);font-weight:700}
      .em-btn-ghost:hover{border-color:var(--green-2);color:var(--green-2);background:var(--green-soft)}

      .em-empty{color:var(--muted);text-align:center;padding:40px;border:1px dashed var(--line);border-radius:16px;font-size:14px;line-height:1.6}
      .em-muted{color:var(--muted)}.em-small{font-size:12px}.em-danger{color:var(--danger);font-weight:700}.em-ok{color:var(--green-2);font-weight:700}
      .em-account-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}.em-account-grid .wide{grid-column:1/-1}.em-check{display:flex;align-items:center;gap:10px;color:var(--text);font-size:13px;margin-top:24px;font-family:'DM Sans',sans-serif}

      @media(max-width:1040px){.em-grid{grid-template-columns:1fr}.em-list{max-height:unset}.em-filter,.em-account-grid{grid-template-columns:1fr}.em-check{margin-top:0}.em-envelope{flex-wrap:wrap}.em-envelope-meta{flex-direction:row;align-items:center;text-align:left}}
    </style>

    <section class="em-wrap">
      <div class="em-hero">
        <h2>Central de E-mails Inteligente</h2>
        <p>Lê caixas do cPanel via IMAP, classifica por regional/assunto, gera resumo e resposta sugerida. O envio fica em fila para aprovação e processamento pelo worker do servidor.</p>
      </div>

      <div class="em-guia" id="emGuia" style="display:none">
        <div class="em-guia-head">
          <strong>📚 Como funciona a Central de E-mails</strong>
          <button class="btn btn-secondary" type="button" id="emGuiaFechar">Entendi, fechar</button>
        </div>
        <ol class="em-guia-passos">
          <li><b>1.</b> Todo e-mail que chega é lido e classificado sozinho: o sistema decide a <b>categoria</b> (do que se trata) e a <b>regional</b> (de qual área é).</li>
          <li><b>2.</b> Quando dá pra saber pra quem aquele e-mail deveria ir (por exemplo, o gestor daquela regional), aparece uma sugestão de <b>encaminhamento</b> dentro do e-mail.</li>
          <li><b>3.</b> Você só aprova — o sistema envia de verdade pro destinatário certo, com os anexos originais, sem precisar reescrever nada.</li>
          <li><b>4.</b> O mesmo vale pras respostas: você escreve ou ajusta o texto, aprova, e o envio por SMTP acontece sozinho depois, na aba "Fila de Respostas".</li>
        </ol>
      </div>
      <button class="em-guia-toggle" type="button" id="emGuiaAbrir" style="display:none">❓ Como funciona esta tela?</button>

      <div class="em-tabs">
        <button class="em-tab active" data-tab="entrada" type="button">Entrada</button>
        <button class="em-tab" data-tab="perigo" type="button">🔴 PERIGO</button>
        <button class="em-tab" data-tab="outbox" type="button">Fila de Respostas</button>
        <button class="em-tab" data-tab="contas" type="button">Contas cPanel</button>
      </div>
      <p class="em-muted em-small" id="emTabHint" style="margin:-8px 0 0"></p>

      <div id="emPanelEntrada" class="em-panel">
        <article class="em-card">
          <form id="emFilter" class="em-filter">
            <div class="em-field"><label>Conta</label><select id="emConta"><option value="">Todas</option></select></div>
            <div class="em-field"><label>Status</label><select id="emStatus"><option value="NOVO,PENDENTE,RESPONDER">Pendentes</option><option value="RESPONDIDO,RESOLVIDO">Respondidos/Resolvidos</option><option value="ARQUIVADO,IGNORADO">Arquivados/Ignorados</option><option value="">Todos</option></select></div>
            <div class="em-field"><label>Buscar</label><input id="emBusca" placeholder="remetente, assunto, categoria, regional..."></div>
            <button class="btn btn-primary" type="submit">↻ Atualizar</button>
          </form>
        </article>
        <div class="em-grid-3" id="emDetailGrid">
          <article class="em-card em-col-list">
            <div class="em-step-head"><span class="em-step-num">1</span><div><span class="em-step-title">Caixa de Entrada</span><span class="em-step-sub">Fila de triagem</span></div></div>
            <div class="em-list" id="emList"><div class="em-empty">Carregando...</div></div>
          </article>
          <article class="em-card em-col-main">
            <div class="em-step-head"><span class="em-step-num">2</span><div><span class="em-step-title">Leitura e interpretação pela IA</span></div></div>
            <div id="emDetail" class="em-empty">Selecione um e-mail para visualizar.</div>
          </article>
          <aside class="em-card em-col-action">
            <div class="em-step-head"><span class="em-step-num">3</span><div><span class="em-step-title">Ação sugerida</span></div></div>
            <div id="emAction" class="em-empty">Selecione um e-mail pra ver o que fazer com ele.</div>
          </aside>
        </div>
      </div>

      <div id="emPanelPerigo" class="em-panel" style="display:none">
        <article class="em-card">
          <div class="em-actions" style="justify-content:space-between;margin-bottom:12px">
            <div><strong style="color:#fecaca">🔴 E-mails de RISCO (Vírus, anexos suspeitos, etc)</strong><div class="em-muted em-small">Aquivos executáveis, compactados ou com erro de interpretação são marcados como PERIGO.</div></div>
          </div>
          <div class="em-list" id="emPerigoList"><div class="em-empty">Carregando...</div></div>
        </article>
      </div>

      <div id="emPanelOutbox" class="em-panel" style="display:none">
        <article class="em-card">
          <div class="em-actions" style="justify-content:space-between;margin-bottom:12px">
            <div><strong style="color:#f8fafc">Fila de respostas aprovadas</strong><div class="em-muted em-small">O worker envia via SMTP e atualiza esta fila.</div></div>
            <button class="btn btn-secondary" id="emLoadOutbox" type="button">↻ Atualizar fila</button>
          </div>
          <div class="em-list" id="emOutboxBody"><div class="em-empty">Carregando...</div></div>
        </article>
      </div>

      <div id="emPanelContas" class="em-panel" style="display:none">
        <article class="em-card">
          <h3 style="margin:0 0 6px;color:#f8fafc">Cadastrar conta do cPanel</h3>
          <p class="em-muted" style="margin:0 0 16px">Use os dados de “Configurar cliente de e-mail” no cPanel. Recomendo criar uma senha específica para essa integração.</p>
          <form id="emAccountForm" class="em-account-grid">
            <input type="hidden" id="accId">
            <div class="em-field"><label>Nome</label><input id="accNome" placeholder="Financeiro" required></div>
            <div class="em-field"><label>E-mail</label><input id="accEmail" type="email" placeholder="financeiro@grao1000.com.br" required></div>
            <div class="em-field"><label>Usuário</label><input id="accUsername" placeholder="financeiro@grao1000.com.br" required></div>
            <div class="em-field"><label>IMAP Host</label><input id="accImapHost" value="mail.grao1000.com.br" required></div>
            <div class="em-field"><label>IMAP Porta</label><input id="accImapPort" type="number" value="993" required></div>
            <label class="em-check"><input id="accImapSecure" type="checkbox" checked> IMAP SSL/TLS</label>
            <div class="em-field"><label>SMTP Host</label><input id="accSmtpHost" value="mail.grao1000.com.br" required></div>
            <div class="em-field"><label>SMTP Porta</label><input id="accSmtpPort" type="number" value="465" required></div>
            <label class="em-check"><input id="accSmtpSecure" type="checkbox" checked> SMTP SSL/TLS</label>
            <div class="em-field"><label>Senha</label><input id="accPassword" type="password" placeholder="Preencha para cadastrar ou trocar"></div>
            <div class="em-field"><label>Limite por sincronização</label><input id="accLimit" type="number" min="1" max="200" value="30"></div>
            <label class="em-check"><input id="accAtivo" type="checkbox" checked> Conta ativa</label>
            <label class="em-check"><input id="accAuto" type="checkbox"> Permitir resposta automática segura</label>
            <div class="wide em-actions"><button class="btn btn-primary" type="submit">Salvar conta</button><button class="btn btn-secondary" type="button" id="accClear">Limpar</button></div>
          </form>
        </article>
        <article class="em-card">
          <h3 style="margin:0 0 12px;color:#f8fafc">Contas cadastradas</h3>
          <div id="emAccountsList" class="em-list"><div class="em-empty">Carregando...</div></div>
        </article>
      </div>
    </section>
  `;

  const TAB_HINTS = {
    entrada: 'E-mails recebidos, já classificados. Aprove respostas/encaminhamentos ou arquive o que já foi resolvido.',
    perigo: 'E-mails com anexo suspeito (executável, compactado ou não identificado). Não abra os anexos marcados aqui.',
    outbox: 'Fila do que já foi aprovado (respostas e encaminhamentos) — o worker do servidor envia de verdade a cada poucos minutos.',
    contas: 'Caixas de e-mail (cPanel) que o worker lê via IMAP. Cadastre aqui as contas que devem entrar na Central.'
  };

  function setTab(tab) {
    state.tab = tab;
    document.querySelectorAll('.em-tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
    document.getElementById('emPanelEntrada').style.display = tab === 'entrada' ? '' : 'none';
    document.getElementById('emPanelPerigo').style.display = tab === 'perigo' ? '' : 'none';
    document.getElementById('emPanelOutbox').style.display = tab === 'outbox' ? '' : 'none';
    document.getElementById('emPanelContas').style.display = tab === 'contas' ? '' : 'none';
    document.getElementById('emTabHint').textContent = TAB_HINTS[tab] || '';
    if (tab === 'perigo') loadPerigo();
    if (tab === 'outbox') loadOutbox();
    if (tab === 'contas') renderAccounts();
  }

  function renderAccountOptions() {
    const select = document.getElementById('emConta');
    select.innerHTML = `<option value="">Todas</option>` + state.accounts.map((a) => `<option value="${esc(a.id)}">${esc(a.nome)} — ${esc(a.email)}</option>`).join('');
    select.value = state.conta;
  }

  async function loadAccounts() {
    const { data, error } = await supabase.from('email_accounts_public').select('*').order('nome');
    if (error) throw error;
    state.accounts = data || [];
    renderAccountOptions();
    renderAccounts();
  }

  function renderAccounts() {
    const el = document.getElementById('emAccountsList');
    if (!el) return;
    if (!state.accounts.length) {
      el.innerHTML = `<div class="em-empty">Nenhuma conta cadastrada.</div>`;
      return;
    }
    el.innerHTML = state.accounts.map((a) => `
      <div class="em-row" data-account-id="${esc(a.id)}">
        <div class="em-row-top">
          <div class="em-row-from">
            <span class="em-avatar sm" style="background:${avatarColor(a.email)}">${esc(initials(a.nome, a.email))}</span>
            <div class="em-subject">${esc(a.nome)} — ${esc(a.email)}</div>
          </div>
          ${a.ativo ? '<span class="em-badge resolvido">ATIVA</span>' : '<span class="em-badge arquivado">INATIVA</span>'}
        </div>
        <div class="em-meta">IMAP ${esc(a.imap_host)}:${esc(a.imap_port)} · SMTP ${esc(a.smtp_host)}:${esc(a.smtp_port)}</div>
        <div class="em-meta">Última sincronização: ${brDate(a.ultima_sync_em)} · ${esc(a.ultima_sync_status || '-')}</div>
        ${a.ultima_sync_erro ? `<div class="em-danger em-small">${esc(a.ultima_sync_erro)}</div>` : ''}
        <div class="em-actions"><button class="btn btn-secondary" data-edit-account="${esc(a.id)}" type="button">Editar</button><button class="btn btn-primary" data-sync-account="${esc(a.id)}" type="button">Sincronizar agora</button></div>
      </div>
    `).join('');
  }

  function accountInfo(accountId) {
    return state.accounts.find((account) => String(account.id) === String(accountId)) || null;
  }

  function attachAccountInfo(rows) {
    return (rows || []).map((row) => ({ ...row, email_accounts: accountInfo(row.account_id) }));
  }

  function fillAccountForm(acc) {
    document.getElementById('accId').value = acc?.id || '';
    document.getElementById('accNome').value = acc?.nome || '';
    document.getElementById('accEmail').value = acc?.email || '';
    document.getElementById('accUsername').value = acc?.username || acc?.email || '';
    document.getElementById('accImapHost').value = acc?.imap_host || 'mail.grao1000.com.br';
    document.getElementById('accImapPort').value = acc?.imap_port || 993;
    document.getElementById('accImapSecure').checked = acc?.imap_secure !== false;
    document.getElementById('accSmtpHost').value = acc?.smtp_host || 'mail.grao1000.com.br';
    document.getElementById('accSmtpPort').value = acc?.smtp_port || 465;
    document.getElementById('accSmtpSecure').checked = acc?.smtp_secure !== false;
    document.getElementById('accPassword').value = '';
    document.getElementById('accLimit').value = acc?.limite_por_sync || 30;
    document.getElementById('accAtivo').checked = acc?.ativo !== false;
    document.getElementById('accAuto').checked = !!acc?.auto_responder;
  }

  async function saveAccount(event) {
    event.preventDefault();
    const id = document.getElementById('accId').value;
    const password = document.getElementById('accPassword').value;
    const payload = {
      id: id || null,
      nome: document.getElementById('accNome').value.trim(),
      email: document.getElementById('accEmail').value.trim(),
      username: document.getElementById('accUsername').value.trim(),
      password,
      imap_host: document.getElementById('accImapHost').value.trim(),
      imap_port: Number(document.getElementById('accImapPort').value || 993),
      imap_secure: document.getElementById('accImapSecure').checked,
      smtp_host: document.getElementById('accSmtpHost').value.trim(),
      smtp_port: Number(document.getElementById('accSmtpPort').value || 465),
      smtp_secure: document.getElementById('accSmtpSecure').checked,
      limite_por_sync: Number(document.getElementById('accLimit').value || 30),
      ativo: document.getElementById('accAtivo').checked,
      auto_responder: document.getElementById('accAuto').checked,
    };
    const { data, error } = await supabase.functions.invoke('email-account-save', { body: payload });
    if (error) return alert(error.message);
    if (!data?.ok) return alert(data?.error || 'Não foi possível salvar a conta.');
    fillAccountForm(null);
    await loadAccounts();
    alert('Conta salva. Execute o worker no servidor para sincronizar/enviar e-mails.');
  }

  async function loadEmails() {
    const list = document.getElementById('emList');
    list.innerHTML = `<div class="em-empty">Carregando e-mails...</div>`;
    let q = supabase.from('email_messages').select(EMAIL_LIST_SELECT).order('data_recebimento', { ascending: false }).limit(80);
    if (state.conta) q = q.eq('account_id', state.conta);
    if (state.status) q = q.in('status', state.status.split(','));
    const { data, error } = await q;
    if (error) {
      list.innerHTML = `<div class="em-empty em-danger">${esc(error.message)}<br>Execute a migration 20260610_central_emails.sql.</div>`;
      return;
    }
    const busca = state.busca.toLowerCase().trim();
    state.emails = attachAccountInfo(data).filter((e) => {
      if (!busca) return true;
      return [e.assunto, e.remetente_email, e.remetente_nome, e.regional, e.categoria, e.resumo_ia].some((v) => String(v || '').toLowerCase().includes(busca));
    });
    renderEmails();
  }

  function renderEmails() {
    const list = document.getElementById('emList');
    if (!state.emails.length) {
      list.innerHTML = `<div class="em-empty">Nenhum e-mail encontrado para os filtros.</div>`;
      document.getElementById('emDetail').innerHTML = `<div class="em-empty">Selecione um e-mail para visualizar.</div>`;
      document.getElementById('emAction').innerHTML = `<div class="em-empty">Selecione um e-mail pra ver o que fazer com ele.</div>`;
      return;
    }
    list.innerHTML = state.emails.map((e) => `
      <div class="em-row ${state.selected?.id === e.id ? 'active' : ''}" data-email-id="${esc(e.id)}">
        <div class="em-row-top">
          <div class="em-row-from">
            <span class="em-avatar sm" style="background:${avatarColor(e.remetente_email || e.remetente_nome)}">${esc(initials(e.remetente_nome, e.remetente_email))}</span>
            <div class="em-subject">${esc(e.assunto || '(sem assunto)')}</div>
          </div>
          ${statusBadge(e.status)}
        </div>
        <div class="em-meta">${esc(e.remetente_nome || e.remetente_email || '-')} · ${brDate(e.data_recebimento)}</div>
        <div class="em-actions">${prioBadge(e.prioridade)}<span class="em-badge arquivado" title="${esc(categoriaDesc(e.categoria))}">${esc(categoriaLabel(e.categoria))}</span><span class="em-badge arquivado">${esc(regionalLabel(e.regional))}</span></div>
        <div class="em-snippet">${esc((resumoLegivel(e.resumo_ia) || onlyText(e.corpo_texto || e.corpo_html)).slice(0, 160))}</div>
      </div>
    `).join('');
  }

  async function selectEmail(id) {
    const selectedSummary = state.emails.find((e) => e.id === id) || null;
    state.selected = selectedSummary;
    renderEmails();
    if (!selectedSummary) return;
    const [{ data: fullEmail, error: emailError }, { data: attachments }, { data: outbox }] = await Promise.all([
      supabase.from('email_messages').select('*').eq('id', id).maybeSingle(),
      supabase.from('email_attachments').select('*').eq('email_id', id).order('created_at'),
      supabase.from('email_outbox').select('*').eq('email_id', id).order('created_at', { ascending: false })
    ]);
    if (emailError) {
      document.getElementById('emDetail').innerHTML = `<div class="em-empty em-danger">${esc(emailError.message)}</div>`;
      return;
    }
    state.selected = { ...selectedSummary, ...(fullEmail || {}), email_accounts: selectedSummary.email_accounts };
    state.attachments = attachments || [];
    state.outbox = outbox || [];
    renderDetail(userContext);
  }

  function renderDetail(userContext) {
    const e = state.selected;
    const detail = document.getElementById('emDetail');
    const actionEl = document.getElementById('emAction');
    if (!e) return;
    const dadosEntries = dadosDetectadosEntries(e.dados_detectados);
    const bodyText = emailBodyText(e);

    const ccList = String(e.cc || '').split(',').map((s) => s.trim()).filter(Boolean);
    const recipientsBlock = ccList.length > 1
      ? `<button type="button" class="em-recipients-toggle" id="emRecipientsToggle">👥 Destinatários e cópias ocultos (${ccList.length} contatos) · ver detalhes</button>
         <div class="em-recipients-full" id="emRecipientsFull" style="display:none">Para: ${esc(e.destinatario || '-')}<br>Cc: ${esc(e.cc)}</div>`
      : `<div class="em-to">Para: ${esc(e.destinatario || '-')}${e.cc ? ` · Cc: ${esc(e.cc)}` : ''}</div>`;

    detail.innerHTML = `
      <div class="em-detail">
        <div class="em-envelope">
          <div class="em-avatar" style="background:${avatarColor(e.remetente_email || e.remetente_nome)}">${esc(initials(e.remetente_nome, e.remetente_email))}</div>
          <div class="em-envelope-main">
            <h3>${esc(e.assunto || '(sem assunto)')}</h3>
            <div class="em-from"><b>${esc(e.remetente_nome || e.remetente_email || '-')}</b> <span class="em-muted">&lt;${esc(e.remetente_email || '')}&gt;</span></div>
            ${recipientsBlock}
          </div>
          <div class="em-envelope-meta">
            <div class="em-date">${esc(e.email_accounts?.nome || '')}<br>${brDate(e.data_recebimento)}</div>
            <div class="em-actions">${statusBadge(e.status)}${prioBadge(e.prioridade)}</div>
          </div>
        </div>

        <div class="em-insight-grid">
          <div class="em-insight-cell" title="Área/regional identificada no conteúdo do e-mail"><span>Regional</span><b>${esc(regionalLabel(e.regional))}</b></div>
          <div class="em-insight-cell" title="${esc(categoriaDesc(e.categoria))}"><span>Categoria</span><b>${esc(categoriaLabel(e.categoria))}</b></div>
          <div class="em-insight-cell" title="Se sim, o e-mail entra como pendente até você responder ou arquivar"><span>Precisa resposta?</span><b>${e.precisa_resposta ? 'Sim' : 'Não'}</b></div>
          <div class="em-insight-cell" title="Como o sistema decidiu a categoria acima"><span>Classificado por</span><b>${esc(classificadoPorLabel(e.classificado_por))}</b></div>
        </div>

        ${resumoLegivel(e.resumo_ia) ? `<div class="em-summary"><span class="em-summary-label">✨ Resumo da IA</span><p>${esc(resumoLegivel(e.resumo_ia))}</p></div>` : ''}

        ${dadosEntries.length ? `<div class="em-extracted"><span class="em-section-label">Dados detectados</span><dl class="em-dl">${dadosEntries.map(([k, v]) => `<dt>${esc(DADOS_LABELS[k] || prettyKey(k))}</dt><dd>${esc(typeof v === 'object' ? JSON.stringify(v) : v)}</dd>`).join('')}</dl></div>` : ''}

        ${state.attachments.length ? `<div><span class="em-section-label">Anexos ${state.attachments.some((a) => isDangerousAttachment(a.nome_arquivo, a.mime_type)) ? '⚠️ PERIGO' : ''}</span><div class="em-attachments">${state.attachments.map((a) => {
          const badge = INTERPRETACAO_BADGES[a.interpretacao_status];
          const size = formatBytes(a.tamanho_bytes);
          const isDangerous = isDangerousAttachment(a.nome_arquivo, a.mime_type);
          return `<button type="button" class="em-attachment" style="${isDangerous ? 'border-color:rgba(220,38,38,.6);background:rgba(220,38,38,.12)' : ''}" ${a.storage_path ? `data-attachment-path="${esc(a.storage_path)}"` : 'disabled title="Anexo não disponível para download"'}>
            <span>${isDangerous ? '🚨' : attachmentIcon(a.nome_arquivo)}</span>
            <span>${esc(a.nome_arquivo)}${isDangerous ? ' [SUSPEITO]' : ''}</span>
            ${size ? `<span class="em-muted">${esc(size)}</span>` : ''}
            ${badge ? `<span title="${esc(badge.title)}">${badge.icon}</span>` : ''}
          </button>`;
        }).join('')}</div></div>` : ''}

        <div>
          <span class="em-section-label">Mensagem</span>
          <div class="em-letter"><pre>${esc(bodyText || '(sem conteúdo)')}</pre></div>
        </div>
      </div>
    `;

    document.getElementById('emRecipientsToggle')?.addEventListener('click', () => {
      const full = document.getElementById('emRecipientsFull');
      full.style.display = full.style.display === 'none' ? 'block' : 'none';
    });

    actionEl.innerHTML = `
      <div class="em-detail">
        <div class="em-summary">
          <span class="em-summary-label">📤 Encaminhar e-mail</span>
          ${e.encaminhar_sugerido_para ? `<div class="em-muted em-small">Sugestão do sistema: <b>${esc(e.encaminhar_sugerido_para)}</b>${e.encaminhar_sugerido_cc ? ` · Cc: <b>${esc(e.encaminhar_sugerido_cc)}</b>` : ''} — você pode manter ou trocar abaixo.</div>` : `<div class="em-muted em-small">O sistema não identificou destinatário automático — selecione manualmente pra onde encaminhar.</div>`}
          ${(() => {
            const existente = state.outbox.find((o) => o.tipo === 'ENCAMINHAMENTO');
            if (existente) return `<div class="em-muted em-small">Encaminhamento já ${esc(existente.status)} em ${brDate(existente.created_at)}</div>`;
            return `
              <form id="emEncaminharForm" class="em-field">
                <label>Para</label>
                <input type="text" id="emEncaminharPara" value="${esc(e.encaminhar_sugerido_para || '')}" placeholder="email@dominio.com" />
                <label>Cc (opcional)</label>
                <input type="text" id="emEncaminharCc" value="${esc(e.encaminhar_sugerido_cc || '')}" placeholder="email@dominio.com" />
                <button class="btn btn-primary em-btn-full" type="submit" id="emAprovarEncaminhamento" style="margin-top:8px">Aprovar e encaminhar</button>
              </form>`;
          })()}
        </div>

        ${(e.os_sugestao_aguardar || []).map((sug) => {
          const linha = sug.linha || {};
          const candidatos = sug.candidatos || [];
          const desc = [linha.terminal, linha.cidade, linha.local].filter(Boolean).join(' · ') || 'linha sem terminal/cidade/local identificado';
          const corpo = !candidatos.length
            ? `<div class="em-muted em-small">Não encontrei nenhuma OS correspondente na tabela "Lista de OS" — confira manualmente.</div>`
            : candidatos.map((os) => `
              <div class="em-actions" style="justify-content:space-between;align-items:center;flex-wrap:wrap">
                <div class="em-small em-muted">OS <b style="color:var(--text)">${esc(os.numero_os)}</b> · ${esc(os.cliente || '-')} · ${esc(os.embarque || '-')}${os.contrato ? ` · Contrato ${esc(os.contrato)}` : ''}</div>
                ${os.status_gestor === 'AGUARDAR' ? '<span class="em-badge resolvido">Já está AGUARDAR</span>' : `<button class="btn btn-primary" type="button" data-marcar-os="${esc(os.id)}" data-numero-os="${esc(os.numero_os)}">Marcar AGUARDAR</button>`}
              </div>`).join('');
          return `<div class="em-summary"><span class="em-summary-label">🚦 Embarque suspenso detectado</span><p>${esc(desc)}${linha.data ? ` · ${esc(linha.data)}` : ''}</p><div class="em-muted em-small">Detectado na tabela de programação de embarque anexada a este e-mail.${candidatos.length ? ' Confirme qual OS marcar como AGUARDAR — o sistema não muda sozinho.' : ''}</div>${corpo}</div>`;
        }).join('')}

        <div class="em-reply">
          <span class="em-section-label">↩ Responder ao remetente</span>
          <form id="emReplyForm" class="em-field">
            <label>Resposta sugerida / resposta a enviar</label>
            <textarea id="emReplyText">${esc(e.resposta_sugerida || '')}</textarea>
            <button class="btn btn-primary em-btn-full" type="submit">✅ Aprovar e colocar na fila de envio</button>
            <div class="em-muted em-small">O texto acima vai pra fila de envio — o sistema manda pelo SMTP sozinho em seguida, sem precisar fazer mais nada.</div>
            ${state.outbox.length ? `<div class="em-muted em-small">Já existe resposta na fila: ${state.outbox.map((o) => `${esc(o.status)} em ${brDate(o.created_at)}`).join(' · ')}</div>` : ''}
          </form>

          <div class="em-reply-divider"></div>

          <div>
            <span class="em-secondary-label">Outras ações — não envia e-mail nenhum</span>
            <div class="em-actions">
              <button class="btn em-btn-ghost" type="button" data-action="resolved" title="Tira da lista de pendentes, sem enviar resposta">✔️ Marcar resolvido</button>
              <button class="btn em-btn-ghost" type="button" data-action="archive" title="Tira da lista de pendentes, sem enviar resposta">🗄️ Arquivar</button>
              <button class="btn em-btn-ghost" type="button" data-action="pending" title="Devolve pra lista de acompanhamento">⏳ Marcar pendente</button>
            </div>
          </div>
        </div>
      </div>
    `;

    document.getElementById('emReplyForm').addEventListener('submit', async (event) => {
      event.preventDefault();
      const text = document.getElementById('emReplyText').value.trim();
      if (!text) return alert('Digite a resposta antes de aprovar o envio.');
      const { error } = await supabase.from('email_outbox').insert({
        email_id: e.id,
        account_id: e.account_id,
        para: e.remetente_email,
        assunto: /^re:/i.test(e.assunto || '') ? e.assunto : `Re: ${e.assunto || ''}`,
        corpo: text,
        status: 'PENDENTE',
        aprovado_por: userContext?.user?.id || null,
        aprovado_por_nome: userContext?.profile?.full_name || userContext?.user?.email || null,
        aprovado_em: new Date().toISOString()
      });
      if (error) return alert(error.message);
      await updateEmail(e.id, { status: 'RESPONDER', resposta_sugerida: text }, userContext);
      await loadEmails();
      await selectEmail(e.id);
      alert('Resposta aprovada e colocada na fila. O worker enviará via SMTP.');
    });

    document.getElementById('emEncaminharForm')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const para = document.getElementById('emEncaminharPara').value.trim();
      const cc = document.getElementById('emEncaminharCc').value.trim();
      if (!para) return alert('Informe o destinatário do encaminhamento.');
      const { error } = await supabase.from('email_outbox').insert({
        email_id: e.id,
        account_id: e.account_id,
        tipo: 'ENCAMINHAMENTO',
        para,
        cc: cc || null,
        assunto: /^fwd:/i.test(e.assunto || '') ? e.assunto : `Fwd: ${e.assunto || ''}`,
        corpo: `Encaminhado automaticamente pela Central de E-mails.\n\n${bodyText}`,
        status: 'PENDENTE',
        aprovado_por: userContext?.user?.id || null,
        aprovado_por_nome: userContext?.profile?.full_name || userContext?.user?.email || null,
        aprovado_em: new Date().toISOString()
      });
      if (error) return alert(error.message);
      await selectEmail(e.id);
      alert('Encaminhamento aprovado e colocado na fila. O worker enviará via SMTP com os anexos originais.');
    });
  }

  async function loadPerigo() {
    const list = document.getElementById('emPerigoList');
    list.innerHTML = `<div class="em-empty">Carregando...</div>`;
    const { data, error } = await supabase.from('email_messages').select(EMAIL_LIST_SELECT).in('risco', ['ALTO', 'CRITICO']).not('status', 'in', '(ARQUIVADO,RESOLVIDO)').order('data_recebimento', { ascending: false }).limit(100);
    if (error) {
      list.innerHTML = `<div class="em-empty em-danger">${esc(error.message)}</div>`;
      return;
    }
    const rows = attachAccountInfo(data);
    if (!rows.length) {
      list.innerHTML = `<div class="em-empty">✅ Nenhum e-mail de risco detectado.</div>`;
      return;
    }
    list.innerHTML = rows.map((e) => `
      <div class="em-row" data-email-id="${esc(e.id)}" style="border-color:rgba(220,38,38,.38);background:rgba(220,38,38,.08)">
        <div class="em-row-top">
          <div class="em-row-from">
            <span class="em-avatar sm" style="background:#dc2626">${esc(initials(e.remetente_nome, e.remetente_email))}</span>
            <div class="em-subject">${esc(e.assunto || '(sem assunto)')}</div>
          </div>
          <div class="em-actions">
            <span class="em-badge erro">${e.risco || 'CRITICO'}</span>
            <button class="btn em-btn-ghost" type="button" data-excluir-perigo="${esc(e.id)}" title="Remove da lista de risco sem precisar abrir">🗑️ Excluir</button>
          </div>
        </div>
        <div class="em-meta">${esc(e.remetente_nome || e.remetente_email || '-')} · ${brDate(e.data_recebimento)}</div>
        <div class="em-snippet em-danger">⚠️ ${esc((resumoLegivel(e.resumo_ia) || onlyText(e.corpo_texto || e.corpo_html)).slice(0, 160))}</div>
      </div>
    `).join('');
    document.getElementById('emPerigoList').addEventListener('click', async (event) => {
      const excluirBtn = event.target.closest('[data-excluir-perigo]');
      if (excluirBtn) {
        if (!confirm('Excluir este e-mail da lista de risco? Ele não aparece mais aqui (continua guardado como arquivado).')) return;
        const { error: delError } = await supabase.from('email_messages').update({ status: 'ARQUIVADO' }).eq('id', excluirBtn.dataset.excluirPerigo);
        if (delError) return alert(delError.message);
        await loadPerigo();
        return;
      }
      const row = event.target.closest('[data-email-id]');
      if (row) selectEmail(row.dataset.emailId);
    });
  }

  async function loadOutbox() {
    const list = document.getElementById('emOutboxBody');
    list.innerHTML = `<div class="em-empty">Carregando...</div>`;
    const { data, error } = await supabase.from('email_outbox').select('*').order('created_at', { ascending: false }).limit(100);
    if (error) {
      list.innerHTML = `<div class="em-empty em-danger">${esc(error.message)}</div>`;
      return;
    }
    const rows = attachAccountInfo(data);
    if (!rows.length) {
      list.innerHTML = `<div class="em-empty">Nenhuma resposta na fila.</div>`;
      return;
    }
    list.innerHTML = rows.map((o) => `
      <div class="em-row">
        <div class="em-row-top">
          <div class="em-row-from">
            <span class="em-avatar sm" style="background:${avatarColor(o.para)}">${esc(initials(null, o.para))}</span>
            <div class="em-subject">${esc(o.assunto || '(sem assunto)')}</div>
          </div>
          <div class="em-actions">${o.tipo === 'ENCAMINHAMENTO' ? '<span class="em-badge arquivado">📤 Encaminhamento</span>' : '<span class="em-badge arquivado">↩ Resposta</span>'}${statusBadge(o.status)}</div>
        </div>
        <div class="em-meta">Para: ${esc(o.para)}${o.cc ? ` · Cc: ${esc(o.cc)}` : ''} · ${esc(o.email_accounts?.nome || '')} · ${brDate(o.created_at)}</div>
        ${o.aprovado_por_nome ? `<div class="em-actions"><span class="em-badge arquivado">Aprovado por ${esc(o.aprovado_por_nome)}</span></div>` : ''}
        ${o.erro ? `<div class="em-danger em-small">${esc(o.erro)}</div>` : ''}
      </div>
    `).join('');
  }

  async function syncAccount(accountId) {
    const acc = state.accounts.find((a) => a.id === accountId);
    alert(`Sincronização solicitada para ${acc?.email || 'conta'}. Execute o worker no servidor: npm --prefix email-worker run once`);
  }

  document.querySelectorAll('.em-tab').forEach((b) => b.addEventListener('click', () => setTab(b.dataset.tab)));
  document.getElementById('emFilter').addEventListener('submit', (event) => {
    event.preventDefault();
    state.conta = document.getElementById('emConta').value;
    state.status = document.getElementById('emStatus').value;
    state.busca = document.getElementById('emBusca').value;
    loadEmails();
  });
  document.getElementById('emList').addEventListener('click', (event) => {
    const row = event.target.closest('[data-email-id]');
    if (row) selectEmail(row.dataset.emailId);
  });
  document.getElementById('emDetailGrid').addEventListener('click', async (event) => {
    const attachmentBtn = event.target.closest('[data-attachment-path]');
    if (attachmentBtn) {
      const win = window.open('', '_blank');
      const { data, error } = await supabase.storage.from('email-anexos').createSignedUrl(attachmentBtn.dataset.attachmentPath, 300);
      if (error) {
        if (win) win.close();
        return alert(`Erro ao abrir anexo: ${error.message}`);
      }
      if (win) win.location.href = data.signedUrl;
      else window.open(data.signedUrl, '_blank');
      return;
    }
    const marcarOsBtn = event.target.closest('[data-marcar-os]');
    if (marcarOsBtn) {
      const osId = marcarOsBtn.dataset.marcarOs;
      const numeroOs = marcarOsBtn.dataset.numeroOs;
      const { error } = await supabase.from('operacional_os').update({
        status_gestor: 'AGUARDAR',
        configurada_em: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }).eq('id', osId);
      if (error) return alert(`Erro ao marcar OS: ${error.message}`);
      await supabase.from('email_historico').insert({
        email_id: state.selected?.id || null,
        usuario_id: userContext?.user?.id || null,
        usuario_nome: userContext?.profile?.full_name || userContext?.user?.email || null,
        acao: 'OS_MARCADA_AGUARDAR',
        detalhes: { numero_os: numeroOs, os_id: osId }
      });
      marcarOsBtn.outerHTML = '<span class="em-badge resolvido">Já está AGUARDAR</span>';
      alert(`OS ${numeroOs} marcada como AGUARDAR.`);
      return;
    }
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (!action || !state.selected) return;
    const next = action === 'resolved' ? 'RESOLVIDO' : action === 'archive' ? 'ARQUIVADO' : 'PENDENTE';
    await updateEmail(state.selected.id, { status: next }, userContext);
    await loadEmails();
    state.selected = null;
    document.getElementById('emDetail').innerHTML = `<div class="em-empty">Status atualizado.</div>`;
    document.getElementById('emAction').innerHTML = `<div class="em-empty">Selecione um e-mail pra ver o que fazer com ele.</div>`;
  });
  document.getElementById('emAccountForm').addEventListener('submit', saveAccount);
  document.getElementById('accClear').addEventListener('click', () => fillAccountForm(null));
  document.getElementById('emAccountsList').addEventListener('click', (event) => {
    const edit = event.target.closest('[data-edit-account]')?.dataset.editAccount;
    const sync = event.target.closest('[data-sync-account]')?.dataset.syncAccount;
    if (edit) fillAccountForm(state.accounts.find((a) => a.id === edit));
    if (sync) syncAccount(sync);
  });
  document.getElementById('emLoadOutbox').addEventListener('click', loadOutbox);

  const emGuia = document.getElementById('emGuia');
  const emGuiaAbrir = document.getElementById('emGuiaAbrir');
  const guiaFechado = localStorage.getItem('emGuiaFechado') === '1';
  emGuia.style.display = guiaFechado ? 'none' : '';
  emGuiaAbrir.style.display = guiaFechado ? '' : 'none';
  document.getElementById('emGuiaFechar').addEventListener('click', () => {
    localStorage.setItem('emGuiaFechado', '1');
    emGuia.style.display = 'none';
    emGuiaAbrir.style.display = '';
  });
  emGuiaAbrir.addEventListener('click', () => {
    localStorage.setItem('emGuiaFechado', '0');
    emGuia.style.display = '';
    emGuiaAbrir.style.display = 'none';
  });
  document.getElementById('emTabHint').textContent = TAB_HINTS.entrada;

  loadAccounts().then(loadEmails).catch((err) => {
    document.getElementById('emList').innerHTML = `<div class="em-empty em-danger">${esc(err.message || err)}</div>`;
  });
}

initProtectedPage('Central de E-mails', renderContent);
