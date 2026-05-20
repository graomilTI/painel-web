import { initProtectedPage } from './pageInit.js';
import { supabase } from './supabaseClient.js';

const state = {
  inicio: new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10),
  fim: new Date().toISOString().slice(0, 10),
  rows: [],
  kpiRows: [],
  pagamentos: {},
  kpiFilter: 'pendentes',
  tab: 'resumo'
};

function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function money(value) {
  return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function brDate(value) {
  if (!value) return '-';
  const [y, m, d] = String(value).slice(0, 10).split('-');
  return y && m && d ? `${d}/${m}/${y}` : String(value);
}

function isUrl(v) {
  return /^https?:\/\//i.test(String(v || ''));
}

initProtectedPage('Notas Fiscais', (content) => {
  content.innerHTML = `
    <style>
      .nf-wrap{display:grid;gap:18px}
      .nf-hero{border:1px solid rgba(148,163,184,.18);border-radius:24px;padding:22px;background:linear-gradient(135deg,rgba(15,23,42,.96),rgba(22,101,52,.22));box-shadow:0 20px 50px rgba(2,6,23,.22)}
      .nf-hero h2{margin:0 0 6px;color:#f8fafc;font-size:28px}.nf-hero p{margin:0;color:#6b7280}
      .nf-card{border:1px solid rgba(148,163,184,.16);border-radius:22px;background:rgba(15,23,42,.82);padding:18px}
      .nf-tabs{display:flex;gap:8px;flex-wrap:wrap}
      .nf-tab{border:1px solid rgba(148,163,184,.18);border-radius:999px;padding:9px 18px;background:rgba(15,23,42,.6);color:#94a3b8;cursor:pointer;font-weight:700;font-size:13px}
      .nf-tab.active{background:rgba(22,101,52,.28);color:#bbf7d0;border-color:rgba(111,208,165,.3)}
      .nf-panel{display:none}.nf-panel.active{display:grid;gap:18px}
      .nf-filter{display:grid;grid-template-columns:repeat(3,minmax(160px,1fr));gap:12px;align-items:end}
      .nf-field{display:grid;gap:6px}.nf-field label{font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:.06em}
      .nf-field input,.nf-field select{border:1px solid rgba(148,163,184,.22);border-radius:14px;background:#0d0d18;color:#e2e2f0;padding:10px 12px;color-scheme:dark}
      .nf-kpis{display:grid;grid-template-columns:repeat(3,minmax(150px,1fr));gap:12px}
      .nf-kpi{border:1px solid rgba(148,163,184,.14);border-radius:18px;padding:14px;background:rgba(2,6,23,.36)}
      .nf-kpi span{display:block;color:#6b7280;font-size:11px;text-transform:uppercase;letter-spacing:.06em}
      .nf-kpi strong{display:block;margin-top:6px;color:#f8fafc;font-size:20px}
      .nf-table-wrap{overflow:auto;border-radius:18px;border:1px solid rgba(148,163,184,.14)}
      .nf-table{width:100%;border-collapse:collapse;min-width:760px}
      .nf-table th,.nf-table td{padding:12px;border-bottom:1px solid rgba(148,163,184,.12);text-align:left;color:#e2e2f0;vertical-align:top}
      .nf-table th{background:rgba(15,23,42,.96);color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:.06em}
      .nf-empty{text-align:center;color:#6b7280;padding:24px!important}
      .nf-act{display:flex;gap:6px;flex-wrap:wrap;align-items:center}
      .nf-act .btn{padding:6px 12px!important;font-size:12px!important;white-space:nowrap}
      .nf-btn-xs{padding:4px 8px!important;font-size:11px!important}
      .nf-badge{display:inline-flex;align-items:center;padding:4px 10px;border-radius:999px;font-size:11px;font-weight:700}
      .nf-badge.lancado{background:rgba(22,101,52,.22);color:#bbf7d0;border:1px solid rgba(22,101,52,.34)}
      .nf-badge.pendente{background:rgba(245,158,11,.1);color:#fde68a;border:1px solid rgba(245,158,11,.24)}
      .nf-filter-tabs{display:flex;gap:8px}
      .nf-filter-tab{border:1px solid rgba(148,163,184,.18);border-radius:999px;padding:7px 14px;background:rgba(15,23,42,.6);color:#94a3b8;cursor:pointer;font-weight:600;font-size:12px}
      .nf-filter-tab.active{background:rgba(22,101,52,.24);color:#bbf7d0;border-color:rgba(111,208,165,.28)}
      /* modal */
      .nf-modal{display:none;position:fixed;inset:0;background:rgba(0,0,0,.72);z-index:9999;align-items:center;justify-content:center;padding:16px}
      .nf-modal.open{display:flex}
      .nf-modal-card{background:#0f172a;border:1px solid rgba(148,163,184,.18);border-radius:24px;padding:24px;max-width:640px;width:100%;max-height:88vh;overflow-y:auto}
      .nf-modal-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:16px}
      .nf-modal-full{grid-column:1/-1}
      .nf-modal-label{font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:.04em;margin-bottom:4px}
      .nf-modal-value{color:#e2e2f0;font-size:14px}
      @media(max-width:760px){.nf-filter,.nf-kpis,.nf-modal-grid{grid-template-columns:1fr}.nf-modal-full{grid-column:1}}
    </style>

    <section class="nf-wrap">
      <div class="nf-hero">
        <h2>Notas Fiscais</h2>
        <p>Controle de emissão e lançamento de NFs por regional. Gerencie os KPIs de compras que aguardam lançamento contábil.</p>
      </div>

      <div class="nf-tabs">
        <button class="nf-tab active" data-tab="resumo" type="button">Resumo Financeiro</button>
        <button class="nf-tab" data-tab="kpis" type="button">Lançamentos</button>
      </div>

      <!-- PAINEL RESUMO -->
      <div class="nf-panel active" id="nfPanelResumo">
        <article class="nf-card">
          <form class="nf-filter" id="nfFilterForm">
            <div class="nf-field"><label>Data inicial</label><input id="nfInicio" type="date" value="${esc(state.inicio)}"></div>
            <div class="nf-field"><label>Data final</label><input id="nfFim" type="date" value="${esc(state.fim)}"></div>
            <div class="nf-field"><label>&nbsp;</label><button class="btn btn-primary" type="submit">Atualizar</button></div>
          </form>
        </article>
        <div class="nf-kpis">
          <div class="nf-kpi"><span>Registros</span><strong id="nfKpiRegistros">0</strong></div>
          <div class="nf-kpi"><span>Total pago</span><strong id="nfKpiTotal">R$ 0,00</strong></div>
          <div class="nf-kpi"><span>Regionais</span><strong id="nfKpiRegionais">0</strong></div>
        </div>
        <article class="nf-card">
          <div class="nf-table-wrap">
            <table class="nf-table">
              <thead><tr><th>Data pagamento</th><th>Regional</th><th>Destino</th><th>Quantidade</th><th>Valor total</th><th>Origem</th></tr></thead>
              <tbody id="nfTbody"><tr><td colspan="6" class="nf-empty">Carregando...</td></tr></tbody>
            </table>
          </div>
        </article>
      </div>

      <!-- PAINEL KPIs COMPRAS -->
      <div class="nf-panel" id="nfPanelKpis">
        <div class="nf-filter-tabs">
          <button class="nf-filter-tab active" data-kpi-filter="pendentes" type="button">Pendentes</button>
          <button class="nf-filter-tab" data-kpi-filter="lancados" type="button">Lançados</button>
        </div>
        <div class="nf-kpis">
          <div class="nf-kpi"><span>Itens pendentes</span><strong id="kpiNfPendentes">0</strong></div>
          <div class="nf-kpi"><span>Total pendente</span><strong id="kpiNfTotalPend">R$ 0,00</strong></div>
          <div class="nf-kpi"><span>Total lançado</span><strong id="kpiNfTotalLanc">R$ 0,00</strong></div>
        </div>
        <article class="nf-card">
          <div class="nf-table-wrap">
            <table class="nf-table">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Regional</th>
                  <th>Solicitante</th>
                  <th>Valor</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody id="nfKpiTbody"><tr><td colspan="5" class="nf-empty">Carregando...</td></tr></tbody>
            </table>
          </div>
        </article>
      </div>
    </section>

    <div class="nf-modal" id="nfModal">
      <div class="nf-modal-card" id="nfModalCard"></div>
    </div>
  `;

  // ─── TABS ────────────────────────────────────────────────────────────────────
  function setTab(tab) {
    state.tab = tab;
    document.querySelectorAll('.nf-tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
    document.getElementById('nfPanelResumo').classList.toggle('active', tab === 'resumo');
    document.getElementById('nfPanelKpis').classList.toggle('active', tab === 'kpis');
    if (tab === 'kpis') loadKpis();
  }

  document.querySelectorAll('.nf-tab').forEach((b) => b.addEventListener('click', () => setTab(b.dataset.tab)));

  // ─── RESUMO FINANCEIRO ───────────────────────────────────────────────────────
  function render() {
    const tbody = document.getElementById('nfTbody');
    if (!state.rows.length) {
      tbody.innerHTML = `<tr><td colspan="6" class="nf-empty">Nenhum resumo localizado no período.</td></tr>`;
    } else {
      tbody.innerHTML = state.rows.map((row) => `
        <tr>
          <td>${brDate(row.data_pagamento)}</td>
          <td><strong>${esc(row.regional || '-')}</strong></td>
          <td>${esc(row.destino || '-')}</td>
          <td>${Number(row.quantidade || 0)}</td>
          <td>${money(row.valor_total)}</td>
          <td>${esc(row.modulo_origem || 'FINANCEIRO')}</td>
        </tr>
      `).join('');
    }
    const total = state.rows.reduce((sum, row) => sum + Number(row.valor_total || 0), 0);
    document.getElementById('nfKpiRegistros').textContent = String(state.rows.length);
    document.getElementById('nfKpiTotal').textContent = money(total);
    document.getElementById('nfKpiRegionais').textContent = String(new Set(state.rows.map((row) => row.regional || '-')).size);
  }

  async function load() {
    const tbody = document.getElementById('nfTbody');
    tbody.innerHTML = `<tr><td colspan="6" class="nf-empty">Consultando Notas Fiscais...</td></tr>`;
    const { data, error } = await supabase
      .from('financeiro_notas_fiscais_resumo')
      .select('*')
      .gte('data_pagamento', state.inicio)
      .lte('data_pagamento', state.fim)
      .order('data_pagamento', { ascending: false })
      .order('regional', { ascending: true });
    if (error) {
      tbody.innerHTML = `<tr><td colspan="6" class="nf-empty">${esc(error.message)}<br>Execute a migration de pagamentos/notas fiscais no Supabase.</td></tr>`;
      return;
    }
    state.rows = data || [];
    render();
  }

  document.getElementById('nfFilterForm').addEventListener('submit', (event) => {
    event.preventDefault();
    state.inicio = document.getElementById('nfInicio').value;
    state.fim = document.getElementById('nfFim').value;
    load();
  });

  // ─── KPIs COMPRAS ────────────────────────────────────────────────────────────
  function groupByNf(rows) {
    const map = new Map();
    for (const r of rows) {
      const key = r.nf_url;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(r);
    }
    return [...map.values()].map((itens) => {
      const first = itens[0];
      const sol0 = first.compras_solicitacoes || {};
      const lancadoEm = itens.filter((r) => r.nf_lancado_em).map((r) => r.nf_lancado_em).sort().pop() || null;
      const pag = itens.reduce((found, r) => found || state.pagamentos[r.id] || null, null);
      return {
        key: first.nf_url,
        ids: itens.map((r) => r.id),
        nf_url: first.nf_url,
        comprovante_url: itens.find((r) => r.comprovante_url)?.comprovante_url || null,
        valor_total: itens.reduce((s, r) => s + Number(r.valor_total || 0), 0),
        comprado_em: itens.map((r) => r.comprado_em || '').sort().pop() || sol0.data_solicitacao || '',
        regional: sol0.coordenacao || '-',
        solicitante: [...new Set(itens.map((r) => (r.compras_solicitacoes || {}).solicitante).filter(Boolean))].join(', ') || '-',
        fornecedor: pag?.fornecedor || pag?.favorecido_nome || '-',
        cnpj: pag?.favorecido_documento || '-',
        numero: pag?.nf_numero || null,
        nf_lancado: itens.every((r) => r.nf_lancado),
        nf_lancado_em: lancadoEm,
        itens,
      };
    }).sort((a, b) => (b.comprado_em > a.comprado_em ? 1 : -1));
  }

  async function loadKpis() {
    const tbody = document.getElementById('nfKpiTbody');
    tbody.innerHTML = `<tr><td colspan="5" class="nf-empty">Carregando...</td></tr>`;

    const { data, error } = await supabase
      .from('compras_itens')
      .select('id, material, tipo, quantidade, unidade, valor_total, comprado_em, nf_url, comprovante_url, nf_lancado, nf_lancado_em, marca, compras_solicitacoes(solicitante, coordenacao, data_solicitacao, observacoes)')
      .eq('status', 'comprado')
      .not('nf_url', 'is', null)
      .not('comprovante_url', 'is', null)
      .order('comprado_em', { ascending: false })
      .limit(500);

    if (error) {
      tbody.innerHTML = `<tr><td colspan="5" class="nf-empty">${esc(error.message)}</td></tr>`;
      return;
    }

    state.kpiRows = data || [];

    state.pagamentos = {};
    const ids = state.kpiRows.map((r) => r.id).filter(Boolean);
    if (ids.length) {
      const { data: pags } = await supabase
        .from('financeiro_pagamentos')
        .select('origem_id, fornecedor, favorecido_nome, favorecido_documento, nf_numero')
        .eq('origem', 'COMPRAS')
        .in('origem_id', ids);
      for (const p of (pags || [])) {
        if (p.origem_id) state.pagamentos[p.origem_id] = p;
      }
    }

    updateKpiCounters();
    renderKpis();
  }

  function updateKpiCounters() {
    const groups = groupByNf(state.kpiRows);
    const pendentes = groups.filter((g) => !g.nf_lancado);
    const lancados = groups.filter((g) => g.nf_lancado);
    document.getElementById('kpiNfPendentes').textContent = String(pendentes.length);
    document.getElementById('kpiNfTotalPend').textContent = money(pendentes.reduce((s, g) => s + g.valor_total, 0));
    document.getElementById('kpiNfTotalLanc').textContent = money(lancados.reduce((s, g) => s + g.valor_total, 0));
  }

  function renderKpis() {
    const tbody = document.getElementById('nfKpiTbody');
    const groups = groupByNf(state.kpiRows).filter((g) => state.kpiFilter === 'lancados' ? g.nf_lancado : !g.nf_lancado);

    if (!groups.length) {
      tbody.innerHTML = `<tr><td colspan="5" class="nf-empty">${state.kpiFilter === 'lancados' ? 'Nenhuma NF lançada ainda.' : 'Nenhuma NF aguardando lançamento.'}</td></tr>`;
      return;
    }

    tbody.innerHTML = groups.map((g) => {
      const lancadoBadge = g.nf_lancado ? `<span class="nf-badge lancado">Lançado ${brDate(g.nf_lancado_em)}</span>` : '';
      const itemLabel = g.itens.length > 1 ? `<br><small style="color:#6b7280">${g.itens.length} itens</small>` : '';
      return `<tr>
        <td>${brDate(g.comprado_em)}${itemLabel}</td>
        <td><strong>${esc(g.regional)}</strong></td>
        <td>${esc(g.solicitante)}</td>
        <td>${money(g.valor_total)}</td>
        <td>
          <div class="nf-act">
            <button class="btn btn-secondary" data-consultar="${esc(g.key)}" type="button">Consultar</button>
            ${isUrl(g.nf_url) ? `<a class="btn btn-secondary" href="${esc(g.nf_url)}" target="_blank" rel="noopener">Baixar NF</a>` : ''}
            ${isUrl(g.comprovante_url) ? `<a class="btn btn-secondary" href="${esc(g.comprovante_url)}" target="_blank" rel="noopener">Baixar Comprovante</a>` : ''}
            ${!g.nf_lancado ? `<button class="btn btn-primary nf-btn-xs" data-lancar="${esc(g.key)}" type="button">Lançado</button>` : lancadoBadge}
          </div>
        </td>
      </tr>`;
    }).join('');

    tbody.querySelectorAll('[data-consultar]').forEach((b) => b.addEventListener('click', () => openKpiModal(b.dataset.consultar)));
    tbody.querySelectorAll('[data-lancar]').forEach((b) => b.addEventListener('click', () => lancarGrupo(b.dataset.lancar, b)));
  }

  function formatCnpj(v) {
    const d = String(v || '').replace(/\D/g, '');
    if (d.length !== 14) return v || '-';
    return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5,8)}/${d.slice(8,12)}-${d.slice(12)}`;
  }

  async function extractFromXml(url) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      const ct = res.headers.get('content-type') || '';
      if (!ct.includes('xml') && !/\.xml(\?|$)/i.test(url)) return null;
      const text = await res.text();
      const doc = new DOMParser().parseFromString(text, 'application/xml');
      const q = (sel) => doc.querySelector(sel)?.textContent?.trim() || null;
      return {
        fornecedor: q('emit xNome'),
        cnpj: q('emit CNPJ'),
        numero: q('nNF'),
        origem: 'xml',
      };
    } catch {
      return null;
    }
  }

  function loadExternalScript(src, globalName) {
    if (globalName && window[globalName]) return Promise.resolve(window[globalName]);
    return new Promise((resolve, reject) => {
      const existing = [...document.scripts].find((s) => s.src === src);
      if (existing) {
        existing.addEventListener('load', () => resolve(globalName ? window[globalName] : true), { once: true });
        existing.addEventListener('error', reject, { once: true });
        return;
      }
      const script = document.createElement('script');
      script.src = src;
      script.async = true;
      script.onload = () => resolve(globalName ? window[globalName] : true);
      script.onerror = () => reject(new Error(`Falha ao carregar biblioteca OCR: ${src}`));
      document.head.appendChild(script);
    });
  }

  async function blobFromUrl(url) {
    const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
    if (!res.ok) throw new Error(`Falha ao baixar NF (${res.status})`);
    return await res.blob();
  }

  function fileLooksPdf(url, blob) {
    return String(blob?.type || '').includes('pdf') || /\.pdf(\?|$)/i.test(String(url || ''));
  }

  async function readPdfText(blob) {
    const pdfjs = await loadExternalScript('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js', 'pdfjsLib');
    pdfjs.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    const data = await blob.arrayBuffer();
    const pdf = await pdfjs.getDocument({ data }).promise;
    const parts = [];
    const maxPages = Math.min(pdf.numPages || 1, 2);
    for (let i = 1; i <= maxPages; i += 1) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      parts.push(textContent.items.map((item) => item.str || '').join(' '));
    }
    return parts.join('\n');
  }

  async function renderPdfFirstPage(blob) {
    const pdfjs = await loadExternalScript('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js', 'pdfjsLib');
    pdfjs.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    const data = await blob.arrayBuffer();
    const pdf = await pdfjs.getDocument({ data }).promise;
    const page = await pdf.getPage(1);
    const viewport = page.getViewport({ scale: 2.4 });
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    await page.render({ canvasContext: ctx, viewport }).promise;
    return canvas;
  }

  async function imageElementFromBlob(blob) {
    const url = URL.createObjectURL(blob);
    try {
      const img = new Image();
      img.decoding = 'async';
      img.src = url;
      await img.decode();
      return img;
    } finally {
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    }
  }

  async function runOcr(target) {
    const Tesseract = await loadExternalScript('https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js', 'Tesseract');
    const result = await Tesseract.recognize(target, 'por+eng', {
      logger: () => {},
    });
    return result?.data?.text || '';
  }

  function normalizeOcrText(text) {
    return String(text || '')
      .replace(/[|]/g, ' ')
      .replace(/[º°]/g, 'º')
      .replace(/\r/g, '\n')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  function onlyDigits(value) {
    return String(value || '').replace(/\D/g, '');
  }

  function cleanFornecedorName(value) {
    return String(value || '')
      .replace(/\s+/g, ' ')
      .replace(/\b(CNPJ|CPF|INSCRI[CÇ][AÃ]O|ENDERE[CÇ]O|FONE|TELEFONE|DANFE|DOCUMENTO AUXILIAR).*$/i, '')
      .replace(/[,:;.-]+$/g, '')
      .trim();
  }

  function parseNfText(rawText) {
    const text = normalizeOcrText(rawText);
    const upper = text.toUpperCase();
    const beforeDest = text.split(/DESTINAT[ÁA]RIO\/?REMETENTE/i)[0] || text;
    const beforeDestUpper = beforeDest.toUpperCase();

    let numero = null;
    const numeroPatterns = [
      /NF\s*-?\s*E\s*(?:N[ºO°]|NO|NÚMERO|NUMERO)?\s*[:\-]?\s*([0-9]{3,})/i,
      /DANFE[\s\S]{0,220}?(?:N[ºO°]|NO|NÚMERO|NUMERO)\s*[:\-]?\s*([0-9]{3,})/i,
      /(?:N[ºO°]|NO|NÚMERO|NUMERO)\s*[:\-]?\s*([0-9]{3,})\s*(?:S[ÉE]RIE|SERIE)/i,
    ];
    for (const pattern of numeroPatterns) {
      const match = text.match(pattern);
      if (match?.[1]) { numero = match[1].replace(/^0+(?=\d)/, '') || match[1]; break; }
    }

    let cnpj = null;
    const cnpjCandidates = [...beforeDest.matchAll(/\b\d{2}[\.\s]?\d{3}[\.\s]?\d{3}[\/\s]?\d{4}[-\s]?\d{2}\b/g)]
      .map((m) => onlyDigits(m[0]))
      .filter((d) => d.length === 14);
    if (cnpjCandidates.length) cnpj = cnpjCandidates[cnpjCandidates.length - 1];
    if (!cnpj) {
      const cnpjLabel = beforeDest.match(/CNPJ\s*(?:DO FORNECEDOR)?\s*[:\-]?\s*(\d{2}[\.\s]?\d{3}[\.\s]?\d{3}[\/\s]?\d{4}[-\s]?\d{2})/i);
      if (cnpjLabel?.[1]) cnpj = onlyDigits(cnpjLabel[1]);
    }

    let fornecedor = null;
    const recebemos = text.match(/RECEBEMOS\s+DE\s+([\s\S]{6,160}?)\s+OS\s+(?:PRODUTOS|SERVI[CÇ]OS)/i);
    if (recebemos?.[1]) fornecedor = cleanFornecedorName(recebemos[1]);

    if (!fornecedor) {
      const lines = beforeDest.split('\\n').map((line) => cleanFornecedorName(line)).filter(Boolean);
      const bad = /^(DANFE|DOCUMENTO|AUXILIAR|NOTA FISCAL|ELETR[ÔO]NICA|CHAVE|PROTOCOLO|NATUREZA|INSCRI|DATA|FONE|WWW|HTTP|CONTATO|AVENIDA|RUA|CEP|S[ÉE]RIE|P[ÁA]GINA|SA[IÍ]DA|ENTRADA|CONTROLE|CONSULTA)$/i;
      const candidates = lines
        .filter((line) => line.length >= 8 && /[A-ZÁÉÍÓÚÃÕÇ]{3}/i.test(line) && !bad.test(line))
        .filter((line) => !/\d{2}\.\d{3}|\d{2}\/\d{2}\/\d{4}|^\d+$/.test(line))
        .filter((line) => !/GRAOMIL\s+LTDA/i.test(line));
      fornecedor = candidates.find((line) => /LTDA|EIRELI|ME|EPP|S\/A|SA\b/i.test(line)) || candidates[0] || null;
    }

    return {
      fornecedor: fornecedor || null,
      cnpj: cnpj ? formatCnpj(cnpj) : null,
      numero: numero || null,
      rawText: text,
      origem: text ? 'ocr' : null,
    };
  }

  async function extractFromNfFile(url) {
    const xml = await extractFromXml(url);
    if (xml?.fornecedor || xml?.cnpj || xml?.numero) return xml;

    try {
      const blob = await blobFromUrl(url);
      let text = '';
      if (fileLooksPdf(url, blob)) {
        try { text = await readPdfText(blob); } catch { text = ''; }
        if (!text || text.replace(/\s/g, '').length < 80) {
          const canvas = await renderPdfFirstPage(blob);
          text = await runOcr(canvas);
        }
      } else {
        const img = await imageElementFromBlob(blob);
        text = await runOcr(img);
      }
      return parseNfText(text);
    } catch (error) {
      console.warn('[Notas Fiscais] OCR NF indisponível:', error);
      return null;
    }
  }

  async function saveExtractedNfData(group, extracted) {
    if (!extracted || (!extracted.fornecedor && !extracted.cnpj && !extracted.numero)) return;
    const payload = {};
    if (extracted.fornecedor) payload.fornecedor = extracted.fornecedor;
    if (extracted.cnpj) payload.favorecido_documento = extracted.cnpj;
    if (extracted.numero) payload.nf_numero = extracted.numero;
    if (!Object.keys(payload).length) return;

    const ids = group.ids || [];
    for (const id of ids) {
      try {
        await supabase.from('financeiro_pagamentos').update(payload).eq('origem', 'COMPRAS').eq('origem_id', id);
      } catch (_) {}
      state.pagamentos[id] = { ...(state.pagamentos[id] || {}), ...payload };
    }
  }

  function descricaoItens(itens) {
    return itens.map((r) => {
      const qtd = r.quantidade || r.unidade || 1;
      let s = `${qtd} un ${r.material}`;
      if (r.tamanho) s += ` (${r.tamanho})`;
      if (r.marca) s += ` — ${r.marca}`;
      return s;
    }).join(' · ');
  }

  async function openKpiModal(nfUrl) {
    const group = groupByNf(state.kpiRows).find((g) => g.key === nfUrl);
    if (!group) return;
    const modal = document.getElementById('nfModal');
    const card = document.getElementById('nfModalCard');

    card.innerHTML = `<div style="padding:32px;text-align:center;color:#6b7280">Lendo arquivo da NF...</div>`;
    modal.classList.add('open');
    card.querySelector && modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.remove('open'); }, { once: true });

    let fornecedor = group.fornecedor;
    let cnpj = group.cnpj;
    let numero = group.numero || '-';

    let ocrStatus = '';
    if (isUrl(group.nf_url)) {
      const extracted = await extractFromNfFile(group.nf_url);
      if (!modal.classList.contains('open')) return;
      if (extracted) {
        if (extracted.fornecedor) fornecedor = extracted.fornecedor;
        if (extracted.cnpj) cnpj = formatCnpj(extracted.cnpj);
        if (extracted.numero) numero = extracted.numero;
        await saveExtractedNfData(group, extracted);
        ocrStatus = extracted.origem === 'xml' ? 'Lido pelo XML da NF' : 'Lido por OCR da NF';
      } else {
        ocrStatus = 'OCR não conseguiu identificar todos os campos';
      }
    }

    card.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px;margin-bottom:20px">
        <div>
          <h3 style="margin:0 0 4px;color:#f8fafc">Detalhes da compra</h3>
          <p style="margin:0;color:#6b7280;font-size:13px">${brDate(group.comprado_em)}</p>
          ${ocrStatus ? `<p style="margin:6px 0 0;color:#94a3b8;font-size:12px">${esc(ocrStatus)}</p>` : ''}
        </div>
        <button class="btn btn-secondary" id="nfModalClose" type="button" style="flex-shrink:0">Fechar</button>
      </div>
      <div class="nf-modal-grid">
        <div>
          <div class="nf-modal-label">Data</div>
          <div class="nf-modal-value">${brDate(group.comprado_em)}</div>
        </div>
        <div>
          <div class="nf-modal-label">Regional</div>
          <div class="nf-modal-value">${esc(group.regional)}</div>
        </div>
        <div>
          <div class="nf-modal-label">Solicitante</div>
          <div class="nf-modal-value">${esc(group.solicitante)}</div>
        </div>
        <div>
          <div class="nf-modal-label">Fornecedor</div>
          <div class="nf-modal-value">${esc(fornecedor)}</div>
        </div>
        <div>
          <div class="nf-modal-label">CNPJ do Fornecedor</div>
          <div class="nf-modal-value">${esc(cnpj)}</div>
        </div>
        <div>
          <div class="nf-modal-label">Número do Documento</div>
          <div class="nf-modal-value">${esc(numero)}</div>
        </div>
        <div>
          <div class="nf-modal-label">Valor</div>
          <div class="nf-modal-value" style="font-size:18px;font-weight:700;color:#bbf7d0">${money(group.valor_total)}</div>
        </div>
        <div class="nf-modal-full">
          <div class="nf-modal-label">Descrição</div>
          <div class="nf-modal-value">${esc(descricaoItens(group.itens))}</div>
        </div>
        <div class="nf-modal-full" style="display:flex;gap:10px;flex-wrap:wrap;padding-top:4px">
          ${isUrl(group.nf_url) ? `<a class="btn btn-secondary" href="${esc(group.nf_url)}" target="_blank" rel="noopener">Baixar NF</a>` : `<span style="color:#6b7280;font-size:13px">NF: ${esc(group.nf_url || '-')}</span>`}
          ${isUrl(group.comprovante_url) ? `<a class="btn btn-secondary" href="${esc(group.comprovante_url)}" target="_blank" rel="noopener">Baixar Comprovante</a>` : ''}
          ${!group.nf_lancado ? `<button class="btn btn-primary" data-lancar-modal="${esc(group.key)}" type="button">Lançado</button>` : `<span class="nf-badge lancado">Lançado ${brDate(group.nf_lancado_em)}</span>`}
        </div>
      </div>
    `;

    card.querySelector('#nfModalClose').addEventListener('click', () => modal.classList.remove('open'));
    const btnLancar = card.querySelector('[data-lancar-modal]');
    if (btnLancar) btnLancar.addEventListener('click', () => lancarGrupo(btnLancar.dataset.lancarModal, btnLancar));
  }

  async function lancarGrupo(nfUrl, btn) {
    if (!confirm('Confirmar lançamento desta NF?')) return;
    const original = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Salvando...';

    const ids = state.kpiRows.filter((r) => r.nf_url === nfUrl).map((r) => r.id);
    const now = new Date().toISOString();

    const { error } = await supabase
      .from('compras_itens')
      .update({ nf_lancado: true, nf_lancado_em: now })
      .in('id', ids);

    if (error) {
      alert(`Erro ao lançar: ${error.message}`);
      btn.disabled = false;
      btn.textContent = original;
      return;
    }

    state.kpiRows.filter((r) => r.nf_url === nfUrl).forEach((r) => {
      r.nf_lancado = true;
      r.nf_lancado_em = now;
    });

    document.getElementById('nfModal').classList.remove('open');
    updateKpiCounters();
    renderKpis();
  }

  document.querySelectorAll('[data-kpi-filter]').forEach((b) => {
    b.addEventListener('click', () => {
      state.kpiFilter = b.dataset.kpiFilter;
      document.querySelectorAll('[data-kpi-filter]').forEach((x) => x.classList.toggle('active', x === b));
      renderKpis();
    });
  });

  load();
});
