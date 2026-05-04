import { supabase } from './supabaseClient.js';

(function () {
  'use strict';

  const styleId = 'operacional-module-styles';
  const PONTOS_TABLE = 'operacional_pontos_embarque';

  const demoRows = [
    { nome: 'Carlos Henrique', tipo: 'Efetivo', cidade: 'Cascavel/PR', distanciaKm: 42, hotel: 'Hotel Centro Operacional', diariaHotel: 165, passagem: 0, maoObra: 0, auditoria: 94, volume: 38, score: 96, status: 'Recomendado' },
    { nome: 'João Batista', tipo: 'Diarista', cidade: 'Toledo/PR', distanciaKm: 91, hotel: 'Hotel Centro Operacional', diariaHotel: 165, passagem: 84, maoObra: 180, auditoria: 88, volume: 38, score: 83, status: 'Bom custo' },
    { nome: 'Marcos Lima', tipo: 'Efetivo', cidade: 'Maringá/PR', distanciaKm: 274, hotel: 'Hotel Avenida', diariaHotel: 190, passagem: 132, maoObra: 0, auditoria: 91, volume: 38, score: 72, status: 'Intermediário' },
    { nome: 'Paulo Roberto', tipo: 'Diarista', cidade: 'Londrina/PR', distanciaKm: 381, hotel: 'Hotel Avenida', diariaHotel: 190, passagem: 210, maoObra: 180, auditoria: 79, volume: 38, score: 58, status: 'Alto custo' }
  ];

  let pontosCache = [];

  function text(value) {
    if (value === null || value === undefined) return '';
    return String(value).trim();
  }

  function money(value) {
    return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  function totalCost(row) {
    return Number(row.diariaHotel || 0) + Number(row.passagem || 0) + Number(row.maoObra || 0);
  }

  function pillClass(score) {
    if (score >= 85) return 'ok';
    if (score >= 70) return 'warn';
    return 'bad';
  }

  function escapeHtml(value) {
    return text(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function ensureStyles() {
    if (document.getElementById(styleId)) return;
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      .op-shell{display:flex;flex-direction:column;gap:18px;color:#e5e7eb}
      .op-hero{position:relative;overflow:hidden;border:1px solid rgba(34,197,94,.18);background:linear-gradient(135deg,rgba(6,78,59,.45),rgba(2,6,23,.82));border-radius:24px;padding:22px;box-shadow:0 24px 80px rgba(0,0,0,.22)}
      .op-hero:after{content:"";position:absolute;inset:auto -15% -60% 45%;height:260px;background:radial-gradient(circle,rgba(34,197,94,.22),transparent 62%);pointer-events:none}
      .op-kicker{display:inline-flex;align-items:center;gap:8px;padding:6px 10px;border-radius:999px;border:1px solid rgba(74,222,128,.22);background:rgba(22,101,52,.18);font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#bbf7d0}
      .op-hero h2{margin:14px 0 8px;font-size:clamp(25px,3vw,38px);line-height:1.05;color:#f8fafc}
      .op-hero p{margin:0;max-width:920px;color:#cbd5e1;line-height:1.6}
      .op-actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:16px;align-items:center}
      .op-btn{border:1px solid rgba(74,222,128,.22);background:rgba(15,23,42,.75);color:#e5e7eb;border-radius:14px;padding:11px 14px;font-weight:900;cursor:pointer;box-shadow:0 12px 28px rgba(0,0,0,.18)}
      .op-btn:hover{border-color:rgba(34,197,94,.52);color:#f0fdf4}
      .op-filters{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:12px;margin-top:18px}
      .op-field{display:flex;flex-direction:column;gap:7px}
      .op-field label{font-size:12px;color:#94a3b8;font-weight:800;text-transform:uppercase;letter-spacing:.06em}
      .op-field input,.op-field select{width:100%;box-sizing:border-box;border:1px solid rgba(51,65,85,.9);border-radius:14px;background:#0f172a;color:#e5e7eb;padding:11px 12px;outline:none;color-scheme:dark}
      .op-field select option{background:#0f172a;color:#e5e7eb}
      .op-field input:focus,.op-field select:focus{border-color:#22c55e;box-shadow:0 0 0 3px rgba(34,197,94,.14)}
      .op-grid{display:grid;grid-template-columns:minmax(0,1.35fr) minmax(360px,.65fr);gap:18px;align-items:stretch}
      .op-card{border:1px solid rgba(51,65,85,.7);border-radius:24px;background:linear-gradient(180deg,rgba(15,23,42,.92),rgba(2,6,23,.76));box-shadow:0 18px 50px rgba(0,0,0,.2);overflow:hidden}
      .op-card-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:18px 18px 0}
      .op-card-head h3{margin:0;color:#f8fafc;font-size:18px}.op-card-head p{margin:5px 0 0;color:#94a3b8;font-size:13px}
      .op-map{position:relative;height:520px;margin:18px;border-radius:22px;overflow:hidden;border:1px solid rgba(51,65,85,.7);background:#052e24}
      .op-map:before{content:"";position:absolute;inset:0;background:linear-gradient(90deg,rgba(148,163,184,.08) 1px,transparent 1px),linear-gradient(0deg,rgba(148,163,184,.08) 1px,transparent 1px),radial-gradient(circle at 68% 38%,rgba(34,197,94,.18),transparent 26%),radial-gradient(circle at 35% 72%,rgba(16,185,129,.16),transparent 24%);background-size:58px 58px,58px 58px,auto,auto;opacity:.92}
      .op-route{position:absolute;height:3px;background:linear-gradient(90deg,rgba(34,197,94,.12),rgba(74,222,128,.9),rgba(34,197,94,.12));transform-origin:left center;border-radius:999px;filter:drop-shadow(0 0 10px rgba(34,197,94,.45))}
      .op-pin{position:absolute;transform:translate(-50%,-50%);display:flex;align-items:center;gap:8px;z-index:2;white-space:nowrap}.op-dot{width:17px;height:17px;border-radius:999px;border:3px solid #052e16;background:#22c55e;box-shadow:0 0 0 7px rgba(34,197,94,.18),0 0 25px rgba(34,197,94,.7)}
      .op-dot.hotel{background:#38bdf8;box-shadow:0 0 0 7px rgba(56,189,248,.15),0 0 25px rgba(56,189,248,.5)}.op-dot.worker{background:#fbbf24;box-shadow:0 0 0 7px rgba(251,191,36,.14),0 0 25px rgba(251,191,36,.45)}
      .op-label{padding:7px 10px;border-radius:999px;background:rgba(2,6,23,.72);border:1px solid rgba(148,163,184,.18);backdrop-filter:blur(8px);font-size:12px;color:#f8fafc}
      .op-ranking{display:flex;flex-direction:column;gap:12px;padding:18px}.op-rank-item{display:grid;grid-template-columns:auto 1fr auto;gap:12px;align-items:center;border:1px solid rgba(51,65,85,.7);background:rgba(15,23,42,.72);border-radius:18px;padding:13px}
      .op-rank-pos{width:34px;height:34px;display:flex;align-items:center;justify-content:center;border-radius:12px;background:rgba(22,101,52,.75);color:#dcfce7;font-weight:900}.op-rank-main strong{display:block;color:#f8fafc}.op-rank-main span{display:block;margin-top:3px;font-size:12px;color:#94a3b8}.op-score{text-align:right}.op-score strong{display:block;font-size:20px;color:#bbf7d0}.op-score span{font-size:11px;color:#94a3b8;text-transform:uppercase;font-weight:800}
      .op-table-wrap{overflow:auto;padding:0 18px 18px}.op-table{width:100%;border-collapse:separate;border-spacing:0 10px;min-width:960px}.op-table th{text-align:left;font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:.07em;padding:0 12px 2px}.op-table td{background:rgba(15,23,42,.78);border-top:1px solid rgba(51,65,85,.7);border-bottom:1px solid rgba(51,65,85,.7);padding:13px 12px;color:#e5e7eb}.op-table td:first-child{border-left:1px solid rgba(51,65,85,.7);border-radius:14px 0 0 14px;font-weight:800;color:#f8fafc}.op-table td:last-child{border-right:1px solid rgba(51,65,85,.7);border-radius:0 14px 14px 0}
      .op-pill{display:inline-flex;align-items:center;border-radius:999px;padding:5px 9px;font-size:12px;font-weight:800;border:1px solid rgba(148,163,184,.18);background:rgba(15,23,42,.7)}.op-pill.ok{color:#bbf7d0;background:rgba(22,101,52,.22)}.op-pill.warn{color:#fde68a;background:rgba(120,53,15,.22)}.op-pill.bad{color:#fecaca;background:rgba(127,29,29,.22)}
      .op-summary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}.op-metric{border:1px solid rgba(51,65,85,.7);border-radius:20px;background:rgba(15,23,42,.72);padding:16px}.op-metric span{font-size:12px;color:#94a3b8;text-transform:uppercase;font-weight:900;letter-spacing:.06em}.op-metric strong{display:block;margin-top:8px;font-size:24px;color:#f8fafc}.op-metric small{display:block;margin-top:4px;color:#94a3b8}
      .op-import-status{margin-top:12px;padding:12px 14px;border-radius:16px;background:rgba(15,23,42,.72);border:1px solid rgba(51,65,85,.7);color:#cbd5e1;font-size:13px}.op-import-status.ok{border-color:rgba(34,197,94,.35);color:#bbf7d0}.op-import-status.bad{border-color:rgba(248,113,113,.35);color:#fecaca}.op-import-status.warn{border-color:rgba(251,191,36,.35);color:#fde68a}
      .op-mini-list{display:grid;gap:10px;padding:18px}.op-mini-item{border:1px solid rgba(51,65,85,.7);border-radius:16px;background:rgba(15,23,42,.72);padding:12px}.op-mini-item strong{display:block;color:#f8fafc}.op-mini-item span{display:block;margin-top:4px;color:#94a3b8;font-size:12px}
      @media(max-width:1100px){.op-grid{grid-template-columns:1fr}.op-filters{grid-template-columns:repeat(2,minmax(0,1fr))}.op-summary{grid-template-columns:repeat(2,minmax(0,1fr))}}
      @media(max-width:720px){.op-filters,.op-summary{grid-template-columns:1fr}.op-map{height:420px;margin:12px}.op-card-head{padding:14px 14px 0}.op-mini-list,.op-ranking{padding:14px}}
    `;
    document.head.appendChild(style);
  }

  async function loadPontos() {
    const { data, error } = await supabase
      .from(PONTOS_TABLE)
      .select('id,tipo_local,nome_local,uf,cidade,latitude,longitude,supervisao,coordenacao')
      .eq('ativo', true)
      .order('uf', { ascending: true })
      .order('cidade', { ascending: true })
      .limit(1200);

    if (error) throw error;
    pontosCache = Array.isArray(data) ? data : [];
    return pontosCache;
  }

  function renderRoutes() {
    const pontos = pontosCache.slice(0, 7);
    if (!pontos.length) {
      return `
        <div class="op-route" style="left:18%;top:67%;width:59%;transform:rotate(-25deg)"></div>
        <div class="op-route" style="left:57%;top:40%;width:19%;transform:rotate(38deg);opacity:.55"></div>
        <div class="op-route" style="left:40%;top:55%;width:22%;transform:rotate(14deg);opacity:.45"></div>
        <div class="op-pin" style="left:15%;top:68%"><span class="op-dot worker"></span><span class="op-label">Carlos · 42 km</span></div>
        <div class="op-pin" style="left:31%;top:62%"><span class="op-dot worker"></span><span class="op-label">João · 91 km</span></div>
        <div class="op-pin" style="left:50%;top:48%"><span class="op-dot hotel"></span><span class="op-label">Hotel sugerido</span></div>
        <div class="op-pin" style="left:68%;top:36%"><span class="op-dot"></span><span class="op-label">Embarque</span></div>
      `;
    }

    return pontos.map((ponto, index) => {
      const x = 12 + ((index * 13) % 74);
      const y = 20 + ((index * 17) % 58);
      return `
        <div class="op-pin" style="left:${x}%;top:${y}%">
          <span class="op-dot ${index === 0 ? '' : 'worker'}"></span>
          <span class="op-label">${escapeHtml(ponto.nome_local)} · ${escapeHtml(ponto.cidade)}/${escapeHtml(ponto.uf)}</span>
        </div>
      `;
    }).join('');
  }

  function renderRows(rows) {
    return rows.map((row) => {
      const scoreClass = pillClass(row.score);
      return `<tr>
        <td>${escapeHtml(row.nome)}</td><td>${escapeHtml(row.tipo)}</td><td>${escapeHtml(row.cidade)}</td><td>${row.distanciaKm} km</td>
        <td>${escapeHtml(row.hotel)}</td><td>${money(row.diariaHotel)}</td><td>${money(row.passagem)}</td><td>${money(row.maoObra)}</td><td>${money(totalCost(row))}</td>
        <td>${row.auditoria}%</td><td><span class="op-pill ${scoreClass}">${row.score}</span></td><td><span class="op-pill ${scoreClass}">${escapeHtml(row.status)}</span></td>
      </tr>`;
    }).join('');
  }

  function renderRanking(rows) {
    return rows.slice(0, 4).map((row, index) => `
      <div class="op-rank-item">
        <div class="op-rank-pos">${index + 1}</div>
        <div class="op-rank-main"><strong>${escapeHtml(row.nome)}</strong><span>${escapeHtml(row.tipo)} · ${row.distanciaKm} km · ${money(totalCost(row))}</span></div>
        <div class="op-score"><strong>${row.score}</strong><span>score</span></div>
      </div>`).join('');
  }

  function renderPontosList(pontos) {
    if (!pontos.length) {
      return `<div class="op-mini-item"><strong>Nenhum ponto importado ainda</strong><span>Importe a planilha Mapa G1000 pela Central de Importação de Relatórios.</span></div>`;
    }
    return pontos.slice(0, 10).map((ponto) => `
      <div class="op-mini-item">
        <strong>${escapeHtml(ponto.nome_local)}</strong>
        <span>${escapeHtml(ponto.tipo_local || 'Ponto')} · ${escapeHtml(ponto.cidade)}/${escapeHtml(ponto.uf)} · ${escapeHtml(ponto.supervisao || '-')}</span>
      </div>
    `).join('');
  }

  function setStatus(message, type = '') {
    const el = document.getElementById('opImportStatus');
    if (!el) return;
    el.className = `op-import-status ${type}`.trim();
    el.textContent = message;
  }

  function updatePontosUI() {
    const total = pontosCache.length;
    const cidades = new Set(pontosCache.map((p) => `${p.cidade}/${p.uf}`)).size;
    const supervisoes = new Set(pontosCache.map((p) => p.supervisao).filter(Boolean)).size;

    const totalEl = document.getElementById('opTotalPontos');
    const cidadesEl = document.getElementById('opTotalCidades');
    const supEl = document.getElementById('opTotalSupervisoes');
    const listEl = document.getElementById('opPontosList');
    const mapEl = document.getElementById('opMap');

    if (totalEl) totalEl.textContent = String(total || '—');
    if (cidadesEl) cidadesEl.textContent = String(cidades || '—');
    if (supEl) supEl.textContent = String(supervisoes || '—');
    if (listEl) listEl.innerHTML = renderPontosList(pontosCache);
    if (mapEl) mapEl.innerHTML = renderRoutes();
  }

  function bindEvents() {
    document.getElementById('opRefreshPontosBtn')?.addEventListener('click', async () => {
      try {
        setStatus('Atualizando pontos cadastrados...', 'warn');
        await loadPontos();
        updatePontosUI();
        setStatus('Pontos atualizados com sucesso.', 'ok');
      } catch (error) {
        console.error('[Operacional] Erro ao atualizar pontos:', error);
        setStatus(`Não foi possível carregar os pontos. Rode o SQL 002 no Supabase. Detalhe: ${error.message || error}`, 'bad');
      }
    });
  }

  async function openHome(container) {
    ensureStyles();
    const rows = demoRows.slice().sort((a, b) => b.score - a.score);
    const best = rows[0];

    container.innerHTML = `
      <div class="op-shell">
        <section class="op-hero">
          <span class="op-kicker">Operacional · Mapa de Direcionamento</span>
          <h2>Escolha de equipe por custo-benefício</h2>
          <p>Compare distância da base do colaborador, hotel mais próximo, passagem, mão de obra, volume do embarque, histórico de auditoria e pontos de embarque importados pela Central de Relatórios.</p>
          <div class="op-actions">
            <button class="op-btn" id="opRefreshPontosBtn" type="button">Atualizar pontos</button>
          </div>
          <div class="op-import-status" id="opImportStatus">Os pontos de embarque são importados pelo menu Relatórios → Importar Relatórios. Arquivo esperado: Mapa G1000.xlsx.</div>
          <div class="op-filters">
            <div class="op-field"><label>Data do embarque</label><input type="date" /></div>
            <div class="op-field"><label>Regional</label><select><option>Todas</option><option>CASCAVEL - Geral</option><option>GOIAS 1 - Rio Verde</option><option>MATO GROSSO MT1 - Sinop</option></select></div>
            <div class="op-field"><label>Cidade do embarque</label><input placeholder="Ex.: Cascavel" /></div>
            <div class="op-field"><label>Volume</label><input type="number" placeholder="Toneladas" /></div>
            <div class="op-field"><label>Tipo de equipe</label><select><option>Todos</option><option>Efetivo</option><option>Diarista</option></select></div>
          </div>
        </section>

        <section class="op-summary">
          <div class="op-metric"><span>Melhor indicação</span><strong>${escapeHtml(best.nome)}</strong><small>Simulação inicial</small></div>
          <div class="op-metric"><span>Pontos importados</span><strong id="opTotalPontos">—</strong><small>Base de embarque</small></div>
          <div class="op-metric"><span>Cidades atendidas</span><strong id="opTotalCidades">—</strong><small>cidade/UF únicos</small></div>
          <div class="op-metric"><span>Supervisões</span><strong id="opTotalSupervisoes">—</strong><small>com pontos ativos</small></div>
        </section>

        <section class="op-grid">
          <article class="op-card">
            <div class="op-card-head"><div><h3>Mapa operacional</h3><p>Visão dos pontos de embarque cadastrados. Depois evoluímos para rotas reais.</p></div></div>
            <div class="op-map" id="opMap">${renderRoutes()}</div>
          </article>
          <article class="op-card">
            <div class="op-card-head"><div><h3>Pontos de embarque</h3><p>Últimos pontos carregados da base operacional.</p></div></div>
            <div class="op-mini-list" id="opPontosList">${renderPontosList([])}</div>
          </article>
        </section>

        <section class="op-grid">
          <article class="op-card">
            <div class="op-card-head"><div><h3>Ranking recomendado</h3><p>Ordenado pelo score operacional.</p></div></div>
            <div class="op-ranking">${renderRanking(rows)}</div>
          </article>
          <article class="op-card">
            <div class="op-card-head"><div><h3>Próxima etapa</h3><p>Com os pontos importados, o próximo passo é cruzar colaborador + hotel + embarque.</p></div></div>
            <div class="op-mini-list">
              <div class="op-mini-item"><strong>1. Pontos de embarque</strong><span>Importação via Relatórios → Importar Relatórios.</span></div>
              <div class="op-mini-item"><strong>2. Base de colaboradores</strong><span>Usar cidade/base, tipo de mão de obra e custo.</span></div>
              <div class="op-mini-item"><strong>3. Hotéis e passagens</strong><span>Calcular custo total por operação.</span></div>
            </div>
          </article>
        </section>

        <article class="op-card">
          <div class="op-card-head"><div><h3>Análise detalhada</h3><p>Comparação de custos e critérios para decisão.</p></div></div>
          <div class="op-table-wrap">
            <table class="op-table">
              <thead><tr><th>Colaborador</th><th>Tipo</th><th>Base</th><th>Distância</th><th>Hotel</th><th>Hotel</th><th>Passagem</th><th>Mão de obra</th><th>Total</th><th>Auditoria</th><th>Score</th><th>Status</th></tr></thead>
              <tbody>${renderRows(rows)}</tbody>
            </table>
          </div>
        </article>
      </div>
    `;

    bindEvents();

    try {
      await loadPontos();
      updatePontosUI();
      if (pontosCache.length) setStatus(`Base carregada: ${pontosCache.length} pontos ativos encontrados.`, 'ok');
    } catch (error) {
      console.warn('[Operacional] Tabela de pontos ainda não disponível:', error);
      setStatus('Para ativar os pontos do mapa, execute o SQL 002 no Supabase. A tela continua funcionando em modo visual.', 'warn');
    }
  }

  window.OPERACIONAL = { openHome };
})();
