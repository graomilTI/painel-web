function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function injectStyles() {
  if (document.getElementById('programacaoEtapaALinhaStyles')) return;
  const style = document.createElement('style');
  style.id = 'programacaoEtapaALinhaStyles';
  style.textContent = `
    body.prog-step-a-os #progDistribuicaoOsMount .os-lite-list{gap:6px!important;overflow-x:auto;padding-bottom:4px}
    body.prog-step-a-os #progDistribuicaoOsMount .os-lite-card{display:block!important;border-radius:12px!important;overflow:visible!important;background:rgba(2,6,23,.22)!important;border:1px solid rgba(52,211,153,.16)!important;box-shadow:none!important;min-width:1180px}
    body.prog-step-a-os #progDistribuicaoOsMount .os-a-line{display:grid;grid-template-columns:minmax(250px,1.55fr) 82px 132px minmax(250px,1.55fr) 116px 112px 132px 225px;align-items:center;gap:0;min-height:58px}
    body.prog-step-a-os #progDistribuicaoOsMount .os-a-cell{min-width:0;padding:8px 10px;border-right:1px solid rgba(148,163,184,.1);display:flex;flex-direction:column;justify-content:center;gap:2px;height:100%}
    body.prog-step-a-os #progDistribuicaoOsMount .os-a-cell:last-child{border-right:0}
    body.prog-step-a-os #progDistribuicaoOsMount .os-a-label{font-size:9px;line-height:1;text-transform:uppercase;letter-spacing:.07em;color:#64748b;font-weight:950;white-space:nowrap}
    body.prog-step-a-os #progDistribuicaoOsMount .os-a-value{font-size:12px;line-height:1.18;color:#e5e7eb;font-weight:850;overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
    body.prog-step-a-os #progDistribuicaoOsMount .os-a-value.strong{font-size:13px;color:#f8fafc;font-weight:950}
    body.prog-step-a-os #progDistribuicaoOsMount .os-a-value.saldo{display:inline-flex;align-items:center;justify-content:center;width:max-content;max-width:100%;border-radius:999px;padding:4px 8px;background:rgba(22,163,74,.18);border:1px solid rgba(134,239,172,.22);color:#bbf7d0;font-weight:950;white-space:nowrap}
    body.prog-step-a-os #progDistribuicaoOsMount .os-a-actions{display:flex!important;flex-direction:column!important;align-items:center!important;justify-content:center!important;gap:5px!important;padding:7px 8px!important}
    body.prog-step-a-os #progDistribuicaoOsMount .os-a-actions .os-lite-buttons{display:flex!important;gap:4px!important;flex-wrap:nowrap!important;justify-content:center!important}
    body.prog-step-a-os #progDistribuicaoOsMount .os-a-actions .os-lite-chip{font-size:10px!important;padding:4px 8px!important}
    body.prog-step-a-os #progDistribuicaoOsMount .os-a-actions .os-lite-btn{padding:6px 8px!important}
    @media(max-width:900px){
      body.prog-step-a-os #progDistribuicaoOsMount .os-lite-card{min-width:1120px}
      body.prog-step-a-os #progDistribuicaoOsMount .os-a-line{grid-template-columns:minmax(230px,1.5fr) 78px 125px minmax(230px,1.5fr) 105px 105px 125px 215px}
    }
  `;
  document.head.appendChild(style);
}

function getText(root, selector) {
  return String(root.querySelector(selector)?.textContent || '').trim();
}

function parseLocal(routeText) {
  return String(routeText || '')
    .replace(/^Emb\.?:\s*/i, '')
    .replace(/^Local de embarque:\s*/i, '')
    .split('→')[0]
    .trim() || '-';
}

function parseContratoProduto(text) {
  const raw = String(text || '').trim();
  const clean = raw.replace(/^Contrato\s*/i, '').trim();
  const parts = clean.split('•').map((p) => p.trim()).filter(Boolean);
  return {
    contrato: parts[0] || '-',
    produto: parts[1] || '-',
  };
}

function cell(label, value, extraClass = '') {
  return `
    <div class="os-a-cell">
      <span class="os-a-label">${escapeHtml(label)}</span>
      <span class="os-a-value ${extraClass}">${escapeHtml(value || '-')}</span>
    </div>
  `;
}

function compactCard(card) {
  if (!document.body.classList.contains('prog-step-a-os')) return;
  if (!card || card.dataset.osLinhaUnica === '1') return;

  const cliente = getText(card, '.os-lite-client .os-lite-title') || '-';
  const os = getText(card, '.os-lite-head .os-lite-title') || '-';
  const saldo = getText(card, '.os-lite-rembox .os-lite-chip') || '-';
  const routeTexts = [...card.querySelectorAll('.os-lite-client .os-lite-route')].map((el) => el.textContent || '');
  const local = parseLocal(routeTexts[0]);
  const { contrato, produto } = parseContratoProduto(routeTexts[1]);
  const buttonsHtml = card.querySelector('.os-lite-footer .os-lite-buttons')?.innerHTML || '';
  const statusHtml = card.querySelector('.os-lite-footer .os-lite-chip')?.outerHTML || '';

  card.dataset.osLinhaUnica = '1';
  card.innerHTML = `
    <div class="os-a-line">
      ${cell('Cliente', cliente, 'strong')}
      ${cell('OS', os, 'strong')}
      ${cell('Contrato', contrato)}
      ${cell('Local de Embarque', local)}
      ${cell('Produto', produto)}
      <div class="os-a-cell"><span class="os-a-label">Saldo</span><span class="os-a-value saldo">${escapeHtml(saldo)}</span></div>
      ${cell('Contrato', contrato)}
      <div class="os-a-cell os-a-actions">
        <div class="os-lite-buttons">${buttonsHtml}</div>
        ${statusHtml}
      </div>
    </div>
  `;
}

function compactAll() {
  injectStyles();
  if (!document.body.classList.contains('prog-step-a-os')) return;
  document.querySelectorAll('#progDistribuicaoOsMount .os-lite-card[data-os-id]').forEach(compactCard);
}

function start() {
  injectStyles();
  const observer = new MutationObserver(() => setTimeout(compactAll, 80));
  observer.observe(document.body, { childList: true, subtree: true });
  document.addEventListener('DOMContentLoaded', compactAll);
  setTimeout(compactAll, 300);
  setTimeout(compactAll, 900);
}

start();
