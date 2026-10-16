'use strict';
// Regras da NF de manutenção de frota (setor FROTAS) no agente sync-lancar-notas-fiscais.
// Sem GRM, sem Supabase: só transforma os dados já extraídos da NF com o contexto da manutenção
// (frotas_manutencoes + frotas_veiculos, achado por frotas_manutencoes.nf_lancamento_id = linha da fila).
//
// A categoria do GRM (MANUT. VEICULOS SERVICOS / PECAS / PNEUS AQUISICAO) vem em ajustes_manuais,
// gravada pela RPC frotas_manutencao_enviar_nf_financeiro, e o agente aplica por cima (applyManualOverrides).
// Aqui ficam o rateio pela coordenação do veículo e a descrição do lançamento.

const GRUPO_VEICULOS = 'DESPESAS COM VEICULOS';

function isFrotasRow(row) {
  return String(row && row.setor ? row.setor : '').trim().toUpperCase() === 'FROTAS';
}

function codigoManutencao(ctx) {
  return ctx && ctx.numero != null ? `MAN-${String(ctx.numero).padStart(6, '0')}` : '';
}

function descricaoFrotas(ctx) {
  const os = (ctx && ctx.os_numero) || codigoManutencao(ctx);
  const partes = [`Manutenção ${ctx.placa || ''}`.trim(), os, ctx.oficina || '', ctx.descricao || ''].map((p) => String(p || '').trim()).filter(Boolean);
  return partes.join(' - ').slice(0, 250);
}

// Rateio em UMA coordenação (a do veículo). Se ela não existir no GRM, resolveCoordenacao cai em identificacao_fallback.
function applyFrotasRules(data, ctx, opcoes) {
  const fallback = (opcoes && opcoes.fallback) || 'GERAL';
  const coordenacao = String((ctx && ctx.coordenacao) || '').trim();
  const avisos = [];
  if (!coordenacao) avisos.push(`Veículo sem coordenação cadastrada; rateado em ${fallback}.`);

  data.grupo_categoria = data.grupo_categoria || GRUPO_VEICULOS;
  data.rateio = {
    ...(data.rateio || {}),
    tipo_participacao: 'Coordenação',
    identificacao: coordenacao || fallback,
    identificacao_fallback: fallback,
    valor: data.valor_total,
  };
  data.descricao = descricaoFrotas(ctx);
  data.frotas = {
    manutencao: codigoManutencao(ctx), placa: ctx.placa || null, os: ctx.os_numero || null,
    coordenacao: coordenacao || null, avisos,
  };
  return data;
}

module.exports = { isFrotasRow, descricaoFrotas, applyFrotasRules, codigoManutencao, GRUPO_VEICULOS };
