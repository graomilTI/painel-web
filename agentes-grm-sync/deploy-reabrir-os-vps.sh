#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="${REPO_ROOT:-/home/grao100/painel-web}"
GRM_ROOT="${GRM_ROOT:-/home/grao100/painel-scripts/grm-sync}"
NODE_BIN="${GRM_SYNC_NODE_BIN:-/opt/node22/bin/node}"
STAMP="$(date +%Y%m%d-%H%M%S)"

SRC_AGENT="$REPO_ROOT/agentes-grm-sync/grm-sync-reabrir-os.js"
SRC_WORKER="$REPO_ROOT/agentes-grm-sync/worker/grm-sync-job-worker.js"
PATCH_FINANCEIRO="$REPO_ROOT/agentes-grm-sync/patch-reabrir-os-financeiro.js"
PATCH_FINANCEIRO_V2="$REPO_ROOT/agentes-grm-sync/patch-reabrir-os-financeiro-v2.js"
PATCH_VALIDACAO_V3="$REPO_ROOT/agentes-grm-sync/patch-reabrir-os-validacao-v3.js"
PATCH_SITUACAO_V4="$REPO_ROOT/agentes-grm-sync/patch-reabrir-os-situacao-v4.js"
PATCH_FATURADAS_V5="$REPO_ROOT/agentes-grm-sync/patch-reabrir-os-faturadas-v5.js"
PATCH_TOOLTIP_V6="$REPO_ROOT/agentes-grm-sync/patch-reabrir-os-tooltip-v6.js"
DST_AGENT="$GRM_ROOT/grm-sync-reabrir-os.js"
DST_WORKER="$GRM_ROOT/worker/grm-sync-job-worker.js"
ENV_FILE="$GRM_ROOT/.env"

for file in "$SRC_AGENT" "$SRC_WORKER" "$PATCH_FINANCEIRO" "$PATCH_FINANCEIRO_V2" "$PATCH_VALIDACAO_V3" "$PATCH_SITUACAO_V4" "$PATCH_FATURADAS_V5" "$PATCH_TOOLTIP_V6" "$ENV_FILE"; do
  [[ -f "$file" ]] || { echo "Arquivo obrigatório ausente: $file" >&2; exit 1; }
done

mkdir -p "$GRM_ROOT/worker"

[[ ! -f "$DST_AGENT" ]] || cp -a "$DST_AGENT" "$DST_AGENT.backup-$STAMP"
[[ ! -f "$DST_WORKER" ]] || cp -a "$DST_WORKER" "$DST_WORKER.backup-reabrir-$STAMP"

install -o grao100 -g grao100 -m 750 "$SRC_AGENT" "$DST_AGENT"
install -o grao100 -g grao100 -m 640 "$SRC_WORKER" "$DST_WORKER"

# Proteções financeiras e diagnósticos seguros.
"$NODE_BIN" "$PATCH_FINANCEIRO" "$DST_AGENT"
"$NODE_BIN" "$PATCH_FINANCEIRO_V2" "$DST_AGENT"

# Após a ação Reabrir, recarrega a rota do GRM antes de validar Abertas.
"$NODE_BIN" "$PATCH_VALIDACAO_V3" "$DST_AGENT"

# Se a O.S. desaparecer de Abertas/Finalizadas, diagnostica todas as opções de
# Situação/Financeiro sem executar nova ação no GRM.
"$NODE_BIN" "$PATCH_SITUACAO_V4" "$DST_AGENT"

# Regra operacional: O.S. Faturadas ou Faturadas e Bonificadas não possuem
# possibilidade de reabertura no GRM e devem ser ignoradas pela automação.
"$NODE_BIN" "$PATCH_FATURADAS_V5" "$DST_AGENT"

# A ação Reabrir só pode ser selecionada por atributo ou tooltip EXATO do
# próprio botão. Nunca por texto agregado da barra/overlays.
"$NODE_BIN" "$PATCH_TOOLTIP_V6" "$DST_AGENT"

upsert_env() {
  local key="$1" value="$2"
  if grep -q "^${key}=" "$ENV_FILE"; then
    sed -i "s|^${key}=.*|${key}=${value}|" "$ENV_FILE"
  else
    printf '\n%s=%s\n' "$key" "$value" >> "$ENV_FILE"
  fi
}

# O deploy nunca habilita alteração real sozinho.
upsert_env GRM_REABRIR_OS_DRY_RUN true
upsert_env GRM_REABRIR_OS_PRIORIDADE_MAX 1
upsert_env GRM_REABRIR_OS_ENCADEAR false
upsert_env GRM_REABRIR_OS_DEBUG true

"$NODE_BIN" --check "$DST_AGENT"
"$NODE_BIN" --check "$DST_WORKER"

grep -q "'sync-reabrir-os': 'grm-sync-reabrir-os.js'" "$DST_WORKER" || {
  echo "Worker instalado sem o mapeamento sync-reabrir-os." >&2
  exit 1
}

grep -q "method: 'tooltip-exato'" "$DST_AGENT" || {
  echo "Agente instalado sem a proteção de tooltip exato." >&2
  exit 1
}

chown grao100:grao100 "$ENV_FILE"
chmod 600 "$ENV_FILE"

echo "Deploy concluído em modo seguro (DRY_RUN=true, ENCADEAR=false)."
echo "Proteção financeira aplicada: Faturadas/Faturadas e Bonificadas => IGNORADA; Bonificadas => REVISAO_MANUAL."
echo "Validação pós-reabertura aplicada: reload completo antes de confirmar Abertas."
echo "Diagnóstico ampliado aplicado: todas as opções de Situação/Financeiro serão pesquisadas em dry-run."
echo "Proteção de ação aplicada: Reabrir OS somente por atributo/tooltip EXATO do próprio botão."
echo "Agente: $DST_AGENT"
echo "Worker: $DST_WORKER"
grep '^GRM_REABRIR_OS_' "$ENV_FILE" || true
