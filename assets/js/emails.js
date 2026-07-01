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
  s = s.replace(/<(br|hr)\s*\/?>/gi, '\n');
  s = s.replace(/<\/(p|div|tr|li|h[1-6]|table)>/gi, '\n');
  s = s.replace(/<li[^>]*>/gi, '• ');
  s = s.replace(/<[^>]+>/g, '');
  return decodeEntities(s);
}

function emailBodyText(e) {
  const source = (e.corpo_texto && e.corpo_texto.trim()) ? e.corpo_texto : htmlToText(e.corpo_html);
  return String(source || '')
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
  pagador_nome: 'Pagador', chave_pix: 'Chave PIX', numero_documento: 'Número do documento', banco: 'Banco'
};

function prettyKey(key) {
  return String(key).replace(/_/g, ' ').replace(/\b\p{L}/gu, (c) => c.toUpperCase());
}

function dadosDetectadosEntries(dados) {
  return Object.entries(dados || {}).filter(([, v]) => v !== null && v !== undefined && String(v).trim() !== '');
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

initProtectedPage('Central de E-mails', (content, userContext) => {
  content.innerHTML = `
    <style>
      .em-wrap{display:grid;gap:24px;position:relative}

      .em-hero{border:1px solid var(--line);border-radius:24px;padding:32px;background:var(--bg-card);box-shadow:var(--shadow-soft);position:relative;overflow:hidden}
      .em-hero h2{margin:0 0 8px;color:var(--text);font-size:32px;font-family:'Syne',sans-serif;font-weight:800;letter-spacing:-0.03em;position:relative;z-index:1}
      .em-hero p{margin:0;color:var(--muted);max-width:1000px;font-size:14px;line-height:1.6;position:relative;z-index:1}

      .em-tabs{display:flex;gap:12px;flex-wrap:wrap;align-items:center;border-bottom:1px solid var(--line);padding-bottom:16px}
      .em-tab{border:1px solid var(--line);border-radius:16px;padding:10px 16px;background:transparent;color:var(--muted);cursor:pointer;font-weight:700;font-size:12px;font-family:'DM Sans',sans-serif;text-transform:uppercase;letter-spacing:.06em;transition:all 200ms;position:relative}
      .em-tab:hover{border-color:var(--green-2);background:rgba(63,168,120,.08);color:var(--green-2)}
      .em-tab.active{background:var(--green-soft);color:var(--green-2);border-color:var(--green-2)}

      .em-card{border:1px solid var(--line);border-radius:24px;background:var(--bg-card);padding:20px;min-width:0;box-shadow:var(--shadow-soft);position:relative}

      .em-grid{display:grid;grid-template-columns:420px minmax(0,1fr);gap:20px;align-items:start}
      .em-filter{display:grid;grid-template-columns:1.1fr 1fr 1.5fr auto;gap:12px;align-items:end}
      .em-field{display:grid;gap:8px}.em-field label{font-size:12px;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;font-family:'DM Sans',sans-serif;font-weight:700}
      .em-field input,.em-field select,.em-field textarea{border:1px solid var(--line);border-radius:16px;background:var(--bg-soft);color:var(--text);padding:12px 14px;color-scheme:dark;min-width:0;font-family:inherit;transition:all 150ms;font-size:14px}
      .em-field input:focus,.em-field select:focus,.em-field textarea:focus{border-color:var(--green-2);background:var(--bg);box-shadow:0 0 0 3px var(--green-soft);outline:none}
      .em-field textarea{min-height:120px;resize:vertical;line-height:1.45}

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
      .em-letter pre{white-space:pre-wrap;word-break:break-word;color:var(--text);line-height:1.8;font-size:14px;font-family:'DM Sans',monospace;margin:0;max-height:480px;overflow:auto;padding-right:8px}

      .em-reply{border:1px solid var(--line);border-radius:16px;background:var(--bg-soft);padding:18px;display:grid;gap:12px}

      .em-empty{color:var(--muted);text-align:center;padding:40px;border:1px dashed var(--line);border-radius:16px;font-size:14px;line-height:1.6}
      .em-muted{color:var(--muted)}.em-small{font-size:12px}.em-danger{color:var(--danger);font-weight:700}.em-ok{color:var(--green-2);font-weight:700}
      .em-account-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}.em-account-grid .wide{grid-column:1/-1}.em-check{display:flex;align-items:center;gap:10px;color:var(--text);font-size:13px;margin-top:24px;font-family:'DM Sans',sans-serif}

      @media(max-width:1040px){.em-grid{grid-template-columns:1fr}.em-list{max-height:unset}.em-filter,.em-account-grid{grid-template-columns:1fr}.em-check{margin-top:0}.em-envelope{flex-wrap:wrap}.em-envelope-meta{flex-direction:row;align-items:center;text-align:left}}
    </style>

    <section class="em-wrap">
      <div class="em-hero">
        <h2>Central de E-mails</h2>
        <p>Lê caixas do cPanel via IMAP, classifica por regional/assunto, gera resumo e resposta sugerida. O envio fica em fila para aprovação e processamento pelo worker do servidor.</p>
      </div>

      <div class="em-tabs">
        <button class="em-tab active" data-tab="entrada" type="button">Entrada</button>
        <button class="em-tab" data-tab="perigo" type="button">🔴 PERIGO</button>
        <button class="em-tab" data-tab="outbox" type="button">Fila de Respostas</button>
        <button class="em-tab" data-tab="contas" type="button">Contas cPanel</button>
      </div>

      <div id="emPanelEntrada" class="em-panel">
        <article class="em-card">
          <form id="emFilter" class="em-filter">
            <div class="em-field"><label>Conta</label><select id="emConta"><option value="">Todas</option></select></div>
            <div class="em-field"><label>Status</label><select id="emStatus"><option value="NOVO,PENDENTE,RESPONDER">Pendentes</option><option value="RESPONDIDO,RESOLVIDO">Respondidos/Resolvidos</option><option value="ARQUIVADO,IGNORADO">Arquivados/Ignorados</option><option value="">Todos</option></select></div>
            <div class="em-field"><label>Buscar</label><input id="emBusca" placeholder="remetente, assunto, categoria, regional..."></div>
            <button class="btn btn-primary" type="submit">↻ Atualizar</button>
          </form>
        </article>
        <div class="em-grid">
          <article class="em-card"><div class="em-list" id="emList"><div class="em-empty">Carregando...</div></div></article>
          <article class="em-card"><div id="emDetail" class="em-empty">Selecione um e-mail para visualizar.</div></article>
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

  function setTab(tab) {
    state.tab = tab;
    document.querySelectorAll('.em-tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
    document.getElementById('emPanelEntrada').style.display = tab === 'entrada' ? '' : 'none';
    document.getElementById('emPanelPerigo').style.display = tab === 'perigo' ? '' : 'none';
    document.getElementById('emPanelOutbox').style.display = tab === 'outbox' ? '' : 'none';
    document.getElementById('emPanelContas').style.display = tab === 'contas' ? '' : 'none';
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
        <div class="em-actions">${prioBadge(e.prioridade)}<span class="em-badge arquivado">${esc(e.categoria || 'SEM CATEGORIA')}</span><span class="em-badge arquivado">${esc(e.regional || 'SEM REGIONAL')}</span></div>
        <div class="em-snippet">${esc((e.resumo_ia || onlyText(e.corpo_texto || e.corpo_html)).slice(0, 160))}</div>
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
    if (!e) return;
    const dadosEntries = dadosDetectadosEntries(e.dados_detectados);
    const bodyText = emailBodyText(e);
    detail.innerHTML = `
      <div class="em-detail">
        <div class="em-envelope">
          <div class="em-avatar" style="background:${avatarColor(e.remetente_email || e.remetente_nome)}">${esc(initials(e.remetente_nome, e.remetente_email))}</div>
          <div class="em-envelope-main">
            <h3>${esc(e.assunto || '(sem assunto)')}</h3>
            <div class="em-from"><b>${esc(e.remetente_nome || e.remetente_email || '-')}</b> <span class="em-muted">&lt;${esc(e.remetente_email || '')}&gt;</span></div>
            <div class="em-to">Para: ${esc(e.destinatario || '-')}${e.cc ? ` · Cc: ${esc(e.cc)}` : ''}</div>
          </div>
          <div class="em-envelope-meta">
            <div class="em-date">${esc(e.email_accounts?.nome || '')}<br>${brDate(e.data_recebimento)}</div>
            <div class="em-actions">${statusBadge(e.status)}${prioBadge(e.prioridade)}</div>
          </div>
        </div>

        <div class="em-insights">
          <div class="em-chip">Regional <b>${esc(e.regional || '—')}</b></div>
          <div class="em-chip">Categoria <b>${esc(e.categoria || '—')}</b></div>
          <div class="em-chip">Precisa resposta? <b>${e.precisa_resposta ? 'Sim' : 'Não'}</b></div>
          <div class="em-chip">Classificado por <b>${esc(e.classificado_por || '—')}</b></div>
        </div>

        ${e.resumo_ia ? `<div class="em-summary"><span class="em-summary-label">✨ Resumo da IA</span><p>${esc(e.resumo_ia)}</p></div>` : ''}

        ${e.encaminhar_sugerido_para ? `<div class="em-summary"><span class="em-summary-label">📤 Encaminhamento sugerido</span><p>Para: <b>${esc(e.encaminhar_sugerido_para)}</b>${e.encaminhar_sugerido_cc ? ` · Cc: <b>${esc(e.encaminhar_sugerido_cc)}</b>` : ''}</p>${(() => {
          const existente = state.outbox.find((o) => o.tipo === 'ENCAMINHAMENTO');
          return existente
            ? `<div class="em-muted em-small">Encaminhamento já ${esc(existente.status)} em ${brDate(existente.created_at)}</div>`
            : `<div class="em-actions"><button class="btn btn-primary" type="button" id="emAprovarEncaminhamento">Aprovar encaminhamento</button></div>`;
        })()}</div>` : ''}

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

        <div class="em-reply">
          <span class="em-section-label">↩ Responder</span>
          <form id="emReplyForm" class="em-field">
            <label>Resposta sugerida / resposta a enviar</label>
            <textarea id="emReplyText">${esc(e.resposta_sugerida || '')}</textarea>
            <div class="em-actions">
              <button class="btn btn-primary" type="submit">Aprovar e colocar na fila de envio</button>
              <button class="btn btn-secondary" type="button" data-action="resolved">Marcar resolvido</button>
              <button class="btn btn-secondary" type="button" data-action="archive">Arquivar</button>
              <button class="btn btn-secondary" type="button" data-action="pending">Marcar pendente</button>
            </div>
            ${state.outbox.length ? `<div class="em-muted em-small">Já existe resposta na fila: ${state.outbox.map((o) => `${esc(o.status)} em ${brDate(o.created_at)}`).join(' · ')}</div>` : ''}
          </form>
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

    document.getElementById('emAprovarEncaminhamento')?.addEventListener('click', async () => {
      const { error } = await supabase.from('email_outbox').insert({
        email_id: e.id,
        account_id: e.account_id,
        tipo: 'ENCAMINHAMENTO',
        para: e.encaminhar_sugerido_para,
        cc: e.encaminhar_sugerido_cc || null,
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
    const { data, error } = await supabase.from('email_messages').select(EMAIL_LIST_SELECT).in('risco', ['ALTO', 'CRITICO']).order('data_recebimento', { ascending: false }).limit(100);
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
          <span class="em-badge erro">${e.risco || 'CRITICO'}</span>
        </div>
        <div class="em-meta">${esc(e.remetente_nome || e.remetente_email || '-')} · ${brDate(e.data_recebimento)}</div>
        <div class="em-snippet em-danger">⚠️ ${esc((e.resumo_ia || onlyText(e.corpo_texto || e.corpo_html)).slice(0, 160))}</div>
      </div>
    `).join('');
    document.getElementById('emPerigoList').addEventListener('click', (event) => {
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
  document.getElementById('emDetail').addEventListener('click', async (event) => {
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
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (!action || !state.selected) return;
    const next = action === 'resolved' ? 'RESOLVIDO' : action === 'archive' ? 'ARQUIVADO' : 'PENDENTE';
    await updateEmail(state.selected.id, { status: next }, userContext);
    await loadEmails();
    state.selected = null;
    document.getElementById('emDetail').innerHTML = `<div class="em-empty">Status atualizado.</div>`;
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

  loadAccounts().then(loadEmails).catch((err) => {
    document.getElementById('emList').innerHTML = `<div class="em-empty em-danger">${esc(err.message || err)}</div>`;
  });
});
