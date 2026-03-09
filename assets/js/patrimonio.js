(function(){
  const MOD = {};

  function el(html){
    const d = document.createElement("div");
    d.innerHTML = html.trim();
    return d.firstChild;
  }

  function css(){
    return `
      .pat-root{ padding:14px; }
      .pat-top{ display:flex; gap:10px; align-items:center; justify-content:space-between; margin-bottom:12px; }
      .pat-card{ background:#0b1220; border:1px solid rgba(255,255,255,.10); border-radius:14px; padding:12px; box-shadow: 0 10px 30px rgba(0,0,0,.25); }
      .pat-row{ display:flex; gap:10px; align-items:center; flex-wrap:wrap; }
      .pat-title{ font-weight:800; letter-spacing:.2px; }
      .pat-muted{ opacity:.78; font-size:12px; }
      .pat-grid{ display:grid; grid-template-columns: 1.1fr .7fr 1fr .9fr .7fr; gap:10px; align-items:center; }
      .pat-grid.head{ opacity:.8; font-size:12px; text-transform:uppercase; letter-spacing:.08em; }
      .pat-grid > div{ padding:8px 10px; }
      .pat-inp, .pat-sel{
        width:100%; height:38px; border-radius:10px; border:1px solid rgba(255,255,255,.14);
        background:#0f172a; color:#e5e7eb; outline:none; padding:0 10px;
        color-scheme: dark;
      }
      .pat-sel option{ background:#0f172a; color:#e5e7eb; }
      .pat-btn{
        height:38px; padding:0 14px; border-radius:10px; border:1px solid rgba(255,255,255,.14);
        background:#0f172a; color:#e5e7eb; cursor:pointer;
      }
      .pat-btn.primary{ border-color: rgba(22,101,52,.65); background: rgba(22,101,52,.18); }
      .pat-btn.danger{ border-color: rgba(220,38,38,.55); background: rgba(220,38,38,.12); }
      .pat-badge{ display:inline-flex; padding:4px 10px; border-radius:999px; border:1px solid rgba(255,255,255,.14); font-size:12px; opacity:.9; }
      .pat-sep{ height:10px; }
      .pat-list{ display:flex; flex-direction:column; gap:10px; }
      .pat-actions{ display:flex; gap:10px; align-items:center; justify-content:flex-end; margin-top:10px; }
      .pat-small{ font-size:12px; opacity:.8; }
    `;
  }

  async function apiCall(opts, action, payload){
    // compat com seu padrão: opts.api(action, payload, module)
    if (opts && typeof opts.api === "function"){
      return await opts.api(action, payload, "patrimonio");
    }
    throw new Error("opts.api não informado");
  }

  function unique(arr){ return Array.from(new Set(arr.filter(Boolean))); }

  function renderGestor(container, opts){
    container.innerHTML = "";
    container.appendChild(el(`<style>${css()}</style>`));

    const root = el(`<div class="pat-root"></div>`);
    container.appendChild(root);

    const top = el(`
      <div class="pat-top">
        <div>
          <div class="pat-title">Patrimônio</div>
          <div class="pat-muted">Preencha Número + Responsável e envie para cadastro (ADM).</div>
        </div>
        <div class="pat-row">
          <select class="pat-sel" id="pat_unidade"><option value="">Unidade (todas)</option></select>
          <button class="pat-btn" id="pat_refresh">Atualizar</button>
        </div>
      </div>
    `);
    root.appendChild(top);

    const card = el(`<div class="pat-card"><div class="pat-list" id="pat_list"></div></div>`);
    root.appendChild(card);

    const listEl = card.querySelector("#pat_list");
    const unidadeSel = top.querySelector("#pat_unidade");

    async function load(){
      listEl.innerHTML = `<div class="pat-muted">Carregando...</div>`;

      const payload = {
        unidade: unidadeSel.value || "",
        gestor: (opts && opts.auth && opts.auth.nome) ? opts.auth.nome : "",
        // supervisao: opcional
      };

      const res = await apiCall(opts, "patrimonio_listarPendentes", payload);
      if (!res || !res.ok) {
        listEl.innerHTML = `<div class="pat-muted">Erro ao carregar</div>`;
        return;
      }

      // popula unidades
      const unidades = unique(res.data.map(x => x.Unidade));
      const current = unidadeSel.value;
      unidadeSel.innerHTML = `<option value="">Unidade (todas)</option>` + unidades.map(u => `<option value="${u}">${u}</option>`).join("");
      if (current) unidadeSel.value = current;

      // filtra para o gestor: pendentes e acompanhamento
      const rows = res.data.sort((a,b)=> (a.Unidade||"").localeCompare(b.Unidade||"") || (a.Material||"").localeCompare(b.Material||""));

      if (!rows.length){
        listEl.innerHTML = `<div class="pat-muted">Nenhum patrimônio pendente.</div>`;
        return;
      }

      // agrupa por unidade (como você pediu)
      const byUni = {};
      rows.forEach(r=>{
        const u = r.Unidade || "—";
        (byUni[u] ||= []).push(r);
      });

      listEl.innerHTML = "";
      Object.keys(byUni).sort().forEach(u=>{
        const block = el(`<div></div>`);
        block.appendChild(el(`<div class="pat-row" style="justify-content:space-between;margin-bottom:6px;">
          <div class="pat-badge">UNIDADE: <b style="margin-left:6px">${u}</b></div>
          <div class="pat-small">Itens: ${byUni[u].length}</div>
        </div>`));

        // header
        block.appendChild(el(`
          <div class="pat-grid head">
            <div>Material</div>
            <div>Número</div>
            <div>Responsável</div>
            <div>Status</div>
            <div>Ação</div>
          </div>
        `));

        byUni[u].forEach(item=>{
          const canEdit = item.Status === "PENDENTE_NUMERO";
          const row = el(`
            <div class="pat-grid" data-row="${item.sheetRow}">
              <div>
                <div style="font-weight:700">${item.Material || "—"}</div>
                <div class="pat-muted">Pedido: ${item.PedidoId || "—"}</div>
              </div>
              <div>
                <input class="pat-inp" placeholder="Ex: 000123" value="${item.Numero||""}" ${canEdit ? "" : "disabled"} />
              </div>
              <div>
                <select class="pat-sel" ${canEdit ? "" : "disabled"}>
                  <option value="">Selecione...</option>
                </select>
              </div>
              <div>
                <span class="pat-badge">${item.Status}</span>
              </div>
              <div>
                ${canEdit ? `<button class="pat-btn primary">Solicitar cadastro</button>` : `<button class="pat-btn" disabled>—</button>`}
              </div>
            </div>
          `);

          // lista de colaboradores: usa opts.colaboradores se existir, senão deixa vazio
          const sel = row.querySelector("select");
          const colabs = (opts && opts.colaboradores && Array.isArray(opts.colaboradores)) ? opts.colaboradores : [];
          if (colabs.length){
            sel.innerHTML = `<option value="">Selecione...</option>` + colabs.map(n=>`<option value="${n}">${n}</option>`).join("");
            if (item.ColaboradorResponsavel) sel.value = item.ColaboradorResponsavel;
          } else {
            // fallback
            sel.innerHTML = `<option value="${item.ColaboradorResponsavel||""}">${item.ColaboradorResponsavel||"— (lista não carregada)"}</option>`;
          }

          if (canEdit){
            row.querySelector("button").onclick = async ()=>{
              const numero = row.querySelector("input").value.trim();
              const colaborador = sel.value.trim();
              if (!numero) return alert("Informe o Número.");
              if (!colaborador) return alert("Selecione o Responsável.");

              row.querySelector("button").textContent = "Enviando...";
              row.querySelector("button").disabled = true;

              const resp = await apiCall(opts, "patrimonio_solicitarCadastro", {
                updates: [{ sheetRow: item.sheetRow, numero, colaborador }]
              });

              if (!resp || !resp.ok) alert("Erro ao solicitar cadastro.");
              await load();
            };
          }

          block.appendChild(row);
        });

        block.appendChild(el(`<div class="pat-sep"></div>`));
        listEl.appendChild(block);
      });
    }

    top.querySelector("#pat_refresh").onclick = load;
    unidadeSel.onchange = load;
    load();
  }

  function renderADM(container, opts){
    container.innerHTML = "";
    container.appendChild(el(`<style>${css()}</style>`));

    const root = el(`<div class="pat-root"></div>`);
    container.appendChild(root);

    const top = el(`
      <div class="pat-top">
        <div>
          <div class="pat-title">Patrimônio — ADM</div>
          <div class="pat-muted">Solicitações de cadastro enviadas pelos gestores.</div>
        </div>
        <div class="pat-row">
          <select class="pat-sel" id="pat_status">
            <option value="AGUARDANDO_ADM">Aguardando ADM</option>
            <option value="CADASTRADO">Cadastrados</option>
          </select>
          <button class="pat-btn" id="pat_refresh">Atualizar</button>
        </div>
      </div>
    `);
    root.appendChild(top);

    const card = el(`<div class="pat-card"><div class="pat-list" id="pat_list"></div></div>`);
    root.appendChild(card);

    const listEl = card.querySelector("#pat_list");
    const statusSel = top.querySelector("#pat_status");

    async function load(){
      listEl.innerHTML = `<div class="pat-muted">Carregando...</div>`;
      const res = await apiCall(opts, "adm_patrimonio_listarSolicitacoes", { status: statusSel.value });
      if (!res || !res.ok){
        listEl.innerHTML = `<div class="pat-muted">Erro ao carregar</div>`;
        return;
      }
      const rows = res.data || [];
      if (!rows.length){
        listEl.innerHTML = `<div class="pat-muted">Nenhum registro.</div>`;
        return;
      }

      listEl.innerHTML = "";

      // header
      listEl.appendChild(el(`
        <div class="pat-grid head">
          <div>Material</div>
          <div>Número</div>
          <div>Responsável</div>
          <div>Status</div>
          <div>Ação</div>
        </div>
      `));

      rows.forEach(item=>{
        const can = item.Status === "AGUARDANDO_ADM";
        const row = el(`
          <div class="pat-grid" data-row="${item.sheetRow}">
            <div>
              <div style="font-weight:800">${item.Material || "—"}</div>
              <div class="pat-muted">
                Unidade: ${item.Unidade||"—"} • Gestor: ${item.Gestor||"—"} • Sup: ${item.Supervisao||"—"}
              </div>
            </div>
            <div><input class="pat-inp" value="${item.Numero||""}" disabled /></div>
            <div><input class="pat-inp" value="${item.ColaboradorResponsavel||""}" disabled /></div>
            <div><span class="pat-badge">${item.Status}</span></div>
            <div>
              ${can ? `<button class="pat-btn primary">Marcar cadastrado</button>` : `<button class="pat-btn" disabled>—</button>`}
            </div>
          </div>
        `);

        if (can){
          row.querySelector("button").onclick = async ()=>{
            row.querySelector("button").textContent = "Salvando...";
            row.querySelector("button").disabled = true;

            const resp = await apiCall(opts, "adm_patrimonio_marcarCadastrado", { sheetRows: [item.sheetRow] });
            if (!resp || !resp.ok) alert("Erro ao marcar como cadastrado.");
            await load();
          };
        }

        listEl.appendChild(row);
      });
    }

    top.querySelector("#pat_refresh").onclick = load;
    statusSel.onchange = load;
    load();
  }

  MOD.openHome = function(container, opts){
    // decide modo: se ADM (opts.auth.perfil etc.) — como não tenho seu padrão exato,
    // use opts.isAdm = true/false ao chamar.
    const isAdm = !!(opts && (opts.isAdm || (opts.auth && opts.auth.perfil === "ADM")));
    if (isAdm) return renderADM(container, opts);
    return renderGestor(container, opts);
  };

  window.PATRIMONIO = MOD;
})();
