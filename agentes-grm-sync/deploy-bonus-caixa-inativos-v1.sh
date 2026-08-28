#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="${REPO_DIR:-/home/grao100/painel-web}"
PROD_DIR="${PROD_DIR:-/home/grao100/painel-scripts/grm-sync}"
NODE_BIN="${GRM_SYNC_NODE_BIN:-/opt/node22/bin/node}"
PATCH="$REPO_DIR/agentes-grm-sync/patch-bonus-caixa-inativos-v1.js"
REPO_AGENT="$REPO_DIR/agentes-grm-sync/grm-sync-bonus-caixa.js"
PROD_AGENT="$PROD_DIR/grm-sync-bonus-caixa.js"
STAMP="$(date +%Y%m%d-%H%M%S)"
TMP_AGENT="$(mktemp /tmp/grm-sync-bonus-caixa-inativos.XXXXXX.js)"

cleanup() {
  rm -f "$TMP_AGENT" 2>/dev/null || true
}
trap cleanup EXIT

if [[ ! -x "$NODE_BIN" ]]; then
  echo "[ERRO] Node nao encontrado/executavel: $NODE_BIN" >&2
  exit 1
fi

cd "$REPO_DIR"

# O deploy anterior chegou a alterar a copia rastreada do repositorio antes de
# falhar no --check. Restaura essa copia para o HEAD antes do pull para nao
# deixar lixo local nem depender dela para o deploy de producao.
if [[ -f "$REPO_AGENT" ]]; then
  git restore --source=HEAD -- "$REPO_AGENT" 2>/dev/null || true
fi

git pull --ff-only

if [[ ! -f "$PATCH" ]]; then
  echo "[ERRO] Patch nao encontrado: $PATCH" >&2
  exit 1
fi

if [[ ! -f "$PROD_AGENT" ]]; then
  echo "[ERRO] Agente de producao nao encontrado: $PROD_AGENT" >&2
  exit 1
fi

# Nao alteramos a producao ate provar que a copia atual e o resultado do patch
# possuem sintaxe JavaScript valida.
echo "[INFO] Validando agente atual de producao..."
"$NODE_BIN" --check "$PROD_AGENT"

cp -a "$PROD_AGENT" "$TMP_AGENT"
echo "[INFO] Aplicando patch em copia temporaria..."
"$NODE_BIN" "$PATCH" "$TMP_AGENT"

echo "[INFO] Validando copia temporaria adaptada..."
"$NODE_BIN" --check "$TMP_AGENT"

cp -a "$PROD_AGENT" "$PROD_AGENT.bak-$STAMP"
echo "[OK] Backup de producao: $PROD_AGENT.bak-$STAMP"

cp -a "$TMP_AGENT" "$PROD_AGENT"
"$NODE_BIN" --check "$PROD_AGENT"

chown grao100:grao100 "$PROD_AGENT" 2>/dev/null || true
chmod 750 "$PROD_AGENT" 2>/dev/null || true

echo "[OK] Agente de Bonus adaptado para pesquisar ativos e inativos."
echo "[OK] Sintaxe validada com $NODE_BIN --check antes e depois da instalacao."
echo "[INFO] A copia rastreada em painel-web nao foi modificada pelo patch."
echo "[INFO] O script nao habilita o agente nem cria jobs automaticamente."
