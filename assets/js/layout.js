import { buildAllowedMenu, renderMenu } from './menuBuilder.js';
import { signOut, getSession } from './auth.js';
import { supabase } from './supabaseClient.js';
import { clearUserContext } from './sessionStore.js';
import { toPanelUrl } from './paths.js';
import { initNotificacoesEngine } from './notificacoes-engine.js';

const SIDEBAR_COLLAPSED_KEY = 'painel_sidebar_collapsed';
const MOBILE_BREAKPOINT = 768;

function isMobileViewport() {
  return window.matchMedia?.(`(max-width: ${MOBILE_BREAKPOINT}px)`)?.matches || window.innerWidth <= MOBILE_BREAKPOINT;
}

function normalizeRoleValue(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .trim();
}

function isGestorContext(userContext) {
  const role = normalizeRoleValue(userContext?.user?.role || userContext?.perfil_codigo || userContext?.perfil_nome || userContext?.role);
  const department = normalizeRoleValue(userContext?.department?.name || userContext?.department?.code || userContext?.setor);
  return role === 'GESTOR' || department === 'GESTOR';
}

function updateMobilePanelClass(userContext) {
  const mobile = isMobileViewport();
  document.body.classList.toggle('mobile-panel-mode', mobile);
  document.body.classList.toggle('mobile-gestor-mode', mobile && isGestorContext(userContext));
  return mobile;
}

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



function ensureMobileBackButton() {
  const topbar = document.querySelector('.topbar');
  if (!topbar) return null;

  let button = document.getElementById('mobilePanelBackBtn');
  if (!button) {
    button = document.createElement('button');
    button.type = 'button';
    button.id = 'mobilePanelBackBtn';
    button.className = 'mobile-panel-back-btn';
    button.innerHTML = '<span aria-hidden="true">←</span><span>Voltar</span>';
    topbar.prepend(button);
  }

  return button;
}

function setupMobileBackButton(userContext) {
  const button = ensureMobileBackButton();
  if (!button) return;
  const shouldShow = isMobileViewport() && isGestorContext(userContext) && !/gestor-app(?:\.html)?$/i.test(window.location.pathname);
  button.hidden = !shouldShow;
  if (!button.dataset.bound) {
    button.addEventListener('click', () => {
      window.location.href = toPanelUrl('gestor-app');
    });
    button.dataset.bound = '1';
  }
}

const QUICK_NAV_ITEMS = [
  { path: 'gestor-app', icon: '⌂', label: 'Início' },
  { path: 'programacao', icon: '📅', label: 'Programação' },
  { path: 'logistica', icon: '🚚', label: 'Logística' },
  { path: 'compras', icon: '🛒', label: 'Compras' },
  { path: 'hospedagem', icon: '🏨', label: 'Hospedagem' },
  { path: 'contato-cliente', icon: '🤝', label: 'Contato' },
  { path: 'patrimonios', icon: '📦', label: 'Patrimônio' },
];

function ensureQuickNavStyles() {
  if (document.getElementById('mobileQuickNavStyles')) return;
  const style = document.createElement('style');
  style.id = 'mobileQuickNavStyles';
  style.textContent = `
    .mobile-quick-nav{display:none;gap:4px;overflow-x:auto;padding:8px max(8px,env(safe-area-inset-left)) calc(8px + env(safe-area-inset-bottom));background:rgba(8,8,16,.94);backdrop-filter:blur(20px);border-top:1px solid rgba(255,255,255,.052);position:fixed;left:0;right:0;bottom:0;z-index:70;scrollbar-width:none}
    .mobile-quick-nav::-webkit-scrollbar{display:none}
    body.mobile-gestor-mode .mobile-quick-nav{display:flex}
    body.mobile-gestor-mode .page-main{padding-bottom:calc(66px + env(safe-area-inset-bottom))!important}
    .mobile-quick-nav-item{flex:1 0 auto;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;min-width:58px;min-height:50px;padding:6px 8px;border-radius:14px;border:1px solid transparent;background:transparent;color:#9aa6bd;text-decoration:none;font-size:10px;font-weight:800;white-space:nowrap}
    .mobile-quick-nav-item .qn-ico{font-size:17px;line-height:1}
    .mobile-quick-nav-item.active{background:rgba(0,200,122,.14);border-color:rgba(45,212,160,.30);color:#dcfce7}
  `;
  document.head.appendChild(style);
}

function ensureMobileQuickNav() {
  let nav = document.getElementById('mobileQuickNav');
  if (!nav) {
    ensureQuickNavStyles();
    nav = document.createElement('nav');
    nav.id = 'mobileQuickNav';
    nav.className = 'mobile-quick-nav';
    nav.innerHTML = QUICK_NAV_ITEMS.map((item) => {
      const href = toPanelUrl(item.path);
      return `<a class="mobile-quick-nav-item" href="${href}" data-quick-nav-path="${item.path}"><span class="qn-ico" aria-hidden="true">${item.icon}</span><span>${item.label}</span></a>`;
    }).join('');
    document.body.appendChild(nav);
  }

  const current = window.location.pathname.replace(/\.html$/i, '').split('/').pop() || 'gestor-app';
  nav.querySelectorAll('[data-quick-nav-path]').forEach((link) => {
    link.classList.toggle('active', link.dataset.quickNavPath === current);
  });

  return nav;
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
    .settings-gear-btn{width:42px;height:42px;display:inline-flex;align-items:center;justify-content:center;border-radius:12px;border:1px solid rgba(255,255,255,0.08);background:#0d0d18;color:#e2e2f0;cursor:pointer;transition:.2s ease}
    .settings-gear-btn:hover{background:rgba(0,200,122,0.18);border-color:rgba(45,212,160,0.30);color:#e2e2f0;transform:translateY(-1px)}
    .settings-gear-btn svg{width:18px;height:18px}
    .usm-overlay{position:fixed;inset:0;display:none;align-items:center;justify-content:center;padding:20px;background:rgba(0,0,12,0.76);z-index:9999}
    .usm-overlay.is-open{display:flex}
    .usm-card{width:min(760px,100%);max-height:92vh;overflow:auto;background:#15152a;border:1px solid rgba(255,255,255,0.06);border-radius:20px;padding:20px;color:#e2e2f0;box-shadow:0 20px 60px rgba(0,0,0,.35)}
    .usm-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:18px}
    .usm-head h3{margin:0;font-size:22px}
    .usm-head p{margin:4px 0 0;opacity:.75}
    .usm-close{border:1px solid rgba(255,255,255,0.08);background:#10101e;color:#e2e2f0;border-radius:12px;padding:10px 12px;cursor:pointer}
    .usm-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;margin-bottom:18px}
    .usm-box{border:1px solid rgba(255,255,255,0.06);border-radius:16px;padding:14px;background:#0d0d18}
    .usm-box h4{margin:0 0 12px;font-size:13px;text-transform:uppercase;letter-spacing:.05em;opacity:.82}
    .usm-row{display:flex;justify-content:space-between;gap:12px;padding:8px 0;border-bottom:1px solid rgba(51,65,85,.45)}
    .usm-row:last-child{border-bottom:0;padding-bottom:0}
    .usm-row span:first-child{opacity:.72}
    .usm-row span:last-child{text-align:right;font-weight:600}
    .usm-mods{display:flex;flex-wrap:wrap;gap:8px}
    .usm-chip{display:inline-flex;align-items:center;padding:6px 10px;border-radius:999px;background:#10101e;border:1px solid rgba(255,255,255,0.08);font-size:12px}
    .usm-form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}
    .usm-field{display:flex;flex-direction:column;gap:6px}
    .usm-field-full{grid-column:1 / -1}
    .usm-field input{width:100%;box-sizing:border-box;border:1px solid rgba(255,255,255,0.08);background:#0d0d18;color:#e2e2f0;border-radius:12px;padding:11px 12px;outline:none}
    .usm-field input:focus{border-color:rgba(45,212,160,0.40);box-shadow:0 0 0 3px rgba(45,212,160,0.10)}
    .usm-actions{display:flex;justify-content:flex-end;gap:10px;margin-top:18px}
    .usm-btn{border:0;border-radius:12px;padding:11px 14px;cursor:pointer}
    .usm-btn-primary{background:#00c87a;color:#011a0d}
    .usm-btn-secondary{background:#15152a;color:#e2e2f0}
    .usm-feedback{display:none;margin-top:14px;padding:12px 14px;border-radius:12px;border:1px solid rgba(255,255,255,0.08);background:#15152a}
    .usm-feedback.is-error{border-color:#7f1d1d;background:rgba(127,29,29,.15)}
    .usm-apelido-form{margin-top:12px;padding-top:12px;border-top:1px solid rgba(51,65,85,.45);display:flex;flex-direction:column;gap:8px}
    .usm-apelido-form label{font-size:12px;opacity:.72}
    .usm-apelido-row{display:flex;gap:8px}
    .usm-apelido-row input{flex:1;min-width:0;border:1px solid rgba(255,255,255,0.08);background:#0d0d18;color:#e2e2f0;border-radius:12px;padding:9px 11px;outline:none}
    .usm-apelido-row input:focus{border-color:rgba(45,212,160,0.40);box-shadow:0 0 0 3px rgba(45,212,160,0.10)}
    .usm-apelido-save{padding:9px 14px;flex-shrink:0}
    .usm-apelido-form .usm-feedback{margin-top:4px}
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
          <form id="usmApelidoForm" class="usm-apelido-form">
            <label for="usmApelido">Como prefere ser chamado?</label>
            <div class="usm-apelido-row">
              <input id="usmApelido" type="text" maxlength="40" placeholder="Nome exibido no topo" autocomplete="off" />
              <button type="submit" class="usm-btn usm-btn-primary usm-apelido-save" id="usmApelidoSave">Salvar</button>
            </div>
            <div class="usm-feedback" id="usmApelidoFeedback"></div>
          </form>
        </section>

        <section class="usm-box">
          <h4>Estrutura</h4>
          <div class="usm-row"><span>Setor</span><span id="usmSetor">-</span></div>
          <div class="usm-row"><span>Perfil</span><span id="usmPerfil">-</span></div>
          <div class="usm-row"><span>Status</span><span id="usmStatus">-</span></div>
        </section>
      </div>

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

  overlay.querySelector('#usmApelidoForm').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const input = document.getElementById('usmApelido');
    const fb = document.getElementById('usmApelidoFeedback');
    const btn = document.getElementById('usmApelidoSave');
    const apelido = input.value.trim();

    const showFeedback = (msg, isError = false) => {
      fb.style.display = 'block';
      fb.textContent = msg;
      fb.classList.toggle('is-error', !!isError);
    };

    btn.disabled = true;
    btn.textContent = 'Salvando...';
    try {
      const { error } = await supabase.auth.updateUser({ data: { apelido } });
      if (error) throw error;
      showFeedback('Nome de exibição atualizado.');
      const nameEl = document.getElementById('topbarWelcomeName');
      const fullName = document.getElementById('usmNome')?.textContent || '';
      if (nameEl) nameEl.textContent = apelido || fullName || nameEl.textContent;
    } catch (err) {
      showFeedback(err?.message || 'Não foi possível atualizar o nome de exibição.', true);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Salvar';
    }
  });

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

async function fillSettingsModal(userContext) {
  document.getElementById('usmNome').innerHTML = esc(userContext?.user?.name || '-');
  document.getElementById('usmEmail').innerHTML = esc(userContext?.user?.email || '-');
  document.getElementById('usmId').innerHTML = esc(userContext?.user?.id || '-');
  document.getElementById('usmSetor').innerHTML = esc(userContext?.department?.name || userContext?.department?.code || '-');
  document.getElementById('usmPerfil').innerHTML = esc(userContext?.user?.is_master ? 'MASTER' : (userContext?.user?.role || '-'));
  document.getElementById('usmStatus').innerHTML = esc(userContext?.user?.status || '-');

  const apelidoInput = document.getElementById('usmApelido');
  if (apelidoInput) {
    try {
      const session = await getSession();
      apelidoInput.value = session?.user?.user_metadata?.apelido || '';
    } catch {
      apelidoInput.value = '';
    }
  }
}

async function bindSettingsButton(userContext) {
  const button = ensureSettingsButton();
  const modal = ensureSettingsModal();
  if (!button || button.dataset.bound) return;

  button.addEventListener('click', async () => {
    try {
      const session = await getSession();
      if (!session?.access_token) throw new Error('Sessão expirada. Faça login novamente.');
      await fillSettingsModal(userContext);
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

function ensureTopbarTitleClass() {
  const topbar = document.querySelector('.topbar');
  if (!topbar) return;
  const titleDiv = topbar.querySelector('div:not(.topbar-actions):not(.topbar-search)');
  if (titleDiv && !titleDiv.classList.contains('topbar-title')) {
    titleDiv.classList.add('topbar-title');
  }
}

// ---------- ícones SVG das notificações ----------
const NOTIF_ICONS = {
  'clipboard-alert': `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/><line x1="12" y1="11" x2="12" y2="15"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>`,
  'calendar-clock':  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><circle cx="16" cy="16" r="3"/><polyline points="16 14.5 16 16 17 17"/></svg>`,
  'package-alert':   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m7.5 4.27 9 5.15M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><line x1="12" y1="11" x2="12" y2="15"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>`,
  'hotel-alert':     `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18M3 7V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2M3 21V7m18 14V7M3 7h18M9 21v-4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v4"/><line x1="15" y1="3" x2="15" y2="7"/><line x1="9" y1="3" x2="9" y2="7"/></svg>`,
  'check-circle':    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="9 12 11 14 15 10"/></svg>`,
  'clipboard-check': `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/><polyline points="9 12 11 14 15 10"/></svg>`,
  'shopping-bag':    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>`,
  'receipt':         `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z"/><path d="M14 8H8m6 4H8m2 4H8"/></svg>`,
  'bell':            `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>`,
};

const PRIORIDADE_COLOR = {
  urgente:     { bg: 'rgba(239,68,68,.15)',    border: 'rgba(239,68,68,.35)',   dot: '#ef4444' },
  atencao:     { bg: 'rgba(245,158,11,.13)',   border: 'rgba(245,158,11,.30)',  dot: '#f59e0b' },
  normal:      { bg: 'rgba(59,130,246,.12)',   border: 'rgba(59,130,246,.28)',  dot: '#3b82f6' },
  informativo: { bg: 'rgba(100,116,139,.11)',  border: 'rgba(100,116,139,.25)', dot: '#64748b' },
};

function fmtRelTime(isoStr) {
  if (!isoStr) return '';
  const diff = Date.now() - new Date(isoStr).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h}h`;
  const d = Math.floor(h / 24);
  return `há ${d} dia${d > 1 ? 's' : ''}`;
}

function injectNotifStyles() {
  if (document.getElementById('painelNotifStyles')) return;
  const s = document.createElement('style');
  s.id = 'painelNotifStyles';
  s.textContent = `
    .topbar-notif-wrap{position:relative;display:inline-flex}
    .topbar-icon-btn{width:40px;height:40px;display:inline-flex;align-items:center;justify-content:center;border-radius:12px;border:1px solid rgba(255,255,255,0.08);background:#0d0d18;color:#e2e2f0;cursor:pointer;transition:.2s ease;flex-shrink:0}
    .topbar-icon-btn svg{width:18px;height:18px;stroke:currentColor;fill:none}
    .topbar-icon-btn:hover{background:rgba(0,200,122,0.15);border-color:rgba(45,212,160,0.28)}
    .topbar-notif-badge{position:absolute;top:-4px;right:-4px;min-width:18px;height:18px;border-radius:999px;background:#ef4444;color:#fff;font-size:11px;font-weight:900;display:flex;align-items:center;justify-content:center;padding:0 4px;pointer-events:none;border:2px solid #0d0d18;line-height:1}
    .topbar-notif-badge.hidden{display:none}
    .notif-dropdown{position:absolute;top:calc(100% + 10px);right:0;width:360px;max-width:calc(100vw - 20px);background:#15152a;border:1px solid rgba(255,255,255,0.08);border-radius:18px;box-shadow:0 20px 60px rgba(0,0,12,.45);z-index:9000;overflow:hidden;display:none}
    .notif-dropdown.open{display:block}
    .notif-dd-head{display:flex;align-items:center;justify-content:space-between;padding:14px 16px 10px;border-bottom:1px solid rgba(255,255,255,.06)}
    .notif-dd-head h4{margin:0;font-size:14px;font-weight:900;color:#e2e2f0}
    .notif-dd-ver-todas{font-size:12px;color:#6dffbc;text-decoration:none;font-weight:700;opacity:.85}
    .notif-dd-ver-todas:hover{opacity:1}
    .notif-dd-list{max-height:380px;overflow-y:auto}
    .notif-dd-empty{padding:24px 16px;text-align:center;color:#64748b;font-size:13px}
    .notif-dd-item{display:flex;gap:11px;align-items:flex-start;padding:12px 14px;border-bottom:1px solid rgba(255,255,255,.04);cursor:pointer;transition:.15s;text-decoration:none;color:inherit}
    .notif-dd-item:last-child{border-bottom:none}
    .notif-dd-item:hover{background:rgba(255,255,255,.04)}
    .notif-dd-item.nao-lida{background:rgba(45,212,160,.04)}
    .notif-dd-icon{width:34px;height:34px;border-radius:10px;display:flex;align-items:center;justify-content:center;flex-shrink:0;border:1px solid}
    .notif-dd-icon svg{width:16px;height:16px}
    .notif-dd-body{flex:1;min-width:0}
    .notif-dd-titulo{font-size:13px;font-weight:800;color:#e2e2f0;line-height:1.3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .notif-dd-desc{font-size:12px;color:#94a3b8;margin-top:2px;line-height:1.4;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
    .notif-dd-meta{display:flex;align-items:center;gap:6px;margin-top:4px}
    .notif-dd-time{font-size:11px;color:#475569}
    .notif-dd-dot{width:6px;height:6px;border-radius:50%;flex-shrink:0}
    .notif-dd-footer{padding:10px 16px;border-top:1px solid rgba(255,255,255,.06);text-align:center}
    .notif-dd-footer a{font-size:12px;color:#6dffbc;text-decoration:none;font-weight:700;opacity:.8}
    .notif-dd-footer a:hover{opacity:1}
    @media(max-width:480px){.notif-dropdown{right:-8px;width:calc(100vw - 16px)}}
  `;
  document.head.appendChild(s);
}

function notifIconHtml(icone, prioridade) {
  const c = PRIORIDADE_COLOR[prioridade] || PRIORIDADE_COLOR.normal;
  const svg = NOTIF_ICONS[icone] || NOTIF_ICONS.bell;
  return `<div class="notif-dd-icon" style="background:${c.bg};border-color:${c.border};color:${c.dot}">${svg}</div>`;
}

function renderNotifDropdown(list, container, engine) {
  const top5 = list.slice(0, 5);
  if (!top5.length) {
    container.innerHTML = '<div class="notif-dd-empty">Nenhuma notificação pendente</div>';
    return;
  }

  container.innerHTML = top5.map((n) => {
    const c = PRIORIDADE_COLOR[n.prioridade] || PRIORIDADE_COLOR.normal;
    const url = n.modulo_url ? toPanelUrl(n.modulo_url) : toPanelUrl('notificacoes');
    const naoLida = n.computed || !n.lida;
    return `
      <a class="notif-dd-item${naoLida ? ' nao-lida' : ''}" href="${url}" data-notif-id="${n.id}" data-computed="${!!n.computed}">
        ${notifIconHtml(n.icone, n.prioridade)}
        <div class="notif-dd-body">
          <div class="notif-dd-titulo">${esc(n.titulo)}</div>
          ${n.descricao ? `<div class="notif-dd-desc">${esc(n.descricao)}</div>` : ''}
          <div class="notif-dd-meta">
            <span class="notif-dd-dot" style="background:${c.dot}"></span>
            <span class="notif-dd-time">${fmtRelTime(n.created_at)}</span>
          </div>
        </div>
      </a>`;
  }).join('');

  // Marca como lida ao clicar
  container.querySelectorAll('[data-notif-id]').forEach((el) => {
    el.addEventListener('click', () => {
      const id = el.dataset.notifId;
      if (id && el.dataset.computed !== 'true') {
        engine.marcarLida(id);
      }
    });
  });
}

function ensureTopbarIconButtons() {
  const actions = document.querySelector('.topbar-actions');
  if (!actions || document.getElementById('topbarNotifBtn')) return;

  injectNotifStyles();

  // Wrap da campainha com badge e dropdown
  const wrap = document.createElement('div');
  wrap.className = 'topbar-notif-wrap';
  wrap.id = 'topbarNotifWrap';

  const notifBtn = document.createElement('button');
  notifBtn.type = 'button';
  notifBtn.id = 'topbarNotifBtn';
  notifBtn.className = 'topbar-icon-btn';
  notifBtn.setAttribute('aria-label', 'Notificações');
  notifBtn.setAttribute('title', 'Notificações');
  notifBtn.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>`;

  const badge = document.createElement('span');
  badge.id = 'topbarNotifBadge';
  badge.className = 'topbar-notif-badge hidden';
  badge.setAttribute('aria-live', 'polite');

  const dropdown = document.createElement('div');
  dropdown.id = 'topbarNotifDropdown';
  dropdown.className = 'notif-dropdown';
  dropdown.innerHTML = `
    <div class="notif-dd-head">
      <h4>Notificações</h4>
      <a href="${toPanelUrl('notificacoes')}" class="notif-dd-ver-todas">Ver todas</a>
    </div>
    <div id="topbarNotifList" class="notif-dd-list"></div>
    <div class="notif-dd-footer"><a href="${toPanelUrl('notificacoes')}">Central de notificações →</a></div>
  `;

  wrap.appendChild(notifBtn);
  wrap.appendChild(badge);
  wrap.appendChild(dropdown);

  actions.prepend(wrap);
  ensureScreenTourButton(actions, wrap);

  // Toggle dropdown ao clicar no sino
  notifBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    dropdown.classList.toggle('open');
  });

  // Fecha ao clicar fora
  document.addEventListener('click', (e) => {
    if (!wrap.contains(e.target)) dropdown.classList.remove('open');
  });
}

function ensureScreenTourStyles() {
  if (document.getElementById('screenTourStyles')) return;
  const style = document.createElement('style');
  style.id = 'screenTourStyles';
  style.textContent = `
    .screen-tour-help{font:900 18px/1 ui-sans-serif,system-ui,sans-serif}
    .screen-tour-help[aria-pressed="true"]{color:#54e7b2;border-color:rgba(84,231,178,.42);background:rgba(18,216,143,.14)}
    .screen-tour-backdrop{position:fixed;inset:0;z-index:9990;pointer-events:none;background:rgba(1,10,7,.22);animation:tourFade .18s ease-out}
    .screen-tour-focus{position:fixed;z-index:9991;border-radius:14px;pointer-events:none;box-shadow:0 0 0 4px rgba(84,231,178,.9),0 0 0 9999px rgba(1,10,7,.72);transition:top .25s ease,left .25s ease,width .25s ease,height .25s ease}
    .screen-tour-card{position:fixed;z-index:9992;width:min(360px,calc(100vw - 24px));max-height:calc(100vh - 24px);overflow:auto;padding:20px;border:1px solid rgba(84,231,178,.28);border-radius:18px;background:#071b14;color:#ecfff7;box-shadow:0 22px 60px rgba(0,0,0,.44);font-family:ui-sans-serif,system-ui,sans-serif;animation:tourCardIn .22s ease-out}
    .screen-tour-kicker{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:10px;color:#54e7b2;font-size:11px;font-weight:900;letter-spacing:.11em;text-transform:uppercase}
    .screen-tour-close{width:30px;height:30px;border:0;border-radius:9px;background:rgba(255,255,255,.07);color:#dff8ee;cursor:pointer;font-size:20px;line-height:1}
    .screen-tour-card h3{margin:0 0 7px!important;color:#fff!important;font-size:19px!important;line-height:1.25!important}
    .screen-tour-card p{margin:0;color:#acd0c1;font-size:14px;line-height:1.55}
    .screen-tour-example{margin-top:14px;padding:12px;border:1px solid rgba(84,231,178,.2);border-radius:13px;background:rgba(0,0,0,.2)}
    .screen-tour-example-label{display:block;margin-bottom:8px;color:#82e8c1;font-size:10px;font-weight:900;letter-spacing:.09em;text-transform:uppercase}
    .screen-tour-demo-row{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
    .screen-tour-demo-btn{display:inline-flex;align-items:center;gap:5px;min-height:30px;padding:0 9px;border:1px solid rgba(255,255,255,.13);border-radius:8px;background:#10251d;color:#c9e8dc;font-size:11px;font-weight:800}
    .screen-tour-demo-btn.on{border-color:#45daa6;background:#176c4d;color:#fff;box-shadow:0 0 0 1px rgba(69,218,166,.15)}
    .screen-tour-demo-select,.screen-tour-demo-input{display:flex;align-items:center;min-height:32px;padding:0 9px;border:1px solid rgba(255,255,255,.13);border-radius:8px;background:#06140f;color:#d8eee6;font-size:11px;flex:1 1 130px}
    .screen-tour-demo-input.money{flex:0 0 82px;color:#8ff0cb}
    .screen-tour-demo-arrow{color:#54e7b2;font-weight:900}
    .screen-tour-demo-note{display:block;margin-top:7px;color:#86aa9c;font-size:10.5px;line-height:1.35}
    .screen-tour-progress{display:flex;gap:5px;margin:17px 0}
    .screen-tour-progress i{height:3px;flex:1;border-radius:99px;background:rgba(255,255,255,.12)}
    .screen-tour-progress i.on{background:#35d69e}
    .screen-tour-actions{display:flex;align-items:center;justify-content:space-between;gap:10px}
    .screen-tour-actions button{min-height:38px;padding:0 15px;border-radius:11px;border:1px solid rgba(255,255,255,.12);background:transparent;color:#dff8ee;font-weight:800;cursor:pointer}
    .screen-tour-actions .screen-tour-next{border-color:#35d69e;background:#35d69e;color:#032217}
    .screen-tour-actions button:disabled{opacity:.35;cursor:default}
    @keyframes tourFade{from{opacity:0}to{opacity:1}}@keyframes tourCardIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
    @media(max-width:700px){.screen-tour-card{bottom:12px!important;left:12px!important;top:auto!important}.screen-tour-focus{border-radius:10px}}
  `;
  document.head.appendChild(style);
}

function getScreenTourSteps() {
  const programacaoSteps = getProgramacaoTourSteps();
  if (programacaoSteps.length) return programacaoSteps;

  const title = document.getElementById('pageTitle');
  const sidebar = document.querySelector('.sidebar');
  const main = document.querySelector('.page-main, main');
  const content = main?.querySelector('section, .card, form, table, [class*="dashboard"]') || main;
  const toolbar = main?.querySelector('.toolbar, [class*="toolbar"], .tabs, [class*="tabs"], form');
  const steps = [
    title && { el:title, title:'Você está nesta tela', text:`Este é o módulo ${title.textContent?.trim() || 'atual'}. Use este guia sempre que quiser relembrar os pontos principais.` },
    sidebar && { el:sidebar, title:'Navegação do painel', text:'Use o menu lateral para trocar de módulo. As opções exibidas respeitam o seu perfil de acesso.' },
    content && { el:content, title:'Área principal', text:'Aqui ficam as informações e tarefas desta tela. Role a página normalmente depois de concluir o tutorial.' },
    toolbar && toolbar !== content && { el:toolbar, title:'Filtros e ações', text:'Nesta área você encontra os comandos da tela, como filtros, buscas, cadastros ou atualização dos dados.' },
    document.querySelector('.topbar-actions') && { el:document.querySelector('.topbar-actions'), title:'Atalhos do topo', text:'Acesse notificações, ajuda e opções da sua conta por estes atalhos.' }
  ];
  return steps.filter((step, index, all) => step && step.el && step.el.getClientRects().length && all.findIndex(s => s?.el === step.el) === index);
}

function getProgramacaoTourSteps() {
  const path = String(window.location.pathname || '').toLowerCase();
  const title = document.getElementById('pageTitle')?.textContent?.trim().toLowerCase();
  if (!path.includes('programacao') && title !== 'programação' && title !== 'programacao') return [];

  const pick = (...selectors) => selectors.map((selector) => document.querySelector(selector)).find(Boolean);
  const context = pick('.prog-context-group', '.prog-toolbar-row:first-child');
  const osStep = pick('#progSteps [data-ui-step="1"]', '#progSteps .stepbtn:first-child');
  const semOsStep = pick('#progSteps [data-ui-step="2"]', '#progSteps .stepbtn:nth-child(2)');
  const recusasStep = pick('#progSteps [data-ui-step="3"]', '#progSteps .stepbtn:nth-child(3)');
  const filters = pick('.pld-filters', '#pgcPane1', '#progList');
  const osList = pick('.pld-table-wrap', '#pldListaBody', '#pgcPane1');
  const actions = pick('.prog-actions-block', '#progGerarPdf', '.prog-toolbar');

  const steps = [
    {
      el: document.getElementById('pageTitle') || context,
      title: 'Como fazer a programação',
      text: 'Este guia mostra o fluxo completo do gestor. Você vai carregar o dia, tratar cada O.S., conferir quem ficou sem O.S. e resolver despesas recusadas.'
    },
    context && {
      el: context,
      title: '1. Escolha supervisão e data',
      text: 'Selecione a supervisão, escolha o dia que será programado e clique em Carregar. Datas passadas ficam somente para consulta; para editar, use hoje ou uma data futura.'
    },
    osStep && {
      el: osStep,
      title: '2. Comece pela aba O.S.',
      text: 'Aqui aparecem as ordens de serviço da supervisão. Use esta aba para decidir o andamento de cada serviço e montar a equipe que irá atender.'
    },
    filters && {
      el: filters,
      title: '3. Encontre a O.S.',
      text: 'Pesquise pelo número da O.S. ou cliente e refine por cidade, local ou remanescente. Depois, clique na linha da O.S. para abrir os detalhes.'
    },
    osList && {
      el: osList,
      title: '4. Defina a ação da O.S.',
      text: 'Clique na O.S. para abrir o painel e escolha a ação que representa a situação atual. Use Atender para liberar a montagem da equipe.',
      example: '<span class="screen-tour-example-label">Exemplo · ações da O.S.</span><div class="screen-tour-demo-row"><span class="screen-tour-demo-btn">⏸ Pausar</span><span class="screen-tour-demo-btn on">✓ Atender</span><span class="screen-tour-demo-btn">$ Finalizar</span><span class="screen-tour-demo-btn">💰 Saldo</span></div><span class="screen-tour-demo-note">No exemplo, “Atender” está selecionado e a programação da equipe fica liberada.</span>'
    },
    osList && {
      el: osList,
      title: '5. Adicione um colaborador',
      text: 'Na seção Programação da O.S., abra Adicionar colaborador, pesquise ou selecione o nome e confirme em Adicionar.',
      example: '<span class="screen-tour-example-label">Exemplo · equipe</span><div class="screen-tour-demo-row"><span class="screen-tour-demo-select">João da Silva ▾</span><span class="screen-tour-demo-arrow">→</span><span class="screen-tour-demo-btn on">Adicionar</span></div><span class="screen-tour-demo-note">Antes de confirmar, confira se o colaborador está disponível e se pertence à supervisão correta.</span>'
    },
    osList && {
      el: osList,
      title: '6. Adicione a Frota',
      text: 'Use Adicionar Frota quando um motorista levar a equipe até a O.S. Selecione o motorista da Frota e confirme a inclusão.',
      example: '<span class="screen-tour-example-label">Exemplo · motorista de Frota</span><div class="screen-tour-demo-row"><span class="screen-tour-demo-select">Maria Souza · ABC1D23 ▾</span><span class="screen-tour-demo-arrow">→</span><span class="screen-tour-demo-btn on">+ Adicionar Frota</span></div><span class="screen-tour-demo-note">Frota transporta a equipe; o motorista não é contado como colaborador atendendo a O.S.</span>'
    },
    osList && {
      el: osList,
      title: '7. Lance as despesas',
      text: 'No cartão do colaborador, revise estadia, alimentação e deslocamento. Em Extras, escolha o tipo, descreva o gasto, informe o valor e adicione.',
      example: '<span class="screen-tour-example-label">Exemplo · despesa extra</span><div class="screen-tour-demo-row"><span class="screen-tour-demo-select">Pedágio ▾</span><span class="screen-tour-demo-input">Praça BR-163</span><span class="screen-tour-demo-input money">R$ 18,50</span><span class="screen-tour-demo-btn on">+ Adicionar</span></div><span class="screen-tour-demo-note">Informe valores e observações com clareza para facilitar a conferência posterior.</span>'
    },
    semOsStep && {
      el: semOsStep,
      title: '8. Trate quem ficou sem O.S.',
      text: 'Abra Sem O.S. para conferir colaboradores sem atendimento no dia. Informe a situação correta — como folga, falta ou atestado — e registre observações quando necessário.'
    },
    recusasStep && {
      el: recusasStep,
      title: '9. Corrija as recusas',
      text: 'Nesta aba ficam despesas devolvidas pela Conferência. Leia o motivo, faça a correção solicitada e acompanhe até a pendência ser resolvida.'
    },
    actions && {
      el: actions,
      title: '10. Finalize e compartilhe',
      text: 'As alterações são salvas durante o preenchimento. Ao terminar, gere o PDF para conferência, use Compartilhar para montar a mensagem do dia ou Duplique a programação para outras datas.'
    }
  ];

  return steps.filter((step) => step && step.el && step.el.getClientRects().length);
}

function startScreenTour(button) {
  if (window.__screenTourCleanup) window.__screenTourCleanup();
  const steps = getScreenTourSteps();
  if (!steps.length) return;
  ensureScreenTourStyles();

  let index = 0;
  const backdrop = document.createElement('div');
  backdrop.className = 'screen-tour-backdrop';
  backdrop.setAttribute('aria-hidden', 'true');
  const focus = document.createElement('div');
  focus.className = 'screen-tour-focus';
  const card = document.createElement('div');
  card.className = 'screen-tour-card';
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-modal', 'true');
  card.setAttribute('aria-label', 'Tutorial guiado da tela');
  document.body.append(backdrop, focus, card);
  button.setAttribute('aria-pressed', 'true');

  const cleanup = () => {
    backdrop.remove(); focus.remove(); card.remove();
    button.setAttribute('aria-pressed', 'false');
    document.removeEventListener('keydown', onKeydown);
    window.removeEventListener('resize', position);
    window.removeEventListener('scroll', position, true);
    window.__screenTourCleanup = null;
    button.focus();
  };
  window.__screenTourCleanup = cleanup;

  function position() {
    const rect = steps[index].el.getBoundingClientRect();
    const pad = 7;
    focus.style.cssText = `top:${Math.max(6,rect.top-pad)}px;left:${Math.max(6,rect.left-pad)}px;width:${Math.min(innerWidth-12,rect.width+pad*2)}px;height:${Math.min(innerHeight-12,rect.height+pad*2)}px`;
    if (innerWidth <= 700) return;
    const cardWidth = 360, gap = 18;
    let left = rect.right + gap;
    if (left + cardWidth > innerWidth - 12) left = Math.max(12, rect.left - cardWidth - gap);
    let top = Math.max(12, Math.min(rect.top, innerHeight - card.offsetHeight - 12));
    card.style.left = `${left}px`; card.style.top = `${top}px`;
  }

  function render() {
    const step = steps[index];
    step.el.scrollIntoView({ behavior:'smooth', block:'center', inline:'nearest' });
    card.innerHTML = `
      <div class="screen-tour-kicker"><span>Guia da tela · ${index + 1} de ${steps.length}</span><button class="screen-tour-close" type="button" aria-label="Fechar tutorial">×</button></div>
      <h3>${step.title}</h3><p>${step.text}</p>${step.example ? `<div class="screen-tour-example">${step.example}</div>` : ''}
      <div class="screen-tour-progress">${steps.map((_, i) => `<i class="${i <= index ? 'on' : ''}"></i>`).join('')}</div>
      <div class="screen-tour-actions"><button class="screen-tour-prev" type="button" ${index === 0 ? 'disabled' : ''}>Voltar</button><button class="screen-tour-next" type="button">${index === steps.length - 1 ? 'Concluir' : 'Avançar'}</button></div>`;
    card.querySelector('.screen-tour-close').onclick = cleanup;
    card.querySelector('.screen-tour-prev').onclick = () => { if (index > 0) { index--; render(); } };
    card.querySelector('.screen-tour-next').onclick = () => { if (index === steps.length - 1) cleanup(); else { index++; render(); } };
    requestAnimationFrame(position);
  }
  function onKeydown(e) {
    if (e.key === 'Escape') cleanup();
    if (e.key === 'ArrowRight') card.querySelector('.screen-tour-next')?.click();
    if (e.key === 'ArrowLeft') card.querySelector('.screen-tour-prev')?.click();
  }
  document.addEventListener('keydown', onKeydown);
  window.addEventListener('resize', position);
  window.addEventListener('scroll', position, true);
  render();
}

function ensureScreenTourButton(actions, notifWrap) {
  if (document.getElementById('topbarHelpBtn')) return;
  ensureScreenTourStyles();
  const button = document.createElement('button');
  button.type = 'button';
  button.id = 'topbarHelpBtn';
  button.className = 'topbar-icon-btn screen-tour-help';
  button.setAttribute('aria-label', 'Iniciar tutorial desta tela');
  button.setAttribute('aria-pressed', 'false');
  button.title = 'Tutorial desta tela';
  button.textContent = '?';
  actions.insertBefore(button, notifWrap);
  button.addEventListener('click', () => startScreenTour(button));
}

function updateNotifBell(list, count, engine) {
  const badge = document.getElementById('topbarNotifBadge');
  const listEl = document.getElementById('topbarNotifList');
  if (badge) {
    if (count > 0) {
      badge.textContent = count > 99 ? '99+' : String(count);
      badge.classList.remove('hidden');
    } else {
      badge.classList.add('hidden');
    }
  }
  if (listEl) renderNotifDropdown(list, listEl, engine);
}

async function initNotifBell(userContext) {
  try {
    const engine = await initNotificacoesEngine(userContext);
    const list = engine.getNotificacoes();
    updateNotifBell(list, engine.getBadgeCount(), engine);
    engine.onUpdate((newList, newCount) => updateNotifBell(newList, newCount, engine));
    // Expõe o engine globalmente para uso pelos módulos
    window.__painelNotifEngine = engine;
  } catch (err) {
    console.error('[notif bell]', err);
  }
}

async function getDisplayName(userContext) {
  try {
    const session = await getSession();
    const apelido = session?.user?.user_metadata?.apelido;
    if (apelido && String(apelido).trim()) return String(apelido).trim();
  } catch {}
  return userContext?.user?.name || 'Usuário';
}

function ensureWelcomeBlock() {
  const actions = document.querySelector('.topbar-actions');
  if (!actions) return null;

  let block = document.getElementById('topbarWelcomeBlock');
  if (!block) {
    block = document.createElement('div');
    block.id = 'topbarWelcomeBlock';
    block.className = 'topbar-welcome';
    block.innerHTML = `
      <span class="topbar-welcome-label">Bem-vindo</span>
      <span class="topbar-welcome-name" id="topbarWelcomeName">-</span>
    `;
    actions.prepend(block);
  }
  return block;
}

async function updateWelcomeBlockName(userContext) {
  const nameEl = document.getElementById('topbarWelcomeName');
  if (!nameEl) return;
  nameEl.textContent = await getDisplayName(userContext);
}

function ensureSidebarFooter() {
  const sidebar = document.querySelector('.sidebar');
  if (!sidebar || document.getElementById('sidebarFooter')) return;

  const footer = document.createElement('div');
  footer.id = 'sidebarFooter';
  footer.className = 'sidebar-footer';
  footer.innerHTML = `
    <button type="button" class="sidebar-footer-btn" id="sidebarFooterCollapseBtn" aria-label="Recolher menu" title="Recolher menu">
      <svg viewBox="0 0 24 24"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
    </button>
    <div class="sidebar-footer-divider"></div>
    <button type="button" class="sidebar-footer-btn" id="sidebarFooterSettingsBtn" aria-label="Configurações" title="Configurações">
      <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33A1.65 1.65 0 0 0 10.5 4V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82A1.65 1.65 0 0 0 21 9.5V10.5a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
    </button>
    <div class="sidebar-status-dot" title="Online"></div>
  `;

  sidebar.appendChild(footer);

  footer.querySelector('#sidebarFooterCollapseBtn').addEventListener('click', () => {
    const next = !document.body.classList.contains('sidebar-collapsed');
    document.body.classList.toggle('sidebar-collapsed', next);
    try { localStorage.setItem('painel_sidebar_collapsed', next ? '1' : '0'); } catch {}
    const mainToggle = document.getElementById('sidebarToggleBtn');
    if (mainToggle) {
      mainToggle.setAttribute('aria-expanded', String(!next));
      mainToggle.setAttribute('aria-label', next ? 'Expandir menu lateral' : 'Minimizar menu lateral');
      mainToggle.classList.toggle('is-collapsed', next);
    }
  });

  footer.querySelector('#sidebarFooterSettingsBtn').addEventListener('click', () => {
    const btn = document.getElementById('userSettingsBtn');
    if (btn) btn.click();
  });
}

export function renderAppLayout({ userContext, currentPageTitle = 'Painel' }) {
  const mobile = updateMobilePanelClass(userContext);
  const collapsed = mobile ? true : loadSidebarCollapsed();
  applySidebarCollapsed(collapsed);
  syncSidebarToggle(collapsed);
  setupMobileBackButton(userContext);
  ensureMobileQuickNav();

  const menu = buildAllowedMenu(userContext);
  renderMenu(document.getElementById('sidebarMenu'), menu, window.location.pathname, userContext);

  const toggleBtn = ensureSidebarToggle();
  if (toggleBtn) {
    toggleBtn.hidden = mobile;
  }
  if (toggleBtn && !toggleBtn.dataset.bound) {
    toggleBtn.addEventListener('click', () => {
      if (isMobileViewport()) {
        window.location.href = toPanelUrl('gestor-app');
        return;
      }
      const next = !document.body.classList.contains('sidebar-collapsed');
      applySidebarCollapsed(next);
      saveSidebarCollapsed(next);
      syncSidebarToggle(next);
    });
    toggleBtn.dataset.bound = '1';
  }

  if (!window.__painelMobileResizeBound) {
    window.addEventListener('resize', () => {
      const nowMobile = updateMobilePanelClass(userContext);
      const nextCollapsed = nowMobile ? true : loadSidebarCollapsed();
      applySidebarCollapsed(nextCollapsed);
      syncSidebarToggle(nextCollapsed);
      const btn = document.getElementById('sidebarToggleBtn');
      if (btn) btn.hidden = nowMobile;
      setupMobileBackButton(userContext);
  ensureMobileQuickNav();
    });
    window.__painelMobileResizeBound = true;
  }

  const welcome = document.getElementById('welcomeUser');
  if (welcome && !document.getElementById('agentUpdateStatus')) welcome.textContent = '';

  const pageTitle = document.getElementById('pageTitle');
  if (pageTitle) pageTitle.textContent = currentPageTitle;

  const roleBadge = document.getElementById('roleBadge');
  if (roleBadge) roleBadge.remove();

  bindSettingsButton(userContext);

  // Flowbite-style topbar & sidebar enhancements
  ensureTopbarTitleClass();
  ensureTopbarIconButtons();
  ensureWelcomeBlock();
  updateWelcomeBlockName(userContext);
  ensureSidebarFooter();

  // Motor de notificações (apenas na primeira renderização por página)
  if (!window.__painelNotifEngineInited) {
    window.__painelNotifEngineInited = true;
    initNotifBell(userContext);
  }

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
