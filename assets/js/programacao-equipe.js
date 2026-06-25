// Etapa B da Programação: "quem vai atender as OS disponíveis".
// Cruza os colaboradores da regional/supervisão selecionada com as OS em
// ATENDER e sugere candidatos ranqueados (Contrato 50% / Distância 30% /
// Auditoria 20%); o gestor confirma quem atende cada OS.
import { supabase } from './supabaseClient.js';

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
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}

function hasGeo(lat, lng) {
  return Number.isFinite(Number(lat)) && Number.isFinite(Number(lng));
}

function round1(n) { return Math.round(n * 10) / 10; }

function contratoLabel(tipo) {
  const norm = normalizeText(tipo);
  if (norm.includes('EFETIVO')) return 'Efetivo';
  if (norm.includes('INTERMITENTE')) return 'Intermitente';
  if (norm.includes('DIARISTA')) return 'Diarista';
  return 'Não informado';
}

function injectStyles() {
  if (document.getElementById('progEquipeStyles')) return;
  const style = document.createElement('style');
  style.id = 'progEquipeStyles';
  style.textContent = `
    .peq-kpis{display:grid;grid-template-columns:repeat(2,minmax(140px,1fr));gap:10px;margin-bottom:12px}
    .peq-kpi{border:1px solid rgba(34,197,94,.18);background:rgba(2,6,23,.32);border-radius:12px;padding:10px}
    .peq-kpi span{display:block;color:#93c5fd;font-size:9.5px;font-weight:950;letter-spacing:.08em;text-transform:uppercase}
    .peq-kpi strong{display:block;margin-top:4px;color:#fff;font-size:18px}
    .peq-os-list{display:flex;flex-direction:column;gap:10px}
    .peq-os-card{border:1px solid rgba(52,211,153,.18);border-radius:16px;background:rgba(2,6,23,.32);padding:12px}
    .peq-os-head{display:flex;justify-content:space-between;gap:8px;align-items:flex-start;color:#f8fafc;font-weight:950;font-size:13px}
    .peq-os-head small{color:#bbf7d0;font-size:11px;white-space:nowrap}
    .peq-os-meta{color:#94a3b8;font-size:11.5px;margin-top:3px;line-height:1.35}
    .peq-confirmado{margin-top:8px;border:1px solid rgba(34,197,94,.35);background:rgba(22,101,52,.18);border-radius:12px;padding:8px 10px;display:flex;justify-content:space-between;align-items:center;gap:8px}
    .peq-confirmado b{color:#dcfce7;font-size:12.5px}
    .peq-confirmado small{display:block;color:#a7f3d0;font-size:11px;margin-top:2px}
    .peq-candidatos{margin-top:8px;border-top:1px solid rgba(148,163,184,.12);padding-top:8px}
    .peq-cand-row{display:grid;grid-template-columns:1fr auto;gap:8px;align-items:center;padding:6px 4px;border-radius:8px}
    .peq-cand-row:hover{background:rgba(34,197,94,.07)}
    .peq-cand-nome{color:#f1f5f9;font-size:12.5px;font-weight:800}
    .peq-cand-info{color:#94a3b8;font-size:11px;margin-top:1px}
    .peq-cand-badges{display:flex;flex-wrap:wrap;gap:5px;margin-top:4px}
    .peq-badge{display:inline-flex;align-items:center;border-radius:999px;padding:2px 8px;font-size:10px;font-weight:850;border:1px solid rgba(148,163,184,.18);background:rgba(15,23,42,.6);color:#cbd5e1;white-space:nowrap}
    .peq-badge--ok{border-color:rgba(34,197,94,.35);background:rgba(22,101,52,.22);color:#bbf7d0}
    .peq-badge--warn{border-color:rgba(245,158,11,.32);background:rgba(245,158,11,.12);color:#fde68a}
    .peq-badge--muted{border-color:rgba(148,163,184,.18);background:rgba(15,23,42,.5);color:#94a3b8}
    .peq-badge--score{border-style:dashed;color:#93c5fd}
    .peq-btn{border:1px solid rgba(134,239,172,.35);background:rgba(22,163,74,.16);color:#dcfce7;border-radius:999px;padding:6px 11px;font-size:11.5px;font-weight:950;cursor:pointer;white-space:nowrap}
    .peq-btn:hover{background:rgba(22,163,74,.3)}
    .peq-btn.danger{border-color:rgba(239,68,68,.35);background:rgba(239,68,68,.14);color:#fecaca}
    .peq-btn:disabled{opacity:.6;cursor:not-allowed}
    .peq-empty{border:1px dashed rgba(148,163,184,.22);border-radius:14px;padding:22px;text-align:center;color:#94a3b8;line-height:1.4}
  `;
  document.head.appendChild(style);
}

async function loadOsAtender(supervisao) {
  const { data, error } = await supabase
    .from('operacional_os')
    .select('id,numero_os,cliente,embarque,ponto_embarque_id,ponto1_latitude,ponto1_longitude,supervisao')
    .eq('supervisao', supervisao)
    .eq('status_gestor', 'ATENDER')
    .order('numero_os', { ascending: false })
    .limit(300);
  if (error) throw error;
  return data || [];
}

async function loadPontos(ids) {
  if (!ids.length) return new Map();
  const { data, error } = await supabase
    .from('operacional_pontos_embarque')
    .select('id,nome_local,latitude,longitude')
    .in('id', ids);
  if (error) throw error;
  return new Map((data || []).map((p) => [p.id, p]));
}

async function loadEquipeExistente(programacaoId) {
  const { data, error } = await supabase.from('programacao_equipe').select('*').eq('programacao_id', programacaoId);
  if (error) throw error;
  return data || [];
}

function pontoDaOs(os, pontosPorId) {
  if (hasGeo(os.ponto1_latitude, os.ponto1_longitude)) {
    return { lat: Number(os.ponto1_latitude), lng: Number(os.ponto1_longitude), nome: os.embarque };
  }
  const ponto = os.ponto_embarque_id ? pontosPorId.get(os.ponto_embarque_id) : null;
  if (ponto && hasGeo(ponto.latitude, ponto.longitude)) {
    return { lat: Number(ponto.latitude), lng: Number(ponto.longitude), nome: ponto.nome_local || os.embarque };
  }
  return null;
}

// O ranking de candidatos (Contrato/Distância/Auditoria) é calculado no banco
// pela RPC programacao_etapa_b_candidatos (ver migração
// 20260625130000_programacao_etapa_b_candidatos_rpc.sql), que já filtra pelos
// top 8 por OS usando colaborador_cruzamento pré-computado. Antes esse cálculo
// rodava no navegador para cada OS x cada colaborador da supervisão e travava
// a tela em supervisões grandes.
async function loadCandidatosPorOs(supervisao, osComPonto, excluirIds) {
  const osPayload = osComPonto
    .filter(({ candidatosNecessarios }) => candidatosNecessarios)
    .map(({ os, ponto }) => ({ os_id: os.id, lat: ponto?.lat ?? null, lng: ponto?.lng ?? null }));
  if (!osPayload.length) return new Map();

  const { data, error } = await supabase.rpc('programacao_etapa_b_candidatos', {
    p_supervisao: supervisao,
    p_excluir_colaborador_ids: [...excluirIds],
    p_os: osPayload,
  });
  if (error) throw error;

  const porOs = new Map();
  (data || []).forEach((row) => {
    const lista = porOs.get(row.os_id) || [];
    lista.push({
      colaborador: { nome: row.nome, cargo: row.cargo, coordenacao: row.coordenacao, supervisao: row.supervisao },
      colaboradorId: row.colaborador_id,
      tipoLabel: contratoLabel(row.tipo_contrato),
      km: row.km != null ? Number(row.km) : null,
      auditPeso: row.auditorias_peso != null ? Number(row.auditorias_peso) : null,
      scoreContrato: Number(row.score_contrato),
      scoreDistancia: Number(row.score_distancia),
      scoreAuditoria: Number(row.score_auditoria),
      score: Number(row.score),
    });
    porOs.set(row.os_id, lista);
  });
  return porOs;
}

function contratoBadgeClass(tipoLabel) {
  if (tipoLabel === 'Efetivo') return 'peq-badge--ok';
  if (tipoLabel === 'Intermitente') return 'peq-badge--warn';
  return 'peq-badge--muted';
}

function candidatoBadgesHtml(cand) {
  const km = cand.km != null ? `${cand.km} km` : 'sem coord.';
  const aud = cand.auditPeso != null ? `${cand.auditPeso.toFixed(1)} pts aud.` : 'sem auditoria';
  return `
    <span class="peq-badge ${contratoBadgeClass(cand.tipoLabel)}">${esc(cand.tipoLabel)}</span>
    <span class="peq-badge ${cand.km != null ? 'peq-badge--ok' : 'peq-badge--muted'}">${esc(km)}</span>
    <span class="peq-badge ${cand.auditPeso != null ? 'peq-badge--warn' : 'peq-badge--muted'}">${esc(aud)}</span>
    <span class="peq-badge peq-badge--score">score ${(cand.score * 100).toFixed(0)}</span>
  `;
}

function osCardHtml(item) {
  const { os, confirmadoRow, candidatos } = item;
  const confirmadoHtml = confirmadoRow
    ? `<div class="peq-confirmado">
        <div><b>${esc(confirmadoRow.nome_colaborador)}</b><small>Confirmado · ${confirmadoRow.km_estimado != null ? `${confirmadoRow.km_estimado} km` : 'sem rota'}</small></div>
        <button type="button" class="peq-btn danger" data-remover="${esc(confirmadoRow.id)}">Remover</button>
      </div>`
    : '';
  const candidatosHtml = candidatos.length
    ? `<div class="peq-candidatos">${candidatos.map((c) => `
        <div class="peq-cand-row">
          <div><div class="peq-cand-nome">${esc(c.colaborador.nome)}</div><div class="peq-cand-badges">${candidatoBadgesHtml(c)}</div></div>
          <button type="button" class="peq-btn" data-confirmar="${esc(c.colaboradorId)}">Confirmar</button>
        </div>`).join('')}</div>`
    : '<div class="peq-cand-info" style="margin-top:8px">Nenhum candidato disponível (todos já confirmados em outras OS).</div>';

  return `
    <article class="peq-os-card" data-os-id="${esc(os.id)}">
      <div class="peq-os-head"><span>${esc(os.cliente || '-')}</span><small>OS ${esc(os.numero_os || '-')}</small></div>
      <div class="peq-os-meta">Embarque: ${esc(os.embarque || '-')}</div>
      ${confirmadoHtml}
      ${confirmadoRow ? '' : candidatosHtml}
    </article>
  `;
}

function atualizarKpis(root, osComCandidatos, confirmadosPorOs) {
  const kpiKmEl = root.querySelector('#peqKpiKm');
  const kpiOsEl = root.querySelector('#peqKpiOs');
  const kmTotal = osComCandidatos.reduce((soma, { os }) => {
    const km = confirmadosPorOs.get(os.id)?.km_estimado;
    return soma + (Number.isFinite(km) ? km : 0);
  }, 0);
  if (kpiKmEl) kpiKmEl.textContent = `${round1(kmTotal)} km`;
  if (kpiOsEl) kpiOsEl.textContent = String(confirmadosPorOs.size);
}

export async function renderProgramacaoEquipe(content, options = {}) {
  injectStyles();
  const supervisao = String(options.supervisao || '').trim();
  const programacaoId = options.programacaoId || null;

  content.innerHTML = `
    <div class="prog-section-title">
      <h4>Organizar Equipe</h4>
      <span class="badge">Etapa B</span>
    </div>
    <div class="peq-kpis">
      <div class="peq-kpi"><span>Km total estimado</span><strong id="peqKpiKm">0 km</strong></div>
      <div class="peq-kpi"><span>OS com equipe</span><strong id="peqKpiOs">0</strong></div>
    </div>
    <div class="peq-os-list" id="peqOsList"><div class="peq-empty">Carregando OS em ATENDER...</div></div>
  `;

  const listEl = content.querySelector('#peqOsList');

  if (!supervisao || !programacaoId) {
    listEl.innerHTML = '<div class="peq-empty">Carregue o contexto (supervisão e data) para organizar a equipe.</div>';
    return;
  }

  let carregando = false;
  let osComCandidatosAtual = [];
  async function carregarERenderizar() {
    if (carregando) return;
    carregando = true;
    listEl.innerHTML = '<div class="peq-empty">Carregando OS em ATENDER...</div>';
    try {
      const [osRows, equipeRows] = await Promise.all([loadOsAtender(supervisao), loadEquipeExistente(programacaoId)]);
      if (!osRows.length) {
        listEl.innerHTML = '<div class="peq-empty">Nenhuma OS marcada como ATENDER para esta supervisão. Confirme as OS na etapa A.</div>';
        return;
      }

      const pontosPorId = await loadPontos([...new Set(osRows.map((os) => os.ponto_embarque_id).filter(Boolean))]);

      const confirmadosPorOs = new Map();
      equipeRows.filter((r) => r.confirmado).forEach((r) => confirmadosPorOs.set(r.os_id, r));
      const colaboradoresConfirmadosEmOutraOs = new Set(equipeRows.filter((r) => r.confirmado).map((r) => r.colaborador_id));

      const osComPonto = osRows.map((os) => {
        const confirmadoRow = confirmadosPorOs.get(os.id) || null;
        return { os, ponto: pontoDaOs(os, pontosPorId), confirmadoRow, candidatosNecessarios: !confirmadoRow };
      });
      const candidatosPorOs = await loadCandidatosPorOs(supervisao, osComPonto, colaboradoresConfirmadosEmOutraOs);

      osComCandidatosAtual = osComPonto.map(({ os, ponto, confirmadoRow }) => ({
        os,
        ponto,
        confirmadoRow,
        candidatos: confirmadoRow ? [] : (candidatosPorOs.get(os.id) || []),
      }));
      listEl.innerHTML = osComCandidatosAtual.map(osCardHtml).join('');

      atualizarKpis(content, osComCandidatosAtual, confirmadosPorOs);
    } catch (error) {
      console.error('[programacao-equipe] render:', error);
      listEl.innerHTML = `<div class="peq-empty">${esc(error.message || 'Erro ao montar a equipe.')}</div>`;
    } finally {
      carregando = false;
    }
  }

  if (!listEl.dataset.peqBound) {
    listEl.dataset.peqBound = '1';
    listEl.addEventListener('click', async (event) => {
      const btnConfirmar = event.target.closest('[data-confirmar]');
      const btnRemover = event.target.closest('[data-remover]');
      if (!btnConfirmar && !btnRemover) return;
      const btn = btnConfirmar || btnRemover;
      const osCard = btn.closest('[data-os-id]');
      const osId = osCard?.dataset.osId;
      btn.disabled = true;
      try {
        if (btnConfirmar) {
          const item = osComCandidatosAtual.find((it) => String(it.os.id) === osId);
          const cand = item?.candidatos.find((c) => c.colaboradorId === btn.dataset.confirmar);
          if (item && cand) await confirmarCandidato(programacaoId, item.os, cand);
        } else if (btnRemover) {
          await removerConfirmacao(programacaoId, btn.dataset.remover);
        }
        await carregarERenderizar();
      } catch (error) {
        console.error('[programacao-equipe] ação:', error);
        btn.disabled = false;
        alert(error.message || 'Erro ao salvar. Tente novamente.');
      }
    });
  }

  await carregarERenderizar();
}

async function confirmarCandidato(programacaoId, os, cand) {
  const colab = cand.colaborador;
  const payload = {
    programacao_id: programacaoId,
    os_id: os.id,
    colaborador_id: cand.colaboradorId,
    nome_colaborador: colab.nome,
    score: cand.score,
    score_contrato: cand.scoreContrato,
    score_distancia: cand.scoreDistancia,
    score_auditoria: cand.scoreAuditoria,
    km_estimado: cand.km,
    confirmado: true,
  };
  const { error } = await supabase.from('programacao_equipe').upsert(payload, { onConflict: 'programacao_id,os_id,colaborador_id' });
  if (error) throw error;

  // operacional_os_colaboradores é o vínculo OS<->colaborador usado por outras
  // telas (Frotas Roteirização, relatórios) — replica aqui o mesmo padrão
  // "substitui a atribuição da OS" que a distribuição manual já fazia.
  const { error: delErr } = await supabase.from('operacional_os_colaboradores').delete().eq('os_id', os.id);
  if (delErr) console.warn('[programacao-equipe] falha ao limpar vínculo anterior da OS.', delErr);
  const cpfCandidato = /^\d+$/.test(cand.colaboradorId) ? cand.colaboradorId : null;
  const { error: vinculoErr } = await supabase.from('operacional_os_colaboradores').insert({
    os_id: os.id,
    colaborador_key: cand.colaboradorId,
    colaborador_nome: colab.nome,
    colaborador_cpf: cpfCandidato,
    distancia_km: cand.km,
    origem_sugestao: 'PROGRAMACAO_ETAPA_B',
  });
  if (vinculoErr) console.warn('[programacao-equipe] falha ao gravar vínculo OS<->colaborador.', vinculoErr);

  const espelho = {
    programacao_id: programacaoId,
    colaborador_id: cand.colaboradorId,
    nome_colaborador: colab.nome,
    cargo: colab.cargo || null,
    coordenacao: colab.coordenacao || null,
    supervisao: colab.supervisao || null,
    disponibilidade: 'OK',
  };
  const { error: espelhoErr } = await supabase.from('programacao_colaboradores').upsert(espelho, { onConflict: 'programacao_id,colaborador_id' });
  if (espelhoErr) console.warn('[programacao-equipe] falha ao espelhar disponibilidade.', espelhoErr);
}

async function removerConfirmacao(programacaoId, equipeRowId) {
  const { data: rows, error: selErr } = await supabase.from('programacao_equipe').select('colaborador_id,os_id').eq('id', equipeRowId).limit(1);
  if (selErr) throw selErr;
  const colaboradorId = rows?.[0]?.colaborador_id;
  const osId = rows?.[0]?.os_id;

  const { error } = await supabase.from('programacao_equipe').delete().eq('id', equipeRowId);
  if (error) throw error;

  if (osId) {
    const { error: vinculoErr } = await supabase.from('operacional_os_colaboradores').delete().eq('os_id', osId);
    if (vinculoErr) console.warn('[programacao-equipe] falha ao remover vínculo OS<->colaborador.', vinculoErr);
  }

  if (colaboradorId) {
    const { error: updErr } = await supabase
      .from('programacao_colaboradores')
      .update({ disponibilidade: 'SEM EMBARQUE' })
      .eq('programacao_id', programacaoId)
      .eq('colaborador_id', colaboradorId);
    if (updErr) console.warn('[programacao-equipe] falha ao reverter disponibilidade.', updErr);
  }
}
