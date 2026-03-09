/**
 * Gestor Compras — módulo do Painel Web
 * ✅ Refinos:
 * - Reusa ComprasShared (token/helpers/post)
 * - API: prefere window.API.post(action,payload) do core; fallback fetch
 * - Payload: inclui campos flat (data/gestor/coord/sup/...) para bater com planilha
 */
/** =============================
 * CONFIG
 * ============================= */
const WEBAPP_URL = (window.PAINEL_API_URL || window.__WEBAPP_URL__ || "").trim(); // painel-web (Worker ou GAS)


const CORES_UNIFORME = ["VERDE","CINZA"];
const TAMANHOS_FALLBACK = ["PP","P","M","G","GG","XG","G1","G2","G3"];

const MATERIAIS_FIXOS = [
  "BALANÇA",
  "IMPRESSORA DE LAUDO",
  "CALADOR",
  "KIT DE PENEIRAS",
  "QUARTEADOR",
  "ALICATE DE CORTE"
];

const EPIS_FIXOS = [
  "Capacete",
  "Protetor auricular",
  "Óculos Transparente",
  "Luva Multitato PU",
  "Mascara PFF2"
];

// ✅ State (evita ReferenceError: state is not defined)
// Este módulo usa HTML com onclick inline; por isso mantemos escopo global.
const state = {
  dataRef: ""
};
// Útil para debug no console.
window.state = state;

let token = "";

// Shared helpers (com fallback local para não quebrar)
const __S = window.ComprasShared || {};
const getTokenFromPainel_ = __S.getTokenFromPainel_ || function(){ return ""; };
const normKey = __S.normKey || function(s){
  return String(s||"")
    .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .replace(/\s+/g," ")
    .trim().toUpperCase();
};
const esc = __S.esc || function(s){
  return String(s||"").replace(/[&<>\"']/g, m => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'
  }[m]));
};

let ctx = { dataRef:"", gestor:{}, colaboradores:[], tamanhos:[] };
const modo = { uniformes:"NOVA", materiais:"NOVA", epis:"NOVA" };
let tab = "uniformes";
let patModo = "LISTA";

/** =============================
 * ESTADO (Formulários)
 * ============================= */
// Uniformes
let formUniformes = {};     // key(nome norm) => {nome,on,tamanho,qtd,cor, supervisao, coordenacao}
let outrosUniformes = [];   // [{tamanho,qtd,cor}]

// Materiais
let materiaisFixosQtd = {}; // nome => qtd
let materiaisOutros = [];   // [{desc,qtd}]

// EPIs
let episFixosQtd = {};      // nome => qtd
let botinas = [];           // [{tamanho,qtd}]

/** =============================
 * HELPERS
 * ============================= */
function isSemSup_(s){
  const v = normKey(s);
  return !v || v === normKey("SEM SUPERVISÃO");
}
function colKey_(nome){ return normKey(nome||""); }

function showToast(msg){
  const el = document.getElementById("toast");
  el.textContent = String(msg||"");
  el.style.display = "block";
  clearTimeout(showToast._t);
  showToast._t = setTimeout(()=> el.style.display="none", 2600);
}
function setBusy(v){
  document.getElementById("busy").style.display = v ? "flex" : "none";
}
function setBtnDisabled(v){
  document.querySelectorAll("button").forEach(b=> b.disabled = !!v);
}

/** ✅ base URL sem query/hash */
function getDefaultPostUrl_(){
  return (window.location.origin + window.location.pathname);
}

/**
 * ✅ API robusta (text/plain) + parse JSON
 */

async function api(action, payloadObj){
  const a = String(action||"").trim();
  const url = (WEBAPP_URL && WEBAPP_URL.trim()) ? WEBAPP_URL.trim() : getDefaultPostUrl_();
  // ✅ payload no padrão do router: {action, module, token, payload}
  const body = { module:"compras", token, payload:(payloadObj||{}) };
  const poster = (__S && (typeof __S.post === "function")) ? __S.post : null;
  const res = poster ? await poster(a, body, url) : await (async()=>{
    const r = await fetch(url, {
      method:"POST",
      headers:{ "Content-Type":"text/plain;charset=utf-8" },
      body: JSON.stringify(Object.assign({ action:a }, body))
    });
    const text = await r.text();
    try{ return JSON.parse(text); }
    catch{ return { ok:false, error:"Resposta não-JSON do servidor", httpStatus:r.status, raw:text }; }
  })();

  // ✅ sessão inválida: devolve erro padronizado (sem apagar storage automaticamente)
  if(res && res.ok === false && /sess[aã]o inv[aá]lida|expirada/i.test(String(res.error||res.message||""))) {
    return Object.assign({ ok:false, error: res.error || res.message || "Sessão inválida ou expirada" }, res);
  }
  return res;
}


/** =============================
 * DOWNLOAD PDF (FORÇADO)
 * ============================= */
function extractDriveId_(url){
  const s = String(url||"");
  let m = s.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if(m && m[1]) return m[1];
  m = s.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if(m && m[1]) return m[1];
  return "";
}
function toDirectDownloadUrl_(url){
  const id = extractDriveId_(url);
  if(!id) return String(url||"");
  return "https://drive.google.com/uc?export=download&id=" + encodeURIComponent(id);
}
function forceDownload_(url, filename){
  const a = document.createElement("a");
  a.href = toDirectDownloadUrl_(url);
  a.download = filename || "";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/** =============================
 * MENU / TABS
 * ============================= */
function setTab(t){
  tab = t;

  document.getElementById("tabUniformes").classList.toggle("active", t==="uniformes");
  document.getElementById("tabMateriais").classList.toggle("active", t==="materiais");
  document.getElementById("tabEPIs").classList.toggle("active", t==="epis");
  document.getElementById("tabPatrimonios").classList.toggle("active", t==="patrimonios");

  const pU = document.getElementById("paneUniformes");
  const pM = document.getElementById("paneMateriais");
  const pE = document.getElementById("paneEPIs");
  const pP = document.getElementById("panePatrimonios");

  pU.style.display = (t==="uniformes") ? "" : "none";
  pM.style.display = (t==="materiais") ? "" : "none";
  pE.style.display = (t==="epis") ? "" : "none";
  pP.style.display = (t==="patrimonios") ? "" : "none";

  [pU,pM,pE,pP].forEach(p => p.classList.remove("paneAnim"));
  const cur = (t==="uniformes")?pU:(t==="materiais")?pM:(t==="epis")?pE:pP;
  cur.classList.add("paneAnim");

  // fecha details abertos para manter limpo
  document.querySelectorAll("details[open]").forEach(d => d.removeAttribute("open"));

  // FAB
  const fab = document.getElementById("fabSalvar");
  if(t==="patrimonios") fab.style.display = "none";
  else fab.style.display = "";
}

function setPatModo(m){
  patModo = m;
  document.getElementById("btnPatModoLista").classList.toggle("active", m==="LISTA");
  document.getElementById("btnPatModoColab").classList.toggle("active", m==="COLABORADOR");
  renderPatrimonios(lastPatrimoniosCache || []);
}

/** =============================
 * LOGIN / LOAD
 * ============================= */
async function login(){
  const pin = document.getElementById("pin").value.trim();
  document.getElementById("loginStatus").textContent = "Validando…";
  setBusy(true); setBtnDisabled(true);

  const res = await api("loginPIN", { pin });

  setBusy(false); setBtnDisabled(false);

  if(!res.ok){
    document.getElementById("loginStatus").innerHTML = `<span class="err">${esc(res.error||"Falha no login")}</span>`;
    showToast(res.error || "Falha no login");
    return;
  }

  token = res.token;
  document.getElementById("loginStatus").innerHTML = `<span class="ok">OK</span>`;
  await bootstrap();
}

async function bootstrap(){
  setBusy(true); setBtnDisabled(true);

  const res = await api("carregarContexto", { dataRef: state.dataRef || "" }) /*fallback*/
      || await api("carregarListaRecente");

  setBusy(false); setBtnDisabled(false);

  if(!res.ok){
    showToast(res.error || "Falha ao carregar lista.");
    return;
  }

  ctx = res;
  // mantém referência de data para próximos loads
  state.dataRef = ctx.dataRef || state.dataRef || "";

  // UI
  document.getElementById("cardLogin").style.display = "none";
  document.getElementById("app").style.display = "";

  document.getElementById("pillDataRef").textContent = ctx.dataRef || "—";
  document.getElementById("pillGestor").textContent = (ctx.gestor?.nome || "—");

  document.getElementById("gestorNome").textContent = ctx.gestor?.nome || "—";
  document.getElementById("gestorCoord").textContent = ctx.gestor?.coordenacao || "—";
  document.getElementById("gestorSups").textContent = (ctx.gestor?.supervisoesLiberadas||[]).join("; ") || "—";

  // combos
  const sups = buildSupList();
  fillSelect("supUniformes", sups);
  fillSelect("supMateriais", sups);
  fillSelect("supEPIs", sups);
  fillSelect("supPatrimonios", sups);

  // combos uniformes OUTROS
  const tams = (ctx.tamanhos||[]).length ? ctx.tamanhos : TAMANHOS_FALLBACK;
  fillSelect("outUniTam", tams);
  fillSelect("outUniCor", CORES_UNIFORME);

  // init estado
  initStateFromCtx_();

  // render inicial
  setTab("uniformes");
  renderUniformes();
  renderMateriais();
  renderEPIs();
  showToast("Lista carregada!");
}

function initStateFromCtx_(){
  formUniformes = {};
  (ctx.colaboradores||[]).forEach(c=>{
    const nome = String(c?.colaborador||"").trim();
    if(!nome) return;
    const k = colKey_(nome);
    formUniformes[k] = {
      nome,
      on:true,
      tamanho:(String(c?.tamanho||"M").trim() || "M").toUpperCase(),
      qtd:1,
      cor:"VERDE",
      supervisao:String(c?.supervisao||"").trim(),
      coordenacao:String(c?.coordenacao||"").trim()
    };
  });
  outrosUniformes = [];

  materiaisFixosQtd = {};
  MATERIAIS_FIXOS.forEach(n=> materiaisFixosQtd[n]=0);
  materiaisOutros = [];

  episFixosQtd = {};
  EPIS_FIXOS.forEach(n=> episFixosQtd[n]=0);
  botinas = [];
}

function buildSupList(){
  const set = new Set();

  const supsLib = Array.isArray(ctx?.gestor?.supervisoesLiberadas) ? ctx.gestor.supervisoesLiberadas : [];
  if(supsLib.length){
    supsLib.forEach(s=> set.add(String(s||"").trim() || "SEM SUPERVISÃO"));
  }else{
    (ctx.colaboradores||[]).forEach(c=>{
      const s = String(c?.supervisao||"").trim() || "SEM SUPERVISÃO";
      s.split(/[;,]/g).map(x=>String(x||"").trim()).filter(Boolean).forEach(x=> set.add(x));
      if(!s.trim()) set.add("SEM SUPERVISÃO");
    });
  }

  const arr = Array.from(set);
  const sem = arr.find(x=>isSemSup_(x));
  const rest = arr.filter(x=>!isSemSup_(x)).sort((a,b)=>normKey(a).localeCompare(normKey(b)));
  return [sem || "SEM SUPERVISÃO"].concat(rest);
}
function fillSelect(id, list){
  const el = document.getElementById(id);
  el.innerHTML = (list||[]).map(v=> `<option value="${esc(v)}">${esc(v)}</option>`).join("");
}

/** =============================
 * SUP CHANGE
 * ============================= */
function onChangeSup(tipo){
  if(tipo==="uniformes"){ renderUniformes(); refreshUltimoPDF("uniformes"); }
  if(tipo==="materiais"){ renderMateriais(); refreshUltimoPDF("materiais"); }
  if(tipo==="epis"){ renderEPIs(); refreshUltimoPDF("epis"); }
}

/** =============================
 * FILTRO colaboradores por Supervisão
 * ============================= */
function listColsBySup_(supSel){
  const arr = Array.isArray(ctx?.colaboradores) ? ctx.colaboradores : [];
  const supN = normKey(supSel||"");

  return arr.filter(c=>{
    const s = String(c?.supervisao||"").trim();
    if(isSemSup_(supSel)) return isSemSup_(s);

    const parts = String(s||"").split(/[;,]/g).map(x=>String(x||"").trim()).filter(Boolean);
    if(!parts.length) return false;
    return parts.some(p => normKey(p) === supN);
  });
}

/** =============================
 * Uniformes chips helper
 * ============================= */
function setUniformeField(k, field, value){
  if(!formUniformes[k]) return;
  if(field==="qtd") formUniformes[k].qtd = Number(value)||1;
  if(field==="tamanho") formUniformes[k].tamanho = String(value||"M").toUpperCase();
  if(field==="cor") formUniformes[k].cor = String(value||"VERDE").toUpperCase();
  renderUniformes();
}

/** =============================
 * UNIFORMES — RENDER + OUTROS
 * ============================= */
function renderUniformes(){
  const supSel = document.getElementById("supUniformes").value || "SEM SUPERVISÃO";
  const list = listColsBySup_(supSel);

  const el = document.getElementById("listaUniformes");
  const hint = document.getElementById("uniHint");
  hint.textContent = `Supervisão: ${supSel} | Total: ${(ctx.colaboradores||[]).length} | Nesta: ${list.length}`;

  if(!list.length){
    el.innerHTML = `<div class="muted">Nenhum colaborador encontrado para esta supervisão.</div>`;
    return;
  }

  list.sort((a,b)=> normKey(a.colaborador).localeCompare(normKey(b.colaborador)));

  const tamanhos = (ctx.tamanhos||[]).length ? ctx.tamanhos : TAMANHOS_FALLBACK;

  el.innerHTML = list.map(c=>{
    const nome = String(c.colaborador||"").trim();
    const k = colKey_(nome);

    if(!formUniformes[k]){
      formUniformes[k] = { nome, on:true, tamanho:"M", qtd:1, cor:"VERDE", supervisao:supSel, coordenacao:String(c.coordenacao||"") };
    }
    const st = formUniformes[k];

    return `
      <div class="uniRow">
        <input type="checkbox" ${st.on ? "checked":""}
          onchange="formUniformes['${esc(k)}'].on = this.checked; renderUniformes()">

        <div>
          <div class="nm">${esc(nome)}</div>
          <div class="sub">${esc(String(c.supervisao||""))}</div>

          <div class="mobileOnly" style="display:none;">
            <div class="chipsGroup">
              ${tamanhos.slice(0,10).map(t=>`
                <button class="chipBtn ${String(st.tamanho).toUpperCase()===String(t).toUpperCase()?"active":""}"
                  onclick="setUniformeField('${esc(k)}','tamanho','${esc(t)}')">${esc(t)}</button>
              `).join("")}
            </div>

            <div class="chipsGroup">
              ${[1,2].map(n=>`
                <button class="chipBtn ${(Number(st.qtd)===n)?"active":""}"
                  onclick="setUniformeField('${esc(k)}','qtd','${n}')">${n}x</button>
              `).join("")}
            </div>

            <div class="chipsGroup">
              ${CORES_UNIFORME.map(cor=>`
                <button class="chipBtn ${String(st.cor).toUpperCase()===String(cor).toUpperCase()?"active":""}"
                  onclick="setUniformeField('${esc(k)}','cor','${esc(cor)}')">${esc(cor)}</button>
              `).join("")}
            </div>
          </div>
        </div>

        <div class="desktopOnly">
          <select onchange="formUniformes['${esc(k)}'].tamanho = this.value">
            ${tamanhos.map(t=>`<option value="${esc(t)}" ${String(st.tamanho).toUpperCase()===String(t).toUpperCase()?"selected":""}>${esc(t)}</option>`).join("")}
          </select>
        </div>

        <div class="desktopOnly">
          <select onchange="formUniformes['${esc(k)}'].qtd = Number(this.value)||1; renderUniformes()">
            ${[1,2].map(n=>`<option value="${n}" ${Number(st.qtd)===n?"selected":""}>${n}</option>`).join("")}
          </select>
        </div>

        <div class="desktopOnly">
          <select onchange="formUniformes['${esc(k)}'].cor = this.value">
            ${CORES_UNIFORME.map(cor=>`<option value="${esc(cor)}" ${String(st.cor).toUpperCase()===String(cor).toUpperCase()?"selected":""}>${esc(cor)}</option>`).join("")}
          </select>
        </div>
      </div>
    `;
  }).join("");

  renderOutrosUniformes();
}

function addOutroUniforme(){
  const tamanho = document.getElementById("outUniTam").value;
  const qtd = Number(document.getElementById("outUniQtd").value)||0;
  const cor = document.getElementById("outUniCor").value || "VERDE";

  if(!tamanho){ showToast("Selecione um tamanho."); return; }
  if(qtd<=0){ showToast("Qtd deve ser > 0."); return; }

  outrosUniformes.push({ tamanho, qtd, cor });
  renderOutrosUniformes();
  showToast("OUTROS adicionado.");
}

function removeOutroUniforme(i){
  outrosUniformes.splice(i,1);
  renderOutrosUniformes();
}

function renderOutrosUniformes(){
  const el = document.getElementById("outrosUniformesList");
  if(!outrosUniformes.length){
    el.innerHTML = `<div class="muted">Nenhum OUTROS adicionado.</div>`;
    return;
  }
  el.innerHTML = outrosUniformes.map((o,i)=>`
    <div class="itemCard">
      <div class="grid3">
        <div><b>Tam:</b> ${esc(o.tamanho)}</div>
        <div><b>Qtd:</b> ${esc(o.qtd)}</div>
        <div><b>Cor:</b> ${esc(o.cor)}</div>
      </div>
      <div style="margin-top:10px;">
        <button class="btnGhost" onclick="removeOutroUniforme(${i})">Remover</button>
      </div>
    </div>
  `).join("");
}

/** =============================
 * MATERIAIS — FIXOS + OUTROS
 * ============================= */
function renderMateriais(){
  const elFix = document.getElementById("listaMateriaisFixos");
  elFix.innerHTML = MATERIAIS_FIXOS.map(nome=>{
    const v = Number(materiaisFixosQtd[nome]||0);
    return `
      <div class="itemCard">
        <div class="grid2" style="align-items:center;">
          <div><b>${esc(nome)}</b><div class="muted">Quantidade</div></div>
          <input inputmode="numeric" value="${esc(v)}"
            onchange="materiaisFixosQtd['${esc(nome)}']=Number(this.value)||0" />
        </div>
      </div>
    `;
  }).join("");

  renderMateriaisOutros();
}

function addMaterialOutro(){
  const desc = document.getElementById("matOutroDesc").value.trim();
  const qtd = Number(document.getElementById("matOutroQtd").value)||0;
  if(!desc || qtd<=0){
    showToast("Informe descrição e qtd > 0.");
    return;
  }
  materiaisOutros.push({ desc, qtd });
  document.getElementById("matOutroDesc").value = "";
  document.getElementById("matOutroQtd").value = "";
  renderMateriaisOutros();
}

function clearMateriaisOutros(){
  materiaisOutros = [];
  renderMateriaisOutros();
}

function removeMaterialOutro(i){
  materiaisOutros.splice(i,1);
  renderMateriaisOutros();
}

function renderMateriaisOutros(){
  const el = document.getElementById("listaMateriaisOutros");
  if(!materiaisOutros.length){
    el.innerHTML = `<div class="muted">Nenhum OUTROS adicionado.</div>`;
    return;
  }
  el.innerHTML = materiaisOutros.map((o,i)=>`
    <div class="itemCard">
      <div><b>${esc(o.desc)}</b></div>
      <div class="muted">Qtd: <b>${esc(o.qtd)}</b></div>
      <div style="margin-top:10px;">
        <button class="btnGhost" onclick="removeMaterialOutro(${i})">Remover</button>
      </div>
    </div>
  `).join("");
}

/** =============================
 * EPIs — FIXOS + BOTINAS
 * ============================= */
function renderEPIs(){
  const elFix = document.getElementById("listaEPIsFixos");
  elFix.innerHTML = EPIS_FIXOS.map(nome=>{
    const v = Number(episFixosQtd[nome]||0);
    return `
      <div class="itemCard">
        <div class="grid2" style="align-items:center;">
          <div><b>${esc(nome)}</b><div class="muted">Quantidade</div></div>
          <input inputmode="numeric" value="${esc(v)}"
            onchange="episFixosQtd['${esc(nome)}']=Number(this.value)||0" />
        </div>
      </div>
    `;
  }).join("");

  renderBotinas();
}

function addBotina(){
  const tamanho = document.getElementById("botTam").value.trim();
  const qtd = Number(document.getElementById("botQtd").value)||0;
  if(!tamanho || qtd<=0){
    showToast("Informe tamanho e qtd > 0.");
    return;
  }
  botinas.push({ tamanho, qtd });
  document.getElementById("botTam").value = "";
  document.getElementById("botQtd").value = "";
  renderBotinas();
}

function clearBotinas(){
  botinas = [];
  renderBotinas();
}

function removeBotina(i){
  botinas.splice(i,1);
  renderBotinas();
}

function renderBotinas(){
  const el = document.getElementById("listaBotinas");
  if(!botinas.length){
    el.innerHTML = `<div class="muted">Nenhuma botina adicionada.</div>`;
    return;
  }
  el.innerHTML = botinas.map((b,i)=>`
    <div class="itemCard">
      <div class="grid2">
        <div><b>Tamanho:</b> ${esc(b.tamanho)}</div>
        <div><b>Qtd:</b> ${esc(b.qtd)}</div>
      </div>
      <div style="margin-top:10px;">
        <button class="btnGhost" onclick="removeBotina(${i})">Remover</button>
      </div>
    </div>
  `).join("");
}

/** =============================
 * SALVAR + PDF DOWNLOAD
 * ============================= */
async function salvarAtual(){
  if(tab==="uniformes") return salvarUniformes();
  if(tab==="materiais") return salvarMateriaisUI();
  if(tab==="epis") return salvarEPIsUI();
  if(tab==="patrimonios") return showToast("Patrimônios é somente consulta.");
}

async function salvarUniformes(){
  const sup = document.getElementById("supUniformes").value || "SEM SUPERVISÃO";
  const pedidoId = document.getElementById("pedidoIdUniformes").value.trim();
  const modoSel = document.getElementById("modoUniformes").value;

  const list = listColsBySup_(sup).sort((a,b)=> normKey(a.colaborador).localeCompare(normKey(b.colaborador)));

  const itens = [];
  list.forEach(c=>{
    const nome = String(c.colaborador||"").trim();
    const k = colKey_(nome);
    const st = formUniformes[k];
    if(!st || !st.on) return;

    // ✅ formato "flat" para planilha + mantém colaborador (útil para auditoria)
    itens.push({
      data: String(ctx.dataRef||""),
      gestor: String((ctx.gestor && (ctx.gestor.nome||ctx.gestor.Nome)) || "").trim(),
      coordenacao: String(c.coordenacao||ctx.gestor?.coordenacao||"").trim(),
      supervisao: String(sup||"").trim(),
      colaborador: nome,
      qtd: Number(st.qtd||1)||1,
      tamanho: String(st.tamanho||"M").toUpperCase(),
      cor: String(st.cor||"VERDE").toUpperCase()
    });
  });

  const payload = {
    dataRef: ctx.dataRef,
    data: String(ctx.dataRef||""),
    gestor: String((ctx.gestor && (ctx.gestor.nome||ctx.gestor.Nome)) || "").trim(),
    coordenacao: String(ctx.gestor?.coordenacao||"").trim(),
    modo: modoSel,
    supervisao: sup,
    pedidoId: (modoSel==="ATUALIZAR" ? pedidoId : ""),
    itens,
    // outros = itens fora da lista (sem colaborador) — ainda inclui data/gestor/sup/coord
    outros: (outrosUniformes||[]).map(o=>({
      data: String(ctx.dataRef||""),
      gestor: String((ctx.gestor && (ctx.gestor.nome||ctx.gestor.Nome)) || "").trim(),
      coordenacao: String(ctx.gestor?.coordenacao||"").trim(),
      supervisao: String(sup||"").trim(),
      colaborador: "",
      qtd: Number(o.qtd||0)||0,
      tamanho: String(o.tamanho||"").toUpperCase(),
      cor: String(o.cor||"").toUpperCase()
    })).filter(x=>x.qtd>0)
  };

  document.getElementById("saveStatusUniformes").textContent = "Salvando…";
  setBusy(true); setBtnDisabled(true);

  const res = await api("salvarTamanhos", { payload });

  setBusy(false); setBtnDisabled(false);

  if(!res.ok){
    const msg = res.error || "Erro ao salvar.";
    document.getElementById("saveStatusUniformes").innerHTML = `<span class="err">${esc(msg)}</span>`;
    showToast(msg);
    return;
  }

  if(res.pedidoId) document.getElementById("pedidoIdUniformes").value = res.pedidoId;

  document.getElementById("saveStatusUniformes").innerHTML = `<span class="ok">${esc(res.message||"Salvo!")}</span>`;
  showToast("Salvo! Baixando PDF…");

  const pdf = res.pdfUrlDownload || res.pdfUrl || "";
  if(pdf){
    const fname = res.pdfFileName || `Uniformes_${String(ctx.dataRef||"").replaceAll("/","-")}.pdf`;
    forceDownload_(pdf, fname);
  }else{
    await refreshUltimoPDF("uniformes");
  }
}

async function salvarMateriaisUI(){
  const sup = document.getElementById("supMateriais").value || "SEM SUPERVISÃO";
  const pedidoId = document.getElementById("pedidoIdMateriais").value.trim();
  const modoSel = document.getElementById("modoMateriais").value;

  const base = {
    data: String(ctx.dataRef||""),
    gestor: String((ctx.gestor && (ctx.gestor.nome||ctx.gestor.Nome)) || "").trim(),
    coordenacao: String(ctx.gestor?.coordenacao||"").trim(),
    supervisao: String(sup||"").trim()
  };

  const fixos = MATERIAIS_FIXOS
    .map(n=>({ ...base, material:n, qtd:Number(materiaisFixosQtd[n]||0)||0 }))
    .filter(x=>x.qtd>0);

  const outros = materiaisOutros.slice()
    .map(o=>({ ...base, material:String(o.desc||"").trim(), qtd:Number(o.qtd||0)||0 }))
    .filter(x=>x.material && x.qtd>0);

  const payload = {
    dataRef: ctx.dataRef,
    ...base,
    modo: modoSel,
    pedidoId: (modoSel==="ATUALIZAR" ? pedidoId : ""),
    itens: fixos.concat(outros)
  };

  document.getElementById("saveStatusMateriais").textContent = "Salvando…";
  setBusy(true); setBtnDisabled(true);

  const res = await api("salvarMateriais", { payload });

  setBusy(false); setBtnDisabled(false);

  if(!res.ok){
    const msg = res.error || "Erro ao salvar.";
    document.getElementById("saveStatusMateriais").innerHTML = `<span class="err">${esc(msg)}</span>`;
    showToast(msg);
    return;
  }

  if(res.pedidoId) document.getElementById("pedidoIdMateriais").value = res.pedidoId;

  document.getElementById("saveStatusMateriais").innerHTML = `<span class="ok">${esc(res.message||"Salvo!")}</span>`;
  showToast("Salvo! Baixando PDF…");

  const pdf = res.pdfUrlDownload || res.pdfUrl || "";
  if(pdf){
    const fname = res.pdfFileName || `Materiais_${String(ctx.dataRef||"").replaceAll("/","-")}.pdf`;
    forceDownload_(pdf, fname);
  }else{
    await refreshUltimoPDF("materiais");
  }
}

async function salvarEPIsUI(){
  const sup = document.getElementById("supEPIs").value || "SEM SUPERVISÃO";
  const pedidoId = document.getElementById("pedidoIdEPIs").value.trim();
  const modoSel = document.getElementById("modoEPIs").value;

  const base = {
    data: String(ctx.dataRef||""),
    gestor: String((ctx.gestor && (ctx.gestor.nome||ctx.gestor.Nome)) || "").trim(),
    coordenacao: String(ctx.gestor?.coordenacao||"").trim(),
    supervisao: String(sup||"").trim()
  };

  const itens = [];

  EPIS_FIXOS.forEach(n=>{
    const un = Number(episFixosQtd[n]||0)||0;
    if(un>0) itens.push({ ...base, material:n, qtd:un });
  });

  botinas.forEach(b=>{
    const tam = String(b.tamanho||"").trim();
    const un = Number(b.qtd||0)||0;
    if(tam && un>0) itens.push({ ...base, material:"Botina", tamanho:tam, qtd:un });
  });

  const payload = {
    dataRef: ctx.dataRef,
    ...base,
    modo: modoSel,
    pedidoId: (modoSel==="ATUALIZAR" ? pedidoId : ""),
    itens
  };

  document.getElementById("saveStatusEPIs").textContent = "Salvando…";
  setBusy(true); setBtnDisabled(true);

  const res = await api("salvarEPIs", { payload });

  setBusy(false); setBtnDisabled(false);

  if(!res.ok){
    const msg = res.error || "Erro ao salvar.";
    document.getElementById("saveStatusEPIs").innerHTML = `<span class="err">${esc(msg)}</span>`;
    showToast(msg);
    return;
  }

  if(res.pedidoId) document.getElementById("pedidoIdEPIs").value = res.pedidoId;

  document.getElementById("saveStatusEPIs").innerHTML = `<span class="ok">${esc(res.message||"Salvo!")}</span>`;
  showToast("Salvo! Baixando PDF…");

  const pdf = res.pdfUrlDownload || res.pdfUrl || "";
  if(pdf){
    const fname = res.pdfFileName || `EPIs_${String(ctx.dataRef||"").replaceAll("/","-")}.pdf`;
    forceDownload_(pdf, fname);
  }else{
    await refreshUltimoPDF("epis");
  }
}

/** =============================
 * ÚLTIMO PEDIDO / ÚLTIMO PDF
 * ============================= */
function getSupByTipo(tipo){
  if(tipo==="uniformes") return document.getElementById("supUniformes").value || "SEM SUPERVISÃO";
  if(tipo==="materiais") return document.getElementById("supMateriais").value || "SEM SUPERVISÃO";
  if(tipo==="epis") return document.getElementById("supEPIs").value || "SEM SUPERVISÃO";
  return "SEM SUPERVISÃO";
}

async function refreshUltimoPDF(tipo){
  const sup = getSupByTipo(tipo);
  const res = await api("carregarUltimoPDF", { payload:{ tipo, supervisao:sup } });
  if(!res.ok) return;

  const pdfUrl = res.pdfUrlDownload || res.pdfUrl || "";
  const elId = (tipo==="uniformes") ? "infoUltimoUniformes" : (tipo==="materiais") ? "infoUltimoMateriais" : "infoUltimoEPIs";
  const el = document.getElementById(elId);

  if(!pdfUrl){
    el.innerHTML = `<span class="muted">Nenhum PDF encontrado para esta supervisão.</span>`;
    return;
  }
  el.innerHTML = `Último PDF: <a href="${esc(pdfUrl)}" target="_blank" rel="noopener">link</a>`;
}

async function carregarUltimoPedido(tipo){
  const sup = getSupByTipo(tipo);

  setBusy(true); setBtnDisabled(true);
  const res = await api("carregarUltimoPedido", { payload:{ tipo, supervisao:sup } });
  setBusy(false); setBtnDisabled(false);

  const elId = (tipo==="uniformes") ? "infoUltimoUniformes" : (tipo==="materiais") ? "infoUltimoMateriais" : "infoUltimoEPIs";
  const el = document.getElementById(elId);

  if(!res.ok){
    el.innerHTML = `<span class="err">${esc(res.error||"Erro")}</span>`;
    showToast(res.error || "Erro ao carregar último pedido.");
    return;
  }
  if(!res.last){
    el.innerHTML = `<span class="muted">Nenhum pedido anterior encontrado.</span>`;
    showToast("Nenhum pedido anterior.");
    return;
  }

  const pedidoId = res.last.pedidoId || "";
  const data = res.last.data || {};

  if(tipo==="uniformes"){
    document.getElementById("modoUniformes").value = "ATUALIZAR";
    modo.uniformes = "ATUALIZAR";
    document.getElementById("pedidoIdUniformes").value = pedidoId;

    const itens = Array.isArray(data.itens) ? data.itens : [];
    const outros = Array.isArray(data.outros) ? data.outros : [];

    Object.keys(formUniformes).forEach(k=> formUniformes[k].on = false);

    itens.forEach(it=>{
      const nome = String(it.colaborador||"").trim();
      const k = colKey_(nome);
      if(!formUniformes[k]) formUniformes[k] = { nome, on:true, tamanho:"M", qtd:1, cor:"VERDE" };
      formUniformes[k].on = true;
      formUniformes[k].tamanho = String(it.tamanho||"M").toUpperCase();
      formUniformes[k].qtd = Number(it.qtd||1)||1;
      formUniformes[k].cor = String(it.cor||"VERDE").toUpperCase();
    });

    outrosUniformes = outros.map(o=>({
      tamanho:String(o.tamanho||o.tam||"").trim(),
      qtd:Number(o.qtd||o.un||0)||0,
      cor:String(o.cor||"VERDE").toUpperCase()
    })).filter(o=>o.tamanho && o.qtd>0);

    renderUniformes();
  }

  if(tipo==="materiais"){
    document.getElementById("modoMateriais").value = "ATUALIZAR";
    modo.materiais = "ATUALIZAR";
    document.getElementById("pedidoIdMateriais").value = pedidoId;

    MATERIAIS_FIXOS.forEach(n=> materiaisFixosQtd[n]=0);
    materiaisOutros = [];

    const itens = Array.isArray(data.itens) ? data.itens : [];
    itens.forEach(it=>{
      const nome = String(it.material||"").trim().toUpperCase();
      const un = Number(it.un||0)||0;
      if(!nome || un<=0) return;
      if(MATERIAIS_FIXOS.includes(nome)){
        materiaisFixosQtd[nome] = un;
      }else{
        materiaisOutros.push({ desc:nome, qtd:un });
      }
    });

    renderMateriais();
  }

  if(tipo==="epis"){
    document.getElementById("modoEPIs").value = "ATUALIZAR";
    modo.epis = "ATUALIZAR";
    document.getElementById("pedidoIdEPIs").value = pedidoId;

    EPIS_FIXOS.forEach(n=> episFixosQtd[n]=0);
    botinas = [];

    const itens = Array.isArray(data.itens) ? data.itens : [];
    itens.forEach(it=>{
      const epi = String(it.epi||"").trim();
      if(!epi) return;

      if(normKey(epi)===normKey("Botina")){
        const tam = String(it.tamanho||"").trim();
        const un = Number(it.un||0)||0;
        if(tam && un>0) botinas.push({ tamanho:tam, qtd:un });
        return;
      }

      const found = EPIS_FIXOS.find(x=> normKey(x)===normKey(epi));
      const un = Number(it.un||0)||0;
      if(found && un>0) episFixosQtd[found] = un;
    });

    renderEPIs();
  }

  el.innerHTML = `<span class="ok">Carregado pedidoId: ${esc(pedidoId)}</span>`;
  showToast("Último pedido carregado!");
}

/** =============================
 * PATRIMONIOS
 * ============================= */
let lastPatrimoniosCache = [];

async function carregarPatrimonios(){
  const sup = document.getElementById("supPatrimonios").value || "SEM SUPERVISÃO";

  document.getElementById("patriInfo").textContent = "Consultando…";
  document.getElementById("listaPatrimonios").innerHTML = "";
  setBusy(true); setBtnDisabled(true);

  const res = await api("carregarPatrimonios", { payload:{ supervisao:sup } });

  setBusy(false); setBtnDisabled(false);

  if(!res.ok){
    document.getElementById("patriInfo").innerHTML = `<span class="err">${esc(res.error||"Erro")}</span>`;
    showToast(res.error || "Erro ao consultar.");
    return;
  }

  const itens = Array.isArray(res.itens) ? res.itens : [];
  lastPatrimoniosCache = itens;

  document.getElementById("patriInfo").innerHTML =
    `<span class="ok">Itens: ${itens.length}</span> <span class="muted">| Modo: ${esc(patModo)}</span>`;

  renderPatrimonios(itens);
}

function renderPatrimonios(itens){
  const el = document.getElementById("listaPatrimonios");
  if(!Array.isArray(itens) || !itens.length){
    el.innerHTML = `<div class="muted">Nenhum item encontrado.</div>`;
    return;
  }

  const arr = itens.map(it=>{
    const d = Number(it.diasSemLeitura||it.dias||0) || 0;
    return { ...it, _dias:d, _col:normKey(it.funcionario||it.colaborador||"") };
  });

  if(patModo === "LISTA"){
    arr.sort((a,b)=> (b._dias - a._dias) || normKey(a.patrimonio).localeCompare(normKey(b.patrimonio)));

    el.innerHTML = arr.slice(0,400).map(it=>`
      <div class="itemCard">
        <div style="font-weight:1000;">${esc(it.patrimonio||"-")} — ${esc(it.identificacao||"")}</div>
        <div class="muted">
          ${esc(it.funcionario||"")} • ${esc(it.supervisao||"")} • ${esc(it.coordenacao||"")}<br>
          Última leitura: ${esc(it.ultimaLeitura||"-")} • Dias sem leitura: <b>${esc(it._dias)}</b>
        </div>
      </div>
    `).join("");
    return;
  }

  const map = new Map();
  arr.forEach(it=>{
    const nome = String(it.funcionario||it.colaborador||"").trim() || "(Sem nome)";
    const k = normKey(nome);
    if(!map.has(k)) map.set(k, { nome, itens:[] });
    map.get(k).itens.push(it);
  });

  const groups = Array.from(map.values()).sort((a,b)=> normKey(a.nome).localeCompare(normKey(b.nome)));

  el.innerHTML = groups.map(g=>{
    g.itens.sort((a,b)=> (b._dias - a._dias) || normKey(a.patrimonio).localeCompare(normKey(b.patrimonio)));

    const maxDias = Math.max(...g.itens.map(x=>x._dias||0), 0);

    return `
      <details class="itemCard">
        <summary>
          <span>👤 ${esc(g.nome)}</span>
          <span class="hint">Itens: ${g.itens.length} • Máx: ${maxDias} dias</span>
        </summary>

        <div style="margin-top:10px;">
          ${g.itens.map(it=>`
            <div style="padding:10px 0; border-top:1px solid rgba(255,255,255,.10);">
              <div style="font-weight:1000;">${esc(it.patrimonio||"-")} — ${esc(it.identificacao||"")}</div>
              <div class="muted">
                Última leitura: ${esc(it.ultimaLeitura||"-")} • Dias sem leitura: <b>${esc(it._dias)}</b>
              </div>
            </div>
          `).join("")}
        </div>
      </details>
    `;
  }).join("");
}

/** =============================
 * AÇÕES GERAIS
 * ============================= */
async function reloadAll(){
  if(!token){ location.reload(); return; }
  await bootstrap();
}
function logout(){
  token = "";
  location.reload();
}

/** INIT */
window.addEventListener("load", async ()=>{
  // ✅ se já existe sessão do Gestor, não mostra login
  const t = getTokenFromPainel_();
  if(t){
    token = t;

    // esconde login / mostra app
    const cardLogin = document.getElementById("cardLogin");
    const app = document.getElementById("app");
    if(cardLogin) cardLogin.style.display = "none";
    if(app) app.style.display = "";

    // carrega direto
    try{
      await bootstrap();
    }catch(e){
      showToast("Falha ao carregar contexto: " + (e?.message || e));
    }
  }
});
