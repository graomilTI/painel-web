import { initProtectedPage } from './pageInit.js';
import { supabase } from './supabaseClient.js';

const MONEY = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const DATE = new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC' });

const state = { tab: 'informar', rows: [], lookup: null, loadingLookup: false, userContext: null };

function esc(value) { return String(value ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;'); }
function norm(value) { return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toUpperCase(); }
function plate(value) { return String(value ?? '').toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,7); }
function todayISO(){ const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
function brDate(value){ if(!value) return '-'; const s=String(value).slice(0,10); if(!/^\d{4}-\d{2}-\d{2}$/.test(s)) return esc(value); return DATE.format(new Date(`${s}T00:00:00Z`)); }
function money(value){ return MONEY.format(Number(value || 0)); }
function showMsg(text, type='') { const el=document.getElementById('audMsg'); if(el){ el.textContent=text||''; el.className=`aud-msg ${type}`.trim(); } }

function styles(){ return `<style>
  .aud-hero{display:flex;justify-content:space-between;gap:18px;align-items:flex-start;background:radial-gradient(circle at top right,rgba(34,197,94,.16),transparent 34%),linear-gradient(180deg,rgba(8,22,17,.96),rgba(6,18,14,.96));border:1px solid var(--line);border-radius:28px;padding:24px;box-shadow:var(--shadow)}
  .aud-hero h2{font-size:30px;margin:4px 0 8px}.aud-hero p{margin:0;color:var(--muted)}.aud-kpis{display:grid;grid-template-columns:repeat(3,minmax(120px,1fr));gap:10px;min-width:390px}.aud-kpi{border:1px solid rgba(111,208,165,.18);background:rgba(15,23,42,.65);border-radius:18px;padding:14px}.aud-kpi b{display:block;font-size:25px;color:#dcfce7}.aud-kpi span{display:block;color:var(--muted);font-size:12px;margin-top:4px}
  .aud-panel{margin-top:16px;background:rgba(8,22,17,.72);border:1px solid var(--line);border-radius:24px;padding:18px;box-shadow:var(--shadow-soft)}.aud-tabs{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px}.aud-tab{border:1px solid rgba(111,208,165,.22);background:#15152a;color:#e2e2f0;border-radius:999px;padding:10px 14px;font-weight:900;cursor:pointer}.aud-tab.active{background:rgba(34,197,94,.22);border-color:rgba(111,208,165,.45);color:#dcfce7}
  .aud-grid{display:grid;grid-template-columns:repeat(4,minmax(170px,1fr));gap:12px}.aud-full{grid-column:1/-1}.aud-field label,.aud-field>span{display:block;font-size:12px;color:#dcfce7;font-weight:900;text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px}.aud-field input,.aud-field select,.aud-field textarea{width:100%;box-sizing:border-box;border:1px solid rgba(96,165,250,.22);border-radius:14px;background:#15152a;color:#e2e2f0;padding:11px;color-scheme:dark}.aud-field textarea{min-height:90px;resize:vertical}.aud-field option{background:#0f172a;color:#e5e7eb}.aud-actions{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:14px}.aud-btn{border:1px solid rgba(111,208,165,.22);background:rgba(15,23,42,.78);color:#eef7f2;border-radius:14px;padding:11px 14px;font-weight:900;cursor:pointer}.aud-btn:hover{background:rgba(22,101,52,.28)}.aud-primary{background:#3fa878;color:#04130d}.aud-warn{background:rgba(245,158,11,.15);border-color:rgba(245,158,11,.35);color:#fde68a}.aud-muted{color:var(--muted);font-size:13px}.aud-msg{min-height:20px;color:var(--muted);font-weight:800}.aud-msg.ok{color:#bbf7d0}.aud-msg.err{color:#fecaca}
  .aud-chip{display:inline-flex;align-items:center;border-radius:999px;padding:7px 10px;font-size:12px;font-weight:900;border:1px solid rgba(148,163,184,.18)}.aud-chip.ok{background:rgba(34,197,94,.16);color:#bbf7d0}.aud-chip.warn{background:rgba(234,179,8,.14);color:#fde68a}.aud-chip.neutral{background:rgba(148,163,184,.12);color:#cbd5e1}
  .aud-table-wrap{overflow:auto;border:1px solid var(--line);border-radius:18px;background:#081611}.aud-table{width:100%;min-width:1180px;border-collapse:collapse}.aud-table th,.aud-table td{padding:12px;border-bottom:1px solid rgba(148,163,184,.12);text-align:left;vertical-align:top}.aud-table th{background:rgba(15,23,42,.92);color:#dcfce7;font-size:12px;text-transform:uppercase;letter-spacing:.06em}.aud-table td{color:#e2e2f0}.aud-table small{display:block;color:var(--muted);margin-top:4px}.aud-empty{text-align:center!important;color:var(--muted);padding:22px!important}
  @media(max-width:900px){.aud-hero{display:block}.aud-kpis{min-width:0;margin-top:14px;grid-template-columns:1fr}.aud-grid{grid-template-columns:1fr}}
</style>`; }

function statusChip(value){ const v=norm(value||'ABERTA'); const cls=v==='OK'?'ok':(v.includes('AGRUP')||v.includes('LANC')?'warn':'neutral'); return `<span class="aud-chip ${cls}">${esc(value||'ABERTA')}</span>`; }
function origemChip(value){ const v=norm(value||'EXTERNA'); return `<span class="aud-chip ${v==='INTERNA'?'ok':'warn'}">${esc(v==='INTERNA'?'INTERNA':'EXTERNA')}</span>`; }

async function localizarAuditoria() {
  const placa = plate(document.getElementById('placa')?.value);
  const data = document.getElementById('data_classificacao')?.value;
  if (!placa || !data) { state.lookup = null; renderLookup(); return; }
  state.loadingLookup = true; renderLookup();
  const attempts = [
    supabase.from('operacional_auditoria_colaborador').select('*').eq('placa', placa).eq('data_classificacao', data).limit(1),
    supabase.from('operacional_auditoria_colaborador').select('*').eq('placa', placa).eq('data_evento', data).limit(1),
    supabase.from('relatorio_resultado_diario').select('*').eq('placa', placa).eq('data', data).limit(1),
    supabase.from('programacao_colaboradores').select('*').eq('placa_veiculo', placa).limit(1)
  ];
  const results = await Promise.all(attempts.map(req =>
    req.then(({ data: rows, error }) => (!error && rows?.length) ? rows[0] : null).catch(() => null)
  ));
  const found = results.find(r => r !== null) ?? null;
  state.lookup = found ? { origem: 'INTERNA', row: found } : { origem: 'EXTERNA', row: null };
  state.loadingLookup = false;
  preencherComLookup(); renderLookup();
}

function preencherComLookup(){
  const r = state.lookup?.row; if(!r) return;
  const set=(id,val)=>{ const el=document.getElementById(id); if(el && !el.value && val) el.value=val; };
  set('cliente', r.cliente_final || r.cliente_regional || r.cliente_nacional || r.cliente || r.contratante || '');
  set('os', r.os || r.ordem_servico || r.numero_os || r.operacional_os_id || '');
  set('classificador', r.nome_colaborador || r.classificador || r.colaborador || '');
  set('classificacao_origem', r.resultado_origem || r.resultado || '');
  set('motivo_recusa', r.motivo_recusa || '');
  set('resultado_auditoria', r.resultado_auditoria || r.resultado_recusa || r.resultado || '');
  set('auditor', r.auditor || '');
}

function renderLookup(){
  const el=document.getElementById('lookupBox'); if(!el) return;
  if(state.loadingLookup){ el.innerHTML='<span class="aud-chip neutral">Consultando placa/data...</span>'; return; }
  if(!state.lookup){ el.innerHTML='<span class="aud-chip neutral">Informe placa e data da classificação para validar origem.</span>'; return; }
  const origem=state.lookup.origem;
  el.innerHTML = `${origemChip(origem)} <span class="aud-muted">${origem==='INTERNA'?'Placa/data localizadas no sistema. Cliente, OS e classificador foram sugeridos.':'Não localizei a placa e a data. A solicitação seguirá como EXTERNA.'}</span>`;
}

function formHtml(){ return `<form id="audForm" class="aud-grid">
  <div class="aud-field"><label>Placa</label><input id="placa" maxlength="8" placeholder="ABC1D23" required /></div>
  <div class="aud-field"><label>Data da Classificação</label><input id="data_classificacao" type="date" required /></div>
  <div class="aud-field"><label>Cliente</label><input id="cliente" placeholder="Cliente" /></div>
  <div class="aud-field"><label>OS</label><input id="os" placeholder="Número da OS" /></div>
  <div class="aud-full" id="lookupBox"></div>
  <div class="aud-field"><label>Data da Auditoria</label><input id="data_auditoria" type="date" value="${todayISO()}" required /></div>
  <div class="aud-field"><label>Classificador</label><input id="classificador" placeholder="Nome do classificador" /></div>
  <div class="aud-field"><label>Perderá Bônus do mês?</label><select id="perdera_bonus"><option value="false">Não</option><option value="true">Sim</option></select></div>
  <div class="aud-field"><label>Auditor</label><input id="auditor" placeholder="Nome do auditor" required /></div>
  <div class="aud-field"><label>Valor</label><input id="valor" inputmode="decimal" placeholder="0,00" /></div>
  <div class="aud-field"><label>PIX</label><input id="pix" placeholder="Chave PIX do auditor" /></div>
  <div class="aud-field aud-full"><label>Classificação na Origem</label><input id="classificacao_origem" placeholder="Resultado/classificação na origem" /></div>
  <div class="aud-field aud-full"><label>Motivo da Recusa</label><textarea id="motivo_recusa" placeholder="Descreva o motivo da recusa"></textarea></div>
  <div class="aud-field aud-full"><label>Resultado da Auditoria</label><textarea id="resultado_auditoria" placeholder="Resultado da auditoria"></textarea></div>
  <div class="aud-field aud-full"><label>Observação</label><textarea id="observacao" placeholder="Observações adicionais"></textarea></div>
  <div class="aud-full aud-actions"><button class="aud-btn aud-primary" type="submit">Enviar para Auditoria</button><button class="aud-btn" id="btnLimpar" type="button">Limpar</button><div class="aud-msg" id="audMsg"></div></div>
</form>`; }

async function loadRows(){
  const { data, error } = await supabase.from('auditoria_solicitacoes').select('*').order('created_at',{ascending:false}).limit(100);
  state.rows = error ? [] : (data || []);
}

function acompanhamentoHtml(){
  const rows=state.rows;
  return `<div class="aud-table-wrap"><table class="aud-table"><thead><tr><th>Origem</th><th>Status</th><th>Placa</th><th>Datas</th><th>Cliente / OS</th><th>Classificador</th><th>Auditor</th><th>Valor</th></tr></thead><tbody>${rows.length?rows.map(r=>`<tr><td>${origemChip(r.origem)}</td><td>${statusChip(r.status)}</td><td><strong>${esc(r.placa)}</strong></td><td>Class.: ${brDate(r.data_classificacao)}<small>Aud.: ${brDate(r.data_auditoria)}</small></td><td>${esc(r.cliente||'-')}<small>OS: ${esc(r.os||'-')}</small></td><td>${esc(r.classificador||'-')}</td><td>${esc(r.auditor||'-')}<small>${esc(r.pix||'')}</small></td><td>${money(r.valor)}</td></tr>`).join(''):'<tr><td class="aud-empty" colspan="8">Nenhuma auditoria enviada por enquanto.</td></tr>'}</tbody></table></div>`;
}

function statusHtml(){
  const abertas=state.rows.filter(r=>['SOLICITADA','ABERTA'].includes(norm(r.status))).length;
  const agrupadas=state.rows.filter(r=>norm(r.status)==='AGRUPADA').length;
  const ok=state.rows.filter(r=>norm(r.status)==='OK').length;
  return `<div class="aud-kpis" style="min-width:0;grid-template-columns:repeat(3,minmax(140px,1fr))"><div class="aud-kpi"><b>${abertas}</b><span>Abertas</span></div><div class="aud-kpi"><b>${agrupadas}</b><span>Agrupadas</span></div><div class="aud-kpi"><b>${ok}</b><span>Finalizadas OK</span></div></div><p class="aud-muted" style="margin-top:14px">Auditorias internas podem ser finalizadas em OK sem gerar pagamento. Auditorias externas podem seguir para pagamento individual ou agrupado no módulo Auditoria.</p>${acompanhamentoHtml()}`;
}

async function saveForm(ev){
  ev.preventDefault(); showMsg('Salvando...');
  const val = (id)=>document.getElementById(id)?.value?.trim() || '';
  const payload = {
    origem: state.lookup?.origem || 'EXTERNA', status: 'ABERTA', placa: plate(val('placa')),
    data_classificacao: val('data_classificacao') || null, cliente: val('cliente') || null, os: val('os') || null,
    data_auditoria: val('data_auditoria') || null, classificador: val('classificador') || null,
    perdera_bonus: document.getElementById('perdera_bonus')?.value === 'true', classificacao_origem: val('classificacao_origem') || null,
    motivo_recusa: val('motivo_recusa') || null, resultado_auditoria: val('resultado_auditoria') || null, observacao: val('observacao') || null,
    auditor: val('auditor') || null, valor: Number(String(val('valor')).replace(/\./g,'').replace(',','.')) || 0, pix: val('pix') || null,
    gestor_id: state.userContext?.user?.id || null, gestor: state.userContext?.user?.name || state.userContext?.user?.email || null,
    coordenacao: state.userContext?.user?.coordenacao || state.userContext?.department?.name || null,
    supervisao: state.userContext?.user?.supervisao || null,
    origem_detalhe: state.lookup?.row || null, updated_at: new Date().toISOString()
  };
  if(!payload.placa || !payload.data_classificacao || !payload.data_auditoria || !payload.auditor){ showMsg('Preencha placa, data da classificação, data da auditoria e auditor.', 'err'); return; }
  const { error } = await supabase.from('auditoria_solicitacoes').insert(payload);
  if(error){ showMsg(`${error.message}. Execute a migration de auditoria no Supabase antes de usar.`, 'err'); return; }
  showMsg('Auditoria enviada para o módulo Auditoria.', 'ok');
  document.getElementById('audForm').reset(); state.lookup=null; renderLookup(); await loadRows(); renderActive();
}

function renderActive(){
  const body=document.getElementById('audBody'); if(!body) return;
  body.innerHTML = state.tab==='informar' ? formHtml() : state.tab==='acompanhar' ? acompanhamentoHtml() : statusHtml();
  document.querySelectorAll('.aud-tab').forEach(b=>b.classList.toggle('active', b.dataset.tab===state.tab));
  if(state.tab==='informar'){
    renderLookup();
    document.getElementById('audForm')?.addEventListener('submit', saveForm);
    document.getElementById('btnLimpar')?.addEventListener('click', ()=>{ document.getElementById('audForm').reset(); state.lookup=null; renderLookup(); });
    ['placa','data_classificacao'].forEach(id=>document.getElementById(id)?.addEventListener('change', localizarAuditoria));
    document.getElementById('placa')?.addEventListener('input', (e)=>{ e.target.value=plate(e.target.value); });
  }
}

initProtectedPage('Auditoria', async (content, userContext) => {
  state.userContext = userContext;
  await loadRows();
  const abertas=state.rows.filter(r=>['SOLICITADA','ABERTA'].includes(norm(r.status))).length;
  const internas=state.rows.filter(r=>norm(r.origem)==='INTERNA').length;
  const externas=state.rows.filter(r=>norm(r.origem)!=='INTERNA').length;
  content.innerHTML = `${styles()}<section class="aud-hero"><div><div class="eyebrow">Gestor</div><h2>Auditoria</h2><p>Informe auditorias solicitadas e acompanhe o andamento até lançamento, agrupamento, pagamento ou OK.</p></div><div class="aud-kpis"><div class="aud-kpi"><b>${abertas}</b><span>Abertas</span></div><div class="aud-kpi"><b>${internas}</b><span>Internas</span></div><div class="aud-kpi"><b>${externas}</b><span>Externas</span></div></div></section><section class="aud-panel"><div class="aud-tabs"><button class="aud-tab active" data-tab="informar" type="button">Informar</button><button class="aud-tab" data-tab="acompanhar" type="button">Acompanhar</button><button class="aud-tab" data-tab="status" type="button">Status</button></div><div id="audBody"></div></section>`;
  document.querySelectorAll('.aud-tab').forEach(btn=>btn.addEventListener('click', ()=>{ state.tab=btn.dataset.tab; renderActive(); }));
  renderActive();
});
