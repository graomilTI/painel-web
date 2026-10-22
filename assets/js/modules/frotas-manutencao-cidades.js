// Frotas · Manutenção: UF e cidade da manutenção, com a relação de municípios do IBGE (mesmo esquema da abertura de OS:
// escolhe a UF e a lista de cidades daquela UF libera). O cache é o mesmo de logistica.js e programacao.js (mesma chave e
// validade): carregar aqui reaproveita o que já foi baixado lá e vice-versa.
export const UFS_BRASIL = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'];

const CHAVE_CACHE = 'grm:cidades_ibge:v1';
const VALIDADE_MS = 30 * 24 * 60 * 60 * 1000;
let municipios = [];
let carregando = null;

function lerCache() {
  try {
    const { ts, data } = JSON.parse(localStorage.getItem(CHAVE_CACHE) || 'null') || {};
    return ts && Date.now() - ts <= VALIDADE_MS && Array.isArray(data) && data.length ? data : null;
  } catch { return null; }
}

// Baixa (ou lê do cache) os municípios: [{ nome, uf }]. Falhando, a lista fica vazia e a tela avisa.
export function carregarCidades() {
  if (municipios.length) return Promise.resolve(municipios);
  if (carregando) return carregando;
  carregando = (async () => {
    const guardado = lerCache();
    if (guardado) { municipios = guardado; return municipios; }
    try {
      const resposta = await fetch('https://servicodados.ibge.gov.br/api/v1/localidades/municipios?orderBy=nome');
      const dados = await resposta.json();
      municipios = (Array.isArray(dados) ? dados : []).map((m) => ({ nome: m.nome, uf: m.microrregiao?.mesorregiao?.UF?.sigla || '' })).filter((m) => m.nome && m.uf);
      try { localStorage.setItem(CHAVE_CACHE, JSON.stringify({ ts: Date.now(), data: municipios })); } catch { /* sem armazenamento: segue sem cache */ }
    } catch { municipios = []; }
    return municipios;
  })().finally(() => { carregando = null; });
  return carregando;
}

// Cidades de uma UF em ordem alfabética (pt-BR). `lista` é injetável para teste.
export function cidadesDaUf(uf, lista = municipios) {
  if (!uf) return [];
  return lista.filter((c) => c.uf === uf).map((c) => c.nome).sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

export function htmlOpcoesUf(selecionada = '') {
  return `<option value="">UF</option>${UFS_BRASIL.map((uf) => `<option value="${uf}"${uf === selecionada ? ' selected' : ''}>${uf}</option>`).join('')}`;
}

export function htmlOpcoesCidade(uf, selecionada = '', lista = municipios) {
  if (!uf) return '<option value="">Escolha a UF</option>';
  const nomes = cidadesDaUf(uf, lista);
  const extra = selecionada && !nomes.includes(selecionada) ? [selecionada] : []; // cidade já gravada que a lista não tem
  const esc = (v) => String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c]));
  return `<option value="">Cidade</option>${[...extra, ...nomes].map((n) => `<option value="${esc(n)}"${n === selecionada ? ' selected' : ''}>${esc(n)}</option>`).join('')}`;
}

export const rotuloCidadeUf = (m) => (m?.cidade && m?.uf ? `${m.cidade}/${m.uf}` : (m?.cidade || m?.uf || ''));
