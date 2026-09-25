import { signInWithPassword, getUserContext, getSession } from './auth.js';
import { saveUserContext, loadUserContext } from './sessionStore.js';
import { toPanelUrl } from './paths.js';
import { logActivity } from './activityLogger.js';

function homeUrl(context) {
  const role = String(context?.user?.role ?? context?.role ?? '').toLowerCase();
  if (role === 'gestor') {
    const isMobile = /Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth < 768;
    return toPanelUrl(isMobile ? 'gestor-app' : 'programacao');
  }
  return toPanelUrl('dashboard');
}

const form = document.getElementById('loginForm');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const feedback = document.getElementById('loginFeedback');
const togglePassword = document.getElementById('togglePassword');
const submitBtn = form?.querySelector('button[type="submit"]');

if (togglePassword) {
  togglePassword.addEventListener('click', () => {
    passwordInput.type = passwordInput.type === 'password' ? 'text' : 'password';
    togglePassword.textContent = passwordInput.type === 'password' ? 'Mostrar' : 'Ocultar';
  });
}

async function redirectIfSessionExists() {
  if (new URLSearchParams(window.location.search).get('erro') === 'sessao') {
    feedback.textContent = 'Não foi possível carregar sua sessão. Faça login novamente.';
    return;
  }

  try {
    const session = await getSession();
    if (session?.user) {
      feedback.textContent = 'Sessão ativa encontrada. Redirecionando...';
      const saved = loadUserContext();
      window.location.replace(homeUrl(saved));
    }
  } catch (err) {
    console.error(err);
  }
}

function clearSupabaseAuthStorage() {
  for (const store of [window.localStorage, window.sessionStorage]) {
    try {
      Object.keys(store)
        .filter((k) => /^sb-.*-(auth-token|code-verifier)/.test(k))
        .forEach((k) => store.removeItem(k));
    } catch {}
  }
  try { sessionStorage.removeItem('grao1000:user-ctx:v1'); } catch {}
}

async function retryWithFreshClient(email, password) {
  clearSupabaseAuthStorage();
  const [{ createClient }, { SUPABASE_URL, SUPABASE_ANON_KEY }] = await Promise.all([
    import('https://esm.sh/@supabase/supabase-js@2'),
    import('./supabaseClient.js'),
  ]);
  const fresh = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      lock: async (_name, _timeout, fn) => fn(),
    },
  });
  const { data, error } = await Promise.race([
    fresh.auth.signInWithPassword({ email, password }),
    new Promise((_, reject) => setTimeout(() => reject(new Error('O login demorou demais para responder. Verifique a conexão, feche e reabra o navegador e tente novamente.')), 15000)),
  ]);
  if (error) throw error;
  if (!data?.session) throw new Error('Não foi possível iniciar a sessão. Tente novamente.');
  // A sessão já ficou gravada no storage; o contexto do usuário é carregado no
  // boot da página seguinte (requireAuth).
  feedback.textContent = 'Login realizado com sucesso.';
  window.location.replace(toPanelUrl('dashboard'));
}

form?.addEventListener('submit', async (e) => {
  e.preventDefault();
  feedback.textContent = 'Entrando...';
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Entrando...';
  }

  try {
    // Em alguns celulares a promise do signIn nunca resolve (lock interno do
    // Supabase / rede instável) mesmo com o servidor respondendo 200. Sem limite
    // a tela ficava eternamente em "Entrando...". Se estourar, tenta aproveitar a
    // sessão que o cliente já gravou antes de desistir.
    let authData;
    try {
      authData = await Promise.race([
        signInWithPassword(emailInput.value.trim(), passwordInput.value),
        new Promise((_, reject) => setTimeout(() => reject(new Error('__login_timeout__')), 15000)),
      ]);
    } catch (err) {
      if (err?.message !== '__login_timeout__') throw err;
      const session = await Promise.race([
        getSession().catch(() => null),
        new Promise((resolve) => setTimeout(() => resolve(null), 4000)),
      ]);
      if (session?.user) {
        authData = { user: session.user };
      } else {
        // Cliente travado (dados de sessão antigos/lock preso no Safari): limpa o
        // que o Supabase gravou e refaz o login com um cliente novo, sem lock.
        feedback.textContent = 'Reconectando...';
        await retryWithFreshClient(emailInput.value.trim(), passwordInput.value);
        return;
      }
    }
    const userId = authData.user?.id;
    if (!userId) throw new Error('Usuário não encontrado após login.');

    const context = await getUserContext(userId);
    if (!context?.user?.active) throw new Error('Usuário inativo.');

    saveUserContext(context);
    logActivity('login', 'Login realizado', 'auth', { role: context?.user?.role, setor: context?.user?.setor });
    feedback.textContent = 'Login realizado com sucesso.';
    window.location.replace(homeUrl(context));
  } catch (err) {
    console.error(err);
    feedback.textContent = err.message || 'Erro ao realizar login.';
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Entrar';
    }
  }
});

redirectIfSessionExists();
