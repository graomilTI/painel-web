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
    importedExcessosLoaded: false
  };


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
        .frotas-shell{width:100%;color:#e5e7eb}.frotas-header{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;margin-bottom:18px}.frotas-kicker{display:inline-flex;align-items:center;gap:8px;color:#86efac;font-size:12px;font-weight:900;letter-spacing:.14em;text-transform:uppercase;margin-bottom:8px}.frotas-title{margin:0;font-size:clamp(22px,2.2vw,32px);line-height:1.1;color:#f8fafc;letter-spacing:-.04em}.frotas-subtitle{max-width:860px;margin:10px 0 0;color:#94a3b8;font-size:14px;line-height:1.55}.frotas-card{background:radial-gradient(circle at top left,rgba(34,197,94,.13),transparent 34%),linear-gradient(180deg,rgba(15,23,42,.98),rgba(2,6,23,.98));border:1px solid rgba(148,163,184,.16);border-radius:24px;box-shadow:0 20px 60px rgba(0,0,0,.28);overflow:hidden}.frotas-tabs{display:flex;gap:10px;flex-wrap:wrap;padding:14px;border-bottom:1px solid rgba(148,163,184,.12);background:rgba(2,6,23,.36)}.frotas-tab{appearance:none;border:1px solid rgba(148,163,184,.16);background:rgba(15,23,42,.72);color:#cbd5e1;border-radius:999px;padding:10px 14px;font-weight:900;font-size:13px;cursor:pointer;transition:.18s ease}.frotas-tab.active,.frotas-tab:hover{color:#f8fafc;border-color:rgba(34,197,94,.55);background:rgba(22,101,52,.35)}.frotas-body{padding:18px}.speed-grid{display:grid;grid-template-columns:minmax(300px,450px) minmax(320px,1fr);gap:18px;align-items:start}.speed-panel{background:rgba(15,23,42,.72);border:1px solid rgba(148,163,184,.14);border-radius:22px;padding:18px}.speed-panel h3{margin:0 0 14px;color:#f8fafc;font-size:16px;letter-spacing:-.02em}.speed-field{display:flex;flex-direction:column;gap:7px;margin-bottom:14px}.speed-field label{color:#cbd5e1;font-size:12px;font-weight:900;text-transform:uppercase;letter-spacing:.08em}.speed-input,.speed-select,.speed-textarea{width:100%;border:1px solid rgba(148,163,184,.18);background:#0f172a;color:#e5e7eb;border-radius:14px;padding:12px 13px;outline:none;font-size:14px;transition:.16s ease;color-scheme:dark}.speed-select option{background:#0f172a;color:#e5e7eb}.speed-input:focus,.speed-select:focus,.speed-textarea:focus{border-color:rgba(34,197,94,.68);box-shadow:0 0 0 4px rgba(34,197,94,.10)}.speed-row{display:grid;grid-template-columns:1fr 130px 42px;gap:10px;align-items:end;margin-bottom:10px}.speed-row .speed-field{margin-bottom:0}.speed-btn{border:0;border-radius:14px;padding:12px 14px;font-weight:950;cursor:pointer;transition:.18s ease;display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:44px}.speed-btn-primary{width:100%;background:linear-gradient(135deg,#16a34a,#22c55e);color:#052e16;box-shadow:0 14px 34px rgba(34,197,94,.22)}.speed-btn-primary:hover{transform:translateY(-1px);filter:brightness(1.05)}.speed-btn-primary:disabled{opacity:.55;cursor:not-allowed;transform:none}.speed-btn-soft{background:rgba(34,197,94,.12);color:#86efac;border:1px solid rgba(34,197,94,.24)}.speed-btn-danger{background:rgba(239,68,68,.10);color:#fca5a5;border:1px solid rgba(239,68,68,.20);padding:0;min-width:42px}.speed-actions{display:grid;gap:10px;margin-top:14px}.speed-message{min-height:520px;resize:vertical;line-height:1.55;white-space:pre-wrap}.speed-hint{margin:10px 0 0;color:#94a3b8;font-size:12px;line-height:1.45}.speed-hint code{color:#bbf7d0}.speed-colab-status{margin-top:-6px;color:#86efac;font-size:11px;font-weight:800;line-height:1.35}.colab-autocomplete{position:relative}.colab-dropdown{position:absolute;left:0;right:0;top:calc(100% - 4px);z-index:60;background:linear-gradient(180deg,#0f172a,#020617);border:1px solid rgba(34,197,94,.38);border-radius:16px;box-shadow:0 18px 44px rgba(0,0,0,.42);padding:6px;max-height:286px;overflow:auto}.colab-dropdown[hidden]{display:none}.colab-option{width:100%;border:0;background:transparent;color:#e5e7eb;text-align:left;border-radius:12px;padding:10px 11px;cursor:pointer;display:block}.colab-option:hover,.colab-option.active{background:rgba(22,101,52,.34)}.colab-option strong{display:block;font-size:12px;line-height:1.25;color:#f8fafc;letter-spacing:.02em}.colab-option span{display:block;margin-top:3px;font-size:11px;line-height:1.25;color:#94a3b8}.colab-empty{padding:10px 11px;color:#94a3b8;font-size:12px}.speed-divider{height:1px;background:rgba(148,163,184,.14);margin:16px 0}.speed-import-card{border:1px solid rgba(34,197,94,.18);background:rgba(2,6,23,.32);border-radius:18px;padding:14px;margin-bottom:16px}.speed-import-head{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:10px}.speed-import-head h3{margin:0}.speed-import-actions{display:flex;gap:8px;flex-wrap:wrap;align-items:center}.speed-btn-compact{width:auto;min-height:38px;padding:9px 12px;font-size:12px}.speed-import-list{display:grid;gap:8px;max-height:260px;overflow:auto}.speed-import-empty{color:#94a3b8;font-size:12px;border:1px dashed rgba(148,163,184,.2);border-radius:14px;padding:12px}.speed-import-item{width:100%;text-align:left;border:1px solid rgba(148,163,184,.14);background:rgba(15,23,42,.72);color:#e5e7eb;border-radius:14px;padding:10px 12px;cursor:pointer}.speed-import-item:hover{border-color:rgba(34,197,94,.45);background:rgba(22,101,52,.18)}.speed-import-item.selected{border-color:rgba(34,197,94,.75);background:rgba(22,101,52,.24);box-shadow:inset 4px 0 0 rgba(34,197,94,.75)}.speed-import-item.generated{border-color:rgba(34,197,94,.36);background:rgba(20,83,45,.30);opacity:.74}.speed-import-item.generated strong::after{content:'  ✓ COPIADA';display:inline-flex;margin-left:6px;color:#86efac;font-size:10px;font-weight:950}.speed-import-item.generated .speed-import-badge{background:rgba(34,197,94,.22);border-color:rgba(34,197,94,.45);color:#dcfce7}.speed-import-item strong{display:block;color:#f8fafc;font-size:12px}.speed-import-item span{display:block;color:#94a3b8;font-size:11px;margin-top:3px}.speed-import-badge{display:inline-flex;border-radius:999px;padding:3px 7px;background:rgba(34,197,94,.12);border:1px solid rgba(34,197,94,.22);color:#bbf7d0;font-size:10px;font-weight:900;margin-top:6px}.upload-box{border:1px dashed rgba(34,197,94,.35);border-radius:18px;padding:14px;background:rgba(2,6,23,.28)}.upload-list{display:grid;gap:8px;margin-top:10px}.upload-item{display:flex;justify-content:space-between;gap:10px;align-items:center;border:1px solid rgba(148,163,184,.13);background:rgba(15,23,42,.66);border-radius:14px;padding:10px 12px;color:#cbd5e1;font-size:12px}.upload-item strong{color:#f8fafc}.saved-list{display:grid;gap:8px;margin-top:10px}.saved-item{border:1px solid rgba(34,197,94,.20);background:rgba(22,101,52,.12);border-radius:14px;padding:10px 12px;color:#dcfce7;font-size:12px}.saved-item a{color:#86efac;font-weight:900}.speed-toast{position:fixed;right:22px;bottom:22px;background:rgba(22,101,52,.96);color:#dcfce7;border:1px solid rgba(134,239,172,.32);border-radius:16px;padding:12px 14px;font-weight:900;box-shadow:0 16px 45px rgba(0,0,0,.35);z-index:99999;opacity:0;transform:translateY(10px);pointer-events:none;transition:.2s ease}.speed-toast.show{opacity:1;transform:translateY(0)}.speed-grid{display:grid;grid-template-columns:1.05fr .95fr;gap:18px;align-items:start}.speed-step-title{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:14px}.speed-step-title h3{margin:0}.speed-step-pill{display:inline-flex;align-items:center;border:1px solid rgba(34,197,94,.28);background:rgba(34,197,94,.12);color:#bbf7d0;border-radius:999px;padding:5px 9px;font-size:10px;font-weight:950;text-transform:uppercase;letter-spacing:.08em;white-space:nowrap}.speed-message.small{min-height:280px}.paste-zone{border:1px dashed rgba(34,197,94,.42);border-radius:20px;background:radial-gradient(circle at top left,rgba(34,197,94,.14),transparent 32%),rgba(2,6,23,.36);padding:20px;text-align:center;outline:none;transition:.18s ease;cursor:pointer}.paste-zone:hover,.paste-zone:focus,.paste-zone.drag{border-color:rgba(134,239,172,.86);background:rgba(22,101,52,.16);box-shadow:0 0 0 4px rgba(34,197,94,.08)}.paste-zone strong{display:block;color:#f8fafc;font-size:15px;margin-bottom:6px}.paste-zone span{display:block;color:#94a3b8;font-size:12px;line-height:1.45}.paste-zone kbd{display:inline-flex;border:1px solid rgba(148,163,184,.24);background:#0f172a;color:#bbf7d0;border-radius:8px;padding:2px 6px;font-size:11px;font-weight:900}.upload-actions{display:grid;grid-template-columns:1fr;gap:10px;margin-top:12px}.print-status-box{border:1px solid rgba(148,163,184,.14);background:rgba(15,23,42,.52);border-radius:16px;padding:12px;margin-top:14px}.print-status-box strong{display:block;color:#f8fafc;font-size:12px;margin-bottom:5px}.print-status-box p{margin:0;color:#94a3b8;font-size:12px;line-height:1.45}@media(max-width:1100px){.speed-grid{grid-template-columns:1fr}.speed-row{grid-template-columns:1fr 1fr 42px}}@media(max-width:560px){.frotas-header{display:block}.speed-row{grid-template-columns:1fr}.speed-btn-danger{width:100%}.speed-step-title{display:block}.speed-step-pill{margin-top:8px}}
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

    const supabase = opts?.supabase || window.supabase;
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
      g.totalRegistrosOriginais = ordered.length;
      g.registros = dedupeHighestSpeedByDate(ordered.map((r) => ({ ...r, data: r.data_evento, velocidade: r.velocidade })));
      g.maxVelocidade = Math.max(...g.registros.map((r) => Number(r.velocidade || 0)));
      g.periodoInicio = g.registros[0]?.data || g.registros[0]?.data_evento || '';
      g.periodoFim = g.registros[g.registros.length - 1]?.data || g.registros[g.registros.length - 1]?.data_evento || '';
      return g;
    }).sort((a, b) => String(a.motorista || a.placa).localeCompare(String(b.motorista || b.placa), 'pt-BR'));
  }

  function buildPrintDriverMap() {
    return groupImportedExcessos(state.importedExcessos).map((g) => ({
      key: g.key || '',
      plate: onlyPlate(g.placa),
      driverName: normalizeName(g.motorista || ''),
      driverFolderName: sanitizeFolderName(g.motorista || ''),
      coordenacao: g.coordenacao || '',
      supervisao: g.supervisao || '',
      registros: (g.registros || []).map((r) => ({
        id: r.id,
        data: formatDateBR(r.data || r.data_evento),
        velocidade: parseSpeed(r.velocidade)
      })).filter((r) => r.id && r.data && r.velocidade)
    })).filter((item) => item.plate && item.driverName);
  }

  function renderImportedExcessos(root) {
    const list = root.querySelector('[data-imported-excess-list]');
    const count = root.querySelector('[data-imported-excess-count]');
    if (!list) return;

    const groups = groupImportedExcessos(state.importedExcessos);
    if (count) count.textContent = groups.length ? `${groups.length} notificação(ões) pendente(s)` : 'Nenhuma pendência carregada';

    if (!state.importedExcessosLoaded) {
      list.innerHTML = '<div class="speed-import-empty">Carregando registros importados...</div>';
      return;
    }

    if (!groups.length) {
      list.innerHTML = '<div class="speed-import-empty">Nenhum excesso de velocidade pendente encontrado. Faça upload do relatório em Importar Relatórios.</div>';
      return;
    }

    list.innerHTML = groups.map((g, index) => {
      const nome = g.motorista ? normalizeName(g.motorista) : 'Motorista não identificado';
      const meta = [g.supervisao, g.coordenacao].filter(Boolean).join(' · ');
      const periodo = g.periodoInicio === g.periodoFim ? formatDateBR(g.periodoInicio) : `${formatDateBR(g.periodoInicio)} a ${formatDateBR(g.periodoFim)}`;
      const generated = state.generatedImportedGroupKeys.has(g.key) || (g.registros || []).some((r) => String(r.status_notificacao || '').toUpperCase() === 'GERADA');
      const selected = state.selectedImportedGroupKey === g.key;
      const badge = generated ? 'Mensagem copiada' : (g.status_cruzamento === 'MOTORISTA_IDENTIFICADO' ? 'Identificado pelo patrimônio' : 'Conferir motorista');
      return `<button class="speed-import-item ${selected ? 'selected' : ''} ${generated ? 'generated' : ''}" type="button" data-imported-excess-index="${index}">
        <strong>${escapeHtml(nome)} · ${escapeHtml(g.placa)}</strong>
        <span>${escapeHtml(meta || 'Sem supervisão/coordenação')} · ${g.registros.length} data(s) considerada(s) · ${g.totalRegistrosOriginais || g.registros.length} registro(s) importado(s) · ${escapeHtml(periodo)} · maior ${escapeHtml(g.maxVelocidade)} km/h</span>
        <em class="speed-import-badge">${escapeHtml(badge)}</em>
      </button>`;
    }).join('');

    list.querySelectorAll('[data-imported-excess-index]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const group = groups[Number(btn.getAttribute('data-imported-excess-index'))];
        applyImportedExcessoGroup(root, group);
      });
    });
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
    const supabase = opts?.supabase || window.supabase;
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

  async function sincronizarRelatorioBFleet(root, opts = {}) {
    const btn = root.querySelector('[data-sync-bfleet-excessos]');
    const originalText = btn?.textContent || 'Sincronizar';
    try {
      if (btn) {
        btn.disabled = true;
        btn.textContent = 'Sincronizando...';
      }
      toast('Sincronizando relatório de excesso de velocidade da BFleet...');
      const res = await callEdgeFunction(opts, BFLEET_EXCESSO_FUNCTION, { mode: 'sync' });
      const inserted = Number(res?.inserted || res?.inseridos || res?.created || res?.novos || 0);
      const updated = Number(res?.updated || res?.atualizados || 0);
      const total = Number(res?.total || res?.total_registros || res?.linhas || res?.linhas_lidas_api || inserted + updated || 0);
      const errors = Number(res?.errors || res?.erros || 0);
      toast(`BFleet sincronizado: ${total || 'N'} registro(s) lido(s), ${inserted} novo(s), ${updated} atualizado(s)${errors ? ` · ${errors} erro(s)` : ''}.`, errors ? 'error' : 'success');
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
    const supabase = opts?.supabase || window.supabase;
    if (!supabase || typeof supabase.from !== 'function') {
      state.importedExcessosLoaded = true;
      renderImportedExcessos(root);
      return;
    }

    try {
      state.importedExcessosLoaded = false;
      renderImportedExcessos(root);
      const { data, error } = await supabase
        .from('frotas_excesso_velocidade')
        .select('id,data_evento,hora_evento,placa,velocidade,endereco,motorista_planilha,patrimonio_funcionario,patrimonio_codigo,coordenacao,supervisao,status_cruzamento,status_notificacao,created_at')
        .in('status_notificacao', ['PENDENTE', 'GERADA'])
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
    const supabase = opts?.supabase || window.supabase;
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
    const nome = root.querySelector('[data-speed-name]')?.value || '';
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
      saved.innerHTML = state.savedPrints.length ? state.savedPrints.map((f) => `<div class="saved-item"><strong>${escapeHtml(f.fileName || 'Print salvo')}</strong><br>Pasta: ${escapeHtml(f.driverFolderName || '')}${f.fileUrl ? `<br><a href="${escapeHtml(f.fileUrl)}" target="_blank" rel="noopener">Abrir no Drive</a>` : ''}</div>`).join('') : '';
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
      state.savedPrints = [...data.files, ...state.savedPrints];
      renderUploadLists(root);
    }
  }

  function normalizeDateForMatch(value) {
    const br = formatDateBR(value);
    const m = br.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    return m ? `${m[3]}-${m[2]}-${m[1]}` : String(value || '').slice(0, 10);
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
    const fileDriver = normalizeName(file?.driverName || file?.driverFolderName || file?.motorista || file?.nomeMotorista || '');
    const rowPlate = onlyPlate(row?.placa || '');
    const rowDriver = normalizeName(getDriverFromExcesso(row));
    if (filePlate && rowPlate && filePlate === rowPlate) return true;
    if (fileDriver && rowDriver && (fileDriver === rowDriver || fileDriver.includes(rowDriver) || rowDriver.includes(fileDriver))) return true;
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
        driverName: file?.driverName || file?.driverFolderName || getDriverFromExcesso(row) || '',
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
    const nome = root.querySelector('[data-speed-name]')?.value || '';
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
      await archiveMatchedImportedRowsFromOcr(root, json?.data?.files || []);
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

  function renderExcessoVelocidade(container, opts = {}) {
    const colaboradores = getColaboradores(opts);
    container.innerHTML = `${getStyles()}
      <section class="frotas-shell">
        <div class="frotas-header"><div><div class="frotas-kicker">Frotas · Notificações</div><h1 class="frotas-title">Excesso de Velocidade</h1><p class="frotas-subtitle">Gere as notificações aos colaboradores. Depois, envie os prints em lote: o sistema identifica a placa/OCR e salva cada arquivo na pasta do motorista correspondente no Drive.</p></div></div>
        <div class="frotas-card">
          <div class="frotas-tabs"><button class="frotas-tab active" type="button">Excesso de Velocidade</button><button class="frotas-tab" type="button" data-open-veiculos>Veículos</button><button class="frotas-tab" type="button" data-open-multas>Multas</button></div>
          <div class="frotas-body">
            <div class="speed-grid">
              <div class="speed-panel">
                <div class="speed-step-title"><h3>Painel 1 · Copiar mensagem</h3><span class="speed-step-pill">maior velocidade por data</span></div>
                <div class="speed-import-card">
                  <div class="speed-import-head"><h3>Registros importados</h3><div class="speed-import-actions"><button class="speed-btn speed-btn-primary speed-btn-compact" type="button" data-sync-bfleet-excessos>Sincronizar</button><button class="speed-btn speed-btn-soft speed-btn-compact" type="button" data-refresh-imported-excessos>Atualizar</button></div></div>
                  <p class="speed-hint" data-imported-excess-count>Nenhuma pendência carregada</p>
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
                  <div class="print-status-box"><strong>Como o arquivamento funciona</strong><p>Após a mensagem estar GERADA/COPIADA, o envio do print identifica placa/motorista pelo OCR. Se bater com a pendência, o registro é marcado como NOTIFICADO e sai da lista automaticamente.</p></div>
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

    container.querySelector('[data-sync-bfleet-excessos]')?.addEventListener('click', () => sincronizarRelatorioBFleet(container, opts));
    container.querySelector('[data-refresh-imported-excessos]')?.addEventListener('click', () => fetchImportedExcessos(container, opts));
    container.querySelector('[data-open-veiculos]')?.addEventListener('click', () => window.location.assign(panelUrl('frotas-veiculos')));
    container.querySelector('[data-open-multas]')?.addEventListener('click', () => window.location.assign(panelUrl('frotas-multas')));

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
  window.ADM_MODULES = window.ADM_MODULES || {};
  window.ADM_MODULES.frotas = { mount: renderHome };
})();
