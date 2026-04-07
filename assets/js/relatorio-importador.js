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

function renderHub(content) {
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
          <h2>Escolha o relatório</h2>
          <p class="section-subtitle">Cada card abre uma tela de upload com histórico recente e gravação no banco.</p>
        </div>
      </div>
      <div class="report-link-grid">${cards}</div>
    </section>
  `;
}

async function loadHistory(key, historyEl, emptyEl) {
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

function renderDetail(content, ctx, key) {
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
      const storagePath = buildStoragePath(key, file);
      const { error: uploadError } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(storagePath, file, { cacheControl: '3600', upsert: false, contentType: file.type || undefined });

      if (uploadError) throw uploadError;

      setStatus('Registrando upload no banco...');
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
        observacoes: obsInput.value?.trim() || null,
        importado_por: ctx.user?.id || null,
        importado_por_nome: ctx.user?.name || null
      };

      const { error: insertError } = await supabase.from(METADATA_TABLE).insert(payload);
      if (insertError) throw insertError;

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
    renderHub(content);
    return;
  }
  renderDetail(content, ctx, key);
});
