Módulo PROPOSTAS - arquivos para upload manual

Arquivos incluídos:
- propostas.html
- assets/js/propostas.js
- assets/js/menuConfig.js
- supabase/migrations/20260619190000_propostas_comerciais.sql
- supabase/functions/gerar-proposta/index.ts

Como aplicar:
1. Envie/substitua estes arquivos no repositório/painel mantendo os mesmos caminhos.
2. Execute o SQL de supabase/migrations/20260619190000_propostas_comerciais.sql no Supabase.
3. Faça deploy da função Supabase:
   supabase functions deploy gerar-proposta
4. Configure os secrets da função:
   SUPABASE_URL
   SUPABASE_ANON_KEY
   SUPABASE_SERVICE_ROLE_KEY
   GOOGLE_SERVICE_ACCOUNT_JSON

Alternativa aos secrets Google:
   GOOGLE_CLIENT_EMAIL
   GOOGLE_PRIVATE_KEY

Opcional para Google Workspace com delegação de domínio:
   GOOGLE_IMPERSONATE_EMAIL

Importante:
- Compartilhe o Google Docs modelo e a pasta destino com o e-mail da service account do Google.
- Modelo padrão usado:
  1oXtCy8kAs9hfivR62JYKknjw7s0VKGeLvRkhSCN0Vzg
- Pasta destino usada:
  13oHU_dFWBVe9h-YRk-ZmPTb1VoEWx0Pt
