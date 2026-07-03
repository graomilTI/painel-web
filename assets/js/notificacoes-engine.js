/**
 * Motor de notificações do painel.
 *
 * Notificações COMPUTADAS (derivadas em tempo real de tabelas existentes):
 *   programacao_pendente — programacao_dia sem status "salvo" para hoje
 *   patrimonio_atrasado — patrimônios com dias_sem_leitura >= 7
 *   checkout_hoje       — hospedagem com checkout_prevista = hoje e status RESERVADA
 *
 * Notificações EVENTO (gravadas em painel_notificacoes):
 *   programacao_salva   — gestor salvou programação → notifica CONFERÊNCIA
 *   os_atender          — OS mudou para ATENDER → notifica CONFERÊNCIA
 *   compra_realizada    — item comprado → notifica gestor solicitante
 *   despesa_conferencia — conferência lançou despesa → notifica setor
 */

import { supabase } from './supabaseClient.js';
import { toPanelUrl } from './paths.js';

// ---------- meta de cada tipo ----------
export const NOTIF_META = {
  programacao_pendente: { prioridade: 'atencao',     icone: 'calendar-clock',  label: 'Programação Pendente',  modulo_url: 'programacao' },
  patrimonio_atrasado:  { prioridade: 'atencao',     icone: 'package-alert',   label: 'Patrimônios Atrasados', modulo_url: 'patrimonios' },
  checkout_hoje:        { prioridade: 'urgente',     icone: 'hotel-alert',     label: 'Checkout Hoje',         modulo_url: 'hospedagem' },
  programacao_salva:    { prioridade: 'normal',      icone: 'check-circle',    label: 'Programação Realizada', modulo_url: 'adm-conferencia' },
  os_atender:           { prioridade: 'atencao',     icone: 'clipboard-check', label: 'OS para Conferência',   modulo_url: 'distribuir-os' },
  compra_realizada:     { prioridade: 'informativo', icone: 'shopping-bag',    label: 'Compra Realizada',      modulo_url: 'compras' },
  despesa_conferencia:  { prioridade: 'atencao',     icone: 'receipt',         label: 'Despesa para Conferir', modulo_url: 'adm-conferencia' },
};

const PRIORIDADE_ORDER = { urgente: 0, atencao: 1, normal: 2, informativo: 3 };

// ---------- estado interno ----------
let _ctx = null;
let _computed = [];
let _eventos = [];
let _lidas = new Set();       // notificacao_id lidas pelo usuário atual
let _executadas = new Set();  // notificacao_id executadas pelo usuário atual
let _listeners = [];
let _realtimeCh = null;
let _computedChs = [];
let _computedPollInterval = null;
let _computedMidnightTimeout = null;
let _initPromise = null;
let _initialized = false;

// ---------- helpers de contexto ----------
function normalize(v) {
  return String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim();
}

function parseSupList(v) {
  if (!v) return [];
  if (Array.isArray(v)) return v.flatMap(parseSupList);
  const text = String(v).trim();
  if (!text) return [];
  try {
    if (text.startsWith('[') || text.startsWith('{')) return parseSupList(JSON.parse(text));
  } catch (_) {}
  return [...new Set(text.split(/[,;|\n]+/).map((s) => s.trim()).filter(Boolean))];
}

function getSupervisoes() {
  if (!_ctx) return [];
  const raw = [
    _ctx.supervisao,
    _ctx.user?.supervisao,
  ];
  return [...new Set(raw.flatMap(parseSupList).filter(Boolean))];
}

function isGestor() {
  if (!_ctx) return false;
  return normalize(_ctx.user?.role) === 'GESTOR';
}

function isMaster() {
  if (!_ctx) return false;
  return !!_ctx.user?.is_master || normalize(_ctx.user?.role) === 'MASTER';
}

function userId() {
  return _ctx?.user?.id || null;
}

function userModuleCodes() {
  const modules = Array.isArray(_ctx?.modules) ? _ctx.modules : [];
  return new Set(modules.map((m) => normalize(m.code || m.codigo || m.name || '')));
}

function hasModule(code) {
  if (isMaster()) return true;
  return userModuleCodes().has(normalize(code));
}

function todayISO() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

// ---------- notificações computadas ----------
// Nota: a notificação "os_pendente" (OS sem status_gestor) foi removida — a
// distribuição de OS foi unificada dentro da própria tela de Programação, então
// o sinal relevante pro gestor agora é só "programação não realizada", abaixo.
async function loadComputedProgramacaoPendente() {
  if (!isGestor() && !isMaster()) return [];
  const sups = getSupervisoes();
  if (!isMaster() && !sups.length) return [];

  const hoje = todayISO();
  let q = supabase
    .from('programacao_dia')
    .select('id,data_referencia,supervisao,status')
    .eq('data_referencia', hoje)
    .neq('status', 'salvo');

  if (!isMaster() && sups.length) {
    q = q.in('supervisao', sups);
  }

  const { data } = await q.limit(50);
  if (!data?.length) return [];

  return [{
    id: 'computed:programacao_pendente',
    tipo: 'programacao_pendente',
    titulo: 'Programação não realizada na data de hoje',
    descricao: 'A programação de despesas de hoje ainda não foi salva',
    prioridade: 'atencao',
    icone: 'calendar-clock',
    modulo_url: 'programacao',
    computed: true,
    created_at: new Date().toISOString(),
  }];
}

async function loadComputedPatrimonioAtrasado() {
  if (!isGestor() && !isMaster()) return [];
  const sups = getSupervisoes();
  if (!isMaster() && !sups.length) return [];

  // Pega a última importação por supervisão e verifica atrasados
  let q = supabase
    .from('patrimonios_historico_leituras')
    .select('id,supervisao,patrimonio_codigo,dias_sem_leitura')
    .gte('dias_sem_leitura', 7);

  if (!isMaster() && sups.length) {
    q = q.in('supervisao', sups);
  }

  const { data } = await q.limit(500);
  if (!data?.length) return [];

  // Conta únicos por patrimônio_codigo
  const uniq = new Set((data || []).map((r) => r.patrimonio_codigo).filter(Boolean));
  const count = uniq.size || data.length;

  return [{
    id: 'computed:patrimonio_atrasado',
    tipo: 'patrimonio_atrasado',
    titulo: `${count} patrimônio${count > 1 ? 's' : ''} com leitura atrasada`,
    descricao: `${count} patrimônio${count > 1 ? 's' : ''} sem leitura há 7+ dias na sua regional`,
    prioridade: 'atencao',
    icone: 'package-alert',
    modulo_url: 'patrimonios',
    computed: true,
    created_at: new Date().toISOString(),
    count,
  }];
}

async function loadComputedCheckoutHoje() {
  if (!isGestor() && !isMaster()) return [];
  const sups = getSupervisoes();
  if (!isMaster() && !sups.length) return [];

  const hoje = todayISO();
  let q = supabase
    .from('hospedagem_solicitacoes')
    .select('id,colaborador,data_checkout_prevista,status_solicitacao,supervisao')
    .eq('data_checkout_prevista', hoje)
    .in('status_solicitacao', ['RESERVADA', 'reservada', 'Reservada']);

  if (!isMaster() && sups.length) {
    q = q.in('supervisao', sups);
  }

  const { data } = await q.limit(50);
  if (!data?.length) return [];

  const nomes = (data || []).map((r) => r.colaborador).filter(Boolean).slice(0, 3).join(', ');

  return [{
    id: 'computed:checkout_hoje',
    tipo: 'checkout_hoje',
    titulo: `${data.length} checkout${data.length > 1 ? 's' : ''} de hospedagem hoje`,
    descricao: nomes ? `Checkout: ${nomes}${data.length > 3 ? ` +${data.length - 3}` : ''}` : `${data.length} reserva${data.length > 1 ? 's' : ''} com checkout hoje`,
    prioridade: 'urgente',
    icone: 'hotel-alert',
    modulo_url: 'hospedagem',
    computed: true,
    created_at: new Date().toISOString(),
    count: data.length,
  }];
}

async function refreshComputed() {
  const [prog, pat, ckout] = await Promise.all([
    loadComputedProgramacaoPendente(),
    loadComputedPatrimonioAtrasado(),
    loadComputedCheckoutHoje(),
  ]);
  _computed = [...prog, ...pat, ...ckout];
}

// ---------- notificações evento (banco) ----------
function notifIsForMe(n) {
  if (isMaster()) return true;
  const uid = userId();
  if (n.destinatario_usuario_id && n.destinatario_usuario_id === uid) return true;
  if (n.destinatario_perfil) {
    const meuPerfil = normalize(_ctx?.user?.role || '');
    if (normalize(n.destinatario_perfil) === meuPerfil) {
      // filtra por supervisão se tiver
      if (n.supervisao) {
        const sups = getSupervisoes().map(normalize);
        return !sups.length || sups.includes(normalize(n.supervisao));
      }
      return true;
    }
  }
  if (n.destinatario_modulo) {
    return hasModule(n.destinatario_modulo);
  }
  return false;
}

async function loadEventos() {
  const { data } = await supabase
    .from('painel_notificacoes')
    .select('*')
    .eq('arquivada', false)
    .order('created_at', { ascending: false })
    .limit(200);

  _eventos = (data || []).filter(notifIsForMe);
}

async function loadMinhasLeituras() {
  const uid = userId();
  if (!uid) return;
  const ids = _eventos.map((n) => n.id);
  if (!ids.length) return;

  const { data } = await supabase
    .from('painel_notificacoes_usuarios')
    .select('notificacao_id,lida_em,executada_em')
    .eq('usuario_id', uid)
    .in('notificacao_id', ids);

  _lidas.clear();
  _executadas.clear();
  for (const row of (data || [])) {
    if (row.lida_em) _lidas.add(row.notificacao_id);
    if (row.executada_em) _executadas.add(row.notificacao_id);
  }
}

// ---------- API pública ----------
function buildList() {
  // Eventos não executados
  const eventosVisiveis = _eventos
    .filter((n) => !_executadas.has(n.id))
    .map((n) => ({
      ...n,
      lida: _lidas.has(n.id),
      computed: false,
    }));

  // Computed
  const all = [..._computed, ...eventosVisiveis];
  all.sort((a, b) => {
    const pa = PRIORIDADE_ORDER[a.prioridade] ?? 9;
    const pb = PRIORIDADE_ORDER[b.prioridade] ?? 9;
    if (pa !== pb) return pa - pb;
    return new Date(b.created_at) - new Date(a.created_at);
  });
  return all;
}

export function getNotificacoes() {
  return buildList();
}

export function getBadgeCount() {
  const list = buildList();
  return list.filter((n) => n.computed || !n.lida).length;
}

export function onUpdate(cb) {
  _listeners.push(cb);
  return () => { _listeners = _listeners.filter((l) => l !== cb); };
}

function notify() {
  const list = buildList();
  _listeners.forEach((cb) => cb(list, getBadgeCount()));
}

export async function marcarLida(notificacaoId) {
  if (notificacaoId.startsWith('computed:')) return;
  const uid = userId();
  if (!uid) return;
  _lidas.add(notificacaoId);
  notify();
  await supabase.from('painel_notificacoes_usuarios').upsert({
    notificacao_id: notificacaoId,
    usuario_id: uid,
    usuario_nome: _ctx?.user?.name || null,
    lida_em: new Date().toISOString(),
  }, { onConflict: 'notificacao_id,usuario_id' });
}

export async function marcarExecutada(notificacaoId) {
  if (notificacaoId.startsWith('computed:')) return;
  const uid = userId();
  if (!uid) return;
  _lidas.add(notificacaoId);
  _executadas.add(notificacaoId);
  notify();
  await supabase.from('painel_notificacoes_usuarios').upsert({
    notificacao_id: notificacaoId,
    usuario_id: uid,
    usuario_nome: _ctx?.user?.name || null,
    lida_em: _lidas.has(notificacaoId) ? undefined : new Date().toISOString(),
    executada_em: new Date().toISOString(),
  }, { onConflict: 'notificacao_id,usuario_id' });
}

export async function criarNotificacao(payload) {
  const uid = userId();
  const insert = {
    tipo: payload.tipo,
    titulo: payload.titulo,
    descricao: payload.descricao || null,
    prioridade: payload.prioridade || NOTIF_META[payload.tipo]?.prioridade || 'normal',
    icone: payload.icone || NOTIF_META[payload.tipo]?.icone || 'bell',
    modulo_url: payload.modulo_url || NOTIF_META[payload.tipo]?.modulo_url || null,
    destinatario_perfil: payload.destinatario_perfil || null,
    destinatario_modulo: payload.destinatario_modulo || null,
    destinatario_usuario_id: payload.destinatario_usuario_id || null,
    supervisao: payload.supervisao || null,
    referencia_tabela: payload.referencia_tabela || null,
    referencia_id: payload.referencia_id || null,
    chave_dedup: payload.chave_dedup || null,
    gerado_por_usuario_id: uid,
    meta: payload.meta || null,
  };

  // Upsert por chave_dedup se fornecida (evita duplicatas em re-saves)
  if (insert.chave_dedup) {
    const { data: existing } = await supabase
      .from('painel_notificacoes')
      .select('id')
      .eq('chave_dedup', insert.chave_dedup)
      .eq('arquivada', false)
      .maybeSingle();
    if (existing) return existing; // já existe
  }

  const { data, error } = await supabase
    .from('painel_notificacoes')
    .insert(insert)
    .select()
    .single();

  if (error) {
    console.error('[notif] criarNotificacao:', error);
    return null;
  }
  return data;
}

// ---------- tempo real ----------
async function setupRealtime() {
  try {
    if (_realtimeCh) {
      await supabase.removeChannel(_realtimeCh);
      _realtimeCh = null;
    }

    _realtimeCh = supabase
      .channel('painel_notificacoes_rt')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'painel_notificacoes',
      }, async () => {
        await loadEventos();
        await loadMinhasLeituras();
        notify();
      })
      .subscribe((status, err) => {
        if (err) console.warn('[notif] realtime painel_notificacoes:', err);
        console.debug?.('[notif] realtime painel_notificacoes:', status);
      });
  } catch (err) {
    console.warn('[notif] realtime painel_notificacoes indisponível:', err);
  }
}

function setupComputedPolling() {
  if (_computedPollInterval) clearInterval(_computedPollInterval);
  if (_computedMidnightTimeout) clearTimeout(_computedMidnightTimeout);

  // Atualiza computed a cada 5 minutos
  _computedPollInterval = setInterval(async () => {
    await refreshComputed();
    notify();
  }, 5 * 60 * 1000);

  // Atualiza no início de cada dia e recria o agendamento do próximo dia
  const scheduleMidnightRefresh = () => {
    const now = new Date();
    const meianoite = new Date(now);
    meianoite.setHours(24, 0, 30, 0);
    _computedMidnightTimeout = setTimeout(async () => {
      await refreshComputed();
      notify();
      scheduleMidnightRefresh();
    }, meianoite - now);
  };

  scheduleMidnightRefresh();
}

// ---------- subscriptions para tabelas de computed ----------
// Debounce: patrimonios_historico_leituras recebe centenas de INSERTs em lote
// no sync horário do GRM; sem isso, cada linha dispararia um refreshComputed()
// em todo cliente conectado.
let _refreshComputedDebounce = null;
function scheduleRefreshComputed() {
  if (_refreshComputedDebounce) return;
  _refreshComputedDebounce = setTimeout(async () => {
    _refreshComputedDebounce = null;
    await refreshComputed();
    notify();
  }, 3000);
}

async function setupComputedRealtime() {
  const tables = ['programacao_dia', 'hospedagem_solicitacoes', 'patrimonios_historico_leituras'];

  try {
    if (_computedChs.length) {
      await Promise.allSettled(_computedChs.map((ch) => supabase.removeChannel(ch)));
      _computedChs = [];
    }

    for (const table of tables) {
      const channel = supabase
        .channel(`notif_computed_${table}`)
        .on('postgres_changes', { event: '*', schema: 'public', table }, () => {
          scheduleRefreshComputed();
        });

      _computedChs.push(channel);
      channel.subscribe((status, err) => {
        if (err) console.warn(`[notif] realtime computed ${table}:`, err);
        console.debug?.(`[notif] realtime computed ${table}:`, status);
      });
    }
  } catch (err) {
    // O painel não pode quebrar se o realtime não estiver disponível.
    // O polling de 5 minutos continua mantendo os números atualizados.
    console.warn('[notif] realtime computed indisponível:', err);
  }
}

// ---------- init ----------
export async function initNotificacoesEngine(userContext) {
  if (_initPromise) return _initPromise;

  _initPromise = (async () => {
    _ctx = userContext;
    _lidas.clear();
    _executadas.clear();

    await Promise.all([refreshComputed(), loadEventos()]);
    await loadMinhasLeituras();

    if (!_initialized) {
      _initialized = true;
      setupComputedPolling();
    }

    await setupRealtime();
    await setupComputedRealtime();

    return { getNotificacoes, getBadgeCount, onUpdate, marcarLida, marcarExecutada, criarNotificacao };
  })().catch((err) => {
    _initPromise = null;
    _initialized = false;
    throw err;
  });

  return _initPromise;
}

// ---------- para módulos externos ----------
export { toPanelUrl };
