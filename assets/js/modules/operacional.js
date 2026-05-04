import { supabase } from '../supabaseClient.js';

(function () {
  const SAMPLE_EMBARQUES = [
    { id: 'demo-001', cliente: 'Embarque Cascavel', cidade: 'Cascavel', uf: 'PR', volume_ton: 820, data_embarque: new Date().toISOString().slice(0, 10) },
    { id: 'demo-002', cliente: 'Embarque Rio Verde', cidade: 'Rio Verde', uf: 'GO', volume_ton: 1240, data_embarque: new Date().toISOString().slice(0, 10) },
    { id: 'demo-003', cliente: 'Embarque Sinop', cidade: 'Sinop', uf: 'MT', volume_ton: 960, data_embarque: new Date().toISOString().slice(0, 10) }
  ];

  const SAMPLE_RANKING = [
    { posicao: 1, colaborador: 'Colaborador efetivo próximo', tipo: 'Efetivo', cidade_base: 'Cascavel', uf_base: 'PR', distancia_km: 18, hotel_nome: 'Sem hospedagem', hotel_diaria: 0, passagem_valor: 0, custo_mao_obra: 0, custo_total: 42, score_auditoria: 94, score_final: 96, recomendacao: 'Melhor custo-benefício' },
    { posicao: 2, colaborador: 'Diarista regional', tipo: 'Diarista', cidade_base: 'Toledo', uf_base: 'PR', distancia_km: 52, hotel_nome: 'Hotel parceiro', hotel_diaria: 145, passagem_valor: 38, custo_mao_obra: 180, custo_total: 363, score_auditoria: 88, score_final: 82, recomendacao: 'Boa opção' },
    { posicao: 3, colaborador: 'Efetivo externo', tipo: 'Efetivo', cidade_base: 'Maringá', uf_base: 'PR', distancia_km: 276, hotel_nome: 'Hotel parceiro', hotel_diaria: 155, passagem_valor: 112, custo_mao_obra: 0, custo_total: 347, score_auditoria: 91, score_final: 78, recomendacao: 'Avaliar deslocamento' }
  ];

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

  function number(value, digits = 0) {
    return Number(value || 0).toLocaleString('pt-BR', { maximumFractionDigits: digits, minimumFractionDigits: digits });
  }

  function normalizeText(value) {
    return String(value || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  function getScoreClass(score) {
    const n = Number(score || 0);
    if (n >= 85) return 'is-good';
    if (n >= 70) return 'is-mid';
    return 'is-bad';
  }

  async function fetchEmbarques() {
    const { data, error } = await supabase
      .from('operacional_embarques')
      .select('id, cliente, cidade, uf, local_embarque, volume_ton, data_embarque, status')
      .in('status', ['planejado', 'aberto', 'em_analise'])
      .order('data_embarque', { ascending: true })
      .limit(100);

    if (error) throw error;
    return Array.isArray(data) && data.length ? data : SAMPLE_EMBARQUES;
  }

  async function fetchRanking(embarqueId) {
    if (!embarqueId || String(embarqueId).startsWith('demo-')) return SAMPLE_RANKING;

    const { data, error } = await supabase.rpc('operacional_ranking_embarque', {
      p_embarque_id: embarqueId
    });

    if (error) throw error;
    return Array.isArray(data) && data.length ? data : [];
  }

  function renderShell(container) {
    container.innerHTML = `
      <section class="op-hero">
        <div>
          <span class="eyebrow">OPERACIONAL</span>
          <h2>Mapa de Direcionamento</h2>
          <p>Simule o melhor colaborador para cada embarque cruzando distância, hotel, passagem, volume, auditoria e tipo de mão de obra.</p>
        </div>
        <div class="op-hero-score">
          <span id="opBestScore">--</span>
          <small>melhor score</small>
        </div>
      </section>

      <section class="op-filters card">
        <div class="op-field">
          <label for="opEmbarque">Embarque</label>
          <select id="opEmbarque"></select>
        </div>
        <div class="op-field">
          <label for="opBusca">Buscar colaborador</label>
          <input id="opBusca" type="search" placeholder="Nome, cidade ou tipo" />
        </div>
        <div class="op-field">
          <label for="opTipo">Tipo</label>
          <select id="opTipo">
            <option value="">Todos</option>
            <option value="efetivo">Efetivo</option>
            <option value="diarista">Diarista</option>
          </select>
        </div>
        <div class="op-actions">
          <button class="btn btn-secondary" type="button" id="opRefresh">Atualizar análise</button>
        </div>
      </section>

      <section class="op-grid">
        <article class="op-map card">
          <div class="op-card-head">
            <div>
              <h3>Mapa visual</h3>
              <p id="opMapSubtitle">Selecione um embarque para analisar.</p>
            </div>
          </div>
          <div class="op-map-stage" id="opMapStage"></div>
        </article>

        <aside class="op-ranking card">
          <div class="op-card-head">
            <div>
              <h3>Ranking recomendado</h3>
              <p>Ordenado por custo-benefício operacional.</p>
            </div>
          </div>
          <div id="opRankingList" class="op-ranking-list"></div>
        </aside>
      </section>

      <section class="card op-table-card">
        <div class="op-card-head">
          <div>
            <h3>Detalhamento da simulação</h3>
            <p>Comparativo de custo, deslocamento, hotel e auditoria.</p>
          </div>
          <button class="btn btn-secondary" type="button" id="opExportCsv">Exportar CSV</button>
        </div>
        <div class="op-table-wrap">
          <table class="op-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Colaborador</th>
                <th>Tipo</th>
                <th>Base</th>
                <th>Distância</th>
                <th>Hotel</th>
                <th>Passagem</th>
                <th>Mão de obra</th>
                <th>Custo total</th>
                <th>Auditoria</th>
                <th>Score</th>
              </tr>
            </thead>
            <tbody id="opTableBody"></tbody>
          </table>
        </div>
      </section>
    `;
  }

  function renderEmbarques(select, embarques) {
    select.innerHTML = embarques.map((e) => `
      <option value="${esc(e.id)}">
        ${esc(e.cliente || 'Embarque')} · ${esc(e.cidade || '-')}/${esc(e.uf || '-')} · ${number(e.volume_ton, 0)} t
      </option>
    `).join('');
  }

  function renderMap(container, embarque, ranking) {
    const best = ranking[0];
    const mid = ranking[1];
    const third = ranking[2];
    container.innerHTML = `
      <div class="op-map-bg"></div>
      <div class="op-map-pin op-pin-embarque" style="left:64%;top:44%;">
        <span></span><strong>Embarque</strong><small>${esc(embarque?.cidade || '-')}/${esc(embarque?.uf || '')}</small>
      </div>
      ${best ? `<div class="op-map-pin op-pin-good" style="left:22%;top:58%;"><span></span><strong>${esc(best.colaborador)}</strong><small>${number(best.distancia_km, 0)} km</small></div>` : ''}
      ${mid ? `<div class="op-map-pin op-pin-mid" style="left:38%;top:25%;"><span></span><strong>${esc(mid.colaborador)}</strong><small>${number(mid.distancia_km, 0)} km</small></div>` : ''}
      ${third ? `<div class="op-map-pin op-pin-bad" style="left:76%;top:70%;"><span></span><strong>${esc(third.colaborador)}</strong><small>${number(third.distancia_km, 0)} km</small></div>` : ''}
      <svg class="op-map-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        ${best ? '<path d="M22 58 C35 50, 48 46, 64 44" />' : ''}
        ${mid ? '<path d="M38 25 C45 30, 54 38, 64 44" />' : ''}
        ${third ? '<path d="M76 70 C74 60, 70 50, 64 44" />' : ''}
      </svg>
    `;
  }

  function filterRanking(ranking, search, tipo) {
    const q = normalizeText(search);
    const t = normalizeText(tipo);
    return ranking.filter((row) => {
      const hay = normalizeText([row.colaborador, row.tipo, row.cidade_base, row.uf_base, row.recomendacao].join(' '));
      const okSearch = !q || hay.includes(q);
      const okTipo = !t || normalizeText(row.tipo) === t;
      return okSearch && okTipo;
    });
  }

  function renderRanking(container, rows) {
    if (!rows.length) {
      container.innerHTML = `<div class="empty-state">Nenhum colaborador encontrado para os filtros atuais.</div>`;
      return;
    }
    container.innerHTML = rows.slice(0, 6).map((row, idx) => `
      <div class="op-rank-item ${idx === 0 ? 'is-best' : ''}">
        <div class="op-rank-pos">${idx + 1}</div>
        <div class="op-rank-main">
          <strong>${esc(row.colaborador)}</strong>
          <span>${esc(row.tipo)} · ${esc(row.cidade_base || '-')}/${esc(row.uf_base || '-')}</span>
          <small>${esc(row.recomendacao || '')}</small>
        </div>
        <div class="op-rank-score ${getScoreClass(row.score_final)}">${number(row.score_final, 0)}</div>
      </div>
    `).join('');
  }

  function renderTable(tbody, rows) {
    if (!rows.length) {
      tbody.innerHTML = `<tr><td colspan="11" class="op-empty-cell">Nenhum resultado para exibir.</td></tr>`;
      return;
    }
    tbody.innerHTML = rows.map((row, idx) => `
      <tr>
        <td>${idx + 1}</td>
        <td><strong>${esc(row.colaborador)}</strong><br><span>${esc(row.recomendacao || '')}</span></td>
        <td>${esc(row.tipo)}</td>
        <td>${esc(row.cidade_base || '-')}/${esc(row.uf_base || '-')}</td>
        <td>${number(row.distancia_km, 0)} km</td>
        <td>${esc(row.hotel_nome || '-')}<br><span>${money(row.hotel_diaria)}</span></td>
        <td>${money(row.passagem_valor)}</td>
        <td>${money(row.custo_mao_obra)}</td>
        <td><strong>${money(row.custo_total)}</strong></td>
        <td>${number(row.score_auditoria, 0)}</td>
        <td><span class="op-score-pill ${getScoreClass(row.score_final)}">${number(row.score_final, 0)}</span></td>
      </tr>
    `).join('');
  }

  function exportCsv(rows) {
    const header = ['posicao','colaborador','tipo','cidade_base','uf_base','distancia_km','hotel_nome','hotel_diaria','passagem_valor','custo_mao_obra','custo_total','score_auditoria','score_final','recomendacao'];
    const csv = [header.join(';')].concat(rows.map((row, idx) => header.map((key) => {
      const value = key === 'posicao' ? idx + 1 : row[key];
      return `"${String(value ?? '').replaceAll('"', '""')}"`;
    }).join(';'))).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mapa-operacional-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function openHome(container, opts = {}) {
    renderShell(container);

    const state = { embarques: [], ranking: [], filtered: [] };
    const select = container.querySelector('#opEmbarque');
    const busca = container.querySelector('#opBusca');
    const tipo = container.querySelector('#opTipo');
    const refresh = container.querySelector('#opRefresh');
    const exportBtn = container.querySelector('#opExportCsv');
    const bestScore = container.querySelector('#opBestScore');
    const subtitle = container.querySelector('#opMapSubtitle');
    const mapStage = container.querySelector('#opMapStage');
    const rankingList = container.querySelector('#opRankingList');
    const tableBody = container.querySelector('#opTableBody');

    function applyRender() {
      const embarque = state.embarques.find((e) => String(e.id) === String(select.value)) || state.embarques[0];
      state.filtered = filterRanking(state.ranking, busca.value, tipo.value);
      bestScore.textContent = state.filtered[0] ? number(state.filtered[0].score_final, 0) : '--';
      subtitle.textContent = embarque ? `${embarque.cliente || 'Embarque'} · ${embarque.cidade || '-'}/${embarque.uf || '-'} · ${number(embarque.volume_ton, 0)} t` : 'Selecione um embarque para analisar.';
      renderMap(mapStage, embarque, state.filtered);
      renderRanking(rankingList, state.filtered);
      renderTable(tableBody, state.filtered);
    }

    async function load() {
      refresh.disabled = true;
      refresh.textContent = 'Carregando...';
      try {
        if (!state.embarques.length) {
          state.embarques = await fetchEmbarques();
          renderEmbarques(select, state.embarques);
        }
        state.ranking = await fetchRanking(select.value || state.embarques[0]?.id);
        applyRender();
      } catch (error) {
        console.error('Erro ao carregar operacional:', error);
        state.embarques = SAMPLE_EMBARQUES;
        state.ranking = SAMPLE_RANKING;
        renderEmbarques(select, state.embarques);
        applyRender();
      } finally {
        refresh.disabled = false;
        refresh.textContent = 'Atualizar análise';
      }
    }

    select.addEventListener('change', load);
    busca.addEventListener('input', applyRender);
    tipo.addEventListener('change', applyRender);
    refresh.addEventListener('click', load);
    exportBtn.addEventListener('click', () => exportCsv(state.filtered));

    await load();
  }

  window.OPERACIONAL = { openHome };
})();
