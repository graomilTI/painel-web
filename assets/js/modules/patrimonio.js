// assets/js/modules/patrimonio.js
// ✅ Padrão: window.PATRIMONIO.openHome(container, opts)
// ADM: lista solicitações de cadastro de patrimônio (Patrimonios_Pendentes)

(function(){
  "use strict";

  const PATRIMONIO = {};

  const esc = (s)=>String(s??"").replace(/[&<>"']/g, m=>({
    "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"
  }[m]));

  function ui_(container, html){
    if(container) container.innerHTML = html;
  }

  function css_(){
    return `
      <style>
        .pat-root{ padding:14px; }
        .pat-head{ display:flex; gap:10px; align-items:center; justify-content:space-between; flex-wrap:wrap; margin-bottom:12px; }
        .pat-title{ font-weight:900; font-size:18px; }
        .pat-sub{ opacity:.75; font-weight:800; font-size:12px; }
        .pat-actions{ display:flex; gap:10px; align-items:center; flex-wrap:wrap; }
        .pat-btn{ height:38px; padding:0 14px; border-radius:12px; border:1px solid rgba(255,255,255,.14); background:#0f172a; color:#e5e7eb; font-weight:900; cursor:pointer; }
        .pat-btn:hover{ background:rgba(255,255,255,.06); }
        .pat-btn.ok{ background:rgba(34,197,94,.20); border-color:rgba(34,197,94,.35); }
        .pat-btn.warn{ background:rgba(245,158,11,.18); border-color:rgba(245,158,11,.35); }
        .pat-row{ display:flex; gap:10px; flex-wrap:wrap; margin:10px 0; }
        .pat-field{ min-width:220px; flex:1; }
        .pat-label{ font-size:12px; font-weight:900; opacity:.75; margin:0 0 6px 2px; }
        .pat-inp, .pat-sel{ width:100%; height:40px; padding:0 12px; border-radius:12px; border:1px solid rgba(255,255,255,.14); background:#0f172a; color:#e5e7eb; font-weight:900; outline:none; color-scheme:dark; }
        .pat-card{ border:1px solid rgba(255,255,255,.12); border-radius:18px; overflow:hidden; background:linear-gradient(180deg, rgba(255,255,255,.04), rgba(0,0,0,.18)); }
        .pat-table{ width:100%; border-collapse:separate; border-spacing:0; }
        .pat-table th, .pat-table td{ padding:10px 10px; border-bottom:1px solid rgba(255,255,255,.08); font-size:13px; }
        .pat-table th{ text-align:left; font-size:12px; opacity:.8; letter-spacing:.2px; position:sticky; top:0; background:rgba(3,7,18,.85); backdrop-filter:blur(8px); z-index:1; }
        .pat-table tr:nth-child(even) td{ background:rgba(255,255,255,.02); }
        .pat-mini{ font-size:12px; opacity:.75; font-weight:800; }
        .pat-pill{ display:inline-block; padding:3px 9px; border-radius:999px; border:1px solid rgba(255,255,255,.14); background:rgba(0,0,0,.18); font-weight:900; font-size:11px; }
        .pat-pill.ok{ border-color:rgba(34,197,94,.35); background:rgba(34,197,94,.12); }
        .pat-pill.warn{ border-color:rgba(245,158,11,.35); background:rgba(245,158,11,.10); }
      </style>
    `;
  }

  function getToken_(opts){
    const t = String(opts?.token || "").trim();
    if (t) return t;
    try{ return String(localStorage.getItem('g1000_token')||'').trim(); }catch(_){ }
    return "";
  }

  async function post_(opts, action, payload){
    const api = opts?.api || window.API;
    if(!api || typeof api.post !== 'function') throw new Error('API.post indisponível.');
    const token = getToken_(opts);
    if(!token) throw new Error('Sessão inválida (sem token).');
    const req = Object.assign({ module:'patrimonio', action, token }, payload||{});
    const r = await api.post(req);
    if(!r || r.ok === false) throw new Error(r?.error || r?.message || 'Falha na API');
    return r;
  }

  function render_(container, state){
    const unidades = state.unidades || [];
    const selUn = state.filtroUnidade || '';

    const rows = (state.rows||[]).filter(r=> !selUn || String(r.unidade||'')===selUn);

    ui_(container, `
      ${css_()}
      <div class="pat-root">
        <div class="pat-head">
          <div>
            <div class="pat-title">Patrimônio — ADM</div>
            <div class="pat-sub">Solicitações de cadastro / numeração</div>
          </div>
          <div class="pat-actions">
            <button class="pat-btn warn" id="patReload" type="button">Recarregar</button>
            <button class="pat-btn" id="patBack" type="button">← Voltar</button>
          </div>
        </div>

        <div class="pat-row">
          <div class="pat-field" style="max-width:340px">
            <div class="pat-label">Unidade</div>
            <select class="pat-sel" id="patUnidade">
              <option value="">(Todas)</option>
              ${unidades.map(u=>`<option value="${esc(u)}" ${u===selUn?'selected':''}>${esc(u)}</option>`).join('')}
            </select>
          </div>
          <div class="pat-field">
            <div class="pat-label">Total exibido</div>
            <div class="pat-mini"><b>${rows.length}</b> registro(s)</div>
          </div>
        </div>

        <div class="pat-card">
          <div style="max-height:62vh; overflow:auto">
            <table class="pat-table">
              <thead>
                <tr>
                  <th>Status</th>
                  <th>Unidade</th>
                  <th>Gestor</th>
                  <th>Supervisão</th>
                  <th>Material</th>
                  <th>Número</th>
                  <th>Responsável</th>
                  <th>Data Aquisição</th>
                  <th style="min-width:150px">Ações</th>
                </tr>
              </thead>
              <tbody>
                ${rows.map(r=>{
                  const st = String(r.status||'PENDENTE').toUpperCase();
                  const pill = st==='CADASTRADO' ? 'ok' : 'warn';
                  return `
                    <tr>
                      <td><span class="pat-pill ${pill}">${esc(st)}</span></td>
                      <td>${esc(r.unidade||'')}</td>
                      <td>${esc(r.gestor||'')}</td>
                      <td>${esc(r.supervisao||'')}</td>
                      <td>${esc(r.material||'')}</td>
                      <td>${esc(r.numero||'')}</td>
                      <td>${esc(r.colaborador||'')}</td>
                      <td>${esc(r.dataAquisicao||'')}</td>
                      <td>
                        <button class="pat-btn ok" data-act="cadastrar" data-id="${esc(r.id)}" type="button">Marcar cadastrado</button>
                      </td>
                    </tr>
                  `;
                }).join('') || `
                  <tr><td colspan="9" style="padding:14px; opacity:.75; font-weight:800">Nenhum patrimônio pendente.</td></tr>
                `}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `);

    container.querySelector('#patBack')?.addEventListener('click', ()=>{
      try{ if(typeof opts?.onBack === 'function') return opts.onBack(); }catch(_){ }
      try{ history.back(); }catch(_){ }
    });

    container.querySelector('#patReload')?.addEventListener('click', ()=> boot_(container, state.opts));

    container.querySelector('#patUnidade')?.addEventListener('change', (ev)=>{
      state.filtroUnidade = String(ev.target.value||'');
      render_(container, state);
    });

    container.querySelectorAll('button[data-act="cadastrar"]').forEach(btn=>{
      btn.addEventListener('click', async ()=>{
        const id = String(btn.getAttribute('data-id')||'').trim();
        if(!id) return;
        btn.disabled = true;
        try{
          await post_(state.opts, 'marcarCadastrado', { id });
          await boot_(container, state.opts);
        }catch(e){
          alert(e?.message || String(e));
        }finally{
          btn.disabled = false;
        }
      });
    });
  }

  async function boot_(container, opts){
    const state = { rows:[], unidades:[], filtroUnidade:'', opts };
    ui_(container, `${css_()}<div class="pat-root"><div class="pat-mini">Carregando…</div></div>`);
    const r = await post_(opts, 'listarPendentesAdm', {});
    state.rows = Array.isArray(r.rows) ? r.rows : [];
    state.unidades = Array.from(new Set(state.rows.map(x=>String(x.unidade||'').trim()).filter(Boolean))).sort((a,b)=>a.localeCompare(b));
    render_(container, state);
  }

  PATRIMONIO.openHome = async function openHome(container, opts={}){
    await boot_(container, opts);
  };

  window.PATRIMONIO = PATRIMONIO;
})();
