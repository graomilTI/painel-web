
(function(){
  if(!window.Auth?.requireAuth?.()) return;

  const cfg = window.PAINEL_CONFIG || {};
  const LIM = Number(cfg.LIMITE_HORA_DIA || 18);

  const el = {
    dataRef: document.getElementById("dataRef"),
    selSup: document.getElementById("selSup"),
    btnContexto: document.getElementById("btnContexto"),
    ctxBadge: document.getElementById("ctxBadge"),
    steps: document.getElementById("steps"),
    etapaAtual: document.getElementById("etapaAtual"),
// [DESATIVADO]     btnPrev: document.getElementById("btnPrev"),
// [DESATIVADO]     btnNext: document.getElementById("btnNext"),
    lista: document.getElementById("lista"),
    busca: document.getElementById("busca"),
  };

  const state = {
    etapa: "A",
    contexto: null,
    colaboradores: [],  // {id,nome,bloqueado, ...}
    filtro: ""
  };

  function pad2(n){ return String(n).padStart(2,"0"); }
  function dmy(dt){ return pad2(dt.getDate()) + "/" + pad2(dt.getMonth()+1) + "/" + dt.getFullYear(); }

  function defaultDate(){
    const now = new Date();
    const dt = new Date(now);
    if(now.getHours() >= LIM){
      dt.setDate(dt.getDate()+1);
    }
    return dmy(dt);
  }

  function setBadge(text, ok){
    if(!el.ctxBadge) return;
    el.ctxBadge.textContent = text;
    el.ctxBadge.style.borderColor = ok ? "rgba(34,197,94,.45)" : "rgba(239,68,68,.35)";
    el.ctxBadge.style.background = ok ? "rgba(34,197,94,.14)" : "rgba(239,68,68,.12)";
    el.ctxBadge.style.color = "rgba(255,255,255,.85)";
  }

  function setEtapa(etapa){
    state.etapa = etapa;
    if(el.etapaAtual) el.etapaAtual.textContent = etapa;

    el.steps?.querySelectorAll(".stepbtn").forEach(b=>{
      b.classList.toggle("active", b.getAttribute("data-step") === etapa);
    });

    renderLista();
  }

  function getSupList(){
    const sups = window.Auth.getSupervisoes?.() || [];
    // normaliza (remove vazios)
    return (sups || []).map(s=>String(s).trim()).filter(Boolean);
  }

  function fillSup(){
    const sups = getSupList();
    if(!el.selSup) return;

    el.selSup.innerHTML = "";
    if(!sups.length){
      el.selSup.innerHTML = `<option value="">(sem supervisões liberadas)</option>`;
      el.selSup.disabled = true;
      return;
    }
    el.selSup.appendChild(new Option("Selecione...", ""));
    sups.forEach(s=> el.selSup.appendChild(new Option(s, s)));

    if(sups.length === 1){
      el.selSup.value = sups[0];
      el.selSup.disabled = true;
    }
  }

  function getChave(){
    const dataRef = (el.dataRef?.value || "").trim();
    const sup = (el.selSup?.value || "").trim();
    if(!dataRef || !sup) return null;
    return { dataRef, sup };
  }

  async function carregarContexto(){
    const chave = getChave();
    if(!chave){
      alert("Selecione a data e a supervisão.");
      return;
    }
    setBadge("Carregando contexto…", true);
    try{
      // esperado no worker/GS:
      // { ok:true, contexto:{...}, colaboradores:[{id,nome,bloqueado, motivo}] }
      const json = await apiPost("programacao_contexto", chave);
      state.contexto = json.contexto || {};
      state.colaboradores = Array.isArray(json.colaboradores) ? json.colaboradores : [];
      setBadge("Contexto carregado.", true);
      renderLista();
    }catch(e){
      console.error(e);
      setBadge("Falha ao carregar.", false);
      alert("Erro ao carregar contexto: " + (e.message || e));
    }
  }

  function renderLista(){
    if(!el.lista) return;

    if(!state.colaboradores.length){
      el.lista.innerHTML = `<div class="mini">Nenhum colaborador no contexto.</div>`;
      return;
    }

    const q = (state.filtro || "").toLowerCase();
    const items = state.colaboradores.filter(c=>{
      const nome = (c.nome || c.Nome || "").toLowerCase();
      return !q || nome.includes(q);
    });

    el.lista.innerHTML = "";
    items.forEach((c, idx)=>{
      const nome = c.nome || c.Nome || ("Colaborador " + (idx+1));
      const bloqueado = !!c.bloqueado;
      const motivo = c.motivo || c.Motivo || "";
      const id = c.id || c.cpf || c.CPF || nome;

      const row = document.createElement("div");
      row.className = "rowItem";
      row.innerHTML = `
        <div class="left">
          <input type="checkbox" class="chk" data-id="${String(id).replace(/"/g,'&quot;')}" ${bloqueado ? "disabled" : ""}/>
          <div>
            <div style="font-weight:900">${nome}</div>
            <div class="mini">${bloqueado ? "Bloqueado" + (motivo ? " • " + motivo : "") : "Liberado"}</div>
          </div>
        </div>
        <div class="pill">Etapa ${state.etapa}</div>
      `;
      el.lista.appendChild(row);
    });
  }

  async function salvarSilencioso(){
    const chave = getChave();
    if(!chave) return;

    // coleta seleção do checklist
    const selecionados = Array.from(el.lista?.querySelectorAll("input.chk") || [])
      .filter(i=>i.checked)
      .map(i=>i.getAttribute("data-id"));

    try{
      await apiPost("programacao_salvar_etapa", {
        ...chave,
        etapa: state.etapa,
        selecionados
      });
    }catch(e){
      console.error(e);
      // silencioso (não bloquear), mas sinaliza no badge
      setBadge("⚠️ Não salvou (ver console).", false);
    }
  }

  function nextStep(step){
    const order = ["A","B","C","D","E"];
    const i = order.indexOf(step);
    return order[Math.min(order.length-1, i+1)];
  }
  function prevStep(step){
    const order = ["A","B","C","D","E"];
    const i = order.indexOf(step);
    return order[Math.max(0, i-1)];
  }

  async function onNext(){
    await salvarSilencioso();
    setEtapa(nextStep(state.etapa));
  }
  async function onPrev(){
    await salvarSilencioso();
    setEtapa(prevStep(state.etapa));
  }

  function bind(){
    el.btnContexto?.addEventListener("click", carregarContexto);
    el.steps?.addEventListener("click", (ev)=>{
      const b = ev.target.closest(".stepbtn");
      if(!b) return;
      setEtapa(b.getAttribute("data-step"));
    });
// [DESATIVADO] navegação por botões (cards fazem a troca)
//     el.btnNext?.addEventListener("click", onNext);
// [DESATIVADO] navegação por botões (cards fazem a troca)
//     el.btnPrev?.addEventListener("click", onPrev);
    el.busca?.addEventListener("input", ()=>{
      state.filtro = el.busca.value || "";
      renderLista();
    });
  }

  // init
  if(el.dataRef) el.dataRef.value = defaultDate();
  fillSup();
  bind();
  setEtapa("A");
  setBadge("Nenhum contexto carregado.", true);
})();
