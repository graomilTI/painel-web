const __mod = {
  async mount(root){
    root.innerHTML = `
      <div class="card">
        <div class="tag">Cliente</div>
        <h2 style="margin:8px 0 0 0">Contato com Cliente</h2>
        <p class="muted" style="margin:6px 0 0 0">Estrutura pronta para evoluirmos (campos + upload + PDF).</p>
      </div>
    `;
  },
  async unmount(){}
};

export default __mod;
