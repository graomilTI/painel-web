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
    numero: tag('nNF') || tag('nNFSe') || tag('Numero'),
    valor: decimal(tag('vNF') || tag('ValorLiquidoNfse') || tag('ValorServicos') || tag('vLiq') || tag('vServ')),
    data_emissao: emissao && /^\d{4}-\d{2}-\d{2}/.test(emissao) ? emissao.slice(0, 10) : null,
  };
}

// ---- DANFSe (NFS-e padrão nacional, PDF baixado do portal oficial) ----
// O PDF é uma grade de "linha de rótulos / linha de valores" alinhada em colunas: cada valor é lido na coluna do rótulo acima dele
// (mesma regra do agente que lança as NFs no GRM). `itens` = texto do pdf.js com posição { str, x, y, w }.
const semAcento = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();

// Agrupa os itens em linhas (por y, de cima para baixo) e cada linha em células (itens colados viram uma célula só).
export function agruparCelulas(itens = []) {
  const ordenados = [...itens].sort((a, b) => b.y - a.y || a.x - b.x);
  const linhas = [];
  for (const it of ordenados) {
    const linha = linhas.find((l) => Math.abs(l.y - it.y) <= 2.5);
    if (linha) linha.itens.push(it); else linhas.push({ y: it.y, itens: [it] });
  }
  return linhas.map((l) => {
    const cels = [];
    for (const it of l.itens.sort((a, b) => a.x - b.x)) {
      const ant = cels[cels.length - 1];
      if (ant && it.x - ant.fim < 6) { ant.texto += `${it.x - ant.fim > 0.5 ? ' ' : ''}${it.str}`; ant.fim = it.x + (it.w || 0); } else cels.push({ x: it.x, fim: it.x + (it.w || 0), texto: it.str });
    }
    return { y: l.y, cels: cels.map((c) => ({ x: c.x, texto: c.texto.trim() })) };
  });
}

// Valor sob o rótulo (regex sobre o texto da célula sem acento, maiúsculo), entre as linhas [de, ate).
function valorSob(linhas, rotulo, de = 0, ate = linhas.length) {
  for (let i = de; i < Math.min(ate, linhas.length) - 1; i += 1) {
    const cab = linhas[i].cels;
    const idx = cab.findIndex((c) => rotulo.test(semAcento(c.texto)));
    if (idx < 0) continue;
    const prox = linhas.slice(i + 1, ate).find((l) => l.cels.length);
    if (!prox) return null;
    const alvo = cab[idx].x;
    const limite = idx + 1 < cab.length ? cab[idx + 1].x : Infinity;
    const v = prox.cels.filter((c) => c.x >= alvo - 3 && c.x < limite - 3);
    return v.length ? v[0].texto : null;
  }
  return null;
}

const indiceDe = (linhas, regex) => linhas.findIndex((l) => l.cels.some((c) => regex.test(semAcento(c.texto))));
const soDigitos = (v) => String(v || '').replace(/\D/g, '');
const dinheiroNa = (v) => numeroBR((String(v || '').match(/[\d.]+,\d{2}/) || [])[0]);
const isoDe = (v) => { const m = String(v || '').match(/(\d{2})\/(\d{2})\/(\d{4})/); return m ? dataISO(m[1], m[2], m[3]) : null; };

// Devolve { fornecedor, cnpj, numero, valor, data_emissao } ou null quando o PDF não é um DANFSe reconhecível.
export function dadosDoDanfse(linhas = []) {
  const plano = semAcento(linhas.map((l) => l.cels.map((c) => c.texto).join(' ')).join('\n'));
  if (!/DANFSE|DOCUMENTO AUXILIAR DA NFS-?E/.test(plano)) return null;
  const iPrest = indiceDe(linhas, /^PRESTADOR \/ FORNECEDOR$/);
  const iToma = indiceDe(linhas, /^TOMADOR \/ ADQUIRENTE$/);
  const prestadorAte = iToma > iPrest ? iToma : linhas.length;
  const numero = soDigitos(valorSob(linhas, /^NUMERO DA NFS-?E$/)) || null;
  const emissao = isoDe(valorSob(linhas, /^DATA E HORA DA EMISSAO DA NFS-?E$/) || valorSob(linhas, /^COMPETENCIA DA NFS-?E$/));
  const valor = dinheiroNa(valorSob(linhas, /^VALOR LIQUIDO DA NFS-?E$/)) ?? dinheiroNa(valorSob(linhas, /^VALOR DA OPERACAO \/ SERVICO$/));
  const fornecedor = iPrest >= 0 ? valorSob(linhas, /^NOME \/ NOME EMPRESARIAL$/, iPrest, prestadorAte) : null;
  const cnpj = iPrest >= 0 ? soDigitos(valorSob(linhas, /^CNPJ \/ CPF \/ NIF$/, iPrest, prestadorAte)) || null : null;
  const r = { origem: 'danfse', fornecedor: fornecedor || null, cnpj, numero, valor, data_emissao: emissao };
  return r.numero || r.cnpj || r.data_emissao ? r : null;
}

// Tipo da nota (peças, serviço ou os dois) pelos itens da manutenção: o GRM classifica a nota por ele.
export function tipoDaNota(itens = []) {
  const tipos = new Set(itens.map((i) => (i.tipo_item === 'servico' ? 'servico' : 'peca')));
  if (tipos.size === 1) return [...tipos][0];
  return 'misto';
}

const extensao = (nome) => String(nome || '').toLowerCase().split('.').pop();

// Lê o arquivo da NF e devolve { fornecedor, cnpj, numero, valor, data_emissao } (campos que não achou ficam nulos).
// XML → campos da tag; PDF baixado do portal (com texto) → DANFSe pela grade de colunas ou DANFe/genérico pelo texto; PDF escaneado
// ou imagem → OCR do navegador.
export async function lerNf(arquivo) {
  if (!arquivo) return null;
  if (extensao(arquivo.name) === 'xml') return dadosDoXml(await arquivo.text());
  const servico = await import('./notas-fiscais/service.js');
  let texto = '';
  if (extensao(arquivo.name) === 'pdf') {
    try {
      const paginas = await servico.lerItensDoPdf(arquivo);
      texto = paginas.map((p) => p.map((i) => i.str).join(' ')).join('\n');
      if (texto.replace(/\s/g, '').length >= 80) {
        const danfse = dadosDoDanfse(agruparCelulas(paginas[0] || []));
        if (danfse) return danfse;
      } else texto = '';
    } catch { texto = ''; }
  }
  if (!texto) texto = await servico.lerTextoDoArquivo(arquivo, arquivo.name);
  const nf = servico.parseNfText(texto);
  const numero = nf.numero || (texto.match(/N[úu]mero\s+da\s+(?:NFS-?e|Nota)\s*[:\-]?\s*(\d{1,12})/i) || [])[1] || null;
  return { fornecedor: nf.fornecedor, cnpj: nf.cnpj, numero, valor: valorDaNf(texto), data_emissao: dataEmissaoDaNf(texto), origem: 'texto' };
}

// Lê o comprovante e devolve { valor, data }.
export async function lerComprovante(arquivo) {
  if (!arquivo) return null;
  const { lerTextoDoArquivo } = await import('./notas-fiscais/service.js');
  return dadosDoComprovante(await lerTextoDoArquivo(arquivo, arquivo.name));
}
