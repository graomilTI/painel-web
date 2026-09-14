// Mapa Operacional — camada de auditoria BFleet
// Esta camada é deliberadamente separada da consolidação principal para que
// falhas/ausência de telemetria nunca impeçam a programação de ser exibida.
import { supabase } from './supabaseClient.js';

const MIN_PINGS_AUDITORIA = 4;
const LIMIAR_EXCESSO_PCT = 15;
const LIMIAR_EXCESSO_KM = 5;
const MAX_INTERVALO_MIN = 12;

function normalizePlate(value) {
  return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 7);
}

function numText(value) {
  const cleaned = String(value || '')
    .replace(/[^0-9,.-]/g, '')
    .replace(/\./g, '')
    .replace(',', '.');
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function fmtKm(value) {
  if (!Number.isFinite(value)) return '—';
  return `${value.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} km`;
}

function fmtPct(value) {
  if (!Number.isFinite(value)) return '—';
  return `${value.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

function haversine(a, b) {
  const lat1 = Number(a?.latitude), lon1 = Number(a?.longitude);
  const lat2 = Number(b?.latitude), lon2 = Number(b?.longitude);
  if (![lat1, lon1, lat2, lon2].every(Number.isFinite)) return 0;
  const R = 6371;
  const rad = (v) => v * Math.PI / 180;
  const dLat = rad(lat2 - lat1);
  const dLon = rad(lon2 - lon1);
  const q = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(q), Math.sqrt(1 - q));
}

function gpsDistance(rows) {
  let total = 0;
  let valid = 0;
  for (let i = 1; i < rows.length; i += 1) {
    const km = haversine(rows[i - 1], rows[i]);
    if (!Number.isFinite(km) || km < 0.02 || km > 350) continue;
    total += km;
    valid += 1;
  }
  return valid ? total : null;
}

function localDate() {
  const el = document.getElementById('opDate');
  if (el?.value) return el.value;
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

function nextDate(iso) {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

function operationMeta(card) {
  const key = String(card.dataset.operationKey || '');
  const parts = key.split('|');
  const placaIndex = parts.indexOf('PLACA');
  if (placaIndex < 0 || !parts[placaIndex + 1]) return null;
  const plate = normalizePlate(parts[placaIndex + 1]);
  const facts = [...card.querySelectorAll('.op-fact')];
  const plannedFact = facts.find((el) => /KM previsto/i.test(el.querySelector('span')?.textContent || ''));
  const plannedKm = numText(plannedFact?.querySelector('strong')?.textContent);
  return { key, plate, plannedKm };
}

async function loadHistory(date, plates) {
  if (!plates.length) return [];
  const start = `${date}T00:00:00-03:00`;
  const end = `${nextDate(date)}T00:00:00-03:00`;
  const all = [];
  const pageSize = 1000;
  for (let page = 0; page < 50; page += 1) {
    const from = page * pageSize;
    const to = from + pageSize - 1;
    const { data, error } = await supabase
      .from('frotas_posicoes_historico')
      .select('placa,latitude,longitude,velocidade_kmh,motorista,reportado_em')
      .in('placa', plates)
      .gte('reportado_em', start)
      .lt('reportado_em', end)
      .order('reportado_em', { ascending: true })
      .range(from, to);
    if (error) throw error;
    const batch = data || [];
    all.push(...batch);
    if (batch.length < pageSize) break;
  }
  return all;
}

function classify(meta, rows) {
  const actualKm = gpsDistance(rows);
  const pings = rows.length;
  let maxGapMin = 0;
  for (let i = 1; i < rows.length; i += 1) {
    const a = new Date(rows[i - 1].reportado_em).getTime();
    const b = new Date(rows[i].reportado_em).getTime();
    if (Number.isFinite(a) && Number.isFinite(b)) maxGapMin = Math.max(maxGapMin, (b - a) / 60000);
  }

  const plannedKm = Number(meta.plannedKm);
  const comparable = pings >= MIN_PINGS_AUDITORIA && Number.isFinite(actualKm) && plannedKm > 0;
  const excessKm = comparable ? actualKm - plannedKm : null;
  const excessPct = comparable ? (excessKm / plannedKm) * 100 : null;
  const suspect = comparable && excessKm >= LIMIAR_EXCESSO_KM && excessPct >= LIMIAR_EXCESSO_PCT;
  const lowCoverage = pings < MIN_PINGS_AUDITORIA || maxGapMin > MAX_INTERVALO_MIN;

  return { actualKm, pings, maxGapMin, comparable, excessKm, excessPct, suspect, lowCoverage };
}

function renderAudit(card, audit) {
  card.querySelector('.op-audit-bfleet')?.remove();
  const box = document.createElement('div');
  box.className = `op-audit-bfleet ${audit.suspect ? 'is-alert' : audit.lowCoverage ? 'is-warn' : 'is-ok'}`;

  let title = 'BFleet — coleta insuficiente';
  let note = `Aguardando pelo menos ${MIN_PINGS_AUDITORIA} posições para comparar a rota.`;
  if (audit.comparable && audit.suspect) {
    title = 'BFleet — pré-alerta de excesso';
    note = 'Há excesso simultâneo em km absoluto e percentual. É um pré-alerta; a confirmação de uso particular exige comparar a trilha com o corredor autorizado.';
  } else if (audit.comparable) {
    title = 'BFleet — dentro do limite de km';
    note = 'A trilha tem amostra suficiente para comparação básica de distância.';
  } else if (audit.pings >= MIN_PINGS_AUDITORIA && !Number.isFinite(audit.actualKm)) {
    title = 'BFleet — veículo sem deslocamento mensurável';
    note = 'Há posições, mas ainda não há segmentos válidos suficientes para somar distância.';
  }

  const gapLabel = audit.maxGapMin > 0 ? `${Math.round(audit.maxGapMin)} min` : '—';
  box.innerHTML = `
    <div class="op-audit-head"><strong>${title}</strong><span>${audit.pings} pontos GPS</span></div>
    <div class="op-audit-grid">
      <div><span>KM GPS</span><strong>${fmtKm(audit.actualKm)}</strong></div>
      <div><span>Excesso</span><strong>${audit.comparable ? fmtKm(audit.excessKm) : '—'}</strong></div>
      <div><span>Diferença</span><strong>${audit.comparable ? fmtPct(audit.excessPct) : '—'}</strong></div>
      <div><span>Maior intervalo</span><strong>${gapLabel}</strong></div>
    </div>
    <p>${note}</p>`;

  const body = card.querySelector('.op-card-body');
  if (body) body.appendChild(box);
}

function renderGlobalSummary(results) {
  document.querySelector('.op-audit-summary')?.remove();
  const host = document.getElementById('opSummaryHost');
  if (!host || !results.length) return;
  const withTelemetry = results.filter((r) => r.audit.pings > 0).length;
  const comparable = results.filter((r) => r.audit.comparable).length;
  const alerts = results.filter((r) => r.audit.suspect).length;
  const sparse = results.filter((r) => r.audit.lowCoverage).length;
  const strip = document.createElement('section');
  strip.className = 'op-audit-summary';
  strip.innerHTML = `<strong>Auditoria BFleet</strong><span>${withTelemetry}/${results.length} veículos com telemetria</span><span>${comparable} comparáveis</span><span class="${alerts ? 'danger' : ''}">${alerts} pré-alertas</span><span>${sparse} com coleta insuficiente</span>`;
  host.insertAdjacentElement('afterend', strip);
}

async function auditVisibleCards() {
  const cards = [...document.querySelectorAll('.op-card[data-operation-key]')];
  const metas = cards.map((card) => ({ card, meta: operationMeta(card) })).filter((x) => x.meta?.plate);
  if (!metas.length) return;
  const date = localDate();
  const plates = [...new Set(metas.map((x) => x.meta.plate))];
  try {
    const history = await loadHistory(date, plates);
    const byPlate = new Map();
    for (const row of history) {
      const plate = normalizePlate(row.placa);
      if (!byPlate.has(plate)) byPlate.set(plate, []);
      byPlate.get(plate).push(row);
    }
    const results = metas.map(({ card, meta }) => {
      const audit = classify(meta, byPlate.get(meta.plate) || []);
      renderAudit(card, audit);
      return { meta, audit };
    });
    renderGlobalSummary(results);
  } catch (error) {
    console.warn('[mapa-operacional-auditoria] BFleet indisponível:', error);
  }
}

function injectStyles() {
  if (document.getElementById('opAuditStyles')) return;
  const style = document.createElement('style');
  style.id = 'opAuditStyles';
  style.textContent = `
    .op-audit-bfleet{padding:11px 12px;border-radius:13px;border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.025)}
    .op-audit-bfleet.is-ok{border-color:rgba(52,211,153,.26)}.op-audit-bfleet.is-warn{border-color:rgba(251,191,36,.3)}.op-audit-bfleet.is-alert{border-color:rgba(248,113,113,.38);background:rgba(127,29,29,.09)}
    .op-audit-head{display:flex;justify-content:space-between;gap:10px;align-items:center;margin-bottom:8px}.op-audit-head strong{font-size:12px}.op-audit-head span{font-size:10px;color:#71857b}
    .op-audit-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:7px}.op-audit-grid>div{padding:7px 8px;border-radius:9px;background:rgba(255,255,255,.025)}.op-audit-grid span{display:block;font-size:9px;color:#71857b;text-transform:uppercase;font-weight:800}.op-audit-grid strong{display:block;margin-top:2px;font-size:11px;color:#dcebe3}.op-audit-bfleet p{margin:8px 0 0;font-size:10px;line-height:1.45;color:#8da298}
    .op-audit-summary{display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:10px 13px;border:1px solid rgba(45,212,160,.18);border-radius:13px;background:rgba(45,212,160,.045);font-size:11px;color:#9fb0a8}.op-audit-summary strong{color:#dcebe3}.op-audit-summary .danger{color:#ff9a9a;font-weight:800}
    @media(max-width:760px){.op-audit-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
  `;
  document.head.appendChild(style);
}

let timer = null;
function scheduleAudit() {
  clearTimeout(timer);
  timer = setTimeout(auditVisibleCards, 350);
}

injectStyles();
const observer = new MutationObserver((mutations) => {
  if (mutations.some((m) => [...m.addedNodes].some((n) => n.nodeType === 1 && (n.matches?.('.op-card') || n.querySelector?.('.op-card'))))) scheduleAudit();
});
observer.observe(document.body, { childList: true, subtree: true });

scheduleAudit();
setInterval(auditVisibleCards, 2 * 60 * 1000);
