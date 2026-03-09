(function(){
  function esc(s){ return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  window.HOSPEDAGEM = {
    openHome(container, opts){
      const profile = (opts.auth && opts.auth.profile) || {};
      const nome = profile.nome || profile.Nome || 'Usuário';
      container.innerHTML = `
        <div class="grid cols-2">
          <div class="card"><div class="hd"><h3 style="margin:0">Hospedagem</h3><div class="small">Base restaurada para solicitações, acompanhamentos e hospedagens avulsas.</div></div><div class="bd"><div class="notice">Módulo restaurado no padrão novo do painel.</div><div style="height:12px"></div><div class="small">Responsável atual: ${esc(nome)}</div></div></div>
          <div class="card"><div class="hd"><h3 style="margin:0">Próximos passos</h3></div><div class="bd"><div class="small">- Conectar ações reais da API</div><div class="small">- Renderizar tabela/filtros</div><div class="small">- Replicar campos do fluxo antigo</div></div></div>
        </div>`;
    }
  };
})();
