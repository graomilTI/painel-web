// Complementa o fluxo de Financeiro > Despesas > Refeições.
// O botão PAGAR passa a acionar, no mesmo clique do usuário, a exportação já
// preparada pelo módulo financeiro: Conferência, iFood e Flash.
//
// O listener usa a fase de captura para exportar antes de pagarBeneficios()
// atualizar as linhas para PAGO, quando elas deixam de compor os arquivos.

if (!window.__financeiroPagamentoLoteAtivo) {
  window.__financeiroPagamentoLoteAtivo = true;

  document.addEventListener('click', (event) => {
    const pagarBtn = event.target instanceof Element
      ? event.target.closest('#btnPagarBeneficios')
      : null;

    if (!pagarBtn) return;

    const exportarBtn = document.getElementById('btnExportarTudo');
    if (!exportarBtn) {
      console.warn('[Financeiro] Botão de exportação não localizado para o pagamento em lote.');
      return;
    }

    exportarBtn.click();
  }, { capture: true });
}
