import { loadColaboradoresRegional } from './programacao-equipe.js';

// Popup reaproveitável de "escolher colaborador + despesas do dia", usado em
// 2 pontos (pedido do usuário, 2026-09-11): no botão "Informar colaborador"
// de "Minhas solicitações" (depois que a O.S. já existe, ver
// logistica-abertura-os-informar-colaborador.js) e direto no "Confirmar e
// enviar para Logística ADM" da Abertura de O.S. (antes de a O.S. existir,
// ver o hook em logistica.js). Um módulo só pra não duplicar o HTML/CSS do
// popup nos dois lugares — cada chamador decide o que fazer com o resultado.

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const todayIso = () => new Date().toISOString().slice(0, 10);

let styleInjected = false;
export function injectColaboradorPopupStyle() {
  if (styleInjected) return;
  styleInjected = true;
  const style = document.createElement('style');
  style.textContent = `
    .cdp-overlay{position:fixed;inset:0;background:rgba(2,10,7,.72);display:flex;align-items:center;justify-content:center;z-index:9999;padding:16px}
    .cdp-modal{background:#08201a;border:1px solid rgba(22,215,144,.28);border-radius:14px;padding:20px;width:100%;max-width:420px;color:#dbeae3;box-shadow:0 12px 40px rgba(0,0,0,.4)}
    .cdp-modal h3{margin:0 0 4px;font-size:16px;color:#eafff5}
    .cdp-modal .cdp-sub{margin:0 0 16px;font-size:12px;color:#8fb8ab}
    .cdp-modal p.cdp-msg{margin:0 0 18px;font-size:13px;color:#dbeae3;line-height:1.5}
    .cdp-modal label{display:block;font-size:12px;color:#9fd6bf;margin-bottom:12px}
    .cdp-modal input[type="date"],.cdp-modal select{width:100%;margin-top:4px;padding:8px 10px;border-radius:8px;border:1px solid rgba(22,215,144,.25);background:#03150f;color:#eafff5;font-size:13px}
    .cdp-despesas{border:1px solid rgba(22,215,144,.18);border-radius:10px;padding:10px 12px;margin-bottom:16px}
    .cdp-despesas legend{font-size:12px;color:#9fd6bf;padding:0 4px}
    .cdp-despesas label{display:inline-flex;align-items:center;gap:6px;margin:4px 14px 0 0;font-size:12px}
    .cdp-despesas input{width:auto;margin:0}
    .cdp-actions{display:flex;justify-content:flex-end;gap:8px}
    .cdp-actions button{padding:8px 14px;border-radius:8px;border:1px solid rgba(22,215,144,.3);background:transparent;color:#dbeae3;font-size:13px;cursor:pointer}
    .cdp-actions button[data-cdp-confirm],.cdp-actions button[data-cdp-sim]{background:rgba(22,215,144,.18);border-color:rgba(22,215,144,.5);color:#72ddb0;font-weight:600}
    .cdp-actions button:disabled{opacity:.6;cursor:default}
  `;
  document.head.appendChild(style);
}

function fecharOverlay(overlay) {
  overlay?.remove();
}

/**
 * Modal simples de confirmação Sim/Não.
 * @returns {Promise<boolean>}
 */
export function abrirConfirmacaoSimNao({ titulo, mensagem, textoSim = 'Sim', textoNao = 'Não' }) {
  injectColaboradorPopupStyle();
  return new Promise((resolve) => {
    const wrap = document.createElement('div');
    wrap.innerHTML = `
    <div class="cdp-overlay" data-cdp-overlay>
      <div class="cdp-modal">
        <h3>${esc(titulo)}</h3>
        <p class="cdp-msg">${esc(mensagem)}</p>
        <div class="cdp-actions">
          <button type="button" data-cdp-nao>${esc(textoNao)}</button>
          <button type="button" data-cdp-sim>${esc(textoSim)}</button>
        </div>
      </div>
    </div>`;
    const overlay = wrap.firstElementChild;
    document.body.appendChild(overlay);
    const finalizar = (valor) => { fecharOverlay(overlay); resolve(valor); };
    overlay.addEventListener('click', (event) => { if (event.target === overlay) finalizar(false); });
    overlay.querySelector('[data-cdp-nao]').addEventListener('click', () => finalizar(false));
    overlay.querySelector('[data-cdp-sim]').addEventListener('click', () => finalizar(true));
  });
}

/**
 * Modal de escolha de colaborador + despesas do dia.
 * @param {{titulo:string, subtitulo?:string, regional:string, dataSugerida?:string, textoConfirmar?:string}} opts
 * @returns {Promise<{colaboradorId:string, nome:string, dataInicio:string, despesas:{cafe:boolean,almoco:boolean,janta:boolean}}|null>}
 */
export async function abrirPopupColaboradorDespesas({ titulo, subtitulo, regional, dataSugerida, textoConfirmar = 'Confirmar' }) {
  injectColaboradorPopupStyle();

  let colaboradores = [];
  try {
    colaboradores = regional ? await loadColaboradoresRegional(regional) : [];
  } catch (error) {
    console.error('[colaborador-despesas-popup] lista de colaboradores', error);
  }

  return new Promise((resolve) => {
    const wrap = document.createElement('div');
    wrap.innerHTML = `
    <div class="cdp-overlay" data-cdp-overlay>
      <div class="cdp-modal">
        <h3>${esc(titulo)}</h3>
        ${subtitulo ? `<p class="cdp-sub">${esc(subtitulo)}</p>` : ''}
        <label>Data de início
          <input type="date" data-cdp-data value="${esc(dataSugerida || todayIso())}">
        </label>
        <label>Colaborador
          <select data-cdp-colab>
            <option value="">${colaboradores.length ? 'Escolha um colaborador…' : 'Nenhum colaborador encontrado pra essa regional'}</option>
            ${colaboradores.map((c) => `<option value="${esc(c.colaboradorId)}">${esc(c.nome)}</option>`).join('')}
          </select>
        </label>
        <fieldset class="cdp-despesas">
          <legend>Despesas do dia</legend>
          <label><input type="checkbox" data-cdp-desp="cafe"> Café</label>
          <label><input type="checkbox" data-cdp-desp="almoco"> Almoço</label>
          <label><input type="checkbox" data-cdp-desp="janta"> Janta</label>
        </fieldset>
        <div class="cdp-actions">
          <button type="button" data-cdp-cancel>Cancelar</button>
          <button type="button" data-cdp-confirm>${esc(textoConfirmar)}</button>
        </div>
      </div>
    </div>`;
    const overlay = wrap.firstElementChild;
    document.body.appendChild(overlay);

    const finalizar = (valor) => { fecharOverlay(overlay); resolve(valor); };
    overlay.addEventListener('click', (event) => { if (event.target === overlay) finalizar(null); });
    overlay.querySelector('[data-cdp-cancel]').addEventListener('click', () => finalizar(null));
    overlay.querySelector('[data-cdp-confirm]').addEventListener('click', () => {
      const dataInicio = overlay.querySelector('[data-cdp-data]').value;
      const sel = overlay.querySelector('[data-cdp-colab]');
      const colaboradorId = sel.value;
      const cand = colaboradores.find((c) => String(c.colaboradorId) === colaboradorId);
      if (!dataInicio || !cand) { alert('Informe a data de início e o colaborador.'); return; }
      finalizar({
        colaboradorId: cand.colaboradorId,
        nome: cand.nome,
        dataInicio,
        despesas: {
          cafe: !!overlay.querySelector('[data-cdp-desp="cafe"]').checked,
          almoco: !!overlay.querySelector('[data-cdp-desp="almoco"]').checked,
          janta: !!overlay.querySelector('[data-cdp-desp="janta"]').checked,
        },
      });
    });
  });
}
