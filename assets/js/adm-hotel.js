import { initProtectedPage } from './pageInit.js';
import { supabase } from './supabaseClient.js';

const LABELS = {
  CASA: 'Casa', APARTAMENTO: 'Apartamento', POUSADA: 'Pousada', ESCRITORIO: 'Escritório',
  SOLICITADA: 'Solicitada', EM_ANALISE: 'Em análise', EM_COTACAO: 'Em cotação', RESERVADA: 'Reservada', CANCELADA: 'Cancelada', CONCLUIDA: 'Concluída',
  CHECKIN_PREVISTO: 'Check-in previsto', HOSPEDADO: 'Hospedado', CHECKOUT_HOJE: 'Checkout hoje', RENOVACAO_NECESSARIA: 'Renovação necessária', CHECKOUT_REALIZADO: 'Checkout realizado',
  HISTORICO_ATIVO: 'Ativo', HISTORICO_CHECKOUT: 'Checkout',
  NAO_INICIADO: 'Não iniciado', ENVIADO_AO_FINANCEIRO: 'Enviado ao financeiro', PAGO: 'Pago', SEM_COBRANCA: 'Sem cobrança',
  NAO_SOLICITADA: 'Não solicitada', AGUARDANDO_NF: 'Aguardando NF', NF_RECEBIDA: 'NF recebida', ENVIADO_PARA_LANCAMENTO: 'Enviado p/ lançamento', LANCADO: 'Lançado', DISPENSADO: 'Dispensado',
  ATIVO: 'Ativo', INATIVO: 'Inativo', BLOQUEADO: 'Bloqueado', PREFERENCIAL: 'Preferencial', NORMAL: 'Normal', EVITAR: 'Evitar'
};

function esc(value) { return String(value ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'","&#039;"); }
function brDate(value) { if (!value) return '-'; const [y,m,d] = String(value).slice(0,10).split('-'); return y&&m&&d ? `${d}/${m}/${y}` : String(value); }
function money(value) { return Number(value||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'}); }
function diffDays(start,end) { if (!start||!end) return 1; return Math.max(1,Math.round((new Date(`${end}T00:00:00`)-new Date(`${start}T00:00:00`))/86400000)||1); }
function slug(value) { return String(value||'').toLowerCase().replace(/[^a-z0-9]+/g,'_'); }
function label(value) { return LABELS[value]||value||'-'; }
function normalizeText(value) { return String(value||'').normalize('NFD').replace(/[̀-ͯ]/g,'').trim().toLowerCase(); }
function normalizeUF(value) { return String(value||'').trim().toUpperCase().slice(0,2); }
function toNumber(value) { const n=Number(String(value??'').replace(',','.')); return Number.isFinite(n)?n:0; }
function getHotelDiariaPorTipo(hotel,tipo='INDIVIDUAL') {
  if (!hotel) return 0;
  const keyByTipo={INDIVIDUAL:'valor_diaria_individual',DUPLO:'valor_diaria_duplo',TRIPLO:'valor_diaria_triplo',QUADRUPLO:'valor_diaria_quadruplo'};
  const key=keyByTipo[String(tipo||'INDIVIDUAL').toUpperCase()]||'valor_diaria_individual';
  return toNumber(hotel[key]??hotel.valor_diaria_padrao??hotel.valor_diaria_individual);
}

function injectStyles() {
  if (document.getElementById('admHospStyles')) return;
  const style = document.createElement('style');
  style.id = 'admHospStyles';
  style.textContent = `
    .adm-hosp-tabs{display:flex;align-items:center;gap:8px;overflow-x:auto;margin:16px 0 20px;padding:9px;border:1px solid rgba(111,208,165,.13);border-radius:16px;background:rgba(4,13,9,.76);box-shadow:0 12px 34px rgba(0,0,0,.16);scrollbar-width:thin;scrollbar-color:rgba(111,208,165,.25) transparent}.adm-hosp-tab{position:relative;display:inline-flex;align-items:center;gap:9px;flex:0 0 auto;width:auto!important;min-height:42px;margin-top:0!important;border:1px solid transparent;background:transparent;color:#9eaaa4;border-radius:11px;padding:10px 14px;cursor:pointer;font-weight:800;font-size:12px;transition:background .16s ease,color .16s ease,border-color .16s ease,transform .16s ease}.adm-hosp-tab::before{display:grid;place-items:center;width:19px;height:19px;border-radius:6px;background:rgba(255,255,255,.045);color:#8da299;font-size:11px;font-weight:900}.adm-hosp-tab[data-tab="dashboard"]::before{content:'▦'}.adm-hosp-tab[data-tab="solicitadas"]::before{content:'≡'}.adm-hosp-tab[data-tab="andamento"]::before{content:'⌂'}.adm-hosp-tab[data-tab="pagar"]::before{content:'▭'}.adm-hosp-tab[data-tab="nf"]::before{content:'✓'}.adm-hosp-tab[data-tab="hoteis"]::before{content:'H'}.adm-hosp-tab[data-tab="alojamentos"]::before{content:'A'}.adm-hosp-tab[data-tab="historico"]::before{content:'↺'}.adm-hosp-tab:hover{color:#e9fff4;background:rgba(111,208,165,.06);transform:translateY(-1px)}.adm-hosp-tab.active{background:linear-gradient(180deg,rgba(0,200,122,.22),rgba(0,120,75,.16));color:#effff6;border-color:rgba(45,212,160,.28);box-shadow:0 8px 22px rgba(0,120,75,.14)}.adm-hosp-tab.active::before{background:#00c87a;color:#032116}.adm-hosp-tab small{display:inline-grid;place-items:center;min-width:19px;height:19px;margin-left:1px;padding:0 5px;border-radius:999px;background:#f59e0b;color:#1c1200;font-weight:950;font-size:10px}.adm-hosp-tabs-sep{width:1px;align-self:stretch;min-height:28px;background:rgba(111,208,165,.14);margin:3px 3px}.adm-hosp-tabs-label{align-self:center;padding:0 3px;font-size:9px;font-weight:900;color:#627168;text-transform:uppercase;letter-spacing:.11em;white-space:nowrap}.adm-hosp-panel{display:none}.adm-hosp-panel.active{display:block}.adm-hosp-btn{width:auto!important;margin-top:0!important}.adm-hosp-table-wrap{overflow:auto;border:1px solid var(--panel-line,var(--line));border-radius:18px}.adm-hosp-table{width:100%;border-collapse:collapse;min-width:700px;background:#15152a}.adm-hosp-table th,.adm-hosp-table td{padding:12px 14px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}.adm-hosp-table th{font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.07em}.adm-hosp-table tr:hover td{background:rgba(111,208,165,.03)}.adm-hosp-actions{display:flex;gap:8px;flex-wrap:wrap}.adm-hosp-table-wrap .adm-hosp-actions{flex-wrap:nowrap}.adm-hosp-small{width:auto!important;margin-top:0!important;padding:8px 12px!important;border-radius:12px!important;font-size:12px;font-weight:800!important}.adm-hosp-status{display:inline-flex;align-items:center;padding:5px 9px;border-radius:999px;border:1px solid var(--line-2);background:rgba(255,255,255,.04);font-size:11px;font-weight:800;white-space:nowrap}.adm-hosp-status.solicitada,.adm-hosp-status.em_analise,.adm-hosp-status.em_cotacao,.adm-hosp-status.aguardando_nf{color:#fde68a;background:rgba(245,158,11,.1);border-color:rgba(245,158,11,.24)}.adm-hosp-status.reservada,.adm-hosp-status.checkin_previsto,.adm-hosp-status.hospedado,.adm-hosp-status.enviado_ao_financeiro,.adm-hosp-status.nf_recebida{color:#e2e8f0;background:rgba(21,21,42,.7);border-color:rgba(255,255,255,.14)}.adm-hosp-status.concluida,.adm-hosp-status.pago,.adm-hosp-status.lancado,.adm-hosp-status.ativo,.adm-hosp-status.preferencial{color:#bbf7d0;background:rgba(22,101,52,.22);border-color:rgba(22,101,52,.34)}.adm-hosp-status.cancelada,.adm-hosp-status.bloqueado,.adm-hosp-status.evitar{color:#fecaca;background:rgba(220,38,38,.13);border-color:rgba(220,38,38,.24)}.adm-hosp-status.checkout_hoje,.adm-hosp-status.renovacao_necessaria{color:#fed7aa;background:rgba(249,115,22,.11);border-color:rgba(249,115,22,.24)}
    .adm-hosp-form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.adm-hosp-field{display:flex;flex-direction:column;gap:7px}.adm-hosp-field.full{grid-column:1/-1}.adm-hosp-field label{font-size:13px;color:#cbd5e1;font-weight:800}.adm-hosp-field input,.adm-hosp-field textarea,.adm-hosp-field select{width:100%;border:1px solid rgba(255,255,255,0.08);background:#15152a;color:var(--text);border-radius:14px;padding:12px 13px;outline:none;color-scheme:dark}.adm-hosp-field textarea{resize:vertical;min-height:72px}.adm-hosp-field input:focus,.adm-hosp-field textarea:focus,.adm-hosp-field select:focus{border-color:var(--green-2);box-shadow:0 0 0 3px rgba(111,208,165,.12)}.adm-hosp-form-actions{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:16px}.adm-hosp-feedback{color:var(--muted);font-size:13px}.adm-hosp-danger{border-color:rgba(220,38,38,.32)!important;background:rgba(127,29,29,.45)!important;color:#fecaca!important}.adm-hosp-danger:hover{background:rgba(185,28,28,.55)!important;color:#fff!important}.adm-hosp-feedback.ok{color:#bbf7d0}.adm-hosp-feedback.err{color:#fecaca}.adm-hosp-modal{position:fixed;inset:0;z-index:9999;display:none;align-items:center;justify-content:center;padding:16px;background:rgba(2,6,23,.82);backdrop-filter:blur(6px)}.adm-hosp-modal.open{display:flex}.adm-hosp-modal-card{width:min(900px,100%);max-height:94vh;overflow:auto;background:#081611;border:1px solid var(--line-2);border-radius:24px;box-shadow:var(--shadow);padding:24px}.adm-hosp-modal-card.narrow{width:min(560px,100%)}.adm-hosp-modal-card.medium{width:min(680px,100%)}.adm-hosp-modal-card.small{width:min(480px,100%)}.adm-hosp-modal-head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;margin-bottom:0}.adm-hosp-modal-head h3{margin:0}.adm-hosp-toolbar{display:flex;justify-content:space-between;gap:12px;align-items:center;flex-wrap:wrap;margin-bottom:14px}.adm-hosp-search{min-width:220px;border:1px solid rgba(255,255,255,0.08);background:#15152a;color:var(--text);border-radius:14px;padding:10px 13px;color-scheme:dark;font-size:13px}.adm-hosp-empty{padding:20px;text-align:center;color:var(--muted)}.adm-hosp-row-note{display:block;color:var(--muted);font-size:12px;margin-top:3px}.adm-hosp-colab-list{display:grid;gap:5px}.adm-hosp-colab-item{display:grid;gap:1px;line-height:1.2}.adm-hosp-colab-name{font-weight:800;color:var(--text);font-size:13px}.adm-hosp-colab-regional{font-size:11px;color:#9ca3af}.adm-hosp-select-hint{margin-top:6px;font-size:12px;color:#93c5fd}.adm-hosp-select-hint.warn{color:#fde68a}
    .adm-section-block{margin-top:16px}.adm-section-label{font-size:11px;font-weight:900;color:#6b7280;text-transform:uppercase;letter-spacing:.07em;margin-bottom:8px}
    .adm-colab-chips{display:flex;flex-wrap:wrap;gap:8px;padding:4px 0;min-height:36px}.adm-colab-chip{display:inline-flex;align-items:center;gap:6px;background:rgba(22,101,52,.16);border:1px solid rgba(111,208,165,.22);border-radius:999px;padding:6px 10px 6px 12px}.adm-colab-chip .cn{font-size:13px;font-weight:800;color:#dcfce7}.adm-colab-chip .cr{font-size:11px;color:#9ca3af}.adm-colab-chip .cx{background:none;border:none;color:#6b7280;cursor:pointer;font-size:15px;font-weight:900;padding:0 2px;line-height:1;margin-left:2px}.adm-colab-chip .cx:hover{color:#fecaca}.adm-colab-chip.excluido{background:rgba(220,38,38,.07);border-color:rgba(220,38,38,.2);opacity:.65}.adm-colab-chip.excluido .cn{color:#fca5a5;text-decoration:line-through}.adm-colab-chip.excluido .cx{color:#fca5a5}
    .adm-colab-check-list{display:flex;flex-direction:column;gap:6px;padding:4px 0}.adm-check-colab{display:flex;align-items:center;gap:10px;cursor:pointer;padding:9px 12px;border:1px solid var(--line);border-radius:12px;background:rgba(255,255,255,.02);transition:background .1s}.adm-check-colab:hover{background:rgba(111,208,165,.06)}.adm-check-colab input[type="checkbox"]{width:16px;height:16px;accent-color:#4ade80;flex-shrink:0}.adm-check-colab span{font-size:13px;font-weight:800;color:var(--text)}
    .adm-room-wrap{margin-top:16px;border:1px solid var(--line);border-radius:18px;background:rgba(15,23,42,.34);padding:14px}.adm-room-title{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;margin-bottom:10px}.adm-room-title strong{display:block;color:#e2e2f0}.adm-room-title span{display:block;color:#9ca3af;font-size:12px;margin-top:3px}.adm-room-chip{display:inline-flex;border:1px solid rgba(111,208,165,.22);background:rgba(22,101,52,.16);color:#dcfce7;border-radius:999px;padding:4px 8px;font-size:11px;font-weight:900}.adm-room-add{display:grid;grid-template-columns:1fr 1fr .65fr .9fr auto;gap:10px;align-items:end;margin-top:12px}.adm-room-mini{display:flex;flex-direction:column;gap:6px}.adm-room-add label{font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#6b7280;font-weight:900}.adm-room-add select,.adm-room-add input{border:1px solid rgba(255,255,255,0.08);background:#15152a;color:var(--text);border-radius:12px;padding:10px 11px;outline:none;color-scheme:dark}.adm-room-list{display:grid;gap:8px;margin-top:12px}.adm-room-row{display:grid;grid-template-columns:1fr 1fr .65fr .9fr 1fr auto;gap:8px;align-items:center;border:1px solid rgba(148,163,184,.14);background:rgba(2,6,23,.34);border-radius:14px;padding:10px}.adm-room-row-pill{font-weight:900;color:#e2e2f0}.adm-room-row-type{color:#cbd5e1}.adm-room-row input{border:1px solid rgba(255,255,255,0.08);background:#15152a;color:var(--text);border-radius:12px;padding:10px 11px;outline:none;color-scheme:dark}.adm-room-row-subtotal{font-weight:900;color:#bbf7d0}.adm-room-remove{border:1px solid rgba(220,38,38,.24);background:rgba(127,29,29,.36);color:#fecaca;border-radius:12px;padding:9px 11px;font-weight:900;cursor:pointer}.adm-room-empty{border:1px dashed rgba(148,163,184,.22);border-radius:14px;padding:12px;color:#6b7280;font-size:12px}.adm-room-summary{margin-top:10px;color:#fde68a;font-size:12px;font-weight:800}
    .adm-checkout-totals{display:flex;flex-direction:column;gap:6px;border:1px solid var(--line);border-radius:14px;padding:12px}.adm-checkout-line{display:flex;justify-content:space-between;align-items:center;color:#cbd5e1;font-size:14px}.adm-checkout-total-box{display:flex;justify-content:space-between;align-items:center;background:rgba(22,101,52,.12);border:1px solid rgba(111,208,165,.22);border-radius:14px;padding:12px 16px;font-size:15px;color:#dcfce7;margin-top:12px}.adm-checkout-total-box strong{font-size:18px;font-weight:900}
    .adm-extra-list{display:grid;gap:8px;margin-top:8px}.adm-extra-row{display:grid;grid-template-columns:1fr .4fr .5fr auto;gap:8px;align-items:end}.adm-extra-row input,.adm-extra-row select{border:1px solid rgba(255,255,255,0.08);background:#15152a;color:var(--text);border-radius:12px;padding:10px 11px;color-scheme:dark}
    .adm-pix-placeholder{border:1px dashed rgba(111,208,165,.28);border-radius:14px;padding:20px;text-align:center;color:#6b7280;font-size:13px;margin-top:8px}
    .adm-pix-box{display:none;grid-template-columns:220px 1fr;gap:14px;align-items:start;border:1px solid rgba(111,208,165,.22);background:rgba(22,101,52,.08);border-radius:18px;padding:14px;margin-top:12px}.adm-pix-box.open{display:grid}.adm-pix-qr{width:220px;height:220px;border-radius:14px;background:#fff;padding:10px;object-fit:contain}.adm-pix-copy{width:100%;min-height:126px;border:1px solid rgba(255,255,255,.08);background:#15152a;color:#dcfce7;border-radius:14px;padding:12px;font-size:12px;line-height:1.45;resize:vertical;outline:none}.adm-pix-hint{font-size:12px;color:#9ca3af;margin:0 0 8px}.adm-hotel-register-card{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap}.adm-hotel-register-card h3{margin:0}.adm-hotel-register-card p{margin:4px 0 0}
    .adm-hosp-action-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.adm-hosp-action-grid .btn{width:100%!important}
    .adm-hidden-soft{display:none!important}.adm-hidden{display:none!important}.adm-hosp-help{font-size:12px;color:#6b7280;margin-top:4px}.mt-16{margin-top:16px!important}
    .adm-payment-modal-card{background:linear-gradient(155deg,#071b14,#03100c)}.adm-payment-main{grid-template-columns:1fr 1.2fr .72fr}.adm-payment-main .full{grid-column:1/-1}.adm-payment-extras{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-top:16px;padding:14px;border:1px solid rgba(74,222,128,.18);border-radius:15px;background:rgba(2,18,13,.55)}.adm-payment-extras strong{display:block;color:#f0fff6}.adm-payment-extras span{display:block;margin-top:3px;color:#8ea79c;font-size:11.5px}.adm-payment-choice{display:flex;gap:10px;margin:16px 0 0;padding:0;border:0}.adm-payment-choice legend{width:100%;margin-bottom:8px;color:#91a89e;font-size:10px;font-weight:900;text-transform:uppercase;letter-spacing:.08em}.adm-payment-choice label{display:flex;align-items:center;gap:9px;min-width:160px;padding:11px 13px;border:1px solid rgba(74,222,128,.18);border-radius:13px;background:#071f17;cursor:pointer}.adm-payment-choice input{width:17px;height:17px;accent-color:#4ade80}.adm-payment-choice strong,.adm-payment-choice small{display:block}.adm-payment-choice strong{color:#effff5}.adm-payment-choice small{margin-top:2px;color:#81998e}.adm-payment-actions{display:grid;grid-template-columns:1.05fr 1fr 1fr}.adm-payment-actions .adm-hosp-feedback{grid-column:1/-1}@media(max-width:700px){.adm-payment-main,.adm-payment-actions{grid-template-columns:1fr}.adm-payment-extras{align-items:flex-start;flex-direction:column}.adm-payment-choice{flex-direction:column}.adm-payment-choice label{min-width:0}}
    .adm-menu-mode-hoteis [data-tab="alojamentos"],.adm-menu-mode-alojamentos [data-tab="solicitadas"],.adm-menu-mode-alojamentos [data-tab="andamento"],.adm-menu-mode-alojamentos [data-tab="concluidos"],.adm-menu-mode-alojamentos [data-tab="hoteis"]{display:none!important}
    .adm-hosp-tabs-sep{width:1px;align-self:stretch;background:var(--line-2);margin:0 4px}
    .adm-hosp-tabs-label{align-self:center;font-size:10px;font-weight:900;color:var(--muted);text-transform:uppercase;letter-spacing:.08em;white-space:nowrap}
    .adm-hosp-filterbar{margin:16px 0 14px;padding:14px;border:1px solid rgba(111,208,165,.16);border-radius:18px;background:linear-gradient(135deg,rgba(111,208,165,.055),rgba(21,21,42,.72))}.adm-hosp-filter-grid{display:grid;grid-template-columns:repeat(4,minmax(140px,1fr)) minmax(150px,.8fr) auto;gap:10px;align-items:end}.adm-hosp-filter-field{display:grid;gap:6px}.adm-hosp-filter-field label{font-size:10px;font-weight:900;letter-spacing:.08em;text-transform:uppercase;color:#9ca3af}.adm-hosp-filter-field input,.adm-hosp-filter-field select{width:100%;min-width:0;border:1px solid rgba(255,255,255,.1);background:#101024;color:var(--text);border-radius:12px;padding:10px 11px;font-size:13px;outline:none;color-scheme:dark}.adm-hosp-filter-field input:focus,.adm-hosp-filter-field select:focus{border-color:var(--green-2);box-shadow:0 0 0 3px rgba(111,208,165,.1)}.adm-hosp-filter-actions{display:flex;gap:7px;align-items:center}.adm-hosp-sort-direction{width:42px!important;height:40px;padding:0!important;font-size:18px!important}.adm-hosp-filter-meta{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-top:10px;color:var(--muted);font-size:12px}.adm-hosp-filter-count{color:#bbf7d0;font-weight:800}
    .adm-hosp-chip-bar{display:flex;gap:8px;align-items:center;margin-bottom:14px;flex-wrap:wrap}
    .adm-hosp-stage{display:flex;align-items:center;gap:4px}
    .adm-hosp-stage-step{display:flex;flex-direction:column;align-items:center;gap:3px;opacity:.45}
    .adm-hosp-stage-step.done{opacity:.75}
    .adm-hosp-stage-step.active{opacity:1}
    .adm-hosp-stage-dot{width:8px;height:8px;border-radius:50%;background:var(--line-2)}
    .adm-hosp-stage-step.done .adm-hosp-stage-dot,.adm-hosp-stage-step.active .adm-hosp-stage-dot{background:#4ade80}
    .adm-hosp-stage-step.active .adm-hosp-stage-dot{box-shadow:0 0 0 3px rgba(74,222,128,.22)}
    .adm-hosp-stage-label{font-size:10px;font-weight:800;color:var(--muted);white-space:nowrap}
    .adm-hosp-stage-step.active .adm-hosp-stage-label{color:#dcfce7}
    .adm-hosp-stage-sep{width:18px;height:1px;background:var(--line-2);margin-bottom:14px}
    .dash-period-bar{display:flex;gap:8px;align-items:center;margin-bottom:16px;flex-wrap:wrap}
    .dash-period-btn{padding:6px 14px;border-radius:999px;border:1px solid var(--line-2);background:transparent;color:var(--muted);font-size:12px;font-weight:800;cursor:pointer;transition:all .15s}
    .dash-period-btn.active{background:rgba(22,101,52,.28);color:#dcfce7;border-color:rgba(111,208,165,.3)}
    .dash-kpi-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin-bottom:16px}
    .dash-kpi{background:#0a120c;border:1px solid rgba(111,208,165,.16);border-radius:18px;padding:16px 18px 15px;position:relative;overflow:hidden}
    .dash-kpi::before{content:'';position:absolute;inset:0;background:var(--kpi-glow,transparent);pointer-events:none}
    .dash-kpi::after{content:'';position:absolute;top:0;left:14%;right:14%;height:2px;border-radius:0 0 4px 4px;background:linear-gradient(90deg,transparent,var(--kpi-color,#4ade80),transparent);opacity:.8}
    .dash-kpi-value{font-size:30px;font-weight:900;font-variant-numeric:tabular-nums;letter-spacing:-.02em;color:var(--kpi-color,#e2e8f0);line-height:1;position:relative}
    .dash-kpi-badges{display:flex;gap:6px;flex-wrap:wrap;margin-top:10px;position:relative}
    .dash-kpi-badge{display:inline-flex;align-items:center;padding:4px 10px;border-radius:999px;font-size:10px;font-weight:900;white-space:nowrap;letter-spacing:.03em}
    .dash-kpi-badge.dark{background:rgba(15,23,42,.75);color:#e2e8f0;border:1px solid rgba(255,255,255,.08);text-transform:uppercase}
    .dash-kpi-badge.accent{background:color-mix(in srgb,var(--kpi-color,#4ade80) 18%,transparent);color:var(--kpi-color,#4ade80);border:1px solid color-mix(in srgb,var(--kpi-color,#4ade80) 40%,transparent)}
    .dash-main-grid{display:grid;grid-template-columns:1fr 1.5fr;gap:14px;margin-bottom:14px}
    .dash-bottom-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}
    .dash-card{background:#0d1b12;border:1px solid rgba(111,208,165,.1);border-radius:18px;padding:16px 18px}
    .dash-card-title{font-size:10px;font-weight:900;text-transform:uppercase;letter-spacing:.08em;color:#6b7280;margin-bottom:12px}
    .dash-rank-list{display:flex;flex-direction:column;gap:6px}
    .dash-rank-row{display:flex;align-items:center;gap:8px;padding:8px 10px;border-radius:12px;background:rgba(255,255,255,.02);border:1px solid rgba(255,255,255,.05)}
    .dash-rank-num{font-size:10px;font-weight:900;color:#4b5563;width:16px;flex-shrink:0;text-align:center}
    .dash-rank-name{flex:1;font-size:12px;font-weight:800;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .dash-rank-bar-wrap{width:70px;height:5px;background:rgba(255,255,255,.07);border-radius:3px;flex-shrink:0}
    .dash-rank-bar{height:100%;border-radius:3px;background:linear-gradient(90deg,#4ade80,#22d3ee)}
    .dash-rank-value{font-size:11px;font-weight:900;color:#4ade80;min-width:68px;text-align:right;flex-shrink:0}
    .dash-upcoming-list{display:flex;flex-direction:column;gap:6px}
    .dash-upcoming-row{display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:12px;background:rgba(255,255,255,.02);border:1px solid rgba(255,255,255,.05)}
    .dash-upcoming-date{font-size:11px;font-weight:900;color:#fde68a;flex-shrink:0;min-width:46px}
    .dash-upcoming-name{flex:1;font-size:12px;font-weight:800;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .dash-upcoming-city{font-size:10px;color:var(--muted);flex-shrink:0}
    @media(max-width:1100px){.adm-hosp-filter-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.adm-hosp-filter-actions{grid-column:span 2}}
    @media(max-width:900px){.adm-hosp-form{grid-template-columns:1fr}.adm-room-add,.adm-room-row{grid-template-columns:1fr}.adm-extra-row{grid-template-columns:1fr 1fr auto}.adm-hosp-search{min-width:0;width:100%}.adm-hosp-action-grid{grid-template-columns:1fr}.dash-main-grid,.dash-bottom-grid{grid-template-columns:1fr}.dash-kpi-grid{grid-template-columns:repeat(2,1fr)}}
    @media(max-width:560px){.adm-hosp-filter-grid{grid-template-columns:1fr}.adm-hosp-filter-actions{grid-column:auto}.adm-hosp-filter-meta{align-items:flex-start;flex-direction:column}}
    .br-state{transition:filter .12s,opacity .12s;cursor:pointer}
    .br-state:hover{filter:brightness(1.7) saturate(1.2)}
    .br-state.br-selected{stroke:#fde68a!important;stroke-width:2.5!important;filter:brightness(1.4)}
    .dash-map-tooltip{position:fixed;z-index:9999;background:#0a1208;border:1px solid rgba(111,208,165,.28);border-radius:10px;padding:8px 12px;pointer-events:none;display:none;font-size:12px;max-width:210px;box-shadow:0 8px 32px rgba(0,0,0,.6);line-height:1.45}
    .dash-map-tooltip .dmt-name{font-weight:900;color:#e2e8f0;margin-bottom:3px}
    .dash-map-tooltip .dmt-val{color:#4ade80;font-weight:900;font-size:13px}
    .dash-map-tooltip .dmt-cnt{color:#6b7280;font-size:11px;margin-top:2px}
    .dash-map-tooltip .dmt-hint{color:#fde68a;font-size:10px;margin-top:5px;opacity:.8}
    .dash-uf-filter{display:inline-flex;align-items:center;gap:6px;background:rgba(253,230,138,.09);border:1px solid rgba(253,230,138,.28);border-radius:999px;padding:4px 8px 4px 11px;font-size:11px;font-weight:900;color:#fde68a}
    .dash-uf-filter button{background:none;border:none;color:#fde68a;cursor:pointer;font-size:14px;line-height:1;padding:0 2px;opacity:.65}
    .dash-uf-filter button:hover{opacity:1}
  `;
  document.head.appendChild(style);
}

export function renderContent(content, userContext) {
  injectStyles();
  const state = {
    rows: [], resumo: {}, hoteis: [], alojamentos: [], historicoRows: [], historicoAtual: [], historicoErro: null,
    editingHotel: null, editingAlojamento: null,
    tab: 'dashboard', selected: null, bootDone: false,
    reservarColabs: [], estenderColabs: [],
    dashPeriod: 30, dashUF: null, andamentoFiltro: 'todos',
    solicitadasFiltros: { colaborador: '', cidade: '', supervisao: '', data: '', ordenar: 'data', direcao: 'desc' }
  };
  function getHotelById(id) { return state.hoteis.find((h) => String(h.id) === String(id)); }

  const HOTEIS_HTML = `
    <section id="tab-hoteis" class="adm-hosp-panel">
      <article class="card adm-hotel-register-card">
        <div><h3>Hotéis cadastrados</h3><p class="muted">Consulte a base e abra o cadastro somente quando precisar incluir ou editar um hotel.</p></div>
        <button class="btn btn-primary adm-hosp-btn" type="button" id="btnAbrirCadastroHotel">Cadastrar Hotel</button>
      </article>
      <article class="card mt-16">
        <div class="adm-hosp-toolbar"><div><h3>Base de hotéis</h3><p class="muted">Base usada pela equipe de hospedagem e pelo mapa de custos.</p></div><input id="hotelSearch" class="adm-hosp-search" placeholder="Buscar hotel, cidade, CNPJ..." /></div>
        <div class="adm-hosp-table-wrap"><table class="adm-hosp-table"><thead><tr><th>Hotel</th><th>Cidade</th><th>Diárias</th><th>Contato</th><th>Status</th><th>Prioridade</th><th>Ações</th></tr></thead><tbody id="hotelTbody"><tr><td colspan="7" class="adm-hosp-empty">Carregando...</td></tr></tbody></table></div>
      </article>
    </section>`;

  const HOTEL_MODAL_HTML = `
    <div id="modalHotelCadastro" class="adm-hosp-modal">
      <div class="adm-hosp-modal-card">
        <div class="adm-hosp-modal-head">
          <div><h3 id="hotelModalTitle">Cadastrar Hotel</h3><p class="muted">Preencha apenas quando for cadastrar ou editar um hotel.</p></div>
          <button class="btn btn-secondary adm-hosp-btn" type="button" id="modalHotelClose">Fechar</button>
        </div>
        <form id="hotelForm" class="adm-hosp-form mt-16">
          <div class="adm-hosp-field"><label>Nome do hotel *</label><input id="hotelNome" required /></div>
          <div class="adm-hosp-field"><label>Cidade *</label><input id="hotelCidade" required /></div>
          <div class="adm-hosp-field"><label>UF *</label><input id="hotelUf" required maxlength="2" /></div>
          <div class="adm-hosp-field"><label>Diária individual</label><input id="hotelDiariaIndividual" type="number" step="0.01" min="0" /></div>
          <div class="adm-hosp-field"><label>Diária duplo</label><input id="hotelDiariaDuplo" type="number" step="0.01" min="0" /></div>
          <div class="adm-hosp-field"><label>Diária triplo</label><input id="hotelDiariaTriplo" type="number" step="0.01" min="0" /></div>
          <div class="adm-hosp-field"><label>Diária quádruplo</label><input id="hotelDiariaQuadruplo" type="number" step="0.01" min="0" /></div>
          <div class="adm-hosp-field"><label>WhatsApp</label><input id="hotelWhatsapp" /></div>
          <div class="adm-hosp-field"><label>CNPJ/CPF</label><input id="hotelCnpj" /></div>
          <div class="adm-hosp-field full"><label>Endereço</label><input id="hotelEndereco" /></div>
          <div class="adm-hosp-field full"><label>Link Google Maps</label><input id="hotelMaps" /></div>
          <div class="adm-hosp-field"><label>Status</label><select id="hotelStatus"><option value="ATIVO">Ativo</option><option value="INATIVO">Inativo</option><option value="BLOQUEADO">Bloqueado</option></select></div>
          <div class="adm-hosp-field"><label>Prioridade</label><select id="hotelPrioridade"><option value="NORMAL">Normal</option><option value="PREFERENCIAL">Preferencial</option><option value="EVITAR">Evitar</option></select></div>
          <div class="adm-hosp-field full"><label>Observações</label><textarea id="hotelObs"></textarea></div>
        </form>
        <div class="adm-hosp-form-actions"><button class="btn btn-primary adm-hosp-btn" type="submit" form="hotelForm" id="hotelSave">Salvar hotel</button><button class="btn btn-secondary adm-hosp-btn" type="button" id="hotelClear">Limpar</button><span id="hotelFeedback" class="adm-hosp-feedback"></span></div>
      </div>
    </div>`;

  const ALOJAMENTOS_HTML = `
    <section id="tab-alojamentos" class="adm-hosp-panel">
      <article class="card adm-hotel-register-card">
        <div><h3>Alojamentos cadastrados</h3><p class="muted">Consulte a base e abra o cadastro somente quando precisar incluir ou editar um alojamento.</p></div>
        <button class="btn btn-primary adm-hosp-btn" type="button" id="btnAbrirCadastroAlojamento">Novo</button>
      </article>
      <article class="card mt-16">
        <div class="adm-hosp-toolbar"><div><h3>Base de alojamentos</h3><p class="muted">Casas, apartamentos, pousadas e escritórios para sugerir na programação.</p></div><input id="alojSearch" class="adm-hosp-search" placeholder="Buscar alojamento, cidade, responsável..." /></div>
        <div class="adm-hosp-table-wrap"><table class="adm-hosp-table"><thead><tr><th>Alojamento</th><th>Cidade</th><th>Estrutura</th><th>Despesas</th><th>Fatura</th><th>Status</th><th>Ações</th></tr></thead><tbody id="alojTbody"><tr><td colspan="7" class="adm-hosp-empty">Carregando...</td></tr></tbody></table></div>
      </article>
    </section>`;

  const ALOJAMENTO_MODAL_HTML = `
    <div id="modalAlojamentoCadastro" class="adm-hosp-modal">
      <div class="adm-hosp-modal-card">
        <div class="adm-hosp-modal-head">
          <div><h3 id="alojModalTitle">Cadastrar Alojamento</h3><p class="muted">Preencha apenas quando for cadastrar ou editar um alojamento.</p></div>
          <button class="btn btn-secondary adm-hosp-btn" type="button" id="modalAlojamentoClose">Fechar</button>
        </div>
        <form id="alojForm" class="adm-hosp-form mt-16">
          <div class="adm-hosp-field"><label>Nome do alojamento *</label><input id="alojNome" required placeholder="Ex.: MT - Confresa" /></div>
          <div class="adm-hosp-field"><label>Tipo</label><select id="alojTipo"><option value="CASA">Casa</option><option value="APARTAMENTO">Apartamento</option><option value="POUSADA">Pousada</option><option value="ESCRITORIO">Escritório</option><option value="OUTRO">Outro</option></select></div>
          <div class="adm-hosp-field"><label>Cidade *</label><input id="alojCidade" required /></div>
          <div class="adm-hosp-field"><label>UF *</label><input id="alojUf" required maxlength="2" /></div>
          <div class="adm-hosp-field full"><label>Endereço</label><input id="alojEndereco" /></div>
          <div class="adm-hosp-field"><label>Capacidade</label><input id="alojCapacidade" type="number" min="0" step="1" /></div>
          <div class="adm-hosp-field"><label>Quartos</label><input id="alojQuartos" type="number" min="0" step="1" /></div>
          <div class="adm-hosp-field"><label>Responsável</label><input id="alojResponsavel" /></div>
          <div class="adm-hosp-field"><label>Contato</label><input id="alojContato" /></div>
          <div class="adm-hosp-field"><label>Status</label><select id="alojStatus"><option value="ATIVO">Ativo</option><option value="INATIVO">Inativo</option><option value="BLOQUEADO">Bloqueado</option></select></div>
          <div class="adm-hosp-field"><label>Prioridade</label><select id="alojPrioridade"><option value="NORMAL">Normal</option><option value="PREFERENCIAL">Preferencial</option><option value="EVITAR">Evitar</option></select></div>
          <div class="adm-hosp-field"><label>Aluguel mensal</label><input id="alojAluguel" type="number" min="0" step="0.01" /></div>
          <div class="adm-hosp-field"><label>Água</label><input id="alojAgua" placeholder="Conta, status ou valor" /></div>
          <div class="adm-hosp-field"><label>Energia</label><input id="alojEnergia" placeholder="Conta, status ou valor" /></div>
          <div class="adm-hosp-field"><label>Internet</label><input id="alojInternet" placeholder="Conta, status ou valor" /></div>
          <div class="adm-hosp-field"><label>Empresa internet</label><input id="alojEmpresaNet" /></div>
          <div class="adm-hosp-field"><label>Vencimento aluguel</label><input id="alojVencAluguel" type="number" min="1" max="31" /></div>
          <div class="adm-hosp-field"><label>Vencimento água</label><input id="alojVencAgua" type="number" min="1" max="31" /></div>
          <div class="adm-hosp-field"><label>Vencimento energia</label><input id="alojVencEnergia" type="number" min="1" max="31" /></div>
          <div class="adm-hosp-field"><label>Vencimento internet</label><input id="alojVencInternet" type="number" min="1" max="31" /></div>
          <div class="adm-hosp-field full"><label>Anexo comprovante/fatura</label><input id="alojAnexo" placeholder="Cole o link do Drive/Supabase Storage" /></div>
          <div class="adm-hosp-field full"><label>Descrição da fatura</label><textarea id="alojDescricaoFatura" placeholder="Ex.: aluguel janeiro/26 lançado; energia solicitada..."></textarea></div>
          <div class="adm-hosp-field full"><label>Observações</label><textarea id="alojObs"></textarea></div>
        </form>
        <div class="adm-hosp-form-actions"><button class="btn btn-primary adm-hosp-btn" type="submit" form="alojForm" id="alojSave">Salvar alojamento</button><button class="btn btn-secondary adm-hosp-btn" type="button" id="alojClear">Limpar</button><span id="alojFeedback" class="adm-hosp-feedback"></span></div>
      </div>
    </div>`;

  content.innerHTML = `
    <section class="hero-card">
      <div>
        <div class="eyebrow">Operação</div>
        <h2>Hospedagem</h2>
        <p>Gerencie reservas, checkouts, financeiro e hotéis em um fluxo único por etapas.</p>
      </div>
      <div class="hero-badge-wrap"><span class="hero-badge">HOTELARIA</span></div>
    </section>

    <div class="adm-hosp-tabs">
      <button class="adm-hosp-tab active" data-tab="dashboard" type="button">Dashboard</button>
      <button class="adm-hosp-tab" data-tab="solicitadas" type="button">Solicitações <small id="cntSolicitadas">0</small></button>
      <button class="adm-hosp-tab" data-tab="andamento" type="button">Reservas <small id="cntAndamento">0</small></button>
      <button class="adm-hosp-tab" data-tab="pagar" type="button">Pagamentos</button>
      <span class="adm-hosp-tabs-sep" aria-hidden="true"></span>
      <span class="adm-hosp-tabs-label">Cadastros</span>
      <button class="adm-hosp-tab" data-tab="hoteis" type="button">Hotéis</button>
      <button class="adm-hosp-tab" data-tab="alojamentos" type="button">Alojamentos</button>
      <button class="adm-hosp-tab" data-tab="historico" type="button">Histórico <small id="cntHistorico">0</small></button>
    </div>

    <section id="tab-dashboard" class="adm-hosp-panel active">
      <div style="padding:10px 0;color:var(--muted);font-size:13px">Carregando dashboard...</div>
    </section>

    <section id="tab-historico" class="adm-hosp-panel">
      <article class="card">
        <div class="section-head">
          <div><h3>Histórico importado de hospedagem</h3><p class="muted">Base vinda da Central de Importação com status, checkout, quarto e valor da diária por colaborador.</p></div>
          <div class="adm-hosp-actions"><input id="historicoSearch" class="adm-hosp-search" placeholder="Buscar colaborador, hotel, cidade..." /><button class="btn btn-secondary adm-hosp-btn" id="refreshHistorico" type="button">↻ Atualizar</button></div>
        </div>
        <div class="adm-hosp-table-wrap"><table class="adm-hosp-table"><thead><tr><th>Data</th><th>Colaborador</th><th>Hotel</th><th>Cidade / UF</th><th>Status</th><th>Quarto</th><th>Diária</th><th>Situação</th></tr></thead><tbody id="tbodyHistorico"><tr><td colspan="8" class="adm-hosp-empty">Carregando...</td></tr></tbody></table></div>
      </article>
    </section>

    <section id="tab-solicitadas" class="adm-hosp-panel">
      <article class="card">
        <div class="section-head"><div><h3>Aguardando reserva</h3><p class="muted">Solicitações abertas sem reserva definida.</p></div><button class="btn btn-secondary adm-hosp-btn" id="refreshPainel" type="button">↻ Atualizar</button></div>
        <div class="adm-hosp-filterbar" aria-label="Filtros das solicitações">
          <div class="adm-hosp-filter-grid">
            <div class="adm-hosp-filter-field"><label for="solFiltroColaborador">Colaborador</label><input id="solFiltroColaborador" type="search" placeholder="Buscar nome..." autocomplete="off" /></div>
            <div class="adm-hosp-filter-field"><label for="solFiltroCidade">Cidade</label><input id="solFiltroCidade" type="search" placeholder="Buscar cidade..." autocomplete="off" /></div>
            <div class="adm-hosp-filter-field"><label for="solFiltroSupervisao">Supervisão</label><input id="solFiltroSupervisao" type="search" placeholder="Buscar supervisão..." autocomplete="off" /></div>
            <div class="adm-hosp-filter-field"><label for="solFiltroData">Data</label><input id="solFiltroData" type="date" /></div>
            <div class="adm-hosp-filter-field"><label for="solOrdenar">Organizar por</label><select id="solOrdenar"><option value="data">Data da solicitação</option><option value="checkin">Check-in</option><option value="colaborador">Colaborador</option><option value="cidade">Cidade</option><option value="supervisao">Supervisão</option><option value="hotel">Hotel</option></select></div>
            <div class="adm-hosp-filter-actions"><button class="btn btn-secondary adm-hosp-small adm-hosp-sort-direction" id="solDirecao" type="button" title="Ordem decrescente" aria-label="Alternar direção da ordenação">↓</button><button class="btn btn-secondary adm-hosp-small" id="solLimparFiltros" type="button">Limpar</button></div>
          </div>
          <div class="adm-hosp-filter-meta"><span>Os filtros podem ser combinados.</span><span id="solFiltroResultado" class="adm-hosp-filter-count">0 solicitações</span></div>
        </div>
        <div class="adm-hosp-table-wrap"><table class="adm-hosp-table"><thead><tr><th>Data / Código</th><th>Colaboradores</th><th>Gestor</th><th>Cidade / UF</th><th>Período</th><th>Status</th><th>Ações</th></tr></thead><tbody id="tbodySolicitadas"><tr><td colspan="7" class="adm-hosp-empty">Carregando...</td></tr></tbody></table></div>
      </article>
    </section>

    <section id="tab-andamento" class="adm-hosp-panel">
      <article class="card">
        <div class="section-head"><div><h3>Hospedagens em andamento</h3><p class="muted">Do reservado ao pagamento — envie para pagamento em qualquer etapa, sem esperar o checkout.</p></div><button class="btn btn-secondary adm-hosp-btn" id="refreshAndamento" type="button">↻ Atualizar</button></div>
        <div class="adm-hosp-chip-bar" id="andamentoFiltros">
          <button class="dash-period-btn active" data-stage-filter="todos" type="button">Todos</button>
          <button class="dash-period-btn" data-stage-filter="reservados" type="button">Reservado</button>
          <button class="dash-period-btn" data-stage-filter="checkout" type="button">Checkout</button>
          <button class="dash-period-btn" data-stage-filter="financeiro" type="button">Financeiro</button>
        </div>
        <div class="adm-hosp-table-wrap"><table class="adm-hosp-table"><thead><tr><th>Data / Código</th><th>Colaboradores</th><th>Hotel</th><th>Estágio</th><th>Check-out</th><th>Valor</th><th>Ações</th></tr></thead><tbody id="tbodyAndamento"><tr><td colspan="7" class="adm-hosp-empty">Carregando...</td></tr></tbody></table></div>
      </article>
    </section>

    <section id="tab-pagar" class="adm-hosp-panel"><article class="card"><div class="adm-hosp-table-wrap"><table class="adm-hosp-table"><tbody><tr><td class="adm-hosp-empty">Carregando...</td></tr></tbody></table></div></article></section>

    <section id="tab-concluidos" class="adm-hosp-panel">
      <article class="card">
        <div class="section-head"><div><h3>Concluídos</h3><p class="muted">Hospedagens pagas e encerradas.</p></div></div>
        <div class="adm-hosp-table-wrap"><table class="adm-hosp-table"><thead><tr><th>Data / Código</th><th>Colaboradores</th><th>Hotel</th><th>Valor</th><th>Conclusão</th></tr></thead><tbody id="tbodyConcluidos"><tr><td colspan="5" class="adm-hosp-empty">Carregando...</td></tr></tbody></table></div>
      </article>
    </section>

    ${HOTEIS_HTML}
    ${ALOJAMENTOS_HTML}
    ${HOTEL_MODAL_HTML}
    ${ALOJAMENTO_MODAL_HTML}

    <!-- Modal: Reservar -->
    <div id="modalReservar" class="adm-hosp-modal">
      <div class="adm-hosp-modal-card">
        <div class="adm-hosp-modal-head">
          <div><h3>Reservar hospedagem</h3><p class="muted" id="reservarSub"></p></div>
          <button class="btn btn-secondary adm-hosp-btn" type="button" id="modalReservarClose">Fechar</button>
        </div>
        <div class="adm-section-block"><div class="adm-section-label">Colaboradores da solicitação — clique em × para excluir da reserva</div><div id="reservarColabList" class="adm-colab-chips"></div></div>
        <div class="adm-hosp-form mt-16">
          <div class="adm-hosp-field"><label>Check-in *</label><input id="resCheckin" type="date" /></div>
          <div class="adm-hosp-field"><label>Check-out *</label><input id="resCheckout" type="date" /></div>
          <div class="adm-hosp-field"><label>Hotel *</label><input id="resHotelNome" list="resHotelOptions" placeholder="Digite ou selecione um hotel" autocomplete="off" /><datalist id="resHotelOptions"></datalist><select id="resHotel" hidden style="display:none"></select><span id="resHotelHint" class="adm-hosp-select-hint">Se não existir, o hotel será cadastrado automaticamente.</span></div>
          <div class="adm-hosp-field"><label>Confirmado com</label><input id="resConfirmado" /></div>
          <div class="adm-hosp-field"><label>Contato de confirmação</label><input id="resContato" /></div>
        </div>
        <div class="adm-room-wrap">
          <div class="adm-room-title"><div><strong>Composição dos quartos</strong><span>Informe gênero, tipo, quantidade e valor da diária.</span></div><span class="adm-room-chip">Por gênero</span></div>
          <div class="adm-room-add">
            <div class="adm-room-mini"><label>Gênero</label><select id="roomGenero"><option value="MASCULINO">Masculino</option><option value="FEMININO">Feminino</option></select></div>
            <div class="adm-room-mini"><label>Tipo</label><select id="roomTipo"><option value="INDIVIDUAL">Individual</option><option value="DUPLO">Duplo</option><option value="TRIPLO">Triplo</option><option value="QUADRUPLO">Quádruplo</option></select></div>
            <div class="adm-room-mini"><label>Qtd.</label><input id="roomQtd" type="number" min="1" step="1" value="1" /></div>
            <div class="adm-room-mini"><label>Valor/noite</label><input id="roomDiaria" type="number" min="0" step="0.01" value="0" /></div>
            <button class="btn btn-secondary adm-hosp-btn" type="button" id="roomAdd">Adicionar quarto</button>
          </div>
          <div class="adm-room-list" id="roomList"><div class="adm-room-empty">Nenhum quarto adicionado.</div></div>
          <div class="adm-room-summary" id="roomSummary">Informe a composição dos quartos.</div>
        </div>
        <div class="adm-hosp-field full mt-16"><label>Observação</label><textarea id="resObs"></textarea></div>
        <div class="adm-hosp-form-actions mt-16">
          <button class="btn btn-primary" type="button" id="btnConfirmarReserva">RESERVAR</button>
          <span id="reservarFeedback" class="adm-hosp-feedback"></span>
        </div>
      </div>
    </div>

    <!-- Modal: Estender -->
    <div id="modalEstender" class="adm-hosp-modal">
      <div class="adm-hosp-modal-card narrow">
        <div class="adm-hosp-modal-head">
          <div><h3>Estender hospedagem</h3><p class="muted" id="estenderSub"></p></div>
          <button class="btn btn-secondary adm-hosp-btn" type="button" id="modalEstenderClose">Fechar</button>
        </div>
        <div class="adm-section-block"><div class="adm-section-label">Quem permanece no hotel? (desmarque quem fará checkout)</div><div id="estenderColabList" class="adm-colab-check-list"></div></div>
        <div class="adm-hosp-form mt-16">
          <div class="adm-hosp-field full"><label>Nova data de check-out *</label><input id="estenderNovoCheckout" type="date" /></div>
          <div class="adm-hosp-field full"><label>Observação</label><textarea id="estenderObs"></textarea></div>
        </div>
        <div class="adm-hosp-form-actions mt-16">
          <button class="btn btn-primary" type="button" id="btnConfirmarEstender">ESTENDER</button>
          <span id="estenderFeedback" class="adm-hosp-feedback"></span>
        </div>
      </div>
    </div>

    <!-- Modal: Checkout -->
    <div id="modalCheckout" class="adm-hosp-modal">
      <div class="adm-hosp-modal-card medium">
        <div class="adm-hosp-modal-head">
          <div><h3>Fechamento da hospedagem</h3><p class="muted" id="checkoutSub"></p></div>
          <button class="btn btn-secondary adm-hosp-btn" type="button" id="modalCheckoutClose">Fechar</button>
        </div>
        <div class="adm-section-block"><div class="adm-section-label">Quem fará checkout? Marque toda a equipe ou somente quem sairá.</div><div id="checkoutColabList" class="adm-colab-check-list"></div></div>
        <div class="adm-checkout-totals mt-16">
          <div class="adm-checkout-line"><span>Valor total das diárias</span><strong id="checkoutValorDiarias">R$ 0,00</strong></div>
        </div>
        <div class="adm-section-block">
          <div class="adm-section-label" style="display:flex;justify-content:space-between;align-items:center"><span>Extras / Descontos</span><button class="btn btn-secondary adm-hosp-small" type="button" id="btnAddExtra">+ Adicionar</button></div>
          <div id="checkoutExtrasList" class="adm-extra-list"></div>
        </div>
        <div class="adm-checkout-total-box"><span>Total</span><strong id="checkoutTotal">R$ 0,00</strong></div>
        <div class="adm-hosp-field full mt-16"><label>Observação</label><textarea id="checkoutObs"></textarea></div>
        <div class="adm-hosp-form-actions mt-16">
          <button class="btn btn-primary" type="button" id="btnEnviarFinanceiro">ENVIAR AO FINANCEIRO</button>
          <button class="btn btn-secondary" type="button" id="btnAbrirPagar">PAGAR</button>
          <span id="checkoutFeedback" class="adm-hosp-feedback"></span>
        </div>
      </div>
    </div>

    <!-- Modal: Pagar -->
    <div id="modalPagar" class="adm-hosp-modal">
      <div class="adm-hosp-modal-card medium adm-payment-modal-card">
        <div class="adm-hosp-modal-head">
          <div><h3>Pagamento PIX</h3><p class="muted" id="pagarSub"></p></div>
          <button class="btn btn-secondary adm-hosp-btn" type="button" id="modalPagarClose">Fechar</button>
        </div>
        <div class="adm-section-block mt-16"><div class="adm-section-label">Período e colaboradores selecionados</div><div id="pagarResumoSelecao" class="muted"></div></div>
        <div class="adm-hosp-form adm-payment-main mt-16">
          <div class="adm-hosp-field"><label>CNPJ/CPF do fornecedor</label><input id="pagarCnpj" placeholder="Ex.: 00.000.000/0001-00" /></div>
          <div class="adm-hosp-field"><label>Nome do fornecedor</label><input id="pagarFornecedor" /></div>
          <div class="adm-hosp-field"><label>Valor (R$)</label><input id="pagarValor" type="number" step="0.01" min="0" /></div>
          <div class="adm-hosp-field full"><label>Chave PIX</label><input id="pagarPix" placeholder="Chave PIX do hotel/fornecedor" /></div>
        </div>
        <div class="adm-payment-extras"><div><strong>Extras</strong><span>Inclua custos adicionais e envie para Conferência quando necessário.</span></div><button class="btn btn-secondary" type="button" id="btnPagarExtra">+ ADICIONAR EXTRA</button></div>
        <label class="adm-payment-choice"><input id="pagarTaxaBancaria" type="checkbox"><span><strong>Incluir taxa bancária</strong><small>O hotel recebe o valor informado e o comprovante inclui R$ 2,00.</small></span></label>
        <div class="adm-hosp-form-actions adm-payment-actions mt-16">
          <button class="btn btn-primary" type="button" id="btnConfirmarPagamento">CONFIRMAR PAGAMENTO</button>
          <button class="btn btn-primary" type="button" id="btnGerarPix">▦ PAGAR COM QR CODE</button>
          <button class="btn btn-secondary" type="button" id="btnPagarFinanceiro">ENVIAR AO FINANCEIRO</button>
          <button class="btn btn-secondary" type="button" id="btnPagarComprovante">ANEXAR COMPROVANTE</button>
          <span id="pagarFeedback" class="adm-hosp-feedback"></span>
        </div>
        <div id="pixQrBox" class="adm-pix-box">
          <img id="pixQrImg" class="adm-pix-qr" alt="QR Code PIX" />
          <div><p class="adm-pix-hint">QR Code PIX real gerado a partir da chave, fornecedor e valor informados. Use também o copia e cola abaixo.</p><textarea id="pixCopiaCola" class="adm-pix-copy" readonly></textarea></div>
        </div>
      </div>
    </div>
  `;

  // ─── Helpers ───────────────────────────────────────────────────────────────

  function setFeedback(id, msg, type = '') { const el = document.getElementById(id); if (!el) return; el.textContent = msg||''; el.className = `adm-hosp-feedback ${type}`.trim(); }
  function statusPill(value) { return `<span class="adm-hosp-status ${esc(slug(value))}">${esc(label(value))}</span>`; }
  function splitColaboradores(value) { return String(value||'').split(/[\n\r,;]+/).map((n) => n.trim()).filter(Boolean); }
  function getRegionalColaborador(colab,fallback='') { return colab?.supervisao||colab?.regional||colab?.supervisao_colaborador||colab?.regional_colaborador||fallback||'-'; }
  function getColaboradoresDetalhados(row) {
    if (Array.isArray(row?._colaboradoresDetalhados)&&row._colaboradoresDetalhados.length) return row._colaboradoresDetalhados;
    return splitColaboradores(row?.colaboradores).map((nome) => ({ nome_colaborador: nome, supervisao: row?.supervisao_colaborador||row?.regional_colaborador||'' }));
  }
  function renderColaboradoresCell(row) {
    const colabs = getColaboradoresDetalhados(row);
    if (!colabs.length) return '-';
    return `<div class="adm-hosp-colab-list">${colabs.map((c) => {
      const nome = c.nome_colaborador||c.nome||'-';
      const reg = getRegionalColaborador(c);
      return `<div class="adm-hosp-colab-item"><span class="adm-hosp-colab-name">${esc(nome)}</span><span class="adm-hosp-colab-regional">${esc(reg)}</span></div>`;
    }).join('')}</div>`;
  }

  // ─── Room composition ──────────────────────────────────────────────────────

  const ROOM_KEYS = [
    {key:'FEMININO_INDIVIDUAL',grupo:'Feminino',tipo:'INDIVIDUAL',label:'Feminino individual'},
    {key:'FEMININO_DUPLO',grupo:'Feminino',tipo:'DUPLO',label:'Feminino duplo'},
    {key:'FEMININO_TRIPLO',grupo:'Feminino',tipo:'TRIPLO',label:'Feminino triplo'},
    {key:'FEMININO_QUADRUPLO',grupo:'Feminino',tipo:'QUADRUPLO',label:'Feminino quádruplo'},
    {key:'MASCULINO_INDIVIDUAL',grupo:'Masculino',tipo:'INDIVIDUAL',label:'Masculino individual'},
    {key:'MASCULINO_DUPLO',grupo:'Masculino',tipo:'DUPLO',label:'Masculino duplo'},
    {key:'MASCULINO_TRIPLO',grupo:'Masculino',tipo:'TRIPLO',label:'Masculino triplo'},
    {key:'MASCULINO_QUADRUPLO',grupo:'Masculino',tipo:'QUADRUPLO',label:'Masculino quádruplo'}
  ];
  function emptyComposicaoQuartos() { return ROOM_KEYS.reduce((acc,item) => { acc[item.key]={qtd:0,diaria:0}; return acc; },{}); }
  function getRoomKey(grupo,tipo) { return `${String(grupo||'').toUpperCase()}_${String(tipo||'').toUpperCase()}`; }
  function getRoomMeta(key) { return ROOM_KEYS.find((item) => item.key===key)||null; }
  function getComposicaoFromForm() {
    const comp = emptyComposicaoQuartos();
    document.querySelectorAll('#roomList [data-room-row]').forEach((row) => {
      const key = row.dataset.roomKey;
      if (!comp[key]) return;
      comp[key] = { qtd: Math.max(0,Math.floor(Number(row.querySelector('[data-room-qtd]')?.value||0))), diaria: Math.max(0,Number(row.querySelector('[data-room-diaria]')?.value||0)) };
    });
    return comp;
  }
  function renderRoomRow(item,value={}) {
    const qtd=Math.max(0,Math.floor(Number(value.qtd||0)));
    const diaria=Math.max(0,Number(value.diaria||0));
    return `<div class="adm-room-row" data-room-row data-room-key="${esc(item.key)}">
      <div class="adm-room-row-pill">${esc(item.grupo)}</div>
      <div class="adm-room-row-type">${esc(item.tipo.charAt(0)+item.tipo.slice(1).toLowerCase())}</div>
      <input type="number" min="1" step="1" value="${qtd||1}" data-room-qtd aria-label="Qtd" />
      <input type="number" min="0" step="0.01" value="${diaria}" data-room-diaria aria-label="Diária" />
      <div class="adm-room-row-subtotal">${money(qtd*diaria)}</div>
      <button class="adm-room-remove" type="button" data-room-remove title="Remover">×</button>
    </div>`;
  }
  function calcularComposicao(comp=getComposicaoFromForm()) {
    return ROOM_KEYS.reduce((acc,item) => {
      const qtd=Number(comp[item.key]?.qtd||0);
      const diaria=Number(comp[item.key]?.diaria||0);
      acc.quartos+=qtd; acc.totalDia+=qtd*diaria;
      if (qtd>0) acc.itens.push({...item,qtd,diaria,subtotal:qtd*diaria});
      return acc;
    },{quartos:0,totalDia:0,itens:[]});
  }
  function formatComposicaoResumo(comp=getComposicaoFromForm()) {
    const calc=calcularComposicao(comp);
    return calc.itens.map((item) => `${item.qtd} ${item.label} (${money(item.diaria)}/dia)`).join(' + ');
  }
  function extrairComposicaoObservacao(value) {
    const text=String(value||'');
    const match=text.match(/\[COMPOSICAO_QUARTOS\]([\s\S]*?)\[\/COMPOSICAO_QUARTOS\]/);
    if (!match) return {observacao:text,composicao:null};
    try { return {observacao:text.replace(match[0],'').replace(/^Composição dos quartos:.*$/gmi,'').trim(),composicao:{...emptyComposicaoQuartos(),...JSON.parse(match[1])}}; }
    catch(e) { return {observacao:text.replace(match[0],'').trim(),composicao:null}; }
  }
  function montarObservacaoComComposicao(observacao,comp) {
    const resumo=formatComposicaoResumo(comp);
    const blocoComposicao=`[COMPOSICAO_QUARTOS]${JSON.stringify(comp)}[/COMPOSICAO_QUARTOS]`;
    return [String(observacao||'').trim(),resumo?`Composição dos quartos: ${resumo}`:'',blocoComposicao].filter(Boolean).join('\n');
  }
  function atualizarDiariaSugeridaQuarto() {
    const hotel=getHotelById(document.getElementById('resHotel')?.value);
    const tipo=document.getElementById('roomTipo')?.value||'INDIVIDUAL';
    const diariaEl=document.getElementById('roomDiaria');
    if (!hotel||!diariaEl) return;
    const diaria=getHotelDiariaPorTipo(hotel,tipo);
    if (diaria&&!Number(diariaEl.value||0)) diariaEl.value=diaria;
  }
  function aplicarDiariasHotelNaComposicao(hotel,substituir=false) {
    if (!hotel) return;
    document.querySelectorAll('#roomList [data-room-row]').forEach((row) => {
      const item=getRoomMeta(row.dataset.roomKey);
      const diariaEl=row.querySelector('[data-room-diaria]');
      if (!item||!diariaEl) return;
      const diaria=getHotelDiariaPorTipo(hotel,item.tipo);
      if (diaria&&(substituir||!Number(diariaEl.value||0))) diariaEl.value=diaria;
    });
    const tipoAtual=document.getElementById('roomTipo')?.value||'INDIVIDUAL';
    const diariaDraft=getHotelDiariaPorTipo(hotel,tipoAtual);
    const draftEl=document.getElementById('roomDiaria');
    if (draftEl&&diariaDraft&&(substituir||!Number(draftEl.value||0))) draftEl.value=diariaDraft;
    updateReservaTotals();
  }
  function addRoomFromDraft() {
    const grupo=document.getElementById('roomGenero')?.value||'MASCULINO';
    const tipo=document.getElementById('roomTipo')?.value||'INDIVIDUAL';
    const key=getRoomKey(grupo,tipo);
    const item=getRoomMeta(key);
    if (!item) return;
    const qtd=Math.max(1,Math.floor(Number(document.getElementById('roomQtd')?.value||1)));
    const diaria=Math.max(0,Number(document.getElementById('roomDiaria')?.value||0));
    const list=document.getElementById('roomList');
    if (!list) return;
    list.querySelector('.adm-room-empty')?.remove();
    const existing=list.querySelector(`[data-room-key="${key}"]`);
    if (existing) {
      const qtdEl=existing.querySelector('[data-room-qtd]');
      const diariaEl=existing.querySelector('[data-room-diaria]');
      if (qtdEl) qtdEl.value=Math.max(1,Math.floor(Number(qtdEl.value||0)))+qtd;
      if (diariaEl) diariaEl.value=diaria||Number(diariaEl.value||0);
    } else {
      list.insertAdjacentHTML('beforeend',renderRoomRow(item,{qtd,diaria}));
    }
    document.getElementById('roomQtd').value=1;
    updateReservaTotals();
  }
  function updateReservaTotals() {
    const dias=diffDays(document.getElementById('resCheckin')?.value,document.getElementById('resCheckout')?.value);
    const comp=getComposicaoFromForm();
    const calc=calcularComposicao(comp);
    const total=dias*calc.totalDia;
    document.querySelectorAll('#roomList [data-room-row]').forEach((row) => {
      const qtd=Number(row.querySelector('[data-room-qtd]')?.value||0);
      const diaria=Number(row.querySelector('[data-room-diaria]')?.value||0);
      const sub=row.querySelector('.adm-room-row-subtotal');
      if (sub) sub.textContent=money(qtd*diaria);
    });
    const summary=document.getElementById('roomSummary');
    const resumo=formatComposicaoResumo(comp);
    if (summary) summary.textContent=resumo?`${calc.quartos} quarto(s) · ${money(calc.totalDia)}/dia · Total ${money(total)} · ${resumo}`:'Informe a composição dos quartos.';
  }
  function aplicarDiariaHotelSelecionado() {
    const hotel=getHotelById(document.getElementById('resHotel')?.value);
    if (!hotel) return;
    document.getElementById('resHotelNome').value=hotel.nome||'';
    aplicarDiariasHotelNaComposicao(hotel,true);
  }

  // ─── Dashboard ─────────────────────────────────────────────────────────────

  function renderBrazilMap(stateData,maxVal) {
    const STATES=[
      {uf:'AC',name:'Acre',d:'M23.34,259.60L90.84,279.56L159.17,312.07L163.20,313.66L125.50,337.17L85.14,335.06L85.44,305.72L73.05,316.00L55.50,315.17L51.39,304.44L35.13,303.98L41.05,297.40L29.27,282.74L24.71,274.57L24.64,272.08L20.08,268.67L20.00,263.83L23.72,263.83Z'},
      {uf:'AL',name:'Alagoas',d:'M774.15,293.93L769.66,301.03L762.06,309.50L756.06,317.29L751.27,321.45L751.35,322.35L749.37,325.23L748.30,323.41L746.10,323.64L746.02,321.90L744.66,320.54L743.52,321.14L738.65,317.44L738.50,315.78L718.36,305.95L713.87,302.47L722.31,293.40L738.65,303.76L739.72,301.56L743.67,301.64L745.11,303.07L757.81,293.32L762.75,294.61L766.24,292.72Z'},
      {uf:'AM',name:'Amazonas',d:'M225.45,79.13L238.22,86.01L247.34,128.12L242.70,136.74L262.46,152.16L260.41,137.72L268.62,130.99L277.89,138.86L285.57,134.92L283.37,131.52L290.21,117.00L312.55,116.48L313.09,129.63L323.80,143.92L361.96,165.39L322.13,253.63L326.84,263.61L322.05,292.04L261.32,292.49L249.62,291.88L235.94,276.54L222.03,276.61L208.27,294.68L196.11,294.91L196.26,304.81L168.90,304.44L159.17,312.07L90.84,279.56L23.34,259.60L25.40,252.27L36.11,247.20L33.61,238.88L42.57,220.81L68.42,207.28L97.91,205.16L108.55,141.27L96.62,125.25L96.31,110.43L113.64,110.05L113.57,101.35L100.26,101.50L100.26,88.42L131.88,88.20L146.40,79.73L153.32,86.38L153.70,99.16L183.72,109.22Z'},
      {uf:'AP',name:'Amapá',d:'M482.66,109.14L452.03,135.91L453.02,143.54L439.87,144.53L415.24,97.50L400.95,88.05L392.97,88.05L390.39,73.91L394.64,73.68L398.90,79.28L406.57,79.73L411.14,76.10L420.56,76.33L422.54,79.35L429.53,79.35L458.64,35.35L469.81,76.93L488.13,90.39L487.67,102.03Z'},
      {uf:'BA',name:'Bahia',d:'M713.87,302.47L718.36,305.95L718.66,314.87L721.78,315.40L723.53,322.13L721.47,323.04L721.47,329.31L717.98,330.37L717.37,329.23L714.41,329.39L713.11,331.50L718.13,341.79L728.62,347.00L711.06,374.22L707.26,371.73L700.04,378.46L697.76,407.87L701.64,429.26L693.05,456.48L696.16,464.35L693.58,468.28L688.94,470.32L685.90,477.20L674.05,469.49L675.57,465.63L667.36,458.52L669.79,449.30L674.27,448.62L680.20,431.91L597.66,397.74L562.24,416.86L562.47,409.76L558.13,372.94L551.98,341.18L566.57,320.54L577.59,331.58L599.18,327.95L608.22,316.31L604.65,306.93L611.80,301.41L625.78,308.22L635.97,301.18L642.96,301.18L655.04,289.54L665.15,299.07L665.00,304.36L671.77,304.51L690.84,286.97L705.28,295.89L708.02,293.32L712.51,296.95L711.21,299.22Z'},
      {uf:'CE',name:'Ceará',d:'M731.81,215.14L725.35,217.71L707.18,245.01L703.38,256.50L707.79,263.08L704.45,272.00L696.32,272.00L685.52,263.91L668.80,265.12L671.84,253.02L665.91,250.60L659.22,216.81L653.75,178.25L644.02,174.47L653.75,178.25L679.06,176.81L709.08,193.44L720.26,205.77L731.74,212.12Z'},
      {uf:'DF',name:'Distrito Federal',d:'M537.54,432.89L518.76,432.89L518.69,422.38L537.54,422.46Z'},
      {uf:'ES',name:'Espírito Santo',d:'M661.43,534.89L646.07,531.26L646.15,525.66L642.81,524.76L644.71,513.49L652.46,513.19L661.96,495.27L658.84,491.19L661.20,485.67L656.11,477.58L660.59,473.57L664.47,473.72L667.51,469.56L674.05,469.49L685.90,477.20L683.24,485.82L685.37,496.55L683.24,502.38L677.92,506.08L675.03,514.62L668.50,525.89L664.32,526.12Z'},
      {uf:'GO',name:'Goiás',d:'M474.07,369.84L498.32,377.17L558.13,372.94L562.47,409.76L546.66,412.25L547.26,429.49L537.54,432.89L537.54,422.46L518.69,422.38L518.76,432.89L537.54,432.89L538.07,471.83L526.74,480.98L519.14,477.35L504.40,477.50L496.95,483.85L479.31,484.31L467.08,499.28L430.29,482.87L425.50,470.62L422.31,463.67L426.94,448.17L441.31,429.79L449.75,428.43L454.00,413.92L464.04,412.25Z'},
      {uf:'MA',name:'Maranhão',d:'M513.59,221.87L532.90,209.93L545.82,190.95L561.55,141.88L586.86,151.33L593.55,167.81L601.69,170.53L610.58,164.86L630.80,174.77L644.10,174.62L621.45,203.88L622.74,251.06L611.95,255.37L609.06,250.60L600.09,253.85L590.67,263.76L573.56,270.49L563.76,293.47L566.57,320.54L555.32,317.82L551.67,309.88L542.70,296.35L547.42,283.95L553.65,282.96L552.59,274.42L542.70,276.69L530.47,262.02L536.40,243.12L533.81,228.00Z'},
      {uf:'MG',name:'Minas Gerais',d:'M680.20,431.91L674.27,448.62L669.79,449.30L667.36,458.52L675.57,465.63L674.05,469.49L667.51,469.56L664.47,473.72L660.59,473.57L656.11,477.58L661.20,485.67L658.84,491.19L661.96,495.27L652.46,513.19L644.71,513.49L642.81,524.76L641.36,528.16L638.78,528.08L633.61,541.09L634.67,542.83L619.55,550.01L614.46,547.82L587.24,556.13L556.31,565.81L534.80,509.26L466.54,507.97L467.08,499.28L479.31,484.31L496.95,483.85L504.40,477.50L519.14,477.35L526.74,480.98L538.07,471.83L537.54,432.89L547.26,429.49L546.66,412.25L562.47,409.76L562.24,416.86L597.73,397.96Z'},
      {uf:'MS',name:'Mato Grosso do Sul',d:'M425.50,470.62L430.29,482.87L467.08,499.28L466.54,507.97L437.66,551.67L425.27,559.61L415.70,566.34L408.63,576.09L402.93,587.74L394.34,585.09L381.57,586.98L372.14,553.49L331.02,552.28L331.56,528.23L325.25,508.65L340.37,469.26L355.50,457.77L369.63,454.44L386.28,463.89L405.66,463.44L413.80,454.97L413.72,463.82L406.42,470.70Z'},
      {uf:'MT',name:'Mato Grosso',d:'M278.20,387.30L294.39,360.23L294.54,335.13L261.17,334.75L261.32,292.49L322.05,292.04L326.84,263.61L354.21,304.06L480.99,312.53L471.03,343.45L474.07,369.84L464.04,412.25L454.00,413.92L449.75,428.43L441.31,429.79L426.94,448.17L422.31,463.67L425.50,470.62L406.42,470.70L413.72,463.82L413.80,454.97L405.66,463.44L386.28,463.89L369.63,454.44L355.50,457.77L340.37,469.26L323.88,456.48L323.88,437.05L287.93,437.13L287.70,422.31L280.10,413.84L286.48,414.14L286.10,404.77L283.59,393.50Z'},
      {uf:'PA',name:'Pará',d:'M561.55,141.88L545.82,190.95L532.90,209.93L513.59,221.87L509.56,225.50L520.43,229.96L509.87,252.12L504.09,253.63L497.33,268.90L501.58,273.36L480.99,312.53L354.21,304.06L326.84,263.61L322.13,253.63L361.96,165.39L323.80,143.92L313.09,129.63L312.55,116.48L313.01,96.89L346.76,84.64L368.57,83.89L367.73,73.76L390.39,73.91L392.97,88.05L400.95,88.05L415.24,97.50L439.87,144.53L453.02,143.54L452.03,135.91L482.66,109.14L485.70,115.49L493.00,114.89L515.65,126.76L516.03,131.52L525.15,134.70L531.00,130.16Z'},
      {uf:'PB',name:'Paraíba',d:'M777.04,247.50L780.00,268.07L775.21,265.12L767.23,266.41L766.09,270.11L757.05,273.51L752.33,272.76L745.72,275.40L745.19,279.56L737.82,282.89L731.43,275.55L738.42,266.33L732.34,262.62L718.89,271.55L704.45,272.00L707.79,263.08L703.38,256.50L707.18,245.01L716.15,247.58L732.57,237.83L734.40,240.77L728.39,251.21L743.44,257.11L749.75,247.20Z'},
      {uf:'PE',name:'Pernambuco',d:'M780.00,268.07L774.15,293.93L766.24,292.72L762.75,294.61L757.81,293.32L745.11,303.07L743.67,301.64L739.72,301.56L738.65,303.76L722.31,293.40L713.87,302.47L711.21,299.22L712.51,296.95L708.02,293.32L705.28,295.89L690.84,286.97L671.77,304.51L665.00,304.36L665.15,299.07L655.04,289.54L668.80,278.05L668.72,273.36L665.46,272.15L665.53,266.48L668.80,265.12L685.52,263.91L696.32,272.00L704.45,272.00L718.89,271.55L732.34,262.62L738.42,266.33L731.43,275.55L737.82,282.89L745.19,279.56L745.72,275.40L752.33,272.76L757.05,273.51L766.09,270.11L767.23,266.41L775.21,265.12Z'},
      {uf:'PI',name:'Piauí',d:'M644.10,174.62L653.75,178.25L659.22,216.81L665.91,250.60L671.84,253.02L668.80,265.12L665.53,266.48L665.46,272.15L668.72,273.36L668.80,278.05L655.04,289.54L642.96,301.18L635.97,301.18L625.78,308.22L611.80,301.41L604.65,306.93L608.22,316.31L599.18,327.95L577.59,331.58L566.57,320.54L563.76,293.47L573.56,270.49L590.67,263.76L600.09,253.85L609.06,250.60L611.95,255.37L622.74,251.06L621.45,203.88Z'},
      {uf:'PR',name:'Paraná',d:'M425.27,559.61L489.95,568.76L500.82,598.10L523.70,610.95L512.53,625.47L501.43,625.47L494.59,629.85L487.22,626.22L473.99,626.37L471.33,630.23L460.84,631.67L458.56,638.09L414.71,630.91L408.70,618.89L396.31,617.98L402.93,587.74L408.63,576.09L415.70,566.34Z'},
      {uf:'RJ',name:'Rio de Janeiro',d:'M587.40,574.66L585.04,567.78L597.43,563.32L595.83,559.54L590.59,561.20L587.24,556.13L614.46,547.82L619.55,550.01L634.67,542.83L633.61,541.09L638.78,528.08L641.36,528.16L642.81,524.76L646.15,525.66L646.07,531.26L661.43,534.89L658.69,539.05L660.44,548.12L655.65,550.84L649.19,552.96L640.83,559.91L643.11,562.41L640.07,566.64L620.76,567.10L609.89,568.76L604.80,566.19L590.13,571.25L590.97,573.60Z'},
      {uf:'RN',name:'Rio Grande do Norte',d:'M731.81,215.14L744.05,220.28L757.88,219.60L769.43,222.93L777.04,247.50L749.75,247.20L743.44,257.11L728.39,251.21L734.40,240.77L732.57,237.83L716.15,247.58L707.18,245.01L725.35,217.71Z'},
      {uf:'RO',name:'Rondônia',d:'M159.17,312.07L168.90,304.44L196.26,304.81L196.11,294.91L208.27,294.68L222.03,276.61L235.94,276.54L249.62,291.88L261.32,292.49L261.17,334.75L294.54,335.13L294.39,360.23L278.20,387.30L271.21,383.60L255.09,384.20L249.09,377.40L217.24,362.50L209.56,365.45L188.20,348.89L188.28,313.81L163.20,313.66Z'},
      {uf:'RR',name:'Roraima',d:'M313.01,96.89L312.55,116.48L290.21,117.00L283.37,131.52L285.57,134.92L277.89,138.86L268.62,130.99L260.41,137.72L262.46,152.16L242.70,136.74L247.34,128.12L238.22,86.01L225.45,79.13L225.14,74.97L213.82,75.04L209.49,52.51L197.10,39.88L198.85,38.45L202.57,41.70L211.46,42.23L213.97,46.01L229.48,45.33L233.35,51.76L238.60,50.24L236.39,44.80L246.05,40.87L251.60,42.30L277.29,29.07L277.06,20.30L290.97,20.00L291.42,33.99L298.49,36.71L298.80,48.05L291.96,63.63L292.34,75.95L296.21,77.31L296.29,85.48L306.09,95.31Z'},
      {uf:'RS',name:'Rio Grande do Sul',d:'M410.91,648.53L451.04,653.29L474.30,671.74L488.28,675.37L484.86,685.42L490.03,689.96L479.77,712.87L469.66,726.33L462.14,732.90L445.26,744.85L445.19,739.03L448.91,739.03L458.03,732.60L472.09,713.32L462.29,711.43L452.94,727.46L441.39,738.95L444.43,740.69L444.43,745.23L439.94,750.37L435.99,761.71L431.73,766.93L419.80,776.00L416.76,773.43L419.04,766.62L426.79,757.32L430.97,759.82L435.00,751.50L431.58,749.31L423.30,754.53L378.15,720.88L369.48,724.74L341.89,704.32L375.94,667.20Z'},
      {uf:'SC',name:'Santa Catarina',d:'M414.71,630.91L458.56,638.09L460.84,631.67L471.33,630.23L473.99,626.37L487.22,626.22L494.59,629.85L501.43,625.47L512.53,625.47L514.81,630.38L511.09,639.60L512.99,652.23L512.83,661.76L509.72,674.46L490.03,689.96L484.86,685.42L488.28,675.37L474.30,671.74L451.04,653.29L410.91,648.53Z'},
      {uf:'SE',name:'Sergipe',d:'M718.36,305.95L738.50,315.78L738.65,317.44L743.52,321.14L744.66,320.54L746.02,321.90L746.10,323.64L748.30,323.41L749.37,325.23L748.84,326.06L746.71,326.06L739.41,331.05L728.62,347.00L718.13,341.79L713.11,331.50L714.41,329.39L717.37,329.23L717.98,330.37L721.47,329.31L721.47,323.04L723.53,322.13L721.78,315.40L718.66,314.87Z'},
      {uf:'SP',name:'São Paulo',d:'M587.40,574.66L574.10,580.25L575.16,582.14L572.42,583.96L567.94,582.52L562.39,583.35L546.66,591.29L523.70,610.95L500.82,598.10L489.95,568.76L425.27,559.61L437.66,551.67L466.54,507.97L534.80,509.26L556.31,565.81L587.24,556.13L590.59,561.20L595.83,559.54L597.43,563.32L585.04,567.78Z'},
      {uf:'TO',name:'Tocantins',d:'M566.57,320.54L551.98,341.18L558.13,372.94L498.32,377.17L474.07,369.84L471.03,343.45L480.99,312.53L501.58,273.36L497.33,268.90L504.09,253.63L509.87,252.12L520.43,229.96L509.56,225.50L513.59,221.87L533.81,228.00L536.40,243.12L530.47,262.02L542.70,276.69L552.59,274.42L553.65,282.96L547.42,283.95L542.70,296.35L551.67,309.88L555.32,317.82Z'},
    ];
    // Centroids manually tuned for label placement
    const CENTROIDS={AC:{x:90,y:300},AL:{x:752,y:310},AM:{x:185,y:205},AP:{x:450,y:100},BA:{x:643,y:388},CE:{x:700,y:233},DF:{x:528,y:428},ES:{x:664,y:505},GO:{x:492,y:440},MA:{x:582,y:255},MG:{x:580,y:490},MS:{x:385,y:530},MT:{x:370,y:400},PA:{x:435,y:225},PB:{x:748,y:264},PE:{x:718,y:283},PI:{x:635,y:255},PR:{x:460,y:595},RJ:{x:628,y:557},RN:{x:744,y:234},RO:{x:215,y:340},RR:{x:270,y:85},RS:{x:438,y:710},SC:{x:462,y:658},SE:{x:733,y:330},SP:{x:510,y:578},TO:{x:520,y:340}};
    const TINY=new Set(['AP','ES','RJ','DF','AL','SE','PB','RN','AC','RR','SC','PR']);
    const els=STATES.map(s=>{
      const d=stateData[s.uf]||{count:0,value:0};
      const has=d.count>0;
      const isSelected=state.dashUF===s.uf;
      const ratio=maxVal>0&&has?Math.min(1,(d.value||d.count)/maxVal):0;
      const fill=has?`rgba(74,222,128,${(0.15+ratio*0.75).toFixed(2)})`:'rgba(255,255,255,0.04)';
      const stroke=isSelected?'#fde68a':(has?`rgba(74,222,128,${(0.45+ratio*0.45).toFixed(2)})`:'rgba(111,208,165,0.2)');
      const sw=isSelected?2.5:(has?1.5:1.2);
      const cls=`br-state${isSelected?' br-selected':''}`;
      const c=CENTROIDS[s.uf]||{x:400,y:400};
      const fs=TINY.has(s.uf)?6:8;
      const txtFill=has?'#ecfdf5':'#64748b';
      return `<path class="${cls}" d="${s.d}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" stroke-linejoin="round" data-uf="${s.uf}" data-name="${esc(s.name)}" data-count="${d.count}" data-value="${d.value.toFixed(2)}"></path><text x="${c.x}" y="${c.y}" text-anchor="middle" dominant-baseline="central" font-size="${fs}" font-weight="900" fill="${txtFill}" stroke="#0a1208" stroke-width="2.5" paint-order="stroke fill" style="pointer-events:none;user-select:none">${s.uf}</text>`;
    }).join('');
    const noData=Object.keys(stateData).length===0?`<text x="400" y="398" text-anchor="middle" fill="#4b5563" font-size="13" font-weight="800">Sem dados no período</text>`:'';
    return `<svg viewBox="0 0 800 796" width="100%" style="max-height:290px;display:block">${els}${noData}</svg>`;
  }


  function normalizeHistoricoStatus(row) {
    const raw = String(row?.status_hospedagem || row?.status_planilha || '').trim().toUpperCase();
    if (raw.includes('CHECKOUT') || raw === 'CHECK OUT') return 'CHECKOUT_REALIZADO';
    if (raw === 'STAY' || raw === 'CHECK' || raw.includes('HOSPED') || raw.includes('ATIVO')) return 'HOSPEDADO';
    return raw || 'HOSPEDADO';
  }

  function historicoIsAtivo(row) {
    const st = normalizeHistoricoStatus(row);
    return !['CHECKOUT_REALIZADO','CONCLUIDA','CANCELADA'].includes(st);
  }

  function mapHistoricoToDashboardRow(row) {
    const st = normalizeHistoricoStatus(row);
    const data = String(row?.data || row?.created_at || '').slice(0, 10);
    return {
      _origem: 'historico_hospedagem',
      codigo: 'HIST',
      solicitacao_id: row?.id || `hist-${data}-${row?.colaborador || ''}`,
      data_solicitacao: data,
      data_checkin: st === 'CHECKOUT_REALIZADO' ? null : data,
      data_checkout: st === 'CHECKOUT_REALIZADO' ? data : null,
      data_checkin_prevista: data,
      data_checkout_prevista: st === 'CHECKOUT_REALIZADO' ? data : null,
      status_hospedagem: st,
      status_solicitacao: st === 'CHECKOUT_REALIZADO' ? 'CONCLUIDA' : 'RESERVADA',
      status_financeiro: String(row?.situacao_pagamento || '').toUpperCase().includes('PAGO') ? 'PAGO' : 'NAO_INICIADO',
      status_nota: row?.nfs ? 'NF_RECEBIDA' : 'NAO_SOLICITADA',
      colaborador: row?.colaborador || '',
      hotel: row?.hotel || '',
      cidade: row?.cidade || '',
      uf: row?.uf || '',
      regional: row?.regional || '',
      tipo_quarto: row?.tipo_quarto || '',
      valor_financeiro: toNumber(row?.valor_diaria || row?.saldo),
      valor_total_previsto: toNumber(row?.valor_diaria || row?.saldo),
      situacao_pagamento: row?.situacao_pagamento || '',
      observacao_hospedagem: row?.observacao || '',
      _colaboradoresDetalhados: [{
        nome_colaborador: row?.colaborador || '-',
        regional: row?.regional || '',
        supervisao: '',
        coordenacao: '',
        empresa: '',
        tipo_colaborador: ''
      }]
    };
  }

  function getDashboardRows() {
    return [
      ...(state.rows || []),
      ...(state.historicoRows || []).map(mapHistoricoToDashboardRow)
    ];
  }

  function getHospedadosAgoraRows(baseRows) {
    const fluxoAtivo = (baseRows || []).filter(r => r._origem !== 'historico_hospedagem' && ['HOSPEDADO','CHECKIN_PREVISTO','CHECKOUT_HOJE','RENOVACAO_NECESSARIA'].includes(String(r.status_hospedagem || '').toUpperCase()));
    const histAtivo = (state.historicoAtual || []).filter(historicoIsAtivo).map(mapHistoricoToDashboardRow);
    return [...fluxoAtivo, ...histAtivo];
  }

  function renderTabDashboard() {
    const section=document.getElementById('tab-dashboard');
    if (!section) return;
    const today=new Date().toISOString().slice(0,10);
    const todayPlus7=new Date(Date.now()+7*86400000).toISOString().slice(0,10);
    const cutoff=state.dashPeriod?new Date(Date.now()-state.dashPeriod*86400000).toISOString().slice(0,10):'';
    const dashboardRows=getDashboardRows();
    const periodRows=cutoff?dashboardRows.filter(r=>(r.data_solicitacao||'')>=cutoff):dashboardRows;
    const rows=state.dashUF?periodRows.filter(r=>normalizeUF(r.uf)===state.dashUF):periodRows;
    const ativosAgora=state.dashUF?getHospedadosAgoraRows(dashboardRows).filter(r=>normalizeUF(r.uf)===state.dashUF):getHospedadosAgoraRows(dashboardRows);
    // KPIs
    const hospedados=ativosAgora.length;
    const solicitadas=rows.filter(r=>painelBucket(r)==='solicitadas').length;
    const checkinsHoje=rows.filter(r=>{const d=r.data_checkin||r.data_checkin_prevista;return d&&d.slice(0,10)===today;}).length;
    const checkoutsHoje=rows.filter(r=>{const d=r.data_checkout||r.data_checkout_prevista;return d&&d.slice(0,10)===today;}).length;
    const valorTotal=rows.reduce((a,r)=>a+toNumber(r.valor_financeiro||r.valor_total_previsto),0);
    const pendFinanceiro=rows.filter(r=>painelBucket(r)==='financeiro').length;
    // Mapa: agrupar por UF
    const stateData={};
    rows.forEach(r=>{const uf=normalizeUF(r.uf);if(!uf||uf.length!==2)return;if(!stateData[uf])stateData[uf]={count:0,value:0};stateData[uf].count++;stateData[uf].value+=toNumber(r.valor_financeiro||r.valor_total_previsto);});
    const maxStateVal=Math.max(1,...Object.values(stateData).map(d=>d.value||d.count));
    // Gráfico mensal (sempre últimos 12 meses de state.rows completo)
    const now=new Date();
    const months=[];
    for(let i=11;i>=0;i--){const d=new Date(now.getFullYear(),now.getMonth()-i,1);months.push([`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`,{count:0,value:0}]);}
    const monthMap=new Map(months);
    dashboardRows.forEach(r=>{const k=(r.data_solicitacao||r.created_at||'').slice(0,7);if(monthMap.has(k)){const m=monthMap.get(k);m.count++;m.value+=toNumber(r.valor_financeiro||r.valor_total_previsto);}});
    const maxMonth=Math.max(1,...months.map(([,v])=>v.count));
    const currentMonthKey=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
    const mNames=['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
    // Top hotéis
    const hotelMap={};
    rows.forEach(r=>{if(!r.hotel)return;if(!hotelMap[r.hotel])hotelMap[r.hotel]={value:0,count:0};hotelMap[r.hotel].value+=toNumber(r.valor_financeiro||r.valor_total_previsto);hotelMap[r.hotel].count++;});
    const topHoteis=Object.entries(hotelMap).sort((a,b)=>b[1].value-a[1].value).slice(0,5);
    const maxHotelVal=Math.max(1,topHoteis[0]?.[1]?.value||1);
    // Próximos check-ins
    const upcoming=rows.filter(r=>{const d=r.data_checkin||r.data_checkin_prevista;return d&&d.slice(0,10)>=today&&d.slice(0,10)<=todayPlus7&&painelBucket(r)!=='concluidos';}).sort((a,b)=>{const da=a.data_checkin||a.data_checkin_prevista||'';const db=b.data_checkin||b.data_checkin_prevista||'';return da<db?-1:da>db?1:0;}).slice(0,6);
    const kpiCards=[
      {val:hospedados,label:'Hospedados agora',sub:'Ativos ou check-in previsto',color:'#4ade80',glow:'rgba(74,222,128,.07)'},
      {val:solicitadas,label:'Aguardando reserva',sub:'Solicitações abertas',color:'#fde68a',glow:'rgba(253,230,138,.07)'},
      {val:checkinsHoje,label:'Check-ins hoje',sub:brDate(today),color:'#93c5fd',glow:'rgba(147,197,253,.07)'},
      {val:checkoutsHoje,label:'Checkouts hoje',sub:brDate(today),color:'#c4b5fd',glow:'rgba(196,181,253,.07)'},
      {val:money(valorTotal),label:'Valor total',sub:'Período selecionado',color:'#4ade80',glow:'rgba(74,222,128,.07)',small:true},
      {val:pendFinanceiro,label:'Aguardando financeiro',sub:'A processar',color:'#fca5a5',glow:'rgba(252,165,165,.07)'}
    ];
    section.innerHTML=`
      <div class="dash-period-bar">
        <span style="font-size:11px;font-weight:900;text-transform:uppercase;letter-spacing:.07em;color:var(--muted)">Período</span>
        ${[7,30,90,0].map(p=>`<button class="dash-period-btn${state.dashPeriod===p?' active':''}" data-dash-period="${p}" type="button">${p?p+'d':'Tudo'}</button>`).join('')}
        ${state.dashUF?`<div class="dash-uf-filter"><span>Estado: ${state.dashUF}</span><button data-clear-uf type="button" title="Limpar filtro">×</button></div>`:''}
        <span style="margin-left:auto;font-size:11px;color:var(--muted);font-weight:800">${rows.length} registro(s)</span>
      </div>
      <div class="dash-kpi-grid">
        ${kpiCards.map(k=>`<div class="dash-kpi" style="--kpi-color:${k.color};--kpi-glow:radial-gradient(ellipse at top left,${k.glow},transparent 65%)">
          <div class="dash-kpi-value"${k.small?` style="font-size:${String(k.val).length>10?'16px':'22px'}"`:''}>${k.val}</div>
          <div class="dash-kpi-badges">
            <span class="dash-kpi-badge dark">${esc(k.label)}</span>
            <span class="dash-kpi-badge accent">${esc(k.sub)}</span>
          </div>
        </div>`).join('')}
      </div>
      <div class="dash-main-grid">
        <div class="dash-card">
          <div class="dash-card-title">Distribuição por estado — <span style="color:#4ade80">${Object.keys(stateData).length} estado(s)</span></div>
          ${renderBrazilMap(stateData,maxStateVal)}
        </div>
        <div class="dash-card">
          <div class="dash-card-title">Reservas mensais <span style="color:var(--muted);font-weight:700;text-transform:none;letter-spacing:0">(últimos 12 meses)</span></div>
          <div style="display:flex;align-items:flex-end;gap:4px;height:155px">
            ${months.map(([key,v])=>{
              const h=maxMonth>0?Math.max(3,Math.round((v.count/maxMonth)*105)):3;
              const isCur=key===currentMonthKey;
              const mName=mNames[parseInt(key.split('-')[1],10)-1];
              return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:3px">
                <span style="font-size:8px;font-weight:900;color:${v.count>0?(isCur?'#4ade80':'rgba(111,208,165,.6)'):'transparent'}">${v.count||0}</span>
                <div style="width:80%;height:${h}px;border-radius:3px 3px 0 0;background:${isCur?'#4ade80':'rgba(111,208,165,.25)'}" title="${mName}: ${v.count} reservas · ${money(v.value)}"></div>
                <span style="font-size:7px;color:var(--muted);font-weight:800">${mName}</span>
              </div>`;
            }).join('')}
          </div>
        </div>
      </div>
      <div class="dash-bottom-grid">
        <div class="dash-card">
          <div class="dash-card-title">Próximos check-ins — <span style="color:var(--muted);font-weight:700;text-transform:none;letter-spacing:0">7 dias</span></div>
          ${upcoming.length===0
            ?`<div style="color:var(--muted);font-size:13px;padding:6px 0">Nenhum check-in nos próximos 7 dias.</div>`
            :`<div class="dash-upcoming-list">${upcoming.map(r=>{
              const d=r.data_checkin||r.data_checkin_prevista;
              const colabs=getColaboradoresDetalhados(r);
              const nome=colabs.length?colabs[0].nome_colaborador||'-':(String(r.colaboradores||'-').split('\n')[0]);
              const extra=colabs.length>1?`<span style="color:var(--muted)"> +${colabs.length-1}</span>`:'';
              return `<div class="dash-upcoming-row"><div class="dash-upcoming-date">${brDate(d)}</div><div class="dash-upcoming-name">${esc(nome)}${extra}</div><div class="dash-upcoming-city">${esc([r.cidade,r.uf].filter(Boolean).join('/'))}</div></div>`;
            }).join('')}</div>`}
        </div>
        <div class="dash-card">
          <div class="dash-card-title">Top hotéis por valor</div>
          ${topHoteis.length===0
            ?`<div style="color:var(--muted);font-size:13px;padding:6px 0">Sem dados de hotéis no período.</div>`
            :`<div class="dash-rank-list">${topHoteis.map(([name,d],i)=>`
              <div class="dash-rank-row">
                <div class="dash-rank-num">${i+1}</div>
                <div class="dash-rank-name" title="${esc(name)}">${esc(name)}</div>
                <div class="dash-rank-bar-wrap"><div class="dash-rank-bar" style="width:${Math.round(d.value/maxHotelVal*100)}%"></div></div>
                <div class="dash-rank-value">${money(d.value)}</div>
              </div>`).join('')}</div>`}
        </div>
      </div>`;
    section.querySelectorAll('[data-dash-period]').forEach(btn=>{
      btn.addEventListener('click',()=>{state.dashPeriod=Number(btn.dataset.dashPeriod);renderTabDashboard();});
    });
    section.querySelector('[data-clear-uf]')?.addEventListener('click',()=>{state.dashUF=null;renderTabDashboard();});
    // Map interactivity
    let tt=document.getElementById('dashMapTooltip');
    if(!tt){tt=document.createElement('div');tt.id='dashMapTooltip';tt.className='dash-map-tooltip';document.body.appendChild(tt);}
    section.querySelectorAll('.br-state').forEach(path=>{
      path.addEventListener('mouseenter',()=>{
        const cnt=+path.dataset.count;const val=+path.dataset.value;const name=path.dataset.name;const uf=path.dataset.uf;
        const isActive=state.dashUF===uf;
        tt.innerHTML=`<div class="dmt-name">${name}</div>${cnt>0?`<div class="dmt-val">${money(val)}</div><div class="dmt-cnt">${cnt} hospedagem(s)</div><div class="dmt-hint">${isActive?'Clique para remover filtro':'Clique para filtrar'}</div>`:'<div class="dmt-cnt" style="color:#4b5563">Sem hospedagens</div>'}`;
        tt.style.display='block';
      });
      path.addEventListener('mousemove',e=>{tt.style.left=(e.clientX+16)+'px';tt.style.top=(e.clientY-12)+'px';});
      path.addEventListener('mouseleave',()=>{tt.style.display='none';});
      path.addEventListener('click',()=>{
        if(+path.dataset.count===0)return;
        state.dashUF=state.dashUF===path.dataset.uf?null:path.dataset.uf;
        tt.style.display='none';
        renderTabDashboard();
      });
    });
  }

  // ─── Data loading ──────────────────────────────────────────────────────────

  async function enrichRowsWithColaboradores(rows) {
    const ids=[...new Set((rows||[]).map((r) => r.solicitacao_id).filter(Boolean))];
    if (!ids.length) return rows||[];
    // Sem "id" aqui, todo colaborador chega ao modal de Reservar sem PK —
    // saveReservarModal() filtra por c.id e nunca vincula ninguém em
    // hospedagem_reserva_colaboradores, deixando a reserva presa em
    // Solicitações pra sempre (o card nunca conta como "completo").
    // "regional" NÃO existe nessa tabela (colunas reais: id, solicitacao_id,
    // colaborador_id, nome_colaborador, cpf, tipo_colaborador, empresa,
    // coordenacao, supervisao, status_colaborador, observacoes, created_at) —
    // pedir coluna inexistente derruba o select inteiro com erro 400, e caía
    // no mesmo fallback sem id de novo. getRegionalColaborador() já cobre
    // via "supervisao" (ver linha ~404), não precisa de "regional" aqui.
    const {data,error}=await supabase.from('hospedagem_solicitacao_colaboradores').select('id,solicitacao_id,nome_colaborador,supervisao,coordenacao,empresa,tipo_colaborador').in('solicitacao_id',ids);
    if (error||!Array.isArray(data)) { if (error) console.error('[adm-hotel] enrichRowsWithColaboradores falhou',error); return rows||[]; }
    const porSolicitacao=new Map();
    data.forEach((c) => { const key=String(c.solicitacao_id||''); if (!porSolicitacao.has(key)) porSolicitacao.set(key,[]); porSolicitacao.get(key).push(c); });
    return (rows||[]).map((row) => ({...row,_colaboradoresDetalhados:porSolicitacao.get(String(row.solicitacao_id||''))||[]}));
  }


  async function loadHistoricoRows() {
    state.historicoErro = null;
    const hist = await supabase
      .from('hospedagem_historico_colaboradores')
      .select('id,data,regional,cidade,uf,colaborador,status_planilha,status_hospedagem,hotel,localizacao,tipo_quarto,valor_diaria,local_embarque,cliente,saldo,situacao_pagamento,nfs,observacao,updated_at')
      .order('data', { ascending: false })
      .limit(5000);

    if (hist.error) {
      state.historicoErro = hist.error.message;
      state.historicoRows = [];
      state.historicoAtual = [];
      updateHistoricoCount();
      renderHistorico();
      return;
    }

    state.historicoRows = hist.data || [];

    const atual = await supabase
      .from('hospedagem_historico_atual_colaboradores')
      .select('id,data,regional,cidade,uf,colaborador,status_planilha,status_hospedagem,hotel,localizacao,tipo_quarto,valor_diaria,local_embarque,cliente,saldo,situacao_pagamento,nfs,observacao,updated_at')
      .limit(5000);

    if (!atual.error) state.historicoAtual = atual.data || [];
    else state.historicoAtual = dedupeHistoricoAtual(state.historicoRows);

    updateHistoricoCount();
    renderHistorico();
  }

  function dedupeHistoricoAtual(rows) {
    const map = new Map();
    (rows || []).forEach((r) => {
      const key = normalizeText(r.colaborador || '');
      if (!key) return;
      const prev = map.get(key);
      const currDate = String(r.data || '').slice(0,10);
      const prevDate = String(prev?.data || '').slice(0,10);
      if (!prev || currDate >= prevDate) map.set(key, r);
    });
    return [...map.values()];
  }

  function updateHistoricoCount() {
    const el = document.getElementById('cntHistorico');
    if (el) el.textContent = (state.historicoRows || []).length;
  }

  function renderHistorico() {
    const tbody = document.getElementById('tbodyHistorico');
    if (!tbody) return;
    if (state.historicoErro) {
      tbody.innerHTML = `<tr><td colspan="8" class="adm-hosp-empty">${esc(state.historicoErro)}. Verifique se a migration do histórico de hospedagem foi aplicada.</td></tr>`;
      return;
    }
    const q = normalizeText(document.getElementById('historicoSearch')?.value || '');
    let rows = state.historicoRows || [];
    if (q) rows = rows.filter((r) => normalizeText([r.colaborador,r.hotel,r.cidade,r.uf,r.regional,r.status_planilha,r.tipo_quarto,r.situacao_pagamento].filter(Boolean).join(' ')).includes(q));
    rows = rows.slice(0, 250);
    if (!rows.length) {
      tbody.innerHTML = `<tr><td colspan="8" class="adm-hosp-empty">Nenhum histórico importado localizado.</td></tr>`;
      return;
    }
    tbody.innerHTML = rows.map((r) => {
      const st = normalizeHistoricoStatus(r);
      return `<tr>
        <td><strong>${brDate(r.data)}</strong><span class="adm-hosp-row-note">${esc(r.regional || '')}</span></td>
        <td><strong>${esc(r.colaborador || '-')}</strong><span class="adm-hosp-row-note">${esc(r.cliente || '')}</span></td>
        <td>${esc(r.hotel || '-')}<span class="adm-hosp-row-note">${esc(r.localizacao || '')}</span></td>
        <td>${esc([r.cidade,r.uf].filter(Boolean).join('/'))}</td>
        <td>${statusPill(st)}</td>
        <td>${esc(r.tipo_quarto || '-')}</td>
        <td>${r.valor_diaria != null ? money(r.valor_diaria) : '-'}</td>
        <td>${esc(r.situacao_pagamento || '-')}<span class="adm-hosp-row-note">${esc(r.nfs ? `NFS: ${r.nfs}` : '')}</span></td>
      </tr>`;
    }).join('');
  }

  async function loadRows() {
    const {data,error}=await supabase.from('hospedagem_painel_geral').select('*').order('data_solicitacao',{ascending:false});
    if (error) { ['tbodySolicitadas','tbodyAndamento','tbodyConcluidos'].forEach((id) => { const el=document.getElementById(id); if (el) el.innerHTML=`<tr><td colspan="7" class="adm-hosp-empty">${esc(error.message)}</td></tr>`; }); return; }
    state.rows=await enrichRowsWithColaboradores(data||[]);
    updateTabCounts();
    renderCurrentTab();
    document.dispatchEvent(new CustomEvent('hospedagem:baseAtualizada'));
  }

  function painelBucket(r) {
    const fin=String(r.status_financeiro||'NAO_INICIADO').toUpperCase();
    const nf=String(r.status_nota||'NAO_SOLICITADA').toUpperCase();
    const hosp=String(r.status_hospedagem||'').toUpperCase();
    const sol=String(r.status_solicitacao||'').toUpperCase();
    if (fin==='PAGO'||nf==='LANCADO'||sol==='CONCLUIDA') return 'concluidos';
    if (sol==='CANCELADA') return 'cancelada';
    if (fin==='ENVIADO_AO_FINANCEIRO'||r.pendencia_financeira||r.pendencia_nf) return 'financeiro';
    if (r.checkout_hoje||r.checkout_vencido||['CHECKOUT_HOJE','RENOVACAO_NECESSARIA','CHECKOUT_REALIZADO'].includes(hosp)) return 'checkout';
    if (sol==='RESERVADA'||['CHECKIN_PREVISTO','HOSPEDADO'].includes(hosp)) return 'reservados';
    if (['SOLICITADA','EM_ANALISE','EM_COTACAO'].includes(sol)) return 'solicitadas';
    return 'financeiro';
  }

  function updateTabCounts() {
    const counts={solicitadas:0,reservados:0,checkout:0,financeiro:0,concluidos:0};
    (state.rows||[]).forEach((r) => { const b=painelBucket(r); counts[b]=(counts[b]||0)+1; });
    const andamento=counts.reservados+counts.checkout+counts.financeiro;
    Object.entries({cntSolicitadas:counts.solicitadas,cntAndamento:andamento,cntConcluidos:counts.concluidos}).forEach(([id,v]) => { const el=document.getElementById(id); if (el) el.textContent=v; });
    return counts;
  }

  function renderCurrentTab() {
    if (['hoteis','alojamentos'].includes(state.tab)) return;
    const fns={dashboard:renderTabDashboard,historico:renderHistorico,solicitadas:renderTabSolicitadas,andamento:renderTabAndamento,concluidos:renderTabConcluidos};
    (fns[state.tab]||renderTabDashboard)();
  }

  function solicitadaValores(row) {
    const detalhados=Array.isArray(row?._colaboradoresDetalhados)?row._colaboradoresDetalhados:[];
    const colaboradores=detalhados.map((c) => c.nome_colaborador).filter(Boolean);
    const supervisoes=detalhados.map((c) => c.supervisao).filter(Boolean);
    return {
      colaborador: colaboradores.join(' ')||row?.colaboradores||row?.colaborador||'',
      cidade: [row?.cidade,row?.uf].filter(Boolean).join(' '),
      supervisao: supervisoes.join(' ')||row?.supervisao||'',
      data: String(row?.data_solicitacao||'').slice(0,10),
      checkin: String(row?.data_checkin||row?.data_checkin_prevista||'').slice(0,10),
      hotel: row?.hotel||''
    };
  }

  function filtrarEOrdenarSolicitadas(rows) {
    const filtros=state.solicitadasFiltros;
    const filtradas=(rows||[]).filter((row) => {
      const valores=solicitadaValores(row);
      return (!filtros.colaborador||normalizeText(valores.colaborador).includes(normalizeText(filtros.colaborador)))
        && (!filtros.cidade||normalizeText(valores.cidade).includes(normalizeText(filtros.cidade)))
        && (!filtros.supervisao||normalizeText(valores.supervisao).includes(normalizeText(filtros.supervisao)))
        && (!filtros.data||valores.data===filtros.data);
    });
    const campo=filtros.ordenar||'data';
    const direcao=filtros.direcao==='asc'?1:-1;
    return filtradas.sort((a,b) => {
      const av=solicitadaValores(a)[campo]||'';
      const bv=solicitadaValores(b)[campo]||'';
      return String(av).localeCompare(String(bv),'pt-BR',{numeric:true,sensitivity:'base'})*direcao;
    });
  }

  function atualizarResumoFiltrosSolicitadas(exibidas,total) {
    const el=document.getElementById('solFiltroResultado');
    if (!el) return;
    el.textContent=exibidas===total
      ? `${total} ${total===1?'solicitação':'solicitações'}`
      : `${exibidas} de ${total} solicitações`;
  }

  function renderTabSolicitadas() {
    const tbody=document.getElementById('tbodySolicitadas');
    if (!tbody) return;
    const todas=state.rows.filter((r) => painelBucket(r)==='solicitadas');
    const rows=filtrarEOrdenarSolicitadas(todas);
    atualizarResumoFiltrosSolicitadas(rows.length,todas.length);
    if (!rows.length) { tbody.innerHTML=`<tr><td colspan="7" class="adm-hosp-empty">${todas.length?'Nenhuma solicitação corresponde aos filtros.':'Nenhuma solicitação aguardando reserva.'}</td></tr>`; return; }
    tbody.innerHTML=rows.map((r) => `<tr>
      <td><strong>${esc(r.codigo||'-')}</strong><span class="adm-hosp-row-note">${brDate(r.data_solicitacao)}</span></td>
      <td>${renderColaboradoresCell(r)}</td>
      <td>${esc(r.solicitante_nome||'-')}</td>
      <td>${esc([r.cidade,r.uf].filter(Boolean).join('/'))}<span class="adm-hosp-row-note">${esc(r.cliente||'')}</span></td>
      <td>${brDate(r.data_checkin_prevista)} até ${brDate(r.data_checkout_prevista)}<span class="adm-hosp-row-note">${esc(r.quantidade_diarias_prevista||'-')} dia(s)</span></td>
      <td>${statusPill(r.status_solicitacao)}</td>
      <td><div class="adm-hosp-actions"><button class="btn btn-primary adm-hosp-small" data-action="reservar" data-id="${esc(r.solicitacao_id)}" type="button">Reservar</button><button class="btn adm-hosp-small adm-hosp-danger" data-action="recusar" data-id="${esc(r.solicitacao_id)}" type="button">Recusar</button></div></td>
    </tr>`).join('');
  }

  const ANDAMENTO_STAGES=[
    {bucket:'reservados',label:'Reservado'},
    {bucket:'checkout',label:'Checkout'},
    {bucket:'financeiro',label:'Pagamento'}
  ];

  function renderStageStepper(bucket) {
    const idx=ANDAMENTO_STAGES.findIndex((s) => s.bucket===bucket);
    const steps=ANDAMENTO_STAGES.map((s,i) => {
      const cls=i<idx?'done':i===idx?'active':'';
      return `<div class="adm-hosp-stage-step ${cls}"><span class="adm-hosp-stage-dot"></span><span class="adm-hosp-stage-label">${esc(s.label)}</span></div>`;
    }).join('<span class="adm-hosp-stage-sep"></span>');
    return `<div class="adm-hosp-stage">${steps}</div>`;
  }

  function stageStatusPill(r,bucket) {
    if (bucket==='financeiro') return statusPill(r.status_financeiro||'NAO_INICIADO');
    return statusPill(r.status_hospedagem||r.status_solicitacao);
  }

  function pagamentoActionLabel(bucket) { return bucket==='financeiro' ? 'Registrar pagamento' : 'Enviar p/ pagamento'; }

  function renderTabAndamento() {
    const tbody=document.getElementById('tbodyAndamento');
    if (!tbody) return;
    const all=state.rows.filter((r) => ['reservados','checkout','financeiro'].includes(painelBucket(r)));
    document.querySelectorAll('#andamentoFiltros [data-stage-filter]').forEach((btn) => {
      const key=btn.dataset.stageFilter;
      btn.classList.toggle('active',key===state.andamentoFiltro);
    });
    const rows=state.andamentoFiltro==='todos' ? all : all.filter((r) => painelBucket(r)===state.andamentoFiltro);
    if (!rows.length) { tbody.innerHTML=`<tr><td colspan="7" class="adm-hosp-empty">Nenhuma hospedagem em andamento.</td></tr>`; return; }
    tbody.innerHTML=rows.map((r) => {
      const bucket=painelBucket(r);
      const valor=r.valor_financeiro||r.valor_total_previsto;
      const acoes=[
        bucket==='reservados' ? `<button class="btn btn-secondary adm-hosp-small" data-action="estender" data-id="${esc(r.solicitacao_id)}" type="button">Estender</button>` : '',
        r.reserva_id ? `<button class="btn btn-primary adm-hosp-small" data-action="enviar-pagamento" data-id="${esc(r.solicitacao_id)}" type="button">${esc(pagamentoActionLabel(bucket))}</button>` : ''
      ].filter(Boolean).join('');
      return `<tr>
        <td><strong>${esc(r.codigo||'-')}</strong><span class="adm-hosp-row-note">${brDate(r.data_solicitacao)}</span></td>
        <td>${renderColaboradoresCell(r)}</td>
        <td>${esc(r.hotel||'-')}<span class="adm-hosp-row-note">${esc([r.cidade,r.uf].filter(Boolean).join('/'))}</span></td>
        <td>${renderStageStepper(bucket)}<span class="adm-hosp-row-note">${stageStatusPill(r,bucket)}</span></td>
        <td>${brDate(r.data_checkout||r.data_checkout_prevista)}<span class="adm-hosp-row-note">Check-in: ${brDate(r.data_checkin||r.data_checkin_prevista)}</span></td>
        <td>${valor?money(valor):'-'}</td>
        <td><div class="adm-hosp-actions">${acoes}</div></td>
      </tr>`;
    }).join('');
  }

  function renderTabConcluidos() {
    const tbody=document.getElementById('tbodyConcluidos');
    if (!tbody) return;
    const rows=state.rows.filter((r) => painelBucket(r)==='concluidos');
    if (!rows.length) { tbody.innerHTML=`<tr><td colspan="5" class="adm-hosp-empty">Nenhuma hospedagem concluída.</td></tr>`; return; }
    tbody.innerHTML=rows.map((r) => `<tr>
      <td><strong>${esc(r.codigo||'-')}</strong><span class="adm-hosp-row-note">${brDate(r.data_solicitacao)}</span></td>
      <td>${renderColaboradoresCell(r)}</td>
      <td>${esc(r.hotel||'-')}</td>
      <td>${(r.valor_financeiro||r.valor_total_previsto)?money(r.valor_financeiro||r.valor_total_previsto):'-'}</td>
      <td>${brDate(r.data_pagamento||r.data_checkout||r.data_checkout_prevista)}</td>
    </tr>`).join('');
  }

  // ─── Tab navigation ────────────────────────────────────────────────────────

  function setTab(tab) {
    const valid=['dashboard','historico','solicitadas','andamento','pagar','nf','concluidos','hoteis','alojamentos'];
    const t=valid.includes(tab)?tab:'dashboard';
    state.tab=t;
    document.querySelectorAll('.adm-hosp-tab').forEach((b) => b.classList.toggle('active',b.dataset.tab===t));
    document.querySelectorAll('.adm-hosp-panel').forEach((p) => p.classList.remove('active'));
    document.getElementById(`tab-${t}`)?.classList.add('active');
    if (t==='hoteis') { renderHoteis(); return state.bootDone ? undefined : loadHoteis(); }
    if (t==='alojamentos') { renderAlojamentos(); return state.bootDone ? undefined : loadAlojamentos(); }
    if (t==='historico') { renderHistorico(); return state.bootDone ? undefined : loadHistoricoRows(); }
    renderCurrentTab();
    if (!state.bootDone) Promise.all([loadRows(), loadHistoricoRows()]).catch(() => loadRows());
  }

  // ─── Hotels ────────────────────────────────────────────────────────────────

  async function loadHoteis() {
    const {data,error}=await supabase.from('hospedagem_hoteis').select('*').order('cidade',{ascending:true}).order('nome',{ascending:true});
    if (error) { document.getElementById('hotelTbody').innerHTML=`<tr><td colspan="7" class="adm-hosp-empty">${esc(error.message)}</td></tr>`; return; }
    state.hoteis=data||[];
    fillHotelSelect(state.selected);
    renderHoteis();
  }

  function getHoteisRecomendados(row) {
    const cidadeSolicitada=normalizeText(row?.cidade);
    const ufSolicitada=normalizeUF(row?.uf);
    if (!cidadeSolicitada&&!ufSolicitada) return state.hoteis.filter((h) => String(h.status||'ATIVO').toUpperCase()==='ATIVO');
    return state.hoteis.filter((h) => {
      const mesmaCidade=cidadeSolicitada?normalizeText(h.cidade)===cidadeSolicitada:true;
      const mesmaUf=ufSolicitada?normalizeUF(h.uf)===ufSolicitada:true;
      return mesmaCidade&&mesmaUf&&String(h.status||'ATIVO').toUpperCase()!=='INATIVO'&&String(h.status||'').toUpperCase()!=='BLOQUEADO';
    }).sort((a,b) => {const p={PREFERENCIAL:0,NORMAL:1,EVITAR:2}; return (p[String(a.prioridade||'NORMAL').toUpperCase()]??1)-(p[String(b.prioridade||'NORMAL').toUpperCase()]??1)||String(a.nome||'').localeCompare(String(b.nome||''),'pt-BR');});
  }

  function fillHotelSelect(row) {
    const select=document.getElementById('resHotel');
    if (!select) return;
    const hint=document.getElementById('resHotelHint');
    const rows=getHoteisRecomendados(row);
    const cidadeUf=[row?.cidade,row?.uf].filter(Boolean).join('/');
    select.innerHTML=`<option value="">Selecionar hotel</option>`+rows.map((h) => {
      const ind=getHotelDiariaPorTipo(h,'INDIVIDUAL');
      const dup=getHotelDiariaPorTipo(h,'DUPLO');
      const rates=[ind?`Ind. ${money(ind)}`:'',dup?`Dup. ${money(dup)}`:''].filter(Boolean).join(' · ');
      return `<option value="${esc(h.id)}" data-nome="${esc(h.nome)}" data-cidade="${esc(h.cidade||'')}" data-uf="${esc(h.uf||'')}">${esc(h.nome)} · ${esc(h.cidade||'-')}/${esc(h.uf||'')}${rates?` · ${rates}`:''}</option>`;
    }).join('');
    const datalist=document.getElementById('resHotelOptions');
    if (datalist) datalist.innerHTML=rows.map((h) => `<option value="${esc(h.nome)}">${esc([h.cidade,h.uf].filter(Boolean).join('/'))}</option>`).join('');
    if (hint) {
      if (rows.length) { hint.textContent=`${rows.length} hotel(is) encontrado(s) para ${cidadeUf||'a cidade solicitada'}.`; hint.className='adm-hosp-select-hint'; }
      else { hint.textContent=`Nenhum hotel ativo cadastrado para ${cidadeUf||'a cidade'}. Use o campo manual.`; hint.className='adm-hosp-select-hint warn'; }
    }
  }

  function renderHoteis() {
    const tbody=document.getElementById('hotelTbody');
    const search=String(document.getElementById('hotelSearch')?.value||'').toLowerCase().trim();
    let rows=state.hoteis;
    if (search) rows=rows.filter((h) => [h.nome,h.cidade,h.uf,h.cnpj_cpf,h.whatsapp].join(' ').toLowerCase().includes(search));
    if (!rows.length) { tbody.innerHTML=`<tr><td colspan="7" class="adm-hosp-empty">Nenhum hotel encontrado.</td></tr>`; return; }
    tbody.innerHTML=rows.map((h) => `<tr>
      <td><strong>${esc(h.nome)}</strong><span class="adm-hosp-row-note">${esc(h.endereco||'')}</span></td>
      <td>${esc([h.cidade,h.uf].filter(Boolean).join('/'))}</td>
      <td><strong>Ind:</strong> ${h.valor_diaria_individual?money(h.valor_diaria_individual):'-'}<br><strong>Dup:</strong> ${h.valor_diaria_duplo?money(h.valor_diaria_duplo):'-'}<br><strong>Tri:</strong> ${h.valor_diaria_triplo?money(h.valor_diaria_triplo):'-'}<br><strong>Quad:</strong> ${h.valor_diaria_quadruplo?money(h.valor_diaria_quadruplo):'-'}</td>
      <td>${esc(h.whatsapp||h.telefone||'-')}<span class="adm-hosp-row-note">${esc(h.cnpj_cpf||'')}</span></td>
      <td>${statusPill(h.status||'ATIVO')}</td>
      <td>${statusPill(h.prioridade||'NORMAL')}</td>
      <td><div class="adm-hosp-actions"><button class="btn btn-secondary adm-hosp-small" data-action="edit-hotel" data-id="${esc(h.id)}" type="button">Editar</button><button class="btn btn-secondary adm-hosp-small adm-hosp-danger" data-action="delete-hotel" data-id="${esc(h.id)}" type="button">Excluir</button></div></td>
    </tr>`).join('');
  }

  function openHotelModal(editing=false) {
    document.getElementById('hotelModalTitle').textContent = editing ? 'Editar Hotel' : 'Cadastrar Hotel';
    document.getElementById('modalHotelCadastro')?.classList.add('open');
    setTimeout(() => document.getElementById('hotelNome')?.focus(), 50);
  }
  function closeHotelModal() { document.getElementById('modalHotelCadastro')?.classList.remove('open'); }

  function resetHotelForm() {
    state.editingHotel=null;
    document.getElementById('hotelForm')?.reset();
    document.getElementById('hotelStatus').value='ATIVO';
    document.getElementById('hotelPrioridade').value='NORMAL';
    document.getElementById('hotelSave').textContent='Salvar hotel';
    document.getElementById('hotelModalTitle').textContent='Cadastrar Hotel';
    setFeedback('hotelFeedback','');
  }
  function fillHotelForm(h) {
    state.editingHotel=h.id;
    document.getElementById('hotelNome').value=h.nome||'';
    document.getElementById('hotelCidade').value=h.cidade||'';
    document.getElementById('hotelUf').value=h.uf||'';
    document.getElementById('hotelDiariaIndividual').value=h.valor_diaria_individual||h.valor_diaria_padrao||'';
    document.getElementById('hotelDiariaDuplo').value=h.valor_diaria_duplo||'';
    document.getElementById('hotelDiariaTriplo').value=h.valor_diaria_triplo||'';
    document.getElementById('hotelDiariaQuadruplo').value=h.valor_diaria_quadruplo||'';
    document.getElementById('hotelWhatsapp').value=h.whatsapp||'';
    document.getElementById('hotelCnpj').value=h.cnpj_cpf||'';
    document.getElementById('hotelEndereco').value=h.endereco||'';
    document.getElementById('hotelMaps').value=h.link_maps||'';
    document.getElementById('hotelStatus').value=h.status||'ATIVO';
    document.getElementById('hotelPrioridade').value=h.prioridade||'NORMAL';
    document.getElementById('hotelObs').value=h.observacoes||'';
    document.getElementById('hotelSave').textContent='Salvar alterações';
    openHotelModal(true);
  }
  async function saveHotel(ev) {
    ev.preventDefault();
    setFeedback('hotelFeedback','Salvando...');
    const payload={
      nome:document.getElementById('hotelNome').value.trim(),cidade:document.getElementById('hotelCidade').value.trim(),uf:document.getElementById('hotelUf').value.trim().toUpperCase(),
      valor_diaria_padrao:document.getElementById('hotelDiariaIndividual').value?Number(document.getElementById('hotelDiariaIndividual').value):null,
      valor_diaria_individual:document.getElementById('hotelDiariaIndividual').value?Number(document.getElementById('hotelDiariaIndividual').value):null,
      valor_diaria_duplo:document.getElementById('hotelDiariaDuplo').value?Number(document.getElementById('hotelDiariaDuplo').value):null,
      valor_diaria_triplo:document.getElementById('hotelDiariaTriplo').value?Number(document.getElementById('hotelDiariaTriplo').value):null,
      valor_diaria_quadruplo:document.getElementById('hotelDiariaQuadruplo').value?Number(document.getElementById('hotelDiariaQuadruplo').value):null,
      whatsapp:document.getElementById('hotelWhatsapp').value.trim()||null,cnpj_cpf:document.getElementById('hotelCnpj').value.trim()||null,
      endereco:document.getElementById('hotelEndereco').value.trim()||null,link_maps:document.getElementById('hotelMaps').value.trim()||null,
      status:document.getElementById('hotelStatus').value,prioridade:document.getElementById('hotelPrioridade').value,
      observacoes:document.getElementById('hotelObs').value.trim()||null,atualizado_por:userContext?.user?.id||null
    };
    const result=state.editingHotel?await supabase.from('hospedagem_hoteis').update(payload).eq('id',state.editingHotel):await supabase.from('hospedagem_hoteis').insert({...payload,criado_por:userContext?.user?.id||null});
    if (result.error) { setFeedback('hotelFeedback',result.error.message,'err'); return; }
    resetHotelForm(); setFeedback('hotelFeedback','Hotel salvo com sucesso.','ok'); closeHotelModal(); await loadHoteis();
  }
  async function deleteHotel(id) {
    const hotel=getHotelById(id);
    if (!hotel) return;
    if (!window.confirm(`Excluir o hotel ${hotel.nome}?`)) return;
    setFeedback('hotelFeedback','Excluindo...');
    const result=await supabase.from('hospedagem_hoteis').delete().eq('id',id);
    if (result.error) {
      const msg=String(result.error.message||'').toLowerCase();
      if (msg.includes('foreign key')||msg.includes('violates')||msg.includes('referenced')) {
        const inactive=await supabase.from('hospedagem_hoteis').update({status:'INATIVO',atualizado_por:userContext?.user?.id||null}).eq('id',id);
        if (inactive.error) { setFeedback('hotelFeedback',inactive.error.message,'err'); return; }
        setFeedback('hotelFeedback','Hotel com vínculo marcado como INATIVO.','ok');
        if (state.editingHotel===id) resetHotelForm();
        await loadHoteis(); return;
      }
      setFeedback('hotelFeedback',result.error.message,'err'); return;
    }
    setFeedback('hotelFeedback','Hotel excluído.','ok');
    if (state.editingHotel===id) resetHotelForm();
    await loadHoteis();
  }

  // ─── Alojamentos ───────────────────────────────────────────────────────────

  async function loadAlojamentos() {
    const {data,error}=await supabase.from('hospedagem_alojamentos').select('*').order('cidade',{ascending:true}).order('nome',{ascending:true});
    if (error) { const tbody=document.getElementById('alojTbody'); if (tbody) tbody.innerHTML=`<tr><td colspan="7" class="adm-hosp-empty">${esc(error.message)}</td></tr>`; return; }
    state.alojamentos=data||[];
    renderAlojamentos();
  }
  function renderAlojamentos() {
    const tbody=document.getElementById('alojTbody');
    if (!tbody) return;
    const search=normalizeText(document.getElementById('alojSearch')?.value||'');
    let rows=state.alojamentos||[];
    if (search) rows=rows.filter((a) => normalizeText([a.nome,a.cidade,a.uf,a.responsavel,a.contato,a.empresa_internet,a.descricao_fatura].join(' ')).includes(search));
    if (!rows.length) { tbody.innerHTML=`<tr><td colspan="7" class="adm-hosp-empty">Nenhum alojamento encontrado.</td></tr>`; return; }
    tbody.innerHTML=rows.map((a) => {
      const despesas=[a.valor_aluguel?`Aluguel: ${money(a.valor_aluguel)}`:'',a.agua?`Água: ${esc(a.agua)}`:'',a.energia?`Energia: ${esc(a.energia)}`:'',a.internet?`Internet: ${esc(a.internet)}`:'',a.empresa_internet?`Empresa: ${esc(a.empresa_internet)}`:''].filter(Boolean).join('<br>')||'-';
      const vencs=[a.vencimento_aluguel?`Aluguel dia ${esc(a.vencimento_aluguel)}`:'',a.vencimento_agua?`Água dia ${esc(a.vencimento_agua)}`:'',a.vencimento_energia?`Energia dia ${esc(a.vencimento_energia)}`:'',a.vencimento_internet?`Internet dia ${esc(a.vencimento_internet)}`:''].filter(Boolean).join(' · ');
      return `<tr>
        <td><strong>${esc(a.nome)}</strong><span class="adm-hosp-row-note">${esc(a.endereco||'')}</span></td>
        <td>${esc([a.cidade,a.uf].filter(Boolean).join('/'))}</td>
        <td>${statusPill(a.tipo||'CASA')}<span class="adm-hosp-row-note">Cap.: ${esc(a.capacidade||'-')} · Quartos: ${esc(a.quartos||'-')}</span><span class="adm-hosp-row-note">${esc(a.responsavel||'')}${a.contato?` · ${esc(a.contato)}`:''}</span></td>
        <td>${despesas}<span class="adm-hosp-row-note">${esc(vencs)}</span></td>
        <td>${a.anexo_url?`<a href="${esc(a.anexo_url)}" target="_blank" rel="noopener">Abrir anexo</a>`:'-'}<span class="adm-hosp-row-note">${esc(a.descricao_fatura||'')}</span></td>
        <td>${statusPill(a.status||'ATIVO')}<br>${statusPill(a.prioridade||'NORMAL')}</td>
        <td><div class="adm-hosp-actions"><button class="btn btn-secondary adm-hosp-small" data-action="edit-alojamento" data-id="${esc(a.id)}" type="button">Editar</button><button class="btn btn-secondary adm-hosp-small adm-hosp-danger" data-action="delete-alojamento" data-id="${esc(a.id)}" type="button">Excluir</button></div></td>
      </tr>`;
    }).join('');
  }
  function openAlojamentoModal(editing=false) {
    document.getElementById('alojModalTitle').textContent = editing ? 'Editar Alojamento' : 'Cadastrar Alojamento';
    document.getElementById('modalAlojamentoCadastro')?.classList.add('open');
    setTimeout(() => document.getElementById('alojNome')?.focus(), 50);
  }
  function closeAlojamentoModal() { document.getElementById('modalAlojamentoCadastro')?.classList.remove('open'); }

  function resetAlojamentoForm() {
    state.editingAlojamento=null;
    document.getElementById('alojForm')?.reset();
    if (document.getElementById('alojStatus')) document.getElementById('alojStatus').value='ATIVO';
    if (document.getElementById('alojPrioridade')) document.getElementById('alojPrioridade').value='NORMAL';
    if (document.getElementById('alojSave')) document.getElementById('alojSave').textContent='Salvar alojamento';
    if (document.getElementById('alojModalTitle')) document.getElementById('alojModalTitle').textContent='Cadastrar Alojamento';
    setFeedback('alojFeedback','');
  }
  function fillAlojamentoForm(a) {
    state.editingAlojamento=a.id;
    ['alojNome','alojTipo','alojCidade','alojUf','alojEndereco','alojCapacidade','alojQuartos','alojResponsavel','alojContato','alojStatus','alojPrioridade','alojAluguel','alojAgua','alojEnergia','alojInternet','alojEmpresaNet','alojVencAluguel','alojVencAgua','alojVencEnergia','alojVencInternet','alojAnexo','alojDescricaoFatura','alojObs'].forEach((id) => {
      const el=document.getElementById(id); if (!el) return;
      const field=id.replace('aloj','').charAt(0).toLowerCase()+id.replace('aloj','').slice(1);
      const keyMap={Nome:'nome',Tipo:'tipo',Cidade:'cidade',Uf:'uf',Endereco:'endereco',Capacidade:'capacidade',Quartos:'quartos',Responsavel:'responsavel',Contato:'contato',Status:'status',Prioridade:'prioridade',Aluguel:'valor_aluguel',Agua:'agua',Energia:'energia',Internet:'internet',EmpresaNet:'empresa_internet',VencAluguel:'vencimento_aluguel',VencAgua:'vencimento_agua',VencEnergia:'vencimento_energia',VencInternet:'vencimento_internet',Anexo:'anexo_url',DescricaoFatura:'descricao_fatura',Obs:'observacoes'};
      const rawKey=id.replace('aloj','');
      const dbKey=keyMap[rawKey];
      if (dbKey!==undefined) el.value=a[dbKey]||'';
    });
    document.getElementById('alojSave').textContent='Salvar alterações';
    openAlojamentoModal(true);
  }
  async function saveAlojamento(ev) {
    ev.preventDefault();
    setFeedback('alojFeedback','Salvando...');
    const g=(id) => document.getElementById(id);
    const payload={
      nome:g('alojNome').value.trim(),tipo:g('alojTipo').value||'CASA',cidade:g('alojCidade').value.trim(),uf:normalizeUF(g('alojUf').value),
      endereco:g('alojEndereco').value.trim()||null,capacidade:g('alojCapacidade').value?Number(g('alojCapacidade').value):null,quartos:g('alojQuartos').value?Number(g('alojQuartos').value):null,
      responsavel:g('alojResponsavel').value.trim()||null,contato:g('alojContato').value.trim()||null,status:g('alojStatus').value,prioridade:g('alojPrioridade').value,
      valor_aluguel:g('alojAluguel').value?Number(g('alojAluguel').value):null,agua:g('alojAgua').value.trim()||null,energia:g('alojEnergia').value.trim()||null,
      internet:g('alojInternet').value.trim()||null,empresa_internet:g('alojEmpresaNet').value.trim()||null,
      vencimento_aluguel:g('alojVencAluguel').value?Number(g('alojVencAluguel').value):null,vencimento_agua:g('alojVencAgua').value?Number(g('alojVencAgua').value):null,
      vencimento_energia:g('alojVencEnergia').value?Number(g('alojVencEnergia').value):null,vencimento_internet:g('alojVencInternet').value?Number(g('alojVencInternet').value):null,
      anexo_url:g('alojAnexo').value.trim()||null,descricao_fatura:g('alojDescricaoFatura').value.trim()||null,observacoes:g('alojObs').value.trim()||null,
      atualizado_por:userContext?.user?.id||null
    };
    if (!payload.nome||!payload.cidade||!payload.uf) { setFeedback('alojFeedback','Informe nome, cidade e UF.','err'); return; }
    const result=state.editingAlojamento?await supabase.from('hospedagem_alojamentos').update(payload).eq('id',state.editingAlojamento):await supabase.from('hospedagem_alojamentos').insert({...payload,criado_por:userContext?.user?.id||null});
    if (result.error) { setFeedback('alojFeedback',result.error.message,'err'); return; }
    resetAlojamentoForm(); setFeedback('alojFeedback','Alojamento salvo.','ok'); closeAlojamentoModal(); await loadAlojamentos();
  }
  async function deleteAlojamento(id) {
    const aloj=(state.alojamentos||[]).find((a) => String(a.id)===String(id));
    if (!aloj) return;
    if (!window.confirm(`Excluir o alojamento ${aloj.nome}?`)) return;
    const {error}=await supabase.from('hospedagem_alojamentos').delete().eq('id',id);
    if (error) { setFeedback('alojFeedback',error.message,'err'); return; }
    if (state.editingAlojamento===id) resetAlojamentoForm();
    setFeedback('alojFeedback','Alojamento excluído.','ok'); await loadAlojamentos();
  }

  // ─── Modal: Reservar ───────────────────────────────────────────────────────

  function openModalReservar(row) {
    state.selected=row;
    const groupedIds=Array.isArray(window.__hospedagemSolicitacoesAgrupadas)?window.__hospedagemSolicitacoesAgrupadas:[];
    const groupedRows=state.rows.filter((item) => groupedIds.includes(item.solicitacao_id));
    const colabs=(groupedRows.length>1?groupedRows.flatMap(getColaboradoresDetalhados):getColaboradoresDetalhados(row));
    state.reservarColabs=colabs.map((c) => ({...c,excluido:false}));
    document.getElementById('reservarSub').textContent=`${colabs.map((c) => c.nome_colaborador||c.nome).join(', ')} · ${[row.cidade,row.uf].filter(Boolean).join('/')}`;
    renderReservarColabs();
    document.getElementById('resCheckin').value=row.data_checkin_prevista||'';
    document.getElementById('resCheckout').value=row.data_checkout_prevista||'';
    document.getElementById('resHotelNome').value='';
    document.getElementById('resConfirmado').value='';
    document.getElementById('resContato').value='';
    document.getElementById('resObs').value=row.observacao_gestor||'';
    const list=document.getElementById('roomList');
    if (list) list.innerHTML='<div class="adm-room-empty">Nenhum quarto adicionado.</div>';
    const summary=document.getElementById('roomSummary');
    if (summary) summary.textContent='Informe a composição dos quartos.';
    fillHotelSelect(row);
    setFeedback('reservarFeedback','');
    document.getElementById('modalReservar').classList.add('open');
  }

  function renderReservarColabs() {
    const container=document.getElementById('reservarColabList');
    if (!container) return;
    container.innerHTML=state.reservarColabs.map((c,i) => {
      const nome=c.nome_colaborador||c.nome||'-';
      const reg=getRegionalColaborador(c);
      if (c.excluido) return `<div class="adm-colab-chip excluido"><span class="cn">${esc(nome)}</span><span class="cr">${esc(reg)}</span><button class="cx" type="button" data-restore-colab="${i}" title="Restaurar">↩</button></div>`;
      return `<div class="adm-colab-chip"><span class="cn">${esc(nome)}</span><span class="cr">${esc(reg)}</span><button class="cx" type="button" data-remove-colab="${i}" title="Excluir da reserva">×</button></div>`;
    }).join('');
  }

  async function saveReservarModal() {
    if (!state.selected) return;
    const hotelSelect=document.getElementById('resHotel');
    const typedName=document.getElementById('resHotelNome')?.value.trim()||'';
    const typedHotel=state.hoteis.find((h) => normalizeText(h.nome)===normalizeText(typedName));
    if (typedHotel && hotelSelect) hotelSelect.value=typedHotel.id;
    const opt=hotelSelect?.selectedOptions[0];
    let hotelId=hotelSelect?.value||null;
    const hotelManual=document.getElementById('resHotelNome')?.value.trim()||'';
    if (!hotelId&&!hotelManual) { setFeedback('reservarFeedback','Selecione ou informe o hotel.','err'); return; }
    let hotelRecord=state.hoteis.find((h) => normalizeText(h.nome)===normalizeText(hotelManual));
    if (hotelRecord) hotelId=hotelRecord.id;
    if (!hotelId) {
      const created=await supabase.from('hospedagem_hoteis').insert({nome:hotelManual,cidade:state.selected.cidade||null,uf:state.selected.uf||null,status:'ATIVO'}).select('*').single();
      if (created.error) { setFeedback('reservarFeedback',`Não foi possível cadastrar o hotel: ${created.error.message}`,'err'); return; }
      hotelRecord=created.data; hotelId=created.data.id; state.hoteis.push(created.data);
    }
    const comp=getComposicaoFromForm();
    const calc=calcularComposicao(comp);
    if (!calc.quartos||!calc.totalDia) { setFeedback('reservarFeedback','Informe a composição dos quartos.','err'); return; }
    const checkin=document.getElementById('resCheckin')?.value;
    const checkout=document.getElementById('resCheckout')?.value;
    if (!checkin||!checkout) { setFeedback('reservarFeedback','Informe check-in e check-out.','err'); return; }
    const excluidos=state.reservarColabs.filter((c) => c.excluido).map((c) => c.nome_colaborador||c.nome);
    const obsBase=document.getElementById('resObs')?.value.trim()||'';
    const obs=[obsBase,excluidos.length?`Colaboradores excluídos desta reserva: ${excluidos.join(', ')}`:''].filter(Boolean).join('\n');
    const diariaMedia=calc.totalDia/calc.quartos;
    const diarias=diffDays(checkin,checkout);
    const totalPrevisto=calc.totalDia*diarias;
    const payload={
      solicitacao_id:state.selected.solicitacao_id,hotel_id:hotelId,
      nome_hotel:hotelRecord?.nome||hotelManual||opt?.dataset?.nome||state.selected.hotel||null,
      cidade_hotel:opt?.dataset?.cidade||state.selected.cidade||null,uf_hotel:opt?.dataset?.uf||state.selected.uf||null,
      valor_diaria:diariaMedia,quantidade_diarias:diarias,quantidade_quartos:calc.quartos,tipo_quarto:'OUTRO',
      valor_total_previsto:totalPrevisto,data_checkin:checkin,data_checkout:checkout,
      confirmado_com:document.getElementById('resConfirmado')?.value.trim()||null,
      contato_confirmacao:document.getElementById('resContato')?.value.trim()||null,
      status_hospedagem:'CHECKIN_PREVISTO',
      observacao_hospedagem:montarObservacaoComComposicao(obs,comp),
      atualizado_por:userContext?.user?.id||null
    };
    setFeedback('reservarFeedback','Salvando reserva...');
    const result=state.selected.reserva_id
      ?await supabase.from('hospedagem_reservas').update(payload).eq('id',state.selected.reserva_id)
      :await supabase.from('hospedagem_reservas').insert({...payload,criado_por:userContext?.user?.id||null}).select('id').single();
    if (result.error) {
      const msg=String(result.error.message||'');
      setFeedback('reservarFeedback',msg.toLowerCase().includes('row-level security')?'Permissão RLS bloqueou. Verifique as políticas do Supabase.':msg,'err');
      return;
    }
    await supabase.from('hospedagem_solicitacoes').update({status_solicitacao:'RESERVADA'}).eq('id',state.selected.solicitacao_id);
    const reservaId=state.selected.reserva_id||result.data?.id||null;
    const groupedIds=Array.isArray(window.__hospedagemSolicitacoesAgrupadas)?window.__hospedagemSolicitacoesAgrupadas:[];
    const grouped=state.rows.filter((item) => groupedIds.includes(item.solicitacao_id));
    if (reservaId&&grouped.length) {
      await supabase.from('hospedagem_reserva_solicitacoes').upsert(grouped.map((item) => ({reserva_id:reservaId,solicitacao_id:item.solicitacao_id})),{onConflict:'reserva_id,solicitacao_id'});
      await supabase.from('hospedagem_solicitacoes').update({status_solicitacao:'RESERVADA'}).in('id',grouped.map((item) => item.solicitacao_id));
    }
    const incluidos=(state.reservarColabs||[]).filter((c)=>!c.excluido);
    const reservados=incluidos.filter((c)=>c.id);
    // c.id vem de _colaboradoresDetalhados (enrichRowsWithColaboradores). Se
    // faltar em algum colaborador não excluído, é sinal de que o enrich
    // falhou silenciosamente pra essa solicitação — sem isso a solicitação
    // nunca sai de "Solicitações" (redesign.js/pendingRequestRows), mesmo
    // com a reserva 100% salva. Já aconteceu (ver commit a2f39815) e não
    // pode voltar a passar batido.
    const semId=incluidos.filter((c)=>!c.id);
    let vinculoErro=null;
    if(reservaId&&reservados.length) {
      const vinculo=await supabase.from('hospedagem_reserva_colaboradores').upsert(reservados.map((c)=>({reserva_id:reservaId,solicitacao_colaborador_id:c.id,status:'HOSPEDADO'})),{onConflict:'reserva_id,solicitacao_colaborador_id'});
      if(vinculo.error) vinculoErro=vinculo.error.message;
    }
    if(semId.length||vinculoErro) {
      console.error('[adm-hotel] colaborador sem vínculo em hospedagem_reserva_colaboradores',{reservaId,semId:semId.map((c)=>c.nome_colaborador||c.nome),vinculoErro});
    }
    await enviarBoasVindasReserva(state.selected,hotelRecord||state.hoteis.find((h) => String(h.id)===String(hotelId))||{},reservaId);
    if(semId.length||vinculoErro) {
      setFeedback('reservarFeedback',`Reserva salva, mas ${semId.length?`${semId.length} colaborador(es) não foram vinculados (${semId.map((c)=>c.nome_colaborador||c.nome).join(', ')})`:'houve falha ao vincular colaboradores'} — avise o TI, a solicitação pode ficar presa em Solicitações.`,'err');
    } else {
      setFeedback('reservarFeedback','Reserva salva com sucesso.','ok');
    }
    await loadRows();
    if(!semId.length&&!vinculoErro) setTimeout(() => document.getElementById('modalReservar').classList.remove('open'),800);
  }

  async function enviarBoasVindasReserva(row,hotel,reservaId) {
    const titulo=[hotel.nome||row.hotel||'Hotel',hotel.localizacao||hotel.maps_url||hotel.link_maps||''].filter(Boolean).join('\t ');
    const message=`${titulo}\n\nOlá!\n\n🏨 Quando estiver hospedado...\n\n🚭 Não fume nas dependências do hotel;\n💸 Não deixe para pagar consumo apenas na saída;\n💍 Não deixe objetos de valor nos quartos;\n🧳 Mantenha seus pertences sempre organizados na mala se por acaso precisar sair antes do previsto;\n🔑 Se o hotel tiver recepção, sempre deixe a chave do quarto com o responsável;\n🕒 Fique atento aos horários de checkout;\n⚠️ Não deixe diárias reservadas para outros dias sem solicitação do supervisor;\n🚫 Não faça alteração de quarto sem autorização do seu supervisor;\n👖 Para serviço de lavanderia consulte antes o seu supervisor;\n🛫 Na saída, faça o checkout na recepção. Nunca saia sem avisar o hotel.\n\nBOA ESTADIA!!`;
    const recipients=(state.reservarColabs||[]).filter((c) => !c.excluido).map((c) => ({nome:c.nome_colaborador||c.nome||'Colaborador',phone:c.whatsapp||c.telefone||c.celular||c.telefone_colaborador})).filter((c) => c.phone);
    await Promise.allSettled(recipients.map(async (recipient) => {
      const {data,error}=await supabase.functions.invoke('botconversa-send',{body:{phone:String(recipient.phone).replace(/\D/g,''),nome:recipient.nome,message}});
      await supabase.from('hospedagem_mensagens').insert({solicitacao_id:row.solicitacao_id,reserva_id:reservaId,hotel_id:hotel.id||null,direcao:'SAIDA',tipo:'BOAS_VINDAS',canal:'BOTCONVERSA',destinatario:recipient.phone,conteudo:message,status:error||data?.ok===false?'ERRO':'ENVIADA',erro:error?.message||data?.error||null,enviado_em:error||data?.ok===false?null:new Date().toISOString()});
    }));
  }

  // ─── Modal: Estender ───────────────────────────────────────────────────────

  function openModalEstender(row) {
    state.selected=row;
    const colabs=getColaboradoresDetalhados(row);
    state.estenderColabs=colabs.map((c) => ({...c,fica:true}));
    document.getElementById('estenderSub').textContent=`${row.hotel||'-'} · ${[row.cidade,row.uf].filter(Boolean).join('/')}`;
    renderEstenderColabs();
    const extensionIds=Array.isArray(window.__hospedagemExtensaoSolicitacoes)?window.__hospedagemExtensaoSolicitacoes:[];
    const extensionRows=state.rows.filter((item)=>extensionIds.includes(String(item.solicitacao_id)));
    const requestedCheckout=extensionRows.map((item)=>item.data_checkout||item.data_checkout_prevista).filter(Boolean).sort().at(-1);
    document.getElementById('estenderNovoCheckout').value=requestedCheckout||row.data_checkout||row.data_checkout_prevista||'';
    document.getElementById('estenderObs').value='';
    setFeedback('estenderFeedback','');
    document.getElementById('modalEstender').classList.add('open');
  }

  function renderEstenderColabs() {
    const container=document.getElementById('estenderColabList');
    if (!container) return;
    container.innerHTML=state.estenderColabs.map((c,i) => {
      const nome=c.nome_colaborador||c.nome||'-';
      return `<label class="adm-check-colab"><input type="checkbox" checked data-estender-colab="${i}" /><span>${esc(nome)}</span></label>`;
    }).join('');
  }

  async function saveEstenderModal() {
    const novoCheckout=document.getElementById('estenderNovoCheckout')?.value||'';
    if (!novoCheckout) { setFeedback('estenderFeedback','Informe a nova data de check-out.','err'); return; }
    if (!state.selected?.reserva_id) { setFeedback('estenderFeedback','Reserva não encontrada.','err'); return; }
    const ficam=[]; const saem=[];
    (state.estenderColabs||[]).forEach((c,i) => {
      const cb=document.querySelector(`[data-estender-colab="${i}"]`);
      const nome=c.nome_colaborador||c.nome||'-';
      (cb?.checked!==false?ficam:saem).push(nome);
    });
    const obs=document.getElementById('estenderObs')?.value.trim()||'';
    setFeedback('estenderFeedback','Salvando extensão...');
    const {error}=await supabase.from('hospedagem_reservas').update({
      data_checkout:novoCheckout,
      quantidade_diarias:diffDays(state.selected.data_checkin||state.selected.data_checkin_prevista,novoCheckout),
      status_hospedagem:'HOSPEDADO',
      observacao_hospedagem:appendObservacaoProcesso(state.selected,'Extensão de reserva',[
        `Novo checkout: ${brDate(novoCheckout)}`,
        ficam.length?`Ficam: ${ficam.join(', ')}`:'',
        saem.length?`Checkout parcial: ${saem.join(', ')}`:'',
        obs
      ]),
      atualizado_por:userContext?.user?.id||null
    }).eq('id',state.selected.reserva_id);
    if (error) { setFeedback('estenderFeedback',error.message,'err'); return; }
    const extensionIds=Array.isArray(window.__hospedagemExtensaoSolicitacoes)?window.__hospedagemExtensaoSolicitacoes:[];
    if(extensionIds.length){
      await supabase.from('hospedagem_reserva_solicitacoes').upsert(extensionIds.map((solicitacao_id)=>({reserva_id:state.selected.reserva_id,solicitacao_id})),{onConflict:'reserva_id,solicitacao_id'});
      await supabase.from('hospedagem_solicitacoes').update({status_solicitacao:'RESERVADA'}).in('id',extensionIds);
      window.__hospedagemExtensaoSolicitacoes=[];
    }
    setFeedback('estenderFeedback','Extensão salva com sucesso.','ok');
    await loadRows();
    setTimeout(() => document.getElementById('modalEstender').classList.remove('open'),800);
  }

  // ─── Modal: Checkout ───────────────────────────────────────────────────────

  function openModalCheckout(row) {
    state.selected=row;
    const colabs=getColaboradoresDetalhados(row);
    const stageLabel=ANDAMENTO_STAGES.find((s) => s.bucket===painelBucket(row))?.label||'';
    document.getElementById('checkoutSub').textContent=`${row.hotel||'-'} · ${[row.cidade,row.uf].filter(Boolean).join('/')}${stageLabel?` · Estágio: ${stageLabel}`:''}`;
    document.getElementById('checkoutColabList').innerHTML=colabs.map((c,index) => {
      const nome=c.nome_colaborador||c.nome||'-';
      return `<label class="adm-colab-check"><input type="checkbox" data-checkout-colab="${index}" checked><span>${esc(nome)}</span></label>`;
    }).join('')||'<span class="muted">Nenhum colaborador</span>';
    document.getElementById('checkoutValorDiarias').textContent=money(calcularValorDiarias(row));
    document.getElementById('checkoutExtrasList').innerHTML='';
    document.getElementById('checkoutObs').value='';
    updateCheckoutTotal();
    setFeedback('checkoutFeedback','');
    document.getElementById('modalCheckout').classList.add('open');
  }

  function addCheckoutExtra() {
    const list=document.getElementById('checkoutExtrasList');
    if (!list) return;
    const row=document.createElement('div');
    row.className='adm-extra-row';
    row.dataset.extraRow='1';
    row.innerHTML=`<input data-extra-desc placeholder="Descrição" /><input data-extra-valor type="number" step="0.01" min="0" placeholder="Valor" /><select data-extra-tipo><option value="adicional">Adicional</option><option value="desconto">Desconto</option></select><button class="btn btn-secondary adm-hosp-small" type="button" data-extra-remove>×</button>`;
    list.appendChild(row);
    row.querySelector('[data-extra-remove]')?.addEventListener('click',() => { row.remove(); updateCheckoutTotal(); });
    row.querySelector('[data-extra-valor]')?.addEventListener('input',updateCheckoutTotal);
    row.querySelector('[data-extra-tipo]')?.addEventListener('change',updateCheckoutTotal);
  }

  function getCheckoutExtrasData() {
    return Array.from(document.querySelectorAll('#checkoutExtrasList [data-extra-row]')).map((row) => ({
      descricao:row.querySelector('[data-extra-desc]')?.value?.trim()||'',
      valor:Number(row.querySelector('[data-extra-valor]')?.value||0),
      tipo:row.querySelector('[data-extra-tipo]')?.value||'adicional'
    })).filter((e) => e.descricao||e.valor);
  }

  function updateCheckoutTotal() {
    const base=calcularValorDiarias(state.selected);
    const extras=getCheckoutExtrasData().reduce((s,e) => s+(e.tipo==='desconto'?-e.valor:e.valor),0);
    const total=document.getElementById('checkoutTotal');
    if (total) total.textContent=money(base+extras);
  }

  function calcularTotalCheckout() {
    const base=calcularValorDiarias(state.selected);
    return base+getCheckoutExtrasData().reduce((s,e) => s+(e.tipo==='desconto'?-e.valor:e.valor),0);
  }

  function calcularValorDiarias(row) {
    if (!row) return 0;
    const inicio=row.data_checkin||row.data_checkin_prevista;
    const fim=row.data_checkout||row.data_checkout_prevista;
    const dias=Math.max(1,diffDays(inicio,fim));
    const quartos=Math.max(1,Number(row.quantidade_quartos||1));
    const diaria=Number(row.valor_diaria||0);
    return diaria>0?diaria*quartos*dias:Number(row.valor_total_previsto||0);
  }

  async function enviarFinanceiroCheckout() {
    if (!state.selected?.reserva_id) { setFeedback('checkoutFeedback','Reserva não encontrada.','err'); return; }
    const allColabs=getColaboradoresDetalhados(state.selected);
    const selectedColabs=allColabs.filter((_,index)=>document.querySelector(`[data-checkout-colab="${index}"]`)?.checked);
    if(!selectedColabs.length){setFeedback('checkoutFeedback','Selecione ao menos um colaborador para o checkout.','err');return;}
    const proportion=allColabs.length?selectedColabs.length/allColabs.length:1;
    const extras=getCheckoutExtrasData();
    const valorDiarias=calcularValorDiarias(state.selected)*proportion;
    const valorExtras=extras.reduce((s,e)=>s+(e.tipo==='desconto'?-e.valor:e.valor),0);
    const total=valorDiarias+valorExtras;
    const obs=document.getElementById('checkoutObs')?.value.trim()||'';
    const colabs=selectedColabs.map((c) => c.nome_colaborador||c.nome).filter(Boolean).join(', ');
    const destino=[state.selected.cidade,state.selected.uf].filter(Boolean).join('/');
    const checkin=state.selected.data_checkin||state.selected.data_checkin_prevista;
    const checkout=state.selected.data_checkout||state.selected.data_checkout_prevista;
    setFeedback('checkoutFeedback','Enviando ao financeiro...');
    const pagamentoPayload={
      origem_setor:'HOSPEDAGEM',origem_tabela:'hospedagem_reservas',origem_id:state.selected.reserva_id,
      origem_codigo:state.selected.codigo||null,competencia:checkin,
      descricao:`Hospedagem ${destino}${checkin||checkout?` · ${brDate(checkin)} até ${brDate(checkout)}`:''}${colabs?` · ${colabs}`:''}`.trim(),
      favorecido_nome:state.selected.hotel||'Hotel',forma_pagamento:'PIX',valor:total,
      status:'PENDENTE',prioridade:'NORMAL',observacoes:obs||null,
      solicitado_por:userContext?.user?.id||null,solicitado_por_nome:userContext?.user?.name||null,
      atualizado_por:userContext?.user?.id||null,atualizado_por_nome:userContext?.user?.name||null
    };
    const {error}=await supabase.from('financeiro_pagamentos').upsert(pagamentoPayload,{onConflict:'origem_tabela,origem_id'});
    if (error) { setFeedback('checkoutFeedback',`${error.message}. Verifique se o módulo financeiro está configurado.`,'err'); return; }
    const finPayload={reserva_id:state.selected.reserva_id,status_financeiro:'ENVIADO_AO_FINANCEIRO',valor_total:total};
    if (state.selected.financeiro_id) await supabase.from('hospedagem_financeiro').update(finPayload).eq('id',state.selected.financeiro_id);
    else await supabase.from('hospedagem_financeiro').insert(finPayload);
    const {data:lote}=await supabase.from('hospedagem_checkout_lotes').insert({reserva_id:state.selected.reserva_id,hotel_id:state.selected.hotel_id||null,data_checkout:new Date().toISOString().slice(0,10),valor_diarias:valorDiarias,valor_extras:valorExtras,valor_total:total,status:'PENDENTE',observacoes:obs||null}).select('id').single();
    if(lote?.id) await supabase.from('hospedagem_checkout_lote_colaboradores').insert(selectedColabs.map((c)=>({lote_id:lote.id,reserva_colaborador_id:c.id||null,nome_colaborador:c.nome_colaborador||c.nome||'-'})));
    if(extras.length) await supabase.from('hospedagem_custos_extras').insert(extras.map((extra)=>({solicitacao_id:state.selected.solicitacao_id,reserva_id:state.selected.reserva_id,tipo:extra.tipo==='desconto'?'DESCONTO':'OUTROS',descricao:extra.descricao,quantidade:1,valor_unitario:extra.valor,valor_total:extra.valor})));
    const parcial=selectedColabs.length<allColabs.length;
    await supabase.from('hospedagem_reservas').update({
      status_hospedagem:parcial?'HOSPEDADO':'CHECKOUT_REALIZADO',
      observacao_hospedagem:appendObservacaoProcesso(state.selected,'Enviado ao financeiro',[money(total),extras.length?extras.map((e) => `${e.tipo==='desconto'?'Desconto':'Extra'}: ${e.descricao} ${money(e.valor)}`).join('; '):'',obs]),
      atualizado_por:userContext?.user?.id||null
    }).eq('id',state.selected.reserva_id);
    setFeedback('checkoutFeedback',parcial?'Checkout parcial registrado; os demais colaboradores permanecem hospedados.':'Checkout da equipe registrado com sucesso.','ok');
    await loadRows();
    setTimeout(() => document.getElementById('modalCheckout').classList.remove('open'),800);
  }

  // ─── PIX helpers ───────────────────────────────────────────────────────────

  function onlyPixText(value, max) {
    return String(value || '')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toUpperCase().replace(/[^A-Z0-9 $%*+\-.\/]/g, '')
      .slice(0, max);
  }
  function emv(id, value) {
    const v = String(value ?? '');
    const len = new TextEncoder().encode(v).length;
    return `${id}${String(len).padStart(2, '0')}${v}`;
  }
  function crc16Pix(payload) {
    let crc = 0xffff;
    for (let i = 0; i < payload.length; i += 1) {
      crc ^= payload.charCodeAt(i) << 8;
      for (let bit = 0; bit < 8; bit += 1) crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
    return crc.toString(16).toUpperCase().padStart(4, '0');
  }
  function buildPixPayload({ pixKey, amount, merchantName, city, txid }) {
    const key = String(pixKey || '').trim();
    if (!key) throw new Error('Informe a chave PIX.');
    const name = onlyPixText(merchantName || 'GRAO 1000', 25) || 'GRAO 1000';
    const cityName = onlyPixText(city || 'CASCAVEL', 15) || 'CASCAVEL';
    const idTx = onlyPixText(txid || 'HOSPEDAGEM', 25) || 'HOSPEDAGEM';
    const merchantInfo = emv('00', 'br.gov.bcb.pix') + emv('01', key);
    const valor = Number(amount || 0);
    const payload = [
      emv('00', '01'),
      emv('26', merchantInfo),
      emv('52', '0000'),
      emv('53', '986'),
      valor > 0 ? emv('54', valor.toFixed(2)) : '',
      emv('58', 'BR'),
      emv('59', name),
      emv('60', cityName),
      emv('62', emv('05', idTx))
    ].join('') + '6304';
    return payload + crc16Pix(payload);
  }
  function gerarPixQr() {
    try {
      const payload = buildPixPayload({
        pixKey: document.getElementById('pagarPix')?.value,
        amount: Number(document.getElementById('pagarValor')?.value || 0),
        merchantName: document.getElementById('pagarFornecedor')?.value || 'Hotel',
        city: state.selected?.cidade || 'Cascavel',
        txid: String(state.selected?.codigo || state.selected?.reserva_id || 'HOSPEDAGEM').replace(/[^a-zA-Z0-9]/g, '').slice(0,25) || 'HOSPEDAGEM'
      });
      const box = document.getElementById('pixQrBox');
      const img = document.getElementById('pixQrImg');
      const copia = document.getElementById('pixCopiaCola');
      if (img) img.src = `https://api.qrserver.com/v1/create-qr-code/?size=280x280&margin=10&data=${encodeURIComponent(payload)}`;
      if (copia) copia.value = payload;
      box?.classList.add('open');
      setFeedback('pagarFeedback','QR Code PIX gerado.','ok');
    } catch (err) {
      setFeedback('pagarFeedback', err?.message || 'Não foi possível gerar o QR Code PIX.', 'err');
    }
  }

  // ─── Modal: Pagar ──────────────────────────────────────────────────────────

  async function openModalPagar() {
    const ids=Array.isArray(window.__hospedagemAcaoLote)?window.__hospedagemAcaoLote:[];
    const selectedRows=state.rows.filter((row)=>ids.includes(row.solicitacao_id));
    const batch=selectedRows.length?selectedRows:[state.selected];
    const total=batch.reduce((sum,row)=>sum+Number(row?.valor_financeiro||calcularValorDiarias(row)||0),0)||calcularTotalCheckout();
    const hotel=getHotelById(state.selected?.hotel_id);
    document.getElementById('pagarSub').textContent=`${state.selected?.hotel||'-'} · ${money(total)}`;
    document.getElementById('pagarCnpj').value=hotel?.cnpj_cpf||'';
    document.getElementById('pagarFornecedor').value=state.selected?.hotel||'';
    let credito=0;
    state.adiantamentosAplicaveis=[];
    if(state.selected?.hotel_id){
      const {data:adiantamentos}=await supabase.from('hospedagem_adiantamentos').select('*').eq('hotel_id',state.selected.hotel_id).eq('status','DISPONIVEL').gt('saldo',0).order('created_at');
      state.adiantamentosAplicaveis=adiantamentos||[];
      credito=Math.min(total,state.adiantamentosAplicaveis.reduce((sum,item)=>sum+Number(item.saldo||0),0));
    }
    document.getElementById('pagarValor').value=Math.max(0,total-credito).toFixed(2);
    document.getElementById('pagarPix').value=hotel?.pix_chave||'';
    const dates=batch.flatMap((row)=>[row?.data_checkin||row?.data_checkin_prevista,row?.data_checkout||row?.data_checkout_prevista]).filter(Boolean).sort();
    const names=[...new Set(batch.flatMap((row)=>getColaboradoresDetalhados(row).map((c)=>c.nome_colaborador||c.nome).filter(Boolean)))];
    document.getElementById('pagarResumoSelecao').textContent=`${brDate(dates[0])} até ${brDate(dates.at(-1))} · ${names.join(', ')||'Sem colaboradores'} · ${batch.length} hospedagem(ns)${credito?` · ${money(credito)} de adiantamento aplicado`:''}`;
    const taxa=document.getElementById('pagarTaxaBancaria'); if(taxa) taxa.checked=false;
    const pixBox=document.getElementById('pixQrBox');
    pixBox?.classList.remove('open');
    const pixCopia=document.getElementById('pixCopiaCola');
    if (pixCopia) pixCopia.value='';
    const pixImg=document.getElementById('pixQrImg');
    if (pixImg) pixImg.removeAttribute('src');
    setFeedback('pagarFeedback','');
    document.getElementById('modalPagar').classList.add('open');
  }

  window.__abrirPagamentoHospedagem=(solicitacaoId)=>{
    const row=state.rows.find((item)=>String(item.solicitacao_id)===String(solicitacaoId));
    if(!row)return;
    state.selected=row;
    const extras=document.getElementById('checkoutExtrasList');
    if(extras)extras.innerHTML='';
    openModalPagar();
  };

  async function confirmarPagamento() {
    const fornecedor=document.getElementById('pagarFornecedor')?.value.trim();
    const valor=Number(document.getElementById('pagarValor')?.value||0);
    if (!fornecedor||valor<0) { setFeedback('pagarFeedback','Informe o fornecedor e o valor.','err'); return; }
    if (!state.selected?.reserva_id) { setFeedback('pagarFeedback','Reserva não encontrada.','err'); return; }
    setFeedback('pagarFeedback','Registrando pagamento...');
    const ids=Array.isArray(window.__hospedagemAcaoLote)?window.__hospedagemAcaoLote:[];
    const batch=state.rows.filter((row)=>ids.includes(row.solicitacao_id)&&row.reserva_id);
    const targets=batch.length?batch:[state.selected];
    const total=targets.reduce((sum,row)=>sum+Number(row.valor_financeiro||calcularValorDiarias(row)||0),0)||calcularTotalCheckout();
    let creditoAplicado=0;
    for(const adiantamento of (state.adiantamentosAplicaveis||[])){
      const uso=Math.min(Number(adiantamento.saldo||0),Math.max(0,total-creditoAplicado)); if(!uso)continue;
      const saldo=Number(adiantamento.saldo)-uso;
      await supabase.from('hospedagem_adiantamentos').update({saldo,status:saldo>0?'DISPONIVEL':'UTILIZADO',updated_at:new Date().toISOString()}).eq('id',adiantamento.id);
      await supabase.from('hospedagem_adiantamento_movimentos').insert({adiantamento_id:adiantamento.id,reserva_id:state.selected.reserva_id,tipo:'DEBITO',valor:uso,observacoes:'Débito automático em nova hospedagem',criado_por:userContext?.user?.id||null});
      creditoAplicado+=uso;
    }
    const recebido=valor+creditoAplicado, excedente=Math.max(0,recebido-total), pagoReserva=Math.min(total,recebido);
    const classificacao=excedente>0?'ADIANTAMENTO':pagoReserva<total?'PARCIAL':'TOTAL';
    const taxa=document.getElementById('pagarTaxaBancaria')?.checked?2:0;
    for(const target of targets){const targetTotal=calcularValorDiarias(target)||Number(target.valor_financeiro||target.valor_total_previsto||0);const paid=Math.min(targetTotal,total?pagoReserva*(targetTotal/total):pagoReserva);const targetPartial=paid<targetTotal;const finPayload={reserva_id:target.reserva_id,status_financeiro:targetPartial?'PARCIAL':'PAGO',valor_original:targetTotal,valor_total:targetTotal,valor_pago:paid,saldo:Math.max(0,targetTotal-paid),pagamento_parcial:targetPartial,data_pagamento:new Date().toISOString().slice(0,10),pago_em:new Date().toISOString(),taxa_bancaria:taxa,valor_comprovante:valor+taxa,classificacao_pagamento:classificacao,adiantamento_gerado:excedente};if(target.financeiro_id)await supabase.from('hospedagem_financeiro').update(finPayload).eq('id',target.financeiro_id);else await supabase.from('hospedagem_financeiro').insert(finPayload);await supabase.from('hospedagem_reservas').update({status_hospedagem:'CHECKOUT_REALIZADO',atualizado_por:userContext?.user?.id||null}).eq('id',target.reserva_id);}
    if(excedente>0&&state.selected.hotel_id){const {data:advance}=await supabase.from('hospedagem_adiantamentos').insert({hotel_id:state.selected.hotel_id,reserva_origem_id:state.selected.reserva_id,valor_creditado:excedente,saldo:excedente,status:'DISPONIVEL',observacoes:'Crédito gerado por pagamento superior ao total',criado_por:userContext?.user?.id||null}).select('id').single();if(advance?.id)await supabase.from('hospedagem_adiantamento_movimentos').insert({adiantamento_id:advance.id,reserva_id:state.selected.reserva_id,tipo:'CREDITO',valor:excedente,observacoes:'Adiantamento recebido',criado_por:userContext?.user?.id||null});}
    setFeedback('pagarFeedback',classificacao==='PARCIAL'?`Pagamento parcial registrado. Saldo: ${money(total-pagoReserva)}.`:classificacao==='ADIANTAMENTO'?`Pagamento registrado e ${money(excedente)} lançado como adiantamento.`:`Pagamento registrado${taxa?' com comprovante acrescido de R$ 2,00 de taxa':''}.`,'ok');
    await loadRows();
    setTimeout(() => { document.getElementById('modalPagar').classList.remove('open'); document.getElementById('modalCheckout').classList.remove('open'); },1200);
  }

  // ─── Recusar solicitação ───────────────────────────────────────────────────

  async function recusarSolicitacao(row) {
    if (!row) return;
    const motivo=window.prompt('Motivo da recusa (obrigatório):');
    if (motivo===null) return;
    const motivoLimpo=String(motivo||'').trim();
    if (!motivoLimpo) { window.alert('Informe o motivo da recusa.'); return; }
    await supabase.from('hospedagem_solicitacoes').update({status_solicitacao:'CANCELADA'}).eq('id',row.solicitacao_id);
    if (row.reserva_id) await supabase.from('hospedagem_reservas').update({status_hospedagem:'CANCELADA',observacao_hospedagem:`Recusada: ${motivoLimpo}`}).eq('id',row.reserva_id);
    await loadRows();
  }

  // ─── Shared process helpers ────────────────────────────────────────────────

  function appendObservacaoProcesso(row,titulo,linhas=[]) {
    const base=String(row?.observacao_hospedagem||'').trim();
    const corpo=linhas.filter(Boolean).join(' | ');
    const registro=`[${new Date().toLocaleString('pt-BR')}] ${titulo}${corpo?`: ${corpo}`:''}`;
    return [base,registro].filter(Boolean).join('\n');
  }

  function initialTabFromHash() {
    const hash=normalizeText(window.location.hash.replace('#',''));
    const root=content.closest('main')||content;
    if (hash.includes('hist')) return 'historico';
    if (hash.includes('aloj')) { root.classList.add('adm-menu-mode-alojamentos'); return 'alojamentos'; }
    if (hash.includes('hotel')||hash.includes('hoteis')) { root.classList.add('adm-menu-mode-hoteis'); return 'dashboard'; }
    return 'dashboard';
  }

  // ─── Event listeners ───────────────────────────────────────────────────────

  document.querySelectorAll('.adm-hosp-tab').forEach((b) => b.addEventListener('click', () => setTab(b.dataset.tab)));
  ['refreshPainel','refreshAndamento'].forEach((id) => document.getElementById(id)?.addEventListener('click',loadRows));
  const solicitadaCampos={solFiltroColaborador:'colaborador',solFiltroCidade:'cidade',solFiltroSupervisao:'supervisao',solFiltroData:'data'};
  Object.entries(solicitadaCampos).forEach(([id,campo]) => document.getElementById(id)?.addEventListener('input',(ev) => {
    state.solicitadasFiltros[campo]=ev.target.value;
    renderTabSolicitadas();
  }));
  document.getElementById('solOrdenar')?.addEventListener('change',(ev) => {
    state.solicitadasFiltros.ordenar=ev.target.value;
    renderTabSolicitadas();
  });
  document.getElementById('solDirecao')?.addEventListener('click',(ev) => {
    const asc=state.solicitadasFiltros.direcao!=='asc';
    state.solicitadasFiltros.direcao=asc?'asc':'desc';
    ev.currentTarget.textContent=asc?'↑':'↓';
    ev.currentTarget.title=asc?'Ordem crescente':'Ordem decrescente';
    renderTabSolicitadas();
  });
  document.getElementById('solLimparFiltros')?.addEventListener('click',() => {
    state.solicitadasFiltros={colaborador:'',cidade:'',supervisao:'',data:'',ordenar:'data',direcao:'desc'};
    Object.keys(solicitadaCampos).forEach((id) => { const el=document.getElementById(id); if (el) el.value=''; });
    const ordenar=document.getElementById('solOrdenar'); if (ordenar) ordenar.value='data';
    const direcao=document.getElementById('solDirecao'); if (direcao) { direcao.textContent='↓'; direcao.title='Ordem decrescente'; }
    renderTabSolicitadas();
  });
  document.getElementById('refreshHistorico')?.addEventListener('click',loadHistoricoRows);
  document.getElementById('historicoSearch')?.addEventListener('input',renderHistorico);
  document.getElementById('andamentoFiltros')?.addEventListener('click',(ev) => {
    const btn=ev.target.closest('[data-stage-filter]');
    if (!btn) return;
    state.andamentoFiltro=btn.dataset.stageFilter;
    renderTabAndamento();
  });

  // Hotel/Alojamento management
  document.getElementById('hotelSearch')?.addEventListener('input',renderHoteis);
  document.getElementById('btnAbrirCadastroHotel')?.addEventListener('click',() => { resetHotelForm(); openHotelModal(false); });
  document.getElementById('modalHotelClose')?.addEventListener('click',closeHotelModal);
  document.getElementById('modalHotelCadastro')?.addEventListener('click',(ev) => { if (ev.target.id==='modalHotelCadastro') closeHotelModal(); });
  document.getElementById('hotelForm')?.addEventListener('submit',saveHotel);
  document.getElementById('hotelClear')?.addEventListener('click',resetHotelForm);
  document.getElementById('alojSearch')?.addEventListener('input',renderAlojamentos);
  document.getElementById('btnAbrirCadastroAlojamento')?.addEventListener('click',() => { resetAlojamentoForm(); openAlojamentoModal(false); });
  document.getElementById('modalAlojamentoClose')?.addEventListener('click',closeAlojamentoModal);
  document.getElementById('modalAlojamentoCadastro')?.addEventListener('click',(ev) => { if (ev.target.id==='modalAlojamentoCadastro') closeAlojamentoModal(); });
  document.getElementById('alojForm')?.addEventListener('submit',saveAlojamento);
  document.getElementById('alojClear')?.addEventListener('click',resetAlojamentoForm);

  // Modal: Reservar
  document.getElementById('modalReservarClose')?.addEventListener('click',() => document.getElementById('modalReservar').classList.remove('open'));
  document.getElementById('modalReservar')?.addEventListener('click',(ev) => { if (ev.target.id==='modalReservar') document.getElementById('modalReservar').classList.remove('open'); });
  document.getElementById('btnConfirmarReserva')?.addEventListener('click',saveReservarModal);
  document.getElementById('resHotel')?.addEventListener('change',aplicarDiariaHotelSelecionado);
  ['resCheckin','resCheckout'].forEach((id) => document.getElementById(id)?.addEventListener('input',updateReservaTotals));
  document.getElementById('roomAdd')?.addEventListener('click',addRoomFromDraft);
  document.getElementById('roomList')?.addEventListener('input',updateReservaTotals);
  document.getElementById('roomList')?.addEventListener('click',(ev) => {
    if (!ev.target.closest('[data-room-remove]')) return;
    ev.target.closest('[data-room-row]')?.remove();
    const list=document.getElementById('roomList');
    if (list&&!list.querySelector('[data-room-row]')) list.innerHTML='<div class="adm-room-empty">Nenhum quarto adicionado.</div>';
    updateReservaTotals();
  });
  ['roomGenero','roomTipo'].forEach((id) => document.getElementById(id)?.addEventListener('change',() => {
    const el=document.getElementById('roomDiaria'); if (el) el.value='';
    atualizarDiariaSugeridaQuarto();
  }));
  document.getElementById('reservarColabList')?.addEventListener('click',(ev) => {
    const btnRemove=ev.target.closest('[data-remove-colab]');
    const btnRestore=ev.target.closest('[data-restore-colab]');
    if (btnRemove) { const i=Number(btnRemove.dataset.removeColab); if (state.reservarColabs[i]) { state.reservarColabs[i].excluido=true; renderReservarColabs(); } }
    if (btnRestore) { const i=Number(btnRestore.dataset.restoreColab); if (state.reservarColabs[i]) { state.reservarColabs[i].excluido=false; renderReservarColabs(); } }
  });

  // Modal: Estender
  document.getElementById('modalEstenderClose')?.addEventListener('click',() => document.getElementById('modalEstender').classList.remove('open'));
  document.getElementById('modalEstender')?.addEventListener('click',(ev) => { if (ev.target.id==='modalEstender') document.getElementById('modalEstender').classList.remove('open'); });
  document.getElementById('btnConfirmarEstender')?.addEventListener('click',saveEstenderModal);

  // Modal: Checkout
  document.getElementById('modalCheckoutClose')?.addEventListener('click',() => document.getElementById('modalCheckout').classList.remove('open'));
  document.getElementById('modalCheckout')?.addEventListener('click',(ev) => { if (ev.target.id==='modalCheckout') document.getElementById('modalCheckout').classList.remove('open'); });
  document.getElementById('btnAddExtra')?.addEventListener('click',addCheckoutExtra);
  document.getElementById('btnEnviarFinanceiro')?.addEventListener('click',enviarFinanceiroCheckout);
  document.getElementById('btnAbrirPagar')?.addEventListener('click',() => { openModalPagar(); });

  // Modal: Pagar
  document.getElementById('modalPagarClose')?.addEventListener('click',() => document.getElementById('modalPagar').classList.remove('open'));
  document.getElementById('modalPagar')?.addEventListener('click',(ev) => { if (ev.target.id==='modalPagar') document.getElementById('modalPagar').classList.remove('open'); });
  document.getElementById('btnGerarPix')?.addEventListener('click',gerarPixQr);
  document.getElementById('btnPagarExtra')?.addEventListener('click',()=>window.__abrirHospedagemAcao?.('extra',state.selected?.solicitacao_id));
  document.getElementById('btnPagarComprovante')?.addEventListener('click',()=>window.__abrirHospedagemAcao?.('document',state.selected?.solicitacao_id));
  document.getElementById('btnPagarFinanceiro')?.addEventListener('click',async()=>{if(!document.getElementById('pagarPix')?.value.trim()){setFeedback('pagarFeedback','Informe a chave PIX antes de enviar ao financeiro.','err');return;}const ids=Array.isArray(window.__hospedagemAcaoLote)?window.__hospedagemAcaoLote:[];const targets=state.rows.filter((row)=>ids.includes(row.solicitacao_id)&&row.reserva_id);for(const target of (targets.length?targets:[state.selected])){state.selected=target;await enviarFinanceiroCheckout();}});
  document.getElementById('btnConfirmarPagamento')?.addEventListener('click',confirmarPagamento);

  // Table delegation
  content.addEventListener('click',(ev) => {
    const btn=ev.target.closest('button[data-action]');
    if (!btn) return;
    const id=btn.dataset.id;
    if (btn.dataset.action==='reservar') { const r=state.rows.find((x) => x.solicitacao_id===id); if (r) openModalReservar(r); }
    else if (btn.dataset.action==='recusar') { const r=state.rows.find((x) => x.solicitacao_id===id); if (r) recusarSolicitacao(r); }
    else if (btn.dataset.action==='estender') { const r=state.rows.find((x) => x.solicitacao_id===id); if (r) openModalEstender(r); }
    else if (btn.dataset.action==='enviar-pagamento') {
      const r=state.rows.find((x) => x.solicitacao_id===id);
      if (!r) return;
      if (painelBucket(r)==='financeiro') { state.selected=r; openModalPagar(); }
      else openModalCheckout(r);
    }
    else if (btn.dataset.action==='edit-hotel') { const h=state.hoteis.find((x) => x.id===btn.dataset.id); if (h) fillHotelForm(h); }
    else if (btn.dataset.action==='delete-hotel') deleteHotel(btn.dataset.id);
    else if (btn.dataset.action==='edit-alojamento') { const a=(state.alojamentos||[]).find((x) => String(x.id)===String(btn.dataset.id)); if (a) fillAlojamentoForm(a); }
    else if (btn.dataset.action==='delete-alojamento') deleteAlojamento(btn.dataset.id);
  });

  // ─── Boot ──────────────────────────────────────────────────────────────────

  (async function boot() { await loadHoteis(); await loadAlojamentos(); await Promise.all([loadRows(), loadHistoricoRows()]); state.bootDone=true; setTab(initialTabFromHash()); })();
}

initProtectedPage('Módulo Hospedagem', renderContent);
