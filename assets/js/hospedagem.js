import { initProtectedPage } from './pageInit.js';
import { supabase } from './supabaseClient.js';
import { getColaboradores } from './colaboradoresCache.js';

const BR_UFS = [
  ['AC', 'Acre'], ['AL', 'Alagoas'], ['AP', 'Amapá'], ['AM', 'Amazonas'], ['BA', 'Bahia'],
  ['CE', 'Ceará'], ['DF', 'Distrito Federal'], ['ES', 'Espírito Santo'], ['GO', 'Goiás'],
  ['MA', 'Maranhão'], ['MT', 'Mato Grosso'], ['MS', 'Mato Grosso do Sul'], ['MG', 'Minas Gerais'],
  ['PA', 'Pará'], ['PB', 'Paraíba'], ['PR', 'Paraná'], ['PE', 'Pernambuco'], ['PI', 'Piauí'],
  ['RJ', 'Rio de Janeiro'], ['RN', 'Rio Grande do Norte'], ['RS', 'Rio Grande do Sul'],
  ['RO', 'Rondônia'], ['RR', 'Roraima'], ['SC', 'Santa Catarina'], ['SP', 'São Paulo'],
  ['SE', 'Sergipe'], ['TO', 'Tocantins'],
];

// Mesma chave/cache usada em programacao.js — municípios não mudam, cache de 30 dias
// compartilhado entre as páginas evita repetir ~5.500 linhas do IBGE.
const CIDADES_CACHE_KEY = 'grm:cidades_ibge:v1';
const CIDADES_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function readCidadesCache() {
  try {
    const raw = localStorage.getItem(CIDADES_CACHE_KEY);
    if (!raw) return null;
    const { ts, data } = JSON.parse(raw);
    if (!ts || Date.now() - ts > CIDADES_CACHE_TTL_MS || !Array.isArray(data) || !data.length) return null;
    return data;
  } catch {
    return null;
  }
}

function writeCidadesCache(data) {
  try {
    localStorage.setItem(CIDADES_CACHE_KEY, JSON.stringify({ ts: Date.now(), data }));
  } catch {}
}

async function loadCidadesBrasil() {
  const cached = readCidadesCache();
  if (cached) return cached;
  try {
    const resp = await fetch('https://servicodados.ibge.gov.br/api/v1/localidades/municipios?orderBy=nome');
    const data = await resp.json();
    const cidades = (Array.isArray(data) ? data : []).map((m) => ({
      nome: m.nome,
      uf: m.microrregiao?.mesorregiao?.UF?.sigla || '',
    })).filter((m) => m.nome && m.uf);
    writeCidadesCache(cidades);
    return cidades;
  } catch (error) {
    console.warn('[hospedagem] Não foi possível carregar cidades do IBGE.', error);
    return [];
  }
}

async function loadClientesRef() {
  const nomes = new Set();
  const add = (v) => {
    const txt = String(v ?? '').trim();
    if (txt) nomes.add(txt);
  };
  try {
    const [prod, os] = await Promise.all([
      supabase.from('relatorio_resultado_diario').select('cliente_nacional').limit(5000),
      supabase.from('operacional_os').select('cliente').limit(5000),
    ]);
    (prod.data || []).forEach((r) => add(r.cliente_nacional));
    (os.data || []).forEach((r) => add(r.cliente));
  } catch (error) {
    console.warn('[hospedagem] Não foi possível carregar clientes.', error);
  }
  return [...nomes].sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

const STATUS_SOLICITACAO = {
  SOLICITADA: 'Solicitada',
  EM_ANALISE: 'Em análise',
  EM_COTACAO: 'Em cotação',
  RESERVADA: 'Reservada',
  CANCELADA: 'Cancelada',
  CONCLUIDA: 'Concluída',
};

function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function brDate(value) {
  if (!value) return '-';
  const [y, m, d] = String(value).slice(0, 10).split('-');
  return y && m && d ? `${d}/${m}/${y}` : String(value);
}

function todayISO() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function diffDays(start, end) {
  if (!start || !end) return 1;
  const a = new Date(`${start}T00:00:00`);
  const b = new Date(`${end}T00:00:00`);
  const diff = Math.round((b - a) / 86400000);
  return Math.max(1, diff || 1);
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function getUserField(ctx, ...paths) {
  for (const path of paths) {
    const parts = path.split('.');
    let cur = ctx;
    for (const part of parts) cur = cur?.[part];
    if (cur !== undefined && cur !== null && String(cur).trim() !== '') return cur;
  }
  return null;
}

function colaboradorKey(row = {}) {
  const cpf = String(row.cpf || '').replace(/\D/g, '');
  return cpf || normalizeText(row.nome) || String(row.id || '').trim();
}

function deduplicateColaboradores(rows = []) {
  const map = new Map();
  for (const row of rows) {
    const key = colaboradorKey(row);
    if (key && !map.has(key)) map.set(key, row);
  }
  return [...map.values()];
}

function injectStyles() {
  if (document.getElementById('hospedagemGestorStyles')) return;
  const style = document.createElement('style');
  style.id = 'hospedagemGestorStyles';
  style.textContent = `
    .hosp-workspace{border:1px solid var(--line);border-radius:18px;overflow:hidden;background:rgba(3,18,12,.72);min-height:calc(100vh - 150px)}
    .hosp-workspace-head{height:42px;display:flex;align-items:center;padding:0 18px;border-bottom:1px solid var(--line);color:var(--green-2);font-size:10px;font-weight:900;letter-spacing:.17em;text-transform:uppercase;background:rgba(7,28,18,.78)}
    .hosp-workspace-head::before{content:'▣';font-size:13px;margin-right:10px;color:#22c55e}
    .hosp-workspace-body{display:grid;grid-template-columns:minmax(320px,360px) minmax(0,1fr);min-height:calc(100vh - 193px)}
    .hosp-form-pane{border-right:1px solid var(--line);background:rgba(5,25,16,.78);min-width:0;display:flex;flex-direction:column}
    .hosp-form-intro{padding:17px 19px;border-bottom:1px solid var(--line)}
    .hosp-form-intro h2{margin:0;color:#f0fff7;font-size:15px;font-weight:900}
    .hosp-form-intro p{margin:5px 0 0;color:#6fa589;font-size:12px}
    .hosp-form{padding:0 19px 18px;display:flex;flex-direction:column;min-height:0}
    .hosp-grp{padding:17px 0;border-bottom:1px solid rgba(34,197,94,.16)}
    .hosp-grp:last-of-type{border-bottom:0}
    .hosp-grp-h{display:flex;align-items:center;gap:8px;margin:0 0 12px;color:#31d57a;font-size:9.5px;font-weight:900;letter-spacing:.16em;text-transform:uppercase}
    .hosp-grid{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));gap:9px}
    .hosp-field{display:flex;flex-direction:column;gap:5px;min-width:0}
    .hosp-field.full{grid-column:1/-1}.hosp-field.col-3{grid-column:span 3}.hosp-field.col-4{grid-column:span 4}.hosp-field.col-5{grid-column:span 5}.hosp-field.col-6{grid-column:span 6}.hosp-field.col-7{grid-column:span 7}.hosp-field.col-8{grid-column:span 8}.hosp-field.col-9{grid-column:span 9}
    .hosp-field label{font-size:10.5px;color:#67a383;font-weight:750}
    .hosp-field input,.hosp-field textarea,.hosp-field select,.hosp-colab-row input{width:100%;min-height:36px;border:1px solid rgba(34,197,94,.23);background:#092117;color:#eafff3;border-radius:0;padding:8px 10px;outline:none;color-scheme:dark;font-size:12.5px;box-sizing:border-box}
    .hosp-field input:focus,.hosp-field textarea:focus,.hosp-field select:focus,.hosp-colab-row input:focus{border-color:#2dd778;box-shadow:0 0 0 1px rgba(45,215,120,.15)}
    .hosp-field textarea{min-height:76px;resize:vertical}
    .hosp-diarias-badge{display:inline-flex;align-items:center;margin-left:auto;border:1px solid rgba(34,197,94,.35);background:rgba(22,101,52,.15);color:#7bf2ad;padding:4px 8px;font-size:9.5px;font-weight:850;letter-spacing:0;text-transform:none;white-space:nowrap}
    .hosp-colab-box{display:flex;flex-direction:column;gap:8px}
    .hosp-colab-row{display:grid;grid-template-columns:minmax(0,1fr) auto auto;gap:7px;align-items:center}
    .hosp-colab-type{display:none;align-items:center;min-height:34px;border:1px solid rgba(34,197,94,.22);background:rgba(22,101,52,.14);color:#9df2bd;padding:0 9px;font-size:10.5px;white-space:nowrap}
    .hosp-colab-type.show{display:flex}
    .hosp-remove{width:36px!important;height:36px!important;min-width:36px!important;margin:0!important;padding:0!important;border-radius:0!important;border:1px solid rgba(239,68,68,.25)!important;background:transparent!important;color:#d58b8b!important}
    .hosp-remove:hover{border-color:rgba(248,113,113,.55)!important;color:#fecaca!important}
    .hosp-add-colab{width:auto;align-self:flex-start;margin-top:8px;border:0;background:transparent;color:#2cdb79;padding:4px 0;cursor:pointer;font-weight:800;font-size:11.5px}
    .hosp-add-colab:hover{color:#86efac}
    .hosp-colab-hint{margin-top:10px;color:#4d8065;font-size:10.5px;font-style:italic;line-height:1.45}
    .hosp-ac{position:relative;width:100%}
    .hosp-ac-list{position:absolute;top:calc(100% + 4px);left:0;right:0;background:#092117;border:1px solid rgba(45,215,120,.35);overflow:hidden;z-index:80;max-height:230px;overflow-y:auto;box-shadow:0 14px 35px rgba(0,0,0,.5)}
    .hosp-ac-item{padding:9px 11px;cursor:pointer;font-size:12px;color:#eafff3;border-bottom:1px solid rgba(255,255,255,.05)}
    .hosp-ac-item:last-child{border-bottom:0}.hosp-ac-item:hover{background:rgba(45,215,120,.12)}
    .hosp-ac-item small{display:block;color:#6c9e82;font-size:10px;margin-top:2px}.hosp-ac-empty{padding:10px 11px;font-size:11.5px;color:#6c9e82;text-align:center}
    .hosp-form-actions{display:flex;align-items:center;gap:10px;margin-top:auto;padding:15px 0 0;border-top:1px solid rgba(34,197,94,.18);flex-wrap:wrap}
    .hosp-form-actions .btn{width:auto!important;margin:0!important;border-radius:0!important;min-height:38px;padding:0 14px;font-size:11.5px}
    .hosp-submit{background:rgba(22,101,52,.2)!important;border-color:rgba(45,215,120,.35)!important;color:#77eda8!important}
    .hosp-feedback{flex:1 1 100%;color:#6c9e82;font-size:11.5px}.hosp-feedback.ok{color:#86efac}.hosp-feedback.err{color:#fecaca}
    .hosp-list-pane{min-width:0;display:flex;flex-direction:column;background:rgba(3,20,12,.62)}
    .hosp-list-head{min-height:72px;display:flex;align-items:stretch;justify-content:space-between;border-bottom:1px solid var(--line);gap:12px}
    .hosp-stats{display:flex;align-items:stretch;min-width:0}
    .hosp-stat{min-width:110px;padding:14px 20px;border-right:1px solid rgba(34,197,94,.12);display:flex;flex-direction:column;justify-content:center}
    .hosp-stat span{font-size:8.5px;color:#4f9670;text-transform:uppercase;letter-spacing:.18em;font-weight:800}.hosp-stat strong{font-size:24px;color:#eafff3;margin-top:7px;font-weight:500;line-height:1}
    .hosp-refresh-wrap{display:flex;align-items:center;padding:0 18px}.hosp-refresh{width:auto!important;margin:0!important;border-radius:0!important;background:transparent!important;color:#65ad82!important;border-color:rgba(34,197,94,.25)!important;font-size:11px!important;padding:8px 13px!important}
    .hosp-table-wrap{overflow:auto;flex:1;min-height:320px}
    .hosp-table{width:100%;border-collapse:collapse;min-width:880px}
    .hosp-table th,.hosp-table td{padding:14px 16px;border-bottom:1px solid rgba(34,197,94,.14);text-align:left;vertical-align:top;font-size:12px}
    .hosp-table th{position:sticky;top:0;z-index:2;background:#082117;color:#4f9670;font-size:8.5px;text-transform:uppercase;letter-spacing:.18em;font-weight:850}
    .hosp-table tr:hover td{background:rgba(45,215,120,.035)}
    .hosp-table td{color:#e9fff2}.hosp-help{font-size:10px;color:#4b996d}.hosp-empty{padding:24px!important;color:#5c8d70!important;text-align:center}
    .hosp-status{display:inline-flex;align-items:center;gap:6px;padding:5px 8px;border:1px solid rgba(34,197,94,.24);font-size:10px;font-weight:750;white-space:nowrap}
    .hosp-status::before{content:'';width:6px;height:6px;border-radius:50%;background:currentColor}
    .hosp-status.solicitada{color:#48e78d;background:rgba(22,101,52,.18)}
    .hosp-status.em_analise,.hosp-status.em_cotacao{color:#facc15;background:rgba(161,98,7,.17);border-color:rgba(250,204,21,.3)}
    .hosp-status.reservada,.hosp-status.concluida{color:#32df79;background:rgba(22,101,52,.23)}
    .hosp-status.cancelada{color:#f87171;background:rgba(127,29,29,.17);border-color:rgba(248,113,113,.28)}
    .hosp-alert{border:1px solid rgba(245,158,11,.24);background:rgba(245,158,11,.08);color:#fde68a;padding:9px 10px;margin-top:9px;font-size:11.5px}
    @media(max-width:1180px){.hosp-workspace-body{grid-template-columns:1fr}.hosp-form-pane{border-right:0;border-bottom:1px solid var(--line)}.hosp-form{max-width:none}.hosp-list-pane{min-height:520px}}
    @media(max-width:700px){.hosp-grid{grid-template-columns:1fr 1fr}.hosp-grid .hosp-field{grid-column:1/-1}.hosp-field.col-3,.hosp-field.col-4,.hosp-field.col-5,.hosp-field.col-6,.hosp-field.col-7,.hosp-field.col-8,.hosp-field.col-9{grid-column:span 1}.hosp-list-head{flex-direction:column}.hosp-stats{width:100%}.hosp-stat{flex:1;min-width:0}.hosp-refresh-wrap{padding:10px 14px}.hosp-colab-row{grid-template-columns:minmax(0,1fr) auto}.hosp-colab-type{grid-column:1/-1;grid-row:2}}
  `;
  document.head.appendChild(style);
}

export function renderContent(content, userContext) {
  injectStyles();
  const state = {
    solicitacoes: [],
    colaboradores: [],
    totalAtivos: 0,
    totalDisponiveis: 0,
    cidades: [],
    clientes: [],
  };

  content.innerHTML = `
    <section class="hosp-workspace">
      <header class="hosp-workspace-head">Setor de hotéis</header>
      <div class="hosp-workspace-body">
        <aside class="hosp-form-pane">
          <div class="hosp-form-intro">
            <h2>Nova solicitação</h2>
            <p>Preencha os dados da hospedagem</p>
          </div>

          <form id="hospForm" class="hosp-form">
            <div class="hosp-grp">
              <div class="hosp-grp-h">⌖ Onde e para quem</div>
              <div class="hosp-grid">
                <div class="hosp-field col-4"><label for="uf">UF *</label>
                  <select id="uf" required><option value="">Selecione</option>${BR_UFS.map(([sigla, nome]) => `<option value="${sigla}">${sigla} — ${esc(nome)}</option>`).join('')}</select>
                </div>
                <div class="hosp-field col-8"><label for="cidade">Cidade *</label>
                  <select id="cidade" required disabled><option value="">Selecione a UF primeiro</option></select>
                </div>
                <div class="hosp-field full"><label for="cliente">Cliente *</label>
                  <select id="cliente" required><option value="">Carregando clientes...</option></select>
                  <input id="clienteManual" style="display:none;margin-top:6px" placeholder="Digite o nome do cliente" />
                </div>
                <div class="hosp-field full"><label for="localEmbarque">Local de embarque *</label><input id="localEmbarque" required placeholder="Ex.: Fazenda Nova Prata" /></div>
                <div class="hosp-field full"><label for="linkLocal">Localização (link)</label><input id="linkLocal" placeholder="Google Maps ou referência" /></div>
              </div>
            </div>

            <div class="hosp-grp">
              <div class="hosp-grp-h">▣ Período <span class="hosp-diarias-badge" id="diariasLabel">1 diária</span></div>
              <div class="hosp-grid">
                <div class="hosp-field col-6"><label for="checkin">Check-in *</label><input id="checkin" type="date" required /></div>
                <div class="hosp-field col-6"><label for="checkout">Check-out *</label><input id="checkout" type="date" required /></div>
                <div class="hosp-field full"><label for="horario">Previsão de chegada</label><input id="horario" type="time" /></div>
              </div>
            </div>

            <div class="hosp-grp">
              <div class="hosp-grp-h">♧ Colaboradores</div>
              <div class="hosp-colab-box" id="colabBox"></div>
              <button class="hosp-add-colab" type="button" id="addColabBtn">＋ Adicionar colaborador</button>
              <div class="hosp-colab-hint" id="colabBaseInfo">Carregando colaboradores ativos...</div>
              <div class="hosp-alert" id="colabFallback" style="display:none;">Não foi possível consultar a base de colaboradores agora. Você pode digitar os nomes manualmente.</div>
            </div>

            <div class="hosp-grp">
              <div class="hosp-grp-h">▤ Observações</div>
              <div class="hosp-field full"><textarea id="obs" placeholder="Ex.: chegará ~17h, priorizar hotel próximo ao embarque, observações sobre quartos..."></textarea></div>
            </div>

            <div class="hosp-form-actions">
              <button class="btn hosp-submit" type="submit" id="submitBtn">Enviar solicitação</button>
              <button class="btn btn-secondary" type="button" id="clearBtn">Limpar</button>
              <span class="hosp-feedback" id="feedback"></span>
            </div>
          </form>
        </aside>

        <section class="hosp-list-pane">
          <div class="hosp-list-head">
            <div class="hosp-stats">
              <div class="hosp-stat"><span>Total</span><strong id="statTotal">0</strong></div>
              <div class="hosp-stat"><span>Em andamento</span><strong id="statOpen">0</strong></div>
              <div class="hosp-stat"><span>Reservadas</span><strong id="statReserved">0</strong></div>
            </div>
            <div class="hosp-refresh-wrap"><button class="btn btn-secondary hosp-refresh" type="button" id="refreshBtn">↻ Atualizar</button></div>
          </div>

          <div class="hosp-table-wrap">
            <table class="hosp-table">
              <thead><tr><th>Código</th><th>Colaboradores</th><th>Cidade</th><th>Embarque</th><th>Período</th><th>Hotel</th><th>Status</th></tr></thead>
              <tbody id="minhasTbody"><tr><td colspan="7" class="hosp-empty">Carregando...</td></tr></tbody>
            </table>
          </div>
        </section>
      </div>
    </section>
  `;

  const form = document.getElementById('hospForm');
  const feedback = document.getElementById('feedback');
  const colabBox = document.getElementById('colabBox');
  const checkin = document.getElementById('checkin');
  const checkout = document.getElementById('checkout');
  const diariasLabel = document.getElementById('diariasLabel');
  const colabBaseInfo = document.getElementById('colabBaseInfo');
  const ufSelect = document.getElementById('uf');
  const cidadeSelect = document.getElementById('cidade');
  const clienteSelect = document.getElementById('cliente');
  const clienteManual = document.getElementById('clienteManual');

  function setFeedback(msg, type = '') {
    feedback.textContent = msg || '';
    feedback.className = `hosp-feedback ${type}`.trim();
  }

  function addDaysISO(iso, days) {
    const d = new Date(`${iso}T00:00:00`);
    d.setDate(d.getDate() + days);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function updateDiarias() {
    const n = diffDays(checkin.value, checkout.value);
    diariasLabel.textContent = `${n} diária${n === 1 ? '' : 's'}`;
  }

  // #12/#13: checkin não pode ser retroativo; checkout não pode passar de checkin + 7 dias.
  function updateDataLimits() {
    const hoje = todayISO();
    checkin.min = hoje;
    if (checkin.value && checkin.value < hoje) checkin.value = hoje;

    const minCheckout = checkin.value || hoje;
    checkout.min = minCheckout;
    checkout.max = addDaysISO(minCheckout, 7);
    if (checkout.value && (checkout.value < checkout.min || checkout.value > checkout.max)) {
      checkout.value = checkout.min > checkout.max ? checkout.max : checkout.min;
    }
  }

  function populateCidades(uf) {
    if (!uf) {
      cidadeSelect.innerHTML = '<option value="">Selecione a UF primeiro</option>';
      cidadeSelect.disabled = true;
      return;
    }
    const doUf = state.cidades.filter((c) => c.uf === uf).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    cidadeSelect.innerHTML = doUf.length
      ? `<option value="">Selecione</option>${doUf.map((c) => `<option value="${esc(c.nome)}">${esc(c.nome)}</option>`).join('')}`
      : '<option value="">Nenhuma cidade encontrada</option>';
    cidadeSelect.disabled = !doUf.length;
  }

  function buscarColaboradores(query) {
    const q = normalizeText(query);
    if (!q) return [];
    return state.colaboradores
      .filter((c) => normalizeText(c.nome).includes(q))
      .sort((a, b) => String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR'))
      .slice(0, 15);
  }

  function addColabRow(value = '', tipo = '') {
    const id = `colab-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const wrap = document.createElement('div');
    wrap.className = 'hosp-colab-row';
    wrap.innerHTML = `
      <div class="hosp-ac">
        <input id="${id}" class="colabNome hosp-ac-input" autocomplete="off" spellcheck="false" required value="${esc(value)}" placeholder="Nome do colaborador..." />
        <div class="hosp-ac-list" hidden></div>
      </div>
      <input class="colabTipo" type="hidden" value="${esc(tipo)}" />
      <span class="hosp-colab-type ${tipo ? 'show' : ''}">${esc(tipo || 'Tipo automático')}</span>
      <button class="btn btn-secondary hosp-remove" type="button" title="Remover colaborador" aria-label="Remover">×</button>
    `;

    const removeBtn = wrap.querySelector('.hosp-remove');
    const nomeInput = wrap.querySelector('.colabNome');
    const tipoInput = wrap.querySelector('.colabTipo');
    const tipoBadge = wrap.querySelector('.hosp-colab-type');
    const acList = wrap.querySelector('.hosp-ac-list');
    let matches = [];

    removeBtn.addEventListener('click', () => {
      if (colabBox.children.length <= 1) return;
      wrap.remove();
    });

    function renderSuggestions() {
      matches = buscarColaboradores(nomeInput.value);
      if (!nomeInput.value.trim()) {
        acList.hidden = true;
        acList.innerHTML = '';
        tipoInput.value = '';
        tipoBadge.textContent = 'Tipo automático';
        tipoBadge.classList.remove('show');
        return;
      }
      acList.innerHTML = matches.length
        ? matches.map((c, i) => `<div class="hosp-ac-item" data-idx="${i}">${esc(c.nome)}<small>${esc([c.tipo, c.supervisao].filter(Boolean).join(' · '))}</small></div>`).join('')
        : '<div class="hosp-ac-empty">Nenhum colaborador ativo encontrado</div>';
      acList.hidden = false;
    }

    nomeInput.addEventListener('input', () => {
      tipoInput.value = '';
      tipoBadge.textContent = 'Tipo automático';
      tipoBadge.classList.remove('show');
      renderSuggestions();
    });
    nomeInput.addEventListener('focus', () => { if (nomeInput.value.trim()) renderSuggestions(); });
    nomeInput.addEventListener('blur', () => { setTimeout(() => { acList.hidden = true; }, 180); });
    acList.addEventListener('click', (event) => {
      const item = event.target.closest('.hosp-ac-item');
      if (!item) return;
      const selected = matches[Number(item.dataset.idx)];
      if (!selected) return;
      nomeInput.value = selected.nome;
      tipoInput.value = selected.tipo || '';
      tipoBadge.textContent = selected.tipo || 'Tipo não informado';
      tipoBadge.classList.add('show');
      acList.hidden = true;
    });

    colabBox.appendChild(wrap);
  }

  function resetForm() {
    form.reset();
    checkin.value = todayISO();
    checkout.value = addDaysISO(checkin.value, 1);
    updateDataLimits();
    populateCidades('');
    clienteManual.style.display = 'none';
    clienteManual.value = '';
    colabBox.innerHTML = '';
    addColabRow();
    updateDiarias();
    setFeedback('');
  }

  function getClienteValue() {
    return clienteManual.style.display !== 'none' ? clienteManual.value.trim() : clienteSelect.value.trim();
  }

  function getColaboradoresPayload() {
    return Array.from(colabBox.querySelectorAll('.hosp-colab-row')).map((row) => {
      const nome = row.querySelector('.colabNome').value.trim();
      const tipoAutomatico = row.querySelector('.colabTipo').value.trim();
      const found = state.colaboradores.find((c) => normalizeText(c.nome) === normalizeText(nome));
      return {
        colaborador_id: found?.id || null,
        nome_colaborador: nome,
        cpf: found?.cpf || null,
        tipo_colaborador: found?.tipo || tipoAutomatico || null,
        empresa: found?.empresa || getUserField(userContext, 'empresa', 'user.empresa') || null,
        coordenacao: found?.coordenacao || getUserField(userContext, 'coordenacao', 'user.coordenacao') || null,
        supervisao: found?.supervisao || getUserField(userContext, 'supervisao', 'user.supervisao') || null,
        status_colaborador: 'ATIVO',
      };
    }).filter((c) => c.nome_colaborador);
  }

  function parseSupervisaoList(value) {
    const text = String(value || '').trim();
    if (!text) return [];
    return [...new Set(text.split(/[,;|\n]+/).map((s) => s.trim()).filter(Boolean))];
  }

  function getMinhasRegionais() {
    const raw = getUserField(userContext, 'supervisao', 'user.supervisao');
    return [...new Set(parseSupervisaoList(raw).map(normalizeText))];
  }

  async function loadColaboradores() {
    try {
      const ativos = deduplicateColaboradores(await getColaboradores({ force: true, somenteAtivos: true }));
      const minhasRegionais = getMinhasRegionais();
      const disponiveis = minhasRegionais.length
        ? ativos.filter((row) => minhasRegionais.includes(normalizeText(row.supervisao)))
        : ativos;

      state.totalAtivos = ativos.length;
      state.totalDisponiveis = disponiveis.length;
      state.colaboradores = disponiveis.map((row) => ({
        id: row.id,
        nome: row.nome,
        cpf: row.cpf,
        tipo: row.tipo,
        empresa: row.empresa,
        coordenacao: row.coordenacao,
        supervisao: row.supervisao,
      }));

      colabBaseInfo.textContent = minhasRegionais.length
        ? `${state.totalAtivos} colaboradores ativos na base · ${state.totalDisponiveis} disponíveis na sua regional. O tipo é preenchido automaticamente.`
        : `${state.totalAtivos} colaboradores ativos disponíveis. O tipo é preenchido automaticamente.`;
    } catch (error) {
      console.error('[hospedagem] Falha ao carregar colaboradores:', error);
      document.getElementById('colabFallback').style.display = 'block';
      colabBaseInfo.textContent = 'Tipo do colaborador preenchido automaticamente quando encontrado na base.';
      state.colaboradores = [];
    }
  }

  async function submitSolicitacao(event) {
    event.preventDefault();
    setFeedback('Enviando solicitação...');
    const btn = document.getElementById('submitBtn');
    btn.disabled = true;

    const colaboradores = getColaboradoresPayload();
    if (!colaboradores.length) {
      setFeedback('Informe ao menos um colaborador.', 'err');
      btn.disabled = false;
      return;
    }

    if (!getClienteValue()) {
      setFeedback('Selecione o cliente.', 'err');
      btn.disabled = false;
      return;
    }

    if (checkin.value < todayISO()) {
      setFeedback('A data de check-in não pode ser anterior a hoje.', 'err');
      btn.disabled = false;
      return;
    }

    if (checkout.value > addDaysISO(checkin.value, 7)) {
      setFeedback('A data de check-out não pode passar de 7 dias após o check-in.', 'err');
      btn.disabled = false;
      return;
    }

    const payload = {
      data_solicitacao: new Date().toISOString().slice(0, 10),
      solicitante_id: userContext?.user?.id || null,
      solicitante_nome: userContext?.user?.name || null,
      solicitante_email: userContext?.user?.email || null,
      empresa: getUserField(userContext, 'empresa', 'user.empresa') || null,
      coordenacao: getUserField(userContext, 'coordenacao', 'user.coordenacao') || null,
      supervisao: getUserField(userContext, 'supervisao', 'user.supervisao') || null,
      regional: getUserField(userContext, 'regional', 'user.regional') || getUserField(userContext, 'supervisao', 'user.supervisao') || null,
      cidade: cidadeSelect.value.trim(),
      uf: ufSelect.value.trim().toUpperCase() || null,
      cliente: getClienteValue() || null,
      local_embarque: document.getElementById('localEmbarque').value.trim(),
      link_local_embarque: document.getElementById('linkLocal').value.trim() || null,
      data_checkin_prevista: checkin.value,
      data_checkout_prevista: checkout.value,
      horario_chegada_previsto: document.getElementById('horario').value || null,
      quantidade_diarias_prevista: diffDays(checkin.value, checkout.value),
      observacao_gestor: document.getElementById('obs').value.trim() || null,
      status_solicitacao: 'SOLICITADA',
    };

    const { data, error } = await supabase
      .from('hospedagem_solicitacoes')
      .insert(payload)
      .select('id,codigo')
      .single();

    if (error) {
      setFeedback(error.message || 'Erro ao criar solicitação.', 'err');
      btn.disabled = false;
      return;
    }

    const itens = colaboradores.map((c) => ({ ...c, solicitacao_id: data.id }));
    const { error: colabError } = await supabase.from('hospedagem_solicitacao_colaboradores').insert(itens);
    if (colabError) {
      setFeedback(`Solicitação criada, mas houve erro ao vincular colaboradores: ${colabError.message}`, 'err');
      btn.disabled = false;
      return;
    }

    await supabase.from('hospedagem_eventos').insert({
      solicitacao_id: data.id,
      usuario_id: userContext?.user?.id || null,
      usuario_nome: userContext?.user?.name || null,
      tipo_evento: 'SOLICITACAO_CRIADA',
      descricao: 'Solicitação criada pelo gestor.',
      status_novo: 'SOLICITADA',
    });

    resetForm();
    setFeedback(`Solicitação ${data.codigo || ''} enviada com sucesso.`, 'ok');
    await loadSolicitacoes(false);
    btn.disabled = false;
  }

  async function loadSolicitacoes(showLoading = true) {
    const tbody = document.getElementById('minhasTbody');
    if (showLoading) tbody.innerHTML = '<tr><td colspan="7" class="hosp-empty">Carregando...</td></tr>';

    let query = supabase
      .from('hospedagem_minhas_solicitacoes')
      .select('*')
      .order('data_solicitacao', { ascending: false });
    if (userContext?.user?.id) query = query.eq('solicitante_id', userContext.user.id);

    const { data, error } = await query;
    if (error) {
      tbody.innerHTML = `<tr><td colspan="7" class="hosp-empty">${esc(error.message)}</td></tr>`;
      return;
    }

    state.solicitacoes = data || [];
    document.getElementById('statTotal').textContent = state.solicitacoes.length;
    document.getElementById('statOpen').textContent = state.solicitacoes.filter((row) => ['SOLICITADA', 'EM_ANALISE', 'EM_COTACAO'].includes(row.status_solicitacao)).length;
    document.getElementById('statReserved').textContent = state.solicitacoes.filter((row) => row.status_solicitacao === 'RESERVADA').length;

    if (!state.solicitacoes.length) {
      tbody.innerHTML = '<tr><td colspan="7" class="hosp-empty">Nenhuma solicitação encontrada.</td></tr>';
      return;
    }

    tbody.innerHTML = state.solicitacoes.map((row) => `
      <tr>
        <td><strong>${esc(row.codigo || '-')}</strong><br><span class="hosp-help">${brDate(row.data_solicitacao)}</span></td>
        <td>${esc(row.colaboradores || '-')}</td>
        <td>${esc([row.cidade, row.uf].filter(Boolean).join('/'))}</td>
        <td>${esc(row.local_embarque || '-')}</td>
        <td>${brDate(row.data_checkin_prevista)} até ${brDate(row.data_checkout_prevista)}<br><span class="hosp-help">${esc(row.quantidade_diarias_prevista || '-')} diária(s)</span></td>
        <td>${esc(row.hotel || '-')}</td>
        <td><span class="hosp-status ${esc(String(row.status_solicitacao || '').toLowerCase())}">${esc(STATUS_SOLICITACAO[row.status_solicitacao] || row.status_solicitacao || '-')}</span></td>
      </tr>
    `).join('');
  }

  document.getElementById('addColabBtn').addEventListener('click', () => addColabRow());
  document.getElementById('clearBtn').addEventListener('click', resetForm);
  document.getElementById('refreshBtn').addEventListener('click', () => loadSolicitacoes());
  checkin.addEventListener('change', () => { updateDataLimits(); updateDiarias(); });
  checkout.addEventListener('change', () => { updateDataLimits(); updateDiarias(); });
  ufSelect.addEventListener('change', () => populateCidades(ufSelect.value));
  form.addEventListener('submit', submitSolicitacao);

  async function loadCidadesEClientes() {
    const [cidades, clientes] = await Promise.all([loadCidadesBrasil(), loadClientesRef()]);
    state.cidades = cidades;
    state.clientes = clientes;

    if (clientes.length) {
      clienteSelect.innerHTML = `<option value="">Selecione o cliente</option>${clientes.map((c) => `<option value="${esc(c)}">${esc(c)}</option>`).join('')}`;
    } else {
      clienteSelect.innerHTML = '<option value="">Não foi possível carregar a lista</option>';
      clienteSelect.disabled = true;
      clienteManual.style.display = 'block';
    }

    if (ufSelect.value) populateCidades(ufSelect.value);
  }

  (async function boot() {
    await loadColaboradores();
    resetForm();
    await loadSolicitacoes(false);
    await loadCidadesEClientes();
  })();
}

initProtectedPage('Hospedagem', renderContent);
