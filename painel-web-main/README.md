# Painel Frontend

Estrutura inicial pronta para:
- login com Supabase Auth
- carregar `get_user_context`
- montar menu dinâmico
- proteger páginas

## Arquivos principais
- `login.html`
- `dashboard.html`
- `js/supabaseClient.js`
- `js/auth.js`
- `js/authGuard.js`
- `js/menuConfig.js`
- `js/menuBuilder.js`

## Observações
- A chave publicada já foi configurada em `js/supabaseClient.js`.
- O projeto usa import ES Module via CDN do Supabase.
- Próximo passo recomendado: conectar a tela `programacao.html` ao banco.
