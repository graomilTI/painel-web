import { supabase } from './supabaseClient.js';

// Supervisões liberadas ao usuário logado (fora master, que é tratado por quem chama).
// Fonte principal: programacao_usuario_supervisoes. Quando o usuário não tem nenhuma
// linha ativa lá (cadastro novo/editado depois do backfill), cai para o campo legado
// app_usuarios.supervisao — mesma regra de public.programacao_listar_supervisoes() e da
// RLS de logistica_abertura_os. Lança erro se não conseguir validar (quem chama falha fechado).
export async function carregarSupervisoesLiberadas() {
  const { data, error } = await supabase.from('programacao_usuario_supervisoes').select('supervisao').eq('ativo', true);
  if (error) throw error;
  const nomes = (Array.isArray(data) ? data : []).map((r) => String(r?.supervisao ?? '').trim()).filter(Boolean);
  if (nomes.length) return nomes;

  const { data: authData } = await supabase.auth.getUser();
  const authId = authData?.user?.id;
  if (!authId) return [];
  const { data: app, error: appErr } = await supabase.from('app_usuarios').select('supervisao').eq('auth_user_id', authId).maybeSingle();
  if (appErr) throw appErr;
  return String(app?.supervisao ?? '').split(/[,;|\n]+/).map((s) => s.trim()).filter(Boolean);
}
