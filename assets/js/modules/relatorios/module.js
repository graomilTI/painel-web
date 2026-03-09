const __mod = {
  async mount(root){
    root.innerHTML = `
      <div class="card">
        <div class="tag">Relatórios</div>
        <h2 style="margin:8px 0 0 0">Relatórios</h2>
        <p class="muted" style="margin:6px 0 0 0">Aqui vamos plugar geração de PDFs e histórico.</p>
      </div>
    `;
  },
  async unmount(){}
};

export default __mod;
