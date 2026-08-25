import { initProtectedPage } from './pageInit.js';
import { supabase } from './supabaseClient.js';
import * as XLSX from 'https://esm.sh/xlsx@0.18.5';

const STYLE_ID = 'conferenciaBonusStyles';
const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const MESES_FULL = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

let root = null;
let abaAtiva = 'producao';
let ano = new Date().getFullYear();
let mes = new Date().getMonth();
let producao = [];
let auditoria = [];
let selecionados = new Set();
let busca = '';
let filtroStatus = 'TODOS';
let carregando = false;

function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function norm(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '')
    .trim();
}

function competencia() {
  return `${ano}-${String(mes + 1).padStart(2, '0')}-01`;
}

function tonsBr(value) {
  return Number(value || 0).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function moeda(value) {
  return Number(value || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
  });
}

function dataHoraBr(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

function injectStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    #pageContent{max-width:none!important;padding:20px 24px 28px!important}
    .bonus-wrap{width:100%;max-width:1500px;margin:0 auto}
    .bonus-head{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:14px}
    .bonus-head-copy h2{margin:0;color:#f1faf6;font-size:20px;font-weight:850}
    .bonus-head-copy p{margin:4px 0 0;color:#89a499;font-size:12.5px}
    .bonus-tabs{display:flex;align-items:center;gap:4px;padding:4px;border:1px solid rgba(110,231,183,.14);border-radius:12px;background:rgba(5,24,18,.72)}
    .bonus-tab{border:0;border-radius:9px;background:transparent;color:#9fb7aa;padding:9px 16px;font:inherit;font-size:12.5px;font-weight:850;cursor:pointer}
    .bonus-tab.active{background:rgba(34,197,94,.13);color:#72efb1}
    .bonus-periodo{display:flex;align-items:center;gap:10px;margin-bottom:14px;padding:11px 12px;border:1px solid rgba(110,231,183,.12);border-radius:14px;background:rgba(5,24,18,.72);overflow:hidden}
    .bonus-year{display:flex;align-items:center;gap:6px;flex:0 0 auto}
    .bonus-year button{width:32px;height:32px;border:1px solid rgba(110,231,183,.16);border-radius:9px;background:#071b15;color:#d8eee3;font-size:17px;cursor:pointer}
    .bonus-year strong{min-width:48px;text-align:center;color:#f1faf6;font-size:13px}
    .bonus-months{display:flex;gap:5px;min-width:0;overflow-x:auto;scrollbar-width:thin;padding-bottom:1px}
    .bonus-month{min-width:54px;height:32px;border:1px solid transparent;border-radius:9px;background:transparent;color:#8ca79b;font:inherit;font-size:11.5px;font-weight:800;cursor:pointer}
    .bonus-month:hover{background:rgba(34,197,94,.05);color:#ccebdc}
    .bonus-month.active{background:rgba(34,197,94,.14);border-color:rgba(74,222,128,.24);color:#68efaa}
    .bonus-summary{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:0 0 12px}
    .bonus-pill{display:inline-flex;align-items:center;gap:6px;padding:6px 9px;border:1px solid rgba(148,163,184,.12);border-radius:999px;background:rgba(8,25,19,.72);color:#9fb7aa;font-size:11px}
    .bonus-pill b{color:#eaf8f1}
    .bonus-pill.ok b{color:#72efb1}.bonus-pill.bad b{color:#ff8e8e}
    .bonus-card{border:1px solid rgba(110,231,183,.12);border-radius:16px;background:rgba(4,21,16,.76);overflow:hidden}
    .bonus-toolbar{display:flex;align-items:center;gap:8px;padding:12px;border-bottom:1px solid rgba(110,231,183,.1);background:rgba(6,29,22,.62)}
    .bonus-input,.bonus-select{height:38px;box-sizing:border-box;border:1px solid rgba(110,231,183,.16);border-radius:9px;background:#06150f;color:#e8f7ef;padding:0 11px;font:inherit;font-size:12px;outline:none;color-scheme:dark}
    .bonus-input{min-width:240px;flex:1}.bonus-select{width:145px}
    .bonus-input:focus,.bonus-select:focus{border-color:rgba(52,211,153,.55);box-shadow:0 0 0 3px rgba(16,185,129,.07)}
    .bonus-selected{margin-left:auto;color:#7f9b8e;font-size:11.5px;white-space:nowrap}
    .bonus-table-wrap{overflow:auto;max-height:66vh}
    .bonus-table{width:100%;border-collapse:collapse;min-width:760px}
    .bonus-table th{position:sticky;top:0;z-index:2;background:#061d16;color:#66dca3;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.06em;padding:13px 14px;border-bottom:1px solid rgba(110,231,183,.13)}
    .bonus-table td{padding:13px 14px;border-bottom:1px solid rgba(148,163,184,.075);color:#dbece4;font-size:12.5px;vertical-align:middle}
    .bonus-table tbody tr:hover{background:rgba(34,197,94,.03)}
    .bonus-check{width:16px;height:16px;accent-color:#22c55e;cursor:pointer}
    .bonus-name{font-weight:800;color:#f1faf6}
    .bonus-num{text-align:right!important;font-variant-numeric:tabular-nums;white-space:nowrap}
    .bonus-value{font-weight:850;color:#c7f9dc}
    .bonus-status{display:inline-flex;align-items:center;gap:6px;padding:5px 9px;border-radius:999px;border:1px solid transparent;font-size:10.5px;font-weight:900;white-space:nowrap}
    .bonus-status::before{content:'';width:6px;height:6px;border-radius:50%;background:currentColor}
    .bonus-status.apto{color:#72efb1;background:rgba(16,185,129,.12);border-color:rgba(52,211,153,.17)}
    .bonus-status.inapto{color:#ff8e8e;background:rgba(239,68,68,.1);border-color:rgba(248,113,113,.17)}
    .bonus-reason{display:block;margin-top:4px;color:#879f94;font-size:10.5px;white-space:normal}
    .bonus-empty{padding:34px 18px;text-align:center;color:#789487;font-size:12.5px}
    .bonus-loading{padding:34px 18px;text-align:center;color:#a6beb3;font-size:12.5px}
    .audit-layout{display:grid;grid-template-columns:minmax(320px,430px) minmax(520px,1fr);gap:14px}
    .audit-upload{padding:18px;border:1px solid rgba(110,231,183,.12);border-radius:16px;background:rgba(4,21,16,.76)}
    .audit-upload h3{margin:0 0 6px;color:#f1faf6;font-size:15px}
    .audit-upload p{margin:0 0 15px;color:#89a499;font-size:12px;line-height:1.5}
    .audit-drop{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;min-height:170px;padding:18px;border:1px dashed rgba(110,231,183,.28);border-radius:13px;background:rgba(6,29,22,.5);text-align:center}
    .audit-drop strong{color:#dff7e9;font-size:13px}.audit-drop small{color:#7f9b8e;font-size:11px}
    .audit-btn{display:inline-flex;align-items:center;justify-content:center;height:38px;padding:0 14px;border:1px solid rgba(74,222,128,.28);border-radius:9px;background:rgba(34,197,94,.13);color:#7bf0b2;font:inherit;font-size:12px;font-weight:850;cursor:pointer}
    .audit-btn:hover{background:rgba(34,197,94,.2)}.audit-btn:disabled{opacity:.55;cursor:not-allowed}
    .audit-file{display:none}
    .audit-msg{min-height:18px;margin-top:10px;color:#9fb7aa;font-size:11.5px;line-height:1.45}
    .audit-msg.ok{color:#72efb1}.audit-msg.err{color:#ff9a9a}
    .audit-list{border:1px solid rgba(110,231,183,.12);border-radius:16px;background:rgba(4,21,16,.76);overflow:hidden}
    .audit-list-head{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:14px 16px;border-bottom:1px solid rgba(110,231,183,.1)}
    .audit-list-head div strong{display:block;color:#f1faf6;font-size:13px}.audit-list-head div small{color:#7f9b8e;font-size:10.5px}
    .audit-count{padding:5px 8px;border-radius:999px;background:rgba(239,68,68,.1);color:#ff9a9a;font-size:10.5px;font-weight:850}
    .audit-table-wrap{overflow:auto;max-height:62vh}
    @media(max-width:980px){.bonus-head{align-items:flex-start;flex-direction:column}.audit-layout{grid-template-columns:1fr}.bonus-toolbar{flex-wrap:wrap}.bonus-selected{margin-left:0;width:100%}.bonus-periodo{align-items:flex-start;flex-direction:column}.bonus-months{width:100%}}
  `;
  document.head.appendChild(style);
}

function ensureSidebarBonusLink() {
  const menu = document.getElementById('sidebarMenu');
  if (!menu || menu.querySelector('[data-conferencia-bonus-link]')) return false;
  const sections = [...menu.querySelectorAll('.menu-section')];
  const section = sections.find((el) => {
    const title = el.querySelector('.menu-section-toggle-text')?.textContent || '';
    return norm(title) === norm('CONFERÊNCIA');
  });
  const list = section?.querySelector('.menu-list');
  if (!list) return false;
  const li = document.createElement('li');
  const a = document.createElement('a');
  a.href = './conferencia-bonus.html';
  a.dataset.conferenciaBonusLink = '1';
  a.classList.add('active');
  const dot = document.createElement('span');
  dot.className = 'menu-item-dot';
  const label = document.createElement('span');
  label.textContent = 'Bônus';
  a.append(dot, label);
  li.appendChild(a);
  list.appendChild(li);
  section.querySelector('.menu-section-body')?.removeAttribute('hidden');
  return true;
}

function wireSidebarBonus() {
  if (ensureSidebarBonusLink()) return;
  const obs = new MutationObserver(() => {
    if (ensureSidebarBonusLink()) obs.disconnect();
  });
  obs.observe(document.getElementById('sidebarMenu') || document.body, { childList: true, subtree: true });
}

function renderPeriodo() {
  const box = root.querySelector('#bonusPeriodo');
  if (!box) return;
  box.innerHTML = `
    <div class="bonus-year">
      <button type="button" data-year-step="-1" aria-label="Ano anterior">‹</button>
      <strong>${ano}</strong>
      <button type="button" data-year-step="1" aria-label="Próximo ano">›</button>
    </div>
    <div class="bonus-months">
      ${MESES.map((nome, index) => `<button class="bonus-month ${index === mes ? 'active' : ''}" type="button" data-month="${index}">${nome}</button>`).join('')}
    </div>`;
}

function resumo() {
  const aptos = producao.filter((row) => row.status === 'Apto').length;
  const inaptos = producao.length - aptos;
  const valorApto = producao.filter((row) => row.status === 'Apto').reduce((sum, row) => sum + Number(row.valor || 0), 0);
  return { aptos, inaptos, valorApto };
}

function producaoFiltrada() {
  const q = norm(busca);
  return producao.filter((row) => {
    if (filtroStatus !== 'TODOS' && row.status !== filtroStatus) return false;
    if (q && !norm(row.colaborador).includes(q)) return false;
    return true;
  });
}

function renderProducao() {
  const body = root.querySelector('#bonusBody');
  if (!body) return;
  const r = resumo();
  const rows = producaoFiltrada();
  const allChecked = rows.length > 0 && rows.every((row) => selecionados.has(norm(row.colaborador)));

  body.innerHTML = `
    <div class="bonus-summary">
      <span class="bonus-pill"><span>Colaboradores</span><b>${producao.length}</b></span>
      <span class="bonus-pill ok"><span>Aptos</span><b>${r.aptos}</b></span>
      <span class="bonus-pill bad"><span>Inaptos</span><b>${r.inaptos}</b></span>
      <span class="bonus-pill ok"><span>Valor apto</span><b>${moeda(r.valorApto)}</b></span>
    </div>
    <div class="bonus-card">
      <div class="bonus-toolbar">
        <input class="bonus-input" id="bonusBusca" type="search" placeholder="Buscar colaborador..." value="${esc(busca)}" />
        <select class="bonus-select" id="bonusStatusFilter">
          <option value="TODOS" ${filtroStatus === 'TODOS' ? 'selected' : ''}>Todos</option>
          <option value="Apto" ${filtroStatus === 'Apto' ? 'selected' : ''}>Aptos</option>
          <option value="Inapto" ${filtroStatus === 'Inapto' ? 'selected' : ''}>Inaptos</option>
        </select>
        <span class="bonus-selected">${selecionados.size} selecionado(s)</span>
      </div>
      <div class="bonus-table-wrap">
        <table class="bonus-table">
          <thead>
            <tr>
              <th style="width:42px"><input class="bonus-check" id="bonusCheckAll" type="checkbox" ${allChecked ? 'checked' : ''} aria-label="Selecionar todos" /></th>
              <th>Colaborador</th>
              <th class="bonus-num">Tons</th>
              <th class="bonus-num">Valor</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${rows.length ? rows.map((row) => {
              const key = norm(row.colaborador);
              const inapto = row.status === 'Inapto';
              return `<tr>
                <td><input class="bonus-check" type="checkbox" data-row-check="${esc(key)}" ${selecionados.has(key) ? 'checked' : ''} aria-label="Selecionar ${esc(row.colaborador)}" /></td>
                <td><span class="bonus-name">${esc(row.colaborador)}</span></td>
                <td class="bonus-num">${tonsBr(row.tons)}</td>
                <td class="bonus-num bonus-value">${moeda(row.valor)}</td>
                <td>
                  <span class="bonus-status ${inapto ? 'inapto' : 'apto'}" title="${esc(row.motivo || '')}">${esc(row.status)}</span>
                  ${row.motivo ? `<span class="bonus-reason">${esc(row.motivo)}</span>` : ''}
                </td>
              </tr>`;
            }).join('') : `<tr><td colspan="5"><div class="bonus-empty">Nenhuma produção encontrada para ${MESES_FULL[mes]} de ${ano}.</div></td></tr>`}
          </tbody>
        </table>
      </div>
    </div>`;

  root.querySelector('#bonusBusca')?.addEventListener('input', (event) => {
    busca = event.target.value;
    renderProducao();
    const input = root.querySelector('#bonusBusca');
    input?.focus();
    try { input?.setSelectionRange(input.value.length, input.value.length); } catch {}
  });
  root.querySelector('#bonusStatusFilter')?.addEventListener('change', (event) => {
    filtroStatus = event.target.value;
    renderProducao();
  });
  root.querySelector('#bonusCheckAll')?.addEventListener('change', (event) => {
    producaoFiltrada().forEach((row) => {
      const key = norm(row.colaborador);
      if (event.target.checked) selecionados.add(key); else selecionados.delete(key);
    });
    renderProducao();
  });
  root.querySelectorAll('[data-row-check]').forEach((input) => {
    input.addEventListener('change', () => {
      const key = input.dataset.rowCheck;
      if (input.checked) selecionados.add(key); else selecionados.delete(key);
      root.querySelector('.bonus-selected').textContent = `${selecionados.size} selecionado(s)`;
    });
  });
}

function renderAuditoria() {
  const body = root.querySelector('#bonusBody');
  if (!body) return;
  const arquivo = auditoria.find((row) => row.arquivo_nome)?.arquivo_nome || '—';
  const ultimo = auditoria.reduce((best, row) => {
    if (!row.importado_em) return best;
    if (!best || new Date(row.importado_em) > new Date(best)) return row.importado_em;
    return best;
  }, null);

  body.innerHTML = `
    <div class="audit-layout">
      <section class="audit-upload">
        <h3>Auditoria · ${MESES_FULL[mes]} ${ano}</h3>
        <p>Importe a planilha mensal. Todo nome encontrado na coluna <b>Colaborador</b> será considerado <b>Inapto</b> para esta competência. Um novo upload substitui a lista anterior do mesmo mês.</p>
        <div class="audit-drop">
          <strong>Planilha de auditoria</strong>
          <small>Formato .xlsx ou .xls · cabeçalho “Colaborador”</small>
          <label class="audit-btn" for="bonusAuditFile">Selecionar planilha</label>
          <input class="audit-file" id="bonusAuditFile" type="file" accept=".xlsx,.xls,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" />
        </div>
        <div class="audit-msg" id="bonusAuditMsg"></div>
      </section>
      <section class="audit-list">
        <div class="audit-list-head">
          <div><strong>Inaptos por auditoria</strong><small>Arquivo: ${esc(arquivo)}${ultimo ? ` · ${dataHoraBr(ultimo)}` : ''}</small></div>
          <span class="audit-count">${auditoria.length} nome(s)</span>
        </div>
        <div class="audit-table-wrap">
          <table class="bonus-table">
            <thead><tr><th>Colaborador</th><th>Arquivo</th><th>Importado em</th></tr></thead>
            <tbody>
              ${auditoria.length ? auditoria.map((row) => `<tr><td><span class="bonus-name">${esc(row.colaborador_nome)}</span></td><td>${esc(row.arquivo_nome || '—')}</td><td>${esc(dataHoraBr(row.importado_em))}</td></tr>`).join('') : '<tr><td colspan="3"><div class="bonus-empty">Nenhuma planilha importada para este mês.</div></td></tr>'}
            </tbody>
          </table>
        </div>
      </section>
    </div>`;

  root.querySelector('#bonusAuditFile')?.addEventListener('change', handleAuditFile);
}

function renderBody() {
  root.querySelectorAll('.bonus-tab').forEach((button) => button.classList.toggle('active', button.dataset.tab === abaAtiva));
  if (carregando) {
    root.querySelector('#bonusBody').innerHTML = '<div class="bonus-card"><div class="bonus-loading">Carregando informações do mês...</div></div>';
    return;
  }
  if (abaAtiva === 'auditoria') renderAuditoria(); else renderProducao();
}

async function loadData() {
  carregando = true;
  renderBody();
  const comp = competencia();
  const [prodRes, auditRes] = await Promise.all([
    supabase.rpc('bonus_producao_competencia', { p_competencia: comp }),
    supabase
      .from('bonus_auditoria_inaptos')
      .select('id,colaborador_nome,arquivo_nome,importado_em')
      .eq('competencia', comp)
      .order('colaborador_nome', { ascending: true }),
  ]);
  carregando = false;
  if (prodRes.error) throw prodRes.error;
  if (auditRes.error) throw auditRes.error;
  producao = prodRes.data || [];
  auditoria = auditRes.data || [];
  renderBody();
}

function extractCollaborators(workbook) {
  for (const sheetName of workbook.SheetNames || []) {
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false });
    for (let r = 0; r < rows.length; r += 1) {
      const line = Array.isArray(rows[r]) ? rows[r] : [];
      const col = line.findIndex((cell) => norm(cell) === norm('Colaborador'));
      if (col < 0) continue;
      const unique = new Map();
      for (let i = r + 1; i < rows.length; i += 1) {
        const raw = String(rows[i]?.[col] ?? '').trim();
        const key = norm(raw);
        if (!key || key === 'TOTAL' || key === 'TOTAIS' || key === 'COLABORADOR') continue;
        if (!unique.has(key)) unique.set(key, raw);
      }
      if (unique.size) return [...unique.values()];
    }
  }
  return [];
}

async function handleAuditFile(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  const msg = root.querySelector('#bonusAuditMsg');
  const label = root.querySelector('label[for="bonusAuditFile"]');
  msg.className = 'audit-msg';
  msg.textContent = 'Lendo a planilha...';
  label.style.pointerEvents = 'none';
  label.style.opacity = '.55';

  try {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array' });
    const nomes = extractCollaborators(workbook);
    if (!nomes.length) throw new Error('Não encontrei a coluna “Colaborador” com nomes na planilha.');

    msg.textContent = `${nomes.length} nome(s) encontrados. Salvando auditoria...`;
    const { data, error } = await supabase.rpc('bonus_substituir_auditoria', {
      p_competencia: competencia(),
      p_nomes: nomes,
      p_arquivo_nome: file.name,
    });
    if (error) throw error;

    msg.className = 'audit-msg ok';
    msg.textContent = `${Number(data || nomes.length)} colaborador(es) importados. Todos foram marcados como Inapto em ${MESES_FULL[mes]} de ${ano}.`;
    await loadData();
    const nextMsg = root.querySelector('#bonusAuditMsg');
    if (nextMsg) {
      nextMsg.className = 'audit-msg ok';
      nextMsg.textContent = `${Number(data || nomes.length)} colaborador(es) importados de ${file.name}.`;
    }
  } catch (error) {
    console.error('[conferencia-bonus] upload auditoria', error);
    msg.className = 'audit-msg err';
    msg.textContent = error?.message || 'Não foi possível importar a planilha.';
  } finally {
    const currentLabel = root.querySelector('label[for="bonusAuditFile"]');
    if (currentLabel) {
      currentLabel.style.pointerEvents = '';
      currentLabel.style.opacity = '';
    }
    event.target.value = '';
  }
}

function wireHeader() {
  root.querySelector('.bonus-tabs')?.addEventListener('click', (event) => {
    const button = event.target.closest('.bonus-tab');
    if (!button || button.dataset.tab === abaAtiva) return;
    abaAtiva = button.dataset.tab;
    renderBody();
  });

  root.querySelector('#bonusPeriodo')?.addEventListener('click', async (event) => {
    const monthButton = event.target.closest('[data-month]');
    const yearButton = event.target.closest('[data-year-step]');
    if (!monthButton && !yearButton) return;
    if (monthButton) mes = Number(monthButton.dataset.month);
    if (yearButton) ano += Number(yearButton.dataset.yearStep);
    selecionados = new Set();
    busca = '';
    filtroStatus = 'TODOS';
    renderPeriodo();
    try { await loadData(); } catch (error) { renderError(error); }
  });
}

function renderError(error) {
  carregando = false;
  const body = root.querySelector('#bonusBody');
  if (!body) return;
  body.innerHTML = `<div class="bonus-card"><div class="bonus-empty" style="color:#ff9a9a">Não foi possível carregar o Bônus: ${esc(error?.message || error)}</div></div>`;
}

export function renderContent(content) {
  injectStyles();
  root = content;
  content.innerHTML = `
    <div class="bonus-wrap">
      <div class="bonus-head">
        <div class="bonus-head-copy">
          <h2>Bônus</h2>
          <p>Produção mensal por colaborador, cálculo de R$ 0,03 por tonelada e validação automática de aptidão.</p>
        </div>
        <div class="bonus-tabs">
          <button class="bonus-tab active" type="button" data-tab="producao">Produção</button>
          <button class="bonus-tab" type="button" data-tab="auditoria">Auditoria</button>
        </div>
      </div>
      <div class="bonus-periodo" id="bonusPeriodo"></div>
      <div id="bonusBody"></div>
    </div>`;

  renderPeriodo();
  wireHeader();
  wireSidebarBonus();
  loadData().catch(renderError);
}

initProtectedPage('Conferência · Bônus', renderContent);
