/**
 * assets/js/app.js
 * Painel Web — Gestor
 *
 * ✅ Corrige:
 * 1) Lista de supervisões (aceita array / objeto / string do backend)
 * 2) Sessão expirada: só limpa auth quando for REALMENTE expirada (inclui res.result.error)
 * 3) Salvar: envia itens no formato FLAT (campos da planilha) + números normalizados
 *
 * Mantém:
 * - A–E, lazy load de supervisões ao selecionar "Transferir"
 * - opção A: contexto por SUPERVISAO_LIBERADA (primeira liberada)
 */

/** =========================
 * Compat: Hospedagens por colaborador (pré-preencher Estadia)
 * - Alguns builds chamam carregarHospedagensPorNome_() dentro do carregarContexto()
 * - Se não existir, isso quebra o contexto inteiro.
 * ========================= */
if (typeof carregarHospedagensPorNome_ !== "function") {
  function carregarHospedagensPorNome_(ctx){
    try{
      if (!ctx) return {};
      // suporte a variações de nome
      return ctx.hospedagensPorNome || ctx.hospedagens_por_nome || ctx.hospedagens || {};
    }catch(_){
      return {};
    }
  }
}

// ✅ garante que o helper exista no escopo global também (evita "is not defined")
try{ if (typeof window !== "undefined") window.carregarHospedagensPorNome_ = carregarHospedagensPorNome_; }catch(_){ }

(() => {
  "use strict";

  
function __setupSalvarProgramacaoBtn(){
  try{
    const btn =
      document.getElementById('btnSalvarProg') ||
      document.getElementById('btnSalvarProgramacao') ||
      Array.from(document.querySelectorAll('button')).find(b => (b.textContent||'').toLowerCase().includes('salvar programação'));

    if(!btn) return;

    // base
    btn.classList.add('btn-save');
    // remove estilos antigos que fixavam verde
    btn.classList.remove('primary','btn-primary');
    btn.classList.remove('is-saved','is-progress');

    // estrutura premium (não duplica)
    if(!btn.querySelector('.btnp-label')){
      const label = (btn.textContent || 'Salvar programação').trim() || 'Salvar programação';
      btn.innerHTML = `<span class="btnp-label">${label}</span><span class="btnp-spin" aria-hidden="true"></span><span class="btnp-pct" aria-hidden="true">0%</span>`;
      btn.dataset.baseLabel = label;
    }
    if(!btn.querySelector('.btnp-pct')){
      const pct = document.createElement('span');
      pct.className = 'btnp-pct';
      pct.setAttribute('aria-hidden','true');
      pct.textContent = '0%';
      btn.appendChild(pct);
    }
    if(!btn.querySelector('.btnp-spin')){
      const sp = document.createElement('span');
      sp.className = 'btnp-spin';
      sp.setAttribute('aria-hidden','true');
      btn.insertBefore(sp, btn.querySelector('.btnp-pct'));
    }

    const setLabel = (txt)=>{
      const el = btn.querySelector('.btnp-label');
      if(el) el.textContent = txt;
      else btn.textContent = txt;
    };

    const setPct = (pct)=>{
      const el = btn.querySelector('.btnp-pct');
      if(!el) return;
      const v = Math.max(0, Math.min(100, Math.round(Number(pct)||0)));
      el.textContent = `${v}%`;
    };

    const setProgress = (pct, txt)=>{
      btn.classList.add('is-progress');
      btn.classList.remove('is-saved');
      btn.disabled = true;
      const v = Math.max(0, Math.min(100, Number(pct)||0));
      btn.style.setProperty('--p', `${v}%`);
      setPct(v);
      if(txt) setLabel(txt);
    };

    const resetBtn = ()=>{
      btn.classList.remove('is-progress','is-saved');
      btn.disabled = false;
      btn.style.removeProperty('--p');
      setPct(0);
      setLabel(btn.dataset.baseLabel || 'Salvar programação');
    };

    // quando qualquer input/select mudar, volta pro amarelo (dirty)
    const root = btn.closest('.card') || btn.closest('.panel') || document;
    const markDirty = () => {
      // se estava salvo, volta ao padrão
      if(btn.classList.contains('is-saved')){
        btn.classList.remove('is-saved');
        setLabel(btn.dataset.baseLabel || 'Salvar programação');
      }
    };
    root.addEventListener('input', markDirty, {capture:true});
    root.addEventListener('change', markDirty, {capture:true});

    // eventos globais disparados pelo salvarProgramacao()
    window.addEventListener('programacao:progress', (ev)=>{
      const d = (ev && ev.detail) ? ev.detail : {};
      setProgress(d.pct, d.label);
    });

    window.addEventListener('programacao:saved', ()=>{
      btn.classList.remove('is-progress');
      btn.classList.add('is-saved');
      btn.disabled = false;
      btn.style.setProperty('--p', '100%');
      setPct(100);
      setLabel('Programação salva ✔');
    });

    window.addEventListener('programacao:error', ()=>{
      resetBtn();
    });
  }catch(e){}
}

// 🔥 GitHub Pages: o script pode carregar depois do DOMContentLoaded.
// Então inicializa o botão AGORA se o DOM já estiver pronto.
try{
  window.__setupSalvarProgramacaoBtn = __setupSalvarProgramacaoBtn;
  const __bootSalvarBtn = () => { try{ __setupSalvarProgramacaoBtn(); }catch(_){ } };
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', __bootSalvarBtn, { once:true });
  else __bootSalvarBtn();
}catch(e){}
// ✅ Evita recarregar a página por submit de <form> (causa reset e volta pro login)
  document.addEventListener("submit", (ev)=>{ try{ ev.preventDefault(); }catch(_){} }, true);

  /***********************
   * HELPERS BÁSICOS
   ***********************/
  const $ = (id) => document.getElementById(id);

  function pad2_(n) { return String(n).padStart(2, "0"); }

  function hojeDMY() {
    const d = new Date();
    return `${pad2_(d.getDate())}/${pad2_(d.getMonth() + 1)}/${d.getFullYear()}`;
  }

  function normStr(v) { return String(v ?? "").trim(); }

  function norm_(v){
    return String(v||"")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim()
      .toLowerCase();
  }

  
  function normalizeNameMapKey_(s){
    return String(s || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .toUpperCase();
  }

function limpar(el) { if (el) el.innerHTML = ""; }

  function safeArr(v) { return Array.isArray(v) ? v : []; }

  function setBox(msg, type = "info") {
    const box = $("contextoBox");
    if (!box) return;
    const color = type === "err" ? "#ffb4b4" : type === "ok" ? "#b9ffcf" : "#b7c7dd";
    box.innerHTML = `<div class="mono" style="color:${color}">${msg}</div>`;
  }

  /***********************
   * AUTH
   ***********************/
  function getAuthSafe_() {
    try {
      if (window.AUTH && typeof window.AUTH.getAuth === "function") {
        const a = window.AUTH.getAuth();
        if (a) return a;
      }
    } catch (e) {}

    try {
      const raw = localStorage.getItem("g1000_auth");
      if (raw) return JSON.parse(raw);
    } catch (e) {}

    try {
      const token = localStorage.getItem("g1000_token");
      if (token) return { token };
    } catch (e) {}

    return null;
  }

  function clearAuthAndRedirect_() {
    try { localStorage.removeItem("g1000_auth"); } catch(e){}
    try { localStorage.removeItem("g1000_token"); } catch(e){}
    try { sessionStorage.removeItem("g1000_auth"); } catch(e){}
    try { sessionStorage.removeItem("g1000_token"); } catch(e){}
    const isGestor = /\/gestor\//i.test(window.location.pathname || "");
    window.location.href = isGestor ? "../index.html" : "index.html";
  }

  function getTokenMaybe() {
    const a = getAuthSafe_();
    if (a && a.token) return String(a.token);
    try { return localStorage.getItem("g1000_token") || ""; } catch(e){ return ""; }
  }

  /***********************
   * SUPERVISÕES
   ***********************/
  function _uniq_(arr) {
    const out = [];
    const seen = new Set();
    (arr || []).forEach(v => {
      const t = normStr(v);
      if (!t) return;
      const k = t.toLowerCase();
      if (seen.has(k)) return;
      seen.add(k);
      out.push(t);
    });
    return out;
  }

  function _sortPT_(arr) {
    return (arr || []).slice().sort((a, b) => a.localeCompare(b, "pt-BR", { sensitivity: "base" }));
  }

  function getSupervisoesLiberadasFromAuth_(auth){
    const u = auth && auth.user ? auth.user : (auth || {});
    const raw =
      (u.supervisao != null ? u.supervisao : null) ??
      (u.supervisao_liberada != null ? u.supervisao_liberada : null) ??
      (u.supervisaoLiberada != null ? u.supervisaoLiberada : null) ??
      (u.supervisoes != null ? u.supervisoes : null) ??
      (u.supervisoes_liberadas != null ? u.supervisoes_liberadas : null) ??
      (u.supervisoesLiberadas != null ? u.supervisoesLiberadas : null) ??
      (u.SUPERVISAO_LIBERADA != null ? u.SUPERVISAO_LIBERADA : null) ??
      (u["SUPERVISÃO_LIBERADA"] != null ? u["SUPERVISÃO_LIBERADA"] : null) ??
      (u["SUPERVISAO LIBERADA"] != null ? u["SUPERVISAO LIBERADA"] : null) ??
      (u["Supervisão liberada"] != null ? u["Supervisão liberada"] : null) ??
      (u["Supervisao liberada"] != null ? u["Supervisao liberada"] : null);

    const list = [];
    const push = (v)=>{
      const s = String(v||"").trim();
      if(!s) return;
      list.push(s);
    };

    if(Array.isArray(raw)){
      raw.forEach(push);
    } else if (raw && typeof raw === "object") {
      if(Array.isArray(raw.list)) raw.list.forEach(push);
      else Object.keys(raw).forEach(push);
    } else {
      String(raw || "")
        .split(/[;,\n]/g)
        .map(s=>s.trim())
        .filter(Boolean)
        .forEach(push);
    }

    const seen = new Set();
    return list.filter(s=>{
      const k = norm_(s);
      if(!k || seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }

  const LS_KEY_SUPS_TODAS = "g1000_supervisoes_todas_v2";

  function normalizeSupervisoesResponse_(raw){
    if (Array.isArray(raw)) return raw;
    if (raw && typeof raw === "object") {
      if (Array.isArray(raw.list)) return raw.list;
      return Object.keys(raw);
    }
    if (typeof raw === "string") {
      return raw.split(/[;,\n]/g).map(s=>s.trim()).filter(Boolean);
    }
    return [];
  }

  async function ensureSupervisoesTodas_() {
    if (window.estado && Array.isArray(window.estado.supervisoesTodas) && window.estado.supervisoesTodas.length) {
      return window.estado.supervisoesTodas;
    }

    try {
      const cached = JSON.parse(localStorage.getItem(LS_KEY_SUPS_TODAS) || "null");
      if (Array.isArray(cached) && cached.length) {
        window.estado.supervisoesTodas = cached;
        return cached;
      }
    } catch (_) {}

    const res = await apiPost({
      module: "despesas",
      action: "listarSupervisoesGestores",
      token: getTokenMaybe()
    });

    const list = normalizeSupervisoesResponse_(res?.supervisoes);
    const final = _sortPT_(_uniq_(list));

    try { localStorage.setItem(LS_KEY_SUPS_TODAS, JSON.stringify(final)); } catch (_) {}
    window.estado.supervisoesTodas = final;
    return final;
  }

  function getSupervisoesTransfer() {
    const st = window.estado || {};
    if (Array.isArray(st.supervisoesTodas) && st.supervisoesTodas.length) return st.supervisoesTodas;
    try {
      const cached = JSON.parse(localStorage.getItem(LS_KEY_SUPS_TODAS) || "null");
      if (Array.isArray(cached) && cached.length) {
        st.supervisoesTodas = cached;
        return cached;
      }
    } catch (_) {}
    return [];
  }

  function isSupTransferValida_(sup) {
    const s = normStr(sup);
    if (!s) return false;
    const all = getSupervisoesTransfer();
    return all.some(x => normStr(x).toLowerCase() === s.toLowerCase());
  }

  /***********************
   * DATAREF
   ***********************/
  function parseDMYToDate(value) {
    const parts = String(value || "").trim().split("/");
    if (parts.length !== 3) return null;
    const [dd, mm, yyyy] = parts.map(p => Number(p));
    if (!dd || !mm || !yyyy) return null;
    const d = new Date(yyyy, mm - 1, dd);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  function isDMY(s) {
    const str = String(s ?? "").trim();
    if (!/^\d{2}\/\d{2}\/\d{4}$/.test(str)) return false;
    const d = parseDMYToDate(str);
    if (!d) return false;
    const [dd, mm, yy] = str.split("/").map(n => parseInt(n, 10));
    return d.getFullYear() === yy && (d.getMonth() + 1) === mm && d.getDate() === dd;
  }

  function formatDMY(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
    return `${pad2_(date.getDate())}/${pad2_(date.getMonth() + 1)}/${date.getFullYear()}`;
  }

  function parseDataRef_(value) {
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      const dmy = formatDMY(value);
      const iso = `${value.getFullYear()}-${pad2_(value.getMonth() + 1)}-${pad2_(value.getDate())}`;
      return { dmy, iso, date: value };
    }

    const s = String(value || "").trim();
    if (!s) return null;

    if (isDMY(s)) {
      const d = parseDMYToDate(s);
      const [dd, mm, yyyy] = s.split("/").map(n => Number(n));
      const iso = `${yyyy}-${pad2_(mm)}-${pad2_(dd)}`;
      return { dmy: s, iso, date: d };
    }

    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) {
      const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
      if (!Number.isNaN(d.getTime())) {
        const dmy = formatDMY(d);
        const iso = `${m[1]}-${m[2]}-${m[3]}`;
        return { dmy, iso, date: d };
      }
    }

    if (!Number.isNaN(Number(s)) && s.length >= 8) {
      const d = new Date(Number(s));
      if (!Number.isNaN(d.getTime())) {
        const dmy = formatDMY(d);
        const iso = `${d.getFullYear()}-${pad2_(d.getMonth() + 1)}-${pad2_(d.getDate())}`;
        return { dmy, iso, date: d };
      }
    }

    return null;
  }

  function getDataRefAnterior(dataRef) {
    const d = parseDMYToDate(dataRef);
    if (!d) return "";
    d.setDate(d.getDate() - 1);
    return formatDMY(d);
  }

  function addDaysDMY_(dmy, days){
    const d = parseDMYToDate(dmy);
    if (!d) return "";
    const n = Math.max(0, Math.floor(Number(days||0)));
    d.setDate(d.getDate() + n);
    return formatDMY(d);
  }

  /***********************
   * API
   ***********************/
  function _msgToLower_(v){ return String(v || "").toLowerCase(); }

  function isSessionExpiredError_(res){
    const t1 = _msgToLower_(res?.error || res?.message);
    const t2 = _msgToLower_(res?.result?.error || res?.result?.message);
    const t = (t1 + " " + t2).trim();

    // ✅ Conservador: só derruba com sinais claros de token/sessão
    if (t.includes("token invál")) return true;
    if (t.includes("token inval")) return true;
    if (t.includes("unauthorized")) return true;
    if (t.includes("forbidden")) return true;
    if (t.includes("acesso negado")) return true;
    if (t.includes("sess") && t.includes("expir")) return true;

    return false;
  }


  async function apiPost(payload) {
    try {
      const act = String(payload?.action || "");
      const isLogin = (act === "loginPIN" || act === "loginAdminCPF");
      if (!isLogin && payload && typeof payload === "object" && !payload.token) {
        payload.token = getTokenMaybe();
      }
    } catch (_) {}

    let res;
    if (window.API && typeof window.API.post === "function") {
      res = await window.API.post(payload);
    } else {
      const url = window.WEBAPP_URL || "";
      if (!url) throw new Error("API.post não encontrado e WEBAPP_URL não configurado.");
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const txt = await r.text();
      try {
        res = JSON.parse(txt);
      } catch (e) {
        throw new Error(`Resposta não-JSON do backend: ${txt.slice(0, 160)}`);
      }
    }

    // ✅ só limpa auth se for expirada de verdade (inclui res.result.error)
    if (isSessionExpiredError_(res)) {
      setBox("Sessão expirada. Faça login novamente.", "err");
      clearAuthAndRedirect_();
      return { ok: false, error: "Sessão expirada" };
    }

    return res;
  }


/***********************
   * STATE
   ***********************/
  const state = {
    step: "A",
    dataRef: hojeDMY(),
    contexto: null,
    supervisaoCtx: "",
    edits: Object.create(null),
    supervisoesTodas: [],
  };
  window.estado = state;

  let dataRefDMY = state.dataRef;

  function getKeyCol(col, idx) {
    if (col && typeof col === "object" && col.__key) return col.__key;
    const id = normStr(col?.Id || col?.ID || col?.colaboradorId || col?.ColaboradorId);
    const nome = normStr(col?.Colaborador || col?.NOME || col?.nome || col?.Nome);
    const sup = normStr(col?.Supervisao || col?.SUPERVISAO || col?.supervisao || col?.Supervisão);
    const base = id || nome || "COL";
    const key = `${base}::${sup || "SUP"}::${idx ?? ""}`;
    if (col && typeof col === "object") col.__key = key;
    return key;
  }

  function getNome(col) {
    return normStr(col?.Colaborador || col?.NOME || col?.nome || col?.Nome);
  }

  function getSup(col) {
    return normStr(col?.Supervisao || col?.SUPERVISAO || col?.supervisao || col?.Supervisão);
  }

  function ensureEdit(key, base = {}) {
    if (!state.edits[key]) {
      state.edits[key] = {
        key,
        Colaborador: base.Colaborador || "",
        Supervisao: base.Supervisao || "",
        Disponibilidade_Status: "Disponível",
        Disponibilidade_Motivo: "",
        Disponibilidade_Obs: "",
        Disponibilidade_Transferir_Para: "",
        Estadia_Tipo: "",
        Estadia_Obs: "",
        Hotel_Dias: "",
        Hotel_Chegada: "",
        Cafe: false,
        Almoco: false,
        Janta: false,
        Deslocamento_Tipo: "",
        Deslocamento_Obs: "",
        Recarga: "",
        Passagem: "",
        Lavagem: "",
        ManutVeiculos: "",
        Extras: "",
      };
    }
    return state.edits[key];
  }

  /***********************
   * CONTEXTO
   ***********************/
  function extrairContexto(resp) {
    if (!resp) return null;
    if (resp.contexto) return resp.contexto;
    if (resp.data && (resp.data.liberados || resp.data.bloqueados)) return resp.data;
    if (resp.liberados || resp.bloqueados) return resp;
    return resp;
  }

  function cacheColaboradores(ctx) {
    try {
      const base = safeArr(ctx?.liberados || ctx?.colaboradores || ctx?.colabs);
      const nomes = base
        .map(col => normStr(col?.Colaborador || col?.NOME || col?.nome || col?.Nome))
        .filter(Boolean);
      const unique = Array.from(new Set(nomes)).sort((a, b) => a.localeCompare(b, "pt-BR", { sensitivity: "base" }));
      if (unique.length) localStorage.setItem("g1000_colaboradores_ctx", JSON.stringify(unique));
    } catch (_) {}
  }

  function resolveNomeSessao(session) {
    if (!session) return "";
    return normStr(
      session?.nome || session?.user || session?.gestor || session?.Nome || session?.NOME ||
      session?.Colaborador || session?.col_nome || session?.colNome || session?.colaborador_nome ||
      session?.colaboradorNome || session?.nome_gestor || session?.colaborador
    );
  }

  function hideSupervisaoTopo_() {
    try {
      const wrap = $("supervisaoWrap") || $("supField") || $("wrapSupervisao");
      if (wrap) wrap.style.display = "none";
      const sel = $("selSup") || $("selSupervisao");
      if (sel) sel.value = "";
    } catch (_) {}
  }

  
/* =========================
 * Cache (sessionStorage) — acelera carregar contexto
 * ========================= */
function getSessionCache_(key, maxAgeMs){
  try{
    const raw = sessionStorage.getItem(key);
    if(!raw) return null;
    const obj = JSON.parse(raw);
    if(!obj || typeof obj !== "object") return null;
    if(maxAgeMs && obj.ts && (Date.now() - obj.ts) > maxAgeMs) return null;
    return obj.v ?? null;
  }catch(_){ return null; }
}
function setSessionCache_(key, value){
  try{
    sessionStorage.setItem(key, JSON.stringify({ ts: Date.now(), v: value }));
  }catch(_){}
}

async function carregarContexto() {
    try {
      const dataRefRaw = normStr($("dataRef")?.value);
      if (!dataRefRaw) throw new Error("Informe a data (dd/MM/aaaa).");

      const parsedDR = parseDataRef_(dataRefRaw);
      if (!parsedDR) throw new Error("Data inválida. Use dd/MM/aaaa.");

      const token = getTokenMaybe();
      if (!token) throw new Error("Sessão expirada. Faça login novamente.");

      const auth = getAuthSafe_() || {};
      let supsLiberadas = getSupervisoesLiberadasFromAuth_(auth);

      // ✅ fallback: se auth vier “vazio”, tenta pegar do backend (me)
      if (!supsLiberadas.length) {
        const meResp = await apiPost({ module:"despesas", action:"me", token });
        const u = meResp?.user || meResp?.session || meResp || {};
        const fakeAuth = { token, user: u };
        supsLiberadas = getSupervisoesLiberadasFromAuth_(fakeAuth);
      }

      if (!supsLiberadas.length) {
        setBox("Erro: Nenhuma supervisão liberada para este usuário (auth/me vazio).", "err");
        return;
      }

      state.supervisaoCtx = supsLiberadas[0];
      dataRefDMY = parsedDR.dmy;
      state._parsedDR = parsedDR;

      hideSupervisaoTopo_();
      setBox("Carregando contexto...", "info");

      const payload = {
        module: "despesas",
        action: "carregarContexto",
        token,
        dataRef: parsedDR.dmy,
        dataRefDMY: parsedDR.dmy,
        dataRefISO: parsedDR.iso,
        supervisao: state.supervisaoCtx,
      };

      const cacheKey = "ctx:" + parsedDR.dmy + ":" + String(state.supervisaoCtx||"");
      let resp = getSessionCache_(cacheKey, 2*60*1000); // 2 min
      if(!resp){
        resp = await apiPost(payload);
        setSessionCache_(cacheKey, resp);
      }
      if (!resp || resp.ok === false) throw new Error(resp?.error || resp?.message || "Falha ao carregar contexto.");

      const ctx = extrairContexto(resp);
      state.contexto = ctx;
      cacheColaboradores(ctx);

      const baseCols = safeArr(ctx?.liberados || ctx?.colaboradores || ctx?.colabs);
      baseCols.forEach((col, idx) => { getKeyCol(col, idx); });

      state.edits = Object.create(null);

      // ================================
      // ✅ HOSPEDAGEM AUTOMÁTICA (PREFILL)
      // - Se existir reserva/solicitação de hospedagem no dia (Programação/Avulsa),
      //   pré-preenche a aba "Estadia" por colaborador.
      // ================================
      try{
        const normHospName_ = (s)=>String(s||"")
          .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
          .replace(/\s+/g,' ')
          .toUpperCase().trim();

        const nomes = baseCols.map(c =>
          String(c?.Colaborador || c?.colaborador || c?.Nome || c?.nome || "").trim()
        ).filter(Boolean);

        if (nomes.length) {
          const hosp = await apiPost({
            module: "despesas",
            action: "carregarHospedagensPorNome",
            token,
            payload: { dataRef: parsedDR.dmy, nomes }
          });

          const map = hosp?.hospedagensPorNome || hosp?.data?.hospedagensPorNome || hosp?.data?.hospedagens_por_nome || {};
          state.hospedagensPorNome = map || {};

          // aplica prefill
          const diffDias_ = (checkin, checkout)=>{
            const m1 = String(checkin||"").match(/(\d{2})\/(\d{2})\/(\d{4})/);
            const m2 = String(checkout||"").match(/(\d{2})\/(\d{2})\/(\d{4})/);
            if (!m1 || !m2) return 0;
            const d1 = new Date(Number(m1[3]), Number(m1[2])-1, Number(m1[1]));
            const d2 = new Date(Number(m2[3]), Number(m2[2])-1, Number(m2[1]));
            const ms = d2.getTime() - d1.getTime();
            const dias = Math.round(ms / 86400000);
            return Number.isFinite(dias) && dias > 0 ? dias : 0;
          };

          baseCols.forEach((col, idx)=>{
            const nome = String(col?.Colaborador || col?.colaborador || col?.Nome || col?.nome || "").trim();
            if (!nome) return;
            const hk = normHospName_(nome);
            const h = map ? map[hk] : null;
            if (!h) return;

            const key = getKeyCol(col, idx);
            const e = state.edits[key] || (state.edits[key] = {});

            const tipo = String(h?.Tipo || h?.tipo || "").trim().toUpperCase();
            if (tipo === "HOTEL") {
              e.Estadia_Tipo = "Hotel";
              e.Estadia_Obs  = String(h?.Cidade_UF || h?.cidade_uf || h?.Observacao || "").trim();
              e.Hotel_Chegada = String(h?.Hora_Chegada || h?.hora_chegada || "").trim();

              const dias = diffDias_(h?.Checkin, h?.Checkout);
              if (dias) e.Hotel_Dias = dias;
            }
          });
        }
      }catch(hPrefErr){
        console.warn("Hospedagem prefill falhou:", hPrefErr);
      }

      const nomeUser = resolveNomeSessao(resp?.user) || resolveNomeSessao(ctx?.user) ||
        (window.AUTH && typeof window.AUTH.getNome === "function" ? window.AUTH.getNome() : "") ||
        (window.Auth && typeof window.Auth.getNome === "function" ? window.Auth.getNome() : "");

      if (nomeUser && $("userName")) $("userName").textContent = nomeUser;

      setBox(`Contexto carregado (${state.supervisaoCtx}).`, "ok");
      renderSteps();
    } catch (e) {
      console.error(e);
      setBox(`Erro: ${String(e?.message || e)}`, "err");
    }
  }

  /***********************
   * SALVAR PROGRAMAÇÃO
   ***********************/
  function toSimNao(v) {
    const s = normStr(v).toUpperCase();
    if (v === true) return "SIM";
    if (v === false) return "NÃO";
    if (s === "SIM" || s === "S") return "SIM";
    if (s === "NAO" || s === "NÃO" || s === "N") return "NÃO";
    return "";
  }

  function normNaoAplicaToNA(t) {
    const s = normStr(t);
    if (!s) return "N/A";
    if (s === "Não aplica" || s === "Nao aplica" || s === "N/A") return "N/A";
    return s;
  }

  // ✅ pega Coordenação de onde der (auth/contexto)
  function getCoordenacao_() {
    const auth = getAuthSafe_() || {};
    const u = auth?.user || auth || {};
    return normStr(
      u?.coord || u?.Coordenação || u?.Coordenacao || u?.coordenacao ||
      state?.contexto?.coord || state?.contexto?.Coordenação || state?.contexto?.Coordenacao || state?.contexto?.coordenacao ||
      ""
    );
  }

  // ✅ converte string/numero para número seguro
  function num_(v) {
    if (v == null) return 0;
    if (typeof v === "number") return Number.isFinite(v) ? v : 0;
    const s = String(v).replace(/\./g, "").replace(",", ".").trim();
    const n = Number(s);
    return Number.isFinite(n) ? n : 0;
  }

  async function salvarProgramacao() {
    try {
      const __emitProg = (pct, label) => {
        try{ window.dispatchEvent(new CustomEvent('programacao:progress', { detail: { pct, label } })); }catch(_){ }
      };
      const __emitErr = () => { try{ window.dispatchEvent(new Event('programacao:error')); }catch(_){} };
      const __emitOk  = () => { try{ window.dispatchEvent(new Event('programacao:saved')); }catch(_){} };

      __emitProg(8, 'Preparando…');
      if (!state?.contexto) throw new Error("Carregue o contexto antes de salvar.");

      const elDataRef = $("dataRef") || document.querySelector("input[name='dataRef']");
      let dataRefRaw = elDataRef ? elDataRef.value : "";
      if (!dataRefRaw) dataRefRaw = state?.dataRef || state?.contexto?.dataRef || state?.contexto?.DataReferencia || "";

      const parsedDR = parseDataRef_(dataRefRaw);
      if (!parsedDR) throw new Error(`dataRef inválida. Recebido: ${dataRefRaw ?? ""}`);

      const token = getTokenMaybe();
      if (!token) throw new Error("Sessão expirada. Faça login novamente.");

      const base = safeArr(state.contexto?.liberados || state.contexto?.colaboradores || state.contexto?.colabs);
      if (!base.length) throw new Error("Sem colaboradores no contexto.");

      const coordenacao = getCoordenacao_();
      const supCtx = normStr(state.supervisaoCtx || "");

      // ✅ ITENS FLAT
      const itens = base.map((col, idx) => {
        const key = getKeyCol(col, idx);
        const nome = getNome(col);
        const supOrigem = getSup(col);
        if (!nome) return null;

        const edit = state.edits?.[key] || ensureEdit(key, { Colaborador: nome, Supervisao: supOrigem });

        const statusRaw = normStr(edit.Disponibilidade_Status || "Disponível");
        const status = statusRaw || "Disponível";

        const transferPara = normStr(edit.Disponibilidade_Transferir_Para || "");
        if (status === "Transferir" && !isSupTransferValida_(transferPara)) {
          throw new Error(`Selecione uma supervisão válida para transferir: ${nome}`);
        }

        const obsDispBase = normStr(edit.Disponibilidade_Motivo || edit.Disponibilidade_Obs || "");
        const obsDisp = (status === "Transferir" && transferPara)
          ? (obsDispBase || `Transferir para: ${transferPara}`)
          : obsDispBase;

        const estTipoUi = normStr(edit.Estadia_Tipo || "");
        let estObs = normStr(edit.Estadia_Obs || "");
        if (estTipoUi === "Fazenda/Armazém" && !estObs) estObs = "PERNOITE";

        const estTipo = (estTipoUi === "Fazenda/Armazém") ? "Fazenda/Armazém" : (estTipoUi ? normNaoAplicaToNA(estTipoUi) : "");

        const hotelDias = Math.max(0, Math.floor(num_(edit.Hotel_Dias || 0)));
        const hotelChegada = normStr(edit.Hotel_Chegada || "");

        const cafeVal = edit.Cafe ? 1 : 0;
        const almocoVal = edit.Almoco ? 1 : 0;
        const jantaVal = edit.Janta ? 1 : 0;

        const deslTipo = normStr(edit.Deslocamento_Tipo || "");
        const deslObs = normStr(edit.Deslocamento_Obs || "");

        const recarga = num_(edit.Recarga || 0);
        const passagem = num_(edit.Passagem || 0);
        const lavagem = num_(edit.Lavagem || 0);
        const manut = toSimNao(edit.ManutVeiculos || "");
        const obsExtras = normStr(edit.Extras || "");

        // ✅ se Transferir, considera supervisão destino
        const supFinal = (status === "Transferir" && transferPara) ? transferPara : (supCtx || supOrigem);

        return {
          Timestamp: "",
          DataReferencia: parsedDR.dmy,
          "Coordenação": coordenacao,
          "Colaborador": nome,
          "Supervisão": supFinal,

          Disponibilidade_Status: status,
          Disponibilidade_Obs: obsDisp,

          Estadia_Tipo: estTipo,
          Estadia_Obs: estObs,

          Cafe_Valor: cafeVal,
          Almoco_Valor: almocoVal,
          Janta_Valor: jantaVal,

          Deslocamento_Tipo: deslTipo,
          Deslocamento_Obs: deslObs,

          Extras_Recarga_Valor: recarga,
          Extras_Passagem_Valor: passagem,
          Extras_Lavagem_Valor: lavagem,

          Manut_veic: manut,
          Extras_Obs: obsExtras,

          Hotel_Dias: hotelDias,
          Hotel_Chegada: hotelChegada,
        };
      }).filter(Boolean);

      if (!itens.length) throw new Error("Sem itens para salvar.");

      setBox("Salvando programação...", "info");
      __emitProg(18, 'Enviando…');

      const payloadSalvar = {
        module: "despesas",
        action: "salvarProgramacao",
        token,
        dataRef: parsedDR.dmy,
        dataRefDMY: parsedDR.dmy,
        dataRefISO: parsedDR.iso,
        DataReferencia: parsedDR.dmy,
        supervisao: supCtx,
        itens,
      };

      console.log("SALVAR payload (resumo):", {
        action: payloadSalvar.action,
        dataRef: payloadSalvar.dataRef,
        supervisao: payloadSalvar.supervisao,
        coord: coordenacao,
        itens_len: (payloadSalvar.itens || []).length
      });
      console.log("SALVAR itens (amostra 2):", (payloadSalvar.itens || []).slice(0, 2));

      __emitProg(45, 'Salvando…');
      const resp = await apiPost(payloadSalvar);
      __emitProg(85, 'Finalizando…');

      if (!resp || resp.ok === false) {
        const dbg = resp?.debugRouter ? `\n\nDEBUG:\n${JSON.stringify(resp.debugRouter, null, 2)}` : "";
        throw new Error((resp?.error || resp?.message || resp?.result?.error || "Falha ao salvar programação.") + dbg);
      }

      if (resp.result && resp.result.ok === false) {
        const dbg = resp?.debugRouter ? `\n\nDEBUG:\n${JSON.stringify(resp.debugRouter, null, 2)}` : "";
        throw new Error((resp.result.error || "Backend retornou result.ok=false") + dbg);
      }

      setBox("Salvo ✅", "ok");
      __emitProg(100, 'Concluído');
      __emitOk();

      // ✅ Hospedagem via PROGRAMAÇÃO (novo/edição/checkout)
      try{
        await processarHospedagemProgramacaoAposSalvar_(parsedDR, token, base);
      }catch(eh){
        console.warn("[HOSPEDAGEM] Falha ao processar solicitações pós-salvar:", eh);
      }

      await carregarContexto();
    } catch (e) {
      console.error(e);
      __emitErr();
      setBox(`Erro ao salvar: ${String(e?.message || e)}`, "err");
    }
  }

  /**
   * Hospedagem integrada:
   * - Se colocou Hotel na Programação -> cria solicitação (RESERVA)
   * - Se alterou Cidade/UF do Hotel -> cria NOVA solicitação (RESERVA) referenciando a anterior
   * - Se removeu Hotel -> cria solicitação (CHECKOUT) para o ADM confirmar
   */
  async function processarHospedagemProgramacaoAposSalvar_(parsedDR, token, baseCols){
    const dmy = parsedDR?.dmy;
    if (!dmy || !token) return;

    const map = state?.hospedagensPorNome || {};
    const rows = safeArr(baseCols || state.contexto?.liberados || state.contexto?.colaboradores || state.contexto?.colabs);
    if (!rows.length) return;

    // ✅ fallback: mesmo que algum build esqueça de declarar o helper, não quebra o pós-salvar
    const normalizeKey_ = (s)=>{
      try{
        if (typeof normalizeNameMapKey_ === "function") return normalizeNameMapKey_(String(s||""));
      }catch(_){}
      return String(s || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, " ")
        .trim()
        .toUpperCase();
    };
    const toKey = (s)=>normalizeKey_(s);

    const reservas = [];
    const checkouts = [];

    for (let i=0;i<rows.length;i++){
      const col = rows[i];
      const nome = getNome(col);
      if (!nome) continue;

      const key = getKeyCol(col, i);
      // ✅ garante persistência do hash anti-duplicidade
      const edit = ensureEdit(key, { Colaborador: nome, Supervisao: getSup(col) });

      const tipoUi = normStr(edit.Estadia_Tipo || "");
      const tipo = (tipoUi === "Hotel") ? "HOTEL" : (tipoUi === "Alojamento" ? "ALOJAMENTO" : "");
      const cidadeUF = normStr(edit.Estadia_Obs || "");
      const dias = Math.max(0, Math.floor(num_(edit.Hotel_Dias || 0)));
      const chegada = normStr(edit.Hotel_Chegada || "");

      const orig = map[toKey(nome)] || null;
      const origSol = normStr(orig?.Solicitacao_Tipo || orig?.solicitacaoTipo || "RESERVA").toUpperCase();
      const origSt  = normStr(orig?.Status || orig?.status || "").toUpperCase();
      const origTipo = normStr(orig?.Tipo || orig?.tipo || "").toUpperCase();
      const origCidade = normStr(orig?.Cidade_UF || orig?.cidadeUF || orig?.Observacao || "");
      const origChegada = normStr(orig?.Hora_Chegada || orig?.hora_chegada || "");
      const origCheckin = normStr(orig?.Checkin || orig?.checkin || "");
      const origCheckout = normStr(orig?.Checkout || orig?.checkout || "");
      const origPedidoId = normStr(orig?.PedidoId || orig?.pedidoId || "");

      const checkoutNow = (dias > 0) ? addDaysDMY_(dmy, dias) : "";
      const assinaturaNow = JSON.stringify({ tipo, cidadeUF, dias, chegada, checkin: dmy, checkout: checkoutNow });
      const assinaturaOrig = JSON.stringify({
        tipo: origTipo,
        cidadeUF: origCidade,
        dias: 0, // não confiável no retorno
        chegada: origChegada,
        checkin: origCheckin || dmy,
        checkout: origCheckout || ""
      });

      // ✅ anti-loop: se já enviou exatamente essa assinatura, não reenvia
      if (edit.__hospHashLastSent === assinaturaNow) continue;

      const querHotel = (tipo === "HOTEL" && !!cidadeUF);
      const tinhaHotel = (origTipo === "HOTEL" && (origSt === "RESERVADO" || origSt === "PENDENTE" || origSt === "ABERTO"));
      const removeuHotel = (origTipo === "HOTEL" && !querHotel);

      // 1) Remover hotel -> checkout (só se existia pedidoId)
      if (removeuHotel && tinhaHotel && origPedidoId) {
        checkouts.push({
          colaborador: nome,
          pedidoRef: origPedidoId,
          observacao: "Solicitado pelo gestor (remoção do hotel na programação)"
        });
        edit.__hospHashLastSent = assinaturaNow;
        continue;
      }

      // 2) Criar/editar reserva (Hotel com cidade)
      if (querHotel) {
        const mudouCidade = !!origCidade && (normStr(origCidade).toLowerCase() !== normStr(cidadeUF).toLowerCase());
        const mudouChegada = !!origChegada && (normStr(origChegada) !== normStr(chegada));
        const mudouCheckout = !!origCheckout && !!checkoutNow && (normStr(origCheckout) !== normStr(checkoutNow));

        const precisaNova = (!origPedidoId) || (origSol === "RESERVA" && (mudouCidade || mudouChegada || mudouCheckout)) || (assinaturaOrig !== assinaturaNow);

        if (precisaNova) {
          reservas.push({
            colaborador: nome,
            cidadeUF,
            tipo: "HOTEL",
            horaChegada: chegada,
            checkin: dmy,
            checkout: checkoutNow,
            observacao: "Solicitação via Programação",
            pedidoRef: origPedidoId
          });
          edit.__hospHashLastSent = assinaturaNow;
        }
      }
    }

    // ✅ logs úteis
    if (reservas.length || checkouts.length) {
      console.info("[HOSPEDAGEM] pós-salvar:", { reservas: reservas.length, checkouts: checkouts.length, dataRef: dmy });
    }

    // envia (agrupando por cidade|hora|checkout) — reduz chamadas
    if (reservas.length) {
      const buckets = {};
      reservas.forEach(it=>{
        const k = `${it.cidadeUF}||${it.horaChegada||""}||${it.checkout||""}`.toLowerCase();
        (buckets[k] ||= []).push(it);
      });

      for (const k of Object.keys(buckets)){
        const b = buckets[k];
        const first = b[0];
        const resp = await apiPost({
          module: "hospedagem",
          action: "programacao_solicitarHospedagem",
          token,
          payload: {
            dataRef: dmy,
            itens: b.map(x=>({
              colaborador: x.colaborador,
              cidadeUF: first.cidadeUF,
              tipo: "HOTEL",
              checkin: dmy,
              checkout: first.checkout,
              horaChegada: first.horaChegada,
              observacao: first.observacao,
              pedidoRef: x.pedidoRef
            }))
          }
        });
        if (resp?.ok === false) console.warn("[HOSPEDAGEM] erro reserva:", resp);
      }
    }

    if (checkouts.length) {
      const buckets = {};
      checkouts.forEach(it=>{
        const k = String(it.pedidoRef||"").trim() || "SEMREF";
        (buckets[k] ||= []).push(it);
      });

      for (const k of Object.keys(buckets)){
        const b = buckets[k];
        const first = b[0];
        const resp = await apiPost({
          module: "hospedagem",
          action: "programacao_solicitarCheckout",
          token,
          payload: {
            dataRef: dmy,
            itens: b.map(x=>({ colaborador: x.colaborador, pedidoRef: x.pedidoRef || first.pedidoRef, observacao: x.observacao }))
          }
        });
        if (resp?.ok === false) console.warn("[HOSPEDAGEM] erro checkout:", resp);
      }
    }
  }

  /***********************
   * FILTROS: LIBERADOS / BLOQUEADOS
   ***********************/
  function getLiberados() {
    const base = safeArr(state.contexto?.liberados || state.contexto?.colaboradores || state.contexto?.colabs);
    return base
      .map((col, idx) => ({ col, key: getKeyCol(col, idx) }))
      .filter(({ key }) => {
        const edit = state.edits?.[key] || {};
        const st = normStr(edit.Disponibilidade_Status || "Disponível");
        if (!st) return true;
        if (st === "Disponível") return true;
        if (st === "Treinamento") return true;
        if (st === "Transferir") {
          return !isSupTransferValida_(edit.Disponibilidade_Transferir_Para);
        }
        return false;
      });
  }

  function getBloqueados() {
    const sist = safeArr(state.contexto?.bloqueados || state.contexto?.indisponiveis);
    const base = safeArr(state.contexto?.liberados || state.contexto?.colaboradores || state.contexto?.colabs);
    const dataRef = normStr($("dataRef")?.value || state.contexto?.dataRef || state.contexto?.DataReferencia || "");

    const extra = base.map((col, idx) => {
      const key = getKeyCol(col, idx);
      const nome = getNome(col);
      const sup = getSup(col);
      const edit = state.edits?.[key] || {};
      const st = normStr(edit.Disponibilidade_Status || "Disponível");
      if (!st || st === "Disponível" || st === "Treinamento") return null;
      if (st === "Transferir" && !isSupTransferValida_(edit.Disponibilidade_Transferir_Para)) return null;
      const obs = normStr(edit.Disponibilidade_Motivo || edit.Disponibilidade_Obs || "");
      return {
        __key: key,
        Colaborador: nome,
        Supervisao: sup,
        Status: "Bloqueado",
        Obs: obs,
        Motivo: st,
        Periodo: dataRef || "",
      };
    }).filter(Boolean);

    const out = [];
    const seen = new Set();

    function pushUniqSistema(item) {
      const nome = normStr(item?.Colaborador || item?.colaborador || item?.NOME || item?.nome || "");
      const sup = normStr(item?.Supervisao || item?.Supervisão || item?.supervisao || item?.SUPERVISAO || "");
      const k = (nome + "|" + sup).toLowerCase();
      if (!k.trim()) return;
      if (seen.has(k)) return;
      seen.add(k);
      out.push({
        Colaborador: nome,
        Supervisao: sup,
        Status: normStr(item?.Status || item?.STATUS || "Bloqueado") || "Bloqueado",
        Obs: normStr(item?.Obs || item?.obs || item?.OBS || ""),
        Motivo: normStr(item?.Motivo || item?.motivo || item?.MotivoSistema || item?.motivo_sistema || ""),
        Periodo: normStr(item?.Periodo || item?.periodo || item?.PeriodoInicial || ""),
      });
    }

    sist.forEach(pushUniqSistema);
    extra.forEach(it => out.push(it));
    return out;
  }

  /***********************
   * D1 cache (hotel/aloj)
   ***********************/
  const _cacheD1 = { hotel: new Map(), aloj: new Map() };

  async function getHotelD1Cached(nome, dataRef) {
    const key = `${dataRef}|${nome}`;
    if (_cacheD1.hotel.has(key)) return _cacheD1.hotel.get(key);
    const token = getTokenMaybe();
    if (!token) return null;
    const resp = await apiPost({ module: "despesas", action: "verificarHotelD1", token, nome, dataRef });
    _cacheD1.hotel.set(key, resp);
    return resp;
  }

  async function getAlojD1Cached(nome, dataRef) {
    const key = `${dataRef}|${nome}`;
    if (_cacheD1.aloj.has(key)) return _cacheD1.aloj.get(key);
    const token = getTokenMaybe();
    if (!token) return null;
    const resp = await apiPost({ module: "despesas", action: "verificarAlojamentoD1", token, nome, dataRef });
    _cacheD1.aloj.set(key, resp);
    return resp;
  }

/***********************
 * LISTA ALOJAMENTOS (REF -> datalist)
 * - Carrega via action listarAlojamentosRef (router tem aliases)
 * - Cache por coord|sup para evitar spam de requests
 ***********************/
const _cacheAlojRef = new Map(); // key => { items, ts }

async function getAlojamentosRefCached_(coord, sup) {
  const c = normStr(coord);
  const s = normStr(sup);
  const key = `${c}||${s}`.toLowerCase();

  const hit = _cacheAlojRef.get(key);
  if (hit && Array.isArray(hit.items) && hit.items.length) return hit.items;

  const token = getTokenMaybe();
  if (!token) return [];

  const resp = await apiPost({
    module: "despesas",
    action: "listarAlojamentosRef", // ✅ alias no router
    token,
    coordenacao: c,
    supervisao: s
  });

  const items = safeArr(resp?.items || resp?.alojamentos || resp?.data?.items || resp?.data?.alojamentos);
  _cacheAlojRef.set(key, { items, ts: Date.now() });
  return items;
}

function bindAlojamentoDatalist_(inputEl, lista) {
  if (!inputEl) return;

  let dl = document.getElementById("datalist-alojamentos");
  if (!dl) {
    dl = document.createElement("datalist");
    dl.id = "datalist-alojamentos";
    document.body.appendChild(dl);
  }

  dl.innerHTML = (lista || []).map(a =>
    `<option value="${String(a ?? "").replace(/"/g, "&quot;")}"></option>`
  ).join("");

  inputEl.setAttribute("list", "datalist-alojamentos");
}

function unbindAlojamentoDatalist_(inputEl) {
  try { if (inputEl) inputEl.removeAttribute("list"); } catch (_) {}
}


  /***********************
   * VIEW / STEPS
   ***********************/
  function trocarView(viewId) {
    document.querySelectorAll(".view").forEach(v => v.classList.add("hidden"));
    const v = $(viewId);
    if (v) v.classList.remove("hidden");
    document.querySelectorAll(".tile").forEach(t => t.classList.remove("active"));
    const tile = document.querySelector(`.tile[data-view="${viewId}"]`);
    if (tile) tile.classList.add("active");
  }

  const stepsOrder = ["A", "B", "C", "D", "E"];

  function updateStepNav() {
    const idx = stepsOrder.indexOf(state.step);
    const prevBtn = $("btnPrevStep");
    const nextBtn = $("btnNextStep");
    const saveBtn = $("btnSalvarProg");
    if (prevBtn) prevBtn.disabled = idx <= 0;
    if (nextBtn) nextBtn.disabled = idx >= stepsOrder.length - 1;
    if (saveBtn) saveBtn.style.display = state.step === "E" ? "" : "none";
  }

  
async function ensureHospedagensPrefillOnce_(parsedDR){
  try{
    if(state._hospPrefillLoaded) return;
    const token = state.token;
    if(!token) return;
    if(!parsedDR || !parsedDR.dmy) return;
    const nomes = (state.baseCols && Array.isArray(state.baseCols.nomes)) ? state.baseCols.nomes : [];
    if(!nomes.length) return;
    // cache separado (2 min)
    const cacheKey = "hosp:" + parsedDR.dmy + ":" + String(state.supervisaoCtx||"");
    const cached = getSessionCache_(cacheKey, 2*60*1000);
    if(cached){
      state.hospedagensPorNome = cached || {};
      state._hospPrefillLoaded = true;
      return;
    }

    const respHosp = await apiPost({
      module:"despesas",
      action:"carregarHospedagensPorNome",
      token,
      dataRef: parsedDR.dmy,
      nomes: nomes.slice(0, 500)
    });
    if(respHosp && respHosp.ok){
      const map = (respHosp.data && respHosp.data.hospedagensPorNome) ? respHosp.data.hospedagensPorNome : (respHosp.hospedagensPorNome || {});
      state.hospedagensPorNome = map || {};
      setSessionCache_(cacheKey, state.hospedagensPorNome);
      state._hospPrefillLoaded = true;
    }
  }catch(_){}
}

function trocarStep(step) {
    state.step = step;
  if(step === "B") { ensureHospedagensPrefillOnce_(state._parsedDR); }
    document.querySelectorAll(".step").forEach(s => s.classList.add("hidden"));
    document.querySelectorAll(".stepBtn").forEach(b => b.classList.remove("active"));
    const wrap = $(`step-${step}`);
    if (wrap) wrap.classList.remove("hidden");
    const btn = document.querySelector(`.stepBtn[data-step="${step}"]`);
    if (btn) btn.classList.add("active");
    updateStepNav();
    renderSteps();
  }

  function stepPrev() {
    const idx = stepsOrder.indexOf(state.step);
    if (idx > 0) trocarStep(stepsOrder[idx - 1]);
  }

  function stepNext() {
    const idx = stepsOrder.indexOf(state.step);
    if (idx >= 0 && idx < stepsOrder.length - 1) trocarStep(stepsOrder[idx + 1]);
  }

  /***********************
   * RENDER — PAINÉIS
   ***********************/
  let _rafRenderA = null;
  function scheduleRenderA() {
    if (_rafRenderA) return;
    _rafRenderA = requestAnimationFrame(() => {
      _rafRenderA = null;
      if (state.step === "A") renderA();
    });
  }

  function renderA() {
    limpar($("tblA_body"));
    limpar($("tblA_bloq"));

    const liberados = getLiberados();
    const bloqueados = getBloqueados();

    liberados.forEach(({ col, key }) => {
      const nome = getNome(col);
      const sup = getSup(col);
      const edit = ensureEdit(key, { Colaborador: nome, Supervisao: sup });

      const tr = document.createElement("tr");

      const sel = document.createElement("select");
      ["Disponível","Férias","Folga","Falta","Atestado","Treinamento","Inativo","Transferir"].forEach(v => {
        const o = document.createElement("option");
        o.value = v; o.textContent = v;
        sel.appendChild(o);
      });
      sel.value = edit.Disponibilidade_Status || "Disponível";

      const inpMotivo = document.createElement("input");
      inpMotivo.placeholder = "Motivo";
      inpMotivo.value = edit.Disponibilidade_Motivo || "";

      const destWrap = document.createElement("div");
      destWrap.className = "transfer-wrap";
      destWrap.style.display = "none";

      const obsInput = document.createElement("input");
      obsInput.placeholder = "Obs (opcional)";
      obsInput.className = "input";
      obsInput.value = edit.Disponibilidade_Obs || "";

      const selDest = document.createElement("select");
      selDest.className = "input";
      selDest.style.marginTop = "8px";

      function preencherDestSelect_() {
        const sups = getSupervisoesTransfer();
        const cur = normStr(edit.Disponibilidade_Transferir_Para);
        selDest.innerHTML = "";

        const o0 = document.createElement("option");
        o0.value = "";
        o0.textContent = sups.length ? "Supervisão destino..." : "Carregar lista de supervisões...";
        selDest.appendChild(o0);

        sups.forEach(s => {
          const o = document.createElement("option");
          o.value = s; o.textContent = s;
          selDest.appendChild(o);
        });

        const found = sups.some(x => normStr(x).toLowerCase() === cur.toLowerCase());
        selDest.value = found ? cur : "";
        edit.Disponibilidade_Transferir_Para = selDest.value || "";
      }

      selDest.addEventListener("focus", async () => {
        if (!getSupervisoesTransfer().length) {
          try { await ensureSupervisoesTodas_(); } catch (_) {}
        }
        preencherDestSelect_();
      });

      selDest.addEventListener("change", () => {
        edit.Disponibilidade_Transferir_Para = selDest.value || "";
        scheduleRenderA();
      });

      obsInput.addEventListener("input", () => {
        edit.Disponibilidade_Obs = obsInput.value;
      });

      destWrap.appendChild(obsInput);
      destWrap.appendChild(selDest);

      function syncTransferUI() {
        const st = sel.value || "Disponível";
        if (st === "Transferir") {
          destWrap.style.display = "";
          if (!getSupervisoesTransfer().length) {
            ensureSupervisoesTodas_().then(() => preencherDestSelect_()).catch(() => {});
          } else {
            preencherDestSelect_();
          }
        } else {
          destWrap.style.display = "none";
          edit.Disponibilidade_Transferir_Para = "";
        }
      }

      syncTransferUI();

      sel.addEventListener("change", () => {
        edit.Disponibilidade_Status = sel.value;
        syncTransferUI();
        scheduleRenderA();
      });

      inpMotivo.addEventListener("input", () => {
        edit.Disponibilidade_Motivo = inpMotivo.value;
        scheduleRenderA();
      });

      tr.innerHTML = `
        <td>${nome}</td>
        <td>${sup}</td>
        <td></td>
        <td></td>
      `;
      tr.children[2].appendChild(sel);
      tr.children[3].appendChild(inpMotivo);
      tr.children[3].appendChild(destWrap);

      $("tblA_body")?.appendChild(tr);
    });

    bloqueados.forEach((col) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${normStr(col?.Colaborador || col?.NOME || col?.nome)}</td>
        <td>${normStr(col?.Supervisao || col?.SUPERVISAO || col?.supervisao)}</td>
        <td>${normStr(col?.Status || col?.STATUS || "Bloqueado")}</td>
        <td>${normStr(col?.Obs || col?.OBS || "")}</td>
        <td>${normStr(col?.Motivo || col?.MOTIVO || col?.MotivoSistema || col?.MOTIVO_SISTEMA || "")}</td>
        <td>${normStr(col?.Periodo || col?.PERIODO || col?.PeriodoInicial || "")}</td>
      `;
      $("tblA_bloq")?.appendChild(tr);
    });
  }

  function renderB() {
  limpar($("tblB_body"));
  const liberados = getLiberados();

  liberados.forEach(({ col, key }) => {
    const nome = getNome(col);
    const edit = ensureEdit(key, { Colaborador: nome, Supervisao: getSup(col) });

    // defaults (Painel B: em branco)
    if (edit.Estadia_Tipo == null) edit.Estadia_Tipo = "";
    if (edit.Estadia_Obs == null) edit.Estadia_Obs = "";
    if (edit.Hotel_Dias == null) edit.Hotel_Dias = "";
    if (edit.Hotel_Chegada == null) edit.Hotel_Chegada = "";

    const tr = document.createElement("tr");

    const tdNome = document.createElement("td");
    tdNome.textContent = nome;

    const tdTipo = document.createElement("td");
    const selTipo = document.createElement("select");
    selTipo.className = "inp";
    [
      { v: "", t: "" },
      { v: "Hotel", t: "Hotel" },
      { v: "Alojamento", t: "Alojamento" },
      { v: "Fazenda/Armazém", t: "Fazenda/Armazém" },
    ].forEach(o => {
      const opt = document.createElement("option");
      opt.value = o.v; opt.textContent = o.t;
      selTipo.appendChild(opt);
    });
    selTipo.value = String(edit.Estadia_Tipo || "").trim();

    const tdObs = document.createElement("td");
    const inpObs = document.createElement("input");
    inpObs.className = "inp";
    inpObs.type = "text";
    inpObs.placeholder = "Cidade/UF ou Alojamento";
    inpObs.value = String(edit.Estadia_Obs || "");

    const tdDiarias = document.createElement("td");
    const inpDiarias = document.createElement("input");
    inpDiarias.className = "inp";
    inpDiarias.type = "number";
    inpDiarias.min = "0";
    inpDiarias.step = "1";
    inpDiarias.placeholder = "";
    inpDiarias.value = (edit.Hotel_Dias === "" || edit.Hotel_Dias == null) ? "" : String(edit.Hotel_Dias);

    const tdChegada = document.createElement("td");
    const inpChegada = document.createElement("input");
    inpChegada.className = "inp";
    inpChegada.type = "time";
    inpChegada.value = String(edit.Hotel_Chegada || "");


async function syncAlojamentoDatalist_() {
  const t = String(selTipo.value || "");
  const isAloj = (t === "Alojamento");

  if (!isAloj) {
    unbindAlojamentoDatalist_(inpObs);
    return;
  }

  // coord/sup do contexto (fallback seguro)
  const coord = (typeof getCoordenacao_ === "function") ? getCoordenacao_() : (state?.contexto?.coordenacao || state?.contexto?.Coordenacao || state?.contexto?.Coordenação || "");
  const sup = normStr(state?.supervisaoCtx || getSup(col) || "");

  try {
    const lista = await getAlojamentosRefCached_(coord, sup);
    if (Array.isArray(lista) && lista.length) {
      bindAlojamentoDatalist_(inpObs, lista);
    } else {
      // sem itens: não força list para não confundir
      unbindAlojamentoDatalist_(inpObs);
    }
  } catch (e) {
    console.warn("Falha ao carregar alojamentos REF:", e);
    unbindAlojamentoDatalist_(inpObs);
  }
}

    function syncHotelFields() {
      const t = String(selTipo.value || "");
      const isHotel = (t === "Hotel");

      // Hotel usa dias + chegada. Outros tipos ficam em branco.
      inpDiarias.disabled = !isHotel;
      inpChegada.disabled = !isHotel;

      if (!isHotel) {
        inpDiarias.value = "";
        inpChegada.value = "";
        edit.Hotel_Dias = "";
        edit.Hotel_Chegada = "";
      }
    }

    selTipo.addEventListener("change", async () => {
      edit.Estadia_Tipo = selTipo.value || "";
      syncHotelFields();
      await syncAlojamentoDatalist_();
    });
inpObs.addEventListener("input", () => {
      edit.Estadia_Obs = inpObs.value || "";
    });

    inpObs.addEventListener("focus", async () => {
      await syncAlojamentoDatalist_();
    });

    inpDiarias.addEventListener("input", () => {
      const n = Number(inpDiarias.value);
      edit.Hotel_Dias = (inpDiarias.value === "" ? "" : (Number.isFinite(n) ? n : ""));
    });

    inpChegada.addEventListener("input", () => {
      edit.Hotel_Chegada = inpChegada.value || "";
    });

    tdTipo.appendChild(selTipo);
    tdObs.appendChild(inpObs);
    tdDiarias.appendChild(inpDiarias);
    tdChegada.appendChild(inpChegada);

    tr.appendChild(tdNome);
    tr.appendChild(tdTipo);
    tr.appendChild(tdObs);
    tr.appendChild(tdDiarias);
    tr.appendChild(tdChegada);

    $("tblB_body")?.appendChild(tr);
    syncHotelFields();
    syncAlojamentoDatalist_();
  });
}

function renderC(
) {
    const tbl = $("tblC_body");
    if (!tbl) return;
    limpar(tbl);

    const liberados = getLiberados();
    liberados.forEach(({ col, key }) => {
      const nome = getNome(col);
      const edit = ensureEdit(key, { Colaborador: nome, Supervisao: getSup(col) });

      const tr = document.createElement("tr");

      const ckCafe = document.createElement("input");
      ckCafe.type = "checkbox";
      ckCafe.checked = !!edit.Cafe;

      const ckAlm = document.createElement("input");
      ckAlm.type = "checkbox";
      ckAlm.checked = !!edit.Almoco;

      const ckJan = document.createElement("input");
      ckJan.type = "checkbox";
      ckJan.checked = !!edit.Janta;

      ckCafe.addEventListener("change", () => { edit.Cafe = ckCafe.checked; });
      ckAlm.addEventListener("change", () => { edit.Almoco = ckAlm.checked; });
      ckJan.addEventListener("change", () => { edit.Janta = ckJan.checked; });

      tr.innerHTML = `<td>${nome}</td><td></td><td></td><td></td>`;
      tr.children[1].appendChild(ckCafe);
      tr.children[2].appendChild(ckAlm);
      tr.children[3].appendChild(ckJan);

      tbl.appendChild(tr);
    });
  }

  function renderD() {
    limpar($("tblD_body"));
    const liberados = getLiberados();

    liberados.forEach(({ col, key }) => {
      const nome = getNome(col);
      const edit = ensureEdit(key, { Colaborador: nome, Supervisao: getSup(col) });

      const tr = document.createElement("tr");

      const wrap = document.createElement("div");
      wrap.style.display = "flex";
      wrap.style.gap = "10px";
      wrap.style.alignItems = "center";

      const sel = document.createElement("select");
      ["","Frota","Carona","Deslocamento Km","Uber/Táxi"].forEach(v => {
        const o = document.createElement("option");
        o.value = v;
        o.textContent = v || "Selecione...";
        sel.appendChild(o);
      });
      sel.value = edit.Deslocamento_Tipo || "";

      const inp = document.createElement("input");
      inp.placeholder = "Obs (placa/OS/km)";
      inp.value = edit.Deslocamento_Obs || "";

      sel.addEventListener("change", () => {
        edit.Deslocamento_Tipo = sel.value;
        if (sel.value === "Deslocamento Km" && !normStr(edit.Deslocamento_Obs)) {
          edit.Deslocamento_Obs = "KM: ";
          inp.value = edit.Deslocamento_Obs;
        }
      });

      inp.addEventListener("input", () => { edit.Deslocamento_Obs = inp.value; });

      wrap.appendChild(sel);
      wrap.appendChild(inp);

      tr.innerHTML = `<td>${nome}</td><td></td>`;
      tr.children[1].appendChild(wrap);

      $("tblD_body")?.appendChild(tr);
    });
  }

  function renderE() {
    limpar($("tblE_body"));
    const liberados = getLiberados();

    liberados.forEach(({ col, key }) => {
      const nome = getNome(col);
      const edit = ensureEdit(key, { Colaborador: nome, Supervisao: getSup(col) });

      const tr = document.createElement("tr");

      const inpRec = document.createElement("input");
      inpRec.placeholder = "Recarga";
      inpRec.value = edit.Recarga || "";
      inpRec.addEventListener("input", () => { edit.Recarga = inpRec.value; });

      const inpPas = document.createElement("input");
      inpPas.placeholder = "Passagem";
      inpPas.value = edit.Passagem || "";
      inpPas.addEventListener("input", () => { edit.Passagem = inpPas.value; });

      const inpLav = document.createElement("input");
      inpLav.placeholder = "Lavagem";
      inpLav.value = edit.Lavagem || "";
      inpLav.addEventListener("input", () => { edit.Lavagem = inpLav.value; });

      const inpMan = document.createElement("input");
      inpMan.placeholder = "Manut. Veículos (SIM/NÃO)";
      inpMan.value = edit.ManutVeiculos || "";
      inpMan.addEventListener("input", () => { edit.ManutVeiculos = inpMan.value; });

      const inpExt = document.createElement("input");
      inpExt.placeholder = "Obs / Extras";
      inpExt.value = edit.Extras || "";
      inpExt.addEventListener("input", () => { edit.Extras = inpExt.value; });

      tr.innerHTML = `<td>${nome}</td><td></td><td></td><td></td><td></td><td></td>`;
      tr.children[1].appendChild(inpRec);
      tr.children[2].appendChild(inpPas);
      tr.children[3].appendChild(inpLav);
      tr.children[4].appendChild(inpMan);
      tr.children[5].appendChild(inpExt);

      $("tblE_body")?.appendChild(tr);
    });
  }

  function renderSteps() {
    if (!state.contexto) return;
    if (state.step === "A") renderA();
    if (state.step === "B") renderB();
    if (state.step === "C") renderC();
    if (state.step === "D") renderD();
    if (state.step === "E") renderE();
  }

  /***********************
   * AÇÕES UI
   ***********************/
  async function ping() {
    try {
      const token = getTokenMaybe();
      const resp = await apiPost({ module: "despesas", action: "ping", token });
      setBox(resp?.ok ? "Ping OK" : "Ping retornou resposta.", "ok");
    } catch (e) {
      console.error(e);
      setBox(`Ping erro: ${String(e?.message || e)}`, "err");
    }
  }

  function ajuda() {
    setBox("Ajuda: 1) Carregue o contexto. 2) Ajuste nos painéis A–E. 3) Clique em Salvar programação.", "info");
  }

  function logout() {
    try {
      if (window.AUTH && typeof window.AUTH.logout === "function") window.AUTH.logout();
    } catch (_) {}
    try { localStorage.removeItem("g1000_token"); } catch (_) {}
    setBox("Sessão encerrada.", "info");
    clearAuthAndRedirect_();
  }

  function selecionarTodosAlmoco() {
    if (!state.contexto) return;
    const liberados = getLiberados();
    liberados.forEach(({ col, key }) => {
      const edit = ensureEdit(key, { Colaborador: getNome(col), Supervisao: getSup(col) });
      edit.Almoco = true;
    });
    if (state.step === "C") renderC();
    setBox("Todos marcados com Almoço.", "ok");
  }

  /***********************
   * INIT
   ***********************/
  function init() {
    hideSupervisaoTopo_();

    const auth = getAuthSafe_() || {};
    const userType = String(auth?.user?.type || auth?.type || "").toUpperCase();
    const userRole = String(auth?.user?.role || auth?.role || "").toUpperCase();
    const isAdmin = userType === "ADM" || userType === "ADMIN" || userRole === "ADM" || userRole === "ADMIN" || auth?.isAdmin === true;
    if (isAdmin) {
      window.location.href = "../adm/adm.html";
      return;
    }

    const nomeGestor =
      (window.AUTH && typeof window.AUTH.getNome === "function") ? window.AUTH.getNome() :
      (window.Auth && typeof window.Auth.getNome === "function") ? window.Auth.getNome() :
      (auth?.user?.nome ? auth.user.nome : "Usuário");

    if ($("userName")) $("userName").textContent = nomeGestor || "Usuário";

    if ($("dataRef")) $("dataRef").value = state.dataRef;
    dataRefDMY = state.dataRef;

    document.querySelectorAll(".tile").forEach(t => {
      t.addEventListener("click", () => {
        const view = t.dataset.view;
        if (view === "view-hospedagem") { window.location.href = "hospedagem.html"; return; }
        if (view === "view-clientes") { window.location.href = "clientes.html"; return; }
        if (view === "view-compras")  { window.location.href = "compras.html";  return; }
        trocarView(view);
      });
    });

    document.querySelectorAll(".stepBtn").forEach(b => {
      b.addEventListener("click", () => trocarStep(String(b.dataset.step || "A")));
    });

    $("btnPrevStep")?.addEventListener("click", stepPrev);
    $("btnNextStep")?.addEventListener("click", stepNext);
    $("btnPing")?.addEventListener("click", ping);
    $("btnHelp")?.addEventListener("click", ajuda);
    $("btnLogout")?.addEventListener("click", logout);

    $("btnDataPadrao")?.addEventListener("click", () => {
      state.dataRef = hojeDMY();
      if ($("dataRef")) $("dataRef").value = state.dataRef;
      dataRefDMY = state.dataRef;
    });

    function bindBtn_(id, fn){
  const el = $(id);
  if(!el) return;
  try{ el.setAttribute("type","button"); }catch(_){}
  el.addEventListener("click", (ev)=>{
    try{ ev.preventDefault(); ev.stopPropagation(); }catch(_){}
    return fn(ev);
  }, { passive:false });
}

bindBtn_("btnCarregar", carregarContexto);
bindBtn_("btnSalvarProg", salvarProgramacao);
bindBtn_("btnAllAlmoco", selecionarTodosAlmoco);
trocarView("view-programacao");
    trocarStep("A");
    setBox("Pronto. Carregue o contexto para começar.", "info");

    try {
      const token = getTokenMaybe();
      if (token) carregarContexto();
    } catch (_) {}
  }

  document.addEventListener("DOMContentLoaded", init);
})();

function sleep_(ms){
  return new Promise(resolve => setTimeout(resolve, ms));
}
// =====================================================
// FALLBACK DE SEGURANÇA
// =====================================================
if (typeof window.carregarHospedagensPorNome_ !== "function") {
  window.carregarHospedagensPorNome_ = function () {
    console.warn("Fallback hospedagens: backend não enviou função.");
    return {};
  };
}
