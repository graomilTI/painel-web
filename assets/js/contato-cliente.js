
import { initProtectedPage } from './pageInit.js';
import { supabase } from './supabaseClient.js';
import { getCurrentUser } from './auth.js';

const TABLE = 'contato_cliente_registros';
const BUCKET = 'contato-cliente-anexos';
const KEY = 'cc';

function esc(v) {
  return String(v ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}

function brDate(v) {
  if (!v) return '-';
  const [y, m, d] = String(v).split('-');
  return (d && m && y) ? `${d}/${m}/${y}` : v;
}

function todayIso() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
}

function parseArr(val) {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  try { const p = JSON.parse(val); return Array.isArray(p) ? p : []; } catch { return []; }
}

function injectStyles() {
  if (document.getElementById('cc-module-styles')) return;
  const s = document.createElement('style');
  s.id = 'cc-module-styles';
  s.textContent = `
    .cc-form-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px 20px}
    .cc-form-grid .field-span-2{grid-column:span 2}
    .cc-section-head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;margin-bottom:18px}
    .cc-section-head>div h3{margin:0 0 4px}
    .cc-section-head>div p{margin:0}
    .cc-filters-grid{display:grid;grid-template-columns:1fr 1fr 1fr auto;gap:14px;align-items:end}
    .cc-filter-actions{display:flex;gap:8px}
    .cc-form-actions{margin-top:18px;display:flex;align-items:center;gap:14px}
    .cc-table-wrap{width:100%;overflow:auto;border-radius:16px;border:1px solid rgba(45,212,160,.10);background:rgba(4,13,9,.5)}
    .cc-table{width:100%;border-collapse:collapse;min-width:860px}
    .cc-table th{padding:12px 14px;border-bottom:1px solid rgba(45,212,160,.08);text-align:left;font-size:12px;text-transform:uppercase;letter-spacing:.05em;color:rgba(226,226,240,.60);background:rgba(255,255,255,.014)}
    .cc-table td{padding:12px 14px;border-bottom:1px solid rgba(45,212,160,.07);vertical-align:middle;color:var(--text)}
    .cc-table tr:hover td{background:rgba(45,212,160,.04)}
    .cc-table-empty{text-align:center!important;color:var(--muted);padding:28px!important}
    .cc-row-actions{display:flex;gap:6px}
    .cc-btn-sm{padding:7px 13px;font-size:12px;font-weight:700;border-radius:10px;border:1px solid rgba(45,212,160,.14);background:rgba(4,13,9,.7);color:var(--text);cursor:pointer;font-family:inherit}
    .cc-btn-sm:hover{background:rgba(45,212,160,.10)}
    .cc-btn-danger{border-color:rgba(248,113,113,.22)!important;background:rgba(127,29,29,.25)!important;color:#fecaca!important}
    .cc-btn-danger:hover{background:rgba(127,29,29,.45)!important}
    .cc-participants-wrap{display:flex;flex-direction:column;gap:8px;margin-bottom:8px}
    .cc-participant-row{display:flex;gap:8px;align-items:center}
    .cc-participant-row input{flex:1;padding:12px 14px;border:1px solid rgba(45,212,160,.12)!important;border-radius:14px!important;background:rgba(8,22,17,.58)!important;color:var(--text)!important;outline:none;font:inherit;color-scheme:dark}
    .cc-participant-row input:focus{border-color:rgba(45,212,160,.28)!important;box-shadow:0 0 0 3px rgba(45,212,160,.07)!important}
    .cc-ac-wrap{position:relative;flex:1}
    .cc-ac-drop{display:none;position:absolute;top:calc(100% + 4px);left:0;right:0;z-index:200;list-style:none;margin:0;padding:4px 0;border:1px solid rgba(45,212,160,.22);border-radius:13px;background:#0d0d18;box-shadow:0 8px 28px rgba(0,0,0,.55);max-height:220px;overflow-y:auto}
    .cc-ac-item{padding:9px 14px;cursor:pointer;font-size:13px;color:var(--text);list-style:none}
    .cc-ac-item:hover{background:rgba(45,212,160,.11);color:#b0f0d8}
    .cc-remove-part{width:32px;height:32px;border:1px solid rgba(248,113,113,.22);background:rgba(127,29,29,.20);color:#fecaca;border-radius:9px;cursor:pointer;font-size:18px;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-family:inherit}
    .cc-remove-part:hover{background:rgba(127,29,29,.40)}
    .cc-add-part{background:transparent;border:1px dashed rgba(45,212,160,.30);color:rgba(45,212,160,.75);border-radius:11px;padding:8px 14px;font-size:13px;font-weight:700;cursor:pointer;width:fit-content;font-family:inherit}
    .cc-add-part:hover{border-color:rgba(45,212,160,.55);color:rgba(45,212,160,1);background:rgba(45,212,160,.06)}
    .cc-upload-zone{border:1.5px dashed rgba(45,212,160,.28);border-radius:14px;padding:20px 16px;text-align:center;cursor:default;transition:border-color .18s,background .18s;background:rgba(4,13,9,.4)}
    .cc-upload-zone:hover,.cc-upload-zone.drag-over{border-color:rgba(45,212,160,.55);background:rgba(45,212,160,.06)}
    .cc-upload-zone p{margin:0 0 10px;color:var(--muted);font-size:13px}
    .cc-files-preview{display:flex;flex-wrap:wrap;gap:10px;margin-top:10px}
    .cc-file-item{position:relative;border:1px solid rgba(45,212,160,.14);border-radius:12px;padding:8px;background:rgba(4,13,9,.5);display:flex;flex-direction:column;align-items:center;gap:6px;width:110px}
    .cc-file-item img{width:94px;height:66px;object-fit:cover;border-radius:8px}
    .cc-file-icon{width:94px;height:66px;display:flex;align-items:center;justify-content:center;background:rgba(45,212,160,.08);border-radius:8px;font-size:30px}
    .cc-file-name{font-size:11px;color:var(--muted);word-break:break-all;text-align:center;width:100%}
    .cc-file-remove{position:absolute;top:-6px;right:-6px;width:20px;height:20px;border-radius:50%;background:rgba(127,29,29,.90);color:#fecaca;border:none;cursor:pointer;font-size:13px;display:flex;align-items:center;justify-content:center;line-height:1;font-family:inherit}
    .cc-file-remove:hover{background:rgba(185,28,28,1)}
    .cc-hidden{display:none!important}
    @media(max-width:780px){.cc-form-grid{grid-template-columns:1fr}.cc-form-grid .field-span-2{grid-column:span 1}.cc-filters-grid{grid-template-columns:1fr 1fr}}
  `;
  document.head.appendChild(s);
}

initProtectedPage('Contato Cliente', async (content) => {
  injectStyles();

  content.innerHTML = `
    <section class="hero-card">
      <div>
        <div class="eyebrow">Gestor</div>
        <h2>Contato Cliente</h2>
        <p>Registro de contatos, reuniões e alinhamentos com clientes.</p>
      </div>
      <div class="hero-badge-wrap"><span class="hero-badge">CONTATO</span></div>
    </section>

    <section class="card mt-16">
      <div class="cc-section-head">
        <div>
          <h3 id="${KEY}-form-title">Novo registro</h3>
          <p class="muted">Preencha os dados do contato com o cliente.</p>
        </div>
        <button class="btn btn-secondary cc-hidden" type="button" id="${KEY}-cancel-btn">Cancelar edição</button>
      </div>

      <form id="${KEY}-form">
        <input type="hidden" id="${KEY}-id" />
        <div class="cc-form-grid">

          <div class="field">
            <label for="${KEY}-data_contato">Data</label>
            <input id="${KEY}-data_contato" type="date" required />
          </div>

          <div class="field">
            <label for="${KEY}-cliente">Cliente</label>
            <input id="${KEY}-cliente" type="text" placeholder="Nome do cliente" />
          </div>

          <div class="field field-span-2">
            <label>Participantes Cliente</label>
            <div id="${KEY}-part-cli-wrap" class="cc-participants-wrap"></div>
            <button type="button" id="${KEY}-add-cli" class="cc-add-part">+ Adicionar participante</button>
          </div>

          <div class="field">
            <label for="${KEY}-contato">Contato Cliente</label>
            <input id="${KEY}-contato" type="text" placeholder="Nome / telefone / e-mail" />
          </div>

          <div class="field field-span-2">
            <label>Participantes Grão 1000</label>
            <div id="${KEY}-part-grao-wrap" class="cc-participants-wrap"></div>
            <button type="button" id="${KEY}-add-grao" class="cc-add-part">+ Adicionar participante</button>
          </div>

          <div class="field field-span-2">
            <label for="${KEY}-assunto">Assunto</label>
            <input id="${KEY}-assunto" type="text" placeholder="Tema principal" />
          </div>

          <div class="field field-span-2">
            <label>Anexos</label>
            <div class="cc-upload-zone" id="${KEY}-upload-zone">
              <p>Arraste imagens aqui ou clique para selecionar</p>
              <input type="file" id="${KEY}-file-input" multiple accept="image/*,application/pdf" class="cc-hidden" />
              <button type="button" class="btn btn-secondary" id="${KEY}-pick-files" style="margin:0 auto">Selecionar arquivos</button>
            </div>
            <div id="${KEY}-files-preview" class="cc-files-preview"></div>
          </div>

        </div>

        <div class="cc-form-actions">
          <button class="btn btn-primary" type="submit" id="${KEY}-save-btn" style="min-width:160px;margin-top:0">Salvar</button>
          <span class="feedback" id="${KEY}-feedback"></span>
        </div>
      </form>
    </section>

    <section class="card mt-16">
      <div class="cc-section-head">
        <div>
          <h3>Filtros</h3>
          <p class="muted">Localize registros com rapidez.</p>
        </div>
      </div>
      <form id="${KEY}-filters" class="cc-filters-grid">
        <div class="field" style="margin-top:0">
          <label>Data inicial</label>
          <input id="${KEY}-f-start" type="date" />
        </div>
        <div class="field" style="margin-top:0">
          <label>Data final</label>
          <input id="${KEY}-f-end" type="date" />
        </div>
        <div class="field" style="margin-top:0">
          <label>Busca</label>
          <input id="${KEY}-f-search" type="text" placeholder="Pesquisar..." />
        </div>
        <div class="cc-filter-actions">
          <button class="btn btn-secondary" type="submit">Filtrar</button>
          <button class="btn btn-secondary" type="button" id="${KEY}-f-clear">Limpar</button>
        </div>
      </form>
    </section>

    <section class="card mt-16">
      <div class="cc-section-head">
        <div>
          <h3>Registros</h3>
          <p class="muted">Histórico de contatos com clientes.</p>
        </div>
        <button class="btn btn-secondary" type="button" id="${KEY}-refresh">Atualizar</button>
      </div>
      <div class="cc-table-wrap">
        <table class="cc-table">
          <thead>
            <tr>
              <th>Data</th>
              <th>Cliente</th>
              <th>Participantes Cliente</th>
              <th>Contato Cliente</th>
              <th>Participantes Grão 1000</th>
              <th>Assunto</th>
              <th>Anexos</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody id="${KEY}-tbody">
            <tr><td class="cc-table-empty" colspan="8">Carregando...</td></tr>
          </tbody>
        </table>
      </div>
    </section>
  `;

  const state = {
    editingId: null,
    currentUser: null,
    colaboradores: [],
    rows: [],
    pendingFiles: [],
    existingAnexos: []
  };

  const form = document.getElementById(`${KEY}-form`);
  const tbody = document.getElementById(`${KEY}-tbody`);
  const saveBtn = document.getElementById(`${KEY}-save-btn`);
  const cancelBtn = document.getElementById(`${KEY}-cancel-btn`);
  const formTitle = document.getElementById(`${KEY}-form-title`);
  const feedback = document.getElementById(`${KEY}-feedback`);
  const cliWrap = document.getElementById(`${KEY}-part-cli-wrap`);
  const graoWrap = document.getElementById(`${KEY}-part-grao-wrap`);
  const fileInput = document.getElementById(`${KEY}-file-input`);
  const filesPreview = document.getElementById(`${KEY}-files-preview`);
  const uploadZone = document.getElementById(`${KEY}-upload-zone`);

  async function loadColaboradores() {
    try {
      const { data: latest } = await supabase
        .from('colaborador_importacoes')
        .select('data_referencia')
        .eq('status', 'processado')
        .order('data_referencia', { ascending: false })
        .limit(1)
        .maybeSingle();

      let q = supabase.from('colaborador_snapshot').select('nome').order('nome').limit(3000);
      if (latest?.data_referencia) q = q.eq('data_referencia', latest.data_referencia);
      const { data } = await q;
      state.colaboradores = [...new Set((data || []).map(c => c.nome).filter(Boolean))];
    } catch {}
  }

  function mkParticipantRow(value, isGrao) {
    const row = document.createElement('div');
    row.className = 'cc-participant-row';

    const inp = document.createElement('input');
    inp.type = 'text';
    inp.value = value || '';
    inp.placeholder = isGrao ? 'Nome do colaborador' : 'Nome do participante';
    inp.autocomplete = 'off';

    const rm = document.createElement('button');
    rm.type = 'button';
    rm.className = 'cc-remove-part';
    rm.textContent = '×';
    rm.addEventListener('click', () => row.remove());

    if (isGrao) {
      const acWrap = document.createElement('div');
      acWrap.className = 'cc-ac-wrap';

      const drop = document.createElement('ul');
      drop.className = 'cc-ac-drop';

      inp.addEventListener('input', () => {
        const q = inp.value.trim().toLowerCase();
        if (!q) { drop.style.display = 'none'; return; }
        const matches = state.colaboradores.filter(n => n.toLowerCase().includes(q)).slice(0, 25);
        if (!matches.length) { drop.style.display = 'none'; return; }
        drop.innerHTML = matches.map(n => `<li class="cc-ac-item">${esc(n)}</li>`).join('');
        drop.style.display = 'block';
      });

      inp.addEventListener('blur', () => {
        setTimeout(() => { drop.style.display = 'none'; }, 160);
      });

      drop.addEventListener('mousedown', e => {
        const item = e.target.closest('.cc-ac-item');
        if (!item) return;
        inp.value = item.textContent;
        drop.style.display = 'none';
      });

      acWrap.appendChild(inp);
      acWrap.appendChild(drop);
      row.appendChild(acWrap);
    } else {
      row.appendChild(inp);
    }

    row.appendChild(rm);
    return row;
  }

  function setParticipants(wrap, values, isGrao) {
    wrap.innerHTML = '';
    (values.length ? values : ['']).forEach(v => wrap.appendChild(mkParticipantRow(v, isGrao)));
  }

  function getParticipants(wrap) {
    return Array.from(wrap.querySelectorAll('input')).map(i => i.value.trim()).filter(Boolean);
  }

  document.getElementById(`${KEY}-add-cli`).addEventListener('click', () => {
    cliWrap.appendChild(mkParticipantRow('', false));
    cliWrap.lastElementChild.querySelector('input').focus();
  });

  document.getElementById(`${KEY}-add-grao`).addEventListener('click', () => {
    graoWrap.appendChild(mkParticipantRow('', true));
    graoWrap.lastElementChild.querySelector('input').focus();
  });

  function renderPreview() {
    filesPreview.innerHTML = '';
    const all = [
      ...state.existingAnexos.map(a => ({ ...a, isExisting: true })),
      ...state.pendingFiles.map(f => ({ url: f.dataUrl, name: f.name, isExisting: false }))
    ];
    all.forEach(item => {
      const div = document.createElement('div');
      div.className = 'cc-file-item';
      const isImage = /\.(jpg|jpeg|png|gif|webp|bmp)/i.test(item.name || '');
      if (isImage && item.url) {
        const img = document.createElement('img');
        img.src = item.url;
        img.alt = item.name;
        div.appendChild(img);
      } else {
        const ico = document.createElement('div');
        ico.className = 'cc-file-icon';
        ico.textContent = '📎';
        div.appendChild(ico);
      }
      const nm = document.createElement('span');
      nm.className = 'cc-file-name';
      nm.textContent = item.name;
      div.appendChild(nm);
      const rm = document.createElement('button');
      rm.type = 'button';
      rm.className = 'cc-file-remove';
      rm.textContent = '×';
      rm.title = 'Remover';
      rm.addEventListener('click', () => {
        if (item.isExisting) {
          state.existingAnexos = state.existingAnexos.filter(a => !(a.url === item.url && a.name === item.name));
        } else {
          state.pendingFiles = state.pendingFiles.filter(f => !(f.name === item.name && f.dataUrl === item.url));
        }
        renderPreview();
      });
      div.appendChild(rm);
      filesPreview.appendChild(div);
    });
  }

  function addFiles(files) {
    Array.from(files).forEach(file => {
      const reader = new FileReader();
      reader.onload = e => {
        state.pendingFiles.push({ file, name: file.name, dataUrl: e.target.result });
        renderPreview();
      };
      reader.readAsDataURL(file);
    });
    fileInput.value = '';
  }

  document.getElementById(`${KEY}-pick-files`).addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => addFiles(fileInput.files));
  uploadZone.addEventListener('dragover', e => { e.preventDefault(); uploadZone.classList.add('drag-over'); });
  uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('drag-over'));
  uploadZone.addEventListener('drop', e => {
    e.preventDefault();
    uploadZone.classList.remove('drag-over');
    addFiles(e.dataTransfer.files);
  });

  async function uploadPendingFiles() {
    const uploaded = [];
    for (const f of state.pendingFiles) {
      const ext = f.name.includes('.') ? f.name.split('.').pop() : '';
      const path = `${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
      const { error } = await supabase.storage.from(BUCKET).upload(path, f.file, { upsert: false });
      if (error) throw new Error(`Erro ao enviar "${f.name}": ${error.message}`);
      const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(path);
      uploaded.push({ name: f.name, url: urlData.publicUrl });
    }
    return uploaded;
  }

  function resetForm() {
    state.editingId = null;
    state.pendingFiles = [];
    state.existingAnexos = [];
    document.getElementById(`${KEY}-id`).value = '';
    document.getElementById(`${KEY}-data_contato`).value = todayIso();
    document.getElementById(`${KEY}-cliente`).value = '';
    document.getElementById(`${KEY}-contato`).value = '';
    document.getElementById(`${KEY}-assunto`).value = '';
    setParticipants(cliWrap, [''], false);
    setParticipants(graoWrap, [''], true);
    renderPreview();
    formTitle.textContent = 'Novo registro';
    saveBtn.textContent = 'Salvar';
    cancelBtn.classList.add('cc-hidden');
    feedback.textContent = '';
  }

  function fillForm(row) {
    state.editingId = row.id;
    state.pendingFiles = [];
    state.existingAnexos = parseArr(row.anexos);
    document.getElementById(`${KEY}-id`).value = row.id;
    document.getElementById(`${KEY}-data_contato`).value = row.data_contato || '';
    document.getElementById(`${KEY}-cliente`).value = row.cliente || '';
    document.getElementById(`${KEY}-contato`).value = row.contato || '';
    document.getElementById(`${KEY}-assunto`).value = row.assunto || '';
    const partCli = parseArr(row.participantes_cliente);
    const partGrao = parseArr(row.participantes_grao1000);
    setParticipants(cliWrap, partCli.length ? partCli : [''], false);
    setParticipants(graoWrap, partGrao.length ? partGrao : [''], true);
    renderPreview();
    formTitle.textContent = 'Editando registro';
    saveBtn.textContent = 'Salvar alterações';
    cancelBtn.classList.remove('cc-hidden');
    feedback.textContent = 'Modo edição ativo.';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function renderTable(rows) {
    if (!rows.length) {
      tbody.innerHTML = `<tr><td class="cc-table-empty" colspan="8">Nenhum registro encontrado.</td></tr>`;
      return;
    }
    tbody.innerHTML = rows.map(row => {
      const pCli = parseArr(row.participantes_cliente).join(', ') || '-';
      const pGrao = parseArr(row.participantes_grao1000).join(', ') || '-';
      const nAnexos = parseArr(row.anexos).length;
      return `
        <tr>
          <td>${brDate(row.data_contato)}</td>
          <td>${esc(row.cliente || '-')}</td>
          <td>${esc(pCli)}</td>
          <td>${esc(row.contato || '-')}</td>
          <td>${esc(pGrao)}</td>
          <td>${esc(row.assunto || '-')}</td>
          <td>${nAnexos ? `${nAnexos} arquivo(s)` : '-'}</td>
          <td>
            <div class="cc-row-actions">
              <button class="cc-btn-sm" type="button" data-act="edit" data-id="${esc(row.id)}">Editar</button>
              <button class="cc-btn-sm cc-btn-danger" type="button" data-act="delete" data-id="${esc(row.id)}">Excluir</button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  }

  async function loadRows() {
    const start = document.getElementById(`${KEY}-f-start`).value;
    const end = document.getElementById(`${KEY}-f-end`).value;
    const search = (document.getElementById(`${KEY}-f-search`).value || '').trim().toLowerCase();
    tbody.innerHTML = `<tr><td class="cc-table-empty" colspan="8">Carregando...</td></tr>`;

    let q = supabase.from(TABLE).select('*').order('data_contato', { ascending: false });
    if (start) q = q.gte('data_contato', start);
    if (end) q = q.lte('data_contato', end);

    const { data, error } = await q;
    if (error) {
      tbody.innerHTML = `<tr><td class="cc-table-empty" colspan="8">${esc(error.message)}</td></tr>`;
      return;
    }

    let rows = data || [];
    if (search) {
      rows = rows.filter(row => {
        const txt = [
          row.cliente, row.contato, row.assunto,
          parseArr(row.participantes_cliente).join(' '),
          parseArr(row.participantes_grao1000).join(' ')
        ].join(' ').toLowerCase();
        return txt.includes(search);
      });
    }
    state.rows = rows;
    renderTable(rows);
  }

  form.addEventListener('submit', async e => {
    e.preventDefault();
    feedback.textContent = 'Salvando...';
    saveBtn.disabled = true;
    try {
      const newFiles = await uploadPendingFiles();
      const payload = {
        data_contato: document.getElementById(`${KEY}-data_contato`).value || null,
        cliente: document.getElementById(`${KEY}-cliente`).value.trim() || null,
        contato: document.getElementById(`${KEY}-contato`).value.trim() || null,
        assunto: document.getElementById(`${KEY}-assunto`).value.trim() || null,
        participantes_cliente: getParticipants(cliWrap),
        participantes_grao1000: getParticipants(graoWrap),
        anexos: [...state.existingAnexos, ...newFiles],
        created_by: state.currentUser?.id || null
      };
      let result;
      if (state.editingId) {
        result = await supabase.from(TABLE).update(payload).eq('id', state.editingId);
      } else {
        result = await supabase.from(TABLE).insert(payload);
      }
      if (result.error) throw result.error;
      resetForm();
      feedback.textContent = 'Registro salvo com sucesso.';
      await loadRows();
    } catch (err) {
      feedback.textContent = err.message || 'Erro ao salvar.';
    } finally {
      saveBtn.disabled = false;
    }
  });

  tbody.addEventListener('click', async e => {
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    const row = state.rows.find(r => r.id === btn.dataset.id);
    if (!row) return;
    if (btn.dataset.act === 'edit') {
      fillForm(row);
    } else if (btn.dataset.act === 'delete') {
      if (!confirm('Deseja excluir este registro?')) return;
      const { error } = await supabase.from(TABLE).delete().eq('id', btn.dataset.id);
      if (error) { alert(error.message); return; }
      if (state.editingId === btn.dataset.id) resetForm();
      await loadRows();
    }
  });

  document.getElementById(`${KEY}-filters`).addEventListener('submit', async e => {
    e.preventDefault();
    await loadRows();
  });

  document.getElementById(`${KEY}-f-clear`).addEventListener('click', async () => {
    document.getElementById(`${KEY}-f-start`).value = '';
    document.getElementById(`${KEY}-f-end`).value = '';
    document.getElementById(`${KEY}-f-search`).value = '';
    await loadRows();
  });

  document.getElementById(`${KEY}-refresh`).addEventListener('click', loadRows);
  cancelBtn.addEventListener('click', resetForm);

  state.currentUser = await getCurrentUser();
  resetForm();
  await Promise.all([loadColaboradores(), loadRows()]);
});
