(function () {
  const MODULE_NAME = 'FROTAS_MOTORISTAS';

  const styles = `
    <style>
      .fm-shell{color:#e2e2f0}.fm-head{margin-bottom:18px}.fm-kicker{color:#86efac;text-transform:uppercase;letter-spacing:.14em;font-weight:950;font-size:12px}.fm-title{margin:8px 0 6px;font-size:clamp(24px,2.4vw,34px);letter-spacing:-.04em;color:#f8fafc}.fm-sub{max-width:900px;color:#6b7280;line-height:1.55;margin:0}.fm-card{border:1px solid rgba(148,163,184,.16);border-radius:24px;background:radial-gradient(circle at top left,rgba(34,197,94,.13),transparent 34%),linear-gradient(180deg,rgba(15,23,42,.98),rgba(2,6,23,.98));box-shadow:0 20px 60px rgba(0,0,0,.28);overflow:hidden}.fm-body{padding:18px}.fm-toolbar{display:grid;grid-template-columns:minmax(220px,1fr) 180px auto;gap:10px;margin-bottom:14px}.fm-input,.fm-select{width:100%;height:42px;border:1px solid rgba(148,163,184,.18);border-radius:14px;background:#0d0d18;color:#e2e2f0;padding:0 12px;outline:none;color-scheme:dark}.fm-select option{background:#0d0d18;color:#e2e2f0}.fm-btn{border:0;border-radius:14px;min-height:42px;padding:0 14px;font-weight:950;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:8px}.fm-btn.primary{background:linear-gradient(135deg,#16a34a,#22c55e);color:#052e16}.fm-btn.soft{border:1px solid rgba(34,197,94,.24);background:rgba(34,197,94,.12);color:#86efac}.fm-btn.ghost{border:1px solid rgba(148,163,184,.18);background:rgba(15,23,42,.72);color:#cbd5e1}.fm-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin:14px 0}.fm-kpi{border:1px solid rgba(34,197,94,.18);background:rgba(2,6,23,.32);border-radius:14px;padding:12px 14px;min-width:0}.fm-kpi span{display:block;color:#93c5fd;font-size:10px;font-weight:950;letter-spacing:.08em;text-transform:uppercase;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.fm-kpi strong{display:block;margin-top:7px;color:#fff;font-size:22px;line-height:1}.fm-table-wrap{overflow:auto;border:1px solid rgba(148,163,184,.14);border-radius:18px}.fm-table{width:100%;border-collapse:collapse;min-width:1000px}.fm-table th{padding:12px 11px;color:#bfdbfe;font-size:11px;letter-spacing:.1em;text-transform:uppercase;text-align:left;border-bottom:1px solid rgba(148,163,184,.16);background:rgba(2,6,23,.38)}.fm-table td{padding:12px 11px;border-bottom:1px solid rgba(148,163,184,.10);color:#e2e2f0;font-size:13px;vertical-align:top}.fm-table tr:hover td{background:rgba(22,101,52,.08)}.fm-badge{display:inline-flex;align-items:center;gap:6px;border-radius:999px;padding:4px 8px;font-size:10px;font-weight:950;border:1px solid rgba(148,163,184,.18);color:#cbd5e1;background:rgba(15,23,42,.72);white-space:nowrap}.fm-badge.ok{border-color:rgba(34,197,94,.35);background:rgba(22,101,52,.24);color:#bbf7d0}.fm-badge.warn{border-color:rgba(245,158,11,.34);background:rgba(245,158,11,.12);color:#fde68a}.fm-badge.err{border-color:rgba(239,68,68,.34);background:rgba(239,68,68,.12);color:#fecaca}.fm-mini{min-height:32px;border-radius:10px;padding:0 10px;font-size:11px}.fm-form{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin:0 0 16px;padding:14px;border:1px solid rgba(34,197,94,.18);background:rgba(2,6,23,.32);border-radius:18px;position:relative}.fm-field label{display:block;margin:0 0 6px;color:#bbf7d0;font-size:11px;font-weight:950;text-transform:uppercase;letter-spacing:.08em}.fm-field.full{grid-column:1/-1}.fm-field textarea{width:100%;min-height:68px;resize:vertical;border:1px solid rgba(148,163,184,.18);border-radius:14px;background:#0d0d18;color:#e2e2f0;padding:12px;outline:none}.fm-note{margin-top:12px;padding:12px 14px;border:1px dashed rgba(34,197,94,.28);border-radius:16px;background:rgba(2,6,23,.26);color:#bfdbfe;font-size:12px;line-height:1.5}.fm-empty{text-align:center;color:#f8fafc;padding:26px!important;font-weight:850}.fm-colab-results{position:absolute;z-index:20;top:100%;left:0;margin-top:4px;width:min(420px,100%);max-height:220px;overflow:auto;border:1px solid rgba(34,197,94,.28);border-radius:14px;background:#0d0d18;box-shadow:0 20px 45px rgba(0,0,0,.45)}.fm-colab-results button{display:block;width:100%;text-align:left;padding:9px 12px;border:0;background:transparent;color:#e2e2f0;cursor:pointer;font-size:12px}.fm-colab-results button:hover{background:rgba(22,101,52,.3)}.fm-toast{position:fixed;right:22px;bottom:22px;z-index:9999;border:1px solid rgba(134,239,172,.32);background:rgba(22,101,52,.96);color:#dcfce7;border-radius:16px;padding:12px 14px;font-weight:950;box-shadow:0 16px 45px rgba(0,0,0,.35);opacity:0;transform:translateY(10px);pointer-events:none;transition:.2s ease}.fm-toast.show{opacity:1;transform:translateY(0)}@media(max-width:1200px){.fm-toolbar{grid-template-columns:1fr 1fr}.fm-grid{grid-template-columns:repeat(2,1fr)}.fm-form{grid-template-columns:repeat(2,1fr)}}@media(max-width:680px){.fm-toolbar,.fm-grid,.fm-form{grid-template-columns:1fr}}
    </style>`;

  const state = { motoristas: [], loading: false, busca: '', editId: null, formOpen: false };

  function setFormOpen(root, open){
    state.formOpen = open;
    const wrap = root.querySelector('[data-form-wrap]');
    if(wrap) wrap.style.display = open ? '' : 'none';
    const toggleBtn = root.querySelector('[data-toggle-form]');
    if(toggleBtn) toggleBtn.textContent = open ? '✕ Fechar cadastro' : '+ Novo motorista';
  }

  function onlyDigits(v){ return String(v||'').replace(/\D/g,''); }
  function norm(v){ return String(v||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase(); }
  function esc(v){ return String(v ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;'}[c])); }
  function toast(msg, error=false){ let el=document.querySelector('.fm-toast'); if(!el){el=document.createElement('div');el.className='fm-toast';document.body.appendChild(el);} el.textContent=msg; el.style.background=error?'rgba(127,29,29,.96)':'rgba(22,101,52,.96)'; el.classList.add('show'); setTimeout(()=>el.classList.remove('show'),3200); }

  function fmtDateBr(iso){
    if(!iso) return '—';
    const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
  }

  function cnhBadge(m){
    if(!m.cnh_numero) return '<span class="fm-badge err">Sem CNH</span>';
    if(m.cnh_validade && new Date(m.cnh_validade) < new Date()) return '<span class="fm-badge warn">CNH vencida</span>';
    return '<span class="fm-badge ok">✓ CNH</span>';
  }

  function contatoBadge(m){
    if(!m.telefone || !m.email) return '<span class="fm-badge warn">Contato incompleto</span>';
    return '<span class="fm-badge ok">✓ Contato</span>';
  }

  function getFiltered(){
    const busca = norm(state.busca);
    if(!busca) return state.motoristas;
    return state.motoristas.filter(m => norm([m.nome, m.cpf, m.telefone, m.email, m.cnh_numero].join(' ')).includes(busca));
  }

  async function loadMotoristas(root, opts){
    state.loading = true; renderTable(root, opts);
    const { data, error } = await opts.supabase.from('frotas_motoristas').select('*').order('nome', { ascending: true });
    if(error){ toast(error.message || 'Erro ao carregar motoristas.', true); state.motoristas = []; }
    else state.motoristas = Array.isArray(data) ? data : [];
    state.loading = false; renderStats(root); renderTable(root, opts);
  }

  function readForm(root){
    const form = root.querySelector('[data-motorista-form]');
    const get = (k) => form?.querySelector(`[name="${k}"]`)?.value ?? '';
    return {
      nome: get('nome').trim(),
      cpf: onlyDigits(get('cpf')) || null,
      telefone: onlyDigits(get('telefone')) || null,
      email: get('email').trim() || null,
      cnh_numero: get('cnh_numero').trim() || null,
      cnh_validade: get('cnh_validade') || null,
      endereco: get('endereco').trim() || null,
      status: get('status') || 'ATIVO',
      observacoes: get('observacoes').trim() || null,
    };
  }

  function fillForm(root, m){
    const form = root.querySelector('[data-motorista-form]'); if(!form) return;
    const set = (k, val) => { const input = form.querySelector(`[name="${k}"]`); if(input) input.value = val ?? ''; };
    state.editId = m?.id || null;
    set('nome', m?.nome); set('cpf', m?.cpf); set('telefone', m?.telefone); set('email', m?.email);
    set('cnh_numero', m?.cnh_numero); set('cnh_validade', m?.cnh_validade ? String(m.cnh_validade).slice(0,10) : '');
    set('endereco', m?.endereco); set('status', m?.status || 'ATIVO'); set('observacoes', m?.observacoes);
    setFormOpen(root, true);
    form.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function resetForm(root){
    state.editId = null;
    root.querySelector('[data-motorista-form]')?.reset();
    setFormOpen(root, false);
  }

  async function saveMotorista(root, opts){
    const payload = readForm(root);
    if(!payload.nome) return toast('Informe o nome do motorista.', true);
    let error;
    if(state.editId){
      ({ error } = await opts.supabase.from('frotas_motoristas').update(payload).eq('id', state.editId));
    } else {
      ({ error } = await opts.supabase.from('frotas_motoristas').insert(payload));
    }
    if(error) return toast(error.message || 'Erro ao salvar motorista.', true);
    toast(state.editId ? 'Motorista atualizado.' : 'Motorista cadastrado.');
    resetForm(root);
    await loadMotoristas(root, opts);
  }

  async function buscarColaborador(root, opts, termo){
    const wrap = root.querySelector('[data-colab-results]');
    if(!wrap) return;
    if(!termo || termo.trim().length < 3){ wrap.innerHTML = ''; wrap.style.display = 'none'; return; }
    const { data, error } = await opts.supabase
      .from('colaboradores_atuais')
      .select('nome,cpf,whatsapp,email_empresa,email_pessoal,endereco,bairro,cidade,estado,cep')
      .ilike('nome', `%${termo.trim()}%`)
      .limit(8);
    if(error || !data?.length){ wrap.innerHTML = ''; wrap.style.display = 'none'; return; }
    wrap.innerHTML = data.map((c, idx) => `<button type="button" data-colab-idx="${idx}">${esc(c.nome)}</button>`).join('');
    wrap.style.display = 'block';
    wrap.querySelectorAll('[data-colab-idx]').forEach(btn => {
      btn.addEventListener('click', () => {
        const c = data[Number(btn.dataset.colabIdx)];
        const form = root.querySelector('[data-motorista-form]');
        const set = (k, val) => { const input = form.querySelector(`[name="${k}"]`); if(input) input.value = val ?? ''; };
        set('nome', c.nome);
        set('cpf', onlyDigits(c.cpf));
        set('telefone', onlyDigits(c.whatsapp));
        set('email', c.email_empresa || c.email_pessoal || '');
        const endereco = [c.endereco, c.bairro, c.cidade, c.estado, c.cep].filter(Boolean).join(', ');
        set('endereco', endereco);
        wrap.innerHTML = ''; wrap.style.display = 'none';
        toast('Dados do colaborador preenchidos. Confira e complete CNH/validade.');
      });
    });
  }

  function renderStats(root){
    const total = state.motoristas.length;
    const comCnh = state.motoristas.filter(m => m.cnh_numero).length;
    const semCnh = total - comCnh;
    const ativos = state.motoristas.filter(m => (m.status || 'ATIVO') === 'ATIVO').length;
    root.querySelector('[data-kpi-total]').textContent = total;
    root.querySelector('[data-kpi-com-cnh]').textContent = comCnh;
    root.querySelector('[data-kpi-sem-cnh]').textContent = semCnh;
    root.querySelector('[data-kpi-ativos]').textContent = ativos;
  }

  function renderTable(root, opts){
    const tbody = root.querySelector('[data-motoristas-table]'); if(!tbody) return;
    if(state.loading){ tbody.innerHTML = '<tr><td colspan="7" class="fm-empty">Carregando motoristas...</td></tr>'; return; }
    const rows = getFiltered();
    root.querySelector('[data-count]').textContent = `${rows.length} motorista(s) encontrado(s)`;
    if(!rows.length){ tbody.innerHTML = '<tr><td colspan="7" class="fm-empty">Nenhum motorista cadastrado.</td></tr>'; return; }
    tbody.innerHTML = rows.map(m => `
      <tr>
        <td><strong>${esc(m.nome)}</strong><br><small>${esc(m.cpf || '')}</small></td>
        <td>${esc(m.telefone || '—')}<br><small>${esc(m.email || '')}</small></td>
        <td>${esc(m.cnh_numero || '—')}<br><small>Validade: ${fmtDateBr(m.cnh_validade)}</small></td>
        <td>${esc((m.endereco || '—')).slice(0,60)}</td>
        <td>${cnhBadge(m)}<br>${contatoBadge(m)}</td>
        <td><span class="fm-badge">${esc(m.status || 'ATIVO')}</span></td>
        <td><button class="fm-btn ghost fm-mini" data-edit="${m.id}">Editar</button></td>
      </tr>`).join('');
    tbody.querySelectorAll('[data-edit]').forEach(btn => btn.addEventListener('click', () => fillForm(root, state.motoristas.find(m => m.id === btn.dataset.edit))));
  }

  function openHome(container, opts = {}){
    container.innerHTML = `${styles}<section class="fm-shell"><div class="fm-head"><div class="fm-kicker">Frotas · Cadastro</div><h1 class="fm-title">Motoristas</h1><p class="fm-sub">Dados dos condutores usados pra sincronizar com o BFleet (nome, telefone, CNH, validade da CNH, endereço e e-mail). Sem CNH cadastrada aqui, o motorista não pode ser registrado como condutor no BFleet.</p></div><div class="fm-card"><div class="fm-body"><div class="fm-toolbar"><input class="fm-input" placeholder="Buscar por nome, CPF, telefone, CNH..." data-search><button class="fm-btn primary" type="button" data-toggle-form>+ Novo motorista</button><button class="fm-btn soft" type="button" data-refresh>↻ Atualizar</button></div><div data-form-wrap style="display:none"><form class="fm-form" data-motorista-form><div class="fm-field full" style="position:relative"><label>Buscar colaborador pra preencher automaticamente</label><input class="fm-input" name="nome" placeholder="Digite o nome do motorista" data-nome-input autocomplete="off"><div class="fm-colab-results" data-colab-results style="display:none"></div></div><div class="fm-field"><label>CPF</label><input class="fm-input" name="cpf" placeholder="somente números"></div><div class="fm-field"><label>Telefone</label><input class="fm-input" name="telefone" placeholder="somente números"></div><div class="fm-field"><label>Email</label><input class="fm-input" name="email" type="email"></div><div class="fm-field"><label>Status</label><select class="fm-select" name="status"><option>ATIVO</option><option>INATIVO</option></select></div><div class="fm-field"><label>CNH (número)</label><input class="fm-input" name="cnh_numero"></div><div class="fm-field"><label>Validade da CNH</label><input class="fm-input" name="cnh_validade" type="date"></div><div class="fm-field full"><label>Endereço</label><input class="fm-input" name="endereco" placeholder="Rua, número, bairro, cidade, UF, CEP"></div><div class="fm-field full"><label>Observações</label><textarea name="observacoes"></textarea></div><div class="fm-field full" style="display:flex;gap:8px"><button class="fm-btn primary" type="button" data-save-motorista>Salvar motorista</button><button class="fm-btn ghost" type="button" data-cancel-edit>Cancelar edição</button></div></form></div><div class="fm-grid"><div class="fm-kpi"><span>Total</span><strong data-kpi-total>0</strong></div><div class="fm-kpi"><span>Com CNH</span><strong data-kpi-com-cnh>0</strong></div><div class="fm-kpi"><span>Sem CNH</span><strong data-kpi-sem-cnh>0</strong></div><div class="fm-kpi"><span>Ativos</span><strong data-kpi-ativos>0</strong></div></div><p class="fm-sub" data-count>0 motorista(s) encontrado(s)</p><div class="fm-table-wrap"><table class="fm-table"><thead><tr><th>Nome / CPF</th><th>Contato</th><th>CNH / Validade</th><th>Endereço</th><th>Situação</th><th>Status</th><th>Ações</th></tr></thead><tbody data-motoristas-table></tbody></table></div><div class="fm-note">Ao digitar o nome no campo de busca, o painel sugere colaboradores já cadastrados e preenche telefone/e-mail/endereço automaticamente — só falta completar CNH e validade. Esse cadastro é o que permite registrar o motorista como condutor no BFleet (a API exige nome, telefone, CNH, validade, endereço e e-mail).</div></div></div></section>`;

    container.querySelector('[data-save-motorista]')?.addEventListener('click', () => saveMotorista(container, opts));
    container.querySelector('[data-cancel-edit]')?.addEventListener('click', () => resetForm(container));
    container.querySelector('[data-refresh]')?.addEventListener('click', () => loadMotoristas(container, opts));
    container.querySelector('[data-toggle-form]')?.addEventListener('click', () => {
      if(state.formOpen) resetForm(container); else setFormOpen(container, true);
    });
    container.querySelector('[data-search]')?.addEventListener('input', (e) => { state.busca = e.target.value; renderTable(container, opts); });

    let debounce;
    container.querySelector('[data-nome-input]')?.addEventListener('input', (e) => {
      clearTimeout(debounce);
      const termo = e.target.value;
      debounce = setTimeout(() => buscarColaborador(container, opts, termo), 250);
    });
    document.addEventListener('click', (e) => {
      const wrap = container.querySelector('[data-colab-results]');
      if(wrap && !wrap.contains(e.target) && e.target !== container.querySelector('[data-nome-input]')) { wrap.style.display = 'none'; }
    });

    loadMotoristas(container, opts);
  }

  window[MODULE_NAME] = window[MODULE_NAME] || {};
  window[MODULE_NAME].openHome = openHome;
})();
