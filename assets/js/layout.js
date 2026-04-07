import { buildAllowedMenu, renderMenu } from './menuBuilder.js';
import { signOut } from './auth.js';
import { clearUserContext } from './sessionStore.js';
import { toPanelUrl } from './paths.js';
import { supabase } from './supabaseClient.js';

const SIDEBAR_COLLAPSED_KEY = 'painel_sidebar_collapsed';

function loadSidebarCollapsed() {
  try {
    return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1';
  } catch {
    return false;
  }
}

function saveSidebarCollapsed(collapsed) {
  try {
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, collapsed ? '1' : '0');
  } catch {}
}

function applySidebarCollapsed(collapsed) {
  document.body.classList.toggle('sidebar-collapsed', collapsed);
}

function ensureSidebarToggle() {
  const topbar = document.querySelector('.topbar');
  if (!topbar) return null;

  let button = document.getElementById('sidebarToggleBtn');
  if (!button) {
    button = document.createElement('button');
    button.type = 'button';
    button.id = 'sidebarToggleBtn';
    button.className = 'sidebar-toggle-btn';
    button.setAttribute('aria-controls', 'sidebarMenu');
    button.innerHTML = '<span class="sidebar-toggle-icon">☰</span>';
    topbar.prepend(button);
  }

  return button;
}



function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function getVisibleModuleCount(userContext) {
  const modules = Array.isArray(userContext?.modules) ? userContext.modules : [];
  return modules.filter((mod) => mod?.can_view !== false).length;
}

function getUserProfileLabel(userContext) {
  return userContext?.perfil_nome || userContext?.perfil_codigo || userContext?.user?.role || 'usuário';
}

function getUserSectorLabel(userContext) {
  return userContext?.setor || userContext?.department?.name || 'Não informado';
}

function getUserStatusLabel(userContext) {
  return userContext?.user?.active ? 'Ativo' : 'Inativo';
}

function ensureSettingsStyles() {
  if (document.getElementById('userSettingsStyles')) return;
  const style = document.createElement('style');
  style.id = 'userSettingsStyles';
  style.textContent = `
    .topbar-actions{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
    .settings-gear-btn{width:42px;height:42px;border-radius:12px;border:1px solid rgba(22,101,52,.45);background:rgba(2,6,23,.78);color:#e5e7eb;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;transition:transform .18s ease,border-color .18s ease,background .18s ease,box-shadow .18s ease}
    .settings-gear-btn:hover{background:#166534;border-color:#22c55e;box-shadow:0 0 0 4px rgba(22,101,52,.18);transform:translateY(-1px)}
    .settings-gear-btn svg{width:18px;height:18px}
    .us-modal{position:fixed;inset:0;z-index:10000;display:none;align-items:center;justify-content:center;padding:20px;background:rgba(2,6,23,.72);backdrop-filter:blur(4px)}
    .us-modal.is-open{display:flex}
    .us-card{width:min(980px,100%);max-height:92vh;overflow:auto;border-radius:24px;background:linear-gradient(180deg,rgba(2,6,23,.98),rgba(3,22,18,.98));border:1px solid rgba(22,101,52,.35);box-shadow:0 30px 80px rgba(0,0,0,.38);padding:24px;color:#e5e7eb}
    .us-header{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;margin-bottom:18px}
    .us-title{margin:0;font-size:28px;font-weight:800}
    .us-subtitle{margin:6px 0 0;color:#94a3b8}
    .us-close{border:1px solid #334155;background:#0f172a;color:#e5e7eb;border-radius:12px;padding:10px 14px;cursor:pointer}
    .us-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px;margin-bottom:18px}
    .us-panel{border:1px solid rgba(22,101,52,.28);background:rgba(2,6,23,.42);border-radius:20px;padding:22px;min-height:168px;box-shadow:inset 0 0 0 1px rgba(15,23,42,.32)}
    .us-panel h3{margin:0 0 18px;font-size:20px}
    .us-info-row{display:flex;flex-direction:column;gap:4px;margin-bottom:14px}
    .us-label{font-size:13px;text-transform:uppercase;letter-spacing:.06em;color:#94a3b8}
    .us-value{font-size:17px;font-weight:700;line-height:1.35;word-break:break-word}
    .us-count{font-size:52px;line-height:1;font-weight:900;margin:6px 0 14px}
    .us-muted{color:#94a3b8;font-size:15px;line-height:1.45}
    .us-password-card{border:1px solid rgba(22,101,52,.28);background:rgba(15,23,42,.72);border-radius:20px;padding:22px}
    .us-password-card h3{margin:0 0 8px;font-size:22px}
    .us-password-card p{margin:0 0 18px;color:#94a3b8}
    .us-form-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}
    .us-field{display:flex;flex-direction:column;gap:8px}
    .us-field-full{grid-column:1/-1}
    .us-field label{font-size:14px;font-weight:700;color:#cbd5e1}
    .us-input{width:100%;box-sizing:border-box;border:1px solid #334155;background:#0f172a;color:#e5e7eb;border-radius:14px;padding:12px 14px;outline:none}
    .us-input:focus{border-color:#166534;box-shadow:0 0 0 4px rgba(22,101,52,.18)}
    .us-actions{display:flex;justify-content:flex-end;gap:12px;margin-top:18px;flex-wrap:wrap}
    .us-btn{border:0;border-radius:14px;padding:12px 18px;font-weight:700;cursor:pointer}
    .us-btn-primary{background:#166534;color:#fff}
    .us-btn-secondary{background:#1e293b;color:#e5e7eb;border:1px solid #334155}
    .us-feedback{display:none;margin-top:14px;padding:12px 14px;border-radius:14px;border:1px solid #334155;background:#0f172a;font-size:14px}
    .us-feedback.is-visible{display:block}
    .us-feedback.is-error{border-color:#7f1d1d;background:rgba(127,29,29,.18);color:#fecaca}
    .us-feedback.is-success{border-color:#166534;background:rgba(22,101,52,.18);color:#bbf7d0}
    @media (max-width: 900px){.us-grid,.us-form-grid{grid-template-columns:1fr}.us-card{padding:18px}.us-title{font-size:24px}}
  `;
  document.head.appendChild(style);
}

function ensureSettingsModal(userContext) {
  let modal = document.getElementById('userSettingsModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'userSettingsModal';
    modal.className = 'us-modal';
    modal.innerHTML = `
      <div class="us-card" role="dialog" aria-modal="true" aria-labelledby="userSettingsTitle">
        <div class="us-header">
          <div>
            <h2 class="us-title" id="userSettingsTitle">Configurações</h2>
            <p class="us-subtitle">Consulte os dados do seu acesso e altere sua senha quando precisar.</p>
          </div>
          <button type="button" class="us-close" id="userSettingsCloseBtn">Fechar</button>
        </div>

        <div class="us-grid">
          <section class="us-panel">
            <h3>Usuário</h3>
            <div class="us-info-row"><span class="us-label">Nome</span><span class="us-value" id="usInfoNome"></span></div>
            <div class="us-info-row"><span class="us-label">Email</span><span class="us-value" id="usInfoEmail"></span></div>
            <div class="us-info-row"><span class="us-label">ID</span><span class="us-value" id="usInfoId"></span></div>
          </section>

          <section class="us-panel">
            <h3>Estrutura</h3>
            <div class="us-info-row"><span class="us-label">Setor</span><span class="us-value" id="usInfoSetor"></span></div>
            <div class="us-info-row"><span class="us-label">Perfil</span><span class="us-value" id="usInfoPerfil"></span></div>
            <div class="us-info-row"><span class="us-label">Status</span><span class="us-value" id="usInfoStatus"></span></div>
          </section>

          <section class="us-panel">
            <h3>Módulos liberados</h3>
            <div class="us-count" id="usInfoModulesCount">0</div>
            <div class="us-muted">Quantidade visível no menu conforme o contexto do seu usuário.</div>
          </section>
        </div>

        <section class="us-password-card">
          <h3>Alterar senha</h3>
          <p>Preencha os campos abaixo para atualizar sua senha de acesso.</p>
          <form id="userSettingsPasswordForm">
            <div class="us-form-grid">
              <div class="us-field">
                <label for="usNewPassword">Nova senha</label>
                <input id="usNewPassword" class="us-input" type="password" autocomplete="new-password" placeholder="Digite a nova senha" />
              </div>
              <div class="us-field">
                <label for="usConfirmPassword">Confirmar senha</label>
                <input id="usConfirmPassword" class="us-input" type="password" autocomplete="new-password" placeholder="Repita a nova senha" />
              </div>
            </div>
            <div id="userSettingsFeedback" class="us-feedback"></div>
            <div class="us-actions">
              <button type="button" class="us-btn us-btn-secondary" id="userSettingsCancelBtn">Cancelar</button>
              <button type="submit" class="us-btn us-btn-primary" id="userSettingsSaveBtn">Atualizar senha</button>
            </div>
          </form>
        </section>
      </div>
    `;
    document.body.appendChild(modal);

    const close = () => closeSettingsModal();
    modal.addEventListener('click', (event) => {
      if (event.target === modal) close();
    });
    modal.querySelector('#userSettingsCloseBtn')?.addEventListener('click', close);
    modal.querySelector('#userSettingsCancelBtn')?.addEventListener('click', close);
    modal.querySelector('#userSettingsPasswordForm')?.addEventListener('submit', onSubmitSettingsPassword);
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && modal.classList.contains('is-open')) close();
    });
  }

  fillSettingsModal(userContext);
  return modal;
}

function fillSettingsModal(userContext) {
  const modal = document.getElementById('userSettingsModal');
  if (!modal) return;
  modal.querySelector('#usInfoNome').textContent = userContext?.user?.name || 'Não informado';
  modal.querySelector('#usInfoEmail').textContent = userContext?.user?.email || 'Não informado';
  modal.querySelector('#usInfoId').textContent = userContext?.user?.id || 'Não informado';
  modal.querySelector('#usInfoSetor').textContent = getUserSectorLabel(userContext);
  modal.querySelector('#usInfoPerfil').textContent = String(getUserProfileLabel(userContext)).toLowerCase();
  modal.querySelector('#usInfoStatus').textContent = getUserStatusLabel(userContext);
  modal.querySelector('#usInfoModulesCount').textContent = String(getVisibleModuleCount(userContext));
  clearSettingsFeedback();
  const form = modal.querySelector('#userSettingsPasswordForm');
  form?.reset();
}

function setSettingsFeedback(message, kind = 'success') {
  const box = document.getElementById('userSettingsFeedback');
  if (!box) return;
  box.className = 'us-feedback is-visible';
  if (kind === 'error') box.classList.add('is-error');
  if (kind === 'success') box.classList.add('is-success');
  box.textContent = message;
}

function clearSettingsFeedback() {
  const box = document.getElementById('userSettingsFeedback');
  if (!box) return;
  box.className = 'us-feedback';
  box.textContent = '';
}

function openSettingsModal(userContext) {
  const modal = ensureSettingsModal(userContext);
  fillSettingsModal(userContext);
  modal.classList.add('is-open');
}

function closeSettingsModal() {
  const modal = document.getElementById('userSettingsModal');
  if (!modal) return;
  modal.classList.remove('is-open');
  clearSettingsFeedback();
  modal.querySelector('#userSettingsPasswordForm')?.reset();
}

async function onSubmitSettingsPassword(event) {
  event.preventDefault();
  const saveBtn = document.getElementById('userSettingsSaveBtn');
  const newPassword = document.getElementById('usNewPassword')?.value || '';
  const confirmPassword = document.getElementById('usConfirmPassword')?.value || '';

  if (newPassword.length < 6) {
    setSettingsFeedback('A nova senha precisa ter pelo menos 6 caracteres.', 'error');
    return;
  }

  if (newPassword !== confirmPassword) {
    setSettingsFeedback('A confirmação da senha não confere.', 'error');
    return;
  }

  try {
    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.textContent = 'Salvando...';
    }
    clearSettingsFeedback();
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) throw error;
    setSettingsFeedback('Senha atualizada com sucesso.', 'success');
    event.target.reset();
  } catch (error) {
    console.error(error);
    setSettingsFeedback(error?.message || 'Não foi possível atualizar a senha.', 'error');
  } finally {
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.textContent = 'Atualizar senha';
    }
  }
}

function ensureSettingsButton(userContext) {
  ensureSettingsStyles();
  ensureSettingsModal(userContext);

  const actions = document.querySelector('.topbar-actions');
  if (!actions) return null;

  let button = document.getElementById('userSettingsBtn');
  if (!button) {
    button = document.createElement('button');
    button.type = 'button';
    button.id = 'userSettingsBtn';
    button.className = 'settings-gear-btn';
    button.setAttribute('title', 'Configurações');
    button.setAttribute('aria-label', 'Configurações');
    button.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="3.2"></circle>
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06A1.65 1.65 0 0 0 15 19.4a1.65 1.65 0 0 0-1 .6 1.65 1.65 0 0 1-2 0 1.65 1.65 0 0 0-1-.6 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-.6-1 1.65 1.65 0 0 1 0-2 1.65 1.65 0 0 0 .6-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-.6 1.65 1.65 0 0 1 2 0 1.65 1.65 0 0 0 1 .6 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9c.24.37.39.78.44 1.2.05.42.05.84 0 1.26-.05.42-.2.83-.44 1.2Z"></path>
      </svg>
    `;

    const signOutBtn = document.getElementById('signOutBtn');
    if (signOutBtn && signOutBtn.parentElement === actions) {
      actions.insertBefore(button, signOutBtn);
    } else {
      actions.appendChild(button);
    }
  }

  if (!button.dataset.bound) {
    button.addEventListener('click', () => openSettingsModal(userContext));
    button.dataset.bound = '1';
  }

  return button;
}
function syncSidebarToggle(collapsed) {
  const button = ensureSidebarToggle();
  if (!button) return;
  const label = collapsed ? 'Expandir menu lateral' : 'Minimizar menu lateral';
  button.setAttribute('aria-label', label);
  button.setAttribute('title', label);
  button.setAttribute('aria-expanded', String(!collapsed));
  button.classList.toggle('is-collapsed', collapsed);
}

export function renderAppLayout({ userContext, currentPageTitle = 'Painel' }) {
  const collapsed = loadSidebarCollapsed();
  applySidebarCollapsed(collapsed);
  syncSidebarToggle(collapsed);

  const menu = buildAllowedMenu(userContext);
  renderMenu(document.getElementById('sidebarMenu'), menu, window.location.pathname);

  const toggleBtn = ensureSidebarToggle();
  if (toggleBtn && !toggleBtn.dataset.bound) {
    toggleBtn.addEventListener('click', () => {
      const next = !document.body.classList.contains('sidebar-collapsed');
      applySidebarCollapsed(next);
      saveSidebarCollapsed(next);
      syncSidebarToggle(next);
    });
    toggleBtn.dataset.bound = '1';
  }

  const welcome = document.getElementById('welcomeUser');
  if (welcome) welcome.textContent = `Olá, ${userContext.user.name}`;

  const pageTitle = document.getElementById('pageTitle');
  if (pageTitle) pageTitle.textContent = currentPageTitle;

  const roleBadge = document.getElementById('roleBadge');
  if (roleBadge) {
    roleBadge.textContent = userContext.user.is_master
      ? 'MASTER'
      : (userContext.department?.name || userContext.user.role || 'USUÁRIO').toUpperCase();
  }

  ensureSettingsButton(userContext);

  const signOutBtn = document.getElementById('signOutBtn');
  if (signOutBtn && !signOutBtn.dataset.bound) {
    signOutBtn.addEventListener('click', async () => {
      signOutBtn.disabled = true;
      signOutBtn.textContent = 'Saindo...';
      try {
        await signOut();
      } finally {
        clearUserContext();
        window.location.replace(toPanelUrl('login.html'));
      }
    });
    signOutBtn.dataset.bound = '1';
  }
}
