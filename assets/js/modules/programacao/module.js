const __mod = {
  async mount(root){
    const user = window.Auth.get();

    root.innerHTML = `
      <div class="card">
        <div class="tag">Programação</div>
        <h2 style="margin:8px 0 0 0">Programação do dia</h2>
        <p class="muted" style="margin:6px 0 14px 0">Carrega o contexto do backend (99) para validar integração.</p>

        <div class="row" style="flex-wrap:wrap;gap:10px;align-items:flex-end">
          <div style="min-width:220px">
            <label class="label">Data referência</label>
            <input id="dataRef" class="input" placeholder="dd/mm/aaaa" />
          </div>
          <button id="btnDataPadrao" class="btn secondary">Data padrão</button>
          <button id="btnCarregar" class="btn">Carregar contexto</button>
        </div>

        <div id="out" style="margin-top:16px"></div>
      </div>
    `;

    const out = root.querySelector('#out');
    const dataRef = root.querySelector('#dataRef');
    const btnDataPadrao = root.querySelector('#btnDataPadrao');
    const btnCarregar = root.querySelector('#btnCarregar');

    const api = window.API;

    btnDataPadrao.addEventListener('click', async () => {
      try{
        window.setLoading(btnDataPadrao, true);
        const r = await api.post('getDataPadrao', { token: user.token });
        if(r && r.ok && r.data) dataRef.value = r.data;
        window.toast('Data padrão carregada.', 'ok');
      }catch(e){
        window.toast(e.message || 'Falha ao buscar data padrão.', 'err');
      }finally{
        window.setLoading(btnDataPadrao, false);
      }
    });

    btnCarregar.addEventListener('click', async () => {
      try{
        const d = String(dataRef.value||'').trim();
        if(!d) throw new Error('Informe a Data referência.');
        window.setLoading(btnCarregar, true);

        const r = await api.post('carregarContexto', { token: user.token, dataReferencia: d });
        if(!r || !r.ok) throw new Error(r?.message || 'Resposta inválida do backend.');

        const liberados = Array.isArray(r.liberados) ? r.liberados.length : 0;
        const bloqueados = Array.isArray(r.bloqueados) ? r.bloqueados.length : 0;

        out.innerHTML = `
          <div class="grid">
            <div class="card" style="padding:14px">
              <div class="muted">Liberados</div>
              <div style="font-size:28px;font-weight:800;margin-top:4px">${liberados}</div>
            </div>
            <div class="card" style="padding:14px">
              <div class="muted">Bloqueados</div>
              <div style="font-size:28px;font-weight:800;margin-top:4px">${bloqueados}</div>
            </div>
          </div>
          <div class="card" style="margin-top:12px;padding:14px">
            <div class="muted" style="margin-bottom:8px">Debug (resumo)</div>
            <pre class="pre">${escapeHtml(JSON.stringify({
              dataReferencia: r.dataReferencia,
              supervisoes_liberadas: r.supervisoes_liberadas,
              liberados: liberados,
              bloqueados: bloqueados
            }, null, 2))}</pre>
          </div>
        `;

        window.toast('Contexto carregado com sucesso.', 'ok');
      }catch(e){
        out.innerHTML = '';
        window.toast(e.message || 'Falha ao carregar contexto.', 'err');
      }finally{
        window.setLoading(btnCarregar, false);
      }
    });
  },

  async unmount(root){
    // nada por enquanto
  }
};

function escapeHtml(str){
  return String(str)
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;');
}

export default __mod;
