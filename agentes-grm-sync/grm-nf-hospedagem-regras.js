'use strict';
// Regras da NFS-e do hotel (setor HOSPEDAGEM) no agente sync-lancar-notas-fiscais.
// Sem GRM, sem Supabase: só transforma os dados já extraídos da NF com o contexto da reserva
// (hospedagem_reservas + colaboradores da reserva, achados por hospedagem_pagamento_documentos.grm_nf_lancamento_id = linha da fila).
//
// A categoria do GRM (DESPESAS OPERACIONAIS / HOSPEDAGEM) vem em ajustes_manuais, gravada pela RPC hospedagem_v3_enfileirar_nfse,
// e o agente aplica por cima (applyManualOverrides). Aqui ficam o rateio pela coordenação dos hospedados e a descrição do lançamento.

const GRUPO_PADRAO = 'DESPESAS OPERACIONAIS';
const CATEGORIA_PADRAO = 'HOSPEDAGEM';
const MAX_NOMES = 6;

function isHospedagemRow(row) {
  return String(row && row.setor ? row.setor : '').trim().toUpperCase() === 'HOSPEDAGEM';
}

const dataCurta = (iso) => {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}` : '';
};

// A coordenação que mais pesa (soma de diárias dos hospedados) recebe o rateio inteiro: o lançamento do GRM tem uma só linha de rateio.
// Empate: ordem alfabética. Devolve também as demais coordenações, para o aviso.
function coordenacaoPrincipal(itens) {
  const pesos = new Map();
  for (const i of itens || []) {
    const nome = String((i && i.coordenacao) || '').trim();
    if (!nome) continue;
    const diarias = Number(i.diarias) > 0 ? Number(i.diarias) : 1;
    pesos.set(nome, (pesos.get(nome) || 0) + diarias);
  }
  const ordenadas = [...pesos.entries()].sort((a, b) => (b[1] - a[1]) || a[0].localeCompare(b[0], 'pt-BR'));
  return { coordenacao: ordenadas.length ? ordenadas[0][0] : '', outras: ordenadas.slice(1).map(([nome]) => nome) };
}

function descricaoHospedagem(ctx) {
  const nomes = (ctx.itens || []).map((i) => String(i.nome || '').trim()).filter(Boolean);
  const visiveis = nomes.slice(0, MAX_NOMES).join(', ') + (nomes.length > MAX_NOMES ? ` e mais ${nomes.length - MAX_NOMES}` : '');
  const periodo = ctx.checkin && ctx.checkout ? `${dataCurta(ctx.checkin)} a ${dataCurta(ctx.checkout)}` : '';
  const partes = [`Hospedagem ${ctx.codigo || ''}`.trim(), ctx.hotel || '', periodo, visiveis].map((p) => String(p || '').trim()).filter(Boolean);
  return partes.join(' - ').slice(0, 250);
}

// ctx: { codigo, hotel, checkin, checkout, itens: [{ nome, coordenacao, diarias }] }
function applyHospedagemRules(data, ctx, opcoes) {
  const fallback = (opcoes && opcoes.fallback) || 'GERAL';
  const { coordenacao, outras } = coordenacaoPrincipal(ctx.itens);
  const avisos = [];
  if (!coordenacao) avisos.push(`Hospedados sem coordenação cadastrada; rateado em ${fallback}.`);
  if (outras.length) avisos.push(`Rateio inteiro em ${coordenacao} (mais diárias); também há hospedados de ${outras.join(', ')}.`);

  data.grupo_categoria = data.grupo_categoria || GRUPO_PADRAO;
  data.categoria = data.categoria || CATEGORIA_PADRAO;
  data.rateio = {
    ...(data.rateio || {}),
    tipo_participacao: 'Coordenação',
    identificacao: coordenacao || fallback,
    identificacao_fallback: fallback,
    valor: data.valor_total,
  };
  data.descricao = descricaoHospedagem(ctx);
  data.hospedagem = { reserva: ctx.codigo || null, hotel: ctx.hotel || null, coordenacao: coordenacao || null, avisos };
  return data;
}

module.exports = { isHospedagemRow, coordenacaoPrincipal, descricaoHospedagem, applyHospedagemRules, GRUPO_PADRAO, CATEGORIA_PADRAO };
