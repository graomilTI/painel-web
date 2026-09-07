// Programação Gestor — prioridade fixa da lista de O.S.
// Regra: qualquer O.S. que NÃO esteja em ATENDER permanece acima das O.S. em ATENDER.
// A ordenação escolhida nos cabeçalhos continua sendo preservada dentro de cada grupo.

let reorderScheduled = false;

function isAtenderRow(row) {
  return Boolean(row?.querySelector('.pld-dot.tone-atender'));
}

function reorderOsRows(tbody) {
  const rows = Array.from(tbody?.querySelectorAll(':scope > tr.pld-row[data-os-id]') || []);
  if (rows.length < 2) return;

  const ordered = [...rows].sort((a, b) => Number(isAtenderRow(a)) - Number(isAtenderRow(b)));
  const alreadyOrdered = rows.every((row, index) => row === ordered[index]);
  if (alreadyOrdered) return;

  const fragment = document.createDocumentFragment();
  ordered.forEach((row) => fragment.appendChild(row));
  tbody.appendChild(fragment);
}

function applyPriority() {
  document.querySelectorAll('.pld-table tbody').forEach(reorderOsRows);
}

function schedulePriority() {
  if (reorderScheduled) return;
  reorderScheduled = true;
  requestAnimationFrame(() => {
    reorderScheduled = false;
    applyPriority();
  });
}

const observer = new MutationObserver(schedulePriority);
observer.observe(document.documentElement, { childList: true, subtree: true });

schedulePriority();
