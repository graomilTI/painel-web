// Complementa o fluxo de Financeiro > Despesas > Refeições.
// Mantém a exportação antiga apenas como fallback. Quando o novo fluxo de
// refeições únicas assume o botão, ele próprio gera os arquivos consolidados.

if (!window.__financeiroPagamentoLoteAtivo) {
  window.__financeiroPagamentoLoteAtivo = true;

  document.addEventListener('click', (event) => {
    const pagarBtn = event.target instanceof Element
      ? event.target.closest('#btnPagarBeneficios')
      : null;

    if (!pagarBtn) return;
    if (pagarBtn.hasAttribute('data-refeicoes-unicas-bound')) return;

    const exportarBtn = document.getElementById('btnExportarTudo');
    if (!exportarBtn) {
      console.warn('[Financeiro] Botão de exportação não localizado para o pagamento em lote.');
      return;
    }

    exportarBtn.click();
  }, { capture: true });
}
