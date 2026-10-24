import { esc, money, brDate, safeUrl, icon, fullAddress, contractAlert, normalizeText } from './util.js?v=20261024-aloj4';
import { ICON, cardFiltro, sincronizarCards } from '../../patrimonioLayoutFrotas.js?v=20261019-ordenar';

const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const MONTHS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

function pad2(value) { return String(value).padStart(2, '0'); }

export function isoDate(date) { return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`; }

function serviceCard(kind, title, included, matricula, extra = '', titular = '') {
  const isGas = kind === 'gas';
  const status = isGas ? (extra ? 'Forma definida' : 'Não informado') : included === true ? 'Incluso' : included === false ? 'Pago' : 'Não informado';
  const badgeClass = isGas && extra ? 'paid' : included === true ? 'included' : included === false ? 'paid' : '';
  const detail = matricula || extra || (isGas ? 'Não informado' : 'Sem matrícula informada');
  return `<div class="aloj-v2-service ${kind}">
    <div class="aloj-v2-service-top">${icon(kind)}<strong>${esc(title)}</strong></div>
    <span class="aloj-v2-service-badge ${badgeClass}">${esc(status)}</span>
    <small>Titular</small><p title="${esc(titular || 'Não informado')}">${esc(titular || 'Não informado')}</p>
    <small>${isGas ? 'Forma de pagamento' : 'Matrícula'}</small><p title="${esc(detail)}">${esc(detail)}</p>
  </div>`;
}

// Serviço da casa no padrão do Frotas: selo verde quando está incluso no aluguel, âmbar quando o gestor paga.
function servicoBadge(label, value) {
  const estado = value === true ? 'incluso' : value === false ? 'pago' : '—';
  const tom = value === true ? 'ok' : value === false ? 'warn' : '';
  return `<span class="fm-badge ${tom}" title="${esc(label)}: ${esc(estado)}">${esc(label)} ${esc(estado)}</span>`;
}

function supervisoesLabel(row = {}) {
  const values = [
    ...(Array.isArray(row.supervisoes) ? row.supervisoes : []),
    row.supervisao,
  ].map((value) => String(value || '').trim()).filter(Boolean);
  return [...new Set(values)].join(' · ') || 'Não informado';
}

const iniciais = (nome) => String(nome || '').trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join('').toUpperCase() || '?';

// Botão de ícone do padrão do Frotas; o clique é tratado por delegação em controle.js ([data-aloj-v2-action]).
function acaoBtn(acao, row, classe, titulo, icone) {
  const nome = row.nome || 'alojamento';
  return `<button type="button" class="fm-ic ${classe}" data-aloj-v2-action="${acao}" data-id="${esc(row.id)}" title="${esc(titulo)}" aria-label="${esc(`${titulo}: ${nome}`)}">${icone}</button>`;
}

function renderListRow(row) {
  const ativo = String(row.status || 'ATIVO').toUpperCase() === 'ATIVO';
  return `<tr data-id="${esc(row.id)}">
    <td><div class="fm-person${ativo ? '' : ' inativo'}"><span class="fm-avatar">${esc(iniciais(row.nome))}</span><div class="fm-cell"><b>${esc(row.nome || 'Alojamento sem nome')}</b><span class="fm-prazo-dia">${esc(row.tipo || 'CASA')} · ${esc([row.cidade, row.uf].filter(Boolean).join('/') || 'Local não informado')}</span></div></div></td>
    <td><div class="fm-cell"><b>${esc(row.responsavel || 'Não informado')}</b><span class="fm-prazo-dia">${esc(row.contato || '')}</span></div></td>
    <td><div class="fm-cell"><b>${row.valor_aluguel ? money(row.valor_aluguel) : 'Não informado'}</b><span class="fm-prazo-dia">${esc(row.capacidade || 0)} vagas · ${esc(row.quartos || 0)} quartos</span></div></td>
    <td><div class="fm-situacao">${servicoBadge('Água', row.agua_inclusa)}${servicoBadge('Luz', row.energia_inclusa)}${servicoBadge('Internet', row.internet_inclusa)}</div></td>
    <td><div class="fm-cell"><span class="fm-badge ${ativo ? 'ok' : 'err'}">${esc(row.status || 'ATIVO')}</span>${contractAlert(row) ? '<span class="fm-prazo-dia fm-prox">Contrato a vencer</span>' : ''}</div></td>
    <td><div class="fm-actions">${acaoBtn('details', row, 'anexo', 'Abrir detalhes', ICON.ver)}${acaoBtn('obs', row, '', 'Observações', ICON.doc)}${acaoBtn('delete', row, 'danger', 'Excluir', ICON.excluir)}</div></td>
  </tr>`;
}

export function renderDetailsContent(row) {
  const contractUrl = safeUrl(row.contrato_url);
  const locationUrl = safeUrl(row.link_localizacao);
  const status = String(row.status || 'ATIVO').toLowerCase();
  const contractLabel = row.contrato_fim ? `Contrato até ${brDate(row.contrato_fim)}` : 'Acessar contrato';
  return `<article class="aloj-v2-card aloj-v2-detail-card" data-id="${esc(row.id)}">
    <div class="aloj-v2-card-head">
      <div class="aloj-v2-title-wrap"><div class="aloj-v2-home-icon">${icon('home')}</div><div style="min-width:0">
        <h4 title="${esc(row.nome)}">${esc(row.nome || 'Alojamento sem nome')}</h4>
        <div class="aloj-v2-subtitle"><span>${esc(row.tipo || 'CASA')}</span><span>•</span><span>${esc([row.cidade, row.uf].filter(Boolean).join('/') || 'Local não informado')}</span>${contractAlert(row) ? '<span style="color:#fde68a">• contrato próximo do vencimento</span>' : ''}</div>
      </div></div><span class="aloj-v2-status ${esc(status)}">${esc(row.status || 'ATIVO')}</span>
    </div>
    <div class="aloj-v2-main-info">
      <div class="aloj-v2-info"><span>Responsável</span><strong title="${esc(row.responsavel || '')}">${esc(row.responsavel || 'Não informado')}</strong></div>
      <div class="aloj-v2-info rent"><span>Aluguel mensal</span><strong>${row.valor_aluguel ? money(row.valor_aluguel) : 'Não informado'}</strong></div>
      <div class="aloj-v2-info"><span>Estrutura</span><strong>${esc(row.capacidade || 0)} vagas · ${esc(row.quartos || 0)} quartos</strong></div>
      <div class="aloj-v2-info"><span>Supervisões autorizadas</span><strong title="${esc(supervisoesLabel(row))}">${esc(supervisoesLabel(row))}</strong></div>
    </div>
    <div class="aloj-v2-services">
      ${serviceCard('water', 'Água', row.agua_inclusa, row.agua_matricula, '', row.agua_titular)}
      ${serviceCard('energy', 'Luz', row.energia_inclusa, row.energia_matricula, '', row.energia_titular)}
      ${serviceCard('internet', 'Internet', row.internet_inclusa, row.internet_matricula, row.empresa_internet, row.internet_titular)}
      ${serviceCard('gas', 'Gás', null, '', row.gas_forma_pagamento, row.gas_titular)}
    </div>
    <div class="aloj-v2-bottom">
      <div class="aloj-v2-address"><div class="aloj-v2-block-title">${icon('pin')} Endereço completo</div><p>${esc(fullAddress(row))}</p>${row.referencia ? `<small>Referência: ${esc(row.referencia)}</small>` : ''}</div>
      <div class="aloj-v2-links"><div class="aloj-v2-block-title">${icon('contract')} Documentos e localização</div><div class="aloj-v2-link-stack">
        <a class="aloj-v2-link ${contractUrl ? '' : 'disabled'}" href="${esc(contractUrl || '#')}" target="_blank" rel="noopener"><span>${esc(contractLabel)}</span>${icon('external')}</a>
        <a class="aloj-v2-link ${locationUrl ? '' : 'disabled'}" href="${esc(locationUrl || '#')}" target="_blank" rel="noopener"><span>Abrir localização</span>${icon('external')}</a>
      </div></div>
    </div>
    <div class="aloj-v2-card-actions"><button type="button" class="aloj-v2-secondary" data-aloj-v2-action="obs" data-id="${esc(row.id)}">${icon('notes')} Observações</button><button type="button" class="aloj-v2-secondary" data-aloj-v2-action="edit" data-id="${esc(row.id)}">Editar</button><button type="button" class="aloj-v2-danger" data-aloj-v2-action="delete" data-id="${esc(row.id)}">Excluir</button></div>
  </article>`;
}

function detailsModalHtml() {
  return `<div class="aloj-v2-modal aloj-v2-details-modal" id="alojV2DetailsModal" aria-hidden="true"><div class="aloj-v2-modal-card aloj-v2-details-modal-card" role="dialog" aria-modal="true" aria-labelledby="alojV2DetailsTitle">
    <div class="aloj-v2-modal-head"><div><div class="aloj-v2-eyebrow">Detalhes</div><h3 id="alojV2DetailsTitle">Alojamento</h3><p id="alojV2DetailsSubtitle">Informações completas do cadastro.</p></div><button type="button" class="aloj-v2-icon-btn" id="alojV2DetailsClose" aria-label="Fechar">${icon('close')}</button></div>
    <div id="alojV2DetailsBody" class="aloj-v2-details-body"></div>
  </div></div>`;
}

function modalHtml() {
  return `<div class="aloj-v2-modal" id="alojV2Modal" aria-hidden="true"><div class="aloj-v2-modal-card" role="dialog" aria-modal="true" aria-labelledby="alojV2ModalTitle">
    <div class="aloj-v2-modal-head"><div><div class="aloj-v2-eyebrow">Cadastro</div><h3 id="alojV2ModalTitle">Novo alojamento</h3><p>Dados de contrato, endereço, serviços e responsável.</p></div><button type="button" class="aloj-v2-icon-btn" id="alojV2Close" aria-label="Fechar">${icon('close')}</button></div>
    <form id="alojV2Form" class="aloj-v2-form">
      <section class="aloj-v2-form-section"><div class="aloj-v2-form-section-title">${icon('building')} Informações do alojamento</div><div class="aloj-v2-grid">
        <div class="aloj-v2-field span-2"><label>Nome do alojamento *</label><input id="alojV2Nome" required placeholder="Ex.: Alojamento Boa Vista"></div>
        <div class="aloj-v2-field"><label>Tipo</label><select id="alojV2Tipo"><option value="CASA">Casa</option><option value="APARTAMENTO">Apartamento</option><option value="POUSADA">Pousada</option><option value="ESCRITORIO">Escritório</option><option value="OUTRO">Outro</option></select></div>
        <div class="aloj-v2-field"><label>Status</label><select id="alojV2Status"><option value="ATIVO">Ativo</option><option value="INATIVO">Inativo</option><option value="BLOQUEADO">Bloqueado</option></select></div>
        <div class="aloj-v2-field span-2"><label>Supervisões autorizadas *</label><select id="alojV2Supervisao" multiple size="6" required><option value="" disabled>Carregando...</option></select><small style="color:#718179;font-size:10px;line-height:1.35">Selecione uma ou mais supervisões. Use Ctrl (Windows) ou Cmd (Mac) para marcar opções separadas.</small></div>
        <div class="aloj-v2-field span-2"><label>Responsável</label><input id="alojV2Responsavel"></div><div class="aloj-v2-field"><label>Contato</label><input id="alojV2Contato" placeholder="Telefone ou WhatsApp"></div>
        <div class="aloj-v2-field"><label>Aluguel mensal (R$)</label><input id="alojV2Aluguel" type="number" min="0" step="0.01"></div><div class="aloj-v2-field"><label>Capacidade</label><input id="alojV2Capacidade" type="number" min="0" step="1"></div>
        <div class="aloj-v2-field"><label>Quartos</label><input id="alojV2Quartos" type="number" min="0" step="1"></div><div class="aloj-v2-field"><label>Prioridade</label><select id="alojV2Prioridade"><option value="NORMAL">Normal</option><option value="PREFERENCIAL">Preferencial</option><option value="EVITAR">Evitar</option></select></div>
      </div></section>
      <section class="aloj-v2-form-section"><div class="aloj-v2-form-section-title">${icon('contract')} Contrato</div><div class="aloj-v2-grid"><div class="aloj-v2-field span-2"><label>Link do contrato</label><input id="alojV2ContratoUrl" type="url" placeholder="https://..."></div><div class="aloj-v2-field"><label>Início do contrato</label><input id="alojV2ContratoInicio" type="date"></div><div class="aloj-v2-field"><label>Término do contrato</label><input id="alojV2ContratoFim" type="date"></div></div></section>
      <section class="aloj-v2-form-section"><div class="aloj-v2-form-section-title">${icon('address')} Endereço e localização</div><div class="aloj-v2-grid">
        <div class="aloj-v2-field span-2"><label>Rua / logradouro</label><input id="alojV2Logradouro"></div><div class="aloj-v2-field"><label>Número</label><input id="alojV2Numero"></div><div class="aloj-v2-field"><label>Complemento</label><input id="alojV2Complemento"></div>
        <div class="aloj-v2-field"><label>Bairro</label><input id="alojV2Bairro"></div><div class="aloj-v2-field"><label>Cidade *</label><input id="alojV2Cidade" required></div><div class="aloj-v2-field"><label>UF *</label><input id="alojV2Uf" required maxlength="2"></div><div class="aloj-v2-field"><label>CEP</label><input id="alojV2Cep"></div>
        <div class="aloj-v2-field span-2"><label>Referência</label><input id="alojV2Referencia"></div><div class="aloj-v2-field span-2"><label>Link de localização</label><input id="alojV2Localizacao" type="url" placeholder="Link do Google Maps"></div>
      </div></section>
      <section class="aloj-v2-form-section"><div class="aloj-v2-form-section-title">${icon('services')} Água, luz, internet e gás</div><div class="aloj-v2-service-form-grid">
        <div class="aloj-v2-service-form"><h5>Água</h5><div class="aloj-v2-field"><label>Pagamento</label><select id="alojV2AguaInclusa"><option value="">Não informado</option><option value="true">Incluso no aluguel</option><option value="false">Pago separadamente</option></select></div><div class="aloj-v2-field"><label>Titular</label><input id="alojV2AguaTitular" placeholder="Nome do titular da conta"></div><div class="aloj-v2-field"><label>Matrícula</label><input id="alojV2AguaMatricula"></div></div>
        <div class="aloj-v2-service-form"><h5>Luz</h5><div class="aloj-v2-field"><label>Pagamento</label><select id="alojV2EnergiaInclusa"><option value="">Não informado</option><option value="true">Incluso no aluguel</option><option value="false">Pago separadamente</option></select></div><div class="aloj-v2-field"><label>Titular</label><input id="alojV2EnergiaTitular" placeholder="Nome do titular da conta"></div><div class="aloj-v2-field"><label>Matrícula</label><input id="alojV2EnergiaMatricula"></div></div>
        <div class="aloj-v2-service-form"><h5>Internet</h5><div class="aloj-v2-field"><label>Pagamento</label><select id="alojV2InternetInclusa"><option value="">Não informado</option><option value="true">Incluso no aluguel</option><option value="false">Pago separadamente</option></select></div><div class="aloj-v2-field"><label>Titular</label><input id="alojV2InternetTitular" placeholder="Nome do titular da conta"></div><div class="aloj-v2-field"><label>Matrícula</label><input id="alojV2InternetMatricula"></div><div class="aloj-v2-field"><label>Empresa</label><input id="alojV2EmpresaInternet"></div></div>
        <div class="aloj-v2-service-form"><h5>Gás</h5><div class="aloj-v2-field"><label>Titular</label><input id="alojV2GasTitular" placeholder="Nome do titular da despesa"></div><div class="aloj-v2-field"><label>Como é pago</label><input id="alojV2GasPagamento" placeholder="Ex.: botijão, condomínio, reembolso"></div></div>
      </div></section>
      <section class="aloj-v2-form-section"><div class="aloj-v2-form-section-title">${icon('contract')} Observações</div><div class="aloj-v2-field full"><label>Observações gerais</label><textarea id="alojV2Observacoes"></textarea></div></section>
    </form>
    <div class="aloj-v2-form-actions"><span id="alojV2Feedback" class="aloj-v2-feedback"></span><button type="button" class="aloj-v2-secondary" id="alojV2Cancel">Cancelar</button><button type="submit" form="alojV2Form" class="aloj-v2-primary" id="alojV2Save">Salvar alojamento</button></div>
  </div></div>`;
}

function obsModalHtml() {
  return `<div class="aloj-v2-modal aloj-v2-obs-modal" id="alojV2ObsModal" aria-hidden="true"><div class="aloj-v2-modal-card aloj-v2-obs-modal-card" role="dialog" aria-modal="true" aria-labelledby="alojV2ObsTitle">
    <div class="aloj-v2-modal-head"><div><div class="aloj-v2-eyebrow">Observações</div><h3 id="alojV2ObsTitle">Alojamento</h3><p>Registre anotações datadas e acompanhe pelo calendário ao lado.</p></div><button type="button" class="aloj-v2-icon-btn" id="alojV2ObsClose" aria-label="Fechar">${icon('close')}</button></div>
    <div class="aloj-v2-obs-body">
      <div class="aloj-v2-obs-notes">
        <form id="alojV2ObsForm" class="aloj-v2-obs-form">
          <div class="aloj-v2-field"><label>Data</label><input id="alojV2ObsData" type="date" required></div>
          <div class="aloj-v2-field full"><label>Anotação</label><textarea id="alojV2ObsTexto" placeholder="Escreva a anotação..." required></textarea></div>
          <div class="aloj-v2-obs-form-actions"><span id="alojV2ObsFeedback" class="aloj-v2-feedback"></span><button type="submit" class="aloj-v2-primary">Adicionar anotação</button></div>
        </form>
        <div id="alojV2ObsList" class="aloj-v2-obs-list"></div>
      </div>
      <div class="aloj-v2-obs-calendar">
        <div class="aloj-v2-obs-cal-head"><button type="button" class="aloj-v2-icon-btn" id="alojV2ObsPrev" aria-label="Mês anterior">${icon('chevronLeft')}</button><strong id="alojV2ObsCalLabel"></strong><button type="button" class="aloj-v2-icon-btn" id="alojV2ObsNext" aria-label="Próximo mês">${icon('chevronRight')}</button></div>
        <div id="alojV2ObsCalGrid" class="aloj-v2-obs-cal-grid"></div>
      </div>
    </div>
  </div></div>`;
}

export function renderObsCalendar(year, month, notesByDate, selectedDate) {
  const label = document.getElementById('alojV2ObsCalLabel');
  if (label) label.textContent = `${MONTHS[month]} de ${year}`;
  const grid = document.getElementById('alojV2ObsCalGrid');
  if (!grid) return;
  const first = new Date(year, month, 1);
  const startWeekday = first.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayIso = isoDate(new Date());
  const cells = [];
  for (let i = 0; i < startWeekday; i += 1) cells.push('<span class="aloj-v2-obs-cal-cell empty"></span>');
  for (let day = 1; day <= daysInMonth; day += 1) {
    const iso = `${year}-${pad2(month + 1)}-${pad2(day)}`;
    const count = (notesByDate[iso] || []).length;
    const classes = ['aloj-v2-obs-cal-cell'];
    if (iso === todayIso) classes.push('today');
    if (iso === selectedDate) classes.push('selected');
    if (count) classes.push('has-notes');
    cells.push(`<button type="button" class="${classes.join(' ')}" data-date="${iso}">${day}${count ? `<span class="aloj-v2-obs-cal-dot" title="${count} anotação(ões)"></span>` : ''}</button>`);
  }
  grid.innerHTML = `<div class="aloj-v2-obs-cal-weekdays">${WEEKDAYS.map((day) => `<span>${day}</span>`).join('')}</div><div class="aloj-v2-obs-cal-days">${cells.join('')}</div>`;
}

export function renderObsList(notes, selectedDate) {
  const list = document.getElementById('alojV2ObsList');
  if (!list) return;
  const sorted = [...notes].sort((a, b) => (b.data || '').localeCompare(a.data || '') || (b.criado_em || '').localeCompare(a.criado_em || ''));
  if (!sorted.length) { list.innerHTML = '<div class="aloj-v2-obs-empty">Nenhuma anotação registrada ainda.</div>'; return; }
  list.innerHTML = sorted.map((note) => `<div class="aloj-v2-obs-item${note.data === selectedDate ? ' selected' : ''}" data-id="${esc(note.id)}">
    <div class="aloj-v2-obs-item-head"><strong>${esc(brDate(note.data))}</strong><button type="button" class="aloj-v2-icon-btn aloj-v2-obs-delete" data-id="${esc(note.id)}" aria-label="Excluir anotação">${icon('trash')}</button></div>
    <p>${esc(note.texto)}</p>
    ${note.autor ? `<small>${esc(note.autor)}</small>` : ''}
  </div>`).join('');
}

// Cadastro de alojamentos no layout das listas do Frotas: cards que filtram, busca com chip e tabela fixa.
export function filtrarAlojamentos(rows, { filtro = 'todos', query = '' } = {}) {
  const q = normalizeText(query);
  return rows.filter((row) => {
    const ativo = String(row.status || 'ATIVO').toUpperCase() === 'ATIVO';
    if (filtro === 'ATIVO' && !ativo) return false;
    if (filtro === 'INATIVO' && ativo) return false;
    if (filtro === 'contrato' && !contractAlert(row)) return false;
    return !q || normalizeText([row.nome, row.responsavel, row.contato, row.cidade, row.uf, row.bairro, row.endereco_logradouro, row.endereco, row.agua_matricula, row.agua_titular, row.energia_matricula, row.energia_titular, row.internet_matricula, row.internet_titular, row.gas_titular, row.gas_forma_pagamento].join(' ')).includes(q);
  });
}

function cardsHtml(rows, filtro) {
  const ativos = rows.filter((row) => String(row.status || 'ATIVO').toUpperCase() === 'ATIVO').length;
  const inativos = rows.length - ativos;
  const contratos = rows.filter(contractAlert).length;
  const aluguel = rows.reduce((sum, row) => sum + Number(row.valor_aluguel || 0), 0);
  return cardFiltro({ filtro: 'todos', label: 'Todos', tone: 'blue', icone: 'total', valor: String(rows.length), ativo: filtro === 'todos' })
    + cardFiltro({ filtro: 'ATIVO', label: 'Ativos', tone: 'green', icone: 'ok', valor: String(ativos), ativo: filtro === 'ATIVO' })
    + (inativos || filtro === 'INATIVO' ? cardFiltro({ filtro: 'INATIVO', label: 'Inativos', tone: 'red', icone: 'erro', valor: String(inativos), ativo: filtro === 'INATIVO' }) : '')
    + cardFiltro({ filtro: 'contrato', label: 'Contratos a vencer', tone: 'amber', icone: 'alerta', valor: String(contratos), dica: 'Contratos que terminam nos próximos 60 dias', ativo: filtro === 'contrato' })
    + cardFiltro({ label: 'Aluguel mensal', tone: 'purple', icone: 'dinheiro', valor: money(aluguel), dica: 'Soma do aluguel de todos os cadastros' });
}

export function panelHtml() {
  return `<div class="aloj-v2-shell"><div id="alojCadPanel">
    <div class="fm-topo"><div class="fm-head-actions"><button type="button" class="fm-btn primary" id="alojV2New">+ Novo alojamento</button></div></div>
    <div class="fm-kpis" id="alojV2Kpis"></div>
    <div class="fm-card"><div class="fm-body">
      <div class="fm-bar"><div class="fm-search">${ICON.busca}<input id="alojV2Search" class="fm-input" placeholder="Buscar alojamento, cidade, responsável ou matrícula..." autocomplete="off"></div><span data-chip></span><span class="fm-count" id="alojV2Count">0 alojamento(s)</span></div>
      <div id="alojV2List"><div class="fm-empty">Carregando alojamentos...</div></div>
    </div></div>
  </div>${detailsModalHtml()}${modalHtml()}${obsModalHtml()}<div id="alojV2Toast" class="aloj-v2-toast"></div></div>`;
}

export function renderRows(state) {
  const list = document.getElementById('alojV2List');
  if (!list) return;
  const filtro = state.filtro || 'todos';
  const rows = filtrarAlojamentos(state.rows, { filtro, query: state.query });
  list.innerHTML = rows.length
    ? `<div class="fm-table-wrap"><table class="fm-table"><thead><tr><th>Alojamento</th><th>Responsável</th><th>Aluguel / estrutura</th><th>Serviços</th><th>Status</th><th>Ações</th></tr></thead><tbody>${rows.map(renderListRow).join('')}</tbody></table></div>`
    : '<div class="fm-empty">Nenhum alojamento encontrado. Revise a busca ou cadastre um novo alojamento.</div>';
  const kpis = document.getElementById('alojV2Kpis');
  if (kpis) kpis.innerHTML = cardsHtml(state.rows, filtro);
  const count = document.getElementById('alojV2Count');
  if (count) count.textContent = `${rows.length} alojamento(s)`;
  const painel = document.getElementById('alojCadPanel');
  if (painel) sincronizarCards(painel, filtro);
}
