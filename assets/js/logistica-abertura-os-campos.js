// Vocabulário compartilhado dos campos da solicitação de Abertura de O.S.
// Usado pelo ADM (checklist de "Solicitar correção", em
// logistica-abertura-os-workflow.js) e pelo Gestor (badges dos campos
// marcados, em logistica-abertura-os-correcao.js e logistica-correcao.js) —
// um só lugar pra manter os rótulos em sincronia com as colunas reais de
// logistica_abertura_os.
export const CAMPOS_ABERTURA_OS = [
  { key: 'contratante_cliente', label: 'Cliente contratante' },
  { key: 'filial_pagadora', label: 'Filial pagadora' },
  { key: 'produtor', label: 'Produtor' },
  { key: 'armazem_embarque', label: 'Armazém de embarque' },
  { key: 'cidade_embarque', label: 'Cidade de embarque' },
  { key: 'cidade_destino', label: 'Cidade de destino' },
  { key: 'local_destino', label: 'Local de destino' },
  { key: 'numero_contrato', label: 'Número do contrato' },
  { key: 'produto', label: 'Produto' },
  { key: 'tipo_produto', label: 'Tipo de produto' },
  { key: 'volume_inicial', label: 'Volume inicial' },
  { key: 'regional', label: 'Regional / Supervisão' },
  { key: 'troca_notas', label: 'Troca de notas' },
  { key: 'servico', label: 'Serviço' },
  { key: 'testes', label: 'Testes selecionados' },
];

export function labelCampoAberturaOs(key) {
  return CAMPOS_ABERTURA_OS.find((c) => c.key === key)?.label || key;
}
