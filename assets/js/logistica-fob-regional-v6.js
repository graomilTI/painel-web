function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function regionalName(supervisao) {
  const text = String(supervisao || '').trim();
  if (!text || text === '-') return 'SEM REGIONAL';
  const index = text.indexOf('-');
  return (index > 0 ? text.slice(0, index) : text).trim().toUpperCase();
}

function currentRows() {
  return [...document.querySelectorAll('#fobResult .fob-table tbody tr')].map((tr) => {
    const cells = [...tr.querySelectorAll('td')].map((td) => td.innerText.trim());
    return {
      data: cells[0] || '',
      osCliente: cells[1] || '',
      supervisao: cells[2] || '',
      funcionario: cells[3] || '',
      saldo: cells[4] || '',
      status: cells[5] || '',
      observacao: cells[6] || '',
    };
  });
}

function ensureSection() {
  if (document.getElementById('fobRegionalCardV6')) return;
  const firstCard = document.querySelector('#pageContent > .card');
  if (!firstCard) return;

  const section = document.createElement('section');
  section.id = 'fobRegionalCardV6';
  section.className = 'card mt-16';
  section.innerHTML = `
    <h3>Imagem por Regional</h3>
    <p class="muted">Agrupa o fechamento por Supervisão e gera uma imagem para compartilhamento.</p>
    <div class="fob-form" style="grid-template-columns:minmax(240px,1fr) auto auto">
      <select id="fobRegionalV6" class="fob-input"><option value="">Selecione</option></select>
      <button id="fobImageV6" class="btn btn-primary" type="button">Gerar imagem</button>
      <button id="fobZipV6" class="btn btn-secondary" type="button">Gerar ZIP (todas)</button>
    </div>
    <div id="fobRegionalFeedbackV6" class="fob-note" style="display:none"></div>`;
  firstCard.insertAdjacentElement('afterend', section);
}

function updateSelect() {
  ensureSection();
  const select = document.getElementById('fobRegionalV6');
  if (!select) return;
  const selected = select.value;
  const values = [...new Set(currentRows().map((row) => regionalName(row.supervisao)))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  select.innerHTML = '<option value="">Selecione</option>' + values.map((value) => `<option value="${esc(value)}">${esc(value)}</option>`).join('');
  if (values.includes(selected)) select.value = selected;
}

async function ensureLib(url, globalName) {
  if (window[globalName]) return;
  await new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = url;
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

function feedback(text) {
  const host = document.getElementById('fobRegionalFeedbackV6');
  if (!host) return;
  host.style.display = 'block';
  host.textContent = text;
}

function reportNode(regional, rows) {
  const node = document.createElement('div');
  node.style.cssText = 'position:fixed;left:-99999px;top:0;width:1100px;padding:26px;background:#fff;color:#111;font-family:Arial,sans-serif';
  node.innerHTML = `
    <h2 style="margin:0 0 6px">FOB — ${esc(regional)}</h2>
    <p style="margin:0 0 18px">${new Date().toLocaleString('pt-BR')} · ${rows.length} O.S.</p>
    <table style="width:100%;border-collapse:collapse;font-size:13px">
      <thead><tr>${['DATA','O.S. / CLIENTE','SUPERVISÃO','FUNCIONÁRIO','SALDO','STATUS','OBSERVAÇÃO'].map((h) => `<th style="border:1px solid #bbb;padding:7px;text-align:left">${h}</th>`).join('')}</tr></thead>
      <tbody>${rows.map((row) => `<tr><td style="border:1px solid #ddd;padding:7px">${esc(row.data)}</td><td style="border:1px solid #ddd;padding:7px">${esc(row.osCliente)}</td><td style="border:1px solid #ddd;padding:7px">${esc(row.supervisao)}</td><td style="border:1px solid #ddd;padding:7px">${esc(row.funcionario)}</td><td style="border:1px solid #ddd;padding:7px">${esc(row.saldo)}</td><td style="border:1px solid #ddd;padding:7px">${esc(row.status)}</td><td style="border:1px solid #ddd;padding:7px">${esc(row.observacao)}</td></tr>`).join('')}</tbody>
    </table>`;
  document.body.appendChild(node);
  return node;
}

function downloadUrl(url, filename) {
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
}

async function generateImage(all) {
  const rows = currentRows();
  if (!rows.length) { feedback('Nenhum resultado disponível para gerar imagem.'); return; }
  const selected = document.getElementById('fobRegionalV6')?.value || '';
  if (!all && !selected) { feedback('Selecione uma regional.'); return; }

  await ensureLib('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js', 'html2canvas');
  if (all) await ensureLib('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js', 'JSZip');

  const groups = new Map();
  rows.forEach((row) => {
    const regional = regionalName(row.supervisao);
    if (!groups.has(regional)) groups.set(regional, []);
    groups.get(regional).push(row);
  });

  if (!all) {
    const node = reportNode(selected, groups.get(selected) || []);
    const canvas = await window.html2canvas(node, { scale: 2, backgroundColor: '#fff' });
    downloadUrl(canvas.toDataURL('image/png'), `FOB_${selected.replace(/[^a-zA-Z0-9]+/g, '_')}.png`);
    node.remove();
    feedback('Imagem gerada.');
    return;
  }

  const zip = new window.JSZip();
  for (const [regional, groupRows] of groups) {
    const node = reportNode(regional, groupRows);
    const canvas = await window.html2canvas(node, { scale: 2, backgroundColor: '#fff' });
    zip.file(`FOB_${regional.replace(/[^a-zA-Z0-9]+/g, '_')}.png`, canvas.toDataURL('image/png').split(',')[1], { base64: true });
    node.remove();
  }
  const blob = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(blob);
  downloadUrl(url, 'FOB_regionais.zip');
  URL.revokeObjectURL(url);
  feedback(`ZIP gerado com ${groups.size} regional(is).`);
}

function init() {
  ensureSection();
  updateSelect();

  document.addEventListener('click', async (event) => {
    try {
      if (event.target.closest('#fobImageV6')) await generateImage(false);
      if (event.target.closest('#fobZipV6')) await generateImage(true);
    } catch (error) {
      console.error('[FOB regional]', error);
      feedback(error.message || String(error));
    }
  });

  const result = document.getElementById('fobResult');
  if (result) new MutationObserver(updateSelect).observe(result, { childList: true, subtree: true });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(init, 0));
else setTimeout(init, 0);
