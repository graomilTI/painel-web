(function () {
  const MODULE_ID = 'relatorios';
  const BUCKET = 'relatorios-uploads';
  const TABLE = 'relatorios_importacoes';
  const PAGE_SIZE = 12;

  const TIPO_LABELS = {
    patrimonio: 'Patrimônios',
    colaboradores: 'Colaboradores',
    historico: 'Histórico',
    producao: 'Produção',
    compras: 'Compras',
    despesas: 'Despesas',
    hospedagem: 'Hospedagem',
    frotas: 'Frotas',
    conferencia: 'Conferência',
    rh: 'RH',
    financeiro: 'Financeiro',
    outros: 'Outros'
  };

  const KEYWORDS = [
    { tipo: 'patrimonio', termos: ['patrimonio', 'patrimônio', 'inventario', 'inventário', 'ativo imobilizado'] },
    { tipo: 'colaboradores', termos: ['colaborador', 'funcionario', 'funcionário', 'folha', 'cadastro pessoal'] },
    { tipo: 'historico', termos: ['historico', 'histórico', 'movimentacao', 'movimentação', 'diario', 'diário'] },
    { tipo: 'producao', termos: ['producao', 'produção', 'produtividade', 'campo', 'apontamento'] },
    { tipo: 'compras', termos: ['compra', 'compras', 'pedido compra', 'cotacao', 'cotação', 'fornecedor'] },
    { tipo: 'despesas', termos: ['despesa', 'despesas', 'gasto', 'gastos', 'reembolso'] },
    { tipo: 'hospedagem', termos: ['hospedagem', 'hotel', 'alojamento', 'pernoite', 'estadia'] },
    { tipo: 'frotas', termos: ['frota', 'frotas', 'veiculo', 'veículo', 'km', 'manutencao veiculo', 'manutenção veículo'] },
    { tipo: 'conferencia', termos: ['conferencia', 'conferência', 'irregularidade', 'mapa', 'auditoria campo'] },
    { tipo: 'rh', termos: ['rh', 'recursos humanos', 'admissao', 'admissão', 'demissao', 'demissão'] },
    { tipo: 'financeiro', termos: ['financeiro', 'nfse', 'nfe', 'nota fiscal', 'pagamento', 'recebimento', 'contas pagar'] }
  ];

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function normalizeText(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
  }

  function humanFileSize(bytes) {
    const num = Number(bytes || 0);
    if (!num) return '-';
    const units = ['B', 'KB', 'MB', 'GB'];
    let idx = 0;
    let val = num;
    while (val >= 1024 && idx < units.length - 1) {
      val /= 1024;
      idx += 1;
    }
    return `${val.toFixed(val >= 10 || idx === 0 ? 0 : 1)} ${units[idx]}`;
  }

  function formatDateTime(value) {
    if (!value) return '-';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '-';
    return d.toLocaleString('pt-BR');
  }

  function extFromName(name) {
    const parts = String(name || '').split('.');
    return parts.length > 1 ? parts.pop().toLowerCase() : '';
  }

  function iconForTipo(tipo) {
    switch (tipo) {
      case 'patrimonio': return '📦';
      case 'colaboradores': return '👥';
      case 'historico': return '🕘';
      case 'producao': return '📊';
      case 'compras': return '🛒';
      case 'despesas': return '💸';
      case 'hospedagem': return '🏨';
      case 'frotas': return '🚚';
      case 'conferencia': return '✅';
      case 'rh': return '🧾';
      case 'financeiro': return '💰';
      default: return '📁';
    }
  }

  function guessTipo(filename) {
    const name = normalizeText(filename);
    for (const item of KEYWORDS) {
      if (item.termos.some((termo) => name.includes(normalizeText(termo)))) {
        return item.tipo;
      }
    }
    return 'outros';
  }

  function buildStoragePath(tipo, file) {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const cleanName = String(file.name || 'arquivo')
      .replace(/\s+/g, '_')
      .replace(/[^a-zA-Z0-9._-]/g, '_');
    const stamp = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    return `${tipo}/${yyyy}/${mm}/${dd}/${stamp}_${cleanName}`;
  }

  function getSupabaseClient(opts) {
    return opts?.supabase || window.supabase || window._supabase || null;
  }

  function createStyles() {
    return `
      <style>
        .rl-wrap{color:#e5e7eb;padding:20px;display:flex;flex-direction:column;gap:18px;font-family:Inter,system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
        .rl-card{background:#0f172a;border:1px solid rgba(148,163,184,.18);border-radius:18px;box-shadow:0 10px 30px rgba(0,0,0,.22)}
        .rl-header{display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap;align-items:center;padding:22px}
        .rl-title h2{margin:0;font-size:24px;font-weight:800}
        .rl-title p{margin:6px 0 0;color:#94a3b8;font-size:13px}
        .rl-actions{display:flex;gap:10px;flex-wrap:wrap}
        .rl-btn,.rl-file-label{appearance:none;border:none;border-radius:12px;padding:11px 16px;font-size:13px;font-weight:700;cursor:pointer;transition:.18s ease;display:inline-flex;align-items:center;gap:8px;text-decoration:none}
        .rl-btn.primary{background:#166534;color:#ecfdf5}.rl-btn.primary:hover{filter:brightness(1.06)}
        .rl-btn.secondary{background:#1e293b;color:#e5e7eb;border:1px solid rgba(148,163,184,.18)}
        .rl-btn.secondary:hover{background:#243244}
        .rl-btn.ghost{background:transparent;color:#cbd5e1;border:1px dashed rgba(148,163,184,.22)}
        .rl-btn[disabled]{opacity:.55;cursor:not-allowed}
        .rl-grid{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));gap:16px}
        .rl-panel{padding:18px}
        .rl-panel h3{margin:0 0 14px;font-size:16px}
        .rl-panel.col-4{grid-column:span 4}.rl-panel.col-8{grid-column:span 8}.rl-panel.col-12{grid-column:span 12}
        .rl-kpi{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px}
        .rl-kpi-card{background:#111c31;border:1px solid rgba(148,163,184,.12);border-radius:16px;padding:16px}
        .rl-kpi-card small{display:block;color:#94a3b8;font-size:12px;margin-bottom:8px}.rl-kpi-card strong{font-size:22px}
        .rl-upload-box{background:#111c31;border:1px dashed rgba(148,163,184,.25);border-radius:16px;padding:14px;display:flex;flex-direction:column;gap:12px;height:100%}
        .rl-upload-box p{margin:0;color:#94a3b8;font-size:13px;line-height:1.45}
        .rl-hidden{display:none !important}
        .rl-file-input{display:none}
        .rl-dropzone{border:1px dashed rgba(148,163,184,.25);border-radius:14px;padding:16px;background:#0b1324;min-height:110px;display:flex;align-items:center;justify-content:center;text-align:center;color:#cbd5e1;font-size:13px}
        .rl-dropzone.drag{border-color:#22c55e;background:rgba(22,101,52,.12)}
        .rl-help{font-size:12px;color:#94a3b8}
        .rl-form-row{display:flex;gap:10px;flex-wrap:wrap;align-items:center}
        .rl-input,.rl-select{width:100%;background:#0b1220;border:1px solid rgba(148,163,184,.18);border-radius:12px;padding:11px 12px;color:#e5e7eb;outline:none;color-scheme:dark}
        .rl-input::placeholder{color:#64748b}
        .rl-table-wrap{overflow:auto;border:1px solid rgba(148,163,184,.14);border-radius:16px}
        .rl-table{width:100%;border-collapse:collapse;min-width:940px}
        .rl-table th,.rl-table td{padding:13px 12px;border-bottom:1px solid rgba(148,163,184,.09);font-size:13px;text-align:left;vertical-align:middle}
        .rl-table th{background:#111c31;color:#cbd5e1;position:sticky;top:0;z-index:1}
        .rl-chip{display:inline-flex;align-items:center;gap:6px;border-radius:999px;padding:6px 10px;background:#102315;border:1px solid rgba(34,197,94,.22);color:#bbf7d0;font-size:12px;font-weight:700}
        .rl-file-cell{display:flex;align-items:center;gap:10px}
        .rl-file-meta{display:flex;flex-direction:column;gap:3px}.rl-file-meta strong{font-size:13px}.rl-file-meta span{font-size:12px;color:#94a3b8}
        .rl-status{font-size:12px;color:#94a3b8}
        .rl-progress{position:relative;height:12px;background:#0b1220;border-radius:999px;overflow:hidden;border:1px solid rgba(148,163,184,.12);min-width:120px}
        .rl-progress > i{position:absolute;left:0;top:0;bottom:0;background:linear-gradient(90deg,#166534,#22c55e);border-radius:999px}
        .rl-progress-label{font-size:12px;font-weight:700;color:#d1fae5;margin-left:10px}
        .rl-footer{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;padding-top:10px}
        .rl-pagination{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.rl-pagination span{color:#94a3b8;font-size:12px}
        .rl-batch-list{display:flex;flex-direction:column;gap:8px;max-height:220px;overflow:auto;padding-right:4px}
        .rl-batch-item{display:flex;justify-content:space-between;gap:12px;background:#0b1324;border:1px solid rgba(148,163,184,.1);border-radius:12px;padding:10px 12px}
        .rl-batch-item strong{font-size:13px}.rl-batch-item span{font-size:12px;color:#94a3b8}
        .rl-empty{padding:28px;text-align:center;color:#94a3b8}
        .rl-toast{position:fixed;right:24px;bottom:24px;z-index:9999;padding:14px 16px;border-radius:14px;background:#0f172a;color:#e5e7eb;border:1px solid rgba(148,163,184,.18);box-shadow:0 16px 40px rgba(0,0,0,.34);max-width:360px}
        .rl-link{color:#86efac;text-decoration:none;font-weight:700}.rl-link:hover{text-decoration:underline}
        @media (max-width:1100px){.rl-panel.col-4,.rl-panel.col-8{grid-column:span 12}.rl-kpi{grid-template-columns:repeat(2,minmax(0,1fr))}}
        @media (max-width:720px){.rl-wrap{padding:14px}.rl-header{padding:18px}.rl-kpi{grid-template-columns:1fr}.rl-table{min-width:760px}}
      </style>
    `;
  }

  function renderShell(container) {
    container.innerHTML = `
      ${createStyles()}
      <div class="rl-wrap" data-module="${MODULE_ID}">
        <section class="rl-card rl-header">
          <div class="rl-title">
            <h2>Relatórios</h2>
            <p>Upload individual, lote automático por nome do arquivo, histórico e status consolidado no painel.</p>
          </div>
          <div class="rl-actions">
            <button class="rl-btn secondary" data-action="refresh">Atualizar</button>
            <button class="rl-btn primary" data-action="go-import">Importar arquivos</button>
          </div>
        </section>

        <section class="rl-card rl-panel col-12">
          <div class="rl-kpi" id="rl-kpis"></div>
        </section>

        <section class="rl-grid">
          <div class="rl-card rl-panel col-4">
            <h3>Upload individual</h3>
            <div class="rl-upload-box">
              <p>Envie um arquivo manualmente e escolha a categoria ou deixe a classificação automática pelo nome.</p>
              <label class="rl-file-label rl-btn secondary">
                <span>Selecionar arquivo</span>
                <input type="file" class="rl-file-input" id="rl-single-file" />
              </label>
              <input class="rl-input" id="rl-single-name" placeholder="Nenhum arquivo selecionado" readonly />
              <select class="rl-select" id="rl-single-tipo">
                <option value="auto">Classificar automaticamente</option>
              </select>
              <div class="rl-form-row">
                <button class="rl-btn primary" id="rl-upload-single">Enviar arquivo</button>
              </div>
              <div class="rl-help">Extensões comuns: xlsx, xls, csv, pdf, zip.</div>
            </div>
          </div>

          <div class="rl-card rl-panel col-8">
            <h3>Upload em lote automático</h3>
            <div class="rl-upload-box">
              <div class="rl-dropzone" id="rl-dropzone">Arraste vários arquivos aqui ou use o botão abaixo. O sistema identifica a base correta pelo nome do arquivo.</div>
              <div class="rl-form-row">
                <label class="rl-file-label rl-btn secondary">
                  <span>Selecionar arquivos</span>
                  <input type="file" class="rl-file-input" id="rl-batch-files" multiple />
                </label>
                <button class="rl-btn primary" id="rl-upload-batch">Enviar lote</button>
                <button class="rl-btn ghost" id="rl-clear-batch">Limpar fila</button>
              </div>
              <div class="rl-help">Exemplo: patrimonio_abril.xlsx, historico_colaboradores.csv, compras_regional_sul.xlsx.</div>
              <div class="rl-batch-list" id="rl-batch-list">
                <div class="rl-empty">Nenhum arquivo na fila.</div>
              </div>
            </div>
          </div>
        </section>

        <section class="rl-card rl-panel col-12">
          <div class="rl-form-row" style="justify-content:space-between;margin-bottom:14px;gap:14px">
            <h3 style="margin:0">Histórico de importações</h3>
            <div class="rl-form-row" style="min-width:min(100%,720px)">
              <input class="rl-input" id="rl-search" placeholder="Buscar por arquivo, tipo ou usuário" style="flex:1;min-width:180px" />
              <select class="rl-select" id="rl-filter-tipo" style="max-width:220px"></select>
            </div>
          </div>
          <div class="rl-table-wrap">
            <table class="rl-table">
              <thead>
                <tr>
                  <th>Arquivo</th>
                  <th>Tipo</th>
                  <th>Enviado em</th>
                  <th>Tamanho</th>
                  <th>Status</th>
                  <th>Usuário</th>
                  <th>Ação</th>
                </tr>
              </thead>
              <tbody id="rl-history-body">
                <tr><td colspan="7" class="rl-empty">Carregando histórico...</td></tr>
              </tbody>
            </table>
          </div>
          <div class="rl-footer">
            <div class="rl-status" id="rl-history-status">-</div>
            <div class="rl-pagination">
              <button class="rl-btn secondary" id="rl-prev-page">Anterior</button>
              <span id="rl-page-info">Página 1</span>
              <button class="rl-btn secondary" id="rl-next-page">Próxima</button>
            </div>
          </div>
        </section>

        <section class="rl-card rl-panel col-12">
          <div class="rl-form-row" style="justify-content:space-between;margin-bottom:14px;gap:14px">
            <h3 style="margin:0">Status por categoria</h3>
            <div class="rl-status">Resumo baseado nas importações registradas na tabela <strong>${TABLE}</strong>.</div>
          </div>
          <div class="rl-table-wrap">
            <table class="rl-table">
              <thead>
                <tr>
                  <th>Categoria</th>
                  <th>Total</th>
                  <th>Hoje</th>
                  <th>Último envio</th>
                  <th>Progresso</th>
                </tr>
              </thead>
              <tbody id="rl-status-body">
                <tr><td colspan="5" class="rl-empty">Carregando status...</td></tr>
              </tbody>
            </table>
          </div>
        </section>
      </div>
    `;
  }

  function fillTipoSelect(select, includeAuto) {
    const options = [];
    if (includeAuto) options.push('<option value="auto">Classificar automaticamente</option>');
    options.push('<option value="todos">Todos os tipos</option>');
    Object.entries(TIPO_LABELS).forEach(([value, label]) => {
      options.push(`<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`);
    });
    select.innerHTML = options.join('');
  }

  function createState(container, opts) {
    return {
      container,
      supabase: getSupabaseClient(opts),
      page: 1,
      allRows: [],
      filteredRows: [],
      batchFiles: [],
      loading: false,
      opts: opts || {}
    };
  }

  function getElements(state) {
    const $ = (sel) => state.container.querySelector(sel);
    return {
      kpis: $('#rl-kpis'),
      singleFile: $('#rl-single-file'),
      singleName: $('#rl-single-name'),
      singleTipo: $('#rl-single-tipo'),
      uploadSingle: $('#rl-upload-single'),
      batchInput: $('#rl-batch-files'),
      batchList: $('#rl-batch-list'),
      uploadBatch: $('#rl-upload-batch'),
      clearBatch: $('#rl-clear-batch'),
      dropzone: $('#rl-dropzone'),
      search: $('#rl-search'),
      filterTipo: $('#rl-filter-tipo'),
      historyBody: $('#rl-history-body'),
      historyStatus: $('#rl-history-status'),
      prevPage: $('#rl-prev-page'),
      nextPage: $('#rl-next-page'),
      pageInfo: $('#rl-page-info'),
      statusBody: $('#rl-status-body'),
      refreshBtn: state.container.querySelector('[data-action="refresh"]'),
      goImportBtn: state.container.querySelector('[data-action="go-import"]')
    };
  }

  function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = 'rl-toast';
    const colors = {
      success: '#16a34a',
      error: '#dc2626',
      info: '#334155'
    };
    toast.style.borderLeft = `4px solid ${colors[type] || colors.info}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(12px)';
      toast.style.transition = '.22s ease';
      setTimeout(() => toast.remove(), 220);
    }, 2800);
  }

  function setBusy(elements, busy) {
    elements.uploadSingle.disabled = busy;
    elements.uploadBatch.disabled = busy;
    elements.clearBatch.disabled = busy;
  }

  async function fetchHistorico(state) {
    if (!state.supabase) throw new Error('Cliente Supabase não encontrado.');
    const { data, error } = await state.supabase
      .from(TABLE)
      .select('*')
      .order('created_at', { ascending: false })
      .limit(500);
    if (error) throw error;
    state.allRows = Array.isArray(data) ? data : [];
    state.filteredRows = [...state.allRows];
  }

  function renderKPIs(state, elements) {
    const rows = state.allRows || [];
    const today = new Date().toLocaleDateString('pt-BR');
    const total = rows.length;
    const todayCount = rows.filter((r) => formatDateTime(r.created_at).startsWith(today)).length;
    const tipos = new Set(rows.map((r) => r.tipo || 'outros')).size;
    const totalBytes = rows.reduce((sum, r) => sum + Number(r.tamanho_bytes || 0), 0);

    const cards = [
      ['Total de uploads', String(total)],
      ['Uploads hoje', String(todayCount)],
      ['Categorias usadas', String(tipos)],
      ['Volume registrado', humanFileSize(totalBytes)]
    ];

    elements.kpis.innerHTML = cards.map(([label, value]) => `
      <div class="rl-kpi-card">
        <small>${escapeHtml(label)}</small>
        <strong>${escapeHtml(value)}</strong>
      </div>
    `).join('');
  }

  function applyFilters(state, elements) {
    const q = normalizeText(elements.search.value);
    const tipo = elements.filterTipo.value;

    state.filteredRows = state.allRows.filter((row) => {
      const rowTipo = row.tipo || 'outros';
      const haystack = normalizeText([
        row.nome_arquivo,
        row.tipo,
        row.usuario_nome,
        row.usuario_email,
        row.path,
        row.status
      ].join(' '));

      const okTipo = tipo === 'todos' || rowTipo === tipo;
      const okQuery = !q || haystack.includes(q);
      return okTipo && okQuery;
    });

    state.page = 1;
    renderHistory(state, elements);
  }

  function renderHistory(state, elements) {
    const total = state.filteredRows.length;
    const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    if (state.page > pages) state.page = pages;
    const start = (state.page - 1) * PAGE_SIZE;
    const end = start + PAGE_SIZE;
    const rows = state.filteredRows.slice(start, end);

    if (!rows.length) {
      elements.historyBody.innerHTML = '<tr><td colspan="7" class="rl-empty">Nenhum registro encontrado.</td></tr>';
    } else {
      elements.historyBody.innerHTML = rows.map((r) => {
        const tipo = r.tipo || 'outros';
        const label = TIPO_LABELS[tipo] || tipo;
        const user = r.usuario_nome || r.usuario_email || '-';
        const ext = extFromName(r.nome_arquivo);
        const status = r.status || 'Concluído';
        const url = r.url || '#';
        return `
          <tr>
            <td>
              <div class="rl-file-cell">
                <div style="font-size:20px">${iconForTipo(tipo)}</div>
                <div class="rl-file-meta">
                  <strong>${escapeHtml(r.nome_arquivo || '-')}</strong>
                  <span>${escapeHtml(ext ? ext.toUpperCase() : 'ARQ')} • ${escapeHtml(r.path || '-')}</span>
                </div>
              </div>
            </td>
            <td><span class="rl-chip">${iconForTipo(tipo)} ${escapeHtml(label)}</span></td>
            <td>${escapeHtml(formatDateTime(r.created_at))}</td>
            <td>${escapeHtml(humanFileSize(r.tamanho_bytes))}</td>
            <td>${escapeHtml(status)}</td>
            <td>${escapeHtml(user)}</td>
            <td>${url && url !== '#' ? `<a class="rl-link" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">Abrir</a>` : '-'}</td>
          </tr>
        `;
      }).join('');
    }

    elements.historyStatus.textContent = `${total} registro(s) encontrado(s)`;
    elements.pageInfo.textContent = `Página ${state.page} de ${pages}`;
    elements.prevPage.disabled = state.page <= 1;
    elements.nextPage.disabled = state.page >= pages;
  }

  function renderStatus(state, elements) {
    const totalRows = state.allRows.length || 1;
    const todayString = new Date().toLocaleDateString('pt-BR');

    const grouped = Object.keys(TIPO_LABELS).map((tipo) => {
      const rows = state.allRows.filter((r) => (r.tipo || 'outros') === tipo);
      const last = rows[0]?.created_at || null;
      const todayCount = rows.filter((r) => formatDateTime(r.created_at).startsWith(todayString)).length;
      return {
        tipo,
        total: rows.length,
        todayCount,
        last,
        progress: Math.round((rows.length / totalRows) * 100)
      };
    });

    elements.statusBody.innerHTML = grouped.map((item) => `
      <tr>
        <td><span class="rl-chip">${iconForTipo(item.tipo)} ${escapeHtml(TIPO_LABELS[item.tipo])}</span></td>
        <td>${item.total}</td>
        <td>${item.todayCount}</td>
        <td>${escapeHtml(formatDateTime(item.last))}</td>
        <td>
          <div style="display:flex;align-items:center">
            <div class="rl-progress"><i style="width:${item.progress}%"></i></div>
            <span class="rl-progress-label">${item.progress}%</span>
          </div>
        </td>
      </tr>
    `).join('');
  }

  function renderBatchQueue(state, elements) {
    const files = state.batchFiles;
    if (!files.length) {
      elements.batchList.innerHTML = '<div class="rl-empty">Nenhum arquivo na fila.</div>';
      return;
    }
    elements.batchList.innerHTML = files.map((file, idx) => {
      const tipo = guessTipo(file.name);
      return `
        <div class="rl-batch-item">
          <div>
            <strong>${escapeHtml(file.name)}</strong>
            <span>${escapeHtml(TIPO_LABELS[tipo] || tipo)} • ${escapeHtml(humanFileSize(file.size))}</span>
          </div>
          <button class="rl-btn secondary" data-remove-batch="${idx}">Remover</button>
        </div>
      `;
    }).join('');

    elements.batchList.querySelectorAll('[data-remove-batch]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.getAttribute('data-remove-batch'));
        state.batchFiles.splice(idx, 1);
        renderBatchQueue(state, elements);
      });
    });
  }

  function setSingleFileName(elements, file) {
    elements.singleName.value = file ? file.name : '';
    if (file && elements.singleTipo.value === 'auto') {
      const tipo = guessTipo(file.name);
      elements.singleName.value = `${file.name}  |  tipo sugerido: ${TIPO_LABELS[tipo] || tipo}`;
    }
  }

  async function getCurrentUserMeta(state) {
    const auth = await state.supabase.auth.getUser();
    const user = auth?.data?.user || null;
    return {
      userId: user?.id || null,
      usuario_nome: user?.user_metadata?.name || user?.user_metadata?.nome || '',
      usuario_email: user?.email || ''
    };
  }

  async function uploadOne(state, file, forcedTipo) {
    const supabase = state.supabase;
    const tipo = !forcedTipo || forcedTipo === 'auto' ? guessTipo(file.name) : forcedTipo;
    const path = buildStoragePath(tipo, file);

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(path, file, { upsert: false, contentType: file.type || undefined });
    if (uploadError) throw uploadError;

    const { data: publicData } = supabase.storage.from(BUCKET).getPublicUrl(path);
    const userMeta = await getCurrentUserMeta(state);

    const payload = {
      nome_arquivo: file.name,
      tipo,
      path,
      url: publicData?.publicUrl || '',
      tamanho_bytes: file.size || 0,
      mime_type: file.type || null,
      status: 'Concluído',
      usuario_id: userMeta.userId,
      usuario_nome: userMeta.usuario_nome,
      usuario_email: userMeta.usuario_email
    };

    const { error: insertError } = await supabase.from(TABLE).insert(payload);
    if (insertError) throw insertError;

    return { tipo, path, url: payload.url };
  }

  async function reloadAll(state, elements) {
    await fetchHistorico(state);
    renderKPIs(state, elements);
    renderHistory(state, elements);
    renderStatus(state, elements);
  }

  function bindEvents(state, elements) {
    fillTipoSelect(elements.singleTipo, true);
    fillTipoSelect(elements.filterTipo, false);
    elements.filterTipo.value = 'todos';

    elements.singleFile.addEventListener('change', () => {
      const file = elements.singleFile.files?.[0] || null;
      setSingleFileName(elements, file);
    });

    elements.singleTipo.addEventListener('change', () => {
      const file = elements.singleFile.files?.[0] || null;
      setSingleFileName(elements, file);
    });

    elements.batchInput.addEventListener('change', () => {
      const files = Array.from(elements.batchInput.files || []);
      state.batchFiles = files;
      renderBatchQueue(state, elements);
    });

    ['dragenter', 'dragover'].forEach((evt) => {
      elements.dropzone.addEventListener(evt, (e) => {
        e.preventDefault();
        e.stopPropagation();
        elements.dropzone.classList.add('drag');
      });
    });

    ['dragleave', 'drop'].forEach((evt) => {
      elements.dropzone.addEventListener(evt, (e) => {
        e.preventDefault();
        e.stopPropagation();
        elements.dropzone.classList.remove('drag');
      });
    });

    elements.dropzone.addEventListener('drop', (e) => {
      const files = Array.from(e.dataTransfer?.files || []);
      if (!files.length) return;
      state.batchFiles = files;
      renderBatchQueue(state, elements);
    });

    elements.clearBatch.addEventListener('click', () => {
      state.batchFiles = [];
      elements.batchInput.value = '';
      renderBatchQueue(state, elements);
    });

    elements.uploadSingle.addEventListener('click', async () => {
      const file = elements.singleFile.files?.[0];
      if (!file) return showToast('Selecione um arquivo para upload.', 'error');
      try {
        setBusy(elements, true);
        const forcedTipo = elements.singleTipo.value;
        const result = await uploadOne(state, file, forcedTipo);
        elements.singleFile.value = '';
        elements.singleName.value = '';
        elements.singleTipo.value = 'auto';
        await reloadAll(state, elements);
        showToast(`Arquivo enviado para ${TIPO_LABELS[result.tipo] || result.tipo}.`, 'success');
      } catch (err) {
        console.error(err);
        showToast(`Erro no upload individual: ${err.message || err}`, 'error');
      } finally {
        setBusy(elements, false);
      }
    });

    elements.uploadBatch.addEventListener('click', async () => {
      if (!state.batchFiles.length) return showToast('Adicione arquivos na fila do lote.', 'error');
      try {
        setBusy(elements, true);
        let ok = 0;
        for (const file of state.batchFiles) {
          await uploadOne(state, file, 'auto');
          ok += 1;
        }
        state.batchFiles = [];
        elements.batchInput.value = '';
        renderBatchQueue(state, elements);
        await reloadAll(state, elements);
        showToast(`${ok} arquivo(s) enviados com sucesso.`, 'success');
      } catch (err) {
        console.error(err);
        showToast(`Erro no lote: ${err.message || err}`, 'error');
      } finally {
        setBusy(elements, false);
      }
    });

    elements.search.addEventListener('input', () => applyFilters(state, elements));
    elements.filterTipo.addEventListener('change', () => applyFilters(state, elements));

    elements.prevPage.addEventListener('click', () => {
      if (state.page > 1) state.page -= 1;
      renderHistory(state, elements);
    });

    elements.nextPage.addEventListener('click', () => {
      const pages = Math.max(1, Math.ceil(state.filteredRows.length / PAGE_SIZE));
      if (state.page < pages) state.page += 1;
      renderHistory(state, elements);
    });

    elements.refreshBtn.addEventListener('click', async () => {
      try {
        setBusy(elements, true);
        await reloadAll(state, elements);
        showToast('Dados atualizados.', 'success');
      } catch (err) {
        console.error(err);
        showToast(`Erro ao atualizar: ${err.message || err}`, 'error');
      } finally {
        setBusy(elements, false);
      }
    });

    elements.goImportBtn.addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      elements.singleFile.click();
    });
  }

  async function openHome(container, opts = {}) {
    const state = createState(container, opts);
    renderShell(container);
    const elements = getElements(state);

    if (!state.supabase) {
      elements.kpis.innerHTML = '<div class="rl-kpi-card"><small>Erro</small><strong>Supabase não disponível</strong></div>';
      elements.historyBody.innerHTML = '<tr><td colspan="7" class="rl-empty">Cliente Supabase não encontrado no módulo.</td></tr>';
      elements.statusBody.innerHTML = '<tr><td colspan="5" class="rl-empty">Configure window.supabase ou envie opts.supabase.</td></tr>';
      return;
    }

    bindEvents(state, elements);

    try {
      setBusy(elements, true);
      await reloadAll(state, elements);
      renderBatchQueue(state, elements);
    } catch (err) {
      console.error(err);
      elements.historyBody.innerHTML = `<tr><td colspan="7" class="rl-empty">Erro ao carregar histórico: ${escapeHtml(err.message || String(err))}</td></tr>`;
      elements.statusBody.innerHTML = `<tr><td colspan="5" class="rl-empty">Erro ao carregar status: ${escapeHtml(err.message || String(err))}</td></tr>`;
      showToast(`Erro ao iniciar módulo: ${err.message || err}`, 'error');
    } finally {
      setBusy(elements, false);
    }
  }

  window.RELATORIOS = { openHome };
})();
