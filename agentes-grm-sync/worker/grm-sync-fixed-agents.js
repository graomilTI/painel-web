'use strict';

// ATENÇÃO (01/09): esta lista e escolherProximoAgenteFixo() (em
// grm-sync-auto-scheduler.js) NÃO são mais lidas por main() — main() chama só a RPC
// ensure_grm_fixed_pipeline_capacity() -> ensure_grm_scheduled_agents(), que decide o
// que enfileirar direto pela tabela public.grm_sync_agent_settings (colunas
// enabled/interval_minutes/queue_lane, a mesma que a tela TI > Agentes edita).
// Editar este arquivo NÃO muda nada em produção — pra pausar/reativar um agente ou
// mudar intervalo, mexer em grm_sync_agent_settings. Descoberto tentando pausar
// sync-lista-os/sync-operacional-os aqui e ver que continuaram rodando normalmente;
// sync-colaboradores tinha o mesmo problema não percebido desde 31/08 (só foi
// realmente pausado quando a tabela foi corrigida, não quando este arquivo foi
// editado). Mantido só como registro histórico da ordem original; considerar remover.

// Ordem operacional dos agentes de entrada. O próximo é enfileirado somente
// depois que o anterior termina (com sucesso ou erro), mantendo a esteira viva.
module.exports = [
  'sync-colaboradores',
  'sync-lista-os',
  'sync-patrimonios',
  'sync-nhe',
  'sync-operacional-os',
  'sync-distribuicao-os',
  'sync-producao-diaria',
  'sync-locais-embarque',
  'sync-resultado-diario',
  'sync-despesas',
  'sync-notas-fiscais',
  'sync-mapa-embarque',
  'sync-contas-pagar',
  'sync-contas-receber',
  'sync-auditorias',
  'sync-cargas-geofence',
  'sync-btg-relatorios',
  'sync-adiantamentos',
  'botconversa-sync',
];
