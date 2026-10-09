// Escopo do gestor no dashboard: quais coordenações (e supervisões) entram nos
// cartões. Sem imports de propósito — é regra pura, testada em tests/.
//
// A supervisão é mais fina que a coordenação ("MATO GROSSO MT1 - Sinop" dentro
// de "MATO GROSSO MT1"). Producao, patrimônios, veículos e metas guardam a
// coordenação com a grafia exata do GRM ("MATO GROSSO MT3 - CONFRESA",
// "SÃO PAULO"), então a coordenação de cada supervisão é achada entre as
// regionais que têm meta cadastrada no mês, que são essa grafia exata.

export function normEscopo(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}

// Supervisões "SP - Avaré" pertencem à coordenação "SÃO PAULO": o único caso
// em que o início do nome da supervisão não é o nome da coordenação.
const COORDENACAO_POR_PREFIXO = new Map([['SP', 'SAO PAULO']]);

function coordenacaoDaSupervisao(supervisaoNorm, regionais) {
  const prefixo = COORDENACAO_POR_PREFIXO.get(supervisaoNorm.split(' ')[0]);
  let melhor = null;
  for (const regional of regionais) {
    if (!regional.norm) continue;
    const casa = supervisaoNorm === regional.norm
      || supervisaoNorm.startsWith(`${regional.norm} `)
      || (prefixo && regional.norm === prefixo);
    // Várias podem casar: vale a de nome mais longo (a mais específica).
    if (casa && (!melhor || regional.norm.length > melhor.norm.length)) melhor = regional;
  }
  return melhor;
}

// principal: app_usuarios.coordenacao. supervisoes: nomes liberados ao gestor.
// regionaisMetas: metas_producao.regional do mês (grafia exata das coordenações).
// Devolve a principal primeiro, depois as demais, sem repetir (comparação sem
// acento/caixa, devolvendo a grafia original).
export function calcularEscopoGestor({ principal = '', supervisoes = [], regionaisMetas = [] } = {}) {
  const coordenacoes = [];
  const vistas = new Set();
  const adicionar = (nome) => {
    const norm = normEscopo(nome);
    if (!norm || vistas.has(norm)) return;
    vistas.add(norm);
    coordenacoes.push(String(nome).trim());
  };

  adicionar(principal);

  const regionais = [...new Set((regionaisMetas || []).filter(Boolean))]
    .map((nome) => ({ nome, norm: normEscopo(nome) }));

  const nomesSupervisoes = [];
  const supervisoesVistas = new Set();
  for (const supervisao of supervisoes || []) {
    const nome = String(supervisao ?? '').trim();
    const norm = normEscopo(nome);
    if (!norm || supervisoesVistas.has(norm)) continue;
    supervisoesVistas.add(norm);
    nomesSupervisoes.push(nome);

    const regional = coordenacaoDaSupervisao(norm, regionais);
    if (regional) adicionar(regional.nome);
  }

  return { coordenacoes, supervisoes: nomesSupervisoes };
}

// Chave estável do escopo para o cache do dashboard (compartilhado entre
// gestores com o mesmo escopo, diferente entre escopos diferentes).
export function chaveEscopo({ coordenacoes = [], supervisoes = [] } = {}) {
  const coords = coordenacoes.map(normEscopo).filter(Boolean).sort();
  if (!coords.length) return 'sem_regional';
  const sups = supervisoes.map(normEscopo).filter(Boolean).sort().join('|');
  let hash = 5381;
  for (let i = 0; i < sups.length; i += 1) hash = ((hash * 33) ^ sups.charCodeAt(i)) >>> 0;
  return `${coords.join('+')}:${sups ? hash.toString(36) : '0'}`;
}
