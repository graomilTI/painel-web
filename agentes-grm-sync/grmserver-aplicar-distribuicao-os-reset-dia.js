#!/usr/bin/env node

/**
 * Entrypoint exclusivo do cron das 02h (novo dia).
 *
 * Só liga a flag RESET_DIA e delega pro agente principal: limpa
 * (staCodes=[]) e imediatamente redistribui, supervisão por supervisão, só
 * as pendências de "novo dia" (programacao_distribuicao_agendada). Fora
 * desse horário, o job normal 'aplicar-distribuicao-os' continua rodando
 * sem essa etapa extra (reconciliação incremental, dispara por evento).
 *
 * Ver grmserver-aplicar-distribuicao-os-api.js para a lógica completa.
 */

process.env.GRM_RESET_DIA_NOVO_DIA = 'true';
require('./grmserver-aplicar-distribuicao-os-api.js');
