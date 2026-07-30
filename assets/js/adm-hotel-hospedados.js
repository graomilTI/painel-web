// Aba "Hospedados" em Hospedagem > Alojamentos: lista, numa tabela (não mais
// em blocos por alojamento — pedido do usuário, 2026-07-30, precisa mostrar
// colaborador + data), quem da equipe está hospedado em cada alojamento numa
// data escolhida. Não tem tabela própria de ocupação — cruza o cadastro de
// alojamentos (hospedagem_alojamentos) com a estadia que a Programação já
// grava por colaborador/dia (programacao_estadia, tipo_estadia='alojamento'),
// a mesma fonte que já alimenta o KPI agregado "Em uso hoje" em
// adm-hotel-separacao-modulos.js e a aba Alojamento de Gestor > Hospedagem.
import { supabase } from './supabaseClient.js';
import { esc, brDate } from './adm-hotel-alojamentos-v2-helpers.js?v=20260721-obs1';

const TAB_ID = 'hospedados';
const state = { date: '', busca: '', carregando: false, ultimasLinhas: [] };

function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .trim();
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

function ensureStyles() {
  if (document.getElementById('admHotelHospedadosCss')) return;
  const style = document.createElement('style');
  style.id = 'admHotelHospedadosCss';
  style.textContent = `
    .hosp-v-toolbar{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:16px}
    .hosp-v-toolbar input{height:38px;border:1px solid rgba(148,163,184,.24);background:#0d0d18;color:#e2e2f0;border-radius:11px;padding:0 12px;color-scheme:dark}
    .hosp-v-toolbar input[type="search"]{flex:1 1 240px}
    .hosp-v-toolbar input[type="date"]{flex:0 0 auto}
    .hosp-v-table-wrap{overflow:auto;border:1px solid rgba(52,211,153,.16);border-radius:16px}
    .hosp-v-table{width:100%;border-collapse:collapse;min-width:640px}
    .hosp-v-table th,.hosp-v-table td{padding:12px 14px;border-bottom:1px solid rgba(52,211,153,.12);text-align:left;font-size:12.5px}
    .hosp-v-table th{position:sticky;top:0;background:#0a1710;color:#4f9670;font-size:9.5px;text-transform:uppercase;letter-spacing:.14em;font-weight:850}
    .hosp-v-table td{color:#e2e2f0}
    .hosp-v-table tr:hover td{background:rgba(45,215,120,.035)}
    .hosp-v-empty{padding:26px!important;color:#6b7a86!important;text-align:center;font-style:italic}
    .hosp-v-tag-orfao{display:inline-block;margin-left:8px;font-size:9.5px;font-weight:800;color:#fde68a;background:rgba(245,158,11,.14);border:1px solid rgba(245,158,11,.35);border-radius:999px;padding:2px 7px;white-space:nowrap}
  `;
  document.head.appendChild(style);
}

function tabButtonHtml() {
  return `<button class="adm-hosp-tab" data-tab="${TAB_ID}" type="button">Hospedados</button>`;
}

function panelHtml() {
  return `<section id="tab-${TAB_ID}" class="adm-hosp-panel">
    <article class="card">
      <div class="section-head">
        <div><h3>Hospedados</h3><p class="muted">Quem da equipe está hospedado em cada alojamento, dia a dia.</p></div>
      </div>
      <div class="hosp-v-toolbar">
        <input type="date" id="hospVData" />
        <input type="search" id="hospVBusca" placeholder="Buscar colaborador ou alojamento..." />
      </div>
      <div class="hosp-v-table-wrap">
        <table class="hosp-v-table">
          <thead><tr><th>Alojamento</th><th>Colaborador</th><th>Check-in</th><th>Check-out</th></tr></thead>
          <tbody id="hospVTbody"><tr><td colspan="4" class="hosp-v-empty">Carregando...</td></tr></tbody>
        </table>
      </div>
    </article>
  </section>`;
}

function garantirDom() {
  const tabs = document.querySelector('.adm-hosp-tabs');
  const panelsHost = document.getElementById('tab-alojamentos')?.parentElement;
  if (!tabs || !panelsHost) return false;
  if (!tabs.querySelector(`[data-tab="${TAB_ID}"]`)) {
    tabs.insertAdjacentHTML('beforeend', tabButtonHtml());
  }
  if (!document.getElementById(`tab-${TAB_ID}`)) {
    document.getElementById('tab-alojamentos').insertAdjacentHTML('afterend', panelHtml());
    bindPanel();
  }
  return true;
}

function ativarTab() {
  document.querySelectorAll('.adm-hosp-tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === TAB_ID));
  document.querySelectorAll('.adm-hosp-panel').forEach((p) => p.classList.toggle('active', p.id === `tab-${TAB_ID}`));
}

function alojamentoKey(row) {
  return String(row.alojamento_id || `nome:${normalizeText(row.alojamento_nome)}`);
}

async function carregar() {
  if (state.carregando) return;
  state.carregando = true;
  const tbody = document.getElementById('hospVTbody');
  if (tbody) tbody.innerHTML = '<tr><td colspan="4" class="hosp-v-empty">Carregando...</td></tr>';

  try {
    const date = state.date || todayInSaoPaulo();
    const [alojamentosRes, estadiaAtual, estadiaLegado] = await Promise.all([
      supabase.from('hospedagem_alojamentos').select('id,nome,cidade,uf,capacidade,status').order('cidade', { ascending: true }).order('nome', { ascending: true }),
      supabase.from('programacao_estadia').select('*').eq('data_referencia', date).limit(5000),
      supabase.from('programacao_estadia').select('*').is('data_referencia', null).lte('checkin', date).limit(5000),
    ]);
    if (alojamentosRes.error) throw alojamentosRes.error;
    if (estadiaAtual.error) throw estadiaAtual.error;
    if (estadiaLegado.error) console.warn('[hospedados] registros sem data_referencia:', estadiaLegado.error.message);

    const estadiaRows = [...(estadiaAtual.data || []), ...(estadiaLegado.data || [])].filter((row) => {
      if (normalizeText(row.tipo_estadia) !== 'ALOJAMENTO') return false;
      if (row.tem_estadia === false) return false;
      if (!row.alojamento_id && !String(row.alojamento_nome || '').trim()) return false;
      const referencia = row.data_referencia || row.checkin || '';
      const checkout = row.checkout || '';
      return referencia <= date && (!checkout || checkout >= date);
    });

    const nomePorAlojamentoId = new Map((alojamentosRes.data || []).map((a) => [String(a.id), a]));
    const idsCadastrados = new Set((alojamentosRes.data || []).map((a) => String(a.id)));

    const linhas = estadiaRows.map((row) => {
      const key = alojamentoKey(row);
      const cadastro = nomePorAlojamentoId.get(String(row.alojamento_id));
      return {
        alojamentoNome: cadastro?.nome || row.alojamento_nome || 'Alojamento não cadastrado',
        alojamentoLocal: cadastro ? [cadastro.cidade, cadastro.uf].filter(Boolean).join('/') : '',
        orfao: !row.alojamento_id || !idsCadastrados.has(String(row.alojamento_id)),
        colaborador: String(row.nome_colaborador || row.colaborador_id || 'Colaborador').trim(),
        checkin: row.checkin || row.data_referencia || null,
        checkout: row.checkout || null,
      };
    }).sort((a, b) => a.alojamentoNome.localeCompare(b.alojamentoNome, 'pt-BR') || a.colaborador.localeCompare(b.colaborador, 'pt-BR'));

    renderLinhas(linhas);
  } catch (error) {
    console.error('[hospedados] carregar:', error);
    if (tbody) tbody.innerHTML = `<tr><td colspan="4" class="hosp-v-empty">Não foi possível carregar: ${esc(error.message || 'erro desconhecido')}</td></tr>`;
  } finally {
    state.carregando = false;
  }
}

function renderLinhas(linhas) {
  const tbody = document.getElementById('hospVTbody');
  if (!tbody) return;
  state.ultimasLinhas = linhas;
  const busca = normalizeText(state.busca);
  const filtradas = !busca ? linhas : linhas.filter((l) => normalizeText(`${l.alojamentoNome} ${l.colaborador}`).includes(busca));

  if (!filtradas.length) {
    tbody.innerHTML = `<tr><td colspan="4" class="hosp-v-empty">${busca ? 'Nenhum alojamento ou colaborador encontrado.' : 'Nenhum colaborador hospedado nesta data.'}</td></tr>`;
    return;
  }

  tbody.innerHTML = filtradas.map((l) => `
    <tr>
      <td>${esc(l.alojamentoNome)}${l.alojamentoLocal ? ` <span style="color:#6b7a86">· ${esc(l.alojamentoLocal)}</span>` : ''}${l.orfao ? '<span class="hosp-v-tag-orfao">não cadastrado</span>' : ''}</td>
      <td>${esc(l.colaborador)}</td>
      <td>${brDate(l.checkin)}</td>
      <td>${l.checkout ? brDate(l.checkout) : 'Em aberto'}</td>
    </tr>
  `).join('');
}

function bindPanel() {
  ensureStyles();
  const dataInput = document.getElementById('hospVData');
  const buscaInput = document.getElementById('hospVBusca');
  if (dataInput && !dataInput.value) {
    state.date = todayInSaoPaulo();
    dataInput.value = state.date;
  }
  dataInput?.addEventListener('change', () => {
    state.date = dataInput.value || todayInSaoPaulo();
    carregar();
  });
  buscaInput?.addEventListener('input', () => {
    state.busca = buscaInput.value;
    renderLinhas(state.ultimasLinhas);
  });
}

function boot() {
  const observer = new MutationObserver(() => garantirDom());
  observer.observe(document.body, { childList: true, subtree: true });
  garantirDom();

  document.addEventListener('click', (event) => {
    if (event.target.closest(`[data-tab="${TAB_ID}"]`)) {
      ativarTab();
      carregar();
    }
  }, true);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
else boot();
