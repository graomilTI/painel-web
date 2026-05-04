(function () {
  'use strict';

  const styleId = 'operacional-module-styles';

  const demoRows = [
    {
      nome: 'Carlos Henrique',
      tipo: 'Efetivo',
      cidade: 'Cascavel/PR',
      distanciaKm: 42,
      hotel: 'Hotel Centro Operacional',
      diariaHotel: 165,
      passagem: 0,
      maoObra: 0,
      auditoria: 94,
      volume: 38,
      score: 96,
      status: 'Recomendado'
    },
    {
      nome: 'João Batista',
      tipo: 'Diarista',
      cidade: 'Toledo/PR',
      distanciaKm: 91,
      hotel: 'Hotel Centro Operacional',
      diariaHotel: 165,
      passagem: 84,
      maoObra: 180,
      auditoria: 88,
      volume: 38,
      score: 83,
      status: 'Bom custo'
    },
    {
      nome: 'Marcos Lima',
      tipo: 'Efetivo',
      cidade: 'Maringá/PR',
      distanciaKm: 274,
      hotel: 'Hotel Avenida',
      diariaHotel: 190,
      passagem: 132,
      maoObra: 0,
      auditoria: 91,
      volume: 38,
      score: 72,
      status: 'Intermediário'
    },
    {
      nome: 'Paulo Roberto',
      tipo: 'Diarista',
      cidade: 'Londrina/PR',
      distanciaKm: 381,
      hotel: 'Hotel Avenida',
      diariaHotel: 190,
      passagem: 210,
      maoObra: 180,
      auditoria: 79,
      volume: 38,
      score: 58,
      status: 'Alto custo'
    }
  ];

  function money(value) {
    return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
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
      .op-hero p{margin:0;max-width:880px;color:#cbd5e1;line-height:1.6}
      .op-filters{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:12px;margin-top:18px}
      .op-field{display:flex;flex-direction:column;gap:7px}
      .op-field label{font-size:12px;color:#94a3b8;font-weight:800;text-transform:uppercase;letter-spacing:.06em}
      .op-field input,.op-field select{width:100%;box-sizing:border-box;border:1px solid rgba(51,65,85,.9);border-radius:14px;background:#0f172a;color:#e5e7eb;padding:11px 12px;outline:none;color-scheme:dark}
      .op-field select option{background:#0f172a;color:#e5e7eb}
      .op-field input:focus,.op-field select:focus{border-color:#22c55e;box-shadow:0 0 0 3px rgba(34,197,94,.14)}
      .op-grid{display:grid;grid-template-columns:minmax(0,1.35fr) minmax(360px,.65fr);gap:18px;align-items:stretch}
      .op-card{border:1px solid rgba(51,65,85,.7);border-radius:24px;background:linear-gradient(180deg,rgba(15,23,42,.92),rgba(2,6,23,.76));box-shadow:0 18px 50px rgba(0,0,0,.2);overflow:hidden}
      .op-card-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:18px 18px 0}
      .op-card-head h3{margin:0;color:#f8fafc;font-size:18px}
      .op-card-head p{margin:5px 0 0;color:#94a3b8;font-size:13px}
      .op-map{position:relative;height:520px;margin:18px;border-radius:22px;overflow:hidden;border:1px solid rgba(51,65,85,.7);background:#052e24}
      .op-map:before{content:"";position:absolute;inset:0;background:linear-gradient(90deg,rgba(148,163,184,.08) 1px,transparent 1px),linear-gradient(0deg,rgba(148,163,184,.08) 1px,transparent 1px),radial-gradient(circle at 68% 38%,rgba(34,197,94,.18),transparent 26%),radial-gradient(circle at 35% 72%,rgba(16,185,129,.16),transparent 24%);background-size:58px 58px,58px 58px,auto,auto;opacity:.92}
      .op-route{position:absolute;height:3px;background:linear-gradient(90deg,rgba(34,197,94,.12),rgba(74,222,128,.9),rgba(34,197,94,.12));transform-origin:left center;border-radius:999px;filter:drop-shadow(0 0 10px rgba(34,197,94,.45))}
      .op-pin{position:absolute;transform:translate(-50%,-50%);display:flex;align-items:center;gap:8px;z-index:2;white-space:nowrap}
      .op-dot{width:17px;height:17px;border-radius:999px;border:3px solid #052e16;background:#22c55e;box-shadow:0 0 0 7px rgba(34,197,94,.18),0 0 25px rgba(34,197,94,.7)}
      .op-dot.hotel{background:#38bdf8;box-shadow:0 0 0 7px rgba(56,189,248,.15),0 0 25px rgba(56,189,248,.5)}
      .op-dot.worker{background:#fbbf24;box-shadow:0 0 0 7px rgba(251,191,36,.14),0 0 25px rgba(251,191,36,.45)}
      .op-label{padding:7px 10px;border-radius:999px;background:rgba(2,6,23,.72);border:1px solid rgba(148,163,184,.18);backdrop-filter:blur(8px);font-size:12px;color:#f8fafc}
      .op-ranking{display:flex;flex-direction:column;gap:12px;padding:18px}
      .op-rank-item{display:grid;grid-template-columns:auto 1fr auto;gap:12px;align-items:center;border:1px solid rgba(51,65,85,.7);background:rgba(15,23,42,.72);border-radius:18px;padding:13px}
      .op-rank-pos{width:34px;height:34px;display:flex;align-items:center;justify-content:center;border-radius:12px;background:rgba(22,101,52,.75);color:#dcfce7;font-weight:900}
      .op-rank-main strong{display:block;color:#f8fafc}
      .op-rank-main span{display:block;margin-top:3px;font-size:12px;color:#94a3b8}
      .op-score{text-align:right}
      .op-score strong{display:block;font-size:20px;color:#bbf7d0}
      .op-score span{font-size:11px;color:#94a3b8;text-transform:uppercase;font-weight:800}
      .op-table-wrap{overflow:auto;padding:0 18px 18px}
      .op-table{width:100%;border-collapse:separate;border-spacing:0 10px;min-width:960px}
      .op-table th{text-align:left;font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:.07em;padding:0 12px 2px}
      .op-table td{background:rgba(15,23,42,.78);border-top:1px solid rgba(51,65,85,.7);border-bottom:1px solid rgba(51,65,85,.7);padding:13px 12px;color:#e5e7eb}
      .op-table td:first-child{border-left:1px solid rgba(51,65,85,.7);border-radius:14px 0 0 14px;font-weight:800;color:#f8fafc}
      .op-table td:last-child{border-right:1px solid rgba(51,65,85,.7);border-radius:0 14px 14px 0}
      .op-pill{display:inline-flex;align-items:center;border-radius:999px;padding:5px 9px;font-size:12px;font-weight:800;border:1px solid rgba(148,163,184,.18);background:rgba(15,23,42,.7)}
      .op-pill.ok{color:#bbf7d0;background:rgba(22,101,52,.22)}
      .op-pill.warn{color:#fde68a;background:rgba(120,53,15,.22)}
      .op-pill.bad{color:#fecaca;background:rgba(127,29,29,.22)}
      .op-summary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}
      .op-metric{border:1px solid rgba(51,65,85,.7);border-radius:20px;background:rgba(15,23,42,.72);padding:16px}
      .op-metric span{font-size:12px;color:#94a3b8;text-transform:uppercase;font-weight:900;letter-spacing:.06em}
      .op-metric strong{display:block;margin-top:8px;font-size:24px;color:#f8fafc}
      @media(max-width:1100px){.op-grid{grid-template-columns:1fr}.op-filters{grid-template-columns:repeat(2,minmax(0,1fr))}.op-summary{grid-template-columns:repeat(2,minmax(0,1fr))}}
      @media(max-width:680px){.op-filters,.op-summary{grid-template-columns:1fr}.op-map{height:420px;margin:12px}.op-card-head{padding:14px 14px 0}.op-ranking{padding:14px}.op-table-wrap{padding:0 14px 14px}}
    `;
    document.head.appendChild(style);
  }

  function totalCost(row) {
    return Number(row.diariaHotel || 0) + Number(row.passagem || 0) + Number(row.maoObra || 0);
  }

  function pillClass(score) {
    if (score >= 85) return 'ok';
    if (score >= 70) return 'warn';
    return 'bad';
  }

  function renderRoutes() {
    return `
      <div class="op-route" style="left:18%;top:68%;width:54%;transform:rotate(-23deg);"></div>
      <div class="op-route" style="left:39%;top:47%;width:22%;transform:rotate(14deg);"></div>
      <div class="op-route" style="left:58%;top:39%;width:22%;transform:rotate(35deg);"></div>
      <div class="op-pin" style="left:72%;top:36%;"><span class="op-dot"></span><span class="op-label">Embarque</span></div>
      <div class="op-pin" style="left:55%;top:48%;"><span class="op-dot hotel"></span><span class="op-label">Hotel sugerido</span></div>
      <div class="op-pin" style="left:18%;top:68%;"><span class="op-dot worker"></span><span class="op-label">Carlos · 42 km</span></div>
      <div class="op-pin" style="left:34%;top:62%;"><span class="op-dot worker"></span><span class="op-label">João · 91 km</span></div>
      <div class="op-pin" style="left:26%;top:28%;"><span class="op-dot worker"></span><span class="op-label">Marcos · 274 km</span></div>
    `;
  }

  function renderRows(rows) {
    return rows.map((row, index) => {
      const scoreClass = pillClass(row.score);
      return `
        <tr>
          <td>${row.nome}</td>
          <td>${row.tipo}</td>
          <td>${row.cidade}</td>
          <td>${row.distanciaKm} km</td>
          <td>${row.hotel}</td>
          <td>${money(row.diariaHotel)}</td>
          <td>${money(row.passagem)}</td>
          <td>${money(row.maoObra)}</td>
          <td>${money(totalCost(row))}</td>
          <td>${row.auditoria}%</td>
          <td><span class="op-pill ${scoreClass}">${row.score}</span></td>
          <td><span class="op-pill ${scoreClass}">${row.status}</span></td>
        </tr>
      `;
    }).join('');
  }

  function renderRanking(rows) {
    return rows.slice(0, 4).map((row, index) => `
      <div class="op-rank-item">
        <div class="op-rank-pos">${index + 1}</div>
        <div class="op-rank-main">
          <strong>${row.nome}</strong>
          <span>${row.tipo} · ${row.distanciaKm} km · ${money(totalCost(row))}</span>
        </div>
        <div class="op-score">
          <strong>${row.score}</strong>
          <span>score</span>
        </div>
      </div>
    `).join('');
  }

  function openHome(container, opts = {}) {
    ensureStyles();
    const rows = demoRows.slice().sort((a, b) => b.score - a.score);
    const best = rows[0];
    const avgCost = rows.reduce((sum, row) => sum + totalCost(row), 0) / rows.length;

    container.innerHTML = `
      <div class="op-shell">
        <section class="op-hero">
          <span class="op-kicker">Operacional · Mapa de Direcionamento</span>
          <h2>Escolha de equipe por custo-benefício</h2>
          <p>Simulação visual para comparar distância da base do colaborador, hotel mais próximo, passagem, mão de obra, volume do embarque e histórico de auditoria antes de direcionar a operação.</p>

          <div class="op-filters">
            <div class="op-field">
              <label>Data do embarque</label>
              <input type="date" />
            </div>
            <div class="op-field">
              <label>Regional</label>
              <select><option>Todas</option><option>CASCAVEL - Geral</option><option>GOIAS 1 - Rio Verde</option><option>MATO GROSSO MT1 - Sinop</option></select>
            </div>
            <div class="op-field">
              <label>Cidade do embarque</label>
              <input placeholder="Ex.: Cascavel" />
            </div>
            <div class="op-field">
              <label>Volume</label>
              <input type="number" placeholder="Toneladas" />
            </div>
            <div class="op-field">
              <label>Tipo de equipe</label>
              <select><option>Todos</option><option>Efetivo</option><option>Diarista</option></select>
            </div>
          </div>
        </section>

        <section class="op-summary">
          <div class="op-metric"><span>Melhor indicação</span><strong>${best.nome}</strong></div>
          <div class="op-metric"><span>Custo médio</span><strong>${money(avgCost)}</strong></div>
          <div class="op-metric"><span>Menor distância</span><strong>${Math.min(...rows.map(r => r.distanciaKm))} km</strong></div>
          <div class="op-metric"><span>Maior auditoria</span><strong>${Math.max(...rows.map(r => r.auditoria))}%</strong></div>
        </section>

        <section class="op-grid">
          <article class="op-card">
            <div class="op-card-head">
              <div>
                <h3>Mapa operacional</h3>
                <p>Visão simulada de colaboradores, hotel sugerido e ponto de embarque.</p>
              </div>
            </div>
            <div class="op-map">${renderRoutes()}</div>
          </article>

          <article class="op-card">
            <div class="op-card-head">
              <div>
                <h3>Ranking recomendado</h3>
                <p>Ordenado pelo score operacional.</p>
              </div>
            </div>
            <div class="op-ranking">${renderRanking(rows)}</div>
          </article>
        </section>

        <article class="op-card">
          <div class="op-card-head">
            <div>
              <h3>Análise detalhada</h3>
              <p>Comparação de custos e critérios para decisão.</p>
            </div>
          </div>
          <div class="op-table-wrap">
            <table class="op-table">
              <thead>
                <tr>
                  <th>Colaborador</th><th>Tipo</th><th>Base</th><th>Distância</th><th>Hotel</th><th>Hotel</th><th>Passagem</th><th>Mão de obra</th><th>Total</th><th>Auditoria</th><th>Score</th><th>Status</th>
                </tr>
              </thead>
              <tbody>${renderRows(rows)}</tbody>
            </table>
          </div>
        </article>
      </div>
    `;
  }

  window.OPERACIONAL = {
    openHome
  };
})();
