#!/bin/bash
# Roda na VPS, a cada minuto, no cron do grao100:
#   * * * * * /home/grao100/painel-scripts/grm-sync/worker/tunel-vigia.sh >> /home/grao100/painel-scripts/grm-sync/logs/tunel-vigia.log 2>&1
#
# Problema que resolve: se a conexão do PC do escritório cai de repente (ex.: o Wi-Fi renegocia o link), o sshd da VPS não
# percebe e deixa a sessão do túnel "viva" segurando a porta 47213 sem ninguém do outro lado. O PC então não consegue
# reabrir o túnel ("remote port forwarding failed for listen port 47213") e os agentes ficam sem rota. Aqui testamos a
# porta com o host especial saude.tunel (o proxy do PC responde 200 sem sair para a internet); se ela escuta mas não
# responde LIMITE vezes seguidas, derrubamos a(s) sessão(ões) do túnel e o PC reconecta sozinho em até ~1 min.
#
# Pontos que já deram errado (15/10/2026) e por que o script é como é:
#   * O cron tem PATH mínimo (/usr/bin:/bin) e `ss` fica em /usr/sbin: sem o PATH abaixo o script achava que NÃO havia
#     listener e saía em silêncio — nunca derrubou nada.
#   * O sshd tira a permissão de leitura de /proc do próprio processo: `ss -p` e /proc/<pid>/fd NÃO mostram quem segura a
#     porta. A sessão do túnel (ssh -N, sem comando) é identificada pelo nome do processo: "sshd: <usuario>" sem o
#     sufixo "@notty"/"@pts" (as sessões de comando, como as do deploy, têm sufixo e não são tocadas).
#
# Variáveis só para teste: TUNEL_PORTA (47213), TUNEL_ESTADO, TUNEL_FALHAS_LIMITE (2), TUNEL_PIDS_TESTE (pids a derrubar).
export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
PORTA="${TUNEL_PORTA:-47213}"
ESTADO="${TUNEL_ESTADO:-/home/grao100/tmp/tunel-vigia.falhas}"
LIMITE="${TUNEL_FALHAS_LIMITE:-2}"
USUARIO="$(id -un)"
agora() { date -u +%FT%TZ; }

# sem listener = sem túnel (o PC reconecta sozinho); nada a derrubar
if ! ss -ltn "sport = :$PORTA" 2>/dev/null | grep -q LISTEN; then rm -f "$ESTADO"; exit 0; fi

resp=$( ( exec 3<>/dev/tcp/127.0.0.1/$PORTA && printf 'CONNECT saude.tunel:443 HTTP/1.1\r\n\r\n' >&3 && timeout 5 head -n1 <&3 ) 2>/dev/null )
case "$resp" in *" 200 "*) rm -f "$ESTADO"; exit 0 ;; esac

n=$(( $(cat "$ESTADO" 2>/dev/null || echo 0) + 1 ))
echo "$n" > "$ESTADO"
echo "$(agora) túnel escutando mas sem resposta ($n/$LIMITE)"
if [ "$n" -ge "$LIMITE" ]; then
  if [ -n "$TUNEL_PIDS_TESTE" ]; then pids="$TUNEL_PIDS_TESTE"
  else pids=$(ps -u "$USUARIO" -o pid=,cmd= | awk -v u="$USUARIO" '$2=="sshd:" && $3==u && NF==3 {print $1}'); fi
  if [ -n "$pids" ]; then
    for p in $pids; do
      echo "$(agora) derrubando sessão do túnel pendurada (pid $p, $(ps -o etimes= -p "$p" 2>/dev/null | tr -d ' ')s) para o PC reconectar"
      kill -TERM "$p" 2>/dev/null
    done
  else
    echo "$(agora) nenhuma sessão de túnel encontrada para derrubar (nome 'sshd: $USUARIO' sem sufixo)"
  fi
  rm -f "$ESTADO"
fi
