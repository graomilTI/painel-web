import { initProtectedPage } from './pageInit.js';
import { supabase } from './supabaseClient.js';

// Tela: Conferência · Deslocamento — gerencia a RELAÇÃO DE VEÍCULO PRÓPRIO
// (programacao_veiculo_proprio). É o fallback das caronas: passageiro que não
// pega carona e está nesta relação vai de carro próprio (REEMBOLSO KM); quem
// não está, vai de Uber/Táxi.

const STYLE_ID = 'conf-desloc-styles';
let baseColabs = [];   // { chave, nome, nomeNorm, supervisao }
let lista = [];        // linhas de programacao_veiculo_proprio
let elRoot = null;

function norm(s) {
  return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim().replace(/\s+/g, ' ');
}
function chaveDe(cpf, nome) {
  const c = String(cpf || '').replace(/\D/g, '');
  return c || String(nome || '').trim();
}
function esc(s) {
  return String(s ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

function injectStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const st = document.createElement('style');
  st.id = STYLE_ID;
  st.textContent = `
    .cd-wrap{max-width:880px}
    .cd-head h3{margin:0 0 4px;font-size:18px;color:#f8fafc}
    .cd-head p{margin:0 0 14px;font-size:13px;color:#9fb7aa;line-height:1.4}
    .cd-card{background:rgba(8,22,17,.72);border:1px solid rgba(111,208,165,.16);border-radius:16px;padding:16px;margin-bottom:14px}
    .cd-lbl{font-size:11px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:#6fd0a5;margin-bottom:6px;display:block}
    .cd-input,.cd-area{width:100%;box-sizing:border-box;background:#06130e;color:#eef7f2;border:1px solid rgba(111,208,165,.3);border-radius:10px;padding:10px 12px;font-size:14px;font-family:inherit;outline:none}
    .cd-input:focus,.cd-area:focus{border-color:#6fd0a5}
    .cd-area{min-height:84px;resize:vertical}
    .cd-search{position:relative}
    .cd-dd{position:absolute;left:0;right:0;top:calc(100% + 4px);z-index:30;background:#0c1f17;border:1px solid rgba(111,208,165,.3);border-radius:10px;max-height:280px;overflow:auto;box-shadow:0 14px 38px rgba(0,0,0,.5)}
    .cd-dd[hidden]{display:none}
    .cd-dd-item{padding:9px 12px;cursor:pointer;font-size:13.5px;color:#eef7f2;border-bottom:1px solid rgba(111,208,165,.08)}
    .cd-dd-item:hover{background:rgba(63,168,120,.18)}
    .cd-dd-item small{color:#8ba79a}
    .cd-dd-empty{padding:10px 12px;font-size:13px;color:#8ba79a;font-style:italic}
    .cd-btn{background:rgba(63,168,120,.16);border:1px solid rgba(134,239,172,.4);color:#dcfce7;border-radius:10px;padding:9px 14px;font-size:13px;font-weight:800;cursor:pointer}
    .cd-btn:hover{background:rgba(63,168,120,.3)}
    .cd-btn:disabled{opacity:.6;cursor:not-allowed}
    .cd-row-actions{display:flex;gap:8px;align-items:center;margin-top:10px;flex-wrap:wrap}
    .cd-count{font-size:12.5px;color:#9fb7aa}
    .cd-count b{color:#6fd0a5}
    .cd-table{width:100%;border-collapse:separate;border-spacing:0 6px;margin-top:4px}
    .cd-table td{background:rgba(13,32,24,.6);border-top:1px solid rgba(111,208,165,.12);border-bottom:1px solid rgba(111,208,165,.12);padding:9px 11px;font-size:13px;color:#eef7f2}
    .cd-table td:first-child{border-left:1px solid rgba(111,208,165,.12);border-radius:10px 0 0 10px;font-weight:700}
    .cd-table td:last-child{border-right:1px solid rgba(111,208,165,.12);border-radius:0 10px 10px 0;text-align:right;white-space:nowrap}
    .cd-pill{font-size:11px;font-weight:800;padding:3px 9px;border-radius:999px;cursor:pointer;border:1px solid transparent}
    .cd-pill.on{background:rgba(63,168,120,.18);color:#86efac;border-color:rgba(134,239,172,.4)}
    .cd-pill.off{background:rgba(148,163,184,.14);color:#cbd5e1}
    .cd-del{background:none;border:0;color:#f87171;font-size:13px;font-weight:800;cursor:pointer;margin-left:10px}
    .cd-msg{font-size:12.5px;color:#9fb7aa;margin-top:8px;line-height:1.5}
    .cd-empty{padding:14px;border:1px dashed rgba(111,208,165,.22);border-radius:12px;color:#8ba79a;font-size:13px;text-align:center}
  `;
  document.head.appendChild(st);
}

async function loadBase() {
  const { data, error } = await supabase
    .from('operacional_colaborador_base')
    .select('cpf,nome,supervisao')
    .eq('ativo', true)
    .order('nome')
    .limit(2000);
  if (error) { console.warn('[conf-desloc] base', error); return; }
  baseColabs = (data || []).map((r) => ({
    chave: chaveDe(r.cpf, r.nome),
    nome: r.nome || '',
    nomeNorm: norm(r.nome),
    supervisao: r.supervisao || '',
  }));
}

async function loadLista() {
  const { data, error } = await supabase
    .from('programacao_veiculo_proprio')
    .select('*')
    .order('nome');
  if (error) { console.warn('[conf-desloc] lista', error); lista = []; return; }
  lista = data || [];
}

async function addEntry(chave, nome) {
  if (!chave) return;
  const { error } = await supabase
    .from('programacao_veiculo_proprio')
    .upsert({ colaborador_id: chave, nome: nome || null, ativo: true }, { onConflict: 'colaborador_id' });
  if (error) throw error;
}

function renderLista() {
  const box = elRoot.querySelector('#cdLista');
  const cnt = elRoot.querySelector('#cdCount');
  const ativos = lista.filter((l) => l.ativo).length;
  if (cnt) cnt.innerHTML = `<b>${ativos}</b> ativo(s) · ${lista.length} no total`;
  if (!lista.length) { box.innerHTML = '<div class="cd-empty">Nenhum colaborador na relação ainda. Adicione acima.</div>'; return; }
  box.innerHTML = `<table class="cd-table"><tbody>${lista.map((l) => `
    <tr data-id="${esc(l.id)}">
      <td>${esc(l.nome || l.colaborador_id)}</td>
      <td><span class="cd-pill ${l.ativo ? 'on' : 'off'}" data-toggle>${l.ativo ? 'Ativo' : 'Inativo'}</span></td>
      <td><button class="cd-del" data-del>remover</button></td>
    </tr>`).join('')}</tbody></table>`;
}

async function bulkAdd(text, msgEl) {
  const linhas = String(text || '').split(/[\n;]+/).map((s) => s.trim()).filter(Boolean);
  if (!linhas.length) return;
  const porNome = new Map();
  baseColabs.forEach((c) => { if (!porNome.has(c.nomeNorm)) porNome.set(c.nomeNorm, c); });
  const achados = [];
  const naoAchados = [];
  linhas.forEach((linha) => {
    const c = porNome.get(norm(linha));
    if (c) achados.push(c); else naoAchados.push(linha);
  });
  // dedup por chave
  const vistos = new Set();
  const unicos = achados.filter((c) => (vistos.has(c.chave) ? false : vistos.add(c.chave)));
  if (unicos.length) {
    const payload = unicos.map((c) => ({ colaborador_id: c.chave, nome: c.nome, ativo: true }));
    const { error } = await supabase.from('programacao_veiculo_proprio').upsert(payload, { onConflict: 'colaborador_id' });
    if (error) throw error;
  }
  await loadLista();
  renderLista();
  if (msgEl) {
    msgEl.innerHTML = `Adicionados: <b style="color:#86efac">${unicos.length}</b>.` +
      (naoAchados.length ? ` Não encontrados (confira o nome): ${naoAchados.map(esc).join(', ')}` : '');
  }
}

function wireSearch() {
  const input = elRoot.querySelector('#cdSearch');
  const dd = elRoot.querySelector('#cdDropdown');
  const render = () => {
    const term = norm(input.value);
    if (term.length < 2) { dd.hidden = true; return; }
    const jaTem = new Set(lista.map((l) => String(l.colaborador_id)));
    const res = baseColabs.filter((c) => c.nomeNorm.includes(term)).slice(0, 12);
    if (!res.length) { dd.innerHTML = '<div class="cd-dd-empty">Nenhum colaborador encontrado.</div>'; dd.hidden = false; return; }
    dd.innerHTML = res.map((c) => `<div class="cd-dd-item" data-chave="${esc(c.chave)}" data-nome="${esc(c.nome)}">${esc(c.nome)} ${jaTem.has(c.chave) ? '<small>· já na relação</small>' : `<small>· ${esc(c.supervisao)}</small>`}</div>`).join('');
    dd.hidden = false;
  };
  input.addEventListener('input', render);
  input.addEventListener('focus', render);
  document.addEventListener('click', (e) => { if (!elRoot.querySelector('#cdSearchWrap').contains(e.target)) dd.hidden = true; });
  dd.addEventListener('click', async (e) => {
    const it = e.target.closest('.cd-dd-item');
    if (!it) return;
    dd.hidden = true; input.value = '';
    try {
      await addEntry(it.dataset.chave, it.dataset.nome);
      await loadLista();
      renderLista();
    } catch (err) { alert(err.message || 'Não foi possível adicionar.'); }
  });
}

function wireLista() {
  const box = elRoot.querySelector('#cdLista');
  box.addEventListener('click', async (e) => {
    const tr = e.target.closest('tr[data-id]');
    if (!tr) return;
    const id = tr.dataset.id;
    if (e.target.closest('[data-del]')) {
      if (!confirm('Remover este colaborador da relação?')) return;
      const { error } = await supabase.from('programacao_veiculo_proprio').delete().eq('id', id);
      if (error) { alert(error.message); return; }
      await loadLista(); renderLista();
    } else if (e.target.closest('[data-toggle]')) {
      const atual = lista.find((l) => String(l.id) === String(id));
      const { error } = await supabase.from('programacao_veiculo_proprio').update({ ativo: !atual?.ativo, updated_at: new Date().toISOString() }).eq('id', id);
      if (error) { alert(error.message); return; }
      await loadLista(); renderLista();
    }
  });
}

function renderPage(content) {
  injectStyles();
  elRoot = content;
  content.innerHTML = `
    <div class="cd-wrap">
      <div class="cd-head">
        <h3>Deslocamento — relação de veículo próprio</h3>
        <p>Quem está nesta relação, quando <b>não pega carona</b> na programação, vai de <b>carro próprio</b> (reembolso por km). Quem não está vai de <b>Uber/Táxi</b>. Usada pela sugestão de caronas na Etapa 1 da Programação.</p>
      </div>

      <div class="cd-card">
        <label class="cd-lbl">Adicionar colaborador</label>
        <div class="cd-search" id="cdSearchWrap">
          <input class="cd-input" id="cdSearch" type="text" placeholder="Buscar pelo nome..." autocomplete="off" spellcheck="false" />
          <div class="cd-dd" id="cdDropdown" hidden></div>
        </div>

        <label class="cd-lbl" style="margin-top:14px">Ou colar lista de nomes (um por linha)</label>
        <textarea class="cd-area" id="cdBulk" placeholder="João da Silva&#10;Maria Souza&#10;..."></textarea>
        <div class="cd-row-actions">
          <button class="cd-btn" id="cdBulkBtn" type="button">Adicionar lista</button>
        </div>
        <div class="cd-msg" id="cdBulkMsg"></div>
      </div>

      <div class="cd-card">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <label class="cd-lbl" style="margin:0">Relação atual</label>
          <span class="cd-count" id="cdCount"></span>
        </div>
        <div id="cdLista"><div class="cd-empty">Carregando...</div></div>
      </div>
    </div>
  `;

  wireSearch();
  wireLista();
  const bulkBtn = content.querySelector('#cdBulkBtn');
  bulkBtn.addEventListener('click', async () => {
    bulkBtn.disabled = true;
    try {
      await bulkAdd(content.querySelector('#cdBulk').value, content.querySelector('#cdBulkMsg'));
      content.querySelector('#cdBulk').value = '';
    } catch (err) { alert(err.message || 'Erro ao adicionar a lista.'); }
    finally { bulkBtn.disabled = false; }
  });

  Promise.all([loadBase(), loadLista()]).then(() => renderLista());
}

initProtectedPage('Conferência · Deslocamento', (content) => renderPage(content));
