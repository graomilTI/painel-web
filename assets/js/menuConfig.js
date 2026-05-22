import { initProtectedPage } from './pageInit.js';
import { supabase, SUPABASE_URL } from './supabaseClient.js';

const SMT_PORTAL = 'https://apps.correios.com.br/smt';

const STATUS_LABEL = {
  RASCUNHO:        'Rascunho',
  ENVIADO:         'Enviado',
  PENDENTE_PORTAL: 'Pendente (Portal)',
  ERRO:            'Erro',
  AGENDADO:        'Agendado',
  CANCELADO:       'Cancelado',
};
const STATUS_CLASS = {
  RASCUNHO:        'neutral',
  ENVIADO:         'ok',
  PENDENTE_PORTAL: 'warn',
  ERRO:            'danger',
  AGENDADO:        'info',
  CANCELADO:       'neutral',
};

const MONEY = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

function esc(v) {
  return String(v ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function badge(status) {
  const cls = STATUS_CLASS[status] ?? 'neutral';
  return `<span class="badge badge-${cls}">${esc(STATUS_LABEL[status] ?? status)}</span>`;
}

const state = {
  tab: 'enviar',
  telegramas: [],
  remetentes: [],
  destinatarios: [],
  clinicas: [],
  clinicaSelecionada: null,
  rescisaoFields: {},
  modeloAtivo: 'manual',
  loading: false,
  feedback: '',
  feedbackErr: false,
};

let $root = null;

function setFeedback(msg, isErr = false) {
  state.feedback = msg;
  state.feedbackErr = isErr;
  const el = $root?.querySelector('#tel-feedback');
  if (!el) return;
  el.textContent = msg;
  el.className = 'feedback-bar' + (isErr ? ' feedback-err' : ' feedback-ok');
  el.style.display = msg ? 'block' : 'none';
}

function fmtDate(v) {
  if (!v) return '';
  const d = new Date(v + 'T12:00:00');
  if (isNaN(d)) return v;
  return d.toLocaleDateString('pt-BR');
}

function fmtDataPt(v) {
  if (!v) return '';
  const d = new Date(v + 'T12:00:00');
  if (isNaN(d)) return v;
  return d.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' });
}

function gerarTextoRescisao(f, clinica) {
  const sexoM    = (f.sexo || 'M') !== 'F';
  const portador = sexoM ? 'portador' : 'portadora';
  const prezado  = sexoM ? 'Sr' : 'Sra';
  const senhor   = sexoM ? 'senhor' : 'senhor(a)';
  const primeiroNome = (f.nome || '').trim().split(/\s+/)[0];

  const partsEnd = [
    f.dest_logradouro,
    f.dest_numero,
    f.dest_bairro  ? `Bairro: ${f.dest_bairro}`                                                    : null,
    f.dest_cidade && f.dest_uf ? `Cidade: ${f.dest_cidade}-${f.dest_uf}` : (f.dest_cidade || null),
    f.dest_cep     ? `CEP: ${f.dest_cep}`                                                          : null,
  ].filter(Boolean);
  const enderecoEmp = partsEnd.join(', ');

  const dtExame = f.data_exame ? fmtDate(f.data_exame) : '__/__/____';
  const hrExame = f.hora_exame ? (f.hora_exame.replace(/^0+/, '') || '0') : '____';
  const dtCtps  = f.data_ctps  ? fmtDate(f.data_ctps)  : '__/__/____';

  let clinicaBloco;
  if (clinica) {
    const loc = [clinica.endereco, clinica.cidade && clinica.estado ? `${clinica.cidade}/${clinica.estado}` : (clinica.cidade || clinica.estado || '')].filter(Boolean).join(' - ');
    clinicaBloco = `Solicitamos que o ${senhor} compareça até a ${clinica.nome}${loc ? ` que fica na ${loc}` : ''}, até o dia ${dtExame} a partir das ${hrExame}h para fazer seu exame demissional. A baixa na CTPS será dada no dia ${dtCtps}.\n\n`;
  } else {
    clinicaBloco = `Solicitamos que compareça até a _______________, até o dia ${dtExame} a partir das ${hrExame}h para fazer seu exame demissional. A baixa na CTPS será dada no dia ${dtCtps}.\n\n`;
  }

  const rhParts   = [f.contato_rh_nome, f.contato_rh_cargo].filter(Boolean).join(', ');
  const contatoRh = [f.telefone_rh, rhParts ? `(${rhParts})` : ''].filter(Boolean).join(' ');

  return `COMUNICADO DE RESCISÃO DO CONTRATO DE TRABALHO

EMPREGADOR: GRAOMIL LTDA, pessoa jurídica de direito privado, inscrita no CNPJ/MF sob nº 29.666.679/0001-34, com sede na Avenida BRASIL, 2732, APT 01, SAO CRISTOVAO, CASCAVEL, PR,

EMPREGADO(A): ${f.nome || '_______________'} ${f.nacionalidade || 'brasileiro(a)'}, ${f.estado_civil || 'solteiro(a)'}, ${f.cargo || '_______________'} ${portador} da cédula de identidade R.G nº ${f.rg || '_______________'}, ${portador} do CPF: ${f.cpf || '___.___.___-__'}
Endereço: ${enderecoEmp || '_______________'}.

Prezado ${prezado} ${primeiroNome || '_______________'}, comunicamos que o seu contrato de trabalho na modalidade intermitente fica rescindido com as seguintes condições:

A multa de 40% sob o saldo de FGTS pagaremos via GFD até o dia ${f.data_fgts ? fmtDate(f.data_fgts) : '__/__/____'}.

${clinicaBloco}Em caso de dúvidas, favor entrar em contato com o número ${contatoRh || '___________'} para maiores informações.

${f.cidade_empresa || 'Cascavel'}, ${f.data_carta ? fmtDataPt(f.data_carta) : '____ de ________ de _____'}.`;
}

async function callFn(name, body) {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session?.access_token}`,
    },
    body: JSON.stringify(body),
  });
  return res.json();
}

async function loadAll() {
  state.loading = true;
  const [{ data: tels }, { data: rems }] = await Promise.all([
    supabase.from('envios_telegramas')
      .select('*, remetente:envios_remetentes(nome), destinatario:envios_destinatarios(nome, cidade, uf)')
      .order('created_at', { ascending: false })
      .limit(300),
    supabase.from('envios_remetentes').select('*').eq('ativo', true).order('nome'),
  ]);

  let dests = [];
  for (let offset = 0; ; offset += 1000) {
    const { data } = await supabase
      .from('envios_destinatarios')
      .select('id, nome, cidade, uf, cep, logradouro, numero, complemento, bairro')
      .eq('ativo', true)
      .order('nome')
      .range(offset, offset + 999);
    dests = dests.concat(data ?? []);
    if (!data || data.length < 1000) break;
  }

  let clinicas = [];
  for (let offset = 0; ; offset += 1000) {
    const { data } = await supabase
      .from('rh_clinicas_sst')
      .select('id,nome,cidade,estado,endereco,telefone,celular,observacoes')
      .eq('ativo', true)
      .order('estado').order('cidade').order('nome')
      .range(offset, offset + 999);
    clinicas = clinicas.concat(data ?? []);
    if (!data || data.length < 1000) break;
  }

  state.telegramas    = tels ?? [];
  state.remetentes    = rems ?? [];
  state.destinatarios = dests;
  state.clinicas      = clinicas;
  state.loading = false;
}

function renderTab() {
  const area = $root?.querySelector('#tel-tab-content');
  if (!area) return;
  if (state.tab === 'enviar')   area.innerHTML = renderEnviar();
  else if (state.tab === 'enviados') area.innerHTML = renderEnviados();
  else if (state.tab === 'agendados') area.innerHTML = renderAgendados();
  bindEvents();
}

// ── Enviar ────────────────────────────────────────────────────────────────────
function renderEnviar() {
  const remPadrao = state.remetentes.find(r => r.padrao) ?? state.remetentes[0];
  const optRem = state.remetentes.map(r =>
    `<option value="${r.id}"${r.id === remPadrao?.id ? ' selected' : ''}>${esc(r.nome)} — ${esc(r.cidade)}/${esc(r.uf)}</option>`
  ).join('');

  const isRescisao = state.modeloAtivo === 'rescisao';
  const rf = state.rescisaoFields;

  const rfield = (id, label, type, val, opts = {}) => {
    const ph = opts.placeholder ? ` placeholder="${esc(opts.placeholder)}"` : '';
    return `<div style="display:flex;flex-direction:column;gap:5px">
      <label style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:rgba(200,230,210,.50)">${label}</label>
      <input id="${id}" type="${type}" value="${esc(val)}"${ph}
        style="padding:9px 12px;border:1px solid rgba(45,212,160,.12);border-radius:12px;background:rgba(8,22,17,.58);color:var(--text);outline:none;font:inherit;font-size:.88rem;color-scheme:dark;width:100%;box-sizing:border-box" />
    </div>`;
  };
  const rsexo = (val) => `<div style="display:flex;flex-direction:column;gap:5px">
    <label style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:rgba(200,230,210,.50)">Sexo</label>
    <select id="res-sexo"
      style="padding:9px 12px;border:1px solid rgba(45,212,160,.12);border-radius:12px;background:rgba(8,22,17,.58);color:var(--text);outline:none;font:inherit;font-size:.88rem;color-scheme:dark;width:100%;box-sizing:border-box">
      <option value="M"${(val || 'M') === 'M' ? ' selected' : ''}>Masculino</option>
      <option value="F"${val === 'F' ? ' selected' : ''}>Feminino</option>
    </select>
  </div>`;
  const mBtn = (id, label, active) =>
    `<button type="button" id="${id}"
      style="padding:8px 16px;border-radius:12px;font-size:.80rem;font-weight:700;cursor:pointer;
        border:1px solid ${active ? 'rgba(45,212,160,.45)' : 'rgba(45,212,160,.18)'};
        background:${active ? 'rgba(45,212,160,.18)' : 'rgba(8,22,17,.58)'};
        color:${active ? '#dcfce7' : 'rgba(200,230,210,.55)'}">${label}</button>`;

  return `
    <div class="form-section">
      <div style="background:rgba(45,212,160,.07);border:1px solid rgba(45,212,160,.18);border-radius:12px;padding:12px 16px;margin-bottom:20px;font-size:.84rem;color:rgba(180,220,195,.72);display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap">
        <div>
          <strong style="color:rgba(45,212,160,.9)">Telegrama via SMT — Correios</strong><br>
          Envio de telegramas pelo Sistema de Mensagens Telemáticas dos Correios.
          Integração automática via API REST (quando disponível) ou manual pelo portal.
        </div>
        <a href="${SMT_PORTAL}" target="_blank" rel="noopener" class="btn btn-secondary" style="white-space:nowrap;font-size:.80rem">
          Abrir Portal SMT ↗
        </a>
      </div>

      <h3 style="margin:0 0 16px">Compor Telegrama</h3>
      <form id="form-novo-telegrama" class="form-grid">
        <div class="form-group">
          <label>Remetente (empresa) *</label>
          <select name="remetente_id" required>${optRem || '<option value="">— cadastre um remetente primeiro —</option>'}</select>
        </div>
        <div class="form-group">
          <label>Destinatário</label>
          <div class="dest-ac-wrap">
            <input type="text" id="search-dest-tel" placeholder="Buscar na agenda ou deixar em branco..." autocomplete="off" />
            <input type="hidden" name="destinatario_id" id="hidden-dest-tel-id" />
            <ul class="dest-ac-drop" id="dest-ac-drop-tel"></ul>
          </div>
        </div>

        <div class="form-group" id="grp-dest-nome" style="">
          <label>Nome do destinatário *</label>
          <input type="text" name="dest_nome" id="inp-dest-nome" placeholder="Obrigatório se não usar agenda" />
        </div>
        <div class="form-group">
          <label>CEP *</label>
          <input type="text" name="dest_cep" id="inp-dest-cep" maxlength="9" placeholder="00000-000" />
          <button type="button" class="btn btn-sm btn-secondary" data-busca-cep-tel style="margin-top:4px">Buscar CEP</button>
        </div>
        <div class="form-group">
          <label>Logradouro *</label>
          <input type="text" name="dest_logradouro" id="inp-dest-log" />
        </div>
        <div class="form-group">
          <label>Número *</label>
          <input type="text" name="dest_numero" id="inp-dest-num" />
        </div>
        <div class="form-group">
          <label>Complemento</label>
          <input type="text" name="dest_complemento" id="inp-dest-comp" />
        </div>
        <div class="form-group">
          <label>Bairro *</label>
          <input type="text" name="dest_bairro" id="inp-dest-bairro" />
        </div>
        <div class="form-group">
          <label>Cidade *</label>
          <input type="text" name="dest_cidade" id="inp-dest-cidade" />
        </div>
        <div class="form-group">
          <label>UF *</label>
          <input type="text" name="dest_uf" id="inp-dest-uf" maxlength="2" style="text-transform:uppercase" />
        </div>

        <div class="form-group full-width" style="border-top:1px solid rgba(45,212,160,.07);padding-top:14px;margin-top:2px">
          <label>Modelo de Mensagem</label>
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:4px">
            ${mBtn('btn-modelo-manual', 'Redigir manualmente', !isRescisao)}
            ${mBtn('btn-modelo-rescisao', 'Rescisão de Contrato de Trabalho', isRescisao)}
          </div>
        </div>

        ${isRescisao ? `
        <div id="rescisao-panel" class="form-group full-width">
          <div style="background:rgba(45,212,160,.04);border:1px solid rgba(45,212,160,.15);border-radius:14px;padding:16px 18px">
            <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:rgba(200,230,210,.50);margin-bottom:14px">Dados para Rescisão de Contrato</div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px 18px">
              ${rfield('res-nome',       'Nome do Funcionário',   'text', rf.nome             || '')}
              ${rsexo(rf.sexo || 'M')}
              ${rfield('res-nac',        'Nacionalidade',         'text', rf.nacionalidade     || 'brasileiro')}
              ${rfield('res-estcivil',   'Estado Civil',          'text', rf.estado_civil      || 'solteiro')}
              ${rfield('res-cargo',      'Cargo',                 'text', rf.cargo             || '')}
              ${rfield('res-rg',         'RG',                    'text', rf.rg               || '')}
              ${rfield('res-cpf',        'CPF',                   'text', rf.cpf              || '')}
              ${rfield('res-dtfgts',     'Data FGTS / GFD',       'date', rf.data_fgts        || '')}
              ${rfield('res-dtexame',    'Data do Exame',         'date', rf.data_exame       || '')}
              ${rfield('res-hrexame',    'Hora do Exame',         'text', rf.hora_exame       || '', { placeholder: 'ex: 8:00' })}
              ${rfield('res-dtctps',     'Data Baixa CTPS',       'date', rf.data_ctps        || '')}
              ${rfield('res-rh-nome',    'Contato RH (Nome)',     'text', rf.contato_rh_nome  || 'Andrezza')}
              ${rfield('res-rh-cargo',   'Cargo RH',              'text', rf.contato_rh_cargo || 'Assistente de RH')}
              ${rfield('res-rh-tel',     'Telefone RH',           'text', rf.telefone_rh      || '45 9824-0100')}
              ${rfield('res-cidade-emp', 'Cidade da Empresa',     'text', rf.cidade_empresa   || 'Cascavel')}
              ${rfield('res-data-carta', 'Data da Carta',         'date', rf.data_carta       || '')}
            </div>
            <button type="button" id="btn-gerar-texto" class="btn btn-primary"
              style="margin-top:16px;width:100%;font-size:.88rem">Gerar Texto →</button>
          </div>
        </div>` : ''}

        <div class="form-group full-width">
          <label>Mensagem *</label>
          <textarea name="mensagem" rows="5" maxlength="2000" placeholder="Texto do telegrama (máx. 2000 caracteres)..." required
            style="resize:vertical;font-family:ui-monospace,'Cascadia Code',monospace;font-size:.88rem;line-height:1.55"></textarea>
          <div style="font-size:11px;color:rgba(180,220,195,.35);margin-top:4px">O texto será transmitido exatamente como digitado.</div>
        </div>

        <div class="form-group full-width">
          <label>Clínica — Exame Demissional (opcional)</label>
          <div class="dest-ac-wrap">
            <input type="text" id="search-clinica-tel"
              placeholder="Digite o nome da clínica ou cidade…" autocomplete="off" />
            <input type="hidden" name="clinica_sst_id" id="hidden-clinica-id" />
            <ul class="dest-ac-drop" id="clinica-ac-drop"></ul>
          </div>
          <div id="clinica-selecionada-card"
            style="display:none;margin-top:10px;padding:12px 14px;background:rgba(34,197,94,.06);border:1px solid rgba(34,197,94,.18);border-radius:12px;font-size:.84rem;color:rgba(200,230,210,.80);line-height:1.55">
          </div>
        </div>

        <div class="form-group">
          <label>Serviços adicionais</label>
          <div style="display:flex;flex-direction:column;gap:8px;padding:4px 0">
            <label style="display:flex;align-items:center;gap:8px;font-size:.88rem;text-transform:none;letter-spacing:0;color:var(--text);cursor:pointer">
              <input type="checkbox" name="tem_pc" value="1" style="width:16px;height:16px;accent-color:rgba(45,212,160,.8)" />
              <span><strong>PC</strong> — Pedido de Confirmação (telegrama de confirmação de entrega)</span>
            </label>
            <label style="display:flex;align-items:center;gap:8px;font-size:.88rem;text-transform:none;letter-spacing:0;color:var(--text);cursor:pointer">
              <input type="checkbox" name="tem_cc" value="1" style="width:16px;height:16px;accent-color:rgba(45,212,160,.8)" />
              <span><strong>CC</strong> — Cópia Comprobatória (cópia idêntica ao remetente)</span>
            </label>
          </div>
        </div>
        <div class="form-group">
          <label>Agendamento (opcional)</label>
          <input type="datetime-local" name="agendamento" style="color-scheme:dark" />
          <div style="font-size:11px;color:rgba(180,220,195,.35);margin-top:4px">Deixe em branco para envio imediato.</div>
        </div>

        <div class="form-actions full-width">
          <button type="submit" class="btn btn-primary">Enviar Telegrama</button>
          <span style="font-size:.80rem;color:rgba(180,220,195,.40)">
            Tentativa automática via API — se indisponível, salva para envio manual no portal.
          </span>
        </div>
      </form>
    </div>`;
}

// ── Enviados ──────────────────────────────────────────────────────────────────
function renderEnviados() {
  const lista = state.telegramas.filter(t => ['ENVIADO','PENDENTE_PORTAL','ERRO'].includes(t.status));

  if (!lista.length) return '<p class="empty-state">Nenhum telegrama enviado ainda.</p>';

  const rows = lista.map(t => {
    const destNome = t.destinatario?.nome ?? t.dest_nome ?? '—';
    const destLoc  = t.destinatario
      ? [t.destinatario.cidade, t.destinatario.uf].filter(Boolean).join('/')
      : [t.dest_cidade, t.dest_uf].filter(Boolean).join('/');
    const dt = t.confirmado_em ?? t.created_at;
    const dtStr = dt ? new Date(dt).toLocaleString('pt-BR') : '—';
    const extra = [];
    if (t.tem_pc) extra.push('PC');
    if (t.tem_cc) extra.push('CC');
    const isPendente = t.status === 'PENDENTE_PORTAL';

    return `
    <div class="envios-row${isPendente ? ' envios-row-devolvido' : ''}" style="grid-template-columns:130px 1fr 1fr 120px">
      <div class="envios-col-data">
        <span class="envios-data-main">${dtStr}</span>
      </div>
      <div>
        <div class="envios-nome">${esc(destNome)}</div>
        <div class="envios-sub">${destLoc}${extra.length ? ' · ' + extra.join(' + ') : ''}</div>
        ${t.protocolo ? `<div class="envios-sub">Protocolo: ${esc(t.protocolo)}</div>` : ''}
      </div>
      <div>
        <div style="font-size:.80rem;color:rgba(180,220,195,.55);max-width:280px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(t.mensagem)}">${esc(t.mensagem.slice(0, 80))}${t.mensagem.length > 80 ? '…' : ''}</div>
        ${isPendente ? `<a href="${SMT_PORTAL}" target="_blank" rel="noopener" class="btn btn-sm btn-secondary" style="margin-top:6px;font-size:.75rem">Enviar no Portal ↗</a>` : ''}
        ${t.observacoes && t.status === 'ERRO' ? `<div style="font-size:11px;color:rgba(255,100,100,.7);margin-top:4px">${esc(t.observacoes.slice(0,120))}</div>` : ''}
      </div>
      <div>${badge(t.status)}${t.valor_postagem ? `<div class="envios-sub">${MONEY.format(t.valor_postagem)}</div>` : ''}</div>
    </div>`;
  }).join('');

  return `
    <div class="toolbar" style="margin-bottom:14px">
      <button class="btn btn-secondary" id="btn-refresh-enviados-tel">Atualizar</button>
      <span style="font-size:12px;color:rgba(180,220,195,.40)">${lista.length} telegrama(s)</span>
    </div>
    <div style="display:grid;grid-template-columns:130px 1fr 1fr 120px;gap:6px 0;padding:0 18px 6px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:rgba(180,220,195,.28)">
      <span>Data</span><span>Destinatário</span><span>Mensagem</span><span>Status</span>
    </div>
    <div class="envios-row-list">${rows}</div>`;
}

// ── Agendados ─────────────────────────────────────────────────────────────────
function renderAgendados() {
  const lista = state.telegramas.filter(t => t.status === 'AGENDADO');
  if (!lista.length) return '<p class="empty-state">Nenhum telegrama agendado.</p>';

  const rows = lista.map(t => {
    const destNome = t.destinatario?.nome ?? t.dest_nome ?? '—';
    const agStr = t.agendamento ? new Date(t.agendamento).toLocaleString('pt-BR') : '—';
    return `<tr>
      <td>${esc(destNome)}</td>
      <td>${agStr}</td>
      <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(t.mensagem.slice(0,60))}${t.mensagem.length>60?'…':''}</td>
      <td>${badge(t.status)}</td>
      <td class="td-actions">
        <button class="btn btn-sm btn-danger" data-tel-cancelar="${t.id}">Cancelar</button>
      </td>
    </tr>`;
  }).join('');

  return `
    <div class="toolbar" style="margin-bottom:12px">
      <button class="btn btn-secondary" id="btn-refresh-agendados-tel">Atualizar</button>
    </div>
    <div class="table-wrapper">
      <table class="data-table">
        <thead><tr><th>Destinatário</th><th>Agendado para</th><th>Mensagem</th><th>Status</th><th>Ações</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

// ── Event binding ─────────────────────────────────────────────────────────────
function bindEvents() {
  const area = $root?.querySelector('#tel-tab-content');
  if (!area) return;

  area.querySelector('#btn-refresh-enviados-tel')?.addEventListener('click', async () => { await loadAll(); renderTab(); });
  area.querySelector('#btn-refresh-agendados-tel')?.addEventListener('click', async () => { await loadAll(); renderTab(); });

  // Cancelar telegrama agendado
  area.querySelectorAll('[data-tel-cancelar]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Cancelar este telegrama agendado?')) return;
      const { error } = await supabase.from('envios_telegramas').update({ status: 'CANCELADO' }).eq('id', btn.dataset.telCancelar);
      if (error) { setFeedback('Erro: ' + error.message, true); return; }
      setFeedback('Telegrama cancelado.');
      await loadAll(); renderTab();
    });
  });

  // Busca CEP
  area.querySelector('[data-busca-cep-tel]')?.addEventListener('click', async () => {
    const cepInp = area.querySelector('#inp-dest-cep');
    const cep = (cepInp?.value ?? '').replace(/\D/g,'');
    if (cep.length !== 8) { setFeedback('CEP inválido', true); return; }
    try {
      const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      const d = await res.json();
      if (d.erro) { setFeedback('CEP não encontrado', true); return; }
      const set = (id, v) => { const el = area.querySelector(id); if (el) el.value = v ?? ''; };
      set('#inp-dest-log',    d.logradouro);
      set('#inp-dest-bairro', d.bairro);
      set('#inp-dest-cidade', d.localidade);
      set('#inp-dest-uf',     d.uf);
      setFeedback('Endereço preenchido.');
    } catch { setFeedback('Erro ao buscar CEP', true); }
  });

  // Autocomplete destinatário
  const acInp    = area.querySelector('#search-dest-tel');
  const acDrop   = area.querySelector('#dest-ac-drop-tel');
  const acHidden = area.querySelector('#hidden-dest-tel-id');

  function fillDestinatario(d) {
    const set = (id, v) => { const el = area.querySelector(id); if (el) el.value = v ?? ''; };
    set('#inp-dest-nome',   d.nome);
    set('#inp-dest-cep',    d.cep);
    set('#inp-dest-log',    d.logradouro);
    set('#inp-dest-num',    d.numero);
    set('#inp-dest-comp',   d.complemento);
    set('#inp-dest-bairro', d.bairro);
    set('#inp-dest-cidade', d.cidade);
    set('#inp-dest-uf',     d.uf);
    if (d.nome) {
      state.rescisaoFields.nome = d.nome;
      const resNome = area.querySelector('#res-nome');
      if (resNome) resNome.value = d.nome;
    }
  }

  if (acInp && acDrop) {
    function acShow(matches) {
      if (!matches.length) { acDrop.classList.remove('open'); return; }
      acDrop.innerHTML = matches.slice(0, 25).map(d =>
        `<li class="dest-ac-item" data-id="${esc(d.id)}" data-nome="${esc(d.nome)}"><span>${esc(d.nome)}</span><small>${d.cidade ? `${esc(d.cidade)}/${esc(d.uf)}` : ''}</small></li>`
      ).join('');
      acDrop.classList.add('open');
    }
    acInp.addEventListener('input', () => {
      const q = acInp.value.toLowerCase().trim();
      if (acHidden) acHidden.value = '';
      acShow(q ? state.destinatarios.filter(d => d.nome.toLowerCase().includes(q)) : []);
    });
    acInp.addEventListener('focus', () => {
      const q = acInp.value.toLowerCase().trim();
      if (q) acShow(state.destinatarios.filter(d => d.nome.toLowerCase().includes(q)));
    });
    acDrop.addEventListener('mousedown', e => {
      const item = e.target.closest('.dest-ac-item');
      if (!item) return;
      e.preventDefault();
      acInp.value = item.dataset.nome;
      if (acHidden) acHidden.value = item.dataset.id;
      acDrop.classList.remove('open');
      const dest = state.destinatarios.find(d => d.id === item.dataset.id);
      if (dest) fillDestinatario(dest);
    });
    acInp.addEventListener('blur', () => acDrop.classList.remove('open'));
  }

  // Autocomplete clínica SST
  const clInp    = area.querySelector('#search-clinica-tel');
  const clDrop   = area.querySelector('#clinica-ac-drop');
  const clHidden = area.querySelector('#hidden-clinica-id');
  const clCard   = area.querySelector('#clinica-selecionada-card');

  function normQ(v) { return String(v||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase(); }

  function renderClinicaCard(c) {
    if (!clCard) return;
    const enderInfo = [c.endereco, c.cidade && c.estado ? `${c.cidade}/${c.estado}` : (c.cidade||c.estado||'')].filter(Boolean).join(' — ');
    const contato = [c.telefone, c.celular].filter(Boolean).join(' · ');
    const obs = c.observacoes ? `<div style="margin-top:4px;font-size:.78rem;color:rgba(180,220,195,.45)">${esc(c.observacoes)}</div>` : '';
    clCard.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap">
        <div>
          <div style="font-weight:800;color:#e2e2f0;font-size:.92rem">${esc(c.nome)}</div>
          ${enderInfo ? `<div style="margin-top:3px">${esc(enderInfo)}</div>` : ''}
          ${contato   ? `<div style="margin-top:3px">${esc(contato)}</div>`   : ''}
          ${obs}
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button type="button" class="btn btn-sm btn-secondary" id="btn-inserir-clinica"
            style="white-space:nowrap;font-size:.78rem">Inserir parágrafo ↓</button>
          <button type="button" class="btn btn-sm" id="btn-limpar-clinica"
            style="font-size:.78rem;background:rgba(239,68,68,.12);border:1px solid rgba(239,68,68,.22);color:#fca5a5">Limpar</button>
        </div>
      </div>`;
    clCard.style.display = 'block';

    clCard.querySelector('#btn-inserir-clinica')?.addEventListener('click', () => {
      const ta = area.querySelector('textarea[name=mensagem]');
      if (!ta) return;
      const loc = [c.endereco, c.cidade && c.estado ? `${c.cidade}/${c.estado}` : (c.cidade||c.estado||'')].filter(Boolean).join(' - ');
      const frase = `Solicitamos que compareça até a ${c.nome}${loc ? ` que fica na ${loc}` : ''}, até o dia __/__/____ a partir das ____h para fazer seu exame demissional.`;
      ta.value = ta.value ? ta.value + '\n\n' + frase : frase;
      ta.focus();
      ta.setSelectionRange(ta.value.length, ta.value.length);
    });

    clCard.querySelector('#btn-limpar-clinica')?.addEventListener('click', () => {
      state.clinicaSelecionada = null;
      if (clHidden) clHidden.value = '';
      if (clInp)    clInp.value = '';
      clCard.style.display = 'none';
      clCard.innerHTML = '';
    });
  }

  if (clInp && clDrop) {
    function clShow(matches) {
      if (!matches.length) { clDrop.classList.remove('open'); return; }
      clDrop.innerHTML = matches.slice(0, 30).map(c => `
        <li class="dest-ac-item" data-cl-id="${esc(c.id)}" data-cl-nome="${esc(c.nome)}">
          <span>${esc(c.nome)}</span>
          <small>${[c.cidade, c.estado].filter(Boolean).join('/')}${c.endereco ? ' · ' + esc(c.endereco.slice(0,50)) : ''}</small>
        </li>`).join('');
      clDrop.classList.add('open');
    }
    clInp.addEventListener('input', () => {
      const q = normQ(clInp.value);
      if (clHidden) clHidden.value = '';
      clDrop.classList.remove('open');
      if (!q) return;
      clShow(state.clinicas.filter(c => normQ(c.nome).includes(q) || normQ(c.cidade).includes(q) || normQ(c.estado).includes(q)));
    });
    clInp.addEventListener('focus', () => {
      const q = normQ(clInp.value);
      if (q) clShow(state.clinicas.filter(c => normQ(c.nome).includes(q) || normQ(c.cidade).includes(q)));
    });
    clDrop.addEventListener('mousedown', e => {
      const item = e.target.closest('.dest-ac-item');
      if (!item) return;
      e.preventDefault();
      clInp.value = item.dataset.clNome;
      if (clHidden) clHidden.value = item.dataset.clId;
      clDrop.classList.remove('open');
      const clinica = state.clinicas.find(c => c.id === item.dataset.clId);
      if (clinica) { state.clinicaSelecionada = clinica; renderClinicaCard(clinica); }
    });
    clInp.addEventListener('blur', () => clDrop.classList.remove('open'));
  }

  // Modelo selector
  area.querySelector('#btn-modelo-manual')?.addEventListener('click', () => {
    state.modeloAtivo = 'manual';
    renderTab();
  });
  area.querySelector('#btn-modelo-rescisao')?.addEventListener('click', () => {
    state.modeloAtivo = 'rescisao';
    renderTab();
  });

  // Rescisão panel — persist fields to state
  const saveResField = (e) => {
    const keyMap = {
      'res-nome':       'nome',
      'res-sexo':       'sexo',
      'res-nac':        'nacionalidade',
      'res-estcivil':   'estado_civil',
      'res-cargo':      'cargo',
      'res-rg':         'rg',
      'res-cpf':        'cpf',
      'res-dtfgts':     'data_fgts',
      'res-dtexame':    'data_exame',
      'res-hrexame':    'hora_exame',
      'res-dtctps':     'data_ctps',
      'res-rh-nome':    'contato_rh_nome',
      'res-rh-cargo':   'contato_rh_cargo',
      'res-rh-tel':     'telefone_rh',
      'res-cidade-emp': 'cidade_empresa',
      'res-data-carta': 'data_carta',
    };
    const key = keyMap[e.target.id];
    if (key) state.rescisaoFields[key] = e.target.value;
  };
  const resPanel = area.querySelector('#rescisao-panel');
  resPanel?.addEventListener('input',  saveResField);
  resPanel?.addEventListener('change', saveResField);

  // Gerar Texto a partir dos dados de rescisão
  area.querySelector('#btn-gerar-texto')?.addEventListener('click', () => {
    const get = (id) => area.querySelector(id)?.value ?? '';
    const f = {
      nome:             get('#res-nome')       || state.rescisaoFields.nome             || '',
      sexo:             get('#res-sexo')       || state.rescisaoFields.sexo             || 'M',
      nacionalidade:    get('#res-nac')        || state.rescisaoFields.nacionalidade    || 'brasileiro',
      estado_civil:     get('#res-estcivil')   || state.rescisaoFields.estado_civil     || 'solteiro',
      cargo:            get('#res-cargo')      || state.rescisaoFields.cargo            || '',
      rg:               get('#res-rg')         || state.rescisaoFields.rg              || '',
      cpf:              get('#res-cpf')        || state.rescisaoFields.cpf             || '',
      data_fgts:        get('#res-dtfgts')     || state.rescisaoFields.data_fgts       || '',
      data_exame:       get('#res-dtexame')    || state.rescisaoFields.data_exame      || '',
      hora_exame:       get('#res-hrexame')    || state.rescisaoFields.hora_exame      || '',
      data_ctps:        get('#res-dtctps')     || state.rescisaoFields.data_ctps       || '',
      contato_rh_nome:  get('#res-rh-nome')    || state.rescisaoFields.contato_rh_nome  || 'Andrezza',
      contato_rh_cargo: get('#res-rh-cargo')   || state.rescisaoFields.contato_rh_cargo || 'Assistente de RH',
      telefone_rh:      get('#res-rh-tel')     || state.rescisaoFields.telefone_rh      || '45 9824-0100',
      cidade_empresa:   get('#res-cidade-emp') || state.rescisaoFields.cidade_empresa   || 'Cascavel',
      data_carta:       get('#res-data-carta') || state.rescisaoFields.data_carta       || '',
      dest_logradouro:  get('#inp-dest-log'),
      dest_numero:      get('#inp-dest-num'),
      dest_bairro:      get('#inp-dest-bairro'),
      dest_cidade:      get('#inp-dest-cidade'),
      dest_uf:          get('#inp-dest-uf'),
      dest_cep:         get('#inp-dest-cep'),
    };
    const ta = area.querySelector('textarea[name=mensagem]');
    if (ta) ta.value = gerarTextoRescisao(f, state.clinicaSelecionada);
  });

  // Submit novo telegrama
  area.querySelector('#form-novo-telegrama')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const destinatarioId = fd.get('destinatario_id') || null;
    const destNome = (fd.get('dest_nome') ?? '').trim();

    if (!destinatarioId && !destNome) {
      setFeedback('Informe o destinatário (agenda ou preenchimento manual).', true); return;
    }

    const mensagem = (fd.get('mensagem') ?? '').trim();
    if (!mensagem) { setFeedback('Mensagem obrigatória.', true); return; }

    const row = {
      remetente_id: fd.get('remetente_id'),
      destinatario_id: destinatarioId,
      dest_nome:        destinatarioId ? null : destNome,
      dest_cep:         destinatarioId ? null : (fd.get('dest_cep') ?? '').trim() || null,
      dest_logradouro:  destinatarioId ? null : (fd.get('dest_logradouro') ?? '').trim() || null,
      dest_numero:      destinatarioId ? null : (fd.get('dest_numero') ?? '').trim() || null,
      dest_complemento: destinatarioId ? null : (fd.get('dest_complemento') ?? '').trim() || null,
      dest_bairro:      destinatarioId ? null : (fd.get('dest_bairro') ?? '').trim() || null,
      dest_cidade:      destinatarioId ? null : (fd.get('dest_cidade') ?? '').trim() || null,
      dest_uf:          destinatarioId ? null : (fd.get('dest_uf') ?? '').trim().toUpperCase().slice(0,2) || null,
      mensagem,
      tem_pc: fd.get('tem_pc') === '1',
      tem_cc: fd.get('tem_cc') === '1',
      agendamento: fd.get('agendamento') || null,
      clinica_sst_id: fd.get('clinica_sst_id') || null,
      status: 'RASCUNHO',
    };

    const btnSub = e.target.querySelector('[type=submit]');
    if (btnSub) { btnSub.disabled = true; btnSub.textContent = 'Enviando...'; }

    const { data: created, error: insErr } = await supabase.from('envios_telegramas').insert(row).select().single();
    if (insErr) {
      setFeedback('Erro ao salvar: ' + insErr.message, true);
      if (btnSub) { btnSub.disabled = false; btnSub.textContent = 'Enviar Telegrama'; }
      return;
    }

    setFeedback('Tentando enviar via API...');
    const result = await callFn('correios-telegrama', { telegrama_id: created.id });

    const resetForm = () => {
      e.target.reset();
      if (acInp)    acInp.value = '';
      if (acHidden) acHidden.value = '';
      if (clInp)    clInp.value = '';
      if (clHidden) clHidden.value = '';
      if (clCard)   { clCard.style.display = 'none'; clCard.innerHTML = ''; }
      state.clinicaSelecionada = null;
      const keep = ['contato_rh_nome', 'contato_rh_cargo', 'telefone_rh', 'cidade_empresa'];
      const keptRF = {};
      keep.forEach(k => { if (state.rescisaoFields[k]) keptRF[k] = state.rescisaoFields[k]; });
      state.rescisaoFields = keptRF;
    };

    if (result.ok) {
      setFeedback(`Telegrama enviado com sucesso! ID: ${result.id_telegrama ?? '—'}`);
      resetForm();
      state.tab = 'enviados';
    } else if (result.portal_required) {
      setFeedback('Telegrama salvo. API indisponível — use o portal Correios para enviar.', true);
      resetForm();
      state.tab = 'enviados';
    } else {
      setFeedback('Erro ao enviar: ' + (result.error ?? 'desconhecido'), true);
    }

    if (btnSub) { btnSub.disabled = false; btnSub.textContent = 'Enviar Telegrama'; }
    await loadAll();
    $root?.querySelectorAll('[data-tab-tel]').forEach(b => b.classList.toggle('active', b.dataset.tabTel === state.tab));
    renderTab();
  });
}

// ── Main ──────────────────────────────────────────────────────────────────────
initProtectedPage('Telegrama', async (content) => {
  $root = content;
  content.innerHTML = `
    <style>
      .tel-tabs{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:16px}
      .tel-tab{border:1px solid rgba(111,208,165,.22);background:#15152a;color:#e2e2f0;border-radius:999px;padding:10px 18px;font-weight:800;cursor:pointer;font-size:.85rem;transition:background .15s,border-color .15s}
      .tel-tab:hover{background:rgba(111,208,165,.08);border-color:rgba(111,208,165,.35)}
      .tel-tab.active{background:rgba(34,197,94,.22);border-color:rgba(111,208,165,.45);color:#dcfce7}
      .form-section{background:rgba(4,13,9,.42);border:1px solid rgba(45,212,160,.10);border-radius:18px;padding:24px 28px;margin-bottom:16px}
      .form-section h3{margin:0 0 20px;font-size:1.05rem;font-weight:800;color:var(--text);letter-spacing:.01em}
      .form-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px 22px}
      .form-group{display:flex;flex-direction:column;gap:6px}
      .form-group.full-width{grid-column:span 2}
      .form-group label{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:rgba(200,230,210,.50)}
      .form-group input,.form-group select,.form-group textarea{padding:11px 14px;border:1px solid rgba(45,212,160,.12);border-radius:14px;background:rgba(8,22,17,.58);color:var(--text);outline:none;font:inherit;font-size:.92rem;color-scheme:dark;transition:border-color .15s,box-shadow .15s;width:100%;box-sizing:border-box}
      .form-group input:focus,.form-group select:focus,.form-group textarea:focus{border-color:rgba(45,212,160,.30);box-shadow:0 0 0 3px rgba(45,212,160,.08)}
      .form-group input::placeholder,.form-group textarea::placeholder{color:rgba(200,230,210,.30)}
      .form-group select option{background:#0d1a12;color:var(--text)}
      .form-actions{display:flex;gap:10px;align-items:center;grid-column:span 2;padding-top:6px;flex-wrap:wrap}
      .dest-ac-wrap{position:relative}
      .dest-ac-wrap input{width:100%;box-sizing:border-box}
      .dest-ac-drop{display:none;position:absolute;top:calc(100% + 4px);left:0;right:0;z-index:300;list-style:none;margin:0;padding:4px 0;border:1px solid rgba(45,212,160,.22);border-radius:13px;background:#0b1a11;box-shadow:0 8px 32px rgba(0,0,0,.55);max-height:220px;overflow-y:auto}
      .dest-ac-drop.open{display:block}
      .dest-ac-item{padding:9px 14px;cursor:pointer;display:flex;flex-direction:column;gap:2px;border-bottom:1px solid rgba(45,212,160,.06);list-style:none}
      .dest-ac-item:last-child{border-bottom:none}
      .dest-ac-item:hover{background:rgba(45,212,160,.10)}
      .dest-ac-item span{font-size:13px;color:var(--text);font-weight:600}
      .dest-ac-item small{font-size:11px;color:rgba(180,220,195,.50)}
      .envios-row-list{display:flex;flex-direction:column;gap:6px}
      .envios-row{display:grid;gap:8px 14px;align-items:center;background:rgba(4,13,9,.42);border:1px solid rgba(45,212,160,.09);border-radius:12px;padding:12px 18px;transition:border-color .15s}
      .envios-row:hover{border-color:rgba(45,212,160,.20);background:rgba(4,13,9,.58)}
      .envios-row-devolvido{border-color:rgba(239,68,68,.14)}
      .envios-col-data{display:flex;flex-direction:column;gap:3px}
      .envios-data-main{font-size:.82rem;color:rgba(200,230,210,.78);font-variant-numeric:tabular-nums}
      .envios-sub{font-size:.73rem;color:rgba(180,220,195,.44);margin-top:2px}
      .envios-nome{font-size:.92rem;font-weight:700;color:var(--text)}
      .td-actions{white-space:nowrap;display:flex;gap:4px;align-items:center}
      @media(max-width:720px){.form-grid{grid-template-columns:1fr}.form-group.full-width,.form-actions{grid-column:span 1}}
    </style>
    <div id="tel-feedback" class="feedback-bar" style="display:none"></div>
    <nav class="tel-tabs">
      <button class="tel-tab active" data-tab-tel="enviar">Enviar</button>
      <button class="tel-tab" data-tab-tel="enviados">Enviados</button>
      <button class="tel-tab" data-tab-tel="agendados">Agendados</button>
    </nav>
    <div id="tel-tab-content"><p>Carregando...</p></div>`;

  content.querySelectorAll('[data-tab-tel]').forEach(btn => {
    btn.addEventListener('click', () => {
      state.tab = btn.dataset.tabTel;
      content.querySelectorAll('[data-tab-tel]').forEach(b => b.classList.toggle('active', b.dataset.tabTel === state.tab));
      renderTab();
    });
  });

  await loadAll();
  renderTab();
});
