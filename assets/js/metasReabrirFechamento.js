const INIT_DATASET_KEY = 'metasReabrirFechamentoInit';

function getPeriodoSelecionado(content) {
  return {
    mes: Number(content.querySelector('[data-metas-filter="mes"]')?.value || 0),
    ano: Number(content.querySelector('[data-metas-filter="ano"]')?.value || 0)
  };
}

function periodoEstaFechado(content) {
  const closeBtn = content.querySelector('[data-metas-close]');
  return Boolean(
    content.querySelector('.metas-period-chip.is-closed') ||
    (closeBtn && (closeBtn.disabled || /meta fechada/i.test(closeBtn.textContent || '')))
  );
}

export function initMetasReabrirFechamento(content, supabase) {
  if (!content || !supabase || content.dataset[INIT_DATASET_KEY] === '1') return;
  content.dataset[INIT_DATASET_KEY] = '1';

  const enhance = () => {
    const panel = content.querySelector('.metas-close-panel');
    const currentBtn = content.querySelector('[data-metas-reopen]');

    if (!panel || !periodoEstaFechado(content)) {
      currentBtn?.remove();
      return;
    }

    if (currentBtn) return;

    const closeBtn = panel.querySelector('[data-metas-close]');
    const actionWrap = closeBtn?.parentElement;
    if (!actionWrap) return;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'metas-btn secondary';
    btn.dataset.metasReopen = '';
    btn.textContent = 'Reverter fechamento';
    btn.title = 'Reabre o período e limpa os dados calculados no fechamento, preservando as metas cadastradas.';
    btn.style.cssText = 'color:#fecaca;border-color:rgba(248,113,113,.38);background:rgba(127,29,29,.2)';

    btn.addEventListener('click', async () => {
      const { ano, mes } = getPeriodoSelecionado(content);
      if (!ano || !mes) {
        window.alert('Não foi possível identificar o mês e o ano selecionados.');
        return;
      }

      const monthLabel = content
        .querySelector('[data-metas-filter="mes"] option:checked')
        ?.textContent?.trim() || String(mes);

      const confirmed = window.confirm(
        `Reverter o fechamento de ${monthLabel}/${ano}?\n\n` +
        'O período será reaberto para edição. Os status e valores de bônus calculados no fechamento serão limpos, mas as metas cadastradas serão mantidas.'
      );
      if (!confirmed) return;

      const originalText = btn.textContent;
      btn.disabled = true;
      btn.textContent = 'Revertendo...';

      try {
        const now = new Date().toISOString();
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
            updated_at: now
          })
          .eq('ano', ano)
          .eq('mes', mes);

        if (error) throw error;

        window.alert(`Fechamento de ${monthLabel}/${ano} revertido. O período está aberto novamente.`);

        const refreshBtn = content.querySelector('[data-metas-refresh]');
        if (refreshBtn) refreshBtn.click();
        else window.location.reload();
      } catch (error) {
        console.error('[METAS] Erro ao reverter fechamento:', error);
        window.alert('Erro ao reverter o fechamento: ' + (error?.message || error));
        btn.disabled = false;
        btn.textContent = originalText;
      }
    });

    const exportBtn = actionWrap.querySelector('[data-metas-baixar-bonus]');
    actionWrap.insertBefore(btn, exportBtn || null);
  };

  const observer = new MutationObserver(enhance);
  observer.observe(content, { childList: true, subtree: true });
  queueMicrotask(enhance);
}
