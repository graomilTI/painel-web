// assets/js/core/audit.js
// Auditoria padrão do frontend (fundação P0, itens 1.5 e 2.3).
//
// Complementa a trigger de banco fn_registrar_auditoria(): ações que não
// passam por um UPDATE/INSERT direto auditável (envio de e-mail, geração de
// arquivo, chamadas a integrações, decisões de fluxo) são registradas aqui,
// na mesma tabela app_auditoria, com origem = 'frontend'.
//
// A auditoria nunca pode quebrar a ação de negócio: falhas são apenas
// logadas no console.

import { supabase } from '../supabaseClient.js';

const CTX_KEY = 'grao1000:user-ctx:v1';

function usuarioAtual() {
  try {
    const { raw } = JSON.parse(sessionStorage.getItem(CTX_KEY) || '{}');
    return raw?.user ?? null;
  } catch {
    return null;
  }
}

function moduloAtual() {
  const seg = window.location.pathname.split('/').filter(Boolean).pop() || 'dashboard';
  return seg.replace(/\.html$/i, '');
}

/**
 * registrarAuditoria({ modulo, tabela, registroId, acao, valorAnterior, valorNovo, erro })
 *
 * @param {object} evento
 *   modulo         — módulo do painel (default: rota atual)
 *   tabela         — tabela/entidade afetada (opcional)
 *   registroId     — id do registro afetado (opcional)
 *   acao           — descrição curta da ação, ex.: 'nf_lancada'
 *   valorAnterior  — objeto com o estado anterior (opcional)
 *   valorNovo      — objeto com o estado novo (opcional)
 *   erro           — mensagem de erro se a ação falhou (opcional)
 */
export async function registrarAuditoria(evento = {}) {
  try {
    const user = usuarioAtual();
    const { error } = await supabase.from('app_auditoria').insert({
      usuario_id: user?.id ?? null,
      usuario_email: user?.email ?? null,
      modulo: evento.modulo || moduloAtual(),
      tabela: evento.tabela ?? null,
      registro_id: evento.registroId != null ? String(evento.registroId) : null,
      acao: 'ACTION',
      valor_anterior: evento.valorAnterior ?? null,
      valor_novo: evento.valorNovo
        ? { ...evento.valorNovo, _acao: evento.acao || null }
        : (evento.acao ? { _acao: evento.acao } : null),
      origem: 'frontend',
      erro: evento.erro ?? null,
      user_agent: navigator.userAgent?.slice(0, 250) ?? null,
    });
    if (error) console.warn('[audit] falha ao registrar auditoria:', error.message);
  } catch (error) {
    console.warn('[audit] falha ao registrar auditoria:', error);
  }
}
