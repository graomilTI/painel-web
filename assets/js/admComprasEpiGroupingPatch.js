// Agrupa visualmente os EPIs por colaborador no Painel de Compras.
// O fluxo original continua igual: o comprador pode marcar o grupo inteiro ou abrir cada item.

function normComprasEpi(value = '') {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function isLinhaEpi(row) {
  const cells = row?.children || [];
  const tipo = cells[5]?.textContent || '';
  const material = cells[4]?.textContent || '';
  return normComprasEpi(tipo).includes('epi') || normComprasEpi(material).includes('ca pendente') || normComprasEpi(material).includes('ca:');
}

function getColaboradorEpi(row) {
  const materialCell = row.children?.[4];
  if (!materialCell) return 'SEM COLABORADOR';

  const smalls = [...materialCell.querySelectorAll('small')]
    .map((el) => el.textContent.trim())
    .filter(Boolean)
    .filter((txt) => !/^tam\s*:/i.test(txt));

  return smalls[smalls.length - 1] || 'SEM COLABORADOR';
}

function getQuantidade(row) {
  return Number(String(row.children?.[3]?.textContent || '1').replace(/\D+/g, '') || 1);
}

function getValor(row) {
  const text = row.children?.[7]?.textContent || '0';
  const clean = text.replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.');
  return Number(clean || 0);
}

function formatMoney(value) {
  return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function criarLinhaGrupo(nome, rows, colCount) {
  const totalItens = rows.length;
  const totalUn = rows.reduce((sum, row) => sum + getQuantidade(row), 0);
  const totalValor = rows.reduce((sum, row) => sum + getValor(row), 0);
  const materiais = rows.map((row) => {
    const cell = row.children?.[4];
    const first = [...(cell?.childNodes || [])].find((node) => node.nodeType === Node.TEXT_NODE && node.textContent.trim());
    return (first?.textContent || cell?.textContent || '').split('Tam:')[0].split(nome)[0].trim();
  }).filter(Boolean);

  const tr = document.createElement('tr');
  tr.className = 'adm-cmp-epi-group-row';
  tr.setAttribute('data-epi-group-header', '1');
  tr.innerHTML = `
    <td colspan="${colCount}" style="background:rgba(16,185,129,.11);border-top:1px solid rgba(74,222,128,.35);border-bottom:1px solid rgba(74,222,128,.2);padding:12px 14px">
      <div style="display:flex;gap:12px;align-items:center;justify-content:space-between;flex-wrap:wrap">
        <div>
          <strong style="color:#bbf7d0">EPI — ${nome}</strong>
          <div style="font-size:12px;color:#94a3b8;margin-top:4px">${totalItens} item(ns) · ${totalUn} unidade(s) · ${materiais.join(' · ')}</div>
        </div>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <strong style="color:#e2e8f0">${formatMoney(totalValor)}</strong>
          <button type="button" class="btn btn-small btn-secondary" data-epi-group-check>Selecionar grupo</button>
        </div>
      </div>
    </td>
  `;

  tr.querySelector('[data-epi-group-check]')?.addEventListener('click', () => {
    const shouldCheck = rows.some((row) => !row.querySelector('input[type="checkbox"]')?.checked);
    rows.forEach((row) => {
      const checkbox = row.querySelector('input[type="checkbox"]');
      if (!checkbox) return;
      checkbox.checked = shouldCheck;
      checkbox.dispatchEvent(new Event('change', { bubbles: true }));
    });
  });

  return tr;
}

function agruparEpisCompras() {
  const body = document.getElementById('admCmpBody');
  if (!body || body.dataset.epiGroupingRunning === '1') return;

  const allRows = [...body.querySelectorAll(':scope > tr')]
    .filter((row) => !row.hasAttribute('data-epi-group-header'));

  if (!allRows.length) return;
  if (allRows.some((row) => row.classList.contains('adm-cmp-group-row'))) return;

  const epiRows = allRows.filter(isLinhaEpi);
  if (epiRows.length < 2) return;

  body.dataset.epiGroupingRunning = '1';
  body.querySelectorAll('[data-epi-group-header]').forEach((row) => row.remove());

  const colCount = allRows[0]?.children?.length || 9;
  const groups = new Map();
  const nonEpi = [];

  allRows.forEach((row) => {
    if (!isLinhaEpi(row)) {
      nonEpi.push(row);
      return;
    }
    const colab = getColaboradorEpi(row);
    const key = normComprasEpi(colab || 'SEM COLABORADOR');
    if (!groups.has(key)) groups.set(key, { nome: colab || 'SEM COLABORADOR', rows: [] });
    groups.get(key).rows.push(row);
  });

  const frag = document.createDocumentFragment();
  nonEpi.forEach((row) => frag.appendChild(row));

  [...groups.values()]
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
    .forEach((group) => {
      frag.appendChild(criarLinhaGrupo(group.nome, group.rows, colCount));
      group.rows.forEach((row) => frag.appendChild(row));
    });

  body.appendChild(frag);
  body.dataset.epiGroupingRunning = '0';
}

function iniciarAgrupamentoEpiCompras() {
  const aplicar = () => {
    try { agruparEpisCompras(); } catch (error) { console.warn('[EPI compras agrupamento]', error); }
  };

  const observer = new MutationObserver(() => setTimeout(aplicar, 80));
  observer.observe(document.body, { childList: true, subtree: true });
  setInterval(aplicar, 1200);
  aplicar();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', iniciarAgrupamentoEpiCompras, { once: true });
} else {
  iniciarAgrupamentoEpiCompras();
}
