'use strict';

/*
 * Evidência de trabalho no dia (regras decididas em 01/10/2026) para aprovar despesas do
 * Caixa Operacional do GRM. Usado pelo sync-aprovar-pendencias.
 *
 *   Almoço / Pernoite : movimento no dia (produção, laudo ou NHE) — "Embarque SIM";
 *                       Pernoite também não pode ter Café/Almoço/Janta ativo no dia
 *                       (a hospedagem cobre a alimentação);
 *   Janta             : laudo registrado a partir das 19h no horário local do embarque;
 *   Café              : laudo registrado antes das 07h no horário local do embarque.
 *
 * O laudo do dia vizinho (D-1/D+1) entra na busca porque o registro pode cair no dia ao lado
 * por causa do fuso do local de embarque (registerDateAtPoint).
 */

const { norm, addDias } = require('./grm-despesas-guardas');
const { registerDateAtPoint } = require('./grm-sync-despesas-retroativas');

const isoToBr = (iso) => iso.split('-').reverse().join('/');

async function queryAll(sb, table, select, configure) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await configure(sb.from(table).select(select).range(from, from + 999));
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < 1000) return rows;
  }
}

const cache = new Map();

// Quem teve movimento (produção, laudo ou NHE) no dia e os laudos (hora local) por colaborador.
async function evidenciaDia(sb, dataIso) {
  if (cache.has(dataIso)) return cache.get(dataIso);
  const [producao, nheNovo, nheAntigo] = await Promise.all([
    queryAll(sb, 'producao_snapshot', 'funcionario', (q) => q.eq('data', dataIso).not('funcionario', 'is', null)),
    queryAll(sb, 'grm_nhe_importacoes', 'dados_json', (q) => q.eq('dados_json->>lnsDate', dataIso).order('id')),
    queryAll(sb, 'grm_nhe_importacoes', 'dados_json', (q) => q.eq('dados_json->>Data', isoToBr(dataIso)).order('id')),
  ]);
  const nomes = new Set(producao.map((r) => norm(r.funcionario)).filter(Boolean));
  nheNovo.forEach((r) => nomes.add(norm(r.dados_json?.staName)));
  nheAntigo.forEach((r) => nomes.add(norm(r.dados_json?.Classificador)));

  const laudos = new Map();
  for (const dia of [-1, 0, 1].map((n) => addDias(dataIso, n))) {
    const cargas = await queryAll(
      sb,
      'grm_cargas_importacoes',
      'colaborador,laudo,os,reg:dados_json->>loaRegisterDate,uf:dados_json->>staAbreviation,cidade:dados_json->>citName',
      (q) => q.eq('data_classificacao', dia).order('id'),
    );
    for (const carga of cargas) {
      if (!carga.laudo || !carga.reg) continue;
      const local = registerDateAtPoint(carga.reg, carga.uf, carga.cidade);
      if (!local || local.ymd !== dataIso) continue;
      const key = norm(carga.colaborador);
      if (!laudos.has(key)) laudos.set(key, []);
      laudos.get(key).push({ laudo: carga.laudo, os: carga.os, hora: local.hour, local: `${local.ymd} ${local.time}` });
    }
  }
  const resultado = { nomes, laudos };
  cache.set(dataIso, resultado);
  return resultado;
}

// Função pura: grupo (CAFE | ALMOCO | JANTA | PERNOITE), nome normalizado, evidência do dia e,
// para Pernoite, as refeições ativas do colaborador no dia. Devolve { ok, evidencia | motivo }.
function avaliarRegra(grupo, nome, ev, { refeicoesNoDia = [] } = {}) {
  const laudos = ev.laudos.get(nome) || [];
  if (grupo === 'CAFE') {
    const apto = laudos.filter((l) => l.hora < 7).sort((a, b) => a.local.localeCompare(b.local))[0];
    return apto
      ? { ok: true, evidencia: `laudo ${apto.laudo} OS ${apto.os} às ${apto.local} (antes das 07h local)` }
      : { ok: false, motivo: 'sem_laudo_antes_das_07h_na_data' };
  }
  if (grupo === 'JANTA') {
    const apto = laudos.filter((l) => l.hora >= 19).sort((a, b) => b.local.localeCompare(a.local))[0];
    return apto
      ? { ok: true, evidencia: `laudo ${apto.laudo} OS ${apto.os} às ${apto.local} (a partir das 19h local)` }
      : { ok: false, motivo: 'sem_laudo_a_partir_das_19h_na_data' };
  }
  if (grupo !== 'ALMOCO' && grupo !== 'PERNOITE') return { ok: false, motivo: 'despesa_nao_tratada' };
  if (!ev.nomes.has(nome) && !laudos.length) return { ok: false, motivo: 'sem_embarque_na_data' };
  if (grupo === 'PERNOITE' && refeicoesNoDia.length) return { ok: false, motivo: 'refeicao_lancada_no_dia', refeicoes: refeicoesNoDia };
  return { ok: true, evidencia: 'Embarque SIM na data (produção/laudo/NHE)' };
}

module.exports = { evidenciaDia, avaliarRegra };
