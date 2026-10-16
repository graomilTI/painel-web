// Frotas — aba Histórico (excessos, multas e manutenções por colaborador).
// Extraído de modules/frotas.js em 14/10/2026 (era um único bloco autoexecutável de ~4.100 linhas).
// O código das funções e constantes foi movido sem alteração. Para publicar uma mudança em qualquer
// módulo frotas-*.js deste conjunto, troque o token ?v=20261016-frotas-manut-parado1 em TODOS os imports internos (e os do
// carregador da página): o teste tests/frotas-modulos-versao.test.mjs garante que fiquem iguais.
import { currentRenderOpts, resolveSupabase, normalizeName, escapeHtml, onlyPlate, formatDateBR, parseSpeed, getStyles, normalizeDateForMatch, setCurrentRenderOpts } from './frotas-base.js?v=20261016-frotas-manut-parado1';

  const HISTORICO_TABLES = {
    excessos: 'frotas_excesso_velocidade',
    multas: 'frotas_multas',
    manutencoes: ['frotas_manutencoes', 'frotas_manutencao', 'manutencoes_frotas', 'frotas_ordens_manutencao']
  };

  const historicoState = {
    loaded: false,
    loading: false,
    error: '',
    rows: [],
    busca: '',
    tipo: 'todos',
    start: '',
    end: ''
  };

  function firstValue(obj, keys = []) {
    for (const key of keys) {
      const value = obj?.[key];
      if (value !== undefined && value !== null && String(value).trim() !== '') return value;
    }
    return '';
  }

  function formatMoneyBR(value) {
    const n = Number(String(value ?? '').replace(/[^0-9,.-]/g, '').replace('.', '').replace(',', '.'));
    if (!Number.isFinite(n) || n === 0) return '';
    return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  function getHistoricoColaborador(row, fallback = '') {
    return normalizeName(firstValue(row, [
      'colaborador', 'nome_colaborador', 'funcionario', 'funcionário', 'motorista', 'motorista_atual',
      'motorista_planilha', 'patrimonio_funcionario', 'condutor', 'nome_condutor', 'condutor_nome',
      'motorista_indicado', 'responsavel', 'responsável', 'solicitante'
    ]) || fallback || 'MOTORISTA NÃO IDENTIFICADO');
  }

  function getHistoricoDate(row, keys = []) {
    const value = firstValue(row, keys.concat(['data', 'data_evento', 'data_infracao', 'data_manutencao', 'created_at']));
    return normalizeDateForMatch(value) || '';
  }

  function normalizeHistoricoExcesso(row) {
    const motorista = getHistoricoColaborador(row);
    const data = getHistoricoDate(row, ['data_evento']);
    const velocidade = parseSpeed(row.velocidade);
    return {
      id: `excesso-${row.id || `${row.placa}-${data}-${row.hora_evento || ''}`}`,
      tipo: 'excesso',
      tipoLabel: 'Excesso de velocidade',
      colaborador: motorista,
      placa: onlyPlate(row.placa || row.patrimonio_codigo),
      data,
      hora: row.hora_evento || '',
      titulo: velocidade ? `${velocidade} km/h` : 'Excesso registrado',
      detalhes: [row.endereco, row.coordenacao, row.supervisao].filter(Boolean).join(' · '),
      status: row.status_notificacao || row.status_cruzamento || 'PENDENTE',
      valor: '',
      raw: row
    };
  }

  function normalizeHistoricoMulta(row) {
    const motorista = getHistoricoColaborador(row);
    const data = getHistoricoDate(row, ['data_infracao', 'data_multa', 'data_vencimento']);
    const valor = formatMoneyBR(firstValue(row, ['valor_original', 'valor', 'valor_multa', 'valor_atualizado']));
    return {
      id: `multa-${row.id || row.numero_auto_infracao || `${row.placa}-${data}`}`,
      tipo: 'multa',
      tipoLabel: 'Multa',
      colaborador: motorista,
      placa: onlyPlate(row.placa),
      data,
      hora: '',
      titulo: firstValue(row, ['descricao', 'descrição', 'infracao', 'infração', 'numero_auto_infracao', 'auto']) || 'Multa registrada',
      detalhes: [row.local, row.empresa, row.renavam].filter(Boolean).join(' · '),
      status: row.status_multa || row.situacao || row.status || 'A PAGAR',
      valor,
      raw: row
    };
  }

  function normalizeHistoricoManutencao(row) {
    const motorista = getHistoricoColaborador(row);
    const data = getHistoricoDate(row, ['data_manutencao', 'data_servico', 'data_abertura', 'data_conclusao']);
    const valor = formatMoneyBR(firstValue(row, ['valor', 'valor_total', 'custo', 'custo_total']));
    return {
      id: `manutencao-${row.id || `${row.placa}-${data}-${row.created_at || ''}`}`,
      tipo: 'manutencao',
      tipoLabel: 'Manutenção',
      colaborador: motorista,
      placa: onlyPlate(row.placa || row.veiculo_placa),
      data,
      hora: firstValue(row, ['hora', 'hora_servico']),
      titulo: firstValue(row, ['tipo', 'servico', 'serviço', 'descricao', 'descrição']) || 'Manutenção registrada',
      detalhes: [row.oficina, row.fornecedor, row.observacoes, row.observação, row.status].filter(Boolean).join(' · '),
      status: row.status || row.situacao || row.etapa || 'REGISTRADO',
      valor,
      raw: row
    };
  }

  async function tryLoadTableRows(supabase, tableName, select = '*') {
    try {
      const { data, error } = await supabase.from(tableName).select(select).limit(5000);
      if (error) throw error;
      return Array.isArray(data) ? data : [];
    } catch (err) {
      console.warn(`[FROTAS] Histórico: tabela ${tableName} indisponível ou sem acesso.`, err?.message || err);
      return [];
    }
  }

  function filterHistoricoRows() {
    const busca = normalizeName(historicoState.busca);
    const tipo = historicoState.tipo || 'todos';
    const start = normalizeDateForMatch(historicoState.start);
    const end = normalizeDateForMatch(historicoState.end);
    const minDate = start && end ? (start <= end ? start : end) : (start || '');
    const maxDate = start && end ? (start <= end ? end : start) : (end || '');

    return historicoState.rows.filter((row) => {
      if (tipo !== 'todos' && row.tipo !== tipo) return false;
      if (minDate && row.data && row.data < minDate) return false;
      if (maxDate && row.data && row.data > maxDate) return false;
      if (busca) {
        const haystack = normalizeName([row.colaborador, row.placa, row.tipoLabel, row.titulo, row.detalhes, row.status].join(' '));
        if (!haystack.includes(busca)) return false;
      }
      return true;
    }).sort((a, b) => String(b.data || '').localeCompare(String(a.data || '')) || String(b.hora || '').localeCompare(String(a.hora || '')));
  }

  function groupHistoricoByColaborador(rows) {
    const by = new Map();
    rows.forEach((row) => {
      const key = row.colaborador || 'MOTORISTA NÃO IDENTIFICADO';
      if (!by.has(key)) by.set(key, { colaborador: key, rows: [], placas: new Set(), multas: 0, manutencoes: 0, excessos: 0, valorMultas: 0 });
      const group = by.get(key);
      group.rows.push(row);
      if (row.placa) group.placas.add(row.placa);
      if (row.tipo === 'multa') group.multas += 1;
      if (row.tipo === 'manutencao') group.manutencoes += 1;
      if (row.tipo === 'excesso') group.excessos += 1;
      const val = Number(String(row.valor || '').replace(/[^0-9,.-]/g, '').replace('.', '').replace(',', '.'));
      if (row.tipo === 'multa' && Number.isFinite(val)) group.valorMultas += val;
    });
    return Array.from(by.values()).sort((a, b) => a.colaborador.localeCompare(b.colaborador, 'pt-BR'));
  }

  function renderHistoricoContent(root) {
    const host = root.querySelector('[data-frotas-historico-content]');
    const count = root.querySelector('[data-historico-count]');
    const kpiColabs = root.querySelector('[data-hist-kpi-colabs]');
    const kpiExcessos = root.querySelector('[data-hist-kpi-excessos]');
    const kpiMultas = root.querySelector('[data-hist-kpi-multas]');
    const kpiManut = root.querySelector('[data-hist-kpi-manut]');
    if (!host) return;

    if (historicoState.loading) {
      host.innerHTML = '<div class="speed-import-empty">Carregando histórico de frotas...</div>';
      return;
    }
    if (historicoState.error) {
      host.innerHTML = `<div class="speed-import-empty">${escapeHtml(historicoState.error)}</div>`;
      return;
    }

    const rows = filterHistoricoRows();
    const groups = groupHistoricoByColaborador(rows);
    if (count) count.textContent = `${groups.length} colaborador(es) · ${rows.length} registro(s)`;
    if (kpiColabs) kpiColabs.textContent = groups.length;
    if (kpiExcessos) kpiExcessos.textContent = rows.filter((r) => r.tipo === 'excesso').length;
    if (kpiMultas) kpiMultas.textContent = rows.filter((r) => r.tipo === 'multa').length;
    if (kpiManut) kpiManut.textContent = rows.filter((r) => r.tipo === 'manutencao').length;

    if (!rows.length) {
      host.innerHTML = '<div class="speed-import-empty">Nenhum registro encontrado para os filtros selecionados.</div>';
      return;
    }

    host.innerHTML = groups.map((group) => {
      const rowsHtml = group.rows.slice(0, 80).map((row) => `
        <tr>
          <td>${escapeHtml(formatDateBR(row.data) || '—')}${row.hora ? `<br><small>${escapeHtml(row.hora)}</small>` : ''}</td>
          <td><span class="hist-badge ${escapeHtml(row.tipo)}">${escapeHtml(row.tipoLabel)}</span></td>
          <td><strong>${escapeHtml(row.placa || '—')}</strong></td>
          <td>${escapeHtml(row.titulo || '—')}${row.detalhes ? `<br><small>${escapeHtml(row.detalhes)}</small>` : ''}</td>
          <td>${escapeHtml(row.status || '—')}</td>
          <td>${escapeHtml(row.valor || '')}</td>
        </tr>`).join('');
      const hidden = group.rows.length > 80 ? `<p class="speed-hint">Mostrando os 80 registros mais recentes deste colaborador.</p>` : '';
      return `
        <article class="hist-card">
          <div class="hist-card-head">
            <div><h3>${escapeHtml(group.colaborador)}</h3><p>${escapeHtml(Array.from(group.placas).join(', ') || 'Sem placa vinculada')}</p></div>
            <div class="hist-mini-kpis"><span>${group.excessos} excesso(s)</span><span>${group.multas} multa(s)</span><span>${group.manutencoes} manutenção(ões)</span></div>
          </div>
          <div class="hist-table-wrap"><table class="hist-table"><thead><tr><th>Data</th><th>Tipo</th><th>Placa</th><th>Registro</th><th>Status</th><th>Valor</th></tr></thead><tbody>${rowsHtml}</tbody></table></div>${hidden}
        </article>`;
    }).join('');
  }

  async function loadHistoricoFrotas(root, opts = {}) {
    const supabase = resolveSupabase(opts);
    if (!supabase || typeof supabase.from !== 'function') {
      historicoState.error = 'Supabase não encontrado para carregar o histórico.';
      historicoState.loaded = true;
      renderHistoricoContent(root);
      return;
    }
    historicoState.loading = true;
    historicoState.error = '';
    renderHistoricoContent(root);
    try {
      const [excessos, multas] = await Promise.all([
        tryLoadTableRows(supabase, HISTORICO_TABLES.excessos, 'id,data_evento,hora_evento,placa,velocidade,endereco,motorista_planilha,patrimonio_funcionario,patrimonio_codigo,coordenacao,supervisao,status_cruzamento,status_notificacao,created_at'),
        tryLoadTableRows(supabase, HISTORICO_TABLES.multas, '*')
      ]);

      let manutencoes = [];
      for (const table of HISTORICO_TABLES.manutencoes) {
        manutencoes = await tryLoadTableRows(supabase, table, '*');
        if (manutencoes.length) break;
      }

      historicoState.rows = [
        ...excessos.map(normalizeHistoricoExcesso),
        ...multas.map(normalizeHistoricoMulta),
        ...manutencoes.map(normalizeHistoricoManutencao)
      ].filter((row) => row.colaborador || row.placa || row.titulo);
      historicoState.loaded = true;
    } catch (err) {
      console.warn('[FROTAS] Falha ao carregar histórico:', err);
      historicoState.error = err.message || 'Não foi possível carregar o histórico.';
    } finally {
      historicoState.loading = false;
      renderHistoricoContent(root);
    }
  }

  function renderHistoricoFrotas(container, opts = {}) {
    setCurrentRenderOpts(opts || {});
    container.innerHTML = `${getStyles()}
      <section class="frotas-shell">
        <div class="frotas-header"><div><div class="frotas-kicker">Frotas · Histórico</div><h1 class="frotas-title">Histórico do Colaborador</h1><p class="frotas-subtitle">Agrupa automaticamente multas, manutenções e excessos de velocidade pelo colaborador atualmente registrado em cada ocorrência. Se o ADM alterar o colaborador em uma multa, manutenção ou excesso, o histórico passa a aparecer no novo colaborador no próximo carregamento.</p></div></div>
        <div class="frotas-card">
          <div class="frotas-body">
            <div class="hist-toolbar">
              <input class="speed-input" data-historico-search placeholder="Buscar por colaborador, placa, tipo, status...">
              <select class="speed-select" data-historico-tipo><option value="todos">Todos os tipos</option><option value="excesso">Excessos</option><option value="multa">Multas</option><option value="manutencao">Manutenções</option></select>
              <input class="speed-input" type="date" data-historico-start>
              <input class="speed-input" type="date" data-historico-end>
              <button class="speed-btn speed-btn-soft speed-btn-compact" type="button" data-historico-refresh>↻ Atualizar</button>
            </div>
            <div class="hist-kpi-grid"><div class="hist-kpi"><span>Colaboradores</span><strong data-hist-kpi-colabs>0</strong></div><div class="hist-kpi"><span>Excessos</span><strong data-hist-kpi-excessos>0</strong></div><div class="hist-kpi"><span>Multas</span><strong data-hist-kpi-multas>0</strong></div><div class="hist-kpi"><span>Manutenções</span><strong data-hist-kpi-manut>0</strong></div></div>
            <p class="speed-hint" data-historico-count>Carregando histórico...</p>
            <div class="hist-list" data-frotas-historico-content></div>
          </div>
        </div>
      </section>`;

    container.querySelector('[data-historico-refresh]')?.addEventListener('click', () => loadHistoricoFrotas(container, opts));
    container.querySelector('[data-historico-search]')?.addEventListener('input', (ev) => { historicoState.busca = ev.target.value; renderHistoricoContent(container); });
    container.querySelector('[data-historico-tipo]')?.addEventListener('change', (ev) => { historicoState.tipo = ev.target.value; renderHistoricoContent(container); });
    container.querySelector('[data-historico-start]')?.addEventListener('change', (ev) => { historicoState.start = ev.target.value; renderHistoricoContent(container); });
    container.querySelector('[data-historico-end]')?.addEventListener('change', (ev) => { historicoState.end = ev.target.value; renderHistoricoContent(container); });

    renderHistoricoContent(container);
    loadHistoricoFrotas(container, opts);
  }

export { renderHistoricoFrotas };
