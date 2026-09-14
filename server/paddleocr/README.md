# Worker local PaddleOCR — Logística

Este worker processa os relatórios da tela **Logística > O.S. > Conferências** sem cobrança por página e sem enviar documentos para serviços externos de OCR.

## Arquitetura

1. A Edge Function `ocr-documento-local` grava um job em `logistica_ocr_jobs`.
2. O serviço no VPS reserva o próximo job com `claim_logistica_ocr_job()`.
3. Cada tipo de anexo usa a ferramenta certa, sem forçar tudo pelo OCR:
   - **PDF com texto nativo** (gerado digitalmente, não escaneado): texto lido direto pelo PyMuPDF, sem renderizar imagem nem gastar OCR — muito mais rápido e sem limite prático de páginas.
   - **PDF escaneado/fotografado, JPG, PNG, GIF, WEBP**: renderizado página por página e lido pelo PaddleOCR.
   - **XLSX, XLS, CSV**: lido direto célula a célula (openpyxl/xlrd/csv), sem OCR.
   - **DOCX**: parágrafos e tabelas lidos direto (python-docx), sem OCR. `.doc` (Word 97-2003, formato binário antigo) não é suportado — peça pra reenviarem como `.docx` ou PDF.
4. O worker identifica placa, carga/romaneio/ticket, peso e NF.
5. A tela consulta o progresso e apresenta a comparação com as cargas da O.S.

Reenviar um novo anexo para a mesma O.S. sempre gera um job novo (a URL de
upload é única por envio — `assets/js/laudoUpload.js`); um job antigo com
status `ERRO` nunca é reaproveitado (ver dedup em
`supabase/functions/ocr-documento-local/index.ts`).

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
- `OCR_MAX_PAGES=200`: limite de páginas que **exigem OCR** de fato (PDF escaneado/imagem) — não conta página de PDF com texto nativo.
- `OCR_MAX_TOTAL_PAGES=3000`: limite bruto de páginas do PDF, independente do método de leitura (proteção contra arquivo absurdo).

## Atualizando o worker (depois de mudar `logistica_ocr_worker.py`)

```bash
cd /caminho/do/painel-web && git pull   # ou copie a pasta server/paddleocr atualizada
cd server/paddleocr
pip install -r requirements.txt        # pega libs novas (openpyxl/xlrd/python-docx)
sudo systemctl restart grao1000-paddleocr
journalctl -u grao1000-paddleocr -f    # confirma que subiu sem erro
```

Os `patch_paddleocr_worker_v1_*.py` desta pasta foram hotfixes pontuais
aplicados direto no arquivo do VPS no passado — para uma mudança deste
tamanho, substitua o arquivo inteiro (`git pull`/cópia) em vez de escrever
mais um patch incremental.
