const __mod = {
  async mount(root){
    root.innerHTML = `
      <div class="card">
        <div class="tag">ADM</div>
        <h2 style="margin:8px 0 0 0">Módulo ADM</h2>
        <p class="muted" style="margin:6px 0 0 0">Separado por rota para não conflitar com outros menus.</p>
      </div>
    `;
  },
  async unmount(){}
};

export default __mod;
