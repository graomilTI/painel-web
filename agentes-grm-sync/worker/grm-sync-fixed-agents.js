'use strict';

// Ordem operacional dos agentes de entrada. O próximo é enfileirado somente
// depois que o anterior termina (com sucesso ou erro), mantendo a esteira viva.
module.exports = [
  // 'sync-colaboradores' pausado em 31/08 (arquitetura Puppeteer/XLS) — o cadastro de
  // colaboradores agora é sincronizado por grmserver-colaboradores-api-realtime.js
  // (chamada direta na API do GRM, rodando como serviço persistente). Os dois
  // escreviam em colaboradores.endereco/complemento com formatos diferentes e
  // ficavam desfazendo a correção um do outro a cada rodada.
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
