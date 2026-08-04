function injectStyles() {
  if (document.getElementById('frotasIntuitiveLayoutStyles')) return;

  const style = document.createElement('style');
  style.id = 'frotasIntuitiveLayoutStyles';
  style.textContent = `
    .frotas-body{padding:18px!important}

    .fleet-workflow{
      display:grid;
      grid-template-columns:repeat(3,minmax(0,1fr));
      gap:10px;
      margin:0 0 16px;
    }
    .fleet-workflow-step{
      position:relative;
      display:flex;
      align-items:center;
      gap:11px;
      min-height:70px;
      padding:13px 15px;
      border:1px solid rgba(148,163,184,.14);
      border-radius:16px;
      background:rgba(15,23,42,.54);
      color:#94a3b8;
    }
    .fleet-workflow-step::after{
      content:'›';
      position:absolute;
      right:-9px;
      top:50%;
      transform:translateY(-50%);
      z-index:2;
      color:#64748b;
      font-size:24px;
      line-height:1;
    }
    .fleet-workflow-step:last-child::after{display:none}
    .fleet-workflow-step.active{
      border-color:rgba(34,197,94,.42);
      background:linear-gradient(135deg,rgba(22,101,52,.42),rgba(15,23,42,.72));
      color:#dcfce7;
    }
    .fleet-workflow-step.done{border-color:rgba(34,197,94,.24);color:#bbf7d0}
    .fleet-workflow-number{
      flex:0 0 34px;
      width:34px;
      height:34px;
      display:grid;
      place-items:center;
      border-radius:50%;
      border:1px solid rgba(148,163,184,.22);
      background:rgba(2,6,23,.45);
      color:#cbd5e1;
      font-weight:950;
    }
    .fleet-workflow-step.active .fleet-workflow-number,
    .fleet-workflow-step.done .fleet-workflow-number{
      border-color:rgba(74,222,128,.55);
      background:linear-gradient(135deg,#15803d,#22c55e);
      color:#052e16;
      box-shadow:0 8px 24px rgba(34,197,94,.22);
    }
    .fleet-workflow-copy strong{display:block;color:#f8fafc;font-size:13px}
    .fleet-workflow-copy span{display:block;margin-top:3px;color:#94a3b8;font-size:11px;line-height:1.35}

    .speed-grid.fleet-workspace{
      grid-template-columns:minmax(540px,1.08fr) minmax(470px,.92fr)!important;
      gap:16px!important;
      align-items:start!important;
    }
    .speed-panel{
      padding:18px!important;
      border-radius:18px!important;
      background:linear-gradient(180deg,rgba(15,23,42,.78),rgba(8,15,30,.78))!important;
    }
    .fleet-list-panel{min-width:0}
    .fleet-detail-panel{
      min-width:0;
      position:sticky;
      top:88px;
      max-height:calc(100vh - 108px);
      overflow:auto;
      scrollbar-gutter:stable;
    }
    .fleet-detail-panel::-webkit-scrollbar,
    .speed-import-list::-webkit-scrollbar{width:8px}
    .fleet-detail-panel::-webkit-scrollbar-thumb,
    .speed-import-list::-webkit-scrollbar-thumb{
      border-radius:999px;
      background:rgba(100,116,139,.45);
    }

    .speed-step-title{
      padding-bottom:13px;
      margin-bottom:15px!important;
      border-bottom:1px solid rgba(148,163,184,.12);
    }
    .speed-step-title h3{font-size:17px!important}
    .speed-step-pill{letter-spacing:.04em!important}

    .speed-import-card{
      padding:0!important;
      border:0!important;
      background:transparent!important;
      margin-bottom:0!important;
    }
    .speed-import-head{margin:0 0 10px!important}
    .speed-import-head h3{font-size:15px!important}
    .speed-import-actions{justify-content:flex-end}
    .speed-import-actions [data-sync-bfleet-excessos]{display:none!important}
    [data-imported-excess-count]{
      display:inline-flex;
      margin:0 0 12px!important;
      padding:5px 9px;
      border-radius:999px;
      background:rgba(34,197,94,.10);
      border:1px solid rgba(34,197,94,.22);
      color:#bbf7d0!important;
      font-weight:850;
    }

    .speed-import-card>.print-status-box{
      margin:0 0 10px!important;
      padding:12px 13px!important;
      border-radius:12px!important;
      background:rgba(2,6,23,.28)!important;
    }
    .speed-import-card>.print-status-box strong{font-size:12px!important}
    .speed-import-card>.print-status-box p{font-size:11px!important;line-height:1.4!important}
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
    .speed-import-card>.speed-hint{display:none}

    .speed-sync-range{
      grid-template-columns:1fr 1fr!important;
      align-items:end!important;
      gap:10px!important;
      margin:0!important;
    }
    .speed-sync-range+.speed-btn{margin-bottom:0}
    .speed-sync-range .speed-field label{font-size:10px!important}

    .fleet-list-tools{margin:14px 0 10px}
    .fleet-kpis{
      display:grid;
      grid-template-columns:repeat(4,minmax(0,1fr));
      gap:8px;
      margin-bottom:10px;
    }
    .fleet-kpi{
      min-width:0;
      padding:10px 11px;
      border:1px solid rgba(148,163,184,.12);
      border-radius:12px;
      background:rgba(2,6,23,.34);
    }
    .fleet-kpi strong{display:block;color:#f8fafc;font-size:19px;line-height:1.05}
    .fleet-kpi span{display:block;margin-top:4px;color:#94a3b8;font-size:9px;font-weight:850;text-transform:uppercase;letter-spacing:.06em}
    .fleet-kpi.pending strong{color:#fde68a}
    .fleet-kpi.generated strong{color:#86efac}
    .fleet-kpi.selected strong{color:#93c5fd}

    .fleet-list-toolbar{
      display:grid;
      grid-template-columns:minmax(190px,1fr) 150px auto;
      gap:8px;
      align-items:center;
    }
    .fleet-search-wrap{position:relative}
    .fleet-search-wrap::before{
      content:'⌕';
      position:absolute;
      left:12px;
      top:50%;
      transform:translateY(-53%);
      color:#64748b;
      font-size:17px;
      pointer-events:none;
    }
    .fleet-list-toolbar .speed-input,
    .fleet-list-toolbar .speed-select{
      min-height:40px;
      padding:9px 11px;
      border-radius:11px;
      font-size:12px;
    }
    .fleet-search-wrap .speed-input{padding-left:34px}
    .fleet-clear-filter{
      min-height:40px!important;
      padding:8px 11px!important;
      border-radius:11px!important;
      white-space:nowrap;
    }
    .fleet-filter-result{
      display:none;
      margin:8px 0 0;
      padding:11px;
      border:1px dashed rgba(148,163,184,.2);
      border-radius:12px;
      color:#94a3b8;
      font-size:12px;
      text-align:center;
    }
    .fleet-filter-result.show{display:block}

    .speed-import-list{
      max-height:calc(100vh - 465px)!important;
      min-height:360px;
      overflow:auto!important;
      display:flex!important;
      flex-direction:column;
      gap:7px!important;
      margin-top:10px;
      padding-right:4px;
    }
    .speed-import-filter-note{order:0;margin:0 0 2px!important}
    .speed-import-item{
      order:1;
      padding:11px 12px!important;
      border-radius:12px!important;
      transition:.16s ease;
    }
    .speed-import-item:hover{transform:translateY(-1px)}
    .speed-import-item strong{font-size:12px!important;line-height:1.35}
    .speed-import-item span{line-height:1.4;font-size:10px!important}
    .speed-import-footer{margin-top:7px!important}
    .speed-import-badge{font-size:9px!important;padding:3px 6px!important}
    .speed-import-bulk{
      order:2!important;
      margin:10px 0 0!important;
      padding:12px 0 0;
      border-top:1px solid rgba(148,163,184,.14);
    }

    .fleet-detail-form{
      padding:0 0 15px;
      margin-bottom:14px;
      border-bottom:1px solid rgba(148,163,184,.12);
    }
    .fleet-detail-form>h3:first-child{font-size:14px!important;margin:0 0 10px!important}
    .fleet-detail-summary{
      display:grid;
      grid-template-columns:auto minmax(0,1fr) auto;
      gap:10px;
      align-items:center;
      margin:0 0 14px;
      padding:11px 12px;
      border:1px solid rgba(34,197,94,.18);
      border-radius:13px;
      background:linear-gradient(135deg,rgba(34,197,94,.10),rgba(2,6,23,.28));
    }
    .fleet-avatar{
      width:38px;
      height:38px;
      display:grid;
      place-items:center;
      border-radius:50%;
      background:linear-gradient(135deg,#155e75,#22c55e);
      color:#ecfeff;
      font-size:12px;
      font-weight:950;
    }
    .fleet-summary-copy{min-width:0}
    .fleet-summary-copy strong{
      display:block;
      overflow:hidden;
      text-overflow:ellipsis;
      white-space:nowrap;
      color:#f8fafc;
      font-size:13px;
    }
    .fleet-summary-copy span{display:block;margin-top:3px;color:#94a3b8;font-size:10px;line-height:1.35}
    .fleet-summary-plate{
      display:inline-flex;
      align-items:center;
      gap:6px;
      padding:7px 9px;
      border:1px solid rgba(148,163,184,.16);
      border-radius:10px;
      background:rgba(2,6,23,.30);
      color:#e2e8f0;
      font-size:11px;
      font-weight:900;
    }

    .fleet-primary-fields{
      display:grid;
      grid-template-columns:1fr 1fr;
      gap:0 10px;
    }
    .fleet-primary-fields .speed-field{margin-bottom:11px!important}
    .fleet-primary-fields .speed-field label,
    .fleet-detail-form>.speed-field label{font-size:10px!important}
    .fleet-detail-form .speed-input,
    .fleet-detail-form .speed-select,
    .fleet-detail-form .speed-textarea{border-radius:11px!important;padding:10px 11px!important;font-size:12px!important}
    .fleet-detail-form .speed-colab-status{font-size:10px!important}
    .fleet-detail-form .speed-hint{font-size:10px!important;margin-top:6px!important}
    .fleet-detail-form .speed-row{
      grid-template-columns:minmax(0,1fr) 118px 38px!important;
      gap:8px!important;
      margin-bottom:8px!important;
    }
    .fleet-detail-form .speed-row .speed-input{min-height:40px}
    .fleet-detail-form [data-add-record]{width:auto;min-height:38px;padding:8px 11px;font-size:11px}
    .fleet-detail-form .speed-actions{
      display:grid;
      grid-template-columns:1fr;
      gap:7px;
      margin:12px 0 0;
    }
    .fleet-detail-form .speed-actions .speed-btn{min-height:42px;font-size:12px}
    .fleet-detail-form .speed-divider{margin:14px 0 12px}
    .fleet-message-head{
      display:flex;
      justify-content:space-between;
      gap:10px;
      align-items:center;
      margin-bottom:8px;
    }
    .fleet-message-head h3{margin:0!important;font-size:13px!important}
    .fleet-copy-output{min-height:34px!important;padding:7px 10px!important;border-radius:10px!important;font-size:10px!important}
    .fleet-detail-form .speed-message.small{
      min-height:175px!important;
      max-height:240px;
      resize:vertical;
      line-height:1.48;
      font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
      font-size:10px!important;
    }

    .fleet-ocr-section{
      padding:0;
      border:0;
      background:transparent;
    }
    .fleet-ocr-head{
      display:flex;
      align-items:center;
      justify-content:space-between;
      gap:10px;
      margin-bottom:10px;
    }
    .fleet-ocr-head h3{margin:0!important;font-size:14px!important}
    .fleet-ocr-head span{
      color:#86efac;
      font-size:9px;
      font-weight:900;
      text-transform:uppercase;
      letter-spacing:.06em;
    }
    .upload-box{padding:0!important;border:0!important;background:transparent!important}
    .upload-box>.speed-field:first-child{
      padding:10px 12px;
      border:1px solid rgba(148,163,184,.12);
      border-radius:12px;
      background:rgba(2,6,23,.28);
    }
    .upload-box>.speed-field:first-child .speed-hint{display:none}
    .upload-box .speed-field label{font-size:10px!important}
    .upload-box .speed-input{font-size:11px!important;padding:9px 10px!important;border-radius:10px!important}
    .paste-zone{
      min-height:100px;
      display:flex;
      flex-direction:column;
      justify-content:center;
      border-radius:12px!important;
      padding:14px!important;
    }
    .paste-zone strong{font-size:13px!important}
    .paste-zone span{font-size:10px!important}
    .upload-actions [data-upload-prints]{min-height:42px;font-size:12px}
    .upload-box>.print-status-box{margin-top:10px!important}
    .upload-box>.print-status-box p{line-height:1.45;font-size:10px!important}
    .print-driver-pending{border-radius:12px!important}
    .print-driver-item{padding:12px 0!important}

    @media(max-width:1280px){
      .speed-grid.fleet-workspace{grid-template-columns:minmax(480px,1fr) minmax(420px,.9fr)!important}
      .fleet-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}
    }
    @media(max-width:1080px){
      .speed-grid.fleet-workspace{grid-template-columns:1fr!important}
      .fleet-detail-panel{position:static;max-height:none;overflow:visible}
      .speed-import-list{max-height:560px!important;min-height:320px}
    }
    @media(max-width:760px){
      .frotas-body,.speed-panel{padding:13px!important}
      .fleet-workflow{grid-template-columns:1fr}
      .fleet-workflow-step::after{display:none}
      .fleet-list-toolbar{grid-template-columns:1fr}
      .fleet-primary-fields{grid-template-columns:1fr}
      .fleet-detail-summary{grid-template-columns:auto minmax(0,1fr)}
      .fleet-summary-plate{grid-column:1/-1;justify-self:start}
      .speed-import-card>.print-status-box:first-of-type{grid-template-columns:1fr}
      .speed-import-card>.print-status-box:first-of-type>strong,
      .speed-import-card>.print-status-box:first-of-type>p{grid-column:auto}
      .speed-sync-range{grid-template-columns:1fr!important}
      .speed-sync-range+.speed-btn{width:100%}
      .speed-import-card>.print-status-box:nth-of-type(2){display:block}
      .speed-import-actions{justify-content:flex-start}
      .fleet-detail-form .speed-row{grid-template-columns:1fr!important}
      .fleet-detail-form .speed-btn-danger{width:100%;min-height:36px}
    }
  `;

  document.head.appendChild(style);
}

function setText(node, text) {
  if (node && node.textContent !== text) node.textContent = text;
}

function getInitials(name) {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return '—';
  return `${parts[0][0] || ''}${parts.length > 1 ? parts[parts.length - 1][0] : ''}`.toUpperCase();
}

function ensureWorkflow(shell) {
  const grid = shell.querySelector('.speed-grid');
  if (!grid || shell.querySelector('.fleet-workflow')) return;

  const workflow = document.createElement('div');
  workflow.className = 'fleet-workflow';
  workflow.innerHTML = `
    <div class="fleet-workflow-step active" data-fleet-step="1">
      <span class="fleet-workflow-number">1</span>
      <span class="fleet-workflow-copy"><strong>Sincronizar</strong><span>Carregue os excessos do período.</span></span>
    </div>
    <div class="fleet-workflow-step" data-fleet-step="2">
      <span class="fleet-workflow-number">2</span>
      <span class="fleet-workflow-copy"><strong>Gerar mensagem</strong><span>Selecione, confira e copie.</span></span>
    </div>
    <div class="fleet-workflow-step" data-fleet-step="3">
      <span class="fleet-workflow-number">3</span>
      <span class="fleet-workflow-copy"><strong>Arquivar prints</strong><span>Envie os comprovantes pelo OCR.</span></span>
    </div>`;

  grid.parentNode.insertBefore(workflow, grid);
}

function createListTools(listPanel, list) {
  if (!listPanel || !list || listPanel.querySelector('.fleet-list-tools')) return;

  const tools = document.createElement('div');
  tools.className = 'fleet-list-tools';
  tools.innerHTML = `
    <div class="fleet-kpis">
      <div class="fleet-kpi"><strong data-fleet-total>0</strong><span>Total</span></div>
      <div class="fleet-kpi pending"><strong data-fleet-pending>0</strong><span>Pendentes</span></div>
      <div class="fleet-kpi generated"><strong data-fleet-generated>0</strong><span>Geradas</span></div>
      <div class="fleet-kpi selected"><strong data-fleet-selected>0</strong><span>Selecionada</span></div>
    </div>
    <div class="fleet-list-toolbar">
      <div class="fleet-search-wrap"><input class="speed-input" type="search" placeholder="Buscar colaborador ou placa" data-fleet-search></div>
      <select class="speed-select" data-fleet-status-filter aria-label="Filtrar por status">
        <option value="all">Todos os status</option>
        <option value="pending">Pendentes</option>
        <option value="generated">Geradas / copiadas</option>
      </select>
      <button class="speed-btn speed-btn-soft fleet-clear-filter" type="button" data-fleet-clear-filter>Limpar</button>
    </div>
    <div class="fleet-filter-result" data-fleet-empty-filter>Nenhum registro corresponde aos filtros.</div>`;

  list.parentNode.insertBefore(tools, list);

  const apply = () => applyListFilters(listPanel);
  tools.querySelector('[data-fleet-search]')?.addEventListener('input', apply);
  tools.querySelector('[data-fleet-status-filter]')?.addEventListener('change', apply);
  tools.querySelector('[data-fleet-clear-filter]')?.addEventListener('click', () => {
    const search = tools.querySelector('[data-fleet-search]');
    const status = tools.querySelector('[data-fleet-status-filter]');
    if (search) search.value = '';
    if (status) status.value = 'all';
    apply();
  });
}

function applyListFilters(listPanel) {
  const list = listPanel?.querySelector('[data-imported-excess-list]');
  if (!list) return;

  const query = String(listPanel.querySelector('[data-fleet-search]')?.value || '').trim().toLocaleLowerCase('pt-BR');
  const status = listPanel.querySelector('[data-fleet-status-filter]')?.value || 'all';
  let visible = 0;

  list.querySelectorAll('.speed-import-item').forEach((item) => {
    const text = String(item.textContent || '').toLocaleLowerCase('pt-BR');
    const generated = item.classList.contains('generated');
    const matchesText = !query || text.includes(query);
    const matchesStatus = status === 'all' || (status === 'generated' ? generated : !generated);
    const show = matchesText && matchesStatus;
    item.hidden = !show;
    if (show) visible += 1;
  });

  const empty = listPanel.querySelector('[data-fleet-empty-filter]');
  empty?.classList.toggle('show', visible === 0 && list.querySelectorAll('.speed-import-item').length > 0);
}

function updateListStats(listPanel) {
  const list = listPanel?.querySelector('[data-imported-excess-list]');
  if (!list) return;

  const items = Array.from(list.querySelectorAll('.speed-import-item'));
  const generated = items.filter((item) => item.classList.contains('generated')).length;
  const selected = items.filter((item) => item.classList.contains('selected')).length;

  setText(listPanel.querySelector('[data-fleet-total]'), String(items.length));
  setText(listPanel.querySelector('[data-fleet-pending]'), String(Math.max(0, items.length - generated)));
  setText(listPanel.querySelector('[data-fleet-generated]'), String(generated));
  setText(listPanel.querySelector('[data-fleet-selected]'), String(selected));

  applyListFilters(listPanel);
}

function moveDetailForm(listPanel, detailPanel) {
  if (!listPanel || !detailPanel || detailPanel.querySelector('.fleet-detail-form')) return;

  const heading = Array.from(listPanel.querySelectorAll(':scope > h3')).find((node) =>
    String(node.textContent || '').toLocaleLowerCase('pt-BR').includes('dados da notificação')
  );
  if (!heading) return;

  const form = document.createElement('section');
  form.className = 'fleet-detail-form';

  let cursor = heading;
  while (cursor) {
    const next = cursor.nextSibling;
    form.appendChild(cursor);
    cursor = next;
  }

  const uploadBox = detailPanel.querySelector('.upload-box');
  detailPanel.insertBefore(form, uploadBox || null);

  const summary = document.createElement('div');
  summary.className = 'fleet-detail-summary';
  summary.innerHTML = `
    <span class="fleet-avatar" data-fleet-avatar>—</span>
    <span class="fleet-summary-copy"><strong data-fleet-summary-name>Selecione uma notificação</strong><span data-fleet-summary-meta>Os dados aparecerão aqui para conferência.</span></span>
    <span class="fleet-summary-plate" data-fleet-summary-plate>🚙 —</span>`;
  heading.insertAdjacentElement('afterend', summary);

  const primaryGrid = document.createElement('div');
  primaryGrid.className = 'fleet-primary-fields';
  summary.insertAdjacentElement('afterend', primaryGrid);

  const fields = [
    form.querySelector('[data-colaborador-autocomplete]'),
    form.querySelector('[data-speed-plate]')?.closest('.speed-field'),
    form.querySelector('[data-notification-date]')?.closest('.speed-field'),
    form.querySelector('[data-speed-city-date]')?.closest('.speed-field')
  ].filter(Boolean);
  fields.forEach((field) => primaryGrid.appendChild(field));

  const messageHeading = Array.from(form.querySelectorAll(':scope > h3')).find((node) =>
    String(node.textContent || '').toLocaleLowerCase('pt-BR').includes('mensagem gerada')
  );
  if (messageHeading && !messageHeading.closest('.fleet-message-head')) {
    const head = document.createElement('div');
    head.className = 'fleet-message-head';
    messageHeading.parentNode.insertBefore(head, messageHeading);
    head.appendChild(messageHeading);

    const copy = document.createElement('button');
    copy.className = 'speed-btn speed-btn-soft fleet-copy-output';
    copy.type = 'button';
    copy.textContent = 'Copiar mensagem';
    copy.addEventListener('click', async () => {
      const output = form.querySelector('[data-speed-output]');
      const text = String(output?.value || '').trim();
      if (!text) return;
      try {
        await navigator.clipboard.writeText(text);
        copy.textContent = 'Copiada ✓';
        window.setTimeout(() => { copy.textContent = 'Copiar mensagem'; }, 1400);
      } catch (_) {
        output?.focus();
        output?.select();
        document.execCommand('copy');
      }
    });
    head.appendChild(copy);
  }

  form.addEventListener('input', () => updateDetailSummary(detailPanel));
  form.addEventListener('change', () => updateDetailSummary(detailPanel));
}

function wrapOcrSection(detailPanel) {
  if (!detailPanel || detailPanel.querySelector('.fleet-ocr-section')) return;

  const uploadBox = detailPanel.querySelector('.upload-box');
  if (!uploadBox) return;

  const section = document.createElement('section');
  section.className = 'fleet-ocr-section';
  detailPanel.insertBefore(section, uploadBox);

  const head = document.createElement('div');
  head.className = 'fleet-ocr-head';
  head.innerHTML = '<h3>Arquivar prints por OCR</h3><span>Etapa final</span>';
  section.appendChild(head);

  let cursor = uploadBox;
  while (cursor) {
    const next = cursor.nextSibling;
    section.appendChild(cursor);
    cursor = next;
  }
}

function updateDetailSummary(detailPanel) {
  if (!detailPanel) return;

  const name = String(detailPanel.querySelector('[data-speed-name]')?.value || '').trim();
  const plate = String(detailPanel.querySelector('[data-speed-plate]')?.value || '').trim().toUpperCase();
  const rows = Array.from(detailPanel.querySelectorAll('[data-speed-records] [data-speed-record]'));
  const speeds = rows
    .map((row) => Number(String(row.querySelector('[data-speed-value]')?.value || '').replace(',', '.')))
    .filter(Number.isFinite);
  const maxSpeed = speeds.length ? Math.max(...speeds) : null;

  setText(detailPanel.querySelector('[data-fleet-avatar]'), getInitials(name));
  setText(detailPanel.querySelector('[data-fleet-summary-name]'), name || 'Selecione uma notificação');
  setText(
    detailPanel.querySelector('[data-fleet-summary-meta]'),
    name
      ? `${rows.length || 0} registro(s)${maxSpeed ? ` · maior ${Math.round(maxSpeed)} km/h` : ''}`
      : 'Clique em um item da lista para preencher os dados.'
  );
  setText(detailPanel.querySelector('[data-fleet-summary-plate]'), `🚙 ${plate || '—'}`);
}

function updateWorkflow(shell) {
  const selected = Boolean(shell.querySelector('.speed-import-item.selected'));
  const generated = Boolean(String(shell.querySelector('[data-speed-output]')?.value || '').trim());
  const uploaded = shell.querySelectorAll('.upload-item,.saved-item').length > 0;

  const step1 = shell.querySelector('[data-fleet-step="1"]');
  const step2 = shell.querySelector('[data-fleet-step="2"]');
  const step3 = shell.querySelector('[data-fleet-step="3"]');

  const desired = !selected
    ? ['active', '', '']
    : !generated
      ? ['done', 'active', '']
      : !uploaded
        ? ['done', 'done', 'active']
        : ['done', 'done', 'done'];

  [step1, step2, step3].forEach((step, index) => {
    if (!step) return;
    const next = desired[index];
    step.classList.toggle('active', next === 'active');
    step.classList.toggle('done', next === 'done');
  });
}

function enhanceScreen(root = document) {
  const shell = root.querySelector('.frotas-shell');
  if (!shell) return;

  const grid = shell.querySelector('.speed-grid');
  const panels = grid?.querySelectorAll(':scope > .speed-panel');
  if (!grid || !panels || panels.length < 2) return;

  const listPanel = panels[0];
  const detailPanel = panels[1];

  grid.classList.add('fleet-workspace');
  listPanel.classList.add('fleet-list-panel');
  detailPanel.classList.add('fleet-detail-panel');

  ensureWorkflow(shell);

  setText(listPanel.querySelector('.speed-step-title h3'), 'Excessos de velocidade');
  setText(listPanel.querySelector('.speed-step-pill'), 'semana anterior');
  setText(detailPanel.querySelector('.speed-step-title h3'), 'Detalhes da notificação');
  setText(detailPanel.querySelector('.speed-step-pill'), 'fixado');

  const importHead = listPanel.querySelector('.speed-import-head h3');
  setText(importHead, 'Excessos encontrados');

  const syncBox = listPanel.querySelector('.speed-import-card>.print-status-box');
  if (syncBox) {
    setText(syncBox.querySelector('strong'), 'Período do relatório');
    setText(syncBox.querySelector('p'), 'A semana anterior é sincronizada automaticamente ao abrir esta tela.');
  }

  const infleetBox = listPanel.querySelectorAll('.speed-import-card>.print-status-box')[1];
  if (infleetBox) {
    setText(infleetBox.querySelector('strong'), 'Importação complementar');
    setText(infleetBox.querySelector('p'), 'Use apenas quando houver uma planilha exportada da Infleet.');
  }

  const syncButton = listPanel.querySelector('[data-sync-bfleet-period]');
  setText(syncButton, syncButton?.disabled ? 'Sincronizando...' : 'Atualizar');

  const refreshButton = listPanel.querySelector('[data-refresh-imported-excessos]');
  if (refreshButton) refreshButton.title = 'Recarregar registros já sincronizados';

  const importButton = listPanel.querySelector('[data-infleet-import-btn]');
  if (importButton) importButton.title = 'Importar planilha Infleet (XLSX)';

  moveDetailForm(listPanel, detailPanel);
  wrapOcrSection(detailPanel);

  const list = listPanel.querySelector('[data-imported-excess-list]');
  createListTools(listPanel, list);

  const pasteTitle = detailPanel.querySelector('.paste-zone strong');
  setText(pasteTitle, 'Cole ou arraste os prints aqui');

  const uploadButton = detailPanel.querySelector('[data-upload-prints]');
  if (uploadButton && !uploadButton.disabled) setText(uploadButton, 'Processar prints por OCR');

  updateListStats(listPanel);
  updateDetailSummary(detailPanel);
  updateWorkflow(shell);
}

export function installIntuitiveFleetLayout(root = document) {
  injectStyles();
  enhanceScreen(root);

  const target = root.querySelector('#pageContent') || root.body;
  if (!target || target.dataset.intuitiveFleetLayoutInstalled === '1') return;

  let scheduled = false;
  const scheduleEnhance = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      enhanceScreen(root);
    });
  };

  const observer = new MutationObserver(scheduleEnhance);
  observer.observe(target, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class', 'disabled']
  });

  target.addEventListener('click', () => requestAnimationFrame(() => enhanceScreen(root)));
  target.dataset.intuitiveFleetLayoutInstalled = '1';
}
