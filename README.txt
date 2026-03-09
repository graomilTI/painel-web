Arquivos ajustados (front-end)
- assets/js/api.js: normaliza API.post retornando JSON direto
- adm/adm.js: inicializa módulo conferência (conf) para renderizar histórico em tabela (ordenado por data)
- style.css + assets/css/style.css: estilos adicionados para tabela/botões do ADM

Como usar no seu repo:
1) Copie os arquivos para os mesmos caminhos no painel-web.
2) Garanta que o adm/adm.html referencie:
   - ../assets/js/api.js
   - ../assets/js/auth.js
   - ../assets/js/auth_guard.js
   - adm.js
   - adm/style.css (ou ../assets/css/style.css)
