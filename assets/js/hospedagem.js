import { initProtectedPage } from './pageInit.js';
import { supabase } from './supabaseClient.js';
import { getColaboradores } from './colaboradoresCache.js';

const STATUS_SOLICITACAO = {
  SOLICITADA: 'Solicitada',
  EM_ANALISE: 'Em análise',
  EM_COTACAO: 'Em cotação',
  RESERVADA: 'Reservada',
  CANCELADA: 'Cancelada',
  CONCLUIDA: 'Concluída'
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

function money(value) {
  const n = Number(value || 0);
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
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
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
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

async function safeSelect(table, columns = '*', build = null) {
  try {
    let query = supabase.from(table).select(columns);
    if (typeof build === 'function') query = build(query);
    const { data, error } = await query;
    if (error) throw error;
    return { data: data || [], error: null };
  } catch (error) {
    return { data: [], error };
  }
}

function injectStyles() {
  if (document.getElementById('hospedagemGestorStyles')) return;
  const style = document.createElement('style');
  style.id = 'hospedagemGestorStyles';
  style.textContent = `
    .hosp-tabs{display:flex;gap:6px;margin:0 0 16px;flex-wrap:wrap}
    .hosp-tab{border:1px solid var(--line);background:var(--bg-card);color:var(--muted);border-radius:12px;padding:9px 16px;cursor:pointer;font-weight:700;font-size:13px;width:auto;margin:0}
    .hosp-tab:hover{color:#cfe7da;border-color:var(--line-2)}
    .hosp-tab.active{background:linear-gradient(135deg,var(--green-3),var(--green));color:#f0fff7;border-color:var(--green-2)}
    .hosp-panel{display:none}.hosp-panel.active{display:block}
    .hosp-card{background:var(--bg-card);border:1px solid var(--line);border-radius:16px;padding:16px 18px}
    .hosp-grp{margin-top:16px}.hosp-grp:first-child{margin-top:0}
    .hosp-grp-h{display:flex;align-items:center;gap:8px;font-size:11px;font-weight:850;letter-spacing:.05em;text-transform:uppercase;color:var(--green-2);margin:0 0 9px}
    .hosp-grid{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));gap:10px}
    .hosp-field{display:flex;flex-direction:column;gap:5px;min-width:0}
    .hosp-field.full{grid-column:1/-1}.hosp-field.col-2{grid-column:span 2}.hosp-field.col-3{grid-column:span 3}.hosp-field.col-4{grid-column:span 4}.hosp-field.col-5{grid-column:span 5}.hosp-field.col-6{grid-column:span 6}
    .hosp-field label{font-size:11px;color:var(--muted);font-weight:700}
    .hosp-field input,.hosp-field textarea,.hosp-field select{width:100%;min-height:40px;border:1px solid var(--line-2);background:#0a1e17;color:var(--text);border-radius:11px;padding:9px 11px;outline:none;color-scheme:dark;font-size:14px;box-sizing:border-box}
    .hosp-field textarea{min-height:62px;resize:vertical}
    .hosp-field input:focus,.hosp-field textarea:focus,.hosp-field select:focus{border-color:var(--green-2);outline:2px solid rgba(111,208,165,.16)}
    .hosp-help{font-size:11.5px;color:var(--muted)}
    .hosp-diarias-badge{display:inline-flex;align-items:center;gap:7px;border:1px solid rgba(111,208,165,.28);background:rgba(63,168,120,.14);color:#bbf7d0;border-radius:999px;padding:6px 13px;font-weight:800;font-size:12px;white-space:nowrap}
    .hosp-diarias-badge::before{content:'';width:6px;height:6px;border-radius:50%;background:var(--green-2)}
    .hosp-actions{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:16px;padding-top:14px;border-top:1px solid var(--line)}
    .hosp-btn{width:auto!important;margin-top:0!important}
    .hosp-feedback{color:var(--muted);font-size:13px}.hosp-feedback.ok{color:#bbf7d0}.hosp-feedback.err{color:#fecaca}
    .hosp-colab-box{display:flex;flex-direction:column;gap:8px}
    .hosp-colab-row{display:grid;grid-template-columns:1.5fr .8fr auto;gap:8px;align-items:center}
    .hosp-colab-row input{width:100%;min-height:40px;border:1px solid var(--line-2);background:#0a1e17;color:var(--text);border-radius:11px;padding:9px 11px;outline:none;color-scheme:dark;font-size:14px;box-sizing:border-box}
    .hosp-colab-row input:focus{border-color:var(--green-2);outline:2px solid rgba(111,208,165,.16)}
    .hosp-ac{position:relative;width:100%}
    .hosp-ac-list{position:absolute;top:calc(100% + 5px);left:0;right:0;background:#0a1e17;border:1px solid rgba(111,208,165,.3);border-radius:12px;overflow:hidden;z-index:50;max-height:230px;overflow-y:auto;box-shadow:0 10px 30px rgba(0,0,0,.45)}
    .hosp-ac-item{padding:9px 12px;cursor:pointer;font-size:13px;color:var(--text);border-bottom:1px solid rgba(255,255,255,.05)}
    .hosp-ac-item:last-child{border-bottom:0}
    .hosp-ac-item:hover{background:rgba(111,208,165,.12);color:#eafff4}
    .hosp-ac-item small{display:block;color:var(--muted);font-size:11px;margin-top:2px}
    .hosp-ac-empty{padding:9px 12px;font-size:12.5px;color:var(--muted);text-align:center}
    .hosp-remove{width:auto!important;margin:0!important;padding:0 14px!important;height:40px;border-radius:11px!important;white-space:nowrap;font-size:15px}
    .hosp-remove:hover{border-color:rgba(248,113,113,.4);color:#fecaca}
    .hosp-add-colab{width:auto;align-self:flex-start;margin-top:2px;border:1px dashed var(--line-2);background:transparent;color:var(--muted);border-radius:11px;padding:9px 14px;cursor:pointer;font-weight:700;font-size:13px}
    .hosp-add-colab:hover{border-color:var(--green-2);color:#bbf7d0}
    .hosp-empty{padding:16px;color:var(--muted);text-align:center}
    .hosp-alert{border:1px solid rgba(245,158,11,.24);background:rgba(245,158,11,.08);color:#fde68a;border-radius:12px;padding:10px 12px;margin-top:10px;font-size:12.5px}
    .hosp-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px;margin-bottom:14px}
    .hosp-stat{background:var(--bg-card);border:1px solid var(--line);border-radius:13px;padding:11px 14px}
    .hosp-stat span{font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.05em}
    .hosp-stat strong{display:block;font-size:22px;margin-top:3px;color:var(--text)}
    .hosp-table-wrap{overflow:auto;border:1px solid var(--line);border-radius:14px}
    .hosp-table{width:100%;border-collapse:collapse;min-width:760px}
    .hosp-table th,.hosp-table td{padding:11px 13px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top;font-size:13px}
    .hosp-table th{font-size:10.5px;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;font-weight:800;background:rgba(13,32,24,.55)}
    .hosp-table tr:hover td{background:rgba(111,208,165,.045)}
    .hosp-status{display:inline-flex;align-items:center;gap:6px;padding:5px 9px;border-radius:999px;border:1px solid var(--line-2);font-size:11.5px;font-weight:700;white-space:nowrap}
    .hosp-status::before{content:'';width:6px;height:6px;border-radius:50%;background:currentColor}
    .hosp-status.solicitada,.hosp-status.em_analise,.hosp-status.em_cotacao{color:#fde68a;background:rgba(245,158,11,.1);border-color:rgba(245,158,11,.24)}.hosp-status.reservada{color:#bfdbfe;background:rgba(59,130,246,.11);border-color:rgba(59,130,246,.25)}.hosp-status.concluida{color:#bbf7d0;background:rgba(22,101,52,.22);border-color:rgba(22,101,52,.34)}.hosp-status.cancelada{color:#fecaca;background:rgba(220,38,38,.13);border-color:rgba(220,38,38,.24)}
    @media(max-width:760px){.hosp-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.hosp-grid .hosp-field{grid-column:span 1}.hosp-field.full{grid-column:1/-1}.hosp-colab-row{grid-template-columns:1fr auto}.hosp-colab-row .hosp-ac{grid-column:1/-1}}
  `;
  document.head.appendChild(style);
}

export function renderContent(content, userContext) {
  injectStyles();
  const state = { solicitacoes: [], colaboradores: [], tab: 'solicitar' };

  content.innerHTML = `
    <div class="hosp-tabs" id="hospTabs">
      <button class="hosp-tab active" data-tab="solicitar" type="button">Solicitar</button>
      <button class="hosp-tab" data-tab="minhas" type="button">Minhas solicitações</button>
    </div>

    <section class="hosp-panel active" id="panel-solicitar">
      <form id="hospForm" class="hosp-card">
        <div class="hosp-grp">
          <div class="hosp-grp-h">📍 Onde e para quem</div>
          <div class="hosp-grid">
            <div class="hosp-field col-5"><label for="cidade">Cidade *</label><input id="cidade" required placeholder="Ex.: Araguapaz" /></div>
            <div class="hosp-field col-2"><label for="uf">UF *</label><input id="uf" required maxlength="2" placeholder="GO" /></div>
            <div class="hosp-field col-5"><label for="cliente">Cliente *</label><input id="cliente" required placeholder="Cliente / unidade / fazenda" /></div>
            <div class="hosp-field col-6"><label for="localEmbarque">Local de embarque *</label><input id="localEmbarque" required placeholder="Ex.: Fazenda Claite" /></div>
            <div class="hosp-field col-6"><label for="linkLocal">Localização (link)</label><input id="linkLocal" placeholder="Link do Google Maps ou referência" /></div>
          </div>
        </div>

        <div class="hosp-grp">
          <div class="hosp-grp-h">Período <span class="hosp-diarias-badge" id="diariasLabel" style="margin-left:auto;text-transform:none;letter-spacing:0">1 diária prevista</span></div>
          <div class="hosp-grid">
            <div class="hosp-field col-3"><label for="checkin">Check-in *</label><input id="checkin" type="date" required /></div>
            <div class="hosp-field col-3"><label for="checkout">Check-out *</label><input id="checkout" type="date" required /></div>
            <div class="hosp-field col-3"><label for="horario">Chegada</label><input id="horario" type="time" /></div>
            <div class="hosp-field col-3"><label for="saldo">Saldo informado</label><input id="saldo" type="number" step="0.01" min="0" placeholder="0,00" /></div>
          </div>
        </div>

        <div class="hosp-grp">
          <div class="hosp-grp-h">Colaboradores</div>
          <div class="hosp-colab-box" id="colabBox"></div>
          <button class="hosp-add-colab" type="button" id="addColabBtn">+ Adicionar colaborador</button>
          <div class="hosp-alert" id="colabFallback" style="display:none;">Não foi possível consultar a base de colaboradores agora. Você pode digitar os nomes manualmente.</div>
        </div>

        <div class="hosp-grp">
          <div class="hosp-grp-h">Observações</div>
          <div class="hosp-field full"><textarea id="obs" placeholder="Ex.: chegará ~17h, priorizar hotel próximo ao embarque, observações sobre quartos..."></textarea></div>
        </div>

        <div class="hosp-actions">
          <button class="btn btn-primary hosp-btn" type="submit" id="submitBtn">Enviar solicitação</button>
          <button class="btn btn-secondary hosp-btn" type="button" id="clearBtn">Limpar</button>
          <span class="hosp-feedback" id="feedback"></span>
        </div>
      </form>
    </section>

    <section class="hosp-panel" id="panel-minhas">
      <div class="hosp-stats">
        <div class="hosp-stat"><span>Total</span><strong id="statTotal">0</strong></div>
        <div class="hosp-stat"><span>Em andamento</span><strong id="statOpen">0</strong></div>
        <div class="hosp-stat"><span>Reservadas</span><strong id="statReserved">0</strong></div>
      </div>
      <div class="hosp-card" style="padding:14px 16px">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:12px">
          <strong style="font-size:15px">Minhas solicitações</strong>
          <button class="btn btn-secondary hosp-btn" type="button" id="refreshBtn">↻ Atualizar</button>
        </div>
        <div class="hosp-table-wrap">
          <table class="hosp-table">
            <thead><tr><th>Código</th><th>Colaboradores</th><th>Cidade</th><th>Embarque</th><th>Período</th><th>Hotel</th><th>Status</th></tr></thead>
            <tbody id="minhasTbody"><tr><td colspan="7" class="hosp-empty">Carregando...</td></tr></tbody>
          </table>
        </div>
      </div>
    </section>
  `;

  const form = document.getElementById('hospForm');
  const feedback = document.getElementById('feedback');
  const colabBox = document.getElementById('colabBox');
  const checkin = document.getElementById('checkin');
  const checkout = document.getElementById('checkout');
  const diariasLabel = document.getElementById('diariasLabel');

  function setFeedback(msg, type = '') {
    feedback.textContent = msg || '';
    feedback.className = `hosp-feedback ${type}`.trim();
  }

  function moveTabIndicator(immediate = false) {
    const active = document.querySelector('.hosp-tab.active');
    const indicator = document.getElementById('hospTabIndicator');
    if (!active || !indicator) return;
    if (immediate) indicator.style.transition = 'none';
    indicator.style.width = `${active.offsetWidth}px`;
    indicator.style.transform = `translateX(${active.offsetLeft - 5}px)`;
    if (immediate) {
      // eslint-disable-next-line no-unused-expressions
      indicator.offsetHeight; // força reflow antes de reativar a transição
      indicator.style.transition = '';
    }
  }

  function setTab(tab) {
    state.tab = tab;
    document.querySelectorAll('.hosp-tab').forEach((btn) => btn.classList.toggle('active', btn.dataset.tab === tab));
    document.querySelectorAll('.hosp-panel').forEach((panel) => panel.classList.remove('active'));
    document.getElementById(`panel-${tab}`).classList.add('active');
    moveTabIndicator();
    if (tab === 'minhas') loadMinhas();
  }

  function updateDiarias() {
    const n = diffDays(checkin.value, checkout.value);
    diariasLabel.textContent = `${n} diária${n === 1 ? '' : 's'} prevista${n === 1 ? '' : 's'}`;
  }

  function renumberColabRows() {
    colabBox.querySelectorAll('.hosp-colab-index').forEach((el, i) => { el.textContent = i + 1; });
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
      <input class="colabTipo" value="${esc(tipo)}" placeholder="Fixo / Diarista" />
      <button class="btn btn-secondary hosp-remove" type="button" title="Remover colaborador" aria-label="Remover">✕</button>
    `;
    wrap.querySelector('.hosp-remove').addEventListener('click', () => {
      if (colabBox.children.length <= 1) return;
      wrap.remove();
      renumberColabRows();
    });

    const nomeInput = wrap.querySelector('.colabNome');
    const tipoInput = wrap.querySelector('.colabTipo');
    const acList = wrap.querySelector('.hosp-ac-list');
    let matches = [];

    function renderSuggestions() {
      matches = buscarColaboradores(nomeInput.value);
      if (!nomeInput.value.trim()) {
        acList.hidden = true;
        acList.innerHTML = '';
        return;
      }
      acList.innerHTML = matches.length
        ? matches.map((c, i) => `<div class="hosp-ac-item" data-idx="${i}">${esc(c.nome)}<small>${esc([c.tipo, c.supervisao].filter(Boolean).join(' · '))}</small></div>`).join('')
        : '<div class="hosp-ac-empty">Nenhum colaborador encontrado na sua regional</div>';
      acList.hidden = false;
    }

    nomeInput.addEventListener('input', renderSuggestions);
    nomeInput.addEventListener('focus', () => { if (nomeInput.value.trim()) renderSuggestions(); });
    nomeInput.addEventListener('blur', () => { setTimeout(() => { acList.hidden = true; }, 180); });
    acList.addEventListener('click', (ev) => {
      const item = ev.target.closest('.hosp-ac-item');
      if (!item) return;
      const selected = matches[Number(item.dataset.idx)];
      if (!selected) return;
      nomeInput.value = selected.nome;
      tipoInput.value = selected.tipo || '';
      acList.hidden = true;
    });

    colabBox.appendChild(wrap);
    renumberColabRows();
  }

  function resetForm() {
    form.reset();
    checkin.value = todayISO();
    const out = new Date();
    out.setDate(out.getDate() + 1);
    checkout.value = `${out.getFullYear()}-${String(out.getMonth() + 1).padStart(2, '0')}-${String(out.getDate()).padStart(2, '0')}`;
    colabBox.innerHTML = '';
    addColabRow();
    updateDiarias();
    setFeedback('');
  }

  function getColaboradoresPayload() {
    return Array.from(colabBox.querySelectorAll('.hosp-colab-row')).map((row) => {
      const nome = row.querySelector('.colabNome').value.trim();
      const tipoManual = row.querySelector('.colabTipo').value.trim();
      const found = state.colaboradores.find((c) => normalizeText(c.nome) === normalizeText(nome));
      return {
        colaborador_id: found?.id || null,
        nome_colaborador: nome,
        cpf: found?.cpf || null,
        tipo_colaborador: found?.tipo || tipoManual || null,
        empresa: found?.empresa || getUserField(userContext, 'empresa', 'user.empresa') || null,
        coordenacao: found?.coordenacao || getUserField(userContext, 'coordenacao', 'user.coordenacao') || null,
        supervisao: found?.supervisao || getUserField(userContext, 'supervisao', 'user.supervisao') || null,
        status_colaborador: 'ATIVO'
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
    let data;
    try {
      data = await getColaboradores(); // cache compartilhado (foto mais recente)
    } catch {
      document.getElementById('colabFallback').style.display = 'block';
      state.colaboradores = [];
      return;
    }
    const latest = data.reduce((max, row) => row.data_referencia > max ? row.data_referencia : max, '');
    const minhasRegionais = getMinhasRegionais();
    state.colaboradores = data
      .filter((row) => !latest || row.data_referencia === latest)
      .filter((row) => row.ativo !== false)
      // Restringe a sugestão à(s) regional(is) do próprio gestor (campo supervisao).
      // Sem nenhuma regional configurada no perfil, mantém a lista completa como fallback.
      .filter((row) => !minhasRegionais.length || minhasRegionais.includes(normalizeText(row.supervisao)))
      .map((row) => ({
        id: row.id,
        nome: row.nome,
        cpf: row.cpf,
        tipo: row.tipo,
        empresa: row.empresa,
        coordenacao: row.coordenacao,
        supervisao: row.supervisao
      }));
  }

  async function submitSolicitacao(ev) {
    ev.preventDefault();
    setFeedback('Enviando solicitação...');
    const btn = document.getElementById('submitBtn');
    btn.disabled = true;

    const colaboradores = getColaboradoresPayload();
    if (!colaboradores.length) {
      setFeedback('Informe ao menos um colaborador.', 'err');
      btn.disabled = false;
      return;
    }

    const payload = {
      // Compatibilidade com bases antigas do painel que possuem data_solicitacao NOT NULL.
      // Na base nova, a view usa created_at como data_solicitacao; este campo extra é ignorado quando não existe.
      data_solicitacao: new Date().toISOString().slice(0, 10),
      solicitante_id: userContext?.user?.id || null,
      solicitante_nome: userContext?.user?.name || null,
      solicitante_email: userContext?.user?.email || null,
      empresa: getUserField(userContext, 'empresa', 'user.empresa') || null,
      coordenacao: getUserField(userContext, 'coordenacao', 'user.coordenacao') || null,
      supervisao: getUserField(userContext, 'supervisao', 'user.supervisao') || null,
      regional: getUserField(userContext, 'regional', 'user.regional') || getUserField(userContext, 'supervisao', 'user.supervisao') || null,
      cidade: document.getElementById('cidade').value.trim(),
      uf: document.getElementById('uf').value.trim().toUpperCase() || null,
      cliente: document.getElementById('cliente').value.trim() || null,
      local_embarque: document.getElementById('localEmbarque').value.trim(),
      link_local_embarque: document.getElementById('linkLocal').value.trim() || null,
      data_checkin_prevista: checkin.value,
      data_checkout_prevista: checkout.value,
      horario_chegada_previsto: document.getElementById('horario').value || null,
      quantidade_diarias_prevista: diffDays(checkin.value, checkout.value),
      saldo_informado: document.getElementById('saldo').value ? Number(document.getElementById('saldo').value) : null,
      observacao_gestor: document.getElementById('obs').value.trim() || null,
      status_solicitacao: 'SOLICITADA'
    };

    const { data, error } = await supabase.from('hospedagem_solicitacoes').insert(payload).select('id,codigo').single();
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
      status_novo: 'SOLICITADA'
    });

    resetForm();
    setFeedback(`Solicitação ${data.codigo || ''} enviada com sucesso.`, 'ok');
    await loadMinhas(false);
    btn.disabled = false;
  }

  async function loadMinhas(showLoading = true) {
    const tbody = document.getElementById('minhasTbody');
    if (showLoading) tbody.innerHTML = `<tr><td colspan="7" class="hosp-empty">Carregando...</td></tr>`;
    let query = supabase.from('hospedagem_minhas_solicitacoes').select('*').order('data_solicitacao', { ascending: false });
    if (userContext?.user?.id) query = query.eq('solicitante_id', userContext.user.id);
    const { data, error } = await query;
    if (error) {
      tbody.innerHTML = `<tr><td colspan="7" class="hosp-empty">${esc(error.message)}</td></tr>`;
      return;
    }
    state.solicitacoes = data || [];
    document.getElementById('statTotal').textContent = state.solicitacoes.length;
    document.getElementById('statOpen').textContent = state.solicitacoes.filter((r) => ['SOLICITADA', 'EM_ANALISE', 'EM_COTACAO'].includes(r.status_solicitacao)).length;
    document.getElementById('statReserved').textContent = state.solicitacoes.filter((r) => r.status_solicitacao === 'RESERVADA').length;
    if (!state.solicitacoes.length) {
      tbody.innerHTML = `<tr><td colspan="7" class="hosp-empty">Nenhuma solicitação encontrada.</td></tr>`;
      return;
    }
    tbody.innerHTML = state.solicitacoes.map((r) => `
      <tr>
        <td><strong>${esc(r.codigo || '-')}</strong><br><span class="hosp-help">${brDate(r.data_solicitacao)}</span></td>
        <td>${esc(r.colaboradores || '-')}</td>
        <td>${esc([r.cidade, r.uf].filter(Boolean).join('/'))}</td>
        <td>${esc(r.local_embarque || '-')}</td>
        <td>${brDate(r.data_checkin_prevista)} até ${brDate(r.data_checkout_prevista)}<br><span class="hosp-help">${esc(r.quantidade_diarias_prevista || '-')} diária(s)</span></td>
        <td>${esc(r.hotel || '-')}</td>
        <td><span class="hosp-status ${esc(String(r.status_solicitacao || '').toLowerCase())}">${esc(STATUS_SOLICITACAO[r.status_solicitacao] || r.status_solicitacao || '-')}</span></td>
      </tr>
    `).join('');
  }

  document.querySelectorAll('.hosp-tab').forEach((btn) => btn.addEventListener('click', () => setTab(btn.dataset.tab)));
  document.getElementById('addColabBtn').addEventListener('click', () => addColabRow());
  document.getElementById('clearBtn').addEventListener('click', resetForm);
  document.getElementById('refreshBtn').addEventListener('click', () => loadMinhas());
  checkin.addEventListener('change', updateDiarias);
  checkout.addEventListener('change', updateDiarias);
  form.addEventListener('submit', submitSolicitacao);
  window.addEventListener('resize', () => moveTabIndicator(true));

  moveTabIndicator(true);

  (async function boot() {
    await loadColaboradores();
    resetForm();
    await loadMinhas(false);
  })();
}

initProtectedPage('Hospedagem', renderContent);
