# Painel Web — Arquitetura (Grão 1000)

Este repositório é o **frontend** do Painel (Cloudflare Pages).

## Rotas
- `/login/` login (CPF+PIN)
- `/gestor/` app gestor
- `/adm/` app adm
- `/diretoria/` app diretoria

## Padrão de módulos
Cada módulo expõe:
- `window.<MOD>.openHome(container, opts)`

Arquivos em `modules/<nome>/module.js`.
