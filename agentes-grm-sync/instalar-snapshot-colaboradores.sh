#!/bin/bash
set -euo pipefail

BASE_DIR="/home/grao100/painel-scripts/grm-sync"
WORKER="$BASE_DIR/worker/grm-sync-job-worker.js"
SNAPSHOT="$BASE_DIR/grmserver-colaboradores-sync-snapshot.js"
NODE_BIN="/home/grao100/bin/node"

echo "===== INSTALAÇÃO SNAPSHOT DE COLABORADORES ====="

if [ ! -d "$BASE_DIR" ]; then
  echo "ERRO: diretório não encontrado: $BASE_DIR"
  exit 1
fi

if [ ! -f "$WORKER" ]; then
  echo "ERRO: worker não encontrado: $WORKER"
  exit 1
fi

if [ ! -f "$SNAPSHOT" ]; then
  echo "ERRO: arquivo não encontrado: $SNAPSHOT"
  echo "Faça o upload deste instalador e do grmserver-colaboradores-sync-snapshot.js"
  echo "diretamente em $BASE_DIR"
  exit 1
fi

if [ ! -f "$BASE_DIR/grmserver-colaboradores-sync.js" ]; then
  echo "ERRO: sincronizador base não encontrado."
  exit 1
fi

BACKUP="$WORKER.bak-$(date +%Y%m%d-%H%M%S)"
cp "$WORKER" "$BACKUP"
echo "Backup criado: $BACKUP"

sed -i -E \
  "s|'sync-colaboradores':[[:space:]]*'grmserver-colaboradores-sync[^']*\.js'|'sync-colaboradores': 'grmserver-colaboradores-sync-snapshot.js'|" \
  "$WORKER"

echo
echo "===== CONFIGURAÇÃO ATUAL ====="
grep -n "'sync-colaboradores'" "$WORKER"

if ! grep -q "'sync-colaboradores': 'grmserver-colaboradores-sync-snapshot.js'" "$WORKER"; then
  echo "ERRO: não foi possível atualizar automaticamente o worker."
  echo "Backup disponível em: $BACKUP"
  exit 1
fi

chmod 750 "$SNAPSHOT"

echo
echo "===== VALIDAÇÃO DE SINTAXE ====="
"$NODE_BIN" --check "$SNAPSHOT"
"$NODE_BIN" --check "$WORKER"

echo
echo "Instalação concluída."
echo "Agora crie um novo job sync-colaboradores no Supabase."
