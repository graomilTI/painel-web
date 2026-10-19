// Regras puras (datas em Brasília, prazo de 10 dias) da aba Desligados.

export const PRAZO_RECOLHIMENTO_DIAS = 10;
const DIA_MS = 86400000;

export function chaveNome(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** 'YYYY-MM-DD' do dia atual em Brasília. */
export function hojeBrasilia(agora = new Date()) {
  return agora.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
}

/** 'YYYY-MM-DD' (Brasília) de um timestamp ISO. */
export function diaBrasilia(iso) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
}

function utcDia(ymd) {
  const [y, m, d] = String(ymd || '').slice(0, 10).split('-').map(Number);
  return Date.UTC(y, (m || 1) - 1, d || 1);
}

export function somarDias(ymd, dias) {
  return new Date(utcDia(ymd) + dias * DIA_MS).toISOString().slice(0, 10);
}

/** Dias entre hoje e o prazo: positivo = faltam, 0 = vence hoje, negativo = vencido. */
export function diasParaPrazo(prazoYmd, hojeYmd) {
  return Math.round((utcDia(prazoYmd) - utcDia(hojeYmd)) / DIA_MS);
}

export function formatarDia(ymd) {
  const s = String(ymd || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return '-';
  const [y, m, d] = s.split('-');
  return `${d}/${m}/${y}`;
}

/** Estado do prazo para exibição: { classe, texto, vencido }. */
export function estadoPrazo(prazoYmd, hojeYmd) {
  const dias = diasParaPrazo(prazoYmd, hojeYmd);
  if (dias < 0) return { classe: 'vencido', texto: `Vencido há ${-dias} ${-dias === 1 ? 'dia' : 'dias'}`, vencido: true };
  if (dias === 0) return { classe: 'hoje', texto: 'Vence hoje', vencido: false };
  if (dias <= 3) return { classe: 'urgente', texto: `Faltam ${dias} ${dias === 1 ? 'dia' : 'dias'}`, vencido: false };
  return { classe: 'ok', texto: `Faltam ${dias} dias`, vencido: false };
}

/**
 * Estimativa (R$) de um patrimônio pelo catálogo de compras. Primeiro o nome
 * igual; depois o MAIOR material do catálogo que aparece como palavras inteiras
 * no início da identificação ("JOGO DE PENEIRAS" para "JOGO DE PENEIRAS 3MM - 5MM - FUNDO").
 * @param {string} identificacao
 * @param {{material: string, valor_estimado: number|string|null}[]} catalogo
 * @returns {number|null} null = sem estimativa
 */
export function valorEstimadoDoItem(identificacao, catalogo) {
  const alvo = chaveNome(identificacao);
  if (!alvo) return null;
  let melhor = null;
  for (const c of catalogo || []) {
    const valor = c.valor_estimado == null || c.valor_estimado === '' ? NaN : Number(c.valor_estimado);
    const mat = chaveNome(c.material);
    if (!mat || !Number.isFinite(valor)) continue;
    if (mat === alvo) return valor;
    if (alvo.startsWith(`${mat} `) && (!melhor || mat.length > melhor.len)) melhor = { len: mat.length, valor };
  }
  return melhor ? melhor.valor : null;
}

export function formatarReais(valor) {
  return Number(valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/** Aceita "1.234,56", "R$ 80", "80.5". Vazio = null; inválido/negativo = NaN. */
export function lerReais(texto) {
  const s = String(texto ?? '').replace(/R\$/gi, '').replace(/\s/g, '');
  if (!s) return null;
  const n = Number(s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : NaN;
}
