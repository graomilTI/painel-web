import { supabase } from './supabaseClient.js';

const icons = {
  mail: '<svg viewBox="0 0 24 24"><path d="M4 6h16v12H4z"/><path d="m4 7 8 6 8-6"/></svg>',
  clock: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><path d="M12 7v6l4 2"/></svg>',
  alert: '<svg viewBox="0 0 24 24"><path d="M12 3 3 20h18L12 3Z"/><path d="M12 9v5M12 17h.01"/></svg>',
  check: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><path d="m8.5 12.5 2.3 2.3 4.9-5"/></svg>',
  sparkle: '<svg viewBox="0 0 24 24"><path d="m12 2 1.8 5.2L19 9l-5.2 1.8L12 16l-1.8-5.2L5 9l5.2-1.8L12 2Z"/><path d="m19 14 .9 2.6 2.6.9-2.6.9L19 21l-.9-2.6-2.6-.9 2.6-.9L19 14Z"/></svg>'
};

const kpis = [
  ['novos', 'Novos', 'Entrada sem tratamento', icons.mail, 'green'],
  ['pendentes', 'Pendentes', 'Aguardando ação', icons.clock, 'amber'],
  ['urgentes', 'Urgentes', 'Prioridade alta/urgente', icons.alert, 'red'],
  ['respondidos', 'Respondidos', 'Tratados pelo fluxo', icons.check, 'green']
];

function injectStyle() {
  if (document.getElementById('emails-layout-v2-style')) return;
  const style = document.createElement('style');
  style.id = 'emails-layout-v2-style';
  style.textContent = `
    body.email-center-v2{--e-bg:#07100d;--e-card:rgba(12,24,21,.88);--e-card2:rgba(17,32,29,.82);--e-line:rgba(115,231,153,.16);--e-line2:rgba(115,231,153,.35);--e-green:#65d46e;--e-green2:#9df58f;--e-text:#f4fff6;--e-muted:#a7b7ae;--e-amber:#f59e0b;--e-red:#ef4444;background:radial-gradient(circle at 16% 3%,rgba(101,212,110,.15),transparent 26%),radial-gradient(circle at 86% 16%,rgba(101,212,110,.08),transparent 24%),var(--e-bg)}
    .emails-smart-page .em-wrap.em-v2-wrap{gap:14px}.emails-smart-page .em-hero{padding:0;border:0;box-shadow:none;background:transparent;display:grid;gap:8px}.em-v2-breadcrumb{display:flex;align-items:center;gap:8px;color:var(--e-muted);font-size:12px;font-weight:800;letter-spacing:.05em;text-transform:uppercase}.em-v2-breadcrumb b{color:var(--e-green)}
    .emails-smart-page .em-hero h2{display:flex;align-items:center;gap:10px;font-size:clamp(28px,3vw,42px);color:var(--e-text);margin:0}.emails-smart-page .em-hero p{color:var(--e-muted);max-width:780px;font-size:15px;margin:0}.em-v2-title-icon{width:28px;height:28px;color:var(--e-green);filter:drop-shadow(0 0 16px rgba(101,212,110,.36))}.emails-smart-page svg,.em-v2-kpi svg{width:100%;height:100%;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
    .em-v2-head-row{display:grid;grid-template-columns:minmax(0,1fr) minmax(280px,460px);gap:16px;align-items:end}.em-v2-footer-status{display:flex;align-items:center;justify-content:center;gap:8px;color:var(--e-muted);font-size:12px;border:1px solid var(--e-line);border-radius:14px;padding:12px;background:rgba(9,18,17,.55)}
    .em-v2-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin:6px 0 0}.em-v2-kpi{min-height:86px;border:1px solid var(--e-line);border-radius:20px;background:linear-gradient(145deg,rgba(16,31,29,.94),rgba(9,18,17,.88));box-shadow:0 18px 44px rgba(0,0,0,.22);display:flex;align-items:center;gap:14px;padding:16px 18px;overflow:hidden;position:relative}.em-v2-kpi:after{content:'';position:absolute;inset:auto 12px 0 12px;height:1px;background:linear-gradient(90deg,transparent,rgba(101,212,110,.5),transparent);opacity:.35}.em-v2-kpi-icon{width:46px;height:46px;border-radius:16px;display:grid;place-items:center;color:var(--e-green);background:rgba(101,212,110,.14);border:1px solid rgba(101,212,110,.25);flex:none}.em-v2-kpi[data-accent=amber] .em-v2-kpi-icon{color:var(--e-amber);background:rgba(245,158,11,.14);border-color:rgba(245,158,11,.28)}.em-v2-kpi[data-accent=red] .em-v2-kpi-icon{color:var(--e-red);background:rgba(239,68,68,.14);border-color:rgba(239,68,68,.28)}.em-v2-kpi-label{color:var(--e-muted);font-size:12px;font-weight:800;letter-spacing:.05em;text-transform:uppercase}.em-v2-kpi-value{color:var(--e-text);font-size:30px;line-height:1;font-weight:900;font-family:'Syne',system-ui,sans-serif;margin-top:4px}.em-v2-kpi-hint{color:rgba(167,183,174,.74);font-size:11px;margin-top:4px}
    .emails-smart-page .em-tabs{border:1px solid var(--e-line);border-radius:18px;background:rgba(9,18,17,.55);padding:6px;gap:6px;width:fit-content;max-width:100%}.emails-smart-page .em-tab{border-radius:13px;border-color:transparent;background:transparent;color:var(--e-muted);padding:10px 14px}.emails-smart-page .em-tab.active{background:rgba(101,212,110,.16);border-color:rgba(101,212,110,.28);color:var(--e-green2);box-shadow:inset 0 0 0 1px rgba(101,212,110,.08)}.emails-smart-page #emTabHint,.emails-smart-page .em-guia,.emails-smart-page .em-guia-toggle{display:none!important}
    .emails-smart-page #emPanelEntrada{display:grid;gap:12px}.emails-smart-page .em-card{border-color:var(--e-line);background:linear-gradient(145deg,rgba(14,27,25,.92),rgba(8,18,17,.86));box-shadow:0 20px 52px rgba(0,0,0,.24);border-radius:20px}.emails-smart-page .em-v2-filter-card{padding:14px;border-radius:18px}.emails-smart-page .em-filter{grid-template-columns:180px 180px minmax(220px,1fr) auto;gap:10px;align-items:end}.emails-smart-page .em-field label{color:var(--e-muted);font-size:10px}.emails-smart-page .em-field input,.emails-smart-page .em-field select,.emails-smart-page .em-field textarea{background:rgba(5,12,11,.58);border-color:var(--e-line);color:var(--e-text);border-radius:13px}
    .emails-smart-page .em-grid{grid-template-columns:minmax(320px,390px) minmax(0,1fr);gap:14px}.em-v2-step-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:-2px 0 14px;color:var(--e-text);font-weight:900;font-size:15px}.em-v2-step-title{display:inline-flex;align-items:center;gap:8px}.em-v2-step-index{width:24px;height:24px;border-radius:999px;display:inline-grid;place-items:center;color:var(--e-green2);background:rgba(101,212,110,.13);border:1px solid rgba(101,212,110,.36);font-size:12px;font-weight:900;flex:none}.em-v2-mini-note{color:var(--e-muted);font-size:11px;font-weight:700}
    .emails-smart-page .em-list{max-height:min(74vh,760px);padding-right:4px}.emails-smart-page .em-row{border-color:rgba(255,255,255,.07);background:rgba(10,21,19,.72);border-radius:16px;padding:14px}.emails-smart-page .em-row:hover,.emails-smart-page .em-row.active{border-color:rgba(101,212,110,.78);background:linear-gradient(135deg,rgba(101,212,110,.16),rgba(20,38,32,.82));box-shadow:0 0 0 1px rgba(101,212,110,.1),0 14px 34px rgba(0,0,0,.24)}.emails-smart-page .em-row.active:before{background:var(--e-green)}.emails-smart-page .em-avatar{background:rgba(101,212,110,.24)!important;color:var(--e-green2)}.emails-smart-page .em-subject{font-size:15px;color:var(--e-text)}.emails-smart-page .em-meta,.emails-smart-page .em-snippet{color:var(--e-muted)}.emails-smart-page .em-badge,.emails-smart-page .em-prio{border-radius:999px;padding:5px 9px;font-size:10px;letter-spacing:.04em;background:rgba(255,255,255,.04)}
    .emails-smart-page .em-detail{display:block}.em-v2-detail-shell{display:grid;grid-template-columns:minmax(0,1.08fr) minmax(310px,.82fr);gap:14px;align-items:start}.em-v2-read-col,.em-v2-action-col{display:grid;gap:12px;min-width:0}.em-v2-read-col>.em-v2-step-head,.em-v2-action-col>.em-v2-step-head{margin-bottom:0}.emails-smart-page .em-envelope,.emails-smart-page .em-summary,.emails-smart-page .em-extracted,.emails-smart-page .em-letter,.emails-smart-page .em-reply{border-color:rgba(255,255,255,.08);background:rgba(5,12,11,.42);border-radius:16px}.emails-smart-page .em-envelope{padding:16px;border:1px solid rgba(255,255,255,.08);align-items:flex-start}.emails-smart-page .em-envelope-main h3{font-size:20px;margin-bottom:8px;padding-bottom:8px}.emails-smart-page .em-insights{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.emails-smart-page .em-chip{border-color:rgba(255,255,255,.07);background:rgba(255,255,255,.035);border-radius:14px;text-transform:none;letter-spacing:0;justify-content:space-between}.emails-smart-page .em-summary-label,.emails-smart-page .em-section-label{color:var(--e-green2)}.emails-smart-page .em-letter pre{max-height:260px;font-size:13px;line-height:1.7}.emails-smart-page .em-reply textarea{min-height:150px}
    .emails-smart-page .em-actions{display:flex;gap:10px;align-items:center;flex-wrap:wrap}.emails-smart-page .btn.btn-primary,.emails-smart-page .em-v2-primary-action{background:linear-gradient(135deg,#3fa64a,#65d46e)!important;border-color:rgba(101,212,110,.68)!important;color:#041007!important;font-weight:900;box-shadow:0 12px 28px rgba(76,175,80,.2)}.emails-smart-page .btn.btn-secondary{background:rgba(255,255,255,.035);border-color:rgba(255,255,255,.11);color:var(--e-text)}.emails-smart-page .em-v2-action-col .btn{width:100%;justify-content:center;min-height:44px;border-radius:14px}.emails-smart-page .em-empty{border-color:rgba(101,212,110,.2);color:var(--e-muted)}
    @media(max-width:1280px){.emails-smart-page .em-grid,.em-v2-detail-shell{grid-template-columns:1fr}.emails-smart-page .em-list{max-height:unset}}@media(max-width:880px){.em-v2-head-row,.em-v2-kpis,.emails-smart-page .em-filter,.emails-smart-page .em-insights{grid-template-columns:1fr}.emails-smart-page .em-tabs{width:100%}.emails-smart-page .em-tab{flex:1 1 auto}}
  `;
  document.head.appendChild(style);
}

function ensureHero(wrap) {
  const hero = wrap.querySelector('.em-hero');
  if (!hero || hero.dataset.emailV2 === '1') return;
  hero.dataset.emailV2 = '1';
  hero.innerHTML = `
    <div class="em-v2-breadcrumb"><b>TI</b><span>/</span><span>Comunicação</span><span>/</span><span>Central de E-mails</span></div>
    <div class="em-v2-head-row">
      <div>
        <h2>Central de E-mails Inteligente <span class="em-v2-title-icon">${icons.sparkle}</span></h2>
        <p>Receba, interprete e direcione e-mails com apoio da IA sem perder o controle humano das aprovações.</p>
      </div>
      <div class="em-v2-footer-status" id="emV2TopStatus">Histórico: última atualização agora</div>
    </div>`;
  hero.insertAdjacentHTML('afterend', `<div class="em-v2-kpis" id="emV2Kpis">${kpis.map(([key,label,hint,icon,accent]) => `<div class="em-v2-kpi" data-accent="${accent}"><div class="em-v2-kpi-icon">${icon}</div><div><div class="em-v2-kpi-label">${label}</div><div class="em-v2-kpi-value" data-kpi-value="${key}">—</div><div class="em-v2-kpi-hint">${hint}</div></div></div>`).join('')}</div>`);
}

function ensurePanelHeaders() {
  const entrada = document.getElementById('emPanelEntrada');
  if (!entrada) return;
  entrada.querySelector(':scope > article.em-card')?.classList.add('em-v2-filter-card');
  const listCard = entrada.querySelector('.em-grid > article.em-card:first-child');
  if (listCard && !listCard.querySelector('.em-v2-step-head')) {
    listCard.insertAdjacentHTML('afterbegin', '<div class="em-v2-step-head"><span class="em-v2-step-title"><span class="em-v2-step-index">1</span>Caixa de Entrada</span><span class="em-v2-mini-note">Fila de triagem</span></div>');
  }
  entrada.querySelector('.em-grid > article.em-card:nth-child(2)')?.classList.add('em-v2-detail-card');
}

function countQuery(builder) {
  return builder.select('id', { count: 'exact', head: true }).then(({ count }) => count ?? 0).catch(() => null);
}

async function refreshKpis() {
  const values = await Promise.all([
    countQuery(supabase.from('email_messages').in('status', ['NOVO'])),
    countQuery(supabase.from('email_messages').in('status', ['PENDENTE', 'RESPONDER'])),
    countQuery(supabase.from('email_messages').in('prioridade', ['ALTA', 'URGENTE'])),
    countQuery(supabase.from('email_messages').in('status', ['RESPONDIDO', 'RESOLVIDO']))
  ]);
  ['novos', 'pendentes', 'urgentes', 'respondidos'].forEach((key, index) => {
    const el = document.querySelector(`[data-kpi-value="${key}"]`);
    if (el && values[index] !== null) el.textContent = String(values[index]);
  });
  const status = document.getElementById('emV2TopStatus');
  if (status) status.textContent = `Histórico: última atualização ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
}

function isForwardingSummary(node) {
  return node?.classList?.contains('em-summary') && /Encaminhamento sugerido/i.test(node.textContent || '');
}

function enhanceDetail() {
  const inner = document.getElementById('emDetail')?.querySelector('.em-detail');
  if (!inner || inner.dataset.emailV2 === '1') return;
  inner.dataset.emailV2 = '1';
  const shell = document.createElement('div');
  shell.className = 'em-v2-detail-shell';
  const readCol = document.createElement('div');
  readCol.className = 'em-v2-read-col';
  readCol.innerHTML = '<div class="em-v2-step-head"><span class="em-v2-step-title"><span class="em-v2-step-index">2</span>Leitura e interpretação pela IA</span></div>';
  const actionCol = document.createElement('div');
  actionCol.className = 'em-v2-action-col';
  actionCol.innerHTML = '<div class="em-v2-step-head"><span class="em-v2-step-title"><span class="em-v2-step-index">3</span>Ação sugerida</span></div>';
  Array.from(inner.children).forEach((node) => {
    if (node.classList?.contains('em-reply') || isForwardingSummary(node)) actionCol.appendChild(node);
    else readCol.appendChild(node);
  });
  shell.append(readCol, actionCol);
  inner.appendChild(shell);
  const forwardBtn = actionCol.querySelector('#emAprovarEncaminhamento');
  if (forwardBtn) {
    forwardBtn.textContent = 'Aprovar e redirecionar';
    forwardBtn.classList.add('em-v2-primary-action');
  }
  const replySubmit = actionCol.querySelector('#emReplyForm button[type="submit"]');
  if (replySubmit) replySubmit.textContent = 'Aprovar resposta';
  const replyLabel = actionCol.querySelector('.em-reply .em-section-label');
  if (replyLabel) replyLabel.textContent = 'Resposta sugerida pela IA';
  const helper = actionCol.querySelector('.em-reply .em-muted.em-small');
  if (helper) helper.textContent = 'Revise o texto, aprove a resposta ou use as ações secundárias para resolver, arquivar ou manter pendente.';
}

function enhanceLayout() {
  const content = document.getElementById('pageContent');
  const wrap = content?.querySelector('.em-wrap');
  if (!wrap) return;
  document.body.classList.add('email-center-v2');
  content.classList.add('emails-smart-page');
  wrap.classList.add('em-v2-wrap');
  const title = document.getElementById('pageTitle');
  if (title) title.textContent = 'Central de E-mails Inteligente';
  ensureHero(wrap);
  ensurePanelHeaders();
  enhanceDetail();
}

function boot() {
  injectStyle();
  enhanceLayout();
  refreshKpis();
  const observer = new MutationObserver(() => enhanceLayout());
  observer.observe(document.getElementById('pageContent') || document.body, { childList: true, subtree: true });
  document.addEventListener('submit', (event) => {
    if (event.target?.id === 'emFilter' || event.target?.id === 'emReplyForm') setTimeout(refreshKpis, 900);
  });
  document.addEventListener('click', (event) => {
    if (event.target.closest('[data-action], #emAprovarEncaminhamento')) setTimeout(refreshKpis, 900);
  });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
else boot();
