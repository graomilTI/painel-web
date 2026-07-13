// Atualiza Financeiro > Despesas > Refeições ao retornar para a janela.
// O agente de colaboradores roda em segundo plano; sem esse recarregamento a
// tabela podia continuar exibindo o banco carregado antes da última sincronização.

const MIN_REFRESH_INTERVAL_MS = 30000;
let lastRefreshAt = 0;

function refreshRefeicoesWhenVisible() {
  if (document.visibilityState !== 'visible') return;

  const panel = document.getElementById('pay-mode-almoco');
  const consultarBtn = document.getElementById('btnGerarAlmoco');

  if (!panel?.classList.contains('active')) return;
  if (!consultarBtn || consultarBtn.disabled) return;
  if (Date.now() - lastRefreshAt < MIN_REFRESH_INTERVAL_MS) return;

  lastRefreshAt = Date.now();
  consultarBtn.click();
}

window.addEventListener('focus', refreshRefeicoesWhenVisible);
document.addEventListener('visibilitychange', refreshRefeicoesWhenVisible);
