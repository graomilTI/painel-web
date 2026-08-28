export function normalizeOcrResponse(payload) {
  const root = payload && typeof payload === 'object' ? payload : {};
  const data = root.data && typeof root.data === 'object' ? root.data : root;
  const files = Array.isArray(data.files) ? data.files : (Array.isArray(root.files) ? root.files : []);
  return { ...data, files };
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

function normalizePlate(value) {
  return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 7);
}

function parseSpeed(value) {
  const parsed = Number(String(value ?? '').replace(',', '.').replace(/[^0-9.]/g, ''));
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : 0;
}

function getRecords(file, extractTextRecords) {
  const structured = Array.isArray(file?.registros || file?.extractedRegistros || file?.records)
    ? (file.registros || file.extractedRegistros || file.records) : [];
  const extracted = typeof extractTextRecords === 'function' ? extractTextRecords(file) : [];
  const records = [...structured, ...(Array.isArray(extracted) ? extracted : [])]
    .map((row) => ({ date: normalizeDate(row?.data || row?.date), speed: parseSpeed(row?.velocidade || row?.speed) }))
    .filter((row) => row.date && row.speed);
  return [...new Map(records.map((row) => [`${row.date}|${row.speed}`, row])).values()];
}

// Regra pura e testável: nunca cruza por nome e nunca aceita somente a placa.
export function buildOcrReconciliationPlan({ files, openRows, helpers, speedTolerance = 1 }) {
  const getPlate = helpers?.getPlate || ((file) => normalizePlate(file?.plate || file?.placa));
  const getNotification = helpers?.getNotification || (() => '');
  const getMatchedIds = helpers?.getMatchedIds || (() => []);
  const getTextRecords = helpers?.getTextRecords || (() => []);
  const rowNotification = helpers?.rowNotification || (() => '');
  const rows = Array.isArray(openRows) ? openRows : [];

  return (Array.isArray(files) ? files : []).map((file) => {
    const explicitIds = new Set(getMatchedIds(file).map(String));
    const notification = String(getNotification(file) || '').trim();
    const plate = normalizePlate(getPlate(file));
    const records = getRecords(file, getTextRecords);
    const matched = new Map();
    const ambiguous = [];

    if (explicitIds.size) {
      rows.forEach((row) => {
        if (explicitIds.has(String(row.id))) matched.set(String(row.id), { row, reason: 'id_explicito' });
      });
    } else if (notification) {
      const candidates = rows.filter((row) => String(rowNotification(row) || '').trim() === notification);
      if (candidates.length === 1) matched.set(String(candidates[0].id), { row: candidates[0], reason: 'notificacao_exata' });
      else if (candidates.length > 1) ambiguous.push({ evidence: `notificacao:${notification}`, candidateIds: candidates.map((row) => row.id) });
    }

    if (!explicitIds.size && !matched.size && plate && records.length) {
      records.forEach((record) => {
        const candidates = rows.filter((row) => {
          const rowPlate = normalizePlate(row?.placa);
          const rowDate = normalizeDate(row?.data_evento);
          const rowSpeed = parseSpeed(row?.velocidade);
          return rowPlate === plate && rowDate === record.date && rowSpeed && Math.abs(rowSpeed - record.speed) <= speedTolerance;
        });
        if (candidates.length === 1) matched.set(String(candidates[0].id), { row: candidates[0], reason: 'placa_data_velocidade' });
        else if (candidates.length > 1) ambiguous.push({ evidence: `${plate}|${record.date}|${record.speed}`, candidateIds: candidates.map((row) => row.id) });
      });
    }

    const matches = [...matched.values()];
    const status = matches.length ? 'CONCILIADO' : (ambiguous.length ? 'AMBIGUO' : 'PENDENTE_CONFERENCIA');
    return { file, plate, records, matches, ambiguous, status };
  });
}
