import { installOneTimeMultasXlsx } from './frotas-multas-one-time-xlsx.js';

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

  button.addEventListener('click', () => {
    const url = new URL(window.location.href);
    url.searchParams.set('atualizar-acoes-xlsx', '1');
    window.history.replaceState({}, '', url);
    installOneTimeMultasXlsx(container, supabase);
  });

  toolbar.appendChild(button);

  const params = new URLSearchParams(window.location.search);
  if (params.get('atualizar-acoes-xlsx') === '1') {
    installOneTimeMultasXlsx(container, supabase);
  }
}
