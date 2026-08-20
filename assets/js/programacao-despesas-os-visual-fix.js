// Programação > Gestor — restaura visualmente as despesas associadas a cada O.S.
// usando a view programacao_despesas_os_compartilhadas. A view foi criada para
// exibir a mesma despesa em todas as O.S. atendidas pelo colaborador no dia sem
// duplicar o registro físico, inclusive quando a despesa nasceu em outra
// programacao_id/supervisão.
import { supabase } from './supabaseClient.js';

const CACHE_TTL_MS = 2500;
const cache = new Map();
let timer = null;
let seq = 0;

function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function norm(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}

function dataReferencia() {
  const carregada = window.__progGetDataReferencia?.();
  if (carregada) return String(carregada).slice(0, 10);
  const el = document.querySelector('#progDataRef');
  if (el?.value) return String(el.value).slice(0, 10);
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function osAbertaId() {
  return document.querySelector('#pldListaBody .pld-row.active[data-os-id]')?.dataset.osId || null;
}

function asObject(value) {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch (_) { return {}; }
}

function diasEntre(checkin, checkout) {
  if (!checkin || !checkout) return 1;
  const a = new Date(`${String(checkin).slice(0, 10)}T00:00:00`);
  const b = new Date(`${String(checkout).slice(0, 10)}T00:00:00`);
  const diff = Math.round((b - a) / 86400000);
  return diff > 0 ? diff : 1;
}

function setSelectValue(select, value) {
  if (!select || value == null) return;
  const wanted = norm(value);
  const option = [...select.options].find((o) => norm(o.value) === wanted || norm(o.textContent) === wanted);
  if (option) select.value = option.value;
}

function setInput(card, selector, value) {
  const input = card.querySelector(selector);
  if (input && value != null) input.value = value;
}

function estadiaDestinoVisual(card, est) {
  const destino = card.querySelector('[data-estadia-destino]');
  if (!destino) return;
  const tipo = norm(est.tipo_estadia || 'CASA');
  const cidade = String(est.cidade || '').trim();
  if (tipo === 'CASA') {
    destino.innerHTML = '<span class="pdof-destino-salvo">Casa</span>';
    return;
  }
  if (tipo === 'ALOJAMENTO' && est.alojamento_id) {
    const label = [est.alojamento_nome, cidade && `${cidade}${est.uf ? `/${est.uf}` : ''}`].filter(Boolean).join(' · ');
    destino.innerHTML = `
      <select data-tab="estadia" data-fld="alojamento_id" hidden>
        <option value="${esc(est.alojamento_id)}" selected>${esc(est.alojamento_nome || 'Alojamento')}</option>
      </select>
      <input class="peqd-inp peqd-aloj-combo-input" value="${esc(label)}" placeholder="Alojamento" autocomplete="off" />`;
    return;
  }
  destino.innerHTML = `<input class="peqd-inp peqd-cidade" data-tab="estadia" data-fld="cidade" value="${esc(cidade)}" placeholder="Cidade" />`;
}

function aplicarEstadia(card, row) {
  const est = asObject(row?.detalhes);
  if (!row) return;
  setSelectValue(card.querySelector('select[data-tab="estadia"][data-fld="tipo_estadia"]'), est.tipo_estadia || 'CASA');
  setInput(card, 'input[data-tab="estadia"][data-fld="dias"]', diasEntre(est.checkin, est.checkout));
  setInput(card, 'input[data-tab="estadia"][data-fld="observacao"]', est.observacao || '');
  estadiaDestinoVisual(card, est);
  card.dataset.pdofEstadiaOrigem = row.programacao_origem_id || '';
}

function aplicarAlimentacao(card, row) {
  const ali = asObject(row?.detalhes);
  if (!row) return;
  ['cafe', 'almoco', 'janta'].forEach((ref) => {
    const chip = card.querySelector(`[data-tab="alimentacao"][data-ref="${ref}"]`);
    if (chip) chip.classList.toggle('on', ali[ref] === true);
  });
  card.dataset.pdofAlimentacaoOrigem = row.programacao_origem_id || '';
}

function aplicarDeslocamento(card, row) {
  const des = asObject(row?.detalhes);
  if (!row) return;
  setSelectValue(card.querySelector('select[data-tab="deslocamento"][data-fld="tipo_deslocamento"]'), des.tipo_deslocamento || 'NÃO PRECISA');
  setInput(card, 'input[data-tab="deslocamento"][data-fld="placa_veiculo"]', des.placa_veiculo || '');
  setInput(card, 'input[data-tab="deslocamento"][data-fld="km"]', des.km ?? 0);
  setInput(card, 'input[data-tab="deslocamento"][data-fld="valor"]', des.valor ?? 0);
  setInput(card, 'input[data-tab="deslocamento"][data-fld="observacao"]', des.observacao || '');
  card.dataset.pdofDeslocamentoOrigem = row.programacao_origem_id || '';
}

const TIPOS_EXTRA = ['RECARGA', 'LAVANDERIA', 'LAVAGEM DE VEÍCULO', 'OUTROS'];
function extraHtml(row) {
  const x = asObject(row.detalhes);
  const tipoAtual = String(x.tipo_despesa || 'OUTROS').toUpperCase();
  return `<div class="peqd-extra-item" data-extra-id="${esc(x.id || row.despesa_id)}" data-pdof-origem="${esc(row.programacao_origem_id || '')}">
    <select class="peqd-inp peqd-extra-tipo" data-extra-fld="tipo_despesa">${TIPOS_EXTRA.map((t) => `<option value="${esc(t)}" ${tipoAtual === t ? 'selected' : ''}>${esc(t.charAt(0) + t.slice(1).toLowerCase())}</option>`).join('')}</select>
    <input class="peqd-inp peqd-extra-desc" data-extra-fld="descricao" value="${esc(x.descricao || '')}" placeholder="Descrição" />
    <input class="peqd-inp peqd-extra-valor" data-extra-fld="valor" type="text" value="${esc(x.valor ?? '')}" placeholder="R$ 0,00" />
    <input class="peqd-inp peqd-extra-obs" data-extra-fld="observacao" value="${esc(x.observacao || '')}" placeholder="Observação" />
    <button type="button" class="peqd-extra-rm" data-extra-remove="${esc(x.id || row.despesa_id)}" title="Excluir despesa">×</button>
  </div>`;
}

function aplicarExtras(card, rows) {
  if (!rows.length) return;
  const list = card.querySelector('[data-extra-list]');
  if (!list) return;
  list.innerHTML = rows.map(extraHtml).join('');
}

function aplicarResumo(card, rows) {
  card.querySelector('.pdof-assoc')?.remove();
  if (!rows.length) return;
  const tipos = new Set(rows.map((r) => r.tipo_registro));
  const labels = [
    ['ESTADIA', '🛏 Estadia'],
    ['ALIMENTACAO', '🍽 Alimentação'],
    ['DESLOCAMENTO', '🚐 Deslocamento'],
    ['EXTRA', '💰 Extras'],
  ].filter(([tipo]) => tipos.has(tipo));
  const compartilhada = rows.some((r) => String(r.programacao_origem_id || '') !== String(r.programacao_exibicao_id || ''));
  const resumo = document.createElement('div');
  resumo.className = 'pdof-assoc';
  resumo.innerHTML = `
    <span class="pdof-assoc-title">Despesas vinculadas a esta O.S.</span>
    <span class="pdof-assoc-chips">${labels.map(([, label]) => `<span>${label}</span>`).join('')}${compartilhada ? '<span class="shared" title="Despesa salva em outra programação do mesmo colaborador e compartilhada com esta O.S.">↔ Compartilhada</span>' : ''}</span>`;
  card.querySelector('.peqd-head')?.insertAdjacentElement('afterend', resumo);
}

async function carregar(osId, dia) {
  const key = `${dia}:${osId}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.ts < CACHE_TTL_MS) return hit.rows;
  const { data, error } = await supabase
    .from('programacao_despesas_os_compartilhadas')
    .select('despesa_id,tipo_registro,colaborador_id,programacao_origem_id,programacao_exibicao_id,os_id,detalhes')
    .eq('data_referencia', dia)
    .eq('os_id', osId);
  if (error) throw error;
  const rows = data || [];
  cache.set(key, { ts: Date.now(), rows });
  return rows;
}

async function aplicar() {
  const drawer = document.querySelector('#pldDrawer.open:not([hidden])');
  const osId = osAbertaId();
  if (!drawer || !osId) return;
  const cards = [...drawer.querySelectorAll('.peqd-card[data-colab-id]')];
  if (!cards.length) return;
  const dia = dataReferencia();
  const applyKey = `${dia}:${osId}`;
  if (cards.every((card) => card.dataset.pdofApplied === applyKey)) return;

  const minhaSeq = ++seq;
  try {
    const rows = await carregar(osId, dia);
    if (minhaSeq !== seq || osAbertaId() !== osId) return;
    const porColab = new Map();
    rows.forEach((row) => {
      const key = String(row.colaborador_id || '');
      if (!porColab.has(key)) porColab.set(key, []);
      porColab.get(key).push(row);
    });

    cards.forEach((card) => {
      const colabRows = porColab.get(String(card.dataset.colabId || '')) || [];
      const first = (tipo) => colabRows.find((r) => r.tipo_registro === tipo) || null;
      aplicarEstadia(card, first('ESTADIA'));
      aplicarAlimentacao(card, first('ALIMENTACAO'));
      aplicarDeslocamento(card, first('DESLOCAMENTO'));
      aplicarExtras(card, colabRows.filter((r) => r.tipo_registro === 'EXTRA'));
      aplicarResumo(card, colabRows);
      card.dataset.pdofApplied = applyKey;
    });
  } catch (error) {
    console.error('[programacao-despesas-os-visual-fix]', error);
  }
}

function schedule() {
  clearTimeout(timer);
  timer = setTimeout(aplicar, 80);
}

function injectStyle() {
  if (document.getElementById('pdofStyles')) return;
  const style = document.createElement('style');
  style.id = 'pdofStyles';
  style.textContent = `
    .pdof-assoc{display:flex;flex-direction:column;gap:6px;margin:-2px 0 10px;padding:8px 10px;border:1px solid rgba(52,211,153,.22);background:rgba(16,185,129,.07);border-radius:9px}
    .pdof-assoc-title{font-size:9.5px;font-weight:900;letter-spacing:.07em;text-transform:uppercase;color:#7dd3a9}
    .pdof-assoc-chips{display:flex;flex-wrap:wrap;gap:5px}
    .pdof-assoc-chips>span{display:inline-flex;align-items:center;min-height:21px;padding:2px 7px;border-radius:999px;border:1px solid rgba(148,163,184,.18);background:rgba(15,23,42,.55);color:#dbeafe;font-size:9.5px;font-weight:800}
    .pdof-assoc-chips>span.shared{border-color:rgba(56,189,248,.32);background:rgba(14,116,144,.13);color:#bae6fd}
    .pdof-destino-salvo{font-size:11px;color:#a7f3d0;font-weight:800;white-space:nowrap}
  `;
  document.head.appendChild(style);
}

injectStyle();
new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
document.addEventListener('click', (event) => {
  if (event.target.closest('.pld-row[data-os-id]')) schedule();
});
window.addEventListener('pageshow', schedule);
schedule();
