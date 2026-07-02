import { supabase } from './supabaseClient.js';
import { loadUserContext } from './sessionStore.js';

(function () {
  'use strict';

  const TABLE = 'logistica_cargas_irregularidades';
  const HIST_TABLE = 'colaborador_historico_ocorrencias';
  const STYLE_ID = 'mo-irreg-actions-style';

  const ACTIONS = [
    { key: 'conferir', label: 'Conferir', status: 'CONFERIR', tone: 'info', historico: false },
    { key: 'dois-embarques', label: 'Dois Embarques', status: 'DOIS_EMBARQUES', tone: 'warn', historico: false },
    { key: 'irregular', label: 'Irregular', status: 'IRREGULAR', tone: 'bad', historico: true },
    { key: 'ok', label: 'Ok', status: 'OK', tone: 'ok', historico: false },
  ];

  const STATUS_LABEL = {
    ABERTA: 'Aberta',
    RESOLVIDA: 'Resolvida',
    CONFERIR: 'Conferir',
    DOIS_EMBARQUES: 'Dois Embarques',
    IRREGULAR: 'Irregular',
    OK: 'Ok',
  };

  const STATUS_TONE = {
    ABERTA: 'warn',
    RESOLVIDA: 'ok',
    CONFERIR: 'info',
    DOIS_EMBARQUES: 'warn',
    IRREGULAR: 'bad',
    OK: 'ok',
  };

  let currentRoot = null;
  let currentUserContext = null;
  let observer = null;
  let enhanceTimer = null;
  let cache = { at: 0, rows: [] };

  const esc = (value) => String(value ?? '').replace(/[&<>'"]/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
  }[c]));

  const norm = (value) => String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

  const digits = (value) => String(value ?? '').replace(/\D/g, '');

  function fmtDataBr(value) {
    if (!value) return '—';
    const m = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? `${m[3]}/${m[2]}/${m[1]}` : String(value);
  }

  function fmtKmFromMeters(value) {
    const n = Number(value);
    return Number.isFinite(n) ? `${(n / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} km` : '—';
  }

  function getUserInfo() {
    const ctx = currentUserContext || loadUserContext() || {};
    return {
      id: ctx?.user?.id || ctx?.usuario_id || ctx?.id || null,
      nome: ctx?.user?.name || ctx?.user?.nome || ctx?.nome || ctx?.user?.email || ctx?.email || '',
      email: ctx?.user?.email || ctx?.email || '',
    };
  }

  function rowKey(row) {
    if (row?.id) return String(row.id);
    return [row?.os, row?.colaborador, row?.data_classificacao, row?.hora_cadastro, row?.placa]
      .map((v) => String(v ?? '').trim())
      .join('|');
  }

  function installStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .mo-irreg-actions{display:flex;gap:6px;flex-wrap:wrap;min-width:330px;align-items:center}
      .mo-irreg-btn{border:1px solid rgba(148,163,184,.22);border-radius:999px;background:rgba(15,23,42,.86);color:#e2e8f0;font-size:10px;font-weight:900;padding:5px 9px;cursor:pointer;white-space:nowrap;transition:.15s ease}
      .mo-irreg-btn:hover{transform:translateY(-1px);border-color:rgba(34,197,94,.55)}
      .mo-irreg-btn:disabled{opacity:.55;cursor:wait;transform:none}
      .mo-irreg-btn.active{box-shadow:0 0 0 1px rgba(255,255,255,.16) inset}
      .mo-irreg-btn.info,.mo-irreg-status.info{color:#bfdbfe;border-color:rgba(96,165,250,.35);background:rgba(30,64,175,.18)}
      .mo-irreg-btn.warn,.mo-irreg-status.warn{color:#fde68a;border-color:rgba(245,158,11,.42);background:rgba(120,53,15,.18)}
      .mo-irreg-btn.bad,.mo-irreg-status.bad{color:#fecaca;border-color:rgba(248,113,113,.42);background:rgba(127,29,29,.2)}
      .mo-irreg-btn.ok,.mo-irreg-status.ok{color:#bbf7d0;border-color:rgba(34,197,94,.42);background:rgba(20,83,45,.2)}
      .mo-irreg-status{display:inline-flex;border-radius:999px;padding:3px 8px;font-size:10px;font-weight:900;border:1px solid rgba(148,163,184,.22);background:rgba(15,23,42,.8);white-space:nowrap}
      .mo-irreg-toast{position:fixed;right:18px;bottom:18px;z-index:99999;max-width:360px;border:1px solid rgba(34,197,94,.35);border-radius:14px;background:rgba(2,6,23,.96);color:#e2e8f0;padding:12px 14px;box-shadow:0 18px 50px rgba(0,0,0,.35);font-size:12px;font-weight:800}
      .mo-irreg-toast.bad{border-color:rgba(248,113,113,.45);color:#fecaca}
    `;
    document.head.appendChild(style);
  }

  function toast(message, type = 'ok') {
    document.querySelectorAll('.mo-irreg-toast').forEach((el) => el.remove());
    const el = document.createElement('div');
    el.className = `mo-irreg-toast ${type}`;
    el.textContent = message;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 4200);
  }

  function statusPill(status) {
    const key = norm(status || 'ABERTA');
    const label = STATUS_LABEL[key] || String(status || '—');
    const tone = STATUS_TONE[key] || '';
    return `<span class="mo-irreg-status ${tone}">${esc(label)}</span>`;
  }

  function findIrregularidadesTable(root = currentRoot) {
    if (!root) return null;
    return [...root.querySelectorAll('table.mo-comp-table')].find((table) => {
      const heads = [...table.querySelectorAll('thead th')].map((th) => th.textContent.trim().toUpperCase());
      return heads.includes('DATA') && heads.includes('O.S.') && heads.includes('CLASSIFICADOR') && heads.includes('STATUS');
    }) || null;
  }

  async function loadIrregularidades(force = false) {
    if (!force && cache.rows.length && Date.now() - cache.at < 8000) return cache.rows;
    const { data, error } = await supabase
      .from(TABLE)
      .select('*')
      .order('detectado_em', { ascending: false })
      .limit(500);
    if (error) throw error;
    cache = { at: Date.now(), rows: Array.isArray(data) ? data : [] };
    return cache.rows;
  }

  function ensureActionColumn(table) {
    const head = table.querySelector('thead tr');
    if (head && !head.querySelector('[data-irreg-actions-head]')) {
      const th = document.createElement('th');
      th.dataset.irregActionsHead = '1';
      th.textContent = 'Ações';
      head.appendChild(th);
    }

    table.querySelectorAll('tbody td[colspan="8"]').forEach((td) => { td.colSpan = 9; });
  }

  function renderButtons(row) {
    const current = norm(row?.acao_operacional || row?.status || 'ABERTA');
    return ACTIONS.map((action) => {
      const active = current === action.status;
      return `<button type="button" class="mo-irreg-btn ${action.tone} ${active ? 'active' : ''}" data-irreg-action="${esc(action.key)}">${esc(action.label)}</button>`;
    }).join('');
  }

  async function enhanceIrregularidadesTable(forceData = false) {
    const table = findIrregularidadesTable();
    if (!table) return;

    installStyle();
    ensureActionColumn(table);

    let rows = [];
    try {
      rows = await loadIrregularidades(forceData);
    } catch (error) {
      console.warn('[mapa-operacional] erro ao carregar ações de irregularidades:', error);
      return;
    }

    const bodyRows = [...table.querySelectorAll('tbody tr')]
      .filter((tr) => tr.children.length >= 8 && !tr.textContent.includes('Nenhuma irregularidade'));

    bodyRows.forEach((tr, index) => {
      const row = rows[index];
      if (!row) return;

      tr.dataset.irregKey = rowKey(row);
      tr.dataset.irregIndex = String(index);
      if (tr.children[7]) tr.children[7].innerHTML = statusPill(row.acao_operacional || row.status || 'ABERTA');

      let td = tr.querySelector('[data-irreg-actions-cell]');
      if (!td) {
        td = document.createElement('td');
        td.dataset.irregActionsCell = '1';
        tr.appendChild(td);
      }
      td.innerHTML = `<div class="mo-irreg-actions">${renderButtons(row)}</div>`;
    });
  }

  function scheduleEnhance(forceData = false) {
    clearTimeout(enhanceTimer);
    enhanceTimer = setTimeout(() => enhanceIrregularidadesTable(forceData), 80);
  }

  function schemaCacheError(error) {
    const msg = `${error?.code || ''} ${error?.message || ''} ${error?.details || ''}`.toLowerCase();
    return msg.includes('pgrst204') || msg.includes('could not find') || msg.includes('schema cache') || msg.includes('column');
  }

  async function updateIrregularidade(row, payload) {
    const exec = async (body) => {
      let query = supabase.from(TABLE).update(body);
      if (row?.id) {
        query = query.eq('id', row.id);
      } else {
        if (row?.os) query = query.eq('os', row.os);
        if (row?.colaborador) query = query.eq('colaborador', row.colaborador);
        if (row?.data_classificacao) query = query.eq('data_classificacao', row.data_classificacao);
        if (row?.hora_cadastro) query = query.eq('hora_cadastro', row.hora_cadastro);
        if (row?.placa) query = query.eq('placa', row.placa);
      }
      return query;
    };

    let { error } = await exec(payload);
    if (error && schemaCacheError(error)) {
      ({ error } = await exec({ status: payload.status }));
    }
    if (error) throw error;
  }

  async function resolverColaborador(row) {
    const cpfDireto = digits(row?.colaborador_cpf || row?.cpf || row?.cpf_colaborador);
    if (cpfDireto) return { cpf: cpfDireto, nome: row?.colaborador || row?.nome_colaborador || '' };

    const nome = String(row?.colaborador || row?.nome_colaborador || '').trim();
    if (!nome) return { cpf: '', nome: '' };

    try {
      const { data, error } = await supabase
        .from('colaborador_snapshot')
        .select('cpf,nome,coordenacao,supervisao,data_referencia')
        .ilike('nome', `%${nome}%`)
        .order('data_referencia', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data || { cpf: '', nome };
    } catch (error) {
      console.warn('[mapa-operacional] não foi possível resolver CPF do colaborador:', error);
      return { cpf: '', nome };
    }
  }

  async function registrarHistoricoColaborador(row) {
    const user = getUserInfo();
    const colaborador = await resolverColaborador(row);
    const referencia = rowKey(row);
    const dataOcorrencia = row?.data_classificacao || new Date().toISOString().slice(0, 10);
    const dist = fmtKmFromMeters(row?.distancia_m);

    const payload = {
      colaborador_cpf: colaborador?.cpf || null,
      colaborador_nome: colaborador?.nome || row?.colaborador || 'Sem colaborador',
      tipo: 'IRREGULARIDADE_MAPA_DIRECIONAMENTO',
      titulo: `Carga lançada fora do raio da O.S. ${row?.os || '—'}`,
      descricao: `Marcado como Irregular no Mapa de Direcionamento. Distância do embarque: ${dist}.`,
      severidade: 'ALERTA',
      origem: 'operacional_mapa_direcionamento',
      referencia_id: referencia,
      referencia_tabela: TABLE,
      os: row?.os || null,
      cliente: row?.cliente || null,
      coordenacao: row?.coordenacao || null,
      supervisao: row?.supervisao || null,
      data_ocorrencia: dataOcorrencia,
      detalhes: {
        placa: row?.placa || null,
        distancia_m: row?.distancia_m ?? null,
        raio_m: row?.raio_m ?? null,
        data_classificacao: row?.data_classificacao || null,
        hora_cadastro: row?.hora_cadastro || null,
        lat_lancamento: row?.lat_lancamento ?? null,
        lng_lancamento: row?.lng_lancamento ?? null,
        lat_os: row?.lat_os ?? null,
        lng_os: row?.lng_os ?? null,
      },
      criado_por: user.id,
      criado_por_nome: user.nome || user.email || null,
    };

    const { error } = await supabase
      .from(HIST_TABLE)
      .upsert(payload, { onConflict: 'origem,referencia_id,tipo' });

    if (error) throw error;
  }

  function updateCacheRow(row, action) {
    const key = rowKey(row);
    cache.rows = cache.rows.map((item) => rowKey(item) === key
      ? { ...item, status: action.status, acao_operacional: action.status }
      : item);
  }

  function disableRowButtons(tr, disabled = true) {
    tr.querySelectorAll('[data-irreg-action]').forEach((btn) => { btn.disabled = disabled; });
  }

  async function handleActionClick(event) {
    const btn = event.target.closest('[data-irreg-action]');
    if (!btn) return;

    const table = findIrregularidadesTable();
    if (!table || !table.contains(btn)) return;

    const tr = btn.closest('tr');
    const index = Number(tr?.dataset?.irregIndex);
    const row = cache.rows[index];
    const action = ACTIONS.find((item) => item.key === btn.dataset.irregAction);
    if (!row || !action) return;

    if (action.historico) {
      const ok = window.confirm('Marcar como Irregular e registrar no histórico do colaborador?');
      if (!ok) return;
    }

    try {
      disableRowButtons(tr, true);
      btn.textContent = 'Salvando...';

      const user = getUserInfo();
      const payload = {
        status: action.status,
        acao_operacional: action.status,
        conferido_em: new Date().toISOString(),
        conferido_por: user.id,
        conferido_por_nome: user.nome || user.email || null,
        observacao_operacional: action.label,
      };

      await updateIrregularidade(row, payload);
      if (action.historico) await registrarHistoricoColaborador(row);

      updateCacheRow(row, action);
      if (tr.children[7]) tr.children[7].innerHTML = statusPill(action.status);
      tr.querySelector('[data-irreg-actions-cell]').innerHTML = `<div class="mo-irreg-actions">${renderButtons({ ...row, status: action.status, acao_operacional: action.status })}</div>`;
      toast(action.historico ? 'Irregularidade registrada no histórico do colaborador.' : `Irregularidade marcada como ${action.label}.`);

      setTimeout(() => {
        currentRoot?.querySelector('[data-reload]')?.click();
      }, 350);
    } catch (error) {
      console.error('[mapa-operacional] erro ao marcar irregularidade:', error);
      toast(error?.message || 'Erro ao salvar ação da irregularidade.', 'bad');
      disableRowButtons(tr, false);
      scheduleEnhance(true);
    }
  }

  function installObserver(root) {
    if (!root || observer) return;
    observer = new MutationObserver(() => scheduleEnhance(false));
    observer.observe(root, { childList: true, subtree: true });
    root.addEventListener('click', handleActionClick, true);
  }

  function patchOperacional() {
    if (!window.OPERACIONAL?.openHome || window.OPERACIONAL.__irregularidadesAcoesPatch) return;

    const originalOpenHome = window.OPERACIONAL.openHome;
    window.OPERACIONAL.openHome = async function patchedOpenHome(root, options = {}) {
      currentRoot = root;
      currentUserContext = options?.userContext || currentUserContext || loadUserContext();
      installStyle();
      installObserver(root);
      const result = await originalOpenHome.call(this, root, options);
      scheduleEnhance(true);
      return result;
    };

    window.OPERACIONAL.__irregularidadesAcoesPatch = true;
  }

  patchOperacional();
})();
