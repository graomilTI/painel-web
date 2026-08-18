import { supabase } from './supabaseClient.js';

const esc = (value) => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

const normalizeName = (value) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/\s+/g, ' ')
  .trim()
  .toUpperCase();

const chunk = (items, size = 50) => {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
};

async function loadPatrimoniosPorNomes(nomes) {
  const unique = [...new Set((nomes || []).map((n) => String(n || '').trim()).filter(Boolean))];
  if (!unique.length) return new Map();

  const rows = [];
  for (const grupo of chunk(unique, 50)) {
    const { data, error } = await supabase
      .from('vw_patrimonios_atual')
      .select('patrimonio_codigo,identificacao,categoria,funcionario,supervisao,situacao,dias_sem_leitura')
      .in('funcionario', grupo);
    if (error) throw error;
    rows.push(...(data || []));
  }

  const map = new Map();
  for (const row of rows) {
    const key = normalizeName(row.funcionario);
    if (!key) continue;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row);
  }
  return map;
}

function injectStyles() {
  if (document.getElementById('desligamentoRhPatrimoniosStyles')) return;
  const style = document.createElement('style');
  style.id = 'desligamentoRhPatrimoniosStyles';
  style.textContent = `
    body.deslig-rh-enhanced .eq-inativ-grid-head,
    body.deslig-rh-enhanced .eq-inativ-card{
      grid-template-columns:minmax(240px,1.25fr) minmax(120px,.65fr) minmax(150px,.8fr) minmax(220px,1.2fr) minmax(96px,.48fr) 48px 48px!important;
    }
    .eq-inativ-patr-cell{display:flex;align-items:center;gap:7px}
    .eq-inativ-patr-count{display:inline-flex;align-items:center;justify-content:center;min-width:28px;height:25px;padding:0 8px;border-radius:999px;font-weight:900;font-size:12px;border:1px solid rgba(148,163,184,.18);background:rgba(148,163,184,.08);color:#94a3b8}
    .eq-inativ-patr-count.has-assets{border-color:rgba(251,146,60,.35);background:rgba(124,45,18,.22);color:#fdba74}
    .eq-inativ-patr-header{text-align:center}
    .pat-deslig-info{margin:0 0 14px;color:var(--muted);font-size:13px}
    .pat-deslig-toolbar{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:14px}
    .pat-deslig-badge{display:inline-flex;align-items:center;justify-content:center;min-width:20px;height:20px;padding:0 6px;margin-left:5px;border-radius:999px;background:#dc2626;color:#fff;font-size:11px;font-weight:900}
    .pat-deslig-count{display:inline-flex;align-items:center;justify-content:center;min-width:30px;height:27px;padding:0 9px;border-radius:999px;background:rgba(251,146,60,.13);border:1px solid rgba(251,146,60,.28);color:#fdba74;font-weight:900}
    .pat-deslig-materials{display:flex;flex-direction:column;gap:4px;min-width:240px}
    .pat-deslig-material{font-size:12px;white-space:normal}
    .pat-deslig-material strong{color:#f8fafc}
    .pat-deslig-status{display:inline-flex;padding:5px 9px;border-radius:999px;font-size:11px;font-weight:850;white-space:nowrap;border:1px solid rgba(148,163,184,.2)}
    .pat-deslig-status.rh-pendente{color:#fde68a;background:rgba(245,158,11,.1);border-color:rgba(245,158,11,.22)}
    .pat-deslig-status.rh-processada{color:#86efac;background:rgba(22,101,52,.16);border-color:rgba(34,197,94,.22)}
    @media(max-width:900px){
      body.deslig-rh-enhanced .eq-inativ-card,
      body.deslig-rh-enhanced .eq-inativ-card:nth-child(odd){grid-template-columns:1fr 1fr 1fr 42px 42px!important}
      body.deslig-rh-enhanced .eq-inativ-name,
      body.deslig-rh-enhanced .eq-inativ-reason{grid-column:1/-1}
      body.deslig-rh-enhanced .eq-inativ-patr-cell{grid-column:auto}
    }
  `;
  document.head.appendChild(style);
}

let rhRefreshTimer = null;
let rhRefreshRunning = false;
let rhLastSignature = '';
let rhLastRun = 0;

async function enhanceRhInativacoes(force = false) {
  if (rhRefreshRunning) return;
  const grids = [...document.querySelectorAll('.eq-inativ-grid')];
  if (!grids.length) return;

  const nomes = [...document.querySelectorAll('.eq-inativ-card .eq-inativ-name')]
    .map((el) => el.textContent.trim())
    .filter(Boolean);
  const signature = [...new Set(nomes.map(normalizeName))].sort().join('|');
  const now = Date.now();
  if (!force && signature === rhLastSignature && now - rhLastRun < 10000 && document.querySelector('.eq-inativ-patr-cell')) return;

  rhRefreshRunning = true;
  try {
    const patrimonioMap = await loadPatrimoniosPorNomes(nomes);
    document.body.classList.add('deslig-rh-enhanced');

    for (const grid of grids) {
      const head = grid.querySelector('.eq-inativ-grid-head');
      if (head && !head.querySelector('.eq-inativ-patr-header')) {
        const span = document.createElement('span');
        span.className = 'eq-inativ-patr-header';
        span.title = 'Quantidade de patrimônios atualmente vinculados ao colaborador';
        span.textContent = 'Patrimônios';
        const actionHead = [...head.children].find((el) => el.getAttribute('title') === 'Processar');
        head.insertBefore(span, actionHead || null);
      }

      for (const card of grid.querySelectorAll('.eq-inativ-card')) {
        const nome = card.querySelector('.eq-inativ-name')?.textContent?.trim() || '';
        const qtd = patrimonioMap.get(normalizeName(nome))?.length || 0;
        let cell = card.querySelector('.eq-inativ-patr-cell');
        if (!cell) {
          cell = document.createElement('div');
          cell.className = 'eq-inativ-cell eq-inativ-patr-cell';
          cell.dataset.label = 'Patrimônios';
          const firstAction = card.querySelector('.eq-inativ-action');
          card.insertBefore(cell, firstAction || null);
        }
        cell.title = qtd ? `${qtd} patrimônio${qtd === 1 ? '' : 's'} a recolher` : 'Nenhum patrimônio vinculado';
        cell.innerHTML = `<span class="eq-inativ-patr-count${qtd ? ' has-assets' : ''}">${qtd}</span>`;
      }
    }

    rhLastSignature = signature;
    rhLastRun = now;
  } catch (error) {
    console.warn('[desligamento] não foi possível carregar patrimônios na tela do RH:', error);
  } finally {
    rhRefreshRunning = false;
  }
}

function observeRh() {
  if (!document.querySelector('#pageContent')) return;
  const observer = new MutationObserver(() => {
    clearTimeout(rhRefreshTimer);
    rhRefreshTimer = setTimeout(() => enhanceRhInativacoes(), 120);
  });
  observer.observe(document.querySelector('#pageContent'), { childList: true, subtree: true });
  setTimeout(() => enhanceRhInativacoes(true), 400);
}

let patDesligadosLoadedAt = 0;
let patDesligadosLoading = false;

function ensurePatrimoniosDesligadosUi() {
  const tabs = document.querySelector('.pat-tabs');
  const content = document.querySelector('.pat-content');
  if (!tabs || !content) return false;

  if (!tabs.querySelector('[data-pat-desligados]')) {
    const btn = document.createElement('button');
    btn.className = 'pat-hist-card';
    btn.type = 'button';
    btn.dataset.patDesligados = '1';
    btn.innerHTML = '<span class="pat-hist-icon">📦</span><span class="pat-hist-text"><strong>Desligados</strong></span><span class="pat-deslig-badge" data-pat-deslig-badge style="display:none">0</span>';
    tabs.appendChild(btn);
  }

  if (!document.getElementById('patDesligadosSection')) {
    const section = document.createElement('section');
    section.className = 'card';
    section.id = 'patDesligadosSection';
    section.style.display = 'none';
    section.innerHTML = `
      <div class="pat-deslig-toolbar">
        <div>
          <h3 style="margin:0 0 4px">Desligados — recolhimento de patrimônios</h3>
          <p class="pat-deslig-info">Cópia das solicitações de desligamento que ainda possuem patrimônio vinculado. O fluxo do RH continua independente.</p>
        </div>
        <button class="btn btn-secondary" id="patDesligRefresh" type="button">↻ Atualizar</button>
      </div>
      <div id="patDesligadosGrid"><p class="pat-empty">Carregando...</p></div>`;
    content.appendChild(section);
    section.querySelector('#patDesligRefresh').addEventListener('click', () => loadPatrimoniosDesligados(true));
  }

  return true;
}

function setPatDesligadosActive(active) {
  const section = document.getElementById('patDesligadosSection');
  const btn = document.querySelector('[data-pat-desligados]');
  if (!section || !btn) return;
  section.style.display = active ? '' : 'none';
  btn.classList.toggle('pat-hist-card-active', active);
  if (active) {
    document.getElementById('patCadastrarSection')?.style.setProperty('display', 'none');
    document.getElementById('patHistoricoSection')?.style.setProperty('display', 'none');
  }
}

async function loadPatrimoniosDesligados(force = false) {
  if (patDesligadosLoading) return;
  if (!force && Date.now() - patDesligadosLoadedAt < 10000) return;
  const grid = document.getElementById('patDesligadosGrid');
  if (!grid) return;

  patDesligadosLoading = true;
  grid.innerHTML = '<p class="pat-empty">Carregando...</p>';
  try {
    const { data: solicitacoes, error } = await supabase
      .from('programacao_inativacao_solicitacoes')
      .select('id,nome_colaborador,colaborador_id,supervisao,coordenacao,motivo,status,solicitado_em')
      .in('status', ['PENDENTE', 'PROCESSADA'])
      .order('solicitado_em', { ascending: false })
      .limit(500);
    if (error) throw error;

    // Uma pessoa pode ter mais de uma solicitação histórica. Para Patrimônios,
    // mostramos só a solicitação mais recente enquanto houver material em seu nome.
    const porNome = new Map();
    for (const req of solicitacoes || []) {
      const key = normalizeName(req.nome_colaborador);
      if (key && !porNome.has(key)) porNome.set(key, req);
    }

    const nomes = [...porNome.values()].map((r) => r.nome_colaborador);
    const patrimonioMap = await loadPatrimoniosPorNomes(nomes);
    const rows = [...porNome.entries()]
      .map(([key, req]) => ({ req, itens: patrimonioMap.get(key) || [] }))
      .filter((entry) => entry.itens.length > 0);

    rows.sort((a, b) => b.itens.length - a.itens.length || String(a.req.nome_colaborador || '').localeCompare(String(b.req.nome_colaborador || ''), 'pt-BR'));

    const badge = document.querySelector('[data-pat-deslig-badge]');
    if (badge) {
      badge.textContent = String(rows.length);
      badge.style.display = rows.length ? '' : 'none';
    }

    if (!rows.length) {
      grid.innerHTML = '<p class="pat-empty">Nenhum desligamento com patrimônio pendente de recolhimento.</p>';
      patDesligadosLoadedAt = Date.now();
      return;
    }

    grid.innerHTML = `<div class="pat-table-wrap"><table class="pat-table">
      <thead><tr><th>Colaborador</th><th>Supervisão</th><th>Patrimônios</th><th>Materiais a recolher</th><th>RH</th></tr></thead>
      <tbody>${rows.map(({ req, itens }) => {
        const materiais = itens
          .slice()
          .sort((a, b) => String(a.patrimonio_codigo || '').localeCompare(String(b.patrimonio_codigo || ''), 'pt-BR', { numeric: true }))
          .map((item) => `<div class="pat-deslig-material"><strong>${esc(item.patrimonio_codigo || '-')}</strong> — ${esc(item.identificacao || item.categoria || 'Material sem identificação')}</div>`)
          .join('');
        const rhPendente = req.status === 'PENDENTE';
        return `<tr>
          <td><b>${esc(req.nome_colaborador || '-')}</b>${req.motivo ? `<br><small class="muted">${esc(req.motivo)}</small>` : ''}</td>
          <td>${esc(req.supervisao || req.coordenacao || '-')}</td>
          <td><span class="pat-deslig-count">${itens.length}</span></td>
          <td><div class="pat-deslig-materials">${materiais}</div></td>
          <td><span class="pat-deslig-status ${rhPendente ? 'rh-pendente' : 'rh-processada'}">${rhPendente ? 'Aguardando RH' : 'RH processou'}</span></td>
        </tr>`;
      }).join('')}</tbody>
    </table></div>`;
    patDesligadosLoadedAt = Date.now();
  } catch (error) {
    console.warn('[desligamento] não foi possível carregar Desligados em Patrimônios:', error);
    grid.innerHTML = `<p class="pat-empty">Não foi possível carregar os desligados: ${esc(error.message || 'erro inesperado')}</p>`;
  } finally {
    patDesligadosLoading = false;
  }
}

function observePatrimonios() {
  const setup = () => {
    if (!ensurePatrimoniosDesligadosUi()) return false;

    const tabs = document.querySelector('.pat-tabs');
    if (!tabs.dataset.desligamentoBound) {
      tabs.dataset.desligamentoBound = '1';
      tabs.addEventListener('click', (event) => {
        const desligBtn = event.target.closest('[data-pat-desligados]');
        if (desligBtn) {
          tabs.querySelectorAll('.pat-hist-card').forEach((b) => b.classList.remove('pat-hist-card-active'));
          setPatDesligadosActive(true);
          loadPatrimoniosDesligados(true);
          return;
        }
        if (event.target.closest('[data-pat-tab]')) setPatDesligadosActive(false);
      });
    }
    loadPatrimoniosDesligados(true);
    return true;
  };

  if (setup()) return;
  const root = document.querySelector('#pageContent');
  if (!root) return;
  const observer = new MutationObserver(() => {
    if (setup()) observer.disconnect();
  });
  observer.observe(root, { childList: true, subtree: true });
}

function init() {
  injectStyles();
  const path = location.pathname.toLowerCase();
  if (path.endsWith('/equipe') || path.endsWith('/equipe.html')) observeRh();
  if (path.endsWith('/patrimonios') || path.endsWith('/patrimonios.html')) observePatrimonios();
}

init();
