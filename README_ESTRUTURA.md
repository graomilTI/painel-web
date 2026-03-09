# Painel Web — Estrutura (Gestor x ADM)

## Pastas
- /gestor/* : telas do Gestor (pedido, programação, clientes, etc.)
- /adm/adm.html : shell do ADM
- /adm/modulos/* : módulos internos carregados no ADM (ex.: conferencia.html)
- /assets/* : css/js compartilhados
- /index.html : entrada (login/redirect)

## Ajustes aplicados
- Paths de assets corrigidos para páginas dentro de /gestor e /adm
- adm.js passa a carregar módulos em /adm/modulos (antes era /adm/*.html)
