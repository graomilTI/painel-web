-- Logs de Usuários (auditoria) não mostrava as despesas lançadas pro
-- colaborador na Programação (tela "Programação > Extras", que grava direto
-- em programacao_extras via insert/update/delete do frontend). Só
-- compras_itens e financeiro_pagamentos tinham a trigger de auditoria
-- habilitada (fundação em 20260726120000_fundacao_auditoria.sql); despesa de
-- colaborador ficava fora da trilha (pedido do usuário, 2026-09-22).

DO $$
BEGIN
  IF to_regclass('public.programacao_extras') IS NOT NULL THEN
    PERFORM fn_habilitar_auditoria('programacao_extras', 'programacao');
  END IF;
END $$;
