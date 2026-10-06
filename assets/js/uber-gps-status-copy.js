const TEXTO_SEM_GPS = 'Endereço sem coordenadas GPS. Converta o endereço para verificar se existe ponto de embarque em um raio de 2 km.';
const TEXTO_COM_GPS = 'Endereço convertido em GPS. Reprocesse a validação para confirmar o ponto de embarque em um raio de 2 km.';
const PADRAO_NAO_CONVERTIDO = /endereço ainda não convertido em gps/i;

// Só escreve quando o texto muda: este módulo observa a própria página, então
// toda escrita vira uma nova mutação. Reescrever o mesmo texto fazia o
// observador se disparar sem parar e travava a aba.
function definirTexto(celula, texto) {
  if (celula.textContent !== texto) celula.textContent = texto;
}

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
      // Só troca quando não há observação de verdade: vazia, "-" ou o aviso padrão da view
      // ("Endereço ainda não convertido em GPS..."). Gorjeta, classificação manual, uso
      // pessoal e o motivo de uma conversão que falhou continuam como estão.
      if (textoAtual === '' || textoAtual === '-' || PADRAO_NAO_CONVERTIDO.test(textoAtual)) {
        definirTexto(observacao, TEXTO_SEM_GPS);
      }
      return;
    }

    if (PADRAO_NAO_CONVERTIDO.test(textoAtual)) {
      definirTexto(observacao, TEXTO_COM_GPS);
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
