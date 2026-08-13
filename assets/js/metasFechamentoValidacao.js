import { sincronizarPatrimoniosDoAgente } from './patrimoniosAgentSync.js';

const VALIDATED_ATTR = 'data-metas-fechamento-validado';
const BOUND_ATTR = 'data-metas-fechamento-validacao-bound';

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

async function temRegistro(label, query) {
  try {
    const { data, count, error } = await query;
    if (error) return { label, ok: false, erro: error.message || String(error) };
    return {
      label,
      ok: Number(count || 0) > 0 || (Array.isArray(data) && data.length > 0),
      erro: null,
    };
  } catch (error) {
    return { label, ok: false, erro: error?.message || String(error) };
  }
}

function montarMensagemBloqueio(faltantes) {
  const detalhes = faltantes
    .map((item) => `• ${item.label}${item.erro ? ` — ${item.erro}` : ''}`)
    .join('\n');

  return [
    'Fechamento bloqueado para evitar bônus incompleto.',
    '',
    'Antes de fechar a meta, confira as bases abaixo:',
    '',
    detalhes,
    '',
    'Assim que os agentes/base estiverem alimentados, clique em Fechar meta novamente.'
  ].join('\n');
}

async function validarBasesFechamento(container, supabase) {
  const { ano, mes } = getPeriodoSelecionado(container);
  const m1 = mesAnterior(ano, mes);
  const mesInicio = `${ano}-${pad2(mes)}-01`;
  const proximoMes = Number(mes) === 12
    ? `${Number(ano) + 1}-01-01`
    : `${ano}-${pad2(Number(mes) + 1)}-01`;
  const m1Inicio = `${m1.ano}-${pad2(m1.mes)}-01`;

  await sincronizarPatrimoniosDoAgente().catch((error) => {
    console.warn('[metas] Falha ao sincronizar patrimônios antes do fechamento:', error);
  });

  const checks = await Promise.all([
    temRegistro(
      `Produção diária do mês (${pad2(mes)}/${ano})`,
      supabase
        .from('producao_snapshot')
        .select('*', { count: 'exact', head: true })
        .gte('data', mesInicio)
        .lt('data', proximoMes)
    ),
    temRegistro(
      `Resultado Diário M-1 (${pad2(m1.mes)}/${m1.ano})`,
      supabase
        .from('relatorio_resultado_diario')
        .select('*', { count: 'exact', head: true })
        .gte('data', m1Inicio)
        .lt('data', mesInicio)
    ),
    temRegistro(
      `Despesas M-1 (${pad2(m1.mes)}/${m1.ano})`,
      supabase
        .from('grm_despesas_importacoes')
        .select('*', { count: 'exact', head: true })
        .gte('data_conta_de', m1Inicio)
        .lt('data_conta_de', mesInicio)
    ),
    temRegistro(
      'Leitura de patrimônios por supervisão',
      supabase
        .from('v_leitura_supervisao')
        .select('*', { count: 'exact', head: true })
    ),
    temRegistro(
      'Gestores ativos cadastrados',
      supabase
        .from('metas_gestores')
        .select('*', { count: 'exact', head: true })
        .eq('ativo', true)
    ),
  ]);

  const faltantes = checks.filter((item) => !item.ok);
  return {
    ok: faltantes.length === 0,
    faltantes,
    mensagem: faltantes.length ? montarMensagemBloqueio(faltantes) : ''
  };
}

function setButtonState(button, busy) {
  if (!button) return;

  if (busy) {
    button.dataset.metasFechamentoOriginalText = button.textContent || '';
    button.textContent = 'Validando bases...';
    button.disabled = true;
    return;
  }

  button.textContent = button.dataset.metasFechamentoOriginalText || 'Fechar meta';
  delete button.dataset.metasFechamentoOriginalText;
  button.disabled = false;
}

export function initMetasFechamentoValidacao(container, supabase) {
  if (!container || !supabase || container.getAttribute(BOUND_ATTR) === '1') return;
  container.setAttribute(BOUND_ATTR, '1');

  container.addEventListener('click', async (event) => {
    const button = event.target?.closest?.('[data-metas-close]');
    if (!button || !container.contains(button)) return;
    if (button.getAttribute(VALIDATED_ATTR) === '1') return;

    event.preventDefault();
    event.stopPropagation();

    setButtonState(button, true);

    try {
      const resultado = await validarBasesFechamento(container, supabase);
      if (!resultado.ok) {
        alert(resultado.mensagem);
        return;
      }

      button.setAttribute(VALIDATED_ATTR, '1');
      setButtonState(button, false);
      button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
      button.removeAttribute(VALIDATED_ATTR);
    } catch (error) {
      console.error('[metas] Erro ao validar fechamento:', error);
      alert('Não foi possível validar as bases para fechamento: ' + (error?.message || error));
    } finally {
      if (button.getAttribute(VALIDATED_ATTR) !== '1') setButtonState(button, false);
    }
  }, true);
}
