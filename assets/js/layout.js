import { buildAllowedMenu, renderMenu } from './menuBuilder.js';
import { signOut, getSession } from './auth.js';
import { supabase } from './supabaseClient.js';
import { clearUserContext } from './sessionStore.js';
import { toPanelUrl } from './paths.js';

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



function esc(v) {
  return String(v ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function ensureSettingsStyles() {
  if (document.getElementById('userSettingsStyles')) return;
  const style = document.createElement('style');
  style.id = 'userSettingsStyles';
  style.textContent = `
    .topbar-actions{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
    .settings-gear-btn{width:42px;height:42px;display:inline-flex;align-items:center;justify-content:center;border-radius:12px;border:1px solid #334155;background:#0f172a;color:#e5e7eb;cursor:pointer;transition:.2s ease}
    .settings-gear-btn:hover{background:#166534;border-color:#166534;color:#fff;transform:translateY(-1px)}
    .settings-gear-btn svg{width:18px;height:18px}
    .usm-overlay{position:fixed;inset:0;display:none;align-items:center;justify-content:center;padding:20px;background:rgba(2,6,23,.72);z-index:9999}
    .usm-overlay.is-open{display:flex}
    .usm-card{width:min(760px,100%);max-height:92vh;overflow:auto;background:#0b1220;border:1px solid #1f2937;border-radius:20px;padding:20px;color:#e5e7eb;box-shadow:0 20px 60px rgba(0,0,0,.35)}
    .usm-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:18px}
    .usm-head h3{margin:0;font-size:22px}
    .usm-head p{margin:4px 0 0;opacity:.75}
    .usm-close{border:1px solid #334155;background:#111827;color:#e5e7eb;border-radius:12px;padding:10px 12px;cursor:pointer}
    .usm-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;margin-bottom:18px}
    .usm-box{border:1px solid #1f2937;border-radius:16px;padding:14px;background:#0f172a}
    .usm-box h4{margin:0 0 12px;font-size:13px;text-transform:uppercase;letter-spacing:.05em;opacity:.82}
    .usm-row{display:flex;justify-content:space-between;gap:12px;padding:8px 0;border-bottom:1px solid rgba(51,65,85,.45)}
    .usm-row:last-child{border-bottom:0;padding-bottom:0}
    .usm-row span:first-child{opacity:.72}
    .usm-row span:last-child{text-align:right;font-weight:600}
    .usm-mods{display:flex;flex-wrap:wrap;gap:8px}
    .usm-chip{display:inline-flex;align-items:center;padding:6px 10px;border-radius:999px;background:#111827;border:1px solid #334155;font-size:12px}
    .usm-form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}
    .usm-field{display:flex;flex-direction:column;gap:6px}
    .usm-field-full{grid-column:1 / -1}
    .usm-field input{width:100%;box-sizing:border-box;border:1px solid #334155;background:#0f172a;color:#e5e7eb;border-radius:12px;padding:11px 12px;outline:none}
    .usm-field input:focus{border-color:#166534;box-shadow:0 0 0 2px rgba(22,101,52,.25)}
    .usm-actions{display:flex;justify-content:flex-end;gap:10px;margin-top:18px}
    .usm-btn{border:0;border-radius:12px;padding:11px 14px;cursor:pointer}
    .usm-btn-primary{background:#166534;color:#fff}
    .usm-btn-secondary{background:#1e293b;color:#e5e7eb}
    .usm-feedback{display:none;margin-top:14px;padding:12px 14px;border-radius:12px;border:1px solid #334155;background:#1e293b}
    .usm-feedback.is-error{border-color:#7f1d1d;background:rgba(127,29,29,.15)}
    @media (max-width: 760px){.usm-grid,.usm-form{grid-template-columns:1fr}}
  `;
  document.head.appendChild(style);
}

function ensureSettingsModal() {
  ensureSettingsStyles();
  let overlay = document.getElementById('userSettingsModal');
  if (overlay) return overlay;
  overlay = document.createElement('div');
  overlay.id = 'userSettingsModal';
  overlay.className = 'usm-overlay';
  overlay.innerHTML = `
    <div class="usm-card" role="dialog" aria-modal="true" aria-labelledby="userSettingsTitle">
      <div class="usm-head">
        <div>
          <h3 id="userSettingsTitle">Configurações</h3>
          <p>Consulte seus dados e altere sua senha.</p>
        </div>
        <button type="button" class="usm-close" id="userSettingsClose">Fechar</button>
      </div>

      <div class="usm-grid">
        <section class="usm-box">
          <h4>Usuário</h4>
          <div class="usm-row"><span>Nome</span><span id="usmNome">-</span></div>
          <div class="usm-row"><span>Email</span><span id="usmEmail">-</span></div>
          <div class="usm-row"><span>ID</span><span id="usmId">-</span></div>
        </section>

        <section class="usm-box">
          <h4>Estrutura</h4>
          <div class="usm-row"><span>Setor</span><span id="usmSetor">-</span></div>
          <div class="usm-row"><span>Perfil</span><span id="usmPerfil">-</span></div>
          <div class="usm-row"><span>Status</span><span id="usmStatus">-</span></div>
          <div class="usm-row"><span>Módulos</span><span id="usmModCount">0</span></div>
        </section>
      </div>

      <section class="usm-box">
        <h4>Módulos liberados</h4>
        <div class="usm-mods" id="usmModulos"></div>
      </section>

      <section class="usm-box" style="margin-top:18px;">
        <h4>Alterar senha</h4>
        <form id="userSettingsForm" class="usm-form">
          <div class="usm-field">
            <label for="usmSenha">Nova senha</label>
            <input id="usmSenha" type="password" minlength="6" autocomplete="new-password" required />
          </div>
          <div class="usm-field">
            <label for="usmSenha2">Confirmar senha</label>
            <input id="usmSenha2" type="password" minlength="6" autocomplete="new-password" required />
          </div>
          <div class="usm-actions usm-field-full">
            <button type="button" class="usm-btn usm-btn-secondary" id="userSettingsCancel">Cancelar</button>
            <button type="submit" class="usm-btn usm-btn-primary" id="userSettingsSave">Atualizar senha</button>
          </div>
        </form>
        <div class="usm-feedback" id="userSettingsFeedback"></div>
      </section>
    </div>
  `;
  document.body.appendChild(overlay);

  const close = () => {
    overlay.classList.remove('is-open');
    const form = document.getElementById('userSettingsForm');
    if (form) form.reset();
    const fb = document.getElementById('userSettingsFeedback');
    if (fb) { fb.style.display = 'none'; fb.classList.remove('is-error'); fb.textContent = ''; }
  };

  overlay.addEventListener('click', (ev) => { if (ev.target === overlay) close(); });
  overlay.querySelector('#userSettingsClose').addEventListener('click', close);
  overlay.querySelector('#userSettingsCancel').addEventListener('click', close);

  overlay.querySelector('#userSettingsForm').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const senha = document.getElementById('usmSenha').value;
    const confirmar = document.getElementById('usmSenha2').value;
    const fb = document.getElementById('userSettingsFeedback');
    const btn = document.getElementById('userSettingsSave');

    const showFeedback = (msg, isError = false) => {
      fb.style.display = 'block';
      fb.textContent = msg;
      fb.classList.toggle('is-error', !!isError);
    };

    if (senha.length < 6) { showFeedback('A senha precisa ter pelo menos 6 caracteres.', true); return; }
    if (senha !== confirmar) { showFeedback('As senhas não conferem.', true); return; }

    btn.disabled = true;
    btn.textContent = 'Atualizando...';
    try {
      const { error } = await supabase.auth.updateUser({ password: senha });
      if (error) throw error;
      showFeedback('Senha atualizada com sucesso.');
      setTimeout(close, 700);
    } catch (err) {
      showFeedback(err?.message || 'Não foi possível atualizar a senha.', true);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Atualizar senha';
    }
  });

  overlay._open = () => overlay.classList.add('is-open');
  return overlay;
}

function ensureSettingsButton() {
  const topbarActions = document.querySelector('.topbar-actions');
  if (!topbarActions) return null;

  let button = document.getElementById('userSettingsBtn');
  if (!button) {
    button = document.createElement('button');
    button.type = 'button';
    button.id = 'userSettingsBtn';
    button.className = 'settings-gear-btn';
    button.setAttribute('aria-label', 'Configurações');
    button.setAttribute('title', 'Configurações');
    button.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0A1.65 1.65 0 0 0 10.43 3H10.5a2 2 0 1 1 4 0h.07a1.65 1.65 0 0 0 1.51 1h0a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0A1.65 1.65 0 0 0 21 10.43V10.5a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>';

    const signOutBtn = document.getElementById('signOutBtn');
    if (signOutBtn) topbarActions.insertBefore(button, signOutBtn);
    else topbarActions.appendChild(button);
  }
  return button;
}

function fillSettingsModal(userContext) {
  const modules = Array.isArray(userContext?.modules) ? userContext.modules : [];
  document.getElementById('usmNome').innerHTML = esc(userContext?.user?.name || '-');
  document.getElementById('usmEmail').innerHTML = esc(userContext?.user?.email || '-');
  document.getElementById('usmId').innerHTML = esc(userContext?.user?.id || '-');
  document.getElementById('usmSetor').innerHTML = esc(userContext?.department?.name || userContext?.department?.code || '-');
  document.getElementById('usmPerfil').innerHTML = esc(userContext?.user?.is_master ? 'MASTER' : (userContext?.user?.role || '-'));
  document.getElementById('usmStatus').innerHTML = esc(userContext?.user?.status || '-');
  document.getElementById('usmModCount').innerHTML = esc(String(modules.length));
  document.getElementById('usmModulos').innerHTML = modules.length
    ? modules.map((mod) => `<span class="usm-chip">${esc(mod.name || mod.code || 'Módulo')}</span>`).join('')
    : '<span style="opacity:.75;">Sem módulos liberados.</span>';
}

async function bindSettingsButton(userContext) {
  const button = ensureSettingsButton();
  const modal = ensureSettingsModal();
  if (!button || button.dataset.bound) return;

  button.addEventListener('click', async () => {
    try {
      const session = await getSession();
      if (!session?.access_token) throw new Error('Sessão expirada. Faça login novamente.');
      fillSettingsModal(userContext);
      modal._open();
    } catch (err) {
      alert(err?.message || 'Não foi possível abrir as configurações.');
    }
  });

  button.dataset.bound = '1';
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

  bindSettingsButton(userContext);

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
