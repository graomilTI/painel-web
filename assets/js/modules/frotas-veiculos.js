(function () {
  const MODULE_NAME = 'FROTAS_VEICULOS';
  const MONEY_FMT = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

  const styles = `
    <style>
      .fv-shell{color:#e2e2f0}.fv-head{margin-bottom:18px}.fv-kicker{color:#86efac;text-transform:uppercase;letter-spacing:.14em;font-weight:950;font-size:12px}.fv-title{margin:8px 0 6px;font-size:clamp(24px,2.4vw,34px);letter-spacing:-.04em;color:#f8fafc}.fv-sub{max-width:900px;color:#6b7280;line-height:1.55;margin:0}.fv-card{border:1px solid rgba(148,163,184,.16);border-radius:24px;background:radial-gradient(circle at top left,rgba(34,197,94,.13),transparent 34%),linear-gradient(180deg,rgba(15,23,42,.98),rgba(2,6,23,.98));box-shadow:0 20px 60px rgba(0,0,0,.28);overflow:hidden}.fv-body{padding:18px}.fv-toolbar{display:grid;grid-template-columns:minmax(220px,1fr) 180px auto auto auto;gap:10px;margin-bottom:14px}.fv-toolbar.extra{grid-template-columns:repeat(4,minmax(0,1fr));margin-top:-4px}.fv-input,.fv-select{width:100%;height:42px;border:1px solid rgba(148,163,184,.18);border-radius:14px;background:#0d0d18;color:#e2e2f0;padding:0 12px;outline:none;color-scheme:dark}.fv-select option{background:#0d0d18;color:#e2e2f0}.fv-btn{border:0;border-radius:14px;min-height:42px;padding:0 14px;font-weight:950;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:8px}.fv-btn.primary{background:linear-gradient(135deg,#16a34a,#22c55e);color:#052e16}.fv-btn.soft{border:1px solid rgba(34,197,94,.24);background:rgba(34,197,94,.12);color:#86efac}.fv-btn.ghost{border:1px solid rgba(148,163,184,.18);background:rgba(15,23,42,.72);color:#cbd5e1}.fv-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px;margin:14px 0}.fv-kpi{border:1px solid rgba(34,197,94,.18);background:rgba(2,6,23,.32);border-radius:14px;padding:12px 14px;min-width:0;text-align:left;font:inherit;cursor:pointer;transition:border-color .15s,background .15s}.fv-kpi:hover{border-color:rgba(34,197,94,.45);background:rgba(22,101,52,.14)}.fv-kpi.active{border-color:#22c55e;background:rgba(22,101,52,.28);box-shadow:0 0 0 1px #22c55e inset}.fv-kpi:focus-visible{outline:2px solid #22c55e;outline-offset:2px}.fv-btn:disabled{opacity:.6;cursor:progress}.fv-kpi span{display:block;color:#93c5fd;font-size:10px;font-weight:950;letter-spacing:.08em;text-transform:uppercase;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.fv-kpi strong{display:block;margin-top:7px;color:#fff;font-size:22px;line-height:1}.fv-table-wrap{overflow:auto;border:1px solid rgba(148,163,184,.14);border-radius:18px}.fv-table{width:100%;border-collapse:collapse;min-width:1120px}.fv-table th{padding:12px 11px;color:#bfdbfe;font-size:11px;letter-spacing:.1em;text-transform:uppercase;text-align:left;border-bottom:1px solid rgba(148,163,184,.16);background:rgba(2,6,23,.38)}.fv-table td{padding:12px 11px;border-bottom:1px solid rgba(148,163,184,.10);color:#e2e2f0;font-size:13px;vertical-align:top}.fv-table tr:hover td{background:rgba(22,101,52,.08)}.fv-badge{display:inline-flex;align-items:center;gap:6px;border-radius:999px;padding:4px 8px;font-size:10px;font-weight:950;border:1px solid rgba(148,163,184,.18);color:#cbd5e1;background:rgba(15,23,42,.72);white-space:nowrap}.fv-badge.ok{border-color:rgba(34,197,94,.35);background:rgba(22,101,52,.24);color:#bbf7d0}.fv-badge.warn{border-color:rgba(245,158,11,.34);background:rgba(245,158,11,.12);color:#fde68a}.fv-badge.err{border-color:rgba(239,68,68,.34);background:rgba(239,68,68,.12);color:#fecaca}.fv-actions{display:flex;gap:8px;flex-wrap:nowrap;align-items:center}.fv-actions .fv-btn{white-space:nowrap}.fv-mini{min-height:32px;border-radius:10px;padding:0 10px;font-size:11px}
.fv-icon{width:34px;padding:0}
.fv-status-chips{display:flex;flex-wrap:wrap;gap:7px;margin:0 0 12px}
.fv-chip{display:inline-flex;align-items:center;gap:6px;padding:5px 11px;border:1px solid rgba(148,163,184,.14);border-radius:999px;background:rgba(15,23,42,.28);color:#afbeb7;font:inherit;font-size:12px;font-weight:700;white-space:nowrap;cursor:pointer;transition:transform .12s ease,background .12s ease}
.fv-chip:hover{background:rgba(15,23,42,.5);transform:translateY(-1px)}
.fv-chip i{width:7px;height:7px;border-radius:50%;background:currentColor;box-shadow:0 0 9px currentColor}
.fv-chip strong{padding:1px 7px;border-radius:999px;background:rgba(255,255,255,.08);font-size:11px}
.fv-chip.active{background:rgba(255,255,255,.13);box-shadow:0 0 0 1px currentColor inset}
.fv-chip-ativo{color:#72efb1;border-color:rgba(52,211,153,.2)}
.fv-chip-inativo{color:#94a3b8;border-color:rgba(148,163,184,.2)}
.fv-chip-vendido{color:#93c5fd;border-color:rgba(96,165,250,.2)}
.fv-chip-manutencao{color:#f5d761;border-color:rgba(250,204,21,.2)}.fv-form{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin:0 0 16px;padding:14px;border:1px solid rgba(34,197,94,.18);background:rgba(2,6,23,.32);border-radius:18px}.fv-field label{display:block;margin:0 0 6px;color:#bbf7d0;font-size:11px;font-weight:950;text-transform:uppercase;letter-spacing:.08em}.fv-field.full{grid-column:1/-1}.fv-field textarea{width:100%;min-height:68px;resize:vertical;border:1px solid rgba(148,163,184,.18);border-radius:14px;background:#0d0d18;color:#e2e2f0;padding:12px;outline:none}.fv-note{margin-top:12px;padding:12px 14px;border:1px dashed rgba(34,197,94,.28);border-radius:16px;background:rgba(2,6,23,.26);color:#bfdbfe;font-size:12px;line-height:1.5}.fv-empty{text-align:center;color:#f8fafc;padding:26px!important;font-weight:850}.fv-modal-backdrop{position:fixed;inset:0;z-index:9998;background:rgba(2,6,23,.72);display:flex;align-items:center;justify-content:center;padding:22px}.fv-modal{width:min(1120px,96vw);max-height:86vh;overflow:auto;border:1px solid rgba(148,163,184,.20);border-radius:24px;background:linear-gradient(180deg,#0d0d18,#020617);box-shadow:0 24px 80px rgba(0,0,0,.55);color:#e2e2f0}.fv-modal-head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;padding:18px;border-bottom:1px solid rgba(148,163,184,.16)}.fv-modal-head h3{margin:0;color:#fff;font-size:20px}.fv-modal-head p{margin:6px 0 0;color:#6b7280;line-height:1.45}.fv-modal-body{padding:18px}.fv-diag-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-bottom:14px}.fv-diag-card{border:1px solid rgba(34,197,94,.18);border-radius:16px;background:rgba(2,6,23,.36);padding:12px}.fv-diag-card span{display:block;color:#93c5fd;font-size:10px;font-weight:950;text-transform:uppercase;letter-spacing:.1em}.fv-diag-card strong{display:block;margin-top:6px;color:#fff;font-size:22px}.fv-diag-section{margin-top:14px}.fv-diag-section h4{margin:0 0 8px;color:#bbf7d0}.fv-diag-table{width:100%;border-collapse:collapse;min-width:900px}.fv-diag-table th,.fv-diag-table td{padding:10px;border-bottom:1px solid rgba(148,163,184,.12);font-size:12px;text-align:left;vertical-align:top}.fv-diag-table th{color:#bfdbfe;text-transform:uppercase;letter-spacing:.08em;font-size:10px;background:rgba(2,6,23,.32)}.fv-toast{position:fixed;right:22px;bottom:22px;z-index:9999;border:1px solid rgba(134,239,172,.32);background:rgba(22,101,52,.96);color:#dcfce7;border-radius:16px;padding:12px 14px;font-weight:950;box-shadow:0 16px 45px rgba(0,0,0,.35);opacity:0;transform:translateY(10px);pointer-events:none;transition:.2s ease}.fv-toast.show{opacity:1;transform:translateY(0)}@media(max-width:1200px){.fv-toolbar{grid-template-columns:1fr 1fr}.fv-grid{grid-template-columns:repeat(2,1fr)}.fv-form{grid-template-columns:repeat(2,1fr)}}@media(max-width:680px){.fv-toolbar,.fv-grid,.fv-form{grid-template-columns:1fr}}
    </style>`;

  const state = { veiculos: [], loading: false, filtro: 'todos', status: '', busca: '' };

  function onlyPlate(v){ return String(v||'').toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,7); }

  function normalizarPlaca(v){
    return String(v||'').toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^A-Z0-9]/g,'').slice(0,7);
  }

  function placaEquivalenteVisual(placa){
    const p = normalizarPlaca(placa);
    if(p.length !== 7) return p;
    const chars = p.split('');
    // Posições 1,2,3 e 5 são letras; posições 4,6,7 são números no padrão Mercosul.
    const letterMap = { '0':'O', '1':'I', '2':'Z', '3':'B', '4':'A', '5':'S', '6':'G', '7':'T', '8':'B' };
    const digitMap = { 'O':'0', 'Q':'0', 'D':'0', 'I':'1', 'L':'1', 'Z':'2', 'S':'5', 'B':'8', 'G':'6', 'T':'7' };
    [0,1,2,4].forEach(i => { chars[i] = letterMap[chars[i]] || chars[i]; });
    [3,5,6].forEach(i => { chars[i] = digitMap[chars[i]] || chars[i]; });
    return chars.join('');
  }

  function extrairPlacasTexto(...valores){
    const texto = valores.filter(Boolean).join(' ').toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g,' ');
    const limpo = texto.replace(/[^A-Z0-9]/g, ' ');
    const colado = limpo.replace(/\s+/g, '');
    const candidatos = new Set();
    const add = (v) => { const p = normalizarPlaca(v); if(p.length === 7) { candidatos.add(p); candidatos.add(placaEquivalenteVisual(p)); } };
    for (const m of texto.matchAll(/[A-Z]{3}[-\s]?[0-9][A-Z0-9][0-9]{2}/g)) add(m[0]);
    for (const m of texto.matchAll(/[A-Z]{3}[-\s]?[0-9]{4}/g)) add(m[0]);
    for (const m of colado.matchAll(/[A-Z]{3}[0-9A-Z][0-9A-Z]{3}/g)) add(m[0]);
    return Array.from(candidatos).filter(Boolean);
  }

  function getBfleetPlacas(row){
    const campos = [row?.placa, row?.plate, row?.patente, row?.license_plate, row?.vehicle_plate, row?.nome, row?.name, row?.vehicleName, row?.vehicle, row?.label, row?.descricao];
    const candidatos = new Set();
    campos.forEach(v => { const p = normalizarPlaca(v); if(p.length === 7) { candidatos.add(p); candidatos.add(placaEquivalenteVisual(p)); } });
    extrairPlacasTexto(...campos).forEach(p => candidatos.add(p));
    return Array.from(candidatos).filter(Boolean);
  }

  function getBfleetNome(row){
    return String(row?.nome || row?.name || row?.vehicleName || row?.vehicle || row?.label || row?.descricao || '').trim();
  }

  function getBfleetIdGps(row){
    return String(row?.idgps || row?.id_gps || row?.gps_id || row?.device_id || row?.id || row?.tracker_id || '').trim();
  }

  function buildPlacaIndex(veiculos){
    const index = new Map();
    for(const v of veiculos || []){
      const candidatos = new Set([normalizarPlaca(v?.placa), placaEquivalenteVisual(v?.placa), ...extrairPlacasTexto(v?.placa, v?.nome, v?.modelo, v?.observacoes, v?.raw?.nome, v?.raw?.name)]);
      candidatos.forEach(p => { if(p && !index.has(p)) index.set(p, v); });
    }
    return index;
  }

  function getBfleetRowsFromResponse(data){
    const out = [];
    const keys = ['bfleet_nao_encontrados_no_painel','veiculos_bfleet','bfleet','items','registros','data','content','lista'];
    for(const key of keys){
      const list = data?.[key];
      if(Array.isArray(list)) out.push(...list);
    }
    if(Array.isArray(data)) out.push(...data);
    const seen = new Set();
    return out.filter(r => {
      const key = `${getBfleetPlacas(r)[0] || ''}|${getBfleetIdGps(r)}|${getBfleetNome(r)}`;
      if(!key.trim() || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function reconciliarDiagnosticoBfleet(data){
    const clone = { ...(data || {}) };
    const index = buildPlacaIndex(state.veiculos);
    const fora = Array.isArray(clone.bfleet_nao_encontrados_no_painel) ? clone.bfleet_nao_encontrados_no_painel : [];
    const corrigidos = [];
    const aindaFora = [];
    for(const row of fora){
      const placas = getBfleetPlacas(row);
      const match = placas.map(p => index.get(p)).find(Boolean);
      if(match){
        corrigidos.push({ ...row, placa_painel: match.placa, veiculo_id: match.id, motivo: 'Cruzamento corrigido por normalização de placa/nome BFleet.' });
      }else{
        aindaFora.push({ ...row, placa: placas[0] || row?.placa || row?.plate || '', motivo: row?.motivo || 'Placa BFleet não encontrada no painel após normalização.' });
      }
    }
    clone.bfleet_corrigidos_por_normalizacao = corrigidos;
    clone.bfleet_nao_encontrados_no_painel = aindaFora;
    clone.matched = Number(clone.matched || clone.rastreadores || 0) + corrigidos.length;
    return clone;
  }

  function onlyDigits(v){ return String(v||'').replace(/\D/g,''); }
  function norm(v){ return String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase(); }
  function esc(v){ return String(v ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;'}[c])); }
  function num(v){ const n=Number(v); return Number.isFinite(n)?n:null; }
  function fmtMoney(v){ const n=Number(v||0); return MONEY_FMT.format(Number.isFinite(n)?n:0); }
  function toast(msg, error=false){ let el=document.querySelector('.fv-toast'); if(!el){el=document.createElement('div');el.className='fv-toast';document.body.appendChild(el);} el.textContent=msg; el.style.background=error?'rgba(127,29,29,.96)':'rgba(22,101,52,.96)'; el.classList.add('show'); setTimeout(()=>el.classList.remove('show'),3200); }

  function statusBadge(v){
    if (v?.detran_confirmado || String(v?.detran_status||'').toUpperCase()==='CONFIRMADO' || String(v?.detran_status||'').toUpperCase()==='DETRAN') return '<span class="fv-badge ok">✓ DETRAN</span>';
    if (!v?.renavam || String(v.renavam).replace(/\D/g,'') === '0') return '<span class="fv-badge err">Sem RENAVAM</span>';
    return '<span class="fv-badge warn">Pendente DETRAN</span>';
  }

  function hasTracker(v){
    const status = String(v?.bfleet_status || v?.rastreador_status || '').toUpperCase();
    return Boolean(v?.rastreador_bfleet || v?.bfleet_rastreador || v?.bfleet_confirmado || status === 'COM_RASTREADOR' || status === 'ATIVO' || status === 'OK');
  }

  function trackerBadge(v){
    if (hasTracker(v)) return '<span class="fv-badge ok">✓ BFleet</span>';
    return '<span class="fv-badge warn">Sem rastreador</span>';
  }

  const STATUS_CHIPS=[['ATIVO','Ativo'],['INATIVO','Inativo'],['VENDIDO','Vendido'],['MANUTENCAO','Manutenção']];
  function statusKey(v){ return String(v?.status||'ATIVO').normalize('NFD').replace(/[̀-ͯ]/g,'').toUpperCase().trim(); }

  function renderStatusChips(root){
    const box=root.querySelector('[data-status-chips]'); if(!box) return;
    const counts=Object.fromEntries(STATUS_CHIPS.map(([k])=>[k,0]));
    state.veiculos.forEach(v=>{ const k=statusKey(v); if(k in counts) counts[k]++; });
    box.innerHTML=STATUS_CHIPS.map(([k,label])=>`<button type="button" class="fv-chip fv-chip-${k.toLowerCase()}${state.status===k?' active':''}" data-status-filter="${k}" aria-pressed="${state.status===k}" title="${state.status===k?'Clique pra remover o filtro':`Filtrar por: ${label}`}"><i aria-hidden="true"></i>${label}<strong>${counts[k]}</strong></button>`).join('');
  }

  function getFiltered(){
    const busca=norm(state.busca);
    return (state.veiculos||[]).filter(v=>{
      if(state.filtro==='detran' && !(v.detran_confirmado || String(v.detran_status||'').toUpperCase()==='CONFIRMADO')) return false;
      if(state.filtro==='pendentes' && (v.detran_confirmado || String(v.detran_status||'').toUpperCase()==='CONFIRMADO')) return false;
      if(state.filtro==='sem_renavam' && (v.renavam && String(v.renavam).replace(/\D/g,'') !== '0')) return false;
      if(state.filtro==='rastreador' && !hasTracker(v)) return false;
      if(state.filtro==='sem_rastreador' && hasTracker(v)) return false;
      if(state.filtro==='divergencias' && !v.bfleet_divergencia) return false;
      if(state.status && statusKey(v)!==state.status) return false;
      if(!busca) return true;
      return norm([v.placa,v.renavam,v.nome,v.marca,v.modelo,v.empresa,v.motorista_atual,v.patrimonio_funcionario,v.coordenacao,v.supervisao,v.bfleet_nome,v.bfleet_idgps].join(' ')).includes(busca);
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
      placa: normalizarPlaca(get('placa')),
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

  async function callFunction(opts, name, body){
    const { data, error } = await opts.supabase.functions.invoke(name, { body });
    if(error) {
      const msg = error.context?.error || error.context?.message || error.message || `Falha na function ${name}`;
      throw new Error(msg);
    }
    if(data?.error) throw new Error(data.error);
    return data;
  }

  async function confirmarDetran(root, opts, v){
    if(!v?.placa || !v?.renavam) return toast('Veículo sem placa ou RENAVAM.', true);
    try{
      toast('Consultando DETRAN...');
      const data = await callFunction(opts, 'sync-veiculos-detran', { mode:'single', veiculo_id:v.id, placa:v.placa, renavam:v.renavam, empresa:v.empresa, cnpj:v.cnpj });
      if(!data?.updated){
        await opts.supabase.from('frotas_veiculos').update({ detran_confirmado:true, detran_status:'CONFIRMADO', detran_mensagem:'Confirmado via Edge Function', detran_ultima_consulta_em:new Date().toISOString(), detran_raw:data || {} }).eq('id', v.id);
      }
      toast('Veículo confirmado no DETRAN.');
      await loadVeiculos(root, opts);
    }catch(err){ toast(err.message || 'Falha ao consultar DETRAN.', true); }
  }

  async function sincronizarFrota(root, opts, progress){
    progress('DETRAN: sincronizando veículos...');
    const veiculos = await callFunction(opts, 'sync-veiculos-detran', { mode:'all' });
    const totalVeiculos = Number(veiculos?.total || 0);
    let offset=0, limit=15, totalMultas=0, inserted=0, updated=0, errors=0, totalDisponivel=null;
    for(let i=0;i<80;i++){
      const lote = await callFunction(opts, 'sync-multas-detran', { mode:'all', offset, limit });
      totalMultas += Number(lote?.total_multas || 0);
      inserted += Number(lote?.inserted || 0);
      updated += Number(lote?.updated || 0);
      errors += Number(lote?.errors || 0);
      totalDisponivel = lote?.total_disponivel ?? totalDisponivel;
      offset = Number(lote?.next_offset || offset + limit);
      progress(`DETRAN: multas ${Math.min(offset, Number(totalDisponivel || offset))}/${totalDisponivel || '?'} veículos...`);
      if(!lote?.has_more) break;
    }
    return { texto: `DETRAN: ${totalVeiculos} veículo(s), ${totalMultas} multa(s), ${inserted} nova(s), ${updated} atualizada(s)${errors ? `, ${errors} erro(s)` : ''}`, erro: Boolean(errors) };
  }


  async function aplicarCorrecaoBfleetLocal(root, opts, data, criarAusentes = false){
    const rows = getBfleetRowsFromResponse(data);
    if(!rows.length) return { atualizados: 0, criados: 0, ignorados: 0 };

    const index = buildPlacaIndex(state.veiculos);
    let atualizados = 0, criados = 0, ignorados = 0;

    for(const row of rows){
      const placas = getBfleetPlacas(row);
      const placa = placas[0];
      if(!placa){ ignorados++; continue; }
      const existente = placas.map(p => index.get(p)).find(Boolean);
      const payloadCompleto = {
        placa,
        nome: getBfleetNome(row) || placa,
        status: 'ATIVO',
        origem_importacao: existente?.origem_importacao || 'bfleet',
        rastreador_bfleet: true,
        bfleet_rastreador: true,
        bfleet_confirmado: true,
        bfleet_status: 'OK',
        bfleet_placa: placa,
        bfleet_nome: getBfleetNome(row) || null,
        bfleet_idgps: getBfleetIdGps(row) || null,
        bfleet_grupo: row?.grupo || row?.group || row?.groupName || row?.grupo_nome || null,
        bfleet_mensagem: existente ? 'Cruzado com BFleet por placa normalizada.' : 'Cadastrado automaticamente pela BFleet para corrigir cruzamento.',
        bfleet_ultima_sync_em: new Date().toISOString(),
        raw: { ...(existente?.raw || {}), bfleet: row }
      };
      const payloadMinimo = {
        placa,
        nome: payloadCompleto.nome,
        status: 'ATIVO',
        origem_importacao: existente?.origem_importacao || 'bfleet',
        raw: payloadCompleto.raw
      };

      if(existente?.id){
        const { error } = await opts.supabase.from('frotas_veiculos').update(payloadCompleto).eq('id', existente.id);
        if(error){
          const fallback = await opts.supabase.from('frotas_veiculos').update(payloadMinimo).eq('id', existente.id);
          if(fallback.error){ ignorados++; continue; }
        }
        atualizados++;
      }else if(criarAusentes){
        const { error } = await opts.supabase.from('frotas_veiculos').upsert(payloadCompleto, { onConflict: 'placa' });
        if(error){
          const fallback = await opts.supabase.from('frotas_veiculos').upsert(payloadMinimo, { onConflict: 'placa' });
          if(fallback.error){ ignorados++; continue; }
        }
        criados++;
      }else{
        ignorados++;
      }
    }
    if(atualizados || criados) await loadVeiculos(root, opts);
    return { atualizados, criados, ignorados };
  }

  async function sincronizarBFleet(root, opts, progress){
    progress('BFleet: sincronizando rastreadores...');
    const res = await callFunction(opts, 'sync-bfleet-veiculos', { mode:'sync', normalizacao_placa:'robusta', criar_ausentes:true });
    const correcao = await aplicarCorrecaoBfleetLocal(root, opts, res, true);
    const rastreadores = Number(res?.rastreadores || res?.matched || 0) + correcao.atualizados + correcao.criados;
    const total = Number(res?.total_bfleet || res?.total || res?.linhas_lidas_api || res?.placas_lidas || 0);
    const divergencias = Number(res?.divergencias || 0);
    return { texto: `BFleet: ${rastreadores} com rastreador de ${total || 'N'}${divergencias ? `, ${divergencias} divergência(s)` : ''}`, erro: Boolean(res?.warning) };
  }


  function closeBfleetDiagnostic(){ document.querySelector('[data-bfleet-diagnostic-modal]')?.remove(); }

  function renderBfleetDiagnosticModal(data, root, opts){
    data = reconciliarDiagnosticoBfleet(data);
    closeBfleetDiagnostic();
    const bfleetFora = Array.isArray(data?.bfleet_nao_encontrados_no_painel) ? data.bfleet_nao_encontrados_no_painel : [];
    const painelSem = Array.isArray(data?.painel_nao_encontrados_na_bfleet) ? data.painel_nao_encontrados_na_bfleet : [];
    const semIdgps = Array.isArray(data?.bfleet_sem_idgps) ? data.bfleet_sem_idgps : [];
    const corrigidos = Array.isArray(data?.bfleet_corrigidos_por_normalizacao) ? data.bfleet_corrigidos_por_normalizacao : [];
    const modal=document.createElement('div');
    modal.className='fv-modal-backdrop';
    modal.dataset.bfleetDiagnosticModal='1';
    modal.innerHTML=`<div class="fv-modal"><div class="fv-modal-head"><div><h3>Diagnóstico BFleet</h3><p>Mostra por que alguns rastreadores não cruzaram com a frota do painel. O cruzamento é feito por placa normalizada: <strong>BFleet patente</strong> x <strong>frotas_veiculos.placa</strong>.</p></div><div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end"><button class="fv-btn soft" type="button" data-fix-diag>Cruzamento automático</button><button class="fv-btn ghost" type="button" data-close-diag>Fechar</button></div></div><div class="fv-modal-body"><div class="fv-diag-grid"><div class="fv-diag-card"><span>Registros BFleet</span><strong>${Number(data?.total_bfleet||0)}</strong></div><div class="fv-diag-card"><span>Com idgps</span><strong>${Number(data?.total_com_idgps||0)}</strong></div><div class="fv-diag-card"><span>Cruzados</span><strong>${Number(data?.matched||data?.rastreadores||0)}</strong></div><div class="fv-diag-card"><span>BFleet fora do painel</span><strong>${bfleetFora.length}</strong></div><div class="fv-diag-card"><span>Corrigidos localmente</span><strong>${corrigidos.length}</strong></div></div><div class="fv-note">Se aparecer em <strong>BFleet fora do painel</strong>, o rastreador existe na BFleet, mas a placa não existe exatamente na base <strong>frotas_veiculos</strong>. Quando clicar em <strong>Cruzamento automático</strong>, o painel corrige placas com diferença de hífen/espaço e cadastra como origem BFleet as placas com rastreador que ainda não existem na base.</div><div class="fv-diag-section"><h4>BFleet com rastreador, mas sem cruzamento no painel</h4><div class="fv-table-wrap"><table class="fv-diag-table"><thead><tr><th>Placa BFleet</th><th>Nome BFleet</th><th>ID GPS</th><th>Grupo</th><th>Motivo provável</th></tr></thead><tbody>${bfleetFora.length?bfleetFora.map(r=>`<tr><td><strong>${esc(r.placa||'')}</strong></td><td>${esc(r.nome||'')}</td><td>${esc(r.idgps||'')}</td><td>${esc(r.grupo||'')}</td><td>${esc(r.motivo||'Placa BFleet não encontrada no painel.')}</td></tr>`).join(''):'<tr><td colspan="5" class="fv-empty">Nenhum registro nesta categoria.</td></tr>'}</tbody></table></div></div><div class="fv-diag-section"><h4>Veículos do painel sem rastreador BFleet</h4><div class="fv-table-wrap"><table class="fv-diag-table"><thead><tr><th>Placa Painel</th><th>Empresa</th><th>RENAVAM</th><th>Motivo provável</th></tr></thead><tbody>${painelSem.length?painelSem.slice(0,120).map(r=>`<tr><td><strong>${esc(r.placa||'')}</strong></td><td>${esc(r.empresa||'')}</td><td>${esc(r.renavam||'')}</td><td>${esc(r.motivo||'Placa do painel não aparece no vehicleGetAll da BFleet.')}</td></tr>`).join(''):'<tr><td colspan="4" class="fv-empty">Nenhum registro nesta categoria.</td></tr>'}</tbody></table></div></div><div class="fv-diag-section"><h4>BFleet sem idgps válido</h4><div class="fv-table-wrap"><table class="fv-diag-table"><thead><tr><th>Placa</th><th>Nome</th><th>ID GPS</th><th>Grupo</th></tr></thead><tbody>${semIdgps.length?semIdgps.map(r=>`<tr><td><strong>${esc(r.placa||'')}</strong></td><td>${esc(r.nome||'')}</td><td>${esc(r.idgps||'')}</td><td>${esc(r.grupo||'')}</td></tr>`).join(''):'<tr><td colspan="4" class="fv-empty">Nenhum registro nesta categoria.</td></tr>'}</tbody></table></div></div></div></div>`;
    modal.querySelector('[data-close-diag]')?.addEventListener('click', closeBfleetDiagnostic);
    modal.querySelector('[data-fix-diag]')?.addEventListener('click', async () => {
      const r = await aplicarCorrecaoBfleetLocal(root, opts, data, true);
      toast(`Cruzamento BFleet corrigido: ${r.atualizados} atualizado(s), ${r.criados} cadastrado(s).`, false);
      closeBfleetDiagnostic();
    });
    modal.addEventListener('click',(e)=>{ if(e.target===modal) closeBfleetDiagnostic(); });
    document.body.appendChild(modal);
  }

  async function diagnosticarBFleet(root, opts){
    try{
      toast('Gerando diagnóstico BFleet...');
      const res = await callFunction(opts, 'sync-bfleet-veiculos', { mode:'diagnostic' });
      renderBfleetDiagnosticModal(res, root, opts);
      const diag = reconciliarDiagnosticoBfleet(res);
      toast(`Diagnóstico BFleet: ${Number(diag?.matched||0)} cruzados, ${Number(diag?.bfleet_nao_encontrados_no_painel?.length||0)} fora do painel.`);
    }catch(err){ toast(err.message || 'Falha ao gerar diagnóstico BFleet.', true); }
  }

  async function associarMotoristasPatrimonio(root, opts, progress){
    progress('Patrimônios: associando motoristas...');
    const { data, error } = await opts.supabase.rpc('sincronizar_frotas_veiculos_patrimonios');
    if(error) throw error;
    return { texto: `Patrimônios: ${Number(data?.veiculos_atualizados || 0)} atualizado(s)`, erro: false };
  }

  async function atualizarCondutoresBFleet(root, opts, progress){
    progress('Condutores: enviando ao BFleet...');
    const res = await callFunction(opts, 'update-bfleet-condutores', { mode:'pending', limit: 50 });
    return { texto: `Condutores: ${Number(res?.updated || 0)} atualizado(s)${res?.errors ? `, ${res.errors} erro(s)` : ''}`, erro: Boolean(res?.errors) };
  }

  // Fallback manual: as mesmas sincronizações rodam sozinhas no servidor (cron).
  // Cada etapa é independente: se uma falhar, as demais continuam.
  async function sincronizarTudo(root, opts){
    if(state.syncing) return;
    state.syncing = true;
    const btn = root.querySelector('[data-sync-all]');
    const label = btn?.textContent;
    if(btn) btn.disabled = true;
    const progress = (msg) => { toast(msg); if(btn) btn.textContent = msg.split(':')[0] + '...'; };
    const etapas = [
      ['BFleet', sincronizarBFleet],
      ['Patrimônios', associarMotoristasPatrimonio],
      ['Condutores', atualizarCondutoresBFleet],
      ['DETRAN', sincronizarFrota]
    ];
    const resumo = [];
    let falhou = false;
    for(const [nome, fn] of etapas){
      try{
        const r = await fn(root, opts, progress);
        resumo.push(r.texto);
        if(r.erro) falhou = true;
      }catch(err){
        falhou = true;
        resumo.push(`${nome}: falhou (${err?.message || 'erro'})`);
      }
    }
    state.syncing = false;
    if(btn){ btn.disabled = false; btn.textContent = label; }
    toast(`Sincronização concluída · ${resumo.join(' · ')}`, falhou);
    await loadVeiculos(root, opts);
  }

  async function consultarMultas(root, opts, v){
    if(!v?.placa || !v?.renavam) return toast('Veículo sem placa ou RENAVAM.', true);
    try{
      toast('Consultando multas...');
      await callFunction(opts, 'sync-multas-detran', { placa:v.placa, renavam:v.renavam, veiculo_id:v.id, empresa:v.empresa, cnpj:v.cnpj });
      toast('Consulta de multas concluída.');
      window.location.assign('https://grao1000.com.br/painel/frotas-multas');
    }catch(err){ toast(err.message || 'Falha ao consultar multas.', true); }
  }

  function renderStats(root){
    const total=state.veiculos.length;
    const ok=state.veiculos.filter(v=>v.detran_confirmado || String(v.detran_status||'').toUpperCase()==='CONFIRMADO' || String(v.detran_status||'').toUpperCase()==='DETRAN').length;
    const sem=state.veiculos.filter(v=>!v.renavam || String(v.renavam).replace(/\D/g,'')==='0').length;
    const rastreadores=state.veiculos.filter(hasTracker).length;
    const divergencias=state.veiculos.filter(v=>v.bfleet_divergencia).length;
    root.querySelector('[data-kpi-total]').textContent=total;
    root.querySelector('[data-kpi-detran]').textContent=ok;
    const tr=root.querySelector('[data-kpi-rastreadores]'); if(tr) tr.textContent=rastreadores;
    const div=root.querySelector('[data-kpi-divergencias]'); if(div) div.textContent=divergencias;
    root.querySelector('[data-kpi-sem-renavam]').textContent=sem;
    renderStatusChips(root);
    root.querySelectorAll('[data-kpi-filter]').forEach(card=>{
      const ativo=card.dataset.kpiFilter===state.filtro;
      card.classList.toggle('active',ativo); card.setAttribute('aria-pressed',String(ativo));
    });
  }

  const svgIcon=(d)=>`<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const ICON_EDITAR=svgIcon('<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>');
  const ICON_MULTAS=svgIcon('<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9Z"/><path d="M14 3v6h6"/><path d="M9 14h6"/><path d="M9 17h4"/>');
  const ICON_DETRAN=svgIcon('<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/>');

  function renderTable(root, opts){
    const tbody=root.querySelector('[data-veiculos-table]'); if(!tbody) return;
    if(state.loading){ tbody.innerHTML='<tr><td colspan="7" class="fv-empty">Carregando veículos...</td></tr>'; return; }
    const rows=getFiltered();
    root.querySelector('[data-count]').textContent=`${rows.length} veículo(s) encontrado(s)`;
    if(!rows.length){ tbody.innerHTML='<tr><td colspan="7" class="fv-empty">Nenhum veículo encontrado.</td></tr>'; return; }
    tbody.innerHTML=rows.map(v=>`
      <tr>
        <td><strong>${esc(v.placa)}</strong></td>
        <td>${esc(v.empresa || '—')}</td>
        <td>${esc(v.renavam || '—')}</td>
        <td>${esc(v.motorista_atual || v.patrimonio_funcionario || '—')}</td>
        <td>${esc(v.coordenacao || v.patrimonio_coordenacao || '—')}</td>
        <td><div class="fv-valid" title="${esc(v.bfleet_mensagem || v.detran_mensagem || '')}">${statusBadge(v)}${trackerBadge(v)}</div></td>
        <td><div class="fv-actions"><button class="fv-btn ghost fv-mini fv-icon" data-edit="${v.id}" title="Editar" aria-label="Editar">${ICON_EDITAR}</button><button class="fv-btn primary fv-mini fv-icon" data-multas="${v.id}" title="Multas" aria-label="Multas">${ICON_MULTAS}</button><button class="fv-btn soft fv-mini fv-icon" data-detran="${v.id}" title="DETRAN" aria-label="DETRAN">${ICON_DETRAN}</button></div></td>
      </tr>`).join('');
    tbody.querySelectorAll('[data-edit]').forEach(btn=>btn.addEventListener('click',()=>fillForm(root, state.veiculos.find(v=>v.id===btn.dataset.edit))));
    tbody.querySelectorAll('[data-detran]').forEach(btn=>btn.addEventListener('click',()=>confirmarDetran(root, opts, state.veiculos.find(v=>v.id===btn.dataset.detran))));
    tbody.querySelectorAll('[data-multas]').forEach(btn=>btn.addEventListener('click',()=>consultarMultas(root, opts, state.veiculos.find(v=>v.id===btn.dataset.multas))));
  }

  function openHome(container, opts={}){
    container.innerHTML=`${styles}<section class="fv-shell"><div class="fv-head"><div class="fv-kicker">Frotas · Cadastro</div><h1 class="fv-title">Veículos</h1><p class="fv-sub">Base oficial de veículos, validação DETRAN e rastreadores BFleet. Veículos com rastreador aparecem com a marcação <strong>BFleet</strong>.</p></div><div class="fv-card"><div class="fv-body"><form class="fv-form" data-veiculo-form><div class="fv-field"><label>Placa</label><input class="fv-input" name="placa" placeholder="ABC1D23" maxlength="8"></div><div class="fv-field"><label>RENAVAM</label><input class="fv-input" name="renavam" placeholder="somente números"></div><div class="fv-field"><label>Nome interno</label><input class="fv-input" name="nome" placeholder="Ex.: ABC1D23"></div><div class="fv-field"><label>Empresa</label><input class="fv-input" name="empresa"></div><div class="fv-field"><label>CNPJ</label><input class="fv-input" name="cnpj"></div><div class="fv-field"><label>Marca</label><input class="fv-input" name="marca"></div><div class="fv-field"><label>Modelo</label><input class="fv-input" name="modelo"></div><div class="fv-field"><label>Cor</label><input class="fv-input" name="cor"></div><div class="fv-field"><label>Ano</label><input class="fv-input" name="ano" type="number"></div><div class="fv-field"><label>Tipo</label><input class="fv-input" name="tipo" placeholder="Próprio/Locado"></div><div class="fv-field"><label>Coordenação</label><input class="fv-input" name="coordenacao"></div><div class="fv-field"><label>Supervisão</label><input class="fv-input" name="supervisao"></div><div class="fv-field"><label>Motorista atual</label><input class="fv-input" name="motorista_atual"></div><div class="fv-field"><label>Hodômetro</label><input class="fv-input" name="hodometro" type="number" step="0.01"></div><div class="fv-field"><label>Valor mensal</label><input class="fv-input" name="valor_mensal" type="number" step="0.01"></div><div class="fv-field"><label>Dia vencimento</label><input class="fv-input" name="dia_vencimento" type="number"></div><div class="fv-field"><label>R$/Km</label><input class="fv-input" name="valor_km" type="number" step="0.01"></div><div class="fv-field"><label>Status</label><select class="fv-select" name="status"><option>ATIVO</option><option>INATIVO</option><option>VENDIDO</option><option>MANUTENCAO</option></select></div><div class="fv-field full"><label>Observações</label><textarea name="observacoes" placeholder="Observações internas"></textarea></div><div class="fv-field full"><button class="fv-btn primary" type="button" data-save-veiculo>Salvar veículo</button></div></form><div class="fv-toolbar"><input class="fv-input" placeholder="Buscar por placa, RENAVAM, modelo, motorista..." data-search><select class="fv-select" data-filter><option value="todos">Todos</option><option value="detran">Confirmados DETRAN</option><option value="pendentes">Pendentes DETRAN</option><option value="sem_renavam">Sem RENAVAM</option><option value="rastreador">Com rastreador BFleet</option><option value="sem_rastreador">Sem rastreador</option><option value="divergencias">Divergências BFleet</option></select><button class="fv-btn soft" type="button" data-refresh>↻ Atualizar</button><button class="fv-btn ghost" type="button" data-diag-bfleet>Diagnóstico BFleet</button><button class="fv-btn primary" type="button" data-sync-all title="Roda em sequência: BFleet, Patrimônios, Condutores e DETRAN. Também acontece automaticamente.">Sincronizar tudo</button></div><div class="fv-grid"><button type="button" class="fv-kpi" data-kpi-filter="todos" aria-pressed="false"><span>Total</span><strong data-kpi-total>0</strong></button><button type="button" class="fv-kpi" data-kpi-filter="detran" aria-pressed="false"><span>DETRAN OK</span><strong data-kpi-detran>0</strong></button><button type="button" class="fv-kpi" data-kpi-filter="rastreador" aria-pressed="false"><span>Rastreadores</span><strong data-kpi-rastreadores>0</strong></button><button type="button" class="fv-kpi" data-kpi-filter="divergencias" aria-pressed="false"><span>Divergências</span><strong data-kpi-divergencias>0</strong></button><button type="button" class="fv-kpi" data-kpi-filter="sem_renavam" aria-pressed="false"><span>Sem RENAVAM</span><strong data-kpi-sem-renavam>0</strong></button></div><p class="fv-sub" data-count>0 veículo(s) encontrado(s)</p><div class="fv-status-chips" data-status-chips aria-label="Filtrar por status"></div><div class="fv-table-wrap"><table class="fv-table"><thead><tr><th>Placa</th><th>Empresa</th><th>RENAVAM</th><th>Motorista</th><th>Coordenação</th><th>Validação</th><th>Ações</th></tr></thead><tbody data-veiculos-table></tbody></table></div><div class="fv-note">Ao fazer upload do relatório de veículos em <strong>Relatórios</strong>, o painel organiza automaticamente placa e RENAVAM nesta tela. Tudo é sincronizado automaticamente; o botão <strong>Sincronizar tudo</strong> é um fallback que roda em sequência: BFleet (cruza rastreadores por placa), Patrimônios (motorista pela placa na planilha de Patrimônios), Condutores (envia o condutor atual ao BFleet) e DETRAN (frota oficial e multas). Clique nos cards de totais para filtrar a tabela.</div></div></div></section>`;
    container.querySelector('[data-save-veiculo]')?.addEventListener('click',()=>saveVeiculo(container, opts));
    container.querySelector('[data-refresh]')?.addEventListener('click',()=>loadVeiculos(container, opts));
    container.querySelector('[data-sync-all]')?.addEventListener('click',()=>sincronizarTudo(container, opts));
    container.querySelector('[data-diag-bfleet]')?.addEventListener('click',()=>diagnosticarBFleet(container, opts));
    container.querySelector('[data-search]')?.addEventListener('input',(e)=>{state.busca=e.target.value; renderTable(container, opts);});
    container.querySelector('[data-filter]')?.addEventListener('change',(e)=>{state.filtro=e.target.value; renderStats(container); renderTable(container, opts);});
    container.querySelectorAll('[data-kpi-filter]').forEach(card=>card.addEventListener('click',()=>{
      const alvo=card.dataset.kpiFilter;
      state.filtro=(state.filtro===alvo && alvo!=='todos')?'todos':alvo;
      const sel=container.querySelector('[data-filter]'); if(sel) sel.value=state.filtro;
      renderStats(container); renderTable(container, opts);
    }));
    container.querySelector('[data-status-chips]')?.addEventListener('click',(e)=>{
      const btn=e.target.closest('[data-status-filter]'); if(!btn) return;
      state.status=state.status===btn.dataset.statusFilter?'':btn.dataset.statusFilter;
      renderStatusChips(container); renderTable(container, opts);
    });
    container.querySelector('input[name="placa"]')?.addEventListener('input',(e)=>{e.target.value=normalizarPlaca(e.target.value);});
    container.querySelector('input[name="renavam"]')?.addEventListener('input',(e)=>{e.target.value=onlyDigits(e.target.value);});
    loadVeiculos(container, opts);
  }

  window[MODULE_NAME]=window[MODULE_NAME]||{};
  window[MODULE_NAME].openHome=openHome;
})();
