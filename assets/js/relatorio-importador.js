import { initProtectedPage } from './pageInit.js';

const CONFIG = {
  'caixa-fornecedor': {
    titulo: 'Caixa do Fornecedor',
    descricao: 'Importação do relatório Caixa do Fornecedor para alimentar o painel.',
    observacao: 'Modelo recebido: Caixa Operacional. Campos esperados incluem Situação, Tipo, Nome do Fornecedor, CPF/CNPJ, Coordenação, Supervisão, Categoria, Data, Conta Bancária, Débito, Crédito, Saldo e Descrição.'
  },
  'despesas': {
    titulo: 'Relatório de Despesas',
    descricao: 'Importação do relatório de despesas para conciliação e análise.',
    observacao: 'Área preparada para receber o arquivo de despesas e seguir para o tratamento no painel.'
  },
  'notas-fiscais': {
    titulo: 'Notas Fiscais',
    descricao: 'Importação de notas fiscais para cruzamento com despesas e financeiro.',
    observacao: 'Área preparada para receber o arquivo de notas fiscais e evoluir a integração.'
  },
  'producao-consolidada': {
    titulo: 'Produção Consolidada',
    descricao: 'Importação da produção consolidada para indicadores e histórico operacional.',
    observacao: 'Área preparada para receber o consolidado de produção e alimentar os relatórios.'
  }
};

function getKey() {
  return document.body.dataset.reportKey || 'caixa-fornecedor';
}

function fileInfo(file) {
  if (!file) return '';
  const sizeMB = (file.size / (1024 * 1024)).toFixed(2);
  return `${file.name} · ${sizeMB} MB`;
}

initProtectedPage('Relatórios', (content) => {
  const cfg = CONFIG[getKey()] || CONFIG['caixa-fornecedor'];

  content.innerHTML = `
    <section class="hero-card">
      <div>
        <div class="eyebrow">Relatórios</div>
        <h2>${cfg.titulo}</h2>
        <p>${cfg.descricao}</p>
      </div>
      <div class="hero-badge-wrap">
        <span class="hero-badge">IMPORTAR</span>
      </div>
    </section>

    <section class="base-card mt-16">
      <div class="section-heading">
        <div>
          <h2>Inserir relatório</h2>
          <p class="section-subtitle">
            Selecione o arquivo e avance para a próxima etapa de tratamento. Esta tela já fica pronta no menu Relatórios para o fluxo de upload.
          </p>
        </div>
      </div>

      <div class="base-grid">
        <div class="base-field half">
          <label class="base-label" for="arquivoRelatorio">Arquivo</label>
          <input id="arquivoRelatorio" class="base-input" type="file" accept=".xlsx,.xls,.csv" />
        </div>

        <div class="base-field half">
          <label class="base-label">Status</label>
          <div id="statusArquivo" class="base-status">Nenhum arquivo selecionado.</div>
        </div>

        <div class="base-field">
          <label class="base-label">Observações do modelo</label>
          <div class="base-status">${cfg.observacao}</div>
        </div>
      </div>

      <div class="base-actions">
        <button id="btnValidarRelatorio" class="base-button primary" type="button">Validar arquivo</button>
        <button id="btnImportarRelatorio" class="base-button secondary" type="button">Importar</button>
      </div>
    </section>
  `;

  const fileInput = document.getElementById('arquivoRelatorio');
  const status = document.getElementById('statusArquivo');
  const btnValidar = document.getElementById('btnValidarRelatorio');
  const btnImportar = document.getElementById('btnImportarRelatorio');

  fileInput?.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    status.textContent = file ? `Arquivo selecionado: ${fileInfo(file)}` : 'Nenhum arquivo selecionado.';
  });

  btnValidar?.addEventListener('click', () => {
    const file = fileInput.files?.[0];
    status.textContent = file
      ? `Validação pronta para ${fileInfo(file)}.`
      : 'Selecione um arquivo antes de validar.';
  });

  btnImportar?.addEventListener('click', () => {
    const file = fileInput.files?.[0];
    status.textContent = file
      ? `Importação preparada para ${fileInfo(file)}.`
      : 'Selecione um arquivo antes de importar.';
  });
});
