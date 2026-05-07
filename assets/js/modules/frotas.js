/* assets/js/modules/frotas.js */
(function () {
  'use strict';

  const MODULE_NAME = 'FROTAS';
  const PASTA_MAE_DRIVE_ID = '1q5Ba5qqNJEBUZYA8GNRZmXZZsJ8U0YIr';
  const GAS_URL_KEY = 'FROTAS_EXCESSO_VELOCIDADE_GAS_URL';

  const state = {
    records: [{ data: '', velocidade: '' }],
    uploadedFiles: [],
    savedPrints: [],
    lastMessage: '',
    gasUrl: localStorage.getItem(GAS_URL_KEY) || window.FROTAS_CONFIG?.EXCESSO_VELOCIDADE_WEBAPP_URL || '',
    colaboradores: [],
    colaboradoresLoaded: false
  };

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
        .frotas-shell{width:100%;color:#e5e7eb}.frotas-header{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;margin-bottom:18px}.frotas-kicker{display:inline-flex;align-items:center;gap:8px;color:#86efac;font-size:12px;font-weight:900;letter-spacing:.14em;text-transform:uppercase;margin-bottom:8px}.frotas-title{margin:0;font-size:clamp(22px,2.2vw,32px);line-height:1.1;color:#f8fafc;letter-spacing:-.04em}.frotas-subtitle{max-width:860px;margin:10px 0 0;color:#94a3b8;font-size:14px;line-height:1.55}.frotas-card{background:radial-gradient(circle at top left,rgba(34,197,94,.13),transparent 34%),linear-gradient(180deg,rgba(15,23,42,.98),rgba(2,6,23,.98));border:1px solid rgba(148,163,184,.16);border-radius:24px;box-shadow:0 20px 60px rgba(0,0,0,.28);overflow:hidden}.frotas-tabs{display:flex;gap:10px;flex-wrap:wrap;padding:14px;border-bottom:1px solid rgba(148,163,184,.12);background:rgba(2,6,23,.36)}.frotas-tab{appearance:none;border:1px solid rgba(148,163,184,.16);background:rgba(15,23,42,.72);color:#cbd5e1;border-radius:999px;padding:10px 14px;font-weight:900;font-size:13px;cursor:pointer;transition:.18s ease}.frotas-tab.active,.frotas-tab:hover{color:#f8fafc;border-color:rgba(34,197,94,.55);background:rgba(22,101,52,.35)}.frotas-body{padding:18px}.speed-grid{display:grid;grid-template-columns:minmax(300px,450px) minmax(320px,1fr);gap:18px;align-items:start}.speed-panel{background:rgba(15,23,42,.72);border:1px solid rgba(148,163,184,.14);border-radius:22px;padding:18px}.speed-panel h3{margin:0 0 14px;color:#f8fafc;font-size:16px;letter-spacing:-.02em}.speed-field{display:flex;flex-direction:column;gap:7px;margin-bottom:14px}.speed-field label{color:#cbd5e1;font-size:12px;font-weight:900;text-transform:uppercase;letter-spacing:.08em}.speed-input,.speed-select,.speed-textarea{width:100%;border:1px solid rgba(148,163,184,.18);background:#0f172a;color:#e5e7eb;border-radius:14px;padding:12px 13px;outline:none;font-size:14px;transition:.16s ease;color-scheme:dark}.speed-select option{background:#0f172a;color:#e5e7eb}.speed-input:focus,.speed-select:focus,.speed-textarea:focus{border-color:rgba(34,197,94,.68);box-shadow:0 0 0 4px rgba(34,197,94,.10)}.speed-row{display:grid;grid-template-columns:1fr 130px 42px;gap:10px;align-items:end;margin-bottom:10px}.speed-row .speed-field{margin-bottom:0}.speed-btn{border:0;border-radius:14px;padding:12px 14px;font-weight:950;cursor:pointer;transition:.18s ease;display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:44px}.speed-btn-primary{width:100%;background:linear-gradient(135deg,#16a34a,#22c55e);color:#052e16;box-shadow:0 14px 34px rgba(34,197,94,.22)}.speed-btn-primary:hover{transform:translateY(-1px);filter:brightness(1.05)}.speed-btn-primary:disabled{opacity:.55;cursor:not-allowed;transform:none}.speed-btn-soft{background:rgba(34,197,94,.12);color:#86efac;border:1px solid rgba(34,197,94,.24)}.speed-btn-danger{background:rgba(239,68,68,.10);color:#fca5a5;border:1px solid rgba(239,68,68,.20);padding:0;min-width:42px}.speed-actions{display:grid;gap:10px;margin-top:14px}.speed-message{min-height:520px;resize:vertical;line-height:1.55;white-space:pre-wrap}.speed-hint{margin:10px 0 0;color:#94a3b8;font-size:12px;line-height:1.45}.speed-hint code{color:#bbf7d0}.speed-colab-status{margin-top:-6px;color:#86efac;font-size:11px;font-weight:800;line-height:1.35}.speed-divider{height:1px;background:rgba(148,163,184,.14);margin:16px 0}.upload-box{border:1px dashed rgba(34,197,94,.35);border-radius:18px;padding:14px;background:rgba(2,6,23,.28)}.upload-list{display:grid;gap:8px;margin-top:10px}.upload-item{display:flex;justify-content:space-between;gap:10px;align-items:center;border:1px solid rgba(148,163,184,.13);background:rgba(15,23,42,.66);border-radius:14px;padding:10px 12px;color:#cbd5e1;font-size:12px}.upload-item strong{color:#f8fafc}.saved-list{display:grid;gap:8px;margin-top:10px}.saved-item{border:1px solid rgba(34,197,94,.20);background:rgba(22,101,52,.12);border-radius:14px;padding:10px 12px;color:#dcfce7;font-size:12px}.saved-item a{color:#86efac;font-weight:900}.speed-toast{position:fixed;right:22px;bottom:22px;background:rgba(22,101,52,.96);color:#dcfce7;border:1px solid rgba(134,239,172,.32);border-radius:16px;padding:12px 14px;font-weight:900;box-shadow:0 16px 45px rgba(0,0,0,.35);z-index:99999;opacity:0;transform:translateY(10px);pointer-events:none;transition:.2s ease}.speed-toast.show{opacity:1;transform:translateY(0)}@media(max-width:980px){.speed-grid{grid-template-columns:1fr}.speed-row{grid-template-columns:1fr 1fr 42px}}@media(max-width:560px){.frotas-header{display:block}.speed-row{grid-template-columns:1fr}.speed-btn-danger{width:100%}}
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

  function renderColaboradorDatalist(root, opts = {}) {
    const list = root.querySelector('[data-colaborador-datalist]');
    if (!list) return;
    const colaboradores = getColaboradores(opts);
    list.innerHTML = colaboradores.map((c) => {
      const info = [c.tipo, c.supervisao, c.coordenacao].filter(Boolean).join(' · ');
      return `<option value="${escapeHtml(c.nome)}"${info ? ` label="${escapeHtml(info)}"` : ''}></option>`;
    }).join('');

    const status = root.querySelector('[data-colaborador-status]');
    if (status) {
      status.textContent = colaboradores.length
        ? `${colaboradores.length} colaboradores carregados da base.`
        : 'Digite o nome manualmente ou aguarde o carregamento da base.';
    }
  }

  async function loadColaboradoresFromSupabase(root, opts = {}) {
    const fallback = getColaboradores(opts);
    if (fallback.length) {
      state.colaboradores = fallback;
      state.colaboradoresLoaded = true;
      renderColaboradorDatalist(root, opts);
      return;
    }

    const supabase = opts?.supabase || window.supabase;
    if (!supabase || typeof supabase.from !== 'function') {
      renderColaboradorDatalist(root, opts);
      return;
    }

    const status = root.querySelector('[data-colaborador-status]');
    if (status) status.textContent = 'Carregando colaboradores da base...';

    try {
      const { data, error } = await supabase
        .from('colaborador_snapshot')
        .select('id,nome,cpf,tipo,empresa,coordenacao,supervisao,ativo,data_referencia')
        .order('nome', { ascending: true })
        .limit(5000);

      if (error) throw error;

      const rows = Array.isArray(data) ? data : [];
      const latest = rows.reduce((max, row) => row.data_referencia && row.data_referencia > max ? row.data_referencia : max, '');

      state.colaboradores = rows
        .filter((row) => !latest || row.data_referencia === latest)
        .filter((row) => row.ativo !== false)
        .map(mapColaborador)
        .filter((row) => row.nome);

      state.colaboradoresLoaded = true;
      renderColaboradorDatalist(root, opts);
    } catch (err) {
      console.warn('[FROTAS] Não foi possível carregar colaboradores:', err);
      if (status) status.textContent = 'Não foi possível carregar a base agora. Você ainda pode digitar o nome manualmente.';
      renderColaboradorDatalist(root, opts);
    }
  }

  function buildMessage({ nome, placa, registros, cidadeData }) {
    const nomeFinal = normalizeName(nome);
    const placaFinal = onlyPlate(placa);
    const registrosValidos = registros.map((r) => ({ data: formatDateBR(r.data), velocidade: parseSpeed(r.velocidade) })).filter((r) => r.data && r.velocidade);
    const linhas = registrosValidos.map((r) => `* ${r.data} – ${r.velocidade} km/h`).join('\n');
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
      selected.innerHTML = state.uploadedFiles.length ? state.uploadedFiles.map((f) => `<div class="upload-item"><span><strong>${escapeHtml(f.name)}</strong><br>${Math.round(f.size / 1024)} KB</span><span>print</span></div>`).join('') : '';
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
      state.records = [...existing, ...parsedRecords];
      renderRecords(root);
    }

    if (Array.isArray(data.files)) {
      state.savedPrints = [...data.files, ...state.savedPrints];
      renderUploadLists(root);
    }
  }

  function toInputDate(value) {
    const br = formatDateBR(value);
    const m = br.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    return m ? `${m[3]}-${m[2]}-${m[1]}` : '';
  }

  async function uploadPrints(root) {
    const urlInput = root.querySelector('[data-gas-url]');
    const gasUrl = String(urlInput?.value || state.gasUrl || '').trim();
    const nome = root.querySelector('[data-speed-name]')?.value || '';
    const placa = root.querySelector('[data-speed-plate]')?.value || '';
    const dataNotificacao = root.querySelector('[data-notification-date]')?.value || todayBRShort();

    if (!gasUrl) return toast('Informe a URL do Web App do Apps Script.', 'error');
    if (!nome.trim()) return toast('Selecione ou informe o motorista antes de salvar os prints.', 'error');
    if (!state.uploadedFiles.length) return toast('Selecione ao menos um print para enviar.', 'error');

    localStorage.setItem(GAS_URL_KEY, gasUrl);
    state.gasUrl = gasUrl;

    const btn = root.querySelector('[data-upload-prints]');
    if (btn) { btn.disabled = true; btn.textContent = 'Enviando e interpretando...'; }

    try {
      const files = [];
      for (const file of state.uploadedFiles) {
        files.push({ name: file.name, mimeType: file.type || 'image/png', base64: await fileToBase64(file) });
      }

      const resp = await fetch(gasUrl, {
        method: 'POST',
        mode: 'cors',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'upload_excesso_velocidade',
          parentFolderId: PASTA_MAE_DRIVE_ID,
          driverName: normalizeName(nome),
          driverFolderName: sanitizeFolderName(nome),
          plate: onlyPlate(placa),
          notificationDate: formatDateBR(dataNotificacao),
          filePrefixDate: brDateToFilePrefix(dataNotificacao),
          files
        })
      });
      const json = await resp.json();
      if (!json.ok) throw new Error(json.message || 'Falha ao processar prints.');
      applyOcrResult(root, json);
      state.uploadedFiles = [];
      const input = root.querySelector('[data-print-files]');
      if (input) input.value = '';
      renderUploadLists(root);
      toast('Prints salvos no Drive e interpretados com sucesso.');
    } catch (err) {
      console.error('[FROTAS] Upload/OCR:', err);
      toast(err.message || 'Erro ao enviar prints.', 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Enviar prints, interpretar e salvar no Drive'; }
    }
  }

  function renderExcessoVelocidade(container, opts = {}) {
    const colaboradores = getColaboradores(opts);
    container.innerHTML = `${getStyles()}
      <section class="frotas-shell">
        <div class="frotas-header"><div><div class="frotas-kicker">Frotas · Notificações</div><h1 class="frotas-title">Excesso de Velocidade</h1><p class="frotas-subtitle">Gere primeiro a notificação ao colaborador. Depois, em uma etapa separada, anexe os prints do rastreador para salvar na pasta do motorista no Drive.</p></div></div>
        <div class="frotas-card">
          <div class="frotas-tabs"><button class="frotas-tab active" type="button">Excesso de Velocidade</button></div>
          <div class="frotas-body">
            <div class="speed-grid">
              <div class="speed-panel">
                <h3>Dados da notificação</h3>
                <div class="speed-field"><label>Colaborador / Motorista</label><input class="speed-input" type="text" list="frotas-colaborador-list" autocomplete="off" placeholder="Digite para buscar o colaborador" data-speed-name><datalist id="frotas-colaborador-list" data-colaborador-datalist></datalist><p class="speed-colab-status" data-colaborador-status>Carregando colaboradores da base...</p></div>
                <div class="speed-field"><label>Placa do veículo</label><input class="speed-input" type="text" maxlength="8" placeholder="RVQ6J42" data-speed-plate></div>
                <div class="speed-field"><label>Data da notificação</label><input class="speed-input" type="text" value="${escapeHtml(todayBRShort())}" data-notification-date><p class="speed-hint">Usada para renomear os prints: <code>DD-MM-AAAA - Excesso de velocidade...</code></p></div>
                <div class="speed-field"><label>Cidade e data da mensagem</label><input class="speed-input" type="text" value="Cascavel, ${escapeHtml(todayBRLong())}" data-speed-city-date></div>
                <div class="speed-field"><label>Registros de velocidade</label><div data-speed-records></div><button class="speed-btn speed-btn-soft" type="button" data-add-record>+ Adicionar data e velocidade</button></div>
                <div class="speed-actions"><button class="speed-btn speed-btn-primary" type="button" data-generate-speed-message>Gerar ✉️</button><p class="speed-hint">Este botão gera e copia somente a mensagem de notificação. Não depende dos prints.</p></div>
                <div class="speed-divider"></div>
                <h3>Prints do rastreador <span style="color:#94a3b8;font-size:12px;font-weight:800;letter-spacing:0;text-transform:none;">(etapa posterior)</span></h3>
                <div class="upload-box">
                  <div class="speed-field"><label>URL do Web App / Apps Script</label><input class="speed-input" type="url" placeholder="https://script.google.com/macros/s/.../exec" value="${escapeHtml(state.gasUrl)}" data-gas-url><p class="speed-hint">Essa URL é necessária para salvar no Google Drive e usar OCR. A pasta mãe configurada é <code>${PASTA_MAE_DRIVE_ID}</code>.</p></div>
                  <div class="speed-field"><label>Selecionar prints</label><input class="speed-input" type="file" accept="image/*" multiple data-print-files></div>
                  <div data-upload-list class="upload-list"></div>
                  <button class="speed-btn speed-btn-soft" type="button" data-upload-prints>Enviar prints, interpretar e salvar no Drive</button>
                  <p class="speed-hint">Use esta etapa somente depois que o colaborador já foi notificado.</p>
                  <div data-saved-list class="saved-list"></div>
                </div>
              </div>
              <div class="speed-panel"><h3>Mensagem gerada</h3><textarea class="speed-input speed-textarea speed-message" readonly data-speed-output placeholder="A mensagem será gerada aqui e copiada automaticamente."></textarea><p class="speed-hint">Depois de gerar, basta colar no canal de envio ao colaborador.</p></div>
            </div>
          </div>
        </div>
      </section>`;

    renderRecords(container);
    renderUploadLists(container);
    renderColaboradorDatalist(container, opts);
    loadColaboradoresFromSupabase(container, opts);

    const plate = container.querySelector('[data-speed-plate]');
    if (plate) plate.addEventListener('input', () => { plate.value = onlyPlate(plate.value); });

    container.querySelector('[data-add-record]')?.addEventListener('click', () => { syncRecordsFromDom(container); state.records.push({ data: '', velocidade: '' }); renderRecords(container); });
    container.querySelector('[data-print-files]')?.addEventListener('change', (ev) => { state.uploadedFiles = Array.from(ev.target.files || []); renderUploadLists(container); });
    container.querySelector('[data-upload-prints]')?.addEventListener('click', () => uploadPrints(container));
    container.querySelector('[data-generate-speed-message]')?.addEventListener('click', async () => {
      syncRecordsFromDom(container);
      const validation = validateForm(container);
      if (!validation.ok) return toast(validation.message, 'error');
      const message = buildMessage(validation.payload);
      state.lastMessage = message;
      const output = container.querySelector('[data-speed-output]');
      if (output) output.value = message;
      try { await copyText(message); toast('Mensagem gerada e copiada para a área de transferência.'); }
      catch (err) { console.warn('[FROTAS] Falha ao copiar mensagem:', err); toast('Mensagem gerada, mas não foi possível copiar automaticamente.', 'error'); }
    });
  }

  function renderHome(container, opts = {}) { renderExcessoVelocidade(container, opts); }
  window[MODULE_NAME] = window[MODULE_NAME] || {};
  window[MODULE_NAME].openHome = renderHome;
  window.ADM_MODULES = window.ADM_MODULES || {};
  window.ADM_MODULES.frotas = { mount: renderHome };
})();
