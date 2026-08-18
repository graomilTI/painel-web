// Ajusta a navegacao por etapas do Painel de Compras para o mesmo padrao
// de abas/janelas usado nos demais modulos. Mantem intactas as acoes e o fluxo.

const STYLE_ID = 'admCmpWindowsPatchStyles';
const TAB_CLASS = 'adm-cmp-window-tab';
const WRAP_CLASS = 'adm-cmp-window-tabs';

function injectWindowStyles() {
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .adm-cmp-tabs.${WRAP_CLASS}{
      display:flex!important;
      align-items:center!important;
      gap:8px!important;
      flex-wrap:nowrap!important;
      overflow-x:auto!important;
      margin:16px 0 0!important;
      padding:9px!important;
      border:1px solid rgba(111,208,165,.13)!important;
      border-radius:16px!important;
      background:rgba(4,13,9,.76)!important;
      box-shadow:0 12px 34px rgba(0,0,0,.16)!important;
      scrollbar-width:thin;
      scrollbar-color:rgba(111,208,165,.25) transparent;
    }

    .adm-cmp-tabs.${WRAP_CLASS} > .${TAB_CLASS}{
      position:relative!important;
      display:inline-flex!important;
      align-items:center!important;
      justify-content:center!important;
      flex:0 0 auto!important;
      width:auto!important;
      min-height:42px!important;
      margin:0!important;
      padding:10px 14px!important;
      border:1px solid transparent!important;
      border-radius:11px!important;
      background:transparent!important;
      color:#9eaaa4!important;
      box-shadow:none!important;
      font-size:12px!important;
      font-weight:800!important;
      line-height:1.1!important;
      white-space:nowrap!important;
      cursor:pointer!important;
      transition:background .16s ease,color .16s ease,border-color .16s ease,transform .16s ease,box-shadow .16s ease!important;
    }

    .adm-cmp-tabs.${WRAP_CLASS} > .${TAB_CLASS}:hover{
      color:#e9fff4!important;
      background:rgba(111,208,165,.06)!important;
      border-color:rgba(111,208,165,.08)!important;
      transform:translateY(-1px)!important;
    }

    .adm-cmp-tabs.${WRAP_CLASS} > .${TAB_CLASS}.active{
      color:#effff6!important;
      background:linear-gradient(180deg,rgba(0,200,122,.22),rgba(0,120,75,.16))!important;
      border-color:rgba(45,212,160,.28)!important;
      box-shadow:0 8px 22px rgba(0,120,75,.14)!important;
      transform:none!important;
    }

    .adm-cmp-tabs.${WRAP_CLASS} > .${TAB_CLASS}.active::after{
      content:'';
      position:absolute;
      left:14px;
      right:14px;
      bottom:4px;
      height:2px;
      border-radius:999px;
      background:#00c87a;
      box-shadow:0 0 10px rgba(0,200,122,.35);
    }

    @media(max-width:760px){
      .adm-cmp-tabs.${WRAP_CLASS}{
        margin-top:14px!important;
        padding:7px!important;
      }
      .adm-cmp-tabs.${WRAP_CLASS} > .${TAB_CLASS}{
        min-height:40px!important;
        padding:9px 12px!important;
        font-size:11px!important;
      }
    }
  `;

  // Inserir no fim do body garante que este ajuste visual prevaleca sobre
  // o <style> criado dinamicamente pelo adm-compras.js.
  (document.body || document.documentElement).appendChild(style);
}

function syncAria(tabs) {
  tabs.querySelectorAll(':scope > button').forEach((btn) => {
    btn.classList.add(TAB_CLASS);
    btn.setAttribute('role', 'tab');
    btn.setAttribute('aria-selected', btn.classList.contains('active') ? 'true' : 'false');
  });
}

function installWindowTabs() {
  const tabs = document.querySelector('.adm-cmp-tabs');
  if (!tabs) return false;
  if (tabs.dataset.windowsPatchInstalled === '1') {
    syncAria(tabs);
    return true;
  }

  injectWindowStyles();
  tabs.dataset.windowsPatchInstalled = '1';
  tabs.classList.add(WRAP_CLASS);
  tabs.setAttribute('role', 'tablist');
  tabs.setAttribute('aria-label', 'Etapas da fila de compras');
  syncAria(tabs);

  // A aba EPI e adicionada por outro patch depois do carregamento. Este observer
  // aplica automaticamente o mesmo visual e mantem aria-selected sincronizado.
  const observer = new MutationObserver(() => syncAria(tabs));
  observer.observe(tabs, {
    childList: true,
    attributes: true,
    subtree: true,
    attributeFilter: ['class']
  });

  return true;
}

function bootComprasWindows() {
  if (installWindowTabs()) return;
  const timer = setInterval(() => {
    if (installWindowTabs()) clearInterval(timer);
  }, 200);
  setTimeout(() => clearInterval(timer), 10000);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootComprasWindows, { once: true });
} else {
  bootComprasWindows();
}
