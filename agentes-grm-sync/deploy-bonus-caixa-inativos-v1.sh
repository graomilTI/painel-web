#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="${REPO_DIR:-/home/grao100/painel-web}"
PROD_DIR="${PROD_DIR:-/home/grao100/painel-scripts/grm-sync}"
NODE_BIN="${GRM_SYNC_NODE_BIN:-/opt/node22/bin/node}"
PATCH="$REPO_DIR/agentes-grm-sync/patch-bonus-caixa-inativos-v1.js"
REPO_AGENT="$REPO_DIR/agentes-grm-sync/grm-sync-bonus-caixa.js"
PROD_AGENT="$PROD_DIR/grm-sync-bonus-caixa.js"
STAMP="$(date +%Y%m%d-%H%M%S)"

if [[ ! -x "$NODE_BIN" ]]; then
  echo "[ERRO] Node nao encontrado/executavel: $NODE_BIN" >&2
  exit 1
fi

cd "$REPO_DIR"
git pull --ff-only

if [[ ! -f "$PATCH" ]]; then
  echo "[ERRO] Patch nao encontrado: $PATCH" >&2
  exit 1
fi

if [[ ! -f "$REPO_AGENT" ]]; then
  echo "[ERRO] Agente do repositorio nao encontrado: $REPO_AGENT" >&2
  exit 1
fi

if [[ ! -f "$PROD_AGENT" ]]; then
  echo "[ERRO] Agente de producao nao encontrado: $PROD_AGENT" >&2
  exit 1
fi

cp -a "$PROD_AGENT" "$PROD_AGENT.bak-$STAMP"
echo "[OK] Backup de producao: $PROD_AGENT.bak-$STAMP"

"$NODE_BIN" "$PATCH" "$REPO_AGENT"
"$NODE_BIN" --check "$REPO_AGENT"

"$NODE_BIN" "$PATCH" "$PROD_AGENT"
"$NODE_BIN" --check "$PROD_AGENT"

chown grao100:grao100 "$PROD_AGENT" 2>/dev/null || true
chmod 750 "$PROD_AGENT" 2>/dev/null || true

echo "[OK] Agente de Bonus adaptado para pesquisar ativos e inativos."
echo "[OK] Sintaxe validada com $NODE_BIN --check."
echo "[INFO] O script nao habilita o agente nem cria jobs automaticamente."
