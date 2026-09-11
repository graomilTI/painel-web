import { supabase } from './supabaseClient.js';
import { adicionarColaboradorOs, loadColaboradoresRegional } from './programacao-equipe.js';

// Botão "Informar colaborador" na tabela "Minhas solicitações" (Gestor >
// Logística, renderAberturaOsHistorico em logistica.js) — só aparece quando a
// solicitação já virou uma O.S. real (status CADASTRADO). Roda como patch
// isolado (mesmo padrão de logistica-abertura-os-correcao.js): não importa
// logistica.js, escuta clique por delegação em [data-informar-colab].
//
// Objetivo (pedido do usuário, 2026-09-11): informar o colaborador que vai
// atender a O.S. já na tela da solicitação, sem precisar abrir a Programação
// e procurar a O.S. manualmente — grava direto nas mesmas tabelas que o
// fluxo normal de "Adicionar colaborador" da Programação usaria
// (programacao_dia/programacao_equipe/operacional_os_colaboradores/
// programacao_colaboradores/programacao_alimentacao), reaproveitando
// adicionarColaboradorOs/loadColaboradoresRegional de programacao-equipe.js
// em vez de duplicar a lógica.

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const todayIso = () => new Date().toISOString().slice(0, 10);

let styleInjected = false;
function injectStyle() {
  if (styleInjected) return;
  styleInjected = true;
  const style = document.createElement('style');
  style.textContent = `
    .iac-overlay{position:fixed;inset:0;background:rgba(2,10,7,.72);display:flex;align-items:center;justify-content:center;z-index:9999;padding:16px}
    .iac-modal{background:#08201a;border:1px solid rgba(22,215,144,.28);border-radius:14px;padding:20px;width:100%;max-width:420px;color:#dbeae3;box-shadow:0 12px 40px rgba(0,0,0,.4)}
    .iac-modal h3{margin:0 0 4px;font-size:16px;color:#eafff5}
    .iac-modal .iac-sub{margin:0 0 16px;font-size:12px;color:#8fb8ab}
    .iac-modal label{display:block;font-size:12px;color:#9fd6bf;margin-bottom:12px}
    .iac-modal input[type="date"],.iac-modal select{width:100%;margin-top:4px;padding:8px 10px;border-radius:8px;border:1px solid rgba(22,215,144,.25);background:#03150f;color:#eafff5;font-size:13px}
    .iac-despesas{border:1px solid rgba(22,215,144,.18);border-radius:10px;padding:10px 12px;margin-bottom:16px}
    .iac-despesas legend{font-size:12px;color:#9fd6bf;padding:0 4px}
    .iac-despesas label{display:inline-flex;align-items:center;gap:6px;margin:4px 14px 0 0;font-size:12px}
    .iac-despesas input{width:auto;margin:0}
    .iac-actions{display:flex;justify-content:flex-end;gap:8px}
    .iac-actions button{padding:8px 14px;border-radius:8px;border:1px solid rgba(22,215,144,.3);background:transparent;color:#dbeae3;font-size:13px;cursor:pointer}
    .iac-actions button[data-iac-confirm]{background:rgba(22,215,144,.18);border-color:rgba(22,215,144,.5);color:#72ddb0;font-weight:600}
    .iac-actions button:disabled{opacity:.6;cursor:default}
  `;
  document.head.appendChild(style);
}

const osCache = new Map();
async function loadOsPorNumero(numero) {
  if (osCache.has(numero)) return osCache.get(numero);
  const { data, error } = await supabase.from('operacional_os')
    .select('id,numero_os,cliente,embarque,destino,supervisao,data_os,status_gestor')
    .eq('numero_os', numero).maybeSingle();
  const row = error ? null : data;
  osCache.set(numero, row);
  return row;
}

async function ensureProgramacaoDia(dataReferencia, supervisao) {
  const { data: existente, error: selError } = await supabase.from('programacao_dia')
    .select('id').eq('data_referencia', dataReferencia).eq('supervisao', supervisao).maybeSingle();
  if (selError) throw selError;
  if (existente) return existente.id;
  const { data: criada, error: insError } = await supabase.from('programacao_dia')
    .insert({ data_referencia: dataReferencia, supervisao, coordenacao: supervisao, regional: supervisao, status: 'rascunho' })
    .select('id').single();
  if (insError) throw insError;
  return criada.id;
}

function fecharModal() {
  document.querySelector('[data-iac-overlay]')?.remove();
}

function modalHtml(os, colaboradores) {
  return `
  <div class="iac-overlay" data-iac-overlay>
    <div class="iac-modal">
      <h3>Informar colaborador — O.S. ${esc(os.numero_os)}</h3>
      <p class="iac-sub">${esc(os.cliente || '-')} · ${esc(os.embarque || '-')} → ${esc(os.destino || '-')}</p>
      <label>Data de início
        <input type="date" data-iac-data value="${esc(os.data_os || todayIso())}">
      </label>
      <label>Colaborador inicial
        <select data-iac-colab>
          <option value="">Escolha um colaborador…</option>
          ${colaboradores.map((c) => `<option value="${esc(c.colaboradorId)}">${esc(c.nome)}</option>`).join('')}
        </select>
      </label>
      <fieldset class="iac-despesas">
        <legend>Despesas do dia</legend>
        <label><input type="checkbox" data-iac-desp="cafe"> Café</label>
        <label><input type="checkbox" data-iac-desp="almoco"> Almoço</label>
        <label><input type="checkbox" data-iac-desp="janta"> Janta</label>
      </fieldset>
      <div class="iac-actions">
        <button type="button" data-iac-cancel>Cancelar</button>
        <button type="button" data-iac-confirm>Confirmar</button>
      </div>
    </div>
  </div>`;
}

async function confirmar(overlay, os, colaboradores) {
  const dataInicio = overlay.querySelector('[data-iac-data]').value;
  const sel = overlay.querySelector('[data-iac-colab]');
  const colaboradorId = sel.value;
  const cand = colaboradores.find((c) => String(c.colaboradorId) === colaboradorId);
  if (!dataInicio || !cand) { alert('Informe a data de início e o colaborador.'); return; }

  const btn = overlay.querySelector('[data-iac-confirm]');
  btn.disabled = true;
  btn.textContent = 'Salvando...';
  try {
    const programacaoId = await ensureProgramacaoDia(dataInicio, os.supervisao);
    await adicionarColaboradorOs(programacaoId, { ...os, data_os: dataInicio }, cand);

    const despesas = {
      cafe: !!overlay.querySelector('[data-iac-desp="cafe"]').checked,
      almoco: !!overlay.querySelector('[data-iac-desp="almoco"]').checked,
      janta: !!overlay.querySelector('[data-iac-desp="janta"]').checked,
    };
    const { error: despError } = await supabase.from('programacao_alimentacao').upsert({
      programacao_id: programacaoId,
      data_referencia: dataInicio,
      colaborador_id: cand.colaboradorId,
      nome_colaborador: cand.nome,
      ...despesas,
    }, { onConflict: 'programacao_id,colaborador_id' });
    if (despError) throw despError;

    alert(`Colaborador ${cand.nome} vinculado à O.S. ${os.numero_os} para ${dataInicio}. Já aparece em Gestor > Programação.`);
    fecharModal();
  } catch (error) {
    console.error('[informar-colaborador]', error);
    alert(error.message || 'Não foi possível salvar. Tente novamente.');
    btn.disabled = false;
    btn.textContent = 'Confirmar';
  }
}

async function abrirModal(numeroOs) {
  const os = await loadOsPorNumero(numeroOs);
  if (!os) { alert('Não encontrei essa O.S. em operacional_os ainda — o sync do GRM pode levar alguns minutos. Tente de novo em instantes.'); return; }
  if (!os.supervisao) { alert('Essa O.S. está sem Supervisão definida — não dá pra vincular colaborador automaticamente na Programação. Ajuste pela tela de Programação.'); return; }

  let colaboradores = [];
  try {
    colaboradores = await loadColaboradoresRegional(os.supervisao);
  } catch (error) {
    console.error('[informar-colaborador] lista de colaboradores', error);
    alert('Não foi possível carregar a lista de colaboradores da regional.');
    return;
  }

  injectStyle();
  const wrap = document.createElement('div');
  wrap.innerHTML = modalHtml(os, colaboradores);
  const overlay = wrap.firstElementChild;
  document.body.appendChild(overlay);

  overlay.addEventListener('click', (event) => { if (event.target === overlay) fecharModal(); });
  overlay.querySelector('[data-iac-cancel]').addEventListener('click', fecharModal);
  overlay.querySelector('[data-iac-confirm]').addEventListener('click', () => confirmar(overlay, os, colaboradores));
}

document.addEventListener('click', (event) => {
  const btn = event.target.closest('[data-informar-colab]');
  if (!btn) return;
  event.preventDefault();
  const numeroOs = btn.dataset.os;
  if (!numeroOs) { alert('Essa solicitação ainda não tem número de O.S. cadastrado.'); return; }
  abrirModal(numeroOs).catch((error) => {
    console.error('[informar-colaborador]', error);
    alert('Erro ao abrir o formulário de colaborador.');
  });
});
