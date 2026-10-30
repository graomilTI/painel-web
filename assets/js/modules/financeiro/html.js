// Financeiro — HTML da tela do Financeiro (template único).
// Extraído de assets/js/financeiro.js em 15/10/2026 (arquivo de ~2.800 linhas). O código das funções e constantes
// foi movido sem alteração. Para publicar uma mudança em qualquer módulo de assets/js/modules/financeiro/, troque o
// token ?v=20261030-fin14 em TODOS os imports internos e nos carregadores (assets/js/financeiro.js, financeiro.html):
// tests/financeiro-modulos-versao.test.mjs garante que fiquem iguais.
import { state, esc } from './util.js?v=20261030-fin14';
import { ICON, cardFiltro } from '../../patrimonioLayoutFrotas.js?v=20261019-ordenar';
import { ESTILOS_FINANCEIRO } from './estilos.js?v=20261030-fin14';

  // Card do mês no Dashboard: mesmo cartão do Frotas, com a variação contra o mês anterior (preenchida por dashboard.js).
  function cardMes({ id, label, tone, icone }) {
    return `<div class="fm-kcard info tone-${tone}"><span class="fm-kcard-ic">${ICON[icone] || ''}</span><span class="fm-kcard-tx"><strong id="${id}">–</strong><span>${label}</span><small class="fin-var neutral" id="${id}Change">–</small></span></div>`;
  }

  function htmlFinanceiro() {
    return `
    <style>${ESTILOS_FINANCEIRO}</style>
    <section class="fin-wrap">
      <header class="fm-head">
        <div>
          <div class="fm-kicker">Financeiro</div>
          <h2 class="fm-title">Fluxo de caixa</h2>
          <p class="fm-sub" id="kpiPeriodo">Saldo, contas a receber e a pagar, adiantamentos, pagamentos dos setores e notas fiscais.</p>
        </div>
      </header>
      <div class="fm-kpis fin-kpis">
        ${cardFiltro({ label: 'Saldo do dia', tone: 'blue', icone: 'dinheiro', kpi: 'id="kpiSaldo"', valor: 'R$ 0,00', dica: 'Saldo informado manualmente para hoje' })}
        ${cardFiltro({ label: 'A receber', tone: 'green', icone: 'ok', kpi: 'id="kpiReceber"', valor: 'R$ 0,00' })}
        ${cardFiltro({ label: 'A pagar', tone: 'red', icone: 'alerta', kpi: 'id="kpiPagar"', valor: 'R$ 0,00' })}
        ${cardFiltro({ label: 'Provisão', tone: 'amber', icone: 'calendario', kpi: 'id="kpiProvisao"', valor: 'R$ 0,00' })}
        ${cardFiltro({ label: 'Saldo projetado', tone: 'purple', icone: 'total', kpi: 'id="kpiProjetado"', valor: 'R$ 0,00' })}
      </div>

      <article class="fin-card">
        <div class="fin-tabrow">
          <div class="fin-tabs">
            <button class="fin-tab active" data-tab="dashboard" type="button">Dashboard</button>
            <button class="fin-tab" data-tab="fluxo" type="button">Fluxo</button>
            <button class="fin-tab" data-tab="despesas" type="button">Despesas</button>
            <button class="fin-tab" data-tab="pagamentos" type="button">Pagamentos</button>
            <button class="fin-tab" data-tab="notas-fiscais" type="button">Notas Fiscais</button>
            <button class="fin-tab" data-tab="ajustes" type="button">Ajustes</button>
          </div>
          <button class="fin-tab-icon" id="btnReload" type="button" title="Atualizar fluxo" aria-label="Atualizar fluxo">↻</button>
        </div>

        <div class="fin-panel active" id="tab-dashboard">
          <div class="fm-kpis fin-kpis fin-kpis-mes">
            ${cardMes({ id: 'dKpiSaldo', label: 'Saldo do mês', tone: 'blue', icone: 'dinheiro' })}
            ${cardMes({ id: 'dKpiReceber', label: 'A receber (mês)', tone: 'green', icone: 'ok' })}
            ${cardMes({ id: 'dKpiPagar', label: 'A pagar (mês)', tone: 'red', icone: 'alerta' })}
            ${cardMes({ id: 'dKpiProjetado', label: 'Saldo projetado', tone: 'purple', icone: 'total' })}
          </div>
          <div class="dash-charts-row">
            <div class="dash-chart-card">
              <h3>Despesas Diárias</h3>
              <p>Próximos 15 dias</p>
              <div class="dash-chart-inner"><canvas id="dashLineChart"></canvas></div>
            </div>
            <div class="dash-chart-card">
              <h3>Categorias de Despesas</h3>
              <p>Últimos 90 dias</p>
              <div class="dash-chart-inner"><canvas id="dashDonutChart"></canvas></div>
            </div>
          </div>
          <div class="dash-bottom-row">
            <div class="dash-transactions-card">
              <div class="dash-section-head">
                <h3>Vencimentos de Hoje</h3>
                <button class="btn btn-secondary fin-small" data-tab-target="fluxo" type="button">Ver todos</button>
              </div>
              <div id="dashTransactions" class="dash-tx-list"><div class="dash-loading">Carregando...</div></div>
            </div>
          </div>
        </div>

        <div class="fin-panel" id="tab-fluxo">
          <div id="fluxoListaView">
            <div class="fin-fluxo-resumo" id="cfFlowMini" style="display:none">
              ${cardFiltro({ label: 'Fluxo líquido do período', tone: 'blue', icone: 'total', kpi: 'id="cfFmLiquido"', valor: 'R$ 0,00', dica: 'A receber menos a pagar no período' })}
              <div class="cf-flow-bar-wrap">
                <span class="cf-flow-bar-label">Receber vs pagar</span>
                <div class="cf-flow-bar-track">
                  <div class="cf-flow-bar-recv" id="cfBarRecv" style="width:50%"></div>
                  <div class="cf-flow-bar-pay" id="cfBarPay" style="width:50%"></div>
                </div>
              </div>
            </div>
            <form class="fin-form" id="periodForm">
              <div class="fin-field"><label>Data inicial</label><input id="filterInicio" type="date" value="${esc(state.filters.inicio)}"></div>
              <div class="fin-field"><label>Data final</label><input id="filterFim" type="date" value="${esc(state.filters.fim)}"></div>
              <div class="fin-field"><label>&nbsp;</label><button class="btn btn-primary" type="submit">Aplicar período</button></div>
            </form>
            <br>
            <div class="fm-table-wrap"><table class="fm-table"><thead><tr><th>Data</th><th>Saldo do dia</th><th>Receber</th><th>Pagar</th><th>Provisão</th><th>Saldo projetado</th><th>Status</th><th>Ação</th></tr></thead><tbody id="fluxoTbody"><tr><td colspan="8" class="fm-empty">Carregando...</td></tr></tbody></table></div>
          </div>

          <div id="fluxoDetalhesView" style="display:none">
            <div class="fin-head">
              <div><h3>Detalhes do dia selecionado</h3><p id="detalhesData">Selecione uma data no fluxo.</p></div>
              <button class="fm-btn ghost" id="btnVoltarFluxo" type="button">← Voltar</button>
            </div>
            <div class="fm-bar">
              <select id="detFiltroTipo" class="fm-select"><option value="">Tipo</option><option value="Receber">Receber</option><option value="Pagar">Pagar</option></select>
              <select id="detFiltroSituacao" class="fm-select"><option value="">Situação</option><option value="Recebida">Recebida</option><option value="A vencer">A vencer</option><option value="Vencida">Vencida</option><option value="Paga">Paga</option></select>
              <input type="text" class="fm-input" id="detFiltroFavorecido" placeholder="Favorecido...">
              <input type="text" class="fm-input" id="detFiltroDoc" placeholder="Documento...">
            </div>
            <div class="fm-table-wrap"><table class="fm-table"><thead><tr>
              <th data-det-sort="tipo" class="det-th-sort">Tipo <span class="det-sort-icon">↕</span></th>
              <th data-det-sort="situacao" class="det-th-sort">Situação <span class="det-sort-icon">↕</span></th>
              <th data-det-sort="nome" class="det-th-sort">Nome/Favorecido <span class="det-sort-icon">↕</span></th>
              <th data-det-sort="doc" class="det-th-sort">Documento <span class="det-sort-icon">↕</span></th>
              <th data-det-sort="valor" class="det-th-sort">Valor <span class="det-sort-icon">↕</span></th>
              <th data-det-sort="vencimento" class="det-th-sort">Vencimento <span class="det-sort-icon">↕</span></th>
            </tr></thead><tbody id="detalhesTbody"><tr><td colspan="6" class="fm-empty">Nenhuma data selecionada.</td></tr></tbody></table></div>
          </div>
        </div>

        <div class="fin-panel" id="tab-ajustes">
          <div class="fin-head"><div><h3>Ajustes</h3><p>Saldo e provisão manual, e importação de relatórios (contingência).</p></div></div>
          <div class="pay-subtabs">
            <button class="ajustes-subtab active" data-ajustes-tab="saldo" type="button">Saldo e Provisão</button>
            <button class="ajustes-subtab" data-ajustes-tab="importar" type="button">Importar relatórios</button>
          </div>

          <div class="ajustes-panel active" id="ajustes-saldo">
            <form class="fin-form" id="configForm">
              <div class="fin-field"><label>Data</label><input id="cfgData" type="date" value="${esc(state.currentDate)}" required></div>
              <div class="fin-field"><label>Saldo do dia</label><input id="cfgSaldo" type="number" step="0.01" placeholder="0,00"></div>
              <div class="fin-field"><label>Provisão automática</label><input id="cfgProvAuto" type="number" step="0.01" placeholder="0,00"></div>
              <div class="fin-field"><label>Ajuste manual provisão</label><input id="cfgProvManual" type="number" step="0.01" placeholder="0,00"></div>
              <div class="fin-field full"><label>Observações</label><textarea id="cfgObs" placeholder="Observações do financeiro"></textarea></div>
              <div class="fin-field"><label>&nbsp;</label><button class="btn btn-primary" type="submit">Salvar ajustes</button></div>
              <div class="fin-field"><label>&nbsp;</label><span id="fbConfig" class="fin-feedback"></span></div>
            </form>
          </div>

          <div class="ajustes-panel" id="ajustes-importar">
            <div class="fin-import-grid">
              <div class="fin-drop">
                <h3>Contas a Receber</h3>
                <p class="fin-muted">Use o relatório com colunas Código, Fatura, Cliente, Vencimento, Valor e Valor Pago.</p><br>
                <input id="fileReceber" type="file" accept=".xlsx,.xls,.csv">
                <div class="fin-actions-row"><button class="btn btn-primary" id="btnImportReceber" type="button">Importar receber</button><span id="fbReceber" class="fin-feedback"></span></div>
              </div>
              <div class="fin-drop">
                <h3>Contas a Pagar</h3>
                <p class="fin-muted">Use o relatório com colunas Empresa, COD/Grupo, Favorecido, Doc, Vencimento, Parcela e Valor.</p><br>
                <input id="filePagar" type="file" accept=".xlsx,.xls,.csv">
                <div class="fin-actions-row"><button class="btn btn-primary" id="btnImportPagar" type="button">Importar pagar</button><span id="fbPagar" class="fin-feedback"></span></div>
              </div>
            </div>
          </div>
        </div>


        <div class="fin-panel" id="tab-despesas">
          <div class="fin-head">
            <div><h3>Despesas</h3><p>Adiantamentos ficam concentrados aqui. Diária (Terceirizados) e Alimentação (almoço) saíram deste fluxo — o lançamento já é feito pelo agente de despesas retroativas direto no GRM.</p></div>
          </div>

          <section class="pay-card pay-mode-panel active" id="pay-mode-adiantamentos">
            <h4>ADIANTAMENTOS</h4>
            <p>Solicitações de Caixa Operacional sincronizadas automaticamente do GRM (agente sync-adiantamentos, a cada 15min). Marque ✓ para incluir no pagamento ou ✗ para recusar (motivo fica no histórico).</p>
            <div class="pay-filter-grid">
              <div class="fin-field"><label>&nbsp;</label><button class="btn btn-secondary" id="btnAtualizarAdiantamentos" type="button">↻ Atualizar</button></div>
              <div class="fin-field full"><label>&nbsp;</label><span id="fbAdiantamentos" class="fin-feedback"></span></div>
            </div>

            <div class="fm-kpis fin-kpis">
              ${cardFiltro({ label: 'Pendentes', tone: 'amber', icone: 'relogio', kpi: 'id="adiantPendentes"', valor: '0' })}
              ${cardFiltro({ label: 'Selecionados ✓', tone: 'blue', icone: 'ok', kpi: 'id="adiantSelecionados"', valor: '0' })}
              ${cardFiltro({ label: 'Total selecionado', tone: 'green', icone: 'dinheiro', kpi: 'id="adiantTotalSelecionado"', valor: 'R$ 0,00' })}
              ${cardFiltro({ label: 'Recusados', tone: 'red', icone: 'erro', kpi: 'id="adiantRecusados"', valor: '0' })}
            </div>

            <div class="pay-note">Somente linhas marcadas com <strong>✓</strong> entram no botão <strong>PAGAR</strong>. Ao pagar, recusar (motivo obrigatório) ou sair da lista de pendentes do GRM (resolvido direto por lá), a linha sai daqui e vai para <strong>Histórico de Pagamentos</strong> — evita pagamento duplicado.</div>

            <div class="pay-subtabs">
              <button class="adiant-subtab active" data-adiant-tab="ativos" type="button">Solicitações</button>
              <button class="adiant-subtab" data-adiant-tab="historico" type="button">Histórico de Pagamentos</button>
            </div>

            <div class="adiant-table active" id="adiant-ativos">
              <div class="fm-table-wrap">
                <table class="fm-table">
                  <thead><tr>
                    <th data-adiant-sort="data_solicitacao" class="adiant-th-sort">Data <span class="adiant-sort-icon">↕</span></th>
                    <th data-adiant-sort="colaborador" class="adiant-th-sort">Colaborador <span class="adiant-sort-icon">↕</span></th>
                    <th data-adiant-sort="coordenacao" class="adiant-th-sort">Coordenação <span class="adiant-sort-icon">↕</span></th>
                    <th data-adiant-sort="supervisao" class="adiant-th-sort">Supervisão <span class="adiant-sort-icon">↕</span></th>
                    <th data-adiant-sort="valor" class="adiant-th-sort">Valor <span class="adiant-sort-icon">↕</span></th>
                    <th data-adiant-sort="saldo" class="adiant-th-sort">Saldo <span class="adiant-sort-icon">↕</span></th>
                    <th data-adiant-sort="embarque" class="adiant-th-sort">Embarque <span class="adiant-sort-icon">↕</span></th>
                    <th data-adiant-sort="leitura_mais_antiga" class="adiant-th-sort">Leitura <span class="adiant-sort-icon">↕</span></th>
                    <th data-adiant-sort="descricao" class="adiant-th-sort">Descrição <span class="adiant-sort-icon">↕</span></th>
                    <th>Ação</th>
                  </tr></thead>
                  <tbody id="adiantTbody"><tr><td colspan="10" class="fm-empty">Carregando...</td></tr></tbody>
                </table>
              </div>

              <div class="pay-footer">
                <div><strong id="adiantFooterTotal">Total pronto para pagar: R$ 0,00</strong><span id="adiantFooterHint">Marque ✓ nas solicitações para liberar o botão.</span></div>
                <button class="btn-pay-final" id="btnPagarAdiantamentos" type="button" disabled>PAGAR</button>
              </div>
            </div>

            <div class="adiant-table" id="adiant-historico">
              <input id="histColaboradorFiltro" class="pay-search-input" type="search" placeholder="Filtrar por colaborador..." style="margin-bottom:14px">
              <div id="adiantHistoricoContent"><div class="fm-empty">Nenhum pagamento registrado ainda.</div></div>
            </div>
          </section>
        </div>

        <div class="fin-panel" id="tab-pagamentos">
          <div class="fm-shell">
            <div class="fm-topo">
              <p class="fm-prazo-dia">Fila de despesas enviadas por Compras, Hospedagem, RH e outros módulos para o financeiro realizar o pagamento.</p>
              <div class="fm-head-actions"><button class="fm-btn soft" id="btnReloadSetorPagamentos" type="button">↻ Atualizar</button></div>
            </div>

            <div class="fm-kpis" id="setorPagKpis"></div>

            <div class="fm-card"><div class="fm-body">
              <div class="fm-bar">
                <div class="fm-search">${ICON.busca}<input class="fm-input" id="setorPagBusca" type="search" placeholder="Buscar por setor, código, gestor, coordenação, conteúdo ou valor..." autocomplete="off"></div>
                <span data-chip></span>
                <span class="fm-count" id="setorPagCount"></span>
              </div>
              <div class="fm-table-wrap">
                <table class="fm-table">
                  <thead>
                    <tr>
                      <th>Setor</th>
                      <th>Data/Hora</th>
                      <th>Gestor</th>
                      <th>Coordenação</th>
                      <th>Conteúdo</th>
                      <th>Valor</th>
                      <th>Status</th>
                      <th>Ações</th>
                    </tr>
                  </thead>
                  <tbody id="setorPagamentosTbody">
                    <tr><td colspan="8" class="fm-empty">Carregando pagamentos enviados pelos setores...</td></tr>
                  </tbody>
                </table>
              </div>
            </div></div>

            <div class="fm-card"><div class="fm-body">
              <div class="fin-baixa-head">
                <div>
                  <b>Comprovantes de pagamento (Holerite/NF)</b>
                  <span class="fm-prazo-dia">Envie os comprovantes de PIX/TED de um lote já pago (holerite ou NF já lançados no GRM). Cada arquivo vira 1 item na fila de baixa — o casamento com o lançamento certo e a confirmação de casos ambíguos ficam no Painel de Notas Fiscais.</span>
                </div>
                <a class="fm-btn ghost" href="notas-fiscais.html#baixas">Ver e revisar →</a>
              </div>
              <div class="fin-baixa-bar">
                <input class="fm-input fin-file" id="baixaNfArquivos" type="file" multiple accept=".pdf" aria-label="Comprovantes em PDF">
                <button class="fm-btn primary" id="btnEnviarBaixaNf" type="button">Enviar comprovantes</button>
                <span id="fbBaixaNf" class="fin-feedback"></span>
              </div>
              <div id="baixaNfResumo" class="fm-kpis"></div>
            </div></div>
          </div>
        </div>

        <div class="fin-panel" id="tab-notas-fiscais">
          <div class="fin-head">
            <div>
              <h3>Notas Fiscais</h3>
              <p>Sincronizado automaticamente pelo agente sync-notas-fiscais. Dados de faturamento por nota fiscal.</p>
            </div>
            <button class="btn btn-secondary" id="nfReloadBtn" type="button">↻ Atualizar</button>
          </div>

          <div class="fm-kpis fin-kpis" id="nfSummary"></div>

          <div class="fin-form" style="margin:14px 0 0">
            <div class="fin-field">
              <label>Cliente</label>
              <input id="nfFiltroCliente" type="text" placeholder="Buscar cliente..." />
            </div>
            <div class="fin-field">
              <label>Situação</label>
              <select id="nfFiltroSituacao">
                <option value="">Todas</option>
                <option value="Paga">Paga</option>
                <option value="Aguardando Pagamento">Aguardando Pagamento</option>
              </select>
            </div>
          </div>

          <div class="fm-table-wrap mt-16">
            <table class="fm-table">
              <thead>
                <tr>
                  <th>N.F.</th><th>Data N.F.</th><th>Cliente</th><th>Coordenação</th>
                  <th>Tons</th><th>Valor Bruto</th><th>Imposto</th><th>Valor da N.F.</th><th>Situação</th>
                </tr>
              </thead>
              <tbody id="nfTbody">
                <tr><td colspan="9" class="fm-empty">Carregando...</td></tr>
              </tbody>
            </table>
          </div>
          <div class="fin-muted" id="nfPreviewNote"></div>
        </div>
      </article>
    </section>
  `;
  }

export { htmlFinanceiro };
