// Financeiro — aba Fluxo de Caixa (lista, detalhes do dia), importação de planilhas e ajustes de saldo.
// Extraído de assets/js/financeiro.js (renderContent) em 15/10/2026. Cada fábrica criarX(ctx) recebe o contexto da tela
// ({ content, userContext } + funções das fábricas anteriores) e devolve as funções que as outras partes usam. O código
// das funções e constantes foi movido sem alteração. Para publicar uma mudança em qualquer módulo de
// assets/js/modules/financeiro/, troque o token ?v=20261030-fin18 em TODOS os imports internos e nos carregadores
// (assets/js/financeiro.js, financeiro.html): tests/financeiro-modulos-versao.test.mjs garante que fiquem iguais.
import { supabase } from '../../supabaseClient.js';
import { state, esc, money, brDate, dateRangeLabel } from './util.js?v=20261030-fin18';
import { readWorkbookRows } from './planilhas.js?v=20261030-fin18';
import { statusClass } from './pagamentos.js?v=20261030-fin18';
import { upsertChunk, mapReceber, mapPagar } from './contas.js?v=20261030-fin18';

function criarFluxo(ctx) {
  const { userContext, setFeedback, mostrarFluxoDetalhes, setTab } = ctx;

  async function loadFluxo() {
    const { data, error } = await supabase
      .from('financeiro_fluxo_caixa_diario')
      .select('*')
      .gte('data', state.filters.inicio)
      .lte('data', state.filters.fim)
      .order('data', { ascending: true });

    if (error) {
      document.getElementById('fluxoTbody').innerHTML = `<tr><td colspan="8" class="fm-empty">${esc(error.message)}<br>Execute a migration do módulo financeiro no Supabase.</td></tr>`;
      return;
    }
    state.fluxo = data || [];
    renderFluxo();
    updateKpis();
  }

  async function loadDetalhes(date) {
    state.currentDate = date;
    document.getElementById('detalhesData').textContent = `Data: ${brDate(date)}`;
    const [receberRes, pagarRes, saldoRes, provisaoRes] = await Promise.all([
      supabase.from('financeiro_contas_receber').select('*').eq('vencimento', date).order('cliente'),
      supabase.from('financeiro_contas_pagar').select('*').eq('vencimento', date).order('favorecido'),
      supabase.from('financeiro_saldos_dia').select('*').eq('data', date).maybeSingle(),
      supabase.from('financeiro_provisoes').select('*').eq('data', date).maybeSingle()
    ]);
    state.receber = receberRes.data || [];
    state.pagar = pagarRes.data || [];
    document.getElementById('cfgData').value = date;
    document.getElementById('cfgSaldo').value = saldoRes.data?.saldo_dia ?? '';
    document.getElementById('cfgObs').value = saldoRes.data?.observacoes || provisaoRes.data?.observacoes || '';
    document.getElementById('cfgProvAuto').value = provisaoRes.data?.valor_automatico ?? '';
    document.getElementById('cfgProvManual').value = provisaoRes.data?.ajuste_manual ?? '';
    renderDetalhes();
    setTab('fluxo');
    mostrarFluxoDetalhes();
  }

  function updateKpis() {
    const total = state.fluxo.reduce((acc, row) => {
      acc.saldo += Number(row.saldo_dia || 0);
      acc.receber += Number(row.contas_receber || 0);
      acc.pagar += Number(row.contas_pagar || 0);
      acc.provisao += Number(row.provisoes_dia || 0);
      acc.projetado += Number(row.saldo_projetado || 0);
      return acc;
    }, { saldo: 0, receber: 0, pagar: 0, provisao: 0, projetado: 0 });
    const hasAttention = state.fluxo.some((row) => statusClass(row.status) === 'danger') || total.projetado < 0;
    document.getElementById('kpiSaldo').textContent = money(total.saldo);
    document.getElementById('kpiReceber').textContent = money(total.receber);
    document.getElementById('kpiPagar').textContent = money(total.pagar);
    document.getElementById('kpiProvisao').textContent = money(total.provisao);
    document.getElementById('kpiProjetado').textContent = money(total.projetado);
    // Status do saldo projetado no próprio card (cor + rótulo).
    const cardProjetado = document.getElementById('kpiProjetado')?.closest('.fm-kcard');
    if (cardProjetado) {
      cardProjetado.classList.toggle('tone-red', hasAttention);
      cardProjetado.classList.toggle('tone-purple', !hasAttention);
      const statusTxt = state.fluxo.length ? (hasAttention ? 'ATENÇÃO' : 'OK') : '';
      const rotulo = cardProjetado.querySelector('.fm-kcard-tx > span');
      if (rotulo) rotulo.textContent = statusTxt ? `Saldo projetado · ${statusTxt}` : 'Saldo projetado';
    }
    const miniEl = document.getElementById('cfFlowMini');
    if (miniEl && state.fluxo.length) {
      miniEl.style.display = '';
      const liquido = total.receber - total.pagar;
      document.getElementById('cfFmLiquido').textContent = money(liquido);
      const sumBar = total.receber + total.pagar;
      const recvPct = sumBar > 0 ? Math.round((total.receber / sumBar) * 100) : 50;
      const payPct = 100 - recvPct;
      document.getElementById('cfBarRecv').style.width = recvPct + '%';
      document.getElementById('cfBarPay').style.width = payPct + '%';
    }
  }

  function renderFluxo() {
    const tbody = document.getElementById('fluxoTbody');
    if (!state.fluxo.length) {
      tbody.innerHTML = `<tr><td colspan="8" class="fm-empty">Nenhum dia encontrado no período.</td></tr>`;
      return;
    }
    tbody.innerHTML = state.fluxo.map((row) => `
      <tr>
        <td><strong>${brDate(row.data)}</strong></td>
        <td>${money(row.saldo_dia)}</td>
        <td>${money(row.contas_receber)}</td>
        <td>${money(row.contas_pagar)}</td>
        <td>${money(row.provisoes_dia)}</td>
        <td><strong>${money(row.saldo_projetado)}</strong></td>
        <td><span class="fm-badge ${statusClass(row.status) === 'danger' ? 'err' : 'ok'}">${esc(row.status || 'OK')}</span></td>
        <td><button class="btn btn-secondary fin-small" data-detail-date="${esc(row.data)}" type="button">Detalhes</button></td>
      </tr>
    `).join('');
  }

  function renderDetalhes() {
    const tbody = document.getElementById('detalhesTbody');
    let rows = [
      ...state.receber.map((r) => ({ tipo: 'Receber', situacao: r.situacao, nome: r.cliente, doc: r.fatura || r.numero_nf || r.codigo, valor: Number(r.valor || 0) - Number(r.valor_pago || 0), vencimento: r.vencimento })),
      ...state.pagar.map((r) => ({ tipo: 'Pagar', situacao: r.situacao, nome: r.favorecido, doc: r.doc || r.cod_grupo || r.parcela, valor: Number(r.valor || 0) - Number(r.valor_pago || 0), vencimento: r.vencimento }))
    ];

    const { tipo, situacao, favorecido, doc } = state.detFilter;
    if (tipo) rows = rows.filter((r) => r.tipo === tipo);
    if (situacao) rows = rows.filter((r) => (r.situacao || '').toLowerCase() === situacao.toLowerCase());
    if (favorecido) rows = rows.filter((r) => (r.nome || '').toLowerCase().includes(favorecido.toLowerCase()));
    if (doc) rows = rows.filter((r) => (r.doc || '').toLowerCase().includes(doc.toLowerCase()));

    const { col, dir } = state.detSort;
    if (col) {
      rows = [...rows].sort((a, b) => {
        const av = col === 'valor' ? a[col] : (a[col] || '');
        const bv = col === 'valor' ? b[col] : (b[col] || '');
        return col === 'valor' ? (av - bv) * dir : String(av).localeCompare(String(bv)) * dir;
      });
    }

    document.querySelectorAll('.det-th-sort').forEach((th) => {
      const c = th.dataset.detSort;
      const icon = th.querySelector('.det-sort-icon');
      if (icon) icon.textContent = c === col ? (dir === 1 ? '▲' : '▼') : '↕';
      th.classList.toggle('det-th-active', c === col);
    });

    if (!rows.length) {
      tbody.innerHTML = `<tr><td colspan="6" class="fm-empty">Nenhum lançamento encontrado.</td></tr>`;
      return;
    }
    tbody.innerHTML = rows.map((r) => `
      <tr><td>${esc(r.tipo)}</td><td>${esc(r.situacao || '-')}</td><td><strong>${esc(r.nome || '-')}</strong></td><td>${esc(r.doc || '-')}</td><td>${money(r.valor)}</td><td>${brDate(r.vencimento)}</td></tr>
    `).join('');
  }

  async function importFile(kind) {
    const input = document.getElementById(kind === 'receber' ? 'fileReceber' : 'filePagar');
    const fb = kind === 'receber' ? 'fbReceber' : 'fbPagar';
    const file = input.files?.[0];
    if (!file) return setFeedback(fb, 'Selecione uma planilha primeiro.', 'err');
    try {
      setFeedback(fb, 'Lendo planilha...');
      const rows = await readWorkbookRows(file);
      const mapped = kind === 'receber' ? mapReceber(rows, file.name) : mapPagar(rows, file.name);
      if (!mapped.length) throw new Error('Nenhuma linha válida encontrada. Confira os cabeçalhos e as datas.');
      setFeedback(fb, `Importando ${mapped.length} linhas...`);
      const table = kind === 'receber' ? 'financeiro_contas_receber' : 'financeiro_contas_pagar';
      const saved = await upsertChunk(table, mapped);
      setFeedback(fb, `${saved} registros atualizados sem duplicar.`, 'ok');
      await loadFluxo();
    } catch (err) {
      setFeedback(fb, err.message || 'Erro ao importar.', 'err');
    }
  }

  async function saveConfig(event) {
    event.preventDefault();
    const date = document.getElementById('cfgData').value;
    const saldo = Number(document.getElementById('cfgSaldo').value || 0);
    const provAuto = Number(document.getElementById('cfgProvAuto').value || 0);
    const provManual = Number(document.getElementById('cfgProvManual').value || 0);
    const obs = document.getElementById('cfgObs').value.trim() || null;
    const responsavel = userContext?.user?.name || userContext?.user?.email || userContext?.email || null;
    try {
      setFeedback('fbConfig', 'Salvando...');
      const saldoRes = await supabase.from('financeiro_saldos_dia').upsert({ data: date, saldo_dia: saldo, observacoes: obs, responsavel }, { onConflict: 'data' });
      if (saldoRes.error) throw saldoRes.error;
      const provRes = await supabase.from('financeiro_provisoes').upsert({ data: date, descricao: 'Provisão do dia', valor_automatico: provAuto, ajuste_manual: provManual, observacoes: obs, responsavel }, { onConflict: 'data' });
      if (provRes.error) throw provRes.error;
      setFeedback('fbConfig', 'Ajustes salvos.', 'ok');
      await loadFluxo();
    } catch (err) {
      setFeedback('fbConfig', err.message || 'Erro ao salvar.', 'err');
    }
  }

  return { loadFluxo, loadDetalhes, renderDetalhes, importFile, saveConfig };
}

export { criarFluxo };
