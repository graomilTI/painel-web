// Distribuição de EPI ao solicitar (Compras do gestor): cada distribuição vira um item com o colaborador e o que
// sobra (ou o item inteiro, se nada foi distribuído) vira UM item sem colaborador. Função pura para poder testar.
const totalItem = (i) => Number(i.unidade || i.quantidade || 1);

export function itensComDistribuicao(itens, distribucoes, novoId = () => `${Date.now()}_${Math.random().toString(16).slice(2)}`) {
  const final = itens.filter((i) => i.tipo !== 'EPI').map((i) => ({ ...i }));
  for (const item of itens.filter((i) => i.tipo === 'EPI')) {
    const dist = distribucoes.filter((d) => d.epi_id === item._id);
    const resto = totalItem(item) - dist.reduce((s, d) => s + d.quantidade, 0);
    for (const d of dist) {
      final.push({ ...item, _id: novoId(), unidade: d.quantidade, quantidade: d.quantidade, colaborador_id: d.colaborador_id || null, colaborador_nome: d.colaborador_nome });
    }
    if (resto > 0) final.push({ ...item, _id: novoId(), unidade: resto, quantidade: resto, colaborador_id: null, colaborador_nome: null });
  }
  return final;
}
