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
