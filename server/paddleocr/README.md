# Worker local PaddleOCR — Logística

Este worker processa os relatórios da tela **Logística > O.S. > Conferências** sem cobrança por página e sem enviar documentos para serviços externos de OCR.

## Arquitetura

1. A Edge Function `ocr-documento-local` grava um job em `logistica_ocr_jobs`.
2. O serviço no VPS reserva o próximo job com `claim_logistica_ocr_job()`.
3. PDFs são renderizados página por página e analisados pelo PaddleOCR.
4. O worker identifica placa, carga/romaneio/ticket, peso e NF.
5. A tela consulta o progresso e apresenta a comparação com as cargas da O.S.

## Instalação no AlmaLinux 8

Depois de aplicar a migration e atualizar esta pasta no servidor:

```bash
cd /caminho/do/painel-web/server/paddleocr
bash install-almalinux8.sh
```

Edite o arquivo:

```bash
nano /etc/grao1000/paddleocr-worker.env
```

Preencha `SUPABASE_SERVICE_ROLE_KEY`. Essa chave fica **somente no VPS**, com permissão `600`; nunca deve ser colocada no navegador ou versionada.

Ative o serviço:

```bash
systemctl enable --now grao1000-paddleocr
journalctl -u grao1000-paddleocr -f
```

## Comandos úteis

```bash
systemctl status grao1000-paddleocr
systemctl restart grao1000-paddleocr
journalctl -u grao1000-paddleocr --since "30 minutes ago"
```

Na primeira inicialização, os modelos são baixados e o início demora mais. As execuções seguintes reutilizam o cache do usuário `grao100`.

## Ajustes de desempenho

- `OCR_RENDER_DPI=180`: aumente para `220` em documentos pequenos ou desfocados.
- `OMP_NUM_THREADS=2`: limite de threads para não prejudicar os demais agentes do VPS.
- `PADDLE_OCR_DOC_ORIENTATION=true`: habilite se os relatórios chegarem frequentemente girados.
- `OCR_MAX_PAGES=200`: proteção contra PDFs muito grandes.
