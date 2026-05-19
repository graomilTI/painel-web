import { initProtectedPage } from './pageInit.js';
import { supabase, SUPABASE_URL } from './supabaseClient.js';

const SERVICOS = {
  '03220': 'PAC Contrato',
  '03298': 'SEDEX Contrato',
  '61124': 'Carta Registrada AR Digital',
  '65130': 'Telegrama',
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

// ── State ─────────────────────────────────────────────────────────────────────
const state = {
  tab: 'postagens',
  postagens: [],
  remetentes: [],
  destinatarios: [],
  loading: false,
  feedback: '',
  feedbackErr: false,
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
async function loadAll() {
  state.loading = true;
  const [{ data: posts }, { data: rems }, { data: dests }] = await Promise.all([
    supabase.from('envios_postagens')
      .select('*, remetente:envios_remetentes(nome, cidade, uf), destinatario:envios_destinatarios(nome, cidade, uf)')
      .order('created_at', { ascending: false })
      .limit(200),
    supabase.from('envios_remetentes').select('*').eq('ativo', true).order('nome'),
    supabase.from('envios_destinatarios').select('*').eq('ativo', true).order('nome'),
  ]);
  state.postagens = posts ?? [];
  state.remetentes = rems ?? [];
  state.destinatarios = dests ?? [];
  state.loading = false;
}

async function importarDestinatariosColaboradores() {
  setFeedback('Importando colaboradores...');
  const { data: colabs, error } = await supabase
    .from('operacional_colaborador_base')
    .select('nome, matricula, regional, email')
    .eq('ativo', true);
  if (error) { setFeedback('Erro ao buscar colaboradores: ' + error.message, true); return; }

  const existentes = new Set(state.destinatarios.filter(d => d.origem === 'colaborador').map(d => d.matricula));
  const novos = (colabs ?? []).filter(c => c.matricula && !existentes.has(c.matricula));

  if (!novos.length) { setFeedback('Nenhum colaborador novo para importar.'); return; }

  const rows = novos.map(c => ({
    nome: c.nome,
    matricula: c.matricula,
    email: c.email ?? null,
    logradouro: '-',
    numero: 'S/N',
    bairro: '-',
    cidade: c.regional ?? '-',
    uf: 'PR',
    cep: '00000-000',
    origem: 'colaborador',
    ativo: true,
  }));

  const { error: iErr } = await supabase.from('envios_destinatarios').insert(rows);
  if (iErr) { setFeedback('Erro ao importar: ' + iErr.message, true); return; }
  setFeedback(`${rows.length} destinatário(s) importado(s) dos colaboradores.`);
  await loadAll();
  renderTab();
}

// ── Render ────────────────────────────────────────────────────────────────────
function renderTab() {
  const area = $root?.querySelector('#envios-tab-content');
  if (!area) return;
  if (state.tab === 'postagens') area.innerHTML = renderPostagens();
  else if (state.tab === 'nova') area.innerHTML = renderNovaPostagem();
  else if (state.tab === 'cotacao') area.innerHTML = renderCotacao();
  else if (state.tab === 'remetentes') area.innerHTML = renderRemetentes();
  else if (state.tab === 'destinatarios') area.innerHTML = renderDestinatarios();
  bindTabEvents();
}

function renderPostagens() {
  const rows = state.postagens.map(p => `
    <tr>
      <td>${badge(p.status)}</td>
      <td>${esc(p.destinatario?.nome ?? '-')}</td>
      <td>${esc(SERVICOS[p.servico_codigo] ?? p.servico_nome)}</td>
      <td>${esc(p.numero_objeto ?? '-')}</td>
      <td>${p.valor_postagem ? MONEY.format(p.valor_postagem) : '-'}</td>
      <td>${p.confirmado_em ? new Date(p.confirmado_em).toLocaleString('pt-BR') : '-'}</td>
      <td class="td-actions">
        ${p.status === 'RASCUNHO' ? `<button class="btn btn-sm btn-primary" data-confirmar="${p.id}">Confirmar</button>` : ''}
        ${p.numero_objeto ? `<button class="btn btn-sm btn-secondary" data-rastrear="${p.id}" data-objeto="${esc(p.numero_objeto)}">Rastrear</button>` : ''}
        ${p.status === 'RASCUNHO' ? `<button class="btn btn-sm btn-danger" data-excluir-postagem="${p.id}">Excluir</button>` : ''}
      </td>
    </tr>`).join('');

  return `
    <div class="toolbar" style="margin-bottom:12px">
      <button class="btn btn-primary" data-tab="nova">+ Nova Postagem</button>
      <button class="btn btn-secondary" id="btn-refresh-postagens">Atualizar</button>
    </div>
    ${state.postagens.length === 0
      ? '<p class="empty-state">Nenhuma postagem cadastrada.</p>'
      : `<div class="table-wrapper">
          <table class="data-table">
            <thead><tr><th>Status</th><th>Destinatário</th><th>Serviço</th><th>Código de Rastreio</th><th>Valor</th><th>Confirmado em</th><th>Ações</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>`}
    <div id="rastreio-resultado" style="margin-top:16px"></div>`;
}

function renderNovaPostagem() {
  const optRem = state.remetentes.map(r => `<option value="${r.id}">${esc(r.nome)} — ${esc(r.cidade)}/${esc(r.uf)}</option>`).join('');
  const optDest = state.destinatarios.map(d => `<option value="${d.id}">${esc(d.nome)}${d.matricula ? ' (' + esc(d.matricula) + ')' : ''} — ${esc(d.cidade)}/${esc(d.uf)}</option>`).join('');
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
          <select name="destinatario_id" required>${optDest || '<option value="">— nenhum cadastrado —</option>'}</select>
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
          <button type="submit" class="btn btn-primary">Salvar como Rascunho</button>
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

function renderDestinatarios() {
  const rows = state.destinatarios.map(d => `
    <tr>
      <td>${esc(d.nome)}</td>
      <td>${d.matricula ? esc(d.matricula) : '-'}</td>
      <td>${esc(d.cidade)}/${esc(d.uf)}</td>
      <td>${esc(d.cep)}</td>
      <td><span class="badge badge-neutral">${esc(d.origem ?? 'manual')}</span></td>
      <td class="td-actions">
        <button class="btn btn-sm btn-danger" data-dest-excluir="${d.id}">Excluir</button>
      </td>
    </tr>`).join('');

  return `
    <div class="toolbar" style="margin-bottom:12px">
      <button class="btn btn-primary" id="btn-novo-dest">+ Novo Destinatário</button>
      <button class="btn btn-secondary" id="btn-importar-colabs">Importar de Colaboradores</button>
    </div>
    <div id="form-dest-wrap"></div>
    ${state.destinatarios.length === 0
      ? '<p class="empty-state">Nenhum destinatário cadastrado.</p>'
      : `<div class="table-wrapper">
          <table class="data-table">
            <thead><tr><th>Nome</th><th>Matrícula</th><th>Cidade/UF</th><th>CEP</th><th>Origem</th><th>Ações</th></tr></thead>
            <tbody>${rows}</tbody>
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

  // Tab switches via data-tab
  area.querySelectorAll('[data-tab]').forEach(el => {
    el.addEventListener('click', () => {
      state.tab = el.dataset.tab;
      renderTab();
    });
  });

  // Refresh
  area.querySelector('#btn-refresh-postagens')?.addEventListener('click', async () => {
    await loadAll();
    renderTab();
  });

  // Confirmar postagem
  area.querySelectorAll('[data-confirmar]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.confirmar;
      btn.disabled = true;
      setFeedback('Enviando pré-postagem ao Correios...');
      const result = await callFn('correios-prepostagem', { postagem_id: id });
      if (result.ok) {
        setFeedback(`Confirmado! Código de rastreio: ${result.numero_objeto}`);
        await loadAll();
        renderTab();
      } else {
        setFeedback('Erro ao confirmar: ' + result.error, true);
        btn.disabled = false;
      }
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
    setFeedback('Postagem salva como rascunho.');
    await loadAll();
    state.tab = 'postagens';
    renderTab();
  });

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
    const { error } = await supabase.from('envios_destinatarios').insert(row);
    if (error) { setFeedback('Erro: ' + error.message, true); return; }
    setFeedback('Destinatário cadastrado.');
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
initProtectedPage('Envios', async (content) => {
  $root = content;
  content.innerHTML = `
    <div id="envios-feedback" class="feedback-bar" style="display:none"></div>
    <nav class="tab-nav" style="margin-bottom:16px">
      <button class="tab-btn${state.tab === 'postagens' ? ' active' : ''}" data-tab-main="postagens">Postagens</button>
      <button class="tab-btn${state.tab === 'cotacao' ? ' active' : ''}" data-tab-main="cotacao">Cotação</button>
      <button class="tab-btn${state.tab === 'remetentes' ? ' active' : ''}" data-tab-main="remetentes">Remetentes</button>
      <button class="tab-btn${state.tab === 'destinatarios' ? ' active' : ''}" data-tab-main="destinatarios">Destinatários</button>
    </nav>
    <div id="envios-tab-content"><p>Carregando...</p></div>`;

  content.querySelectorAll('[data-tab-main]').forEach(btn => {
    btn.addEventListener('click', () => {
      state.tab = btn.dataset.tabMain;
      content.querySelectorAll('[data-tab-main]').forEach(b => b.classList.toggle('active', b.dataset.tabMain === state.tab));
      renderTab();
    });
  });

  await loadAll();
  renderTab();
});
