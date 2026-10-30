// Dashboard de Frotas: filtros (coordenação, supervisão, período), o que pede ação hoje, frota, manutenção, multas,
// conduta, CNH e distribuição por coordenação. Cada bloco carrega sozinho (e pode falhar sozinho).
// Cálculos em modules/frotas-dashboard-regras.js, consultas em -dados.js, HTML em -html.js, mapa em -mapa.js.
// O CSS fica só em assets/css/frotas-dashboard.css (a navegação suave o carrega pelo menuConfig.js).
import { initProtectedPage } from './pageInit.js';
import { supabase as sbDefault } from './supabaseClient.js';
import * as R from './modules/frotas-dashboard-regras.js?v=20261030-dash7';
import * as D from './modules/frotas-dashboard-dados.js?v=20261030-dash7';
import * as H from './modules/frotas-dashboard-html.js?v=20261030-dash7';

const CHAVE_FILTROS = 'frotas_dashboard_filtros_v1';
// Quais consultas cada bloco refaz quando o usuário clica em "Tentar novamente".
const BLOCOS = { veiculos: ['veiculos', 'rastreadores', 'removidos'], multas: ['multas'], manut: ['manut'], venc: ['venc'], cnh: ['motoristas'], conduta: ['exc', 'fora', 'excPend'], sinistros: ['sinistros'], checklist: ['checklist'], mensal: ['mensal'] };

function lerFiltros() {
  const padrao = { coordenacao: '', supervisao: '', periodo: 'mes' };
  try {
    const salvo = JSON.parse(localStorage.getItem(CHAVE_FILTROS) || '{}');
    return { ...padrao, ...Object.fromEntries(Object.entries(salvo).filter(([k, v]) => k in padrao && typeof v === 'string')) };
  } catch (_) { return padrao; }
}
function salvarFiltros(f) {
  try { localStorage.setItem(CHAVE_FILTROS, JSON.stringify(f)); } catch (_) { /* navegação privada: segue sem lembrar */ }
}

function renderFrotasDashboard(container, opts = {}) {
  const sb = opts.supabase || sbDefault;
  const hoje = R.hojeISO();
  const st = { filtro: lerFiltros(), dados: {}, carga: {}, seq: {}, atualizadoEm: '' };
  if (!R.PERIODOS.some((p) => p.id === st.filtro.periodo)) st.filtro.periodo = 'mes';

  container.classList.add('fd-host');
  container.innerHTML = `
<div class="fd-wrap">
  <nav class="fd-tabs">
    <button class="fd-tab active">Dashboard</button>
    <button class="fd-tab" data-nav="frotas">Notificação</button>
    <button class="fd-tab" data-nav="frotas-veiculos">Veículos</button>
    <button class="fd-tab" data-nav="frotas-manutencao-grupo">Manutenção</button>
    <button class="fd-tab" data-nav="frotas-multas">Multas</button>
    <button class="fd-tab" data-nav="frotas-sinistros">Sinistros</button>
    <button class="fd-tab" data-nav="frotas-cadastros">Cadastros</button>
    <button class="fd-tab" data-nav="frotas-historico">Histórico</button>
    <div class="fd-tabs-dir" id="fd-upd"></div>
  </nav>
  <div class="fd-body">
    <div class="fd-filtros" id="fd-filtros"></div>
    <div class="fd-status-grid" id="fd-kpis"></div>
    <div class="fd-card" id="fd-dist"></div>
    <div class="fd-row fd-row-pend">
      <div class="fd-card" id="fd-mensal"></div>
      <div class="fd-card" id="fd-comp"></div>
    </div>
    <div class="fd-row fd-row-2">
      <div class="fd-col">
        <div class="fd-card" id="fd-manut"></div>
        <div class="fd-card" id="fd-multas"></div>
        <div class="fd-card" id="fd-checklist"></div>
      </div>
      <div class="fd-col">
        <div class="fd-card" id="fd-sinistros"></div>
        <div class="fd-card" id="fd-conduta"></div>
        <div class="fd-card" id="fd-cnh"></div>
      </div>
    </div>
  </div>
</div>
`;

  const $ = (id) => container.querySelector(`#${id}`);
  const periodo = () => R.periodo(st.filtro.periodo, hoje);
  const filtroAtivo = () => Boolean(st.filtro.coordenacao || st.filtro.supervisao);

  const carregadores = {
    veiculos: () => D.carregarVeiculos(sb),
    rastreadores: () => D.carregarRastreadores(sb),
    removidos: () => D.carregarRemovidos(sb),
    multas: () => D.carregarMultas(sb),
    excPend: () => D.carregarExcessosPendentes(sb),
    exc: () => D.carregarEventos(sb, 'frotas_excesso_velocidade', periodo().antIni, periodo().fim),
    fora: () => D.carregarEventos(sb, 'frotas_fora_horario', periodo().antIni, periodo().fim),
    motoristas: () => D.carregarMotoristas(sb),
    manut: () => D.carregarManutencoes(sb, [periodo().antIni, R.inicioJanelaCusto(hoje)].sort()[0], [periodo().fim, hoje].sort()[1]),
    sinistros: () => D.carregarSinistros(sb),
    checklist: () => D.carregarChecklists(sb),
    mensal: () => D.carregarMensal(sb, R.inicioSerieMensal(hoje)),
    venc: () => D.carregarVencimentos(sb),
  };

  // Estado de um bloco que depende de várias consultas (e dos veículos, quando há filtro de coordenação/supervisão).
  const estado = (...chaves) => {
    const todas = filtroAtivo() ? [...chaves, 'veiculos'] : chaves;
    if (todas.some((k) => st.carga[k] == null || st.carga[k] === 'carregando')) return 'carregando';
    return todas.some((k) => st.carga[k] === 'erro') ? 'erro' : 'ok';
  };

  // Troca o HTML só se mudou (preserva o foco e evita piscar); devolve se trocou.
  function pintar(id, html) {
    const el = $(id);
    if (!el || el.dataset.h === html) return false;
    const foco = container.contains(document.activeElement) && el.contains(document.activeElement) ? document.activeElement.id : '';
    el.innerHTML = html;
    el.dataset.h = html;
    if (foco) el.querySelector(`#${foco}`)?.focus();
    return true;
  }

  async function carregar(chave) {
    const n = (st.seq[chave] = (st.seq[chave] || 0) + 1);
    st.carga[chave] = 'carregando';
    desenhar();
    try {
      const dados = await D.comTimeout(carregadores[chave](), 30000, chave);
      if (st.seq[chave] !== n) return; // chegou depois de uma consulta mais nova (troca de período)
      st.dados[chave] = dados;
      st.carga[chave] = 'ok';
    } catch (err) {
      if (st.seq[chave] !== n) return;
      console.warn(`[frotas-dashboard] ${chave} indisponível:`, err?.message || err);
      st.carga[chave] = 'erro';
    }
    if (Object.values(st.carga).every((c) => c !== 'carregando')) {
      st.atualizadoEm = new Date().toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });
    }
    desenhar();
  }
  const carregarVarias = (chaves) => Promise.all(chaves.map(carregar));

  function desenhar() {
    const d = st.dados;
    const per = periodo();
    const esc = R.escopo(d.veiculos || [], st.filtro);
    const ok = (...k) => estado(...k) === 'ok';

    const estadoRastreio = estado('rastreadores', 'removidos');
    const controle = estadoRastreio === 'ok' ? R.controleRastreio(d.rastreadores, d.removidos) : null;
    const frota = ok('veiculos') ? R.resumoFrota(esc.veiculos, controle) : null;
    const multas = ok('multas') ? R.resumoMultas(d.multas, hoje, esc) : null;
    const pendentes = ok('excPend') ? R.excessosPendentes(d.excPend.linhas, esc) : null;
    const eventos = (chave) => {
      if (!ok(chave)) return null;
      const r = R.resumoEventos(d[chave].linhas, per, esc);
      return { ...r, variacao: R.variacao(r.atual, r.anterior) };
    };
    const excessos = eventos('exc');
    const foraHorario = eventos('fora');
    const manut = ok('manut') ? R.resumoManutencao(d.manut, per, esc) : null;
    const venc = ok('venc') ? R.resumoVencimentos(d.venc.painel, d.venc.planosTipo, esc) : null;
    const cnh = ok('motoristas') ? R.resumoCnh(d.motoristas, hoje, esc) : null;
    const reinc = ok('exc', 'fora') ? R.reincidentes(d.exc.linhas, d.fora.linhas, per, esc) : [];
    const semanas = ok('exc', 'fora') ? R.ocorrenciasPorSemana(d.exc.linhas, d.fora.linhas, per, esc) : null;
    const custoMeses = ok('manut') ? R.custoMensal(d.manut.concluidas, hoje, esc) : null;
    const sinistros = ok('sinistros') ? R.resumoSinistros(d.sinistros, per, hoje, esc) : null;
    if (sinistros) sinistros.variacao = R.variacao(sinistros.novos, sinistros.novosAnterior);
    const checklists = ok('checklist') ? R.resumoChecklists(d.checklist, hoje, esc) : null;

    /* Atualização (linha das abas) e filtros */
    pintar('fd-upd', H.atualizacao(st.atualizadoEm));
    const opcoes = R.opcoesFiltro(d.veiculos || [], st.filtro.coordenacao);
    pintar('fd-filtros', H.barraFiltros({ ...opcoes, filtro: st.filtro }));

    /* Frota: números, mapa por coordenação e composição */
    const estadoFrota = estado('veiculos');
    pintar('fd-kpis', estadoFrota === 'erro' ? H.blocoErro('veiculos') : H.blocoKpis(frota, estadoFrota, estadoRastreio));
    pintar('fd-comp', H.secao('Composição da frota', H.blocoComposicao(frota, estadoFrota, estadoRastreio), { href: 'frotas-veiculos', acao: 'Veículos' }));
    pintar('fd-mensal', H.secao('Multas e excessos de velocidade por mês', H.blocoMensal({
      serie: ok('mensal') ? R.serieMensal(d.mensal, hoje, st.filtro) : null, estado: estado('mensal'),
    }), { href: 'frotas-multas', acao: 'Multas' }));

    /* Manutenção */
    pintar('fd-manut', H.secao('Manutenção', H.blocoManutencao({
      manut, venc, custoMeses, estadoManut: estado('manut'), estadoVenc: estado('venc'), periodo: per,
      variacaoCusto: manut ? R.variacao(manut.atual.custo, manut.anterior.custo) : null,
    }), { href: 'frotas-manutencao-grupo', selo: H.seloDe([[venc?.vencidos, 'vencidos', 'red'], [manut?.urgentes, 'urgentes', 'amber']]) }));

    /* Sinistros */
    pintar('fd-sinistros', H.secao('Sinistros', H.blocoSinistros({ sinistros, estado: estado('sinistros') }), {
      href: 'frotas-sinistros',
      selo: H.seloDe([[sinistros?.comPrazo, 'com prazo', 'red']], sinistros ? `${sinistros.andamento} em andamento` : ''),
    }));

    /* Multas */
    pintar('fd-multas', H.secao('Multas', H.blocoMultas({ multas, estado: estado('multas') }), {
      href: 'frotas-multas',
      selo: H.seloDe([[multas?.semCondutor, 'sem condutor', 'red'], [multas?.prazoCurto, 'prazo curto', 'red'], [multas?.aNotificar, 'a notificar', 'amber']]),
    }));

    /* Conduta */
    pintar('fd-conduta', H.secao('Conduta no trânsito', H.blocoConduta({
      excessos, foraHorario, pendentes, reinc, semanas, periodo: per,
      estado: estado('exc', 'fora'), estadoPendentes: estado('excPend'), truncado: Boolean(d.excPend?.truncado),
    }), { href: 'frotas', acao: 'Notificação', selo: H.seloDe([[pendentes, 'a notificar', 'amber']]) }));

    /* CNH */
    pintar('fd-cnh', H.secao('Habilitação (CNH)', H.blocoCnh({ cnh, estado: estado('motoristas') }), {
      href: 'frotas-motoristas',
      selo: H.seloDe([[cnh?.vencidas, 'vencida(s)', 'red'], [cnh?.vencendo, 'vencendo', 'amber']]),
    }));

    /* Checklists */
    pintar('fd-checklist', H.secao('Checklists', H.blocoChecklists({ checklists, estado: estado('checklist') }), {
      href: 'frotas-cadastros', acao: 'Cadastros', selo: H.seloDe([[checklists?.vencidos, 'vencidos', 'amber']]),
    }));

    /* Coordenações: sempre a frota toda, para dar para trocar de coordenação com um clique */
    const todas = d.veiculos ? R.resumoFrota(d.veiculos) : null; // só total e coordenações: não depende do controle de rastreadores
    pintar('fd-dist', H.secao('Frota por coordenação', H.blocoCoordenacoes({
      porCoordenacao: todas?.porCoordenacao || [], total: todas?.total || 0, selecionada: st.filtro.coordenacao,
      estado: st.carga.veiculos === 'erro' ? 'erro' : st.carga.veiculos === 'ok' ? 'ok' : 'carregando',
    }), { href: 'frotas-veiculos', acao: 'Veículos' }));
  }

  /* ── Eventos ── */
  container.addEventListener('click', (e) => {
    const alvo = e.target.closest('[data-nav],[data-refresh],[data-retry],[data-limpar],[data-coord]');
    if (!alvo) return;
    if (alvo.dataset.nav) window.location.assign(H.panelUrl(alvo.dataset.nav));
    else if (alvo.hasAttribute('data-refresh')) carregarVarias(Object.keys(carregadores));
    else if (alvo.dataset.retry) carregarVarias(BLOCOS[alvo.dataset.retry] || []);
    else if (alvo.hasAttribute('data-limpar')) { st.filtro.coordenacao = ''; st.filtro.supervisao = ''; salvarFiltros(st.filtro); desenhar(); }
    else if (alvo.dataset.coord) {
      st.filtro.coordenacao = st.filtro.coordenacao === alvo.dataset.coord ? '' : alvo.dataset.coord;
      st.filtro.supervisao = '';
     
      salvarFiltros(st.filtro);
      desenhar();
    }
  });
  container.addEventListener('change', (e) => {
    const id = e.target.id;
    if (id === 'fd-f-coord') { st.filtro.coordenacao = e.target.value; st.filtro.supervisao = ''; }
    else if (id === 'fd-f-sup') st.filtro.supervisao = e.target.value;
    else if (id === 'fd-f-periodo') st.filtro.periodo = e.target.value;
    else return;
    salvarFiltros(st.filtro);
    if (id === 'fd-f-periodo') carregarVarias(['exc', 'fora', 'manut']);
    else desenhar();
  });

  desenhar();
  carregarVarias(Object.keys(carregadores));
}

export function renderContent(content, ctx) {
  renderFrotasDashboard(content, { supabase: sbDefault, auth: ctx });
}

initProtectedPage('Dashboard de Frotas', renderContent);
