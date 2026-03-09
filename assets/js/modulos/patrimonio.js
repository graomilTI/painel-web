/* assets/js/modulos/patrimonio.js
 * Patrimônio — Gestor
 * - Lista pendentes (separados por Unidade)
 * - Gestor informa Número + Colaborador responsável e clica "Solicitar cadastro"
 */

(function(){
  "use strict";

  const $ = (sel, root=document)=>root.querySelector(sel);
  const esc = (s)=>String(s??"").replace(/[&<>"']/g, m=>({
    "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"
  }[m]));

  function getToken_(){
    try{ if(window.AUTH && typeof window.AUTH.getToken==='function') return String(window.AUTH.getToken()||'').trim(); }catch(_){ }
    try{ const raw = localStorage.getItem('g1000_auth'); if(raw){ const a=JSON.parse(raw); if(a?.token) return String(a.token).trim(); } }catch(_){ }
    try{ return String(localStorage.getItem('g1000_token')||'').trim(); }catch(_){ }
    return '';
  }

  async function post_(module, action, payload){
    if(!window.API || typeof window.API.post !== 'function') throw new Error('API.post não disponível.');
    const token = getToken_();
    if(!token) throw new Error('Sessão inválida (sem token).');
    const req = Object.assign({ module, action, token }, payload||{});
    const r = await window.API.post(req);
    if(!r || r.ok === false) throw new Error(r?.error || r?.message || 'Falha na API');
    return r;
  }

  function css_(){
    return `
      <style>
        .pRoot{ padding:14px; }
        .pHead{ display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap; margin-bottom:12px; }
        .pTitle{ font-weight:1000; font-size:18px; }
        .pSub{ opacity:.75; font-weight:800; font-size:12px; }
        .pBtn{ height:38px; padding:0 14px; border-radius:12px; border:1px solid rgba(255,255,255,.14); background:#0f172a; color:#e5e7eb; font-weight:900; cursor:pointer; }
        .pBtn:hover{ background:rgba(255,255,255,.06); }
        .pBtn.ok{ background:rgba(34,197,94,.20); border-color:rgba(34,197,94,.35); }
        .pBtn.warn{ background:rgba(245,158,11,.18); border-color:rgba(245,158,11,.35); }
        .pRow{ display:flex; gap:10px; flex-wrap:wrap; align-items:flex-end; margin:10px 0; }
        .pField{ min-width:220px; flex:1; }
        .pLabel{ font-size:12px; font-weight:900; opacity:.75; margin:0 0 6px 2px; }
        .pInp,.pSel{ width:100%; height:40px; padding:0 12px; border-radius:12px; border:1px solid rgba(255,255,255,.14); background:#0f172a; color:#e5e7eb; font-weight:900; outline:none; color-scheme:dark; }
        .pCard{ border:1px solid rgba(255,255,255,.12); border-radius:18px; overflow:hidden; background:linear-gradient(180deg, rgba(255,255,255,.04), rgba(0,0,0,.18)); }
        .pTable{ width:100%; border-collapse:separate; border-spacing:0; }
        .pTable th,.pTable td{ padding:10px; border-bottom:1px solid rgba(255,255,255,.08); font-size:13px; }
        .pTable th{ text-align:left; font-size:12px; opacity:.8; letter-spacing:.2px; position:sticky; top:0; background:rgba(3,7,18,.85); backdrop-filter:blur(8px); z-index:1; }
        .pTable tr:nth-child(even) td{ background:rgba(255,255,255,.02); }
        .pPill{ display:inline-block; padding:3px 9px; border-radius:999px; border:1px solid rgba(255,255,255,.14); background:rgba(0,0,0,.18); font-weight:900; font-size:11px; }
        .pPill.ok{ border-color:rgba(34,197,94,.35); background:rgba(34,197,94,.12); }
        .pPill.warn{ border-color:rgba(245,158,11,.35); background:rgba(245,158,11,.10); }
        .pMini{ font-size:12px; opacity:.75; font-weight:800; }
      </style>
    `;
  }

  function render_(state){
    const root = $('#appMain');
    if(!root) return;

    const unidades = state.unidades || [];
    const selUn = state.filtroUnidade || '';
    const rows = (state.rows||[]).filter(r=> !selUn || String(r.unidade||'')===selUn);

    const colabs = state.colaboradores || [];
    const optColab = [`<option value="">Selecione…</option>`].concat(colabs.map(n=>`<option value="${esc(n)}">${esc(n)}</option>`)).join('');

    root.innerHTML = `
      ${css_()}
      <div class="pRoot">
        <div class="pHead">
          <div>
            <div class="pTitle">Patrimônio — Gestor</div>
            <div class="pSub">Informe a numeração e o responsável para solicitar cadastro</div>
          </div>
          <div style="display:flex; gap:10px; flex-wrap:wrap">
            <button class="pBtn warn" id="btnReload" type="button">Recarregar</button>
            <button class="pBtn" id="btnBack" type="button">← Voltar</button>
          </div>
        </div>

        <div class="pRow">
          <div class="pField" style="max-width:340px">
            <div class="pLabel">Unidade</div>
            <select class="pSel" id="selUnidade">
              <option value="">(Todas)</option>
              ${unidades.map(u=>`<option value="${esc(u)}" ${u===selUn?'selected':''}>${esc(u)}</option>`).join('')}
            </select>
          </div>
          <div class="pField">
            <div class="pLabel">Total exibido</div>
            <div class="pMini"><b>${rows.length}</b> registro(s)</div>
          </div>
        </div>

        <div class="pCard">
          <div style="max-height:66vh; overflow:auto">
            <table class="pTable">
              <thead>
                <tr>
                  <th>Status</th>
                  <th>Unidade</th>
                  <th>Material</th>
                  <th style="min-width:140px">Número</th>
                  <th style="min-width:260px">Responsável</th>
                  <th style="min-width:170px">Ação</th>
                </tr>
              </thead>
              <tbody>
                ${rows.map(r=>{
                  const st = String(r.status||'PENDENTE').toUpperCase();
                  const pill = (st==='CADASTRADO') ? 'ok' : 'warn';
                  const dis = (st==='CADASTRADO') ? 'disabled' : '';
                  return `
                    <tr>
                      <td><span class="pPill ${pill}">${esc(st)}</span></td>
                      <td>${esc(r.unidade||'')}</td>
                      <td>${esc(r.material||'')}</td>
                      <td>
                        <input class="pInp" data-num="${esc(r.id)}" placeholder="Ex.: 000123" value="${esc(r.numero||'')}" ${dis} />
                      </td>
                      <td>
                        <select class="pSel" data-col="${esc(r.id)}" ${dis}>${optColab}</select>
                      </td>
                      <td>
                        <button class="pBtn ok" data-act="sol" data-id="${esc(r.id)}" ${dis} type="button">Solicitar cadastro</button>
                      </td>
                    </tr>
                  `;
                }).join('') || `
                  <tr><td colspan="6" style="padding:14px; opacity:.75; font-weight:800">Nenhum patrimônio pendente.</td></tr>
                `}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;

    $('#btnBack')?.addEventListener('click', ()=>{ window.location.href = 'app.html'; });
    $('#btnReload')?.addEventListener('click', ()=>boot_(state));

    $('#selUnidade')?.addEventListener('change', (ev)=>{
      state.filtroUnidade = String(ev.target.value||'');
      render_(state);
    });

    root.querySelectorAll('button[data-act="sol"]').forEach(btn=>{
      btn.addEventListener('click', async ()=>{
        const id = String(btn.getAttribute('data-id')||'').trim();
        const num = String(root.querySelector(`input[data-num="${CSS.escape(id)}"]`)?.value || '').trim();
        const col = String(root.querySelector(`select[data-col="${CSS.escape(id)}"]`)?.value || '').trim();
        if(!num) return alert('Informe o número.');
        if(!col) return alert('Selecione o responsável.');
        btn.disabled = true;
        try{
          await post_('patrimonio','solicitarCadastro',{ id, numero:num, colaborador:col });
          await boot_(state);
        }catch(e){
          alert(e?.message || String(e));
        }finally{
          btn.disabled = false;
        }
      });
    });

    // aplica seleção do responsável quando já existe
    (state.rows||[]).forEach(r=>{
      if(!r?.id) return;
      const sel = root.querySelector(`select[data-col="${CSS.escape(String(r.id))}"]`);
      if(sel && r.colaborador){
        sel.value = String(r.colaborador);
      }
    });
  }

  async function boot_(state){
    const root = $('#appMain');
    if(root) root.innerHTML = `${css_()}<div class="pRoot"><div class="pMini">Carregando…</div></div>`;

    // carrega lista de colaboradores (reusa compras)
    let colabs = [];
    try{
      const rCol = await post_('compras','carregarListaRecente',{});
      colabs = Array.isArray(rCol.colaboradores) ? rCol.colaboradores.map(x=>x?.colaborador).filter(Boolean) : [];
    }catch(_){ }

    const r = await post_('patrimonio','listarPendentesGestor',{});
    state.rows = Array.isArray(r.rows) ? r.rows : [];
    state.unidades = Array.from(new Set(state.rows.map(x=>String(x.unidade||'').trim()).filter(Boolean))).sort((a,b)=>a.localeCompare(b));
    state.colaboradores = colabs.sort((a,b)=>String(a).localeCompare(String(b)));

    // se filtro não existe mais
    if(state.filtroUnidade && !state.unidades.includes(state.filtroUnidade)) state.filtroUnidade = '';

    render_(state);
  }

  document.addEventListener('DOMContentLoaded', ()=>{
    boot_({ rows:[], unidades:[], colaboradores:[], filtroUnidade:'' });
  });
})();
