#!/bin/bash
# Central de E-mails - executor do worker (v3)
#
# IMPORTANTE: este script NAO define mais credenciais aqui dentro.
# Toda a configuracao vem exclusivamente do arquivo .env que fica na
# mesma pasta (o worker carrega via dotenv). Antes, este arquivo
# exportava um SUPABASE_URL antigo por cima do .env e isso derrubou a
# sincronizacao inteira quando o projeto antigo foi desativado.
#
# Para alterar configuracoes: edite o arquivo .env - nunca este script.

cd "$(dirname "$0")" || exit 1

NODE_BIN="/usr/nodejs/node-v14.9.0/bin/node"
[ -x "$NODE_BIN" ] || NODE_BIN="$(command -v node)"

# Trava de execucao: se o ciclo anterior ainda estiver rodando (caixa com muitos
# e-mails atrasados, por exemplo), o cron nao inicia um segundo processo por cima.
exec flock -n /tmp/email-worker.lock "$NODE_BIN" worker.bundle.cjs --once
