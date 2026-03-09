(function () {
  "use strict";

  const getAuth = () => {
    try {
      if (window.AUTH && typeof AUTH.getAuth === "function") {
        return AUTH.getAuth();
      }
      return JSON.parse(localStorage.getItem("g1000_auth") || "null");
    } catch (e) { return null; }
  };

  function uuid() {
    return "res_" + Math.random().toString(36).slice(2, 9);
  }

  function applyDMYMask_(input){
    if (!input) return;
    input.addEventListener("input", ()=>{
      let v = String(input.value||"").replace(/\D/g,"").slice(0,8);
      if (v.length >= 5) input.value = v.slice(0,2)+"/"+v.slice(2,4)+"/"+v.slice(4);
      else if (v.length >= 3) input.value = v.slice(0,2)+"/"+v.slice(2);
      else input.value = v;
    });
  }

  function normalizeHour_(val){
    let v = String(val||"").trim();
    if (!v) return "18:00";
    v = v.replace(/\s+/g,"");
    if (/^\d{1,2}$/.test(v)) v = ("0"+v).slice(-2) + ":00";
    v = v.replace(/[^0-9:]/g,"");
    const m = v.match(/^(\d{1,2})(?::?(\d{1,2}))?$/);
    if (!m) return "18:00";
    let hh = parseInt(m[1],10);
    let mm = parseInt(m[2]||"0",10);
    if (isNaN(hh)) hh = 18;
    if (isNaN(mm)) mm = 0;
    hh = Math.min(23, Math.max(0, hh));
    mm = Math.min(59, Math.max(0, mm));
    return ("0"+hh).slice(-2) + ":" + ("0"+mm).slice(-2);
  }

  function applyHourMask_(input){
    if (!input) return;
    input.addEventListener("input", ()=>{
      let v = String(input.value||"").replace(/\D/g,"").slice(0,4);
      if (v.length >= 3) input.value = v.slice(0,2) + ":" + v.slice(2);
      else input.value = v;
    });
    input.addEventListener("blur", ()=>{
      input.value = normalizeHour_(input.value);
    });
  }

  function dmyToDate_(s){
    const m = String(s||"").trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!m) return null;
    const d = new Date(parseInt(m[3],10), parseInt(m[2],10)-1, parseInt(m[1],10));
    return isNaN(d.getTime()) ? null : d;
  }

  function enforceDateOrder_(card){
    if (!card) return;
    const inEl = card.querySelector(".checkin");
    const outEl = card.querySelector(".checkout");
    if (!inEl || !outEl) return;
    const di = dmyToDate_(inEl.value);
    const do_ = dmyToDate_(outEl.value);
    if (di && do_ && do_.getTime() < di.getTime()){
      const tmp = inEl.value;
      inEl.value = outEl.value;
      outEl.value = tmp;
    }
  }

  function dmyToISO_(s){
    const m = String(s||"").trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!m) return "";
    return `${m[3]}-${m[2]}-${m[1]}`;
  }

  function fmtDateBR_(v){
    const s = String(v||"").trim();
    if (!s) return "";
    const mIso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (mIso) return `${mIso[3]}/${mIso[2]}/${mIso[1]}`;
    const mBR = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (mBR) return s;
    const d = new Date(s);
    if (!isNaN(d.getTime())){
      const dd=("0"+d.getDate()).slice(-2);
      const mm=("0"+(d.getMonth()+1)).slice(-2);
      return `${dd}/${mm}/${d.getFullYear()}`;
    }
    return s;
  }

  function templateReserva(id) {
    return `
      <div class="reserva-card" data-id="${id}">
        <div class="reserva-top">
          <b>Hospedagem</b>
          <button class="btn danger" data-remove="${id}">Remover</button>
        </div>

        <div class="grid">
          <label>Cidade / UF</label>
          <input class="cidade" />

          <label>Tipo</label>
          <select class="tipo">
            <option>HOTEL</option>
            <option>ALOJAMENTO</option>
            <option>OUTRO</option>
          </select>

          <label>Hora chegada</label>
          <input class="hora" placeholder="18:00" />

          <label>Check-in</label>
          <input type="text" inputmode="numeric" class="checkin mask-date" placeholder="dd/MM/aaaa" />

          <label>Check-out</label>
          <input type="text" inputmode="numeric" class="checkout mask-date" placeholder="dd/MM/aaaa" />
        </div>

        <div class="colabs">
          <div class="colabs-top">
            <b>Colaboradores</b>
            <button class="btn mini" data-addcolab="${id}">+ Colaborador</button>
          </div>
          <div class="colabs-list"></div>
        </div>

        <label>Observação</label>
        <textarea class="obs"></textarea>
      </div>
    `;
  }

  function escapeHtml_(s){
    return String(s||"").replace(/[&<>"']/g,(c)=>({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
  }

  function getColabsFromStorage_(){
    try{
      const raw = localStorage.getItem("g1000_colaboradores_ctx");
      const arr = JSON.parse(raw || "[]");
      return Array.isArray(arr) ? arr.filter(Boolean) : [];
    }catch(_){ return []; }
  }

  async function ensureColabs_(token){
    // 1) tenta cache local (pré-carregado no login via Auth.preloadContext)
    let list = getColabsFromStorage_();

    // 2) fallback: tenta carregar contexto do módulo despesas (mesma lógica do preloadContext)
    if ((!list || !list.length) && token && window.API && typeof window.API.post === "function") {
      try{
        const r1 = await window.API.post({ module:"despesas", action:"getDataPadrao", token: token });
        const dmy = (r1 && (r1.data || r1.dataRef || r1.dataPadrao)) ? String(r1.data || r1.dataRef || r1.dataPadrao).trim() : "";
        if (dmy){
          const ctx = await window.API.post({ module:"despesas", action:"carregarContexto", token: token, dataRef: dmy });
          const base = (ctx && ctx.contexto && ctx.contexto.liberados) ? ctx.contexto.liberados
                     : (ctx && ctx.liberados) ? ctx.liberados
                     : (ctx && ctx.data && ctx.data.liberados) ? ctx.data.liberados
                     : [];
          const nomes = (Array.isArray(base) ? base : []).map(o =>
            String(o && (o.Colaborador || o.NOME || o.nome || o.Nome) || "").trim()
          ).filter(Boolean);

          const set = {};
          nomes.forEach(n=>set[n]=true);
          list = Object.keys(set);

          localStorage.setItem("g1000_colaboradores_ctx", JSON.stringify(list));
        }
      }catch(_){}
    }

    return Array.isArray(list) ? list : [];
  }

  function optionsHtml_(list){
    const arr = Array.isArray(list) ? list : [];
    return ['<option value="">Selecione...</option>']
      .concat(arr.map(n=>`<option value="${escapeHtml_(n)}">${escapeHtml_(n)}</option>`))
      .join("");
  }

  function inputColab(optionsHtml, allowRemove) {
    return `
      <div class="colab-item">
        <select class="colabSel">${optionsHtml || '<option value="">Selecione...</option>'}</select>
        ${allowRemove ? '<button class="btn mini danger remove-colab" title="Remover">x</button>' : ''}
      </div>
    `;
  }

  function renderMeusPedidos_(el, items){
    const arr = Array.isArray(items) ? items : [];
    if (!el) return;
    if (!arr.length){
      el.innerHTML = '<div class="muted">Nenhuma solicitação encontrada.</div>';
      return;
    }
    const escape = (s)=>String(s||"").replace(/[&<>"']/g,(c)=>({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
    el.innerHTML = arr.map(p=>{
      const cols = (p.colaboradores||[]).map(escape).join(", ");
      const hotel = p.reservaHotel ? ('<div><b>Hotel:</b> '+escape(p.reservaHotel)+'</div>') : '';
      const msg = p.status === 'RESERVADO' ? '<span class="pill ok">RESERVADO</span>' :
                  p.status === 'NEGADO' ? '<span class="pill no">NEGADO</span>' :
                  '<span class="pill pend">PENDENTE</span>';
      return (
        '<div class="rowCard">' +
          '<div class="rowTop">' +
            '<div class="id">'+escape(p.pedidoId||"")+'</div>' +
            '<div class="st">'+msg+'</div>' +
          '</div>' +
          '<div class="rowBody">' +
            '<div><b>Cidade:</b> '+escape(p.cidadeUF||"")+' • <b>Tipo:</b> '+escape(p.tipo||"")+'</div>' +
            '<div><b>Check-in:</b> '+escape(fmtDateBR_(p.checkin||""))+' • <b>Check-out:</b> '+escape(fmtDateBR_(p.checkout||""))+'</div>' +
            '<div><b>Colaboradores:</b> '+cols+'</div>' +
            hotel +
          '</div>' +
        '</div>'
      );
    }).join('');
  }

  async function loadMeusPedidos_(token){
    const api = (window.API && typeof API.post === "function") ? API : null;
    if (!api) throw new Error("API indisponível");
    const r = await api.post({
      module: "hospedagem",
      action: "gestor_listarMeusPedidos",
      token: token,
      payload: {}
    });
    if (!r || r.ok !== true) throw new Error((r && (r.error || r.message)) || "Falha ao listar pedidos");
    return r.items || [];
  }

  async function mount(container, opts = {}) {
    const auth = getAuth();
    const token = auth?.token;

    const colabsList = await ensureColabs_(token);
    const colabOptionsHtml = optionsHtml_(colabsList);

    container.innerHTML = `
      <style>
        .colab-item{display:flex;align-items:center;gap:10px;margin-top:8px}
        .colab-item .colabSel{flex:1;min-width:220px}
        .colab-item .remove-colab{width:42px;min-width:42px;padding:8px 0;border-radius:12px}
      </style>
      <div class="hosp-wrap">
        <div class="topbar">
          <button id="btnBack" class="btn">← Voltar</button>
          <h2>Hospedagem Avulsa</h2>
        </div>

        <div id="reservas"></div>

        <div class="actions">
          <button id="addReserva" class="btn">+ Outra hospedagem</button>
          <button id="enviar" class="btn primary">Solicitar</button>
        </div>
      </div>

      <div class="card" style="margin-top:12px">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:10px">
          <h3 style="margin:0">Meus pedidos</h3>
          <button class="btn btn-sm" id="hos_btn_refresh">Atualizar</button>
        </div>
        <div class="muted" style="margin-top:6px">Acompanhe o status das solicitações de hospedagem.</div>
        <div id="hos_meus_pedidos" style="margin-top:10px"></div>
      </div>
    `;

    if (opts.onBack) {
      container.querySelector("#btnBack").onclick = opts.onBack;
    }

    const reservasEl = container.querySelector("#reservas");
    const meusPedidosEl = container.querySelector("#hos_meus_pedidos");
    const btnRefresh = container.querySelector("#hos_btn_refresh");

    // ✅ função central de refresh (botão + auto-load)
    const refreshMeusPedidos_ = async () => {
      if (!token) {
        renderMeusPedidos_(meusPedidosEl, []);
        return;
      }
      try{
        if (btnRefresh) btnRefresh.disabled = true;
        if (meusPedidosEl) meusPedidosEl.innerHTML = '<div class="muted">Carregando…</div>';
        const items = await loadMeusPedidos_(token);
        renderMeusPedidos_(meusPedidosEl, items);
      }catch(err){
        console.error(err);
        if (meusPedidosEl){
          const msg = (err && err.message) ? String(err.message) : "Erro ao listar pedidos";
          meusPedidosEl.innerHTML = '<div class="muted">Falha ao atualizar: '+escapeHtml_(msg)+'</div>';
        }
      }finally{
        if (btnRefresh) btnRefresh.disabled = false;
      }
    };

    // ✅ agora o botão está linkado
    if (btnRefresh) btnRefresh.onclick = refreshMeusPedidos_;

    function addReserva() {
      const id = uuid();
      reservasEl.insertAdjacentHTML("beforeend", templateReserva(id));
      const card = reservasEl.querySelector(`[data-id="${id}"]`);
      card && card.querySelectorAll('.mask-date').forEach(applyDMYMask_);
      const horaEl = card && card.querySelector('.hora');
      if (horaEl) applyHourMask_(horaEl);
      const ci = card && card.querySelector('.checkin');
      const co = card && card.querySelector('.checkout');
      if (ci) ci.addEventListener('blur', ()=>enforceDateOrder_(card));
      if (co) co.addEventListener('blur', ()=>enforceDateOrder_(card));
      const box0 = card && card.querySelector('.colabs-list');
      if (box0) box0.insertAdjacentHTML('beforeend', inputColab(colabOptionsHtml, false));
    }

    addReserva(); // primeira automática

    // aplica máscara dd/MM/aaaa nos campos de data
    container.querySelectorAll('.mask-date').forEach(applyDMYMask_);

    container.addEventListener("click", (e) => {
      const idRemove = e.target.getAttribute("data-remove");
      if (idRemove) {
        reservasEl.querySelector(`[data-id="${idRemove}"]`)?.remove();
      }

      const idAdd = e.target.getAttribute("data-addcolab");
      if (idAdd) {
        const box = reservasEl.querySelector(`[data-id="${idAdd}"] .colabs-list`);
        box.insertAdjacentHTML("beforeend", inputColab(colabOptionsHtml, true));
      }

      if (e.target.classList.contains("remove-colab")) {
        const card = e.target.closest(".reserva-card");
        const listEl = card ? card.querySelectorAll(".colab-item") : [];
        if (listEl && listEl.length <= 1) {
          // nunca fica sem colaborador — limpa seleção
          const sel = e.target.closest(".colab-item")?.querySelector("select");
          if (sel) sel.value = "";
        } else {
          e.target.closest(".colab-item").remove();
        }
      }
    });

    container.querySelector("#addReserva").onclick = addReserva;

    container.querySelector("#enviar").onclick = async () => {
      const reservas = [];

      reservasEl.querySelectorAll(".reserva-card").forEach(card => {
        enforceDateOrder_(card);
        const colaboradores = [];
        card.querySelectorAll(".colab-item select").forEach(sel => {
          const v = String(sel.value || "").trim();
          if (v) colaboradores.push(v);
        });

        reservas.push({
          cidadeUF: card.querySelector(".cidade").value,
          tipo: card.querySelector(".tipo").value,
          horaChegada: normalizeHour_(card.querySelector(".hora").value),
          checkin: dmyToISO_(card.querySelector(".checkin").value),
          checkout: dmyToISO_(card.querySelector(".checkout").value),
          observacao: card.querySelector(".obs").value,
          colaboradores
        });
      });

      if (!reservas.length) { alert("Adicione ao menos 1 hospedagem."); return; }

      const semColab = reservas.find(r => !(r.colaboradores && r.colaboradores.length));
      if (semColab) { alert("Selecione ao menos 1 colaborador em cada hospedagem."); return; }

      const body = {
        module: "hospedagem",
        action: "SolicitarHospedagem",
        token,
        payload: { hospedagens: reservas }
      };

      try {
        const api = (window.API && typeof window.API.post === "function") ? window.API : null;
        if (!api) throw new Error("API indisponível");

        const j = await api.post(body);

        if (j && j.ok) {
          alert("Pedido criado: " + (j.pedidoId || ""));
          // ✅ atualiza "Meus pedidos" imediatamente (pra você enxergar o pedido)
          await refreshMeusPedidos_();
          // se quiser manter o comportamento antigo (voltar), descomente:
          // if (opts.onBack) opts.onBack();
        } else {
          alert((j && (j.error || j.message)) || "Erro ao salvar");
        }
      } catch (err) {
        const msg = (err && err.message) ? String(err.message) : "Erro de conexão";
        const first = msg.split("\n")[0].trim();
        alert(first || "Erro de conexão");
      }
    };

    // ✅ auto-carrega ao abrir a tela
    refreshMeusPedidos_();
  }

  window.HOSPEDAGEM_AVULSA = { openHome: mount };

})();
