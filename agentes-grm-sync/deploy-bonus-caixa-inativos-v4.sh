#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="${REPO_DIR:-/home/grao100/painel-web}"
PROD_DIR="${PROD_DIR:-/home/grao100/painel-scripts/grm-sync}"
NODE_BIN="${GRM_SYNC_NODE_BIN:-/opt/node22/bin/node}"
PATCH="$REPO_DIR/agentes-grm-sync/patch-bonus-caixa-inativos-v4.js"
PROD_AGENT="$PROD_DIR/grm-sync-bonus-caixa.js"
STAMP="$(date +%Y%m%d-%H%M%S)"
TMP="$(mktemp /tmp/grm-sync-bonus-caixa-inativos-v4.XXXXXX.js)"

cleanup() {
  rm -f "$TMP" "$TMP.bak-inativos-v4" 2>/dev/null || true
}
trap cleanup EXIT

if [[ ! -x "$NODE_BIN" ]]; then
  echo "[ERRO] Node nao encontrado/executavel: $NODE_BIN" >&2
  exit 1
fi

cd "$REPO_DIR"
git pull --ff-only

if [[ ! -f "$PATCH" ]]; then
  echo "[ERRO] Patch v4 nao encontrado: $PATCH" >&2
  exit 1
fi
if [[ ! -f "$PROD_AGENT" ]]; then
  echo "[ERRO] Agente de producao nao encontrado: $PROD_AGENT" >&2
  exit 1
fi

echo "[INFO] Validando sintaxe do patch v4..."
"$NODE_BIN" --check "$PATCH"

echo "[INFO] Validando agente atual de producao..."
"$NODE_BIN" --check "$PROD_AGENT"

cp -a "$PROD_AGENT" "$TMP"

echo "[INFO] Aplicando abertura robusta do combobox Situacao em copia temporaria..."
"$NODE_BIN" "$PATCH" "$TMP"

echo "[INFO] Validando copia temporaria adaptada..."
"$NODE_BIN" --check "$TMP"

cp -a "$PROD_AGENT" "$PROD_AGENT.bak-inativos-v4-$STAMP"
echo "[OK] Backup de producao: $PROD_AGENT.bak-inativos-v4-$STAMP"

install -m 750 -o grao100 -g grao100 "$TMP" "$PROD_AGENT"
"$NODE_BIN" --check "$PROD_AGENT"

echo "[OK] Agente de Bonus v4 instalado."
echo "[OK] Situacao agora e aberta pelo input combobox, com fallback por teclado e diagnostico explicito."
echo "[OK] Patch e agente validados com Node antes da instalacao."
echo "[INFO] Este deploy nao habilita o agente e nao cria jobs automaticamente."
