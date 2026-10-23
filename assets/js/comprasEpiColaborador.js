// Aba EPI do gestor (Compras): lista de EPIs por colaborador. Funções puras para poder testar.
const norm = (v) => String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

export const chaveColaborador = (i) => String(i.colaborador_id || `nome:${norm(i.colaborador_nome)}`);

// Mesmo colaborador + mesmo EPI + mesmo tamanho soma a quantidade em vez de criar outra linha.
export function adicionarEpi(lista, novo) {
  const chave = (i) => `${chaveColaborador(i)}|${norm(i.material)}|${norm(i.tamanho)}`;
  const qtd = Number(novo.quantidade || novo.unidade || 1);
  const existente = lista.find((i) => chave(i) === chave(novo));
  if (!existente) return [...lista, { ...novo, unidade: qtd, quantidade: qtd }];
  return lista.map((i) => (i === existente ? { ...i, unidade: Number(i.quantidade) + qtd, quantidade: Number(i.quantidade) + qtd } : i));
}

// [{ chave, nome, tipo, itens }] na ordem em que cada colaborador apareceu.
export function agruparPorColaborador(lista) {
  const grupos = new Map();
  for (const i of lista) {
    const k = chaveColaborador(i);
    if (!grupos.has(k)) grupos.set(k, { chave: k, nome: i.colaborador_nome, tipo: i.colaborador_tipo || '', itens: [] });
    grupos.get(k).itens.push(i);
  }
  return [...grupos.values()];
}

// Linha da tela -> linha de compras_itens (sem os campos de controle da tela).
export function itemEpiParaBanco({ _id, ...item }) {
  return { ...item, tipo: 'EPI' };
}
