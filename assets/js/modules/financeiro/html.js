// Financeiro — HTML da tela do Financeiro (template único).
// Extraído de assets/js/financeiro.js em 15/10/2026 (arquivo de ~2.800 linhas). O código das funções e constantes
// foi movido sem alteração. Para publicar uma mudança em qualquer módulo de assets/js/modules/financeiro/, troque o
// token ?v=20261030-fin7 em TODOS os imports internos e nos carregadores (assets/js/financeiro.js, financeiro.html):
// tests/financeiro-modulos-versao.test.mjs garante que fiquem iguais.
import { state, esc } from './util.js?v=20261030-fin7';
import { ICON } from '../../patrimonioLayoutFrotas.js?v=20261019-ordenar';
import { ESTILOS_FINANCEIRO } from './estilos.js?v=20261030-fin7';

  function htmlFinanceiro() {
    return `
    <style>${ESTILOS_FINANCEIRO}</style>
    <section class="fin-wrap">
      <div class="cf-header">
        <div class="cf-balance-block">
          <div class="cf-balance-label">Saldo do dia</div>
          <div class="cf-balance-value" id="kpiSaldo">R$ 0,00</div>
          <div class="cf-balance-sub">Manual · hoje</div>
        </div>
        <div class="cf-right-block">
          <div class="cf-kpi-row">
            <article class="fin-kpi cf-kpi-pill cf-receber"><span>A Receber</span><strong id="kpiReceber">R$ 0,00</strong><small>–</small></article>
            <article class="fin-kpi cf-kpi-pill cf-pagar"><span>A Pagar</span><strong id="kpiPagar">R$ 0,00</strong><small>–</small></article>
            <article class="fin-kpi cf-kpi-pill"><span>Provisão</span><strong id="kpiProvisao">R$ 0,00</strong><small>–</small></article>
            <article class="fin-kpi cf-kpi-pill cf-projected"><span>Saldo Projetado</span><strong id="kpiProjetado">R$ 0,00</strong><small id="kpiStatus">OK</small></article>
          </div>
        </div>
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
          <div class="dash-kpi-grid">
            <div class="dash-kpi-card dash-kpi-saldo">
              <div class="dash-kpi-icon-wrap">💼</div>
              <div class="dash-kpi-info">
                <span class="dash-kpi-label">Saldo do Mês</span>
                <strong class="dash-kpi-value" id="dKpiSaldo">–</strong>
                <span class="dash-kpi-change neutral" id="dKpiSaldoChange">–</span>
              </div>
            </div>
            <div class="dash-kpi-card dash-kpi-receber">
              <div class="dash-kpi-icon-wrap">📈</div>
              <div class="dash-kpi-info">
                <span class="dash-kpi-label">A Receber (mês)</span>
                <strong class="dash-kpi-value" id="dKpiReceber">–</strong>
                <span class="dash-kpi-change neutral" id="dKpiReceberChange">–</span>
              </div>
            </div>
            <div class="dash-kpi-card dash-kpi-pagar">
              <div class="dash-kpi-icon-wrap">📉</div>
              <div class="dash-kpi-info">
                <span class="dash-kpi-label">A Pagar (mês)</span>
                <strong class="dash-kpi-value" id="dKpiPagar">–</strong>
                <span class="dash-kpi-change neutral" id="dKpiPagarChange">–</span>
              </div>
            </div>
            <div class="dash-kpi-card dash-kpi-projetado">
              <div class="dash-kpi-icon-wrap">🎯</div>
              <div class="dash-kpi-info">
                <span class="dash-kpi-label">Saldo Projetado</span>
                <strong class="dash-kpi-value" id="dKpiProjetado">–</strong>
                <span class="dash-kpi-change neutral" id="dKpiProjetadoChange">–</span>
              </div>
            </div>
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
            <div class="cf-flow-mini" id="cfFlowMini" style="display:none">
              <div class="cf-flow-mini-item cf-fm-receber">
                <span class="cf-fm-label">Total Receber</span>
                <span class="cf-fm-val" id="cfFmReceber">R$ 0,00</span>
              </div>
              <div class="cf-flow-mini-item cf-fm-pagar">
                <span class="cf-fm-label">Total Pagar</span>
                <span class="cf-fm-val" id="cfFmPagar">R$ 0,00</span>
              </div>
              <div class="cf-flow-mini-item cf-fm-liquido">
                <span class="cf-fm-label">Fluxo Líquido</span>
                <span class="cf-fm-val" id="cfFmLiquido">R$ 0,00</span>
              </div>
              <div class="cf-flow-bar-wrap">
                <span class="cf-flow-bar-label">Receber vs Pagar</span>
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
            <div class="fin-table-wrap"><table class="fin-table"><thead><tr><th>Data</th><th>Saldo do dia</th><th>Receber</th><th>Pagar</th><th>Provisão</th><th>Saldo projetado</th><th>Status</th><th>Ação</th></tr></thead><tbody id="fluxoTbody"><tr><td colspan="8" class="fin-empty">Carregando...</td></tr></tbody></table></div>
          </div>

          <div id="fluxoDetalhesView" style="display:none">
            <div class="fin-head">
              <div><h3>Detalhes do dia selecionado</h3><p id="detalhesData">Selecione uma data no fluxo.</p></div>
              <button class="btn btn-secondary" id="btnVoltarFluxo" type="button">← Voltar</button>
            </div>
            <div class="fin-det-filters">
              <select id="detFiltroTipo"><option value="">Tipo</option><option value="Receber">Receber</option><option value="Pagar">Pagar</option></select>
              <select id="detFiltroSituacao"><option value="">Situação</option><option value="Recebida">Recebida</option><option value="A vencer">A vencer</option><option value="Vencida">Vencida</option><option value="Paga">Paga</option></select>
              <input type="text" id="detFiltroFavorecido" placeholder="Favorecido...">
              <input type="text" id="detFiltroDoc" placeholder="Documento...">
            </div>
            <div class="fin-table-wrap"><table class="fin-table"><thead><tr>
              <th data-det-sort="tipo" class="det-th-sort">Tipo <span class="det-sort-icon">↕</span></th>
              <th data-det-sort="situacao" class="det-th-sort">Situação <span class="det-sort-icon">↕</span></th>
              <th data-det-sort="nome" class="det-th-sort">Nome/Favorecido <span class="det-sort-icon">↕</span></th>
              <th data-det-sort="doc" class="det-th-sort">Documento <span class="det-sort-icon">↕</span></th>
              <th data-det-sort="valor" class="det-th-sort">Valor <span class="det-sort-icon">↕</span></th>
              <th data-det-sort="vencimento" class="det-th-sort">Vencimento <span class="det-sort-icon">↕</span></th>
            </tr></thead><tbody id="detalhesTbody"><tr><td colspan="6" class="fin-empty">Nenhuma data selecionada.</td></tr></tbody></table></div>
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

            <div class="pay-summary">
              <div class="pay-mini"><span>Pendentes</span><strong id="adiantPendentes">0</strong></div>
              <div class="pay-mini"><span>Selecionados ✓</span><strong id="adiantSelecionados">0</strong></div>
              <div class="pay-mini"><span>Total selecionado</span><strong id="adiantTotalSelecionado">R$ 0,00</strong></div>
              <div class="pay-mini"><span>Recusados</span><strong id="adiantRecusados">0</strong></div>
            </div>

            <div class="pay-note">Somente linhas marcadas com <strong>✓</strong> entram no botão <strong>PAGAR</strong>. Ao pagar, recusar (motivo obrigatório) ou sair da lista de pendentes do GRM (resolvido direto por lá), a linha sai daqui e vai para <strong>Histórico de Pagamentos</strong> — evita pagamento duplicado.</div>

            <div class="pay-subtabs">
              <button class="adiant-subtab active" data-adiant-tab="ativos" type="button">Solicitações</button>
              <button class="adiant-subtab" data-adiant-tab="historico" type="button">Histórico de Pagamentos</button>
            </div>

            <div class="adiant-table active" id="adiant-ativos">
              <div class="fin-table-wrap">
                <table class="fin-table">
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
                  <tbody id="adiantTbody"><tr><td colspan="10" class="fin-empty">Carregando...</td></tr></tbody>
                </table>
              </div>

              <div class="pay-footer">
                <div><strong id="adiantFooterTotal">Total pronto para pagar: R$ 0,00</strong><span id="adiantFooterHint">Marque ✓ nas solicitações para liberar o botão.</span></div>
                <button class="btn-pay-final" id="btnPagarAdiantamentos" type="button" disabled>PAGAR</button>
              </div>
            </div>

            <div class="adiant-table" id="adiant-historico">
              <input id="histColaboradorFiltro" class="pay-search-input" type="search" placeholder="Filtrar por colaborador..." style="margin-bottom:14px">
              <div id="adiantHistoricoContent"><div class="fin-empty">Nenhum pagamento registrado ainda.</div></div>
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

          <div class="pay-summary" id="nfSummary"></div>

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

          <div class="fin-table-wrap mt-16">
            <table class="fin-table">
              <thead>
                <tr>
                  <th>N.F.</th><th>Data N.F.</th><th>Cliente</th><th>Coordenação</th>
                  <th>Tons</th><th>Valor Bruto</th><th>Imposto</th><th>Valor da N.F.</th><th>Situação</th>
                </tr>
              </thead>
              <tbody id="nfTbody">
                <tr><td colspan="9" class="fin-empty">Carregando...</td></tr>
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
