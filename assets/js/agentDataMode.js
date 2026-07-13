const ROUTES_WITH_AGENT_DATA = new Set([
  'dashboard',
  'dashboard-socio',
  'desempenho',
  'metas',
  'dre',
  'adm-logistica',
  'btg-logistica',
  'logistica-informativos',
  'importar-relatorios',
  'consultar-producao',
  'consultar-colaboradores',
  'importar-patrimonios',
  'notas-fiscais',
  'financeiro',
  'adm-patrimonio',
  'patrimonios',
]);

const ROUTE_LABELS = {
  dashboard: 'Dashboard',
  'dashboard-socio': 'Dashboard do Sócio',
  desempenho: 'Desempenho',
  metas: 'Metas',
  dre: 'DRE',
  financeiro: 'Financeiro',
  'notas-fiscais': 'Notas Fiscais',
  'consultar-colaboradores': 'Colaboradores',
  'consultar-producao': 'Produção',
  'logistica-informativos': 'Informativos de Logística',
  patrimonios: 'Patrimônios',
  'adm-patrimonio': 'Patrimônios',
};

function routeName() {
  const last = String(window.location.pathname || '')
    .split('/')
    .filter(Boolean)
    .pop() || 'dashboard';
  return last.replace(/\.html$/i, '').toLowerCase();
}

function injectStyles() {
  if (document.getElementById('agentDataModeStyles')) return;
  const style = document.createElement('style');
  style.id = 'agentDataModeStyles';
  style.textContent = `
    .agent-data-note{display:flex;align-items:flex-start;gap:10px;border:1px solid rgba(45,212,160,.20);background:rgba(45,212,160,.08);color:#c7f9e5;border-radius:16px;padding:12px 14px;margin-top:14px;font-size:13px;line-height:1.45}
    .agent-data-note strong{color:#ecfdf5}.agent-data-note span:first-child{font-size:16px;line-height:1.2}.agent-data-note small{display:block;color:#94a3b8;margin-top:2px}
    .agent-data-note.agent-data-note-compact{margin:0 0 14px}.agent-data-note.agent-data-note-compact + .agent-data-note{display:none}
    .agent-data-manual{border-style:dashed!important;opacity:.92}.agent-data-manual .btg-upload-hint,.agent-data-manual small{color:#94a3b8!important}
    .agent-data-optional-label{display:inline-flex;align-items:center;margin-left:6px;padding:2px 7px;border-radius:999px;background:rgba(59,130,246,.12);border:1px solid rgba(59,130,246,.22);color:#bfdbfe;font-size:10px;font-weight:900;text-transform:uppercase;letter-spacing:.04em;vertical-align:middle}
  `;
  document.head.appendChild(style);
}

function ensureNote(container, html, id, prepend = false) {
  if (!container || document.getElementById(id)) return;
  const note = document.createElement('div');
  note.id = id;
  note.className = 'agent-data-note';
  note.innerHTML = html;
  if (prepend) container.prepend(note);
  else container.appendChild(note);
}

function replaceText(node, from, to) {
  if (!node) return;
  const current = node.textContent || '';
  if (current.includes(to)) return;
  if (from instanceof RegExp) node.textContent = current.replace(from, to);
  else node.textContent = current.replace(from, to);
}

function markManualArea(area) {
  if (!area) return;
  area.classList.add('agent-data-manual');
}

function patchGenericAgentPage(content, route) {
  const label = ROUTE_LABELS[route] || 'Esta tela';
  const target = content.querySelector('section.card, .card') || content;
  ensureNote(
    target,
    `<span>✓</span><div><strong>${label} com atualização automática.</strong><small>Os dados desta tela são abastecidos pelos agentes. Use importações manuais apenas para correção pontual, contingência ou carga histórica.</small></div>`,
    `agentDataGenericNote-${route}`,
    true
  );
  const note = document.getElementById(`agentDataGenericNote-${route}`);
  if (note) note.classList.add('agent-data-note-compact');
}

function patchBtg(content) {
  const section = content.querySelector('.btg-upload-area')?.closest('section.card') || content.querySelector('section.card');
  const subtitle = section?.querySelector('.section-head .muted');
  if (subtitle) {
    subtitle.textContent = 'Dados carregados automaticamente pelos agentes Lista de OS, Distribuição de OS e BTG. O upload manual fica disponível apenas para reprocessamento ou contingência.';
  }

  const uploadArea = content.querySelector('.btg-upload-area');
  markManualArea(uploadArea);
  ensureNote(uploadArea, '<span>↻</span><div><strong>Dados automáticos ativos.</strong><small>Use o upload somente se precisar reprocessar um arquivo pontual ou corrigir uma exceção antes da próxima sincronização.</small></div>', 'btgAgentDataNote');

  const fileLabel = uploadArea?.querySelector('.btg-file-label');
  if (fileLabel && !fileLabel.dataset.agentDataLabel) {
    fileLabel.dataset.agentDataLabel = '1';
    fileLabel.childNodes.forEach((node) => {
      if (node.nodeType === Node.TEXT_NODE && node.textContent.includes('Carregar relatório')) {
        node.textContent = ' Reprocessar relatório manual';
      }
    });
  }

  const hint = uploadArea?.querySelector('.btg-upload-hint');
  if (hint) hint.textContent = 'Opcional: envie arquivos apenas quando quiser sobrescrever/reprocessar dados antes da próxima sincronização automática.';

  content.querySelectorAll('.btg-chip-file').forEach((chip) => {
    replaceText(chip, /— aguardando/g, '— base automática ou arquivo manual');
  });

  const empty = content.querySelector('.btg-empty');
  if (empty && /Carregue os relatórios xlsx/i.test(empty.textContent || '')) {
    empty.textContent = 'Nenhuma O.S. BTG encontrada na base automática. Confira se os agentes já sincronizaram ou use o reprocessamento manual como contingência.';
  }
}

function patchAdmLogistica(content) {
  const fobSection = content.querySelector('#section-fob');
  if (!fobSection) return;

  const fobIntro = fobSection.querySelector('.section-head .muted');
  if (fobIntro) {
    fobIntro.textContent = 'Comparação baseada nos dados sincronizados pelos agentes. Os arquivos continuam disponíveis apenas para conferência manual ou contingência.';
  }

  const subcardTitle = [...fobSection.querySelectorAll('h4')].find((h) => /Importar arquivos/i.test(h.textContent || ''));
  if (subcardTitle) subcardTitle.innerHTML = 'Reprocessamento manual de arquivos <span class="agent-data-optional-label">opcional</span>';

  fobSection.querySelectorAll('.log-upload-card span').forEach((span) => {
    span.textContent = (span.textContent || '').replace(/\s*\*\s*$/g, '');
  });

  fobSection.querySelectorAll('.log-upload-card small').forEach((small) => {
    const txt = small.textContent || '';
    if (!txt.includes('Opcional')) small.textContent = `Opcional · ${txt}`;
  });

  fobSection.querySelectorAll('.log-upload-card').forEach(markManualArea);

  const note = fobSection.querySelector('.log-note');
  if (note && !note.dataset.agentDataMode) {
    note.dataset.agentDataMode = '1';
    note.innerHTML = 'Os dados principais vêm dos agentes de sincronização. Use esta importação manual somente para reprocessar arquivos antigos ou tratar exceções antes da próxima atualização automática.';
  }

  const result = fobSection.querySelector('#fobReportResult .log-empty');
  if (result && /Anexe os arquivos/i.test(result.textContent || '')) {
    result.innerHTML = 'A comparação automática usa a base sincronizada pelos agentes. Para uma conferência pontual, selecione arquivos e clique em <strong>Gerar relatório FOB</strong>.';
  }
}

function patchImportador(content) {
  const firstCard = content.querySelector('section.card, .card') || content;
  ensureNote(firstCard, '<span>✓</span><div><strong>Uploads manuais viraram contingência.</strong><small>Os relatórios principais são abastecidos pelos agentes. Use esta tela apenas para importação excepcional, correção ou carga histórica.</small></div>', 'importadorAgentDataNote');
}

function patchDreAutoProcess(content) {
  const refreshButton = content.querySelector('#refreshDre');
  if (!refreshButton) return;

  const status = content.querySelector('#dreStatus');
  const yearSelect = content.querySelector('#yearSelect');

  if (!refreshButton.dataset.agentDataModeLabel) {
    refreshButton.dataset.agentDataModeLabel = '1';
    refreshButton.textContent = 'Atualizar DRE';
  }

  if (status && /Aguardando processamento/i.test(status.textContent || '')) {
    status.innerHTML = '<strong>Carregando DRE automaticamente.</strong> Aguarde enquanto o painel processa os dados sincronizados.';
  }

  if (yearSelect && !yearSelect.dataset.agentDataModeDreBound) {
    yearSelect.dataset.agentDataModeDreBound = '1';
    yearSelect.addEventListener('change', () => {
      window.setTimeout(() => {
        if (!refreshButton.disabled) refreshButton.click();
      }, 0);
    });
  }

  if (refreshButton.dataset.agentDataModeAutoStarted === '1') return;
  refreshButton.dataset.agentDataModeAutoStarted = '1';

  window.requestAnimationFrame(() => {
    if (!refreshButton.disabled) refreshButton.click();
  });
}

function patchLogisticaInformativos(content) {
  const loadDatabaseButton = content.querySelector('#liLoadDatabase');
  const generateButton = content.querySelector('#liGenerate');
  const fileButton = content.querySelector('#liFileButton');
  const fileHint = content.querySelector('#liFileHint');
  const reportPages = content.querySelector('#liReportPages');
  if (!loadDatabaseButton || !generateButton) return;

  if (!loadDatabaseButton.dataset.agentDataModeLabel) {
    loadDatabaseButton.dataset.agentDataModeLabel = '1';
    loadDatabaseButton.textContent = 'Atualizar base sincronizada';
  }
  if (!generateButton.dataset.agentDataModeLabel) {
    generateButton.dataset.agentDataModeLabel = '1';
    generateButton.textContent = 'Atualizar informativo';
  }
  if (fileButton && !fileButton.dataset.agentDataModeLabel) {
    fileButton.dataset.agentDataModeLabel = '1';
    fileButton.textContent = 'Importar arquivo manual';
    fileButton.classList.add('btn-secondary');
  }
  if (fileHint && /Resultado Diário/i.test(fileHint.textContent || '')) {
    fileHint.textContent = 'Base sincronizada automaticamente. O arquivo manual substitui temporariamente os dados apenas para contingência.';
  }
  if (reportPages && /Carregue a fonte/i.test(reportPages.textContent || '')) {
    reportPages.innerHTML = '<div class="li-empty">Carregando dados sincronizados para gerar o informativo...</div>';
  }

  const runGenerate = () => {
    window.setTimeout(() => {
      if (!generateButton.disabled) generateButton.click();
    }, 0);
  };

  ['#liDateFrom', '#liDateTo', '#liMinimumLoads', '#liRecentDays'].forEach((selector) => {
    const input = content.querySelector(selector);
    if (!input || input.dataset.agentDataModeFilterBound === '1') return;
    input.dataset.agentDataModeFilterBound = '1';
    input.addEventListener('change', runGenerate);
    input.addEventListener('input', runGenerate);
  });

  content.querySelectorAll('[data-mode]').forEach((button) => {
    if (button.dataset.agentDataModeModeBound === '1') return;
    button.dataset.agentDataModeModeBound = '1';
    button.addEventListener('click', () => {
      window.setTimeout(() => {
        if (button.dataset.mode === 'volume' && !loadDatabaseButton.disabled) loadDatabaseButton.click();
      }, 0);
    });
  });

  if (content.dataset.agentDataModeInformativosLoaded === '1') return;
  content.dataset.agentDataModeInformativosLoaded = '1';
  window.requestAnimationFrame(() => {
    if (!loadDatabaseButton.disabled) loadDatabaseButton.click();
  });
}

function applyPatches(content = document.getElementById('pageContent')) {
  if (!content) return;
  const route = routeName();
  if (!ROUTES_WITH_AGENT_DATA.has(route)) return;

  injectStyles();
  if (route === 'dre') {
    patchGenericAgentPage(content, route);
    patchDreAutoProcess(content);
  } else if (route === 'logistica-informativos') {
    patchGenericAgentPage(content, route);
    patchLogisticaInformativos(content);
  } else if (route === 'btg-logistica') patchBtg(content);
  else if (route === 'adm-logistica') patchAdmLogistica(content);
  else if (route === 'importar-relatorios' || route === 'importar-patrimonios') patchImportador(content);
  else patchGenericAgentPage(content, route);
}

export function initAgentDataMode(content) {
  applyPatches(content);

  const target = content || document.getElementById('pageContent');
  if (!target || target.dataset.agentDataModeObserver === '1') return;
  target.dataset.agentDataModeObserver = '1';

  const observer = new MutationObserver(() => applyPatches(target));
  observer.observe(target, { childList: true, subtree: true, characterData: true });
}
