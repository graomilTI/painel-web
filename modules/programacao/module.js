(function(){
  const STEP_ORDER = ["A","B","C","D","E"];
  const STEP_META = {
    A: { title: "Disponibilidade", hint: "Selecione quem vai trabalhar no período e registre observações." },
    B: { title: "Hospedagem", hint: "Informe necessidade de hospedagem, hotel e cidade." },
    C: { title: "Alimentação", hint: "Lance valores ou marque necessidade de alimentação." },
    D: { title: "Deslocamento", hint: "Registre tipo de deslocamento, rota e valores." },
    E: { title: "Extras", hint: "Cadastre despesas extras e observações finais." }
  };

  function esc(s){
    return String(s == null ? '' : s)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;')
      .replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }

  function onlyDigits(v){ return String(v||'').replace(/\D+/g,''); }
  function todayBR(){
    const d = new Date();
    const pad = n => String(n).padStart(2,'0');
    return `${pad(d.getDate())}/${pad(d.getMonth()+1)}/${d.getFullYear()}`;
  }
  function toInputDate(br){
    const m = String(br||'').match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if(!m) return '';
    return `${m[3]}-${m[2]}-${m[1]}`;
  }
  function fromInputDate(iso){
    const m = String(iso||'').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if(!m) return '';
    return `${m[3]}/${m[2]}/${m[1]}`;
  }
  function money(v){
    const n = Number(v || 0);
    return isFinite(n) ? n.toLocaleString('pt-BR',{style:'currency',currency:'BRL'}) : 'R$ 0,00';
  }

  function callExec(api, body){
    return api.post('/exec', body);
  }

  async function tryLoadContext(api, payload){
    const attempts = [
      { module:'programacao', action:'carregar_contexto', payload },
      { module:'programacao', action:'contexto', payload },
      { action:'programacao_contexto', ...payload },
    ];
    let lastErr = null;
    for(const body of attempts){
      try{
        const res = await callExec(api, body);
        if(res && (res.ok !== false)) return res;
      }catch(err){ lastErr = err; }
    }
    throw lastErr || new Error('Não foi possível carregar o contexto.');
  }

  async function trySaveStep(api, payload){
    const attempts = [
      { module:'programacao', action:'salvar_etapa', payload },
      { module:'programacao', action:'salvar', payload },
      { action:'programacao_salvar_etapa', ...payload }
    ];
    let lastErr = null;
    for(const body of attempts){
      try{
        const res = await callExec(api, body);
        if(res && (res.ok !== false)) return res;
      }catch(err){ lastErr = err; }
    }
    throw lastErr || new Error('Não foi possível salvar a etapa.');
  }

  function normalizeColabs(rawList, profile){
    const list = Array.isArray(rawList) ? rawList : [];
    if(list.length) return list.map((item, i)=>({
      id: item.id || item.ID || item.cpf || item.CPF || `col-${i+1}`,
      nome: item.nome || item.Nome || item.colaborador || item.Colaborador || `Colaborador ${i+1}`,
      funcao: item.funcao || item.Funcao || item.cargo || item.Cargo || '',
      equipe: item.equipe || item.Equipe || item.supervisao || item.Supervisao || '',
      bloqueado: !!(item.bloqueado || item.Bloqueado || item.indisponivel),
      motivo: item.motivo || item.Motivo || item.observacao || item.Observacao || ''
    }));

    const nomeBase = profile.nome || profile.Nome || 'Gestor';
    return [
      { id:'demo-1', nome:`${nomeBase} - Equipe 1`, funcao:'Conferente', equipe:'Equipe A', bloqueado:false, motivo:'' },
      { id:'demo-2', nome:`${nomeBase} - Equipe 2`, funcao:'Classificador', equipe:'Equipe A', bloqueado:false, motivo:'' },
      { id:'demo-3', nome:`${nomeBase} - Equipe 3`, funcao:'Motorista', equipe:'Equipe B', bloqueado:true, motivo:'Atestado ativo / indisponibilidade' }
    ];
  }

  function defaultSups(profile){
    const candidates = [
      profile.supervisao,
      profile.Supervisao,
      profile.supervisão,
      profile.nome,
      profile.Nome
    ].filter(Boolean);
    return [...new Set(candidates.map(v=>String(v).trim()).filter(Boolean))];
  }

  function buildShell(){
    return `
      <style>
        .prog-wrap{display:flex;flex-direction:column;gap:14px}
        .prog-grid{display:grid;grid-template-columns:1.2fr .8fr;gap:14px}
        .prog-grid-2{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}
        .prog-toolbar{display:grid;grid-template-columns:repeat(3,minmax(0,1fr)) auto;gap:12px;align-items:end}
        .prog-stepbar{display:flex;gap:8px;flex-wrap:wrap}
        .prog-step{min-width:42px;height:42px;border-radius:14px;border:1px solid var(--border);background:rgba(2,6,23,.5);color:var(--text);cursor:pointer;font-weight:800}
        .prog-step.active{background:rgba(22,163,74,.18);border-color:rgba(22,163,74,.65)}
        .prog-step small{display:none}
        .prog-card{background:rgba(2,6,23,.32);border:1px solid var(--border);border-radius:18px;padding:14px}
        .prog-stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}
        .prog-stat b{display:block;font-size:24px;margin-top:8px}
        .prog-list{display:flex;flex-direction:column;gap:12px;max-height:58vh;overflow:auto;padding-right:4px}
        .prog-item{border:1px solid var(--border);background:rgba(2,6,23,.42);border-radius:18px;padding:14px;display:grid;grid-template-columns:1.2fr .8fr;gap:12px}
        .prog-item.is-blocked{opacity:.75;border-color:rgba(239,68,68,.35)}
        .prog-item .meta{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px}
        .prog-tag{font-size:12px;color:var(--muted);padding:4px 8px;border-radius:999px;border:1px solid var(--border);background:rgba(15,23,42,.72)}
        .prog-fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
        .prog-fields .full{grid-column:1 / -1}
        .prog-empty{padding:18px;border:1px dashed var(--border);border-radius:16px;color:var(--muted);text-align:center}
        .prog-headline{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}
        .prog-actions{display:flex;gap:10px;flex-wrap:wrap}
        .prog-note{font-size:12px;color:var(--muted)}
        .prog-check{display:flex;align-items:center;gap:10px;font-weight:700}
        .prog-check input{width:18px;height:18px}
        .prog-badge-warn{border-color:rgba(245,158,11,.4)!important;background:rgba(245,158,11,.12)!important;color:#fde68a!important}
        @media (max-width: 980px){
          .prog-grid,.prog-item,.prog-toolbar,.prog-grid-2,.prog-stats{grid-template-columns:1fr}
        }
      </style>
      <div class="prog-wrap">
        <div class="prog-grid">
          <div class="prog-card">
            <div class="prog-headline">
              <div>
                <h3 style="margin:0 0 6px">Programação</h3>
                <div class="small">Carregue o contexto do dia e avance pelas etapas A–E.</div>
              </div>
              <div class="notice" id="progStatus">Nenhum contexto carregado.</div>
            </div>
            <div style="height:12px"></div>
            <div class="prog-toolbar">
              <div>
                <div class="label">Data referência</div>
                <input class="input" id="progDate" type="date" />
              </div>
              <div>
                <div class="label">Supervisão</div>
                <select class="input" id="progSup"></select>
              </div>
              <div>
                <div class="label">Buscar colaborador</div>
                <input class="input" id="progSearch" placeholder="Nome, equipe ou função" />
              </div>
              <button class="btn primary" id="progLoad">Carregar contexto</button>
            </div>
            <div style="height:14px"></div>
            <div class="prog-stepbar" id="progSteps"></div>
          </div>
          <div class="prog-card">
            <h3 style="margin:0 0 6px">Etapa atual</h3>
            <div class="small" id="progStepHint"></div>
            <div style="height:14px"></div>
            <div class="prog-actions">
              <button class="btn" id="progPrev">Etapa anterior</button>
              <button class="btn primary" id="progSave">Salvar etapa</button>
              <button class="btn" id="progNext">Salvar e avançar</button>
            </div>
            <div style="height:14px"></div>
            <div class="prog-note">Programação com fallback visual. Se a API ainda não estiver pronta para Programação, a interface continua utilizável para validação do fluxo.</div>
          </div>
        </div>

        <div class="prog-stats">
          <div class="prog-card prog-stat"><span class="small">Total</span><b id="statTotal">0</b></div>
          <div class="prog-card prog-stat"><span class="small">Liberados</span><b id="statFree">0</b></div>
          <div class="prog-card prog-stat"><span class="small">Bloqueados</span><b id="statBlocked">0</b></div>
          <div class="prog-card prog-stat"><span class="small">Selecionados na etapa</span><b id="statSelected">0</b></div>
        </div>

        <div class="prog-grid-2">
          <div class="prog-card">
            <h3 style="margin:0 0 8px">Equipe do dia</h3>
            <div class="prog-list" id="progList"></div>
          </div>
          <div class="prog-card">
            <h3 style="margin:0 0 8px">Resumo para salvar</h3>
            <div class="prog-note" style="margin-bottom:10px">O payload abaixo é o que segue para a API ao salvar.</div>
            <pre class="input mono" id="progPreview" style="min-height:420px;white-space:pre-wrap;overflow:auto"></pre>
          </div>
        </div>
      </div>`;
  }

  function createModule(){
    const state = {
      etapa: 'A',
      filtro: '',
      contexto: null,
      colaboradores: [],
      form: {},
      sups: []
    };
    let refs = {};
    let apiRef = null;
    let profileRef = {};

    function ensureForm(id){
      if(!state.form[id]) state.form[id] = { selected:false, obs:'', hospedagem:false, hotel:'', cidade:'', alimentacao:'', deslocamento:'', rota:'', extraDescricao:'', extraValor:'' };
      return state.form[id];
    }

    function setStatus(text, kind){
      refs.status.textContent = text;
      refs.status.className = 'notice' + (kind === 'warn' ? ' prog-badge-warn' : kind === 'error' ? ' err' : '');
    }

    function updateStats(){
      const total = state.colaboradores.length;
      const blocked = state.colaboradores.filter(c=>c.bloqueado).length;
      const free = total - blocked;
      const selected = Object.values(state.form).filter(v=>v && v.selected).length;
      refs.statTotal.textContent = String(total);
      refs.statBlocked.textContent = String(blocked);
      refs.statFree.textContent = String(free);
      refs.statSelected.textContent = String(selected);
    }

    function renderSteps(){
      refs.steps.innerHTML = STEP_ORDER.map(step => {
        const meta = STEP_META[step];
        return `<button class="prog-step ${step===state.etapa?'active':''}" data-step="${step}" title="${meta.title}">${step}</button>`;
      }).join('');
      refs.stepHint.textContent = `${state.etapa} • ${STEP_META[state.etapa].title} — ${STEP_META[state.etapa].hint}`;
    }

    function renderPreview(){
      const payload = {
        dataRef: fromInputDate(refs.date.value),
        supervisao: refs.sup.value,
        etapa: state.etapa,
        selecionados: state.colaboradores.map(c=>({
          id: c.id,
          nome: c.nome,
          bloqueado: !!c.bloqueado,
          ...ensureForm(c.id)
        })).filter(item => item.selected || item.hospedagem || item.alimentacao || item.deslocamento || item.extraDescricao || item.extraValor || item.obs)
      };
      refs.preview.textContent = JSON.stringify(payload, null, 2);
    }

    function fieldHtml(c){
      const f = ensureForm(c.id);
      const disabled = c.bloqueado ? 'disabled' : '';
      if(state.etapa === 'A'){
        return `
          <label class="prog-check full"><input type="checkbox" data-id="${esc(c.id)}" data-k="selected" ${f.selected?'checked':''} ${disabled}/> Disponível no dia</label>
          <div class="full"><div class="label">Observações</div><input class="input" data-id="${esc(c.id)}" data-k="obs" value="${esc(f.obs)}" ${disabled} placeholder="Escala, horário, ressalvas" /></div>`;
      }
      if(state.etapa === 'B'){
        return `
          <label class="prog-check full"><input type="checkbox" data-id="${esc(c.id)}" data-k="hospedagem" ${f.hospedagem?'checked':''} ${disabled}/> Precisa de hospedagem</label>
          <div><div class="label">Hotel / alojamento</div><input class="input" data-id="${esc(c.id)}" data-k="hotel" value="${esc(f.hotel)}" ${disabled} placeholder="Nome do hotel" /></div>
          <div><div class="label">Cidade</div><input class="input" data-id="${esc(c.id)}" data-k="cidade" value="${esc(f.cidade)}" ${disabled} placeholder="Cidade / UF" /></div>`;
      }
      if(state.etapa === 'C'){
        return `
          <label class="prog-check full"><input type="checkbox" data-id="${esc(c.id)}" data-k="selected" ${f.selected?'checked':''} ${disabled}/> Lançar alimentação</label>
          <div class="full"><div class="label">Valor previsto</div><input class="input" data-id="${esc(c.id)}" data-k="alimentacao" value="${esc(f.alimentacao)}" ${disabled} placeholder="Ex.: 35,00" /></div>`;
      }
      if(state.etapa === 'D'){
        return `
          <div><div class="label">Tipo</div><select class="input" data-id="${esc(c.id)}" data-k="deslocamento" ${disabled}><option value="">Selecione</option><option value="frota" ${f.deslocamento==='frota'?'selected':''}>Frota</option><option value="ônibus" ${f.deslocamento==='ônibus'?'selected':''}>Ônibus</option><option value="particular" ${f.deslocamento==='particular'?'selected':''}>Particular</option><option value="app" ${f.deslocamento==='app'?'selected':''}>App</option></select></div>
          <div><div class="label">Rota / observação</div><input class="input" data-id="${esc(c.id)}" data-k="rota" value="${esc(f.rota)}" ${disabled} placeholder="Origem → destino" /></div>`;
      }
      return `
        <div class="full"><div class="label">Descrição do extra</div><input class="input" data-id="${esc(c.id)}" data-k="extraDescricao" value="${esc(f.extraDescricao)}" ${disabled} placeholder="Extra, diária, adiantamento..." /></div>
        <div class="full"><div class="label">Valor</div><input class="input" data-id="${esc(c.id)}" data-k="extraValor" value="${esc(f.extraValor)}" ${disabled} placeholder="Ex.: 120,00" /></div>`;
    }

    function renderList(){
      const q = state.filtro.trim().toLowerCase();
      const visible = state.colaboradores.filter(c => {
        const txt = `${c.nome} ${c.funcao} ${c.equipe}`.toLowerCase();
        return !q || txt.includes(q);
      });
      if(!visible.length){
        refs.list.innerHTML = '<div class="prog-empty">Nenhum colaborador encontrado para este filtro.</div>';
        updateStats();
        renderPreview();
        return;
      }
      refs.list.innerHTML = visible.map(c => {
        const f = ensureForm(c.id);
        const valueText = state.etapa === 'C' && f.alimentacao ? ` • ${money(String(f.alimentacao).replace(',','.'))}` : state.etapa === 'E' && f.extraValor ? ` • ${f.extraValor}` : '';
        return `
          <div class="prog-item ${c.bloqueado?'is-blocked':''}">
            <div>
              <div style="font-weight:800;font-size:16px">${esc(c.nome)}</div>
              <div class="small">${esc(c.funcao || 'Sem função')} ${c.equipe ? '• ' + esc(c.equipe) : ''}</div>
              <div class="meta">
                <span class="prog-tag">${c.bloqueado ? 'Bloqueado' : 'Liberado'}</span>
                ${c.motivo ? `<span class="prog-tag">${esc(c.motivo)}</span>` : ''}
                ${f.selected ? `<span class="prog-tag">Selecionado${esc(valueText)}</span>` : ''}
              </div>
            </div>
            <div class="prog-fields">${fieldHtml(c)}</div>
          </div>`;
      }).join('');
      updateStats();
      renderPreview();
    }

    function bindInputs(){
      refs.root.addEventListener('input', ev => {
        const target = ev.target;
        if(target.id === 'progSearch'){
          state.filtro = target.value || '';
          renderList();
          return;
        }
        const id = target.getAttribute('data-id');
        const key = target.getAttribute('data-k');
        if(!id || !key) return;
        const form = ensureForm(id);
        form[key] = target.type === 'checkbox' ? target.checked : target.value;
        if(key === 'alimentacao' || key === 'extraValor') form.selected = !!String(form[key]||'').trim();
        renderPreview();
        updateStats();
      });
      refs.root.addEventListener('change', ev => {
        const target = ev.target;
        const id = target.getAttribute('data-id');
        const key = target.getAttribute('data-k');
        if(!id || !key) return;
        const form = ensureForm(id);
        form[key] = target.type === 'checkbox' ? target.checked : target.value;
        renderPreview();
        updateStats();
      });
      refs.steps.addEventListener('click', ev => {
        const btn = ev.target.closest('.prog-step');
        if(!btn) return;
        state.etapa = btn.dataset.step;
        renderSteps();
        renderList();
      });
      refs.prev.addEventListener('click', ()=>{
        const idx = Math.max(0, STEP_ORDER.indexOf(state.etapa)-1);
        state.etapa = STEP_ORDER[idx];
        renderSteps();
        renderList();
      });
      refs.next.addEventListener('click', async ()=>{
        await saveCurrent(true);
      });
      refs.save.addEventListener('click', async ()=>{
        await saveCurrent(false);
      });
      refs.load.addEventListener('click', loadContext);
    }

    async function loadContext(){
      const dataRef = fromInputDate(refs.date.value) || todayBR();
      const supervisao = refs.sup.value;
      if(!supervisao){
        setStatus('Selecione uma supervisão para carregar o contexto.', 'warn');
        refs.sup.focus();
        return;
      }
      setStatus('Carregando contexto...', 'ok');
      try{
        const res = await tryLoadContext(apiRef, { dataRef, supervisao });
        const payload = res.data || res;
        state.contexto = payload.contexto || payload;
        state.colaboradores = normalizeColabs(payload.colaboradores || payload.items || payload.lista, profileRef);
        if(!state.colaboradores.length){
          state.colaboradores = normalizeColabs([], profileRef);
          setStatus('API respondeu sem equipe. Carregado fallback visual.', 'warn');
        }else{
          setStatus(`Contexto carregado para ${supervisao}.`, 'ok');
        }
      }catch(err){
        state.contexto = { fallback:true };
        state.colaboradores = normalizeColabs([], profileRef);
        setStatus(`API de Programação ainda não respondeu. Exibindo base visual (${err.message || err}).`, 'warn');
      }
      renderList();
    }

    async function saveCurrent(advance){
      const payload = {
        dataRef: fromInputDate(refs.date.value) || todayBR(),
        supervisao: refs.sup.value,
        etapa: state.etapa,
        selecionados: state.colaboradores.map(c => ({
          id: c.id,
          nome: c.nome,
          bloqueado: !!c.bloqueado,
          ...ensureForm(c.id)
        })).filter(item => item.selected || item.hospedagem || item.alimentacao || item.deslocamento || item.extraDescricao || item.extraValor || item.obs || item.hotel || item.cidade || item.rota)
      };
      try{
        await trySaveStep(apiRef, payload);
        setStatus(`Etapa ${state.etapa} salva com sucesso.`, 'ok');
      }catch(err){
        setStatus(`Falha ao salvar na API. Payload pronto para integração (${err.message || err}).`, 'warn');
      }
      renderPreview();
      if(advance){
        const idx = Math.min(STEP_ORDER.length - 1, STEP_ORDER.indexOf(state.etapa) + 1);
        state.etapa = STEP_ORDER[idx];
        renderSteps();
        renderList();
      }
    }

    async function openHome(container, opts){
      apiRef = opts.api;
      profileRef = (opts.auth && opts.auth.profile) || {};
      container.innerHTML = buildShell();
      refs = {
        root: container,
        status: container.querySelector('#progStatus'),
        date: container.querySelector('#progDate'),
        sup: container.querySelector('#progSup'),
        search: container.querySelector('#progSearch'),
        load: container.querySelector('#progLoad'),
        steps: container.querySelector('#progSteps'),
        stepHint: container.querySelector('#progStepHint'),
        prev: container.querySelector('#progPrev'),
        save: container.querySelector('#progSave'),
        next: container.querySelector('#progNext'),
        list: container.querySelector('#progList'),
        preview: container.querySelector('#progPreview'),
        statTotal: container.querySelector('#statTotal'),
        statFree: container.querySelector('#statFree'),
        statBlocked: container.querySelector('#statBlocked'),
        statSelected: container.querySelector('#statSelected')
      };
      refs.date.value = toInputDate(todayBR());
      state.sups = defaultSups(profileRef);
      refs.sup.innerHTML = state.sups.length
        ? state.sups.map(s => `<option value="${esc(s)}">${esc(s)}</option>`).join('')
        : '<option value="">Selecione</option>';
      renderSteps();
      renderList();
      bindInputs();
      renderPreview();
      setStatus('Nenhum contexto carregado.', 'ok');
      if(state.sups.length === 1) loadContext();
    }

    return { openHome };
  }

  window.PROGRAMACAO = createModule();
})();
