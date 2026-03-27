(function () {
  if (!window.Auth?.requireAuth?.()) return;

  const supabase = window.supabaseClient;

  const el = {
    dataRef: document.getElementById("dataRef"),
    selSup: document.getElementById("selSup"),
    btnContexto: document.getElementById("btnContexto"),
    lista: document.getElementById("lista"),
  };

  const state = {
    contextoId: null,
    colaboradores: [],
    supervisoes: [],
  };

  init();

  async function init() {
    await carregarSupervisoes();
    carregarSupervisoesUsuario();
  }

  async function carregarSupervisoes() {
    const { data } = await supabase
      .from("supervisoes")
      .select("id, nome")
      .eq("ativo", true)
      .order("nome");

    state.supervisoes = data || [];
  }

  function carregarSupervisoesUsuario() {
    const sups = window.Auth.getSupervisoes?.() || [];
    el.selSup.innerHTML = sups.map(s => `<option>${s}</option>`).join("");
  }

  el.btnContexto.onclick = async () => {
    const data = el.dataRef.value;
    const supervisao = el.selSup.value;

    const { data: ctx } = await supabase
      .from("programacao_contextos")
      .upsert({
        data_referencia: data,
        supervisao,
      }, { onConflict: "data_referencia,supervisao" })
      .select()
      .single();

    state.contextoId = ctx.id;

    state.colaboradores = [
      { nome: "JOÃO TESTE", cpf: "1" },
      { nome: "MARIA TESTE", cpf: "2" },
    ];

    render();
  };

  function render() {
    el.lista.innerHTML = state.colaboradores.map(c => `
      <div class="card">
        <h3>${c.nome}</h3>

        <select onchange="pg.onChangeStatus(this, '${c.cpf}')">
          ${opt(["Disponível","Atestado","Férias","Falta","Folga","Inativo","Transferir"])}
        </select>

        <div id="transfer_${c.cpf}"></div>

        <select onchange="pg.save('${c.cpf}')">
          ${opt(["Casa","Alojamento","Hotel"],"Casa")}
        </select>

        <select onchange="pg.save('${c.cpf}')">
          ${opt(["Café","Almoço","Janta"])}
        </select>

        <select onchange="pg.save('${c.cpf}')">
          ${opt(["Frota","Uber / Táxi","Km"])}
        </select>
      </div>
    `).join("");
  }

  function opt(arr, def){
    return arr.map(v=>`<option ${v===def?'selected':''}>${v}</option>`).join("");
  }

  window.pg = {};

  window.pg.onChangeStatus = function(el, cpf){
    const div = document.getElementById(`transfer_${cpf}`);

    if(el.value === "Transferir"){
      div.innerHTML = `
        <select onchange="pg.save('${cpf}')">
          ${state.supervisoes.map(s=>`<option value="${s.id}">${s.nome}</option>`).join("")}
        </select>
      `;
    } else {
      div.innerHTML = "";
    }

    pg.save(cpf);
  }

  window.pg.save = async function(cpf){
    if(!state.contextoId) return;

    const card = [...document.querySelectorAll(".card")]
      .find(c=>c.innerText.includes(cpf));

    const selects = card.querySelectorAll("select");

    const payload = {
      contexto_id: state.contextoId,
      colaborador_cpf: cpf,
      colaborador_nome: card.querySelector("h3").innerText,
      disponibilidade_status: selects[0].value,
      estadia_tipo: selects[1].value,
      alimentacao_tipo: selects[2].value,
      deslocamento_tipo: selects[3].value,
    };

    if(payload.disponibilidade_status === "Transferir"){
      payload.disponibilidade_transferir_supervisao_id = selects[1]?.value || null;
    }

    await supabase
      .from("programacao_itens")
      .upsert(payload,{ onConflict: "contexto_id,colaborador_cpf" });
  }

})();