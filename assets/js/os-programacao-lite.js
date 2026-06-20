import { supabase } from './supabaseClient.js';
import { getCurrentUser } from './auth.js';

const PAGE_SIZE = 150;
const BR = new Intl.NumberFormat('pt-BR');
const KM = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });
const STATUS_OPTIONS = ['AGUARDAR', 'ATENDER', 'FINALIZAR'];

const OS_SELECT = [
  'id',
  'numero_os',
  'data_os',
  'cliente',
  'servico',
  'supervisao',
  'embarque',
  'destino',
  'contrato',
  'produto',
  'remanescente',
  'lote',
  'embarcado',
  'status_gestor',
  'observacao_logistica',
  'permitir_mais_classificadores',
  'status_logistica',
  'enviado_logistica_em',
  'logistica_solicitado_por',
  'configurada_em',
  'updated_at',
  'created_at',
].join(',');

const COLAB_SELECT = 'id,colaborador_id,cpf,nome,nome_colaborador,supervisao,regional,latitude,longitude,ativo,situacao';
const PONTO_SELECT = 'id,tipo_local,nome_local,uf,cidade,latitude,longitude,supervisao,coordenacao,ativo';

let currentUser = null;
let loadToken = 0;
const pontosCache = new Map();
const colabsCache = new Map();

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function normalize(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}

function num(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const clean = String(value ?? '').replace(/\./g, '').replace(',', '.').replace(/[^0-9.-]/g, '');
  const parsed = Number(clean);
  return Number.isFinite(parsed) ? parsed : 0;
}

function fmtTon(value) {
  return BR.format(num(value));
}

function brDate(value) {
  if (!value) return '-';
  const raw = String(value).slice(0, 10);
  const [y, m, d] = raw.split('-');
  return y && m && d ? `${d}/${m}/${y}` : escapeHtml(value);
}

function onlyActiveColab(c) {
  if (!c || c.ativo === false) return false;
  const sit = normalize(c.situacao);
  return !['NAO ATIVO', 'INATIVO', 'DESLIGADO', 'DEMITIDO'].some((status) => sit.includes(status));
}

function colabKey(c) {
  return String(c?.colaborador_id || c?.cpf || c?.id || c?.nome || '').replace(/\D/g, '') || String(c?.id || c?.nome || '').trim();
}

function hasGeo(lat, lng) {
  return Number.isFinite(Number(lat)) && Number.isFinite(Number(lng));
}

function haversineKm(aLat, aLng, bLat, bLng) {
  const lat1 = Number(aLat), lon1 = Number(aLng), lat2 = Number(bLat), lon2 = Number(bLng);
  if (![lat1, lon1, lat2, lon2].every(Number.isFinite)) return null;
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const s1 = Math.sin(dLat / 2) ** 2;
  const s2 = Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s1 + s2), Math.sqrt(1 - s1 - s2));
}

function splitUfCidadeLocal(text) {
  const raw = String(text || '').trim();
  const match = raw.match(/^([A-Z]{2})\s*-\s*([^()]+?)(?:\s*\(([^)]+)\))?\s*$/i);
  if (!match) return { uf: '', cidade: raw, local: '' };
  return { uf: match[1].toUpperCase(), cidade: match[2].trim(), local: (match[3] || '').trim() };
}

function statusLabel(row) {
  return normalize(row?.status_gestor) || 'PENDENTE';
}

function statusClass(row) {
  const st = statusLabel(row);
  if (st === 'ATENDER') return 'ok';
  if (st === 'FINALIZAR') return 'danger';
  if (st === 'AGUARDAR') return 'warn';
  return '';
}

function injectStyles() {
  if (document.getElementById('osProgramacaoLiteStyles')) return;
  const style = document.createElement('style');
  style.id = 'osProgramacaoLiteStyles';
  style.textContent = `
    .os-lite-actions{display:flex;gap:8px;align-items:center;justify-content:space-between;flex-wrap:wrap;margin:0 0 12px}.os-lite-actions .muted{font-size:12px}.os-lite-actions .btn{min-height:36px}
    .os-lite-table-wrap{overflow:auto;border:1px solid rgba(52,211,153,.16);border-radius:18px;background:rgba(2,6,23,.25)}
    .os-lite-table{width:100%;min-width:980px;border-collapse:separate;border-spacing:0;table-layout:fixed;color:#e2e2f0}.os-lite-table th{position:sticky;top:0;background:#07170f;color:#bbf7d0;text-align:left;padding:10px 9px;font-size:11px;text-transform:uppercase;letter-spacing:.035em;border-bottom:1px solid rgba(52,211,153,.18);z-index:1}.os-lite-table td{padding:10px 9px;border-bottom:1px solid rgba(148,163,184,.12);vertical-align:top;background:rgba(15,23,42,.24)}
    .os-lite-num{width:10%}.os-lite-cliente{width:42%}.os-lite-rem{width:13%}.os-lite-ind{width:24%}.os-lite-acao{width:11%}
    .os-lite-title{font-weight:900;color:#f8fafc;font-size:13.5px;line-height:1.18}.os-lite-meta{font-size:11px;color:#6b7280;margin-top:3px;line-height:1.25}.os-lite-route{display:block;white-space:normal;overflow-wrap:anywhere}.os-lite-rembox{display:flex;flex-direction:column;gap:3px;align-items:flex-start}
    .os-lite-chip{display:inline-flex;align-items:center;border-radius:999px;padding:4px 8px;font-size:11px;font-weight:900;border:1px solid rgba(148,163,184,.18);white-space:nowrap}.os-lite-chip.ok{background:rgba(22,163,74,.13);color:#bbf7d0}.os-lite-chip.warn{background:rgba(250,204,21,.14);color:#fde68a}.os-lite-chip.info{background:rgba(59,130,246,.13);color:#bfdbfe}.os-lite-chip.danger{background:rgba(239,68,68,.12);color:#fecaca}
    .os-lite-buttons{display:flex;gap:6px;flex-wrap:wrap}.os-lite-btn{border:1px solid rgba(52,211,153,.22);background:rgba(15,23,42,.72);color:#dcfce7;border-radius:999px;padding:7px 10px;font-weight:900;cursor:pointer;font-size:12px}.os-lite-btn.active{background:linear-gradient(135deg,#16a34a,#86efac);color:#052e16}.os-lite-btn.warn.active{background:#fde68a;color:#713f12}.os-lite-btn.danger.active{background:#fecaca;color:#7f1d1d}.os-lite-btn:disabled{opacity:.55;cursor:not-allowed}
    .os-lite-row-aguardar td{background:rgba(250,204,21,.06)!important}.os-lite-row-atender td{background:rgba(34,197,94,.06)!important}.os-lite-row-finalizar td{background:rgba(59,130,246,.06)!important}.os-lite-row-kg td{background:rgba(239,68,68,.06)!important}.os-lite-zero td:first-child{box-shadow:inset 4px 0 0 #facc15}
    .os-lite-empty{border:1px dashed rgba(148,163,184,.2);border-radius:18px;padding:18px;color:#6b7280;background:rgba(15,23,42,.16)}.os-lite-load-more{display:flex;justify-content:center;margin-top:12px}
  `;
  document.head.appendChild(style);
}

function buildQuery(supervisao, status, from, to) {
  let query = supabase
    .from('operacional_os')
    .select(OS_SELECT, { count: 'exact' })
    .eq('supervisao', supervisao)
    .order('data_os', { ascending: false })
    .order('numero_os', { ascending: false })
    .range(from, to);

  const statusNorm = normalize(status);
  if (statusNorm === 'PENDENTE') {
    query = query.or('status_gestor.is.null,status_gestor.eq.PENDENTE');
  } else if (statusNorm) {
    query = query.eq('status_gestor', statusNorm);
  }

  return query;
}

async function loadAtribuicoes(osIds) {
  const ids = osIds.filter(Boolean);
  if (!ids.length) return [];
  const chunks = [];
  for (let i = 0; i < ids.length; i += 200) chunks.push(ids.slice(i, i + 200));
  const results = await Promise.all(chunks.map((chunk) => (
    supabase
      .from('operacional_os_colaboradores')
      .select('id,os_id,colaborador_key,colaborador_nome,distancia_km,origem_sugestao')
      .in('os_id', chunk)
  )));
  const erro = results.find((r) => r.error);
  if (erro) {
    console.warn('Falha ao carregar colaboradores vinculados às O.S.', erro.error);
    return [];
  }
  return results.flatMap((r) => Array.isArray(r.data) ? r.data : []);
}

async function loadPontos(supervisao) {
  const key = normalize(supervisao || 'GERAL');
  if (pontosCache.has(key)) return pontosCache.get(key);

  let query = supabase.from('operacional_pontos_embarque').select(PONTO_SELECT).limit(2000);
  if (supervisao) query = query.or(`supervisao.eq.${supervisao},coordenacao.eq.${supervisao}`);
  const { data, error } = await query;
  if (error) {
    console.warn('Falha ao carregar pontos de embarque.', error);
    pontosCache.set(key, []);
    return [];
  }
  const rows = (data || []).filter((p) => p.ativo !== false && hasGeo(p.latitude, p.longitude));
  pontosCache.set(key, rows);
  return rows;
}

async function loadColabs(supervisao) {
  const key = normalize(supervisao || 'GERAL');
  if (colabsCache.has(key)) return colabsCache.get(key);

  let query = supabase.from('operacional_colaborador_base').select(COLAB_SELECT).eq('ativo', true).limit(2500);
  if (supervisao) query = query.or(`supervisao.eq.${supervisao},regional.eq.${supervisao}`);
  const { data, error } = await query;
  if (error) {
    console.warn('Falha ao carregar colaboradores para sugestão sob demanda.', error);
    colabsCache.set(key, []);
    return [];
  }
  const rows = (data || []).map((c) => ({ ...c, nome: c.nome || c.nome_colaborador, nome_colaborador: c.nome_colaborador || c.nome })).filter(onlyActiveColab);
  colabsCache.set(key, rows);
  return rows;
}

function bestPontoForOs(row, pontos) {
  const parsed = splitUfCidadeLocal(row.embarque || row.local_embarque || '');
  const uf = normalize(parsed.uf);
  const cidade = normalize(parsed.cidade);
  const local = normalize(parsed.local);
  const cliente = normalize(row.cliente);
  const candidatos = (pontos || []).map((p) => {
    let score = 0;
    const pUf = normalize(p.uf);
    const pCidade = normalize(p.cidade);
    const pNome = normalize(p.nome_local || p.tipo_local || '');
    const pSup = normalize(p.supervisao || p.coordenacao || '');
    if (uf && pUf === uf) score += 50;
    if (cidade && (pCidade === cidade || pCidade.includes(cidade) || cidade.includes(pCidade))) score += 80;
    if (local && (pNome.includes(local) || local.includes(pNome))) score += 120;
    if (cliente && (pNome.includes(cliente) || cliente.includes(pNome))) score += 30;
    if (row.supervisao && pSup && (pSup.includes(normalize(row.supervisao)) || normalize(row.supervisao).includes(pSup))) score += 15;
    return { ponto: p, score };
  }).filter((x) => x.score >= 120).sort((a, b) => b.score - a.score);
  return candidatos[0]?.ponto || null;
}

async function sugerirColaborador(row, atribuicoes) {
  const atuais = atribuicoes.filter((a) => String(a.os_id) === String(row.id));
  if (atuais.length) return atuais[0];

  const [pontos, colabs] = await Promise.all([loadPontos(row.supervisao), loadColabs(row.supervisao)]);
  const ponto = bestPontoForOs(row, pontos);
  if (!ponto || !hasGeo(ponto.latitude, ponto.longitude)) {
    throw new Error('Ponto de embarque sem coordenadas. Ajuste o mapa operacional ou use o menu OS completo para indicar manualmente.');
  }

  const candidatos = colabs
    .filter((c) => hasGeo(c.latitude, c.longitude))
    .map((c) => ({ ...c, distancia_km: haversineKm(ponto.latitude, ponto.longitude, c.latitude, c.longitude) }))
    .filter((c) => c.distancia_km != null)
    .sort((a, b) => a.distancia_km - b.distancia_km);

  const escolhido = candidatos[0];
  if (!escolhido) throw new Error('Nenhum colaborador com coordenadas foi encontrado para esta supervisão.');

  const payload = {
    os_id: row.id,
    colaborador_key: colabKey(escolhido),
    colaborador_nome: escolhido.nome || escolhido.nome_colaborador || 'Colaborador sugerido',
    distancia_km: Number(escolhido.distancia_km),
    origem_sugestao: 'DISTANCIA_OPERACIONAL_LITE',
    indicado_por: currentUser?.id || null,
  };

  const { data, error } = await supabase
    .from('operacional_os_colaboradores')
    .upsert(payload, { onConflict: 'os_id,colaborador_key' })
    .select('id,os_id,colaborador_key,colaborador_nome,distancia_km,origem_sugestao')
    .maybeSingle();
  if (error) throw error;
  return data || payload;
}

function statsHtml(rows, total) {
  const atender = rows.filter((r) => normalize(r.status_gestor) === 'ATENDER').length;
  const zero = rows.filter((r) => num(r.remanescente) === 0).length;
  const ate555 = rows.filter((r) => num(r.remanescente) > 0 && num(r.remanescente) <= 555000).length;
  return `
    <section class="grid-cards mt-16">
      <article class="card"><h3>Total filtrado</h3><p class="metric">${BR.format(total ?? rows.length)}</p><p class="muted">No Supabase, conforme filtro.</p></article>
      <article class="card"><h3>Na tela</h3><p class="metric">${BR.format(rows.length)}</p><p class="muted">Carregamento paginado.</p></article>
      <article class="card"><h3>Para atender</h3><p class="metric">${BR.format(atender)}</p><p class="muted">Nesta página.</p></article>
      <article class="card"><h3>Rem. zero</h3><p class="metric">${BR.format(zero)}</p><p class="muted">Nesta página.</p></article>
      <article class="card"><h3>Até 555.000</h3><p class="metric">${BR.format(ate555)}</p><p class="muted">Nesta página.</p></article>
    </section>
  `;
}

function rowHtml(row, atribuicoes) {
  const rem = num(row.remanescente);
  const zero = rem === 0;
  const isNegativo = rem < 0;
  const status = statusLabel(row);
  const atr = atribuicoes.filter((a) => String(a.os_id) === String(row.id));
  const main = atr[0] || null;
  const rowColorClass = isNegativo ? 'os-lite-row-kg' : row.observacao_logistica?.startsWith('KG solicitado') ? 'os-lite-row-kg' : status === 'AGUARDAR' ? 'os-lite-row-aguardar' : status === 'ATENDER' ? 'os-lite-row-atender' : status === 'FINALIZAR' ? 'os-lite-row-finalizar' : '';
  const statusButtons = STATUS_OPTIONS.map((opt) => `<button class="os-lite-btn ${opt === 'AGUARDAR' ? 'warn' : opt === 'FINALIZAR' ? 'danger' : ''} ${status === opt ? 'active' : ''}" data-status="${opt}" title="${opt}">${opt === 'AGUARDAR' ? 'Ⅱ' : opt === 'ATENDER' ? '✓' : '$'}</button>`).join('');
  return `<tr data-os-id="${escapeHtml(row.id)}" class="${zero ? 'os-lite-zero' : ''} ${rowColorClass}">
    <td><div class="os-lite-title">${escapeHtml(row.numero_os)}</div><div class="os-lite-meta">${brDate(row.data_os)}</div><div class="os-lite-meta">${escapeHtml(row.servico || '-')}</div><div class="os-lite-meta">${escapeHtml(row.supervisao || '-')}</div>${zero ? '<div class="os-lite-meta" style="color:#fde68a">Remanescente zerado</div>' : ''}</td>
    <td><div class="os-lite-title">${escapeHtml(row.cliente || '-')}</div><div class="os-lite-meta os-lite-route">Emb.: ${escapeHtml(row.embarque || '-')}</div><div class="os-lite-meta os-lite-route">Dest.: ${escapeHtml(row.destino || '-')}</div><div class="os-lite-meta os-lite-route">Contrato ${escapeHtml(row.contrato || '-')} • ${escapeHtml(row.produto || '-')}</div></td>
    <td><div class="os-lite-rembox"><span class="os-lite-chip ${zero ? 'warn' : rem <= 555000 ? 'info' : 'ok'}">${fmtTon(rem)}</span><div class="os-lite-meta">Lote ${fmtTon(row.lote)}</div><div class="os-lite-meta">Emb. ${fmtTon(row.embarcado)}</div></div></td>
    <td>${main ? `<div class="os-lite-title">${escapeHtml(main.colaborador_nome || '-')}</div><div class="os-lite-meta">${main.distancia_km != null ? `${KM.format(main.distancia_km)} km` : 'Indicado'}</div>` : '<div class="os-lite-meta">Sem indicação. Ao marcar ATENDER, o painel tenta sugerir pelo mapa operacional.</div>'}</td>
    <td><div class="os-lite-buttons">${statusButtons}</div><div style="margin-top:8px"><span class="os-lite-chip ${statusClass(row)}">${escapeHtml(status)}</span></div></td>
  </tr>`;
}

export async function renderOsProgramacaoLite(content, options = {}) {
  injectStyles();
  const token = ++loadToken;
  const state = {
    supervisao: String(options.supervisao || '').trim(),
    status: String(options.status || '').trim(),
    rows: [],
    atribuicoes: [],
    total: 0,
    offset: 0,
    loadingMore: false,
  };

  if (!currentUser) currentUser = await getCurrentUser().catch(() => null);

  content.innerHTML = `
    <div id="osLiteRoot">
      <div class="os-lite-actions"><span class="muted" id="osLiteFeedback">Preparando consulta...</span><button type="button" class="btn btn-secondary" id="osLiteReload">↻ Atualizar</button></div>
      <div id="osLiteStats"></div>
      <div id="osLiteList"><div class="os-lite-empty">Carregando...</div></div>
    </div>
  `;

  const el = {
    feedback: content.querySelector('#osLiteFeedback'),
    reload: content.querySelector('#osLiteReload'),
    stats: content.querySelector('#osLiteStats'),
    list: content.querySelector('#osLiteList'),
  };

  if (!state.supervisao) {
    el.feedback.textContent = 'Selecione uma supervisão no topo para evitar consulta pesada no banco.';
    el.list.innerHTML = '<div class="os-lite-empty">Selecione uma supervisão e clique em Carregar.</div>';
    return;
  }

  async function loadPage({ append = false } = {}) {
    if (token !== loadToken || state.loadingMore) return;
    state.loadingMore = true;
    const from = append ? state.rows.length : 0;
    const to = from + PAGE_SIZE - 1;
    el.feedback.textContent = append ? 'Carregando mais O.S...' : `Consultando Supabase para ${state.supervisao}...`;

    try {
      const { data, error, count } = await buildQuery(state.supervisao, state.status, from, to);
      if (error) throw error;
      const chunk = Array.isArray(data) ? data : [];
      const atribuicoes = await loadAtribuicoes(chunk.map((row) => row.id));
      if (append) {
        state.rows = [...state.rows, ...chunk];
        state.atribuicoes = [...state.atribuicoes, ...atribuicoes];
      } else {
        state.rows = chunk;
        state.atribuicoes = atribuicoes;
      }
      state.total = count ?? state.rows.length;
      render();
    } catch (error) {
      console.error(error);
      el.feedback.textContent = error.message || 'Erro ao carregar O.S.';
      el.list.innerHTML = `<div class="os-lite-empty">${escapeHtml(error.message || 'Erro ao carregar O.S.')}</div>`;
    } finally {
      state.loadingMore = false;
    }
  }

  function render() {
    if (token !== loadToken) return;
    el.stats.innerHTML = statsHtml(state.rows, state.total);
    el.feedback.textContent = `Mostrando ${BR.format(state.rows.length)} de ${BR.format(state.total || state.rows.length)} O.S. filtradas.`;
    if (!state.rows.length) {
      el.list.innerHTML = '<div class="os-lite-empty">Nenhuma O.S. encontrada para o filtro atual.</div>';
      return;
    }
    const more = state.rows.length < state.total
      ? `<div class="os-lite-load-more"><button type="button" class="btn btn-secondary" id="osLiteMore">Carregar mais ${Math.min(PAGE_SIZE, state.total - state.rows.length)} O.S.</button></div>`
      : '';
    el.list.innerHTML = `<div class="os-lite-table-wrap"><table class="os-lite-table"><colgroup><col class="os-lite-num"><col class="os-lite-cliente"><col class="os-lite-rem"><col class="os-lite-ind"><col class="os-lite-acao"></colgroup><thead><tr><th>O.S.</th><th>Cliente / rota</th><th>Remanescente</th><th>Indicação operacional</th><th>Ação gestor</th></tr></thead><tbody>${state.rows.map((row) => rowHtml(row, state.atribuicoes)).join('')}</tbody></table></div>${more}`;
    el.list.querySelector('#osLiteMore')?.addEventListener('click', () => loadPage({ append: true }));
  }

  async function atualizarStatus(osId, nextStatus, button) {
    const row = state.rows.find((item) => String(item.id) === String(osId));
    if (!row || button?.disabled) return;
    const previous = { ...row };
    const previousAtribuicoes = [...state.atribuicoes];
    button.disabled = true;

    try {
      if (nextStatus === 'ATENDER') {
        const atual = state.atribuicoes.filter((a) => String(a.os_id) === String(row.id));
        if (!atual.length) {
          el.feedback.textContent = `Buscando colaborador sugerido para OS ${row.numero_os}...`;
          const novo = await sugerirColaborador(row, state.atribuicoes);
          state.atribuicoes = [...state.atribuicoes.filter((a) => !(String(a.os_id) === String(novo.os_id) && String(a.colaborador_key) === String(novo.colaborador_key))), novo];
        }
      }

      const agoraIso = new Date().toISOString();
      const patch = {
        status_gestor: nextStatus,
        configurada_em: agoraIso,
        observacao_logistica: null,
      };
      if (nextStatus === 'FINALIZAR') {
        patch.status_logistica = 'PENDENTE';
        patch.enviado_logistica_em = row.enviado_logistica_em || agoraIso;
        patch.logistica_solicitado_por = currentUser?.id || null;
      } else {
        patch.status_logistica = null;
        patch.enviado_logistica_em = null;
        patch.logistica_solicitado_por = null;
      }

      Object.assign(row, patch);
      render();
      const { error } = await supabase.from('operacional_os').update({ ...patch, updated_at: agoraIso }).eq('id', osId);
      if (error) throw error;

      if (nextStatus === 'ATENDER') {
        try {
          const engine = window.__painelNotifEngine;
          if (engine) {
            await engine.criarNotificacao({
              tipo: 'os_atender',
              titulo: `OS ${row.numero_os} pronta para conferência`,
              descricao: `${row.supervisao || ''} — ${row.cliente || ''} — ${row.data_os || ''}`,
              destinatario_modulo: 'distribuir_os',
              supervisao: row.supervisao || null,
              referencia_tabela: 'operacional_os',
              referencia_id: String(row.id),
              chave_dedup: `os_atender:${row.id}`,
            });
          }
        } catch (_) {}
      }

      el.feedback.textContent = `OS ${row.numero_os} atualizada para ${nextStatus}.`;
    } catch (error) {
      console.error(error);
      Object.assign(row, previous);
      state.atribuicoes = previousAtribuicoes;
      render();
      alert(error.message || 'Não foi possível atualizar a O.S.');
    }
  }

  el.reload.addEventListener('click', () => loadPage({ append: false }));
  el.list.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-status]');
    if (!btn) return;
    const tr = btn.closest('[data-os-id]');
    if (!tr) return;
    atualizarStatus(tr.dataset.osId, btn.dataset.status, btn);
  });

  await loadPage({ append: false });
}
