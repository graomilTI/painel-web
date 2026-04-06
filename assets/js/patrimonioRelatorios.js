(function () {
  'use strict';

  const EXPORT_W = 1920;
  const EXPORT_H = 1080;
  const EXPORT_SCALE = 2;
  const DEFAULT_ROWS_PER_PAGE = 18;

  function escapeHtml(v) {
    return String(v ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function chunkArray(arr, size) {
    const out = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
  }

  function ensureExportHost() {
    let host = document.getElementById('patrimonio-export-host');
    if (!host) {
      host = document.createElement('div');
      host.id = 'patrimonio-export-host';
      host.style.position = 'fixed';
      host.style.left = '-99999px';
      host.style.top = '0';
      host.style.zIndex = '-1';
      document.body.appendChild(host);
    }
    return host;
  }

  function buildPageHtml({ titulo, subtitulo, stats, rows, pageIndex, pageCount }) {
    const statHtml = [
      `<div class="gstat"><span class="glabel">Registros:</span><strong>${stats.registros}</strong></div>`,
      `<div class="gstat"><span class="glabel">Base:</span><strong>${stats.base}</strong></div>`,
      `<div class="gstat"><span class="glabel">% em dia:</span><strong>${stats.percentual}</strong></div>`
    ].join('');

    const bodyRows = rows.map((item) => {
      const dias = Number(item.dias_sem_leitura ?? item.diasSemLeitura ?? item.dias ?? 0) || 0;
      const rowClass = dias > 10 ? 'is-atrasado' : 'is-ok';
      return `
        <tr class="${rowClass}">
          <td class="col-pat">${escapeHtml(item.patrimonio_codigo ?? item.patrimonio ?? '')}</td>
          <td class="col-sup">${escapeHtml(item.supervisao ?? '')}</td>
          <td class="col-nome">${escapeHtml(item.funcionario ?? item.nome ?? '')}</td>
          <td class="col-id">${escapeHtml(item.identificacao ?? '')}</td>
          <td class="col-leitura">${escapeHtml(item.ultima_leitura_fmt ?? item.ultimaLeitura ?? item.ultima_leitura ?? '')}</td>
          <td class="col-dias">${escapeHtml(dias)}</td>
        </tr>`;
    }).join('');

    return `
      <div class="g1000-export-page">
        <div class="g1000-header">
          <div>
            <h1>${escapeHtml(titulo)}</h1>
            <p>${escapeHtml(subtitulo)}</p>
          </div>
          <div class="gpage-badge">Página ${pageIndex + 1}/${pageCount}</div>
        </div>

        <div class="gstats">${statHtml}</div>

        <div class="gtable-wrap">
          <table class="gtable">
            <thead>
              <tr>
                <th class="col-pat">PATRIMÔNIO</th>
                <th class="col-sup">SUPERVISÃO</th>
                <th class="col-nome">NOME</th>
                <th class="col-id">IDENTIFICAÇÃO</th>
                <th class="col-leitura">ÚLTIMA LEITURA</th>
                <th class="col-dias">DIAS</th>
              </tr>
            </thead>
            <tbody>${bodyRows}</tbody>
          </table>
        </div>
      </div>`;
  }

  function ensureStyles() {
    if (document.getElementById('patrimonio-export-styles')) return;
    const style = document.createElement('style');
    style.id = 'patrimonio-export-styles';
    style.textContent = `
      .g1000-export-page {
        width: ${EXPORT_W}px;
        min-height: ${EXPORT_H}px;
        box-sizing: border-box;
        padding: 38px 42px;
        background: #f8fafc;
        color: #0f172a;
        font-family: Arial, Helvetica, sans-serif;
      }
      .g1000-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 16px;
        margin-bottom: 18px;
      }
      .g1000-header h1 {
        margin: 0;
        font-size: 34px;
        line-height: 1.1;
      }
      .g1000-header p {
        margin: 8px 0 0;
        font-size: 16px;
        color: #475569;
      }
      .gpage-badge {
        background: #e2e8f0;
        border: 1px solid #cbd5e1;
        border-radius: 999px;
        padding: 10px 16px;
        font-size: 14px;
        font-weight: 700;
        white-space: nowrap;
      }
      .gstats {
        display: flex;
        gap: 16px;
        margin-bottom: 26px;
      }
      .gstat {
        background: #fff;
        border: 1px solid #cbd5e1;
        border-radius: 18px;
        padding: 14px 18px;
        min-width: 150px;
      }
      .glabel {
        color: #475569;
        margin-right: 6px;
      }
      .gtable-wrap {
        background: #fff;
        border-radius: 20px;
        overflow: hidden;
        box-shadow: 0 8px 30px rgba(15, 23, 42, 0.08);
      }
      .gtable {
        width: 100%;
        border-collapse: collapse;
        table-layout: fixed;
      }
      .gtable thead th {
        background: #0f172a;
        color: #fff;
        font-size: 13px;
        letter-spacing: .04em;
        text-align: left;
        padding: 14px 10px;
        border-right: 1px solid rgba(255,255,255,.15);
      }
      .gtable tbody td {
        font-size: 14px;
        padding: 10px 10px;
        border: 1px solid #dbe4ef;
        vertical-align: top;
        word-break: break-word;
      }
      .gtable tbody tr.is-atrasado td.col-dias {
        color: #b91c1c;
        font-weight: 700;
      }
      .gtable tbody tr.is-ok td.col-dias {
        color: #166534;
        font-weight: 700;
      }
      .col-pat { width: 8%; white-space: nowrap; }
      .col-sup { width: 13%; }
      .col-nome { width: 22%; }
      .col-id { width: 35%; }
      .col-leitura { width: 14%; white-space: nowrap; font-size: 12px; }
      .col-dias { width: 8%; text-align: center; white-space: nowrap; }
      @media print {
        @page { size: landscape; margin: 10mm; }
      }
    `;
    document.head.appendChild(style);
  }

  async function domToPng(node, filenameBase) {
    if (!window.html2canvas) {
      throw new Error('html2canvas não encontrado.');
    }
    const canvas = await window.html2canvas(node, {
      scale: EXPORT_SCALE,
      backgroundColor: '#f8fafc',
      useCORS: true,
      logging: false,
      width: EXPORT_W,
      height: EXPORT_H,
      windowWidth: EXPORT_W,
      windowHeight: EXPORT_H
    });
    const dataUrl = canvas.toDataURL('image/png');
    return { filename: `${filenameBase}.png`, dataUrl };
  }

  async function gerarPacoteImagensPaginado({
    rows,
    titulo,
    subtitulo,
    stats,
    filePrefix,
    rowsPerPage = DEFAULT_ROWS_PER_PAGE
  }) {
    ensureStyles();
    const host = ensureExportHost();
    host.innerHTML = '';

    const pages = chunkArray(rows, rowsPerPage);
    const results = [];

    for (let i = 0; i < pages.length; i++) {
      const wrap = document.createElement('div');
      wrap.innerHTML = buildPageHtml({
        titulo,
        subtitulo,
        stats,
        rows: pages[i],
        pageIndex: i,
        pageCount: pages.length
      });
      const page = wrap.firstElementChild;
      host.appendChild(page);
      // render after append
      // eslint-disable-next-line no-await-in-loop
      const png = await domToPng(page, `${filePrefix}-pagina-${String(i + 1).padStart(2, '0')}`);
      results.push(png);
      host.removeChild(page);
    }

    return results;
  }

  async function baixarZipDeImagens(images, zipName) {
    if (!window.JSZip) throw new Error('JSZip não encontrado.');
    const zip = new window.JSZip();

    images.forEach((img) => {
      const base64 = img.dataUrl.split(',')[1];
      zip.file(img.filename, base64, { base64: true });
    });

    const blob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = zipName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
  }

  window.PATRIMONIO_RELATORIOS = window.PATRIMONIO_RELATORIOS || {};
  window.PATRIMONIO_RELATORIOS.gerarPacoteImagensPaginado = gerarPacoteImagensPaginado;
  window.PATRIMONIO_RELATORIOS.baixarZipDeImagens = baixarZipDeImagens;
  window.PATRIMONIO_RELATORIOS.EXPORT_CONFIG = {
    width: EXPORT_W,
    height: EXPORT_H,
    rowsPerPage: DEFAULT_ROWS_PER_PAGE
  };
})();
