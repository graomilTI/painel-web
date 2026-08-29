(function () {
  const MODULE_NAME = 'FROTAS_TROCA_OLEO';
  const TABLE = 'frotas_trocas_oleo';
  const BUCKET = 'notas-fiscais';
  const AVISO_DIAS = 15;
  const AVISO_KM = 500;

  const styles = `
    <style>
      .fm-shell{color:#e2e2f0}.fm-head{margin-bottom:18px}.fm-kicker{color:#86efac;text-transform:uppercase;letter-spacing:.14em;font-weight:950;font-size:12px}.fm-title{margin:8px 0 6px;font-size:clamp(24px,2.4vw,34px);letter-spacing:-.04em;color:#f8fafc}.fm-sub{max-width:900px;color:#6b7280;line-height:1.55;margin:0}.fm-card{border:1px solid rgba(148,163,184,.16);border-radius:24px;background:radial-gradient(circle at top left,rgba(34,197,94,.13),transparent 34%),linear-gradient(180deg,rgba(15,23,42,.98),rgba(2,6,23,.98));box-shadow:0 20px 60px rgba(0,0,0,.28);overflow:hidden}.fm-body{padding:18px}.fm-toolbar{display:grid;grid-template-columns:minmax(220px,1fr) auto auto;gap:10px;margin-bottom:14px}.fm-input,.fm-select{width:100%;height:42px;border:1px solid rgba(148,163,184,.18);border-radius:14px;background:#0d0d18;color:#e2e2f0;padding:0 12px;outline:none;color-scheme:dark}.fm-select option{background:#0d0d18;color:#e2e2f0}.fm-btn{border:0;border-radius:14px;min-height:42px;padding:0 14px;font-weight:950;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:8px}.fm-btn.primary{background:linear-gradient(135deg,#16a34a,#22c55e);color:#052e16}.fm-btn.soft{border:1px solid rgba(34,197,94,.24);background:rgba(34,197,94,.12);color:#86efac}.fm-btn.ghost{border:1px solid rgba(148,163,184,.18);background:rgba(15,23,42,.72);color:#cbd5e1}.fm-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin:14px 0}.fm-kpi{border:1px solid rgba(34,197,94,.18);background:rgba(2,6,23,.32);border-radius:14px;padding:12px 14px;min-width:0}.fm-kpi span{display:block;color:#93c5fd;font-size:10px;font-weight:950;letter-spacing:.08em;text-transform:uppercase;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.fm-kpi strong{display:block;margin-top:7px;color:#fff;font-size:22px;line-height:1}.fm-table-wrap{overflow:auto;border:1px solid rgba(148,163,184,.14);border-radius:18px}.fm-table{width:100%;border-collapse:collapse;min-width:1000px}.fm-table th{padding:12px 11px;color:#bfdbfe;font-size:11px;letter-spacing:.1em;text-transform:uppercase;text-align:left;border-bottom:1px solid rgba(148,163,184,.16);background:rgba(2,6,23,.38)}.fm-table td{padding:12px 11px;border-bottom:1px solid rgba(148,163,184,.10);color:#e2e2f0;font-size:13px;vertical-align:top}.fm-table tr:hover td{background:rgba(22,101,52,.08)}.fm-badge{display:inline-flex;align-items:center;gap:6px;border-radius:999px;padding:4px 8px;font-size:10px;font-weight:950;border:1px solid rgba(148,163,184,.18);color:#cbd5e1;background:rgba(15,23,42,.72);white-space:nowrap}.fm-badge.ok{border-color:rgba(34,197,94,.35);background:rgba(22,101,52,.24);color:#bbf7d0}.fm-badge.warn{border-color:rgba(245,158,11,.34);background:rgba(245,158,11,.12);color:#fde68a}.fm-badge.err{border-color:rgba(239,68,68,.34);background:rgba(239,68,68,.12);color:#fecaca}.fm-mini{min-height:32px;border-radius:10px;padding:0 10px;font-size:11px}.fm-form{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin:0 0 16px;padding:14px;border:1px solid rgba(34,197,94,.18);background:rgba(2,6,23,.32);border-radius:18px}.fm-field label{display:block;margin:0 0 6px;color:#bbf7d0;font-size:11px;font-weight:950;text-transform:uppercase;letter-spacing:.08em}.fm-field.full{grid-column:1/-1}.fm-field textarea{width:100%;min-height:68px;resize:vertical;border:1px solid rgba(148,163,184,.18);border-radius:14px;background:#0d0d18;color:#e2e2f0;padding:12px;outline:none}.fm-note{margin-top:12px;padding:12px 14px;border:1px dashed rgba(34,197,94,.28);border-radius:16px;background:rgba(2,6,23,.26);color:#bfdbfe;font-size:12px;line-height:1.5}.fm-empty{text-align:center;color:#f8fafc;padding:26px!important;font-weight:850}.fm-toast{position:fixed;right:22px;bottom:22px;z-index:9999;border:1px solid rgba(134,239,172,.32);background:rgba(22,101,52,.96);color:#dcfce7;border-radius:16px;padding:12px 14px;font-weight:950;box-shadow:0 16px 45px rgba(0,0,0,.35);opacity:0;transform:translateY(10px);pointer-events:none;transition:.2s ease}.fm-toast.show{opacity:1;transform:translateY(0)}@media(max-width:1200px){.fm-toolbar{grid-template-columns:1fr 1fr}.fm-grid{grid-template-columns:repeat(2,1fr)}.fm-form{grid-template-columns:repeat(2,1fr)}}@media(max-width:680px){.fm-toolbar,.fm-grid,.fm-form{grid-template-columns:1fr}}
    </style>`;

  const state = { registros: [], veiculos: [], loading: false, busca: '', editId: null, formOpen: false };

  function esc(v){ return String(v ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;'}[c])); }
  function norm(v){ return String(v||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase(); }
  function toast(msg, error=false){ let el=document.querySelector('.fm-toast'); if(!el){el=document.createElement('div');el.className='fm-toast';document.body.appendChild(el);} el.textContent=msg; el.style.background=error?'rgba(127,29,29,.96)':'rgba(22,101,52,.96)'; el.classList.add('show'); setTimeout(()=>el.classList.remove('show'),3200); }
  function fmtDateBr(iso){ if(!iso) return '—'; const m=String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[3]}/${m[2]}/${m[1]}` : iso; }
  function fmtKm(v){ return v==null||v==='' ? '—' : `${Number(v).toLocaleString('pt-BR')} km`; }
  function fmtRs(v){ return v==null||v==='' ? '—' : Number(v).toLocaleString('pt-BR',{style:'currency',currency:'BRL'}); }

  function setFormOpen(root, open){
    state.formOpen = open;
    const wrap = root.querySelector('[data-form-wrap]');
    if(wrap) wrap.style.display = open ? '' : 'none';
    const toggleBtn = root.querySelector('[data-toggle-form]');
    if(toggleBtn) toggleBtn.textContent = open ? '✕ Fechar cadastro' : '+ Nova troca de óleo';
  }

  function veiculoLabel(v){ return `${v.placa || '—'}${v.marca_modelo ? ' · ' + v.marca_modelo : ''}`; }

  function vencimentoStatus(row, hodometroAtual){
    const hoje = new Date(); hoje.setHours(0,0,0,0);
    let vencido = false, aviso = false, temPrevisao = false;
    if(row.proxima_data){
      temPrevisao = true;
      const d = new Date(`${row.proxima_data}T00:00:00`);
      const diffDias = Math.round((d - hoje) / 86400000);
      if(diffDias < 0) vencido = true; else if(diffDias <= AVISO_DIAS) aviso = true;
    }
    if(row.proxima_km != null && hodometroAtual != null){
      temPrevisao = true;
      const diffKm = Number(row.proxima_km) - Number(hodometroAtual);
      if(diffKm < 0) vencido = true; else if(diffKm <= AVISO_KM) aviso = true;
    }
    if(!temPrevisao) return 'sem-previsao';
    if(vencido) return 'vencida';
    if(aviso) return 'proxima';
    return 'em-dia';
  }

  const STATUS_BADGE = {
    'sem-previsao': '<span class="fm-badge">Sem previsão</span>',
    vencida: '<span class="fm-badge err">Vencida</span>',
    proxima: '<span class="fm-badge warn">Próxima</span>',
    'em-dia': '<span class="fm-badge ok">Em dia</span>',
  };
  function vencimentoBadge(row, hodometroAtual){ return STATUS_BADGE[vencimentoStatus(row, hodometroAtual)]; }

  function getFiltered(){
    const busca = norm(state.busca);
    if(!busca) return state.registros;
    return state.registros.filter(r => norm([r.__placa, r.tipo_oleo].join(' ')).includes(busca));
  }

  async function loadVeiculos(opts){
    const { data, error } = await opts.supabase.from('frotas_veiculos').select('id,placa,marca_modelo,hodometro').order('placa', { ascending: true });
    state.veiculos = error ? [] : (data || []);
  }

  async function loadRegistros(root, opts){
    state.loading = true; renderTable(root, opts);
    const { data, error } = await opts.supabase.from(TABLE).select('*').order('data_execucao', { ascending: false });
    if(error){ toast(error.message || 'Erro ao carregar trocas de óleo.', true); state.registros = []; }
    else {
      const veicPorId = new Map(state.veiculos.map(v => [v.id, v]));
      state.registros = (data || []).map(r => ({ ...r, __placa: veicPorId.get(r.veiculo_id)?.placa || '', __hodometro: veicPorId.get(r.veiculo_id)?.hodometro ?? null }));
    }
    state.loading = false; renderStats(root); renderTable(root, opts);
  }

  function readForm(root){
    const form = root.querySelector('[data-registro-form]');
    const get = (k) => form?.querySelector(`[name="${k}"]`)?.value ?? '';
    return {
      veiculo_id: get('veiculo_id') || null,
      tipo_oleo: get('tipo_oleo').trim() || null,
      data_execucao: get('data_execucao') || new Date().toISOString().slice(0,10),
      km_execucao: get('km_execucao') ? Number(get('km_execucao')) : null,
      custo: get('custo') ? Number(get('custo').replace(',', '.')) : null,
      proxima_data: get('proxima_data') || null,
      proxima_km: get('proxima_km') ? Number(get('proxima_km')) : null,
      observacoes: get('observacoes').trim() || null,
    };
  }

  function fillForm(root, r){
    const form = root.querySelector('[data-registro-form]'); if(!form) return;
    const set = (k, val) => { const input = form.querySelector(`[name="${k}"]`); if(input) input.value = val ?? ''; };
    state.editId = r?.id || null;
    set('veiculo_id', r?.veiculo_id); set('tipo_oleo', r?.tipo_oleo);
    set('data_execucao', r?.data_execucao ? String(r.data_execucao).slice(0,10) : new Date().toISOString().slice(0,10));
    set('km_execucao', r?.km_execucao); set('custo', r?.custo);
    set('proxima_data', r?.proxima_data ? String(r.proxima_data).slice(0,10) : '');
    set('proxima_km', r?.proxima_km); set('observacoes', r?.observacoes);
    setFormOpen(root, true);
    form.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function resetForm(root){
    state.editId = null;
    root.querySelector('[data-registro-form]')?.reset();
    const anexo = root.querySelector('[name="anexo"]'); if(anexo) anexo.value = '';
    setFormOpen(root, false);
  }

  async function uploadAnexo(opts, file, veiculoId){
    if(!file) return null;
    const path = `frotas-troca-oleo/${veiculoId}/${Date.now()}-${file.name}`;
    const { error } = await opts.supabase.storage.from(BUCKET).upload(path, file, { upsert: true });
    if(error) throw error;
    const { data } = opts.supabase.storage.from(BUCKET).getPublicUrl(path);
    return data?.publicUrl || null;
  }

  async function saveRegistro(root, opts){
    const payload = readForm(root);
    if(!payload.veiculo_id) return toast('Selecione o veículo.', true);
    const fileInput = root.querySelector('[name="anexo"]');
    const file = fileInput?.files?.[0] || null;
    try {
      if(file) payload.anexo_url = await uploadAnexo(opts, file, payload.veiculo_id);
      let error;
      if(state.editId) ({ error } = await opts.supabase.from(TABLE).update(payload).eq('id', state.editId));
      else ({ error } = await opts.supabase.from(TABLE).insert(payload));
      if(error) throw error;
      toast(state.editId ? 'Troca de óleo atualizada.' : 'Troca de óleo registrada.');
      resetForm(root);
      await loadRegistros(root, opts);
    } catch(err){
      toast(err.message || 'Erro ao salvar troca de óleo.', true);
    }
  }

  function renderStats(root){
    const total = state.registros.length;
    let vencidas = 0, proximas = 0, emDia = 0;
    state.registros.forEach(r => {
      const status = vencimentoStatus(r, r.__hodometro);
      if(status === 'vencida') vencidas++; else if(status === 'proxima') proximas++; else if(status === 'em-dia') emDia++;
    });
    root.querySelector('[data-kpi-total]').textContent = total;
    root.querySelector('[data-kpi-vencidas]').textContent = vencidas;
    root.querySelector('[data-kpi-proximas]').textContent = proximas;
    root.querySelector('[data-kpi-emdia]').textContent = emDia;
  }

  function renderTable(root, opts){
    const tbody = root.querySelector('[data-registros-table]'); if(!tbody) return;
    if(state.loading){ tbody.innerHTML = '<tr><td colspan="7" class="fm-empty">Carregando trocas de óleo...</td></tr>'; return; }
    const rows = getFiltered();
    root.querySelector('[data-count]').textContent = `${rows.length} registro(s) encontrado(s)`;
    if(!rows.length){ tbody.innerHTML = '<tr><td colspan="7" class="fm-empty">Nenhuma troca de óleo registrada.</td></tr>'; return; }
    tbody.innerHTML = rows.map(r => `
      <tr>
        <td><strong>${esc(r.__placa || '—')}</strong></td>
        <td>${esc(r.tipo_oleo || '—')}</td>
        <td>${fmtDateBr(r.data_execucao)}<br><small>${fmtKm(r.km_execucao)}</small></td>
        <td>${fmtRs(r.custo)}</td>
        <td>${r.proxima_data ? fmtDateBr(r.proxima_data) : '—'}<br><small>${r.proxima_km!=null ? fmtKm(r.proxima_km) : ''}</small></td>
        <td>${vencimentoBadge(r, r.__hodometro)}</td>
        <td><button class="fm-btn ghost fm-mini" data-edit="${r.id}">Editar</button></td>
      </tr>`).join('');
    tbody.querySelectorAll('[data-edit]').forEach(btn => btn.addEventListener('click', () => fillForm(root, state.registros.find(r => r.id === btn.dataset.edit))));
  }

  function openHome(container, opts = {}){
    container.innerHTML = `${styles}<section class="fm-shell"><div class="fm-head"><div class="fm-kicker">Frotas · Troca de Óleo</div><h1 class="fm-title">Troca de Óleo</h1><p class="fm-sub">Registro de trocas de óleo por veículo, com aviso de próxima troca por data ou km.</p></div><div class="fm-card"><div class="fm-body"><div class="fm-toolbar"><input class="fm-input" placeholder="Buscar por placa ou tipo de óleo..." data-search><button class="fm-btn primary" type="button" data-toggle-form>+ Nova troca de óleo</button><button class="fm-btn soft" type="button" data-refresh>↻ Atualizar</button></div><div data-form-wrap style="display:none"><form class="fm-form" data-registro-form><div class="fm-field"><label>Veículo</label><select class="fm-select" name="veiculo_id" data-veiculo-select><option value="">Selecione...</option></select></div><div class="fm-field"><label>Tipo de óleo</label><input class="fm-input" name="tipo_oleo" placeholder="Ex: 15W40 mineral"></div><div class="fm-field"><label>Data da troca</label><input class="fm-input" name="data_execucao" type="date"></div><div class="fm-field"><label>Km na troca</label><input class="fm-input" name="km_execucao" type="number" min="0"></div><div class="fm-field"><label>Custo (R$)</label><input class="fm-input" name="custo" type="number" min="0" step="0.01"></div><div class="fm-field"><label>Próxima troca (data)</label><input class="fm-input" name="proxima_data" type="date"></div><div class="fm-field"><label>Próxima troca (km)</label><input class="fm-input" name="proxima_km" type="number" min="0"></div><div class="fm-field"><label>Anexo (nota fiscal)</label><input class="fm-input" name="anexo" type="file" accept=".pdf,.jpg,.jpeg,.png"></div><div class="fm-field full"><label>Observações</label><textarea name="observacoes"></textarea></div><div class="fm-field full" style="display:flex;gap:8px"><button class="fm-btn primary" type="button" data-save-registro>Salvar troca de óleo</button><button class="fm-btn ghost" type="button" data-cancel-edit>Cancelar edição</button></div></form></div><div class="fm-grid"><div class="fm-kpi"><span>Total</span><strong data-kpi-total>0</strong></div><div class="fm-kpi"><span>Vencidas</span><strong data-kpi-vencidas>0</strong></div><div class="fm-kpi"><span>Próximas</span><strong data-kpi-proximas>0</strong></div><div class="fm-kpi"><span>Em dia</span><strong data-kpi-emdia>0</strong></div></div><p class="fm-sub" data-count>0 registro(s) encontrado(s)</p><div class="fm-table-wrap"><table class="fm-table"><thead><tr><th>Veículo</th><th>Óleo</th><th>Data / Km</th><th>Custo</th><th>Próxima</th><th>Situação</th><th>Ações</th></tr></thead><tbody data-registros-table></tbody></table></div><div class="fm-note">"Vencida" aparece quando a data ou km da próxima troca já passou; "Próxima" avisa com ${AVISO_DIAS} dias ou ${AVISO_KM.toLocaleString('pt-BR')}km de antecedência. O km atual do veículo vem do hodômetro cadastrado em Frotas &gt; Veículos.</div></div></div></section>`;


    container.querySelector('[data-save-registro]')?.addEventListener('click', () => saveRegistro(container, opts));
    container.querySelector('[data-cancel-edit]')?.addEventListener('click', () => resetForm(container));
    container.querySelector('[data-refresh]')?.addEventListener('click', () => loadRegistros(container, opts));
    container.querySelector('[data-search]')?.addEventListener('input', (e) => { state.busca = e.target.value; renderTable(container, opts); });
    container.querySelector('[data-toggle-form]')?.addEventListener('click', () => {
      if(state.formOpen) resetForm(container); else setFormOpen(container, true);
    });

    (async () => {
      await loadVeiculos(opts);
      const select = container.querySelector('[data-veiculo-select]');
      if(select) select.insertAdjacentHTML('beforeend', state.veiculos.map(v => `<option value="${esc(v.id)}">${esc(veiculoLabel(v))}</option>`).join(''));
      await loadRegistros(container, opts);
    })();
  }

  window[MODULE_NAME] = window[MODULE_NAME] || {};
  window[MODULE_NAME].openHome = openHome;
})();
