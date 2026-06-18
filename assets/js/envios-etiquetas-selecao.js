import { supabase, SUPABASE_URL } from './supabaseClient.js';

function feedback(message, isError = false) {
  const el = document.querySelector('#envios-feedback');
  if (!el) return;
  el.textContent = message || '';
  el.className = 'feedback-bar' + (isError ? ' feedback-err' : ' feedback-ok');
  el.style.display = message ? 'block' : 'none';
}

async function callFn(name, body) {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session?.access_token}`,
    },
    body: JSON.stringify(body),
  });
  return res.json();
}

function printPdf(b64) {
  const bytes = atob(b64);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  const blob = new Blob([arr], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const win = window.open('', '_blank');
  if (!win) {
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    return;
  }
  win.document.write(
    '<!DOCTYPE html><html><head><title>Etiqueta Correios</title>' +
    '<style>*{margin:0;padding:0}html,body,iframe{width:100%;height:100%;border:none;display:block}</style></head><body>' +
    '<iframe src="' + url + '" onload="setTimeout(function(){window.print()},300)"></iframe>' +
    '</body></html>'
  );
  win.document.close();
  win.addEventListener('afterprint', () => URL.revokeObjectURL(url));
}

function ensureStyles() {
  if (document.getElementById('envios-etiquetas-selecao-style')) return;
  const style = document.createElement('style');
  style.id = 'envios-etiquetas-selecao-style';
  style.textContent = `
    .envios-select-tools{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:0 0 12px}
    .envios-check-label{display:inline-flex;align-items:center;gap:7px;color:rgba(200,230,210,.72);font-size:12px;font-weight:700;cursor:pointer;user-select:none}
    .envios-check-label input,.envios-select-cell input,.envios-row-check input{width:16px;height:16px;accent-color:#22c55e;cursor:pointer}
    .envios-select-cell{width:30px;text-align:center}
    .envios-row.has-select{grid-template-columns:34px 110px 1fr 170px 120px 110px}
    .envios-row-header.has-select{grid-template-columns:34px 110px 1fr 170px 120px 110px}
    .envios-row-check{display:flex;align-items:center;justify-content:center}
    @media(max-width:960px){.envios-row.has-select,.envios-row-header.has-select{grid-template-columns:34px 100px 1fr 150px 110px 100px}}
    @media(max-width:720px){.envios-row.has-select,.envios-row-header.has-select{grid-template-columns:34px 1fr 1fr}.envios-row-check{align-self:start;padding-top:2px}}
  `;
  document.head.appendChild(style);
}

function selectedValues(selector) {
  return [...document.querySelectorAll(selector)]
    .filter((input) => input.checked)
    .map((input) => input.value)
    .filter(Boolean);
}

function updateCounters() {
  const etiquetarCount = selectedValues('[data-envios-select-etiquetar]').length;
  const enviadosCount = selectedValues('[data-envios-select-enviado]').length;
  const etiquetarBtn = document.querySelector('#btn-etiqueta-selecionadas');
  const enviadosBtn = document.querySelector('#btn-regerar-enviados-selecionados');
  if (etiquetarBtn) {
    etiquetarBtn.disabled = etiquetarCount === 0;
    etiquetarBtn.textContent = etiquetarCount ? `Gerar selecionadas (${etiquetarCount})` : 'Gerar selecionadas';
  }
  if (enviadosBtn) {
    enviadosBtn.disabled = enviadosCount === 0;
    enviadosBtn.textContent = enviadosCount ? `Gerar novamente (${enviadosCount})` : 'Gerar novamente selecionadas';
  }
}

async function gerarEtiquetas(ids, { marcarPostado = false, reloadButtonId = null } = {}) {
  if (!ids.length) {
    feedback('Selecione ao menos uma etiqueta.', true);
    return;
  }

  feedback(ids.length === 1 ? 'Gerando etiqueta...' : `Gerando ${ids.length} etiquetas...`);
  const result = await callFn('correios-etiqueta', { postagem_ids: ids });
  if (!result.ok || !result.pdf_base64) {
    feedback('Erro ao gerar etiqueta: ' + (result.error ?? 'desconhecido'), true);
    return;
  }

  printPdf(result.pdf_base64);

  if (marcarPostado) {
    const { error } = await supabase.from('envios_postagens').update({ status: 'POSTADO' }).in('id', ids);
    if (error) {
      feedback('Etiqueta gerada, mas não foi possível atualizar status: ' + error.message, true);
      return;
    }
  }

  feedback(marcarPostado ? 'Etiqueta(s) gerada(s) e envio(s) marcados como postado.' : 'Etiqueta(s) gerada(s) novamente.');
  if (reloadButtonId) document.querySelector(reloadButtonId)?.click();
}

function enhanceEtiquetar() {
  const table = document.querySelector('#envios-tab-content table.data-table');
  if (!table || table.dataset.selectEnhanced === '1') return;
  if (!table.querySelector('[data-etiqueta-etiquetar]')) return;

  table.dataset.selectEnhanced = '1';
  table.querySelector('thead tr')?.insertAdjacentHTML(
    'afterbegin',
    '<th class="envios-select-cell"><input type="checkbox" id="chk-etiquetar-todos" title="Selecionar todos"></th>'
  );

  table.querySelectorAll('tbody tr').forEach((row) => {
    const btn = row.querySelector('[data-etiqueta-etiquetar]');
    const id = btn?.dataset.etiquetaEtiquetar;
    if (!id) return;
    row.insertAdjacentHTML(
      'afterbegin',
      `<td class="envios-select-cell"><input type="checkbox" value="${id}" data-envios-select-etiquetar></td>`
    );
  });

  const toolbar = document.querySelector('#envios-tab-content .toolbar');
  if (toolbar && !document.getElementById('btn-etiqueta-selecionadas')) {
    toolbar.insertAdjacentHTML(
      'beforeend',
      '<button class="btn btn-primary" id="btn-etiqueta-selecionadas" disabled>Gerar selecionadas</button>'
    );
    const gerarTodas = toolbar.querySelector('#btn-etiqueta-lote-etiquetar');
    if (gerarTodas) gerarTodas.textContent = gerarTodas.textContent.replace('Gerar todas', 'Gerar todas');
  }
  updateCounters();
}

function enhanceEnviados() {
  const content = document.querySelector('#envios-tab-content');
  const list = content?.querySelector('.envios-row-list');
  if (!content || !list || list.dataset.reprintEnhanced === '1') return;

  const rows = [...list.querySelectorAll('.envios-row')]
    .map((row) => ({ row, id: row.querySelector('[data-rastrear]')?.dataset.rastrear }))
    .filter((item) => item.id);
  if (!rows.length) return;

  list.dataset.reprintEnhanced = '1';

  const toolbar = content.querySelector('.toolbar');
  if (toolbar && !document.getElementById('btn-regerar-enviados-selecionados')) {
    toolbar.insertAdjacentHTML(
      'beforeend',
      '<label class="envios-check-label"><input type="checkbox" id="chk-enviados-todos"> Selecionar todos</label>' +
      '<button class="btn btn-primary" id="btn-regerar-enviados-selecionados" disabled>Gerar novamente selecionadas</button>'
    );
  }

  const header = content.querySelector('.envios-row-header');
  if (header && !header.classList.contains('has-select')) {
    header.classList.add('has-select');
    header.insertAdjacentHTML('afterbegin', '<span></span>');
  }

  rows.forEach(({ row, id }) => {
    if (row.classList.contains('has-select')) return;
    row.classList.add('has-select');
    row.insertAdjacentHTML(
      'afterbegin',
      `<div class="envios-row-check"><input type="checkbox" value="${id}" data-envios-select-enviado title="Selecionar para gerar novamente"></div>`
    );
  });
  updateCounters();
}

function enhance() {
  ensureStyles();
  enhanceEtiquetar();
  enhanceEnviados();
}

function bindEvents() {
  document.addEventListener('change', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;

    if (target.id === 'chk-etiquetar-todos') {
      document.querySelectorAll('[data-envios-select-etiquetar]').forEach((input) => { input.checked = target.checked; });
      updateCounters();
      return;
    }

    if (target.id === 'chk-enviados-todos') {
      document.querySelectorAll('[data-envios-select-enviado]').forEach((input) => { input.checked = target.checked; });
      updateCounters();
      return;
    }

    if (target.matches('[data-envios-select-etiquetar],[data-envios-select-enviado]')) updateCounters();
  });

  document.addEventListener('click', async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    if (target.id === 'btn-etiqueta-selecionadas') {
      const ids = selectedValues('[data-envios-select-etiquetar]');
      if (!ids.length) return feedback('Selecione ao menos uma etiqueta.', true);
      if (!confirm(`Gerar etiqueta para ${ids.length} postagem(ns) selecionada(s)?`)) return;
      target.disabled = true;
      target.textContent = 'Gerando...';
      try {
        await gerarEtiquetas(ids, { marcarPostado: true, reloadButtonId: '#btn-refresh-etiquetar' });
      } catch (error) {
        feedback('Erro: ' + error.message, true);
      } finally {
        target.disabled = false;
        updateCounters();
      }
    }

    if (target.id === 'btn-regerar-enviados-selecionados') {
      const ids = selectedValues('[data-envios-select-enviado]');
      if (!ids.length) return feedback('Selecione ao menos um envio.', true);
      if (!confirm(`Gerar novamente etiqueta para ${ids.length} envio(s) selecionado(s)?`)) return;
      target.disabled = true;
      target.textContent = 'Gerando...';
      try {
        await gerarEtiquetas(ids, { marcarPostado: false });
      } catch (error) {
        feedback('Erro: ' + error.message, true);
      } finally {
        target.disabled = false;
        updateCounters();
      }
    }
  });
}

bindEvents();

const observer = new MutationObserver(() => enhance());
observer.observe(document.body, { childList: true, subtree: true });

document.addEventListener('DOMContentLoaded', enhance);
setTimeout(enhance, 500);
setTimeout(enhance, 1500);
