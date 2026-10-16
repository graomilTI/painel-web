// Frotas — constantes, estado compartilhado e utilitários gerais do módulo Frotas.
// Extraído de modules/frotas.js em 14/10/2026 (era um único bloco autoexecutável de ~4.100 linhas).
// O código das funções e constantes foi movido sem alteração. Para publicar uma mudança em qualquer
// módulo frotas-*.js deste conjunto, troque o token ?v=20261016-frotas-manut-parado1 em TODOS os imports internos (e os do
// carregador da página): o teste tests/frotas-modulos-versao.test.mjs garante que fiquem iguais.

  const MODULE_NAME = 'FROTAS';

  const PASTA_MAE_DRIVE_ID = '1q5Ba5qqNJEBUZYA8GNRZmXZZsJ8U0YIr';

  const GENERATED_GROUPS_KEY = 'FROTAS_EXCESSO_VELOCIDADE_GRUPOS_GERADOS';

  const DEFAULT_GAS_URL = 'https://script.google.com/macros/s/AKfycbzDlhiUGilfA1afrunX3Jtc8LAG4DqMO9v0AJKveUxjUaccfJM_ynnKGRghp_K5AfjK/exec';

  const BFLEET_EXCESSO_FUNCTION = window.FROTAS_CONFIG?.BFLEET_EXCESSO_FUNCTION || 'sync-bfleet-excesso-velocidade';

  const BFLEET_FORA_HORARIO_FUNCTION = window.FROTAS_CONFIG?.BFLEET_FORA_HORARIO_FUNCTION || 'sync-bfleet-fora-horario';

  const BFLEET_FORA_HORARIO_REPORT_ID = '85075';

  const FORA_HORARIO_DOSSIE_FUNCTION = window.FROTAS_CONFIG?.FORA_HORARIO_DOSSIE_FUNCTION || 'frotas-fora-horario-dossie';

  const FORA_HORARIO_ROTA_FUNCTION = window.FROTAS_CONFIG?.FORA_HORARIO_ROTA_FUNCTION || 'frotas-fora-horario-rota';

  const FORA_HORARIO_LISTA_COLUNAS = 'id,data_evento,placa,motorista,coordenacao,supervisao,km_00_05,valor_km,valor_caixa,status_calculo,status_notificacao,status_caixa,tem_rota_caixa,sem_ocorrencia,dossie_id,veredito,confianca,criterio,fonte_expediente,inicio_expediente,fim_expediente,janela_inicio,janela_fim,km_dia,km_fora,min_fora,km_noturno,km_apos_chegada,viagens_dia,viagens_fora,chegada_casa,retorno_previsto,atraso_retorno_min,motivos,resumo_dia,condutor_escalado,caronas,calculado_em,qtd_excessos,vel_max,excessos_fora,km_indevido,viagens_indevidas,veredito_uso,uso_sem_base,continua_anterior,continua_seguinte,exc_pendentes,exc_gerados,exc_notificados';

  const FORA_HORARIO_DOSSIE_COLUNAS = 'id,data_evento,placa,motorista,coordenacao,supervisao,veredito,confianca,criterio,fonte_expediente,inicio_expediente,fim_expediente,janela_inicio,janela_fim,km_dia,km_fora,min_fora,km_noturno,km_apos_chegada,viagens_dia,viagens_fora,chegada_casa,retorno_previsto,atraso_retorno_min,motivos,resumo_dia,condutor_escalado,caronas,calculado_em';

  const ICO_REFRESH = `<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="pointer-events:none"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>`;

  const ICO_IMPORT = `<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="pointer-events:none"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`;

  const ICO_COPY = `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="pointer-events:none"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;

  const ICO_EDIT = `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="pointer-events:none"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`;

  const ICO_SEARCH = `<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="pointer-events:none"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`;

  const ICO_PAPERCLIP = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="pointer-events:none"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>`;

  const ICO_CLOSE = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="pointer-events:none"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;

  const state = {
    records: [{ data: '', velocidade: '' }],
    uploadedFiles: [],
    savedPrints: [],
    lastMessage: '',
    gasUrl: window.FROTAS_CONFIG?.EXCESSO_VELOCIDADE_WEBAPP_URL || DEFAULT_GAS_URL,
    selectedImportedGroupKey: '',
    generatedImportedGroupKeys: new Set(JSON.parse(localStorage.getItem(GENERATED_GROUPS_KEY) || '[]')),
    colaboradores: [],
    colaboradoresLoaded: false,
    importedExcessos: [],
    importedExcessosLoaded: false,
    activeImportedDateFilter: null,
    importedSearchTerm: '',
    importedStatusFilter: 'ALL',
    foraHorario: [],
    foraHorarioLoaded: false,
    foraHorarioSearchTerm: '',
    foraHorarioFiltro: 'ALERTAS',
    foraHorarioMapaBase: 'sat',
    foraHorarioFeriados: {},
    foraHorarioAgrupar: 'dia',
    foraHorarioLinhas: new Map(),
    foraHorarioDossieDisponivel: true,
    foraHorarioRecalculando: false,
    foraHorarioDossieAberto: null,
    foraHorarioDossieChave: '',
    foraHorarioPedido: 0,
    foraHorarioSync: []
  };

  let currentRenderOpts = {};

  // Reatribuído por outros módulos (a tela de Excesso e o Histórico) só por aqui: um módulo importador
  // não pode atribuir a um binding importado, mas lê o valor atual normalmente (live binding).
  function setCurrentRenderOpts(valor) { currentRenderOpts = valor; }

  function resolveSupabase(opts = {}) {
    const candidates = [
      opts?.supabase,
      window.supabase,
      window.supabaseClient,
      window.SUPABASE_CLIENT,
      window.__SUPABASE_CLIENT__,
      window.APP_SUPABASE,
      window.App?.supabase,
      window.ADM?.supabase,
      window.PAINEL?.supabase,
      window.auth?.supabase,
      window.AUTH?.supabase
    ];
    return candidates.find((client) => client && typeof client.from === 'function') || null;
  }

  function todayBRShort() {
    return new Date().toLocaleDateString('pt-BR');
  }

  function normalizeName(value) {
    return String(value || '').trim().replace(/\s+/g, ' ').toUpperCase();
  }

  function normalizeDriverNameForMatch(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toUpperCase()
      .replace(/[^A-Z\s'.-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function isUnknownDriverName(value) {
    const name = normalizeDriverNameForMatch(value);
    if (!name) return true;
    return [
      'MOTORISTA NAO IDENTIFICADO',
      'MOTORISTA NÃO IDENTIFICADO',
      'NAO IDENTIFICADO',
      'NÃO IDENTIFICADO',
      'SEM MOTORISTA',
      'INDEFINIDO',
      'OCR - CONFERIR',
      'OCR CONFERIR'
    ].some((generic) => normalizeDriverNameForMatch(generic) === name);
  }

  function sanitizeFolderName(value) {
    return normalizeName(value).replace(/[\\/:*?"<>|]/g, '-').slice(0, 120);
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function onlyPlate(value) {
    return String(value || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 7);
  }

  function formatDateBR(value) {
    if (!value) return '';
    const raw = String(value).trim();
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(raw)) return raw;
    if (/^\d{2}[-.]\d{2}[-.]\d{4}$/.test(raw)) return raw.replaceAll('-', '/').replaceAll('.', '/');
    const parts = raw.split('-');
    if (parts.length === 3 && parts[0].length === 4) {
      const [yyyy, mm, dd] = parts;
      return `${dd}/${mm}/${yyyy}`;
    }
    return raw;
  }

  function brDateToFilePrefix(value) {
    const br = formatDateBR(value || todayBRShort());
    const m = br.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!m) return br.replace(/\W+/g, '-');
    return `${m[1]}-${m[2]}-${m[3]}`;
  }

  function parseSpeed(value) {
    const n = Number(String(value || '').replace(',', '.'));
    if (!Number.isFinite(n)) return '';
    return Math.round(n);
  }

  function dedupeHighestSpeedByDate(records) {
    const byDate = new Map();
    (Array.isArray(records) ? records : []).forEach((record) => {
      const inputDate = record?.data || record?.date || record?.data_evento || '';
      const dateKey = normalizeDateForMatch(inputDate);
      const speed = parseSpeed(record?.velocidade || record?.speed);
      if (!dateKey || !speed) return;

      const current = byDate.get(dateKey);
      if (!current || speed > current.velocidade) {
        byDate.set(dateKey, {
          ...record,
          data: record?.data || record?.date || formatDateBR(inputDate),
          velocidade: speed
        });
      }
    });

    return Array.from(byDate.values()).sort((a, b) => normalizeDateForMatch(a.data || a.data_evento).localeCompare(normalizeDateForMatch(b.data || b.data_evento)));
  }

  function getCurrentUserName() {
    return window.AUTH?.user?.nome || window.currentUser?.nome || window.APP_USER?.nome || '';
  }

  function getCurrentUserId() {
    return window.AUTH?.user?.id || window.currentUser?.id || window.APP_USER?.id || null;
  }

  function getStyles() {
    return `
      <style id="frotas-module-style">
        html .fh-sem-transform.fh-sem-transform,html .fh-sem-transform.fh-sem-transform:hover{transform:none !important;filter:none !important;backdrop-filter:none !important;-webkit-backdrop-filter:none !important;perspective:none !important;contain:none !important;will-change:auto !important}
        .frotas-shell{width:100%;color:#e2e2f0}.frotas-header{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;margin-bottom:18px}.frotas-kicker{display:inline-flex;align-items:center;gap:8px;color:#86efac;font-size:12px;font-weight:900;letter-spacing:.14em;text-transform:uppercase;margin-bottom:8px}.frotas-title{margin:0;font-size:clamp(22px,2.2vw,32px);line-height:1.1;color:#f8fafc;letter-spacing:-.04em}.frotas-subtitle{max-width:860px;margin:10px 0 0;color:#6b7280;font-size:14px;line-height:1.55}.frotas-card{background:radial-gradient(circle at top left,rgba(34,197,94,.13),transparent 34%),linear-gradient(180deg,rgba(15,23,42,.98),rgba(2,6,23,.98));border:1px solid rgba(148,163,184,.16);border-radius:24px;box-shadow:0 20px 60px rgba(0,0,0,.28);overflow:hidden}.notif-subtabs{display:flex;gap:8px;flex-wrap:wrap;padding:12px 14px 0}.notif-subtab{appearance:none;border:1px solid rgba(148,163,184,.14);background:transparent;color:#9ca3af;border-radius:12px 12px 0 0;padding:9px 14px;font-weight:900;font-size:12px;cursor:pointer;transition:.16s ease;border-bottom:2px solid transparent}.notif-subtab.active,.notif-subtab:hover{color:#bbf7d0;border-color:rgba(34,197,94,.35);border-bottom-color:#22c55e;background:rgba(34,197,94,.08)}.frotas-body{padding:18px}.speed-grid{display:grid;grid-template-columns:minmax(300px,450px) minmax(320px,1fr);gap:18px;align-items:start}.speed-panel{background:rgba(15,23,42,.72);border:1px solid rgba(148,163,184,.14);border-radius:22px;padding:18px}.speed-panel h3{margin:0 0 14px;color:#f8fafc;font-size:16px;letter-spacing:-.02em}.speed-field{display:flex;flex-direction:column;gap:7px;margin-bottom:14px}.speed-field label{color:#cbd5e1;font-size:12px;font-weight:900;text-transform:uppercase;letter-spacing:.08em}.speed-input,.speed-select,.speed-textarea{width:100%;border:1px solid rgba(148,163,184,.18);background:#0d0d18;color:#e2e2f0;border-radius:14px;padding:12px 13px;outline:none;font-size:14px;transition:.16s ease;color-scheme:dark}.speed-select option{background:#0d0d18;color:#e2e2f0}.speed-input:focus,.speed-select:focus,.speed-textarea:focus{border-color:rgba(34,197,94,.68);box-shadow:0 0 0 4px rgba(34,197,94,.10)}.speed-row{display:grid;grid-template-columns:1fr 130px 42px;gap:10px;align-items:end;margin-bottom:10px}.speed-row .speed-field{margin-bottom:0}.speed-btn{border:0;border-radius:14px;padding:12px 14px;font-weight:950;cursor:pointer;transition:.18s ease;display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:44px}.speed-btn-primary{width:100%;background:linear-gradient(135deg,#16a34a,#22c55e);color:#052e16;box-shadow:0 14px 34px rgba(34,197,94,.22)}.speed-btn-primary:hover{transform:translateY(-1px);filter:brightness(1.05)}.speed-btn-primary:disabled{opacity:.55;cursor:not-allowed;transform:none}.speed-btn-soft{background:rgba(34,197,94,.12);color:#86efac;border:1px solid rgba(34,197,94,.24)}.speed-btn-danger{background:rgba(239,68,68,.10);color:#fca5a5;border:1px solid rgba(239,68,68,.20);padding:0;min-width:42px}.speed-actions{display:grid;gap:10px;margin-top:14px}.speed-message{min-height:520px;resize:vertical;line-height:1.55;white-space:pre-wrap}.speed-hint{margin:10px 0 0;color:#6b7280;font-size:12px;line-height:1.45}.speed-hint code{color:#bbf7d0}.speed-colab-status{margin-top:-6px;color:#86efac;font-size:11px;font-weight:800;line-height:1.35}.colab-autocomplete{position:relative}.colab-dropdown{position:absolute;left:0;right:0;top:calc(100% - 4px);z-index:60;background:linear-gradient(180deg,#0d0d18,#020617);border:1px solid rgba(34,197,94,.38);border-radius:16px;box-shadow:0 18px 44px rgba(0,0,0,.42);padding:6px;max-height:286px;overflow:auto}.colab-dropdown[hidden]{display:none}.colab-option{width:100%;border:0;background:transparent;color:#e2e2f0;text-align:left;border-radius:12px;padding:10px 11px;cursor:pointer;display:block}.colab-option:hover,.colab-option.active{background:rgba(22,101,52,.34)}.colab-option strong{display:block;font-size:12px;line-height:1.25;color:#f8fafc;letter-spacing:.02em}.colab-option span{display:block;margin-top:3px;font-size:11px;line-height:1.25;color:#6b7280}.colab-empty{padding:10px 11px;color:#6b7280;font-size:12px}.speed-divider{height:1px;background:rgba(148,163,184,.14);margin:16px 0}.speed-import-card{border:1px solid rgba(34,197,94,.18);background:rgba(2,6,23,.32);border-radius:18px;padding:14px;margin-bottom:16px}.speed-import-head{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:10px}.speed-import-head h3{margin:0}.speed-import-actions{display:flex;gap:8px;flex-wrap:wrap;align-items:center}.speed-sync-range{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:8px 0 4px}.speed-sync-range .speed-field{margin-bottom:0}.speed-sync-range .speed-input{min-height:38px;padding:8px 10px;font-size:12px}@media(max-width:560px){.speed-sync-range{grid-template-columns:1fr}.speed-import-bulk{grid-template-columns:1fr}}.speed-btn-compact{width:auto;min-height:38px;padding:9px 12px;font-size:12px}.speed-import-bulk{display:grid;grid-template-columns:minmax(130px,1fr) minmax(130px,1fr) auto;gap:8px;align-items:end;margin:8px 0 10px}.speed-import-bulk .speed-input{min-height:38px;padding:8px 10px;font-size:12px}.speed-import-list{display:grid;gap:8px;max-height:260px;overflow:auto}.speed-import-empty{color:#6b7280;font-size:12px;border:1px dashed rgba(148,163,184,.2);border-radius:14px;padding:12px}.speed-import-filter-note{border:1px solid rgba(34,197,94,.25);background:rgba(34,197,94,.08);border-radius:14px;padding:10px 12px;margin:0 0 10px;color:#bbf7d0;font-size:12px}.speed-import-item{width:100%;text-align:left;border:1px solid rgba(148,163,184,.14);background:rgba(15,23,42,.72);color:#e2e2f0;border-radius:14px;padding:10px 12px;cursor:pointer}.speed-import-item:hover{border-color:rgba(34,197,94,.45);background:rgba(22,101,52,.18)}.speed-import-item.selected{border-color:rgba(34,197,94,.75);background:rgba(22,101,52,.24);box-shadow:inset 4px 0 0 rgba(34,197,94,.75)}.speed-import-item.generated{border-color:rgba(34,197,94,.36);background:rgba(20,83,45,.30);opacity:.74}.speed-import-item.generated strong::after{content:'  ✓ COPIADA';display:inline-flex;margin-left:6px;color:#86efac;font-size:10px;font-weight:950}.speed-import-item.generated .speed-import-badge{background:rgba(34,197,94,.22);border-color:rgba(34,197,94,.45);color:#dcfce7}.speed-import-item strong{display:block;color:#f8fafc;font-size:12px}.speed-import-item span{display:block;color:#6b7280;font-size:11px;margin-top:3px}.speed-import-badge{display:inline-flex;border-radius:999px;padding:3px 7px;background:rgba(34,197,94,.12);border:1px solid rgba(34,197,94,.22);color:#bbf7d0;font-size:10px;font-weight:900;margin-top:6px}.speed-import-footer{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:8px}.speed-import-ok{border:1px solid rgba(134,239,172,.35);background:rgba(34,197,94,.16);color:#dcfce7;border-radius:999px;padding:5px 10px;font-size:10px;font-weight:950;cursor:pointer}.speed-import-ok:hover{background:rgba(34,197,94,.28);border-color:rgba(134,239,172,.65)}.speed-import-actions-row{display:flex;align-items:center;gap:6px}.speed-import-action{border:1px solid rgba(148,163,184,.22);background:rgba(15,23,42,.75);color:#cbd5e1;border-radius:10px;width:30px;height:30px;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;transition:.16s ease}.speed-import-action:hover{border-color:rgba(34,197,94,.55);color:#bbf7d0;background:rgba(22,101,52,.28)}.speed-icon-btn{width:auto;min-height:38px;padding:9px 11px}.speed-icon-btn svg{pointer-events:none}.speed-import-search{display:grid;grid-template-columns:1fr 190px auto;gap:8px;margin:12px 0}.speed-search-field{position:relative}.speed-search-field svg{position:absolute;left:12px;top:50%;transform:translateY(-50%);color:#6b7280;pointer-events:none}.speed-search-field input{padding-left:34px}.speed-import-search select{width:100%;min-height:44px;border:1px solid rgba(148,163,184,.18);background:#0d0d18;color:#e2e2f0;border-radius:14px;padding:10px 12px;font-size:13px;outline:none;color-scheme:dark}.speed-import-search .speed-btn{width:auto}@media(max-width:640px){.speed-import-search{grid-template-columns:1fr}}.speed-fab{position:fixed;right:24px;bottom:24px;z-index:400;display:inline-flex;align-items:center;gap:9px;background:linear-gradient(135deg,#16a34a,#22c55e);color:#052e16;border:0;border-radius:999px;padding:14px 20px;font-weight:950;font-size:14px;cursor:pointer;box-shadow:0 14px 34px rgba(34,197,94,.38);transition:.18s ease}.speed-fab:hover{transform:translateY(-2px);filter:brightness(1.05)}.speed-modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,.65);display:flex;align-items:center;justify-content:center;z-index:9999;padding:20px}.speed-modal-overlay[hidden]{display:none}.speed-modal{background:#0d0d18;border:1px solid rgba(52,211,153,.22);border-radius:22px;padding:20px;width:100%;max-width:640px;max-height:90vh;overflow:auto;box-shadow:0 24px 70px rgba(0,0,0,.5)}.speed-modal-head{display:flex;justify-content:space-between;align-items:flex-start;gap:10px;margin-bottom:14px}.speed-modal-head h3{margin:0}.speed-modal-close{border:0;background:rgba(148,163,184,.14);color:#cbd5e1;border-radius:10px;width:34px;height:34px;flex-shrink:0;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;transition:.16s ease}.speed-modal-close:hover{background:rgba(239,68,68,.18);color:#fca5a5}.speed-fonte-bfleet{background:rgba(96,165,250,.12);border-color:rgba(96,165,250,.30);color:#93c5fd}.speed-fonte-infleet{background:rgba(251,191,36,.12);border-color:rgba(251,191,36,.30);color:#fde68a}.upload-box{border:1px dashed rgba(34,197,94,.35);border-radius:18px;padding:14px;background:rgba(2,6,23,.28)}.upload-list{display:grid;gap:8px;margin-top:10px}.upload-item{display:flex;justify-content:space-between;gap:10px;align-items:center;border:1px solid rgba(148,163,184,.13);background:rgba(15,23,42,.66);border-radius:14px;padding:10px 12px;color:#cbd5e1;font-size:12px}.upload-item strong{color:#f8fafc}.saved-list{display:grid;gap:8px;margin-top:10px}.saved-item{border:1px solid rgba(34,197,94,.20);background:rgba(22,101,52,.12);border-radius:14px;padding:10px 12px;color:#dcfce7;font-size:12px}.saved-item a{color:#86efac;font-weight:900}.speed-toast{position:fixed;right:22px;bottom:22px;background:rgba(22,101,52,.96);color:#dcfce7;border:1px solid rgba(134,239,172,.32);border-radius:16px;padding:12px 14px;font-weight:900;box-shadow:0 16px 45px rgba(0,0,0,.35);z-index:99999;opacity:0;transform:translateY(10px);pointer-events:none;transition:.2s ease}.speed-toast.show{opacity:1;transform:translateY(0)}.speed-grid{display:grid;grid-template-columns:1.05fr .95fr;gap:18px;align-items:start}.speed-step-title{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:14px}.speed-step-title h3{margin:0}.speed-step-pill{display:inline-flex;align-items:center;border:1px solid rgba(34,197,94,.28);background:rgba(34,197,94,.12);color:#bbf7d0;border-radius:999px;padding:5px 9px;font-size:10px;font-weight:950;text-transform:uppercase;letter-spacing:.08em;white-space:nowrap}.speed-message.small{min-height:280px}.paste-zone{border:1px dashed rgba(34,197,94,.42);border-radius:20px;background:radial-gradient(circle at top left,rgba(34,197,94,.14),transparent 32%),rgba(2,6,23,.36);padding:20px;text-align:center;outline:none;transition:.18s ease;cursor:pointer}.paste-zone:hover,.paste-zone:focus,.paste-zone.drag{border-color:rgba(134,239,172,.86);background:rgba(22,101,52,.16);box-shadow:0 0 0 4px rgba(34,197,94,.08)}.paste-zone strong{display:block;color:#f8fafc;font-size:15px;margin-bottom:6px}.paste-zone span{display:block;color:#6b7280;font-size:12px;line-height:1.45}.paste-zone kbd{display:inline-flex;border:1px solid rgba(148,163,184,.24);background:#0d0d18;color:#bbf7d0;border-radius:8px;padding:2px 6px;font-size:11px;font-weight:900}.hist-toolbar{display:grid;grid-template-columns:1.5fr 170px 150px 150px auto;gap:10px;align-items:end;margin-bottom:14px}.hist-kpi-grid{display:grid;grid-template-columns:repeat(4,minmax(120px,1fr));gap:12px;margin:12px 0 14px}.hist-kpi{border:1px solid rgba(148,163,184,.14);background:rgba(15,23,42,.58);border-radius:18px;padding:14px}.hist-kpi span{display:block;color:#6b7280;font-size:11px;font-weight:900;text-transform:uppercase;letter-spacing:.08em}.hist-kpi strong{display:block;color:#f8fafc;font-size:24px;margin-top:6px}.hist-list{display:grid;gap:14px}.hist-card{border:1px solid rgba(148,163,184,.14);background:rgba(15,23,42,.62);border-radius:20px;padding:14px}.hist-card-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;margin-bottom:12px}.hist-card h3{margin:0;color:#f8fafc;font-size:16px}.hist-card p{margin:5px 0 0;color:#6b7280;font-size:12px}.hist-mini-kpis{display:flex;gap:7px;flex-wrap:wrap;justify-content:flex-end}.hist-mini-kpis span{display:inline-flex;border:1px solid rgba(34,197,94,.22);background:rgba(34,197,94,.10);color:#bbf7d0;border-radius:999px;padding:5px 8px;font-size:10px;font-weight:950}.hist-table-wrap{overflow:auto;border-radius:14px;border:1px solid rgba(148,163,184,.12)}.hist-table{width:100%;border-collapse:collapse;min-width:780px;background:rgba(2,6,23,.22)}.hist-table th,.hist-table td{padding:10px 11px;border-bottom:1px solid rgba(148,163,184,.10);text-align:left;vertical-align:top;color:#cbd5e1;font-size:12px}.hist-table th{color:#6b7280;text-transform:uppercase;font-size:10px;letter-spacing:.08em;background:rgba(2,6,23,.38)}.hist-table td small{color:#6b7280;line-height:1.35}.hist-badge{display:inline-flex;border-radius:999px;padding:4px 8px;font-size:10px;font-weight:950;border:1px solid rgba(148,163,184,.22);color:#e2e2f0;background:rgba(148,163,184,.10)}.hist-badge.excesso{border-color:rgba(248,113,113,.28);background:rgba(127,29,29,.22);color:#fecaca}.hist-badge.multa{border-color:rgba(250,204,21,.28);background:rgba(113,63,18,.20);color:#fde68a}.hist-badge.manutencao{border-color:rgba(96,165,250,.28);background:rgba(30,64,175,.18);color:#bfdbfe}@media(max-width:980px){.hist-toolbar{grid-template-columns:1fr 1fr}.hist-kpi-grid{grid-template-columns:1fr 1fr}.hist-card-head{display:block}.hist-mini-kpis{justify-content:flex-start;margin-top:10px}}.upload-actions{display:grid;grid-template-columns:1fr;gap:10px;margin-top:12px}.print-status-box{border:1px solid rgba(148,163,184,.14);background:rgba(15,23,42,.52);border-radius:16px;padding:12px;margin-top:14px}.print-status-box strong{display:block;color:#f8fafc;font-size:12px;margin-bottom:5px}.print-status-box p{margin:0;color:#6b7280;font-size:12px;line-height:1.45}@media(max-width:1100px){.speed-grid{grid-template-columns:1fr}.speed-row{grid-template-columns:1fr 1fr 42px}}@media(max-width:560px){.frotas-header{display:block}.speed-row{grid-template-columns:1fr}.speed-btn-danger{width:100%}.speed-step-title{display:block}.speed-step-pill{margin-top:8px}}
      </style>`;
  }

  async function callEdgeFunction(opts, name, body) {
    const supabase = resolveSupabase(opts);
    if (!supabase?.functions?.invoke) {
      throw new Error('Supabase Functions não encontrado nesta página.');
    }
    const { data, error } = await supabase.functions.invoke(name, { body });
    if (error) {
      let detail = '';
      const context = error.context;
      if (context && typeof context.clone === 'function') {
        try {
          const payload = await context.clone().json();
          detail = payload?.error || payload?.message || '';
        } catch {
          try { detail = await context.clone().text(); } catch { detail = ''; }
        }
      } else {
        detail = context?.error || context?.message || '';
      }
      const msg = detail || error.message || `Falha na function ${name}`;
      if (/connection refused|failed to send a request|failed to fetch|connecterror/i.test(msg)) {
        throw new Error('A BFleet está temporariamente indisponível. Aguarde alguns instantes e tente sincronizar novamente.');
      }
      throw new Error(msg.length > 360 ? `${msg.slice(0, 357)}...` : msg);
    }
    if (data?.error) throw new Error(data.error);
    return data || {};
  }

  async function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text);
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.left = '-9999px'; document.body.appendChild(ta); ta.focus(); ta.select();
    const ok = document.execCommand('copy'); document.body.removeChild(ta); if (!ok) throw new Error('Falha ao copiar.');
  }

  function toast(message, type = 'success') {
    let el = document.querySelector('.speed-toast');
    if (!el) { el = document.createElement('div'); el.className = 'speed-toast'; document.body.appendChild(el); }
    el.textContent = message;
    el.style.background = type === 'error' ? 'rgba(127,29,29,.96)' : 'rgba(22,101,52,.96)';
    el.classList.add('show'); window.setTimeout(() => el.classList.remove('show'), 3000);
  }

  function normalizeDateForMatch(value) {
    const br = formatDateBR(value);
    const m = br.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    return m ? `${m[3]}-${m[2]}-${m[1]}` : String(value || '').slice(0, 10);
  }

  function localInputDate(date = new Date()) {
    const d = new Date(date);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  function yesterdayInputDate() {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return localInputDate(d);
  }

  function normalizeTextForOcrMatch(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toUpperCase()
      .replace(/[^A-Z0-9\s/.-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function toInputDate(value) {
    const br = formatDateBR(value);
    const m = br.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    return m ? `${m[3]}-${m[2]}-${m[1]}` : '';
  }

export { MODULE_NAME, PASTA_MAE_DRIVE_ID, DEFAULT_GAS_URL, BFLEET_EXCESSO_FUNCTION, BFLEET_FORA_HORARIO_FUNCTION, BFLEET_FORA_HORARIO_REPORT_ID, FORA_HORARIO_DOSSIE_FUNCTION, FORA_HORARIO_ROTA_FUNCTION, FORA_HORARIO_LISTA_COLUNAS, ICO_REFRESH, ICO_COPY, ICO_SEARCH, ICO_PAPERCLIP, ICO_CLOSE, state, currentRenderOpts, resolveSupabase, todayBRShort, normalizeName, normalizeDriverNameForMatch, isUnknownDriverName, sanitizeFolderName, escapeHtml, onlyPlate, formatDateBR, brDateToFilePrefix, parseSpeed, dedupeHighestSpeedByDate, getCurrentUserName, getCurrentUserId, getStyles, callEdgeFunction, copyText, toast, normalizeDateForMatch, yesterdayInputDate, normalizeTextForOcrMatch, toInputDate, setCurrentRenderOpts };
