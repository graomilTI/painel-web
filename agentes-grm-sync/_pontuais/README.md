# Scripts pontuais

Correções, limpezas e diagnósticos de **uso único** contra o GRM (exclusões em massa,
relançamentos, sondagens de tela). Não são agentes: nenhum worker, cron ou fila chama
estes arquivos. Ficam aqui só como histórico/referência para casos parecidos.

- Rodar sempre a partir de `agentes-grm-sync/` (o `.env` é lido do diretório atual):
  `node _pontuais/<script>.js`
- Os `require` já apontam para `../` (módulos compartilhados ficam na pasta de cima).
- Script novo de uso único: criar direto aqui, não na raiz de `agentes-grm-sync/`.
