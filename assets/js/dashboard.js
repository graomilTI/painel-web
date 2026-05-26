import { initProtectedPage } from './pageInit.js';
import { flattenAllowedMenu, buildAllowedMenu } from './menuBuilder.js';
import { toPanelUrl } from './paths.js';
import { supabase } from './supabaseClient.js';

const ICON_MODULES = `<svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>`;
const ICON_USER    = `<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>`;
const ICON_SECTOR  = `<svg viewBox="0 0 24 24"><path d="M3 21V7l9-5 9 5v14"/><path d="M9 21V12h6v9"/></svg>`;
const ICON_STATUS  = `<svg viewBox="0 0 24 24"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`;

const BR = new Intl.NumberFormat('pt-BR');
const MESES_FULL = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

const STATE_PATHS = {
  'GO': 'M 26,9 L 70,9 L 84,30 L 80,73 L 54,84 L 21,70 L 16,33 Z',
  'BA': 'M 18,5 L 83,5 L 92,40 L 82,84 L 52,94 L 14,77 L 4,38 Z',
  'MA': 'M 8,9 L 85,6 L 93,50 L 70,88 L 16,87 L 4,46 Z',
  'MG': 'M 14,9 L 84,6 L 92,40 L 83,78 L 56,88 L 17,79 L 5,52 L 11,22 Z',
  'MS': 'M 10,10 L 86,8 L 90,54 L 83,90 L 11,90 L 7,54 Z',
  'MT': 'M 7,6 L 88,5 L 95,28 L 91,88 L 52,92 L 7,78 Z',
  'PQ': 'M 5,6 L 90,5 L 95,40 L 74,88 L 32,94 L 5,65 Z',
  'PR': 'M 4,10 L 90,10 L 92,72 L 44,88 L 4,72 Z',
  'RS': 'M 9,5 L 88,6 L 94,52 L 62,94 L 16,87 L 5,52 Z',
  'SP': 'M 7,16 L 79,10 L 93,44 L 82,78 L 44,88 L 7,72 Z',
  'TO': 'M 28,5 L 72,5 L 80,28 L 75,88 L 25,88 L 20,28 Z',
  'BR': 'M 20,5 L 75,5 L 95,25 L 90,55 L 70,88 L 45,95 L 25,90 L 5,65 L 5,30 Z',
};

const STATE_FROM_COORD = {
  'GOIAS': 'GO', 'BAHIA': 'BA', 'MARANHAO': 'MA', 'MINAS GERAIS': 'MG',
  'MATO GROSSO DO SUL': 'MS',
  'MATO GROSSO MT1': 'MT', 'MATO GROSSO MT2': 'MT',
  'MATO GROSSO MT3 CONFRESA': 'MT', 'MATO GROSSO MT3 QUERENCIA': 'MT',
  'MATO GROSSO MT4': 'MT',
  'PARA': 'PQ',
  'CASCAVEL': 'PR', 'LONDRINA': 'PR', 'MARINGA E TERMINAIS': 'PR', 'PONTA GROSSA': 'PR',
  'RIO GRANDE DO SUL': 'RS', 'SAO PAULO': 'SP', 'TOCANTINS': 'TO',
};

function esc(v) {
  return String(v ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
}

function normalizeStr(value) {
  return String(value ?? '').normalize('NFD').replace(/[̀-ͯ]/g,'').toUpperCase().replace(/[^A-Z0-9]+/g,' ').trim();
}

function fmtTons(val) { return BR.format(Math.round(Number(val) || 0)) + ' t'; }

function fmtDelta(val) {
  const v = Number(val) || 0;
  return (v >= 0 ? '+' : '−') + BR.format(Math.round(Math.abs(v))) + ' t';
}

function isGestorOrMaster(ctx) {
  const role = normalizeStr(ctx?.user?.role || ctx?.perfil_codigo || ctx?.perfil_nome || '');
  const dept = normalizeStr(ctx?.department?.code || ctx?.department?.name || ctx?.setor || '');
  return !!ctx?.user?.is_master || role === 'GESTOR' || dept === 'GESTOR' || role === 'MASTER';
}

function injectDashStyles() {
  if (document.getElementById('dbGestorStyles')) return;
  const s = document.createElement('style');
  s.id = 'dbGestorStyles';
  s.textContent = `
    @keyframes db-fill-in { from { width: 0 !important; } }
    @keyframes db-pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.45;transform:scale(.65)} }
    @keyframes db-fade-up { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
    @keyframes db-wave { to { transform: translateX(60px); } }
    @keyframes db-state-rise { from { transform: scaleY(0); } }
    @keyframes db-glow-pulse { 0%,100%{opacity:.55} 50%{opacity:1} }

    .db-section { margin-bottom: 24px; animation: db-fade-up .35s ease both; }
    .db-section-head {
      display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px;
    }
    .db-section-title {
      font-size: 11px; font-weight: 950; letter-spacing: .12em; text-transform: uppercase; color: #6b7280;
    }
    .db-period-info { display: flex; align-items: baseline; gap: 8px; }
    .db-period-month { font-size: 11px; font-weight: 900; letter-spacing: .10em; color: #6b7280; text-transform: uppercase; }
    .db-period-year  { font-size: 20px; font-weight: 1000; letter-spacing: -.04em; color: #e2e2f0; }
    .db-region-tag {
      font-size: 10px; font-weight: 950; letter-spacing: .08em; text-transform: uppercase;
      color: #6ee7b7; border: 1px solid rgba(45,212,160,.28); border-radius: 999px; padding: 5px 12px;
    }
    .db-refresh-btn {
      border: 1px solid rgba(255,255,255,.08); background: rgba(21,21,42,.75);
      color: #94a3b8; border-radius: 10px; padding: 7px 12px;
      font-size: 11px; font-weight: 900; cursor: pointer; transition: .15s;
    }
    .db-refresh-btn:hover { background: rgba(45,212,160,.12); border-color: rgba(45,212,160,.28); color: #e2e2f0; }
    .db-refresh-btn.loading { opacity: .6; cursor: wait; }

    .db-prod-card {
      border: 1px solid rgba(255,255,255,.07); border-radius: 20px; padding: 22px 20px;
      background: rgba(13,13,24,.88); box-shadow: 0 16px 48px rgba(0,0,0,.26);
      position: relative; overflow: hidden; margin-bottom: 14px;
      animation: db-fade-up .35s .04s ease both;
    }
    .db-prod-card.is-on-track  { border-color: rgba(0,200,122,.28); }
    .db-prod-card.is-off-track { border-color: rgba(253,230,138,.20); }
    .db-prod-card::before {
      content:''; position:absolute; top:0; left:0; right:0; height:1px;
      background: linear-gradient(90deg,transparent,rgba(45,212,160,.45),transparent);
    }
    .db-prod-eyebrow { font-size:10px; font-weight:950; letter-spacing:.14em; text-transform:uppercase; color:#6b7280; margin-bottom:16px; }
    .db-prod-hero { display:flex; align-items:flex-end; justify-content:space-between; gap:16px; margin-bottom:20px; }
    .db-prod-main { flex:1; min-width:0; }
    .db-prod-value {
      font-size:clamp(42px,5.5vw,60px); font-weight:1000; letter-spacing:-.05em; line-height:.9;
      font-variant-numeric:tabular-nums; color:#e2e2f0; transition:color .3s;
    }
    .db-prod-value.is-green { color:#00c87a; text-shadow:0 0 28px rgba(0,200,122,.28); }
    .db-prod-value.is-amber { color:#fde68a; }
    .db-prod-sublabel { font-size:10px; font-weight:950; letter-spacing:.12em; text-transform:uppercase; color:#6b7280; margin-top:8px; }
    .db-prod-aside { display:flex; flex-direction:column; gap:10px; align-items:flex-end; flex-shrink:0; }
    .db-aside-block { text-align:right; }
    .db-aside-value { font-size:19px; font-weight:1000; letter-spacing:-.04em; font-variant-numeric:tabular-nums; color:#e2e2f0; line-height:1; }
    .db-aside-value.is-green { color:#00c87a; }
    .db-aside-value.is-red   { color:#f87171; }
    .db-aside-label { font-size:9px; font-weight:950; letter-spacing:.10em; text-transform:uppercase; color:#6b7280; margin-top:3px; }
    .db-aside-sep { height:1px; width:100%; background:rgba(255,255,255,.07); }

    .db-meter { position:relative; height:12px; border-radius:999px; background:rgba(255,255,255,.07); overflow:visible; margin-bottom:8px; }
    .db-meter-fill {
      position:absolute; top:0; left:0; bottom:0; border-radius:999px; max-width:100%;
      background:linear-gradient(90deg,#065f46,#00c87a,#2dd4a0);
      box-shadow:0 0 14px rgba(0,200,122,.40);
      animation:db-fill-in .7s .15s cubic-bezier(.22,1,.36,1) both;
    }
    .db-meter-fill.is-warn { background:linear-gradient(90deg,#78350f,#d97706,#fde68a); box-shadow:0 0 10px rgba(253,230,138,.25); }
    .db-meter-cursor { position:absolute; top:50%; transform:translate(-50%,-50%); width:3px; height:22px; border-radius:3px; background:rgba(255,255,255,.85); box-shadow:0 0 6px rgba(255,255,255,.35); pointer-events:none; z-index:2; }
    .db-meter-meta { display:flex; justify-content:space-between; align-items:baseline; margin-bottom:14px; }
    .db-meter-pct { font-size:26px; font-weight:1000; letter-spacing:-.05em; font-variant-numeric:tabular-nums; color:#e2e2f0; }
    .db-meter-pct small { font-size:13px; font-weight:800; color:#6b7280; margin-left:1px; }
    .db-meter-day { font-size:10px; font-weight:900; letter-spacing:.08em; color:#6b7280; }

    .db-pace-row { display:flex; align-items:center; justify-content:space-between; gap:8px; flex-wrap:wrap; }
    .db-pace-badge { display:inline-flex; align-items:center; gap:7px; border-radius:999px; padding:7px 14px; font-size:11px; font-weight:950; letter-spacing:.03em; }
    .db-pace-badge.is-ok   { background:rgba(0,200,122,.12); color:#00c87a; border:1px solid rgba(0,200,122,.28); }
    .db-pace-badge.is-late { background:rgba(253,230,138,.10); color:#fde68a; border:1px solid rgba(253,230,138,.26); }
    .db-pace-dot { width:7px; height:7px; border-radius:50%; background:currentColor; flex-shrink:0; }
    .db-pace-badge.is-ok .db-pace-dot { animation:db-pulse 1.8s ease-in-out infinite; }
    .db-delta { font-size:11px; font-weight:900; opacity:.85; }
    .db-delta.is-pos { color:#00c87a; }
    .db-delta.is-neg { color:#fde68a; }

    .db-secondary-grid { display:grid; grid-template-columns:1fr 1fr; gap:14px; animation:db-fade-up .35s .08s ease both; }
    @media(max-width:700px) { .db-secondary-grid{grid-template-columns:1fr} }

    .db-mini-card { border:1px solid rgba(255,255,255,.07); border-radius:18px; padding:18px 16px; background:rgba(13,13,24,.88); }
    .db-mini-eyebrow { font-size:9px; font-weight:950; letter-spacing:.14em; text-transform:uppercase; color:#6b7280; margin-bottom:12px; }
    .db-patri-hero { display:flex; align-items:baseline; gap:5px; margin-bottom:12px; }
    .db-patri-num { font-size:40px; font-weight:1000; letter-spacing:-.05em; line-height:1; font-variant-numeric:tabular-nums; color:#e2e2f0; }
    .db-patri-num.is-green { color:#00c87a; }
    .db-patri-den { font-size:14px; font-weight:700; color:#6b7280; }
    .db-seg { display:flex; height:7px; border-radius:999px; overflow:hidden; background:rgba(255,255,255,.06); margin-bottom:8px; gap:2px; }
    .db-seg-ok   { background:#00c87a; border-radius:999px; transition:width .6s ease; }
    .db-seg-late { background:#f87171; border-radius:999px; transition:width .6s ease; }
    .db-patri-status { font-size:11px; font-weight:900; }
    .db-status-ok   { color:#00c87a; }
    .db-status-late { color:#f87171; }
    .db-patri-detail { font-size:10px; color:#6b7280; margin-top:5px; }

    .db-os-nums { display:flex; align-items:stretch; margin-bottom:14px; }
    .db-os-block { flex:1; text-align:center; padding:10px 6px; }
    .db-os-num { font-size:32px; font-weight:1000; letter-spacing:-.05em; line-height:1; font-variant-numeric:tabular-nums; color:#e2e2f0; }
    .db-os-num.is-amber { color:#fde68a; }
    .db-os-num.is-green { color:#00c87a; }
    .db-os-label { font-size:9px; font-weight:900; letter-spacing:.08em; color:#6b7280; text-transform:uppercase; margin-top:4px; }
    .db-os-sep { width:1px; background:rgba(255,255,255,.07); }
    .db-os-link { display:block; width:100%; background:rgba(0,200,122,.10); color:#00c87a; border:1px solid rgba(0,200,122,.26); border-radius:10px; padding:9px; font-size:11px; font-weight:950; text-align:center; text-decoration:none; transition:background .15s; }
    .db-os-link:hover { background:rgba(0,200,122,.18); }

    .db-loading { padding:32px; text-align:center; color:#6b7280; font-size:13px; }

    .db-state-wrap {
      display: flex; justify-content: center; align-items: center;
      margin: 4px 0 10px; position: relative;
    }
    .db-state-svg {
      width: 168px; height: 168px; overflow: visible;
      filter: drop-shadow(0 0 18px rgba(0,200,122,.18));
    }
    .db-state-bg {
      fill: rgba(255,255,255,.04);
      stroke: rgba(255,255,255,.10); stroke-width: .8;
    }
    .db-state-border {
      fill: none;
      stroke-width: 1.2; stroke-linejoin: round;
    }
    .is-on-track  .db-state-border { stroke: rgba(0,200,122,.55); }
    .is-off-track .db-state-border { stroke: rgba(253,230,138,.45); }
    .db-state-fill-rect {
      transform-origin: 50px 105px;
      transform: scaleY(0);
      transition: transform .9s cubic-bezier(.22,1,.36,1);
    }
    .db-state-wave-path {
      animation: db-wave 2.8s linear infinite;
    }
    .db-state-pct {
      font-size: 22px; font-weight: 1000; letter-spacing: -.04em;
      fill: #fff; text-anchor: middle; dominant-baseline: central;
      filter: drop-shadow(0 1px 3px rgba(0,0,0,.7));
    }
    .db-state-abbr {
      font-size: 8.5px; font-weight: 950; letter-spacing: .14em;
      fill: rgba(255,255,255,.65); text-anchor: middle; dominant-baseline: central;
    }
    .db-state-glow {
      animation: db-glow-pulse 2.5s ease-in-out infinite;
    }
  `;
  document.head.appendChild(s);
}

async function fetchGestorData(ctx) {
  const isMaster = !!ctx?.user?.is_master;
  const coordenacao = ctx?.user?.coordenacao || '';
  const now = new Date();
  const ano = now.getFullYear();
  const mes = now.getMonth() + 1;
  const dataIni = `${ano}-${String(mes).padStart(2,'0')}-01`;
  const dataFim = mes === 12 ? `${ano+1}-01-01` : `${ano}-${String(mes+1).padStart(2,'0')}-01`;

  let prodBase      = supabase.from('relatorio_resultado_diario').select('toneladas').gte('data',dataIni).lt('data',dataFim);
  let patriBase     = supabase.from('patrimonios_snapshot').select('*',{count:'exact',head:true}).eq('situacao','Ativo');
  let patriLateBase = supabase.from('patrimonios_snapshot').select('*',{count:'exact',head:true}).eq('situacao','Ativo').gt('dias_sem_leitura',7);
  let osBase        = supabase.from('operacional_os').select('status_gestor,configurada_em');

  if (!isMaster && coordenacao) {
    prodBase      = prodBase.eq('coordenacao', coordenacao);
    patriBase     = patriBase.eq('coordenacao', coordenacao);
    patriLateBase = patriLateBase.eq('coordenacao', coordenacao);
    osBase        = osBase.eq('coordenacao', coordenacao);
  }

  const [metaRes, patriTotalRes, patriLateRes] = await Promise.all([
    supabase.from('metas_producao').select('meta_tons,regional').eq('ano',ano).eq('mes',mes).eq('ativo',true),
    patriBase,
    patriLateBase,
  ]);

  const PAGE = 1000;
  let produzido = 0;
  for (let page = 0; ; page++) {
    const { data, error } = await prodBase.range(page * PAGE, (page+1) * PAGE - 1);
    if (error) throw error;
    if (!data?.length) break;
    produzido += data.reduce((s,r) => s + Number(r.toneladas||0), 0);
    if (data.length < PAGE) break;
  }

  let allOs = [];
  for (let page = 0; ; page++) {
    const { data } = await osBase.range(page * PAGE, (page+1) * PAGE - 1);
    if (!data?.length) break;
    allOs = allOs.concat(data);
    if (data.length < PAGE) break;
  }

  let meta = null;
  if (metaRes.data?.length) {
    if (isMaster) {
      meta = metaRes.data.reduce((s,r) => s + Number(r.meta_tons||0), 0);
    } else {
      const hit = metaRes.data.find(r =>
        normalizeStr(r.regional) === normalizeStr(coordenacao) ||
        normalizeStr(coordenacao).startsWith(normalizeStr(r.regional)) ||
        normalizeStr(r.regional).startsWith(normalizeStr(coordenacao))
      );
      meta = hit ? Number(hit.meta_tons) : null;
    }
  }

  return {
    ano, mes, coordenacao, isMaster,
    produzido, meta,
    patriTotal: patriTotalRes.count ?? 0,
    patriAtrasados: patriLateRes.count ?? 0,
    osPendentes: allOs.filter(o => (o.status_gestor||'AGUARDAR').toUpperCase()==='AGUARDAR' && !o.configurada_em).length,
    osAtender:   allOs.filter(o => String(o.status_gestor||'').toUpperCase()==='ATENDER').length,
    osTotal:     allOs.length,
  };
}

function renderStateFill({ pct, onTrack, estado, diaAtual, diasNoMes, meta, delta }) {
  const path    = STATE_PATHS[estado] || STATE_PATHS['BR'];
  const fillY   = 100 - pct;
  const waveAmp = 4;
  const wY      = fillY;
  const wUp     = wY - waveAmp;
  const wDn     = wY + waveAmp;
  const gradTop = onTrack ? '#2dd4a0' : '#fde68a';
  const gradBot = onTrack ? '#064e3b' : '#78350f';
  const glowC   = onTrack ? 'rgba(0,200,122,.35)' : 'rgba(253,230,138,.30)';
  const pctText = pct.toFixed(0) + '%';
  const wavePath = `M -60,${wY} Q -30,${wUp} 0,${wY} Q 30,${wDn} 60,${wY} Q 90,${wUp} 120,${wY} Q 150,${wDn} 180,${wY} L 180,110 L -60,110 Z`;
  const scaleVal = (pct / 100).toFixed(4);
  const textY   = Math.min(Math.max(fillY - 12, 30), 60);

  return `
    <div class="db-state-wrap">
      <svg class="db-state-svg" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <clipPath id="dbStateClip"><path d="${path}"/></clipPath>
          <linearGradient id="dbFillGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="${gradTop}"/>
            <stop offset="100%" stop-color="${gradBot}"/>
          </linearGradient>
          <filter id="dbStateGlow">
            <feGaussianBlur stdDeviation="2.5" result="blur"/>
            <feComposite in="SourceGraphic" in2="blur" operator="over"/>
          </filter>
        </defs>

        <path d="${path}" class="db-state-bg"/>

        <g clip-path="url(#dbStateClip)">
          <rect class="db-state-fill-rect" data-scale="${scaleVal}"
                x="-5" y="0" width="110" height="105"
                fill="url(#dbFillGrad)"/>
          <path class="db-state-wave-path"
                d="${wavePath}"
                fill="${gradTop}" opacity=".55"/>
          <rect x="-5" y="${wY - 1}" width="110" height="2"
                fill="${gradTop}" opacity=".22"/>
        </g>

        <path d="${path}" class="db-state-border"/>

        <text x="50" y="${textY}" class="db-state-pct">${pctText}</text>
        ${estado ? `<text x="50" y="${textY + 11}" class="db-state-abbr">${estado}</text>` : ''}
      </svg>
    </div>
    <div class="db-meter-meta">
      <span class="db-meter-pct">${pct.toFixed(0)}<small>%</small></span>
      <span class="db-meter-day">DIA ${diaAtual} / ${diasNoMes}</span>
    </div>
  `;
}

function renderGestorDashboard(container, data) {
  const { ano, mes, coordenacao, isMaster, produzido, meta, patriTotal, patriAtrasados, osPendentes, osAtender, osTotal } = data;
  const now = new Date();
  const diaAtual   = now.getDate();
  const diasNoMes  = new Date(ano, mes, 0).getDate();
  const pct         = meta > 0 ? Math.min(100, produzido / meta * 100) : 0;
  const ritmo       = meta > 0 ? meta * diaAtual / diasNoMes : 0;
  const onTrack     = produzido >= ritmo;
  const projetado   = diaAtual > 0 ? produzido / diaAtual * diasNoMes : 0;
  const delta       = produzido - ritmo;
  const patriOk     = patriTotal - patriAtrasados;
  const patriPct    = patriTotal > 0 ? (patriOk / patriTotal * 100) : 100;
  const patriAtrPct = patriTotal > 0 ? (patriAtrasados / patriTotal * 100) : 0;
  const regionLabel = isMaster ? 'TODAS AS REGIONAIS' : (coordenacao || 'REGIONAL');
  const estado      = isMaster ? 'BR' : (STATE_FROM_COORD[normalizeStr(coordenacao)] || null);

  container.innerHTML = `
    <div class="db-section">
      <div class="db-section-head">
        <div style="display:flex;align-items:center;gap:16px">
          <div class="db-period-info">
            <span class="db-period-month">${MESES_FULL[mes-1].toUpperCase()}</span>
            <span class="db-period-year">${ano}</span>
          </div>
          <span class="db-region-tag">${esc(regionLabel)}</span>
        </div>
        <button class="db-refresh-btn" id="dbRefreshBtn" type="button">↻ Atualizar</button>
      </div>

      <div class="db-prod-card ${onTrack ? 'is-on-track' : 'is-off-track'}">
        <div class="db-prod-eyebrow">Produtividade do Mês</div>
        <div class="db-prod-hero">
          <div class="db-prod-main">
            <div class="db-prod-value ${onTrack ? 'is-green' : 'is-amber'}">${fmtTons(produzido)}</div>
            <div class="db-prod-sublabel">Realizado</div>
          </div>
          <div class="db-prod-aside">
            <div class="db-aside-block">
              <div class="db-aside-value">${meta > 0 ? fmtTons(meta) : '—'}</div>
              <div class="db-aside-label">Meta</div>
            </div>
            <div class="db-aside-sep"></div>
            <div class="db-aside-block">
              <div class="db-aside-value ${meta>0 && projetado>=meta ? 'is-green' : meta>0 ? 'is-red' : ''}">${meta > 0 ? fmtTons(projetado) : '—'}</div>
              <div class="db-aside-label">Projeção</div>
            </div>
          </div>
        </div>
        ${renderStateFill({ pct, onTrack, estado, diaAtual, diasNoMes, meta, delta })}
        <div class="db-pace-row">
          <div class="db-pace-badge ${onTrack ? 'is-ok' : 'is-late'}">
            <span class="db-pace-dot"></span>
            <span>${onTrack ? 'No ritmo esperado' : 'Abaixo do ritmo'}</span>
          </div>
          ${meta > 0 ? `<div class="db-delta ${onTrack ? 'is-pos' : 'is-neg'}">${fmtDelta(delta)} vs meta do dia</div>` : ''}
        </div>
      </div>

      <div class="db-secondary-grid">
        <div class="db-mini-card">
          <div class="db-mini-eyebrow">Leitura de Patrimônios</div>
          <div class="db-patri-hero">
            <span class="db-patri-num ${patriAtrasados===0 ? 'is-green' : ''}">${patriOk}</span>
            <span class="db-patri-den">/ ${patriTotal}</span>
          </div>
          <div class="db-seg">
            <div class="db-seg-ok"   style="width:${patriPct.toFixed(1)}%"></div>
            <div class="db-seg-late" style="width:${patriAtrPct.toFixed(1)}%"></div>
          </div>
          <div class="db-patri-status">
            ${patriAtrasados > 0
              ? `<span class="db-status-late">${patriAtrasados} em atraso &gt;7d</span>`
              : '<span class="db-status-ok">Tudo em dia ✓</span>'}
          </div>
          <div class="db-patri-detail">${patriTotal} patrimônios ativos</div>
        </div>

        <div class="db-mini-card">
          <div class="db-mini-eyebrow">Ordens de Serviço</div>
          <div class="db-os-nums">
            <div class="db-os-block">
              <div class="db-os-num ${osPendentes>0 ? 'is-amber' : ''}">${osPendentes}</div>
              <div class="db-os-label">Pendentes</div>
            </div>
            <div class="db-os-sep"></div>
            <div class="db-os-block">
              <div class="db-os-num ${osAtender>0 ? 'is-green' : ''}">${osAtender}</div>
              <div class="db-os-label">Conferência</div>
            </div>
            <div class="db-os-sep"></div>
            <div class="db-os-block">
              <div class="db-os-num">${osTotal}</div>
              <div class="db-os-label">Total</div>
            </div>
          </div>
          <a class="db-os-link" href="./os.html">Abrir módulo de OS →</a>
        </div>
      </div>
    </div>
  `;
}

function buildPanelHref(path = '') {
  const host = String(window.location.hostname || '').toLowerCase();
  if (host === 'grao1000.com.br' || host === 'www.grao1000.com.br') {
    return path ? `/painel/${path}`.replace(/([^:]\/)\/+/, '$1') : '/painel';
  }
  return toPanelUrl(path);
}

function renderStatCards(user, dept, totalLiberados) {
  const role   = user.role || 'Usuário';
  const sector = dept?.name || '—';
  const active = user.active !== false;

  return `
    <div class="stat-grid">
      <div class="stat-card">
        <div class="stat-icon green">${ICON_MODULES}</div>
        <div class="stat-body">
          <div class="stat-label">Módulos liberados</div>
          <div class="stat-value">${totalLiberados}</div>
          <span class="trend-badge up">↑ disponíveis</span>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon blue">${ICON_USER}</div>
        <div class="stat-body">
          <div class="stat-label">Perfil de acesso</div>
          <div class="stat-value" style="font-size:20px;letter-spacing:-.01em">${role}</div>
          <span class="trend-badge neutral">Autenticado</span>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon amber">${ICON_SECTOR}</div>
        <div class="stat-body">
          <div class="stat-label">Setor</div>
          <div class="stat-value" style="font-size:18px;letter-spacing:-.01em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${sector}</div>
          <span class="trend-badge neutral">Vínculo ativo</span>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon ${active ? 'green' : 'red'}">${ICON_STATUS}</div>
        <div class="stat-body">
          <div class="stat-label">Status</div>
          <div class="stat-value" style="font-size:20px">${active ? 'Ativo' : 'Inativo'}</div>
          <span class="trend-badge ${active ? 'up' : 'down'}">${active ? '● Online' : '● Offline'}</span>
        </div>
      </div>
    </div>
  `;
}

function renderQuickAccess(menuSections) {
  const items = menuSections.flatMap(s =>
    (s.items || []).map(item => ({ label: item.label, path: item.path, section: s.section }))
  ).slice(0, 12);

  if (!items.length) return '';

  return `
    <article class="card mt-16">
      <h3 style="margin:0 0 14px;font-size:16px">Acesso rápido</h3>
      <div class="quick-access-grid">
        ${items.map(i => `
          <a class="quick-access-item" href="${buildPanelHref(i.path)}">
            <span class="quick-access-dot"></span>
            <span>${i.label}</span>
          </a>
        `).join('')}
      </div>
    </article>
  `;
}

initProtectedPage('Dashboard', async (content, userContext) => {
  const menuSections   = buildAllowedMenu(userContext);
  const menuItems      = flattenAllowedMenu(userContext);
  const totalLiberados = menuItems.length;
  const showGestor     = isGestorOrMaster(userContext);

  const gestorPlaceholder = showGestor
    ? `<div id="dbGestorSection"><div class="db-loading">Carregando dashboard...</div></div>`
    : '';

  content.innerHTML = `
    ${gestorPlaceholder}

    ${renderStatCards(userContext.user, userContext.department, totalLiberados)}

    <section class="hero-card mt-16">
      <div>
        <div class="eyebrow">Painel corporativo</div>
        <h2>Bem-vindo, ${userContext.user.name}</h2>
        <p class="muted" style="margin:0;line-height:1.6;max-width:560px">
          Painel com autenticação real, sessão persistida, proteção de páginas,
          menu dinâmico por perfil e acesso seguro via Supabase Auth.
        </p>
      </div>
      <div class="hero-badge-wrap">
        <span class="hero-badge">
          ${userContext.user.is_master ? 'MASTER' : (userContext.user.role || 'USUÁRIO')}
        </span>
      </div>
    </section>

    ${renderQuickAccess(menuSections)}
  `;

  if (!showGestor) return;

  injectDashStyles();
  const gestorSection = document.getElementById('dbGestorSection');

  async function loadGestorData() {
    const btn = document.getElementById('dbRefreshBtn');
    if (btn) { btn.classList.add('loading'); btn.disabled = true; }
    try {
      const data = await fetchGestorData(userContext);
      renderGestorDashboard(gestorSection, data);
      document.getElementById('dbRefreshBtn')?.addEventListener('click', loadGestorData);
      requestAnimationFrame(() => {
        const fillRect = gestorSection.querySelector('.db-state-fill-rect');
        if (fillRect) {
          const s = fillRect.dataset.scale || '0';
          requestAnimationFrame(() => { fillRect.style.transform = `scaleY(${s})`; });
        }
      });
    } catch (e) {
      gestorSection.innerHTML = `<div class="db-loading" style="color:#f87171">Erro ao carregar: ${esc(e?.message || 'Tente novamente.')}</div>`;
      console.error('dashboard gestor:', e);
    } finally {
      const b = document.getElementById('dbRefreshBtn');
      if (b) { b.classList.remove('loading'); b.disabled = false; }
    }
  }

  await loadGestorData();
});
