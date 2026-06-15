import { reconcileMultaActions } from './frotas-multas-action-reconcile.js';
import { installOneTimeMultasXlsx } from './frotas-multas-one-time-xlsx.js';

function watchImportCompletion(container, supabase, button) {
  let processing = false;
  const observer = new MutationObserver(async () => {
    if (processing) return;
    const result = [...document.querySelectorAll('p')].find((element) => (
      element.textContent.includes('multa(s) atualizada(s)')
      && element.textContent.includes('ação(ões) concluída(s)')
    ));
    if (!result) return;

    processing = true;
    observer.disconnect();
    button.disabled = true;
    button.textContent = 'Conferindo ações...';

    try {
      const summary = await reconcileMultaActions(supabase);
      result.textContent += ` Ações conciliadas: ${summary.dobrarConcluido} Dobrar concluída(s), ${summary.identificarConcluido} Identificar concluída(s) e ${summary.identificarPendente} Identificar pendente(s).`;
      window.setTimeout(() => container.querySelector('[data-refresh]')?.click(), 300);
      button.remove();
    } catch (error) {
      console.error('Falha ao conciliar ações das multas:', error);
      result.textContent += ` Falha ao conciliar ações: ${error.message || 'erro desconhecido'}.`;
      button.disabled = false;
      button.textContent = 'Importar atualização XLSX';
    }
  });
  observer.observe(document.body, { childList: true, subtree: true, characterData: true });
}

export function installTemporaryMultasUpload(container, supabase) {
  const toolbar = container.querySelector('.fm-toolbar');
  if (!toolbar || toolbar.querySelector('[data-temporary-multas-upload]')) return;

  const style = document.createElement('style');
  style.textContent = `
    @media (min-width: 1001px) {
      .fm-toolbar.fm-toolbar-with-upload {
        grid-template-columns: 180px 190px minmax(220px,1fr) auto auto auto;
      }
    }
    .fm-btn.fm-temporary-upload {
      border: 1px solid rgba(251,191,36,.5);
      background: rgba(251,191,36,.16);
      color: #fde68a;
      white-space: nowrap;
    }
  `;
  container.appendChild(style);
  toolbar.classList.add('fm-toolbar-with-upload');

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'fm-btn fm-temporary-upload';
  button.dataset.temporaryMultasUpload = '1';
  button.textContent = 'Importar atualização XLSX';
  button.title = 'Atualização única dos status e ações das multas';

  function openImporter() {
    watchImportCompletion(container, supabase, button);
    const url = new URL(window.location.href);
    url.searchParams.set('atualizar-acoes-xlsx', '1');
    window.history.replaceState({}, '', url);
    installOneTimeMultasXlsx(container, supabase);
  }

  button.addEventListener('click', openImporter);
  toolbar.appendChild(button);

  const params = new URLSearchParams(window.location.search);
  if (params.get('atualizar-acoes-xlsx') === '1') openImporter();
}
