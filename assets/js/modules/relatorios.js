(function () {
  const BUCKET = 'relatorios-uploads';
  const DIRECT_UPLOAD_LIMIT = 45 * 1024 * 1024;
  const CHUNK_SIZE = 8 * 1024 * 1024;
  const MAX_ENTERPRISE_SIZE = 1024 * 1024 * 1024;

  const styles = `
    <style>
      .relatorios-importacao {
        --ri-bg: #020617;
        --ri-card: rgba(15, 23, 42, .78);
        --ri-card-2: rgba(2, 6, 23, .78);
        --ri-border: rgba(34, 197, 94, .25);
        --ri-border-soft: rgba(148, 163, 184, .16);
        --ri-text: #e5e7eb;
        --ri-muted: #94a3b8;
        --ri-green: #22c55e;
        --ri-green-2: #16a34a;
        --ri-red: #ef4444;
        --ri-yellow: #f59e0b;
        color: var(--ri-text);
      }

      .relatorios-grid {
        display: grid;
        grid-template-columns: minmax(0, 1fr);
        gap: 18px;
      }

      .import-card {
        border: 1px solid var(--ri-border-soft);
        background:
          radial-gradient(circle at top left, rgba(34, 197, 94, .16), transparent 34%),
          linear-gradient(145deg, rgba(15, 23, 42, .92), rgba(2, 6, 23, .72));
        border-radius: 22px;
        padding: 18px;
        box-shadow: 0 22px 60px rgba(0, 0, 0, .22);
      }

      .import-head {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 16px;
        margin-bottom: 16px;
      }

      .import-title {
        margin: 0;
        font-size: 18px;
        font-weight: 800;
        letter-spacing: -.02em;
      }

      .import-subtitle {
        margin: 6px 0 0;
        color: var(--ri-muted);
        font-size: 13px;
      }

      .dropzone {
        position: relative;
        border: 2px dashed rgba(34, 197, 94, .55);
        border-radius: 22px;
        padding: 30px 22px;
        min-height: 118px;
        display: flex;
        align-items: center;
        justify-content: center;
        text-align: center;
        background:
          linear-gradient(180deg, rgba(2, 6, 23, .9), rgba(2, 6, 23, .58)),
          radial-gradient(circle at center, rgba(22, 101, 52, .24), transparent 58%);
        cursor: pointer;
        transition: transform .18s ease, border-color .18s ease, background .18s ease, box-shadow .18s ease;
      }

      .dropzone:hover,
      .dropzone.is-dragging {
        transform: translateY(-1px);
        border-color: rgba(34, 197, 94, .95);
        box-shadow: 0 0 0 4px rgba(34, 197, 94, .08);
        background:
          linear-gradient(180deg, rgba(2, 6, 23, .88), rgba(2, 6, 23, .68)),
          radial-gradient(circle at center, rgba(34, 197, 94, .2), transparent 62%);
      }

      .dropzone-main {
        font-weight: 800;
        font-size: 15px;
      }

      .dropzone-hint {
        margin-top: 7px;
        color: var(--ri-muted);
        font-size: 12px;
      }

      .file-list {
        display: grid;
        gap: 10px;
        margin-top: 16px;
      }

      .file-empty {
        padding: 16px;
        color: var(--ri-muted);
        border: 1px solid var(--ri-border-soft);
        border-radius: 16px;
        background: rgba(2, 6, 23, .38);
        font-size: 13px;
      }

      .file-item {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        align-items: center;
        gap: 14px;
        padding: 13px 14px;
        border: 1px solid var(--ri-border-soft);
        border-radius: 16px;
        background: rgba(2, 6, 23, .42);
      }

      .file-name {
        display: flex;
        align-items: center;
        gap: 10px;
        min-width: 0;
        font-weight: 700;
      }

      .file-name span:last-child {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .file-meta {
        margin-top: 5px;
        color: var(--ri-muted);
        font-size: 12px;
      }

      .file-right {
        min-width: 220px;
        display: grid;
        gap: 8px;
      }

      .file-status-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
      }

      .file-status {
        font-size: 12px;
        color: var(--ri-muted);
        white-space: nowrap;
      }

      .file-remove {
        border: 0;
        background: rgba(148, 163, 184, .08);
        color: #cbd5e1;
        border-radius: 10px;
        height: 30px;
        padding: 0 10px;
        cursor: pointer;
      }

      .file-remove:hover { background: rgba(239, 68, 68, .14); color: #fecaca; }
      .file-remove:disabled { opacity: .45; cursor: not-allowed; }

      .progress {
        height: 8px;
        background: rgba(30, 41, 59, .92);
        border-radius: 999px;
        overflow: hidden;
      }

      .progress-bar {
        height: 100%;
        width: 0%;
        background: linear-gradient(90deg, var(--ri-green-2), var(--ri-green));
        border-radius: 999px;
        transition: width .25s ease, background .2s ease;
      }

      .file-item.is-error .progress-bar { background: linear-gradient(90deg, #b91c1c, var(--ri-red)); }
      .file-item.is-success { border-color: rgba(34, 197, 94, .38); }
      .file-item.is-error { border-color: rgba(239, 68, 68, .42); }
      .file-item.is-enterprise { border-color: rgba(59, 130, 246, .38); }
      .file-item.is-enterprise .progress-bar { background: linear-gradient(90deg, #2563eb, #22c55e); }
      .upload-mode { margin-left: 8px; font-size: 10px; font-weight: 900; letter-spacing: .05em; color: #bfdbfe; border: 1px solid rgba(59, 130, 246, .35); background: rgba(37, 99, 235, .16); border-radius: 999px; padding: 3px 7px; white-space: nowrap; }

      .tag {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border-radius: 999px;
        padding: 5px 9px;
        font-size: 11px;
        font-weight: 800;
        letter-spacing: .02em;
        background: rgba(34, 197, 94, .12);
        color: #bbf7d0;
        border: 1px solid rgba(34, 197, 94, .22);
      }

      .import-actions {
        display: flex;
        align-items: center;
        justify-content: space-between;
        flex-wrap: wrap;
        gap: 12px;
        margin-top: 16px;
        padding-top: 16px;
        border-top: 1px solid var(--ri-border-soft);
      }

      .import-summary {
        color: var(--ri-muted);
        font-size: 13px;
      }

      .btn-importar {
        border: 0;
        min-height: 44px;
        padding: 0 18px;
        border-radius: 14px;
        background: linear-gradient(135deg, #16a34a, #22c55e);
        color: #052e16;
        font-weight: 900;
        cursor: pointer;
        box-shadow: 0 16px 34px rgba(34, 197, 94, .18);
        transition: transform .16s ease, opacity .16s ease, filter .16s ease;
      }

      .btn-importar:hover:not(:disabled) { transform: translateY(-1px); filter: brightness(1.04); }
      .btn-importar:disabled { opacity: .48; cursor: not-allowed; box-shadow: none; }
      .btn-importar.is-error { background: linear-gradient(135deg, #991b1b, #ef4444); color: #fff; }
      .btn-importar.is-success { background: linear-gradient(135deg, #15803d, #22c55e); color: #052e16; }

      .spinner {
        display: inline-block;
        width: 14px;
        height: 14px;
        margin-right: 8px;
        border-radius: 50%;
        border: 2px solid rgba(5, 46, 22, .26);
        border-top-color: #052e16;
        vertical-align: -2px;
        animation: spin .75s linear infinite;
      }

      .import-log {
        margin-top: 14px;
        padding: 12px 14px;
        border-radius: 16px;
        border: 1px solid var(--ri-border-soft);
        background: rgba(2, 6, 23, .38);
        color: var(--ri-muted);
        font-size: 13px;
        display: none;
      }

      .import-log.is-visible { display: block; }
      .import-log strong { color: var(--ri-text); }

      @keyframes spin { to { transform: rotate(360deg); } }

      @media (max-width: 760px) {
        .file-item { grid-template-columns: 1fr; }
        .file-right { min-width: 0; }
        .import-actions { align-items: stretch; }
        .btn-importar { width: 100%; }
      }
    </style>
  `;

  const state = {
    files: [],
    running: false,
    imported: 0,
    errors: 0,
  };

  function sanitizeFileName(name) {
    return String(name || 'arquivo')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9._-]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '') || 'arquivo';
  }

  function humanSize(bytes) {
    const value = Number(bytes || 0);
    if (value < 1024) return `${value} B`;
    if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
    return `${(value / 1024 / 1024).toFixed(1)} MB`;
  }

  function isEnterpriseUpload(file) {
    return Number(file?.size || 0) > DIRECT_UPLOAD_LIMIT;
  }

  function uploadModeLabel(file) {
    return isEnterpriseUpload(file) ? 'ENTERPRISE · CHUNKS' : 'SEGURO';
  }

  function detectRelatorio(fileName) {
    const n = String(fileName || '').toLowerCase();

    if (n.includes('nota') || n.includes('fiscal') || n.includes('nfse') || n.includes('nfe')) {
      return { tipo: 'notas_fiscais', titulo: 'Notas Fiscais' };
    }
    if (n.includes('despesa')) {
      return { tipo: 'despesas', titulo: 'Relatório de Despesas' };
    }
    if (n.includes('resultado') || n.includes('gavilon')) {
      return { tipo: 'resultado', titulo: 'Relatório de Resultado' };
    }
    if (n.includes('producao') || n.includes('produção')) {
      return { tipo: 'producao', titulo: 'Relatório de Produção' };
    }
    if (n.includes('patrimonio') || n.includes('patrimônio')) {
      return { tipo: 'patrimonios', titulo: 'Relatório de Patrimônios' };
    }
    if (n.includes('caixa') || n.includes('fornecedor')) {
      return { tipo: 'caixa_fornecedor', titulo: 'Caixa Fornecedor' };
    }
    if (n.includes('carga')) {
      return { tipo: 'cargas', titulo: 'Relatório de Cargas' };
    }
    if (n.includes('faturado') || n.includes('faturamento')) {
      return { tipo: 'servicos_faturados', titulo: 'Serviços Faturados' };
    }

    return { tipo: 'outros', titulo: 'Outros Relatórios' };
  }

  function isAllowedFile(file) {
    const name = String(file?.name || '').toLowerCase();
    if (!/\.(xlsx|xls|csv)$/i.test(name)) return false;
    return Number(file?.size || 0) <= MAX_ENTERPRISE_SIZE;
  }

  function buildStoragePath(file) {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const safe = sanitizeFileName(file.name);
    const unique = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
    return `relatorios/${yyyy}/${mm}/${dd}/${unique}-${safe}`;
  }

  function setButton(btn, mode, label) {
    btn.classList.remove('is-error', 'is-success');
    if (mode) btn.classList.add(mode);
    btn.innerHTML = label;
  }

  async function requestSignedUpload({ file, path, opts }) {
    const supabase = opts.supabase;
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData?.session?.access_token || null;

    const response = await fetch('/api/upload/signed-url', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: JSON.stringify({
        bucket: BUCKET,
        path,
        filename: file.name,
        contentType: file.type || 'application/octet-stream',
        size: file.size || 0,
      }),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload?.error) {
      throw new Error(payload?.error || payload?.message || 'Falha ao gerar URL assinada para upload.');
    }

    return payload;
  }

  async function uploadFileWithSignedUrl({ file, path, opts }) {
    const supabase = opts.supabase;
    const signed = await requestSignedUpload({ file, path, opts });

    if (signed?.token) {
      const { error } = await supabase.storage
        .from(BUCKET)
        .uploadToSignedUrl(path, signed.token, file, {
          contentType: file.type || 'application/octet-stream',
          upsert: false,
        });
      if (error) throw error;
      return;
    }

    if (signed?.signedUrl || signed?.url) {
      const uploadUrl = signed.signedUrl || signed.url;
      const response = await fetch(uploadUrl, {
        method: signed.method || 'PUT',
        headers: {
          'Content-Type': file.type || 'application/octet-stream',
          ...(signed.headers || {}),
        },
        body: file,
      });

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(text || `Falha no upload assinado. HTTP ${response.status}`);
      }
      return;
    }

    throw new Error('Resposta inválida ao gerar URL assinada.');
  }


  function setProgress(bar, percent) {
    if (!bar) return;
    const value = Math.max(0, Math.min(100, Number(percent || 0)));
    bar.style.width = `${value.toFixed(1)}%`;
  }

  async function putToSignedUrl({ signed, blob, contentType }) {
    if (!signed?.signedUrl && !signed?.url) {
      throw new Error('URL assinada inválida.');
    }

    const uploadUrl = signed.signedUrl || signed.url;
    const response = await fetch(uploadUrl, {
      method: signed.method || 'PUT',
      headers: {
        'Content-Type': contentType || 'application/octet-stream',
        ...(signed.headers || {}),
      },
      body: blob,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(text || `Falha no upload assinado. HTTP ${response.status}`);
    }
  }

  async function uploadBlobWithSignedUrl({ blob, path, fileName, contentType, opts }) {
    const signed = await requestSignedUpload({
      file: {
        name: fileName || path.split('/').pop() || 'arquivo.bin',
        size: blob.size || 0,
        type: contentType || blob.type || 'application/octet-stream',
      },
      path,
      opts,
    });

    if (signed?.token && opts.supabase?.storage?.from) {
      const { error } = await opts.supabase.storage
        .from(BUCKET)
        .uploadToSignedUrl(path, signed.token, blob, {
          contentType: contentType || blob.type || 'application/octet-stream',
          upsert: false,
        });
      if (error) throw error;
      return;
    }

    await putToSignedUrl({
      signed,
      blob,
      contentType: contentType || blob.type || 'application/octet-stream',
    });
  }


  async function completeChunkedUpload({ file, path, chunks, opts, bar, status }) {
    const supabase = opts.supabase;
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData?.session?.access_token || null;

    status.textContent = 'Finalizando arquivo enterprise...';
    setProgress(bar, 92);

    const response = await fetch('/api/upload/complete-chunked', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: JSON.stringify({
        bucket: BUCKET,
        finalPath: path,
        filename: file.name,
        contentType: file.type || 'application/vnd.ms-excel',
        size: file.size || 0,
        chunks,
        deleteChunks: true,
      }),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload?.error) {
      throw new Error(payload?.error || payload?.message || 'Falha ao finalizar upload enterprise.');
    }
    return payload;
  }

  async function uploadFileEnterpriseChunked({ file, path, opts, bar, status }) {
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
    const chunks = [];
    const chunkRoot = `${path}.chunks`;
    const manifestPath = `${path}.manifest.json`;

    status.textContent = `Upload enterprise: preparando ${totalChunks} partes...`;
    setProgress(bar, 5);

    for (let index = 0; index < totalChunks; index++) {
      const start = index * CHUNK_SIZE;
      const end = Math.min(file.size, start + CHUNK_SIZE);
      const chunk = file.slice(start, end);
      const chunkPath = `${chunkRoot}/part-${String(index + 1).padStart(5, '0')}.bin`;

      status.textContent = `Enviando parte ${index + 1}/${totalChunks}...`;
      await uploadBlobWithSignedUrl({
        blob: chunk,
        path: chunkPath,
        fileName: `${sanitizeFileName(file.name)}.part-${index + 1}`,
        contentType: 'application/octet-stream',
        opts,
      });

      chunks.push({ index, path: chunkPath, size: chunk.size });
      setProgress(bar, 8 + ((index + 1) / totalChunks) * 82);
    }

    const manifest = {
      version: 2,
      mode: 'chunked-composed',
      bucket: BUCKET,
      original_name: file.name,
      original_path: path,
      original_size: file.size,
      content_type: file.type || 'application/vnd.ms-excel',
      chunk_size: CHUNK_SIZE,
      total_chunks: totalChunks,
      chunks,
      created_at: new Date().toISOString(),
    };

    await completeChunkedUpload({ file, path, chunks, opts, bar, status });

    setProgress(bar, 96);
    return { mode: 'chunked', storagePath: path, manifest };
  }

  async function uploadFileSmart({ file, path, opts, bar, status }) {
    if (isEnterpriseUpload(file)) {
      return uploadFileEnterpriseChunked({ file, path, opts, bar, status });
    }

    await uploadFileWithSignedUrl({ file, path, opts });
    return { mode: 'single', storagePath: path, manifest: null };
  }

  async function uploadAndRegister({ file, item, bar, status }, opts) {
    const supabase = opts.supabase;
    const detected = detectRelatorio(file.name);
    const path = buildStoragePath(file);
    const user = opts.user || opts.auth?.user || null;
    const userMeta = user?.user_metadata || {};
    const userName = userMeta.full_name || userMeta.name || user?.email || null;

    status.textContent = isEnterpriseUpload(file) ? 'Iniciando upload enterprise...' : 'Gerando upload seguro...';
    setProgress(bar, 12);

    const uploadResult = await uploadFileSmart({ file, path, opts, bar, status });
    const finalStoragePath = uploadResult.storagePath || path;

    setProgress(bar, 72);
    status.textContent = 'Registrando importação...';

    let publicUrl = null;
    try {
      const { data } = supabase.storage.from(BUCKET).getPublicUrl(finalStoragePath);
      publicUrl = data?.publicUrl || null;
    } catch (_) {
      publicUrl = null;
    }

    const payload = {
      tipo_relatorio: detected.tipo,
      titulo_relatorio: detected.titulo,
      arquivo_nome_original: file.name,
      arquivo_nome_storage: finalStoragePath.split('/').pop(),
      storage_bucket: BUCKET,
      storage_path: finalStoragePath,
      tamanho_bytes: file.size || 0,
      mime_type: file.type || null,
      status: 'enviado',
      observacoes: uploadResult.mode === 'chunked'
        ? JSON.stringify({ upload_mode: 'chunked', original_path: path, manifest_path: finalStoragePath, total_chunks: uploadResult.manifest?.total_chunks || 0, original_size: file.size })
        : 'Arquivo enviado pelo painel via upload assinado. Aguardando processamento/conferência.',
      importado_por: user?.id || null,
      importado_por_nome: userName,
      nome_arquivo: file.name,
      tipo: detected.tipo,
      path: finalStoragePath,
      url: publicUrl,
      usuario_id: user?.id || null,
      usuario_nome: userName,
      usuario_email: user?.email || null,
    };

    const { error: insertError } = await supabase
      .from('relatorios_importacoes')
      .insert([payload]);

    if (insertError) throw insertError;

    setProgress(bar, 100);
    status.textContent = 'Importado';
    item.classList.add('is-success');
  }

  function openHome(container, opts = {}) {
    state.files = [];
    state.running = false;
    state.imported = 0;
    state.errors = 0;

    container.innerHTML = `
      ${styles}
      <section class="relatorios-importacao">
        <div class="relatorios-grid">
          <div class="import-card">
            <div class="import-head">
              <div>
                <h2 class="import-title">Central de importação</h2>
                <p class="import-subtitle">Selecione os arquivos, revise a lista e finalize no botão Concluir Importação.</p>
              </div>
              <span class="tag">XLSX · XLS · CSV</span>
            </div>

            <div class="dropzone" id="dropzone" role="button" tabindex="0">
              <input type="file" id="fileInput" multiple hidden accept=".xlsx,.xls,.csv" />
              <div>
                <div class="dropzone-main">Arraste arquivos aqui ou clique para selecionar</div>
                <div class="dropzone-hint">A importação só será enviada após confirmar no botão abaixo.</div>
              </div>
            </div>

            <div class="file-list" id="fileList">
              <div class="file-empty">Nenhum arquivo selecionado.</div>
            </div>

            <div class="import-actions">
              <div class="import-summary" id="importSummary">0 arquivos prontos para importação.</div>
              <button class="btn-importar" id="btnConcluirImportacao" type="button" disabled>Concluir Importação</button>
            </div>

            <div class="import-log" id="importLog"></div>
          </div>
        </div>
      </section>
    `;

    const drop = container.querySelector('#dropzone');
    const input = container.querySelector('#fileInput');
    const list = container.querySelector('#fileList');
    const btn = container.querySelector('#btnConcluirImportacao');
    const summary = container.querySelector('#importSummary');
    const log = container.querySelector('#importLog');

    function updateSummary() {
      const count = state.files.length;
      const invalid = state.files.filter((entry) => !entry.valid).length;
      const valid = count - invalid;
      const pending = state.files.filter((entry) => entry.valid && entry.status === 'pendente').length;

      if (!count) {
        summary.textContent = '0 arquivos prontos para importação.';
      } else if (invalid) {
        summary.textContent = `${valid} arquivo(s) pronto(s) · ${invalid} arquivo(s) inválido(s).`;
      } else {
        summary.textContent = `${pending} arquivo(s) pronto(s) para importação.`;
      }

      btn.disabled = state.running || pending === 0;
    }

    function renderFiles() {
      if (!state.files.length) {
        list.innerHTML = '<div class="file-empty">Nenhum arquivo selecionado.</div>';
        updateSummary();
        return;
      }

      list.innerHTML = '';
      state.files.forEach((entry, index) => {
        const detected = detectRelatorio(entry.file.name);
        const item = document.createElement('div');
        item.className = 'file-item';
        if (isEnterpriseUpload(entry.file)) item.classList.add('is-enterprise');
        if (!entry.valid) item.classList.add('is-error');
        if (entry.status === 'importado') item.classList.add('is-success');
        if (entry.status === 'erro') item.classList.add('is-error');

        item.innerHTML = `
          <div>
            <div class="file-name">
              <span>📄</span>
              <span title="${entry.file.name.replace(/"/g, '&quot;')}">${entry.file.name}</span>
            </div>
            <div class="file-meta">${detected.titulo} · ${humanSize(entry.file.size)} <span class="upload-mode">${uploadModeLabel(entry.file)}</span></div>
          </div>
          <div class="file-right">
            <div class="file-status-row">
              <span class="file-status">${entry.valid ? (entry.message || 'Pendente') : 'Formato inválido'}</span>
              <button class="file-remove" type="button" data-index="${index}" ${state.running ? 'disabled' : ''}>Remover</button>
            </div>
            <div class="progress"><div class="progress-bar" style="width:${entry.status === 'importado' ? '100' : entry.status === 'erro' ? '100' : '0'}%"></div></div>
          </div>
        `;

        entry.elements = {
          item,
          bar: item.querySelector('.progress-bar'),
          status: item.querySelector('.file-status'),
        };

        list.appendChild(item);
      });

      list.querySelectorAll('.file-remove').forEach((button) => {
        button.addEventListener('click', () => {
          const index = Number(button.dataset.index);
          state.files.splice(index, 1);
          renderFiles();
        });
      });

      updateSummary();
    }

    function addFiles(fileList) {
      const incoming = Array.from(fileList || []);
      if (!incoming.length || state.running) return;

      const existingKey = new Set(state.files.map((entry) => `${entry.file.name}_${entry.file.size}`));

      incoming.forEach((file) => {
        const key = `${file.name}_${file.size}`;
        if (existingKey.has(key)) return;
        existingKey.add(key);

        const valid = isAllowedFile(file);
        state.files.push({
          file,
          valid,
          status: valid ? 'pendente' : 'erro',
          message: valid ? 'Pendente' : 'Use XLSX, XLS ou CSV até 1GB',
          elements: null,
        });
      });

      log.classList.remove('is-visible');
      log.innerHTML = '';
      renderFiles();
      input.value = '';
    }

    drop.addEventListener('click', () => input.click());
    drop.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        input.click();
      }
    });
    drop.addEventListener('dragover', (event) => {
      event.preventDefault();
      drop.classList.add('is-dragging');
    });
    drop.addEventListener('dragleave', () => drop.classList.remove('is-dragging'));
    drop.addEventListener('drop', (event) => {
      event.preventDefault();
      drop.classList.remove('is-dragging');
      addFiles(event.dataTransfer.files);
    });
    input.addEventListener('change', () => addFiles(input.files));

    btn.addEventListener('click', async () => {
      const queue = state.files.filter((entry) => entry.valid && entry.status === 'pendente');
      if (!queue.length || state.running) return;

      state.running = true;
      state.imported = 0;
      state.errors = 0;
      setButton(btn, null, '<span class="spinner"></span>Importando...');
      updateSummary();
      renderFiles();

      for (const entry of queue) {
        const { item, bar, status } = entry.elements || {};
        try {
          entry.status = 'processando';
          entry.message = 'Processando...';
          if (status) status.textContent = 'Processando...';
          if (bar) bar.style.width = '12%';

          await uploadAndRegister({ file: entry.file, item, bar, status }, opts);

          entry.status = 'importado';
          entry.message = 'Importado';
          state.imported += 1;
        } catch (err) {
          console.error('[RELATORIOS] Erro ao importar:', err);
          entry.status = 'erro';
          entry.message = err?.message || 'Erro ao importar';
          state.errors += 1;

          if (item) item.classList.add('is-error');
          if (bar) bar.style.width = '100%';
          if (status) status.textContent = entry.message;
        }
      }

      state.running = false;
      updateSummary();

      if (state.errors) {
        setButton(btn, 'is-error', 'Revisar e tentar novamente');
        btn.disabled = !state.files.some((entry) => entry.valid && entry.status === 'pendente');
        log.innerHTML = `<strong>Importação parcial:</strong> ${state.imported} arquivo(s) importado(s) e ${state.errors} com erro.`;
      } else {
        setButton(btn, 'is-success', 'Importação concluída');
        btn.disabled = true;
        log.innerHTML = `<strong>Importação concluída:</strong> ${state.imported} arquivo(s) enviado(s) com sucesso.`;
      }

      log.classList.add('is-visible');
    });

    renderFiles();
  }

  window.RELATORIOS = { openHome };
})();
