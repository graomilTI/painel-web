PASSOS PARA LIGAR AO SUPABASE

1. Abra o SQL Editor do Supabase.
2. Rode o arquivo:
   supabase/schema_painel.sql

3. No Authentication > Users:
   - crie seu usuário de teste
   - depois marque esse usuário como master com o UPDATE comentado no final do SQL
   ou insira permissões na tabela user_modules

4. Suba este frontend no main do GitHub.

5. Teste:
   - /login.html
   - /index.html
   - importar-colaboradores.html
   - importar-producao.html
   - ferias-atestados.html
   - historico-indisponibilidade.html
   - consultar-colaboradores.html
   - historico-colaboradores.html
   - historico-producao.html
   - efetivos-sem-producao.html

PÁGINAS JÁ LIGADAS AO SUPABASE NESTE PACOTE
- Login / sessão / logout
- Dashboard / contexto do usuário
- Férias e Atestados
- Histórico de Indisponibilidade
- Importar Colaboradores
- Histórico de Importações de Colaboradores
- Consultar Base
- Importar Produção
- Histórico Produção
- Efetivos sem Produção

AJUSTE APLICADO
- menu do ADM sem prefixo/sufixo visual
- correção de leitura da tabela indisponibilidades no módulo de efetivos sem produção
- auth.js aceitando retorno objeto ou array da RPC get_user_context
