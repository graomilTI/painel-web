#!/usr/bin/env bash
set -Eeuo pipefail

APP_USER="${APP_USER:-grao100}"
APP_GROUP="${APP_GROUP:-grao100}"
APP_HOME="${APP_HOME:-/home/grao100}"
APP_DIR="${APP_DIR:-/home/grao100/paddleocr-worker}"
ENV_DIR="${ENV_DIR:-/etc/grao1000}"
SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ $EUID -ne 0 ]]; then
  echo "Execute como root." >&2
  exit 1
fi

# Bibliotecas usadas pelo Paddle/OpenCV em ambiente sem desktop.
dnf install -y libgomp glib2 mesa-libGL fontconfig curl || true

if ! command -v python3.11 >/dev/null 2>&1; then
  dnf install -y python3.11 python3.11-pip || true
fi

PYTHON_BIN=""
for candidate in python3.11 python3.10 python3.9 python3; do
  if command -v "$candidate" >/dev/null 2>&1; then
    if "$candidate" - <<'PY' >/dev/null 2>&1
import sys
raise SystemExit(0 if sys.version_info >= (3, 9) else 1)
PY
    then
      PYTHON_BIN="$(command -v "$candidate")"
      break
    fi
  fi
done

if [[ -z "$PYTHON_BIN" ]]; then
  echo "Python 3.9 ou superior não encontrado. Instale Python 3.11 e execute novamente." >&2
  exit 1
fi

install -d -o "$APP_USER" -g "$APP_GROUP" "$APP_HOME/.cache" "$APP_DIR"
install -m 0644 -o "$APP_USER" -g "$APP_GROUP" "$SOURCE_DIR/logistica_ocr_worker.py" "$APP_DIR/logistica_ocr_worker.py"
install -m 0644 -o "$APP_USER" -g "$APP_GROUP" "$SOURCE_DIR/requirements.txt" "$APP_DIR/requirements.txt"

if [[ ! -d "$APP_DIR/.venv" ]]; then
  runuser -u "$APP_USER" -- "$PYTHON_BIN" -m venv "$APP_DIR/.venv"
fi

runuser -u "$APP_USER" -- "$APP_DIR/.venv/bin/python" -m pip install --upgrade pip setuptools wheel
runuser -u "$APP_USER" -- "$APP_DIR/.venv/bin/python" -m pip install \
  paddlepaddle==3.2.0 \
  -i https://www.paddlepaddle.org.cn/packages/stable/cpu/
runuser -u "$APP_USER" -- "$APP_DIR/.venv/bin/python" -m pip install -r "$APP_DIR/requirements.txt"

install -d -m 0750 "$ENV_DIR"
if [[ ! -f "$ENV_DIR/paddleocr-worker.env" ]]; then
  install -m 0600 "$SOURCE_DIR/paddleocr-worker.env.example" "$ENV_DIR/paddleocr-worker.env"
  echo "Arquivo criado: $ENV_DIR/paddleocr-worker.env"
  echo "Preencha SUPABASE_SERVICE_ROLE_KEY antes de iniciar o serviço."
else
  chmod 600 "$ENV_DIR/paddleocr-worker.env"
fi

install -m 0644 "$SOURCE_DIR/grao1000-paddleocr.service" /etc/systemd/system/grao1000-paddleocr.service
systemctl daemon-reload

cat <<EOF

Instalação concluída.

1. Edite o secret local:
   nano $ENV_DIR/paddleocr-worker.env

2. Teste o carregamento dos modelos:
   cd $APP_DIR
   runuser -u $APP_USER -- env \
     HOME=$APP_HOME \
     XDG_CACHE_HOME=$APP_HOME/.cache \
     $APP_DIR/.venv/bin/python -c 'from paddleocr import PaddleOCR; PaddleOCR(lang="pt", ocr_version="PP-OCRv5", use_doc_orientation_classify=False, use_doc_unwarping=False, use_textline_orientation=False, device="cpu"); print("PaddleOCR OK")'

3. Ative o worker:
   systemctl enable --now grao1000-paddleocr

4. Acompanhe:
   journalctl -u grao1000-paddleocr -f
EOF
