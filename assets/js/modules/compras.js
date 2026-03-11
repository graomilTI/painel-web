/**
 * assets/js/modules/compras.js
 * Compras — ADM (kanban por status)
 *
 * ✅ Padrão Painel Web: window.COMPRAS.openHome(container, opts)
 * - opts: { auth, token, api, onBack }
 *
 * Backend (GAS/Worker) esperado:
 *  module: "adm"
 *  actions:
 *   - "adm_compras_listPedidos"  -> { ok:true, pedidos:[...] }
 *   - "adm_compras_setStatus"    -> { ok:true }
 *   - "adm_compras_compraEfetuada" -> { ok:true } (dispara BotConversa p/ gestor)
 *
 * Obs: Se o backend ainda não tiver essas ações, o módulo exibe o erro e mantém UI.
 */

(function () {
  "use strict";

  function attachDatalist_(inputEl, items){
    try{
      if (!inputEl) return;
      const id = "dl_" + Math.random().toString(36).slice(2);
      const dl = document.createElement("datalist");
      dl.id = id;
      (items||[]).slice(0,300).forEach(v=>{
        const opt=document.createElement("option");
        opt.value=String(v||"");
        dl.appendChild(opt);
      });
      inputEl.setAttribute("list", id);
      inputEl.parentNode && inputEl.parentNode.appendChild(dl);
    }catch(_e){}
  }


  function escapeHtml_(s){
    s = (s===null||s===undefined) ? "" : String(s);
    return s
      .replace(/&/g,"&amp;")
      .replace(/</g,"&lt;")
      .replace(/>/g,"&gt;")
      .replace(/"/g,"&quot;")
      .replace(/'/g,"&#39;");
  }
  function esc_(s){ return escapeHtml_(s); }


  const MOD = {};

  const STATUS = {
    PENDENTE: "PENDENTE",
    AUTORIZACAO: "AUTORIZACAO",
    COTACAO: "COTACAO",
    ANDAMENTO: "EM_ANDAMENTO",
    PAGAMENTO: "PAGAMENTO",
    RECUSADO: "RECUSADO",
    EFETUADA: "COMPRA_EFETUADA",
  };

  const STATUS_LABEL = {
    [STATUS.PENDENTE]: "Pendente",
    [STATUS.AUTORIZACAO]: "Autorização",
    [STATUS.COTACAO]: "Cotação",
    [STATUS.ANDAMENTO]: "Em andamento",
    [STATUS.PAGAMENTO]: "Pagamento",
    [STATUS.RECUSADO]: "Recusado",
    [STATUS.EFETUADA]: "Compra efetuada",
  };

  const esc = (s) =>
    String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");

  function fmtDT(v){
    if (!v) return "";
    try{
      // aceita ISO, timestamp, ou dd/MM/yyyy HH:mm
      const d = (typeof v === "number") ? new Date(v) : new Date(String(v));
      if (!isNaN(d.getTime())) {
        const pad2 = (n)=>String(n).padStart(2,"0");
        return `${pad2(d.getDate())}/${pad2(d.getMonth()+1)}/${d.getFullYear()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
      }
    }catch(_){}
    return String(v);
  }

  function getToken_(opts){
    const t = (opts && (opts.token || (opts.auth && opts.auth.token))) ? (opts.token || opts.auth.token) : "";
    if (t) return String(t).trim();
    try{ const lt = (localStorage.getItem("g1000_token")||"").trim(); if (lt) return lt; }catch(_){}
    return "";
  }

  // Toast helper (evita ReferenceError e usa UI padrão do Painel quando existir)
  function toast_(root, msg, kind){
    try{
      if (window.toast) return window.toast(String(msg||""), kind || "info");
      if (window.UI && typeof window.UI.toast === "function") return window.UI.toast(String(msg||""));
    }catch(_){ }
    try{ console.log("[toast]", kind||"", msg); }catch(_){ }
    try{ alert(String(msg||"")); }catch(_){ }
  }

  async function apiAdm_(opts, action, payload){
    const api = opts && (opts.api || window.API);
    if (!api || typeof api.post !== "function") throw new Error("API.post não disponível (carregue auth/api).");
    const token = getToken_(opts);
    const body = Object.assign({ module: "adm", action, token }, payload || {});
    const res = await api.post(body);
    if (res && res.ok === false) throw new Error(res.error || res.message || "Erro no backend");
    return res || {};
  }

  function css_(){
    return `
      .cAdmWrap{ color:#e5e7eb; }
      .cAdmTop{
        display:flex; gap:10px; align-items:center; justify-content:space-between;
        padding:12px 12px 8px 12px;
      }
      .cAdmTitle{ font-size:18px; font-weight:900; letter-spacing:.2px; }
      .cAdmTools{ display:flex; gap:10px; align-items:center; flex-wrap:wrap; }
      .cAdmInput{
        background:#0b1220; color:#e5e7eb; border:1px solid rgba(255,255,255,.10);
        border-radius:10px; padding:10px 12px; outline:none; min-width:240px;
      }
      .cAdmBtn{
        appearance:none; border:1px solid rgba(255,255,255,.12);
        background:rgba(255,255,255,.06); color:#e5e7eb;
        padding:10px 12px; border-radius:12px; cursor:pointer;
        font-weight:800;
      }
      .cAdmBtn:hover{ background:rgba(255,255,255,.10); }
      .cAdmBtn.ok{ background:rgba(22,101,52,.28); border-color:rgba(22,101,52,.55); }
      .cAdmBtn.ok:hover{ background:rgba(22,101,52,.36); }
      .cAdmBtn.warn{ background:rgba(185,28,28,.20); border-color:rgba(185,28,28,.45); }
      .cAdmBtn.warn:hover{ background:rgba(185,28,28,.28); }

      .cAdmTabs{
        display:flex; gap:8px; flex-wrap:wrap;
        padding:0 12px 12px 12px;
      }
      .cAdmTab{
        border:1px solid rgba(255,255,255,.10);
        background:rgba(255,255,255,.05);
        color:#e5e7eb;
        padding:10px 12px;
        border-radius:999px;
        cursor:pointer;
        font-weight:900;
        display:flex; align-items:center; gap:8px;
      }
      .cAdmTab.active{
        background:rgba(22,101,52,.25);
        border-color:rgba(22,101,52,.55);
      }
      .cAdmBadge{
        display:inline-flex; align-items:center; justify-content:center;
        min-width:24px; height:22px; padding:0 8px;
        border-radius:999px;
        font-size:12px; font-weight:900;
        background:rgba(255,255,255,.10);
        border:1px solid rgba(255,255,255,.10);
      }

      .cAdmGrid{
        display:grid;
        grid-template-columns: 1fr;
        gap:10px;
        padding:0 12px 14px 12px;
      }

      .cAdmCard{
        border:1px solid rgba(255,255,255,.10);
        background:linear-gradient(180deg, rgba(255,255,255,.06), rgba(255,255,255,.03));
        border-radius:16px;
        padding:12px;
      }
      .cAdmCardTop{
        display:flex; gap:10px; align-items:flex-start; justify-content:space-between;
      }
      .cAdmCardTitle{ font-weight:950; font-size:14px; }
      .cAdmMeta{ opacity:.85; font-size:12px; margin-top:2px; }
      .cAdmPill{
        font-size:12px; font-weight:900;
        padding:6px 10px;
        border-radius:999px;
        border:1px solid rgba(255,255,255,.12);
        background:rgba(255,255,255,.06);
        white-space:nowrap;
      }
      .cAdmItems{
        margin-top:10px;
        border-top:1px dashed rgba(255,255,255,.12);
        padding-top:10px;
        display:flex; flex-direction:column; gap:6px;
      }
      .cAdmItemRow{
        display:flex; gap:8px; align-items:center; justify-content:space-between;
        font-size:13px;
      }
      .cAdmItemRow b{ font-weight:900; }
      .cAdmFooter{
        margin-top:10px;
        display:flex; gap:8px; flex-wrap:wrap;
      }

      .cAdmHint{
        padding:10px 12px;
        margin:0 12px 12px 12px;
        border:1px solid rgba(255,255,255,.10);
        background:rgba(255,255,255,.04);
        border-radius:14px;
        font-size:12px;
        opacity:.9;
      }
      .cAdmErr{
        border-color:rgba(185,28,28,.45);
        background:rgba(185,28,28,.12);
      }

      /* modal simples */
      .cAdmModalMask{
        position:fixed; inset:0; background:rgba(0,0,0,.60);
        display:flex; align-items:center; justify-content:center;
        z-index:9999;
      }
      .cAdmModal{
        width:min(900px, calc(100vw - 24px));
        background:#0b1220;
        border:1px solid rgba(255,255,255,.12);
        border-radius:18px;
        padding:14px;
        box-shadow:0 20px 70px rgba(0,0,0,.45);
        max-height: calc(100vh - 24px);
        overflow:auto;
      }
      .cAdmModal h3{ margin:0 0 10px 0; font-size:16px; }
      .cAdmRow{ display:flex; gap:10px; flex-wrap:wrap; }
      .cAdmCol{ flex:1; min-width:220px; }
      .cAdmLabel{ font-size:12px; opacity:.85; margin:6px 0; }
      .cAdmTA{
        width:100%;
        min-height:88px;
        background:#0f172a;
        color:#e5e7eb;
        border:1px solid rgba(255,255,255,.12);
        border-radius:12px;
        padding:10px 12px;
        outline:none;
        resize:vertical;
      }
      .cAdmSelect{
        width:100%;
        background:#0f172a;
        color:#e5e7eb;
        border:1px solid rgba(255,255,255,.12);
        border-radius:12px;
        padding:10px 12px;
        outline:none;
        color-scheme: dark; /* PADRÃO do Painel */
      }
      .cAdmChecks{ display:flex; flex-direction:column; gap:8px; }
      .cAdmCheck{
        display:flex; gap:8px; align-items:flex-start;
        border:1px solid rgba(255,255,255,.10);
        background:rgba(255,255,255,.04);
        padding:10px 12px;
        border-radius:12px;
      }
      .cAdmCheck input{ margin-top:2px; }
      .cAdmMuted{ opacity:.80; font-size:12px; }
    
      /* ===== Cotação (modal) ===== */
      .cCotWrap{ display:block; }
      .cCotList{
        margin-top:10px;
        max-height:52vh;
        overflow:auto;
        border:1px solid rgba(255,255,255,.10);
        border-radius:14px;
        padding:10px;
        background:rgba(255,255,255,.03);
      }
      .cCotItem{
        display:grid;
        grid-template-columns: 28px 1fr 320px;
        gap:10px;
        align-items:center;
        padding:10px 8px;
        border-bottom:1px dashed rgba(255,255,255,.10);
      }
      .cCotItem:last-child{ border-bottom:none; }
      .cCotInfo{ min-width:0; }
      .cCotTitle{ font-weight:900; }
      .cCotSub{ font-size:12px; opacity:.85; margin-top:2px; }
      .cCotSel{
        width:100%;
        background:#0b1220;
        color:#e5e7eb;
        border:1px solid rgba(255,255,255,.10);
        border-radius:12px;
        padding:10px 12px;
        outline:none;
      }
      .cCotSel option{ background:#0b1220; color:#e5e7eb; }
      @media (max-width: 820px){
        .cCotItem{ grid-template-columns: 28px 1fr; }
        .cCotSel{ grid-column: 1 / -1; }
      }
`;
  }

  function normalizeStatus_(s){
    const v = String(s || "").toUpperCase().trim();
    if (!v) return STATUS.PENDENTE;

    // normaliza acentos comuns
    const vv = v
      .replace(/Ç/g,"C").replace(/Ã/g,"A").replace(/Á/g,"A").replace(/Â/g,"A")
      .replace(/É/g,"E").replace(/Ê/g,"E").replace(/Í/g,"I")
      .replace(/Ó/g,"O").replace(/Ô/g,"O").replace(/Õ/g,"O")
      .replace(/Ú/g,"U");

    if (vv === "PENDENTE") return STATUS.PENDENTE;

    if (vv === "AUTORIZACAO" || vv === "AUTORIZAR") return STATUS.AUTORIZACAO;
    if (vv === "COTACAO" || vv === "ORCAMENTO" || vv === "COTAR") return STATUS.COTACAO;

    if (vv === "PAGAMENTO" || vv === "PAGAR") return STATUS.PAGAMENTO;

    if (vv === "EM ANDAMENTO" || vv === "EM_ANDAMENTO" || vv === "ANDAMENTO") return STATUS.ANDAMENTO;

    if (vv === "RECUSADO" || vv === "REPROVADO") return STATUS.RECUSADO;

    if (vv === "COMPRA EFETUADA" || vv === "COMPRA_EFETUADA" || vv === "EFETUADA" || vv === "EFETUADO" || vv === "CONCLUIDO" || vv === "CONCLUIDA") return STATUS.EFETUADA;

    // fallback: se vier algum status novo do backend, não some: manda pra PENDENTE
    return STATUS.PENDENTE;
  }

  function buildUI_(container){
    container.innerHTML = `
      <div class="cAdmWrap">
        <style>${css_()}</style>

        <div class="cAdmTop">
          <div>
            <button class="cAdmBtn" id="cAdmBack" style="margin-bottom:8px">← Voltar</button>
            <div class="cAdmTitle">Compras — ADM</div>
            <div class="cAdmMeta">Gerencie solicitações dos gestores (Pendente → Andamento → Efetuada / Recusada)</div>
          </div>
          <div class="cAdmTools">
            <input class="cAdmInput" id="cAdmSearch" placeholder="Buscar por gestor, pedido, coordenação, item..." />
            <button class="cAdmBtn" id="cAdmReload">Atualizar</button>
          </div>
        </div>

        <div class="cAdmTabs" id="cAdmTabs"></div>

        <div class="cAdmHint cAdmErr" id="cAdmErr" style="display:none"></div>

        <div class="cAdmGrid" id="cAdmGrid"></div>
      </div>
    `;
  }

  function modal_(root, { title, bodyHTML, onConfirm, confirmText="Confirmar", confirmClass="ok", onOpen }){
    return new Promise((resolve)=>{
      const mask = document.createElement("div");
      mask.className = "cAdmModalMask";
      mask.innerHTML = `
        <div class="cAdmModal" role="dialog" aria-modal="true">
          <h3>${esc(title || "Ação")}</h3>
          <div class="cAdmBody">${bodyHTML || ""}</div>
          <div class="cAdmFooter" style="justify-content:flex-end; margin-top:12px">
            <button class="cAdmBtn" data-act="cancel">Cancelar</button>
            <button class="cAdmBtn ${confirmClass}" data-act="ok">${esc(confirmText)}</button>
          </div>
        </div>
      `;
      const close = (v)=>{ try{mask.remove();}catch(_){ } resolve(v); };
      mask.addEventListener("click",(ev)=>{
        if (ev.target === mask) close(null);
      });
      mask.querySelector('[data-act="cancel"]').addEventListener("click",()=>close(null));
      mask.querySelector('[data-act="ok"]').addEventListener("click", async ()=>{
        try{
          if (typeof onConfirm === "function") {
            const v = await onConfirm(mask);
            close(v ?? true);
          } else {
            close(true);
          }
        }catch(err){
          alert(String(err?.message || err));
        }
      });
      root.appendChild(mask);
      try{
        if (typeof onOpen === "function") onOpen(mask);
      }catch(_){ }
      // foco inicial
      setTimeout(()=>{
        const i = mask.querySelector("textarea, input, select, button");
        if (i) try{i.focus();}catch(_){}
      }, 10);
    });
  }

  function parseItens_(pedido){
    // tenta suportar formatos diferentes
    // 1) pedido.itens (array)
    // 2) pedido.uniformes/materiais/epis (arrays)
    // 3) pedido.itensJson (string)
    const out = [];
    if (Array.isArray(pedido?.itens)) out.push(...pedido.itens);
    else {
      ["uniformes","materiais","epis","items"].forEach(k=>{
        if (Array.isArray(pedido?.[k])) out.push(...pedido[k]);
      });
      if (!out.length && pedido?.itensJson) {
        try{
          const j = JSON.parse(pedido.itensJson);
          if (Array.isArray(j)) out.push(...j);
        }catch(_){}
      }
    }
    return out.map((it)=> {
      const raw = it && (it.raw || it);
      const d = (it && it.data) ? it.data : (raw && raw.data) ? raw.data : null;
      const tipo = (it && it.tipo) ? String(it.tipo).toUpperCase() : (pedido && pedido.tipo) ? String(pedido.tipo).toUpperCase() : "";

      // Campos base (fallbacks)
      let nome = (raw && (raw.nome || raw.item || raw.produto || raw.descricao)) ? String(raw.nome || raw.item || raw.produto || raw.descricao) : "";
      // quantidade vem com variações de cabeçalho (qtd/Qtd/Quantidade/un/Un)
      let qtd  = (raw && (
        raw.qtd ?? raw.Qtd ??
        raw.quantidade ?? raw.Quantidade ??
        raw.un ?? raw.Un ??
        raw.q ?? raw.Q ??
        ""
      )) ?? "";
      let obs  = (raw && (raw.obs || raw.observacao || raw.cor || raw.tam || "")) ? String(raw.obs || raw.observacao || raw.cor || raw.tam) : "";

      // ✅ Formatos do nosso backend (linhas: {item,resumo,data:{...}})
      if (d && typeof d === "object") {
        if (tipo === "COLAB") {
          nome = d.colaborador || nome;
          qtd  = (d.qtd != null && d.qtd !== "") ? d.qtd : ((d.Qtd != null && d.Qtd !== "") ? d.Qtd : qtd);
          const parts = [];
          if (d.tamanho) parts.push(`Tam ${d.tamanho}`);
          if (d.cor) parts.push(`Cor ${d.cor}`);
          obs = parts.join(" • ") || obs;
        } else if (tipo === "MAT") {
          nome = d.material || nome;
          qtd  = (d.qtd != null && d.qtd !== "") ? d.qtd : ((d.Qtd != null && d.Qtd !== "") ? d.Qtd : qtd);
          obs  = d.etiquetas || obs;
        } else if (tipo === "EPI") {
          nome = d.material || nome;
          qtd  = (d.un != null && d.un !== "") ? d.un : ((d.Un != null && d.Un !== "") ? d.Un : qtd);
        }
      }

      // Último fallback: usar o "resumo/item" como nome
      if (!nome) nome = (raw && (raw.resumo || raw.item)) ? String(raw.resumo || raw.item) : "";

      return {
          nome: String(nome || "").trim(),
          qtd: String(qtd == null ? "" : qtd).trim(),
          obs: String(obs || "").trim(),
          // ✅ Sugestão automática (backend) para tipo de pagamento: PATRIMONIO | OUTROS
          tipoSug: (function(){
            try{
              const dd = (d && typeof d === 'object') ? d : {};
              const rr = (raw && typeof raw === 'object') ? raw : {};
              let v = dd.__PgtoTipo ?? dd.__pgtoTipo ?? dd.pgtoTipo ?? dd.PgtoTipo ?? dd.PGTO_TIPO ?? dd.tipoSug ?? dd.tipo_sug ?? dd.Tipo ?? dd.TIPO ?? dd.tipoPGTO ?? dd.tipoPgto ?? dd.tipo_pgto ?? dd.tipoPagamento ?? dd.pagamentoTipo ?? dd.classificacao ?? dd.classe ?? dd.tipoAuto ?? rr.__PgtoTipo ?? rr.__pgtoTipo ?? rr.pgtoTipo ?? rr.PgtoTipo ?? rr.PGTO_TIPO ?? rr.tipoSug ?? rr.tipo_sug ?? rr.Tipo ?? rr.TIPO ?? rr.tipoPgto ?? rr.tipo_pgto ?? rr.classificacao ?? rr.classe ?? rr.tipoAuto ?? (pedido && (pedido.__PgtoTipo ?? pedido.pgtoTipo ?? (pedido.meta && (pedido.meta.__PgtoTipo ?? pedido.meta.pgtoTipo ?? pedido.meta.tipoPgto ?? pedido.meta.tipoSug))));
              if (v == null || v === '') {
                // flags booleanas comuns
                if (dd.patrimonio === true || rr.patrimonio === true) v = 'PATRIMONIO';
                if (dd.outros === true || rr.outros === true) v = 'OUTROS';
              }
              v = String(v || '').trim().toUpperCase();
              if (v === 'PATRIMÔNIO') v = 'PATRIMONIO';
              if (v === 'PATRIMONIO' || v === 'OUTROS') return v;
              return '';
            }catch(_e){ return ''; }
          })(),
          raw
        };
    }).filter(x=>x.nome || x.qtd || x.obs);

  }
  // Agrupa itens para não ficar lista gigante
  // - COLAB (uniformes): agrupa por Tam + Cor (vem em it.obs) e soma quantidades
  // - MAT/EPI/outros: agrupa por Nome + Obs e soma quantidades
  function groupItensAdm_(pedido, itens){
    const tipo = String((pedido && (pedido.tipo || pedido.Tipo || "")) || "").toUpperCase().trim();
    const isColab = tipo === "COLAB" || tipo.includes("UNIFORM");
    const map = new Map();

    function toNum_(v){
      const n = Number(String(v==null?"":v).replace(",", ".").replace(/[^\d.\-]/g,""));
      return Number.isFinite(n) ? n : 0;
    }
    function norm_(s){
      return String(s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/\s+/g," ").trim().toUpperCase();
    }

    (itens||[]).forEach(it=>{
      if (!it) return;
      const qtd = toNum_(it.qtd);
      if (isColab){
        const label = String(it.obs||"").trim(); // "Tam M • Cor VERDE"
        const key = "U|" + norm_(label || it.nome);
        const prev = map.get(key) || { nome: label || it.nome || "Uniforme", obs: "", qtd: 0 };
        prev.qtd += qtd || 0;
        map.set(key, prev);
      } else {
        const nome = String(it.nome||"").trim();
        const obs  = String(it.obs||"").trim();
        const key = "M|" + norm_(nome) + "|" + norm_(obs);
        const prev = map.get(key) || { nome: nome || "Item", obs, qtd: 0 };
        prev.qtd += qtd || 0;
        map.set(key, prev);
      }
    });

    const out = Array.from(map.values());
    out.forEach(o=>{
      // Exibe inteiro quando der
      const n = o.qtd;
      o.qtd = (Math.abs(n - Math.round(n)) < 1e-9) ? String(Math.round(n)) : String(n);
    });

    // Ordena
    out.sort((a,b)=> (a.nome||"").localeCompare(b.nome||"", "pt-BR", {sensitivity:"base"}));
    return out;
  }



  function render_(root, state){
    const tabs = root.querySelector("#cAdmTabs");
    const grid = root.querySelector("#cAdmGrid");
    const errBox = root.querySelector("#cAdmErr");

    const counts = {
      [STATUS.PENDENTE]: 0,
      [STATUS.AUTORIZACAO]: 0,
      [STATUS.COTACAO]: 0,
      [STATUS.ANDAMENTO]: 0,
      [STATUS.PAGAMENTO]: 0,
      [STATUS.RECUSADO]: 0,
      [STATUS.EFETUADA]: 0,
    };
    state.pedidos.forEach(p=>{ counts[p.__status] = (counts[p.__status]||0)+1; });

    tabs.innerHTML = `
      <button class="cAdmTab ${state.tab===STATUS.PENDENTE?'active':''}" data-tab="${STATUS.PENDENTE}">
        ${STATUS_LABEL[STATUS.PENDENTE]} <span class="cAdmBadge">${counts[STATUS.PENDENTE]}</span>
      </button>
      <button class="cAdmTab ${state.tab===STATUS.AUTORIZACAO?'active':''}" data-tab="${STATUS.AUTORIZACAO}">
        ${STATUS_LABEL[STATUS.AUTORIZACAO]} <span class="cAdmBadge">${counts[STATUS.AUTORIZACAO]}</span>
      </button>
      <button class="cAdmTab ${state.tab===STATUS.COTACAO?'active':''}" data-tab="${STATUS.COTACAO}">
        ${STATUS_LABEL[STATUS.COTACAO]} <span class="cAdmBadge">${counts[STATUS.COTACAO]}</span>
      </button>
      <button class="cAdmTab ${state.tab===STATUS.ANDAMENTO?'active':''}" data-tab="${STATUS.ANDAMENTO}">
        ${STATUS_LABEL[STATUS.ANDAMENTO]} <span class="cAdmBadge">${counts[STATUS.ANDAMENTO]}</span>
      </button>
      <button class="cAdmTab ${state.tab===STATUS.PAGAMENTO?'active':''}" data-tab="${STATUS.PAGAMENTO}">
        ${STATUS_LABEL[STATUS.PAGAMENTO]} <span class="cAdmBadge">${counts[STATUS.PAGAMENTO]}</span>
      </button>
      <button class="cAdmTab ${state.tab===STATUS.RECUSADO?'active':''}" data-tab="${STATUS.RECUSADO}">
        ${STATUS_LABEL[STATUS.RECUSADO]} <span class="cAdmBadge">${counts[STATUS.RECUSADO]}</span>
      </button>
      <button class="cAdmTab ${state.tab===STATUS.EFETUADA?'active':''}" data-tab="${STATUS.EFETUADA}">
        ${STATUS_LABEL[STATUS.EFETUADA]} <span class="cAdmBadge">${counts[STATUS.EFETUADA]}</span>
      </button>
    `;

    errBox.style.display = state.error ? "block" : "none";
    errBox.innerHTML = state.error ? `⚠️ ${esc(state.error)}` : "";

    const q = String(state.query||"").trim().toLowerCase();

    const list = state.pedidos
      .filter(p => p.__status === state.tab)
      .filter(p=>{
        if (!q) return true;
        const itens = parseItens_(p).map(x => `${x.nome} ${x.qtd} ${x.obs}`).join(" | ");
        const blob = `${
          p.id||p.pedidoId||p.pedido||p.requestId||p.reqId||p.key||""
        } ${p.gestor||p.nomeGestor||""} ${p.coordenacao||p.coord||""} ${p.supervisao||p.sup||""} ${p.regional||""} ${p.tipo||""} ${itens} ${p.statusObs||p.motivo||""}`.toLowerCase();
        return blob.includes(q);
      })
      .sort((a,b)=>{
        const da = (a.ts || a.timestamp || a.data || 0);
        const db = (b.ts || b.timestamp || b.data || 0);
        // mais novo primeiro
        return String(db).localeCompare(String(da));
      });

    if (!list.length){
      grid.innerHTML = `<div class="cAdmHint">Nenhum pedido aqui (ou filtro ativo).</div>`;
      return;
    }

    grid.innerHTML = list.map(p=>{
      const pid = p.id || p.pedidoId || p.pedido || p.requestId || p.reqId || (p.key ? String(p.key).split("|").slice(1).join("|") : "") || "";
      const gestor = p.gestor || p.nomeGestor || p.nome || "—";
      const coord = p.coordenacao || p.coord || "—";
      const sup = p.supervisao || p.sup || "";
      const reg = p.regional || "";
      const dt = fmtDT(p.ts || p.timestamp || p.data || p.dataHora || "");
      const itensRaw = parseItens_(p);
      const itens = groupItensAdm_(p, itensRaw);
      const pill = STATUS_LABEL[p.__status] || p.__status;

      const obs = p.statusObs || p.motivo || p.observacao || "";

      return `
        <div class="cAdmCard" data-id="${esc(pid)}" data-key="${esc(p.key||"")}" data-rid="${esc(p.requestId||"")}" data-tipo="${esc(p.tipo||"")}">
          <div class="cAdmCardTop">
            <div>
              <div class="cAdmCardTitle">Pedido <b>#${esc(pid || "—")}</b> — ${esc(gestor)}</div>
              <div class="cAdmMeta"><b>${esc(p.tipoLabel||"")}</b> • ${esc(coord)}${sup?` • ${esc(sup)}`:""}${reg?` • ${esc(reg)}`:""}${dt?` • ${esc(dt)}`:""}</div>
              ${obs ? `<div class="cAdmMeta" style="margin-top:6px">Obs: ${esc(obs)}</div>` : ``}
            </div>
            <div class="cAdmPill">${esc(pill)}</div>
          </div>

          <div class="cAdmItems">
            ${itens.length ? itens.slice(0, 20).map(it=>`
              <div class="cAdmItemRow">
                <div><b>${esc(it.nome || "Item")}</b> <span style="opacity:.8">${esc(it.obs||"")}</span></div>
                <div style="opacity:.9">${esc(it.qtd||"")}</div>
              </div>
            `).join("") : `<div class="cAdmMeta">Sem itens detalhados (verifique o formato do backend).</div>`}
            ${itens.length > 20 ? `<div class="cAdmMeta">+ ${itens.length - 20} itens…</div>` : ``}
          </div>

          <div class="cAdmFooter">
            ${(()=>{
              const st = p.__status;
              if (st === STATUS.PENDENTE) return `
                <button class="cAdmBtn ok" data-act="autorizar">Solicitar Autorização</button>
                <button class="cAdmBtn" data-act="cotacao">Cotar</button>
                <button class="cAdmBtn warn" data-act="recusar">Recusar</button>
              `;
              if (st === STATUS.AUTORIZACAO) return `
                <button class="cAdmBtn" data-act="cotacao">Cotar</button>
                <button class="cAdmBtn warn" data-act="recusar">Recusar</button>
                <button class="cAdmBtn" data-act="reabrir">Voltar p/ pendente</button>
              `;
              if (st === STATUS.COTACAO) return `
                <button class="cAdmBtn ok" data-act="pagamento">Solicitar Pagamento</button>
                <button class="cAdmBtn" data-act="cotacao">Cotar</button>
                <button class="cAdmBtn" data-act="reabrir">Voltar p/ pendente</button>
                <button class="cAdmBtn warn" data-act="recusar">Recusar</button>
              `;
              if (st === STATUS.ANDAMENTO) return `
                <button class="cAdmBtn ok" data-act="pagamento">Solicitar Pagamento</button>
                <button class="cAdmBtn ok" data-act="concluir">Concluir compra</button>
                <button class="cAdmBtn warn" data-act="recusar">Recusar</button>
                <button class="cAdmBtn" data-act="reabrir">Voltar p/ pendente</button>
              `;
              if (st === STATUS.PAGAMENTO) return `
                <button class="cAdmBtn ok" data-act="concluir">Concluir compra</button>
                <button class="cAdmBtn" data-act="reabrir">Voltar p/ andamento</button>
              `;
              if (st === STATUS.RECUSADO) return `
                <button class="cAdmBtn" data-act="reabrir">Reabrir (pendente)</button>
              `;
              if (st === STATUS.EFETUADA) return `
                <button class="cAdmBtn" data-act="reabrir">Reabrir (andamento)</button>
              `;
              return ``;
            })()}
          </div>
        </div>
      `;
    }).join("");
  }

  function bind_(root, opts, state){
    const search = root.querySelector("#cAdmSearch");
    const reload = root.querySelector("#cAdmReload");

    search.addEventListener("input", ()=>{
      state.query = search.value || "";
      render_(root, state);
    });

    reload.addEventListener("click", async ()=>{
      await load_(root, opts, state);
    });

    root.querySelector("#cAdmTabs").addEventListener("click",(ev)=>{
      const btn = ev.target.closest("[data-tab]");
      if (!btn) return;
      state.tab = btn.getAttribute("data-tab");
      render_(root, state);
    });

    root.querySelector("#cAdmGrid").addEventListener("click", async (ev)=>{
      const btn = ev.target.closest("[data-act]");
      if (!btn) return;
      const card = ev.target.closest(".cAdmCard");
      if (!card) return;

      const pid = card.getAttribute("data-id");
      // o backend pode trazer id como requestId / key (TIPO|HASH)
      const pedido = state.pedidos.find(p => {
        const cand = [
          p.id, p.pedidoId, p.pedido, p.PedidoID,
          p.requestId, p.reqId,
          p.key
        ].filter(Boolean).map(x=>String(x));
        if (cand.includes(String(pid))) return true;
        // se card guarda só o hash mas o item guarda "TIPO|HASH"
        return cand.some(v => v.indexOf("|")>=0 && v.split("|").slice(1).join("|") === String(pid));
      });

      const act = btn.getAttribute("data-act");

      try{
        if (act === "autorizar"){
          await solicitarAutorizacao_(root, opts, state, pedido);
        } else if (act === "cotacao"){
          await enviarParaCotacao_(root, opts, state, pedido);
        } else if (act === "pagamento"){
          await solicitarPagamento_(root, opts, state, pedido);
        } else if (act === "concluir"){
          await concluirCompra_(root, opts, state, pedido);
        } else if (act === "recusar"){
          await recusar_(root, opts, state, pedido);
        } else if (act === "reabrir"){
          // regra de retorno
          const from = pedido.__status;
          const to = (from === STATUS.EFETUADA) ? STATUS.ANDAMENTO
            : (from === STATUS.PAGAMENTO) ? STATUS.ANDAMENTO
            : STATUS.PENDENTE;
          await changeStatus_(root, opts, state, pedido, to);
        }
      }catch(err){
        state.error = String(err?.message || err);
        render_(root, state);
      }
    });
  }

  
  async function solicitarAutorizacao_(root, opts, state, pedido){
    const pid = pedido.id || pedido.pedidoId || pedido.pedido || pedido.requestId || pedido.reqId || pedido.key;
    const rows = Array.isArray(pedido.linhas) ? pedido.linhas.map(x=>x && x.row).filter(Boolean) : [];
    const tipo = (pedido.tipo || "").toString();

    const AUTS = ["Tania","Carlos","Elizeu","Outros"];

    await modal_(root, {
      title: `Solicitar autorização — #${pid}`,
      bodyHTML: `
        <div class="cAdmRow">
          <div class="cAdmCol">
            <div class="cAdmLabel">Autorizador</div>
            <select class="cAdmInput" id="cAdmAutSel" style="width:100%; color-scheme:dark">
              ${AUTS.map(n=>`<option value="${esc(n)}">${esc(n)}</option>`).join("")}
            </select>
            <div class="cAdmLabel" style="margin-top:10px">Se escolher "Outros", informe o nome</div>
            <input class="cAdmInput" id="cAdmAutOutro" placeholder="Nome do autorizador..." style="width:100%" />
          </div>
        </div>
      `,
      confirmText: "Solicitar",
      confirmClass: "ok",
      onConfirm: async (mask)=>{
        const sel = (mask.querySelector("#cAdmAutSel")?.value || "").trim();
        const outro = (mask.querySelector("#cAdmAutOutro")?.value || "").trim();
        const autorizador = (sel.toUpperCase() === "OUTROS") ? outro : sel;
        if (!autorizador) throw new Error("Informe o nome do autorizador.");

        try{
          await apiAdm_(opts, "adm_compras_solicitarAutorizacao", { pedidoId: pid, requestId: pid, tipo, rows, autorizador });
        }catch(_e){
          // fallback: só muda status + grava observação
          await apiAdm_(opts, "adm_compras_setStatus", { pedidoId: pid, requestId: pid, tipo, rows, status: STATUS.AUTORIZACAO, obs: `Autorizador: ${autorizador}` });
        }
        pedido.__status = STATUS.AUTORIZACAO;
        pedido.status = STATUS.AUTORIZACAO;
        pedido.meta = Object.assign({}, pedido.meta||{}, { autorizador });
        state.tab = STATUS.AUTORIZACAO;
        state.error = "";
        render_(root, state);
        return true;
      }
    });
  }

  async function _loadFornecedores_(opts){
    try{
      const res = await apiAdm_(opts, "adm_compras_listFornecedores", {});
      const list = Array.isArray(res.data) ? res.data : (Array.isArray(res.fornecedores) ? res.fornecedores : []);
      return list.map(f=>({
        id: f.id || f.nome || f.vendedor || f.VENDEDOR || "",
        nome: f.nome || f.vendedor || f.VENDEDOR || "",
        contato: f.contato || f.CONTATO || "",
        pix: f.pix || f.PIX || "",
        regional: f.regional || f.REGIONAL || "",
        cidade: f.cidade || f.CIDADE || "",
        estado: f.estado || f.ESTADO || ""
      })).filter(x=>x.nome);
    }catch(_){
      return [];
    }
  }

  
  async function enviarParaCotacao_(root, opts, state, pedido){
    const pid = pedido.id || pedido.pedidoId || pedido.pedido || pedido.requestId || pedido.reqId || pedido.key;
    const rows = Array.isArray(pedido.linhas) ? pedido.linhas.map(x=>x && x.row).filter(Boolean) : [];
    const tipo = (pedido.tipo || "").toString();

    const itens = groupItensAdm_(pedido, parseItens_(pedido));
    if (!itens.length) throw new Error("Sem itens para cotar.");

    const fornecedores = await _loadFornecedores_(opts);
    const fornList = fornecedores.map(f=>f.nome);

    // UI: seleção de itens + multi-fornecedores por item
    const bodyHTML = `
      <div class="cAdmHint" style="margin:0 0 10px 0">
        Marque os itens que irão para cotação e selecione <b>um ou mais</b> fornecedores por item.
        <br/>Se um fornecedor ainda não existir na planilha, ele será criado em branco para você completar depois.
      </div>

      <div style="display:flex; gap:10px; flex-wrap:wrap; margin-bottom:10px">
        <button class="cAdmBtn" type="button" id="cCotAllItems">Marcar todos</button>
        <button class="cAdmBtn" type="button" id="cCotNoItems">Desmarcar todos</button>
      </div>

      <div class="cAdmCard" style="padding:10px">
        ${(itens||[]).map((it,ix)=>`
          <div style="display:flex; gap:10px; align-items:flex-start; padding:10px 0; border-bottom:1px dashed rgba(255,255,255,.10)">
            <div style="width:28px; padding-top:4px">
              <input type="checkbox" class="cCotChk" data-ix="${ix}" checked />
            </div>
            <div style="flex:1">
              <div style="font-weight:900">${esc(it.nome||"Item")}</div>
              <div style="opacity:.85; font-size:12px">Qtd: ${esc(it.qtd||"")}</div>

              <div class="cAdmLabel" style="margin-top:8px">Fornecedores (pode selecionar vários)</div>
              <select class="cAdmSelect cCotForn" data-ix="${ix}" multiple size="4" style="min-height:90px; width:100%; color-scheme:dark">
                ${(fornList||[]).map(n=>`<option value="${esc(n)}">${esc(n)}</option>`).join("")}
              </select>

              <div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:8px">
                <button class="cAdmBtn" type="button" data-act="allforn" data-ix="${ix}">+ todos fornecedores</button>
                <button class="cAdmBtn" type="button" data-act="noforn" data-ix="${ix}">limpar seleção</button>
              </div>
            </div>
          </div>
        `).join("")}
      </div>
    `;

    await modal_(root, {
      title: `Cotação — #${pid}`,
      bodyHTML,
      confirmText: "Enviar p/ cotação",
      confirmClass: "ok",
      onMount: (mask)=>{
        const btnAll = mask.querySelector("#cCotAllItems");
        const btnNo  = mask.querySelector("#cCotNoItems");

        btnAll && btnAll.addEventListener("click", ()=>{
          mask.querySelectorAll(".cCotChk").forEach(ch=>ch.checked=true);
        });
        btnNo && btnNo.addEventListener("click", ()=>{
          mask.querySelectorAll(".cCotChk").forEach(ch=>ch.checked=false);
        });

        mask.addEventListener("click",(ev)=>{
          const b = ev.target.closest("[data-act]");
          if (!b) return;
          const ix = parseInt(b.getAttribute("data-ix")||"0",10);
          const sel = mask.querySelector(`.cCotForn[data-ix="${ix}"]`);
          if (!sel) return;
          if (b.getAttribute("data-act")==="allforn"){
            Array.from(sel.options).forEach(o=>o.selected=true);
          }else if (b.getAttribute("data-act")==="noforn"){
            Array.from(sel.options).forEach(o=>o.selected=false);
          }
        });
      },
      onConfirm: async (mask)=>{
        const selected = [];
        const chks = Array.from(mask.querySelectorAll(".cCotChk"));
        chks.forEach(ch=>{
          if (!ch.checked) return;
          const ix = parseInt(ch.getAttribute("data-ix")||"0",10);
          const it = itens[ix];
          const sel = mask.querySelector(`.cCotForn[data-ix="${ix}"]`);
          const forn = sel ? Array.from(sel.selectedOptions).map(o=>String(o.value||"").trim()).filter(Boolean) : [];
          selected.push({ ix, it, forn });
        });

        if (!selected.length) throw new Error("Selecione pelo menos 1 item para cotar.");

        // exige pelo menos 1 fornecedor por item selecionado
        const sem = selected.filter(x=>!x.forn.length);
        if (sem.length){
          throw new Error("Selecione ao menos 1 fornecedor para cada item marcado.");
        }

        const cotacao = selected.map(x=>({
          itemId: (x.it && (x.it.id || x.it.nome)) ? String(x.it.id || x.it.nome) : `item_${x.ix}`,
          nome: x.it?.nome || "",
          qtd: x.it?.qtd || "",
          fornecedores: x.forn
        }));

        const parcial = selected.length !== itens.length;

        await apiAdm_(opts, "adm_compras_cotar", { pedidoId: pid, requestId: pid, tipo, rows, cotacao, parcial });

        pedido.__status = STATUS.COTACAO;
        pedido.status = STATUS.COTACAO;
        pedido.meta = Object.assign({}, pedido.meta||{}, { cotacaoJson: JSON.stringify({versao:2, cotacao, parcial}) });
        state.tab = STATUS.COTACAO;
        state.error = "";
        render_(root, state);
        return true;
      }
    });
  }



  async function solicitarPagamento_(root, opts, state, pedido){
    const pid = pedido.id || pedido.pedidoId || pedido.pedido || pedido.requestId || pedido.reqId || pedido.key;
    const tipo = (pedido.tipo || "").toString();
    const rows = Array.isArray(pedido.linhas) ? pedido.linhas.map(x=>x && x.row).filter(Boolean) : [];

    const itens = groupItensAdm_(pedido, parseItens_(pedido));
    const fornecedores = await _loadFornecedores_(opts);
    const optHtml = [`<option value="">(sem fornecedor definido)</option>`]
      .concat(fornecedores.map(f=>`<option value="${esc(f.nome)}">${esc(f.nome)}${f.cidade?` — ${esc(f.cidade)}`:""}</option>`))
      .join("");

    // tenta pré-carregar cotação v2
    let cotacaoV2 = null;
    try{
      const raw = pedido?.meta?.cotacaoJson || "";
      if (raw) cotacaoV2 = JSON.parse(raw);
    }catch(_){}

    await modal_(root, {
      title: `Solicitar pagamento — #${pid}`,
      bodyHTML: `
        <div class="cAdmRow">
          <div class="cAdmCol">
            <div class="cAdmLabel">Itens e fornecedor escolhido</div>
            <div class="cAdmCard" style="padding:10px; max-height:260px; overflow:auto">
              ${(itens||[]).map((it,ix)=>{
                // sugestão: se houver cotação, tenta escolher 1º fornecedor
                let sug = "";
                try{
                  const c = cotacaoV2 && Array.isArray(cotacaoV2.cotacao) ? cotacaoV2.cotacao : [];
                  const found = c.find(x=>String(x.nome||"").trim()===String(it.nome||"").trim());
                  if (found && found.fornecedores && found.fornecedores[0]) sug = String(found.fornecedores[0]);
                }catch(_){}
                return `
                  <div style="display:flex; gap:10px; align-items:center; padding:8px 0; border-bottom:1px dashed rgba(255,255,255,.10)">
                    <input type="checkbox" class="cPgChk" data-ix="${ix}" checked />
                    <div style="flex:1">
                      <div style="font-weight:900">${esc(it.nome||"Item")}</div>
                      <div style="opacity:.85; font-size:12px">Qtd: ${esc(it.qtd||"")}</div>
                    </div>
                    <div style="min-width:260px">
                      <select class="cAdmSelect cPgForn" data-ix="${ix}" style="width:100%; color-scheme:dark">
                        ${optHtml}
                      </select>
                    </div>
                  </div>
                `;
              }).join("")}
            </div>
          </div>

          <div class="cAdmCol">
            <div class="cAdmLabel">Cidade</div>
            <input class="cAdmInput" id="cAdmCidade" placeholder="Ex.: Cascavel" style="width:100%" />
            <div class="cAdmLabel">UF</div>
            <input class="cAdmInput" id="cAdmUF" placeholder="UF" style="width:100%" />
            <div class="cAdmLabel">Valor (R$)</div>
            <input class="cAdmInput" id="cAdmValor" placeholder="0,00" style="width:100%" />
            <div class="cAdmLabel">Contato</div>
            <input class="cAdmInput" id="cAdmContato" placeholder="Telefone / WhatsApp (opcional)" style="width:100%" />
            <div class="cAdmLabel">PIX</div>
            <input class="cAdmInput" id="cAdmPix" placeholder="Chave Pix (opcional)" style="width:100%" />
          </div>
        </div>

        <div class="cAdmLabel" style="margin-top:10px">Observações (opcional)</div>
        <textarea class="cAdmTA" id="cAdmObs" placeholder="Ex.: prazo, retirada, detalhes..."></textarea>
      `,
      confirmText: "Solicitar",
      confirmClass: "ok",
      onMount: (mask)=>{
        // tenta preselecionar fornecedor sugerido
        try{
          const raws = mask.querySelectorAll(".cPgForn");
          raws.forEach(sel=>{
            const ix = parseInt(sel.getAttribute("data-ix")||"0",10);
            const it = itens[ix];
            let sug = "";
            try{
              const c = cotacaoV2 && Array.isArray(cotacaoV2.cotacao) ? cotacaoV2.cotacao : [];
              const found = c.find(x=>String(x.nome||"").trim()===String(it.nome||"").trim());
              if (found && found.fornecedores && found.fornecedores[0]) sug = String(found.fornecedores[0]);
            }catch(_){}
            if (sug){
              const opt = Array.from(sel.options).find(o=>String(o.value)===sug);
              if (opt) opt.selected = true;
            }
          });
        }catch(_){}
      },
      onConfirm: async (mask)=>{
        const cidade = (mask.querySelector("#cAdmCidade")?.value || "").trim();
        const uf     = (mask.querySelector("#cAdmUF")?.value || "").trim();
        const valor  = (mask.querySelector("#cAdmValor")?.value || "").trim();
        const contato= (mask.querySelector("#cAdmContato")?.value || "").trim();
        const pix    = (mask.querySelector("#cAdmPix")?.value || "").trim();
        const obs    = (mask.querySelector("#cAdmObs")?.value || "").trim();

        const selItens = [];
        const chks = Array.from(mask.querySelectorAll(".cPgChk"));
        chks.forEach(ch=>{
          if (!ch.checked) return;
          const ix = parseInt(ch.getAttribute("data-ix")||"0",10);
          const it = itens[ix];
          const sel = mask.querySelector(`.cPgForn[data-ix="${ix}"]`);
          const forn = sel ? String(sel.value||"").trim() : "";
          selItens.push({ nome: it?.nome||"", qtd: it?.qtd||"", fornecedor: forn });
        });

        if (!selItens.length) throw new Error("Selecione pelo menos 1 item para pagamento.");
        // se algum item sem fornecedor, deixa em branco (financeiro verá e poderá cobrar); mas avisa
        const tipoPgto = "OUTROS"; // regra: EPI/Uniforme sempre OUTROS; Patrimônio já vem identificado por item
        const pagamentoJson = JSON.stringify({ versao:2, pedidoId: pid, cidade, uf, valor, contato, pix, obs, itens: selItens });

        // mantém compat: envia fornecedor/obs do primeiro item para não quebrar integrações antigas
        const fornecedor = String(selItens[0]?.fornecedor || "").trim();

        await apiAdm_(opts, "adm_compras_solicitarPagamento", {
          pedidoId: pid, requestId: pid, tipo, rows,
          tipoPgto,
          fornecedor,
          valor,
          pix,
          contato,
          observacoes: obs,
          pagamentoJson
        });

        pedido.__status = STATUS.PAGAMENTO;
        pedido.status = STATUS.PAGAMENTO;
        pedido.meta = Object.assign({}, pedido.meta||{}, { pagamentoJson });
        state.tab = STATUS.PAGAMENTO;
        state.error = "";
        render_(root, state);
        return true;
      }
    });
  }


async function concluirCompra_(root, opts, state, pedido){
    const pid = pedido.id || pedido.pedidoId || pedido.pedido || pedido.requestId || pedido.reqId || pedido.key;
    const rows = Array.isArray(pedido.linhas) ? pedido.linhas.map(x=>x && x.row).filter(Boolean) : [];
    const tipo = (pedido.tipo || "").toString();

    const fornecedores = await _loadFornecedores_(opts);
    const optHtml = [`<option value="">Selecione...</option>`]
      .concat(fornecedores.map(f=>`<option value="${esc(f.nome)}">${esc(f.nome)}${f.cidade?` — ${esc(f.cidade)}`:""}</option>`))
      .join("");

    await modal_(root, {
      title: `Concluir compra — #${pid}`,
      bodyHTML: `
        <div class="cAdmRow">
          <div class="cAdmCol">
            <div class="cAdmLabel">Fornecedor</div>
            <select class="cAdmInput" id="cConForn" style="width:100%; color-scheme:dark">${optHtml}</select>
            <div class="cAdmLabel" style="margin-top:10px">Observação (opcional)</div>
            <textarea class="cAdmTA" id="cConObs" placeholder="Ex.: retirada, endereço, horário..."></textarea>
          </div>
        </div>
      `,
      confirmText: "Concluir",
      confirmClass: "ok",
      onConfirm: async (mask)=>{
        const forn = (mask.querySelector("#cConForn")?.value || "").trim();
        if (!forn) throw new Error("Selecione um fornecedor.");
        const obs = (mask.querySelector("#cConObs")?.value || "").trim();
        const f = fornecedores.find(x=>x.nome===forn) || {};
        try{
          await apiAdm_(opts, "adm_compras_concluirCompra", {
          pedidoId: pid, requestId: pid, tipo, rows,
          vendedor: f.nome || forn,
          contato: f.contato || "",
          compraObs: obs
        });
        }catch(_e){
          await apiAdm_(opts, "adm_compras_setStatus", { pedidoId: pid, requestId: pid, tipo, rows, status: STATUS.EFETUADA, obs });
        }

        pedido.__status = STATUS.EFETUADA;
        pedido.status = STATUS.EFETUADA;
        state.tab = STATUS.EFETUADA;
        state.error = "";
        render_(root, state);
        return true;
      }
    });
  }

async function changeStatus_(root, opts, state, pedido, newStatus){
    if (!pedido) throw new Error("Pedido não encontrado.");
    const pid = pedido.id || pedido.pedidoId || pedido.pedido || pedido.requestId || pedido.reqId || pedido.key;
    const rows = Array.isArray(pedido.linhas) ? pedido.linhas.map(x=>x && x.row).filter(Boolean) : [];
    const tipo = (pedido.tipo || "").toString();
    const note = await modal_(root, {
      title: `Alterar status — ${STATUS_LABEL[newStatus]}`,
      bodyHTML: `
        <div class="cAdmRow">
          <div class="cAdmCol">
            <div class="cAdmLabel">Observação (opcional)</div>
            <textarea class="cAdmTA" id="cAdmObs" placeholder="Ex.: enviado para orçamento / aguardando fornecedor..."></textarea>
          </div>
        </div>
      `,
      confirmText: "Salvar",
      confirmClass: "ok",
      onConfirm: async (mask)=>{
        const obs = (mask.querySelector("#cAdmObs")?.value || "").trim();
        await apiAdm_(opts, "adm_compras_setStatus", { pedidoId: pid, requestId: pid, tipo, rows, status: newStatus, obs });
        // atualiza local
        pedido.__status = newStatus;
        pedido.status = newStatus;
        pedido.statusObs = obs || pedido.statusObs || "";
        state.error = "";
        render_(root, state);
        return true;
      }
    });
    return note;
  }

  async function recusar_(root, opts, state, pedido){
    if (!pedido) throw new Error("Pedido não encontrado.");
    const pid = pedido.id || pedido.pedidoId || pedido.pedido || pedido.requestId || pedido.reqId || pedido.key;
    const rows = Array.isArray(pedido.linhas) ? pedido.linhas.map(x=>x && x.row).filter(Boolean) : [];
    const tipoBack = (pedido.tipo || "").toString();
    const itens = parseItens_(pedido);

    await modal_(root, {
      title: `Recusar pedido #${pid}`,
      bodyHTML: `
        <div class="cAdmRow">
          <div class="cAdmCol">
            <div class="cAdmLabel">Tipo de recusa</div>
            <select class="cAdmSelect" id="cAdmTipo">
              <option value="TOTAL">Total</option>
              <option value="PARCIAL">Parcial (selecionar itens)</option>
            </select>
            <div class="cAdmLabel">Motivo / observação</div>
            <textarea class="cAdmTA" id="cAdmMotivo" placeholder="Ex.: item fora do padrão / indisponível / orçamento acima..."></textarea>
          </div>

          <div class="cAdmCol">
            <div class="cAdmLabel">Itens (para recusa parcial)</div>
            <div class="cAdmChecks" id="cAdmItens">
              ${itens.length ? itens.slice(0, 60).map((it, idx)=>`
                <label class="cAdmCheck">
                  <input type="checkbox" data-idx="${idx}" />
                  <div>
                    <div><b>${esc(it.nome || "Item")}</b> <span class="cAdmMuted">${esc(it.obs||"")}</span></div>
                    <div class="cAdmMuted">Qtd: ${esc(it.qtd||"")}</div>
                  </div>
                </label>
              `).join("") : `<div class="cAdmHint">Sem itens detalhados para selecionar.</div>`}
            </div>
            ${itens.length > 60 ? `<div class="cAdmMuted" style="margin-top:8px">Mostrando 60 itens (limite UI).</div>` : ``}
          </div>
        </div>

        <div class="cAdmMuted" style="margin-top:10px">
          Dica: se for recusa total, não precisa marcar itens.
        </div>
      `,
      confirmText: "Recusar",
      confirmClass: "warn",
      onConfirm: async (mask)=>{
        const tipo = String(mask.querySelector("#cAdmTipo")?.value || "TOTAL");
        const motivo = (mask.querySelector("#cAdmMotivo")?.value || "").trim();

        const recusados = [];
        if (tipo === "PARCIAL") {
          mask.querySelectorAll('#cAdmItens input[type="checkbox"]').forEach(ch=>{
            if (ch.checked){
              const idx = Number(ch.getAttribute("data-idx"));
              if (!isNaN(idx) && itens[idx]) recusados.push(itens[idx].raw || itens[idx]);
            }
          });
          if (!recusados.length && itens.length){
            throw new Error("Para recusa parcial, selecione pelo menos 1 item.");
          }
        }

        await apiAdm_(opts, "adm_compras_setStatus", {
          pedidoId: pid,
          requestId: pid,
          tipo: tipoBack,
          rows,
          status: STATUS.RECUSADO,
          obs: motivo,
          tipoRecusa: tipo,
          itensRecusados: recusados
        });

        pedido.__status = STATUS.RECUSADO;
        pedido.status = STATUS.RECUSADO;
        pedido.statusObs = motivo || pedido.statusObs || "";
        state.error = "";
        render_(root, state);
        return true;
      }
    });
  }

  async function marcarEfetuada_(root, opts, state, pedido){
    if (!pedido) throw new Error("Pedido não encontrado.");
    const pid = pedido.id || pedido.pedidoId || pedido.pedido || pedido.requestId || pedido.reqId || pedido.key;
    const rows = Array.isArray(pedido.linhas) ? pedido.linhas.map(x=>x && x.row).filter(Boolean) : [];
    const tipoBack = (pedido.tipo || "").toString();

    await modal_(root, {
      title: `Compra efetuada — pedido #${pid}`,
      bodyHTML: `
        <div class="cAdmRow">
          <div class="cAdmCol">
            <div class="cAdmLabel">Observação (opcional)</div>
            <textarea class="cAdmTA" id="cAdmObsEf" placeholder="Ex.: comprado na loja X / previsão de entrega..."></textarea>
            <div class="cAdmMuted" style="margin-top:8px">
              Ao confirmar, o backend pode disparar a notificação no BotConversa para o gestor.
            </div>
          </div>
        </div>
      `,
      confirmText: "Confirmar compra",
      confirmClass: "ok",
      onConfirm: async (mask)=>{
        const obs = (mask.querySelector("#cAdmObsEf")?.value || "").trim();

        // ação específica para disparar BotConversa + marcar status
        await apiAdm_(opts, "adm_compras_compraEfetuada", { pedidoId: pid, requestId: pid, tipo: tipoBack, rows, obs });

        pedido.__status = STATUS.EFETUADA;
        pedido.status = STATUS.EFETUADA;
        pedido.statusObs = obs || pedido.statusObs || "";
        state.error = "";
        // muda automaticamente para aba "Compra efetuada"
        state.tab = STATUS.EFETUADA;
        render_(root, state);
        return true;
      }
    });
  }

  async function load_(root, opts, state){
    state.error = "";
    try{
      const res = await apiAdm_(opts, "adm_compras_listPedidos", {});
      const pedidos = Array.isArray(res.pedidos) ? res.pedidos : (Array.isArray(res.data) ? res.data : []);
      state.pedidos = pedidos.map(p=>{
        const st = normalizeStatus_(p.status || p.situacao || p.stage || p.estado);
        return Object.assign({}, p, { __status: st });
      });
    }catch(err){
      state.error = String(err?.message || err);
      // mantém pedidos atuais se houver
    }
    render_(root, state);
  }

  MOD.openHome = async function(container, opts){
    // container vem do ADM bootstrap
    if (!container) throw new Error("Container inválido.");
    buildUI_(container);

    const root = container.querySelector(".cAdmWrap");
    try{
      const backBtn = root.querySelector("#cAdmBack");
      if(backBtn && opts && typeof opts.onBack === "function"){
        backBtn.onclick = ()=> opts.onBack();
      }
    }catch(_){}
    const state = {
      tab: STATUS.PENDENTE,
      query: "",
      pedidos: [],
      error: ""
    };

    try{ window.__comprasState = state; }catch(_){ }


    bind_(root, opts || {}, state);

    // carrega inicial
    await load_(root, opts || {}, state);
  };

  // expõe global
    // Debug helper (opcional): inspecionar pedidos no console
  // Use: window.__debugCompras.getState() / getPedidos()
  try{
    window.__debugCompras = {
      getState: ()=> (window.__comprasState || null),
      getPedidos: ()=> ((window.__comprasState && window.__comprasState.pedidos) ? window.__comprasState.pedidos : []),
    };
  }catch(_){}

window.COMPRAS = MOD;

})();
