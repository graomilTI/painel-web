import { supabase } from './supabaseClient.js';

(function () {
  'use strict';

  const previousOpenHome = window.OPERACIONAL?.openHome;
  const STYLE_ID = 'opv20-colabs-dist-style';
  const CANDIDATE_TABLES = [
    'conferencia_deslocamento',
    'conferencia_deslocamentos',
    'conferencia_lista_deslocamento',
    'conferencia_deslocamento_colaboradores',
    'lista_deslocamento',
    'deslocamento',
    'deslocamentos',
    'deslocamento_colaboradores',
    'operacional_deslocamentos',
    'programacao_deslocamentos'
  ];

  let observer = null;
  let applyTimer = null;
  let applying = false;
  let deslocamentoLoaded = false;
  const deslocamentoNomes = new Set();

  const esc = v => String(v ?? '').replace(/[&<>'"]/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[c]));

  const norm = v => String(v ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();

  function css() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .opv15-colabs-card{grid-column:1/2;grid-row:2;border:1px solid rgba(148,163,184,.16);border-radius:18px;background:linear-gradient(180deg,rgba(15,23,42,.96),rgba(2,6,23,.9));overflow:hidden;margin-top:12px}.opv2-side{grid-column:2;grid-row:1/span 2}.opv15-colabs-head{display:flex;justify-content:space-between;gap:12px;align-items:center;padding:12px 14px;border-bottom:1px solid rgba(148,163,184,.12)}.opv15-colabs-head strong{color:#fff;font-size:14px}.opv15-colabs-head span{color:#94a3b8;font-size:12px}.opv15-colabs-note{padding:8px 14px;color:#fde68a;background:rgba(120,53,15,.13);border-bottom:1px solid rgba(251,191,36,.14);font-size:12px}.opv15-colabs-table{width:100%;border-collapse:collapse;font-size:12px}.opv15-colabs-table th,.opv15-colabs-table td{padding:8px 10px;border-bottom:1px solid rgba(148,163,184,.08);text-align:left;color:#cbd5e1}.opv15-colabs-table th{color:#93c5fd;text-transform:uppercase;font-size:10px;letter-spacing:.03em;background:rgba(15,23,42,.55)}.opv15-colabs-table td:nth-child(3),.opv15-colabs-table td:nth-child(4),.opv15-colabs-table td:nth-child(5),.opv15-colabs-table td:nth-child(6){text-align:right}.opv15-tag{display:inline-flex;align-items:center;border-radius:999px;padding:3px 8px;font-size:10px;font-weight:900;border:1px solid rgba(148,163,184,.18);background:rgba(15,23,42,.8)}.opv15-tag.frota{color:#bbf7d0}.opv15-tag.particular{color:#bfdbfe}.opv15-tag.uber{color:#fde68a}.opv15-empty{padding:16px;color:#94a3b8;text-align:center;font-size:13px}@media(max-width:1100px){.opv15-colabs-card{grid-column:1;grid-row:auto}.opv2-side{grid-column:1;grid-row:auto}}
    `;
    document.head.appendChild(style);
  }

  function parseBrNumber(raw) {
    const s = String(raw || '').trim();
    if (!s) return null;
    const n = s.includes(',')
      ? Number(s.replace(/\./g, '').replace(',', '.'))
      : Number(s.replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  }

  function parseKm(text) {
    const m = String(text || '').match(/([\d.,]+)\s*km\s*base/i);
    return m ? (parseBrNumber(m[1]) || 0) : 0;
  }

  function parseSaldoOs(text) {
    const m = String(text || '').match(/saldo\s+rem\.\s*([\d.,]+)\s*t/i);
    return m ? parseBrNumber(m[1]) : null;
  }

  function fmtKm(value) {
    return `${Number(value || 0).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} km`;
  }

  function fmtTon(value) {
    if (!Number.isFinite(Number(value))) return '—';
    return `${Number(value).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} t`;
  }

  function nomeFromRow(row) {
    return [row?.colaborador_nome,row?.nome_colaborador,row?.nome,row?.funcionario,row?.colaborador,row?.motorista,row?.passageiro,row?.responsavel]
      .find(v => v !== undefined && v !== null && String(v).trim() !== '') || '';
  }

  function rowAtivo(row) {
    const s = norm(`${row?.status || ''} ${row?.situacao || ''} ${row?.ativo === false ? 'INATIVO' : ''}`);
    return !/CANCEL|INATIV|DESLIG|DEMIT|REMOVID|ARQUIV|FINALIZ/.test(s);
  }

  async function safeSelect(table) {
    try {
      const { data, error } = await supabase.from(table).select('*').limit(5000);
      if (error) throw error;
      return Array.isArray(data) ? data : [];
    } catch (_) {
      return [];
    }
  }

  async function loadDeslocamento() {
    if (deslocamentoLoaded) return;
    deslocamentoLoaded = true;
    const batches = await Promise.all(CANDIDATE_TABLES.map(async table => ({ table, rows: await safeSelect(table) })));
    for (const batch of batches) {
      for (const row of batch.rows) {
        if (!rowAtivo(row)) continue;
        const nome = nomeFromRow(row);
        if (nome) deslocamentoNomes.add(norm(nome));
      }
    }
    console.info('[opv20] deslocamento conferência', {
      tabelas: batches.filter(b => b.rows.length).map(b => `${b.table}:${b.rows.length}`),
      colaboradores: deslocamentoNomes.size
    });
  }

  function getColaborador(row) {
    const strong = row.querySelector('strong')?.textContent || '';
    return strong.split('·')[0].trim() || '—';
  }

  function getTipo(row) {
    const text = row.textContent || '';
    const t = norm(text);
    const nome = getColaborador(row);
    if (t.includes(' FROTA') || t.endsWith('FROTA') || t.includes(' MOTORISTA')) return 'frota';
    if (deslocamentoNomes.has(norm(nome))) return 'particular';
    return 'uber';
  }

  function labelTipo(tipo) {
    if (tipo === 'frota') return 'Frota';
    if (tipo === 'particular') return 'Particular';
    return 'Uber/A definir';
  }

  function getVisibleRows(root) {
    return [...root.querySelectorAll('.opv2-row[data-rota]')].filter(row => row.offsetParent !== null);
  }

  function collect(root) {
    const rows = getVisibleRows(root);
    const totals = { frota: 0, particular: 0, uber: 0 };
    const colabs = new Map();

    for (const row of rows) {
      const text = row.textContent || '';
      const tipo = getTipo(row);
      const km = parseKm(text);
      const nome = getColaborador(row);
      const saldoOs = parseSaldoOs(text);
      const key = norm(nome) || nome;
      const current = colabs.get(key) || { nome, tipo, os: 0, saldo: 0, kmMax: 0, kmMin: Infinity, kmSomaBruta: 0 };

      current.os += 1;
      current.saldo += Number(saldoOs || 0);
      current.kmMax = Math.max(current.kmMax, km);
      current.kmMin = Math.min(current.kmMin, km || current.kmMin);
      current.kmSomaBruta += km;

      if (current.tipo !== 'frota' && tipo === 'frota') current.tipo = 'frota';
      else if (current.tipo !== 'frota' && current.tipo !== 'particular' && tipo === 'particular') current.tipo = 'particular';
      else if (current.tipo !== 'frota' && current.tipo !== 'particular') current.tipo = 'uber';

      colabs.set(key, current);
    }

    const normalized = [...colabs.values()].map(c => {
      // Regra conservadora: não multiplica por OS. Conta o maior deslocamento estimado do colaborador no filtro atual.
      c.km = c.kmMax;
      c.kmBruto = c.kmSomaBruta;
      totals[c.tipo] += c.km;
      return c;
    }).sort((a, b) => b.km - a.km || a.nome.localeCompare(b.nome));

    return { totals, colabs: normalized };
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
    upsertDistanceCard(grid, 'dist-frota', 'Distância frota consol.', totals.frota);
    upsertDistanceCard(grid, 'dist-particular', 'Distância particular consol.', totals.particular);
    upsertDistanceCard(grid, 'dist-uber', 'Distância Uber/A definir consol.', totals.uber);
  }

  function renderColabs(root, colabs) {
    const map = root.querySelector('#opv2Map');
    if (!map) return;
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
          <thead><tr><th>Colaborador</th><th>Tipo</th><th>OS</th><th>Distância consol.</th><th>Saldo rem.</th><th>Bruta anterior</th></tr></thead>
          <tbody>${colabs.map(c => `
            <tr>
              <td>${esc(c.nome)}</td>
              <td><span class="opv15-tag ${esc(c.tipo)}">${esc(labelTipo(c.tipo))}</span></td>
              <td>${c.os}</td>
              <td>${esc(fmtKm(c.km))}</td>
              <td>${esc(fmtTon(c.saldo))}</td>
              <td>${esc(fmtKm(c.kmBruto))}</td>
            </tr>`).join('')}</tbody>
        </table>`
      : '<div class="opv15-empty">Nenhum colaborador listado para o filtro atual.</div>';

    card.innerHTML = `
      <div class="opv15-colabs-head">
        <strong>Colaboradores no mapa</strong>
        <span>${colabs.length} colaborador(es) · ${totalOs} OS</span>
      </div>
      <div class="opv15-colabs-note">
        Distância consolidada: usa a maior distância estimada por colaborador no filtro atual, sem multiplicar por OS. A coluna “Bruta anterior” mostra quanto daria se somasse OS por OS.
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
    const deslocPromise = loadDeslocamento();
    if (typeof previousOpenHome === 'function') await previousOpenHome(root, opts);
    else {
      root.innerHTML = `<article class="card"><h3>Operacional ADM</h3><p>Não foi possível carregar o módulo operacional.</p></article>`;
      return;
    }
    await deslocPromise;
    apply(root);
    observe(root);
    setTimeout(() => apply(root), 300);
    setTimeout(() => apply(root), 900);
  }

  window.OPERACIONAL = { ...(window.OPERACIONAL || {}), openHome };
})();
