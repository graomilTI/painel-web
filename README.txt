Módulo Usuários e Acessos

Arquivos alterados para upload:
- admin-usuarios.html
- js/admin-usuarios.js
- js/menuConfig.js
- styles.css

Arquivos adicionais:
- backend/worker-api.js  -> substitua o código do seu worker-api por este arquivo
- sql/modulo_usuarios.sql -> execute no SQL Editor do Supabase

Variáveis necessárias no worker-api:
- SUPABASE_URL
- SUPABASE_ANON_KEY
- SUPABASE_SERVICE_KEY
- GAS_EXEC_URL (para não quebrar as rotas já existentes)

Fluxo:
1) Execute sql/modulo_usuarios.sql no Supabase
2) Suba os arquivos do frontend
3) Atualize o worker-api com backend/worker-api.js
4) Hard refresh no navegador
