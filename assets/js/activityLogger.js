import { supabase } from './supabaseClient.js';

const CTX_KEY = 'grao1000:user-ctx:v1';

function cachedUser() {
  try {
    const { raw } = JSON.parse(sessionStorage.getItem(CTX_KEY) || '{}');
    return raw?.user ?? null;
  } catch {
    return null;
  }
}

function currentModulo() {
  const seg = window.location.pathname.split('/').filter(Boolean).pop() || 'dashboard';
  return seg.replace(/\.html$/i, '');
}

export function logActivity(tipo, acao, modulo, detalhes) {
  const user = cachedUser();
  supabase
    .from('app_logs_usuarios')
    .insert({
      usuario_id:    user?.id    ?? null,
      usuario_nome:  user?.name  ?? null,
      usuario_email: user?.email ?? null,
      usuario_role:  user?.role  ?? null,
      tipo,
      modulo: modulo || currentModulo(),
      acao,
      detalhes: detalhes ?? null,
      user_agent: navigator.userAgent.substring(0, 300),
    })
    .then(() => {})
    .catch(() => {});
}
