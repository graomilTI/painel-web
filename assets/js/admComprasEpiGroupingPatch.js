import { supabase } from './supabaseClient.js';

// Aba exclusiva de EPI no Painel de Compras.
// - Na aba SOLICITAÇÕES, esconde os EPIs pendentes.
// - Na aba EPI, mostra apenas EPIs pendentes e agrupa por colaborador.
// - O grupo fica fechado: os detalhes aparecem depois no fluxo de cotação/compra.
// - Depois que os EPIs avançam para cotação/compra, voltam para as abas padrão do fluxo.

let painelComprasTabVisual = 'solicitacoes';
let painelComprasClickInterno = false;
let painelComprasAplicandoFiltro = false;
const supervisaoGrupoCache = new Map();

function normComprasEpi(value = '') {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function isLinhaVazia(row) {
  return row?.querySelector?.('.adm-cmp-empty');
}

function isLinhaEpi(row) {
  if (!row || isLinhaVazia(row)) return false;
  const cells = row.children || [];
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

function getItemId(row) {
  return row.querySelector('input[type="checkbox"][data-check]')?.dataset?.check || '';
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

function getMaterialResumo(row, nomeColaborador) {
  const cell = row.children?.[4];
  const clone = cell?.cloneNode(true);
  clone?.querySelectorAll('small').forEach((small) => small.remove());
  return (clone?.textContent || cell?.textContent || '')
    .replace(nomeColaborador, '')
    .replace(/CA\s*:?\s*pendente/ig, '')
    .replace(/CA\s*:?\s*\d+/ig, '')
    .trim();
}

function getSupervisaoCacheKey(rows) {
  return rows.map(getItemId).filter(Boolean).sort().join('|');
}

async function buscarSupervisaoGrupo(rows, target) {
  const ids = rows.map(getItemId).filter(Boolean);
  if (!ids.length || !target) return;
  const cacheKey = getSupervisaoCacheKey(rows);
  if (supervisaoGrupoCache.has(cacheKey)) {
    target.textContent = `Supervisão: ${supervisaoGrupoCache.get(cacheKey)}`;
    return;
  }

  try {
    const { data, error } = await supabase
      .from('compras_itens')
      .select('id,colaborador_supervisao,compras_solicitacoes(supervisao,coordenacao)')
      .in('id', ids);
    if (error) throw error;

    const supervisoes = [...new Set((data || [])
      .map((item) => item.colaborador_supervisao || item.compras_solicitacoes?.supervisao || '')
      .filter(Boolean))];
    const coordenacoes = [...new Set((data || [])
      .map((item) => item.compras_solicitacoes?.coordenacao || '')
      .filter(Boolean))];

    const texto = supervisoes.join(' / ') || coordenacoes.join(' / ') || 'Não informada';
    supervisaoGrupoCache.set(cacheKey, texto);
    target.textContent = `Supervisão: ${texto}`;
  } catch (error) {
    console.warn('[EPI compras supervisão]', error);
    target.textContent = 'Supervisão: Não informada';
  }
}

function marcarRows(rows, shouldCheck) {
  painelComprasAplicandoFiltro = true;
  rows.forEach((row) => {
    const checkbox = row.querySelector('input[type="checkbox"]');
    if (!checkbox) return;
    checkbox.checked = shouldCheck;
    checkbox.dispatchEvent(new Event('change', { bubbles: true }));
  });
  setTimeout(() => { painelComprasAplicandoFiltro = false; }, 120);
}

function criarLinhaGrupo(nome, rows, colCount) {
  const totalItens = rows.length;
  const totalUn = rows.reduce((sum, row) => sum + getQuantidade(row), 0);
  const totalValor = rows.reduce((sum, row) => sum + getValor(row), 0);
  const materiais = rows.map((row) => getMaterialResumo(row, nome)).filter(Boolean);
  const selecionados = rows.filter((row) => row.querySelector('input[type="checkbox"]')?.checked).length;

  const tr = document.createElement('tr');
  tr.className = 'adm-cmp-epi-group-row';
  tr.setAttribute('data-epi-group-header', '1');
  tr.innerHTML = `
    <td colspan="${colCount}" style="background:rgba(16,185,129,.11);border-top:1px solid rgba(74,222,128,.35);border-bottom:1px solid rgba(74,222,128,.2);padding:12px 14px">
      <div style="display:flex;gap:12px;align-items:center;justify-content:space-between;flex-wrap:wrap">
        <div>
          <strong style="color:#bbf7d0">EPI — ${nome}</strong>
          <div data-epi-supervisao style="font-size:12px;color:#fde68a;margin-top:4px;font-weight:700">Supervisão: carregando...</div>
          <div style="font-size:12px;color:#94a3b8;margin-top:4px">${totalItens} item(ns) · ${totalUn} unidade(s) · ${materiais.join(' · ')}</div>
          <div data-epi-group-status style="font-size:12px;color:#bbf7d0;margin-top:4px">${selecionados ? `${selecionados}/${totalItens} selecionado(s)` : 'Grupo fechado — detalhes na cotação'}</div>
        </div>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <strong style="color:#e2e8f0">${formatMoney(totalValor)}</strong>
          <button type="button" class="btn btn-small btn-secondary" data-epi-group-check>${selecionados === totalItens ? 'Desmarcar grupo' : 'Selecionar grupo'}</button>
        </div>
      </div>
    </td>
  `;

  buscarSupervisaoGrupo(rows, tr.querySelector('[data-epi-supervisao]'));

  tr.querySelector('[data-epi-group-check]')?.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    const shouldCheck = rows.some((row) => !row.querySelector('input[type="checkbox"]')?.checked);
    marcarRows(rows, shouldCheck);
    const btn = event.currentTarget;
    const status = tr.querySelector('[data-epi-group-status]');
    btn.textContent = shouldCheck ? 'Desmarcar grupo' : 'Selecionar grupo';
    if (status) status.textContent = shouldCheck ? `${rows.length}/${rows.length} selecionado(s)` : 'Grupo fechado — detalhes na cotação';
  });

  return tr;
}

function limparAgrupamentos(body) {
  body?.querySelectorAll('[data-epi-group-header]').forEach((row) => row.remove());
}

function linhasBase(body) {
  return [...(body?.querySelectorAll(':scope > tr') || [])]
    .filter((row) => !row.hasAttribute('data-epi-group-header'));
}

function mostrarMensagemVazia(body, texto) {
  const colCount = body.querySelector('tr')?.children?.length || 9;
  body.innerHTML = `<tr><td colspan="${colCount}" class="adm-cmp-empty">${texto}</td></tr>`;
}

function aplicarAbaSolicitacoes(body) {
  limparAgrupamentos(body);
  const rows = linhasBase(body);
  let visiveis = 0;
  rows.forEach((row) => {
    const mostrar = !isLinhaEpi(row) || isLinhaVazia(row);
    row.style.display = mostrar ? '' : 'none';
    if (mostrar && !isLinhaVazia(row)) visiveis += 1;
  });
  if (!visiveis && rows.some(isLinhaEpi)) mostrarMensagemVazia(body, 'Nenhuma solicitação comum nesta etapa. As solicitações de EPI ficam na aba EPI.');
}

function aplicarAbaEpi(body) {
  limparAgrupamentos(body);
  const rows = linhasBase(body).filter((row) => !isLinhaVazia(row));
  const epiRows = rows.filter(isLinhaEpi);
  const outrosRows = rows.filter((row) => !isLinhaEpi(row));

  if (!epiRows.length) {
    mostrarMensagemVazia(body, 'Nenhuma solicitação de EPI pendente. Depois da cotação, os EPIs seguem nas demais abas do fluxo.');
    return;
  }

  body.dataset.epiGroupingRunning = '1';
  const colCount = rows[0]?.children?.length || 9;
  const groups = new Map();

  epiRows.forEach((row) => {
    row.style.display = 'none';
    const colab = getColaboradorEpi(row);
    const key = normComprasEpi(colab || 'SEM COLABORADOR');
    if (!groups.has(key)) groups.set(key, { nome: colab || 'SEM COLABORADOR', rows: [] });
    groups.get(key).rows.push(row);
  });

  outrosRows.forEach((row) => { row.style.display = 'none'; });

  const frag = document.createDocumentFragment();
  [...groups.values()]
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
    .forEach((group) => {
      frag.appendChild(criarLinhaGrupo(group.nome, group.rows, colCount));
      group.rows.forEach((row) => {
        row.style.display = 'none';
        frag.appendChild(row);
      });
    });

  outrosRows.forEach((row) => frag.appendChild(row));
  body.appendChild(frag);
  body.dataset.epiGroupingRunning = '0';
}

function aplicarFiltroVisualCompras() {
  if (painelComprasAplicandoFiltro) return;
  const body = document.getElementById('admCmpBody');
  if (!body || body.dataset.epiGroupingRunning === '1') return;

  if (painelComprasTabVisual === 'epi') {
    aplicarAbaEpi(body);
  } else if (painelComprasTabVisual === 'solicitacoes') {
    aplicarAbaSolicitacoes(body);
  } else {
    limparAgrupamentos(body);
    linhasBase(body).forEach((row) => { row.style.display = ''; });
  }
}

function atualizarTabsVisual() {
  const tabs = document.querySelector('.adm-cmp-tabs');
  if (!tabs) return;
  const epiBtn = tabs.querySelector('[data-tab-epi-exclusivo]');
  const tabButtons = [...tabs.querySelectorAll('[data-tab]')];

  if (painelComprasTabVisual === 'epi') {
    tabButtons.forEach((btn) => btn.classList.remove('active'));
    epiBtn?.classList.add('active');
  } else {
    epiBtn?.classList.remove('active');
  }
}

function instalarAbaEpi() {
  const tabs = document.querySelector('.adm-cmp-tabs');
  if (!tabs || tabs.querySelector('[data-tab-epi-exclusivo]')) return;

  const solicitacoesBtn = tabs.querySelector('[data-tab="solicitacoes"]');
  if (!solicitacoesBtn) return;

  const epiBtn = document.createElement('button');
  epiBtn.className = 'btn btn-secondary';
  epiBtn.type = 'button';
  epiBtn.setAttribute('data-tab-epi-exclusivo', '1');
  epiBtn.textContent = 'EPI';
  solicitacoesBtn.insertAdjacentElement('afterend', epiBtn);

  epiBtn.addEventListener('click', () => {
    painelComprasClickInterno = true;
    solicitacoesBtn.click();
    painelComprasClickInterno = false;
    painelComprasTabVisual = 'epi';
    setTimeout(() => {
      atualizarTabsVisual();
      aplicarFiltroVisualCompras();
    }, 120);
  });

  tabs.querySelectorAll('[data-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (painelComprasClickInterno) return;
      painelComprasTabVisual = btn.dataset.tab || 'solicitacoes';
      setTimeout(() => {
        atualizarTabsVisual();
        aplicarFiltroVisualCompras();
      }, 120);
    });
  });
}

function iniciarAgrupamentoEpiCompras() {
  const aplicar = () => {
    try {
      instalarAbaEpi();
      atualizarTabsVisual();
      aplicarFiltroVisualCompras();
    } catch (error) {
      console.warn('[EPI compras agrupamento]', error);
    }
  };

  const observer = new MutationObserver(() => setTimeout(aplicar, 120));
  observer.observe(document.body, { childList: true, subtree: true });
  setInterval(aplicar, 2500);
  aplicar();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', iniciarAgrupamentoEpiCompras, { once: true });
} else {
  iniciarAgrupamentoEpiCompras();
}
