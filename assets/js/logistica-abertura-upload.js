import { supabase } from './supabaseClient.js';
import { browserOcrFile } from './logistica-browser-ocr.js?v=20260803-browser-ocr1';

const UPLOAD_ID = 'abrirOsUploadWrap';
const MAX_TECHNICAL_BYTES = 15 * 1024 * 1024;
const MAX_IMAGE_SIDE = 1800;
let onlineProviderUnavailable = false;

const FIELD_IDS = {
  contratante_cliente: 'osContratante',
  filial_pagadora: 'osFilialPagadora',
  produtor: 'osProdutor',
  armazem_embarque: 'osArmazemEmbarque',
  cidade_embarque: 'osCidadeEmbarque',
  cidade_destino: 'osCidadeDestino',
  local_destino: 'osLocalDestino',
  numero_contrato: 'osNumeroContrato',
  produto: 'osProduto',
  tipo_produto: 'osTipoProduto',
  servico: 'osServico',
  volume_inicial: 'osVolumeInicial',
  regional: 'osRegional',
  troca_notas: 'osTrocaNotas',
};

function normalize(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

function isLogisticaPage() {
  const route = String(location.pathname || '')
    .split('/')
    .filter(Boolean)
    .pop()
    ?.replace(/\.html$/i, '')
    .toLowerCase();
  return route === 'logistica';
}

function setStatus(message, tone = 'muted') {
  const el = document.getElementById('abrirOsUploadStatus');
  if (!el) return;
  el.textContent = message;
  el.dataset.tone = tone;
}

function matchingOption(select, value) {
  const wanted = normalize(value);
  if (!wanted) return null;
  const options = [...select.options].filter((option) => option.value);
  return options.find((option) => normalize(option.value) === wanted)
    || options.find((option) => normalize(option.textContent) === wanted)
    || options.find((option) => normalize(option.value).includes(wanted) || wanted.includes(normalize(option.value)))
    || null;
}

function applyField(id, value) {
  if (value === null || value === undefined || String(value).trim() === '') return false;
  const field = document.getElementById(id);
  if (!field) return false;

  if (field instanceof HTMLSelectElement) {
    const option = matchingOption(field, value);
    if (!option) return false;
    field.value = option.value;
  } else if (field.type === 'number') {
    const raw = String(value).trim();
    let normalizedNumber = raw.replace(/\s/g, '').replace(/[^0-9,.-]/g, '');
    if (normalizedNumber.includes(',') && normalizedNumber.includes('.')) {
      normalizedNumber = normalizedNumber.lastIndexOf(',') > normalizedNumber.lastIndexOf('.')
        ? normalizedNumber.replace(/\./g, '').replace(',', '.')
        : normalizedNumber.replace(/,/g, '');
    } else if (normalizedNumber.includes(',')) {
      normalizedNumber = normalizedNumber.replace(/\./g, '').replace(',', '.');
    }
    const parsed = Number(normalizedNumber);
    if (!Number.isFinite(parsed)) return false;
    field.value = String(parsed);
  } else {
    field.value = String(value).trim();
  }

  field.classList.add('os-upload-filled');
  field.dispatchEvent(new Event('input', { bubbles: true }));
  field.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
}

function applyFields(fields) {
  let filled = 0;
  Object.entries(FIELD_IDS).forEach(([key, id]) => {
    if (applyField(id, fields?.[key])) filled += 1;
  });
  return filled;
}

function extensionFromFile(file) {
  const nameExtension = String(file.name || '').split('.').pop()?.toLowerCase() || '';
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'pdf'].includes(nameExtension)) return nameExtension;
  if (file.type === 'application/pdf') return 'pdf';
  if (file.type === 'image/png') return 'png';
  if (file.type === 'image/gif') return 'gif';
  if (file.type === 'image/webp') return 'webp';
  return 'jpg';
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error || new Error('Não foi possível ler o arquivo.'));
    reader.onload = () => resolve(String(reader.result || '').split(',')[1] || '');
    reader.readAsDataURL(blob);
  });
}

async function compressImage(file) {
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = 'async';
    image.src = objectUrl;
    await image.decode();

    const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(image.naturalWidth, image.naturalHeight));
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('Seu navegador não conseguiu preparar a imagem.');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);

    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob(
        (result) => result ? resolve(result) : reject(new Error('Não foi possível compactar a imagem.')),
        'image/jpeg',
        0.88,
      );
    });
    return { blob, tipo: 'jpg' };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function prepareFile(file) {
  if (!file) throw new Error('Selecione um arquivo.');
  if (file.size > MAX_TECHNICAL_BYTES) throw new Error('O arquivo excede o limite de 15 MB.');

  const extension = extensionFromFile(file);
  if (extension === 'pdf') return { blob: file, tipo: 'pdf' };
  return compressImage(file);
}

async function readFunctionError(error) {
  try {
    const response = error?.context;
    if (response && typeof response.json === 'function') {
      const detail = await response.json();
      return detail?.error || detail?.message || error.message;
    }
  } catch { /* usa a mensagem padrão */ }
  return error?.message || 'Não foi possível processar o arquivo.';
}

function isProviderConfigurationError(message) {
  const text = normalize(message);
  return text.includes('nenhum provedor')
    || text.includes('api_key')
    || text.includes('api key')
    || text.includes('nao configurad')
    || text.includes('secret');
}

async function tryOnlineOcr(file) {
  if (onlineProviderUnavailable) return null;

  const prepared = await prepareFile(file);
  const base64 = await blobToBase64(prepared.blob);
  const { data, error } = await supabase.functions.invoke('logistica-os-autopreencher', {
    body: {
      base64,
      tipo: prepared.tipo,
      nome_arquivo: file.name,
    },
  });

  if (error) {
    const message = await readFunctionError(error);
    if (isProviderConfigurationError(message)) onlineProviderUnavailable = true;
    throw new Error(message);
  }
  if (data?.error) {
    if (isProviderConfigurationError(data.error)) onlineProviderUnavailable = true;
    throw new Error(data.error);
  }
  return data;
}

async function processFile(file) {
  const button = document.getElementById('abrirOsUploadBtn');
  if (!button) return;

  button.disabled = true;
  button.dataset.originalText ||= button.textContent;
  button.textContent = 'Lendo arquivo...';
  setStatus(`${file.name} · preparando leitura`, 'loading');
  document.querySelectorAll('.os-upload-filled').forEach((field) => field.classList.remove('os-upload-filled'));

  let onlineError = null;

  try {
    let result = null;

    if (!onlineProviderUnavailable) {
      try {
        setStatus(`${file.name} · tentando leitura automática`, 'loading');
        result = await tryOnlineOcr(file);
      } catch (error) {
        onlineError = error;
        console.warn('[logistica-abertura-upload] OCR online indisponível; usando navegador.', error);
      }
    }

    if (!result?.campos) {
      setStatus(`${file.name} · lendo localmente no navegador`, 'loading');
      result = await browserOcrFile(file, (progress) => {
        setStatus(`${file.name} · ${progress}`, 'loading');
      });
    }

    const filled = applyFields(result?.campos || {});
    if (!filled) {
      setStatus('Arquivo lido, mas nenhum campo foi identificado. Preencha manualmente ou use outro print.', 'warn');
      return;
    }

    const localLabel = result?.provider === 'tesseract-browser' ? ' · leitura local' : '';
    setStatus(`${file.name} · ${filled} campo${filled === 1 ? '' : 's'} preenchido${filled === 1 ? '' : 's'}${localLabel}. Confira antes de enviar.`, 'ok');
  } catch (error) {
    console.error('[logistica-abertura-upload]', { error, onlineError });
    const detail = error?.message || 'Falha ao interpretar o arquivo.';
    setStatus(`Não foi possível ler automaticamente: ${detail}`, 'error');
  } finally {
    button.disabled = false;
    button.textContent = button.dataset.originalText || 'UPLOAD';
  }
}

function injectStyles() {
  if (document.getElementById('abrir-os-upload-style')) return;
  const style = document.createElement('style');
  style.id = 'abrir-os-upload-style';
  style.textContent = `
    .abrir-os-upload-wrap{display:flex;align-items:center;justify-content:flex-end;gap:9px;flex-wrap:wrap;margin-left:auto}
    .abrir-os-upload-btn{display:inline-flex;align-items:center;gap:7px;background:rgba(22,163,74,.18)!important;border-color:rgba(74,222,128,.42)!important;color:#bbf7d0!important;font-weight:900!important}
    .abrir-os-upload-btn:hover{background:rgba(22,163,74,.3)!important;border-color:rgba(74,222,128,.7)!important}
    .abrir-os-upload-btn:disabled{opacity:.65;cursor:wait}
    .abrir-os-upload-status{max-width:460px;color:#7f968b;font-size:11px;line-height:1.35;text-align:right}
    .abrir-os-upload-status[data-tone="loading"]{color:#93c5fd}
    .abrir-os-upload-status[data-tone="ok"]{color:#86efac}
    .abrir-os-upload-status[data-tone="warn"]{color:#fde68a}
    .abrir-os-upload-status[data-tone="error"]{color:#fca5a5}
    .os-upload-filled{border-color:rgba(74,222,128,.78)!important;box-shadow:0 0 0 3px rgba(34,197,94,.10)!important}
    @media(max-width:760px){.abrir-os-upload-wrap{width:100%;justify-content:flex-start;margin-left:0}.abrir-os-upload-status{max-width:none;text-align:left;flex:1 1 100%}.abrir-os-upload-btn{width:100%;justify-content:center}}
  `;
  document.head.appendChild(style);
}

function ensureUploadButton() {
  if (!isLogisticaPage() || location.hash.replace('#', '') !== 'abrir_os') return;
  if (document.getElementById(UPLOAD_ID)) return;

  const formCard = document.querySelector('.abrir-os-card');
  const section = formCard?.closest('section.card');
  const header = section?.querySelector(':scope > .section-head');
  if (!formCard || !header) return;

  const wrap = document.createElement('div');
  wrap.id = UPLOAD_ID;
  wrap.className = 'abrir-os-upload-wrap';
  wrap.innerHTML = `
    <input id="abrirOsUploadInput" type="file" accept="application/pdf,image/jpeg,image/png,image/gif,image/webp" hidden>
    <span id="abrirOsUploadStatus" class="abrir-os-upload-status" data-tone="muted">Anexe PDF ou print para autopreencher os campos.</span>
    <button id="abrirOsUploadBtn" class="btn btn-secondary abrir-os-upload-btn" type="button" title="Anexar PDF ou imagem para leitura automática">
      <span aria-hidden="true">⇧</span> UPLOAD
    </button>
  `;

  const reload = header.querySelector('#abrirOsReload');
  header.insertBefore(wrap, reload || null);

  const input = wrap.querySelector('#abrirOsUploadInput');
  const button = wrap.querySelector('#abrirOsUploadBtn');
  button.addEventListener('click', () => input.click());
  input.addEventListener('change', () => {
    const file = input.files?.[0];
    if (file) processFile(file);
    input.value = '';
  });
}

function scheduleEnsure() {
  requestAnimationFrame(ensureUploadButton);
}

injectStyles();
new MutationObserver(scheduleEnsure).observe(document.documentElement, { childList: true, subtree: true });
window.addEventListener('hashchange', scheduleEnsure);
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', scheduleEnsure, { once: true });
else scheduleEnsure();
