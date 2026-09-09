// Erro de RLS (código 42501, "new row violates row-level security policy")
// quase sempre é sessão expirada, não bug de permissão: quando o token do
// Supabase Auth expira/fica inválido, o PostgREST executa a requisição como
// role anon (sem política nenhuma) em vez de authenticated, e o Postgres
// devolve esse erro genérico em vez de um 401 claro. Detectado e corrigido
// primeiro em programacao-despesas.js (commit 2c6e4c78, 2026-08-26) depois
// de confirmar via MCP do Supabase que as políticas envolvidas liberam tudo
// pra authenticated. Ver memória painel-web-rls-erro-generico-sessao-expirada.
import { getSession } from './auth.js';

export async function mensagemFalhaSalvar(error, fallback, contexto) {
  if (error?.code === '42501') {
    const session = await getSession().catch(() => null);
    if (!session) {
      return `Sua sessão expirou. Recarregue a página e faça login de novo para salvar${contexto ? ` (${contexto})` : ''}.`;
    }
  }
  // FK violation em "*_os_id_fkey" (operacional_os): a O.S. que a tela tinha
  // em memória foi removida/atualizada no meio-tempo (ex.: grm-sync-operacional-os
  // tirando O.S. que sumiu do relatório do GRM) — sem isto o usuário via o erro
  // cru do Postgres e ficava clicando na mesma O.S. fantasma sem entender por quê.
  if (error?.code === '23503' && /os_id_fkey/.test(error?.message || '')) {
    return `Essa O.S. não existe mais no sistema (removida ou atualizada pelo GRM). Atualize a lista e tente novamente${contexto ? ` (${contexto})` : ''}.`;
  }
  return fallback;
}
