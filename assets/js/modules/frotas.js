/* assets/js/modules/frotas.js */
(function () {
  'use strict';

  const MODULE_NAME = 'FROTAS';
  const PASTA_MAE_DRIVE_ID = '1q5Ba5qqNJEBUZYA8GNRZmXZZsJ8U0YIr';
  const GAS_URL_KEY = 'FROTAS_EXCESSO_VELOCIDADE_GAS_URL';
  const GENERATED_GROUPS_KEY = 'FROTAS_EXCESSO_VELOCIDADE_GRUPOS_GERADOS';
  const DEFAULT_GAS_URL = 'https://script.google.com/macros/s/AKfycbzDlhiUGilfA1afrunX3Jtc8LAG4DqMO9v0AJKveUxjUaccfJM_ynnKGRghp_K5AfjK/exec';
  const BFLEET_EXCESSO_FUNCTION = window.FROTAS_CONFIG?.BFLEET_EXCESSO_FUNCTION || 'sync-bfleet-excesso-velocidade';

  const state = {
    records: [{ data: '', velocidade: '' }],
    uploadedFiles: [],
    savedPrints: [],
    lastMessage: '',
    gasUrl: localStorage.getItem(GAS_URL_KEY) || window.FROTAS_CONFIG?.EXCESSO_VELOCIDADE_WEBAPP_URL || DEFAULT_GAS_URL,
    selectedImportedGroupKey: '',
    generatedImportedGroupKeys: new Set(JSON.parse(localStorage.getItem(GENERATED_GROUPS_KEY) || '[]')),
    colaboradores: [],
    colaboradoresLoaded: false,
    importedExcessos: [],
    importedExcessosLoaded: false,
    activeImportedDateFilter: null
  };

  let currentRenderOpts = {};

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


  function panelUrl(target = '') {
    const normalized = String(target || '').replace(/^\/+/, '').replace(/\.html$/i, '');
    const host = String(window.location.hostname || '').toLowerCase();
    if (host === 'grao1000.com.br' || host === 'www.grao1000.com.br') {
      return normalized ? `/painel/${normalized}`.replace(/([^:]\/)\/+/g, '$1') : '/painel';
    }
    if (String(window.location.pathname || '').includes('/painel')) {
      return normalized ? `/painel/${normalized}`.replace(/([^:]\/)\/+/g, '$1') : '/painel';
    }
    return normalized ? `./${normalized}` : './';
  }

  function todayBRShort() {
    return new Date().toLocaleDateString('pt-BR');
  }

  function todayBRLong() {
    return new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
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
      'INDEFINIDO'
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

  function cloneFileWithName(file, name) {
    try {
      return new File([file], name, { type: file.type || 'image/png', lastModified: file.lastModified || Date.now() });
    } catch (_) {
      file.__displayName = name;
      return file;
    }
  }


  function clipboardImageFilesFromEvent(ev) {
    const out = [];
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');

    Array.from(ev?.clipboardData?.items || []).forEach((item, index) => {
      if (!String(item.type || '').startsWith('image/')) return;
      const blob = item.getAsFile && item.getAsFile();
      if (!blob) return;
      const ext = (String(blob.type || 'image/png').split('/')[1] || 'png').replace('jpeg', 'jpg');
      const name = blob.name && !/^image\.(png|jpg|jpeg|webp)$/i.test(blob.name)
        ? blob.name
        : `print-colado-${stamp}-${index + 1}.${ext}`;
      out.push(cloneFileWithName(blob, name));
    });

    if (!out.length) {
      Array.from(ev?.clipboardData?.files || []).forEach((file, index) => {
        if (!String(file.type || '').startsWith('image/')) return;
        const ext = (String(file.type || 'image/png').split('/')[1] || 'png').replace('jpeg', 'jpg');
        const name = file.name && !/^image\.(png|jpg|jpeg|webp)$/i.test(file.name)
          ? file.name
          : `print-colado-${stamp}-${index + 1}.${ext}`;
        out.push(cloneFileWithName(file, name));
      });
    }

    return out;
  }

  function addUploadedFiles(root, files, source = 'selecionado') {
    const incoming = Array.from(files || []).filter((file) => String(file.type || '').startsWith('image/'));
    if (!incoming.length) {
      toast('Nenhuma imagem encontrada. Cole ou selecione prints em formato de imagem.', 'error');
      return;
    }

    const prepared = incoming.map((file, index) => {
      const hasUsefulName = file.name && !/^image\.(png|jpg|jpeg|webp)$/i.test(file.name);
      const name = hasUsefulName ? file.name : `print-colado-${new Date().toISOString().replace(/[:.]/g, '-')}-${index + 1}.png`;
      const next = hasUsefulName ? file : cloneFileWithName(file, name);
      next.__source = source;
      return next;
    });

    const seen = new Set(state.uploadedFiles.map((file) => `${file.name || file.__displayName}|${file.size}|${file.lastModified || ''}`));
    prepared.forEach((file) => {
      const key = `${file.name || file.__displayName}|${file.size}|${file.lastModified || ''}`;
      if (!seen.has(key)) {
        seen.add(key);
        state.uploadedFiles.push(file);
      }
    });

    renderUploadLists(root);
    toast(`${prepared.length} print(s) adicionados para envio.`);
  }

  function rememberGeneratedGroup(key) {
    if (!key) return;
    state.generatedImportedGroupKeys.add(key);
    localStorage.setItem(GENERATED_GROUPS_KEY, JSON.stringify(Array.from(state.generatedImportedGroupKeys)));
  }

  function getCurrentUserName() {
    return window.AUTH?.user?.nome || window.currentUser?.nome || window.APP_USER?.nome || '';
  }

  function getCurrentUserId() {
    return window.AUTH?.user?.id || window.currentUser?.id || window.APP_USER?.id || null;
  }

  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || '').split(',')[1] || '');
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function getStyles() {
    return `
      <style id="frotas-module-style">
        .frotas-shell{width:100%;color:#e5e7eb}.frotas-header{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;margin-bottom:18px}.frotas-kicker{display:inline-flex;align-items:center;gap:8px;color:#86efac;font-size:12px;font-weight:900;letter-spacing:.14em;text-transform:uppercase;margin-bottom:8px}.frotas-title{margin:0;font-size:clamp(22px,2.2vw,32px);line-height:1.1;color:#f8fafc;letter-spacing:-.04em}.frotas-subtitle{max-width:860px;margin:10px 0 0;color:#94a3b8;font-size:14px;line-height:1.55}.frotas-card{background:radial-gradient(circle at top left,rgba(34,197,94,.13),transparent 34%),linear-gradient(180deg,rgba(15,23,42,.98),rgba(2,6,23,.98));border:1px solid rgba(148,163,184,.16);border-radius:24px;box-shadow:0 20px 60px rgba(0,0,0,.28);overflow:hidden}.frotas-tabs{display:flex;gap:10px;flex-wrap:wrap;padding:14px;border-bottom:1px solid rgba(148,163,184,.12);background:rgba(2,6,23,.36)}.frotas-tab{appearance:none;border:1px solid rgba(148,163,184,.16);background:rgba(15,23,42,.72);color:#cbd5e1;border-radius:999px;padding:10px 14px;font-weight:900;font-size:13px;cursor:pointer;transition:.18s ease}.frotas-tab.active,.frotas-tab:hover{color:#f8fafc;border-color:rgba(34,197,94,.55);background:rgba(22,101,52,.35)}.frotas-body{padding:18px}.speed-grid{display:grid;grid-template-columns:minmax(300px,450px) minmax(320px,1fr);gap:18px;align-items:start}.speed-panel{background:rgba(15,23,42,.72);border:1px solid rgba(148,163,184,.14);border-radius:22px;padding:18px}.speed-panel h3{margin:0 0 14px;color:#f8fafc;font-size:16px;letter-spacing:-.02em}.speed-field{display:flex;flex-direction:column;gap:7px;margin-bottom:14px}.speed-field label{color:#cbd5e1;font-size:12px;font-weight:900;text-transform:uppercase;letter-spacing:.08em}.speed-input,.speed-select,.speed-textarea{width:100%;border:1px solid rgba(148,163,184,.18);background:#0f172a;color:#e5e7eb;border-radius:14px;padding:12px 13px;outline:none;font-size:14px;transition:.16s ease;color-scheme:dark}.speed-select option{background:#0f172a;color:#e5e7eb}.speed-input:focus,.speed-select:focus,.speed-textarea:focus{border-color:rgba(34,197,94,.68);box-shadow:0 0 0 4px rgba(34,197,94,.10)}.speed-row{display:grid;grid-template-columns:1fr 130px 42px;gap:10px;align-items:end;margin-bottom:10px}.speed-row .speed-field{margin-bottom:0}.speed-btn{border:0;border-radius:14px;padding:12px 14px;font-weight:950;cursor:pointer;transition:.18s ease;display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:44px}.speed-btn-primary{width:100%;background:linear-gradient(135deg,#16a34a,#22c55e);color:#052e16;box-shadow:0 14px 34px rgba(34,197,94,.22)}.speed-btn-primary:hover{transform:translateY(-1px);filter:brightness(1.05)}.speed-btn-primary:disabled{opacity:.55;cursor:not-allowed;transform:none}.speed-btn-soft{background:rgba(34,197,94,.12);color:#86efac;border:1px solid rgba(34,197,94,.24)}.speed-btn-danger{background:rgba(239,68,68,.10);color:#fca5a5;border:1px solid rgba(239,68,68,.20);padding:0;min-width:42px}.speed-actions{display:grid;gap:10px;margin-top:14px}.speed-message{min-height:520px;resize:vertical;line-height:1.55;white-space:pre-wrap}.speed-hint{margin:10px 0 0;color:#94a3b8;font-size:12px;line-height:1.45}.speed-hint code{color:#bbf7d0}.speed-colab-status{margin-top:-6px;color:#86efac;font-size:11px;font-weight:800;line-height:1.35}.colab-autocomplete{position:relative}.colab-dropdown{position:absolute;left:0;right:0;top:calc(100% - 4px);z-index:60;background:linear-gradient(180deg,#0f172a,#020617);border:1px solid rgba(34,197,94,.38);border-radius:16px;box-shadow:0 18px 44px rgba(0,0,0,.42);padding:6px;max-height:286px;overflow:auto}.colab-dropdown[hidden]{display:none}.colab-option{width:100%;border:0;background:transparent;color:#e5e7eb;text-align:left;border-radius:12px;padding:10px 11px;cursor:pointer;display:block}.colab-option:hover,.colab-option.active{background:rgba(22,101,52,.34)}.colab-option strong{display:block;font-size:12px;line-height:1.25;color:#f8fafc;letter-spacing:.02em}.colab-option span{display:block;margin-top:3px;font-size:11px;line-height:1.25;color:#94a3b8}.colab-empty{padding:10px 11px;color:#94a3b8;font-size:12px}.speed-divider{height:1px;background:rgba(148,163,184,.14);margin:16px 0}.speed-import-card{border:1px solid rgba(34,197,94,.18);background:rgba(2,6,23,.32);border-radius:18px;padding:14px;margin-bottom:16px}.speed-import-head{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:10px}.speed-import-head h3{margin:0}.speed-import-actions{display:flex;gap:8px;flex-wrap:wrap;align-items:center}.speed-sync-range{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:8px 0 4px}.speed-sync-range .speed-field{margin-bottom:0}.speed-sync-range .speed-input{min-height:38px;padding:8px 10px;font-size:12px}@media(max-width:560px){.speed-sync-range{grid-template-columns:1fr}.speed-import-bulk{grid-template-columns:1fr}}.speed-btn-compact{width:auto;min-height:38px;padding:9px 12px;font-size:12px}.speed-import-bulk{display:grid;grid-template-columns:minmax(130px,1fr) minmax(130px,1fr) auto;gap:8px;align-items:end;margin:8px 0 10px}.speed-import-bulk .speed-input{min-height:38px;padding:8px 10px;font-size:12px}.speed-import-list{display:grid;gap:8px;max-height:260px;overflow:auto}.speed-import-empty{color:#94a3b8;font-size:12px;border:1px dashed rgba(148,163,184,.2);border-radius:14px;padding:12px}.speed-import-filter-note{border:1px solid rgba(34,197,94,.25);background:rgba(34,197,94,.08);border-radius:14px;padding:10px 12px;margin:0 0 10px;color:#bbf7d0;font-size:12px}.speed-import-item{width:100%;text-align:left;border:1px solid rgba(148,163,184,.14);background:rgba(15,23,42,.72);color:#e5e7eb;border-radius:14px;padding:10px 12px;cursor:pointer}.speed-import-item:hover{border-color:rgba(34,197,94,.45);background:rgba(22,101,52,.18)}.speed-import-item.selected{border-color:rgba(34,197,94,.75);background:rgba(22,101,52,.24);box-shadow:inset 4px 0 0 rgba(34,197,94,.75)}.speed-import-item.generated{border-color:rgba(34,197,94,.36);background:rgba(20,83,45,.30);opacity:.74}.speed-import-item.generated strong::after{content:'  ✓ COPIADA';display:inline-flex;margin-left:6px;color:#86efac;font-size:10px;font-weight:950}.speed-import-item.generated .speed-import-badge{background:rgba(34,197,94,.22);border-color:rgba(34,197,94,.45);color:#dcfce7}.speed-import-item strong{display:block;color:#f8fafc;font-size:12px}.speed-import-item span{display:block;color:#94a3b8;font-size:11px;margin-top:3px}.speed-import-badge{display:inline-flex;border-radius:999px;padding:3px 7px;background:rgba(34,197,94,.12);border:1px solid rgba(34,197,94,.22);color:#bbf7d0;font-size:10px;font-weight:900;margin-top:6px}.speed-import-footer{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:8px}.speed-import-ok{border:1px solid rgba(134,239,172,.35);background:rgba(34,197,94,.16);color:#dcfce7;border-radius:999px;padding:5px 10px;font-size:10px;font-weight:950;cursor:pointer}.speed-import-ok:hover{background:rgba(34,197,94,.28);border-color:rgba(134,239,172,.65)}.upload-box{border:1px dashed rgba(34,197,94,.35);border-radius:18px;padding:14px;background:rgba(2,6,23,.28)}.upload-list{display:grid;gap:8px;margin-top:10px}.upload-item{display:flex;justify-content:space-between;gap:10px;align-items:center;border:1px solid rgba(148,163,184,.13);background:rgba(15,23,42,.66);border-radius:14px;padding:10px 12px;color:#cbd5e1;font-size:12px}.upload-item strong{color:#f8fafc}.saved-list{display:grid;gap:8px;margin-top:10px}.saved-item{border:1px solid rgba(34,197,94,.20);background:rgba(22,101,52,.12);border-radius:14px;padding:10px 12px;color:#dcfce7;font-size:12px}.saved-item a{color:#86efac;font-weight:900}.speed-toast{position:fixed;right:22px;bottom:22px;background:rgba(22,101,52,.96);color:#dcfce7;border:1px solid rgba(134,239,172,.32);border-radius:16px;padding:12px 14px;font-weight:900;box-shadow:0 16px 45px rgba(0,0,0,.35);z-index:99999;opacity:0;transform:translateY(10px);pointer-events:none;transition:.2s ease}.speed-toast.show{opacity:1;transform:translateY(0)}.speed-grid{display:grid;grid-template-columns:1.05fr .95fr;gap:18px;align-items:start}.speed-step-title{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:14px}.speed-step-title h3{margin:0}.speed-step-pill{display:inline-flex;align-items:center;border:1px solid rgba(34,197,94,.28);background:rgba(34,197,94,.12);color:#bbf7d0;border-radius:999px;padding:5px 9px;font-size:10px;font-weight:950;text-transform:uppercase;letter-spacing:.08em;white-space:nowrap}.speed-message.small{min-height:280px}.paste-zone{border:1px dashed rgba(34,197,94,.42);border-radius:20px;background:radial-gradient(circle at top left,rgba(34,197,94,.14),transparent 32%),rgba(2,6,23,.36);padding:20px;text-align:center;outline:none;transition:.18s ease;cursor:pointer}.paste-zone:hover,.paste-zone:focus,.paste-zone.drag{border-color:rgba(134,239,172,.86);background:rgba(22,101,52,.16);box-shadow:0 0 0 4px rgba(34,197,94,.08)}.paste-zone strong{display:block;color:#f8fafc;font-size:15px;margin-bottom:6px}.paste-zone span{display:block;color:#94a3b8;font-size:12px;line-height:1.45}.paste-zone kbd{display:inline-flex;border:1px solid rgba(148,163,184,.24);background:#0f172a;color:#bbf7d0;border-radius:8px;padding:2px 6px;font-size:11px;font-weight:900}.hist-toolbar{display:grid;grid-template-columns:1.5fr 170px 150px 150px auto;gap:10px;align-items:end;margin-bottom:14px}.hist-kpi-grid{display:grid;grid-template-columns:repeat(4,minmax(120px,1fr));gap:12px;margin:12px 0 14px}.hist-kpi{border:1px solid rgba(148,163,184,.14);background:rgba(15,23,42,.58);border-radius:18px;padding:14px}.hist-kpi span{display:block;color:#94a3b8;font-size:11px;font-weight:900;text-transform:uppercase;letter-spacing:.08em}.hist-kpi strong{display:block;color:#f8fafc;font-size:24px;margin-top:6px}.hist-list{display:grid;gap:14px}.hist-card{border:1px solid rgba(148,163,184,.14);background:rgba(15,23,42,.62);border-radius:20px;padding:14px}.hist-card-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;margin-bottom:12px}.hist-card h3{margin:0;color:#f8fafc;font-size:16px}.hist-card p{margin:5px 0 0;color:#94a3b8;font-size:12px}.hist-mini-kpis{display:flex;gap:7px;flex-wrap:wrap;justify-content:flex-end}.hist-mini-kpis span{display:inline-flex;border:1px solid rgba(34,197,94,.22);background:rgba(34,197,94,.10);color:#bbf7d0;border-radius:999px;padding:5px 8px;font-size:10px;font-weight:950}.hist-table-wrap{overflow:auto;border-radius:14px;border:1px solid rgba(148,163,184,.12)}.hist-table{width:100%;border-collapse:collapse;min-width:780px;background:rgba(2,6,23,.22)}.hist-table th,.hist-table td{padding:10px 11px;border-bottom:1px solid rgba(148,163,184,.10);text-align:left;vertical-align:top;color:#cbd5e1;font-size:12px}.hist-table th{color:#94a3b8;text-transform:uppercase;font-size:10px;letter-spacing:.08em;background:rgba(2,6,23,.38)}.hist-table td small{color:#94a3b8;line-height:1.35}.hist-badge{display:inline-flex;border-radius:999px;padding:4px 8px;font-size:10px;font-weight:950;border:1px solid rgba(148,163,184,.22);color:#e5e7eb;background:rgba(148,163,184,.10)}.hist-badge.excesso{border-color:rgba(248,113,113,.28);background:rgba(127,29,29,.22);color:#fecaca}.hist-badge.multa{border-color:rgba(250,204,21,.28);background:rgba(113,63,18,.20);color:#fde68a}.hist-badge.manutencao{border-color:rgba(96,165,250,.28);background:rgba(30,64,175,.18);color:#bfdbfe}@media(max-width:980px){.hist-toolbar{grid-template-columns:1fr 1fr}.hist-kpi-grid{grid-template-columns:1fr 1fr}.hist-card-head{display:block}.hist-mini-kpis{justify-content:flex-start;margin-top:10px}}.upload-actions{display:grid;grid-template-columns:1fr;gap:10px;margin-top:12px}.print-status-box{border:1px solid rgba(148,163,184,.14);background:rgba(15,23,42,.52);border-radius:16px;padding:12px;margin-top:14px}.print-status-box strong{display:block;color:#f8fafc;font-size:12px;margin-bottom:5px}.print-status-box p{margin:0;color:#94a3b8;font-size:12px;line-height:1.45}@media(max-width:1100px){.speed-grid{grid-template-columns:1fr}.speed-row{grid-template-columns:1fr 1fr 42px}}@media(max-width:560px){.frotas-header{display:block}.speed-row{grid-template-columns:1fr}.speed-btn-danger{width:100%}.speed-step-title{display:block}.speed-step-pill{margin-top:8px}}
      </style>`;
  }

  function mapColaborador(item) {
    if (typeof item === 'string') return { nome: item };
    return {
      id: item.id || item.ID || null,
      nome: item.nome || item.Nome || item.funcionario || item.Funcionário || item.name || '',
      cpf: item.cpf || item.CPF || '',
      tipo: item.tipo || item.Tipo || '',
      empresa: item.empresa || item.Empresa || '',
      coordenacao: item.coordenacao || item.coordenação || item.Coordenação || '',
      supervisao: item.supervisao || item.Supervisão || item.supervisão || ''
    };
  }

  function getColaboradores(opts) {
    const raw = state.colaboradores.length
      ? state.colaboradores
      : (opts?.colaboradores || opts?.auth?.colaboradores || opts?.user?.colaboradores || []);
    if (!Array.isArray(raw)) return [];
    const seen = new Set();
    return raw
      .map(mapColaborador)
      .filter((item) => item.nome)
      .filter((item) => {
        const key = normalizeName(item.nome);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR'));
  }

  function colaboradorInfo(c) {
    return [c.tipo, c.supervisao, c.coordenacao].filter(Boolean).join(' · ');
  }

  function renderColaboradorStatus(root, opts = {}) {
    const status = root.querySelector('[data-colaborador-status]');
    if (!status) return;
    const colaboradores = getColaboradores(opts);
    status.textContent = colaboradores.length
      ? `${colaboradores.length} colaboradores carregados da base.`
      : 'Digite o nome manualmente ou aguarde o carregamento da base.';
  }

  function hideColaboradorDropdown(root) {
    const dropdown = root.querySelector('[data-colaborador-dropdown]');
    if (!dropdown) return;
    dropdown.hidden = true;
    dropdown.innerHTML = '';
  }

  function updateColaboradorDropdown(root, opts = {}) {
    const input = root.querySelector('[data-speed-name]');
    const dropdown = root.querySelector('[data-colaborador-dropdown]');
    if (!input || !dropdown) return;

    const term = normalizeName(input.value);
    if (!term) {
      hideColaboradorDropdown(root);
      return;
    }

    const matches = getColaboradores(opts)
      .filter((c) => normalizeName(c.nome).includes(term))
      .slice(0, 8);

    if (!matches.length) {
      dropdown.innerHTML = '<div class="colab-empty">Nenhum colaborador encontrado. Você pode continuar digitando manualmente.</div>';
      dropdown.hidden = false;
      return;
    }

    dropdown.innerHTML = matches.map((c, index) => {
      const info = colaboradorInfo(c);
      return `<button class="colab-option" type="button" data-colab-pick="${index}"><strong>${escapeHtml(c.nome)}</strong>${info ? `<span>${escapeHtml(info)}</span>` : ''}</button>`;
    }).join('');

    dropdown.hidden = false;

    dropdown.querySelectorAll('[data-colab-pick]').forEach((btn) => {
      btn.addEventListener('mousedown', (ev) => {
        ev.preventDefault();
        const selected = matches[Number(btn.getAttribute('data-colab-pick'))];
        if (!selected) return;
        input.value = selected.nome;
        hideColaboradorDropdown(root);
      });
    });
  }

  function bindColaboradorAutocomplete(root, opts = {}) {
    const input = root.querySelector('[data-speed-name]');
    if (!input || input.dataset.autocompleteBound === '1') return;
    input.dataset.autocompleteBound = '1';

    input.addEventListener('input', () => updateColaboradorDropdown(root, opts));
    input.addEventListener('focus', () => updateColaboradorDropdown(root, opts));
    input.addEventListener('keydown', (ev) => {
      const dropdown = root.querySelector('[data-colaborador-dropdown]');
      if (!dropdown || dropdown.hidden) return;
      if (ev.key === 'Escape') {
        hideColaboradorDropdown(root);
        return;
      }
      if (ev.key === 'Enter') {
        const first = dropdown.querySelector('.colab-option');
        if (first) {
          ev.preventDefault();
          first.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        }
      }
    });

    document.addEventListener('mousedown', (ev) => {
      const wrap = root.querySelector('[data-colaborador-autocomplete]');
      if (wrap && !wrap.contains(ev.target)) hideColaboradorDropdown(root);
    });
  }

  function isColaboradorAtivo(row) {
    if (!row) return false;
    if (row.ativo === false) return false;

    const situacao = String(row.situacao || row.Situação || '').trim().toLowerCase();
    if (['não ativo', 'nao ativo', 'inativo', 'desligado', 'desligada'].includes(situacao)) return false;

    return true;
  }

  function mergeColaboradores(rows) {
    const byKey = new Map();

    (Array.isArray(rows) ? rows : []).forEach((row) => {
      if (!row || !row.nome || !isColaboradorAtivo(row)) return;

      const cpf = String(row.cpf || '').replace(/\D/g, '');
      const key = cpf || normalizeName(row.nome);
      const current = byKey.get(key);
      const currentDate = String(current?.data_referencia || current?.updated_at || current?.created_at || '');
      const nextDate = String(row.data_referencia || row.updated_at || row.created_at || '');

      if (!current || nextDate >= currentDate) {
        byKey.set(key, row);
      }
    });

    return Array.from(byKey.values())
      .map(mapColaborador)
      .filter((row) => row.nome)
      .sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR'));
  }

  async function fetchAllRows(supabase, table, select, orderColumn) {
    const pageSize = 1000;
    let from = 0;
    const all = [];

    while (from < 20000) {
      let query = supabase
        .from(table)
        .select(select)
        .range(from, from + pageSize - 1);

      if (orderColumn) {
        query = query.order(orderColumn, { ascending: true });
      }

      const { data, error } = await query;
      if (error) throw error;

      const rows = Array.isArray(data) ? data : [];
      all.push(...rows);

      if (rows.length < pageSize) break;
      from += pageSize;
    }

    return all;
  }

  async function loadColaboradoresFromSupabase(root, opts = {}) {
    const fallback = getColaboradores(opts);
    if (fallback.length) {
      state.colaboradores = fallback;
      state.colaboradoresLoaded = true;
      renderColaboradorStatus(root, opts);
      updateColaboradorDropdown(root, opts);
      return;
    }

    const supabase = resolveSupabase(opts);
    if (!supabase || typeof supabase.from !== 'function') {
      renderColaboradorStatus(root, opts);
      updateColaboradorDropdown(root, opts);
      return;
    }

    const status = root.querySelector('[data-colaborador-status]');
    if (status) status.textContent = 'Carregando colaboradores da base...';

    try {
      const snapshotRows = await fetchAllRows(
        supabase,
        'colaborador_snapshot',
        'id,nome,cpf,situacao,tipo,empresa,coordenacao,supervisao,ativo,data_referencia,created_at',
        'nome'
      );

      const baseRows = await fetchAllRows(
        supabase,
        'colaboradores',
        'id,nome,cpf,situacao,tipo,empresa,coordenacao,supervisao,created_at,updated_at',
        'nome'
      ).catch((err) => {
        console.warn('[FROTAS] Tabela colaboradores não disponível para complemento:', err);
        return [];
      });

      const merged = mergeColaboradores([...snapshotRows, ...baseRows]);

      state.colaboradores = merged;
      state.colaboradoresLoaded = true;

      if (status && merged.length < 300) {
        status.textContent = `${merged.length} colaboradores carregados. Atenção: a base retornou poucos registros para este usuário/permissão.`;
      } else {
        renderColaboradorStatus(root, opts);
      }

      updateColaboradorDropdown(root, opts);
    } catch (err) {
      console.warn('[FROTAS] Não foi possível carregar colaboradores:', err);
      if (status) status.textContent = 'Não foi possível carregar a base agora. Você ainda pode digitar o nome manualmente.';
      renderColaboradorStatus(root, opts);
      updateColaboradorDropdown(root, opts);
    }
  }


  function getDriverFromExcesso(row) {
    return row?.patrimonio_funcionario || row?.motorista_planilha || '';
  }

  function groupImportedExcessos(rows) {
    const groups = new Map();
    (Array.isArray(rows) ? rows : []).forEach((row) => {
      const status = String(row.status_notificacao || '').toUpperCase();
      if (status === 'NOTIFICADO' || status === 'CANCELADO') return;
      const placa = onlyPlate(row.placa);
      if (!placa) return;
      const motorista = getDriverFromExcesso(row);
      const key = `${normalizeName(motorista) || 'SEM MOTORISTA'}|${placa}`;
      if (!groups.has(key)) {
        groups.set(key, {
          key,
          motorista,
          placa,
          coordenacao: row.coordenacao || '',
          supervisao: row.supervisao || '',
          status_cruzamento: row.status_cruzamento || '',
          registros: []
        });
      }
      groups.get(key).registros.push(row);
    });

    return Array.from(groups.values()).map((g) => {
      const ordered = (g.registros || []).sort((a, b) => String(a.data_evento || '').localeCompare(String(b.data_evento || '')) || String(a.hora_evento || '').localeCompare(String(b.hora_evento || '')));
      g.originalRegistros = ordered;
      g.totalRegistrosOriginais = ordered.length;
      g.registros = dedupeHighestSpeedByDate(ordered.map((r) => ({ ...r, data: r.data_evento, velocidade: r.velocidade })));
      g.maxVelocidade = Math.max(...g.registros.map((r) => Number(r.velocidade || 0)));
      g.periodoInicio = g.registros[0]?.data || g.registros[0]?.data_evento || '';
      g.periodoFim = g.registros[g.registros.length - 1]?.data || g.registros[g.registros.length - 1]?.data_evento || '';
      return g;
    }).sort((a, b) => String(a.motorista || a.placa).localeCompare(String(b.motorista || b.placa), 'pt-BR'));
  }

  function buildPrintDriverMap() {
    return groupImportedExcessos(state.importedExcessos).map((g) => {
      const driverName = isUnknownDriverName(g.motorista) ? '' : normalizeName(g.motorista || '');
      return {
        key: g.key || '',
        plate: onlyPlate(g.placa),
        driverName,
        driverFolderName: driverName ? sanitizeFolderName(driverName) : '',
        coordenacao: g.coordenacao || '',
        supervisao: g.supervisao || '',
        registros: (g.registros || []).map((r) => ({
          id: r.id,
          data: formatDateBR(r.data || r.data_evento),
          velocidade: parseSpeed(r.velocidade)
        })).filter((r) => r.id && r.data && r.velocidade)
      };
    }).filter((item) => item.plate);
  }

  function renderImportedExcessos(root) {
    const list = root.querySelector('[data-imported-excess-list]');
    const count = root.querySelector('[data-imported-excess-count]');
    if (!list) return;

    const groups = groupImportedExcessos(state.importedExcessos);
    const filter = state.activeImportedDateFilter;
    const filterSuffix = filter ? ` · exibindo ${filter.label || `${formatDateBR(filter.start)} a ${formatDateBR(filter.end)}`}` : '';
    if (count) count.textContent = groups.length ? `${groups.length} notificação(ões) pendente(s)${filterSuffix}` : `Nenhuma pendência carregada${filterSuffix}`;

    if (!state.importedExcessosLoaded) {
      list.innerHTML = '<div class="speed-import-empty">Carregando registros importados...</div>';
      return;
    }

    if (!groups.length) {
      const filter = state.activeImportedDateFilter;
      const extra = filter ? ` no período ${escapeHtml(filter.label || `${formatDateBR(filter.start)} a ${formatDateBR(filter.end)}`)}` : '';
      list.innerHTML = `<div class="speed-import-empty">Nenhum excesso de velocidade pendente encontrado${extra}. Clique em Sincronizar para buscar novos registros da BFleet.</div>`;
      return;
    }

    const availableDates = Array.from(new Set((state.importedExcessos || [])
      .filter((row) => ['PENDENTE', 'GERADA'].includes(String(row.status_notificacao || '').toUpperCase()))
      .map((row) => normalizeDateForMatch(row.data_evento))
      .filter(Boolean)))
      .sort()
      .reverse();

    const defaultEndDate = availableDates[0] || '';
    const bulkBar = `<div class="speed-import-bulk">
      <div class="speed-field"><label>Data inicial para OK</label><input class="speed-input" type="date" list="speed-import-pending-dates" data-ok-imported-date-start value="${escapeHtml(defaultEndDate)}"></div>
      <div class="speed-field"><label>Data final para OK</label><input class="speed-input" type="date" list="speed-import-pending-dates" data-ok-imported-date-end value="${escapeHtml(defaultEndDate)}"></div>
      <datalist id="speed-import-pending-dates">${availableDates.map((d) => `<option value="${escapeHtml(d)}">${escapeHtml(formatDateBR(d))}</option>`).join('')}</datalist>
      <button class="speed-btn speed-btn-soft speed-btn-compact" type="button" data-ok-imported-date-btn>OK por período</button>
    </div>`;

    const filterNote = filter ? `<div class="speed-import-filter-note">Mostrando somente registros do período <strong>${escapeHtml(filter.label || `${formatDateBR(filter.start)} a ${formatDateBR(filter.end)}`)}</strong>. Ao sincronizar outro período, esta lista é substituída automaticamente.</div>` : '';
    list.innerHTML = filterNote + bulkBar + groups.map((g, index) => {
      const nome = g.motorista ? normalizeName(g.motorista) : 'Motorista não identificado';
      const meta = [g.supervisao, g.coordenacao].filter(Boolean).join(' · ');
      const periodo = g.periodoInicio === g.periodoFim ? formatDateBR(g.periodoInicio) : `${formatDateBR(g.periodoInicio)} a ${formatDateBR(g.periodoFim)}`;
      const generated = state.generatedImportedGroupKeys.has(g.key) || (g.registros || []).some((r) => String(r.status_notificacao || '').toUpperCase() === 'GERADA');
      const selected = state.selectedImportedGroupKey === g.key;
      const badge = generated ? 'Mensagem copiada' : (g.status_cruzamento === 'MOTORISTA_IDENTIFICADO' ? 'Identificado pelo patrimônio' : 'Conferir motorista');
      return `<div class="speed-import-item ${selected ? 'selected' : ''} ${generated ? 'generated' : ''}" role="button" tabindex="0" data-imported-excess-index="${index}">
        <strong>${escapeHtml(nome)} · ${escapeHtml(g.placa)}</strong>
        <span>${escapeHtml(meta || 'Sem supervisão/coordenação')} · ${g.registros.length} data(s) considerada(s) · ${g.totalRegistrosOriginais || g.registros.length} registro(s) importado(s) · ${escapeHtml(periodo)} · maior ${escapeHtml(g.maxVelocidade)} km/h</span>
        <div class="speed-import-footer">
          <em class="speed-import-badge">${escapeHtml(badge)}</em>
          <button class="speed-import-ok" type="button" data-ok-imported-group="${index}" title="Marcar esta pendência como OK e remover da tela">OK</button>
        </div>
      </div>`;
    }).join('');

    list.querySelector('[data-ok-imported-date-btn]')?.addEventListener('click', () => markImportedRowsOkByDate(root));

    list.querySelectorAll('[data-ok-imported-group]').forEach((btn) => {
      btn.addEventListener('click', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        const group = groups[Number(btn.getAttribute('data-ok-imported-group'))];
        markImportedRowsOk(root, group?.originalRegistros || group?.registros || [], `OK manual aplicado por pendência (${group?.motorista || group?.placa || 'sem identificação'}).`, currentRenderOpts);
      });
    });

    list.querySelectorAll('[data-imported-excess-index]').forEach((item) => {
      const open = () => {
        const group = groups[Number(item.getAttribute('data-imported-excess-index'))];
        applyImportedExcessoGroup(root, group);
      };
      item.addEventListener('click', open);
      item.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter' || ev.key === ' ') {
          ev.preventDefault();
          open();
        }
      });
    });
  }

  function getOpenImportedRows() {
    return (state.importedExcessos || []).filter((row) => ['PENDENTE', 'GERADA'].includes(String(row.status_notificacao || '').toUpperCase()));
  }

  async function markImportedRowsOk(root, rows, reason = 'OK manual aplicado no painel.', opts = {}) {
    const supabase = resolveSupabase(opts);
    const ids = (Array.isArray(rows) ? rows : []).map((row) => row?.id).filter(Boolean);
    if (!ids.length) {
      toast('Nenhuma pendência encontrada para marcar como OK.', 'error');
      return;
    }
    if (!supabase || typeof supabase.from !== 'function') {
      toast('Supabase não encontrado para salvar o OK.', 'error');
      return;
    }

    const nowIso = new Date().toISOString();
    const userId = getCurrentUserId();
    const userName = getCurrentUserName();
    const payload = {
      status_notificacao: 'NOTIFICADO',
      notificado_em: nowIso,
      observacoes: reason
    };
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(userId || ''))) payload.notificado_por = userId;
    if (userName) payload.notificado_por_nome = userName;

    try {
      const { error } = await supabase
        .from('frotas_excesso_velocidade')
        .update(payload)
        .in('id', ids);
      if (error) throw error;

      const idSet = new Set(ids.map(String));
      state.importedExcessos.forEach((row) => {
        if (idSet.has(String(row.id))) row.status_notificacao = 'NOTIFICADO';
      });
      renderImportedExcessos(root);
      toast(`${ids.length} registro(s) marcado(s) como OK e removido(s) das pendências.`);
    } catch (err) {
      console.warn('[FROTAS] Falha ao marcar pendências como OK:', err);
      toast('Não foi possível marcar como OK no Supabase.', 'error');
    }
  }

  function markImportedRowsOkByDate(root) {
    const startRaw = root.querySelector('[data-ok-imported-date-start]')?.value || '';
    const endRaw = root.querySelector('[data-ok-imported-date-end]')?.value || '';
    const startDate = normalizeDateForMatch(startRaw || endRaw);
    const endDate = normalizeDateForMatch(endRaw || startRaw);
    if (!startDate || !endDate) {
      toast('Selecione a data inicial e final para aplicar OK em lote.', 'error');
      return;
    }
    const minDate = startDate <= endDate ? startDate : endDate;
    const maxDate = startDate <= endDate ? endDate : startDate;
    const rows = getOpenImportedRows().filter((row) => {
      const rowDate = normalizeDateForMatch(row.data_evento);
      return rowDate && rowDate >= minDate && rowDate <= maxDate;
    });
    const label = minDate === maxDate ? formatDateBR(minDate) : `${formatDateBR(minDate)} a ${formatDateBR(maxDate)}`;
    markImportedRowsOk(root, rows, `OK manual aplicado em lote por período (${label}).`, currentRenderOpts);
  }


  function applyImportedExcessoGroup(root, group) {
    if (!group) return;
    state.selectedImportedGroupKey = group.key || '';
    const nomeInput = root.querySelector('[data-speed-name]');
    const placaInput = root.querySelector('[data-speed-plate]');
    if (nomeInput) nomeInput.value = group.motorista || '';
    if (placaInput) placaInput.value = onlyPlate(group.placa);

    const mapped = (group.registros || [])
      .map((r) => ({ data: toInputDate(r.data || r.data_evento), velocidade: parseSpeed(r.velocidade) }))
      .filter((r) => r.data && r.velocidade);
    state.records = mapped.length ? mapped : [{ data: '', velocidade: '' }];
    renderRecords(root);
    renderImportedExcessos(root);
    toast('Registros importados aplicados na notificação. Revise e clique em Gerar ✉️.');
  }


  async function callEdgeFunction(opts, name, body) {
    const supabase = resolveSupabase(opts);
    if (!supabase?.functions?.invoke) {
      throw new Error('Supabase Functions não encontrado nesta página.');
    }
    const { data, error } = await supabase.functions.invoke(name, { body });
    if (error) {
      const msg = error.context?.error || error.context?.message || error.message || `Falha na function ${name}`;
      throw new Error(msg);
    }
    if (data?.error) throw new Error(data.error);
    return data || {};
  }

  function readSyncReportPeriod(root) {
    const start = root.querySelector('[data-sync-report-start]')?.value || '';
    const end = root.querySelector('[data-sync-report-end]')?.value || '';
    return { start, end };
  }

  async function sincronizarRelatorioBFleet(root, opts = {}, mode = 'yesterday') {
    const isPeriod = mode === 'period';
    const btn = root.querySelector(isPeriod ? '[data-sync-bfleet-period]' : '[data-sync-bfleet-excessos]');
    const originalText = btn?.textContent || (isPeriod ? 'Sincronizar período' : 'Sincronizar ontem');
    try {
      if (btn) {
        btn.disabled = true;
        btn.textContent = 'Sincronizando...';
      }

      const body = { mode: 'sync', forceRefreshToken: true, preferWebReport: true, rangeTimeVal: 'yesterday' };
      let label = 'yesterday';
      let filterStart = yesterdayInputDate();
      let filterEnd = filterStart;

      if (isPeriod) {
        const { start, end } = readSyncReportPeriod(root);
        if (!start || !end) {
          toast('Informe a data inicial e a data final do relatório para sincronizar o período.', 'error');
          return;
        }
        if (start > end) {
          toast('A data inicial do relatório não pode ser maior que a data final.', 'error');
          return;
        }
        body.dataInicial = start;
        body.dataFinal = end;
        body.startDate = start;
        body.endDate = end;
        delete body.rangeTimeVal;
        filterStart = start;
        filterEnd = end;
        label = `${formatDateBR(start)} a ${formatDateBR(end)}`;
      }

      toast(`Sincronizando relatório de excesso de velocidade da BFleet (${label})...`);
      const res = await callEdgeFunction(opts, BFLEET_EXCESSO_FUNCTION, body);
      const inserted = Number(res?.inserted || res?.inseridos || res?.created || res?.novos || 0);
      const updated = Number(res?.updated || res?.atualizados || 0);
      const total = Number(res?.total || res?.total_registros || res?.linhas || res?.linhas_lidas_api || inserted + updated || 0);
      const errors = Number(res?.errors || res?.erros || 0);
      toast(`BFleet sincronizado: ${total || 'N'} registro(s) lido(s), ${inserted} novo(s), ${updated} atualizado(s)${errors ? ` · ${errors} erro(s)` : ''}.`, errors ? 'error' : 'success');
      setImportedDateFilter(filterStart, filterEnd, label === 'yesterday' ? `ontem (${formatDateBR(filterStart)})` : label);
      await fetchImportedExcessos(root, opts);
    } catch (err) {
      console.error('[FROTAS] Sync BFleet excesso:', err);
      toast(err.message || 'Falha ao sincronizar relatório da BFleet.', 'error');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = originalText;
      }
    }
  }

  async function fetchImportedExcessos(root, opts = {}) {
    const supabase = resolveSupabase(opts);
    if (!supabase || typeof supabase.from !== 'function') {
      state.importedExcessosLoaded = true;
      renderImportedExcessos(root);
      return;
    }

    try {
      state.importedExcessosLoaded = false;
      renderImportedExcessos(root);
      let query = supabase
        .from('frotas_excesso_velocidade')
        .select('id,data_evento,hora_evento,placa,velocidade,endereco,motorista_planilha,patrimonio_funcionario,patrimonio_codigo,coordenacao,supervisao,status_cruzamento,status_notificacao,created_at')
        .in('status_notificacao', ['PENDENTE', 'GERADA']);

      const filter = state.activeImportedDateFilter;
      if (filter?.start) query = query.gte('data_evento', filter.start);
      if (filter?.end) query = query.lte('data_evento', filter.end);

      const { data, error } = await query
        .order('data_evento', { ascending: false })
        .limit(1000);
      if (error) throw error;
      state.importedExcessos = Array.isArray(data) ? data : [];
    } catch (err) {
      console.warn('[FROTAS] Não foi possível carregar excessos importados:', err);
      state.importedExcessos = [];
    } finally {
      state.importedExcessosLoaded = true;
      renderImportedExcessos(root);
    }
  }


  async function markSelectedImportedGroupAsGenerated(root, opts, message) {
    const key = state.selectedImportedGroupKey;
    if (!key) return;
    rememberGeneratedGroup(key);

    const selectedRows = state.importedExcessos.filter((row) => {
      const placa = onlyPlate(row.placa);
      const motorista = getDriverFromExcesso(row);
      const rowKey = `${normalizeName(motorista) || 'SEM MOTORISTA'}|${placa}`;
      return rowKey === key;
    });

    selectedRows.forEach((row) => {
      row.status_notificacao = 'GERADA';
      row.mensagem_gerada = message;
    });
    renderImportedExcessos(root);

    const ids = selectedRows.map((row) => row.id).filter(Boolean);
    const supabase = resolveSupabase(opts);
    if (!ids.length || !supabase || typeof supabase.from !== 'function') return;

    try {
      const payload = {
        status_notificacao: 'GERADA',
        mensagem_gerada: message,
        notificado_em: new Date().toISOString()
      };
      const userId = getCurrentUserId();
      const userName = getCurrentUserName();
      if (userId) payload.notificado_por = userId;
      if (userName) payload.notificado_por_nome = userName;

      const { error } = await supabase
        .from('frotas_excesso_velocidade')
        .update(payload)
        .in('id', ids);
      if (error) throw error;
    } catch (err) {
      console.warn('[FROTAS] Não foi possível atualizar status da notificação importada:', err);
    }
  }

  function buildMessage({ nome, placa, registros, cidadeData }) {
    const nomeFinal = normalizeName(nome);
    const placaFinal = onlyPlate(placa);
    const registrosValidos = dedupeHighestSpeedByDate(registros.map((r) => ({ data: formatDateBR(r.data), velocidade: parseSpeed(r.velocidade) })).filter((r) => r.data && r.velocidade));
    const linhas = registrosValidos.map((r) => `* ${formatDateBR(r.data)} – ${r.velocidade} km/h`).join('\n');
    return `${nomeFinal},\n\nConstatamos, por meio do sistema de rastreamento da frota, que V.S. excedeu de forma recorrente o limite máximo de velocidade permitido (120 km/h), conduzindo o veículo de placa ${placaFinal}, conforme registros abaixo:\n\n${linhas}\n\nOs registros demonstram reincidência contínua na prática de excesso de velocidade, ainda que com variações moderadas acima do limite permitido, evidenciando a necessidade de maior atenção e adequação imediata por parte do condutor.\n\nRessaltamos que o excesso de velocidade configura descumprimento das normas de trânsito e das diretrizes internas da empresa, podendo gerar riscos à segurança do próprio condutor, de terceiros e ao patrimônio da organização.\n\nDiante disso, reforçamos que é indispensável o cumprimento rigoroso dos limites estabelecidos e das políticas internas de condução segura.\n\nSolicitamos atenção redobrada quanto à condução do veículo, evitando novos registros e possíveis medidas administrativas futuras.\n\n${cidadeData}.`;
  }

  function validateForm(root) {
    const nomeRaw = root.querySelector('[data-speed-name]')?.value || '';
    const nome = isUnknownDriverName(nomeRaw) ? '' : nomeRaw;
    const placa = root.querySelector('[data-speed-plate]')?.value || '';
    const cidadeData = root.querySelector('[data-speed-city-date]')?.value || '';
    const registros = Array.from(root.querySelectorAll('[data-speed-record]')).map((row) => ({ data: row.querySelector('[data-speed-date]')?.value || '', velocidade: row.querySelector('[data-speed-value]')?.value || '' }));
    if (!nome.trim()) return { ok: false, message: 'Selecione ou informe o colaborador.' };
    if (!onlyPlate(placa) || onlyPlate(placa).length < 7) return { ok: false, message: 'Preencha uma placa válida com 7 caracteres.' };
    if (!cidadeData.trim()) return { ok: false, message: 'Preencha a cidade e data do documento.' };
    const validRecords = registros.filter((r) => r.data && parseSpeed(r.velocidade));
    if (!validRecords.length) return { ok: false, message: 'Informe pelo menos uma data e velocidade.' };
    return { ok: true, payload: { nome, placa, cidadeData, registros: validRecords } };
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

  function syncRecordsFromDom(root) {
    state.records = Array.from(root.querySelectorAll('[data-speed-record]')).map((row) => ({ data: row.querySelector('[data-speed-date]')?.value || '', velocidade: row.querySelector('[data-speed-value]')?.value || '' }));
    if (!state.records.length) state.records = [{ data: '', velocidade: '' }];
  }

  function renderRecords(root) {
    const list = root.querySelector('[data-speed-records]');
    if (!list) return;
    list.innerHTML = state.records.map((record, index) => `
      <div class="speed-row" data-speed-record data-index="${index}">
        <div class="speed-field"><label>Data</label><input class="speed-input" type="date" data-speed-date value="${escapeHtml(record.data)}"></div>
        <div class="speed-field"><label>Velocidade</label><input class="speed-input" type="number" min="1" step="1" placeholder="123" data-speed-value value="${escapeHtml(record.velocidade)}"></div>
        <button class="speed-btn speed-btn-danger" type="button" title="Remover registro" data-remove-record="${index}">×</button>
      </div>`).join('');
    bindRecordEvents(root);
  }

  function bindRecordEvents(root) {
    root.querySelectorAll('[data-speed-date], [data-speed-value]').forEach((input) => input.addEventListener('input', () => syncRecordsFromDom(root)));
    root.querySelectorAll('[data-remove-record]').forEach((btn) => btn.addEventListener('click', () => {
      syncRecordsFromDom(root);
      state.records.splice(Number(btn.getAttribute('data-remove-record')), 1);
      if (!state.records.length) state.records.push({ data: '', velocidade: '' });
      renderRecords(root);
    }));
  }

  function renderUploadLists(root) {
    const selected = root.querySelector('[data-upload-list]');
    if (selected) {
      selected.innerHTML = state.uploadedFiles.length ? state.uploadedFiles.map((f, index) => `<div class="upload-item"><span><strong>${escapeHtml(f.name || f.__displayName || 'print.png')}</strong><br>${Math.round(f.size / 1024)} KB · ${escapeHtml(f.__source || 'selecionado')}</span><button class="speed-btn speed-btn-danger" type="button" data-remove-upload="${index}" title="Remover print">×</button></div>`).join('') : '<div class="speed-import-empty">Nenhum print adicionado ainda.</div>';
      selected.querySelectorAll('[data-remove-upload]').forEach((btn) => btn.addEventListener('click', () => {
        state.uploadedFiles.splice(Number(btn.getAttribute('data-remove-upload')), 1);
        renderUploadLists(root);
      }));
    }
    const saved = root.querySelector('[data-saved-list]');
    if (saved) {
      saved.innerHTML = state.savedPrints.length ? state.savedPrints.map((f) => {
        const driverName = getPossibleFileDriverName(f);
        const folderName = driverName || f.driverFolderName || '';
        const extra = driverName && isUnknownDriverName(f.driverFolderName) ? '<br><small>Motorista identificado pelo OCR do print.</small>' : '';
        return `<div class="saved-item"><strong>${escapeHtml(f.fileName || 'Print salvo')}</strong><br>Pasta: ${escapeHtml(folderName)}${extra}${f.fileUrl ? `<br><a href="${escapeHtml(f.fileUrl)}" target="_blank" rel="noopener">Abrir no Drive</a>` : ''}</div>`;
      }).join('') : '';
    }
  }

  function applyOcrResult(root, result) {
    const data = result?.data || result || {};
    const placa = onlyPlate(data.placa || data.vehiclePlate || '');
    if (placa) {
      const plateInput = root.querySelector('[data-speed-plate]');
      if (plateInput && !plateInput.value) plateInput.value = placa;
    }

    const registros = Array.isArray(data.registros) ? data.registros : [];
    const parsedRecords = registros.map((r) => ({ data: toInputDate(r.data || r.date), velocidade: parseSpeed(r.velocidade || r.speed) })).filter((r) => r.data && r.velocidade);
    if (parsedRecords.length) {
      syncRecordsFromDom(root);
      const existing = state.records.filter((r) => r.data && r.velocidade);
      state.records = dedupeHighestSpeedByDate([...existing, ...parsedRecords]).map((r) => ({ data: toInputDate(r.data) || r.data, velocidade: r.velocidade }));
      renderRecords(root);
    }

    if (Array.isArray(data.files)) {
      const normalizedFiles = data.files.map((file) => normalizeSavedPrintFileResult(file));
      state.savedPrints = [...normalizedFiles, ...state.savedPrints];
      renderUploadLists(root);
    }
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

  function setImportedDateFilter(start, end, label = '') {
    const s = normalizeDateForMatch(start);
    const e = normalizeDateForMatch(end || start);
    if (!s || !e) {
      state.activeImportedDateFilter = null;
      return;
    }
    state.activeImportedDateFilter = {
      start: s <= e ? s : e,
      end: s <= e ? e : s,
      label: label || (s === e ? formatDateBR(s) : `${formatDateBR(s)} a ${formatDateBR(e)}`)
    };
  }

  function clearImportedDateFilter() {
    state.activeImportedDateFilter = null;
  }

  function ocrRecordMatchesRow(ocrRecord, row) {
    if (!ocrRecord || !row) return false;
    const ocrDate = normalizeDateForMatch(ocrRecord.data || ocrRecord.date);
    const rowDate = normalizeDateForMatch(row.data_evento);
    const ocrSpeed = parseSpeed(ocrRecord.velocidade || ocrRecord.speed);
    const rowSpeed = parseSpeed(row.velocidade);
    return Boolean(ocrDate && rowDate && ocrDate === rowDate && ocrSpeed && rowSpeed && ocrSpeed === rowSpeed);
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

  function getOcrTextFromFileResult(file) {
    return [
      file?.ocrText,
      file?.ocr_text,
      file?.text,
      file?.texto,
      file?.rawText,
      file?.raw_text,
      file?.extractedText,
      file?.extracted_text,
      file?.messageText,
      file?.mensagem,
      file?.content
    ].filter(Boolean).join('\n');
  }

  function cleanPossibleDriverName(value) {
    let name = normalizeName(value)
      .replace(/\b(BOM DIA|BOA TARDE|BOA NOITE|ENCAMINHADA|LEIA MAIS|LER MAIS|ARQUIVO|PASTA)\b/g, ' ')
      .replace(/\b(CONSTATAMOS|COMUNICAMOS|IDENTIFICAMOS|PREZADO|PREZADA|COLABORADOR|MOTORISTA)\b.*$/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (isUnknownDriverName(name)) return '';
    const parts = name.split(' ').filter(Boolean);
    if (parts.length < 2) return '';
    if (name.length < 6 || name.length > 80) return '';
    return name;
  }

  function extractDriverNameFromOcrText(text) {
    const raw = String(text || '').replace(/\r/g, '\n');
    if (!raw.trim()) return '';

    const directPatterns = [
      /(?:^|\n)\s*([A-ZÀ-Ú][A-ZÀ-Ú' .-]{5,80}?)\s*,\s*(?:CONSTATAMOS|COMUNICAMOS|IDENTIFICAMOS|INFORMAMOS)\b/i,
      /(?:^|\n)\s*(?:PREZADO|PREZADA|COLABORADOR|MOTORISTA)\s*[:,-]?\s*([A-ZÀ-Ú][A-ZÀ-Ú' .-]{5,80}?)\s*(?:,|\n)/i,
      /(?:NOME|CONDUTOR|MOTORISTA)\s*[:,-]\s*([A-ZÀ-Ú][A-ZÀ-Ú' .-]{5,80}?)(?:\n|,|\s{2,}|$)/i
    ];
    for (const pattern of directPatterns) {
      const match = raw.match(pattern);
      const cleaned = cleanPossibleDriverName(match?.[1] || '');
      if (cleaned) return cleaned;
    }

    const lines = raw.split(/\n+/).map((line) => cleanPossibleDriverName(line)).filter(Boolean);
    const idx = raw.toUpperCase().search(/CONSTATAMOS|COMUNICAMOS|IDENTIFICAMOS|INFORMAMOS/);
    if (idx >= 0) {
      const before = raw.slice(0, idx).split(/\n+/).map((line) => cleanPossibleDriverName(line)).filter(Boolean);
      if (before.length) return before[before.length - 1];
    }
    return lines[0] || '';
  }

  function getPossibleFileDriverName(file) {
    const direct = cleanPossibleDriverName([
      file?.driverName,
      file?.driver_name,
      file?.driverFolderName,
      file?.driver_folder_name,
      file?.motorista,
      file?.nomeMotorista,
      file?.nome_motorista,
      file?.condutor,
      file?.folderName,
      file?.folder_name
    ].find(Boolean) || '');
    if (direct) return direct;

    const fromOcr = extractDriverNameFromOcrText(getOcrTextFromFileResult(file));
    if (fromOcr) return fromOcr;

    const fromFileName = String(file?.fileName || file?.name || '')
      .replace(/\.[a-z0-9]{2,5}$/i, '')
      .replace(/\d+\s*[º°]?\s*NOTIFICA(?:C|Ç)[AÃ]O\s+DE\s+VELOCIDADE\s+\d{4}/i, '')
      .replace(/MOTORISTA\s+NAO\s+IDENTIFICADO|MOTORISTA\s+NÃO\s+IDENTIFICADO/i, '');
    return cleanPossibleDriverName(fromFileName);
  }

  function normalizeSavedPrintFileResult(file) {
    const driverName = getPossibleFileDriverName(file);
    if (!driverName) return file;
    return {
      ...file,
      driverName,
      driverFolderName: isUnknownDriverName(file?.driverFolderName) ? driverName : (file?.driverFolderName || driverName)
    };
  }

  function extractOcrRecordsFromText(text) {
    const normalized = normalizeTextForOcrMatch(text);
    if (!normalized) return [];

    const records = [];
    const currentYear = String(new Date().getFullYear());
    const pattern = /(\d{1,2}[\/.-]\d{1,2}(?:[\/.-]\d{2,4})?)[\s\S]{0,90}?(\d{2,3})\s*(?:KM\/?H|KMH|KM|K\/H|KPH)/g;
    let match;
    while ((match = pattern.exec(normalized))) {
      let date = String(match[1] || '').replace(/[.-]/g, '/');
      const parts = date.split('/');
      if (parts.length === 2) date = `${parts[0].padStart(2, '0')}/${parts[1].padStart(2, '0')}/${currentYear}`;
      if (parts.length === 3) {
        const year = parts[2].length === 2 ? `20${parts[2]}` : parts[2];
        date = `${parts[0].padStart(2, '0')}/${parts[1].padStart(2, '0')}/${year}`;
      }
      records.push({ data: date, velocidade: Number(match[2]) });
    }
    return records;
  }

  function getFileMatchedIds(file) {
    const candidates = [
      file?.matchedIds,
      file?.matched_ids,
      file?.recordIds,
      file?.record_ids,
      file?.notificacaoIds,
      file?.notificationIds,
      file?.archivedIds
    ];
    const out = [];
    candidates.forEach((value) => {
      if (Array.isArray(value)) out.push(...value);
      else if (value) out.push(...String(value).split(/[;,\s]+/));
    });
    return out.map((id) => String(id || '').trim()).filter(Boolean);
  }

  function getPossibleFilePlate(file) {
    const text = normalizeTextForOcrMatch(getOcrTextFromFileResult(file));
    const direct = onlyPlate(file?.plate || file?.placa || file?.vehiclePlate || file?.vehicle_plate || '');
    if (direct) return direct;
    const match = text.match(/\b([A-Z]{3}\s*[0-9][A-Z0-9]\s*[0-9]{2})\b/);
    return match ? onlyPlate(match[1]) : '';
  }

  function getGroupKeyFromRow(row) {
    const placa = onlyPlate(row?.placa || '');
    const motorista = getDriverFromExcesso(row);
    return `${normalizeName(motorista) || 'SEM MOTORISTA'}|${placa}`;
  }

  function rowBelongsToGeneratedGroup(row) {
    const status = String(row?.status_notificacao || '').toUpperCase();
    return status === 'GERADA' || state.generatedImportedGroupKeys.has(getGroupKeyFromRow(row));
  }

  function fileMatchesRowByVehicleOrDriver(file, row) {
    const filePlate = getPossibleFilePlate(file);
    const fileDriver = normalizeDriverNameForMatch(getPossibleFileDriverName(file));
    const rowPlate = onlyPlate(row?.placa || '');
    const rowDriver = normalizeDriverNameForMatch(getDriverFromExcesso(row));
    if (filePlate && rowPlate && filePlate === rowPlate) return true;
    if (fileDriver && rowDriver && !isUnknownDriverName(rowDriver) && (fileDriver === rowDriver || fileDriver.includes(rowDriver) || rowDriver.includes(fileDriver))) return true;
    return false;
  }

  async function archiveMatchedImportedRowsFromOcr(root, files) {
    const supabase = window.supabase;
    const savedFiles = Array.isArray(files) ? files : [];
    if (!savedFiles.length || !supabase || typeof supabase.from !== 'function') return;

    const matched = new Map();
    const openRows = (state.importedExcessos || []).filter((row) => {
      const status = String(row.status_notificacao || '').toUpperCase();
      return status === 'PENDENTE' || status === 'GERADA';
    });

    const addMatch = (row, file, reason) => {
      if (!row?.id) return;
      matched.set(row.id, {
        id: row.id,
        fileName: file?.fileName || file?.name || '',
        fileUrl: file?.fileUrl || file?.url || '',
        driverName: getPossibleFileDriverName(file) || file?.driverName || file?.driverFolderName || getDriverFromExcesso(row) || '',
        plate: getPossibleFilePlate(file) || onlyPlate(row.placa || ''),
        reason
      });
    };

    savedFiles.forEach((file) => {
      const explicitIds = new Set(getFileMatchedIds(file));
      if (explicitIds.size) {
        openRows.forEach((row) => {
          if (explicitIds.has(String(row.id))) addMatch(row, file, 'ids_retornados_pelo_ocr');
        });
      }

      const rawText = getOcrTextFromFileResult(file);
      const structuredRecords = Array.isArray(file?.registros || file?.extractedRegistros || file?.records)
        ? (file.registros || file.extractedRegistros || file.records)
        : [];
      const ocrRecords = [
        ...structuredRecords,
        ...extractOcrRecordsFromText(rawText)
      ];

      openRows.forEach((row) => {
        if (!fileMatchesRowByVehicleOrDriver(file, row)) return;

        const hasSameRecord = ocrRecords.some((ocr) => ocrRecordMatchesRow(ocr, row));
        if (hasSameRecord) {
          addMatch(row, file, 'placa_data_velocidade');
          return;
        }

        // Fallback seguro para o fluxo real do painel:
        // se a mensagem já foi GERADA/COPIADA para aquele motorista/placa e o print enviado
        // foi identificado pelo OCR/Drive como daquele mesmo veículo ou motorista, arquiva a pendência.
        // Isso evita que notificações já enviadas fiquem acumuladas quando o OCR não devolve data/velocidade estruturada.
        if (rowBelongsToGeneratedGroup(row)) {
          addMatch(row, file, 'mensagem_gerada_print_identificado');
        }
      });
    });

    const matches = Array.from(matched.values());
    if (!matches.length) {
      toast('Prints salvos. Nenhuma pendência foi arquivada: o OCR não identificou placa/motorista correspondente a uma mensagem GERADA.', 'error');
      return;
    }

    const ids = matches.map((m) => m.id);
    const nowIso = new Date().toISOString();
    const userId = getCurrentUserId();
    const userName = getCurrentUserName();
    const firstFile = matches[0] || {};
    const payload = {
      status_notificacao: 'NOTIFICADO',
      notificado_em: nowIso,
      observacoes: `Arquivado automaticamente após envio do print. Motivo: ${firstFile.reason || 'ocr'}. Arquivo: ${firstFile.fileName || firstFile.fileUrl || 'print salvo no Drive'}`
    };
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(userId || ''))) payload.notificado_por = userId;
    if (userName) payload.notificado_por_nome = userName;

    try {
      const { error } = await supabase
        .from('frotas_excesso_velocidade')
        .update(payload)
        .in('id', ids);
      if (error) throw error;

      state.importedExcessos.forEach((row) => {
        if (matched.has(row.id)) row.status_notificacao = 'NOTIFICADO';
      });
      renderImportedExcessos(root);
      toast(`${ids.length} registro(s) arquivado(s): print enviado e notificação identificada.`);
    } catch (err) {
      console.warn('[FROTAS] Falha ao arquivar registros após envio do print:', err);
      toast('Prints salvos, mas não foi possível arquivar os registros no Supabase.', 'error');
    }
  }

  function toInputDate(value) {
    const br = formatDateBR(value);
    const m = br.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    return m ? `${m[3]}-${m[2]}-${m[1]}` : '';
  }

  async function uploadPrints(root) {
    const urlInput = root.querySelector('[data-gas-url]');
    const gasUrl = String(urlInput?.value || state.gasUrl || DEFAULT_GAS_URL).trim();
    const nomeRaw = root.querySelector('[data-speed-name]')?.value || '';
    const nome = isUnknownDriverName(nomeRaw) ? '' : nomeRaw;
    const placa = root.querySelector('[data-speed-plate]')?.value || '';
    const dataNotificacao = root.querySelector('[data-notification-date]')?.value || todayBRShort();
    const driverMap = buildPrintDriverMap();

    if (!gasUrl) return toast('Informe a URL do Web App do Apps Script.', 'error');
    if (!state.uploadedFiles.length) return toast('Selecione ao menos um print para enviar.', 'error');

    localStorage.setItem(GAS_URL_KEY, gasUrl);
    state.gasUrl = gasUrl;

    const btn = root.querySelector('[data-upload-prints]');
    if (btn) { btn.disabled = true; btn.textContent = 'Enviando prints em lote...'; }

    try {
      const files = [];
      for (const file of state.uploadedFiles) {
        files.push({ name: file.name || file.__displayName || `print-${Date.now()}.png`, mimeType: file.type || 'image/png', base64: await fileToBase64(file) });
      }

      const resp = await fetch(gasUrl, {
        method: 'POST',
        mode: 'cors',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'upload_excesso_velocidade',
          parentFolderId: PASTA_MAE_DRIVE_ID,
          driverName: nome ? normalizeName(nome) : '',
          driverFolderName: nome ? sanitizeFolderName(nome) : '',
          plate: onlyPlate(placa),
          notificationDate: formatDateBR(dataNotificacao),
          filePrefixDate: brDateToFilePrefix(dataNotificacao),
          fileNamingPattern: 'ordinal_notification_year_driver',
          driverMap,
          files
        })
      });
      const json = await resp.json();
      if (!json.ok) throw new Error(json.message || 'Falha ao processar prints.');
      applyOcrResult(root, json);
      await archiveMatchedImportedRowsFromOcr(root, (json?.data?.files || []).map((file) => normalizeSavedPrintFileResult(file)));
      state.uploadedFiles = [];
      const input = root.querySelector('[data-print-files]');
      if (input) input.value = '';
      renderUploadLists(root);
      toast('Prints salvos no Drive. Cada print foi direcionado pela placa/OCR sem depender da sugestão selecionada.');
    } catch (err) {
      console.error('[FROTAS] Upload/OCR:', err);
      toast(err.message || 'Erro ao enviar prints.', 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Enviar prints e arquivar pendências'; }
    }
  }



  const HISTORICO_TABLES = {
    excessos: 'frotas_excesso_velocidade',
    multas: 'frotas_multas',
    manutencoes: ['frotas_manutencoes', 'frotas_manutencao', 'manutencoes_frotas', 'frotas_ordens_manutencao']
  };

  const historicoState = {
    loaded: false,
    loading: false,
    error: '',
    rows: [],
    busca: '',
    tipo: 'todos',
    start: '',
    end: ''
  };

  function firstValue(obj, keys = []) {
    for (const key of keys) {
      const value = obj?.[key];
      if (value !== undefined && value !== null && String(value).trim() !== '') return value;
    }
    return '';
  }

  function formatMoneyBR(value) {
    const n = Number(String(value ?? '').replace(/[^0-9,.-]/g, '').replace('.', '').replace(',', '.'));
    if (!Number.isFinite(n) || n === 0) return '';
    return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  function getHistoricoColaborador(row, fallback = '') {
    return normalizeName(firstValue(row, [
      'colaborador', 'nome_colaborador', 'funcionario', 'funcionário', 'motorista', 'motorista_atual',
      'motorista_planilha', 'patrimonio_funcionario', 'condutor', 'nome_condutor', 'condutor_nome',
      'motorista_indicado', 'responsavel', 'responsável', 'solicitante'
    ]) || fallback || 'MOTORISTA NÃO IDENTIFICADO');
  }

  function getHistoricoDate(row, keys = []) {
    const value = firstValue(row, keys.concat(['data', 'data_evento', 'data_infracao', 'data_manutencao', 'created_at']));
    return normalizeDateForMatch(value) || '';
  }

  function normalizeHistoricoExcesso(row) {
    const motorista = getHistoricoColaborador(row);
    const data = getHistoricoDate(row, ['data_evento']);
    const velocidade = parseSpeed(row.velocidade);
    return {
      id: `excesso-${row.id || `${row.placa}-${data}-${row.hora_evento || ''}`}`,
      tipo: 'excesso',
      tipoLabel: 'Excesso de velocidade',
      colaborador: motorista,
      placa: onlyPlate(row.placa || row.patrimonio_codigo),
      data,
      hora: row.hora_evento || '',
      titulo: velocidade ? `${velocidade} km/h` : 'Excesso registrado',
      detalhes: [row.endereco, row.coordenacao, row.supervisao].filter(Boolean).join(' · '),
      status: row.status_notificacao || row.status_cruzamento || 'PENDENTE',
      valor: '',
      raw: row
    };
  }

  function normalizeHistoricoMulta(row) {
    const motorista = getHistoricoColaborador(row);
    const data = getHistoricoDate(row, ['data_infracao', 'data_multa', 'data_vencimento']);
    const valor = formatMoneyBR(firstValue(row, ['valor_original', 'valor', 'valor_multa', 'valor_atualizado']));
    return {
      id: `multa-${row.id || row.numero_auto_infracao || `${row.placa}-${data}`}`,
      tipo: 'multa',
      tipoLabel: 'Multa',
      colaborador: motorista,
      placa: onlyPlate(row.placa),
      data,
      hora: '',
      titulo: firstValue(row, ['descricao', 'descrição', 'infracao', 'infração', 'numero_auto_infracao', 'auto']) || 'Multa registrada',
      detalhes: [row.local, row.empresa, row.renavam].filter(Boolean).join(' · '),
      status: row.status_multa || row.situacao || row.status || 'A PAGAR',
      valor,
      raw: row
    };
  }

  function normalizeHistoricoManutencao(row) {
    const motorista = getHistoricoColaborador(row);
    const data = getHistoricoDate(row, ['data_manutencao', 'data_servico', 'data_abertura', 'data_conclusao']);
    const valor = formatMoneyBR(firstValue(row, ['valor', 'valor_total', 'custo', 'custo_total']));
    return {
      id: `manutencao-${row.id || `${row.placa}-${data}-${row.created_at || ''}`}`,
      tipo: 'manutencao',
      tipoLabel: 'Manutenção',
      colaborador: motorista,
      placa: onlyPlate(row.placa || row.veiculo_placa),
      data,
      hora: firstValue(row, ['hora', 'hora_servico']),
      titulo: firstValue(row, ['tipo', 'servico', 'serviço', 'descricao', 'descrição']) || 'Manutenção registrada',
      detalhes: [row.oficina, row.fornecedor, row.observacoes, row.observação, row.status].filter(Boolean).join(' · '),
      status: row.status || row.situacao || row.etapa || 'REGISTRADO',
      valor,
      raw: row
    };
  }

  async function tryLoadTableRows(supabase, tableName, select = '*') {
    try {
      const { data, error } = await supabase.from(tableName).select(select).limit(5000);
      if (error) throw error;
      return Array.isArray(data) ? data : [];
    } catch (err) {
      console.warn(`[FROTAS] Histórico: tabela ${tableName} indisponível ou sem acesso.`, err?.message || err);
      return [];
    }
  }

  function filterHistoricoRows() {
    const busca = normalizeName(historicoState.busca);
    const tipo = historicoState.tipo || 'todos';
    const start = normalizeDateForMatch(historicoState.start);
    const end = normalizeDateForMatch(historicoState.end);
    const minDate = start && end ? (start <= end ? start : end) : (start || '');
    const maxDate = start && end ? (start <= end ? end : start) : (end || '');

    return historicoState.rows.filter((row) => {
      if (tipo !== 'todos' && row.tipo !== tipo) return false;
      if (minDate && row.data && row.data < minDate) return false;
      if (maxDate && row.data && row.data > maxDate) return false;
      if (busca) {
        const haystack = normalizeName([row.colaborador, row.placa, row.tipoLabel, row.titulo, row.detalhes, row.status].join(' '));
        if (!haystack.includes(busca)) return false;
      }
      return true;
    }).sort((a, b) => String(b.data || '').localeCompare(String(a.data || '')) || String(b.hora || '').localeCompare(String(a.hora || '')));
  }

  function groupHistoricoByColaborador(rows) {
    const by = new Map();
    rows.forEach((row) => {
      const key = row.colaborador || 'MOTORISTA NÃO IDENTIFICADO';
      if (!by.has(key)) by.set(key, { colaborador: key, rows: [], placas: new Set(), multas: 0, manutencoes: 0, excessos: 0, valorMultas: 0 });
      const group = by.get(key);
      group.rows.push(row);
      if (row.placa) group.placas.add(row.placa);
      if (row.tipo === 'multa') group.multas += 1;
      if (row.tipo === 'manutencao') group.manutencoes += 1;
      if (row.tipo === 'excesso') group.excessos += 1;
      const val = Number(String(row.valor || '').replace(/[^0-9,.-]/g, '').replace('.', '').replace(',', '.'));
      if (row.tipo === 'multa' && Number.isFinite(val)) group.valorMultas += val;
    });
    return Array.from(by.values()).sort((a, b) => a.colaborador.localeCompare(b.colaborador, 'pt-BR'));
  }

  function renderHistoricoContent(root) {
    const host = root.querySelector('[data-frotas-historico-content]');
    const count = root.querySelector('[data-historico-count]');
    const kpiColabs = root.querySelector('[data-hist-kpi-colabs]');
    const kpiExcessos = root.querySelector('[data-hist-kpi-excessos]');
    const kpiMultas = root.querySelector('[data-hist-kpi-multas]');
    const kpiManut = root.querySelector('[data-hist-kpi-manut]');
    if (!host) return;

    if (historicoState.loading) {
      host.innerHTML = '<div class="speed-import-empty">Carregando histórico de frotas...</div>';
      return;
    }
    if (historicoState.error) {
      host.innerHTML = `<div class="speed-import-empty">${escapeHtml(historicoState.error)}</div>`;
      return;
    }

    const rows = filterHistoricoRows();
    const groups = groupHistoricoByColaborador(rows);
    if (count) count.textContent = `${groups.length} colaborador(es) · ${rows.length} registro(s)`;
    if (kpiColabs) kpiColabs.textContent = groups.length;
    if (kpiExcessos) kpiExcessos.textContent = rows.filter((r) => r.tipo === 'excesso').length;
    if (kpiMultas) kpiMultas.textContent = rows.filter((r) => r.tipo === 'multa').length;
    if (kpiManut) kpiManut.textContent = rows.filter((r) => r.tipo === 'manutencao').length;

    if (!rows.length) {
      host.innerHTML = '<div class="speed-import-empty">Nenhum registro encontrado para os filtros selecionados.</div>';
      return;
    }

    host.innerHTML = groups.map((group) => {
      const rowsHtml = group.rows.slice(0, 80).map((row) => `
        <tr>
          <td>${escapeHtml(formatDateBR(row.data) || '—')}${row.hora ? `<br><small>${escapeHtml(row.hora)}</small>` : ''}</td>
          <td><span class="hist-badge ${escapeHtml(row.tipo)}">${escapeHtml(row.tipoLabel)}</span></td>
          <td><strong>${escapeHtml(row.placa || '—')}</strong></td>
          <td>${escapeHtml(row.titulo || '—')}${row.detalhes ? `<br><small>${escapeHtml(row.detalhes)}</small>` : ''}</td>
          <td>${escapeHtml(row.status || '—')}</td>
          <td>${escapeHtml(row.valor || '')}</td>
        </tr>`).join('');
      const hidden = group.rows.length > 80 ? `<p class="speed-hint">Mostrando os 80 registros mais recentes deste colaborador.</p>` : '';
      return `
        <article class="hist-card">
          <div class="hist-card-head">
            <div><h3>${escapeHtml(group.colaborador)}</h3><p>${escapeHtml(Array.from(group.placas).join(', ') || 'Sem placa vinculada')}</p></div>
            <div class="hist-mini-kpis"><span>${group.excessos} excesso(s)</span><span>${group.multas} multa(s)</span><span>${group.manutencoes} manutenção(ões)</span></div>
          </div>
          <div class="hist-table-wrap"><table class="hist-table"><thead><tr><th>Data</th><th>Tipo</th><th>Placa</th><th>Registro</th><th>Status</th><th>Valor</th></tr></thead><tbody>${rowsHtml}</tbody></table></div>${hidden}
        </article>`;
    }).join('');
  }

  async function loadHistoricoFrotas(root, opts = {}) {
    const supabase = resolveSupabase(opts);
    if (!supabase || typeof supabase.from !== 'function') {
      historicoState.error = 'Supabase não encontrado para carregar o histórico.';
      historicoState.loaded = true;
      renderHistoricoContent(root);
      return;
    }
    historicoState.loading = true;
    historicoState.error = '';
    renderHistoricoContent(root);
    try {
      const [excessos, multas] = await Promise.all([
        tryLoadTableRows(supabase, HISTORICO_TABLES.excessos, 'id,data_evento,hora_evento,placa,velocidade,endereco,motorista_planilha,patrimonio_funcionario,patrimonio_codigo,coordenacao,supervisao,status_cruzamento,status_notificacao,created_at'),
        tryLoadTableRows(supabase, HISTORICO_TABLES.multas, '*')
      ]);

      let manutencoes = [];
      for (const table of HISTORICO_TABLES.manutencoes) {
        manutencoes = await tryLoadTableRows(supabase, table, '*');
        if (manutencoes.length) break;
      }

      historicoState.rows = [
        ...excessos.map(normalizeHistoricoExcesso),
        ...multas.map(normalizeHistoricoMulta),
        ...manutencoes.map(normalizeHistoricoManutencao)
      ].filter((row) => row.colaborador || row.placa || row.titulo);
      historicoState.loaded = true;
    } catch (err) {
      console.warn('[FROTAS] Falha ao carregar histórico:', err);
      historicoState.error = err.message || 'Não foi possível carregar o histórico.';
    } finally {
      historicoState.loading = false;
      renderHistoricoContent(root);
    }
  }

  function renderHistoricoFrotas(container, opts = {}) {
    currentRenderOpts = opts || {};
    container.innerHTML = `${getStyles()}
      <section class="frotas-shell">
        <div class="frotas-header"><div><div class="frotas-kicker">Frotas · Histórico</div><h1 class="frotas-title">Histórico do Colaborador</h1><p class="frotas-subtitle">Agrupa automaticamente multas, manutenções e excessos de velocidade pelo colaborador atualmente registrado em cada ocorrência. Se o ADM alterar o colaborador em uma multa, manutenção ou excesso, o histórico passa a aparecer no novo colaborador no próximo carregamento.</p></div></div>
        <div class="frotas-card">
          <div class="frotas-tabs"><button class="frotas-tab" type="button" data-open-excesso>Excesso de Velocidade</button><button class="frotas-tab" type="button" data-open-veiculos>Veículos</button><button class="frotas-tab" type="button" data-open-multas>Multas</button><button class="frotas-tab active" type="button">Histórico</button></div>
          <div class="frotas-body">
            <div class="hist-toolbar">
              <input class="speed-input" data-historico-search placeholder="Buscar por colaborador, placa, tipo, status...">
              <select class="speed-select" data-historico-tipo><option value="todos">Todos os tipos</option><option value="excesso">Excessos</option><option value="multa">Multas</option><option value="manutencao">Manutenções</option></select>
              <input class="speed-input" type="date" data-historico-start>
              <input class="speed-input" type="date" data-historico-end>
              <button class="speed-btn speed-btn-soft speed-btn-compact" type="button" data-historico-refresh>Atualizar</button>
            </div>
            <div class="hist-kpi-grid"><div class="hist-kpi"><span>Colaboradores</span><strong data-hist-kpi-colabs>0</strong></div><div class="hist-kpi"><span>Excessos</span><strong data-hist-kpi-excessos>0</strong></div><div class="hist-kpi"><span>Multas</span><strong data-hist-kpi-multas>0</strong></div><div class="hist-kpi"><span>Manutenções</span><strong data-hist-kpi-manut>0</strong></div></div>
            <p class="speed-hint" data-historico-count>Carregando histórico...</p>
            <div class="hist-list" data-frotas-historico-content></div>
          </div>
        </div>
      </section>`;

    container.querySelector('[data-open-excesso]')?.addEventListener('click', () => renderExcessoVelocidade(container, opts));
    container.querySelector('[data-open-veiculos]')?.addEventListener('click', () => window.location.assign(panelUrl('frotas-veiculos')));
    container.querySelector('[data-open-multas]')?.addEventListener('click', () => window.location.assign(panelUrl('frotas-multas')));
    container.querySelector('[data-open-historico]')?.addEventListener('click', () => renderHistoricoFrotas(container, opts));
    container.querySelector('[data-historico-refresh]')?.addEventListener('click', () => loadHistoricoFrotas(container, opts));
    container.querySelector('[data-historico-search]')?.addEventListener('input', (ev) => { historicoState.busca = ev.target.value; renderHistoricoContent(container); });
    container.querySelector('[data-historico-tipo]')?.addEventListener('change', (ev) => { historicoState.tipo = ev.target.value; renderHistoricoContent(container); });
    container.querySelector('[data-historico-start]')?.addEventListener('change', (ev) => { historicoState.start = ev.target.value; renderHistoricoContent(container); });
    container.querySelector('[data-historico-end]')?.addEventListener('change', (ev) => { historicoState.end = ev.target.value; renderHistoricoContent(container); });

    renderHistoricoContent(container);
    loadHistoricoFrotas(container, opts);
  }

  function renderExcessoVelocidade(container, opts = {}) {
    currentRenderOpts = opts || {};
    const colaboradores = getColaboradores(opts);
    container.innerHTML = `${getStyles()}
      <section class="frotas-shell">
        <div class="frotas-header"><div><div class="frotas-kicker">Frotas · Notificações</div><h1 class="frotas-title">Excesso de Velocidade</h1><p class="frotas-subtitle">Gere as notificações aos colaboradores. Depois, envie os prints em lote: o sistema identifica a placa/OCR e salva cada arquivo na pasta do motorista correspondente no Drive.</p></div></div>
        <div class="frotas-card">
          <div class="frotas-tabs"><button class="frotas-tab active" type="button">Excesso de Velocidade</button><button class="frotas-tab" type="button" data-open-veiculos>Veículos</button><button class="frotas-tab" type="button" data-open-multas>Multas</button><button class="frotas-tab" type="button" data-open-historico>Histórico</button></div>
          <div class="frotas-body">
            <div class="speed-grid">
              <div class="speed-panel">
                <div class="speed-step-title"><h3>Painel 1 · Copiar mensagem</h3><span class="speed-step-pill">maior velocidade por data</span></div>
                <div class="speed-import-card">
                  <div class="speed-import-head"><h3>Registros importados</h3><div class="speed-import-actions"><button class="speed-btn speed-btn-primary speed-btn-compact" type="button" data-sync-bfleet-excessos>Sincronizar ontem</button><button class="speed-btn speed-btn-soft speed-btn-compact" type="button" data-refresh-imported-excessos>Atualizar</button></div></div>
                  <p class="speed-hint" data-imported-excess-count>Nenhuma pendência carregada</p>
                  <div class="print-status-box">
                    <strong>Sincronizar relatório da BFleet</strong>
                    <p>Use <strong>Sincronizar ontem</strong> para o padrão diário. Para ajustar manualmente a data que vem da API, informe o período abaixo.</p>
                    <div class="speed-sync-range">
                      <div class="speed-field"><label>Data inicial do relatório</label><input class="speed-input" type="date" data-sync-report-start></div>
                      <div class="speed-field"><label>Data final do relatório</label><input class="speed-input" type="date" data-sync-report-end></div>
                    </div>
                    <button class="speed-btn speed-btn-soft speed-btn-compact" type="button" data-sync-bfleet-period>Sincronizar período</button>
                  </div>
                  <p class="speed-hint">As datas de OK em lote aparecem junto das pendências e servem apenas para limpar/arquivar registros já importados.</p>
                  <div class="speed-import-list" data-imported-excess-list><div class="speed-import-empty">Carregando registros importados...</div></div>
                  <p class="speed-hint">Ao clicar em uma sugestão, o painel considera automaticamente somente a maior velocidade de cada data.</p>
                </div>
                <h3>Dados da notificação</h3>
                <div class="speed-field colab-autocomplete" data-colaborador-autocomplete><label>Colaborador / Motorista</label><input class="speed-input" type="text" autocomplete="off" placeholder="Digite para buscar o colaborador" data-speed-name><div class="colab-dropdown" data-colaborador-dropdown hidden></div><p class="speed-colab-status" data-colaborador-status>Carregando colaboradores da base...</p></div>
                <div class="speed-field"><label>Placa do veículo</label><input class="speed-input" type="text" maxlength="8" placeholder="RVQ6J42" data-speed-plate></div>
                <div class="speed-field"><label>Data da notificação</label><input class="speed-input" type="text" value="${escapeHtml(todayBRShort())}" data-notification-date><p class="speed-hint">Usada para definir o ano da notificação. No Drive será salvo como: <code>Xº NOTIFICAÇÃO DE VELOCIDADE ANO NOME DO COLABORADOR</code></p></div>
                <div class="speed-field"><label>Cidade e data da mensagem</label><input class="speed-input" type="text" value="Cascavel, ${escapeHtml(todayBRLong())}" data-speed-city-date></div>
                <div class="speed-field"><label>Registros de velocidade</label><div data-speed-records></div><button class="speed-btn speed-btn-soft" type="button" data-add-record>+ Adicionar data e velocidade</button></div>
                <div class="speed-actions"><button class="speed-btn speed-btn-primary" type="button" data-generate-speed-message>Gerar e copiar mensagem</button><p class="speed-hint">Depois de gerar, a sugestão fica marcada como <strong>GERADA/COPIADA</strong> para não confundir na sequência.</p></div>
                <div class="speed-divider"></div>
                <h3>Mensagem gerada</h3>
                <textarea class="speed-input speed-textarea speed-message small" readonly data-speed-output placeholder="A mensagem será gerada aqui e copiada automaticamente."></textarea>
              </div>
              <div class="speed-panel">
                <div class="speed-step-title"><h3>Painel 2 · Enviar prints</h3><span class="speed-step-pill">colar direto aqui</span></div>
                <div class="upload-box">
                  <div class="speed-field"><label>URL do Web App / Apps Script</label><input class="speed-input" type="url" placeholder="https://script.google.com/macros/s/.../exec" value="${escapeHtml(state.gasUrl)}" data-gas-url><p class="speed-hint">Essa URL fica salva no navegador e é usada para salvar no Drive/OCR. Pasta mãe: <code>${PASTA_MAE_DRIVE_ID}</code>.</p></div>
                  <div class="paste-zone" tabindex="0" data-paste-zone>
                    <strong>Clique aqui e cole o print</strong>
                    <span>Após clicar neste quadro, use <kbd>Ctrl</kbd> + <kbd>V</kbd>. Também funciona colando em qualquer campo desta tela, arrastando imagens ou selecionando em lote abaixo.</span>
                  </div>
                  <div class="speed-field" style="margin-top:14px"><label>Selecionar prints em lote</label><input class="speed-input" type="file" accept="image/*" multiple data-print-files></div>
                  <div data-upload-list class="upload-list"></div>
                  <div class="upload-actions"><button class="speed-btn speed-btn-primary" type="button" data-upload-prints>Enviar prints e arquivar pendências</button></div>
                  <div class="print-status-box"><strong>Como o arquivamento funciona</strong><p>Após a mensagem estar GERADA/COPIADA, o envio do print identifica placa/motorista pelo OCR e arquiva automaticamente. Se precisar limpar manualmente, use OK na pendência ou OK por data.</p></div>
                  <div data-saved-list class="saved-list"></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>`;

    if (state.gasUrl) localStorage.setItem(GAS_URL_KEY, state.gasUrl);
    renderRecords(container);
    renderUploadLists(container);
    renderColaboradorStatus(container, opts);
    bindColaboradorAutocomplete(container, opts);
    loadColaboradoresFromSupabase(container, opts);
    fetchImportedExcessos(container, opts);

    container.querySelector('[data-sync-bfleet-excessos]')?.addEventListener('click', () => sincronizarRelatorioBFleet(container, opts, 'yesterday'));
    container.querySelector('[data-sync-bfleet-period]')?.addEventListener('click', () => sincronizarRelatorioBFleet(container, opts, 'period'));
    container.querySelector('[data-refresh-imported-excessos]')?.addEventListener('click', () => fetchImportedExcessos(container, opts));
    container.querySelector('[data-open-veiculos]')?.addEventListener('click', () => window.location.assign(panelUrl('frotas-veiculos')));
    container.querySelector('[data-open-multas]')?.addEventListener('click', () => window.location.assign(panelUrl('frotas-multas')));
    container.querySelector('[data-open-historico]')?.addEventListener('click', () => renderHistoricoFrotas(container, opts));

    const plate = container.querySelector('[data-speed-plate]');
    if (plate) plate.addEventListener('input', () => { plate.value = onlyPlate(plate.value); });

    container.querySelector('[data-add-record]')?.addEventListener('click', () => { syncRecordsFromDom(container); state.records.push({ data: '', velocidade: '' }); renderRecords(container); });
    container.querySelector('[data-print-files]')?.addEventListener('change', (ev) => { addUploadedFiles(container, ev.target.files || [], 'selecionado'); ev.target.value = ''; });

    const pasteZone = container.querySelector('[data-paste-zone]');
    const handlePrintPaste = (ev) => {
      const files = clipboardImageFilesFromEvent(ev);
      if (!files.length) return;
      ev.preventDefault();
      ev.stopPropagation();
      addUploadedFiles(container, files, 'colado');
      if (pasteZone) {
        pasteZone.classList.add('drag');
        setTimeout(() => pasteZone.classList.remove('drag'), 450);
      }
    };

    container.addEventListener('paste', handlePrintPaste);

    if (pasteZone) {
      pasteZone.addEventListener('click', () => {
        pasteZone.focus();
        toast('Área de prints selecionada. Agora use Ctrl + V para colar o print.');
      });
      pasteZone.addEventListener('paste', handlePrintPaste);
      pasteZone.addEventListener('dragover', (ev) => { ev.preventDefault(); pasteZone.classList.add('drag'); });
      pasteZone.addEventListener('dragleave', () => pasteZone.classList.remove('drag'));
      pasteZone.addEventListener('drop', (ev) => {
        ev.preventDefault();
        pasteZone.classList.remove('drag');
        addUploadedFiles(container, ev.dataTransfer?.files || [], 'arrastado');
      });
    }

    container.querySelector('[data-gas-url]')?.addEventListener('input', (ev) => {
      state.gasUrl = String(ev.target.value || '').trim() || DEFAULT_GAS_URL;
      localStorage.setItem(GAS_URL_KEY, state.gasUrl);
    });
    container.querySelector('[data-upload-prints]')?.addEventListener('click', () => uploadPrints(container));
    container.querySelector('[data-generate-speed-message]')?.addEventListener('click', async () => {
      syncRecordsFromDom(container);
      const validation = validateForm(container);
      if (!validation.ok) return toast(validation.message, 'error');
      const message = buildMessage(validation.payload);
      state.lastMessage = message;
      const output = container.querySelector('[data-speed-output]');
      if (output) output.value = message;
      try { await copyText(message); await markSelectedImportedGroupAsGenerated(container, opts, message); toast('Mensagem gerada, copiada e marcada como GERADA.'); }
      catch (err) { console.warn('[FROTAS] Falha ao copiar mensagem:', err); toast('Mensagem gerada, mas não foi possível copiar automaticamente.', 'error'); }
    });
  }

  function renderHome(container, opts = {}) { renderExcessoVelocidade(container, opts); }
  window[MODULE_NAME] = window[MODULE_NAME] || {};
  window[MODULE_NAME].openHome = renderHome;
  window[MODULE_NAME].openHistorico = renderHistoricoFrotas;
  window.ADM_MODULES = window.ADM_MODULES || {};
  window.ADM_MODULES.frotas = { mount: renderHome };
})();
