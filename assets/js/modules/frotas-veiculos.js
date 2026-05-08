(function () {
  const MODULE_NAME = 'FROTAS_VEICULOS';
  const MONEY_FMT = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

  const styles = `
    <style>
      .fv-shell{color:#e5e7eb}.fv-head{margin-bottom:18px}.fv-kicker{color:#86efac;text-transform:uppercase;letter-spacing:.14em;font-weight:950;font-size:12px}.fv-title{margin:8px 0 6px;font-size:clamp(24px,2.4vw,34px);letter-spacing:-.04em;color:#f8fafc}.fv-sub{max-width:1000px;color:#94a3b8;line-height:1.55;margin:0}.fv-card{border:1px solid rgba(148,163,184,.16);border-radius:24px;background:radial-gradient(circle at top left,rgba(34,197,94,.13),transparent 34%),linear-gradient(180deg,rgba(15,23,42,.98),rgba(2,6,23,.98));box-shadow:0 20px 60px rgba(0,0,0,.28);overflow:hidden}.fv-tabs{display:flex;gap:10px;flex-wrap:wrap;padding:14px;border-bottom:1px solid rgba(148,163,184,.12);background:rgba(2,6,23,.36)}.fv-tab{border:1px solid rgba(148,163,184,.18);background:rgba(15,23,42,.72);color:#cbd5e1;border-radius:999px;padding:10px 14px;font-weight:950;cursor:pointer}.fv-tab.active,.fv-tab:hover{border-color:rgba(34,197,94,.55);background:rgba(22,101,52,.35);color:#f8fafc}.fv-body{padding:18px}.fv-toolbar{display:grid;grid-template-columns:minmax(220px,1fr) 190px auto auto auto;gap:10px;margin-bottom:14px}.fv-input,.fv-select{width:100%;height:42px;border:1px solid rgba(148,163,184,.18);border-radius:14px;background:#0f172a;color:#e5e7eb;padding:0 12px;outline:none;color-scheme:dark}.fv-select option{background:#0f172a;color:#e5e7eb}.fv-btn{border:0;border-radius:14px;min-height:42px;padding:0 14px;font-weight:950;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:8px}.fv-btn.primary{background:linear-gradient(135deg,#16a34a,#22c55e);color:#052e16}.fv-btn.soft{border:1px solid rgba(34,197,94,.24);background:rgba(34,197,94,.12);color:#86efac}.fv-btn.ghost{border:1px solid rgba(148,163,184,.18);background:rgba(15,23,42,.72);color:#cbd5e1}.fv-btn.warn{border:1px solid rgba(245,158,11,.28);background:rgba(245,158,11,.12);color:#fde68a}.fv-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:12px;margin:14px 0}.fv-kpi{border:1px solid rgba(34,197,94,.18);background:rgba(2,6,23,.32);border-radius:18px;padding:14px}.fv-kpi span{display:block;color:#93c5fd;font-size:11px;font-weight:950;letter-spacing:.1em;text-transform:uppercase}.fv-kpi strong{display:block;margin-top:8px;color:#fff;font-size:24px}.fv-table-wrap{overflow:auto;border:1px solid rgba(148,163,184,.14);border-radius:18px}.fv-table{width:100%;border-collapse:collapse;min-width:1280px}.fv-table th{padding:12px 11px;color:#bfdbfe;font-size:11px;letter-spacing:.1em;text-transform:uppercase;text-align:left;border-bottom:1px solid rgba(148,163,184,.16);background:rgba(2,6,23,.38)}.fv-table td{padding:12px 11px;border-bottom:1px solid rgba(148,163,184,.10);color:#e5e7eb;font-size:13px;vertical-align:top}.fv-table tr:hover td{background:rgba(22,101,52,.08)}.fv-badge{display:inline-flex;align-items:center;gap:6px;border-radius:999px;padding:4px 8px;font-size:10px;font-weight:950;border:1px solid rgba(148,163,184,.18);color:#cbd5e1;background:rgba(15,23,42,.72);white-space:nowrap;margin:2px 4px 2px 0}.fv-badge.ok{border-color:rgba(34,197,94,.35);background:rgba(22,101,52,.24);color:#bbf7d0}.fv-badge.warn{border-color:rgba(245,158,11,.34);background:rgba(245,158,11,.12);color:#fde68a}.fv-badge.err{border-color:rgba(239,68,68,.34);background:rgba(239,68,68,.12);color:#fecaca}.fv-actions{display:flex;gap:8px;flex-wrap:wrap}.fv-mini{min-height:32px;border-radius:10px;padding:0 10px;font-size:11px}.fv-form{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin:0 0 16px;padding:14px;border:1px solid rgba(34,197,94,.18);background:rgba(2,6,23,.32);border-radius:18px}.fv-field label{display:block;margin:0 0 6px;color:#bbf7d0;font-size:11px;font-weight:950;text-transform:uppercase;letter-spacing:.08em}.fv-field.full{grid-column:1/-1}.fv-field textarea{width:100%;min-height:68px;resize:vertical;border:1px solid rgba(148,163,184,.18);border-radius:14px;background:#0f172a;color:#e5e7eb;padding:12px;outline:none}.fv-note{margin-top:12px;padding:12px 14px;border:1px dashed rgba(34,197,94,.28);border-radius:16px;background:rgba(2,6,23,.26);color:#bfdbfe;font-size:12px;line-height:1.5}.fv-empty{text-align:center;color:#f8fafc;padding:26px!important;font-weight:850}.fv-toast{position:fixed;right:22px;bottom:22px;z-index:9999;border:1px solid rgba(134,239,172,.32);background:rgba(22,101,52,.96);color:#dcfce7;border-radius:16px;padding:12px 14px;font-weight:950;box-shadow:0 16px 45px rgba(0,0,0,.35);opacity:0;transform:translateY(10px);pointer-events:none;transition:.2s ease}.fv-toast.show{opacity:1;transform:translateY(0)}@media(max-width:1200px){.fv-toolbar{grid-template-columns:1fr 1fr}.fv-grid{grid-template-columns:repeat(2,1fr)}.fv-form{grid-template-columns:repeat(2,1fr)}}@media(max-width:680px){.fv-toolbar,.fv-grid,.fv-form{grid-template-columns:1fr}}
    </style>`;

  const state = { veiculos: [], loading: false, filtro: 'todos', busca: '' };

  function onlyPlate(v){ return String(v||'').toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,7); }
  function onlyDigits(v){ return String(v||'').replace(/\D/g,''); }
  function norm(v){ return String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase(); }
  function esc(v){ return String(v ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;'}[c])); }
  function num(v){ const n=Number(v); return Number.isFinite(n)?n:null; }
  function fmtMoney(v){ const n=Number(v||0); return MONEY_FMT.format(Number.isFinite(n)?n:0); }
  function panelPath(slug){ return (window.AppPaths?.toPanelUrl ? window.AppPaths.toPanelUrl(slug) : `./${slug}.html`); }
  function toast(msg, error=false){ let el=document.querySelector('.fv-toast'); if(!el){el=document.createElement('div');el.className='fv-toast';document.body.appendChild(el);} el.textContent=msg; el.style.background=error?'rgba(127,29,29,.96)':'rgba(22,101,52,.96)'; el.classList.add('show'); setTimeout(()=>el.classList.remove('show'),3600); }

  function statusBadge(v){
    const detranOk = v?.detran_confirmado || String(v?.detran_status||'').toUpperCase()==='CONFIRMADO';
    const detran = detranOk ? '<span class="fv-badge ok">✓ DETRAN</span>' : '<span class="fv-badge warn">Pendente DETRAN</span>';
    const rastreador = v?.possui_rastreador || v?.bfleet_idgps ? '<span class="fv-badge ok">✅ Rastreador</span>' : '<span class="fv-badge warn">Sem rastreador</span>';
    return `${detran}${rastreador}`;
  }

  function condutorBadge(v){
    const patrimonio = v?.condutor_patrimonio || v?.motorista_atual || '';
    const bfleet = v?.bfleet_condutor || '';
    if (v?.condutor_divergente) return '<span class="fv-badge warn">⚠️ Condutor divergente</span>';
    if (patrimonio && bfleet) return '<span class="fv-badge ok">✅ Condutor OK</span>';
    if (patrimonio && !bfleet) return '<span class="fv-badge warn">Atualizar BFleet</span>';
    return '<span class="fv-badge">Sem condutor</span>';
  }

  function getFiltered(){
    const busca=norm(state.busca);
    return (state.veiculos||[]).filter(v=>{
      const detranOk = v.detran_confirmado || String(v.detran_status||'').toUpperCase()==='CONFIRMADO';
      const rastreador = !!(v.possui_rastreador || v.bfleet_idgps);
      if(state.filtro==='detran' && !detranOk) return false;
      if(state.filtro==='pendentes' && detranOk) return false;
      if(state.filtro==='sem_renavam' && (v.renavam && String(v.renavam).replace(/\D/g,'') !== '0')) return false;
      if(state.filtro==='rastreador' && !rastreador) return false;
      if(state.filtro==='sem_rastreador' && rastreador) return false;
      if(state.filtro==='condutor_divergente' && !v.condutor_divergente) return false;
      if(!busca) return true;
      return norm([v.placa,v.renavam,v.marca,v.modelo,v.empresa,v.motorista_atual,v.condutor_patrimonio,v.bfleet_condutor,v.coordenacao,v.supervisao].join(' ')).includes(busca);
    });
  }

  async function loadVeiculos(root, opts){
    state.loading=true; renderTable(root, opts);
    const { data, error } = await opts.supabase.from('frotas_veiculos').select('*').order('placa',{ascending:true});
    if(error){ toast(error.message || 'Erro ao carregar veículos.', true); state.veiculos=[]; }
    else state.veiculos=Array.isArray(data)?data:[];
    state.loading=false; renderStats(root); renderTable(root, opts);
  }

  function readForm(root){
    const form=root.querySelector('[data-veiculo-form]');
    const get=(k)=>form?.querySelector(`[name="${k}"]`)?.value ?? '';
    return {
      placa: onlyPlate(get('placa')),
      renavam: onlyDigits(get('renavam')) || null,
      nome: get('nome').trim() || null,
      empresa: get('empresa').trim() || null,
      cnpj: onlyDigits(get('cnpj')) || null,
      marca: get('marca').trim() || null,
      modelo: get('modelo').trim() || null,
      cor: get('cor').trim() || null,
      ano: num(get('ano')),
      tipo: get('tipo').trim() || null,
      coordenacao: get('coordenacao').trim() || null,
      supervisao: get('supervisao').trim() || null,
      motorista_atual: get('motorista_atual').trim() || null,
      condutor_patrimonio: get('motorista_atual').trim() || null,
      hodometro: num(get('hodometro')),
      valor_mensal: num(get('valor_mensal')),
      dia_vencimento: num(get('dia_vencimento')),
      valor_km: num(get('valor_km')),
      status: get('status') || 'ATIVO',
      observacoes: get('observacoes').trim() || null,
      origem_importacao: 'painel'
    };
  }

  function fillForm(root, v){
    const form=root.querySelector('[data-veiculo-form]'); if(!form) return;
    const set=(k,val)=>{ const input=form.querySelector(`[name="${k}"]`); if(input) input.value=val ?? ''; };
    ['placa','renavam','nome','empresa','cnpj','marca','modelo','cor','ano','tipo','coordenacao','supervisao','motorista_atual','hodometro','valor_mensal','dia_vencimento','valor_km','status','observacoes'].forEach(k=>set(k,v?.[k]));
    form.scrollIntoView({behavior:'smooth',block:'center'});
  }

  async function saveVeiculo(root, opts){
    const payload=readForm(root);
    if(!payload.placa) return toast('Informe a placa do veículo.', true);
    const { error } = await opts.supabase.from('frotas_veiculos').upsert(payload,{onConflict:'placa'});
    if(error) return toast(error.message || 'Erro ao salvar veículo.', true);
    toast('Veículo salvo.');
    root.querySelector('[data-veiculo-form]')?.reset();
    await loadVeiculos(root, opts);
  }

  async function extractFunctionError(error){
    if(!error) return '';
    const base = error.message || '';
    const ctx = error.context;
    if(ctx && typeof ctx.clone === 'function'){
      try{ const payload = await ctx.clone().json(); const msg = payload?.error || payload?.message || JSON.stringify(payload); if(msg) return msg; }catch(_){ try{ const text = await ctx.clone().text(); if(text) return text.slice(0, 800); }catch(__){} }
    }
    return base || 'Erro na Edge Function.';
  }

  async function callFunction(opts, name, body){
    const { data, error } = await opts.supabase.functions.invoke(name, { body });
    if(error) throw new Error(await extractFunctionError(error));
    if(data && data.error) throw new Error(data.error);
    return data;
  }

  async function confirmarDetran(root, opts, v){
    if(!v) return;
    try{
      toast(`Consultando DETRAN para ${v.placa}...`);
      const data = await callFunction(opts, 'sync-veiculos-detran', { mode:'single', veiculo_id:v.id, placa:v.placa, renavam:v.renavam, empresa:v.empresa, cnpj:v.cnpj });
      if(data?.confirmed || data?.ok){
        await opts.supabase.from('frotas_veiculos').update({ detran_confirmado:true, detran_status:'CONFIRMADO', detran_mensagem:'Confirmado via Edge Function', detran_ultima_consulta_em:new Date().toISOString(), detran_raw:data || {} }).eq('id', v.id);
        toast('Veículo confirmado no DETRAN.');
        await loadVeiculos(root, opts);
      }else toast(data?.message || 'Consulta concluída, mas o veículo não foi confirmado.', true);
    }catch(err){ toast(err.message || 'Erro ao consultar DETRAN.', true); }
  }

  async function sincronizarFrota(root, opts){
    try{ toast('Sincronizando frota DETRAN...'); await callFunction(opts, 'sync-veiculos-detran', { mode:'all' }); toast('Sincronização DETRAN concluída.'); await loadVeiculos(root, opts); }
    catch(err){ toast(err.message || 'Erro ao sincronizar frota.', true); }
  }

  async function sincronizarBfleet(root, opts){
    try{ toast('Sincronizando veículos rastreados BFleet...'); const data = await callFunction(opts, 'sync-bfleet', { action:'sync_vehicles' }); toast(`BFleet sincronizado: ${data?.updated || 0} veículo(s) atualizado(s).`); await loadVeiculos(root, opts); }
    catch(err){ toast(err.message || 'Erro ao sincronizar BFleet.', true); }
  }

  async function atualizarCondutores(root, opts){
    try{ toast('Atualizando condutores divergentes no BFleet...'); const data = await callFunction(opts, 'sync-bfleet', { action:'sync_drivers' }); toast(`Condutores BFleet: ${data?.created || 0} criado(s), ${data?.updated || 0} atualizado(s), ${data?.skipped || 0} ignorado(s).`); await loadVeiculos(root, opts); }
    catch(err){ toast(err.message || 'Erro ao atualizar condutores no BFleet.', true); }
  }

  async function consultarMultas(root, opts, v){
    if(!v) return;
    try{ toast(`Consultando multas de ${v.placa}...`); await callFunction(opts, 'sync-multas-detran', { placa:v.placa, renavam:v.renavam, veiculo_id:v.id, empresa:v.empresa, cnpj:v.cnpj }); toast('Consulta de multas concluída.'); window.location.assign(panelPath('frotas-multas')); }
    catch(err){ toast(err.message || 'Erro ao consultar multas.', true); }
  }

  function renderStats(root){
    const total=state.veiculos.length;
    const ok=state.veiculos.filter(v=>v.detran_confirmado || String(v.detran_status||'').toUpperCase()==='CONFIRMADO').length;
    const rastreador=state.veiculos.filter(v=>v.possui_rastreador || v.bfleet_idgps).length;
    const divergentes=state.veiculos.filter(v=>v.condutor_divergente).length;
    const semRenavam=state.veiculos.filter(v=>!v.renavam || String(v.renavam).replace(/\D/g,'')==='0').length;
    root.querySelector('[data-kpi-total]').textContent=total;
    root.querySelector('[data-kpi-detran]').textContent=ok;
    root.querySelector('[data-kpi-rastreador]').textContent=rastreador;
    root.querySelector('[data-kpi-divergentes]').textContent=divergentes;
    root.querySelector('[data-kpi-sem-renavam]').textContent=semRenavam;
  }

  function renderTable(root, opts){
    const tbody=root.querySelector('[data-veiculos-table]'); if(!tbody) return;
    const rows=getFiltered();
    const count=root.querySelector('[data-count]'); if(count) count.textContent=`${rows.length} veículo(s) encontrado(s)`;
    if(state.loading){ tbody.innerHTML='<tr><td class="fv-empty" colspan="10">Carregando...</td></tr>'; return; }
    if(!rows.length){ tbody.innerHTML='<tr><td class="fv-empty" colspan="10">Nenhum veículo encontrado.</td></tr>'; return; }
    tbody.innerHTML=rows.map(v=>{
      const veiculo=[v.marca,v.modelo,v.cor,v.ano].filter(Boolean).join(' · ');
      const motorista = v.condutor_patrimonio || v.motorista_atual || '';
      const bfleet = v.bfleet_condutor || '';
      return `<tr>
        <td><strong>${esc(v.placa||'')}</strong><br><small>${esc(v.empresa||'')}</small></td>
        <td>${esc(v.renavam||'—')}</td>
        <td>${esc(veiculo || v.nome || '—')}<br><small>${esc(v.tipo||'')}</small></td>
        <td><strong>Patrimônio:</strong> ${esc(motorista || '—')}<br><strong>BFleet:</strong> ${esc(bfleet || '—')}<br>${condutorBadge(v)}</td>
        <td>${esc(v.coordenacao||'—')}<br><small>${esc(v.supervisao||'')}</small></td>
        <td>${fmtMoney(v.valor_mensal)}<br><small>${v.valor_km ? `${fmtMoney(v.valor_km)}/km` : ''}</small></td>
        <td>${statusBadge(v)}<br><small>${esc(v.bfleet_idgps ? `GPS: ${v.bfleet_idgps}` : (v.detran_mensagem || ''))}</small></td>
        <td>${esc(v.status||'ATIVO')}<br><small>${v.bfleet_sync_at ? `BFleet: ${new Date(v.bfleet_sync_at).toLocaleString('pt-BR')}` : ''}</small></td>
        <td><div class="fv-actions"><button class="fv-btn ghost fv-mini" data-edit="${v.id}">Editar</button><button class="fv-btn soft fv-mini" data-detran="${v.id}">DETRAN</button><button class="fv-btn primary fv-mini" data-multas="${v.id}">Multas</button></div></td>
      </tr>`;
    }).join('');
    tbody.querySelectorAll('[data-edit]').forEach(btn=>btn.addEventListener('click',()=>fillForm(root,state.veiculos.find(v=>String(v.id)===String(btn.dataset.edit)))));
    tbody.querySelectorAll('[data-detran]').forEach(btn=>btn.addEventListener('click',()=>confirmarDetran(root, opts, state.veiculos.find(v=>String(v.id)===String(btn.dataset.detran)))));
    tbody.querySelectorAll('[data-multas]').forEach(btn=>btn.addEventListener('click',()=>consultarMultas(root, opts, state.veiculos.find(v=>String(v.id)===String(btn.dataset.multas)))));
  }

  function openHome(container, opts={}){
    container.innerHTML=`${styles}<section class="fv-shell"><div class="fv-head"><div class="fv-kicker">Frotas · Cadastro</div><h1 class="fv-title">Veículos</h1><p class="fv-sub">Base de veículos com integração DETRAN e BFleet. Veículos com rastreador aparecem com ✅ e o condutor oficial da leitura de patrimônio pode ser sincronizado com a plataforma BFleet.</p></div><div class="fv-card"><div class="fv-tabs"><button class="fv-tab" type="button" data-open-excesso>Excesso de Velocidade</button><button class="fv-tab active" type="button">Veículos</button><button class="fv-tab" type="button" data-open-multas>Multas</button></div><div class="fv-body"><form class="fv-form" data-veiculo-form><div class="fv-field"><label>Placa</label><input class="fv-input" name="placa" placeholder="ABC1D23" maxlength="8"></div><div class="fv-field"><label>RENAVAM</label><input class="fv-input" name="renavam" placeholder="somente números"></div><div class="fv-field"><label>Nome interno</label><input class="fv-input" name="nome" placeholder="Ex.: ABC1D23"></div><div class="fv-field"><label>Empresa</label><input class="fv-input" name="empresa"></div><div class="fv-field"><label>CNPJ</label><input class="fv-input" name="cnpj"></div><div class="fv-field"><label>Marca</label><input class="fv-input" name="marca"></div><div class="fv-field"><label>Modelo</label><input class="fv-input" name="modelo"></div><div class="fv-field"><label>Cor</label><input class="fv-input" name="cor"></div><div class="fv-field"><label>Ano</label><input class="fv-input" name="ano" type="number"></div><div class="fv-field"><label>Tipo</label><input class="fv-input" name="tipo" placeholder="Próprio/Locado"></div><div class="fv-field"><label>Coordenação</label><input class="fv-input" name="coordenacao"></div><div class="fv-field"><label>Supervisão</label><input class="fv-input" name="supervisao"></div><div class="fv-field"><label>Condutor patrimônio</label><input class="fv-input" name="motorista_atual"></div><div class="fv-field"><label>Hodômetro</label><input class="fv-input" name="hodometro" type="number" step="0.01"></div><div class="fv-field"><label>Valor mensal</label><input class="fv-input" name="valor_mensal" type="number" step="0.01"></div><div class="fv-field"><label>Dia vencimento</label><input class="fv-input" name="dia_vencimento" type="number"></div><div class="fv-field"><label>R$/Km</label><input class="fv-input" name="valor_km" type="number" step="0.01"></div><div class="fv-field"><label>Status</label><select class="fv-select" name="status"><option>ATIVO</option><option>INATIVO</option><option>VENDIDO</option><option>MANUTENCAO</option></select></div><div class="fv-field full"><label>Observações</label><textarea name="observacoes" placeholder="Observações internas"></textarea></div><div class="fv-field full"><button class="fv-btn primary" type="button" data-save-veiculo>Salvar veículo</button></div></form><div class="fv-toolbar"><input class="fv-input" placeholder="Buscar por placa, RENAVAM, modelo, motorista..." data-search><select class="fv-select" data-filter><option value="todos">Todos</option><option value="rastreador">Com rastreador BFleet</option><option value="sem_rastreador">Sem rastreador</option><option value="condutor_divergente">Condutor divergente</option><option value="detran">Confirmados DETRAN</option><option value="pendentes">Pendentes DETRAN</option><option value="sem_renavam">Sem RENAVAM</option></select><button class="fv-btn soft" type="button" data-refresh>Atualizar</button><button class="fv-btn primary" type="button" data-sync-detran>Puxar frota DETRAN</button><button class="fv-btn soft" type="button" data-sync-bfleet>Sincronizar BFleet</button><button class="fv-btn warn" type="button" data-sync-drivers>Atualizar condutores</button></div><div class="fv-grid"><div class="fv-kpi"><span>Total</span><strong data-kpi-total>0</strong></div><div class="fv-kpi"><span>DETRAN OK</span><strong data-kpi-detran>0</strong></div><div class="fv-kpi"><span>Rastreadores</span><strong data-kpi-rastreador>0</strong></div><div class="fv-kpi"><span>Divergências</span><strong data-kpi-divergentes>0</strong></div><div class="fv-kpi"><span>Sem RENAVAM</span><strong data-kpi-sem-renavam>0</strong></div></div><p class="fv-sub" data-count>0 veículo(s) encontrado(s)</p><div class="fv-table-wrap"><table class="fv-table"><thead><tr><th>Placa / Empresa</th><th>RENAVAM</th><th>Veículo</th><th>Condutor</th><th>Coordenação</th><th>Custo</th><th>Validação</th><th>Status</th><th>Ações</th></tr></thead><tbody data-veiculos-table></tbody></table></div><div class="fv-note"><strong>BFleet:</strong> o botão Sincronizar BFleet cruza por placa, marca veículos com rastreador e identifica divergência entre condutor BFleet e leitura de patrimônio. O botão Atualizar condutores cria/atualiza condutores no BFleet conforme a leitura de patrimônio.</div></div></div></section>`;
    container.querySelector('[data-open-excesso]')?.addEventListener('click',()=>window.location.assign(panelPath('frotas')));
    container.querySelector('[data-open-multas]')?.addEventListener('click',()=>window.location.assign(panelPath('frotas-multas')));
    container.querySelector('[data-save-veiculo]')?.addEventListener('click',()=>saveVeiculo(container, opts));
    container.querySelector('[data-refresh]')?.addEventListener('click',()=>loadVeiculos(container, opts));
    container.querySelector('[data-sync-detran]')?.addEventListener('click',()=>sincronizarFrota(container, opts));
    container.querySelector('[data-sync-bfleet]')?.addEventListener('click',()=>sincronizarBfleet(container, opts));
    container.querySelector('[data-sync-drivers]')?.addEventListener('click',()=>atualizarCondutores(container, opts));
    container.querySelector('[data-search]')?.addEventListener('input',(e)=>{state.busca=e.target.value; renderTable(container, opts);});
    container.querySelector('[data-filter]')?.addEventListener('change',(e)=>{state.filtro=e.target.value; renderStats(container); renderTable(container, opts);});
    loadVeiculos(container, opts);
  }

  window[MODULE_NAME]=window[MODULE_NAME]||{};
  window[MODULE_NAME].openHome=openHome;
})();
