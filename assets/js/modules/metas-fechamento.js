// Metas — fechar/reverter o mês, importar auditoria e os modais correspondentes.
// Extraído de modules/metas.js em 15/10/2026 (era um único bloco autoexecutável de ~3.300 linhas).
// O código das funções e constantes foi movido sem alteração. Para publicar uma mudança em qualquer
// módulo metas-*.js, troque o token ?v=20261015-metas1 em TODOS os imports internos e no carregador
// (assets/js/metas.js): tests/metas-modulos-versao.test.mjs garante que fiquem iguais.
import * as XLSX from 'https://cdn.sheetjs.com/xlsx-0.20.2/package/xlsx.mjs';
import { escapeHtml, fmtPct, pctClass, fetchAllRows, getMonthName, normalizarTexto, getMonthRange } from './metas-util.js?v=20261015-metas1';
import { rowKey, isMonthClosed, mergeCoordenacoes } from './metas-calculo.js?v=20261015-metas1';
import { loadData, enrichGestoresParaFechamento } from './metas-dados.js?v=20261015-metas1';
import { gerarRelatorioBonusXlsx, montarDadosCartaoBonus, gerarImagensBonusPorGestor } from './metas-bonus.js?v=20261015-metas1';

  function showFecharMetaModal(state, rows, gestoresEnriq, onConfirm) {
    const existing = document.getElementById('metas-fechar-modal-overlay');
    if (existing) existing.remove();

    const fmtBRL = v => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const fmtF   = v => Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 4, maximumFractionDigits: 4 });

    const percByKey = new Map(rows.map(row => {
      const meta = Number(row.meta_tons || 0);
      const prod = Number(row.produzido_tons || 0);
      return [rowKey(row), meta > 0 ? (prod / meta) * 100 : 0];
    }));
    const metaProdByKey = new Map(rows.map(row => [rowKey(row), {
      metaTons: Number(row.meta_tons || 0),
      produzidoTons: Number(row.produzido_tons || 0)
    }]));
    const auditoriaByKey = new Map((state.auditoria || []).map(row => [normalizarTexto(row.regional), row]));

    // Enriquece com % regional e calcula produção
    const gestores = gestoresEnriq.map(g => {
      const pct = percByKey.has(g._key) ? percByKey.get(g._key) : null;
      const valorProducao = pct !== null ? (pct / 100) * g.bonusInicial * 0.4 : 0;
      const auditoria = auditoriaByKey.get(g._key) || null;
      return { ...g, pct, valorProducao, auditoria, auditoriaApta: auditoria ? auditoria.apto !== false : true };
    });

    const comGestor = new Set(gestores.map(g => g._key));
    const semGestor = rows.filter(r => !comGestor.has(rowKey(r)));
    const semDespesa = gestores.some(g => !g.temDespesas);

    const overlay = document.createElement('div');
    overlay.id = 'metas-fechar-modal-overlay';
    overlay.className = 'metas-modal-overlay';

    overlay.innerHTML = `
      <div class="metas-modal" style="max-width:1100px">
        <div class="metas-modal-header">
          <h3>Fechar Meta — ${escapeHtml(getMonthName(state.mes))}/${state.ano}</h3>
          <p>Bônus calculado com três componentes (Produção 40% · Custo 30% · Leitura 30%) usando dados de M-1 (${escapeHtml(gestores[0]?.m1Ref || '')}).</p>
        </div>
        <div class="metas-modal-threshold">
          <div class="metas-field" style="max-width:280px">
            <label>Percentual mínimo para receber bônus (%)</label>
            <input class="metas-edit-input" id="metasMinPercInput" type="number" min="0" max="200" step="1" value="100" placeholder="Ex.: 90" />
            <p class="metas-config-hint">Regionais com % atingido ≥ esse valor — todos os gestores vinculados recebem bônus.</p>
          </div>
        </div>
        ${semDespesa ? `<div class="metas-error" style="padding:10px 14px;font-size:12px;margin-bottom:0">
          <strong>Custo:</strong> Sem despesas cadastradas para M-1. Cadastre na aba <strong>Configurar / Fechar → Custos</strong> para incluir o componente de custo (30%). O bônus será calculado sem esse componente.
        </div>` : ''}
        ${gestores.length ? `
          <div class="metas-table-wrap">
            <table class="metas-table" style="min-width:1000px">
              <thead>
                <tr>
                  <th>Gestor</th>
                  <th>Coordenação / Supervisão</th>
                  <th class="num">% Regional</th>
                  <th class="num">Auditoria</th>
                  <th class="num">Qualifica</th>
                  <th class="num">B. Inicial</th>
                  <th class="num" title="Produção 40%">Prod (40%)</th>
                  <th class="num" title="Custo 30%">Custo (30%)</th>
                  <th class="num" title="Leitura 30%">Leitura (30%)</th>
                  <th class="num" style="color:#86efac">Total</th>
                </tr>
              </thead>
              <tbody>
                ${gestores.map(g => {
                  const total = g.valorProducao + g.valorCusto + g.valorLeitura;
                  return `
                    <tr data-metas-bonus-row
                        data-gestor-id="${escapeHtml(String(g.id))}"
                        data-key="${escapeHtml(g._key)}"
                        data-percentual="${(g.pct ?? 0).toFixed(6)}"
                        data-auditoria-apta="${g.auditoriaApta ? '1' : '0'}"
                        data-valor-producao="${g.valorProducao.toFixed(6)}"
                        data-valor-custo="${g.valorCusto.toFixed(6)}"
                        data-valor-leitura="${g.valorLeitura.toFixed(6)}"
                        data-bonus-total="${total.toFixed(6)}">
                      <td><strong>${escapeHtml(g.gestor || '')}</strong></td>
                      <td>
                        <div>${escapeHtml(g.coordenacao || '')}</div>
                        <div style="font-size:11px;color:var(--metas-muted)">${escapeHtml(g.supervisao || '—')}</div>
                      </td>
                      <td class="num">${g.pct !== null ? `<span class="metas-pill ${pctClass(g.pct)}">${fmtPct(g.pct)}</span>` : '<span class="metas-pill">sem meta</span>'}</td>
                      <td class="num">${g.auditoria ? `<span class="metas-pill ${g.auditoriaApta ? 'good' : 'bad'}">${g.auditoriaApta ? 'Dentro do limite' : 'Acima do limite'}</span>` : '<span class="metas-pill">não anexada</span>'}</td>
                      <td class="num" data-metas-qualifica-cell>—</td>
                      <td class="num" style="font-size:11px">${fmtBRL(g.bonusInicial)}</td>
                      <td class="num" data-bonus-cell-prod style="font-size:11px">—</td>
                      <td class="num" data-bonus-cell-custo style="font-size:11px">${g.valorCusto > 0 ? `<span title="Fator: ${fmtF(g.fatorCusto)}">${fmtBRL(g.valorCusto)}</span>` : '<span style="color:var(--metas-muted)">sem dado</span>'}</td>
                      <td class="num" data-bonus-cell-leitura style="font-size:11px">${g.leituraPct !== null ? `<span title="${fmtPct(g.leituraPct ?? 0)} · mult ${g.multLeitura}x">${fmtBRL(g.valorLeitura)}</span>` : '<span style="color:var(--metas-muted)">sem dado</span>'}</td>
                      <td class="num" data-bonus-cell-total style="font-weight:800">—</td>
                    </tr>`;
                }).join('')}
              </tbody>
            </table>
          </div>` : `<div class="metas-empty">Nenhum gestor cadastrado. Acesse a aba <strong>Gestores</strong>.</div>`}
        ${semGestor.length ? `<div class="metas-error" style="padding:10px 14px;font-size:12px;margin-top:0">
          <strong>Regionais sem gestor:</strong> ${semGestor.map(r => escapeHtml(r.regional || '')).join(', ')}
        </div>` : ''}
        <div class="metas-modal-footer">
          <button class="metas-btn secondary" type="button" id="metasFecharCancelar">Cancelar</button>
          <button class="metas-btn" type="button" id="metasFecharConfirmar">Confirmar Fechamento</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const minInput = overlay.querySelector('#metasMinPercInput');

    function updateBadges() {
      const min = Number(minInput.value || 100);
      overlay.querySelectorAll('[data-metas-bonus-row]').forEach(tr => {
        const pct      = Number(tr.dataset.percentual    || 0);
        const vProd    = Number(tr.dataset.valorProducao  || 0);
        const vCusto   = Number(tr.dataset.valorCusto     || 0);
        const vLeitura = Number(tr.dataset.valorLeitura   || 0);
        const qualifica = pct >= min && tr.dataset.auditoriaApta !== '0';
        const total = qualifica ? vProd + vCusto + vLeitura : 0;

        const qc = tr.querySelector('[data-metas-qualifica-cell]');
        if (qc) qc.innerHTML = qualifica ? '<span class="metas-pill good">Qualifica</span>' : '<span class="metas-pill bad">Não qualifica</span>';

        const setCell = (sel, val, color) => {
          const c = tr.querySelector(sel);
          if (!c) return;
          if (qualifica && val > 0) { c.innerHTML = `<span style="color:${color};font-weight:800">${fmtBRL(val)}</span>`; }
          else if (!qualifica) { c.innerHTML = '<span style="color:#6b7280">—</span>'; }
        };
        setCell('[data-bonus-cell-prod]',  vProd,    '#86efac');
        setCell('[data-bonus-cell-total]', total,    '#86efac');
      });
    }

    minInput.addEventListener('input', updateBadges);
    updateBadges();

    overlay.querySelector('#metasFecharCancelar').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

    overlay.querySelector('#metasFecharConfirmar').addEventListener('click', () => {
      const min = Number(minInput.value || 100);
      const gestoresBonus = [];
      overlay.querySelectorAll('[data-metas-bonus-row]').forEach(tr => {
        const pct = Number(tr.dataset.percentual || 0);
        const qualifica = pct >= min && tr.dataset.auditoriaApta !== '0';
        const mp = metaProdByKey.get(tr.dataset.key) || { metaTons: 0, produzidoTons: 0 };
        gestoresBonus.push({
          coordenacaoKey: tr.dataset.key,
          gestorId: Number(tr.dataset.gestorId),
          qualifica,
          pct,
          metaTons: mp.metaTons,
          produzidoTons: mp.produzidoTons,
          bonusProducao: qualifica ? Number(tr.dataset.valorProducao  || 0) : 0,
          bonusCusto:    qualifica ? Number(tr.dataset.valorCusto     || 0) : 0,
          bonusLeitura:  qualifica ? Number(tr.dataset.valorLeitura   || 0) : 0
        });
      });
      overlay.remove();
      onConfirm({ percentualMinimo: min, gestoresBonus });
    });
  }

  function pedirPercentualAuditoria(nomeArquivo) {
    return new Promise(resolve => {
      const overlay = document.createElement('div');
      overlay.className = 'metas-modal-overlay';
      overlay.innerHTML = `<div class="metas-modal" style="max-width:520px"><div class="metas-modal-header"><h3>Configurar auditoria</h3><p>${escapeHtml(nomeArquivo)}</p></div><div class="metas-field"><label>Qual o percentual de auditoria será considerado?</label><input class="metas-edit-input" type="number" min="0" max="100" step="0.01" value="1" data-auditoria-percentual /><p class="metas-config-hint">O limite será calculado sobre o Total Embarcado de cada regional.</p></div><div class="metas-modal-footer"><button class="metas-btn secondary" type="button" data-cancelar>Cancelar</button><button class="metas-btn" type="button" data-confirmar>Aplicar auditoria</button></div></div>`;
      document.body.appendChild(overlay);
      const finish = value => { overlay.remove(); resolve(value); };
      overlay.querySelector('[data-cancelar]').onclick = () => finish(null);
      overlay.querySelector('[data-confirmar]').onclick = () => {
        const value = Number(overlay.querySelector('[data-auditoria-percentual]').value);
        if (!Number.isFinite(value) || value < 0 || value > 100) return alert('Informe um percentual entre 0 e 100.');
        finish(value);
      };
    });
  }

  async function importarAuditoria(file, state, supabase, reload) {
    const percentual = await pedirPercentualAuditoria(file.name);
    if (percentual === null) return;
    const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const dados = XLSX.utils.sheet_to_json(sheet, { defval: null });
    const auditoria = new Map();
    dados.forEach(row => {
      const regional = String(row['Coordenação'] ?? row['Coordenacao'] ?? '').trim();
      const valor = Number(row.Total || 0);
      if (!regional || normalizarTexto(regional) === 'total geral' || !Number.isFinite(valor)) return;
      const key = normalizarTexto(regional);
      auditoria.set(key, { regional, valor: (auditoria.get(key)?.valor || 0) + valor });
    });
    if (!auditoria.size) return alert('A planilha precisa conter as colunas Coordenação e Total.');

    const range = getMonthRange(Number(state.ano), Number(state.mes));
    const embarques = await fetchAllRows(supabase.from('relatorio_resultado_diario').select('coordenacao,embarcado,data').gte('data', range.start).lt('data', range.next));
    const totalEmbarcado = new Map();
    embarques.forEach(row => {
      const key = normalizarTexto(row.coordenacao);
      totalEmbarcado.set(key, (totalEmbarcado.get(key) || 0) + Number(row.embarcado || 0));
    });
    const now = new Date().toISOString();
    const payload = Array.from(auditoria.entries()).map(([key, item]) => {
      const embarcado = totalEmbarcado.get(key) || 0;
      const limite = embarcado * (percentual / 100);
      return { ano: Number(state.ano), mes: Number(state.mes), regional: item.regional, valor_auditoria: item.valor, total_embarcado: embarcado, percentual_limite: percentual, apto: item.valor <= limite, nome_arquivo: file.name, updated_at: now };
    });
    const { error } = await supabase.from('metas_auditoria').upsert(payload, { onConflict: 'ano,mes,regional' });
    if (error) return alert('Erro ao salvar auditoria: ' + error.message);
    alert(`Auditoria aplicada em ${payload.length} regionais. ${payload.filter(r => !r.apto).length} ficaram acima do limite.`);
    await reload();
  }

  async function fecharMetaMes(state, supabase, rerender) {
    if (isMonthClosed(state)) {
      alert('A meta deste mês já está fechada.');
      return;
    }

    const rows = mergeCoordenacoes(state).filter(row => Number(row.meta_tons || 0) > 0);
    if (!rows.length) {
      alert('Cadastre as metas do mês antes de fechar.');
      return;
    }

    const gestoresEnriq = await enrichGestoresParaFechamento(state, supabase, Number(state.ano), Number(state.mes));

    showFecharMetaModal(state, rows, gestoresEnriq, async (params) => {
      const now = new Date().toISOString();

      // Agrupa bonus por regional (soma todos gestores qualificados)
      const bonusByKey = new Map();
      for (const gb of (params.gestoresBonus || [])) {
        const k = gb.coordenacaoKey;
        if (!bonusByKey.has(k)) bonusByKey.set(k, { prod: 0, custo: 0, leitura: 0, qualifica: false });
        if (gb.qualifica) {
          bonusByKey.get(k).prod    += gb.bonusProducao;
          bonusByKey.get(k).custo   += gb.bonusCusto;
          bonusByKey.get(k).leitura += gb.bonusLeitura;
          bonusByKey.get(k).qualifica = true;
        }
      }

      const payloads = rows.map(row => {
        const meta = Number(row.meta_tons || 0);
        const produzido = Number(row.produzido_tons || 0);
        const percentual = meta > 0 ? (produzido / meta) * 100 : 0;
        const key = rowKey(row);
        const b = bonusByKey.get(key) || { prod: 0, custo: 0, leitura: 0, qualifica: false };

        return {
          ano: Number(state.ano),
          mes: Number(state.mes),
          estado: String(row.estado || '').trim().toUpperCase(),
          regional: String(row.regional || '').trim(),
          meta_tons: meta,
          ativo: true,
          fechado: true,
          fechado_em: now,
          status_fechamento: produzido >= meta ? 'ATINGIU' : 'NAO_ATINGIU',
          produzido_fechamento: produzido,
          percentual_fechamento: percentual,
          bonus_percentual_minimo: params.percentualMinimo || 100,
          bonus_producao: b.prod,
          bonus_custo:    b.custo,
          bonus_leitura:  b.leitura,
          bonus_total:    b.prod + b.custo + b.leitura,
          qualifica_bonus: b.qualifica,
          updated_at: now
        };
      });

      const { error } = await supabase
        .from('metas_producao')
        .upsert(payloads, { onConflict: 'ano,mes,regional' });

      if (error) {
        console.error('[METAS] Erro ao fechar meta:', error);
        alert('Erro ao fechar meta: ' + error.message + '\n\nExecute a migration 20260603_metas_bonus_fields.sql no Supabase Dashboard.');
        return;
      }

      try {
        gerarRelatorioBonusXlsx(state, gestoresEnriq, params.gestoresBonus);
      } catch (e) {
        console.error('[METAS] Erro ao gerar relatório de bônus:', e);
        alert('Meta fechada com sucesso, mas houve um erro ao gerar o XLS de bônus: ' + (e?.message || e) + '\n\nVocê pode gerar o relatório novamente pelo botão "Exportar relatório de bônus (XLS)".');
      }

      try {
        const dadosGestores = montarDadosCartaoBonus(gestoresEnriq, params.gestoresBonus, state);
        await gerarImagensBonusPorGestor(state, dadosGestores);
      } catch (e) {
        console.error('[METAS] Erro ao gerar imagens de bônus:', e);
        alert('Meta fechada com sucesso, mas houve um erro ao gerar as imagens de bônus: ' + (e?.message || e));
      }

      await loadData(state, supabase);
      rerender();
    });
  }

  async function reverterFechamentoMes(state, supabase, rerender, button) {
    if (!isMonthClosed(state)) {
      alert('A meta deste mês já está aberta.');
      return;
    }

    const periodo = `${getMonthName(state.mes)}/${state.ano}`;
    const confirmado = confirm(
      `Reverter o fechamento de ${periodo}?\n\n` +
      'O período será reaberto para edição. Os status e valores de bônus calculados serão limpos, mas as metas cadastradas serão mantidas.'
    );
    if (!confirmado) return;

    const original = button?.textContent;
    if (button) {
      button.disabled = true;
      button.textContent = 'Revertendo...';
    }

    const { error } = await supabase
      .from('metas_producao')
      .update({
        fechado: false,
        fechado_em: null,
        status_fechamento: null,
        produzido_fechamento: null,
        percentual_fechamento: null,
        bonus_percentual_minimo: null,
        bonus_producao: 0,
        bonus_custo: 0,
        bonus_leitura: 0,
        bonus_total: 0,
        qualifica_bonus: false,
        updated_at: new Date().toISOString()
      })
      .eq('ano', Number(state.ano))
      .eq('mes', Number(state.mes));

    if (error) {
      console.error('[METAS] Erro ao reverter fechamento:', error);
      alert('Erro ao reverter o fechamento: ' + error.message);
      if (button) {
        button.disabled = false;
        button.textContent = original;
      }
      return;
    }

    await loadData(state, supabase);
    rerender();
    alert(`Fechamento de ${periodo} revertido. O período está aberto novamente.`);
  }

export { importarAuditoria, fecharMetaMes, reverterFechamentoMes };
