// Central de E-mails — Layout v3
// Evolução do overlay v2: mantém toda a lógica de emails.js intacta e melhora a
// camada visual e de produtividade por cima do DOM já renderizado.
//
// Novidades do v3 em relação ao v2:
//   1. Filtros extras de Regional, Categoria e Prioridade (aplicados direto na
//      lista, sem precisar mexer em emails.js).
//   2. KPIs clicáveis — clicar em "Urgentes" já filtra a lista.
//   3. KPI de "Sem regional" pra equipe enxergar o que a triagem não conseguiu
//      identificar e cadastrar novas palavras-chave.
//   4. Barra de saúde da sincronização (última sync da conta + erros) no topo.
//   5. Auto-atualização da lista e dos KPIs a cada 2 minutos.
import { supabase } from './supabaseClient.js';

const icon = {
  mail: '<svg viewBox="0 0 24 24"><path d="M4 6h16v12H4z"/><path d="m4 7 8 6 8-6"/></svg>',
  clock: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><path d="M12 7v6l4 2"/></svg>',
  alert: '<svg viewBox="0 0 24 24"><path d="M12 3 3 20h18L12 3Z"/><path d="M12 9v5M12 17h.01"/></svg>',
  check: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><path d="m8.5 12.5 2.3 2.3 4.9-5"/></svg>',
  pin: '<svg viewBox="0 0 24 24"><path d="M12 21s7-5.1 7-11a7 7 0 1 0-14 0c0 5.9 7 11 7 11Z"/><circle cx="12" cy="10" r="2.5"/></svg>',
  ai: '<svg viewBox="0 0 24 24"><path d="m12 2 1.8 5.2L19 9l-5.2 1.8L12 16l-1.8-5.2L5 9l5.2-1.8L12 2Z"/><path d="m19 14 .9 2.6 2.6.9-2.6.9L19 21l-.9-2.6-2.6-.9 2.6-.9L19 14Z"/></svg>'
};

function addStyle() {
  if (document.getElementById('emails-layout-v3-style')) return;
  const s = document.createElement('style');
  s.id = 'emails-layout-v3-style';
  s.textContent = `
    body.email-center-v2{--eg:#65d46e;--eg2:#9df58f;--et:#f4fff6;--em:#a7b7ae;--el:rgba(115,231,153,.16);--ered:#ef4444;--eam:#f59e0b;background:radial-gradient(circle at 14% 0,rgba(101,212,110,.15),transparent 28%),#07100d}.emails-smart-page .em-wrap{gap:14px}.emails-smart-page .em-hero{padding:0;border:0;box-shadow:none;background:transparent}.em-v2-breadcrumb{display:flex;gap:8px;color:var(--em);font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.05em}.em-v2-breadcrumb b{color:var(--eg)}.em-v2-head-row{display:grid;grid-template-columns:1fr minmax(260px,430px);gap:16px;align-items:end}.emails-smart-page .em-hero h2{display:flex;gap:10px;align-items:center;margin:0;color:var(--et);font-size:clamp(28px,3vw,42px)}.emails-smart-page .em-hero p{margin:4px 0 0;color:var(--em);max-width:780px}.em-v2-title-icon{width:28px;height:28px;color:var(--eg);filter:drop-shadow(0 0 14px rgba(101,212,110,.35))}.emails-smart-page svg{width:100%;height:100%;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}.em-v2-status{border:1px solid var(--el);border-radius:14px;padding:12px;color:var(--em);background:rgba(9,18,17,.55);font-size:12px;text-align:center}
    .em-v2-kpis{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:12px}.em-v2-kpi{display:flex;align-items:center;gap:14px;min-height:82px;padding:16px;border:1px solid var(--el);border-radius:20px;background:linear-gradient(145deg,rgba(16,31,29,.94),rgba(9,18,17,.88));box-shadow:0 18px 44px rgba(0,0,0,.22);cursor:pointer;transition:all 160ms}.em-v2-kpi:hover{border-color:rgba(101,212,110,.5);transform:translateY(-2px)}.em-v2-kpi-icon{width:44px;height:44px;border-radius:15px;display:grid;place-items:center;color:var(--eg);background:rgba(101,212,110,.14);border:1px solid rgba(101,212,110,.25);flex:none}.em-v2-kpi[data-accent=amber] .em-v2-kpi-icon{color:var(--eam);background:rgba(245,158,11,.14);border-color:rgba(245,158,11,.28)}.em-v2-kpi[data-accent=red] .em-v2-kpi-icon{color:var(--ered);background:rgba(239,68,68,.14);border-color:rgba(239,68,68,.28)}.em-v2-kpi[data-accent=gray] .em-v2-kpi-icon{color:var(--em);background:rgba(167,183,174,.12);border-color:rgba(167,183,174,.25)}.em-v2-kpi-label{color:var(--em);font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.05em}.em-v2-kpi-value{color:var(--et);font:900 30px/1 'Syne',system-ui,sans-serif;margin-top:4px}.em-v2-kpi-hint{color:rgba(167,183,174,.75);font-size:11px;margin-top:4px}
    .em-v3-health{display:flex;flex-wrap:wrap;align-items:center;gap:10px;border:1px solid var(--el);border-radius:16px;background:rgba(9,18,17,.55);padding:10px 14px;font-size:12px;color:var(--em)}.em-v3-health b{color:var(--eg2)}.em-v3-health .dot{width:9px;height:9px;border-radius:999px;background:var(--eg);box-shadow:0 0 10px rgba(101,212,110,.8);flex:none}.em-v3-health.err .dot{background:var(--ered);box-shadow:0 0 10px rgba(239,68,68,.8)}.em-v3-health.err b{color:#fca5a5}
    .emails-smart-page .em-tabs{width:fit-content;max-width:100%;border:1px solid var(--el);border-radius:18px;background:rgba(9,18,17,.55);padding:6px;gap:6px}.emails-smart-page .em-tab{border-color:transparent;background:transparent;color:var(--em);border-radius:13px;padding:10px 14px}.emails-smart-page .em-tab.active{background:rgba(101,212,110,.16);border-color:rgba(101,212,110,.28);color:var(--eg2)}.emails-smart-page #emTabHint,.emails-smart-page .em-guia,.emails-smart-page .em-guia-toggle{display:none!important}.emails-smart-page #emPanelEntrada{display:grid;gap:12px}.emails-smart-page .em-card{border-color:var(--el);background:linear-gradient(145deg,rgba(14,27,25,.92),rgba(8,18,17,.86));box-shadow:0 20px 52px rgba(0,0,0,.24);border-radius:20px}.emails-smart-page .em-v2-filter-card{padding:14px}.emails-smart-page .em-filter{display:grid;grid-template-columns:150px 150px minmax(180px,1fr) auto;gap:10px}.emails-smart-page .em-field label{color:var(--em);font-size:10px}.emails-smart-page .em-field input,.emails-smart-page .em-field select,.emails-smart-page .em-field textarea{background:rgba(5,12,11,.58);border-color:var(--el);color:var(--et);border-radius:13px}
    .em-v3-extra-filters{display:grid;grid-template-columns:repeat(3,minmax(150px,1fr)) auto;gap:10px;margin-top:10px}.em-v3-extra-filters select{border:1px solid var(--el);border-radius:13px;background:rgba(5,12,11,.58);color:var(--et);padding:11px 14px;font-size:13px;color-scheme:dark;font-family:inherit;cursor:pointer}.em-v3-extra-filters .em-v3-clear{border:1px solid rgba(255,255,255,.11);border-radius:13px;background:rgba(255,255,255,.035);color:var(--et);padding:11px 16px;font-size:12px;font-weight:700;cursor:pointer;white-space:nowrap}.em-v3-extra-filters .em-v3-clear:hover{border-color:var(--eg)}
    .emails-smart-page .em-grid{grid-template-columns:minmax(320px,390px) minmax(0,1fr);gap:14px}.emails-smart-page .em-grid-3{grid-template-columns:minmax(300px,360px) minmax(0,1.1fr) minmax(300px,.85fr);gap:14px}.em-v2-step-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:-2px 0 14px;color:var(--et);font-weight:900;font-size:15px}.em-v2-step-title{display:inline-flex;align-items:center;gap:8px}.em-v2-step-index{width:24px;height:24px;border-radius:999px;display:inline-grid;place-items:center;color:var(--eg2);background:rgba(101,212,110,.13);border:1px solid rgba(101,212,110,.36);font-size:12px;font-weight:900}.em-v2-mini-note{color:var(--em);font-size:11px}.emails-smart-page .em-step-head{display:none}.emails-smart-page .em-list{max-height:min(74vh,760px);padding-right:4px}.emails-smart-page .em-row{border-color:rgba(255,255,255,.07);background:rgba(10,21,19,.72);border-radius:16px}.emails-smart-page .em-row:hover,.emails-smart-page .em-row.active{border-color:rgba(101,212,110,.78);background:linear-gradient(135deg,rgba(101,212,110,.16),rgba(20,38,32,.82));box-shadow:0 14px 34px rgba(0,0,0,.24)}.emails-smart-page .em-row.active:before{background:var(--eg)}.emails-smart-page .em-avatar{background:rgba(101,212,110,.24)!important;color:var(--eg2)}.emails-smart-page .em-subject{color:var(--et);font-size:15px;white-space:normal;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}.emails-smart-page .em-meta,.emails-smart-page .em-snippet{color:var(--em)}.emails-smart-page .em-badge,.emails-smart-page .em-prio{border-radius:999px;padding:5px 9px;font-size:10px;background:rgba(255,255,255,.04)}
    .emails-smart-page .em-detail{display:block}.emails-smart-page .em-envelope,.emails-smart-page .em-summary,.emails-smart-page .em-extracted,.emails-smart-page .em-letter,.emails-smart-page .em-reply{border:1px solid rgba(255,255,255,.08);background:rgba(5,12,11,.42);border-radius:16px;margin-bottom:12px}.emails-smart-page .em-envelope{padding:16px}.emails-smart-page .em-envelope-main h3{font-size:20px;margin-bottom:8px}.emails-smart-page .em-insights{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.emails-smart-page .em-chip{border-color:rgba(255,255,255,.07);background:rgba(255,255,255,.035);border-radius:14px;text-transform:none;letter-spacing:0;justify-content:space-between}.emails-smart-page .em-summary-label,.emails-smart-page .em-section-label{color:var(--eg2)}.emails-smart-page .em-letter pre{max-height:280px;font-size:13px;line-height:1.7}.emails-smart-page .em-reply textarea{min-height:150px}.emails-smart-page .em-actions{display:flex;gap:10px;flex-wrap:wrap}.emails-smart-page .btn.btn-primary,.emails-smart-page .em-v2-primary-action{background:linear-gradient(135deg,#3fa64a,#65d46e)!important;border-color:rgba(101,212,110,.68)!important;color:#041007!important;font-weight:900;box-shadow:0 12px 28px rgba(76,175,80,.2)}.emails-smart-page .btn.btn-secondary{background:rgba(255,255,255,.035);border-color:rgba(255,255,255,.11);color:var(--et)}.emails-smart-page #emAction .btn{width:100%;justify-content:center;min-height:44px;border-radius:14px}.emails-smart-page .em-empty{border-color:rgba(101,212,110,.2);color:var(--em)}
    .emails-smart-page .em-to{margin-top:10px}.emails-smart-page .em-v2-recipients{border:1px solid rgba(101,212,110,.16);background:rgba(101,212,110,.06);border-radius:13px;padding:9px 11px;color:var(--em);font-size:12px}.emails-smart-page .em-v2-recipients summary{cursor:pointer;color:var(--eg2);font-weight:800;list-style:none}.emails-smart-page .em-v2-recipients summary::-webkit-details-marker{display:none}.emails-smart-page .em-v2-recipients summary:after{content:' · ver detalhes';color:var(--em);font-weight:600}.emails-smart-page .em-v2-recipients[open] summary:after{content:' · ocultar'}.emails-smart-page .em-v2-recipients pre{margin:10px 0 0;max-height:180px;overflow:auto;white-space:pre-wrap;word-break:break-word;color:var(--em);font:12px/1.55 'DM Sans',system-ui,sans-serif}
    @media(max-width:1280px){.emails-smart-page .em-grid,.emails-smart-page .em-grid-3{grid-template-columns:1fr}.emails-smart-page .em-list{max-height:unset}.em-v2-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:880px){.em-v2-head-row,.em-v2-kpis,.emails-smart-page .em-filter,.em-v3-extra-filters,.emails-smart-page .em-insights{grid-template-columns:1fr}.emails-smart-page .em-tabs{width:100%}.emails-smart-page .em-tab{flex:1 1 auto}}
  `;
  document.head.appendChild(s);
}

function ensureHero(wrap) {
  const hero = wrap.querySelector('.em-hero');
  if (!hero || hero.dataset.emailV2 === '1') return;
  hero.dataset.emailV2 = '1';
  hero.innerHTML = `<div class="em-v2-breadcrumb"><b>TI</b><span>/</span><span>Comunicação</span><span>/</span><span>Central de E-mails</span></div><div class="em-v2-head-row"><div><h2>Central de E-mails Inteligente <span class="em-v2-title-icon">${icon.ai}</span></h2><p>Cada e-mail que chega em comercial@ é lido, classificado por assunto, urgência e regional, e direcionado ao gestor certo — em vez de ir pra todo mundo.</p></div><div class="em-v2-status" id="emV2TopStatus">Carregando status...</div></div>`;
  const data = [
    ['novos', 'Novos', 'Entrada sem tratamento', icon.mail, 'green'],
    ['pendentes', 'Pendentes', 'Aguardando ação', icon.clock, 'amber'],
    ['urgentes', 'Urgentes', 'Prioridade alta/urgente', icon.alert, 'red'],
    ['semregional', 'Sem regional', 'Triagem não identificou', icon.pin, 'gray'],
    ['respondidos', 'Respondidos', 'Tratados pelo fluxo', icon.check, 'green']
  ];
  hero.insertAdjacentHTML('afterend', `<div class="em-v3-health" id="emV3Health"><span class="dot"></span><span id="emV3HealthText">Verificando sincronização...</span></div><div class="em-v2-kpis">${data.map(([k, l, h, i, a]) => `<div class="em-v2-kpi" data-accent="${a}" data-kpi="${k}" title="Clique para ver estes e-mails"><div class="em-v2-kpi-icon">${i}</div><div><div class="em-v2-kpi-label">${l}</div><div class="em-v2-kpi-value" data-kpi-value="${k}">—</div><div class="em-v2-kpi-hint">${h}</div></div></div>`).join('')}</div>`);
}

function ensureHeaders() {
  const entrada = document.getElementById('emPanelEntrada');
  if (!entrada) return;
  entrada.querySelector(':scope > article.em-card')?.classList.add('em-v2-filter-card');
  const grid = entrada.querySelector('.em-grid, .em-grid-3');
  const listCard = grid?.querySelector('article.em-card:first-child');
  if (listCard && !listCard.querySelector('.em-v2-step-head')) listCard.insertAdjacentHTML('afterbegin', '<div class="em-v2-step-head"><span class="em-v2-step-title"><span class="em-v2-step-index">1</span>Caixa de Entrada</span><span class="em-v2-mini-note" id="emV3ListCount">Fila de triagem</span></div>');
}

// ── Filtros extras (regional / categoria / prioridade) ──────────────────────
const extraFilter = { regional: '', categoria: '', prioridade: '' };

const REGIONAL_OPTIONS = ['BAHIA', 'GOIAS', 'MARANHAO', 'MATO GROSSO DO SUL', 'MINAS GERAIS', 'MATO GROSSO MT1', 'MATO GROSSO MT2', 'MATO GROSSO MT3', 'MATO GROSSO MT4', 'PARA', 'PARAGUAI', 'PR PONTA GROSSA', 'PR CASCAVEL', 'PR LONDRINA', 'PR MARINGA', 'RIO GRANDE DO SUL', 'SAO PAULO', 'TOCANTINS'];
const CATEGORIA_OPTIONS = ['LOGÍSTICA', 'LOGISTICA', 'QUALIDADE', 'NOTAS FISCAIS', 'NOTAS_FISCAIS', 'FINANCEIRO', 'FROTAS', 'RH', 'COMERCIAL', 'COTACAO', 'CONTRATO', 'PROPOSTA', 'PHISHING', 'GERAL'];

function ensureExtraFilters() {
  const filterForm = document.getElementById('emFilter');
  if (!filterForm || document.getElementById('emV3Regional')) return;
  const holder = document.createElement('div');
  holder.className = 'em-v3-extra-filters';
  holder.innerHTML = `
    <select id="emV3Regional" title="Filtrar por regional"><option value="">🗺️ Todas as regionais</option>${REGIONAL_OPTIONS.map((r) => `<option value="${r}">${r}</option>`).join('')}<option value="__SEM__">— Sem regional identificada —</option></select>
    <select id="emV3Categoria" title="Filtrar por categoria"><option value="">🏷️ Todas as categorias</option>${[...new Set(CATEGORIA_OPTIONS)].map((c) => `<option value="${c}">${c}</option>`).join('')}</select>
    <select id="emV3Prioridade" title="Filtrar por prioridade"><option value="">⚡ Todas as prioridades</option><option value="URGENTE">URGENTE</option><option value="ALTA">ALTA</option><option value="NORMAL">NORMAL</option><option value="BAIXA">BAIXA</option></select>
    <button type="button" class="em-v3-clear" id="emV3Clear">Limpar filtros</button>
  `;
  filterForm.after(holder);
  ['emV3Regional', 'emV3Categoria', 'emV3Prioridade'].forEach((id) => {
    document.getElementById(id).addEventListener('change', () => {
      extraFilter.regional = document.getElementById('emV3Regional').value;
      extraFilter.categoria = document.getElementById('emV3Categoria').value;
      extraFilter.prioridade = document.getElementById('emV3Prioridade').value;
      applyExtraFilters();
    });
  });
  document.getElementById('emV3Clear').addEventListener('click', () => {
    extraFilter.regional = ''; extraFilter.categoria = ''; extraFilter.prioridade = '';
    document.getElementById('emV3Regional').value = '';
    document.getElementById('emV3Categoria').value = '';
    document.getElementById('emV3Prioridade').value = '';
    const busca = document.getElementById('emBusca');
    if (busca) busca.value = '';
    document.getElementById('emFilter')?.requestSubmit?.();
    applyExtraFilters();
  });
}

// A filtragem extra é feita em cima das linhas já renderizadas (não refaz a
// query): cada linha exibe badges com regional/categoria/prioridade, então dá
// pra filtrar pelo texto delas sem alterar emails.js.
let applyingFilters = false;
function applyExtraFilters() {
  if (applyingFilters) return;
  applyingFilters = true;
  try { applyExtraFiltersInner(); } finally { applyingFilters = false; }
}

function applyExtraFiltersInner() {
  const rows = document.querySelectorAll('#emList .em-row');
  let visible = 0;
  rows.forEach((row) => {
    const texto = (row.textContent || '').toUpperCase();
    let ok = true;
    if (extraFilter.regional === '__SEM__') ok = texto.includes('SEM REGIONAL');
    else if (extraFilter.regional) {
      const alias = {
        'BAHIA': ['BAHIA'], 'GOIAS': ['GOIÁS', 'GOIAS'], 'MARANHAO': ['MARANHÃO', 'MARANHAO'],
        'MATO GROSSO DO SUL': ['MATO GROSSO DO SUL'], 'MINAS GERAIS': ['MINAS GERAIS'],
        'MATO GROSSO MT1': ['MT1'], 'MATO GROSSO MT2': ['MT2'], 'MATO GROSSO MT3': ['MT3'], 'MATO GROSSO MT4': ['MT4'],
        'PARA': ['PARÁ', 'PARA'], 'PARAGUAI': ['PARAGUAI'],
        'PR PONTA GROSSA': ['PONTA GROSSA'], 'PR CASCAVEL': ['CASCAVEL'], 'PR LONDRINA': ['LONDRINA'], 'PR MARINGA': ['MARINGÁ', 'MARINGA'],
        'RIO GRANDE DO SUL': ['RIO GRANDE DO SUL'], 'SAO PAULO': ['SÃO PAULO', 'SAO PAULO'], 'TOCANTINS': ['TOCANTINS']
      }[extraFilter.regional] || [extraFilter.regional];
      ok = alias.some((a) => texto.includes(a));
    }
    if (ok && extraFilter.categoria) {
      const aliasCat = {
        'LOGISTICA': ['LOGÍSTICA', 'LOGISTICA', 'EMBARQUE'], 'LOGÍSTICA': ['LOGÍSTICA', 'LOGISTICA', 'EMBARQUE'],
        'NOTAS FISCAIS': ['NOTAS FISCAIS', 'NOTA FISCAL'], 'NOTAS_FISCAIS': ['NOTAS FISCAIS', 'NOTAS_FISCAIS', 'NOTA FISCAL'],
        'QUALIDADE': ['QUALIDADE'], 'FINANCEIRO': ['FINANCEIRO'], 'FROTAS': ['FROTAS', 'MULTA'], 'RH': ['RECURSOS HUMANOS', 'RH'],
        'COMERCIAL': ['COMERCIAL'], 'COTACAO': ['COTAÇÃO', 'COTACAO'], 'CONTRATO': ['CONTRATO'],
        'PROPOSTA': ['PROPOSTA'], 'PHISHING': ['GOLPE', 'PHISHING'], 'GERAL': ['SEM CATEGORIA', 'GERAL']
      }[extraFilter.categoria] || [extraFilter.categoria];
      ok = aliasCat.some((a) => texto.includes(a));
    }
    if (ok && extraFilter.prioridade) ok = texto.includes(extraFilter.prioridade);
    const display = ok ? '' : 'none';
    // Só toca no DOM quando muda de verdade — evita retrigger do MutationObserver.
    if (row.style.display !== display) row.style.display = display;
    if (ok) visible += 1;
  });
  const count = document.getElementById('emV3ListCount');
  const label = `${visible} e-mail(s) na lista`;
  if (count && count.textContent !== label) count.textContent = label;
}

// ── KPIs / saúde ─────────────────────────────────────────────────────────────
function countBy(apply) {
  const q = supabase.from('email_messages').select('id', { count: 'exact', head: true });
  return apply(q).then(({ count }) => count ?? 0).catch(() => null);
}

async function refreshKpis() {
  const values = await Promise.all([
    countBy((q) => q.in('status', ['NOVO'])),
    countBy((q) => q.in('status', ['PENDENTE', 'RESPONDER'])),
    countBy((q) => q.in('prioridade', ['ALTA', 'URGENTE']).in('status', ['NOVO', 'PENDENTE', 'RESPONDER'])),
    countBy((q) => q.is('regional', null).in('status', ['NOVO', 'PENDENTE', 'RESPONDER'])),
    countBy((q) => q.in('status', ['RESPONDIDO', 'RESOLVIDO']))
  ]);
  ['novos', 'pendentes', 'urgentes', 'semregional', 'respondidos'].forEach((key, i) => {
    const el = document.querySelector(`[data-kpi-value="${key}"]`);
    if (el && values[i] !== null) el.textContent = String(values[i]);
  });
  const status = document.getElementById('emV2TopStatus');
  if (status) status.textContent = `Painel atualizado às ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} · atualização automática a cada 2 min`;
}

async function refreshHealth() {
  const el = document.getElementById('emV3Health');
  const txt = document.getElementById('emV3HealthText');
  if (!el || !txt) return;
  try {
    const { data } = await supabase.from('email_accounts_public').select('email, ultima_sync_em, ultima_sync_status, ultima_sync_erro').eq('ativo', true).order('nome');
    if (!data || !data.length) { txt.textContent = 'Nenhuma conta de e-mail ativa cadastrada.'; return; }
    const parts = data.map((a) => {
      const quando = a.ultima_sync_em ? new Date(a.ultima_sync_em) : null;
      const minutos = quando ? Math.round((Date.now() - quando.getTime()) / 60000) : null;
      const atraso = minutos === null ? 'nunca sincronizou' : minutos < 2 ? 'agora mesmo' : `há ${minutos} min`;
      const comErro = String(a.ultima_sync_status || '').startsWith('ERRO') || (minutos !== null && minutos > 30);
      return { email: a.email, atraso, comErro, erro: a.ultima_sync_erro };
    });
    const anyErr = parts.some((p) => p.comErro);
    el.classList.toggle('err', anyErr);
    txt.innerHTML = parts.map((p) => `Sincronização de <b>${p.email}</b>: ${p.comErro ? '⚠️ com problema' : 'ok'} (última leitura ${p.atraso})`).join(' · ');
  } catch {
    txt.textContent = 'Não foi possível verificar o status da sincronização.';
  }
}

function bindKpiClicks() {
  document.querySelectorAll('.em-v2-kpi[data-kpi]').forEach((kpi) => {
    if (kpi.dataset.bound === '1') return;
    kpi.dataset.bound = '1';
    kpi.addEventListener('click', () => {
      const key = kpi.dataset.kpi;
      const statusSel = document.getElementById('emStatus');
      const prioSel = document.getElementById('emV3Prioridade');
      const regSel = document.getElementById('emV3Regional');
      if (!statusSel) return;
      extraFilter.prioridade = ''; extraFilter.regional = '';
      if (prioSel) prioSel.value = ''; if (regSel) regSel.value = '';
      if (key === 'novos' || key === 'pendentes') statusSel.value = 'NOVO,PENDENTE,RESPONDER';
      if (key === 'respondidos') statusSel.value = 'RESPONDIDO,RESOLVIDO';
      if (key === 'urgentes') { statusSel.value = 'NOVO,PENDENTE,RESPONDER'; extraFilter.prioridade = 'ALTA'; if (prioSel) prioSel.value = 'ALTA'; }
      if (key === 'semregional') { statusSel.value = 'NOVO,PENDENTE,RESPONDER'; extraFilter.regional = '__SEM__'; if (regSel) regSel.value = '__SEM__'; }
      document.getElementById('emFilter')?.requestSubmit?.();
      setTimeout(applyExtraFilters, 800);
      document.getElementById('emPanelEntrada')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });
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
  if (inner && inner.dataset.emailV2 !== '1') {
    inner.dataset.emailV2 = '1';
    const head = document.createElement('div');
    head.className = 'em-v2-step-head';
    head.innerHTML = '<span class="em-v2-step-title"><span class="em-v2-step-index">2</span>Leitura e interpretação pela IA</span>';
    inner.prepend(head);
    compactRecipients(inner);
  }

  const actionInner = document.getElementById('emAction')?.querySelector('.em-detail');
  if (!actionInner || actionInner.dataset.emailV2 === '1') return;
  actionInner.dataset.emailV2 = '1';
  const head = document.createElement('div');
  head.className = 'em-v2-step-head';
  head.innerHTML = '<span class="em-v2-step-title"><span class="em-v2-step-index">3</span>Ação sugerida</span>';
  actionInner.prepend(head);
  const forward = actionInner.querySelector('#emAprovarEncaminhamento');
  if (forward) { forward.textContent = 'Aprovar e redirecionar ao gestor'; forward.classList.add('em-v2-primary-action'); }
  const replySubmit = actionInner.querySelector('#emReplyForm button[type="submit"]');
  if (replySubmit) replySubmit.textContent = 'Aprovar resposta';
  const replyLabel = actionInner.querySelector('.em-reply .em-section-label');
  if (replyLabel) replyLabel.textContent = 'Resposta sugerida pela IA';
  const helper = actionInner.querySelector('.em-reply .em-muted.em-small');
  if (helper) helper.textContent = 'Revise o texto, aprove a resposta ou use as ações secundárias para resolver, arquivar ou manter pendente.';
}

let enhancing = false;
function enhance() {
  if (enhancing) return;
  enhancing = true;
  try {
    const content = document.getElementById('pageContent');
    const wrap = content?.querySelector('.em-wrap');
    if (!wrap) return;
    if (!document.body.classList.contains('email-center-v2')) document.body.classList.add('email-center-v2');
    if (!content.classList.contains('emails-smart-page')) content.classList.add('emails-smart-page');
    const title = document.getElementById('pageTitle');
    if (title && title.textContent !== 'Central de E-mails Inteligente') title.textContent = 'Central de E-mails Inteligente';
    ensureHero(wrap); ensureHeaders(); ensureExtraFilters(); enhanceDetail(); bindKpiClicks();
    applyExtraFilters();
  } finally {
    enhancing = false;
  }
}

function boot() {
  addStyle(); enhance(); refreshKpis(); refreshHealth();
  // Debounce do observer: emails.js re-renderiza a lista inteira em cada ação,
  // disparar enhance síncrono a cada mutação individual congela a página.
  let pending = null;
  const scheduleEnhance = () => {
    if (pending) return;
    pending = setTimeout(() => { pending = null; enhance(); }, 120);
  };
  new MutationObserver(scheduleEnhance).observe(document.getElementById('pageContent') || document.body, { childList: true, subtree: true });
  document.addEventListener('submit', (e) => { if (['emFilter', 'emReplyForm'].includes(e.target?.id)) setTimeout(() => { refreshKpis(); applyExtraFilters(); }, 900); });
  document.addEventListener('click', (e) => { if (e.target.closest('[data-action], #emAprovarEncaminhamento')) setTimeout(refreshKpis, 900); });
  setInterval(() => {
    refreshKpis();
    refreshHealth();
    // Atualização automática da lista só quando o usuário não está lendo um e-mail,
    // pra não puxar o tapete no meio de uma aprovação.
    const detailAberto = document.querySelector('#emDetail .em-detail');
    const abaEntrada = document.getElementById('emPanelEntrada')?.style.display !== 'none';
    if (!detailAberto && abaEntrada) document.getElementById('emFilter')?.requestSubmit?.();
  }, 120000);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
else boot();
