function ajustarMensagemGps(root = document) {
  root.querySelectorAll('.uber-table tbody tr').forEach((row) => {
    const gpsButton = row.querySelector('button[data-gps]');
    if (!gpsButton) return;

    const cells = row.querySelectorAll('td');
    const observacao = cells[8];
    if (!observacao) return;

    const gpsConvertido = gpsButton.textContent.includes('✓');
    const textoAtual = observacao.textContent.trim();

    if (!gpsConvertido) {
      observacao.textContent = 'Endereço sem coordenadas GPS. Converta o endereço para verificar se existe ponto de embarque em um raio de 2 km.';
      return;
    }

    if (/endereço ainda não convertido em gps/i.test(textoAtual)) {
      observacao.textContent = 'Endereço convertido em GPS. Reprocesse a validação para confirmar o ponto de embarque em um raio de 2 km.';
    }
  });
}

function iniciarAjusteGps() {
  const pageContent = document.getElementById('pageContent');
  if (!pageContent) return;

  ajustarMensagemGps(pageContent);

  const observer = new MutationObserver(() => ajustarMensagemGps(pageContent));
  observer.observe(pageContent, { childList: true, subtree: true });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', iniciarAjusteGps, { once: true });
} else {
  iniciarAjusteGps();
}
