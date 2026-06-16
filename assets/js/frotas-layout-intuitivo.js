function injectStyles() {
  if (document.getElementById('frotasIntuitiveLayoutStyles')) return;
  const style = document.createElement('style');
  style.id = 'frotasIntuitiveLayoutStyles';
  style.textContent = `
    .frotas-body{padding:20px!important}
    .speed-grid{grid-template-columns:minmax(560px,1.15fr) minmax(420px,.85fr)!important;gap:20px!important}
    .speed-panel{padding:20px!important;border-radius:16px!important}
    .speed-step-title{padding-bottom:14px;border-bottom:1px solid rgba(148,163,184,.12)}
    .speed-step-title h3{font-size:17px!important}
    .speed-step-pill{letter-spacing:.04em!important}

    .speed-import-card{padding:0!important;border:0!important;background:transparent!important;margin-bottom:24px!important}
    .speed-import-head{margin:0 0 8px!important}
    .speed-import-head h3{font-size:15px!important}
    .speed-import-actions{justify-content:flex-end}
    .speed-import-actions [data-sync-bfleet-excessos]{display:none!important}
    [data-imported-excess-count]{
      display:inline-flex;
      margin:0 0 14px!important;
      padding:5px 9px;
      border-radius:999px;
      background:rgba(34,197,94,.10);
      border:1px solid rgba(34,197,94,.22);
      color:#bbf7d0!important;
      font-weight:800;
    }

    .speed-import-card>.print-status-box{
      margin:0 0 12px!important;
      padding:14px!important;
      border-radius:12px!important;
      background:rgba(2,6,23,.32)!important;
    }
    .speed-import-card>.print-status-box strong{font-size:13px!important}
    .speed-import-card>.print-status-box p{margin-bottom:10px!important}
    .speed-import-card>.print-status-box:first-of-type{
      display:grid;
      grid-template-columns:minmax(0,1fr) auto;
      align-items:end;
      gap:8px 10px;
    }
    .speed-import-card>.print-status-box:first-of-type>strong,
    .speed-import-card>.print-status-box:first-of-type>p{grid-column:1/-1}
    .speed-import-card>.print-status-box:nth-of-type(2){
      display:grid;
      grid-template-columns:1fr auto;
      align-items:center;
      gap:10px;
    }
    .speed-import-card>.print-status-box:nth-of-type(2) p{margin:0!important}

    .speed-sync-range{grid-template-columns:1fr 1fr!important;align-items:end!important;gap:10px!important;margin:0!important}
    .speed-sync-range+.speed-btn{margin-bottom:0}
    .speed-sync-range .speed-field label{font-size:10px!important}
    .speed-import-card>.speed-hint{display:none}

    .speed-import-list{
      max-height:none!important;
      overflow:visible!important;
      display:flex!important;
      flex-direction:column;
      gap:8px!important;
      margin-top:14px;
    }
    .speed-import-filter-note{order:0;margin:0 0 4px!important}
    .speed-import-item{order:1;padding:12px 14px!important;border-radius:12px!important}
    .speed-import-item strong{font-size:13px!important}
    .speed-import-item span{line-height:1.45}
    .speed-import-bulk{
      order:2!important;
      margin:12px 0 0!important;
      padding:14px 0 0;
      border-top:1px solid rgba(148,163,184,.14);
    }

    .speed-panel>[data-colaborador-autocomplete]{margin-top:4px}
    .speed-panel>.speed-field label{letter-spacing:.04em!important}
    .speed-panel>[data-add-record]{width:auto}
    .speed-actions{margin-bottom:22px}

    .upload-box{padding:0!important;border:0!important;background:transparent!important}
    .upload-box>.speed-field:first-child{
      padding:12px 14px;
      border:1px solid rgba(148,163,184,.12);
      border-radius:12px;
      background:rgba(2,6,23,.28);
    }
    .upload-box>.speed-field:first-child .speed-hint{display:none}
    .paste-zone{min-height:130px;display:flex;flex-direction:column;justify-content:center;border-radius:14px!important}
    .upload-actions [data-upload-prints]{min-height:48px}
    .upload-box>.print-status-box{margin-top:12px!important}
    .upload-box>.print-status-box p{line-height:1.5}

    .print-driver-pending{border-radius:12px!important}
    .print-driver-item{padding:14px 0!important}

    @media(max-width:1250px){
      .speed-grid{grid-template-columns:1fr!important}
    }
    @media(max-width:720px){
      .frotas-body,.speed-panel{padding:14px!important}
      .speed-import-card>.print-status-box:first-of-type{grid-template-columns:1fr}
      .speed-import-card>.print-status-box:first-of-type>strong,
      .speed-import-card>.print-status-box:first-of-type>p{grid-column:auto}
      .speed-sync-range{grid-template-columns:1fr!important}
      .speed-sync-range+.speed-btn{width:100%}
      .speed-import-card>.print-status-box:nth-of-type(2){display:block}
      .speed-import-actions{justify-content:flex-start}
    }
  `;
  document.head.appendChild(style);
}

function setText(node, text) {
  if (node && node.textContent !== text) node.textContent = text;
}

function enhanceScreen(root = document) {
  const shell = root.querySelector('.frotas-shell');
  if (!shell) return;

  const panels = shell.querySelectorAll('.speed-panel');
  if (panels.length < 2) return;

  setText(panels[0].querySelector('.speed-step-title h3'), '1. Sincronizar e preparar notificações');
  setText(panels[0].querySelector('.speed-step-pill'), 'semana anterior');
  setText(panels[1].querySelector('.speed-step-title h3'), '2. Enviar e conferir prints');
  setText(panels[1].querySelector('.speed-step-pill'), 'validação por OCR');

  const importHead = panels[0].querySelector('.speed-import-head h3');
  setText(importHead, 'Excessos encontrados');

  const syncBox = panels[0].querySelector('.speed-import-card>.print-status-box');
  if (syncBox) {
    setText(syncBox.querySelector('strong'), 'Período do relatório');
    const paragraph = syncBox.querySelector('p');
    setText(paragraph, 'A semana anterior é sincronizada automaticamente ao abrir esta tela.');
  }

  const infleetBox = panels[0].querySelectorAll('.speed-import-card>.print-status-box')[1];
  if (infleetBox) {
    setText(infleetBox.querySelector('strong'), 'Importação complementar');
    const paragraph = infleetBox.querySelector('p');
    setText(paragraph, 'Use apenas quando houver uma planilha exportada da Infleet.');
  }

  const syncButton = panels[0].querySelector('[data-sync-bfleet-period]');
  setText(syncButton, syncButton?.disabled ? 'Sincronizando...' : 'Sincronizar novamente');

  const refreshButton = panels[0].querySelector('[data-refresh-imported-excessos]');
  if (refreshButton) refreshButton.title = 'Recarregar registros já sincronizados';

  const importButton = panels[0].querySelector('[data-infleet-import-btn]');
  setText(importButton, 'Importar XLSX');

  const pasteTitle = panels[1].querySelector('.paste-zone strong');
  setText(pasteTitle, 'Cole ou arraste os prints aqui');

  const uploadButton = panels[1].querySelector('[data-upload-prints]');
  setText(uploadButton, uploadButton?.disabled ? uploadButton.textContent : 'Processar prints por OCR');
}

export function installIntuitiveFleetLayout(root = document) {
  injectStyles();
  enhanceScreen(root);

  const target = root.querySelector('#pageContent') || root.body;
  if (!target || target.dataset.intuitiveFleetLayoutInstalled === '1') return;
  const observer = new MutationObserver(() => enhanceScreen(root));
  observer.observe(target, { childList: true, subtree: true });
  target.dataset.intuitiveFleetLayoutInstalled = '1';
}
