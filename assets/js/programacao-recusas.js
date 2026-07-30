// Etapa "3 - Recusas": despesas da programação marcadas com PENDÊNCIA pela
// Conferência (adm-conferencia.js, tabela programacao_conferencia_status,
// status_conferencia='PENDENCIA') aparecem aqui pro Gestor Aceitar (concorda
// com a pendência, sem mais ação) ou Contestar (motivo obrigatório + anexos,
// grava em programacao_recusas_respostas pra Conferência reavaliar depois).
import { supabase } from './supabaseClient.js';
import { getCurrentUser } from './auth.js';

function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function brDateTime(value) {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

const state = { aberto: {} }; // { [conferenciaStatusId]: true } — box de contestar aberta

function injectStyles() {
  if (document.getElementById('progRecusasStyles')) return;
  const style = document.createElement('style');
  style.id = 'progRecusasStyles';
  style.textContent = `
    .pgr-list{display:flex;flex-direction:column;gap:10px}
    .pgr-card{border:1px solid rgba(239,68,68,.28);background:rgba(120,20,20,.08);border-radius:14px;padding:12px 14px}
    .pgr-card.resolvida{border-color:rgba(34,197,94,.28);background:rgba(15,60,30,.08)}
    .pgr-head{display:flex;justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap}
    .pgr-nome{font-weight:900;color:#f8fafc;font-size:13.5px}
    .pgr-meta{font-size:11px;color:#9fb7aa;margin-top:2px}
    .pgr-motivo{margin-top:8px;font-size:12.5px;color:#fecaca;line-height:1.4}
    .pgr-motivo b{color:#fca5a5}
    .pgr-acoes{display:flex;gap:8px;flex-shrink:0}
    .pgr-btn{border:1px solid rgba(148,163,184,.24);background:rgba(15,23,42,.6);color:#e2e2f0;border-radius:10px;padding:8px 14px;font-weight:800;font-size:12.5px;cursor:pointer}
    .pgr-btn:hover{background:rgba(22,101,52,.18)}
    .pgr-btn-aceitar{background:rgba(22,163,74,.2);border-color:rgba(34,197,94,.4);color:#bbf7d0}
    .pgr-btn-contestar{background:rgba(239,68,68,.14);border-color:rgba(239,68,68,.35);color:#fecaca}
    .pgr-resposta-badge{display:inline-flex;align-items:center;border-radius:999px;padding:5px 11px;font-size:11.5px;font-weight:900}
    .pgr-resposta-badge.aceito{background:rgba(22,163,74,.18);color:#bbf7d0;border:1px solid rgba(34,197,94,.35)}
    .pgr-resposta-badge.contestado{background:rgba(234,179,8,.14);color:#fde68a;border:1px solid rgba(234,179,8,.32)}
    .pgr-contestar-box{margin-top:10px;padding:10px;border:1px dashed rgba(239,68,68,.35);border-radius:12px;background:rgba(15,23,42,.35)}
    .pgr-contestar-box textarea{width:100%;box-sizing:border-box;min-height:70px;border:1px solid rgba(148,163,184,.28);background:#0d0d18;color:#e2e2f0;border-radius:10px;padding:9px 11px;font-size:13px;resize:vertical}
    .pgr-contestar-box input[type=file]{display:block;margin-top:8px;font-size:12px;color:#8fa1b5}
    .pgr-contestar-box .pgr-erro{color:#fca5a5;font-size:11.5px;font-weight:800;display:none;margin-top:4px}
    .pgr-contestar-actions{display:flex;gap:8px;margin-top:10px}
    .pgr-empty{border:1px dashed rgba(148,163,184,.22);border-radius:14px;padding:24px;text-align:center;color:#94a3b8;font-size:13px}
    .pgr-resposta-detalhe{margin-top:6px;font-size:12px;color:#9fb7aa}
    .pgr-resposta-detalhe a{color:#93c5fd}
  `;
  document.head.appendChild(style);
}

async function carregarPendencias(programacaoIds) {
  if (!programacaoIds.length) return [];
  const { data, error } = await supabase
    .from('programacao_conferencia_status')
    .select('*')
    .eq('status_conferencia', 'PENDENCIA')
    .in('programacao_id', programacaoIds)
    .order('conferido_em', { ascending: false });
  if (error) { console.error('[programacao-recusas] pendências:', error); return []; }
  return data || [];
}

async function carregarRespostas(ids) {
  if (!ids.length) return new Map();
  const { data, error } = await supabase
    .from('programacao_recusas_respostas')
    .select('*')
    .in('conferencia_status_id', ids);
  if (error) { console.error('[programacao-recusas] respostas:', error); return new Map(); }
  return new Map((data || []).map((r) => [r.conferencia_status_id, r]));
}

function cardHtml(row, resposta) {
  const aberto = !!state.aberto[row.id];
  if (resposta) {
    const tipo = resposta.resposta === 'ACEITO' ? 'aceito' : 'contestado';
    const label = resposta.resposta === 'ACEITO' ? '✔ Aceito' : '⚠ Contestado';
    return `<article class="pgr-card resolvida" data-recusa-id="${esc(row.id)}">
      <div class="pgr-head">
        <div>
          <div class="pgr-nome">${esc(row.nome_colaborador || 'Colaborador')}</div>
          <div class="pgr-meta">${esc(row.coordenacao || row.supervisao || '-')} · Pendência em ${brDateTime(row.conferido_em)}</div>
        </div>
        <span class="pgr-resposta-badge ${tipo}">${label}</span>
      </div>
      <div class="pgr-motivo"><b>Motivo da pendência:</b> ${esc(row.observacao_conferencia || 'Não informado.')}</div>
      ${resposta.resposta === 'CONTESTADO' ? `<div class="pgr-resposta-detalhe"><b>Motivo da contestação:</b> ${esc(resposta.motivo || '')}${(resposta.anexos_urls || []).length ? `<br>${resposta.anexos_urls.map((u, i) => `<a href="${esc(u)}" target="_blank" rel="noopener">📎 Anexo ${i + 1}</a>`).join(' · ')}` : ''}</div>` : ''}
    </article>`;
  }

  return `<article class="pgr-card" data-recusa-id="${esc(row.id)}">
    <div class="pgr-head">
      <div>
        <div class="pgr-nome">${esc(row.nome_colaborador || 'Colaborador')}</div>
        <div class="pgr-meta">${esc(row.coordenacao || row.supervisao || '-')} · Pendência em ${brDateTime(row.conferido_em)}</div>
      </div>
      <div class="pgr-acoes">
        <button type="button" class="pgr-btn pgr-btn-aceitar" data-recusa-aceitar="${esc(row.id)}">Aceitar</button>
        <button type="button" class="pgr-btn pgr-btn-contestar" data-recusa-contestar="${esc(row.id)}">Contestar</button>
      </div>
    </div>
    <div class="pgr-motivo"><b>Motivo da pendência:</b> ${esc(row.observacao_conferencia || 'Não informado.')}</div>
    ${aberto ? `<div class="pgr-contestar-box" data-recusa-box="${esc(row.id)}">
      <textarea data-recusa-motivo placeholder="Descreva por que está contestando esta pendência..."></textarea>
      <span class="pgr-erro" data-recusa-erro>Informe o motivo da contestação.</span>
      <input type="file" data-recusa-anexo accept="image/*,.pdf" multiple>
      <div class="pgr-contestar-actions">
        <button type="button" class="pgr-btn pgr-btn-contestar" data-recusa-enviar-contestacao="${esc(row.id)}">Enviar contestação</button>
        <button type="button" class="pgr-btn" data-recusa-cancelar="${esc(row.id)}">Cancelar</button>
      </div>
    </div>` : ''}
  </article>`;
}

async function currentUsuario() {
  const u = await getCurrentUser().catch(() => null);
  return { id: u?.id || null, nome: u?.user_metadata?.nome || u?.email || null };
}

async function uploadAnexosContestacao(rowId, files) {
  const usuario = await currentUsuario();
  const urls = [];
  for (const file of files) {
    const path = `recusas/${rowId}/${Date.now()}_${(file.name || 'anexo').replace(/\s+/g, '_')}`;
    const { data: up, error: upErr } = await supabase.storage.from('os-laudos').upload(path, file, { upsert: true });
    if (upErr) throw upErr;
    const { data: urlData } = supabase.storage.from('os-laudos').getPublicUrl(up.path);
    urls.push(urlData.publicUrl);
  }
  return { urls, usuario };
}

export async function renderProgramacaoRecusas(content, options = {}) {
  injectStyles();
  const programacaoIdMap = options.programacaoIdMap instanceof Map ? options.programacaoIdMap : new Map();
  const programacaoIds = programacaoIdMap.size ? [...programacaoIdMap.values()].filter(Boolean) : [options.programacaoId].filter(Boolean);

  let pendencias = await carregarPendencias(programacaoIds);
  let respostas = await carregarRespostas(pendencias.map((r) => r.id));

  async function refresh() {
    pendencias = await carregarPendencias(programacaoIds);
    respostas = await carregarRespostas(pendencias.map((r) => r.id));
    montar(pendencias, respostas);
  }

  function montar(rows, respostasMap) {
    if (!rows.length) {
      content.innerHTML = '<div class="pgr-empty">Nenhuma despesa em pendência para esta programação.</div>';
      return;
    }
    content.innerHTML = `<div class="pgr-list">${rows.map((row) => cardHtml(row, respostasMap.get(row.id))).join('')}</div>`;
  }

  montar(pendencias, respostas);

  content.addEventListener('click', async (event) => {
    const aceitarBtn = event.target.closest('[data-recusa-aceitar]');
    if (aceitarBtn) {
      const id = aceitarBtn.dataset.recusaAceitar;
      const row = pendencias.find((r) => String(r.id) === String(id));
      if (!row) return;
      aceitarBtn.disabled = true;
      aceitarBtn.textContent = 'Salvando...';
      const usuario = await currentUsuario();
      const { error } = await supabase.from('programacao_recusas_respostas').upsert({
        conferencia_status_id: row.id,
        programacao_id: row.programacao_id,
        colaborador_id: row.colaborador_id,
        data_referencia: row.data_referencia,
        resposta: 'ACEITO',
        motivo: null,
        anexos_urls: [],
        respondido_por: usuario.id,
        respondido_por_nome: usuario.nome,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'conferencia_status_id' });
      if (error) { alert(error.message || 'Não foi possível registrar a aceitação.'); aceitarBtn.disabled = false; aceitarBtn.textContent = 'Aceitar'; return; }
      await refresh();
      return;
    }

    const contestarBtn = event.target.closest('[data-recusa-contestar]');
    if (contestarBtn) {
      state.aberto[contestarBtn.dataset.recusaContestar] = true;
      montar(pendencias, respostas);
      return;
    }

    const cancelarBtn = event.target.closest('[data-recusa-cancelar]');
    if (cancelarBtn) {
      delete state.aberto[cancelarBtn.dataset.recusaCancelar];
      montar(pendencias, respostas);
      return;
    }

    const enviarBtn = event.target.closest('[data-recusa-enviar-contestacao]');
    if (enviarBtn) {
      const id = enviarBtn.dataset.recusaEnviarContestacao;
      const row = pendencias.find((r) => String(r.id) === String(id));
      const box = content.querySelector(`[data-recusa-box="${CSS.escape(String(id))}"]`);
      if (!row || !box) return;
      const motivo = box.querySelector('[data-recusa-motivo]')?.value?.trim() || '';
      const erroEl = box.querySelector('[data-recusa-erro]');
      if (motivo.length < 5) { if (erroEl) erroEl.style.display = 'block'; return; }
      if (erroEl) erroEl.style.display = 'none';

      const fileInput = box.querySelector('[data-recusa-anexo]');
      const files = [...(fileInput?.files || [])];
      enviarBtn.disabled = true;
      enviarBtn.textContent = 'Enviando...';
      try {
        const { urls, usuario } = await uploadAnexosContestacao(id, files);
        const { error } = await supabase.from('programacao_recusas_respostas').upsert({
          conferencia_status_id: row.id,
          programacao_id: row.programacao_id,
          colaborador_id: row.colaborador_id,
          data_referencia: row.data_referencia,
          resposta: 'CONTESTADO',
          motivo,
          anexos_urls: urls,
          respondido_por: usuario.id,
          respondido_por_nome: usuario.nome,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'conferencia_status_id' });
        if (error) throw error;
        delete state.aberto[id];
        await refresh();
      } catch (error) {
        alert(error.message || 'Não foi possível enviar a contestação.');
        enviarBtn.disabled = false;
        enviarBtn.textContent = 'Enviar contestação';
      }
      return;
    }
  });
}
