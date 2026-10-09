/**
 * Backend Web App - Frotas / Excesso de Velocidade
 *
 * Publicar como Web App:
 * - Executar como: você
 * - Quem tem acesso: qualquer pessoa com o link ou usuários da organização
 *
 * Ativar em Serviços Avançados do Apps Script:
 * - Drive API
 *
 * Pasta mãe padrão:
 * 1q5Ba5qqNJEBUZYA8GNRZmXZZsJ8U0YIr
 *
 * Ações aceitas no doPost:
 * - upload_excesso_velocidade: prints de excesso de velocidade (OCR) -> pasta do condutor
 * - upload_multa_dossie: PDF único das multas (termo assinado + autos) -> pasta do condutor
 */

const FROTAS_PASTA_MAE_PADRAO_ID = '1q5Ba5qqNJEBUZYA8GNRZmXZZsJ8U0YIr';
const FROTAS_PASTA_OCR_CONFERIR = 'OCR - CONFERIR';

function doPost(e) {
  try {
    const payload = JSON.parse(e.postData && e.postData.contents ? e.postData.contents : '{}');
    if (payload.action === 'upload_multa_dossie') {
      return json_(handleUploadMultaDossie_(payload));
    }
    if (payload.action !== 'upload_excesso_velocidade') {
      return json_({ ok: false, message: 'Ação inválida.' });
    }

    const parentFolderId = payload.parentFolderId || FROTAS_PASTA_MAE_PADRAO_ID;
    const parentFolder = DriveApp.getFolderById(parentFolderId);

    const fallbackDriverName = safeDriverName_(payload.driverName || payload.driverFolderName || payload.folderName || payload.fallbackFolderName || '');
    const fallbackFolderName = safeDriverName_(payload.driverFolderName || payload.folderName || payload.fallbackFolderName || payload.driverName || '');
    const fallbackPlate = sanitizePlate_(payload.plate || '');
    const notificationDate = payload.notificationDate || Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'dd/MM/yyyy');
    const notificationYear = getYearFromDate_(notificationDate);
    const files = Array.isArray(payload.files) ? payload.files : [];
    const driverMap = Array.isArray(payload.driverMap) ? payload.driverMap : [];
    const knownDrivers = Array.isArray(payload.knownDrivers) ? payload.knownDrivers : [];

    if (!files.length) return json_({ ok: false, message: 'Nenhum arquivo recebido.' });

    const parsed = { placa: fallbackPlate, registros: [] };
    const savedFiles = [];

    files.forEach((file, index) => {
      const originalName = String(file.name || ('print-' + (index + 1) + '.png'));
      const ext = getExtension_(originalName, file.mimeType || 'image/png');
      const mime = file.mimeType || MimeType.PNG;
      const base64 = String(file.base64 || '');
      if (!base64) return;

      const blob = Utilities.newBlob(Utilities.base64Decode(base64), mime, originalName);

      const browserOcrText = String(file.browserOcrText || file.ocrTextHint || '').trim();
      const driveOcrResult = runBestOcrForFile_(file, blob, originalName);
      const driveOcrText = driveOcrResult.text || '';
      const browserScore = scoreOcrText_(browserOcrText);
      const driveScore = scoreOcrText_(driveOcrText);
      const ocrText = browserScore >= driveScore && browserOcrText ? browserOcrText : driveOcrText;
      const ocrResult = browserScore >= driveScore && browserOcrText
        ? { text: browserOcrText, variant: 'browser-' + String(file.browserOcrSource || 'tesseract'), score: browserScore, attempts: (driveOcrResult.attempts || 0) }
        : driveOcrResult;
      const extracted = parseSpeedPrint_(ocrText);
      extracted.notificationNumber = extracted.notificationNumber || extractNotificationNumber_([originalName, ocrText].join('\n'));
      const resolved = resolveDriverForFile_({
        extracted: extracted,
        driverMap: driverMap,
        knownDrivers: knownDrivers,
        ocrText: ocrText,
        originalName: originalName,
        fallbackDriverName: fallbackDriverName,
        fallbackFolderName: fallbackFolderName,
        fallbackPlate: fallbackPlate
      });

      const matchedIds = Array.isArray(resolved.matchedIds) ? resolved.matchedIds.filter(Boolean) : [];
      const matchedRecords = Array.isArray(resolved.matchedRecords) ? resolved.matchedRecords : [];
      const driverName = safeDriverName_(resolved.driverName) || FROTAS_PASTA_OCR_CONFERIR;
      const driverFolderName = safeDriverName_(resolved.driverFolderName || driverName) || FROTAS_PASTA_OCR_CONFERIR;
      const driverFolder = getOrCreateFolder_(parentFolder, driverFolderName);
      const finalName = buildNotificationFileName_(driverFolder, notificationYear, driverName, 0, ext, extracted.notificationNumber || '');
      const savedFile = driverFolder.createFile(blob).setName(finalName);

      if (!parsed.placa && (extracted.placa || resolved.plate)) parsed.placa = extracted.placa || resolved.plate;
      parsed.registros = parsed.registros.concat(extracted.registros || []);

      savedFiles.push({
        fileName: finalName,
        fileId: savedFile.getId(),
        fileUrl: savedFile.getUrl(),
        driverName: driverName,
        driverFolderName: driverFolderName,
        driverFolderId: driverFolder.getId(),
        plate: extracted.placa || resolved.plate || fallbackPlate || '',
        matchedBy: resolved.matchedBy || 'ocr_conferir',
        matchedIds: matchedIds,
        recordIds: matchedIds,
        archivedIds: matchedIds,
        matchedRecords: matchedRecords,
        notificationNumber: extracted.notificationNumber || '',
        originalNotificationNumber: extracted.notificationNumber || '',
        originalFileName: originalName,
        registros: extracted.registros || [],
        extractedRegistros: extracted.registros || [],
        ocrOk: Boolean(ocrText),
        ocrPreview: ocrText ? ocrText.slice(0, 1500) : '',
        ocrVariantUsed: ocrResult.variant || '',
        browserOcrSource: file.browserOcrSource || '',
        browserOcrPreview: browserOcrText ? browserOcrText.slice(0, 1500) : '',
        driveOcrPreview: driveOcrText ? driveOcrText.slice(0, 1500) : '',
        ocrAttempts: ocrResult.attempts || 0
      });
    });

    parsed.registros = dedupeRegistros_(parsed.registros);

    return json_({
      ok: true,
      message: 'Prints salvos e interpretados em lote.',
      data: {
        placa: parsed.placa || fallbackPlate,
        registros: parsed.registros,
        files: savedFiles
      }
    });
  } catch (err) {
    return json_({ ok: false, message: err && err.message ? err.message : String(err) });
  }
}

function doGet() {
  return json_({ ok: true, service: 'Frotas - Excesso de Velocidade', status: 'online' });
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function sanitize_(value) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[\\/:*?"<>|]/g, '-')
    .toUpperCase()
    .slice(0, 140);
}

function normalizeLookup_(value) {
  return sanitize_(value)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function sanitizePlate_(value) {
  return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 7);
}

function isInvalidDriverName_(value) {
  const n = normalizeLookup_(value);
  if (!n) return true;

  if (n === 'MOTORISTA NAO IDENTIFICADO') return true;
  if (n === 'MOTORISTA NAO IDENTIFICADA') return true;
  if (n === 'NAO IDENTIFICADO') return true;
  if (n === 'NAO IDENTIFICADA') return true;
  if (n === 'OCR CONFERIR') return false;

  // Não deixar título/nome de arquivo virar pasta de motorista.
  if (/^\d+\s*NOTIFICACAO DE VELOCIDADE/.test(n)) return true;
  if (/NOTIFICACAO DE VELOCIDADE/.test(n) && /MOTORISTA/.test(n)) return true;
  if (/\.PNG$|\.JPE?G$|\.WEBP$/.test(n)) return true;

  // Evita frases do corpo da mensagem virarem nome.
  if (/CONSTATAMOS|SISTEMA DE RASTREAMENTO|LIMITE MAXIMO|VELOCIDADE PERMITIDO|REGISTROS ABAIXO/.test(n)) return true;

  return false;
}

function safeDriverName_(value) {
  const s = sanitize_(value || '');
  if (isInvalidDriverName_(s)) return '';
  return s;
}

function normalizeFolderKey_(value) {
  return normalizeLookup_(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function findExistingFolderByNormalizedName_(parent, safeName) {
  const targetKey = normalizeFolderKey_(safeName);
  if (!targetKey) return null;

  // 1) Busca rápida pelo nome exato.
  const exactIt = parent.getFoldersByName(safeName);
  while (exactIt.hasNext()) {
    const folder = exactIt.next();
    if (normalizeFolderKey_(folder.getName()) === targetKey) return folder;
  }

  // 2) Busca robusta para casos com acento, espaço invisível ou variação de caixa.
  const allIt = parent.getFolders();
  while (allIt.hasNext()) {
    const folder = allIt.next();
    if (normalizeFolderKey_(folder.getName()) === targetKey) return folder;
  }

  return null;
}

function getOrCreateFolder_(parent, name) {
  const safeName = safeDriverName_(name) || FROTAS_PASTA_OCR_CONFERIR;

  // Evita que dois uploads simultâneos criem duas pastas com o mesmo motorista.
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);

    const existing = findExistingFolderByNormalizedName_(parent, safeName);
    if (existing) return existing;

    return parent.createFolder(safeName);
  } finally {
    try {
      lock.releaseLock();
    } catch (err) {}
  }
}

function getExtension_(name, mimeType) {
  const m = String(name || '').match(/\.([a-z0-9]{2,5})$/i);
  if (m) return m[1].toLowerCase();
  if (/jpe?g/i.test(mimeType)) return 'jpg';
  if (/webp/i.test(mimeType)) return 'webp';
  return 'png';
}

function escapeRegex_(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getYearFromDate_(value) {
  const s = String(value || '');
  const m = s.match(/(20\d{2}|19\d{2})/);
  if (m) return m[1];
  return Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'yyyy');
}

function getNextNotificationNumber_(folder, year, driverName) {
  const safeDriver = safeDriverName_(driverName) || FROTAS_PASTA_OCR_CONFERIR;
  const safeYear = String(year || Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'yyyy'));
  const regex = new RegExp('^(\\d+)º\\s+NOTIFICAÇÃO DE VELOCIDADE\\s+' + escapeRegex_(safeYear) + '\\s+' + escapeRegex_(safeDriver), 'i');
  let max = 0;
  const files = folder.getFiles();
  while (files.hasNext()) {
    const name = files.next().getName();
    const m = String(name || '').match(regex);
    if (m) {
      const n = Number(m[1]);
      if (n > max) max = n;
    }
  }
  return max + 1;
}

function buildNotificationFileName_(driverFolder, year, driverName, index, ext, forcedNumber) {
  const safeDriver = safeDriverName_(driverName) || FROTAS_PASTA_OCR_CONFERIR;
  const safeYear = String(year || Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'yyyy'));
  const parsedForced = Number(String(forcedNumber || '').replace(/\D/g, ''));
  const baseNumber = parsedForced > 0 ? parsedForced : getNextNotificationNumber_(driverFolder, safeYear, safeDriver);
  const number = baseNumber + Number(index || 0);
  return number + 'º NOTIFICAÇÃO DE VELOCIDADE ' + safeYear + ' ' + safeDriver + '.' + String(ext || 'png').toLowerCase();
}

function getOcrCandidateBlobs_(file, originalBlob, originalName) {
  const candidates = [];
  const seen = {};

  function addCandidate(label, base64Value) {
    const value = String(base64Value || '');
    if (!value || seen[value]) return;
    seen[value] = true;
    candidates.push({
      label: label,
      blob: Utilities.newBlob(Utilities.base64Decode(value), 'image/png', label + '-' + originalName.replace(/\.[^.]+$/, '.png'))
    });
  }

  addCandidate('ocrBase64', file.ocrBase64);

  const variants = Array.isArray(file.ocrVariants) ? file.ocrVariants : [];
  variants.forEach(function (variant, index) {
    if (!variant) return;
    addCandidate(String(variant.name || ('variant-' + (index + 1))), variant.base64 || variant.ocrBase64 || '');
  });

  candidates.push({ label: 'original', blob: originalBlob });
  return candidates;
}

function scoreOcrText_(text) {
  const extracted = parseSpeedPrint_(text || '');
  let score = 0;
  if (extracted.motorista) score += 100;
  if (extracted.placa) score += 30;
  if (extracted.notificationNumber) score += 25;
  if (extracted.registros && extracted.registros.length) score += 20 * extracted.registros.length;
  const normalized = normalizeLookup_(text || '');
  if (/CONSTATAMOS|VELOCIDADE|KMH|KM H|KM\/H|PLACA/.test(normalized)) score += 10;
  return score;
}

function runBestOcrForFile_(file, originalBlob, originalName) {
  const candidates = getOcrCandidateBlobs_(file || {}, originalBlob, originalName);
  let best = { text: '', variant: '', score: -1, attempts: 0 };

  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[i];
    let text = '';
    try {
      text = runDriveOcr_(candidate.blob, originalName + ' - ' + candidate.label) || '';
    } catch (err) {
      text = '';
    }

    const score = scoreOcrText_(text);
    best.attempts++;
    if (score > best.score || (!best.text && text)) {
      best = { text: text, variant: candidate.label, score: score, attempts: best.attempts };
    }

    // Já encontrou o que precisa para arquivar automaticamente.
    if (score >= 130) break;
  }

  return best;
}

function runDriveOcr_(blob, title) {
  const resource = {
    title: 'OCR - ' + title,
    mimeType: MimeType.GOOGLE_DOCS
  };

  const docFile = Drive.Files.insert(resource, blob, {
    ocr: true,
    ocrLanguage: 'pt'
  });

  const doc = DocumentApp.openById(docFile.id);
  const text = doc.getBody().getText() || '';

  try {
    DriveApp.getFileById(docFile.id).setTrashed(true);
  } catch (err) {}

  return text;
}

function parseSpeedPrint_(text) {
  const original = String(text || '');
  const raw = original.toUpperCase();
  const compact = raw.replace(/\s+/g, ' ');
  const out = { placa: '', motorista: '', notificationNumber: extractNotificationNumber_(original), registros: [] };

  const plateMatch = compact.match(/\b([A-Z]{3}\s*-?\s*\d[A-Z0-9]\d{2}|[A-Z]{3}\s*-?\s*\d{4})\b/);
  if (plateMatch) out.placa = sanitizePlate_(plateMatch[1]);

  // 1) Padrão dos prints do WhatsApp: "NOME SOBRENOME," no começo da mensagem.
  const firstLineDriver = extractDriverFromMessageStart_(original);
  if (firstLineDriver) out.motorista = firstLineDriver;

  // 2) Padrão explícito: Motorista/Condutor/Colaborador: Nome.
  if (!out.motorista) {
    const motoristaMatch = compact.match(/(?:MOTORISTA|CONDUTOR|COLABORADOR)\s*[:\-]?\s*([A-ZÀ-Ú ]{8,80})/);
    if (motoristaMatch) {
      const candidate = cleanDriverCandidate_(motoristaMatch[1]);
      if (candidate) out.motorista = candidate;
    }
  }

  const dateRegex = /(\d{2}[\/\-.]\d{2}[\/\-.]\d{4})/g;
  let match;
  while ((match = dateRegex.exec(compact)) !== null) {
    const date = normalizeDate_(match[1]);
    const windowText = compact.slice(match.index, Math.min(compact.length, match.index + 180));
    const speedMatch = windowText.match(/\b(1[2-9]\d|2\d{2}|\d{2})\s*(?:KM\/?H|KMH|KM|K\/H)?\b/);
    if (date && speedMatch) {
      const speed = Number(speedMatch[1]);
      if (speed >= 80 && speed <= 250) out.registros.push({ data: date, velocidade: speed });
    }
  }

  if (!out.registros.length) {
    const speedOnly = compact.match(/\b(12[1-9]|1[3-9]\d|2\d{2})\s*(?:KM\/?H|KMH|KM|K\/H)\b/g) || [];
    speedOnly.forEach((s) => {
      const n = Number(String(s).match(/\d+/)[0]);
      out.registros.push({ data: '', velocidade: n });
    });
  }

  return out;
}

function extractDriverFromMessageStart_(text) {
  const lines = String(text || '')
    .split(/\r?\n/)
    .map((line) => sanitize_(line))
    .filter(Boolean);

  // Procura nas primeiras linhas para ignorar ruído do OCR antes do balão.
  const maxLines = Math.min(lines.length, 8);
  for (let i = 0; i < maxLines; i++) {
    let line = lines[i];
    if (!line) continue;

    // Ex.: "CELMA MARTINS FREITAS," ou "ALDAIR PEREIRA MOREIRA,"
    const commaMatch = line.match(/^([A-ZÀ-Ú]{2,}(?:\s+[A-ZÀ-Ú]{2,}){1,6})\s*,/);
    if (commaMatch) {
      const candidate = cleanDriverCandidate_(commaMatch[1]);
      if (candidate) return candidate;
    }

    // Caso o OCR remova a vírgula e a linha tenha só o nome.
    const onlyNameMatch = line.match(/^([A-ZÀ-Ú]{2,}(?:\s+[A-ZÀ-Ú]{2,}){1,6})$/);
    if (onlyNameMatch) {
      const candidate2 = cleanDriverCandidate_(onlyNameMatch[1]);
      if (candidate2) return candidate2;
    }
  }

  // Fallback perto da palavra CONSTATAMOS, mesmo quando o OCR coloca várias linhas antes do balão.
  const rawLines = String(text || '').split(/\r?\n/);
  const constatamosIdx = rawLines.findIndex((line) => /CONSTATAMOS|COMUNICAMOS|IDENTIFICAMOS|INFORMAMOS/i.test(line));
  if (constatamosIdx > 0) {
    const start = Math.max(0, constatamosIdx - 14);
    for (let i = constatamosIdx - 1; i >= start; i--) {
      const candidateLine = rawLines[i];
      const candidate = cleanDriverCandidate_(candidateLine);
      if (candidate) return candidate;
    }
  }

  // Fallback no texto compacto.
  const compact = sanitize_(text).replace(/\s+/g, ' ');
  const compactPatterns = [
    /(?:^|\s)([A-ZÀ-Ú]{2,}(?:\s+[A-ZÀ-Ú]{2,}){1,6})\s*,?\s+CONSTATAMOS\b/,
    /(?:^|\s)([A-ZÀ-Ú]{2,}(?:\s+[A-ZÀ-Ú]{2,}){1,6})\s*,?\s+COMUNICAMOS\b/,
    /(?:^|\s)([A-ZÀ-Ú]{2,}(?:\s+[A-ZÀ-Ú]{2,}){1,6})\s*,?\s+IDENTIFICAMOS\b/
  ];
  for (let c = 0; c < compactPatterns.length; c++) {
    const compactMatch = compact.match(compactPatterns[c]);
    if (compactMatch) {
      const candidate3 = cleanDriverCandidate_(compactMatch[1]);
      if (candidate3) return candidate3;
    }
  }

  return '';
}

function extractNotificationNumber_(value) {
  const text = normalizeLookup_(value);
  const m = text.match(/(?:^|\s)(\d{1,4})\s*(?:O|º|°)?\s+NOTIFICACAO\s+DE\s+VELOCIDADE(?:\s+20\d{2})?/);
  return m ? String(Number(m[1])) : '';
}

function cleanDriverCandidate_(value) {
  let v = sanitize_(value || '');
  v = v.replace(/\b(CONSTATAMOS|POR MEIO|SISTEMA|RASTREAMENTO|FROTA|VEICULO|PLACA|CONFORME|REGISTROS|ABAIXO).*$/g, '').trim();
  v = v.replace(/\s+/g, ' ').trim();

  if (isInvalidDriverName_(v)) return '';
  if (v.length < 8 || v.length > 80) return '';

  const words = v.split(' ').filter(Boolean);
  if (words.length < 2 || words.length > 7) return '';

  // Evita capturar frases comuns como se fossem nomes.
  const banned = ['BOA', 'TARDE', 'BOM', 'DIA', 'CASCAAVEL', 'CASCAVEL', 'SOLICITAMOS', 'RESSALTAMOS', 'DIANTE'];
  for (let i = 0; i < words.length; i++) {
    if (banned.indexOf(words[i]) >= 0) return '';
  }

  return v;
}

function normalizeDateKey_(value) {
  const s = String(value || '').trim();
  let m = s.match(/^(\d{2})[\/\-.](\d{2})[\/\-.](\d{4})$/);
  if (m) return m[3] + '-' + m[2] + '-' + m[1];
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return m[1] + '-' + m[2] + '-' + m[3];
  return '';
}

function speedKey_(value) {
  const n = Number(String(value || '').replace(',', '.').replace(/[^0-9.]/g, ''));
  if (!isFinite(n)) return '';
  return String(Math.round(n));
}

function rowNotificationNumber_(row) {
  const raw = row && (row.notificationNumber || row.notification_number || row.numeroNotificacao || row.numero_notificacao || row.notificacao_numero || row.notificacaoNumero || '');
  const m = String(raw || '').match(/\d{1,4}/);
  return m ? String(Number(m[0])) : '';
}

function collectDriverMapRows_(item) {
  const rows = [];
  ['registros', 'records', 'itens', 'items', 'rows'].forEach(function (key) {
    const arr = Array.isArray(item && item[key]) ? item[key] : [];
    arr.forEach(function (r) { if (r) rows.push(r); });
  });
  return rows;
}

function findDriverByNotificationOrRecord_(extracted, driverMap) {
  const map = Array.isArray(driverMap) ? driverMap : [];
  const extractedNumber = String(extracted && extracted.notificationNumber || '');
  const extractedRecords = Array.isArray(extracted && extracted.registros) ? extracted.registros : [];
  const matchesByGroup = [];

  for (let i = 0; i < map.length; i++) {
    const item = map[i] || {};
    const driver = safeDriverName_(item.driverName || item.driverFolderName || item.motorista || item.condutor || '');
    if (!driver) continue;

    const rows = collectDriverMapRows_(item);
    const itemNotification = rowNotificationNumber_(item);
    const matchedIds = [];
    const matchedRecords = [];
    let score = 0;
    let reason = '';

    if (extractedNumber && itemNotification && extractedNumber === itemNotification) {
      score += 10;
      reason = 'numero_notificacao';
    }

    rows.forEach(function (row) {
      const rowId = row.id || row.uuid || row.rowId || row.row_id || '';
      const rowNotification = rowNotificationNumber_(row);
      if (extractedNumber && rowNotification && extractedNumber === rowNotification) {
        score += 10;
        reason = 'numero_notificacao_registro';
        if (rowId) matchedIds.push(String(rowId));
        matchedRecords.push(row);
        return;
      }

      const rowDate = normalizeDateKey_(row.data || row.data_evento || row.date || row.eventDate || row.event_date || '');
      const rowSpeed = speedKey_(row.velocidade || row.speed || row.maxVelocidade || row.max_speed || '');
      for (let r = 0; r < extractedRecords.length; r++) {
        const rec = extractedRecords[r] || {};
        const recDate = normalizeDateKey_(rec.data || rec.date || '');
        const recSpeed = speedKey_(rec.velocidade || rec.speed || '');
        if (rowDate && recDate && rowDate === recDate && rowSpeed && recSpeed && rowSpeed === recSpeed) {
          score += 6;
          reason = 'data_velocidade';
          if (rowId) matchedIds.push(String(rowId));
          matchedRecords.push(row);
          break;
        }
      }
    });

    if (score > 0) {
      matchesByGroup.push({
        score: score,
        item: item,
        driverName: driver,
        driverFolderName: safeDriverName_(item.driverFolderName || driver) || driver,
        plate: sanitizePlate_(item.plate || item.placa || ''),
        matchedIds: Array.from(new Set(matchedIds)),
        matchedRecords: matchedRecords,
        reason: reason || 'registro_driver_map'
      });
    }
  }

  matchesByGroup.sort(function (a, b) {
    return b.score - a.score || b.matchedIds.length - a.matchedIds.length;
  });

  return matchesByGroup[0] || null;
}


function levenshteinDistance_(a, b) {
  a = normalizeLookup_(a || '');
  b = normalizeLookup_(b || '');
  if (a === b) return 0;
  if (!a) return b.length;
  if (!b) return a.length;

  const prev = [];
  const curr = [];
  for (let j = 0; j <= b.length; j++) prev[j] = j;

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(
        curr[j - 1] + 1,
        prev[j] + 1,
        prev[j - 1] + cost
      );
    }
    for (let j = 0; j <= b.length; j++) prev[j] = curr[j];
  }

  return prev[b.length];
}

function tokenSimilarityScore_(candidate, officialName) {
  const a = normalizeLookup_(candidate || '');
  const b = normalizeLookup_(officialName || '');
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.indexOf(b) >= 0 || b.indexOf(a) >= 0) return 0.96;

  const aTokens = a.split(' ').filter(Boolean);
  const bTokens = b.split(' ').filter(Boolean);
  if (aTokens.length < 2 || bTokens.length < 2) return 0;

  let matched = 0;
  let strong = 0;
  const used = {};

  for (let i = 0; i < aTokens.length; i++) {
    let bestJ = -1;
    let bestScore = 0;
    for (let j = 0; j < bTokens.length; j++) {
      if (used[j]) continue;
      const ta = aTokens[i];
      const tb = bTokens[j];
      let score = 0;
      if (ta === tb) {
        score = 1;
      } else if (ta.length >= 4 && tb.length >= 4) {
        const dist = levenshteinDistance_(ta, tb);
        const maxLen = Math.max(ta.length, tb.length);
        score = 1 - (dist / maxLen);
      }
      if (score > bestScore) {
        bestScore = score;
        bestJ = j;
      }
    }
    if (bestJ >= 0 && bestScore >= 0.72) {
      used[bestJ] = true;
      matched += bestScore;
      if (bestScore >= 0.88) strong++;
    }
  }

  const coverage = matched / Math.max(aTokens.length, bTokens.length);
  const exactFirst = aTokens[0] && bTokens[0] && aTokens[0] === bTokens[0] ? 0.08 : 0;
  const exactLast = aTokens[aTokens.length - 1] && bTokens[bTokens.length - 1] && aTokens[aTokens.length - 1] === bTokens[bTokens.length - 1] ? 0.08 : 0;
  const strongBonus = strong >= Math.min(2, Math.min(aTokens.length, bTokens.length)) ? 0.04 : 0;

  return Math.min(1, coverage + exactFirst + exactLast + strongBonus);
}

function matchKnownDriverName_(candidate, knownDrivers) {
  const cleaned = safeDriverName_(candidate || '');
  if (!cleaned) return '';

  const norm = normalizeLookup_(cleaned);
  let partial = '';
  let best = { score: 0, driver: '' };

  for (let i = 0; i < (knownDrivers || []).length; i++) {
    const item = knownDrivers[i] || {};
    const driver = safeDriverName_(item.driverName || item.driverFolderName || item.nome || item.name || '');
    const itemNorm = normalizeLookup_(item.normalized || driver);
    if (!driver || !itemNorm) continue;

    if (itemNorm === norm) return driver;
    if (!partial && (itemNorm.indexOf(norm) >= 0 || norm.indexOf(itemNorm) >= 0)) partial = driver;

    const score = tokenSimilarityScore_(norm, itemNorm);
    if (score > best.score) best = { score: score, driver: driver };
  }

  // Corrige pequenos erros do OCR no nome antes de criar a pasta.
  // Ex.: "CLEUTON CESAR SOARES DE ALEBERNAZ" -> "CLEUTON CESAR SOARES DE ALBERNAZ".
  if (best.driver && best.score >= 0.78) return best.driver;

  // Não confiar no texto cru do OCR quando ele não bate (nem exato, nem parcial,
  // nem por similaridade) com nenhum colaborador cadastrado. Antes disto, o
  // fallback "|| cleaned" deixava textos garblados (ex.: "VEILUIU UE PIGLA
  // FDJUDJO", lidos de partes erradas do print) virarem nome de pasta. Agora,
  // sem match confiável, devolve vazio e resolveDriverForFile_ segue para os
  // próximos fallbacks (notificação/data/velocidade, depois OCR - CONFERIR).
  return partial;
}


function findDriverMapMatchByDriverAndRecords_(driverName, extracted, driverMap) {
  const target = normalizeLookup_(driverName || '');
  if (!target) return null;
  const extractedRecords = Array.isArray(extracted && extracted.registros) ? extracted.registros : [];
  let best = null;

  for (let i = 0; i < (driverMap || []).length; i++) {
    const item = driverMap[i] || {};
    const itemDriver = safeDriverName_(item.driverName || item.driverFolderName || item.motorista || item.condutor || '');
    const itemNorm = normalizeLookup_(itemDriver);
    if (!itemDriver || !itemNorm) continue;
    if (!(itemNorm === target || itemNorm.indexOf(target) >= 0 || target.indexOf(itemNorm) >= 0)) continue;

    const rows = collectDriverMapRows_(item);
    const matchedIds = [];
    const matchedRecords = [];
    let score = 0;
    for (let j = 0; j < rows.length; j++) {
      const row = rows[j] || {};
      const rowId = row.id || row.uuid || row.rowId || row.row_id || '';
      const rowNotification = rowNotificationNumber_(row);
      if (extracted.notificationNumber && rowNotification && extracted.notificationNumber === rowNotification) {
        score += 10;
        if (rowId) matchedIds.push(String(rowId));
        matchedRecords.push(row);
        continue;
      }
      for (let r = 0; r < extractedRecords.length; r++) {
        const rec = extractedRecords[r] || {};
        const rowDate = normalizeDateKey_(row.data || row.data_evento || row.date || row.eventDate || row.event_date || '');
        const rowSpeed = speedKey_(row.velocidade || row.speed || row.maxVelocidade || row.max_speed || '');
        const recDate = normalizeDateKey_(rec.data || rec.date || '');
        const recSpeed = speedKey_(rec.velocidade || rec.speed || '');
        if (rowDate && recDate && rowDate === recDate && rowSpeed && recSpeed && rowSpeed === recSpeed) {
          score += 6;
          if (rowId) matchedIds.push(String(rowId));
          matchedRecords.push(row);
          break;
        }
      }
    }

    if (!best || score > best.score || (score === best.score && matchedIds.length > best.matchedIds.length)) {
      best = {
        score: score,
        driverName: itemDriver,
        driverFolderName: safeDriverName_(item.driverFolderName || itemDriver) || itemDriver,
        plate: sanitizePlate_(item.plate || item.placa || ''),
        matchedIds: Array.from(new Set(matchedIds)),
        matchedRecords: matchedRecords
      };
    }
  }
  return best;
}

function resolveDriverForFile_(ctx) {
  const extracted = ctx.extracted || {};
  const driverMap = Array.isArray(ctx.driverMap) ? ctx.driverMap : [];
  const knownDrivers = Array.isArray(ctx.knownDrivers) ? ctx.knownDrivers : [];
  const plate = sanitizePlate_(extracted.placa || ctx.fallbackPlate || '');
  const haystack = normalizeLookup_([
    ctx.ocrText || '',
    ctx.originalName || ''
  ].join(' '));

  if (plate) {
    for (let i = 0; i < driverMap.length; i++) {
      const item = driverMap[i] || {};
      if (sanitizePlate_(item.plate || item.placa) === plate && (item.driverName || item.driverFolderName)) {
        const name = safeDriverName_(item.driverName || item.driverFolderName);
        if (name) {
          const plateRows = collectDriverMapRows_(item);
          const plateIds = [];
          const plateMatchedRows = [];
          plateRows.forEach(function (row) {
            const rowId = row.id || row.uuid || row.rowId || row.row_id || '';
            const ok = (extracted.registros || []).some(function (rec) {
              return normalizeDateKey_(rec.data || rec.date) === normalizeDateKey_(row.data || row.data_evento || row.date)
                && speedKey_(rec.velocidade || rec.speed) === speedKey_(row.velocidade || row.speed);
            });
            if (ok) {
              if (rowId) plateIds.push(String(rowId));
              plateMatchedRows.push(row);
            }
          });
          return {
            driverName: name,
            driverFolderName: safeDriverName_(item.driverFolderName || name) || name,
            plate: plate,
            matchedBy: plateIds.length ? 'placa_data_velocidade' : 'placa_relatorio_importado',
            matchedIds: Array.from(new Set(plateIds)),
            matchedRecords: plateMatchedRows
          };
        }
      }
    }
  }

  if (extracted.motorista) {
    const driverOcr = matchKnownDriverName_(extracted.motorista, knownDrivers);
    if (driverOcr) {
      const directDriverMatch = findDriverMapMatchByDriverAndRecords_(driverOcr, extracted, driverMap);
      const recordMatchForOcr = directDriverMatch || findDriverByNotificationOrRecord_(extracted, driverMap);
      return {
        driverName: driverOcr,
        driverFolderName: driverOcr,
        plate: plate || (recordMatchForOcr && recordMatchForOcr.plate) || '',
        matchedBy: recordMatchForOcr ? ('motorista_ocr_' + (recordMatchForOcr.reason || 'driver_record')) : 'motorista_ocr_independente_painel1',
        matchedIds: recordMatchForOcr ? (recordMatchForOcr.matchedIds || []) : [],
        matchedRecords: recordMatchForOcr ? (recordMatchForOcr.matchedRecords || []) : []
      };
    }
  }

  const recordMatch = findDriverByNotificationOrRecord_(extracted, driverMap);
  if (recordMatch) {
    return {
      driverName: recordMatch.driverName,
      driverFolderName: recordMatch.driverFolderName,
      plate: recordMatch.plate || plate,
      matchedBy: recordMatch.reason,
      matchedIds: recordMatch.matchedIds,
      matchedRecords: recordMatch.matchedRecords
    };
  }

  for (let j = 0; j < driverMap.length; j++) {
    const item = driverMap[j] || {};
    const nameLookup = normalizeLookup_(item.driverName || item.driverFolderName || '');
    const driver = safeDriverName_(item.driverName || item.driverFolderName);
    if (driver && nameLookup && haystack.indexOf(nameLookup) >= 0) {
      return { driverName: driver, driverFolderName: safeDriverName_(item.driverFolderName || driver) || driver, plate: sanitizePlate_(item.plate), matchedBy: 'nome_ocr_ou_arquivo' };
    }
  }

  for (let k = 0; k < knownDrivers.length; k++) {
    const item = knownDrivers[k] || {};
    const driver = safeDriverName_(item.driverName || item.driverFolderName || item.nome || item.name || '');
    const nameLookup = normalizeLookup_(item.normalized || driver);
    if (driver && nameLookup && haystack.indexOf(nameLookup) >= 0) {
      return { driverName: driver, driverFolderName: safeDriverName_(item.driverFolderName || driver) || driver, plate: plate, matchedBy: 'nome_base_colaboradores_ocr' };
    }
  }

  const fallbackDriver = safeDriverName_(ctx.fallbackDriverName || ctx.fallbackFolderName || '');
  if (fallbackDriver) {
    return { driverName: fallbackDriver, driverFolderName: fallbackDriver, plate: plate, matchedBy: 'fallback_tela_valido' };
  }

  return { driverName: FROTAS_PASTA_OCR_CONFERIR, driverFolderName: FROTAS_PASTA_OCR_CONFERIR, plate: plate, matchedBy: 'ocr_conferir' };
}

function normalizeDate_(value) {
  const m = String(value || '').match(/^(\d{2})[\/\-.](\d{2})[\/\-.](\d{4})$/);
  if (!m) return '';
  return m[1] + '/' + m[2] + '/' + m[3];
}

function dedupeRegistros_(items) {
  const seen = {};
  const out = [];
  (items || []).forEach((item) => {
    const key = String(item.data || '') + '|' + String(item.velocidade || '');
    if (!seen[key]) {
      seen[key] = true;
      out.push(item);
    }
  });
  return out;
}

/**
 * Ação upload_multa_dossie (Frotas > Multas > Anexos):
 * salva o PDF único (termo assinado + autos de infração) na subpasta do condutor,
 * a mesma usada pelo excesso de velocidade. O título do arquivo vem do painel:
 * "DATA - PLACA - CONDUTOR - AUTO.pdf".
 */
function handleUploadMultaDossie_(data) {
  try {
    const parentFolderId = String(data.parentFolderId || FROTAS_PASTA_MAE_PADRAO_ID).trim();
    const condutor = sanitize_(data.driverName);
    const fileName = String(data.fileName || '').trim();
    if (!safeDriverName_(condutor) || !fileName || !data.base64) {
      return { ok: false, message: 'Informe um driverName válido, fileName e base64.' };
    }

    const parent = DriveApp.getFolderById(parentFolderId);
    // Mesma busca das pastas do excesso de velocidade (ignora acento, caixa e espaços).
    let folder = findExistingFolderByNormalizedName_(parent, condutor);
    let createdFolder = false;
    if (!folder) {
      if (data.createFolderIfMissing === false) {
        return { ok: false, message: 'Pasta do condutor não encontrada: ' + condutor };
      }
      folder = getOrCreateFolder_(parent, condutor); // com trava contra pasta duplicada
      createdFolder = true;
    }

    // Mesmo nome = substitui (o arquivo anterior vai para a lixeira, não é apagado de vez).
    let replaced = false;
    if (data.replaceExisting !== false) {
      const same = folder.getFilesByName(fileName);
      while (same.hasNext()) { same.next().setTrashed(true); replaced = true; }
    }

    const blob = Utilities.newBlob(Utilities.base64Decode(data.base64), data.mimeType || 'application/pdf', fileName);
    const file = folder.createFile(blob);
    return {
      ok: true, fileId: file.getId(), fileUrl: file.getUrl(),
      folderId: folder.getId(), folderName: folder.getName(),
      createdFolder: createdFolder, replaced: replaced
    };
  } catch (err) {
    return { ok: false, message: String(err && err.message || err) };
  }
}

/**
 * Teste manual (não grava nada): selecione esta função no editor e clique em Executar.
 * Troque o nome por um condutor que já tenha pasta.
 */
function testarBuscaPastaCondutor() {
  const pasta = findExistingFolderByNormalizedName_(
    DriveApp.getFolderById(FROTAS_PASTA_MAE_PADRAO_ID),
    sanitize_('JOAO PEDRO CERUTTI CERQUEIRA')
  );
  Logger.log(pasta ? 'ENCONTRADA: ' + pasta.getUrl() : 'NÃO encontrada');
}
