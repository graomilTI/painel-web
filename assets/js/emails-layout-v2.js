import { supabase } from './supabaseClient.js';

const icon = {
  mail: '<svg viewBox="0 0 24 24"><path d="M4 6h16v12H4z"/><path d="m4 7 8 6 8-6"/></svg>',
  clock: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><path d="M12 7v6l4 2"/></svg>',
  alert: '<svg viewBox="0 0 24 24"><path d="M12 3 3 20h18L12 3Z"/><path d="M12 9v5M12 17h.01"/></svg>',
  check: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><path d="m8.5 12.5 2.3 2.3 4.9-5"/></svg>',
  ai: '<svg viewBox="0 0 24 24"><path d="m12 2 1.8 5.2L19 9l-5.2 1.8L12 16l-1.8-5.2L5 9l5.2-1.8L12 2Z"/><path d="m19 14 .9 2.6 2.6.9-2.6.9L19 21l-.9-2.6-2.6-.9 2.6-.9L19 14Z"/></svg>'
};

function addStyle() {
  if (document.getElementById('emails-layout-v2-style')) return;
  const s = document.createElement('style');
  s.id = 'emails-layout-v2-style';
  s.textContent = `
    body.email-center-v2{--eg:#65d46e;--eg2:#9df58f;--et:#f4fff6;--em:#a7b7ae;--el:rgba(115,231,153,.16);--ered:#ef4444;--eam:#f59e0b;background:radial-gradient(circle at 14% 0,rgba(101,212,110,.15),transparent 28%),#07100d}.emails-smart-page .em-wrap{gap:14px}.emails-smart-page .em-hero{padding:0;border:0;box-shadow:none;background:transparent}.em-v2-breadcrumb{display:flex;gap:8px;color:var(--em);font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.05em}.em-v2-breadcrumb b{color:var(--eg)}.em-v2-head-row{display:grid;grid-template-columns:1fr minmax(260px,430px);gap:16px;align-items:end}.emails-smart-page .em-hero h2{display:flex;gap:10px;align-items:center;margin:0;color:var(--et);font-size:clamp(28px,3vw,42px)}.emails-smart-page .em-hero p{margin:4px 0 0;color:var(--em);max-width:780px}.em-v2-title-icon{width:28px;height:28px;color:var(--eg);filter:drop-shadow(0 0 14px rgba(101,212,110,.35))}.emails-smart-page svg{width:100%;height:100%;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}.em-v2-status{border:1px solid var(--el);border-radius:14px;padding:12px;color:var(--em);background:rgba(9,18,17,.55);font-size:12px;text-align:center}
    .em-v2-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}.em-v2-kpi{display:flex;align-items:center;gap:14px;min-height:82px;padding:16px;border:1px solid var(--el);border-radius:20px;background:linear-gradient(145deg,rgba(16,31,29,.94),rgba(9,18,17,.88));box-shadow:0 18px 44px rgba(0,0,0,.22)}.em-v2-kpi-icon{width:44px;height:44px;border-radius:15px;display:grid;place-items:center;color:var(--eg);background:rgba(101,212,110,.14);border:1px solid rgba(101,212,110,.25)}.em-v2-kpi[data-accent=amber] .em-v2-kpi-icon{color:var(--eam);background:rgba(245,158,11,.14);border-color:rgba(245,158,11,.28)}.em-v2-kpi[data-accent=red] .em-v2-kpi-icon{color:var(--ered);background:rgba(239,68,68,.14);border-color:rgba(239,68,68,.28)}.em-v2-kpi-label{color:var(--em);font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.05em}.em-v2-kpi-value{color:var(--et);font:900 30px/1 'Syne',system-ui,sans-serif;margin-top:4px}.em-v2-kpi-hint{color:rgba(167,183,174,.75);font-size:11px;margin-top:4px}
    .emails-smart-page .em-tabs{width:fit-content;max-width:100%;border:1px solid var(--el);border-radius:18px;background:rgba(9,18,17,.55);padding:6px;gap:6px}.emails-smart-page .em-tab{border-color:transparent;background:transparent;color:var(--em);border-radius:13px;padding:10px 14px}.emails-smart-page .em-tab.active{background:rgba(101,212,110,.16);border-color:rgba(101,212,110,.28);color:var(--eg2)}.emails-smart-page #emTabHint,.emails-smart-page .em-guia,.emails-smart-page .em-guia-toggle{display:none!important}.emails-smart-page #emPanelEntrada{display:grid;gap:12px}.emails-smart-page .em-card{border-color:var(--el);background:linear-gradient(145deg,rgba(14,27,25,.92),rgba(8,18,17,.86));box-shadow:0 20px 52px rgba(0,0,0,.24);border-radius:20px}.emails-smart-page .em-v2-filter-card{padding:14px}.emails-smart-page .em-filter{grid-template-columns:180px 180px minmax(220px,1fr) auto;gap:10px}.emails-smart-page .em-field label{color:var(--em);font-size:10px}.emails-smart-page .em-field input,.emails-smart-page .em-field select,.emails-smart-page .em-field textarea{background:rgba(5,12,11,.58);border-color:var(--el);color:var(--et);border-radius:13px}
    .emails-smart-page .em-grid{grid-template-columns:minmax(320px,390px) minmax(0,1fr);gap:14px}.em-v2-step-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:-2px 0 14px;color:var(--et);font-weight:900;font-size:15px}.em-v2-step-title{display:inline-flex;align-items:center;gap:8px}.em-v2-step-index{width:24px;height:24px;border-radius:999px;display:inline-grid;place-items:center;color:var(--eg2);background:rgba(101,212,110,.13);border:1px solid rgba(101,212,110,.36);font-size:12px;font-weight:900}.em-v2-mini-note{color:var(--em);font-size:11px}.emails-smart-page .em-list{max-height:min(74vh,760px);padding-right:4px}.emails-smart-page .em-row{border-color:rgba(255,255,255,.07);background:rgba(10,21,19,.72);border-radius:16px}.emails-smart-page .em-row:hover,.emails-smart-page .em-row.active{border-color:rgba(101,212,110,.78);background:linear-gradient(135deg,rgba(101,212,110,.16),rgba(20,38,32,.82));box-shadow:0 14px 34px rgba(0,0,0,.24)}.emails-smart-page .em-row.active:before{background:var(--eg)}.emails-smart-page .em-avatar{background:rgba(101,212,110,.24)!important;color:var(--eg2)}.emails-smart-page .em-subject{color:var(--et);font-size:15px}.emails-smart-page .em-meta,.emails-smart-page .em-snippet{color:var(--em)}.emails-smart-page .em-badge,.emails-smart-page .em-prio{border-radius:999px;padding:5px 9px;font-size:10px;background:rgba(255,255,255,.04)}
    .emails-smart-page .em-detail{display:block}.em-v2-detail-shell{display:grid;grid-template-columns:minmax(0,1.08fr) minmax(310px,.82fr);gap:14px}.em-v2-read-col,.em-v2-action-col{display:grid;gap:12px;min-width:0}.em-v2-read-col>.em-v2-step-head,.em-v2-action-col>.em-v2-step-head{margin-bottom:0}.emails-smart-page .em-envelope,.emails-smart-page .em-summary,.emails-smart-page .em-extracted,.emails-smart-page .em-letter,.emails-smart-page .em-reply{border-color:rgba(255,255,255,.08);background:rgba(5,12,11,.42);border-radius:16px}.emails-smart-page .em-envelope{padding:16px;border:1px solid rgba(255,255,255,.08)}.emails-smart-page .em-envelope-main h3{font-size:20px;margin-bottom:8px}.emails-smart-page .em-insights{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.emails-smart-page .em-chip{border-color:rgba(255,255,255,.07);background:rgba(255,255,255,.035);border-radius:14px;text-transform:none;letter-spacing:0;justify-content:space-between}.emails-smart-page .em-summary-label,.emails-smart-page .em-section-label{color:var(--eg2)}.emails-smart-page .em-letter pre{max-height:260px;font-size:13px;line-height:1.7}.emails-smart-page .em-reply textarea{min-height:150px}.emails-smart-page .em-actions{display:flex;gap:10px;flex-wrap:wrap}.emails-smart-page .btn.btn-primary,.emails-smart-page .em-v2-primary-action{background:linear-gradient(135deg,#3fa64a,#65d46e)!important;border-color:rgba(101,212,110,.68)!important;color:#041007!important;font-weight:900;box-shadow:0 12px 28px rgba(76,175,80,.2)}.emails-smart-page .btn.btn-secondary{background:rgba(255,255,255,.035);border-color:rgba(255,255,255,.11);color:var(--et)}.emails-smart-page .em-v2-action-col .btn{width:100%;justify-content:center;min-height:44px;border-radius:14px}.emails-smart-page .em-empty{border-color:rgba(101,212,110,.2);color:var(--em)}
    .emails-smart-page .em-to{margin-top:10px}.emails-smart-page .em-v2-recipients{border:1px solid rgba(101,212,110,.16);background:rgba(101,212,110,.06);border-radius:13px;padding:9px 11px;color:var(--em);font-size:12px}.emails-smart-page .em-v2-recipients summary{cursor:pointer;color:var(--eg2);font-weight:800;list-style:none}.emails-smart-page .em-v2-recipients summary::-webkit-details-marker{display:none}.emails-smart-page .em-v2-recipients summary:after{content:' · ver detalhes';color:var(--em);font-weight:600}.emails-smart-page .em-v2-recipients[open] summary:after{content:' · ocultar'}.emails-smart-page .em-v2-recipients pre{margin:10px 0 0;max-height:180px;overflow:auto;white-space:pre-wrap;word-break:break-word;color:var(--em);font:12px/1.55 'DM Sans',system-ui,sans-serif}
    @media(max-width:1280px){.emails-smart-page .em-grid,.em-v2-detail-shell{grid-template-columns:1fr}.emails-smart-page .em-list{max-height:unset}}@media(max-width:880px){.em-v2-head-row,.em-v2-kpis,.emails-smart-page .em-filter,.emails-smart-page .em-insights{grid-template-columns:1fr}.emails-smart-page .em-tabs{width:100%}.emails-smart-page .em-tab{flex:1 1 auto}}
  `;
  document.head.appendChild(s);
}

function ensureHero(wrap) {
  const hero = wrap.querySelector('.em-hero');
  if (!hero || hero.dataset.emailV2 === '1') return;
  hero.dataset.emailV2 = '1';
  hero.innerHTML = `<div class="em-v2-breadcrumb"><b>TI</b><span>/</span><span>Comunicação</span><span>/</span><span>Central de E-mails</span></div><div class="em-v2-head-row"><div><h2>Central de E-mails Inteligente <span class="em-v2-title-icon">${icon.ai}</span></h2><p>Receba, interprete e direcione e-mails com apoio da IA sem perder o controle humano das aprovações.</p></div><div class="em-v2-status" id="emV2TopStatus">Histórico: última atualização agora</div></div>`;
  const data = [['novos','Novos','Entrada sem tratamento',icon.mail,'green'],['pendentes','Pendentes','Aguardando ação',icon.clock,'amber'],['urgentes','Urgentes','Prioridade alta/urgente',icon.alert,'red'],['respondidos','Respondidos','Tratados pelo fluxo',icon.check,'green']];
  hero.insertAdjacentHTML('afterend', `<div class="em-v2-kpis">${data.map(([k,l,h,i,a]) => `<div class="em-v2-kpi" data-accent="${a}"><div class="em-v2-kpi-icon">${i}</div><div><div class="em-v2-kpi-label">${l}</div><div class="em-v2-kpi-value" data-kpi-value="${k}">—</div><div class="em-v2-kpi-hint">${h}</div></div></div>`).join('')}</div>`);
}

function ensureHeaders() {
  const entrada = document.getElementById('emPanelEntrada');
  if (!entrada) return;
  entrada.querySelector(':scope > article.em-card')?.classList.add('em-v2-filter-card');
  const listCard = entrada.querySelector('.em-grid > article.em-card:first-child');
  if (listCard && !listCard.querySelector('.em-v2-step-head')) listCard.insertAdjacentHTML('afterbegin', '<div class="em-v2-step-head"><span class="em-v2-step-title"><span class="em-v2-step-index">1</span>Caixa de Entrada</span><span class="em-v2-mini-note">Fila de triagem</span></div>');
  entrada.querySelector('.em-grid > article.em-card:nth-child(2)')?.classList.add('em-v2-detail-card');
}

function countBy(apply) {
  const q = supabase.from('email_messages').select('id', { count: 'exact', head: true });
  return apply(q).then(({ count }) => count ?? 0).catch(() => null);
}

async function refreshKpis() {
  const values = await Promise.all([
    countBy((q) => q.in('status', ['NOVO'])),
    countBy((q) => q.in('status', ['PENDENTE', 'RESPONDER'])),
    countBy((q) => q.in('prioridade', ['ALTA', 'URGENTE'])),
    countBy((q) => q.in('status', ['RESPONDIDO', 'RESOLVIDO']))
  ]);
  ['novos','pendentes','urgentes','respondidos'].forEach((key, i) => {
    const el = document.querySelector(`[data-kpi-value="${key}"]`);
    if (el && values[i] !== null) el.textContent = String(values[i]);
  });
  const status = document.getElementById('emV2TopStatus');
  if (status) status.textContent = `Histórico: última atualização ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
}

function compactRecipients(root) {
  const to = root.querySelector('.em-to');
  if (!to || to.dataset.emailV2Compact === '1') return;
  const raw = (to.textContent || '').replace(/\s+/g, ' ').trim();
  if (!raw) return;
  const count = (raw.match(/@/g) || []).length;
  const summary = count > 1 ? `Destinatários e cópias ocultos (${count} contatos)` : 'Destinatário oculto';
  to.textContent = '';
  const details = document.createElement('details');
  details.className = 'em-v2-recipients';
  const summaryEl = document.createElement('summary');
  summaryEl.textContent = summary;
  const pre = document.createElement('pre');
  pre.textContent = raw;
  details.append(summaryEl, pre);
  to.appendChild(details);
  to.dataset.emailV2Compact = '1';
}

function enhanceDetail() {
  const inner = document.getElementById('emDetail')?.querySelector('.em-detail');
  if (!inner || inner.dataset.emailV2 === '1') return;
  inner.dataset.emailV2 = '1';
  const shell = document.createElement('div'); shell.className = 'em-v2-detail-shell';
  const read = document.createElement('div'); read.className = 'em-v2-read-col'; read.innerHTML = '<div class="em-v2-step-head"><span class="em-v2-step-title"><span class="em-v2-step-index">2</span>Leitura e interpretação pela IA</span></div>';
  const action = document.createElement('div'); action.className = 'em-v2-action-col'; action.innerHTML = '<div class="em-v2-step-head"><span class="em-v2-step-title"><span class="em-v2-step-index">3</span>Ação sugerida</span></div>';
  compactRecipients(inner);
  Array.from(inner.children).forEach((node) => {
    const isAction = node.classList?.contains('em-reply') || (node.classList?.contains('em-summary') && /Encaminhamento sugerido/i.test(node.textContent || ''));
    (isAction ? action : read).appendChild(node);
  });
  shell.append(read, action); inner.appendChild(shell);
  const forward = action.querySelector('#emAprovarEncaminhamento');
  if (forward) { forward.textContent = 'Aprovar e redirecionar'; forward.classList.add('em-v2-primary-action'); }
  const replySubmit = action.querySelector('#emReplyForm button[type="submit"]');
  if (replySubmit) replySubmit.textContent = 'Aprovar resposta';
  const replyLabel = action.querySelector('.em-reply .em-section-label');
  if (replyLabel) replyLabel.textContent = 'Resposta sugerida pela IA';
  const helper = action.querySelector('.em-reply .em-muted.em-small');
  if (helper) helper.textContent = 'Revise o texto, aprove a resposta ou use as ações secundárias para resolver, arquivar ou manter pendente.';
}

function enhance() {
  const content = document.getElementById('pageContent');
  const wrap = content?.querySelector('.em-wrap');
  if (!wrap) return;
  document.body.classList.add('email-center-v2');
  content.classList.add('emails-smart-page');
  const title = document.getElementById('pageTitle');
  if (title) title.textContent = 'Central de E-mails Inteligente';
  ensureHero(wrap); ensureHeaders(); enhanceDetail();
}

function boot() {
  addStyle(); enhance(); refreshKpis();
  new MutationObserver(enhance).observe(document.getElementById('pageContent') || document.body, { childList: true, subtree: true });
  document.addEventListener('submit', (e) => { if (['emFilter', 'emReplyForm'].includes(e.target?.id)) setTimeout(refreshKpis, 900); });
  document.addEventListener('click', (e) => { if (e.target.closest('[data-action], #emAprovarEncaminhamento')) setTimeout(refreshKpis, 900); });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
else boot();
