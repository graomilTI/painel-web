// Página "O.S" da Logística: um único ponto com 4 abas
// (Abertura | Conferência | Ajuste | Finalização) sobre o mesmo módulo
// adm-logistica.js, em vez das antigas páginas isoladas separadas.
//
// Diferente de logistica-admin-entry.js (que fixa UMA seção via CSS e esconde
// o #logTabs), aqui reaproveitamos a máquina de abas do próprio adm-logistica:
// cada aba visível apenas dispara o clique no botão real correspondente do
// #logTabs (que fica oculto), então todos os loaders/ações internas continuam
// funcionando sem duplicação de lógica. Ver [[painel-web-abertura-os-menu-escondido]].

const TABS = [
  { key: 'abertura',    realTab: 'abertura_os',  label: 'Abertura' },
  { key: 'conferencia', realTab: 'conferencias', label: 'Conferência' },
  { key: 'ajuste',      realTab: 'ajuste',       label: 'Ajuste' },
  { key: 'finalizacao', realTab: 'finalizacao',  label: 'Finalização' },
];

document.documentElement.classList.add('logistica-os-page');

const style = document.createElement('style');
style.id = 'logistica-os-style';
style.textContent = `
  /* Esconde as abas e os KPIs originais do painel monolítico. A barra de
     filtros (.filters-grid) é mantida porque a aba Finalização depende dela
     (filtro de data, que por padrão é "hoje"); ela é exibida só nessa aba. */
  .logistica-os-page #logTabs,
  .logistica-os-page #logStats,
  .logistica-os-page #logFeedback { display:none!important; }
  /* Só as 4 seções desta página participam; as demais nunca aparecem */
  .logistica-os-page #section-os,
  .logistica-os-page #section-fob,
  .logistica-os-page #section-classificadores,
  .logistica-os-page #section-exportacoes,
  .logistica-os-page #section-relatorios { display:none!important; }
  /* Conferência = só os laudos anexados: esconde o resumo operacional (Cargas/FOB/NHE) */
  .logistica-os-page #section-conferencias > .section-head,
  .logistica-os-page #logConferenciasList { display:none!important; }
  /* Cabeçalho compacto: só a barra de abas + reload (o título "O.S" já está na topbar) */
  .logistica-os-page #logisticaOsHeader { padding:10px 14px!important; }
  .logistica-os-page #logisticaOsHeader .los-bar { display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap; }
  .logistica-os-page #logisticaOsHeader .log-tabs { margin:0; }
  .logistica-os-page #logisticaOsHeader #logisticaOsReload { flex:0 0 auto; }
  /* KPIs "Pendentes/Cadastradas" da aba Abertura: .metric/.card globais são
     pensados pra hero cards de página inteira (fonte 40px+, padding 18px) —
     gigantescos demais pra um resumo dentro de uma aba. Compacta só aqui,
     sem tocar no estilo global (usado em várias outras telas). */
  .logistica-os-page #section-abertura_os .log-mini-grid { grid-template-columns:repeat(auto-fit,minmax(140px,220px)); gap:10px; margin-bottom:12px!important; }
  .logistica-os-page #section-abertura_os .log-mini-grid article.card { padding:10px 12px; }
  .logistica-os-page #section-abertura_os .log-mini-grid article.card h3 { font-size:12px; margin:0 0 2px; text-transform:uppercase; letter-spacing:.04em; color:#9fb7aa; }
  .logistica-os-page #section-abertura_os .log-mini-grid .metric { font-size:22px; margin:0 0 2px; }
  .logistica-os-page #section-abertura_os .log-mini-grid .muted { font-size:11px; margin:0; }
`;
document.head.appendChild(style);

// O card original do painel (título + reload + abas + filtros) só interessa
// aqui pela barra de filtros da Finalização. Guardamos a referência para
// mostrá-lo apenas nessa aba.
let introCard = null;
// Limpa o filtro de data da Finalização só na 1ª abertura, pra não apagar um
// filtro que o usuário tenha definido depois ao alternar entre as abas.
let finalizacaoDataLimpa = false;

function waitFor(selector, timeout = 12000) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(selector);
    if (existing) { resolve(existing); return; }
    const obs = new MutationObserver(() => {
      const el = document.querySelector(selector);
      if (el) { obs.disconnect(); resolve(el); }
    });
    obs.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => { obs.disconnect(); reject(new Error(`Tempo esgotado aguardando ${selector}`)); }, timeout);
  });
}

function tabFromHash() {
  // O próprio adm-logistica.js grava window.location.hash com o nome REAL da
  // aba (ex.: "conferencias", "abertura_os"), não com a key curta usada aqui
  // ("conferencia", "abertura"). Sem checar o realTab também, um refresh/link
  // direto pra #conferencias caía no default "abertura" (nunca batia com a
  // key "conferencia", que tem uma letra a menos).
  const h = String(window.location.hash || '').replace('#', '').toLowerCase();
  const match = TABS.find((t) => t.key === h) || TABS.find((t) => t.realTab.toLowerCase() === h);
  return match?.key || 'abertura';
}

function activate(key) {
  const target = TABS.find((t) => t.key === key) || TABS[0];
  document.querySelectorAll('#logisticaOsTabs .log-tab').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.key === target.key);
  });
  // Dispara o clique no botão real (oculto) do #logTabs: isso deixa o próprio
  // adm-logistica.js trocar state.tab, marcar a .log-section ativa e disparar
  // o loader sob demanda daquela aba.
  const realBtn = document.querySelector(`#logTabs .log-tab[data-tab="${target.realTab}"]`);
  if (realBtn) realBtn.click();
  // Barra de filtros só faz sentido na Finalização (data/coordenação/status/busca);
  // Abertura, Conferência (laudos) e Ajuste ignoram esses filtros.
  if (introCard) introCard.style.display = target.key === 'finalizacao' ? '' : 'none';
  // A fila de finalização filtra por data e vem com "hoje" por padrão, então
  // O.S. finalizadas pelo gestor em datas anteriores não apareciam. Limpa o
  // filtro de data ao abrir a aba (mostra todas as pendentes); o usuário ainda
  // pode digitar uma data pra estreitar.
  if (target.key === 'finalizacao' && !finalizacaoDataLimpa) {
    finalizacaoDataLimpa = true;
    const dataInput = document.getElementById('logData');
    if (dataInput && dataInput.value) {
      dataInput.value = '';
      dataInput.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }
  // Não mexe no location.hash aqui: o handler interno do adm-logistica.js já
  // grava window.location.hash = state.tab (nome real da aba). Reescrever aqui
  // dispararia hashchange e criava loop/reset de aba.
}

async function setup() {
  await waitFor('#logTabs');

  document.title = 'O.S — Logística';
  const pageTitle = document.getElementById('pageTitle');
  if (pageTitle) pageTitle.textContent = 'O.S';

  introCard = document.getElementById('logTabs')?.closest('section.card') || null;
  // Esconde o cabeçalho original (título "Painel de Logística" + reload); a
  // barra de filtros dentro deste card fica, controlada por aba em activate().
  const introHead = introCard?.querySelector(':scope > .section-head');
  if (introHead) introHead.style.display = 'none';
  if (introCard) introCard.style.display = 'none';

  const content = document.getElementById('pageContent');
  const header = document.createElement('section');
  header.className = 'card mt-16';
  header.id = 'logisticaOsHeader';
  header.innerHTML = `
    <div class="los-bar">
      <div class="log-tabs" id="logisticaOsTabs">
        ${TABS.map((t) => `<button class="log-tab" data-key="${t.key}" type="button">${t.label}</button>`).join('')}
      </div>
      <button class="btn btn-secondary" id="logisticaOsReload" type="button">↻ Atualizar</button>
    </div>`;
  content.insertBefore(header, content.firstChild);

  header.querySelector('#logisticaOsTabs').addEventListener('click', (event) => {
    const btn = event.target.closest('[data-key]');
    if (!btn) return;
    activate(btn.dataset.key);
  });

  header.querySelector('#logisticaOsReload').addEventListener('click', () => {
    document.getElementById('logReload')?.click();
  });

  activate(tabFromHash());
}

function renderBootError(error) {
  console.error('[logistica-os-entry]', error);
  const content = document.getElementById('pageContent');
  if (!content) return;
  content.innerHTML = `
    <section class="card mt-16">
      <div class="log-empty">
        Não foi possível abrir <strong>O.S</strong>.<br>
        <small>${String(error?.message || error)}</small>
      </div>
    </section>`;
}

import('./adm-logistica.js?v=logistica-admin-isolado-20260723-ajuste-anexo1')
  .then(setup)
  .catch(renderBootError);
