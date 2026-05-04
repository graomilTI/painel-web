/*
  Módulo: Programação Operacional
  Padrão: window.PROGRAMACAO.openHome(container, { auth, api, onBack })
  Observação: este módulo não usa checkbox "Incluir na programação".
  Todo colaborador retornado no contexto entra automaticamente na programação.
*/
(function () {
  'use strict';

  const MOD = 'PROGRAMACAO';
  const VERSION = '2026-05-04.table-v1';

  const DISPONIBILIDADES = ['OK', 'FÉRIAS', 'FOLGA', 'ATESTADO', 'FALTA', 'TRANSFERIR', 'INATIVO'];
  const TIPOS_ESTADIA = ['NÃO PRECISA', 'CASA', 'PERNOITE', 'ALOJAMENTO', 'HOTEL'];
  const TIPOS_DESLOCAMENTO = ['NÃO PRECISA', 'MOTORISTA FROTA', 'CARONA FROTA', 'UBER/TÁXI', 'REEMBOLSO KM', 'ÔNIBUS', 'OUTRO'];
  const TIPOS_EXTRA = ['ESTADIA', 'RECARGA', 'LAVAGEM', 'MANUTENÇÃO VEÍCULO', 'PEDÁGIO', 'ESTACIONAMENTO', 'MATERIAL', 'OUTRO'];
  const BLOQUEIOS = new Set(['FÉRIAS', 'FOLGA', 'ATESTADO', 'FALTA', 'INATIVO']);

  const STAGES = [
    { id: 'A', label: 'Disponibilidade', short: 'A' },
    { id: 'B', label: 'Estadia', short: 'B' },
    { id: 'C', label: 'Alimentação', short: 'C' },
    { id: 'D', label: 'Deslocamento', short: 'D' },
    { id: 'E', label: 'Extras', short: 'E' },
  ];

  const state = {
    container: null,
    opts: {},
    auth: null,
    api: null,
    stage: 'A',
    search: '',
    loading: false,
    saving: false,
    error: '',
    programacaoId: null,
    dataReferencia: todayISO(),
    coordenacao: '',
    supervisao: '',
    colaboradores: [],
    disponibilidade: new Map(),
    estadia: new Map(),
    alimentacao: new Map(),
    deslocamento: new Map(),
    extras: new Map(),
    timers: new Map(),
  };

  function todayISO() {
    const d = new Date();
    const tz = d.getTimezoneOffset() * 60000;
    return new Date(d.getTime() - tz).toISOString().slice(0, 10);
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>'"]/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
    }[c]));
  }

  function norm(value) {
    return String(value ?? '').trim();
  }

  function keyColab(colab) {
    return String(colab?.colaborador_id || colab?.id || colab?.cpf || colab?.nome || '').trim();
  }

  function parseMoney(value) {
    if (typeof value === 'number') return value;
    const s = String(value ?? '').replace(/\./g, '').replace(',', '.').replace(/[^0-9.-]/g, '');
    const n = Number(s);
    return Number.isFinite(n) ? n : 0;
  }

  function moneyBR(value) {
    const n = Number(value || 0);
    return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  function debounceSave(name, fn, delay = 500) {
    clearTimeout(state.timers.get(name));
    state.timers.set(name, setTimeout(fn, delay));
  }

  async function request(path, options = {}) {
    const api = state.api;
    const method = String(options.method || 'GET').toUpperCase();
    const body = options.body;
    const qs = options.params ? '?' + new URLSearchParams(options.params).toString() : '';
    const url = `${path}${qs}`;

    if (api) {
      if (typeof api.request === 'function') return api.request(url, { method, body });
      if (method === 'GET' && typeof api.get === 'function') return api.get(url, options.params || undefined);
      if (method === 'POST' && typeof api.post === 'function') return api.post(url, body);
      if (method === 'PUT' && typeof api.put === 'function') return api.put(url, body);
      if (method === 'PATCH' && typeof api.patch === 'function') return api.patch(url, body);
    }

    const headers = { 'Content-Type': 'application/json' };
    const token = state.auth?.access_token || state.auth?.session?.access_token || window.__APP_TOKEN__;
    if (token) headers.Authorization = `Bearer ${token}`;

    const res = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      credentials: 'include',
    });

    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch (_) { data = text; }
    if (!res.ok) throw new Error(data?.message || data?.error || `Erro ${res.status} em ${url}`);
    return data;
  }

  function getSupabase() {
    return window.supabaseClient || window.supabase || window._supabase || null;
  }

  async function supabaseFallbackContext() {
    const sb = getSupabase();
    if (!sb?.from) return null;

    let latest = null;
    try {
      const r = await sb.from('colaborador_importacoes')
        .select('data_referencia')
        .eq('status', 'processado')
        .order('data_referencia', { ascending: false })
        .limit(1)
        .maybeSingle();
      latest = r?.data?.data_referencia || null;
    } catch (_) {}

    let q = sb.from('colaborador_snapshot')
      .select('id,nome,cpf,cargo,empresa,coordenacao,supervisao,ativo,data_referencia')
      .eq('ativo', true)
      .order('nome', { ascending: true });

    if (latest) q = q.eq('data_referencia', latest);
    if (state.supervisao) q = q.eq('supervisao', state.supervisao);
    if (state.coordenacao) q = q.eq('coordenacao', state.coordenacao);

    const { data, error } = await q.limit(1200);
    if (error) throw error;
    return { colaboradores: data || [] };
  }

  async function loadContext() {
    setLoading(true, 'Carregando colaboradores...');
    state.error = '';
    try {
      let payload = null;
      try {
        payload = await request('/api/programacao/contexto', {
          params: {
            data_referencia: state.dataReferencia,
            coordenacao: state.coordenacao,
            supervisao: state.supervisao,
          },
        });
      } catch (err) {
        payload = await supabaseFallbackContext();
        if (!payload) throw err;
      }

      state.programacaoId = payload?.programacao?.id || payload?.programacao_id || state.programacaoId;
      state.colaboradores = normalizeColaboradores(payload?.colaboradores || payload?.data || []);
      hydrateStageMaps(payload || {});
      ensureRowsForEveryCollaborator();
      render();
      await ensureProgramacaoDia();
    } catch (err) {
      state.error = err?.message || String(err);
      render();
    } finally {
      setLoading(false);
    }
  }

  function normalizeColaboradores(list) {
    const seen = new Set();
    return (list || [])
      .map((x) => ({
        colaborador_id: x.colaborador_id || x.id || x.cpf || x.nome,
        id: x.colaborador_id || x.id || x.cpf || x.nome,
        cpf: x.cpf || '',
        nome: norm(x.nome || x.funcionario || x.colaborador || x.name).toUpperCase(),
        cargo: norm(x.cargo || x.funcao || ''),
        empresa: norm(x.empresa || ''),
        coordenacao: norm(x.coordenacao || x.coordenação || state.coordenacao || ''),
        supervisao: norm(x.supervisao || x.supervisão || state.supervisao || ''),
        ativo: x.ativo !== false,
      }))
      .filter((x) => {
        const k = keyColab(x);
        if (!k || seen.has(k)) return false;
        seen.add(k);
        return true;
      })
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  }

  function hydrateStageMaps(payload) {
    fillMap(state.disponibilidade, payload.disponibilidade || payload.programacao_colaboradores || [], rowDisponibilidade);
    fillMap(state.estadia, payload.estadia || payload.programacao_estadia || [], rowEstadia);
    fillMap(state.alimentacao, payload.alimentacao || payload.programacao_alimentacao || [], rowAlimentacao);
    fillMap(state.deslocamento, payload.deslocamento || payload.programacao_deslocamento || [], rowDeslocamento);

    state.extras.clear();
    const extras = payload.extras || payload.programacao_extras || [];
    extras.forEach((r) => {
      const id = String(r.colaborador_id || r.colaborador || r.cpf || '');
      if (!state.extras.has(id)) state.extras.set(id, []);
      state.extras.get(id).push(rowExtra(r));
    });
  }

  function fillMap(map, rows, factory) {
    map.clear();
    (rows || []).forEach((r) => {
      const id = String(r.colaborador_id || r.colaborador || r.cpf || '');
      if (id) map.set(id, factory(r));
    });
  }

  function ensureRowsForEveryCollaborator() {
    state.colaboradores.forEach((c) => {
      const id = keyColab(c);
      if (!state.disponibilidade.has(id)) state.disponibilidade.set(id, rowDisponibilidade({ colaborador_id: id }));
      if (!state.estadia.has(id)) state.estadia.set(id, rowEstadia({ colaborador_id: id }));
      if (!state.alimentacao.has(id)) state.alimentacao.set(id, rowAlimentacao({ colaborador_id: id }));
      if (!state.deslocamento.has(id)) state.deslocamento.set(id, rowDeslocamento({ colaborador_id: id }));
      if (!state.extras.has(id)) state.extras.set(id, []);
    });
  }

  function rowDisponibilidade(r = {}) {
    return {
      colaborador_id: String(r.colaborador_id || ''),
      disponibilidade: r.disponibilidade || r.status_disponibilidade || 'OK',
      observacao: r.observacao || r.observacao_disponibilidade || '',
    };
  }

  function rowEstadia(r = {}) {
    return {
      colaborador_id: String(r.colaborador_id || ''),
      tem_estadia: Boolean(r.tem_estadia || (r.tipo_estadia && r.tipo_estadia !== 'NÃO PRECISA')),
      tipo_estadia: r.tipo_estadia || r.tipo || 'NÃO PRECISA',
      cidade: r.cidade || '',
      uf: r.uf || '',
      diarias: Number(r.diarias || 0),
      checkin: r.checkin || r.check_in || '',
      checkout: r.checkout || r.check_out || '',
      observacao: r.observacao || '',
    };
  }

  function rowAlimentacao(r = {}) {
    return {
      colaborador_id: String(r.colaborador_id || ''),
      cafe: Boolean(r.cafe),
      almoco: r.almoco !== false,
      janta: Boolean(r.janta),
      observacao: r.observacao || '',
    };
  }

  function rowDeslocamento(r = {}) {
    return {
      colaborador_id: String(r.colaborador_id || ''),
      tipo_deslocamento: r.tipo_deslocamento || r.tipo || 'NÃO PRECISA',
      origem: r.origem || '',
      destino: r.destino || '',
      km: Number(r.km || 0),
      valor: Number(r.valor || 0),
      observacao: r.observacao || '',
    };
  }

  function rowExtra(r = {}) {
    return {
      id: r.id || `tmp_${Date.now()}_${Math.random().toString(16).slice(2)}`,
      colaborador_id: String(r.colaborador_id || ''),
      tipo_despesa: r.tipo_despesa || r.tipo || 'OUTRO',
      descricao: r.descricao || '',
      valor: Number(r.valor || 0),
      observacao: r.observacao || '',
      _deleted: false,
    };
  }

  async function ensureProgramacaoDia() {
    if (state.programacaoId) return state.programacaoId;
    try {
      const resp = await request('/api/programacao/dia', {
        method: 'POST',
        body: {
          data_referencia: state.dataReferencia,
          coordenacao: state.coordenacao,
          supervisao: state.supervisao,
          status: 'rascunho',
        },
      });
      state.programacaoId = resp?.id || resp?.programacao?.id || resp?.programacao_id || state.programacaoId;
    } catch (_) {
      // O fallback permite a tela funcionar para edição local enquanto a API é ajustada.
    }
    return state.programacaoId;
  }

  function basePayload(colab) {
    return {
      programacao_id: state.programacaoId,
      data_referencia: state.dataReferencia,
      colaborador_id: keyColab(colab),
      nome_colaborador: colab.nome,
      cargo: colab.cargo,
      coordenacao: colab.coordenacao || state.coordenacao,
      supervisao: colab.supervisao || state.supervisao,
    };
  }

  async function saveStage(stage, colab, row) {
    state.saving = true;
    updateSaveStatus();
    try {
      await ensureProgramacaoDia();
      const payload = { ...basePayload(colab), ...row };
      const paths = {
        A: '/api/programacao/disponibilidade',
        B: '/api/programacao/estadia',
        C: '/api/programacao/alimentacao',
        D: '/api/programacao/deslocamento',
        E: '/api/programacao/extras',
      };
      await request(paths[stage], { method: 'POST', body: payload });
    } catch (err) {
      console.warn(`[${MOD}] Falha ao salvar etapa ${stage}:`, err);
      toast(`Não consegui salvar automaticamente: ${err.message || err}`, 'warn');
    } finally {
      state.saving = false;
      updateSaveStatus();
    }
  }

  async function deleteExtra(colab, extra) {
    extra._deleted = true;
    renderStage();
    try {
      if (extra.id && !String(extra.id).startsWith('tmp_')) {
        await request('/api/programacao/extras/delete', { method: 'POST', body: { id: extra.id, programacao_id: state.programacaoId } });
      }
    } catch (err) {
      toast(`Não consegui excluir no servidor: ${err.message || err}`, 'warn');
    }
  }

  function filteredColaboradores() {
    const q = state.search.trim().toLowerCase();
    if (!q) return state.colaboradores;
    return state.colaboradores.filter((c) => [c.nome, c.cargo, c.supervisao, c.coordenacao, c.cpf].join(' ').toLowerCase().includes(q));
  }

  function isBloqueado(colab) {
    const row = state.disponibilidade.get(keyColab(colab));
    return BLOQUEIOS.has(row?.disponibilidade);
  }

  function setLoading(value, label = '') {
    state.loading = value;
    const el = state.container?.querySelector('[data-loading-label]');
    if (el) el.textContent = label || '';
  }

  function updateSaveStatus() {
    const el = state.container?.querySelector('[data-save-status]');
    if (el) el.textContent = state.saving ? 'Salvando...' : 'Alterações salvas automaticamente';
  }

  function render() {
    if (!state.container) return;
    injectStyles();
    state.container.innerHTML = `
      <section class="prog-page">
        <header class="prog-header">
          <div>
            <div class="prog-eyebrow">Gestor • Programação operacional</div>
            <h1>Programação</h1>
            <p>Todos os colaboradores da regional entram automaticamente. Edite as necessidades em formato de tabela.</p>
          </div>
          <div class="prog-header-actions">
            <span class="prog-pill">${escapeHtml(VERSION)}</span>
            <span class="prog-save" data-save-status>Alterações salvas automaticamente</span>
          </div>
        </header>

        <div class="prog-toolbar">
          <label>
            <span>Data de referência</span>
            <input type="date" data-field="dataReferencia" value="${escapeHtml(state.dataReferencia)}">
          </label>
          <label>
            <span>Coordenação</span>
            <input type="text" data-field="coordenacao" value="${escapeHtml(state.coordenacao)}" placeholder="Todas">
          </label>
          <label>
            <span>Supervisão / Regional</span>
            <input type="text" data-field="supervisao" value="${escapeHtml(state.supervisao)}" placeholder="Todas">
          </label>
          <button class="prog-btn primary" data-action="reload">Carregar</button>
        </div>

        ${state.error ? `<div class="prog-alert">${escapeHtml(state.error)}</div>` : ''}

        <div class="prog-tabs" role="tablist">
          ${STAGES.map((s) => `
            <button class="prog-tab ${state.stage === s.id ? 'active' : ''}" data-stage="${s.id}">
              <strong>${s.short}</strong> ${s.label}
            </button>
          `).join('')}
        </div>

        <div class="prog-kpis">
          <article><span>Colaboradores</span><strong>${state.colaboradores.length}</strong><small>Total carregado no contexto</small></article>
          <article><span>Bloqueados</span><strong>${state.colaboradores.filter(isBloqueado).length}</strong><small>Férias, folga, atestado, falta ou inativo</small></article>
          <article><span>Etapa atual</span><strong>${state.stage}</strong><small>${escapeHtml(STAGES.find(s => s.id === state.stage)?.label || '')}</small></article>
        </div>

        <section class="prog-card">
          <div class="prog-list-head">
            <div>
              <h2>Lista da etapa</h2>
              <p data-loading-label>${state.loading ? 'Carregando...' : 'Edite direto na tabela. O salvamento é automático.'}</p>
            </div>
            <label class="prog-search">
              <span>Buscar colaborador</span>
              <input type="search" data-action="search" value="${escapeHtml(state.search)}" placeholder="Digite nome, cargo ou supervisão...">
            </label>
          </div>
          <div data-stage-container></div>
        </section>
      </section>
    `;
    bindGlobalEvents();
    renderStage();
  }

  function renderStage() {
    const host = state.container?.querySelector('[data-stage-container]');
    if (!host) return;
    const rows = filteredColaboradores();
    if (state.loading) {
      host.innerHTML = `<div class="prog-empty">Carregando colaboradores...</div>`;
      return;
    }
    if (!rows.length) {
      host.innerHTML = `<div class="prog-empty">Nenhum colaborador encontrado para este contexto.</div>`;
      return;
    }
    if (state.stage === 'A') host.innerHTML = renderDisponibilidade(rows);
    if (state.stage === 'B') host.innerHTML = renderEstadia(rows);
    if (state.stage === 'C') host.innerHTML = renderAlimentacao(rows);
    if (state.stage === 'D') host.innerHTML = renderDeslocamento(rows);
    if (state.stage === 'E') host.innerHTML = renderExtras(rows);
    bindStageEvents();
  }

  function colabCell(c) {
    const disp = state.disponibilidade.get(keyColab(c))?.disponibilidade || 'OK';
    const blocked = BLOQUEIOS.has(disp);
    return `
      <div class="prog-colab">
        <strong>${escapeHtml(c.nome)}</strong>
        <span>${escapeHtml([c.cargo, c.supervisao].filter(Boolean).join(' • '))}</span>
        ${blocked ? `<em class="prog-badge danger">${escapeHtml(disp)}</em>` : `<em class="prog-badge ok">Liberado</em>`}
      </div>
    `;
  }

  function options(list, selected) {
    return list.map((x) => `<option value="${escapeHtml(x)}" ${x === selected ? 'selected' : ''}>${escapeHtml(x)}</option>`).join('');
  }

  function renderDisponibilidade(rows) {
    return `
      <div class="prog-table-wrap"><table class="prog-table">
        <thead><tr><th>Colaborador</th><th>Disponibilidade</th><th>Observação</th></tr></thead>
        <tbody>${rows.map((c) => {
          const id = keyColab(c); const r = state.disponibilidade.get(id);
          return `<tr data-colab="${escapeHtml(id)}">
            <td>${colabCell(c)}</td>
            <td><select data-step="A" data-name="disponibilidade">${options(DISPONIBILIDADES, r?.disponibilidade || 'OK')}</select></td>
            <td><input data-step="A" data-name="observacao" value="${escapeHtml(r?.observacao || '')}" placeholder="Observação da disponibilidade"></td>
          </tr>`;
        }).join('')}</tbody>
      </table></div>
    `;
  }

  function renderEstadia(rows) {
    return `
      <div class="prog-table-wrap"><table class="prog-table wide">
        <thead><tr><th>Colaborador</th><th>Estadia</th><th>Tipo</th><th>Cidade</th><th>UF</th><th>Diárias</th><th>Check-in</th><th>Check-out</th><th>Observação</th></tr></thead>
        <tbody>${rows.map((c) => {
          const id = keyColab(c); const r = state.estadia.get(id); const disabled = isBloqueado(c) ? 'disabled' : '';
          return `<tr data-colab="${escapeHtml(id)}" class="${disabled ? 'muted' : ''}">
            <td>${colabCell(c)}</td>
            <td class="center"><input type="checkbox" data-step="B" data-name="tem_estadia" ${r?.tem_estadia ? 'checked' : ''} ${disabled}></td>
            <td><select data-step="B" data-name="tipo_estadia" ${disabled}>${options(TIPOS_ESTADIA, r?.tipo_estadia || 'NÃO PRECISA')}</select></td>
            <td><input data-step="B" data-name="cidade" value="${escapeHtml(r?.cidade || '')}" placeholder="Cidade" ${disabled}></td>
            <td><input class="uf" data-step="B" data-name="uf" value="${escapeHtml(r?.uf || '')}" maxlength="2" placeholder="UF" ${disabled}></td>
            <td><input type="number" min="0" step="1" data-step="B" data-name="diarias" value="${escapeHtml(r?.diarias || 0)}" ${disabled}></td>
            <td><input type="date" data-step="B" data-name="checkin" value="${escapeHtml(r?.checkin || '')}" ${disabled}></td>
            <td><input type="date" data-step="B" data-name="checkout" value="${escapeHtml(r?.checkout || '')}" ${disabled}></td>
            <td><input data-step="B" data-name="observacao" value="${escapeHtml(r?.observacao || '')}" placeholder="Observação" ${disabled}></td>
          </tr>`;
        }).join('')}</tbody>
      </table></div>
    `;
  }

  function renderAlimentacao(rows) {
    return `
      <div class="prog-table-wrap"><table class="prog-table">
        <thead><tr><th>Colaborador</th><th>Café</th><th>Almoço</th><th>Janta</th><th>Observação</th></tr></thead>
        <tbody>${rows.map((c) => {
          const id = keyColab(c); const r = state.alimentacao.get(id); const disabled = isBloqueado(c) ? 'disabled' : '';
          return `<tr data-colab="${escapeHtml(id)}" class="${disabled ? 'muted' : ''}">
            <td>${colabCell(c)}</td>
            <td class="center"><input type="checkbox" data-step="C" data-name="cafe" ${r?.cafe ? 'checked' : ''} ${disabled}></td>
            <td class="center"><input type="checkbox" data-step="C" data-name="almoco" ${r?.almoco ? 'checked' : ''} ${disabled}></td>
            <td class="center"><input type="checkbox" data-step="C" data-name="janta" ${r?.janta ? 'checked' : ''} ${disabled}></td>
            <td><input data-step="C" data-name="observacao" value="${escapeHtml(r?.observacao || '')}" placeholder="Observação" ${disabled}></td>
          </tr>`;
        }).join('')}</tbody>
      </table></div>
    `;
  }

  function renderDeslocamento(rows) {
    return `
      <div class="prog-table-wrap"><table class="prog-table wide">
        <thead><tr><th>Colaborador</th><th>Deslocamento</th><th>Origem</th><th>Destino</th><th>KM</th><th>Valor</th><th>Observação</th></tr></thead>
        <tbody>${rows.map((c) => {
          const id = keyColab(c); const r = state.deslocamento.get(id); const disabled = isBloqueado(c) ? 'disabled' : '';
          return `<tr data-colab="${escapeHtml(id)}" class="${disabled ? 'muted' : ''}">
            <td>${colabCell(c)}</td>
            <td><select data-step="D" data-name="tipo_deslocamento" ${disabled}>${options(TIPOS_DESLOCAMENTO, r?.tipo_deslocamento || 'NÃO PRECISA')}</select></td>
            <td><input data-step="D" data-name="origem" value="${escapeHtml(r?.origem || '')}" placeholder="Origem" ${disabled}></td>
            <td><input data-step="D" data-name="destino" value="${escapeHtml(r?.destino || '')}" placeholder="Destino" ${disabled}></td>
            <td><input type="number" min="0" step="0.01" data-step="D" data-name="km" value="${escapeHtml(r?.km || 0)}" ${disabled}></td>
            <td><input type="text" data-step="D" data-name="valor" value="${escapeHtml(r?.valor ? moneyBR(r.valor) : '')}" placeholder="R$ 0,00" ${disabled}></td>
            <td><input data-step="D" data-name="observacao" value="${escapeHtml(r?.observacao || '')}" placeholder="Observação" ${disabled}></td>
          </tr>`;
        }).join('')}</tbody>
      </table></div>
    `;
  }

  function renderExtras(rows) {
    return `
      <div class="prog-table-wrap"><table class="prog-table extra-table">
        <thead><tr><th>Colaborador</th><th>Extras</th></tr></thead>
        <tbody>${rows.map((c) => {
          const id = keyColab(c); const extras = (state.extras.get(id) || []).filter(e => !e._deleted); const disabled = isBloqueado(c);
          return `<tr data-colab="${escapeHtml(id)}" class="${disabled ? 'muted' : ''}">
            <td>${colabCell(c)}<button class="prog-btn mini" data-extra-add ${disabled ? 'disabled' : ''}>+ Adicionar extra</button></td>
            <td>
              <div class="extras-list">
                ${extras.length ? extras.map((e) => renderExtraLine(e, disabled)).join('') : '<span class="prog-muted-text">Nenhuma despesa extra.</span>'}
              </div>
            </td>
          </tr>`;
        }).join('')}</tbody>
      </table></div>
    `;
  }

  function renderExtraLine(e, disabled) {
    return `<div class="extra-line" data-extra-id="${escapeHtml(e.id)}">
      <select data-step="E" data-name="tipo_despesa" ${disabled ? 'disabled' : ''}>${options(TIPOS_EXTRA, e.tipo_despesa || 'OUTRO')}</select>
      <input data-step="E" data-name="descricao" value="${escapeHtml(e.descricao || '')}" placeholder="Descrição" ${disabled ? 'disabled' : ''}>
      <input data-step="E" data-name="valor" value="${escapeHtml(e.valor ? moneyBR(e.valor) : '')}" placeholder="Valor" ${disabled ? 'disabled' : ''}>
      <input data-step="E" data-name="observacao" value="${escapeHtml(e.observacao || '')}" placeholder="Observação" ${disabled ? 'disabled' : ''}>
      <button class="prog-icon-btn" title="Remover extra" data-extra-remove ${disabled ? 'disabled' : ''}>×</button>
    </div>`;
  }

  function bindGlobalEvents() {
    state.container.querySelectorAll('[data-stage]').forEach((btn) => {
      btn.addEventListener('click', () => { state.stage = btn.dataset.stage; render(); });
    });
    state.container.querySelector('[data-action="reload"]')?.addEventListener('click', loadContext);
    state.container.querySelector('[data-action="search"]')?.addEventListener('input', (ev) => {
      state.search = ev.target.value;
      renderStage();
    });
    state.container.querySelectorAll('[data-field]').forEach((input) => {
      input.addEventListener('change', () => {
        state[input.dataset.field] = input.value;
        state.programacaoId = null;
        loadContext();
      });
    });
  }

  function bindStageEvents() {
    state.container.querySelectorAll('[data-step]').forEach((el) => {
      const eventName = el.tagName === 'SELECT' || el.type === 'checkbox' || el.type === 'date' ? 'change' : 'input';
      el.addEventListener(eventName, onCellChange);
      if (el.dataset.name === 'valor') {
        el.addEventListener('blur', () => { el.value = parseMoney(el.value) ? moneyBR(parseMoney(el.value)) : ''; });
      }
    });

    state.container.querySelectorAll('[data-extra-add]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const tr = btn.closest('tr[data-colab]');
        const colab = findColab(tr.dataset.colab);
        if (!colab) return;
        const id = keyColab(colab);
        const list = state.extras.get(id) || [];
        const extra = rowExtra({ colaborador_id: id });
        list.push(extra);
        state.extras.set(id, list);
        renderStage();
      });
    });

    state.container.querySelectorAll('[data-extra-remove]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const tr = btn.closest('tr[data-colab]');
        const line = btn.closest('[data-extra-id]');
        const colab = findColab(tr.dataset.colab);
        const extra = findExtra(tr.dataset.colab, line.dataset.extraId);
        if (colab && extra) deleteExtra(colab, extra);
      });
    });
  }

  function onCellChange(ev) {
    const el = ev.currentTarget;
    const tr = el.closest('tr[data-colab]');
    const colab = findColab(tr?.dataset.colab);
    if (!colab) return;

    const step = el.dataset.step;
    const name = el.dataset.name;
    const value = el.type === 'checkbox' ? el.checked : (name === 'valor' ? parseMoney(el.value) : el.value);
    const id = keyColab(colab);

    if (step === 'A') {
      const row = state.disponibilidade.get(id) || rowDisponibilidade({ colaborador_id: id });
      row[name] = value;
      state.disponibilidade.set(id, row);
      debounceSave(`A:${id}`, () => saveStage('A', colab, row));
      if (name === 'disponibilidade') renderStage();
      return;
    }

    if (step === 'B') {
      const row = state.estadia.get(id) || rowEstadia({ colaborador_id: id });
      row[name] = name === 'diarias' ? Number(value || 0) : value;
      if (name === 'tipo_estadia') row.tem_estadia = value !== 'NÃO PRECISA';
      if (name === 'checkin' || name === 'checkout') autoDiarias(row);
      state.estadia.set(id, row);
      debounceSave(`B:${id}`, () => saveStage('B', colab, row));
      return;
    }

    if (step === 'C') {
      const row = state.alimentacao.get(id) || rowAlimentacao({ colaborador_id: id });
      row[name] = value;
      state.alimentacao.set(id, row);
      debounceSave(`C:${id}`, () => saveStage('C', colab, row));
      return;
    }

    if (step === 'D') {
      const row = state.deslocamento.get(id) || rowDeslocamento({ colaborador_id: id });
      row[name] = name === 'km' || name === 'valor' ? Number(value || 0) : value;
      state.deslocamento.set(id, row);
      debounceSave(`D:${id}`, () => saveStage('D', colab, row));
      return;
    }

    if (step === 'E') {
      const line = el.closest('[data-extra-id]');
      const extra = findExtra(id, line.dataset.extraId);
      if (!extra) return;
      extra[name] = name === 'valor' ? Number(value || 0) : value;
      debounceSave(`E:${id}:${extra.id}`, () => saveStage('E', colab, extra));
    }
  }

  function autoDiarias(row) {
    if (!row.checkin || !row.checkout) return;
    const a = new Date(row.checkin + 'T00:00:00');
    const b = new Date(row.checkout + 'T00:00:00');
    const days = Math.ceil((b - a) / 86400000);
    if (Number.isFinite(days) && days > 0) row.diarias = days;
  }

  function findColab(id) {
    return state.colaboradores.find((c) => keyColab(c) === String(id));
  }

  function findExtra(colabId, extraId) {
    return (state.extras.get(String(colabId)) || []).find((x) => String(x.id) === String(extraId));
  }

  function toast(message, type = 'info') {
    let host = document.querySelector('.prog-toast-host');
    if (!host) {
      host = document.createElement('div');
      host.className = 'prog-toast-host';
      document.body.appendChild(host);
    }
    const el = document.createElement('div');
    el.className = `prog-toast ${type}`;
    el.textContent = message;
    host.appendChild(el);
    setTimeout(() => el.remove(), 4500);
  }

  function injectStyles() {
    if (document.getElementById('programacao-table-styles')) return;
    const style = document.createElement('style');
    style.id = 'programacao-table-styles';
    style.textContent = `
      :root { color-scheme: dark; }
      .prog-page{padding:24px;max-width:1500px;margin:0 auto;color:#e5e7eb;font-family:Inter,system-ui,-apple-system,Segoe UI,sans-serif}
      .prog-header{display:flex;justify-content:space-between;gap:20px;align-items:flex-start;margin-bottom:20px}
      .prog-eyebrow{font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#86efac;font-weight:800;margin-bottom:6px}
      .prog-header h1{margin:0;font-size:32px;line-height:1.1;color:#f8fafc}.prog-header p{margin:8px 0 0;color:#a7b7ad}
      .prog-header-actions{display:flex;align-items:center;gap:10px;flex-wrap:wrap;justify-content:flex-end}.prog-pill,.prog-save{border:1px solid rgba(34,197,94,.22);background:rgba(20,83,45,.25);color:#bbf7d0;border-radius:999px;padding:8px 12px;font-size:12px;font-weight:700}.prog-save{color:#d1fae5;background:rgba(2,44,34,.6)}
      .prog-toolbar{display:grid;grid-template-columns:200px 1fr 1fr auto;gap:12px;align-items:end;background:linear-gradient(180deg,rgba(8,47,35,.85),rgba(3,20,16,.92));border:1px solid rgba(34,197,94,.15);border-radius:22px;padding:16px;margin-bottom:14px;box-shadow:0 18px 60px rgba(0,0,0,.28)}
      .prog-toolbar label,.prog-search{display:flex;flex-direction:column;gap:6px}.prog-toolbar span,.prog-search span{font-size:12px;color:#b6c8bd;font-weight:700}
      .prog-page input,.prog-page select{width:100%;box-sizing:border-box;border:1px solid rgba(52,211,153,.18);border-radius:12px;background:#0f172a;color:#e5e7eb;min-height:40px;padding:9px 12px;outline:none;color-scheme:dark}.prog-page select option{background:#0f172a;color:#e5e7eb}.prog-page input:focus,.prog-page select:focus{border-color:#22c55e;box-shadow:0 0 0 3px rgba(34,197,94,.13)}.prog-page input[disabled],.prog-page select[disabled]{opacity:.55;cursor:not-allowed}.prog-page input[type="checkbox"]{width:18px;height:18px;min-height:18px;accent-color:#22c55e}
      .prog-btn{border:1px solid rgba(34,197,94,.26);background:rgba(15,23,42,.88);color:#e5e7eb;border-radius:12px;min-height:40px;padding:9px 14px;font-weight:800;cursor:pointer}.prog-btn.primary{background:linear-gradient(135deg,#166534,#22c55e);border-color:transparent;color:#f8fafc}.prog-btn.mini{margin-top:10px;min-height:32px;font-size:12px;padding:6px 10px}.prog-btn:hover{filter:brightness(1.08)}
      .prog-tabs{display:flex;gap:10px;flex-wrap:wrap;margin:18px 0}.prog-tab{border:1px solid rgba(52,211,153,.2);background:rgba(2,20,15,.72);color:#d1d5db;border-radius:15px;padding:12px 16px;font-weight:800;cursor:pointer}.prog-tab strong{color:#bbf7d0;margin-right:4px}.prog-tab.active{background:linear-gradient(135deg,rgba(20,83,45,.96),rgba(5,46,22,.96));border-color:#22c55e;box-shadow:0 10px 34px rgba(34,197,94,.13)}
      .prog-kpis{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;margin-bottom:16px}.prog-kpis article{border:1px solid rgba(34,197,94,.14);border-radius:22px;padding:18px;background:linear-gradient(180deg,rgba(8,47,35,.75),rgba(2,20,15,.86))}.prog-kpis span{display:block;color:#cbd5e1;font-weight:800}.prog-kpis strong{display:block;font-size:38px;margin:8px 0 2px;color:#f8fafc}.prog-kpis small{color:#9fb3a8}
      .prog-card{border:1px solid rgba(34,197,94,.14);border-radius:24px;padding:18px;background:linear-gradient(180deg,rgba(3,28,21,.86),rgba(1,15,12,.95));box-shadow:0 22px 80px rgba(0,0,0,.24)}.prog-list-head{display:flex;justify-content:space-between;gap:16px;align-items:end;margin-bottom:14px}.prog-list-head h2{margin:0;color:#f8fafc;font-size:20px}.prog-list-head p{margin:6px 0 0;color:#9fb3a8}.prog-search{min-width:360px}
      .prog-table-wrap{overflow:auto;border:1px solid rgba(148,163,184,.12);border-radius:18px;background:rgba(15,23,42,.55)}.prog-table{width:100%;border-collapse:separate;border-spacing:0;min-width:920px}.prog-table.wide{min-width:1280px}.prog-table th{position:sticky;top:0;z-index:1;text-align:left;background:#081611;color:#bbf7d0;font-size:12px;letter-spacing:.04em;text-transform:uppercase;padding:12px;border-bottom:1px solid rgba(52,211,153,.16);white-space:nowrap}.prog-table td{padding:10px 12px;border-bottom:1px solid rgba(148,163,184,.10);vertical-align:middle}.prog-table tr:hover td{background:rgba(34,197,94,.04)}.prog-table tr.muted td{background:rgba(15,23,42,.36);opacity:.82}.prog-table .center{text-align:center}.prog-table .uf{max-width:70px;text-transform:uppercase}.prog-colab{display:grid;gap:3px;min-width:260px}.prog-colab strong{font-size:14px;color:#f8fafc;letter-spacing:.02em}.prog-colab span{font-size:12px;color:#a7b7ad}.prog-badge{display:inline-flex;width:max-content;border-radius:999px;padding:3px 8px;font-style:normal;font-size:10px;font-weight:900;letter-spacing:.04em;text-transform:uppercase}.prog-badge.ok{background:rgba(34,197,94,.12);color:#bbf7d0}.prog-badge.danger{background:rgba(239,68,68,.15);color:#fecaca}.prog-muted-text{color:#94a3b8;font-size:13px}.prog-empty,.prog-alert{padding:18px;border-radius:16px;background:rgba(15,23,42,.65);border:1px solid rgba(148,163,184,.14);color:#cbd5e1}.prog-alert{background:rgba(127,29,29,.28);border-color:rgba(248,113,113,.3);color:#fecaca;margin-bottom:14px}
      .extra-table{min-width:1180px}.extras-list{display:grid;gap:8px}.extra-line{display:grid;grid-template-columns:170px minmax(180px,1fr) 140px minmax(160px,1fr) 36px;gap:8px;align-items:center}.prog-icon-btn{width:34px;height:34px;border-radius:10px;border:1px solid rgba(248,113,113,.26);background:rgba(127,29,29,.32);color:#fecaca;font-size:20px;font-weight:900;cursor:pointer}
      .prog-toast-host{position:fixed;right:20px;bottom:20px;display:grid;gap:10px;z-index:99999}.prog-toast{max-width:380px;border-radius:14px;padding:12px 14px;color:#e5e7eb;background:#0f172a;border:1px solid rgba(148,163,184,.2);box-shadow:0 18px 45px rgba(0,0,0,.35)}.prog-toast.warn{border-color:rgba(245,158,11,.45);color:#fde68a}
      @media (max-width:900px){.prog-page{padding:14px}.prog-header,.prog-list-head{flex-direction:column;align-items:stretch}.prog-toolbar,.prog-kpis{grid-template-columns:1fr}.prog-search{min-width:0}.prog-header-actions{justify-content:flex-start}}
    `;
    document.head.appendChild(style);
  }

  function openHome(container, opts = {}) {
    if (!container) throw new Error('Container não informado para PROGRAMACAO.openHome');
    state.container = container;
    state.opts = opts;
    state.auth = opts.auth || window.APP_AUTH || null;
    state.api = opts.api || window.APP_API || null;
    state.stage = 'A';
    state.search = '';
    state.error = '';

    const user = state.auth?.user || state.auth?.usuario || opts.user || {};
    state.coordenacao = user.coordenacao || user.coordenação || state.coordenacao || '';
    state.supervisao = user.supervisao || user.supervisão || state.supervisao || '';

    render();
    loadContext();
  }

  window[MOD] = { openHome, version: VERSION };
  window.ADM_MODULES = window.ADM_MODULES || {};
  window.ADM_MODULES.programacao = { mount: openHome };
})();
