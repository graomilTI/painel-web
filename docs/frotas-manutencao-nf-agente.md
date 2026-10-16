# Manutenção de frota: NF no GRM e pagamento no Financeiro

Fase 5 do fluxo de manutenção (16/10/2026).

## Como funciona

1. A manutenção é **concluída** com custo final, km e (opcionalmente) a NF da oficina. Só manutenção **paga pela empresa** segue adiante; locadora, colaborador e proprietário ficam só como registro.
2. A RPC `frotas_manutencao_enviar_nf_financeiro` (chamada pela ficha, ao concluir ou depois):
   - coloca o arquivo na fila do agente (`grm_nf_lancamentos`, setor `FROTAS`). O gatilho existente enfileira o job `sync-lancar-notas-fiscais`;
   - grava em `ajustes_manuais` a categoria do GRM pelos itens: só pneus (peças) → `PNEUS AQUISICAO`; só peças → `MANUT. VEICULOS PECAS`; o resto → `MANUT. VEICULOS SERVICOS` (grupo `DESPESAS COM VEICULOS`);
   - cria a solicitação de pagamento em `financeiro_pagamentos` (origem `FROTAS`) com oficina, CNPJ e PIX do cadastro.
3. O que volta sozinho para a manutenção: NF lançada ou com erro (aviso à equipe), pagamento feito e comprovante. Depois que o pagamento é criado, o **custo final fica travado**.
4. Erro da NF: complete os dados em Financeiro › Notas fiscais (✎) para o agente tentar de novo.

## Agente: o que mudou (deploy manual)

Arquivos em `agentes-grm-sync/`:

- `grm-nf-frotas-regras.js` (novo): rateio pela **coordenação do veículo** (reserva `GERAL`, a mesma do Compras, quando a coordenação não existe no GRM) e descrição "Manutenção PLACA - OS - oficina - problema";
- `grmserver-lancar-notas-fiscais-api.js`: `loadFrotasContext` (acha a manutenção por `frotas_manutencoes.nf_lancamento_id`) e chamada de `applyFrotasRules` antes dos ajustes manuais.

**Sem o deploy do agente o fluxo já funciona**, mas a NF é rateada em `GERAL` (padrão do agente) e a descrição vem da NF. Para ativar o rateio por coordenação:

1. `node agentes-grm-sync/test-nf-frotas.js` (regras, sem GRM);
2. copiar os dois arquivos para o servidor (scp) e rodar um **dry-run** com uma NF de teste de Frotas;
3. conferir no GRM (ou no retorno do dry-run) o rateio e a categoria antes de liberar.

O agente depende do token diário do GRM; sem ele o lançamento fica na fila.
