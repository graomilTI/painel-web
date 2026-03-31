// admin-usuarios.js
// Compatível com páginas que usam #adminUsuariosApp
// e também com o template padrão que usa #pageContent.

(function () {
  const state = {
    users: [],
    modulosCatalogo: [],
    editingUserId: null,
  };

  const rootCandidates = ["adminUsuariosApp", "pageContent"];

  function qs(sel, el = document) {
    return el.querySelector(sel);
  }

  function qsa(sel, el = document) {
    return Array.from(el.querySelectorAll(sel));
  }

  function escapeHtml(str) {
    return String(str ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function getRootHost() {
    for (const id of rootCandidates) {
      const el = document.getElementById(id);
      if (el) return el;
    }
    return null;
  }

  function ensureRoot() {
    let appRoot = document.getElementById("adminUsuariosApp");
    if (appRoot) return appRoot;

    const host = getRootHost();
    if (!host) return null;

    if (host.id === "adminUsuariosApp") return host;

    appRoot = document.createElement("div");
    appRoot.id = "adminUsuariosApp";
    host.innerHTML = "";
    host.appendChild(appRoot);
    return appRoot;
  }

  async function api(url, options = {}) {
    const res = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
    });

    const text = await res.text();
    let data = {};

    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { raw: text };
    }

    if (!res.ok || data?.ok === false) {
      throw new Error(data?.error || `Erro HTTP ${res.status}`);
    }

    return data;
  }

  function toBoolStatus(user) {
    if (typeof user?.ativo === "boolean") return user.ativo;
    return String(user?.status || "ativo").toLowerCase() === "ativo";
  }

  function renderBase() {
    const root = ensureRoot();
    if (!root) return;

    const pageTitle = document.getElementById("pageTitle");
    if (pageTitle) pageTitle.textContent = "Admin - Usuários";

    root.innerHTML = `
      <div class="au-wrap">
        <div class="au-header">
          <div>
            <h2 class="au-title">Usuários</h2>
            <div class="au-subtitle">Gerencie setor e módulos liberados por usuário</div>
          </div>
          <div class="au-actions">
            <button id="auBtnNovo" class="au-btn au-btn-primary">Novo usuário</button>
          </div>
        </div>

        <div class="au-toolbar">
          <input id="auFiltro" class="au-input" type="text" placeholder="Buscar por nome, e-mail ou setor" />
        </div>

        <div id="auFeedback" class="au-feedback" style="display:none;"></div>

        <div class="au-table-wrap">
          <table class="au-table">
            <thead>
              <tr>
                <th>Nome</th>
                <th>E-mail</th>
                <th>Setor</th>
                <th>Status</th>
                <th>Módulos</th>
                <th style="width: 260px;">Ações</th>
              </tr>
            </thead>
            <tbody id="auTableBody"></tbody>
          </table>
        </div>
      </div>

      <div id="auModal" class="au-modal" style="display:none;">
        <div class="au-modal-card">
          <div class="au-modal-header">
            <h3 id="auModalTitle">Usuário</h3>
            <button id="auBtnCloseModal" class="au-btn au-btn-light" type="button">Fechar</button>
          </div>

          <form id="auForm" class="au-form">
            <input type="hidden" id="auUserId" />

            <div class="au-grid">
              <div class="au-field">
                <label for="auNome">Nome</label>
                <input id="auNome" class="au-input" type="text" required />
              </div>

              <div class="au-field">
                <label for="auEmail">E-mail</label>
                <input id="auEmail" class="au-input" type="email" required />
              </div>

              <div class="au-field">
                <label for="auSetor">Setor</label>
                <input id="auSetor" class="au-input" type="text" />
              </div>

              <div class="au-field">
                <label for="auAtivo">Status</label>
                <select id="auAtivo" class="au-input">
                  <option value="true">Ativo</option>
                  <option value="false">Inativo</option>
                </select>
              </div>

              <div class="au-field au-field-full">
                <label for="auPassword">Senha</label>
                <input id="auPassword" class="au-input" type="password" placeholder="Preencha só se quiser definir/alterar" />
                <small class="au-help">
                  No cadastro a senha é obrigatória. Na edição, só preencha se quiser trocar.
                </small>
              </div>

              <div class="au-field au-field-full">
                <label>Módulos liberados</label>
                <div id="auModulosContainer" class="au-modulos"></div>
              </div>
            </div>

            <div class="au-modal-footer">
              <button type="submit" class="au-btn au-btn-primary">Salvar</button>
            </div>
          </form>
        </div>
      </div>

      <style>
        .au-wrap { padding: 16px; color: #e5e7eb; }
        .au-header { display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:16px; }
        .au-title { margin:0; font-size:24px; }
        .au-subtitle { opacity:.8; margin-top:4px; }
        .au-toolbar { margin-bottom:12px; }
        .au-input { width:100%; box-sizing:border-box; border:1px solid #334155; background:#0f172a; color:#e5e7eb; border-radius:10px; padding:10px 12px; outline:none; }
        .au-input:focus { border-color:#166534; box-shadow:0 0 0 2px rgba(22,101,52,.25); }
        .au-btn { border:0; border-radius:10px; padding:10px 14px; cursor:pointer; }
        .au-btn-primary { background:#166534; color:#fff; }
        .au-btn-light { background:#1e293b; color:#e5e7eb; }
        .au-feedback { margin-bottom:12px; padding:10px 12px; border-radius:10px; background:#1e293b; border:1px solid #334155; }
        .au-table-wrap { overflow:auto; background:#0b1220; border:1px solid #1f2937; border-radius:14px; }
        .au-table { width:100%; border-collapse:collapse; min-width:980px; }
        .au-table th, .au-table td { text-align:left; padding:12px; border-bottom:1px solid #1f2937; vertical-align:top; }
        .au-badge { display:inline-block; border-radius:999px; padding:4px 10px; font-size:12px; font-weight:600; }
        .au-badge-on { background:rgba(22,101,52,.25); color:#86efac; }
        .au-badge-off { background:rgba(127,29,29,.25); color:#fca5a5; }
        .au-mod-chip { display:inline-block; padding:4px 8px; margin:2px; border-radius:999px; background:#1e293b; border:1px solid #334155; font-size:12px; }
        .au-actions-row { display:flex; flex-wrap:wrap; gap:8px; }
        .au-modal { position:fixed; inset:0; background:rgba(2,6,23,.72); z-index:9999; display:flex; align-items:center; justify-content:center; padding:20px; }
        .au-modal-card { width:min(920px,100%); max-height:92vh; overflow:auto; background:#0b1220; border:1px solid #1f2937; border-radius:18px; padding:18px; }
        .au-modal-header { display:flex; justify-content:space-between; align-items:center; gap:12px; margin-bottom:14px; }
        .au-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:14px; }
        .au-field { display:flex; flex-direction:column; gap:6px; }
        .au-field-full { grid-column:1 / -1; }
        .au-help { opacity:.75; font-size:12px; }
        .au-modulos { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:8px; border:1px solid #1f2937; border-radius:12px; padding:12px; background:#0f172a; }
        .au-mod-item { display:flex; align-items:center; gap:8px; padding:8px 10px; border:1px solid #1f2937; border-radius:10px; background:#111827; }
        .au-modal-footer { margin-top:16px; display:flex; justify-content:flex-end; }
        @media (max-width:900px) { .au-grid { grid-template-columns:1fr; } .au-modulos { grid-template-columns:1fr; } .au-header { flex-direction:column; align-items:stretch; } }
      </style>
    `;

    qs("#auBtnNovo", root).addEventListener("click", () => openModal());
    qs("#auBtnCloseModal", root).addEventListener("click", closeModal);
    qs("#auFiltro", root).addEventListener("input", renderTable);
    qs("#auForm", root).addEventListener("submit", onSubmitForm);
  }

  function setFeedback(msg, isError = false) {
    const el = qs("#auFeedback");
    if (!el) return;
    if (!msg) {
      el.style.display = "none";
      el.innerHTML = "";
      return;
    }
    el.style.display = "block";
    el.style.borderColor = isError ? "#7f1d1d" : "#334155";
    el.style.background = isError ? "rgba(127,29,29,.15)" : "#1e293b";
    el.innerHTML = escapeHtml(msg);
  }

  function renderModules(selectedIds = []) {
    const container = qs("#auModulosContainer");
    if (!container) return;
    container.innerHTML = state.modulosCatalogo.map((m) => {
      const checked = selectedIds.includes(m.id) ? "checked" : "";
      return `
        <label class="au-mod-item">
          <input type="checkbox" value="${escapeHtml(m.id)}" ${checked} />
          <span>${escapeHtml(m.nome || m.codigo || "Módulo")}</span>
        </label>`;
    }).join("");
  }

  function renderTable() {
    const tbody = qs("#auTableBody");
    if (!tbody) return;

    const filtro = (qs("#auFiltro")?.value || "").trim().toLowerCase();
    const items = state.users.filter((u) => {
      const text = [u.nome || "", u.email || "", u.setor || "", ...(u.modulos || []).map((m) => m.nome || m.codigo || "")].join(" ").toLowerCase();
      return !filtro || text.includes(filtro);
    });

    tbody.innerHTML = items.map((u) => {
      const ativo = toBoolStatus(u);
      const statusClass = ativo ? "au-badge-on" : "au-badge-off";
      const statusLabel = ativo ? "Ativo" : "Inativo";
      const modulosHtml = (u.modulos || []).length
        ? u.modulos.map((m) => `<span class="au-mod-chip">${escapeHtml(m.nome || m.codigo || "")}</span>`).join("")
        : `<span style="opacity:.7;">Sem módulos</span>`;
      return `
        <tr>
          <td>${escapeHtml(u.nome || "")}</td>
          <td>${escapeHtml(u.email || "")}</td>
          <td>${escapeHtml(u.setor || "")}</td>
          <td><span class="au-badge ${statusClass}">${statusLabel}</span></td>
          <td>${modulosHtml}</td>
          <td>
            <div class="au-actions-row">
              <button class="au-btn au-btn-light" data-action="edit" data-id="${escapeHtml(u.id)}">Editar</button>
              <button class="au-btn au-btn-light" data-action="toggle" data-id="${escapeHtml(u.id)}" data-ativo="${ativo ? "false" : "true"}">${ativo ? "Desativar" : "Ativar"}</button>
              <button class="au-btn au-btn-light" data-action="reset" data-id="${escapeHtml(u.id)}">Reset senha</button>
            </div>
          </td>
        </tr>`;
    }).join("");

    qsa("[data-action='edit']", tbody).forEach((btn) => btn.addEventListener("click", () => editUser(btn.dataset.id)));
    qsa("[data-action='toggle']", tbody).forEach((btn) => btn.addEventListener("click", () => toggleStatus(btn.dataset.id, btn.dataset.ativo === "true")));
    qsa("[data-action='reset']", tbody).forEach((btn) => btn.addEventListener("click", () => resetPassword(btn.dataset.id)));
  }

  async function loadUsers() {
    const res = await api("/api/admin/users/list");
    state.users = res.items || [];
    renderTable();
  }

  async function loadModulesCatalog() {
    const res = await api("/api/admin/users/modulos");
    state.modulosCatalogo = res.items || [];
  }

  async function loadUserModuleIds(userId) {
    const res = await api(`/api/admin/users/user-modulos?user_id=${encodeURIComponent(userId)}`);
    return res.items || [];
  }

  function openModal(user = null, selectedModuleIds = []) {
    state.editingUserId = user?.id || null;
    qs("#auModalTitle").textContent = user ? "Editar usuário" : "Novo usuário";
    qs("#auUserId").value = user?.id || "";
    qs("#auNome").value = user?.nome || "";
    qs("#auEmail").value = user?.email || "";
    qs("#auSetor").value = user?.setor || "";
    qs("#auAtivo").value = String(toBoolStatus(user ?? { status: "ativo" }));
    qs("#auPassword").value = "";
    renderModules(selectedModuleIds);
    qs("#auModal").style.display = "flex";
  }

  function closeModal() {
    const modal = qs("#auModal");
    if (modal) modal.style.display = "none";
  }

  function getSelectedModules() {
    return qsa("#auModulosContainer input:checked").map((el) => el.value);
  }

  async function editUser(userId) {
    try {
      setFeedback("");
      const user = state.users.find((x) => x.id === userId);
      if (!user) throw new Error("Usuário não encontrado.");
      const selectedModuleIds = await loadUserModuleIds(userId);
      openModal(user, selectedModuleIds);
    } catch (err) {
      setFeedback(err.message || String(err), true);
    }
  }

  async function toggleStatus(userId, ativo) {
    try {
      setFeedback("Salvando status...");
      await api("/api/admin/users/toggle-status", {
        method: "POST",
        body: JSON.stringify({ id: userId, ativo, status: ativo ? "ativo" : "inativo" }),
      });
      setFeedback("Status atualizado com sucesso.");
      await loadUsers();
    } catch (err) {
      setFeedback(err.message || String(err), true);
    }
  }

  async function resetPassword(userId) {
    const senha = window.prompt("Digite a nova senha:");
    if (!senha) return;
    try {
      setFeedback("Redefinindo senha...");
      await api("/api/admin/users/reset-password", {
        method: "POST",
        body: JSON.stringify({ id: userId, password: senha }),
      });
      setFeedback("Senha redefinida com sucesso.");
    } catch (err) {
      setFeedback(err.message || String(err), true);
    }
  }

  async function onSubmitForm(ev) {
    ev.preventDefault();
    const id = qs("#auUserId").value.trim();
    const nome = qs("#auNome").value.trim();
    const email = qs("#auEmail").value.trim();
    const setor = qs("#auSetor").value.trim();
    const ativo = qs("#auAtivo").value === "true";
    const password = qs("#auPassword").value;
    const modulos = getSelectedModules();

    const payload = {
      id,
      nome,
      email,
      setor,
      ativo,
      status: ativo ? "ativo" : "inativo",
      modulos,
    };

    const isCreate = !id;
    if (password) payload.password = password;
    if (isCreate && !password) {
      setFeedback("No cadastro, a senha é obrigatória.", true);
      return;
    }

    try {
      setFeedback(isCreate ? "Criando usuário..." : "Salvando usuário...");
      await api(isCreate ? "/api/admin/users/create" : "/api/admin/users/update", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      closeModal();
      setFeedback(isCreate ? "Usuário criado com sucesso." : "Usuário atualizado com sucesso.");
      await loadUsers();
    } catch (err) {
      setFeedback(err.message || String(err), true);
    }
  }

  async function init() {
    renderBase();
    try {
      setFeedback("Carregando...");
      await loadModulesCatalog();
      await loadUsers();
      setFeedback("");
    } catch (err) {
      setFeedback(err.message || String(err), true);
    }
  }

  window.ADMIN_USUARIOS = { init, reload: loadUsers };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
