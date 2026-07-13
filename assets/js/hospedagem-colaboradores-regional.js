import { supabase } from './supabaseClient.js';
import { getColaboradores } from './colaboradoresCache.js?v=20260713-fonte-atual2';
import { getCurrentUser, getUserContext } from './auth.js';

const S = {
  lista: [], porNome: new Map(), selecionados: new Map(), sugestoes: new WeakMap(),
  labels: [], keys: new Set(), carregando: false, pronto: false, master: false, erro: '',
};

const norm = (v) => String(v || '').normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, ' ').trim().toLowerCase();
const esc = (v) => String(v ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
const papeis = new Set(['master', 'admin', 'administrador', 'gestor', 'diretor']);

function lista(v) {
  if (!v) return [];
  if (Array.isArray(v)) return v.flatMap(lista);
  if (typeof v === 'object') {
    return lista(v.supervisao || v.supervisoes || v.nome || v.name || v.label || v.value);
  }
  const t = String(v).trim();
  if (!t) return [];
  try {
    if (/^[\[{].*[\]}]$/.test(t)) return lista(JSON.parse(t));
  } catch {}
  return t.split(/[,;|\n]+/).map((x) => x.trim()).filter(Boolean);
}

function unicos(values) {
  const map = new Map();
  values.flatMap(lista).forEach((label) => {
    const key = norm(label);
    if (key && !papeis.has(key) && !map.has(key)) map.set(key, String(label).trim());
  });
  return [...map.values()].sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

async function buscarAppUser(userId) {
  if (!userId) return null;
  try {
    const { data, error } = await supabase
      .from('app_usuarios')
      .select('*')
      .eq('auth_user_id', userId)
      .maybeSingle();
    if (error) throw error;
    return data || null;
  } catch (error) {
    console.warn('[hospedagem] app_usuarios indisponível:', error);
    return null;
  }
}

async function buscarSupervisoesRelacionadas() {
  try {
    const { data, error } = await supabase.rpc('programacao_listar_supervisoes');
    if (error) throw error;
    return data || [];
  } catch (error) {
    console.warn('[hospedagem] relação de supervisões indisponível:', error);
    return [];
  }
}

async function resolverAcesso() {
  S.erro = '';
  const user = await getCurrentUser().catch(() => null);
  const [context, app, relacionadas] = await Promise.all([
    user?.id ? getUserContext(user.id).catch(() => null) : Promise.resolve(null),
    buscarAppUser(user?.id),
    buscarSupervisoesRelacionadas(),
  ]);
  const role = context?.user?.role || context?.perfil_codigo || context?.perfil_nome || context?.role;
  S.master = Boolean(context?.user?.is_master || context?.is_master || norm(role) === 'master');
  S.labels = unicos([
    relacionadas, app?.supervisoes, app?.supervisao,
    context?.user?.supervisoes, context?.user?.supervisao,
    context?.supervisoes, context?.supervisao,
  ]);
  S.keys = new Set(S.labels.map(norm));
  if (!S.master && !S.keys.size) {
    S.erro = 'Seu usuário não possui regional/supervisão liberada para consultar colaboradores.';
  }
}

function pertence(row) {
  if (S.master) return true;
  return lista(row?.supervisao).map(norm).some((key) => S.keys.has(key));
}

function dedup(rows) {
  const map = new Map();
  for (const row of rows) {
    const cpf = String(row.cpf || '').replace(/\D/g, '');
    const key = cpf || norm(row.nome) || String(row.id || '');
    if (key && !map.has(key)) map.set(key, row);
  }
  return [...map.values()].sort((a, b) =>
    String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR'));
}

async function carregar() {
  if (S.pronto || S.carregando) return;
  S.carregando = true;
  try {
    await resolverAcesso();
    const rows = await getColaboradores({ force: true, somenteAtivos: true });
    // A fonte principal agora é public.colaboradores, sincronizada pelo agente.
    // A view de snapshot permanece somente como fallback de compatibilidade.
    S.lista = dedup(rows.filter(pertence));
    S.porNome = new Map(S.lista.map((row) => [norm(row.nome), row]));
    S.pronto = true;
  } catch (error) {
    S.erro = error?.message || String(error);
    console.error('[hospedagem] colaboradores da regional:', error);
  } finally {
    S.carregando = false;
    ajuda();
  }
}

function encontrados(termo) {
  const q = norm(termo);
  return (q ? S.lista.filter((row) => norm(row.nome).includes(q)) : S.lista).slice(0, 80);
}

function fechar(exceto) {
  document.querySelectorAll('#colabBox .hosp-ac-list').forEach((el) => {
    if (el !== exceto) el.hidden = true;
  });
}

function render(input) {
  const box = input.closest('.hosp-ac')?.querySelector('.hosp-ac-list');
  if (!box) return;
  const rows = encontrados(input.value);
  S.sugestoes.set(box, rows);
  if (S.carregando && !S.pronto) {
    box.innerHTML = '<div class="hosp-ac-empty">Carregando equipe da regional...</div>';
  } else if (S.erro) {
    box.innerHTML = `<div class="hosp-ac-empty">${esc(S.erro)}</div>`;
  } else if (!rows.length) {
    box.innerHTML = '<div class="hosp-ac-empty">Nenhum colaborador ativo encontrado na regional do gestor</div>';
  } else {
    box.innerHTML = rows.map((row, i) => {
      const detalhe = [row.tipo, row.supervisao, row.coordenacao].filter(Boolean).join(' · ');
      return `<div class="hosp-ac-item" data-hosp-regional="${i}">${esc(row.nome)}`
        + `<small>${esc(detalhe || 'Colaborador ativo')}</small></div>`;
    }).join('');
  }
  fechar(box);
  box.hidden = false;
}

function selecionar(item) {
  const rowEl = item.closest('.hosp-colab-row');
  const input = rowEl?.querySelector('.colabNome');
  const tipo = rowEl?.querySelector('.colabTipo');
  const box = item.closest('.hosp-ac-list');
  const colab = (S.sugestoes.get(box) || [])[Number(item.dataset.hospRegional)];
  if (!input || !colab) return;
  input.value = colab.nome || '';
  if (tipo) tipo.value = colab.tipo || '';
  S.selecionados.set(norm(colab.nome), colab);
  box.hidden = true;
}

function eventos() {
  document.addEventListener('input', (ev) => {
    const input = ev.target.closest?.('#colabBox .hosp-ac-input');
    if (!input) return;
    ev.stopImmediatePropagation();
    render(input);
    if (!S.pronto && !S.carregando) carregar().then(() => render(input));
  }, true);
  document.addEventListener('focus', (ev) => {
    const input = ev.target.closest?.('#colabBox .hosp-ac-input');
    if (!input) return;
    ev.stopImmediatePropagation();
    ajuda();
    render(input);
    if (!S.pronto && !S.carregando) carregar().then(() => render(input));
  }, true);
  document.addEventListener('blur', (ev) => {
    const input = ev.target.closest?.('#colabBox .hosp-ac-input');
    if (!input) return;
    ev.stopImmediatePropagation();
    setTimeout(() => { const box = input.closest('.hosp-ac')?.querySelector('.hosp-ac-list'); if (box) box.hidden = true; }, 180);
  }, true);
  document.addEventListener('click', (ev) => {
    const item = ev.target.closest?.('[data-hosp-regional]');
    if (item) {
      ev.preventDefault();
      ev.stopImmediatePropagation();
      selecionar(item);
    } else if (!ev.target.closest?.('#colabBox .hosp-ac')) fechar();
  }, true);
}

function patchInsert() {
  if (supabase.__hospRegionalPatch) return;
  const from = supabase.from.bind(supabase);
  Object.defineProperty(supabase, '__hospRegionalPatch', { value: true });
  supabase.from = function patched(table) {
    const builder = from(table);
    if (table !== 'hospedagem_solicitacao_colaboradores' || !builder?.insert) return builder;
    const insert = builder.insert.bind(builder);
    builder.insert = (values, options) => {
      const arr = (Array.isArray(values) ? values : [values]).map((value) => {
        const c = S.selecionados.get(norm(value?.nome_colaborador)) || S.porNome.get(norm(value?.nome_colaborador));
        return !c ? value : {
          ...value,
          colaborador_id: c.id || value.colaborador_id || null,
          cpf: c.cpf || value.cpf || null,
          tipo_colaborador: c.tipo || value.tipo_colaborador || null,
          empresa: c.empresa || value.empresa || null,
          coordenacao: c.coordenacao || value.coordenacao || null,
          supervisao: c.supervisao || value.supervisao || null,
        };
      });
      return insert(Array.isArray(values) ? arr : arr[0], options);
    };
    return builder;
  };
}

function ajuda() {
  const el = document.getElementById('colabFallback');
  if (!el) return;
  el.style.display = 'block';
  if (S.erro) {
    el.textContent = S.erro;
    el.style.cssText += ';border-color:rgba(248,113,113,.3);background:rgba(127,29,29,.14);color:#fecaca';
    return;
  }
  const escopo = S.master ? 'todas as regionais' : (S.labels.join(', ') || 'regional vinculada');
  el.textContent = S.carregando
    ? 'Carregando a equipe completa da sua regional...'
    : `${S.lista.length} colaborador(es) ativo(s) disponível(is) em ${escopo}.`;
  el.style.cssText += ';border-color:rgba(34,197,94,.24);background:rgba(34,197,94,.07);color:#bbf7d0';
}

function ativar() {
  if (!document.getElementById('colabBox')) return false;
  ajuda();
  carregar();
  return true;
}

patchInsert();
eventos();
if (!ativar()) {
  const observer = new MutationObserver(() => {
    if (ativar()) observer.disconnect();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  setTimeout(() => observer.disconnect(), 60000);
}
