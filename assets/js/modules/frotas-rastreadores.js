import { ESTILOS_LISTA, cardFiltro, tabelaCss } from './frotas-ui-lista.js?v=20261019-frotas-manut28';

(function () {
  const MODULE_NAME = 'FROTAS_RASTREADORES';

  const styles = `
    <style>
      .fr-shell{color:#e2e2f0}.fr-head{margin-bottom:18px}.fr-kicker{color:#86efac;text-transform:uppercase;letter-spacing:.14em;font-weight:950;font-size:12px}.fr-title{margin:8px 0 6px;font-size:clamp(24px,2.4vw,34px);letter-spacing:-.04em;color:#f8fafc}.fr-sub{max-width:900px;color:#6b7280;line-height:1.55;margin:0}.fr-card{border:1px solid rgba(148,163,184,.16);border-radius:24px;background:radial-gradient(circle at top left,rgba(34,197,94,.13),transparent 34%),linear-gradient(180deg,rgba(15,23,42,.98),rgba(2,6,23,.98));box-shadow:0 20px 60px rgba(0,0,0,.28);overflow:hidden}.fr-tabs{display:flex;gap:10px;flex-wrap:wrap;padding:14px;border-bottom:1px solid rgba(148,163,184,.12);background:rgba(2,6,23,.36)}.fr-tab{border:1px solid rgba(148,163,184,.18);background:rgba(15,23,42,.72);color:#cbd5e1;border-radius:999px;padding:10px 16px;font-weight:950;cursor:pointer;font-size:13px;transition:.15s}.fr-tab.active,.fr-tab:hover{border-color:rgba(34,197,94,.55);background:rgba(22,101,52,.35);color:#f8fafc}.fr-body{padding:18px}.fr-toolbar{display:grid;grid-template-columns:minmax(220px,1fr) auto auto;gap:10px;margin-bottom:14px;align-items:center}.fr-filter-row{display:grid;grid-template-columns:repeat(4,minmax(0,1fr)) auto;gap:10px;margin-bottom:14px;align-items:center}.fr-input,.fr-select{width:100%;height:42px;border:1px solid rgba(148,163,184,.18);border-radius:14px;background:#0d0d18;color:#e2e2f0;padding:0 12px;outline:none;color-scheme:dark}.fr-select option{background:#0d0d18;color:#e2e2f0}.fr-btn{border:0;border-radius:14px;min-height:42px;padding:0 16px;font-weight:950;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:8px;font-size:13px;white-space:nowrap}.fr-btn.primary{background:linear-gradient(135deg,#16a34a,#22c55e);color:#052e16}.fr-btn.soft{border:1px solid rgba(34,197,94,.24);background:rgba(34,197,94,.12);color:#86efac}.fr-btn.ghost{border:1px solid rgba(148,163,184,.18);background:rgba(15,23,42,.72);color:#cbd5e1}.fr-btn.danger{border:1px solid rgba(239,68,68,.35);background:rgba(239,68,68,.12);color:#fca5a5}.fr-btn:disabled{opacity:.5;cursor:not-allowed}.fr-kpis{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:12px;margin:14px 0}.fr-kpi{border:1px solid rgba(34,197,94,.18);background:rgba(2,6,23,.32);border-radius:18px;padding:14px;width:100%;text-align:left;cursor:pointer;font-family:inherit;transition:.15s}.fr-kpi:hover{border-color:rgba(34,197,94,.45);background:rgba(2,6,23,.5)}.fr-kpi.active{border-color:rgba(34,197,94,.7);background:rgba(22,101,52,.22);box-shadow:0 0 0 1px rgba(34,197,94,.35) inset}.fr-kpi span{display:block;color:#93c5fd;font-size:11px;font-weight:950;letter-spacing:.1em;text-transform:uppercase}.fr-kpi strong{display:block;margin-top:8px;color:#fff;font-size:24px}.fr-table-wrap{overflow:auto;border:1px solid rgba(148,163,184,.14);border-radius:18px}.fr-table{width:100%;border-collapse:collapse;min-width:936px;table-layout:fixed}.fr-table th{padding:10px 6px;color:#bfdbfe;font-size:11px;letter-spacing:.06em;text-transform:uppercase;text-align:left;border-bottom:1px solid rgba(148,163,184,.16);background:rgba(2,6,23,.38);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.fr-table td{padding:8px 6px;height:44px;border-bottom:1px solid rgba(148,163,184,.10);color:#e2e2f0;font-size:12.5px;line-height:1.3;vertical-align:middle;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.fr-td-wrap{white-space:normal!important}.fr-table tr:hover td{background:rgba(22,101,52,.08)}.fr-badge{display:inline-flex;align-items:center;gap:5px;border-radius:999px;padding:4px 10px;font-size:10px;font-weight:950;border:1px solid rgba(148,163,184,.18);color:#cbd5e1;background:rgba(15,23,42,.72);white-space:nowrap}.fr-badge.ok{border-color:rgba(34,197,94,.35);background:rgba(22,101,52,.24);color:#bbf7d0}.fr-badge.progress{border-color:rgba(245,158,11,.34);background:rgba(245,158,11,.12);color:#fde68a}.fr-badge.none{border-color:rgba(148,163,184,.22);background:rgba(15,23,42,.6);color:#94a3b8}.fr-badge.err{border-color:rgba(239,68,68,.34);background:rgba(239,68,68,.12);color:#fecaca}.fr-badge.bfleet{border-color:rgba(99,102,241,.35);background:rgba(99,102,241,.12);color:#a5b4fc}.fr-badge.removed{border-color:rgba(239,68,68,.35);background:rgba(239,68,68,.12);color:#fecaca}.fr-imei-bfleet{font-family:monospace;font-size:12px;color:#a5b4fc;opacity:.8}.fr-mini{min-height:32px;border-radius:10px;padding:0 10px;font-size:11px}.fr-icon-btn{width:30px;height:30px;min-height:30px;min-width:30px;padding:0;font-size:14px;line-height:1;border-radius:9px;flex:none}.fr-icon-btn.soft{border-color:rgba(34,197,94,.55);background:rgba(34,197,94,.22);color:#4ade80}.fr-icon-btn.soft:hover{border-color:rgba(34,197,94,.85);background:rgba(34,197,94,.34);color:#86efac}.fr-icon-btn.danger{border-color:rgba(239,68,68,.55);background:rgba(239,68,68,.22);color:#f87171}.fr-icon-btn.danger:hover{border-color:rgba(239,68,68,.85);background:rgba(239,68,68,.34);color:#fca5a5}.fr-resp-select{width:100%;min-width:112px;height:34px;border:1px solid rgba(148,163,184,.18);border-radius:10px;background:#0d0d18;color:#e2e2f0;padding:0 8px;font-size:12px;font-weight:700;outline:none;color-scheme:dark}.fr-resp-select option{background:#0d0d18;color:#e2e2f0}.fr-resp-select.is-anderson{border-color:rgba(99,102,241,.4);color:#a5b4fc}.fr-resp-select.is-cleverson{border-color:rgba(245,158,11,.4);color:#fde68a}.fr-obs-add{display:grid;grid-template-columns:150px 1fr 30px;gap:8px;align-items:center;margin-bottom:10px}.fr-obs-add input{height:38px;border:1px solid rgba(148,163,184,.18);border-radius:12px;background:#0d0d18;color:#e2e2f0;padding:0 10px;outline:none;font-size:13px;color-scheme:dark}.fr-obs-table{width:100%;border-collapse:collapse}.fr-obs-table th{padding:6px 10px;color:#bfdbfe;font-size:11px;letter-spacing:.1em;text-transform:uppercase;text-align:left;border-bottom:1px solid rgba(148,163,184,.16)}.fr-obs-table td{padding:8px 10px;border-bottom:1px solid rgba(148,163,184,.10);font-size:13px;vertical-align:top}.fr-field input[readonly]{opacity:.85;cursor:default}.fr-empty{text-align:center;color:#94a3b8;padding:34px!important}.fr-modal-backdrop{position:fixed;inset:0;z-index:9998;background:rgba(2,6,23,.8);display:flex;align-items:center;justify-content:center;padding:22px}.fr-modal{width:min(860px,96vw);max-height:90vh;overflow:auto;border:1px solid rgba(148,163,184,.20);border-radius:24px;background:linear-gradient(180deg,#0d0d18,#020617);box-shadow:0 24px 80px rgba(0,0,0,.55);color:#e2e2f0}.fr-modal-head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;padding:20px;border-bottom:1px solid rgba(148,163,184,.16)}.fr-modal-head h3{margin:0;color:#fff;font-size:20px}.fr-modal-head p{margin:6px 0 0;color:#6b7280;font-size:13px;line-height:1.45}.fr-modal-body{padding:20px}.fr-form{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}.fr-field{display:flex;flex-direction:column;gap:6px}.fr-field.full{grid-column:1/-1}.fr-field.half{grid-column:span 2}.fr-field label{color:#bbf7d0;font-size:11px;font-weight:950;text-transform:uppercase;letter-spacing:.08em}.fr-field input,.fr-field select,.fr-field textarea{border:1px solid rgba(148,163,184,.18);border-radius:12px;background:#0d0d18;color:#e2e2f0;padding:10px 12px;outline:none;font-size:13px;color-scheme:dark}.fr-field textarea{min-height:70px;resize:vertical}.fr-field select option{background:#0d0d18}.fr-field input[type=checkbox]{width:18px;height:18px;cursor:pointer;accent-color:#22c55e}.fr-check-row{display:flex;align-items:center;gap:10px;padding:10px 0}.fr-check-row label{color:#e2e2f0;font-size:13px;font-weight:600;cursor:pointer}.fr-modal-foot{display:flex;gap:10px;justify-content:flex-end;padding:16px 20px;border-top:1px solid rgba(148,163,184,.12)}.fr-hint{font-size:11px;color:#6366f1;margin-top:3px}.fr-toast{position:fixed;right:22px;bottom:22px;z-index:9999;border:1px solid rgba(134,239,172,.32);background:rgba(22,101,52,.96);color:#dcfce7;border-radius:16px;padding:12px 16px;font-weight:950;box-shadow:0 16px 45px rgba(0,0,0,.35);opacity:0;transform:translateY(10px);pointer-events:none;transition:.2s ease}.fr-toast.show{opacity:1;transform:translateY(0)}.fr-divider{margin:16px 0 10px;color:#86efac;font-size:11px;font-weight:950;text-transform:uppercase;letter-spacing:.12em;border-bottom:1px solid rgba(34,197,94,.18);padding-bottom:6px}.fr-th-sort{cursor:pointer;user-select:none;white-space:nowrap}.fr-th-sort:hover{color:#e2e2f0}.fr-th-sort::after{content:' ⇅';opacity:.35;font-size:10px}.fr-th-sort.asc::after{content:' ↑';opacity:1;color:#86efac}.fr-th-sort.desc::after{content:' ↓';opacity:1;color:#86efac}@media(min-width:901px){.fr-modal-wide{width:min(1060px,96vw);max-height:96vh}.fr-modal-wide .fr-modal-head{padding:14px 20px}.fr-modal-wide .fr-modal-head h3{font-size:18px}.fr-modal-wide .fr-modal-head p{margin-top:2px}.fr-modal-wide .fr-modal-body{padding:6px 20px 14px}.fr-modal-wide .fr-modal-foot{padding:12px 20px}}.fr-modal-wide .fr-field input,.fr-modal-wide .fr-field select{padding:8px 10px;height:38px;box-sizing:border-box}.fr-modal-wide .fr-form{gap:10px}.fr-modal-wide .fr-check-row label{font-size:12px;white-space:nowrap;text-transform:none;letter-spacing:0}.fr-modal-wide .fr-divider{margin:12px 0 8px;padding-bottom:4px}.fr-cols2{display:grid;grid-template-columns:1fr 1fr;gap:0 26px;align-items:start}.fr-g-loc{grid-template-columns:76px 1fr 1.3fr!important}.fr-g-3{grid-template-columns:repeat(3,minmax(0,1fr))!important}.fr-g-2{grid-template-columns:repeat(2,minmax(0,1fr))!important}.fr-obs-scroll{max-height:clamp(72px,calc(100vh - 580px),260px);overflow:auto;border:1px solid rgba(148,163,184,.12);border-radius:12px}.fr-obs-scroll .fr-empty{padding:12px!important}.fr-obs-scroll .fr-obs-table th{position:sticky;top:0;background:#0d0d18}.fr-modal-wide .fr-obs-add{grid-template-columns:130px 1fr 30px;margin-bottom:8px}@media(max-width:900px){.fr-cols2{grid-template-columns:1fr}.fr-g-loc,.fr-g-3,.fr-g-2{grid-template-columns:1fr!important}}@media(max-width:1500px){.fr-body{padding:12px}.fr-toolbar,.fr-filter-row{gap:8px;margin-bottom:10px}.fr-kpis{gap:8px;margin:10px 0}.fr-kpi{padding:10px 12px;border-radius:14px}.fr-kpi span{font-size:10px;letter-spacing:.06em}.fr-kpi strong{font-size:20px;margin-top:4px}.fr-tabs{padding:10px 12px;gap:8px}.fr-tab{padding:8px 14px}.fr-head{margin-bottom:12px}.fr-title{margin:4px 0}}@media(max-width:1100px){.fr-toolbar{grid-template-columns:1fr 1fr}.fr-filter-row{grid-template-columns:repeat(3,1fr)}.fr-kpis{grid-template-columns:repeat(3,1fr)}.fr-form{grid-template-columns:repeat(2,1fr)}}@media(max-width:680px){.fr-toolbar,.fr-filter-row,.fr-kpis,.fr-form{grid-template-columns:1fr}}
      .fr-icon-btn.warn{border:1px solid rgba(245,158,11,.55);background:rgba(245,158,11,.18);color:#fbbf24;font-weight:950}.fr-icon-btn.warn:hover{border-color:rgba(245,158,11,.9);background:rgba(245,158,11,.32);color:#fde68a}.fr-icon-btn.warn.active{background:#f59e0b;border-color:#f59e0b;color:#1c1203}
      .fr-act-row{display:flex;gap:6px;flex-wrap:nowrap}.fr-act{width:30px;height:30px;border-radius:9px;border:1px solid rgba(148,163,184,.25);background:rgba(15,23,42,.72);color:#94a3b8;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;padding:0;flex:none;transition:.15s}.fr-act svg{width:16px;height:16px;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}.fr-act:hover:not(:disabled){color:#e2e2f0;border-color:rgba(148,163,184,.65)}.fr-act.done{border-color:rgba(34,197,94,.5);background:rgba(34,197,94,.16);color:#4ade80}.fr-act.current{border-color:rgba(245,158,11,.85);background:rgba(245,158,11,.2);color:#fbbf24;box-shadow:0 0 0 2px rgba(245,158,11,.18)}.fr-act.final.current{border-color:#22c55e;background:rgba(34,197,94,.3);color:#86efac;box-shadow:0 0 0 2px rgba(34,197,94,.2)}.fr-act:disabled{opacity:.3;cursor:not-allowed}.fr-act.cancel:hover{border-color:rgba(239,68,68,.75);color:#f87171;background:rgba(239,68,68,.14)}
      .fr-hist-title{margin:22px 2px 8px;color:#86efac;font-size:11px;font-weight:950;text-transform:uppercase;letter-spacing:.12em}.fr-mot-box{border:1px dashed rgba(34,197,94,.28);border-radius:12px;padding:10px 12px;margin-bottom:12px;font-size:12.5px;line-height:1.55;color:#bfdbfe}.fr-btn.warn{background:linear-gradient(135deg,#d97706,#f59e0b);color:#1c1203}
      .fr-link{background:none;border:0;padding:0;font:inherit;color:#86efac;cursor:pointer;text-align:left;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-decoration:underline;text-decoration-color:rgba(134,239,172,.35);text-underline-offset:3px}.fr-link:hover{color:#bbf7d0;text-decoration-color:currentColor}.fr-dl{display:grid;grid-template-columns:110px 1fr;gap:10px 14px;margin:0;font-size:13.5px}.fr-dl dt{color:#bbf7d0;font-size:11px;font-weight:950;text-transform:uppercase;letter-spacing:.08em;align-self:center}.fr-dl dd{margin:0;color:#e2e2f0}
      .fr-badge.info{border-color:rgba(99,102,241,.4);background:rgba(99,102,241,.16);color:#c7d2fe}.fr-maps{color:#86efac;text-decoration:none;margin-left:4px}.fr-maps:hover{color:#bbf7d0}.fr-tab-agenda{margin-left:auto;display:inline-flex;align-items:center;gap:8px}.fr-tab-agenda svg{width:16px;height:16px;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
      .fr-ag-bar{display:flex;flex-wrap:wrap;align-items:center;gap:10px;margin-bottom:12px}.fr-ag-nav{display:flex;align-items:center;gap:8px}.fr-ag-mes{min-width:200px;text-align:center;color:#f8fafc;font-size:18px;font-weight:950}.fr-ag-spacer{flex:1}.fr-ag-bar .fr-select{width:auto;min-width:150px}.fr-ag-bar .fr-input{width:230px}.fr-ag-chk{display:inline-flex;align-items:center;gap:8px;color:#cbd5e1;font-size:13px;font-weight:700;cursor:pointer}.fr-ag-chk input{width:16px;height:16px;accent-color:#22c55e;cursor:pointer}
      .fr-ag-legend{display:flex;flex-wrap:wrap;gap:16px;margin:0 0 12px;color:#94a3b8;font-size:12px}.fr-ag-legend span{display:inline-flex;align-items:center;gap:6px}.fr-ag-dot{width:10px;height:10px;border-radius:3px;display:inline-block}.fr-ag-dot.inst{background:#818cf8}.fr-ag-dot.manut{background:#f59e0b}.fr-ag-dot.done{background:#475569}.fr-ag-dot.late{background:transparent;box-shadow:0 0 0 1.5px #ef4444}
      .fr-ag-layout{display:grid;grid-template-columns:minmax(0,1fr) 350px;gap:16px;align-items:start}.fr-ag-cal{border:1px solid rgba(148,163,184,.14);border-radius:18px;overflow:hidden}.fr-ag-dow,.fr-ag-grid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr))}.fr-ag-dow div{padding:9px 6px;text-align:center;color:#bfdbfe;font-size:11px;font-weight:950;letter-spacing:.08em;text-transform:uppercase;background:rgba(2,6,23,.38);border-bottom:1px solid rgba(148,163,184,.16)}
      .fr-ag-cell{min-height:108px;padding:6px;border:0;border-right:1px solid rgba(148,163,184,.10);border-bottom:1px solid rgba(148,163,184,.10);background:transparent;color:inherit;font-family:inherit;text-align:left;cursor:pointer;display:flex;flex-direction:column;gap:3px;overflow:hidden;transition:.12s}.fr-ag-cell:nth-child(7n){border-right:0}.fr-ag-cell:hover{background:rgba(22,101,52,.10)}.fr-ag-cell.fora{opacity:.45}.fr-ag-cell.sel{background:rgba(22,101,52,.22);box-shadow:inset 0 0 0 2px rgba(34,197,94,.65)}.fr-ag-num{font-size:12px;font-weight:950;color:#cbd5e1;width:22px;height:22px;display:inline-flex;align-items:center;justify-content:center;border-radius:50%}.fr-ag-cell.hoje .fr-ag-num{background:#22c55e;color:#052e16}
      .fr-ag-chip{display:block;font-size:11px;font-weight:800;line-height:1.25;padding:2px 6px;border-radius:6px;border-left:3px solid;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.fr-ag-chip.inst{background:rgba(99,102,241,.18);border-color:#818cf8;color:#c7d2fe}.fr-ag-chip.manut{background:rgba(245,158,11,.16);border-color:#f59e0b;color:#fde68a}.fr-ag-chip.done{background:rgba(71,85,105,.22);border-color:#475569;color:#94a3b8}.fr-ag-chip.late{box-shadow:0 0 0 1px rgba(239,68,68,.75)}.fr-ag-mais{font-size:11px;font-weight:950;color:#86efac;padding-left:4px}
      .fr-ag-side{border:1px solid rgba(148,163,184,.14);border-radius:18px;padding:14px;background:rgba(2,6,23,.32)}.fr-ag-side h4{margin:0 0 2px;color:#f8fafc;font-size:15px}.fr-ag-side .sub{color:#94a3b8;font-size:12px;margin-bottom:12px}.fr-ag-ev{border:1px solid rgba(148,163,184,.16);border-left:4px solid;border-radius:12px;padding:10px 12px;margin-bottom:10px;background:rgba(15,23,42,.6)}.fr-ag-ev.inst{border-left-color:#818cf8}.fr-ag-ev.manut{border-left-color:#f59e0b}.fr-ag-ev.done{opacity:.7}.fr-ag-ev-top{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:6px}.fr-ag-ev-placa{font-size:15px;font-weight:950;color:#f8fafc}.fr-ag-ev-linha{font-size:12.5px;color:#cbd5e1;line-height:1.55;word-break:break-word}.fr-ag-ev-linha b{color:#bbf7d0;font-weight:900;font-size:10.5px;text-transform:uppercase;letter-spacing:.06em;margin-right:4px}.fr-ag-ev-acoes{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px}
      .fr-ag-aviso{border:1px solid rgba(245,158,11,.35);background:rgba(245,158,11,.10);color:#fde68a;border-radius:14px;padding:10px 14px;margin-bottom:14px;font-size:13px;line-height:1.7}.fr-ag-aviso .fr-link{color:#fde68a;font-weight:900}
      @media(max-width:1100px){.fr-ag-layout{grid-template-columns:1fr}}@media(max-width:680px){.fr-ag-cell{min-height:64px;padding:4px}.fr-ag-chip{font-size:10px;padding:1px 4px}.fr-ag-bar .fr-input,.fr-ag-bar .fr-select{width:100%}.fr-ag-mes{min-width:0;flex:1}}
    ${ESTILOS_LISTA}${tabelaCss('fr')}
      @media(min-width:1101px){.fr-toolbar{grid-template-columns:minmax(220px,1fr) auto auto auto}}
    </style>`;

  let _opts = {};

  const state = {
    veiculos: [],
    rastreadores: [],
    manutencoes: [],
    removidos: [],
    motoristas: [],
    colaboradores: [],
    colaboradoresEm: 0,
    merged: [],
    loading: false,
    syncing: false,
    filtro: 'todos',
    busca: '',
    sortCol: 'placa',
    sortDir: 'asc',
    agenda: { ano: null, mes: null, dia: null, tipo: '', busca: '', concluidos: true }
  };

  function norm(v) { return String(v || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); }
  function esc(v) { return String(v ?? '').replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;' }[c])); }
  function fmtDate(v) { if (!v) return '—'; const d = new Date(v + 'T12:00:00'); return isNaN(d) ? v : d.toLocaleDateString('pt-BR'); }

  // Normalização de placas: padrão antigo AAA0000 e Mercosul AAA0A00 são o mesmo veículo.
  // Posição 4 (índice 4): A=0, B=1, C=2, D=3, E=4, F=5, G=6, H=7, I=8, J=9
  const _L2D = { A:'0',B:'1',C:'2',D:'3',E:'4',F:'5',G:'6',H:'7',I:'8',J:'9' };
  const _D2L = { '0':'A','1':'B','2':'C','3':'D','4':'E','5':'F','6':'G','7':'H','8':'I','9':'J' };

  function rawPlaca(v) {
    return String(v || '').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^A-Z0-9]/g,'').slice(0,7);
  }

  // Chave canônica para comparação: converte posição 4 Mercosul → dígito (formato antigo)
  function placaKey(v) {
    const p = rawPlaca(v);
    if (p.length !== 7) return p;
    const c4 = p[4];
    return _L2D[c4] !== undefined ? p.slice(0,4) + _L2D[c4] + p.slice(5) : p;
  }

  // Gera ambos os formatos de uma placa para busca textual
  function placaCandidates(v) {
    const p = rawPlaca(v);
    if (p.length !== 7) return [p];
    const c4 = p[4];
    const alt = _L2D[c4] !== undefined
      ? p.slice(0,4) + _L2D[c4] + p.slice(5)           // Mercosul → antigo
      : _D2L[c4] !== undefined
        ? p.slice(0,4) + _D2L[c4] + p.slice(5)           // antigo → Mercosul
        : null;
    return alt ? [p, alt] : [p];
  }

  // Mapeamento coordenação → estado (frotas_veiculos.coordenacao)
  const COORD_ESTADO = {
    'GOIAS':'Goiás','MARINGA E TERMINAIS':'Paraná','PONTA GROSSA':'Paraná',
    'CASCAVEL':'Paraná','MATO GROSSO MT1':'Mato Grosso','RIO GRANDE DO SUL':'Rio Grande do Sul',
    'SAO PAULO':'São Paulo','SÃO PAULO':'São Paulo','LONDRINA':'Paraná',
    'MATO GROSSO DO SUL':'Mato Grosso do Sul','MATO GROSSO MT2':'Mato Grosso',
    'MINAS GERAIS':'Minas Gerais','MARANHAO':'Maranhão','MARANHÃO':'Maranhão',
    'MATO GROSSO MT3 - QUERENCIA':'Mato Grosso','GERAL':'Paraná','BAHIA':'Bahia',
    'MATO GROSSO MT4':'Mato Grosso','MATO GROSSO MT3 - CONFRESA':'Mato Grosso',
    'PARA':'Pará','PARÁ':'Pará','TOCANTINS':'Tocantins',
  };
  function coordToEstado(coord) {
    if (!coord) return '';
    return COORD_ESTADO[String(coord).trim().toUpperCase()] || '';
  }

  // Estado sempre exibido/filtrado como UF; o cadastro pode ter nome completo ("Paraná") ou sigla.
  const UF_POR_NOME = {
    'acre':'AC','alagoas':'AL','amapa':'AP','amazonas':'AM','bahia':'BA','ceara':'CE','distrito federal':'DF',
    'espirito santo':'ES','goias':'GO','maranhao':'MA','mato grosso':'MT','mato grosso do sul':'MS',
    'minas gerais':'MG','para':'PA','paraiba':'PB','parana':'PR','pernambuco':'PE','piaui':'PI',
    'rio de janeiro':'RJ','rio grande do norte':'RN','rio grande do sul':'RS','rondonia':'RO','roraima':'RR',
    'santa catarina':'SC','sao paulo':'SP','sergipe':'SE','tocantins':'TO'
  };
  const UFS = Object.values(UF_POR_NOME).sort();
  function toUF(v) {
    const t = String(v || '').trim();
    if (!t) return '';
    if (t.length === 2) return t.toUpperCase();
    return UF_POR_NOME[norm(t)] || t;
  }
  function ufDaLinha(row) {
    return toUF(row?._rastr?.estado || coordToEstado(row?.coordenacao));
  }

  function hasBfleet(v) {
    const st = String(v?.bfleet_status || '').toUpperCase();
    return Boolean(v?.bfleet_confirmado || v?.rastreador_bfleet || v?.bfleet_rastreador || st === 'COM_RASTREADOR' || st === 'ATIVO' || st === 'OK');
  }

  function toast(msg, error = false) {
    let el = document.querySelector('.fr-toast');
    if (!el) { el = document.createElement('div'); el.className = 'fr-toast'; document.body.appendChild(el); }
    el.textContent = msg;
    el.style.background = error ? 'rgba(127,29,29,.96)' : 'rgba(22,101,52,.96)';
    el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), 3600);
  }

  const STATUS_LABEL = {
    concluido:            ['ok',       '✓ Instalado'],
    em_andamento:         ['progress', '⏳ Em andamento'],
    agendado:             ['progress', '📅 Agendado'],
    aguardando_motorista: ['progress', '⏳ Aguard. motorista'],
    sem_rastreador:       ['none',     '— Sem rastreador'],
    manutencao:           ['err',      '🔧 Manutenção'],
    removido:             ['removed',  'REMOVIDO'],
  };

  function statusBadge(status, agendFrus) {
    const [cls, label] = STATUS_LABEL[status] || STATUS_LABEL.sem_rastreador;
    const frus = agendFrus > 0 ? ` <span class="fr-badge err" style="font-size:9px;padding:3px 6px" title="${agendFrus} agendamento(s) frustrado(s)">✕${agendFrus}</span>` : '';
    return `<span class="fr-badge ${cls}" title="${label}">${label}</span>${frus}`;
  }

  const STATUS_MANUTENCAO = 'manutencao';

  function fmtTelefone(v) {
    const d = String(v || '').replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '');
    if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
    if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
    return String(v || '');
  }

  function fmtDataBr(v) {
    const m = String(v || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? `${m[3]}/${m[2]}/${m[1]}` : (v || '—');
  }

  function isMaster() {
    return Boolean(_opts.auth?.user?.is_master || _opts.auth?.is_master || String(_opts.auth?.user?.role || '').toLowerCase() === 'master');
  }

  // Motorista vem sempre de frotas_veiculos.motorista_atual (atualizado pela sync de patrimônios);
  // contato e endereço vêm do cadastro de motoristas, com fallback nos colaboradores.
  // `ov` permite trocar o motorista só para uma manutenção ({ nome, contato }), sem mexer no cadastro do veículo.
  function getMotoristaInfo(row, ov = {}) {
    const nome = ov.nome || row?.motorista_atual || '';
    const key = norm(nome).trim();
    if (!key) return { nome: '', contato: '', endereco: '', cidade: '', uf: '' };
    const m = state.motoristas.find(x => norm(x.nome).trim() === key);
    const c = state.colaboradores.find(x => norm(x.nome).trim() === key);
    const endColab = c ? [c.endereco, c.bairro, [c.cidade, c.estado].filter(Boolean).join('/'), c.cep].filter(Boolean).join(', ') : '';
    return {
      nome,
      contato: ov.contato || fmtTelefone(m?.telefone || c?.whatsapp || ''),
      endereco: m?.endereco || endColab || '',
      cidade: c?.cidade || row?._rastr?.cidade || '',
      uf: toUF(c?.estado) || ufDaLinha(row)
    };
  }

  function mergeData() {
    const rastrMap = new Map((state.rastreadores || []).map(r => [placaKey(r.placa), r]));
    const removidosMap = new Map((state.removidos || []).map(r => [placaKey(r.placa), r]));

    state.merged = (state.veiculos || [])
      .filter(v => !removidosMap.has(placaKey(v.placa)))
      .map(v => ({
        ...v,
        _rastr: rastrMap.get(placaKey(v.placa)) || null,
        _hasBfleet: hasBfleet(v)
      }));
  }

  function getSortVal(row, col) {
    const r = row._rastr;
    const estado = ufDaLinha(row);
    switch (col) {
      case 'placa':              return row.placa || '';
      case 'estado':             return estado || '';
      case 'cidade':             return r?.cidade || '';
      case 'local_instalacao':   return r?.local_instalacao || '';
      case 'imei':               return r?.imei || row.bfleet_idgps || '';
      case 'data_envio':         return r?.data_envio || '';
      case 'previsao_chegada':   return r?.previsao_chegada || '';
      case 'cod_rastreio':       return r?.cod_rastreio || '';
      case 'status':             return r?.status || 'sem_rastreador';
      case 'data_instalacao':    return r?.data_instalacao || '';
      case 'agendamentos':       return r?.agendamentos_frustrados || 0;
            case 'infleet':            return r?.infleet || '';
      case 'motorista':          return motoristaDaManut(row, manutAberta(row.placa)).nome;
      case 'motivo':             return manutAberta(row.placa)?.motivo || '';
      case 'solicitado':         return manutAberta(row.placa)?.aberta_em || '';
      case 'dias':               return diasDesde(manutAberta(row.placa)?.aberta_em);
      case 'etapa':              return STATUS_MANUT_ORDEM.indexOf(statusManut(manutAberta(row.placa)));
      case 'tecnico':            return manutAberta(row.placa)?.tecnico_nome || '';
      case 'agendada':           return manutAberta(row.placa)?.data_agendada || '';
      default:                   return '';
    }
  }

  function getFiltered() {
    const busca = norm(state.busca);

    if (state.filtro === 'removidos') {
      const removidos = [...(state.removidos || [])];
      const filtrados = removidos.filter(r => {
        if (!busca) return true;
        const placas = placaCandidates(r.placa);
        return norm([...placas, r.motivo_remocao, r.removido_por_nome, r.snapshot?.nome, r.snapshot?.motorista_atual, toUF(r.snapshot?.estado), r.snapshot?.cidade, r.snapshot?.imei].join(' ')).includes(busca);
      });

      filtrados.sort((a, b) => {
        const val = (r, col) => {
          switch (col) {
            case 'placa': return r.placa || '';
            case 'status': return 'removido';
            case 'motivo': return r.motivo_remocao || '';
            case 'removido_por': return r.removido_por_nome || '';
            case 'cidade': return r.snapshot?.cidade || '';
            case 'estado': return toUF(r.snapshot?.estado);
            case 'imei': return r.snapshot?.imei || '';
            default: return r[col] || r.snapshot?.[col] || '';
          }
        };
        const va = val(a, state.sortCol);
        const vb = val(b, state.sortCol);
        const cmp = String(va).localeCompare(String(vb), 'pt-BR', { sensitivity: 'base' });
        return state.sortDir === 'asc' ? cmp : -cmp;
      });
      return filtrados;
    }

    const filtered = state.merged.filter(row => {
      const r = row._rastr;
      const status = r?.status || 'sem_rastreador';

      const EM_ANDAMENTO = ['em_andamento','aguardando_motorista','agendado'];
      if (state.filtro === 'sem_rastreador' && status !== 'sem_rastreador') return false;
      if (state.filtro === 'em_andamento' && !EM_ANDAMENTO.includes(status)) return false;
      if (state.filtro === 'concluido' && status !== 'concluido') return false;
      if (state.filtro === STATUS_MANUTENCAO && status !== STATUS_MANUTENCAO) return false;
      if (state.filtro === 'bfleet' && !row._hasBfleet) return false;

      if (!busca) return true;
      const efImei = r?.imei || row.bfleet_idgps || '';
      const placas = placaCandidates(row.placa).concat(r?.placa ? placaCandidates(r.placa) : []);
      return norm([...placas, row.nome, row.marca, row.modelo, row.motorista_atual, manutAberta(row.placa)?.motorista_nome,
        ufDaLinha(row), r?.estado, r?.cidade, r?.local_instalacao, efImei, r?.cod_rastreio, r?.contato].join(' ')).includes(busca);
    });

    const { sortCol, sortDir } = state;
    filtered.sort((a, b) => {
      const va = getSortVal(a, sortCol);
      const vb = getSortVal(b, sortCol);
      const cmp = typeof va === 'number' && typeof vb === 'number'
        ? va - vb
        : String(va).localeCompare(String(vb), 'pt-BR', { sensitivity: 'base' });
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return filtered;
  }

  function calcKpis() {
    const EM_ANDAMENTO = ['em_andamento','aguardando_motorista','agendado'];
    const total = state.merged.length;
    const removidos = state.removidos.length;
    const bfleetTotal = state.merged.filter(r => r._hasBfleet).length;
    const sem = state.merged.filter(r => !r._rastr || r._rastr.status === 'sem_rastreador').length;
    const andamento = state.merged.filter(r => EM_ANDAMENTO.includes(r._rastr?.status)).length;
    const concluido = state.merged.filter(r => r._rastr?.status === 'concluido').length;
    const manutencao = state.merged.filter(r => r._rastr?.status === STATUS_MANUTENCAO).length;
    const agenda = agendaEventos().filter(e => !e.concluido).length;
    return { total, bfleetTotal, sem, andamento, concluido, manutencao, removidos, agenda };
  }

  function renderKpis(root) {
    const el = root.querySelector('[data-kpis]');
    if (!el) return;
    const k = calcKpis();
    const item = (filtro, label, value, tone, icone) => cardFiltro({ atributo: 'data-kpi-filter', filtro, label, valor: value, tone, icone, ativo: state.filtro === filtro });
    el.innerHTML = [
      item('todos', 'Total veículos', k.total, 'blue', 'carro'),
      item('bfleet', 'Com BFleet', k.bfleetTotal, 'blue', 'sinal'),
      item('sem_rastreador', 'Sem rastreador', k.sem, 'gray', 'erro'),
      item('em_andamento', 'Em andamento', k.andamento, 'amber', 'relogio'),
      item('concluido', 'Instalados', k.concluido, 'green', 'ok'),
      item('manutencao', 'Manutenção', k.manutencao, 'amber', 'ferramenta'),
      item('removidos', 'Removidos', k.removidos, 'red', 'excluir'),
      item('agenda', 'Agenda', k.agenda, 'purple', 'calendario'),
    ].join('');
  }

  // Aplica um filtro vindo de qualquer controle (aba, select ou card de KPI) e
  // mantém os três sincronizados visualmente.
  function setFiltro(container, value) {
    state.filtro = value || 'todos';
    const agenda = state.filtro === 'agenda';
    container.querySelector('[data-list-view]').hidden = agenda;
    container.querySelector('[data-agenda-view]').hidden = !agenda;
    renderKpis(container);
    renderTable(container);
  }

  // Colunas da tabela: a visão REMOVIDOS mostra outros campos, então cabeçalho e larguras trocam junto.
  const COLS_NORMAL = [
    ['placa', 'Placa', 76], ['estado', 'UF', 40], ['cidade', 'Cidade', 0], ['local_instalacao', 'Local', 0],
    ['imei', 'IMEI', 118], ['previsao_chegada', 'Prev. Cheg.', 82], ['cod_rastreio', 'Rastreio', 100],
    ['status', 'Status', 112], ['data_instalacao', 'Instalação', 82], ['infleet', 'Infleet', 80], [null, '', 108]
  ];
  const COLS_MANUT = [
    ['placa', 'Placa', 80], ['estado', 'UF', 40], ['cidade', 'Cidade', 0], ['motorista', 'Motorista', 0],
    ['motivo', 'Motivo', 0], ['solicitado', 'Solicitado', 96], ['dias', 'Dias', 56], ['etapa', 'Status', 124], ['tecnico', 'Técnico', 110],
    ['agendada', 'Agendada', 150], [null, 'Ações', 112]
  ];
  const COLS_REMOVIDOS = [
    ['placa', 'Placa', 80], ['estado', 'UF', 46], ['cidade', 'Cidade', 0], ['local_instalacao', 'Local', 0],
    ['imei', 'IMEI', 124], ['cod_rastreio', 'Rastreio', 108], ['removido_em', 'Removido em', 130],
    ['motivo', 'Motivo', 0], ['removido_por', 'Removido por', 120], [null, '', 104]
  ];

  function renderHead(root) {
    const cols = state.filtro === 'removidos' ? COLS_REMOVIDOS : state.filtro === 'manutencao' ? COLS_MANUT : COLS_NORMAL;
    const table = root.querySelector('.fr-table');
    const key = cols === COLS_REMOVIDOS ? 'removidos' : cols === COLS_MANUT ? 'manut' : 'normal';
    if (!table || table.dataset.cols === key) return;
    table.dataset.cols = key;
    table.style.minWidth = key === 'manut' ? '1310px' : '';
    table.querySelector('colgroup').innerHTML = cols.map(c => `<col${c[2] ? ` style="width:${c[2]}px"` : ''}>`).join('');
    table.querySelector('[data-thead]').innerHTML = cols.map(c => c[0]
      ? `<th class="fr-th-sort${state.sortCol === c[0] ? ' ' + state.sortDir : ''}" data-sort="${c[0]}">${c[1]}</th>`
      : `<th>${c[1]}</th>`).join('');
  }

  function renderTable(root) {
    const el = root.querySelector('[data-table]');
    if (!el) return;
    if (state.filtro === 'agenda') { renderAgenda(root); return; }
    const modoManut = state.filtro === 'manutencao';
    const hist = root.querySelector('[data-hist]');
    if (hist) { hist.hidden = !modoManut; if (!modoManut) hist.innerHTML = ''; }
    renderHead(root);
    if (modoManut) { renderManutencao(root, el); return; }
    const rows = getFiltered();
    const ncols = state.filtro === 'removidos' ? COLS_REMOVIDOS.length : COLS_NORMAL.length;
    if (state.loading) { el.innerHTML = `<tr><td class="fr-empty" colspan="${ncols}">Carregando...</td></tr>`; return; }
    if (!rows.length) { el.innerHTML = `<tr><td class="fr-empty" colspan="${ncols}">Nenhum veículo encontrado.</td></tr>`; return; }

    if (state.filtro === 'removidos') {
      el.innerHTML = rows.map(r => {
        const snap = r.snapshot || {};
        const uf = toUF(snap.estado) || '—';
        return `<tr>
          <td><strong>${esc(r.placa)}</strong></td>
          <td title="${esc(uf)}">${esc(uf)}</td>
          <td title="${esc(snap.cidade || '—')}">${esc(snap.cidade || '—')}</td>
          <td title="${esc(snap.local_instalacao || '—')}">${esc(snap.local_instalacao || '—')}</td>
          <td>${snap.imei ? `<span style="font-family:monospace;font-size:11.5px">${esc(snap.imei)}</span>` : '—'}</td>
          <td style="font-family:monospace;font-size:11.5px">${esc(snap.cod_rastreio || '—')}</td>
          <td>${r.removido_em ? new Date(r.removido_em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—'}</td>
          <td title="${esc(r.motivo_remocao || '—')}">${esc(r.motivo_remocao || '—')}</td>
          <td title="${esc(r.removido_por_nome || '—')}">${esc(r.removido_por_nome || '—')}</td>
          <td><button class="fr-btn soft fr-mini" data-restore="${esc(r.id)}" title="Desfazer a remoção e devolver à relação de instalação">↺ Restaurar</button></td>
        </tr>`;
      }).join('');
      el.querySelectorAll('[data-restore]').forEach(btn => {
        btn.addEventListener('click', () => openRestoreModal(root, btn.dataset.restore));
      });
      return;
    }

    el.innerHTML = rows.map(row => {
      const r = row._rastr;
      const status = r?.status || 'sem_rastreador';
      const agendFrus = r?.agendamentos_frustrados || 0;

      // IMEI: manual tem prioridade; fallback é idgps da BFleet (cor roxa indica a origem)
      const imeiManual = r?.imei;
      const imeiBfleet = row.bfleet_idgps;
      const imeiCell = imeiManual
        ? `<span style="font-family:monospace;font-size:11.5px">${esc(imeiManual)}</span>`
        : imeiBfleet
          ? `<span class="fr-imei-bfleet" title="IMEI vindo da BFleet">${esc(imeiBfleet)}</span>`
          : '—';

      const bfleetTag = row._hasBfleet && !r
        ? ' <span class="fr-badge bfleet" style="font-size:9px;padding:3px 6px">BFleet</span>'
        : '';
      const uf = ufDaLinha(row) || '—';
      const localInstalacao = r?.local_instalacao || '—';

      return `<tr>
        <td><strong>${esc(row.placa)}</strong>${bfleetTag}</td>
        <td title="${esc(uf)}">${esc(uf)}</td>
        <td title="${esc(r?.cidade || '—')}">${esc(r?.cidade || '—')}</td>
        <td title="${esc(localInstalacao)}">${esc(localInstalacao)}</td>
        <td>${imeiCell}</td>
        <td>${r?.previsao_chegada ? fmtDate(r.previsao_chegada) : '—'}</td>
        <td style="font-family:monospace;font-size:11.5px">${esc(r?.cod_rastreio || '—')}</td>
        <td>${statusBadge(status, agendFrus)}</td>
        <td>${r?.data_instalacao ? fmtDate(r.data_instalacao) : '—'}</td>
        <td>${r?.infleet === 'RETIRADO'
          ? '<span class="fr-badge ok">RETIRADO</span>'
          : r?.infleet === 'PENDENTE'
            ? '<span class="fr-badge err">PENDENTE</span>'
            : '<span class="fr-badge none">—</span>'}</td>
        <td><div style="display:flex;gap:6px;flex-wrap:nowrap"><button class="fr-btn soft fr-mini fr-icon-btn" data-edit="${esc(row.placa)}" title="Editar" aria-label="Editar">✎</button><button class="fr-btn fr-mini fr-icon-btn warn${status === STATUS_MANUTENCAO ? ' active' : ''}" data-manut="${esc(row.placa)}" title="${status === STATUS_MANUTENCAO ? 'Em manutenção — abrir' : 'Enviar para manutenção'}" aria-label="Manutenção">!</button><button class="fr-btn danger fr-mini fr-icon-btn" data-remove="${esc(row.placa)}" title="Remover" aria-label="Remover">✕</button></div></td>
      </tr>`;
    }).join('');

    el.querySelectorAll('[data-edit]').forEach(btn => {
      btn.addEventListener('click', () => openModal(root, btn.dataset.edit));
    });
    el.querySelectorAll('[data-manut]').forEach(btn => {
      btn.addEventListener('click', () => {
        const row = state.merged.find(v => v.placa === btn.dataset.manut);
        if (row?._rastr?.status === STATUS_MANUTENCAO) setFiltro(root, STATUS_MANUTENCAO);
        else openManutStart(root, btn.dataset.manut);
      });
    });
    el.querySelectorAll('[data-remove]').forEach(btn => {
      btn.addEventListener('click', () => openRemoveModal(root, btn.dataset.remove));
    });
  }

  function openModal(root, placa) {
    const row = state.merged.find(v => v.placa === placa);
    if (!row) return;
    const r = row._rastr || {};
    const bfleetImei = row.bfleet_idgps || '';
    const isBfleet = row._hasBfleet;
    const mot = getMotoristaInfo(row);
    const estadoSugerido = toUF(r.estado || coordToEstado(row.coordenacao));
    const ufOpcoes = (UFS.includes(estadoSugerido) || !estadoSugerido ? UFS : [...UFS, estadoSugerido].sort())
      .map(u => `<option value="${esc(u)}" ${u === estadoSugerido ? 'selected' : ''}>${esc(u)}</option>`).join('');

    const backdrop = document.createElement('div');
    backdrop.className = 'fr-modal-backdrop';
    backdrop.innerHTML = `
      <div class="fr-modal fr-modal-wide" role="dialog" aria-modal="true">
        <div class="fr-modal-head">
          <div>
            <h3>Rastreador · ${esc(placa)} ${isBfleet ? '<span class="fr-badge bfleet" style="font-size:11px">BFleet</span>' : ''}</h3>
            <p>${esc([row.nome || row.marca, row.modelo].filter(Boolean).join(' '))}${(row.nome || row.marca || row.modelo) ? ' · ' : ''}Motorista: ${esc(mot.nome || '—')}</p>
          </div>
          <button class="fr-btn ghost fr-mini" data-close>✕</button>
        </div>
        <div class="fr-modal-body">
          <div class="fr-cols2">
            <div class="fr-col">
            <div class="fr-divider">Localização</div>
            <div class="fr-form fr-g-loc">
              <div class="fr-field">
                <label>UF</label>
                <select name="estado"><option value="">—</option>${ufOpcoes}</select>
              </div>
              <div class="fr-field">
                <label>Cidade</label>
                <input name="cidade" value="${esc(r.cidade || '')}" placeholder="Ex: São Paulo" />
              </div>
              <div class="fr-field">
                <label>Local de Instalação</label>
                <input name="local_instalacao" value="${esc(r.local_instalacao || '')}" placeholder="Ex: Garagem central" />
              </div>
            </div>

            <div class="fr-divider">Contrato</div>
            <div class="fr-form fr-g-3">
              <div class="fr-field">
                <label>Nº Contrato</label>
                <input type="number" name="contrato" value="${r.contrato || ''}" placeholder="Ex: 110" />
              </div>
              <div class="fr-field">
                <label>Termo assinado</label>
                <input name="termo_assinado" value="${esc(r.termo_assinado || '')}" placeholder="Ex: Aguardando" />
              </div>
              <div class="fr-field" style="justify-content:flex-end">
                <div class="fr-check-row" style="padding:9px 0">
                  <input type="checkbox" name="contrato_assinado" id="chk_contrato_${esc(placa)}" ${r.contrato_assinado ? 'checked' : ''} />
                  <label for="chk_contrato_${esc(placa)}">Contrato assinado</label>
                </div>
              </div>
            </div>

            <div class="fr-divider">Datas</div>
            <div class="fr-form fr-g-3">
              <div class="fr-field">
                <label>Envio</label>
                <input type="date" name="data_envio" value="${r.data_envio || ''}" />
              </div>
              <div class="fr-field">
                <label>Prev. Chegada</label>
                <input type="date" name="previsao_chegada" value="${r.previsao_chegada || ''}" />
              </div>
              <div class="fr-field">
                <label title="Com status Agendado, esta é a data da instalação que aparece na Agenda">Instalação</label>
                <input type="date" name="data_instalacao" value="${r.data_instalacao || ''}" title="Com status Agendado, esta é a data da instalação que aparece na Agenda" />
              </div>
            </div>
            </div>
            <div class="fr-col">
            <div class="fr-divider">Rastreador</div>
            <div class="fr-form fr-g-3">
              <div class="fr-field">
                <label>IMEI</label>
                <input name="imei" value="${esc(r.imei || bfleetImei)}" placeholder="Ex: 354321000000000" ${bfleetImei ? `title="BFleet idgps: ${esc(bfleetImei)}"` : ''} />
              </div>
              <div class="fr-field">
                <label>Cód. Rastreio</label>
                <input name="cod_rastreio" value="${esc(r.cod_rastreio || '')}" placeholder="Ex: BR123456789" />
              </div>
              <div class="fr-field">
                <label>Status</label>
                <select name="status" ${r.status === 'manutencao' ? 'disabled title="Em manutenção: gerencie as etapas na aba Manutenção (botão !)."' : ''}>
                  <option value="sem_rastreador" ${(!r.status || r.status === 'sem_rastreador') ? 'selected' : ''}>Sem rastreador</option>
                  <option value="aguardando_motorista" ${r.status === 'aguardando_motorista' ? 'selected' : ''}>Aguardando resposta motorista</option>
                  <option value="agendado" ${r.status === 'agendado' ? 'selected' : ''}>Agendado instalação</option>
                  <option value="concluido" ${(r.status === 'concluido' || (isBfleet && !r.status)) ? 'selected' : ''}>Instalado</option>
                  ${r.status === 'manutencao' ? '<option value="manutencao" selected>Em manutenção</option>' : ''}
                </select>
              </div>
              <div class="fr-field">
                <label>Infleet</label>
                <select name="infleet">
                  <option value="" ${!r.infleet ? 'selected' : ''}>— Não definido</option>
                  <option value="PENDENTE" ${r.infleet === 'PENDENTE' ? 'selected' : ''}>PENDENTE</option>
                  <option value="RETIRADO" ${r.infleet === 'RETIRADO' ? 'selected' : ''}>RETIRADO</option>
                </select>
              </div>
              <div class="fr-field">
                <label>Agend. frustrados</label>
                <input type="number" name="agendamentos_frustrados" value="${r.agendamentos_frustrados || 0}" min="0" />
              </div>
            </div>

            <div class="fr-divider">Motorista</div>
            <div class="fr-form fr-g-3">
              <div class="fr-field">
                <label>Motorista</label>
                <input value="${esc(mot.nome || '')}" placeholder="—" title="Atualizado pela sync de patrimônios." readonly />
              </div>
              <div class="fr-field">
                <label>Contato</label>
                <input value="${esc(mot.contato)}" placeholder="Sem telefone cadastrado" readonly />
              </div>
              <div class="fr-field">
                <label>Endereço</label>
                <input value="${esc(mot.endereco)}" placeholder="Sem endereço cadastrado" title="${esc(mot.endereco)}" readonly />
              </div>
            </div>
            </div>
          </div>

            <div class="fr-divider">Observações</div>
            <div class="fr-obs" data-obs>
              <div class="fr-obs-add">
                <input type="date" data-obs-data value="${new Date().toISOString().slice(0, 10)}" />
                <input type="text" data-obs-desc placeholder="Descrição da observação" maxlength="500" />
                <button type="button" class="fr-btn soft fr-icon-btn" data-obs-add title="Adicionar observação" aria-label="Adicionar observação">+</button>
              </div>
              <div class="fr-obs-scroll">
                <table class="fr-obs-table"><thead><tr><th style="width:92px">Data</th><th>Descrição</th><th style="width:110px">Usuário</th><th style="width:36px"></th></tr></thead><tbody data-obs-list><tr><td colspan="4" class="fr-empty">Carregando...</td></tr></tbody></table>
              </div>
            </div>
        </div>
        <div class="fr-modal-foot">
          <button class="fr-btn ghost" data-close>Cancelar</button>
          <button class="fr-btn primary" data-save>Salvar</button>
        </div>
      </div>`;

    document.body.appendChild(backdrop);
    backdrop.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => backdrop.remove()));
    backdrop.addEventListener('click', e => { if (e.target === backdrop) backdrop.remove(); });
    backdrop.querySelector('[data-save]').addEventListener('click', async () => {
      await saveRastreador(root, placa, row.id, backdrop);
    });
    initObservacoes(backdrop, placa);
  }

  // Observações são registros datados gravados na hora (+); excluir só master (também garantido por RLS).
  async function initObservacoes(backdrop, placa) {
    const list = backdrop.querySelector('[data-obs-list]');
    const key = rawPlaca(placa);
    const master = isMaster();

    const render = (rows) => {
      if (!rows.length) { list.innerHTML = '<tr><td colspan="4" class="fr-empty" style="padding:14px!important">Nenhuma observação.</td></tr>'; return; }
      list.innerHTML = rows.map(o => `<tr>
        <td>${esc(fmtDataBr(o.data))}</td>
        <td class="fr-td-wrap">${esc(o.descricao)}</td>
        <td>${esc(o.criado_por_nome || '—')}</td>
        <td>${master ? `<button type="button" class="fr-btn danger fr-mini fr-icon-btn" data-obs-del="${esc(o.id)}" title="Excluir (master)" aria-label="Excluir">✕</button>` : ''}</td>
      </tr>`).join('');
      list.querySelectorAll('[data-obs-del]').forEach(b => b.addEventListener('click', async () => {
        if (!confirm('Excluir esta observação?')) return;
        const { error } = await _opts.supabase.from('frotas_rastreadores_observacoes').delete().eq('id', b.dataset.obsDel);
        if (error) { toast(error.message || 'Sem permissão para excluir.', true); return; }
        const apagada = rows.find(o => String(o.id) === b.dataset.obsDel);
        notificarEquipe({ assunto: 'observacao', titulo: `Observação excluída · ${placa}`, descricao: apagada ? `${fmtDataBr(apagada.data)} — ${apagada.descricao}` : '', placa, filtro: manutAberta(placa) ? 'manutencao' : 'todos', prioridade: 'atencao' });
        await load();
      }));
    };

    const load = async () => {
      const { data, error } = await _opts.supabase
        .from('frotas_rastreadores_observacoes')
        .select('id,data,descricao,criado_por_nome,created_at')
        .eq('placa', key)
        .order('data', { ascending: false })
        .order('created_at', { ascending: false });
      if (error) { list.innerHTML = `<tr><td colspan="4" class="fr-empty">${esc(error.message || 'Erro ao carregar observações.')}</td></tr>`; return; }
      render(data || []);
    };

    backdrop.querySelector('[data-obs-add]').addEventListener('click', async () => {
      const descEl = backdrop.querySelector('[data-obs-desc]');
      const dataEl = backdrop.querySelector('[data-obs-data]');
      const descricao = descEl.value.trim();
      if (!descricao) { descEl.focus(); return; }
      const { error } = await _opts.supabase.from('frotas_rastreadores_observacoes').insert({
        placa: key,
        data: dataEl.value || new Date().toISOString().slice(0, 10),
        descricao,
        criado_por_nome: _opts.auth?.user?.name || _opts.auth?.user?.full_name || _opts.auth?.user?.nome || _opts.auth?.user?.email || null
      });
      if (error) { toast(error.message || 'Erro ao adicionar observação.', true); return; }
      descEl.value = '';
      notificarEquipe({ assunto: 'observacao', titulo: `Nova observação · ${placa}`, descricao: `${fmtDataBr(dataEl.value)} — ${descricao}`, placa, filtro: manutAberta(placa) ? 'manutencao' : 'todos' });
      await load();
    });
    backdrop.querySelector('[data-obs-desc]').addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); backdrop.querySelector('[data-obs-add]').click(); }
    });

    await load();
  }

  function readModal(backdrop) {
    const get = (name) => backdrop.querySelector(`[name="${name}"]`)?.value?.trim() || null;
    const chk = (name) => backdrop.querySelector(`[name="${name}"]`)?.checked || false;
    const num = (name) => { const v = parseInt(backdrop.querySelector(`[name="${name}"]`)?.value || '0', 10); return isNaN(v) ? 0 : v; };
    return {
      contrato: parseInt(get('contrato') || '0', 10) || null,
      contrato_assinado: chk('contrato_assinado'),
      termo_assinado: get('termo_assinado'),
      estado: get('estado'),
      cidade: get('cidade'),
      local_instalacao: get('local_instalacao'),
      imei: get('imei'),
      cod_rastreio: get('cod_rastreio'),
      status: get('status') || 'sem_rastreador',
      data_envio: get('data_envio') || null,
      previsao_chegada: get('previsao_chegada') || null,
      data_instalacao: get('data_instalacao') || null,
      agendamentos_frustrados: num('agendamentos_frustrados'),
      infleet: get('infleet') || null
    };
  }


  // ── Manutenção de rastreador ────────────────────────────────────────────────
  // Etapas: disponibilidade com o motorista → alinhar com o técnico → agendar → finalizar.
  // Finalizar devolve o rastreador para "Instalado" (Com BFleet) e a linha fica no histórico.
  const TABLE_MANUT = 'frotas_rastreadores_manutencoes';

  function userName() {
    const u = _opts.auth?.user;
    return u?.name || u?.full_name || u?.nome || _opts.auth?.profile?.full_name || u?.email || null;
  }

  // ── Notificações (sininho) ───────────────────────────────────────────────────
  // Toda alteração feita aqui avisa a equipe com acesso a Rastreadores. Quem fez a ação não recebe o próprio
  // aviso (meta.excluir_autor). O link abre direto na placa: aba Rastreadores + filtro + placa.
  // Nunca bloqueia nem quebra a ação que o originou.
  const NOTIF_MODULO = 'frotas_rastreadores';
  const NOTIF_TIPOS = { manutencao: ['frotas_rastreador_manutencao', 'wrench'], observacao: ['frotas_rastreador_observacao', 'message-square'], cadastro: ['frotas_rastreador', 'wrench'] };

  function linkRastreador(filtro, placa) {
    const q = new URLSearchParams({ aba: 'rastreadores', filtro: filtro || 'todos' });
    if (placa) q.set('placa', placa);
    return `frotas-cadastros?${q}`;
  }

  async function notificarEquipe({ assunto, titulo, descricao, placa, filtro, prioridade }) {
    try {
      const [tipo, icone] = NOTIF_TIPOS[assunto];
      const autor = userName();
      const payload = {
        tipo,
        titulo,
        descricao: `${autor ? autor + ': ' : ''}${descricao || ''}`.slice(0, 400),
        prioridade: prioridade || 'normal',
        icone,
        modulo_url: linkRastreador(filtro, placa),
        destinatario_modulo: NOTIF_MODULO,
        referencia_tabela: 'frotas_rastreadores',
        referencia_id: placa ? rawPlaca(placa) : null,
        meta: { excluir_autor: true, placa: placa ? rawPlaca(placa) : null, por: autor }
      };
      const engine = window.__painelNotifEngine;
      if (engine?.criarNotificacao) { await engine.criarNotificacao(payload); return; }
      const { error } = await _opts.supabase.from('painel_notificacoes').insert({ ...payload, gerado_por_usuario_id: _opts.auth?.user?.id || null });
      if (error) console.warn('[FROTAS_RASTREADORES] Falha ao notificar a equipe:', error);
    } catch (err) {
      console.warn('[FROTAS_RASTREADORES] Falha ao notificar a equipe:', err);
    }
  }

  function manutAberta(placa) {
    const key = placaKey(placa);
    return state.manutencoes.find(m => m.situacao === 'aberta' && placaKey(m.placa) === key) || null;
  }

  // Data em que a placa entrou em manutenção, sempre no horário de Brasília.
  function fmtDataSolicitada(v) {
    const d = new Date(v);
    return isNaN(d) ? '—' : d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  }

  function fmtDateTime(v) {
    const d = new Date(v);
    return isNaN(d) ? '—' : d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' });
  }

  function diasDesde(iso) {
    const d = new Date(iso);
    return isNaN(d) ? 0 : Math.max(0, Math.floor((Date.now() - d.getTime()) / 86400000));
  }

  function setStatusRastreador(row, status) {
    return _opts.supabase.from('frotas_rastreadores').upsert({
      placa: row._rastr?.placa || rawPlaca(row.placa),
      veiculo_id: row.id || row._rastr?.veiculo_id || null,
      status
    }, { onConflict: 'placa' });
  }

  async function criarManutencao(row, motivo) {
    const anterior = row._rastr?.status;
    const { data, error } = await _opts.supabase.from(TABLE_MANUT).insert({
      placa: rawPlaca(row.placa),
      veiculo_id: row.id || null,
      motivo: motivo || null,
      status_anterior: anterior && anterior !== 'manutencao' ? anterior : null,
      aberta_por_nome: userName(),
      linha_tempo: [{ evento: 'Enviada para manutenção', em: new Date().toISOString(), por: userName() }]
    }).select().single();
    if (error) {
      // Já existe manutenção aberta para a placa (aberta por outro usuário ou pela rotina automática depois que a
      // tela carregou): índice único uq_frotas_rastr_manut_aberta. Reaproveita a aberta em vez de falhar.
      if (error.code === '23505') {
        const { data: aberta } = await _opts.supabase.from(TABLE_MANUT).select('*')
          .eq('placa', rawPlaca(row.placa)).eq('situacao', 'aberta').limit(1);
        if (aberta?.length) return { ...aberta[0], __existente: true };
      }
      throw error;
    }
    return data;
  }

  function openManutStart(root, placa) {
    const row = state.merged.find(v => v.placa === placa);
    if (!row) return;

    const backdrop = document.createElement('div');
    backdrop.className = 'fr-modal-backdrop';
    backdrop.innerHTML = `
      <div class="fr-modal" role="dialog" aria-modal="true" style="width:min(620px,96vw)">
        <div class="fr-modal-head">
          <div>
            <h3>Enviar para manutenção · ${esc(placa)}</h3>
            <p>A placa vai para a aba <strong>Manutenção</strong>, começando em <strong>Disponibilidade com o motorista</strong>. Ao finalizar, volta para Instalado (Com BFleet) e a manutenção fica no histórico.</p>
          </div>
          <button class="fr-btn ghost fr-mini" data-close>✕</button>
        </div>
        <div class="fr-modal-body">
          <div class="fr-field full">
            <label>Motivo (opcional)</label>
            <textarea name="motivo" placeholder="Ex: rastreador parou de comunicar, fio solto, trocar chip..."></textarea>
          </div>
        </div>
        <div class="fr-modal-foot">
          <button class="fr-btn ghost" data-close>Cancelar</button>
          <button class="fr-btn warn" data-confirm>Enviar para manutenção</button>
        </div>
      </div>`;

    document.body.appendChild(backdrop);
    backdrop.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => backdrop.remove()));
    backdrop.addEventListener('click', e => { if (e.target === backdrop) backdrop.remove(); });
    backdrop.querySelector('[name="motivo"]').focus();
    backdrop.querySelector('[data-confirm]').addEventListener('click', async () => {
      const btn = backdrop.querySelector('[data-confirm]');
      btn.disabled = true;
      btn.textContent = 'Enviando...';
      try {
        const rec = await criarManutencao(row, backdrop.querySelector('[name="motivo"]').value.trim());
        const { error } = await setStatusRastreador(row, 'manutencao');
        if (error) {
          if (!rec.__existente) await _opts.supabase.from(TABLE_MANUT).delete().eq('id', rec.id);
          throw error;
        }
        toast(rec.__existente ? `${placa} já estava em Manutenção; a tela foi atualizada.` : `${placa} enviada para Manutenção.`);
        notificarEquipe({ assunto: 'manutencao', titulo: `Rastreador enviado para manutenção · ${placa}`, descricao: backdrop.querySelector('[name="motivo"]').value.trim() || 'Sem motivo informado', placa, filtro: 'manutencao' });
        backdrop.remove();
        await loadData(root);
      } catch (err) {
        toast(err?.message || 'Erro ao enviar para manutenção.', true);
        btn.disabled = false;
        btn.textContent = 'Enviar para manutenção';
      }
    });
  }

  // Etapa atual derivada dos dados: a primeira que ainda não foi registrada.
  function etapaDe(m) {
    if (!m?.disponibilidade_motorista) return 'disponibilidade';
    if (!m?.tecnico_nome) return 'tecnico';
    if (!m?.data_agendada) return 'agendamento';
    return 'finalizar';
  }

  // Status da manutenção: o usuário escolhe na modal Editar (coluna status_manut). A modal sugere o status
  // conforme os campos são preenchidos, mas quem decide é o usuário. A etapa acima só diz qual é a próxima ação.
  const STATUS_MANUT_ORDEM = ['pendente', 'motorista', 'tecnico', 'agendado'];
  const STATUS_MANUT_LABEL = {
    pendente: ['none', 'Pendente'],
    motorista: ['progress', 'Motorista OK'],
    tecnico: ['info', 'Técnico OK'],
    agendado: ['ok', 'Agendado']
  };

  // O mais avançado que os campos preenchidos indicam.
  function statusDosCampos(m) {
    if (m?.data_agendada) return 'agendado';
    if (m?.tecnico_nome) return 'tecnico';
    if (m?.disponibilidade_motorista) return 'motorista';
    return 'pendente';
  }

  function statusManut(m) {
    return STATUS_MANUT_ORDEM.includes(m?.status_manut) ? m.status_manut : statusDosCampos(m);
  }

  function motoristaDaManut(row, m) {
    return getMotoristaInfo(row, { nome: m?.motorista_nome, contato: m?.motorista_contato });
  }

  // Só http(s): o link vem de digitação livre e vai parar num href.
  function safeUrl(v) {
    const s = String(v || '').trim();
    if (!s) return '';
    try {
      const u = new URL(/^[a-z][a-z0-9+.-]*:/i.test(s) ? s : 'https://' + s);
      return /^https?:$/.test(u.protocol) ? u.href : '';
    } catch (e) { return ''; }
  }

  function mapsLink(url) {
    const href = safeUrl(url);
    return href ? `<a class="fr-maps" href="${esc(href)}" target="_blank" rel="noopener noreferrer" title="Abrir a localização no Maps" aria-label="Abrir a localização no Maps">📍</a>` : '';
  }

  const ICONS = {
    finalizar: '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
    editar: '<svg viewBox="0 0 24 24"><path d="M4 20h4L19.5 8.5a2.1 2.1 0 0 0-3-3L5 17z"/><path d="M14.5 7.5l3 3"/></svg>',
    cancelar: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>'
  };

  // Grava campos da manutenção (cria o registro se a placa estava em manutenção sem ele) e recalcula a etapa.
  // `evento` é um texto ou uma lista: cada item vira uma linha na linha do tempo.
  async function gravarManutencao(row, patch, evento) {
    let rec = manutAberta(row.placa);
    if (!rec) rec = await criarManutencao(row, null);
    const linha = [...(rec.linha_tempo || [])];
    [].concat(evento || []).filter(Boolean).forEach(e => linha.push({ evento: e, em: new Date().toISOString(), por: userName() }));
    const full = { ...patch, linha_tempo: linha };
    if (!patch.situacao) full.etapa = etapaDe({ ...rec, ...patch });
    // Sem .single(): a RLS barra o UPDATE sem erro (0 linhas) e o PostgREST responderia só "Cannot coerce the result...".
    const { data, error } = await _opts.supabase.from(TABLE_MANUT).update(full).eq('id', rec.id).select();
    if (error) throw error;
    if (!data?.length) throw new Error('Não foi possível gravar: a manutenção já foi encerrada ou seu usuário não tem acesso ao menu Rastreadores. Atualize a tela e tente de novo.');
    return data[0];
  }

  const soDigitos = (s) => String(s || '').replace(/\D/g, '');

  // Nomes do cadastro de motoristas e dos colaboradores, sem repetição, para sugerir na troca de motorista.
  function nomesDePessoas() {
    const vistos = new Set();
    const nomes = [];
    [...state.motoristas, ...state.colaboradores].forEach(p => {
      const nome = String(p.nome || '').trim();
      const k = norm(nome);
      if (nome && !vistos.has(k)) { vistos.add(k); nomes.push(nome); }
    });
    return nomes;
  }

  // Edição da manutenção numa modal só: motorista (com opção de alterar) e disponibilidade, técnico,
  // agendamento (com link do Maps) e observações. Salvar grava tudo de uma vez e registra na linha do
  // tempo só o que mudou; as observações são gravadas na hora, como no cadastro do rastreador.
  function openManutEditar(root, placa, foco) {
    const row = state.merged.find(v => v.placa === placa);
    if (!row) return;
    const rec = manutAberta(row.placa);
    const mot = motoristaDaManut(row, rec);
    const v = (k) => esc(rec?.[k] || '');
    const dlId = `fr-dl-mot-${Date.now()}`;
    const statusAtual = statusManut(rec);
    const [clsStatus, labelStatus] = STATUS_MANUT_LABEL[statusAtual];
    const sub = [rec?.motivo, rec ? `aberta há ${diasDesde(rec.aberta_em)}d` : 'sem registro de etapas'].filter(Boolean).join(' · ');

    // O wrapper [data-mot-campos] é quem recebe `hidden`: .fr-form tem display:grid e anularia o atributo.
    const blocoMotorista = `<div class="fr-mot-box">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap">
            <div><strong>Motorista:</strong> ${esc(mot.nome || 'sem motorista')}${mot.contato ? ' · ' + esc(mot.contato) : ''}</div>
            <button type="button" class="fr-btn soft fr-mini" data-mot-alterar>✎ Alterar motorista</button>
          </div>
          <div data-mot-campos hidden>
            <div class="fr-form fr-g-2" style="margin-top:12px"><div class="fr-field"><label>Novo motorista</label><input name="motorista_nome" value="${esc(mot.nome)}" list="${dlId}" autocomplete="off" placeholder="Nome do motorista" /><datalist id="${dlId}"></datalist></div><div class="fr-field"><label>Telefone</label><input name="motorista_contato" value="${esc(mot.contato)}" placeholder="(00) 00000-0000" /></div></div>
            <div class="fr-hint">Vale só para esta manutenção; o cadastro do veículo continua vindo da sync de patrimônios.</div>
          </div>
        </div>`;

    const backdrop = document.createElement('div');
    backdrop.className = 'fr-modal-backdrop';
    backdrop.innerHTML = `
      <div class="fr-modal fr-modal-wide" role="dialog" aria-modal="true">
        <div class="fr-modal-head">
          <div>
            <h3>Editar manutenção · ${esc(row.placa)} <span class="fr-badge ${clsStatus}" style="font-size:11px">${esc(labelStatus)}</span></h3>
            <p>${esc(sub)}</p>
          </div>
          <button class="fr-btn ghost fr-mini" data-close>✕</button>
        </div>
        <div class="fr-modal-body">
          <div class="fr-field" style="max-width:340px;margin:14px 0 4px">
            <label>Status da manutenção</label>
            <select name="status_manut">${STATUS_MANUT_ORDEM.map(k => `<option value="${k}"${k === statusAtual ? ' selected' : ''}>${STATUS_MANUT_LABEL[k][1]}</option>`).join('')}</select>
            <div class="fr-hint">Sobe sozinho ao preencher motorista, técnico e agendamento; ajuste se precisar.</div>
          </div>
          <div class="fr-cols2">
            <div class="fr-col">
              <div class="fr-divider">Motorista</div>
              ${blocoMotorista}
              <div class="fr-field full"><label>Disponibilidade do motorista</label><textarea name="disponibilidade_motorista" placeholder="Ex: disponível terça e quarta de manhã, na garagem">${v('disponibilidade_motorista')}</textarea></div>
            </div>
            <div class="fr-col">
              <div class="fr-divider">Técnico</div>
              <div class="fr-form fr-g-2"><div class="fr-field"><label>Técnico</label><input name="tecnico_nome" value="${v('tecnico_nome')}" placeholder="Nome do técnico" /></div><div class="fr-field"><label>Contato do técnico</label><input name="tecnico_contato" value="${v('tecnico_contato')}" placeholder="Telefone / WhatsApp" /></div></div>
              <div class="fr-divider">Agendamento</div>
              <div class="fr-form fr-g-3"><div class="fr-field"><label>Data</label><input type="date" name="data_agendada" value="${v('data_agendada')}" /></div><div class="fr-field"><label>Horário</label><input type="time" name="hora_agendada" value="${v('hora_agendada')}" /></div><div class="fr-field"><label>Local</label><input name="local_agendado" value="${v('local_agendado')}" placeholder="Ex: Garagem central" /></div><div class="fr-field full"><label>Link do Maps (localização)</label><input name="local_maps_url" value="${v('local_maps_url')}" placeholder="Cole o link do Google Maps do local" inputmode="url" autocomplete="off" /></div></div>
            </div>
          </div>

          <div class="fr-divider">Observações</div>
          <div class="fr-obs" data-obs>
            <div class="fr-obs-add">
              <input type="date" data-obs-data value="${new Date().toISOString().slice(0, 10)}" />
              <input type="text" data-obs-desc placeholder="Descrição da observação" maxlength="500" />
              <button type="button" class="fr-btn soft fr-icon-btn" data-obs-add title="Adicionar observação" aria-label="Adicionar observação">+</button>
            </div>
            <div class="fr-obs-scroll" style="max-height:220px">
              <table class="fr-obs-table"><thead><tr><th style="width:92px">Data</th><th>Descrição</th><th style="width:110px">Usuário</th><th style="width:36px"></th></tr></thead><tbody data-obs-list><tr><td colspan="4" class="fr-empty">Carregando...</td></tr></tbody></table>
            </div>
          </div>
        </div>
        <div class="fr-modal-foot">
          <button class="fr-btn ghost" data-close>Cancelar</button>
          <button class="fr-btn warn" data-salvar>Salvar</button>
        </div>
      </div>`;

    document.body.appendChild(backdrop);
    const close = () => backdrop.remove();
    backdrop.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', close));
    backdrop.addEventListener('click', e => { if (e.target === backdrop) close(); });
    const campo = (n) => backdrop.querySelector(`[name="${n}"]`);
    const get = (n) => campo(n)?.value?.trim() || null;
    campo(foco === 'agendamento' ? 'data_agendada' : 'disponibilidade_motorista').focus();
    initObservacoes(backdrop, row.placa);

    // Opção "Alterar motorista": os campos só aparecem ao clicar e só valem se estiverem abertos.
    // Sugere nomes conhecidos e preenche o telefone do cadastro enquanto o campo não for editado à mão.
    let alterandoMotorista = false;
    const painel = backdrop.querySelector('[data-mot-campos]');
    const botao = backdrop.querySelector('[data-mot-alterar]');
    const nomeEl = campo('motorista_nome');
    const telEl = campo('motorista_contato');
    const lista = backdrop.querySelector('datalist');
    const pessoas = nomesDePessoas();
    let telManual = false;
    telEl.addEventListener('input', () => { telManual = true; });
    nomeEl.addEventListener('input', () => {
      const q = norm(nomeEl.value).trim();
      lista.innerHTML = q.length < 2 ? '' : pessoas.filter(n => norm(n).includes(q)).slice(0, 40).map(n => `<option value="${esc(n)}"></option>`).join('');
      if (!telManual) telEl.value = getMotoristaInfo(row, { nome: nomeEl.value.trim() }).contato;
    });
    botao.addEventListener('click', () => {
      alterandoMotorista = !alterandoMotorista;
      painel.hidden = !alterandoMotorista;
      botao.textContent = alterandoMotorista ? '↩ Manter motorista atual' : '✎ Alterar motorista';
      if (alterandoMotorista) { nomeEl.focus(); nomeEl.select(); return; }
      nomeEl.value = mot.nome;
      telEl.value = mot.contato;
      telManual = false;
      lista.innerHTML = '';
    });

    // O status sobe conforme os campos são preenchidos (nunca abaixo do já gravado), até o usuário escolher na lista.
    const seletorStatus = campo('status_manut');
    let statusManual = false;
    seletorStatus.addEventListener('change', () => { statusManual = true; });
    const sugerirStatus = () => {
      if (statusManual) return;
      const dosCampos = statusDosCampos({ disponibilidade_motorista: get('disponibilidade_motorista'), tecnico_nome: get('tecnico_nome'), data_agendada: get('data_agendada') });
      seletorStatus.value = STATUS_MANUT_ORDEM[Math.max(STATUS_MANUT_ORDEM.indexOf(dosCampos), STATUS_MANUT_ORDEM.indexOf(statusAtual))];
    };
    ['disponibilidade_motorista', 'tecnico_nome', 'data_agendada'].forEach(n => campo(n).addEventListener('input', sugerirStatus));

    backdrop.querySelector('[data-salvar]').addEventListener('click', async () => {
      const patch = {
        status_manut: seletorStatus.value,
        disponibilidade_motorista: get('disponibilidade_motorista'),
        tecnico_nome: get('tecnico_nome'),
        tecnico_contato: get('tecnico_contato'),
        data_agendada: get('data_agendada'),
        hora_agendada: get('hora_agendada'),
        local_agendado: get('local_agendado'),
        local_maps_url: get('local_maps_url')
      };
      const invalido = (msg, nome) => { toast(msg, true); campo(nome).focus(); };
      if (patch.tecnico_contato && !patch.tecnico_nome) { invalido('Informe o nome do técnico.', 'tecnico_nome'); return; }
      if (!patch.data_agendada && (patch.hora_agendada || patch.local_agendado || patch.local_maps_url)) { invalido('Informe a data agendada.', 'data_agendada'); return; }
      if (patch.local_maps_url) {
        patch.local_maps_url = safeUrl(patch.local_maps_url);
        if (!patch.local_maps_url) { invalido('Link do Maps inválido. Cole o endereço completo (https://...).', 'local_maps_url'); return; }
      }

      // Só o que mudou vira evento na linha do tempo.
      const eventos = [];
      if (alterandoMotorista) {
        // Só guarda motorista/telefone quando diferem do cadastro, para a manutenção seguir o veículo nos demais casos.
        const nomeDigitado = get('motorista_nome');
        const nomeEfetivo = nomeDigitado || row.motorista_atual || '';
        patch.motorista_nome = nomeDigitado && norm(nomeDigitado).trim() !== norm(row.motorista_atual).trim() ? nomeDigitado : null;
        const contatoCadastro = getMotoristaInfo(row, { nome: patch.motorista_nome }).contato;
        const contatoDigitado = fmtTelefone(get('motorista_contato') || '');
        patch.motorista_contato = contatoDigitado && soDigitos(contatoDigitado) !== soDigitos(contatoCadastro) ? contatoDigitado : null;
        if (norm(nomeEfetivo).trim() !== norm(mot.nome).trim()) eventos.push(`Motorista alterado para ${nomeEfetivo}`);
        else if (soDigitos(contatoDigitado || contatoCadastro) !== soDigitos(mot.contato)) eventos.push('Telefone do motorista atualizado');
      }
      const mudou = (k) => (patch[k] || null) !== (rec?.[k] || null);
      if (patch.status_manut !== statusAtual) eventos.push(`Status: ${STATUS_MANUT_LABEL[statusAtual][1]} → ${STATUS_MANUT_LABEL[patch.status_manut][1]}`);
      if (mudou('disponibilidade_motorista')) eventos.push(patch.disponibilidade_motorista ? 'Disponibilidade do motorista registrada' : 'Disponibilidade do motorista removida');
      if (mudou('tecnico_nome') || mudou('tecnico_contato')) eventos.push(patch.tecnico_nome ? `Técnico definido: ${patch.tecnico_nome}` : 'Técnico removido');
      if (['data_agendada', 'hora_agendada', 'local_agendado', 'local_maps_url'].some(mudou)) {
        eventos.push(patch.data_agendada
          ? `Agendada para ${fmtDataBr(patch.data_agendada)}${patch.hora_agendada ? ' ' + patch.hora_agendada : ''}${patch.local_maps_url ? ' (com link do Maps)' : ''}`
          : 'Agendamento removido');
      }
      if (!eventos.length) { toast('Nenhuma alteração para salvar.'); return; }

      const btn = backdrop.querySelector('[data-salvar]');
      btn.disabled = true;
      btn.textContent = 'Salvando...';
      try {
        await gravarManutencao(row, patch, eventos);
        toast('Manutenção atualizada.');
        notificarEquipe({ assunto: 'manutencao', titulo: `Manutenção atualizada · ${row.placa}`, descricao: eventos.join(' · '), placa: row.placa, filtro: 'manutencao' });
        close();
        await loadData(root);
      } catch (err) {
        toast(err?.message || 'Erro ao salvar a manutenção.', true);
        btn.disabled = false;
        btn.textContent = 'Salvar';
      }
    });
  }

  // Concluir devolve o rastreador para Instalado (Com BFleet), deixa a manutenção no histórico e
  // registra a resolução como observação do rastreador.
  function openManutConcluir(root, placa) {
    const row = state.merged.find(v => v.placa === placa);
    if (!row) return;
    const rec = manutAberta(row.placa);
    const mot = motoristaDaManut(row, rec);

    const backdrop = document.createElement('div');
    backdrop.className = 'fr-modal-backdrop';
    backdrop.innerHTML = `
      <div class="fr-modal" role="dialog" aria-modal="true" style="width:min(620px,96vw)">
        <div class="fr-modal-head">
          <div>
            <h3>Concluir manutenção · ${esc(row.placa)}</h3>
            <p>${esc(mot.nome || 'Sem motorista')} · ${esc(mot.contato || 'sem telefone cadastrado')}${mot.endereco ? ' · ' + esc(mot.endereco) : ''}</p>
          </div>
          <button class="fr-btn ghost fr-mini" data-close>✕</button>
        </div>
        <div class="fr-modal-body">
          <div class="fr-mot-box">${rec ? `<strong>Motivo:</strong> ${esc(rec.motivo || '—')}<br><strong>Motorista:</strong> ${esc(rec.disponibilidade_motorista || '—')}<br><strong>Técnico:</strong> ${esc(rec.tecnico_nome || '—')}<br><strong>Agendada:</strong> ${rec.data_agendada ? esc(fmtDataBr(rec.data_agendada)) + (rec.hora_agendada ? ' ' + esc(rec.hora_agendada) : '') : '—'}` : 'Sem registro de etapas.'}</div>
          <div class="fr-field full"><label>O que foi feito</label><textarea name="resolucao" placeholder="Ex: trocado o rastreador, voltou a comunicar com a BFleet">${esc(rec?.resolucao || '')}</textarea></div>
          <div class="fr-hint">Ao concluir, o rastreador volta para Instalado (Com BFleet) e a manutenção fica no histórico.</div>
        </div>
        <div class="fr-modal-foot">
          <button class="fr-btn ghost" data-close>Cancelar</button>
          <button class="fr-btn primary" data-salvar>✓ Concluir manutenção</button>
        </div>
      </div>`;

    document.body.appendChild(backdrop);
    const close = () => backdrop.remove();
    backdrop.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', close));
    backdrop.addEventListener('click', e => { if (e.target === backdrop) close(); });
    backdrop.querySelector('textarea').focus();

    backdrop.querySelector('[data-salvar]').addEventListener('click', async () => {
      const resolucao = backdrop.querySelector('[name="resolucao"]').value.trim();
      if (!resolucao) { toast('Descreva o que foi feito para concluir.', true); return; }
      if (!confirm(`Concluir a manutenção de ${row.placa}? O rastreador volta para Instalado (Com BFleet) e a manutenção fica no histórico.`)) return;

      const btn = backdrop.querySelector('[data-salvar]');
      const label = btn.textContent;
      btn.disabled = true;
      btn.textContent = 'Salvando...';
      try {
        const fim = await gravarManutencao(row, {
          resolucao,
          situacao: 'finalizada',
          etapa: 'finalizar',
          encerrada_em: new Date().toISOString(),
          encerrada_por_nome: userName()
        }, 'Manutenção concluída');
        const { error } = await setStatusRastreador(row, 'concluido');
        if (error) toast(`Manutenção concluída, mas o status não voltou para Instalado: ${error.message}`, true);

        const descricao = [
          `Manutenção concluída (aberta em ${fmtDataBr(fim.aberta_em)}).`,
          fim.motivo ? `Motivo: ${fim.motivo}.` : '',
          fim.tecnico_nome ? `Técnico: ${fim.tecnico_nome}.` : '',
          fim.data_agendada ? `Agendada para ${fmtDataBr(fim.data_agendada)}${fim.hora_agendada ? ' ' + fim.hora_agendada : ''}.` : '',
          `Resolução: ${fim.resolucao}`
        ].filter(Boolean).join(' ');
        const { error: obsError } = await _opts.supabase.from('frotas_rastreadores_observacoes').insert({
          placa: rawPlaca(row.placa),
          data: new Date().toISOString().slice(0, 10),
          descricao,
          criado_por_nome: userName()
        });
        if (obsError) console.warn('[FROTAS_RASTREADORES] Falha ao registrar observação da manutenção:', obsError);
        if (!error) toast(`${row.placa} concluída: voltou para Instalado (Com BFleet).`);
        notificarEquipe({ assunto: 'manutencao', titulo: `Manutenção concluída · ${row.placa}`, descricao: fim.resolucao, placa: row.placa, filtro: 'manutencao' });
        close();
        await loadData(root);
      } catch (err) {
        toast(err?.message || 'Erro ao concluir a manutenção.', true);
        btn.disabled = false;
        btn.textContent = label;
      }
    });
  }

  function openMotoristaInfo(placa) {
    const row = state.merged.find(v => v.placa === placa);
    if (!row) return;
    const mot = motoristaDaManut(row, manutAberta(row.placa));
    const dado = (v) => esc(v || '—');
    const backdrop = document.createElement('div');
    backdrop.className = 'fr-modal-backdrop';
    backdrop.innerHTML = `
      <div class="fr-modal" role="dialog" aria-modal="true" style="width:min(460px,96vw)">
        <div class="fr-modal-head">
          <div><h3>Motorista · ${esc(row.placa)}</h3></div>
          <button class="fr-btn ghost fr-mini" data-close>✕</button>
        </div>
        <div class="fr-modal-body">
          <dl class="fr-dl">
            <dt>Nome</dt><dd>${dado(mot.nome)}</dd>
            <dt>Telefone</dt><dd>${dado(mot.contato)}</dd>
            <dt>Cidade</dt><dd>${dado(mot.cidade)}</dd>
            <dt>UF</dt><dd>${dado(mot.uf)}</dd>
          </dl>
        </div>
      </div>`;
    document.body.appendChild(backdrop);
    backdrop.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => backdrop.remove()));
    backdrop.addEventListener('click', e => { if (e.target === backdrop) backdrop.remove(); });
  }

  async function cancelarManutencao(root, placa) {
    const row = state.merged.find(v => v.placa === placa);
    if (!row) return;
    if (!confirm(`Cancelar a manutenção de ${row.placa}? Ela sai da lista e o rastreador volta ao status anterior.`)) return;
    try {
      const rec = manutAberta(row.placa);
      if (rec) {
        await gravarManutencao(row, { situacao: 'cancelada', encerrada_em: new Date().toISOString(), encerrada_por_nome: userName() }, 'Manutenção cancelada');
      }
      const { error } = await setStatusRastreador(row, rec?.status_anterior || 'concluido');
      if (error) throw error;
      toast('Manutenção cancelada.');
      notificarEquipe({ assunto: 'manutencao', titulo: `Manutenção cancelada · ${row.placa}`, descricao: 'O rastreador voltou ao status anterior.', placa: row.placa, filtro: 'manutencao', prioridade: 'atencao' });
      await loadData(root);
    } catch (err) {
      toast(err?.message || 'Erro ao cancelar a manutenção.', true);
    }
  }

  function renderManutencao(root, el) {
    const ncols = COLS_MANUT.length;
    const hist = root.querySelector('[data-hist]');
    if (state.loading) { el.innerHTML = `<tr><td class="fr-empty" colspan="${ncols}">Carregando...</td></tr>`; return; }

    const rows = getFiltered();
    if (!rows.length) el.innerHTML = `<tr><td class="fr-empty" colspan="${ncols}">Nenhum veículo em manutenção.</td></tr>`;
    else el.innerHTML = rows.map(row => {
      const m = manutAberta(row.placa);
      const [cls, label] = STATUS_MANUT_LABEL[statusManut(m)];
      const motorista = motoristaDaManut(row, m).nome;
      // Concluir só libera com o status em Agendado (motorista, técnico e agendamento já resolvidos).
      const pronto = statusManut(m) === 'agendado';
      const tipConcluir = pronto ? 'Concluir manutenção' : 'Concluir (mude o status para Agendado em Editar antes)';
      const local = row._rastr?.cidade || '—';
      return `<tr>
        <td><strong>${esc(row.placa)}</strong></td>
        <td>${esc(ufDaLinha(row) || '—')}</td>
        <td title="${esc(local)}">${esc(local)}</td>
        <td title="${esc(motorista || '—')}">${motorista ? `<button type="button" class="fr-link" data-mmot="${esc(row.placa)}" title="Ver dados do motorista">${esc(motorista)}</button>` : '—'}</td>
        <td title="${esc(m?.motivo || '—')}">${esc(m?.motivo || '—')}</td>
        <td title="${esc(m ? 'Solicitada em ' + fmtDateTime(m.aberta_em) : '—')}">${m ? esc(fmtDataSolicitada(m.aberta_em)) : '—'}</td>
        <td>${m ? diasDesde(m.aberta_em) + 'd' : '—'}</td>
        <td><span class="fr-badge ${cls}">${esc(label)}</span>${m ? '' : ' <span class="fr-badge err" title="Em manutenção sem registro de etapas">sem registro</span>'}</td>
        <td title="${esc(m?.tecnico_nome || '—')}">${esc(m?.tecnico_nome || '—')}</td>
        <td>${m?.data_agendada ? esc(fmtDataBr(m.data_agendada)) + (m.hora_agendada ? ' ' + esc(m.hora_agendada) : '') + mapsLink(m.local_maps_url) : '—'}</td>
        <td><div class="fr-act-row"><button type="button" class="fr-act final${pronto ? ' current' : ''}" data-mconcluir="${esc(row.placa)}" title="${esc(tipConcluir)}" aria-label="Concluir manutenção"${pronto ? '' : ' disabled'}>${ICONS.finalizar}</button><button type="button" class="fr-act" data-medit="${esc(row.placa)}" title="Editar manutenção (motorista, técnico, agendamento e observações)" aria-label="Editar manutenção">${ICONS.editar}</button><button type="button" class="fr-act cancel" data-mcancel="${esc(row.placa)}" title="Cancelar manutenção" aria-label="Cancelar manutenção">${ICONS.cancelar}</button></div></td>
      </tr>`;
    }).join('');

    if (!hist) return;
    const busca = norm(state.busca);
    const historico = state.manutencoes.filter(m => {
      if (m.situacao === 'aberta') return false;
      if (!busca) return true;
      return norm([...placaCandidates(m.placa), m.motivo, m.tecnico_nome, m.resolucao, m.aberta_por_nome].join(' ')).includes(busca);
    });
    const situacaoBadge = (s) => s === 'finalizada' ? '<span class="fr-badge ok">Concluída</span>' : '<span class="fr-badge none">Cancelada</span>';
    const cel = (txt) => `<td title="${esc(txt || '—')}">${esc(txt || '—')}</td>`;
    hist.innerHTML = `
      <div class="fr-hist-title">Histórico de manutenções (${historico.length})</div>
      <div class="fr-table-wrap">
        <table class="fr-table" style="min-width:900px">
          <colgroup><col style="width:80px"><col style="width:116px"><col style="width:116px"><col style="width:96px"><col><col style="width:130px"><col style="width:96px"><col></colgroup>
          <thead><tr><th>Placa</th><th>Aberta em</th><th>Encerrada em</th><th>Situação</th><th>Motivo</th><th>Técnico</th><th>Agendada</th><th>Resolução</th></tr></thead>
          <tbody>${historico.length ? historico.map(m => `<tr>
            <td><strong>${esc(m.placa)}</strong></td>
            <td>${esc(fmtDateTime(m.aberta_em))}</td>
            <td>${m.encerrada_em ? esc(fmtDateTime(m.encerrada_em)) : '—'}</td>
            <td>${situacaoBadge(m.situacao)}</td>
            ${cel(m.motivo)}${cel(m.tecnico_nome)}
            <td>${m.data_agendada ? esc(fmtDataBr(m.data_agendada)) : '—'}</td>
            ${cel(m.resolucao)}
          </tr>`).join('') : '<tr><td class="fr-empty" colspan="8">Nenhuma manutenção concluída ainda.</td></tr>'}</tbody>
        </table>
      </div>`;
  }

  // ── Agenda ──────────────────────────────────────────────────────────────────
  // Calendário das datas marcadas: manutenção (data agendada) e instalação (campo "Instalação" do cadastro,
  // que com status Agendado é a data prevista e com status Instalado é a data em que foi feita).
  const TIPO_AGENDA = { inst: 'Instalação', manut: 'Manutenção' };
  const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  const pad2 = (n) => String(n).padStart(2, '0');
  const isoDia = (ano, mes, dia) => `${ano}-${pad2(mes + 1)}-${pad2(dia)}`;
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const primeiroNome = (n) => { const p = String(n || '').trim().split(/\s+/)[0] || ''; return p.charAt(0) + p.slice(1).toLowerCase(); };

  function hojeIso() {
    const d = new Date();
    return isoDia(d.getFullYear(), d.getMonth(), d.getDate());
  }

  function dataDeIso(iso) {
    const [a, m, d] = String(iso).split('-').map(Number);
    return new Date(a, m - 1, d);
  }

  function agendaEventos() {
    const porPlaca = new Map(state.merged.map(v => [placaKey(v.placa), v]));
    const hoje = hojeIso();
    const eventos = [];

    state.manutencoes.forEach(m => {
      if (m.situacao === 'cancelada' || !m.data_agendada) return;
      const row = porPlaca.get(placaKey(m.placa));
      if (!row) return;
      const mot = motoristaDaManut(row, m);
      const concluido = m.situacao === 'finalizada';
      eventos.push({
        tipo: 'manut', data: m.data_agendada, hora: m.hora_agendada || '', placa: row.placa,
        motorista: mot.nome, contato: mot.contato, local: m.local_agendado || '', maps: safeUrl(m.local_maps_url),
        tecnico: m.tecnico_nome || '', cidade: row._rastr?.cidade || '', uf: ufDaLinha(row),
        concluido, atrasado: !concluido && m.data_agendada < hoje
      });
    });

    state.rastreadores.forEach(r => {
      if (!r.data_instalacao || !['agendado', 'concluido'].includes(r.status)) return;
      const row = porPlaca.get(placaKey(r.placa));
      if (!row) return;
      const mot = getMotoristaInfo(row);
      const concluido = r.status === 'concluido';
      eventos.push({
        tipo: 'inst', data: r.data_instalacao, hora: '', placa: row.placa,
        motorista: mot.nome, contato: mot.contato, local: r.local_instalacao || '', maps: '',
        tecnico: '', cidade: r.cidade || '', uf: ufDaLinha(row),
        concluido, atrasado: !concluido && r.data_instalacao < hoje
      });
    });
    return eventos;
  }

  function agendaFiltrados() {
    const { tipo, busca, concluidos } = state.agenda;
    const q = norm(busca);
    return agendaEventos().filter(e => {
      if (tipo && e.tipo !== tipo) return false;
      if (!concluidos && e.concluido) return false;
      if (!q) return true;
      return norm([...placaCandidates(e.placa), e.motorista, e.cidade, e.local, e.tecnico].join(' ')).includes(q);
    });
  }

  const ordenaEvento = (a, b) => (a.hora || '99:99').localeCompare(b.hora || '99:99') || a.placa.localeCompare(b.placa);

  function cardEvento(ev) {
    const situacao = ev.concluido
      ? `<span class="fr-badge ok">${ev.tipo === 'inst' ? 'Instalada' : 'Concluída'}</span>`
      : ev.atrasado ? '<span class="fr-badge err" title="A data já passou e ainda não foi concluída">Data passada</span>'
        : '<span class="fr-badge progress">Agendada</span>';
    const linha = (rotulo, valor) => valor ? `<div class="fr-ag-ev-linha"><b>${rotulo}</b>${esc(valor)}</div>` : '';
    const acoes = [
      ev.maps ? `<a class="fr-btn ghost fr-mini" href="${esc(ev.maps)}" target="_blank" rel="noopener noreferrer">📍 Abrir no Maps</a>` : '',
      ev.tipo === 'manut' && !ev.concluido ? `<button type="button" class="fr-btn soft fr-mini" data-ag-edit="manut" data-placa="${esc(ev.placa)}">✎ Editar agendamento</button>` : '',
      ev.tipo === 'inst' ? `<button type="button" class="fr-btn soft fr-mini" data-ag-edit="inst" data-placa="${esc(ev.placa)}">✎ Abrir cadastro</button>` : ''
    ].filter(Boolean).join('');
    return `<div class="fr-ag-ev ${ev.tipo}${ev.concluido ? ' done' : ''}">
      <div class="fr-ag-ev-top">
        <span class="fr-ag-ev-placa">${esc(ev.placa)}</span>
        <span class="fr-badge ${ev.tipo === 'inst' ? 'info' : 'progress'}">${TIPO_AGENDA[ev.tipo]}</span>${situacao}${ev.hora ? `<span class="fr-badge none">🕒 ${esc(ev.hora)}</span>` : ''}
      </div>
      ${linha('Motorista', [ev.motorista, ev.contato].filter(Boolean).join(' · '))}
      ${linha('Local', ev.local)}
      ${linha('Técnico', ev.tecnico)}
      ${linha('Cidade', [ev.cidade, ev.uf].filter(Boolean).join(' / '))}
      ${acoes ? `<div class="fr-ag-ev-acoes">${acoes}</div>` : ''}
    </div>`;
  }

  function renderAgendaConteudo(el) {
    const ag = state.agenda;
    const eventos = agendaFiltrados();
    const porDia = new Map();
    eventos.forEach(ev => { if (!porDia.has(ev.data)) porDia.set(ev.data, []); porDia.get(ev.data).push(ev); });
    porDia.forEach(lista => lista.sort(ordenaEvento));

    const prefixoMes = `${ag.ano}-${pad2(ag.mes + 1)}-`;
    const tituloMes = cap(new Date(ag.ano, ag.mes, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }));
    el.querySelector('[data-ag-titulo]').textContent = tituloMes;
    el.querySelector('[data-ag-resumo]').textContent = `${eventos.filter(e => e.data.startsWith(prefixoMes)).length} agendamento(s) em ${tituloMes}`;

    // Grade: semanas completas (domingo a sábado) cobrindo o mês.
    const deslocamento = new Date(ag.ano, ag.mes, 1).getDay();
    const diasNoMes = new Date(ag.ano, ag.mes + 1, 0).getDate();
    const celulas = Math.ceil((deslocamento + diasNoMes) / 7) * 7;
    const hoje = hojeIso();
    let grade = '';
    for (let i = 0; i < celulas; i++) {
      const d = new Date(ag.ano, ag.mes, 1 - deslocamento + i);
      const iso = isoDia(d.getFullYear(), d.getMonth(), d.getDate());
      const evs = porDia.get(iso) || [];
      const chips = evs.slice(0, 3).map(ev => `<span class="fr-ag-chip ${ev.tipo}${ev.concluido ? ' done' : ''}${ev.atrasado ? ' late' : ''}" title="${esc(`${TIPO_AGENDA[ev.tipo]}: ${ev.placa}${ev.motorista ? ' — ' + ev.motorista : ''}`)}">${ev.hora ? esc(ev.hora) + ' ' : ''}${esc(ev.placa)}${ev.motorista ? ' · ' + esc(primeiroNome(ev.motorista)) : ''}</span>`).join('');
      grade += `<button type="button" class="fr-ag-cell${d.getMonth() !== ag.mes ? ' fora' : ''}${iso === ag.dia ? ' sel' : ''}${iso === hoje ? ' hoje' : ''}" data-ag-day="${iso}"><span class="fr-ag-num">${d.getDate()}</span>${chips}${evs.length > 3 ? `<span class="fr-ag-mais">+${evs.length - 3} mais</span>` : ''}</button>`;
    }
    el.querySelector('[data-ag-grid]').innerHTML = grade;

    const doDia = porDia.get(ag.dia) || [];
    const diaTitulo = cap(dataDeIso(ag.dia).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }));
    el.querySelector('[data-ag-dia]').innerHTML = `<h4>${esc(diaTitulo)}</h4><div class="sub">${doDia.length ? `${doDia.length} agendamento(s)` : 'Sem agendamentos'}</div>${doDia.map(cardEvento).join('') || '<div class="fr-empty" style="padding:18px 0!important">Nenhum agendamento neste dia.</div>'}`;

    const semData = ag.tipo === 'manut' ? [] : state.merged.filter(r => r._rastr?.status === 'agendado' && !r._rastr.data_instalacao);
    el.querySelector('[data-ag-aviso]').innerHTML = semData.length
      ? `<div class="fr-ag-aviso">⚠️ ${semData.length} instalação(ões) com status <strong>Agendado</strong> sem data. Preencha <strong>Instalação</strong> no cadastro para aparecer na agenda: ${semData.map(r => `<button type="button" class="fr-link" data-ag-edit="inst" data-placa="${esc(r.placa)}">${esc(r.placa)}</button>`).join(', ')}</div>`
      : '';
  }

  function renderAgenda(root) {
    const el = root.querySelector('[data-agenda-view]');
    if (!el) return;
    const ag = state.agenda;
    if (ag.ano === null) {
      const h = new Date();
      ag.ano = h.getFullYear();
      ag.mes = h.getMonth();
      ag.dia = hojeIso();
    }

    if (!el.dataset.ready) {
      el.dataset.ready = '1';
      el.innerHTML = `
        <div class="fr-ag-bar">
          <div class="fr-ag-nav">
            <button type="button" class="fr-btn ghost fr-mini" style="font-size:16px;min-width:38px" data-ag-nav="-1" title="Mês anterior" aria-label="Mês anterior">‹</button>
            <div class="fr-ag-mes" data-ag-titulo></div>
            <button type="button" class="fr-btn ghost fr-mini" style="font-size:16px;min-width:38px" data-ag-nav="1" title="Próximo mês" aria-label="Próximo mês">›</button>
            <button type="button" class="fr-btn soft fr-mini" data-ag-hoje>Hoje</button>
          </div>
          <div class="fr-ag-spacer"></div>
          <input class="fr-input" type="search" placeholder="Buscar placa, motorista, cidade..." data-ag-busca />
          <select class="fr-select" data-ag-tipo>
            <option value="">Instalação e manutenção</option>
            <option value="inst">Só instalação</option>
            <option value="manut">Só manutenção</option>
          </select>
          <label class="fr-ag-chk"><input type="checkbox" data-ag-concl checked /> Mostrar concluídos</label>
          <button type="button" class="fr-btn soft fr-mini" data-ag-google title="Receber esta agenda no seu Google Agenda">📅 Sincronizar com Google Agenda</button>
        </div>
        <div class="fr-ag-legend">
          <span><i class="fr-ag-dot inst"></i>Instalação</span>
          <span><i class="fr-ag-dot manut"></i>Manutenção</span>
          <span><i class="fr-ag-dot done"></i>Concluído</span>
          <span><i class="fr-ag-dot late"></i>Data passada, não concluído</span>
          <span data-ag-resumo style="margin-left:auto"></span>
        </div>
        <div data-ag-aviso></div>
        <div class="fr-ag-layout">
          <div class="fr-ag-cal">
            <div class="fr-ag-dow">${DIAS_SEMANA.map(d => `<div>${d}</div>`).join('')}</div>
            <div class="fr-ag-grid" data-ag-grid></div>
          </div>
          <aside class="fr-ag-side" data-ag-dia></aside>
        </div>`;

      el.addEventListener('click', e => {
        const nav = e.target.closest('[data-ag-nav]');
        if (nav) {
          const d = new Date(ag.ano, ag.mes + Number(nav.dataset.agNav), 1);
          ag.ano = d.getFullYear();
          ag.mes = d.getMonth();
          ag.dia = hojeIso().startsWith(`${ag.ano}-${pad2(ag.mes + 1)}-`) ? hojeIso() : isoDia(ag.ano, ag.mes, 1);
          renderAgendaConteudo(el);
          return;
        }
        if (e.target.closest('[data-ag-hoje]')) {
          const h = new Date();
          ag.ano = h.getFullYear();
          ag.mes = h.getMonth();
          ag.dia = hojeIso();
          renderAgendaConteudo(el);
          return;
        }
        const dia = e.target.closest('[data-ag-day]');
        if (dia) {
          ag.dia = dia.dataset.agDay;
          const d = dataDeIso(ag.dia);
          ag.ano = d.getFullYear();
          ag.mes = d.getMonth();
          renderAgendaConteudo(el);
          return;
        }
        const edit = e.target.closest('[data-ag-edit]');
        if (edit) {
          if (edit.dataset.agEdit === 'manut') openManutEditar(root, edit.dataset.placa, 'agendamento');
          else openModal(root, edit.dataset.placa);
        }
      });
      el.querySelector('[data-ag-busca]').addEventListener('input', e => { ag.busca = e.target.value; renderAgendaConteudo(el); });
      el.querySelector('[data-ag-tipo]').addEventListener('change', e => { ag.tipo = e.target.value; renderAgendaConteudo(el); });
      el.querySelector('[data-ag-concl]').addEventListener('change', e => { ag.concluidos = e.target.checked; renderAgendaConteudo(el); });
      el.querySelector('[data-ag-google]').addEventListener('click', async () => {
        try {
          const { abrirSincronizacaoGoogle } = await import('./frotas-agenda-google.js?v=20261019-frotas-manut28');
          await abrirSincronizacaoGoogle({ supabase: _opts.supabase, toast });
        } catch (err) { console.error('[agenda-google]', err); toast('Não foi possível abrir a sincronização.', true); }
      });
    }

    renderAgendaConteudo(el);
  }

  function openRemoveModal(root, placa) {
    const row = state.merged.find(v => v.placa === placa);
    if (!row) return;

    const backdrop = document.createElement('div');
    backdrop.className = 'fr-modal-backdrop';
    backdrop.innerHTML = `
      <div class="fr-modal" role="dialog" aria-modal="true" style="width:min(620px,96vw)">
        <div class="fr-modal-head">
          <div>
            <h3>Remover rastreador · ${esc(placa)}</h3>
            <p>Informe o motivo da remoção. O registro será movido para <strong>REMOVIDOS</strong> e sairá da relação de instalação.</p>
          </div>
          <button class="fr-btn ghost fr-mini" data-close>✕</button>
        </div>
        <div class="fr-modal-body">
          <div class="fr-field full">
            <label>Motivo da remoção</label>
            <textarea name="motivo_remocao" placeholder="Ex: veículo vendido, rastreador retirado, cadastro duplicado..." required></textarea>
          </div>
        </div>
        <div class="fr-modal-foot">
          <button class="fr-btn ghost" data-close>Cancelar</button>
          <button class="fr-btn danger" data-confirm-remove>Remover</button>
        </div>
      </div>`;

    document.body.appendChild(backdrop);
    backdrop.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => backdrop.remove()));
    backdrop.addEventListener('click', e => { if (e.target === backdrop) backdrop.remove(); });
    backdrop.querySelector('[data-confirm-remove]').addEventListener('click', async () => {
      await removeRastreador(root, row, backdrop);
    });
  }

  async function removeRastreador(root, row, backdrop) {
    const motivo = backdrop.querySelector('[name="motivo_remocao"]')?.value?.trim();
    if (!motivo) {
      toast('Informe o motivo da remoção.', true);
      backdrop.querySelector('[name="motivo_remocao"]')?.focus();
      return;
    }

    const btn = backdrop.querySelector('[data-confirm-remove]');
    btn.textContent = 'Removendo...';
    btn.disabled = true;

    const r = row._rastr || {};
    const payload = {
      placa: rawPlaca(row.placa),
      veiculo_id: row.id || r.veiculo_id || null,
      rastreador_id: r.id || null,
      motivo_remocao: motivo,
      removido_por: _opts.auth?.user?.id || _opts.user?.id || null,
      removido_por_nome: _opts.auth?.user?.full_name || _opts.auth?.user?.nome || _opts.auth?.profile?.full_name || _opts.profile?.full_name || _opts.user?.email || null,
      snapshot: {
        ...r,
        veiculo_id: row.id || r.veiculo_id || null,
        placa: rawPlaca(row.placa),
        nome: row.nome || null,
        marca: row.marca || null,
        modelo: row.modelo || null,
        motorista_atual: row.motorista_atual || null,
        coordenacao: row.coordenacao || null,
        bfleet_idgps: row.bfleet_idgps || null,
        bfleet_status: row.bfleet_status || null
      }
    };

    const { error: insertError } = await _opts.supabase
      .from('frotas_rastreadores_removidos')
      .upsert(payload, { onConflict: 'placa' });

    if (insertError) {
      toast(insertError.message || 'Erro ao registrar remoção.', true);
      btn.textContent = 'Remover';
      btn.disabled = false;
      return;
    }

    if (r.id) {
      const { error: deleteError } = await _opts.supabase
        .from('frotas_rastreadores')
        .delete()
        .eq('id', r.id);

      if (deleteError) {
        toast(deleteError.message || 'Remoção registrada, mas não foi possível retirar da relação.', true);
        btn.textContent = 'Remover';
        btn.disabled = false;
        return;
      }
    }

    toast('Rastreador movido para REMOVIDOS.');
    notificarEquipe({ assunto: 'cadastro', titulo: `Rastreador removido · ${row.placa}`, descricao: motivo, filtro: 'removidos', prioridade: 'atencao' });
    backdrop.remove();
    await loadData(root);
  }

  function openRestoreModal(root, removidoId) {
    const rem = state.removidos.find(r => r.id === removidoId);
    if (!rem) return;

    const backdrop = document.createElement('div');
    backdrop.className = 'fr-modal-backdrop';
    backdrop.innerHTML = `
      <div class="fr-modal" role="dialog" aria-modal="true" style="width:min(560px,96vw)">
        <div class="fr-modal-head">
          <div>
            <h3>Restaurar rastreador · ${esc(rem.placa)}</h3>
            <p>O veículo volta para a relação de instalação com os dados que tinha no momento da remoção (status, IMEI, local, rastreio, etc.) e sai de <strong>REMOVIDOS</strong>.</p>
          </div>
          <button class="fr-btn ghost fr-mini" data-close>✕</button>
        </div>
        <div class="fr-modal-foot">
          <button class="fr-btn ghost" data-close>Cancelar</button>
          <button class="fr-btn primary" data-confirm-restore>Restaurar</button>
        </div>
      </div>`;

    document.body.appendChild(backdrop);
    backdrop.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => backdrop.remove()));
    backdrop.addEventListener('click', e => { if (e.target === backdrop) backdrop.remove(); });
    backdrop.querySelector('[data-confirm-restore]').addEventListener('click', async () => {
      await restoreRastreador(root, rem, backdrop);
    });
  }

  // Desfaz removeRastreador: recria a linha em frotas_rastreadores a partir do snapshot e apaga o registro de remoção.
  async function restoreRastreador(root, rem, backdrop) {
    const btn = backdrop.querySelector('[data-confirm-restore]');
    btn.textContent = 'Restaurando...';
    btn.disabled = true;
    const falhou = (msg) => {
      toast(msg, true);
      btn.textContent = 'Restaurar';
      btn.disabled = false;
    };

    const snap = rem.snapshot || {};
    const jaExiste = (state.rastreadores || []).some(r => placaKey(r.placa) === placaKey(rem.placa));

    // Só recria a linha se havia rastreador cadastrado na remoção e a placa não voltou a ter outro.
    // Sem linha, o veículo reaparece como "Sem rastreador" ao sair de REMOVIDOS.
    if (snap.id && !jaExiste) {
      const colunas = ['id', 'veiculo_id', 'placa', 'estado', 'cidade', 'local_instalacao', 'imei', 'data_envio',
        'previsao_chegada', 'cod_rastreio', 'status', 'data_instalacao', 'nao_atendido', 'contato', 'observacoes',
        'created_at', 'contrato', 'contrato_assinado', 'agendamentos_frustrados', 'termo_assinado', 'infleet', 'responsavel'];
      const payload = {};
      colunas.forEach(c => { if (snap[c] !== undefined) payload[c] = snap[c]; });
      payload.placa = rem.placa;
      payload.veiculo_id = snap.veiculo_id || rem.veiculo_id || null;

      const { error: insertError } = await _opts.supabase.from('frotas_rastreadores').upsert(payload, { onConflict: 'placa' });
      if (insertError) { falhou(insertError.message || 'Erro ao devolver o rastreador à relação.'); return; }
    }

    const { error: deleteError } = await _opts.supabase.from('frotas_rastreadores_removidos').delete().eq('id', rem.id);
    if (deleteError) { falhou(deleteError.message || 'Rastreador devolvido, mas não foi possível limpar o registro de remoção. Tente novamente.'); return; }

    toast('Rastreador restaurado.');
    notificarEquipe({ assunto: 'cadastro', titulo: `Rastreador restaurado · ${rem.placa}`, descricao: 'Voltou para a relação de instalação.', placa: rem.placa, filtro: 'todos' });
    backdrop.remove();
    await loadData(root);
  }

  const STATUS_TEXTO = {
    sem_rastreador: 'Sem rastreador', em_andamento: 'Em andamento', agendado: 'Agendado',
    aguardando_motorista: 'Aguardando motorista', concluido: 'Instalado', manutencao: 'Manutenção'
  };
  const CAMPOS_CADASTRO = [
    ['status', 'Status', v => STATUS_TEXTO[v] || v], ['estado', 'UF'], ['cidade', 'Cidade'], ['local_instalacao', 'Local de instalação'],
    ['imei', 'IMEI'], ['cod_rastreio', 'Cód. rastreio'], ['data_envio', 'Envio', fmtDataBr], ['previsao_chegada', 'Prev. chegada', fmtDataBr],
    ['data_instalacao', 'Instalação', fmtDataBr], ['contrato', 'Contrato'], ['contrato_assinado', 'Contrato assinado', v => (v ? 'sim' : 'não')],
    ['termo_assinado', 'Termo assinado'], ['agendamentos_frustrados', 'Agend. frustrados'], ['infleet', 'Infleet']
  ];

  // Lista só o que mudou no cadastro: "Status: Agendado → Instalado · Instalação: 15/10/2026".
  function mudancasCadastro(antes, depois) {
    const vazio = v => v === null || v === undefined || v === '' || v === false || v === 0;
    return CAMPOS_CADASTRO.filter(([k]) => (vazio(antes?.[k]) ? '' : String(antes[k]).trim()) !== (vazio(depois[k]) ? '' : String(depois[k]).trim()))
      .map(([k, rotulo, fmt = x => x]) => {
        const de = vazio(antes?.[k]) ? '' : fmt(antes[k]);
        const para = vazio(depois[k]) ? '—' : fmt(depois[k]);
        return de ? `${rotulo}: ${de} → ${para}` : `${rotulo}: ${para}`;
      });
  }

  async function saveRastreador(root, placa, veiculo_id, backdrop) {
    const btn = backdrop.querySelector('[data-save]');
    btn.textContent = 'Salvando...';
    btn.disabled = true;

    const dados = readModal(backdrop);
    const antes = { ...(state.merged.find(v => v.placa === placa)?._rastr || {}) };

    // Usa a placa exatamente como está em frotas_veiculos (fonte canônica)
    const { error } = await _opts.supabase
      .from('frotas_rastreadores')
      .upsert({ placa: rawPlaca(placa), veiculo_id: veiculo_id || null, ...dados }, { onConflict: 'placa' });

    if (error) {
      toast(error.message || 'Erro ao salvar.', true);
      btn.textContent = 'Salvar';
      btn.disabled = false;
      return;
    }

    toast('Rastreador salvo com sucesso.');
    const mudancas = mudancasCadastro(antes, dados);
    if (mudancas.length) notificarEquipe({ assunto: 'cadastro', titulo: `Rastreador atualizado · ${placa}`, descricao: mudancas.join(' · '), placa, filtro: 'todos' });
    backdrop.remove();
    await loadData(root);
  }

  // Sincroniza registros de frotas_rastreadores a partir dos dados BFleet em frotas_veiculos.
  // Cria registros novos (status=concluido, imei=bfleet_idgps) para quem ainda não tem entrada.
  // Preenche imei em registros existentes que estejam sem imei manual.
  // Nunca sobrescreve status ou campos preenchidos manualmente.
  async function syncFromBfleet(root) {
    if (state.syncing) return;
    state.syncing = true;

    const btn = root.querySelector('[data-sync-bfleet]');
    if (btn) { btn.disabled = true; btn.textContent = 'Sincronizando...'; }

    const comBfleet = state.merged.filter(v => v._hasBfleet && v.bfleet_idgps);
    if (!comBfleet.length) {
      toast('Nenhum veículo com idgps BFleet encontrado. Sincronize primeiro em Veículos > Sincronizar BFleet.', true);
      state.syncing = false;
      if (btn) { btn.disabled = false; btn.textContent = '⟳ Sync BFleet'; }
      return;
    }

    let criados = 0, atualizados = 0;

    for (const v of comBfleet) {
      const existente = v._rastr;

      if (!existente) {
        // Cria novo registro como concluido com imei do BFleet
        const { error } = await _opts.supabase.from('frotas_rastreadores').upsert({
          placa: v.placa,
          veiculo_id: v.id || null,
          imei: v.bfleet_idgps,
          status: 'concluido'
        }, { onConflict: 'placa' });
        if (!error) criados++;
      } else if (!existente.imei && v.bfleet_idgps) {
        // Preenche só o IMEI que estava vazio
        const { error } = await _opts.supabase.from('frotas_rastreadores')
          .update({ imei: v.bfleet_idgps })
          .eq('placa', v.placa);
        if (!error) atualizados++;
      }
    }

    toast(`BFleet sincronizado: ${criados} novo(s) registro(s) criado(s), ${atualizados} IMEI(s) preenchido(s).`);
    if (criados || atualizados) notificarEquipe({ assunto: 'cadastro', titulo: 'Sync BFleet executada', descricao: `${criados} novo(s) registro(s) criado(s), ${atualizados} IMEI(s) preenchido(s).`, filtro: 'todos' });
    state.syncing = false;
    if (btn) { btn.disabled = false; btn.textContent = '⟳ Sync BFleet'; }
    await loadData(root);
  }

  // O PostgREST corta cada resposta em 1000 linhas e colaboradores_atuais tem mais que isso (2,4 mil): sem paginar,
  // quem estava depois da linha 1000 ficava sem telefone/cidade na tela. Ordena por nome + id: sem chave única
  // a paginação repete/pula linhas.
  async function buscarPaginado(tabela, colunas) {
    const TAMANHO = 1000;
    const linhas = [];
    for (let inicio = 0; ; inicio += TAMANHO) {
      const { data, error } = await _opts.supabase.from(tabela).select(colunas)
        .order('nome', { ascending: true }).order('id', { ascending: true })
        .range(inicio, inicio + TAMANHO - 1);
      if (error) return { data: null, error };
      linhas.push(...(data || []));
      if ((data || []).length < TAMANHO) break;
    }
    return { data: linhas, error: null };
  }

  const PESSOAS_TTL_MS = 10 * 60 * 1000;

  // `recarregarPessoas` força a releitura dos colaboradores (botão Atualizar); sem isso a lista é reaproveitada por
  // 10 min, porque cada gravação da tela chama loadData e a lista custa 3 requisições.
  async function loadData(root, { recarregarPessoas = false } = {}) {
    state.loading = true;
    renderTable(root);

    const precisaPessoas = recarregarPessoas || !state.colaboradores.length || (Date.now() - state.colaboradoresEm) > PESSOAS_TTL_MS;

    const [resV, resR, resRem, resMot, resCol, resManut] = await Promise.all([
      _opts.supabase
        .from('frotas_veiculos')
        .select('id,placa,nome,marca,modelo,motorista_atual,coordenacao,status,bfleet_idgps,bfleet_confirmado,rastreador_bfleet,bfleet_rastreador,bfleet_status')
        .eq('status', 'ATIVO')
        .order('placa'),
      _opts.supabase.from('frotas_rastreadores').select('*').order('placa'),
      _opts.supabase.from('frotas_rastreadores_removidos').select('*').order('removido_em', { ascending: false }),
      _opts.supabase.from('frotas_motoristas').select('nome,telefone,endereco'),
      precisaPessoas ? buscarPaginado('colaboradores_atuais', 'id,nome,whatsapp,endereco,bairro,cidade,estado,cep') : Promise.resolve(null),
      _opts.supabase.from(TABLE_MANUT).select('*').order('aberta_em', { ascending: false })
    ]);

    if (resManut.error) toast(resManut.error.message || 'Erro ao carregar manutenções.', true);
    else state.manutencoes = Array.isArray(resManut.data) ? resManut.data : [];

    state.motoristas = Array.isArray(resMot.data) ? resMot.data : [];
    if (resCol?.error) console.warn('[FROTAS_RASTREADORES] Falha ao carregar colaboradores (telefone/cidade dos motoristas):', resCol.error);
    else if (resCol) { state.colaboradores = resCol.data || []; state.colaboradoresEm = Date.now(); }

    if (resV.error) toast(resV.error.message || 'Erro ao carregar veículos.', true);
    else state.veiculos = Array.isArray(resV.data) ? resV.data : [];

    if (resR.error) toast(resR.error.message || 'Erro ao carregar rastreadores.', true);
    else state.rastreadores = Array.isArray(resR.data) ? resR.data : [];

    if (resRem.error) {
      state.removidos = [];
      toast('Tabela REMOVIDOS ainda não criada. Rode a migration de removidos no Supabase.', true);
    } else state.removidos = Array.isArray(resRem.data) ? resRem.data : [];

    mergeData();
    state.loading = false;
    renderKpis(root);
    renderTable(root);
  }

  const FILTROS_INICIAIS = ['todos', 'sem_rastreador', 'em_andamento', 'concluido', 'manutencao', 'removidos', 'agenda', 'bfleet'];

  function openHome(container, opts = {}) {
    _opts = opts;

    // O DOM é refeito a cada montagem, então os filtros recomeçam junto com ele; o link de uma notificação
    // pode abrir já num filtro e numa placa (frotas-cadastros?aba=rastreadores&filtro=manutencao&placa=ABC1D23).
    const inicial = opts.inicial || {};
    state.filtro = 'todos';
    state.busca = inicial.placa || '';
    state.agenda.ano = null;

    container.innerHTML = styles + `
      <div class="fr-shell">
        <div class="fr-head">
          <div class="fr-kicker">Frotas</div>
          <h2 class="fr-title">Rastreadores</h2>
          <p class="fr-sub">Controle de instalação de rastreadores. Veículos com BFleet ativo são sincronizados automaticamente — IMEI em <span style="color:#a5b4fc">roxo</span> indica origem BFleet.</p>
        </div>

        <div class="fm-kpis" data-kpis></div>

        <div class="fr-card">
          <div class="fr-body">
            <div data-agenda-view hidden></div>
            <div data-list-view>
            <div class="fr-toolbar">
              <input class="fr-input" type="search" placeholder="Buscar por placa, cidade, UF, IMEI, motorista..." data-search value="${esc(state.busca)}" />
              <button class="fr-btn ghost" data-clear-filters>Limpar filtros</button>
              <button class="fr-btn soft" data-refresh>↺ Atualizar</button>
              <button class="fr-btn ghost" data-sync-bfleet>⟳ Sync BFleet</button>
            </div>

            <div class="fr-table-wrap">
              <table class="fr-table">
                <colgroup></colgroup>
                <thead><tr data-thead></tr></thead>
                <tbody data-table></tbody>
              </table>
            </div>

            <div data-hist hidden></div>
            </div>
          </div>
        </div>
      </div>`;


    container.querySelector('[data-search]').addEventListener('input', e => {
      state.busca = e.target.value;
      renderTable(container);
    });

    container.querySelector('[data-clear-filters]').addEventListener('click', () => {
      state.busca = '';
      container.querySelector('[data-search]').value = '';
      setFiltro(container, 'todos');
    });

    container.querySelector('[data-kpis]').addEventListener('click', e => {
      const btn = e.target.closest('[data-kpi-filter]');
      if (!btn) return;
      setFiltro(container, btn.dataset.kpiFilter);
    });

    container.querySelector('[data-table]').addEventListener('click', e => {
      const concluir = e.target.closest('[data-mconcluir]');
      if (concluir) { openManutConcluir(container, concluir.dataset.mconcluir); return; }
      const editar = e.target.closest('[data-medit]');
      if (editar) { openManutEditar(container, editar.dataset.medit); return; }
      const mot = e.target.closest('[data-mmot]');
      if (mot) { openMotoristaInfo(mot.dataset.mmot); return; }
      const cancel = e.target.closest('[data-mcancel]');
      if (cancel) cancelarManutencao(container, cancel.dataset.mcancel);
    });

    container.querySelector('[data-refresh]').addEventListener('click', () => loadData(container, { recarregarPessoas: true }));
    container.querySelector('[data-sync-bfleet]').addEventListener('click', () => syncFromBfleet(container));

    container.querySelector('[data-thead]').addEventListener('click', e => {
      const th = e.target.closest('[data-sort]');
      if (!th) return;
      const col = th.dataset.sort;
      if (state.sortCol === col) {
        state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
      } else {
        state.sortCol = col;
        state.sortDir = 'asc';
      }
      container.querySelectorAll('[data-sort]').forEach(t => {
        t.classList.remove('asc', 'desc');
        if (t.dataset.sort === state.sortCol) t.classList.add(state.sortDir);
      });
      renderTable(container);
    });

    if (FILTROS_INICIAIS.includes(inicial.filtro) && inicial.filtro !== 'todos') setFiltro(container, inicial.filtro);
    loadData(container);
  }

  window[MODULE_NAME] = { openHome };
})();
