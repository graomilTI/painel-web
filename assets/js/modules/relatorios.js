(function () {
  const BUCKET = 'relatorios-uploads';
  const DIRECT_UPLOAD_LIMIT = 45 * 1024 * 1024;
  const CHUNK_SIZE = 8 * 1024 * 1024;
  const MAX_ENTERPRISE_SIZE = 1024 * 1024 * 1024;
  const MONEY_FMT = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

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

      .import-intelligence {
        margin-top: 16px;
        padding: 14px;
        border: 1px solid rgba(34, 197, 94, .18);
        border-radius: 18px;
        background: rgba(2, 6, 23, .42);
        display: grid;
        gap: 12px;
      }

      .import-intelligence-row {
        display: grid;
        grid-template-columns: minmax(180px, 260px) minmax(0, 1fr);
        gap: 12px;
        align-items: end;
      }

      .import-field label {
        display: block;
        margin: 0 0 6px;
        color: #bbf7d0;
        font-size: 11px;
        font-weight: 900;
        letter-spacing: .06em;
        text-transform: uppercase;
      }

      .import-field select {
        width: 100%;
        min-height: 40px;
        border: 1px solid rgba(148, 163, 184, .22);
        border-radius: 12px;
        padding: 0 12px;
        color: #e5e7eb;
        background: #0f172a;
        color-scheme: dark;
        outline: none;
      }

      .import-intelligence-note {
        color: var(--ri-muted);
        font-size: 12px;
        line-height: 1.45;
      }

      .file-period {
        display: inline-flex;
        margin-left: 8px;
        padding: 3px 7px;
        border-radius: 999px;
        background: rgba(34, 197, 94, .1);
        border: 1px solid rgba(34, 197, 94, .22);
        color: #bbf7d0;
        font-size: 10px;
        font-weight: 900;
        white-space: nowrap;
      }

      @media (max-width: 760px) {
        .import-intelligence-row { grid-template-columns: 1fr; }
      }

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

  function loadScript(src, globalName) {
    if (globalName && window[globalName]) return Promise.resolve(window[globalName]);
    return new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[src="${src}"]`);
      if (existing) {
        existing.addEventListener('load', () => resolve(globalName ? window[globalName] : true), { once: true });
        existing.addEventListener('error', reject, { once: true });
        return;
      }
      const script = document.createElement('script');
      script.src = src;
      script.async = true;
      script.onload = () => resolve(globalName ? window[globalName] : true);
      script.onerror = () => reject(new Error('Falha ao carregar biblioteca XLSX.'));
      document.head.appendChild(script);
    });
  }

  async function loadXlsx() {
    return loadScript('https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js', 'XLSX');
  }

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


  function normalizeHeader(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  function toIsoDate(value) {
    if (!value) return null;
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
    if (typeof value === 'number' && window.XLSX?.SSF?.parse_date_code) {
      const parsed = window.XLSX.SSF.parse_date_code(value);
      if (parsed?.y && parsed?.m && parsed?.d) {
        return `${parsed.y}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`;
      }
    }
    const s = String(value || '').trim();
    let m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
    if (m) return `${m[3]}-${String(m[2]).padStart(2, '0')}-${String(m[1]).padStart(2, '0')}`;
    m = s.match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})/);
    if (m) return `${m[1]}-${String(m[2]).padStart(2, '0')}-${String(m[3]).padStart(2, '0')}`;
    m = s.match(/^(\d{1,2})[\/\-.](\d{4})$/);
    if (m) return `${m[2]}-${String(m[1]).padStart(2, '0')}-01`;
    const MAP = {jan:1,fev:2,feb:2,mar:3,abr:4,apr:4,mai:5,may:5,jun:6,jul:7,ago:8,aug:8,set:9,sep:9,out:10,oct:10,nov:11,dez:12,dec:12};
    m = normalizeHeader(s).match(/^([a-z]{3,})[\/\-. ]+(\d{4})$/);
    if (m && MAP[m[1].slice(0,3)]) return `${m[2]}-${String(MAP[m[1].slice(0,3)]).padStart(2,'0')}-01`;
    return null;
  }

  function findHeaderRow(rows, required) {
    let best = 0;
    let score = -1;
    const req = required.map(normalizeHeader);
    (rows || []).slice(0, 12).forEach((row, index) => {
      const headers = (row || []).map(normalizeHeader);
      const current = req.filter((name) => headers.includes(name)).length;
      if (current > score) {
        score = current;
        best = index;
      }
    });
    return best;
  }

  function extractPeriodFromRows(rows, tipo) {
    const dates = [];
    if (!Array.isArray(rows) || !rows.length) return null;

    if (tipo === 'despesas') {
      const first = rows[0] || [];
      first.forEach((cell) => {
        const iso = toIsoDate(cell);
        if (iso) dates.push(iso);
      });
    } else if (tipo === 'uber_corridas') {
      const hrow = findHeaderRow(rows, ['NOME', 'Data da solicitação (local)', 'Endereço de partida']);
      const header = rows[hrow] || [];
      const idxData = header.findIndex((h) => ['data da solicitação local', 'data da solicitacao local', 'data solicitacao local', 'data'].includes(normalizeHeader(h)));
      if (idxData >= 0) {
        rows.slice(hrow + 1).forEach((row) => {
          const iso = toIsoDate(row?.[idxData]);
          if (iso) dates.push(iso);
        });
      }
    } else {
      const hrow = findHeaderRow(rows, ['Data']);
      const header = rows[hrow] || [];
      const idxData = header.findIndex((h) => ['data', 'data n.f.', 'data nf', 'data da nf', 'data nota'].includes(normalizeHeader(h)));
      if (idxData >= 0) {
        rows.slice(hrow + 1).forEach((row) => {
          const iso = toIsoDate(row?.[idxData]);
          if (iso) dates.push(iso);
        });
      }
    }

    const unique = [...new Set(dates)].sort();
    if (!unique.length) return null;
    return {
      inicio: unique[0],
      fim: unique[unique.length - 1],
      totalDatas: unique.length,
    };
  }

  async function detectFilePeriod(file, tipo) {
    try {
      if (!/\.(xlsx|xls|csv)$/i.test(file.name)) return null;
      const XLSX = await loadXlsx();
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
      const preferred = workbook.SheetNames.find((name) => normalizeHeader(name).includes('resultado')) || workbook.SheetNames[0];
      const sheet = workbook.Sheets[preferred];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: true });
      return extractPeriodFromRows(rows, tipo);
    } catch (err) {
      console.warn('[RELATORIOS] Não foi possível detectar período:', err);
      return null;
    }
  }

  async function readSpreadsheetAsObjects(file) {
    const XLSX = await loadXlsx();
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
    const allObjects = [];

    for (const sheetName of workbook.SheetNames || []) {
      const sheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false });
      if (!rows?.length) continue;

      const headerRow = findHeaderRow(rows, ['HOTEL', 'CIDADE']);
      const header = (rows[headerRow] || []).map(normalizeHeader);
      const hasHotel = header.includes('hotel') || header.includes('nome hotel') || header.includes('nome_hotel');
      const hasCity = header.includes('cidade') || header.includes('ciudad');
      const hasDailyRate = header.some((h) => ['valor', 'diaria', 'diaria r$', 'r$ por dia', 'vlr diaria', 'valor diaria', 'valor diario'].includes(h));

      // Para cadastro de hotéis, só importa abas que realmente tenham estrutura de hotel.
      // Isso evita ler abas auxiliares/observações como a "Página2".
      if (!hasHotel || (!hasCity && !hasDailyRate)) continue;

      const headers = (rows[headerRow] || []).map((h, index) => String(h || `COLUNA_${index + 1}`).trim());
      const dataRows = rows.slice(headerRow + 1);

      dataRows.forEach((row) => {
        const obj = { __aba: sheetName };
        headers.forEach((header, index) => {
          if (!header) return;
          obj[header] = row?.[index] ?? '';
        });
        if (Object.values(obj).some((value) => String(value ?? '').trim() !== '')) {
          allObjects.push(obj);
        }
      });
    }

    return allObjects;
  }


  function pickValue(row, keys) {
    const normalizedMap = new Map(Object.keys(row || {}).map((key) => [normalizeHeader(key), row[key]]));
    for (const key of keys) {
      const value = normalizedMap.get(normalizeHeader(key));
      if (value !== undefined && value !== null && String(value).trim() !== '') return value;
    }
    return null;
  }

  function normalizeNumberBr(value) {
    if (value === null || value === undefined || value === '') return null;
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    const raw = String(value).trim().replace(/\s/g, '');
    const normalized = raw.includes(',') ? raw.replace(/\./g, '').replace(',', '.') : raw;
    const number = Number(normalized.replace(/[^0-9.-]/g, ''));
    return Number.isFinite(number) ? number : null;
  }


  function excelSerialToDate(serial) {
    const n = Number(serial);
    if (!Number.isFinite(n)) return null;
    // Excel serial date, with 1899-12-30 base used by SheetJS/Excel interop.
    const utcValue = (n - 25569) * 86400;
    const dateInfo = new Date(Math.round(utcValue * 1000));
    if (Number.isNaN(dateInfo.getTime())) return null;
    return dateInfo;
  }

  function toIsoDateUber(value) {
    if (value === null || value === undefined || value === '') return null;
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
    if (typeof value === 'number') {
      const date = excelSerialToDate(value);
      return date ? date.toISOString().slice(0, 10) : null;
    }
    return toIsoDate(value);
  }

  function toTimestampUber(value) {
    if (value === null || value === undefined || value === '') return null;
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
    if (typeof value === 'number') {
      const date = excelSerialToDate(value);
      return date ? date.toISOString() : null;
    }
    const iso = toIsoDate(value);
    return iso ? `${iso}T00:00:00Z` : null;
  }

  function normalizeUberTime(value) {
    if (value === null || value === undefined || value === '') return null;
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return `${String(value.getHours()).padStart(2, '0')}:${String(value.getMinutes()).padStart(2, '0')}`;
    }
    return String(value).trim() || null;
  }

  function buildUberImportHash(row) {
    const parts = [
      row.data_solicitacao_local || '',
      row.hora_solicitacao_local || '',
      row.nome || '',
      row.endereco_partida || '',
      row.endereco_destino || '',
      row.preco_liquido ?? '',
    ].map((v) => normalizeHeader(String(v)));
    return parts.join('|').slice(0, 500);
  }

  async function readUberCorridasFromFile(file) {
    const XLSX = await loadXlsx();
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
    const mapped = [];

    for (const sheetName of workbook.SheetNames || []) {
      const sheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: true });
      if (!rows?.length) continue;

      const headerRow = findHeaderRow(rows, ['NOME', 'Endereço de partida', 'Endereço de destino', 'Preço líquido do parceiro (moeda local)']);
      const rawHeader = rows[headerRow] || [];
      const normalizedHeader = rawHeader.map(normalizeHeader);
      const hasUberStructure = normalizedHeader.includes('nome')
        && normalizedHeader.some((h) => h.includes('endereco de partida'))
        && normalizedHeader.some((h) => h.includes('endereco de destino'))
        && normalizedHeader.some((h) => h.includes('preco liquido'));
      if (!hasUberStructure) continue;

      const headers = rawHeader.map((h, index) => String(h || `COLUNA_${index + 1}`).trim());
      rows.slice(headerRow + 1).forEach((row) => {
        const obj = {};
        headers.forEach((header, index) => {
          if (!header) return;
          obj[header] = row?.[index] ?? '';
        });

        const nome = String(pickValue(obj, ['NOME', 'Nome', 'Colaborador', 'Funcionário', 'Funcionario']) || '').trim();
        const enderecoPartida = String(pickValue(obj, ['Endereço de partida', 'Endereco de partida', 'Partida']) || '').trim();
        const enderecoDestino = String(pickValue(obj, ['Endereço de destino', 'Endereco de destino', 'Destino']) || '').trim();
        if (!nome || (!enderecoPartida && !enderecoDestino)) return;

        const registro = {
          data_hora_transacao_utc: toTimestampUber(pickValue(obj, ['Registro de data e hora da transação (UTC)', 'Registro de data e hora da transacao UTC'])),
          hora_solicitacao_utc: normalizeUberTime(pickValue(obj, ['Hora da solicitação (UTC)', 'Hora da solicitacao UTC'])),
          data_solicitacao_local: toIsoDateUber(pickValue(obj, ['Data da solicitação (local)', 'Data da solicitacao local'])),
          hora_solicitacao_local: normalizeUberTime(pickValue(obj, ['Hora da solicitação (local)', 'Hora da solicitacao local'])),
          data_chegada_utc: toIsoDateUber(pickValue(obj, ['Data de chegada (UTC)', 'Data chegada UTC'])),
          hora_chegada_utc: normalizeUberTime(pickValue(obj, ['Hora de chegada (UTC)', 'Hora chegada UTC'])),
          data_chegada_local: toIsoDateUber(pickValue(obj, ['Data de chegada (local)', 'Data chegada local'])),
          hora_chegada_local: normalizeUberTime(pickValue(obj, ['Hora de chegada (local)', 'Hora chegada local'])),
          nome,
          coord: String(pickValue(obj, ['Coord', 'Coordenação', 'Coordenacao']) || '').trim() || null,
          supervisao: String(pickValue(obj, ['Superv', 'Supervisão', 'Supervisao']) || '').trim() || null,
          grupo: String(pickValue(obj, ['Grupo']) || '').trim() || null,
          servico: String(pickValue(obj, ['Serviço', 'Servico']) || '').trim() || null,
          programa: String(pickValue(obj, ['Programa']) || '').trim() || null,
          cidade: String(pickValue(obj, ['Cidade']) || '').trim() || null,
          pais: String(pickValue(obj, ['País', 'Pais']) || '').trim() || null,
          distancia_mi: normalizeNumberBr(pickValue(obj, ['Distância (mi)', 'Distancia (mi)', 'Distância', 'Distancia'])),
          duracao_min: normalizeNumberBr(pickValue(obj, ['Duração (min)', 'Duracao (min)', 'Duração', 'Duracao'])),
          endereco_partida: enderecoPartida || null,
          endereco_destino: enderecoDestino || null,
          detalhamento_despesa: String(pickValue(obj, ['Detalhamento da despesa', 'Detalhamento']) || '').trim() || null,
          preco_liquido: normalizeNumberBr(pickValue(obj, ['Preço líquido do parceiro (moeda local)', 'Preco liquido do parceiro moeda local', 'Preço líquido', 'Preco liquido', 'Valor'])) || 0,
          arquivo_nome: file.name,
          status_validacao: 'ATENCAO',
        };
        registro.import_hash = buildUberImportHash(registro);
        mapped.push(registro);
      });
    }

    return mapped;
  }

  async function importarUberCorridasDaPlanilha(file, opts) {
    const corridas = await readUberCorridasFromFile(file);
    if (!corridas.length) {
      throw new Error('A planilha Uber não possui linhas válidas. Cabeçalhos esperados: NOME, Data da solicitação (local), Endereço de partida, Endereço de destino e Preço líquido do parceiro.');
    }

    const batchSize = 500;
    let total = 0;
    for (let i = 0; i < corridas.length; i += batchSize) {
      const batch = corridas.slice(i, i + batchSize);
      const { error } = await opts.supabase
        .from('conferencia_uber_corridas')
        .upsert(batch, { onConflict: 'import_hash' });
      if (error) throw new Error(error.message || 'Falha ao gravar corridas Uber no Supabase. Confira se rodou o SQL da Conferência Uber.');
      total += batch.length;
    }

    const periodos = corridas.map((r) => r.data_solicitacao_local).filter(Boolean).sort();
    const colaboradores = new Set(corridas.map((r) => normalizeHeader(r.nome)).filter(Boolean)).size;
    const valorTotal = corridas.reduce((sum, r) => sum + Number(r.preco_liquido || 0), 0);
    return {
      total_linhas: corridas.length,
      importados: total,
      colaboradores,
      valor_total: Math.round(valorTotal * 100) / 100,
      periodo_inicio: periodos[0] || null,
      periodo_fim: periodos[periodos.length - 1] || null,
    };
  }

  async function readPontosEmbarqueFromFile(file) {
    const XLSX = await loadXlsx();
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array', cellDates: false });
    const sheetName = workbook.SheetNames.find((name) => normalizeHeader(name) === 'dados') || workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: true });

    const mapped = [];
    const seen = new Set();

    rows.forEach((row) => {
      const tipoLocal = String(pickValue(row, ['Tipo do Local', 'Tipo Local', 'Tipo']) || '').trim();
      const nomeLocal = String(pickValue(row, ['Local', 'Nome Local', 'Ponto', 'Ponto de Embarque']) || '').trim();
      const uf = String(pickValue(row, ['UF', 'Estado']) || '').trim().toUpperCase().slice(0, 2);
      const cidade = String(pickValue(row, ['Cidade', 'Município', 'Municipio']) || '').trim();
      const latitude = normalizeNumberBr(pickValue(row, ['Latitude', 'Lat']));
      const longitude = normalizeNumberBr(pickValue(row, ['Longitude', 'Lng', 'Long']));
      const supervisao = String(pickValue(row, ['Supervisão', 'Supervisao']) || '').trim();
      const coordenacao = String(pickValue(row, ['Coordenação', 'Coordenacao']) || '').trim();

      if (!nomeLocal || !cidade || !uf) return;
      const key = `${nomeLocal.toUpperCase()}|${cidade.toUpperCase()}|${uf}`;
      if (seen.has(key)) return;
      seen.add(key);

      mapped.push({
        tipo_local: tipoLocal || null,
        nome_local: nomeLocal,
        uf,
        cidade,
        latitude,
        longitude,
        supervisao: supervisao || null,
        coordenacao: coordenacao || null,
        origem: 'importar_relatorios',
        ativo: true,
      });
    });

    return mapped;
  }

  async function importarPontosEmbarqueDaPlanilha(file, opts) {
    const pontos = await readPontosEmbarqueFromFile(file);
    if (!pontos.length) {
      throw new Error('A planilha de pontos de embarque não possui linhas válidas. Cabeçalhos esperados: Tipo do Local, Local, UF, Cidade, Latitude, Longitude, Supervisão e Coordenação.');
    }

    const batchSize = 500;
    let total = 0;
    for (let i = 0; i < pontos.length; i += batchSize) {
      const batch = pontos.slice(i, i + batchSize);
      const { error } = await opts.supabase
        .from('operacional_pontos_embarque')
        .upsert(batch, { onConflict: 'nome_local,cidade,uf' });
      if (error) throw new Error(error.message || 'Falha ao gravar pontos de embarque no Supabase.');
      total += batch.length;
    }

    const cidades = new Set(pontos.map((ponto) => `${ponto.cidade}/${ponto.uf}`)).size;
    const supervisoes = new Set(pontos.map((ponto) => ponto.supervisao).filter(Boolean)).size;
    return { total_linhas: pontos.length, importados: total, cidades, supervisoes };
  }


  function colaboradorNomeChave(nome) {
    return String(nome || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, ' ')
      .trim()
      .toUpperCase();
  }

  async function readColaboradoresBaseFromFile(file) {
    const XLSX = await loadXlsx();
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array', cellDates: false });
    const mapped = [];
    const seen = new Set();

    for (const sheetName of workbook.SheetNames || []) {
      const sheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: true });
      if (!rows?.length) continue;

      rows.forEach((row) => {
        const nome = String(pickValue(row, ['Nome', 'Colaborador', 'Funcionário', 'Funcionario']) || '').trim();
        const nomeChave = colaboradorNomeChave(nome);
        const latitude = normalizeNumberBr(pickValue(row, ['Latitude', 'Lat']));
        const longitude = normalizeNumberBr(pickValue(row, ['Longitude', 'Lng', 'Long']));
        const telefone = String(pickValue(row, ['Telefone', 'Telefono', 'Whatsapp', 'WhatsApp']) || '').trim();
        const email = String(pickValue(row, ['Email', 'E-mail', 'E-mail Pessoal', 'Email Pessoal']) || '').trim();
        const rua = String(pickValue(row, ['Rua', 'Endereço', 'Endereco', 'Logradouro']) || '').trim();
        const bairro = String(pickValue(row, ['Bairro']) || '').trim();
        const cidade = String(pickValue(row, ['Cidade', 'Município', 'Municipio']) || '').trim();
        const uf = String(pickValue(row, ['UF', 'Estado']) || '').trim().toUpperCase().slice(0, 2);
        const pais = String(pickValue(row, ['Pais', 'País']) || 'Brasil').trim() || 'Brasil';
        const tipoRaw = String(pickValue(row, ['Tipo', 'Tipo Mão de Obra', 'Tipo Mao de Obra', 'Mão de Obra', 'Mao de Obra']) || '').trim();
        const tipoNorm = tipoRaw
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .toLowerCase();
        const tipoMaoObra = tipoNorm.includes('diar') ? 'diarista' : 'efetivo';
        const valorDiaria = normalizeNumberBr(pickValue(row, ['Diária', 'Diaria', 'Valor Diária', 'Valor Diaria']));
        const valorAlimentacao = normalizeNumberBr(pickValue(row, ['Alimentação', 'Alimentacao', 'Almoço', 'Almoco']));

        if (!nome || !nomeChave) return;
        if (!Number.isFinite(Number(latitude)) || !Number.isFinite(Number(longitude))) return;
        if (seen.has(nomeChave)) return;
        seen.add(nomeChave);

        mapped.push({
          nome,
          nome_chave: nomeChave,
          latitude,
          longitude,
          telefone: telefone || null,
          email: email || null,
          rua: rua || null,
          bairro: bairro || null,
          cidade_base: cidade || null,
          uf_base: uf || null,
          pais: pais || 'Brasil',
          // A planilha de GPS dos colaboradores não possui coluna de tipo.
          // Para respeitar o CHECK do Supabase, grava sempre em minúsculo: efetivo ou diarista.
          // Depois o tipo real pode ser enriquecido pelo cadastro/base de colaboradores.
          tipo_mao_obra: tipoMaoObra,
          valor_diaria: valorDiaria,
          valor_alimentacao: valorAlimentacao ?? 30,
          origem: 'importar_relatorios_endereco_colaborador',
          ativo: true,
        });
      });
    }

    return mapped;
  }

  async function importarColaboradoresBaseDaPlanilha(file, opts) {
    const colaboradores = await readColaboradoresBaseFromFile(file);
    if (!colaboradores.length) {
      throw new Error('A planilha de endereço dos colaboradores não possui linhas válidas. Cabeçalhos esperados: Nome, Latitude, Longitude, Telefono/Telefone, Email, Rua, Bairro, Cidade, UF e Pais.');
    }

    const batchSize = 500;
    let total = 0;
    for (let i = 0; i < colaboradores.length; i += batchSize) {
      const batch = colaboradores.slice(i, i + batchSize);
      const { error } = await opts.supabase
        .from('operacional_colaborador_base')
        .upsert(batch, { onConflict: 'nome_chave' });
      if (error) throw new Error(error.message || 'Falha ao gravar endereços dos colaboradores no Supabase.');
      total += batch.length;
    }

    const cidades = new Set(colaboradores.map((c) => `${c.cidade_base || ''}/${c.uf_base || ''}`).filter((v) => v !== '/')).size;
    const ufs = new Set(colaboradores.map((c) => c.uf_base).filter(Boolean)).size;
    return { total_linhas: colaboradores.length, importados: total, cidades, ufs };
  }


  function auditoriaImportHash(row) {
    const base = [
      pickValue(row, ['Classificador']),
      pickValue(row, ['O.S', 'OS']),
      pickValue(row, ['Placa']),
      pickValue(row, ['Data Resultado', 'Data da Class.', 'Data da Classificacao', 'Data da Classificação']),
      pickValue(row, ['Motivo da recusa', 'Motivo Recusa']),
      pickValue(row, ['Resultado']),
    ].map((v) => colaboradorNomeChave(v)).join('|');
    return base || String(Date.now());
  }

  function inferAuditoriaImpacto(resultado, motivoRecusa, diferenca, descontoKg) {
    const res = normalizeHeader(resultado || '');
    const motivo = normalizeHeader(motivoRecusa || '');
    const diff = Math.abs(Number(diferenca || 0));
    const desconto = Math.abs(Number(descontoKg || 0));
    if (res.includes('produto padrao') || res.includes('padrão')) return { impacto: 0, severidade: 'baixa', tipo: 'Produto padrão' };
    if (res.includes('desconto') || desconto > 0) {
      const impacto = Math.min(35, Math.max(8, 8 + diff * 2 + Math.min(desconto / 1500, 10)));
      return { impacto: Math.round(impacto * 100) / 100, severidade: impacto >= 18 ? 'alta' : 'media', tipo: 'Desconto' };
    }
    if (motivo) return { impacto: 6, severidade: 'media', tipo: 'Apontamento' };
    return { impacto: 0, severidade: 'baixa', tipo: 'Auditoria' };
  }

  async function readAuditoriasOperacionalFromFile(file) {
    const XLSX = await loadXlsx();
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
    const preferred = workbook.SheetNames.find((name) => normalizeHeader(name).includes('unificada'))
      || workbook.SheetNames.find((name) => normalizeHeader(name).includes('descritiva'))
      || workbook.SheetNames[0];
    const sheet = workbook.Sheets[preferred];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: true });
    const mapped = [];
    const seen = new Set();

    rows.forEach((row) => {
      const nome = String(pickValue(row, ['Classificador', 'Colaborador', 'Funcionário', 'Funcionario']) || '').trim();
      const nomeChave = colaboradorNomeChave(nome);
      if (!nome || !nomeChave) return;

      const resultado = String(pickValue(row, ['Resultado']) || '').trim();
      const motivo = String(pickValue(row, ['Motivo da recusa', 'Motivo Recusa']) || '').trim();
      const diferenca = normalizeNumberBr(pickValue(row, ['Diferença', 'Diferenca']));
      const descontoKg = normalizeNumberBr(pickValue(row, ['Desconto Kg', 'Desconto'])) || 0;
      const impacto = inferAuditoriaImpacto(resultado, motivo, diferenca, descontoKg);
      const importHash = auditoriaImportHash(row);
      if (seen.has(importHash)) return;
      seen.add(importHash);

      mapped.push({
        import_hash: importHash,
        nome_colaborador: nome,
        nome_chave: nomeChave,
        tipo_funcionario: String(pickValue(row, ['Tipo Funcionario', 'Tipo Funcionário']) || '').trim() || null,
        data_evento: toIsoDate(pickValue(row, ['Data Resultado', 'Data Abertura', 'Data da Class.', 'Data da Classificacao', 'Data da Classificação'])),
        data_classificacao: toIsoDate(pickValue(row, ['Data da Class.', 'Data da Classificacao', 'Data da Classificação'])),
        referencia: String(pickValue(row, ['Referência', 'Referencia']) || '').trim() || null,
        uf_destino: String(pickValue(row, ['UF Dest.', 'UF Dest', 'UF Destino']) || '').trim().toUpperCase().slice(0, 2) || null,
        cidade_destino: String(pickValue(row, ['Cid. Dest.', 'Cid Dest', 'Cidade Destino']) || '').trim() || null,
        destino: String(pickValue(row, ['Destino']) || '').trim() || null,
        placa: String(pickValue(row, ['Placa']) || '').trim() || null,
        os: String(pickValue(row, ['O.S', 'OS']) || '').trim() || null,
        contrato: String(pickValue(row, ['Contrato']) || '').trim() || null,
        nf: String(pickValue(row, ['N.F.', 'NF']) || '').trim() || null,
        produto: String(pickValue(row, ['Produto']) || '').trim() || null,
        servico: String(pickValue(row, ['Serviço', 'Servico']) || '').trim() || null,
        peso_kg: normalizeNumberBr(pickValue(row, ['Peso (Kg)', 'Peso Kg', 'Peso'])),
        cliente_nacional: String(pickValue(row, ['Cli. Nacional', 'Cliente Nacional']) || '').trim() || null,
        cliente_regional: String(pickValue(row, ['Cli. Regional', 'Cliente Regional']) || '').trim() || null,
        cliente_final: String(pickValue(row, ['Cli. Final', 'Cliente Final']) || '').trim() || null,
        estado_embarque: String(pickValue(row, ['Est. Embarq', 'Estado Embarque']) || '').trim().toUpperCase().slice(0, 2) || null,
        cidade_embarque: String(pickValue(row, ['Cid. Embarq', 'Cidade Embarque']) || '').trim() || null,
        local_embarque: String(pickValue(row, ['Local Embarque']) || '').trim() || null,
        coordenacao: String(pickValue(row, ['Coordenação', 'Coordenacao']) || '').trim() || null,
        supervisao: String(pickValue(row, ['Supervisão', 'Supervisao']) || '').trim() || null,
        auditor: String(pickValue(row, ['Auditor']) || '').trim() || null,
        motivo_recusa: motivo || null,
        resultado_origem: String(pickValue(row, ['Result. Origem', 'Resultado Origem']) || '').trim() || null,
        resultado_recusa: String(pickValue(row, ['Result. Recusa', 'Resultado Recusa']) || '').trim() || null,
        resultado_auditoria: String(pickValue(row, ['Result. Auditoria', 'Resultado Auditoria']) || '').trim() || null,
        resultado: resultado || null,
        diferenca,
        desconto_kg: descontoKg,
        tipo_evento: impacto.tipo,
        severidade: impacto.severidade,
        score_impacto: impacto.impacto,
        descricao: [resultado, motivo].filter(Boolean).join(' · ') || null,
        origem: 'importar_relatorios_auditoria',
        ativo: true,
      });
    });

    return mapped;
  }

  async function importarAuditoriasOperacionalDaPlanilha(file, opts) {
    const auditorias = await readAuditoriasOperacionalFromFile(file);
    if (!auditorias.length) {
      throw new Error('A planilha de auditorias não possui linhas válidas. Cabeçalhos esperados: Classificador, Data Resultado, Resultado e campos de embarque/auditoria.');
    }

    const batchSize = 500;
    let total = 0;
    for (let i = 0; i < auditorias.length; i += batchSize) {
      const batch = auditorias.slice(i, i + batchSize);
      const { error } = await opts.supabase
        .from('operacional_auditoria_colaborador')
        .upsert(batch, { onConflict: 'import_hash' });
      if (error) throw new Error(error.message || 'Falha ao gravar auditorias no Supabase.');
      total += batch.length;
    }

    const colaboradores = new Set(auditorias.map((a) => a.nome_chave).filter(Boolean)).size;
    const descontos = auditorias.filter((a) => normalizeHeader(a.resultado || '').includes('desconto') || Number(a.desconto_kg || 0) > 0).length;
    const padrao = auditorias.filter((a) => normalizeHeader(a.resultado || '').includes('padrao')).length;
    return { total_linhas: auditorias.length, importados: total, colaboradores, descontos, produto_padrao: padrao };
  }

  async function importarHoteisDaPlanilha(file, opts) {
    const linhas = await readSpreadsheetAsObjects(file);
    if (!linhas.length) {
      throw new Error('A planilha de hotéis não possui linhas válidas para importar.');
    }

    const { data, error } = await opts.supabase.rpc('hospedagem_importar_hoteis_json', {
      p_linhas: linhas,
    });

    if (error) {
      throw new Error(error.message || 'Falha ao importar hotéis para o módulo Hospedagem.');
    }

    const resumo = Array.isArray(data) ? data[0] : data;
    return resumo || { total_linhas: linhas.length, inseridos: 0, atualizados: 0, ignorados: 0 };
  }

  function formatPeriod(period) {
    if (!period?.inicio || !period?.fim) return 'período não detectado';
    const br = (iso) => String(iso).slice(0, 10).split('-').reverse().join('/');
    return period.inicio === period.fim ? br(period.inicio) : `${br(period.inicio)} a ${br(period.fim)}`;
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

  function detectRelatorio(fileName) {
    const n = String(fileName || '').toLowerCase();

    if (n.includes('uber') || n.includes('corridas')) {
      return { tipo: 'uber_corridas', titulo: 'Relatório Uber' };
    }

    if ((n.includes('auditoria') || n.includes('auditorias')) && (n.includes('relatorio') || n.includes('relatório') || n.includes('lista') || n.includes('auditoria'))) {
      return { tipo: 'auditorias_operacional', titulo: 'Auditorias Operacionais por Colaborador' };
    }

    if ((n.includes('endereco') || n.includes('endereço') || n.includes('gps')) && (n.includes('colaborador') || n.includes('colaboradores'))) {
      return { tipo: 'colaboradores_operacional', titulo: 'Endereços dos Colaboradores Operacional' };
    }

    if ((n.includes('mapa') && n.includes('g1000')) || n.includes('ponto-embarque') || n.includes('pontos-embarque') || n.includes('pontos_de_embarque') || n.includes('pontos de embarque')) {
      return { tipo: 'pontos_embarque', titulo: 'Pontos de Embarque Operacional' };
    }

    if (n.includes('hotel') || n.includes('hoteis') || n.includes('hotéis') || n.includes('hospedagem') || n.includes('hospedagens')) {
      return { tipo: 'hoteis', titulo: 'Banco de Hotéis' };
    }

    if (n.includes('nota') || n.includes('fiscal') || n.includes('nfse') || n.includes('nfe')) {
      return { tipo: 'notas_fiscais', titulo: 'Notas Fiscais' };
    }
    if (n.includes('despesa')) {
      return { tipo: 'despesas', titulo: 'Relatório de Despesas' };
    }
    if ((n.includes('resultado') && (n.includes('diario') || n.includes('diário'))) || n.includes('resultado-diario')) {
      return { tipo: 'resultado-diario', titulo: 'Relatório Resultado Diário' };
    }
    if (n.includes('gavilon')) {
      return { tipo: 'resultado-diario-gavilon', titulo: 'Relatório Resultado Diário Gavilon' };
    }
    if (n.includes('resultado')) {
      return { tipo: 'resultado-diario', titulo: 'Relatório Resultado Diário' };
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

  async function uploadAndRegister({ file, item, bar, status, entry }, opts) {
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

    let hoteisResumo = null;
    let pontosResumo = null;
    let colaboradoresResumo = null;
    let auditoriasResumo = null;
    let uberResumo = null;
    if (detected.tipo === 'hoteis') {
      status.textContent = 'Importando hotéis no módulo Hospedagem...';
      setProgress(bar, 82);
      hoteisResumo = await importarHoteisDaPlanilha(file, opts);
    }
    if (detected.tipo === 'pontos_embarque') {
      status.textContent = 'Importando pontos no módulo Operacional...';
      setProgress(bar, 82);
      pontosResumo = await importarPontosEmbarqueDaPlanilha(file, opts);
    }
    if (detected.tipo === 'colaboradores_operacional') {
      status.textContent = 'Importando endereços dos colaboradores no módulo Operacional...';
      setProgress(bar, 82);
      colaboradoresResumo = await importarColaboradoresBaseDaPlanilha(file, opts);
    }
    if (detected.tipo === 'auditorias_operacional') {
      status.textContent = 'Importando histórico de auditorias no módulo Operacional...';
      setProgress(bar, 82);
      auditoriasResumo = await importarAuditoriasOperacionalDaPlanilha(file, opts);
    }
    if (detected.tipo === 'uber_corridas') {
      status.textContent = 'Importando corridas Uber na Conferência...';
      setProgress(bar, 82);
      uberResumo = await importarUberCorridasDaPlanilha(file, opts);
    }

    const importMode = opts.importMode || 'auto';
    const period = ['hoteis', 'pontos_embarque', 'colaboradores_operacional', 'auditorias_operacional'].includes(detected.tipo) ? null : (entry?.period || await detectFilePeriod(file, detected.tipo));
    let check = { exists: false, total: 0, items: [] };

    if (period?.inicio && period?.fim) {
      status.textContent = 'Verificando período existente...';
      check = await checkExistingPeriod({ tipo: detected.tipo, period, opts });
    }

    const effectiveMode = importMode === 'auto'
      ? (check.exists ? 'replace' : 'append')
      : importMode;

    status.textContent = detected.tipo === 'hoteis'
      ? 'Registrando upload da planilha de hotéis...'
      : (detected.tipo === 'pontos_embarque'
        ? 'Registrando upload dos pontos de embarque...'
        : (detected.tipo === 'colaboradores_operacional'
          ? 'Registrando upload dos endereços dos colaboradores...'
          : (detected.tipo === 'auditorias_operacional'
            ? 'Registrando upload das auditorias operacionais...'
            : (detected.tipo === 'uber_corridas'
              ? 'Registrando upload do relatório Uber...'
              : (effectiveMode === 'replace'
            ? 'Registrando substituição inteligente...'
            : 'Registrando complemento inteligente...')))));

    const observacoesPayload = uploadResult.mode === 'chunked'
      ? {
          upload_mode: 'chunked',
          pipeline: 'browser-chunks-no-worker-merge',
          original_path: path,
          total_chunks: uploadResult.manifest?.total_chunks || 0,
          original_size: file.size,
          manifest: uploadResult.manifest,
        }
      : {
          upload_mode: 'single',
          pipeline: 'signed-url',
        };

    const payload = {
      mode: effectiveMode,
      check,
      importacao: {
        tipo_relatorio: detected.tipo,
        titulo_relatorio: detected.titulo,
        arquivo_nome_original: file.name,
        arquivo_nome_storage: finalStoragePath.split('/').pop(),
        storage_bucket: BUCKET,
        storage_path: finalStoragePath,
        tamanho_bytes: file.size || 0,
        mime_type: file.type || null,
        status: 'enviado',
        observacoes: JSON.stringify({
          ...observacoesPayload,
          import_mode_requested: importMode,
          import_mode_effective: effectiveMode,
          periodo: period || null,
          hoteis_importacao: hoteisResumo || null,
          pontos_embarque_importacao: pontosResumo || null,
          colaboradores_operacional_importacao: colaboradoresResumo || null,
          auditorias_operacional_importacao: auditoriasResumo || null,
          uber_corridas_importacao: uberResumo || null,
          replaced_count: effectiveMode === 'replace' ? Number(check.total || 0) : 0,
        }),
        importado_por: user?.id || null,
        importado_por_nome: userName,
        nome_arquivo: file.name,
        tipo: detected.tipo,
        path: finalStoragePath,
        url: publicUrl,
        usuario_id: user?.id || null,
        usuario_nome: userName,
        usuario_email: user?.email || null,
        periodo_inicio: period?.inicio || null,
        periodo_fim: period?.fim || null,
        modo_importacao: effectiveMode,
        substitui_importacoes: effectiveMode === 'replace' ? (check.items || []).map((x) => x.id) : [],
        total_periodo_registros: period?.totalDatas || null,
      }
    };

    const result = await registerSmartImport(payload, opts);
    if (detected.tipo === 'hoteis' && hoteisResumo) {
      status.textContent = `Hotéis: ${hoteisResumo.inseridos || 0} novos · ${hoteisResumo.atualizados || 0} atualizados · ${hoteisResumo.ignorados || 0} ignorados`;
    } else if (detected.tipo === 'pontos_embarque' && pontosResumo) {
      status.textContent = `Pontos: ${pontosResumo.importados || 0} importados · ${pontosResumo.cidades || 0} cidades · ${pontosResumo.supervisoes || 0} supervisões`;
    } else if (detected.tipo === 'colaboradores_operacional' && colaboradoresResumo) {
      status.textContent = `Colaboradores: ${colaboradoresResumo.importados || 0} endereços importados · ${colaboradoresResumo.cidades || 0} cidades · ${colaboradoresResumo.ufs || 0} UFs`;
    } else if (detected.tipo === 'auditorias_operacional' && auditoriasResumo) {
      status.textContent = `Auditorias: ${auditoriasResumo.importados || 0} registros · ${auditoriasResumo.colaboradores || 0} colaboradores · ${auditoriasResumo.descontos || 0} descontos`;
    } else if (detected.tipo === 'uber_corridas' && uberResumo) {
      status.textContent = `Uber: ${uberResumo.importados || 0} corridas · ${uberResumo.colaboradores || 0} colaboradores · ${MONEY_FMT.format(uberResumo.valor_total || 0)}`;
    } else if (result?.mode === 'replace' && result?.replaced_count) {
      status.textContent = `Importado · substituiu ${result.replaced_count} versão(ões)`;
    }

    setProgress(bar, 100);
    if (!(detected.tipo === 'hoteis' && hoteisResumo) && !(detected.tipo === 'pontos_embarque' && pontosResumo) && !(detected.tipo === 'colaboradores_operacional' && colaboradoresResumo) && !(detected.tipo === 'auditorias_operacional' && auditoriasResumo) && !(detected.tipo === 'uber_corridas' && uberResumo)) status.textContent = 'Importado';
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

            <div class="import-intelligence">
              <div class="import-intelligence-row">
                <div class="import-field">
                  <label for="modoImportacao">Modo de importação</label>
                  <select id="modoImportacao">
                    <option value="auto">Automático inteligente</option>
                    <option value="replace">Substituir período detectado</option>
                    <option value="append">Complementar dados existentes</option>
                  </select>
                </div>
                <div class="import-intelligence-note" id="intelligenceNote">
                  No automático, se o período já existir no banco, o painel substitui a versão anterior; planilhas de hotéis vão para Hospedagem, Mapa G1000 e Endereço Colaborador vão para Operacional.
                </div>
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
    const modeSelect = container.querySelector('#modoImportacao');
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
            <div class="file-meta">${detected.titulo} · ${humanSize(entry.file.size)} <span class="upload-mode">${uploadModeLabel(entry.file)}</span>${entry.period ? `<span class="file-period">${formatPeriod(entry.period)}</span>` : ''}</div>
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

    async function addFiles(fileList) {
      const incoming = Array.from(fileList || []);
      if (!incoming.length || state.running) return;

      const existingKey = new Set(state.files.map((entry) => `${entry.file.name}_${entry.file.size}`));

      incoming.forEach((file) => {
        const key = `${file.name}_${file.size}`;
        if (existingKey.has(key)) return;
        existingKey.add(key);

        const valid = isAllowedFile(file);
        const detected = detectRelatorio(file.name);
        const entry = {
          file,
          valid,
          period: null,
          status: valid ? 'pendente' : 'erro',
          message: valid ? 'Detectando período...' : 'Use XLSX, XLS ou CSV até 1GB',
          elements: null,
        };
        state.files.push(entry);

        if (valid) {
          if (detected.tipo === 'hoteis') {
            entry.message = 'Pendente · importará cadastro de hotéis';
          } else if (detected.tipo === 'pontos_embarque') {
            entry.message = 'Pendente · importará pontos de embarque operacional';
          } else if (detected.tipo === 'colaboradores_operacional') {
            entry.message = 'Pendente · importará endereços dos colaboradores no Operacional';
          } else if (detected.tipo === 'auditorias_operacional') {
            entry.message = 'Pendente · importará auditorias no Operacional';
          } else if (detected.tipo === 'uber_corridas') {
            entry.message = 'Pendente · importará corridas Uber na Conferência';
            detectFilePeriod(file, detected.tipo).then((period) => {
              entry.period = period;
              entry.message = period ? `Período: ${formatPeriod(period)} · importará corridas Uber` : 'Pendente · Uber sem período detectado';
              renderFiles();
            });
          } else {
            detectFilePeriod(file, detected.tipo).then((period) => {
              entry.period = period;
              entry.message = period ? `Período: ${formatPeriod(period)}` : 'Pendente · período não detectado';
              renderFiles();
            });
          }
        }
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

          await uploadAndRegister({ file: entry.file, item, bar, status, entry }, { ...opts, importMode: modeSelect?.value || 'auto' });

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
