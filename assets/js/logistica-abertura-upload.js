import { supabase } from './supabaseClient.js';
import { browserOcrFile } from './logistica-browser-ocr.js?v=20260803-browser-ocr1';
import { enhanceLogisticaOsFields } from './logistica-os-ai-structurer.js?v=20260803-ai-fields1';

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
  // "produto" tem que ser o PRIMEIRO campo aplicado: seu evento "input"
  // dispara um re-render da aba inteira em logistica.js (pra mostrar o
  // bloco de Testes certo pro produto) — visto ao vivo 04/08: preencher
  // produto no meio/fim do loop apagava todo campo já aplicado antes dele
  // (a re-render troca os elementos do DOM por outros novos e vazios).
  // Aplicando produto primeiro, a única re-render acontece antes de
  // qualquer outro campo ser tocado.
  if (applyField(FIELD_IDS.produto, fields?.produto)) filled += 1;
  Object.entries(FIELD_IDS).forEach(([key, id]) => {
    if (key === 'produto') return;
    if (applyField(id, fields?.[key])) filled += 1;
  });
  filled += applyTestes(fields?.testes);
  return filled;
}

// O checkbox de cada teste só existe no DOM depois que #osProduto dispara
// "input" (applyField acima já dispara isso) e assets/js/logistica.js
// re-renderiza mostrando o bloco condicional — como esse listener roda de
// forma síncrona, os checkboxes já estão prontos aqui. Marcar via
// checked=true + dispatchEvent (não mexe direto no estado interno do outro
// módulo) é o mesmo padrão usado por logistica-abertura-os-correcao.js.
function applyTestes(testes) {
  const keys = Array.isArray(testes) ? testes : [];
  let marcados = 0;
  keys.forEach((key) => {
    const chk = document.querySelector(`[data-teste-key="${CSS.escape(String(key))}"]`);
    if (!chk || chk.checked) return;
    chk.checked = true;
    chk.dispatchEvent(new Event('change', { bubbles: true }));
    chk.closest('.abrir-os-teste-chip')?.classList.add('os-upload-filled');
    marcados += 1;
  });
  return marcados;
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

const VPS_OCR_FUNCTION = 'ocr-documento-local';
const VPS_OCR_BUCKET = 'os-laudos';
// Visto ao vivo 04/08: o modelo "server" do PaddleOCR em CPU levou 86-101s
// pra uma única imagem — 45s (chute inicial) desistia cedo demais e caía
// pro próximo provedor no meio do processamento, criando um job novo a
// cada tentativa (parecia "loop" pro usuário). 3min dá folga confortável.
const VPS_OCR_POLL_TIMEOUT_MS = 180000;
const OCR_PROMPT_ABERTURA = 'Leia esta solicitação de abertura de O.S. logística e devolva todo o texto visível.';

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

async function uploadForVpsOcr(prepared) {
  const ext = prepared.tipo === 'pdf' ? 'pdf' : 'jpg';
  const path = `abertura-os-ocr/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from(VPS_OCR_BUCKET).upload(path, prepared.blob, {
    upsert: true,
    contentType: prepared.blob.type || (ext === 'pdf' ? 'application/pdf' : 'image/jpeg'),
  });
  if (error) throw error;
  const { data } = supabase.storage.from(VPS_OCR_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

async function invokeVpsOcr(body) {
  const { data, error } = await supabase.functions.invoke(VPS_OCR_FUNCTION, { body });
  if (error) throw new Error(await readFunctionError(error));
  if (data?.error) throw new Error(data.error);
  return data || {};
}

// Leitor local (PaddleOCR) já instalado no VPS, reaproveitando a mesma fila
// assíncrona de Logística > O.S. > Conferências (document_type='texto_livre'
// pula a exigência de achar placa, que só faz sentido pra cargas). Sem custo
// por página e sem enviar o documento pra fora — por isso é o primeiro
// caminho tentado, antes do provedor online (Groq) e do OCR local no
// navegador. Se o worker do VPS estiver offline ou demorar mais que
// VPS_OCR_POLL_TIMEOUT_MS, cai pro próximo provedor da cadeia.
async function tryVpsOcr(prepared, fileName, onProgress) {
  const url = await uploadForVpsOcr(prepared);
  let state = await invokeVpsOcr({
    action: 'submit',
    url,
    tipo: prepared.tipo,
    document_type: 'texto_livre',
    instrucao: OCR_PROMPT_ABERTURA,
  });
  if (state.worker_online === false) throw new Error('O worker PaddleOCR do VPS está offline.');

  const jobId = Number(state.job_id);
  if (!Number.isInteger(jobId)) throw new Error('O servidor não devolveu o job do OCR local.');
  const startedAt = Date.now();

  while (state.status !== 'CONCLUIDO') {
    if (['ERRO', 'CANCELADO'].includes(String(state.status))) {
      throw new Error(state.error || 'Falha no OCR local do VPS.');
    }
    if (Date.now() - startedAt > VPS_OCR_POLL_TIMEOUT_MS) {
      throw new Error('O OCR local do VPS demorou demais.');
    }
    onProgress?.(`lendo no servidor (PaddleOCR) · ${Math.round(Number(state.progress || 0))}%`);
    await sleep(Number(state.poll_after_ms || 2000));
    state = await invokeVpsOcr({ action: 'status', job_id: jobId });
  }

  return { texto: state.raw_text || '', campos: {}, provider: 'paddleocr-vps' };
}

async function tryOnlineOcr(prepared, fileName) {
  if (onlineProviderUnavailable) return null;

  const base64 = await blobToBase64(prepared.blob);
  const { data, error } = await supabase.functions.invoke('logistica-os-autopreencher', {
    body: {
      base64,
      tipo: prepared.tipo,
      nome_arquivo: fileName,
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
  // Preparado 1x e reaproveitado nos dois caminhos (online e fallback local)
  // — evita comprimir a imagem duas vezes e, principalmente, evita rodar o
  // OCR local (Tesseract) na foto/print ORIGINAL sem redimensionar, que era
  // bem mais lento em fotos de celular grandes sem ganho nenhum de exatidão.
  let prepared = null;
  try {
    prepared = await prepareFile(file);
  } catch (error) {
    console.warn('[logistica-abertura-upload] Falha ao preparar arquivo; usando original.', error);
  }

  try {
    let result = null;

    if (prepared) {
      try {
        setStatus(`${file.name} · tentando leitura no servidor (PaddleOCR)`, 'loading');
        result = await tryVpsOcr(prepared, file.name, (msg) => setStatus(`${file.name} · ${msg}`, 'loading'));
      } catch (error) {
        console.warn('[logistica-abertura-upload] OCR do VPS indisponível; tentando outro provedor.', error);
      }
    }

    if (!result?.texto && !onlineProviderUnavailable && prepared) {
      try {
        setStatus(`${file.name} · tentando leitura automática`, 'loading');
        result = await tryOnlineOcr(prepared, file.name);
      } catch (error) {
        onlineError = error;
        console.warn('[logistica-abertura-upload] OCR online indisponível; usando navegador.', error);
      }
    }

    if (!result?.campos) {
      setStatus(`${file.name} · lendo localmente no navegador`, 'loading');
      // prepared.blob já vem redimensionado/comprimido (mesmo preparo usado
      // pro caminho online) — pra PDF, prepared.blob é o próprio arquivo
      // original (prepareFile não mexe em PDF, só em imagem).
      result = await browserOcrFile(prepared?.blob ?? file, (progress) => {
        setStatus(`${file.name} · ${progress}`, 'loading');
      });
    }

    if (result?.texto) {
      setStatus(`${file.name} · IA organizando os campos`, 'loading');
      result.campos = await enhanceLogisticaOsFields(
        result.texto,
        result.campos || {},
        (progress) => setStatus(`${file.name} · ${progress}`, 'loading'),
      );
    }

    const filled = applyFields(result?.campos || {});
    if (!filled) {
      setStatus('Arquivo lido, mas nenhum campo foi identificado. Preencha manualmente ou use outro print.', 'warn');
      return;
    }

    const localLabel = result?.provider === 'paddleocr-vps' ? ' · PaddleOCR (servidor) + IA'
      : result?.provider === 'tesseract-browser' ? ' · leitura local + IA' : ' · IA';
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
  // Não confiar só em location.hash === '#abrir_os': quem abre /painel/logistica
  // direto (sem hash na URL, ex.: favorito ou link colado) já cai na aba Abrir
  // OS por padrão (state.tab em logistica.js), mas o hash fica vazio até o
  // usuário clicar na aba manualmente — checar a presença do card é o sinal
  // confiável de que estamos na aba certa, com ou sem hash.
  if (!isLogisticaPage()) return;
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
    <span id="abrirOsUploadStatus" class="abrir-os-upload-status" data-tone="muted">Anexe, cole (Ctrl+V) ou arraste um PDF/print; a IA identifica os campos mesmo em formatos diferentes.</span>
    <button id="abrirOsUploadBtn" class="btn btn-secondary abrir-os-upload-btn" type="button" title="Anexar PDF ou imagem para leitura automática (também aceita colar com Ctrl+V)">
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

// Ponte com o botão "🚚 Abrir O.S." da caixa pessoal do Gestor
// (assets/js/gestor-email.js): lá a IA já leu o e-mail e guardou os campos
// aqui antes de navegar pra esta página — só aplica 1x por carregamento e
// limpa a chave logo em seguida pra não reaplicar num F5.
const EMAIL_PREFILL_KEY = 'logisticaAberturaOsEmailPrefill';
let emailPrefillConsumed = false;

function consumeEmailPrefill() {
  if (emailPrefillConsumed) return;
  if (!isLogisticaPage()) return;
  if (!document.getElementById(UPLOAD_ID)) return;
  let raw;
  try {
    raw = sessionStorage.getItem(EMAIL_PREFILL_KEY);
  } catch {
    return;
  }
  if (!raw) return;
  emailPrefillConsumed = true;
  sessionStorage.removeItem(EMAIL_PREFILL_KEY);
  document.querySelectorAll('.os-upload-filled').forEach((field) => field.classList.remove('os-upload-filled'));
  try {
    const campos = JSON.parse(raw);
    const filled = applyFields(campos || {});
    setStatus(
      filled
        ? `E-mail do Gestor · ${filled} campo${filled === 1 ? '' : 's'} preenchido${filled === 1 ? '' : 's'} automaticamente. Confira antes de enviar.`
        : 'E-mail recebido, mas nenhum campo foi identificado automaticamente. Preencha manualmente.',
      filled ? 'ok' : 'warn',
    );
  } catch (error) {
    console.warn('[logistica-abertura-upload] prefill de e-mail inválido', error);
  }
}

function scheduleEnsure() {
  requestAnimationFrame(() => {
    ensureUploadButton();
    consumeEmailPrefill();
  });
}

// Cola (Ctrl+V) uma captura de tela direto na aba Abrir OS — mesmo fluxo de
// leitura automática do botão UPLOAD, sem precisar salvar o print em
// arquivo antes. Só age se a área de transferência tiver uma IMAGEM; colar
// texto normal em qualquer campo continua funcionando igual.
function handlePaste(event) {
  if (!isLogisticaPage()) return;
  if (!document.getElementById(UPLOAD_ID)) return;
  const items = [...(event.clipboardData?.items || [])];
  const imageItem = items.find((item) => item.kind === 'file' && item.type.startsWith('image/'));
  if (!imageItem) return;
  const file = imageItem.getAsFile();
  if (!file) return;
  event.preventDefault();
  processFile(file);
}

injectStyles();
new MutationObserver(scheduleEnsure).observe(document.documentElement, { childList: true, subtree: true });
window.addEventListener('hashchange', scheduleEnsure);
document.addEventListener('paste', handlePaste);
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', scheduleEnsure, { once: true });
else scheduleEnsure();
