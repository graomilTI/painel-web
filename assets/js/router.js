// Navegação suave (soft-nav) para um allowlist explícito de páginas.
//
// Por que existe: o painel é multi-página (sem SPA); todo clique em link
// interno hoje é um reload completo do browser, reexecutando auth+layout+
// motor de notificações antes do conteúdo da própria página aparecer. Este
// módulo intercepta cliques em páginas allowlisted, troca só #pageContent
// via history.pushState, e deixa qualquer página NÃO listada (a maioria)
// navegar normalmente — fallback automático, sem risco pras páginas fora
// do allowlist.
//
// Checklist pra promover uma página nova pro allowlist:
//   1. Confirmar que o shell HTML segue o padrão (app-shell/sidebar/topbar/#pageContent).
//   2. Confirmar um único script de módulo por página (ou consolidar antes).
//   3. Extrair a função de render pra `export async function renderContent(container, userContext)`.
//   4. Auditar a função por suposições de "só roda uma vez" (listeners/timers
//      sem guarda) e adicionar guard tipo `window.__xInited` onde precisar.
//   5. Se precisar de CSS extra, adicionar um carregamento de <link> na entrada (ver TODO extraStyles).
//   6. Adicionar entrada em SOFT_NAV_PAGES abaixo.
//   7. Testar manualmente: carga direta, navegação suave até a página, navegação
//      suave pra longe e de volta (confirma que o cache de módulo ES re-renderiza
//      certo), botão Voltar/Avançar do browser, e uma falha simulada (throw dentro
//      do renderContent) pra confirmar que cai pro reload normal em vez de travar.
//   8. Revisão normal via PR.

import { normalizePath, canOpenPath, getFirstAllowedPath } from './authGuard.js';
import { loadUserContext } from './sessionStore.js';
import { renderAppLayout } from './layout.js';
import { bindLayoutActions } from './layoutActions.js';
import { toPanelUrl } from './paths.js';

const SOFT_NAV_PAGES = new Map([
  // Fase 1
  ['patrimonios', { title: 'Patrimônios', module: () => import('./patrimonios.js') }],
  ['historico-colaboradores', { title: 'Histórico de Importações', module: () => import('./historicoColaboradores.js') }],
  ['consultar-colaboradores', { title: 'Consultar Base de Colaboradores', module: () => import('./consultarColaboradores.js') }],
  // Fase 2 — Categoria A (padrão mecânico simples)
  ['adm-conferencia', { title: 'ADM Conferência', module: () => import('./adm-conferencia.js'), extraModules: [() => import('./adm-conferencia-entry.js'), () => import('./adm-conferencia-actions-clean.js')] }],
  ['admin-auditoria', { title: 'Auditoria', module: () => import('./admin-auditoria.js') }],
  ['auditoria', { title: 'Auditoria', module: () => import('./auditoria.js') }],
  ['clinicas-sst', { title: 'Clínicas SST', module: () => import('./clinicas-sst.js') }],
  ['contato-cliente', { title: 'Contato Cliente', module: () => import('./contato-cliente.js') }],
  ['desempenho', { title: 'Desempenho', module: () => import('./desempenho.js') }],
  ['dre', { title: 'DRE', module: () => import('./dre.js') }],
  ['efetivos-sem-producao', { title: 'Efetivos sem Produção', module: () => import('./efetivosSemProducao.js') }],
  ['frotas-historico', { title: 'Frotas', module: () => import('./frotas-historico.js') }],
  ['frotas-veiculos', { title: 'Frotas · Veículos', module: () => import('./frotas-veiculos.js') }],
  ['historico-producao', { title: 'Histórico de Produção', module: () => import('./historicoProducao.js') }],
  ['hospedagem', { title: 'Hospedagem', module: () => import('./hospedagem.js') }],
  ['hotel-relatorio', { title: 'Relatório de Hospedagem', module: () => import('./hotel-relatorio.js') }],
  ['importar-colaboradores', { title: 'Importar Colaboradores', module: () => import('./importarColaboradores.js') }],
  ['importar-patrimonios', { title: 'Importar Patrimônios', module: () => import('./importarPatrimonios.js') }],
  ['metas', { title: 'METAS', module: () => import('./metas.js'), extraModules: [
    () => import('./metasDespesasAgente.js'),
    () => import('./metasNavObjetivo.js'),
    () => import('./metasCompacto2026.js'),
    () => import('./metasRemoveHeroFechamento.js'),
    () => import('./metasEstadoOrdenacao.js'),
    () => import('./metasGestaoJanelas2026.js'),
  ] }],
  ['notas-fiscais', { title: 'Notas Fiscais', module: () => import('./notas-fiscais.js') }],
  ['upload-notas-fiscais', { title: 'Enviar Notas Fiscais', module: () => import('./upload-notas-fiscais.js') }],
  ['patrimonio-status', { title: 'Status de Patrimônios', module: () => import('./patrimonioStatus.js') }],
  ['plantao', { title: 'Plantão', module: () => import('./plantao.js') }],
  ['telegrama', { title: 'Telegrama', module: () => import('./telegrama.js') }],
  ['termos', { title: 'Termos', module: () => import('./termos.js') }],
  ['ti-contatos', { title: 'TI · Contatos de Notificação', module: () => import('./ti-contatos.js') }],
  ['frotas-rastreadores', { title: 'Frotas · Rastreadores', module: () => import('./frotas-rastreadores.js') }],
  ['logs-usuarios', { title: 'Logs de Usuários', module: () => import('./logs-usuarios.js') }],
  ['auditoria-central', { title: 'Auditoria Central', module: () => import('./auditoria-central.js') }],
  ['frotas-multas', { title: 'Frotas · Multas', module: () => import('./frotas-multas.js') }],
  ['propostas', { title: 'Propostas', module: () => import('./propostas.js') }],
  ['ti-comunicacao', { title: 'TI · Comunicação', module: () => import('./ti-comunicacao.js') }],
  ['compras', { title: 'Compras', module: () => import('./compras.js?v=20260827-uniforme-situacao-ativo') }],
  ['logistica', { title: 'Logística', module: () => import('./logistica.js'), extraModules: [() => import('./logistica-abertura-upload.js'), () => import('./logistica-abertura-os-correcao.js')] }],
  ['conferencia-deslocamento', { title: 'Conferência · Deslocamento', module: () => import('./conferencia-deslocamento.js') }],
  ['frotas-roteirizacao', { title: 'Mapa de Direcionamento', module: () => import('./frotas-roteirizacao.js') }],
  ['consultar-producao', { title: 'Histórico de Produção', module: () => import('./consultarProducao.js') }],
  ['dashboard-socio', { title: 'Dashboard do Sócio', module: () => import('./dashboard-socio.js') }],
  ['notificacoes', { title: 'Notificações', module: () => import('./notificacoes.js') }],
  // Fase 2 — Categoria B (padrão próprio, verificado individualmente)
  ['admin-configuracoes', { title: 'Configurações', module: () => import('./admin-configuracoes.js') }],
  // adm-hotel fica fora da navegação suave: a tela é composta por vários
  // módulos que observam e remodelam o mesmo DOM. Reutilizá-los depois de outra
  // rota preserva guards/observers da montagem anterior e deixa Alojamentos com o
  // layout incompleto até um hard refresh. O carregamento completo é tratado em
  // pageInit.js, inclusive na troca entre #hoteis e #alojamentos pelo menu lateral.
  ['contatos', { title: 'Contatos', module: () => import('./contatos.js') }],
  ['ti-integracoes', { title: 'TI · Integrações', module: () => import('./ti-integracoes.js') }],
  ['distribuir-os', { title: 'Distribuir O.S', module: () => import('./distribuir-os.js') }],
  ['adm-patrimonio', { title: 'Relatórios de Patrimônios', module: () => import('./patrimonioRelatorios.js') }],
  ['frotas', { title: 'Frotas', module: () => import('./frotas.js') }],
  ['frotas-cadastros', { title: 'Frotas · Cadastros', module: () => import('./frotas-cadastros.js') }],
  ['frotas-manutencao-grupo', { title: 'Frotas · Manutenção', module: () => import('./frotas-manutencao-grupo.js') }],
  ['frotas-ocorrencias', { title: 'Frotas · Ocorrências', module: () => import('./frotas-ocorrencias.js') }],
  ['epi-rh', { title: 'EPI', module: () => import('./epiRh.js?v=20260826-fichas-anteriores'), extraModules: [() => import('./epiRhPresetPatch.js')] }],
  ['admin-usuarios', { title: 'Usuários e acessos', module: () => import('./admin-usuarios.js'), extraModules: [() => import('./admin-usuarios-create-password.js')] }],
  // relatorio-importador.js é compartilhado por 8 rotas — todas levam ao mesmo hub genérico de importação (confirmado: openHome() não depende da URL/rota).
  ['importar-relatorios', { title: 'Importar Relatórios', module: () => import('./relatorio-importador.js') }],
  ['relatorio-caixa-fornecedor', { title: 'Importar Relatórios', module: () => import('./relatorio-importador.js') }],
  ['relatorio-cargas', { title: 'Importar Relatórios', module: () => import('./relatorio-importador.js') }],
  ['relatorio-despesas', { title: 'Importar Relatórios', module: () => import('./relatorio-importador.js') }],
  ['relatorio-notas-fiscais', { title: 'Importar Relatórios', module: () => import('./relatorio-importador.js') }],
  ['relatorio-producao-consolidada', { title: 'Importar Relatórios', module: () => import('./relatorio-importador.js') }],
  ['relatorio-resultado-diario', { title: 'Importar Relatórios', module: () => import('./relatorio-importador.js') }],
  ['relatorio-servicos-faturados', { title: 'Importar Relatórios', module: () => import('./relatorio-importador.js') }],
  // Fase 2 — Categoria C (múltiplos scripts na origem, verificados individualmente)
  ['envios', { title: 'Correios', module: () => import('./envios.js'), extraScripts: ['https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js'] }],
  ['frotas-dashboard', { title: 'Dashboard de Frotas', module: () => import('./frotas-dashboard.js') }],
  // adm-logistica fica fora da navegação suave por enquanto: o módulo ainda possui boot próprio
  // via initProtectedPage() e, quando importado pelo router, executa duas renderizações/consultas
  // concorrentes. Isso travava a tela ao clicar no menu. Mantém navegação normal por reload.
  ['uber', { title: 'Uber · Conferência', module: () => import('./uber.js'), extraModules: [() => import('./modules/uber-despesas-sync.js')] }],
  ['adm-operacional', { title: 'Operacional ADM', module: () => import('./adm-operacional.js') }],
  ['compras-estoque', { title: 'Estoque', module: () => import('./compras-estoque.js'), extraModules: [() => import('./pwa-register.js'), () => import('./compras-estoque-agrupamento.js'), () => import('./compras-estoque-layout.js')] }],
  ['emails', { title: 'Central de E-mails', module: () => import('./emails.js'), extraModules: [() => import('./emails-secure-account.js'), () => import('./emails-layout-v3.js')] }],
  // Fase 3 (2026-07-04) — páginas críticas com muitos scripts, consolidação avaliada script a script
  ['programacao', { title: 'Programação', module: () => import('./programacao.js'), extraModules: [
    () => import('./programacao-supervisoes-cache.js'),
    () => import('./programacao-ultima-programacao-fix.js'),
    () => import('./programacao-hospedagem-colaboradores-fix.js'),
    () => import('./programacao-gestor-ajustes.js'),
    () => import('./programacao-kpi-inline-patch.js'),
    () => import('./programacao-gestor-filtro-fix.js'),
    () => import('./programacao-mobile-ui-fix.js?v=20260811-mobile-panel-toolbar-v2'),
    () => import('./programacao-gestor-fluxo-avancado.js?v=20260820-save-confirmado'),
    () => import('./programacao-lista-drawer-fixo.js'),
    () => import('./programacao-lista-drawer-ux-hotfix.js'),
    () => import('./programacao-pdf-tipo-fix.js'),
    () => import('./programacao-indisponibilidade-sync.js'),
    () => import('./programacao-indisponibilidade-rh-lock.js'),
    () => import('./programacao-regional-colaboradores-strict.js'),
    () => import('./programacao-grm-despesas-sync.js'),
  ] }],
  ['financeiro', { title: 'Financeiro', module: () => import('./financeiro.js'), extraScripts: ['https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js'], extraModules: [
    () => import('./financeiro-access.js'),
    () => import('./financeiro-adiantamentos-lote.js'),
    () => import('./financeiro-refeicoes-unicas.js'),
    () => import('./financeiro-refeicoes-arquivos.js'),
    () => import('./financeiro-refeicoes-refresh.js'),
    () => import('./financeiro-alojamentos-faturas.js'),
    () => import('./financeiro-local-date.js'),
  ] }],
  ['dashboard', { title: 'Dashboard', module: () => import('./dashboard.js'), extraModules: [() => import('./dashboard-os-card-fix.js'), () => import('./dashboardProducaoHistoryLink.js'), () => import('./dashboard-regional-map.js')] }],
  ['historico', { title: 'Histórico', module: () => import('./historico.js'), extraScripts: ['https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js'] }],
  // Fase 4 (2026-07-16) — reorganização do módulo de RH (submenus dentro de "RECURSOS HUMANOS")
  ['equipe', { title: 'Equipe', module: () => import('./equipe.js') }],
  ['exames', { title: 'Exames', module: () => import('./exames.js') }],
  ['contratos', { title: 'Contratos', module: () => import('./contratos.js') }],
  ['seguranca-trabalho', { title: 'Segurança do Trabalho', module: () => import('./segurancaTrabalho.js') }],
  ['indisponibilidade', { title: 'Indisponibilidade', module: () => import('./indisponibilidade.js'), extraModules: [() => import('./indisponibilidade-informados.js')] }],
  ['cartao-ponto', { title: 'Cartão Ponto', module: () => import('./cartaoPonto.js') }],
  ['advertencias', { title: 'Advertências', module: () => import('./advertenciasRh.js') }],
  ['holerite-pagamentos', { title: 'Folha e Holerite', module: () => import('./holeritePagamentos.js') }],
]);

function routeNameFromUrl(url) {
  const clean = normalizePath(url.pathname);
  const parts = clean.split('/').filter(Boolean);
  const painelIndex = parts.findIndex((part) => part.toLowerCase() === 'painel');
  const last = painelIndex >= 0 ? parts[painelIndex + 1] : parts[parts.length - 1];
  return normalizePath(`${last || 'dashboard'}${url.hash || ''}`);
}

function currentRouteName() {
  return routeNameFromUrl(new URL(window.location.href));
}

function shouldHandleAsNormalNavigation(event) {
  return !(
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  );
}

function findAnchor(target) {
  let el = target;
  while (el && el !== document.body) {
    if (el.tagName === 'A' && el.hasAttribute('href')) return el;
    el = el.parentElement;
  }
  return null;
}

function setTransitioning(on) {
  document.documentElement.classList.toggle('is-route-transitioning', on);
}

const loadedClassicScripts = new Set();

// Carrega um <script> clássico (CDN, não-módulo — ex: XLSX, Chart.js) uma
// única vez por sessão, deduplicado por src. Necessário porque essas libs
// expõem um global (window.XLSX/window.Chart) em vez de export ES module,
// então import() não serve — e o router nunca busca o HTML da página de
// destino, só o módulo, então a tag <script> original nunca seria carregada.
function ensureClassicScript(src) {
  if (loadedClassicScripts.has(src)) return Promise.resolve();
  const existing = document.querySelector(`script[src="${src}"]`);
  if (existing) {
    loadedClassicScripts.add(src);
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.onload = () => {
      loadedClassicScripts.add(src);
      resolve();
    };
    script.onerror = () => reject(new Error(`Falha ao carregar script externo: ${src}`));
    document.head.appendChild(script);
  });
}

function renderRoute(routeName, entry, mod, userContext) {
  if (entry.title) document.title = `${entry.title} · Painel`;

  renderAppLayout({ userContext, currentPageTitle: entry.title });
  bindLayoutActions();

  const content = document.getElementById('pageContent');
  if (content && typeof mod.renderContent === 'function') {
    content.innerHTML = '';
    // renderContent não é aguardado aqui de propósito (navegação suave não pode travar
    // no boot da próxima página), mas isso significa que um erro/rejeição dentro dela
    // deixava #pageContent em branco pra sempre, sem nenhum aviso — o innerHTML='' acima
    // já limpou a página anterior e nada preenchia o lugar se renderContent rejeitasse.
    Promise.resolve(mod.renderContent(content, userContext)).catch((error) => {
      console.error('[router] Falha ao renderizar a página:', error);
      content.innerHTML = `<section class="card mt-16"><div class="log-empty">Erro ao carregar esta página: ${String(error?.message || error)}. Tente recarregar.</div></section>`;
    });
  }

  window.scrollTo(0, 0);

  // is-route-ready/is-app-booted já estão presentes desde o boot inicial e nunca
  // são removidos aqui de propósito — reaplicá-los faria o CSS (routeFadeIn)
  // replay-ar o fade de boot a cada navegação suave, causando um flash escuro.
  requestAnimationFrame(() => {
    document.documentElement.classList.remove('is-route-transitioning');
  });
}

async function navigateSoft(routeName, href) {
  const baseRoute = routeName.split('#')[0];
  const entry = SOFT_NAV_PAGES.get(baseRoute);
  if (!entry) {
    window.location.href = href;
    return;
  }

  const userContext = loadUserContext();
  if (!userContext) {
    window.location.href = href;
    return;
  }

  if (!canOpenPath(userContext, routeName)) {
    window.location.href = toPanelUrl(getFirstAllowedPath(userContext));
    return;
  }

  setTransitioning(true);
  try {
    if (Array.isArray(entry.extraScripts)) {
      for (const src of entry.extraScripts) await ensureClassicScript(src);
    }
    if (Array.isArray(entry.extraModules)) {
      for (const load of entry.extraModules) await load();
    }
    const mod = await entry.module();
    if (typeof mod.renderContent !== 'function') {
      throw new Error(`Módulo de "${baseRoute}" não exporta renderContent`);
    }
    history.pushState({ routeName }, '', href);
    renderRoute(routeName, entry, mod, userContext);
  } catch (err) {
    console.error('[router] falha na navegação suave, caindo para reload completo:', err);
    window.location.href = href;
  }
}

function onLinkClick(event) {
  if (!shouldHandleAsNormalNavigation(event)) return;

  const anchor = findAnchor(event.target);
  if (!anchor) return;
  if (anchor.target && anchor.target !== '_self') return;
  if (anchor.hasAttribute('download')) return;
  // menuBuilder.js bloqueia cliques no link de Programação quando há FOB
  // pendente (listener próprio no <a>, fase de bubble). Como esse listener
  // roda DEPOIS deste (captura em document sempre termina antes da fase "no
  // alvo"), sem este bail-out o soft-nav dispararia em paralelo com o
  // alert+redirect do bloqueio. Deixa a navegação nativa cuidar do bloqueio.
  if (anchor.classList.contains('os-pending-blocked')) return;

  const rawHref = anchor.getAttribute('href') || '';
  if (/^(mailto:|tel:|javascript:)/i.test(rawHref)) return;

  let url;
  try {
    url = new URL(anchor.href, window.location.href);
  } catch {
    return;
  }
  if (url.origin !== window.location.origin) return;

  const targetRoute = routeNameFromUrl(url);
  const entry = SOFT_NAV_PAGES.get(targetRoute.split('#')[0]);
  if (!entry) return; // não está na allowlist — deixa a navegação nativa acontecer
  if (targetRoute === currentRouteName()) return; // mesma rota (ex: só hash mudou)

  event.preventDefault();
  navigateSoft(targetRoute, url.href);
}

function onPopState() {
  const routeName = currentRouteName();
  const baseRoute = routeName.split('#')[0];
  const entry = SOFT_NAV_PAGES.get(baseRoute);
  const userContext = loadUserContext();

  if (!entry || !userContext || !canOpenPath(userContext, routeName)) {
    window.location.reload();
    return;
  }

  setTransitioning(true);
  (async () => {
    if (Array.isArray(entry.extraScripts)) {
      for (const src of entry.extraScripts) await ensureClassicScript(src);
    }
    if (Array.isArray(entry.extraModules)) {
      for (const load of entry.extraModules) await load();
    }
    return entry.module();
  })()
    .then((mod) => renderRoute(routeName, entry, mod, userContext))
    .catch((err) => {
      console.error('[router] falha ao renderizar via popstate, recarregando:', err);
      window.location.reload();
    });
}

export function initRouter() {
  if (window.__painelRouterBound) return;
  window.__painelRouterBound = true;
  document.addEventListener('click', onLinkClick, true);
  window.addEventListener('popstate', onPopState);
}

export { shouldHandleAsNormalNavigation };
