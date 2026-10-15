# Migração do worker dos agentes GRM para outro host

Motivo (15/10/2026): a Cloudflare do GRM passou a barrar `POST /api/*` vindo da VPS atual (Contabo, St. Louis/EUA, `144.126.131.137`),
enquanto o IP da empresa (Cascavel/PR) passa. O worker é portátil: tudo vive em `/home/grao100/painel-scripts/grm-sync` + Node 22 +
Chrome, e a fila está no Supabase (`claim_next_grm_sync_job`), então qualquer host Linux x86_64 numa rede aceita pela Cloudflare serve.
O token do dia enviado pelo painel (`grm_token_entregas`) funciona de qualquer host.

Fica na VPS antiga (não migra): `email-worker`, `uber-sftp-sync`.

## Passo 0 — criar a VPS (usuário)
Brasil (São Paulo), **x86_64**, AlmaLinux 8 ou 9 (ou Rocky), 4 vCPU / 8 GB RAM / 80 GB SSD, IPv4 público, com a chave pública da migração
(`~/.ssh/grao1000_vps_br_ed25519.pub`) cadastrada para o root.

## Passo 1 — preparar e testar o portão
```bash
scp -i ~/.ssh/grao1000_vps_br_ed25519 preparar-host.sh root@IP_NOVA:/root/
PUB=$(ssh-keygen -y -f ~/.ssh/grao100_grm_deploy_ed25519)
ssh -i ~/.ssh/grao1000_vps_br_ed25519 root@IP_NOVA "bash /root/preparar-host.sh '$PUB'"
ssh -i ~/.ssh/grao1000_vps_br_ed25519 root@IP_NOVA "curl -s -o /dev/null -w '%{http_code}\n' -X POST -H 'content-type: application/json' -d '{}' https://www.grmserver.com.br/api/oFlow/list"
```
**401 = segue. 403 = a Cloudflare barra esta VPS também: pare, apague a VPS e use uma máquina na rede da empresa.**
(O teste não leva token nem credencial.)

## Passo 2 — copiar scripts, `.env`, Chrome (só depois do 401)
Os dados passam pelo PC por um pipe (nada fica gravado nele).
```bash
OLD="ssh -i ~/.ssh/grao100_grm_deploy_ed25519 grao100@server.grao1000.com.br"
NEW="ssh -i ~/.ssh/grao1000_vps_br_ed25519 root@IP_NOVA"
$OLD "cd /home/grao100/painel-scripts && tar czf - --exclude='grm-sync/logs' --exclude='grm-sync/backups' --exclude='grm-sync/archive' --exclude='grm-sync/debug-*' --exclude='*.bak-*' grm-sync" \
  | $NEW "tar xzf - -C /home/grao100/painel-scripts"
$OLD "cd /home/grao100 && tar czf - chrome-for-testing .cache/puppeteer" | $NEW "tar xzf - -C /home/grao100"
$NEW "install -d /home/grao100/painel-scripts/grm-sync/logs && chown -R grao100:grao100 /home/grao100"
$NEW "ldd /home/grao100/chrome-for-testing/chrome-linux64/chrome | grep -c 'not found'"     # tem que ser 0
```

## Passo 3 — teste manual ANTES de ligar o cron
Como `grao100` na VPS nova, em `/home/grao100/painel-scripts/grm-sync`:
```bash
/opt/node22/bin/node -e "require('dotenv').config(); require('./grm-token-cache').sondarRede().then(console.log)"   # liberada
/opt/node22/bin/node worker/grm-sync-job-worker.js --once --lane=saida_logistica --worker-id=teste-novo-host
```
Com o token do dia já enviado pelo painel (ou pendente em `grm_token_entregas`), o agente `aplicar-distribuicao-os` deve terminar em sucesso.

## Passo 4 — virada (primeiro desliga a antiga, depois liga a nova; só UM scheduler pode existir)
```bash
# VPS antiga: comenta TODAS as linhas do grm-sync (guarda cópia) e remove a flag da V2
$OLD 'crontab -l > ~/crontab.bak-20261015 && crontab -l | sed -E "/painel-scripts\/grm-sync/ s/^/#MIGRADO /" | crontab - && mv ~/painel-scripts/grm-sync/.grm-sync-v2-enabled ~/painel-scripts/grm-sync/.grm-sync-v2-enabled.migrado'
# VPS nova: instala as mesmas linhas (inclui SHELL="/bin/bash") e cria a flag
(echo 'SHELL="/bin/bash"'; $OLD 'cat ~/crontab.bak-20261015' | grep -v '^#' | grep 'painel-scripts/grm-sync') | $NEW "su - grao100 -c 'crontab -'"
$NEW "su - grao100 -c 'touch /home/grao100/painel-scripts/grm-sync/.grm-sync-v2-enabled'"
```

## Passo 5 — conferência (30 min) e rollback
- `grm_sync_jobs`: jobs novos em `sucesso`; olhar principalmente `sync-btg-*`, `botconversa-sync`, `sync-uber-geocodificar` (algum terceiro pode filtrar o IP antigo).
- O alerta de WhatsApp manda "voltaram a rodar" sozinho.
- Rollback: `crontab ~/crontab.bak-20261015` na antiga e `mv` da flag de volta; apagar o cron da nova.
- Depois: atualizar `agentes-grm-sync/README.md` (host do deploy) e a memória `reference_grm_sync_deploy` com o novo host/chave.
