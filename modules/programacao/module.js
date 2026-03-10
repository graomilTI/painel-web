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
    { module:'programacao', action:'carregar_contexto', payload, ...payload },
    { module:'programacao', action:'contexto', payload, ...payload },
    { module:'despesas', action:'carregarContexto', payload, ...payload },
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
    { module:'programacao', action:'salvar_etapa', payload, ...payload },
    { module:'programacao', action:'salvar', payload, ...payload },
    { module:'despesas', action:'salvarEtapa', payload },
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
      profile.supervisor,
      profile.Supervisor,
      profile.equipe,
      profile.Equipe
    ].filter(Boolean);
    const cleaned = [...new Set(candidates.map(v=>String(v).trim()).filter(Boolean))];
    return cleaned;
  }

  function buildShell(){
    return `
      <style>
        .prog-wrap{display:flex;flex-direction:column;gap:18px}
        .prog-hero{display:grid;grid-template-columns:minmax(0,1.3fr) minmax(320px,.7fr);gap:16px}
        .prog-panel{position:relative;background:linear-gradient(180deg,rgba(8,15,32,.92),rgba(5,12,26,.86));border:1px solid rgba(148,163,184,.16);border-radius:24px;padding:18px;box-shadow:0 18px 48px rgba(0,0,0,.24);overflow:hidden}
        .prog-panel:before{content:"";position:absolute;inset:-1px auto auto -1px;width:180px;height:180px;background:radial-gradient(circle at top left,rgba(34,197,94,.14),transparent 70%);pointer-events:none}
        .prog-panel > *{position:relative;z-index:1}
        .prog-hero-title{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:14px}
        .prog-title{margin:0;font-size:30px;line-height:1.05;letter-spacing:-.02em}
        .prog-sub{color:var(--muted);max-width:680px}
        .prog-context{display:flex;flex-wrap:wrap;gap:10px;margin-top:12px}
        .prog-chip{display:inline-flex;align-items:center;gap:8px;padding:8px 12px;border-radius:999px;border:1px solid rgba(148,163,184,.18);background:rgba(15,23,42,.65);font-size:13px;color:var(--text)}
        .prog-chip strong{font-weight:800}
        .prog-status{display:inline-flex;align-items:center;gap:8px;padding:10px 14px;border-radius:999px;background:rgba(15,23,42,.7);border:1px solid rgba(148,163,184,.18);font-size:13px;color:var(--text)}
        .prog-status::before{content:"";width:8px;height:8px;border-radius:50%;background:#22c55e;box-shadow:0 0 0 4px rgba(34,197,94,.14)}
        .prog-status.warn::before{background:#f59e0b;box-shadow:0 0 0 4px rgba(245,158,11,.14)}
        .prog-toolbar{display:grid;grid-template-columns:1fr 1fr 1.15fr auto;gap:12px;align-items:end}
        .prog-control{display:flex;flex-direction:column;gap:6px}
        .prog-control .label{font-size:12px;color:var(--muted);font-weight:700;text-transform:uppercase;letter-spacing:.04em}
        .prog-stepbar{display:flex;gap:10px;flex-wrap:wrap;margin-top:16px}
        .prog-step{display:flex;align-items:center;justify-content:center;min-width:52px;height:46px;border-radius:14px;border:1px solid rgba(148,163,184,.18);background:rgba(15,23,42,.72);color:var(--text);cursor:pointer;font-weight:900;transition:.18s ease}
        .prog-step:hover{transform:translateY(-1px);border-color:rgba(34,197,94,.32)}
        .prog-step.active{background:linear-gradient(180deg,rgba(34,197,94,.28),rgba(22,163,74,.2));border-color:rgba(34,197,94,.55);box-shadow:0 10px 22px rgba(22,163,74,.14)}
        .prog-side-title{margin:0 0 8px;font-size:28px;line-height:1.05;letter-spacing:-.02em}
        .prog-actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:18px}
        .prog-actions .btn{min-height:44px;border-radius:14px}
        .prog-actions .btn.primary{box-shadow:0 14px 28px rgba(22,163,74,.18)}
        .prog-note{font-size:13px;color:var(--muted);line-height:1.5}
        .prog-stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px}
        .prog-stat{padding:16px 18px;border-radius:20px;background:linear-gradient(180deg,rgba(9,18,36,.96),rgba(6,14,28,.86));border:1px solid rgba(148,163,184,.12)}
        .prog-stat .small{color:var(--muted);text-transform:uppercase;letter-spacing:.04em;font-size:11px}
        .prog-stat b{display:block;font-size:34px;line-height:1;margin-top:10px}
        .prog-grid-2{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(340px,.9fr);gap:16px}
        .prog-card{background:linear-gradient(180deg,rgba(8,15,32,.94),rgba(5,12,26,.86));border:1px solid rgba(148,163,184,.14);border-radius:24px;padding:18px;box-shadow:0 18px 42px rgba(0,0,0,.18)}
        .prog-card h3{margin:0 0 10px;font-size:28px;letter-spacing:-.02em}
        .prog-list{display:flex;flex-direction:column;gap:12px;max-height:58vh;overflow:auto;padding-right:4px}
        .prog-item{border:1px solid rgba(148,163,184,.14);background:rgba(8,15,32,.7);border-radius:20px;padding:14px;display:grid;grid-template-columns:minmax(0,1fr) minmax(280px,.9fr);gap:14px;transition:.18s ease}
        .prog-item:hover{border-color:rgba(34,197,94,.26);transform:translateY(-1px)}
        .prog-item.is-blocked{opacity:.78;border-color:rgba(239,68,68,.34)}
        .prog-person{display:flex;gap:12px;align-items:flex-start}
        .prog-avatar{width:42px;height:42px;border-radius:14px;background:linear-gradient(180deg,rgba(34,197,94,.28),rgba(20,83,45,.4));display:flex;align-items:center;justify-content:center;font-weight:900;color:#dcfce7;box-shadow:inset 0 0 0 1px rgba(34,197,94,.24)}
        .prog-person h4{margin:0 0 4px;font-size:17px}
        .prog-meta-line{color:var(--muted);font-size:13px}
        .prog-meta{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}
        .prog-tag{font-size:12px;color:var(--muted);padding:5px 9px;border-radius:999px;border:1px solid rgba(148,163,184,.14);background:rgba(15,23,42,.72)}
        .prog-tag.ok{color:#dcfce7;border-color:rgba(34,197,94,.24);background:rgba(34,197,94,.08)}
        .prog-tag.danger{color:#fecaca;border-color:rgba(239,68,68,.28);background:rgba(239,68,68,.08)}
        .prog-fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
        .prog-fields .full{grid-column:1 / -1}
        .prog-empty{padding:26px;border:1px dashed rgba(148,163,184,.18);border-radius:18px;color:var(--muted);text-align:center;background:rgba(15,23,42,.34)}
        .prog-preview{min-height:420px;white-space:pre-wrap;overflow:auto;border-radius:18px;border:1px solid rgba(148,163,184,.12);background:rgba(2,6,23,.56);padding:14px;font-size:12px;line-height:1.55}
        .prog-check{display:flex;align-items:center;gap:10px;font-weight:700}
        .prog-check input{width:18px;height:18px}
        @media (max-width: 1180px){
          .prog-hero,.prog-grid-2,.prog-toolbar,.prog-stats,.prog-item,.prog-fields{grid-template-columns:1fr}
        }
      </style>
      <div class="prog-wrap">
        <div class="prog-hero">
          <section class="prog-panel">
            <div class="prog-hero-title">
              <div>
                <h2 class="prog-title">Programação do dia</h2>
                <div class="prog-sub">Carregue o contexto operacional, selecione a supervisão correta e avance pelas etapas A–E sem perder o fluxo do gestor.</div>
                <div class="prog-context">
                  <span class="prog-chip"><strong>Fluxo</strong> A–E</span>
                  <span class="prog-chip"><strong>Contexto</strong> equipe, bloqueios e lançamentos</span>
                </div>
              </div>
              <div class="prog-status" id="progStatus">Nenhum contexto carregado.</div>
            </div>
            <div class="prog-toolbar">
              <div class="prog-control">
                <div class="label">Data referência</div>
                <input class="input" id="progDate" type="date" />
              </div>
              <div class="prog-control">
                <div class="label">Supervisão</div>
                <select class="input" id="progSup"></select>
              </div>
              <div class="prog-control">
                <div class="label">Buscar colaborador</div>
                <input class="input" id="progSearch" placeholder="Nome, equipe ou função" />
              </div>
              <button class="btn primary" id="progLoad">Carregar contexto</button>
            </div>
            <div class="prog-stepbar" id="progSteps"></div>
          </section>
          <aside class="prog-panel">
            <h3 class="prog-side-title">Etapa atual</h3>
            <div class="prog-note" id="progStepHint"></div>
            <div class="prog-actions">
              <button class="btn" id="progPrev">Etapa anterior</button>
              <button class="btn primary" id="progSave">Salvar etapa</button>
              <button class="btn" id="progNext">Salvar e avançar</button>
            </div>
            <div style="height:14px"></div>
            <div class="prog-note">O módulo continua funcionando mesmo sem resposta completa da API. Assim você valida o fluxo visual antes da integração final.</div>
          </aside>
        </div>

        <div class="prog-stats">
          <div class="prog-stat"><span class="small">Total da equipe</span><b id="statTotal">0</b></div>
          <div class="prog-stat"><span class="small">Liberados</span><b id="statFree">0</b></div>
          <div class="prog-stat"><span class="small">Bloqueados</span><b id="statBlocked">0</b></div>
          <div class="prog-stat"><span class="small">Selecionados na etapa</span><b id="statSelected">0</b></div>
        </div>

        <div class="prog-grid-2">
          <section class="prog-card">
            <h3>Equipe do dia</h3>
            <div class="prog-list" id="progList"></div>
          </section>
          <section class="prog-card">
            <h3>Resumo para salvar</h3>
            <div class="prog-note" style="margin-bottom:10px">Esse payload é o que segue para a API ao salvar a etapa atual.</div>
            <pre class="prog-preview mono" id="progPreview"></pre>
          </section>
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
      refs.status.className = 'prog-status' + (kind === 'warn' ? ' warn' : kind === 'error' ? ' warn' : '');
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
        const initials = String(c.nome || 'C').split(/\s+/).slice(0,2).map(v=>v[0]||'').join('').toUpperCase();
        const valueText = state.etapa === 'C' && f.alimentacao ? ` • ${money(String(f.alimentacao).replace(',','.'))}` : state.etapa === 'E' && f.extraValor ? ` • ${f.extraValor}` : '';
        return `
          <div class="prog-item ${c.bloqueado?'is-blocked':''}">
            <div class="prog-person">
              <div class="prog-avatar">${esc(initials)}</div>
              <div>
                <h4>${esc(c.nome)}</h4>
                <div class="prog-meta-line">${esc(c.funcao || 'Sem função')} ${c.equipe ? '• ' + esc(c.equipe) : ''}</div>
                <div class="prog-meta">
                  <span class="prog-tag ${c.bloqueado ? 'danger' : 'ok'}">${c.bloqueado ? 'Bloqueado' : 'Liberado'}</span>
                  ${c.motivo ? `<span class="prog-tag">${esc(c.motivo)}</span>` : ''}
                  ${f.selected ? `<span class="prog-tag ok">Selecionado${esc(valueText)}</span>` : ''}
                </div>
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
        : '<option value="">Selecione a supervisão</option>';
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
