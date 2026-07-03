import { supabase } from './supabaseClient.js';
import { sincronizarPatrimoniosDoAgente } from './patrimoniosAgentSync.js';

const INSTALLED_ATTR = 'data-metas-fechamento-guard';
const SKIP_ATTR = 'data-metas-fechamento-guard-ok';

function pad2(value) {
  return String(value).padStart(2, '0');
}

function mesAnterior(ano, mes) {
  return Number(mes) === 1
    ? { ano: Number(ano) - 1, mes: 12 }
    : { ano: Number(ano), mes: Number(mes) - 1 };
}

function getPeriodoSelecionado(container) {
  const now = new Date();
  const anoEl = container?.querySelector?.('[data-metas-filter="ano"]');
  const mesEl = container?.querySelector?.('[data-metas-filter="mes"]');

  return {
    ano: Number(anoEl?.value || now.getFullYear()),
    mes: Number(mesEl?.value || now.getMonth() + 1),
  };
}

async function temLinha(label, query) {
  try {
    const { data, error } = await query;
    if (error) return { label, ok: false, erro: error.message || String(error) };
    return { label, ok: Array.isArray(data) && data.length > 0, erro: null };
  } catch (error) {
    return { label, ok: false, erro: error?.message || String(error) };
  }
}

async function validarBasesFechamento(container) {
  const { ano, mes } = getPeriodoSelecionado(container);
  const m1 = mesAnterior(ano, mes);
  const m1Inicio = `${m1.ano}-${pad2(m1.mes)}-01`;
  const mesInicio = `${ano}-${pad2(mes)}-01`;

  // Produção do mês já é sincronizada pelo próprio módulo Metas na abertura.
  // Patrimônio é validado/sincronizado somente no fechamento para manter a tela rápida.
  await sincronizarPatrimoniosDoAgente().catch((error) => {
    console.warn('[metas-fechamento-guard] Falha ao sincronizar patrimônios antes do fechamento:', error);
  });

  const checks = await Promise.all([
    temLinha(
      `Resultado Diário M-1 (${pad2(m1.mes)}/${m1.ano})`,
      supabase
        .from('relatorio_resultado_diario')
        .select('coordenacao')
        .gte('data', m1Inicio)
        .lt('data', mesInicio)
        .limit(1)
    ),
    temLinha(
      `Despesas M-1 (${pad2(m1.mes)}/${m1.ano})`,
      supabase
        .from('dre_despesas_mensal')
        .select('coordenacao')
        .eq('ano', m1.ano)
        .eq('mes', m1.mes)
        .limit(1)
    ),
    temLinha(
      'Leitura de patrimônios por supervisão',
      supabase
        .from('v_leitura_supervisao')
        .select('supervisao')
        .limit(1)
    ),
  ]);

  const faltantes = checks.filter((item) => !item.ok);
  if (!faltantes.length) return true;

  const detalhes = faltantes
    .map((item) => `• ${item.label}${item.erro ? ` — ${item.erro}` : ''}`)
    .join('\n');

  alert(
    `Fechamento bloqueado para evitar bônus incompleto.\n\n` +
    `Antes de fechar a meta, confira as bases abaixo:\n\n${detalhes}\n\n` +
    `Assim que os agentes/base estiverem alimentados, clique em Fechar meta novamente.`
  );

  return false;
}

function setButtonBusy(btn, busy) {
  if (!btn) return;
  if (busy) {
    btn.dataset.metasGuardOriginalText = btn.textContent || '';
    btn.textContent = 'Validando bases...';
    btn.disabled = true;
  } else {
    btn.textContent = btn.dataset.metasGuardOriginalText || 'Fechar meta';
    delete btn.dataset.metasGuardOriginalText;
    btn.disabled = false;
  }
}

function instalarGuardNoContainer(container) {
  if (!container || container.getAttribute?.(INSTALLED_ATTR) === '1') return;
  container.setAttribute(INSTALLED_ATTR, '1');

  container.addEventListener('click', async (event) => {
    const btn = event.target?.closest?.('[data-metas-close]');
    if (!btn || btn.hasAttribute(SKIP_ATTR)) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    setButtonBusy(btn, true);
    try {
      const ok = await validarBasesFechamento(container);
      if (!ok) return;

      btn.setAttribute(SKIP_ATTR, '1');
      btn.click();
      btn.removeAttribute(SKIP_ATTR);
    } finally {
      setButtonBusy(btn, false);
    }
  }, true);
}

function envolverMetas(metas) {
  if (!metas || typeof metas.openHome !== 'function' || metas.__fechamentoGuard) return metas;

  const originalOpenHome = metas.openHome;
  const wrapped = {
    ...metas,
    openHome(container, opts) {
      instalarGuardNoContainer(container);
      return originalOpenHome.call(this, container, opts);
    },
  };

  Object.defineProperty(wrapped, '__fechamentoGuard', { value: true });
  return wrapped;
}

(function instalarHookMetas() {
  let atual = window.METAS;

  try {
    Object.defineProperty(window, 'METAS', {
      configurable: true,
      get() {
        return atual;
      },
      set(value) {
        atual = envolverMetas(value);
      },
    });

    if (atual) window.METAS = atual;
  } catch (error) {
    console.warn('[metas-fechamento-guard] Não foi possível instalar hook do módulo Metas:', error);
    if (window.METAS) window.METAS = envolverMetas(window.METAS);
  }
})();
