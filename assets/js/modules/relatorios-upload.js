// Relatórios — importação — envio do arquivo ao Storage (URL assinada, upload em partes) e registro da importação.
// Extraído de modules/relatorios.js em 15/10/2026 (era um único bloco autoexecutável de ~3.900 linhas).
// O código das funções e constantes foi movido sem alteração. Para publicar uma mudança em qualquer
// módulo relatorios-*.js, troque o token ?v=20261015-relatorios1 em TODOS os imports internos e no carregador
// (assets/js/relatorio-importador.js): tests/relatorios-modulos-versao.test.mjs garante que fiquem iguais.

  const BUCKET = 'relatorios-uploads';

  const DIRECT_UPLOAD_LIMIT = 45 * 1024 * 1024;

  const CHUNK_SIZE = 8 * 1024 * 1024;

  const MAX_ENTERPRISE_SIZE = 1024 * 1024 * 1024;

  function sanitizeFileName(name) {
    return String(name || 'arquivo')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9._-]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '') || 'arquivo';
  }

  function isEnterpriseUpload(file) {
    return Number(file?.size || 0) > DIRECT_UPLOAD_LIMIT;
  }

  async function checkExistingPeriod({ tipo, period, opts }) {
    if (!period?.inicio || !period?.fim) return { exists: false, total: 0, items: [] };
    const { data: sessionData } = await opts.supabase.auth.getSession();
    const accessToken = sessionData?.session?.access_token || null;
    const response = await fetch('/api/relatorios/inteligente/check', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: JSON.stringify({ tipo, periodo_inicio: period.inicio, periodo_fim: period.fim }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload?.error) throw new Error(payload?.error || 'Falha ao verificar duplicidade.');
    return payload;
  }

  async function registerSmartImport(payload, opts) {
    const { data: sessionData } = await opts.supabase.auth.getSession();
    const accessToken = sessionData?.session?.access_token || null;
    const response = await fetch('/api/relatorios/inteligente/register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: JSON.stringify(payload),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result?.error) throw new Error(result?.error || 'Falha ao registrar importação inteligente.');
    return result;
  }

  function isAllowedFile(file) {
    const name = String(file?.name || '').toLowerCase();
    if (!/\.(xlsx|xls|xlsm|csv)$/i.test(name)) return false;
    return Number(file?.size || 0) <= MAX_ENTERPRISE_SIZE;
  }

  function clearLocalDashboardCaches() {
    try {
      Object.keys(localStorage || {}).forEach((key) => {
        if (key.startsWith('grao1000:gestor-dash')) localStorage.removeItem(key);
      });
    } catch {}
  }

  async function invalidateDashboardCacheAfterImport(opts) {
    clearLocalDashboardCaches();
    try {
      const { error } = await opts.supabase.rpc('invalidar_dashboard_cache_segmentado', {
        p_origem: 'importar_relatorios',
      });
      if (!error) return;
      console.warn('[RELATORIOS] RPC de cache indisponível:', error.message || error);
    } catch (error) {
      console.warn('[RELATORIOS] Falha na RPC de cache:', error?.message || error);
    }

    try {
      await opts.supabase
        .from('dashboard_cache')
        .delete()
        .in('modulo', ['dashboard', 'gestor_app']);
    } catch (error) {
      console.warn('[RELATORIOS] Não foi possível invalidar dashboard_cache:', error?.message || error);
    }
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
      version: 3,
      mode: 'chunked',
      strategy: 'no-worker-merge',
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

    status.textContent = 'Upload enterprise concluído. Registrando índice dos chunks...';
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

export { BUCKET, isEnterpriseUpload, checkExistingPeriod, registerSmartImport, isAllowedFile, invalidateDashboardCacheAfterImport, buildStoragePath, setProgress, uploadFileSmart };
