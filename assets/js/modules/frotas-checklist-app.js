import { ESTILOS_LISTA, cardFiltro, ligarCards, sincronizarCards, iconBtn } from './frotas-ui-lista.js?v=20261029-frotas-inst87';

// Frotas > Manutenção > Checklist: respostas do checklist preenchido no app da BFleet (formulário de inspeção pré-operacional).
// Dados de frotas_checklist_respostas (sync-bfleet-checklists, a cada 30 min). Cada resposta tem fotos (links), textos e assinatura.
(function () {
  const MODULE_NAME = 'FROTAS_CHECKLIST_APP';
  const LIMITE = 2000;

  const styles = `
    <style>
      .fm-shell{color:#e2e2f0}.fm-head{margin-bottom:18px}.fm-kicker{color:#86efac;text-transform:uppercase;letter-spacing:.14em;font-weight:950;font-size:12px}.fm-title{margin:8px 0 6px;font-size:clamp(24px,2.4vw,34px);letter-spacing:-.04em;color:#f8fafc}.fm-sub{max-width:900px;color:#6b7280;line-height:1.55;margin:0}.fm-card{border:1px solid rgba(148,163,184,.16);border-radius:24px;background:radial-gradient(circle at top left,rgba(34,197,94,.13),transparent 34%),linear-gradient(180deg,rgba(15,23,42,.98),rgba(2,6,23,.98));box-shadow:0 20px 60px rgba(0,0,0,.28);overflow:hidden}.fm-body{padding:18px}.fm-toolbar{display:grid;grid-template-columns:minmax(220px,1fr) auto auto;gap:10px;margin-bottom:14px}.fm-input,.fm-select{width:100%;height:42px;border:1px solid rgba(148,163,184,.18);border-radius:14px;background:#0d0d18;color:#e2e2f0;padding:0 12px;outline:none;color-scheme:dark}.fm-select option{background:#0d0d18;color:#e2e2f0}.fm-btn{border:0;border-radius:14px;min-height:42px;padding:0 14px;font-weight:950;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:8px}.fm-btn.primary{background:linear-gradient(135deg,#16a34a,#22c55e);color:#052e16}.fm-btn.soft{border:1px solid rgba(34,197,94,.24);background:rgba(34,197,94,.12);color:#86efac}.fm-btn.ghost{border:1px solid rgba(148,163,184,.18);background:rgba(15,23,42,.72);color:#cbd5e1}.fm-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin:14px 0}.fm-kpi{border:1px solid rgba(34,197,94,.18);background:rgba(2,6,23,.32);border-radius:14px;padding:12px 14px;min-width:0}.fm-kpi span{display:block;color:#93c5fd;font-size:10px;font-weight:950;letter-spacing:.08em;text-transform:uppercase;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.fm-kpi strong{display:block;margin-top:7px;color:#fff;font-size:22px;line-height:1}.fm-table-wrap{overflow:auto;border:1px solid rgba(148,163,184,.14);border-radius:18px}.fm-table{width:100%;border-collapse:collapse;min-width:1000px}.fm-table th{padding:12px 11px;color:#bfdbfe;font-size:11px;letter-spacing:.1em;text-transform:uppercase;text-align:left;border-bottom:1px solid rgba(148,163,184,.16);background:rgba(2,6,23,.38)}.fm-table td{padding:12px 11px;border-bottom:1px solid rgba(148,163,184,.10);color:#e2e2f0;font-size:13px;vertical-align:top}.fm-table tr:hover td{background:rgba(22,101,52,.08)}.fm-badge{display:inline-flex;align-items:center;gap:6px;border-radius:999px;padding:4px 8px;font-size:10px;font-weight:950;border:1px solid rgba(148,163,184,.18);color:#cbd5e1;background:rgba(15,23,42,.72);white-space:nowrap}.fm-badge.ok{border-color:rgba(34,197,94,.35);background:rgba(22,101,52,.24);color:#bbf7d0}.fm-badge.warn{border-color:rgba(245,158,11,.34);background:rgba(245,158,11,.12);color:#fde68a}.fm-badge.err{border-color:rgba(239,68,68,.34);background:rgba(239,68,68,.12);color:#fecaca}.fm-mini{min-height:32px;border-radius:10px;padding:0 10px;font-size:11px}.fm-form{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin:0 0 16px;padding:14px;border:1px solid rgba(34,197,94,.18);background:rgba(2,6,23,.32);border-radius:18px}.fm-field label{display:block;margin:0 0 6px;color:#bbf7d0;font-size:11px;font-weight:950;text-transform:uppercase;letter-spacing:.08em}.fm-field.full{grid-column:1/-1}.fm-field textarea{width:100%;min-height:68px;resize:vertical;border:1px solid rgba(148,163,184,.18);border-radius:14px;background:#0d0d18;color:#e2e2f0;padding:12px;outline:none}.fm-note{margin-top:12px;padding:12px 14px;border:1px dashed rgba(34,197,94,.28);border-radius:16px;background:rgba(2,6,23,.26);color:#bfdbfe;font-size:12px;line-height:1.5}.fm-empty{text-align:center;color:#f8fafc;padding:26px!important;font-weight:850}.fm-toast{position:fixed;right:22px;bottom:22px;z-index:9999;border:1px solid rgba(134,239,172,.32);background:rgba(22,101,52,.96);color:#dcfce7;border-radius:16px;padding:12px 14px;font-weight:950;box-shadow:0 16px 45px rgba(0,0,0,.35);opacity:0;transform:translateY(10px);pointer-events:none;transition:.2s ease}.fm-toast.show{opacity:1;transform:translateY(0)}.fm-itens{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.fm-item-row{display:flex;align-items:center;gap:8px;border:1px solid rgba(148,163,184,.14);border-radius:12px;padding:8px 10px;background:rgba(2,6,23,.28)}.fm-item-row span{flex:1;font-size:12px;color:#e2e2f0}.fm-item-row select{width:120px;height:34px;border-radius:10px;border:1px solid rgba(148,163,184,.18);background:#0d0d18;color:#e2e2f0;font-size:11px}@media(max-width:1200px){.fm-toolbar{grid-template-columns:1fr 1fr}.fm-grid{grid-template-columns:repeat(2,1fr)}.fm-form{grid-template-columns:repeat(2,1fr)}.fm-itens{grid-template-columns:1fr}}@media(max-width:680px){.fm-toolbar,.fm-grid,.fm-form{grid-template-columns:1fr}}
      ${ESTILOS_LISTA}
      .ck-foto-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px}
      .ck-foto{display:block;border:1px solid rgba(148,163,184,.2);border-radius:12px;overflow:hidden;background:#0d0d18}
      .ck-foto img{display:block;width:100%;height:120px;object-fit:cover;background:#0b1224}
      .ck-item{margin:0 0 16px}.ck-item h4{margin:0 0 8px;color:#bbf7d0;font-size:12px;letter-spacing:.08em;text-transform:uppercase}
      .ck-texto{border:1px solid rgba(148,163,184,.18);border-radius:12px;padding:10px 12px;background:rgba(2,6,23,.4);white-space:pre-wrap;line-height:1.45}
      .ck-assinatura img{max-width:260px;background:#fff;border-radius:10px;padding:6px}
      .ck-overlay{position:fixed;inset:0;z-index:9000;background:rgba(2,6,23,.78);display:flex;align-items:flex-start;justify-content:center;padding:24px 14px;overflow:auto}
      .ck-janela{width:min(980px,100%);border:1px solid rgba(148,163,184,.2);border-radius:20px;background:linear-gradient(180deg,#0f172a,#020617);box-shadow:0 24px 70px rgba(0,0,0,.5);color:#e2e2f0}
      .ck-janela-topo{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:18px 20px;border-bottom:1px solid rgba(148,163,184,.14)}
      .ck-janela-topo h3{margin:0 0 4px;font-size:20px;color:#f8fafc}.ck-janela-topo small{color:#94a3b8}
      .ck-janela-corpo{padding:18px 20px 22px}
      .ck-datas{display:flex;gap:8px;align-items:center}.ck-datas .fm-input{width:150px}
      .fm-sort{appearance:none;border:0;background:transparent;color:inherit;font:inherit;font-weight:950;text-transform:uppercase;letter-spacing:.1em;cursor:pointer;padding:0;display:inline-flex;align-items:center;gap:6px}.fm-sort:hover{color:#fff}.fm-sort-mark{font-size:10px;color:#86efac}
    </style>`;

  const state = { registros: [], veiculos: new Map(), filtro: 'todos', busca: '', de: '', ate: '', loading: false, sortKey: 'data', sortDir: 'desc' };

  function esc(v){ return String(v ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;'}[c])); }
  function norm(v){ return String(v||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase(); }
  function toast(msg, error=false){ let el=document.querySelector('.fm-toast'); if(!el){el=document.createElement('div');el.className='fm-toast';document.body.appendChild(el);} el.textContent=msg; el.style.background=error?'rgba(127,29,29,.96)':'rgba(22,101,52,.96)'; el.classList.add('show'); setTimeout(()=>el.classList.remove('show'),3600); }
  function fmtDateBr(iso){ const m=String(iso||'').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[3]}/${m[2]}/${m[1]}` : '—'; }
  function fmtHora(h){ const m=String(h||'').match(/^(\d{2}):(\d{2})/); return m ? `${m[1]}:${m[2]}` : ''; }
  function formatarPlaca(p){ const s=String(p||''); return /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(s) ? `${s.slice(0,3)}-${s.slice(3)}` : (s || '—'); }
  function hojeIso(){ const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset()*60000).toISOString().slice(0,10); }
  function somaDias(iso, n){ const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate()+n); return d.toISOString().slice(0,10); }

  const itens = (r) => Array.isArray(r.itens) ? r.itens : [];
  const textosDe = (r) => itens(r).filter(i => i.tipo === 'texto' && !/placa/i.test(i.rotulo || '') && i.valor);

  const FILTROS = {
    todos: () => true,
    hoje: (r) => r.data_execucao === hojeIso(),
    semana: (r) => r.data_execucao >= somaDias(hojeIso(), -6),
    fora_cadastro: (r) => !r.veiculo_id,
  };

  // Colunas ordenáveis. Empate sempre pelo mais recente.
  const ORDEM = {
    data: (r) => `${r.data_execucao || ''} ${r.hora_execucao || ''}`,
    veiculo: (r) => String(r.placa || ''),
    motorista: (r) => String(r.motorista || ''),
    fotos: (r) => Number(r.total_fotos) || 0,
    obs: (r) => textosDe(r).map(t => t.valor).join(' '),
    assinatura: (r) => (r.tem_assinatura ? 1 : 0),
  };

  function compareRows(a, b){
    const f = ORDEM[state.sortKey] || ORDEM.data;
    const av = f(a), bv = f(b);
    let r = typeof av === 'number' ? av - bv : String(av).localeCompare(String(bv), 'pt-BR', { numeric: true, sensitivity: 'base' });
    if(r === 0 && state.sortKey !== 'data') return ORDEM.data(b).localeCompare(ORDEM.data(a));
    return state.sortDir === 'asc' ? r : -r;
  }

  function markFor(key){
    if(state.sortKey !== key) return '';
    return `<span class="fm-sort-mark">${state.sortDir === 'asc' ? '▲' : '▼'}</span>`;
  }

  function refreshSortHeaders(root){
    root.querySelectorAll('[data-sort]').forEach(btn => { btn.innerHTML = `${btn.dataset.label} ${markFor(btn.dataset.sort)}`; });
  }

  function bindSort(root){
    root.querySelectorAll('[data-sort]').forEach(btn => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.sort;
        if(state.sortKey === key) state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
        else { state.sortKey = key; state.sortDir = key === 'data' || key === 'fotos' ? 'desc' : 'asc'; }
        renderTable(root);
      });
    });
  }

  function getFiltered(){
    const busca = norm(state.busca);
    let rows = state.registros.filter(FILTROS[state.filtro] || FILTROS.todos);
    if(state.de) rows = rows.filter(r => r.data_execucao >= state.de);
    if(state.ate) rows = rows.filter(r => r.data_execucao <= state.ate);
    if(busca) rows = rows.filter(r => norm([r.placa, r.placa_digitada, r.motorista, r.folio, state.veiculos.get(r.veiculo_id)?.marca_modelo].join(' ')).includes(busca));
    return [...rows].sort(compareRows);
  }

  async function carregar(root, opts){
    state.loading = true; renderTable(root);
    const [veic, resp] = await Promise.all([
      opts.supabase.from('frotas_veiculos').select('id,placa,marca_modelo'),
      opts.supabase.from('frotas_checklist_respostas').select('*').order('data_execucao', { ascending: false }).order('hora_execucao', { ascending: false }).limit(LIMITE),
    ]);
    state.veiculos = new Map((veic.data || []).map(v => [v.id, v]));
    if(resp.error){ toast(resp.error.message || 'Erro ao carregar os checklists.', true); state.registros = []; }
    else state.registros = resp.data || [];
    state.loading = false; renderStats(root); renderTable(root);
  }

  async function buscarNaBfleet(root, opts, btn){
    btn.disabled = true; const antes = btn.textContent; btn.textContent = 'Buscando…';
    try {
      const { data, error } = await opts.supabase.functions.invoke('sync-bfleet-checklists', { body: { inicio: somaDias(hojeIso(), -14), fim: somaDias(hojeIso(), 1) } });
      if(error) throw new Error((await error.context?.text?.().catch(() => ''))?.slice(0, 200) || error.message);
      if(data?.ok === false) throw new Error(data.error || 'A BFleet não respondeu.');
      toast(`${data.recebidas} resposta(s) na BFleet, ${data.novas} nova(s).`);
      await carregar(root, opts);
    } catch(err){
      toast(err.message || 'Não foi possível buscar na BFleet.', true);
    } finally { btn.disabled = false; btn.textContent = antes; }
  }

  function renderStats(root){
    const set = (k, v) => { const el = root.querySelector(`[data-kpi-${k}]`); if(el) el.textContent = v; };
    set('total', state.registros.length);
    set('hoje', state.registros.filter(FILTROS.hoje).length);
    set('semana', state.registros.filter(FILTROS.semana).length);
    set('fora', state.registros.filter(FILTROS.fora_cadastro).length);
  }

  function renderTable(root){
    const tbody = root.querySelector('[data-registros-table]'); if(!tbody) return;
    refreshSortHeaders(root);
    if(state.loading){ tbody.innerHTML = '<tr><td colspan="7" class="fm-empty">Carregando checklists...</td></tr>'; return; }
    const rows = getFiltered();
    root.querySelector('[data-count]').textContent = `${rows.length} de ${state.registros.length} checklist(s)`;
    if(!rows.length){ tbody.innerHTML = '<tr><td colspan="7" class="fm-empty">Nenhum checklist encontrado com esse filtro.</td></tr>'; return; }
    tbody.innerHTML = rows.map(r => {
      const v = state.veiculos.get(r.veiculo_id);
      const textos = textosDe(r).map(t => `<small><b>${esc(t.rotulo)}:</b> ${esc(String(t.valor).slice(0, 60))}</small>`).join('<br>');
      return `
      <tr>
        <td>${fmtDateBr(r.data_execucao)}<br><small>${esc(fmtHora(r.hora_execucao))}${r.folio ? ` · nº ${esc(r.folio)}` : ''}</small></td>
        <td><strong>${esc(formatarPlaca(r.placa))}</strong>${r.placa_aproximada ? ` <span class="fm-badge warn" title="O motorista digitou ${esc(r.placa_original || '')}. O painel ligou à placa mais parecida do cadastro (1 caractere de diferença).">Placa corrigida</span>` : ''}${v?.marca_modelo ? `<br><small>${esc(v.marca_modelo)}</small>` : (r.veiculo_id ? '' : '<br><span class="fm-badge warn" title="A placa não está em Frotas > Veículos.">Fora do cadastro</span>')}</td>
        <td>${esc(r.motorista || '—')}</td>
        <td><span class="fm-badge ${r.total_fotos ? 'ok' : 'warn'}">${r.total_fotos || 0} foto(s)</span></td>
        <td class="fm-cell">${textos || '—'}</td>
        <td>${r.tem_assinatura ? '<span class="fm-badge ok">✓ Assinado</span>' : '<span class="fm-badge warn">Sem assinatura</span>'}</td>
        <td><div class="fm-actions">${iconBtn('data-ver', r.id, '', 'Ver fotos e respostas', 'ver')}</div></td>
      </tr>`;
    }).join('');
    tbody.querySelectorAll('[data-ver]').forEach(btn => btn.addEventListener('click', () => abrirDetalhe(state.registros.find(r => r.id === btn.dataset.ver))));
  }

  function fotoHtml(url, rotulo){
    return `<a class="ck-foto" href="${esc(url)}" target="_blank" rel="noopener noreferrer" title="Abrir ${esc(rotulo)} em tamanho real"><img src="${esc(url)}" alt="${esc(rotulo)}" loading="lazy"></a>`;
  }

  function itemHtml(i){
    if(i.tipo === 'foto') return `<div class="ck-item"><h4>${esc(i.rotulo)}</h4><div class="ck-foto-grid">${(i.urls || []).map(u => fotoHtml(u, i.rotulo)).join('')}</div></div>`;
    if(i.tipo === 'assinatura') return `<div class="ck-item ck-assinatura"><h4>${esc(i.rotulo)}</h4>${(i.urls || []).map(u => `<a href="${esc(u)}" target="_blank" rel="noopener noreferrer"><img src="${esc(u)}" alt="Assinatura" loading="lazy"></a>`).join('')}</div>`;
    return `<div class="ck-item"><h4>${esc(i.rotulo)}</h4><div class="ck-texto">${esc(i.valor)}</div></div>`;
  }

  function abrirDetalhe(r){
    if(!r) return;
    const v = state.veiculos.get(r.veiculo_id);
    const mapa = r.latitude != null && r.longitude != null ? ` · <a href="https://www.google.com/maps?q=${esc(r.latitude)},${esc(r.longitude)}" target="_blank" rel="noopener noreferrer">ver local</a>` : '';
    const el = document.createElement('div');
    el.className = 'ck-overlay';
    el.innerHTML = `<div class="ck-janela" role="dialog" aria-modal="true"><div class="ck-janela-topo"><div><h3>${esc(formatarPlaca(r.placa))}${v?.marca_modelo ? ` · ${esc(v.marca_modelo)}` : ''}</h3>${r.placa_aproximada ? `<small>Placa digitada: ${esc(r.placa_original || '')} (corrigida pela mais parecida do cadastro)</small><br>` : ''}<small>${fmtDateBr(r.data_execucao)} ${esc(fmtHora(r.hora_execucao))} · ${esc(r.motorista || 'Motorista não informado')}${r.folio ? ` · nº ${esc(r.folio)}` : ''}${mapa}</small></div><button type="button" class="fm-btn ghost" data-fechar>✕ Fechar</button></div><div class="ck-janela-corpo">${itens(r).map(itemHtml).join('') || '<p>Esta resposta não trouxe itens.</p>'}</div></div>`;
    const aoTecla = (e) => { if(e.key === 'Escape') fechar(); };
    const fechar = () => { document.removeEventListener('keydown', aoTecla); el.remove(); };
    el.addEventListener('click', (e) => { if(e.target === el || e.target.closest('[data-fechar]')) fechar(); });
    document.addEventListener('keydown', aoTecla);
    document.body.appendChild(el);
  }

  function openHome(container, opts = {}){
    container.innerHTML = `${styles}<section class="fm-shell"><div class="fm-topo"><div class="fm-head-actions"><button class="fm-btn soft" type="button" data-refresh>↻ Atualizar</button><button class="fm-btn ghost" type="button" data-buscar title="Busca na BFleet as respostas dos últimos 14 dias (o painel já faz isso sozinho a cada 30 minutos)">Buscar na BFleet</button></div></div><div class="fm-kpis">${cardFiltro({ filtro: 'todos', tone: 'blue', icone: 'total', label: 'Total', kpi: 'data-kpi-total', valor: '0', dica: 'Todos os checklists recebidos do app' })}${cardFiltro({ filtro: 'hoje', tone: 'green', icone: 'calendario', label: 'Hoje', kpi: 'data-kpi-hoje', valor: '0', dica: 'Checklists feitos hoje' })}${cardFiltro({ filtro: 'semana', tone: 'green', icone: 'relogio', label: 'Últimos 7 dias', kpi: 'data-kpi-semana', valor: '0', dica: 'Checklists dos últimos 7 dias' })}${cardFiltro({ filtro: 'fora_cadastro', tone: 'amber', icone: 'alerta', label: 'Placa fora do cadastro', kpi: 'data-kpi-fora', valor: '0', dica: 'A placa informada não está em Frotas > Veículos' })}</div><div class="fm-card"><div class="fm-body"><div class="fm-bar"><div class="fm-search"><input class="fm-input" placeholder="Buscar por placa, motorista ou número..." data-search></div><div class="ck-datas"><input class="fm-input" type="date" data-de title="De"><span>até</span><input class="fm-input" type="date" data-ate title="Até"></div><span data-chip></span><span class="fm-count" data-count>0 checklist(s)</span></div><div class="fm-table-wrap"><table class="fm-table"><thead><tr>${[['data','Data'],['veiculo','Veículo'],['motorista','Motorista'],['fotos','Fotos'],['obs','Observações'],['assinatura','Assinatura']].map(([k, l]) => `<th><button class="fm-sort" type="button" data-sort="${k}" data-label="${l}">${l}</button></th>`).join('')}<th style="width:1%">Ver</th></tr></thead><tbody data-registros-table></tbody></table></div><div class="fm-note">Checklists preenchidos pelos motoristas no app da BFleet, com as fotos de cada item. As fotos ficam no servidor da BFleet; o painel guarda os links.</div></div></div></section>`;

    ligarCards(container, { obter: () => state.filtro, definir: (f) => { state.filtro = f; }, aoMudar: () => renderTable(container) });
    sincronizarCards(container, state.filtro);
    bindSort(container);
    container.querySelector('[data-refresh]')?.addEventListener('click', () => carregar(container, opts));
    container.querySelector('[data-buscar]')?.addEventListener('click', (e) => buscarNaBfleet(container, opts, e.currentTarget));
    container.querySelector('[data-search]')?.addEventListener('input', (e) => { state.busca = e.target.value; renderTable(container); });
    container.querySelector('[data-de]')?.addEventListener('change', (e) => { state.de = e.target.value; renderTable(container); });
    container.querySelector('[data-ate]')?.addEventListener('change', (e) => { state.ate = e.target.value; renderTable(container); });
    carregar(container, opts);
  }

  window[MODULE_NAME] = window[MODULE_NAME] || {};
  window[MODULE_NAME].openHome = openHome;
})();
