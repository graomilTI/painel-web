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
PATCH_POS_CLIQUE_V7="$REPO_ROOT/agentes-grm-sync/patch-reabrir-os-pos-clique-v7.js"
PATCH_CONFIRMACAO_V8="$REPO_ROOT/agentes-grm-sync/patch-reabrir-os-confirmacao-v8.js"
PATCH_MOTIVO_V9="$REPO_ROOT/agentes-grm-sync/patch-reabrir-os-motivo-v9.js"
PATCH_REGRA_V10="$REPO_ROOT/agentes-grm-sync/patch-reabrir-os-regra-v10.js"
PATCH_BUSCA_UNICA_V11="$REPO_ROOT/agentes-grm-sync/patch-reabrir-os-busca-unica-v11.js"
PATCH_WORKER_REAL_V12="$REPO_ROOT/agentes-grm-sync/patch-worker-reabrir-real-v12.js"
DST_AGENT="$GRM_ROOT/grm-sync-reabrir-os.js"
DST_WORKER="$GRM_ROOT/worker/grm-sync-job-worker.js"
ENV_FILE="$GRM_ROOT/.env"

for file in "$SRC_AGENT" "$SRC_WORKER" "$PATCH_FINANCEIRO" "$PATCH_FINANCEIRO_V2" "$PATCH_VALIDACAO_V3" "$PATCH_SITUACAO_V4" "$PATCH_FATURADAS_V5" "$PATCH_TOOLTIP_V6" "$PATCH_POS_CLIQUE_V7" "$PATCH_CONFIRMACAO_V8" "$PATCH_MOTIVO_V9" "$PATCH_REGRA_V10" "$PATCH_BUSCA_UNICA_V11" "$PATCH_WORKER_REAL_V12" "$ENV_FILE"; do
  [[ -f "$file" ]] || { echo "Arquivo obrigatório ausente: $file" >&2; exit 1; }
done

mkdir -p "$GRM_ROOT/worker"

[[ ! -f "$DST_AGENT" ]] || cp -a "$DST_AGENT" "$DST_AGENT.backup-$STAMP"
[[ ! -f "$DST_WORKER" ]] || cp -a "$DST_WORKER" "$DST_WORKER.backup-reabrir-$STAMP"

install -o grao100 -g grao100 -m 750 "$SRC_AGENT" "$DST_AGENT"
install -o grao100 -g grao100 -m 640 "$SRC_WORKER" "$DST_WORKER"

# Proteções financeiras e diagnósticos seguros da base histórica.
"$NODE_BIN" "$PATCH_FINANCEIRO" "$DST_AGENT"
"$NODE_BIN" "$PATCH_FINANCEIRO_V2" "$DST_AGENT"

# Após a ação Reabrir, recarrega a rota do GRM antes de validar Abertas.
"$NODE_BIN" "$PATCH_VALIDACAO_V3" "$DST_AGENT"

# Diagnóstico histórico; a v11 substitui a pré-busca por consulta exclusiva.
"$NODE_BIN" "$PATCH_SITUACAO_V4" "$DST_AGENT"

# Regra financeira histórica; a v11 não pesquisa combinações alternativas.
"$NODE_BIN" "$PATCH_FATURADAS_V5" "$DST_AGENT"

# A ação Reabrir só pode ser selecionada por atributo ou tooltip EXATO do
# próprio botão. Nunca por texto agregado da barra/overlays.
"$NODE_BIN" "$PATCH_TOOLTIP_V6" "$DST_AGENT"

# Na execução real, aciona o mesmo botão DOM identificado e captura feedback/
# respostas HTTP. Se o GRM não efetivar, isola em REVISAO_MANUAL sem repetir.
"$NODE_BIN" "$PATCH_POS_CLIQUE_V7" "$DST_AGENT"

# O GRM confirma a ação com "Deseja realmente abrir a Ordem de Serviço?".
# Reconhece somente esse diálogo e botão afirmativo explícito.
"$NODE_BIN" "$PATCH_CONFIRMACAO_V8" "$DST_AGENT"

# O diálogo exige motivo obrigatório.
"$NODE_BIN" "$PATCH_MOTIVO_V9" "$DST_AGENT"

# Regra do lote: Remanescente > 30 e Dias sem embarque < 10.
"$NODE_BIN" "$PATCH_REGRA_V10" "$DST_AGENT"

# Pré-busca exclusiva: somente Finalizadas / Não Faturadas.
# Se não localizar, encerra o item sem buscar qualquer outra combinação.
"$NODE_BIN" "$PATCH_BUSCA_UNICA_V11" "$DST_AGENT"

# Worker: o .env continua DRY_RUN=true. Apenas jobs explicitamente marcados
# com payload.mode=real recebem --real para o agente de reabertura.
"$NODE_BIN" "$PATCH_WORKER_REAL_V12" "$DST_WORKER"

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
upsert_env GRM_REABRIR_OS_PRIORIDADE_MAX 2
upsert_env GRM_REABRIR_OS_ENCADEAR false
upsert_env GRM_REABRIR_OS_DEBUG true
upsert_env GRM_REABRIR_OS_MOTIVO "Correção de finalização indevida pelo agente automático."

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

grep -q "click_method: 'dom-button-exato'" "$DST_AGENT" || {
  echo "Agente instalado sem o diagnóstico pós-clique v7." >&2
  exit 1
}

grep -q "DESEJA REALMENTE ABRIR A ORDEM DE SERVICO" "$DST_AGENT" || {
  echo "Agente instalado sem suporte à confirmação de abertura v8." >&2
  exit 1
}

grep -q "GRM_REABRIR_OS_MOTIVO" "$DST_AGENT" || {
  echo "Agente instalado sem preenchimento do motivo obrigatório v9." >&2
  exit 1
}

grep -q "FINALIZADAS_NAO_FATURADAS_REMANESCENTE_GT_30_DIAS_SEM_EMBARQUE_LT_10" "$DST_AGENT" || {
  echo "Agente instalado sem a regra oficial de reabertura v10." >&2
  exit 1
}

grep -q "SOMENTE_FINALIZADAS_NAO_FATURADAS_V11" "$DST_AGENT" || {
  echo "Agente instalado sem a busca exclusiva Finalizadas/Não Faturadas v11." >&2
  exit 1
}

grep -q "REABRIR_REAL_POR_PAYLOAD_V12" "$DST_WORKER" || {
  echo "Worker instalado sem autorização REAL por payload v12." >&2
  exit 1
}

chown grao100:grao100 "$ENV_FILE"
chmod 600 "$ENV_FILE"

echo "Deploy concluído em modo seguro (DRY_RUN=true, ENCADEAR=false)."
echo "Proteção de ação aplicada: Reabrir OS somente por atributo/tooltip EXATO do próprio botão."
echo "Pós-clique protegido: clique DOM exato + feedback HTTP/GRM; falha de efetivação => REVISAO_MANUAL."
echo "Confirmação v8 aplicada: diálogo 'Deseja realmente abrir a Ordem de Serviço?' + botão afirmativo seguro."
echo "Motivo v9 aplicado: campo obrigatório preenchido antes de CONFIRMAR."
echo "Regra v10 aplicada: Remanescente > 30,00 + Dias sem embarque < 10."
echo "Busca v11 aplicada: consultar somente Finalizadas / Não Faturadas; ausente => pular sem outras buscas."
echo "Worker v12 aplicado: --real somente quando payload.mode=real; DRY_RUN global permanece true."
echo "Agente: $DST_AGENT"
echo "Worker: $DST_WORKER"
grep '^GRM_REABRIR_OS_' "$ENV_FILE" || true
