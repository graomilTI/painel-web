// Programação: seleção manual quando uma O.S. ficar sem candidato.
// Correção direta na tela: não depende do ranking da RPC.
import { supabase } from './supabaseClient.js';

const FLAG = '__progCandManualDiretoV2';
const cache = new Map();

function norm(v) {
  return String(v || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}
function cpf(v) { return String(v || '').replace(/\D/g, ''); }
function esc(v) {
  return String(v ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
function cargoBloqueado(cargo) {
  const c = norm(cargo);
  return c.includes('SUPERVISOR')
    || c.includes('AUDITOR')
    || c.includes('COORDENADOR')
    || c.includes('COORDENADORA')
    || c === 'COORDENACAO'
    || c.startsWith('COORDENACAO ');
}
function inativo(row) {
  if (row?.ativo === false) return true;
  if (String(row?.desligamento || '').trim()) return true;
  const s = norm(row?.situacao || row?.status || row?.disponibilidade);
  return ['INATIVO', 'INATIVA', 'NAO ATIVO', 'NAO ATIVA', 'DESLIGADO', 'DESLIGADA', 'DEMITIDO', 'DEMITIDA', 'ATESTADO', 'FALTA', 'FERIAS', 'FOLGA', 'INDISPONIVEL'].some((x) => s.includes(x));
}
function nome(row) { return String(row?.nome || row?.nome_colaborador || row?.colaborador_nome || '').trim(); }
function id(row) { return String(row?.colaborador_id || row?.colaboradorId || cpf(row?.cpf) || row?.id || nome(row) || '').trim(); }
function candidato(row, supervisao) {
  const colabId = id(row);
  const colabNome = nome(row);
  if (!colabId || !colabNome || cargoBloqueado(row?.cargo) || inativo(row)) return null;
  return {
    id: colabId,
    nome: colabNome,
    cargo: row?.cargo || null,
    coordenacao: row?.coordenacao || null,
    supervisao: row?.supervisao || supervisao || null,
  };
}
function escopo(row, supervisao) {
  const alvo = norm(supervisao);
  if (!alvo) return 1;
  const campos = [row.supervisao, row.coordenacao, row.regional, row.cidade].map(norm).filter(Boolean);
  if (campos.some((c) => c === alvo)) return 100;
  if (campos.some((c) => c.includes(alvo) || alvo.includes(c))) return 80;
  const tokens = alvo.split(' ').filter((t) => t.length >= 3);
  return tokens.filter((t) => campos.some((c) => c.includes(t) || t.includes(c))).length;
}
async function idsJaConfirmados(programacaoId) {
  if (!programacaoId) return new Set();
  const { data } = await supabase
    .from('programacao_equipe')
    .select('colaborador_id')
    .eq('programacao_id', programacaoId)
    .eq('confirmado', true)
    .limit(3000);
  return new Set((data || []).map((r) => String(r.colaborador_id)));
}
async function snapshotMaisRecente() {
  const { data } = await supabase
    .from('colaborador_snapshot')
    .select('data_referencia')
    .order('data_referencia', { ascending: false })
    .limit(1);
  return data?.[0]?.data_referencia || null;
}
async function carregarLista() {
  const programacaoId = window.__progGetProgramacaoId?.() || null;
  const supervisao = document.getElementById('progSup')?.value || '';
  const key = `${programacaoId || ''}|${supervisao || ''}`;
  if (cache.has(key)) return cache.get(key);

  const p = (async () => {
    const usados = await idsJaConfirmados(programacaoId);
    const fontes = [];

    if (programacaoId) {
      const { data } = await supabase
        .from('programacao_colaboradores')
        .select('colaborador_id,nome_colaborador,cargo,coordenacao,supervisao,disponibilidade')
        .eq('programacao_id', programacaoId)
        .limit(5000);
      fontes.push(...(data || []).map((r) => ({ ...r, _escopo: escopo(r, supervisao), _fonte: 1 })));
    }

    try {
      const rpc = await supabase.rpc('programacao_colaboradores_supervisao', { p_supervisao: supervisao });
      fontes.push(...(rpc?.data || []).map((r) => ({ ...r, _escopo: 70, _fonte: 2 })));
    } catch (_) {}

    const ref = await snapshotMaisRecente();
    if (ref) {
      const { data } = await supabase
        .from('colaborador_snapshot')
        .select('cpf,nome,cargo,coordenacao,supervisao,situacao,ativo,desligamento')
        .eq('data_referencia', ref)
        .limit(12000);
      const snap = data || [];
      const escopados = snap.map((r) => ({ ...r, _escopo: escopo(r, supervisao), _fonte: 3 })).filter((r) => r._escopo > 0);
      fontes.push(...(escopados.length ? escopados : snap.map((r) => ({ ...r, _escopo: 1, _fonte: 4 }))));
    }

    const seen = new Set();
    return fontes
      .sort((a, b) => (b._escopo || 0) - (a._escopo || 0) || nome(a).localeCompare(nome(b), 'pt-BR'))
      .map((r) => candidato(r, supervisao))
      .filter(Boolean)
      .filter((c) => !usados.has(String(c.id)))
      .filter((c) => {
        const k = String(c.id || c.nome);
        if (!k || seen.has(k)) return false;
        seen.add(k);
        return true;
      });
  })();

  cache.set(key, p);
  return p;
}
function osNumero(row) {
  return (row?.querySelector('.peqb-tag.g')?.textContent || '').replace(/^OS\s*/i, '').trim();
}
async function confirmar(row, colab, btn) {
  const programacaoId = window.__progGetProgramacaoId?.() || null;
  const osId = row?.dataset.osId;
  if (!programacaoId || !osId || !colab?.id) throw new Error('Contexto incompleto para confirmar candidato.');

  const equipe = {
    programacao_id: programacaoId,
    os_id: osId,
    colaborador_id: String(colab.id),
    nome_colaborador: colab.nome,
    score: 0,
    score_contrato: 0,
    score_distancia: 0,
    score_auditoria: 0,
    km_estimado: null,
    confirmado: true,
  };
  const { error } = await supabase.from('programacao_equipe').upsert(equipe, { onConflict: 'programacao_id,os_id,colaborador_id' });
  if (error) throw error;

  await supabase.from('operacional_os_colaboradores').delete().eq('os_id', osId);
  await supabase.from('operacional_os_colaboradores').insert({
    os_id: osId,
    colaborador_key: String(colab.id),
    colaborador_nome: colab.nome,
    colaborador_cpf: /^\d+$/.test(String(colab.id)) ? String(colab.id) : null,
    distancia_km: null,
    origem_sugestao: 'PROGRAMACAO_MANUAL_FALLBACK',
  });
  await supabase.from('programacao_colaboradores').upsert({
    programacao_id: programacaoId,
    colaborador_id: String(colab.id),
    nome_colaborador: colab.nome,
    cargo: colab.cargo || null,
    coordenacao: colab.coordenacao || null,
    supervisao: colab.supervisao || document.getElementById('progSup')?.value || null,
    disponibilidade: 'OK',
  }, { onConflict: 'programacao_id,colaborador_id' });

  if (btn) btn.textContent = 'Confirmado';
  document.getElementById('progLoadContext')?.click();
}
async function preencherVazios() {
  const rows = [...document.querySelectorAll('.peqb-os2')].filter((row) => /Nenhum candidato disponível/i.test(row.textContent || ''));
  if (!rows.length) return;
  const lista = await carregarLista();
  rows.forEach((row) => {
    const right = row.querySelector('.peqb-os2-right');
    if (!right || right.dataset.manualFallback === '1') return;
    right.dataset.manualFallback = '1';
    if (!lista.length) {
      right.innerHTML = '<div class="peqb-empty" style="margin:0">Não encontrei colaborador elegível no snapshot/programação.</div>';
      return;
    }
    const opts = lista.map((c) => `<option value="${esc(c.id)}">${esc(c.nome)}${c.cargo ? ` · ${esc(c.cargo)}` : ''}</option>`).join('');
    right.innerHTML = `<div class="peqb-empty" style="margin:0 0 8px;text-align:left;padding:12px">Escolha manualmente um colaborador elegível para a O.S. ${esc(osNumero(row) || '')}.</div><div class="peqb-row-actions"><select class="peqb-select" data-manual-candidato>${opts}</select><button type="button" class="peqb-row-btn" data-manual-confirmar>Confirmar</button></div>`;
  });
}
function boot() {
  preencherVazios();
  new MutationObserver(() => preencherVazios()).observe(document.body, { childList: true, subtree: true });
  document.addEventListener('click', async (event) => {
    const btn = event.target.closest('[data-manual-confirmar]');
    if (!btn) return;
    const row = btn.closest('.peqb-os2');
    const sel = row?.querySelector('[data-manual-candidato]');
    const lista = await carregarLista();
    const colab = lista.find((c) => String(c.id) === String(sel?.value));
    if (!colab) { alert('Selecione um colaborador válido.'); return; }
    btn.disabled = true;
    btn.textContent = 'Confirmando...';
    try { await confirmar(row, colab, btn); }
    catch (error) { btn.disabled = false; btn.textContent = 'Confirmar'; alert(error.message || 'Erro ao confirmar colaborador.'); }
  });
}

if (!window[FLAG]) {
  window[FLAG] = true;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
}
