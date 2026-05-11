import { initProtectedPage } from './pageInit.js';
import { supabase } from './supabaseClient.js';
import { getCurrentUser, getUserContext } from './auth.js';

const STEPS = [
  { code: 'A', label: 'Disponibilidade' },
  { code: 'B', label: 'Estadia' },
  { code: 'C', label: 'Alimentação' },
  { code: 'D', label: 'Deslocamento' },
  { code: 'E', label: 'Extras' },
];

const DISPONIBILIDADES = ['OK', 'FÉRIAS', 'FOLGA', 'ATESTADO', 'FALTA', 'TRANSFERIR', 'INATIVO'];
const TIPOS_ESTADIA = ['NÃO PRECISA', 'CASA', 'PERNOITE', 'ALOJAMENTO', 'HOTEL'];
const TIPOS_DESLOCAMENTO = ['NÃO PRECISA', 'MOTORISTA FROTA', 'CARONA FROTA', 'UBER/TÁXI', 'REEMBOLSO KM', 'ÔNIBUS', 'OUTRO'];
const TIPOS_DESLOCAMENTO_FROTA = new Set(['MOTORISTA FROTA', 'CARONA FROTA']);
const IBGE_MUNICIPIOS_URL = 'https://servicodados.ibge.gov.br/api/v1/localidades/municipios?orderBy=nome';
const TIPOS_EXTRA = ['ESTADIA', 'RECARGA', 'LAVAGEM', 'MANUTENÇÃO VEÍCULO', 'PEDÁGIO', 'ESTACIONAMENTO', 'MATERIAL', 'OUTRO'];
const DISPONIBILIDADES_LIBERADAS = new Set(['', 'OK', 'DISPONÍVEL', 'DISPONIVEL', 'LIBERADO']);

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
  const tz = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - tz).toISOString().slice(0, 10);
}

function normalizeCpf(value) {
  return String(value || '').replace(/\D/g, '');
}

function colaboradorKey(colab) {
  return normalizeCpf(colab.cpf) || String(colab.id || colab.nome || '').trim();
}

function toNumberBR(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const clean = String(value ?? '').replace(/\./g, '').replace(',', '.').replace(/[^0-9.-]/g, '');
  const parsed = Number(clean);
  return Number.isFinite(parsed) ? parsed : 0;
}

function moneyBR(value) {
  return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function isColaboradorAtivo(colab) {
  if (!colab) return false;
  if (colab.ativo === false) return false;

  const situacao = normalizeAccessText(colab.situacao);
  const desligamento = String(colab.desligamento || '').trim();
  if (desligamento) return false;

  return ![
    'NAO ATIVO',
    'NAO ATIVA',
    'INATIVO',
    'INATIVA',
    'DESLIGADO',
    'DESLIGADA',
    'DEMITIDO',
    'DEMITIDA',
  ].some((status) => situacao.includes(status));
}


function normalizeAccessText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}

function getDeepValue(source, path) {
  return String(path || '').split('.').reduce((acc, key) => (acc && acc[key] !== undefined ? acc[key] : undefined), source);
}

function parseSupervisoes(value) {
  if (!value) return [];
  if (Array.isArray(value)) return [...new Set(value.flatMap(parseSupervisoes))];
  if (typeof value === 'object') {
    return parseSupervisoes(value.supervisoes || value.supervisao || value.nome || value.name);
  }

  const text = String(value).trim();
  if (!text) return [];

  if ((text.startsWith('[') && text.endsWith(']')) || (text.startsWith('{') && text.endsWith('}'))) {
    try { return parseSupervisoes(JSON.parse(text)); } catch (_) {}
  }

  return [...new Set(text.split(/[,;|\n]+/).map((item) => item.trim()).filter(Boolean))];
}

function looksLikeGestor(value) {
  const normalized = normalizeAccessText(value);
  return normalized === 'GESTOR' || normalized.startsWith('GESTOR ');
}

function buildAccessTokens(access) {
  const tokens = new Set();
  const sources = [access?.setor, access?.departmentName, access?.departmentCode, access?.role, ...(access?.allowedSupervisoes || [])];

  sources.forEach((source) => {
    const normalized = normalizeAccessText(source);
    if (!normalized) return;

    tokens.add(normalized);
    normalized
      .replace(/^GESTOR\s+/, '')
      .split(/\s+/)
      .filter((part) => part.length >= 4 && !['GERAL', 'SETOR', 'ADM', 'ADMINISTRADOR'].includes(part))
      .forEach((part) => tokens.add(part));
  });

  return [...tokens];
}

function filterAllowedSupervisoes(allSupervisoes, access) {
  const all = [...new Set((allSupervisoes || []).map((item) => String(item || '').trim()).filter(Boolean))];
  if (!access?.restricted) return all;

  const allowed = [...new Set((access.allowedSupervisoes || []).map((item) => String(item || '').trim()).filter(Boolean))];
  const allowedKeys = new Set(allowed.map(normalizeAccessText));
  const tokens = buildAccessTokens(access).filter(Boolean);

  let filtered = all.filter((sup) => {
    const key = normalizeAccessText(sup);
    if (allowedKeys.has(key)) return true;
    return tokens.some((token) => token.length >= 4 && key.includes(token));
  });

  if (!filtered.length && allowed.length) filtered = allowed;
  return [...new Set(filtered)].sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

function selectOptions(options, selected) {
  return options.map((opt) => `<option value="${escapeHtml(opt)}" ${String(selected || '') === opt ? 'selected' : ''}>${escapeHtml(opt)}</option>`).join('');
}

function injectProgramacaoStyles() {
  if (document.getElementById('programacao-table-styles')) return;
  const style = document.createElement('style');
  style.id = 'programacao-table-styles';
  style.textContent = `
    .prog-table-wrap{width:100%;overflow:auto;border:1px solid rgba(52,211,153,.18);border-radius:18px;background:rgba(2,6,23,.26)}
    .prog-table{width:100%;border-collapse:separate;border-spacing:0;min-width:980px;color:#e5e7eb}
    .prog-table th{position:sticky;top:0;z-index:1;background:#07170f;color:#c7f9df;font-size:12px;text-transform:uppercase;letter-spacing:.045em;text-align:left;padding:13px 12px;border-bottom:1px solid rgba(52,211,153,.2)}
    .prog-table td{padding:10px 12px;border-bottom:1px solid rgba(148,163,184,.12);vertical-align:middle;background:rgba(15,23,42,.28)}
    .prog-table tr:hover td{background:rgba(22,101,52,.12)}
    .prog-table .colab-name{font-weight:900;color:#f8fafc;line-height:1.15;min-width:240px}
    .prog-table .colab-meta{font-size:12px;color:#a7b5aa;margin-top:3px}
    .prog-table input,.prog-table select,.prog-table textarea,.prog-context-grid select{color-scheme:dark;background:#0f172a!important;color:#e5e7eb!important;border:1px solid rgba(52,211,153,.18);border-radius:11px;padding:9px 10px;outline:none;width:100%;min-height:38px}
    .prog-table select option,.prog-context-grid select option{background:#0f172a;color:#e5e7eb}
    .prog-table input[type="checkbox"]{width:18px;min-height:18px;accent-color:#16a34a}
    .prog-table input:disabled,.prog-table select:disabled,.prog-table textarea:disabled{opacity:.58;cursor:not-allowed;background:#111827!important}
    .prog-suggest-field{position:relative;min-width:150px}
    .prog-suggestions{position:absolute;left:0;right:0;top:calc(100% + 6px);z-index:20;max-height:240px;overflow:auto;border:1px solid rgba(52,211,153,.28);border-radius:14px;background:#0f172a;box-shadow:0 18px 48px rgba(0,0,0,.42);padding:6px;display:none}
    .prog-suggestions.open{display:block}
    .prog-suggestion-item{width:100%;border:0;background:transparent;color:#e5e7eb;text-align:left;border-radius:10px;padding:9px 10px;cursor:pointer;font-weight:750}
    .prog-suggestion-item small{display:block;color:#94a3b8;font-weight:600;margin-top:2px}
    .prog-suggestion-item:hover,.prog-suggestion-item:focus{background:#166534;color:#f8fafc;outline:none}
    .prog-required-missing{border-color:rgba(248,113,113,.75)!important;box-shadow:0 0 0 1px rgba(248,113,113,.22)}
    .prog-status{display:inline-flex;align-items:center;gap:6px;border-radius:999px;padding:6px 10px;font-size:11px;font-weight:900;white-space:nowrap;border:1px solid rgba(148,163,184,.18)}
    .prog-status.ok{background:rgba(22,163,74,.14);color:#bbf7d0;border-color:rgba(34,197,94,.22)}
    .prog-status.block{background:rgba(239,68,68,.12);color:#fecaca;border-color:rgba(248,113,113,.22)}
    .prog-mini-btn{border:1px solid rgba(52,211,153,.28);background:rgba(22,101,52,.22);color:#dcfce7;border-radius:12px;padding:9px 12px;font-weight:800;cursor:pointer;white-space:nowrap}
    .prog-mini-btn:hover{background:rgba(22,101,52,.42)}
    .prog-mini-btn.danger{border-color:rgba(248,113,113,.22);background:rgba(127,29,29,.25);color:#fecaca}
    .prog-save-actions{display:flex;gap:10px;align-items:center;justify-content:flex-end;flex-wrap:wrap}
    .prog-save-main{border:1px solid rgba(187,247,208,.32);background:linear-gradient(135deg,#16a34a,#86efac);color:#052e16;border-radius:14px;padding:12px 18px;font-weight:950;cursor:pointer;box-shadow:0 14px 35px rgba(22,163,74,.18)}
    .prog-save-main:hover{filter:brightness(1.04)}
    .prog-save-main:disabled{opacity:.55;cursor:not-allowed;filter:none}
    .prog-extra-card{display:grid;grid-template-columns:160px 1.2fr 120px 1.2fr 86px;gap:8px;align-items:center;margin-bottom:8px;padding:8px;border:1px solid rgba(148,163,184,.14);border-radius:14px;background:rgba(15,23,42,.38)}
    .prog-extra-total{font-weight:900;color:#bbf7d0;text-align:right;white-space:nowrap}
    .prog-feedback-ok{color:#bbf7d0}.prog-feedback-error{color:#fecaca}.prog-feedback-warn{color:#fde68a}
    .prog-section-title{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:18px 0 10px}
    .prog-section-title h4{margin:0;color:#f8fafc;font-size:15px;font-weight:950;letter-spacing:.02em}
    .prog-section-title .badge{display:inline-flex;align-items:center;border-radius:999px;padding:5px 10px;font-size:11px;font-weight:900;border:1px solid rgba(52,211,153,.22);background:rgba(22,101,52,.14);color:#bbf7d0}
    .prog-section-title.blocked .badge{border-color:rgba(248,113,113,.22);background:rgba(127,29,29,.18);color:#fecaca}
    .prog-empty-section{border:1px dashed rgba(148,163,184,.2);border-radius:16px;padding:14px;color:#94a3b8;background:rgba(15,23,42,.18)}
    @media(max-width:900px){.prog-extra-card{grid-template-columns:1fr}.prog-table{min-width:860px}}
  `;
  document.head.appendChild(style);
}

initProtectedPage('Programação', (content) => {
  injectProgramacaoStyles();

  content.innerHTML = `
    <section class="card mt-16">
      <div class="section-head">
        <div>
          <h3>Contexto da programação</h3>
          <p class="muted">Selecione a data e a supervisão. Todo colaborador da supervisão entra automaticamente na programação.</p>
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
          <p class="muted">Clique em uma etapa para editar as necessidades em formato de tabela.</p>
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
        <p class="muted">Férias, folga, atestado, falta ou inativo.</p>
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
          <p class="muted">As alterações são salvas automaticamente, mas o botão abaixo confirma e finaliza a programação.</p>
        </div>
        <div class="prog-save-actions">
          <button class="prog-save-main" type="button" id="progSaveProgramacao" disabled>Salvar programação</button>
        </div>
      </div>
      <div class="filters-grid prog-context-grid">
        <div class="field field-span-2">
          <label for="progSearch">Buscar colaborador</label>
          <input id="progSearch" type="text" placeholder="Digite nome, cargo ou supervisão..." />
        </div>
      </div>
      <div class="prog-list mt-16" id="progList"></div>
    </section>
  `;

  const el = {
    dataRef: document.getElementById('progDataRef'),
    sup: document.getElementById('progSup'),
    loadBtn: document.getElementById('progLoadContext'),
    feedback: document.getElementById('progCtxFeedback'),
    steps: document.getElementById('progSteps'),
    list: document.getElementById('progList'),
    search: document.getElementById('progSearch'),
    saveBtn: document.getElementById('progSaveProgramacao'),
    statTotal: document.getElementById('progStatTotal'),
    statBlocked: document.getElementById('progStatBlocked'),
    currentStep: document.getElementById('progCurrentStep'),
    currentStepLabel: document.getElementById('progCurrentStepLabel'),
  };

  const state = {
    user: null,
    userContext: null,
    access: { restricted: false, allowedSupervisoes: [] },
    step: 'A',
    dataReferencia: todayIso(),
    supervisao: '',
    programacaoId: null,
    colaboradores: [],
    search: '',
    municipios: [],
    municipiosLoading: false,
    veiculos: [],
    maps: {
      disponibilidade: new Map(),
      estadia: new Map(),
      alimentacao: new Map(),
      deslocamento: new Map(),
      extras: new Map(),
    },
    timers: new Map(),
  };

  el.dataRef.value = state.dataReferencia;

  async function init() {
    state.user = await getCurrentUser();
    try {
      state.userContext = await getUserContext(state.user?.id);
    } catch (error) {
      console.warn('Não foi possível carregar o contexto completo do usuário.', error);
      state.userContext = null;
    }
    state.access = await resolveProgramacaoAccess();
    bindEvents();
    await fillSupervisoes();
    await loadVeiculos();
  }

  function bindEvents() {
    el.loadBtn.addEventListener('click', loadContext);
    el.saveBtn.addEventListener('click', saveProgramacao);
    el.search.addEventListener('input', () => {
      state.search = el.search.value.trim().toLowerCase();
      renderRows();
    });
    el.steps.addEventListener('click', (event) => {
      const btn = event.target.closest('[data-step]');
      if (!btn) return;
      setStep(btn.dataset.step);
    });
    el.list.addEventListener('change', handleTableChange);
    el.list.addEventListener('input', handleTableInput);
    el.list.addEventListener('click', handleTableClick);
    document.addEventListener('click', (event) => {
      if (!event.target.closest('.prog-suggest-field')) closeAllSuggestions();
    });
  }

  async function resolveProgramacaoAccess() {
    const context = state.userContext || {};
    let appUser = null;

    try {
      const { data, error } = await supabase
        .from('app_usuarios')
        .select('id,nome,email,setor,empresa,coordenacao,supervisao,status')
        .eq('auth_user_id', state.user?.id)
        .maybeSingle();
      if (!error) appUser = data || null;
    } catch (error) {
      console.warn('Não foi possível consultar app_usuarios para restrição de supervisão.', error);
    }

    const role = getDeepValue(context, 'user.role') || context.perfil_codigo || context.perfil_nome || context.role || appUser?.perfil_codigo || '';
    const setor = appUser?.setor || context.setor || getDeepValue(context, 'user.setor') || getDeepValue(context, 'department.name') || '';
    const departmentName = getDeepValue(context, 'department.name') || context.department_name || setor || '';
    const departmentCode = getDeepValue(context, 'department.code') || context.department_code || '';
    const isMaster = Boolean(getDeepValue(context, 'user.is_master') || context.is_master || normalizeAccessText(role) === 'MASTER');
    const isGestor = looksLikeGestor(role) || looksLikeGestor(setor) || looksLikeGestor(departmentName) || looksLikeGestor(departmentCode);

    const allowedSupervisoes = [
      ...parseSupervisoes(appUser?.supervisao),
      ...parseSupervisoes(context.supervisoes),
      ...parseSupervisoes(context.supervisao),
      ...parseSupervisoes(getDeepValue(context, 'user.supervisoes')),
      ...parseSupervisoes(getDeepValue(context, 'user.supervisao')),
    ];

    return {
      restricted: !isMaster && isGestor,
      allowedSupervisoes: [...new Set(allowedSupervisoes)],
      role,
      setor,
      departmentName,
      departmentCode,
    };
  }

  async function fillSupervisoes() {
    el.sup.innerHTML = '<option value="">Selecione...</option>';
    el.sup.disabled = false;

    const latest = await getLatestSnapshotDate();
    let query = supabase.from('colaborador_snapshot').select('supervisao, data_referencia').limit(10000);
    if (latest) query = query.eq('data_referencia', latest);

    const { data, error } = await query.order('supervisao', { ascending: true });
    if (error) {
      setFeedback(`Erro ao carregar supervisões: ${error.message}`, 'error');
      return;
    }

    const todasSupervisoes = [...new Set((data || []).map((r) => String(r.supervisao || '').trim()).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, 'pt-BR'));
    const supervisoes = filterAllowedSupervisoes(todasSupervisoes, state.access);

    if (state.access?.restricted && !supervisoes.length) {
      el.sup.disabled = true;
      setFeedback('Seu usuário está como Gestor, mas não possui supervisão liberada. Ajuste a supervisão no cadastro do usuário.', 'error');
      return;
    }

    supervisoes.forEach((sup) => {
      const option = document.createElement('option');
      option.value = sup;
      option.textContent = sup;
      el.sup.appendChild(option);
    });

    if (supervisoes.length === 1) {
      el.sup.value = supervisoes[0];
      el.sup.disabled = true;
      setFeedback(`Supervisão limitada ao acesso do usuário: ${supervisoes[0]}.`, 'ok');
    } else if (state.access?.restricted) {
      setFeedback(`Supervisões liberadas para este gestor: ${supervisoes.length}.`, 'ok');
    }
  }


  async function loadVeiculos() {
    const loaded = new Map();
    try {
      const { data, error } = await supabase
        .from('frotas_veiculos')
        .select('placa,nome,marca,modelo,cor,status,empresa,motorista_atual,coordenacao,supervisao')
        .order('placa', { ascending: true })
        .limit(2000);
      if (!error) {
        (data || []).forEach((v) => {
          const placa = normalizePlate(v.placa);
          if (!placa) return;
          const status = normalizeAccessText(v.status || 'ATIVO');
          if (status && ['INATIVO', 'VENDIDO', 'BAIXADO'].some((s) => status.includes(s))) return;
          loaded.set(placa, {
            placa,
            label: `${placa} · ${[v.marca, v.modelo, v.cor].filter(Boolean).join(' ') || v.nome || 'Veículo'}`,
            detalhe: [v.motorista_atual, v.supervisao || v.coordenacao, v.empresa].filter(Boolean).join(' · '),
          });
        });
      }
    } catch (error) {
      console.warn('Não foi possível carregar frotas_veiculos para sugestões de placa.', error);
    }

    if (!loaded.size) {
      try {
        const { data, error } = await supabase
          .from('patrimonios_snapshot')
          .select('patrimonio_codigo,identificacao,marca,modelo,situacao,funcionario,coordenacao,supervisao,categoria')
          .limit(3000);
        if (!error) {
          (data || []).forEach((p) => {
            const text = [p.patrimonio_codigo, p.identificacao, p.marca, p.modelo].join(' ');
            const placa = extractPlate(text);
            if (!placa) return;
            const categoria = normalizeAccessText(p.categoria || '');
            const situacao = normalizeAccessText(p.situacao || '');
            if (categoria && !categoria.includes('VEIC')) return;
            if (situacao && ['INATIVO', 'VENDIDO', 'BAIXADO'].some((s) => situacao.includes(s))) return;
            loaded.set(placa, {
              placa,
              label: `${placa} · ${[p.marca, p.modelo].filter(Boolean).join(' ') || p.identificacao || 'Patrimônio'}`,
              detalhe: [p.funcionario, p.supervisao || p.coordenacao, p.patrimonio_codigo].filter(Boolean).join(' · '),
            });
          });
        }
      } catch (error) {
        console.warn('Não foi possível carregar patrimonios_snapshot para sugestões de placa.', error);
      }
    }

    state.veiculos = [...loaded.values()].sort((a, b) => a.placa.localeCompare(b.placa, 'pt-BR'));
  }

  function normalizePlate(value) {
    return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 7);
  }

  function extractPlate(value) {
    const match = String(value || '').toUpperCase().match(/[A-Z]{3}[-\s]?[0-9][A-Z0-9][0-9]{2}/);
    return match ? normalizePlate(match[0]) : '';
  }

  async function ensureMunicipiosLoaded() {
    if (state.municipios.length || state.municipiosLoading) return;
    state.municipiosLoading = true;
    try {
      const response = await fetch(IBGE_MUNICIPIOS_URL, { cache: 'force-cache' });
      if (!response.ok) throw new Error(`IBGE HTTP ${response.status}`);
      const data = await response.json();
      state.municipios = (data || []).map((m) => {
        const uf = m?.microrregiao?.mesorregiao?.UF?.sigla || '';
        const estado = m?.microrregiao?.mesorregiao?.UF?.nome || '';
        return { cidade: String(m.nome || '').trim(), uf, estado, search: normalizeSearch(`${m.nome} ${uf} ${estado}`) };
      }).filter((m) => m.cidade && m.uf);
    } catch (error) {
      console.warn('Não foi possível carregar municípios do IBGE.', error);
      state.municipios = [];
      setFeedback('Não consegui carregar a lista de cidades do IBGE agora. Ainda é possível preencher cidade e UF manualmente.', 'warn');
    } finally {
      state.municipiosLoading = false;
    }
  }

  function normalizeSearch(value) {
    return String(value || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  }

  function closeAllSuggestions() {
    el.list.querySelectorAll('.prog-suggestions.open').forEach((box) => box.classList.remove('open'));
  }

  function renderSuggestionBox(items, type) {
    return `<div class="prog-suggestions" data-suggestions="${escapeHtml(type)}">
      ${items.map((item) => `<button type="button" class="prog-suggestion-item" data-suggest-type="${escapeHtml(type)}" data-cidade="${escapeHtml(item.cidade || '')}" data-uf="${escapeHtml(item.uf || '')}" data-placa="${escapeHtml(item.placa || '')}">${escapeHtml(item.label || `${item.cidade} · ${item.uf}`)}${item.detalhe || item.estado ? `<small>${escapeHtml(item.detalhe || item.estado)}</small>` : ''}</button>`).join('')}
    </div>`;
  }

  async function getLatestSnapshotDate() {
    const { data, error } = await supabase
      .from('colaborador_importacoes')
      .select('data_referencia')
      .eq('status', 'processado')
      .order('data_referencia', { ascending: false })
      .limit(1);

    if (!error && data?.[0]?.data_referencia) return data[0].data_referencia;

    const fallback = await supabase
      .from('colaborador_snapshot')
      .select('data_referencia')
      .order('data_referencia', { ascending: false })
      .limit(1);

    return fallback.data?.[0]?.data_referencia || null;
  }

  async function ensureProgramacaoDia(dataReferencia, supervisao, coordenacao = '') {
    const found = await supabase
      .from('programacao_dia')
      .select('*')
      .eq('data_referencia', dataReferencia)
      .eq('supervisao', supervisao)
      .limit(1)
      .maybeSingle();

    if (found.error) throw found.error;
    if (found.data) return found.data;

    const inserted = await supabase
      .from('programacao_dia')
      .insert({
        data_referencia: dataReferencia,
        supervisao,
        coordenacao: coordenacao || null,
        regional: supervisao || null,
        status: 'rascunho',
        criado_por: state.user?.id || null,
      })
      .select('*')
      .single();

    if (inserted.error) throw inserted.error;
    return inserted.data;
  }

  async function loadIndisponibilidades(dataReferencia) {
    try {
      const { data, error } = await supabase
        .from('indisponibilidades')
        .select('colaborador_cpf, colaborador_nome, data_inicio, data_fim, motivo')
        .lte('data_inicio', dataReferencia)
        .or(`data_fim.is.null,data_fim.gte.${dataReferencia}`);
      if (error) return new Map();
      return new Map((data || []).map((r) => [normalizeCpf(r.colaborador_cpf), r]));
    } catch (_) {
      return new Map();
    }
  }

  async function loadContext() {
    const dataReferencia = el.dataRef.value;
    const supervisao = el.sup.value;
    if (!dataReferencia || !supervisao) {
      setFeedback('Selecione a data e a supervisão.', 'warn');
      return;
    }

    const allowedNow = filterAllowedSupervisoes([supervisao], state.access);
    if (state.access?.restricted && !allowedNow.includes(supervisao)) {
      setFeedback('Esta supervisão não está liberada para o seu usuário.', 'error');
      return;
    }

    state.dataReferencia = dataReferencia;
    state.supervisao = supervisao;
    setFeedback('Carregando contexto...', 'warn');
    el.saveBtn.disabled = true;
    el.list.innerHTML = '<div class="table-empty">Carregando colaboradores...</div>';

    try {
      const latestSnapshotDate = await getLatestSnapshotDate();
      if (!latestSnapshotDate) throw new Error('Nenhuma base de colaboradores foi importada ainda.');

      const { data: colaboradores, error: colabError } = await supabase
        .from('colaborador_snapshot')
        .select('*')
        .eq('data_referencia', latestSnapshotDate)
        .eq('supervisao', supervisao)
        .order('nome', { ascending: true });

      if (colabError) throw colabError;

      const colaboradoresAtivos = (colaboradores || []).filter(isColaboradorAtivo);

      const programacao = await ensureProgramacaoDia(dataReferencia, supervisao, colaboradoresAtivos?.[0]?.coordenacao || '');
      state.programacaoId = programacao.id;

      const indisponibilidades = await loadIndisponibilidades(dataReferencia);
      state.colaboradores = colaboradoresAtivos.map((colab) => {
        const key = colaboradorKey(colab);
        const indis = indisponibilidades.get(normalizeCpf(colab.cpf));
        return {
          id: key,
          cpf: normalizeCpf(colab.cpf),
          nome: colab.nome || 'Colaborador',
          cargo: colab.cargo || '',
          coordenacao: colab.coordenacao || '',
          supervisao: colab.supervisao || '',
          indisponibilidade: indis || null,
        };
      });

      await ensureDefaultRows();
      await loadStageData();
      updateStats();
      renderRows();
      el.saveBtn.disabled = false;
      setFeedback(`Contexto carregado com ${state.colaboradores.length} colaboradores.`, 'ok');
    } catch (error) {
      console.error(error);
      setFeedback(error.message || 'Erro ao carregar contexto.', 'error');
      el.list.innerHTML = `<div class="table-empty">${escapeHtml(error.message || 'Erro ao carregar')}</div>`;
    }
  }

  async function ensureDefaultRows() {
    if (!state.programacaoId || !state.colaboradores.length) return;
    const payload = state.colaboradores.map((colab) => {
      const motivo = String(colab.indisponibilidade?.motivo || '').toUpperCase();
      const disponibilidade = DISPONIBILIDADES.includes(motivo) ? motivo : (colab.indisponibilidade ? 'ATESTADO' : 'OK');
      return {
        programacao_id: state.programacaoId,
        data_referencia: state.dataReferencia,
        colaborador_id: colab.id,
        nome_colaborador: colab.nome,
        cargo: colab.cargo || null,
        coordenacao: colab.coordenacao || null,
        supervisao: colab.supervisao || null,
        disponibilidade,
      };
    });

    const { error } = await supabase
      .from('programacao_colaboradores')
      .upsert(payload, { onConflict: 'programacao_id,colaborador_id', ignoreDuplicates: true });
    if (error) throw error;
  }

  async function loadStageData() {
    const pid = state.programacaoId;
    const [disp, estadia, alimentacao, deslocamento, extras] = await Promise.all([
      supabase.from('programacao_colaboradores').select('*').eq('programacao_id', pid),
      supabase.from('programacao_estadia').select('*').eq('programacao_id', pid),
      supabase.from('programacao_alimentacao').select('*').eq('programacao_id', pid),
      supabase.from('programacao_deslocamento').select('*').eq('programacao_id', pid),
      supabase.from('programacao_extras').select('*').eq('programacao_id', pid).order('created_at', { ascending: true }),
    ]);

    for (const res of [disp, estadia, alimentacao, deslocamento, extras]) {
      if (res.error) throw res.error;
    }

    state.maps.disponibilidade = new Map((disp.data || []).map((r) => [String(r.colaborador_id), r]));
    state.maps.estadia = new Map((estadia.data || []).map((r) => [String(r.colaborador_id), r]));
    state.maps.alimentacao = new Map((alimentacao.data || []).map((r) => [String(r.colaborador_id), r]));
    state.maps.deslocamento = new Map((deslocamento.data || []).map((r) => [String(r.colaborador_id), r]));
    const extrasMap = new Map();
    (extras.data || []).forEach((r) => {
      const key = String(r.colaborador_id);
      if (!extrasMap.has(key)) extrasMap.set(key, []);
      extrasMap.get(key).push(r);
    });
    state.maps.extras = extrasMap;
  }

  function setStep(step) {
    state.step = step;
    const meta = STEPS.find((s) => s.code === step) || STEPS[0];
    el.currentStep.textContent = meta.code;
    el.currentStepLabel.textContent = meta.label;
    [...el.steps.querySelectorAll('.stepbtn')].forEach((btn) => btn.classList.toggle('active', btn.dataset.step === step));
    renderRows();
  }

  function disponibilidadeAtual(colab) {
    const row = state.maps.disponibilidade.get(String(colab.id));
    return String(row?.disponibilidade || 'OK').trim().toUpperCase();
  }

  function isDisponibilidadeBloqueada(value) {
    const normalized = String(value || '').trim().toUpperCase();
    return !DISPONIBILIDADES_LIBERADAS.has(normalized);
  }

  function isBlocked(colab) {
    return isDisponibilidadeBloqueada(disponibilidadeAtual(colab));
  }

  function splitByDisponibilidade(rows) {
    const disponiveis = [];
    const bloqueados = [];
    (rows || []).forEach((colab) => (isBlocked(colab) ? bloqueados : disponiveis).push(colab));
    return { disponiveis, bloqueados };
  }

  function updateStats() {
    el.statTotal.textContent = String(state.colaboradores.length);
    el.statBlocked.textContent = String(state.colaboradores.filter(isBlocked).length);
  }

  function filteredColaboradores() {
    return state.colaboradores.filter((colab) => {
      if (!state.search) return true;
      return `${colab.nome} ${colab.cargo} ${colab.supervisao} ${colab.coordenacao}`.toLowerCase().includes(state.search);
    });
  }

  function renderRows() {
    if (!state.programacaoId) {
      el.list.innerHTML = '<div class="table-empty">Carregue um contexto para iniciar a programação.</div>';
      return;
    }
    const rows = filteredColaboradores();
    if (!rows.length) {
      el.list.innerHTML = '<div class="table-empty">Nenhum colaborador encontrado.</div>';
      return;
    }
    if (state.step === 'A') return renderDisponibilidade(rows);
    if (state.step === 'B') return renderEstadia(rows);
    if (state.step === 'C') return renderAlimentacao(rows);
    if (state.step === 'D') return renderDeslocamento(rows);
    return renderExtras(rows);
  }

  function colabCell(colab) {
    const blocked = isBlocked(colab);
    return `
      <div class="colab-name">${escapeHtml(colab.nome)}</div>
      <div class="colab-meta">${escapeHtml(colab.cargo || 'Colaborador')} • ${escapeHtml(colab.supervisao || '-')}</div>
      ${colab.indisponibilidade ? `<div class="colab-meta">Indisponibilidade importada: ${escapeHtml(colab.indisponibilidade.motivo || 'Indisponível')}</div>` : ''}
      <div style="margin-top:6px"><span class="prog-status ${blocked ? 'block' : 'ok'}">${blocked ? 'Bloqueado' : 'Liberado'}</span></div>
    `;
  }

  function renderDisponibilidade(rows) {
    const { disponiveis, bloqueados } = splitByDisponibilidade(rows);
    el.list.innerHTML = `
      ${renderDisponibilidadeTable('Disponíveis', disponiveis, false)}
      ${renderDisponibilidadeTable('Bloqueados', bloqueados, true)}
    `;
  }

  function renderDisponibilidadeTable(title, rows, blockedSection) {
    return `
      <div class="prog-section-title ${blockedSection ? 'blocked' : ''}">
        <h4>${escapeHtml(title)}</h4>
        <span class="badge">${rows.length}</span>
      </div>
      ${rows.length ? `
        <div class="prog-table-wrap">
          <table class="prog-table">
            <thead><tr><th>Colaborador</th><th>Disponibilidade</th><th>Observação</th></tr></thead>
            <tbody>
              ${rows.map((colab) => {
                const r = state.maps.disponibilidade.get(String(colab.id)) || {};
                return `<tr data-colab-id="${escapeHtml(colab.id)}" data-table="programacao_colaboradores">
                  <td>${colabCell(colab)}</td>
                  <td><select data-field="disponibilidade">${selectOptions(DISPONIBILIDADES, r.disponibilidade || 'OK')}</select></td>
                  <td><input data-field="observacao" type="text" value="${escapeHtml(r.observacao || '')}" placeholder="Observação da disponibilidade" /></td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>` : `<div class="prog-empty-section">Nenhum colaborador em ${blockedSection ? 'Bloqueados' : 'Disponíveis'}.</div>`}
    `;
  }

  function renderBloqueadosResumo(rows) {
    if (!rows.length) return '';
    return `
      <div class="prog-section-title blocked">
        <h4>Bloqueados</h4>
        <span class="badge">${rows.length}</span>
      </div>
      <div class="prog-table-wrap">
        <table class="prog-table">
          <thead><tr><th>Colaborador</th><th>Motivo</th><th>Observação</th></tr></thead>
          <tbody>
            ${rows.map((colab) => {
              const r = state.maps.disponibilidade.get(String(colab.id)) || {};
              return `<tr data-colab-id="${escapeHtml(colab.id)}">
                <td>${colabCell(colab)}</td>
                <td><span class="prog-status block">${escapeHtml(r.disponibilidade || 'BLOQUEADO')}</span></td>
                <td>${escapeHtml(r.observacao || '-')}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>`;
  }

  function renderEstadia(rows) {
    const { disponiveis, bloqueados } = splitByDisponibilidade(rows);
    el.list.innerHTML = `
      <div class="prog-section-title">
        <h4>Disponíveis</h4>
        <span class="badge">${disponiveis.length}</span>
      </div>
      ${disponiveis.length ? `<div class="prog-table-wrap">
        <table class="prog-table">
          <thead><tr><th>Colaborador</th><th>Tipo</th><th>Cidade</th><th>UF</th><th>Check-in</th><th>Check-out</th><th>Observação</th></tr></thead>
          <tbody>
            ${disponiveis.map((colab) => {
              const r = state.maps.estadia.get(String(colab.id)) || {};
              const blocked = isBlocked(colab);
              return `<tr data-colab-id="${escapeHtml(colab.id)}" data-table="programacao_estadia">
                <td>${colabCell(colab)}</td>
                <td><select data-field="tipo_estadia" ${blocked ? 'disabled' : ''}>${selectOptions(TIPOS_ESTADIA, r.tipo_estadia || 'NÃO PRECISA')}</select></td>
                <td><div class="prog-suggest-field"><input data-field="cidade" data-city-input type="text" value="${escapeHtml(r.cidade || '')}" placeholder="Digite a cidade" autocomplete="off" ${blocked ? 'disabled' : ''}/>${renderSuggestionBox([], 'cidade')}</div></td>
                <td><input data-field="uf" data-uf-input type="text" value="${escapeHtml(r.uf || '')}" placeholder="UF" maxlength="2" ${blocked ? 'disabled' : ''}/></td>
                <td><input data-field="checkin" type="date" value="${escapeHtml(r.checkin || '')}" ${blocked ? 'disabled' : ''}/></td>
                <td><input data-field="checkout" type="date" value="${escapeHtml(r.checkout || '')}" ${blocked ? 'disabled' : ''}/></td>
                <td><input data-field="observacao" type="text" value="${escapeHtml(r.observacao || '')}" ${blocked ? 'disabled' : ''}/></td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>` : '<div class="prog-empty-section">Nenhum colaborador disponível para estadia.</div>'}
      ${renderBloqueadosResumo(bloqueados)}`;
  }

  function renderAlimentacao(rows) {
    const { disponiveis, bloqueados } = splitByDisponibilidade(rows);
    el.list.innerHTML = `
      <div class="prog-section-title">
        <h4>Disponíveis</h4>
        <span class="badge">${disponiveis.length}</span>
      </div>
      ${disponiveis.length ? `<div class="prog-table-wrap">
        <table class="prog-table">
          <thead><tr><th>Colaborador</th><th>Café</th><th>Almoço</th><th>Janta</th><th>Observação</th></tr></thead>
          <tbody>
            ${disponiveis.map((colab) => {
              const r = state.maps.alimentacao.get(String(colab.id)) || { almoco: true };
              const blocked = isBlocked(colab);
              return `<tr data-colab-id="${escapeHtml(colab.id)}" data-table="programacao_alimentacao">
                <td>${colabCell(colab)}</td>
                <td><input data-field="cafe" type="checkbox" ${r.cafe ? 'checked' : ''} ${blocked ? 'disabled' : ''}/></td>
                <td><input data-field="almoco" type="checkbox" ${r.almoco !== false ? 'checked' : ''} ${blocked ? 'disabled' : ''}/></td>
                <td><input data-field="janta" type="checkbox" ${r.janta ? 'checked' : ''} ${blocked ? 'disabled' : ''}/></td>
                <td><input data-field="observacao" type="text" value="${escapeHtml(r.observacao || '')}" ${blocked ? 'disabled' : ''}/></td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>` : '<div class="prog-empty-section">Nenhum colaborador disponível para alimentação.</div>'}
      ${renderBloqueadosResumo(bloqueados)}`;
  }

  function renderDeslocamento(rows) {
    const { disponiveis, bloqueados } = splitByDisponibilidade(rows);
    el.list.innerHTML = `
      <div class="prog-section-title">
        <h4>Disponíveis</h4>
        <span class="badge">${disponiveis.length}</span>
      </div>
      ${disponiveis.length ? `<div class="prog-table-wrap">
        <table class="prog-table">
          <thead><tr><th>Colaborador</th><th>Deslocamento</th><th>Placa</th><th>Origem</th><th>Destino</th><th>KM</th><th>Valor</th><th>Observação</th></tr></thead>
          <tbody>
            ${disponiveis.map((colab) => {
              const r = state.maps.deslocamento.get(String(colab.id)) || {};
              const blocked = isBlocked(colab);
              return `<tr data-colab-id="${escapeHtml(colab.id)}" data-table="programacao_deslocamento">
                <td>${colabCell(colab)}</td>
                <td><select data-field="tipo_deslocamento" data-deslocamento-tipo ${blocked ? 'disabled' : ''}>${selectOptions(TIPOS_DESLOCAMENTO, r.tipo_deslocamento || 'NÃO PRECISA')}</select></td>
                <td><div class="prog-suggest-field"><input data-field="placa_veiculo" data-vehicle-input type="text" value="${escapeHtml(r.placa_veiculo || '')}" placeholder="Placa" maxlength="8" autocomplete="off" ${blocked ? 'disabled' : ''}/>${renderSuggestionBox([], 'veiculo')}</div></td>
                <td><input data-field="origem" type="text" value="${escapeHtml(r.origem || '')}" ${blocked ? 'disabled' : ''}/></td>
                <td><input data-field="destino" type="text" value="${escapeHtml(r.destino || '')}" ${blocked ? 'disabled' : ''}/></td>
                <td><input data-field="km" type="number" min="0" step="0.01" value="${escapeHtml(r.km || 0)}" ${blocked ? 'disabled' : ''}/></td>
                <td><input data-field="valor" type="text" value="${escapeHtml(r.valor || '')}" placeholder="R$ 0,00" ${blocked ? 'disabled' : ''}/></td>
                <td><input data-field="observacao" type="text" value="${escapeHtml(r.observacao || '')}" ${blocked ? 'disabled' : ''}/></td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>` : '<div class="prog-empty-section">Nenhum colaborador disponível para deslocamento.</div>'}
      ${renderBloqueadosResumo(bloqueados)}`;
  }

  function renderExtras(rows) {
    const { disponiveis, bloqueados } = splitByDisponibilidade(rows);
    el.list.innerHTML = `
      <div class="prog-section-title">
        <h4>Disponíveis</h4>
        <span class="badge">${disponiveis.length}</span>
      </div>
      ${disponiveis.length ? `<div class="prog-table-wrap">
        <table class="prog-table">
          <thead><tr><th style="width:280px">Colaborador</th><th>Despesas extras</th><th style="width:130px">Total</th><th style="width:150px">Ação</th></tr></thead>
          <tbody>
            ${disponiveis.map((colab) => {
              const blocked = isBlocked(colab);
              const extras = state.maps.extras.get(String(colab.id)) || [];
              const total = extras.reduce((acc, r) => acc + Number(r.valor || 0), 0);
              return `<tr data-colab-id="${escapeHtml(colab.id)}" data-table="programacao_extras">
                <td>${colabCell(colab)}</td>
                <td>
                  ${extras.length ? extras.map((r) => extraCard(r, blocked)).join('') : '<span class="muted">Nenhuma despesa extra lançada.</span>'}
                </td>
                <td class="prog-extra-total">${moneyBR(total)}</td>
                <td><button type="button" class="prog-mini-btn" data-action="add-extra" ${blocked ? 'disabled' : ''}>+ Adicionar</button></td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>` : '<div class="prog-empty-section">Nenhum colaborador disponível para extras.</div>'}
      ${renderBloqueadosResumo(bloqueados)}`;
  }

  function extraCard(r, blocked) {
    return `<div class="prog-extra-card" data-extra-id="${escapeHtml(r.id)}">
      <select data-extra-field="tipo_despesa" ${blocked ? 'disabled' : ''}>${selectOptions(TIPOS_EXTRA, r.tipo_despesa || 'OUTRO')}</select>
      <input data-extra-field="descricao" type="text" value="${escapeHtml(r.descricao || '')}" placeholder="Descrição" ${blocked ? 'disabled' : ''}/>
      <input data-extra-field="valor" type="text" value="${escapeHtml(r.valor || '')}" placeholder="R$ 0,00" ${blocked ? 'disabled' : ''}/>
      <input data-extra-field="observacao" type="text" value="${escapeHtml(r.observacao || '')}" placeholder="Observação" ${blocked ? 'disabled' : ''}/>
      <button type="button" class="prog-mini-btn danger" data-action="delete-extra" ${blocked ? 'disabled' : ''}>Excluir</button>
    </div>`;
  }

  function handleTableInput(event) {
    if (event.target.matches('[data-city-input]')) handleCityInput(event.target);
    if (event.target.matches('[data-vehicle-input]')) handleVehicleInput(event.target);
    if (event.target.matches('[data-field]')) scheduleSaveRow(event.target.closest('tr'));
    if (event.target.matches('[data-extra-field]')) scheduleSaveExtra(event.target.closest('.prog-extra-card'));
  }

  function handleTableChange(event) {
    if (event.target.matches('[data-deslocamento-tipo]')) validateDeslocamentoRow(event.target.closest('tr'), false);
    if (event.target.matches('[data-field]')) scheduleSaveRow(event.target.closest('tr'));
    if (event.target.matches('[data-extra-field]')) scheduleSaveExtra(event.target.closest('.prog-extra-card'));
  }

  async function handleTableClick(event) {
    const suggestBtn = event.target.closest('[data-suggest-type]');
    if (suggestBtn) {
      applySuggestion(suggestBtn);
      return;
    }
    if (event.target.matches('[data-city-input]')) handleCityInput(event.target);
    if (event.target.matches('[data-vehicle-input]')) handleVehicleInput(event.target);
    const addBtn = event.target.closest('[data-action="add-extra"]');
    if (addBtn) {
      const tr = addBtn.closest('tr');
      await addExtra(tr?.dataset.colabId);
      return;
    }
    const delBtn = event.target.closest('[data-action="delete-extra"]');
    if (delBtn) {
      const card = delBtn.closest('.prog-extra-card');
      await deleteExtra(card?.dataset.extraId);
    }
  }


  async function handleCityInput(input) {
    await ensureMunicipiosLoaded();
    const box = input.closest('.prog-suggest-field')?.querySelector('[data-suggestions="cidade"]');
    if (!box) return;
    const term = normalizeSearch(input.value);
    if (term.length < 2 || !state.municipios.length) {
      box.classList.remove('open');
      box.innerHTML = '';
      return;
    }
    const starts = [];
    const contains = [];
    for (const item of state.municipios) {
      if (item.search.startsWith(term)) starts.push(item);
      else if (item.search.includes(term)) contains.push(item);
      if (starts.length >= 8) break;
    }
    const items = [...starts, ...contains].slice(0, 10).map((m) => ({ ...m, label: `${m.cidade} · ${m.uf}` }));
    box.innerHTML = items.length
      ? items.map((item) => `<button type="button" class="prog-suggestion-item" data-suggest-type="cidade" data-cidade="${escapeHtml(item.cidade)}" data-uf="${escapeHtml(item.uf)}">${escapeHtml(item.label)}<small>${escapeHtml(item.estado)}</small></button>`).join('')
      : '<button type="button" class="prog-suggestion-item" disabled>Nenhuma cidade encontrada</button>';
    box.classList.toggle('open', !!items.length);
  }

  function handleVehicleInput(input) {
    const box = input.closest('.prog-suggest-field')?.querySelector('[data-suggestions="veiculo"]');
    if (!box) return;
    const term = normalizeSearch(input.value);
    if (!term.length || !state.veiculos.length) {
      box.classList.remove('open');
      box.innerHTML = '';
      return;
    }
    const items = state.veiculos
      .filter((v) => normalizeSearch(`${v.placa} ${v.label} ${v.detalhe}`).includes(term))
      .slice(0, 10);
    box.innerHTML = items.length
      ? items.map((item) => `<button type="button" class="prog-suggestion-item" data-suggest-type="veiculo" data-placa="${escapeHtml(item.placa)}">${escapeHtml(item.label)}${item.detalhe ? `<small>${escapeHtml(item.detalhe)}</small>` : ''}</button>`).join('')
      : '<button type="button" class="prog-suggestion-item" disabled>Nenhum veículo encontrado</button>';
    box.classList.toggle('open', !!items.length);
  }

  function applySuggestion(button) {
    const type = button.dataset.suggestType;
    const tr = button.closest('tr');
    if (type === 'cidade') {
      const cidade = button.dataset.cidade || '';
      const uf = button.dataset.uf || '';
      const cidadeInput = tr?.querySelector('[data-city-input]');
      const ufInput = tr?.querySelector('[data-uf-input]');
      if (cidadeInput) cidadeInput.value = cidade;
      if (ufInput) ufInput.value = uf;
      cidadeInput?.classList.remove('prog-required-missing');
      ufInput?.classList.remove('prog-required-missing');
      closeAllSuggestions();
      scheduleSaveRow(tr);
      return;
    }
    if (type === 'veiculo') {
      const placa = button.dataset.placa || '';
      const input = tr?.querySelector('[data-vehicle-input]');
      if (input) input.value = placa;
      input?.classList.remove('prog-required-missing');
      closeAllSuggestions();
      scheduleSaveRow(tr);
    }
  }

  function validateEstadiaRow(tr, showMessage = true) {
    if (!tr) return true;
    const tipo = String(tr.querySelector('[data-field="tipo_estadia"]')?.value || '').toUpperCase();
    const precisaCidade = tipo === 'HOTEL';
    const cidadeInput = tr.querySelector('[data-field="cidade"]');
    const ufInput = tr.querySelector('[data-field="uf"]');
    const ok = !precisaCidade || (String(cidadeInput?.value || '').trim() && String(ufInput?.value || '').trim().length === 2);
    cidadeInput?.classList.toggle('prog-required-missing', !ok);
    ufInput?.classList.toggle('prog-required-missing', !ok);
    if (!ok && showMessage) setFeedback('Solicitação de HOTEL precisa ter cidade e UF selecionadas/preenchidas.', 'error');
    return ok;
  }

  function validateDeslocamentoRow(tr, showMessage = true) {
    if (!tr) return true;
    const tipo = String(tr.querySelector('[data-deslocamento-tipo]')?.value || '').toUpperCase();
    const precisaPlaca = TIPOS_DESLOCAMENTO_FROTA.has(tipo);
    const placaInput = tr.querySelector('[data-vehicle-input]');
    const placa = normalizePlate(placaInput?.value || '');
    if (placaInput && placaInput.value) placaInput.value = placa;
    const ok = !precisaPlaca || placa.length === 7;
    placaInput?.classList.toggle('prog-required-missing', !ok);
    if (!ok && showMessage) setFeedback('Deslocamento com MOTORISTA FROTA ou CARONA FROTA precisa ter a placa do veículo.', 'error');
    return ok;
  }

  function validateRequiredBeforeSave() {
    const invalid = [];
    for (const [colabId, row] of state.maps.estadia.entries()) {
      const tipo = String(row?.tipo_estadia || '').toUpperCase();
      if (tipo === 'HOTEL' && (!String(row.cidade || '').trim() || String(row.uf || '').trim().length !== 2)) {
        const colab = colabById(colabId);
        invalid.push(`${colab?.nome || row.nome_colaborador || 'Colaborador'}: hotel sem cidade/UF`);
      }
    }
    for (const [colabId, row] of state.maps.deslocamento.entries()) {
      const tipo = String(row?.tipo_deslocamento || '').toUpperCase();
      if (TIPOS_DESLOCAMENTO_FROTA.has(tipo) && normalizePlate(row.placa_veiculo || '').length !== 7) {
        const colab = colabById(colabId);
        invalid.push(`${colab?.nome || row.nome_colaborador || 'Colaborador'}: frota sem placa`);
      }
    }
    const visibleRows = [...el.list.querySelectorAll('tr[data-table="programacao_estadia"],tr[data-table="programacao_deslocamento"]')];
    for (const tr of visibleRows) {
      if (tr.dataset.table === 'programacao_estadia' && !validateEstadiaRow(tr, false)) invalid.push('Há hotel visível sem cidade/UF.');
      if (tr.dataset.table === 'programacao_deslocamento' && !validateDeslocamentoRow(tr, false)) invalid.push('Há frota visível sem placa.');
    }
    return [...new Set(invalid)];
  }

  function scheduleSaveRow(tr) {
    if (!tr) return;
    const key = `${tr.dataset.table}:${tr.dataset.colabId}`;
    clearTimeout(state.timers.get(key));
    state.timers.set(key, setTimeout(() => saveRow(tr), 450));
  }

  function scheduleSaveExtra(card) {
    if (!card) return;
    const key = `extra:${card.dataset.extraId}`;
    clearTimeout(state.timers.get(key));
    state.timers.set(key, setTimeout(() => saveExtra(card), 450));
  }

  function colabById(id) {
    return state.colaboradores.find((c) => String(c.id) === String(id));
  }

  function getFieldPayload(container, attr = 'data-field') {
    const payload = {};
    container.querySelectorAll(`[${attr}]`).forEach((field) => {
      const key = field.getAttribute(attr);
      if (field.type === 'checkbox') payload[key] = !!field.checked;
      else if (['km', 'valor'].includes(key)) payload[key] = toNumberBR(field.value);
      else if (key === 'uf') payload[key] = String(field.value || '').trim().toUpperCase() || null;
      else if (key === 'placa_veiculo') payload[key] = normalizePlate(field.value) || null;
      else payload[key] = field.value || null;
    });
    return payload;
  }

  async function saveRow(tr) {
    const table = tr.dataset.table;
    const colab = colabById(tr.dataset.colabId);
    if (!table || !colab) return;

    if (table === 'programacao_estadia' && !validateEstadiaRow(tr)) return;
    if (table === 'programacao_deslocamento' && !validateDeslocamentoRow(tr)) return;

    const payload = {
      ...getFieldPayload(tr),
      programacao_id: state.programacaoId,
      data_referencia: state.dataReferencia,
      colaborador_id: colab.id,
      nome_colaborador: colab.nome,
    };

    if (table === 'programacao_estadia') {
      payload.tem_estadia = payload.tipo_estadia && payload.tipo_estadia !== 'NÃO PRECISA';
      delete payload.diarias;
    }

    const { data, error } = await supabase
      .from(table)
      .upsert(payload, { onConflict: 'programacao_id,colaborador_id' })
      .select('*')
      .single();

    if (error) {
      console.error(error);
      setFeedback(`Falha ao salvar ${colab.nome}: ${error.message}`, 'error');
      return;
    }

    if (table === 'programacao_colaboradores') state.maps.disponibilidade.set(String(colab.id), data);
    if (table === 'programacao_estadia') state.maps.estadia.set(String(colab.id), data);
    if (table === 'programacao_alimentacao') state.maps.alimentacao.set(String(colab.id), data);
    if (table === 'programacao_deslocamento') state.maps.deslocamento.set(String(colab.id), data);

    updateStats();
    setFeedback(`Salvo automaticamente em ${new Date().toLocaleTimeString('pt-BR')}.`, 'ok');

    if (table === 'programacao_colaboradores') renderRows();
  }

  async function addExtra(colabId) {
    const colab = colabById(colabId);
    if (!colab) return;

    const { data, error } = await supabase
      .from('programacao_extras')
      .insert({
        programacao_id: state.programacaoId,
        data_referencia: state.dataReferencia,
        colaborador_id: colab.id,
        nome_colaborador: colab.nome,
        tipo_despesa: 'OUTRO',
        descricao: '',
        valor: 0,
        observacao: '',
      })
      .select('*')
      .single();

    if (error) {
      console.error(error);
      setFeedback(`Falha ao adicionar extra: ${error.message}`, 'error');
      return;
    }

    const arr = state.maps.extras.get(String(colab.id)) || [];
    arr.push(data);
    state.maps.extras.set(String(colab.id), arr);
    renderRows();
    setFeedback('Despesa extra adicionada.', 'ok');
  }

  async function saveExtra(card, opts = {}) {
    const extraId = card?.dataset.extraId;
    if (!extraId) return;
    const payload = getFieldPayload(card, 'data-extra-field');

    const { data, error } = await supabase
      .from('programacao_extras')
      .update(payload)
      .eq('id', extraId)
      .select('*')
      .single();

    if (error) {
      console.error(error);
      setFeedback(`Falha ao salvar extra: ${error.message}`, 'error');
      return;
    }

    const arr = state.maps.extras.get(String(data.colaborador_id)) || [];
    const idx = arr.findIndex((r) => r.id === data.id);
    if (idx >= 0) arr[idx] = data;
    state.maps.extras.set(String(data.colaborador_id), arr);
    if (!opts.silent) {
      setFeedback(`Extra salvo em ${new Date().toLocaleTimeString('pt-BR')}.`, 'ok');
      renderRows();
    }
  }

  async function deleteExtra(extraId) {
    if (!extraId) return;
    const { error } = await supabase.from('programacao_extras').delete().eq('id', extraId);
    if (error) {
      console.error(error);
      setFeedback(`Falha ao excluir extra: ${error.message}`, 'error');
      return;
    }
    for (const [key, arr] of state.maps.extras.entries()) {
      state.maps.extras.set(key, arr.filter((r) => r.id !== extraId));
    }
    renderRows();
    setFeedback('Despesa extra excluída.', 'ok');
  }

  async function saveProgramacao() {
    if (!state.programacaoId) {
      setFeedback('Carregue um contexto antes de salvar a programação.', 'warn');
      return;
    }

    try {
      el.saveBtn.disabled = true;
      el.saveBtn.textContent = 'Salvando...';
      setFeedback('Salvando programação...', 'warn');

      for (const timer of state.timers.values()) clearTimeout(timer);
      state.timers.clear();

      const rows = [...el.list.querySelectorAll('tr[data-table]:not([data-table="programacao_extras"])')];
      for (const tr of rows) await saveRow(tr);

      const extraCards = [...el.list.querySelectorAll('.prog-extra-card[data-extra-id]')];
      for (const card of extraCards) await saveExtra(card, { silent: true });

      const invalid = validateRequiredBeforeSave();
      if (invalid.length) {
        throw new Error(`Corrija antes de salvar: ${invalid.slice(0, 4).join(' | ')}${invalid.length > 4 ? '...' : ''}`);
      }

      const { error } = await supabase
        .from('programacao_dia')
        .update({ status: 'salvo', updated_at: new Date().toISOString() })
        .eq('id', state.programacaoId);

      if (error) throw error;

      setFeedback(`Programação salva com sucesso em ${new Date().toLocaleTimeString('pt-BR')}.`, 'ok');
    } catch (error) {
      console.error(error);
      setFeedback(error.message || 'Falha ao salvar programação.', 'error');
    } finally {
      el.saveBtn.disabled = false;
      el.saveBtn.textContent = 'Salvar programação';
    }
  }

  function setFeedback(message, type = '') {
    el.feedback.className = `feedback mt-16 ${type ? `prog-feedback-${type}` : ''}`;
    el.feedback.textContent = message;
  }

  init();
});
