import { initProtectedPage } from './pageInit.js';
import { supabase, SUPABASE_URL } from './supabaseClient.js';

const SERVICOS = {
  '03220': 'SEDEX Contrato',
  '03298': 'PAC Contrato',
  '80900': 'Carta Registrada c/ AR',
};

const SERVICOS_REVERSA = {
  '03312': 'PAC Reversa',
  '03280': 'SEDEX Reversa',
};

const STATUS_LABEL = {
  RASCUNHO: 'Rascunho',
  CONFIRMADO: 'Confirmado',
  POSTADO: 'Postado',
  EM_TRANSITO: 'Em trânsito',
  ENTREGUE: 'Entregue',
  DEVOLVIDO: 'Devolvido',
  ERRO: 'Erro',
};

const STATUS_CLASS = {
  RASCUNHO: 'neutral',
  CONFIRMADO: 'info',
  POSTADO: 'info',
  EM_TRANSITO: 'warn',
  ENTREGUE: 'ok',
  DEVOLVIDO: 'danger',
  ERRO: 'danger',
};

const MONEY = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

function esc(v) {
  return String(v ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function badge(status) {
  const cls = STATUS_CLASS[status] ?? 'neutral';
  return `<span class="badge badge-${cls}">${esc(STATUS_LABEL[status] ?? status)}</span>`;
}

function printPdf(b64) {
  const bytes = atob(b64);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  const blob = new Blob([arr], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const win = window.open('', '_blank');
  if (!win) {
    const a = document.createElement('a');
    a.href = url; a.target = '_blank'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    return;
  }
  win.document.write(
    '<!DOCTYPE html><html><head><title>Etiqueta Correios</title>' +
    '<style>*{margin:0;padding:0}html,body,iframe{width:100%;height:100%;border:none;display:block}</style></head><body>' +
    '<iframe src="' + url + '" onload="setTimeout(function(){window.print()},300)"></iframe>' +
    '</body></html>'
  );
  win.document.close();
  win.addEventListener('afterprint', () => URL.revokeObjectURL(url));
}


// ── State ─────────────────────────────────────────────────────────────────────
const state = {
  tab: 'postagens',
  postagens: [],
  remetentes: [],
  destinatarios: [],
  reversa: [],
  loading: false,
  feedback: '',
  feedbackErr: false,
  rastreioInterval: null,
};

let $root = null;

// ── Helpers ───────────────────────────────────────────────────────────────────
function setFeedback(msg, isErr = false) {
  state.feedback = msg;
  state.feedbackErr = isErr;
  const el = $root?.querySelector('#envios-feedback');
  if (!el) return;
  el.textContent = msg;
  el.className = 'feedback-bar' + (isErr ? ' feedback-err' : ' feedback-ok');
  el.style.display = msg ? 'block' : 'none';
}

async function callFn(name, body) {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch(`${getSupabaseUrl()}/functions/v1/${name}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session?.access_token}`,
    },
    body: JSON.stringify(body),
  });
  return res.json();
}

function getSupabaseUrl() {
  return SUPABASE_URL;
}

// ── Data loaders ──────────────────────────────────────────────────────────────
async function fetchAllDestinatarios() {
  let dests = [];
  for (let offset = 0; ; offset += 1000) {
    const { data } = await supabase
      .from('envios_destinatarios')
      .select('id, nome, cidade, uf, cep, matricula, logradouro, numero, complemento, bairro, email, telefone, cpf_cnpj, origem')
      .eq('ativo', true)
      .order('nome')
      .range(offset, offset + 999);
    dests = dests.concat(data ?? []);
    if (!data || data.length < 1000) break;
  }
  return dests;
}

async function loadAll() {
  state.loading = true;
  const [{ data: posts }, { data: rems }, { data: rev }, dests] = await Promise.all([
    supabase.from('envios_postagens')
      .select('*, remetente:envios_remetentes(*), destinatario:envios_destinatarios(*)')
      .order('created_at', { ascending: false })
      .limit(200),
    supabase.from('envios_remetentes').select('*').eq('ativo', true).order('nome'),
    supabase.from('envios_reversa')
      .select('*, cliente:envios_destinatarios(nome, cidade, uf), empresa:envios_remetentes(nome)')
      .order('created_at', { ascending: false })
      .limit(200),
    fetchAllDestinatarios(),
  ]);

  state.postagens = posts ?? [];
  state.remetentes = rems ?? [];
  state.destinatarios = dests;
  state.reversa = rev ?? [];
  state.loading = false;
}

async function autoRastrear() {
  const targets = state.postagens.filter(p => ['POSTADO', 'EM_TRANSITO'].includes(p.status) && p.numero_objeto);
  if (!targets.length) return;
  for (const p of targets) {
    try { await callFn('correios-rastrear', { postagem_id: p.id, numeros: [p.numero_objeto] }); } catch {}
  }
  await loadAll();
  if (state.tab === 'enviados') renderTab();
  const el = $root?.querySelector('#rastreio-auto-status');
  if (el) el.textContent = `Atualizado às ${new Date().toLocaleTimeString('pt-BR')}`;
}

function startRastreioAuto() {
  autoRastrear();
  if (state.rastreioInterval) clearInterval(state.rastreioInterval);
  state.rastreioInterval = setInterval(autoRastrear, 3_600_000);
}

async function importarDestinatariosColaboradores() {
  setFeedback('Importando colaboradores...');

  const formatCep = raw => {
    const d = (raw ?? '').toString().replace(/\D/g, '');
    return d.length === 8 ? `${d.slice(0,5)}-${d.slice(5)}` : '00000-000';
  };

  // Busca historico_colaboradores (tem cep, estado, cidade, bairro, endereco, complemento)
  // ORDER BY data_referencia DESC => registro mais recente vence na deduplicação por nome
  let colabs = [];
  const PAGE = 1000;
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await supabase
      .from('historico_colaboradores')
      .select('nome, email_pessoal, whatsapp, cep, estado, cidade, bairro, endereco, complemento')
      .eq('ativo', true)
      .order('data_referencia', { ascending: false })
      .range(offset, offset + PAGE - 1);
    if (error) { setFeedback('Erro ao buscar colaboradores: ' + error.message, true); return; }
    colabs = colabs.concat(data ?? []);
    if (!data || data.length < PAGE) break;
  }

  // Deduplica por nome — primeiro encontrado vence (mais recente por ORDER BY DESC)
  const byNome = new Map();
  for (const c of colabs) {
    if (!c.nome || byNome.has(c.nome)) continue;
    byNome.set(c.nome, {
      nome: c.nome,
      email: c.email_pessoal || null,
      telefone: c.whatsapp || null,
      cep: formatCep(c.cep),
      logradouro: c.endereco || '-',
      numero: 'S/N',
      complemento: c.complemento || null,
      bairro: c.bairro || '-',
      cidade: c.cidade || '-',
      uf: (c.estado || 'PR').toString().trim().toUpperCase().slice(0, 2),
      origem: 'colaborador',
      ativo: true,
    });
  }
  const rows = [...byNome.values()];

  if (!rows.length) { setFeedback('Nenhum colaborador encontrado.'); return; }

  let total = 0;
  for (let i = 0; i < rows.length; i += 500) {
    const lote = rows.slice(i, i + 500);
    const { error: iErr } = await supabase
      .from('envios_destinatarios')
      .upsert(lote, { onConflict: 'nome', ignoreDuplicates: false });
    if (iErr) { setFeedback('Erro ao importar: ' + iErr.message, true); return; }
    total += lote.length;
    setFeedback(`Importando... ${total}/${rows.length}`);
  }
  setFeedback(`${total} destinatário(s) sincronizados com endereço atualizado.`);
  await loadAll();
  renderTab();
}

// ── Render ────────────────────────────────────────────────────────────────────

async function importarDestinatariosPlanilha(file) {
  setFeedback('Lendo planilha...');
  const XLSX = window.XLSX;
  if (!XLSX) { setFeedback('Biblioteca XLSX não carregada. Recarregue a página.', true); return; }

  let data;
  try {
    const buffer = await file.arrayBuffer();
    const wb = XLSX.read(buffer, { type: 'array' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    data = XLSX.utils.sheet_to_json(ws, { defval: '' });
  } catch (err) { setFeedback('Erro ao ler planilha: ' + err.message, true); return; }

  if (!data.length) { setFeedback('Planilha vazia ou inválida.', true); return; }

  const norm = s => (s ?? '').toString().trim().toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '');

  const COL_MAP = {
    nome:        ['nome'],
    cep:         ['cep'],
    uf:          ['estado', 'uf'],
    cidade:      ['cidade'],
    bairro:      ['bairro'],
    logradouro:  ['endereco', 'endereço', 'logradouro', 'rua', 'address'],
    complemento: ['complemento'],
    email:       ['email'],
    telefone:    ['telefone', 'celular', 'fone'],
    matricula:   ['matricula', 'matricula'],
    cpf_cnpj:    ['cpf', 'cnpj', 'cpf_cnpj', 'documento'],
  };

  const headers = Object.keys(data[0]);
  const fieldMap = {};
  for (const [field, aliases] of Object.entries(COL_MAP)) {
    for (const h of headers) {
      if (aliases.includes(norm(h))) { fieldMap[field] = h; break; }
    }
  }

  if (!fieldMap.nome) { setFeedback('Coluna "Nome" não encontrada na planilha.', true); return; }

  const formatCep = raw => {
    const d = (raw ?? '').toString().replace(/\D/g, '');
    return d.length === 8 ? `${d.slice(0,5)}-${d.slice(5)}` : '00000-000';
  };

  const get = (row, field) => fieldMap[field] ? (row[fieldMap[field]] ?? '').toString().trim() : '';

  const rows = data
    .filter(r => get(r, 'nome'))
    .map(r => ({
      nome:        get(r, 'nome'),
      cep:         formatCep(get(r, 'cep')),
      uf:          get(r, 'uf').toUpperCase().slice(0, 2) || 'PR',
      cidade:      get(r, 'cidade') || '-',
      bairro:      get(r, 'bairro') || '-',
      logradouro:  get(r, 'logradouro') || '-',
      complemento: get(r, 'complemento') || null,
      email:       get(r, 'email') || null,
      telefone:    get(r, 'telefone') || null,
      matricula:   get(r, 'matricula') || null,
      cpf_cnpj:    get(r, 'cpf_cnpj') || null,
      numero:      'S/N',
      origem:      'planilha',
      ativo:       true,
    }));

  if (!rows.length) { setFeedback('Nenhuma linha válida encontrada.', true); return; }

  let total = 0;
  for (let i = 0; i < rows.length; i += 500) {
    const lote = rows.slice(i, i + 500);
    const { error } = await supabase
      .from('envios_destinatarios')
      .upsert(lote, { onConflict: 'nome', ignoreDuplicates: false });
    if (error) { setFeedback('Erro ao importar: ' + error.message, true); return; }
    total += lote.length;
    setFeedback(`Importando... ${total}/${rows.length}`);
  }
  setFeedback(`${total} destinatário(s) importados da planilha.`);
  await loadAll();
  renderTab();
}

function renderTab() {
  const area = $root?.querySelector('#envios-tab-content');
  if (!area) return;
  if (state.tab === 'postagens') area.innerHTML = renderPostagens();
  else if (state.tab === 'etiquetar') area.innerHTML = renderEtiquetar();
  else if (state.tab === 'enviados') area.innerHTML = renderEnviados();
  else if (state.tab === 'historico') area.innerHTML = renderHistorico();
  else if (state.tab === 'cotacao') area.innerHTML = renderCotacao();
  else if (state.tab === 'reversa') area.innerHTML = renderReversa();
  else if (state.tab === 'remetentes') area.innerHTML = renderRemetentes();
  else if (state.tab === 'destinatarios') area.innerHTML = renderDestinatarios();
  bindTabEvents();
}

function renderPostagens() {
  const remPadrao = state.remetentes.find(r => r.padrao)
    ?? state.remetentes.find(r => r.nome?.toUpperCase().includes('GRAOMIL'))
    ?? state.remetentes[0];
  const optRem = state.remetentes.map(r =>
    `<option value="${r.id}"${r.id === remPadrao?.id ? ' selected' : ''}>${esc(r.nome)} — ${esc(r.cidade)}/${esc(r.uf)}</option>`
  ).join('');
  const optServ = Object.entries(SERVICOS).map(([cod, nome]) => `<option value="${cod}">${esc(nome)}</option>`).join('');
  const pending = state.postagens.filter(p => p.status === 'RASCUNHO');
  const erros = state.postagens.filter(p => p.status === 'ERRO');

  const rowsPending = pending.map(p => `
    <tr>
      <td>${esc(p.destinatario?.nome ?? '-')}</td>
      <td>${esc(SERVICOS[p.servico_codigo] ?? p.servico_nome)}</td>
      <td>${p.peso_gramas ? p.peso_gramas + 'g' : '-'}</td>
      <td class="td-actions">
        <button class="btn btn-sm btn-danger" data-excluir-postagem="${p.id}">Excluir</button>
      </td>
    </tr>`).join('');

  const rowsErro = erros.map(p => `
    <tr>
      <td>${esc(p.destinatario?.nome ?? '-')}</td>
      <td>${esc(SERVICOS[p.servico_codigo] ?? p.servico_nome)}</td>
      <td style="max-width:260px;font-size:12px;color:rgba(255,100,100,.8)">${esc(p.observacoes ?? 'Erro desconhecido')}</td>
      <td class="td-actions">
        <button class="btn btn-sm btn-secondary" data-retentar="${p.id}">Retentar</button>
        <button class="btn btn-sm btn-danger" data-excluir-enviado="${p.id}">Excluir</button>
      </td>
    </tr>`).join('');

  return `
    <div class="form-section">
      <h3 style="margin:0 0 16px">Nova Postagem</h3>
      <form id="form-nova-postagem" class="form-grid">
        <div class="form-group">
          <label>Remetente *</label>
          <select name="remetente_id" required>${optRem || '<option value="">— cadastre um remetente primeiro —</option>'}</select>
        </div>
        <div class="form-group">
          <label>Destinatário *</label>
          <div class="dest-ac-wrap">
            <input type="text" id="search-dest-post" placeholder="Digite o nome..." autocomplete="off" />
            <input type="hidden" name="destinatario_id" id="hidden-dest-post-id" />
            <ul class="dest-ac-drop" id="dest-ac-drop-post"></ul>
          </div>
        </div>
        <div class="form-group">
          <label>Serviço *</label>
          <select name="servico_codigo" required>${optServ}</select>
        </div>
        <div class="form-group">
          <label>Peso (gramas) *</label>
          <input type="number" name="peso_gramas" min="1" value="100" required />
        </div>
        <div class="form-group">
          <label>Formato</label>
          <select name="formato" id="sel-formato">
            <option value="caixa">Caixa/Pacote</option>
            <option value="envelope">Envelope</option>
            <option value="rolo">Rolo/Prisma</option>
          </select>
        </div>
        <div class="form-group" id="grupo-altura">
          <label>Altura (cm)</label>
          <input type="number" name="altura_cm" id="inp-altura" min="0" step="0.1" value="0" />
        </div>
        <div class="form-group">
          <label>Largura (cm)</label>
          <input type="number" name="largura_cm" min="0" step="0.1" value="0" />
        </div>
        <div class="form-group">
          <label>Comprimento (cm)</label>
          <input type="number" name="comprimento_cm" min="0" step="0.1" value="0" />
        </div>
        <div class="form-group">
          <label>Valor declarado (R$)</label>
          <input type="number" name="valor_declarado" min="0" step="0.01" value="0" />
        </div>
        <div class="form-group">
          <label>Conteúdo</label>
          <input type="text" name="conteudo" placeholder="Documentos, correspondência..." />
        </div>
        <div class="form-group full-width">
          <label>Observações</label>
          <textarea name="observacoes" rows="2"></textarea>
        </div>
        <div class="form-actions full-width">
          <button type="submit" class="btn btn-primary">Adicionar à fila</button>
        </div>
      </form>
    </div>
    ${pending.length > 0 ? `
    <div class="form-section">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:8px">
        <h3 style="margin:0">${pending.length} postagem(ns) na fila</h3>
        <button class="btn btn-success" id="btn-enviar-pendentes">Enviar ${pending.length} ao Correios</button>
      </div>
      <div class="table-wrapper">
        <table class="data-table">
          <thead><tr><th>Destinatário</th><th>Serviço</th><th>Peso</th><th>Ações</th></tr></thead>
          <tbody>${rowsPending}</tbody>
        </table>
      </div>
    </div>` : ''}
    ${erros.length > 0 ? `
    <div class="form-section" style="border-color:rgba(239,68,68,.20)">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;flex-wrap:wrap;gap:8px">
        <h3 style="margin:0;color:rgba(255,130,130,.85)">${erros.length} postagem(ns) com ERRO</h3>
        <button class="btn btn-danger" id="btn-excluir-erros">Excluir todos ERROs</button>
      </div>
      <div class="table-wrapper">
        <table class="data-table">
          <thead><tr><th>Destinatário</th><th>Serviço</th><th>Motivo</th><th>Ações</th></tr></thead>
          <tbody>${rowsErro}</tbody>
        </table>
      </div>
    </div>` : ''}`;
}

function renderEtiquetar() {
  const items = state.postagens.filter(p => p.status === 'CONFIRMADO' && p.id_prepostagem);
  const rows = items.map(p => `
    <tr>
      <td>${esc(p.destinatario?.nome ?? '-')}</td>
      <td>${esc(SERVICOS[p.servico_codigo] ?? p.servico_nome)}</td>
      <td>${esc(p.numero_objeto ?? '-')}</td>
      <td>${p.confirmado_em ? new Date(p.confirmado_em).toLocaleString('pt-BR') : '-'}</td>
      <td class="td-actions">
        <button class="btn btn-sm btn-primary" data-etiqueta-etiquetar="${p.id}">Etiqueta</button>
      </td>
    </tr>`).join('');

  return `
    <div class="toolbar" style="margin-bottom:12px">
      <button class="btn btn-secondary" id="btn-refresh-etiquetar">↻ Atualizar</button>
      ${items.length > 1 ? `<button class="btn btn-primary" id="btn-etiqueta-lote-etiquetar">Gerar todas (${items.length}) em lote</button>` : ''}
    </div>
    ${items.length === 0
      ? '<p class="empty-state">Nenhuma postagem aguardando etiqueta. Envie postagens pela aba <strong>Postagens</strong>.</p>'
      : `<div class="table-wrapper">
          <table class="data-table">
            <thead><tr><th>Destinatário</th><th>Serviço</th><th>Código de Rastreio</th><th>Confirmado em</th><th>Ações</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>`}`;
}

function renderEnviados() {
  const sent = state.postagens.filter(p => ['POSTADO', 'EM_TRANSITO'].includes(p.status));

  const header = `<div class="envios-row-header">
    <span>Data</span><span>Destinatário</span><span>Código de Rastreio</span><span>Status</span><span>Previsão</span>
  </div>`;

  const rows = sent.map(p => {
    const dest = p.destinatario ?? {};
    const localidade = [dest.cidade, dest.uf].filter(Boolean).join('/');
    const dt = p.confirmado_em ? new Date(p.confirmado_em) : null;
    const dtStr = dt ? dt.toLocaleDateString('pt-BR') : '-';
    const hrStr = dt ? dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '';
    const prazo = p.prazo_entrega
      ? new Date(p.prazo_entrega).toLocaleDateString('pt-BR')
      : (p.prazo_dias && dt)
        ? new Date(dt.getTime() + p.prazo_dias * 86_400_000).toLocaleDateString('pt-BR')
        : '-';
    return `
    <div class="envios-row">
      <div class="envios-col-data">
        <span class="envios-data-main">${dtStr}</span>
        ${hrStr ? `<span class="envios-data-sub">${hrStr}</span>` : ''}
      </div>
      <div>
        <div class="envios-nome" title="${esc(dest.nome ?? '')}">${esc(dest.nome ?? '-')}</div>
        <div class="envios-sub">${esc(SERVICOS[p.servico_codigo] ?? p.servico_nome)}${localidade ? ' · ' + esc(localidade) : ''}</div>
        ${p.valor_postagem ? `<div class="envios-sub">${MONEY.format(p.valor_postagem)}</div>` : ''}
      </div>
      <div>
        ${p.numero_objeto
          ? `<span class="envios-rastreio-code">${esc(p.numero_objeto)}</span>`
          : '<span class="envios-sub">—</span>'}
      </div>
      <div>${badge(p.status)}</div>
      <div class="envios-col-prev">
        <span class="envios-data-main">${prazo}</span>
        <div class="envios-col-prev-actions">
          ${p.numero_objeto ? `<button class="btn btn-sm btn-secondary" data-rastrear="${p.id}" data-objeto="${esc(p.numero_objeto)}">Rastrear</button>` : ''}
          <button class="btn btn-sm btn-secondary" data-etiqueta="${p.id}">Gerar novamente etiqueta</button>
          <button class="btn btn-sm btn-secondary" data-declaracao="${p.id}">DACE</button>
        </div>
      </div>
    </div>`;
  }).join('');

  return `
    <div class="toolbar" style="margin-bottom:14px;align-items:center">
      <button class="btn btn-secondary" id="btn-refresh-enviados">↻ Atualizar</button>
      <span id="rastreio-auto-status" style="font-size:12px;color:rgba(180,220,195,.40)"></span>
    </div>
    ${sent.length === 0
      ? '<p class="empty-state">Nenhum envio em trânsito. Gere etiquetas na aba <strong>Etiquetar</strong>.</p>'
      : header + `<div class="envios-row-list">${rows}</div>`}
    <div id="rastreio-resultado" style="margin-top:16px"></div>`;
}

function renderHistorico() {
  const hist = state.postagens.filter(p => ['ENTREGUE', 'DEVOLVIDO'].includes(p.status));
  const entregues = hist.filter(p => p.status === 'ENTREGUE').length;
  const devolvidos = hist.filter(p => p.status === 'DEVOLVIDO').length;

  const header = `<div class="envios-row-header">
    <span>Data</span><span>Destinatário</span><span>Código de Rastreio</span><span>Status</span><span>Previsão</span>
  </div>`;

  const rows = hist.map(p => {
    const dest = p.destinatario ?? {};
    const localidade = [dest.cidade, dest.uf].filter(Boolean).join('/');
    const dt = p.confirmado_em ? new Date(p.confirmado_em) : null;
    const dtStr = dt ? dt.toLocaleDateString('pt-BR') : '-';
    const hrStr = dt ? dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '';
    const prazo = p.prazo_entrega
      ? new Date(p.prazo_entrega).toLocaleDateString('pt-BR')
      : (p.prazo_dias && dt)
        ? new Date(dt.getTime() + p.prazo_dias * 86_400_000).toLocaleDateString('pt-BR')
        : '-';
    return `
    <div class="envios-row${p.status === 'DEVOLVIDO' ? ' envios-row-devolvido' : ''}">
      <div class="envios-col-data">
        <span class="envios-data-main">${dtStr}</span>
        ${hrStr ? `<span class="envios-data-sub">${hrStr}</span>` : ''}
      </div>
      <div>
        <div class="envios-nome" title="${esc(dest.nome ?? '')}">${esc(dest.nome ?? '-')}</div>
        <div class="envios-sub">${esc(SERVICOS[p.servico_codigo] ?? p.servico_nome)}${localidade ? ' · ' + esc(localidade) : ''}</div>
        ${p.valor_postagem ? `<div class="envios-sub">${MONEY.format(p.valor_postagem)}</div>` : ''}
      </div>
      <div>
        ${p.numero_objeto
          ? `<span class="envios-rastreio-code">${esc(p.numero_objeto)}</span>`
          : '<span class="envios-sub">—</span>'}
      </div>
      <div>${badge(p.status)}</div>
      <div class="envios-col-prev">
        <span class="envios-data-main">${prazo}</span>
        <div class="envios-col-prev-actions">
          <button class="btn btn-sm btn-secondary" data-etiqueta="${p.id}">Gerar novamente etiqueta</button>
          <button class="btn btn-sm btn-secondary" data-declaracao="${p.id}">Gerar novamente DACE</button>
        </div>
      </div>
    </div>`;
  }).join('');

  const summary = hist.length
    ? `<span style="font-size:13px;color:rgba(180,220,195,.48)">${hist.length} total${entregues ? ' · ' + entregues + ' entregue(s)' : ''}${devolvidos ? ' · ' + devolvidos + ' devolvido(s)' : ''}</span>`
    : '';

  return `
    <div class="toolbar" style="margin-bottom:14px;align-items:center">
      <button class="btn btn-secondary" id="btn-refresh-historico">↻ Atualizar</button>
      ${summary}
    </div>
    ${hist.length === 0
      ? '<p class="empty-state">Nenhum envio concluído ou devolvido ainda.</p>'
      : header + `<div class="envios-row-list">${rows}</div>`}`;
}

// (renderNovaPostagem removida — formulário integrado em renderPostagens)
function _unused_renderNovaPostagem() {
  const optRem = '';
  const optDest = '';
  const optServ = Object.entries(SERVICOS).map(([cod, nome]) => `<option value="${cod}">${esc(nome)}</option>`).join('');

  return `
    <div class="form-section">
      <h3>Nova Postagem</h3>
      <form id="form-nova-postagem" class="form-grid">
        <div class="form-group">
          <label>Remetente *</label>
          <select name="remetente_id" required>${optRem || '<option value="">— cadastre um remetente primeiro —</option>'}</select>
        </div>
        <div class="form-group">
          <label>Destinatário *</label>
          <div class="dest-ac-wrap">
            <input type="text" id="search-dest-post" placeholder="Digite o nome..." autocomplete="off" />
            <input type="hidden" name="destinatario_id" id="hidden-dest-post-id" />
            <ul class="dest-ac-drop" id="dest-ac-drop-post"></ul>
          </div>
        </div>
        <div class="form-group">
          <label>Serviço *</label>
          <select name="servico_codigo" required>${optServ}</select>
        </div>
        <div class="form-group">
          <label>Peso (gramas) *</label>
          <input type="number" name="peso_gramas" min="1" value="100" required />
        </div>
        <div class="form-group">
          <label>Formato</label>
          <select name="formato">
            <option value="caixa">Caixa/Pacote</option>
            <option value="envelope">Envelope</option>
            <option value="rolo">Rolo/Prisma</option>
          </select>
        </div>
        <div class="form-group">
          <label>Altura (cm)</label>
          <input type="number" name="altura_cm" min="0" step="0.1" value="0" />
        </div>
        <div class="form-group">
          <label>Largura (cm)</label>
          <input type="number" name="largura_cm" min="0" step="0.1" value="0" />
        </div>
        <div class="form-group">
          <label>Comprimento (cm)</label>
          <input type="number" name="comprimento_cm" min="0" step="0.1" value="0" />
        </div>
        <div class="form-group">
          <label>Valor declarado (R$)</label>
          <input type="number" name="valor_declarado" min="0" step="0.01" value="0" />
        </div>
        <div class="form-group">
          <label>Conteúdo</label>
          <input type="text" name="conteudo" placeholder="Documentos, correspondência..." />
        </div>
        <div class="form-group full-width">
          <label>Observações</label>
          <textarea name="observacoes" rows="2"></textarea>
        </div>
        <div class="form-actions full-width">
          <button type="submit" class="btn btn-primary">Adicionar</button>
          <button type="button" class="btn btn-secondary" data-tab="postagens">Cancelar</button>
        </div>
      </form>
    </div>`;
}


function renderCotacao() {
  return `
    <div class="form-section">
      <h3>Cotação de Envio</h3>
      <form id="form-cotacao" class="form-grid">
        <div class="form-group">
          <label>CEP de Origem *</label>
          <input type="text" name="cep_origem" placeholder="00000-000" maxlength="9" required />
        </div>
        <div class="form-group full-width">
          <label>Destinatário (preenche CEP de Destino)</label>
          <div class="dest-ac-wrap">
            <input type="text" id="search-dest-cotacao" placeholder="Digite o nome do destinatário..." autocomplete="off" />
            <ul class="dest-ac-drop" id="dest-ac-drop"></ul>
          </div>
        </div>
        <div class="form-group">
          <label>CEP de Destino *</label>
          <input type="text" name="cep_destino" placeholder="00000-000" maxlength="9" required />
        </div>
        <div class="form-group">
          <label>Peso (gramas) *</label>
          <input type="number" name="peso" min="1" value="300" required />
        </div>
        <div class="form-group">
          <label>Formato</label>
          <select name="formato">
            <option value="caixa">Caixa/Pacote</option>
            <option value="envelope">Envelope</option>
            <option value="rolo">Rolo/Prisma</option>
          </select>
        </div>
        <div class="form-group">
          <label>Altura (cm)</label>
          <input type="number" name="altura" value="10" min="0" step="0.1" />
        </div>
        <div class="form-group">
          <label>Largura (cm)</label>
          <input type="number" name="largura" value="15" min="0" step="0.1" />
        </div>
        <div class="form-group">
          <label>Comprimento (cm)</label>
          <input type="number" name="comprimento" value="20" min="0" step="0.1" />
        </div>
        <div class="form-group">
          <label>Valor declarado (R$)</label>
          <input type="number" name="valor_declarado" value="0" min="0" step="0.01" />
        </div>
        <div class="form-actions full-width">
          <button type="submit" class="btn btn-primary">Calcular Frete</button>
        </div>
      </form>
      <div id="cotacao-resultado" style="margin-top:20px"></div>
    </div>`;
}

function renderReversa() {
  const remPadrao = state.remetentes.find(r => r.padrao) ?? state.remetentes[0];
  const optEmpresa = state.remetentes.map(r =>
    `<option value="${r.id}"${r.id === remPadrao?.id ? ' selected' : ''}>${esc(r.nome)} — ${esc(r.cidade)}/${esc(r.uf)}</option>`
  ).join('');
  const optServico = Object.entries(SERVICOS_REVERSA).map(([cod, nome]) =>
    `<option value="${cod}">${esc(nome)}</option>`
  ).join('');

  const aguardando = state.reversa.filter(r => r.status === 'CONFIRMADO' && r.id_prepostagem);
  const enviadas   = state.reversa.filter(r => r.status === 'POSTADO');
  const erros      = state.reversa.filter(r => r.status === 'ERRO');
  const rascunhos  = state.reversa.filter(r => r.status === 'RASCUNHO');

  const STATUS_REV = { RASCUNHO: 'Rascunho', CONFIRMADO: 'Confirmado', POSTADO: 'Enviado', ERRO: 'Erro' };
  const STATUS_CLS = { RASCUNHO: 'neutral', CONFIRMADO: 'info', POSTADO: 'ok', ERRO: 'danger' };

  function revRow(r) {
    const st = r.status ?? 'RASCUNHO';
    const svc = SERVICOS_REVERSA[r.servico_codigo] ?? r.servico_nome ?? r.servico_codigo;
    return `<tr>
      <td>${esc(r.cliente?.nome ?? '—')}</td>
      <td>${esc(svc)}</td>
      <td>${r.peso_gramas ? r.peso_gramas + 'g' : '—'}</td>
      <td>${r.numero_objeto ? `<span class="envios-rastreio-code">${esc(r.numero_objeto)}</span>` : '—'}</td>
      <td><span class="badge badge-${STATUS_CLS[st] ?? 'neutral'}">${STATUS_REV[st] ?? st}</span></td>
      <td style="font-size:11px;max-width:200px;color:rgba(255,100,100,.7)">${r.status === 'ERRO' ? esc(r.observacoes ?? '') : ''}</td>
      <td class="td-actions">
        ${st === 'CONFIRMADO' ? `<button class="btn btn-sm btn-primary" data-rev-etiqueta="${r.id}">Etiqueta</button>` : ''}
        ${st === 'ERRO' ? `<button class="btn btn-sm btn-secondary" data-rev-retentar="${r.id}">Retentar</button>` : ''}
        ${['RASCUNHO','ERRO'].includes(st) ? `<button class="btn btn-sm btn-danger" data-rev-excluir="${r.id}">Excluir</button>` : ''}
      </td>
    </tr>`;
  }

  const allRows = state.reversa.map(revRow).join('');

  return `
    <div class="form-section">
      <div style="background:rgba(45,212,160,.07);border:1px solid rgba(45,212,160,.18);border-radius:12px;padding:12px 16px;margin-bottom:20px;font-size:.84rem;color:rgba(180,220,195,.72)">
        <strong style="color:rgba(45,212,160,.9)">Logística Reversa</strong> — Gere etiquetas pré-pagas para que clientes devolvam mercadorias.
        A etiqueta tem o cliente como <em>remetente</em> e a empresa como <em>destinatária</em>.
        Serviços disponíveis: PAC Reversa (03312) e SEDEX Reversa (03280) — sujeito à contratação.
      </div>
      <h3 style="margin:0 0 16px">Nova Etiqueta Reversa</h3>
      <form id="form-nova-reversa" class="form-grid">
        <div class="form-group">
          <label>Quem devolve (cliente) *</label>
          <div class="dest-ac-wrap">
            <input type="text" id="search-dest-rev" placeholder="Digite o nome do cliente..." autocomplete="off" />
            <input type="hidden" name="cliente_id" id="hidden-dest-rev-id" />
            <ul class="dest-ac-drop" id="dest-ac-drop-rev"></ul>
          </div>
        </div>
        <div class="form-group">
          <label>Receber em (empresa) *</label>
          <select name="empresa_id" required>${optEmpresa || '<option value="">— cadastre um remetente primeiro —</option>'}</select>
        </div>
        <div class="form-group">
          <label>Serviço *</label>
          <select name="servico_codigo" required>${optServico}</select>
        </div>
        <div class="form-group">
          <label>Peso estimado (gramas)</label>
          <input type="number" name="peso_gramas" min="1" value="300" />
        </div>
        <div class="form-group full-width">
          <label>Conteúdo da devolução</label>
          <input type="text" name="conteudo" placeholder="Ex: Produto com defeito, Troca..." />
        </div>
        <div class="form-actions full-width">
          <button type="submit" class="btn btn-primary">Criar Etiqueta Reversa</button>
        </div>
      </form>
    </div>
    ${state.reversa.length > 0 ? `
    <div class="form-section">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
        <h3 style="margin:0">Etiquetas (${state.reversa.length})</h3>
        <button class="btn btn-secondary" id="btn-refresh-reversa">↻ Atualizar</button>
      </div>
      <div class="table-wrapper">
        <table class="data-table">
          <thead><tr><th>Cliente</th><th>Serviço</th><th>Peso</th><th>Rastreio</th><th>Status</th><th>Erro</th><th>Ações</th></tr></thead>
          <tbody>${allRows}</tbody>
        </table>
      </div>
    </div>` : ''}`;
}

function renderRemetentes() {
  const rows = state.remetentes.map(r => `
    <tr>
      <td>${esc(r.nome)}</td>
      <td>${esc(r.logradouro)}, ${esc(r.numero)} — ${esc(r.bairro)}</td>
      <td>${esc(r.cidade)}/${esc(r.uf)}</td>
      <td>${esc(r.cep)}</td>
      <td>${r.padrao ? '<span class="badge badge-ok">Padrão</span>' : ''}</td>
      <td class="td-actions">
        ${!r.padrao ? `<button class="btn btn-sm btn-secondary" data-rem-padrao="${r.id}">Definir padrão</button>` : ''}
        <button class="btn btn-sm btn-danger" data-rem-excluir="${r.id}">Excluir</button>
      </td>
    </tr>`).join('');

  return `
    <div class="toolbar" style="margin-bottom:12px">
      <button class="btn btn-primary" id="btn-novo-remetente">+ Novo Remetente</button>
    </div>
    <div id="form-remetente-wrap"></div>
    ${state.remetentes.length === 0
      ? '<p class="empty-state">Nenhum remetente cadastrado.</p>'
      : `<div class="table-wrapper">
          <table class="data-table">
            <thead><tr><th>Nome</th><th>Endereço</th><th>Cidade/UF</th><th>CEP</th><th></th><th>Ações</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>`}`;
}

function renderDestRows(lista) {
  if (!lista.length) return '<tr><td colspan="6" style="text-align:center;color:rgba(200,230,210,.4);padding:20px">Nenhum resultado encontrado.</td></tr>';
  return lista.map(d => `
    <tr>
      <td>${esc(d.nome)}</td>
      <td>${d.matricula ? esc(d.matricula) : '-'}</td>
      <td>${esc(d.cidade)}/${esc(d.uf)}</td>
      <td>${esc(d.cep)}</td>
      <td><span class="badge badge-neutral">${esc(d.origem ?? 'manual')}</span></td>
      <td class="td-actions">
        <button class="btn btn-sm btn-secondary" data-dest-editar="${d.id}">Editar</button> <button class="btn btn-sm btn-danger" data-dest-excluir="${d.id}">Excluir</button>
      </td>
    </tr>`).join('');
}

function renderDestinatarios() {
  return `
    <div class="toolbar" style="margin-bottom:12px">
      <button class="btn btn-primary" id="btn-novo-dest">+ Novo Destinatário</button>
      <button class="btn btn-secondary" id="btn-importar-colabs">Importar de Colaboradores</button>
      <button class="btn btn-secondary" id="btn-importar-planilha">Importar Planilha (.xlsx/.csv)</button>
      <input type="file" id="input-planilha-dest" accept=".xlsx,.xls,.csv" style="display:none" />
    </div>
    <div style="margin-bottom:12px">
      <input type="search" id="dest-search" placeholder="Pesquisar por nome, matrícula ou cidade..." autocomplete="off"
        style="width:100%;padding:10px 14px;border:1px solid rgba(45,212,160,.18);border-radius:12px;background:rgba(8,22,17,.58);color:var(--text);font:inherit;font-size:.92rem;outline:none;box-sizing:border-box" />
    </div>
    <div id="form-dest-wrap"></div>
    ${state.destinatarios.length === 0
      ? '<p class="empty-state">Nenhum destinatário cadastrado.</p>'
      : `<div class="table-wrapper">
          <table class="data-table">
            <thead><tr><th>Nome</th><th>Matrícula</th><th>Cidade/UF</th><th>CEP</th><th>Origem</th><th>Ações</th></tr></thead>
            <tbody id="dest-tbody">${renderDestRows(state.destinatarios)}</tbody>
          </table>
        </div>`}`;
}

function formEndereco(prefixo = '', dados = {}) {
  return `
    <div class="form-group">
      <label>Nome *</label>
      <input type="text" name="nome" value="${esc(dados.nome ?? '')}" required />
    </div>
    <div class="form-group">
      <label>CPF/CNPJ</label>
      <input type="text" name="cpf_cnpj" value="${esc(dados.cpf_cnpj ?? '')}" />
    </div>
    <div class="form-group">
      <label>CEP *</label>
      <input type="text" name="cep" value="${esc(dados.cep ?? '')}" maxlength="9" placeholder="00000-000" required id="input-cep-${prefixo}" />
      <button type="button" class="btn btn-sm btn-secondary" data-busca-cep="${prefixo}" style="margin-top:4px">Buscar CEP</button>
    </div>
    <div class="form-group">
      <label>Logradouro *</label>
      <input type="text" name="logradouro" value="${esc(dados.logradouro ?? '')}" required />
    </div>
    <div class="form-group">
      <label>Número *</label>
      <input type="text" name="numero" value="${esc(dados.numero ?? '')}" required />
    </div>
    <div class="form-group">
      <label>Complemento</label>
      <input type="text" name="complemento" value="${esc(dados.complemento ?? '')}" />
    </div>
    <div class="form-group">
      <label>Bairro *</label>
      <input type="text" name="bairro" value="${esc(dados.bairro ?? '')}" required />
    </div>
    <div class="form-group">
      <label>Cidade *</label>
      <input type="text" name="cidade" value="${esc(dados.cidade ?? '')}" required />
    </div>
    <div class="form-group">
      <label>UF *</label>
      <input type="text" name="uf" value="${esc(dados.uf ?? 'PR')}" maxlength="2" required />
    </div>
    <div class="form-group">
      <label>Telefone</label>
      <input type="text" name="telefone" value="${esc(dados.telefone ?? '')}" />
    </div>
    <div class="form-group">
      <label>Email</label>
      <input type="email" name="email" value="${esc(dados.email ?? '')}" />
    </div>`;
}

// ── Event binding ─────────────────────────────────────────────────────────────
function bindTabEvents() {
  const area = $root?.querySelector('#envios-tab-content');
  if (!area) return;

  // Formato envelope → bloqueia campo altura
  const selFormato = area.querySelector('#sel-formato');
  const inpAltura = area.querySelector('#inp-altura');
  const grupoAltura = area.querySelector('#grupo-altura');
  function toggleAltura(val) {
    const isEnv = val === 'envelope';
    if (inpAltura) { inpAltura.disabled = isEnv; if (isEnv) inpAltura.value = '0'; }
    if (grupoAltura) grupoAltura.style.opacity = isEnv ? '0.38' : '1';
  }
  if (selFormato) { toggleAltura(selFormato.value); selFormato.addEventListener('change', () => toggleAltura(selFormato.value)); }

  // Refresh postagens
  area.querySelector('#btn-refresh-postagens')?.addEventListener('click', async () => {
    await loadAll(); renderTab();
  });

  // Enviar todos pendentes → vá para ETIQUETAR após sucesso
  area.querySelector('#btn-enviar-pendentes')?.addEventListener('click', async () => {
    const pending = state.postagens.filter(p => p.status === 'RASCUNHO');
    if (!pending.length) return;
    if (!confirm(`Enviar ${pending.length} postagem(ns) ao Correios agora?`)) return;
    const envBtn = area.querySelector('#btn-enviar-pendentes');
    if (envBtn) envBtn.disabled = true;
    let ok = 0, fail = 0;
    const erros = [];
    for (const p of pending) {
      setFeedback(`Enviando ${ok + fail + 1}/${pending.length}: ${p.destinatario?.nome ?? ''}...`);
      const result = await callFn('correios-prepostagem', { postagem_id: p.id });
      if (result.ok) ok++;
      else { fail++; erros.push(`${p.destinatario?.nome ?? p.id}: ${result.error ?? 'erro desconhecido'}`); }
    }
    await loadAll();
    if (ok > 0) {
      setFeedback(fail === 0 ? `${ok} postagem(ns) enviada(s)! Gere as etiquetas.` : `${ok} enviada(s), ${fail} com erro.`, fail > 0);
      state.tab = 'etiquetar';
      $root?.querySelectorAll('[data-tab-main]').forEach(b => b.classList.toggle('active', b.dataset.tabMain === state.tab));
    } else {
      setFeedback(`Falha ao enviar — ${erros[0] ?? ''}`, true);
    }
    renderTab();
  });

  // Excluir todos ERROs (aba Postagens)
  area.querySelector('#btn-excluir-erros')?.addEventListener('click', async () => {
    const erros = state.postagens.filter(p => p.status === 'ERRO');
    if (!erros.length) return;
    if (!confirm(`Excluir ${erros.length} postagem(ns) com ERRO? Esta ação não pode ser desfeita.`)) return;
    const btn = area.querySelector('#btn-excluir-erros');
    if (btn) { btn.disabled = true; btn.textContent = 'Excluindo...'; }
    const { error } = await supabase.from('envios_postagens').delete().in('id', erros.map(p => p.id));
    if (error) { setFeedback('Erro ao excluir: ' + error.message, true); if (btn) btn.disabled = false; return; }
    setFeedback(`${erros.length} postagem(ns) com ERRO excluída(s).`);
    await loadAll(); renderTab();
  });

  // ── Aba ETIQUETAR ──────────────────────────────────────────────────────────
  area.querySelector('#btn-refresh-etiquetar')?.addEventListener('click', async () => {
    await loadAll(); renderTab();
  });

  async function gerarEtiquetas(ids) {
    if (!ids.length) return;
    try {
      const result = await callFn('correios-etiqueta', { postagem_ids: ids });
      if (result.ok && result.pdf_base64) {
        printPdf(result.pdf_base64);
        await supabase.from('envios_postagens').update({ status: 'POSTADO' }).in('id', ids);
        await loadAll();
        if (state.tab === 'etiquetar') renderTab();
        else {
          state.tab = 'enviados';
          $root?.querySelectorAll('[data-tab-main]').forEach(b => b.classList.toggle('active', b.dataset.tabMain === 'enviados'));
          renderTab();
          startRastreioAuto();
        }
      } else {
        setFeedback('Erro ao gerar etiqueta: ' + (result.error ?? 'desconhecido'), true);
      }
    } catch (e) { setFeedback('Erro: ' + e.message, true); }
  }

  area.querySelectorAll('[data-etiqueta-etiquetar]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.etiquetaEtiquetar;
      const orig = btn.textContent;
      btn.disabled = true; btn.textContent = 'Gerando...';
      await gerarEtiquetas([id]);
      btn.disabled = false; btn.textContent = orig;
    });
  });

  area.querySelector('#btn-etiqueta-lote-etiquetar')?.addEventListener('click', async () => {
    const ids = state.postagens.filter(p => p.status === 'CONFIRMADO' && p.id_prepostagem).map(p => p.id);
    const btn = area.querySelector('#btn-etiqueta-lote-etiquetar');
    if (btn) { btn.disabled = true; btn.textContent = 'Gerando...'; }
    await gerarEtiquetas(ids);
    if (btn) { btn.disabled = false; btn.textContent = `Gerar todas (${ids.length}) em lote`; }
  });

  // ── Aba ENVIADOS ───────────────────────────────────────────────────────────
  area.querySelector('#btn-refresh-enviados')?.addEventListener('click', async () => {
    await loadAll(); renderTab();
  });

  // Retentar postagem com ERRO
  area.querySelectorAll('[data-retentar]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Reenviar esta postagem ao Correios?')) return;
      const id = btn.dataset.retentar;
      btn.disabled = true;
      btn.textContent = 'Enviando...';
      await supabase.from('envios_postagens').update({ status: 'RASCUNHO', observacoes: null }).eq('id', id);
      const result = await callFn('correios-prepostagem', { postagem_id: id });
      if (result.ok) {
        setFeedback(`Enviado! Rastreio: ${result.numero_objeto}`);
      } else {
        setFeedback('Erro: ' + result.error, true);
        await supabase.from('envios_postagens').update({ status: 'ERRO', observacoes: result.error }).eq('id', id);
      }
      await loadAll();
      renderTab();
    });
  });

  // Excluir postagem com ERRO
  area.querySelectorAll('[data-excluir-enviado]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Excluir esta postagem? Esta ação não pode ser desfeita.')) return;
      const id = btn.dataset.excluirEnviado;
      btn.disabled = true;
      const { error } = await supabase.from('envios_postagens').delete().eq('id', id);
      if (error) { setFeedback('Erro ao excluir: ' + error.message, true); return; }
      await loadAll(); renderTab();
    });
  });

  // Gerar etiqueta PDF (individual)
  area.querySelectorAll('[data-etiqueta]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.etiqueta;
      const orig = btn.textContent;
      btn.disabled = true;
      btn.textContent = 'Gerando...';
      try {
        const result = await callFn('correios-etiqueta', { postagem_ids: [id] });
        if (result.ok && result.pdf_base64) {
          printPdf(result.pdf_base64);
        } else {
          setFeedback('Erro ao gerar etiqueta: ' + (result.error ?? 'desconhecido'), true);
        }
      } catch (e) { setFeedback('Erro: ' + e.message, true); }
      btn.disabled = false;
      btn.textContent = orig;
    });
  });

  // DACE (Declaração Auxiliar de Conteúdo Eletrônica) — DCe emitida automaticamente
  // pelos Correios na criação da pré-postagem (emiteDCe:"S")
  area.querySelectorAll('[data-declaracao]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.declaracao;
      const orig = btn.textContent;
      btn.disabled = true; btn.textContent = 'Gerando...';
      const result = await callFn('correios-declaracao', { postagem_ids: [id] });
      if (result.ok && result.pdf_base64) printPdf(result.pdf_base64);
      else setFeedback('Erro ao gerar declaração: ' + (result.error ?? 'desconhecido'), true);
      btn.disabled = false; btn.textContent = orig;
    });
  });

  // Rastrear
  area.querySelectorAll('[data-rastrear]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.rastrear;
      const obj = btn.dataset.objeto;
      btn.disabled = true;
      setFeedback('Consultando rastreamento...');
      const result = await callFn('correios-rastrear', { postagem_id: id, numeros: [obj] });
      btn.disabled = false;
      const div = area.querySelector('#rastreio-resultado');
      if (!result.ok) { setFeedback('Erro no rastreamento: ' + result.error, true); return; }
      setFeedback('');
      const objData = result.objetos?.[0] ?? {};
      const evts = objData.eventos ?? [];
      if (!evts.length) { if (div) div.innerHTML = '<p>Nenhum evento de rastreamento encontrado.</p>'; return; }
      const html = `<div class="form-section"><h4>Rastreamento — ${esc(obj)}</h4><ul class="timeline">` +
        evts.map(e => `<li><strong>${e.dtHrCriado ? new Date(e.dtHrCriado).toLocaleString('pt-BR') : ''}</strong> — ${esc(e.descricao ?? e.tipo ?? '')} <em>${esc([e.unidade?.nome, e.unidade?.endereco?.cidade].filter(Boolean).join(' / '))}</em></li>`).join('') +
        '</ul></div>';
      if (div) div.innerHTML = html;
    });
  });

  // Refresh histórico
  area.querySelector('#btn-refresh-historico')?.addEventListener('click', async () => {
    await loadAll(); renderTab();
  });

  // ── Aba REVERSA ────────────────────────────────────────────────────────────
  area.querySelector('#btn-refresh-reversa')?.addEventListener('click', async () => {
    await loadAll(); renderTab();
  });

  // Criar nova etiqueta reversa
  area.querySelector('#form-nova-reversa')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const clienteId = fd.get('cliente_id');
    if (!clienteId) { setFeedback('Selecione o cliente que devolve.', true); return; }
    const cod = fd.get('servico_codigo');
    const row = {
      cliente_id: clienteId,
      empresa_id: fd.get('empresa_id'),
      servico_codigo: cod,
      servico_nome: SERVICOS_REVERSA[cod] ?? cod,
      peso_gramas: parseInt(fd.get('peso_gramas')) || 300,
      conteudo: fd.get('conteudo') || null,
      status: 'RASCUNHO',
    };
    const btnSub = e.target.querySelector('[type=submit]');
    if (btnSub) { btnSub.disabled = true; btnSub.textContent = 'Criando...'; }
    const { data: created, error: insErr } = await supabase.from('envios_reversa').insert(row).select().single();
    if (insErr) { setFeedback('Erro ao salvar: ' + insErr.message, true); if (btnSub) { btnSub.disabled = false; btnSub.textContent = 'Criar Etiqueta Reversa'; } return; }
    setFeedback('Gerando pré-postagem...');
    const result = await callFn('correios-logistica-reversa', { reversa_id: created.id });
    if (result.ok) {
      setFeedback(`Pré-postagem criada! Rastreio: ${result.numero_objeto ?? '—'}. Agora gere a etiqueta.`);
      e.target.reset();
      const inp = area.querySelector('#search-dest-rev');
      const hid = area.querySelector('#hidden-dest-rev-id');
      if (inp) inp.value = '';
      if (hid) hid.value = '';
    } else if (result.portal_required) {
      setFeedback('API SMT indisponível. Consulte o portal Correios.', true);
    } else {
      setFeedback('Erro: ' + (result.error ?? 'desconhecido'), true);
    }
    if (btnSub) { btnSub.disabled = false; btnSub.textContent = 'Criar Etiqueta Reversa'; }
    await loadAll(); renderTab();
  });

  // Gerar etiqueta reversa
  area.querySelectorAll('[data-rev-etiqueta]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.revEtiqueta;
      const orig = btn.textContent;
      btn.disabled = true; btn.textContent = 'Gerando...';
      const result = await callFn('correios-etiqueta-reversa', { reversa_id: id });
      if (result.ok && result.pdf_base64) {
        printPdf(result.pdf_base64);
        await loadAll(); renderTab();
      } else if (result.retry) {
        setFeedback(result.error, true);
      } else {
        setFeedback('Erro: ' + (result.error ?? 'desconhecido'), true);
      }
      btn.disabled = false; btn.textContent = orig;
    });
  });

  // Retentar reversa
  area.querySelectorAll('[data-rev-retentar]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Retentar envio ao Correios?')) return;
      const id = btn.dataset.revRetentar;
      btn.disabled = true; btn.textContent = 'Enviando...';
      await supabase.from('envios_reversa').update({ status: 'RASCUNHO', observacoes: null }).eq('id', id);
      const result = await callFn('correios-logistica-reversa', { reversa_id: id });
      if (result.ok) setFeedback('Enviado! Rastreio: ' + (result.numero_objeto ?? '—'));
      else setFeedback('Erro: ' + result.error, true);
      await loadAll(); renderTab();
    });
  });

  // Excluir reversa
  area.querySelectorAll('[data-rev-excluir]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Excluir esta etiqueta reversa?')) return;
      const { error } = await supabase.from('envios_reversa').delete().eq('id', btn.dataset.revExcluir);
      if (error) { setFeedback('Erro: ' + error.message, true); return; }
      await loadAll(); renderTab();
    });
  });

  // Autocomplete cliente reversa
  const _revInp    = area.querySelector('#search-dest-rev');
  const _revDrop   = area.querySelector('#dest-ac-drop-rev');
  const _revHidden = area.querySelector('#hidden-dest-rev-id');
  if (_revInp && _revDrop) {
    function _revShow(matches) {
      if (!matches.length) { _revDrop.classList.remove('open'); return; }
      _revDrop.innerHTML = matches.slice(0, 25).map(d =>
        `<li class="dest-ac-item" data-id="${esc(d.id)}" data-nome="${esc(d.nome)}"><span>${esc(d.nome)}</span><small>${d.cidade ? `${esc(d.cidade)}/${esc(d.uf)}` : ''}</small></li>`
      ).join('');
      _revDrop.classList.add('open');
    }
    _revInp.addEventListener('input', () => {
      const q = _revInp.value.toLowerCase().trim();
      if (_revHidden) _revHidden.value = '';
      _revShow(q ? state.destinatarios.filter(d => d.nome.toLowerCase().includes(q)) : []);
    });
    _revInp.addEventListener('focus', () => {
      const q = _revInp.value.toLowerCase().trim();
      if (q) _revShow(state.destinatarios.filter(d => d.nome.toLowerCase().includes(q)));
    });
    _revDrop.addEventListener('mousedown', e => {
      const item = e.target.closest('.dest-ac-item');
      if (!item) return;
      e.preventDefault();
      _revInp.value = item.dataset.nome;
      if (_revHidden) _revHidden.value = item.dataset.id;
      _revDrop.classList.remove('open');
    });
    _revInp.addEventListener('blur', () => _revDrop.classList.remove('open'));
  }

  // Excluir postagem
  area.querySelectorAll('[data-excluir-postagem]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Excluir este rascunho?')) return;
      const { error } = await supabase.from('envios_postagens').delete().eq('id', btn.dataset.excluirPostagem);
      if (error) { setFeedback('Erro ao excluir: ' + error.message, true); return; }
      await loadAll(); renderTab();
    });
  });

  // Nova postagem form submit
  area.querySelector('#form-nova-postagem')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    if (!fd.get('destinatario_id')) { setFeedback('Selecione um destinatário.', true); return; }
    const row = {
      remetente_id: fd.get('remetente_id'),
      destinatario_id: fd.get('destinatario_id'),
      servico_codigo: fd.get('servico_codigo'),
      servico_nome: SERVICOS[fd.get('servico_codigo')] ?? fd.get('servico_codigo'),
      peso_gramas: parseInt(fd.get('peso_gramas')),
      formato: fd.get('formato'),
      altura_cm: parseFloat(fd.get('altura_cm')) || 0,
      largura_cm: parseFloat(fd.get('largura_cm')) || 0,
      comprimento_cm: parseFloat(fd.get('comprimento_cm')) || 0,
      valor_declarado: parseFloat(fd.get('valor_declarado')) || 0,
      conteudo: fd.get('conteudo') || null,
      observacoes: fd.get('observacoes') || null,
      ar_digital: true,
      status: 'RASCUNHO',
    };
    const { error } = await supabase.from('envios_postagens').insert(row);
    if (error) { setFeedback('Erro ao salvar: ' + error.message, true); return; }
    setFeedback('Postagem adicionada à fila.');
    e.target.reset();
    const hiddenDest = area.querySelector('#hidden-dest-post-id');
    const searchDest = area.querySelector('#search-dest-post');
    if (hiddenDest) hiddenDest.value = '';
    if (searchDest) searchDest.value = '';
    await loadAll();
    renderTab();
  });

  // Autocomplete destinatário na nova postagem
  const _postAcInp = area.querySelector('#search-dest-post');
  const _postAcDrop = area.querySelector('#dest-ac-drop-post');
  const _postAcHidden = area.querySelector('#hidden-dest-post-id');
  function _postAcShow(matches) {
    if (!_postAcDrop) return;
    if (!matches.length) { _postAcDrop.classList.remove('open'); return; }
    _postAcDrop.innerHTML = matches.slice(0, 25).map(d =>
      `<li class="dest-ac-item" data-id="${esc(d.id)}" data-nome="${esc(d.nome)}"><span>${esc(d.nome)}</span><small>${d.cidade ? `${esc(d.cidade)}/${esc(d.uf)}` : ''}${d.cep && d.cep !== '00000-000' ? ` — ${esc(d.cep)}` : ''}</small></li>`
    ).join('');
    _postAcDrop.classList.add('open');
  }
  _postAcInp?.addEventListener('input', () => {
    const q = _postAcInp.value.toLowerCase().trim();
    if (_postAcHidden) _postAcHidden.value = '';
    _postAcShow(q ? state.destinatarios.filter(d => d.nome.toLowerCase().includes(q)) : []);
  });
  _postAcInp?.addEventListener('focus', () => {
    const q = _postAcInp.value.toLowerCase().trim();
    if (q) _postAcShow(state.destinatarios.filter(d => d.nome.toLowerCase().includes(q)));
  });
  _postAcDrop?.addEventListener('mousedown', e => {
    const item = e.target.closest('.dest-ac-item');
    if (!item) return;
    e.preventDefault();
    if (_postAcInp) _postAcInp.value = item.dataset.nome;
    if (_postAcHidden) _postAcHidden.value = item.dataset.id;
    _postAcDrop.classList.remove('open');
  });
  _postAcInp?.addEventListener('blur', () => _postAcDrop?.classList.remove('open'));

  // Prefill vindo de Compras ("Enviar via Estoque" → Correios): consome a chave
  // uma única vez, senão o campo seria repreenchido toda vez que o usuário
  // voltar pra aba Postagens.
  if (state.tab === 'postagens' && _postAcInp) {
    let nomePrefill = null;
    try { nomePrefill = sessionStorage.getItem('cmpEnviosPrefillNome'); } catch {}
    if (nomePrefill) {
      try { sessionStorage.removeItem('cmpEnviosPrefillNome'); } catch {}
      _postAcInp.value = nomePrefill;
      _postAcInp.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }

  // Autocomplete destinatário na cotação
  const _acInp = area.querySelector('#search-dest-cotacao');
  const _acDrop = area.querySelector('#dest-ac-drop');
  const _acDests = state.destinatarios.filter(d => d.cep && d.cep !== '00000-000');
  function _acShow(matches) {
    if (!_acDrop) return;
    if (!matches.length) { _acDrop.classList.remove('open'); return; }
    _acDrop.innerHTML = matches.slice(0, 25).map(d =>
      `<li class="dest-ac-item" data-cep="${esc(d.cep)}" data-nome="${esc(d.nome)}"><span>${esc(d.nome)}</span><small>${d.cidade ? `${esc(d.cidade)}/${esc(d.uf)} — ` : ''}${esc(d.cep)}</small></li>`
    ).join('');
    _acDrop.classList.add('open');
  }
  _acInp?.addEventListener('input', () => {
    const q = _acInp.value.toLowerCase().trim();
    _acShow(q ? _acDests.filter(d => d.nome.toLowerCase().includes(q)) : []);
  });
  _acInp?.addEventListener('focus', () => {
    const q = _acInp.value.toLowerCase().trim();
    if (q) _acShow(_acDests.filter(d => d.nome.toLowerCase().includes(q)));
  });
  _acDrop?.addEventListener('mousedown', e => {
    const item = e.target.closest('.dest-ac-item');
    if (!item) return;
    e.preventDefault();
    if (_acInp) _acInp.value = item.dataset.nome;
    const cepInp = area.querySelector('[name=cep_destino]');
    if (cepInp) cepInp.value = item.dataset.cep;
    _acDrop.classList.remove('open');
  });
  _acInp?.addEventListener('blur', () => _acDrop?.classList.remove('open'));

  // Cotação form
  area.querySelector('#form-cotacao')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const btn = e.target.querySelector('[type=submit]');
    btn.disabled = true;
    btn.textContent = 'Calculando...';
    const result = await callFn('correios-cotacao', {
      cep_origem: fd.get('cep_origem'),
      cep_destino: fd.get('cep_destino'),
      peso: parseInt(fd.get('peso')),
      formato: fd.get('formato'),
      altura: parseFloat(fd.get('altura')) || 0,
      largura: parseFloat(fd.get('largura')) || 0,
      comprimento: parseFloat(fd.get('comprimento')) || 0,
      valor_declarado: parseFloat(fd.get('valor_declarado')) || 0,
    });
    btn.disabled = false;
    btn.textContent = 'Calcular Frete';
    const div = area.querySelector('#cotacao-resultado');
    if (!result.ok || !div) { setFeedback('Erro na cotação: ' + (result.error ?? 'desconhecido'), true); return; }
    div.innerHTML = `<div class="table-wrapper"><table class="data-table">
      <thead><tr><th>Serviço</th><th>Preço</th><th>Prazo</th></tr></thead>
      <tbody>${(result.cotacoes ?? []).map(c => `
        <tr>
          <td>${esc(c.nome)}</td>
          <td>${c.preco != null ? MONEY.format(c.preco) : (c.ok ? '-' : '<span class="badge badge-danger">Indisponível</span>')}</td>
          <td>${c.prazo_dias != null ? `${c.prazo_dias} dia(s)` : '-'}</td>
        </tr>`).join('')}
      </tbody></table></div>`;
    setFeedback('');
  });

  // Busca CEP
  area.querySelectorAll('[data-busca-cep]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const pref = btn.dataset.buscaCep;
      const cepInput = area.querySelector(`#input-cep-${pref}`);
      if (!cepInput) return;
      const cep = cepInput.value.replace(/\D/g, '');
      if (cep.length !== 8) { setFeedback('CEP inválido', true); return; }
      btn.disabled = true;
      try {
        const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
        const d = await res.json();
        if (d.erro) { setFeedback('CEP não encontrado', true); return; }
        const form = btn.closest('form');
        if (!form) return;
        form.querySelector('[name=logradouro]').value = d.logradouro ?? '';
        form.querySelector('[name=bairro]').value = d.bairro ?? '';
        form.querySelector('[name=cidade]').value = d.localidade ?? '';
        form.querySelector('[name=uf]').value = d.uf ?? '';
        setFeedback('Endereço preenchido pelo CEP.');
      } catch { setFeedback('Erro ao buscar CEP', true); }
      btn.disabled = false;
    });
  });

  // Novo remetente
  area.querySelector('#btn-novo-remetente')?.addEventListener('click', () => {
    const wrap = area.querySelector('#form-remetente-wrap');
    if (!wrap || wrap.innerHTML.includes('form-remetente')) return;
    wrap.innerHTML = `<div class="form-section"><h4>Novo Remetente</h4>
      <form id="form-remetente" class="form-grid">
        ${formEndereco('rem')}
        <div class="form-group full-width">
          <label><input type="checkbox" name="padrao" value="1" /> Definir como remetente padrão</label>
        </div>
        <div class="form-actions full-width">
          <button type="submit" class="btn btn-primary">Salvar</button>
          <button type="button" class="btn btn-secondary" id="btn-cancel-rem">Cancelar</button>
        </div>
      </form></div>`;
    bindFormRemetente(area);
  });

  // Novo destinatário
  area.querySelector('#btn-novo-dest')?.addEventListener('click', () => {
    const wrap = area.querySelector('#form-dest-wrap');
    if (!wrap || wrap.innerHTML.includes('form-dest')) return;
    wrap.innerHTML = `<div class="form-section"><h4>Novo Destinatário</h4>
      <form id="form-dest" class="form-grid">
        ${formEndereco('dest')}
        <div class="form-group">
          <label>Matrícula</label>
          <input type="text" name="matricula" />
        </div>
        <div class="form-actions full-width">
          <button type="submit" class="btn btn-primary">Salvar</button>
          <button type="button" class="btn btn-secondary" id="btn-cancel-dest">Cancelar</button>
        </div>
      </form></div>`;
    bindFormDestinatario(area);
  });

  // Importar colaboradores
  area.querySelector('#btn-importar-colabs')?.addEventListener('click', importarDestinatariosColaboradores);
  area.querySelector('#btn-importar-planilha')?.addEventListener('click', () => area.querySelector('#input-planilha-dest')?.click());
  area.querySelector('#input-planilha-dest')?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (file) await importarDestinatariosPlanilha(file);
    e.target.value = '';
  });

  // Remetente: excluir / padrão
  area.querySelectorAll('[data-rem-excluir]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Excluir remetente?')) return;
      await supabase.from('envios_remetentes').update({ ativo: false }).eq('id', btn.dataset.remExcluir);
      await loadAll(); renderTab();
    });
  });
  area.querySelectorAll('[data-rem-padrao]').forEach(btn => {
    btn.addEventListener('click', async () => {
      await supabase.from('envios_remetentes').update({ padrao: false }).neq('id', btn.dataset.remPadrao);
      await supabase.from('envios_remetentes').update({ padrao: true }).eq('id', btn.dataset.remPadrao);
      await loadAll(); renderTab();
    });
  });

  // Destinatário: excluir
  area.querySelectorAll('[data-dest-excluir]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Excluir destinatário?')) return;
      await supabase.from('envios_destinatarios').update({ ativo: false }).eq('id', btn.dataset.destExcluir);
      await loadAll(); renderTab();
    });
  });

  // Destinatário: pesquisa
  area.querySelector('#dest-search')?.addEventListener('input', e => {
    const q = e.target.value.trim().toLowerCase();
    const lista = q
      ? state.destinatarios.filter(d =>
          d.nome.toLowerCase().includes(q) ||
          (d.matricula ?? '').toLowerCase().includes(q) ||
          (d.cidade ?? '').toLowerCase().includes(q))
      : state.destinatarios;
    const tbody = area.querySelector('#dest-tbody');
    if (tbody) tbody.innerHTML = renderDestRows(lista);
    bindTabEvents();
  });

  // Destinatário: editar
  area.querySelectorAll('[data-dest-editar]').forEach(btn => {
    btn.addEventListener('click', () => {
      const d = state.destinatarios.find(x => x.id === btn.dataset.destEditar);
      if (!d) return;
      const wrap = area.querySelector('#form-dest-wrap');
      if (!wrap) return;
      wrap.innerHTML = `<div class="form-section"><h4 style="margin:0 0 16px;font-size:1rem;font-weight:800">Editar Destinatário</h4>
        <form id="form-dest" class="form-grid" data-edit-id="${d.id}">
          ${formEndereco('dest', d)}
          <div class="form-group">
            <label>Matrícula</label>
            <input type="text" name="matricula" value="${esc(d.matricula ?? '')}" />
          </div>
          <div class="form-actions full-width">
            <button type="submit" class="btn btn-primary">Salvar</button>
            <button type="button" class="btn btn-secondary" id="btn-cancel-dest">Cancelar</button>
          </div>
        </form></div>`;
      wrap.scrollIntoView({ behavior: 'smooth', block: 'start' });
      bindFormDestinatario(area);
    });
  });
}

function bindFormRemetente(area) {
  area.querySelector('#btn-cancel-rem')?.addEventListener('click', () => {
    area.querySelector('#form-remetente-wrap').innerHTML = '';
  });
  area.querySelector('#form-remetente')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const row = {
      nome: fd.get('nome'), cpf_cnpj: fd.get('cpf_cnpj') || null,
      cep: fd.get('cep'), logradouro: fd.get('logradouro'), numero: fd.get('numero'),
      complemento: fd.get('complemento') || null, bairro: fd.get('bairro'),
      cidade: fd.get('cidade'), uf: fd.get('uf').toUpperCase(),
      telefone: fd.get('telefone') || null, email: fd.get('email') || null,
      padrao: fd.get('padrao') === '1',
    };
    if (row.padrao) await supabase.from('envios_remetentes').update({ padrao: false }).neq('id', '00000000-0000-0000-0000-000000000000');
    const { error } = await supabase.from('envios_remetentes').insert(row);
    if (error) { setFeedback('Erro: ' + error.message, true); return; }
    setFeedback('Remetente cadastrado.');
    await loadAll(); renderTab();
  });
  // Busca CEP dentro do form recém-inserido
  area.querySelectorAll('[data-busca-cep]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const pref = btn.dataset.buscaCep;
      const cepInput = area.querySelector(`#input-cep-${pref}`);
      if (!cepInput) return;
      const cep = cepInput.value.replace(/\D/g, '');
      if (cep.length !== 8) { setFeedback('CEP inválido', true); return; }
      btn.disabled = true;
      try {
        const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
        const d = await res.json();
        if (d.erro) { setFeedback('CEP não encontrado', true); return; }
        const form = btn.closest('form');
        if (form) {
          form.querySelector('[name=logradouro]').value = d.logradouro ?? '';
          form.querySelector('[name=bairro]').value = d.bairro ?? '';
          form.querySelector('[name=cidade]').value = d.localidade ?? '';
          form.querySelector('[name=uf]').value = d.uf ?? '';
        }
        setFeedback('Endereço preenchido.');
      } catch { setFeedback('Erro ao buscar CEP', true); }
      btn.disabled = false;
    });
  });
}

function bindFormDestinatario(area) {
  area.querySelector('#btn-cancel-dest')?.addEventListener('click', () => {
    area.querySelector('#form-dest-wrap').innerHTML = '';
  });
  area.querySelector('#form-dest')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const row = {
      nome: fd.get('nome'), cpf_cnpj: fd.get('cpf_cnpj') || null,
      cep: fd.get('cep'), logradouro: fd.get('logradouro'), numero: fd.get('numero'),
      complemento: fd.get('complemento') || null, bairro: fd.get('bairro'),
      cidade: fd.get('cidade'), uf: fd.get('uf').toUpperCase(),
      telefone: fd.get('telefone') || null, email: fd.get('email') || null,
      matricula: fd.get('matricula') || null,
      origem: 'manual',
    };
    const editId = e.target.dataset.editId;
    if (editId) {
      const { error } = await supabase.from('envios_destinatarios').update(row).eq('id', editId);
      if (error) { setFeedback('Erro: ' + error.message, true); return; }
      setFeedback('Destinatário atualizado.');
    } else {
      const { error } = await supabase.from('envios_destinatarios').insert(row);
      if (error) { setFeedback('Erro: ' + error.message, true); return; }
      setFeedback('Destinatário cadastrado.');
    }
    await loadAll(); renderTab();
  });
  area.querySelectorAll('[data-busca-cep]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const pref = btn.dataset.buscaCep;
      const cepInput = area.querySelector(`#input-cep-${pref}`);
      if (!cepInput) return;
      const cep = cepInput.value.replace(/\D/g, '');
      if (cep.length !== 8) return;
      btn.disabled = true;
      try {
        const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
        const d = await res.json();
        if (!d.erro) {
          const form = btn.closest('form');
          if (form) {
            form.querySelector('[name=logradouro]').value = d.logradouro ?? '';
            form.querySelector('[name=bairro]').value = d.bairro ?? '';
            form.querySelector('[name=cidade]').value = d.localidade ?? '';
            form.querySelector('[name=uf]').value = d.uf ?? '';
          }
        }
      } catch {}
      btn.disabled = false;
    });
  });
}

// ── Main ──────────────────────────────────────────────────────────────────────
export async function renderContent(content) {
  $root = content;
  content.innerHTML = `
    <style>
      .envios-tabs{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:16px}
      .envios-tab{border:1px solid rgba(111,208,165,.22);background:#15152a;color:#e2e2f0;border-radius:999px;padding:10px 18px;font-weight:800;cursor:pointer;font-size:.85rem;transition:background .15s,border-color .15s}
      .envios-tab:hover{background:rgba(111,208,165,.08);border-color:rgba(111,208,165,.35)}
      .envios-tab.active{background:rgba(34,197,94,.22);border-color:rgba(111,208,165,.45);color:#dcfce7}
      .form-section{background:rgba(4,13,9,.42);border:1px solid rgba(45,212,160,.10);border-radius:18px;padding:24px 28px;margin-bottom:16px}
      .form-section h3{margin:0 0 20px;font-size:1.05rem;font-weight:800;color:var(--text);letter-spacing:.01em}
      .form-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px 22px}
      .form-group{display:flex;flex-direction:column;gap:6px}
      .form-group.full-width{grid-column:span 2}
      .form-group label{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:rgba(200,230,210,.50)}
      .form-group input,.form-group select,.form-group textarea{padding:11px 14px;border:1px solid rgba(45,212,160,.12);border-radius:14px;background:rgba(8,22,17,.58);color:var(--text);outline:none;font:inherit;font-size:.92rem;color-scheme:dark;transition:border-color .15s,box-shadow .15s;width:100%;box-sizing:border-box}
      .form-group input:focus,.form-group select:focus,.form-group textarea:focus{border-color:rgba(45,212,160,.30);box-shadow:0 0 0 3px rgba(45,212,160,.08);background:rgba(5,17,11,.72)}
      .form-group input::placeholder{color:rgba(200,230,210,.30)}
      .form-group select option{background:#0d1a12;color:var(--text)}
      .form-actions{display:flex;gap:10px;align-items:center;grid-column:span 2;padding-top:6px}
      .dest-ac-wrap{position:relative}
      .dest-ac-wrap input{width:100%;box-sizing:border-box}
      .dest-ac-drop{display:none;position:absolute;top:calc(100% + 4px);left:0;right:0;z-index:300;list-style:none;margin:0;padding:4px 0;border:1px solid rgba(45,212,160,.22);border-radius:13px;background:#0b1a11;box-shadow:0 8px 32px rgba(0,0,0,.55);max-height:240px;overflow-y:auto}
      .dest-ac-drop.open{display:block}
      .dest-ac-item{padding:9px 14px;cursor:pointer;display:flex;flex-direction:column;gap:2px;border-bottom:1px solid rgba(45,212,160,.06);list-style:none}
      .dest-ac-item:last-child{border-bottom:none}
      .dest-ac-item:hover{background:rgba(45,212,160,.10)}
      .dest-ac-item span{font-size:13px;color:var(--text);font-weight:600}
      .dest-ac-item small{font-size:11px;color:rgba(180,220,195,.50)}
      .td-actions{white-space:nowrap;display:flex;gap:4px;align-items:center;flex-wrap:nowrap}
      .envios-row-list{display:flex;flex-direction:column;gap:6px}
      .envios-row-header{display:grid;grid-template-columns:110px 1fr 170px 120px minmax(200px,auto);gap:8px 14px;padding:0 18px 6px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:rgba(180,220,195,.28)}
      .envios-row{display:grid;grid-template-columns:110px 1fr 170px 120px minmax(200px,auto);gap:8px 14px;align-items:center;background:rgba(4,13,9,.42);border:1px solid rgba(45,212,160,.09);border-radius:12px;padding:12px 18px;transition:border-color .15s,background .15s}
      .envios-row:hover{border-color:rgba(45,212,160,.20);background:rgba(4,13,9,.58)}
      .envios-row-devolvido{border-color:rgba(239,68,68,.14)}
      .envios-row-devolvido:hover{border-color:rgba(239,68,68,.28)}
      .envios-col-data,.envios-col-prev{display:flex;flex-direction:column;gap:3px}
      .envios-col-prev-actions{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px}
      .envios-data-main{font-size:.82rem;color:rgba(200,230,210,.78);font-variant-numeric:tabular-nums;line-height:1.3}
      .envios-data-sub{font-size:.70rem;color:rgba(180,220,195,.35)}
      .envios-nome{font-size:.92rem;font-weight:700;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .envios-sub{font-size:.73rem;color:rgba(180,220,195,.44);margin-top:2px;line-height:1.35}
      .envios-rastreio-code{font-family:ui-monospace,'Cascadia Code',Consolas,monospace;font-size:.75rem;letter-spacing:.07em;color:rgba(45,212,160,.84);background:rgba(45,212,160,.07);border:1px solid rgba(45,212,160,.13);padding:3px 8px;border-radius:6px;display:inline-block;white-space:nowrap}
      @media(max-width:960px){.envios-row,.envios-row-header{grid-template-columns:100px 1fr 150px 110px minmax(170px,auto)}}
      @media(max-width:720px){.form-grid{grid-template-columns:1fr}.form-group.full-width,.form-actions{grid-column:span 1}.envios-row,.envios-row-header{grid-template-columns:1fr 1fr}.envios-col-rastreio{grid-column:span 2}.envios-col-data{order:-1}.envios-col-prev{grid-column:span 2}}
    </style>
    <div id="envios-feedback" class="feedback-bar" style="display:none"></div>
    <nav class="envios-tabs">
      <button class="envios-tab${state.tab === 'postagens' ? ' active' : ''}" data-tab-main="postagens">Postagens</button>
      <button class="envios-tab${state.tab === 'etiquetar' ? ' active' : ''}" data-tab-main="etiquetar">Etiquetar</button>
      <button class="envios-tab${state.tab === 'enviados' ? ' active' : ''}" data-tab-main="enviados">Enviados</button>
      <button class="envios-tab${state.tab === 'historico' ? ' active' : ''}" data-tab-main="historico">Histórico</button>
      <button class="envios-tab${state.tab === 'cotacao' ? ' active' : ''}" data-tab-main="cotacao">Cotação</button>
      <button class="envios-tab${state.tab === 'reversa' ? ' active' : ''}" data-tab-main="reversa">Log. Reversa</button>
      <button class="envios-tab${state.tab === 'remetentes' ? ' active' : ''}" data-tab-main="remetentes">Remetentes</button>
      <button class="envios-tab${state.tab === 'destinatarios' ? ' active' : ''}" data-tab-main="destinatarios">Destinatários</button>
    </nav>
    <div id="envios-tab-content"><p>Carregando...</p></div>`;

  content.querySelectorAll('[data-tab-main]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (state.rastreioInterval) { clearInterval(state.rastreioInterval); state.rastreioInterval = null; }
      state.tab = btn.dataset.tabMain;
      content.querySelectorAll('[data-tab-main]').forEach(b => b.classList.toggle('active', b.dataset.tabMain === state.tab));
      renderTab();
      if (state.tab === 'enviados') startRastreioAuto();
    });
  });

  await loadAll();
  renderTab();
}

initProtectedPage('Correios', renderContent);
