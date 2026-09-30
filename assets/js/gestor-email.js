import { initProtectedPage } from './pageInit.js';
import { supabase } from './supabaseClient.js';
import { getCurrentUser } from './auth.js';
import { toPanelUrl } from './paths.js';

const state = { user: null, account: null, messages: [], selected: null, attachments: [], folder: 'entrada', search: '' };
const esc = (v) => String(v ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
const norm = (v) => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const initials = (name, email) => { const p=String(name||'').trim().split(/\s+/).filter(Boolean); return p.length>1?(p[0][0]+p.at(-1)[0]).toUpperCase():String(p[0]||email||'??').slice(0,2).toUpperCase(); };
const when = (v) => v ? new Date(v).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'}) : '-';
const mailboxType = (path) => { const p=norm(path); if(/sent|enviad/.test(p))return'enviados'; if(/draft|rascun/.test(p))return'rascunhos'; if(/trash|lixeira|deleted/.test(p))return'lixeira'; if(/junk|spam/.test(p))return'spam'; if(/archive|arquiv/.test(p))return'arquivo'; return'entrada'; };
// Converte HTML em texto (sem <style>/<script>), preservando quebras de parágrafo.
const htmlToText = (html) => {
  const box = document.createElement('textarea');
  box.innerHTML = String(html || '')
    .replace(/<(style|script)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<(br|hr)\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|li|h[1-6]|table)>/gi, '\n')
    .replace(/<[^>]+>/g, '');
  return box.value.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
};
const bodyOf = (m) => (m.corpo_texto && m.corpo_texto.trim()) ? m.corpo_texto : htmlToText(m.corpo_html);
const FOLDERS = [['entrada','Entrada'],['enviados','Enviados'],['rascunhos','Rascunhos'],['arquivo','Arquivo'],['spam','Spam'],['lixeira','Lixeira']];

function friendlyError(msg) {
  const m = norm(msg || '');
  if (/authenticationfailed|authentication failed|invalid credentials|login failed|senha incorreta/.test(m)) return 'Senha ou usuário inválidos. Verifique a senha da conta de e-mail e reconecte.';
  if (/nonexistent|mailbox doesn.t exist/.test(m)) return 'A pasta de e-mail informada não existe no servidor.';
  if (!msg) return 'Não foi possível conectar à conta de e-mail.';
  return msg;
}

function accountStatus() {
  const s=state.account?.conexao_status||'PENDENTE';
  return { cls:s==='CONECTADA'?'ok':s==='ERRO'?'error':'', label:s==='CONECTADA'?'Conta conectada':s==='ERRO'?'Falha na conexão':'Aguardando sincronização', error:s==='ERRO'?friendlyError(state.account?.ultima_sync_erro):null };
}

function renderConnect(content) {
  content.innerHTML = `<div class="gestor-mail"><section class="gm-connect-card"><div class="gm-eyebrow">Caixa pessoal do Gestor</div><h2>Conecte seu e-mail profissional</h2><p>Esta conta ficará vinculada exclusivamente ao seu usuário. Nenhum outro gestor poderá acessar suas mensagens.</p><form id="gmConnectForm"><div class="gm-connect-grid"><label class="span-2">E-mail<input id="gmEmail" type="email" required placeholder="seu.nome@grao1000.com.br"></label><label class="span-2">Senha<input id="gmPassword" type="password" required autocomplete="current-password" placeholder="Senha da conta de e-mail"></label><label>Provedor<select id="gmProvider"><option value="CPANEL">E-mail corporativo</option><option value="GOOGLE">Google Workspace</option><option value="MICROSOFT">Microsoft 365</option><option value="OUTRO">Outro servidor</option></select></label><label>Usuário<input id="gmUsername" placeholder="Igual ao e-mail, se vazio"></label><label>Servidor IMAP<input id="gmImapHost" placeholder="mail.grao1000.com.br"></label><label>Porta IMAP<input id="gmImapPort" type="number" value="993"></label><label>Servidor SMTP<input id="gmSmtpHost" placeholder="mail.grao1000.com.br"></label><label>Porta SMTP<input id="gmSmtpPort" type="number" value="465"></label></div><div class="gm-feedback" id="gmConnectFeedback"></div><div class="gm-connect-actions"><button class="btn btn-primary" type="submit">Conectar minha conta</button></div></form></section></div>`;
  content.querySelector('#gmConnectForm').addEventListener('submit', connectAccount);
}

function visibleMessages() {
  const q=norm(state.search);
  return state.messages.filter(m=>mailboxType(m.mailbox_path)===state.folder).filter(m=>state.folder==='lixeira'?!!m.excluido_em:!m.excluido_em).filter(m=>!q||norm(`${m.remetente_nome} ${m.remetente_email} ${m.assunto} ${m.corpo_texto}`).includes(q));
}

function renderWorkspace(content) {
  const status=accountStatus(), rows=visibleMessages(), unread=state.messages.filter(m=>!m.lido&&!m.excluido_em&&mailboxType(m.mailbox_path)==='entrada').length;
  content.innerHTML=`<div class="gestor-mail"><header class="gm-head"><div><div class="gm-eyebrow">Caixa pessoal do Gestor</div><h2>E-mail</h2><p>Mensagens exclusivas da conta vinculada ao seu usuário.</p></div><button class="gm-account" id="gmAccount" type="button"><i class="gm-dot ${status.cls}"></i><span><b>${status.label}</b><small>${esc(state.account.email)}</small></span><span>›</span></button></header>${status.error?`<div class="gm-alert"><span>⚠ ${esc(status.error)}</span><button class="btn btn-secondary" id="gmFixAccount" type="button">Corrigir credenciais</button></div>`:''}<div class="gm-toolbar"><input class="gm-search" id="gmSearch" type="search" value="${esc(state.search)}" placeholder="Buscar na sua caixa"><button class="btn btn-secondary" id="gmSync" type="button">↻ Sincronizar</button><button class="btn btn-primary" id="gmCompose" type="button">+ Novo e-mail</button></div><section class="gm-workspace ${state.selected?'reading':''}"><aside class="gm-folders">${FOLDERS.map(([id,label])=>`<button class="gm-folder ${state.folder===id?'active':''}" data-folder="${id}" type="button"><span>${label}</span>${id==='entrada'&&unread?`<b>${unread}</b>`:''}</button>`).join('')}</aside><div class="gm-list-col"><div class="gm-list-head"><div><b>${FOLDERS.find(f=>f[0]===state.folder)?.[1]||state.folder}</b><span id="gmCount">${rows.length} mensagem(ns)</span></div></div><div class="gm-list" id="gmList">${listHtml(rows)}</div></div><article class="gm-reader" id="gmReader">${renderReader()}</article></section></div>${composeModal()}${accountModal()}`;
  bindWorkspace(content);
}

function listHtml(rows) { return rows.length ? rows.map(messageRow).join('') : '<div class="gm-empty">Nenhuma mensagem nesta pasta.</div>'; }

function messageRow(m) { return `<button class="gm-row ${m.lido?'':'unread'} ${state.selected?.id===m.id?'active':''}" data-message="${m.id}" type="button"><span class="gm-avatar">${esc(initials(m.remetente_nome,m.remetente_email))}</span><span class="gm-row-copy"><b>${esc(m.remetente_nome||m.remetente_email||'(sem remetente)')}</b><strong>${esc(m.assunto||'(sem assunto)')}</strong><span>${esc(String(m.corpo_texto||'').replace(/\s+/g,' ').slice(0,90))}</span></span><time>${when(m.data_recebimento)}</time></button>`; }

function renderReader() {
  const m=state.selected;if(!m)return'<div class="gm-empty">Selecione uma mensagem para ler.</div>';
  const archiveBtn = '<button data-action="archive" type="button" title="Arquivar"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v10"/><path d="m8 9 4 4 4-4"/><path d="M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4"/></svg></button>';
  const restaurar = m.excluido_em || mailboxType(m.mailbox_path)==='arquivo';
  return `<div class="gm-reader-tools"><button class="gm-back" data-action="back" type="button" title="Voltar para a lista">‹ Voltar</button><span class="gm-tools-sp"></span><button data-action="read" type="button" title="${m.lido?'Marcar não lido':'Marcar lido'}">${m.lido?'○':'●'}</button><button data-action="star" type="button" title="Favorito">${m.favorito?'★':'☆'}</button>${restaurar?'<button data-action="restore" type="button" title="Mover para a Entrada">↩</button>':''}${restaurar?'':archiveBtn}${m.excluido_em?'':'<button data-action="trash" type="button" title="Excluir">✕</button>'}</div><h3>${esc(m.assunto||'(sem assunto)')}</h3><div class="gm-sender"><span class="gm-avatar">${esc(initials(m.remetente_nome,m.remetente_email))}</span><div><b>${esc(m.remetente_nome||m.remetente_email||'-')}</b><span>${esc(m.remetente_email||'')} · ${when(m.data_recebimento)}</span></div></div><div class="gm-attachments">${state.attachments.map(a=>`<button class="gm-attachment" data-attachment="${esc(a.storage_path||'')}" type="button" ${a.storage_path?'':'disabled'}>📎 ${esc(a.nome_arquivo)}</button>`).join('')}</div><div class="gm-body">${esc(bodyOf(m)||'(sem conteúdo)')}</div><div class="gm-reader-actions"><button class="btn btn-primary" data-compose-mode="reply" type="button">Responder</button><button class="btn btn-secondary" data-compose-mode="forward" type="button">Encaminhar</button><button class="btn btn-secondary" data-abrir-os type="button" title="Lê este e-mail e leva pra Abrir O.S. com os campos já preenchidos">🚚 Abrir O.S.</button></div>`;
}

// Lê o e-mail (já encaminhado pra este Gestor pela Central de E-mails, ver
// [[painel-web-emails-abrir-os-botao]]) e manda pra Abrir O.S. com os campos
// já preenchidos — quem preenche/confere/envia continua sendo o Gestor, com
// toda a validação (contrato por cliente, selects canônicos etc.) que já
// existe naquele formulário. Nada é criado a partir daqui.
//
// Tenta primeiro o mesmo modelo online (Groq/OpenAI) que já lê print/PDF em
// Logística > Abrir O.S. (edge function logistica-os-autopreencher, modo
// texto) — a IA local do Chrome (Gemini Nano) é lenta pra baixar/carregar e
// bem mais fraca extraindo texto corrido de e-mail. `enhanceLogisticaOsFields`
// só recorre a ela como fallback, se o provedor online falhar ou não tiver
// achado campos suficientes.
async function abrirOsFromEmail(event) {
  const m = state.selected;
  if (!m) return;
  const button = event.currentTarget;
  button.disabled = true;
  const original = button.textContent;
  button.textContent = 'IA lendo o e-mail...';
  try {
    const texto = bodyOf(m);
    let camposOnline = {};
    try {
      const { data, error } = await supabase.functions.invoke('logistica-os-autopreencher', { body: { texto } });
      if (!error && data?.campos) camposOnline = data.campos;
    } catch (err) {
      console.warn('[gestor-email] leitura online indisponível, tentando IA local', err);
    }
    const { enhanceLogisticaOsFields } = await import('./logistica-os-ai-structurer.js?v=20260925-tipo-exportacao1');
    const campos = await enhanceLogisticaOsFields(texto, camposOnline, (progress) => { button.textContent = progress; });
    sessionStorage.setItem('logisticaAberturaOsEmailPrefill', JSON.stringify(campos));
    location.href = `${toPanelUrl('logistica')}#abrir_os`;
  } catch (error) {
    console.error('[gestor-email] abrir-os', error);
    alert(`Não foi possível ler o e-mail automaticamente: ${error?.message || error}`);
    button.disabled = false;
    button.textContent = original;
  }
}

function composeModal(){return`<div class="gm-modal" id="gmComposeModal" hidden><div class="gm-modal-card"><h3 id="gmComposeTitle">Novo e-mail</h3><form id="gmComposeForm"><div class="gm-compose-grid"><label>Para<input id="gmTo" type="email" required></label><label>Cc<input id="gmCc" type="text"></label><label>Assunto<input id="gmSubject" required></label><label>Mensagem<textarea id="gmBody" rows="9" required></textarea></label></div><div class="gm-feedback" id="gmComposeFeedback"></div><div class="gm-compose-actions"><button class="btn btn-secondary" data-close-modal type="button">Cancelar</button><button class="btn btn-primary" type="submit">Enviar</button></div></form></div></div>`}
function accountModal(){const s=accountStatus();return`<div class="gm-modal" id="gmAccountModal" hidden><div class="gm-modal-card"><div class="gm-eyebrow">Conta vinculada</div><h3>${esc(state.account.email)}</h3><p class="muted">${s.label}<br>Última sincronização: ${when(state.account.ultima_sync_em)}${s.error?`<br><span class="text-danger">${esc(s.error)}</span>`:''}</p><form id="gmPasswordForm" class="gm-compose-grid"><label>Nova senha da conta<input id="gmNewPassword" type="password" required autocomplete="new-password" placeholder="Digite para atualizar a senha"></label><div class="gm-feedback" id="gmPasswordFeedback"></div><div class="gm-compose-actions"><button class="btn btn-primary" type="submit">Atualizar senha</button></div></form><div class="gm-compose-actions"><button class="btn btn-danger" id="gmDisconnect" type="button">Desconectar e apagar dados</button><button class="btn btn-secondary" data-close-modal type="button">Fechar</button></div></div></div>`}
async function connectAccount(event){
  event.preventDefault();
  const feedback=document.getElementById('gmConnectFeedback'),button=event.submitter;
  if(button)button.disabled=true;
  feedback.textContent='Salvando e preparando a sincronização...';
  const email=document.getElementById('gmEmail').value.trim();
  const domain=email.split('@')[1]||'grao1000.com.br';
  const payload={action:'connect',email,password:document.getElementById('gmPassword').value,provider:document.getElementById('gmProvider').value,username:document.getElementById('gmUsername').value.trim()||email,imap_host:document.getElementById('gmImapHost').value.trim()||`mail.${domain}`,imap_port:Number(document.getElementById('gmImapPort').value||993),smtp_host:document.getElementById('gmSmtpHost').value.trim()||`mail.${domain}`,smtp_port:Number(document.getElementById('gmSmtpPort').value||465)};
  const{data,error}=await supabase.functions.invoke('gestor-email-account',{body:payload});
  if(error||!data?.ok){feedback.textContent=data?.error||error?.message||'Falha ao conectar.';if(button)button.disabled=false;return}
  await loadAll(document.getElementById('pageContent'));
}

// Troca só a senha, mantendo a conta e as mensagens já sincronizadas (o "connect"
// da edge function atualiza a conta existente com os hosts/portas atuais).
async function updatePassword(event){
  event.preventDefault();
  const feedback=document.getElementById('gmPasswordFeedback'),button=event.submitter,a=state.account;
  const password=document.getElementById('gmNewPassword').value;
  if(button)button.disabled=true;
  feedback.textContent='Atualizando...';
  const payload={action:'connect',email:a.email,username:a.username||a.email,password,provider:a.provider||'CPANEL',imap_host:a.imap_host,imap_port:a.imap_port,imap_secure:a.imap_secure,smtp_host:a.smtp_host,smtp_port:a.smtp_port,smtp_secure:a.smtp_secure};
  const{data,error}=await supabase.functions.invoke('gestor-email-account',{body:payload});
  if(error||!data?.ok){feedback.textContent=data?.error||error?.message||'Falha ao atualizar a senha.';if(button)button.disabled=false;return}
  await loadAll(document.getElementById('pageContent'));
}

async function loadAccount(){const{data,error}=await supabase.from('email_accounts_public').select('*').eq('escopo','GESTOR').eq('owner_auth_user_id',state.user.id).maybeSingle();if(error)throw error;state.account=data||null;}
async function loadMessages(){if(!state.account){state.messages=[];return}const{data,error}=await supabase.from('email_messages').select('id,account_id,mailbox_path,origem:raw->>mailbox,remetente_nome,remetente_email,destinatario,cc,assunto,corpo_texto,corpo_html,data_recebimento,lido,favorito,arquivado_em,excluido_em,status').eq('account_id',state.account.id).order('data_recebimento',{ascending:false}).limit(250);if(error)throw error;state.messages=data||[];if(state.selected)state.selected=state.messages.find(m=>m.id===state.selected.id)||null;}
async function selectMessage(id,content){
  state.selected=state.messages.find(m=>m.id===id)||null;
  if(state.selected&&!state.selected.lido){
    const{error}=await supabase.from('email_messages').update({lido:true,imap_pendente:true}).eq('id',id);
    if(!error)state.selected.lido=true;
  }
  const{data}=await supabase.from('email_attachments').select('id,nome_arquivo,mime_type,tamanho_bytes,storage_path').eq('email_id',id).order('created_at');
  state.attachments=data||[];
  renderWorkspace(content);
}

function quoted(m){
  const who=m?.remetente_nome||m?.remetente_email||'';
  const body=bodyOf(m||{}).split('\n').map(l=>`> ${l}`).join('\n');
  return `\n\nEm ${when(m?.data_recebimento)}, ${who} escreveu:\n${body}`;
}

function openCompose(mode='new'){
  const modal=document.getElementById('gmComposeModal'),m=state.selected;
  document.getElementById('gmComposeTitle').textContent=mode==='reply'?'Responder':mode==='forward'?'Encaminhar':'Novo e-mail';
  document.getElementById('gmTo').value=mode==='reply'?(m?.remetente_email||''):'';
  document.getElementById('gmCc').value='';
  document.getElementById('gmSubject').value=mode==='reply'?(/^re:/i.test(m?.assunto||'')?m.assunto:`Re: ${m?.assunto||''}`):mode==='forward'?(/^(enc|fwd):/i.test(m?.assunto||'')?m.assunto:`Enc: ${m?.assunto||''}`):'';
  document.getElementById('gmBody').value=mode==='forward'?`\n\n---------- Mensagem encaminhada ----------\nDe: ${m?.remetente_email||''}\nAssunto: ${m?.assunto||''}\n\n${bodyOf(m||{})}`:mode==='reply'?quoted(m):'';
  document.getElementById('gmComposeFeedback').textContent='';
  modal.dataset.mode=mode;modal.hidden=false;
  const target=document.getElementById(mode==='reply'?'gmBody':'gmTo');
  target.focus();
  if(target.tagName==='TEXTAREA')target.setSelectionRange(0,0);
}

async function sendMessage(event){
  event.preventDefault();
  const feedback=document.getElementById('gmComposeFeedback'),button=event.submitter,mode=document.getElementById('gmComposeModal').dataset.mode||'new';
  const payload={email_id:mode==='new'?null:state.selected?.id||null,account_id:state.account.id,para:document.getElementById('gmTo').value.trim(),cc:document.getElementById('gmCc').value.trim()||null,assunto:document.getElementById('gmSubject').value.trim(),corpo:document.getElementById('gmBody').value.trim(),status:'PENDENTE',tipo:mode==='reply'?'RESPOSTA':mode==='forward'?'ENCAMINHAMENTO':'NOVO',aprovado_por:state.user.id,aprovado_por_nome:state.user.email,aprovado_em:new Date().toISOString()};
  if(button)button.disabled=true;
  feedback.textContent='Enviando para a fila...';
  const{error}=await supabase.from('email_outbox').insert(payload);
  if(button)button.disabled=false;
  if(error){feedback.textContent=`Não foi possível enviar: ${error.message}`;return}
  document.getElementById('gmComposeForm').reset();
  feedback.textContent='';
  document.getElementById('gmComposeModal').hidden=true;
  toast('Mensagem na fila de envio — sai em alguns minutos e aparece em Enviados.');
}

function toast(message){
  const el=document.createElement('div');
  el.className='gm-toast';el.textContent=message;
  document.body.appendChild(el);
  setTimeout(()=>el.remove(),4000);
}

async function messageAction(action,content){
  const m=state.selected;if(!m)return;
  if(action==='back'){state.selected=null;state.attachments=[];renderWorkspace(content);return}
  let update={};
  if(action==='read')update={lido:!m.lido};
  if(action==='star')update={favorito:!m.favorito};
  if(action==='archive')update={arquivado_em:new Date().toISOString(),mailbox_path:'Archive'};
  if(action==='trash')update={excluido_em:new Date().toISOString(),mailbox_path:'Trash'};
  if(action==='restore')update={arquivado_em:null,excluido_em:null,mailbox_path:m.origem&&!/trash|lixeira|archive|arquiv/i.test(m.origem)?m.origem:'INBOX'};
  // imap_pendente: o worker leva a mudança pro servidor de e-mail (flags e pastas) no próximo ciclo.
  update.imap_pendente=true;
  const{error}=await supabase.from('email_messages').update(update).eq('id',m.id);
  if(error)return alert(error.message);
  // Ler/marcar e favoritar mantêm a mensagem aberta; mover de pasta fecha o leitor.
  if(action==='read'||action==='star'){Object.assign(m,update);renderWorkspace(content);return}
  await loadMessages();state.selected=null;state.attachments=[];renderWorkspace(content);
  toast(action==='archive'?'Mensagem arquivada.':action==='trash'?'Mensagem movida para a Lixeira.':'Mensagem movida.');
}

function bindRows(content){content.querySelectorAll('[data-message]').forEach(b=>b.addEventListener('click',()=>selectMessage(b.dataset.message,content)));}

function bindWorkspace(content){
  content.querySelector('#gmSearch').addEventListener('input',e=>{
    state.search=e.target.value;
    // Só a lista é redesenhada: recriar a tela inteira perdia a posição do cursor na busca.
    const rows=visibleMessages();
    content.querySelector('#gmList').innerHTML=listHtml(rows);
    content.querySelector('#gmCount').textContent=`${rows.length} mensagem(ns)`;
    bindRows(content);
  });
  content.querySelectorAll('[data-folder]').forEach(b=>b.addEventListener('click',()=>{state.folder=b.dataset.folder;state.selected=null;state.attachments=[];renderWorkspace(content)}));
  bindRows(content);
  content.querySelector('#gmCompose').addEventListener('click',()=>openCompose());
  content.querySelector('#gmComposeForm').addEventListener('submit',sendMessage);
  content.querySelector('#gmPasswordForm').addEventListener('submit',updatePassword);
  content.querySelector('#gmSync').addEventListener('click',async e=>{
    const btn=e.currentTarget;btn.disabled=true;
    const{data,error}=await supabase.functions.invoke('gestor-email-account',{body:{action:'sync'}});
    btn.disabled=false;
    if(error||!data?.ok)return toast(`Não foi possível solicitar a sincronização: ${data?.error||error?.message||'erro desconhecido'}`);
    toast('Sincronização solicitada — as mensagens novas chegam em alguns minutos.');
  });
  content.querySelector('#gmAccount').addEventListener('click',()=>document.getElementById('gmAccountModal').hidden=false);
  content.querySelector('#gmFixAccount')?.addEventListener('click',()=>document.getElementById('gmAccountModal').hidden=false);
  content.querySelectorAll('[data-close-modal]').forEach(b=>b.addEventListener('click',()=>b.closest('.gm-modal').hidden=true));
  content.querySelectorAll('[data-action]').forEach(b=>b.addEventListener('click',()=>messageAction(b.dataset.action,content)));
  content.querySelectorAll('[data-compose-mode]').forEach(b=>b.addEventListener('click',()=>openCompose(b.dataset.composeMode)));
  content.querySelector('[data-abrir-os]')?.addEventListener('click',abrirOsFromEmail);
  content.querySelectorAll('[data-attachment]').forEach(b=>b.addEventListener('click',async()=>{const{data,error}=await supabase.storage.from('email-anexos').createSignedUrl(b.dataset.attachment,60);if(error)return alert(error.message);window.open(data.signedUrl,'_blank','noopener');}));
  content.querySelector('#gmDisconnect').addEventListener('click',async()=>{if(!confirm('Desconectar a conta e apagar todas as mensagens sincronizadas?'))return;const{data,error}=await supabase.functions.invoke('gestor-email-account',{body:{action:'disconnect'}});if(error||!data?.ok)return alert(data?.error||error?.message);state.account=null;state.messages=[];state.selected=null;renderConnect(content);});
}

async function loadAll(content){try{await loadAccount();if(!state.account){renderConnect(content);return}await loadMessages();renderWorkspace(content);}catch(error){content.innerHTML=`<div class="card"><h3>Não foi possível abrir sua caixa de e-mail</h3><p class="muted">${esc(error.message)}</p></div>`;}}
async function renderContent(){const content=document.getElementById('pageContent');state.user=await getCurrentUser();await loadAll(content);}

initProtectedPage('E-mail',renderContent);
