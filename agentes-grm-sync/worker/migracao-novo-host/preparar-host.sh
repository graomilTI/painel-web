#!/usr/bin/env bash
# Prepara uma VPS AlmaLinux/Rocky 8 ou 9 (x86_64) para rodar o worker dos agentes GRM,
# no mesmo desenho do servidor atual (usuário grao100, Node 22 em /opt/node22, Chrome para o Puppeteer).
# Rode como root, UMA vez, na VPS nova:   bash preparar-host.sh "<chave pública SSH do deploy>"
# O argumento é a chave pública que o usuário grao100 vai aceitar (a de deploy: ssh-keygen -y -f ~/.ssh/grao100_grm_deploy_ed25519).
# Não copia scripts nem .env — isso é o passo 2 do README (só depois do teste do curl dar 401).
set -euo pipefail

NODE_VER="22.23.1"          # igual ao do servidor atual (/opt/node-v22.23.1)
PUBKEY_GRAO100="${1:-}"

[ "$(id -u)" = 0 ] || { echo "ERRO: rode como root." >&2; exit 1; }
[ "$(uname -m)" = "x86_64" ] || { echo "ERRO: precisa ser x86_64 (o Chrome do Puppeteer usado aqui não é ARM)." >&2; exit 1; }
[ -n "$PUBKEY_GRAO100" ] || { echo "ERRO: passe a chave pública do deploy como 1º argumento." >&2; exit 1; }

echo "== fuso horário =="
timedatectl set-timezone America/Sao_Paulo

echo "== pacotes (libs do Chrome, cron, ferramentas) =="
dnf -y install --setopt=install_weak_deps=False \
  cronie util-linux rsync tar xz curl git unzip \
  alsa-lib atk at-spi2-atk at-spi2-core cups-libs dbus-libs glib2 libdrm libxkbcommon \
  libXcomposite libXdamage libXrandr libXext libXfixes libXrender libX11 libxcb libXScrnSaver \
  mesa-libgbm nss nspr pango cairo fontconfig freetype fribidi gtk3 \
  liberation-fonts dejavu-sans-fonts
systemctl enable --now crond

echo "== swap de 4 GB (picos de Chrome) =="
if ! swapon --show | grep -q .; then
  fallocate -l 4G /swapfile && chmod 600 /swapfile && mkswap /swapfile >/dev/null && swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

echo "== usuário grao100 e diretórios =="
id grao100 >/dev/null 2>&1 || useradd -m -s /bin/bash grao100
install -d -o grao100 -g grao100 -m 755 /home/grao100/tmp /home/grao100/bin /home/grao100/chrome-runtime \
  /home/grao100/painel-scripts /home/grao100/painel-scripts/grm-sync
install -d -o grao100 -g grao100 -m 700 /home/grao100/.ssh
grep -qF "$PUBKEY_GRAO100" /home/grao100/.ssh/authorized_keys 2>/dev/null || echo "$PUBKEY_GRAO100" >> /home/grao100/.ssh/authorized_keys
chown grao100:grao100 /home/grao100/.ssh/authorized_keys && chmod 600 /home/grao100/.ssh/authorized_keys

echo "== Node ${NODE_VER} em /opt/node22 (com conferência de checksum) =="
if [ ! -x /opt/node22/bin/node ]; then
  cd /tmp
  curl -fsSLO "https://nodejs.org/dist/v${NODE_VER}/node-v${NODE_VER}-linux-x64.tar.xz"
  curl -fsSLO "https://nodejs.org/dist/v${NODE_VER}/SHASUMS256.txt"
  grep " node-v${NODE_VER}-linux-x64.tar.xz\$" SHASUMS256.txt | sha256sum -c -
  tar -xJf "node-v${NODE_VER}-linux-x64.tar.xz" -C /opt
  ln -sfn "/opt/node-v${NODE_VER}" /opt/node22
  rm -f "node-v${NODE_VER}-linux-x64.tar.xz" SHASUMS256.txt
fi
ln -sf /opt/node22/bin/node /home/grao100/bin/node
ln -sf /opt/node22/bin/npm  /home/grao100/bin/npm
chown -h grao100:grao100 /home/grao100/bin/node /home/grao100/bin/npm
/opt/node22/bin/node -v

echo "== SSH: só chave (a de root que você colou no provedor continua valendo) =="
for opt in "PasswordAuthentication no" "KbdInteractiveAuthentication no" "PermitRootLogin prohibit-password"; do
  key="${opt%% *}"
  if grep -qE "^\s*#?\s*${key}\b" /etc/ssh/sshd_config; then
    sed -i -E "s|^\s*#?\s*${key}\b.*|${opt}|" /etc/ssh/sshd_config
  else
    echo "$opt" >> /etc/ssh/sshd_config
  fi
done
sshd -t && systemctl reload sshd

echo
echo "Pronto. Próximo passo (README, passo 1): testar a Cloudflare do GRM A PARTIR DESTA VPS:"
echo "  curl -s -o /dev/null -w '%{http_code}\n' -X POST -H 'content-type: application/json' -d '{}' https://www.grmserver.com.br/api/oFlow/list"
echo "  401 = a Cloudflare aceita este IP (pode migrar) | 403 = bloqueia também (NÃO migre)."
