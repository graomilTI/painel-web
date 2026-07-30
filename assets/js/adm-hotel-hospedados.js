// Aba "Hospedados" em Hospedagem > Alojamentos: quem da equipe está
// hospedado em cada alojamento, agrupado por alojamento (cada grupo abre com
// uma seta) e filtrável por um intervalo de datas escolhido num calendário
// interativo à direita — pedido do usuário, 2026-07-30. Cada linha dentro de
// um grupo mostra Data | Colaborador | Tipo (Efetivo/Intermitente/Diarista).
//
// Não tem tabela própria de ocupação — cruza o cadastro de alojamentos
// (hospedagem_alojamentos) com a estadia que a Programação já grava por
// colaborador/dia (programacao_estadia, tipo_estadia='alojamento'), a mesma
// fonte que já alimenta o KPI agregado "Em uso hoje" em
// adm-hotel-separacao-modulos.js. O "Tipo" (Efetivo/Intermitente/Diarista)
// vem de colaborador_cruzamento.tipo_contrato, casado por CPF com
// programacao_estadia.colaborador_id (mesmo padrão usado em financeiro.js
// pra excluir efetivos do pagamento de diária).
import { supabase } from './supabaseClient.js';
import { esc, brDate } from './adm-hotel-alojamentos-v2-helpers.js?v=20260721-obs1';

const state = {
  start: '', end: '', busca: '', carregando: false,
  grupos: [], colapsados: new Set(), primeiraCarga: true, mounted: false, timer: null,
  calAno: 0, calMes: 0, pickingStart: true,
};

function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .trim();
}

function onlyDigits(value) {
  return String(value ?? '').replace(/\D/g, '');
}

function todayInSaoPaulo() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

const TIPO_LABEL = { EFETIVO: 'Efetivo', INTERMITENTE: 'Intermitente', DIARISTA: 'Diarista' };
const TIPO_CLASSE = { EFETIVO: 'ok', INTERMITENTE: 'warn', DIARISTA: 'neutral' };

function tipoInfo(tipoContrato) {
  const norm = normalizeText(tipoContrato);
  const chave = Object.keys(TIPO_LABEL).find((k) => norm.includes(k));
  return { label: chave ? TIPO_LABEL[chave] : (tipoContrato ? String(tipoContrato) : '—'), classe: chave ? TIPO_CLASSE[chave] : 'neutral' };
}

function ensureStyles() {
  if (document.getElementById('admHotelHospedadosCss')) return;
  const style = document.createElement('style');
  style.id = 'admHotelHospedadosCss';
  style.textContent = `
    .aloj-v2-shell.aloj-hosp-mode>.aloj-v2-head,.aloj-v2-shell.aloj-hosp-mode>.aloj-v2-kpis,.aloj-v2-shell.aloj-hosp-mode>#alojV2List{display:none!important}
    .aloj-v2-shell.aloj-hosp-mode>.aloj-pay-panel{display:none!important}
    .aloj-hosp-panel{display:none}
    .aloj-v2-shell.aloj-hosp-mode>.aloj-hosp-panel{display:grid;gap:14px}
    .hosp-v-toolbar{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:2px}
    .hosp-v-toolbar input{height:38px;border:1px solid rgba(148,163,184,.24);background:#0d0d18;color:#e2e2f0;border-radius:11px;padding:0 12px;color-scheme:dark}
    .hosp-v-toolbar input[type="search"]{flex:1 1 240px}
    .hosp-v-range-label{font-size:11.5px;color:#8b93a7;background:rgba(52,211,153,.08);border:1px solid rgba(52,211,153,.2);border-radius:999px;padding:6px 12px;white-space:nowrap}

    .hosp-v-layout{display:grid;grid-template-columns:1fr 300px;gap:16px;align-items:start}
    @media (max-width:860px){.hosp-v-layout{grid-template-columns:1fr}}

    .hosp-v-groups{display:grid;gap:10px}
    .hosp-v-empty{padding:26px;color:#6b7a86;text-align:center;font-style:italic;border:1px solid rgba(52,211,153,.16);border-radius:16px}

    .hosp-v-group{border:1px solid rgba(52,211,153,.16);border-radius:16px;overflow:hidden;background:rgba(10,23,16,.4)}
    .hosp-v-group-head{display:flex;align-items:center;gap:12px;padding:13px 16px;cursor:pointer;user-select:none;background:#0a1710}
    .hosp-v-group-head:hover{background:#0e1f15}
    .hosp-v-group-caret{flex:0 0 auto;width:20px;height:20px;display:grid;place-items:center;transition:transform .16s ease;color:#4f9670}
    .hosp-v-group.is-collapsed .hosp-v-group-caret{transform:rotate(-90deg)}
    .hosp-v-group-titles{flex:1 1 auto;min-width:0}
    .hosp-v-group-nome{font-weight:800;font-size:13.5px;color:#e2e2f0}
    .hosp-v-group-local{font-size:11px;color:#6b7a86;margin-top:2px}
    .hosp-v-group-count{flex:0 0 auto;font-size:10.5px;font-weight:800;color:#4f9670;background:rgba(52,211,153,.12);border:1px solid rgba(52,211,153,.3);border-radius:999px;padding:4px 10px;white-space:nowrap}
    .hosp-v-tag-orfao{display:inline-block;margin-left:8px;font-size:9.5px;font-weight:800;color:#fde68a;background:rgba(245,158,11,.14);border:1px solid rgba(245,158,11,.35);border-radius:999px;padding:2px 7px;white-space:nowrap}
    .hosp-v-group.is-collapsed .hosp-v-group-body{display:none}

    .hosp-v-table{width:100%;border-collapse:collapse}
    .hosp-v-table th,.hosp-v-table td{padding:10px 16px;border-top:1px solid rgba(52,211,153,.1);text-align:left;font-size:12.5px}
    .hosp-v-table th{color:#4f9670;font-size:9.5px;text-transform:uppercase;letter-spacing:.14em;font-weight:850}
    .hosp-v-table td{color:#e2e2f0}
    .hosp-v-table tr:hover td{background:rgba(45,215,120,.035)}

    .hosp-v-badge{display:inline-block;font-size:10.5px;font-weight:800;border-radius:999px;padding:3px 10px;white-space:nowrap}
    .hosp-v-badge.ok{color:#6fe0a5;background:rgba(52,211,153,.12);border:1px solid rgba(52,211,153,.32)}
    .hosp-v-badge.warn{color:#fde68a;background:rgba(245,158,11,.12);border:1px solid rgba(245,158,11,.32)}
    .hosp-v-badge.neutral{color:#9ca8bd;background:rgba(148,163,184,.12);border:1px solid rgba(148,163,184,.28)}

    .hosp-v-cal{border:1px solid rgba(52,211,153,.16);border-radius:16px;padding:14px;background:rgba(10,23,16,.4);position:sticky;top:12px}
    .hosp-v-cal-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px}
    .hosp-v-cal-head strong{font-size:12.5px;color:#e2e2f0;text-transform:capitalize}
    .hosp-v-cal-nav{width:26px;height:26px;border-radius:8px;border:1px solid rgba(148,163,184,.24);background:#0d0d18;color:#e2e2f0;cursor:pointer;display:grid;place-items:center;font-size:13px}
    .hosp-v-cal-nav:hover{background:#141428}
    .hosp-v-cal-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:3px}
    .hosp-v-cal-dow{font-size:9px;text-align:center;color:#6b7a86;font-weight:800;text-transform:uppercase;padding-bottom:4px}
    .hosp-v-cal-day{aspect-ratio:1;display:grid;place-items:center;border-radius:8px;font-size:11.5px;color:#c7cdd8;cursor:pointer;background:transparent}
    .hosp-v-cal-day:hover{background:rgba(52,211,153,.12)}
    .hosp-v-cal-day.is-other{color:#3d4450}
    .hosp-v-cal-day.is-today{box-shadow:inset 0 0 0 1px rgba(52,211,153,.5)}
    .hosp-v-cal-day.is-in-range{background:rgba(52,211,153,.14);border-radius:0}
    .hosp-v-cal-day.is-start{background:#22c55e;color:#052e16;font-weight:800;border-radius:8px 0 0 8px}
    .hosp-v-cal-day.is-end{background:#22c55e;color:#052e16;font-weight:800;border-radius:0 8px 8px 0}
    .hosp-v-cal-day.is-start.is-end{border-radius:8px}
    .hosp-v-cal-hint{margin-top:10px;font-size:10.5px;color:#6b7a86;text-align:center}
    .hosp-v-cal-quick{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}
    .hosp-v-cal-quick button{flex:1 1 auto;height:28px;border-radius:8px;border:1px solid rgba(148,163,184,.24);background:#0d0d18;color:#c7cdd8;font-size:10.5px;cursor:pointer}
    .hosp-v-cal-quick button:hover{background:#141428;color:#e2e2f0}
  `;
  document.head.appendChild(style);
}

function tabButtonHtml() {
  return `<button type="button" class="aloj-pay-tab" data-aloj-hosp-tab="1">Hospedados</button>`;
}

function panelHtml() {
  return `<section class="aloj-hosp-panel" id="tab-hospedados">
    <div class="aloj-pay-head"><div><div class="aloj-v2-eyebrow">Alojamentos</div><h3>Hospedados</h3><p>Quem da equipe está hospedado em cada alojamento, agrupado por alojamento.</p></div></div>
    <div class="hosp-v-toolbar">
      <input type="search" id="hospVBusca" placeholder="Buscar colaborador ou alojamento..." />
      <span class="hosp-v-range-label" id="hospVRangeLabel"></span>
    </div>
    <div class="hosp-v-layout">
      <div class="hosp-v-groups" id="hospVGroups"><div class="hosp-v-empty">Carregando...</div></div>
      <div class="hosp-v-cal" id="hospVCal"></div>
    </div>
  </section>`;
}

function garantirDom() {
  const shell = document.querySelector('.aloj-v2-shell');
  const tabs = shell?.querySelector('.aloj-pay-tabs');
  if (!shell || !tabs) return false;
  if (!tabs.querySelector('[data-aloj-hosp-tab]')) {
    tabs.insertAdjacentHTML('beforeend', tabButtonHtml());
  }
  if (!document.getElementById('tab-hospedados')) {
    shell.insertAdjacentHTML('beforeend', panelHtml());
    bindPanel();
  }
  return true;
}

function activarAba() {
  const shell = document.querySelector('.aloj-v2-shell');
  if (!shell) return;
  shell.classList.remove('aloj-pay-mode');
  shell.classList.add('aloj-hosp-mode');
  document.querySelectorAll('[data-aloj-pay-mode]').forEach((b) => b.classList.remove('active'));
  document.querySelectorAll('[data-aloj-hosp-tab]').forEach((b) => b.classList.add('active'));
}

function desativarAba() {
  document.querySelector('.aloj-v2-shell')?.classList.remove('aloj-hosp-mode');
  document.querySelectorAll('[data-aloj-hosp-tab]').forEach((b) => b.classList.remove('active'));
}

// ── Carregamento dos dados ───────────────────────────────────────────────────

async function carregar() {
  if (state.carregando) return;
  state.carregando = true;
  const wrap = document.getElementById('hospVGroups');
  if (wrap) wrap.innerHTML = '<div class="hosp-v-empty">Carregando...</div>';

  try {
    const start = state.start || todayInSaoPaulo();
    const end = state.end || start;

    const [alojamentosRes, estadiaNovas, estadiaLegado] = await Promise.all([
      supabase.from('hospedagem_alojamentos').select('id,nome,cidade,uf,capacidade,status').order('cidade', { ascending: true }).order('nome', { ascending: true }),
      supabase.from('programacao_estadia').select('*').gte('data_referencia', start).lte('data_referencia', end).limit(5000),
      supabase.from('programacao_estadia').select('*').is('data_referencia', null).lte('checkin', end).limit(5000),
    ]);
    if (alojamentosRes.error) throw alojamentosRes.error;
    if (estadiaNovas.error) throw estadiaNovas.error;
    if (estadiaLegado.error) console.warn('[hospedados] registros sem data_referencia:', estadiaLegado.error.message);

    const legadoFiltrado = (estadiaLegado.data || []).filter((row) => !row.checkout || row.checkout >= start);

    const brutas = [...(estadiaNovas.data || []), ...legadoFiltrado].filter((row) => {
      if (normalizeText(row.tipo_estadia) !== 'ALOJAMENTO') return false;
      if (row.tem_estadia === false) return false;
      return !!(row.alojamento_id || String(row.alojamento_nome || '').trim());
    });

    const cpfs = Array.from(new Set(brutas.map((row) => onlyDigits(row.colaborador_id)).filter((cpf) => cpf.length >= 11)));
    let tipoPorCpf = new Map();
    if (cpfs.length) {
      const { data: cruzamento, error: erroCruzamento } = await supabase
        .from('colaborador_cruzamento').select('cpf,tipo_contrato').in('cpf', cpfs);
      if (erroCruzamento) console.warn('[hospedados] colaborador_cruzamento:', erroCruzamento.message);
      tipoPorCpf = new Map((cruzamento || []).map((c) => [onlyDigits(c.cpf), c.tipo_contrato]));
    }

    const nomePorAlojamentoId = new Map((alojamentosRes.data || []).map((a) => [String(a.id), a]));
    const idsCadastrados = new Set((alojamentosRes.data || []).map((a) => String(a.id)));

    const linhas = brutas.map((row) => {
      const cadastro = nomePorAlojamentoId.get(String(row.alojamento_id));
      const cpf = onlyDigits(row.colaborador_id);
      const dataRef = row.data_referencia || row.checkin || null;
      return {
        alojamentoId: String(row.alojamento_id || `nome:${normalizeText(row.alojamento_nome)}`),
        alojamentoNome: cadastro?.nome || row.alojamento_nome || 'Alojamento não cadastrado',
        alojamentoLocal: cadastro ? [cadastro.cidade, cadastro.uf].filter(Boolean).join('/') : '',
        orfao: !row.alojamento_id || !idsCadastrados.has(String(row.alojamento_id)),
        colaborador: String(row.nome_colaborador || row.colaborador_id || 'Colaborador').trim(),
        dataTexto: row.data_referencia
          ? brDate(row.data_referencia)
          : `${brDate(row.checkin)} → ${row.checkout ? brDate(row.checkout) : 'Em aberto'}`,
        dataOrdenacao: dataRef || '',
        tipoContrato: tipoPorCpf.get(cpf) || null,
      };
    });

    state.grupos = agrupar(linhas);
    if (state.primeiraCarga) {
      state.colapsados = new Set(state.grupos.map((g) => g.id));
      state.primeiraCarga = false;
    }
    renderGrupos();
  } catch (error) {
    console.error('[hospedados] carregar:', error);
    if (wrap) wrap.innerHTML = `<div class="hosp-v-empty">Não foi possível carregar: ${esc(error.message || 'erro desconhecido')}</div>`;
  } finally {
    state.carregando = false;
  }
}

function agrupar(linhas) {
  const mapa = new Map();
  for (const linha of linhas) {
    if (!mapa.has(linha.alojamentoId)) {
      mapa.set(linha.alojamentoId, {
        id: linha.alojamentoId,
        nome: linha.alojamentoNome,
        local: linha.alojamentoLocal,
        orfao: linha.orfao,
        linhas: [],
      });
    }
    mapa.get(linha.alojamentoId).linhas.push(linha);
  }
  for (const grupo of mapa.values()) {
    grupo.linhas.sort((a, b) => a.dataOrdenacao.localeCompare(b.dataOrdenacao) || a.colaborador.localeCompare(b.colaborador, 'pt-BR'));
  }
  return Array.from(mapa.values()).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

// ── Render da lista agrupada ─────────────────────────────────────────────────

function renderGrupos() {
  const wrap = document.getElementById('hospVGroups');
  const rangeLabel = document.getElementById('hospVRangeLabel');
  if (!wrap) return;

  if (rangeLabel) {
    rangeLabel.textContent = state.start === state.end
      ? brDate(state.start)
      : `${brDate(state.start)} – ${brDate(state.end)}`;
  }

  const busca = normalizeText(state.busca);
  const gruposFiltrados = state.grupos.map((grupo) => {
    if (!busca) return grupo;
    const bateAlojamento = normalizeText(grupo.nome).includes(busca);
    const linhas = bateAlojamento ? grupo.linhas : grupo.linhas.filter((l) => normalizeText(l.colaborador).includes(busca));
    return { ...grupo, linhas };
  }).filter((grupo) => grupo.linhas.length);

  if (!gruposFiltrados.length) {
    wrap.innerHTML = `<div class="hosp-v-empty">${busca ? 'Nenhum alojamento ou colaborador encontrado.' : 'Nenhum colaborador hospedado neste período.'}</div>`;
    return;
  }

  wrap.innerHTML = gruposFiltrados.map((grupo) => {
    const colapsado = state.colapsados.has(grupo.id);
    return `
    <div class="hosp-v-group${colapsado ? ' is-collapsed' : ''}" data-grupo="${esc(grupo.id)}">
      <div class="hosp-v-group-head" data-grupo-toggle="${esc(grupo.id)}">
        <span class="hosp-v-group-caret">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
        </span>
        <div class="hosp-v-group-titles">
          <div class="hosp-v-group-nome">${esc(grupo.nome)}${grupo.local ? ` <span style="color:#6b7a86;font-weight:600">· ${esc(grupo.local)}</span>` : ''}${grupo.orfao ? '<span class="hosp-v-tag-orfao">não cadastrado</span>' : ''}</div>
        </div>
        <span class="hosp-v-group-count">${grupo.linhas.length} ${grupo.linhas.length === 1 ? 'registro' : 'registros'}</span>
      </div>
      <div class="hosp-v-group-body">
        <table class="hosp-v-table">
          <thead><tr><th>Data</th><th>Colaborador</th><th>Tipo</th></tr></thead>
          <tbody>
            ${grupo.linhas.map((l) => {
              const tipo = tipoInfo(l.tipoContrato);
              return `<tr>
                <td>${esc(l.dataTexto)}</td>
                <td>${esc(l.colaborador)}</td>
                <td><span class="hosp-v-badge ${tipo.classe}">${esc(tipo.label)}</span></td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>`;
  }).join('');
}

// ── Calendário interativo (seleção de intervalo) ────────────────────────────

function diasNoMes(ano, mes) {
  return new Date(ano, mes + 1, 0).getDate();
}

function pad2(n) { return String(n).padStart(2, '0'); }

function isoDate(ano, mes, dia) {
  return `${ano}-${pad2(mes + 1)}-${pad2(dia)}`;
}

const NOMES_MES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

function renderCalendario() {
  const host = document.getElementById('hospVCal');
  if (!host) return;
  const ano = state.calAno;
  const mes = state.calMes;
  const hoje = todayInSaoPaulo();
  const primeiroDiaSemana = new Date(ano, mes, 1).getDay();
  const totalDias = diasNoMes(ano, mes);
  const totalDiasMesAnterior = diasNoMes(mes === 0 ? ano - 1 : ano, mes === 0 ? 11 : mes - 1);

  const celulas = [];
  for (let i = 0; i < primeiroDiaSemana; i += 1) {
    const dia = totalDiasMesAnterior - primeiroDiaSemana + 1 + i;
    celulas.push({ dia, classe: 'is-other', iso: null });
  }
  for (let dia = 1; dia <= totalDias; dia += 1) {
    const iso = isoDate(ano, mes, dia);
    const classes = [];
    if (iso === hoje) classes.push('is-today');
    if (iso >= state.start && iso <= state.end) classes.push('is-in-range');
    if (iso === state.start) classes.push('is-start');
    if (iso === state.end) classes.push('is-end');
    celulas.push({ dia, classe: classes.join(' '), iso });
  }
  while (celulas.length % 7 !== 0) {
    celulas.push({ dia: celulas.length - (primeiroDiaSemana + totalDias) + 1, classe: 'is-other', iso: null });
  }

  host.innerHTML = `
    <div class="hosp-v-cal-head">
      <button type="button" class="hosp-v-cal-nav" data-cal-prev>‹</button>
      <strong>${NOMES_MES[mes]} ${ano}</strong>
      <button type="button" class="hosp-v-cal-nav" data-cal-next>›</button>
    </div>
    <div class="hosp-v-cal-grid">
      ${['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((d) => `<div class="hosp-v-cal-dow">${d}</div>`).join('')}
      ${celulas.map((c) => `<div class="hosp-v-cal-day ${c.classe}" ${c.iso ? `data-cal-day="${c.iso}"` : ''}>${c.dia}</div>`).join('')}
    </div>
    <div class="hosp-v-cal-hint">${state.pickingStart ? 'Clique numa data de início' : 'Clique numa data de fim'}</div>
    <div class="hosp-v-cal-quick">
      <button type="button" data-cal-quick="hoje">Hoje</button>
      <button type="button" data-cal-quick="semana">7 dias</button>
      <button type="button" data-cal-quick="mes">Este mês</button>
    </div>
  `;
}

function selecionarData(iso) {
  if (state.pickingStart) {
    state.start = iso;
    state.end = iso;
    state.pickingStart = false;
  } else if (iso < state.start) {
    state.end = state.start;
    state.start = iso;
    state.pickingStart = true;
  } else {
    state.end = iso;
    state.pickingStart = true;
  }
  renderCalendario();
  carregar();
}

function aplicarAtalho(tipo) {
  const hoje = todayInSaoPaulo();
  const [ano, mes] = hoje.split('-').map(Number);
  if (tipo === 'hoje') {
    state.start = hoje;
    state.end = hoje;
  } else if (tipo === 'semana') {
    const base = new Date(`${hoje}T00:00:00`);
    const fim = new Date(base);
    fim.setDate(fim.getDate() + 6);
    state.start = hoje;
    state.end = `${fim.getFullYear()}-${pad2(fim.getMonth() + 1)}-${pad2(fim.getDate())}`;
  } else if (tipo === 'mes') {
    state.start = isoDate(ano, mes - 1, 1);
    state.end = isoDate(ano, mes - 1, diasNoMes(ano, mes - 1));
  }
  state.pickingStart = true;
  renderCalendario();
  carregar();
}

// ── Ligações de eventos ──────────────────────────────────────────────────────

function bindPanel() {
  ensureStyles();
  const hoje = todayInSaoPaulo();
  state.start = hoje;
  state.end = hoje;
  const [ano, mes] = hoje.split('-').map(Number);
  state.calAno = ano;
  state.calMes = mes - 1;

  document.getElementById('hospVBusca')?.addEventListener('input', (event) => {
    state.busca = event.target.value;
    renderGrupos();
  });

  const cal = document.getElementById('hospVCal');
  cal?.addEventListener('click', (event) => {
    const dia = event.target.closest('[data-cal-day]');
    if (dia) { selecionarData(dia.dataset.calDay); return; }
    if (event.target.closest('[data-cal-prev]')) {
      state.calMes -= 1;
      if (state.calMes < 0) { state.calMes = 11; state.calAno -= 1; }
      renderCalendario();
      return;
    }
    if (event.target.closest('[data-cal-next]')) {
      state.calMes += 1;
      if (state.calMes > 11) { state.calMes = 0; state.calAno += 1; }
      renderCalendario();
      return;
    }
    const atalho = event.target.closest('[data-cal-quick]');
    if (atalho) aplicarAtalho(atalho.dataset.calQuick);
  });

  document.getElementById('hospVGroups')?.addEventListener('click', (event) => {
    const toggle = event.target.closest('[data-grupo-toggle]');
    if (!toggle) return;
    const id = toggle.dataset.grupoToggle;
    if (state.colapsados.has(id)) state.colapsados.delete(id);
    else state.colapsados.add(id);
    toggle.closest('.hosp-v-group')?.classList.toggle('is-collapsed');
  });

  renderCalendario();
}

function scheduleGarantirDom() {
  clearTimeout(state.timer);
  state.timer = setTimeout(() => garantirDom(), 60);
}

function boot() {
  ensureStyles();
  const observer = new MutationObserver(scheduleGarantirDom);
  observer.observe(document.body, { childList: true, subtree: true });
  scheduleGarantirDom();

  document.addEventListener('click', (event) => {
    if (event.target.closest('[data-aloj-hosp-tab]')) {
      activarAba();
      carregar();
      return;
    }
    if (event.target.closest('[data-aloj-pay-mode]')) {
      desativarAba();
    }
  }, true);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
else boot();
