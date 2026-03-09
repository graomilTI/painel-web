(function(){
  function esc(s){ return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  window.FROTAS = {
    openHome(container, opts){
      const profile = (opts.auth && opts.auth.profile) || {};
      const nome = profile.nome || profile.Nome || 'Usuário';
      container.innerHTML = `
        <div class="grid cols-2">
          <div class="card"><div class="hd"><h3 style="margin:0">Frotas</h3><div class="small">Base pronta para ligar a API e restaurar o fluxo real deste módulo.</div></div><div class="bd"><div class="notice">Módulo preparado para upload no padrão novo do painel.</div><div style="height:12px"></div><div class="small">Responsável atual: ${esc(nome)}</div></div></div>
          <div class="card"><div class="hd"><h3 style="margin:0">Próximos passos</h3></div><div class="bd"><div class="small">- Conectar endpoints reais</div><div class="small">- Renderizar cards e tabelas</div><div class="small">- Aplicar regras antigas do processo</div></div></div>
        </div>`;
    }
  };
})();