# Agente de lançamento de Notas Fiscais no GRM

## O que foi implementado

O agente lê XML, PDF e imagens da pasta do Google Drive, extrai os dados da nota e abre **Financeiro → Contas a Pagar → Nova Conta** em:

`https://www.grmserver.com.br/finance/payInvoice`

Ele preenche os campos vistos nas telas do GRM:

- Empresa;
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
- trava duplicidade por arquivo do Drive e por `CNPJ + número + data + valor`;
- registra toda execução no Supabase;
- devolve código de saída diferente de zero quando houver erro técnico;
- salva screenshot e HTML em caso de falha;
- processa no máximo 1 arquivo inicialmente; depois pode subir para 5.

## Limitação encontrada no acesso ao Drive

A pasta informada não ficou acessível pela conexão Google Drive desta conversa. No servidor, o agente usa uma **conta de serviço Google só para o Drive** (ver seção "Google Drive" abaixo). Compartilhe a pasta com o e-mail `client_email` existente em `google-service-account.json`, como **Leitor**. Para mover arquivos após o lançamento, compartilhe como **Editor**.

## Prioridade de leitura

1. XML da NF-e;
2. texto interno do PDF usando `pdftotext`;
3. OCR do PDF/imagem via **Groq** (mesmo provedor da edge function `ocr-comprovante`, que já lê CNPJ/valor/data de comprovantes financeiros) — não usa Google Cloud Vision. Basta a `GROQ_API_KEY` já usada em outros pontos do projeto (edge function `ocr-comprovante`, `email-worker`); não precisa criar nada novo pra isso.

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
config/exemplo-metadados-nota.json
sql/20260730010000_grm_nf_lancamentos.sql
```

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

- `grm_nf_lancamentos`;
- `grm_nf_lancamento_execucoes`.

## 3. Configurar o Google Drive

**Não existe ainda** um `google-service-account.json` no servidor (confirmado em 30/07/2026 — o arquivo não existe em `/home/grao100/painel-scripts/grm-sync/`). É só pra acesso ao Drive agora (o OCR usa Groq, não Google Cloud Vision — ver seção 5).

1. Google Cloud Console → criar um projeto (ou reaproveitar um que a Grão 1000 já tenha) para essa automação.
2. Ativar **Google Drive API** nesse projeto (não precisa mais de Cloud Vision API).
3. IAM e Admin → Contas de Serviço → criar uma conta de serviço.
4. Nessa conta → aba Chaves → Adicionar chave → Criar nova chave → JSON.
5. Enviar o arquivo baixado para:

```text
/home/grao100/painel-scripts/grm-sync/google-service-account.json
```

6. Compartilhar a pasta `1j6Yem3_fr2FWO0s7SiUWj9N1_CQeKut5e` com o `client_email` dessa conta de serviço, como Leitor.

## 4. Configurar categorias

`config/grm-lancar-notas-fiscais.json` já vem preenchido com os textos reais conferidos ao vivo no GRM (Contas a Pagar → filtro Grupo de Categoria/Categoria) em 30/07/2026:

| Pasta/palavra-chave | Grupo de Categoria | Categoria |
|---|---|---|
| `HOSPEDAGEM` | DESPESAS OPERACIONAIS | HOSPEDAGEM |
| `FROTAS` (padrão) | DESPESAS COM VEICULOS | *(definida por palavra-chave ou JSON lateral)* |
| palavra-chave PNEU/PNEUS | DESPESAS COM VEICULOS | PNEUS AQUISICAO |
| palavra-chave GASOLINA/ETANOL/DIESEL/COMBUSTÍVEL | COMBUSTIVEIS E LUBRIFICANTES | COMBUSTIVEL |
| `RH` (padrão) | DESPESAS RH | *(definida por palavra-chave ou JSON lateral)* |
| palavra-chave UNIFORME/CRACHÁ | DESPESAS RH | UNIFORME/CRACHA |
| palavra-chave SOFTWARE/SISTEMA/LICENÇA/ASSINATURA | DESPESAS ADMINISTRATIVAS | SOFTWARE/SISTEMA |
| palavra-chave INTERNET/TELEFONIA | DESPESAS ADMINISTRATIVAS | INTERNET/TELEFONE |
| palavra-chave ENERGIA ELÉTRICA | DESPESAS ADMINISTRATIVAS | ENERGIA ELETRICA |
| palavra-chave MATERIAL DE EXPEDIENTE/PAPELARIA | DESPESAS ADMINISTRATIVAS | MATERIAL EXPEDIENTE |

**Atenção:** o GRM não tem categorias separadas "UNIFORME" e "CRACHA" — existe só uma categoria combinada `UNIFORME/CRACHA`. Uma versão anterior deste config usava os nomes errados; já corrigido.

As 4 palavras-chave novas (Software, Internet, Energia, Material de Expediente) vieram da mineração do extrato completo "Lista de Rateios" do GRM (5.352 lançamentos históricos, arquivo fornecido em 30/07/2026) — são os padrões mais recorrentes de despesas administrativas/compras que não são veículo, hospedagem nem RH.

**Pasta `COMPRAS` continua sem um Grupo/Categoria único de propósito.** Ela não tem um padrão fixo no GRM — pode cair em DESPESAS ADMINISTRATIVAS (a maioria) ou em PATRIMONIO (equipamento/imobilizado acima de R$500, ex.: `IMOBILIZADO (MAIOR QUE 500,00)`) dependendo do item e do valor, e essa distinção por valor não dá pra automatizar com segurança sem risco de classificar errado. Notas que baterem em uma das 4 palavras-chave acima são classificadas automaticamente; as demais ficam em `AGUARDANDO_CLASSIFICACAO` até você revisar e, se for um item recorrente, adicionar uma nova regra — ou usar o JSON lateral (`config/exemplo-metadados-nota.json`) pra informar `grupo_categoria`/`categoria` nota a nota.

O agente não tenta adivinhar grupo contábil. Sem preenchimento, a nota fica como `AGUARDANDO_CLASSIFICACAO` e não é lançada.

### Empresa (CNPJ/CPF lido de cada nota — não é mais fixo)

O GRM tem **6 empresas cadastradas** em Contas a Pagar → Nova Conta → Empresa: `GRAOMIL LTDA`, `BV GRAIN`, `EXCELENCIA`, `CAR1000`, `ELIZEU MOTA`, `DOUGLAS HENRIQUE MOTA 09987821901`. O agente decide qual delas usar pelo **CNPJ/CPF do destinatário lido do próprio arquivo** (tag `dest` do XML da NF-e, ou o segundo CNPJ/CPF encontrado no texto do PDF/imagem) — nunca por um valor fixo, porque lançar uma conta na empresa errada é um erro contábil real.

Isso é configurado em `config/grm-lancar-notas-fiscais.json` → `empresas`:

```json
"empresas": [
  { "documento": "29666679000134", "nome": "GRAOMIL LTDA" },
  { "documento": "09987821901", "nome": "DOUGLAS HENRIQUE MOTA 09987821901" },
  { "documento": "32202416000189", "nome": "BV GRAIN" },
  { "documento": "36514493000125", "nome": "EXCELENCIA" },
  { "documento": "35134829000161", "nome": "CAR1000" },
  { "documento": "04429697000171", "nome": "ELIZEU MOTA" }
]
```

**As 6 empresas já estão preenchidas** (confirmado 30/07/2026): GRAOMIL LTDA (CNPJ do rodapé do relatório "Lista de Rateios"), DOUGLAS HENRIQUE MOTA (CPF, já aparece no próprio nome dela no GRM), e BV GRAIN/EXCELENCIA/CAR1000/ELIZEU MOTA (CNPJs informados por você).

Se uma nota trouxer um CNPJ/CPF de destinatário que não bater com nenhuma dessas 6 entradas, ela fica em `AGUARDANDO_DADOS` (campo `empresa` ausente) em vez de cair na empresa errada — sinal de que é uma 7ª empresa nova, ou de que o documento veio ilegível.

### Metadado lateral opcional

Para garantir 100% dos dados de uma nota, crie um JSON com o mesmo nome-base do arquivo:

```text
nota-220000.pdf
nota-220000.json
```

Use `config/exemplo-metadados-nota.json` como modelo. O JSON sobrescreve os dados extraídos por XML/PDF/OCR.

## 5. Adicionar variáveis ao `.env`

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

## 6. Integrar ao worker e scheduler

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

## 7. Validar sintaxe

```bash
cd /home/grao100/painel-scripts/grm-sync

/home/grao100/bin/node --check grm-sync-lancar-notas-fiscais.js
/home/grao100/bin/node --check patch-grm-lancar-notas-fiscais.js
/home/grao100/bin/node --check worker/grm-sync-job-worker.js
/home/grao100/bin/node --check worker/grm-sync-auto-scheduler.js
```

## 8. Primeiro teste em dry-run

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

## 9. Primeiro lançamento real

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

## 10. Ativar o agendamento

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
| `PROCESSANDO` | arquivo em leitura |
| `AGUARDANDO_DADOS` | faltou vencimento, valor, fornecedor, documento ou pagamento |
| `AGUARDANDO_CLASSIFICACAO` | grupo/categoria ainda não foram definidos |
| `VALIDADO` | dados prontos para abrir o GRM |
| `DRY_RUN_OK` | formulário foi preenchido e cancelado |
| `LANCADO` | salvo no GRM |
| `DUPLICADO` | mesma NF já processada |
| `ERRO` | falha técnica ou rejeição do GRM |

## Observação sobre parcelas

Quando o XML contém mais de uma duplicata, o agente não inventa o intervalo. É necessário informar no JSON lateral:

```json
{
  "intervalo_cobranca": "Mensal",
  "qtd_parcelas": 3,
  "data_vencimento": "30/08/2026"
}
```

Os textos das opções devem ser exatamente os exibidos pelo GRM.
