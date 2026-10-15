#!/bin/bash
# Roda na VPS, a cada minuto, no cron do grao100:
#   * * * * * /home/grao100/painel-scripts/grm-sync/worker/tunel-vigia.sh >> /home/grao100/painel-scripts/grm-sync/logs/tunel-vigia.log 2>&1
#
# Problema que resolve: se a internet do PC do escritório cai de repente, o sshd da VPS não percebe e deixa a porta
# 47213 "escutando" sem ninguém do outro lado. O PC então não consegue reabrir o túnel (porta ocupada) e os agentes
# ficam sem rota. Aqui testamos a porta com o host especial saude.tunel (o proxy do PC responde 200 sem sair para a
# internet); se ela escuta mas não responde 3 minutos seguidos, derrubamos o sshd pendurado e o PC reconecta sozinho.
PORTA=47213
ESTADO=/home/grao100/tmp/tunel-vigia.falhas

# sem listener = sem túnel (o PC reconecta sozinho); nada a derrubar
if ! ss -ltn "sport = :$PORTA" 2>/dev/null | grep -q LISTEN; then rm -f "$ESTADO"; exit 0; fi

resp=$( ( exec 3<>/dev/tcp/127.0.0.1/$PORTA && printf 'CONNECT saude.tunel:443 HTTP/1.1\r\n\r\n' >&3 && timeout 5 head -n1 <&3 ) 2>/dev/null )
case "$resp" in *" 200 "*) rm -f "$ESTADO"; exit 0 ;; esac

n=$(( $(cat "$ESTADO" 2>/dev/null || echo 0) + 1 ))
echo "$n" > "$ESTADO"
echo "$(date -u +%FT%TZ) túnel escutando mas sem resposta ($n/3)"
if [ "$n" -ge 3 ]; then
  pid=$(ss -ltnp "sport = :$PORTA" 2>/dev/null | grep -o 'pid=[0-9]*' | head -1 | cut -d= -f2)
  if [ -n "$pid" ]; then
    echo "$(date -u +%FT%TZ) derrubando sshd pendurado (pid $pid) para o PC reconectar"
    kill "$pid"
  fi
  rm -f "$ESTADO"
fi
