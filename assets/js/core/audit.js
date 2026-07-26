// assets/js/core/audit.js
// Auditoria padrão do frontend (fundação P0, itens 1.5 e 2.3).
//
// Complementa a trigger de banco fn_registrar_auditoria(): ações que não
// passam por um UPDATE/INSERT direto auditável (envio de e-mail, geração de
// arquivo, chamadas a integrações, decisões de fluxo) são registradas aqui,
// na mesma tabela app_auditoria, com origem = 'frontend'.
//
// Enquanto a migration 20260726120000_fundacao_auditoria.sql não estiver
// aplicada no projeto, os eventos caem para a tabela app_logs_usuarios
// (que já existe em produção desde a fase de Logs de Usuários), com
// tipo = 'action' e o payload completo em `detalhes`. Assim nenhuma ação
// fica sem rastro durante a transição, e nada precisa mudar no código dos
// módulos quando a tabela definitiva entrar: a detecção é automática.
//
// A auditoria nunca pode quebrar a ação de negócio: falhas são apenas
// logadas no console.

import { supabase } from '../supabaseClient.js';

const CTX_KEY = 'grao1000:user-ctx:v1';

// null = ainda não sabemos; true/false depois da primeira tentativa.
let appAuditoriaDisponivel = null;

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

function tabelaInexistente(error) {
  // PGRST205/PGRST202: relação não encontrada no schema cache (PostgREST);
  // 42P01: undefined_table (Postgres).
  const code = error?.code || '';
  const msg = (error?.message || '').toLowerCase();
  return (
    code === '42P01' ||
    code.startsWith('PGRST2') ||
    msg.includes('could not find the table') ||
    msg.includes('does not exist')
  );
}

async function gravarEmAppAuditoria(user, evento) {
  return supabase.from('app_auditoria').insert({
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
}

async function gravarEmLogsUsuarios(user, evento) {
  return supabase.from('app_logs_usuarios').insert({
    usuario_id: user?.id ?? null,
    usuario_nome: user?.user_metadata?.nome ?? user?.user_metadata?.full_name ?? null,
    usuario_email: user?.email ?? null,
    tipo: 'action',
    modulo: evento.modulo || moduloAtual(),
    acao: evento.acao || 'acao_registrada',
    detalhes: {
      _auditoria: true,
      tabela: evento.tabela ?? null,
      registro_id: evento.registroId != null ? String(evento.registroId) : null,
      valor_anterior: evento.valorAnterior ?? null,
      valor_novo: evento.valorNovo ?? null,
      origem: 'frontend',
      erro: evento.erro ?? null,
    },
    user_agent: navigator.userAgent?.slice(0, 250) ?? null,
  });
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

    if (appAuditoriaDisponivel !== false) {
      const { error } = await gravarEmAppAuditoria(user, evento);
      if (!error) {
        appAuditoriaDisponivel = true;
        return;
      }
      if (tabelaInexistente(error)) {
        appAuditoriaDisponivel = false; // cai para o fallback abaixo
      } else {
        console.warn('[audit] falha ao registrar auditoria:', error.message);
        return;
      }
    }

    const { error: fallbackError } = await gravarEmLogsUsuarios(user, evento);
    if (fallbackError) {
      console.warn('[audit] falha no fallback app_logs_usuarios:', fallbackError.message);
    }
  } catch (error) {
    console.warn('[audit] falha ao registrar auditoria:', error);
  }
}
