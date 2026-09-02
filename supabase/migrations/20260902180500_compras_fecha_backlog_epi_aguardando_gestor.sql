-- Backlog real encontrado ao investigar o status 'aguardando_gestor': 283
-- linhas em compras_itens (todas tipo='EPI') e 52 em compras_solicitacoes,
-- criadas entre 09/06/2026 e 25/08/2026 — todas ANTES da remoção da tela de
-- aprovação de EPI pelo Gestor (commit 226cddae, 31/08/2026). Depois dessa
-- data nenhuma linha nova entrou nesse status, confirmando que não há mais
-- nenhum caminho de UI para revisar/avançar esses pedidos.
--
-- Decisão do usuário (Grão 1000, 02/09/2026): fechar esse backlog marcando
-- como 'concluido' em vez de reabrir na fila normal de Compras. Não afeta
-- nenhuma tela hoje: a aba "Fichas de EPI" do RH só lista
-- tipo_solicitacao='epi_rh', e esses registros vieram do fluxo antigo do
-- Gestor (tipo_solicitacao diferente).

update public.compras_itens
  set status = 'concluido'
  where status = 'aguardando_gestor';

update public.compras_solicitacoes
  set status = 'concluido'
  where status = 'aguardando_gestor';
