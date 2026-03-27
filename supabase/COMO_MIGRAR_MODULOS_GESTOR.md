MIGRAÇÃO DOS MÓDULOS DE GESTOR

1. Rode primeiro o schema base já existente:
   supabase/schema_painel.sql

2. Depois rode:
   supabase/migracao_modulos_gestor.sql

3. Esse pacote já migra para Supabase:
   - Programação (fluxo A/B/C/D/E com salvamento automático)
   - Hospedagem
   - Compras
   - Logística
   - Patrimônios
   - Contato Cliente

4. A Programação usa:
   - colaborador_snapshot
   - colaborador_importacoes
   - indisponibilidades
   - programacao_contextos
   - programacao_itens

5. Os demais módulos de gestor usam tabelas próprias:
   - hospedagem_solicitacoes
   - compras_solicitacoes
   - logistica_solicitacoes
   - patrimonio_solicitacoes
   - contato_cliente_registros

6. Se quiser liberar tudo para seu usuário de teste:
   update public.profiles
   set is_master = true, role = 'master', active = true
   where email = 'SEU_EMAIL';

7. Depois suba este zip inteiro no main do GitHub.
