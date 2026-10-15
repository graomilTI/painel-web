import { initProtectedPage } from './pageInit.js';
import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from './supabaseClient.js';
import { getCurrentUser, getUserContext } from './auth.js';
import { logActivity } from './activityLogger.js';
import { loadCustos, loadColaboradoresRegional, loadCruzamentoTipoContrato, tipoContratoLetra } from './programacao-equipe.js?v=20261015-ferias-escala1';
import { loadRosterDoDia, loadOsResumo, loadExtras } from './programacao-despesas.js?v=20261015-ferias-escala1';
import { renderProgramacaoListaDrawer } from './programacao-lista-drawer.js?v=20261015-ferias-escala1';
import { renderProgramacaoSemOs } from './programacao-sem-os.js?v=20261015-ferias-escala1';
import { renderProgramacaoTransferencias } from './programacao-transferencias.js?v=20261006-solicitar1';
import './programacao-persistencia-contexto.js?v=20260920-integrado1';
import './programacao-duplicacao-calendario.js?v=20260920-integrado1';
import './programacao-despesas-os-visual.js?v=20260920-integrado1';
import './programacao-compartilhar-os.js?v=20261001-sem-despesas';
import './programacao-carona-motorista.js?v=20260917-v6-carona-por-placa';
import './programacao-lista-prioridade-nao-atender.js?v=20260907-null-primeiro2';
import './gestor-mobile-modules-v2.js?v=20260813-modelos-v3';
import { TODAS_SUPERVISOES, STEPS, DISPONIBILIDADES_ETAPA_C, INDISPONIBILIDADE_MOTIVOS, TIPOS_ESTADIA_BOTOES, TIPOS_DESLOCAMENTO, DISPONIBILIDADES_LIBERADAS } from './programacao-constantes.js?v=20261015-nucleo1';
import './programacao-supervisoes-cache.js?v=20261014-modular1';
import './programacao-reabrir-ultima.js?v=20261014-modular1';
import './programacao-kpi-inline.js?v=20261014-modular1';
import './programacao-mobile-ui.js?v=20261014-modular1';
import './programacao-pdf-resumo.js?v=20261015-ferias-escala1';
import './programacao-indisponibilidade-sync.js?v=20261015-ferias-escala1';
import './programacao-indisponibilidade-rh-lock.js?v=20261014-modular1';
import './programacao-hospedagem-embarque.js?v=20261014-modular1';
import './programacao-regional-estrito.js?v=20261014-modular1';
import './programacao-grm-despesas-sync.js?v=20261014-modular1';
import './programacao-gestor-etapas.js?v=20261014-modular1';
import './programacao-gestor-abas.js?v=20261015-nucleo1';
import './programacao-drawer-layout.js?v=20261014-modular1';
import './programacao-drawer-ux.js?v=20261014-modular1';
import { debounce, escapeHtml, todayIso, brDate, normalizeCpf, colaboradorKey, moneyBR, normalizeText, normalizeUF, onlyPlate, firstFilled, pessoaMatchesColaborador, selectOptions, estadiaLabel, estadiaIcon, haversineKm, addDaysIso, getFieldPayload, extraCard } from './programacao-util.js?v=20261015-nucleo1';
import { disponibilidadeNorm, disponibilidadeCategoria, disponibilidadeMotivo, disponibilidadeLabel, isDisponibilidadeBloqueada, loadIndisponibilidades } from './programacao-disponibilidade.js?v=20261015-nucleo1';
import { normalizeAccessText, isColaboradorAtivo, getDeepValue, parseSupervisoes, looksLikeGestor, filterAllowedSupervisoes } from './programacao-acesso.js?v=20261015-nucleo1';
import { readCidadesCache, writeCidadesCache, cidadeUfFromOs, ufFromSupervisao, fetchTodosPontosAtivos, checkFobPendenciasBloqueantes } from './programacao-dados-base.js?v=20261015-nucleo1';
import { injectProgramacaoStyles } from './programacao-estilos.js?v=20261015-nucleo1';

export function renderContent(content) {
  injectProgramacaoStyles();

  content.innerHTML = `
    <section class="card prog-toolbar">
      <div class="prog-toolbar-row">
        <div class="prog-context-group">
          <div class="prog-tfield prog-tfield-sup">
            <label for="progSup">Supervisão</label>
            <select id="progSup"></select>
          </div>
          <div class="prog-tfield prog-tfield-date">
            <label for="progDataRef">Data</label>
            <input id="progDataRef" type="date" />
          </div>
          <button class="btn btn-primary" type="button" id="progLoadContext" title="Carregar colaboradores da supervisão/data selecionada">Carregar</button>
        </div>

        <div class="prog-toolbar-spacer"></div>

        <div class="prog-tfield prog-tfield-search" id="progSearchWrap">
          <label for="progSearch">Buscar</label>
          <input id="progSearch" type="text" placeholder="Nome, cargo ou supervisão..." />
        </div>
        <button class="prog-save-main" type="button" id="progSaveProgramacao" disabled title="As alterações já são salvas automaticamente — este botão confirma e finaliza a programação. Para a O.S. aparecer no Mapa Operacional, marque-a como &quot;Atender&quot; na etapa de equipe e programe para a data de hoje.">Salvar</button>
        <div class="prog-actions-block">
          <div class="prog-action-row">
            <button class="btn" type="button" id="progGerarPdf" title="Gera um PDF com OS, colaborador, deslocamento, estadia, refeições e extras do dia">📄 Gerar PDF</button>
            <button class="btn" type="button" id="progCompartilhar" title="Monta a mensagem de locais/colaboradores e motoristas/caronas do dia para compartilhar no WhatsApp">📤 Compartilhar</button>
          </div>
          <button class="btn prog-duplicate-btn" type="button" id="progDuplicar" title="Copia esta programação para até cinco datas">⧉ Duplicar</button>
        </div>
      </div>

      <div class="prog-toolbar-row prog-toolbar-row-steps">
        <div class="steps-wrap prog-steps-compact" id="progSteps" title="Clique em uma etapa para editar as necessidades em formato de tabela">
          ${STEPS.map((step) => `<button type="button" class="stepbtn ${step.code === 'A' ? 'active' : ''}" data-step="${step.code}">${step.code} · ${step.label}</button>`).join('')}
        </div>
        <div class="feedback" id="progCtxFeedback">Nenhuma programação carregada.</div>
      </div>
    </section>

    <section class="card mt-16 prog-list-card">
      <div class="prog-list" id="progList"></div>
    </section>
    <div class="prog-duplicate-backdrop" id="progDuplicateModal" hidden>
      <section class="prog-duplicate-modal" role="dialog" aria-modal="true" aria-labelledby="progDuplicateTitle">
        <header class="prog-duplicate-head"><div><h3 id="progDuplicateTitle">Selecione as datas para duplicar</h3><p>Você pode copiar a programação para até 5 dias.</p></div><button class="prog-duplicate-close" type="button" data-duplicate-close aria-label="Fechar">×</button></header>
        <div class="prog-duplicate-source" id="progDuplicateSource"></div>
        <div class="prog-duplicate-calendar-label"><span>Próximos 5 dias</span><span>Selecione um ou mais</span></div>
        <div class="prog-duplicate-dates" id="progDuplicateDates" role="group" aria-label="Próximos cinco dias"></div>
        <div class="prog-duplicate-options"><label class="prog-duplicate-checkbox" for="progDuplicateCopyStays"><input id="progDuplicateCopyStays" type="checkbox" checked><span>Copiar estadias?<small>Inclui hotel, alojamento, pernoite e novas solicitações de hospedagem.</small></span></label></div>
        <div class="prog-duplicate-note">Equipe por O.S., disponibilidade, alimentação, despesas e frota serão copiadas. Datas que já possuem programação serão preservadas.</div>
        <footer class="prog-duplicate-actions"><button class="prog-duplicate-cancel" type="button" data-duplicate-close>Cancelar</button><button class="prog-duplicate-confirm" id="progDuplicateConfirm" type="button">Duplicar programação</button></footer>
      </section>
    </div>
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
    duplicateBtn: document.getElementById('progDuplicar'),
    duplicateModal: document.getElementById('progDuplicateModal'),
    duplicateSource: document.getElementById('progDuplicateSource'),
    duplicateDates: document.getElementById('progDuplicateDates'),
    duplicateCopyStays: document.getElementById('progDuplicateCopyStays'),
    duplicateConfirm: document.getElementById('progDuplicateConfirm'),
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
    // Sob "Todas": programacaoId fica null e programacaoIdMap guarda
    // Map<supervisao, programacao_id> — cada colaborador/OS resolve o seu
    // próprio id de gravação pela própria supervisao (ver programacaoIdFor).
    programacaoIdMap: new Map(),
    supervisoesResolvidas: [],
    todasSupervisoes: [],
    colaboradores: [],
    colabsEmOsAtender: new Set(),
    cidades: [],
    alojamentos: [],
    veiculos: [],
    veiculoByPlaca: new Map(),
    pontosEmbarque: [],
    operacionalColabs: [],
    operacionalColabByCpf: new Map(),
    operacionalColabByNome: new Map(),
    kmCache: new Map(),
    osPorColaborador: new Map(),
    cruzamentoByCpf: new Map(),
    search: '',
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
    await Promise.all([loadCidadesBrasil(), loadAlojamentos(), loadVeiculosFrota(), loadBaseOperacional()]);
    await fillSupervisoes();
  }

  function programacaoIdFor(colab) {
    if (state.programacaoIdMap.size) return state.programacaoIdMap.get(colab?.supervisao || '') || null;
    return state.programacaoId;
  }

  function bindEvents() {
    window.__progLoadColaboradores = loadContext;
    window.__progGetProgramacaoId = () => state.programacaoId;
    window.__progGetProgramacaoIdMap = () => state.programacaoIdMap;
    // data do contexto efetivamente carregado (pode divergir do #progDataRef
    // se o usuário mexeu no campo sem clicar em Carregar de novo) — usado pelo
    // "Compartilhar" em programacao-pdf-tipo-fix.js pra não escrever a data
    // errada no cabeçalho da mensagem.
    window.__progGetDataReferencia = () => state.dataReferencia;
    // programacao-gestor-fluxo-avancado.js precisa saber quando loadContext()
    // (assíncrono — cria programacao_dia se a data/supervisão for nova, ex.:
    // programar adiantado) realmente termina, em vez de adivinhar com
    // setTimeout — por isso o próprio clique guarda a promise em
    // window.__progLoadColaboradoresPromise (ver hookLoadButton lá).
    el.loadBtn.addEventListener('click', () => {
      window.__progLoadColaboradoresPromise = loadContext();
    });
    el.saveBtn.addEventListener('click', saveProgramacao);
    el.duplicateBtn.addEventListener('click', openDuplicateModal);
    el.duplicateConfirm.addEventListener('click', duplicateProgramacao);
    el.duplicateModal.addEventListener('click', (event) => {
      if (event.target === el.duplicateModal || event.target.closest('[data-duplicate-close]')) closeDuplicateModal();
      const day = event.target.closest('[data-duplicate-date]');
      if (day) {
        day.classList.toggle('is-selected');
        day.setAttribute('aria-pressed', String(day.classList.contains('is-selected')));
      }
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !el.duplicateModal.hidden) closeDuplicateModal();
    });
    el.search.addEventListener('input', debounce(() => {
      state.search = el.search.value.trim().toLowerCase();
      renderRows();
    }, 220));
    el.steps.addEventListener('click', (event) => {
      const btn = event.target.closest('[data-step]');
      if (!btn) return;
      setStep(btn.dataset.step);
    });
    el.list.addEventListener('change', handleTableChange);
    el.list.addEventListener('input', handleTableInput);
    el.list.addEventListener('click', handleTableClick);
  }

  function renderDuplicateCalendar() {
    const baseIso = state.dataReferencia > todayIso() ? state.dataReferencia : todayIso();
    const weekdays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
    const months = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
    el.duplicateDates.innerHTML = Array.from({ length: 5 }, (_, index) => {
      const iso = addDaysIso(baseIso, index + 1);
      const date = new Date(`${iso}T12:00:00`);
      const selected = index === 0;
      return `<button class="prog-duplicate-day ${selected ? 'is-selected' : ''}" type="button" data-duplicate-date="${iso}" aria-pressed="${selected}" aria-label="${weekdays[date.getDay()]}, ${date.getDate()} de ${months[date.getMonth()]}"><span class="prog-duplicate-day-check">✓</span><span class="prog-duplicate-day-week">${weekdays[date.getDay()]}</span><strong class="prog-duplicate-day-number">${date.getDate()}</strong><span class="prog-duplicate-day-month">${months[date.getMonth()]}</span></button>`;
    }).join('');
  }

  function openDuplicateModal() {
    if (!state.programacaoId || state.programacaoIdMap.size) {
      setFeedback(state.programacaoIdMap.size ? 'Selecione uma única supervisão para duplicar a programação.' : 'Carregue uma programação antes de duplicar.', 'warn');
      return;
    }
    renderDuplicateCalendar();
    el.duplicateCopyStays.checked = true;
    el.duplicateSource.textContent = `Origem: ${state.supervisao} · ${brDate(state.dataReferencia)}`;
    el.duplicateModal.hidden = false;
    document.body.style.overflow = 'hidden';
  }

  function closeDuplicateModal() {
    el.duplicateModal.hidden = true;
    document.body.style.overflow = '';
    el.duplicateConfirm.disabled = false;
    el.duplicateConfirm.textContent = 'Duplicar programação';
  }

  async function duplicateProgramacao() {
    const unicas = [...el.duplicateDates.querySelectorAll('[data-duplicate-date].is-selected')].map((button) => button.dataset.duplicateDate);
    if (!unicas.length) {
      setFeedback('Selecione ao menos uma data para duplicar.', 'warn');
      return;
    }
    if (unicas.includes(state.dataReferencia)) {
      setFeedback('A data de destino deve ser diferente da data de origem.', 'warn');
      return;
    }
    try {
      el.duplicateConfirm.disabled = true;
      el.duplicateConfirm.textContent = 'Duplicando...';
      const { data, error } = await supabase.rpc('duplicar_programacao_dia', {
        p_programacao_id: state.programacaoId,
        p_datas: unicas,
        p_copiar_estadias: el.duplicateCopyStays.checked,
      });
      if (error) throw error;
      const copiadas = Array.isArray(data?.copiadas) ? data.copiadas : [];
      const ignoradas = Array.isArray(data?.ignoradas) ? data.ignoradas : [];
      if (copiadas.length) {
        logActivity('action', 'programacao_duplicada', 'programacao', {
          programacao_origem_id: state.programacaoId,
          data_origem: state.dataReferencia,
          datas_copiadas: copiadas,
          datas_preservadas: ignoradas,
          supervisao: state.supervisao,
          copiar_estadias: el.duplicateCopyStays.checked,
        });
      }
      closeDuplicateModal();
      const resumo = copiadas.length ? `Programação duplicada para ${copiadas.map(brDate).join(', ')}.` : 'Nenhuma programação foi duplicada.';
      const preservadas = ignoradas.length ? ` Datas já preenchidas e preservadas: ${ignoradas.map(brDate).join(', ')}.` : '';
      setFeedback(`${resumo}${preservadas}`, copiadas.length ? 'ok' : 'warn');
    } catch (error) {
      console.error('[programacao] duplicar:', error);
      el.duplicateConfirm.disabled = false;
      el.duplicateConfirm.textContent = 'Duplicar programação';
      setFeedback(error.message || 'Não foi possível duplicar a programação.', 'error');
    }
  }

  function showFobBlockedMessage(rows) {
    const detalhes = rows.slice(0, 5).map((r) => `OS ${r.numero_os || '-'} • ${brDate(r.data_referencia)} • ${r.cliente || '-'}`).join(' | ');
    setFeedback(`Programação bloqueada: existem ${rows.length} FOB(s) anteriores sem validação do gestor. Valide na aba Logística > FOB. ${detalhes}`, 'error');
    el.list.innerHTML = `<div class="table-empty">Programação bloqueada por FOB pendente de validação.<br>Abra <strong>Logística &gt; FOB</strong>, marque todos como válidos ou inválidos e carregue novamente.</div>`;
  }

  async function loadCidadesBrasil() {
    const cached = readCidadesCache();
    if (cached) {
      state.cidades = cached;
      ensureCidadeDatalist();
      return;
    }
    try {
      const resp = await fetch('https://servicodados.ibge.gov.br/api/v1/localidades/municipios?orderBy=nome');
      const data = await resp.json();
      state.cidades = (Array.isArray(data) ? data : []).map((m) => ({
        nome: m.nome,
        uf: m.microrregiao?.mesorregiao?.UF?.sigla || '',
        label: `${m.nome} - ${m.microrregiao?.mesorregiao?.UF?.sigla || ''}`,
        key: normalizeText(`${m.nome} ${m.microrregiao?.mesorregiao?.UF?.sigla || ''}`),
      })).filter((m) => m.nome && m.uf);
      ensureCidadeDatalist();
      writeCidadesCache(state.cidades);
    } catch (error) {
      console.warn('Não foi possível carregar cidades do IBGE.', error);
      state.cidades = [];
    }
  }

  async function loadAlojamentos() {
    try {
      const { data, error } = await supabase
        .from('hospedagem_alojamentos')
        .select('id,nome,cidade,uf,tipo,capacidade,quartos,status,prioridade,endereco')
        .eq('status', 'ATIVO')
        .order('cidade', { ascending: true });
      if (error) throw error;
      state.alojamentos = data || [];
    } catch (error) {
      console.warn('Não foi possível carregar alojamentos para sugestão.', error);
      state.alojamentos = [];
    }
  }

  async function loadVeiculosFrota() {
    const normalizeRows = (rows) => (rows || []).map((v) => {
      const placa = onlyPlate(v.placa || v.identificacao || v.patrimonio_placa || v.veiculo_placa || v.codigo || v.tombamento);
      if (!placa) return null;

      const motoristaNome = firstFilled(
        v.motorista_atual,
        v.motorista,
        v.condutor,
        v.condutor_atual,
        v.patrimonio_funcionario,
        v.colaborador,
        v.colaborador_nome,
        v.funcionario,
        v.responsavel,
        v.nome_responsavel
      );
      const motoristaCpf = normalizeCpf(firstFilled(
        v.motorista_cpf,
        v.condutor_cpf,
        v.colaborador_cpf,
        v.funcionario_cpf,
        v.responsavel_cpf,
        v.cpf
      ));

      return {
        placa,
        motoristaNome,
        motoristaCpf,
        raw: v,
        label: [placa, v.modelo || v.nome || v.descricao || v.marca, v.cor, motoristaNome ? `Atual: ${motoristaNome}` : 'sem vínculo identificado'].filter(Boolean).join(' · '),
      };
    }).filter(Boolean);
    try {
      const { data, error } = await supabase.from('frotas_veiculos').select('*').order('placa', { ascending: true }).limit(1000);
      if (error) throw error;
      state.veiculos = normalizeRows(data);
      if (state.veiculos.length) { indexVeiculos(); ensureVeiculosDatalist(); return; }
    } catch (error) {
      console.warn('Não foi possível carregar frotas_veiculos.', error);
    }
    try {
      const { data, error } = await supabase.from('patrimonios_snapshot').select('*').limit(1500);
      if (error) throw error;
      state.veiculos = normalizeRows(data);
    } catch (error) {
      console.warn('Não foi possível carregar patrimonios_snapshot para placas.', error);
      state.veiculos = [];
    }
    indexVeiculos();
    ensureVeiculosDatalist();
  }

  async function loadCruzamento(cpfs) {
    state.cruzamentoByCpf = new Map();
    if (!cpfs.length) return;
    try {
      const { data, error } = await supabase
        .from('colaborador_cruzamento')
        .select('cpf,veiculo_placa,latitude,longitude,tipo_contrato,auditorias_180d_qtd,auditorias_180d_peso')
        .in('cpf', cpfs);
      if (error) throw error;
      (data || []).forEach((row) => state.cruzamentoByCpf.set(normalizeCpf(row.cpf), row));
    } catch (error) {
      console.warn('Não foi possível carregar colaborador_cruzamento.', error);
    }
  }

  async function loadBaseOperacional() {
    try {
      const [colabs, pontos] = await Promise.all([
        supabase.from('operacional_colaborador_base').select('id,colaborador_id,nome,cpf,latitude,longitude,ativo').eq('ativo', true).limit(5000),
        fetchTodosPontosAtivos('id,nome_local,cidade,uf,latitude,longitude,ativo'),
      ]);
      if (!colabs.error) state.operacionalColabs = colabs.data || [];
      if (!pontos.error) state.pontosEmbarque = pontos.data || [];
    } catch (error) {
      console.warn('Não foi possível carregar base operacional para cálculo de KM.', error);
      state.operacionalColabs = [];
      state.pontosEmbarque = [];
    }
    state.operacionalColabByCpf = new Map();
    state.operacionalColabByNome = new Map();
    state.operacionalColabs.forEach((row) => {
      const cpf = normalizeCpf(row.cpf);
      if (cpf && !state.operacionalColabByCpf.has(cpf)) state.operacionalColabByCpf.set(cpf, row);
      const nome = normalizeText(row.nome);
      if (nome && !state.operacionalColabByNome.has(nome)) state.operacionalColabByNome.set(nome, row);
    });
    state.pontosEmbarqueById = new Map((state.pontosEmbarque || []).map((p) => [p.id, p]));
  }

  function findOperacionalColab(colab) {
    const cpf = normalizeCpf(colab?.cpf);
    if (cpf && state.operacionalColabByCpf.has(cpf)) return state.operacionalColabByCpf.get(cpf);
    const nome = normalizeText(colab?.nome);
    return (nome && state.operacionalColabByNome.get(nome)) || null;
  }

  function getOsForColab(colab) {
    if (!colab) return null;
    const base = findOperacionalColab(colab);
    const idKey = normalizeCpf(base?.colaborador_id);
    const cpfKey = normalizeCpf(colab.cpf || base?.cpf);
    const nomeKey = normalizeText(colab.nome || '').trim().toUpperCase();
    return state.osPorColaborador.get(idKey)
      || state.osPorColaborador.get(cpfKey)
      || state.osPorColaborador.get(nomeKey)
      || null;
  }

  function findPontoFromOs(os) {
    if (!os) return null;
    if (Number.isFinite(Number(os.ponto1_latitude)) && Number.isFinite(Number(os.ponto1_longitude))) {
      return { latitude: Number(os.ponto1_latitude), longitude: Number(os.ponto1_longitude), nome: os.embarque || 'Ponto da O.S.' };
    }
    if (os.ponto_embarque_id) {
      const ponto = state.pontosEmbarqueById?.get(os.ponto_embarque_id);
      if (ponto && Number.isFinite(Number(ponto.latitude)) && Number.isFinite(Number(ponto.longitude))) return ponto;
    }
    const emb = normalizeText(os.embarque || os.local_embarque || '');
    if (!emb) return null;
    const candidates = (state.pontosEmbarque || []).filter((p) => {
      const label = normalizeText(`${p.uf || ''} ${p.cidade || ''} ${p.nome_local || ''}`);
      return label && (label.includes(emb) || emb.includes(label) || normalizeText(p.nome_local).includes(emb) || emb.includes(normalizeText(p.nome_local)));
    }).filter((p) => Number.isFinite(Number(p.latitude)) && Number.isFinite(Number(p.longitude)));
    return candidates[0] || null;
  }

  function kmEstimadoColaborador(colab) {
    const cacheKey = String(colab?.id || '');
    if (cacheKey && state.kmCache.has(cacheKey)) return state.kmCache.get(cacheKey);

    const os = getOsForColab(colab);

    let result;
    if (!os) {
      result = { km: null, motivo: 'Sem O.S. vinculada ao colaborador.' };
    } else if (Number.isFinite(Number(os.distancia_km))) {
      result = { km: Number(os.distancia_km), motivo: 'Distância da indicação da O.S.' };
    } else {
      const base = findOperacionalColab(colab);
      const ponto = findPontoFromOs(os);
      if (!base || !Number.isFinite(Number(base.latitude)) || !Number.isFinite(Number(base.longitude))) {
        result = { km: null, motivo: 'Casa/base do colaborador sem coordenadas.' };
      } else if (!ponto) {
        result = { km: null, motivo: 'Ponto de embarque sem coordenadas.' };
      } else {
        const km = haversineKm(base.latitude, base.longitude, ponto.latitude, ponto.longitude);
        result = Number.isFinite(km) ? { km, motivo: `Casa → ${ponto.nome_local || ponto.nome || 'ponto de embarque'}` } : { km: null, motivo: 'Coordenadas insuficientes.' };
      }
    }

    if (cacheKey) state.kmCache.set(cacheKey, result);
    return result;
  }

  function ensureCidadeDatalist() {
    let list = document.getElementById('progCidadesBrasilList');
    if (!list) {
      list = document.createElement('datalist');
      list.id = 'progCidadesBrasilList';
      document.body.appendChild(list);
    }
    list.innerHTML = (state.cidades || []).map((c) => `<option value="${escapeHtml(c.label)}"></option>`).join('');
  }

  function ensureVeiculosDatalist() {
    let list = document.getElementById('progVeiculosFrotaList');
    if (!list) {
      list = document.createElement('datalist');
      list.id = 'progVeiculosFrotaList';
      document.body.appendChild(list);
    }
    list.innerHTML = (state.veiculos || []).map((v) => `<option value="${escapeHtml(v.placa)}">${escapeHtml(v.label)}</option>`).join('');
  }

  function matchCidade(value, ufValue = '') {
    const text = String(value || '').trim();
    const uf = normalizeUF(ufValue);
    const normalized = normalizeText(text.replace(/\s+-\s+[A-Z]{2}$/i, ''));
    const explicitUf = normalizeUF((text.match(/-\s*([A-Z]{2})$/i) || [])[1] || uf);
    return (state.cidades || []).find((c) => normalizeText(c.nome) === normalized && (!explicitUf || c.uf === explicitUf))
      || (state.cidades || []).find((c) => c.key === normalizeText(`${text} ${uf}`));
  }

  function alojamentoOptions(selectedId, cidade, uf) {
    const cidadeNorm = normalizeText(cidade);
    const ufNorm = normalizeUF(uf) || ufFromSupervisao(state.supervisao);
    const porRegional = ufNorm ? (state.alojamentos || []).filter((a) => normalizeUF(a.uf) === ufNorm) : (state.alojamentos || []);
    const rows = cidadeNorm ? porRegional.filter((a) => normalizeText(a.cidade) === cidadeNorm) : porRegional;
    const all = rows.length ? rows : porRegional;
    return `<option value="">Selecionar alojamento</option>` + all.map((a) => {
      const label = `${a.nome} · ${a.cidade || '-'}/${a.uf || ''}${a.capacidade ? ` · Cap. ${a.capacidade}` : ''}`;
      return `<option value="${escapeHtml(a.id)}" ${String(selectedId || '') === String(a.id) ? 'selected' : ''}>${escapeHtml(label)}</option>`;
    }).join('');
  }

  function indexVeiculos() {
    state.veiculoByPlaca = new Map((state.veiculos || []).map((v) => [onlyPlate(v.placa), v]));
  }

  function findVeiculoByPlaca(placa) {
    const normalized = onlyPlate(placa);
    if (!normalized) return null;
    return state.veiculoByPlaca.get(normalized) || null;
  }

  function patrimonioMessageForRow(colab, tipoDeslocamento, placa) {
    const tipo = normalizeText(tipoDeslocamento);
    const normalizedPlate = onlyPlate(placa);
    if (tipo !== 'MOTORISTA FROTA' || !normalizedPlate || normalizedPlate.length < 7) return '';

    const veiculo = findVeiculoByPlaca(normalizedPlate);
    if (!veiculo) {
      return `Placa ${normalizedPlate} não localizada na base de patrimônios/frota. Solicitar leitura do patrimônio para confirmar o veículo.`;
    }

    // O spread de veiculo.raw vem ANTES dos campos calculados: frotas_veiculos
    // tem uma coluna "nome" que é o nome/apelido do veículo (ex.: "MOBI LIKE -
    // SHV7F36"), não do motorista — se viesse depois, sobrescrevia o nome
    // correto do motorista_atual e gerava falso alerta de divergência.
    const pessoa = {
      ...((veiculo.raw && typeof veiculo.raw === 'object') ? veiculo.raw : {}),
      nome: veiculo.motoristaNome,
      cpf: veiculo.motoristaCpf,
      motorista: veiculo.motoristaNome,
    };

    if (pessoaMatchesColaborador(pessoa, colab)) return '';

    const vinculo = veiculo.motoristaNome || 'sem colaborador vinculado identificado';
    return `Atenção: o veículo ${normalizedPlate} está vinculado a ${vinculo}, não a ${colab?.nome || 'este motorista'}. Solicitar leitura do patrimônio.`;
  }

  function updatePatrimonioAlert(tr) {
    if (!tr) return;
    const alert = tr.querySelector('[data-patrimonio-alert]');
    if (!alert) return;
    const colab = colabById(tr.dataset.colabId);
    const tipo = tr.querySelector('[data-field="tipo_deslocamento"]')?.value || '';
    const placa = tr.querySelector('[data-field="placa_veiculo"]')?.value || '';
    const message = patrimonioMessageForRow(colab, tipo, placa);
    alert.textContent = message;
    alert.classList.toggle('show', Boolean(message));
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

    const coordenacao = appUser?.coordenacao || getDeepValue(context, 'user.coordenacao') || '';

    const allowedSupervisoes = [
      ...parseSupervisoes(appUser?.supervisao),
      ...parseSupervisoes(coordenacao),
      ...parseSupervisoes(context.supervisoes),
      ...parseSupervisoes(context.supervisao),
      ...parseSupervisoes(getDeepValue(context, 'user.supervisoes')),
      ...parseSupervisoes(getDeepValue(context, 'user.supervisao')),
    ];

    return {
      restricted: !isMaster && (isGestor || allowedSupervisoes.length > 0),
      allowedSupervisoes: [...new Set(allowedSupervisoes)],
      role,
      setor,
      departmentName,
      departmentCode,
      coordenacao,
    };
  }

  async function loadOsAtender(dataReferencia, supervisao) {
    const set = new Set();
    state.osPorColaborador = new Map();
    try {
      let query = supabase
        .from('operacional_os')
        .select('*')
        .eq('status_gestor', 'ATENDER');
      query = Array.isArray(supervisao) ? query.in('supervisao', supervisao) : query.eq('supervisao', supervisao);
      const { data: osRows } = await query;
      const atenderRows = osRows || [];
      if (!atenderRows.length) return set;
      const osMap = new Map((atenderRows || []).map((r) => [String(r.id), r]));
      const { data: colabRows } = await supabase
        .from('operacional_os_colaboradores')
        .select('*')
        .in('os_id', atenderRows.map((r) => r.id));
      (colabRows || []).forEach((r) => {
        const os = { ...(osMap.get(String(r.os_id)) || {}), distancia_km: r.distancia_km };
        const cpf = normalizeCpf(r.colaborador_cpf || r.cpf);
        const key = String(r.colaborador_key || r.colaborador_id || '').trim();
        const nomeKey = normalizeText(r.colaborador_nome || r.nome_colaborador || r.nome || '').trim().toUpperCase();
        if (cpf) set.add(cpf);
        if (key) set.add(key);
        if (nomeKey) set.add(nomeKey);
        if (cpf) state.osPorColaborador.set(cpf, os);
        if (key) state.osPorColaborador.set(key, os);
        if (nomeKey) state.osPorColaborador.set(nomeKey, os);
      });
    } catch (e) {
      console.warn('Não foi possível carregar OS ATENDER.', e);
    }
    return set;
  }

  function colabEmOsAtender(colab) {
    if (!state.colabsEmOsAtender.size) return false;
    const cpf = normalizeCpf(colab.cpf);
    if (cpf && state.colabsEmOsAtender.has(cpf)) return true;
    const id = String(colab.id || '').trim();
    if (id && state.colabsEmOsAtender.has(id)) return true;
    const nomeKey = normalizeText(colab.nome || '').trim().toUpperCase();
    return Boolean(nomeKey && state.colabsEmOsAtender.has(nomeKey));
  }

  function colaboradorPodeFicarOk(colab) {
    return colabEmOsAtender(colab);
  }

  function suggestVeiculoForColab(colab) {
    // O cruzamento colaborador↔veículo é pré-calculado no banco (tabela
    // colaborador_cruzamento, atualizada por pg_cron) — aqui é só leitura
    // O(1), sem refazer matching de nome/CPF no navegador a cada colaborador.
    const cpfColab = normalizeCpf(colab?.cpf);
    const row = cpfColab ? state.cruzamentoByCpf.get(cpfColab) : null;
    return row?.veiculo_placa ? { placa: row.veiculo_placa } : null;
  }

  function updatePlacaLogisticaAlert(tr) {
    if (!tr) return;
    const alert = tr.querySelector('.prog-placa-alert');
    if (!alert) return;
    const colab = colabById(tr.dataset.colabId);
    const placa = tr.querySelector('[data-field="placa_veiculo"]')?.value || '';
    const msg = placa ? patrimonioMessageForRow(colab, 'MOTORISTA FROTA', placa) : '';
    alert.textContent = msg;
    alert.classList.toggle('show', Boolean(msg));
  }

  async function fillSupervisoes() {
    el.sup.innerHTML = '<option value="">Selecione...</option>';
    el.sup.disabled = false;

    const { data, error } = await supabase
      .from('supervisoes')
      .select('nome')
      .eq('ativo', true)
      .order('nome', { ascending: true });

    if (error) {
      setFeedback(`Erro ao carregar supervisões: ${error.message}`, 'error');
      return;
    }

    const todasSupervisoes = (data || []).map((r) => String(r.nome || '').trim()).filter(Boolean);
    state.todasSupervisoes = todasSupervisoes;
    const supervisoes = filterAllowedSupervisoes(todasSupervisoes, state.access);

    if (state.access?.restricted && !supervisoes.length) {
      el.sup.disabled = true;
      setFeedback('Seu usuário está como Gestor, mas não possui supervisão liberada. Ajuste a supervisão no cadastro do usuário.', 'error');
      return;
    }

    // Checagem por chave normalizada (não só valor exato) porque
    // programacao-gestor-filtro-fix.js roda em paralelo (MutationObserver +
    // window.load) e pode inserir opções no MESMO <select> nesta janela entre
    // o innerHTML de reset acima e este forEach — sem isso, a mesma
    // supervisão aparecia duplicada no dropdown (ex.: "SP - Avaré" 2x).
    const existing = new Set([...el.sup.options].map((opt) => normalizeAccessText(opt.value || opt.textContent)));
    supervisoes.forEach((sup) => {
      const key = normalizeAccessText(sup);
      if (key && existing.has(key)) return;
      const option = document.createElement('option');
      option.value = sup;
      option.textContent = sup;
      el.sup.appendChild(option);
      if (key) existing.add(key);
    });

    if (supervisoes.length === 1) {
      el.sup.value = supervisoes[0];
      el.sup.disabled = true;
      setFeedback(`Supervisão limitada ao acesso do usuário: ${supervisoes[0]}.`, 'ok');
    } else if (state.access?.restricted) {
      setFeedback(`Supervisões liberadas para este gestor: ${supervisoes.length}.`, 'ok');
    }
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

  async function loadContext() {
    const dataReferencia = el.dataRef.value;
    const supervisao = el.sup.value;
    if (!dataReferencia || !supervisao) {
      setFeedback('Selecione a data e a supervisão.', 'warn');
      return;
    }

    const isTodas = supervisao === TODAS_SUPERVISOES;

    if (!isTodas) {
      const allowedNow = filterAllowedSupervisoes([supervisao], state.access);
      if (state.access?.restricted && !allowedNow.includes(supervisao)) {
        setFeedback('Esta supervisão não está liberada para o seu usuário.', 'error');
        return;
      }
    }

    state.dataReferencia = dataReferencia;
    state.supervisao = supervisao;
    setFeedback('Carregando contexto...', 'warn');
    el.saveBtn.disabled = true;
    el.list.innerHTML = '<div class="table-empty">Carregando colaboradores...</div>';

    try {
      let supervisoesQuery = supervisao;
      if (isTodas) {
        const permitidas = filterAllowedSupervisoes(state.todasSupervisoes, state.access);
        const { data: comOs, error: comOsErr } = await supabase.rpc('programacao_supervisoes_com_os_acionavel', { p_supervisoes: permitidas });
        if (comOsErr) throw comOsErr;
        supervisoesQuery = (comOs || []).map((r) => r.supervisao).filter(Boolean);
        if (!supervisoesQuery.length) throw new Error('Nenhuma supervisão liberada tem O.S. acionável no momento.');
      }
      state.supervisoesResolvidas = isTodas ? supervisoesQuery : [supervisao];

      // As 3 consultas abaixo não dependem entre si — só de data/supervisão —
      // mas eram feitas em sequência (uma esperando a outra terminar). Isso
      // sozinho já multiplicava a latência de rede.
      const [fobsPendentes, indisponibilidades, colabsEmOsAtender] = await Promise.all([
        checkFobPendenciasBloqueantes(dataReferencia, supervisoesQuery),
        loadIndisponibilidades(dataReferencia),
        loadOsAtender(dataReferencia, supervisoesQuery),
      ]);

      if (fobsPendentes.length) {
        showFobBlockedMessage(fobsPendentes);
        el.saveBtn.disabled = true;
        return;
      }

      let colabQuery = supabase
        .from('colaboradores_atuais')
        .select('*')
        .order('nome', { ascending: true });
      colabQuery = isTodas ? colabQuery.in('supervisao', supervisoesQuery) : colabQuery.eq('supervisao', supervisao);
      const { data: colaboradores, error: colabError } = await colabQuery;

      if (colabError) throw colabError;

      const _seenColabs = new Set();
      const colaboradoresAtivos = (colaboradores || []).filter(isColaboradorAtivo).filter((colab) => {
        const cpf = normalizeCpf(colab.cpf);
        const key = cpf || normalizeText(String(colab.nome || '')).trim().toUpperCase();
        if (!key || _seenColabs.has(key)) return false;
        _seenColabs.add(key);
        return true;
      });

      if (isTodas) {
        const coordenacaoPorSupervisao = new Map();
        colaboradoresAtivos.forEach((colab) => {
          if (!coordenacaoPorSupervisao.has(colab.supervisao)) coordenacaoPorSupervisao.set(colab.supervisao, colab.coordenacao || '');
        });
        const idMap = new Map();
        await Promise.all(supervisoesQuery.map(async (sup) => {
          const programacao = await ensureProgramacaoDia(dataReferencia, sup, coordenacaoPorSupervisao.get(sup) || '');
          idMap.set(sup, programacao.id);
        }));
        state.programacaoIdMap = idMap;
        state.programacaoId = null;
      } else {
        const programacao = await ensureProgramacaoDia(dataReferencia, supervisao, colaboradoresAtivos?.[0]?.coordenacao || '');
        state.programacaoId = programacao.id;
        state.programacaoIdMap = new Map();
      }

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

      state.colabsEmOsAtender = colabsEmOsAtender;
      state.kmCache = new Map();
      await loadCruzamento(state.colaboradores.map((colab) => colab.cpf).filter(Boolean));
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
    if (!state.programacaoId && !state.programacaoIdMap.size) return;
    if (!state.colaboradores.length) return;

    const programacaoIds = state.programacaoIdMap.size
      ? [...state.programacaoIdMap.values()]
      : [state.programacaoId];

    // Antes de upsertar, guarda quem já tinha linha nesta programação. A
    // promoção SEM EMBARQUE -> OK abaixo só pode valer pra quem NÃO existia
    // ainda (default de criação) — senão ela reclassifica, a cada "Carregar",
    // uma decisão manual que o gestor já tinha salvo (ex.: programação feita
    // um dia adiantada), fazendo a escolha "sumir" no carregamento seguinte.
    const { data: existentes, error: existentesError } = await supabase
      .from('programacao_colaboradores')
      .select('programacao_id,colaborador_id')
      .in('programacao_id', programacaoIds);
    if (existentesError) throw existentesError;
    const jaExistiam = new Set((existentes || []).map((r) => `${r.programacao_id}:${r.colaborador_id}`));

    const payload = state.colaboradores.map((colab) => {
      const motivo = disponibilidadeNorm(colab.indisponibilidade?.motivo || '');
      const veiculoVinculado = !colab.indisponibilidade && !colaboradorPodeFicarOk(colab) ? suggestVeiculoForColab(colab) : null;
      const disponibilidade = colab.indisponibilidade
        ? (INDISPONIBILIDADE_MOTIVOS.includes(motivo) ? motivo : 'ATESTADO')
        : (colaboradorPodeFicarOk(colab) ? 'OK' : (veiculoVinculado ? 'LOGISTICA' : 'SEM EMBARQUE'));
      return {
        programacao_id: programacaoIdFor(colab),
        data_referencia: state.dataReferencia,
        colaborador_id: colab.id,
        nome_colaborador: colab.nome,
        cargo: colab.cargo || null,
        coordenacao: colab.coordenacao || null,
        supervisao: colab.supervisao || null,
        disponibilidade,
        placa_veiculo: veiculoVinculado ? onlyPlate(veiculoVinculado.placa) : null,
      };
    }).filter((p) => p.programacao_id);

    const { error } = await supabase
      .from('programacao_colaboradores')
      .upsert(payload, { onConflict: 'programacao_id,colaborador_id', ignoreDuplicates: true });
    if (error) throw error;

    // Promove SEM EMBARQUE → OK só para quem acabou de ser criado agora
    // (agrupado por programacao_id, pois sob "Todas" cada supervisão tem o seu)
    const porProgramacaoId = new Map();
    payload
      .filter((p) => p.disponibilidade === 'OK' && !jaExistiam.has(`${p.programacao_id}:${p.colaborador_id}`))
      .forEach((p) => {
        if (!porProgramacaoId.has(p.programacao_id)) porProgramacaoId.set(p.programacao_id, []);
        porProgramacaoId.get(p.programacao_id).push(p.colaborador_id);
      });
    await Promise.all([...porProgramacaoId.entries()].map(([pid, ids]) => supabase
      .from('programacao_colaboradores')
      .update({ disponibilidade: 'OK' })
      .eq('programacao_id', pid)
      .in('colaborador_id', ids)
      .eq('disponibilidade', 'SEM EMBARQUE')));
  }

  async function loadStageData() {
    const pids = state.programacaoIdMap.size ? [...state.programacaoIdMap.values()] : [state.programacaoId];
    const [disp, estadia, alimentacao, deslocamento, extras] = await Promise.all([
      supabase.from('programacao_colaboradores').select('*').in('programacao_id', pids),
      supabase.from('programacao_estadia').select('*').in('programacao_id', pids),
      supabase.from('programacao_alimentacao').select('*').in('programacao_id', pids),
      supabase.from('programacao_deslocamento').select('*').in('programacao_id', pids),
      supabase.from('programacao_extras').select('*').in('programacao_id', pids).order('created_at', { ascending: true }),
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
    if (el.currentStep) el.currentStep.textContent = meta.code;
    if (el.currentStepLabel) el.currentStepLabel.textContent = meta.label;
    [...el.steps.querySelectorAll('.stepbtn')].forEach((btn) => btn.classList.toggle('active', btn.dataset.step === step));
    renderRows();
  }

  function disponibilidadeAtual(colab) {
    const row = state.maps.disponibilidade.get(String(colab.id));
    return disponibilidadeNorm(row?.disponibilidade || 'OK');
  }

  function isBlocked(colab) {
    const disp = disponibilidadeCategoria(disponibilidadeAtual(colab));
    if (disp === 'OK' && !colaboradorPodeFicarOk(colab)) return true;
    return isDisponibilidadeBloqueada(disponibilidadeAtual(colab));
  }

  function splitByDisponibilidade(rows) {
    const disponiveis = [];
    const bloqueados = [];
    (rows || []).forEach((colab) => (isBlocked(colab) ? bloqueados : disponiveis).push(colab));
    return { disponiveis, bloqueados };
  }

  function updateStats() {
    if (el.statTotal) el.statTotal.textContent = String(state.colaboradores.length);
    if (el.statBlocked) el.statBlocked.textContent = String(state.colaboradores.filter(isBlocked).length);
  }

  function filteredColaboradores() {
    return state.colaboradores.filter((colab) => {
      if (!state.search) return true;
      return `${colab.nome} ${colab.cargo} ${colab.supervisao} ${colab.coordenacao}`.toLowerCase().includes(state.search);
    });
  }

  function renderRows() {
    if (!state.programacaoId && !state.programacaoIdMap.size) {
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
      ${!colaboradorPodeFicarOk(colab) ? '<div class="colab-meta">Sem O.S. em ATENDER vinculada para permitir OK.</div>' : ''}
      <div style="margin-top:6px"><span class="prog-status ${blocked ? 'block' : 'ok'}">${blocked ? 'Bloqueado' : 'Liberado'}</span></div>
    `;
  }

  function renderDisponibilidade(rows) {
    // Quem já foi confirmado para atender uma O.S. na etapa B (Organizar
    // Equipe) não aparece mais aqui — esta etapa é só para quem não atende.
    const naoAtende = rows.filter((colab) => disponibilidadeCategoria(disponibilidadeAtual(colab)) !== 'OK');
    const { disponiveis, bloqueados } = splitByDisponibilidade(naoAtende);
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
                const categoria = disponibilidadeCategoria(r.disponibilidade || 'OK');
                const motivo = disponibilidadeMotivo(r.disponibilidade || '');
                const placa = r.placa_veiculo || '';
                const sugestao = categoria === 'LOGISTICA' && !placa ? suggestVeiculoForColab(colab) : null;
                const placaSugerida = sugestao?.placa || '';
                const alertMsg = placa ? patrimonioMessageForRow(colab, 'MOTORISTA FROTA', placa) : '';
                return `<tr data-colab-id="${escapeHtml(colab.id)}" data-table="programacao_colaboradores">
                  <td>${colabCell(colab)}</td>
                  <td>
                    <div class="prog-tipo-selector">
                      ${DISPONIBILIDADES_ETAPA_C.map((op) => {
                        return `<button type="button" class="prog-tipo-btn${categoria === op ? ' active' : ''}" data-tipo="${escapeHtml(op)}">${escapeHtml(disponibilidadeLabel(op))}</button>`;
                      }).join('')}
                      <input type="hidden" data-field="disponibilidade" value="${escapeHtml(categoria === 'INDISPONIVEL' ? (motivo || 'ATESTADO') : categoria)}" />
                    </div>
                    ${categoria === 'INDISPONIVEL' ? `<div class="prog-indisponivel-wrap">
                      <select data-indisponivel-motivo>${INDISPONIBILIDADE_MOTIVOS.map((op) => `<option value="${escapeHtml(op)}" ${String(motivo || 'ATESTADO') === op ? 'selected' : ''}>${escapeHtml(disponibilidadeLabel(op))}</option>`).join('')}</select>
                    </div>` : ''}
                    ${categoria === 'LOGISTICA' ? `<div class="prog-placa-wrap">
                      <input data-field="placa_veiculo" list="progVeiculosFrotaList" type="text" maxlength="8" value="${escapeHtml(placa)}" placeholder="${placaSugerida ? 'Sugestão: ' + placaSugerida : 'Digite a placa'}" />
                      ${placaSugerida && !placa ? `<button type="button" class="prog-placa-suggest-btn" data-placa="${escapeHtml(placaSugerida)}">Usar ${escapeHtml(placaSugerida)}</button>` : ''}
                      <div class="prog-placa-alert${alertMsg ? ' show' : ''}">${escapeHtml(alertMsg)}</div>
                    </div>` : ''}
                  </td>
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
                <td><span class="prog-status block">${escapeHtml(disponibilidadeLabel(r.disponibilidade || 'BLOQUEADO'))}</span></td>
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
          <thead><tr><th>Colaborador</th><th>Tipo de hospedagem</th><th>Cidade</th><th>UF</th><th>Alojamento sugerido</th><th>Check-in</th><th>Check-out</th><th>Observação</th></tr></thead>
          <tbody>
            ${disponiveis.map((colab) => {
              const r = state.maps.estadia.get(String(colab.id)) || {};
              const blocked = isBlocked(colab);
              const tipoAtual = normalizeText(r.tipo_estadia || '');
              return `<tr data-colab-id="${escapeHtml(colab.id)}" data-table="programacao_estadia">
                <td>${colabCell(colab)}</td>
                <td>
                  <div class="prog-estadia-selector" data-estadia-selector>
                    ${TIPOS_ESTADIA_BOTOES.map((tipo) => `<button type="button" class="prog-estadia-card${tipoAtual === tipo ? ' active' : ''}" data-estadia-tipo="${escapeHtml(tipo)}" ${blocked ? 'disabled' : ''}>${estadiaIcon(tipo)}<span>${escapeHtml(estadiaLabel(tipo))}</span></button>`).join('')}
                  </div>
                  <input data-field="tipo_estadia" type="hidden" value="${escapeHtml(tipoAtual)}" />
                  ${!tipoAtual ? '<div class="prog-required-note prog-required-note--info">Casa (nenhuma opção selecionada).</div>' : ''}
                </td>
                <td><input data-field="cidade" list="progCidadesBrasilList" type="text" value="${escapeHtml(r.cidade || '')}" placeholder="Digite e selecione a cidade" ${blocked ? 'disabled' : ''}/></td>
                <td><input data-field="uf" type="text" value="${escapeHtml(r.uf || '')}" placeholder="UF" maxlength="2" ${blocked ? 'disabled' : ''}/></td>
                <td><select data-field="alojamento_id" ${blocked ? 'disabled' : ''}>${alojamentoOptions(r.alojamento_id, r.cidade, r.uf)}</select><input data-field="alojamento_nome" type="hidden" value="${escapeHtml(r.alojamento_nome || '')}" /></td>
                <td><input data-field="checkin" type="date" value="${escapeHtml(r.checkin || todayIso())}" ${blocked ? 'disabled' : ''}/></td>
                <td><input data-field="checkout" type="date" value="${escapeHtml(r.checkout || '')}" ${blocked ? 'disabled' : ''}/></td>
                <td><input data-field="observacao" type="text" value="${escapeHtml(r.observacao || '')}" ${blocked ? 'disabled' : ''}/></td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>` : '<div class="prog-empty-section">Nenhum colaborador disponível para estadia.</div>'}
      ${renderBloqueadosResumo(bloqueados)}`;

    el.list.querySelectorAll('tr[data-table="programacao_estadia"]').forEach((tr) => {
      const tipo = String(tr.querySelector('[data-field="tipo_estadia"]')?.value || '').toUpperCase();
      const cidadeEl = tr.querySelector('[data-field="cidade"]');
      if (TIPOS_ESTADIA_BOTOES.includes(tipo) && cidadeEl && !cidadeEl.value && preencherCidadeDaOs(tr)) {
        atualizarSugestaoAlojamento(tr);
        scheduleSaveRow(tr);
      }
    });
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
          <thead><tr><th>Colaborador</th><th>Deslocamento</th><th>Placa</th><th>KM estimado</th><th>Valor</th><th>Observação</th></tr></thead>
          <tbody>
            ${disponiveis.map((colab) => {
              const r = state.maps.deslocamento.get(String(colab.id)) || {};
              const disp = state.maps.disponibilidade.get(String(colab.id)) || {};
              const isLogistica = disponibilidadeCategoria(disp.disponibilidade) === 'LOGISTICA';
              const kmInfo = kmEstimadoColaborador(colab);
              const kmValue = r.km || (Number.isFinite(kmInfo.km) ? kmInfo.km.toFixed(2) : '');
              const tipoDefault = isLogistica ? 'MOTORISTA FROTA' : 'NÃO PRECISA';
              const tipoValue = r.tipo_deslocamento || tipoDefault;
              const placaValue = r.placa_veiculo || (isLogistica ? disp.placa_veiculo || '' : '');
              const blocked = isBlocked(colab);
              return `<tr data-colab-id="${escapeHtml(colab.id)}" data-table="programacao_deslocamento">
                <td>${colabCell(colab)}</td>
                <td><select data-field="tipo_deslocamento" ${blocked ? 'disabled' : ''}>${selectOptions(TIPOS_DESLOCAMENTO, tipoValue)}</select></td>
                <td>
                  <input data-field="placa_veiculo" list="progVeiculosFrotaList" type="text" value="${escapeHtml(placaValue)}" placeholder="Placa" maxlength="7" ${blocked ? 'disabled' : ''}/>
                  ${(() => {
                    const message = patrimonioMessageForRow(colab, tipoValue, placaValue);
                    return `<div data-patrimonio-alert class="prog-patrimonio-alert ${message ? 'show' : ''}">${escapeHtml(message)}</div>`;
                  })()}
                </td>
                <td>
                  <input data-field="km" type="number" min="0" step="0.01" value="${escapeHtml(kmValue)}" placeholder="" ${blocked ? 'disabled' : ''}/>
                  <span class="prog-km-note">${escapeHtml(kmInfo.km == null ? kmInfo.motivo : kmInfo.motivo)}</span>
                </td>
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

  function preencherUfPorCidade(tr) {
    if (!tr) return;
    const cidadeEl = tr.querySelector('[data-field="cidade"]');
    const ufEl = tr.querySelector('[data-field="uf"]');
    const match = matchCidade(cidadeEl?.value, ufEl?.value);
    if (match) {
      cidadeEl.value = match.nome;
      if (ufEl) ufEl.value = match.uf;
    }
    atualizarSugestaoAlojamento(tr);
  }

  function preencherAlojamentoSelecionado(tr) {
    if (!tr) return;
    const select = tr.querySelector('[data-field="alojamento_id"]');
    const hidden = tr.querySelector('[data-field="alojamento_nome"]');
    const aloj = (state.alojamentos || []).find((a) => String(a.id) === String(select?.value || ''));
    if (hidden) hidden.value = aloj?.nome || '';
    if (aloj) {
      const cidadeEl = tr.querySelector('[data-field="cidade"]');
      const ufEl = tr.querySelector('[data-field="uf"]');
      if (cidadeEl && !cidadeEl.value) cidadeEl.value = aloj.cidade || '';
      if (ufEl && !ufEl.value) ufEl.value = aloj.uf || '';
    }
  }

  function preencherCidadeDaOs(tr) {
    if (!tr) return false;
    const colab = colabById(tr.dataset.colabId);
    const os = getOsForColab(colab);
    const cidadeInfo = cidadeUfFromOs(os);
    if (!cidadeInfo) return false;
    const cidadeEl = tr.querySelector('[data-field="cidade"]');
    const ufEl = tr.querySelector('[data-field="uf"]');
    if (!cidadeEl) return false;
    cidadeEl.value = cidadeInfo.cidade || '';
    if (ufEl) ufEl.value = cidadeInfo.uf || '';
    return true;
  }

  function atualizarSugestaoAlojamento(tr) {
    if (!tr) return;
    const tipo = String(tr.querySelector('[data-field="tipo_estadia"]')?.value || '').toUpperCase();
    const select = tr.querySelector('[data-field="alojamento_id"]');
    if (!select) return;
    const cidade = tr.querySelector('[data-field="cidade"]')?.value || '';
    const uf = tr.querySelector('[data-field="uf"]')?.value || '';
    const current = select.value;
    select.innerHTML = alojamentoOptions(current, cidade, uf);
    if (tipo !== 'ALOJAMENTO') {
      select.value = '';
      const hidden = tr.querySelector('[data-field="alojamento_nome"]');
      if (hidden) hidden.value = '';
    }
  }

  function handleTableInput(event) {
    const tr = event.target.closest('tr');
    if (event.target.matches('[data-field="placa_veiculo"]')) {
      event.target.value = onlyPlate(event.target.value);
      if (tr?.dataset.table === 'programacao_colaboradores') updatePlacaLogisticaAlert(tr);
      else updatePatrimonioAlert(tr);
    }
    if (event.target.matches('[data-field]')) scheduleSaveRow(tr);
    if (event.target.matches('[data-extra-field]')) scheduleSaveExtra(event.target.closest('.prog-extra-card'));
  }

  function handleTableChange(event) {
    const tr = event.target.closest('tr');
    if (event.target.matches('[data-field="cidade"]')) preencherUfPorCidade(tr);
    if (event.target.matches('[data-field="uf"]')) event.target.value = normalizeUF(event.target.value);
    if (event.target.matches('[data-field="alojamento_id"]')) preencherAlojamentoSelecionado(tr);
    if (event.target.matches('[data-field="disponibilidade"]') && tr?.dataset.table === 'programacao_colaboradores') {
      const disp = event.target.value;
      const td = event.target.closest('td');
      let placaWrap = td?.querySelector('.prog-placa-wrap');
      if (disp === 'LOGISTICA') {
        if (!placaWrap) {
          const colab = colabById(tr.dataset.colabId);
          const sugestao = suggestVeiculoForColab(colab);
          placaWrap = document.createElement('div');
          placaWrap.className = 'prog-placa-wrap';
          placaWrap.innerHTML = `<input data-field="placa_veiculo" type="text" maxlength="8" value="" placeholder="${sugestao?.placa ? 'Sugestão: ' + sugestao.placa : 'Digite a placa'}" />${sugestao?.placa ? `<button type="button" class="prog-placa-suggest-btn" data-placa="${escapeHtml(sugestao.placa)}">Usar ${escapeHtml(sugestao.placa)}</button>` : ''}<div class="prog-placa-alert"></div>`;
          td.appendChild(placaWrap);
        }
      } else if (placaWrap) {
        placaWrap.remove();
      }
      const colabId = tr.dataset.colabId;
      const existing = state.maps.disponibilidade.get(colabId) || {};
      state.maps.disponibilidade.set(colabId, { ...existing, disponibilidade: disp });
      const statusSpan = tr.querySelector('.prog-status');
      const isNowBlocked = !DISPONIBILIDADES_LIBERADAS.has(disp.trim().toUpperCase());
      if (statusSpan) {
        statusSpan.className = `prog-status ${isNowBlocked ? 'block' : 'ok'}`;
        statusSpan.textContent = isNowBlocked ? 'Bloqueado' : 'Liberado';
      }
    }
    if (event.target.matches('[data-field="placa_veiculo"]')) {
      event.target.value = onlyPlate(event.target.value);
      if (tr?.dataset.table === 'programacao_colaboradores') updatePlacaLogisticaAlert(tr);
    }
    if (event.target.matches('[data-field="tipo_deslocamento"], [data-field="placa_veiculo"]') && tr?.dataset.table !== 'programacao_colaboradores') updatePatrimonioAlert(tr);
    if (event.target.matches('[data-indisponivel-motivo]')) {
      const hidden = tr?.querySelector('[data-field="disponibilidade"]');
      if (hidden) hidden.value = event.target.value || 'ATESTADO';
      scheduleSaveRow(tr);
      return;
    }
    if (event.target.matches('[data-field="tipo_estadia"]')) atualizarSugestaoAlojamento(tr);
    if (event.target.matches('[data-field]')) scheduleSaveRow(tr);
    if (event.target.matches('[data-extra-field]')) scheduleSaveExtra(event.target.closest('.prog-extra-card'));
  }

  async function handleTableClick(event) {
    const estadiaBtn = event.target.closest('.prog-estadia-card');
    if (estadiaBtn) {
      const tr = estadiaBtn.closest('tr');
      if (!tr || estadiaBtn.disabled) return;
      const wasActive = estadiaBtn.classList.contains('active');
      const tipo = wasActive ? '' : (estadiaBtn.dataset.estadiaTipo || '');
      const hidden = tr.querySelector('[data-field="tipo_estadia"]');
      if (hidden) hidden.value = tipo;
      tr.querySelectorAll('.prog-estadia-card').forEach((btn) => btn.classList.toggle('active', !wasActive && btn === estadiaBtn));
      const note = tr.querySelector('.prog-required-note');
      if (note) note.remove();
      if (TIPOS_ESTADIA_BOTOES.includes(tipo)) preencherCidadeDaOs(tr);
      atualizarSugestaoAlojamento(tr);
      scheduleSaveRow(tr);
      return;
    }

    const tipoBtn = event.target.closest('.prog-tipo-btn');
    if (tipoBtn) {
      if (tipoBtn.disabled || tipoBtn.classList.contains('disabled')) return;
      const tipo = tipoBtn.dataset.tipo;
      const tr = tipoBtn.closest('tr');
      if (!tr) return;
      const colabId = tr.dataset.colabId;
      const colab = colabById(colabId);
      if (tipo === 'OK' && !colaboradorPodeFicarOk(colab)) {
        setFeedback('OK só pode ser marcado quando o colaborador tiver O.S. com status ATENDER no menu OS.', 'warn');
        return;
      }
      const existing = state.maps.disponibilidade.get(colabId) || {};
      const valorDisponibilidade = tipo === 'INDISPONIVEL' ? (disponibilidadeMotivo(existing.disponibilidade) || 'ATESTADO') : tipo;
      state.maps.disponibilidade.set(colabId, { ...existing, disponibilidade: valorDisponibilidade });
      const hiddenInput = tr.querySelector('[data-field="disponibilidade"]');
      if (hiddenInput) hiddenInput.value = valorDisponibilidade;
      tr.querySelectorAll('.prog-tipo-btn').forEach((b) => b.classList.toggle('active', b.dataset.tipo === tipo));
      let placaWrap = tr.querySelector('.prog-placa-wrap');
      let indisWrap = tr.querySelector('.prog-indisponivel-wrap');
      if (indisWrap && tipo !== 'INDISPONIVEL') indisWrap.remove();
      if (tipo === 'INDISPONIVEL' && !indisWrap) {
        const td = tipoBtn.closest('td');
        indisWrap = document.createElement('div');
        indisWrap.className = 'prog-indisponivel-wrap';
        indisWrap.innerHTML = `<select data-indisponivel-motivo>${INDISPONIBILIDADE_MOTIVOS.map((op) => `<option value="${escapeHtml(op)}" ${op === valorDisponibilidade ? 'selected' : ''}>${escapeHtml(disponibilidadeLabel(op))}</option>`).join('')}</select>`;
        const before = td.querySelector('.prog-placa-wrap');
        if (before) td.insertBefore(indisWrap, before); else td.appendChild(indisWrap);
      }
      if (tipo === 'LOGISTICA' && !placaWrap) {
        const td = tipoBtn.closest('td');
        placaWrap = document.createElement('div');
        placaWrap.className = 'prog-placa-wrap';
        const sugestao = suggestVeiculoForColab(colab);
        placaWrap.innerHTML = `<input data-field="placa_veiculo" list="progVeiculosFrotaList" type="text" maxlength="8" value="" placeholder="${sugestao?.placa ? 'Sugestão: ' + sugestao.placa : 'Digite a placa'}" />${sugestao?.placa ? `<button type="button" class="prog-placa-suggest-btn" data-placa="${escapeHtml(sugestao.placa)}">Usar ${escapeHtml(sugestao.placa)}</button>` : ''}<div class="prog-placa-alert"></div>`;
        td.appendChild(placaWrap);
      } else if (placaWrap && tipo !== 'LOGISTICA') {
        placaWrap.remove();
        if (existing.placa_veiculo) {
          state.maps.disponibilidade.set(colabId, { ...state.maps.disponibilidade.get(colabId), placa_veiculo: null });
        }
      }
      const statusSpan = tr.querySelector('.prog-status');
      const isNowBlocked = tipo === 'SEM EMBARQUE' || tipo === 'INDISPONIVEL' || (tipo === 'OK' && !colaboradorPodeFicarOk(colab));
      if (statusSpan) {
        statusSpan.className = `prog-status ${isNowBlocked ? 'block' : 'ok'}`;
        statusSpan.textContent = isNowBlocked ? 'Bloqueado' : 'Liberado';
      }
      scheduleSaveRow(tr);
      return;
    }

    const suggestBtn = event.target.closest('.prog-placa-suggest-btn');
    if (suggestBtn) {
      const tr = suggestBtn.closest('tr');
      if (!tr) return;
      const input = tr.querySelector('[data-field="placa_veiculo"]');
      if (input) {
        input.value = onlyPlate(suggestBtn.dataset.placa || '');
        suggestBtn.remove();
        updatePlacaLogisticaAlert(tr);
        scheduleSaveRow(tr);
      }
      return;
    }

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

  async function saveRow(tr) {
    const table = tr.dataset.table;
    const colab = colabById(tr.dataset.colabId);
    if (!table || !colab) return;

    const payload = {
      ...getFieldPayload(tr),
      programacao_id: programacaoIdFor(colab),
      data_referencia: state.dataReferencia,
      colaborador_id: colab.id,
      nome_colaborador: colab.nome,
    };
    if (!payload.programacao_id) {
      setFeedback(`Não foi possível resolver a programação do dia para ${colab.nome}.`, 'error');
      return;
    }

    if (table === 'programacao_estadia') {
      payload.uf = normalizeUF(payload.uf);
      if (payload.alojamento_id) {
        const aloj = (state.alojamentos || []).find((a) => String(a.id) === String(payload.alojamento_id));
        payload.alojamento_nome = aloj?.nome || payload.alojamento_nome || null;
      }
      payload.tipo_estadia = normalizeText(payload.tipo_estadia || '') || 'NAO PRECISA';
      payload.tem_estadia = TIPOS_ESTADIA_BOTOES.includes(payload.tipo_estadia);
    }
    if (table === 'programacao_deslocamento') {
      const disp = state.maps.disponibilidade.get(String(colab.id)) || {};
      if (disponibilidadeCategoria(disp.disponibilidade) === 'LOGISTICA') {
        payload.tipo_deslocamento = payload.tipo_deslocamento || 'MOTORISTA FROTA';
        payload.placa_veiculo = payload.placa_veiculo || disp.placa_veiculo || null;
      }
      payload.placa_veiculo = onlyPlate(payload.placa_veiculo);
    }
    if (table === 'programacao_colaboradores') {
      payload.placa_veiculo = payload.disponibilidade === 'LOGISTICA' ? onlyPlate(payload.placa_veiculo) : null;
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
    const programacaoId = programacaoIdFor(colab);
    if (!programacaoId) return;

    const { data, error } = await supabase
      .from('programacao_extras')
      .insert({
        programacao_id: programacaoId,
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

  function draftValueFromDom(table, colabId, field) {
    const tr = el.list.querySelector(`tr[data-table="${table}"][data-colab-id="${CSS.escape(String(colabId))}"]`);
    return tr?.querySelector(`[data-field="${field}"]`)?.value ?? undefined;
  }

  function validarProgramacaoAntesSalvar() {
    const problemas = [];
    state.colaboradores.forEach((colab) => {
      const dispRow = state.maps.disponibilidade.get(String(colab.id)) || {};
      const disp = disponibilidadeCategoria(dispRow.disponibilidade || 'OK');
      const placaLogistica = onlyPlate((draftValueFromDom('programacao_colaboradores', colab.id, 'placa_veiculo') ?? dispRow.placa_veiculo) || '');
      if (disp === 'OK' && !colaboradorPodeFicarOk(colab)) problemas.push(`${colab.nome}: OK só é permitido quando existir O.S. com status ATENDER vinculada no menu OS.`);
      if (disp === 'LOGISTICA' && !placaLogistica) problemas.push(`${colab.nome}: informe ou selecione a placa na etapa A/Logística.`);
      if (disp === 'SEM EMBARQUE' || disp === 'INDISPONIVEL') return;

      const est = state.maps.estadia.get(String(colab.id)) || {};
      // Em branco = Casa (mesma leitura que o hint "Casa (nenhuma opção
      // selecionada)" já mostra na etapa B) — não bloqueia o salvamento.
      const tipoEstadia = normalizeText((draftValueFromDom('programacao_estadia', colab.id, 'tipo_estadia') ?? est.tipo_estadia) || '');
      const cidade = String((draftValueFromDom('programacao_estadia', colab.id, 'cidade') ?? est.cidade) || '').trim();
      const uf = normalizeUF((draftValueFromDom('programacao_estadia', colab.id, 'uf') ?? est.uf) || '');
      const alojamentoId = (draftValueFromDom('programacao_estadia', colab.id, 'alojamento_id') ?? est.alojamento_id) || '';
      if (['HOTEL', 'ALOJAMENTO', 'PERNOITE'].includes(tipoEstadia) && (!cidade || !uf)) problemas.push(`${colab.nome}: informe cidade/UF da hospedagem.`);
      if (tipoEstadia === 'ALOJAMENTO' && !alojamentoId) problemas.push(`${colab.nome}: selecione o alojamento sugerido/cadastrado.`);

      const desl = state.maps.deslocamento.get(String(colab.id)) || {};
      const tipoDeslocamento = String((draftValueFromDom('programacao_deslocamento', colab.id, 'tipo_deslocamento') ?? desl.tipo_deslocamento) || (disp === 'LOGISTICA' ? 'MOTORISTA FROTA' : '')).toUpperCase();
      const placaDeslocamento = onlyPlate((draftValueFromDom('programacao_deslocamento', colab.id, 'placa_veiculo') ?? desl.placa_veiculo) || (disp === 'LOGISTICA' ? placaLogistica : ''));
      if (['MOTORISTA FROTA', 'CARONA FROTA'].includes(tipoDeslocamento) && !placaDeslocamento) problemas.push(`${colab.nome}: informe a placa do veículo na etapa D.`);
    });
    return problemas;
  }

  async function saveProgramacao() {
    if (!state.programacaoId && !state.programacaoIdMap.size) {
      setFeedback('Carregue um contexto antes de salvar a programação.', 'warn');
      return;
    }

    const fobsPendentes = await checkFobPendenciasBloqueantes(state.dataReferencia, state.programacaoIdMap.size ? state.supervisoesResolvidas : state.supervisao);
    if (fobsPendentes.length) {
      showFobBlockedMessage(fobsPendentes);
      return;
    }

    const problemas = validarProgramacaoAntesSalvar();
    if (problemas.length) {
      setFeedback(problemas.slice(0, 3).join(' | ') + (problemas.length > 3 ? ` +${problemas.length - 3} pendência(s)` : ''), 'error');
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

      // Sob "Todas" existe 1 programacao_dia por supervisão resolvida — cada
      // uma é finalizada e notificada separadamente.
      const idsPorSupervisao = state.programacaoIdMap.size
        ? [...state.programacaoIdMap.entries()]
        : [[state.supervisao, state.programacaoId]];

      for (const [, pid] of idsPorSupervisao) {
        const { error } = await supabase
          .from('programacao_dia')
          .update({ status: 'salvo', updated_at: new Date().toISOString() })
          .eq('id', pid);
        if (error) throw error;
      }

      setFeedback(`Programação salva com sucesso em ${new Date().toLocaleTimeString('pt-BR')}.`, 'ok');

      // Notifica o setor de Conferência (uma notificação por supervisão)
      try {
        const engine = window.__painelNotifEngine;
        const ctx = state.userContext || {};
        const criador = firstFilled(ctx?.user?.name, ctx?.user?.email, 'Gestor');
        const hoje = todayIso();
        if (engine) {
          await Promise.all(idsPorSupervisao.map(([sup, pid]) => {
            const supervisaoLabel = sup && sup !== TODAS_SUPERVISOES ? sup : firstFilled(ctx?.supervisao, ctx?.user?.supervisao, '');
            return engine.criarNotificacao({
              tipo: 'programacao_salva',
              titulo: `Programação realizada — ${criador}`,
              descricao: `Gestor ${criador} salvou a programação de despesas${supervisaoLabel ? ` (${supervisaoLabel})` : ''}.`,
              destinatario_modulo: 'conferencia',
              supervisao: supervisaoLabel || null,
              referencia_tabela: 'programacao_dia',
              referencia_id: pid,
              chave_dedup: `programacao_salva:${pid}:${hoje}`,
            });
          }));
        }
      } catch (_) {}

      // Dispara o cálculo das rotas do Mapa Operacional (Operacional > Mapa)
      // pra cada supervisão salva — não bloqueia o feedback de sucesso acima
      // nem impede o gestor de continuar editando se a chamada falhar (fica
      // pra próxima vez que ele salvar). Ver operacional-mapa-rotas/index.ts.
      // Falha aqui era só um console.warn silencioso — o gestor via "salvo
      // com sucesso" e o Mapa Operacional ficava sem a rota/O.S. sem nenhum
      // aviso. Agora contamos falhas e avisamos por cima do feedback de ok.
      try {
        const ctx = state.userContext || {};
        const falhasMapa = [];
        await Promise.all(idsPorSupervisao.map(([sup, pid]) => {
          const supervisaoReal = sup && sup !== TODAS_SUPERVISOES ? sup : firstFilled(ctx?.supervisao, ctx?.user?.supervisao, '');
          if (!supervisaoReal) return null;
          return supabase.functions.invoke('operacional-mapa-rotas', {
            body: { programacaoId: pid, supervisao: supervisaoReal, dataReferencia: state.dataReferencia },
          }).catch((err) => {
            console.warn('[programacao] operacional-mapa-rotas:', err);
            falhasMapa.push(supervisaoReal);
          });
        }));
        if (falhasMapa.length) {
          setFeedback(`Programação salva, mas o Mapa Operacional não pôde ser atualizado agora para: ${falhasMapa.join(', ')}. Tente salvar novamente em instantes.`, 'warn');
        }
      } catch (_) {}

    } catch (error) {
      console.error(error);
      setFeedback(error.message || 'Falha ao salvar programação.', 'error');
    } finally {
      el.saveBtn.disabled = false;
      el.saveBtn.textContent = 'Salvar';
    }
  }

  function setFeedback(message, type = '') {
    el.feedback.className = `feedback mt-16 ${type ? `prog-feedback-${type}` : ''}`;
    el.feedback.textContent = message;
  }

  init();
}

initProtectedPage('Programação', renderContent);
