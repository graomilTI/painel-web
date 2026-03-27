# Painel Web (GitHub Pages) — Frontend

## Por que está dando "Failed to fetch" no GitHub Pages?
Porque o browser bloqueia requisições diretas para `https://script.google.com/macros/...` por **CORS**.
 
✅ Solução: o frontend **deve chamar um endpoint com CORS habilitado**, ex.: **Cloudflare Worker** (proxy) apontando para o seu Apps Script.

## Configurar
1) Edite: `assets/js/config.js`
- `API_BASE = "https://SEU-WORKER.workers.dev"`

2) Suba tudo na raiz do repositório (GitHub Pages -> /root).

## Rotas esperadas no Worker
- `GET  /ping`
- `POST /` com JSON `{ action: "...", ... }`

Ações usadas hoje:
- `loginPIN`, `loginAdminCPF`
- `getDataPadrao`
- `carregarContexto`
- `gerarPDFProgramacao`
- `aloj_getPermissoes`
- `aloj_listarHospedados`
