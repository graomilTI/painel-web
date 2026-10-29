// Frotas · Manutenção › Notas fiscais e comprovantes: lê o arquivo anexado (XML, PDF com texto, PDF escaneado ou imagem) e devolve
// os dados da nota (emitente, número, valor, emissão) e do pagamento (valor, data). A leitura de PDF/imagem é a mesma de Notas
// Fiscais (pdf.js e OCR no navegador); aqui ficam só as regras de interpretação do texto, puras e testáveis.

const numeroBR = (texto) => {
  const t = String(texto || '').replace(/[^\d.,]/g, '');
  if (!t) return null;
  const v = Number(t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t);
  return Number.isFinite(v) && v > 0 ? v : null;
};
const dataISO = (d, m, a) => `${a}-${m}-${d}`;
const valida = (iso) => { const t = Date.parse(`${iso}T12:00:00Z`); return Number.isFinite(t) && t < Date.now() + 86400000 * 2; };

// Valor total da nota a partir do texto do PDF/imagem (só rótulos conhecidos: errar o valor é pior do que pedir ao usuário).
export function valorDaNf(texto) {
  const t = String(texto || '').replace(/\s+/g, ' ');
  const dinheiro = '(?:R\\$)?\\s*([\\d.]+,\\d{2})';
  const rotulos = [
    'VALOR\\s+TOTAL\\s+DA\\s+NOTA', 'VALOR\\s+TOTAL\\s+DA\\s+NF-?E?', 'VALOR\\s+L[IÍ]QUIDO\\s+(?:DA\\s+NFS-?E|DA\\s+NOTA)?',
    'VALOR\\s+TOTAL\\s+DOS\\s+SERVI[CÇ]OS', 'VALOR\\s+DOS\\s+SERVI[CÇ]OS', 'VALOR\\s+TOTAL',
  ];
  for (const r of rotulos) {
    const m = t.match(new RegExp(`${r}\\s*[:\\-]?\\s*${dinheiro}`, 'i'));
    const v = m ? numeroBR(m[1]) : null;
    if (v) return v;
  }
  return null;
}

// Data de emissão (AAAA-MM-DD) pelo rótulo "Data de emissão".
export function dataEmissaoDaNf(texto) {
  const t = String(texto || '').replace(/\s+/g, ' ');
  const m = t.match(/(?:DATA\s+(?:DE\s+)?EMISS[ÃA]O|EMISS[ÃA]O)\s*[:\-]?\s*(\d{2})\/(\d{2})\/(\d{4})/i);
  if (!m) return null;
  const iso = dataISO(m[1], m[2], m[3]);
  return valida(iso) ? iso : null;
}

// Comprovante de pagamento (PIX, TED, recibo): valor e data do pagamento.
export function dadosDoComprovante(texto) {
  const t = String(texto || '').replace(/\s+/g, ' ');
  const rotulado = t.match(/(?:valor(?:\s+(?:pago|da\s+transfer[eê]ncia|do\s+pagamento|total))?|total)\s*[:\-]?\s*(?:R\$)?\s*([\d.]+,\d{2})/i);
  const solto = t.match(/R\$\s*([\d.]+,\d{2})/);
  const valor = numeroBR(rotulado?.[1] || solto?.[1]);
  const d = t.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  const iso = d ? dataISO(d[1], d[2], d[3]) : null;
  return { valor, data: iso && valida(iso) ? iso : null };
}

// XML da NF-e (nNF, vNF, emit) ou da NFS-e (Numero, ValorServicos/ValorLiquidoNfse, Prestador).
export function dadosDoXml(xml) {
  const texto = String(xml || '');
  const tag = (nome, ctx = texto) => {
    const m = ctx.match(new RegExp(`<(?:\\w+:)?${nome}(?:\\s[^>]*)?>([^<]*)</(?:\\w+:)?${nome}>`, 'i'));
    return m ? m[1].trim() : null;
  };
  const bloco = (nome) => texto.match(new RegExp(`<(?:\\w+:)?${nome}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:\\w+:)?${nome}>`, 'i'))?.[1] || '';
  const decimal = (v) => { const n = Number(String(v || '').replace(',', '.')); return Number.isFinite(n) && n > 0 ? n : null; };
  const emit = bloco('emit') || bloco('Prestador') || bloco('PrestadorServico');
  const emissao = tag('dhEmi') || tag('dEmi') || tag('DataEmissao') || tag('dhProc');
  return {
    origem: 'xml',
    fornecedor: tag('xNome', emit) || tag('RazaoSocial', emit) || tag('NomeFantasia', emit),
    cnpj: tag('CNPJ', emit),
    numero: tag('nNF') || tag('Numero'),
    valor: decimal(tag('vNF') || tag('ValorLiquidoNfse') || tag('ValorServicos') || tag('vLiq')),
    data_emissao: emissao && /^\d{4}-\d{2}-\d{2}/.test(emissao) ? emissao.slice(0, 10) : null,
  };
}

// Tipo da nota (peças, serviço ou os dois) pelos itens da manutenção: o GRM classifica a nota por ele.
export function tipoDaNota(itens = []) {
  const tipos = new Set(itens.map((i) => (i.tipo_item === 'servico' ? 'servico' : 'peca')));
  if (tipos.size === 1) return [...tipos][0];
  return 'misto';
}

const extensao = (nome) => String(nome || '').toLowerCase().split('.').pop();

// Lê o arquivo da NF e devolve { fornecedor, cnpj, numero, valor, data_emissao } (campos que não achou ficam nulos).
export async function lerNf(arquivo) {
  if (!arquivo) return null;
  if (extensao(arquivo.name) === 'xml') return dadosDoXml(await arquivo.text());
  const { lerTextoDoArquivo, parseNfText } = await import('./notas-fiscais/service.js');
  const texto = await lerTextoDoArquivo(arquivo, arquivo.name);
  const nf = parseNfText(texto);
  return { fornecedor: nf.fornecedor, cnpj: nf.cnpj, numero: nf.numero, valor: valorDaNf(texto), data_emissao: dataEmissaoDaNf(texto), origem: 'ocr' };
}

// Lê o comprovante e devolve { valor, data }.
export async function lerComprovante(arquivo) {
  if (!arquivo) return null;
  const { lerTextoDoArquivo } = await import('./notas-fiscais/service.js');
  return dadosDoComprovante(await lerTextoDoArquivo(arquivo, arquivo.name));
}
