import { supabase } from './supabaseClient.js';
import { getCurrentUser } from './auth.js';

const MONTHS = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
const dashboard = { loading: false, loaded: false, data: null, error: '' };

function norm(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}

function br(value) {
  return new Intl.NumberFormat('pt-BR').format(Math.round(Number(value) || 0));
}

function tons(value) {
  return `${br(value)} t`;
}

function monthWindow(date = new Date()) {
  const ano = date.getFullYear();
  const mes = date.getMonth() + 1;
  return {
    ano,
    mes,
    ini: `${ano}-${String(mes).padStart(2, '0')}-01`,
    fim: mes === 12 ? `${ano + 1}-01-01` : `${ano}-${String(mes + 1).padStart(2, '0')}-01`,
    diaAtual: date.getDate(),
    diasNoMes: new Date(ano, mes, 0).getDate(),
  };
}

function sameRegional(a, b) {
  const x = norm(a);
  const y = norm(b);
  return Boolean(x && y && (x === y || x.startsWith(y) || y.startsWith(x)));
}

async function fetchAllRows(query, pageSize = 1000, maxRows = 20000) {
  const rows = [];
  for (let from = 0; from < maxRows; from += pageSize) {
    const { data, error } = await query.range(from, from + pageSize - 1);
    if (error) throw error;
    const chunk = Array.isArray(data) ? data : [];
    rows.push(...chunk);
    if (chunk.length < pageSize) break;
  }
  return rows;
}

function injectStyles() {
  if (document.getElementById('gestorProgramacaoMetaFixStyles')) return;
  const style = document.createElement('style');
  style.id = 'gestorProgramacaoMetaFixStyles';
  style.textContent = `
    .ux-regional-meta-card{margin:0 0 14px;padding:18px;border:1px solid rgba(45,212,160,.16);border-radius:24px;background:linear-gradient(135deg,rgba(0,82,48,.34),rgba(18,18,32,.88));color:var(--text);box-shadow:0 18px 45px rgba(0,0,0,.22);animation:db-fade-up .35s ease both}
    .ux-regional-meta-card.is-warning{background:rgba(38,25,15,.82);border-color:rgba(251,191,36,.22)}
    .ux-regional-meta-card.is-loading{display:grid;gap:6px;background:rgba(18,18,32,.78)}
    .ux-regional-meta-card.is-loading span,.ux-regional-meta-card.is-warning p{color:var(--muted);margin:0;font-size:13px;line-height:1.35}
    .ux-meta-skeleton{width:54px;height:54px;border-radius:18px;background:rgba(255,255,255,.08)}
    .ux-regional-meta-head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px}
    .ux-meta-eyebrow{color:var(--soft);font-size:11px;font-weight:950;letter-spacing:.10em;text-transform:uppercase}
    .ux-regional-meta-card h2{margin:5px 0 0;font-size:22px;line-height:1.05;letter-spacing:-.04em}
    .ux-meta-percent{font-size:40px;line-height:.9;letter-spacing:-.07em;color:var(--soft)}
    .ux-progress{height:11px;overflow:hidden;margin:16px 0 14px;border-radius:999px;background:rgba(255,255,255,.08)}
    .ux-progress span{display:block;height:100%;border-radius:inherit;background:linear-gradient(90deg,rgba(45,212,160,.55),rgba(45,212,160,.95))}
    .ux-meta-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
    .ux-meta-grid div{padding:11px;border:1px solid rgba(255,255,255,.07);border-radius:16px;background:rgba(0,0,0,.16)}
    .ux-meta-grid span{display:block;color:var(--muted);font-size:11px;font-weight:800;margin-bottom:4px}
    .ux-meta-grid b{display:block;font-size:16px}
    .ux-meta-footer{margin-top:12px;font-size:12px;font-weight:950}.ux-meta-footer.is-pos{color:var(--soft)}.ux-meta-footer.is-neg{color:#fbbf24}
    @media(max-width:520px){.ux-meta-percent{font-size:34px}.ux-regional-meta-card h2{font-size:19px}.ux-meta-grid{grid-template-columns:1fr 1fr;gap:8px}}
  `;
  document.head.appendChild(style);
}

async function loadRegionalDashboard() {
  if (dashboard.loaded || dashboard.loading) return dashboard;
  dashboard.loading = true;
  dashboard.error = '';
  try {
    const authUser = await getCurrentUser().catch(() => null);
    const { data: appUser, error: userError } = await supabase
      .from('app_usuarios')
      .select('id,nome,email,setor,supervisao,coordenacao,status')
      .eq('auth_user_id', authUser?.id || '')
      .maybeSingle();
    if (userError) throw userError;

    const coordenacao = String(appUser?.coordenacao || '').trim();
    const { ano, mes, ini, fim, diaAtual, diasNoMes } = monthWindow();
    if (!coordenacao) {
      dashboard.error = 'Usuário sem regional vinculada em app_usuarios.coordenacao.';
      dashboard.data = { coordenacao: '', ano, mes, meta: 0, produzido: 0, pct: 0, ritmoEsperado: 0, delta: 0, patrimonios: null };
      dashboard.loaded = true;
      return dashboard;
    }

    const prodQuery = supabase
      .from('producao_snapshot')
      .select('data,coordenacao,tons')
      .gte('data', ini)
      .lt('data', fim)
      .eq('coordenacao', coordenacao)
      .order('data', { ascending: true });

    const [metaRes, prodRows, patriTotalRes, patriLateRes] = await Promise.all([
      supabase.from('metas_producao').select('meta_tons,regional').eq('ano', ano).eq('mes', mes).eq('ativo', true),
      fetchAllRows(prodQuery),
      supabase.from('patrimonios_snapshot').select('*', { count: 'exact', head: true }).eq('situacao', 'Ativo').eq('coordenacao', coordenacao),
      supabase.from('patrimonios_snapshot').select('*', { count: 'exact', head: true }).eq('situacao', 'Ativo').eq('coordenacao', coordenacao).gt('dias_sem_leitura', 7),
    ]);

    if (metaRes.error) throw metaRes.error;
    if (patriTotalRes.error) throw patriTotalRes.error;
    if (patriLateRes.error) throw patriLateRes.error;

    const metaRow = (metaRes.data || []).find((row) => sameRegional(row.regional, coordenacao));
    const meta = Number(metaRow?.meta_tons || 0);
    const produzido = prodRows.reduce((sum, row) => sum + Number(row.tons || 0), 0);
    const pct = meta > 0 ? Math.min(100, (produzido / meta) * 100) : 0;
    const ritmoEsperado = meta > 0 ? (meta * diaAtual / diasNoMes) : 0;

    dashboard.data = {
      coordenacao,
      ano,
      mes,
      meta,
      produzido,
      pct,
      ritmoEsperado,
      delta: produzido - ritmoEsperado,
      patrimonios: { total: patriTotalRes.count ?? 0, atrasados: patriLateRes.count ?? 0 },
    };
    dashboard.loaded = true;
  } catch (error) {
    dashboard.error = error?.message || 'Não foi possível carregar a meta da regional.';
    dashboard.data = null;
  } finally {
    dashboard.loading = false;
  }
  return dashboard;
}

function regionalCardHtml() {
  if (dashboard.loading || (!dashboard.loaded && !dashboard.error)) {
    return `<div class="ux-regional-meta-card is-loading"><div class="ux-meta-skeleton"></div><b>Carregando meta da sua regional...</b><span>O App Gestor não exibe o mapa completo.</span></div>`;
  }
  if (dashboard.error || !dashboard.data) {
    return `<div class="ux-regional-meta-card is-warning"><div class="ux-meta-eyebrow">Meta regional</div><h2>Regional não localizada</h2><p>${dashboard.error || 'Não foi possível identificar a regional do usuário.'}</p></div>`;
  }

  const d = dashboard.data;
  const pct = Number(d.pct || 0);
  const progress = Math.max(0, Math.min(100, pct));
  const onTrack = d.produzido >= d.ritmoEsperado;
  const delta = Number(d.delta || 0);
  const patri = d.patrimonios;
  const patriOk = patri ? Math.max(0, Number(patri.total || 0) - Number(patri.atrasados || 0)) : 0;
  const patriPct = patri && patri.total > 0 ? (patriOk / patri.total) * 100 : 100;
  const deltaLabel = `${delta >= 0 ? '+' : '−'}${tons(Math.abs(delta))}`;
  return `
    <div class="ux-regional-meta-card ${onTrack ? 'is-on-track' : 'is-off-track'}">
      <div class="ux-regional-meta-head">
        <div><div class="ux-meta-eyebrow">Meta da sua regional · ${MONTHS[(d.mes || 1) - 1]}/${d.ano}</div><h2>${d.coordenacao || 'Regional'}</h2></div>
        <strong class="ux-meta-percent">${pct.toFixed(0)}%</strong>
      </div>
      <div class="ux-progress" aria-label="${pct.toFixed(0)}% da meta"><span style="width:${progress.toFixed(1)}%"></span></div>
      <div class="ux-meta-grid">
        <div><span>Meta do mês</span><b>${d.meta > 0 ? tons(d.meta) : '—'}</b></div>
        <div><span>Produção atual</span><b>${tons(d.produzido)}</b></div>
        <div><span>Ritmo do dia</span><b>${tons(d.ritmoEsperado)}</b></div>
        <div><span>Leitura patrimônio</span><b>${patri ? `${patriPct.toFixed(0)}%` : '—'}</b></div>
      </div>
      <div class="ux-meta-footer ${onTrack ? 'is-pos' : 'is-neg'}">${onTrack ? 'No ritmo esperado' : 'Abaixo do ritmo'} · ${deltaLabel} vs ritmo</div>
    </div>`;
}

function enforceRegionalDashboard() {
  const main = document.getElementById('appMain');
  if (!main?.querySelector('.db-topbar')) return;

  const nativeCard = main.querySelector('.db-prod-card');
  if (nativeCard) nativeCard.style.display = 'none';

  let mount = main.querySelector('#uxRegionalMetaMount');
  if (!mount) {
    mount = document.createElement('div');
    mount.id = 'uxRegionalMetaMount';
    main.querySelector('.db-topbar')?.insertAdjacentElement('afterend', mount);
  }
  mount.innerHTML = regionalCardHtml();

  if (!dashboard.loaded && !dashboard.loading) {
    loadRegionalDashboard().then(() => enforceRegionalDashboard());
  }
}

function runFixes() {
  injectStyles();
  enforceRegionalDashboard();
}

let scheduled = false;
function scheduleFixes() {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    runFixes();
  });
}

new MutationObserver(scheduleFixes).observe(document.body, { childList: true, subtree: true });
window.addEventListener('load', scheduleFixes);
scheduleFixes();
