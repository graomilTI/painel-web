// Aba "Hospedados" em Hospedagem > Alojamentos: pra cada alojamento, mostra
// quem da equipe está hospedado lá numa data escolhida. Não tem tabela própria
// de ocupação — cruza o cadastro de alojamentos (hospedagem_alojamentos) com a
// estadia que a Programação já grava por colaborador/dia (programacao_estadia,
// tipo_estadia='alojamento'), a mesma fonte que já alimenta o KPI agregado
// "Em uso hoje" em adm-hotel-separacao-modulos.js — aqui é o detalhamento por
// pessoa em vez de só a contagem.
import { supabase } from './supabaseClient.js';
import { esc } from './adm-hotel-alojamentos-v2-helpers.js?v=20260721-obs1';

const TAB_ID = 'hospedados';
const state = { date: '', busca: '', carregando: false, ultimosGrupos: [] };

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
    .hosp-v-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:14px}
    .hosp-v-card{border:1px solid rgba(52,211,153,.16);background:rgba(2,6,23,.28);border-radius:16px;padding:16px}
    .hosp-v-card.empty{opacity:.6}
    .hosp-v-card.orfao{border-color:rgba(245,158,11,.35)}
    .hosp-v-head{display:flex;justify-content:space-between;align-items:flex-start;gap:8px;margin-bottom:10px}
    .hosp-v-nome{font-weight:900;color:#f8fafc;font-size:15px;line-height:1.2}
    .hosp-v-local{font-size:12px;color:#9fb7aa;margin-top:2px}
    .hosp-v-count{flex:0 0 auto;display:inline-flex;align-items:center;justify-content:center;min-width:44px;padding:4px 9px;border-radius:999px;font-size:12px;font-weight:900;background:rgba(59,130,246,.14);color:#bfdbfe;border:1px solid rgba(59,130,246,.35);white-space:nowrap}
    .hosp-v-count.cheio{background:rgba(239,68,68,.14);color:#fca5a5;border-color:rgba(239,68,68,.35)}
    .hosp-v-lista{display:flex;flex-direction:column;gap:6px}
    .hosp-v-pessoa{font-size:13px;color:#e2e2f0;padding:6px 10px;border-radius:9px;background:rgba(148,163,184,.06)}
    .hosp-v-vazio{font-size:12.5px;color:#6b7a86;font-style:italic}
    .hosp-v-tag-orfao{display:inline-block;margin-top:8px;font-size:10.5px;font-weight:800;color:#fde68a;background:rgba(245,158,11,.14);border:1px solid rgba(245,158,11,.35);border-radius:999px;padding:2px 8px}
    .hosp-v-empty-state{grid-column:1/-1;text-align:center;color:var(--muted);padding:30px}
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
      <div class="hosp-v-grid" id="hospVGrid"><div class="hosp-v-empty-state">Carregando...</div></div>
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
  const grid = document.getElementById('hospVGrid');
  if (grid) grid.innerHTML = '<div class="hosp-v-empty-state">Carregando...</div>';

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

    const pessoasPorAlojamento = new Map();
    estadiaRows.forEach((row) => {
      const key = alojamentoKey(row);
      const nome = String(row.nome_colaborador || row.colaborador_id || 'Colaborador').trim();
      if (!pessoasPorAlojamento.has(key)) pessoasPorAlojamento.set(key, []);
      pessoasPorAlojamento.get(key).push(nome);
    });

    const alojamentosCadastrados = alojamentosRes.data || [];
    const idsUsados = new Set();
    const grupos = alojamentosCadastrados.map((aloj) => {
      idsUsados.add(String(aloj.id));
      return {
        id: aloj.id,
        nome: aloj.nome || 'Alojamento sem nome',
        local: [aloj.cidade, aloj.uf].filter(Boolean).join('/'),
        capacidade: aloj.capacidade || 0,
        pessoas: pessoasPorAlojamento.get(String(aloj.id)) || [],
        orfao: false,
      };
    });

    // Estadia pode referenciar um alojamento que não bate com nenhum id
    // cadastrado (registrado só pelo nome, ou cadastro excluído depois) —
    // mostra separado em vez de esconder silenciosamente quem está lá.
    pessoasPorAlojamento.forEach((pessoas, key) => {
      if (key.startsWith('nome:') || !idsUsados.has(key)) {
        const nomeAlojamento = estadiaRows.find((r) => alojamentoKey(r) === key)?.alojamento_nome || 'Alojamento não cadastrado';
        grupos.push({ id: key, nome: nomeAlojamento, local: '', capacidade: 0, pessoas, orfao: true });
      }
    });

    grupos.sort((a, b) => (b.pessoas.length - a.pessoas.length) || a.nome.localeCompare(b.nome, 'pt-BR'));

    renderGrupos(grupos);
  } catch (error) {
    console.error('[hospedados] carregar:', error);
    if (grid) grid.innerHTML = `<div class="hosp-v-empty-state">Não foi possível carregar: ${esc(error.message || 'erro desconhecido')}</div>`;
  } finally {
    state.carregando = false;
  }
}

function renderGrupos(grupos) {
  const grid = document.getElementById('hospVGrid');
  if (!grid) return;
  state.ultimosGrupos = grupos;
  const busca = normalizeText(state.busca);
  const filtrados = !busca ? grupos : grupos.filter((g) => normalizeText(`${g.nome} ${g.pessoas.join(' ')}`).includes(busca));

  if (!filtrados.length) {
    grid.innerHTML = '<div class="hosp-v-empty-state">Nenhum alojamento ou colaborador encontrado.</div>';
    return;
  }

  grid.innerHTML = filtrados.map((g) => {
    const cheio = g.capacidade > 0 && g.pessoas.length >= g.capacidade;
    const contagem = g.capacidade > 0 ? `${g.pessoas.length}/${g.capacidade}` : String(g.pessoas.length);
    return `<article class="hosp-v-card ${g.pessoas.length ? '' : 'empty'} ${g.orfao ? 'orfao' : ''}">
      <div class="hosp-v-head">
        <div><div class="hosp-v-nome">${esc(g.nome)}</div>${g.local ? `<div class="hosp-v-local">${esc(g.local)}</div>` : ''}</div>
        <span class="hosp-v-count ${cheio ? 'cheio' : ''}">${esc(contagem)}</span>
      </div>
      <div class="hosp-v-lista">
        ${g.pessoas.length
          ? g.pessoas.map((nome) => `<div class="hosp-v-pessoa">${esc(nome)}</div>`).join('')
          : '<div class="hosp-v-vazio">Nenhum colaborador hospedado nesta data.</div>'}
      </div>
      ${g.orfao ? '<span class="hosp-v-tag-orfao">Alojamento não está no cadastro</span>' : ''}
    </article>`;
  }).join('');
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
    renderGrupos(state.ultimosGrupos);
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
