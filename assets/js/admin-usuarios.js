
import { getSession } from './auth.js';
import { initProtectedPage } from './pageInit.js';
import { supabase } from './supabaseClient.js';

(function () {
  const state = {
    users: [],
    modulosCatalogo: [],
    editingUserId: null,
    collaboratorResults: [],
    collaboratorSearchToken: 0,
    supervisoesCatalogo: [],
    currentUserContext: null,
  };

  const qs = (s, e = document) => e.querySelector(s);
  const qsa = (s, e = document) => Array.from(e.querySelectorAll(s));

  const BASE_CODES = new Set(['dashboard', 'notificacoes', 'historico_geral']);
  const GESTOR_CODES = new Set([
    'programacao',
    'hospedagem',
    'compras_gestor',
    'logistica_gestor',
    'patrimonios_gestor',
    'contato_cliente',
    'conferencia',
  ]);

  function esc(v) {
    return String(v ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function normalizeCode(v) {
    return String(v || '')
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  }

  function parseSupervisaoList(value) {
    if (Array.isArray(value)) {
      return [...new Set(value.map((item) => String(item || '').trim()).filter(Boolean))];
    }

    return [...new Set(
      String(value || '')
        .split(/[,;|\n]+/)
        .map((item) => item.trim())
        .filter(Boolean)
    )];
  }

  function currentUserIsMaster() {
    return !!state.currentUserContext?.user?.is_master;
  }

  function debounce(fn, wait = 250) {
    let timer = null;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), wait);
    };
  }

  function extractAccessToken(sessionLike) {
    return (
      sessionLike?.access_token ||
      sessionLike?.session?.access_token ||
      sessionLike?.data?.session?.access_token ||
      null
    );
  }

  async function api(url, options = {}) {
    const session = await getSession();
    const token = extractAccessToken(session);

    if (!token) {
      throw new Error('Sessão expirada. Faça login novamente.');
    }

    const cleanToken = String(token).trim();
    if (cleanToken.split('.').length !== 3) {
      throw new Error('Token de sessão inválido.');
    }

    const res = await fetch(url, {
      ...options,
      headers: {
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
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

  function detectNivelFromUser(user = {}) {
    const raw = String(
      user?.nivel ||
      user?.perfil_codigo ||
      user?.perfil?.codigo ||
      user?.role ||
      user?.perfil_nome ||
      ''
    ).toLowerCase();

    if (raw.includes('gestor')) return 'gestor';
    if (raw.includes('adm') || raw.includes('admin')) return 'adm';
    if (raw.includes('master')) return 'adm';
    return 'gestor';
  }

  function getPerfilCodigoByNivel(nivel) {
    return nivel === 'adm' ? 'adm' : 'gestor';
  }

  function getGroupedModules() {
    const base = [];
    const gestor = [];
    const adm = [];

    for (const mod of state.modulosCatalogo) {
      const code = normalizeCode(mod.codigo || mod.code);
      if (BASE_CODES.has(code)) {
        base.push(mod);
      } else if (GESTOR_CODES.has(code)) {
        gestor.push(mod);
      } else {
        adm.push(mod);
      }
    }

    const sorter = (a, b) => String(a.nome || a.codigo || '').localeCompare(String(b.nome || b.codigo || ''));
    base.sort(sorter);
    gestor.sort(sorter);
    adm.sort(sorter);

    return { base, gestor, adm };
  }

  function moduleLabel(mod) {
    return mod.nome || mod.codigo || 'Módulo';
  }

  function userVisibleModulesForTable(user = {}) {
    const mods = Array.isArray(user.modulos) ? user.modulos : [];
    return mods.map((m) => ({
      nome: m.nome || m.name || m.codigo || m.code || '',
      codigo: m.codigo || m.code || '',
    }));
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
                  <th>Supervisão</th>
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
                <div class="au-field au-field-search">
                  <label for="auNome">Nome</label>
                  <input id="auNome" class="au-input" type="text" required autocomplete="off" />
                  <div id="auCollaboratorResults" class="au-search-results" style="display:none;"></div>
                </div>

                <div class="au-field">
                  <label for="auEmail">E-mail</label>
                  <input id="auEmail" class="au-input" type="email" required autocomplete="email" />
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

                <div class="au-field au-field-full" id="auSupervisaoField" style="display:none;">
                  <label>Supervisões liberadas</label>
                  <div class="au-hint">Selecione as supervisões que este usuário poderá acessar.</div>
                  <input id="auSupervisaoBusca" class="au-input" type="text" placeholder="Buscar supervisão" />
                  <div id="auSupervisaoOptions" class="au-supervisao-grid"></div>
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
                  <input id="auPassword" class="au-input" type="password" placeholder="No cadastro é obrigatória. Na edição, preencha só se quiser trocar." autocomplete="new-password" />
                </div>

                <div class="au-field au-field-full">
                  <label>Módulos liberados</label>
                  <div id="auNivelHint" class="au-hint"></div>
                  <div id="auModulosContainer" class="au-module-groups"></div>
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
        .au-mod-chip{display:inline-block;padding:4px 8px;margin:2px;border-radius:999px;background:#1e293b;border:1px solid #334155;font-size:12px}
        .au-actions-row{display:flex;flex-wrap:wrap;gap:8px}
        .au-modal{position:fixed;inset:0;background:rgba(2,6,23,.72);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px}
        .au-modal-card{width:min(1120px,100%);max-height:92vh;overflow:auto;background:#0b1220;border:1px solid #1f2937;border-radius:18px;padding:18px}
        .au-modal-header{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:14px}
        .au-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}
        .au-field{display:flex;flex-direction:column;gap:6px}
        .au-field-search{position:relative}
        .au-field-full{grid-column:1 / -1}
        .au-hint{font-size:13px;opacity:.8;margin-bottom:8px}
        .au-module-groups{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}
        .au-module-group{border:1px solid #1f2937;border-radius:12px;padding:12px;background:#0f172a}
        .au-module-group h4{margin:0 0 10px;font-size:13px;text-transform:uppercase;letter-spacing:.04em;opacity:.86}
        .au-modulos{display:grid;grid-template-columns:1fr;gap:8px}
        .au-mod-item{display:flex;align-items:center;gap:8px;padding:8px 10px;border:1px solid #1f2937;border-radius:10px;background:#111827}
        .au-search-results{position:absolute;z-index:20;left:0;right:0;top:calc(100% + 6px);max-height:240px;overflow:auto;background:#0b1220;border:1px solid #334155;border-radius:12px;padding:6px}
        .au-search-item{padding:10px 12px;border-radius:10px;cursor:pointer;border:1px solid transparent}
        .au-search-item:hover{background:#111827;border-color:#1f2937}
        .au-search-item strong{display:block}
        .au-search-item span{display:block;font-size:12px;opacity:.75;margin-top:4px}
        .au-empty-search{padding:10px 12px;opacity:.75}
        .au-supervisao-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;max-height:220px;overflow:auto;padding:4px 0}
        .au-supervisao-item{display:flex;align-items:center;gap:8px;padding:9px 10px;border:1px solid #1f2937;border-radius:10px;background:#111827}
        .au-supervisao-empty{padding:10px 12px;border:1px dashed #334155;border-radius:10px;opacity:.75}
        .au-modal-footer{margin-top:16px;display:flex;justify-content:flex-end}
        @media (max-width:1000px){.au-grid{grid-template-columns:1fr}.au-module-groups,.au-supervisao-grid{grid-template-columns:1fr}.au-header{flex-direction:column;align-items:stretch}}
      </style>
    `;

    qs('#auBtnNovo').addEventListener('click', () => openModal());
    qs('#auBtnCloseModal').addEventListener('click', closeModal);
    qs('#auFiltro').addEventListener('input', renderTable);
    qs('#auForm').addEventListener('submit', onSubmitForm);
    qs('#auNivel').addEventListener('change', () => renderModulesForNivel(qs('#auNivel').value, getSelectedModules()));
    qs('#auSupervisaoBusca')?.addEventListener('input', renderSupervisaoOptions);
    bindCollaboratorSearch();
  }

  function setFeedback(msg, isError = false) {
    const el = qs('#auFeedback');
    if (!el) return;
    if (!msg) {
      el.style.display = 'none';
      el.innerHTML = '';
      return;
    }
    el.style.display = 'block';
    el.style.borderColor = isError ? '#7f1d1d' : '#334155';
    el.style.background = isError ? 'rgba(127,29,29,.15)' : '#1e293b';
    el.textContent = msg;
  }

  function renderModulesForNivel(nivel, selectedIds = []) {
    const container = qs('#auModulosContainer');
    const hint = qs('#auNivelHint');
    if (!container) return;

    const groups = getGroupedModules();
    const blocks = [
      { key: 'base', title: 'Base', items: groups.base },
      { key: 'gestor', title: 'Gestor', items: groups.gestor },
    ];
    if (nivel === 'adm') {
      blocks.push({ key: 'adm', title: 'ADM', items: groups.adm });
    }

    hint.textContent = nivel === 'adm'
      ? 'ADM pode receber módulos administrativos e de gestor conforme liberação.'
      : 'Gestor pode receber apenas acessos base e módulos do bloco Gestor.';

    container.innerHTML = blocks.map((block) => `
      <section class="au-module-group">
        <h4>${esc(block.title)}</h4>
        <div class="au-modulos">
          ${block.items.map((m) => {
            const checked = selectedIds.includes(m.id) ? 'checked' : '';
            return `<label class="au-mod-item"><input type="checkbox" value="${esc(m.id)}" ${checked} /><span>${esc(moduleLabel(m))}</span></label>`;
          }).join('') || '<div style="opacity:.7;">Sem módulos neste bloco.</div>'}
        </div>
      </section>
    `).join('');
  }

  function getSelectedSupervisoes() {
    return qsa('#auSupervisaoOptions input:checked').map((el) => el.value);
  }

  function renderSupervisaoOptions() {
    const wrap = qs('#auSupervisaoField');
    const container = qs('#auSupervisaoOptions');
    if (!wrap || !container) return;

    if (!currentUserIsMaster()) {
      wrap.style.display = 'none';
      container.innerHTML = '';
      return;
    }

    wrap.style.display = 'flex';
    const selected = new Set(parseSupervisaoList(qs('#auSupervisaoOptions')?.dataset.selected || ''));
    const term = normalizeCode(qs('#auSupervisaoBusca')?.value || '');
    const items = state.supervisoesCatalogo.filter((name) => !term || normalizeCode(name).includes(term));

    if (!items.length) {
      container.innerHTML = '<div class="au-supervisao-empty">Nenhuma supervisão encontrada.</div>';
      return;
    }

    container.innerHTML = items.map((name) => {
      const checked = selected.has(name) ? 'checked' : '';
      return `<label class="au-supervisao-item"><input type="checkbox" value="${esc(name)}" ${checked} /><span>${esc(name)}</span></label>`;
    }).join('');

    qsa('#auSupervisaoOptions input[type="checkbox"]', container).forEach((input) => {
      input.addEventListener('change', () => {
        const current = new Set(parseSupervisaoList(container.dataset.selected || ''));
        if (input.checked) current.add(input.value);
        else current.delete(input.value);
        container.dataset.selected = [...current].join(', ');
      });
    });
  }

  function presetSupervisoes(values = []) {
    const container = qs('#auSupervisaoOptions');
    if (!container) return;
    container.dataset.selected = parseSupervisaoList(values).join(', ');
    renderSupervisaoOptions();
  }

  async function loadSupervisoesCatalog() {
    const tables = ['supervisoes', 'colaboradores', 'colaborador_snapshot'];
    const all = new Set();

    for (const table of tables) {
      try {
        const { data, error } = await supabase
          .from(table)
          .select('nome, supervisao')
          .limit(5000);

        if (error) continue;
        for (const row of data || []) {
          const value = row?.nome || row?.supervisao;
          if (String(value || '').trim()) all.add(String(value).trim());
        }
        if (all.size) break;
      } catch (err) {
        console.warn(`Falha ao carregar supervisões de ${table}:`, err);
      }
    }

    state.supervisoesCatalogo = [...all].sort((a, b) => a.localeCompare(b));
  }

  function renderTable() {
    const tbody = qs('#auTableBody');
    if (!tbody) return;

    const filtro = (qs('#auFiltro')?.value || '').trim().toLowerCase();
    const items = state.users.filter((u) => {
      const mods = userVisibleModulesForTable(u).map((m) => m.nome || m.codigo || '');
      const text = [u.nome || '', u.email || '', u.setor || '', detectNivelFromUser(u), ...mods].join(' ').toLowerCase();
      return !filtro || text.includes(filtro);
    });

    tbody.innerHTML = items.map((u) => {
      const isAtivo = (u.status || 'ativo') === 'ativo';
      const statusClass = isAtivo ? 'au-badge-on' : 'au-badge-off';
      const statusLabel = isAtivo ? 'Ativo' : 'Inativo';
      const nivel = detectNivelFromUser(u);
      const modulosHtml = userVisibleModulesForTable(u).length
        ? userVisibleModulesForTable(u).map((m) => `<span class="au-mod-chip">${esc(m.nome || m.codigo || '')}</span>`).join('')
        : `<span style="opacity:.7;">Sem módulos</span>`;

      return `
        <tr>
          <td>${esc(u.nome || '')}</td>
          <td>${esc(u.email || '')}</td>
          <td>${esc(nivel === 'adm' ? 'ADM' : 'Gestor')}</td>
          <td>${esc(u.setor || '')}</td>
          <td>${parseSupervisaoList(u.supervisao || u.supervisoes).map((item) => `<span class="au-mod-chip">${esc(item)}</span>`).join('') || '<span style="opacity:.7;">Todas</span>'}</td>
          <td><span class="au-badge ${statusClass}">${statusLabel}</span></td>
          <td>${modulosHtml}</td>
          <td>
            <div class="au-actions-row">
              <button class="au-btn au-btn-light" data-action="edit" data-id="${esc(u.id)}" type="button">Editar</button>
              <button class="au-btn au-btn-light" data-action="toggle" data-id="${esc(u.id)}" type="button">${isAtivo ? 'Desativar' : 'Ativar'}</button>
              <button class="au-btn au-btn-light" data-action="reset" data-id="${esc(u.id)}" type="button">Reset senha</button>
            </div>
          </td>
        </tr>
      `;
    }).join('');

    qsa("[data-action='edit']", tbody).forEach((b) => b.addEventListener('click', () => editUser(b.dataset.id)));
    qsa("[data-action='toggle']", tbody).forEach((b) => b.addEventListener('click', () => toggleStatus(b.dataset.id)));
    qsa("[data-action='reset']", tbody).forEach((b) => b.addEventListener('click', () => resetPassword(b.dataset.id)));
  }

  async function loadUsers() {
    const res = await api('/api/admin/users/list');
    state.users = res.items || [];
    renderTable();
  }

  async function loadModulesCatalog() {
    const res = await api('/api/admin/users/modulos');
    state.modulosCatalogo = res.items || [];
  }

  async function loadUserModuleIds(userId) {
    const res = await api(`/api/admin/users/user-modulos?user_id=${encodeURIComponent(userId)}`);
    return res.items || [];
  }

  async function searchCollaborators(query) {
    const q = String(query || '').trim();
    if (q.length < 3) {
      state.collaboratorResults = [];
      renderCollaboratorResults();
      return;
    }

    const token = ++state.collaboratorSearchToken;
    try {
      const res = await api(`/api/admin/users/collaborators?q=${encodeURIComponent(q)}`);
      if (token !== state.collaboratorSearchToken) return;
      state.collaboratorResults = res.items || [];
      renderCollaboratorResults();
    } catch (err) {
      if (token !== state.collaboratorSearchToken) return;
      state.collaboratorResults = [];
      renderCollaboratorResults('Não foi possível consultar a base de colaboradores.');
    }
  }

  function renderCollaboratorResults(errorMsg = '') {
    const box = qs('#auCollaboratorResults');
    if (!box) return;

    const results = state.collaboratorResults || [];
    if (errorMsg) {
      box.style.display = 'block';
      box.innerHTML = `<div class="au-empty-search">${esc(errorMsg)}</div>`;
      return;
    }

    if (!results.length) {
      box.style.display = 'none';
      box.innerHTML = '';
      return;
    }

    box.style.display = 'block';
    box.innerHTML = results.map((item, idx) => {
      const nome = item.nome || item.name || '';
      const email = item.email || item.email_empresa || item.email_pessoal || '';
      const setor = item.setor || item.coordenacao || item.supervisao || item.empresa || '';
      return `
        <div class="au-search-item" data-idx="${idx}">
          <strong>${esc(nome)}</strong>
          <span>${esc([email, setor].filter(Boolean).join(' • '))}</span>
        </div>
      `;
    }).join('');

    qsa('.au-search-item', box).forEach((el) => {
      el.addEventListener('click', () => {
        const idx = Number(el.dataset.idx);
        const item = results[idx];
        applyCollaborator(item);
      });
    });
  }

  function applyCollaborator(item = {}) {
    qs('#auNome').value = item.nome || item.name || '';
    const email = item.email || item.email_empresa || item.email_pessoal || '';
    const setor = item.setor || item.coordenacao || item.supervisao || item.empresa || '';
    if (email) qs('#auEmail').value = email;
    if (setor) qs('#auSetor').value = setor;
    state.collaboratorResults = [];
    renderCollaboratorResults();
  }

  function bindCollaboratorSearch() {
    const input = qs('#auNome');
    const debounced = debounce((value) => searchCollaborators(value), 250);

    input.addEventListener('input', () => {
      if (state.editingUserId) return;
      debounced(input.value);
    });

    input.addEventListener('focus', () => {
      if (!state.editingUserId && (input.value || '').trim().length >= 3) {
        searchCollaborators(input.value);
      }
    });

    document.addEventListener('click', (ev) => {
      const wrap = qs('.au-field-search');
      if (!wrap || wrap.contains(ev.target)) return;
      state.collaboratorResults = [];
      renderCollaboratorResults();
    });
  }

  function openModal(user = null, selectedModuleIds = []) {
    state.editingUserId = user?.id || null;
    const nivel = detectNivelFromUser(user || {});
    qs('#auModalTitle').textContent = user ? 'Editar usuário' : 'Novo usuário';
    qs('#auUserId').value = user?.id || '';
    qs('#auNome').value = user?.nome || '';
    qs('#auEmail').value = user?.email || '';
    qs('#auNivel').value = nivel;
    qs('#auSetor').value = user?.setor || '';
    qs('#auSupervisaoBusca').value = '';
    presetSupervisoes(user?.supervisoes || user?.supervisao || '');
    qs('#auAtivo').value = (user?.status || 'ativo') === 'ativo' ? 'true' : 'false';
    qs('#auPassword').value = '';
    state.collaboratorResults = [];
    renderCollaboratorResults();
    renderModulesForNivel(nivel, selectedModuleIds);
    qs('#auModal').style.display = 'flex';
  }

  function closeModal() {
    const modal = qs('#auModal');
    if (modal) modal.style.display = 'none';
  }

  function getSelectedModules() {
    return qsa('#auModulosContainer input:checked').map((el) => el.value);
  }

  async function editUser(userId) {
    try {
      setFeedback('');
      const user = state.users.find((x) => x.id === userId);
      if (!user) throw new Error('Usuário não encontrado.');
      const selected = await loadUserModuleIds(userId);
      openModal(user, selected);
    } catch (err) {
      console.error(err);
      setFeedback(err.message || String(err), true);
    }
  }

  async function toggleStatus(userId) {
    try {
      setFeedback('Salvando status...');
      await api('/api/admin/users/toggle-status', {
        method: 'POST',
        body: JSON.stringify({ id: userId }),
      });
      setFeedback('Status atualizado com sucesso.');
      await loadUsers();
    } catch (err) {
      console.error(err);
      setFeedback(err.message || String(err), true);
    }
  }

  async function resetPassword(userId) {
    const senha = window.prompt('Digite a nova senha:');
    if (!senha) return;
    try {
      setFeedback('Redefinindo senha...');
      await api('/api/admin/users/reset-password', {
        method: 'POST',
        body: JSON.stringify({ id: userId, password: senha }),
      });
      setFeedback('Senha redefinida com sucesso.');
    } catch (err) {
      console.error(err);
      setFeedback(err.message || String(err), true);
    }
  }

  async function onSubmitForm(ev) {
    ev.preventDefault();

    const id = qs('#auUserId').value.trim();
    const nome = qs('#auNome').value.trim();
    const email = qs('#auEmail').value.trim();
    const nivel = qs('#auNivel').value;
    const setor = qs('#auSetor').value.trim();
    const status = qs('#auAtivo').value === 'true' ? 'ativo' : 'inativo';
    const password = qs('#auPassword').value;
    const modulos = getSelectedModules();
    const supervisoes = getSelectedSupervisoes();

    const payload = {
      id,
      nome,
      email,
      nivel,
      role: nivel,
      perfil_codigo: getPerfilCodigoByNivel(nivel),
      setor,
      status,
      modulos,
      supervisao: supervisoes.join(', '),
      supervisoes,
    };

    const isCreate = !id;

    if (password) payload.password = password;
    if (isCreate && !password) {
      setFeedback('No cadastro, a senha é obrigatória.', true);
      return;
    }

    try {
      setFeedback(isCreate ? 'Criando usuário...' : 'Salvando usuário...');
      await api(isCreate ? '/api/admin/users/create' : '/api/admin/users/update', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      closeModal();
      setFeedback(isCreate ? 'Usuário criado com sucesso.' : 'Usuário atualizado com sucesso.');
      await loadUsers();
    } catch (err) {
      console.error(err);
      setFeedback(err.message || String(err), true);
    }
  }

  async function boot(content, userContext) {
    state.currentUserContext = userContext || null;
    renderBase(content);
    try {
      setFeedback('Carregando...');
      await loadModulesCatalog();
      if (currentUserIsMaster()) {
        await loadSupervisoesCatalog();
        renderSupervisaoOptions();
      }
      await loadUsers();
      setFeedback('');
    } catch (err) {
      console.error('Erro ao iniciar admin-usuarios:', err);
      setFeedback(err.message || String(err), true);
    }
  }

  initProtectedPage('Usuários', boot);
})();
