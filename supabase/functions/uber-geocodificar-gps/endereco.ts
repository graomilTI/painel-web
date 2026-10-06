// Interpretação de endereços das corridas Uber (formato Google/Uber:
// "Rua X, 123 - Bairro - Cidade - UF, 00000-000, Brasil") e montagem das
// consultas de geocodificação. Funções puras: testadas em
// tests/uber-geocodificar-endereco.test.mjs.

export type EnderecoInterpretado = {
  original: string;
  rua: string; // já com abreviações expandidas ("R." -> "Rua"); '' quando só há bairro/cidade
  numero: string; // '' quando não há (ou "s/n")
  bairro: string;
  cidade: string;
  uf: string;
  cep: string; // 8 dígitos, '' quando não há
};

export const UFS = new Set([
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA',
  'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
]);

export function normKey(v: unknown): string {
  return String(v ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

// `\b` não funciona com acento em JS ("Pç.", "Prédio"): usa lookahead de letra.
const PREFIXO_VIA = new RegExp(
  '^(?:r|rua|av|avenida|rod|rodovia|estr?|estrada|al|alameda|p[cç]a?|pra[cç]a|tv|trav|travessa|vl|viela|lgo|largo|marginal|via)(?![A-Za-zÀ-ÿ0-9])'
  + '|^(?:br|sp|rsc?|pr|sc|mg|go|mt|ms|icr)[-\\s]?\\d',
  'i',
);
const PLUS_CODE = /[A-Z0-9]{4,}\+[A-Z0-9]{2,}/i;
const DETALHE_LOCAL = /^(?:ap|apto|apt|bloco|bl|sala|lote|casa|andar|km|\d+\s*[º°]?\s*andar)(?![A-Za-zÀ-ÿ])/i;

const PREFIXOS_EXPANDIDOS: Array<[RegExp, string]> = [
  [/^r\.?(?=\s)/i, 'Rua'],
  [/^av\.?(?=\s)/i, 'Avenida'],
  [/^rodv?\.?(?=\s)/i, 'Rodovia'],
  [/^estr?\.?(?=\s)/i, 'Estrada'],
  [/^(?:p[cç]a?)\.?(?=\s)/i, 'Praça'],
  [/^al\.?(?=\s)/i, 'Alameda'],
  [/^tv\.?(?=\s)/i, 'Travessa'],
  [/^trav\.?(?=\s)/i, 'Travessa'],
  [/^lgo\.?(?=\s)/i, 'Largo'],
];

// Só expande com ponto ("Cel." / "Dr."), pra não mexer em palavras inteiras.
const TITULOS: Record<string, string> = {
  cel: 'Coronel', visc: 'Visconde', dep: 'Deputado', pres: 'Presidente', eng: 'Engenheiro',
  prof: 'Professor', profa: 'Professora', dr: 'Doutor', dra: 'Doutora', gov: 'Governador',
  gen: 'General', mal: 'Marechal', cap: 'Capitão', ten: 'Tenente', sen: 'Senador',
  ver: 'Vereador', pe: 'Padre', mons: 'Monsenhor', des: 'Desembargador', min: 'Ministro',
  cons: 'Conselheiro', sto: 'Santo', sta: 'Santa', jd: 'Jardim',
};

export function expandirVia(via: string): string {
  let texto = via.replace(/\s+/g, ' ').trim();
  for (const [regex, nome] of PREFIXOS_EXPANDIDOS) {
    if (regex.test(texto)) { texto = texto.replace(regex, nome); break; }
  }
  return texto.replace(/\b([A-Za-zÀ-ÿ]{2,5})\./g, (m, abrev) => TITULOS[abrev.toLowerCase()] || m).trim();
}

function ehNumero(seg: string): string {
  const m = seg.match(/^(?:n[º°o.]*\s*)?(\d+[A-Za-z]?)$/i);
  return m ? m[1] : '';
}

function ehSemNumero(seg: string): boolean {
  return /^(?:s\/?n|sem n[uú]mero)$/i.test(seg);
}

export function interpretarEndereco(entrada: string): EnderecoInterpretado {
  let texto = String(entrada ?? '').replace(/\s+/g, ' ').trim();
  // Lixo de telefone colado no começo: "Zap(13)98180 - 3664R. Monteiro Lobato, 63 ..."
  texto = texto.replace(/^(?:zap|whats\w*|tel|cel)\b[^A-Za-zÀ-ÿ]*(?=[A-Za-zÀ-ÿ])/i, '');
  texto = texto.replace(/(?:[,\s]*\bBrasil\b)+\s*$/i, '');
  texto = texto.replace(/\bUnnamed Road\b,?/i, '');
  texto = texto.replace(/^(P[cç]a?)\s*,\s*/i, '$1. '); // "Pç, Da Bíblia" -> "Pç. Da Bíblia"

  const cepRegex = /\b(\d{5})-?(\d{3})\b/g;
  const cepMatch = [...texto.matchAll(cepRegex)].map((m) => m[1] + m[2]);
  const cep = cepMatch[0] || '';
  texto = texto.replace(cepRegex, '');

  // "A & B": cruzamento — fica com a primeira via.
  texto = texto.replace(/\s+&\s+[^,]+/, '');

  const segs = texto
    .split(/\s+-\s+|\s*,\s*/)
    .map((s) => s.trim().replace(/^-+\s*|\s*-+$/g, ''))
    .filter(Boolean);

  let uf = '';
  let idxUf = -1;
  for (let i = segs.length - 1; i >= 0; i--) {
    if (UFS.has(segs[i].toUpperCase()) && segs[i].length === 2) { uf = segs[i].toUpperCase(); idxUf = i; break; }
  }
  const corpo = idxUf >= 0 ? segs.slice(0, idxUf) : segs.slice();
  const vazio: EnderecoInterpretado = { original: entrada, rua: '', numero: '', bairro: '', cidade: '', uf, cep };
  if (!corpo.length) return vazio;

  const cidade = corpo[corpo.length - 1];
  const antes = corpo.slice(0, -1);

  let idxRua = -1;
  if (antes.length) {
    if (PREFIXO_VIA.test(antes[0]) || ehNumero(antes[1] || '') || ehSemNumero(antes[1] || '')) idxRua = 0;
    else idxRua = antes.findIndex((s) => PREFIXO_VIA.test(s));
  }

  let rua = '';
  let numero = '';
  const resto: string[] = [];
  antes.forEach((seg, i) => {
    if (i === idxRua) { rua = expandirVia(seg); return; }
    if (idxRua >= 0 && i === idxRua + 1 && !numero) {
      const n = ehNumero(seg);
      if (n) { numero = n; return; }
      if (ehSemNumero(seg)) return;
    }
    if (ehNumero(seg) || DETALHE_LOCAL.test(seg) || PLUS_CODE.test(seg)) return;
    if (idxRua >= 0 && i < idxRua) return; // nome de condomínio/complexo antes da via
    resto.push(seg);
  });

  let bairro = resto.join(' ').trim();
  // "Itapeva - Itapeva - SP" e "Rural, Leme": o bairro não acrescenta nada.
  if (normKey(bairro) === normKey(cidade) || /^(?:zona )?rural$/i.test(normKey(bairro))) bairro = '';
  return { original: entrada, rua, numero, bairro, cidade, uf, cep };
}

// Sem rua nem bairro (só cidade/UF/CEP) o ponto seria o centro da cidade, que
// não serve pra validar por raio de 2km.
export function temLocalEspecifico(info: EnderecoInterpretado): boolean {
  return Boolean(info.rua || info.bairro);
}

export type Candidato = { query: string; nivel: 'endereco' | 'rua' | 'bairro' };

export function candidatosBusca(info: EnderecoInterpretado): Candidato[] {
  const sufixo = [info.cidade, info.uf, 'Brasil'].filter(Boolean).join(', ');
  const lista: Candidato[] = [];
  // Com bairro primeiro: em avenida comprida, sem ele o Nominatim devolve o meio da via, a km do ponto.
  if (info.rua && info.numero && info.bairro) lista.push({ query: `${info.rua}, ${info.numero}, ${info.bairro}, ${sufixo}`, nivel: 'endereco' });
  if (info.rua && info.numero) lista.push({ query: `${info.rua}, ${info.numero}, ${sufixo}`, nivel: 'endereco' });
  if (info.rua && info.bairro) lista.push({ query: `${info.rua}, ${info.bairro}, ${sufixo}`, nivel: 'rua' });
  if (info.rua) lista.push({ query: `${info.rua}, ${sufixo}`, nivel: 'rua' });
  if (!info.rua && info.bairro) lista.push({ query: `${info.bairro}, ${sufixo}`, nivel: 'bairro' });
  const vistos = new Set<string>();
  return lista.filter((c) => {
    const k = normKey(c.query);
    if (!k || vistos.has(k)) return false;
    vistos.add(k);
    return true;
  });
}

// place_rank do Nominatim: cidade=16, bairro/subúrbio=~20, via=26, edificação=30.
export function rankMinimo(nivel: Candidato['nivel']): number {
  return nivel === 'bairro' ? 18 : 22;
}

export function ufDoResultado(address: Record<string, unknown> | undefined): string {
  const iso = String(address?.['ISO3166-2-lvl4'] ?? '');
  return iso.startsWith('BR-') ? iso.slice(3) : '';
}

// Cidade devolvida por um provedor bate com a do endereço? (tolerante a
// acento, caixa e a "Município de ..." / distrito)
export function cidadeCompativel(esperada: string, ...obtidas: unknown[]): boolean {
  const alvo = normKey(esperada);
  if (!alvo) return true;
  const texto = normKey(obtidas.filter(Boolean).join(' '));
  if (!texto) return true; // provedor não informou: não rejeita por falta de dado
  return texto.includes(alvo);
}

const TIPOS_VIA: Record<string, string> = {
  rua: 'rua', r: 'rua', avenida: 'avenida', av: 'avenida', rodovia: 'rodovia', rod: 'rodovia',
  estrada: 'rodovia', estr: 'rodovia', praca: 'praca', pca: 'praca', alameda: 'alameda',
  travessa: 'travessa', viela: 'viela', largo: 'largo',
};

// Palavras que variam entre a fonte do endereço e o OSM sem mudar a rua.
const PALAVRAS_SOLTAS = new Set([
  'rua', 'avenida', 'rodovia', 'estrada', 'praca', 'alameda', 'travessa', 'viela', 'largo',
  'de', 'da', 'do', 'das', 'dos', 'doutor', 'doutora', 'professor', 'professora', 'prefeito',
  'governador', 'deputado', 'vereador', 'engenheiro', 'presidente', 'coronel', 'general',
]);

function tipoDaVia(valor: string): string {
  return TIPOS_VIA[normKey(valor).split(' ')[0]] || '';
}

function distanciaEdicao(a: string, b: string): number {
  const linha = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let anterior = linha[0];
    linha[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const guardado = linha[j];
      linha[j] = Math.min(linha[j] + 1, linha[j - 1] + 1, anterior + (a[i - 1] === b[j - 1] ? 0 : 1));
      anterior = guardado;
    }
  }
  return linha[b.length];
}

function tokensDaVia(valor: string): string[] {
  return normKey(valor).split(' ').filter((t) => t.length >= 3 && !PALAVRAS_SOLTAS.has(t));
}

// Código de rodovia ("ICR-472", "SP-326"): no OSM a rodovia costuma ter outro nome,
// então não dá pra conferir pelo nome da via.
export function ehCodigoRodovia(via: string): boolean {
  return /^[a-z]{2,3}-?\d{2,3}\b/i.test(via.trim());
}

/**
 * A via devolvida pelo provedor é a mesma que o endereço pediu? Exige todas as
 * palavras do nome (tolerando erro de grafia — 1 letra em palavras de 4+, 2 em
 * 8+ — e iniciais, ex.: "Casteletti" x "C.") e o mesmo tipo (Rua x Avenida), pra não
 * aceitar outra rua parecida — foi isso que gerou pontos a vários km.
 * Sem nome devolvido, não rejeita.
 */
export function viaCompativel(esperada: string, obtida: string): boolean {
  const esperados = tokensDaVia(esperada);
  if (!esperados.length || !normKey(obtida)) return true;
  const tipoEsperado = tipoDaVia(esperada);
  const tipoObtido = tipoDaVia(obtida);
  if (tipoEsperado && tipoObtido && tipoEsperado !== tipoObtido) return false;
  const palavras = normKey(obtida).split(' ');
  const iniciais = new Set(palavras.filter((t) => t.length === 1));
  const longas = palavras.filter((t) => t.length >= 3);
  return esperados.every((token) =>
    iniciais.has(token[0])
    || longas.some((t) => t === token || (token.length >= 4 && distanciaEdicao(token, t) <= (token.length >= 8 ? 2 : 1))),
  );
}
