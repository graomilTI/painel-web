#!/usr/bin/env bash
# Compara a tela de Manutenção (Corretiva) de uma versão de referência com a pasta atual, no navegador.
# Uso (na raiz do repositório):  bash tests/harness/manutencao/comparar.sh [ref-git]     (padrão: HEAD)
# Sobe dois servidores: 8766 = antes (a referência) e 8765 = depois (a pasta atual). Abra a URL impressa; o título da aba vira
# IGUAL ou DIFERENTE. Ctrl+C encerra os servidores.
set -euo pipefail
ref="${1:-HEAD}"
base="$(mktemp -d)"
git archive "$ref" assets | tar -x -C "$base"
mkdir -p "$base/tests/harness"
cp -r tests/harness/manutencao "$base/tests/harness/"
trap 'kill 0' EXIT
(cd "$base" && python -m http.server 8766 >/dev/null 2>&1) &
python -m http.server 8765 >/dev/null 2>&1 &
echo "Referência: $ref (em $base)"
echo "Abra: http://localhost:8765/tests/harness/manutencao/comparar.html?a=http://localhost:8766&b=http://localhost:8765"
wait
