// Frotas — leitura de prints por OCR (imagem, Tesseract e interpretação do texto).
// Extraído de modules/frotas.js em 14/10/2026 (era um único bloco autoexecutável de ~4.100 linhas).
// O código das funções e constantes foi movido sem alteração. Para publicar uma mudança em qualquer
// módulo frotas-*.js deste conjunto, troque o token ?v=20261014-frotas-modular1 em TODOS os imports internos (e os do
// carregador da página): o teste tests/frotas-modulos-versao.test.mjs garante que fiquem iguais.
import { normalizeName, normalizeDriverNameForMatch, isUnknownDriverName, onlyPlate, normalizeTextForOcrMatch } from './frotas-base.js?v=20261014-frotas-modular1';

  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || '').split(',')[1] || '');
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function loadImageFromFile(file) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = (err) => { URL.revokeObjectURL(url); reject(err); };
      img.src = url;
    });
  }

  function canvasToBase64(canvas, quality = 0.96) {
    return String(canvas.toDataURL('image/png', quality) || '').split(',')[1] || '';
  }

  function drawOcrCanvas(img, opts = {}) {
    const scale = opts.scale || 3;
    const crop = opts.crop || null;
    const sx = crop ? Math.max(0, Math.floor(crop.x * img.width)) : 0;
    const sy = crop ? Math.max(0, Math.floor(crop.y * img.height)) : 0;
    const sw = crop ? Math.min(img.width - sx, Math.floor(crop.w * img.width)) : img.width;
    const sh = crop ? Math.min(img.height - sy, Math.floor(crop.h * img.height)) : img.height;
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.floor(sw * scale));
    canvas.height = Math.max(1, Math.floor(sh * scale));
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);

    const mode = opts.mode || 'contrast';
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i], g = data[i + 1], b = data[i + 2];
      let gray = (r * 0.299 + g * 0.587 + b * 0.114);
      if (mode === 'invert') gray = 255 - gray;
      if (mode === 'bw' || mode === 'invert') {
        const threshold = opts.threshold || 135;
        const v = gray >= threshold ? 255 : 0;
        data[i] = v; data[i + 1] = v; data[i + 2] = v;
      } else {
        // Contraste simples: mantém tons, mas separa mais texto claro do fundo escuro.
        const contrast = opts.contrast || 1.65;
        const brightness = opts.brightness || 12;
        const nr = Math.max(0, Math.min(255, (r - 128) * contrast + 128 + brightness));
        const ng = Math.max(0, Math.min(255, (g - 128) * contrast + 128 + brightness));
        const nb = Math.max(0, Math.min(255, (b - 128) * contrast + 128 + brightness));
        data[i] = nr; data[i + 1] = ng; data[i + 2] = nb;
      }
    }
    ctx.putImageData(imageData, 0, 0);
    return canvas;
  }

  function detectWhatsappMessageCrop(img) {
    const sampleCanvas = document.createElement('canvas');
    const maxW = 900;
    const ratio = Math.min(1, maxW / Math.max(1, img.width));
    sampleCanvas.width = Math.max(1, Math.round(img.width * ratio));
    sampleCanvas.height = Math.max(1, Math.round(img.height * ratio));
    const ctx = sampleCanvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, sampleCanvas.width, sampleCanvas.height);
    const imageData = ctx.getImageData(0, 0, sampleCanvas.width, sampleCanvas.height);
    const data = imageData.data;

    // Detecta o balão verde do WhatsApp. Isso é essencial quando o print vem dentro
    // da prévia do Drive: a mensagem fica pequena no centro e o OCR lê o fundo inteiro.
    let minX = sampleCanvas.width, minY = sampleCanvas.height, maxX = 0, maxY = 0, count = 0;
    for (let y = 0; y < sampleCanvas.height; y += 2) {
      for (let x = 0; x < sampleCanvas.width; x += 2) {
        const i = (y * sampleCanvas.width + x) * 4;
        const r = data[i], g = data[i + 1], b = data[i + 2];
        const isGreenBubble = g > 55 && g > r * 1.12 && g > b * 1.08 && r < 120 && b < 120;
        if (isGreenBubble) {
          if (x < minX) minX = x;
          if (y < minY) minY = y;
          if (x > maxX) maxX = x;
          if (y > maxY) maxY = y;
          count++;
        }
      }
    }

    const area = sampleCanvas.width * sampleCanvas.height;
    const boxW = maxX - minX;
    const boxH = maxY - minY;
    if (count < area * 0.006 || boxW < sampleCanvas.width * 0.18 || boxH < sampleCanvas.height * 0.06) {
      return null;
    }

    const padX = Math.round(boxW * 0.04);
    const padY = Math.round(boxH * 0.08);
    minX = Math.max(0, minX - padX);
    minY = Math.max(0, minY - padY);
    maxX = Math.min(sampleCanvas.width - 1, maxX + padX);
    maxY = Math.min(sampleCanvas.height - 1, maxY + padY);

    return {
      x: minX / sampleCanvas.width,
      y: minY / sampleCanvas.height,
      w: Math.max(0.05, (maxX - minX) / sampleCanvas.width),
      h: Math.max(0.05, (maxY - minY) / sampleCanvas.height)
    };
  }

  function loadScriptOnce(src, globalCheck) {
    return new Promise((resolve, reject) => {
      try {
        if (globalCheck && globalCheck()) return resolve(true);
        const existing = Array.from(document.scripts || []).find((script) => script.src === src);
        if (existing) {
          existing.addEventListener('load', () => resolve(true), { once: true });
          existing.addEventListener('error', reject, { once: true });
          return;
        }
        const script = document.createElement('script');
        script.src = src;
        script.async = true;
        script.onload = () => resolve(true);
        script.onerror = () => reject(new Error('Falha ao carregar biblioteca OCR no navegador.'));
        document.head.appendChild(script);
      } catch (err) {
        reject(err);
      }
    });
  }

  function extractUsefulOcrText(text) {
    return String(text || '')
      .replace(/\r/g, '\n')
      .split('\n')
      .map((line) => line.replace(/\s+/g, ' ').trim())
      .filter(Boolean)
      .join('\n')
      .slice(0, 5000);
  }

  function scoreBrowserOcrText(text) {
    const normalized = normalizeDriverNameForMatch(text);
    let score = 0;
    if (/CONSTATAMOS|COMUNICAMOS|IDENTIFICAMOS/.test(normalized)) score += 60;
    if (/NOTIFICACAO|VELOCIDADE|PLACA|KM H|KMH|KM/.test(normalized)) score += 20;
    if (/\d{1,2}[\/.-]\d{1,2}(?:[\/.-]\d{2,4})?/.test(text)) score += 20;
    if (/\b(12[1-9]|1[3-9]\d|2\d{2})\s*(KM\/H|KMH|KM|K\/H)?\b/i.test(text)) score += 20;
    const maybeName = extractDriverNameFromOcrText(text);
    if (maybeName) score += 100;
    return score;
  }

  async function runBrowserOcrWithTesseract(file, variants = []) {
    try {
      await loadScriptOnce('https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js', () => Boolean(window.Tesseract?.recognize));
      if (!window.Tesseract?.recognize) return { text: '', source: '' };

      const candidates = [];
      const addBase64 = (name, base64) => {
        if (!base64) return;
        candidates.push({ name, dataUrl: `data:image/png;base64,${base64}` });
      };
      (variants || []).forEach((variant) => addBase64(variant.name || 'variante', variant.base64 || variant.ocrBase64 || ''));
      candidates.push({ name: 'original-browser', dataUrl: URL.createObjectURL(file), revoke: true });

      let best = { text: '', source: '', score: -1 };
      for (const candidate of candidates.slice(0, 4)) {
        try {
          const result = await window.Tesseract.recognize(candidate.dataUrl, 'por+eng', {
            logger: () => {}
          });
          const text = extractUsefulOcrText(result?.data?.text || '');
          const score = scoreBrowserOcrText(text);
          if (score > best.score || (!best.text && text)) best = { text, source: candidate.name, score };
          if (candidate.revoke) URL.revokeObjectURL(candidate.dataUrl);
          if (score >= 120) break;
        } catch (err) {
          if (candidate.revoke) URL.revokeObjectURL(candidate.dataUrl);
        }
      }
      return best.score >= 0 ? best : { text: '', source: '' };
    } catch (err) {
      console.warn('[FROTAS] OCR do navegador indisponível:', err);
      return { text: '', source: '' };
    }
  }

  async function fileToOcrBase64Variants(file) {
    try {
      const img = await loadImageFromFile(file);
      const variants = [];
      const push = (name, canvas) => {
        const base64 = canvasToBase64(canvas);
        if (base64) variants.push({ name, mimeType: 'image/png', base64 });
      };

      const bubbleCrop = detectWhatsappMessageCrop(img);
      if (bubbleCrop) {
        push('ocr-whatsapp-balao-contrast', drawOcrCanvas(img, { scale: 4, mode: 'contrast', contrast: 2.1, brightness: 24, crop: bubbleCrop }));
        push('ocr-whatsapp-balao-bw', drawOcrCanvas(img, { scale: 4, mode: 'bw', threshold: 118, crop: bubbleCrop }));
        push('ocr-whatsapp-balao-invert', drawOcrCanvas(img, { scale: 4, mode: 'invert', threshold: 108, crop: bubbleCrop }));
      }

      push('ocr-zoom-contrast', drawOcrCanvas(img, { scale: 3, mode: 'contrast' }));
      push('ocr-zoom-bw', drawOcrCanvas(img, { scale: 3, mode: 'bw', threshold: 132 }));
      push('ocr-zoom-invert', drawOcrCanvas(img, { scale: 3, mode: 'invert', threshold: 120 }));

      // Recorte central: ajuda quando o print vem dentro da visualização do Drive ou com muita área inútil.
      push('ocr-crop-center-contrast', drawOcrCanvas(img, { scale: 3, mode: 'contrast', crop: { x: 0.10, y: 0.08, w: 0.80, h: 0.82 } }));
      push('ocr-crop-center-bw', drawOcrCanvas(img, { scale: 3, mode: 'bw', threshold: 132, crop: { x: 0.10, y: 0.08, w: 0.80, h: 0.82 } }));

      return variants.slice(0, 8);
    } catch (err) {
      console.warn('[FROTAS] Não foi possível preparar imagem para OCR:', err);
      return [];
    }
  }

  function getOcrTextFromFileResult(file) {
    const out = [];
    const seen = new Set();
    const preferredKeys = /^(ocrText|ocr_text|text|texto|rawText|raw_text|extractedText|extracted_text|messageText|mensagem|content|body|description)$/i;

    const walk = (value, depth = 0, key = '') => {
      if (value == null || depth > 4) return;
      if (typeof value === 'string') {
        const text = value.trim();
        if (text && (preferredKeys.test(key) || /CONSTATAMOS|VELOCIDADE|KM\/?H|PLACA|MOTORISTA|CONDUTOR/i.test(text))) out.push(text);
        return;
      }
      if (typeof value !== 'object') return;
      if (seen.has(value)) return;
      seen.add(value);
      if (Array.isArray(value)) {
        value.forEach((item) => walk(item, depth + 1, key));
        return;
      }
      Object.entries(value).forEach(([k, v]) => walk(v, depth + 1, k));
    };

    walk(file);
    return out.filter(Boolean).join('\n');
  }

  function isNotificationTitleLike(value) {
    const text = normalizeDriverNameForMatch(value)
      .replace(/\b(PNG|JPG|JPEG|WEBP)\b/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!text) return false;
    return /NOTIFICACAO\s+DE\s+VELOCIDADE/.test(text)
      || /MOTORISTA\s+NAO\s+IDENTIFICADO/.test(text)
      || /^\d+\s*(O|º|°)?\s*NOTIFICACAO/.test(text)
      || /\bNOTIFICACAO\b/.test(text)
      || /\bVELOCIDADE\b/.test(text);
  }

  function cleanPossibleDriverName(value) {
    if (isNotificationTitleLike(value)) return '';
    let name = normalizeName(value)
      .replace(/\.[A-Z0-9]{2,5}$/g, ' ')
      .replace(/\b(BOM DIA|BOA TARDE|BOA NOITE|ENCAMINHADA|LEIA MAIS|LER MAIS|ARQUIVO|PASTA)\b/g, ' ')
      .replace(/\b(CONSTATAMOS|COMUNICAMOS|IDENTIFICAMOS|PREZADO|PREZADA|COLABORADOR|MOTORISTA|CONDUTOR)\b.*$/g, '')
      .replace(/[^A-ZÀ-Ú' .-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (isUnknownDriverName(name) || isNotificationTitleLike(name)) return '';
    const parts = name.split(' ').filter(Boolean);
    if (parts.length < 2) return '';
    if (name.length < 6 || name.length > 80) return '';
    return name;
  }

  function extractDriverNameFromOcrText(text) {
    const raw = String(text || '').replace(/\r/g, '\n');
    if (!raw.trim()) return '';

    const directPatterns = [
      /(?:^|\n|\s)([A-ZÀ-Ú][A-ZÀ-Ú' .-]{5,80}?)\s*,\s*(?:CONSTATAMOS|COMUNICAMOS|IDENTIFICAMOS|INFORMAMOS)\b/i,
      /(?:^|\n)\s*(?:PREZADO|PREZADA|COLABORADOR|MOTORISTA|CONDUTOR)\s*[:,-]?\s*([A-ZÀ-Ú][A-ZÀ-Ú' .-]{5,80}?)\s*(?:,|\n)/i,
      /(?:NOME|CONDUTOR|MOTORISTA)\s*[:,-]\s*([A-ZÀ-Ú][A-ZÀ-Ú' .-]{5,80}?)(?:\n|,|\s{2,}|$)/i
    ];
    for (const pattern of directPatterns) {
      const match = raw.match(pattern);
      const cleaned = cleanPossibleDriverName(match?.[1] || '');
      if (cleaned) return cleaned;
    }

    const normalizedLines = raw
      .split(/\n+/)
      .map((line) => line.replace(/\b\d{1,2}:\d{2}\b/g, ' ').replace(/[✓✔]/g, ' '))
      .map((line) => cleanPossibleDriverName(line))
      .filter(Boolean);

    const idx = raw.toUpperCase().search(/CONSTATAMOS|COMUNICAMOS|IDENTIFICAMOS|INFORMAMOS/);
    if (idx >= 0) {
      const before = raw.slice(Math.max(0, idx - 160), idx)
        .split(/\n+/)
        .map((line) => cleanPossibleDriverName(line))
        .filter(Boolean);
      if (before.length) return before[before.length - 1];
    }
    return normalizedLines[0] || '';
  }

  function getPossibleFileDriverName(file) {
    // Campos realmente ligados ao motorista. Não usar folderName/fileName como motorista,
    // porque o Apps Script pode devolver "43ª NOTIFICAÇÃO..." como pasta temporária.
    const direct = cleanPossibleDriverName([
      file?.driverName,
      file?.driver_name,
      file?.motorista,
      file?.nomeMotorista,
      file?.nome_motorista,
      file?.condutor,
      file?.condutor_nome,
      file?.driverOcrName,
      file?.driver_ocr_name,
      file?.ocrDriverName,
      file?.ocr_driver_name
    ].find(Boolean) || '');
    if (direct) return direct;

    const fromOcr = extractDriverNameFromOcrText(getOcrTextFromFileResult(file));
    if (fromOcr) return fromOcr;

    const folderCandidate = [file?.driverFolderName, file?.driver_folder_name, file?.folderName, file?.folder_name]
      .find((value) => value && !isNotificationTitleLike(value));
    const fromFolder = cleanPossibleDriverName(folderCandidate || '');
    if (fromFolder) return fromFolder;

    const fromFileName = String(file?.fileName || file?.name || '')
      .replace(/\.[a-z0-9]{2,5}$/i, '')
      .replace(/\d+\s*[º°]?\s*NOTIFICA(?:C|Ç)[AÃ]O\s+DE\s+VELOCIDADE\s+\d{4}/i, '')
      .replace(/MOTORISTA\s+NAO\s+IDENTIFICADO|MOTORISTA\s+NÃO\s+IDENTIFICADO/i, '');
    return cleanPossibleDriverName(fromFileName);
  }

  function normalizeSavedPrintFileResult(file) {
    const driverName = getPossibleFileDriverName(file);
    const notificationNumber = getFileNotificationNumber(file);
    const currentFolder = file?.driverFolderName || file?.driver_folder_name || file?.folderName || file?.folder_name || '';
    const folderIsInvalid = isUnknownDriverName(currentFolder) || isNotificationTitleLike(currentFolder);
    if (!driverName) {
      return folderIsInvalid
        ? { ...file, notificationNumber, driverFolderName: 'OCR - CONFERIR', folderName: 'OCR - CONFERIR' }
        : { ...file, notificationNumber };
    }
    return {
      ...file,
      notificationNumber,
      driverName,
      driverFolderName: folderIsInvalid ? driverName : (file?.driverFolderName || file?.folderName || driverName),
      folderName: folderIsInvalid ? driverName : (file?.folderName || file?.driverFolderName || driverName)
    };
  }

  function extractOcrRecordsFromText(text) {
    const normalized = normalizeTextForOcrMatch(text);
    if (!normalized) return [];

    const records = [];
    const currentYear = String(new Date().getFullYear());
    const pattern = /(\d{1,2}[\/.-]\d{1,2}(?:[\/.-]\d{2,4})?)[\s\S]{0,90}?(\d{2,3})\s*(?:KM\/?H|KMH|KM|K\/H|KPH)/g;
    let match;
    while ((match = pattern.exec(normalized))) {
      let date = String(match[1] || '').replace(/[.-]/g, '/');
      const parts = date.split('/');
      if (parts.length === 2) date = `${parts[0].padStart(2, '0')}/${parts[1].padStart(2, '0')}/${currentYear}`;
      if (parts.length === 3) {
        const year = parts[2].length === 2 ? `20${parts[2]}` : parts[2];
        date = `${parts[0].padStart(2, '0')}/${parts[1].padStart(2, '0')}/${year}`;
      }
      records.push({ data: date, velocidade: Number(match[2]) });
    }
    return records;
  }

  function getFileNotificationNumber(file) {
    const direct = file?.notificationNumber || file?.notification_number || file?.originalNotificationNumber || file?.original_notification_number || file?.numeroNotificacao || file?.numero_notificacao || '';
    const directMatch = String(direct || '').match(/\d{1,4}/);
    if (directMatch) return String(Number(directMatch[0]));
    const haystack = [file?.originalFileName, file?.fileName, file?.name, getOcrTextFromFileResult(file)].filter(Boolean).join(' ');
    const normalized = normalizeTextForOcrMatch(haystack);
    const m = normalized.match(/(?:^|\s)(\d{1,4})\s*(?:O|º|°)?\s+NOTIFICACAO\s+DE\s+VELOCIDADE/);
    return m ? String(Number(m[1])) : '';
  }

  function rowNotificationNumber(row) {
    const direct = row?.numero_notificacao || row?.numeroNotificacao || row?.notification_number || row?.notificationNumber || row?.notificacao_numero || '';
    const m = String(direct || '').match(/\d{1,4}/);
    return m ? String(Number(m[0])) : '';
  }

  function getFileMatchedIds(file) {
    const candidates = [
      file?.matchedIds,
      file?.matched_ids,
      file?.recordIds,
      file?.record_ids,
      file?.notificacaoIds,
      file?.notificationIds,
      file?.archivedIds
    ];
    const out = [];
    candidates.forEach((value) => {
      if (Array.isArray(value)) out.push(...value);
      else if (value) out.push(...String(value).split(/[;,\s]+/));
    });
    return out.map((id) => String(id || '').trim()).filter(Boolean);
  }

  function getPossibleFilePlate(file) {
    const text = normalizeTextForOcrMatch(getOcrTextFromFileResult(file));
    const direct = onlyPlate(file?.plate || file?.placa || file?.vehiclePlate || file?.vehicle_plate || '');
    if (direct) return direct;
    const match = text.match(/\b([A-Z]{3}\s*[0-9][A-Z0-9]\s*[0-9]{2})\b/);
    return match ? onlyPlate(match[1]) : '';
  }

export { fileToBase64, runBrowserOcrWithTesseract, fileToOcrBase64Variants, getOcrTextFromFileResult, isNotificationTitleLike, cleanPossibleDriverName, getPossibleFileDriverName, normalizeSavedPrintFileResult, extractOcrRecordsFromText, getFileNotificationNumber, rowNotificationNumber, getFileMatchedIds, getPossibleFilePlate };
