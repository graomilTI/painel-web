'use strict';

// Distribuição de O.S.: só chama o GRM para a supervisão/data cuja Programação MUDOU desde a última
// aplicação confirmada.
//
// Antes, a cada ciclo (~650 por dia) o agente fazia um getDistributionData por supervisão/data
// (cerca de 34), só para descobrir que já estava tudo correto: ~22 mil leituras por dia. Agora o
// "estado esperado" de cada supervisão/data vira um hash, guardado em grm_distribuicao_os_estado depois
// de uma aplicação sem nenhuma falha. Hash igual ao guardado = nada mudou = nenhuma chamada ao GRM.
//
// Só entra no hash o que decide o resultado: quais O.S. (número) e quais colaboradores (nome
// normalizado) devem estar em cada uma. Status de conferência, horários e outros campos não entram,
// senão a própria aplicação (que marca AJUSTADA) mudaria o hash.

const crypto = require('crypto');

function normalizar(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}

function chaveGrupo(grupo) {
  return `${String(grupo.data || '').slice(0, 10)}|${normalizar(grupo.coordenacao)}`;
}

/**
 * @param {{ data: string, coordenacao: string, itens: Array<{ os: { numero_os: any }, programados: Array<{ nome_colaborador?: string }> }> }} grupo
 */
function hashGrupo(grupo) {
  const itens = (grupo.itens || [])
    .map((item) => [
      String(item.os && item.os.numero_os),
      [...new Set((item.programados || []).map((p) => normalizar(p.nome_colaborador)).filter(Boolean))].sort(),
    ])
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  return crypto
    .createHash('sha256')
    .update(JSON.stringify({ v: 1, data: String(grupo.data || '').slice(0, 10), coord: normalizar(grupo.coordenacao), itens }))
    .digest('hex');
}

/**
 * Separa os grupos que precisam ir ao GRM dos que não mudaram.
 *
 * @param {Array<any>} grupos
 * @param {Map<string, { hash_aplicado: string, aplicado_em?: string }>} estado  chave -> último estado aplicado
 * @param {{ forcar?: boolean, reverificarHoras?: number, agora?: number }} [opcoes]
 *   forcar: processa todos (rodada de novo dia, que precisa limpar e redistribuir).
 *   reverificarHoras: > 0 reprocessa o grupo cuja última aplicação for mais velha que isso (0 = nunca).
 */
function separarGrupos(grupos, estado, { forcar = false, reverificarHoras = 0, agora = Date.now() } = {}) {
  const aProcessar = [];
  const inalterados = [];
  for (const grupo of grupos) {
    const hash = hashGrupo(grupo);
    const anterior = estado.get(chaveGrupo(grupo));
    let mudou = true;
    if (!forcar && anterior && anterior.hash_aplicado === hash) {
      mudou = false;
      if (reverificarHoras > 0) {
        const quando = Date.parse(anterior.aplicado_em || '');
        if (!Number.isFinite(quando) || agora - quando > reverificarHoras * 3600000) mudou = true;
      }
    }
    (mudou ? aProcessar : inalterados).push({ grupo, hash });
  }
  return { aProcessar, inalterados };
}

module.exports = { normalizar, chaveGrupo, hashGrupo, separarGrupos };
