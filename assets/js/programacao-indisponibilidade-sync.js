import { supabase } from './supabaseClient.js';
import { getCurrentUser } from './auth.js';

const TABELA_INFORMADOS = 'programacao_indisponibilidade_informados';
const STATUS_VALIDOS = new Set(['ATESTADO', 'FALTA', 'FERIAS', 'FOLGA']);

const state = {
  cacheDia: '',
  cache: null,
  carregando: null,
  user: null,
  processScheduled: false,
  obsTimers: new Map(),
};

function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}

function normalizeCpf(value) {
  const digits = String(value ?? '').replace(/\D/g, '');
  return digits.length >= 9 ? digits : '';
}

function todayIso() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function dataReferenciaAtual() {
  const candidatos = [
    '#programacaoData', '#progData', '#pgcData', '#dataReferencia',
    'input[name="data_referencia"]', 'input[name="dataReferencia"]',
  ];
  for (const selector of candidatos) {
    const el = document.querySelector(selector);
    if (el?.value && /^\d{4}-\d{2}-\d{2}$/.test(el.value)) return el.value;
  }

  const visivel = [...document.querySelectorAll('input[type="date"]')]
    .find((el) => el.value && el.offsetParent !== null && !el.closest('.in-modal,.pso-modal,.pld-modal-ov'));
  return visivel?.value || todayIso();
}

function statusDoMotivo(value) {
  const motivo = normalizeText(value);
  if (motivo.includes('ATEST')) return 'ATESTADO';
  if (motivo.includes('FERI')) return 'FERIAS';
  if (motivo.includes('FALTA')) return 'FALTA';
  if (motivo.includes('FOLGA')) return 'FOLGA';
  return 'INDISPONIVEL';
}

function statusLabel(status) {
  return ({
    ATESTADO: 'Atestado',
    FALTA: 'Falta',
    FERIAS: 'Férias',
    FOLGA: 'Folga',
    INDISPONIVEL: 'Indisponível',
  })[status] || status;
}

function novoIndice() {
  const porId = new Map();
  const porNome = new Map();
  const todos = [];

  function add(row) {
    const registro = {
      id: String(row.id || '').trim(),
      cpf: normalizeCpf(row.cpf),
      nome: String(row.nome || '').trim(),
      status: row.status || 'INDISPONIVEL',
      label: row.label || statusLabel(row.status),
      fonte: row.fonte || 'RH',
    };
    const idKey = registro.cpf || registro.id;
    const nomeKey = normalizeText(registro.nome);
    if (idKey && !porId.has(idKey)) porId.set(idKey, registro);
    if (registro.id && !porId.has(registro.id)) porId.set(registro.id, registro);
    if (nomeKey && !porNome.has(nomeKey)) porNome.set(nomeKey, registro);
    todos.push(registro);
  }

  function match(id, nome) {
    const bruto = String(id || '').trim();
    const cpf = normalizeCpf(bruto);
    return (cpf && porId.get(cpf))
      || (bruto && porId.get(bruto))
      || porNome.get(normalizeText(nome))
      || null;
  }

  return { porId, porNome, todos, add, match };
}

async function carregarIndisponiveis(dia = dataReferenciaAtual()) {
  if (state.cache && state.cacheDia === dia) return state.cache;
  if (state.carregando && state.cacheDia === dia) return state.carregando;

  state.cacheDia = dia;
  state.carregando = (async () => {
    const indice = novoIndice();
    const [legadoRes, feriasRes, atestadosRes] = await Promise.all([
      supabase.from('indisponibilidades')
        .select('colaborador_cpf,colaborador_nome,motivo,data_inicio,data_fim')
        .lte('data_inicio', dia)
        .or(`data_fim.is.null,data_fim.gte.${dia}`),
      supabase.from('rh_ferias')
        .select('colaborador_id,colaborador_nome,data_inicio,data_fim')
        .in('status', ['programada', 'em_gozo'])
        .lte('data_inicio', dia)
        .gte('data_fim', dia),
      supabase.from('rh_atestados')
        .select('colaborador_id,colaborador_nome,data_inicio,data_fim')
        .in('status', ['lancado', 'aprovado'])
        .lte('data_inicio', dia)
        .gte('data_fim', dia),
    ]);

    if (legadoRes.error) console.warn('[programacao-indisponibilidade] indisponibilidades:', legadoRes.error);
    if (feriasRes.error) console.warn('[programacao-indisponibilidade] férias:', feriasRes.error);
    if (atestadosRes.error) console.warn('[programacao-indisponibilidade] atestados:', atestadosRes.error);

    (legadoRes.data || []).forEach((r) => {
      const status = statusDoMotivo(r.motivo);
      indice.add({
        cpf: r.colaborador_cpf,
        nome: r.colaborador_nome,
        status,
        label: statusLabel(status),
        fonte: 'RH > Indisponibilidade',
      });
    });

    const rhRows = [
      ...(feriasRes.data || []).map((r) => ({ ...r, status: 'FERIAS', label: 'Férias' })),
      ...(atestadosRes.data || []).map((r) => ({ ...r, status: 'ATESTADO', label: 'Atestado' })),
    ];

    const uuids = [...new Set(rhRows.map((r) => r.colaborador_id).filter(Boolean).map(String))];
    const cadPorId = new Map();
    if (uuids.length) {
      const { data: cadastros, error } = await supabase.from('colaboradores').select('id,cpf,nome').in('id', uuids);
      if (error) console.warn('[programacao-indisponibilidade] colaboradores:', error);
      (cadastros || []).forEach((c) => cadPorId.set(String(c.id), c));
    }

    rhRows.forEach((r) => {
      const cadastro = cadPorId.get(String(r.colaborador_id)) || {};
      indice.add({
        id: r.colaborador_id,
        cpf: cadastro.cpf,
        nome: cadastro.nome || r.colaborador_nome,
        status: r.status,
        label: r.label,
        fonte: r.status === 'FERIAS' ? 'RH > Férias' : 'RH > Atestados',
      });
    });

    state.cache = indice;
    return indice;
  })().finally(() => { state.carregando = null; });

  return state.carregando;
}

function nomeDoCard(card) {
  const el = card?.querySelector('.pso-nome');
  if (!el) return '';
  const clone = el.cloneNode(true);
  clone.querySelectorAll('.pso-indisp,.pso-sync-rh-badge').forEach((n) => n.remove());
  return clone.textContent.trim();
}

function nomeDaOpcao(option) {
  return String(option.dataset.nome || option.textContent || '')
    .replace(/^\s*♻\s*/, '')
    .replace(/\s*\((RH|indisponível).*$/i, '')
    .trim();
}

async function filtrarSeletoresDeColaborador() {
  const indice = await carregarIndisponiveis();
  const selects = document.querySelectorAll('select[data-add-colab-select]');
  selects.forEach((select) => {
    [...select.options].forEach((option) => {
      if (!option.value) return;
      const registro = indice.match(option.value, nomeDaOpcao(option));
      if (registro) option.remove();
    });
  });

  document.querySelectorAll('[data-confirmar-candidato]').forEach((btn) => {
    const wrap = btn.closest('.pld-cand-wrap');
    if (!wrap || wrap.dataset.indispTratada === '1') return;
    const id = btn.dataset.confirmarCandidato;
    const nome = wrap.querySelector('.peqb-cand-top strong,strong')?.textContent?.trim() || '';
    const registro = indice.match(id, nome);
    if (!registro) return;
    wrap.dataset.indispTratada = '1';
    wrap.innerHTML = `<div class="pld-lock">🔒 <b>${esc(nome || 'Colaborador')}</b> está ${esc(registro.label.toLowerCase())} e não pode ser indicado nesta O.S.</div>`;
  });
}

function badgeAutomatico(card, registro) {
  const nomeEl = card.querySelector('.pso-nome');
  if (!nomeEl || nomeEl.querySelector('.pso-indisp,.pso-sync-rh-badge')) return;
  const badge = document.createElement('span');
  badge.className = 'pso-sync-rh-badge';
  badge.textContent = `${registro.label} (RH)`;
  badge.title = `Status preenchido automaticamente por ${registro.fonte}`;
  nomeEl.appendChild(badge);
}

async function aplicarStatusAutomaticoSemOs() {
  const indice = await carregarIndisponiveis();
  document.querySelectorAll('.pso-card[data-colab-id]').forEach((card) => {
    const id = card.dataset.colabId;
    const nome = nomeDoCard(card);
    const registro = indice.match(id, nome);
    if (!registro) return;

    card.dataset.indisponivelRh = registro.status;
    badgeAutomatico(card, registro);

    if (!STATUS_VALIDOS.has(registro.status)) return;
    const btn = card.querySelector(`.pso-sit-btn[data-situacao="${registro.status}"]`);
    if (!btn || btn.disabled || btn.classList.contains('on')) return;

    card.dataset.rhAutoAplicando = '1';
    btn.click();
    queueMicrotask(() => { delete card.dataset.rhAutoAplicando; });
  });
}

function injetarStyles() {
  if (document.getElementById('progIndisponibilidadeSyncStyles')) return;
  const style = document.createElement('style');
  style.id = 'progIndisponibilidadeSyncStyles';
  style.textContent = `
    .pso-sync-rh-badge{display:inline-flex;align-items:center;margin-left:8px;padding:2px 8px;border-radius:999px;font-size:10px;font-weight:900;background:rgba(245,158,11,.14);color:#fde68a;border:1px solid rgba(245,158,11,.35);vertical-align:middle}
    .pso-rh-status{display:inline-flex;align-items:center;justify-content:center;min-width:58px;padding:4px 9px;border-radius:999px;font-size:11px;font-weight:900;white-space:nowrap;justify-self:end}
    .pso-rh-status.ok{background:rgba(34,197,94,.14);color:#4ade80;border:1px solid rgba(34,197,94,.35)}
    .pso-rh-status.err{background:rgba(239,68,68,.14);color:#fca5a5;border:1px solid rgba(239,68,68,.35)}
  `;
  document.head.appendChild(style);
}

async function userAtual() {
  if (!state.user) state.user = await getCurrentUser().catch(() => null);
  return state.user;
}

function dadosDoCard(card) {
  const meta = String(card.querySelector('.pso-meta')?.textContent || '').trim();
  const partes = meta.split('·').map((v) => v.trim());
  const id = String(card.dataset.colabId || '').trim();
  return {
    colaborador_id: id,
    colaborador_cpf: normalizeCpf(id) || null,
    colaborador_nome: nomeDoCard(card),
    cargo: partes[0] || null,
    supervisao: partes[1] || null,
    observacao: card.querySelector('.pso-obs')?.value?.trim() || null,
  };
}

// O badge mora num slot fixo (4ª coluna do grid de .pso-card, ver
// programacao-sem-os.js) em vez de ser inserido/removido como sibling solto
// — isso é o que evitava manter as colunas alinhadas (o texto de feedback
// entrava como um item extra no grid de 3 colunas e empurrava a Observação
// pra uma linha nova, reportado pela usuária 2026-07-29).
function setStatusRh(card, informado) {
  const el = card.querySelector('[data-rh-status]');
  if (!el) return;
  clearTimeout(el._timer);
  el.title = '';
  if (informado) {
    el.className = 'pso-rh-status ok';
    el.textContent = 'RH ✔';
  } else {
    el.className = 'pso-rh-status';
    el.textContent = '';
  }
}

function mostrarErroRh(card) {
  const el = card.querySelector('[data-rh-status]');
  if (!el) return;
  const classeAnterior = el.className;
  const textoAnterior = el.textContent;
  clearTimeout(el._timer);
  el.className = 'pso-rh-status err';
  el.textContent = 'Falha';
  el.title = 'Falha ao informar o RH.';
  el._timer = setTimeout(() => {
    el.className = classeAnterior;
    el.textContent = textoAnterior;
    el.title = '';
  }, 3500);
}

async function enviarAoRh(card, tipo, selecionado) {
  const user = await userAtual();
  const dados = dadosDoCard(card);
  if (!dados.colaborador_id || !dados.colaborador_nome) return;

  const agora = new Date().toISOString();
  const payload = {
    ...dados,
    data_referencia: dataReferenciaAtual(),
    tipo,
    origem: 'PROGRAMACAO_SEM_OS',
    status: selecionado ? 'PENDENTE' : 'CANCELADO',
    informado_por: user?.id || null,
    informado_por_nome: user?.user_metadata?.nome || user?.email || null,
    informado_em: agora,
    updated_at: agora,
  };
  if (selecionado) {
    payload.processado_por = null;
    payload.processado_por_nome = null;
    payload.processado_em = null;
    payload.observacao_rh = null;
  }

  const { error } = await supabase
    .from(TABELA_INFORMADOS)
    .upsert(payload, { onConflict: 'data_referencia,colaborador_id' });

  if (error) {
    console.error('[programacao-indisponibilidade] informar RH:', error);
    mostrarErroRh(card);
    return;
  }
  setStatusRh(card, selecionado);
}

function observarAcoesSemOs() {
  document.addEventListener('click', (event) => {
    const btn = event.target.closest('.pso-sit-btn[data-situacao]');
    if (!btn) return;
    const card = btn.closest('.pso-card[data-colab-id]');
    if (!card || card.dataset.rhAutoAplicando === '1') return;

    queueMicrotask(() => {
      const tipo = String(btn.dataset.situacao || '').trim();
      if (!STATUS_VALIDOS.has(tipo)) return;
      enviarAoRh(card, tipo, btn.classList.contains('on')).catch((error) => {
        console.error('[programacao-indisponibilidade] fila RH:', error);
      });
    });
  });

  document.addEventListener('input', (event) => {
    const input = event.target.closest('.pso-obs');
    if (!input) return;
    const card = input.closest('.pso-card[data-colab-id]');
    const ativo = card?.querySelector('.pso-sit-btn.on[data-situacao]');
    if (!card || !ativo || card.dataset.rhAutoAplicando === '1') return;
    const key = `${dataReferenciaAtual()}:${card.dataset.colabId}`;
    clearTimeout(state.obsTimers.get(key));
    state.obsTimers.set(key, setTimeout(() => {
      enviarAoRh(card, ativo.dataset.situacao, true).catch(() => {});
    }, 700));
  });
}

function agendarProcessamento() {
  if (state.processScheduled) return;
  state.processScheduled = true;
  requestAnimationFrame(async () => {
    state.processScheduled = false;
    try {
      await Promise.all([
        filtrarSeletoresDeColaborador(),
        aplicarStatusAutomaticoSemOs(),
      ]);
    } catch (error) {
      console.warn('[programacao-indisponibilidade] processamento:', error);
    }
  });
}

function boot() {
  injetarStyles();
  observarAcoesSemOs();
  const observer = new MutationObserver(agendarProcessamento);
  observer.observe(document.body, { childList: true, subtree: true });
  document.addEventListener('change', (event) => {
    if (event.target.matches('input[type="date"]')) {
      state.cache = null;
      state.cacheDia = '';
      agendarProcessamento();
    }
  });
  agendarProcessamento();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
else boot();
