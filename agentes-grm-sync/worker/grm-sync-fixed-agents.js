'use strict';

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
