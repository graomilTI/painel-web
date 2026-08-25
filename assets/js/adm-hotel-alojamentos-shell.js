// O módulo de Hotel (antigo adm-hotel.js) foi removido — a tela Hotéis está
// zerada, aguardando reconstrução. Alojamentos continua funcionando: quem
// realmente monta o conteúdo é adm-hotel-alojamentos-v2.js (+ hospedados.js,
// separacao-modulos.js), carregados via adm-hotel-deferred.js, que injetam
// tudo dentro de #tab-alojamentos e têm seu próprio CSS. Este arquivo só
// entrega a casca mínima que esses módulos esperam encontrar: .hero-card,
// .adm-hosp-tabs e a section #tab-alojamentos.
import { initProtectedPage } from './pageInit.js';

function injectStyles() {
  if (document.getElementById('admHotelShellStyles')) return;
  const style = document.createElement('style');
  style.id = 'admHotelShellStyles';
  style.textContent = `
    .adm-hosp-tabs{display:flex;align-items:center;gap:8px;overflow-x:auto;margin:16px 0 20px;padding:9px;border:1px solid rgba(111,208,165,.13);border-radius:16px;background:rgba(4,13,9,.76);box-shadow:0 12px 34px rgba(0,0,0,.16)}
    .adm-hosp-tab{position:relative;display:inline-flex;align-items:center;gap:9px;flex:0 0 auto;width:auto!important;min-height:42px;margin-top:0!important;border:1px solid transparent;background:transparent;color:#9eaaa4;border-radius:11px;padding:10px 14px;cursor:pointer;font-weight:800;font-size:12px}
    .adm-hosp-tab.active{background:linear-gradient(180deg,rgba(0,200,122,.22),rgba(0,120,75,.16));color:#effff6;border-color:rgba(45,212,160,.28)}
    .adm-hosp-panel{display:none}
    .adm-hosp-panel.active{display:block}
  `;
  document.head.appendChild(style);
}

export function renderContent(content) {
  injectStyles();
  content.innerHTML = `
    <section class="hero-card">
      <div>
        <div class="eyebrow">Hospedagem</div>
        <h2>Alojamentos</h2>
        <p>Controle dos alojamentos próprios e locados utilizados na Programação.</p>
      </div>
      <div class="hero-badge-wrap"><span class="hero-badge">ALOJAMENTOS</span></div>
    </section>

    <div class="adm-hosp-tabs">
      <button class="adm-hosp-tab active" data-tab="alojamentos" type="button">Alojamentos</button>
    </div>

    <section id="tab-alojamentos" class="adm-hosp-panel active"></section>
  `;
}

initProtectedPage('Alojamentos', renderContent);
