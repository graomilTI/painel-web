// Financeiro — aba Despesas: adiantamentos (solicitações, histórico, recusa e pagamento).
// Extraído de assets/js/financeiro.js (renderContent) em 15/10/2026. Cada fábrica criarX(ctx) recebe o contexto da tela
// ({ content, userContext } + funções das fábricas anteriores) e devolve as funções que as outras partes usam. O código
// das funções e constantes foi movido sem alteração. Para publicar uma mudança em qualquer módulo de
// assets/js/modules/financeiro/, troque o token ?v=20261030-fin10 em TODOS os imports internos e nos carregadores
// (assets/js/financeiro.js, financeiro.html): tests/financeiro-modulos-versao.test.mjs garante que fiquem iguais.
import { supabase } from '../../supabaseClient.js';
import { state, esc, normalize, money, brDate, onlyDigits, compactDate, formatDateForXlsx, roundNumber } from './util.js?v=20261030-fin10';
import { obterModal, htmlModal, abrirModal } from './modal.js?v=20261030-fin10';
import { worksheetFromObjects, downloadWorkbook, downloadCsv } from './planilhas.js?v=20261030-fin10';
import { makePaymentHash, buildPaymentOutputs, fetchAlreadyPaidMap } from './pagamentos.js?v=20261030-fin10';

function criarAdiantamentos(ctx) {
  const { userContext, paySetFeedback, salvarResumoNotasFiscais } = ctx;

  // ── Adiantamentos (sincronizado do GRM pelo agente sync-adiantamentos) ────
  // Fonte: grm_adiantamentos_importacoes (espelho GRM) + financeiro_adiantamentos_decisoes
  // (decisão local ✓/✗, não altera nada no GRM). Merge feito aqui no cliente por ofr_code.
  async function carregarAdiantamentos() {
    paySetFeedback('fbAdiantamentos', 'Carregando solicitações...');
    try {
      const [{ data: importadas, error: e1 }, { data: decisoes, error: e2 }] = await Promise.all([
        supabase.from('grm_adiantamentos_importacoes')
          .select('ofr_code,data_solicitacao,data_registro,colaborador,cpf,coordenacao,supervisao,conta,valor,saldo,embarque,leitura_mais_antiga,descricao,pendente_no_grm,saiu_pendente_em')
          .order('data_registro', { ascending: false })
          .limit(500),
        supabase.from('financeiro_adiantamentos_decisoes')
          .select('ofr_code,status,motivo_recusa,decidido_por,decidido_em,execucao_id,pago_em')
      ]);
      if (e1) throw e1;
      if (e2) throw e2;

      const decisaoMap = new Map((decisoes || []).map((d) => [d.ofr_code, d]));
      state.adiantamentosRows = (importadas || []).map((row) => ({ ...row, decisao: decisaoMap.get(row.ofr_code) || null }));
      renderAdiantamentosTable();
      paySetFeedback('fbAdiantamentos', `${state.adiantamentosRows.length} solicitação(ões) carregada(s).`, 'ok');
    } catch (err) {
      console.error(err);
      paySetFeedback('fbAdiantamentos', err.message || 'Erro ao carregar adiantamentos.', 'err');
    }
  }

  function adiantAcaoHtml(row) {
    const st = row.decisao?.status || 'pendente';
    if (st === 'pago') return `<span class="pay-status-paid">PAGO</span>`;
    const motivoAttr = row.decisao?.motivo_recusa ? ` title="${esc(row.decisao.motivo_recusa)}"` : '';
    return `
      <div class="pay-status-toggle" role="group" aria-label="Ação para ${esc(row.colaborador || 'colaborador')}">
        <button class="pay-status-btn ${st === 'ok' ? 'active-ok' : 'is-inactive'}" type="button" data-adiant-ok="${row.ofr_code}">✓</button>
        <button class="pay-status-btn ${st === 'recusado' ? 'active-pendente' : 'is-inactive'}"${motivoAttr} type="button" data-adiant-recusar="${row.ofr_code}">✗</button>
      </div>`;
  }

  function setAdiantTab(tab) {
    document.querySelectorAll('.adiant-subtab').forEach((btn) => btn.classList.toggle('active', btn.dataset.adiantTab === tab));
    document.querySelectorAll('.adiant-table').forEach((panel) => panel.classList.remove('active'));
    document.getElementById(`adiant-${tab}`)?.classList.add('active');
  }

  function renderAdiantamentosTable() {
    const rows = state.adiantamentosRows || [];
    // Sai da lista de Solicitações (e vai pro Histórico automaticamente) tanto quem já foi
    // pago/recusado pelo financeiro quanto quem deixou de aparecer como pendente no GRM
    // (resolvido/baixado direto por lá, fora do fluxo do painel).
    const ativos = rows.filter((r) => r.pendente_no_grm !== false && !['pago', 'recusado'].includes(r.decisao?.status));
    const historico = rows.filter((r) => r.pendente_no_grm === false || ['pago', 'recusado'].includes(r.decisao?.status))
      .sort((a, b) => String(b.decisao?.decidido_em || b.saiu_pendente_em || '').localeCompare(String(a.decisao?.decidido_em || a.saiu_pendente_em || '')));

    const { col: sortCol, dir: sortDir } = state.adiantSort;
    if (sortCol) {
      const numericCols = ['valor', 'saldo'];
      ativos.sort((a, b) => {
        if (numericCols.includes(sortCol)) return ((Number(a[sortCol]) || 0) - (Number(b[sortCol]) || 0)) * sortDir;
        return String(a[sortCol] || '').localeCompare(String(b[sortCol] || ''), 'pt-BR') * sortDir;
      });
    }
    document.querySelectorAll('.adiant-th-sort').forEach((th) => {
      const c = th.dataset.adiantSort;
      const icon = th.querySelector('.adiant-sort-icon');
      if (icon) icon.textContent = c === sortCol ? (sortDir === 1 ? '▲' : '▼') : '↕';
      th.classList.toggle('adiant-th-active', c === sortCol);
    });

    const tbody = document.getElementById('adiantTbody');
    if (tbody) {
      tbody.innerHTML = ativos.length ? ativos.map((row) => `
        <tr>
          <td>${brDate(row.data_solicitacao)}</td>
          <td><strong>${esc(row.colaborador || '-')}</strong></td>
          <td>${esc(row.coordenacao || '-')}</td>
          <td>${esc(row.supervisao || '-')}</td>
          <td>${money(row.valor)}</td>
          <td>${money(row.saldo)}</td>
          <td>${row.embarque ? brDate(row.embarque) : '-'}</td>
          <td>${row.leitura_mais_antiga ? brDate(row.leitura_mais_antiga) : '-'}</td>
          <td>${esc(row.descricao || '-')}</td>
          <td>${adiantAcaoHtml(row)}</td>
        </tr>
      `).join('') : '<tr><td colspan="10" class="fm-empty">Nenhuma solicitação pendente.</td></tr>';

      tbody.querySelectorAll('[data-adiant-ok]').forEach((btn) => btn.addEventListener('click', () => decidirAdiantamentoOk(Number(btn.dataset.adiantOk))));
      tbody.querySelectorAll('[data-adiant-recusar]').forEach((btn) => btn.addEventListener('click', () => abrirModalRecusaAdiantamento(Number(btn.dataset.adiantRecusar))));
    }

    state.adiantamentosHistorico = historico;
    renderHistoricoAgrupado(historico);

    const pendentes = ativos.filter((r) => (r.decisao?.status || 'pendente') === 'pendente').length;
    const selecionados = ativos.filter((r) => r.decisao?.status === 'ok');
    const recusados = historico.filter((r) => r.decisao?.status === 'recusado').length;
    const totalSelecionado = selecionados.reduce((sum, r) => sum + Number(r.valor || 0), 0);

    if (document.getElementById('adiantPendentes')) document.getElementById('adiantPendentes').textContent = String(pendentes);
    if (document.getElementById('adiantSelecionados')) document.getElementById('adiantSelecionados').textContent = String(selecionados.length);
    if (document.getElementById('adiantTotalSelecionado')) document.getElementById('adiantTotalSelecionado').textContent = money(totalSelecionado);
    if (document.getElementById('adiantRecusados')) document.getElementById('adiantRecusados').textContent = String(recusados);
    if (document.getElementById('adiantFooterTotal')) document.getElementById('adiantFooterTotal').textContent = `Total pronto para pagar: ${money(totalSelecionado)}`;
    if (document.getElementById('adiantFooterHint')) document.getElementById('adiantFooterHint').textContent = `${selecionados.length} selecionado(s) · ${pendentes} pendente(s) · ${recusados} recusado(s)`;
    if (document.getElementById('btnPagarAdiantamentos')) document.getElementById('btnPagarAdiantamentos').disabled = selecionados.length === 0;
  }

  const HIST_DOW_LABELS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

  const HIST_MES_LABELS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

  function moneyCompact(v) {
    return Number(v || 0).toLocaleString('pt-BR', { maximumFractionDigits: 0 });
  }

  function calendarioMesHtml(mesKey, diasMap) {
    const [ano, mes] = mesKey.split('-').map(Number);
    const diasNoMes = new Date(ano, mes, 0).getDate();
    const offset = new Date(ano, mes - 1, 1).getDay();

    const celulas = [];
    for (let i = 0; i < offset; i++) celulas.push('<div class="hist-cal-day blank"></div>');
    for (let d = 1; d <= diasNoMes; d++) {
      const iso = `${ano}-${String(mes).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const info = diasMap.get(iso);
      if (!info || (!info.pago && !info.recusado && !info.removido)) {
        celulas.push(`<div class="hist-cal-day"><span class="d">${d}</span></div>`);
        continue;
      }
      let cls, valor, titulo;
      if (info.pago > 0) { cls = 'paid'; valor = info.pago; titulo = money(valor); }
      else if (info.recusado > 0) { cls = 'recusado'; valor = info.recusado; titulo = money(valor); }
      else { cls = 'removido'; valor = info.removido; titulo = `${money(valor)} · saiu do GRM sem decisão do financeiro`; }
      celulas.push(`<div class="hist-cal-day ${cls}" title="${esc(titulo)}"><span class="d">${d}</span><span class="v">${moneyCompact(valor)}</span></div>`);
    }

    return `
      <div class="hist-cal">
        <div class="hist-cal-title">${HIST_MES_LABELS[mes - 1]}/${ano}</div>
        <div class="hist-cal-grid">
          ${HIST_DOW_LABELS.map((l) => `<div class="hist-cal-dow">${l}</div>`).join('')}
          ${celulas.join('')}
        </div>
      </div>`;
  }

  function renderHistoricoAgrupado(historico) {
    const container = document.getElementById('adiantHistoricoContent');
    if (!container) return;
    if (!historico.length) {
      container.innerHTML = '<div class="fm-empty">Nenhum pagamento registrado ainda.</div>';
      return;
    }

    const termo = normalize(document.getElementById('histColaboradorFiltro')?.value || '');
    const grupos = new Map();
    historico.forEach((row) => {
      const key = row.cpf || row.colaborador || '-';
      if (!grupos.has(key)) grupos.set(key, { nome: row.colaborador || '-', totalPago: 0, totalRecusado: 0, totalRemovido: 0, dias: new Map() });
      const g = grupos.get(key);
      const status = row.decisao?.status;
      // Saiu da lista de pendentes do GRM sem o financeiro ter marcado ✓/✗ aqui.
      const removidoSemDecisao = row.pendente_no_grm === false && !['pago', 'recusado'].includes(status);
      const valor = Number(row.valor || 0);
      const dia = String(row.decisao?.decidido_em || row.saiu_pendente_em || row.data_solicitacao || '').slice(0, 10);
      if (status === 'pago') g.totalPago += valor;
      else if (status === 'recusado') g.totalRecusado += valor;
      else if (removidoSemDecisao) g.totalRemovido += valor;
      if (dia) {
        const atual = g.dias.get(dia) || { pago: 0, recusado: 0, removido: 0 };
        if (status === 'pago') atual.pago += valor;
        else if (status === 'recusado') atual.recusado += valor;
        else if (removidoSemDecisao) atual.removido += valor;
        g.dias.set(dia, atual);
      }
    });

    let lista = Array.from(grupos.values()).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    if (termo) lista = lista.filter((g) => normalize(g.nome).includes(termo));

    if (!lista.length) {
      container.innerHTML = '<div class="fm-empty">Nenhum colaborador encontrado nesse filtro.</div>';
      return;
    }

    container.innerHTML = lista.map((g) => {
      const diasPagos = Array.from(g.dias.values()).filter((d) => d.pago > 0).length;
      const diasRecusados = Array.from(g.dias.values()).filter((d) => d.recusado > 0).length;
      const diasRemovidos = Array.from(g.dias.values()).filter((d) => d.removido > 0).length;
      const meses = new Set(Array.from(g.dias.keys()).map((dia) => dia.slice(0, 7)));
      const calendariosHtml = Array.from(meses).sort().map((mesKey) => calendarioMesHtml(mesKey, g.dias)).join('');

      return `
        <div class="hist-colab-card">
          <div class="hist-colab-head" data-hist-toggle>
            <div class="hist-colab-name"><span class="hist-colab-toggle">▸</span>${esc(g.nome)}</div>
            <div class="hist-colab-meta">
              <div><span>Total recebido</span><strong style="color:#86efac">${money(g.totalPago)}</strong></div>
              <div><span>Dias pagos</span><strong>${diasPagos}</strong></div>
              <div><span>Total recusado</span><strong style="color:#fca5a5">${money(g.totalRecusado)}</strong></div>
              <div><span>Dias recusados</span><strong>${diasRecusados}</strong></div>
              <div><span>Saiu do GRM sem decisão</span><strong style="color:#cbd5e1">${diasRemovidos}</strong></div>
            </div>
          </div>
          <div class="hist-cal-row">${calendariosHtml}</div>
        </div>`;
    }).join('');

    container.querySelectorAll('[data-hist-toggle]').forEach((head) => {
      head.addEventListener('click', () => head.closest('.hist-colab-card')?.classList.toggle('expanded'));
    });
  }

  async function decidirAdiantamentoOk(ofrCode) {
    const row = (state.adiantamentosRows || []).find((r) => r.ofr_code === ofrCode);
    if (!row || ['pago','recusado'].includes(row.decisao?.status)) return;
    const novoStatus = row.decisao?.status === 'ok' ? 'pendente' : 'ok';
    const payload = {
      ofr_code: ofrCode,
      status: novoStatus,
      motivo_recusa: null,
      decidido_por: userContext?.user?.name || userContext?.user?.email || null,
      decidido_em: new Date().toISOString()
    };
    const { error } = await supabase.from('financeiro_adiantamentos_decisoes').upsert(payload, { onConflict: 'ofr_code' });
    if (error) { paySetFeedback('fbAdiantamentos', error.message, 'err'); return; }
    row.decisao = { ...row.decisao, ...payload };
    renderAdiantamentosTable();
  }

  function abrirModalRecusaAdiantamento(ofrCode) {
    const row = (state.adiantamentosRows || []).find((r) => r.ofr_code === ofrCode);
    if (!row || ['pago','recusado'].includes(row.decisao?.status)) return;
    const modal = obterModal('adiantRecusaModal');
    modal.innerHTML = htmlModal({
      titulo: 'Recusar adiantamento',
      subtitulo: 'Informe o motivo da recusa. Fica registrado no histórico.',
      idFechar: 'adiantRecusaClose',
      corpo: `
      <div class="pay-summary">
        <div class="pay-mini"><span>Colaborador</span><strong>${esc(row.colaborador || '-')}</strong></div>
        <div class="pay-mini"><span>Valor</span><strong>${money(row.valor)}</strong></div>
      </div>
      <div class="fin-field full">
        <label>Motivo da recusa <span class="fin-obrigatorio">*</span></label>
        <textarea id="adiantRecusaMotivo" class="fm-input" rows="4" placeholder="Descreva o motivo para recusar esta solicitação...">${esc(row.decisao?.motivo_recusa || '')}</textarea>
      </div>`,
      rodape: `<span id="adiantRecusaFeedback" class="fin-feedback"></span><button class="fm-btn fin-btn-recusar" id="adiantRecusaConfirm" type="button">CONFIRMAR RECUSA</button>`,
    });
    abrirModal(modal, 'adiantRecusaClose');
    modal.querySelector('#adiantRecusaConfirm').onclick = () => confirmarRecusaAdiantamento(ofrCode, modal);
  }

  async function confirmarRecusaAdiantamento(ofrCode, modal) {
    const motivoEl = modal.querySelector('#adiantRecusaMotivo');
    const fb = modal.querySelector('#adiantRecusaFeedback');
    const motivo = (motivoEl?.value || '').trim();
    if (!motivo) {
      if (fb) { fb.textContent = 'Informe o motivo da recusa.'; fb.className = 'fin-feedback err'; }
      motivoEl?.focus();
      return;
    }
    const btn = modal.querySelector('#adiantRecusaConfirm');
    if (btn) { btn.disabled = true; btn.textContent = 'Recusando...'; }
    try {
      const payload = {
        ofr_code: ofrCode,
        status: 'recusado',
        motivo_recusa: motivo,
        decidido_por: userContext?.user?.name || userContext?.user?.email || null,
        decidido_em: new Date().toISOString()
      };
      const { error } = await supabase.from('financeiro_adiantamentos_decisoes').upsert(payload, { onConflict: 'ofr_code' });
      if (error) throw error;
      const row = (state.adiantamentosRows || []).find((r) => r.ofr_code === ofrCode);
      if (row) row.decisao = { ...row.decisao, ...payload };
      modal.classList.remove('open');
      renderAdiantamentosTable();
    } catch (err) {
      if (fb) { fb.textContent = `Erro: ${err.message}`; fb.className = 'fin-feedback err'; }
      if (btn) { btn.disabled = false; btn.textContent = 'CONFIRMAR RECUSA'; }
    }
  }

  // PAGAR (Adiantamentos): por enquanto gera os arquivos de upload em conta bancária
  // (mesmo modelo Flash/iFood/Alelo já usado em Diárias e Almoço) e registra a execução
  // para conferência/dedup — não chama a Edge Function de pagamento automático ainda.
  async function pagarAdiantamentos() {
    const selecionados = (state.adiantamentosRows || []).filter((r) => r.decisao?.status === 'ok');
    if (!selecionados.length) return paySetFeedback('fbAdiantamentos', 'Marque ✓ em pelo menos uma solicitação antes de pagar.', 'err');

    const conferenciaRows = selecionados.map((row) => {
      const contaNorm = normalize(row.conta);
      const destino = contaNorm.includes('ifood') ? 'iFood' : contaNorm.includes('flash') ? 'Flash' : contaNorm.includes('alelo') ? 'Alelo' : 'Pendente';
      const conf = {
        data: row.data_solicitacao,
        funcionario: row.colaborador,
        cpf: onlyDigits(row.cpf),
        destino,
        tipo: 'Adiantamento',
        valor: roundNumber(row.valor),
        composicao: row.descricao || 'Adiantamento',
        coordenacao: row.coordenacao,
        supervisao: row.supervisao,
        banco: row.conta,
        observacao: 'OK'
      };
      return { ...conf, unique_hash: makePaymentHash(conf), _ofr_code: row.ofr_code };
    });

    const pagaveis = conferenciaRows.filter((row) => row.destino !== 'Pendente');
    const semDestino = conferenciaRows.filter((row) => row.destino === 'Pendente');
    if (!pagaveis.length) return paySetFeedback('fbAdiantamentos', 'Nenhuma linha selecionada tem Conta reconhecida (Flash/iFood/Alelo).', 'err');

    const btn = document.getElementById('btnPagarAdiantamentos');
    try {
      if (btn) btn.disabled = true;
      paySetFeedback('fbAdiantamentos', 'Conferindo duplicidades e gerando arquivos de pagamento...');

      const paid = await fetchAlreadyPaidMap(pagaveis.map((r) => r.unique_hash));
      const elegiveis = pagaveis.filter((r) => !paid.has(r.unique_hash));
      const jaPagos = pagaveis.filter((r) => paid.has(r.unique_hash));

      if (elegiveis.length) {
        const outputs = buildPaymentOutputs(elegiveis.map((r) => ({ ...r, status_pagamento: 'OK' })));
        const periodo = new Date().toISOString().slice(0, 10);
        const total = elegiveis.reduce((sum, r) => sum + Number(r.valor || 0), 0);

        const { data: execucao, error: execError } = await supabase.from('financeiro_pagamentos_execucoes').insert({
          tipo: 'Adiantamentos',
          periodo,
          status: 'PAGO',
          total_valor: roundNumber(total),
          total_linhas: elegiveis.length,
          responsavel: userContext?.user?.name || userContext?.user?.email || null
        }).select('id').single();
        if (execError) throw execError;

        await registrarLinhasPagamento(elegiveis, execucao.id, 'PAGO');
        await salvarResumoNotasFiscais(elegiveis, execucao.id);

        const arquivos = [];
        if (outputs.flash.length) { downloadWorkbook(`PGTO_FLASH_${compactDate(periodo)}.xlsx`, [{ name: 'PGTO_FLASH', ws: worksheetFromObjects(outputs.flash, flashCols) }]); arquivos.push(`Flash (${outputs.flash.length})`); }
        if (outputs.ifood.length) { downloadWorkbook(`PGTO_IFOOD_${compactDate(periodo)}.xlsx`, [{ name: 'PGTO_IFOOD', ws: worksheetFromObjects(outputs.ifood, ifoodCols) }]); arquivos.push(`iFood (${outputs.ifood.length})`); }
        if (outputs.alelo.length) { downloadCsv(`PGTO_ALELO_${compactDate(periodo)}.csv`, outputs.alelo, aleloCols); arquivos.push(`Alelo (${outputs.alelo.length})`); }
        downloadWorkbook(`CONFERENCIA_ADIANTAMENTOS_${compactDate(periodo)}.xlsx`, [{ name: 'Conferencia', ws: worksheetFromObjects(elegiveis, confCols) }]);

        const pagoEm = new Date().toISOString();
        const responsavel = userContext?.user?.name || userContext?.user?.email || null;
        const decisoesPagas = elegiveis.map((r) => ({ ofr_code: r._ofr_code, status: 'pago', execucao_id: execucao.id, pago_em: pagoEm, decidido_por: responsavel, decidido_em: pagoEm }));
        const { error: decError } = await supabase.from('financeiro_adiantamentos_decisoes').upsert(decisoesPagas, { onConflict: 'ofr_code' });
        if (decError) throw decError;
        decisoesPagas.forEach((d) => {
          const row = (state.adiantamentosRows || []).find((x) => x.ofr_code === d.ofr_code);
          if (row) row.decisao = { ...row.decisao, ...d };
        });

        paySetFeedback('fbAdiantamentos', `Arquivo(s) gerado(s): ${arquivos.join(', ') || 'nenhum (sem CPF válido)'}${jaPagos.length ? ` · ${jaPagos.length} já estavam pagas` : ''}${semDestino.length ? ` · ${semDestino.length} sem conta reconhecida (não incluída)` : ''}.`, 'ok');
      } else {
        paySetFeedback('fbAdiantamentos', 'Todas as linhas selecionadas já constavam como PAGO. Nenhum arquivo novo foi gerado.', 'ok');
      }

      jaPagos.forEach((r) => {
        const row = (state.adiantamentosRows || []).find((x) => x.ofr_code === r._ofr_code);
        if (row && row.decisao?.status !== 'pago') row.decisao = { ...row.decisao, status: 'pago' };
      });

      renderAdiantamentosTable();
      setAdiantTab('historico');
    } catch (err) {
      console.error(err);
      paySetFeedback('fbAdiantamentos', err.message || 'Erro ao gerar pagamento.', 'err');
      renderAdiantamentosTable();
    }
  }

  function carregarDespesasTab() {
    if (state.adiantamentosLoaded) return;
    state.adiantamentosLoaded = true;
    carregarAdiantamentos();
  }

  async function registrarLinhasPagamento(rows, execucaoId, status = 'PAGO', apiRetorno = null) {
    const payload = (rows || []).map((row) => ({
      execucao_id: execucaoId,
      unique_hash: row.unique_hash || makePaymentHash(row),
      data: row.data || null,
      funcionario: row.funcionario || null,
      cpf: onlyDigits(row.cpf) || null,
      destino: row.destino || null,
      tipo: row.tipo || null,
      valor: Number(row.valor || 0),
      composicao: row.composicao || null,
      coordenacao: row.coordenacao || null,
      supervisao: row.supervisao || null,
      banco: row.banco || null,
      observacao: row.observacao || null,
      status,
      pago_em: status === 'PAGO' ? new Date().toISOString() : null,
      api_retorno: apiRetorno
    }));
    if (!payload.length) return;
    const { error } = await supabase.from('financeiro_pagamentos_linhas').upsert(payload, { onConflict: 'unique_hash' });
    if (error) throw error;
  }

  const flashCols = [{ key: 'cpf', label: 'CPF' }, { key: 'valor', label: 'Valor' }];

  const ifoodCols = [
    { key: 'cnpj', label: 'CNPJ' }, { key: 'nome', label: 'Nome' }, { key: 'cpf', label: 'CPF' },
    { key: 'nascimento', label: 'Data de nascimento', format: formatDateForXlsx }, { key: 'email', label: 'Email' },
    { key: 'celular', label: 'Celular' }, { key: 'centro_custo', label: 'Centro de custo' }, { key: 'convencao', label: 'Convenção Coletiva' },
    { key: 'grupo_entrega', label: 'Grupo de entrega' }, { key: 'matricula', label: 'Matricula' }, { key: 'filtro', label: 'Filtro para relatorio de recarga' },
    { key: 'refeicao', label: 'Refeição (Aderente ao PAT)' }, { key: 'alimentacao', label: 'Alimentação (Aderente ao PAT)' }, { key: 'livre', label: 'Livre' }
  ];

  const aleloCols = [{ key: 'serie', label: 'Numero de Serie' }, { key: 'cpf', label: 'CPF' }, { key: 'valor', label: 'Valor da Carga' }, { key: 'observacao', label: 'Observacao' }];

  const confCols = [
    { key: 'data', label: 'Data', format: formatDateForXlsx }, { key: 'funcionario', label: 'Colaborador' }, { key: 'cpf', label: 'CPF' },
    { key: 'destino', label: 'Destino' }, { key: 'tipo', label: 'Tipo' }, { key: 'valor', label: 'Valor' },
    { key: 'composicao', label: 'Composição' }, { key: 'coordenacao', label: 'Coordenação' }, { key: 'supervisao', label: 'Supervisão' },
    { key: 'banco', label: 'C. Banc. Despesas' }, { key: 'observacao', label: 'Observação' }
  ];

  return { carregarAdiantamentos, setAdiantTab, renderAdiantamentosTable, renderHistoricoAgrupado, pagarAdiantamentos, carregarDespesasTab };
}

export { criarAdiantamentos };
