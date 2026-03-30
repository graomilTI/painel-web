import { initProtectedPage } from './pageInit.js';
import { getSession } from './auth.js';

const state = {
  users: [],
  profiles: [],
  collaboratorResults: [],
  selectedCollaborator: null,
  editingUserId: null,
};

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function setFeedback(message, type = 'info') {
  const el = document.getElementById('usersFeedback');
  if (!el) return;
  el.textContent = message || '';
  el.className = `feedback users-feedback ${type}`;
}

function setModalFeedback(message, type = 'info') {
  const el = document.getElementById('userModalFeedback');
  if (!el) return;
  el.textContent = message || '';
  el.className = `feedback users-feedback ${type}`;
}

async function apiFetch(path, options = {}) {
  const session = await getSession();
  if (!session?.access_token) {
    window.location.replace('./login.html');
    throw new Error('Sessão expirada.');
  }

  const headers = new Headers(options.headers || {});
  headers.set('Authorization', `Bearer ${session.access_token}`);
  if (!headers.has('Content-Type') && options.body && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(path, {
    ...options,
    headers,
  });

  const contentType = response.headers.get('content-type') || '';
  const payload = contentType.includes('application/json')
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    const message =
      payload?.error ||
      payload?.message ||
      (typeof payload === 'string' ? payload : 'Erro na requisição');
    throw new Error(message);
  }

  return payload;
}

function userCardMetrics(users) {
  const total = users.length;
  const ativos = users.filter((u) => String(u.status || '').toLowerCase() === 'ativo').length;
  const masters = users.filter((u) => String(u.perfil_codigo || '').toLowerCase() === 'master').length;
  return { total, ativos, masters };
}

function renderPage(content, userContext) {
  if (!userContext?.user?.is_master) {
    content.innerHTML = `
      <article class="card">
        <h3>Acesso restrito</h3>
        <p>Este módulo é exclusivo para usuários Master.</p>
      </article>
    `;
    return;
  }

  content.innerHTML = `
    <section class="hero-card">
      <div>
        <div class="eyebrow">Administração</div>
        <h2>Usuários e Acessos</h2>
        <p>
          Cadastre logins a partir da base diária de colaboradores, defina o perfil
          e controle o status de acesso sem precisar criar usuários via SQL.
        </p>
      </div>
      <div class="hero-badge-wrap">
        <span class="hero-badge">MASTER</span>
      </div>
    </section>

    <div class="grid-cards mt-16">
      <article class="card">
        <h3>Total de usuários</h3>
        <p class="metric" id="metricUsuariosTotal">-</p>
        <p class="muted">Cadastros de acesso na tabela app_usuarios.</p>
      </article>

      <article class="card">
        <h3>Ativos</h3>
        <p class="metric" id="metricUsuariosAtivos">-</p>
        <p class="muted">Usuários com status de acesso ativo.</p>
      </article>

      <article class="card">
        <h3>Masters</h3>
        <p class="metric" id="metricUsuariosMaster">-</p>
        <p class="muted">Contas com perfil master.</p>
      </article>
    </div>

    <article class="card mt-16">
      <div class="users-toolbar">
        <div class="users-toolbar-left">
          <input id="filtroUsuario" class="users-input" type="text" placeholder="Buscar por nome, e-mail, empresa ou supervisão" />
          <select id="filtroPerfil" class="users-select">
            <option value="">Todos os perfis</option>
          </select>
          <select id="filtroStatus" class="users-select">
            <option value="">Todos os status</option>
            <option value="ativo">Ativo</option>
            <option value="inativo">Inativo</option>
          </select>
        </div>

        <div class="users-toolbar-right">
          <button class="btn btn-secondary" type="button" id="btnAtualizarUsuarios">Atualizar</button>
          <button class="btn btn-primary users-btn-inline" type="button" id="btnNovoUsuario">Novo usuário</button>
        </div>
      </div>

      <div id="usersFeedback" class="feedback users-feedback"></div>

      <div class="users-table-wrap">
        <table class="users-table">
          <thead>
            <tr>
              <th>Nome</th>
              <th>E-mail</th>
              <th>Perfil</th>
              <th>Status</th>
              <th>Empresa</th>
              <th>Coordenação</th>
              <th>Supervisão</th>
              <th>Criado em</th>
              <th style="width: 220px;">Ações</th>
            </tr>
          </thead>
          <tbody id="usersTableBody">
            <tr><td colspan="9">Carregando usuários...</td></tr>
          </tbody>
        </table>
      </div>
    </article>

    <div class="users-modal-backdrop hidden" id="userModalBackdrop">
      <div class="users-modal">
        <div class="users-modal-header">
          <div>
            <h3 id="userModalTitle">Novo usuário</h3>
            <p class="muted">Selecione o colaborador da base diária e defina o perfil de acesso.</p>
          </div>
          <button class="btn btn-secondary" type="button" id="btnFecharModal">Fechar</button>
        </div>

        <div id="userModalFeedback" class="feedback users-feedback"></div>

        <div class="users-form-grid">
          <div class="users-form-col-span-2">
            <label class="users-label" for="colaboradorBusca">Colaborador</label>
            <input id="colaboradorBusca" class="users-input" type="text" placeholder="Busque por nome, e-mail ou CPF" autocomplete="off" />
            <div class="users-search-results hidden" id="colaboradorResultados"></div>
          </div>

          <div>
            <label class="users-label">Nome</label>
            <input id="colaboradorNome" class="users-input" type="text" readonly />
          </div>

          <div>
            <label class="users-label">E-mail</label>
            <input id="colaboradorEmail" class="users-input" type="text" readonly />
          </div>

          <div>
            <label class="users-label">Empresa</label>
            <input id="colaboradorEmpresa" class="users-input" type="text" readonly />
          </div>

          <div>
            <label class="users-label">Coordenação</label>
            <input id="colaboradorCoordenacao" class="users-input" type="text" readonly />
          </div>

          <div>
            <label class="users-label">Supervisão</label>
            <input id="colaboradorSupervisao" class="users-input" type="text" readonly />
          </div>

          <div>
            <label class="users-label">Perfil</label>
            <select id="perfilCodigo" class="users-select"></select>
          </div>

          <div>
            <label class="users-label">Status</label>
            <select id="statusAcesso" class="users-select">
              <option value="ativo">Ativo</option>
              <option value="inativo">Inativo</option>
            </select>
          </div>

          <div id="passwordWrap" class="users-form-col-span-2">
            <label class="users-label" for="senhaTemporaria">Senha temporária</label>
            <input id="senhaTemporaria" class="users-input" type="text" placeholder="Deixe em branco para gerar automática" />
          </div>
        </div>

        <div class="users-modal-actions">
          <button class="btn btn-secondary" type="button" id="btnLimparForm">Limpar</button>
          <button class="btn btn-primary users-btn-inline" type="button" id="btnSalvarUsuario">Salvar usuário</button>
        </div>
      </div>
    </div>
  `;

  bindPageEvents();
  loadInitialData().catch((err) => {
    console.error(err);
    setFeedback(err.message || 'Erro ao carregar módulo.', 'error');
  });
}

async function loadInitialData() {
  setFeedback('Carregando dados do módulo...');
  const [profilesPayload, usersPayload] = await Promise.all([
    apiFetch('/api/admin/users/profiles'),
    apiFetch('/api/admin/users/list'),
  ]);

  state.profiles = profilesPayload.items || [];
  state.users = usersPayload.items || [];

  fillProfileSelects();
  renderUsersTable();
  setFeedback(`${state.users.length} usuário(s) carregado(s).`, 'success');
}

function fillProfileSelects() {
  const selects = [
    document.getElementById('perfilCodigo'),
    document.getElementById('filtroPerfil'),
  ];

  selects.forEach((select, index) => {
    if (!select) return;
    const currentValue = select.value;
    if (index === 0) {
      select.innerHTML = state.profiles
        .map((profile) => `<option value="${profile.codigo}">${escapeHtml(profile.nome)}</option>`)
        .join('');
    } else {
      select.innerHTML = `<option value="">Todos os perfis</option>` +
        state.profiles
          .map((profile) => `<option value="${profile.codigo}">${escapeHtml(profile.nome)}</option>`)
          .join('');
    }
    if (currentValue) select.value = currentValue;
  });
}

function applyFilters() {
  const q = (document.getElementById('filtroUsuario')?.value || '').trim().toLowerCase();
  const perfil = (document.getElementById('filtroPerfil')?.value || '').trim().toLowerCase();
  const status = (document.getElementById('filtroStatus')?.value || '').trim().toLowerCase();

  const filtered = state.users.filter((user) => {
    const haystack = [
      user.nome,
      user.email,
      user.empresa,
      user.coordenacao,
      user.supervisao,
      user.perfil_nome,
      user.perfil_codigo,
    ].join(' ').toLowerCase();

    const qOk = !q || haystack.includes(q);
    const perfilOk = !perfil || String(user.perfil_codigo || '').toLowerCase() === perfil;
    const statusOk = !status || String(user.status || '').toLowerCase() === status;
    return qOk && perfilOk && statusOk;
  });

  return filtered;
}

function renderUsersTable() {
  const tbody = document.getElementById('usersTableBody');
  if (!tbody) return;

  const filtered = applyFilters();
  const metrics = userCardMetrics(state.users);

  const totalEl = document.getElementById('metricUsuariosTotal');
  const ativosEl = document.getElementById('metricUsuariosAtivos');
  const mastersEl = document.getElementById('metricUsuariosMaster');
  if (totalEl) totalEl.textContent = String(metrics.total);
  if (ativosEl) ativosEl.textContent = String(metrics.ativos);
  if (mastersEl) mastersEl.textContent = String(metrics.masters);

  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="9">Nenhum usuário encontrado com os filtros aplicados.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map((user) => `
    <tr>
      <td>${escapeHtml(user.nome)}</td>
      <td>${escapeHtml(user.email)}</td>
      <td>${escapeHtml(user.perfil_nome || user.perfil_codigo || '-')}</td>
      <td><span class="users-status ${String(user.status).toLowerCase() === 'ativo' ? 'is-active' : 'is-inactive'}">${escapeHtml(user.status || '-')}</span></td>
      <td>${escapeHtml(user.empresa || '-')}</td>
      <td>${escapeHtml(user.coordenacao || '-')}</td>
      <td>${escapeHtml(user.supervisao || '-')}</td>
      <td>${escapeHtml((user.created_at || '').slice(0, 10) || '-')}</td>
      <td>
        <div class="users-actions">
          <button class="btn btn-secondary users-action-btn" type="button" data-action="edit" data-id="${user.id}">Editar</button>
          <button class="btn btn-secondary users-action-btn" type="button" data-action="toggle" data-id="${user.id}">${String(user.status).toLowerCase() === 'ativo' ? 'Inativar' : 'Ativar'}</button>
          <button class="btn btn-secondary users-action-btn" type="button" data-action="reset" data-id="${user.id}">Resetar senha</button>
        </div>
      </td>
    </tr>
  `).join('');
}

function bindPageEvents() {
  document.getElementById('filtroUsuario')?.addEventListener('input', renderUsersTable);
  document.getElementById('filtroPerfil')?.addEventListener('change', renderUsersTable);
  document.getElementById('filtroStatus')?.addEventListener('change', renderUsersTable);
  document.getElementById('btnAtualizarUsuarios')?.addEventListener('click', refreshUsers);
  document.getElementById('btnNovoUsuario')?.addEventListener('click', () => openModal());
  document.getElementById('btnFecharModal')?.addEventListener('click', closeModal);
  document.getElementById('btnLimparForm')?.addEventListener('click', resetForm);
  document.getElementById('btnSalvarUsuario')?.addEventListener('click', submitForm);
  document.getElementById('colaboradorBusca')?.addEventListener('input', onCollaboratorSearch);
  document.getElementById('usersTableBody')?.addEventListener('click', onTableAction);
  document.getElementById('colaboradorResultados')?.addEventListener('click', onSelectCollaborator);
  document.getElementById('userModalBackdrop')?.addEventListener('click', (event) => {
    if (event.target.id === 'userModalBackdrop') closeModal();
  });
}

async function refreshUsers() {
  setFeedback('Atualizando usuários...');
  const payload = await apiFetch('/api/admin/users/list');
  state.users = payload.items || [];
  renderUsersTable();
  setFeedback(`${state.users.length} usuário(s) carregado(s).`, 'success');
}

function openModal(user = null) {
  state.editingUserId = user?.id || null;
  const backdrop = document.getElementById('userModalBackdrop');
  const title = document.getElementById('userModalTitle');
  const saveBtn = document.getElementById('btnSalvarUsuario');
  const searchInput = document.getElementById('colaboradorBusca');
  const passwordWrap = document.getElementById('passwordWrap');

  resetForm();
  setModalFeedback('');

  if (title) title.textContent = user ? 'Editar usuário' : 'Novo usuário';
  if (saveBtn) saveBtn.textContent = user ? 'Salvar alterações' : 'Salvar usuário';
  if (passwordWrap) passwordWrap.style.display = user ? 'none' : 'block';

  if (user) {
    setSelectedCollaborator({
      id: user.colaborador_id,
      nome: user.nome,
      email_empresa: user.email,
      empresa: user.empresa,
      coordenacao: user.coordenacao,
      supervisao: user.supervisao,
    });
    if (searchInput) {
      searchInput.value = `${user.nome} • ${user.email}`;
      searchInput.disabled = true;
    }
    document.getElementById('perfilCodigo').value = user.perfil_codigo || '';
    document.getElementById('statusAcesso').value = user.status || 'ativo';
  } else if (searchInput) {
    searchInput.disabled = false;
  }

  backdrop?.classList.remove('hidden');
}

function closeModal() {
  document.getElementById('userModalBackdrop')?.classList.add('hidden');
  state.editingUserId = null;
  state.collaboratorResults = [];
  state.selectedCollaborator = null;
}

function resetForm() {
  state.selectedCollaborator = null;
  state.collaboratorResults = [];
  setModalFeedback('');

  const searchInput = document.getElementById('colaboradorBusca');
  if (searchInput) {
    searchInput.value = '';
    searchInput.disabled = false;
  }

  ['colaboradorNome','colaboradorEmail','colaboradorEmpresa','colaboradorCoordenacao','colaboradorSupervisao','senhaTemporaria']
    .forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });

  if (document.getElementById('statusAcesso')) document.getElementById('statusAcesso').value = 'ativo';
  if (document.getElementById('perfilCodigo') && state.profiles[0]) {
    document.getElementById('perfilCodigo').value = state.profiles[0].codigo;
  }

  renderCollaboratorResults();
}

let collaboratorSearchTimer = null;

function onCollaboratorSearch(event) {
  const term = String(event.target.value || '').trim();
  if (state.editingUserId) return;

  clearTimeout(collaboratorSearchTimer);
  collaboratorSearchTimer = setTimeout(async () => {
    if (term.length < 3) {
      state.collaboratorResults = [];
      renderCollaboratorResults();
      return;
    }

    try {
      const payload = await apiFetch(`/api/admin/users/collaborators?q=${encodeURIComponent(term)}`);
      state.collaboratorResults = payload.items || [];
      renderCollaboratorResults();
    } catch (err) {
      console.error(err);
      setModalFeedback(err.message || 'Erro ao buscar colaboradores.', 'error');
    }
  }, 250);
}

function renderCollaboratorResults() {
  const wrap = document.getElementById('colaboradorResultados');
  if (!wrap) return;

  if (!state.collaboratorResults.length) {
    wrap.innerHTML = '';
    wrap.classList.add('hidden');
    return;
  }

  wrap.innerHTML = state.collaboratorResults.map((item) => `
    <button class="users-search-item" type="button" data-id="${item.id}">
      <strong>${escapeHtml(item.nome)}</strong>
      <span>${escapeHtml(item.email || item.email_empresa || 'Sem e-mail')} • ${escapeHtml(item.empresa || '-')} • ${escapeHtml(item.supervisao || '-')}</span>
    </button>
  `).join('');
  wrap.classList.remove('hidden');
}

function onSelectCollaborator(event) {
  const btn = event.target.closest('[data-id]');
  if (!btn) return;
  const found = state.collaboratorResults.find((item) => item.id === btn.dataset.id);
  if (!found) return;
  setSelectedCollaborator(found);
  document.getElementById('colaboradorBusca').value = `${found.nome} • ${found.email || found.email_empresa || 'Sem e-mail'}`;
  state.collaboratorResults = [];
  renderCollaboratorResults();
}

function setSelectedCollaborator(item) {
  state.selectedCollaborator = item;
  document.getElementById('colaboradorNome').value = item.nome || '';
  document.getElementById('colaboradorEmail').value = item.email || item.email_empresa || '';
  document.getElementById('colaboradorEmpresa').value = item.empresa || '';
  document.getElementById('colaboradorCoordenacao').value = item.coordenacao || '';
  document.getElementById('colaboradorSupervisao').value = item.supervisao || '';
}

async function submitForm() {
  const perfilCodigo = document.getElementById('perfilCodigo')?.value;
  const status = document.getElementById('statusAcesso')?.value || 'ativo';
  const senhaTemporaria = document.getElementById('senhaTemporaria')?.value?.trim() || null;

  if (!state.editingUserId && !state.selectedCollaborator?.id) {
    setModalFeedback('Selecione um colaborador da base antes de salvar.', 'error');
    return;
  }

  if (!perfilCodigo) {
    setModalFeedback('Selecione o perfil do usuário.', 'error');
    return;
  }

  try {
    if (state.editingUserId) {
      await apiFetch('/api/admin/users/update', {
        method: 'POST',
        body: JSON.stringify({
          usuario_id: state.editingUserId,
          perfil_codigo: perfilCodigo,
          status,
        }),
      });
      setFeedback('Usuário atualizado com sucesso.', 'success');
    } else {
      const payload = await apiFetch('/api/admin/users/create', {
        method: 'POST',
        body: JSON.stringify({
          colaborador_id: state.selectedCollaborator.id,
          perfil_codigo: perfilCodigo,
          status,
          senha_temporaria: senhaTemporaria,
        }),
      });

      const message = payload.senha_temporaria
        ? `Usuário criado com sucesso. Senha temporária: ${payload.senha_temporaria}`
        : 'Usuário criado com sucesso.';
      setFeedback(message, 'success');
    }

    closeModal();
    await refreshUsers();
  } catch (err) {
    console.error(err);
    setModalFeedback(err.message || 'Erro ao salvar usuário.', 'error');
  }
}

async function onTableAction(event) {
  const button = event.target.closest('[data-action]');
  if (!button) return;

  const action = button.dataset.action;
  const userId = button.dataset.id;
  const user = state.users.find((item) => item.id === userId);
  if (!user) return;

  if (action === 'edit') {
    openModal(user);
    return;
  }

  if (action === 'toggle') {
    const novoStatus = String(user.status || '').toLowerCase() === 'ativo' ? 'inativo' : 'ativo';
    if (!confirm(`Deseja alterar o status de ${user.nome} para ${novoStatus}?`)) return;

    try {
      await apiFetch('/api/admin/users/toggle-status', {
        method: 'POST',
        body: JSON.stringify({
          usuario_id: user.id,
          status: novoStatus,
        }),
      });
      setFeedback(`Status de ${user.nome} alterado para ${novoStatus}.`, 'success');
      await refreshUsers();
    } catch (err) {
      console.error(err);
      setFeedback(err.message || 'Erro ao alterar status.', 'error');
    }
    return;
  }

  if (action === 'reset') {
    if (!confirm(`Gerar nova senha temporária para ${user.nome}?`)) return;

    try {
      const payload = await apiFetch('/api/admin/users/reset-password', {
        method: 'POST',
        body: JSON.stringify({
          usuario_id: user.id,
        }),
      });
      setFeedback(`Nova senha temporária para ${user.nome}: ${payload.senha_temporaria}`, 'success');
    } catch (err) {
      console.error(err);
      setFeedback(err.message || 'Erro ao resetar senha.', 'error');
    }
  }
}

initProtectedPage('Usuários e Acessos', renderPage);
