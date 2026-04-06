import { getSession } from './auth.js';
import { initProtectedPage } from './pageInit.js';

// assets/js/admin-usuarios.js
(function () {
  const state = { users: [], modulosCatalogo: [], editingUserId: null };
  const qs = (s, e = document) => e.querySelector(s);
  const qsa = (s, e = document) => Array.from(e.querySelectorAll(s));

  function esc(v) {
    return String(v ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function extractAccessToken(sessionLike) {
    return (
      sessionLike?.access_token ||
      sessionLike?.session?.access_token ||
      sessionLike?.data?.session?.access_token ||
      null
    );
  }

  function normalizeText(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  }

  function inferNivelFromUser(user) {
    const raw = normalizeText(user?.nivel || user?.perfil_codigo || user?.perfil || user?.role || "");
    if (["adm", "administrador", "admin", "master"].includes(raw)) return "adm";
    return "gestor";
  }

  function inferModuloGrupo(modulo) {
    const codigo = normalizeText(modulo?.codigo);
    const nome = normalizeText(modulo?.nome);
    const categoria = normalizeText(modulo?.categoria);

    const isBase =
      ["dashboard", "notificacoes", "historico_geral"].includes(codigo) ||
      categoria === "inicio";

    if (isBase) return "base";

    const isAdm =
      codigo.includes("_adm") ||
      ["financeiro", "hotel", "patrimonio", "usuarios_acessos", "admin_usuarios", "ferias_atestados"].includes(codigo) ||
      categoria === "administracao" ||
      categoria === "diretoria" ||
      categoria === "rh";

    return isAdm ? "adm" : "gestor";
  }

  function getNivelDescription(nivel) {
    return nivel === "adm"
      ? "ADM pode receber módulos administrativos e de gestor conforme liberação."
      : "Gestor pode receber apenas acessos base e módulos do bloco Gestor.";
  }

  async function api(url, options = {}) {
    const session = await getSession();
    const token = extractAccessToken(session);

    if (!token) {
      throw new Error("Sessão expirada. Faça login novamente.");
    }

    const cleanToken = String(token).trim();

    if (cleanToken.split(".").length !== 3) {
      throw new Error("Token de sessão inválido.");
    }

    const res = await fetch(url, {
      ...options,
      headers: {
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...(options.headers || {}),
        Authorization: `Bearer ${cleanToken}`,
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

  function renderBase(content) {
    content.innerHTML = `
      <div id="adminUsuariosApp">
        <div class="au-wrap">
          <div class="au-header">
            <div>
              <h2 class="au-title">Usuários</h2>
              <div class="au-subtitle">Gerencie nível, setor e módulos liberados por usuário</div>
            </div>
            <div class="au-actions">
              <button id="auBtnNovo" class="au-btn au-btn-primary" type="button">Novo usuário</button>
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
                  <th>Nível</th>
                  <th>Setor</th>
                  <th>Status</th>
                  <th>Módulos</th>
                  <th style="width:260px;">Ações</th>
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
                  <label for="auNivel">Nível</label>
                  <select id="auNivel" class="au-input">
                    <option value="gestor">Gestor</option>
                    <option value="adm">ADM</option>
                  </select>
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
                  <input id="auPassword" class="au-input" type="password" placeholder="No cadastro é obrigatória. Na edição, preencha só se quiser trocar." />
                </div>

                <div class="au-field au-field-full">
                  <label>Módulos liberados</label>
                  <div id="auNivelHint" class="au-level-hint"></div>
                  <div id="auModulosContainer" class="au-modulos-sections"></div>
                </div>
              </div>

              <div class="au-modal-footer">
                <button type="submit" class="au-btn au-btn-primary">Salvar</button>
              </div>
            </form>
          </div>
        </div>
      </div>

      <style>
        .au-wrap{padding:16px;color:#e5e7eb}
        .au-header{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:16px}
        .au-title{margin:0;font-size:24px}
        .au-subtitle{opacity:.8;margin-top:4px}
        .au-toolbar{margin-bottom:12px}
        .au-input{width:100%;box-sizing:border-box;border:1px solid #334155;background:#0f172a;color:#e5e7eb;border-radius:10px;padding:10px 12px;outline:none}
        .au-input:focus{border-color:#166534;box-shadow:0 0 0 2px rgba(22,101,52,.25)}
        .au-btn{border:0;border-radius:10px;padding:10px 14px;cursor:pointer}
        .au-btn-primary{background:#166534;color:#fff}
        .au-btn-light{background:#1e293b;color:#e5e7eb}
        .au-feedback{margin-bottom:12px;padding:10px 12px;border-radius:10px;background:#1e293b;border:1px solid #334155}
        .au-table-wrap{overflow:auto;background:#0b1220;border:1px solid #1f2937;border-radius:14px}
        .au-table{width:100%;border-collapse:collapse;min-width:1120px}
        .au-table th,.au-table td{text-align:left;padding:12px;border-bottom:1px solid #1f2937;vertical-align:top}
        .au-badge{display:inline-block;border-radius:999px;padding:4px 10px;font-size:12px;font-weight:600}
        .au-badge-on{background:rgba(22,101,52,.25);color:#86efac}
        .au-badge-off{background:rgba(127,29,29,.25);color:#fca5a5}
        .au-badge-level{background:#1e293b;color:#cbd5e1}
        .au-mod-chip{display:inline-block;padding:4px 8px;margin:2px;border-radius:999px;background:#1e293b;border:1px solid #334155;font-size:12px}
        .au-actions-row{display:flex;flex-wrap:wrap;gap:8px}
        .au-modal{position:fixed;inset:0;background:rgba(2,6,23,.72);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px}
        .au-modal-card{width:min(980px,100%);max-height:92vh;overflow:auto;background:#0b1220;border:1px solid #1f2937;border-radius:18px;padding:18px}
        .au-modal-header{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:14px}
        .au-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}
        .au-field{display:flex;flex-direction:column;gap:6px}
        .au-field-full{grid-column:1 / -1}
        .au-level-hint{font-size:13px;color:#cbd5e1;opacity:.92}
        .au-modulos-sections{display:grid;gap:12px}
        .au-mod-group{border:1px solid #1f2937;border-radius:12px;padding:12px;background:#0f172a}
        .au-mod-group-title{font-size:13px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:#93c5fd;margin-bottom:8px}
        .au-mod-group-subtitle{font-size:12px;color:#94a3b8;margin:-2px 0 10px}
        .au-modulos-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
        .au-mod-item{display:flex;align-items:center;gap:8px;padding:8px 10px;border:1px solid #1f2937;border-radius:10px;background:#111827}
        .au-mod-item.is-disabled{opacity:.45}
        .au-modal-footer{margin-top:16px;display:flex;justify-content:flex-end}
        @media (max-width:900px){.au-grid{grid-template-columns:1fr}.au-modulos-grid{grid-template-columns:1fr}.au-header{flex-direction:column;align-items:stretch}}
      </style>
    `;

    qs("#auBtnNovo").addEventListener("click", () => openModal());
    qs("#auBtnCloseModal").addEventListener("click", closeModal);
    qs("#auFiltro").addEventListener("input", renderTable);
    qs("#auForm").addEventListener("submit", onSubmitForm);
    qs("#auNivel").addEventListener("change", () => syncModulesByLevel());
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
    el.textContent = msg;
  }

  function buildGroupsForNivel(nivel) {
    const all = state.modulosCatalogo.map((m) => ({ ...m, grupo: inferModuloGrupo(m) }));
    const base = all.filter((m) => m.grupo === "base");
    const gestor = all.filter((m) => m.grupo === "gestor");
    const adm = all.filter((m) => m.grupo === "adm");

    if (nivel === "adm") {
      return [
        { key: "base", title: "Base", subtitle: "Acessos iniciais e utilitários.", items: base },
        { key: "gestor", title: "Gestor", subtitle: "Módulos operacionais do gestor.", items: gestor },
        { key: "adm", title: "ADM", subtitle: "Módulos administrativos.", items: adm },
      ].filter((g) => g.items.length);
    }

    return [
      { key: "base", title: "Base", subtitle: "Acessos iniciais e utilitários.", items: base },
      { key: "gestor", title: "Gestor", subtitle: "Módulos operacionais do gestor.", items: gestor },
    ].filter((g) => g.items.length);
  }

  function renderModules(selectedIds = [], nivel = "gestor") {
    const container = qs("#auModulosContainer");
    const hint = qs("#auNivelHint");
    if (!container) return;

    hint.textContent = getNivelDescription(nivel);
    const groups = buildGroupsForNivel(nivel);

    container.innerHTML = groups.map((group) => `
      <section class="au-mod-group">
        <div class="au-mod-group-title">${esc(group.title)}</div>
        <div class="au-mod-group-subtitle">${esc(group.subtitle)}</div>
        <div class="au-modulos-grid">
          ${group.items.map((m) => {
            const checked = selectedIds.includes(m.id) ? "checked" : "";
            return `<label class="au-mod-item"><input type="checkbox" value="${esc(m.id)}" ${checked} /><span>${esc(m.nome || m.codigo || "Módulo")}</span></label>`;
          }).join("")}
        </div>
      </section>
    `).join("");
  }

  function syncModulesByLevel() {
    const nivel = qs("#auNivel")?.value || "gestor";
    const selected = getSelectedModules();
    const allowedIds = new Set(buildGroupsForNivel(nivel).flatMap((g) => g.items.map((m) => m.id)));
    const filtered = selected.filter((id) => allowedIds.has(id));
    renderModules(filtered, nivel);
  }

  function renderTable() {
    const tbody = qs("#auTableBody");
    if (!tbody) return;

    const filtro = (qs("#auFiltro")?.value || "").trim().toLowerCase();
    const items = state.users.filter((u) => {
      const text = [u.nome || "", u.email || "", u.setor || "", u.nivel || "", ...(u.modulos || []).map((m) => m.nome || m.codigo || "")]
        .join(" ").toLowerCase();
      return !filtro || text.includes(filtro);
    });

    tbody.innerHTML = items.map((u) => {
      const isAtivo = (u.status || "ativo") === "ativo";
      const statusClass = isAtivo ? "au-badge-on" : "au-badge-off";
      const statusLabel = isAtivo ? "Ativo" : "Inativo";
      const nivel = (u.nivel || inferNivelFromUser(u)).toUpperCase();
      const modulosHtml = (u.modulos || []).length
        ? u.modulos.map((m) => `<span class="au-mod-chip">${esc(m.nome || m.codigo || "")}</span>`).join("")
        : `<span style="opacity:.7;">Nenhum</span>`;

      return `
        <tr>
          <td>${esc(u.nome || "")}</td>
          <td>${esc(u.email || "")}</td>
          <td><span class="au-badge au-badge-level">${esc(nivel)}</span></td>
          <td>${esc(u.setor || "")}</td>
          <td><span class="au-badge ${statusClass}">${statusLabel}</span></td>
          <td>${modulosHtml}</td>
          <td>
            <div class="au-actions-row">
              <button class="au-btn au-btn-light" type="button" data-action="edit" data-id="${esc(u.id)}">Editar</button>
              <button class="au-btn au-btn-light" type="button" data-action="toggle" data-id="${esc(u.id)}">${isAtivo ? "Desativar" : "Ativar"}</button>
              <button class="au-btn au-btn-light" type="button" data-action="reset" data-id="${esc(u.id)}">Reset senha</button>
            </div>
          </td>
        </tr>
      `;
    }).join("");

    qsa("[data-action='edit']", tbody).forEach((btn) => btn.addEventListener("click", () => editUser(btn.dataset.id)));
    qsa("[data-action='toggle']", tbody).forEach((btn) => btn.addEventListener("click", () => toggleStatus(btn.dataset.id)));
    qsa("[data-action='reset']", tbody).forEach((btn) => btn.addEventListener("click", () => resetPassword(btn.dataset.id)));
  }

  async function loadModulesCatalog() {
    const data = await api("/api/admin/users/profiles");
    state.modulosCatalogo = (data.modulos || data.modules || []).map((m) => ({
      ...m,
      codigo: m.codigo || m.code || "",
      nome: m.nome || m.name || "",
      categoria: m.categoria || m.category || "",
    }));
  }

  async function loadUsers() {
    const data = await api("/api/admin/users/list");
    state.users = (data.usuarios || data.users || []).map((u) => ({
      ...u,
      nivel: u.nivel || inferNivelFromUser(u),
    }));
    renderTable();
  }

  async function loadUserModuleIds(userId) {
    const data = await api(`/api/admin/users/list?id=${encodeURIComponent(userId)}`);
    const user = (data.usuarios || data.users || []).find((u) => u.id === userId);
    return (user?.modulos || []).map((m) => m.id);
  }

  function openModal(user = null, selectedModuleIds = []) {
    state.editingUserId = user?.id || null;
    const nivel = user?.nivel || inferNivelFromUser(user);
    qs("#auModalTitle").textContent = user ? "Editar usuário" : "Novo usuário";
    qs("#auUserId").value = user?.id || "";
    qs("#auNome").value = user?.nome || "";
    qs("#auEmail").value = user?.email || "";
    qs("#auNivel").value = nivel;
    qs("#auSetor").value = user?.setor || "";
    qs("#auAtivo").value = (user?.status || "ativo") === "ativo" ? "true" : "false";
    qs("#auPassword").value = "";
    renderModules(selectedModuleIds, nivel);
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
      const selected = await loadUserModuleIds(userId);
      openModal(user, selected);
    } catch (err) {
      console.error(err);
      setFeedback(err.message || String(err), true);
    }
  }

  async function toggleStatus(userId) {
    try {
      setFeedback("Salvando status...");
      await api("/api/admin/users/toggle-status", {
        method: "POST",
        body: JSON.stringify({ id: userId }),
      });
      setFeedback("Status atualizado com sucesso.");
      await loadUsers();
    } catch (err) {
      console.error(err);
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
      console.error(err);
      setFeedback(err.message || String(err), true);
    }
  }

  async function onSubmitForm(ev) {
    ev.preventDefault();

    const id = qs("#auUserId").value.trim();
    const nome = qs("#auNome").value.trim();
    const email = qs("#auEmail").value.trim();
    const nivel = qs("#auNivel").value;
    const setor = qs("#auSetor").value.trim();
    const status = qs("#auAtivo").value === "true" ? "ativo" : "inativo";
    const password = qs("#auPassword").value;
    const modulos = getSelectedModules();

    const payload = {
      id,
      nome,
      email,
      nivel,
      role: nivel,
      perfil_codigo: nivel,
      setor,
      status,
      modulos
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
      console.error(err);
      setFeedback(err.message || String(err), true);
    }
  }

  async function boot(content) {
    renderBase(content);
    try {
      setFeedback("Carregando...");
      await loadModulesCatalog();
      await loadUsers();
      setFeedback("");
    } catch (err) {
      console.error("Erro ao iniciar admin-usuarios:", err);
      setFeedback(err.message || String(err), true);
    }
  }

  initProtectedPage("Usuários", boot);
})();
