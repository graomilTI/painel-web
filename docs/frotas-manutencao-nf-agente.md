# Manutenção de frota: NF no GRM e pagamento no Financeiro

Fase 5 do fluxo de manutenção (16/10/2026).

## Como funciona

1. Uma manutenção tem **várias notas fiscais** (peças, serviço, mais de uma de cada), cadastradas na ficha em "Notas fiscais" (tipo, quem emitiu, nº, valor e arquivo). Podem ser lançadas já em execução. O custo final da conclusão vem da **soma das notas**. Só manutenção **paga pela empresa** segue adiante; locadora, colaborador e proprietário ficam só como registro.
2. A RPC `frotas_manutencao_enviar_nf_financeiro` (chamada pela ficha, ao concluir ou depois) exige manutenção concluída, custo > 0, ao menos uma nota, todas com arquivo e soma das notas ≤ custo final. Para **cada nota pendente**:
   - coloca o arquivo na fila do agente (`grm_nf_lancamentos`, setor `FROTAS`; o gatilho enfileira o job `sync-lancar-notas-fiscais`);
   - grava em `ajustes_manuais` a categoria do GRM pelo tipo da nota: peça com todos os itens pneus → `PNEUS AQUISICAO`; peça → `MANUT. VEICULOS PECAS`; serviço ou misto → `MANUT. VEICULOS SERVICOS` (grupo `DESPESAS COM VEICULOS`);
   - cria a solicitação de pagamento em `financeiro_pagamentos` (origem `FROTAS`, origem_tabela `frotas_manutencao_notas`) com o favorecido da nota (oficina cadastrada, com CNPJ e PIX, ou o nome digitado).
   **Já foi pago?** A nota pode levar o comprovante de pagamento (e a data) antes do envio: o pagamento entra no Financeiro já como **PAGO**, com o comprovante, e a NF segue para o lançamento no GRM. Sem comprovante, o pagamento entra como pendente para o Financeiro pagar. Vale também para a aba Preventiva (o "+" Registrar tem "Pagamento e nota fiscal": custo, quem paga, NF/NFS-e e comprovante).
   Notas já enviadas não são reenviadas (idempotente) nem editadas ou removidas.
3. O que volta sozinho para cada nota: NF lançada ou com erro (aviso à equipe), pagamento feito e comprovante. A manutenção só fica **paga** quando todas as notas estiverem pagas. Depois que o primeiro pagamento é criado, o **custo final fica travado**.
4. Erro da NF: complete os dados em Financeiro › Notas fiscais (✎) para o agente tentar de novo.

## Agente: o que mudou (deploy manual)

Arquivos em `agentes-grm-sync/`:

- `grm-nf-frotas-regras.js` (novo): rateio pela **coordenação do veículo** (reserva `GERAL`, a mesma do Compras, quando a coordenação não existe no GRM) e descrição "Manutenção PLACA - OS - oficina - problema";
- `grmserver-lancar-notas-fiscais-api.js`: `loadFrotasContext` (acha a manutenção pela nota: `frotas_manutencao_notas.nf_lancamento_id`) e chamada de `applyFrotasRules` antes dos ajustes manuais.

**Sem o deploy do agente o fluxo já funciona**, mas a NF é rateada em `GERAL` (padrão do agente) e a descrição vem da NF. Para ativar o rateio por coordenação:

1. `node agentes-grm-sync/test-nf-frotas.js` (regras, sem GRM);
2. copiar os dois arquivos para o servidor (scp) e rodar um **dry-run** com uma NF de teste de Frotas;
3. conferir no GRM (ou no retorno do dry-run) o rateio e a categoria antes de liberar.

O agente depende do token diário do GRM; sem ele o lançamento fica na fila.
