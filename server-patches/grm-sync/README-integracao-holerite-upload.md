# Integração de holerites na fila de documentos do GRM

## Objetivo

Usar a própria página:

`https://grao1000.com.br/painel/upload-notas-fiscais`

como entrada única para notas fiscais, comprovantes e holerites.

A página envia os arquivos para o bucket `notas-fiscais` e cria uma linha em `grm_nf_lancamentos` com status `NOVO`. O agente existente `grm-sync-lancar-notas-fiscais.js` continua consumindo essa mesma fila; a integração adiciona um roteador interno que identifica o tipo do documento antes do preenchimento do GRM.

## Reconhecimento de holerite

O arquivo é classificado como `HOLERITE` quando o texto apresenta uma combinação segura de sinais, como:

- `FOLHA MENSAL`;
- `VALOR LÍQUIDO`;
- `NOME DO FUNCIONÁRIO`;
- `MENSALISTA` ou `INTERMITENTE`;
- `SALÁRIO BASE`, `CBO`, `DIAS NORMAIS` e `INSS`.

XML continua sempre no fluxo de nota fiscal.

## Regras do lançamento

| Campo no GRM | Regra para holerite |
|---|---|
| Empresa | CNPJ/nome identificado no holerite |
| Data da Conta | Último dia da competência |
| Tipo Favorecido | Funcionário |
| Funcionário | Nome identificado no holerite |
| Grupo de Categoria | FOLHA DE PAGAMENTO |
| Categoria | Mensalista: SALÁRIO FIXO; Intermitente: SALÁRIO DE INTERMITENTE |
| Data de Vencimento | 5º dia útil do mês seguinte |
| Valor Total | Valor Líquido |
| Intervalo | Não Parcelar |
| Tipo de Documento | Holerite |
| Nº do Documento | REGISTRO-MÊS ANO |
| Forma de Pagamento | PIX |
| Rateio | Funcionário, mesmo nome e valor integral |

Por padrão, sábado conta como dia útil. Feriados podem ser informados no config do agente:

```json
{
  "holerite": {
    "sabado_dia_util": true,
    "feriados": ["2026-09-07", "2026-10-12"]
  }
}
```

## Instalação no VPS

Copie `patch-grm-nf-holerite.js` para:

`/home/grao100/painel-scripts/grm-sync/patch-grm-nf-holerite.js`

Depois execute:

```bash
cd /home/grao100/painel-scripts/grm-sync

chown grao100:grao100 patch-grm-nf-holerite.js
chmod 750 patch-grm-nf-holerite.js

runuser -u grao100 -- /home/grao100/bin/node \
  patch-grm-nf-holerite.js \
  /home/grao100/painel-scripts/grm-sync

/home/grao100/bin/node --check grm-sync-lancar-notas-fiscais.js
```

O patch cria backup antes de alterar o agente e restaura o backup automaticamente se o arquivo final não passar no `node --check`.

## Teste controlado

1. Mantenha `GRM_LANCAR_NF_DRY_RUN=true`.
2. Envie um holerite pela aba do painel, com `Reconhecimento automático`.
3. Localize o ID da linha criada em `grm_nf_lancamentos`.
4. Execute somente esse upload:

```bash
runuser -u grao100 -- bash -c '
  cd /home/grao100/painel-scripts/grm-sync &&
  env GRM_HEADLESS=true \
    /home/grao100/bin/node grm-sync-lancar-notas-fiscais.js \
      --upload-id UUID_DA_LINHA \
      --dry-run \
      --debug
'
```

O resultado esperado é `DRY_RUN_OK`. Na coluna `extraido_json` devem aparecer `tipo_documento_fluxo = HOLERITE`, funcionário, registro, competência e regras calculadas.

## Segurança

- PDF com duas vias do mesmo funcionário é aceito e deduplicado internamente.
- PDF contendo funcionários diferentes fica em pendência; deve ser enviado um arquivo por funcionário para impedir anexo indevido.
- Documento ambíguo não é tratado como holerite com base apenas no nome do arquivo.
- O fluxo atual de notas fiscais permanece inalterado.
