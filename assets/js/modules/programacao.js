
(function () {
  const STATUS_OPTIONS = [
    "DISPONÍVEL",
    "ATESTADO",
    "FÉRIAS",
    "FOLGA",
    "FALTA",
    "TRANSFERIR",
    "INATIVO",
  ];

  const TRANSPORTE_OPTIONS = [
    "",
    "MOTORISTA FROTA",
    "CARONA FROTA",
    "UBER/TÁXI",
    "REEMBOLSO KM",
  ];

  const ESTADIA_OPTIONS = [
    "",
    "CASA",
    "PERNOITE",
    "ALOJAMENTO",
    "HOTEL",
  ];

  const MODULE_ID = "programacao-module";
  const STORAGE_KEY = "programacao_demo_state_v2";

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function debounce(fn, wait) {
    let timer = null;
    return function (...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), wait);
    };
  }

  function injectStyles() {
    if (document.getElementById("programacao-v2-styles")) return;
    const style = document.createElement("style");
    style.id = "programacao-v2-styles";
    style.textContent = `
      .prog-shell{display:flex;flex-direction:column;gap:16px;color:#e5e7eb}
      .prog-hero{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;padding:18px 20px;border:1px solid rgba(22,101,52,.45);border-radius:22px;background:linear-gradient(135deg, rgba(2,6,23,.95), rgba(6,78,59,.18));box-shadow:0 16px 40px rgba(0,0,0,.24)}
      .prog-title-wrap h1{margin:0;font-size:30px;line-height:1.1;font-weight:800}
      .prog-title-wrap p{margin:6px 0 0;color:#94a3b8}
      .prog-badge{display:inline-flex;align-items:center;gap:8px;padding:8px 12px;border-radius:999px;background:rgba(22,101,52,.18);border:1px solid rgba(34,197,94,.35);font-size:12px;font-weight:700;letter-spacing:.03em}
      .prog-toolbar{display:grid;grid-template-columns:1.4fr .9fr .9fr auto;gap:12px;padding:14px;border:1px solid rgba(51,65,85,.8);border-radius:20px;background:rgba(2,6,23,.7)}
      .prog-card{border:1px solid rgba(51,65,85,.8);border-radius:22px;background:rgba(2,6,23,.88);box-shadow:0 12px 28px rgba(0,0,0,.18);overflow:hidden}
      .prog-table-wrap{overflow:auto}
      .prog-table{width:100%;border-collapse:separate;border-spacing:0;min-width:1180px}
      .prog-table thead th{position:sticky;top:0;z-index:2;background:#07111f;color:#cbd5e1;font-size:12px;text-transform:uppercase;letter-spacing:.05em;padding:14px 12px;border-bottom:1px solid rgba(51,65,85,.8);white-space:nowrap}
      .prog-table tbody td{padding:10px 12px;border-bottom:1px solid rgba(15,23,42,.95);vertical-align:middle}
      .prog-table tbody tr.main-row:hover{background:rgba(15,23,42,.62)}
      .prog-colab{display:flex;flex-direction:column;gap:4px;min-width:240px}
      .prog-colab strong{font-size:13px;line-height:1.2}
      .prog-colab span{font-size:11px;color:#94a3b8}
      .prog-status-pill{display:inline-flex;align-items:center;justify-content:center;padding:6px 10px;border-radius:999px;font-size:11px;font-weight:700;border:1px solid rgba(51,65,85,.85);background:rgba(15,23,42,.75);min-width:90px}
      .prog-status-pill.blocked{background:rgba(127,29,29,.18);border-color:rgba(248,113,113,.4);color:#fecaca}
      .prog-status-pill.ok{background:rgba(20,83,45,.2);border-color:rgba(74,222,128,.35);color:#bbf7d0}
      .prog-checkbox-cell{text-align:center}
      .prog-checkbox{width:18px;height:18px;accent-color:#16a34a;cursor:pointer}
      .prog-actions{display:flex;justify-content:center}
      .prog-btn,.prog-input,.prog-select{width:100%;background:#0f172a;color:#e5e7eb;border:1px solid #334155;border-radius:12px;min-height:40px;padding:0 12px;outline:none;box-sizing:border-box}
      .prog-input:focus,.prog-select:focus{border-color:#22c55e;box-shadow:0 0 0 3px rgba(34,197,94,.14)}
      .prog-input[disabled],.prog-select[disabled],.prog-checkbox[disabled]{opacity:.45;cursor:not-allowed}
      .prog-btn{width:auto;padding:0 14px;cursor:pointer;font-weight:700;background:linear-gradient(180deg,#0f172a,#111827)}
      .prog-btn:hover{border-color:#22c55e}
      .prog-btn.secondary{background:#08111e}
      .prog-btn.ghost{background:transparent}
      .prog-extra-row td{padding:0;background:rgba(5,10,22,.96)}
      .prog-extra-box{padding:16px 16px 18px;border-top:1px solid rgba(22,101,52,.3);background:linear-gradient(180deg, rgba(8,17,30,.98), rgba(2,6,23,.98))}
      .prog-extra-grid{display:grid;grid-template-columns:1.1fr 1.2fr .9fr .9fr .8fr .8fr .8fr auto;gap:12px}
      .prog-field{display:flex;flex-direction:column;gap:6px}
      .prog-field label{font-size:11px;color:#94a3b8;font-weight:700;letter-spacing:.03em}
      .prog-required::after{content:" *";color:#f87171}
      .prog-muted{color:#94a3b8;font-size:12px}
      .prog-inline-actions{display:flex;align-items:flex-end;gap:10px}
      .prog-error{margin-top:10px;padding:10px 12px;border-radius:14px;background:rgba(127,29,29,.2);border:1px solid rgba(248,113,113,.35);color:#fecaca;font-size:12px}
      .prog-success{margin-top:10px;padding:10px 12px;border-radius:14px;background:rgba(20,83,45,.2);border:1px solid rgba(74,222,128,.35);color:#bbf7d0;font-size:12px}
      .prog-pagination{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 16px;border-top:1px solid rgba(51,65,85,.8);background:rgba(2,6,23,.75)}
      .prog-page-actions{display:flex;gap:8px;align-items:center}
      .prog-small{font-size:12px;color:#94a3b8}
      .prog-maint-btn{white-space:nowrap}
      .prog-chip{display:inline-flex;align-items:center;padding:5px 9px;border-radius:999px;font-size:11px;font-weight:700;background:rgba(30,41,59,.9);border:1px solid rgba(51,65,85,.8)}
      @media (max-width: 960px){
        .prog-toolbar{grid-template-columns:1fr}
        .prog-hero{flex-direction:column}
        .prog-extra-grid{grid-template-columns:1fr 1fr}
        .prog-pagination{flex-direction:column;align-items:flex-start}
      }
    `;
    document.head.appendChild(style);
  }

  function getDefaultRows() {
    return [
      { id: "1", nome: "ADRIANA DA SILVA DA LUZ", cargo: "Administrativo", supervisao: "GERAL", coordenacao: "Administrativo", status: "DISPONÍVEL", cafe: false, almoco: false, janta: false, transporte: "", extrasOpen: false, extras: { estadia: "", cidade_uf: "", alojamento_id: "", alojamento_nome: "", checkin: "", checkout: "", chegada: "", recarga: "", lavagem: "", manutencao_solicitada: false } },
      { id: "2", nome: "AMANDA RAQUEL DO NASCIMENTO BRAZ", cargo: "Administrativo", supervisao: "GERAL", coordenacao: "Administrativo", status: "DISPONÍVEL", cafe: false, almoco: false, janta: false, transporte: "", extrasOpen: false, extras: { estadia: "", cidade_uf: "", alojamento_id: "", alojamento_nome: "", checkin: "", checkout: "", chegada: "", recarga: "", lavagem: "", manutencao_solicitada: false } },
      { id: "3", nome: "ANDREA APARECIDA DE MORAIS OLIVERIO", cargo: "Administrativo", supervisao: "GERAL", coordenacao: "Administrativo", status: "DISPONÍVEL", cafe: false, almoco: false, janta: false, transporte: "", extrasOpen: false, extras: { estadia: "", cidade_uf: "", alojamento_id: "", alojamento_nome: "", checkin: "", checkout: "", chegada: "", recarga: "", lavagem: "", manutencao_solicitada: false } },
      { id: "4", nome: "BRUNO HENRIQUE RIBEIRO", cargo: "Técnico de Campo", supervisao: "SUL", coordenacao: "Operações", status: "DISPONÍVEL", cafe: true, almoco: true, janta: false, transporte: "MOTORISTA FROTA", extrasOpen: false, extras: { estadia: "HOTEL", cidade_uf: "Cascavel/PR", alojamento_id: "", alojamento_nome: "", checkin: "2026-04-06", checkout: "2026-04-07", chegada: "18:30", recarga: "", lavagem: "", manutencao_solicitada: false } },
      { id: "5", nome: "CARLA FERNANDA LOPES", cargo: "Classificadora", supervisao: "OESTE", coordenacao: "Operações", status: "FOLGA", cafe: false, almoco: false, janta: false, transporte: "", extrasOpen: false, extras: { estadia: "", cidade_uf: "", alojamento_id: "", alojamento_nome: "", checkin: "", checkout: "", chegada: "", recarga: "", lavagem: "", manutencao_solicitada: false } },
      { id: "6", nome: "DANIEL MARTINS", cargo: "Motorista", supervisao: "FROTAS", coordenacao: "Frotas", status: "DISPONÍVEL", cafe: false, almoco: true, janta: true, transporte: "CARONA FROTA", extrasOpen: false, extras: { estadia: "ALOJAMENTO", cidade_uf: "", alojamento_id: "1", alojamento_nome: "Alojamento Cascavel Centro", checkin: "", checkout: "", chegada: "", recarga: "75", lavagem: "", manutencao_solicitada: false } },
    ];
  }

  async function loadAlojamentos(api) {
    const fallback = [
      { id: "1", nome: "Alojamento Cascavel Centro", cidade_uf: "Cascavel/PR", ativo: true },
      { id: "2", nome: "Alojamento Londrina Norte", cidade_uf: "Londrina/PR", ativo: true },
      { id: "3", nome: "Alojamento Primavera do Leste", cidade_uf: "Primavera do Leste/MT", ativo: true },
    ];

    if (!api || typeof api.getAlojamentos !== "function") return fallback;

    try {
      const res = await api.getAlojamentos();
      if (Array.isArray(res) && res.length) return res;
      return fallback;
    } catch (_) {
      return fallback;
    }
  }

  async function loadCidades(api) {
    const fallback = [
      "Cascavel/PR",
      "Londrina/PR",
      "Maringá/PR",
      "Toledo/PR",
      "Ponta Grossa/PR",
      "Goiânia/GO",
      "Rio Verde/GO",
      "Rondonópolis/MT",
      "Primavera do Leste/MT",
      "Lucas do Rio Verde/MT",
      "Sorriso/MT",
      "Uberlândia/MG",
      "Luis Eduardo Magalhães/BA",
      "Barreiras/BA"
    ];

    if (!api || typeof api.getCidades !== "function") return fallback;

    try {
      const res = await api.getCidades();
      if (Array.isArray(res) && res.length) return res;
      return fallback;
    } catch (_) {
      return fallback;
    }
  }

  function blockedStatus(status) {
    return ["ATESTADO", "FÉRIAS", "FOLGA", "FALTA", "INATIVO"].includes(status);
  }

  function normalizeMoneyInput(value) {
    if (value == null) return "";
    const clean = String(value).replace(/[^\d.,]/g, "").replace(",", ".");
    return clean;
  }

  function toNumberOrNull(value) {
    if (value === "" || value == null) return null;
    const n = Number(String(value).replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }

  function buildState() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed && Array.isArray(parsed.rows)) return parsed;
      } catch (_) {}
    }
    return {
      rows: getDefaultRows(),
      query: "",
      filtroStatus: "",
      filtroCoordenacao: "",
      page: 1,
      pageSize: 20,
      message: "",
      messageType: "",
      alojamentos: [],
      cidades: [],
    };
  }

  function persistState(state) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      rows: state.rows,
      query: state.query,
      filtroStatus: state.filtroStatus,
      filtroCoordenacao: state.filtroCoordenacao,
      page: state.page,
      pageSize: state.pageSize,
    }));
  }

  function getFilteredRows(state) {
    const q = state.query.trim().toLowerCase();
    return state.rows.filter((row) => {
      const matchQuery = !q || [
        row.nome,
        row.cargo,
        row.supervisao,
        row.coordenacao,
      ].some(v => String(v || "").toLowerCase().includes(q));

      const matchStatus = !state.filtroStatus || row.status === state.filtroStatus;
      const matchCoord = !state.filtroCoordenacao || row.coordenacao === state.filtroCoordenacao;
      return matchQuery && matchStatus && matchCoord;
    });
  }

  function paginate(rows, page, pageSize) {
    const total = rows.length;
    const pages = Math.max(1, Math.ceil(total / pageSize));
    const current = Math.min(Math.max(1, page), pages);
    const start = (current - 1) * pageSize;
    return {
      page: current,
      pages,
      total,
      items: rows.slice(start, start + pageSize),
      start: total ? start + 1 : 0,
      end: Math.min(start + pageSize, total),
    };
  }

  function getCoordenacoes(rows) {
    return [...new Set(rows.map(r => r.coordenacao).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  }

  function validateRow(row) {
    const errors = [];
    const ex = row.extras || {};

    if (ex.estadia === "HOTEL") {
      if (!ex.cidade_uf) errors.push("Cidade/UF é obrigatório para Hotel.");
      if (!ex.checkin) errors.push("Check-in é obrigatório para Hotel.");
      if (!ex.checkout) errors.push("Checkout é obrigatório para Hotel.");
      if (!ex.chegada) errors.push("Chegada é obrigatória para Hotel.");
    }

    if (ex.estadia === "ALOJAMENTO") {
      if (!ex.alojamento_id) errors.push("Selecionar o alojamento é obrigatório quando a estadia for Alojamento.");
    }

    if (ex.checkin && ex.checkout && ex.checkout < ex.checkin) {
      errors.push("Checkout não pode ser menor que o Check-in.");
    }

    return errors;
  }

  function makePayload(row) {
    return {
      colaborador_id: row.id,
      nome: row.nome,
      status: row.status,
      cafe: !!row.cafe,
      almoco: !!row.almoco,
      janta: !!row.janta,
      transporte: row.transporte || null,
      extras: {
        estadia: row.extras.estadia || null,
        cidade_uf: row.extras.cidade_uf || null,
        alojamento_id: row.extras.alojamento_id || null,
        checkin: row.extras.checkin || null,
        checkout: row.extras.checkout || null,
        chegada: row.extras.chegada || null,
        recarga: toNumberOrNull(row.extras.recarga),
        lavagem: toNumberOrNull(row.extras.lavagem),
        manutencao_solicitada: !!row.extras.manutencao_solicitada,
      },
    };
  }

  async function defaultSave(api, row) {
    const payload = makePayload(row);

    if (api && typeof api.saveProgramacaoRow === "function") {
      return api.saveProgramacaoRow(payload);
    }

    return new Promise((resolve) => {
      setTimeout(() => resolve({ ok: true, local: true, payload }), 180);
    });
  }

  async function createFrotaRequest(api, row) {
    const payload = {
      colaborador_id: row.id,
      colaborador_nome: row.nome,
      tipo: "MANUT_VEICULO",
      origem: "PROGRAMACAO",
      status: "ABERTA",
      descricao: `Solicitação criada pela Programação para ${row.nome}.`,
      metadata: {
        coordenacao: row.coordenacao,
        supervisao: row.supervisao,
      }
    };

    if (api && typeof api.createFrotaSolicitacao === "function") {
      return api.createFrotaSolicitacao(payload);
    }

    return new Promise((resolve) => {
      setTimeout(() => resolve({ ok: true, local: true, payload }), 180);
    });
  }

  function createApiBridge(opts) {
    const api = opts?.api || {};
    return {
      getAlojamentos: api.getAlojamentos,
      getCidades: api.getCidades,
      saveProgramacaoRow: api.saveProgramacaoRow,
      createFrotaSolicitacao: api.createFrotaSolicitacao,
    };
  }

  function render(root, state, ctx) {
    const filtered = getFilteredRows(state);
    const paged = paginate(filtered, state.page, state.pageSize);
    state.page = paged.page;

    const coordenacoes = getCoordenacoes(state.rows);

    root.innerHTML = `
      <div class="prog-shell" id="${MODULE_ID}">
        <section class="prog-hero">
          <div class="prog-title-wrap">
            <h1>Programação</h1>
            <p>Lista compacta por colaborador com extras expansíveis, validações e integração para Frotas.</p>
          </div>
          <div class="prog-badge">Autosave por linha ativo</div>
        </section>

        <section class="prog-toolbar">
          <input class="prog-input" id="prog-search" type="text" placeholder="Buscar por nome, cargo, supervisão ou coordenação..." value="${escapeHtml(state.query)}">
          <select class="prog-select" id="prog-filter-status">
            <option value="">Todos os status</option>
            ${STATUS_OPTIONS.map(s => `<option value="${escapeHtml(s)}" ${state.filtroStatus === s ? "selected" : ""}>${escapeHtml(s)}</option>`).join("")}
          </select>
          <select class="prog-select" id="prog-filter-coord">
            <option value="">Todas as coordenações</option>
            ${coordenacoes.map(c => `<option value="${escapeHtml(c)}" ${state.filtroCoordenacao === c ? "selected" : ""}>${escapeHtml(c)}</option>`).join("")}
          </select>
          <button class="prog-btn secondary" id="prog-expand-all">Fechar extras</button>
        </section>

        <section class="prog-card">
          <div class="prog-table-wrap">
            <table class="prog-table">
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Disponível</th>
                  <th>Café</th>
                  <th>Almoço</th>
                  <th>Janta</th>
                  <th>Transporte</th>
                  <th>Situação</th>
                  <th>Extras</th>
                </tr>
              </thead>
              <tbody>
                ${paged.items.map((row) => {
                  const blocked = blockedStatus(row.status);
                  const rowErrors = validateRow(row);
                  return `
                    <tr class="main-row" data-row-id="${escapeHtml(row.id)}">
                      <td>
                        <div class="prog-colab">
                          <strong>${escapeHtml(row.nome)}</strong>
                          <span>${escapeHtml(row.cargo)} • ${escapeHtml(row.supervisao)} • ${escapeHtml(row.coordenacao)}</span>
                        </div>
                      </td>
                      <td>
                        <select class="prog-select" data-action="status" data-row-id="${escapeHtml(row.id)}">
                          ${STATUS_OPTIONS.map(s => `<option value="${escapeHtml(s)}" ${row.status === s ? "selected" : ""}>${escapeHtml(s)}</option>`).join("")}
                        </select>
                      </td>
                      <td class="prog-checkbox-cell"><input class="prog-checkbox" data-action="cafe" data-row-id="${escapeHtml(row.id)}" type="checkbox" ${row.cafe ? "checked" : ""} ${blocked ? "disabled" : ""}></td>
                      <td class="prog-checkbox-cell"><input class="prog-checkbox" data-action="almoco" data-row-id="${escapeHtml(row.id)}" type="checkbox" ${row.almoco ? "checked" : ""} ${blocked ? "disabled" : ""}></td>
                      <td class="prog-checkbox-cell"><input class="prog-checkbox" data-action="janta" data-row-id="${escapeHtml(row.id)}" type="checkbox" ${row.janta ? "checked" : ""} ${blocked ? "disabled" : ""}></td>
                      <td>
                        <select class="prog-select" data-action="transporte" data-row-id="${escapeHtml(row.id)}" ${blocked ? "disabled" : ""}>
                          ${TRANSPORTE_OPTIONS.map(s => `<option value="${escapeHtml(s)}" ${row.transporte === s ? "selected" : ""}>${escapeHtml(s || "Selecione...")}</option>`).join("")}
                        </select>
                      </td>
                      <td>
                        <span class="prog-status-pill ${rowErrors.length ? "blocked" : "ok"}">${rowErrors.length ? "Pendente" : "Ok"}</span>
                      </td>
                      <td class="prog-actions">
                        <button class="prog-btn ghost" data-action="toggle-extra" data-row-id="${escapeHtml(row.id)}">${row.extrasOpen ? "Ocultar" : "Extras"}</button>
                      </td>
                    </tr>
                    ${row.extrasOpen ? renderExtraRow(row, state) : ""}
                  `;
                }).join("")}
              </tbody>
            </table>
          </div>

          <div class="prog-pagination">
            <div class="prog-small">Exibindo ${paged.start}–${paged.end} de ${paged.total} colaboradores</div>
            <div class="prog-page-actions">
              <button class="prog-btn secondary" id="prog-prev-page" ${paged.page <= 1 ? "disabled" : ""}>Anterior</button>
              <span class="prog-chip">Página ${paged.page} / ${paged.pages}</span>
              <button class="prog-btn secondary" id="prog-next-page" ${paged.page >= paged.pages ? "disabled" : ""}>Próxima</button>
            </div>
          </div>
        </section>

        ${state.message ? `<div class="${state.messageType === "error" ? "prog-error" : "prog-success"}">${escapeHtml(state.message)}</div>` : ""}
      </div>
    `;

    bindEvents(root, state, ctx);
  }

  function renderExtraRow(row, state) {
    const blocked = blockedStatus(row.status);
    const ex = row.extras || {};
    const errors = validateRow(row);
    const showHotelFields = ex.estadia === "HOTEL";
    const showAlojamento = ex.estadia === "ALOJAMENTO";
    const showCityForHotel = ex.estadia === "HOTEL";
    const listaAlojamentos = state.alojamentos
      .filter(a => a.ativo !== false)
      .sort((a, b) => String(a.nome).localeCompare(String(b.nome)));

    return `
      <tr class="prog-extra-row">
        <td colspan="8">
          <div class="prog-extra-box">
            <div class="prog-extra-grid">
              <div class="prog-field">
                <label class="prog-required">Estadia</label>
                <select class="prog-select" data-extra="estadia" data-row-id="${escapeHtml(row.id)}" ${blocked ? "disabled" : ""}>
                  ${ESTADIA_OPTIONS.map(s => `<option value="${escapeHtml(s)}" ${ex.estadia === s ? "selected" : ""}>${escapeHtml(s || "Selecione...")}</option>`).join("")}
                </select>
              </div>

              <div class="prog-field">
                <label class="${showCityForHotel ? "prog-required" : ""}">Cidade/UF</label>
                <input class="prog-input" list="programacao-cidades-list" data-extra="cidade_uf" data-row-id="${escapeHtml(row.id)}" value="${escapeHtml(ex.cidade_uf || "")}" placeholder="Digite a cidade/UF" ${blocked || !showCityForHotel ? "disabled" : ""}>
              </div>

              <div class="prog-field">
                <label class="${showHotelFields ? "prog-required" : ""}">Check-in</label>
                <input class="prog-input" type="date" data-extra="checkin" data-row-id="${escapeHtml(row.id)}" value="${escapeHtml(ex.checkin || "")}" ${blocked || !showHotelFields ? "disabled" : ""}>
              </div>

              <div class="prog-field">
                <label class="${showHotelFields ? "prog-required" : ""}">Checkout</label>
                <input class="prog-input" type="date" data-extra="checkout" data-row-id="${escapeHtml(row.id)}" value="${escapeHtml(ex.checkout || "")}" ${blocked || !showHotelFields ? "disabled" : ""}>
              </div>

              <div class="prog-field">
                <label class="${showHotelFields ? "prog-required" : ""}">Chegada</label>
                <input class="prog-input" type="time" data-extra="chegada" data-row-id="${escapeHtml(row.id)}" value="${escapeHtml(ex.chegada || "")}" ${blocked || !showHotelFields ? "disabled" : ""}>
              </div>

              <div class="prog-field">
                <label>Recarga</label>
                <input class="prog-input" inputmode="decimal" data-extra="recarga" data-row-id="${escapeHtml(row.id)}" value="${escapeHtml(ex.recarga || "")}" placeholder="0,00" ${blocked ? "disabled" : ""}>
              </div>

              <div class="prog-field">
                <label>Lavagem</label>
                <input class="prog-input" inputmode="decimal" data-extra="lavagem" data-row-id="${escapeHtml(row.id)}" value="${escapeHtml(ex.lavagem || "")}" placeholder="0,00" ${blocked ? "disabled" : ""}>
              </div>

              <div class="prog-inline-actions">
                <button class="prog-btn prog-maint-btn" data-action="manutencao" data-row-id="${escapeHtml(row.id)}" ${blocked ? "disabled" : ""}>Manut. veículo</button>
              </div>
            </div>

            <div style="margin-top:12px;display:grid;grid-template-columns:1fr auto;gap:12px;align-items:end;">
              <div class="prog-field">
                <label class="${showAlojamento ? "prog-required" : ""}">Alojamento</label>
                <select class="prog-select" data-extra="alojamento_id" data-row-id="${escapeHtml(row.id)}" ${blocked || !showAlojamento ? "disabled" : ""}>
                  <option value="">Selecione o alojamento...</option>
                  ${listaAlojamentos.map(a => `<option value="${escapeHtml(a.id)}" ${String(ex.alojamento_id || "") === String(a.id) ? "selected" : ""}>${escapeHtml(a.nome)}${a.cidade_uf ? " • " + escapeHtml(a.cidade_uf) : ""}</option>`).join("")}
                </select>
              </div>
              <div class="prog-inline-actions">
                <button class="prog-btn secondary" data-action="save-row" data-row-id="${escapeHtml(row.id)}">Salvar linha</button>
              </div>
            </div>

            ${showAlojamento ? `<div class="prog-muted" style="margin-top:8px;">Para estadia em alojamento, a seleção do alojamento é obrigatória.</div>` : ""}
            ${showHotelFields ? `<div class="prog-muted" style="margin-top:8px;">Para Hotel, Cidade/UF, Check-in, Checkout e Chegada são obrigatórios.</div>` : ""}
            ${errors.length ? `<div class="prog-error">${errors.map(escapeHtml).join("<br>")}</div>` : ""}
          </div>
        </td>
      </tr>
    `;
  }

  function bindEvents(root, state, ctx) {
    const updateSearch = debounce((value) => {
      state.query = value;
      state.page = 1;
      persistState(state);
      render(root, state, ctx);
    }, 180);

    root.querySelector("#prog-search")?.addEventListener("input", (e) => updateSearch(e.target.value));
    root.querySelector("#prog-filter-status")?.addEventListener("change", (e) => {
      state.filtroStatus = e.target.value;
      state.page = 1;
      persistState(state);
      render(root, state, ctx);
    });
    root.querySelector("#prog-filter-coord")?.addEventListener("change", (e) => {
      state.filtroCoordenacao = e.target.value;
      state.page = 1;
      persistState(state);
      render(root, state, ctx);
    });

    root.querySelector("#prog-expand-all")?.addEventListener("click", () => {
      state.rows.forEach(r => r.extrasOpen = false);
      persistState(state);
      render(root, state, ctx);
    });

    root.querySelector("#prog-prev-page")?.addEventListener("click", () => {
      state.page = Math.max(1, state.page - 1);
      persistState(state);
      render(root, state, ctx);
    });

    root.querySelector("#prog-next-page")?.addEventListener("click", () => {
      state.page = state.page + 1;
      persistState(state);
      render(root, state, ctx);
    });

    root.querySelectorAll("[data-action='toggle-extra']").forEach((btn) => {
      btn.addEventListener("click", () => {
        const row = findRow(state, btn.dataset.rowId);
        if (!row) return;
        row.extrasOpen = !row.extrasOpen;
        state.message = "";
        persistState(state);
        render(root, state, ctx);
      });
    });

    root.querySelectorAll("[data-action='status']").forEach((el) => {
      el.addEventListener("change", async () => {
        const row = findRow(state, el.dataset.rowId);
        if (!row) return;
        row.status = el.value;

        if (blockedStatus(row.status)) {
          row.cafe = false;
          row.almoco = false;
          row.janta = false;
          row.transporte = "";
          row.extras = {
            ...row.extras,
            estadia: "",
            cidade_uf: "",
            alojamento_id: "",
            alojamento_nome: "",
            checkin: "",
            checkout: "",
            chegada: "",
          };
        }

        await saveRow(root, state, ctx, row, true);
      });
    });

    ["cafe", "almoco", "janta"].forEach((field) => {
      root.querySelectorAll(`[data-action='${field}']`).forEach((el) => {
        el.addEventListener("change", async () => {
          const row = findRow(state, el.dataset.rowId);
          if (!row) return;
          row[field] = !!el.checked;
          await saveRow(root, state, ctx, row, true);
        });
      });
    });

    root.querySelectorAll("[data-action='transporte']").forEach((el) => {
      el.addEventListener("change", async () => {
        const row = findRow(state, el.dataset.rowId);
        if (!row) return;
        row.transporte = el.value;
        await saveRow(root, state, ctx, row, true);
      });
    });

    root.querySelectorAll("[data-action='save-row']").forEach((el) => {
      el.addEventListener("click", async () => {
        const row = findRow(state, el.dataset.rowId);
        if (!row) return;
        await saveRow(root, state, ctx, row, false);
      });
    });

    root.querySelectorAll("[data-action='manutencao']").forEach((el) => {
      el.addEventListener("click", async () => {
        const row = findRow(state, el.dataset.rowId);
        if (!row) return;
        state.message = "";
        try {
          await createFrotaRequest(ctx.api, row);
          row.extras.manutencao_solicitada = true;
          state.message = `Solicitação de manutenção criada para ${row.nome}.`;
          state.messageType = "success";
          persistState(state);
          render(root, state, ctx);
        } catch (err) {
          state.message = err?.message || "Não foi possível criar a solicitação de manutenção.";
          state.messageType = "error";
          render(root, state, ctx);
        }
      });
    });

    root.querySelectorAll("[data-extra]").forEach((el) => {
      const apply = async (autosave) => {
        const row = findRow(state, el.dataset.rowId);
        if (!row) return;
        const field = el.dataset.extra;
        let value = el.value;

        if (field === "recarga" || field === "lavagem") value = normalizeMoneyInput(value);

        row.extras[field] = value;

        if (field === "estadia") {
          row.extras.cidade_uf = "";
          row.extras.alojamento_id = "";
          row.extras.alojamento_nome = "";
          row.extras.checkin = "";
          row.extras.checkout = "";
          row.extras.chegada = "";
        }

        if (field === "alojamento_id") {
          const found = state.alojamentos.find(a => String(a.id) === String(value));
          row.extras.alojamento_nome = found?.nome || "";
        }

        persistState(state);
        if (autosave) {
          await saveRow(root, state, ctx, row, true);
        } else {
          render(root, state, ctx);
        }
      };

      const isTextLike = el.tagName === "INPUT" && ["text", "date", "time"].includes((el.type || "text").toLowerCase());
      if (isTextLike) {
        const debounced = debounce(() => apply(true), 300);
        el.addEventListener("input", debounced);
        el.addEventListener("change", () => apply(true));
      } else {
        el.addEventListener("change", () => apply(true));
      }
    });

    ensureCityList(root, state);
  }

  function ensureCityList(root, state) {
    let dl = root.querySelector("#programacao-cidades-list");
    if (!dl) {
      dl = document.createElement("datalist");
      dl.id = "programacao-cidades-list";
      root.appendChild(dl);
    }
    dl.innerHTML = state.cidades.map(c => `<option value="${escapeHtml(c)}"></option>`).join("");
  }

  function findRow(state, id) {
    return state.rows.find(r => String(r.id) === String(id));
  }

  async function saveRow(root, state, ctx, row, silent) {
    const errors = validateRow(row);
    if (errors.length) {
      state.message = errors[0];
      state.messageType = "error";
      persistState(state);
      render(root, state, ctx);
      return false;
    }

    try {
      await defaultSave(ctx.api, row);
      state.message = silent ? "Alterações salvas automaticamente." : `Linha de ${row.nome} salva com sucesso.`;
      state.messageType = "success";
      persistState(state);
      render(root, state, ctx);
      return true;
    } catch (err) {
      state.message = err?.message || "Erro ao salvar a linha.";
      state.messageType = "error";
      render(root, state, ctx);
      return false;
    }
  }

  async function openHome(container, opts = {}) {
    injectStyles();

    const root = document.createElement("div");
    container.innerHTML = "";
    container.appendChild(root);

    const state = buildState();
    const api = createApiBridge(opts);

    state.alojamentos = await loadAlojamentos(api);
    state.cidades = await loadCidades(api);

    render(root, state, { api, opts });
  }

  window.PROGRAMACAO = {
    openHome,
  };
})();
