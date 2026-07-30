# Agente de lançamento de Notas Fiscais no GRM

## O que foi implementado

O agente lê a fila de notas enviadas pela página **Enviar Notas Fiscais** do painel-web (upload direto, sem Google Drive), extrai os dados de cada uma e abre **Financeiro → Contas a Pagar → Nova Conta** em:

`https://www.grmserver.com.br/finance/payInvoice`

Ele preenche os campos vistos nas telas do GRM:

- Empresa (decidida pelo CNPJ/CPF do destinatário lido da própria nota);
- Identificação;
- Data da Conta;
- Tipo Favorecido e Fornecedor;
- Grupo de Categoria e Categoria;
- Data de Vencimento;
- Valor Total;
- Intervalo de Cobrança e quantidade de parcelas, quando configurados;
- Tipo e número do documento;
- Forma de Pagamento;
- Descrição;
- Rateio por Coordenação, com `GERAL` como padrão;
- anexo do documento original.

## Proteções

- começa em `dry-run`;
- nunca salva uma nota com campo obrigatório faltando;
- categoria e grupo precisam corresponder exatamente ao texto do GRM;
- trava duplicidade por `CNPJ + número + data + valor` (fingerprint);
- registra toda execução no Supabase;
- devolve código de saída diferente de zero quando houver erro técnico;
- salva screenshot e HTML em caso de falha;
- processa no máximo 1 arquivo inicialmente; depois pode subir para 5.

## Origem dos arquivos: upload no painel, não Google Drive

A versão original deste pacote lia de uma pasta do Google Drive, o que exigia criar uma conta de serviço Google só pra isso. Trocado por um upload direto no painel-web: a página **Enviar Notas Fiscais** (`upload-notas-fiscais.html`, menu "NOTAS FISCAIS") sobe o arquivo pro bucket `notas-fiscais` do Supabase Storage e cria a linha correspondente em `grm_nf_lancamentos` com `status = 'NOVO'`. O agente só lê essa fila — não precisa de Google Cloud, Drive API nem service account.

## Prioridade de leitura

1. XML da NF-e;
2. texto interno do PDF usando `pdftotext`;
3. OCR do PDF/imagem via **Groq** (mesmo provedor da edge function `ocr-comprovante`, que já lê CNPJ/valor/data de comprovantes financeiros) — não usa Google Cloud Vision. Basta a `GROQ_API_KEY` já usada em outros pontos do projeto (edge function `ocr-comprovante`, `email-worker`).

## Dependência do servidor

No AlmaLinux 8:

```bash
sudo dnf install -y poppler-utils
```

Não há nova dependência NPM. O agente utiliza os pacotes que já existem no projeto: `dotenv`, `@supabase/supabase-js`, `puppeteer-extra` e `puppeteer-extra-plugin-stealth`.

## Arquivos do pacote

```text
grm-sync-lancar-notas-fiscais.js
patch-grm-lancar-notas-fiscais.js
env-grm-lancar-notas-fiscais.example
config/grm-lancar-notas-fiscais.json
sql/20260730010000_grm_nf_lancamentos.sql
```

No repositório painel-web, além disso: `upload-notas-fiscais.html` e `assets/js/upload-notas-fiscais.js` (a página de envio) — esses fazem parte do deploy normal do site (GitHub Pages), não precisam ir pro servidor de scripts.

## 1. Instalação

Copie os arquivos para:

```text
/home/grao100/painel-scripts/grm-sync
```

Mantenha a estrutura `config/` e `sql/`.

```bash
cd /home/grao100/painel-scripts/grm-sync

chown -R grao100:grao100 \
  grm-sync-lancar-notas-fiscais.js \
  patch-grm-lancar-notas-fiscais.js \
  config/grm-lancar-notas-fiscais.json

chmod 750 \
  grm-sync-lancar-notas-fiscais.js \
  patch-grm-lancar-notas-fiscais.js
```

## 2. Banco Supabase

Execute no SQL Editor:

```text
sql/20260730010000_grm_nf_lancamentos.sql
```

As tabelas criadas são:

- `grm_nf_lancamentos` — inclui `storage_bucket`, `storage_path`, `setor` e `enviado_por` (quem subiu o arquivo pela página do painel), além da policy de INSERT que permite o próprio usuário autenticado criar a linha ao enviar.
- `grm_nf_lancamento_execucoes`.

## 3. Configurar categorias

`config/grm-lancar-notas-fiscais.json` já vem preenchido com os textos reais conferidos ao vivo no GRM (Contas a Pagar → filtro Grupo de Categoria/Categoria) em 30/07/2026:

| Setor (escolhido no upload) | Grupo de Categoria | Categoria |
|---|---|---|
| `HOSPEDAGEM` | DESPESAS OPERACIONAIS | HOSPEDAGEM |
| `FROTAS` (padrão) | DESPESAS COM VEICULOS | *(definida por palavra-chave)* |
| palavra-chave PNEU/PNEUS | DESPESAS COM VEICULOS | PNEUS AQUISICAO |
| palavra-chave GASOLINA/ETANOL/DIESEL/COMBUSTÍVEL | COMBUSTIVEIS E LUBRIFICANTES | COMBUSTIVEL |
| `RH` (padrão) | DESPESAS RH | *(definida por palavra-chave)* |
| palavra-chave UNIFORME/CRACHÁ | DESPESAS RH | UNIFORME/CRACHA |
| palavra-chave SOFTWARE/SISTEMA/LICENÇA/ASSINATURA | DESPESAS ADMINISTRATIVAS | SOFTWARE/SISTEMA |
| palavra-chave INTERNET/TELEFONIA | DESPESAS ADMINISTRATIVAS | INTERNET/TELEFONE |
| palavra-chave ENERGIA ELÉTRICA | DESPESAS ADMINISTRATIVAS | ENERGIA ELETRICA |
| palavra-chave MATERIAL DE EXPEDIENTE/PAPELARIA | DESPESAS ADMINISTRATIVAS | MATERIAL EXPEDIENTE |

**Atenção:** o GRM não tem categorias separadas "UNIFORME" e "CRACHA" — existe só uma categoria combinada `UNIFORME/CRACHA`.

As 4 palavras-chave de despesas administrativas vieram da mineração do extrato completo "Lista de Rateios" do GRM (5.352 lançamentos históricos) — são os padrões mais recorrentes de despesas que não são veículo, hospedagem nem RH.

**Setor `COMPRAS` continua sem um Grupo/Categoria único de propósito.** Não tem um padrão fixo no GRM — pode cair em DESPESAS ADMINISTRATIVAS (a maioria) ou em PATRIMONIO (equipamento/imobilizado acima de R$500, ex.: `IMOBILIZADO (MAIOR QUE 500,00)`) dependendo do item e do valor, e essa distinção por valor não dá pra automatizar com segurança. Notas que baterem em uma das palavras-chave acima são classificadas automaticamente; as demais ficam em `AGUARDANDO_CLASSIFICACAO` até revisão manual.

O agente não tenta adivinhar grupo contábil. Sem preenchimento, a nota fica como `AGUARDANDO_CLASSIFICACAO` e não é lançada.

### Empresa (CNPJ/CPF lido de cada nota — não é fixo)

O GRM tem **6 empresas cadastradas** em Contas a Pagar → Nova Conta → Empresa: `GRAOMIL LTDA`, `BV GRAIN`, `EXCELENCIA`, `CAR1000`, `ELIZEU MOTA`, `DOUGLAS HENRIQUE MOTA 09987821901`. O agente decide qual delas usar pelo **CNPJ/CPF do destinatário lido do próprio arquivo** (tag `dest` do XML da NF-e, ou o CNPJ/CPF encontrado no texto do PDF/imagem que bate com um dos cadastrados) — nunca por um valor fixo.

Já configurado em `config/grm-lancar-notas-fiscais.json` → `empresas`, com os 6 documentos preenchidos. Se uma nota trouxer um CNPJ/CPF de destinatário que não bater com nenhuma das 6 entradas, ela fica em `AGUARDANDO_DADOS` (campo `empresa` ausente) em vez de cair na empresa errada — sinal de uma 7ª empresa nova, ou de documento ilegível.

## 4. Adicionar variáveis ao `.env`

Copie as linhas de:

```text
env-grm-lancar-notas-fiscais.example
```

Preencha `GROQ_API_KEY` com o mesmo valor já usado pela edge function `ocr-comprovante` (Supabase → Edge Functions → Secrets) ou pelo `email-worker` — é só pro fallback de OCR de imagem/PDF escaneado; XML e PDF com texto embutido funcionam sem ela.

Mantenha inicialmente:

```dotenv
GRM_LANCAR_NF_AGENDAR=false
GRM_LANCAR_NF_DRY_RUN=true
GRM_LANCAR_NF_MAX_POR_EXECUCAO=1
```

## 5. Integrar ao worker e scheduler

```bash
cd /home/grao100/painel-scripts/grm-sync

/home/grao100/bin/node \
  patch-grm-lancar-notas-fiscais.js \
  /home/grao100/painel-scripts/grm-sync
```

O patch adiciona:

```text
sync-lancar-notas-fiscais → grm-sync-lancar-notas-fiscais.js
```

O scheduler só agenda o agente quando `GRM_LANCAR_NF_AGENDAR=true`.

## 6. Validar sintaxe

```bash
cd /home/grao100/painel-scripts/grm-sync

/home/grao100/bin/node --check grm-sync-lancar-notas-fiscais.js
/home/grao100/bin/node --check patch-grm-lancar-notas-fiscais.js
/home/grao100/bin/node --check worker/grm-sync-job-worker.js
/home/grao100/bin/node --check worker/grm-sync-auto-scheduler.js
```

## 7. Primeiro teste em dry-run

Envie um arquivo de teste pela página **Enviar Notas Fiscais** no painel antes de rodar isso — o agente só processa o que estiver com `status = 'NOVO'` em `grm_nf_lancamentos`.

O dry-run abre e preenche a Nova Conta, adiciona o rateio e cancela antes de salvar.

```bash
runuser -u grao100 -- bash -c '
  cd /home/grao100/painel-scripts/grm-sync &&

  env \
    HOME=/home/grao100 \
    TMP=/home/grao100/chrome-runtime/tmp \
    TEMP=/home/grao100/chrome-runtime/tmp \
    TMPDIR=/home/grao100/chrome-runtime/tmp \
    XDG_RUNTIME_DIR=/home/grao100/chrome-runtime/tmp \
    XDG_CACHE_HOME=/home/grao100/chrome-runtime/cache \
    XDG_CONFIG_HOME=/home/grao100/chrome-runtime/config \
    GRM_HEADLESS=true \
    /home/grao100/bin/node grm-sync-lancar-notas-fiscais.js \
      --dry-run \
      --limit 1 \
      --debug \
      --force
'
```

Resultado esperado:

```text
DRY_RUN_OK
formulário validado sem salvar
```

Pra testar uma nota específica (por exemplo, uma que já foi processada antes), use `--upload-id <id da linha em grm_nf_lancamentos>` no lugar de `--limit`.

## 8. Primeiro lançamento real

Confira no Supabase o registro `DRY_RUN_OK`. Depois altere temporariamente:

```dotenv
GRM_LANCAR_NF_DRY_RUN=false
```

Execute apenas uma nota:

```bash
runuser -u grao100 -- bash -c '
  cd /home/grao100/painel-scripts/grm-sync &&

  env \
    HOME=/home/grao100 \
    TMP=/home/grao100/chrome-runtime/tmp \
    TEMP=/home/grao100/chrome-runtime/tmp \
    TMPDIR=/home/grao100/chrome-runtime/tmp \
    XDG_RUNTIME_DIR=/home/grao100/chrome-runtime/tmp \
    XDG_CACHE_HOME=/home/grao100/chrome-runtime/cache \
    XDG_CONFIG_HOME=/home/grao100/chrome-runtime/config \
    GRM_HEADLESS=true \
    GRM_LANCAR_NF_DRY_RUN=false \
    /home/grao100/bin/node grm-sync-lancar-notas-fiscais.js \
      --real \
      --limit 1 \
      --debug \
      --force
'
```

Confirme no GRM pelo número do documento e código/grupo criado.

## 9. Ativar o agendamento

Depois de dois lançamentos reais corretos:

```dotenv
GRM_LANCAR_NF_AGENDAR=true
GRM_LANCAR_NF_DRY_RUN=false
GRM_LANCAR_NF_MAX_POR_EXECUCAO=5
GRM_LANCAR_NF_INTERVALO_MINUTOS=10
```

O agente entra na mesma fila serializada dos demais agentes Puppeteer.

## Status possíveis

| Status | Significado |
|---|---|
| `NOVO` | enviado pela página, ainda não pego pelo agente |
| `PROCESSANDO` | arquivo em leitura |
| `AGUARDANDO_DADOS` | faltou vencimento, valor, fornecedor, documento, pagamento ou empresa não reconhecida |
| `AGUARDANDO_CLASSIFICACAO` | grupo/categoria ainda não foram definidos |
| `VALIDADO` | dados prontos para abrir o GRM |
| `DRY_RUN_OK` | formulário foi preenchido e cancelado |
| `LANCADO` | salvo no GRM |
| `DUPLICADO` | mesma NF já processada |
| `ERRO` | falha técnica ou rejeição do GRM |

Esses status aparecem na própria página **Enviar Notas Fiscais** do painel, na tabela de envios recentes.
