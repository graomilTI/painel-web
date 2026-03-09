(function () {
  "use strict";

  // ⚠️ Este arquivo é a implementação ADM.
  // O wrapper /assets/js/hospedagem.js procura por window.HOSPEDAGEM_ADM.openHome.
  // Não sobrescreva window.HOSPEDAGEM (wrapper).
  const MOD = "HOSPEDAGEM_ADM";

  /* =========================
   * Helpers
   * ========================= */
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[c]));

  function pad2(n) { return String(n).padStart(2, "0"); }

  function fmtDateBR(v) {
    const s = String(v || "").trim();
    if (!s) return "";
    const mIso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (mIso) return `${mIso[3]}/${mIso[2]}/${mIso[1]}`;
    const mBR = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (mBR) return s;
    try {
      const d = new Date(s);
      if (!isNaN(d.getTime())) return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
    } catch (_) { }
    return s;
  }

  function onlyHour(v) {
    if (!v) return "";
    try {
      const d = new Date(v);
      if (!isNaN(d.getTime())) {
        return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
      }
    } catch (_) { }
    const s = String(v);
    const m = s.match(/(\d{2}:\d{2})/);
    return m ? m[1] : s;
  }

  function createMap() {
    const el = document.createElement("iframe");
    el.style.width = "100%";
    el.style.height = "100%";
    el.style.border = "0";
    el.referrerPolicy = "no-referrer-when-downgrade";
    return el;
  }

  function todayYMD_(d){
    const x = d instanceof Date ? d : new Date();
    const y = x.getFullYear();
    const m = pad2(x.getMonth()+1);
    const da = pad2(x.getDate());
    return `${y}-${m}-${da}`;
  }

  function yesterdayYMD_(){
    const d = new Date();
    d.setDate(d.getDate()-1);
    return todayYMD_(d);
  }

  function parseMoney_(s){
    const t = String(s||"").replace(/[^0-9,.-]/g, "").trim();
    if (!t) return 0;
    // pt-BR: 1.234,56
    const norm = t.replace(/\./g, "").replace(/,/g, ".");
    const v = parseFloat(norm);
    return Number.isFinite(v) ? v : 0;
  }

  function moneyBR_(v){
    const n = Number(v||0);
    try{ return n.toLocaleString("pt-BR", { style:"currency", currency:"BRL" }); }catch(_){
      return "R$ " + (Math.round(n*100)/100).toFixed(2).replace(".", ",");
    }
  }

  function openModal_(title, bodyNode, actions){
    const back = document.createElement("div");
    back.className = "hos-modal-backdrop";
    back.innerHTML = `
      <div class="hos-modal" role="dialog" aria-modal="true">
        <div class="hos-modal-head">
          <div class="hos-modal-title">${esc(title||"")}</div>
          <button class="btn mini" data-act="close">Fechar</button>
        </div>
        <div class="hos-modal-body" id="hos_modal_body"></div>
        <div class="hos-modal-foot" id="hos_modal_foot"></div>
      </div>
    `;
    const modal = back.querySelector(".hos-modal");
    const body = back.querySelector("#hos_modal_body");
    const foot = back.querySelector("#hos_modal_foot");
    body.appendChild(bodyNode);
    (actions||[]).forEach(a=>{
      const b = document.createElement("button");
      b.className = a.className || "btn mini";
      b.textContent = a.label || "OK";
      b.addEventListener("click", ()=> a.onClick && a.onClick({ close: ()=> back.remove(), modal, body, foot }));
      foot.appendChild(b);
    });
    back.addEventListener("click", (ev)=>{
      if (ev.target === back) back.remove();
      const act = ev.target && ev.target.getAttribute ? ev.target.getAttribute("data-act") : "";
      if (act === "close") back.remove();
    });
    document.body.appendChild(back);
    return { close: ()=> back.remove(), modal, body, foot };
  }

  function setMap(map, query, zoom) {
    const q = String(query || "").trim();
    const z = Number.isFinite(+zoom) ? Math.max(3, Math.min(18, +zoom)) : 5;
    const base = "https://www.google.com/maps";
    map.src = base + "?q=" + encodeURIComponent(q || "Brasil") + "&z=" + z + "&output=embed";
  }

  function getToken_() {
    try {
      const a = localStorage.getItem("g1000_auth");
      if (a) {
        const j = JSON.parse(a);
        const t = String(j && j.token || "").trim();
        if (t) return t;
      }
    } catch (_) { }
    try {
      const t2 = String(localStorage.getItem("g1000_token") || "").trim();
      if (t2) return t2;
    } catch (_) { }
    return "";
  }

  async function apiPost_(obj) {
    if (window.API && typeof window.API.post === "function") return window.API.post(obj);
    const endpoint = String(window.API_BASE || window.GAS_EXEC || "").trim();
    if (!endpoint) throw new Error("API_BASE/GAS_EXEC não definido (config.js)");
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(obj || {})
    });
    let json = {};
    try { json = await res.json(); } catch (_) { }
    if (!res.ok || json.ok === false) throw new Error(json.error || json.message || `HTTP ${res.status}`);
    return json;
  }

  
  function getAny_(obj, keys){
    for (const k of (keys||[])){
      if (!k) continue;
      if (obj && Object.prototype.hasOwnProperty.call(obj, k) && obj[k] != null && String(obj[k]).trim() !== "") return obj[k];
      // tentar variações com espaços
      const kk = String(k);
      if (obj && Object.prototype.hasOwnProperty.call(obj, kk) && obj[kk] != null && String(obj[kk]).trim() !== "") return obj[kk];
    }
    return "";
  }

  function groupByPedido_(rows) {
    const arr = Array.isArray(rows) ? rows : [];
    const map = {};
    for (const r of arr) {
      const pid = String(getAny_(r, ["PedidoId","pedidoId","PEDIDOID","Pedido ID","Pedido"]) || "").trim() || "(sem id)";
      if (!map[pid]) {
        const cidade = String(getAny_(r, ["Cidade_UF","cidadeUF","Cidade/UF","Cidade","CIDADE","Cidade UF","CIDADE UF"]) || "").trim();
        map[pid] = {
          pedidoId: pid,
          cidade,
          tipo: String(getAny_(r, ["Tipo","tipo"]) || "").trim(),
          status: String(getAny_(r, ["Status","status","STATUS"]) || "PENDENTE").trim(),
          gestor: String(getAny_(r, ["Gestor","gestor"]) || "").trim(),
          supervisao: String(getAny_(r, ["Supervisao","Supervisão","supervisao","supervisão"]) || "").trim(),
          coord: String(getAny_(r, ["Coord","Coordenação","coordenacao","coord"]) || "").trim(),
          // aceitar headers variados
          checkin: fmtDateBR(getAny_(r, ["Checkin","checkin","Check-in","CHECK-IN","Data Checkin","DATA CHECKIN","Entrada","ENTRADA"])),
          checkout: fmtDateBR(getAny_(r, ["Checkout","checkout","Check-out","CHECK-OUT","Data Checkout","DATA CHECKOUT","Saída","SAIDA","SAÍDA"])),
          chegada: onlyHour(getAny_(r, ["Hora_Chegada","horaChegada","Chegada","chegada","HORA CHEGADA"])),
          origem: String(getAny_(r, ["Origem","origem"]) || "").trim(),
          _rows: []
        };
      }
      map[pid]._rows.push(r);
    }
    const out = Object.values(map);
    out.forEach(o => {
      const cols = [];
      for (const rr of o._rows) {
        const n = String(getAny_(rr, ["Colaborador","colaborador","Funcionario","Funcionário","FUNCIONARIO","NOME"]) || "").trim();
        if (n && !cols.includes(n)) cols.push(n);
      }
      o.colaboradores = cols;

      // tentar extrair UF separado, se existir
      const uf = String(getAny_(o._rows[0]||{}, ["UF","Uf","Estado","estado"]) || "").trim().toUpperCase();
      if (uf && uf.length === 2) o.uf = uf;
    });
    return out;
  }

  function pillClass_(st) {
    const s = String(st || "").toUpperCase();
    if (s.includes("RESERV")) return "ok";
    if (s.includes("NEG")) return "no";
    if (s.includes("CHECKOUT")) return "warn";
    return "pend";
  }

  function isCheckout_(p) {
    const s = String(p && (p.status || "") || "").toUpperCase();
    const o = String(p && (p.origem || "") || "").toUpperCase();
    return s.includes("CHECKOUT") || o.includes("CHECKOUT");
  }

  function buildCard_(p, onMap, onReservar, onNegar, onCheckout, onActivate, isActive) {
    const city = String(p.cidade || p.cidadeUF || p.cidade_uf || "").trim() || "(sem cidade)";
    const st = String(p.status || "PENDENTE").trim();
    const colabs = (p.colaboradores || p.Colaboradores || []).join(", ");
    const gestor = p.gestor || p.Gestor;
    const checkin = fmtDateBR(p.checkin || p.Checkin);
    const checkout = fmtDateBR(p.checkout || p.Checkout);
    const chegada = onlyHour(p.chegada || p.horaChegada || p.Hora_Chegada);

    const el = document.createElement("div");
    el.className = "hos-card" + (isActive ? " active" : "");
    el.innerHTML = `
      <div class="hos-card-head">
        <div class="hos-card-title">
          <div class="hos-city">${esc(city)}</div>
          <div class="hos-sub"><span class="pill ${pillClass_(st)}">${esc(st)}</span></div>
        </div>
        <div class="hos-card-id">${esc(p.pedidoId || "")}</div>
      </div>

      <div class="hos-meta">
        <div><span>Gestor:</span> <b>${esc(gestor || "-")}</b></div>
        <div><span>Check-in:</span> <b>${esc(checkin || "-")}</b></div>
        <div><span>Check-out:</span> <b>${esc(checkout || "-")}</b></div>
        <div><span>Chegada:</span> <b>${esc(chegada || "-")}</b></div>
      </div>

      <div class="hos-cols">
        <div class="hos-cols-label">Colaboradores</div>
        <div class="hos-cols-val">${esc(colabs || "-")}</div>
      </div>

      <div class="hos-actions">
        <button class="btn mini" data-act="map">Ver no mapa</button>
        ${isCheckout_(p)
          ? `<button class="btn mini warn" data-act="checkout">Confirmar checkout</button>`
          : `<button class="btn mini ok" data-act="reservar">Reservar</button>`}
        <button class="btn mini danger" data-act="negar">Negar</button>
      </div>
    `;

    el.addEventListener("click", (ev) => {
      const act = ev.target && ev.target.getAttribute ? ev.target.getAttribute("data-act") : "";
      if (!act) {
        onActivate && onActivate(p);
        onMap(p);
        return;
      }
      ev.preventDefault();
      ev.stopPropagation();
      if (act === "map") return onMap(p);
      if (act === "reservar") return onReservar(p);
      if (act === "negar") return onNegar(p);
      if (act === "checkout") return onCheckout(p);
    });

    return el;
  }

  function statusKey_(st){
    const s = String(st||"").toUpperCase();
    if (s.includes("PAGO")) return "PAGOS";
    if (s.includes("PENDENTE") && s.includes("PAG")) return "PAGAMENTO_PENDENTE";
    if (s.includes("RESERV")) return "RESERVADOS";
    if (s.includes("NEG")) return "NEGADOS";
    if (s.includes("CHECKOUT")) return "CHECKOUT_PENDENTE";
    return "SOLICITACOES"; // default
  }

  function statusLabel_(k){
    const key = String(k||"").toUpperCase();
    if (key === "RESERVADOS") return "Reservados";
    if (key === "PAGAMENTO_PENDENTE") return "Pagamentos Pendentes";
    if (key === "PAGOS") return "Pagos";
    if (key === "NEGADOS") return "Negados";
    if (key === "CHECKOUT_PENDENTE") return "Checkout pendente";
    return "Solicitações";
  }

  async function openHome(container, opts) {
    // garante CSS do módulo (ADM/app.html não carrega automaticamente)
    try{
      const href = new URL("../assets/css/hospedagem_adm.css", document.baseURI).toString();
      const exists = Array.from(document.querySelectorAll('link[rel="stylesheet"]')).some(l => (l.href||"").includes("hospedagem_adm.css"));
      if(!exists){
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = href;
        document.head.appendChild(link);
      }
    }catch(_){ }

    container.innerHTML = "";
    opts = opts || {};
    const token = (opts.auth && opts.auth.token) ? String(opts.auth.token).trim() : getToken_();

    const root = document.createElement("div");
    root.className = "hos-adm-root";

    root.innerHTML = `
      <!-- ESQUERDA: cards + ações -->
      <div class="hos-left">
        <div class="hos-actionsbar">
          <div class="left">
            <button class="btn mini" id="hos_refresh">Atualizar</button>
          </div>
          <div class="right">
            <button class="btn mini" id="hos_btn_hotels">Pesquisar Hotéis</button>
            <button class="btn mini" id="hos_btn_cotacao">Solicitar Cotação</button>
            <button class="btn mini ok" id="hos_btn_reservar">Reservar</button>
            <button class="btn mini" id="hos_btn_relatorio">Relatório</button>
          </div>
        </div>

        <div class="hos-tabs" id="hos_tabs">
          <button class="hos-tab active" data-tab="SOLICITACOES">Solicitações</button>
          <button class="hos-tab" data-tab="RESERVADOS">Reservados</button>
          <button class="hos-tab" data-tab="PAGAMENTO_PENDENTE">Pagamentos Pendentes</button>
          <button class="hos-tab" data-tab="PAGOS">Pagos</button>
        </div>

        <div class="hos-list-scroll">
          <div id="hos_list" class="hos-list"></div>
        </div>
      </div>

      <!-- MEIO: detalhes (Airbnb style) -->
      <div class="hos-mid">
        <div id="hos_detail" class="hos-detail"></div>
      </div>

      <!-- DIREITA: mapa lateral único -->
      <div class="hos-right">
        <div class="hos-map-wrap">
          <div class="hos-map-title">
            <div class="ttl">Mapa</div>
            <div class="sub">Clique em um card para dar zoom na cidade</div>
          </div>
          <div id="hos_map"></div>
        </div>
      </div>
    `;

    container.appendChild(root);

    const mapWrap = root.querySelector("#hos_map");
    const map = createMap();
    mapWrap.appendChild(map);
    setMap(map, "Brasil", 4);

    const list = root.querySelector("#hos_list");
    const detail = root.querySelector("#hos_detail");
    const btnRefresh = root.querySelector("#hos_refresh");
    const btnHotels = root.querySelector("#hos_btn_hotels");
    const btnCotacao = root.querySelector("#hos_btn_cotacao");
    const btnReservarTop = root.querySelector("#hos_btn_reservar");
    const btnRelatorio = root.querySelector("#hos_btn_relatorio");
    const tabs = root.querySelector("#hos_tabs");

    let activeTab = "SOLICITACOES";
    let activePedido = null;
    let cachedHoteis = []; // últimos hotéis pesquisados (cidade)
    let selectedHoteis = new Set();

    function googleMapsUrl_(q){
      const qq = String(q||"").trim();
      return "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(qq || "Brasil");
    }

    function renderDetail_(p){
      if (!detail) return;
      if (!p){
        detail.innerHTML = `
          <div class="hos-empty-center">
            <b>Selecione uma solicitação</b>
            <div style="margin-top:6px; opacity:.85; font-size:12px;">Clique em um card à esquerda para abrir os detalhes (estilo Airbnb).</div>
          </div>
        `;
        return;
      }

      const city = String(p.cidade || p.cidadeUF || p.cidade_uf || "").trim() || "(sem cidade)";
      const st = String(p.status || "PENDENTE").trim();
      const gestor = p.gestor || p.Gestor || "-";
      const colabsArr = (p.colaboradores || p.Colaboradores || []);
      const colabs = Array.isArray(colabsArr) ? colabsArr.join(", ") : String(colabsArr||"");
      const checkin = fmtDateBR(p.checkin || p.Checkin) || "-";
      const checkout = fmtDateBR(p.checkout || p.Checkout) || "-";
      const chegada = onlyHour(p.chegada || p.horaChegada || p.Hora_Chegada) || "-";

      // campos ymd (para input date)
      const cin = String(p._checkinYMD||"").trim();
      const cout = String(p._checkoutYMD||"").trim();
      const nColabs = (Array.isArray(colabsArr) ? colabsArr.length : "") || "";

      // hotéis selecionados
      const sel = Array.from(selectedHoteis.values()).map(k=>{
        const parts = String(k).split("||");
        return { cidade: parts[0]||"", hotel: parts[1]||k };
      });

      detail.innerHTML = `
        <div class="hos-summary">
          <div class="hos-summary-top">
            <div>
              <div class="hos-summary-title">${esc(colabs ? colabs.split(",")[0] : city)}</div>
              <div class="hos-summary-sub">
                <span class="hos-badge ${pillClass_(st)}">${esc(st)}</span>
                <span style="margin-left:8px; opacity:.85;">Pedido <b>${esc(p.pedidoId||"")}</b> • ${esc(city)}</span>
              </div>
              <div class="hos-summary-sub">Gestor: <b>${esc(gestor)}</b> • Check-in: <b>${esc(checkin)}</b> • Check-out: <b>${esc(checkout)}</b> • Chegada: <b>${esc(chegada)}</b></div>
            </div>
            <div class="hos-summary-actions">
              <a class="btn mini" href="${esc(googleMapsUrl_(city))}" target="_blank" rel="noopener">Ver mapa ampliado</a>
              <button class="btn mini" id="hos_d_map">Zoom no mapa</button>
              ${isCheckout_(p)
                ? `<button class="btn mini warn" id="hos_d_checkout">Confirmar checkout</button>`
                : `<button class="btn mini ok" id="hos_d_reservar">Reservar</button>`}
              <button class="btn mini danger" id="hos_d_negar">Negar</button>
            </div>
          </div>
        </div>

        <div class="hos-section">
          <h3>🛏 Dados da reserva</h3>
          <div class="hos-form-grid">
            <div class="hos-field">
              <label>Nº de colaboradores</label>
              <input class="hos-input" id="hos_d_n" type="number" min="1" value="${esc(String(nColabs||""))}" />
            </div>
            <div class="hos-field">
              <label>Tipo de quarto (informado pelo ADM)</label>
              <input class="hos-input" id="hos_d_quarto" placeholder="Ex.: Duplo / Triplo" />
            </div>
            <div class="hos-field">
              <label>Check-in</label>
              <input class="hos-input" id="hos_d_in" type="date" value="${esc(cin)}" />
            </div>
            <div class="hos-field">
              <label>Check-out</label>
              <input class="hos-input" id="hos_d_out" type="date" value="${esc(cout)}" />
            </div>
          </div>
          <div style="margin-top:10px; display:flex; gap:8px; justify-content:flex-end; flex-wrap:wrap;">
            <button class="btn mini" id="hos_d_pick">Pesquisar hotéis</button>
            <button class="btn mini ok" id="hos_d_send">Enviar para hotéis</button>
          </div>
          <div style="margin-top:8px; opacity:.85; font-size:12px;">
            Dica: selecione os hotéis e depois clique em <b>Enviar para hotéis</b>.
          </div>
        </div>

        <div class="hos-section">
          <h3>🏨 Hotéis selecionados</h3>
          ${sel.length ? `
            <div class="hos-hotels-grid">
              ${sel.map(h=>`
                <div class="hos-hotel-card">
                  <div class="name">${esc(h.hotel)}</div>
                  <div class="meta">Cidade: ${esc(h.cidade||city||"-")}</div>
                </div>
              `).join("")}
            </div>
          ` : `
            <div class="hos-empty-center">
              🔎 Nenhum hotel selecionado.<br/>
              <span style="opacity:.85; font-size:12px;">Clique em <b>Pesquisar hotéis</b> para escolher opções.</span>
            </div>
          `}
        </div>

        <div class="hos-section">
          <h3>👥 Colaboradores</h3>
          <div style="opacity:.9; font-size:12px; line-height:1.45;">${esc(colabs || "-")}</div>
        </div>
      `;

      // wire actions
      const bMap = detail.querySelector("#hos_d_map");
      bMap && bMap.addEventListener("click", ()=> onMap(p));
      const bReservar = detail.querySelector("#hos_d_reservar");
      bReservar && bReservar.addEventListener("click", ()=> onReservar(p));
      const bNegar = detail.querySelector("#hos_d_negar");
      bNegar && bNegar.addEventListener("click", ()=> onNegar(p));
      const bCheckout = detail.querySelector("#hos_d_checkout");
      bCheckout && bCheckout.addEventListener("click", ()=> onCheckout(p));
      const bPick = detail.querySelector("#hos_d_pick");
      bPick && bPick.addEventListener("click", ()=> { openHoteisModal_(); setTimeout(()=>renderDetail_(activePedido), 50); });
      const bSend = detail.querySelector("#hos_d_send");
      bSend && bSend.addEventListener("click", async ()=>{
        try{
          if (!token) throw new Error("Sessão expirada. Faça login novamente.");
          const h = Array.from(selectedHoteis.values()).map(k=>String(k).split("||")[1]).filter(Boolean);
          if (!h.length) return alert("Selecione pelo menos 1 hotel em 'Pesquisar hotéis'.");
          const n = String(detail.querySelector("#hos_d_n").value||"").trim();
          const quarto = String(detail.querySelector("#hos_d_quarto").value||"").trim();
          const cin2 = String(detail.querySelector("#hos_d_in").value||"").trim();
          const cout2 = String(detail.querySelector("#hos_d_out").value||"").trim();
          if (!n || !cin2 || !cout2 || !quarto) return alert("Preencha Nº colaboradores, check-in, check-out e tipo de quarto.");
          await apiPost_({ module:"hospedagem", action:"adm_solicitarCotacao", token, payload:{
            pedidoId: p.pedidoId,
            cidadeUF: city,
            hoteis: h,
            nColaboradores: +n,
            checkin: cin2,
            checkout: cout2,
            tipoQuarto: quarto
          }});
          alert("Cotação solicitada com sucesso.");
          await load_();
        }catch(e){
          alert(String(e && e.message || e));
        }
      });
    }

    function setLoading(msg) {
      list.innerHTML = `<div class="hos-empty">${esc(msg || "Carregando...")}</div>`;
    }

    function onMap(p) {
      const q = (p && String(p.cidade || p.cidadeUF || "").trim()) ? String(p.cidade || p.cidadeUF).trim() : "Brasil";
      setMap(map, q, q === "Brasil" ? 4 : 12);
    }

    function onActivate(p){
      activePedido = p || null;
      // re-render para highlight
      const cards = list.querySelectorAll(".hos-card");
      cards.forEach(c=> c.classList.remove("active"));
      const el = list.querySelector(`[data-pedido="${CSS.escape(String(p && p.pedidoId || ""))}"]`);
      if (el) el.classList.add("active");
      renderDetail_(activePedido);
    }

    async function onReservar(p) {
      if (!token) return alert("Sessão expirada. Faça login novamente.");
      const hotel = prompt("Hotel que vai garantir a reserva (obrigatório):", "");
      if (!hotel) return;
      const quarto = prompt("Tipo de quarto (ex.: Duplo, Triplo, etc) (opcional):", "");
      const valor = prompt("Valor da diária (opcional):", "");
      const obs = prompt("Observação (opcional):", "");
      try {
        await apiPost_({ module: "hospedagem", action: "adm_registrarReserva", token, payload: { pedidoId: p.pedidoId, reservaHotel: hotel, reservaQuarto: quarto, reservaValor: valor, reservaObs: obs } });
        await load_();
      } catch (e) {
        alert(String(e && e.message || e));
      }
    }

    async function pesquisarHoteis_(cidadeUF){
      if (!token) throw new Error("Sessão expirada. Faça login novamente.");
      const raw = String(cidadeUF||"").trim();
      if (!raw) return [];

      // tentativas de chave para bater com planilha (ex.: "Cascavel PR" / "Cascavel - PR")
      const tries = [];
      const up = raw.toUpperCase();
      const mUF = up.match(/\b([A-Z]{2})\b$/);
      const uf = mUF ? mUF[1] : "";
      const cityOnly = raw.replace(/\b[A-Z]{2}\b$/i,"").replace(/[-–—]\s*$/,"").trim();

      tries.push(raw);
      if (uf){
        tries.push(`${cityOnly} - ${uf}`.trim());
        tries.push(`${cityOnly} ${uf}`.trim());
      }

      let rows = [];
      let lastErr = null;
      for (const t of tries){
        try{
          const r = await apiPost_({ module:"hospedagem", action:"adm_listarHoteis", token, payload:{ cidadeUF: t } });
          rows = Array.isArray(r && (r.items||r.data||r.rows)) ? (r.items||r.data||r.rows) : [];
          if (rows && rows.length) break;
        }catch(e){
          lastErr = e;
        }
      }
      if ((!rows || !rows.length) && lastErr) throw lastErr;

      // normalizar
      return rows.map(x=>({
        cidade: String(x.CIDADE || x.cidade || raw || "").trim(),
        hotel: String(x.HOTEL || x.hotel || "").trim(),
        link: String(x["Link Google Maps"] || x.link || x.maps || "").trim(),
        contato: String(x.Contato || x.contato || "").trim(),
        contatoStatus: String(x.Contato_Status || x.contato_status || "").trim(),
        status: String(x.Status || x.status || "").trim(),
      })).filter(x=>x.hotel);
    }

function openHoteisModal_(){
      const cidadeDefaultRaw = String((activePedido && (activePedido.cidade || "")) || "").trim();
      const cidadeDefault = (function(){
        // Se vier sem UF, tenta completar com p.uf (se existir)
        const s = cidadeDefaultRaw;
        if (!s) return "";
        const hasUF = /[A-Z]{2}$/.test(s.trim().toUpperCase());
        if (hasUF) return s;
        const uf = String(activePedido && activePedido.uf || "").trim().toUpperCase();
        if (uf && uf.length===2) return `${s} - ${uf}`;
        return s; // usuário pode digitar UF
      })();
      const wrap = document.createElement("div");
      wrap.innerHTML = `
        <div class="hos-grid2">
          <div class="hos-field">
            <label>Cidade/UF</label>
            <input class="hos-input" id="hos_m_cidade" placeholder="Ex.: Cascavel - PR" value="${esc(cidadeDefault)}" />
          </div>
          <div class="hos-field">
            <label>Filtro</label>
            <input class="hos-input" id="hos_m_filtro" placeholder="Pesquisar por nome do hotel" />
          </div>
        </div>
        <div style="margin-top:6px; opacity:.85; font-size:12px;">
          Selecione hotéis para usar em <b>Solicitar Cotação</b>.
        </div>
        <div style="margin-top:10px;">
          <table class="hos-table">
            <thead>
              <tr>
                <th style="width:34px;"></th>
                <th>Hotel</th>
                <th>Localização</th>
                <th>Telefone</th>
              </tr>
            </thead>
            <tbody id="hos_m_tbody"></tbody>
          </table>
        </div>
      `;

      const ui = openModal_("Pesquisar Hotéis", wrap, [
        { label:"Atualizar lista", className:"btn mini", onClick: async (ctx)=>{
            const cidadeUF = String(wrap.querySelector("#hos_m_cidade").value||"").trim();
            const tbody = wrap.querySelector("#hos_m_tbody");
            tbody.innerHTML = `<tr><td colspan="4" style="opacity:.8;">Carregando...</td></tr>`;
            try{
              cachedHoteis = await pesquisarHoteis_(cidadeUF);
              selectedHoteis = new Set();
              renderRows_();
            }catch(e){
              tbody.innerHTML = `<tr><td colspan="4" style="opacity:.8;">${esc(String(e && e.message || e))}</td></tr>`;
            }
        }},
        { label:"Fechar", className:"btn mini", onClick:(ctx)=>ctx.close() }
      ]);

      function renderRows_(){
        const filtro = String(wrap.querySelector("#hos_m_filtro").value||"").toLowerCase().trim();
        const tbody = wrap.querySelector("#hos_m_tbody");
        const rows = (cachedHoteis||[]).filter(h=> !filtro || h.hotel.toLowerCase().includes(filtro));
        if (!rows.length){
          tbody.innerHTML = `<tr><td colspan="4" style="opacity:.8;">Nenhum hotel encontrado para o filtro.</td></tr>`;
          return;
        }
        tbody.innerHTML = "";
        rows.forEach((h, idx)=>{
          const key = `${h.cidade}||${h.hotel}`;
          const tr = document.createElement("tr");
          tr.innerHTML = `
            <td><input type="checkbox" data-key="${esc(key)}" /></td>
            <td><b>${esc(h.hotel)}</b><div style="opacity:.8; font-size:11px;">${esc(h.status||"")}</div></td>
            <td>${h.link ? `<a href="${esc(h.link)}" target="_blank" rel="noopener" style="color:#93c5fd;">Abrir no Maps</a>` : "-"}</td>
            <td>${esc(h.contato||"-")}</td>
          `;
          const cb = tr.querySelector("input[type=checkbox]");
          cb.checked = selectedHoteis.has(key);
          cb.addEventListener("change", ()=>{
            if (cb.checked) selectedHoteis.add(key);
            else selectedHoteis.delete(key);
          });
          tbody.appendChild(tr);
        });
      }

      wrap.querySelector("#hos_m_filtro").addEventListener("input", renderRows_);
      // auto-load se já tiver cidade
      (async ()=>{
        const cidadeUF0 = String(wrap.querySelector("#hos_m_cidade").value||"").trim();
        if (!cidadeUF0) return;
        const tbody = wrap.querySelector("#hos_m_tbody");
        tbody.innerHTML = `<tr><td colspan="4" style="opacity:.8;">Carregando...</td></tr>`;
        try{
          cachedHoteis = await pesquisarHoteis_(cidadeUF0);
          selectedHoteis = new Set();
          renderRows_();
        }catch(e){
          tbody.innerHTML = `<tr><td colspan="4" style="opacity:.8;">${esc(String(e && e.message || e))}</td></tr>`;
        }
      })();
    }

    function openCotacaoModal_(){
      if (!activePedido) return alert("Selecione um card de Solicitação primeiro.");
      const cidadeUF = String(activePedido.cidade||"").trim();
      const nColabs = (activePedido.colaboradores||[]).length || "";
      const wrap = document.createElement("div");
      wrap.innerHTML = `
        <div style="opacity:.9; font-size:12px; margin-bottom:10px;">
          <b>Pedido:</b> ${esc(activePedido.pedidoId)} • <b>Cidade:</b> ${esc(cidadeUF||"-")}
        </div>

        <div class="hos-grid2">
          <div class="hos-field">
            <label>Nº de colaboradores</label>
            <input class="hos-input" id="hos_c_n" type="number" min="1" value="${esc(String(nColabs||""))}" />
          </div>
          <div class="hos-field">
            <label>Tipo de quarto (informado pelo ADM)</label>
            <input class="hos-input" id="hos_c_quarto" placeholder="Ex.: Duplo / Triplo" />
          </div>
        </div>

        <div class="hos-grid2">
          <div class="hos-field">
            <label>Check-in</label>
            <input class="hos-input" id="hos_c_in" type="date" value="${esc(String(activePedido._checkinYMD||""))}" />
          </div>
          <div class="hos-field">
            <label>Check-out</label>
            <input class="hos-input" id="hos_c_out" type="date" value="${esc(String(activePedido._checkoutYMD||""))}" />
          </div>
        </div>

        <div style="margin-top:8px;">
          <div style="font-weight:900; margin-bottom:6px;">Hotéis selecionados</div>
          <div id="hos_c_sel" style="opacity:.9; font-size:12px;"></div>
          <div style="margin-top:8px; opacity:.8; font-size:12px;">Dica: use <b>Pesquisar Hotéis</b> para selecionar.</div>
        </div>
      `;

      function renderSel_(){
        const box = wrap.querySelector("#hos_c_sel");
        const h = Array.from(selectedHoteis.values());
        if (!h.length) box.innerHTML = `<span style="opacity:.8;">Nenhum hotel selecionado.</span>`;
        else box.innerHTML = `<ul style="margin:0; padding-left:18px;">${h.map(x=>`<li>${esc(x.split("||")[1]||x)}</li>`).join("")}</ul>`;
      }
      renderSel_();

      openModal_("Solicitar Cotação", wrap, [
        { label:"Enviar para hotéis", className:"btn mini ok", onClick: async (ctx)=>{
            const h = Array.from(selectedHoteis.values()).map(k=>k.split("||")[1]).filter(Boolean);
            if (!h.length) return alert("Selecione pelo menos 1 hotel em 'Pesquisar Hotéis'.");
            const n = String(wrap.querySelector("#hos_c_n").value||"").trim();
            const quarto = String(wrap.querySelector("#hos_c_quarto").value||"").trim();
            const cin = String(wrap.querySelector("#hos_c_in").value||"").trim();
            const cout = String(wrap.querySelector("#hos_c_out").value||"").trim();
            if (!n || !cin || !cout || !quarto) return alert("Preencha Nº colaboradores, check-in, check-out e tipo de quarto.");
            try{
              await apiPost_({ module:"hospedagem", action:"adm_solicitarCotacao", token, payload:{
                pedidoId: activePedido.pedidoId,
                cidadeUF,
                hoteis: h,
                nColaboradores: +n,
                checkin: cin,
                checkout: cout,
                tipoQuarto: quarto
              }});
              ctx.close();
              await load_();
              alert("Cotação solicitada com sucesso.");
            }catch(e){
              alert(String(e && e.message || e));
            }
        }},
        { label:"Fechar", className:"btn mini", onClick:(ctx)=>ctx.close() }
      ]);
    }

    function openRelatorioModal_(){
      const y = yesterdayYMD_();
      const wrap = document.createElement("div");
      wrap.innerHTML = `
        <div class="hos-grid2">
          <div class="hos-field">
            <label>Data inicial</label>
            <input class="hos-input" id="hos_r_ini" type="date" value="${esc(y)}" />
          </div>
          <div class="hos-field">
            <label>Data final</label>
            <input class="hos-input" id="hos_r_fim" type="date" value="${esc(y)}" />
          </div>
        </div>
        <div id="hos_r_out" style="margin-top:10px;"></div>
      `;

      openModal_("Relatório de Hospedagem", wrap, [
        { label:"Gerar", className:"btn mini ok", onClick: async (ctx)=>{
            const ini = String(wrap.querySelector("#hos_r_ini").value||"").trim();
            const fim = String(wrap.querySelector("#hos_r_fim").value||"").trim();
            const out = wrap.querySelector("#hos_r_out");
            out.innerHTML = `<div class="hos-empty">Gerando...</div>`;
            try{
              const r = await apiPost_({ module:"hospedagem", action:"adm_relatorio", token, payload:{ ini, fim } });
              const rows = Array.isArray(r && (r.items||r.data||r.rows)) ? (r.items||r.data||r.rows) : [];
              const total = rows.reduce((a,x)=> a + parseMoney_(x.Reserva_Valor || x.valor || 0), 0);
              out.innerHTML = `
                <div style="display:flex; gap:10px; align-items:center; justify-content:space-between; margin-bottom:8px;">
                  <div style="font-weight:900;">Total: ${esc(moneyBR_(total))}</div>
                  <button class="btn mini" id="hos_r_csv">Baixar CSV</button>
                </div>
                <table class="hos-table">
                  <thead><tr>
                    <th>Data</th><th>Cidade</th><th>Hotel</th><th>Gestor</th><th>Valor</th>
                  </tr></thead>
                  <tbody>
                    ${rows.map(x=>`<tr>
                      <td>${esc(fmtDateBR(x.Checkin || x.data || x.Data || ""))}</td>
                      <td>${esc(x.Cidade_UF || x.cidade || "")}</td>
                      <td>${esc(x.Reserva_Hotel || x.hotel || "")}</td>
                      <td>${esc(x.Gestor || x.gestor || "")}</td>
                      <td>${esc(moneyBR_(parseMoney_(x.Reserva_Valor || x.valor || 0)))}</td>
                    </tr>`).join("")}
                  </tbody>
                </table>
              `;
              const btn = out.querySelector("#hos_r_csv");
              btn && btn.addEventListener("click", ()=>{
                const header = ["Data","Cidade","Hotel","Gestor","Valor"];
                const lines = rows.map(x=>[
                  fmtDateBR(x.Checkin || x.data || x.Data || ""),
                  x.Cidade_UF || x.cidade || "",
                  x.Reserva_Hotel || x.hotel || "",
                  x.Gestor || x.gestor || "",
                  String(x.Reserva_Valor || x.valor || "")
                ].map(v=>`"${String(v||"").replace(/"/g,'""')}"`).join(","));
                const csv = header.join(",") + "\n" + lines.join("\n");
                const blob = new Blob([csv], { type:"text/csv;charset=utf-8" });
                const a = document.createElement("a");
                a.href = URL.createObjectURL(blob);
                a.download = `relatorio_hospedagem_${ini}_a_${fim}.csv`;
                a.click();
                setTimeout(()=>URL.revokeObjectURL(a.href), 1500);
              });
            }catch(e){
              out.innerHTML = `<div class="hos-empty">${esc(String(e && e.message || e))}</div>`;
            }
        }},
        { label:"Fechar", className:"btn mini", onClick:(ctx)=>ctx.close() }
      ]);
    }

    async function onNegar(p) {
      if (!token) return alert("Sessão expirada. Faça login novamente.");
      const motivo = prompt("Motivo da recusa:", "");
      if (!motivo) return;
      try {
        await apiPost_({ module: "hospedagem", action: "adm_negarPedido", token, payload: { pedidoId: p.pedidoId, motivo } });
        await load_();
      } catch (e) {
        alert(String(e && e.message || e));
      }
    }

    async function onCheckout(p) {
      if (!token) return alert("Sessão expirada. Faça login novamente.");
      if (!confirm(`Confirmar checkout do pedido ${p.pedidoId}?`)) return;
      try {
        await apiPost_({ module: "hospedagem", action: "adm_confirmarCheckout", token, payload: { pedidoId: p.pedidoId } });
        await load_();
      } catch (e) {
        alert(String(e && e.message || e));
      }
    }

    async function load_() {
      setLoading("Carregando...");
      try {
        if (!token) throw new Error("Sessão expirada. Faça login novamente.");
        // Backend pode aceitar statusKey (novo) ou status (legado)
        const r = await apiPost_({ module: "hospedagem", action: "adm_listarPedidos", token, payload: { statusKey: activeTab, status: activeTab } });
        // Backend pode retornar agrupado (items) ou linhas (data/rows)
        const pedidos = Array.isArray(r && r.items) ? r.items
                      : groupByPedido_((r && (r.data || r.rows)) ? (r.data || r.rows) : []);

                // anexa campos ymd pra inputs date (aceita ISO ou BR)
        pedidos.forEach(p=>{
          const rawIn = String(p.checkin||"").trim();
          const rawOut = String(p.checkout||"").trim();

          const isoIn = rawIn.match(/^(\d{4})-(\d{2})-(\d{2})/);
          const isoOut = rawOut.match(/^(\d{4})-(\d{2})-(\d{2})/);

          const brIn = rawIn.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
          const brOut = rawOut.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);

          p._checkinYMD = isoIn ? `${isoIn[1]}-${isoIn[2]}-${isoIn[3]}` : (brIn ? `${brIn[3]}-${brIn[2]}-${brIn[1]}` : "");
          p._checkoutYMD = isoOut ? `${isoOut[1]}-${isoOut[2]}-${isoOut[3]}` : (brOut ? `${brOut[3]}-${brOut[2]}-${brOut[1]}` : "");
        });

        // filtro client-side também (caso backend ignore statusKey)
        const filtered = pedidos.filter(p=> statusKey_(p.status) === activeTab);

        if (!filtered.length) {
          list.innerHTML = `<div class="hos-empty">Nenhum item em <b>${esc(statusLabel_(activeTab))}</b>.</div>`;
          onMap({ cidade: "Brasil" });
          activePedido = null;
          renderDetail_(null);
          return;
        }

        list.innerHTML = "";
        filtered.forEach(p => {
          const card = buildCard_(p, onMap, onReservar, onNegar, onCheckout, onActivate, activePedido && activePedido.pedidoId === p.pedidoId);
          card.setAttribute("data-pedido", String(p.pedidoId||""));
          list.appendChild(card);
        });
        // ativa o primeiro se nada selecionado
        if (!activePedido) activePedido = filtered[0];
        onMap(activePedido || filtered[0]);
        const firstEl = list.querySelector(`[data-pedido="${CSS.escape(String(activePedido && activePedido.pedidoId || ""))}"]`);
        firstEl && firstEl.classList.add("active");
        renderDetail_(activePedido);
      } catch (e) {
        list.innerHTML = `<div class="hos-empty">${esc(String(e && e.message || e))}</div>`;
        renderDetail_(null);
      }
    }

    btnRefresh && btnRefresh.addEventListener("click", load_);
    btnHotels && btnHotels.addEventListener("click", openHoteisModal_);
    btnCotacao && btnCotacao.addEventListener("click", openCotacaoModal_);
    btnReservarTop && btnReservarTop.addEventListener("click", ()=>{
      if (!activePedido) return alert("Selecione um card primeiro.");
      onReservar(activePedido);
    });
    btnRelatorio && btnRelatorio.addEventListener("click", openRelatorioModal_);

    tabs && tabs.addEventListener("click", (ev)=>{
      const t = ev.target && ev.target.getAttribute ? ev.target.getAttribute("data-tab") : "";
      if (!t) return;
      activeTab = String(t).trim();
      activePedido = null;
      tabs.querySelectorAll(".hos-tab").forEach(b=> b.classList.toggle("active", b.getAttribute("data-tab") === activeTab));
      load_();
    });
    load_();
  }

  window[MOD] = { openHome };
})();
