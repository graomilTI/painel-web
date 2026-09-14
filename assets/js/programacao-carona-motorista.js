import { supabase } from './supabaseClient.js';

const TIPO_MOTORISTA = 'MOTORISTA FROTA';
const TIPO_CARONA = 'CARONA FROTA';
const TIPO_LOGISTICA = 'LOGISTICA';
const REFRESH_AFTER_SAVE_MS = 900;

let model = {
  programIds: [],
  programByColab: new Map(),
  supervisionByProgram: new Map(),
  supervisionByColabProgram: new Map(),
  vehiclesBySupervision: new Map(),
  driversByProgram: new Map(),
  displacementRows: [],
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

async function fetchPatrimonioVehicles(supervisoes) {
  const unique = [...new Set((supervisoes || []).map((value) => String(value || '').trim()).filter(Boolean))];
  if (!unique.length) return [];
  const out = [];
  const pageSize = 1000;
  for (let page = 0; page < 10; page += 1) {
    const from = page * pageSize;
    const to = from + pageSize - 1;
    const { data, error } = await supabase
      .from('vw_patrimonios_atual')
      .select('patrimonio_codigo,supervisao,funcionario,identificacao,categoria,marca,modelo,situacao')
      .in('supervisao', unique)
      .eq('categoria', 'VEICULOS')
      .eq('situacao', 'Ativo')
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
  const supervisionByColabProgram = new Map();
  for (const row of programRows) {
    const colabId = String(row.colaborador_id || '');
    const pid = String(row.programacao_id || '');
    if (!colabId || !pid) continue;
    if (!byColab.has(colabId)) byColab.set(colabId, []);
    byColab.get(colabId).push(pid);
    supervisionByColabProgram.set(`${pid}|${colabId}`, String(row.supervisao || '').trim());
  }
  for (const [colabId, items] of byColab) byColab.set(colabId, [...new Set(items)]);
  return { byColab, supervisionByColabProgram };
}

function buildSupervisionMap(programDayRows) {
  const map = new Map();
  for (const row of programDayRows || []) {
    if (!row?.id) continue;
    map.set(String(row.id), String(row.supervisao || '').trim());
  }
  return map;
}

function buildVehicleMap(rows) {
  const map = new Map();
  for (const row of rows || []) {
    const supervisao = String(row.supervisao || '').trim();
    const supervisaoKey = norm(supervisao);
    const placa = plate(row.identificacao);
    if (!supervisaoKey || !placa) continue;
    if (!map.has(supervisaoKey)) map.set(supervisaoKey, []);
    map.get(supervisaoKey).push({
      placa,
      supervisao,
      patrimonioCodigo: row.patrimonio_codigo || '',
      funcionario: String(row.funcionario || '').trim(),
      identificacao: String(row.identificacao || '').trim(),
      marca: String(row.marca || '').trim(),
      modelo: String(row.modelo || '').trim(),
    });
  }
  for (const [key, items] of map) {
    const dedup = new Map();
    items.forEach((item) => {
      if (!dedup.has(item.placa)) dedup.set(item.placa, item);
    });
    map.set(key, [...dedup.values()].sort((a, b) => a.placa.localeCompare(b.placa, 'pt-BR')));
  }
  return map;
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

function rowSupervision(tr, programId) {
  const colabId = String(tr?.dataset?.colabId || '');
  return model.supervisionByColabProgram.get(`${programId}|${colabId}`)
    || model.supervisionByProgram.get(String(programId || ''))
    || '';
}

function vehiclesForProgram(programId, colabId = '') {
  const supervisao = model.supervisionByColabProgram.get(`${programId}|${String(colabId || '')}`)
    || model.supervisionByProgram.get(String(programId || ''))
    || '';
  return model.vehiclesBySupervision.get(norm(supervisao)) || [];
}

function isPlateAvailable(programId, colabId, placa) {
  const normalized = plate(placa);
  if (!normalized) return false;
  return vehiclesForProgram(programId, colabId).some((item) => item.placa === normalized);
}

function driversFromRows(displacementRows) {
  const map = new Map();
  for (const row of displacementRows) {
    if (norm(row.tipo_deslocamento) !== TIPO_MOTORISTA) continue;
    const placa = plate(row.placa_veiculo);
    const pid = String(row.programacao_id || '');
    const colabId = String(row.colaborador_id || '');
    if (!placa || !pid || !isPlateAvailable(pid, colabId, placa)) continue;
    if (!map.has(pid)) map.set(pid, []);
    map.get(pid).push({
      programacaoId: pid,
      colaboradorId: colabId,
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
    if (!isPlateAvailable(pid, colabId, placa)) return;
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
    options.push(`<option value="${esc(current)}" selected>⚠ ${esc(current)} — vínculo inválido</option>`);
  }
  for (const item of drivers) {
    options.push(`<option value="${esc(item.placa)}" ${item.placa === current ? 'selected' : ''}>${esc(item.nome)} — ${esc(item.placa)}</option>`);
  }
  return { drivers, html: options.join(''), hasCurrent };
}

function vehicleOptions(programId, colabId, currentPlate) {
  const vehicles = vehiclesForProgram(programId, colabId);
  const current = plate(currentPlate);
  const hasCurrent = vehicles.some((item) => item.placa === current);
  const options = ['<option value="">Selecione a placa da supervisão</option>'];
  if (current && !hasCurrent) {
    options.push(`<option value="${esc(current)}" selected>⚠ ${esc(current)} — fora da supervisão / indisponível</option>`);
  }
  for (const item of vehicles) {
    const detalhe = [item.modelo || item.marca, item.funcionario ? `Atual: ${item.funcionario}` : 'sem responsável'].filter(Boolean).join(' · ');
    options.push(`<option value="${esc(item.placa)}" ${item.placa === current ? 'selected' : ''}>${esc(item.placa)}${detalhe ? ` — ${esc(detalhe)}` : ''}</option>`);
  }
  return { vehicles, html: options.join(''), hasCurrent };
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
  if (!field || field.tagName !== 'SELECT' || (!field.classList.contains('prog-carona-driver-select') && !field.classList.contains('prog-supervisao-vehicle-select'))) return;
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

function ensureVehicleSelect(tr, displacementRows, role) {
  const pid = rowProgramId(tr, displacementRows);
  const existing = tr.querySelector('[data-field="placa_veiculo"]');
  if (!existing) return;
  const current = plate(existing.value);
  const blocked = existing.disabled;
  const alert = ensureAlert(tr);

  if (!pid) {
    alert.textContent = 'Não foi possível identificar a programação deste colaborador. Recarregue a programação antes de definir a placa.';
    alert.classList.add('show', 'danger');
    return;
  }

  const supervisao = rowSupervision(tr, pid);
  const { vehicles, html, hasCurrent } = vehicleOptions(pid, tr.dataset.colabId, current);
  let select = existing;
  if (select.tagName !== 'SELECT' || !select.classList.contains('prog-supervisao-vehicle-select')) {
    select = document.createElement('select');
    select.setAttribute('data-field', 'placa_veiculo');
    select.className = 'prog-supervisao-vehicle-select';
    if (blocked) select.disabled = true;
    existing.replaceWith(select);
  }
  select.innerHTML = html;
  if (current) select.value = current;
  select.disabled = Boolean(blocked) || vehicles.length === 0;

  if (!supervisao) {
    alert.textContent = 'A supervisão desta programação não foi identificada.';
    alert.classList.add('show', 'danger');
  } else if (!vehicles.length) {
    alert.textContent = `Nenhum veículo ATIVO encontrado em Patrimônios para a supervisão ${supervisao}.`;
    alert.classList.add('show', 'danger');
  } else if (current && !hasCurrent) {
    alert.textContent = `A placa ${current} não consta como veículo ATIVO da supervisão ${supervisao} em Patrimônios. Selecione outra placa.`;
    alert.classList.add('show', 'danger');
  } else if (!current) {
    alert.textContent = `Selecione uma placa ATIVA de Patrimônios — supervisão ${supervisao}.`;
    alert.classList.add('show');
    alert.classList.remove('danger');
  } else {
    alert.textContent = `${role}: ${current} · Patrimônios · ${supervisao}`;
    alert.classList.add('show');
    alert.classList.remove('danger');
  }
}

function enhanceCaronaRow(tr, displacementRows) {
  const tipo = norm(tr.querySelector('[data-field="tipo_deslocamento"]')?.value);
  if (tipo !== TIPO_CARONA) return false;

  const pid = rowProgramId(tr, displacementRows);
  const existing = tr.querySelector('[data-field="placa_veiculo"]');
  const current = plate(existing?.value);
  const blocked = existing?.disabled;
  const alert = ensureAlert(tr);

  if (!pid) {
    alert.textContent = 'Não foi possível identificar a programação deste colaborador. Recarregue a programação antes de definir a carona.';
    alert.classList.add('show', 'danger');
    return true;
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

  const supervisao = rowSupervision(tr, pid);
  if (!drivers.length) {
    alert.textContent = `Defina primeiro um MOTORISTA FROTA com placa ATIVA de Patrimônios da supervisão ${supervisao || 'desta programação'}.`;
    alert.classList.add('show', 'danger');
  } else if (current && !hasCurrent) {
    alert.textContent = 'Esta placa não possui MOTORISTA FROTA válido nesta programação/supervisão. Selecione um motorista válido.';
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
  return true;
}

function enhanceRow(tr, displacementRows) {
  const table = tr.dataset.table;
  const tipo = norm(tr.querySelector('[data-field="tipo_deslocamento"]')?.value);
  const disponibilidade = norm(tr.querySelector('[data-field="disponibilidade"]')?.value);

  if (table === 'programacao_deslocamento') {
    if (enhanceCaronaRow(tr, displacementRows)) return;
    if (tipo === TIPO_MOTORISTA) {
      ensureVehicleSelect(tr, displacementRows, 'Motorista Frota');
      return;
    }
  }

  if (table === 'programacao_colaboradores' && disponibilidade === TIPO_LOGISTICA) {
    ensureVehicleSelect(tr, displacementRows, 'Logística');
    return;
  }

  restorePlateInput(tr);
}

async function refreshModelAndUi() {
  if (refreshing) return;
  const ids = activeProgramIds();
  if (!ids.length) return;
  refreshing = true;
  try {
    const [programRows, displacementRows, programDayRows] = await Promise.all([
      fetchAll('programacao_colaboradores', 'programacao_id,colaborador_id,nome_colaborador,supervisao', 'programacao_id', ids),
      fetchAll('programacao_deslocamento', 'programacao_id,colaborador_id,nome_colaborador,tipo_deslocamento,placa_veiculo', 'programacao_id', ids),
      fetchAll('programacao_dia', 'id,supervisao', 'id', ids),
    ]);

    const programMaps = buildProgramMap(programRows);
    const supervisoes = [
      ...programRows.map((row) => String(row.supervisao || '').trim()),
      ...programDayRows.flatMap((row) => String(row.supervisao || '').split('|').map((item) => item.trim())),
    ].filter(Boolean);
    const patrimonioRows = await fetchPatrimonioVehicles(supervisoes);

    model.programIds = ids;
    model.programByColab = programMaps.byColab;
    model.supervisionByColabProgram = programMaps.supervisionByColabProgram;
    model.supervisionByProgram = buildSupervisionMap(programDayRows);
    model.vehiclesBySupervision = buildVehicleMap(patrimonioRows);
    model.displacementRows = displacementRows;
    model.driversByProgram = mergeDriversFromDom(displacementRows);

    document.querySelectorAll('tr[data-table="programacao_deslocamento"], tr[data-table="programacao_colaboradores"]').forEach((tr) => enhanceRow(tr, displacementRows));
  } catch (error) {
    console.warn('[programacao-carona-motorista] Falha ao atualizar vínculos/placas por supervisão:', error);
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
  const pid = rowProgramId(tr, model.displacementRows);
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
    const tr = field.closest?.('tr[data-table="programacao_deslocamento"], tr[data-table="programacao_colaboradores"]');
    if (!tr) return;

    if (field.matches('tr[data-table="programacao_deslocamento"] [data-field="tipo_deslocamento"]')) {
      const tipo = norm(field.value);
      if (tipo === TIPO_CARONA) {
        event.stopImmediatePropagation();
        event.stopPropagation();
        if (!hasDriverForRow(tr)) {
          const previous = field.dataset.previousValue || 'NÃO PRECISA';
          field.value = previous === TIPO_CARONA ? 'NÃO PRECISA' : previous;
          toast('Defina primeiro um MOTORISTA FROTA com uma placa ATIVA da supervisão em Patrimônios.', 'warn');
          scheduleRefresh(50);
          return;
        }
        scheduleRefresh(50);
        toast('Agora selecione “Motorista — Placa” na coluna de placa para confirmar a carona.', 'ok');
        return;
      }
      if (tipo === TIPO_MOTORISTA) {
        event.stopImmediatePropagation();
        event.stopPropagation();
        scheduleRefresh(50);
        toast('Selecione uma placa ATIVA de Patrimônios da supervisão desta programação.', 'ok');
        return;
      }
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

    if (field.matches('[data-field="placa_veiculo"].prog-supervisao-vehicle-select')) {
      if (!field.value) {
        event.stopImmediatePropagation();
        event.stopPropagation();
        toast('Selecione uma placa disponível para esta supervisão.', 'warn');
        return;
      }
      scheduleRefresh(REFRESH_AFTER_SAVE_MS);
      return;
    }

    if (field.matches('[data-field="tipo_deslocamento"], [data-field="placa_veiculo"], [data-field="disponibilidade"]')) {
      scheduleRefresh(REFRESH_AFTER_SAVE_MS);
    }
  }, true);

  document.addEventListener('input', (event) => {
    const field = event.target;
    const tr = field.closest?.('tr[data-table="programacao_deslocamento"], tr[data-table="programacao_colaboradores"]');
    if (!tr) return;
    if (field.matches('[data-field="placa_veiculo"]')) scheduleRefresh(REFRESH_AFTER_SAVE_MS);
  }, true);
}

function injectStyles() {
  if (document.getElementById('progCaronaMotoristaStyles')) return;
  const style = document.createElement('style');
  style.id = 'progCaronaMotoristaStyles';
  style.textContent = `
    .prog-carona-driver-select,.prog-supervisao-vehicle-select{min-width:210px;max-width:360px}
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
    node.nodeType === 1 && (
      node.matches?.('tr[data-table="programacao_deslocamento"], tr[data-table="programacao_colaboradores"]')
      || node.querySelector?.('tr[data-table="programacao_deslocamento"], tr[data-table="programacao_colaboradores"]')
    )
  ))) scheduleRefresh(120);
});
observer.observe(document.body, { childList: true, subtree: true });

scheduleRefresh(500);
window.addEventListener('focus', () => scheduleRefresh(100));
