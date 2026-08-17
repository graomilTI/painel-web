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
  { key: 'abertura',    realTab: 'abertura_os',  label: 'Abertura',   listId: 'aberturaOsList' },
  { key: 'conferencia', realTab: 'conferencias', label: 'Conferência', listId: 'logConferenciasLaudos' },
  { key: 'ajuste',      realTab: 'ajuste',       label: 'Ajuste',     listId: 'logAjusteList' },
  { key: 'finalizacao', realTab: 'finalizacao',  label: 'Finalização', listId: 'logFinalizacaoList' },
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
  /* Finalização: fila compacta e decisão binária, sem etapa de observação. */
  .logistica-os-page #section-finalizacao { padding:14px 16px!important; }
  .logistica-os-page #section-finalizacao>.section-head { min-height:36px; margin-bottom:8px!important; }
  .logistica-os-page #section-finalizacao>.section-head h3 { font-size:16px!important; margin-bottom:2px!important; }
  .logistica-os-page #section-finalizacao>.section-head .muted { font-size:10px!important; }
  .los-finalizacao-summary { display:inline-flex;align-items:baseline;gap:6px;margin:0 0 8px;padding:5px 9px;border:1px solid rgba(22,215,144,.24);border-radius:9px;background:rgba(22,215,144,.08);color:#91aa9d;font-size:9px;font-weight:850;text-transform:uppercase;letter-spacing:.04em; }
  .los-finalizacao-summary strong { color:#74eeb8;font-size:15px;line-height:1; }
  .los-finalizacao-table-wrap { margin-top:0!important;border-radius:12px!important; }
  .los-finalizacao-table { min-width:1040px!important;table-layout:fixed; }
  .los-finalizacao-table th { padding:8px 10px!important;font-size:9px!important; }
  .los-finalizacao-table th:nth-child(1){width:15%}.los-finalizacao-table th:nth-child(2){width:25%}.los-finalizacao-table th:nth-child(3){width:35%}.los-finalizacao-table th:nth-child(4){width:15%}.los-finalizacao-table th:nth-child(5){width:10%;text-align:right}
  .los-finalizacao-table td { padding:9px 10px!important;vertical-align:middle!important; }
  .los-os-line { display:flex;align-items:baseline;gap:7px; }
  .los-os-line strong { color:#f1fbf6;font-size:13px; }
  .los-os-line span { color:#748a7f;font-size:9px; }
  .los-client { max-width:320px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap; }
  .los-request-tag { display:inline-block;margin-top:4px;padding:2px 6px;border-radius:999px;background:rgba(96,165,250,.11);color:#93c5fd;font-size:8px;font-weight:900;text-transform:uppercase;letter-spacing:.04em; }
  .los-route { display:grid;grid-template-columns:minmax(0,1fr) 14px minmax(0,1fr);align-items:center;gap:6px;color:#a8bcb1;font-size:10px; }
  .los-route span { overflow:hidden;text-overflow:ellipsis;white-space:nowrap; }
  .los-route b { display:block;margin-bottom:2px;color:#4f8c72;font-size:8px;text-transform:uppercase; }
  .los-route i { color:#3f7d63;font-style:normal;text-align:center; }
  .los-volume strong,.los-volume span { display:block; }.los-volume strong{color:#edf8f2;font-size:12px}.los-volume span{color:#70867b;font-size:8px}
  .los-decision-actions { display:flex;justify-content:flex-end;gap:6px; }
  .los-decision { width:32px;height:32px;border:1px solid transparent;border-radius:9px;font-size:18px;font-weight:950;line-height:1;cursor:pointer;transition:transform .14s ease,background .14s ease; }
  .los-decision:hover { transform:translateY(-1px); }.los-decision:disabled{opacity:.4;cursor:wait;transform:none}
  .los-decision.approve { border-color:rgba(22,215,144,.34);background:rgba(22,215,144,.13);color:#75edb7; }
  .los-decision.reject { border-color:rgba(248,113,113,.3);background:rgba(248,113,113,.1);color:#fca5a5; }
  @media(max-width:760px){.los-route{grid-template-columns:1fr}.los-route i{display:none}.logistica-os-page #section-finalizacao{padding:12px!important}}
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

// Aba atualmente ativa (key curta), pra saber qual esvaziar ao trocar.
let currentKey = null;

function activate(key) {
  const target = TABS.find((t) => t.key === key) || TABS[0];
  // Esvazia a tabela grande da aba que está SAINDO antes de trocar. O
  // painel monolítico só esconde a seção via CSS (display:none), deixando a
  // tabela inteira (às vezes centenas de linhas, com <th> sticky) viva no
  // DOM enquanto invisível -- isso é o que causa o "piscar com fundo preto"
  // reportado pela usuária (23/07/2026): o Chromium/Electron tem que
  // destruir/recriar a camada de composição dessa árvore grande a cada
  // troca. O Painel de Conferência (adm-conferencia.js) não sofre disso
  // porque só mantém 1 tabela por vez no DOM, recriando o conteúdo a cada
  // troca de aba em vez de esconder várias em paralelo -- aqui replicamos
  // esse padrão: some com o conteúdo pesado da aba anterior (os dados
  // continuam em memória em state.*, então reabrir essa aba só re-renderiza
  // do cache, sem precisar buscar de novo no Supabase).
  if (currentKey && currentKey !== target.key) {
    const prevTarget = TABS.find((t) => t.key === currentKey);
    const prevList = prevTarget && document.getElementById(prevTarget.listId);
    if (prevList) prevList.innerHTML = '';
  }
  currentKey = target.key;
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

import('./adm-logistica.js?v=20260817-finalizacao-check-x')
  .then(async () => {
    await setup();
    await import('./logistica-abertura-os-workflow.js?v=20260725-aprovacao1');
  })
  .catch(renderBootError);
