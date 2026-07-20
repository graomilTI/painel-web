export const META_START = '[ALOJAMENTO_CONTROLE_V2]';
export const META_END = '[/ALOJAMENTO_CONTROLE_V2]';

export function esc(value) {
  return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}

export function normalizeText(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

export function money(value) {
  return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function brDate(value) {
  if (!value) return '';
  const [year, month, day] = String(value).slice(0, 10).split('-');
  return year && month && day ? `${day}/${month}/${year}` : String(value);
}

export function nullableBoolean(value) {
  if (value === true || value === false) return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return null;
}

function inferredIncluded(value) {
  const text = normalizeText(value);
  if (!text) return null;
  return text.includes('inclus');
}

export function safeUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const url = new URL(raw, window.location.origin);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
  } catch {
    return '';
  }
}

export function icon(name) {
  const icons = {
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"></circle><path d="m20 20-3.5-3.5"></path></svg>',
    home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m3 11 9-8 9 8"></path><path d="M5 10v10h14V10"></path><path d="M9 20v-6h6v6"></path></svg>',
    water: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2s7 7.1 7 13a7 7 0 0 1-14 0C5 9.1 12 2 12 2Z"></path></svg>',
    energy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m13 2-9 12h8l-1 8 9-12h-8l1-8Z"></path></svg>',
    internet: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12.5a10 10 0 0 1 14 0"></path><path d="M8.5 16a5 5 0 0 1 7 0"></path><path d="M12 20h.01"></path><path d="M2 9a14 14 0 0 1 20 0"></path></svg>',
    gas: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22c4 0 7-2.7 7-6.6 0-3.1-1.8-5.7-5.5-9.4.1 3-1.2 4.2-2.3 5.1.2-3.5-1.9-6.2-3.7-7.6.2 3.5-2.5 6-2.5 10.1C5 18.7 8.1 22 12 22Z"></path></svg>',
    pin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z"></path><circle cx="12" cy="10" r="2.5"></circle></svg>',
    contract: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 2h9l4 4v16H6z"></path><path d="M14 2v5h5"></path><path d="M9 13h6M9 17h6"></path></svg>',
    external: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 3h7v7"></path><path d="m10 14 11-11"></path><path d="M21 14v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h6"></path></svg>',
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m6 6 12 12M18 6 6 18"></path></svg>',
    building: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 21V3h12v18"></path><path d="M16 8h4v13"></path><path d="M8 7h4M8 11h4M8 15h4M2 21h20"></path></svg>',
    address: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M6 3v6M18 3v6"></path><rect x="3" y="6" width="18" height="15" rx="2"></rect><path d="M7 11h4M7 15h10"></path></svg>',
    services: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.7 6.3a4 4 0 0 0-5.6 5.6L3 18v3h3l6.1-6.1a4 4 0 0 0 5.6-5.6l-2.4 2.4-3-3 2.4-2.4Z"></path></svg>'
  };
  return icons[name] || '';
}

export function ensureStyles() {
  const styles = [
    { id: 'admAlojamentosV2Css', file: '../css/adm-hotel-alojamentos-v2.css' },
    { id: 'admAlojamentosListaCss', file: '../css/adm-hotel-alojamentos-lista.css?v=20260720-lista1' }
  ];
  styles.forEach(({ id, file }) => {
    if (document.getElementById(id)) return;
    const link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    link.href = new URL(file, import.meta.url).href;
    document.head.appendChild(link);
  });
}

export function extractMeta(observacoes) {
  const text = String(observacoes || '');
  const start = text.indexOf(META_START);
  const end = text.indexOf(META_END);
  if (start < 0 || end < start) return { clean: text.trim(), meta: {} };
  let meta = {};
  try { meta = JSON.parse(text.slice(start + META_START.length, end).trim()) || {}; } catch { meta = {}; }
  return { clean: `${text.slice(0, start)}${text.slice(end + META_END.length)}`.trim(), meta };
}

export function composeObservations(clean, meta) {
  return [String(clean || '').trim(), `${META_START}${JSON.stringify(meta)}${META_END}`].filter(Boolean).join('\n');
}

export function hydrateRow(row) {
  const { clean, meta } = extractMeta(row.observacoes);
  return {
    ...row, ...meta, observacoes_limpa: clean,
    contrato_url: row.contrato_url || meta.contrato_url || '', contrato_inicio: row.contrato_inicio || meta.contrato_inicio || '', contrato_fim: row.contrato_fim || meta.contrato_fim || '',
    endereco_logradouro: row.endereco_logradouro || meta.endereco_logradouro || row.endereco || '', endereco_numero: row.endereco_numero || meta.endereco_numero || '', endereco_complemento: row.endereco_complemento || meta.endereco_complemento || '',
    bairro: row.bairro || meta.bairro || '', cep: row.cep || meta.cep || '', referencia: row.referencia || meta.referencia || '', link_localizacao: row.link_localizacao || meta.link_localizacao || '',
    agua_inclusa: nullableBoolean(row.agua_inclusa ?? meta.agua_inclusa ?? inferredIncluded(row.agua)), agua_matricula: row.agua_matricula || meta.agua_matricula || '', agua_titular: row.agua_titular || meta.agua_titular || '',
    energia_inclusa: nullableBoolean(row.energia_inclusa ?? meta.energia_inclusa ?? inferredIncluded(row.energia)), energia_matricula: row.energia_matricula || meta.energia_matricula || '', energia_titular: row.energia_titular || meta.energia_titular || '',
    internet_inclusa: nullableBoolean(row.internet_inclusa ?? meta.internet_inclusa ?? inferredIncluded(row.internet)), internet_matricula: row.internet_matricula || meta.internet_matricula || '', internet_titular: row.internet_titular || meta.internet_titular || '',
    gas_forma_pagamento: row.gas_forma_pagamento || meta.gas_forma_pagamento || '', gas_titular: row.gas_titular || meta.gas_titular || ''
  };
}

export function fullAddress(row) {
  const first = [row.endereco_logradouro || row.endereco, row.endereco_numero].filter(Boolean).join(', ');
  const second = [row.endereco_complemento, row.bairro].filter(Boolean).join(' · ');
  const third = [[row.cidade, row.uf].filter(Boolean).join('/'), row.cep ? `CEP ${row.cep}` : ''].filter(Boolean).join(' · ');
  return [first, second, third].filter(Boolean).join(' — ') || 'Endereço não informado';
}

export function contractAlert(row) {
  if (!row.contrato_fim) return false;
  const end = new Date(`${row.contrato_fim}T12:00:00`);
  const now = new Date();
  return Number.isFinite(end.getTime()) && end >= now && (end - now) / 86400000 <= 60;
}
