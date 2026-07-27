from pathlib import Path
import re

path = Path('assets/js/logistica-conferencia-ocr.js')
source = path.read_text(encoding='utf-8')


def replace_once(old: str, new: str, label: str) -> None:
    global source
    count = source.count(old)
    if count != 1:
        raise RuntimeError(f'{label}: esperado 1 trecho, encontrado {count}')
    source = source.replace(old, new, 1)


replace_once(
    "const normCode = (v) => norm(v).replace(/[^A-Z0-9]/g, '');\n",
    "const normCode = (v) => norm(v).replace(/[^A-Z0-9]/g, '');\nconst normPlate = (v) => normCode(v);\n",
    'normalizador de placa',
)

laudo_block = """const laudoUrls = (row) => String(row?.observacao_logistica || '').startsWith('LAUDO:')
  ? String(row.observacao_logistica).slice(6).split(',').map((v) => v.trim()).filter(Boolean) : [];
"""
replace_once(
    laudo_block,
    laudo_block + """
function formatPlate(value) {
  const plate = normPlate(value);
  if (!plate) return '-';
  return plate.length === 7 ? `${plate.slice(0, 3)}-${plate.slice(3)}` : plate;
}
""",
    'formatador de placa',
)

compare_re = re.compile(
    r"function compare\(systemRows, reportRows\) \{.*?\n\}\n\nfunction formatKg",
    re.S,
)
compare_new = r'''function selectPlateMatch(candidates, report) {
  if (!candidates.length) return null;
  if (candidates.length === 1) return candidates[0];

  const reportLoadCode = normCode(report.carga);
  if (reportLoadCode) {
    const sameLoad = candidates.filter(({ system }) => normCode(system.carga) === reportLoadCode);
    if (sameLoad.length === 1) return sameLoad[0];
  }

  const reportNf = normCode(report.nf);
  if (reportNf) {
    const sameNf = candidates.filter(({ system }) => normCode(system.nf) === reportNf);
    if (sameNf.length === 1) return sameNf[0];
  }

  if (report.pesoKg != null) {
    return [...candidates].sort((a, b) => {
      const distanceA = a.system.pesoKg == null ? Number.POSITIVE_INFINITY : Math.abs(a.system.pesoKg - report.pesoKg);
      const distanceB = b.system.pesoKg == null ? Number.POSITIVE_INFINITY : Math.abs(b.system.pesoKg - report.pesoKg);
      return distanceA - distanceB;
    })[0];
  }

  return candidates[0];
}

function compare(systemRows, reportRows) {
  const result = [];
  const used = new Set();

  reportRows.forEach((report) => {
    const available = systemRows.map((system, index) => ({ system, index })).filter(({ index }) => !used.has(index));
    const reportPlate = normPlate(report.placa);
    const reportLoadCode = normCode(report.carga);

    let found = available.find(({ system }) => reportPlate && reportLoadCode
      && normPlate(system.placa) === reportPlate
      && normCode(system.carga) === reportLoadCode);
    let status = LABEL.OK;
    let note = 'Placa, carga e peso correspondem.';

    if (!found && reportPlate) {
      found = selectPlateMatch(available.filter(({ system }) => normPlate(system.placa) === reportPlate), report);
    }

    if (!found && reportLoadCode) {
      const sameLoad = available.filter(({ system }) => normCode(system.carga) === reportLoadCode);
      if (sameLoad.length === 1) {
        found = sameLoad[0];
        status = LABEL.PLATE;
        note = `Carga localizada, mas a placa diverge: sistema ${formatPlate(found.system.placa)} × relatório ${formatPlate(report.placa)}.`;
      }
    }

    if (!found) {
      result.push({ status: LABEL.NOT_FOUND, system: null, report, note: 'Não consta nesta O.S.' });
      return;
    }

    used.add(found.index);
    const diff = found.system.pesoKg == null || report.pesoKg == null ? null : Math.abs(found.system.pesoKg - report.pesoKg);
    if (status === LABEL.OK && (found.system.pesoKg == null || report.pesoKg == null)) {
      status = LABEL.WEIGHT;
      note = 'Peso não localizado em uma das fontes.';
    } else if (status === LABEL.OK && diff > 1) {
      status = LABEL.WEIGHT;
      note = `Peso diverge em ${formatKg(diff)}.`;
    } else if (status === LABEL.PLATE && diff > 1) {
      note += ` O peso também diverge em ${formatKg(diff)}.`;
    }
    result.push({ status, system: found.system, report, note });
  });

  systemRows.forEach((system, index) => {
    if (!used.has(index)) result.push({ status: LABEL.MISSING, system, report: null, note: 'Não identificada no relatório.' });
  });

  const order = { [LABEL.NOT_FOUND]: 1, [LABEL.MISSING]: 2, [LABEL.PLATE]: 3, [LABEL.WEIGHT]: 4, [LABEL.OK]: 5 };
  return result.sort((a, b) => order[a.status] - order[b.status]);
}

function formatKg'''
source, count = compare_re.subn(lambda _match: compare_new, source, count=1)
if count != 1:
    raise RuntimeError(f'comparação de cargas: esperado 1 trecho, encontrado {count}')

style_re = re.compile(
    r"  style\.textContent = `.*?`;\n  document\.head\.appendChild\(style\);",
    re.S,
)
style_new = r'''  style.textContent = `
    #logConferenciasLaudos .pc-actions{display:flex!important;flex-direction:row!important;gap:6px;min-width:390px}#logConferenciasLaudos .pc-actions .btn{width:auto!important;min-width:105px;white-space:nowrap}#logConferenciasLaudos .pc-actions .btn:disabled{opacity:.45}
    .pc-bg{position:fixed;inset:0;z-index:10080;background:rgba(0,8,5,.84);display:flex;align-items:center;justify-content:center;padding:12px}
    .pc-box{width:min(1580px,98vw);height:min(880px,96vh);max-height:96vh;display:flex;flex-direction:column;background:#031b12;border:1px solid rgba(52,211,153,.3);border-radius:18px;overflow:hidden;color:#e5f7ee}
    .pc-head,.pc-foot{display:flex;flex:0 0 auto;justify-content:space-between;align-items:center;gap:12px;padding:13px 16px;border-bottom:1px solid rgba(52,211,153,.18)}.pc-head h2{margin:0}.pc-head p{margin:4px 0 0;color:#8dac9d;font-size:12px}
    .pc-body{min-height:0;flex:1;display:flex;flex-direction:column;padding:12px 16px;overflow:hidden}
    .pc-kpis{flex:0 0 auto;display:grid;grid-template-columns:repeat(5,minmax(100px,1fr));gap:7px;margin-bottom:10px}.pc-kpi{min-height:55px;padding:8px 10px;border:1px solid rgba(52,211,153,.15);border-radius:12px;background:rgba(2,17,12,.6)}.pc-kpi small{display:block;color:#83a697;font-size:10px;text-transform:uppercase}.pc-kpi b{font-size:19px}
    .pc-docs{flex:0 0 auto;display:flex;gap:7px;flex-wrap:wrap;margin-bottom:9px}.pc-docs a{color:#9cf5c8;text-decoration:none;border:1px solid rgba(52,211,153,.2);border-radius:999px;padding:6px 9px}
    .pc-table-wrap{min-height:0;flex:1;overflow:auto;border:1px solid rgba(52,211,153,.16);border-radius:12px}.pc-table{width:100%;min-width:0;table-layout:fixed;border-collapse:collapse;font-size:12px}.pc-table th{position:sticky;top:0;z-index:2;background:#06251a;color:#8ef0bd;padding:8px 6px;text-align:left;font-size:9px;line-height:1.2;text-transform:uppercase;white-space:normal}.pc-table td{padding:8px 6px;border-top:1px solid rgba(148,163,184,.1);vertical-align:top;line-height:1.35;overflow-wrap:anywhere;word-break:break-word}
    .pc-table th:nth-child(1),.pc-table td:nth-child(1){width:7%}.pc-table th:nth-child(2),.pc-table td:nth-child(2){width:11%}.pc-table th:nth-child(3),.pc-table td:nth-child(3),.pc-table th:nth-child(4),.pc-table td:nth-child(4){width:8%}.pc-table th:nth-child(5),.pc-table td:nth-child(5),.pc-table th:nth-child(6),.pc-table td:nth-child(6){width:10%}.pc-table th:nth-child(7),.pc-table td:nth-child(7){width:7%}.pc-table th:nth-child(8),.pc-table td:nth-child(8){width:5%;text-align:center}.pc-table th:nth-child(9),.pc-table td:nth-child(9){width:6%;text-align:center}.pc-table th:nth-child(10),.pc-table td:nth-child(10){width:18%}
    .pc-tag{display:inline-flex;max-width:100%;padding:4px 6px;border-radius:8px;font-size:9px;line-height:1.2;font-weight:900;white-space:normal;text-align:center}.pc-ok{background:rgba(34,197,94,.14);color:#bbf7d0}.pc-warn{background:rgba(245,158,11,.14);color:#fde68a}.pc-bad{background:rgba(239,68,68,.14);color:#fecaca}
    .pc-close{border:1px solid rgba(148,163,184,.2);background:#09261b;color:white;border-radius:10px;padding:8px 12px;cursor:pointer}.pc-loading,.pc-error{padding:28px;text-align:center}.pc-error{color:#fecaca;white-space:pre-wrap}.pc-progress{display:grid;gap:8px;max-width:760px;margin:18px auto 0;text-align:left}.pc-progress-row{display:grid;grid-template-columns:minmax(120px,1fr) 3fr auto;align-items:center;gap:10px;padding:10px;border:1px solid rgba(52,211,153,.16);border-radius:12px;background:rgba(2,17,12,.55)}.pc-progress-row b{font-size:12px}.pc-progress-row span{color:#a7c5b7;font-size:12px}.pc-progress-bar{height:7px;border-radius:999px;background:rgba(148,163,184,.16);overflow:hidden}.pc-progress-bar i{display:block;height:100%;width:0;background:#34d399;transition:width .25s ease}.pc-foot{justify-content:flex-end;border-bottom:0;border-top:1px solid rgba(52,211,153,.18)}
    @media(max-width:1100px){.pc-box{width:99vw;height:98vh;max-height:98vh}.pc-table{min-width:1050px;table-layout:auto}.pc-table-wrap{overflow-x:auto}}
    @media(max-width:800px){.pc-bg{padding:4px}.pc-kpis{grid-template-columns:repeat(2,1fr)}.pc-progress-row{grid-template-columns:1fr}}
  `;
  document.head.appendChild(style);'''
source, count = style_re.subn(lambda _match: style_new, source, count=1)
if count != 1:
    raise RuntimeError(f'layout do modal: esperado 1 trecho, encontrado {count}')

replace_once(
    "${esc(item.system?.placa || '-')}",
    "${esc(formatPlate(item.system?.placa))}",
    'placa do sistema na tabela',
)
replace_once(
    "${esc(item.report?.placa || '-')}",
    "${esc(formatPlate(item.report?.placa))}",
    'placa do relatório na tabela',
)

old_history = """  (data || []).forEach((row) => cache.set(String(row.os_id), { numeroOs: row.numero_os, urls: row.laudo_urls || [], system: row.cargas_sistema || [], report: row.cargas_ocr || [], result: row.resultado || [] }));
"""
new_history = """  (data || []).forEach((row) => {
    const system = row.cargas_sistema || [];
    const report = row.cargas_ocr || [];
    cache.set(String(row.os_id), { numeroOs: row.numero_os, urls: row.laudo_urls || [], system, report, result: compare(system, report) });
  });
"""
replace_once(old_history, new_history, 'normalização do histórico')

old_session = """  try { const value = JSON.parse(sessionStorage.getItem(`pre-conferencia-os:${id}`) || 'null'); if (value) cache.set(String(id), value); } catch { /* vazio */ }
"""
new_session = """  try {
    const value = JSON.parse(sessionStorage.getItem(`pre-conferencia-os:${id}`) || 'null');
    if (value) {
      value.result = compare(value.system || [], value.report || []);
      cache.set(String(id), value);
    }
  } catch { /* vazio */ }
"""
replace_once(old_session, new_session, 'normalização do sessionStorage')

path.write_text(source, encoding='utf-8')
print(f'Atualizado: {path}')
