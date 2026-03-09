/* painel-web/assets/js/modules/adm_conferencia/module.js
 * Export compatível com loader antigo:
 *   window.ADM_CONFERENCIA.mount(root)
 * E compatível com loader novo:
 *   window.ADM_MODULES.conferencia.mount(root)
 */

(() => {
  "use strict";

  const $ = (sel, root=document) => root.querySelector(sel);
  const safeStr = (v) => (v == null ? "" : String(v));

  function pad2(n){ return String(n).padStart(2,"0"); }
  function fmtDMY(d){ return `${pad2(d.getDate())}/${pad2(d.getMonth()+1)}/${d.getFullYear()}`; }
  function todayDMY(){ return fmtDMY(new Date()); }
  function daysAgoDMY(n){ const d=new Date(); d.setDate(d.getDate()-n); return fmtDMY(d); }

  function getToken(){
    try{ if (window.AUTH?.getToken) { const t=window.AUTH.getToken(); if(t) return String(t).trim(); } }catch(_){}
    try{ if (window.AUTH?.getAuth) { const a=window.AUTH.getAuth(); if(a?.token) return String(a.token).trim(); } }catch(_){}
    try{ const raw=localStorage.getItem("g1000_auth"); if(raw){ const a=JSON.parse(raw); if(a?.token) return String(a.token).trim(); } }catch(_){}
    try{ const t=localStorage.getItem("g1000_token"); if(t) return String(t).trim(); }catch(_){}
    return "";
  }

  async function apiAdm(action, payload={}){
    if (!window.API?.post) throw new Error("API.post não encontrado (ordem dos scripts).");
    const token = getToken();

    // padrão novo do seu router/worker: {module:'adm', action:'...', token, ...}
    const res = await window.API.post(action, { module:"adm", action, token, ...payload });

    if (res && res.ok === false) throw new Error(res.error || res.message || "Erro no backend");
    return res || {};
  }

  function setStatus(el, msg, kind="info"){
    el.textContent = msg || "";
    el.dataset.kind = kind;
  }

  function uniqSorted(arr){
    const set = new Set();
    (arr||[]).forEach(v => { const s=safeStr(v).trim(); if(s) set.add(s); });
    return Array.from(set).sort((a,b)=>a.localeCompare(b,"pt-BR"));
  }

  function fillSelect(sel, items, keep=true){
    const cur = keep ? sel.value : "Todas";
    sel.innerHTML = "";
    sel.appendChild(new Option("Todas","Todas"));
    (items||[]).forEach(v => sel.appendChild(new Option(v,v)));
    if (keep && Array.from(sel.options).some(o=>o.value===cur)) sel.value = cur;
  }

  function badgeSIM(v){
    // aceita: "SIM", 1, "1", true
    const s = safeStr(v).trim().toUpperCase();
    const on = (s === "SIM" || s === "1" || v === 1 || v === true);
    return `<span class="chip ${on?"on":"off"}">${on?"SIM":"-"}</span>`;
  }

  function cellText(v){
    const s = safeStr(v).trim();
    return s ? s : "—";
  }

  // Moeda BRL: 0/vazio => "R$ -,00"
  function moneyBRL(v){
    if (v == null || v === "") return "R$ -,00";
    // já vem número na maioria dos casos, mas aceita string "20,5" etc.
    let n;
    if (typeof v === "number") n = v;
    else {
      const raw = safeStr(v).trim()
        .replace(/\./g, "")        // milhar
        .replace(",", ".")         // decimal
        .replace(/[^0-9\-\.]/g, "");
      n = Number(raw);
    }
    if (!isFinite(n) || n <= 0) return "R$ -,00";
    try {
      return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);
    } catch (e) {
      // fallback bem simples
      const s = n.toFixed(2).replace(".", ",");
      return "R$ " + s;
    }
  }

  function applyBusca(rows, q){
    const s = safeStr(q).trim().toLowerCase();
    if (!s) return rows;
    return rows.filter(r => {
      const blob = [
        r.data, r.colaborador, r.estadia, r.desl, r.extras,
        r.recarga, r.lavagem, r.passagem,
        r.coordenacao, r.conferente
      ].map(x=>safeStr(x).toLowerCase()).join(" ");
      return blob.includes(s);
    });
  }


  function parseDMY_(s){
    const m = String(s||"").trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!m) return 0;
    const d = Number(m[1]), mo = Number(m[2]), y = Number(m[3]);
    return new Date(y, mo-1, d).getTime() || 0;
  }

  function sortRows_(rows, mode){
    const arr = (rows||[]).slice();
    const md = String(mode||"data");
    const cmpStr = (a,b) => String(a||"").localeCompare(String(b||""), "pt-BR", {sensitivity:"base"});
    arr.sort((A,B)=>{
      if (md === "supervisao"){
        const s = cmpStr(A.supervisao, B.supervisao);
        if (s) return s;
        const c = cmpStr(A.colaborador, B.colaborador);
        if (c) return c;
        return parseDMY_(A.data) - parseDMY_(B.data);
      }
      if (md === "colaborador"){
        const c = cmpStr(A.colaborador, B.colaborador);
        if (c) return c;
        return parseDMY_(A.data) - parseDMY_(B.data);
      }
      const d = parseDMY_(A.data) - parseDMY_(B.data);
      if (d) return d;
      return cmpStr(A.colaborador, B.colaborador);
    });
    return arr;
  }

  // Aceita contratos diferentes do backend (snake/lowercase vs Title Case)
  function normalizeRow_(r){
    const o = Object.assign({}, r || {});

    // Produção (novo): Producao / ProducaoTons
    if (o.producao == null){
      if (o.Producao != null) o.producao = o.Producao;
      else if (o.ProducaoTons != null) o.producao = o.ProducaoTons;
      else if (o.producaoTons != null) o.producao = o.producaoTons;
    }

    // chaves comuns que variam no backend
    if (o.data == null) o.data = o.DataReferencia ?? o.dataRef ?? o.Data ?? o.data;
    if (o.colaborador == null) o.colaborador = o.Colaborador ?? o.Funcionario ?? o["Funcionário"] ?? o.colaborador;
    if (o.coordenacao == null) o.coordenacao = o["Coordenação"] ?? o.Coordenacao ?? o.coordenacao;
    if (o.conferente == null) o.conferente = o.Conferente ?? o.conferente;

    // Alimentação (alguns backends mandam *_Valor em vez de SIM)
    if (o.cafe == null && o.Cafe_Valor != null) o.cafe = (Number(o.Cafe_Valor) > 0) ? "SIM" : "";
    if (o.almoco == null && o.Almoco_Valor != null) o.almoco = (Number(o.Almoco_Valor) > 0) ? "SIM" : "";
    if (o.janta == null && o.Janta_Valor != null) o.janta = (Number(o.Janta_Valor) > 0) ? "SIM" : "";

    const bool01ToSIM_ = (v)=>{
      const s = String(v==null? "" : v).trim();
      if (!s) return "";
      const u = s.toUpperCase();
      if (u === "SIM" || u === "S" || s === "1") return "SIM";
      if (u === "NAO" || u === "N" || u === "N/A" || s === "0") return "";
      const n = Number(s.replace(",", "."));
      return (isFinite(n) && n > 0) ? "SIM" : "";
    };
    if (o.cafe != null)   o.cafe   = bool01ToSIM_(o.cafe);
    if (o.almoco != null) o.almoco = bool01ToSIM_(o.almoco);
    if (o.janta != null)  o.janta  = bool01ToSIM_(o.janta);

    return o;
  }

  function normalizeRows_(rows){
    return (rows || []).map(normalizeRow_);
  }

  function badgeProducao(v){
    // Novo contrato: pode vir "FOB" ou número (tons) ou vazio
    if (v == null || v === "") return `<span class="chip">—</span>`;

    // number
    if (typeof v === "number"){
      if (!isFinite(v)) return `<span class="chip">—</span>`;
      const txt = (Math.abs(v) < 1e-9) ? "FOB" : v.toFixed(2).replace(".", ",");
      return `<span class="chip ${txt === "FOB" ? "" : "on"}">${txt}</span>`;
    }

    const s = String(v).trim();
    const up = s.toUpperCase();
    if (!s) return `<span class="chip">—</span>`;
    if (up === "FOB") return `<span class="chip">FOB</span>`;
    if (up === "—" || up === "N/A") return `<span class="chip">—</span>`;

    // tenta parsear tons ("298,12" ou "298.12")
    const n = Number(s.replace(/\./g, "").replace(",", "."));
    if (isFinite(n)){
      const txt = (Math.abs(n) < 1e-9) ? "FOB" : n.toFixed(2).replace(".", ",");
      return `<span class="chip ${txt === "FOB" ? "" : "on"}">${txt}</span>`;
    }

    // legado (SIM/NÃO)
    const yes = up === "SIM" || up === "S" || up === "OK" || up === "1" || v === true;
    const no  = up === "NAO" || up === "NÃO" || up === "N" || up === "0" || v === false;
    const txt = yes ? "SIM" : (no ? "NÃO" : s);
    return `<span class="chip ${yes ? "on" : (no ? "err" : "")}">${txt}</span>`;
  }

  function sumNum(v){
    if (v == null || v === "" || v === "—" || v === "N/A") return 0;
    const s = String(v).trim().replace(/\./g," ").replace(/\s+/g,"").replace(",",".");
    const n = Number(s);
    return isFinite(n) ? n : 0;
  }

  function isSim(v){
    return safeStr(v).trim().toUpperCase() === "SIM";
  }

  function groupByColaborador(rows){
    const map = new Map();
    (rows||[]).forEach(r => {
      const key = safeStr(r.colaborador).trim();
      if (!key) return;
      if (!map.has(key)){
        map.set(key, {
          colaborador: key,
          dias: 0,
          cafeSim: 0,
          almocoSim: 0,
          jantaSim: 0,
          recarga: 0,
          lavagem: 0,
          passagem: 0,
          extrasList: [],
          datas: new Set(),
          tons: 0,
          hasProd: false,
          supervisao: "",
          coordenacao: "",
          minDateTs: 0,
        });
      }
      const g = map.get(key);
      if (!g.supervisao) g.supervisao = safeStr(r.supervisao).trim();
      if (!g.coordenacao) g.coordenacao = safeStr(r.coordenacao).trim();
      const d = safeStr(r.data).trim();
      const ts = parseDMY_(d);
      if (ts && (!g.minDateTs || ts < g.minDateTs)) g.minDateTs = ts;
      if (d && !g.datas.has(d)) { g.datas.add(d); g.dias++; }
      if (isSim(r.cafe)) g.cafeSim++;
      if (isSim(r.almoco)) g.almocoSim++;
      if (isSim(r.janta)) g.jantaSim++;
      g.recarga  += sumNum(r.recarga);
      g.lavagem  += sumNum(r.lavagem);
      g.passagem += sumNum(r.passagem);
      const ex = safeStr(r.extras).trim();
      if (ex && ex !== "—") g.extrasList.push(ex);

      // produção (tons): soma quando houver
      const p = r.producao;
      if (p != null && String(p).trim() && String(p).trim() !== "—") g.hasProd = true;
      g.tons += sumNum(p);
    });

    const out = Array.from(map.values()).map(g => {
      const extras = g.extrasList.length
        ? (g.extrasList.slice(0,3).join(" | ") + (g.extrasList.length>3 ? ` (+${g.extrasList.length-3})` : ""))
        : "—";
      return {
        data: `${g.dias} dia(s)` ,
        supervisao: g.supervisao,
        coordenacao: g.coordenacao,
        colaborador: g.colaborador,
        producao: g.hasProd ? (Math.abs(g.tons) < 1e-9 ? "FOB" : g.tons.toFixed(2).replace(".", ",")) : "—",
        estadia: "—",
        cafe: `${g.cafeSim}/${g.dias}`,
        almoco: `${g.almocoSim}/${g.dias}`,
        janta: `${g.jantaSim}/${g.dias}`,
        desl: "—",
        recarga: g.recarga ? g.recarga.toFixed(2).replace(".",",") : "0,00",
        lavagem: g.lavagem ? g.lavagem.toFixed(2).replace(".",",") : "0,00",
        passagem: g.passagem ? g.passagem.toFixed(2).replace(".",",") : "0,00",
        extras,
        _isGroup: true,
      };
    });

    out.sort((a,b)=>a.colaborador.localeCompare(b.colaborador,"pt-BR"));
    return out;
  }

  function badgeFrac(v){
    const s = safeStr(v).trim();
    return `<span class="chip">${s || "—"}</span>`;
  }

  function renderTable(tbody, rows, grouped=false, root=null){
    tbody.innerHTML = "";
    if (!rows.length){
      tbody.innerHTML = `<tr><td class="muted" colspan="12">0 registro(s) no período</td></tr>`;
      return;
    }

    tbody.innerHTML = rows.map(r => `
      <tr ${r._isGroup ? `data-group="1" data-colab="${escAttr(r.colaborador)}"` : ""}>
        <td>${cellText(r.data)}</td>
        <td class="w-colab">${grouped && r._isGroup
          ? `<button class="linkColab" type="button" data-colab="${escAttr(r.colaborador)}">${escapeHtml(cellText(r.colaborador))}</button>`
          : cellText(r.colaborador)
        }</td>
        <td>${grouped ? cellText(r.producao) : badgeProducao(r.producao ?? r.hasProducao)}</td>
        <td>${cellText(r.estadia)}</td>
        <td>${grouped ? badgeFrac(r.cafe) : badgeSIM(r.cafe)}</td>
        <td>${grouped ? badgeFrac(r.almoco) : badgeSIM(r.almoco)}</td>
        <td>${grouped ? badgeFrac(r.janta) : badgeSIM(r.janta)}</td>
        <td>${cellText(r.desl)}</td>
        <td class="num">${moneyBRL(r.recarga)}</td>
        <td class="num">${moneyBRL(r.lavagem)}</td>
        <td class="num">${moneyBRL(r.passagem)}</td>
        <td class="w-extras">${cellText(r.extras)}</td>
      </tr>
    `).join("");

    // clique para detalhar quando agrupado
    if (grouped && root){
      tbody.querySelectorAll('.linkColab').forEach(btn => {
        btn.addEventListener('click', () => {
          const colab = btn.getAttribute('data-colab') || '';
          toggleGroupDetails_(tbody, root, colab);
        });
      });
    }
  }

  function escAttr(s){
    return String(s || "").replace(/&/g,"&amp;").replace(/"/g,"&quot;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
  }
  function escapeHtml(s){
    return String(s || "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
  }

  function toggleGroupDetails_(tbody, root, colab){
    const key = safeStr(colab).trim();
    if (!key) return;

    // remove detalhe existente do mesmo colaborador
    const existing = tbody.querySelector(`tr.detailRow[data-colab="${CSS.escape(key)}"]`);
    if (existing){ existing.remove(); return; }

    // fecha outros detalhes abertos
    tbody.querySelectorAll('tr.detailRow').forEach(tr => tr.remove());

    const base = root._confBaseRows || [];
    const items = base.filter(r => safeStr(r.colaborador).trim() === key);
    if (!items.length) return;

    const mini = `
      <div style="padding:10px 10px 2px;">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:8px;">
          <b style="font-size:13px;">${escapeHtml(key)}</b>
          <span class="muted" style="font-size:12px;font-weight:900;">${items.length} registro(s)</span>
        </div>
        <div style="overflow:auto;border:1px solid rgba(148,163,184,.18);border-radius:12px;">
          <table style="width:100%;border-collapse:separate;border-spacing:0;min-width:900px;">
            <thead>
              <tr>
                <th style="text-align:left;padding:8px;border-bottom:1px solid rgba(148,163,184,.18);position:sticky;top:var(--stickyFiltersH,0px);background:rgba(15,23,42,.95);">Data</th>
                <th style="text-align:left;padding:8px;border-bottom:1px solid rgba(148,163,184,.18);position:sticky;top:var(--stickyFiltersH,0px);background:rgba(15,23,42,.95);">Produção</th>
                <th style="text-align:left;padding:8px;border-bottom:1px solid rgba(148,163,184,.18);position:sticky;top:var(--stickyFiltersH,0px);background:rgba(15,23,42,.95);">Estadia</th>
                <th style="text-align:left;padding:8px;border-bottom:1px solid rgba(148,163,184,.18);position:sticky;top:var(--stickyFiltersH,0px);background:rgba(15,23,42,.95);">Café</th>
                <th style="text-align:left;padding:8px;border-bottom:1px solid rgba(148,163,184,.18);position:sticky;top:var(--stickyFiltersH,0px);background:rgba(15,23,42,.95);">Almoço</th>
                <th style="text-align:left;padding:8px;border-bottom:1px solid rgba(148,163,184,.18);position:sticky;top:var(--stickyFiltersH,0px);background:rgba(15,23,42,.95);">Janta</th>
                <th style="text-align:left;padding:8px;border-bottom:1px solid rgba(148,163,184,.18);position:sticky;top:var(--stickyFiltersH,0px);background:rgba(15,23,42,.95);">Desl</th>
                <th style="text-align:right;padding:8px;border-bottom:1px solid rgba(148,163,184,.18);position:sticky;top:var(--stickyFiltersH,0px);background:rgba(15,23,42,.95);">Recarga</th>
                <th style="text-align:right;padding:8px;border-bottom:1px solid rgba(148,163,184,.18);position:sticky;top:var(--stickyFiltersH,0px);background:rgba(15,23,42,.95);">Lavagem</th>
                <th style="text-align:right;padding:8px;border-bottom:1px solid rgba(148,163,184,.18);position:sticky;top:var(--stickyFiltersH,0px);background:rgba(15,23,42,.95);">Passagem</th>
                <th style="text-align:left;padding:8px;border-bottom:1px solid rgba(148,163,184,.18);position:sticky;top:var(--stickyFiltersH,0px);background:rgba(15,23,42,.95);">Extras</th>
              </tr>
            </thead>
            <tbody>
              ${items.map(it => `
                <tr>
                  <td style="padding:8px;border-bottom:1px solid rgba(148,163,184,.10);">${escapeHtml(cellText(it.data))}</td>
                  <td style="padding:8px;border-bottom:1px solid rgba(148,163,184,.10);">${badgeProducao(it.producao)}</td>
                  <td style="padding:8px;border-bottom:1px solid rgba(148,163,184,.10);">${escapeHtml(cellText(it.estadia))}</td>
                  <td style="padding:8px;border-bottom:1px solid rgba(148,163,184,.10);">${badgeSIM(it.cafe)}</td>
                  <td style="padding:8px;border-bottom:1px solid rgba(148,163,184,.10);">${badgeSIM(it.almoco)}</td>
                  <td style="padding:8px;border-bottom:1px solid rgba(148,163,184,.10);">${badgeSIM(it.janta)}</td>
                  <td style="padding:8px;border-bottom:1px solid rgba(148,163,184,.10);">${escapeHtml(cellText(it.desl))}</td>
                  <td style="padding:8px;border-bottom:1px solid rgba(148,163,184,.10);text-align:right;">${escapeHtml(cellText(it.recarga))}</td>
                  <td style="padding:8px;border-bottom:1px solid rgba(148,163,184,.10);text-align:right;">${escapeHtml(cellText(it.lavagem))}</td>
                  <td style="padding:8px;border-bottom:1px solid rgba(148,163,184,.10);text-align:right;">${escapeHtml(cellText(it.passagem))}</td>
                  <td style="padding:8px;border-bottom:1px solid rgba(148,163,184,.10);">${escapeHtml(cellText(it.extras))}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;

    const anchor = tbody.querySelector(`tr[data-group="1"][data-colab="${CSS.escape(key)}"]`);
    if (!anchor) return;

    const tr = document.createElement('tr');
    tr.className = 'detailRow';
    tr.setAttribute('data-colab', key);
    tr.innerHTML = `<td colspan="12" style="background:rgba(2,6,23,.35);">${mini}</td>`;
    anchor.insertAdjacentElement('afterend', tr);
  }

  function viewShow(root, name){
    root.querySelectorAll("[data-view]").forEach(v => v.classList.add("hidden"));
    const v = root.querySelector(`[data-view="${name}"]`);
    if (v) v.classList.remove("hidden");
  }

  async function loadDropdowns(root, keep=true){
    const selCoord = $("#confCoord", root);
    const selConf  = $("#confConf", root);

    const [rc, rf] = await Promise.all([
      apiAdm("adm_conferencia_listCoordenacoes", {}),
      apiAdm("adm_conferencia_listConferentes", {})
    ]);

    fillSelect(selCoord, uniqSorted(rc.coordenacoes || []), keep);
    fillSelect(selConf,  uniqSorted(rf.conferentes  || []), keep);
  }

  async function runHistorico(root){
    const status = $("#confStatus", root);
    const tbody  = $("#confTbody", root);

    const dataIni = $("#confIni", root).value;
    const dataFim = $("#confFim", root).value;
    const coord   = $("#confCoord", root).value;
    const conf    = $("#confConf", root).value;

    setStatus(status, "Carregando...", "info");

    try{
      const res = await apiAdm("adm_getHistoricoPeriodo", {
        dataIni, dataFim,
        coordenacao: coord,
        conferente: conf
      });

      const normalized = normalizeRows_(res.data || []);
      // caminho preferencial (usa o cache/renderer do mount)
      if (typeof root.__admConfSetCache === "function") {
        root.__admConfSetCache(normalized);
      } else {
        root._confFetchedRows = normalized;
        renderFromState_(root);
      }
    }catch(e){
      console.error(e);
      renderTable(tbody, []);
      setStatus(status, `Falha: ${safeStr(e.message||e)}`, "err");
    }
  }

  function renderFromState_(root){
    const status = $("#confStatus", root);
    const tbody  = $("#confTbody", root);

    const rows = root._confFetchedRows || [];

    const busca   = $("#confBusca", root).value;
    const grouped = !!$("#confGroup", root)?.checked;
    const sortBy  = ($("#confSort", root)?.value || "data");

    let filtered = applyBusca(rows, busca);
    filtered = sortRows_(filtered, sortBy);
    // base para detalhamento quando estiver agrupado
    root._confBaseRows = filtered;

    const viewRows = grouped ? groupByColaborador(filtered) : filtered;
    renderTable(tbody, viewRows, grouped, root);

    const suffix = (safeStr(busca).trim()) ? " (filtrado)" : "";
    setStatus(status, `OK • ${viewRows.length} registro(s)${suffix}`, "ok");
  }

  function injectUI(root){
    root.innerHTML = `
      <style>
        .hidden{ display:none!important; }
        .wrap{ color:#e5e7eb; }

        .topbar{
          position: sticky;
          top: 0;
          z-index: 10;
          display:flex; align-items:center; gap:10px;
          background:rgba(15,23,42,.72);
          border:1px solid rgba(148,163,184,.18);
          border-radius:16px;
          padding:10px 12px;
          backdrop-filter: blur(10px);
          margin-bottom:12px;
        }
        .topbar h2{ margin:0; font-size:15px; font-weight:900; letter-spacing:.2px; }
        .sp{ flex:1; }
        .btn{
          border:0; border-radius:12px; padding:10px 12px;
          font-weight:900; cursor:pointer;
        }
        .btn.ghost{ background:rgba(255,255,255,.10); color:#e5e7eb; }
        .btn.primary{ background:#166534; color:#fff; }

        .cards{ display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px; }
        @media (max-width: 980px){ .cards{ grid-template-columns:1fr; } }

        .card{
          background:rgba(15,23,42,.72);
          border:1px solid rgba(148,163,184,.18);
          border-radius:18px;
          padding:14px;
          box-shadow: 0 20px 40px rgba(0,0,0,.30);
          cursor:pointer;
        }
        .card:hover{ border-color: rgba(34,197,94,.35); }
        .card .t{ margin:0 0 4px; font-weight:900; }
        .card .d{ margin:0; color:#94a3b8; font-weight:700; font-size:13px; }

        .panel{
          background:rgba(15,23,42,.72);
          border:1px solid rgba(148,163,184,.18);
          border-radius:18px;
          padding:14px;
          box-shadow: 0 20px 40px rgba(0,0,0,.30);
          display:flex;
          flex-direction:column;
          height: calc(100vh - 240px);
          overflow: auto; /* scroll do painel (sticky funciona aqui) */
        }

        /* barra fixa (filtros/status) para navegar melhor */
        .stickyFilters{
          position: sticky;
          top: 0;
          z-index: 6;
          background: rgba(15,23,42,.92);
          border: 1px solid rgba(148,163,184,.12);
          border-radius: 16px;
          padding: 12px;
          margin-bottom: 10px;
          backdrop-filter: blur(10px);
        }

        .grid{
          display:grid;
          grid-template-columns: repeat(6, minmax(0,1fr));
          gap:10px;
          margin-bottom:10px;
        }
        @media (max-width: 1100px){ .grid{ grid-template-columns:repeat(2,minmax(0,1fr)); } }

        label{ display:block; font-size:12px; font-weight:900; color:#cbd5e1; margin:0 0 6px; }

        input, select{
          width:100%;
          padding:10px 10px;
          border-radius:12px;
          border:1px solid rgba(148,163,184,.22);
          background:#0f172a;
          color:#e5e7eb;
          outline:none;
          box-shadow: inset 0 0 0 1px rgba(0,0,0,.12);
          color-scheme: dark;
        }
        select option{ background:#0f172a; color:#e5e7eb; }

        .status{ font-weight:900; font-size:13px; margin:6px 0 10px; }
        .status[data-kind="ok"]{ color:#22c55e; }
        .status[data-kind="err"]{ color:#ef4444; }
        .status[data-kind="info"]{ color:#cbd5e1; }

        .tableWrap{
          overflow: visible;
          border-radius:14px;
          border:1px solid rgba(148,163,184,.18);
          flex: 1;
        }

        table{ width:100%; border-collapse:separate; border-spacing:0; min-width: 1100px; }
        thead th{
          position: sticky;
          top: var(--stickyFiltersH, 0px);
          z-index: 5;
          background: rgba(15,23,42,.92);
          color:#e5e7eb;
          text-align:left;
          font-size:12px;
          padding:10px 10px;
          border-bottom:1px solid rgba(148,163,184,.18);
          white-space: nowrap;
        }
        tbody td{
          padding:10px 10px;
          border-bottom:1px solid rgba(148,163,184,.10);
          color:#e5e7eb;
          font-size:13px;
          vertical-align:top;
        }
        tbody tr:nth-child(even) td{ background: rgba(2,6,23,.25); }

        .muted{ color:#94a3b8; font-weight:900; }

        .linkColab{
          background: none;
          border: 0;
          padding: 0;
          color: #e5e7eb;
          font-weight: 900;
          cursor: pointer;
          text-decoration: underline;
          text-underline-offset: 3px;
        }
        .linkColab:hover{ color: #22c55e; }

        .chip{
          display:inline-flex; align-items:center; justify-content:center;
          min-width:40px;
          padding:6px 10px;
          border-radius:999px;
          font-weight:900;
          font-size:12px;
          border:1px solid rgba(148,163,184,.22);
          background: rgba(148,163,184,.08);
          color:#cbd5e1;
        }
        .chip.on{
          background: rgba(22,101,52,.55);
          border-color: rgba(34,197,94,.35);
          color:#dcfce7;
        }
        .chip.err{
          background: rgba(185,28,28,.35);
          border-color: rgba(239,68,68,.35);
          color:#fee2e2;
        }

        .num{ text-align:right; font-variant-numeric: tabular-nums; white-space:nowrap; }
        .w-colab{ min-width: 280px; }
        .w-extras{ min-width: 280px; white-space: pre-wrap; color:#cbd5e1; }
      </style>

      <div class="wrap">
        <div data-view="menu">
          <div class="topbar">
            <h2>Conferência (ADM)</h2>
          </div>

          <div class="cards">
            <div class="card" id="cardDia">
              <p class="t">Programação do dia</p>
              <p class="d">Consulta rápida de um dia específico.</p>
            </div>
            <div class="card" id="cardHist">
              <p class="t">Histórico</p>
              <p class="d">Consulta por período com filtros.</p>
            </div>
          </div>
        </div>

        <div data-view="tabela" class="hidden">
          <div class="topbar">
            <button class="btn ghost" id="btnVoltar">← Voltar</button>
            <h2 id="confTitulo">Histórico</h2>
            <div class="sp"></div>
            <button class="btn ghost" id="btnRecarregar">Recarregar listas</button>
          </div>

          <div class="panel">
            <div class="stickyFilters">
              <div class="grid">
                <div>
                <label>Data inicial</label>
                <input id="confIni" placeholder="dd/MM/aaaa">
                </div>
                <div>
                <label>Data final</label>
                <input id="confFim" placeholder="dd/MM/aaaa">
                </div>
                <div>
                <label>Coordenação</label>
                <select id="confCoord"><option>Todas</option></select>
                </div>
                <div>
                <label>Conferente</label>
                <select id="confConf"><option>Todas</option></select>
                </div>
                <div>
                <label>Busca</label>
                <input id="confBusca" placeholder="colaborador, extras, deslocamento...">
                </div>
              <div style="display:flex; flex-direction:column; gap:8px; justify-content:flex-end;">
                <label style="display:flex; align-items:center; gap:10px; margin:0; user-select:none;">
                  <input id="confGroup" type="checkbox" style="width:18px; height:18px; margin:0;" />
                  <span style="font-weight:900; color:#cbd5e1;">Agrupar por colaborador</span>
                </label>
                <button class="btn primary" id="btnAtualizar" style="width:100%;">Atualizar</button>
              </div>
              </div>

              <div class="status" id="confStatus" data-kind="info" style="margin:8px 0 0;"></div>
            </div>

            <div class="tableWrap">
              <table>
                <thead>
                  <tr>
                    <th>Data</th>
                    <th>Colaborador</th>
                    <th>Produção</th>
                    <th>Estadia</th>
                    <th>Café</th>
                    <th>Almoço</th>
                    <th>Janta</th>
                    <th>Desl</th>
                    <th>Recarga</th>
                    <th>Lavagem</th>
                    <th>Passagem</th>
                    <th>Extras</th>
                  </tr>
                </thead>
                <tbody id="confTbody"></tbody>
              </table>
            </div>

          </div>
        </div>
      </div>
    `;
  }

  async function mount(root){
    injectUI(root);

    // Corrige sobreposição: header da tabela fica abaixo da barra de filtros
    function updateStickyOffsets(){
      const sf = root.querySelector('.stickyFilters');
      if (!sf) {
        root.style.setProperty('--stickyFiltersH', `0px`);
        return;
      }
      const r = sf.getBoundingClientRect();
      const cs = window.getComputedStyle(sf);
      const mb = parseFloat(cs.marginBottom || "0") || 0;
      const h = (r?.height || 0) + mb;
      root.style.setProperty('--stickyFiltersH', `${Math.ceil(h)}px`);
    }
    updateStickyOffsets();
    window.addEventListener('resize', updateStickyOffsets);

    const cardDia = $("#cardDia", root);
    const cardHist = $("#cardHist", root);

    const btnVoltar = $("#btnVoltar", root);
    const btnAtualizar = $("#btnAtualizar", root);
    const btnRecarregar = $("#btnRecarregar", root);
    const titulo = $("#confTitulo", root);

    const ini = $("#confIni", root);
    const fim = $("#confFim", root);

    let mode = "historico";

    async function enterTabela(newMode){
      mode = newMode;

      if (mode === "dia") {
        titulo.textContent = "Programação do dia";
        ini.value = todayDMY();
        fim.value = todayDMY();
      } else {
        titulo.textContent = "Histórico";
        ini.value = daysAgoDMY(7);
        fim.value = todayDMY();
      }

      viewShow(root, "tabela");
      setStatus($("#confStatus", root), "Carregando listas...", "info");
      await loadDropdowns(root, true);
      updateStickyOffsets();
      await runHistorico(root);
    }

    function back(){ viewShow(root, "menu"); }

    cardDia.addEventListener("click", ()=>enterTabela("dia"));
    cardHist.addEventListener("click", ()=>enterTabela("historico"));
    btnVoltar.addEventListener("click", back);

    // cache local para busca instantânea (sem depender do botão Atualizar)
    let __lastRows = [];
    let __lastFiltered = [];

    function renderFromCache(){
      const status = $("#confStatus", root);
      const q = $("#confBusca", root)?.value || "";
      const grouped = !!$("#confGroup", root)?.checked;

      const base = applyBusca(__lastRows, q);
      // base para detalhamento quando estiver agrupado
      root._confBaseRows = base;

      const rowsToRender = grouped ? groupByColaborador(base) : base;
      __lastFiltered = rowsToRender;

      renderTable($("#confTbody", root), rowsToRender, grouped, root);
      updateStickyOffsets();

      const suffix = (String(q||"").trim()) ? " (filtrado)" : "";
      setStatus(status, `OK • ${rowsToRender.length} registro(s)${suffix}`, "ok");
    }

    btnAtualizar.addEventListener("click", ()=>runHistorico(root));

    btnRecarregar.addEventListener("click", async ()=>{
      try{
        setStatus($("#confStatus", root), "Recarregando listas...", "info");
        await loadDropdowns(root, false);
        await runHistorico(root);
      }catch(e){
        setStatus($("#confStatus", root), `Falha: ${safeStr(e.message||e)}`, "err");
      }
    });

    // ✅ Busca instantânea (client-side) com debounce
    let tmr=null;
    $("#confBusca", root).addEventListener("input", ()=>{
      clearTimeout(tmr);
      tmr=setTimeout(()=>renderFromCache(), 120);
    });

    // re-render instantâneo ao alternar agrupamento
    $("#confGroup", root).addEventListener("change", ()=>renderFromCache());

    // expõe para o runHistorico atualizar cache sem acoplamento
    root.__admConfSetCache = (rows)=>{ __lastRows = normalizeRows_(rows||[]); renderFromCache(); };

    viewShow(root, "menu");
  }

  // ✅ Export que o seu loader está pedindo:
  window.ADM_CONFERENCIA = window.ADM_CONFERENCIA || {};
  window.ADM_CONFERENCIA.mount = mount;

  // ✅ Compat (se você migrar loader depois):
  window.ADM_MODULES = window.ADM_MODULES || {};
  window.ADM_MODULES.conferencia = { mount };
})();
