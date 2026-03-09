// assets/js/diretoria.js
(function () {
  "use strict";

  let __dir_active_status = null;
  let __dir_last_frotas_data = null;

// =====================================================
// Modal padrão de detalhes (fallback)
// =====================================================
if (!window.detailsModal) {
  window.detailsModal = {
    open: function (title, html) {
      let m = document.getElementById("dir_details_modal");
      if (!m) {
        m = document.createElement("div");
        m.id = "dir_details_modal";
        m.style.position = "fixed";
        m.style.inset = "0";
        m.style.background = "rgba(0,0,0,.6)";
        m.style.display = "flex";
        m.style.alignItems = "center";
        m.style.justifyContent = "center";
        m.style.zIndex = "9999";

        m.innerHTML = `
          <div style="
            background:#0f172a;
            border:1px solid rgba(255,255,255,.15);
            border-radius:12px;
            width:min(980px, calc(100vw - 28px));
            max-height:80vh;
            overflow:auto;
            padding:14px;">
            <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:10px;">
              <div id="dir_details_title" style="font-weight:800;font-size:16px;"></div>
              <button id="dir_details_close" class="conf-btn" style="height:34px;padding:0 12px;border-radius:10px;border:1px solid rgba(255,255,255,.14);background:#0b1223;color:#e5e7eb;cursor:pointer;">
                Fechar
              </button>
            </div>
            <div id="dir_details_body"></div>
          </div>
        `;
        document.body.appendChild(m);

        m.addEventListener("click", (ev) => {
          if (ev.target === m) m.remove();
        });

        const closeBtn = m.querySelector("#dir_details_close");
        if (closeBtn) closeBtn.onclick = () => m.remove();
      }

      const t = m.querySelector("#dir_details_title");
      const b = m.querySelector("#dir_details_body");
      if (t) t.textContent = title || "Detalhes";
      if (b) b.innerHTML = html || "";
    },
  };
}


  // Módulo global (padrão do Painel ADM/Web)
  const DIRETORIA = (window.DIRETORIA = window.DIRETORIA || {});
  // (fix) render services: usa fallback de campo e evita ReferenceError

  // =========================
  // Helpers
  // =========================
  function el(tag, cls, html) {
    const d = document.createElement(tag);
    if (cls) d.className = cls;
    if (html != null) d.innerHTML = html;
    return d;
  }

  function fmtBRL(n) {
    const ms = window.MoneyShield;
    const v = ms ? ms.num(n) : (Number(String(n==null?"":n).replace(/\./g,"").replace(",",".")) || 0);
    return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  }

  
  function parseMoneyBR_(val){
    if (val == null) return null;
    if (typeof val === "number" && isFinite(val)) return val;
    const s = String(val).trim();
    if (!s) return null;
    // remove currency and spaces
    const clean = s.replace(/R\$|\s/g,"");
    // if already numeric-like
    const num = Number(clean.replace(/\./g,"").replace(",","."));
    return isFinite(num) ? num : null;
  }

  function getInvestido_(r){
    if (!r) return null;

    // common direct keys
    const direct = [
      "investido","valor_investido","total_investido","custo_total","custototal",
      "total_custo","valor_total","total","custo","valor","investimento"
    ];
    for (let i=0;i<direct.length;i++){
      const k = direct[i];
      if (r[k] != null && r[k] !== "") {
        const n = parseMoneyBR_(r[k]);
        if (n != null) return n;
      }
    }

    // nested common
    if (r.custos && typeof r.custos === "object"){
      const n = parseMoneyBR_(r.custos.total ?? r.custos.custo_total ?? r.custos.valor_total);
      if (n != null) return n;
    }

    // heuristic: look for any key that suggests total invest/cost
    try{
      const keys = Object.keys(r);
      for (let i=0;i<keys.length;i++){
        const kk = keys[i];
        const nk = String(kk).toLowerCase();
        if (nk.includes("invest") || (nk.includes("custo") && nk.includes("total")) || (nk.includes("valor") && nk.includes("total"))) {
          const n = parseMoneyBR_(r[kk]);
          if (n != null) return n;
        }
      }
    }catch(_){}

    return null;
  }

  function fmtInvestido_(r){
    const v = getInvestido_(r);
    return (v == null) ? "—" : fmtBRL(v);
  }

function normText(txt) {
    return String(txt || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^A-Za-z0-9 ]/g, " ")
      .replace(/\s+/g, " ")
      .toUpperCase()
      .trim();
  }


  function escHtml_(s){
    return String(s==null?"":s)
      .replace(/&/g,"&amp;")
      .replace(/</g,"&lt;")
      .replace(/>/g,"&gt;")
      .replace(/"/g,"&quot;")
      .replace(/'/g,"&#39;");
  }


  // Alias compat (alguns trechos usam esc_)
  const esc_ = escHtml_;

  // =========================
  // Select helpers (dropdowns)
  // =========================
  function fillSelect_(sel, items, placeholder){
    if (!sel) return;
    const list = Array.isArray(items) ? items : [];
    const opts = [];
    if (placeholder) opts.push(`<option value="">${escHtml_(placeholder)}</option>`);
    list.forEach(v=>{
      const s = String(v==null?"":v).trim();
      if (!s) return;
      opts.push(`<option value="${escHtml_(s)}">${escHtml_(s)}</option>`);
    });
    sel.innerHTML = opts.join("");
  }

  function showAsSelect_(selEl, inputEl, show){
    if (selEl) selEl.style.display = show ? "" : "none";
    if (inputEl) inputEl.style.display = show ? "none" : "";
  }

  function getFilterValue_(root){
    const sel = root.querySelector("#dir_filter_value_sel");
    const inp = root.querySelector("#dir_filter_value");
    const vSel = sel ? String(sel.value||"").trim() : "";
    const vInp = inp ? String(inp.value||"").trim() : "";
    return vSel || vInp;
  }

  function normalizeLabel_(x){
    if (x == null) return "";
    if (Object.prototype.toString.call(x)==="[object Date]" && !isNaN(x)) {
      const m = String(x.getMonth()+1).padStart(2,"0");
      return `${m}/${x.getFullYear()}`;
    }
    // timestamp?
    if (typeof x === "number" && isFinite(x) && x > 1000000000) {
      const d = new Date(x);
      if (!isNaN(d)) {
        const m = String(d.getMonth()+1).padStart(2,"0");
        return `${m}/${d.getFullYear()}`;
      }
    }
    const s = String(x).trim();
    // already MM/YYYY
    if (/^\d{2}\/\d{4}$/.test(s)) return s;
    // try parse ISO
    const d2 = new Date(s);
    if (!isNaN(d2)) {
      const m = String(d2.getMonth()+1).padStart(2,"0");
      return `${m}/${d2.getFullYear()}`;
    }
    if (/nan/i.test(s)) return "";
    return s;
  }

  function toSafeNumber_(v){
    const ms = window.MoneyShield;
    const n = ms
      ? ms.num(v)
      : (Number(String(v==null?"":v)
          .replace(/\./g, "")
          .replace(",", ".")
          .replace(/[^0-9.-]/g, "")) || 0);
    return isFinite(n) ? n : 0;
  }


  function parseMonthYear_(label){
    const s = String(label||"").trim();
    // MM/YYYY or M/YYYY
    let m = s.match(/^(\d{1,2})\/(\d{4})$/);
    if (m){
      const mm = String(parseInt(m[1],10)).padStart(2,"0");
      const yy = m[2];
      return { mm, yy, key: mm + "/" + yy };
    }
    // YYYY-MM or YYYY-M
    m = s.match(/^(\d{4})-(\d{1,2})$/);
    if (m){
      const yy = m[1];
      const mm = String(parseInt(m[2],10)).padStart(2,"0");
      return { mm, yy, key: mm + "/" + yy };
    }
    return null;
  }

  // Se a série estiver dentro de um único ano, garante 12 meses (01..12)
  function normalizeSeriesFullYear_(labels, values){
    const parsed = labels.map(parseMonthYear_);
    if (!parsed.length || parsed.some(p=>!p)) return { labels, values };
    const years = Array.from(new Set(parsed.map(p=>p.yy)));
    if (years.length !== 1) return { labels, values };
    const year = years[0];

    // Mapa do que veio do backend
    const map = {};
    for (let i=0; i<labels.length; i++){
      const p = parsed[i];
      if (!p) continue;
      map[p.mm] = values[i];
    }

    const fullLabels = [];
    const fullValues = [];
    for (let m=1; m<=12; m++){
      const mm = String(m).padStart(2,"0");
      fullLabels.push(mm + "/" + year);
      fullValues.push(toSafeNumber_(map[mm] ?? 0));
    }
    return { labels: fullLabels, values: fullValues };
  }

  // =========================
// CSS loader (garante layout mesmo se o HTML não importar diretoria.css)
// =========================
function ensureDiretoriaCSS_() {
  try {
    if (document.querySelector('link[data-dir-css="1"]')) return;
    const isAdm = String(location.pathname || "").includes("/adm/");
    const href = (isAdm ? "../assets/css/diretoria.css" : "assets/css/diretoria.css") + "?v=" + Date.now();
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    link.setAttribute("data-dir-css", "1");
    document.head.appendChild(link);
  } catch (e) {
    // silencioso: se falhar, ainda renderiza (só fica feio)
  }
}


  // =====================================================
  // Veículos inline (não usar modal — não cobrir filtros)
  // =====================================================
  function renderVeiculosLista_(data, statusKey){
    const host = document.getElementById("dir_parados");
    if (!host) return;

    const list = Array.isArray(data && data.veiculos_lista) ? data.veiculos_lista
      : Array.isArray(data && data.parados_lista) ? data.parados_lista
      : [];

    const want = statusKey ? normText(statusKey) : "";
    const rows = want ? list.filter(x => normText((x && (x.status || x.categoria)) || "") === want) : list.slice();

    const head = `
      <div class="dir-veh-head">
        <div class="dir-veh-title">
          <b>Relação de veículos</b>
          ${want ? `<span class="dir-chip">${escHtml_(statusKey)}</span>` : `<span class="dir-chip" style="opacity:.7">Todos</span>`}
        </div>
        <div class="dir-veh-actions">
          ${want ? `<button class="btn btn-ghost" id="dir_btn_clear_status" type="button">Limpar filtro</button>` : ``}
        </div>
      </div>
    `;

    if (!rows.length){
      host.innerHTML = head + `<div style="opacity:.85;padding:10px 2px">Sem itens para este filtro.</div>`;
      const clr = document.getElementById("dir_btn_clear_status");
      if (clr) clr.onclick = () => { __dir_active_status=null; renderVeiculosLista_(__dir_last_frotas_data||data, null); updateStatusKpisActive_(); };
      return;
    }

    const table = `
      <div class="dir-veh-table">
        <div class="dir-veh-row dir-veh-row--head" style="grid-template-columns: 2fr 1fr 1fr 1fr 1fr;">
          <div>Veículo</div><div>Local</div><div>Categoria</div><div>Motorista</div><div>Investido</div>
        </div>
        ${rows.map(r=>`
          <div class="dir-veh-row" style="grid-template-columns: 2fr 1fr 1fr 1fr 1fr;">
            <div>${escHtml_((r && (r.veiculo || r.nome || r.placa)) || "")}</div>
            <div>${escHtml_((r && (r.local || r.cidade || r.base)) || "")}</div>
            <div>${escHtml_((r && (r.status || r.categoria)) || "")}</div>
            <div>${escHtml_((r && (r.motorista || r.condutor || r.funcionario)) || "")}</div>
            <div>${fmtInvestido_(r)}</div>
          </div>
        `).join("")}
      </div>
    `;

    host.innerHTML = head + table;

    const clr = document.getElementById("dir_btn_clear_status");
    if (clr) clr.onclick = () => {
      __dir_active_status = null;
      updateStatusKpisActive_();
      // recarrega do backend para refletir custos/série
      refresh_().catch(e=>console.error(e));
    };
  }

  function updateStatusKpisActive_(){
    const want = __dir_active_status ? normText(__dir_active_status) : "";
    document.querySelectorAll(".dir-status-kpi").forEach(n=>{
      const key = n.getAttribute("data-status-key") || "";
      n.classList.toggle("is-active", want && normText(key) === want);
    });
  }


  // =====================================================
  // Custos (Frotas) — render por status (se backend enviar)
  // =====================================================
  function pickCustosFrotas_(data, statusKey){
    if (!data) return null;
    const want = statusKey ? String(statusKey) : "";
    if (!want) return data.custos_frotas || null;

    // tenta mapas alternativos vindos do backend
    const maps = [
      data.custos_frotas_by_status,
      data.custos_frotas_por_status,
      data.custos_frotas_status,
      data.custos_por_status,
      data.custos_status_map
    ].filter(Boolean);

    for (const mp of maps){
      if (mp && typeof mp === "object"){
        if (mp[want]) return mp[want];
        // fallback por normalização
        const nWant = normText(want);
        for (const k in mp){
          if (normText(k) === nWant) return mp[k];
        }
      }
    }

    // fallback: se não houver mapa por status, devolve o total (sem filtrar)
    return data.custos_frotas || null;
  }

  function renderCustosFrotas_(data, statusKey){
    const costWrap = document.getElementById("dir_cost_cards");
    if (!costWrap) return;

    costWrap.innerHTML = "";
    const cf = pickCustosFrotas_(data, statusKey);

    if (cf && cf.grupos && cf.grupos.length) {
      const titleTxt = statusKey ? `<b>Divisão de custos (Frotas)</b> <span class="dir-chip">${escHtml_(statusKey)}</span>` : "<b>Divisão de custos (Frotas)</b>";
      const title = el("div", "dir-cost-title", titleTxt);
      costWrap.appendChild(title);

      const grid = el("div", "dir-cost-grid");

      cf.grupos.forEach(g=>{
        const itemsHtml = (g.itens||[])
          .filter(it=> (it.total||0) > 0)
          .sort((a,b)=>(b.total||0)-(a.total||0))
          .slice(0,6)
          .map(it=>`<div class="dir-cost-item"><span>${esc_(it.nome)}</span><b>${fmtBRL(it.total||0)}</b></div>`)
          .join("") || `<div class="dir-cost-item"><span>Sem dados</span><b>—</b></div>`;

        const card = el("div","dir-card dir-cost-card",`
          <div class="dir-cost-head">
            <div class="dir-cost-name">${esc_(g.titulo||g.key||"")}</div>
            <div class="dir-cost-total">${fmtBRL(g.total||0)}</div>
          </div>
          <div class="dir-cost-items">${itemsHtml}</div>
        `);

        grid.appendChild(card);

        // clique => detalhes completos
        card.style.cursor = "pointer";
        card.title = "Clique para ver a relação";
        card.addEventListener("click", ()=>{
          const itens = (g.itens||[]).slice().sort((a,b)=>(b.total||0)-(a.total||0));
          const rows = itens.map(it=>`<div style="display:flex;justify-content:space-between;gap:12px;padding:8px 0;border-top:1px solid rgba(255,255,255,.08)"><span>${escHtml_(it.nome||"")}</span><b>${fmtBRL(it.total||0)}</b></div>`).join("") || `<div style="opacity:.9">Sem dados</div>`;
          const html = `
            <div style="opacity:.85;margin-bottom:10px"><b>${escHtml_(g.titulo||"")}</b> • Total: <b>${fmtBRL(g.total||0)}</b></div>
            <div style="border:1px solid rgba(255,255,255,.12);border-radius:10px;padding:0 12px">${rows}</div>
          `;
          detailsModal.open("Despesas • " + (g.titulo||""), html);
        });
      });

      const totalBar = el("div","dir-cost-totalbar",`<span>Total</span><b>${fmtBRL(cf.total||0)}</b>`);
      costWrap.appendChild(totalBar);
      costWrap.appendChild(grid);
    } else {
      costWrap.appendChild(el("div","muted",""));
    }
  }


  // =========================
  // API
  // =========================
  async function fetchFrotasDashboard_(token, payload) {
  if (!window.API || typeof window.API.post !== "function") {
    throw new Error("API.post não encontrado (assets/js/api.js).");
  }
  const body = {
    module: "diretoria",
    action: "frotas_getDashboard",
    token: String(token || "").trim(),
    payload: payload || {}
  };
  return await window.API.post(body);
}

  // =========================
  // Chart SVG (sem libs)
  // =========================
  function renderLineSVG_(chartEl, labels, values) {
    if (!chartEl) return;

    const W = 1100;
    const H = 240;
    const padL = 44, padR = 12, padT = 16, padB = 32;

    const xs = labels.map((_, i) =>
      padL + (i * (W - padL - padR)) / Math.max(1, labels.length - 1)
    );

    const minV = Math.min.apply(null, values);
    const maxV = Math.max.apply(null, values);
    const span = Math.max(1e-9, maxV - minV);

    const yOf = (v) => {
      const t = (v - minV) / span;
      return padT + (1 - t) * (H - padT - padB);
    };

    const ys = values.map(yOf);

    // Linha
    let d = "";
    for (let i = 0; i < xs.length; i++) {
      d += (i === 0 ? "M" : "L") + xs[i].toFixed(1) + "," + ys[i].toFixed(1) + " ";
    }

    // Área
    const area =
      d +
      `L ${xs[xs.length - 1].toFixed(1)},${(H - padB).toFixed(1)} ` +
      `L ${xs[0].toFixed(1)},${(H - padB).toFixed(1)} Z`;

    // Grid (3 linhas)
    const gridYs = [0, 0.5, 1].map((t) => padT + t * (H - padT - padB));
    const grid = gridYs
      .map((gy) => `<line x1="${padL}" y1="${gy}" x2="${W - padR}" y2="${gy}" class="dir-grid" />`)
      .join("");

    // Labels eixo Y (máx / meio / mín)
    const yLabels = [
      { t: 0, v: maxV },
      { t: 0.5, v: (maxV + minV) / 2 },
      { t: 1, v: minV },
    ]
      .map(({ t, v }) => {
        const y = padT + t * (H - padT - padB);
        return `<text x="${padL - 10}" y="${y + 4}" text-anchor="end" class="dir-axis">${fmtBRL(v)}</text>`;
      })
      .join("");

    // X labels (se for ano: mostrar todos os meses; senão: início/meio/fim)
    let xIdx;
    if (labels.length <= 12) {
      xIdx = labels.map((_, i) => i);
    } else {
      xIdx = labels.length <= 2 ? [0, labels.length - 1] : [0, Math.floor((labels.length - 1) / 2), labels.length - 1];
    }

    const xLabels = xIdx
      .filter((i) => i >= 0 && i < labels.length)
      .map((i) => {
        const x = xs[i];
        // exibe só o mês quando for MM/YYYY
        const lbl = (/^\d{2}\/\d{4}$/.test(labels[i])) ? labels[i].slice(0,2) : labels[i];
        return `<text x="${x}" y="${H - 10}" text-anchor="middle" class="dir-axis">${lbl}</text>`;
      })
      .join("");

    // Pontos (para hover)
    const dots = xs.map((x,i)=>`<circle cx="${x}" cy="${ys[i]}" r="3" class="dir-dot" data-i="${i}" />`).join("");

    chartEl.innerHTML = `
      <div class="dir-chart-inner" style="position:relative">
        <style>
          .dir-tip{background:#0f172a;border:1px solid rgba(255,255,255,.14);border-radius:10px;padding:8px 10px;min-width:160px;box-shadow:0 8px 24px rgba(0,0,0,.35);}
          .dir-tip-lbl{font-size:12px;opacity:.9;margin-bottom:2px}
          .dir-tip-val{font-size:14px;font-weight:800}
          .dir-vline{stroke:rgba(34,197,94,.55);stroke-width:2;stroke-dasharray:4 4}
          .dir-hdot{fill:#22c55e;stroke:#052e16;stroke-width:2}
          .dir-dot{fill:rgba(34,197,94,.35)}
        </style>
        <svg viewBox="0 0 ${W} ${H}" width="100%" height="240" preserveAspectRatio="none" class="dir-svg">
          ${grid}
          ${yLabels}
          <path d="${area}" class="dir-area"></path>
          <path d="${d}" class="dir-line"></path>

          <line id="dir_vline" x1="${xs[0]}" y1="${padT}" x2="${xs[0]}" y2="${H-padB}" class="dir-vline" style="display:none"></line>
          <circle id="dir_hdot" cx="${xs[0]}" cy="${ys[0]}" r="5" class="dir-hdot" style="display:none"></circle>

          ${dots}
          ${xLabels}
        </svg>

        <div id="dir_tip" class="dir-tip" style="display:none; position:absolute; pointer-events:none;"></div>
      </div>
    `;

    const svg = chartEl.querySelector("svg.dir-svg");
    const tip = chartEl.querySelector("#dir_tip");
    const vline = chartEl.querySelector("#dir_vline");
    const hdot = chartEl.querySelector("#dir_hdot");
    if (!svg || !tip || !vline || !hdot) return;

    function pickIndex_(clientX){
      const rect = svg.getBoundingClientRect();
      const px = Math.max(0, Math.min(rect.width, clientX - rect.left));
      const t = rect.width > 0 ? (px / rect.width) : 0;
      const x = padL + t * (W - padL - padR);
      let best = 0;
      let bestD = Infinity;
      for (let i=0;i<xs.length;i++){
        const d = Math.abs(xs[i]-x);
        if (d < bestD){ bestD = d; best = i; }
      }
      return { idx: best, rect };
    }

    function show_(idx, clientX, clientY){
      const x = xs[idx], y = ys[idx];
      vline.setAttribute("x1", x); vline.setAttribute("x2", x);
      vline.style.display = "block";
      hdot.setAttribute("cx", x); hdot.setAttribute("cy", y);
      hdot.style.display = "block";

      const label = labels[idx];
      const val = values[idx];
      tip.innerHTML = `<div class="dir-tip-lbl">${escHtml_(label)}</div><div class="dir-tip-val">${fmtBRL(val)}</div>`;
      tip.style.display = "block";

      // posicionamento do tooltip (clamp)
      const wrapRect = chartEl.getBoundingClientRect();
      const left = Math.max(8, Math.min(wrapRect.width - 180, (clientX - wrapRect.left) - 90));
      const top = Math.max(8, (clientY - wrapRect.top) - 54);
      tip.style.left = left + "px";
      tip.style.top = top + "px";
    }

    function hide_(){
      vline.style.display = "none";
      hdot.style.display = "none";
      tip.style.display = "none";
    }

    svg.addEventListener("mousemove", (ev)=>{
      const p = pickIndex_(ev.clientX);
      show_(p.idx, ev.clientX, ev.clientY);
    });
    svg.addEventListener("mouseleave", hide_);
    svg.addEventListener("touchstart", (ev)=>{
      const t = ev.touches && ev.touches[0];
      if (!t) return;
      const p = pickIndex_(t.clientX);
      show_(p.idx, t.clientX, t.clientY);
    }, {passive:true});
    svg.addEventListener("touchmove", (ev)=>{
      const t = ev.touches && ev.touches[0];
      if (!t) return;
      const p = pickIndex_(t.clientX);
      show_(p.idx, t.clientX, t.clientY);
    }, {passive:true});
    svg.addEventListener("touchend", hide_, {passive:true});
  }

  function renderTableTopSup_(wrap, rows){
    if (!wrap) return;
    const list = Array.isArray(rows) ? rows.slice(0,10) : [];
    if (!list.length){
      wrap.innerHTML = '<div class="dir-empty-mini">Sem dados.</div>';
      return;
    }
    const html = [
      '<table class="dir-tbl"><thead><tr><th>Supervisão</th><th class="r">Valor</th></tr></thead><tbody>',
      ...list.map(r=>`<tr><td>${escHtml_(r.supervisao||"")}</td><td class="r">${fmtBRL(r.valor||0)}</td></tr>`),
      '</tbody></table>'
    ].join("");
    wrap.innerHTML = html;
  }

  function renderBars_(wrap, items, valueKey, labelKey, fmt){
    if (!wrap) return;
    const list = Array.isArray(items) ? items.slice(0,8) : [];
    if (!list.length){
      wrap.innerHTML = '<div class="dir-empty-mini">Sem dados.</div>';
      return;
    }
    const max = Math.max.apply(null, list.map(it=>Number(it[valueKey]||0))) || 1;
    wrap.innerHTML = "";
    list.forEach(it=>{
      const v = Number(it[valueKey]||0);
      const pct = Math.max(2, Math.round((v/max)*100));
      const lbl = String(it[labelKey]||"");
      const valTxt = fmt ? fmt(v) : String(v);
      wrap.appendChild(el("div","dir-bar",
        `<div class="dir-bar-top"><span class="dir-bar-lbl">${escHtml_(lbl)}</span><span class="dir-bar-val">${escHtml_(valTxt)}</span></div>
         <div class="dir-bar-track"><div class="dir-bar-fill" style="width:${pct}%"></div></div>`
      ));
    });
  }

  function renderDonut_(wrap, parts){
    if (!wrap) return;
    const p = parts || {};
    const a = Number(p.ativos||0), pr = Number(p.parados||0), b = Number(p.baixados||0);
    const total = a+pr+b || 1;
    const pa = (a/total)*100, ppr=(pr/total)*100, pb=(b/total)*100;
    wrap.innerHTML = `
      <div class="dir-donut-ring" style="background: conic-gradient(var(--dir-brand) 0 ${pa}%, rgba(239,68,68,.85) ${pa}% ${pa+ppr}%, rgba(148,163,184,.7) ${pa+ppr}% 100%);">
        <div class="dir-donut-hole">
          <div class="dir-donut-total">${total}</div>
          <div class="dir-donut-sub">veículos</div>
        </div>
      </div>
      <div class="dir-donut-legend">
        <div><span class="sw sw-a"></span>Ativo: <b>${a}</b></div>
        <div><span class="sw sw-p"></span>Parado: <b>${pr}</b></div>
        <div><span class="sw sw-b"></span>Baixado: <b>${b}</b></div>
      </div>
    `;
  }

  function groupParadosByStatus_(list){
    const map = new Map();
    (list||[]).forEach(it=>{
      const st = String(it.status||"(SEM STATUS)").trim() || "(SEM STATUS)";
      map.set(st, (map.get(st)||[]).concat([it]));
    });
    const out = Array.from(map.entries()).map(([status, items])=>({status, items}));
    out.sort((x,y)=> y.items.length - x.items.length);
    return out;
  }

  function renderParados_(wrap, list, grouped){
    if (!wrap) return;
    const arr = Array.isArray(list)? list : [];
    if (!arr.length){
      wrap.innerHTML = '<div class="dir-empty-mini">Nenhum veículo parado no filtro selecionado.</div>';
      return;
    }
    if (grouped){
      const groups = groupParadosByStatus_(arr);
      wrap.innerHTML = "";
      groups.forEach(g=>{
        const head = el("div","dir-acc-head", `<span>${escHtml_(g.status)}</span><span class="dir-pill">${g.items.length}</span>`);
        const body = el("div","dir-acc-body");
        g.items.forEach(it=>{
          body.appendChild(el("div","dir-parado-item",
            `<div class="t">${escHtml_(it.veiculo||"")}</div>
             <div class="s">${escHtml_(it.motorista||"")}${it.motorista? " • " : ""}${escHtml_(it.local||"")}</div>`
          ));
        });
        const box = el("div","dir-acc");
        box.appendChild(head); box.appendChild(body);
        head.addEventListener("click", ()=> box.classList.toggle("open"));
        wrap.appendChild(box);
      });
    } else {
      wrap.innerHTML = "";
      arr.slice(0,80).forEach(it=>{
        wrap.appendChild(el("div","dir-parado-item",
          `<div class="t">${escHtml_(it.veiculo||"")}</div>
           <div class="s">${escHtml_(it.status||"")}${it.motorista? " • " : ""}${escHtml_(it.motorista||"")}</div>`
        ));
      });
      if (arr.length>80){
        wrap.appendChild(el("div","dir-empty-mini", `Mostrando 80 de ${arr.length}.`));
      }
    }
  }


  // =========================
  // UI (Home)
  // =========================
  DIRETORIA.openHome = function openHome(container, opts = {}) {
    // state compartilhado entre handlers (evita ReferenceError)
    let state_ = {
      paradosGrouped: false,
      // preload (dados brutos) para filtrar no front sem refetch a cada troca
      preload: null,
      preloadAt: 0,
      // cache leve de respostas do backend (fallback)
      cache: new Map(),
    };

    ensureDiretoriaCSS_();

    const root =
      typeof container === "string" ? document.querySelector(container) : container;
    if (!root) throw new Error("Container do módulo Diretoria não encontrado.");

    const token =
      (opts && opts.auth && opts.auth.token) ||
      (window.AUTH && typeof window.AUTH.getAuth === "function" && (AUTH.getAuth() || {}).token) ||
      (() => {
        try { return (JSON.parse(localStorage.getItem("g1000_auth") || "null") || {}).token; } catch (e) {}
        return (localStorage.getItem("g1000_token") || "").trim() || "";
      })();

    root.innerHTML = "";
    const wrap = el("div", "diretoria-wrap");

    // Tabs (preparado para mais dashboards)
    const tabs = el(
      "div",
      "diretoria-tabs",
      `
        <button class="dir-tab is-active" data-tab="frotas" type="button">Frotas</button>
        <button class="dir-tab" data-tab="custo" type="button">Custo <span class="dir-soon">Em breve</span></button>
        <button class="dir-tab" data-tab="operacao" type="button">Operação <span class="dir-soon">Em breve</span></button>
      `
    );

    const panel = el("div", "dir-panel");
    wrap.appendChild(tabs);
    wrap.appendChild(panel);
    root.appendChild(wrap);

    const mountFrotas_ = () => {
      panel.innerHTML = "";

      const card = el(
        "div",
        "card dir-dash-card",
        `
          <div class="dir-dash-head">
            <div>
              <div class="dir-dash-title">Diretoria • Frotas</div>
              <div class="dir-dash-sub">Dashboard interno com dados do Sheets (via GAS)</div>
            </div>
            <div class="dir-dash-actions">
              <span id="dir_status" class="dir-status">—</span>
              <button id="dir_btn_compare" class="btn" type="button">Comparar</button>
              <button id="dir_btn_refresh" class="btn btn-green" type="button">Atualizar</button>
            </div>
          </div>

          <div class="dir-filters">
            <div class="dir-field">
              <div class="label">Ano</div>
              <select id="dir_year" class="select"></select>
            </div>

            <div class="dir-field">
              <div class="label">Mês</div>
              <select id="dir_month" class="select"></select>
            </div>

            <div class="dir-field">
              <div class="label">Filtrar por</div>
              <select id="dir_filter" class="select">
                <option value="">Sem filtro</option>
                <option value="estado">Estado</option>
                <option value="coord">Coordenação</option>
                <option value="supervisao">Supervisão</option>
              </select>
            </div>

            <div class="dir-field">
              <div class="label">Valor do filtro</div>
              <select id="dir_filter_value_sel" class="select"></select><input id="dir_filter_value" class="input" placeholder="ex.: PARANÁ ou LONDRINA" style="display:none" />
            </div>
          </div>

          <div id="dir_kpis" class="dir-kpis"></div>

          <div id="dir_cost_cards" class="dir-cost-wrap"></div>

          <div class="dir-chart-card">
            <div class="dir-chart-head">
              <div>
                <div class="dir-chart-title">Evolução</div>
                <div class="dir-chart-sub">Tendência agregada (janela de 24 meses)</div>
              </div>
              <div id="dir_chart_meta" class="dir-chart-meta"></div>
            </div>

            <div id="dir_chart_wrap" class="dir-chart-wrap">
              <div id="dir_chart_empty" class="dir-chart-empty">Sem série para plotar.</div>
              <div id="dir_chart" class="dir-chart" style="display:none"></div>
            </div>
          </div>


          <div class="dir-grid-2">
            <div class="card dir-block">
              <div class="dir-block-head">
                <div class="dir-block-title">Top 10 Supervisões</div>
                <div class="dir-block-sub">Ordenado por V. Rateio (mês)</div>
              </div>
              <div id="dir_top_sup" class="dir-table-wrap"></div>
            </div>

            <div class="card dir-block">
              <div class="dir-block-head">
                <div class="dir-block-title">Veículos</div>
                <div class="dir-block-sub">Todos os veículos • clique no status para filtrar</div>
              </div>
              <div class="dir-block-actions" style="display:none"></div>
              <div id="dir_parados" class="dir-parados"></div>
            </div>
          </div>

          <div class="dir-grid-3">
            <div class="card dir-block">
              <div class="dir-block-head">
                <div class="dir-block-title">Serviços</div>
                <div class="dir-block-sub">Quantidade por serviço (Incicle)</div>
              </div>
              <div id="dir_servicos" class="dir-bars"></div>
            </div>

            <div class="card dir-block">
              <div class="dir-block-head">
                <div class="dir-block-title">Status da frota</div>
                <div class="dir-block-sub">Ativos × Parados × Baixados</div>
              </div>
              <div id="dir_status_donut" class="dir-donut"></div>
            </div>

            <div class="card dir-block">
              <div class="dir-block-head">
                <div class="dir-block-title">Por status (parados)</div>
                <div class="dir-block-sub">Top status dentro dos parados</div>
              </div>
              <div id="dir_servicos_parados" class="dir-bars"></div>
            </div>
          </div>

          <div id="dir_modal" class="dir-modal" style="display:none">
            <div class="dir-modal-backdrop" data-close="1"></div>
            <div class="dir-modal-card">
              <div class="dir-modal-head">
                <div class="dir-modal-title">Comparar</div>
                <button class="btn" data-close="1" type="button">Fechar</button>
              </div>

              <div class="dir-modal-body">
                <div class="dir-grid-3 dir-compare-fields">
                  <div class="dir-field">
                    <div class="label">Dimensão</div>
                    <select id="dir_cmp_dim" class="select">
                      <option value="estado">Estado</option>
                      <option value="coord">Coordenação</option>
                      <option value="supervisao">Supervisão</option>
                    </select>
                  </div>
                  <div class="dir-field">
                    <div class="label">Valor A</div>
                    <select id="dir_cmp_a_sel" class="select"></select><input id="dir_cmp_a" class="input" placeholder="ex.: PARANÁ" style="display:none" />
                  </div>
                  <div class="dir-field">
                    <div class="label">Valor B</div>
                    <select id="dir_cmp_b_sel" class="select"></select><input id="dir_cmp_b" class="input" placeholder="ex.: MATO GROSSO" style="display:none" />
                  </div>
                </div>

                <div class="dir-modal-actions">
                  <button id="dir_cmp_run" class="btn btn-green" type="button">Comparar</button>
                </div>

                <div id="dir_cmp_out" class="dir-compare-out"></div>
              </div>
            </div>
          </div>

          <div class="dir-note">
            <span class="dir-note-dot"></span>
            <span>Os próximos dashboards da Diretoria vão entrar nessas abas (Custo, Operação…).</span>
          </div>
        `
      );

      panel.appendChild(card);

      // state_ já existe no escopo do openHome
      state_.paradosGrouped = false;

      // Popular selects
      const yearSel = root.querySelector("#dir_year");
      const monthSel = root.querySelector("#dir_month");
      const now = new Date();
      const y = now.getFullYear();
      const years = [0, y, y - 1, y - 2, y - 3].filter((v, i, a) => a.indexOf(v) === i);

      if (yearSel) {
        yearSel.innerHTML = years
          .map((yy) =>
            yy === 0
              ? `<option value="0">Geral (todos os anos)</option>`
              : `<option value="${yy}">${yy}</option>`
          )
          .join("");
        yearSel.value = "0";
      }

      const monthNames = [
        "Geral (todos os meses)",
        "Janeiro",
        "Fevereiro",
        "Março",
        "Abril",
        "Maio",
        "Junho",
        "Julho",
        "Agosto",
        "Setembro",
        "Outubro",
        "Novembro",
        "Dezembro",
      ];

      if (monthSel) {
        monthSel.innerHTML = monthNames
          .map((n, i) => `<option value="${i}">${n}</option>`)
          .join("");
        monthSel.value = "0";
      }

      // Bind
      const btnRefresh = root.querySelector("#dir_btn_refresh");
      if (btnRefresh) btnRefresh.onclick = () => refresh_();

      const filterInput = root.querySelector("#dir_filter_value");
      if (filterInput) {
        filterInput.onkeydown = (e) => {
          if (e.key === "Enter") refresh_();
        };
      }


      const filterSel = root.querySelector("#dir_filter_value_sel");
      if (filterSel) {
        filterSel.onchange = () => refresh_();
      }

      // Auto refresh on change (leve)
      ["dir_year", "dir_month", "dir_filter"].forEach((id) => {
        const elx = root.querySelector("#" + id);
        if (elx) elx.onchange = () => refresh_();
      });

      // Toggle "Agrupar por status"
      const btnGroup = root.querySelector("#dir_btn_group");
      const btnList  = root.querySelector("#dir_btn_list");
      if (btnGroup && btnList) {
        btnGroup.onclick = () => {
          state_.paradosGrouped = true;
          btnGroup.style.display = "none";
          btnList.style.display = "";
          refresh_(); // re-render
        };
        btnList.onclick = () => {
          state_.paradosGrouped = false;
          btnList.style.display = "none";
          btnGroup.style.display = "";
          refresh_();
        };
      }

      // Modal Comparar
      const modal = root.querySelector("#dir_modal");
      const btnCompare = root.querySelector("#dir_btn_compare");
      const closeModal_ = () => { if (modal) modal.style.display = "none"; };
      const openModal_  = () => { if (modal) modal.style.display = "block"; };

      if (btnCompare && modal) {
        btnCompare.onclick = () => openModal_();
        modal.addEventListener("click", (ev) => {
          const t = ev.target;
          if (t && t.getAttribute && t.getAttribute("data-close") === "1") closeModal_();
        });
      }

      const cmpDim = root.querySelector("#dir_cmp_dim");
      const cmpASel = root.querySelector("#dir_cmp_a_sel");
      const cmpBSel = root.querySelector("#dir_cmp_b_sel");
      const cmpAInp = root.querySelector("#dir_cmp_a");
      const cmpBInp = root.querySelector("#dir_cmp_b");
      const cmpOut = root.querySelector("#dir_cmp_out");
      const cmpRun = root.querySelector("#dir_cmp_run");

      state_.refreshCompareSelects = function(opts){
        const dim = (cmpDim && cmpDim.value) ? String(cmpDim.value) : "estado";
        const list = (opts && opts[dim]) ? opts[dim] : [];
        fillSelect_(cmpASel, list, "Selecione...");
        fillSelect_(cmpBSel, list, "Selecione...");
        showAsSelect_(cmpASel, cmpAInp, list && list.length);
        showAsSelect_(cmpBSel, cmpBInp, list && list.length);
      }

      if (cmpDim) cmpDim.onchange = () => (state_.refreshCompareSelects && state_.refreshCompareSelects(state_.options || {}));

      if (cmpRun) cmpRun.onclick = async () => {
        try{
          if (!token) throw new Error("Sessão inválida/sem token.");
          const dim = (cmpDim && cmpDim.value) ? String(cmpDim.value) : "estado";
          const a = (cmpASel && cmpASel.value) ? String(cmpASel.value).trim() : String((cmpAInp && cmpAInp.value) || "").trim();
          const b = (cmpBSel && cmpBSel.value) ? String(cmpBSel.value).trim() : String((cmpBInp && cmpBInp.value) || "").trim();
          if (!a || !b) throw new Error("Informe os valores A e B.");

          const ano = Number((root.querySelector("#dir_year") || {}).value || "0");
          const mes = Number((root.querySelector("#dir_month") || {}).value || "0");

          const makePayload = (val) => ({
            ano: isNaN(ano) ? 0 : ano,
            mes: isNaN(mes) ? 0 : mes,
            estado: dim==="estado" ? val : "",
            coord: dim==="coord" ? val : "",
            supervisao: dim==="supervisao" ? val : ""
          });

          if (cmpOut) cmpOut.innerHTML = "<div class='dir-empty-mini'>Comparando…</div>";

          const [da, db] = await Promise.all([
            fetchFrotasDashboard_(token, makePayload(a)),
            fetchFrotasDashboard_(token, makePayload(b)),
          ]);

          if (!da || !da.ok) throw new Error((da && da.message) || "Falha no A");
          if (!db || !db.ok) throw new Error((db && db.message) || "Falha no B");

          const ta = Number(((da.kpis||{}).mes_total) || 0);
          const tb = Number(((db.kpis||{}).mes_total) || 0);
          const diff = ta - tb;
          const pct = tb ? (diff / tb) * 100 : 0;

          const card = (title, val) => `
            <div class="card dir-kpi" style="padding:12px">
              <div class="kpi-title">${escHtml_(title)}</div>
              <div class="kpi-value">${fmtBRL(val)}</div>
              <div class="kpi-sub">—</div>
            </div>`;

          if (cmpOut) {
            cmpOut.innerHTML = `
              <div class="dir-grid-3" style="gap:10px">
                ${card("A • " + a, ta)}
                ${card("B • " + b, tb)}
                ${card("Diferença", diff)}
              </div>
              <div class="dir-empty-mini" style="margin-top:8px">Variação: <b>${pct.toFixed(1)}%</b></div>
            `;
          }
        }catch(e){
          console.error(e);
          if (cmpOut) cmpOut.innerHTML = `<div class='dir-empty-mini'>${escHtml_(e.message||String(e))}</div>`;
        }
      };



      refresh_();
    };

    const mountSoon_ = (title) => {
      panel.innerHTML = `
        <div class="card dir-dash-card">
          <div class="dir-dash-head">
            <div>
              <div class="dir-dash-title">Diretoria • ${title}</div>
              <div class="dir-dash-sub">Em desenvolvimento</div>
            </div>
            <div class="dir-dash-actions">
              <span class="dir-status">Em breve</span>
            </div>
          </div>
          <div class="dir-placeholder">
            Esse painel entra aqui. A estrutura (abas + cards) já está pronta.
          </div>
        </div>
      `;
    };

    tabs.addEventListener("click", (ev) => {
      const btn = ev.target && ev.target.closest ? ev.target.closest(".dir-tab") : null;
      if (!btn) return;

      tabs.querySelectorAll(".dir-tab").forEach((b) => b.classList.remove("is-active"));
      btn.classList.add("is-active");

      const tab = btn.getAttribute("data-tab") || "frotas";
      if (tab === "frotas") mountFrotas_();
      else if (tab === "custo") mountSoon_("Custo");
      else mountSoon_("Operação");
    });

    async function refresh_() {
      const statusEl = root.querySelector("#dir_status");
      const emptyEl = root.querySelector("#dir_chart_empty");
      const chartEl = root.querySelector("#dir_chart");
      const metaEl = root.querySelector("#dir_chart_meta");
      const kpiEl = root.querySelector("#dir_kpis");
      const topSupEl = root.querySelector("#dir_top_sup");
      const paradosEl = root.querySelector("#dir_parados");
      const servEl = root.querySelector("#dir_servicos");
      const donutEl = root.querySelector("#dir_status_donut");
      const servParEl = root.querySelector("#dir_servicos_parados");

      try {
        if (!token) throw new Error("Sessão inválida/sem token. Faça login novamente.");
        if (statusEl) statusEl.textContent = "Carregando…";

        const ano = Number((root.querySelector("#dir_year") || {}).value || "0");
        const mes = Number((root.querySelector("#dir_month") || {}).value || "0");

        const filtro = (root.querySelector("#dir_filter") || {}).value || "";
        const filtroValor = getFilterValue_(root);

        const payload = {
          ano: isNaN(ano) ? 0 : ano,
          mes: isNaN(mes) ? 0 : mes,
          estado: filtro === "estado" ? filtroValor : "",
          coord: filtro === "coord" ? filtroValor : "",
          supervisao: filtro === "supervisao" ? filtroValor : "",
          card_filter: __dir_active_status || "",
        };

        // =====================================================
        // PRELOAD: carrega 1x e filtra tudo no front (sem demora ao trocar filtros)
        // =====================================================
        async function ensurePreload_(){
          // 10 min de validade no front
          const TTL = 10 * 60 * 1000;
          if (state_.preload && (Date.now() - (state_.preloadAt||0) < TTL)) return state_.preload;
          // tenta preload no GAS
          const pre = await fetchFrotasDashboard_(token, { preload: 1 });
          if (pre && pre.ok && pre.despesas_rows && pre.veiculos_lista) {
            state_.preload = pre;
            state_.preloadAt = Date.now();
            return pre;
          }
          return null;
        }

        function normKey_(s){ return normText(s||""); }

        const COST_GROUPS = [
          { key:"COMBUSTIVEL_OLEO", titulo:"Combustível e troca de Óleo", itens:["TICKET LOG","TROCA DE OLEO / FILTROS","COMBUSTIVEL"] },
          { key:"MANUTENCAO", titulo:"Manutenção", itens:["MANUT. VEICULOS SERVICOS","MANUT. VEICULOS PECAS"] },
          { key:"PEDAGIOS", titulo:"Pedágios", itens:["PEDAGIOS"] },
          { key:"IMPOSTOS_TAXAS", titulo:"Impostos e Taxas", itens:["TAXA DE REMOCAO/DIARIA PATIO","MULTAS TRANSITO","LICENCIAMENTO/IPVA","BOLETIM DE OCORRENCIA","DESPACHANTE SERVICOS"] },
          { key:"SEGUROS_FRANQUIAS", titulo:"Seguros e Franquias", itens:["SEGURO VEICULOS","FRANQUIA TROCA PARA-BRISA","FRANQUIA SINISTRO"] },
          { key:"OUTROS", titulo:"Outros", itens:["ALUGUEL DE VEICULOS","MONITORAMENTO DE VEICULOS"] }
        ];
        const catToGroup = (function(){
          const map = {};
          COST_GROUPS.forEach((g,gi)=>{
            (g.itens||[]).forEach((it,ii)=>{ map[normKey_(it)] = {gi, ii}; });
          });
          return map;
        })();

        function buildCustosFromRows_(rows){
          const grupos = COST_GROUPS.map(g=>({
            key: g.key,
            titulo: g.titulo,
            total: 0,
            itens: (g.itens||[]).map(n=>({ nome:n, total:0 }))
          }));
          rows.forEach(r=>{
            const v = Number(r && r.valor) || 0;
            if (!v) return;
            const hit = catToGroup[normKey_(r.categoria||"")];
            if (!hit) return;
            grupos[hit.gi].total += v;
            grupos[hit.gi].itens[hit.ii].total += v;
          });
          return { total: grupos.reduce((a,g)=>a+(g.total||0),0), grupos };
        }

        function computeFromPreload_(pre, p){
          const allRows = Array.isArray(pre.despesas_rows) ? pre.despesas_rows : [];
          const allVeic = Array.isArray(pre.veiculos_lista) ? pre.veiculos_lista : [];

          const anoSel = Number(p.ano||0);
          const mesSel = Number(p.mes||0);
          const estadoSel = String(p.estado||"").trim();
          const coordSel = String(p.coord||"").trim();
          const supSel = String(p.supervisao||"").trim();
          const card = String(p.card_filter||"").trim();

          // filtro de despesas (Base_Dashboard)
          let rows = allRows.filter(r=>{
            if (!r) return false;
            const y = Number(r.ano||0);
            const m = Number(r.mes||0);
            if (anoSel && y !== anoSel) return false;
            if (mesSel && m !== mesSel) return false;
            if (estadoSel && normKey_(r.estado) !== normKey_(estadoSel)) return false;
            if (coordSel && normKey_(r.coord) !== normKey_(coordSel)) return false;
            if (supSel && normKey_(r.supervisao) !== normKey_(supSel)) return false;
            return true;
          });

          // filtro por status (card) => converte status->placas via veiculos_lista
          if (card){
            const want = normKey_(card);
            const placas = new Set();
            allVeic.forEach(v=>{
              const st = normKey_(v && (v.status || v.categoria || ""));
              if (!st) return;
              // match flexível
              if (st === want || st.indexOf(want) >= 0 || want.indexOf(st) >= 0) {
                const pl = String(v.placa_norm||"").trim();
                if (pl) placas.add(pl);
              }
            });
            if (placas.size){
              rows = rows.filter(r=>{
                const pl = String(r.placa||"").trim();
                return pl && placas.has(pl);
              });
            }
          }

          const mesTotal = rows.reduce((a,r)=>a + (Number(r.valor)||0), 0);

          // top supervisões
          const mapSup = new Map();
          rows.forEach(r=>{
            const s = String(r.supervisao||"(Sem supervisão)").trim();
            mapSup.set(s, (mapSup.get(s)||0) + (Number(r.valor)||0));
          });
          const top_supervisoes = Array.from(mapSup.entries())
            .map(([supervisao, valor])=>({supervisao, valor}))
            .sort((a,b)=>b.valor-a.valor)
            .slice(0,10);

          // série (anos ou meses)
          let series = { labels: [], values: [], mode: "" };
          if (!anoSel){
            const yearMap = new Map();
            rows.forEach(r=>{
              const y = Number(r.ano||0);
              if (!y) return;
              yearMap.set(String(y), (yearMap.get(String(y))||0) + (Number(r.valor)||0));
            });
            const ys = Array.from(yearMap.keys()).sort();
            series = { labels: ys, values: ys.map(y=>yearMap.get(y)||0), mode: "years" };
          } else {
            const mMap = new Map();
            rows.forEach(r=>{
              const m = Number(r.mes||0);
              if (!m) return;
              mMap.set(m, (mMap.get(m)||0) + (Number(r.valor)||0));
            });
            const labs = [];
            const vals = [];
            for (let m=1;m<=12;m++){
              labs.push(String(m).padStart(2,"0") + "/" + String(anoSel));
              vals.push(mMap.get(m)||0);
            }
            series = { labels: labs, values: vals, mode: "months" };
          }

          // veículos/status (Incicle) — filtra por estado/coord quando vier
          let veicRows = allVeic;
          if (coordSel){
            veicRows = veicRows.filter(v=> normKey_(v.local) === normKey_(coordSel));
          }
          if (estadoSel && !coordSel){
            // estado no Incicle costuma vir como "Local" (coord). Mantém apenas os locais que contenham o estado.
            const want = normKey_(estadoSel);
            veicRows = veicRows.filter(v=> normKey_(v.local).indexOf(want) >= 0);
          }

          // status_cards
          const status_cards = {};
          [
            "PARADO - OUTRAS PENDÊNCIAS",
            "PARADO - EXECUTANDO SERVIÇOS",
            "ATIVO - COM RASTREADOR",
            "ATIVO - SEM RASTREADOR",
            "BAIXADO",
          ].forEach(k=> status_cards[k] = 0);
          veicRows.forEach(v=>{
            const st = String(v && (v.status || v.categoria || "")).trim();
            if (!st) return;
            if (status_cards.hasOwnProperty(st)) status_cards[st] = Number(status_cards[st]||0) + 1;
          });

          // contadores ativos/parados/baixados (por prefixo)
          let ativos=0, parados=0, baixados=0;
          veicRows.forEach(v=>{
            const stN = normKey_(v && (v.status || v.categoria || ""));
            if (!stN) return;
            if (stN.indexOf("BAIXADO")>=0) baixados++;
            else if (stN.startsWith("PARADO")) parados++;
            else if (stN.startsWith("ATIVO")) ativos++;
          });
          const frota_total = veicRows.length;
          const parados_pct = frota_total ? (parados/frota_total)*100 : 0;
          const disponibilidade_pct = frota_total ? (ativos/frota_total)*100 : 0;

          const custos = buildCustosFromRows_(rows);

          return {
            ok: true,
            all_years: !anoSel,
            kpis: {
              mes_total: mesTotal,
              frota_total,
              ativos,
              parados,
              baixados,
              parados_pct,
              disponibilidade_pct,
            },
            series,
            listas: pre.listas || {},
            status_cards,
            custos_frotas: custos,
            despesas_rows: rows,
            veiculos_lista: veicRows,
            parados_lista: veicRows.filter(v=> normKey_(v && (v.status||v.categoria||""))).filter(v=> normKey_(v.status||v.categoria||"").startsWith("PARADO")),
            top_supervisoes,
            servicos_breakdown: pre.servicos_breakdown || [],
          };
        }

        let data = null;
        const pre = await ensurePreload_();
        if (pre){
          data = computeFromPreload_(pre, payload);
        } else {
          // fallback: cache por chave (evita refetch repetido)
          const key = JSON.stringify(payload);
          const c = state_.cache.get(key);
          if (c && (Date.now() - (c.t||0) < 5*60*1000)) data = c.v;
          if (!data){
            data = await fetchFrotasDashboard_(token, payload);
            state_.cache.set(key, { t: Date.now(), v: data });
          }
        }

        if (!data || !data.ok) throw new Error((data && data.message) || "Falha ao carregar dados.");

        // KPIs
        const k = data.kpis || {};
        const avg = k.frota_total ? (Number(k.mes_total || 0) / Number(k.frota_total || 1)) : 0;

        const cards = [
          { t: "Total", v: fmtBRL(k.mes_total || 0), s: "Rateio" },
          { t: "Frota", v: String(k.frota_total || 0), s: `Ativos: ${k.ativos || 0}` },
          { t: "Parados", v: String(k.parados || 0), s: `${Number(k.parados_pct || 0).toFixed(1)}%` },
          { t: "Média por veículo", v: fmtBRL(avg || 0), s: "—" },
        ];

        
// ===== Status detalhado (Incicle -> status_cards) =====
const sc = (data && data.status_cards) ? data.status_cards : {};

const sAtivoCom  = Number(sc["ATIVO - COM RASTREADOR"] || 0);
const sAtivoSem  = Number(sc["ATIVO - SEM RASTREADOR"] || 0);
const sParadoPen = Number(sc["PARADO - OUTRAS PENDÊNCIAS"] || 0);
const sParadoExe = Number(sc["PARADO - EXECUTANDO SERVIÇOS"] || 0);
const sBaixado   = Number(sc["BAIXADO"] || 0);

const statusCards = [
  { t: "ATIVO - COM RASTREADOR", v: String(sAtivoCom),  s: "—", kind: "status", key: "ATIVO - COM RASTREADOR" },
  { t: "ATIVO - SEM RASTREADOR", v: String(sAtivoSem),  s: "—", kind: "status", key: "ATIVO - SEM RASTREADOR" },
  { t: "PARADO - OUTRAS PENDÊNCIAS", v: String(sParadoPen), s: "—", kind: "status", key: "PARADO - OUTRAS PENDÊNCIAS" },
  { t: "PARADO - EXECUTANDO SERVIÇOS", v: String(sParadoExe), s: "—", kind: "status", key: "PARADO - EXECUTANDO SERVIÇOS" },
  { t: "BAIXADO", v: String(sBaixado), s: "—", kind: "status", key: "BAIXADO" },
];

statusCards.forEach(c => cards.push(c));


                if (kpiEl) {
                  kpiEl.innerHTML = "";
                  cards.forEach((c) => {
                    const node = el(
                      "div",
                      "kpi dir-kpi" + (c && c.kind ? " is-click" : ""),
                      `
                        <div class="kpi-title">${c.t}</div>
                        <div class="kpi-value">${c.v}</div>
                        <div class="kpi-sub">${c.s || "—"}</div>
                      `
                    );

                    // clique => abrir relação
                    if (c && c.kind === "status") {
                      node.style.cursor = "pointer";
                      node.title = "Clique para filtrar a relação abaixo";
                      node.classList.add("dir-status-kpi");
                      node.setAttribute("data-status-key", c.key || c.t);

                      node.addEventListener("click", () => {
                        // toggle: clicar no mesmo card limpa
                        const next = (c.key || c.t);
                        __dir_active_status = (normText(next) === normText(__dir_active_status || "")) ? null : next;
                        updateStatusKpisActive_();

                        // recarrega do backend (GAS) para filtrar custos/série por PLACA
                        refresh_().catch(e => console.error(e));
                      });
                    }

                    kpiEl.appendChild(node);
                  });
                }

        

        // ===== Lista de veículos (inline, abaixo) =====
        __dir_last_frotas_data = data || null;
        renderVeiculosLista_(data, __dir_active_status);

// Custo (Frotas) — cards de divisão (filtrável por status)
        renderCustosFrotas_(data, __dir_active_status);

        // Chart
        const serie = data.series || data.series_24m || { labels: [], values: [], mode:"" };
        const rawLabels = Array.isArray(serie.labels) ? serie.labels : [];
        const rawValues = Array.isArray(serie.values) ? serie.values : [];

        let labels = rawLabels.map(normalizeLabel_).filter(Boolean);
        let values = rawValues.map(toSafeNumber_);

        // Se for série de um único ano (ex.: 2025), garante 12 meses no gráfico
        ({ labels, values } = normalizeSeriesFullYear_(labels, values));

        const metaText =
          labels.length >= 2 ? `Série: ${labels[0]} → ${labels[labels.length - 1]}` : "Sem série";
        if (metaEl) metaEl.textContent = metaText;

        if (!labels.length || !values.length) {
          if (emptyEl) emptyEl.style.display = "block";
          if (chartEl) chartEl.style.display = "none";
        } else {
          if (emptyEl) emptyEl.style.display = "none";
          if (chartEl) chartEl.style.display = "block";
          renderLineSVG_(chartEl, labels, values);
        }

        // Carrega listas para dropdowns (se o GAS enviar)
        // Aceita: data.listas | data.options | data.opcoes
        const opts = data.listas || data.options || data.opcoes || {};
        state_.options = state_.options || { estado: [], coord: [], supervisao: [] };
        if (Array.isArray(opts.estados)) state_.options.estado = opts.estados;
        if (Array.isArray(opts.coordenacoes)) state_.options.coord = opts.coordenacoes;
        if (Array.isArray(opts.supervisoes)) state_.options.supervisao = opts.supervisoes;

        // Filtro (valor) como dropdown quando existir lista
        const filtroSel = root.querySelector("#dir_filter");
        const valSel = root.querySelector("#dir_filter_value_sel");
        const valInp = root.querySelector("#dir_filter_value");
        const f = filtroSel ? String(filtroSel.value||"") : "";
        const listFor = (f==="estado") ? state_.options.estado : (f==="coord") ? state_.options.coord : (f==="supervisao") ? state_.options.supervisao : [];
        fillSelect_(valSel, listFor, f ? "Selecione..." : "(sem filtro)");
        showAsSelect_(valSel, valInp, !!(listFor && listFor.length));

        // Atualiza dropdowns do comparar
        try { if (state_.refreshCompareSelects) state_.refreshCompareSelects(state_.options); } catch(e) {}
// Top supervisões
        renderTableTopSup_(topSupEl, data.top_supervisoes || []);

        // Serviços (geral)
        const servList = data.servicos_breakdown || data.servicos || [];
        renderBars_(servEl, servList, "qtd", "servico", (v)=>String(v));
// Donut status
        renderDonut_(donutEl, {
          ativos: k.ativos||0, parados: k.parados||0, baixados: k.baixados||0
        });

        // Por serviço (parados) - agrupado por status (proxy)
        const parListAll = data.parados_lista || [];
        const svcPar = (function(){
          const mm = new Map();
          parListAll.forEach(it=>{
            const st = String(it.status||"").trim() || "(SEM STATUS)";
            mm.set(st, (mm.get(st)||0)+1);
          });
          return Array.from(mm.entries()).map(([servico,qtd])=>({servico, qtd})).sort((a,b)=>b.qtd-a.qtd);
        })();
        renderBars_(servParEl, svcPar, "qtd", "servico", (v)=>String(v));

        // Parados (lista / agrupado)
        renderParados_(paradosEl, parListAll, !!state_.paradosGrouped);

        if (statusEl) statusEl.textContent = "OK";
      } catch (e) {
        console.error(e);
        if (statusEl) statusEl.textContent = "Erro";
        if (emptyEl) {
          emptyEl.style.display = "block";
          emptyEl.textContent = String(e && e.message ? e.message : e);
        }
        if (chartEl) chartEl.style.display = "none";
      }
    }

    // default
    mountFrotas_();
  };
})();
