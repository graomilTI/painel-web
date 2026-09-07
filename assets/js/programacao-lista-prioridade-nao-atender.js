// Programação Gestor — prioridade fixa da lista de O.S.
// Prioridade:
// 1) O.S. sem ação definida no dia (status_gestor null -> tone-pendente)
// 2) demais O.S. fora de ATENDER
// 3) O.S. em ATENDER
// A ordenação escolhida nos cabeçalhos continua sendo preservada dentro de cada grupo.

let reorderScheduled = false;

function rowPriority(row) {
  if (row?.querySelector('.pld-dot.tone-pendente')) return 0;
  if (row?.querySelector('.pld-dot.tone-atender')) return 2;
  return 1;
}

function reorderOsRows(tbody) {
  const rows = Array.from(tbody?.querySelectorAll(':scope > tr.pld-row[data-os-id]') || []);
  if (rows.length < 2) return;

  const originalIndex = new Map(rows.map((row, index) => [row, index]));
  const ordered = [...rows].sort((a, b) => {
    const priorityDiff = rowPriority(a) - rowPriority(b);
    if (priorityDiff) return priorityDiff;
    return originalIndex.get(a) - originalIndex.get(b);
  });

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
