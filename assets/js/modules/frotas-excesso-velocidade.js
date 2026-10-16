// Frotas — tela principal de Excesso de velocidade / Notificações.
// Extraído de modules/frotas.js em 14/10/2026 (era um único bloco autoexecutável de ~4.100 linhas).
// O código das funções e constantes foi movido sem alteração. Para publicar uma mudança em qualquer
// módulo frotas-*.js deste conjunto, troque o token ?v=20261016-frotas-hist1 em TODOS os imports internos (e os do
// carregador da página): o teste tests/frotas-modulos-versao.test.mjs garante que fiquem iguais.
import { getColaboradores } from './frotas-colaboradores.js?v=20261016-frotas-hist1';
import { setCurrentRenderOpts } from './frotas-base.js?v=20261016-frotas-hist1';
import { htmlExcessoVelocidade } from './frotas-excesso-velocidade-html.js?v=20261016-frotas-hist1';
import { ligarForaHorario, ligarModalDossie, ligarModalPrints, ligarModalRota, ligarEnvioDePrints } from './frotas-excesso-velocidade-eventos.js?v=20261016-frotas-hist1';

  // ── INFLEET IMPORT ────────────────────────────────────────────────────────

  

  

  

  

  

  // ── FIM INFLEET IMPORT ─────────────────────────────────────────────────────

  function renderExcessoVelocidade(container, opts = {}) {
    setCurrentRenderOpts(opts || {});
    const colaboradores = getColaboradores(opts);
    container.innerHTML = htmlExcessoVelocidade();

    ligarForaHorario(container, opts);
    ligarModalDossie(container, opts);
    ligarModalPrints(container);
    ligarModalRota(container);
    ligarEnvioDePrints(container);
  }

export { renderExcessoVelocidade };
