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
      .em-wrap{display:grid;gap:18px}
      .em-hero{border:1px solid rgba(148,163,184,.18);border-radius:24px;padding:22px;background:linear-gradient(135deg,rgba(15,23,42,.96),rgba(37,99,235,.20));box-shadow:0 20px 50px rgba(2,6,23,.22)}
      .em-hero h2{margin:0 0 6px;color:#f8fafc;font-size:28px}.em-hero p{margin:0;color:#94a3b8;max-width:980px}
      .em-tabs,.em-actions{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
      .em-tab{border:1px solid rgba(148,163,184,.18);border-radius:999px;padding:9px 16px;background:rgba(15,23,42,.6);color:#94a3b8;cursor:pointer;font-weight:800;font-size:13px}
      .em-tab.active{background:rgba(37,99,235,.24);color:#bfdbfe;border-color:rgba(96,165,250,.35)}
      .em-card{border:1px solid rgba(148,163,184,.16);border-radius:22px;background:rgba(15,23,42,.82);padding:18px;min-width:0}
      .em-grid{display:grid;grid-template-columns:390px minmax(0,1fr);gap:16px;align-items:start}
      .em-filter{display:grid;grid-template-columns:1.1fr 1fr 1.5fr auto;gap:10px;align-items:end}
      .em-field{display:grid;gap:6px}.em-field label{font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:.06em}
      .em-field input,.em-field select,.em-field textarea{border:1px solid rgba(148,163,184,.22);border-radius:14px;background:#0d0d18;color:#e2e8f0;padding:10px 12px;color-scheme:dark;min-width:0}
      .em-field textarea{min-height:120px;resize:vertical;line-height:1.45}
      .em-list{display:grid;gap:8px;max-height:70vh;overflow:auto;padding-right:4px}
      .em-row{border:1px solid rgba(148,163,184,.12);background:rgba(2,6,23,.42);border-radius:16px;padding:12px;cursor:pointer;display:grid;gap:6px}
      .em-row:hover,.em-row.active{border-color:rgba(96,165,250,.38);background:rgba(37,99,235,.12)}
      .em-row-top{display:flex;align-items:center;justify-content:space-between;gap:8px}.em-subject{color:#f8fafc;font-weight:800;line-height:1.25}.em-meta{font-size:12px;color:#94a3b8}.em-snippet{font-size:12px;color:#cbd5e1;line-height:1.35}
      .em-badge,.em-prio{display:inline-flex;align-items:center;padding:4px 9px;border-radius:999px;font-size:10px;font-weight:900;letter-spacing:.03em;border:1px solid rgba(148,163,184,.18);white-space:nowrap}
      .em-badge.novo{background:rgba(59,130,246,.16);color:#bfdbfe}.em-badge.pendente,.em-badge.responder{background:rgba(245,158,11,.12);color:#fde68a}.em-badge.respondido,.em-badge.resolvido{background:rgba(22,163,74,.16);color:#bbf7d0}.em-badge.arquivado,.em-badge.ignorado{background:rgba(100,116,139,.16);color:#cbd5e1}.em-badge.erro{background:rgba(220,38,38,.18);color:#fecaca}
      .em-prio.baixa{background:rgba(100,116,139,.12);color:#cbd5e1}.em-prio.normal{background:rgba(59,130,246,.12);color:#bfdbfe}.em-prio.alta{background:rgba(245,158,11,.12);color:#fde68a}.em-prio.urgente{background:rgba(220,38,38,.18);color:#fecaca}
      .em-detail{display:grid;gap:14px}.em-detail-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.em-detail h3{margin:0;color:#f8fafc;font-size:22px}.em-kv{display:grid;grid-template-columns:120px minmax(0,1fr);gap:8px;font-size:13px}.em-kv span:nth-child(odd){color:#94a3b8}.em-kv span:nth-child(even){color:#e2e8f0;min-width:0;word-break:break-word}
      .em-analysis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}.em-box{border:1px solid rgba(148,163,184,.12);border-radius:16px;background:rgba(2,6,23,.34);padding:12px}.em-box span{display:block;color:#94a3b8;font-size:10px;text-transform:uppercase;letter-spacing:.06em}.em-box strong{display:block;color:#f8fafc;margin-top:5px}
      .em-body{white-space:pre-wrap;color:#e2e8f0;line-height:1.55;max-height:300px;overflow:auto;border:1px solid rgba(148,163,184,.12);border-radius:16px;background:rgba(2,6,23,.32);padding:14px}
      .em-empty{color:#94a3b8;text-align:center;padding:30px;border:1px dashed rgba(148,163,184,.22);border-radius:18px}.em-muted{color:#94a3b8}.em-small{font-size:12px}.em-danger{color:#fecaca}.em-ok{color:#bbf7d0}
      .em-account-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.em-account-grid .wide{grid-column:1/-1}.em-check{display:flex;align-items:center;gap:8px;color:#cbd5e1;font-size:13px;margin-top:24px}
      .em-table-wrap{overflow:auto;border-radius:18px;border:1px solid rgba(148,163,184,.14)}.em-table{width:100%;border-collapse:collapse;min-width:760px}.em-table th,.em-table td{padding:12px;border-bottom:1px solid rgba(148,163,184,.12);text-align:left;color:#e2e8f0;vertical-align:top}.em-table th{background:rgba(15,23,42,.96);color:#94a3b8;font-size:11px;text-transform:uppercase;letter-spacing:.06em}
      @media(max-width:1040px){.em-grid{grid-template-columns:1fr}.em-list{max-height:unset}.em-filter,.em-account-grid,.em-analysis{grid-template-columns:1fr}.em-check{margin-top:0}.em-kv{grid-template-columns:1fr}}
    </style>

    <section class="em-wrap">
      <div class="em-hero">
        <h2>Central de E-mails</h2>
        <p>Lê caixas do cPanel via IMAP, classifica por regional/assunto, gera resumo e resposta sugerida. O envio fica em fila para aprovação e processamento pelo worker do servidor.</p>
      </div>

      <div class="em-tabs">
        <button class="em-tab active" data-tab="entrada" type="button">Entrada</button>
        <button class="em-tab" data-tab="outbox" type="button">Fila de Respostas</button>
        <button class="em-tab" data-tab="contas" type="button">Contas cPanel</button>
      </div>

      <div id="emPanelEntrada" class="em-panel">
        <article class="em-card">
          <form id="emFilter" class="em-filter">
            <div class="em-field"><label>Conta</label><select id="emConta"><option value="">Todas</option></select></div>
            <div class="em-field"><label>Status</label><select id="emStatus"><option value="NOVO,PENDENTE,RESPONDER">Pendentes</option><option value="RESPONDIDO,RESOLVIDO">Respondidos/Resolvidos</option><option value="ARQUIVADO,IGNORADO">Arquivados/Ignorados</option><option value="">Todos</option></select></div>
            <div class="em-field"><label>Buscar</label><input id="emBusca" placeholder="remetente, assunto, categoria, regional..."></div>
            <button class="btn btn-primary" type="submit">Atualizar</button>
          </form>
        </article>
        <div class="em-grid">
          <article class="em-card"><div class="em-list" id="emList"><div class="em-empty">Carregando...</div></div></article>
          <article class="em-card"><div id="emDetail" class="em-empty">Selecione um e-mail para visualizar.</div></article>
        </div>
      </div>

      <div id="emPanelOutbox" class="em-panel" style="display:none">
        <article class="em-card">
          <div class="em-actions" style="justify-content:space-between;margin-bottom:12px">
            <div><strong style="color:#f8fafc">Fila de respostas aprovadas</strong><div class="em-muted em-small">O worker envia via SMTP e atualiza esta fila.</div></div>
            <button class="btn btn-secondary" id="emLoadOutbox" type="button">Atualizar fila</button>
          </div>
          <div class="em-table-wrap"><table class="em-table"><thead><tr><th>Status</th><th>Para</th><th>Assunto</th><th>Aprovado por</th><th>Erro</th></tr></thead><tbody id="emOutboxBody"><tr><td colspan="5" class="em-muted">Carregando...</td></tr></tbody></table></div>
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
    document.getElementById('emPanelOutbox').style.display = tab === 'outbox' ? '' : 'none';
    document.getElementById('emPanelContas').style.display = tab === 'contas' ? '' : 'none';
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
        <div class="em-row-top"><div class="em-subject">${esc(a.nome)} — ${esc(a.email)}</div>${a.ativo ? '<span class="em-badge resolvido">ATIVA</span>' : '<span class="em-badge arquivado">INATIVA</span>'}</div>
        <div class="em-meta">IMAP ${esc(a.imap_host)}:${esc(a.imap_port)} · SMTP ${esc(a.smtp_host)}:${esc(a.smtp_port)}</div>
        <div class="em-meta">Última sincronização: ${brDate(a.ultima_sync_em)} · ${esc(a.ultima_sync_status || '-')}</div>
        ${a.ultima_sync_erro ? `<div class="em-danger em-small">${esc(a.ultima_sync_erro)}</div>` : ''}
        <div class="em-actions"><button class="btn btn-secondary" data-edit-account="${esc(a.id)}" type="button">Editar</button><button class="btn btn-primary" data-sync-account="${esc(a.id)}" type="button">Sincronizar agora</button></div>
      </div>
    `).join('');
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
      nome: document.getElementById('accNome').value.trim(),
      email: document.getElementById('accEmail').value.trim(),
      username: document.getElementById('accUsername').value.trim(),
      imap_host: document.getElementById('accImapHost').value.trim(),
      imap_port: Number(document.getElementById('accImapPort').value || 993),
      imap_secure: document.getElementById('accImapSecure').checked,
      smtp_host: document.getElementById('accSmtpHost').value.trim(),
      smtp_port: Number(document.getElementById('accSmtpPort').value || 465),
      smtp_secure: document.getElementById('accSmtpSecure').checked,
      limite_por_sync: Number(document.getElementById('accLimit').value || 30),
      ativo: document.getElementById('accAtivo').checked,
      auto_responder: document.getElementById('accAuto').checked,
      updated_at: new Date().toISOString()
    };
    if (!id || password) payload.password_cipher = password;
    if (!id) {
      payload.criado_por = userContext?.user?.id || null;
      payload.criado_por_nome = userContext?.profile?.full_name || userContext?.user?.email || null;
    }
    const query = id
      ? supabase.from('email_accounts').update(payload).eq('id', id)
      : supabase.from('email_accounts').insert(payload);
    const { error } = await query;
    if (error) return alert(error.message);
    fillAccountForm(null);
    await loadAccounts();
    alert('Conta salva. Execute o worker no servidor para sincronizar/enviar e-mails.');
  }

  async function loadEmails() {
    const list = document.getElementById('emList');
    list.innerHTML = `<div class="em-empty">Carregando e-mails...</div>`;
    let q = supabase.from('email_messages').select('*, email_accounts(nome,email)').order('data_recebimento', { ascending: false }).limit(80);
    if (state.conta) q = q.eq('account_id', state.conta);
    if (state.status) q = q.in('status', state.status.split(','));
    const { data, error } = await q;
    if (error) {
      list.innerHTML = `<div class="em-empty em-danger">${esc(error.message)}<br>Execute a migration 20260610_central_emails.sql.</div>`;
      return;
    }
    const busca = state.busca.toLowerCase().trim();
    state.emails = (data || []).filter((e) => {
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
        <div class="em-row-top"><div class="em-subject">${esc(e.assunto || '(sem assunto)')}</div>${statusBadge(e.status)}</div>
        <div class="em-meta">${esc(e.remetente_nome || e.remetente_email || '-')} · ${brDate(e.data_recebimento)}</div>
        <div class="em-actions">${prioBadge(e.prioridade)}<span class="em-badge arquivado">${esc(e.categoria || 'SEM CATEGORIA')}</span><span class="em-badge arquivado">${esc(e.regional || 'SEM REGIONAL')}</span></div>
        <div class="em-snippet">${esc((e.resumo_ia || onlyText(e.corpo_texto || e.corpo_html)).slice(0, 160))}</div>
      </div>
    `).join('');
  }

  async function selectEmail(id) {
    state.selected = state.emails.find((e) => e.id === id) || null;
    renderEmails();
    if (!state.selected) return;
    const [{ data: attachments }, { data: outbox }] = await Promise.all([
      supabase.from('email_attachments').select('*').eq('email_id', id).order('created_at'),
      supabase.from('email_outbox').select('*').eq('email_id', id).order('created_at', { ascending: false })
    ]);
    state.attachments = attachments || [];
    state.outbox = outbox || [];
    renderDetail(userContext);
  }

  function renderDetail(userContext) {
    const e = state.selected;
    const detail = document.getElementById('emDetail');
    if (!e) return;
    const dados = e.dados_detectados || {};
    detail.innerHTML = `
      <div class="em-detail">
        <div class="em-detail-head">
          <div><h3>${esc(e.assunto || '(sem assunto)')}</h3><div class="em-muted em-small">${esc(e.email_accounts?.nome || '')} · ${brDate(e.data_recebimento)}</div></div>
          <div class="em-actions">${statusBadge(e.status)}${prioBadge(e.prioridade)}</div>
        </div>
        <div class="em-kv">
          <span>Remetente</span><span>${esc(e.remetente_nome || '')} &lt;${esc(e.remetente_email || '')}&gt;</span>
          <span>Destinatário</span><span>${esc(e.destinatario || '-')}</span>
          <span>CC</span><span>${esc(e.cc || '-')}</span>
        </div>
        <div class="em-analysis">
          <div class="em-box"><span>Regional</span><strong>${esc(e.regional || '-')}</strong></div>
          <div class="em-box"><span>Categoria</span><strong>${esc(e.categoria || '-')}</strong></div>
          <div class="em-box"><span>Responder?</span><strong>${e.precisa_resposta ? 'Sim' : 'Não'}</strong></div>
          <div class="em-box"><span>Classificação</span><strong>${esc(e.classificado_por || '-')}</strong></div>
        </div>
        <div class="em-box"><span>Resumo</span><strong style="font-weight:500;line-height:1.45">${esc(e.resumo_ia || 'Sem resumo gerado.')}</strong></div>
        <div class="em-box"><span>Dados detectados</span><pre style="white-space:pre-wrap;color:#e2e8f0;margin:8px 0 0;font-size:12px">${esc(JSON.stringify(dados, null, 2))}</pre></div>
        ${state.attachments.length ? `<div class="em-box"><span>Anexos</span><div class="em-actions" style="margin-top:8px">${state.attachments.map((a) => `<span class="em-badge arquivado">${esc(a.nome_arquivo)}</span>`).join('')}</div></div>` : ''}
        <div><div class="em-muted em-small" style="margin-bottom:6px">Conteúdo</div><div class="em-body">${esc(onlyText(e.corpo_texto || e.corpo_html) || '(sem conteúdo)')}</div></div>
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
  }

  async function loadOutbox() {
    const tbody = document.getElementById('emOutboxBody');
    tbody.innerHTML = `<tr><td colspan="5" class="em-muted">Carregando...</td></tr>`;
    const { data, error } = await supabase.from('email_outbox').select('*, email_accounts(nome,email)').order('created_at', { ascending: false }).limit(100);
    if (error) {
      tbody.innerHTML = `<tr><td colspan="5" class="em-danger">${esc(error.message)}</td></tr>`;
      return;
    }
    if (!data?.length) {
      tbody.innerHTML = `<tr><td colspan="5" class="em-muted">Nenhuma resposta na fila.</td></tr>`;
      return;
    }
    tbody.innerHTML = data.map((o) => `
      <tr>
        <td>${statusBadge(o.status)}<div class="em-muted em-small">${esc(o.email_accounts?.nome || '')}</div></td>
        <td>${esc(o.para)}</td>
        <td>${esc(o.assunto)}<div class="em-muted em-small">${brDate(o.created_at)}</div></td>
        <td>${esc(o.aprovado_por_nome || '-')}</td>
        <td>${esc(o.erro || '-')}</td>
      </tr>
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
