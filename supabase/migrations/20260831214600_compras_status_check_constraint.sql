-- Fase 3 da organização do módulo de Compras: compras_itens e compras_solicitacoes
-- nunca tiveram CHECK constraint em status, apesar de nunca terem tido migration
-- versionada (foram criadas fora do controle de versão). Um typo em qualquer
-- lugar do código já quebrou a trigger sync_compras_solicitacao_status()
-- silenciosamente (motivo da migration 20260807203000).
--
-- Lista de valores validada em 2026-08-31 contra: todo o JS do repositório que
-- escreve compras_itens.status/compras_solicitacoes.status (compras.js,
-- adm-compras.js, compras-epi-gestor.js, epiRh.js, financeiro.js, termos.js,
-- comprovante-mobile.js), toda function/trigger do Postgres que referencia
-- essas tabelas, e supabase/functions/ (nenhuma edge function as toca). Também
-- validada contra os dados reais em produção (nenhuma linha fora da lista).
--
-- 'aberto' é o DEFAULT da coluna em compras_solicitacoes (hoje sem nenhuma
-- linha, mas precisa continuar válido). aguardando_gestor é um status ainda
-- em uso: existe um backlog real de solicitações de EPI aguardando aprovação
-- do Gestor (ver assets/js/compras-epi-gestor.js) — não é status morto.

alter table public.compras_itens
  add constraint compras_itens_status_check
  check (status in (
    'pendente','em_cotacao','em_analise','pendente_pagamento',
    'aguardando_termo','aguardando_nf','comprado','recusado',
    'concluido','cancelado','aguardando_gestor'
  ));

alter table public.compras_solicitacoes
  add constraint compras_solicitacoes_status_check
  check (status in (
    'pendente','em_cotacao','em_analise','pendente_pagamento',
    'aguardando_termo','aguardando_nf','comprado','recusado',
    'concluido','cancelado','aguardando_gestor','aberto'
  ));
