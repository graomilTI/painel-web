import { supabase } from './supabaseClient.js';

const TIPO_MOTORISTA = 'MOTORISTA FROTA';
const TIPO_CARONA = 'CARONA FROTA';
const REFRESH_AFTER_SAVE_MS = 900;

let model = {
  programIds: [],
  programByColab: new Map(),
  driversByProgram: new Map(),
};
let refreshTimer = null;
let refreshing = false;

function norm(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}

function plate(value) {
  return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 7);
}

function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function activeProgramIds() {
  const ids = [];
  try {
    const single = window.__progGetProgramacaoId?.();
    if (single) ids.push(single);
  } catch (_) {}
  try {
    const map = window.__progGetProgramacaoIdMap?.();
    if (map instanceof Map) ids.push(...map.values());
    else if (map && typeof map === 'object') ids.push(...Object.values(map));
  } catch (_) {}
  return [...new Set(ids.filter(Boolean).map(String))];
}

function toast(message, type = 'warn') {
  let host = document.getElementById('progCaronaMotoristaToast');
  if (!host) {
    host = document.createElement('div');
    host.id = 'progCaronaMotoristaToast';
    document.body.appendChild(host);
  }
  host.className = `prog-carona-toast ${type}`;
  host.textContent = message;
  host.classList.add('show');
  clearTimeout(host._timer);
  host._timer = setTimeout(() => host.classList.remove('show'), 4500);
}

async function fetchAll(table, fields, column, values) {
  const unique = [...new Set((values || []).filter(Boolean))];
  if (!unique.length) return [];
  const out = [];
  const pageSize = 1000;
  for (let page = 0; page < 10; page += 1) {
    const from = page * pageSize;
    const to = from + pageSize - 1;
    const { data, error } = await supabase
      .from(table)
      .select(fields)
      .in(column, unique)
      .range(from, to);
    if (error) throw error;
    const batch = data || [];
    out.push(...batch);
    if (batch.length < pageSize) break;
  }
  return out;
}

function buildProgramMap(programRows) {
  const byColab = new Map();
  for (const row of programRows) {
    const key = String(row.colaborador_id || '');
    if (!key) continue;
    if (!byColab.has(key)) byColab.set(key, []);
    byColab.get(key).push(String(row.programacao_id));
  }
  return byColab;
}

function rowProgramId(tr, displacementRows = []) {
  const colabId = String(tr?.dataset?.colabId || '');
  const candidates = model.programByColab.get(colabId) || [];
  if (candidates.length === 1) return candidates[0];
  if (!candidates.length) return null;

  const tipo = norm(tr.querySelector('[data-field="tipo_deslocamento"]')?.value);
  const placa = plate(tr.querySelector('[data-field="placa_veiculo"]')?.value);
  const match = displacementRows.find((row) =>
    String(row.colaborador_id) === colabId &&
    candidates.includes(String(row.programacao_id)) &&
    norm(row.tipo_deslocamento) === tipo &&
    plate(row.placa_veiculo) === placa
  );
  return match ? String(match.programacao_id) : null;
}

function driversFromRows(displacementRows) {
  const map = new Map();
  for (const row of displacementRows) {
    if (norm(row.tipo_deslocamento) !== TIPO_MOTORISTA) continue;
    const placa = plate(row.placa_veiculo);
    if (!placa || !row.programacao_id) continue;
    const pid = String(row.programacao_id);
    if (!map.has(pid)) map.set(pid, []);
    map.get(pid).push({
      programacaoId: pid,
      colaboradorId: String(row.colaborador_id || ''),
      nome: String(row.nome_colaborador || 'Motorista').trim(),
      placa,
    });
  }
  return map;
}

function mergeDriversFromDom(displacementRows) {
  const map = driversFromRows(displacementRows);
  document.querySelectorAll('tr[data-table="programacao_deslocamento"]').forEach((tr) => {
    const tipo = norm(tr.querySelector('[data-field="tipo_deslocamento"]')?.value);
    if (tipo !== TIPO_MOTORISTA) return;
    const placa = plate(tr.querySelector('[data-field="placa_veiculo"]')?.value);
    if (!placa) return;
    const pid = rowProgramId(tr, displacementRows);
    if (!pid) return;
    const colabId = String(tr.dataset.colabId || '');
    const nome = tr.querySelector('.prog-colab-name, strong')?.textContent?.trim() || 'Motorista';
    if (!map.has(pid)) map.set(pid, []);
    const list = map.get(pid);
    if (!list.some((item) => item.placa === placa && item.colaboradorId === colabId)) {
      list.push({ programacaoId: pid, colaboradorId: colabId, nome, placa });
    }
  });
  for (const [pid, items] of map) {
    const dedup = new Map();
    items.forEach((item) => dedup.set(`${item.colaboradorId}|${item.placa}`, item));
    map.set(pid, [...dedup.values()].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')));
  }
  return map;
}

function driverOptions(programId, currentPlate, colabId) {
  const drivers = (model.driversByProgram.get(programId) || [])
    .filter((item) => item.colaboradorId !== String(colabId || ''));
  const current = plate(currentPlate);
  const hasCurrent = drivers.some((item) => item.placa === current);
  const options = ['<option value="">Selecione o motorista / placa</option>'];
  if (current && !hasCurrent) {
    options.push(`<option value="${esc(current)}" selected>⚠ ${esc(current)} — sem MOTORISTA FROTA</option>`);
  }
  for (const item of drivers) {
    options.push(`<option value="${esc(item.placa)}" ${item.placa === current ? 'selected' : ''}>${esc(item.nome)} — ${esc(item.placa)}</option>`);
  }
  return { drivers, html: options.join(''), hasCurrent };
}

function ensureAlert(tr) {
  let alert = tr.querySelector('[data-carona-motorista-alert]');
  if (!alert) {
    alert = document.createElement('div');
    alert.setAttribute('data-carona-motorista-alert', '');
    alert.className = 'prog-carona-motorista-alert';
    const field = tr.querySelector('[data-field="placa_veiculo"]');
    field?.parentElement?.appendChild(alert);
  }
  return alert;
}

function restorePlateInput(tr) {
  const field = tr.querySelector('[data-field="placa_veiculo"]');
  if (!field || field.tagName !== 'SELECT' || !field.classList.contains('prog-carona-driver-select')) return;
  const input = document.createElement('input');
  input.setAttribute('data-field', 'placa_veiculo');
  input.setAttribute('list', 'progVeiculosFrotaList');
  input.type = 'text';
  input.maxLength = 7;
  input.placeholder = 'Placa';
  input.value = plate(field.value);
  if (field.disabled) input.disabled = true;
  field.replaceWith(input);
  tr.querySelector('[data-carona-motorista-alert]')?.remove();
}

function enhanceCaronaRow(tr, displacementRows) {
  const tipo = norm(tr.querySelector('[data-field="tipo_deslocamento"]')?.value);
  if (tipo !== TIPO_CARONA) {
    restorePlateInput(tr);
    return;
  }

  const pid = rowProgramId(tr, displacementRows);
  const existing = tr.querySelector('[data-field="placa_veiculo"]');
  const current = plate(existing?.value);
  const blocked = existing?.disabled;
  const alert = ensureAlert(tr);

  if (!pid) {
    alert.textContent = 'Não foi possível identificar a programação deste colaborador. Recarregue a programação antes de definir a carona.';
    alert.classList.add('show', 'danger');
    return;
  }

  const { drivers, html, hasCurrent } = driverOptions(pid, current, tr.dataset.colabId);
  let select = existing;
  if (!select || select.tagName !== 'SELECT' || !select.classList.contains('prog-carona-driver-select')) {
    select = document.createElement('select');
    select.setAttribute('data-field', 'placa_veiculo');
    select.className = 'prog-carona-driver-select';
    if (blocked) select.disabled = true;
    existing?.replaceWith(select);
  }
  select.innerHTML = html;
  if (current) select.value = current;
  select.disabled = Boolean(blocked) || drivers.length === 0;

  if (!drivers.length) {
    alert.textContent = 'Defina primeiro um MOTORISTA FROTA e a placa nesta programação.';
    alert.classList.add('show', 'danger');
  } else if (current && !hasCurrent) {
    alert.textContent = 'Esta placa não possui MOTORISTA FROTA nesta programação. Selecione um motorista válido.';
    alert.classList.add('show', 'danger');
  } else if (!current) {
    alert.textContent = 'Selecione quem dará a carona. A placa será vinculada ao motorista escolhido.';
    alert.classList.add('show');
    alert.classList.remove('danger');
  } else {
    const selected = drivers.find((item) => item.placa === current);
    alert.textContent = selected ? `Carona com ${selected.nome} — ${selected.placa}` : '';
    alert.classList.toggle('show', Boolean(selected));
    alert.classList.remove('danger');
  }
}

async function refreshModelAndUi() {
  if (refreshing) return;
  const ids = activeProgramIds();
  if (!ids.length) return;
  refreshing = true;
  try {
    const [programRows, displacementRows] = await Promise.all([
      fetchAll('programacao_colaboradores', 'programacao_id,colaborador_id,nome_colaborador', 'programacao_id', ids),
      fetchAll('programacao_deslocamento', 'programacao_id,colaborador_id,nome_colaborador,tipo_deslocamento,placa_veiculo', 'programacao_id', ids),
    ]);
    model.programIds = ids;
    model.programByColab = buildProgramMap(programRows);
    model.driversByProgram = mergeDriversFromDom(displacementRows);
    document.querySelectorAll('tr[data-table="programacao_deslocamento"]').forEach((tr) => enhanceCaronaRow(tr, displacementRows));
  } catch (error) {
    console.warn('[programacao-carona-motorista] Falha ao atualizar vínculos:', error);
  } finally {
    refreshing = false;
  }
}

function scheduleRefresh(delay = 250) {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(refreshModelAndUi, delay);
}

function programForRowCached(tr) {
  const candidates = model.programByColab.get(String(tr?.dataset?.colabId || '')) || [];
  return candidates.length === 1 ? candidates[0] : null;
}

function hasDriverForRow(tr) {
  const pid = programForRowCached(tr);
  if (!pid) return false;
  const colabId = String(tr.dataset.colabId || '');
  return (model.driversByProgram.get(pid) || []).some((item) => item.colaboradorId !== colabId && item.placa);
}

function bindGuards() {
  document.addEventListener('focusin', (event) => {
    if (event.target.matches('tr[data-table="programacao_deslocamento"] [data-field="tipo_deslocamento"]')) {
      event.target.dataset.previousValue = event.target.value || 'NÃO PRECISA';
    }
  }, true);

  document.addEventListener('change', (event) => {
    const field = event.target;
    const tr = field.closest?.('tr[data-table="programacao_deslocamento"]');
    if (!tr) return;

    if (field.matches('[data-field="tipo_deslocamento"]') && norm(field.value) === TIPO_CARONA) {
      // Impede o autosave do programacao.js de gravar CARONA FROTA antes que
      // o usuário escolha explicitamente um motorista/placa válido.
      event.stopImmediatePropagation();
      event.stopPropagation();
      if (!hasDriverForRow(tr)) {
        const previous = field.dataset.previousValue || 'NÃO PRECISA';
        field.value = previous === TIPO_CARONA ? 'NÃO PRECISA' : previous;
        toast('Defina primeiro um MOTORISTA FROTA e a placa nesta programação.', 'warn');
        scheduleRefresh(50);
        return;
      }
      scheduleRefresh(50);
      toast('Agora selecione “Motorista — Placa” na coluna de placa para confirmar a carona.', 'ok');
      return;
    }

    if (field.matches('[data-field="placa_veiculo"].prog-carona-driver-select')) {
      if (!field.value) {
        event.stopImmediatePropagation();
        event.stopPropagation();
        toast('Selecione um motorista de frota para confirmar a carona.', 'warn');
        return;
      }
      scheduleRefresh(REFRESH_AFTER_SAVE_MS);
      return;
    }

    if (field.matches('[data-field="tipo_deslocamento"], [data-field="placa_veiculo"]')) {
      scheduleRefresh(REFRESH_AFTER_SAVE_MS);
    }
  }, true);

  document.addEventListener('input', (event) => {
    const field = event.target;
    const tr = field.closest?.('tr[data-table="programacao_deslocamento"]');
    if (!tr) return;
    const tipo = norm(tr.querySelector('[data-field="tipo_deslocamento"]')?.value);
    if (tipo === TIPO_MOTORISTA && field.matches('[data-field="placa_veiculo"]')) {
      scheduleRefresh(REFRESH_AFTER_SAVE_MS);
    }
  }, true);
}

function injectStyles() {
  if (document.getElementById('progCaronaMotoristaStyles')) return;
  const style = document.createElement('style');
  style.id = 'progCaronaMotoristaStyles';
  style.textContent = `
    .prog-carona-driver-select{min-width:210px;max-width:320px}
    .prog-carona-motorista-alert{display:none;margin-top:5px;font-size:10px;line-height:1.35;color:#9fb0a8}
    .prog-carona-motorista-alert.show{display:block}
    .prog-carona-motorista-alert.danger{color:#ff9a9a;font-weight:700}
    .prog-carona-toast{position:fixed;right:18px;bottom:18px;z-index:99999;max-width:430px;padding:12px 14px;border-radius:12px;background:#17211d;border:1px solid rgba(255,255,255,.13);color:#dcebe3;box-shadow:0 16px 40px rgba(0,0,0,.35);font-size:12px;line-height:1.45;opacity:0;transform:translateY(8px);pointer-events:none;transition:.18s ease}
    .prog-carona-toast.show{opacity:1;transform:translateY(0)}
    .prog-carona-toast.warn{border-color:rgba(245,196,81,.45)}
    .prog-carona-toast.ok{border-color:rgba(52,211,153,.38)}
  `;
  document.head.appendChild(style);
}

injectStyles();
bindGuards();

const observer = new MutationObserver((mutations) => {
  if (mutations.some((mutation) => [...mutation.addedNodes].some((node) =>
    node.nodeType === 1 && (node.matches?.('tr[data-table="programacao_deslocamento"]') || node.querySelector?.('tr[data-table="programacao_deslocamento"]'))
  ))) scheduleRefresh(120);
});
observer.observe(document.body, { childList: true, subtree: true });

scheduleRefresh(500);
window.addEventListener('focus', () => scheduleRefresh(100));
