/**
 * assets/js/modulos/compras_pro.js
 * COMPRAS — ERP (Gestor) • Modelo Dinâmico Unificado
 * - Matriz por colaborador (todas as abas)
 * - Itens dinâmicos por aba (adicionar/remover colunas)
 * - Botina = tamanho (EPI)
 * - Sem legado / sem duplicidade
 *
 * Backend (GAS) actions (compat):
 * - carregarListaRecente { token }
 * - carregarUltimoPedido { token, payload:{ tipo, supervisao } }
 * - carregarUltimoPDF { token, payload:{ tipo, supervisao } }
 * - salvarPedido { token, payload:{ tipo, dataRef, supervisao, modo, pedidoId, itens, outros } }
 * - carregarPatrimonios { token, payload:{ supervisao } }
 */
(() => {
  "use strict";

  const MOD = "COMPRAS_PRO";
  const ROOT_ID = "appMain";

  // ===== Utils =====
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
  const norm = (s) => String(s ?? "").trim();
  const normUp = (s) => norm(s).toUpperCase();
  const safeInt = (v, d=0) => {
    const n = parseInt(String(v ?? "").replace(/[^\d-]/g,""), 10);
    return Number.isFinite(n) ? n : d;
  };

  function hojeDMY(){
    const d = new Date();
    const dd = String(d.getDate()).padStart(2,"0");
    const mm = String(d.getMonth()+1).padStart(2,"0");
    const yy = d.getFullYear();
    return `${dd}/${mm}/${yy}`;
  }
  function dmyToYmd_(dmy){
    const m = String(dmy||"").trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    return m ? `${m[3]}-${m[2]}-${m[1]}` : "";
  }
  function ymdToDmy_(ymd){
    const m = String(ymd||"").trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
  }

  function getToken_(){
    // padrão do seu painel
    try{
      const a = localStorage.getItem("g1000_auth");
      if(a){
        const j = JSON.parse(a);
        const t = norm(j && j.token);
        if(t) return t;
      }
    }catch(_){}
    try{
      const t = norm(localStorage.getItem("g1000_token"));
      if(t) return t;
    }catch(_){}
    try{
      const t = norm(localStorage.getItem("token"));
      if(t) return t;
    }catch(_){}
    try{
      const t = norm(localStorage.getItem("auth_token"));
      if(t) return t;
    }catch(_){}
    try{
      const t = norm(window.AUTH && window.AUTH.token);
      if(t) return t;
    }catch(_){}
    return "";
  }

  async function apiPost_(action, token, payloadObj){
    // core API compat (novo e legado)
    if(window.API && typeof window.API.post === "function"){
      // alguns cores usam API.post(payload), outros API.post(action, body)
      try{
        return await window.API.post({ action, token, ...(payloadObj||{}) });
      }catch(_){}
      const body = Object.assign({}, payloadObj || {}, token ? { token } : {});
      return window.API.post(action, body);
    }

    const endpoint = norm(window.API_BASE || window.GAS_EXEC);
    if(!endpoint) throw new Error("API_BASE/GAS_EXEC não definido (config.js).");

    const res = await fetch(endpoint, {
      method:"POST",
      headers:{ "Content-Type":"application/json" },
      body: JSON.stringify(Object.assign({ action }, token ? { token } : {}, payloadObj || {}))
    });
    let json = {};
    try{ json = await res.json(); }catch(_){}
    if(!res.ok || json.ok === false) throw new Error(json.error || json.message || `HTTP ${res.status}`);
    return json;
  }

  // ===== Performance (cache + timeout) =====
  const toNum = (v, d=0) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : d;
  };

  function fnv1a_(str){
    // hash leve só pra chave de cache (não é segurança)
    let h = 0x811c9dc5;
    const s = String(str || "");
    for(let i=0;i<s.length;i++){
      h ^= s.charCodeAt(i);
      h = (h + ((h<<1) + (h<<4) + (h<<7) + (h<<8) + (h<<24))) >>> 0;
    }
    return ("00000000" + h.toString(16)).slice(-8);
  }

  function cacheKey_(name, token){
    return `cpro_cache_${name}_${fnv1a_(token||"")}`;
  }

  function cacheGet_(key, maxAgeMs){
    try{
      const raw = localStorage.getItem(key);
      if(!raw) return null;
      const obj = JSON.parse(raw);
      if(!obj || !obj.ts) return null;
      if(maxAgeMs && (Date.now() - Number(obj.ts)) > maxAgeMs) return null;
      return obj.data || null;
    }catch(_){ return null; }
  }

  function cacheSet_(key, data){
    try{ localStorage.setItem(key, JSON.stringify({ ts: Date.now(), data })); }catch(_){ }
  }

  async function withTimeout_(promise, ms, label){
    const t = toNum(ms, 0);
    if(!t) return await promise;
    let to;
    const timeout = new Promise((_, rej)=>{
      to = setTimeout(()=>rej(new Error(label || `timeout ${t}ms`)), t);
    });
    try{
      return await Promise.race([promise, timeout]);
    }finally{
      try{ clearTimeout(to); }catch(_){ }
    }
  }

  // ===== Catálogos (default) =====
  const CATALOG = {
    epis: [
      { key:"capacete", label:"Capacete", type:"qty" },
      { key:"oculos_transparente", label:"Óculos Transparente", type:"qty" },
      { key:"prot_auricular", label:"Protetor auricular", type:"qty" },
      { key:"pff2", label:"Mascara PFF2", type:"qty" },
      { key:"luva_pu", label:"Luva PU", type:"qty" },
      { key:"colete_refletivo", label:"Colete Refletivo", type:"qty" },
      { key:"botina", label:"Botina (tam)", type:"size" },
                                                    ],
    materiais: [
      { key:"balanca_precisao", label:"Balança de Precisão", type:"qty", min:0 },
      { key:"calador", label:"Calador", type:"qty", min:0 },
      { key:"impressora_laudo", label:"Impressora de Laudo", type:"qty", min:0 },
      { key:"alicate_corte", label:"Alicate de corte", type:"qty", min:0 },
      { key:"quarteador", label:"Quarteador", type:"qty", min:0 },
      { key:"caixa_bobinas", label:"Caixa de Bobinas", type:"qty", min:0 },
      { key:"jogo_peneiras", label:"Jogo de Peneiras", type:"qty", min:0 },
      { key:"luminaria", label:"Luminária", type:"qty", min:0 },
      { key:"micropipeta", label:"Micropipeta", type:"qty", min:0 },
      { key:"impressora_a4", label:"Impressora A4", type:"qty", min:0 },
      { key:"pinca", label:"Pinça", type:"qty", min:0 },
                                                    ],
    uniformes: [
      { key:"uniforme", label:"Uniforme (Qtd 1/2)", type:"qtd12" },
      { key:"tamanho", label:"Tamanho", type:"size_uniforme" },
      { key:"cor", label:"Cor", type:"cor_uniforme" },
    ],
    patrimonios: [
      { key:"patrimonio", label:"Patrimônio/Item", type:"text" },
      { key:"numero", label:"Nº Patrimônio", type:"text" },
    ]
  };

  // ===== State =====
  const state = {
    ready:false,
    loading:false,
    tab:"epis", // uniformes | materiais | epis | patrimonios
    dataRef: hojeDMY(),
    supervisaoSel:"",
    gestor:null,
    colaboradores: [],

    // matriz por aba
    grids: {
      uniformes: { cols: CATALOG.uniformes.slice(), rows: [] },
      materiais: { cols: CATALOG.materiais.slice(), rows: [] },
      epis: { cols: CATALOG.epis.slice(), rows: [] },
      patrimonios: { cols: CATALOG.patrimonios.slice(), rows: [] },
    },

    // controle pedido por tipo
    pedidos: {
      uniformes: { modo:"NOVA", pedidoId:"" },
      materiais: { modo:"NOVA", pedidoId:"" },
      epis: { modo:"NOVA", pedidoId:"" },
      patrimonios: { modo:"NOVA", pedidoId:"" },
    },

    lastPdfUrl:"",
  };

  function ensureRow_(grid, colab){
    const name = norm(colab);
    if(!name) return null;
    const exists = grid.rows.find(r => r.colaborador === name);
    if(exists) return exists;
    const obj = { colaborador: name, values: {} };
    // init
    grid.cols.forEach(c=>{
      if(c.type === "qty" || c.type === "qtd12") obj.values[c.key] = 0;
      else obj.values[c.key] = "";
    });
    grid.rows.push(obj);
    return obj;
  }

  function removeRow_(grid, colab){
    grid.rows = grid.rows.filter(r => r.colaborador !== colab);
  }

  function addColumn_(grid, col){
    const key = norm(col.key) || ("col_" + Math.random().toString(16).slice(2));
    if(grid.cols.some(c=>c.key===key)) return;
    grid.cols.push(Object.assign({ key }, col));
    grid.rows.forEach(r=>{
      r.values[key] = (col.type === "qty" || col.type === "qtd12") ? 0 : "";
    });
  }

  function removeColumn_(grid, key){
    grid.cols = grid.cols.filter(c=>c.key !== key);
    grid.rows.forEach(r=>{ try{ delete r.values[key]; }catch(_){} });
  }

  // ===== UI =====
  function toast_(msg){
    const t = document.createElement("div");
    t.className = "cpro-toast";
    t.textContent = String(msg||"");
    document.body.appendChild(t);
    setTimeout(()=>t.classList.add("show"), 10);
    setTimeout(()=>{ t.classList.remove("show"); setTimeout(()=>t.remove(), 250); }, 2200);
  }

  function setLoading_(v){
    state.loading = !!v;
    const el = document.querySelector("#cpro_loading");
    if(el) el.style.display = state.loading ? "flex" : "none";
  }

  function render_(container){
    container.innerHTML = `
      <div class="cpro-root">
        <div class="cpro-top">
          <div class="cpro-title">
            <div class="h1">Compras</div>
            <div class="sub">Modelo Dinâmico Unificado (por colaborador)</div>
          </div>

          <div class="cpro-filters">
            <div class="field">
              <label>Data</label>
              <input id="cpro_date" type="date" value="${esc(dmyToYmd_(state.dataRef) || "")}" />
            </div>
            <div class="field">
              <label>Supervisão</label>
              <select id="cpro_sup"></select>
            </div>

            <div class="actions">
              <button class="btn mini" id="cpro_back">← Voltar</button>
              <button class="btn mini" id="cpro_load_last">Carregar último</button>
              <button class="btn mini" id="cpro_last_pdf">Último PDF</button>
              <button class="btn ok" id="cpro_save">Salvar pedido</button>
            </div>
          </div>
        </div>

        <div class="cpro-tabs">
          ${tabBtn_("uniformes","Uniformes")}
          ${tabBtn_("materiais","Materiais")}
          ${tabBtn_("epis","EPIs")}
          ${tabBtn_("patrimonios","Patrimônios")}
        </div>

        <div class="cpro-body">
          <div class="cpro-grid-head">
            <button class="btn mini ok" id="cpro_add_row">+ Adicionar colaborador</button>
            <button class="btn mini" id="cpro_add_col">+ Adicionar item</button>
            <div class="hint">Dica: digite quantidades (0 = vazio). Botina é tamanho.</div>
          </div>

          <div class="cpro-table-wrap">
            ${renderGrid_(state.tab)}
          </div>
        </div>

        <div id="cpro_loading" class="cpro-loading" style="display:none;">
          <div class="spinner"></div>
          <div>Carregando…</div>
        </div>
      </div>
    `;

    // fill sup select
    const supSel = container.querySelector("#cpro_sup");
    const sups = getSups_();
    supSel.innerHTML = `<option value="">(todas)</option>` + sups.map(s=>`<option value="${esc(s)}">${esc(s)}</option>`).join("");
    supSel.value = state.supervisaoSel || "";

    // wire
    container.querySelectorAll(".cpro-tab").forEach(btn=>{
      btn.addEventListener("click", ()=>{
        state.tab = btn.getAttribute("data-tab");
        render_(container);
      });
    });

    const dateEl = container.querySelector("#cpro_date");
    dateEl.addEventListener("change", ()=>{
      state.dataRef = ymdToDmy_(dateEl.value) || state.dataRef;
    });

    supSel.addEventListener("change", ()=>{
      state.supervisaoSel = supSel.value;
      // opcional: filtrar sugeridos no add row
    });

    container.querySelector("#cpro_add_row").addEventListener("click", ()=> openAddRow_(container));
    container.querySelector("#cpro_add_col").addEventListener("click", ()=> openAddCol_(container));
    container.querySelector("#cpro_save").addEventListener("click", ()=> doSave_(container));
    container.querySelector("#cpro_back").addEventListener("click", ()=> goBack_());
    container.querySelector("#cpro_load_last").addEventListener("click", ()=> loadLast_(container));
    container.querySelector("#cpro_last_pdf").addEventListener("click", ()=> openLastPdf_());

    // inputs
    wireGridInputs_(container);
  }

  
function goBack_(){
  try{
    // tenta voltar no histórico (se veio do menu)
    if (window.history && window.history.length > 1) {
      window.history.back();
      return;
    }
  }catch(_){}
  // fallback: volta pro menu do gestor
  try{
    const base = (location.origin || "") + "/painel/gestor/app";
    location.href = base;
  }catch(_){
    try{ location.href = "/painel/gestor/app"; }catch(__){}
  }
}

function tabBtn_(key, label){
    const active = (state.tab === key) ? "active" : "";
    return `<button class="cpro-tab ${active}" data-tab="${esc(key)}">${esc(label)}</button>`;
  }

  function getSups_(){
    const g = state.gestor || {};
    const sups = Array.isArray(g.supervisoesLiberadas) ? g.supervisoesLiberadas : [];
    const uniq = [];
    sups.forEach(s=>{ const x = norm(s); if(x && !uniq.includes(x)) uniq.push(x); });
    // fallback: pegar de colaboradores
    if(!uniq.length){
      const c = Array.isArray(state.colaboradores) ? state.colaboradores : [];
      c.forEach(r=>{ const x = norm(r.supervisao); if(x && !uniq.includes(x)) uniq.push(x); });
    }
    return uniq.sort((a,b)=>a.localeCompare(b,"pt-BR"));
  }

  function renderGrid_(tab){
    const grid = state.grids[tab];
    if(!grid) return `<div class="cpro-empty">Aba inválida.</div>`;

    const cols = grid.cols;
    const rows = grid.rows;

    const th = cols.map(c=>{
      const removable = !isDefaultCol_(tab, c.key);
      return `
        <th>
          <div class="th-wrap">
            <span>${esc(c.label)}</span>
            ${removable ? `<button class="xcol" data-xcol="${esc(c.key)}" title="Remover coluna">×</button>` : ``}
          </div>
        </th>`;
    }).join("");

    const body = rows.map(r=>{
      return `
        <tr data-colab="${esc(r.colaborador)}">
          <td class="colab">
            <div class="colab-wrap">
              <span class="name">${esc(r.colaborador)}</span>
              <button class="xrow" data-xrow="${esc(r.colaborador)}" title="Remover colaborador">×</button>
            </div>
          </td>
          ${cols.map(c=> renderCell_(tab, r, c)).join("")}
        </tr>
      `;
    }).join("");

    return `
      <table class="cpro-table">
        <thead>
          <tr>
            <th class="sticky-col">Colaborador</th>
            ${th}
          </tr>
        </thead>
        <tbody>
          ${body || `<tr><td colspan="${1+cols.length}"><div class="cpro-empty">Clique em <b>Adicionar colaborador</b>.</div></td></tr>`}
        </tbody>
      </table>
    `;
  }

  function isDefaultCol_(tab, key){
    const defaults = (CATALOG[tab] || []).map(x=>x.key);
    return defaults.includes(key);
  }

  function renderCell_(tab, row, col){
    const v = row.values[col.key];
    const k = esc(col.key);
    const colab = esc(row.colaborador);

    // type handling
    if(tab === "uniformes"){
      if(col.type === "qtd12"){
      const isReserva = norm_(row.colaborador||"") === "RESERVA" || norm_(row.colaborador||"").startsWith("RESERVA");
      if(isReserva){
        const vv = (v==null || v==="") ? "" : v;
        return `<td><input class="cmp-in" type="number" min="0" step="1" value="${esc_(vv)}" data-col="${esc_(col.key)}" data-row="${rid}" /></td>`;
      }
      return `<td><select class="cmp-sel" data-col="${esc_(col.key)}" data-row="${rid}">
        ${[0,1,2].map(n=>`<option value="${n}" ${String(v||0)===String(n)?"selected":""}>${n}</option>`).join("")}
      </select></td>`;
    }
      if(col.type === "size_uniforme"){
        const opts = ["PP","P","M","G","GG","XG","G1","G2","G3"];
        return `<td><select class="cell sel" data-colab="${colab}" data-key="${k}">
          ${opts.map(o=>`<option value="${o}"${String(v||"M")===o?" selected":""}>${o}</option>`).join("")}
        </select></td>`;
      }
      if(col.type === "cor_uniforme"){
        const opts = ["VERDE","CINZA"];
        return `<td><select class="cell sel" data-colab="${colab}" data-key="${k}">
          ${opts.map(o=>`<option value="${o}"${String(v||"VERDE")===o?" selected":""}>${o}</option>`).join("")}
        </select></td>`;
      }
    }

    if(col.type === "qty"){
      return `<td><input class="cell inp" data-colab="${colab}" data-key="${k}" type="number" min="0" value="${esc(String(v||0))}" /></td>`;
    }
    if(col.type === "size"){
      return `<td><input class="cell inp" data-colab="${colab}" data-key="${k}" type="number" min="30" max="50" placeholder="Tam" value="${esc(String(v||""))}" /></td>`;
    }
    if(col.type === "text"){
      return `<td><input class="cell inp" data-colab="${colab}" data-key="${k}" type="text" value="${esc(String(v||""))}" /></td>`;
    }

    // default numeric
    return `<td><input class="cell inp" data-colab="${colab}" data-key="${k}" type="text" value="${esc(String(v||""))}" /></td>`;
  }

  function wireGridInputs_(container){
    // remove col / row
    container.querySelectorAll("[data-xcol]").forEach(b=>{
      b.addEventListener("click", (ev)=>{
        ev.preventDefault(); ev.stopPropagation();
        const key = b.getAttribute("data-xcol");
        if(!key) return;
        const grid = state.grids[state.tab];
        removeColumn_(grid, key);
        render_(container);
      });
    });
    container.querySelectorAll("[data-xrow]").forEach(b=>{
      b.addEventListener("click", (ev)=>{
        ev.preventDefault(); ev.stopPropagation();
        const name = b.getAttribute("data-xrow");
        const grid = state.grids[state.tab];
        removeRow_(grid, name);
        render_(container);
      });
    });

    // cell inputs
    container.querySelectorAll(".cell").forEach(el=>{
      const key = el.getAttribute("data-key");
      const colab = el.getAttribute("data-colab");
      if(!key || !colab) return;
      el.addEventListener("change", ()=>{
        const grid = state.grids[state.tab];
        const row = ensureRow_(grid, colab);
        if(!row) return;
        const col = grid.cols.find(c=>c.key===key);
        const raw = el.value;
        if(col && (col.type === "qty" || col.type === "qtd12")){
          row.values[key] = safeInt(raw,0);
        }else if(col && col.type === "size"){
          row.values[key] = norm(raw);
        }else{
          row.values[key] = norm(raw);
        }
      });
    });
  }

  // ===== Modals (simples) =====
  function modal_(title, contentHtml){
    const back = document.createElement("div");
    back.className = "cpro-modal-back";
    back.innerHTML = `
      <div class="cpro-modal">
        <div class="head">
          <div class="ttl">${esc(title||"")}</div>
          <button class="btn mini" data-close="1">Fechar</button>
        </div>
        <div class="body">${contentHtml||""}</div>
      </div>
    `;
    back.addEventListener("click", (ev)=>{
      if(ev.target === back) back.remove();
      const c = ev.target && ev.target.getAttribute ? ev.target.getAttribute("data-close") : "";
      if(c==="1") back.remove();
    });
    document.body.appendChild(back);
    return { el: back, close: ()=>back.remove() };
  }

  function openAddRow_(container){
    const sup = state.supervisaoSel;
    const rows = Array.isArray(state.colaboradores) ? state.colaboradores : [];
    const options = rows
      .filter(r=>!sup || norm(r.supervisao)===sup)
      .map(r=>norm(r.colaborador))
      .filter(Boolean)
      .sort((a,b)=>a.localeCompare(b,"pt-BR"));

    const html = `
      <div class="field">
        <label>Colaborador</label>
        <select id="cpro_pick_colab">
          <option value="">Selecione</option>
          <option value="__TODOS__">TODOS</option>
          <option value="RESERVA">RESERVA</option>
          ${options.map(n=>`<option value="${esc(n)}">${esc(n)}</option>`).join("")}
        </select>
      </div>
      <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:12px;">
        <button class="btn ok" id="cpro_pick_add">Adicionar</button>
      </div>
    `;
    const m = modal_("Adicionar colaborador", html);
    const btn = m.el.querySelector("#cpro_pick_add");
    btn.addEventListener("click", ()=>{
      const sel = m.el.querySelector("#cpro_pick_colab");
      const name = norm(sel.value);
      if(!name){ toast_("Selecione um colaborador."); return; }
      const grid = state.grids[state.tab];

      if(name === "__TODOS__"){
        // adiciona todos da supervisão selecionada
        options.forEach(n=>{ try{ ensureRow_(grid, n); }catch(_){} });
        m.close();
      }else{
        // RESERVA ou colaborador específico
        ensureRow_(grid, name);
        m.close();
      }
      render_(container);
    });
  }

  function openAddCol_(container){
    const tab = state.tab;
    const grid = state.grids[tab];

    // uniformes: não adiciona (para manter backend)
    if(tab === "uniformes"){
      toast_("Uniformes: use apenas Qtd/Tamanho/Cor (padrão).");
      return;
    }

    const html = `
      <div class="field">
        <label>Nome do item</label>
        <input id="cpro_col_name" type="text" placeholder="Ex.: Capa de chuva" />
      </div>
      <div class="field">
        <label>Tipo</label>
        <select id="cpro_col_type">
          <option value="qty">Quantidade</option>
          ${tab==="epis" ? `<option value="size">Tamanho (ex.: botina)</option>` : ``}
          <option value="text">Texto</option>
        </select>
      </div>
      <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:12px;">
        <button class="btn ok" id="cpro_col_add">Adicionar</button>
      </div>
    `;
    const m = modal_("Adicionar item (coluna)", html);
    m.el.querySelector("#cpro_col_add").addEventListener("click", ()=>{
      const label = norm(m.el.querySelector("#cpro_col_name").value);
      const type = norm(m.el.querySelector("#cpro_col_type").value) || "qty";
      if(!label){ toast_("Informe o nome do item."); return; }
      const key = "x_" + label.normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-zA-Z0-9]+/g,"_").toLowerCase();
      addColumn_(grid, { key, label, type });
      m.close();
      render_(container);
    });
  }

  // ===== Data ↔ Payload =====
  function buildPayload_(tipo){
    const dataRef = norm(state.dataRef) || hojeDMY();
    const sup = norm(state.supervisaoSel) || "SEM SUPERVISÃO";
    const grid = state.grids[tipo];

    if(tipo === "uniformes"){
      // mantém compat com GAS: itens {colaborador, supervisao, tamanho, qtd, cor}
      const itens = [];
      grid.rows.forEach(r=>{
        const qtd = safeInt(r.values.uniforme,0);
        if(!(qtd===1 || qtd===2)) return;
        const tamanho = normUp(r.values.tamanho || "M");
        const cor = normUp(r.values.cor || "VERDE");
        itens.push({ colaborador: r.colaborador, supervisao: sup, tamanho, qtd, cor });
      });
      return {
        tipo,
        dataRef,
        supervisao: sup,
        modo: state.pedidos.uniformes.modo || "NOVA",
        pedidoId: state.pedidos.uniformes.pedidoId || "",
        itens,
        outros: {}
      };
    }

    if(tipo === "epis"){
      // novo: por colaborador -> virar linhas {colaborador, epi, un, tamanho?}
      const itens = [];
      grid.rows.forEach(r=>{
        grid.cols.forEach(c=>{
          const v = r.values[c.key];
          if(c.type === "qty"){
            const un = safeInt(v,0);
            if(un>0){
              itens.push({ colaborador:r.colaborador, epi:c.label, un });
            }
          }else if(c.type === "size"){
            const tam = norm(v);
            if(tam){
              itens.push({ colaborador:r.colaborador, epi:"Botina", un:1, tamanho: tam });
            }
          }else if(c.type === "text"){
            const s = norm(v);
            if(s){
              itens.push({ colaborador:r.colaborador, epi:c.label, un:1, obs:s });
            }
          }
        });
      });
      return {
        tipo,
        dataRef,
        supervisao: sup,
        modo: state.pedidos.epis.modo || "NOVA",
        pedidoId: state.pedidos.epis.pedidoId || "",
        itens,
        outros: [] // compat
      };
    }

    if(tipo === "materiais" || tipo === "patrimonios"){
      const itens = [];
      grid.rows.forEach(r=>{
        grid.cols.forEach(c=>{
          const v = r.values[c.key];
          if(c.type === "qty"){
            const un = safeInt(v,0);
            if(un>0){
              itens.push({ colaborador:r.colaborador, material:c.label, un });
            }
          }else{
            const s = norm(v);
            if(!s) return;
            // text -> cria material com 1 unidade, para registrar
            itens.push({ colaborador:r.colaborador, material:`${c.label}: ${s}`, un: 1 });
          }
        });
      });
      return {
        tipo: (tipo==="patrimonios" ? "materiais" : "materiais"), // GAS só suporta materiais/epis/uniformes
        dataRef,
        supervisao: sup,
        modo: state.pedidos[tipo].modo || "NOVA",
        pedidoId: state.pedidos[tipo].pedidoId || "",
        itens,
        outros: {}
      };
    }

    return null;
  }

  async function doSave_(container){
    const token = getToken_();
    if(!token){ toast_("Sessão expirada. Faça login."); return; }

    const tipoUI = state.tab;
    const payload = buildPayload_(tipoUI);
    if(!payload){ toast_("Aba inválida."); return; }

    if(!Array.isArray(payload.itens) || !payload.itens.length){
      toast_("Preencha ao menos 1 valor (qtd/tamanho).");
      return;
    }

    setLoading_(true);
    try{
      const r = await apiPost_("salvarPedido", token, { payload });
      // manter pedidoId/mode
      const pid = norm(r.pedidoId || payload.pedidoId);
      if(pid){
        state.pedidos[tipoUI].pedidoId = pid;
        state.pedidos[tipoUI].modo = "ATUALIZAR";
      }
      state.lastPdfUrl = norm(r.pdfUrl || (r.pdf && r.pdf.driveUrl) || "");
      toast_(r.message || "Pedido enviado!");
    }catch(e){
      toast_(e.message || e);
    }finally{
      setLoading_(false);
      render_(container);
    }
  }

  async function loadLast_(container){
    const token = getToken_();
    if(!token){ toast_("Sessão expirada. Faça login."); return; }

    const tipo = state.tab;
    const sup = norm(state.supervisaoSel) || "SEM SUPERVISÃO";
    setLoading_(true);
    try{
      const r = await apiPost_("carregarUltimoPedido", token, { payload:{ tipo, supervisao:sup } });
      // r pode trazer itens no formato antigo; vamos tentar mapear:
      if(tipo === "uniformes" && Array.isArray(r.itens)){
        const g = state.grids.uniformes;
        g.rows = [];
        r.itens.forEach(it=>{
          const row = ensureRow_(g, it.colaborador);
          if(!row) return;
          row.values.uniforme = safeInt(it.qtd,0);
          row.values.tamanho = normUp(it.tamanho||"M");
          row.values.cor = normUp(it.cor||"VERDE");
        });
        state.pedidos.uniformes.pedidoId = norm(r.pedidoId||"");
        state.pedidos.uniformes.modo = "ATUALIZAR";
      }
      if(tipo === "epis" && Array.isArray(r.itens)){
        const g = state.grids.epis;
        g.rows = [];
        r.itens.forEach(it=>{
          const colab = norm(it.colaborador || it.Colaborador || "");
          if(!colab) return;
          const row = ensureRow_(g, colab);
          const epi = norm(it.epi || it.material || it.Material || "");
          if(!epi) return;
          // tenta achar coluna por label
          const col = g.cols.find(c=>normUp(c.label)===normUp(epi)) || (normUp(epi)==="BOTINA" ? g.cols.find(c=>c.type==="size") : null);
          if(col){
            if(col.type==="qty") row.values[col.key] = safeInt(it.un,0);
            if(col.type==="size") row.values[col.key] = norm(it.tamanho||"");
          }else{
            // cria coluna dinâmica
            const key = "x_" + epi.normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-zA-Z0-9]+/g,"_").toLowerCase();
            addColumn_(g, { key, label: epi, type: "qty" });
            row.values[key] = safeInt(it.un,0);
          }
        });
        state.pedidos.epis.pedidoId = norm(r.pedidoId||"");
        state.pedidos.epis.modo = "ATUALIZAR";
      }
      // materiais/patrimonios: tenta itens {material, un, colaborador}
      if((tipo==="materiais" || tipo==="patrimonios") && Array.isArray(r.itens)){
        const g = state.grids[tipo];
        g.rows = [];
        r.itens.forEach(it=>{
          const colab = norm(it.colaborador || it.Colaborador || "");
          if(!colab) return;
          const row = ensureRow_(g, colab);
          const mat = norm(it.material || it.Material || "");
          const un = safeInt(it.un,0);
          if(!mat || un<=0) return;
          const key = "x_" + mat.normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-zA-Z0-9]+/g,"_").toLowerCase();
          let col = g.cols.find(c=>c.key===key);
          if(!col){
            addColumn_(g, { key, label: mat, type:"qty" });
            col = g.cols.find(c=>c.key===key);
          }
          row.values[key] = (safeInt(row.values[key],0) + un);
        });
        state.pedidos[tipo].pedidoId = norm(r.pedidoId||"");
        state.pedidos[tipo].modo = "ATUALIZAR";
      }

      toast_("Carregado.");
    }catch(e){
      toast_(e.message || e);
    }finally{
      setLoading_(false);
      render_(container);
    }
  }

  async function openLastPdf_(){
    const url = norm(state.lastPdfUrl);
    if(url){
      window.open(url, "_blank", "noopener");
      return;
    }
    const token = getToken_();
    if(!token){ toast_("Sessão expirada. Faça login."); return; }
    const tipo = state.tab;
    const sup = norm(state.supervisaoSel) || "SEM SUPERVISÃO";
    setLoading_(true);
    try{
      const r = await apiPost_("carregarUltimoPDF", token, { payload:{ tipo, supervisao:sup } });
      const u = norm(r.pdfUrl || (r.pdf && r.pdf.driveUrl) || "");
      if(u){
        state.lastPdfUrl = u;
        window.open(u, "_blank", "noopener");
      }else{
        toast_("Nenhum PDF encontrado.");
      }
    }catch(e){
      toast_(e.message || e);
    }finally{
      setLoading_(false);
    }
  }

  async function boot_(container){
    const token = getToken_();
    if(!token){
      container.innerHTML = `<div class="cpro-root"><div class="cpro-empty">Sem sessão. Faça login e abra novamente.</div></div>`;
      return;
    }

    // 1) Render rápido com cache (evita esperar 15-20s do GAS)
    const ck = cacheKey_("listaRecente", token);
    const cached = cacheGet_(ck, 5 * 60 * 1000); // 5 min
    if(cached){
      try{
        state.dataRef = norm(cached.dataRef) || state.dataRef || hojeDMY();
        state.gestor = cached.gestor || state.gestor;
        state.colaboradores = Array.isArray(cached.colaboradores) ? cached.colaboradores : [];
        if(!state.supervisaoSel){
          const sups = getSups_();
          if(sups.length===1) state.supervisaoSel = sups[0];
        }
        state.ready = true;
        render_(container);
      }catch(_){ }
    }

    setLoading_(true);
    try{
      const r = await withTimeout_(
        apiPost_("carregarListaRecente", token, {}),
        12000,
        "Conexão lenta (compras): carregarListaRecente"
      );
      state.dataRef = norm(r.dataRef) || state.dataRef || hojeDMY();
      state.gestor = r.gestor || state.gestor;
      state.colaboradores = Array.isArray(r.colaboradores) ? r.colaboradores : [];

      // cache do contexto
      cacheSet_(ck, { dataRef: state.dataRef, gestor: state.gestor, colaboradores: state.colaboradores });

      // seleção default supervisão
      if(!state.supervisaoSel){
        const sups = getSups_();
        if(sups.length===1) state.supervisaoSel = sups[0];
      }
      state.ready = true;
      render_(container);
    }catch(e){
      // se já mostrou via cache, só avisa; senão, mostra erro na tela
      if(state.ready){
        toast_(e.message || e);
      }else{
        container.innerHTML = `<div class="cpro-root"><div class="cpro-empty">${esc(e.message||e)}</div></div>`;
      }
    }finally{
      setLoading_(false);
    }
  }

  async function openHome(container){
    if(!container) return;
    // garante css (evita layout cru)
    try{
      const href = new URL("../assets/css/compras_pro.css", document.baseURI).toString();
      const exists = Array.from(document.querySelectorAll('link[rel="stylesheet"]')).some(l => (l.href||"").includes("compras_pro.css"));
      if(!exists){
        const link = document.createElement("link");
        link.rel="stylesheet";
        link.href=href;
        document.head.appendChild(link);
      }
    }catch(_){}

    container.innerHTML = `<div class="cpro-root"><div class="cpro-empty">Carregando…</div></div>`;
    await boot_(container);
  }

  // auto-mount for gestor/compras.html
  const auto = document.getElementById(ROOT_ID);
  if(auto){
    openHome(auto);
  }

  window[MOD] = { openHome };
})();
