(function () {
  'use strict';

  const previousOpenHome = window.OPERACIONAL?.openHome;
  const STYLE_ID = 'opv15-colabs-dist-style';
  let observer = null;
  let applyTimer = null;
  let applying = false;

  const norm = v => String(v ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();

  const esc = v => String(v ?? '').replace(/[&<>'"]/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[c]));

  function css() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .opv15-colabs-card {
        grid-column: 1 / 2;
        grid-row: 2;
        border: 1px solid rgba(148,163,184,.16);
        border-radius: 18px;
        background: linear-gradient(180deg, rgba(15,23,42,.96), rgba(2,6,23,.9));
        overflow: hidden;
        margin-top: 12px;
      }

      .opv2-side {
        grid-column: 2;
        grid-row: 1 / span 2;
      }

      .opv15-colabs-head {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        align-items: center;
        padding: 12px 14px;
        border-bottom: 1px solid rgba(148,163,184,.12);
      }

      .opv15-colabs-head strong {
        color: #fff;
        font-size: 14px;
      }

      .opv15-colabs-head span {
        color: #94a3b8;
        font-size: 12px;
      }

      .opv15-colabs-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 12px;
      }

      .opv15-colabs-table th,
      .opv15-colabs-table td {
        padding: 8px 10px;
        border-bottom: 1px solid rgba(148,163,184,.08);
        text-align: left;
        color: #cbd5e1;
      }

      .opv15-colabs-table th {
        color: #93c5fd;
        text-transform: uppercase;
        font-size: 10px;
        letter-spacing: .03em;
        background: rgba(15,23,42,.55);
      }

      .opv15-colabs-table td:nth-child(3),
      .opv15-colabs-table td:nth-child(4),
      .opv15-colabs-table td:nth-child(5) {
        text-align: right;
      }

      .opv15-tag {
        display: inline-flex;
        align-items: center;
        border-radius: 999px;
        padding: 3px 8px;
        font-size: 10px;
        font-weight: 900;
        border: 1px solid rgba(148,163,184,.18);
        background: rgba(15,23,42,.8);
      }

      .opv15-tag.frota { color: #bbf7d0; }
      .opv15-tag.particular { color: #bfdbfe; }
      .opv15-tag.uber { color: #fde68a; }

      .opv15-empty {
        padding: 16px;
        color: #94a3b8;
        text-align: center;
        font-size: 13px;
      }

      @media(max-width:1100px) {
        .opv15-colabs-card { grid-column: 1; grid-row: auto; }
        .opv2-side { grid-column: 1; grid-row: auto; }
      }
    `;
    document.head.appendChild(style);
  }

  function parseKm(text) {
    const m = String(text || '').match(/([\d.,]+)\s*km\s*base/i);
    if (!m) return 0;
    const n = Number(m[1].replace(/\./g, '').replace(',', '.'));
    return Number.isFinite(n) ? n : 0;
  }

  function parseSaldoAcumulado(text) {
    const m = String(text || '').match(/acumulado\s+colab\.\s*([\d.,]+)\s*t/i);
    if (!m) return null;
    const n = Number(m[1].replace(/\./g, '').replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  }

  function fmtKm(value) {
    return `${Number(value || 0).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} km`;
  }

  function fmtTon(value) {
    if (!Number.isFinite(Number(value))) return '—';
    return `${Number(value).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} t`;
  }

  function getTipo(text) {
    const t = norm(text);
    if (t.includes('UBER')) return 'uber';
    if (t.includes(' FROTA') || t.endsWith('FROTA') || t.includes(' MOTORISTA')) return 'frota';
    return 'particular';
  }

  function getColaborador(row) {
    const strong = row.querySelector('strong')?.textContent || '';
    return strong.split('·')[0].trim() || '—';
  }

  function getVisibleRows(root) {
    return [...root.querySelectorAll('.opv2-row[data-rota]')]
      .filter(row => row.offsetParent !== null);
  }

  function collect(root) {
    const rows = getVisibleRows(root);
    const totals = { frota: 0, particular: 0, uber: 0 };
    const colabs = new Map();

    for (const row of rows) {
      const text = row.textContent || '';
      const tipo = getTipo(text);
      const km = parseKm(text);
      const nome = getColaborador(row);
      const saldo = parseSaldoAcumulado(text);

      totals[tipo] += km;

      const key = norm(nome) || nome;
      const current = colabs.get(key) || {
        nome,
        tipo,
        km: 0,
        os: 0,
        saldo: null,
      };

      current.km += km;
      current.os += 1;
      if (current.tipo !== 'frota' && tipo === 'frota') current.tipo = 'frota';
      else if (current.tipo !== 'frota' && current.tipo !== 'uber' && tipo === 'uber') current.tipo = 'uber';
      if (saldo !== null) current.saldo = Math.max(Number(current.saldo || 0), saldo);

      colabs.set(key, current);
    }

    return {
      totals,
      colabs: [...colabs.values()].sort((a, b) => b.km - a.km || a.nome.localeCompare(b.nome)),
    };
  }

  function upsertDistanceCard(grid, key, label, value) {
    if (!grid) return;
    let card = grid.querySelector(`[data-opv15-card="${key}"]`);
    if (!card) {
      card = document.createElement('div');
      card.className = 'opv2-kpi';
      card.dataset.opv15Card = key;
      grid.appendChild(card);
    }
    card.innerHTML = `<span>${esc(label)}</span><strong>${esc(fmtKm(value))}</strong>`;
  }

  function renderCards(root, totals) {
    const grid = root.querySelector('.opv2-kpis');
    if (!grid) return;

    upsertDistanceCard(grid, 'dist-frota', 'Distância total frota', totals.frota);
    upsertDistanceCard(grid, 'dist-particular', 'Distância total particular', totals.particular);
    upsertDistanceCard(grid, 'dist-uber', 'Distância total Uber', totals.uber);
  }

  function renderColabs(root, colabs) {
    const map = root.querySelector('#opv2Map');
    const grid = root.querySelector('.opv2-grid');
    if (!map || !grid) return;

    let card = root.querySelector('[data-opv15-colabs]');
    if (!card) {
      card = document.createElement('section');
      card.className = 'opv15-colabs-card';
      card.dataset.opv15Colabs = '1';
      map.insertAdjacentElement('afterend', card);
    }

    const totalOs = colabs.reduce((acc, c) => acc + c.os, 0);
    const body = colabs.length
      ? `<table class="opv15-colabs-table">
          <thead>
            <tr>
              <th>Colaborador</th>
              <th>Tipo</th>
              <th>OS</th>
              <th>Distância</th>
              <th>Saldo acum.</th>
            </tr>
          </thead>
          <tbody>
            ${colabs.map(c => `
              <tr>
                <td>${esc(c.nome)}</td>
                <td><span class="opv15-tag ${esc(c.tipo)}">${esc(c.tipo === 'frota' ? 'Frota' : c.tipo === 'uber' ? 'Uber' : 'Particular')}</span></td>
                <td>${c.os}</td>
                <td>${esc(fmtKm(c.km))}</td>
                <td>${esc(fmtTon(c.saldo))}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>`
      : '<div class="opv15-empty">Nenhum colaborador listado para o filtro atual.</div>';

    card.innerHTML = `
      <div class="opv15-colabs-head">
        <strong>Colaboradores no mapa</strong>
        <span>${colabs.length} colaborador(es) · ${totalOs} OS</span>
      </div>
      ${body}
    `;
  }

  function apply(root) {
    if (!root || applying) return;
    applying = true;
    try {
      css();
      const data = collect(root);
      renderCards(root, data.totals);
      renderColabs(root, data.colabs);
    } finally {
      applying = false;
    }
  }

  function schedule(root) {
    clearTimeout(applyTimer);
    applyTimer = setTimeout(() => apply(root), 120);
  }

  function observe(root) {
    if (observer) observer.disconnect();
    observer = new MutationObserver(() => schedule(root));
    observer.observe(root, { childList: true, subtree: true });
  }

  async function openHome(root, opts = {}) {
    if (typeof previousOpenHome === 'function') {
      await previousOpenHome(root, opts);
    } else {
      root.innerHTML = `
        <article class="card">
          <h3>Operacional ADM</h3>
          <p>Não foi possível carregar o módulo operacional.</p>
        </article>
      `;
      return;
    }

    apply(root);
    observe(root);
    setTimeout(() => apply(root), 300);
    setTimeout(() => apply(root), 900);
  }

  window.OPERACIONAL = { ...(window.OPERACIONAL || {}), openHome };
})();
