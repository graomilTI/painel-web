// assets/js/modules/notas-fiscais/validators.js
// Validações do módulo Notas Fiscais (estrutura padrão da diretriz 1.2).
//
// Regras objetivas antes de lançar uma NF (seções 6.4/6.6 do plano):
// os campos mínimos precisam estar presentes e coerentes, e a ausência de
// origem vinculada exige justificativa — a validação devolve a lista de
// pendências para a UI mostrar, em vez de deixar o lançamento passar.

const CNPJ_RE = /^\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}$/;
const CHAVE_NFE_RE = /^\d{44}$/;

export function validarCnpj(valor) {
  if (!valor) return false;
  return CNPJ_RE.test(String(valor).trim());
}

export function validarChaveNfe(valor) {
  if (!valor) return false;
  return CHAVE_NFE_RE.test(String(valor).replace(/\D/g, ''));
}

export function validarValor(valor) {
  const n = Number(valor);
  return Number.isFinite(n) && n > 0;
}

/**
 * Valida uma NF antes do lançamento.
 * Retorna { valido, pendencias: string[] } — nunca lança exceção.
 */
export function validarParaLancamento(nf = {}, { exigirOrigem = true } = {}) {
  const pendencias = [];

  if (!nf.numero_nf && !nf.numero) pendencias.push('Número da NF não informado.');
  if (!validarValor(nf.valor)) pendencias.push('Valor da NF ausente ou inválido.');
  if (!nf.data_emissao && !nf.emissao) pendencias.push('Data de emissão não informada.');
  if (nf.cnpj && !validarCnpj(nf.cnpj)) pendencias.push('CNPJ com formato inválido.');
  if (nf.chave && !validarChaveNfe(nf.chave)) pendencias.push('Chave de acesso deve ter 44 dígitos.');
  if (!nf.categoria) pendencias.push('Categoria não definida.');

  const temOrigem = Boolean(
    nf.origem_tipo || nf.origem_id || nf.solicitacao_id || nf.grupo_compra_id
  );
  if (exigirOrigem && !temOrigem && !nf.justificativa_sem_origem) {
    pendencias.push('NF sem origem vinculada: vincule uma solicitação ou registre justificativa.');
  }

  return { valido: pendencias.length === 0, pendencias };
}
