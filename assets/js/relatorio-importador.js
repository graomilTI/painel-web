import { initProtectedPage } from './pageInit.js';
import { supabase } from './supabaseClient.js';
import { toPanelUrl } from './paths.js';

const STORAGE_BUCKET = 'relatorios-uploads';
const METADATA_TABLE = 'relatorios_importacoes';

const CONFIG = {
  'caixa-fornecedor': {
    titulo: 'Caixa do Fornecedor',
    descricao: 'Faça o upload do arquivo bruto para armazenar no painel e manter histórico centralizado.',
    observacao: 'Modelo esperado do Caixa Operacional / Caixa do Fornecedor.',
    aceita: ['.xlsx', '.xls', '.csv'],
    maxMb: 25,
    cor: 'financeiro'
  },
  'despesas': {
    titulo: 'Relatório de Despesas',
    descricao: 'Envio do relatório de despesas para controle e conciliação no painel.',
    observacao: 'Aceita Excel e CSV. O arquivo é salvo no Supabase Storage e registrado no histórico.',
    aceita: ['.xlsx', '.xls', '.csv'],
    maxMb: 25,
    cor: 'financeiro'
  },
  'notas-fiscais': {
    titulo: 'Notas Fiscais',
    descricao: 'Envio de notas fiscais para armazenamento e rastreabilidade de importações.',
    observacao: 'Ideal para cruzamento futuro com despesas e financeiro.',
    aceita: ['.xlsx', '.xls', '.csv'],
    maxMb: 25,
    cor: 'financeiro'
  },
  'producao-consolidada': {
    titulo: 'Produção Consolidada',
    descricao: 'Faça o upload da produção consolidada e mantenha o histórico operacional salvo.',
    observacao: 'Arquivo consolidado para apoio aos relatórios de produção.',
    aceita: ['.xlsx', '.xls', '.csv'],
    maxMb: 30,
    cor: 'operacional'
  },
  'resultado-diario': {
    titulo: 'Resultado Diário',
    descricao: 'Upload do resultado diário para consulta posterior e histórico de fechamento.',
    observacao: 'Aceita .xls, .xlsx e .csv.',
    aceita: ['.xlsx', '.xls', '.csv'],
    maxMb: 30,
    cor: 'operacional'
  },
  'cargas': {
    titulo: 'Relatório de Cargas',
    descricao: 'Envie o relatório de cargas para manter a base centralizada no painel.',
    observacao: 'Use o arquivo exportado da operação diária.',
    aceita: ['.xlsx', '.xls', '.csv'],
    maxMb: 30,
    cor: 'operacional'
  },
  'servicos-faturados': {
    titulo: 'Serviços Faturados',
    descricao: 'Envio dos serviços faturados para histórico e conferência no painel.',
    observacao: 'Arquivo salvo no Storage com registro do responsável pelo envio.',
    aceita: ['.xlsx', '.xls', '.csv'],
    maxMb: 25,
    cor: 'financeiro'
  }
};

const HUB_ITEMS = [
  { key: 'producao-consolidada', path: 'relatorio-producao-consolidada', grupo: 'Operacional' },
  { key: 'resultado-diario', path: 'relatorio-resultado-diario', grupo: 'Operacional' },
  { key: 'cargas', path: 'relatorio-cargas', grupo: 'Operacional' },
  { key: 'caixa-fornecedor', path: 'relatorio-caixa-fornecedor', grupo: 'Financeiro' },
  { key: 'despesas', path: 'relatorio-despesas', grupo: 'Financeiro' },
  { key: 'notas-fiscais', path: 'relatorio-notas-fiscais', grupo: 'Financeiro' },
  { key: 'servicos-faturados', path: 'relatorio-servicos-faturados', grupo: 'Financeiro' }
];

function getKey() {
  return document.body.dataset.reportKey || '';
}

function getConfig(key) {
  return CONFIG[key] || CONFIG['caixa-fornecedor'];
}

function formatBytes(size) {
  if (!Number.isFinite(size)) return '-';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(2)} MB`;
}

function formatDateTime(value) {
  if (!value) return '-';
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return value;
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(dt);
}

function sanitizeFileName(name = '') {
  const dot = name.lastIndexOf('.');
  const ext = dot >= 0 ? name.slice(dot).toLowerCase() : '';
  const base = dot >= 0 ? name.slice(0, dot) : name;
  const cleanBase = String(base)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase() || 'arquivo';
  return `${cleanBase}${ext}`;
}

function extOf(name = '') {
  const idx = String(name).lastIndexOf('.');
  return idx >= 0 ? String(name).slice(idx).toLowerCase() : '';
}

function fileInfo(file) {
  if (!file) return '';
  return `${file.name} · ${formatBytes(file.size)}`;
}

function validateFile(file, cfg) {
  if (!file) return 'Selecione um arquivo.';
  const ext = extOf(file.name);
  if (!cfg.aceita.includes(ext)) {
    return `Formato inválido. Permitidos: ${cfg.aceita.join(', ')}`;
  }
  if (file.size > cfg.maxMb * 1024 * 1024) {
    return `Arquivo acima do limite de ${cfg.maxMb} MB.`;
  }
  return null;
}

function buildStoragePath(key, file) {
  const now = new Date();
  const yyyy = String(now.getFullYear());
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const hh = String(now.getHours()).padStart(2, '0');
  const mi = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  const stamp = `${yyyy}${mm}${dd}-${hh}${mi}${ss}`;
  return `${key}/${yyyy}/${mm}/${stamp}-${sanitizeFileName(file.name)}`;
}

async function createSignedDownloadUrl(storagePath) {
  const { data, error } = await supabase.storage.from(STORAGE_BUCKET).createSignedUrl(storagePath, 60);
  if (error) throw error;
  return data?.signedUrl || null;
}

function statusClass(value = '') {
  const v = String(value || '').toLowerCase();
  if (v.includes('erro')) return 'danger';
  if (v.includes('enviado') || v.includes('conclu')) return 'success';
  return 'neutral';
}


function normalizeText(value = '') {
  return String(value || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

function detectReportKeyFromFileName(fileName = '') {
  const n = normalizeText(fileName);

  if (n.includes('producao consolidada') || (n.includes('producao') && n.includes('consolid'))) return 'producao-consolidada';
  if (n.includes('nota fiscal') || n.includes('notas fiscais') || n.includes('nfe')) return 'notas-fiscais';
  if (n.includes('despesa')) return 'despesas';
  if (n.includes('caixa do fornecedor') || n.includes('caixa fornecedor') || n.includes('caixa')) return 'caixa-fornecedor';
  if (n.includes('resultado diario') || n.includes('resultado')) return 'resultado-diario';
  if (n.includes('relatorio de cargas') || n.includes('cargas') || n.includes('carga')) return 'cargas';
  if (n.includes('servicos faturados') || n.includes('servico faturado') || n.includes('servicos')) return 'servicos-faturados';

  return null;
}


function renderHub(content, ctx) {
  const cards = HUB_ITEMS.map(({ key, path, grupo }) => {
    const cfg = getConfig(key);
    return `
      <a class="report-link-card" href="${toPanelUrl(path)}">
        <div class="report-link-top">
          <span class="report-pill ${cfg.cor}">${grupo}</span>
        </div>
        <h3>${cfg.titulo}</h3>
        <p>${cfg.descricao}</p>
        <span class="report-link-cta">Abrir upload</span>
      </a>`;
  }).join('');

  content.innerHTML = `
    <section class="hero-card">
      <div>
        <div class="eyebrow">Relatórios</div>
        <h2>Importar Relatórios</h2>
        <p>Central de upload dos relatórios externos com envio real para o Supabase Storage.</p>
      </div>
      <div class="hero-badge-wrap">
        <span class="hero-badge">UPLOAD</span>
      </div>
    </section>

    <section class="base-card mt-16">
      <div class="section-heading">
        <div>
          <h2>Upload em lote inteligente</h2>
          <p class="section-subtitle">Selecione vários arquivos de uma vez. O sistema identifica o tipo pelo nome do arquivo e envia cada relatório para a base correta.</p>
        </div>
      </div>

      <div class="base-grid">
        <div class="base-field">
          <label class="base-label" for="arquivoLoteRelatorios">Arquivos</label>
          <input id="arquivoLoteRelatorios" class="base-input" type="file" multiple accept=".xlsx,.xls,.csv" />
        </div>

        <div class="base-field">
          <label class="base-label" for="observacoesLoteRelatorios">Observações gerais</label>
          <textarea id="observacoesLoteRelatorios" class="base-textarea" placeholder="Opcional. Ex.: fechamento diário, lote da manhã, importação enviada pela coordenação."></textarea>
        </div>

        <div class="base-field half">
          <label class="base-label">Destino</label>
          <div class="base-status">Bucket: ${STORAGE_BUCKET}<br>Tabela: ${METADATA_TABLE}<br>Usuário: ${ctx.user?.name || '-'}</div>
        </div>

        <div class="base-field half">
          <label class="base-label">Regras de identificação</label>
          <div class="base-status">O sistema reconhece Produção, Notas, Despesas, Caixa, Resultado, Cargas e Serviços Faturados pelo nome do arquivo.</div>
        </div>
      </div>

      <div class="base-actions">
        <button id="btnValidarLoteRelatorios" class="base-button secondary" type="button">Validar lote</button>
        <button id="btnImportarLoteRelatorios" class="base-button primary" type="button">Enviar lote para Supabase</button>
      </div>

      <div id="statusLoteRelatorios" class="base-status mt-16">Nenhum arquivo selecionado.</div>
      <div id="listaLoteRelatorios" class="base-status mt-16">Aguardando seleção de arquivos.</div>
    </section>

    <section class="base-card mt-16">
      <div class="section-heading">
        <div>
          <h2>Escolha o relatório individual</h2>
          <p class="section-subtitle">Cada card abre uma tela de upload com histórico recente e gravação no banco.</p>
        </div>
      </div>
      <div class="report-link-grid">${cards}</div>
    </section>
  `;

  const fileInput = document.getElementById('arquivoLoteRelatorios');
  const obsInput = document.getElementById('observacoesLoteRelatorios');
  const statusEl = document.getElementById('statusLoteRelatorios');
  const listEl = document.getElementById('listaLoteRelatorios');
  const btnValidar = document.getElementById('btnValidarLoteRelatorios');
  const btnImportar = document.getElementById('btnImportarLoteRelatorios');

  const renderList = () => {
    const files = Array.from(fileInput?.files || []);
    if (!files.length) {
      statusEl.textContent = 'Nenhum arquivo selecionado.';
      listEl.innerHTML = 'Aguardando seleção de arquivos.';
      return [];
    }

    const rows = files.map((file) => {
      const detectedKey = detectReportKeyFromFileName(file.name);
      const cfg = detectedKey ? getConfig(detectedKey) : null;
      const issue = detectedKey ? validateFile(file, cfg) : 'Tipo de relatório não identificado pelo nome do arquivo.';
      const ok = !issue;

      return {
        file,
        detectedKey,
        cfg,
        issue,
        ok
      };
    });

    const okCount = rows.filter((row) => row.ok).length;
    const failCount = rows.length - okCount;

    statusEl.textContent = `${rows.length} arquivo(s) selecionado(s) · ${okCount} pronto(s) para envio · ${failCount} com pendência`;

    listEl.innerHTML = rows.map((row) => `
      <div style="display:flex;justify-content:space-between;gap:16px;padding:10px 0;border-bottom:1px solid rgba(255,255,255,.08);">
        <div>
          <strong>${row.file.name}</strong><br>
          <span style="opacity:.8;">${formatBytes(row.file.size)}</span>
        </div>
        <div style="text-align:right;">
          <div>${row.cfg?.titulo || 'Não identificado'}</div>
          <span class="status-pill ${row.ok ? 'success' : 'danger'}">${row.ok ? 'Pronto' : (row.issue || 'Erro')}</span>
        </div>
      </div>
    `).join('');

    return rows;
  };

  fileInput?.addEventListener('change', renderList);

  btnValidar?.addEventListener('click', () => {
    renderList();
  });

  btnImportar?.addEventListener('click', async () => {
    const rows = renderList();
    if (!rows.length) {
      statusEl.textContent = 'Selecione ao menos um arquivo para enviar.';
      return;
    }

    const validRows = rows.filter((row) => row.ok);
    const invalidRows = rows.filter((row) => !row.ok);

    if (!validRows.length) {
      statusEl.textContent = 'Nenhum arquivo válido para envio.';
      return;
    }

    btnImportar.disabled = true;
    btnValidar.disabled = true;

    const results = [];

    try {
      for (let i = 0; i < validRows.length; i += 1) {
        const row = validRows[i];
        statusEl.textContent = `Enviando ${i + 1} de ${validRows.length}: ${row.file.name}`;
        try {
          await uploadSingleReport({
            file: row.file,
            key: row.detectedKey,
            cfg: row.cfg,
            observations: obsInput?.value?.trim() || null,
            ctx
          });
          results.push({ name: row.file.name, ok: true, title: row.cfg?.titulo || row.detectedKey });
        } catch (error) {
          console.error(error);
          results.push({ name: row.file.name, ok: false, error: error.message || String(error), title: row.cfg?.titulo || row.detectedKey });
        }
      }

      invalidRows.forEach((row) => {
        results.push({ name: row.file.name, ok: false, error: row.issue || 'Arquivo inválido', title: row.cfg?.titulo || 'Não identificado' });
      });

      const sentCount = results.filter((item) => item.ok).length;
      const failCount = results.length - sentCount;

      statusEl.textContent = `Lote finalizado · ${sentCount} enviado(s) · ${failCount} com erro`;

      listEl.innerHTML = results.map((item) => `
        <div style="display:flex;justify-content:space-between;gap:16px;padding:10px 0;border-bottom:1px solid rgba(255,255,255,.08);">
          <div>
            <strong>${item.name}</strong><br>
            <span style="opacity:.8;">${item.title || '-'}</span>
          </div>
          <div style="text-align:right;">
            <span class="status-pill ${item.ok ? 'success' : 'danger'}">${item.ok ? 'Enviado' : 'Erro'}</span>
            ${item.ok ? '' : `<div style="margin-top:6px;max-width:420px;opacity:.85;">${item.error || 'Falha no envio'}</div>`}
          </div>
        </div>
      `).join('');

      if (sentCount > 0) {
        fileInput.value = '';
        obsInput.value = '';
      }
    } finally {
      btnImportar.disabled = false;
      btnValidar.disabled = false;
    }
  });
}

async function loadHistory(key, historyEl, emptyEl) {
(key, historyEl, emptyEl) {
  historyEl.innerHTML = '';
  emptyEl.textContent = 'Carregando histórico...';

  const { data, error } = await supabase
    .from(METADATA_TABLE)
    .select('id, tipo_relatorio, titulo_relatorio, arquivo_nome_original, storage_path, storage_bucket, tamanho_bytes, mime_type, status, importado_por_nome, created_at')
    .eq('tipo_relatorio', key)
    .order('created_at', { ascending: false })
    .limit(12);

  if (error) {
    emptyEl.textContent = 'Não foi possível carregar o histórico. Rode o SQL da tabela/bucket e confira as policies.';
    return;
  }

  if (!data || !data.length) {
    emptyEl.textContent = 'Nenhum upload encontrado para este relatório.';
    return;
  }

  emptyEl.textContent = '';
  historyEl.innerHTML = data.map((row) => `
    <tr>
      <td>${formatDateTime(row.created_at)}</td>
      <td>${row.arquivo_nome_original || '-'}</td>
      <td>${formatBytes(Number(row.tamanho_bytes || 0))}</td>
      <td>${row.importado_por_nome || '-'}</td>
      <td><span class="status-pill ${statusClass(row.status)}">${row.status || 'enviado'}</span></td>
      <td><button class="base-button inline btn-download" type="button" data-path="${row.storage_path || ''}">Baixar</button></td>
    </tr>
  `).join('');

  historyEl.querySelectorAll('.btn-download').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const path = btn.dataset.path;
      if (!path) return;
      const original = btn.textContent;
      try {
        btn.disabled = true;
        btn.textContent = 'Abrindo...';
        const signedUrl = await createSignedDownloadUrl(path);
        if (!signedUrl) throw new Error('URL de download não gerada.');
        window.open(signedUrl, '_blank', 'noopener');
      } catch (err) {
        alert(err.message || 'Não foi possível abrir o arquivo.');
      } finally {
        btn.disabled = false;
        btn.textContent = original;
      }
    });
  });
}



async function insertMetadataRecord(payload) {
  const attempts = [
    payload,
    {
      ...payload,
      tipo: payload.tipo_relatorio,
      titulo: payload.titulo_relatorio
    },
    {
      tipo: payload.tipo_relatorio,
      titulo: payload.titulo_relatorio,
      arquivo_nome_original: payload.arquivo_nome_original,
      arquivo_nome_storage: payload.arquivo_nome_storage,
      storage_bucket: payload.storage_bucket,
      storage_path: payload.storage_path,
      tamanho_bytes: payload.tamanho_bytes,
      mime_type: payload.mime_type,
      status: payload.status,
      observacoes: payload.observacoes,
      importado_por: payload.importado_por,
      importado_por_nome: payload.importado_por_nome
    }
  ];

  let lastError = null;

  for (const body of attempts) {
    const { error } = await supabase.from(METADATA_TABLE).insert(body);
    if (!error) return;

    lastError = error;

    const message = String(error.message || '').toLowerCase();

    if (
      message.includes('column "tipo"') ||
      message.includes("column 'tipo'") ||
      message.includes('null value in column "tipo"') ||
      message.includes('violates not-null constraint')
    ) {
      continue;
    }

    throw error;
  }

  if (lastError) throw lastError;
}

async function uploadSingleReport({ file, key, cfg, observations = null, ctx }) {
  const issue = validateFile(file, cfg);
  if (issue) throw new Error(issue);

  const storagePath = buildStoragePath(key, file);

  const { error: uploadError } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(storagePath, file, { cacheControl: '3600', upsert: false, contentType: file.type || undefined });

  if (uploadError) throw uploadError;

  const payload = {
    tipo_relatorio: key,
    titulo_relatorio: cfg.titulo,
    arquivo_nome_original: file.name,
    arquivo_nome_storage: sanitizeFileName(file.name),
    storage_bucket: STORAGE_BUCKET,
    storage_path: storagePath,
    tamanho_bytes: file.size,
    mime_type: file.type || null,
    status: 'enviado',
    observacoes: observations,
    importado_por: ctx.user?.id || null,
    importado_por_nome: ctx.user?.name || null
  };

  await insertMetadataRecord(payload);
  return { storagePath, payload };
}

function renderDetail
(content, ctx, key) {
  const cfg = getConfig(key);

  content.innerHTML = `
    <section class="hero-card">
      <div>
        <div class="eyebrow">Relatórios</div>
        <h2>${cfg.titulo}</h2>
        <p>${cfg.descricao}</p>
      </div>
      <div class="hero-badge-wrap">
        <span class="hero-badge">SUPABASE</span>
      </div>
    </section>

    <section class="base-card mt-16">
      <div class="section-heading">
        <div>
          <h2>Upload do relatório</h2>
          <p class="section-subtitle">O arquivo será enviado para o bucket <strong>${STORAGE_BUCKET}</strong> e registrado na tabela <strong>${METADATA_TABLE}</strong>.</p>
        </div>
        <div class="inline-nav">
          <a href="${toPanelUrl('importar-relatorios')}">Central</a>
          <a href="#" class="active">${cfg.titulo}</a>
        </div>
      </div>

      <div class="base-grid">
        <div class="base-field half">
          <label class="base-label" for="arquivoRelatorio">Arquivo</label>
          <input id="arquivoRelatorio" class="base-input" type="file" accept="${cfg.aceita.join(',')}" />
        </div>

        <div class="base-field half">
          <label class="base-label">Status</label>
          <div id="statusArquivo" class="base-status">Nenhum arquivo selecionado.</div>
        </div>

        <div class="base-field">
          <label class="base-label" for="observacoesRelatorio">Observações</label>
          <textarea id="observacoesRelatorio" class="base-textarea" placeholder="Opcional. Ex.: fechamento diário, ajuste manual, conferido pela coordenação."></textarea>
        </div>

        <div class="base-field half">
          <label class="base-label">Modelo aceito</label>
          <div class="base-status">${cfg.observacao}<br>Formatos: ${cfg.aceita.join(', ')} · Limite: ${cfg.maxMb} MB</div>
        </div>

        <div class="base-field half">
          <label class="base-label">Destino</label>
          <div class="base-status">Bucket: ${STORAGE_BUCKET}<br>Tabela: ${METADATA_TABLE}<br>Usuário: ${ctx.user?.name || '-'}</div>
        </div>
      </div>

      <div class="base-actions">
        <button id="btnValidarRelatorio" class="base-button secondary" type="button">Validar arquivo</button>
        <button id="btnImportarRelatorio" class="base-button primary" type="button">Enviar para Supabase</button>
      </div>
    </section>

    <section class="base-card mt-16">
      <div class="section-heading">
        <div>
          <h2>Últimos uploads</h2>
          <p class="section-subtitle">Histórico recente deste relatório.</p>
        </div>
      </div>

      <div class="base-table-wrap">
        <table class="base-table">
          <thead>
            <tr>
              <th>Enviado em</th>
              <th>Arquivo</th>
              <th>Tamanho</th>
              <th>Usuário</th>
              <th>Status</th>
              <th>Ação</th>
            </tr>
          </thead>
          <tbody id="historicoRelatorios"></tbody>
        </table>
      </div>
      <div id="historicoVazio" class="base-status mt-16">Carregando histórico...</div>
    </section>
  `;

  const fileInput = document.getElementById('arquivoRelatorio');
  const obsInput = document.getElementById('observacoesRelatorio');
  const statusEl = document.getElementById('statusArquivo');
  const btnValidar = document.getElementById('btnValidarRelatorio');
  const btnImportar = document.getElementById('btnImportarRelatorio');
  const historyEl = document.getElementById('historicoRelatorios');
  const emptyEl = document.getElementById('historicoVazio');

  const setStatus = (text) => {
    statusEl.textContent = text;
  };

  fileInput?.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    setStatus(file ? `Arquivo selecionado: ${fileInfo(file)}` : 'Nenhum arquivo selecionado.');
  });

  btnValidar?.addEventListener('click', () => {
    const file = fileInput.files?.[0];
    const issue = validateFile(file, cfg);
    setStatus(issue ? issue : `Arquivo válido: ${fileInfo(file)}`);
  });

  btnImportar?.addEventListener('click', async () => {
    const file = fileInput.files?.[0];
    const issue = validateFile(file, cfg);
    if (issue) {
      setStatus(issue);
      return;
    }

    const originalLabel = btnImportar.textContent;
    btnImportar.disabled = true;
    btnValidar.disabled = true;

    try {
      setStatus('Enviando arquivo para o Storage...');
      await uploadSingleReport({
        file,
        key,
        cfg,
        observations: obsInput.value?.trim() || null,
        ctx
      });

      fileInput.value = '';
      obsInput.value = '';
      setStatus(`Upload concluído com sucesso: ${fileInfo(file)}`);
      await loadHistory(key, historyEl, emptyEl);
    } catch (err) {
      console.error(err);
      setStatus(`Erro no upload: ${err.message || err}`);
    } finally {
      btnImportar.disabled = false;
      btnValidar.disabled = false;
      btnImportar.textContent = originalLabel;
    }
  });

  loadHistory(key, historyEl, emptyEl);
}

initProtectedPage('Relatórios', (content, ctx) => {
  const key = getKey();
  if (!key) {
    renderHub(content, ctx);
    return;
  }
  renderDetail(content, ctx, key);
});
