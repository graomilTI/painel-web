/* assets/js/modules/frotas.js */
import { buildOcrReconciliationPlan, normalizeOcrResponse } from './frotas-print-ocr-core.js?v=20260820a';

(function () {
  'use strict';

  const MODULE_NAME = 'FROTAS';
  const PASTA_MAE_DRIVE_ID = '1q5Ba5qqNJEBUZYA8GNRZmXZZsJ8U0YIr';
  const GENERATED_GROUPS_KEY = 'FROTAS_EXCESSO_VELOCIDADE_GRUPOS_GERADOS';
  const DEFAULT_GAS_URL = 'https://script.google.com/macros/s/AKfycbzDlhiUGilfA1afrunX3Jtc8LAG4DqMO9v0AJKveUxjUaccfJM_ynnKGRghp_K5AfjK/exec';
  const BFLEET_EXCESSO_FUNCTION = window.FROTAS_CONFIG?.BFLEET_EXCESSO_FUNCTION || 'sync-bfleet-excesso-velocidade';
  const BFLEET_FORA_HORARIO_FUNCTION = window.FROTAS_CONFIG?.BFLEET_FORA_HORARIO_FUNCTION || 'sync-bfleet-fora-horario';
  const BFLEET_FORA_HORARIO_REPORT_ID = '85075';
  const FORA_HORARIO_DOSSIE_FUNCTION = window.FROTAS_CONFIG?.FORA_HORARIO_DOSSIE_FUNCTION || 'frotas-fora-horario-dossie';
  const FORA_HORARIO_ROTA_FUNCTION = window.FROTAS_CONFIG?.FORA_HORARIO_ROTA_FUNCTION || 'frotas-fora-horario-rota';
  const FORA_HORARIO_LISTA_COLUNAS = 'id,data_evento,placa,motorista,coordenacao,supervisao,km_00_05,valor_km,valor_caixa,status_calculo,status_notificacao,status_caixa,tem_rota_caixa,sem_ocorrencia,dossie_id,veredito,confianca,criterio,fonte_expediente,inicio_expediente,fim_expediente,janela_inicio,janela_fim,km_dia,km_fora,min_fora,km_noturno,km_apos_chegada,viagens_dia,viagens_fora,chegada_casa,retorno_previsto,atraso_retorno_min,motivos,resumo_dia,condutor_escalado,caronas,calculado_em,qtd_excessos,vel_max,excessos_fora,km_indevido,viagens_indevidas,veredito_uso,uso_sem_base';
  const FORA_HORARIO_DOSSIE_COLUNAS = 'id,data_evento,placa,motorista,coordenacao,supervisao,veredito,confianca,criterio,fonte_expediente,inicio_expediente,fim_expediente,janela_inicio,janela_fim,km_dia,km_fora,min_fora,km_noturno,km_apos_chegada,viagens_dia,viagens_fora,chegada_casa,retorno_previsto,atraso_retorno_min,motivos,resumo_dia,condutor_escalado,caronas,calculado_em';

  const ICO_REFRESH = `<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="pointer-events:none"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>`;
  const ICO_IMPORT = `<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="pointer-events:none"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`;
  const ICO_COPY = `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="pointer-events:none"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;
  const ICO_EDIT = `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="pointer-events:none"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`;
  const ICO_SEARCH = `<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="pointer-events:none"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`;
  const ICO_PAPERCLIP = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="pointer-events:none"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>`;
  const ICO_CLOSE = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="pointer-events:none"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;

  const state = {
    records: [{ data: '', velocidade: '' }],
    uploadedFiles: [],
    savedPrints: [],
    lastMessage: '',
    gasUrl: window.FROTAS_CONFIG?.EXCESSO_VELOCIDADE_WEBAPP_URL || DEFAULT_GAS_URL,
    selectedImportedGroupKey: '',
    generatedImportedGroupKeys: new Set(JSON.parse(localStorage.getItem(GENERATED_GROUPS_KEY) || '[]')),
    colaboradores: [],
    colaboradoresLoaded: false,
    importedExcessos: [],
    importedExcessosLoaded: false,
    activeImportedDateFilter: null,
    importedSearchTerm: '',
    importedStatusFilter: 'ALL',
    notifTab: 'fora_horario',
    foraHorario: [],
    foraHorarioLoaded: false,
    foraHorarioSearchTerm: '',
    foraHorarioFiltro: 'ALERTAS',
    foraHorarioDossieDisponivel: true,
    foraHorarioRecalculando: false,
    foraHorarioDossieAberto: null,
    foraHorarioDossieChave: '',
    foraHorarioPedido: 0,
    foraHorarioSync: []
  };

  let currentRenderOpts = {};

  function resolveSupabase(opts = {}) {
    const candidates = [
      opts?.supabase,
      window.supabase,
      window.supabaseClient,
      window.SUPABASE_CLIENT,
      window.__SUPABASE_CLIENT__,
      window.APP_SUPABASE,
      window.App?.supabase,
      window.ADM?.supabase,
      window.PAINEL?.supabase,
      window.auth?.supabase,
      window.AUTH?.supabase
    ];
    return candidates.find((client) => client && typeof client.from === 'function') || null;
  }


  function panelUrl(target = '') {
    const normalized = String(target || '').replace(/^\/+/, '').replace(/\.html$/i, '');
    const host = String(window.location.hostname || '').toLowerCase();
    if (host === 'grao1000.com.br' || host === 'www.grao1000.com.br') {
      return normalized ? `/painel/${normalized}`.replace(/([^:]\/)\/+/g, '$1') : '/painel';
    }
    if (String(window.location.pathname || '').includes('/painel')) {
      return normalized ? `/painel/${normalized}`.replace(/([^:]\/)\/+/g, '$1') : '/painel';
    }
    return normalized ? `./${normalized}` : './';
  }

  function todayBRShort() {
    return new Date().toLocaleDateString('pt-BR');
  }

  function todayBRLong() {
    return new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
  }

  function normalizeName(value) {
    return String(value || '').trim().replace(/\s+/g, ' ').toUpperCase();
  }

  function normalizeDriverNameForMatch(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toUpperCase()
      .replace(/[^A-Z\s'.-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function isUnknownDriverName(value) {
    const name = normalizeDriverNameForMatch(value);
    if (!name) return true;
    return [
      'MOTORISTA NAO IDENTIFICADO',
      'MOTORISTA NÃO IDENTIFICADO',
      'NAO IDENTIFICADO',
      'NÃO IDENTIFICADO',
      'SEM MOTORISTA',
      'INDEFINIDO',
      'OCR - CONFERIR',
      'OCR CONFERIR'
    ].some((generic) => normalizeDriverNameForMatch(generic) === name);
  }

  function sanitizeFolderName(value) {
    return normalizeName(value).replace(/[\\/:*?"<>|]/g, '-').slice(0, 120);
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function onlyPlate(value) {
    return String(value || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 7);
  }

  function formatDateBR(value) {
    if (!value) return '';
    const raw = String(value).trim();
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(raw)) return raw;
    if (/^\d{2}[-.]\d{2}[-.]\d{4}$/.test(raw)) return raw.replaceAll('-', '/').replaceAll('.', '/');
    const parts = raw.split('-');
    if (parts.length === 3 && parts[0].length === 4) {
      const [yyyy, mm, dd] = parts;
      return `${dd}/${mm}/${yyyy}`;
    }
    return raw;
  }

  function brDateToFilePrefix(value) {
    const br = formatDateBR(value || todayBRShort());
    const m = br.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!m) return br.replace(/\W+/g, '-');
    return `${m[1]}-${m[2]}-${m[3]}`;
  }

  function parseSpeed(value) {
    const n = Number(String(value || '').replace(',', '.'));
    if (!Number.isFinite(n)) return '';
    return Math.round(n);
  }


  function dedupeHighestSpeedByDate(records) {
    const byDate = new Map();
    (Array.isArray(records) ? records : []).forEach((record) => {
      const inputDate = record?.data || record?.date || record?.data_evento || '';
      const dateKey = normalizeDateForMatch(inputDate);
      const speed = parseSpeed(record?.velocidade || record?.speed);
      if (!dateKey || !speed) return;

      const current = byDate.get(dateKey);
      if (!current || speed > current.velocidade) {
        byDate.set(dateKey, {
          ...record,
          data: record?.data || record?.date || formatDateBR(inputDate),
          velocidade: speed
        });
      }
    });

    return Array.from(byDate.values()).sort((a, b) => normalizeDateForMatch(a.data || a.data_evento).localeCompare(normalizeDateForMatch(b.data || b.data_evento)));
  }

  function cloneFileWithName(file, name) {
    try {
      return new File([file], name, { type: file.type || 'image/png', lastModified: file.lastModified || Date.now() });
    } catch (_) {
      file.__displayName = name;
      return file;
    }
  }


  function clipboardImageFilesFromEvent(ev) {
    const out = [];
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');

    Array.from(ev?.clipboardData?.items || []).forEach((item, index) => {
      if (!String(item.type || '').startsWith('image/')) return;
      const blob = item.getAsFile && item.getAsFile();
      if (!blob) return;
      const ext = (String(blob.type || 'image/png').split('/')[1] || 'png').replace('jpeg', 'jpg');
      const name = blob.name && !/^image\.(png|jpg|jpeg|webp)$/i.test(blob.name)
        ? blob.name
        : `print-colado-${stamp}-${index + 1}.${ext}`;
      out.push(cloneFileWithName(blob, name));
    });

    if (!out.length) {
      Array.from(ev?.clipboardData?.files || []).forEach((file, index) => {
        if (!String(file.type || '').startsWith('image/')) return;
        const ext = (String(file.type || 'image/png').split('/')[1] || 'png').replace('jpeg', 'jpg');
        const name = file.name && !/^image\.(png|jpg|jpeg|webp)$/i.test(file.name)
          ? file.name
          : `print-colado-${stamp}-${index + 1}.${ext}`;
        out.push(cloneFileWithName(file, name));
      });
    }

    return out;
  }

  function addUploadedFiles(root, files, source = 'selecionado') {
    const incoming = Array.from(files || []).filter((file) => String(file.type || '').startsWith('image/'));
    if (!incoming.length) {
      toast('Nenhuma imagem encontrada. Cole ou selecione prints em formato de imagem.', 'error');
      return;
    }

    const prepared = incoming.map((file, index) => {
      const hasUsefulName = file.name && !/^image\.(png|jpg|jpeg|webp)$/i.test(file.name);
      const name = hasUsefulName ? file.name : `print-colado-${new Date().toISOString().replace(/[:.]/g, '-')}-${index + 1}.png`;
      const next = hasUsefulName ? file : cloneFileWithName(file, name);
      next.__source = source;
      return next;
    });

    const seen = new Set(state.uploadedFiles.map((file) => `${file.name || file.__displayName}|${file.size}|${file.lastModified || ''}`));
    prepared.forEach((file) => {
      const key = `${file.name || file.__displayName}|${file.size}|${file.lastModified || ''}`;
      if (!seen.has(key)) {
        seen.add(key);
        state.uploadedFiles.push(file);
      }
    });

    renderUploadLists(root);
    toast(`${prepared.length} print(s) adicionados para envio.`);
  }

  function rememberGeneratedGroup(key) {
    if (!key) return;
    state.generatedImportedGroupKeys.add(key);
    localStorage.setItem(GENERATED_GROUPS_KEY, JSON.stringify(Array.from(state.generatedImportedGroupKeys)));
  }

  function getCurrentUserName() {
    return window.AUTH?.user?.nome || window.currentUser?.nome || window.APP_USER?.nome || '';
  }

  function getCurrentUserId() {
    return window.AUTH?.user?.id || window.currentUser?.id || window.APP_USER?.id || null;
  }

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

  // As janelas (modais) são position: fixed. Se algum ancestral tiver transform/filter/backdrop-filter, o fixed passa a
  // valer em relação a ele e não à tela. O .card sobe com translateY no :hover (e o mouse está sobre ele ao clicar em
  // "Ver detalhes"): com a lista longa, a janela abria no meio do card, fora da tela, e era preciso rolar para achá-la.
  // Marca os ancestrais para o CSS (.fh-sem-transform) neutralizar isso; reaplicada a cada abertura de janela.
  function fhLiberarAncestrais(root) {
    for (let el = root?.parentElement; el && el !== document.documentElement; el = el.parentElement) {
      if (el.classList.contains('fh-sem-transform')) continue;
      const cs = getComputedStyle(el);
      const cartao = /(^|\s)(card|base-card|mini-card|hero-card|panel-card|section-card)(\s|$)/.test(el.getAttribute('class') || '');
      const cria = (cs.transform && cs.transform !== 'none') || (cs.filter && cs.filter !== 'none')
        || (cs.backdropFilter && cs.backdropFilter !== 'none') || (cs.perspective && cs.perspective !== 'none')
        || /paint|layout/.test(cs.contain || '') || /transform|filter|perspective/.test(cs.willChange || '');
      if (cartao || cria) el.classList.add('fh-sem-transform');
    }
  }

  // Janela aberta sempre começa no topo (a rolagem interna da abertura anterior não pode esconder o início).
  function fhEnquadrarJanela(modal) {
    const caixa = modal?.querySelector('.speed-modal');
    if (caixa) caixa.scrollTop = 0;
  }

  function getStyles() {
    return `
      <style id="frotas-module-style">
        html .fh-sem-transform.fh-sem-transform,html .fh-sem-transform.fh-sem-transform:hover{transform:none !important;filter:none !important;backdrop-filter:none !important;-webkit-backdrop-filter:none !important;perspective:none !important;contain:none !important;will-change:auto !important}
        .frotas-shell{width:100%;color:#e2e2f0}.frotas-header{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;margin-bottom:18px}.frotas-kicker{display:inline-flex;align-items:center;gap:8px;color:#86efac;font-size:12px;font-weight:900;letter-spacing:.14em;text-transform:uppercase;margin-bottom:8px}.frotas-title{margin:0;font-size:clamp(22px,2.2vw,32px);line-height:1.1;color:#f8fafc;letter-spacing:-.04em}.frotas-subtitle{max-width:860px;margin:10px 0 0;color:#6b7280;font-size:14px;line-height:1.55}.frotas-card{background:radial-gradient(circle at top left,rgba(34,197,94,.13),transparent 34%),linear-gradient(180deg,rgba(15,23,42,.98),rgba(2,6,23,.98));border:1px solid rgba(148,163,184,.16);border-radius:24px;box-shadow:0 20px 60px rgba(0,0,0,.28);overflow:hidden}.notif-subtabs{display:flex;gap:8px;flex-wrap:wrap;padding:12px 14px 0}.notif-subtab{appearance:none;border:1px solid rgba(148,163,184,.14);background:transparent;color:#9ca3af;border-radius:12px 12px 0 0;padding:9px 14px;font-weight:900;font-size:12px;cursor:pointer;transition:.16s ease;border-bottom:2px solid transparent}.notif-subtab.active,.notif-subtab:hover{color:#bbf7d0;border-color:rgba(34,197,94,.35);border-bottom-color:#22c55e;background:rgba(34,197,94,.08)}.frotas-body{padding:18px}.speed-grid{display:grid;grid-template-columns:minmax(300px,450px) minmax(320px,1fr);gap:18px;align-items:start}.speed-panel{background:rgba(15,23,42,.72);border:1px solid rgba(148,163,184,.14);border-radius:22px;padding:18px}.speed-panel h3{margin:0 0 14px;color:#f8fafc;font-size:16px;letter-spacing:-.02em}.speed-field{display:flex;flex-direction:column;gap:7px;margin-bottom:14px}.speed-field label{color:#cbd5e1;font-size:12px;font-weight:900;text-transform:uppercase;letter-spacing:.08em}.speed-input,.speed-select,.speed-textarea{width:100%;border:1px solid rgba(148,163,184,.18);background:#0d0d18;color:#e2e2f0;border-radius:14px;padding:12px 13px;outline:none;font-size:14px;transition:.16s ease;color-scheme:dark}.speed-select option{background:#0d0d18;color:#e2e2f0}.speed-input:focus,.speed-select:focus,.speed-textarea:focus{border-color:rgba(34,197,94,.68);box-shadow:0 0 0 4px rgba(34,197,94,.10)}.speed-row{display:grid;grid-template-columns:1fr 130px 42px;gap:10px;align-items:end;margin-bottom:10px}.speed-row .speed-field{margin-bottom:0}.speed-btn{border:0;border-radius:14px;padding:12px 14px;font-weight:950;cursor:pointer;transition:.18s ease;display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:44px}.speed-btn-primary{width:100%;background:linear-gradient(135deg,#16a34a,#22c55e);color:#052e16;box-shadow:0 14px 34px rgba(34,197,94,.22)}.speed-btn-primary:hover{transform:translateY(-1px);filter:brightness(1.05)}.speed-btn-primary:disabled{opacity:.55;cursor:not-allowed;transform:none}.speed-btn-soft{background:rgba(34,197,94,.12);color:#86efac;border:1px solid rgba(34,197,94,.24)}.speed-btn-danger{background:rgba(239,68,68,.10);color:#fca5a5;border:1px solid rgba(239,68,68,.20);padding:0;min-width:42px}.speed-actions{display:grid;gap:10px;margin-top:14px}.speed-message{min-height:520px;resize:vertical;line-height:1.55;white-space:pre-wrap}.speed-hint{margin:10px 0 0;color:#6b7280;font-size:12px;line-height:1.45}.speed-hint code{color:#bbf7d0}.speed-colab-status{margin-top:-6px;color:#86efac;font-size:11px;font-weight:800;line-height:1.35}.colab-autocomplete{position:relative}.colab-dropdown{position:absolute;left:0;right:0;top:calc(100% - 4px);z-index:60;background:linear-gradient(180deg,#0d0d18,#020617);border:1px solid rgba(34,197,94,.38);border-radius:16px;box-shadow:0 18px 44px rgba(0,0,0,.42);padding:6px;max-height:286px;overflow:auto}.colab-dropdown[hidden]{display:none}.colab-option{width:100%;border:0;background:transparent;color:#e2e2f0;text-align:left;border-radius:12px;padding:10px 11px;cursor:pointer;display:block}.colab-option:hover,.colab-option.active{background:rgba(22,101,52,.34)}.colab-option strong{display:block;font-size:12px;line-height:1.25;color:#f8fafc;letter-spacing:.02em}.colab-option span{display:block;margin-top:3px;font-size:11px;line-height:1.25;color:#6b7280}.colab-empty{padding:10px 11px;color:#6b7280;font-size:12px}.speed-divider{height:1px;background:rgba(148,163,184,.14);margin:16px 0}.speed-import-card{border:1px solid rgba(34,197,94,.18);background:rgba(2,6,23,.32);border-radius:18px;padding:14px;margin-bottom:16px}.speed-import-head{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:10px}.speed-import-head h3{margin:0}.speed-import-actions{display:flex;gap:8px;flex-wrap:wrap;align-items:center}.speed-sync-range{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:8px 0 4px}.speed-sync-range .speed-field{margin-bottom:0}.speed-sync-range .speed-input{min-height:38px;padding:8px 10px;font-size:12px}@media(max-width:560px){.speed-sync-range{grid-template-columns:1fr}.speed-import-bulk{grid-template-columns:1fr}}.speed-btn-compact{width:auto;min-height:38px;padding:9px 12px;font-size:12px}.speed-import-bulk{display:grid;grid-template-columns:minmax(130px,1fr) minmax(130px,1fr) auto;gap:8px;align-items:end;margin:8px 0 10px}.speed-import-bulk .speed-input{min-height:38px;padding:8px 10px;font-size:12px}.speed-import-list{display:grid;gap:8px;max-height:260px;overflow:auto}.speed-import-empty{color:#6b7280;font-size:12px;border:1px dashed rgba(148,163,184,.2);border-radius:14px;padding:12px}.speed-import-filter-note{border:1px solid rgba(34,197,94,.25);background:rgba(34,197,94,.08);border-radius:14px;padding:10px 12px;margin:0 0 10px;color:#bbf7d0;font-size:12px}.speed-import-item{width:100%;text-align:left;border:1px solid rgba(148,163,184,.14);background:rgba(15,23,42,.72);color:#e2e2f0;border-radius:14px;padding:10px 12px;cursor:pointer}.speed-import-item:hover{border-color:rgba(34,197,94,.45);background:rgba(22,101,52,.18)}.speed-import-item.selected{border-color:rgba(34,197,94,.75);background:rgba(22,101,52,.24);box-shadow:inset 4px 0 0 rgba(34,197,94,.75)}.speed-import-item.generated{border-color:rgba(34,197,94,.36);background:rgba(20,83,45,.30);opacity:.74}.speed-import-item.generated strong::after{content:'  ✓ COPIADA';display:inline-flex;margin-left:6px;color:#86efac;font-size:10px;font-weight:950}.speed-import-item.generated .speed-import-badge{background:rgba(34,197,94,.22);border-color:rgba(34,197,94,.45);color:#dcfce7}.speed-import-item strong{display:block;color:#f8fafc;font-size:12px}.speed-import-item span{display:block;color:#6b7280;font-size:11px;margin-top:3px}.speed-import-badge{display:inline-flex;border-radius:999px;padding:3px 7px;background:rgba(34,197,94,.12);border:1px solid rgba(34,197,94,.22);color:#bbf7d0;font-size:10px;font-weight:900;margin-top:6px}.speed-import-footer{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:8px}.speed-import-ok{border:1px solid rgba(134,239,172,.35);background:rgba(34,197,94,.16);color:#dcfce7;border-radius:999px;padding:5px 10px;font-size:10px;font-weight:950;cursor:pointer}.speed-import-ok:hover{background:rgba(34,197,94,.28);border-color:rgba(134,239,172,.65)}.speed-import-actions-row{display:flex;align-items:center;gap:6px}.speed-import-action{border:1px solid rgba(148,163,184,.22);background:rgba(15,23,42,.75);color:#cbd5e1;border-radius:10px;width:30px;height:30px;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;transition:.16s ease}.speed-import-action:hover{border-color:rgba(34,197,94,.55);color:#bbf7d0;background:rgba(22,101,52,.28)}.speed-icon-btn{width:auto;min-height:38px;padding:9px 11px}.speed-icon-btn svg{pointer-events:none}.speed-import-search{display:grid;grid-template-columns:1fr 190px auto;gap:8px;margin:12px 0}.speed-search-field{position:relative}.speed-search-field svg{position:absolute;left:12px;top:50%;transform:translateY(-50%);color:#6b7280;pointer-events:none}.speed-search-field input{padding-left:34px}.speed-import-search select{width:100%;min-height:44px;border:1px solid rgba(148,163,184,.18);background:#0d0d18;color:#e2e2f0;border-radius:14px;padding:10px 12px;font-size:13px;outline:none;color-scheme:dark}.speed-import-search .speed-btn{width:auto}@media(max-width:640px){.speed-import-search{grid-template-columns:1fr}}.speed-fab{position:fixed;right:24px;bottom:24px;z-index:400;display:inline-flex;align-items:center;gap:9px;background:linear-gradient(135deg,#16a34a,#22c55e);color:#052e16;border:0;border-radius:999px;padding:14px 20px;font-weight:950;font-size:14px;cursor:pointer;box-shadow:0 14px 34px rgba(34,197,94,.38);transition:.18s ease}.speed-fab:hover{transform:translateY(-2px);filter:brightness(1.05)}.speed-modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,.65);display:flex;align-items:center;justify-content:center;z-index:9999;padding:20px}.speed-modal-overlay[hidden]{display:none}.speed-modal{background:#0d0d18;border:1px solid rgba(52,211,153,.22);border-radius:22px;padding:20px;width:100%;max-width:640px;max-height:90vh;overflow:auto;box-shadow:0 24px 70px rgba(0,0,0,.5)}.speed-modal-head{display:flex;justify-content:space-between;align-items:flex-start;gap:10px;margin-bottom:14px}.speed-modal-head h3{margin:0}.speed-modal-close{border:0;background:rgba(148,163,184,.14);color:#cbd5e1;border-radius:10px;width:34px;height:34px;flex-shrink:0;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;transition:.16s ease}.speed-modal-close:hover{background:rgba(239,68,68,.18);color:#fca5a5}.speed-fonte-bfleet{background:rgba(96,165,250,.12);border-color:rgba(96,165,250,.30);color:#93c5fd}.speed-fonte-infleet{background:rgba(251,191,36,.12);border-color:rgba(251,191,36,.30);color:#fde68a}.upload-box{border:1px dashed rgba(34,197,94,.35);border-radius:18px;padding:14px;background:rgba(2,6,23,.28)}.upload-list{display:grid;gap:8px;margin-top:10px}.upload-item{display:flex;justify-content:space-between;gap:10px;align-items:center;border:1px solid rgba(148,163,184,.13);background:rgba(15,23,42,.66);border-radius:14px;padding:10px 12px;color:#cbd5e1;font-size:12px}.upload-item strong{color:#f8fafc}.saved-list{display:grid;gap:8px;margin-top:10px}.saved-item{border:1px solid rgba(34,197,94,.20);background:rgba(22,101,52,.12);border-radius:14px;padding:10px 12px;color:#dcfce7;font-size:12px}.saved-item a{color:#86efac;font-weight:900}.speed-toast{position:fixed;right:22px;bottom:22px;background:rgba(22,101,52,.96);color:#dcfce7;border:1px solid rgba(134,239,172,.32);border-radius:16px;padding:12px 14px;font-weight:900;box-shadow:0 16px 45px rgba(0,0,0,.35);z-index:99999;opacity:0;transform:translateY(10px);pointer-events:none;transition:.2s ease}.speed-toast.show{opacity:1;transform:translateY(0)}.speed-grid{display:grid;grid-template-columns:1.05fr .95fr;gap:18px;align-items:start}.speed-step-title{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:14px}.speed-step-title h3{margin:0}.speed-step-pill{display:inline-flex;align-items:center;border:1px solid rgba(34,197,94,.28);background:rgba(34,197,94,.12);color:#bbf7d0;border-radius:999px;padding:5px 9px;font-size:10px;font-weight:950;text-transform:uppercase;letter-spacing:.08em;white-space:nowrap}.speed-message.small{min-height:280px}.paste-zone{border:1px dashed rgba(34,197,94,.42);border-radius:20px;background:radial-gradient(circle at top left,rgba(34,197,94,.14),transparent 32%),rgba(2,6,23,.36);padding:20px;text-align:center;outline:none;transition:.18s ease;cursor:pointer}.paste-zone:hover,.paste-zone:focus,.paste-zone.drag{border-color:rgba(134,239,172,.86);background:rgba(22,101,52,.16);box-shadow:0 0 0 4px rgba(34,197,94,.08)}.paste-zone strong{display:block;color:#f8fafc;font-size:15px;margin-bottom:6px}.paste-zone span{display:block;color:#6b7280;font-size:12px;line-height:1.45}.paste-zone kbd{display:inline-flex;border:1px solid rgba(148,163,184,.24);background:#0d0d18;color:#bbf7d0;border-radius:8px;padding:2px 6px;font-size:11px;font-weight:900}.hist-toolbar{display:grid;grid-template-columns:1.5fr 170px 150px 150px auto;gap:10px;align-items:end;margin-bottom:14px}.hist-kpi-grid{display:grid;grid-template-columns:repeat(4,minmax(120px,1fr));gap:12px;margin:12px 0 14px}.hist-kpi{border:1px solid rgba(148,163,184,.14);background:rgba(15,23,42,.58);border-radius:18px;padding:14px}.hist-kpi span{display:block;color:#6b7280;font-size:11px;font-weight:900;text-transform:uppercase;letter-spacing:.08em}.hist-kpi strong{display:block;color:#f8fafc;font-size:24px;margin-top:6px}.hist-list{display:grid;gap:14px}.hist-card{border:1px solid rgba(148,163,184,.14);background:rgba(15,23,42,.62);border-radius:20px;padding:14px}.hist-card-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;margin-bottom:12px}.hist-card h3{margin:0;color:#f8fafc;font-size:16px}.hist-card p{margin:5px 0 0;color:#6b7280;font-size:12px}.hist-mini-kpis{display:flex;gap:7px;flex-wrap:wrap;justify-content:flex-end}.hist-mini-kpis span{display:inline-flex;border:1px solid rgba(34,197,94,.22);background:rgba(34,197,94,.10);color:#bbf7d0;border-radius:999px;padding:5px 8px;font-size:10px;font-weight:950}.hist-table-wrap{overflow:auto;border-radius:14px;border:1px solid rgba(148,163,184,.12)}.hist-table{width:100%;border-collapse:collapse;min-width:780px;background:rgba(2,6,23,.22)}.hist-table th,.hist-table td{padding:10px 11px;border-bottom:1px solid rgba(148,163,184,.10);text-align:left;vertical-align:top;color:#cbd5e1;font-size:12px}.hist-table th{color:#6b7280;text-transform:uppercase;font-size:10px;letter-spacing:.08em;background:rgba(2,6,23,.38)}.hist-table td small{color:#6b7280;line-height:1.35}.hist-badge{display:inline-flex;border-radius:999px;padding:4px 8px;font-size:10px;font-weight:950;border:1px solid rgba(148,163,184,.22);color:#e2e2f0;background:rgba(148,163,184,.10)}.hist-badge.excesso{border-color:rgba(248,113,113,.28);background:rgba(127,29,29,.22);color:#fecaca}.hist-badge.multa{border-color:rgba(250,204,21,.28);background:rgba(113,63,18,.20);color:#fde68a}.hist-badge.manutencao{border-color:rgba(96,165,250,.28);background:rgba(30,64,175,.18);color:#bfdbfe}@media(max-width:980px){.hist-toolbar{grid-template-columns:1fr 1fr}.hist-kpi-grid{grid-template-columns:1fr 1fr}.hist-card-head{display:block}.hist-mini-kpis{justify-content:flex-start;margin-top:10px}}.upload-actions{display:grid;grid-template-columns:1fr;gap:10px;margin-top:12px}.print-status-box{border:1px solid rgba(148,163,184,.14);background:rgba(15,23,42,.52);border-radius:16px;padding:12px;margin-top:14px}.print-status-box strong{display:block;color:#f8fafc;font-size:12px;margin-bottom:5px}.print-status-box p{margin:0;color:#6b7280;font-size:12px;line-height:1.45}@media(max-width:1100px){.speed-grid{grid-template-columns:1fr}.speed-row{grid-template-columns:1fr 1fr 42px}}@media(max-width:560px){.frotas-header{display:block}.speed-row{grid-template-columns:1fr}.speed-btn-danger{width:100%}.speed-step-title{display:block}.speed-step-pill{margin-top:8px}}
      </style>`;
  }

  function mapColaborador(item) {
    if (typeof item === 'string') return { nome: item };
    return {
      id: item.id || item.ID || null,
      nome: item.nome || item.Nome || item.funcionario || item.Funcionário || item.name || '',
      cpf: item.cpf || item.CPF || '',
      tipo: item.tipo || item.Tipo || '',
      empresa: item.empresa || item.Empresa || '',
      coordenacao: item.coordenacao || item.coordenação || item.Coordenação || '',
      supervisao: item.supervisao || item.Supervisão || item.supervisão || ''
    };
  }

  function getColaboradores(opts) {
    const raw = state.colaboradores.length
      ? state.colaboradores
      : (opts?.colaboradores || opts?.auth?.colaboradores || opts?.user?.colaboradores || []);
    if (!Array.isArray(raw)) return [];
    const seen = new Set();
    return raw
      .map(mapColaborador)
      .filter((item) => item.nome)
      .filter((item) => {
        const key = normalizeName(item.nome);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR'));
  }

  function colaboradorInfo(c) {
    return [c.tipo, c.supervisao, c.coordenacao].filter(Boolean).join(' · ');
  }

  function renderColaboradorStatus(root, opts = {}) {
    const status = root.querySelector('[data-colaborador-status]');
    if (!status) return;
    const colaboradores = getColaboradores(opts);
    status.textContent = colaboradores.length
      ? `${colaboradores.length} colaboradores carregados da base.`
      : 'Digite o nome manualmente ou aguarde o carregamento da base.';
  }

  function hideColaboradorDropdown(root) {
    const dropdown = root.querySelector('[data-colaborador-dropdown]');
    if (!dropdown) return;
    dropdown.hidden = true;
    dropdown.innerHTML = '';
  }

  function updateColaboradorDropdown(root, opts = {}) {
    const input = root.querySelector('[data-speed-name]');
    const dropdown = root.querySelector('[data-colaborador-dropdown]');
    if (!input || !dropdown) return;

    const term = normalizeName(input.value);
    if (!term) {
      hideColaboradorDropdown(root);
      return;
    }

    const matches = getColaboradores(opts)
      .filter((c) => normalizeName(c.nome).includes(term))
      .slice(0, 8);

    if (!matches.length) {
      dropdown.innerHTML = '<div class="colab-empty">Nenhum colaborador encontrado. Você pode continuar digitando manualmente.</div>';
      dropdown.hidden = false;
      return;
    }

    dropdown.innerHTML = matches.map((c, index) => {
      const info = colaboradorInfo(c);
      return `<button class="colab-option" type="button" data-colab-pick="${index}"><strong>${escapeHtml(c.nome)}</strong>${info ? `<span>${escapeHtml(info)}</span>` : ''}</button>`;
    }).join('');

    dropdown.hidden = false;

    dropdown.querySelectorAll('[data-colab-pick]').forEach((btn) => {
      btn.addEventListener('mousedown', (ev) => {
        ev.preventDefault();
        const selected = matches[Number(btn.getAttribute('data-colab-pick'))];
        if (!selected) return;
        input.value = selected.nome;
        hideColaboradorDropdown(root);
      });
    });
  }

  function bindColaboradorAutocomplete(root, opts = {}) {
    const input = root.querySelector('[data-speed-name]');
    if (!input || input.dataset.autocompleteBound === '1') return;
    input.dataset.autocompleteBound = '1';

    input.addEventListener('input', () => updateColaboradorDropdown(root, opts));
    input.addEventListener('focus', () => updateColaboradorDropdown(root, opts));
    input.addEventListener('keydown', (ev) => {
      const dropdown = root.querySelector('[data-colaborador-dropdown]');
      if (!dropdown || dropdown.hidden) return;
      if (ev.key === 'Escape') {
        hideColaboradorDropdown(root);
        return;
      }
      if (ev.key === 'Enter') {
        const first = dropdown.querySelector('.colab-option');
        if (first) {
          ev.preventDefault();
          first.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        }
      }
    });

    document.addEventListener('mousedown', (ev) => {
      const wrap = root.querySelector('[data-colaborador-autocomplete]');
      if (wrap && !wrap.contains(ev.target)) hideColaboradorDropdown(root);
    });
  }

  function isColaboradorAtivo(row) {
    if (!row) return false;
    if (row.ativo === false) return false;

    const situacao = String(row.situacao || row.Situação || '').trim().toLowerCase();
    if (['não ativo', 'nao ativo', 'inativo', 'desligado', 'desligada'].includes(situacao)) return false;

    return true;
  }

  function mergeColaboradores(rows) {
    const byKey = new Map();

    (Array.isArray(rows) ? rows : []).forEach((row) => {
      if (!row || !row.nome || !isColaboradorAtivo(row)) return;

      const cpf = String(row.cpf || '').replace(/\D/g, '');
      const key = cpf || normalizeName(row.nome);
      const current = byKey.get(key);
      const currentDate = String(current?.data_referencia || current?.updated_at || current?.created_at || '');
      const nextDate = String(row.data_referencia || row.updated_at || row.created_at || '');

      if (!current || nextDate >= currentDate) {
        byKey.set(key, row);
      }
    });

    return Array.from(byKey.values())
      .map(mapColaborador)
      .filter((row) => row.nome)
      .sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR'));
  }

  async function fetchAllRows(supabase, table, select, orderColumn) {
    const pageSize = 1000;
    let from = 0;
    const all = [];

    while (from < 20000) {
      let query = supabase
        .from(table)
        .select(select)
        .range(from, from + pageSize - 1);

      if (orderColumn) {
        query = query.order(orderColumn, { ascending: true });
      }
      query = query.order('id', { ascending: true }); // desempate: orderColumn nem sempre é único

      const { data, error } = await query;
      if (error) throw error;

      const rows = Array.isArray(data) ? data : [];
      all.push(...rows);

      if (rows.length < pageSize) break;
      from += pageSize;
    }

    return all;
  }

  async function loadColaboradoresFromSupabase(root, opts = {}) {
    const fallback = getColaboradores(opts);
    if (fallback.length) {
      state.colaboradores = fallback;
      state.colaboradoresLoaded = true;
      renderColaboradorStatus(root, opts);
      updateColaboradorDropdown(root, opts);
      return;
    }

    const supabase = resolveSupabase(opts);
    if (!supabase || typeof supabase.from !== 'function') {
      renderColaboradorStatus(root, opts);
      updateColaboradorDropdown(root, opts);
      return;
    }

    const status = root.querySelector('[data-colaborador-status]');
    if (status) status.textContent = 'Carregando colaboradores da base...';

    try {
      const baseRows = await fetchAllRows(
        supabase,
        'colaboradores',
        'id,nome,cpf,situacao,tipo,empresa,coordenacao,supervisao,created_at,updated_at',
        'nome'
      );

      const merged = mergeColaboradores(baseRows);

      state.colaboradores = merged;
      state.colaboradoresLoaded = true;

      if (status && merged.length < 300) {
        status.textContent = `${merged.length} colaboradores carregados. Atenção: a base retornou poucos registros para este usuário/permissão.`;
      } else {
        renderColaboradorStatus(root, opts);
      }

      updateColaboradorDropdown(root, opts);
    } catch (err) {
      console.warn('[FROTAS] Não foi possível carregar colaboradores:', err);
      if (status) status.textContent = 'Não foi possível carregar a base agora. Você ainda pode digitar o nome manualmente.';
      renderColaboradorStatus(root, opts);
      updateColaboradorDropdown(root, opts);
    }
  }


  function getDriverFromExcesso(row) {
    return row?.patrimonio_funcionario || row?.motorista_planilha || '';
  }

  function groupImportedExcessos(rows) {
    const groups = new Map();
    (Array.isArray(rows) ? rows : []).forEach((row) => {
      const status = String(row.status_notificacao || '').toUpperCase();
      if (status === 'NOTIFICADO' || status === 'CANCELADO') return;
      const placa = onlyPlate(row.placa);
      if (!placa) return;
      const motorista = getDriverFromExcesso(row);
      const key = `${normalizeName(motorista) || 'SEM MOTORISTA'}|${placa}`;
      if (!groups.has(key)) {
        groups.set(key, {
          key,
          motorista,
          placa,
          coordenacao: row.coordenacao || '',
          supervisao: row.supervisao || '',
          status_cruzamento: row.status_cruzamento || '',
          fonte: String(row.import_hash || '').startsWith('INFLEET|') ? 'INFLEET' : 'BFLEET',
          registros: []
        });
      }
      groups.get(key).registros.push(row);
    });

    return Array.from(groups.values()).map((g) => {
      const ordered = (g.registros || []).sort((a, b) => String(a.data_evento || '').localeCompare(String(b.data_evento || '')) || String(a.hora_evento || '').localeCompare(String(b.hora_evento || '')));
      g.originalRegistros = ordered;
      g.totalRegistrosOriginais = ordered.length;
      g.registros = dedupeHighestSpeedByDate(ordered.map((r) => ({ ...r, data: r.data_evento, velocidade: r.velocidade })));
      g.maxVelocidade = Math.max(...g.registros.map((r) => Number(r.velocidade || 0)));
      g.periodoInicio = g.registros[0]?.data || g.registros[0]?.data_evento || '';
      g.periodoFim = g.registros[g.registros.length - 1]?.data || g.registros[g.registros.length - 1]?.data_evento || '';
      return g;
    }).sort((a, b) => String(a.motorista || a.placa).localeCompare(String(b.motorista || b.placa), 'pt-BR'));
  }

  function buildPrintDriverMap() {
    return groupImportedExcessos(state.importedExcessos).map((g) => {
      const driverName = isUnknownDriverName(g.motorista) ? '' : normalizeName(g.motorista || '');
      return {
        key: g.key || '',
        plate: onlyPlate(g.placa),
        driverName,
        driverFolderName: driverName ? sanitizeFolderName(driverName) : '',
        coordenacao: g.coordenacao || '',
        supervisao: g.supervisao || '',
        registros: (g.registros || []).map((r) => ({
          id: r.id,
          data: formatDateBR(r.data || r.data_evento),
          velocidade: parseSpeed(r.velocidade)
        })).filter((r) => r.id && r.data && r.velocidade)
      };
    }).filter((item) => item.plate);
  }

  function buildKnownDriversForOcr(opts = currentRenderOpts) {
    const byName = new Map();

    const addDriver = (nome, extra = {}) => {
      const cleaned = cleanPossibleDriverName(nome);
      if (!cleaned || isUnknownDriverName(cleaned)) return;
      const key = normalizeDriverNameForMatch(cleaned);
      if (!key || byName.has(key)) return;
      byName.set(key, {
        driverName: cleaned,
        driverFolderName: sanitizeFolderName(cleaned),
        normalized: key,
        cpf: extra.cpf || '',
        coordenacao: extra.coordenacao || '',
        supervisao: extra.supervisao || ''
      });
    };

    getColaboradores(opts).forEach((c) => addDriver(c.nome, c));
    groupImportedExcessos(state.importedExcessos).forEach((g) => addDriver(g.motorista, g));

    return Array.from(byName.values());
  }

  function renderImportedExcessos(root) {
    const list = root.querySelector('[data-imported-excess-list]');
    const count = root.querySelector('[data-imported-excess-count]');
    if (!list) return;

    const groups = groupImportedExcessos(state.importedExcessos);
    const filter = state.activeImportedDateFilter;
    const filterSuffix = filter ? ` · exibindo ${filter.label || `${formatDateBR(filter.start)} a ${formatDateBR(filter.end)}`}` : '';
    if (count) count.textContent = groups.length ? `${groups.length} notificação(ões) pendente(s)${filterSuffix}` : `Nenhuma pendência carregada${filterSuffix}`;

    if (!state.importedExcessosLoaded) {
      list.innerHTML = '<div class="speed-import-empty">Carregando registros importados...</div>';
      return;
    }

    if (!groups.length) {
      const filter = state.activeImportedDateFilter;
      const extra = filter ? ` no período ${escapeHtml(filter.label || `${formatDateBR(filter.start)} a ${formatDateBR(filter.end)}`)}` : '';
      list.innerHTML = `<div class="speed-import-empty">Nenhum excesso de velocidade pendente encontrado${extra}. Clique em Sincronizar para buscar novos registros da BFleet.</div>`;
      return;
    }

    const availableDates = Array.from(new Set((state.importedExcessos || [])
      .filter((row) => ['PENDENTE', 'GERADA'].includes(String(row.status_notificacao || '').toUpperCase()))
      .map((row) => normalizeDateForMatch(row.data_evento))
      .filter(Boolean)))
      .sort()
      .reverse();

    const defaultEndDate = availableDates[0] || '';
    const bulkBar = `<div class="speed-import-bulk">
      <div class="speed-field"><label>Data inicial para OK</label><input class="speed-input" type="date" list="speed-import-pending-dates" data-ok-imported-date-start value="${escapeHtml(defaultEndDate)}"></div>
      <div class="speed-field"><label>Data final para OK</label><input class="speed-input" type="date" list="speed-import-pending-dates" data-ok-imported-date-end value="${escapeHtml(defaultEndDate)}"></div>
      <datalist id="speed-import-pending-dates">${availableDates.map((d) => `<option value="${escapeHtml(d)}">${escapeHtml(formatDateBR(d))}</option>`).join('')}</datalist>
      <button class="speed-btn speed-btn-soft speed-btn-compact" type="button" data-ok-imported-date-btn>OK por período</button>
    </div>`;

    const groupStatus = (g) => {
      const generated = state.generatedImportedGroupKeys.has(g.key) || (g.registros || []).some((r) => String(r.status_notificacao || '').toUpperCase() === 'GERADA');
      if (generated) return 'GERADA';
      return g.status_cruzamento === 'MOTORISTA_IDENTIFICADO' ? 'IDENTIFICADO' : 'CONFERIR';
    };
    const searchTerm = normalizeName(state.importedSearchTerm || '');
    const searchPlate = onlyPlate(state.importedSearchTerm || '');
    const statusFilterValue = state.importedStatusFilter || 'ALL';
    const visibleGroups = groups.filter((g) => {
      if (statusFilterValue !== 'ALL' && groupStatus(g) !== statusFilterValue) return false;
      if (!searchTerm) return true;
      return normalizeName(g.motorista || '').includes(searchTerm) || (searchPlate && onlyPlate(g.placa).includes(searchPlate));
    });

    const filterNote = filter ? `<div class="speed-import-filter-note">Mostrando somente registros do período <strong>${escapeHtml(filter.label || `${formatDateBR(filter.start)} a ${formatDateBR(filter.end)}`)}</strong>. Ao sincronizar outro período, esta lista é substituída automaticamente.</div>` : '';

    if (!visibleGroups.length) {
      list.innerHTML = filterNote + bulkBar + '<div class="speed-import-empty">Nenhuma pendência corresponde à busca/filtro atual.</div>';
      return;
    }

    list.innerHTML = filterNote + bulkBar + visibleGroups.map((g, index) => {
      const nome = g.motorista ? normalizeName(g.motorista) : 'Motorista não identificado';
      const meta = [g.supervisao, g.coordenacao].filter(Boolean).join(' · ');
      const periodo = g.periodoInicio === g.periodoFim ? formatDateBR(g.periodoInicio) : `${formatDateBR(g.periodoInicio)} a ${formatDateBR(g.periodoFim)}`;
      const generated = state.generatedImportedGroupKeys.has(g.key) || (g.registros || []).some((r) => String(r.status_notificacao || '').toUpperCase() === 'GERADA');
      const selected = state.selectedImportedGroupKey === g.key;
      const badge = generated ? 'Mensagem copiada' : (g.status_cruzamento === 'MOTORISTA_IDENTIFICADO' ? 'Identificado pelo patrimônio' : 'Conferir motorista');
      const fonteLabel = g.fonte === 'INFLEET' ? 'Infleet' : 'BFleet';
      const fonteCls   = g.fonte === 'INFLEET' ? 'speed-fonte-infleet' : 'speed-fonte-bfleet';
      return `<div class="speed-import-item ${selected ? 'selected' : ''} ${generated ? 'generated' : ''}" role="button" tabindex="0" data-imported-excess-index="${index}">
        <strong>${escapeHtml(nome)} · ${escapeHtml(g.placa)}</strong>
        <span>${escapeHtml(meta || 'Sem supervisão/coordenação')} · ${g.registros.length} data(s) considerada(s) · ${g.totalRegistrosOriginais || g.registros.length} registro(s) importado(s) · ${escapeHtml(periodo)} · maior ${escapeHtml(g.maxVelocidade)} km/h</span>
        <div class="speed-import-footer">
          <em class="speed-import-badge">${escapeHtml(badge)}</em>
          <em class="speed-import-badge ${fonteCls}">${escapeHtml(fonteLabel)}</em>
          <div class="speed-import-actions-row">
            <button class="speed-import-action" type="button" data-copy-imported-group="${index}" title="Gerar e copiar mensagem" aria-label="Gerar e copiar mensagem">${ICO_COPY}</button>
            <button class="speed-import-action" type="button" data-edit-imported-group="${index}" title="Editar no formulário" aria-label="Editar no formulário">${ICO_EDIT}</button>
            <button class="speed-import-ok" type="button" data-ok-imported-group="${index}" title="Marcar esta pendência como OK e remover da tela">OK</button>
          </div>
        </div>
      </div>`;
    }).join('');

    list.querySelector('[data-ok-imported-date-btn]')?.addEventListener('click', () => markImportedRowsOkByDate(root));

    list.querySelectorAll('[data-ok-imported-group]').forEach((btn) => {
      btn.addEventListener('click', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        const group = visibleGroups[Number(btn.getAttribute('data-ok-imported-group'))];
        markImportedRowsOk(root, group?.originalRegistros || group?.registros || [], `OK manual aplicado por pendência (${group?.motorista || group?.placa || 'sem identificação'}).`, currentRenderOpts);
      });
    });

    list.querySelectorAll('[data-copy-imported-group]').forEach((btn) => {
      btn.addEventListener('click', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        const group = visibleGroups[Number(btn.getAttribute('data-copy-imported-group'))];
        copyImportedGroupMessage(root, currentRenderOpts, group);
      });
    });

    list.querySelectorAll('[data-edit-imported-group]').forEach((btn) => {
      btn.addEventListener('click', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        const group = visibleGroups[Number(btn.getAttribute('data-edit-imported-group'))];
        applyImportedExcessoGroup(root, group);
      });
    });

    list.querySelectorAll('[data-imported-excess-index]').forEach((item) => {
      const open = () => {
        const group = visibleGroups[Number(item.getAttribute('data-imported-excess-index'))];
        applyImportedExcessoGroup(root, group);
      };
      item.addEventListener('click', open);
      item.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter' || ev.key === ' ') {
          ev.preventDefault();
          open();
        }
      });
    });
  }

  function getOpenImportedRows() {
    return (state.importedExcessos || []).filter((row) => ['PENDENTE', 'GERADA'].includes(String(row.status_notificacao || '').toUpperCase()));
  }

  async function markImportedRowsOk(root, rows, reason = 'OK manual aplicado no painel.', opts = {}) {
    const supabase = resolveSupabase(opts);
    const ids = (Array.isArray(rows) ? rows : []).map((row) => row?.id).filter(Boolean);
    if (!ids.length) {
      toast('Nenhuma pendência encontrada para marcar como OK.', 'error');
      return;
    }
    if (!supabase || typeof supabase.from !== 'function') {
      toast('Supabase não encontrado para salvar o OK.', 'error');
      return;
    }

    const nowIso = new Date().toISOString();
    const userId = getCurrentUserId();
    const userName = getCurrentUserName();
    const payload = {
      status_notificacao: 'NOTIFICADO',
      notificado_em: nowIso,
      observacoes: reason
    };
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(userId || ''))) payload.notificado_por = userId;
    if (userName) payload.notificado_por_nome = userName;

    try {
      const { error } = await supabase
        .from('frotas_excesso_velocidade')
        .update(payload)
        .in('id', ids);
      if (error) throw error;

      const idSet = new Set(ids.map(String));
      state.importedExcessos.forEach((row) => {
        if (idSet.has(String(row.id))) row.status_notificacao = 'NOTIFICADO';
      });
      renderImportedExcessos(root);
      toast(`${ids.length} registro(s) marcado(s) como OK e removido(s) das pendências.`);
    } catch (err) {
      console.warn('[FROTAS] Falha ao marcar pendências como OK:', err);
      toast('Não foi possível marcar como OK no Supabase.', 'error');
    }
  }

  function markImportedRowsOkByDate(root) {
    const startRaw = root.querySelector('[data-ok-imported-date-start]')?.value || '';
    const endRaw = root.querySelector('[data-ok-imported-date-end]')?.value || '';
    const startDate = normalizeDateForMatch(startRaw || endRaw);
    const endDate = normalizeDateForMatch(endRaw || startRaw);
    if (!startDate || !endDate) {
      toast('Selecione a data inicial e final para aplicar OK em lote.', 'error');
      return;
    }
    const minDate = startDate <= endDate ? startDate : endDate;
    const maxDate = startDate <= endDate ? endDate : startDate;
    const rows = getOpenImportedRows().filter((row) => {
      const rowDate = normalizeDateForMatch(row.data_evento);
      return rowDate && rowDate >= minDate && rowDate <= maxDate;
    });
    const label = minDate === maxDate ? formatDateBR(minDate) : `${formatDateBR(minDate)} a ${formatDateBR(maxDate)}`;
    markImportedRowsOk(root, rows, `OK manual aplicado em lote por período (${label}).`, currentRenderOpts);
  }


  function applyImportedExcessoGroup(root, group) {
    if (!group) return;
    state.selectedImportedGroupKey = group.key || '';
    const nomeInput = root.querySelector('[data-speed-name]');
    const placaInput = root.querySelector('[data-speed-plate]');
    if (nomeInput) nomeInput.value = group.motorista || '';
    if (placaInput) placaInput.value = onlyPlate(group.placa);

    const mapped = (group.registros || [])
      .map((r) => ({ data: toInputDate(r.data || r.data_evento), velocidade: parseSpeed(r.velocidade) }))
      .filter((r) => r.data && r.velocidade);
    state.records = mapped.length ? mapped : [{ data: '', velocidade: '' }];
    renderRecords(root);
    renderImportedExcessos(root);
    const editModal = root.querySelector('[data-edit-modal]');
    if (editModal) editModal.hidden = false;
    toast('Registros importados aplicados na notificação. Revise e clique em Gerar ✉️.');
  }


  async function copyImportedGroupMessage(root, opts, group) {
    if (!group) return;
    const nome = isUnknownDriverName(group.motorista) ? '' : String(group.motorista || '').trim();
    if (!nome) {
      toast('Motorista não identificado. Use Editar para selecionar o colaborador antes de copiar.', 'error');
      return;
    }
    const placa = onlyPlate(group.placa);
    if (!placa || placa.length < 7) {
      toast('Placa inválida para este registro. Use Editar para revisar.', 'error');
      return;
    }
    const registros = (group.registros || [])
      .map((r) => ({ data: r.data || r.data_evento, velocidade: r.velocidade }))
      .filter((r) => r.data && parseSpeed(r.velocidade));
    if (!registros.length) {
      toast('Nenhum registro de velocidade válido para gerar a mensagem.', 'error');
      return;
    }

    const cidadeData = `Cascavel, ${todayBRLong()}`;
    const message = buildMessage({ nome, placa, registros, cidadeData });
    state.selectedImportedGroupKey = group.key || '';
    try {
      await copyText(message);
      await markSelectedImportedGroupAsGenerated(root, opts, message);
      toast(`Mensagem de ${normalizeName(nome)} gerada e copiada.`);
    } catch (err) {
      console.warn('[FROTAS] Falha ao copiar mensagem do card:', err);
      toast('Mensagem gerada, mas não foi possível copiar automaticamente.', 'error');
    }
  }

  async function callEdgeFunction(opts, name, body) {
    const supabase = resolveSupabase(opts);
    if (!supabase?.functions?.invoke) {
      throw new Error('Supabase Functions não encontrado nesta página.');
    }
    const { data, error } = await supabase.functions.invoke(name, { body });
    if (error) {
      let detail = '';
      const context = error.context;
      if (context && typeof context.clone === 'function') {
        try {
          const payload = await context.clone().json();
          detail = payload?.error || payload?.message || '';
        } catch {
          try { detail = await context.clone().text(); } catch { detail = ''; }
        }
      } else {
        detail = context?.error || context?.message || '';
      }
      const msg = detail || error.message || `Falha na function ${name}`;
      if (/connection refused|failed to send a request|failed to fetch|connecterror/i.test(msg)) {
        throw new Error('A BFleet está temporariamente indisponível. Aguarde alguns instantes e tente sincronizar novamente.');
      }
      throw new Error(msg.length > 360 ? `${msg.slice(0, 357)}...` : msg);
    }
    if (data?.error) throw new Error(data.error);
    return data || {};
  }

  function readSyncReportPeriod(root) {
    const start = root.querySelector('[data-sync-report-start]')?.value || '';
    const end = root.querySelector('[data-sync-report-end]')?.value || '';
    return { start, end };
  }

  async function sincronizarRelatorioBFleet(root, opts = {}, mode = 'yesterday') {
    const isPeriod = mode === 'period';
    const btn = root.querySelector(isPeriod ? '[data-sync-bfleet-period]' : '[data-sync-bfleet-excessos]');
    const originalText = btn?.textContent || (isPeriod ? 'Sincronizar período' : 'Sincronizar ontem');
    try {
      if (btn) {
        btn.disabled = true;
        btn.textContent = 'Sincronizando...';
      }

      const body = { mode: 'sync', forceRefreshToken: true, preferWebReport: true, rangeTimeVal: 'yesterday' };
      let label = 'yesterday';
      let filterStart = yesterdayInputDate();
      let filterEnd = filterStart;

      if (isPeriod) {
        const { start, end } = readSyncReportPeriod(root);
        if (!start || !end) {
          toast('Informe a data inicial e a data final do relatório para sincronizar o período.', 'error');
          return;
        }
        if (start > end) {
          toast('A data inicial do relatório não pode ser maior que a data final.', 'error');
          return;
        }
        body.dataInicial = start;
        body.dataFinal = end;
        body.startDate = start;
        body.endDate = end;
        delete body.rangeTimeVal;
        filterStart = start;
        filterEnd = end;
        label = `${formatDateBR(start)} a ${formatDateBR(end)}`;
      }

      toast(`Sincronizando relatório de excesso de velocidade da BFleet (${label})...`);
      const res = await callEdgeFunction(opts, BFLEET_EXCESSO_FUNCTION, body);
      const inserted = Number(res?.inserted || res?.inseridos || res?.created || res?.novos || 0);
      const updated = Number(res?.updated || res?.atualizados || 0);
      const total = Number(res?.total || res?.total_registros || res?.linhas || res?.linhas_lidas_api || inserted + updated || 0);
      const errors = Number(res?.errors || res?.erros || 0);
      toast(`BFleet sincronizado: ${total || 'N'} registro(s) lido(s), ${inserted} novo(s), ${updated} atualizado(s)${errors ? ` · ${errors} erro(s)` : ''}.`, errors ? 'error' : 'success');
      setImportedDateFilter(filterStart, filterEnd, label === 'yesterday' ? `ontem (${formatDateBR(filterStart)})` : label);
      await fetchImportedExcessos(root, opts);
    } catch (err) {
      console.error('[FROTAS] Sync BFleet excesso:', err);
      toast(err.message || 'Falha ao sincronizar relatório da BFleet.', 'error');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = originalText;
      }
    }
  }

  async function fetchImportedExcessos(root, opts = {}) {
    const supabase = resolveSupabase(opts);
    if (!supabase || typeof supabase.from !== 'function') {
      state.importedExcessosLoaded = true;
      renderImportedExcessos(root);
      return;
    }

    try {
      state.importedExcessosLoaded = false;
      renderImportedExcessos(root);
      let query = supabase
        .from('frotas_excesso_velocidade')
        .select('id,data_evento,hora_evento,placa,velocidade,endereco,motorista_planilha,patrimonio_funcionario,patrimonio_codigo,coordenacao,supervisao,status_cruzamento,status_notificacao,import_hash,created_at')
        .in('status_notificacao', ['PENDENTE', 'GERADA']);

      const filter = state.activeImportedDateFilter;
      if (filter?.start) query = query.gte('data_evento', filter.start);
      if (filter?.end) query = query.lte('data_evento', filter.end);

      const { data, error } = await query
        .order('data_evento', { ascending: false })
        .limit(1000);
      if (error) throw error;
      state.importedExcessos = Array.isArray(data) ? data : [];
    } catch (err) {
      console.warn('[FROTAS] Não foi possível carregar excessos importados:', err);
      state.importedExcessos = [];
    } finally {
      state.importedExcessosLoaded = true;
      renderImportedExcessos(root);
    }
  }

  function readForaHorarioReportPeriod(root) {
    const start = root.querySelector('[data-fora-horario-report-start]')?.value || '';
    const end = root.querySelector('[data-fora-horario-report-end]')?.value || '';
    return { start, end };
  }

  async function sincronizarForaHorario(root, opts = {}, mode = 'yesterday') {
    const isPeriod = mode === 'period';
    const btn = root.querySelector(isPeriod ? '[data-sync-bfleet-fora-horario-periodo]' : '[data-sync-bfleet-fora-horario]');
    const originalText = btn?.textContent || (isPeriod ? 'Sincronizar período' : 'Sincronizar ontem');
    try {
      if (btn) {
        btn.disabled = true;
        btn.textContent = 'Sincronizando...';
      }

      const body = { mode: 'sync', forceRefreshToken: true, reportId: BFLEET_FORA_HORARIO_REPORT_ID, rangeTimeVal: 'yesterday' };
      let label = 'yesterday';

      if (isPeriod) {
        const { start, end } = readForaHorarioReportPeriod(root);
        if (!start || !end) {
          toast('Informe a data inicial e a data final do relatório para sincronizar o período.', 'error');
          return;
        }
        if (start > end) {
          toast('A data inicial do relatório não pode ser maior que a data final.', 'error');
          return;
        }
        body.dataInicial = start;
        body.dataFinal = end;
        body.startDate = start;
        body.endDate = end;
        delete body.rangeTimeVal;
        label = `${formatDateBR(start)} a ${formatDateBR(end)}`;
      }

      toast(`Sincronizando relatório Fora do horário da BFleet (${label})...`);
      const res = await callEdgeFunction(opts, BFLEET_FORA_HORARIO_FUNCTION, body);
      if (res?.em_andamento) {
        // A BFleet leva alguns minutos no relatório pesado: a function segue gravando em segundo plano.
        toast('A BFleet ainda está gerando o relatório. A sincronização continua em segundo plano — atualize a lista em alguns minutos.');
        return;
      }
      const inserted = Number(res?.inserted || res?.inseridos || res?.created || res?.novos || 0);
      const updated = Number(res?.updated || res?.atualizados || 0);
      const total = Number(res?.total || res?.total_registros || res?.linhas || inserted + updated || 0);
      const errors = Number(res?.errors || res?.erros || 0);
      toast(`BFleet sincronizado: ${total || 'N'} registro(s) lido(s), ${inserted} novo(s), ${updated} atualizado(s)${errors ? ` · ${errors} erro(s)` : ''}.`, errors ? 'error' : 'success');
      // Refaz o dossiê (cruza viagens × informativos × produção × celular) do período recém-sincronizado e recarrega a lista.
      await recalcularDossieForaHorario(root, opts, { silencioso: true });
    } catch (err) {
      console.error('[FROTAS] Sync BFleet fora do horário:', err);
      toast(err.message || 'Falha ao sincronizar relatório Fora do horário da BFleet.', 'error');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = originalText;
      }
    }
  }

  async function fetchForaHorario(root, opts = {}, periodOverride = null) {
    const supabase = resolveSupabase(opts);
    if (!supabase || typeof supabase.from !== 'function') {
      state.foraHorarioLoaded = true;
      renderForaHorarioList(root);
      return;
    }

    // Se a data mudar de novo enquanto esta consulta roda, só a última resposta vale.
    const pedido = ++state.foraHorarioPedido;
    try {
      state.foraHorarioLoaded = false;
      renderForaHorarioList(root);
      const period = periodOverride || readForaHorarioReportPeriod(root);

      // O PostgREST devolve no máximo 1000 linhas por chamada: pagina até acabar (teto de 5 mil).
      const paginar = async (montar) => {
        const rows = [];
        for (let from = 0; from < 5000; from += 1000) {
          const { data, error } = await montar().range(from, from + 999);
          if (error) throw error;
          const page = Array.isArray(data) ? data : [];
          rows.push(...page);
          if (page.length < 1000) break;
        }
        return rows;
      };

      // O dossiê é calculado todo dia de madrugada e fica no banco: aqui só se lê (view já junta ocorrência + dossiê).
      state.foraHorarioDossieDisponivel = true;
      const lerLista = async () => {
        try {
          return await paginar(() => {
            let query = supabase.from('frotas_fora_horario_lista').select(FORA_HORARIO_LISTA_COLUNAS);
            if (period.start) query = query.gte('data_evento', period.start);
            if (period.end) query = query.lte('data_evento', period.end);
            return query.order('data_evento', { ascending: false }).order('placa', { ascending: true });
          });
        } catch (listaErr) {
          // Ambiente sem a view: cai para o relatório bruto, sem dossiê.
          console.warn('[FROTAS] Lista do dossiê indisponível:', listaErr);
          state.foraHorarioDossieDisponivel = false;
          return paginar(() => {
            let query = supabase.from('frotas_fora_horario_ocorrencias')
              .select('id,data_evento,placa,motorista,km_00_05,valor_km,valor_caixa,status_calculo,status_notificacao,status_caixa');
            if (period.start) query = query.gte('data_evento', period.start);
            if (period.end) query = query.lte('data_evento', period.end);
            return query.order('data_evento', { ascending: false }).order('placa', { ascending: true });
          });
        }
      };
      const lerControle = async () => {
        try {
          let query = supabase.from('frotas_fora_horario_sync_dia').select('data_evento,status,dossie_em,atualizado_em');
          if (period.start) query = query.gte('data_evento', period.start);
          if (period.end) query = query.lte('data_evento', period.end);
          const { data, error } = await query.order('data_evento', { ascending: false }).limit(62);
          if (error) throw error;
          return Array.isArray(data) ? data : [];
        } catch (controleErr) {
          console.warn('[FROTAS] Andamento da sincronização indisponível:', controleErr);
          return [];
        }
      };

      const [linhas, controle] = await Promise.all([lerLista(), lerControle()]);
      if (pedido !== state.foraHorarioPedido) return;
      state.foraHorarioSync = controle;
      state.foraHorario = linhas.map((linha) => ({
        ...linha,
        semOcorrencia: !!linha.sem_ocorrencia,
        dossie: linha.dossie_id ? linha : null
      }));
    } catch (err) {
      if (pedido !== state.foraHorarioPedido) return;
      console.warn('[FROTAS] Não foi possível carregar ocorrências de fora do horário:', err);
      state.foraHorario = [];
      state.foraHorarioSync = [];
    }
    state.foraHorarioLoaded = true;
    renderForaHorarioList(root);
  }

  function formatKmForaHorario(value) {
    const n = Number(value || 0);
    return Number.isFinite(n) ? n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 3 }) : '0,00';
  }

  function formatMoneyForaHorario(value) {
    const n = Number(value || 0);
    return Number.isFinite(n) ? n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : 'R$ 0,00';
  }

  function statusLabelForaHorario(row) {
    if (String(row.status_notificacao || '').toUpperCase() === 'JUSTIFICADA') return 'Justificada';
    if (String(row.status_caixa || '').toUpperCase() === 'LANCADO') return 'Caixa lançado';
    if (['PENDENTE','PROCESSANDO'].includes(String(row.status_caixa || '').toUpperCase())) return 'Caixa pendente';
    if (String(row.status_notificacao || '').toUpperCase() === 'GERADA') return 'Notificação gerada';
    if (String(row.status_calculo || '').toUpperCase() === 'ERRO') return 'Erro no cálculo';
    if (String(row.status_calculo || '').toUpperCase() === 'SEM_HISTORICO') return 'Sem histórico GPS';
    return 'Pendente';
  }

  async function agirForaHorario(root, opts, rowId, action) {
    const supabase = resolveSupabase(opts);
    if (!supabase || typeof supabase.rpc !== 'function') return toast('Supabase indisponível.', 'error');
    const row = (state.foraHorario || []).find((item) => String(item.id) === String(rowId));
    if (!row) return toast('Ocorrência não localizada.', 'error');

    let justificativa = null;
    if (action === 'JUSTIFICAR') {
      justificativa = window.prompt('Informe a justificativa para o uso do veículo fora do expediente:');
      if (justificativa === null) return;
      justificativa = String(justificativa || '').trim();
      if (!justificativa) return toast('Informe a justificativa.', 'error');
    }

    if (action === 'CAIXA') {
      const km = Number(row.km_00_05 || 0);
      if (!(km > 0)) return toast('A quilometragem entre 00h e 04h ainda não foi calculada.', 'error');
      const valor = km * Number(row.valor_km || 4);
      const ok = window.confirm(`Enviar ao Caixa: ${formatKmForaHorario(km)} km × R$ 4,00 = ${formatMoneyForaHorario(valor)}?`);
      if (!ok) return;
    }

    try {
      const { data, error } = await supabase.rpc('frotas_fora_horario_acao_v2', {
        p_ocorrencia_id: row.id,
        p_acao: action,
        p_justificativa: justificativa
      });
      if (error) throw error;

      if (action === 'GERAR') {
        const message = String(data?.message || '');
        if (message) {
          try { await navigator.clipboard.writeText(message); } catch (_) {}
          toast('Notificação gerada e copiada.');
        } else {
          toast('Notificação gerada.');
        }
      } else if (action === 'JUSTIFICAR') {
        toast('Justificativa registrada.');
      } else if (action === 'CAIXA') {
        const agentReady = data?.agent_ready !== false;
        const valor = formatMoneyForaHorario(data?.valor || (Number(row.km_00_05 || 0) * 4));
        toast(agentReady ? `Lançamento de ${valor} enviado ao Caixa.` : `Lançamento de ${valor} preparado; agente do Caixa ainda está desativado.`, agentReady ? 'success' : 'error');
      }

      await fetchForaHorario(root, opts);
    } catch (err) {
      console.error('[FROTAS] Ação fora do horário:', err);
      toast(err.message || 'Não foi possível concluir a ação.', 'error');
    }
  }

  // ── Dossiê de uso do veículo fora do expediente ─────────────────────────────
  // Horários do dossiê são de Brasília e chegam como texto sem fuso ("AAAA-MM-DDTHH:MM:SS"): nunca passam por Date local.

  const FH_VEREDITOS = {
    FORA_HORARIO: { rotulo: 'Fora do horário', cls: 'fh-badge-fora', ordem: 0 },
    ATENCAO: { rotulo: 'Para conferir', cls: 'fh-badge-atencao', ordem: 1 },
    DENTRO_HORARIO: { rotulo: 'Dentro do horário', cls: 'fh-badge-dentro', ordem: 2 }
  };

  const FH_EVIDENCIAS = {
    INFORMATIVO: 'Informativo no Mapa de Embarque',
    CHECKIN: 'Check-in na O.S.',
    CHECKOUT: 'Check-out da O.S.',
    CELULAR: 'Sinal do celular (GPS do app)',
    OS_PROGRAMADA: 'Veículo no local da O.S. escalada',
    CARONA: 'Veículo na casa do colega de carona'
  };

  function fhPrimeiroNome(nome) {
    const parte = String(nome || '').trim().split(/\s+/)[0] || '';
    return parte ? parte.charAt(0).toUpperCase() + parte.slice(1).toLowerCase() : '';
  }

  // Texto do registro; quando foi feito por um colega de carona, diz de quem.
  function fhEvidenciaRotulo(e) {
    let base = FH_EVIDENCIAS[e.tipo] || e.tipo;
    if (e.tipo === 'OS_PROGRAMADA') base = e.sentido === 'saida' ? 'Veículo saiu do local da O.S. escalada' : 'Veículo chegou ao local da O.S. escalada';
    if (e.tipo === 'CARONA') base = `${e.sentido === 'saida' ? 'Veículo saiu da casa' : 'Veículo chegou à casa'} de ${fhPrimeiroNome(e.quem)} (carona)`;
    else if (e.papel === 'CARONA' && e.quem) base += ` — ${fhPrimeiroNome(e.quem)} (carona)`;
    else if (e.papel === 'EQUIPE' && e.quem) base += ` — ${fhPrimeiroNome(e.quem)} (equipe)`;
    return base;
  }

  const FH_DIAS_SEMANA = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

  function fhHm(value) {
    const m = String(value || '').match(/(\d{2}):(\d{2})/);
    return m ? `${m[1]}:${m[2]}` : '--:--';
  }

  function fhHoraMin(minutos) {
    const total = ((Math.round(Number(minutos) || 0) % 1440) + 1440) % 1440;
    return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
  }

  function fhMinutosDoDia(value, dia) {
    const m = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/);
    const d = String(dia || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m || !d) return null;
    const dias = (Date.UTC(+m[1], +m[2] - 1, +m[3]) - Date.UTC(+d[1], +d[2] - 1, +d[3])) / 86400000;
    return dias * 1440 + (+m[4]) * 60 + (+m[5]) + (+(m[6] || 0)) / 60;
  }

  function fhDiaSemana(dataIso) {
    const m = String(dataIso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return '';
    return FH_DIAS_SEMANA[new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).getUTCDay()];
  }

  function fhKm(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : '0,0';
  }

  function fhDuracao(minutos) {
    const total = Math.max(0, Math.round(Number(minutos) || 0));
    if (total < 60) return `${total} min`;
    return `${Math.floor(total / 60)}h${String(total % 60).padStart(2, '0')}`;
  }

  function fhFonteRotulo(fonte) {
    const partes = String(fonte || '').split('+').filter(Boolean);
    const rotulos = [];
    const add = (texto) => { if (!rotulos.includes(texto)) rotulos.push(texto); };
    if (partes.includes('INFORMATIVO')) add('informativos');
    if (partes.includes('CHECKIN') || partes.includes('CHECKOUT')) add('produção');
    if (partes.includes('CELULAR')) add('GPS do celular');
    if (partes.includes('OS_PROGRAMADA')) add('rota no local da O.S. escalada');
    if (partes.includes('CARONA')) add('parada de carona');
    return rotulos.join(', ');
  }

  function fhChave(row) {
    return `${row.data_evento}|${onlyPlate(row.placa)}`;
  }

  function fhLinkTrajeto(v) {
    const ok = [v.la1, v.lo1, v.la2, v.lo2].every((n) => n !== null && n !== undefined && Number.isFinite(Number(n)));
    if (!ok) return '';
    return `https://www.google.com/maps/dir/?api=1&origin=${v.la1},${v.lo1}&destination=${v.la2},${v.lo2}&travelmode=driving`;
  }

  function fhLinkPonto(lat, lng) {
    if (![lat, lng].every((n) => n !== null && n !== undefined && Number.isFinite(Number(n)))) return '';
    return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
  }

  function fhBadge(dossie) {
    const info = FH_VEREDITOS[dossie?.veredito];
    if (!info) return '<span class="fh-badge fh-badge-nd">Sem dossiê</span>';
    return `<span class="fh-badge ${info.cls}">${info.rotulo}</span>`;
  }

  // Para que o trajeto se justifique: chegou a O.S. programada, carona, local de registro de trabalho ou está no caminho.
  const FH_USOS = {
    OS: 'O.S. programada',
    CARONA: 'Parada de carona',
    TRABALHO: 'Registro de trabalho',
    VEICULO: 'Abastecimento ou serviço do veículo',
    CAMINHO: 'No caminho',
    RETORNO: 'Volta para casa'
  };

  const FH_STATUS_EXCESSO = {
    PENDENTE: 'Notificação pendente',
    GERADA: 'Mensagem copiada',
    NOTIFICADO: 'Notificado'
  };

  function fhNum(valor) {
    const n = Number(valor);
    return Number.isFinite(n) ? n : 0;
  }

  // As três frentes do dossiê do dia: fora do horário, trajetos sem justificativa e excesso de velocidade.
  function fhFlags(d) {
    if (!d) return null;
    return {
      fora: d.veredito === 'FORA_HORARIO',
      foraLeve: d.veredito === 'ATENCAO',
      indevido: d.veredito_uso === 'INDEVIDO',
      indevidoLeve: d.veredito_uso === 'ATENCAO',
      excessos: fhNum(d.qtd_excessos)
    };
  }

  function fhGravidade(d) {
    const f = fhFlags(d);
    if (!f) return 0;
    return (f.fora ? 100 : 0) + (f.foraLeve ? 30 : 0) + (f.indevido ? 80 : 0) + (f.indevidoLeve ? 25 : 0)
      + (f.excessos > 0 ? 20 + Math.min(f.excessos, 20) : 0) + (fhNum(d.excessos_fora) > 0 ? 15 : 0);
  }

  // Filtros da lista: ALERTAS = fora do horário, uso indevido ou excesso; CONFERIR = situações mais leves.
  function fhCategorias(row) {
    const f = fhFlags(row.dossie);
    if (!f) return ['SEM_DOSSIE'];
    const lista = [];
    if (f.fora || f.indevido || f.excessos > 0) lista.push('ALERTAS');
    if (f.fora) lista.push('FORA_HORARIO');
    if (f.indevido) lista.push('USO_INDEVIDO');
    if (f.excessos > 0) lista.push('EXCESSO');
    if (f.foraLeve || f.indevidoLeve) lista.push('CONFERIR');
    return lista;
  }

  // Período do dia em que o trecho aconteceu, em palavras.
  function fhPeriodo(minutoInicial) {
    if (minutoInicial < 300) return 'de madrugada';
    if (minutoInicial >= 1320) return 'à noite';
    return '';
  }

  // Agrupa as viagens fora do horário em "episódios" (trechos seguidos, com até 1 h entre eles).
  function fhEpisodios(d) {
    const lista = (d.resumo_dia || [])
      .filter((t) => Number(t.o) >= 0.3)
      .map((t) => ({ ini: Number.isFinite(Number(t.s)) ? Number(t.s) : Number(t.i), fim: Number(t.f), km: Number(t.o), x: t.x }))
      .sort((a, b) => a.ini - b.ini);
    const episodios = [];
    lista.forEach((t) => {
      const ultimo = episodios[episodios.length - 1];
      if (ultimo && t.ini - ultimo.fim <= 60) {
        ultimo.fim = Math.max(ultimo.fim, t.fim);
        ultimo.km += t.km;
        ultimo.tipos[t.x] = (ultimo.tipos[t.x] || 0) + t.km;
      } else {
        episodios.push({ ini: t.ini, fim: t.fim, km: t.km, tipos: { [t.x]: t.km } });
      }
    });
    const semJanela = !d.janela_inicio;
    return episodios.map((ep) => {
      let tipo;
      if (ep.tipos.C > 0) tipo = 'depois de chegar em casa';
      else if ((ep.tipos.A || 0) > (ep.tipos.P || 0)) tipo = 'antes do expediente';
      else tipo = semJanela ? 'em dia sem expediente' : 'depois do expediente';
      const periodo = fhPeriodo(ep.ini);
      return { ...ep, rotulo: periodo ? `${periodo}, ${tipo}` : tipo };
    });
  }

  // Frases curtas do que houve no dia, da mais grave para a menos grave.
  function fhPartesManchete(d) {
    const partes = [];
    if (d.veredito !== 'DENTRO_HORARIO') {
      partes.push(fhNum(d.km_fora) >= 5 ? `${fhKm(d.km_fora)} km fora do horário de trabalho` : 'percurso ou retorno diferente do esperado');
    }
    if (d.veredito_uso && d.veredito_uso !== 'REGULAR' && fhNum(d.km_indevido) >= 5) {
      partes.push(`${fhKm(d.km_indevido)} km em trajetos sem justificativa`);
    }
    if (fhNum(d.qtd_excessos) > 0) {
      partes.push(`${fhNum(d.qtd_excessos)} excesso(s) de velocidade (máx. ${Math.round(fhNum(d.vel_max))} km/h)`);
    }
    return partes;
  }

  function fhManchete(d) {
    if (!d) return '';
    const partes = fhPartesManchete(d);
    if (!partes.length) return 'Uso dentro do horário de trabalho, sem alertas';
    const texto = partes.join(' · ');
    return texto.charAt(0).toUpperCase() + texto.slice(1);
  }

  // Etiquetas da lista: uma por frente que tem algo a mostrar.
  function fhTagsHtml(d) {
    const f = fhFlags(d);
    if (!f) return '';
    const tags = [];
    if (f.fora || f.foraLeve) {
      const km = fhNum(d.km_fora) >= 1 ? ` · ${fhKm(d.km_fora)} km` : '';
      tags.push(`<span class="fh-tag ${f.fora ? 'fh-tag-fora' : 'fh-tag-atencao'}">Fora do horário${km}</span>`);
    }
    if (f.indevido || f.indevidoLeve) {
      const rotulo = f.indevido ? 'Uso indevido' : (d.uso_sem_base ? 'Sem O.S. nem registro' : 'Sem justificativa');
      tags.push(`<span class="fh-tag ${f.indevido ? 'fh-tag-sem' : 'fh-tag-sem-leve'}">${rotulo} · ${fhKm(d.km_indevido)} km</span>`);
    }
    if (f.excessos > 0) {
      tags.push(`<span class="fh-tag fh-tag-exc">${f.excessos} excesso(s) · máx. ${Math.round(fhNum(d.vel_max))} km/h</span>`);
    }
    return tags.join('');
  }

  function fhContexto(d) {
    if (!d) return '';
    if (d.criterio === 'PADRAO') return 'Sem registro de trabalho neste dia.';
    let texto = `Trabalhou das ${fhHm(d.inicio_expediente)} às ${fhHm(d.fim_expediente)}`;
    if (d.chegada_casa) {
      texto += ` · chegou em casa às ${fhHm(d.chegada_casa)}`;
      if (Number(d.atraso_retorno_min) > 20) texto += ` (${fhDuracao(d.atraso_retorno_min)} depois do previsto)`;
    }
    return `${texto}.`;
  }

  function fhTitulo(nome) {
    const miudas = new Set(['de', 'da', 'do', 'dos', 'das', 'e']);
    return String(nome || '').toLowerCase().split(/\s+/).filter(Boolean)
      .map((parte, i) => (i > 0 && miudas.has(parte) ? parte : parte.charAt(0).toUpperCase() + parte.slice(1))).join(' ');
  }

  // Só o que importa para o gestor: andamento da notificação/Caixa. Em branco = ainda aguardando análise.
  function fhStatusCurto(row) {
    if (row.semOcorrencia) return 'Sem registro de notificação';
    if (String(row.status_notificacao || '').toUpperCase() === 'JUSTIFICADA') return 'Justificada';
    const caixa = String(row.status_caixa || '').toUpperCase();
    if (caixa === 'LANCADO') return 'Caixa lançado';
    if (['PENDENTE', 'PROCESSANDO'].includes(caixa)) return 'Caixa pendente';
    if (String(row.status_notificacao || '').toUpperCase() === 'GERADA') return 'Notificação gerada';
    return '';
  }

  // Uma linha: o maior trecho fora do horário (ou o primeiro ponto de atenção).
  function fhResumoLinha(d) {
    const episodios = d.veredito !== 'DENTRO_HORARIO' ? fhEpisodios(d) : [];
    if (episodios.length) {
      const maior = episodios.slice().sort((a, b) => b.km - a.km)[0];
      const extra = episodios.length > 1 ? ` · mais ${episodios.length - 1} trecho(s)` : '';
      return `${fhHoraMin(maior.ini)} às ${fhHoraMin(maior.fim)} · ${fhKm(maior.km)} km · ${maior.rotulo}${extra}`;
    }
    const motivos = d.motivos || [];
    const f = fhFlags(d);
    const relevante = f && d.veredito === 'DENTRO_HORARIO' && (f.indevido || f.indevidoLeve || f.excessos > 0)
      ? motivos.find((m) => /sem justificativa|trajeto\(s\)|excesso|comparar/i.test(m)) : null;
    return relevante || motivos[0] || fhContexto(d);
  }

  // Ações da ocorrência ficam dentro dos detalhes (a lista só mostra o essencial).
  function atualizarRodapeDossie(root) {
    const rodape = root.querySelector('[data-dossie-rodape]');
    if (!rodape) return;
    const row = (state.foraHorario || []).find((item) => fhChave(item) === state.foraHorarioDossieChave);
    if (!row) { rodape.innerHTML = ''; return; }
    const km = Number(row.km_00_05 || 0);
    const valor = Number(row.valor_caixa || (km * Number(row.valor_km || 4)));
    const statusCaixa = String(row.status_caixa || '').toUpperCase();
    const semAcao = !row.id;
    const disabledCaixa = semAcao || !(km > 0) || String(row.status_notificacao || '').toUpperCase() === 'JUSTIFICADA' || ['PENDENTE', 'PROCESSANDO', 'LANCADO'].includes(statusCaixa);
    const disabledJustificar = semAcao || ['PENDENTE', 'PROCESSANDO', 'LANCADO'].includes(statusCaixa);
    const status = fhStatusCurto(row);
    const caixaInfo = km > 0
      ? `Caixa: ${formatKmForaHorario(km)} km entre 00h e 04h × R$ 4,00 = ${formatMoneyForaHorario(valor)}`
      : 'Caixa: sem quilometragem entre 00h e 04h';
    rodape.innerHTML = `<div class="fh-m-rodape-info">${status ? `<span class="fh-status">${escapeHtml(status)}</span>` : ''}<span class="fh-sub">${escapeHtml(caixaInfo)}</span></div>
      <div class="fora-horario-actions">
        <button class="speed-btn speed-btn-primary speed-btn-compact" type="button" data-fora-action="GERAR" data-id="${escapeHtml(row.id)}" ${semAcao ? 'disabled' : ''}>Gerar notificação</button>
        <button class="speed-btn speed-btn-soft speed-btn-compact" type="button" data-fora-action="JUSTIFICAR" data-id="${escapeHtml(row.id)}" ${disabledJustificar ? 'disabled' : ''}>Justificar</button>
        <button class="speed-btn speed-btn-soft speed-btn-compact" type="button" data-fora-action="CAIXA" data-id="${escapeHtml(row.id)}" ${disabledCaixa ? 'disabled' : ''}>Enviar ao Caixa</button>
      </div>`;
  }

  function fhDiasPendentes() {
    const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
    return (state.foraHorarioSync || [])
      .filter((c) => c.status !== 'OK' && c.data_evento < hoje)
      .map((c) => formatDateBR(c.data_evento).slice(0, 5))
      .reverse();
  }

  // "Atualizado em ..." vem do controle diário gravado no banco.
  function renderFrescorForaHorario(root) {
    const el = root.querySelector('[data-fh-fresco]');
    if (!el) return;
    const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
    const { end } = readForaHorarioReportPeriod(root);
    const partes = [];
    const atualizacoes = (state.foraHorarioSync || []).map((c) => c.dossie_em).filter(Boolean).sort();
    if (atualizacoes.length) {
      const quando = new Date(atualizacoes[atualizacoes.length - 1]).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
      partes.push(`Atualizado em ${quando.replace(',', ' às')}`);
    }
    const pendentes = fhDiasPendentes();
    if (pendentes.length) partes.push(`sincronizando automaticamente: ${pendentes.join(', ')}`);
    if (end && end >= hoje) partes.push('o dia de hoje só fecha depois da meia-noite');
    el.textContent = partes.join(' · ');
    el.hidden = !partes.length;
  }

  // ── Consultar rota: trajeto GPS do dia no mapa ──────────────────────────────
  // Pontos da RedGPS (edge function frotas-fora-horario-rota): [segundos desde 00:00, lat, lng, km/h].

  let fhMapa = null;
  let fhMapaMarcador = null;

  function fhHoraSeg(segundos) {
    const total = Math.max(0, Math.round(Number(segundos) || 0));
    const p2 = (n) => String(n).padStart(2, '0');
    return `${p2(Math.floor(total / 3600) % 24)}:${p2(Math.floor((total % 3600) / 60))}:${p2(total % 60)}`;
  }

  function fhDistanciaKm(la1, lo1, la2, lo2) {
    const rad = (v) => (v * Math.PI) / 180;
    const a = Math.sin(rad(la2 - la1) / 2) ** 2 + Math.cos(rad(la1)) * Math.cos(rad(la2)) * Math.sin(rad(lo2 - lo1) / 2) ** 2;
    return 2 * 6371 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)));
  }

  async function fhGarantirLeaflet() {
    if (window.L) return true;
    try {
      if (!document.getElementById('fh-leaflet-css')) {
        await new Promise((resolve) => {
          const link = document.createElement('link');
          link.id = 'fh-leaflet-css'; link.rel = 'stylesheet'; link.href = './assets/vendor/leaflet/leaflet.css';
          link.onload = resolve; link.onerror = resolve;
          document.head.appendChild(link);
        });
      }
      await new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = './assets/vendor/leaflet/leaflet.js'; script.async = true;
        script.onload = resolve; script.onerror = reject;
        document.head.appendChild(script);
      });
      return Boolean(window.L);
    } catch (err) {
      console.warn('[FROTAS] Leaflet indisponível:', err);
      return false;
    }
  }

  function finito(n) {
    return n !== null && n !== undefined && n !== '' && Number.isFinite(Number(n));
  }

  // Papel da O.S. na Programação: atendimento do condutor, logística (carona frota) ou destino da carona.
  function fhPapelOs(o) {
    const quem = fhTitulo(o.quem);
    if (o.papel === 'CARONA') return `destino da carona de ${quem}`;
    if (o.logistica === true || o.logistica === 'true') return `logística (carona frota) de ${quem}`;
    if (o.papel === 'EQUIPE') return `equipe do veículo: ${quem}`;
    return `atendimento escalado de ${quem}`;
  }

  function fhAgruparOs(prog) {
    const grupos = new Map();
    (prog?.os || []).forEach((o) => {
      const chave = String(o.os);
      if (!grupos.has(chave)) grupos.set(chave, { os: o.os, local: o.local || o.cliente || '', la: o.la, lo: o.lo, papeis: [] });
      const grupo = grupos.get(chave);
      const papel = fhPapelOs(o);
      if (!grupo.papeis.includes(papel)) grupo.papeis.push(papel);
    });
    return [...grupos.values()];
  }

  // Locais para conferir na rota: O.S. escalada na Programação, endereço cadastrado do colaborador e onde o veículo dormiu.
  function fhPontosReferencia(dos) {
    const det = dos.detalhes || {};
    const finito = (n) => n !== null && n !== undefined && n !== '' && Number.isFinite(Number(n));
    const lista = [];
    fhAgruparOs(det.programacao).forEach((g) => {
      const base = {
        tipo: 'os', sigla: 'O.S.',
        titulo: `O.S. ${g.os} · local de embarque programado`,
        detalhe: [g.local, g.papeis.join('; ')].filter(Boolean).join(' · ')
      };
      if (finito(g.la) && finito(g.lo)) lista.push({ ...base, lat: Number(g.la), lng: Number(g.lo) });
      else lista.push({ ...base, sem: true });
    });
    (det.enderecos || []).forEach((e) => {
      if (!finito(e.lat) || !finito(e.lng)) return;
      lista.push({
        tipo: 'casa', sigla: 'C', lat: Number(e.lat), lng: Number(e.lng),
        titulo: `Endereço cadastrado de ${fhTitulo(e.quem)}${e.papel === 'CARONA' ? ' (carona)' : ''}`,
        detalhe: e.endereco || 'endereço não informado no cadastro'
      });
    });
    const cm = det.casa_manha;
    if (cm && finito(cm.lat) && finito(cm.lng)) {
      lista.push({ tipo: 'pernoite', sigla: 'P', lat: Number(cm.lat), lng: Number(cm.lng), titulo: 'Onde o veículo dormiu', detalhe: cm.endereco || '' });
    }
    return lista;
  }

  function fhMaisProximo(pontos, lat, lng) {
    let melhor = null;
    pontos.forEach((p) => {
      const km = fhDistanciaKm(p[1], p[2], lat, lng);
      if (!melhor || km < melhor.km) melhor = { km, sec: p[0] };
    });
    return melhor;
  }

  function fhMapaCorpoHtml(dos, rota, referencias) {
    const pontos = rota.pontos || [];
    const origem = rota.fonte === 'cache' ? 'consulta guardada' : 'consultada agora na RedGPS';
    if (!pontos.length) {
      return '<div class="speed-import-empty">A RedGPS não devolveu pontos de GPS para este veículo neste dia.</div>';
    }
    const refs = referencias.map((r, i) => {
      if (r.sem) {
        return `<div class="fh-ref">
          <span class="fh-pin fh-pin-${r.tipo}">${escapeHtml(r.sigla)}</span>
          <div><b>${escapeHtml(r.titulo)}</b><small>${escapeHtml(r.detalhe || '')}</small><small class="fh-ref-prox">O local desta O.S. não tem coordenada cadastrada: não dá para marcar no mapa.</small></div>
          <span></span>
        </div>`;
      }
      const prox = fhMaisProximo(pontos, r.lat, r.lng);
      const txt = !prox ? '' : (prox.km <= 2
        ? `A rota passou a ${fhKm(prox.km)} km, às ${fhHm(`T${fhHoraSeg(prox.sec)}`)}.`
        : `A rota ficou a no mínimo ${fhKm(prox.km)} km deste ponto.`);
      return `<div class="fh-ref">
        <span class="fh-pin fh-pin-${r.tipo}">${escapeHtml(r.sigla)}</span>
        <div><b>${escapeHtml(r.titulo)}</b><small>${escapeHtml(r.detalhe || '')}</small><small class="fh-ref-prox">${escapeHtml(txt)}</small></div>
        <button type="button" class="fora-horario-link-btn" data-rota-mapa-ir="${i}">Ver no mapa</button>
      </div>`;
    }).join('');
    return `
      <p class="fh-m-sub">Trajeto do veículo em ${escapeHtml(formatDateBR(dos.data_evento))} (${pontos.length} pontos, ${escapeHtml(origem)}). Azul: trajeto justificado dentro do horário · roxo: trajeto sem justificativa · vermelho: fora do horário · círculo laranja: excesso de velocidade · etiquetas: horário no trajeto · círculo verde: saída · círculo branco: chegada.</p>
      <div class="fh-mapa" data-rota-mapa-el></div>
      <div class="fh-mapa-slider">
        <input type="range" min="0" max="${pontos.length - 1}" value="0" step="1" data-rota-mapa-slider aria-label="Horário no trajeto">
        <span data-rota-mapa-slider-txt></span>
      </div>
      <h4 class="fh-h4">Pontos de referência</h4>
      ${refs ? `<div class="fh-refs">${refs}</div>` : '<p class="speed-hint">Sem O.S. programada nem endereço cadastrado com coordenada para este dia.</p>'}`;
  }

  function fhRenderMapa(root, dos, rota, referencias) {
    const L = window.L;
    const el = root.querySelector('[data-rota-mapa-el]');
    const pontos = rota.pontos || [];
    if (!L || !el || !pontos.length) return;
    if (fhMapa) { fhMapa.remove(); fhMapa = null; }
    fhMapa = L.map(el, { zoomControl: true, scrollWheelZoom: true, center: [pontos[0][1], pontos[0][2]], zoom: 12, zoomAnimation: false, fadeAnimation: false, markerZoomAnimation: false });
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 19, maxNativeZoom: 16, attribution: 'Tiles &copy; Esri'
    }).addTo(fhMapa);

    // Trajeto: trechos azuis dentro do horário permitido e vermelhos fora dele.
    const jIniMin = fhMinutosDoDia(dos.janela_inicio, dos.data_evento);
    const jFimMin = fhMinutosDoDia(dos.janela_fim, dos.data_evento);
    const fora = (seg) => jIniMin === null || jFimMin === null || seg < jIniMin * 60 || seg > jFimMin * 60;
    const semIntervalos = ((dos.detalhes || {}).viagens || [])
      .filter((v) => v.uso === 'SEM_JUSTIFICATIVA')
      .map((v) => [(fhMinutosDoDia(v.ini, dos.data_evento) ?? 0) * 60, (fhMinutosDoDia(v.fim, dos.data_evento) ?? 0) * 60]);
    const classeDe = (seg) => {
      if (fora(seg)) return 'fora';
      return semIntervalos.some(([ini, fim]) => seg >= ini && seg <= fim) ? 'sem' : 'ok';
    };
    const corTrecho = { fora: '#f87171', sem: '#c084fc', ok: '#60a5fa' };
    let corrente = [];
    let correnteClasse = null;
    const fecharTrecho = () => {
      if (corrente.length > 1) L.polyline(corrente, { color: corTrecho[correnteClasse], weight: 4, opacity: 0.9 }).addTo(fhMapa);
    };
    pontos.forEach((p) => {
      const classe = classeDe(p[0]);
      if (correnteClasse === null) correnteClasse = classe;
      if (classe !== correnteClasse) {
        corrente.push([p[1], p[2]]);
        fecharTrecho();
        corrente = [[p[1], p[2]]];
        correnteClasse = classe;
      } else {
        corrente.push([p[1], p[2]]);
      }
    });
    fecharTrecho();

    // Etiqueta de hora na 1ª posição de cada hora (sem empilhar etiquetas no mesmo lugar).
    let ultima = null;
    for (let h = 0; h < 24; h += 1) {
      const p = pontos.find((item) => item[0] >= h * 3600 && item[0] < (h + 1) * 3600);
      if (!p) continue;
      if (ultima && fhDistanciaKm(ultima[0], ultima[1], p[1], p[2]) < 0.3) continue;
      ultima = [p[1], p[2]];
      L.marker([p[1], p[2]], {
        interactive: false,
        icon: L.divIcon({ className: '', html: `<div class="fh-hora">${String(h).padStart(2, '0')}h</div>`, iconSize: [30, 16], iconAnchor: [15, 8] })
      }).addTo(fhMapa);
    }

    // Saída e chegada de cada viagem, com o horário.
    ((dos.detalhes || {}).viagens || []).forEach((v) => {
      if (Number(v.km) < 0.1) return;
      const ok = (n) => n !== null && n !== undefined && Number.isFinite(Number(n));
      if (ok(v.la1) && ok(v.lo1)) {
        L.circleMarker([Number(v.la1), Number(v.lo1)], { radius: 5, color: '#fff', weight: 1.5, fillColor: '#22c55e', fillOpacity: 1 })
          .bindTooltip(`${fhHm(v.ini)} · saída · ${escapeHtml(v.de || '')}`).addTo(fhMapa);
      }
      if (ok(v.la2) && ok(v.lo2)) {
        L.circleMarker([Number(v.la2), Number(v.lo2)], { radius: 5, color: '#475569', weight: 2, fillColor: '#f8fafc', fillOpacity: 1 })
          .bindTooltip(`${fhHm(v.fim)} · chegada · ${escapeHtml(v.para || '')}`).addTo(fhMapa);
      }
    });

    // Excessos de velocidade do dia.
    ((dos.detalhes || {}).excessos || []).forEach((x) => {
      if (!finito(x.la) || !finito(x.lo)) return;
      L.circleMarker([Number(x.la), Number(x.lo)], { radius: 7, color: '#fff', weight: 2, fillColor: '#fb923c', fillOpacity: 1 })
        .bindTooltip(`${escapeHtml(String(x.ts || '').slice(11, 19))} · excesso de velocidade · ${Math.round(fhNum(x.vel))} km/h${x.endereco ? `<br>${escapeHtml(x.endereco)}` : ''}`)
        .addTo(fhMapa);
    });

    // Pontos de referência (O.S. programada, endereço cadastrado, pernoite).
    const marcadoresRef = referencias.map((r) => r.sem ? null : L.marker([r.lat, r.lng], {
      icon: L.divIcon({ className: '', html: `<div class="fh-pin fh-pin-${r.tipo}">${escapeHtml(r.sigla)}</div>`, iconSize: [26, 26], iconAnchor: [13, 13] }),
      zIndexOffset: 500
    }).bindTooltip(`<b>${escapeHtml(r.titulo)}</b>${r.detalhe ? `<br>${escapeHtml(r.detalhe)}` : ''}`).addTo(fhMapa));

    const limites = L.latLngBounds(pontos.map((p) => [p[1], p[2]]));
    // Referências muito longe da rota (endereço cadastrado desatualizado) não esticam o enquadramento.
    referencias.forEach((r) => { if (!r.sem && limites.pad(0.5).contains([r.lat, r.lng])) limites.extend([r.lat, r.lng]); });
    fhMapa.invalidateSize();
    fhMapa.fitBounds(limites, { padding: [30, 30], maxZoom: 16, animate: false });
    const mapaAtual = fhMapa;
    window.setTimeout(() => {
      if (fhMapa !== mapaAtual) return;
      mapaAtual.invalidateSize();
      mapaAtual.fitBounds(limites, { padding: [30, 30], maxZoom: 16, animate: false });
    }, 150);

    // Deslizador de horário.
    fhMapaMarcador = L.circleMarker([pontos[0][1], pontos[0][2]], { radius: 9, color: '#fff', weight: 2, fillColor: '#fbbf24', fillOpacity: 1 }).addTo(fhMapa);
    const slider = root.querySelector('[data-rota-mapa-slider]');
    const texto = root.querySelector('[data-rota-mapa-slider-txt]');
    const mover = () => {
      const p = pontos[Number(slider.value)] || pontos[0];
      const ll = [p[1], p[2]];
      fhMapaMarcador.setLatLng(ll);
      if (!fhMapa.getBounds().contains(ll)) fhMapa.panTo(ll, { animate: false });
      texto.textContent = `${fhHoraSeg(p[0])} · ${Number(p[3]) || 0} km/h`;
    };
    slider?.addEventListener('input', mover);
    mover();

    root.querySelectorAll('[data-rota-mapa-ir]').forEach((btn) => btn.addEventListener('click', () => {
      const r = referencias[Number(btn.dataset.rotaMapaIr)];
      if (!r || r.sem) return;
      fhMapa.setView([r.lat, r.lng], 15, { animate: false });
      const m = marcadoresRef[Number(btn.dataset.rotaMapaIr)];
      if (m) m.openTooltip();
    }));
  }

  async function abrirRotaMapa(root, opts) {
    const dos = state.foraHorarioDossieAberto;
    const modal = root.querySelector('[data-rota-mapa-modal]');
    if (!dos || !modal) return;
    const corpo = modal.querySelector('[data-rota-mapa-corpo]');
    modal.querySelector('[data-rota-mapa-titulo]').textContent = `Rota realizada · ${dos.placa} · ${formatDateBR(dos.data_evento)}`;
    corpo.innerHTML = '<div class="speed-import-empty">Consultando a rota do veículo...</div>';
    fhLiberarAncestrais(root);
    modal.hidden = false;
    fhEnquadrarJanela(modal);
    modal.querySelector('.speed-modal')?.focus({ preventScroll: true });
    try {
      const rota = await callEdgeFunction(opts, FORA_HORARIO_ROTA_FUNCTION, { placa: dos.placa, data: dos.data_evento });
      if (modal.hidden) return;
      const referencias = fhPontosReferencia(dos);
      corpo.innerHTML = fhMapaCorpoHtml(dos, rota, referencias);
      if (!(rota.pontos || []).length) return;
      if (!(await fhGarantirLeaflet())) {
        corpo.innerHTML = '<div class="speed-import-empty">Não foi possível carregar o mapa neste navegador.</div>';
        return;
      }
      fhRenderMapa(root, dos, rota, referencias);
    } catch (err) {
      console.error('[FROTAS] Rota do dia:', err);
      corpo.innerHTML = `<div class="speed-import-empty">${escapeHtml(err.message || 'Não foi possível consultar a rota.')}<br><button type="button" class="fora-horario-link-btn" data-rota-mapa-tentar>Tentar de novo</button></div>`;
    }
  }

  function fecharRotaMapa(root) {
    const modal = root.querySelector('[data-rota-mapa-modal]');
    if (modal) modal.hidden = true;
    if (fhMapa) { fhMapa.remove(); fhMapa = null; }
    fhMapaMarcador = null;
  }

  function atualizarFiltrosForaHorario(root, contagem) {
    root.querySelectorAll('[data-fh-filter]').forEach((btn) => {
      const chave = btn.dataset.fhFilter;
      btn.classList.toggle('active', chave === state.foraHorarioFiltro);
      const total = btn.querySelector('b');
      if (total) total.textContent = String(contagem[chave] ?? 0);
      if (chave === 'SEM_DOSSIE') btn.hidden = !contagem.SEM_DOSSIE;
    });
  }

  function fhLinhaHtml(row) {
    const d = row.dossie;
    const f = fhFlags(d);
    const forte = !!f && (f.fora || f.indevido);
    const leve = !!f && !forte && (f.foraLeve || f.indevidoLeve || f.excessos > 0);
    const classe = !d ? '' : (forte ? 'fh-linha-fora' : (leve ? 'fh-linha-atencao' : 'fh-linha-dentro'));
    const status = fhStatusCurto(row);
    const quem = escapeHtml(fhTitulo(row.motorista) || 'Colaborador não identificado');
    const caronas = Array.isArray(d?.caronas) ? d.caronas : [];
    const detalhe = [onlyPlate(row.placa), d?.supervisao, caronas.length ? `carona: ${caronas.map(fhPrimeiroNome).join(', ')}` : '']
      .filter(Boolean).map(escapeHtml).join(' · ');
    const tags = d ? fhTagsHtml(d) : '';
    const principal = !d ? '<b>Dossiê ainda não calculado</b>' : (tags ? `<div class="fh-tags">${tags}</div>` : '<b>Sem alertas no dia</b>');
    const resumo = d ? fhResumoLinha(d) : 'Recalcule o período para ver o resultado.';
    return `<article class="fh-linha ${classe}">
      <span class="fh-ponto" title="${escapeHtml(d ? fhManchete(d) : 'Sem dossiê')}"></span>
      <div class="fh-l-quem"><strong>${quem}</strong><small>${detalhe}</small></div>
      <div class="fh-l-resumo">${principal}<small>${escapeHtml(resumo)}</small></div>
      <div class="fh-l-fim">${status ? `<span class="fh-status">${escapeHtml(status)}</span>` : ''}</div>
      <button class="speed-btn fh-btn-dossie speed-btn-compact" type="button" data-fh-dossie data-key="${escapeHtml(fhChave(row))}" ${d ? '' : 'disabled'}>Ver detalhes</button>
    </article>`;
  }

  function renderForaHorarioList(root) {
    const lista = root.querySelector('[data-fora-horario-table]');
    const count = root.querySelector('[data-fora-horario-count]');
    const alerta = root.querySelector('[data-fh-alerta]');
    if (!lista) return;

    if (!state.foraHorarioLoaded) {
      lista.innerHTML = '<div class="speed-import-empty">Carregando ocorrências...</div>';
      if (count) count.textContent = 'Carregando...';
      return;
    }

    const term = normalizeName(state.foraHorarioSearchTerm || '');
    const buscadas = (state.foraHorario || []).filter((row) => {
      if (!term) return true;
      return normalizeName(row.motorista || '').includes(term) || normalizeName(row.placa || '').includes(term);
    });

    const contagem = { ALERTAS: 0, FORA_HORARIO: 0, USO_INDEVIDO: 0, EXCESSO: 0, CONFERIR: 0, SEM_DOSSIE: 0, TODOS: buscadas.length };
    buscadas.forEach((row) => { fhCategorias(row).forEach((categoria) => { contagem[categoria] += 1; }); });
    atualizarFiltrosForaHorario(root, contagem);
    renderFrescorForaHorario(root);

    const filtro = state.foraHorarioFiltro;
    const rows = buscadas.filter((row) => filtro === 'TODOS' || fhCategorias(row).includes(filtro));
    rows.sort((a, b) => String(b.data_evento).localeCompare(String(a.data_evento))
      || (fhGravidade(b.dossie) - fhGravidade(a.dossie))
      || (Number(b.dossie?.km_fora || 0) - Number(a.dossie?.km_fora || 0))
      || String(a.placa).localeCompare(String(b.placa)));

    if (count) count.textContent = `${rows.length} ocorrência(s) carregada(s)`;

    // Só aparece quando há algo errado; a explicação fica recolhida em "Como funciona".
    const temDossie = (state.foraHorario || []).some((row) => row.dossie);
    if (alerta) {
      let texto = '';
      if (!state.foraHorarioDossieDisponivel) texto = 'O dossiê ainda não está disponível neste ambiente: a lista é o relatório bruto da BFleet.';
      else if ((state.foraHorario || []).length && !temDossie) texto = 'O dossiê ainda não foi calculado para este período.';
      alerta.hidden = !texto;
      alerta.innerHTML = texto
        ? `${escapeHtml(texto)}${state.foraHorarioDossieDisponivel ? ' <button type="button" class="fora-horario-link-btn" data-recalcular-dossie>Recalcular dossiê</button>' : ''}`
        : '';
    }

    if (!rows.length) {
      const pendentes = fhDiasPendentes();
      const vazio = (state.foraHorario || []).length
        ? 'Nenhuma ocorrência neste filtro para o período. Troque o filtro acima para ver as demais.'
        : (pendentes.length
          ? `Os dados de ${pendentes.join(', ')} ainda estão sendo sincronizados automaticamente (a verificação roda a cada 20 min, de madrugada e de manhã). Volte em alguns minutos.`
          : 'Nenhuma ocorrência encontrada para o período. Use "Sincronizar período" para consultar a RedGPS/BFleet.');
      lista.innerHTML = `<div class="speed-import-empty">${vazio}</div>`;
      return;
    }

    // Um cabeçalho por dia (a data não se repete em cada linha).
    const porDia = rows.reduce((mapa, row) => mapa.set(row.data_evento, (mapa.get(row.data_evento) || 0) + 1), new Map());
    let diaAtual = null;
    lista.innerHTML = rows.map((row) => {
      let cabecalho = '';
      if (row.data_evento !== diaAtual) {
        diaAtual = row.data_evento;
        cabecalho = `<div class="fh-dia">${escapeHtml(fhDiaSemana(row.data_evento))}, ${escapeHtml(formatDateBR(row.data_evento))}<span>${porDia.get(row.data_evento)} veículo(s)</span></div>`;
      }
      return cabecalho + fhLinhaHtml(row);
    }).join('');
  }

  // Recalcula os dossiês do período pela Edge Function (a RPC é pesada demais para o papel `authenticated`).
  async function recalcularDossieForaHorario(root, opts = {}, { silencioso = false } = {}) {
    if (state.foraHorarioRecalculando) return;
    const { start, end } = readForaHorarioReportPeriod(root);
    if (!start || !end) { if (!silencioso) toast('Informe a data inicial e a final para recalcular o dossiê.', 'error'); return; }
    if (start > end) { if (!silencioso) toast('A data inicial não pode ser maior que a data final.', 'error'); return; }

    const dias = [];
    for (let cursor = new Date(`${start}T12:00:00Z`); cursor <= new Date(`${end}T12:00:00Z`) && dias.length <= 40; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
      dias.push(cursor.toISOString().slice(0, 10));
    }
    if (dias.length > 31) { toast('Recalcule no máximo 31 dias por vez.', 'error'); return; }

    const btn = root.querySelector('[data-recalcular-dossie]');
    const textoOriginal = btn?.textContent || 'Recalcular dossiê';
    state.foraHorarioRecalculando = true;
    if (btn) btn.disabled = true;
    let erros = 0;
    let gerados = 0;
    try {
      for (let i = 0; i < dias.length; i += 3) {
        const lote = dias.slice(i, i + 3);
        if (btn) btn.textContent = `Recalculando ${Math.min(i + lote.length, dias.length)}/${dias.length}...`;
        try {
          const res = await callEdgeFunction(opts, FORA_HORARIO_DOSSIE_FUNCTION, { dataInicial: lote[0], dataFinal: lote[lote.length - 1] });
          gerados += Number(res?.dossies || 0);
          erros += Number(res?.erros || 0);
        } catch (err) {
          erros += lote.length;
          console.error('[FROTAS] Recalcular dossiê:', err);
          if (!silencioso) toast(err.message || 'Falha ao recalcular o dossiê.', 'error');
        }
      }
      if (!silencioso || erros) {
        toast(erros ? `Dossiê recalculado com ${erros} falha(s): ${gerados} veículo(s)/dia gerado(s).` : `Dossiê recalculado: ${gerados} veículo(s)/dia.`, erros ? 'error' : 'success');
      }
    } finally {
      state.foraHorarioRecalculando = false;
      if (btn) { btn.disabled = false; btn.textContent = textoOriginal; }
    }
    await fetchForaHorario(root, opts, { start, end });
  }

  // ── Detalhes (modal) ───────────────────────────────────────────────────────

  function fhBarraHtml(dos, det) {
    const dia = dos.data_evento;
    const pct = (min) => Math.max(0, Math.min(1440, Number(min) || 0)) / 14.4;
    const ticks = [0, 3, 6, 9, 12, 15, 18, 21, 24]
      .map((h) => `<span class="fh-bar-tick" style="left:${(h / 24 * 100).toFixed(2)}%">${String(h).padStart(2, '0')}h</span>`).join('');
    const jIni = fhMinutosDoDia(dos.janela_inicio, dia);
    const jFim = fhMinutosDoDia(dos.janela_fim, dia);
    const janela = (jIni !== null && jFim !== null)
      ? `<div class="fh-bar-janela" style="left:${pct(jIni).toFixed(2)}%;width:${Math.max(0, pct(jFim) - pct(jIni)).toFixed(2)}%" title="${escapeHtml(`Horário permitido: ${fhHm(dos.janela_inicio)} às ${fhHm(dos.janela_fim)}`)}"></div>`
      : '';
    const viagensDia = det.viagens || [];
    const viagens = viagensDia.map((v) => {
      const ini = fhMinutosDoDia(v.ini, dia);
      const fim = fhMinutosDoDia(v.fim, dia);
      if (ini === null || fim === null || Number(v.km) < 0.1) return '';
      const fora = Number(v.fora_km) >= 0.3;
      const sem = v.uso === 'SEM_JUSTIFICATIVA';
      const largura = Math.max(pct(fim) - pct(ini), 0.45);
      const motivoUso = sem ? ' · sem justificativa' : (FH_USOS[v.uso] ? ` · ${FH_USOS[v.uso]}` : '');
      const titulo = `${fhHm(v.ini)} às ${fhHm(v.fim)} · ${fhKm(v.km)} km${fora ? ` (${fhKm(v.fora_km)} km fora do horário)` : ''}${motivoUso}`;
      return `<div class="fh-bar-trip ${fora ? 'fora' : 'ok'}${sem ? ' sem' : ''}" style="left:${pct(ini).toFixed(2)}%;width:${largura.toFixed(2)}%" title="${escapeHtml(titulo)}"></div>`;
    }).join('');
    const marcas = (det.evidencias || []).map((e) => {
      const min = fhMinutosDoDia(e.ts, dia);
      if (min === null) return '';
      const titulo = `${fhHm(e.ts)} · ${fhEvidenciaRotulo(e)}${e.em_casa ? ' (em casa, não conta)' : ''}`;
      return `<span class="fh-bar-ev${e.em_casa ? ' casa' : ''}" style="left:${pct(min).toFixed(2)}%" title="${escapeHtml(titulo)}"></span>`;
    }).join('');
    const excessos = (det.excessos || []).map((x) => {
      const min = fhMinutosDoDia(x.ts, dia);
      if (min === null) return '';
      const titulo = `${fhHm(x.ts)} · ${Math.round(fhNum(x.vel))} km/h${x.endereco ? ` · ${x.endereco}` : ''}`;
      return `<span class="fh-bar-exc" style="left:${pct(min).toFixed(2)}%" title="${escapeHtml(titulo)}"></span>`;
    }).join('');
    const temSem = viagensDia.some((v) => v.uso === 'SEM_JUSTIFICATIVA');
    return `<div class="fh-bar">
      <div class="fh-bar-lane fh-bar-evs">${marcas}</div>
      <div class="fh-bar-lane fh-bar-trips">${janela}${viagens}</div>
      ${excessos ? `<div class="fh-bar-lane fh-bar-excs">${excessos}</div>` : ''}
      <div class="fh-bar-ticks">${ticks}</div>
    </div>
    <div class="fh-legend">
      <span><i class="fh-lg fh-lg-janela"></i>Horário permitido</span>
      <span><i class="fh-lg fh-lg-ok"></i>Viagem dentro do horário</span>
      <span><i class="fh-lg fh-lg-fora"></i>Viagem fora do horário</span>
      ${temSem ? '<span><i class="fh-lg fh-lg-sem"></i>Trajeto sem justificativa</span>' : ''}
      <span><i class="fh-lg fh-lg-ev"></i>Registro de trabalho</span>
      <span><i class="fh-lg fh-lg-casa"></i>Registro feito em casa (não conta)</span>
      ${excessos ? '<span><i class="fh-lg fh-lg-exc"></i>Excesso de velocidade</span>' : ''}
    </div>`;
  }

  function fhSituacaoViagem(v, semJanela) {
    const periodo = fhPeriodo(fhMinutosDoDia(v.fora_ini || v.ini, String(v.ini || '').slice(0, 10)) ?? 600);
    const prefixo = periodo ? `${periodo}, ` : '';
    if (v.fase === 'APOS_CHEGADA_EM_CASA') return `${prefixo}depois de chegar em casa`;
    if (v.fase === 'ANTES_EXPEDIENTE') return `${prefixo}antes do expediente`;
    if (v.fase === 'APOS_EXPEDIENTE') return `${prefixo}${semJanela ? 'em dia sem expediente' : 'depois do expediente'}`;
    return 'fora do horário';
  }

  function fhViagemLinhaHtml(v, dos, excessos = []) {
    const fora = Number(v.fora_km) >= 0.3;
    const sem = v.uso === 'SEM_JUSTIFICATIVA';
    const parado = Number(v.km) < 0.1;
    const minutos = (fhMinutosDoDia(v.fim, dos.data_evento) ?? 0) - (fhMinutosDoDia(v.ini, dos.data_evento) ?? 0);
    const trajeto = fhLinkTrajeto(v);
    const percurso = parado
      ? `<span class="fh-muted">Parado com o motor ligado em</span> ${escapeHtml(v.de || '—')}`
      : `${escapeHtml(v.de || '—')} <span class="fh-muted">→</span> ${escapeHtml(v.para || '—')}${trajeto ? ` · <a href="${escapeHtml(trajeto)}" target="_blank" rel="noopener noreferrer">ver trajeto</a>` : ''}`;
    const chips = [fora
      ? `<span class="fh-fase fora">${escapeHtml(fhSituacaoViagem(v, !dos.janela_inicio))}</span>`
      : '<span class="fh-fase ok">dentro do horário</span>'];
    if (sem) {
      chips.push('<span class="fh-fase sem">sem justificativa</span>');
    } else if (!parado && FH_USOS[v.uso]) {
      chips.push(`<span class="fh-fase uso">${escapeHtml(FH_USOS[v.uso])}</span>${v.uso_ref ? `<div class="fh-sub">${escapeHtml(String(v.uso_ref).slice(0, 80))}</div>` : ''}`);
    }
    if (excessos.length) {
      const vmax = Math.max(...excessos.map((x) => fhNum(x.vel)));
      chips.push(`<span class="fh-fase exc">${excessos.length} excesso(s) · até ${Math.round(vmax)} km/h</span>`);
    }
    const km = parado ? '—' : `${fhKm(v.km)} km${fora && Number(v.fora_km) + 0.05 < Number(v.km) ? `<div class="fh-sub">${fhKm(v.fora_km)} km fora</div>` : ''}`;
    return `<tr class="${fora ? 'fh-linha-fora' : (sem ? 'fh-linha-sem' : '')}">
      <td><strong>${fhHm(v.ini)} às ${fhHm(v.fim)}</strong><div class="fh-sub">${fhDuracao(minutos)}</div></td>
      <td>${percurso}</td>
      <td>${km}</td>
      <td><div class="fh-chips-cel">${chips.join('')}</div></td>
    </tr>`;
  }

  // Só os trajetos com alerta (fora do horário, sem justificativa ou com excesso); os demais ficam a um clique.
  function fhPercursosHtml(dos, det) {
    const viagens = (det.viagens || []).map((v, i) => ({ ...v, _i: i }))
      .sort((a, b) => String(a.ini).localeCompare(String(b.ini)));
    if (!viagens.length) return '<div class="speed-import-empty">Sem viagens no dia.</div>';
    const excPorViagem = new Map();
    (det.excessos || []).forEach((x) => {
      if (x.viagem === null || x.viagem === undefined) return;
      excPorViagem.set(Number(x.viagem), [...(excPorViagem.get(Number(x.viagem)) || []), x]);
    });
    const comAlerta = viagens.filter((v) => Number(v.fora_km) >= 0.3 || v.uso === 'SEM_JUSTIFICATIVA' || excPorViagem.has(v._i));
    const cabecalho = '<thead><tr><th>Horário</th><th>Percurso</th><th>Distância</th><th>Situação</th></tr></thead>';
    const linha = (v) => fhViagemLinhaHtml(v, dos, excPorViagem.get(v._i) || []);
    const resumo = comAlerta.length
      ? `<table class="hist-table fh-tl">${cabecalho}<tbody>${comAlerta.map(linha).join('')}</tbody></table>`
      : '<div class="speed-import-empty">Nenhum trajeto com alerta neste dia.</div>';
    return `<div class="fh-percursos" data-fh-percursos data-modo="resumo">
      <div class="hist-table-wrap fh-tl-wrap fh-tl-resumo">${resumo}</div>
      <div class="hist-table-wrap fh-tl-wrap fh-tl-completo"><table class="hist-table fh-tl">${cabecalho}<tbody>${viagens.map(linha).join('')}</tbody></table></div>
      <button type="button" class="fora-horario-link-btn fh-alternar" data-fh-alternar-viagens>Ver todas as viagens do dia</button>
    </div>`;
  }

  // Excessos de velocidade do dia (lista do rastreador) com a situação de cada um no dossiê.
  function fhExcessosHtml(dos, det) {
    const lista = (det.excessos || []).slice().sort((a, b) => String(a.ts).localeCompare(String(b.ts)));
    if (!lista.length) return '';
    const linhas = lista.map((x) => {
      const mapa = fhLinkPonto(x.la, x.lo);
      const situacao = [];
      if (x.fora) situacao.push('<span class="fh-fase fora">fora do horário</span>');
      if (x.indevido) situacao.push('<span class="fh-fase sem">trajeto sem justificativa</span>');
      const status = String(x.status || '').toUpperCase();
      return `<tr>
        <td><strong>${escapeHtml(String(x.ts || '').slice(11, 19) || '--:--:--')}</strong></td>
        <td><span class="fh-fase exc">${Math.round(fhNum(x.vel))} km/h</span></td>
        <td>${escapeHtml(x.endereco || '—')}${mapa ? ` · <a href="${escapeHtml(mapa)}" target="_blank" rel="noopener noreferrer">ver no mapa</a>` : ''}</td>
        <td><div class="fh-chips-cel">${situacao.join('') || '<span class="fh-muted">—</span>'}</div></td>
        <td>${escapeHtml(FH_STATUS_EXCESSO[status] || x.status || '—')}</td>
      </tr>`;
    }).join('');
    return `<h4 class="fh-h4">Excessos de velocidade (${lista.length})</h4>
      <div class="hist-table-wrap fh-tl-wrap"><table class="hist-table fh-tl fh-tl-exc"><thead><tr><th>Hora</th><th>Velocidade</th><th>Local</th><th>Situação</th><th>Notificação</th></tr></thead><tbody>${linhas}</tbody></table></div>
      <p class="speed-hint"><button type="button" class="fora-horario-link-btn" data-fh-ir-excesso data-placa="${escapeHtml(onlyPlate(dos.placa))}">Gerar a notificação de excesso desta placa</button> (abre a aba "Notificar excessos" já filtrada).</p>`;
  }

  function fhRegistrosHtml(dos, det) {
    const itens = (det.evidencias || []).slice().sort((a, b) => String(a.ts).localeCompare(String(b.ts)));
    if (!itens.length) return '<div class="speed-import-empty">Nenhum registro de trabalho neste dia.</div>';
    const linhas = itens.map((e) => {
      const partes = [];
      if (e.os) partes.push(`O.S. ${escapeHtml(e.os)}`);
      if (e.local && e.tipo !== 'CARONA') partes.push(escapeHtml(e.local));
      if (e.cargas) partes.push(`${escapeHtml(e.cargas)} carga(s)`);
      const ponto = ['CELULAR', 'OS_PROGRAMADA', 'CARONA'].includes(e.tipo) ? fhLinkPonto(e.la, e.lo) : '';
      if (ponto) partes.push(`<a href="${escapeHtml(ponto)}" target="_blank" rel="noopener noreferrer">ver no mapa</a>`);
      return `<tr class="${e.em_casa ? 'fh-linha-casa' : ''}">
        <td><strong>${fhHm(e.ts)}</strong></td>
        <td>${escapeHtml(fhEvidenciaRotulo(e))}</td>
        <td>${partes.join(' · ') || '<span class="fh-muted">—</span>'}</td>
        <td>${e.em_casa ? '<span class="fh-fase neutra">feito em casa: não conta</span>' : '<span class="fh-fase info">conta como trabalho</span>'}</td>
      </tr>`;
    }).join('');
    return `<div class="hist-table-wrap fh-tl-wrap"><table class="hist-table fh-tl"><thead><tr><th>Horário</th><th>O que foi</th><th>Detalhe</th><th>Conta?</th></tr></thead><tbody>${linhas}</tbody></table></div>`;
  }

  function fhResumoTexto(dos) {
    const det = dos.detalhes || {};
    const v = FH_VEREDITOS[dos.veredito];
    const linhas = [
      'DOSSIÊ DIÁRIO DO VEÍCULO (USO FORA DO HORÁRIO, TRAJETOS SEM JUSTIFICATIVA E EXCESSO DE VELOCIDADE)',
      `${dos.motorista || 'Colaborador não identificado'} · placa ${dos.placa} · ${fhDiaSemana(dos.data_evento)}, ${formatDateBR(dos.data_evento)}`,
      `Resultado: ${v?.rotulo || dos.veredito}. ${fhManchete(dos)}.`,
      fhContexto(dos),
      dos.janela_inicio
        ? `Horário permitido para usar o veículo: ${fhHm(dos.janela_inicio)} às ${fhHm(dos.janela_fim)} (inclui ida/volta e ${dos.tolerancia_min} min de folga).`
        : 'Dia sem expediente registrado: qualquer uso conta como fora do horário.',
      `No dia o veículo rodou ${fhKm(dos.km_dia)} km; fora do horário: ${fhKm(dos.km_fora)} km em ${fhDuracao(dos.min_fora)}; sem justificativa: ${fhKm(dos.km_indevido)} km.`
    ];
    const progTxt = det.programacao || {};
    if (progTxt.condutores || (progTxt.caronas || []).length) {
      linhas.push(`Programação do dia: ${progTxt.condutores ? `condutor escalado ${progTxt.condutores}` : 'sem condutor escalado'}${(progTxt.caronas || []).length ? `; carona para ${progTxt.caronas.join(', ')}` : ''}.`);
    }
    if ((dos.motivos || []).length) {
      linhas.push('', 'O que chama atenção:');
      dos.motivos.forEach((motivo) => linhas.push(`- ${motivo}`));
    }
    const fora = (det.viagens || []).filter((item) => Number(item.fora_km) >= 0.3);
    if (fora.length) {
      linhas.push('', 'Viagens fora do horário:');
      fora.forEach((item) => linhas.push(`- ${fhHm(item.ini)} às ${fhHm(item.fim)} · ${fhKm(item.km)} km · ${item.de || '—'} → ${item.para || '—'}`));
    }
    const sem = (det.viagens || []).filter((item) => item.uso === 'SEM_JUSTIFICATIVA');
    if (sem.length) {
      linhas.push('', 'Trajetos sem O.S. programada, carona nem registro de trabalho:');
      sem.forEach((item) => linhas.push(`- ${fhHm(item.ini)} às ${fhHm(item.fim)} · ${fhKm(item.km)} km · ${item.de || '—'} → ${item.para || '—'}`));
    }
    if ((det.excessos || []).length) {
      linhas.push('', 'Excessos de velocidade:');
      det.excessos.forEach((x) => linhas.push(`- ${String(x.ts || '').slice(11, 19)} · ${Math.round(fhNum(x.vel))} km/h · ${x.endereco || '—'}${x.fora ? ' · fora do horário' : ''}${x.indevido ? ' · trajeto sem justificativa' : ''}`));
    }
    return linhas.join('\n');
  }

  // Os excessos do dossiê guardam o status do momento do cálculo; a notificação pode ter andado depois.
  async function fhAtualizarStatusExcessos(supabase, dos) {
    const lista = dos?.detalhes?.excessos;
    if (!Array.isArray(lista) || !lista.length) return;
    try {
      const ids = lista.map((x) => x.id).filter(Boolean);
      if (!ids.length) return;
      const { data, error } = await supabase.from('frotas_excesso_velocidade').select('id,status_notificacao').in('id', ids);
      if (error) throw error;
      const porId = new Map((data || []).map((r) => [String(r.id), r.status_notificacao]));
      lista.forEach((x) => { if (porId.has(String(x.id))) x.status = porId.get(String(x.id)); });
    } catch (err) {
      console.warn('[FROTAS] Status dos excessos indisponível:', err);
    }
  }

  function fhBadgesHtml(d) {
    const selos = [];
    const info = FH_VEREDITOS[d.veredito];
    if (fhNum(d.viagens_dia) === 0 && fhNum(d.km_dia) === 0) selos.push('<span class="fh-badge fh-badge-nd">Sem viagens no relatório</span>');
    else if (info) selos.push(`<span class="fh-badge ${info.cls}">${escapeHtml(info.rotulo)}</span>`);
    if (d.veredito_uso === 'INDEVIDO') selos.push('<span class="fh-badge fh-badge-sem">Uso indevido</span>');
    else if (d.veredito_uso === 'ATENCAO') selos.push('<span class="fh-badge fh-badge-sem-leve">Trajetos para conferir</span>');
    if (fhNum(d.qtd_excessos) > 0) selos.push(`<span class="fh-badge fh-badge-exc">${fhNum(d.qtd_excessos)} excesso(s) de velocidade</span>`);
    return selos.join('') || '<span class="fh-badge fh-badge-nd">Sem dossiê</span>';
  }

  function renderDossieHtml(dos, row) {
    const det = dos.detalhes || {};
    const info = FH_VEREDITOS[dos.veredito] || { rotulo: dos.veredito, cls: 'fh-badge-nd' };
    const padrao = dos.criterio === 'PADRAO';
    const semJanela = !dos.janela_inicio;
    const semViagens = fhNum(dos.viagens_dia) === 0 && fhNum(dos.km_dia) === 0;
    const registros = (det.evidencias || []).filter((e) => !e.em_casa).length;

    const passos = [];
    const prog = det.programacao || {};
    const grupos = fhAgruparOs(prog);
    const logistica = (prog.logistica || []).map(fhTitulo);
    const passagens = (det.evidencias || []).filter((e) => (e.tipo === 'OS_PROGRAMADA' || e.tipo === 'CARONA') && !e.em_casa).length;
    if (prog.condutores || (prog.caronas || []).length || grupos.length || logistica.length) {
      const partes = [];
      if (prog.condutores) {
        partes.push(`Condutor escalado: ${fhTitulo(prog.condutores)}${logistica.length ? ' (logística / carona frota)' : ''}${prog.divergente ? ', diferente do motorista cadastrado do veículo' : ''}.`);
      }
      if ((prog.caronas || []).length) partes.push(`Carona para: ${prog.caronas.map(fhTitulo).join(', ')}.`);
      if (grupos.length) {
        partes.push(`O.S. escalada: ${grupos.map((g) => `${g.os}${g.local ? ` (${g.local})` : ''}: ${g.papeis.join('; ')}${finito(g.la) && finito(g.lo) ? '' : ' (sem coordenada cadastrada)'}`).join(' | ')}.`);
        partes.push(passagens
          ? `A rota do veículo passou ${passagens} vez(es) pelo local de uma O.S. escalada ou pela casa do colega de carona, o que conta como trabalho.`
          : 'A rota do veículo não passou perto do local da O.S. escalada nem da casa do colega de carona.');
      } else {
        partes.push('A Programação não vincula nenhuma O.S. às pessoas deste veículo neste dia.');
      }
      passos.push({ titulo: 'Programação do dia', texto: partes.join(' ') });
    } else {
      passos.push({ titulo: 'Programação do dia', texto: 'Não há condutor, logística, carona nem O.S. escalada para esta placa na Programação deste dia.' });
    }
    passos.push({
      titulo: 'Trabalho registrado',
      texto: padrao
        ? 'Neste dia não há informativo, produção nem sinal do celular fora de casa.'
        : `Das ${fhHm(dos.inicio_expediente)} às ${fhHm(dos.fim_expediente)}, com ${registros} registro(s): ${fhFonteRotulo(dos.fonte_expediente)}.${dos.primeiro_informativo ? ` Informativos no Mapa de Embarque: ${Number(dos.qtd_informativos) || 0}, do primeiro às ${fhHm(dos.primeiro_informativo)} ao último às ${fhHm(dos.ultimo_informativo)}.` : ''}`
    });
    passos.push({
      titulo: 'Horário permitido para usar o veículo',
      texto: semJanela
        ? 'Dia sem expediente registrado (domingo): qualquer uso conta como fora do horário.'
        : `Das ${fhHm(dos.janela_inicio)} às ${fhHm(dos.janela_fim)}.${padrao ? ' Como não há registros, vale o horário padrão.' : ` Inclui o tempo estimado de ida (${fhDuracao(det.t_ida_min)}) e de volta (${fhDuracao(det.t_volta_min)}) entre a casa e o trabalho, mais ${Number(dos.tolerancia_min) || 20} min de folga.`}${dos.criterio === 'AMPLIADO' ? ' Como há poucos registros, foi ampliado para 05:30 às 20:00 para evitar falso alarme.' : ''}`
    });
    if (dos.chegada_casa) {
      const atraso = Number(dos.atraso_retorno_min);
      passos.push({
        titulo: 'Chegada em casa',
        texto: `O veículo chegou às ${fhHm(dos.chegada_casa)}; o previsto era ${fhHm(dos.retorno_previsto)}${Number.isFinite(atraso) ? (atraso > 0 ? ` (${fhDuracao(atraso)} depois)` : ' (dentro do previsto)') : ''}.`
      });
    }

    const usoDia = det.uso || {};
    const excDia = det.excessos || [];
    if (semViagens) passos.length = 0;
    if (!semViagens) passos.push({
      titulo: 'Trajetos sem justificativa',
      texto: (dos.uso_sem_base || usoDia.sem_base)
        ? 'Neste dia não há O.S. programada com localização, carona nem registro de trabalho feito longe de casa: o percurso não tem com o que ser comparado.'
        : `Cada viagem foi comparada com ${Number(usoDia.locais) || 0} local(is) conhecido(s) do dia: O.S. programada (a menos de 3 km), casa de colega de carona, onde houve registro de trabalho, posto ou oficina. ${fhNum(dos.km_indevido) > 0 ? `${fhKm(dos.km_indevido)} km em ${fhNum(dos.viagens_indevidas)} trajeto(s) não chegaram a nenhum deles e passaram do trajeto direto.` : 'Todos os trajetos chegaram a um deles ou estavam no caminho.'}`
    });
    if (excDia.length) {
      passos.push({
        titulo: 'Excessos de velocidade',
        texto: `${excDia.length} registro(s) do rastreador no dia (limite de 120 km/h); o maior foi de ${Math.round(fhNum(dos.vel_max))} km/h. ${fhNum(dos.excessos_fora) > 0 ? `${fhNum(dos.excessos_fora)} aconteceram fora do horário permitido.` : 'Todos aconteceram dentro do horário permitido.'}`
      });
    }

    const motivos = (dos.motivos || []).length
      ? `<ul class="fh-motivos">${dos.motivos.map((m) => `<li>${escapeHtml(m)}</li>`).join('')}</ul>`
      : '<p class="speed-hint">Nada fora do normal neste dia.</p>';
    const avisos = [];
    if (dos.criterio === 'AMPLIADO') avisos.push('Poucos registros de trabalho neste dia: o resultado pode ser falso alarme, vale conferir com o colaborador.');
    if (dos.veredito_uso && dos.veredito_uso !== 'REGULAR' && (dos.uso_sem_base || usoDia.sem_base)) {
      avisos.push('Neste dia não há O.S. programada com localização, carona nem registro de trabalho: não há com o que comparar o percurso, vale conferir com o colaborador.');
    } else if (dos.veredito_uso === 'INDEVIDO') {
      avisos.push('Trajetos sem justificativa podem ser falso alarme quando a O.S. está cadastrada longe do ponto real. Confira em "Consultar rota".');
    } else if (dos.veredito_uso === 'ATENCAO' && padrao) {
      avisos.push('Sem registro de trabalho neste dia, a falta de justificativa pode ser só falta de registro: confira em "Consultar rota" se o veículo passou perto da O.S. programada.');
    }
    const aviso = avisos.map((texto) => `<p class="fh-aviso">${escapeHtml(texto)}</p>`).join('');

    const contexto = semViagens ? 'O veículo não aparece no relatório de viagens da BFleet neste dia' : [
      padrao ? 'Sem registro de trabalho neste dia' : `Trabalhou das ${fhHm(dos.inicio_expediente)} às ${fhHm(dos.fim_expediente)}`,
      semJanela ? 'dia sem expediente' : `horário permitido ${fhHm(dos.janela_inicio)} às ${fhHm(dos.janela_fim)}`,
      dos.chegada_casa ? `chegou em casa às ${fhHm(dos.chegada_casa)}` : ''
    ].filter(Boolean).join(' · ');

    const casaManha = det.casa_manha || {};
    const casaNoite = det.casa_noite || {};
    const linkCasa = fhLinkPonto(casaManha.lat, casaManha.lng);
    const pernoite = `<p class="speed-hint">Considerado como "casa" o lugar onde o veículo dormiu: ${escapeHtml(casaManha.endereco || '—')}${linkCasa ? ` · <a href="${escapeHtml(linkCasa)}" target="_blank" rel="noopener noreferrer">ver no mapa</a>` : ''}${casaNoite.endereco && casaNoite.endereco !== casaManha.endereco ? `<br>O veículo terminou o dia em: ${escapeHtml(casaNoite.endereco)}` : ''}</p>`;
    const temPontosRota = !!row?.tem_rota_caixa;
    const rotaCaixa = row?.id && temPontosRota
      ? `<p class="speed-hint">Pontos de GPS usados na quilometragem do Caixa (00h às 04h): <button type="button" class="fora-horario-link-btn" data-ver-rota data-id="${escapeHtml(row.id)}">ver pontos</button></p>`
      : '';

    return `
      <div class="fh-dossie-topo">
        ${fhBadgesHtml(dos)}
        <span class="fh-dossie-quem">${[dos.supervisao, dos.coordenacao].filter(Boolean).map(escapeHtml).join(' · ')}</span>
      </div>
      <h2 class="fh-m-manchete">${escapeHtml(fhManchete(dos))}</h2>
      <p class="fh-m-sub">${escapeHtml(fhDiaSemana(dos.data_evento))}, ${escapeHtml(formatDateBR(dos.data_evento))} · ${escapeHtml(contexto)}</p>
      ${fhBarraHtml(dos, det)}
      <h4 class="fh-h4">O que chama atenção</h4>
      ${motivos}${aviso}
      <h4 class="fh-h4">Trajetos para conferir</h4>
      ${fhPercursosHtml(dos, det)}
      ${fhExcessosHtml(dos, det)}
      <details class="fh-metodo"><summary>Como chegamos nesses números</summary>
        <div class="fh-passos">${passos.map((p) => `<div class="fh-passo"><b>${escapeHtml(p.titulo)}</b><span>${escapeHtml(p.texto)}</span></div>`).join('')}</div>
        ${pernoite}${rotaCaixa}
        <details class="fh-metodo fh-interno"><summary>Registros de trabalho usados (${(det.evidencias || []).length})</summary>${fhRegistrosHtml(dos, det)}</details>
        <details class="fh-metodo fh-interno"><summary>Regras do cálculo</summary>
          <ul>
            <li><strong>Trabalho registrado:</strong> informativos do colaborador no Mapa de Embarque, check-in e check-out da produção diária e sinais de GPS do celular (app GRM). O que foi registrado em casa não conta.</li>
            <li><strong>Horário permitido:</strong> do primeiro registro (menos o tempo de ida) até o último registro (mais o tempo de volta), com ${Number(dos.tolerancia_min) || 20} min de folga. O tempo de ida e de volta é estimado pela distância em linha reta entre a casa e o local × ${escapeHtml(det.fator_rota ?? 1.4)} ÷ ${escapeHtml(det.vel_media_kmh ?? 60)} km/h.</li>
            <li><strong>Programação do dia:</strong> se o condutor ou um colega de carona estiver escalado em uma O.S., a chegada ou a saída do veículo a menos de 2 km do local dessa O.S. conta como trabalho; o mesmo vale para uma parada a menos de 1,5 km da casa cadastrada do colega de carona.</li>
            <li><strong>Pouco registro no dia</strong> (menos de 3 registros, ou menos de 3 h entre o primeiro e o último): o horário é ampliado para 05:30 às 20:00 (seg a sáb). Sem nenhum registro vale esse horário padrão; domingo sem registro, todo uso conta como fora do horário.</li>
            <li><strong>Fora do horário</strong> (vermelho): 25 km ou mais fora do horário permitido, 2 h ou mais, 5 km ou mais à noite (22h às 5h) ou 5 km ou mais depois de chegar em casa. <strong>Para conferir</strong> (amarelo): 5 km ou mais, algum km à noite, percurso bem mais longo que o direto ou chegada em casa com mais de 1 h de atraso.</li>
            <li>Quando uma viagem passa do limite, só a parte depois do limite conta (proporcional ao tempo).</li>
            <li><strong>Trajeto sem justificativa:</strong> a viagem não chega a uma O.S. programada (a menos de 3 km), à casa de um colega de carona, a um local onde houve registro de trabalho nem a um posto ou oficina, e o conjunto de trechos soltos entre dois desses locais passa de 1,6 vez o trajeto direto mais 5 km. <strong>Uso indevido</strong> (roxo): 40 km ou mais sem justificativa e pelo menos 25% do que o veículo rodou no dia. <strong>Para conferir</strong>: 15 km ou mais. Sem nenhum local conhecido no dia, o resultado nunca passa de "para conferir".</li>
            <li><strong>Excesso de velocidade:</strong> registros do rastreador (BFleet/Infleet) no dia da placa; contam como fora do horário quando acontecem depois da janela permitida e como "sem justificativa" quando estavam num trajeto sem justificativa.</li>
          </ul>
        </details>
      </details>`;
  }

  async function openDossieModal(root, opts, chave) {
    const modal = root.querySelector('[data-dossie-modal]');
    if (!modal) return;
    const row = (state.foraHorario || []).find((item) => fhChave(item) === chave);
    if (!row?.dossie) { toast('Dossiê não disponível para esta ocorrência.', 'error'); return; }

    const tituloEl = modal.querySelector('[data-dossie-title]');
    const corpoEl = modal.querySelector('[data-dossie-body]');
    const copiarBtn = modal.querySelector('[data-dossie-copiar]');
    if (tituloEl) tituloEl.textContent = `${fhTitulo(row.motorista) || 'Colaborador não identificado'} · ${onlyPlate(row.placa)}`;
    if (corpoEl) corpoEl.innerHTML = '<div class="speed-import-empty">Carregando detalhes...</div>';
    const rotaBtn = modal.querySelector('[data-dossie-rota]');
    if (copiarBtn) copiarBtn.hidden = true;
    if (rotaBtn) rotaBtn.hidden = true;
    state.foraHorarioDossieAberto = null;
    state.foraHorarioDossieChave = chave;
    atualizarRodapeDossie(root);
    fhLiberarAncestrais(root);
    modal.hidden = false;
    fhEnquadrarJanela(modal);
    modal.querySelector('.speed-modal')?.focus({ preventScroll: true });

    try {
      const supabase = resolveSupabase(opts);
      const { data, error } = await supabase
        .from('frotas_fora_horario_dossie')
        .select('*')
        .eq('data_evento', row.data_evento)
        .eq('placa', row.dossie.placa)
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('Dossiê não encontrado. Recalcule o período.');
      state.foraHorarioDossieAberto = data;
      await fhAtualizarStatusExcessos(supabase, data);
      if (corpoEl) corpoEl.innerHTML = renderDossieHtml(data, row);
      if (copiarBtn) copiarBtn.hidden = false;
      if (rotaBtn) rotaBtn.hidden = false;
    } catch (err) {
      console.error('[FROTAS] Dossiê fora do horário:', err);
      if (corpoEl) corpoEl.innerHTML = `<div class="speed-import-empty">${escapeHtml(err.message || 'Não foi possível carregar o dossiê.')}</div>`;
    }
  }

  function formatCoordForaHorario(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n.toFixed(6) : '-';
  }

  async function openRotaModal(root, rowId, opts = currentRenderOpts) {
    const row = (state.foraHorario || []).find((item) => String(item.id) === String(rowId));
    if (!row) return toast('Ocorrência não localizada.', 'error');

    const modal = root.querySelector('[data-rota-modal]');
    if (!modal) return;
    const titleEl = modal.querySelector('[data-rota-modal-title]');
    const kmEl = modal.querySelector('[data-rota-modal-km]');
    const hintEl = modal.querySelector('[data-rota-modal-hint]');
    const bodyEl = modal.querySelector('[data-rota-modal-body]');
    const linkEl = modal.querySelector('[data-rota-modal-link]');

    const placa = onlyPlate(row.placa) || '-';
    const data = formatDateBR(row.data_evento) || '-';
    if (titleEl) titleEl.textContent = `Rota 00h–04h do Caixa · ${placa} · ${data}`;
    if (kmEl) kmEl.textContent = `${formatKmForaHorario(Number(row.km_00_05 || 0))} km (00h–04h)`;
    if (linkEl) linkEl.hidden = true;
    if (hintEl) hintEl.textContent = '';
    if (bodyEl) bodyEl.innerHTML = '<tr><td colspan="5" class="speed-import-empty">Carregando rota...</td></tr>';
    fhLiberarAncestrais(root);
    modal.hidden = false;
    fhEnquadrarJanela(modal);

    // O detalhe do cálculo é pesado: fica fora da lista e só é lido aqui.
    let detalhes = null;
    let mapaUrl = '';
    try {
      const supabase = resolveSupabase(opts);
      const { data: ocorrencia, error } = await supabase
        .from('frotas_fora_horario_ocorrencias').select('calculo_detalhes,mapa_url').eq('id', rowId).maybeSingle();
      if (error) throw error;
      detalhes = ocorrencia?.calculo_detalhes || null;
      mapaUrl = ocorrencia?.mapa_url || '';
    } catch (err) {
      console.warn('[FROTAS] Rota do Caixa:', err);
    }
    if (linkEl && mapaUrl) { linkEl.href = mapaUrl; linkEl.hidden = false; }

    const pontos = detalhes?.history?.rota || [];
    const trechos = detalhes?.fallback_relatorio?.trechos || [];

    if (bodyEl) {
      if (pontos.length) {
        if (hintEl) hintEl.textContent = `${pontos.length} ponto(s) de GPS registrados entre 00h e 04h, na ordem em que ocorreram.`;
        bodyEl.innerHTML = pontos.map((p) => `<tr>
          <td><strong>${escapeHtml(String(p.hora || '--:--:--'))}</strong></td>
          <td>${escapeHtml(p.endereco || '-')}</td>
          <td>${escapeHtml(formatCoordForaHorario(p.latitude))}</td>
          <td>${escapeHtml(formatCoordForaHorario(p.longitude))}</td>
          <td>${Number.isFinite(Number(p.velocidade)) ? Number(p.velocidade).toFixed(0) : '-'}</td>
        </tr>`).join('');
      } else if (trechos.length) {
        if (hintEl) hintEl.textContent = 'Sem GPS detalhado da RedGPS para esta ocorrência; km estimado por trecho a partir do relatório BFleet.';
        bodyEl.innerHTML = trechos.map((t) => `<tr>
          <td colspan="4"><strong>${escapeHtml(t.inicio || '--:--:--')} → ${escapeHtml(t.fim || '--:--:--')}</strong></td>
          <td>${formatKmForaHorario(Number(t.km_proporcional_00_04 || 0))} km</td>
        </tr>`).join('');
      } else {
        if (hintEl) hintEl.textContent = 'Nenhum ponto de rota disponível para esta ocorrência.';
        bodyEl.innerHTML = '<tr><td colspan="5" class="speed-import-empty">Sem dados de rota.</td></tr>';
      }
    }
  }

  async function markSelectedImportedGroupAsGenerated(root, opts, message) {
    const key = state.selectedImportedGroupKey;
    if (!key) return;
    rememberGeneratedGroup(key);

    const selectedRows = state.importedExcessos.filter((row) => {
      const placa = onlyPlate(row.placa);
      const motorista = getDriverFromExcesso(row);
      const rowKey = `${normalizeName(motorista) || 'SEM MOTORISTA'}|${placa}`;
      return rowKey === key;
    });

    selectedRows.forEach((row) => {
      row.status_notificacao = 'GERADA';
      row.mensagem_gerada = message;
    });
    renderImportedExcessos(root);

    const ids = selectedRows.map((row) => row.id).filter(Boolean);
    const supabase = resolveSupabase(opts);
    if (!ids.length || !supabase || typeof supabase.from !== 'function') return;

    try {
      const payload = {
        status_notificacao: 'GERADA',
        mensagem_gerada: message,
        notificado_em: new Date().toISOString()
      };
      const userId = getCurrentUserId();
      const userName = getCurrentUserName();
      if (userId) payload.notificado_por = userId;
      if (userName) payload.notificado_por_nome = userName;

      const { error } = await supabase
        .from('frotas_excesso_velocidade')
        .update(payload)
        .in('id', ids);
      if (error) throw error;
    } catch (err) {
      console.warn('[FROTAS] Não foi possível atualizar status da notificação importada:', err);
    }
  }

  function buildMessage({ nome, placa, registros, cidadeData }) {
    const nomeFinal = normalizeName(nome);
    const placaFinal = onlyPlate(placa);
    const registrosValidos = dedupeHighestSpeedByDate(registros.map((r) => ({ data: formatDateBR(r.data), velocidade: parseSpeed(r.velocidade) })).filter((r) => r.data && r.velocidade));
    const linhas = registrosValidos.map((r) => `* ${formatDateBR(r.data)} – ${r.velocidade} km/h`).join('\n');
    return `${nomeFinal},\n\nConstatamos, por meio do sistema de rastreamento da frota, que V.S. excedeu de forma recorrente o limite máximo de velocidade permitido (120 km/h), conduzindo o veículo de placa ${placaFinal}, conforme registros abaixo:\n\n${linhas}\n\nOs registros demonstram reincidência contínua na prática de excesso de velocidade, ainda que com variações moderadas acima do limite permitido, evidenciando a necessidade de maior atenção e adequação imediata por parte do condutor.\n\nRessaltamos que o excesso de velocidade configura descumprimento das normas de trânsito e das diretrizes internas da empresa, podendo gerar riscos à segurança do próprio condutor, de terceiros e ao patrimônio da organização.\n\nDiante disso, reforçamos que é indispensável o cumprimento rigoroso dos limites estabelecidos e das políticas internas de condução segura.\n\nSolicitamos atenção redobrada quanto à condução do veículo, evitando novos registros e possíveis medidas administrativas futuras.\n\n${cidadeData}.`;
  }

  function validateForm(root) {
    const nomeRaw = root.querySelector('[data-speed-name]')?.value || '';
    const nome = isUnknownDriverName(nomeRaw) ? '' : nomeRaw;
    const placa = root.querySelector('[data-speed-plate]')?.value || '';
    const cidadeData = root.querySelector('[data-speed-city-date]')?.value || '';
    const registros = Array.from(root.querySelectorAll('[data-speed-record]')).map((row) => ({ data: row.querySelector('[data-speed-date]')?.value || '', velocidade: row.querySelector('[data-speed-value]')?.value || '' }));
    if (!nome.trim()) return { ok: false, message: 'Selecione ou informe o colaborador.' };
    if (!onlyPlate(placa) || onlyPlate(placa).length < 7) return { ok: false, message: 'Preencha uma placa válida com 7 caracteres.' };
    if (!cidadeData.trim()) return { ok: false, message: 'Preencha a cidade e data do documento.' };
    const validRecords = registros.filter((r) => r.data && parseSpeed(r.velocidade));
    if (!validRecords.length) return { ok: false, message: 'Informe pelo menos uma data e velocidade.' };
    return { ok: true, payload: { nome, placa, cidadeData, registros: validRecords } };
  }

  async function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text);
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.left = '-9999px'; document.body.appendChild(ta); ta.focus(); ta.select();
    const ok = document.execCommand('copy'); document.body.removeChild(ta); if (!ok) throw new Error('Falha ao copiar.');
  }

  function toast(message, type = 'success') {
    let el = document.querySelector('.speed-toast');
    if (!el) { el = document.createElement('div'); el.className = 'speed-toast'; document.body.appendChild(el); }
    el.textContent = message;
    el.style.background = type === 'error' ? 'rgba(127,29,29,.96)' : 'rgba(22,101,52,.96)';
    el.classList.add('show'); window.setTimeout(() => el.classList.remove('show'), 3000);
  }

  function syncRecordsFromDom(root) {
    state.records = Array.from(root.querySelectorAll('[data-speed-record]')).map((row) => ({ data: row.querySelector('[data-speed-date]')?.value || '', velocidade: row.querySelector('[data-speed-value]')?.value || '' }));
    if (!state.records.length) state.records = [{ data: '', velocidade: '' }];
  }

  function renderRecords(root) {
    const list = root.querySelector('[data-speed-records]');
    if (!list) return;
    list.innerHTML = state.records.map((record, index) => `
      <div class="speed-row" data-speed-record data-index="${index}">
        <div class="speed-field"><label>Data</label><input class="speed-input" type="date" data-speed-date value="${escapeHtml(record.data)}"></div>
        <div class="speed-field"><label>Velocidade</label><input class="speed-input" type="number" min="1" step="1" placeholder="123" data-speed-value value="${escapeHtml(record.velocidade)}"></div>
        <button class="speed-btn speed-btn-danger" type="button" title="Remover registro" data-remove-record="${index}">×</button>
      </div>`).join('');
    bindRecordEvents(root);
  }

  function bindRecordEvents(root) {
    root.querySelectorAll('[data-speed-date], [data-speed-value]').forEach((input) => input.addEventListener('input', () => syncRecordsFromDom(root)));
    root.querySelectorAll('[data-remove-record]').forEach((btn) => btn.addEventListener('click', () => {
      syncRecordsFromDom(root);
      state.records.splice(Number(btn.getAttribute('data-remove-record')), 1);
      if (!state.records.length) state.records.push({ data: '', velocidade: '' });
      renderRecords(root);
    }));
  }

  function renderUploadLists(root) {
    const selected = root.querySelector('[data-upload-list]');
    if (selected) {
      selected.innerHTML = state.uploadedFiles.length ? state.uploadedFiles.map((f, index) => `<div class="upload-item"><span><strong>${escapeHtml(f.name || f.__displayName || 'print.png')}</strong><br>${Math.round(f.size / 1024)} KB · ${escapeHtml(f.__source || 'selecionado')}</span><button class="speed-btn speed-btn-danger" type="button" data-remove-upload="${index}" title="Remover print">×</button></div>`).join('') : '<div class="speed-import-empty">Nenhum print adicionado ainda.</div>';
      selected.querySelectorAll('[data-remove-upload]').forEach((btn) => btn.addEventListener('click', () => {
        state.uploadedFiles.splice(Number(btn.getAttribute('data-remove-upload')), 1);
        renderUploadLists(root);
      }));
    }
    const saved = root.querySelector('[data-saved-list]');
    if (saved) {
      saved.innerHTML = state.savedPrints.length ? state.savedPrints.map((f) => {
        const driverName = getPossibleFileDriverName(f);
        const rawFolder = f.driverFolderName || f.folderName || '';
        const folderIsInvalid = isUnknownDriverName(rawFolder) || isNotificationTitleLike(rawFolder);
        const folderName = driverName || (folderIsInvalid ? 'OCR - CONFERIR' : rawFolder);
        const notificationNumber = getFileNotificationNumber(f);
        const notificationLine = notificationNumber ? `<br>Nº notificação: ${escapeHtml(notificationNumber)}` : '';
        const previewRaw = String(f.ocrPreview || f.ocrText || '').trim();
        const preview = previewRaw ? `<br><small>OCR usado: ${escapeHtml(f.ocrVariantUsed || f.ocrVariant || f.browserOcrSource || 'imagem tratada')} · Prévia: ${escapeHtml(previewRaw.slice(0, 320))}${previewRaw.length > 320 ? '...' : ''}</small>` : '<br><small>OCR vazio: nem o navegador nem o Drive retornaram texto útil.</small>';
        const extra = driverName && folderIsInvalid
          ? '<br><small>Motorista identificado pelo OCR do print. A pasta exibida foi corrigida para o nome do motorista.</small>'
          : (folderIsInvalid ? '<br><small>OCR ainda não retornou motorista válido para este arquivo.</small>' : '');
        return `<div class="saved-item"><strong>${escapeHtml(f.fileName || 'Print salvo')}</strong><br>Pasta: ${escapeHtml(folderName)}${notificationLine}${extra}${preview}${f.fileUrl ? `<br><a href="${escapeHtml(f.fileUrl)}" target="_blank" rel="noopener">Abrir no Drive</a>` : ''}</div>`;
      }).join('') : '';
    }
  }

  function applyOcrResult(root, result) {
    const data = normalizeOcrResponse(result);
    const placa = onlyPlate(data.placa || data.vehiclePlate || '');
    if (placa) {
      const plateInput = root.querySelector('[data-speed-plate]');
      if (plateInput && !plateInput.value) plateInput.value = placa;
    }

    const registros = Array.isArray(data.registros) ? data.registros : [];
    const parsedRecords = registros.map((r) => ({ data: toInputDate(r.data || r.date), velocidade: parseSpeed(r.velocidade || r.speed) })).filter((r) => r.data && r.velocidade);
    if (parsedRecords.length) {
      syncRecordsFromDom(root);
      const existing = state.records.filter((r) => r.data && r.velocidade);
      state.records = dedupeHighestSpeedByDate([...existing, ...parsedRecords]).map((r) => ({ data: toInputDate(r.data) || r.data, velocidade: r.velocidade }));
      renderRecords(root);
    }

    if (Array.isArray(data.files)) {
      const normalizedFiles = data.files.map((file) => normalizeSavedPrintFileResult(file));
      state.savedPrints = [...normalizedFiles, ...state.savedPrints];
      renderUploadLists(root);
    }
  }

  function normalizeDateForMatch(value) {
    const br = formatDateBR(value);
    const m = br.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    return m ? `${m[3]}-${m[2]}-${m[1]}` : String(value || '').slice(0, 10);
  }

  function localInputDate(date = new Date()) {
    const d = new Date(date);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  function yesterdayInputDate() {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return localInputDate(d);
  }

  function setImportedDateFilter(start, end, label = '') {
    const s = normalizeDateForMatch(start);
    const e = normalizeDateForMatch(end || start);
    if (!s || !e) {
      state.activeImportedDateFilter = null;
      return;
    }
    state.activeImportedDateFilter = {
      start: s <= e ? s : e,
      end: s <= e ? e : s,
      label: label || (s === e ? formatDateBR(s) : `${formatDateBR(s)} a ${formatDateBR(e)}`)
    };
  }

  function clearImportedDateFilter() {
    state.activeImportedDateFilter = null;
  }

  function normalizeTextForOcrMatch(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toUpperCase()
      .replace(/[^A-Z0-9\s/.-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
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

  function getGroupKeyFromRow(row) {
    const placa = onlyPlate(row?.placa || '');
    const motorista = getDriverFromExcesso(row);
    return `${normalizeName(motorista) || 'SEM MOTORISTA'}|${placa}`;
  }

  function rowBelongsToGeneratedGroup(row) {
    // Mantido apenas para compatibilidade visual com o status GERADA/COPIADA.
    // O arquivamento por print NÃO depende mais deste status.
    const status = String(row?.status_notificacao || '').toUpperCase();
    return status === 'GERADA' || state.generatedImportedGroupKeys.has(getGroupKeyFromRow(row));
  }

  async function persistOcrJob(supabase, plan, notificationDate) {
    const file = plan.file || {};
    const userId = getCurrentUserId();
    const payload = {
      arquivo_id: String(file.fileId || file.id || '') || null,
      arquivo_nome: String(file.fileName || file.name || 'Print sem nome'),
      arquivo_url: String(file.fileUrl || file.url || '') || null,
      data_notificacao: normalizeDateForMatch(notificationDate) || null,
      placa_ocr: plan.plate || null,
      motorista_ocr: getPossibleFileDriverName(file) || null,
      registros_ocr: plan.records,
      resposta_ocr: file,
      status: plan.status,
      ids_correspondentes: plan.matches.map((item) => item.row.id),
      candidatos_ambiguos: plan.ambiguous,
      motivo: plan.matches[0]?.reason || (plan.ambiguous.length ? 'mais_de_um_candidato' : 'sem_evidencia_suficiente')
    };
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(userId || ''))) payload.criado_por = userId;
    const { data, error } = await supabase.from('frotas_print_ocr_execucoes').insert(payload).select('id').single();
    if (error) throw new Error(`Não foi possível registrar a auditoria do print: ${error.message}`);
    return data.id;
  }

  async function archiveMatchedImportedRowsFromOcr(root, files, notificationDate) {
    const supabase = window.supabase;
    const savedFiles = Array.isArray(files) ? files : [];
    if (!savedFiles.length || !supabase || typeof supabase.from !== 'function') return { archivedCount: 0, reviewCount: 0 };

    const openRows = (state.importedExcessos || []).filter((row) => {
      const status = String(row.status_notificacao || '').toUpperCase();
      return status === 'PENDENTE' || status === 'GERADA';
    });
    const plans = buildOcrReconciliationPlan({
      files: savedFiles,
      openRows,
      helpers: {
        getPlate: getPossibleFilePlate,
        getNotification: getFileNotificationNumber,
        getMatchedIds: getFileMatchedIds,
        rowNotification: rowNotificationNumber,
        getTextRecords: (file) => extractOcrRecordsFromText(getOcrTextFromFileResult(file))
      },
      speedTolerance: 1
    });
    const nowIso = new Date().toISOString();
    const userId = getCurrentUserId();
    const userName = getCurrentUserName();
    let archivedCount = 0;
    let reviewCount = 0;
    const archivedIds = new Set();
    try {
      for (const plan of plans) {
        const executionId = await persistOcrJob(supabase, plan, notificationDate);
        const ids = plan.matches.map((item) => item.row.id);
        if (!ids.length) { reviewCount += 1; continue; }
        const file = plan.file || {};
        const payload = {
          status_notificacao: 'NOTIFICADO',
          notificado_em: nowIso,
          observacoes: `Arquivado automaticamente por OCR auditável #${executionId}. Motivo: ${plan.matches[0].reason}. Arquivo: ${file.fileName || file.fileUrl || 'print salvo no Drive'}`
        };
        if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(userId || ''))) payload.notificado_por = userId;
        if (userName) payload.notificado_por_nome = userName;
        const { data: updated, error } = await supabase.from('frotas_excesso_velocidade')
          .update(payload).in('id', ids).in('status_notificacao', ['PENDENTE', 'GERADA']).select('id');
        if (error) throw error;
        (updated || []).forEach((row) => archivedIds.add(String(row.id)));
        archivedCount += (updated || []).length;
        const { error: auditError } = await supabase.from('frotas_print_ocr_execucoes').update({
          status: (updated || []).length === ids.length ? 'ARQUIVADO' : 'CONFLITO_CONCORRENCIA',
          ids_arquivados: (updated || []).map((row) => row.id),
          processado_em: new Date().toISOString()
        }).eq('id', executionId);
        if (auditError) console.warn('[FROTAS] Ocorrência baixada, mas a finalização da auditoria falhou:', auditError);
      }
      state.importedExcessos.forEach((row) => {
        if (archivedIds.has(String(row.id))) row.status_notificacao = 'NOTIFICADO';
      });
      renderImportedExcessos(root);
      if (archivedCount) toast(`${archivedCount} registro(s) arquivado(s) com auditoria do OCR.${reviewCount ? ` ${reviewCount} print(s) ficaram para conferência.` : ''}`);
      else toast(`${reviewCount || plans.length} print(s) registrado(s) para conferência. Nenhuma ocorrência foi baixada sem evidência suficiente.`, 'error');
      return { archivedCount, reviewCount };
    } catch (err) {
      console.warn('[FROTAS] Falha ao arquivar registros após envio do print:', err);
      throw err;
    }
  }

  function toInputDate(value) {
    const br = formatDateBR(value);
    const m = br.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    return m ? `${m[3]}-${m[2]}-${m[1]}` : '';
  }

  async function uploadPrints(root) {
    const urlInput = root.querySelector('[data-gas-url]');
    const gasUrl = String(urlInput?.value || state.gasUrl || DEFAULT_GAS_URL).trim();
    const dataNotificacao = root.querySelector('[data-notification-date]')?.value || todayBRShort();

    if (!gasUrl) return toast('Informe a URL do Web App do Apps Script.', 'error');
    if (!state.uploadedFiles.length) return toast('Selecione ao menos um print para enviar.', 'error');

    state.gasUrl = gasUrl;

    const btn = root.querySelector('[data-upload-prints]');
    if (btn) { btn.disabled = true; btn.textContent = 'Lendo prints por OCR no navegador e Drive...'; }

    try {
      if (!state.colaboradoresLoaded) {
        await loadColaboradoresFromSupabase(root, currentRenderOpts);
      }
      const driverMap = buildPrintDriverMap();
      const knownDrivers = buildKnownDriversForOcr(currentRenderOpts);
      const files = [];
      for (const file of state.uploadedFiles) {
        const originalBase64 = await fileToBase64(file);
        const ocrVariants = await fileToOcrBase64Variants(file);
        const browserOcr = await runBrowserOcrWithTesseract(file, ocrVariants);
        files.push({
          name: file.name || file.__displayName || `print-${Date.now()}.png`,
          mimeType: file.type || 'image/png',
          base64: originalBase64,
          ocrBase64: ocrVariants[0]?.base64 || '',
          ocrVariants,
          browserOcrText: browserOcr.text || '',
          browserOcrSource: browserOcr.source || '',
          ocrTextHint: browserOcr.text || ''
        });
      }

      const resp = await fetch(gasUrl, {
        method: 'POST',
        mode: 'cors',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'upload_excesso_velocidade',
          parentFolderId: PASTA_MAE_DRIVE_ID,
          // Processo 2 100% independente do Painel 1:
          // não envia motorista/placa selecionados, para o print nunca ficar preso à mensagem copiada.
          // Não deixar o Apps Script cair no fallback antigo "MOTORISTA NAO IDENTIFICADO".
          // A pasta final deve ser definida pelo OCR; se não identificar, cai em conferência.
          driverName: '',
          driverFolderName: 'OCR - CONFERIR',
          folderName: 'OCR - CONFERIR',
          targetFolderName: 'OCR - CONFERIR',
          fallbackFolderName: 'OCR - CONFERIR',
          defaultFolderName: 'OCR - CONFERIR',
          plate: '',
          selectedDriverName: '',
          selectedPlate: '',
          processMode: 'OCR_ONLY_INDEPENDENT',
          autoRouteByOcr: true,
          routeByOcrDriverName: true,
          ocrOnlyIndependent: true,
          ignoreSelectedSuggestion: true,
          ignoreCopiedMessage: true,
          ignoreFileNameAsDriver: true,
          preventFolderFromFileName: true,
          rejectGenericDriverName: true,
          rejectNotificationTitleAsDriver: true,
          requireOcrBeforeFolder: true,
          folderFallbackMode: 'OCR_CONFERIR_ONLY',
          saveUnknownDriverFolder: false,
          unknownDriverFolderName: 'OCR - CONFERIR',
          unknownFolderName: 'OCR - CONFERIR',
          ocrReviewFolderName: 'OCR - CONFERIR',
          identifyDriverIndependentOfPanel1: true,
          blockFolderNames: ['MOTORISTA NAO IDENTIFICADO', 'MOTORISTA NÃO IDENTIFICADO'],
          forceUnknownToReviewFolder: true,
          driverNameRegexHints: [
            '^(.*?)\\s*,\\s*Constatamos',
            '^(.*?)\\s*,\\s*comunicamos',
            '^(.*?)\\s*,\\s*identificamos'
          ],
          notificationDate: formatDateBR(dataNotificacao),
          filePrefixDate: brDateToFilePrefix(dataNotificacao),
          fileNamingPattern: 'ordinal_notification_year_driver',
          driverMap,
          knownDrivers,
          files
        })
      });
      const json = await resp.json();
      if (!json.ok) throw new Error(json.message || 'Falha ao processar prints.');
      applyOcrResult(root, json);
      const ocrData = normalizeOcrResponse(json);
      const reconciliation = await archiveMatchedImportedRowsFromOcr(root, ocrData.files.map((file) => normalizeSavedPrintFileResult(file)), dataNotificacao);
      state.uploadedFiles = [];
      const input = root.querySelector('[data-print-files]');
      if (input) input.value = '';
      renderUploadLists(root);
      if (!reconciliation?.archivedCount) toast('Prints salvos no Drive e mantidos na fila de conferência.');
    } catch (err) {
      console.error('[FROTAS] Upload/OCR:', err);
      toast(err.message || 'Erro ao enviar prints.', 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Enviar prints e conferir por OCR'; }
    }
  }



  const HISTORICO_TABLES = {
    excessos: 'frotas_excesso_velocidade',
    multas: 'frotas_multas',
    manutencoes: ['frotas_manutencoes', 'frotas_manutencao', 'manutencoes_frotas', 'frotas_ordens_manutencao']
  };

  const historicoState = {
    loaded: false,
    loading: false,
    error: '',
    rows: [],
    busca: '',
    tipo: 'todos',
    start: '',
    end: ''
  };

  function firstValue(obj, keys = []) {
    for (const key of keys) {
      const value = obj?.[key];
      if (value !== undefined && value !== null && String(value).trim() !== '') return value;
    }
    return '';
  }

  function formatMoneyBR(value) {
    const n = Number(String(value ?? '').replace(/[^0-9,.-]/g, '').replace('.', '').replace(',', '.'));
    if (!Number.isFinite(n) || n === 0) return '';
    return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  function getHistoricoColaborador(row, fallback = '') {
    return normalizeName(firstValue(row, [
      'colaborador', 'nome_colaborador', 'funcionario', 'funcionário', 'motorista', 'motorista_atual',
      'motorista_planilha', 'patrimonio_funcionario', 'condutor', 'nome_condutor', 'condutor_nome',
      'motorista_indicado', 'responsavel', 'responsável', 'solicitante'
    ]) || fallback || 'MOTORISTA NÃO IDENTIFICADO');
  }

  function getHistoricoDate(row, keys = []) {
    const value = firstValue(row, keys.concat(['data', 'data_evento', 'data_infracao', 'data_manutencao', 'created_at']));
    return normalizeDateForMatch(value) || '';
  }

  function normalizeHistoricoExcesso(row) {
    const motorista = getHistoricoColaborador(row);
    const data = getHistoricoDate(row, ['data_evento']);
    const velocidade = parseSpeed(row.velocidade);
    return {
      id: `excesso-${row.id || `${row.placa}-${data}-${row.hora_evento || ''}`}`,
      tipo: 'excesso',
      tipoLabel: 'Excesso de velocidade',
      colaborador: motorista,
      placa: onlyPlate(row.placa || row.patrimonio_codigo),
      data,
      hora: row.hora_evento || '',
      titulo: velocidade ? `${velocidade} km/h` : 'Excesso registrado',
      detalhes: [row.endereco, row.coordenacao, row.supervisao].filter(Boolean).join(' · '),
      status: row.status_notificacao || row.status_cruzamento || 'PENDENTE',
      valor: '',
      raw: row
    };
  }

  function normalizeHistoricoMulta(row) {
    const motorista = getHistoricoColaborador(row);
    const data = getHistoricoDate(row, ['data_infracao', 'data_multa', 'data_vencimento']);
    const valor = formatMoneyBR(firstValue(row, ['valor_original', 'valor', 'valor_multa', 'valor_atualizado']));
    return {
      id: `multa-${row.id || row.numero_auto_infracao || `${row.placa}-${data}`}`,
      tipo: 'multa',
      tipoLabel: 'Multa',
      colaborador: motorista,
      placa: onlyPlate(row.placa),
      data,
      hora: '',
      titulo: firstValue(row, ['descricao', 'descrição', 'infracao', 'infração', 'numero_auto_infracao', 'auto']) || 'Multa registrada',
      detalhes: [row.local, row.empresa, row.renavam].filter(Boolean).join(' · '),
      status: row.status_multa || row.situacao || row.status || 'A PAGAR',
      valor,
      raw: row
    };
  }

  function normalizeHistoricoManutencao(row) {
    const motorista = getHistoricoColaborador(row);
    const data = getHistoricoDate(row, ['data_manutencao', 'data_servico', 'data_abertura', 'data_conclusao']);
    const valor = formatMoneyBR(firstValue(row, ['valor', 'valor_total', 'custo', 'custo_total']));
    return {
      id: `manutencao-${row.id || `${row.placa}-${data}-${row.created_at || ''}`}`,
      tipo: 'manutencao',
      tipoLabel: 'Manutenção',
      colaborador: motorista,
      placa: onlyPlate(row.placa || row.veiculo_placa),
      data,
      hora: firstValue(row, ['hora', 'hora_servico']),
      titulo: firstValue(row, ['tipo', 'servico', 'serviço', 'descricao', 'descrição']) || 'Manutenção registrada',
      detalhes: [row.oficina, row.fornecedor, row.observacoes, row.observação, row.status].filter(Boolean).join(' · '),
      status: row.status || row.situacao || row.etapa || 'REGISTRADO',
      valor,
      raw: row
    };
  }

  async function tryLoadTableRows(supabase, tableName, select = '*') {
    try {
      const { data, error } = await supabase.from(tableName).select(select).limit(5000);
      if (error) throw error;
      return Array.isArray(data) ? data : [];
    } catch (err) {
      console.warn(`[FROTAS] Histórico: tabela ${tableName} indisponível ou sem acesso.`, err?.message || err);
      return [];
    }
  }

  function filterHistoricoRows() {
    const busca = normalizeName(historicoState.busca);
    const tipo = historicoState.tipo || 'todos';
    const start = normalizeDateForMatch(historicoState.start);
    const end = normalizeDateForMatch(historicoState.end);
    const minDate = start && end ? (start <= end ? start : end) : (start || '');
    const maxDate = start && end ? (start <= end ? end : start) : (end || '');

    return historicoState.rows.filter((row) => {
      if (tipo !== 'todos' && row.tipo !== tipo) return false;
      if (minDate && row.data && row.data < minDate) return false;
      if (maxDate && row.data && row.data > maxDate) return false;
      if (busca) {
        const haystack = normalizeName([row.colaborador, row.placa, row.tipoLabel, row.titulo, row.detalhes, row.status].join(' '));
        if (!haystack.includes(busca)) return false;
      }
      return true;
    }).sort((a, b) => String(b.data || '').localeCompare(String(a.data || '')) || String(b.hora || '').localeCompare(String(a.hora || '')));
  }

  function groupHistoricoByColaborador(rows) {
    const by = new Map();
    rows.forEach((row) => {
      const key = row.colaborador || 'MOTORISTA NÃO IDENTIFICADO';
      if (!by.has(key)) by.set(key, { colaborador: key, rows: [], placas: new Set(), multas: 0, manutencoes: 0, excessos: 0, valorMultas: 0 });
      const group = by.get(key);
      group.rows.push(row);
      if (row.placa) group.placas.add(row.placa);
      if (row.tipo === 'multa') group.multas += 1;
      if (row.tipo === 'manutencao') group.manutencoes += 1;
      if (row.tipo === 'excesso') group.excessos += 1;
      const val = Number(String(row.valor || '').replace(/[^0-9,.-]/g, '').replace('.', '').replace(',', '.'));
      if (row.tipo === 'multa' && Number.isFinite(val)) group.valorMultas += val;
    });
    return Array.from(by.values()).sort((a, b) => a.colaborador.localeCompare(b.colaborador, 'pt-BR'));
  }

  function renderHistoricoContent(root) {
    const host = root.querySelector('[data-frotas-historico-content]');
    const count = root.querySelector('[data-historico-count]');
    const kpiColabs = root.querySelector('[data-hist-kpi-colabs]');
    const kpiExcessos = root.querySelector('[data-hist-kpi-excessos]');
    const kpiMultas = root.querySelector('[data-hist-kpi-multas]');
    const kpiManut = root.querySelector('[data-hist-kpi-manut]');
    if (!host) return;

    if (historicoState.loading) {
      host.innerHTML = '<div class="speed-import-empty">Carregando histórico de frotas...</div>';
      return;
    }
    if (historicoState.error) {
      host.innerHTML = `<div class="speed-import-empty">${escapeHtml(historicoState.error)}</div>`;
      return;
    }

    const rows = filterHistoricoRows();
    const groups = groupHistoricoByColaborador(rows);
    if (count) count.textContent = `${groups.length} colaborador(es) · ${rows.length} registro(s)`;
    if (kpiColabs) kpiColabs.textContent = groups.length;
    if (kpiExcessos) kpiExcessos.textContent = rows.filter((r) => r.tipo === 'excesso').length;
    if (kpiMultas) kpiMultas.textContent = rows.filter((r) => r.tipo === 'multa').length;
    if (kpiManut) kpiManut.textContent = rows.filter((r) => r.tipo === 'manutencao').length;

    if (!rows.length) {
      host.innerHTML = '<div class="speed-import-empty">Nenhum registro encontrado para os filtros selecionados.</div>';
      return;
    }

    host.innerHTML = groups.map((group) => {
      const rowsHtml = group.rows.slice(0, 80).map((row) => `
        <tr>
          <td>${escapeHtml(formatDateBR(row.data) || '—')}${row.hora ? `<br><small>${escapeHtml(row.hora)}</small>` : ''}</td>
          <td><span class="hist-badge ${escapeHtml(row.tipo)}">${escapeHtml(row.tipoLabel)}</span></td>
          <td><strong>${escapeHtml(row.placa || '—')}</strong></td>
          <td>${escapeHtml(row.titulo || '—')}${row.detalhes ? `<br><small>${escapeHtml(row.detalhes)}</small>` : ''}</td>
          <td>${escapeHtml(row.status || '—')}</td>
          <td>${escapeHtml(row.valor || '')}</td>
        </tr>`).join('');
      const hidden = group.rows.length > 80 ? `<p class="speed-hint">Mostrando os 80 registros mais recentes deste colaborador.</p>` : '';
      return `
        <article class="hist-card">
          <div class="hist-card-head">
            <div><h3>${escapeHtml(group.colaborador)}</h3><p>${escapeHtml(Array.from(group.placas).join(', ') || 'Sem placa vinculada')}</p></div>
            <div class="hist-mini-kpis"><span>${group.excessos} excesso(s)</span><span>${group.multas} multa(s)</span><span>${group.manutencoes} manutenção(ões)</span></div>
          </div>
          <div class="hist-table-wrap"><table class="hist-table"><thead><tr><th>Data</th><th>Tipo</th><th>Placa</th><th>Registro</th><th>Status</th><th>Valor</th></tr></thead><tbody>${rowsHtml}</tbody></table></div>${hidden}
        </article>`;
    }).join('');
  }

  async function loadHistoricoFrotas(root, opts = {}) {
    const supabase = resolveSupabase(opts);
    if (!supabase || typeof supabase.from !== 'function') {
      historicoState.error = 'Supabase não encontrado para carregar o histórico.';
      historicoState.loaded = true;
      renderHistoricoContent(root);
      return;
    }
    historicoState.loading = true;
    historicoState.error = '';
    renderHistoricoContent(root);
    try {
      const [excessos, multas] = await Promise.all([
        tryLoadTableRows(supabase, HISTORICO_TABLES.excessos, 'id,data_evento,hora_evento,placa,velocidade,endereco,motorista_planilha,patrimonio_funcionario,patrimonio_codigo,coordenacao,supervisao,status_cruzamento,status_notificacao,created_at'),
        tryLoadTableRows(supabase, HISTORICO_TABLES.multas, '*')
      ]);

      let manutencoes = [];
      for (const table of HISTORICO_TABLES.manutencoes) {
        manutencoes = await tryLoadTableRows(supabase, table, '*');
        if (manutencoes.length) break;
      }

      historicoState.rows = [
        ...excessos.map(normalizeHistoricoExcesso),
        ...multas.map(normalizeHistoricoMulta),
        ...manutencoes.map(normalizeHistoricoManutencao)
      ].filter((row) => row.colaborador || row.placa || row.titulo);
      historicoState.loaded = true;
    } catch (err) {
      console.warn('[FROTAS] Falha ao carregar histórico:', err);
      historicoState.error = err.message || 'Não foi possível carregar o histórico.';
    } finally {
      historicoState.loading = false;
      renderHistoricoContent(root);
    }
  }

  function renderHistoricoFrotas(container, opts = {}) {
    currentRenderOpts = opts || {};
    container.innerHTML = `${getStyles()}
      <section class="frotas-shell">
        <div class="frotas-header"><div><div class="frotas-kicker">Frotas · Histórico</div><h1 class="frotas-title">Histórico do Colaborador</h1><p class="frotas-subtitle">Agrupa automaticamente multas, manutenções e excessos de velocidade pelo colaborador atualmente registrado em cada ocorrência. Se o ADM alterar o colaborador em uma multa, manutenção ou excesso, o histórico passa a aparecer no novo colaborador no próximo carregamento.</p></div></div>
        <div class="frotas-card">
          <div class="frotas-body">
            <div class="hist-toolbar">
              <input class="speed-input" data-historico-search placeholder="Buscar por colaborador, placa, tipo, status...">
              <select class="speed-select" data-historico-tipo><option value="todos">Todos os tipos</option><option value="excesso">Excessos</option><option value="multa">Multas</option><option value="manutencao">Manutenções</option></select>
              <input class="speed-input" type="date" data-historico-start>
              <input class="speed-input" type="date" data-historico-end>
              <button class="speed-btn speed-btn-soft speed-btn-compact" type="button" data-historico-refresh>↻ Atualizar</button>
            </div>
            <div class="hist-kpi-grid"><div class="hist-kpi"><span>Colaboradores</span><strong data-hist-kpi-colabs>0</strong></div><div class="hist-kpi"><span>Excessos</span><strong data-hist-kpi-excessos>0</strong></div><div class="hist-kpi"><span>Multas</span><strong data-hist-kpi-multas>0</strong></div><div class="hist-kpi"><span>Manutenções</span><strong data-hist-kpi-manut>0</strong></div></div>
            <p class="speed-hint" data-historico-count>Carregando histórico...</p>
            <div class="hist-list" data-frotas-historico-content></div>
          </div>
        </div>
      </section>`;

    container.querySelector('[data-historico-refresh]')?.addEventListener('click', () => loadHistoricoFrotas(container, opts));
    container.querySelector('[data-historico-search]')?.addEventListener('input', (ev) => { historicoState.busca = ev.target.value; renderHistoricoContent(container); });
    container.querySelector('[data-historico-tipo]')?.addEventListener('change', (ev) => { historicoState.tipo = ev.target.value; renderHistoricoContent(container); });
    container.querySelector('[data-historico-start]')?.addEventListener('change', (ev) => { historicoState.start = ev.target.value; renderHistoricoContent(container); });
    container.querySelector('[data-historico-end]')?.addEventListener('change', (ev) => { historicoState.end = ev.target.value; renderHistoricoContent(container); });

    renderHistoricoContent(container);
    loadHistoricoFrotas(container, opts);
  }

  // ── INFLEET IMPORT ────────────────────────────────────────────────────────

  async function loadSheetJs() {
    if (window.XLSX && typeof window.XLSX.read === 'function') return true;
    return new Promise((resolve, reject) => {
      const existing = document.querySelector('script[data-sheetjs]');
      if (existing) { existing.addEventListener('load', () => resolve(Boolean(window.XLSX?.read)), { once: true }); return; }
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
      script.dataset.sheetjs = '1';
      script.onload = () => resolve(Boolean(window.XLSX?.read));
      script.onerror = () => reject(new Error('Falha ao carregar SheetJS. Verifique a conexão e tente novamente.'));
      document.head.appendChild(script);
    });
  }

  function infleetBrDateToISO(value) {
    const s = String(value || '').trim();
    const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    return m ? `${m[3]}-${m[2]}-${m[1]}` : s.slice(0, 10);
  }

  function makeInfleetHash(placa, dataEvento, horaEvento, velocidade) {
    return `INFLEET|${onlyPlate(placa)}|${String(dataEvento || '').slice(0, 10)}|${String(horaEvento || '').slice(0, 8)}|${Math.round(Number(velocidade) || 0)}`;
  }

  function parseInfleetSheet(workbook) {
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const raw = window.XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

    let headerRow = -1;
    for (let i = 0; i < Math.min(raw.length, 6); i++) {
      if ((raw[i] || []).some((cell) => /velocidade/i.test(String(cell || '')))) {
        headerRow = i;
        break;
      }
    }
    if (headerRow < 0) return { rows: [], skipped: 0, error: 'Cabeçalho não encontrado. Verifique se o arquivo é uma planilha Infleet válida.' };

    const headers = (raw[headerRow] || []).map((h) => String(h || '').trim());
    const idx = (pattern) => headers.findIndex((h) => pattern.test(h));

    const idxVeiculo    = idx(/ve.culo/i);
    const idxDia        = idx(/^dia$/i);
    const idxHora       = idx(/^hora$/i);
    const idxVelocidade = idx(/velocidade\s*km/i);
    const idxMotorista  = idx(/^motorista$/i);
    const idxEndereco   = idx(/endere.o/i);

    if (idxVeiculo < 0 || idxDia < 0 || idxVelocidade < 0) {
      return { rows: [], skipped: 0, error: 'Colunas obrigatórias (Veículo, Dia, Velocidade Km/h) não encontradas. Confirme que é a planilha Infleet correta.' };
    }

    const result = [];
    let skipped = 0;

    for (let i = headerRow + 1; i < raw.length; i++) {
      const row = raw[i] || [];
      const placa = onlyPlate(String(row[idxVeiculo] || ''));
      if (!placa) continue;

      const velRaw = Number(String(row[idxVelocidade] || '0').replace(',', '.'));
      if (!Number.isFinite(velRaw) || velRaw <= 120) { skipped++; continue; }

      const dataEvento = infleetBrDateToISO(String(row[idxDia] || ''));
      if (!dataEvento || dataEvento.length < 10) continue;

      const horaEvento  = String(row[idxHora] || '').trim();
      const velocidade  = Math.round(velRaw);
      const motorista   = idxMotorista  >= 0 ? (String(row[idxMotorista]  || '').trim() || null) : null;
      const endereco    = idxEndereco   >= 0 ? (String(row[idxEndereco]   || '').trim() || null) : null;

      result.push({
        placa,
        data_evento:       dataEvento,
        hora_evento:       horaEvento || null,
        velocidade,
        motorista_planilha: motorista,
        endereco,
        import_hash: makeInfleetHash(placa, dataEvento, horaEvento, velocidade)
      });
    }

    return { rows: result, skipped, error: null };
  }

  async function importInfleetExcel(root, file, opts = {}) {
    const sb = resolveSupabase(opts);
    const btn = root.querySelector('[data-infleet-import-btn]');
    const originalHtml = btn?.innerHTML ?? ICO_IMPORT;

    try {
      if (btn) { btn.disabled = true; btn.textContent = 'Carregando SheetJS...'; }
      await loadSheetJs();

      if (btn) btn.textContent = 'Lendo planilha...';
      const buffer = await file.arrayBuffer();
      const workbook = window.XLSX.read(new Uint8Array(buffer), { type: 'array' });
      const { rows, skipped, error } = parseInfleetSheet(workbook);

      if (error) { toast(error, 'error'); return; }
      if (!rows.length) {
        toast(`Nenhum registro com velocidade > 120 km/h encontrado.${skipped ? ` (${skipped} linha(s) ignoradas ≤ 120 km/h)` : ''}`, 'error');
        return;
      }

      if (btn) btn.textContent = 'Cruzando placas com patrimônios...';
      const uniquePlates = [...new Set(rows.map((r) => r.placa))];
      const veiculosMap = new Map();

      if (sb && typeof sb.from === 'function') {
        const { data: veiculos } = await sb
          .from('frotas_veiculos')
          .select('placa,motorista_atual,patrimonio_funcionario,coordenacao,supervisao')
          .in('placa', uniquePlates);
        (veiculos || []).forEach((v) => veiculosMap.set(onlyPlate(v.placa), v));
      }

      const enriched = rows.map((row) => {
        const v = veiculosMap.get(row.placa) || null;
        const motoristaCruzado = v?.motorista_atual || v?.patrimonio_funcionario || null;
        return {
          ...row,
          patrimonio_funcionario: motoristaCruzado,
          coordenacao: v?.coordenacao || null,
          supervisao:  v?.supervisao  || null,
          status_cruzamento:   motoristaCruzado ? 'MOTORISTA_IDENTIFICADO' : 'PENDENTE_CONFERENCIA',
          status_notificacao: 'PENDENTE'
        };
      });

      if (!sb || typeof sb.from !== 'function') {
        toast('Supabase não encontrado. Verifique a conexão.', 'error');
        return;
      }

      const CHUNK = 200;
      let totalOk = 0;
      let totalErr = 0;

      if (btn) btn.textContent = `Importando ${enriched.length} registro(s)...`;

      for (let i = 0; i < enriched.length; i += CHUNK) {
        const chunk = enriched.slice(i, i + CHUNK);
        const { error: upsertError } = await sb
          .from('frotas_excesso_velocidade')
          .upsert(chunk, { onConflict: 'import_hash', ignoreDuplicates: true });

        if (upsertError) {
          // import_hash pode não existir — tenta insert simples sem esse campo
          const sem = chunk.map(({ import_hash: _h, ...rest }) => rest);
          const { error: insertError } = await sb.from('frotas_excesso_velocidade').insert(sem);
          if (insertError) { console.warn('[FROTAS] Infleet insert fallback:', insertError); totalErr += chunk.length; }
          else totalOk += chunk.length;
        } else {
          totalOk += chunk.length;
        }
      }

      const identified = enriched.filter((r) => r.status_cruzamento === 'MOTORISTA_IDENTIFICADO').length;
      const msg = [
        `Infleet: ${rows.length} registro(s) acima de 120 km/h importado(s).`,
        `${identified} colaborador(es) identificado(s) pela placa.`,
        skipped  ? `${skipped} linha(s) ignoradas (≤ 120 km/h).`  : '',
        totalErr ? `${totalErr} registro(s) com erro ao salvar.`   : ''
      ].filter(Boolean).join(' ');

      toast(msg, totalErr ? 'error' : 'success');
      await fetchImportedExcessos(root, opts);
    } catch (err) {
      console.error('[FROTAS] Importar Infleet:', err);
      toast(err.message || 'Erro ao importar planilha Infleet.', 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.innerHTML = originalHtml; }
    }
  }

  // ── FIM INFLEET IMPORT ─────────────────────────────────────────────────────

  function renderExcessoVelocidade(container, opts = {}) {
    currentRenderOpts = opts || {};
    const colaboradores = getColaboradores(opts);
    container.innerHTML = `${getStyles()}
      <section class="frotas-shell">
        <div class="frotas-header"><div><div class="frotas-kicker">Frotas · Notificações</div><h1 class="frotas-title">Notificação</h1><p class="frotas-subtitle">O dossiê diário reúne, por veículo e por dia, o uso fora do horário, os trajetos sem justificativa e os excessos de velocidade. Na aba Notificar excessos, gere as mensagens em lote e envie os prints: o sistema identifica a placa/OCR e salva cada arquivo na pasta do motorista correspondente no Drive.</p></div></div>
        <div class="frotas-card">
          <div class="notif-subtabs" data-notif-subtabs><button class="notif-subtab active" type="button" data-notif-tab="fora_horario">Dossiê diário</button><button class="notif-subtab" type="button" data-notif-tab="excesso">Notificar excessos</button></div>
          <div class="frotas-body">
            <div data-notif-panel="excesso" hidden>
              <div class="speed-grid">
                <div class="speed-panel">
                  <div class="speed-step-title"><h3>Painel 1 · Copiar mensagem</h3><span class="speed-step-pill">maior velocidade por data</span></div>
                  <div class="speed-import-card">
                    <div class="speed-import-head"><h3>Registros importados</h3><div class="speed-import-actions"><button class="speed-btn speed-btn-primary speed-btn-compact" type="button" data-sync-bfleet-excessos>Sincronizar ontem</button><button class="speed-btn speed-btn-soft speed-icon-btn" type="button" data-infleet-import-btn title="Importar planilha Infleet" aria-label="Importar planilha Infleet">${ICO_IMPORT}</button><button class="speed-btn speed-btn-soft speed-icon-btn" type="button" data-refresh-imported-excessos title="Atualizar lista" aria-label="Atualizar lista">${ICO_REFRESH}</button></div></div>
                    <input type="file" accept=".xlsx,.xls" data-infleet-file hidden>
                    <p class="speed-hint" data-imported-excess-count>Nenhuma pendência carregada</p>
                    <div class="print-status-box">
                      <strong>Sincronizar relatório da BFleet</strong>
                      <p>Use <strong>Sincronizar ontem</strong> para o padrão diário. Para ajustar manualmente a data que vem da API, informe o período abaixo.</p>
                      <div class="speed-sync-range">
                        <div class="speed-field"><label>Data inicial do relatório</label><input class="speed-input" type="date" data-sync-report-start value="${yesterdayInputDate()}"></div>
                        <div class="speed-field"><label>Data final do relatório</label><input class="speed-input" type="date" data-sync-report-end value="${yesterdayInputDate()}"></div>
                      </div>
                      <button class="speed-btn speed-btn-soft speed-btn-compact" type="button" data-sync-bfleet-period>Sincronizar período</button>
                    </div>
                    <div class="print-status-box">
                      <strong>Importar planilha Infleet</strong>
                      <p>Clique em <strong>Importar Infleet</strong> para selecionar o arquivo .xlsx exportado da Infleet. O sistema filtra automaticamente os registros com <strong>Velocidade Km/h &gt; 120</strong>, cruza a placa com os patrimônios para identificar o colaborador e insere as pendências nesta lista.</p>
                    </div>
                    <p class="speed-hint">As datas de OK em lote aparecem junto das pendências e servem apenas para limpar/arquivar registros já importados.</p>
                    <div class="speed-import-search">
                      <div class="speed-search-field">${ICO_SEARCH}<input class="speed-input" type="text" placeholder="Buscar colaborador ou placa" data-imported-search></div>
                      <select data-imported-status-filter>
                        <option value="ALL">Todos os status</option>
                        <option value="IDENTIFICADO">Identificado pelo patrimônio</option>
                        <option value="CONFERIR">Conferir motorista</option>
                        <option value="GERADA">Mensagem copiada</option>
                      </select>
                      <button class="speed-btn speed-btn-soft speed-btn-compact" type="button" data-imported-clear-filters>Limpar</button>
                    </div>
                    <div class="speed-import-list" data-imported-excess-list><div class="speed-import-empty">Carregando registros importados...</div></div>
                    <p class="speed-hint">Ao clicar em uma sugestão, o painel considera automaticamente somente a maior velocidade de cada data.</p>
                  </div>
                </div>
              </div>
            </div>
            <div data-notif-panel="fora_horario">
              <style>
                .fora-horario-layout{display:grid;gap:14px;width:100%}
                .fora-horario-toolbar{display:flex;align-items:flex-end;gap:12px;flex-wrap:wrap;padding:0 0 14px;border-bottom:1px solid rgba(148,163,184,.14)}
                .fora-horario-date{width:170px;margin:0}
                .fora-horario-date label{min-height:0;color:#dbeafe;line-height:1.35}
                .fora-horario-date .speed-input{height:46px;border-radius:14px;font-size:14px;font-weight:900;padding:0 14px}
                .fora-horario-sync{height:46px;min-width:0;border-radius:14px;padding:0 22px}
                .fora-horario-refresh{width:46px;height:46px;min-height:46px;border-radius:14px;padding:0}
                .fora-horario-table{border-color:rgba(34,197,94,.20);border-radius:20px;background:rgba(2,6,23,.30)}
                .fora-horario-table .hist-table{min-width:1480px}
                .fora-horario-actions{display:flex;gap:7px;flex-wrap:wrap}
                .fora-horario-actions .speed-btn{min-height:34px;padding:7px 10px;border-radius:10px}
                .fora-horario-actions .speed-btn:disabled{opacity:.42;cursor:not-allowed}
                .fora-horario-table .hist-table th{height:58px;padding:0 18px;color:#34d399;background:rgba(2,44,30,.76);font-size:12px}
                .fora-horario-table .hist-table td{padding:18px;color:#f8fafc;font-size:13px}
                .fora-horario-table .speed-import-empty{border:0;border-radius:0;background:transparent;color:#f8fafc}
                .fora-horario-count{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
                .fora-horario-link-btn{border:0;background:transparent;padding:0;color:#86efac;font-weight:800;font-size:inherit;cursor:pointer;text-decoration:underline}
                .fora-horario-link-btn:hover{color:#bbf7d0}
                .rota-modal-table td small{display:block;color:#6b7280;margin-top:2px}
                .speed-fab[hidden]{display:none}
                .fh-filtros{display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap}
                .fh-chips{display:flex;gap:8px;flex-wrap:wrap}
                .fh-chip{appearance:none;border:1px solid rgba(148,163,184,.22);background:rgba(15,23,42,.6);color:#cbd5e1;border-radius:999px;padding:8px 14px;font-weight:900;font-size:12px;cursor:pointer;display:inline-flex;align-items:center;gap:8px;transition:.16s ease}
                .fh-chip[hidden]{display:none}
                .fh-chip b{background:rgba(148,163,184,.18);border-radius:999px;padding:1px 8px;font-size:11px;color:#f8fafc}
                .fh-chip:hover{border-color:rgba(34,197,94,.5);color:#dcfce7}
                .fh-chip.active{background:rgba(34,197,94,.16);border-color:rgba(34,197,94,.6);color:#bbf7d0}
                .fh-chip.active b{background:rgba(34,197,94,.3)}
                .fh-busca{width:min(100%,300px);margin:0}
                .fh-alerta{margin:0;border:1px solid rgba(251,191,36,.35);background:rgba(251,191,36,.08);border-radius:12px;padding:9px 12px;color:#fde68a;font-size:12px}
                .fh-alerta[hidden]{display:none}
                .fh-ajuda{color:#94a3b8;font-size:12px;line-height:1.55}
                .fh-ajuda summary{cursor:pointer;color:#94a3b8;font-weight:800;width:max-content}
                .fh-ajuda summary:hover{color:#bbf7d0}
                .fh-ajuda p{margin:8px 0 0;max-width:900px}
                .fh-legenda{display:flex;gap:16px;flex-wrap:wrap;margin-top:8px}
                .fh-legenda span{display:inline-flex;align-items:center;gap:6px}
                .fh-sub{margin-top:3px;color:#94a3b8;font-size:12px;line-height:1.4}
                .fh-muted{color:#6b7280}
                .fh-badge{display:inline-flex;align-items:center;border-radius:999px;padding:5px 11px;font-size:11px;font-weight:950;border:1px solid rgba(148,163,184,.3);white-space:nowrap}
                .fh-badge-fora{background:rgba(248,113,113,.16);border-color:rgba(248,113,113,.5);color:#fecaca}
                .fh-badge-atencao{background:rgba(251,191,36,.14);border-color:rgba(251,191,36,.45);color:#fde68a}
                .fh-badge-dentro{background:rgba(52,211,153,.14);border-color:rgba(52,211,153,.4);color:#a7f3d0}
                .fh-badge-nd{background:rgba(148,163,184,.12);color:#cbd5e1}
                .fh-badge-sem{background:rgba(192,132,252,.18);border-color:rgba(192,132,252,.55);color:#e9d5ff}
                .fh-badge-sem-leve{background:rgba(192,132,252,.08);border-color:rgba(192,132,252,.35);color:#d8b4fe}
                .fh-badge-exc{background:rgba(251,146,60,.16);border-color:rgba(251,146,60,.5);color:#fed7aa}
                .fh-tags{display:flex;gap:6px;flex-wrap:wrap}
                .fh-tag{display:inline-flex;align-items:center;border-radius:8px;padding:4px 9px;font-size:12px;font-weight:900;border:1px solid transparent;white-space:nowrap}
                .fh-tag-fora{background:rgba(248,113,113,.16);border-color:rgba(248,113,113,.45);color:#fecaca}
                .fh-tag-atencao{background:rgba(251,191,36,.12);border-color:rgba(251,191,36,.4);color:#fde68a}
                .fh-tag-sem{background:rgba(192,132,252,.18);border-color:rgba(192,132,252,.5);color:#e9d5ff}
                .fh-tag-sem-leve{background:rgba(192,132,252,.08);border-color:rgba(192,132,252,.32);color:#d8b4fe}
                .fh-tag-exc{background:rgba(251,146,60,.16);border-color:rgba(251,146,60,.5);color:#fed7aa}
                .fh-lista{display:flex;flex-direction:column;gap:6px}
                .fh-dia{margin:16px 0 4px;color:#cbd5e1;font-size:12px;font-weight:900;text-transform:uppercase;letter-spacing:.08em}
                .fh-dia:first-child{margin-top:4px}
                .fh-dia span{margin-left:10px;color:#6b7280;font-weight:700;text-transform:none;letter-spacing:0}
                .fh-linha{display:grid;grid-template-columns:10px minmax(190px,1fr) minmax(280px,2.2fr) minmax(0,150px) auto;align-items:center;gap:16px;padding:12px 16px;border:1px solid rgba(148,163,184,.13);background:rgba(15,23,42,.5);border-radius:14px}
                .fh-linha:hover{border-color:rgba(148,163,184,.3);background:rgba(15,23,42,.8)}
                .fh-ponto{width:10px;height:10px;border-radius:50%;background:#64748b}
                .fh-linha-fora .fh-ponto{background:#f87171}
                .fh-linha-atencao .fh-ponto{background:#fbbf24}
                .fh-linha-dentro .fh-ponto{background:#34d399}
                .fh-l-quem strong{display:block;color:#f8fafc;font-size:14px;line-height:1.3}
                .fh-l-quem small,.fh-l-resumo small{display:block;margin-top:3px;color:#94a3b8;font-size:12px;line-height:1.4}
                .fh-l-resumo b{display:block;color:#f8fafc;font-size:14px;font-weight:800;line-height:1.3}
                .fh-status{display:inline-flex;border-radius:999px;padding:3px 10px;background:rgba(34,197,94,.14);color:#bbf7d0;font-size:11px;font-weight:900;white-space:nowrap}
                .fh-btn-dossie{background:rgba(96,165,250,.14);color:#bfdbfe;border:1px solid rgba(96,165,250,.4);white-space:nowrap}
                .fh-btn-dossie:hover:not(:disabled){background:rgba(96,165,250,.26)}
                .fh-btn-dossie:disabled{opacity:.42;cursor:not-allowed}
                .fh-bar{position:relative;margin:6px 0 0;padding-bottom:22px}
                .fh-bar-lane{position:relative;border-radius:8px}
                .fh-bar-evs{height:16px}
                .fh-bar-trips{height:34px;background:rgba(148,163,184,.08);border:1px solid rgba(148,163,184,.14);overflow:hidden}
                .fh-bar-janela{position:absolute;top:0;bottom:0;background:rgba(34,197,94,.18);border-left:2px solid rgba(34,197,94,.7);border-right:2px solid rgba(34,197,94,.7)}
                .fh-bar-trip{position:absolute;top:7px;bottom:7px;border-radius:3px;min-width:3px}
                .fh-bar-trip.ok{background:#60a5fa}
                .fh-bar-trip.fora{background:#f87171}
                .fh-bar-trip.sem{background:#c084fc}
                .fh-bar-trip.fora.sem{background:#f87171;box-shadow:inset 0 0 0 2px #c084fc}
                .fh-bar-excs{height:14px;margin-top:2px}
                .fh-bar-exc{position:absolute;top:2px;width:0;height:0;margin-left:-5px;border-left:5px solid transparent;border-right:5px solid transparent;border-bottom:10px solid #fb923c}
                .fh-bar-ev{position:absolute;top:3px;width:9px;height:9px;margin-left:-4px;border-radius:50%;background:#fbbf24}
                .fh-bar-ev.casa{background:transparent;border:1.5px solid #6b7280;box-sizing:border-box}
                .fh-bar-ticks{position:absolute;left:0;right:0;bottom:0;height:16px}
                .fh-bar-tick{position:absolute;transform:translateX(-50%);font-size:10px;color:#6b7280}
                .fh-bar-tick:first-child{transform:none}.fh-bar-tick:last-child{transform:translateX(-100%)}
                .fh-legend{display:flex;gap:16px;flex-wrap:wrap;margin-top:4px;color:#94a3b8;font-size:11px}
                .fh-legend span{display:inline-flex;align-items:center;gap:6px}
                .fh-lg{display:inline-block;width:12px;height:12px;border-radius:3px}
                .fh-lg-janela{background:rgba(34,197,94,.35);border:1px solid rgba(34,197,94,.7)}
                .fh-lg-ok{background:#60a5fa}.fh-lg-fora{background:#f87171}.fh-lg-sem{background:#c084fc}
                .fh-lg-exc{width:0;height:0;border-radius:0;border-left:6px solid transparent;border-right:6px solid transparent;border-bottom:11px solid #fb923c;background:transparent}
                .fh-lg-dot-sem{background:#c084fc;border-radius:50%}.fh-lg-dot-exc{background:#fb923c;border-radius:50%}
                .fh-lg-ev{background:#fbbf24;border-radius:50%}
                .fh-lg-casa{background:transparent;border:1.5px solid #6b7280;border-radius:50%;box-sizing:border-box}
                .fh-lg-dot-fora{background:#f87171;border-radius:50%}.fh-lg-dot-atencao{background:#fbbf24;border-radius:50%}.fh-lg-dot-dentro{background:#34d399;border-radius:50%}
                .speed-modal.fh-modal{max-width:980px}
                .fh-dossie-topo{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:10px}
                .fh-dossie-quem{color:#cbd5e1;font-size:13px}
                .fh-m-manchete{margin:4px 0 4px;color:#f8fafc;font-size:24px;letter-spacing:-.03em;line-height:1.25}
                .fh-m-sub{margin:0 0 14px;color:#94a3b8;font-size:13px;line-height:1.5}
                .fh-h4{margin:20px 0 8px;color:#f8fafc;font-size:14px;letter-spacing:.01em}
                .fh-motivos{margin:0;padding-left:18px;color:#e2e8f0;font-size:13px;line-height:1.65}
                .fh-aviso{margin:10px 0 0;border:1px solid rgba(251,191,36,.35);background:rgba(251,191,36,.08);border-radius:12px;padding:9px 12px;color:#fde68a;font-size:12px;line-height:1.5}
                .fh-passos{display:grid;gap:8px;margin-top:10px}
                .fh-passo{display:grid;grid-template-columns:210px 1fr;gap:14px;border:1px solid rgba(148,163,184,.14);background:rgba(15,23,42,.55);border-left:4px solid rgba(96,165,250,.55);border-radius:12px;padding:10px 14px}
                .fh-passo b{color:#f8fafc;font-size:13px}
                .fh-passo span{color:#cbd5e1;font-size:13px;line-height:1.55}
                .fh-tl-wrap{max-height:380px;overflow:auto}
                .fh-tl{min-width:680px}
                .fh-tl td{vertical-align:top}
                .fh-percursos .fh-tl-completo{display:none}
                .fh-percursos[data-modo="completo"] .fh-tl-completo{display:block}
                .fh-percursos[data-modo="completo"] .fh-tl-resumo{display:none}
                .fh-alternar{margin-top:10px}
                .fh-tl tr.fh-linha-fora td{background:rgba(248,113,113,.09)}
                .fh-tl tr.fh-linha-fora td:first-child{box-shadow:inset 3px 0 0 #f87171}
                .fh-tl tr.fh-linha-casa td{color:#6b7280}
                .fh-tl a,.fh-dossie-topo a,.fh-metodo a,.speed-hint a{color:#86efac}
                .fh-fase{display:inline-flex;border-radius:8px;padding:3px 8px;font-size:11px;font-weight:900}
                .fh-fase.ok{background:rgba(96,165,250,.16);color:#bfdbfe}
                .fh-fase.fora{background:rgba(248,113,113,.2);color:#fecaca}
                .fh-fase.info{background:rgba(251,191,36,.14);color:#fde68a}
                .fh-fase.neutra{background:rgba(148,163,184,.14);color:#cbd5e1}
                .fh-fase.sem{background:rgba(192,132,252,.2);color:#e9d5ff}
                .fh-fase.exc{background:rgba(251,146,60,.2);color:#fed7aa}
                .fh-fase.uso{background:rgba(52,211,153,.12);color:#a7f3d0}
                .fh-chips-cel{display:flex;gap:6px;flex-wrap:wrap;align-items:flex-start}
                .fh-chips-cel .fh-sub{flex-basis:100%;margin-top:0}
                .fh-tl tr.fh-linha-sem td:first-child{box-shadow:inset 3px 0 0 #c084fc}
                .fh-tl tr.fh-linha-sem td{background:rgba(192,132,252,.07)}
                .fh-metodo{margin-top:16px;border:1px solid rgba(148,163,184,.14);border-radius:14px;padding:10px 14px;color:#cbd5e1;font-size:12px}
                .fh-metodo.fh-interno{margin-top:10px;background:rgba(2,6,23,.3)}
                .fh-metodo summary{cursor:pointer;font-weight:900;color:#bbf7d0}
                .fh-metodo ul{margin:10px 0 2px;padding-left:18px;line-height:1.6}
                .fh-metodo .fh-tl-wrap{margin-top:10px}
                .fh-m-rodape{position:sticky;bottom:-20px;margin:18px -20px -20px;padding:12px 20px;background:#0d0d18;border-top:1px solid rgba(148,163,184,.16);display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap}
                .fh-m-rodape-info{display:flex;flex-direction:column;gap:2px}
                .fh-m-rodape-info:empty{display:none}
                .fh-fresco{margin:0;color:#6b7280;font-size:12px}
                .fh-fresco[hidden]{display:none}
                .speed-modal.fh-modal-mapa{max-width:1100px}
                .fh-mapa{height:480px;border-radius:14px;overflow:hidden;border:1px solid rgba(148,163,184,.2);isolation:isolate;background:#0b1220}
                .fh-mapa-slider{display:flex;align-items:center;gap:12px;margin-top:10px}
                .fh-mapa-slider input{flex:1;accent-color:#fbbf24}
                .fh-mapa-slider span{min-width:130px;color:#fde68a;font-weight:900;font-size:13px;text-align:right}
                .fh-refs{display:grid;gap:8px}
                .fh-ref{display:grid;grid-template-columns:30px 1fr auto;gap:12px;align-items:center;border:1px solid rgba(148,163,184,.14);border-radius:12px;padding:8px 12px;background:rgba(15,23,42,.5)}
                .fh-ref b{display:block;color:#f8fafc;font-size:13px}
                .fh-ref small{display:block;color:#94a3b8;font-size:12px;line-height:1.4}
                .fh-ref small.fh-ref-prox{color:#bbf7d0}
                .fh-pin{width:26px;height:26px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:10px;color:#fff;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.5)}
                .fh-pin-os{background:#f59e0b}.fh-pin-casa{background:#3b82f6}.fh-pin-pernoite{background:#64748b}
                .fh-hora{background:rgba(2,6,23,.88);color:#e2e8f0;border:1px solid rgba(148,163,184,.45);border-radius:6px;padding:0 5px;font-size:10px;font-weight:800;line-height:15px;text-align:center;white-space:nowrap}
                @media(max-width:900px){.fh-linha{grid-template-columns:10px 1fr auto}.fh-l-resumo{grid-column:2/-1;grid-row:2}.fh-l-fim{grid-column:2;grid-row:3}.fh-linha .fh-btn-dossie{grid-column:3;grid-row:1}.fh-l-fim:empty{display:none}}
                @media(max-width:760px){.fh-filtros{display:grid}.fh-busca{width:100%}.fh-passo{grid-template-columns:1fr;gap:4px}.fh-m-manchete{font-size:20px}}
                @media(max-width:760px){.fora-horario-toolbar{display:grid;grid-template-columns:1fr 1fr 58px;gap:10px}.fora-horario-date{width:auto}.fora-horario-sync{grid-column:1/3;min-width:0;width:100%}.fora-horario-refresh{grid-column:3;grid-row:1/3;align-self:end;width:58px}.fora-horario-date .speed-input,.fora-horario-sync,.fora-horario-refresh{height:58px;min-height:58px}}
                @media(max-width:520px){.fora-horario-toolbar{grid-template-columns:1fr 54px}.fora-horario-date{grid-column:1}.fora-horario-sync{grid-column:1}.fora-horario-refresh{grid-column:2;grid-row:1/4;width:54px}.fora-horario-date .speed-input{font-size:14px}}
              </style>
              <div class="fora-horario-layout">
                <div class="fora-horario-toolbar">
                  <div class="speed-field fora-horario-date"><label>De</label><input class="speed-input" type="date" data-fora-horario-report-start value="${yesterdayInputDate()}"></div>
                  <div class="speed-field fora-horario-date"><label>Até</label><input class="speed-input" type="date" data-fora-horario-report-end value="${yesterdayInputDate()}"></div>
                  <button class="speed-btn speed-btn-soft fora-horario-sync" type="button" data-sync-bfleet-fora-horario-periodo>Sincronizar período</button>
                  <button class="speed-btn speed-btn-soft fora-horario-refresh" type="button" data-refresh-fora-horario title="Atualizar lista" aria-label="Atualizar lista">${ICO_REFRESH}</button>
                </div>
                <div class="fh-filtros">
                  <div class="fh-chips" role="group" aria-label="Filtrar por resultado">
                    <button class="fh-chip active" type="button" data-fh-filter="ALERTAS">Alertas <b>0</b></button>
                    <button class="fh-chip" type="button" data-fh-filter="FORA_HORARIO">Fora do horário <b>0</b></button>
                    <button class="fh-chip" type="button" data-fh-filter="USO_INDEVIDO">Uso indevido <b>0</b></button>
                    <button class="fh-chip" type="button" data-fh-filter="EXCESSO">Excesso de velocidade <b>0</b></button>
                    <button class="fh-chip" type="button" data-fh-filter="CONFERIR">Para conferir <b>0</b></button>
                    <button class="fh-chip" type="button" data-fh-filter="SEM_DOSSIE" hidden>Sem dossiê <b>0</b></button>
                    <button class="fh-chip" type="button" data-fh-filter="TODOS">Todos <b>0</b></button>
                  </div>
                  <div class="speed-search-field fh-busca">${ICO_SEARCH}<input class="speed-input" type="text" placeholder="Buscar colaborador ou placa" data-fora-horario-search></div>
                </div>
                <p class="fh-alerta" data-fh-alerta hidden></p>
                <p class="fh-fresco" data-fh-fresco hidden></p>
                <details class="fh-ajuda">
                  <summary>Como funciona</summary>
                  <p>Um dossiê por veículo e por dia, com três frentes: (1) uso fora do horário de trabalho do colaborador, que vem dos informativos do Mapa de Embarque, da produção, do GPS do celular e da escala de carona da Programação, mais o tempo de ida e volta e 20 min de folga; (2) trajetos sem justificativa, que não chegam a O.S. programada, carona nem local de registro de trabalho; (3) excessos de velocidade registrados pelo rastreador. Clique em "Ver detalhes" para ver o dia completo, o mapa da rota e gerar a notificação.</p>
                  <div class="fh-legenda">
                    <span><i class="fh-lg fh-lg-dot-fora"></i>Fora do horário</span>
                    <span><i class="fh-lg fh-lg-dot-sem"></i>Uso sem justificativa</span>
                    <span><i class="fh-lg fh-lg-dot-exc"></i>Excesso de velocidade</span>
                    <span><i class="fh-lg fh-lg-dot-dentro"></i>Sem alertas</span>
                  </div>
                  <p>Dados desatualizados? <button type="button" class="fora-horario-link-btn" data-recalcular-dossie>Recalcular dossiê</button></p>
                </details>
                <p class="fora-horario-count" data-fora-horario-count>Nenhum registro carregado</p>
                <div class="fh-lista" data-fora-horario-table><div class="speed-import-empty">Carregando ocorrências...</div></div>
              </div>
            </div>
          </div>
        </div>
        <div class="speed-modal-overlay" data-edit-modal hidden>
          <div class="speed-modal" role="dialog" aria-modal="true" aria-label="Editar notificação">
            <div class="speed-modal-head">
              <div><h3>Dados da notificação</h3><span class="speed-step-pill">maior velocidade por data</span></div>
              <button class="speed-modal-close" type="button" data-edit-modal-close title="Fechar" aria-label="Fechar">${ICO_CLOSE}</button>
            </div>
            <div class="speed-field colab-autocomplete" data-colaborador-autocomplete><label>Colaborador / Motorista</label><input class="speed-input" type="text" autocomplete="off" placeholder="Digite para buscar o colaborador" data-speed-name><div class="colab-dropdown" data-colaborador-dropdown hidden></div><p class="speed-colab-status" data-colaborador-status>Carregando colaboradores da base...</p></div>
            <div class="speed-field"><label>Placa do veículo</label><input class="speed-input" type="text" maxlength="8" placeholder="RVQ6J42" data-speed-plate></div>
            <div class="speed-field"><label>Data da notificação</label><input class="speed-input" type="text" value="${escapeHtml(todayBRShort())}" data-notification-date><p class="speed-hint">Usada para definir o ano da notificação. No Drive será salvo como: <code>Xº NOTIFICAÇÃO DE VELOCIDADE ANO NOME DO COLABORADOR</code></p></div>
            <div class="speed-field"><label>Cidade e data da mensagem</label><input class="speed-input" type="text" value="Cascavel, ${escapeHtml(todayBRLong())}" data-speed-city-date></div>
            <div class="speed-field"><label>Registros de velocidade</label><div data-speed-records></div><button class="speed-btn speed-btn-soft" type="button" data-add-record>+ Adicionar data e velocidade</button></div>
            <div class="speed-actions"><button class="speed-btn speed-btn-primary" type="button" data-generate-speed-message>Gerar e copiar mensagem</button><p class="speed-hint">Depois de gerar, a sugestão fica marcada como <strong>GERADA/COPIADA</strong> para não confundir na sequência.</p></div>
            <div class="speed-divider"></div>
            <h3>Mensagem gerada</h3>
            <textarea class="speed-input speed-textarea speed-message small" readonly data-speed-output placeholder="A mensagem será gerada aqui e copiada automaticamente."></textarea>
          </div>
        </div>
        <button class="speed-fab" type="button" data-open-prints-modal title="Anexar prints" aria-label="Anexar prints">${ICO_PAPERCLIP} Anexar prints</button>
        <div class="speed-modal-overlay" data-prints-modal hidden>
          <div class="speed-modal" role="dialog" aria-modal="true" aria-label="Anexar prints" tabindex="-1" style="outline:none">
            <div class="speed-modal-head">
              <div><h3>Painel 2 · Enviar prints</h3><span class="speed-step-pill">colar direto aqui</span></div>
              <button class="speed-modal-close" type="button" data-prints-modal-close title="Fechar" aria-label="Fechar">${ICO_CLOSE}</button>
            </div>
            <div class="upload-box">
              <div class="speed-field"><label>Leitor OCR</label><input class="speed-input" type="text" value="Serviço central configurado" readonly><p class="speed-hint">Os prints são salvos no Drive e toda conciliação fica auditada no banco. Pasta mãe: <code>${PASTA_MAE_DRIVE_ID}</code>.</p></div>
              <div class="paste-zone" tabindex="0" data-paste-zone>
                <strong>Clique aqui e cole o print</strong>
                <span>Após clicar neste quadro, use <kbd>Ctrl</kbd> + <kbd>V</kbd>. Também funciona colando em qualquer campo desta tela, arrastando imagens ou selecionando em lote abaixo.</span>
              </div>
              <div class="speed-field" style="margin-top:14px"><label>Selecionar prints em lote</label><input class="speed-input" type="file" accept="image/*" multiple data-print-files></div>
              <div data-upload-list class="upload-list"></div>
              <div class="upload-actions"><button class="speed-btn speed-btn-primary" type="button" data-upload-prints>Enviar prints e conferir por OCR</button></div>
              <div class="print-status-box"><strong>Como o arquivamento funciona</strong><p>O Painel 1 apenas gera/copia a mensagem. O Painel 2 identifica o condutor pelo OCR e cruza número da notificação, motorista, placa, data e velocidade com as pendências abertas. Ele não depende da sugestão selecionada nem da mensagem marcada como copiada.</p></div>
              <div data-saved-list class="saved-list"></div>
            </div>
          </div>
        </div>
        <div class="speed-modal-overlay" data-rota-modal hidden>
          <div class="speed-modal" role="dialog" aria-modal="true" aria-label="Rota do veículo">
            <div class="speed-modal-head">
              <div><h3 data-rota-modal-title>Rota do veículo</h3><span class="speed-step-pill" data-rota-modal-km>0,00 km</span></div>
              <button class="speed-modal-close" type="button" data-rota-modal-close title="Fechar" aria-label="Fechar">${ICO_CLOSE}</button>
            </div>
            <p class="speed-hint" data-rota-modal-hint></p>
            <div class="hist-table-wrap"><table class="hist-table rota-modal-table"><thead><tr><th>Horário</th><th>Endereço</th><th>Latitude</th><th>Longitude</th><th>Vel. (km/h)</th></tr></thead><tbody data-rota-modal-body></tbody></table></div>
            <p class="speed-hint"><a data-rota-modal-link href="#" target="_blank" rel="noopener noreferrer" hidden>Abrir trajeto no Google Maps</a></p>
          </div>
        </div>
        <div class="speed-modal-overlay" data-dossie-modal hidden>
          <div class="speed-modal fh-modal" role="dialog" aria-modal="true" aria-label="Dossiê diário do veículo" tabindex="-1" style="outline:none">
            <div class="speed-modal-head">
              <div><h3 data-dossie-title>Dossiê</h3></div>
              <div style="display:flex;gap:8px;align-items:center">
                <button class="speed-btn speed-btn-primary speed-btn-compact" type="button" data-dossie-rota hidden>Consultar rota</button>
                <button class="speed-btn speed-btn-soft speed-btn-compact" type="button" data-dossie-copiar hidden>${ICO_COPY} Copiar resumo</button>
                <button class="speed-modal-close" type="button" data-dossie-modal-close title="Fechar" aria-label="Fechar">${ICO_CLOSE}</button>
              </div>
            </div>
            <div data-dossie-body></div>
            <div class="fh-m-rodape" data-dossie-rodape></div>
          </div>
        </div>
        <div class="speed-modal-overlay" data-rota-mapa-modal hidden>
          <div class="speed-modal fh-modal fh-modal-mapa" role="dialog" aria-modal="true" aria-label="Rota realizada" tabindex="-1" style="outline:none">
            <div class="speed-modal-head">
              <div><h3 data-rota-mapa-titulo>Rota realizada</h3></div>
              <button class="speed-modal-close" type="button" data-rota-mapa-close title="Fechar" aria-label="Fechar">${ICO_CLOSE}</button>
            </div>
            <div data-rota-mapa-corpo></div>
          </div>
        </div>
      </section>`;

    fhLiberarAncestrais(container);
    // Reaplica antes de qualquer clique abrir uma janela (o host pode ter trocado/embrulhado ancestrais depois).
    container.addEventListener('click', () => fhLiberarAncestrais(container), true);
    renderRecords(container);
    renderUploadLists(container);
    renderColaboradorStatus(container, opts);
    bindColaboradorAutocomplete(container, opts);
    loadColaboradoresFromSupabase(container, opts);
    fetchImportedExcessos(container, opts);

    container.querySelector('[data-sync-bfleet-excessos]')?.addEventListener('click', () => sincronizarRelatorioBFleet(container, opts, 'yesterday'));
    container.querySelector('[data-sync-bfleet-period]')?.addEventListener('click', () => sincronizarRelatorioBFleet(container, opts, 'period'));
    container.querySelector('[data-refresh-imported-excessos]')?.addEventListener('click', () => fetchImportedExcessos(container, opts));

    const notifFab = container.querySelector('[data-open-prints-modal]');
    function setNotifTab(tab) {
      state.notifTab = tab;
      container.querySelectorAll('[data-notif-tab]').forEach((btn) => btn.classList.toggle('active', btn.dataset.notifTab === tab));
      container.querySelectorAll('[data-notif-panel]').forEach((panel) => { panel.hidden = panel.dataset.notifPanel !== tab; });
      if (notifFab) notifFab.hidden = tab !== 'excesso';
      if (tab === 'fora_horario' && !state.foraHorarioLoaded) fetchForaHorario(container, opts);
    }
    container.querySelectorAll('[data-notif-tab]').forEach((btn) => btn.addEventListener('click', () => setNotifTab(btn.dataset.notifTab)));
    setNotifTab(state.notifTab === 'excesso' ? 'excesso' : 'fora_horario');

    container.querySelector('[data-sync-bfleet-fora-horario]')?.addEventListener('click', () => sincronizarForaHorario(container, opts, 'yesterday'));
    container.querySelector('[data-sync-bfleet-fora-horario-periodo]')?.addEventListener('click', () => sincronizarForaHorario(container, opts, 'period'));
    container.querySelector('[data-refresh-fora-horario]')?.addEventListener('click', () => fetchForaHorario(container, opts));
    container.querySelector('.fora-horario-layout')?.addEventListener('click', (ev) => {
      if (ev.target.closest('[data-recalcular-dossie]')) recalcularDossieForaHorario(container, opts);
    });
    container.querySelector('[data-fora-horario-table]')?.addEventListener('click', (ev) => {
      const dossieBtn = ev.target.closest('[data-fh-dossie]');
      if (dossieBtn) { if (!dossieBtn.disabled) openDossieModal(container, opts, dossieBtn.dataset.key); return; }
      const rotaBtn = ev.target.closest('[data-ver-rota]');
      if (rotaBtn) { openRotaModal(container, rotaBtn.dataset.id); return; }
      const btn = ev.target.closest('[data-fora-action]');
      if (!btn || btn.disabled) return;
      agirForaHorario(container, opts, btn.dataset.id, btn.dataset.foraAction);
    });
    container.querySelectorAll('[data-fh-filter]').forEach((btn) => btn.addEventListener('click', () => {
      state.foraHorarioFiltro = btn.dataset.fhFilter;
      renderForaHorarioList(container);
    }));
    const foraHorarioBusca = container.querySelector('[data-fora-horario-search]');
    if (foraHorarioBusca) foraHorarioBusca.value = state.foraHorarioSearchTerm;
    foraHorarioBusca?.addEventListener('input', (ev) => {
      state.foraHorarioSearchTerm = ev.target.value;
      renderForaHorarioList(container);
    });

    // Trocar a data consulta direto o banco (sem precisar clicar em nada).
    let temporizadorDatas = null;
    container.querySelectorAll('[data-fora-horario-report-start], [data-fora-horario-report-end]').forEach((input) => input.addEventListener('change', () => {
      const inicio = container.querySelector('[data-fora-horario-report-start]');
      const fim = container.querySelector('[data-fora-horario-report-end]');
      if (inicio?.value && fim?.value && inicio.value > fim.value) {
        if (input === inicio) fim.value = inicio.value; else inicio.value = fim.value;
      }
      window.clearTimeout(temporizadorDatas);
      temporizadorDatas = window.setTimeout(() => {
        const { start, end } = readForaHorarioReportPeriod(container);
        if (start && end && start <= end) fetchForaHorario(container, opts);
      }, 250);
    }));

    const dossieModal = container.querySelector('[data-dossie-modal]');
    const closeDossieModal = () => { if (dossieModal) dossieModal.hidden = true; };
    container.querySelector('[data-dossie-modal-close]')?.addEventListener('click', closeDossieModal);
    container.querySelector('[data-dossie-rota]')?.addEventListener('click', () => abrirRotaMapa(container, opts));
    const rotaMapaModal = container.querySelector('[data-rota-mapa-modal]');
    container.querySelector('[data-rota-mapa-close]')?.addEventListener('click', () => fecharRotaMapa(container));
    rotaMapaModal?.addEventListener('click', (ev) => {
      if (ev.target === rotaMapaModal) { fecharRotaMapa(container); return; }
      if (ev.target.closest('[data-rota-mapa-tentar]')) abrirRotaMapa(container, opts);
    });
    rotaMapaModal?.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') fecharRotaMapa(container); });
    dossieModal?.addEventListener('click', (ev) => {
      const alternar = ev.target.closest('[data-fh-alternar-viagens]');
      if (!alternar) return;
      const bloco = alternar.closest('[data-fh-percursos]');
      if (!bloco) return;
      const completo = bloco.dataset.modo !== 'completo';
      bloco.dataset.modo = completo ? 'completo' : 'resumo';
      alternar.textContent = completo ? 'Ver só os trajetos com alerta' : 'Ver todas as viagens do dia';
    });
    dossieModal?.addEventListener('click', (ev) => {
      const ir = ev.target.closest('[data-fh-ir-excesso]');
      if (!ir) return;
      closeDossieModal();
      state.importedSearchTerm = ir.dataset.placa || '';
      state.importedStatusFilter = 'ALL';
      const campo = container.querySelector('[data-imported-search]');
      if (campo) campo.value = state.importedSearchTerm;
      const filtroStatus = container.querySelector('[data-imported-status-filter]');
      if (filtroStatus) filtroStatus.value = 'ALL';
      setNotifTab('excesso');
      renderImportedExcessos(container);
    });
    dossieModal?.addEventListener('click', async (ev) => {
      const rota = ev.target.closest('[data-ver-rota]');
      if (rota) { closeDossieModal(); openRotaModal(container, rota.dataset.id); return; }
      const acao = ev.target.closest('[data-fora-action]');
      if (!acao || acao.disabled) return;
      await agirForaHorario(container, opts, acao.dataset.id, acao.dataset.foraAction);
      atualizarRodapeDossie(container);
    });
    dossieModal?.addEventListener('click', (ev) => { if (ev.target === dossieModal) closeDossieModal(); });
    dossieModal?.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') closeDossieModal(); });
    container.querySelector('[data-dossie-copiar]')?.addEventListener('click', async () => {
      if (!state.foraHorarioDossieAberto) return;
      try {
        await copyText(fhResumoTexto(state.foraHorarioDossieAberto));
        toast('Resumo do dossiê copiado.');
      } catch (err) {
        console.warn('[FROTAS] Falha ao copiar resumo do dossiê:', err);
        toast('Não foi possível copiar o resumo.', 'error');
      }
    });

    const printsModal = container.querySelector('[data-prints-modal]');
    const printsOpenBtn = container.querySelector('[data-open-prints-modal]');
    const printsFocusables = () => Array.from(printsModal?.querySelectorAll('button, input, [tabindex="0"]') || [])
      .filter((el) => !el.disabled && el.offsetParent !== null);
    const openPrintsModal = () => {
      if (!printsModal) return;
      printsModal.hidden = false;
      // Foco direto na área de colagem: o Ctrl+V já funciona sem precisar clicar de novo.
      const zone = printsModal.querySelector('[data-paste-zone]');
      (zone || printsModal.querySelector('.speed-modal'))?.focus({ preventScroll: true });
    };
    const closePrintsModal = () => {
      if (!printsModal || printsModal.hidden) return;
      printsModal.hidden = true;
      printsOpenBtn?.focus({ preventScroll: true });
    };
    printsOpenBtn?.addEventListener('click', openPrintsModal);
    container.querySelector('[data-prints-modal-close]')?.addEventListener('click', closePrintsModal);
    printsModal?.addEventListener('click', (ev) => { if (ev.target === printsModal) closePrintsModal(); });
    printsModal?.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape') { ev.preventDefault(); closePrintsModal(); return; }
      if (ev.key !== 'Tab') return;
      // Mantém o Tab dentro do modal (aria-modal): não deixa o foco ir para a tela de trás.
      const items = printsFocusables();
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (ev.shiftKey && (document.activeElement === first || document.activeElement === printsModal.querySelector('.speed-modal'))) { ev.preventDefault(); last.focus(); }
      else if (!ev.shiftKey && document.activeElement === last) { ev.preventDefault(); first.focus(); }
    });

    const editModal = container.querySelector('[data-edit-modal]');
    const closeEditModal = () => { if (editModal) editModal.hidden = true; };
    container.querySelector('[data-edit-modal-close]')?.addEventListener('click', closeEditModal);
    editModal?.addEventListener('click', (ev) => { if (ev.target === editModal) closeEditModal(); });

    const rotaModal = container.querySelector('[data-rota-modal]');
    const closeRotaModal = () => { if (rotaModal) rotaModal.hidden = true; };
    container.querySelector('[data-rota-modal-close]')?.addEventListener('click', closeRotaModal);
    rotaModal?.addEventListener('click', (ev) => { if (ev.target === rotaModal) closeRotaModal(); });

    const importedSearchInput = container.querySelector('[data-imported-search]');
    const importedStatusSelect = container.querySelector('[data-imported-status-filter]');
    if (importedSearchInput) importedSearchInput.value = state.importedSearchTerm;
    if (importedStatusSelect) importedStatusSelect.value = state.importedStatusFilter;
    importedSearchInput?.addEventListener('input', () => {
      state.importedSearchTerm = importedSearchInput.value;
      renderImportedExcessos(container);
    });
    importedStatusSelect?.addEventListener('change', () => {
      state.importedStatusFilter = importedStatusSelect.value;
      renderImportedExcessos(container);
    });
    container.querySelector('[data-imported-clear-filters]')?.addEventListener('click', () => {
      state.importedSearchTerm = '';
      state.importedStatusFilter = 'ALL';
      if (importedSearchInput) importedSearchInput.value = '';
      if (importedStatusSelect) importedStatusSelect.value = 'ALL';
      renderImportedExcessos(container);
    });

    const infleetFileInput = container.querySelector('[data-infleet-file]');
    container.querySelector('[data-infleet-import-btn]')?.addEventListener('click', () => infleetFileInput?.click());
    infleetFileInput?.addEventListener('change', (ev) => {
      const file = ev.target.files?.[0];
      if (file) importInfleetExcel(container, file, opts);
      ev.target.value = '';
    });

    const plate = container.querySelector('[data-speed-plate]');
    if (plate) plate.addEventListener('input', () => { plate.value = onlyPlate(plate.value); });

    container.querySelector('[data-add-record]')?.addEventListener('click', () => { syncRecordsFromDom(container); state.records.push({ data: '', velocidade: '' }); renderRecords(container); });
    container.querySelector('[data-print-files]')?.addEventListener('change', (ev) => { addUploadedFiles(container, ev.target.files || [], 'selecionado'); ev.target.value = ''; });

    const pasteZone = container.querySelector('[data-paste-zone]');
    const handlePrintPaste = (ev) => {
      const files = clipboardImageFilesFromEvent(ev);
      if (!files.length) return;
      ev.preventDefault();
      ev.stopPropagation();
      addUploadedFiles(container, files, 'colado');
      if (pasteZone) {
        pasteZone.classList.add('drag');
        setTimeout(() => pasteZone.classList.remove('drag'), 450);
      }
    };

    container.addEventListener('paste', handlePrintPaste);

    if (pasteZone) {
      pasteZone.addEventListener('click', () => {
        pasteZone.focus();
        toast('Área de prints selecionada. Agora use Ctrl + V para colar o print.');
      });
      pasteZone.addEventListener('paste', handlePrintPaste);
      pasteZone.addEventListener('dragover', (ev) => { ev.preventDefault(); pasteZone.classList.add('drag'); });
      pasteZone.addEventListener('dragleave', () => pasteZone.classList.remove('drag'));
      pasteZone.addEventListener('drop', (ev) => {
        ev.preventDefault();
        pasteZone.classList.remove('drag');
        addUploadedFiles(container, ev.dataTransfer?.files || [], 'arrastado');
      });
    }

    container.querySelector('[data-upload-prints]')?.addEventListener('click', () => uploadPrints(container));
    container.querySelector('[data-generate-speed-message]')?.addEventListener('click', async () => {
      syncRecordsFromDom(container);
      const validation = validateForm(container);
      if (!validation.ok) return toast(validation.message, 'error');
      const message = buildMessage(validation.payload);
      state.lastMessage = message;
      const output = container.querySelector('[data-speed-output]');
      if (output) output.value = message;
      try { await copyText(message); await markSelectedImportedGroupAsGenerated(container, opts, message); toast('Mensagem gerada, copiada e marcada como GERADA.'); }
      catch (err) { console.warn('[FROTAS] Falha ao copiar mensagem:', err); toast('Mensagem gerada, mas não foi possível copiar automaticamente.', 'error'); }
    });
  }

  function renderHome(container, opts = {}) { renderExcessoVelocidade(container, opts); }
  window[MODULE_NAME] = window[MODULE_NAME] || {};
  window[MODULE_NAME].openHome = renderHome;
  window[MODULE_NAME].openHistorico = renderHistoricoFrotas;
  window.ADM_MODULES = window.ADM_MODULES || {};
  window.ADM_MODULES.frotas = { mount: renderHome };
})();
