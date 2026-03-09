/**
 * ADM Compras — placeholder inicial
 * Aqui você vai ter tela de consulta/histórico/gestão de pedidos.
 */
(function(){
  "use strict";

  const Shared = window.ComprasShared || {};
  const getTokenFromPainel_ = Shared.getTokenFromPainel_ || function(){ return ""; };

  window.ADM_COMPRAS = {
    mount(root){
      if(!root) return;
      root.innerHTML = `
        <div class="card">
          <div class="tag">Compras (ADM)</div>
          <h2 style="margin:8px 0 0 0">Módulo de Compras — ADM</h2>
          <div class="muted" style="margin-top:10px">
            Estrutura pronta. Próximo passo: tela de histórico por data/coordenação/supervisão,
            abrir pedidos, reemitir PDF, e ações de aprovação/cancelamento.
          </div>
        </div>
      `;

      const token = getTokenFromPainel_();
      if(!token){
        console.warn("ADM Compras: token ausente (sessão não encontrada).");
      }
    }
  };
})();


/* 🔥 Solicitar Orçamento */
async function solicitarOrcamento(requestId, telefone, itens){
  return api.post({
    action: 'adm_compras_solicitarOrcamento',
    payload: { requestId, telefone, itens }
  });
}
