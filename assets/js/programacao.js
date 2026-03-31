
import { initProtectedPage } from './pageInit.js';
import { supabase } from './supabaseClient.js';
import { getCurrentUser } from './auth.js';

const STEPS = [
  { code: 'A', label: 'Disponibilidade' },
  { code: 'B', label: 'Estadia' },
  { code: 'C', label: 'Alimentação' },
  { code: 'D', label: 'Deslocamento' },
  { code: 'E', label: 'Extras' },
];

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function todayIso() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function fieldValue(row, path, fallback = '') {
  return row?.[path] ?? fallback;
}

function buildRowTemplate(item, step) {
  const blocked = !!item.blocked;
  const baseInfo = `
    <div class="prog-colab-main">
      <div>
        <div class="prog-colab-name">${escapeHtml(item.nome)}</div>
        <div class="prog-colab-meta">${escapeHtml(item.cargo || 'Colaborador')} • ${escapeHtml(item.supervisao || '-')}</div>
      </div>
      <span class="status-pill ${blocked ? 'status-cancelado' : 'status-concluido'}">${blocked ? 'Bloqueado' : 'Liberado'}</span>
    </div>
  `;

  if (step === 'A') {
    return `
      <div class="prog-row-content">
        ${baseInfo}
        <div class="prog-fields">
          <label class="prog-check">
            <input type="checkbox" data-field="disponibilidade_marcado" ${fieldValue(item.record, 'disponibilidade_marcado') ? 'checked' : ''} ${blocked ? 'disabled' : ''} />
            <span>Incluir na programação</span>
          </label>
          <div class="field field-span-2">
            <label>Observação</label>
            <input type="text" data-field="disponibilidade_obs" placeholder="Observação da disponibilidade" value="${escapeHtml(fieldValue(item.record, 'disponibilidade_obs'))}" ${blocked ? 'disabled' : ''} />
          </div>
        </div>
      </div>
    `;
  }

  if (step === 'B') {
    return `
      <div class="prog-row-content">
        ${baseInfo}
        <div class="prog-fields">
          <label class="prog-check">
            <input type="checkbox" data-field="estadia_necessaria" ${fieldValue(item.record, 'estadia_necessaria') ? 'checked' : ''} ${blocked ? 'disabled' : ''} />
            <span>Precisa de estadia</span>
          </label>
          <div class="field">
            <label>Cidade / local</label>
            <input type="text" data-field="estadia_local" value="${escapeHtml(fieldValue(item.record, 'estadia_local'))}" ${blocked ? 'disabled' : ''} />
          </div>
          <div class="field">
            <label>Check-in</label>
            <input type="date" data-field="estadia_checkin" value="${escapeHtml(fieldValue(item.record, 'estadia_checkin'))}" ${blocked ? 'disabled' : ''} />
          </div>
          <div class="field">
            <label>Check-out</label>
            <input type="date" data-field="estadia_checkout" value="${escapeHtml(fieldValue(item.record, 'estadia_checkout'))}" ${blocked ? 'disabled' : ''} />
          </div>
          <div class="field field-span-2">
            <label>Observação</label>
            <input type="text" data-field="estadia_obs" value="${escapeHtml(fieldValue(item.record, 'estadia_obs'))}" ${blocked ? 'disabled' : ''} />
          </div>
        </div>
      </div>
    `;
  }

  if (step === 'C') {
    return `
      <div class="prog-row-content">
        ${baseInfo}
        <div class="prog-fields">
          <label class="prog-check">
            <input type="checkbox" data-field="alimentacao_necessaria" ${fieldValue(item.record, 'alimentacao_necessaria') ? 'checked' : ''} ${blocked ? 'disabled' : ''} />
            <span>Precisa de alimentação</span>
          </label>
          <div class="field">
            <label>Tipo</label>
            <select data-field="alimentacao_tipo" ${blocked ? 'disabled' : ''}>
              <option value="">Selecione...</option>
              <option value="cafe" ${fieldValue(item.record, 'alimentacao_tipo') === 'cafe' ? 'selected' : ''}>Café</option>
              <option value="almoco" ${fieldValue(item.record, 'alimentacao_tipo') === 'almoco' ? 'selected' : ''}>Almoço</option>
              <option value="janta" ${fieldValue(item.record, 'alimentacao_tipo') === 'janta' ? 'selected' : ''}>Janta</option>
              <option value="integral" ${fieldValue(item.record, 'alimentacao_tipo') === 'integral' ? 'selected' : ''}>Integral</option>
            </select>
          </div>
          <div class="field field-span-2">
            <label>Observação</label>
            <input type="text" data-field="alimentacao_obs" value="${escapeHtml(fieldValue(item.record, 'alimentacao_obs'))}" ${blocked ? 'disabled' : ''} />
          </div>
        </div>
      </div>
    `;
  }

  if (step === 'D') {
    return `
      <div class="prog-row-content">
        ${baseInfo}
        <div class="prog-fields">
          <label class="prog-check">
            <input type="checkbox" data-field="deslocamento_necessario" ${fieldValue(item.record, 'deslocamento_necessario') ? 'checked' : ''} ${blocked ? 'disabled' : ''} />
            <span>Precisa de deslocamento</span>
          </label>
          <div class="field">
            <label>Origem</label>
            <input type="text" data-field="deslocamento_origem" value="${escapeHtml(fieldValue(item.record, 'deslocamento_origem'))}" ${blocked ? 'disabled' : ''} />
          </div>
          <div class="field">
            <label>Destino</label>
            <input type="text" data-field="deslocamento_destino" value="${escapeHtml(fieldValue(item.record, 'deslocamento_destino'))}" ${blocked ? 'disabled' : ''} />
          </div>
          <div class="field">
            <label>Tipo</label>
            <select data-field="deslocamento_tipo" ${blocked ? 'disabled' : ''}>
              <option value="">Selecione...</option>
              <option value="frota" ${fieldValue(item.record, 'deslocamento_tipo') === 'frota' ? 'selected' : ''}>Frota</option>
              <option value="uber" ${fieldValue(item.record, 'deslocamento_tipo') === 'uber' ? 'selected' : ''}>Uber / Táxi</option>
              <option value="rodoviario" ${fieldValue(item.record, 'deslocamento_tipo') === 'rodoviario' ? 'selected' : ''}>Rodoviário</option>
              <option value="aereo" ${fieldValue(item.record, 'deslocamento_tipo') === 'aereo' ? 'selected' : ''}>Aéreo</option>
            </select>
          </div>
          <div class="field field-span-2">
            <label>Observação</label>
            <input type="text" data-field="deslocamento_obs" value="${escapeHtml(fieldValue(item.record, 'deslocamento_obs'))}" ${blocked ? 'disabled' : ''} />
          </div>
        </div>
      </div>
    `;
  }

  return `
    <div class="prog-row-content">
      ${baseInfo}
      <div class="prog-fields">
        <label class="prog-check">
          <input type="checkbox" data-field="extras_necessario" ${fieldValue(item.record, 'extras_necessario') ? 'checked' : ''} ${blocked ? 'disabled' : ''} />
          <span>Precisa de extra</span>
        </label>
        <div class="field">
          <label>Tipo</label>
          <input type="text" data-field="extras_tipo" value="${escapeHtml(fieldValue(item.record, 'extras_tipo'))}" ${blocked ? 'disabled' : ''} />
        </div>
        <div class="field field-span-2">
          <label>Observação</label>
          <input type="text" data-field="extras_obs" value="${escapeHtml(fieldValue(item.record, 'extras_obs'))}" ${blocked ? 'disabled' : ''} />
        </div>
      </div>
    </div>
  `;
}

initProtectedPage('Programação', (content, userContext) => {
  content.innerHTML = `
    <section class="hero-card">
      <div>
        <div class="eyebrow">Gestor</div>
        <h2>Programação por etapas</h2>
        <p>
          Fluxo fiel ao painel antigo, agora ligado ao Supabase com salvamento automático.
        </p>
      </div>
      <div class="hero-badge-wrap">
        <span class="hero-badge">A → E</span>
      </div>
    </section>

    <section class="card mt-16">
      <div class="section-head">
        <div>
          <h3>Contexto da programação</h3>
          <p class="muted">Selecione a data e a supervisão para carregar os colaboradores.</p>
        </div>
      </div>

      <div class="filters-grid prog-context-grid">
        <div class="field">
          <label for="progDataRef">Data de referência</label>
          <input id="progDataRef" type="date" />
        </div>
        <div class="field">
          <label for="progSup">Supervisão</label>
          <select id="progSup"></select>
        </div>
        <div class="filter-actions prog-filter-actions">
          <button class="btn btn-primary" type="button" id="progLoadContext">Carregar contexto</button>
        </div>
      </div>
      <div class="feedback mt-16" id="progCtxFeedback">Nenhum contexto carregado.</div>
    </section>

    <section class="card mt-16">
      <div class="section-head">
        <div>
          <h3>Etapas</h3>
          <p class="muted">Clique em uma etapa para editar as necessidades daquele grupo.</p>
        </div>
      </div>

      <div class="steps-wrap" id="progSteps">
        ${STEPS.map((step) => `<button type="button" class="stepbtn ${step.code === 'A' ? 'active' : ''}" data-step="${step.code}">${step.code} · ${step.label}</button>`).join('')}
      </div>
    </section>

    <section class="grid-cards mt-16">
      <article class="card">
        <h3>Colaboradores</h3>
        <p class="metric" id="progStatTotal">0</p>
        <p class="muted">Total carregado no contexto.</p>
      </article>
      <article class="card">
        <h3>Bloqueados</h3>
        <p class="metric" id="progStatBlocked">0</p>
        <p class="muted">Colaboradores com indisponibilidade no período.</p>
      </article>
      <article class="card">
        <h3>Etapa atual</h3>
        <p class="metric" id="progCurrentStep">A</p>
        <p class="muted" id="progCurrentStepLabel">Disponibilidade</p>
      </article>
    </section>

    <section class="card mt-16">
      <div class="section-head">
        <div>
          <h3>Lista da etapa</h3>
          <p class="muted">As alterações são salvas automaticamente.</p>
        </div>
      </div>

      <div class="filters-grid prog-context-grid">
        <div class="field field-span-2">
          <label for="progSearch">Buscar colaborador</label>
          <input id="progSearch" type="text" placeholder="Digite nome, cargo ou supervisão..." />
        </div>
      </div>

      <div class="prog-list" id="progList"></div>
    </section>
  `;

  const elements = {
    dataRef: document.getElementById('progDataRef'),
    sup: document.getElementById('progSup'),
    loadBtn: document.getElementById('progLoadContext'),
    feedback: document.getElementById('progCtxFeedback'),
    steps: document.getElementById('progSteps'),
    list: document.getElementById('progList'),
    search: document.getElementById('progSearch'),
    statTotal: document.getElementById('progStatTotal'),
    statBlocked: document.getElementById('progStatBlocked'),
    currentStep: document.getElementById('progCurrentStep'),
    currentStepLabel: document.getElementById('progCurrentStepLabel'),
  };

  const state = {
    currentUser: null,
    currentStep: 'A',
    contextId: null,
    colaboradores: [],
    allRows: [],
    search: '',
    saveTimer: null,
  };

  elements.dataRef.value = todayIso();

  async function init() {
    state.currentUser = await getCurrentUser();
    await fillSupervisoes();
    bindEvents();
  }

  async function fillSupervisoes() {
    elements.sup.innerHTML = '<option value="">Selecione...</option>';

    const { data, error } = await supabase
      .from('colaborador_snapshot')
      .select('supervisao, data_referencia')
      .order('data_referencia', { ascending: false })
      .limit(10000);

    if (error) {
      elements.feedback.textContent = `Erro ao carregar supervisões: ${error.message}`;
      return;
    }

    const supervisoes = [...new Set((data || []).map((r) => String(r.supervisao || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    supervisoes.forEach((sup) => {
      const option = document.createElement('option');
      option.value = sup;
      option.textContent = sup;
      elements.sup.appendChild(option);
    });

    if (supervisoes.length === 1) {
      elements.sup.value = supervisoes[0];
      elements.sup.disabled = true;
    }
  }

  function bindEvents() {
    elements.loadBtn.addEventListener('click', loadContext);
    elements.search.addEventListener('input', () => {
      state.search = elements.search.value.trim().toLowerCase();
      renderRows();
    });
    elements.steps.addEventListener('click', (event) => {
      const button = event.target.closest('[data-step]');
      if (!button) return;
      setStep(button.dataset.step);
    });
    elements.list.addEventListener('change', queueAutoSave);
    elements.list.addEventListener('input', queueAutoSave);
  }

  function setStep(step) {
    state.currentStep = step;
    elements.currentStep.textContent = step;
    elements.currentStepLabel.textContent = (STEPS.find((item) => item.code === step) || {}).label || '';
    [...elements.steps.querySelectorAll('.stepbtn')].forEach((btn) => btn.classList.toggle('active', btn.dataset.step === step));
    renderRows();
  }

  async function getLatestSnapshotDate() {
    const { data, error } = await supabase
      .from('colaborador_importacoes')
      .select('data_referencia')
      .order('data_referencia', { ascending: false })
      .limit(1);

    if (error) throw error;
    return data?.[0]?.data_referencia || null;
  }

  async function ensureContext(dataRef, supervisao) {
    let { data, error } = await supabase
      .from('programacao_contextos')
      .select('*')
      .eq('data_referencia', dataRef)
      .eq('supervisao', supervisao)
      .limit(1)
      .maybeSingle();

    if (error) throw error;

    if (!data) {
      const inserted = await supabase
        .from('programacao_contextos')
        .insert({
          data_referencia: dataRef,
          supervisao,
          created_by: state.currentUser?.id || null,
        })
        .select()
        .single();

      if (inserted.error) throw inserted.error;
      data = inserted.data;
    }

    return data;
  }

  async function loadBlockedCpfSet(dataRef) {
    const { data, error } = await supabase
      .from('indisponibilidades')
      .select('colaborador_cpf, colaborador_nome, data_inicio, data_fim, motivo')
      .lte('data_inicio', dataRef)
      .or(`data_fim.is.null,data_fim.gte.${dataRef}`);

    if (error) throw error;

    const set = new Set();
    (data || []).forEach((row) => {
      const cpf = String(row.colaborador_cpf || '').replace(/\D/g, '');
      if (cpf) set.add(cpf);
    });
    return { set, rows: data || [] };
  }

  async function loadContext() {
    const dataRef = elements.dataRef.value;
    const supervisao = elements.sup.value;

    if (!dataRef || !supervisao) {
      elements.feedback.textContent = 'Selecione a data e a supervisão.';
      return;
    }

    elements.feedback.textContent = 'Carregando contexto...';
    elements.list.innerHTML = '<div class="table-empty">Carregando colaboradores...</div>';

    try {
      const context = await ensureContext(dataRef, supervisao);
      state.contextId = context.id;

      const latestSnapshotDate = await getLatestSnapshotDate();
      if (!latestSnapshotDate) {
        state.colaboradores = [];
        state.allRows = [];
        renderRows();
        elements.feedback.textContent = 'Nenhuma base de colaboradores foi importada ainda.';
        return;
      }

      const { data: colaboradores, error: colaboradoresError } = await supabase
        .from('colaborador_snapshot')
        .select('*')
        .eq('data_referencia', latestSnapshotDate)
        .eq('supervisao', supervisao)
        .order('nome', { ascending: true });

      if (colaboradoresError) throw colaboradoresError;

      const blockedData = await loadBlockedCpfSet(dataRef);

      const { data: registros, error: registrosError } = await supabase
        .from('programacao_itens')
        .select('*')
        .eq('contexto_id', context.id);

      if (registrosError) throw registrosError;

      const byCpf = new Map((registros || []).map((item) => [String(item.colaborador_cpf || '').replace(/\D/g, ''), item]));
      const indisponibilidadeByCpf = new Map((blockedData.rows || []).map((item) => [String(item.colaborador_cpf || '').replace(/\D/g, ''), item]));

      state.colaboradores = (colaboradores || []).map((colab) => {
        const cpf = String(colab.cpf || '').replace(/\D/g, '');
        const indisponibilidade = indisponibilidadeByCpf.get(cpf);
        return {
          nome: colab.nome || 'Colaborador',
          cargo: colab.cargo || '',
          supervisao: colab.supervisao || '',
          cpf,
          blocked: blockedData.set.has(cpf),
          blockReason: indisponibilidade?.motivo || '',
          record: byCpf.get(cpf) || {
            contexto_id: context.id,
            colaborador_nome: colab.nome || '',
            colaborador_cpf: cpf || null,
          },
        };
      });

      state.allRows = [...state.colaboradores];
      updateStats();
      renderRows();
      elements.feedback.textContent = `Contexto carregado com ${state.colaboradores.length} colaboradores.`;
    } catch (error) {
      console.error(error);
      elements.feedback.textContent = error.message || 'Erro ao carregar contexto.';
      elements.list.innerHTML = `<div class="table-empty">${escapeHtml(error.message || 'Erro ao carregar')}</div>`;
    }
  }

  function updateStats() {
    elements.statTotal.textContent = String(state.colaboradores.length);
    elements.statBlocked.textContent = String(state.colaboradores.filter((item) => item.blocked).length);
  }

  function renderRows() {
    if (!state.colaboradores.length) {
      elements.list.innerHTML = '<div class="table-empty">Nenhum colaborador carregado neste contexto.</div>';
      return;
    }

    const filtered = state.colaboradores.filter((item) => {
      if (!state.search) return true;
      const raw = `${item.nome} ${item.cargo || ''} ${item.supervisao || ''}`.toLowerCase();
      return raw.includes(state.search);
    });

    if (!filtered.length) {
      elements.list.innerHTML = '<div class="table-empty">Nenhum colaborador encontrado na busca.</div>';
      return;
    }

    elements.list.innerHTML = filtered.map((item) => `
      <article class="prog-item" data-cpf="${escapeHtml(item.cpf)}">
        ${buildRowTemplate(item, state.currentStep)}
        ${item.blocked ? `<div class="prog-block-note">Motivo da indisponibilidade: ${escapeHtml(item.blockReason || 'Indisponível')}</div>` : ''}
      </article>
    `).join('');
  }

  function queueAutoSave(event) {
    const wrapper = event.target.closest('.prog-item');
    if (!wrapper) return;

    if (state.saveTimer) clearTimeout(state.saveTimer);
    state.saveTimer = setTimeout(() => saveRow(wrapper), 350);
  }

  async function saveRow(wrapper) {
    const cpf = wrapper.dataset.cpf;
    const item = state.colaboradores.find((row) => row.cpf === cpf);
    if (!item) return;

    const payload = { ...item.record };
    wrapper.querySelectorAll('[data-field]').forEach((field) => {
      if (field.type === 'checkbox') {
        payload[field.dataset.field] = !!field.checked;
      } else {
        payload[field.dataset.field] = field.value || null;
      }
    });

    payload.contexto_id = state.contextId;
    payload.colaborador_nome = item.nome;
    payload.colaborador_cpf = cpf || null;
    payload.updated_by = state.currentUser?.id || null;

    const { data, error } = await supabase
      .from('programacao_itens')
      .upsert(payload, { onConflict: 'contexto_id,colaborador_cpf' })
      .select()
      .single();

    if (error) {
      console.error(error);
      elements.feedback.textContent = `Falha ao salvar ${item.nome}: ${error.message}`;
      return;
    }

    item.record = data || payload;
    elements.feedback.textContent = `Salvo automaticamente em ${new Date().toLocaleTimeString('pt-BR')}.`;
  }

  init();
});
