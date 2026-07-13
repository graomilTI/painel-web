const STORAGE_KEY = 'frotas_prints_condutor_pendente_v1';
const EXCESSOS_TABLE = 'frotas_excesso_velocidade';
const MAX_PENDING = 100;

let client = null;
let collaborators = [];
let collaboratorsPromise = null;
let pending = loadPending();

function normalizeName(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z\s'.-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizePlate(value) {
  return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 7);
}

function plateVariants(value) {
  const plate = normalizePlate(value);
  const variants = new Set(plate ? [plate] : []);
  const digitToLetter = 'ABCDEFGHIJ';
  if (/^[A-Z]{3}\d{4}$/.test(plate)) {
    variants.add(`${plate.slice(0, 4)}${digitToLetter[Number(plate[4])]}${plate.slice(5)}`);
  } else if (/^[A-Z]{3}\d[A-J]\d{2}$/.test(plate)) {
    variants.add(`${plate.slice(0, 4)}${digitToLetter.indexOf(plate[4])}${plate.slice(5)}`);
  }
  return [...variants];
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function loadPending() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.slice(0, MAX_PENDING) : [];
  } catch {
    return [];
  }
}

function savePending() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(pending.slice(0, MAX_PENDING)));
}

function isActive(row) {
  if (row?.ativo === false) return false;
  const status = normalizeName(row?.situacao || '');
  return !['INATIVO', 'NAO ATIVO', 'DESLIGADO', 'DESLIGADA'].includes(status);
}

async function fetchRows(table, select) {
  const all = [];
  for (let offset = 0; offset < 20000; offset += 1000) {
    const { data, error } = await client.from(table).select(select).range(offset, offset + 999);
    if (error) throw error;
    const rows = Array.isArray(data) ? data : [];
    all.push(...rows);
    if (rows.length < 1000) break;
  }
  return all;
}

async function loadCollaborators() {
  if (collaboratorsPromise) return collaboratorsPromise;
  collaboratorsPromise = (async () => {
    const base = await fetchRows('colaboradores', 'id,nome,cpf,situacao,coordenacao,supervisao');
    const map = new Map();
    base.forEach((row) => {
      if (!row?.nome || !isActive(row)) return;
      const key = normalizeName(row.nome);
      if (!key) return;
      map.set(key, {
        key,
        nome: String(row.nome).trim(),
        cpf: String(row.cpf || '').replace(/\D/g, ''),
        coordenacao: String(row.coordenacao || '').trim(),
        supervisao: String(row.supervisao || '').trim()
      });
    });
    collaborators = [...map.values()].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    renderPending();
    return collaborators;
  })();
  return collaboratorsPromise;
}

function findExactCollaborator(name) {
  const key = normalizeName(name);
  return key ? collaborators.find((item) => item.key === key) || null : null;
}

function collectText(value, out = [], depth = 0) {
  if (value == null || depth > 4) return out;
  if (typeof value === 'string') {
    if (value.trim()) out.push(value.trim());
    return out;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectText(item, out, depth + 1));
    return out;
  }
  if (typeof value === 'object') {
    Object.values(value).forEach((item) => collectText(item, out, depth + 1));
  }
  return out;
}

function extractDriverName(file) {
  const direct = [
    file?.driverName, file?.driver_name, file?.motorista, file?.nomeMotorista,
    file?.nome_motorista, file?.condutor, file?.condutor_nome,
    file?.driverOcrName, file?.ocrDriverName
  ].find(Boolean);
  if (direct) return String(direct).trim();

  const text = collectText(file).join('\n');
  const patterns = [
    /(?:^|\n)\s*([A-ZÀ-Ú][A-ZÀ-Ú' .-]{5,80}?)\s*,\s*(?:CONSTATAMOS|COMUNICAMOS|IDENTIFICAMOS|INFORMAMOS)\b/i,
    /(?:NOME|CONDUTOR|MOTORISTA)\s*[:,-]\s*([A-ZÀ-Ú][A-ZÀ-Ú' .-]{5,80}?)(?:\n|,|\s{2,}|$)/i
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1].replace(/\s+/g, ' ').trim();
  }
  return '';
}

function extractPlate(file) {
  const direct = normalizePlate(file?.plate || file?.placa || file?.vehiclePlate || file?.vehicle_plate);
  if (direct) return direct;
  const text = collectText(file).join(' ').toUpperCase();
  const match = text.match(/\b([A-Z]{3}\s*-?\s*[0-9][A-Z0-9]\s*[0-9]{2})\b/);
  return normalizePlate(match?.[1] || '');
}

function normalizeDate(value) {
  const raw = String(value || '').trim();
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const br = raw.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})/);
  if (!br) return '';
  const year = br[3].length === 2 ? `20${br[3]}` : br[3];
  return `${year}-${br[2].padStart(2, '0')}-${br[1].padStart(2, '0')}`;
}

function extractRecords(file) {
  const records = [];
  const structured = file?.registros || file?.records || file?.extractedRegistros || [];
  if (Array.isArray(structured)) {
    structured.forEach((row) => {
      const date = normalizeDate(row?.data || row?.date);
      const speed = Math.round(Number(row?.velocidade || row?.speed || 0));
      if (date && speed) records.push({ date, speed });
    });
  }

  const text = collectText(file).join(' ').toUpperCase();
  const pattern = /(\d{1,2}[\/.-]\d{1,2}(?:[\/.-]\d{2,4})?)[\s\S]{0,90}?(\d{2,3})\s*(?:KM\/?H|KMH|KPH)/g;
  let match;
  while ((match = pattern.exec(text))) {
    const date = normalizeDate(match[1]);
    const speed = Number(match[2]);
    if (date && speed) records.push({ date, speed });
  }

  return [...new Map(records.map((row) => [`${row.date}|${row.speed}`, row])).values()];
}

function sanitizeFileForExistingFlow(file, pendingId) {
  return {
    fileName: `print-pendente-${pendingId}.png`,
    fileUrl: file?.fileUrl || file?.url || '',
    folderName: 'OCR - CONFERIR',
    driverFolderName: 'OCR - CONFERIR',
    driverName: '',
    plate: '',
    registros: [],
    matchedIds: [],
    requiresManualDriver: true
  };
}

function addPending(file, candidateName) {
  const item = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    fileName: file?.fileName || file?.name || 'Print sem nome',
    fileUrl: file?.fileUrl || file?.url || '',
    fileId: file?.fileId || file?.id || '',
    candidateName: String(candidateName || '').trim(),
    plate: extractPlate(file),
    records: extractRecords(file),
    preview: collectText(file).join(' ').slice(0, 500),
    createdAt: new Date().toISOString()
  };
  pending.unshift(item);
  pending = pending.slice(0, MAX_PENDING);
  savePending();
  return item;
}

function ensureStyles() {
  if (document.getElementById('printDriverValidationStyles')) return;
  const style = document.createElement('style');
  style.id = 'printDriverValidationStyles';
  style.textContent = `
    .print-driver-pending{margin-top:16px;border:1px solid rgba(245,158,11,.32);background:rgba(120,53,15,.13);border-radius:18px;padding:14px}
    .print-driver-pending[hidden]{display:none}.print-driver-pending h3{margin:0;color:#fde68a;font-size:15px}
    .print-driver-pending>p{margin:6px 0 12px;color:#cbd5e1;font-size:12px}
    .print-driver-item{padding:12px 0;border-top:1px solid rgba(245,158,11,.18)}
    .print-driver-item:first-child{border-top:0}.print-driver-meta{font-size:12px;color:#94a3b8;line-height:1.45;margin-bottom:9px}
    .print-driver-meta strong{color:#f8fafc}.print-driver-form{position:relative;display:grid;grid-template-columns:minmax(180px,1fr) auto;gap:8px}
    .print-driver-results{position:absolute;left:0;right:110px;top:46px;z-index:90;background:#0d0d18;border:1px solid rgba(34,197,94,.35);border-radius:12px;padding:5px;max-height:230px;overflow:auto}
    .print-driver-results[hidden]{display:none}.print-driver-option{display:block;width:100%;border:0;background:transparent;color:#e2e2f0;text-align:left;padding:9px;border-radius:9px;cursor:pointer}
    .print-driver-option:hover{background:rgba(22,101,52,.35)}.print-driver-option small{display:block;color:#64748b;margin-top:2px}
    @media(max-width:600px){.print-driver-form{grid-template-columns:1fr}.print-driver-results{right:0;top:46px}}
  `;
  document.head.appendChild(style);
}

function ensurePendingHost() {
  ensureStyles();
  const uploadBox = document.querySelector('.upload-box');
  if (!uploadBox) return null;
  let host = uploadBox.querySelector('[data-print-driver-pending]');
  if (!host) {
    host = document.createElement('section');
    host.className = 'print-driver-pending';
    host.dataset.printDriverPending = '1';
    uploadBox.appendChild(host);
  }
  return host;
}

function renderPending() {
  const host = ensurePendingHost();
  if (!host) return;
  const signature = `${pending.map((item) => item.id).join('|')}::${collaborators.length}`;
  if (host.dataset.renderSignature === signature) return;
  host.dataset.renderSignature = signature;
  host.hidden = pending.length === 0;
  if (!pending.length) {
    host.innerHTML = '';
    return;
  }

  host.innerHTML = `
    <h3>Condutores pendentes de identificação (${pending.length})</h3>
    <p>O nome lido no print não possui correspondência exata na base. Selecione um colaborador cadastrado.</p>
    <div>${pending.map((item) => `
      <article class="print-driver-item" data-pending-id="${escapeHtml(item.id)}">
        <div class="print-driver-meta">
          <strong>${escapeHtml(item.fileName)}</strong><br>
          OCR: ${escapeHtml(item.candidateName || 'nome não identificado')} · Placa: ${escapeHtml(item.plate || 'não identificada')}
        </div>
        <div class="print-driver-form">
          <input class="speed-input" type="text" autocomplete="off" placeholder="Digite o nome do colaborador" data-driver-search>
          <button class="speed-btn speed-btn-soft speed-btn-compact" type="button" data-driver-confirm>Confirmar</button>
          <div class="print-driver-results" data-driver-results hidden></div>
        </div>
      </article>`).join('')}
    </div>`;

  host.querySelectorAll('[data-pending-id]').forEach((article) => {
    const input = article.querySelector('[data-driver-search]');
    const results = article.querySelector('[data-driver-results]');
    const showResults = () => {
      const term = normalizeName(input.value);
      const matches = term
        ? collaborators.filter((item) => item.key.includes(term)).slice(0, 10)
        : collaborators.slice(0, 10);
      results.innerHTML = matches.length
        ? matches.map((item) => `<button class="print-driver-option" type="button" data-collaborator-key="${escapeHtml(item.key)}"><strong>${escapeHtml(item.nome)}</strong><small>${escapeHtml([item.supervisao, item.coordenacao].filter(Boolean).join(' · '))}</small></button>`).join('')
        : '<div class="colab-empty">Nenhum colaborador encontrado.</div>';
      results.hidden = false;
      results.querySelectorAll('[data-collaborator-key]').forEach((button) => {
        button.addEventListener('mousedown', (event) => {
          event.preventDefault();
          const selected = collaborators.find((item) => item.key === button.dataset.collaboratorKey);
          if (!selected) return;
          input.value = selected.nome;
          input.dataset.selectedKey = selected.key;
          results.hidden = true;
        });
      });
    };
    input.addEventListener('input', () => {
      input.dataset.selectedKey = '';
      showResults();
    });
    input.addEventListener('focus', showResults);
    input.addEventListener('blur', () => setTimeout(() => { results.hidden = true; }, 150));
    article.querySelector('[data-driver-confirm]').addEventListener('click', () => confirmPending(article.dataset.pendingId, input));
  });
}

function rowMatchesPending(row, item) {
  const rowPlates = new Set(plateVariants(row?.placa));
  const samePlate = plateVariants(item.plate).some((plate) => rowPlates.has(plate));
  if (!samePlate) return false;
  if (!item.records?.length) return true;
  return item.records.some((record) => {
    return normalizeDate(row?.data_evento) === record.date
      && Math.round(Number(row?.velocidade || 0)) === record.speed;
  });
}

async function associatePending(item, collaborator) {
  const { data, error } = await client
    .from(EXCESSOS_TABLE)
    .select('id,placa,data_evento,velocidade,status_notificacao')
    .in('status_notificacao', ['PENDENTE', 'GERADA'])
    .limit(2000);
  if (error) throw error;

  const matched = (data || []).filter((row) => rowMatchesPending(row, item));
  if (matched.length) {
    const payload = {
      patrimonio_funcionario: collaborator.nome,
      coordenacao: collaborator.coordenacao || null,
      supervisao: collaborator.supervisao || null,
      status_cruzamento: 'MOTORISTA_IDENTIFICADO'
    };
    const update = await client.from(EXCESSOS_TABLE).update(payload).in('id', matched.map((row) => row.id));
    if (update.error) throw update.error;
  }
  return matched.length;
}

async function confirmPending(id, input) {
  const item = pending.find((row) => row.id === id);
  if (!item) return;
  const exact = collaborators.find((row) => row.key === input.dataset.selectedKey)
    || findExactCollaborator(input.value);
  if (!exact) {
    alert('Selecione um colaborador existente na lista. Nomes sem correspondência exata não são aceitos.');
    return;
  }

  const button = input.closest('[data-pending-id]')?.querySelector('[data-driver-confirm]');
  if (button) {
    button.disabled = true;
    button.textContent = 'Salvando...';
  }
  try {
    const count = await associatePending(item, exact);
    pending = pending.filter((row) => row.id !== id);
    savePending();
    renderPending();
    alert(count
      ? `Condutor ${exact.nome} associado a ${count} registro(s) de excesso.`
      : `Condutor ${exact.nome} confirmado para o print. Nenhum excesso pendente correspondente foi encontrado.`);
  } catch (error) {
    console.error('[FROTAS] Identificação manual do print:', error);
    alert(error?.message || 'Não foi possível identificar o condutor do print.');
    if (button) {
      button.disabled = false;
      button.textContent = 'Confirmar';
    }
  }
}

function isUploadRequest(input, init) {
  if (String(init?.method || 'GET').toUpperCase() !== 'POST') return null;
  try {
    const body = JSON.parse(String(init?.body || ''));
    return body?.action === 'upload_excesso_velocidade' ? body : null;
  } catch {
    return null;
  }
}

function installFetchValidation() {
  if (window.__printDriverFetchValidationInstalled) return;
  const originalFetch = window.fetch.bind(window);
  window.fetch = async function validatedFetch(input, init) {
    const uploadBody = isUploadRequest(input, init);
    const response = await originalFetch(input, init);
    if (!uploadBody || !response.ok) return response;

    try {
      await loadCollaborators();
      const json = await response.clone().json();
      const files = Array.isArray(json?.data?.files) ? json.data.files : [];
      if (!files.length) return response;

      let changed = false;
      json.data.files = files.map((file) => {
        const candidate = extractDriverName(file);
        const exact = findExactCollaborator(candidate);
        if (exact) {
          return {
            ...file,
            driverName: exact.nome,
            motorista: exact.nome,
            condutor: exact.nome,
            driverFolderName: exact.nome
          };
        }

        changed = true;
        const item = addPending(file, candidate);
        return sanitizeFileForExistingFlow(file, item.id);
      });

      if (!changed) return response;
      renderPending();
      return new Response(JSON.stringify(json), {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers
      });
    } catch (error) {
      console.warn('[FROTAS] Validação do condutor no print não foi concluída:', error);
      return response;
    }
  };
  window.__printDriverFetchValidationInstalled = true;
}

export function installPrintDriverValidation(supabase) {
  if (!supabase?.from) return;
  client = supabase;
  installFetchValidation();
  loadCollaborators();

  const observer = new MutationObserver(() => renderPending());
  observer.observe(document.body, { childList: true, subtree: true });
  renderPending();
}
