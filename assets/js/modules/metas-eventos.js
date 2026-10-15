// Metas — ligação dos eventos da tela.
// Extraído de modules/metas.js em 15/10/2026 (era um único bloco autoexecutável de ~3.300 linhas).
// O código das funções e constantes foi movido sem alteração. Para publicar uma mudança em qualquer
// módulo metas-*.js, troque o token ?v=20261015-metas1 em TODOS os imports internos e no carregador
// (assets/js/metas.js): tests/metas-modulos-versao.test.mjs garante que fiquem iguais.
import { mergeCoordenacoes, projetarProducaoMes } from './metas-calculo.js?v=20261015-metas1';
import { loadData, salvarMeta, salvarListaMetas } from './metas-dados.js?v=20261015-metas1';
import { render } from './metas-render.js?v=20261015-metas1';
import { baixarRelatorioBonusFechado } from './metas-bonus.js?v=20261015-metas1';
import { importarAuditoria, fecharMetaMes, reverterFechamentoMes } from './metas-fechamento.js?v=20261015-metas1';

  function bindEvents(container, state, supabase, opts) {
    const rerender = () => {
      render(container, state);
      bindEvents(container, state, supabase, opts);
    };

    const reload = async () => {
      await loadData(state, supabase);
      rerender();
    };

    const backBtn = container.querySelector('[data-metas-back]');
    if (backBtn) {
      backBtn.addEventListener('click', () => {
        if (typeof opts.onBack === 'function') opts.onBack();
      });
    }

    const refreshBtn = container.querySelector('[data-metas-refresh]');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', reload);
    }

    const applyBtn = container.querySelector('[data-metas-apply]');
    if (applyBtn) {
      applyBtn.addEventListener('click', async () => {
        const mes = container.querySelector('[data-metas-filter="mes"]');
        const ano = container.querySelector('[data-metas-filter="ano"]');
        const estado = container.querySelector('[data-metas-filter="estado"]');
        const regional = container.querySelector('[data-metas-filter="regional"]');

        state.mes = Number(mes && mes.value ? mes.value : state.mes);
        state.ano = Number(ano && ano.value ? ano.value : state.ano);
        state.estado = estado ? estado.value : '';
        state.regional = regional ? regional.value : '';

        await reload();
      });
    }

    container.querySelectorAll('[data-metas-tab]').forEach(btn => {
      btn.addEventListener('click', () => {
        state.tab = btn.getAttribute('data-metas-tab') || 'geral';
        rerender();
      });
    });

    const estimativa = container.querySelector('[data-metas-estimativa]');
    if (estimativa) {
      estimativa.addEventListener('input', () => {
        state.metaEstimativa = estimativa.value;
      });
    }

    const suggestBtn = container.querySelector('[data-metas-suggest]');
    if (suggestBtn) {
      suggestBtn.addEventListener('click', () => {
        const input = container.querySelector('[data-metas-estimativa]');
        state.metaEstimativa = input ? input.value : state.metaEstimativa;

        if (!Number(state.metaEstimativa || 0)) {
          const rows = mergeCoordenacoes(state);
          if (!rows.length) {
            alert('Sem dados de produção disponíveis para gerar sugestão.');
            return;
          }
          const projecao = projetarProducaoMes(rows, Number(state.ano), Number(state.mes));
          if (!projecao) {
            alert('Sem produção registrada no mês. Informe o valor estimado manualmente ou importe o Resultado Diário.');
            return;
          }
          state.metaEstimativa = String(projecao);
          if (input) input.value = state.metaEstimativa;
        }

        rerender();
      });
    }

    const saveListBtn = container.querySelector('[data-metas-save-list]');
    if (saveListBtn) {
      saveListBtn.addEventListener('click', async () => {
        await salvarListaMetas(container, state, supabase, rerender);
      });
    }

    const closeBtn = container.querySelector('[data-metas-close]');
    if (closeBtn) {
      closeBtn.addEventListener('click', async () => {
        await fecharMetaMes(state, supabase, rerender);
      });
    }

    const reopenBtn = container.querySelector('[data-metas-reopen]');
    if (reopenBtn) {
      reopenBtn.addEventListener('click', async () => {
        await reverterFechamentoMes(state, supabase, rerender, reopenBtn);
      });
    }

    const baixarBonusBtn = container.querySelector('[data-metas-baixar-bonus]');
    if (baixarBonusBtn) {
      baixarBonusBtn.addEventListener('click', async () => {
        baixarBonusBtn.disabled = true;
        const original = baixarBonusBtn.textContent;
        baixarBonusBtn.textContent = 'Gerando...';
        try {
          await baixarRelatorioBonusFechado(state, supabase);
        } catch (e) {
          console.error('[METAS] Erro ao gerar relatório de bônus:', e);
          alert('Erro ao gerar relatório de bônus: ' + (e?.message || e));
        } finally {
          baixarBonusBtn.disabled = false;
          baixarBonusBtn.textContent = original;
        }
      });
    }

    const form = container.querySelector('[data-metas-form]');
    if (form) {
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        await salvarMeta(form, state, supabase, rerender);
      });
    }

    // ── Auditoria ─────────────────────────────────────────────────────────
    const auditoriaBtn = container.querySelector('[data-metas-auditoria]');
    const auditoriaFile = container.querySelector('[data-metas-auditoria-file]');
    if (auditoriaBtn && auditoriaFile) {
      auditoriaBtn.addEventListener('click', () => auditoriaFile.click());
      auditoriaFile.addEventListener('change', async () => {
        const file = auditoriaFile.files?.[0];
        if (file) await importarAuditoria(file, state, supabase, reload);
        auditoriaFile.value = '';
      });
    }

    // ── Gestores ──────────────────────────────────────────────────────────
    const gestorAddBtn = container.querySelector('[data-metas-gestor-add]');
    if (gestorAddBtn) {
      gestorAddBtn.addEventListener('click', () => {
        const f = document.getElementById('metasGestorAddForm');
        if (f) f.style.display = f.style.display === 'none' ? 'block' : 'none';
      });
    }

    const gestorCancelBtn = container.querySelector('[data-metas-gestor-cancel]');
    if (gestorCancelBtn) {
      gestorCancelBtn.addEventListener('click', () => {
        const f = document.getElementById('metasGestorAddForm');
        if (f) f.style.display = 'none';
      });
    }

    const gestorSaveNewBtn = container.querySelector('[data-metas-gestor-save-new]');
    if (gestorSaveNewBtn) {
      gestorSaveNewBtn.addEventListener('click', async () => {
        const coord = document.getElementById('mgfCoord')?.value?.trim().toUpperCase();
        const gestor = document.getElementById('mgfGestor')?.value?.trim().toUpperCase();
        const sup = document.getElementById('mgfSup')?.value?.trim() || null;
        const sal = Number(document.getElementById('mgfSalario')?.value || 0) || null;
        const grat = Number(document.getElementById('mgfGrat')?.value || 0) || null;
        if (!coord || !gestor) { alert('Coordenação e Gestor são obrigatórios.'); return; }
        const { error } = await supabase.from('metas_gestores').insert({ coordenacao: coord, gestor, supervisao: sup, salario: sal, grat40: grat, ativo: true, updated_at: new Date().toISOString() });
        if (error) { alert('Erro: ' + error.message); return; }
        await reload();
      });
    }

    const gestorCancelEditBtn = container.querySelector('[data-metas-gestor-cancel-edit]');
    if (gestorCancelEditBtn) {
      gestorCancelEditBtn.addEventListener('click', () => { state.gestoresEditId = null; rerender(); });
    }

    container.querySelectorAll('[data-metas-gestor-edit]').forEach(btn => {
      btn.addEventListener('click', () => { state.gestoresEditId = btn.dataset.metasGestorEdit; rerender(); });
    });

    container.querySelectorAll('[data-metas-gestor-save-edit]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = Number(btn.dataset.metasGestorSaveEdit);
        const tr = btn.closest('[data-metas-gestor-row]');
        if (!tr) return;
        const gf = f => tr.querySelector(`[data-gf="${f}"]`)?.value?.trim();
        const coord = gf('coordenacao')?.toUpperCase();
        const gestor = gf('gestor')?.toUpperCase();
        if (!coord || !gestor) { alert('Coordenação e Gestor são obrigatórios.'); return; }
        const { error } = await supabase.from('metas_gestores').update({
          coordenacao: coord,
          gestor,
          supervisao: gf('supervisao') || null,
          salario: Number(tr.querySelector('[data-gf="salario"]')?.value || 0) || null,
          grat40: Number(tr.querySelector('[data-gf="grat40"]')?.value || 0) || null,
          updated_at: new Date().toISOString()
        }).eq('id', id);
        if (error) { alert('Erro: ' + error.message); return; }
        state.gestoresEditId = null;
        await reload();
      });
    });

    container.querySelectorAll('[data-metas-gestor-del]').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('Excluir este gestor?')) return;
        const id = Number(btn.dataset.metasGestorDel);
        const { error } = await supabase.from('metas_gestores').update({ ativo: false, updated_at: new Date().toISOString() }).eq('id', id);
        if (error) { alert('Erro: ' + error.message); return; }
        await reload();
      });
    });
  }

export { bindEvents };
