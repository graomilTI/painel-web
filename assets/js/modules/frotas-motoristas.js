import { anexarTermoAssinado, gerarTermoMotorista, termoAnexado } from './frotas-motoristas-termo.js?v=20261016-termo-motorista';

(function () {
  const MODULE_NAME = 'FROTAS_MOTORISTAS';

  const styles = `
    <style>
      .fm-shell{color:#e2e2f0}.fm-head{margin-bottom:18px}.fm-kicker{color:#86efac;text-transform:uppercase;letter-spacing:.14em;font-weight:950;font-size:12px}.fm-title{margin:8px 0 6px;font-size:clamp(24px,2.4vw,34px);letter-spacing:-.04em;color:#f8fafc}.fm-sub{max-width:900px;color:#6b7280;line-height:1.55;margin:0}.fm-card{border:1px solid rgba(148,163,184,.16);border-radius:24px;background:radial-gradient(circle at top left,rgba(34,197,94,.13),transparent 34%),linear-gradient(180deg,rgba(15,23,42,.98),rgba(2,6,23,.98));box-shadow:0 20px 60px rgba(0,0,0,.28);overflow:hidden}.fm-body{padding:18px}.fm-toolbar{display:grid;grid-template-columns:minmax(220px,1fr) 180px auto;gap:10px;margin-bottom:14px}.fm-input,.fm-select{width:100%;height:42px;border:1px solid rgba(148,163,184,.18);border-radius:14px;background:#0d0d18;color:#e2e2f0;padding:0 12px;outline:none;color-scheme:dark}.fm-select option{background:#0d0d18;color:#e2e2f0}.fm-btn{border:0;border-radius:14px;min-height:42px;padding:0 14px;font-weight:950;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:8px}.fm-btn.primary{background:linear-gradient(135deg,#16a34a,#22c55e);color:#052e16}.fm-btn.soft{border:1px solid rgba(34,197,94,.24);background:rgba(34,197,94,.12);color:#86efac}.fm-btn.ghost{border:1px solid rgba(148,163,184,.18);background:rgba(15,23,42,.72);color:#cbd5e1}.fm-btn.danger{border:1px solid rgba(239,68,68,.4);background:rgba(239,68,68,.14);color:#fca5a5}.fm-actions{display:flex;gap:6px}.fm-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px;margin:14px 0}.fm-kpi{border:1px solid rgba(34,197,94,.18);background:rgba(2,6,23,.32);border-radius:14px;padding:12px 14px;min-width:0}.fm-kpi span{display:block;color:#93c5fd;font-size:10px;font-weight:950;letter-spacing:.08em;text-transform:uppercase;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.fm-kpi strong{display:block;margin-top:7px;color:#fff;font-size:22px;line-height:1}.fm-table-wrap{overflow:auto;border:1px solid rgba(148,163,184,.14);border-radius:18px}.fm-table{width:100%;border-collapse:collapse;min-width:900px}.fm-table th{padding:12px 11px;color:#bfdbfe;font-size:11px;letter-spacing:.1em;text-transform:uppercase;text-align:left;border-bottom:1px solid rgba(148,163,184,.16);background:rgba(2,6,23,.38)}.fm-sort{appearance:none;border:0;background:transparent;color:inherit;font:inherit;font-weight:950;text-transform:uppercase;letter-spacing:.1em;cursor:pointer;padding:0;display:inline-flex;align-items:center;gap:6px}.fm-sort:hover{color:#fff}.fm-sort-mark{font-size:10px;color:#86efac}.fm-table td{padding:12px 11px;border-bottom:1px solid rgba(148,163,184,.10);color:#e2e2f0;font-size:13px;vertical-align:top}.fm-table tr:hover td{background:rgba(22,101,52,.08)}.fm-badge{display:inline-flex;align-items:center;gap:6px;border-radius:999px;padding:4px 8px;font-size:10px;font-weight:950;border:1px solid rgba(148,163,184,.18);color:#cbd5e1;background:rgba(15,23,42,.72);white-space:nowrap}.fm-badge.ok{border-color:rgba(34,197,94,.35);background:rgba(22,101,52,.24);color:#bbf7d0}.fm-badge.warn{border-color:rgba(245,158,11,.34);background:rgba(245,158,11,.12);color:#fde68a}.fm-badge.err{border-color:rgba(239,68,68,.34);background:rgba(239,68,68,.12);color:#fecaca}.fm-mini{min-height:32px;border-radius:10px;padding:0 10px;font-size:11px}.fm-form{display:grid;grid-template-columns:repeat(20,minmax(0,1fr));gap:12px;margin:0 0 16px;padding:14px;border:1px solid rgba(34,197,94,.18);background:rgba(2,6,23,.32);border-radius:18px;position:relative}.fm-field label{display:block;margin:0 0 6px;color:#bbf7d0;font-size:11px;font-weight:950;text-transform:uppercase;letter-spacing:.08em}.fm-field.full{grid-column:1/-1}.fm-field.c3{grid-column:span 3}.fm-field.c4{grid-column:span 4}.fm-field.c5{grid-column:span 5}.fm-field.c6{grid-column:span 6}.fm-field textarea{width:100%;min-height:68px;resize:vertical;border:1px solid rgba(148,163,184,.18);border-radius:14px;background:#0d0d18;color:#e2e2f0;padding:12px;outline:none}.fm-note{margin-top:12px;padding:12px 14px;border:1px dashed rgba(34,197,94,.28);border-radius:16px;background:rgba(2,6,23,.26);color:#bfdbfe;font-size:12px;line-height:1.5}.fm-empty{text-align:center;color:#f8fafc;padding:26px!important;font-weight:850}.fm-colab-results{position:absolute;z-index:20;top:100%;left:0;margin-top:4px;width:max(100%,340px);max-height:220px;overflow:auto;border:1px solid rgba(34,197,94,.28);border-radius:14px;background:#0d0d18;box-shadow:0 20px 45px rgba(0,0,0,.45)}.fm-colab-results button{display:block;width:100%;text-align:left;padding:9px 12px;border:0;background:transparent;color:#e2e2f0;cursor:pointer;font-size:12px}.fm-colab-results button:hover{background:rgba(22,101,52,.3)}.fm-toast{position:fixed;right:22px;bottom:22px;z-index:9999;border:1px solid rgba(134,239,172,.32);background:rgba(22,101,52,.96);color:#dcfce7;border-radius:16px;padding:12px 14px;font-weight:950;box-shadow:0 16px 45px rgba(0,0,0,.35);opacity:0;transform:translateY(10px);pointer-events:none;transition:.2s ease}.fm-toast.show{opacity:1;transform:translateY(0)}.fm-actions{flex-wrap:nowrap}.fm-ic{width:34px;height:34px;min-height:34px;padding:0;border-radius:10px;border:1px solid rgba(148,163,184,.18);background:rgba(15,23,42,.72);color:#cbd5e1;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;text-decoration:none;transition:.15s ease}.fm-ic svg{width:16px;height:16px;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}.fm-ic:hover{color:#fff;border-color:rgba(148,163,184,.4)}.fm-ic.termo{border-color:rgba(34,197,94,.30);background:rgba(34,197,94,.12);color:#86efac}.fm-ic.anexo{border-color:rgba(96,165,250,.32);background:rgba(59,130,246,.12);color:#93c5fd}.fm-ic.anexo.feito{border-color:rgba(34,197,94,.30);background:rgba(22,101,52,.24);color:#bbf7d0}.fm-ic.danger{border-color:rgba(239,68,68,.5);background:rgba(239,68,68,.2);color:#fca5a5}.fm-ic:disabled{opacity:.5;cursor:wait}.fm-ic.busy svg{animation:fm-pulse .8s ease-in-out infinite}@keyframes fm-pulse{50%{opacity:.25}}a.fm-badge{text-decoration:none}@media(max-width:1200px){.fm-toolbar{grid-template-columns:1fr 1fr}.fm-grid{grid-template-columns:repeat(2,1fr)}.fm-form{grid-template-columns:repeat(2,1fr)}.fm-form .fm-field:not(.full){grid-column:auto}}@media(max-width:680px){.fm-toolbar,.fm-grid,.fm-form{grid-template-columns:1fr}}
    </style>`;

  const state = { motoristas: [], anexarId: null, loading: false, busca: '', editId: null, formOpen: false, sortKey: 'nome', sortDir: 'asc' };

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

  function termoBadge(m){
    if(!termoAnexado(m)) return '<span class="fm-badge warn">Sem termo</span>';
    const tip = m.termo_origem === 'pasta_termos' ? 'Termo já arquivado na pasta "1 - TERMOS" do Drive' : 'Termo assinado anexado';
    return m.termo_drive_url
      ? `<a class="fm-badge ok" href="${esc(m.termo_drive_url)}" target="_blank" rel="noopener" title="${tip}. Clique para abrir.">✓ Termo</a>`
      : `<span class="fm-badge ok" title="${tip}">✓ Termo</span>`;
  }

  const ICONES = {
    editar: '<svg viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>',
    excluir: '<svg viewBox="0 0 24 24"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></svg>',
    termo: '<svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/><path d="M12 12v6"/><path d="m9 15 3 3 3-3"/></svg>',
    anexar: '<svg viewBox="0 0 24 24"><path d="M21.4 11.1 12.2 20.3a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 0 1 5.7 5.7l-9.2 9.2a2 2 0 0 1-2.8-2.8l8.5-8.5"/></svg>',
    ver: '<svg viewBox="0 0 24 24"><path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></svg>',
  };

  function iconBtn(attr, id, classe, titulo, icone){
    return `<button type="button" class="fm-ic ${classe}" ${attr}="${id}" title="${esc(titulo)}" aria-label="${esc(titulo)}">${icone}</button>`;
  }

  function getFiltered(){
    const busca = norm(state.busca);
    const rows = !busca ? state.motoristas : state.motoristas.filter(m => norm([m.nome, m.matricula, m.cpf, m.telefone, m.email, m.cnh_numero].join(' ')).includes(busca));
    return [...rows].sort(compareRows);
  }

  function compareRows(a, b){
    const av = a[state.sortKey] ?? '';
    const bv = b[state.sortKey] ?? '';
    const r = String(av).localeCompare(String(bv), 'pt-BR', { numeric: true, sensitivity: 'base' });
    return state.sortDir === 'asc' ? r : -r;
  }

  function markFor(key){
    if(state.sortKey !== key) return '';
    return `<span class="fm-sort-mark">${state.sortDir === 'asc' ? '▲' : '▼'}</span>`;
  }

  function refreshSortHeaders(root){
    root.querySelectorAll('[data-sort]').forEach(btn => { btn.innerHTML = `${btn.dataset.label} ${markFor(btn.dataset.sort)}`; });
  }

  function bindSort(root, opts){
    root.querySelectorAll('[data-sort]').forEach(btn => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.sort;
        if(state.sortKey === key) state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
        else { state.sortKey = key; state.sortDir = 'asc'; }
        renderTable(root, opts);
      });
    });
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
      matricula: get('matricula').trim() || null,
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
    set('nome', m?.nome); set('matricula', m?.matricula); set('cpf', m?.cpf); set('telefone', m?.telefone); set('email', m?.email);
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

  async function excluirMotorista(root, opts, id, btn){
    btn.disabled = true;
    const { error } = await opts.supabase.from('frotas_motoristas').delete().eq('id', id);
    if(error){
      toast(error.message || 'Erro ao excluir motorista.', true);
      btn.disabled = false; btn.dataset.confirm = '0'; btn.title = 'Excluir'; btn.classList.remove('danger');
      return;
    }
    toast('Motorista excluído.');
    await loadMotoristas(root, opts);
  }

  function attachDeleteHandlers(root, opts){
    root.querySelectorAll('[data-delete]').forEach(btn => {
      btn.addEventListener('click', () => {
        if(btn.dataset.confirm === '1'){
          clearTimeout(Number(btn.dataset.timer));
          excluirMotorista(root, opts, btn.dataset.delete, btn);
        } else {
          btn.dataset.confirm = '1';
          btn.title = 'Clique de novo para confirmar a exclusão';
          btn.classList.add('danger');
          btn.dataset.timer = String(setTimeout(() => {
            btn.dataset.confirm = '0';
            btn.title = 'Excluir';
            btn.classList.remove('danger');
          }, 4000));
        }
      });
    });
  }

  function usuarioNome(opts){
    const u = opts?.user || opts?.auth?.user || window.AUTH?.user || null;
    return u?.nome || u?.name || u?.email || '';
  }

  function attachTermoHandlers(root, opts){
    const input = root.querySelector('[data-termo-file]');
    root.querySelectorAll('[data-gerar-termo]').forEach(btn => btn.addEventListener('click', async () => {
      const m = state.motoristas.find(x => x.id === btn.dataset.gerarTermo); if(!m) return;
      btn.disabled = true; btn.classList.add('busy');
      try { await gerarTermoMotorista(opts.supabase, m); toast('Termo gerado. Imprima, colha a assinatura e anexe aqui.'); }
      catch(err){ toast(err?.message || 'Erro ao gerar o termo.', true); }
      finally { btn.disabled = false; btn.classList.remove('busy'); }
    }));
    root.querySelectorAll('[data-anexar-termo]').forEach(btn => btn.addEventListener('click', () => {
      state.anexarId = btn.dataset.anexarTermo;
      input.value = '';
      input.click();
    }));
    input.onchange = async () => {
      const file = input.files?.[0]; const id = state.anexarId; state.anexarId = null;
      if(!file || !id) return;
      const m = state.motoristas.find(x => x.id === id); if(!m) return;
      const btn = root.querySelector(`[data-anexar-termo="${id}"]`);
      if(btn){ btn.disabled = true; btn.classList.add('busy'); }
      try {
        const r = await anexarTermoAssinado(opts.supabase, m, file, usuarioNome(opts));
        toast(`Termo de ${m.nome} enviado para a pasta ${r.pasta || 'do condutor'} no Drive.`);
        await loadMotoristas(root, opts);
      } catch(err){
        console.error('[motoristas] anexar termo:', err);
        toast(err?.message || 'Erro ao anexar o termo.', true);
        if(btn){ btn.disabled = false; btn.classList.remove('busy'); }
      }
    };
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
      .eq('ativo', true) // só situação 'Ativo' (view: ativo = situacao = 'Ativo')
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
    root.querySelector('[data-kpi-sem-termo]').textContent = state.motoristas.filter(m => (m.status || 'ATIVO') === 'ATIVO' && !termoAnexado(m)).length;
  }

  function renderTable(root, opts){
    const tbody = root.querySelector('[data-motoristas-table]'); if(!tbody) return;
    refreshSortHeaders(root);
    if(state.loading){ tbody.innerHTML = '<tr><td colspan="7" class="fm-empty">Carregando motoristas...</td></tr>'; return; }
    const rows = getFiltered();
    root.querySelector('[data-count]').textContent = `${rows.length} motorista(s) encontrado(s)`;
    if(!rows.length){ tbody.innerHTML = '<tr><td colspan="7" class="fm-empty">Nenhum motorista cadastrado.</td></tr>'; return; }
    tbody.innerHTML = rows.map(m => `
      <tr>
        <td><strong>${esc(m.nome)}</strong><br><small>${esc(m.cpf || '')}</small></td>
        <td>${esc(m.matricula || '—')}</td>
        <td>${esc(m.telefone || '—')}<br><small>${esc(m.email || '')}</small></td>
        <td>${esc(m.cnh_numero || '—')}<br><small>Validade: ${fmtDateBr(m.cnh_validade)}</small></td>
        <td>${cnhBadge(m)}<br>${termoBadge(m)}</td>
        <td><span class="fm-badge">${esc(m.status || 'ATIVO')}</span></td>
        <td><div class="fm-actions">${iconBtn('data-gerar-termo', m.id, 'termo', 'Gerar termo de utilização (para assinar)', ICONES.termo)}${iconBtn('data-anexar-termo', m.id, termoAnexado(m) ? 'anexo feito' : 'anexo', termoAnexado(m) ? 'Substituir o termo assinado' : 'Anexar termo assinado (vai para a pasta do condutor no Drive)', ICONES.anexar)}${m.termo_drive_url ? `<a class="fm-ic" href="${esc(m.termo_drive_url)}" target="_blank" rel="noopener" title="Abrir o termo no Drive" aria-label="Abrir o termo no Drive">${ICONES.ver}</a>` : ''}${iconBtn('data-edit', m.id, '', 'Editar', ICONES.editar)}${iconBtn('data-delete', m.id, '', 'Excluir', ICONES.excluir)}</div></td>
      </tr>`).join('');
    tbody.querySelectorAll('[data-edit]').forEach(btn => btn.addEventListener('click', () => fillForm(root, state.motoristas.find(m => m.id === btn.dataset.edit))));
    attachDeleteHandlers(root, opts);
    attachTermoHandlers(root, opts);
  }

  function openHome(container, opts = {}){
    container.innerHTML = `${styles}<section class="fm-shell"><div class="fm-head"><div class="fm-kicker">Frotas · Cadastro</div><h1 class="fm-title">Motoristas</h1><p class="fm-sub">Dados dos condutores usados pra sincronizar com o BFleet (nome, telefone, CNH, validade da CNH, endereço e e-mail). Sem CNH cadastrada aqui, o motorista não pode ser registrado como condutor no BFleet.</p></div><div class="fm-card"><div class="fm-body"><div class="fm-toolbar"><input class="fm-input" placeholder="Buscar por nome, matrícula, CPF, telefone, CNH..." data-search><button class="fm-btn primary" type="button" data-toggle-form>+ Novo motorista</button><button class="fm-btn soft" type="button" data-refresh>↻ Atualizar</button></div><div data-form-wrap style="display:none"><form class="fm-form" data-motorista-form><div class="fm-field c4" style="position:relative"><label>Colaborador</label><input class="fm-input" name="nome" placeholder="Digite o nome para buscar" data-nome-input autocomplete="off"><div class="fm-colab-results" data-colab-results style="display:none"></div></div><div class="fm-field c3"><label>CPF</label><input class="fm-input" name="cpf" placeholder="somente números"></div><div class="fm-field c3"><label>Telefone</label><input class="fm-input" name="telefone" placeholder="somente números"></div><div class="fm-field c6"><label>Endereço</label><input class="fm-input" name="endereco" placeholder="Rua, número, bairro, cidade, UF, CEP"></div><div class="fm-field c4"><label>Email</label><input class="fm-input" name="email" type="email"></div><div class="fm-field c5"><label>Matrícula</label><input class="fm-input" name="matricula" placeholder="Matrícula do motorista" autocomplete="off"></div><div class="fm-field c5"><label>CNH (número)</label><input class="fm-input" name="cnh_numero"></div><div class="fm-field c5"><label>Validade da CNH</label><input class="fm-input" name="cnh_validade" type="date"></div><div class="fm-field c5"><label>Status</label><select class="fm-select" name="status"><option>ATIVO</option><option>INATIVO</option></select></div><div class="fm-field full"><label>Observações</label><textarea name="observacoes"></textarea></div><div class="fm-field full" style="display:flex;gap:8px"><button class="fm-btn primary" type="button" data-save-motorista>Salvar motorista</button><button class="fm-btn ghost" type="button" data-cancel-edit>Cancelar edição</button></div></form></div><div class="fm-grid"><div class="fm-kpi"><span>Total</span><strong data-kpi-total>0</strong></div><div class="fm-kpi"><span>Com CNH</span><strong data-kpi-com-cnh>0</strong></div><div class="fm-kpi"><span>Sem CNH</span><strong data-kpi-sem-cnh>0</strong></div><div class="fm-kpi"><span>Ativos</span><strong data-kpi-ativos>0</strong></div><div class="fm-kpi"><span>Ativos sem termo</span><strong data-kpi-sem-termo>0</strong></div></div><p class="fm-sub" data-count>0 motorista(s) encontrado(s)</p><div class="fm-table-wrap"><table class="fm-table"><thead><tr><th><button class="fm-sort" type="button" data-sort="nome" data-label="Nome / CPF">Nome / CPF</button></th><th><button class="fm-sort" type="button" data-sort="matricula" data-label="Matrícula">Matrícula</button></th><th><button class="fm-sort" type="button" data-sort="telefone" data-label="Contato">Contato</button></th><th><button class="fm-sort" type="button" data-sort="cnh_validade" data-label="CNH / Validade">CNH / Validade</button></th><th>Situação (CNH / Termo)</th><th><button class="fm-sort" type="button" data-sort="status" data-label="Status">Status</button></th><th style="width:1%">Ações</th></tr></thead><tbody data-motoristas-table></tbody></table></div><input type="file" data-termo-file accept="application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png" hidden><div class="fm-note">Ao digitar o nome no campo de busca, o painel sugere colaboradores já cadastrados e preenche telefone/e-mail/endereço automaticamente — só falta completar CNH e validade. Esse cadastro é o que permite registrar o motorista como condutor no BFleet (a API exige nome, telefone, CNH, validade, endereço e e-mail).</div></div></div></section>`;

    container.querySelector('[data-save-motorista]')?.addEventListener('click', () => saveMotorista(container, opts));
    container.querySelector('[data-cancel-edit]')?.addEventListener('click', () => resetForm(container));
    container.querySelector('[data-refresh]')?.addEventListener('click', () => loadMotoristas(container, opts));
    container.querySelector('[data-toggle-form]')?.addEventListener('click', () => {
      if(state.formOpen) resetForm(container); else setFormOpen(container, true);
    });
    container.querySelector('[data-search]')?.addEventListener('input', (e) => { state.busca = e.target.value; renderTable(container, opts); });
    bindSort(container, opts);

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
