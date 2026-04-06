import { initProtectedPage } from './pageInit.js';

const STORAGE_KEY = 'painel_relatorios_uploads';

const REPORTS = {
  'producao-consolidada': {
    titulo: 'Produção Consolidada',
    descricao: 'Importação da produção consolidada para indicadores e histórico operacional.',
    observacao: 'Modelo recebido: Produção Consolidada. Use arquivos .xlsx, .xls ou .csv com a base consolidada do período.',
    aceita: '.xlsx,.xls,.csv'
  },
  'notas-fiscais': {
    titulo: 'Notas Fiscais',
    descricao: 'Importação de notas fiscais para cruzamento com despesas e financeiro.',
    observacao: 'Modelo recebido: Notas Fiscais. Utilize a planilha exportada do processo fiscal.',
    aceita: '.xlsx,.xls,.csv'
  },
  'despesas': {
    titulo: 'Relatório de Despesas',
    descricao: 'Importação do relatório de despesas para conciliação e análise.',
    observacao: 'Modelo recebido: Relatório de Despesas. Ideal para o fechamento operacional e financeiro.',
    aceita: '.xlsx,.xls,.csv'
  },
  'caixa-fornecedor': {
    titulo: 'Caixa do Fornecedor',
    descricao: 'Importação do relatório Caixa do Fornecedor para alimentar o painel.',
    observacao: 'Modelo recebido: Caixa do Fornecedor. Campos comuns: Situação, Tipo, Fornecedor, CPF/CNPJ, Coordenação, Supervisão, Categoria, Data, Conta Bancária, Débito, Crédito e Saldo.',
    aceita: '.xlsx,.xls,.csv'
  },
  'resultado-diario': {
    titulo: 'Resultado Diário',
    descricao: 'Importação do resultado diário para fechamento operacional e acompanhamento por cliente.',
    observacao: 'Modelo recebido: Relatório Resultado Diário - Gavilon. Pode ser .xls, .xlsx ou .csv.',
    aceita: '.xlsx,.xls,.csv'
  },
  'cargas': {
    titulo: 'Relatório de Cargas',
    descricao: 'Importação das cargas para consolidar movimentações e cruzamentos logísticos.',
    observacao: 'Modelo recebido: Relatório de Cargas. Utilize a exportação bruta mais recente.',
    aceita: '.xlsx,.xls,.csv'
  },
  'servicos-faturados': {
    titulo: 'Serviços Faturados',
    descricao: 'Importação dos serviços faturados para análise de faturamento e produção.',
    observacao: 'Modelo recebido: Serviços Faturados. Utilize a planilha final exportada do faturamento.',
    aceita: '.xlsx,.xls,.csv'
  }
};

const REPORT_ORDER = [
  'producao-consolidada',
  'notas-fiscais',
  'despesas',
  'caixa-fornecedor',
  'resultado-diario',
  'cargas',
  'servicos-faturados'
];

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getPageMode() {
  return document.body?.dataset?.reportMode || 'detail';
}

function getKey() {
  return document.body?.dataset?.reportKey || 'producao-consolidada';
}

function formatSize(bytes = 0) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB';
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) return `${mb.toFixed(2)} MB`;
  return `${Math.max(bytes / 1024, 1).toFixed(0)} KB`;
}

function formatDateTime(isoValue) {
  if (!isoValue) return 'Sem registro';
  const date = new Date(isoValue);
  if (Number.isNaN(date.getTime())) return 'Sem registro';
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short'
  }).format(date);
}

function readUploads() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeUploads(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {}
}

function persistUpload(reportKey, file) {
  const current = readUploads();
  current[reportKey] = {
    fileName: file?.name || 'Arquivo sem nome',
    fileSize: file?.size || 0,
    uploadedAt: new Date().toISOString()
  };
  writeUploads(current);
  return current[reportKey];
}

function latestUpload(reportKey) {
  return readUploads()[reportKey] || null;
}

function getHref(reportKey) {
  return `./relatorio-${reportKey}.html`;
}

function buildLatestBadge(reportKey) {
  const info = latestUpload(reportKey);
  if (!info) return '<span class="upload-chip muted">Sem envio recente</span>';
  return `<span class="upload-chip success">Último envio: ${escapeHtml(info.fileName)}</span>`;
}

function renderHub(content) {
  const cards = REPORT_ORDER.map((reportKey) => {
    const cfg = REPORTS[reportKey];
    const info = latestUpload(reportKey);
    const footer = info
      ? `<div class="upload-meta">${escapeHtml(info.fileName)} · ${formatSize(info.fileSize)} · ${formatDateTime(info.uploadedAt)}</div>`
      : '<div class="upload-meta">Nenhum arquivo registrado neste navegador.</div>';

    return `
      <article class="upload-card" data-report-card="${reportKey}">
        <div class="upload-card-top">
          <div>
            <div class="upload-kicker">Relatórios</div>
            <h3>${cfg.titulo}</h3>
          </div>
          ${buildLatestBadge(reportKey)}
        </div>

        <p class="upload-copy">${cfg.descricao}</p>
        <p class="upload-note">${cfg.observacao}</p>

        <div class="upload-actions-grid">
          <input class="upload-hidden-input" id="file-${reportKey}" type="file" accept="${cfg.aceita}" />
          <button class="base-button secondary" type="button" data-action="choose" data-report="${reportKey}">Selecionar arquivo</button>
          <button class="base-button primary" type="button" data-action="save" data-report="${reportKey}">Registrar upload</button>
          <a class="base-button secondary upload-link-button" href="${getHref(reportKey)}">Abrir tela</a>
        </div>

        <div class="upload-status" id="status-${reportKey}">Selecione um arquivo para registrar o envio.</div>
        ${footer}
      </article>
    `;
  }).join('');

  content.innerHTML = `
    <section class="hero-card">
      <div>
        <div class="eyebrow">Relatórios</div>
        <h2>Importar Relatórios</h2>
        <p>Central única para subir os relatórios que você pediu no painel. Cada card já abre a tela individual do respectivo relatório.</p>
      </div>
      <div class="hero-badge-wrap">
        <span class="hero-badge">UPLOAD</span>
      </div>
    </section>

    <section class="base-card mt-16">
      <div class="section-heading">
        <div>
          <h2>Arquivos disponíveis para importação</h2>
          <p class="section-subtitle">Produção Consolidada, Notas Fiscais, Despesas, Caixa do Fornecedor, Resultado Diário, Relatório de Cargas e Serviços Faturados.</p>
        </div>
      </div>

      <div class="upload-grid">
        ${cards}
      </div>
    </section>
  `;

  REPORT_ORDER.forEach((reportKey) => {
    const input = document.getElementById(`file-${reportKey}`);
    const status = document.getElementById(`status-${reportKey}`);
    const card = content.querySelector(`[data-report-card="${reportKey}"]`);

    card?.querySelector('[data-action="choose"]')?.addEventListener('click', () => input?.click());

    input?.addEventListener('change', () => {
      const file = input.files?.[0];
      status.textContent = file
        ? `Arquivo selecionado: ${file.name} · ${formatSize(file.size)}`
        : 'Selecione um arquivo para registrar o envio.';
    });

    card?.querySelector('[data-action="save"]')?.addEventListener('click', () => {
      const file = input?.files?.[0];
      if (!file) {
        status.textContent = 'Selecione um arquivo antes de registrar o upload.';
        return;
      }

      const saved = persistUpload(reportKey, file);
      status.textContent = `Upload registrado localmente: ${saved.fileName} · ${formatSize(saved.fileSize)}.`;
      const badge = card.querySelector('.upload-chip');
      if (badge) {
        badge.className = 'upload-chip success';
        badge.textContent = `Último envio: ${saved.fileName}`;
      }
      const meta = card.querySelector('.upload-meta');
      if (meta) meta.textContent = `${saved.fileName} · ${formatSize(saved.fileSize)} · ${formatDateTime(saved.uploadedAt)}`;
    });
  });
}

function renderDetail(content) {
  const reportKey = getKey();
  const cfg = REPORTS[reportKey] || REPORTS['producao-consolidada'];
  const current = latestUpload(reportKey);

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
      <div class="section-heading split-mobile">
        <div>
          <h2>Inserir relatório</h2>
          <p class="section-subtitle">Selecione o arquivo do relatório e registre o envio direto desta tela.</p>
        </div>
        <a class="base-button secondary inline import-back-link" href="./importar-relatorios.html">Voltar para central</a>
      </div>

      <div class="base-grid">
        <div class="base-field half">
          <label class="base-label" for="arquivoRelatorio">Arquivo</label>
          <input id="arquivoRelatorio" class="base-input" type="file" accept="${cfg.aceita}" />
        </div>

        <div class="base-field half">
          <label class="base-label">Último envio</label>
          <div id="ultimoUpload" class="base-status">${current ? `${escapeHtml(current.fileName)} · ${formatSize(current.fileSize)} · ${formatDateTime(current.uploadedAt)}` : 'Nenhum envio registrado neste navegador.'}</div>
        </div>

        <div class="base-field half">
          <label class="base-label">Status</label>
          <div id="statusArquivo" class="base-status">Nenhum arquivo selecionado.</div>
        </div>

        <div class="base-field half">
          <label class="base-label">Observações do modelo</label>
          <div class="base-status">${cfg.observacao}</div>
        </div>
      </div>

      <div class="base-actions">
        <button id="btnValidarRelatorio" class="base-button secondary" type="button">Validar arquivo</button>
        <button id="btnImportarRelatorio" class="base-button primary" type="button">Registrar upload</button>
      </div>
    </section>
  `;

  const fileInput = document.getElementById('arquivoRelatorio');
  const status = document.getElementById('statusArquivo');
  const latest = document.getElementById('ultimoUpload');
  const btnValidar = document.getElementById('btnValidarRelatorio');
  const btnImportar = document.getElementById('btnImportarRelatorio');

  fileInput?.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    status.textContent = file
      ? `Arquivo selecionado: ${file.name} · ${formatSize(file.size)}`
      : 'Nenhum arquivo selecionado.';
  });

  btnValidar?.addEventListener('click', () => {
    const file = fileInput.files?.[0];
    status.textContent = file
      ? `Arquivo pronto para conferência: ${file.name} · ${formatSize(file.size)}.`
      : 'Selecione um arquivo antes de validar.';
  });

  btnImportar?.addEventListener('click', () => {
    const file = fileInput.files?.[0];
    if (!file) {
      status.textContent = 'Selecione um arquivo antes de registrar o upload.';
      return;
    }

    const saved = persistUpload(reportKey, file);
    status.textContent = `Upload registrado localmente: ${saved.fileName} · ${formatSize(saved.fileSize)}.`;
    if (latest) latest.textContent = `${saved.fileName} · ${formatSize(saved.fileSize)} · ${formatDateTime(saved.uploadedAt)}`;
  });
}

const currentMode = getPageMode();
const currentKey = getKey();
const currentTitle = currentMode === 'hub'
  ? 'Importar Relatórios'
  : (REPORTS[currentKey]?.titulo || 'Importar Relatórios');

initProtectedPage(currentTitle, (content) => {
  if (currentMode === 'hub') {
    renderHub(content);
    return;
  }
  renderDetail(content);
});
