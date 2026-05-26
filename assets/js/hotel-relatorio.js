import { initProtectedPage } from './pageInit.js';
import { supabase } from './supabaseClient.js';

function esc(v) { return String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'","&#039;"); }
function brDate(v) { if (!v) return '-'; const [y,m,d]=String(v).slice(0,10).split('-'); return y&&m&&d?`${d}/${m}/${y}`:String(v); }
function normalizeStr(v) { return String(v||'').normalize('NFD').replace(/[̀-ͯ]/g,'').trim().toLowerCase(); }
function todayStr() { return new Date().toISOString().slice(0,10); }

function getDatesInRange(start, end) {
  if (!start || !end) return start ? [start] : [];
  const dates = [];
  let cur = new Date(start + 'T00:00:00');
  const last = new Date(end + 'T00:00:00');
  while (cur <= last && dates.length < 90) {
    dates.push(cur.toISOString().slice(0,10));
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}

function injectStyles() {
  if (document.getElementById('hotelRelStyles')) return;
  const s = document.createElement('style');
  s.id = 'hotelRelStyles';
  s.textContent = `
    .hr-filter{display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap;margin-bottom:16px}
    .hr-ff{display:flex;flex-direction:column;gap:5px}
    .hr-ff label{font-size:11px;font-weight:900;text-transform:uppercase;letter-spacing:.06em;color:var(--muted)}
    .hr-ff input{border:1px solid rgba(255,255,255,.08);background:#15152a;color:var(--text);border-radius:12px;padding:10px 13px;outline:none;color-scheme:dark;font-size:13px}
    .hr-ff input:focus{border-color:var(--green-2);box-shadow:0 0 0 3px rgba(111,208,165,.12)}
    .hr-wrap{overflow:auto;border:1px solid var(--line);border-radius:18px}
    .hr-tbl{width:100%;border-collapse:collapse;min-width:780px;background:#15152a}
    .hr-tbl th,.hr-tbl td{padding:11px 14px;border-bottom:1px solid var(--line);text-align:left;vertical-align:middle}
    .hr-tbl th{font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.07em}
    .hr-tbl tr.no-prod td{background:rgba(220,38,38,.07)!important}
    .hr-tbl tr.no-prod td:first-child{box-shadow:inset 3px 0 0 rgba(220,38,38,.6)}
    .hr-tbl tr:hover td{background:rgba(111,208,165,.03)}
    .hr-tbl tr.no-prod:hover td{background:rgba(220,38,38,.1)!important}
    .hbadge{display:inline-flex;align-items:center;padding:4px 9px;border-radius:999px;font-size:11px;font-weight:800;border:1px solid transparent}
    .hbadge.ok{color:#bbf7d0;background:rgba(22,101,52,.2);border-color:rgba(111,208,165,.24)}
    .hbadge.err{color:#fecaca;background:rgba(220,38,38,.12);border-color:rgba(220,38,38,.24)}
    .hbadge.warn{color:#fde68a;background:rgba(245,158,11,.1);border-color:rgba(245,158,11,.22)}
    .hbadge.neutral{color:var(--text);background:rgba(255,255,255,.05);border-color:rgba(255,255,255,.1)}
    .hr-summary{display:flex;gap:20px;flex-wrap:wrap;margin-bottom:14px;padding:12px 0;border-bottom:1px solid var(--line)}
    .hr-kpi{font-size:14px;font-weight:900;color:var(--text)}
    .hr-kpi small{color:var(--muted);font-weight:400;margin-left:5px;font-size:12px}
    .hr-muted{color:var(--muted);font-size:12px}
    .hr-fonte{display:inline-block;font-size:10px;color:#6b7280;margin-top:2px}
    @media(max-width:600px){.hr-filter{flex-direction:column}.hr-ff input{width:100%}}
  `;
  document.head.appendChild(s);
}

function statusBadge(v) {
  const st = normalizeStr(v);
  if (['hospedado','reservada','checkin_previsto','stay','check'].some(k => st.includes(k))) return `<span class="hbadge ok">${esc(v)}</span>`;
  if (['checkout_hoje','renovacao_necessaria'].some(k => st.includes(k))) return `<span class="hbadge warn">${esc(v)}</span>`;
  if (!v) return '<span class="hbadge neutral">—</span>';
  return `<span class="hbadge neutral">${esc(v)}</span>`;
}

initProtectedPage('Relatório de Hospedagem', (content) => {
  injectStyles();
  const today = todayStr();
  let lastRows = [];

  content.innerHTML = `
    <section class="hero-card">
      <div>
        <div class="eyebrow">Hospedagem</div>
        <h2>Relatório de Hospedagem</h2>
        <p>Colaboradores hospedados no período cruzados com a Produção Diária.</p>
      </div>
      <div class="hero-badge-wrap"><span class="hero-badge">RELATÓRIO</span></div>
    </section>

    <article class="card" style="margin-top:16px">
      <div class="hr-filter">
        <div class="hr-ff"><label>De</label><input id="hrDe" type="date" value="${today}" /></div>
        <div class="hr-ff"><label>Até</label><input id="hrAte" type="date" value="${today}" /></div>
        <button class="btn btn-primary" id="hrBuscar" type="button" style="margin-bottom:0;align-self:flex-end">Buscar</button>
        <button class="btn btn-secondary" id="hrExportar" type="button" style="margin-bottom:0;align-self:flex-end;display:none">Exportar CSV</button>
      </div>
      <div id="hrSummary" class="hr-summary" style="display:none"></div>
      <div id="hrMsg" style="font-size:13px;color:var(--muted);padding:8px 0">Clique em Buscar para gerar o relatório.</div>
      <div id="hrOut"></div>
    </article>
  `;

  async function loadReport() {
    const de = document.getElementById('hrDe').value || today;
    const ate = document.getElementById('hrAte').value || today;
    const msg = document.getElementById('hrMsg');
    const summaryEl = document.getElementById('hrSummary');
    const out = document.getElementById('hrOut');
    const exportBtn = document.getElementById('hrExportar');

    out.innerHTML = '';
    summaryEl.style.display = 'none';
    exportBtn.style.display = 'none';
    lastRows = [];
    msg.textContent = 'Carregando hospedagens...';

    const ACTIVE_HOSP = new Set(['HOSPEDADO','CHECKIN_PREVISTO','CHECKOUT_HOJE','RENOVACAO_NECESSARIA']);

    // Hospedagens do fluxo principal (painel geral = reservas abertas)
    const { data: painelData, error: painelErr } = await supabase
      .from('hospedagem_painel_geral')
      .select('*')
      .not('status_solicitacao', 'in', '("CANCELADA","CONCLUIDA")')
      .limit(2000);

    if (painelErr) { msg.textContent = `Erro ao carregar hospedagens: ${painelErr.message}`; return; }

    // Filtro de sobreposição de datas no lado cliente
    const activePainel = (painelData || []).filter(r => {
      const ci = r.data_checkin || r.data_checkin_prevista || '';
      const co = r.data_checkout || r.data_checkout_prevista || '';
      if (!ci || ci > ate) return false;
      if (co && co < de) return false;
      const hosp = String(r.status_hospedagem || '').toUpperCase();
      const sol = String(r.status_solicitacao || '').toUpperCase();
      return ACTIVE_HOSP.has(hosp) || sol === 'RESERVADA';
    });

    // Enriquecer com lista detalhada de colaboradores
    const solIds = [...new Set(activePainel.map(r => r.solicitacao_id).filter(Boolean))];
    const colabMap = new Map();
    if (solIds.length) {
      const { data: colabData } = await supabase
        .from('hospedagem_solicitacao_colaboradores')
        .select('solicitacao_id,nome_colaborador,supervisao,regional,coordenacao')
        .in('solicitacao_id', solIds);
      (colabData || []).forEach(c => {
        if (!colabMap.has(c.solicitacao_id)) colabMap.set(c.solicitacao_id, []);
        colabMap.get(c.solicitacao_id).push(c);
      });
    }

    // Hospedagens do histórico importado
    msg.textContent = 'Carregando histórico de hospedagem...';
    const { data: histData } = await supabase
      .from('hospedagem_historico_atual_colaboradores')
      .select('id,data,regional,cidade,uf,colaborador,status_hospedagem,status_planilha,hotel')
      .gte('data', de)
      .lte('data', ate)
      .limit(3000);

    const activeHist = (histData || []).filter(r => {
      const st = String(r.status_hospedagem || r.status_planilha || '').toUpperCase().replace(/\s+/g, '_');
      return !['CHECKOUT_REALIZADO','CONCLUIDA','CANCELADA','CHECK_OUT'].includes(st) && !st.startsWith('CHECKOUT');
    });

    // Produção diária do período
    msg.textContent = 'Carregando produção diária...';
    const { data: prodData } = await supabase
      .from('producao_snapshot')
      .select('data_referencia,funcionario')
      .gte('data_referencia', de)
      .lte('data_referencia', ate)
      .limit(10000);

    const prodSet = new Set();
    (prodData || []).forEach(p => {
      if (p.funcionario && p.data_referencia) {
        prodSet.add(`${normalizeStr(p.funcionario)}__${p.data_referencia}`);
      }
    });

    // Montar linhas por colaborador
    const allDates = getDatesInRange(de, ate);
    const rows = [];

    activePainel.forEach(r => {
      const ci = r.data_checkin || r.data_checkin_prevista || de;
      const co = r.data_checkout || r.data_checkout_prevista || ate;
      const stayDates = allDates.filter(d => d >= ci && d <= co);

      const colabs = colabMap.get(r.solicitacao_id);
      const pessoas = colabs && colabs.length
        ? colabs.map(c => ({ nome: c.nome_colaborador || '-', regional: c.supervisao || c.regional || '' }))
        : String(r.colaboradores || r.colaborador || '').split(/[\n\r,;]+/).map(n => n.trim()).filter(Boolean)
            .map(nome => ({ nome, regional: r.supervisao_colaborador || r.regional_colaborador || '' }));

      pessoas.forEach(({ nome, regional }) => {
        if (!nome || nome === '-') return;
        const prod = stayDates.map(d => ({ d, ok: prodSet.has(`${normalizeStr(nome)}__${d}`) }));
        rows.push({
          colaborador: nome,
          regional: regional || '-',
          hotel: r.hotel || '-',
          cidade: r.cidade || '',
          uf: r.uf || '',
          checkin: ci,
          checkout: co,
          status: r.status_hospedagem || r.status_solicitacao || '',
          fonte: 'reserva',
          prod,
          semProd: prod.length > 0 && prod.every(p => !p.ok)
        });
      });
    });

    activeHist.forEach(r => {
      const d = r.data || '';
      const prod = d ? [{ d, ok: prodSet.has(`${normalizeStr(r.colaborador)}__${d}`) }] : [];
      rows.push({
        colaborador: r.colaborador || '-',
        regional: r.regional || '-',
        hotel: r.hotel || '-',
        cidade: r.cidade || '',
        uf: r.uf || '',
        checkin: d,
        checkout: '',
        status: r.status_hospedagem || r.status_planilha || '',
        fonte: 'historico',
        prod,
        semProd: prod.length > 0 && prod.every(p => !p.ok)
      });
    });

    // Sem produção primeiro, depois alfabético
    rows.sort((a, b) => {
      if (a.semProd !== b.semProd) return b.semProd ? 1 : -1;
      return a.colaborador.localeCompare(b.colaborador, 'pt-BR');
    });

    lastRows = rows;
    render(rows, de, ate);
  }

  function render(rows, de, ate) {
    const msg = document.getElementById('hrMsg');
    const summaryEl = document.getElementById('hrSummary');
    const out = document.getElementById('hrOut');
    const exportBtn = document.getElementById('hrExportar');

    msg.textContent = '';

    if (!rows.length) {
      msg.textContent = 'Nenhuma hospedagem ativa no período selecionado.';
      return;
    }

    const semProd = rows.filter(r => r.semProd).length;
    const isRange = de !== ate;

    summaryEl.style.display = 'flex';
    summaryEl.innerHTML = `
      <div class="hr-kpi">${rows.length}<small>hospedados</small></div>
      <div class="hr-kpi" style="color:#bbf7d0">${rows.length - semProd}<small>com produção</small></div>
      <div class="hr-kpi" style="color:#fca5a5">${semProd}<small>sem produção</small></div>
    `;
    exportBtn.style.display = '';

    out.innerHTML = `
      <div class="hr-wrap">
        <table class="hr-tbl">
          <thead><tr>
            <th>Colaborador</th>
            <th>Regional</th>
            <th>Hotel / Local</th>
            <th>Cidade / UF</th>
            <th>Check-in</th>
            <th>Check-out</th>
            <th>Status</th>
            <th>Produção${isRange ? ' (período)' : ''}</th>
          </tr></thead>
          <tbody>${rows.map(r => {
            const allOk = r.prod.every(p => p.ok);
            const noneOk = r.prod.length > 0 && r.prod.every(p => !p.ok);
            const partial = r.prod.length > 0 && !allOk && !noneOk;

            let prodCell;
            if (!r.prod.length) prodCell = '<span class="hbadge warn">Sem datas</span>';
            else if (allOk) prodCell = `<span class="hbadge ok">Sim${isRange ? ` (${r.prod.length}d)` : ''}</span>`;
            else if (noneOk) prodCell = '<span class="hbadge err">Não encontrada</span>';
            else { const c = r.prod.filter(p => p.ok).length; prodCell = `<span class="hbadge warn">${c}/${r.prod.length} dias</span>`; }

            return `<tr class="${r.semProd ? 'no-prod' : ''}">
              <td><strong>${esc(r.colaborador)}</strong><span class="hr-fonte">${r.fonte === 'historico' ? 'histórico' : 'reserva'}</span></td>
              <td class="hr-muted">${esc(r.regional)}</td>
              <td>${esc(r.hotel)}</td>
              <td class="hr-muted">${esc([r.cidade, r.uf].filter(Boolean).join(' / '))}</td>
              <td class="hr-muted">${brDate(r.checkin)}</td>
              <td class="hr-muted">${r.checkout ? brDate(r.checkout) : '—'}</td>
              <td>${statusBadge(r.status)}</td>
              <td>${prodCell}</td>
            </tr>`;
          }).join('')}</tbody>
        </table>
      </div>
    `;
  }

  function exportCSV() {
    if (!lastRows.length) return;
    const hdr = ['Colaborador','Regional','Hotel','Cidade','UF','Check-in','Check-out','Status','Produção'];
    const lines = [hdr.join(';')];
    lastRows.forEach(r => {
      const p = r.prod.every(p => p.ok) ? 'Sim' : r.prod.some(p => p.ok) ? 'Parcial' : 'Não';
      lines.push([r.colaborador, r.regional, r.hotel, r.cidade, r.uf, r.checkin, r.checkout, r.status, p]
        .map(v => `"${String(v||'').replaceAll('"','""')}"`).join(';'));
    });
    const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement('a'), {
      href: url,
      download: `hospedagem-${document.getElementById('hrDe').value || today}.csv`
    });
    a.click();
    URL.revokeObjectURL(url);
  }

  document.getElementById('hrBuscar').addEventListener('click', loadReport);
  document.getElementById('hrExportar').addEventListener('click', exportCSV);

  loadReport();
});
