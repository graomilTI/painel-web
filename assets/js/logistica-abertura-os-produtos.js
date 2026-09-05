// Catálogo de produtos da Abertura de O.S. — fonte única usada pelo formulário real
// (logistica.js, os selects "Produto"/"Tipo de produto") e pela leitura automática de
// e-mail (logistica-os-ai-structurer.js). Antes cada um mantinha sua própria lista e
// elas ficaram fora de sincronia (ex.: "Ervilha" nunca existiu aqui, e o rótulo de
// Soja é "Declarada Intacta", não "Declarado Intacta") — daí os campos preenchidos
// errado a partir de e-mail. Um só lugar evita esse drift de novo.
//
// Testes exigidos na abertura variam por produto (regra passada pela operação
// 03/08): Milho/Sorgo pedem intensidade do teste de Aflatoxina; Soja pode pedir
// Intacta e/ou GMO Free (independentes); Trigo pede Vomitoxina. As chaves aqui
// (ex.: AFLATOXINA_QUALITATIVO) são o vocabulário usado em
// logistica_abertura_os.testes.opcoes e em grm-sync-abrir-os.js.
export const CATALOGO_PRODUTOS = {
  MILHO: { label: 'Milho', tipos: ['Exportação', 'Tipo Exportação'], testes: [
    { key: 'AFLATOXINA_QUALITATIVO', label: 'Teste Aflatoxina — Qualitativo' },
    { key: 'AFLATOXINA_QUANTITATIVO', label: 'Teste Aflatoxina — Quantitativo' },
  ] },
  TRIGUILHO: { label: 'Triguilho', tipos: ['Não Definido'], testes: [] },
  SORGO: { label: 'Sorgo', tipos: ['Não Definido'], testes: [
    { key: 'AFLATOXINA_QUALITATIVO', label: 'Teste Aflatoxina — Qualitativo' },
    { key: 'AFLATOXINA_QUANTITATIVO', label: 'Teste Aflatoxina — Quantitativo' },
  ] },
  SOJA: { label: 'Soja', tipos: ['Participante', 'Declarada Intacta', 'Não Definido', 'Convencional', 'Intacta Positivo', 'Intacta Negativo'], testes: [
    { key: 'INTACTA', label: 'Teste Intacta' },
    { key: 'GMO_FREE', label: 'Teste GMO Free' },
  ] },
  CANOLA: { label: 'Canola', tipos: ['Não Definido'], testes: [] },
  FARELO_POLPA_CITRICA: { label: 'Farelo de Polpa Cítrica', tipos: ['Não Definido'], testes: [] },
  ARROZ_CASCA_NATURAL_TIPO_1: { label: 'Arroz em Casca Natural Tipo 1', tipos: ['Não Definido'], testes: [] },
  MILHETO: { label: 'Milheto', tipos: ['Não Definido'], testes: [] },
  TRITICALE: { label: 'Triticale', tipos: ['Não Definido'], testes: [] },
  TRIGO: { label: 'Trigo', tipos: ['Não Definido'], testes: [
    { key: 'VOMITOXINA', label: 'Teste Vomitoxina' },
  ] },
};

function normalizeText(v) {
  return String(v ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toUpperCase();
}

export function categoriaProduto(valor) {
  const t = normalizeText(valor);
  if (!t) return null;
  return Object.entries(CATALOGO_PRODUTOS).find(([, config]) => normalizeText(config.label) === t)?.[0] || null;
}
