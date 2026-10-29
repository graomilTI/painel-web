// Frotas · Manutenção › Nova manutenção: sugere itens do guia a partir do que foi escrito em "Problema / serviço solicitado".
// Regras de palavras (sem IA): o texto é comparado com o nome de cada peça/serviço do guia e com apelidos de cada grupo
// ("frear", "pastilha", "barulho na suspensão"...). Só sugere: quem registra marca com um clique. Funções puras, sem DOM.
import { MAO_DE_OBRA, itensDoGrupo, norm } from './frotas-manutencao-regras.js?v=20261029-frotas-inst87';

const PARADAS = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'o', 'a', 'os', 'as', 'um', 'uma', 'com', 'sem', 'para', 'por', 'que', 'ao', 'no', 'na', 'nos', 'nas', 'em', 'esta', 'estao', 'muito', 'ficou', 'veiculo', 'carro', 'sistema', 'kit', 'troca', 'trocar', 'revisao', 'conserto', 'consertar', 'reparo', 'problema', 'precisa', 'fazer', 'servico']);

// Tira o plural simples ("pastilhas" → "pastilha", "filtros" → "filtro").
const raiz = (p) => (p.length > 4 && p.endsWith('s') ? p.slice(0, -1) : p);
const palavras = (texto) => norm(texto).split(/[^a-z0-9]+/).filter((p) => p.length >= 3 && !PARADAS.has(p)).map(raiz);

// Apelidos do que a pessoa escreve → trecho do nome do grupo (sem acento). Sugere abrir o grupo, não marcar itens.
const APELIDOS = [
  [/\b(frea|frei|freio|pastilha|disco|lona|tambor|abs|pedal)/, 'freio'],
  [/\b(oleo|lubrific|vazando|vazamento de oleo)/, 'oleo'],
  [/\b(pneu|roda|alinh|balanc|calibr|furou|careca|estepe)/, 'pneu'],
  [/\b(suspens|amortec|mola|bieleta|pivo|terminal|barra estabil|direcao|batendo|buraco|folga)/, 'suspensao'],
  [/\b(embreagem|cambio|marcha|transmiss|cardan|diferencial|trancando|patinando)/, 'transmiss'],
  [/\b(bateria|alternador|motor de partida|farol|lampada|luz|lanterna|seta|eletric|fusivel|painel|sensor|pifando)/, 'eletrica'],
  [/\b(ar condicionado|ar-condicionado|arcondicionado|gelando|compressor|climatiza|ventilacao|cheiro no ar)/, 'ar'],
  [/\b(superaquec|radiador|arrefec|aditivo|ventoinha|termostato|agua do motor|bomba d agua)/, 'arrefec'],
  [/\b(injec|escapamento|catalisador|silencioso|fumaca|diagnostic|check engine|luz da injecao|falhando)/, 'injec'],
  [/\b(motor|correia dentada|junta|cabecote|vela|bico)/, 'motor'],
  [/\b(vidro|para-brisa|parabrisa|retrovisor|limpador|lataria|porta|capo|pintura|banco|cinto|fechadura|macaneta|forro)/, 'carroceria'],
  [/\b(revisao|preventiva|km)/, 'revisao'],
];

// base: { grupos, categorias, componentes } como no seletor. Devolve:
//   itens  → peças/serviços do guia citados no texto: [{ grupo, grupoNome, nome }]
//   grupos → grupos sugeridos pelos apelidos que ainda não têm item sugerido: [{ codigo, nome }]
export function sugerirItens(base, texto, { max = 8 } = {}) {
  const t = norm(texto);
  const vazio = { itens: [], grupos: [] };
  if (t.trim().length < 3) return vazio;
  const grupos = (base.grupos || []).length
    ? base.grupos.map((g) => ({ codigo: Number(g.codigo), nome: g.nome }))
    : (base.categorias || []).filter((c) => c.ativo !== false).map((c) => ({ codigo: Number(c.codigo), nome: c.nome }));
  const doTexto = new Set(palavras(texto));
  const bate = (palavra) => [...doTexto].some((p) => p === palavra || (p.length >= 4 && palavra.length >= 4 && (p.startsWith(palavra) || palavra.startsWith(p))));

  const itens = [];
  for (const g of grupos) {
    const nomes = (base.grupos || []).length ? itensDoGrupo(base.componentes || [], g.codigo, []).filter((n) => n !== MAO_DE_OBRA) : [];
    for (const nome of nomes) {
      const ps = palavras(nome);
      if (ps.length && ps.some(bate)) itens.push({ grupo: g.codigo, grupoNome: g.nome, nome, pontos: ps.filter(bate).length });
    }
  }
  // Quem acertou mais palavras do nome vem primeiro ("pastilha de freio" antes de "freio de mão").
  itens.sort((a, b) => b.pontos - a.pontos);
  const escolhidos = itens.slice(0, max).map(({ pontos, ...resto }) => resto);

  const comItem = new Set(escolhidos.map((i) => i.grupo));
  const porApelido = [];
  for (const [regra, trecho] of APELIDOS) {
    if (!regra.test(t)) continue;
    for (const g of grupos) {
      if (norm(g.nome).includes(trecho) && !comItem.has(g.codigo) && !porApelido.some((x) => x.codigo === g.codigo)) porApelido.push(g);
    }
  }
  return { itens: escolhidos, grupos: porApelido };
}
