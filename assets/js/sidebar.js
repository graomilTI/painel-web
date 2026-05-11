
(function () {
  function renderSidebar(container) {
    if (!window.MENU_CONFIG || !window.MENU_CONFIG.adm) {
      console.error("MENU_CONFIG não carregado");
      return;
    }

    const menu = window.MENU_CONFIG.adm;

    container.innerHTML = `
      <div class="sidebar">
        ${menu.map(setor => `
          <div class="menu-setor">
            <div class="menu-title">${setor.nome}</div>
            <div class="submenu">
              ${(setor.modulos || []).map(m => `<div class="submenu-item" data-modulo="${m}">${m}</div>`).join("")}
            </div>
          </div>
        `).join("")}
      </div>
    `;
  }

  window.SIDEBAR = { renderSidebar };
})();
