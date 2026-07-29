import { initProtectedPage } from './pageInit.js';
import { supabase } from './supabaseClient.js';

const TABLE = 'compras_notificacoes_config';

const EVENTOS = [
  { value: 'COMPRAS',       label: 'Compras — Solicitação de compra' },
  { value: 'FINANCEIRO',    label: 'Financeiro — Solicitação de pagamento' },
  { value: 'PROGRAMACAO',   label: 'Programação — Nova programação / OS' },
  { value: 'OS',            label: 'OS — Operacional / Ordem de Serviço' },
  { value: 'RH',            label: 'RH — Recursos Humanos' },
  { value: 'LOGISTICA',     label: 'Logística — FOB / Movimentações' },
  { value: 'FROTAS',        label: 'Frotas — Excesso de velocidade / Multas' },
  { value: 'CONFERENCIA',   label: 'Conferência — Painel de Conferência' },
  { value: 'PATRIMONIO',    label: 'Patrimônios — Controle de ativos' },
  { value: 'HOSPEDAGEM',    label: 'Hospedagem — Hotéis / Alojamentos' },
  { value: 'NOTAS_FISCAIS', label: 'Notas Fiscais — Emissão e recebimento' },
  { value: 'TERMOS',        label: 'Termos — Desconto em folha' },
  { value: 'DIRETORIA',     label: 'Diretoria — Aprovações / Alertas gerenciais' },
];

const state = {
  contatos: [],
  loading: false,
  modalOpen: false,
  editId: null,
};

const esc = (v) => String(v ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');

function eventoLabel(setor) {
  return EVENTOS.find(e => e.value === setor)?.label || setor;
}

function getStyles() {
  return `<style id="tic-style">
.tic-wrap{width:100%;color:#e2e2f0}
.tic-hero{background:radial-gradient(ellipse at top left,rgba(34,197,94,.13),transparent 55%),linear-gradient(180deg,rgba(15,23,42,.98),rgba(2,6,23,.98));border:1px solid rgba(148,163,184,.14);border-radius:24px;padding:24px 28px;margin-bottom:20px;display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap}
.tic-hero-left .eyebrow{display:inline-flex;align-items:center;gap:6px;color:#86efac;font-size:11px;font-weight:950;letter-spacing:.14em;text-transform:uppercase;margin-bottom:6px}
.tic-hero-left h2{margin:0;font-size:clamp(20px,2vw,28px);letter-spacing:-.03em;color:#f8fafc}
.tic-hero-left p{margin:6px 0 0;color:#6b7280;font-size:13px;line-height:1.5;max-width:560px}
.tic-stats{display:flex;gap:12px;flex-wrap:wrap}
.tic-stat{background:rgba(15,23,42,.72);border:1px solid rgba(148,163,184,.12);border-radius:16px;padding:12px 18px;text-align:center;min-width:80px}
.tic-stat-val{font-size:22px;font-weight:900;color:#86efac;line-height:1}
.tic-stat-lbl{font-size:11px;color:#6b7280;margin-top:4px;text-transform:uppercase;letter-spacing:.06em}
.tic-toolbar{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:16px}
.tic-search{flex:1;min-width:180px;border:1px solid rgba(148,163,184,.18);background:#0d0d18;color:#e2e2f0;border-radius:14px;padding:11px 14px;outline:none;font-size:14px;color-scheme:dark}
.tic-search:focus{border-color:rgba(34,197,94,.5);box-shadow:0 0 0 3px rgba(34,197,94,.1)}
.tic-btn{border:0;border-radius:12px;padding:11px 16px;font-weight:900;font-size:13px;cursor:pointer;display:inline-flex;align-items:center;gap:7px;transition:.15s ease;min-height:42px}
.tic-btn-primary{background:linear-gradient(135deg,#16a34a,#22c55e);color:#052e16}
.tic-btn-soft{background:rgba(34,197,94,.10);color:#86efac;border:1px solid rgba(34,197,94,.22)}
.tic-btn-danger{background:rgba(239,68,68,.10);color:#fca5a5;border:1px solid rgba(239,68,68,.22)}
.tic-btn-ghost{background:transparent;color:#94a3b8;border:1px solid rgba(148,163,184,.18)}
.tic-btn:disabled{opacity:.5;cursor:not-allowed}
.tic-group{margin-bottom:18px}
.tic-group-head{display:flex;align-items:center;gap:10px;margin-bottom:10px}
.tic-group-label{font-size:11px;font-weight:950;letter-spacing:.12em;text-transform:uppercase;color:#6dffbc;background:rgba(22,101,52,.18);border:1px solid rgba(34,197,94,.2);border-radius:999px;padding:4px 12px}
.tic-group-count{font-size:11px;color:#6b7280}
.tic-cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:10px}
.tic-card{background:rgba(15,23,42,.72);border:1px solid rgba(148,163,184,.12);border-radius:18px;padding:14px 16px;display:flex;flex-direction:column;gap:10px;transition:.15s}
.tic-card:hover{border-color:rgba(34,197,94,.3);background:rgba(22,101,52,.1)}
.tic-card-top{display:flex;align-items:flex-start;justify-content:space-between;gap:8px}
.tic-card-name{font-weight:900;font-size:14px;color:#f8fafc;line-height:1.2}
.tic-card-meta{font-size:12px;color:#6b7280;margin-top:3px}
.tic-card-actions{display:flex;gap:6px;flex-shrink:0}
.tic-card-act{border:0;border-radius:8px;padding:6px 8px;font-size:11px;font-weight:900;cursor:pointer;transition:.12s;background:transparent;color:#94a3b8;border:1px solid rgba(148,163,184,.14)}
.tic-card-act:hover{background:rgba(148,163,184,.1)}
.tic-card-act.danger:hover{background:rgba(239,68,68,.12);color:#fca5a5;border-color:rgba(239,68,68,.22)}
.tic-badge-ativo{display:inline-flex;padding:3px 9px;border-radius:999px;font-size:10px;font-weight:950;background:rgba(22,101,52,.22);border:1px solid rgba(34,197,94,.25);color:#86efac}
.tic-badge-inativo{display:inline-flex;padding:3px 9px;border-radius:999px;font-size:10px;font-weight:950;background:rgba(148,163,184,.08);border:1px solid rgba(148,163,184,.16);color:#6b7280}
.tic-phone{font-family:ui-monospace,Menlo,monospace;font-size:12px;color:#93c5fd;display:flex;align-items:center;gap:5px}
.tic-empty-section{border:1px dashed rgba(148,163,184,.16);border-radius:14px;padding:18px;text-align:center;color:#6b7280;font-size:13px;margin-bottom:18px}
/* Modal */
.tic-overlay{position:fixed;inset:0;background:rgba(0,0,12,.78);z-index:9998;display:flex;align-items:center;justify-content:center;padding:20px;opacity:0;pointer-events:none;transition:.18s ease}
.tic-overlay.open{opacity:1;pointer-events:all}
.tic-modal{width:min(520px,100%);background:#15152a;border:1px solid rgba(255,255,255,.07);border-radius:22px;padding:24px;color:#e2e2f0;box-shadow:0 24px 70px rgba(0,0,0,.4);transform:translateY(8px);transition:.18s ease}
.tic-overlay.open .tic-modal{transform:translateY(0)}
.tic-modal-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:18px}
.tic-modal-head h3{margin:0;font-size:18px;color:#f8fafc}
.tic-field{display:flex;flex-direction:column;gap:7px;margin-bottom:14px}
.tic-field label{font-size:11px;font-weight:900;text-transform:uppercase;letter-spacing:.08em;color:#94a3b8}
.tic-input,.tic-select{width:100%;box-sizing:border-box;border:1px solid rgba(148,163,184,.18);background:#0d0d18;color:#e2e2f0;border-radius:12px;padding:11px 13px;outline:none;font-size:14px;transition:.15s;color-scheme:dark}
.tic-select option{background:#0d0d18}
.tic-input:focus,.tic-select:focus{border-color:rgba(34,197,94,.55);box-shadow:0 0 0 3px rgba(34,197,94,.1)}
.tic-modal-footer{display:flex;gap:10px;justify-content:flex-end;margin-top:20px;flex-wrap:wrap}
.tic-feedback{font-size:12px;font-weight:800;color:#fca5a5;margin-top:10px;min-height:16px}
.tic-toast{position:fixed;right:20px;bottom:20px;background:rgba(22,101,52,.96);color:#dcfce7;border:1px solid rgba(134,239,172,.3);border-radius:14px;padding:12px 16px;font-weight:900;font-size:13px;box-shadow:0 14px 40px rgba(0,0,0,.35);z-index:99999;opacity:0;transform:translateY(8px);pointer-events:none;transition:.2s ease}
.tic-toast.err{background:rgba(127,29,29,.96);color:#fecaca;border-color:rgba(239,68,68,.3)}
.tic-toast.show{opacity:1;transform:translateY(0)}
.tic-colab-results{position:absolute;z-index:20;top:100%;left:0;margin-top:4px;width:100%;max-height:200px;overflow:auto;border:1px solid rgba(34,197,94,.28);border-radius:14px;background:#0d0d18;box-shadow:0 20px 45px rgba(0,0,0,.45)}
.tic-colab-results button{display:block;width:100%;text-align:left;padding:9px 12px;border:0;background:transparent;color:#e2e2f0;cursor:pointer;font-size:12px}
.tic-colab-results button:hover{background:rgba(22,101,52,.3)}
@media(max-width:600px){.tic-hero{flex-direction:column;align-items:flex-start}.tic-cards{grid-template-columns:1fr}}
</style>`;
}

let toastTimer = null;
function toast(msg, type = 'ok') {
  let el = document.querySelector('.tic-toast');
  if (!el) { el = document.createElement('div'); el.className = 'tic-toast'; document.body.appendChild(el); }
  el.textContent = msg;
  el.classList.toggle('err', type === 'err');
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 3200);
}

async function load() {
  state.loading = true;
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .order('setor')
    .order('nome');
  if (error) { toast('Erro ao carregar contatos: ' + error.message, 'err'); state.loading = false; return; }
  state.contatos = data || [];
  state.loading = false;
}

function filterContatos(query) {
  if (!query) return state.contatos;
  const q = query.toLowerCase();
  return state.contatos.filter(c =>
    c.nome?.toLowerCase().includes(q) ||
    c.setor?.toLowerCase().includes(q) ||
    c.telefone?.toLowerCase().includes(q) ||
    eventoLabel(c.setor).toLowerCase().includes(q)
  );
}

function groupBySetor(list) {
  const map = new Map();
  for (const c of list) {
    if (!map.has(c.setor)) map.set(c.setor, []);
    map.get(c.setor).push(c);
  }
  return map;
}

function renderStats(root) {
  const total = state.contatos.length;
  const ativos = state.contatos.filter(c => c.ativo).length;
  const setores = new Set(state.contatos.map(c => c.setor)).size;
  root.querySelector('[data-tic-total]').textContent = total;
  root.querySelector('[data-tic-ativos]').textContent = ativos;
  root.querySelector('[data-tic-setores]').textContent = setores;
}

function renderList(root, query = '') {
  const list = root.querySelector('[data-tic-list]');
  if (!list) return;

  if (state.loading) {
    list.innerHTML = '<div class="tic-empty-section">Carregando contatos...</div>';
    return;
  }

  const filtered = filterContatos(query);
  if (!filtered.length) {
    list.innerHTML = '<div class="tic-empty-section">Nenhum contato encontrado. Clique em <strong>+ Novo contato</strong> para cadastrar.</div>';
    return;
  }

  const grouped = groupBySetor(filtered);
  const html = [];

  for (const [setor, contatos] of grouped) {
    html.push(`
      <div class="tic-group">
        <div class="tic-group-head">
          <span class="tic-group-label">${esc(setor)}</span>
          <span class="tic-group-count">${contatos.length} contato(s)</span>
          <span style="font-size:11px;color:#6b7280;margin-left:4px">— ${esc(eventoLabel(setor))}</span>
        </div>
        <div class="tic-cards">
          ${contatos.map(c => `
            <div class="tic-card" data-tic-card="${esc(c.id)}">
              <div class="tic-card-top">
                <div>
                  <div class="tic-card-name">${esc(c.nome)}</div>
                  <div class="tic-card-meta">${c.empresa ? esc(c.empresa) : ''}${c.cpf ? ' · CPF: ' + esc(c.cpf) : ''}</div>
                </div>
                <div class="tic-card-actions">
                  <button class="tic-card-act" type="button" data-edit="${esc(c.id)}" title="Editar">✏️</button>
                  <button class="tic-card-act danger" type="button" data-delete="${esc(c.id)}" title="Remover">🗑️</button>
                </div>
              </div>
              <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap">
                <span class="tic-phone">📱 ${esc(c.telefone)}</span>
                <button class="tic-btn ${c.ativo ? 'tic-btn-soft' : 'tic-btn-ghost'}" type="button"
                  data-toggle="${esc(c.id)}" data-ativo="${c.ativo}"
                  style="padding:4px 10px;font-size:11px;min-height:unset;border-radius:8px">
                  ${c.ativo ? '<span class="tic-badge-ativo">ATIVO</span>' : '<span class="tic-badge-inativo">INATIVO</span>'}
                </button>
              </div>
            </div>`).join('')}
        </div>
      </div>`);
  }

  list.innerHTML = html.join('');

  list.querySelectorAll('[data-edit]').forEach(btn =>
    btn.addEventListener('click', () => openModal(root, btn.dataset.edit)));
  list.querySelectorAll('[data-delete]').forEach(btn =>
    btn.addEventListener('click', () => confirmDelete(root, btn.dataset.delete)));
  list.querySelectorAll('[data-toggle]').forEach(btn =>
    btn.addEventListener('click', () => toggleAtivo(root, btn.dataset.toggle, btn.dataset.ativo === 'true')));
}

function onlyDigits(v) { return String(v || '').replace(/\D/g, ''); }

async function buscarColaborador(root, termo) {
  const wrap = root.querySelector('[data-tic-colab-results]');
  if (!wrap) return;
  if (!termo || termo.trim().length < 3) { wrap.innerHTML = ''; wrap.style.display = 'none'; return; }
  const { data, error } = await supabase
    .from('colaboradores_atuais')
    .select('nome,cpf,whatsapp')
    .ilike('nome', `%${termo.trim()}%`)
    .limit(8);
  if (error || !data?.length) { wrap.innerHTML = ''; wrap.style.display = 'none'; return; }
  wrap.innerHTML = data.map((c, idx) => `<button type="button" data-colab-idx="${idx}">${esc(c.nome)}</button>`).join('');
  wrap.style.display = 'block';
  wrap.querySelectorAll('[data-colab-idx]').forEach(btn => {
    btn.addEventListener('click', () => {
      const c = data[Number(btn.dataset.colabIdx)];
      root.querySelector('[data-tic-nome]').value = c.nome || '';
      root.querySelector('[data-tic-telefone]').value = onlyDigits(c.whatsapp);
      root.querySelector('[data-tic-cpf]').value = onlyDigits(c.cpf);
      wrap.innerHTML = ''; wrap.style.display = 'none';
      root.querySelector('[data-tic-buscar-colab]').value = '';
    });
  });
}

function openModal(root, editId = null) {
  state.editId = editId;
  const c = editId ? state.contatos.find(x => x.id === editId) : null;

  const overlay = root.querySelector('[data-tic-overlay]');
  overlay.querySelector('[data-tic-modal-title]').textContent = c ? 'Editar contato' : 'Novo contato';
  overlay.querySelector('[data-tic-buscar-colab]').value = '';
  overlay.querySelector('[data-tic-colab-results]').style.display = 'none';
  overlay.querySelector('[data-tic-nome]').value = c?.nome || '';
  overlay.querySelector('[data-tic-telefone]').value = c?.telefone || '';
  overlay.querySelector('[data-tic-cpf]').value = c?.cpf || '';
  overlay.querySelector('[data-tic-empresa]').value = c?.empresa || 'Grao 1000';
  overlay.querySelector('[data-tic-setor]').value = c?.setor || EVENTOS[0].value;
  overlay.querySelector('[data-tic-ativo]').checked = c ? c.ativo : true;
  overlay.querySelector('[data-tic-feedback]').textContent = '';
  overlay.classList.add('open');
  overlay.querySelector('[data-tic-nome]').focus();
}

function closeModal(root) {
  root.querySelector('[data-tic-overlay]').classList.remove('open');
  state.editId = null;
}

async function saveContato(root) {
  const overlay = root.querySelector('[data-tic-overlay]');
  const fb = overlay.querySelector('[data-tic-feedback]');
  const nome = overlay.querySelector('[data-tic-nome]').value.trim();
  const telefone = overlay.querySelector('[data-tic-telefone]').value.trim();
  const setor = overlay.querySelector('[data-tic-setor]').value;

  if (!nome) { fb.textContent = 'Informe o nome do contato.'; return; }
  if (!telefone) { fb.textContent = 'Informe o telefone.'; return; }
  if (!setor) { fb.textContent = 'Selecione o evento/setor.'; return; }

  const payload = {
    nome,
    telefone,
    setor,
    cpf: overlay.querySelector('[data-tic-cpf]').value.trim() || null,
    empresa: overlay.querySelector('[data-tic-empresa]').value.trim() || 'Grao 1000',
    ativo: overlay.querySelector('[data-tic-ativo]').checked,
  };

  const btn = overlay.querySelector('[data-tic-save]');
  btn.disabled = true;
  fb.textContent = '';

  try {
    let error;
    if (state.editId) {
      ({ error } = await supabase.from(TABLE).update(payload).eq('id', state.editId));
    } else {
      ({ error } = await supabase.from(TABLE).insert(payload));
    }
    if (error) throw error;
    closeModal(root);
    toast(state.editId ? 'Contato atualizado.' : 'Contato cadastrado.');
    await load();
    renderStats(root);
    renderList(root, root.querySelector('[data-tic-search]')?.value || '');
  } catch (err) {
    fb.textContent = err.message || 'Erro ao salvar.';
  } finally {
    btn.disabled = false;
  }
}

async function confirmDelete(root, id) {
  const c = state.contatos.find(x => x.id === id);
  if (!c) return;
  if (!confirm(`Remover contato "${c.nome}" do setor ${c.setor}?`)) return;
  const { error } = await supabase.from(TABLE).delete().eq('id', id);
  if (error) { toast('Erro ao remover: ' + error.message, 'err'); return; }
  toast('Contato removido.');
  await load();
  renderStats(root);
  renderList(root, root.querySelector('[data-tic-search]')?.value || '');
}

async function toggleAtivo(root, id, currentAtivo) {
  const { error } = await supabase.from(TABLE).update({ ativo: !currentAtivo }).eq('id', id);
  if (error) { toast('Erro ao atualizar status.', 'err'); return; }
  toast(!currentAtivo ? 'Contato ativado.' : 'Contato desativado.');
  const c = state.contatos.find(x => x.id === id);
  if (c) c.ativo = !currentAtivo;
  renderStats(root);
  renderList(root, root.querySelector('[data-tic-search]')?.value || '');
}

function render(root) {
  root.innerHTML = `${getStyles()}
  <div class="tic-wrap">
    <div class="tic-hero">
      <div class="tic-hero-left">
        <div class="eyebrow">TI · Configuração</div>
        <h2>Contatos de Notificação</h2>
        <p>Defina quem recebe as notificações de cada setor — solicitações de compra, pagamento, programação e demais eventos do sistema. As mensagens são enviadas via BotConversa.</p>
      </div>
      <div class="tic-stats">
        <div class="tic-stat"><div class="tic-stat-val" data-tic-total>0</div><div class="tic-stat-lbl">Total</div></div>
        <div class="tic-stat"><div class="tic-stat-val" data-tic-ativos>0</div><div class="tic-stat-lbl">Ativos</div></div>
        <div class="tic-stat"><div class="tic-stat-val" data-tic-setores>0</div><div class="tic-stat-lbl">Setores</div></div>
      </div>
    </div>

    <div class="tic-toolbar">
      <input class="tic-search" type="search" data-tic-search placeholder="Buscar por nome, setor ou telefone..." autocomplete="off">
      <button class="tic-btn tic-btn-primary" type="button" data-tic-novo>+ Novo contato</button>
    </div>

    <div data-tic-list></div>

    <!-- Modal -->
    <div class="tic-overlay" data-tic-overlay>
      <div class="tic-modal">
        <div class="tic-modal-head">
          <h3 data-tic-modal-title>Novo contato</h3>
          <button class="tic-btn tic-btn-ghost" type="button" data-tic-close style="padding:8px 12px">✕</button>
        </div>

        <div class="tic-field">
          <label>Evento / Setor que recebe notificação</label>
          <select class="tic-select" data-tic-setor>
            ${EVENTOS.map(e => `<option value="${esc(e.value)}">${esc(e.label)}</option>`).join('')}
          </select>
        </div>
        <div class="tic-field" style="position:relative">
          <label>Buscar colaborador pra preencher automaticamente</label>
          <input class="tic-input" data-tic-buscar-colab placeholder="Digite o nome do colaborador" autocomplete="off">
          <div class="tic-colab-results" data-tic-colab-results style="display:none"></div>
        </div>
        <div class="tic-field">
          <label>Nome do responsável</label>
          <input class="tic-input" data-tic-nome placeholder="Ex.: João Silva" autocomplete="off">
        </div>
        <div class="tic-field">
          <label>Telefone (com DDD, sem espaços)</label>
          <input class="tic-input" data-tic-telefone placeholder="Ex.: 554499999999" autocomplete="off">
        </div>
        <div class="tic-field">
          <label>CPF (opcional)</label>
          <input class="tic-input" data-tic-cpf placeholder="000.000.000-00" autocomplete="off">
        </div>
        <div class="tic-field">
          <label>Empresa</label>
          <input class="tic-input" data-tic-empresa value="Grao 1000" autocomplete="off">
        </div>
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;color:#cbd5e1;font-weight:800;font-size:13px;margin-bottom:4px">
          <input type="checkbox" data-tic-ativo checked> Contato ativo (recebe notificações)
        </label>

        <div class="tic-feedback" data-tic-feedback></div>

        <div class="tic-modal-footer">
          <button class="tic-btn tic-btn-ghost" type="button" data-tic-cancel>Cancelar</button>
          <button class="tic-btn tic-btn-primary" type="button" data-tic-save>Salvar</button>
        </div>
      </div>
    </div>
  </div>`;

  root.querySelector('[data-tic-novo]').addEventListener('click', () => openModal(root));
  root.querySelector('[data-tic-close]').addEventListener('click', () => closeModal(root));
  root.querySelector('[data-tic-cancel]').addEventListener('click', () => closeModal(root));
  root.querySelector('[data-tic-overlay]').addEventListener('click', e => { if (e.target === root.querySelector('[data-tic-overlay]')) closeModal(root); });
  root.querySelector('[data-tic-save]').addEventListener('click', () => saveContato(root));
  root.querySelector('[data-tic-search]').addEventListener('input', e => renderList(root, e.target.value));

  let colabDebounce;
  root.querySelector('[data-tic-buscar-colab]').addEventListener('input', e => {
    clearTimeout(colabDebounce);
    const termo = e.target.value;
    colabDebounce = setTimeout(() => buscarColaborador(root, termo), 250);
  });
  document.addEventListener('click', e => {
    const wrap = root.querySelector('[data-tic-colab-results]');
    if (wrap && !wrap.contains(e.target) && e.target !== root.querySelector('[data-tic-buscar-colab]')) wrap.style.display = 'none';
  });
}

export async function renderContent(content) {
  render(content);
  await load();
  renderStats(content);
  renderList(content);
}

initProtectedPage('TI · Contatos de Notificação', renderContent);
