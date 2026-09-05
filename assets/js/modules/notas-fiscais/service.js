// assets/js/modules/notas-fiscais/service.js
// Regras de negócio de Notas Fiscais (padrão docs/ARQUITETURA.md).
// Não toca em DOM de página; extração de NF (XML/OCR) recebe elementos
// apenas como alvo técnico das bibliotecas de leitura.

import {
  listarItensComNf,
  listarPagamentosPorItens,
  marcarItensLancados,
  estornarItens,
  salvarDadosNfNoPagamento,
} from './repository.js';
import { registrarAuditoria } from '../../core/audit.js';
import { validarParaLancamento } from './validators.js';
import { supabase } from '../../supabaseClient.js';

// ── carga consolidada ────────────────────────────────────────────────────────
export async function carregarNotas({ chaveCorrida } = {}) {
  const inicio = performance.now();
  const itens = await listarItensComNf({ chaveCorrida });
  const pagamentos = await listarPagamentosPorItens(itens.map((r) => r.id).filter(Boolean));
  return {
    itens,
    pagamentos,
    duracaoMs: Math.round(performance.now() - inicio),
    atualizadoEm: new Date().toISOString(),
  };
}

// ── agrupamento por NF ───────────────────────────────────────────────────────
export function agruparPorNf(itens, pagamentos) {
  const mapa = new Map();
  for (const r of itens) {
    const key = r.nf_url;
    if (!mapa.has(key)) mapa.set(key, []);
    mapa.get(key).push(r);
  }
  return [...mapa.values()].map((grupo) => {
    const first = grupo[0];
    const sol0 = first.compras_solicitacoes || {};
    const lancadoEm = grupo.filter((r) => r.nf_lancado_em).map((r) => r.nf_lancado_em).sort().pop() || null;
    const pag = grupo.reduce((found, r) => found || pagamentos[r.id] || null, null);
    return {
      key: first.nf_url,
      ids: grupo.map((r) => r.id),
      nf_url: first.nf_url,
      comprovante_url: grupo.find((r) => r.comprovante_url)?.comprovante_url || null,
      valor_total: grupo.reduce((s, r) => s + Number(r.valor_total || 0), 0),
      comprado_em: grupo.map((r) => r.comprado_em || '').sort().pop() || sol0.data_solicitacao || '',
      regional: sol0.coordenacao || '-',
      solicitante: [...new Set(grupo.map((r) => (r.compras_solicitacoes || {}).solicitante).filter(Boolean))].join(', ') || '-',
      fornecedor: pag?.fornecedor || pag?.favorecido_nome || '-',
      cnpj: pag?.favorecido_documento || '-',
      numero: pag?.nf_numero || null,
      nf_lancado: grupo.every((r) => r.nf_lancado),
      nf_lancado_em: lancadoEm,
      itens: grupo,
    };
  }).map((g) => {
    g.categoria = sugerirCategoria(g);
    g.pendencias = pendenciasDoGrupo(g);
    return g;
  }).sort((a, b) => (b.comprado_em > a.comprado_em ? 1 : -1));
}

// ── pendências e categorização (plano 6.3/6.4) ──────────────────────────────
// Regras de categoria por palavra-chave do material (base ajustável — as
// correções manuais alimentam nf_categorizacao_correcoes quando a migration
// estiver aplicada).
const REGRAS_CATEGORIA = [
  { categoria: 'EPI', re: /\b(bota|luva|capacete|oculos|óculos|protetor|epi|colete|abafador|máscara|mascara)\b/i },
  { categoria: 'Uniforme', re: /\b(camisa|camiseta|calça|calca|uniforme|blusa|jaqueta|farda)\b/i },
  { categoria: 'Ferramentas', re: /\b(chave|alicate|martelo|furadeira|serra|trena|ferramenta|parafusadeira)\b/i },
  { categoria: 'Escritório', re: /\b(papel|caneta|toner|cartucho|grampeador|escritorio|escritório|impressora)\b/i },
  { categoria: 'Limpeza', re: /\b(detergente|sabão|sabao|desinfetante|vassoura|rodo|limpeza|alcool|álcool)\b/i },
  { categoria: 'Informática', re: /\b(mouse|teclado|monitor|notebook|cabo|hd|ssd|mem[oó]ria|celular|carregador)\b/i },
  { categoria: 'Alimentação', re: /\b(café|cafe|açúcar|acucar|agua|água|copo|alimento|lanche|marmita)\b/i },
  { categoria: 'Manutenção', re: /\b(tinta|cimento|madeira|prego|parafuso|lampada|lâmpada|fita|cola|lona)\b/i },
];

export function sugerirCategoria(grupo) {
  const texto = (grupo.itens || []).map((r) => r.material || '').join(' ');
  for (const regra of REGRAS_CATEGORIA) {
    if (regra.re.test(texto)) return regra.categoria;
  }
  return 'Geral';
}

/** Pendências objetivas de um grupo de NF (plano 6.4): o que falta para o
 *  lançamento ficar completo, exibido como badges na janela Pendentes. */
export function pendenciasDoGrupo(grupo) {
  const p = [];
  if (!grupo.numero) p.push('Sem número de NF (OCR não processado)');
  if (!grupo.cnpj || grupo.cnpj === '-') p.push('Sem CNPJ do fornecedor');
  if (!grupo.fornecedor || grupo.fornecedor === '-') p.push('Sem fornecedor');
  if (!grupo.comprovante_url) p.push('Sem comprovante');
  if (!Number(grupo.valor_total)) p.push('Valor zerado');
  return p;
}

export function resumo(grupos) {
  const pendentes = grupos.filter((g) => !g.nf_lancado);
  const lancados = grupos.filter((g) => g.nf_lancado);
  return {
    pendentes: pendentes.length,
    lancados: lancados.length,
    totalPendente: pendentes.reduce((s, g) => s + g.valor_total, 0),
    totalLancado: lancados.reduce((s, g) => s + g.valor_total, 0),
  };
}

export function descricaoItens(itens) {
  return itens.map((r) => {
    const qtd = r.quantidade || r.unidade || 1;
    let s = `${qtd} un ${r.material}`;
    if (r.tamanho) s += ` (${r.tamanho})`;
    if (r.marca) s += ` — ${r.marca}`;
    return s;
  }).join(' · ');
}

// Extrai o path relativo ao bucket de uma URL pública do Supabase Storage.
// nf_url do Compras nem sempre é um arquivo real: pode ser um link externo
// colado à mão, ou só o número da NF digitado (campo "URL ou número da NF").
// Só dá pra mandar pro agente do GRM quando é de fato um arquivo no bucket
// notas-fiscais — nos outros casos, "Lançar" continua só marcando o flag.
function storagePathDoBucket(url, bucket) {
  const marcador = `/storage/v1/object/public/${bucket}/`;
  const indice = String(url || '').indexOf(marcador);
  if (indice === -1) return null;
  try { return decodeURIComponent(url.slice(indice + marcador.length)); }
  catch { return url.slice(indice + marcador.length); }
}

// Ponte Compras → GRM: o botão "Lançar" aqui sempre só marcou nf_lancado=true
// em compras_itens (bookkeeping interno), sem nunca ter chamado o GRM de
// verdade. Agora, quando a NF já é um arquivo real no bucket notas-fiscais,
// a mesma ação também cria uma linha em grm_nf_lancamentos — a fila que o
// agente de lançamento (grmserver-lancar-notas-fiscais-api.js) processa de
// verdade. Retorna true se enfileirou (ou já estava enfileirada de um
// lançamento anterior), false quando não há arquivo pra mandar.
async function enviarParaFilaGrm(grupo) {
  const path = storagePathDoBucket(grupo.nf_url, 'notas-fiscais');
  if (!path) return false;
  const { data: { session } } = await supabase.auth.getSession();
  const { error } = await supabase.from('grm_nf_lancamentos').insert({
    storage_bucket: 'notas-fiscais',
    storage_path: path,
    arquivo_nome: path.split('/').pop(),
    setor: 'COMPRAS',
    status: 'NOVO',
    enviado_por: session?.user?.id || null,
  });
  if (error && error.code !== '23505') throw error; // 23505 = essa NF já estava na fila
  return true;
}

// ── lançar NF (com auditoria) ────────────────────────────────────────────────
export async function lancarNf(grupo) {
  const quando = new Date().toISOString();
  // Validação mínima antes do lançamento (6.4/6.6). O fluxo atual de
  // compras garante origem via compras_solicitacoes, então a exigência de
  // origem fica satisfeita pelos ids dos itens; os demais campos são
  // verificados de forma defensiva sem bloquear grupos legados.
  const { valido, pendencias } = validarParaLancamento(
    { numero_nf: grupo.numero, valor: grupo.valor_total, data_emissao: grupo.comprado_em, categoria: 'compras', origem_id: grupo.ids?.[0] },
    { exigirOrigem: true },
  );
  if (!valido) {
    const criticas = pendencias.filter((p) => p.includes('origem') || p.includes('Valor'));
    if (criticas.length) {
      const error = new Error(criticas.join(' '));
      error.pendencias = pendencias;
      throw error;
    }
  }
  let enviadoGrm = false;
  let erroGrm = null;
  try {
    await marcarItensLancados(grupo.ids, quando);
    try {
      enviadoGrm = await enviarParaFilaGrm(grupo);
    } catch (error) {
      erroGrm = error;
      console.warn('[notas-fiscais] não consegui enviar pra fila de lançamento do GRM:', error.message);
    }
    await registrarAuditoria({
      modulo: 'notas-fiscais',
      tabela: 'compras_itens',
      registroId: grupo.ids.join(','),
      acao: 'nf_lancada',
      valorAnterior: { nf_lancado: false },
      valorNovo: {
        nf_lancado: true, nf_lancado_em: quando, nf_url: grupo.nf_url, valor_total: grupo.valor_total,
        enviado_fila_grm: enviadoGrm, erro_fila_grm: erroGrm?.message || null,
      },
    });
    return { quando, enviadoGrm };
  } catch (error) {
    await registrarAuditoria({
      modulo: 'notas-fiscais',
      tabela: 'compras_itens',
      registroId: grupo.ids.join(','),
      acao: 'nf_lancada',
      erro: String(error?.message || error),
    });
    throw error;
  }
}

// ── estornar NF (com justificativa obrigatória — plano 6.5) ────────────────
export async function estornarNf(grupo, { justificativa, usuario = null } = {}) {
  const texto = String(justificativa || '').trim();
  if (texto.length < 5) {
    throw new Error('O estorno exige uma justificativa com pelo menos 5 caracteres.');
  }
  try {
    await estornarItens(grupo.ids);
    await registrarAuditoria({
      modulo: 'notas-fiscais',
      tabela: 'compras_itens',
      registroId: grupo.ids.join(','),
      acao: 'nf_estornada',
      valorAnterior: { nf_lancado: true, nf_lancado_em: grupo.nf_lancado_em || null },
      valorNovo: { nf_lancado: false, justificativa: texto, usuario },
    });
    return true;
  } catch (error) {
    await registrarAuditoria({
      modulo: 'notas-fiscais',
      tabela: 'compras_itens',
      registroId: grupo.ids.join(','),
      acao: 'nf_estornada',
      erro: String(error?.message || error),
    });
    throw error;
  }
}

// ── extração de dados da NF (XML → PDF texto → OCR) ─────────────────────────
export function formatCnpj(v) {
  const d = String(v || '').replace(/\D/g, '');
  if (d.length !== 14) return v || '-';
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

export function isUrl(v) {
  return /^https?:\/\//i.test(String(v || ''));
}

async function extractFromXml(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('xml') && !/\.xml(\?|$)/i.test(url)) return null;
    const text = await res.text();
    const doc = new DOMParser().parseFromString(text, 'application/xml');
    const q = (sel) => doc.querySelector(sel)?.textContent?.trim() || null;
    return { fornecedor: q('emit xNome'), cnpj: q('emit CNPJ'), numero: q('nNF'), origem: 'xml' };
  } catch {
    return null;
  }
}

function loadExternalScript(src, globalName) {
  if (globalName && window[globalName]) return Promise.resolve(window[globalName]);
  return new Promise((resolve, reject) => {
    const existing = [...document.scripts].find((s) => s.src === src);
    if (existing) {
      existing.addEventListener('load', () => resolve(globalName ? window[globalName] : true), { once: true });
      existing.addEventListener('error', reject, { once: true });
      return;
    }
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.onload = () => resolve(globalName ? window[globalName] : true);
    script.onerror = () => reject(new Error(`Falha ao carregar biblioteca OCR: ${src}`));
    document.head.appendChild(script);
  });
}

async function blobFromUrl(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`Falha ao baixar NF (${res.status})`);
  return await res.blob();
}

function fileLooksPdf(url, blob) {
  return String(blob?.type || '').includes('pdf') || /\.pdf(\?|$)/i.test(String(url || ''));
}

async function pdfjsLib() {
  const pdfjs = await loadExternalScript('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js', 'pdfjsLib');
  pdfjs.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  return pdfjs;
}

async function readPdfText(blob) {
  const pdfjs = await pdfjsLib();
  const data = await blob.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data }).promise;
  const parts = [];
  const maxPages = Math.min(pdf.numPages || 1, 2);
  for (let i = 1; i <= maxPages; i += 1) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    parts.push(textContent.items.map((item) => item.str || '').join(' '));
  }
  return parts.join('\n');
}

async function renderPdfFirstPage(blob) {
  const pdfjs = await pdfjsLib();
  const data = await blob.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data }).promise;
  const page = await pdf.getPage(1);
  const viewport = page.getViewport({ scale: 2.4 });
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  await page.render({ canvasContext: ctx, viewport }).promise;
  return canvas;
}

async function imageElementFromBlob(blob) {
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    return img;
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
}

async function runOcr(target) {
  const Tesseract = await loadExternalScript('https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js', 'Tesseract');
  const result = await Tesseract.recognize(target, 'por+eng', { logger: () => {} });
  return result?.data?.text || '';
}

function normalizeOcrText(text) {
  return String(text || '')
    .replace(/[|]/g, ' ')
    .replace(/[º°]/g, 'º')
    .replace(/\r/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function onlyDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

function cleanFornecedorName(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .replace(/\b(CNPJ|CPF|INSCRI[CÇ][AÃ]O|ENDERE[CÇ]O|FONE|TELEFONE|DANFE|DOCUMENTO AUXILIAR).*$/i, '')
    .replace(/[,:;.-]+$/g, '')
    .trim();
}

export function parseNfText(rawText) {
  const text = normalizeOcrText(rawText);
  const beforeDest = text.split(/DESTINAT[ÁA]RIO\/?REMETENTE/i)[0] || text;

  let numero = null;
  const numeroPatterns = [
    /NF\s*-?\s*E\s*(?:N[ºO°]|NO|NÚMERO|NUMERO)?\s*[:\-]?\s*([0-9]{3,})/i,
    /DANFE[\s\S]{0,220}?(?:N[ºO°]|NO|NÚMERO|NUMERO)\s*[:\-]?\s*([0-9]{3,})/i,
    /(?:N[ºO°]|NO|NÚMERO|NUMERO)\s*[:\-]?\s*([0-9]{3,})\s*(?:S[ÉE]RIE|SERIE)/i,
  ];
  for (const pattern of numeroPatterns) {
    const match = text.match(pattern);
    if (match?.[1]) { numero = match[1].replace(/^0+(?=\d)/, '') || match[1]; break; }
  }

  let cnpj = null;
  const cnpjCandidates = [...beforeDest.matchAll(/\b\d{2}[\.\s]?\d{3}[\.\s]?\d{3}[\/\s]?\d{4}[-\s]?\d{2}\b/g)]
    .map((m) => onlyDigits(m[0]))
    .filter((d) => d.length === 14);
  if (cnpjCandidates.length) cnpj = cnpjCandidates[cnpjCandidates.length - 1];
  if (!cnpj) {
    const cnpjLabel = beforeDest.match(/CNPJ\s*(?:DO FORNECEDOR)?\s*[:\-]?\s*(\d{2}[\.\s]?\d{3}[\.\s]?\d{3}[\/\s]?\d{4}[-\s]?\d{2})/i);
    if (cnpjLabel?.[1]) cnpj = onlyDigits(cnpjLabel[1]);
  }

  let fornecedor = null;
  const recebemos = text.match(/RECEBEMOS\s+DE\s+([\s\S]{6,160}?)\s+OS\s+(?:PRODUTOS|SERVI[CÇ]OS)/i);
  if (recebemos?.[1]) fornecedor = cleanFornecedorName(recebemos[1]);

  if (!fornecedor) {
    const lines = beforeDest.split('\n').map((line) => cleanFornecedorName(line)).filter(Boolean);
    const bad = /^(DANFE|DOCUMENTO|AUXILIAR|NOTA FISCAL|ELETR[ÔO]NICA|CHAVE|PROTOCOLO|NATUREZA|INSCRI|DATA|FONE|WWW|HTTP|CONTATO|AVENIDA|RUA|CEP|S[ÉE]RIE|P[ÁA]GINA|SA[IÍ]DA|ENTRADA|CONTROLE|CONSULTA)$/i;
    const candidates = lines
      .filter((line) => line.length >= 8 && /[A-ZÁÉÍÓÚÃÕÇ]{3}/i.test(line) && !bad.test(line))
      .filter((line) => !/\d{2}\.\d{3}|\d{2}\/\d{2}\/\d{4}|^\d+$/.test(line))
      .filter((line) => !/GRAOMIL\s+LTDA/i.test(line));
    fornecedor = candidates.find((line) => /LTDA|EIRELI|ME|EPP|S\/A|SA\b/i.test(line)) || candidates[0] || null;
  }

  return {
    fornecedor: fornecedor || null,
    cnpj: cnpj ? formatCnpj(cnpj) : null,
    numero: numero || null,
    rawText: text,
    origem: text ? 'ocr' : null,
  };
}

export async function extractFromNfFile(url) {
  const xml = await extractFromXml(url);
  if (xml?.fornecedor || xml?.cnpj || xml?.numero) return xml;

  try {
    const blob = await blobFromUrl(url);
    let text = '';
    if (fileLooksPdf(url, blob)) {
      try { text = await readPdfText(blob); } catch { text = ''; }
      if (!text || text.replace(/\s/g, '').length < 80) {
        const canvas = await renderPdfFirstPage(blob);
        text = await runOcr(canvas);
      }
    } else {
      const img = await imageElementFromBlob(blob);
      text = await runOcr(img);
    }
    return parseNfText(text);
  } catch (error) {
    console.warn('[Notas Fiscais] OCR NF indisponível:', error);
    return null;
  }
}

export async function salvarDadosExtraidos(grupo, extracted, pagamentosCache) {
  if (!extracted || (!extracted.fornecedor && !extracted.cnpj && !extracted.numero)) return;
  const payload = {};
  if (extracted.fornecedor) payload.fornecedor = extracted.fornecedor;
  if (extracted.cnpj) payload.favorecido_documento = extracted.cnpj;
  if (extracted.numero) payload.nf_numero = extracted.numero;
  if (!Object.keys(payload).length) return;

  for (const id of grupo.ids || []) {
    try {
      await salvarDadosNfNoPagamento(id, payload);
    } catch { /* pagamento pode não existir para o item */ }
    if (pagamentosCache) pagamentosCache[id] = { ...(pagamentosCache[id] || {}), ...payload };
  }
}
