import { supabase } from './supabaseClient.js';

const state = {
  scheduled: false,
  ready: false,
  pid: null,
  extrasByColab: new Map(),
  loadedColabs: new Set(),
  loadingColabs: new Map(),
};

function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function programacaoId() {
  return window.__progGetProgramacaoId?.() || null;
}

function dataRef() {
  return document.getElementById('progDataRef')?.value || null;
}

function resetCacheIfNeeded(pid) {
  if (state.pid === pid) return;
  state.pid = pid;
  state.extrasByColab = new Map();
  state.loadedColabs = new Set();
  state.loadingColabs = new Map();
}

function colabIdFromBox(box) {
  return String(box?.dataset.colabId || '').trim();
}

function ajustarTexto(el, maxFont) {
  if (!el) return;
  el.style.fontSize = `${maxFont}px`;
  el.style.transform = '';
  el.style.whiteSpace = 'nowrap';
  el.style.overflow = 'visible';
  el.style.textOverflow = 'clip';
  const width = el.clientWidth;
  if (!width || width < 40) return;
  let size = maxFont;
  while (el.scrollWidth > width && size > 8.2) {
    size -= 0.3;
    el.style.fontSize = `${size.toFixed(2)}px`;
  }
  if (el.scrollWidth > width) {
    el.style.transformOrigin = 'left center';
    el.style.transform = `scaleX(${Math.max(.72, width / el.scrollWidth).toFixed(3)})`;
  }
}

function ajustarFontesOs() {
  document.querySelectorAll('.peqb-os2-cliente').forEach((el) => ajustarTexto(el, window.innerWidth <= 1380 ? 11.6 : 12.8));
  document.querySelectorAll('.peqb-os2-emb').forEach((el) => ajustarTexto(el, window.innerWidth <= 1380 ? 9.7 : 10.2));
}

function itemHtml(row) {
  return `<span class="peqb-extra-mini" data-extra-id="${esc(row.id)}"><span>${esc(row.tipo_despesa || row.descricao || 'Extra')}</span><button type="button" data-extra-remove="${esc(row.id)}">×</button></span>`;
}

function renderExtrasBox(box, rows = []) {
  const list = box?.querySelector('.peqb-extra-mini-list');
  if (!list) return;
  list.innerHTML = (rows || []).map(itemHtml).join('');
}

async function carregar(box, { force = false } = {}) {
  const pid = programacaoId();
  const colabId = colabIdFromBox(box);
  const list = box?.querySelector('.peqb-extra-mini-list');
  if (!pid || !colabId || !list) return;

  resetCacheIfNeeded(pid);

  if (!force && state.loadedColabs.has(colabId)) {
    renderExtrasBox(box, state.extrasByColab.get(colabId) || []);
    return;
  }

  const key = `${pid}:${colabId}`;
  if (state.loadingColabs.has(key)) {
    await state.loadingColabs.get(key);
    renderExtrasBox(box, state.extrasByColab.get(colabId) || []);
    return;
  }

  list.innerHTML = '<span class="peqb-extra-mini">Carregando...</span>';

  const request = supabase
    .from('programacao_extras')
    .select('id,tipo_despesa,descricao')
    .eq('programacao_id', pid)
    .eq('colaborador_id', colabId)
    .order('created_at', { ascending: true });

  state.loadingColabs.set(key, request);
  const { data, error } = await request;
  state.loadingColabs.delete(key);

  if (error) {
    console.warn('[programacao extras] carregar', error);
    list.innerHTML = '';
    return;
  }

  state.extrasByColab.set(colabId, data || []);
  state.loadedColabs.add(colabId);
  renderExtrasBox(box, data || []);
}

async function salvar(box) {
  const pid = programacaoId();
  const input = box?.querySelector('.peqb-extra-input');
  const tipo = String(input?.value || '').trim();
  const colabId = colabIdFromBox(box);
  if (!pid || !box || !colabId || !tipo) {
    input?.focus();
    return;
  }

  resetCacheIfNeeded(pid);

  const btn = box.querySelector('.peqb-extra-ok');
  if (btn) btn.disabled = true;
  const { data, error } = await supabase.from('programacao_extras').insert({
    programacao_id: pid,
    data_referencia: dataRef(),
    colaborador_id: colabId,
    nome_colaborador: box.dataset.nome || '',
    tipo_despesa: tipo,
    descricao: tipo,
    valor: 0,
  }).select('id,tipo_despesa,descricao').single();
  if (btn) btn.disabled = false;
  if (error) {
    console.error('[programacao extras] salvar', error);
    window.alert(error.message || 'Não foi possível salvar a despesa extra.');
    return;
  }
  input.value = '';

  const rows = [...(state.extrasByColab.get(colabId) || []), data || { id: `novo-${Date.now()}`, tipo_despesa: tipo, descricao: tipo }];
  state.extrasByColab.set(colabId, rows);
  state.loadedColabs.add(colabId);
  renderExtrasBox(box, rows);
}

async function remover(id, box) {
  if (!id) return;
  const q = supabase.from('programacao_extras');
  const fn = q['delete'].bind(q);
  const { error } = await fn().eq('id', id);
  if (error) {
    console.error('[programacao extras] remover', error);
    window.alert(error.message || 'Não foi possível excluir a despesa extra.');
    return;
  }

  const colabId = colabIdFromBox(box);
  if (colabId && state.loadedColabs.has(colabId)) {
    const rows = (state.extrasByColab.get(colabId) || []).filter((row) => String(row.id) !== String(id));
    state.extrasByColab.set(colabId, rows);
    renderExtrasBox(box, rows);
  } else {
    renderExtrasBox(box, []);
  }
}

function aplicar() {
  ajustarFontesOs();
  const pid = programacaoId();
  if (pid) resetCacheIfNeeded(pid);

  document.querySelectorAll('.peqb-os2-right').forEach((right) => {
    const head = right.querySelector('.peqb-conf-head');
    const ali = right.querySelector('.peqb-ali');
    if (!head || !ali || head.dataset.extrasReady === '1') return;
    head.dataset.extrasReady = '1';

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'peqb-extra-btn';
    btn.textContent = 'Extras';
    head.appendChild(btn);

    const box = document.createElement('div');
    box.className = 'peqb-extra-box';
    box.hidden = true;
    box.dataset.colabId = ali.dataset.colabId || '';
    box.dataset.nome = ali.dataset.nome || '';
    box.innerHTML = `
      <div class="peqb-extra-form">
        <input type="text" class="peqb-extra-input" placeholder="Tipo de despesa extra" />
        <button type="button" class="peqb-extra-ok" title="Confirmar despesa">✓</button>
      </div>
      <div class="peqb-extra-mini-list"></div>
    `;
    head.insertAdjacentElement('afterend', box);

    const colabId = colabIdFromBox(box);
    if (colabId && state.loadedColabs.has(colabId)) {
      renderExtrasBox(box, state.extrasByColab.get(colabId) || []);
    }
  });
}

function agendar() {
  if (state.scheduled) return;
  state.scheduled = true;
  requestAnimationFrame(() => {
    state.scheduled = false;
    aplicar();
  });
}

function boot() {
  agendar();
  window.addEventListener('resize', agendar);
  document.addEventListener('click', async (event) => {
    const toggle = event.target.closest('.peqb-extra-btn');
    if (toggle) {
      const box = toggle.closest('.peqb-os2-right')?.querySelector('.peqb-extra-box');
      if (!box) return;
      box.hidden = !box.hidden;
      toggle.classList.toggle('on', !box.hidden);
      if (!box.hidden) {
        box.querySelector('.peqb-extra-input')?.focus();
        await carregar(box);
      }
      return;
    }
    const ok = event.target.closest('.peqb-extra-ok');
    if (ok) {
      await salvar(ok.closest('.peqb-extra-box'));
      return;
    }
    const x = event.target.closest('[data-extra-remove]');
    if (x) {
      await remover(x.dataset.extraRemove, x.closest('.peqb-extra-box'));
    }
  });
  document.addEventListener('keydown', async (event) => {
    if (event.key !== 'Enter') return;
    const input = event.target.closest('.peqb-extra-input');
    if (!input) return;
    event.preventDefault();
    await salvar(input.closest('.peqb-extra-box'));
  });
  new MutationObserver(agendar).observe(document.body || document.documentElement, { childList: true, subtree: true });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
else boot();
