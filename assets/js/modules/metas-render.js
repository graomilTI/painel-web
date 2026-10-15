// Metas — construção do HTML das abas (indicadores, regionais, estados, gestores, cadastro de metas).
// Extraído de modules/metas.js em 15/10/2026 (era um único bloco autoexecutável de ~3.300 linhas).
// O código das funções e constantes foi movido sem alteração. Para publicar uma mudança em qualquer
// módulo metas-*.js, troque o token ?v=20261015-metas1 em TODOS os imports internos e no carregador
// (assets/js/metas.js): tests/metas-modulos-versao.test.mjs garante que fiquem iguais.
import { MONTHS, escapeHtml, fmtTons, fmtPct, pctClass, uniqueSorted, getMonthName, toInputNumber } from './metas-util.js?v=20261015-metas1';
import { rowKey, isMonthClosed, getRowStatus, mergeCoordenacoes, calcularSugestoesDistribuicao, fechamentoResumo, totalsFromRegional, mesAnterior } from './metas-calculo.js?v=20261015-metas1';

  const TAB_ICON_SVG = {
    geral: '<rect x="3" y="3" width="7.5" height="9.5" rx="2"/><rect x="13.5" y="3" width="7.5" height="5.5" rx="2"/><rect x="13.5" y="11.5" width="7.5" height="9.5" rx="2"/><rect x="3" y="15.5" width="7.5" height="5.5" rx="2"/>',
    regionais: '<path d="M12 21s7-6.2 7-11.2a7 7 0 1 0-14 0C5 14.8 12 21 12 21Z"/><circle cx="12" cy="9.6" r="2.6"/>',
    estados: '<path d="M5.5 3v18"/><path d="M5.5 4.5h12l-2.2 3.5 2.2 3.5h-12"/>',
    historico: '<path d="M3.5 11a8.5 8.5 0 1 1 2.5 6"/><path d="M3.5 5.5V11h5.5"/><path d="M12 7.5V12l3.4 2"/>',
    gestores: '<circle cx="9" cy="8" r="3.4"/><path d="M2.6 19.2c.6-3.2 3-5 6.4-5s5.8 1.8 6.4 5"/><circle cx="17.4" cy="6.8" r="2.6"/><path d="M16.2 14.2c2.7.4 4.5 2.1 5 4.7"/>',
    configurar: '<rect x="4" y="10" width="16" height="11" rx="2.4"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/><path d="m9.3 15.4 1.9 1.9 3.5-3.7"/>'
  };

  function tabIconMarkup(id) {
    const path = TAB_ICON_SVG[id];
    if (!path) return '';
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
  }

  const TAB_GROUPS = [
    {
      label: 'Acompanhamento',
      tabs: [
        { id: 'geral',     label: 'Visão Geral',  desc: 'Indicadores consolidados do período: meta total, produção realizada e percentual de atingimento.' },
        { id: 'estados',   label: 'Estados',      desc: 'Visão consolidada por estado, somando o resultado das regionais correspondentes.' }
      ]
    },
    {
      label: 'Gestão',
      tabs: [
        { id: 'gestores',   label: 'Gestores',            desc: 'Cadastro dos gestores de cada coordenação/supervisão — base para o cálculo do bônus.' },
        { id: 'configurar', label: 'Fechamento',  desc: 'Cadastro das metas do mês, auditoria, fechamento do período e cálculo do bônus dos gestores.' }
      ]
    }
  ];

  function findTabMeta(tabId) {
    for (const group of TAB_GROUPS) {
      const found = group.tabs.find(t => t.id === tabId);
      if (found) return found;
    }
    return null;
  }

  function buildOptions(items, current, allLabel) {
    return [
      `<option value="">${escapeHtml(allLabel)}</option>`,
      ...items.map(item => `<option value="${escapeHtml(item)}" ${String(item) === String(current) ? 'selected' : ''}>${escapeHtml(item)}</option>`)
    ].join('');
  }

  function renderKpis(rows) {
    const total = totalsFromRegional(rows);

    return `
      <div class="metas-kpis">
        <div class="metas-card">
          <div class="metas-card-label">Meta do período</div>
          <div class="metas-card-value">${fmtTons(total.meta)}</div>
          <div class="metas-card-sub">Soma das metas regionais ativas</div>
        </div>
        <div class="metas-card">
          <div class="metas-card-label">Produzido</div>
          <div class="metas-card-value">${fmtTons(total.produzido)}</div>
          <div class="metas-card-sub">Base: Relatório Resultado Diário · coluna Toneladas</div>
        </div>
        <div class="metas-card">
          <div class="metas-card-label">Restante</div>
          <div class="metas-card-value">${fmtTons(total.restante)}</div>
          <div class="metas-card-sub">Saldo até atingir a meta</div>
        </div>
        <div class="metas-card">
          <div class="metas-card-label">% atingido</div>
          <div class="metas-card-value">${fmtPct(total.percentual)}</div>
          <div class="metas-card-sub">${total.best ? `Líder: ${escapeHtml(total.best.regional)}` : 'Sem produção no período'}</div>
        </div>
      </div>
    `;
  }

  function renderProgress(rows) {
    const total = totalsFromRegional(rows);
    const cls = pctClass(total.percentual);
    const withMeta = rows.filter(r => Number(r.meta_tons || 0) > 0);
    const sorted = [...withMeta].sort((a, b) => String(a.regional || '').localeCompare(String(b.regional || ''), 'pt-BR'));
    const statusMsg = total.produzido >= total.meta ? 'Meta atingida!' : `Faltam ${fmtTons(total.restante)}`;

    const cols = sorted.map(row => {
      const meta = Number(row.meta_tons || 0);
      const prod = Number(row.produzido_tons || 0);
      const pctReal = Number(row.percentual_atingido || 0);
      const prodPct = Math.min(100, meta > 0 ? (prod / meta) * 100 : 0);
      const restPct = 100 - prodPct;

      return `
        <div class="metas-rc-col">
          <div class="metas-rc-top-val" title="${fmtTons(meta)}">${fmtTons(meta)}</div>
          <div class="metas-rc-bar" title="${escapeHtml(row.regional)}: ${fmtPct(pctReal)} atingido">
            <div class="metas-rc-restante" style="height:${restPct.toFixed(2)}%"></div>
            <div class="metas-rc-atual" style="height:${Math.max(prodPct, 0).toFixed(2)}%"></div>
            <div class="metas-rc-label-wrap">
              <span class="metas-rc-label">${escapeHtml(row.regional)}</span>
            </div>
          </div>
          <div class="metas-rc-pct ${pctClass(pctReal)}" title="Percentual atingido">${fmtPct(pctReal)}</div>
          <div class="metas-rc-bot-val" title="${fmtTons(prod)}">${fmtTons(prod)}</div>
        </div>
      `;
    }).join('');

    return `
      <div class="metas-card">
        <div class="metas-section-title">
          <h2>Meta vs Realizado por Regional</h2>
          <span class="metas-pill ${cls}">${fmtPct(total.percentual)} atingido</span>
        </div>

        <div class="metas-rc-legend">
          <span class="metas-rc-legend-item">
            <span class="metas-rc-legend-dot restante"></span>Restante
          </span>
          <span class="metas-rc-legend-item">
            <span class="metas-rc-legend-dot atual"></span>Atual
          </span>
        </div>

        <div class="metas-rc-scroll">
          <div class="metas-rc-inner">
            ${cols || '<div style="color:var(--metas-muted);font-size:13px;padding:16px;">Nenhuma meta cadastrada para o período.</div>'}
          </div>
        </div>

        <div class="metas-compare-footer">
          <span>${statusMsg}</span>
          <span class="metas-pill ${cls}">${fmtPct(total.percentual)} atingido</span>
        </div>
      </div>
    `;
  }

  function renderBars(title, subtitle, rows, labelKey, valueKey, limit) {
    const list = [...rows]
      .sort((a, b) => Number(b[valueKey] || 0) - Number(a[valueKey] || 0))
      .slice(0, limit || 12);

    const max = Math.max(...list.map(r => Number(r[valueKey] || 0)), 1);

    return `
      <div class="metas-card">
        <div class="metas-section-title">
          <h2>${escapeHtml(title)}</h2>
          <span>${escapeHtml(subtitle || '')}</span>
        </div>

        ${
          list.length
            ? `<div class="metas-bars">
                ${list.map(row => {
                  const value = Number(row[valueKey] || 0);
                  const pct = Math.max(2, (value / max) * 100);
                  return `
                    <div class="metas-bar-row">
                      <div class="metas-bar-name" title="${escapeHtml(row[labelKey])}">${escapeHtml(row[labelKey])}</div>
                      <div class="metas-bar-track">
                        <div class="metas-bar-fill" style="width:${pct}%"></div>
                      </div>
                      <div class="metas-bar-value">${fmtTons(value)}</div>
                    </div>
                  `;
                }).join('')}
              </div>`
            : `<div class="metas-empty">Nenhum dado encontrado para os filtros selecionados.</div>`
        }
      </div>
    `;
  }

  function renderRegionalTable(rows) {
    return `
      <div class="metas-table-card">
        <div class="metas-table-top">
          <h2>Metas por Regional</h2>
          <span class="metas-pill">${rows.length} registros</span>
        </div>

        <div class="metas-table-wrap">
          <table class="metas-table">
            <thead>
              <tr>
                <th>Regional</th>
                <th>Estado</th>
                <th class="num">Meta</th>
                <th class="num">Produzido</th>
                <th class="num">Restante</th>
                <th class="num">%</th>
              </tr>
            </thead>
            <tbody>
              ${
                rows.length
                  ? rows.map(row => `
                    <tr>
                      <td><strong>${escapeHtml(row.regional)}</strong></td>
                      <td>${escapeHtml(row.estado)}</td>
                      <td class="num">${fmtTons(row.meta_tons)}</td>
                      <td class="num">${fmtTons(row.produzido_tons)}</td>
                      <td class="num">${fmtTons(row.restante_tons)}</td>
                      <td class="num"><span class="metas-pill ${pctClass(row.percentual_atingido)}">${fmtPct(row.percentual_atingido)}</span></td>
                    </tr>
                  `).join('')
                  : `<tr><td colspan="6"><div class="metas-empty">Nenhuma meta cadastrada para esse período.</div></td></tr>`
              }
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  function renderEstadoTable(rows) {
    return `
      <div class="metas-table-card">
        <div class="metas-table-top">
          <h2>Consolidado por Estado</h2>
          <span class="metas-pill">${rows.length} estados</span>
        </div>

        <div class="metas-table-wrap">
          <table class="metas-table">
            <thead>
              <tr>
                <th>Estado</th>
                <th class="num">Meta</th>
                <th class="num">Produzido</th>
                <th class="num">Restante</th>
                <th class="num">%</th>
              </tr>
            </thead>
            <tbody>
              ${
                rows.length
                  ? rows.map(row => `
                    <tr>
                      <td><strong>${escapeHtml(row.estado)}</strong></td>
                      <td class="num">${fmtTons(row.meta_tons)}</td>
                      <td class="num">${fmtTons(row.produzido_tons)}</td>
                      <td class="num">${fmtTons(row.restante_tons)}</td>
                      <td class="num"><span class="metas-pill ${pctClass(row.percentual_atingido)}">${fmtPct(row.percentual_atingido)}</span></td>
                    </tr>
                  `).join('')
                  : `<tr><td colspan="5"><div class="metas-empty">Nenhum estado encontrado para esse período.</div></td></tr>`
              }
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  function renderHistoricoTable(rows) {
    const ordered = [...rows].sort((a, b) => (Number(b.ano) - Number(a.ano)) || (Number(b.mes) - Number(a.mes)));

    return `
      <div class="metas-grid-2">
        ${renderBars('Histórico mensal', 'Produção por mês', [...rows].sort((a, b) => (Number(a.ano) - Number(b.ano)) || (Number(a.mes) - Number(b.mes))).map(r => ({
          label: `${getMonthName(r.mes).slice(0, 3)}/${r.ano}`,
          produzido_total_tons: r.produzido_total_tons
        })), 'label', 'produzido_total_tons', 12)}
        ${renderBars('Meta mensal', 'Comparativo por mês', [...rows].sort((a, b) => (Number(a.ano) - Number(b.ano)) || (Number(a.mes) - Number(b.mes))).map(r => ({
          label: `${getMonthName(r.mes).slice(0, 3)}/${r.ano}`,
          meta_total_tons: r.meta_total_tons
        })), 'label', 'meta_total_tons', 12)}
      </div>

      <div class="metas-table-card">
        <div class="metas-table-top">
          <h2>Histórico mês a mês</h2>
          <span class="metas-pill">${ordered.length} meses</span>
        </div>

        <div class="metas-table-wrap">
          <table class="metas-table">
            <thead>
              <tr>
                <th>Mês</th>
                <th class="num">Meta</th>
                <th class="num">Produzido</th>
                <th class="num">Restante</th>
                <th class="num">%</th>
              </tr>
            </thead>
            <tbody>
              ${
                ordered.length
                  ? ordered.map(row => `
                    <tr>
                      <td><strong>${getMonthName(row.mes)}/${row.ano}</strong></td>
                      <td class="num">${fmtTons(row.meta_total_tons)}</td>
                      <td class="num">${fmtTons(row.produzido_total_tons)}</td>
                      <td class="num">${fmtTons(row.restante_total_tons)}</td>
                      <td class="num"><span class="metas-pill ${pctClass(row.percentual_atingido)}">${fmtPct(row.percentual_atingido)}</span></td>
                    </tr>
                  `).join('')
                  : `<tr><td colspan="5"><div class="metas-empty">Histórico ainda não encontrado.</div></td></tr>`
              }
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  function renderGestores(state) {
    const fmtBRL = v => Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const calcBI = g => (Number(g.salario || 0) + Number(g.grat40 || 0)) * 0.1;

    const rows = [...state.gestores].sort((a, b) =>
      String(a.coordenacao || '').localeCompare(String(b.coordenacao || ''), 'pt-BR') ||
      String(a.gestor || '').localeCompare(String(b.gestor || ''), 'pt-BR')
    );

    function rowHtml(g) {
      const editing = String(g.id) === String(state.gestoresEditId);
      if (editing) {
        return `
          <tr data-metas-gestor-row data-id="${escapeHtml(String(g.id))}">
            <td><input class="metas-edit-input" data-gf="coordenacao" value="${escapeHtml(g.coordenacao || '')}" placeholder="Coordenação" /></td>
            <td><input class="metas-edit-input" data-gf="gestor" value="${escapeHtml(g.gestor || '')}" placeholder="Nome" /></td>
            <td><input class="metas-edit-input" data-gf="supervisao" value="${escapeHtml(g.supervisao || '')}" placeholder="Supervisão" /></td>
            <td class="num"><input class="metas-edit-input" data-gf="salario" type="number" step="0.01" value="${g.salario || ''}" placeholder="0,00" style="text-align:right;width:100px" /></td>
            <td class="num"><input class="metas-edit-input" data-gf="grat40" type="number" step="0.01" value="${g.grat40 || ''}" placeholder="0,00" style="text-align:right;width:90px" /></td>
            <td class="num" style="color:#86efac;font-weight:800">R$ ${fmtBRL(calcBI(g))}</td>
            <td style="text-align:right;white-space:nowrap">
              <button class="metas-btn" style="padding:5px 10px;font-size:11px" data-metas-gestor-save-edit="${escapeHtml(String(g.id))}">Salvar</button>
              <button class="metas-btn secondary" style="padding:5px 10px;font-size:11px;margin-left:4px" data-metas-gestor-cancel-edit>✕</button>
            </td>
          </tr>`;
      }
      return `
        <tr data-metas-gestor-row data-id="${escapeHtml(String(g.id))}">
          <td><strong>${escapeHtml(g.coordenacao || '')}</strong></td>
          <td>${escapeHtml(g.gestor || '')}</td>
          <td>${escapeHtml(g.supervisao || '—')}</td>
          <td class="num">R$ ${fmtBRL(g.salario)}</td>
          <td class="num">${Number(g.grat40 || 0) > 0 ? 'R$ ' + fmtBRL(g.grat40) : '—'}</td>
          <td class="num" style="color:#86efac;font-weight:800">R$ ${fmtBRL(calcBI(g))}</td>
          <td style="text-align:right;white-space:nowrap">
            <button class="metas-btn secondary" style="padding:5px 10px;font-size:11px" data-metas-gestor-edit="${escapeHtml(String(g.id))}">Editar</button>
            <button class="metas-btn secondary" style="padding:5px 10px;font-size:11px;color:#fca5a5;border-color:rgba(239,68,68,.3);margin-left:4px" data-metas-gestor-del="${escapeHtml(String(g.id))}">Excluir</button>
          </td>
        </tr>`;
    }

    return `
      <div class="metas-table-card">
        <div class="metas-table-top">
          <h2>Gestores por Regional</h2>
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
            <span class="metas-pill">${rows.length} gestores</span>
            <button class="metas-btn" type="button" data-metas-gestor-add>+ Adicionar</button>
          </div>
        </div>

        <div id="metasGestorAddForm" style="display:none;padding:14px 16px;border-bottom:1px solid var(--metas-border)">
          <div style="display:grid;grid-template-columns:1fr 1.6fr 1.6fr 110px 110px auto;gap:10px;align-items:end">
            <div class="metas-field"><label>Coordenação</label><input class="metas-edit-input" id="mgfCoord" placeholder="Ex.: GOIAS" /></div>
            <div class="metas-field"><label>Gestor</label><input class="metas-edit-input" id="mgfGestor" placeholder="Nome completo" /></div>
            <div class="metas-field"><label>Supervisão</label><input class="metas-edit-input" id="mgfSup" placeholder="Ex.: GOIAS 1 - Rio Verde" /></div>
            <div class="metas-field"><label>Salário (R$)</label><input class="metas-edit-input" id="mgfSalario" type="number" step="0.01" min="0" placeholder="0,00" /></div>
            <div class="metas-field"><label>Grat. 40%</label><input class="metas-edit-input" id="mgfGrat" type="number" step="0.01" min="0" placeholder="0,00" /></div>
            <div style="display:flex;gap:6px">
              <button class="metas-btn" type="button" data-metas-gestor-save-new>Salvar</button>
              <button class="metas-btn secondary" type="button" data-metas-gestor-cancel>✕</button>
            </div>
          </div>
        </div>

        <div class="metas-table-wrap">
          <table class="metas-table">
            <thead>
              <tr>
                <th>Coordenação</th>
                <th>Gestor</th>
                <th>Supervisão</th>
                <th class="num">Salário</th>
                <th class="num">Grat. 40%</th>
                <th class="num">Bônus Inicial</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              ${rows.length
                ? rows.map(rowHtml).join('')
                : `<tr><td colspan="7"><div class="metas-empty">Nenhum gestor cadastrado.</div></td></tr>`}
            </tbody>
          </table>
        </div>
        <p class="metas-config-hint" style="padding:10px 16px">Bônus inicial = (salário + grat.40%) × 10%.</p>
      </div>
    `;
  }

  function renderCadastroMetas(state) {
    const years = [];
    const currentYear = new Date().getFullYear();
    for (let y = currentYear - 2; y <= currentYear + 2; y++) years.push(y);

    const rows = mergeCoordenacoes(state);
    const fechado = isMonthClosed(state);
    const sugestoes = calcularSugestoesDistribuicao(rows, state.metaEstimativa);
    const resumo = fechamentoResumo(rows.filter(row => Number(row.meta_tons || 0) > 0));

    return `
      <div class="metas-table-card">
        <div class="metas-table-top">
          <h2>Configurar Metas por Coordenação</h2>
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
            <span class="metas-pill ${fechado ? 'good' : ''}">${fechado ? 'Mês fechado' : 'Cadastro em lista'}</span>
            <input type="file" accept=".xlsx,.xls" data-metas-auditoria-file hidden />
            <button class="metas-btn secondary metas-auditoria-btn ${(state.auditoria || []).length ? 'is-ready' : 'is-pending'}" type="button" data-metas-auditoria aria-label="${(state.auditoria || []).length ? 'Auditoria anexada' : 'Auditoria pendente'}" ${fechado ? 'disabled' : ''}>Auditoria</button>
          </div>
        </div>

        <div class="metas-suggest-card">
          <div class="metas-field">
            <label>Valor estimado do mês</label>
            <input class="metas-edit-input" data-metas-estimativa type="number" step="0.01" min="0" value="${escapeHtml(state.metaEstimativa)}" placeholder="Ex.: 1000000" ${fechado ? 'disabled' : ''} />
            <p class="metas-config-hint">
              Clique em "Sugerir distribuição" para projetar automaticamente a produção do mês com base nos dias úteis decorridos. O total calculado será preenchido aqui e distribuído proporcionalmente por coordenação. Você também pode informar um valor manualmente antes de clicar.
            </p>
          </div>
          <button class="metas-btn secondary" type="button" data-metas-suggest ${fechado ? 'disabled' : ''}>Sugerir distribuição</button>
          <button class="metas-btn" type="button" data-metas-save-list ${fechado ? 'disabled' : ''}>Salvar lista</button>
        </div>

        <div style="padding:14px 16px;border-bottom:1px solid var(--metas-border)">
          <div class="metas-section-title" style="margin-bottom:10px">
            <h2>Despesas por Regional — M-1 (${(() => { const m = mesAnterior(state.ano, state.mes); return `${getMonthName(m.mes)}/${m.ano}`; })()})</h2>
            <span class="metas-pill ${state.custosRegional.length ? 'good' : ''}">${state.custosRegional.length ? `${state.custosRegional.length} regionais` : 'aguardando upload'}</span>
          </div>
          ${state.custosRegional.length ? `
          <div class="metas-table-wrap">
            <table class="metas-table">
              <thead><tr><th>Coordenação</th><th class="num">Total Regional</th><th class="num">Rateio GERAL</th><th class="num">Total c/ Rateio</th></tr></thead>
              <tbody>
                ${state.custosRegional.map(c => {
                  const fmtBRL = v => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
                  return `<tr>
                    <td><strong>${escapeHtml(c.coordenacao || '')}</strong></td>
                    <td class="num">${fmtBRL(c.total_coordenacao)}</td>
                    <td class="num" style="color:var(--metas-muted)">${fmtBRL(c.rateio)}</td>
                    <td class="num" style="color:#86efac;font-weight:800">${fmtBRL(c.total_com_rateio)}</td>
                  </tr>`;
                }).join('')}
              </tbody>
            </table>
          </div>` : `<p class="metas-config-hint">Carregue o <strong>Relatório de Despesas</strong> no módulo de Relatórios para popular automaticamente. Os dados são usados para calcular o componente de custo (30%) do bônus.</p>`}
        </div>

        <div class="metas-close-panel">
          <div>
            <div class="metas-close-title">Fechamento da meta de ${getMonthName(state.mes)}/${state.ano}</div>
            <div class="metas-close-sub">
              Ao fechar, o painel marca cada coordenação como <strong>atingiu</strong> ou <strong>não atingiu</strong> e bloqueia novas alterações da meta cadastrada para o mês selecionado.
            </div>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <button class="metas-btn ${fechado ? 'secondary' : ''}" type="button" data-metas-close ${fechado ? 'disabled' : ''}>
              ${fechado ? 'Meta fechada' : 'Fechar meta'}
            </button>
            ${fechado ? `
            <button class="metas-btn danger" type="button" data-metas-reopen title="Reabre o período e limpa os resultados calculados no fechamento">
              Reverter fechamento
            </button>` : ''}
            ${fechado && rows.some(r => r.qualifica_bonus) ? `
            <button class="metas-btn secondary" type="button" data-metas-baixar-bonus>
              Exportar relatório de bônus (XLS)
            </button>` : ''}
          </div>
        </div>

        <div class="metas-table-wrap">
          <table class="metas-table">
            <thead>
              <tr>
                <th>Estado</th>
                <th>Coordenação</th>
                <th class="num">Produção atual</th>
                <th class="num">Sugestão</th>
                <th class="num">Meta cadastrada</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              ${
                rows.length
                  ? rows.map(row => {
                    const key = rowKey(row);
                    const sugestao = sugestoes.get(key) || 0;
                    const metaAtual = Number(row.meta_tons || 0);
                    const inputValue = state.metaEstimativa ? toInputNumber(sugestao) : toInputNumber(metaAtual);
                    const status = getRowStatus(row);
                    return `
                      <tr data-metas-meta-row data-key="${escapeHtml(key)}">
                        <td>
                          <input class="metas-edit-input" data-meta-field="estado" value="${escapeHtml(row.estado || '')}" placeholder="UF/Estado" ${fechado ? 'disabled' : ''} />
                        </td>
                        <td>
                          <strong>${escapeHtml(row.regional || '')}</strong>
                          <input type="hidden" data-meta-field="regional" value="${escapeHtml(row.regional || '')}" />
                          <div class="metas-mini">Base: Produção Diária · Tons</div>
                        </td>
                        <td class="num">${fmtTons(row.produzido_tons)}</td>
                        <td class="num">${state.metaEstimativa ? fmtTons(sugestao) : '—'}</td>
                        <td class="num">
                          <input class="metas-edit-input" data-meta-field="meta_tons" type="number" step="0.01" min="0" value="${escapeHtml(inputValue)}" ${fechado ? 'disabled' : ''} />
                        </td>
                        <td><span class="metas-pill ${status === 'ATINGIU' ? 'good' : status === 'NAO_ATINGIU' ? 'bad' : 'warn'}">${status === 'ATINGIU' ? 'Atingiu' : status === 'NAO_ATINGIU' ? 'Não atingiu' : 'Sem meta'}</span></td>
                      </tr>
                    `;
                  }).join('')
                  : `<tr><td colspan="6"><div class="metas-empty">Nenhuma coordenação encontrada. Importe o Resultado Diário ou cadastre uma meta manualmente.</div></td></tr>`
              }
            </tbody>
          </table>
        </div>
      </div>

      <div class="metas-table-card metas-section-spacer">
        <div class="metas-table-top">
          <h2>Resumo do Fechamento</h2>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <span class="metas-pill">${resumo.atingiram.length} atingiram · ${resumo.naoAtingiram.length} não atingiram</span>
            ${resumo.atingiram.filter(r => r.qualifica_bonus).length ? `<span class="metas-pill good">${resumo.atingiram.filter(r => r.qualifica_bonus).length} recebem bônus</span>` : ''}
          </div>
        </div>
        <div class="metas-table-wrap">
          <table class="metas-table">
            <thead>
              <tr>
                <th>Situação</th>
                <th>Coordenação</th>
                <th>Gestor</th>
                <th class="num">Meta</th>
                <th class="num">Produzido</th>
                <th class="num">%</th>
                <th class="num">Bônus (produção)</th>
              </tr>
            </thead>
            <tbody>
              ${[...resumo.atingiram, ...resumo.naoAtingiram].length
                ? [...resumo.atingiram.map(row => ({ ...row, label: 'Atingiu' })), ...resumo.naoAtingiram.map(row => ({ ...row, label: 'Não atingiu' }))].map(row => {
                    const bonus = Number(row.bonus_producao || 0);
                    const fmtBRL = v => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
                    return `
                      <tr>
                        <td><span class="metas-pill ${row.label === 'Atingiu' ? 'good' : 'bad'}">${row.label}</span></td>
                        <td><strong>${escapeHtml(row.regional)}</strong></td>
                        <td>${row.gestor ? escapeHtml(row.gestor) : '<span style="color:var(--metas-muted)">—</span>'}</td>
                        <td class="num">${fmtTons(row.meta_tons)}</td>
                        <td class="num">${fmtTons(row.produzido_tons || row.produzido_fechamento)}</td>
                        <td class="num">${fmtPct(row.percentual_atingido || row.percentual_fechamento)}</td>
                        <td class="num">${row.qualifica_bonus && bonus > 0 ? `<span style="color:#86efac;font-weight:800">${fmtBRL(bonus)}</span>` : '<span style="color:var(--metas-muted)">—</span>'}</td>
                      </tr>
                    `;
                  }).join('')
                : `<tr><td colspan="7"><div class="metas-empty">Ainda não há metas cadastradas para gerar o resumo de fechamento.</div></td></tr>`}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  function renderMainContent(state) {
    if (state.erro) {
      return `<div class="metas-error"><strong>Erro ao carregar metas:</strong><br>${escapeHtml(state.erro)}</div>`;
    }

    if (state.tab === 'regionais') {
      return `
        ${renderKpis(state.regionais)}
        ${renderBars('Corrida de produção por regional', 'Ranking por toneladas classificadas', state.regionais, 'regional', 'produzido_tons', 20)}
        ${renderRegionalTable(state.regionais)}
      `;
    }

    if (state.tab === 'estados') {
      return `
        ${renderBars('Comparativo por Estado', 'Estados com uma ou mais regionais', state.estados, 'estado', 'produzido_tons', 20)}
        ${renderEstadoTable(state.estados)}
      `;
    }

    if (state.tab === 'historico') {
      return renderHistoricoTable(state.mensal);
    }

    if (state.tab === 'gestores') {
      return renderGestores(state);
    }

    if (state.tab === 'configurar') {
      return renderCadastroMetas(state);
    }

    return `
      ${renderKpis(state.regionais)}
      ${renderProgress(state.regionais)}
      ${renderBars('Produção por Estado', 'Produção consolidada por estado', state.estados, 'estado', 'produzido_tons', 20)}
      ${renderRegionalTable(state.regionais)}
    `;
  }

  function render(container, state) {
    const estados = uniqueSorted([
      ...state.regionais.map(r => r.estado),
      ...state.estados.map(r => r.estado),
      ...state.metasCadastro.map(r => r.estado)
    ]);

    const regionais = uniqueSorted([
      ...state.regionais.map(r => r.regional),
      ...state.metasCadastro.map(r => r.regional)
    ]);

    const years = [];
    const currentYear = new Date().getFullYear();
    for (let y = currentYear - 2; y <= currentYear + 2; y++) years.push(y);

    const fechado = isMonthClosed(state);
    const tabAtiva = findTabMeta(state.tab);

    container.innerHTML = `
      <div class="metas-page ${state.loading ? 'metas-loading' : ''}">
        <div class="metas-header">
          <div class="metas-title-wrap">
            <div class="metas-title-row">
              <h1>Metas de Produção</h1>
              <span class="metas-period-chip ${fechado ? 'is-closed' : 'is-open'}" title="${fechado ? 'O período já foi fechado: valores de bônus calculados e alterações bloqueadas.' : 'O período ainda está aberto para cadastro e ajustes.'}">
                <span class="metas-period-chip-dot"></span>
                ${escapeHtml(getMonthName(state.mes))}/${state.ano} · ${fechado ? 'Período fechado' : 'Período em aberto'}
              </span>
            </div>
            <p>
              Acompanhamento mensal da meta por regional e estado.
              Produção considerada: <strong>Relatório Resultado Diário</strong>, coluna <strong>Toneladas</strong>.
            </p>
          </div>
          <div class="metas-actions">
            <button class="metas-btn secondary" type="button" data-metas-back>Voltar</button>
            <button class="metas-btn" type="button" data-metas-refresh>↻ Atualizar</button>
          </div>
        </div>

        <div class="metas-filter-card">
          <div class="metas-filters">
            <div class="metas-field">
              <label>Mês</label>
              <select data-metas-filter="mes">
                ${MONTHS.map(m => `<option value="${m.value}" ${Number(state.mes) === Number(m.value) ? 'selected' : ''}>${m.label}</option>`).join('')}
              </select>
            </div>

            <div class="metas-field">
              <label>Ano</label>
              <select data-metas-filter="ano">
                ${years.map(y => `<option value="${y}" ${Number(state.ano) === y ? 'selected' : ''}>${y}</option>`).join('')}
              </select>
            </div>

            <div class="metas-field">
              <label>Estado</label>
              <select data-metas-filter="estado">
                ${buildOptions(estados, state.estado, 'Todos os estados')}
              </select>
            </div>

            <div class="metas-field">
              <label>Regional</label>
              <select data-metas-filter="regional">
                ${buildOptions(regionais, state.regional, 'Todas as regionais')}
              </select>
            </div>

            <button class="metas-btn" type="button" data-metas-apply>Aplicar filtros</button>
          </div>
        </div>

        <nav class="metas-nav" aria-label="Seções de Metas">
          ${TAB_GROUPS.map(group => `
            <div class="metas-nav-group">
              <span class="metas-nav-group-label">${escapeHtml(group.label)}</span>
              <div class="metas-nav-group-tabs" role="tablist">
                ${group.tabs.map(t => `
                  <button type="button"
                          class="metas-tab ${state.tab === t.id ? 'active' : ''}"
                          data-metas-tab="${t.id}"
                          role="tab"
                          aria-selected="${state.tab === t.id ? 'true' : 'false'}"
                          title="${escapeHtml(t.desc)}">
                    ${tabIconMarkup(t.id)}
                    <span>${escapeHtml(t.label)}</span>
                  </button>
                `).join('')}
              </div>
            </div>
          `).join('')}
        </nav>
        ${tabAtiva ? `<p class="metas-nav-desc">${escapeHtml(tabAtiva.desc)}</p>` : ''}

        <div data-metas-content>
          ${renderMainContent(state)}
        </div>
      </div>
    `;
  }

export { render };
