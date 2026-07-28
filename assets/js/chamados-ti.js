import { initProtectedPage } from './pageInit.js';
import { supabase } from './supabaseClient.js';

const CATEGORIAS = ['Acesso e Login', 'Erro no Sistema', 'Lentidão', 'Funcionalidade não funciona', 'Dúvida / Como usar', 'Solicitação de acesso a módulo', 'Outro'];

const PRIORIDADE_LABEL = { baixa: 'Baixa', media: 'Média', alta: 'Alta', urgente: 'Urgente' };
const PRIORIDADE_CLASS = { baixa: 'ct-baixa', media: 'ct-media', alta: 'ct-alta', urgente: 'ct-urgente' };
const STATUS_LABEL = { aberto: 'Aberto', em_andamento: 'Em andamento', resolvido: 'Resolvido', cancelado: 'Cancelado' };
const STATUS_CLASS = { aberto: 'ct-aberto', em_andamento: 'ct-andamento', resolvido: 'ct-resolvido', cancelado: 'ct-cancelado' };

function esc(v) {
  return String(v ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}

function fmtDT(iso) {
  if (!iso) return '-';
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function pill(label, cls) {
  return `<span class="ct-pill ${cls}">${esc(label)}</span>`;
}

function injectStyles() {
  if (document.getElementById('ctStyles')) return;
  const s = document.createElement('style');
  s.id = 'ctStyles';
  s.textContent = `
    .ct-wrap{display:grid;gap:18px}
    .ct-hero{border:1px solid rgba(148,163,184,.16);border-radius:24px;padding:22px;background:linear-gradient(135deg,rgba(15,23,42,.96),rgba(22,101,52,.22))}
    .ct-hero h2{margin:0 0 6px;color:#f8fafc;font-size:26px}
    .ct-hero p{margin:0;color:#6b7280;font-size:14px}
    .ct-tabs{display:flex;gap:8px;flex-wrap:wrap}
    .ct-tab{border:1px solid rgba(255,255,255,.08);background:#0d0d18;color:#94a3b8;border-radius:999px;padding:9px 16px;font-size:13px;font-weight:700;cursor:pointer;transition:.15s}
    .ct-tab.active{background:rgba(45,212,160,.15);border-color:rgba(45,212,160,.3);color:#e2e2f0}
    .ct-card{border:1px solid rgba(148,163,184,.12);border-radius:18px;padding:20px;background:rgba(15,23,42,.5)}
    .ct-form-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:14px}
    .ct-form-grid .full{grid-column:1/-1}
    .ct-list{display:grid;gap:10px}
    .ct-item{border:1px solid rgba(255,255,255,.06);border-radius:16px;padding:14px 16px;background:rgba(15,23,42,.55);cursor:pointer;transition:.15s}
    .ct-item:hover{background:rgba(255,255,255,.03)}
    .ct-item-top{display:flex;justify-content:space-between;align-items:flex-start;gap:10px}
    .ct-item-title{font-size:14px;font-weight:800;color:#e2e2f0}
    .ct-item-meta{font-size:12px;color:#64748b;margin-top:4px;display:flex;gap:10px;flex-wrap:wrap}
    .ct-pill{display:inline-flex;align-items:center;padding:3px 9px;border-radius:999px;font-size:11px;font-weight:800;border:1px solid;white-space:nowrap}
    .ct-baixa{background:rgba(100,116,139,.1);color:#cbd5e1;border-color:rgba(100,116,139,.22)}
    .ct-media{background:rgba(59,130,246,.11);color:#bfdbfe;border-color:rgba(59,130,246,.26)}
    .ct-alta{background:rgba(245,158,11,.11);color:#fde68a;border-color:rgba(245,158,11,.28)}
    .ct-urgente{background:rgba(239,68,68,.12);color:#fca5a5;border-color:rgba(239,68,68,.3)}
    .ct-aberto{background:rgba(59,130,246,.11);color:#bfdbfe;border-color:rgba(59,130,246,.26)}
    .ct-andamento{background:rgba(245,158,11,.11);color:#fde68a;border-color:rgba(245,158,11,.28)}
    .ct-resolvido{background:rgba(34,197,94,.12);color:#86efac;border-color:rgba(34,197,94,.3)}
    .ct-cancelado{background:rgba(100,116,139,.1);color:#cbd5e1;border-color:rgba(100,116,139,.22)}
    .ct-empty{padding:32px;text-align:center;color:#475569;font-size:14px}
    .ct-modal-backdrop{position:fixed;inset:0;background:rgba(2,6,12,.7);display:flex;align-items:center;justify-content:center;z-index:200;padding:20px}
    .ct-modal{background:#0d0d18;border:1px solid rgba(148,163,184,.16);border-radius:20px;padding:24px;max-width:640px;width:100%;max-height:86vh;overflow:auto}
    .ct-modal h3{margin:0 0 4px;color:#f8fafc}
    .ct-modal-close{position:absolute;top:16px;right:20px;background:none;border:none;color:#94a3b8;font-size:20px;cursor:pointer}
    .ct-gestor-row{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:16px 0;padding:14px;border:1px solid rgba(255,255,255,.06);border-radius:14px;background:rgba(255,255,255,.02)}
    .ct-comments{display:grid;gap:10px;margin-top:14px}
    .ct-comment{border:1px solid rgba(255,255,255,.06);border-radius:12px;padding:10px 12px;background:rgba(255,255,255,.02)}
    .ct-comment-meta{font-size:11px;color:#64748b;margin-bottom:4px}
  `;
  document.head.appendChild(s);
}

function isGestorTi(userContext) {
  if (userContext?.user?.is_master) return true;
  const role = String(userContext?.user?.role || '').toLowerCase();
  if (['admin', 'adm'].includes(role)) return true;
  return (userContext?.modules || []).some((m) => m.code === 'chamados_ti_gestao');
}

initProtectedPage('Chamados de TI', async (content, userContext) => {
  injectStyles();

  const userId = userContext?.user?.id;
  const userName = userContext?.user?.name || 'Usuário';
  const gestorTi = isGestorTi(userContext);

  content.innerHTML = `
    <div class="ct-wrap">
      <div class="ct-hero">
        <h2>Chamados de TI</h2>
        <p>Abra um chamado para reportar problemas ou tirar dúvidas sobre o painel.</p>
      </div>

      <div class="ct-card">
        <h3 style="margin-top:0">Abrir novo chamado</h3>
        <form id="ctForm" class="ct-form-grid">
          <div>
            <label class="base-label" for="ctCategoria">Categoria</label>
            <select class="base-select" id="ctCategoria" required>
              ${CATEGORIAS.map((c) => `<option value="${esc(c)}">${esc(c)}</option>`).join('')}
            </select>
          </div>
          <div>
            <label class="base-label" for="ctPrioridade">Prioridade</label>
            <select class="base-select" id="ctPrioridade" required>
              <option value="baixa">Baixa</option>
              <option value="media" selected>Média</option>
              <option value="alta">Alta</option>
              <option value="urgente">Urgente</option>
            </select>
          </div>
          <div class="full">
            <label class="base-label" for="ctTitulo">Título</label>
            <input class="base-input" type="text" id="ctTitulo" placeholder="Resuma o problema em poucas palavras" required maxlength="140" />
          </div>
          <div class="full">
            <label class="base-label" for="ctDescricao">Descrição</label>
            <textarea class="base-textarea" id="ctDescricao" placeholder="Descreva o que aconteceu, em qual página/módulo e como reproduzir o problema" required></textarea>
          </div>
          <div class="full" style="display:flex; justify-content:flex-end;">
            <button type="submit" class="base-button primary inline" id="ctSubmitBtn">Abrir chamado</button>
          </div>
        </form>
        <div id="ctFormFeedback" class="base-meta" style="margin-top:10px;"></div>
      </div>

      <div class="ct-tabs" id="ctTabs">
        <button class="ct-tab active" data-tab="meus">Meus chamados</button>
        ${gestorTi ? '<button class="ct-tab" data-tab="todos">Todos os chamados</button>' : ''}
      </div>

      ${gestorTi ? `
      <div class="ct-tabs" id="ctFilters" style="display:none">
        <select class="base-select" id="ctFiltroStatus" style="max-width:180px">
          <option value="">Todos os status</option>
          ${Object.keys(STATUS_LABEL).map((k) => `<option value="${k}">${STATUS_LABEL[k]}</option>`).join('')}
        </select>
        <select class="base-select" id="ctFiltroPrioridade" style="max-width:180px">
          <option value="">Todas as prioridades</option>
          ${Object.keys(PRIORIDADE_LABEL).map((k) => `<option value="${k}">${PRIORIDADE_LABEL[k]}</option>`).join('')}
        </select>
      </div>` : ''}

      <div class="ct-list" id="ctList"></div>
    </div>
  `;

  let currentTab = 'meus';
  let filtroStatus = '';
  let filtroPrioridade = '';
  let cache = [];

  async function loadChamados() {
    const list = document.getElementById('ctList');
    list.innerHTML = '<div class="ct-empty">Carregando...</div>';

    let query = supabase
      .from('chamados_ti')
      .select('*')
      .order('created_at', { ascending: false });

    if (currentTab === 'meus') query = query.eq('solicitante_id', userId);

    const { data, error } = await query;
    if (error) {
      list.innerHTML = `<div class="ct-empty">Erro ao carregar chamados: ${esc(error.message)}</div>`;
      return;
    }

    cache = data || [];
    renderList();
  }

  function renderList() {
    const list = document.getElementById('ctList');
    const items = cache.filter((c) =>
      (!filtroStatus || c.status === filtroStatus) &&
      (!filtroPrioridade || c.prioridade === filtroPrioridade)
    );
    if (!items.length) {
      list.innerHTML = '<div class="ct-empty">Nenhum chamado encontrado.</div>';
      return;
    }

    list.innerHTML = items.map((c) => `
      <div class="ct-item" data-id="${esc(c.id)}">
        <div class="ct-item-top">
          <div>
            <div class="ct-item-title">${esc(c.titulo)}</div>
            <div class="ct-item-meta">
              <span>${esc(c.categoria)}</span>
              <span>${esc(c.solicitante_nome)}</span>
              <span>${fmtDT(c.created_at)}</span>
            </div>
          </div>
          <div style="display:flex; gap:6px; flex-shrink:0;">
            ${pill(PRIORIDADE_LABEL[c.prioridade] || c.prioridade, PRIORIDADE_CLASS[c.prioridade] || 'ct-media')}
            ${pill(STATUS_LABEL[c.status] || c.status, STATUS_CLASS[c.status] || 'ct-aberto')}
          </div>
        </div>
      </div>
    `).join('');

    list.querySelectorAll('[data-id]').forEach((el) => {
      el.addEventListener('click', () => openDetail(el.dataset.id));
    });
  }

  document.getElementById('ctTabs').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-tab]');
    if (!btn) return;
    document.querySelectorAll('#ctTabs .ct-tab').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    currentTab = btn.dataset.tab;
    const filtersRow = document.getElementById('ctFilters');
    if (filtersRow) filtersRow.style.display = currentTab === 'todos' ? 'flex' : 'none';
    loadChamados();
  });

  document.getElementById('ctFiltroStatus')?.addEventListener('change', (e) => {
    filtroStatus = e.target.value;
    renderList();
  });

  document.getElementById('ctFiltroPrioridade')?.addEventListener('change', (e) => {
    filtroPrioridade = e.target.value;
    renderList();
  });

  document.getElementById('ctForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const feedback = document.getElementById('ctFormFeedback');
    const btn = document.getElementById('ctSubmitBtn');
    const payload = {
      categoria: document.getElementById('ctCategoria').value,
      prioridade: document.getElementById('ctPrioridade').value,
      titulo: document.getElementById('ctTitulo').value.trim(),
      descricao: document.getElementById('ctDescricao').value.trim(),
      solicitante_id: userId,
      solicitante_nome: userName,
    };

    btn.disabled = true;
    btn.textContent = 'Enviando...';
    feedback.textContent = '';

    const { error } = await supabase.from('chamados_ti').insert(payload);

    btn.disabled = false;
    btn.textContent = 'Abrir chamado';

    if (error) {
      feedback.textContent = `Erro ao abrir chamado: ${error.message}`;
      return;
    }

    feedback.textContent = 'Chamado aberto com sucesso.';
    document.getElementById('ctForm').reset();
    document.getElementById('ctPrioridade').value = 'media';
    if (currentTab === 'meus') loadChamados();
  });

  async function openDetail(id) {
    const chamado = cache.find((c) => c.id === id);
    if (!chamado) return;

    const { data: comentarios } = await supabase
      .from('chamados_ti_comentarios')
      .select('*')
      .eq('chamado_id', id)
      .order('created_at', { ascending: true });

    const podeGerenciar = gestorTi || chamado.solicitante_id === userId;

    const backdrop = document.createElement('div');
    backdrop.className = 'ct-modal-backdrop';
    backdrop.innerHTML = `
      <div class="ct-modal">
        <button class="ct-modal-close" id="ctModalClose" type="button">&times;</button>
        <h3>${esc(chamado.titulo)}</h3>
        <div class="ct-item-meta" style="margin-bottom:10px;">
          <span>${esc(chamado.categoria)}</span>
          <span>Aberto por ${esc(chamado.solicitante_nome)} em ${fmtDT(chamado.created_at)}</span>
        </div>
        <div style="display:flex; gap:6px; margin-bottom:14px;">
          ${pill(PRIORIDADE_LABEL[chamado.prioridade] || chamado.prioridade, PRIORIDADE_CLASS[chamado.prioridade] || 'ct-media')}
          ${pill(STATUS_LABEL[chamado.status] || chamado.status, STATUS_CLASS[chamado.status] || 'ct-aberto')}
        </div>
        <p style="color:#cbd5e1; white-space:pre-wrap;">${esc(chamado.descricao)}</p>

        ${gestorTi ? `
        <div class="ct-gestor-row">
          <div>
            <label class="base-label" for="ctDetStatus">Status</label>
            <select class="base-select" id="ctDetStatus">
              ${Object.keys(STATUS_LABEL).map((k) => `<option value="${k}" ${k === chamado.status ? 'selected' : ''}>${STATUS_LABEL[k]}</option>`).join('')}
            </select>
          </div>
          <div>
            <label class="base-label" for="ctDetPrioridade">Prioridade</label>
            <select class="base-select" id="ctDetPrioridade">
              ${Object.keys(PRIORIDADE_LABEL).map((k) => `<option value="${k}" ${k === chamado.prioridade ? 'selected' : ''}>${PRIORIDADE_LABEL[k]}</option>`).join('')}
            </select>
          </div>
          <div>
            <label class="base-label" for="ctDetResponsavel">Responsável</label>
            <input class="base-input" type="text" id="ctDetResponsavel" value="${esc(chamado.responsavel_nome || '')}" placeholder="Nome do responsável" />
          </div>
          <div class="full" style="grid-column:1/-1; display:flex; justify-content:flex-end;">
            <button class="base-button primary inline" id="ctDetSalvar" type="button">Salvar alterações</button>
          </div>
        </div>
        <div id="ctDetFeedback" class="base-meta"></div>
        ` : `
        <div class="ct-item-meta" style="margin-top:6px;">Responsável: ${esc(chamado.responsavel_nome || 'Ainda não atribuído')}</div>
        `}

        <div class="ct-comments" id="ctComments">
          <p class="base-label" style="margin-bottom:0;">Histórico de comentários</p>
          ${(comentarios || []).map((cm) => `
            <div class="ct-comment">
              <div class="ct-comment-meta">${esc(cm.autor_nome)} — ${fmtDT(cm.created_at)}</div>
              <div>${esc(cm.mensagem)}</div>
            </div>
          `).join('') || '<div class="ct-item-meta">Nenhum comentário ainda.</div>'}
        </div>

        ${podeGerenciar ? `
        <div style="margin-top:14px; display:flex; gap:10px;">
          <input class="base-input" type="text" id="ctNovoComentario" placeholder="Escreva um comentário..." />
          <button class="base-button secondary inline" id="ctEnviarComentario" type="button" style="min-width:120px;">Enviar</button>
        </div>
        ` : ''}
      </div>
    `;

    document.body.appendChild(backdrop);

    const close = () => backdrop.remove();
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });
    backdrop.querySelector('#ctModalClose').addEventListener('click', close);

    if (gestorTi) {
      backdrop.querySelector('#ctDetSalvar').addEventListener('click', async () => {
        const fb = backdrop.querySelector('#ctDetFeedback');
        const novoStatus = backdrop.querySelector('#ctDetStatus').value;
        const updates = {
          status: novoStatus,
          prioridade: backdrop.querySelector('#ctDetPrioridade').value,
          responsavel_nome: backdrop.querySelector('#ctDetResponsavel').value.trim() || null,
          updated_at: new Date().toISOString(),
        };
        if (novoStatus === 'resolvido' && chamado.status !== 'resolvido') updates.resolvido_em = new Date().toISOString();

        const { error } = await supabase.from('chamados_ti').update(updates).eq('id', chamado.id);
        if (error) {
          fb.textContent = `Erro ao salvar: ${error.message}`;
          return;
        }
        fb.textContent = 'Alterações salvas.';
        close();
        loadChamados();
      });
    }

    const comentarioBtn = backdrop.querySelector('#ctEnviarComentario');
    if (comentarioBtn) {
      comentarioBtn.addEventListener('click', async () => {
        const input = backdrop.querySelector('#ctNovoComentario');
        const mensagem = input.value.trim();
        if (!mensagem) return;

        const { error } = await supabase.from('chamados_ti_comentarios').insert({
          chamado_id: chamado.id,
          autor_id: userId,
          autor_nome: userName,
          mensagem,
        });

        if (!error) {
          input.value = '';
          openDetail(id);
          backdrop.remove();
        }
      });
    }
  }

  await loadChamados();
});
