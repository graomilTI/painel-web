// OCR local para o formulário Gestor > Logística > Abrir OS.
// Não usa chaves externas: tenta texto embutido em PDF e, quando necessário,
// executa Tesseract.js no próprio navegador.

const TESSERACT_SRC = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
const PDFJS_SRC = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
const PDFJS_WORKER_SRC = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
const MAX_PDF_PAGES = 5;
const MIN_EMBEDDED_TEXT = 80;

const scriptPromises = new Map();

function loadScript(src, globalName) {
  if (globalThis[globalName]) return Promise.resolve(globalThis[globalName]);
  if (scriptPromises.has(src)) return scriptPromises.get(src);

  const promise = new Promise((resolve, reject) => {
    const existing = [...document.scripts].find((script) => script.src === src);
    const script = existing || document.createElement('script');
    const finish = () => globalThis[globalName]
      ? resolve(globalThis[globalName])
      : reject(new Error(`A biblioteca ${globalName} não ficou disponível.`));

    if (existing) {
      existing.addEventListener('load', finish, { once: true });
      existing.addEventListener('error', () => reject(new Error(`Falha ao carregar ${globalName}.`)), { once: true });
      setTimeout(() => globalThis[globalName] && resolve(globalThis[globalName]), 0);
      return;
    }

    script.src = src;
    script.async = true;
    script.crossOrigin = 'anonymous';
    script.addEventListener('load', finish, { once: true });
    script.addEventListener('error', () => reject(new Error(`Falha ao carregar ${globalName}. Verifique a conexão.`)), { once: true });
    document.head.appendChild(script);
  });

  scriptPromises.set(src, promise);
  return promise;
}

function normalize(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

function clean(value) {
  return String(value ?? '')
    .replace(/^[\s*:#=\-–—|]+/, '')
    .replace(/[\s|]+$/, '')
    .trim();
}

function textLines(text) {
  return String(text ?? '')
    .replace(/\r/g, '')
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

function inlineValue(line, label) {
  const tokens = [':', '=', ' - ', ' – ', ' — ']
    .map((token) => ({ token, position: line.indexOf(token) }))
    .filter((item) => item.position >= 0)
    .sort((a, b) => a.position - b.position);

  if (tokens.length) {
    const first = tokens[0];
    return clean(line.slice(first.position + first.token.length));
  }

  const source = normalize(line);
  const wanted = normalize(label);
  const index = source.indexOf(wanted);
  return index < 0 ? '' : clean(line.slice(Math.min(line.length, index + label.length)));
}

function extract(lines, labels, rejects = []) {
  const wanted = labels.map(normalize);
  const blocked = rejects.map(normalize);

  for (let index = 0; index < lines.length; index += 1) {
    const current = normalize(lines[index]);
    if (blocked.some((term) => current.includes(term))) continue;

    const matchIndex = wanted.findIndex((label) =>
      current === label
      || current.startsWith(`${label}:`)
      || current.startsWith(`${label}=`)
      || current.startsWith(`${label} `)
      || current.startsWith(`${label}-`)
    );
    if (matchIndex < 0) continue;

    const sameLine = inlineValue(lines[index], labels[matchIndex]);
    if (sameLine && normalize(sameLine) !== wanted[matchIndex]) return sameLine;

    const next = clean(lines[index + 1] || '');
    if (next && !wanted.some((label) => normalize(next).startsWith(label))) return next;
  }
  return '';
}

function parseNumber(value) {
  let text = String(value ?? '').replace(/\s/g, '').replace(/[^0-9,.-]/g, '');
  if (!text) return null;
  if (text.includes(',') && text.includes('.')) {
    text = text.lastIndexOf(',') > text.lastIndexOf('.')
      ? text.replace(/\./g, '').replace(',', '.')
      : text.replace(/,/g, '');
  } else if (text.includes(',')) {
    text = text.replace(/\./g, '').replace(',', '.');
  }
  const number = Number(text);
  return Number.isFinite(number) ? number : null;
}

function infer(text, options) {
  const whole = normalize(text);
  return options.find((option) => whole.includes(normalize(option))) || '';
}

function routeFallback(text, side) {
  const normalizedText = String(text ?? '').replace(/\r/g, ' ');
  const patterns = side === 'origem'
    ? [/(?:origem|cidade\s+de\s+embarque)\s*[:=-]\s*([^\n|;]+)/i]
    : [/(?:destino|cidade\s+de\s+destino|cidade\s+destino)\s*[:=-]\s*([^\n|;]+)/i];
  for (const pattern of patterns) {
    const value = clean(normalizedText.match(pattern)?.[1] || '');
    if (value) return value;
  }
  return '';
}

export function structureLogisticaOsText(text) {
  const lines = textLines(text);

  let produto = extract(lines, ['Produto', 'Cultura', 'Mercadoria']);
  if (!produto) produto = infer(text, ['Soja', 'Milho', 'Trigo', 'Sorgo', 'Ervilha']);

  let tipoProduto = extract(lines, ['Tipo de produto', 'Tipo produto', 'Tecnologia', 'Variedade']);
  if (!tipoProduto) tipoProduto = infer(text, [
    'Aflatoxina Negativo', 'Declarado Intacta', 'Intacta Negativo', 'Intacta Positivo',
    'Não Definido', 'OS com teste', 'Participante', 'Transgênico', 'Convencional',
  ]);

  let servico = extract(lines, ['Serviço', 'Tipo de serviço', 'Operação']);
  if (!servico) servico = infer(text, [
    'CLASSIFICAÇÃO TRANSB. SAÍDA', 'CLASSIFICAÇÃO TRANSB. ENTRADA',
    'ACOMPANHAMENTO DE EMBARQUE', 'AUDITORIA', 'FOB', 'CIF',
  ]);

  let trocaNotas = extract(lines, ['Troca de notas', 'Troca notas', 'Troca NF']);
  if (trocaNotas) trocaNotas = ['sim', 's', 'yes', 'true', '1'].includes(normalize(trocaNotas)) ? 'SIM' : 'NAO';

  const cidadeEmbarque = extract(lines, [
    'Cidade de embarque', 'Município de embarque', 'Municipio de embarque', 'Origem cidade',
  ]) || routeFallback(text, 'origem');

  const cidadeDestino = extract(lines, [
    'Cidade destino', 'Cidade de destino', 'Município destino', 'Municipio destino',
  ]) || routeFallback(text, 'destino');

  return {
    contratante_cliente: extract(lines, [
      'Contratante / Cliente', 'Contratante', 'Cliente nacional', 'Cliente',
    ], ['cliente final', 'filial', 'cidade']),
    filial_pagadora: extract(lines, [
      'Filial pagadora', 'Cliente final / filial', 'Cliente final', 'Filial',
    ]),
    produtor: extract(lines, ['Produtor', 'Nome do produtor']),
    armazem_embarque: extract(lines, [
      'Armazém de embarque', 'Armazem de embarque', 'Local de embarque', 'Ponto de embarque',
    ]),
    cidade_embarque: cidadeEmbarque,
    cidade_destino: cidadeDestino,
    local_destino: extract(lines, ['Local de destino', 'Destino final', 'Ponto de destino']),
    numero_contrato: extract(lines, ['Número contrato', 'Numero contrato', 'Nº contrato', 'Contrato']),
    produto,
    tipo_produto: tipoProduto,
    servico,
    volume_inicial: parseNumber(extract(lines, [
      'Volume inicial (Tons)', 'Volume inicial', 'Volume', 'Quantidade', 'Toneladas',
    ])),
    regional: extract(lines, ['Supervisão', 'Supervisao', 'Regional', 'Coordenação', 'Coordenacao']),
    troca_notas: trocaNotas,
  };
}

async function createOcrWorker(onProgress) {
  const Tesseract = await loadScript(TESSERACT_SRC, 'Tesseract');
  const worker = await Tesseract.createWorker('por', Tesseract.OEM?.LSTM_ONLY ?? 1, {
    logger: (message) => {
      if (message?.status === 'recognizing text') {
        const percent = Math.max(0, Math.min(100, Math.round(Number(message.progress || 0) * 100)));
        onProgress?.(`lendo texto no navegador · ${percent}%`);
      }
    },
  });
  await worker.setParameters({ preserve_interword_spaces: '1' });
  return worker;
}

async function recognizeImage(source, onProgress) {
  const worker = await createOcrWorker(onProgress);
  try {
    const result = await worker.recognize(source);
    return String(result?.data?.text || '').trim();
  } finally {
    await worker.terminate();
  }
}

async function embeddedPdfText(pdf, onProgress) {
  const chunks = [];
  const pages = Math.min(pdf.numPages, MAX_PDF_PAGES);
  for (let pageNumber = 1; pageNumber <= pages; pageNumber += 1) {
    onProgress?.(`verificando texto do PDF · página ${pageNumber}/${pages}`);
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const text = content.items.map((item) => item?.str || '').join(' ').replace(/\s+/g, ' ').trim();
    if (text) chunks.push(text);
  }
  return chunks.join('\n');
}

async function renderPdfPage(page) {
  const initial = page.getViewport({ scale: 1.8 });
  const maxSide = Math.max(initial.width, initial.height);
  const scaleFactor = maxSide > 2400 ? 2400 / maxSide : 1;
  const viewport = page.getViewport({ scale: 1.8 * scaleFactor });
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.floor(viewport.width));
  canvas.height = Math.max(1, Math.floor(viewport.height));
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) throw new Error('O navegador não conseguiu preparar a página do PDF.');
  context.fillStyle = '#fff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: context, viewport }).promise;
  return canvas;
}

async function recognizePdf(file, onProgress) {
  const pdfjsLib = await loadScript(PDFJS_SRC, 'pdfjsLib');
  pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_SRC;
  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  const pdf = await loadingTask.promise;

  const embedded = await embeddedPdfText(pdf, onProgress);
  if (embedded.replace(/\s/g, '').length >= MIN_EMBEDDED_TEXT) {
    onProgress?.('texto do PDF identificado');
    return embedded;
  }

  const worker = await createOcrWorker(onProgress);
  const chunks = [];
  try {
    const pages = Math.min(pdf.numPages, MAX_PDF_PAGES);
    for (let pageNumber = 1; pageNumber <= pages; pageNumber += 1) {
      onProgress?.(`preparando página ${pageNumber}/${pages}`);
      const page = await pdf.getPage(pageNumber);
      const canvas = await renderPdfPage(page);
      const result = await worker.recognize(canvas);
      const text = String(result?.data?.text || '').trim();
      if (text) chunks.push(text);
      canvas.width = 1;
      canvas.height = 1;
    }
  } finally {
    await worker.terminate();
  }
  return chunks.join('\n\n');
}

export async function browserOcrFile(file, onProgress) {
  if (!file) throw new Error('Selecione um arquivo.');
  onProgress?.('iniciando leitura local');

  let text = '';
  if (file.type === 'application/pdf' || String(file.name || '').toLowerCase().endsWith('.pdf')) {
    text = await recognizePdf(file, onProgress);
  } else {
    const url = URL.createObjectURL(file);
    try {
      text = await recognizeImage(url, onProgress);
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  if (!text.trim()) throw new Error('Nenhum texto foi identificado no arquivo. Tente um print mais nítido.');
  const campos = structureLogisticaOsText(text);
  return {
    campos,
    texto: text,
    provider: 'tesseract-browser',
    campos_identificados: Object.values(campos).filter((value) => value !== null && String(value).trim() !== '').length,
  };
}
