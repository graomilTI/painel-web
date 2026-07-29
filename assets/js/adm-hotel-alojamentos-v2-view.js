import { esc, money, brDate, safeUrl, icon, fullAddress, contractAlert, normalizeText } from './adm-hotel-alojamentos-v2-helpers.js?v=20260721-obs1';

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

function compactService(label, value, kind) {
  const state = value === true ? 'Incluso' : value === false ? 'Pago' : '—';
  const className = value === true ? 'included' : value === false ? 'paid' : '';
  return `<span class="aloj-v2-mini-service ${className}" title="${esc(label)}: ${esc(state)}"><i class="${esc(kind)}"></i>${esc(label)} ${esc(state)}</span>`;
}

function renderListRow(row) {
  const status = String(row.status || 'ATIVO').toLowerCase();
  return `<div class="aloj-v2-list-row" data-id="${esc(row.id)}">
    <div class="aloj-v2-list-open-cell"><button type="button" class="aloj-v2-expand-btn" data-aloj-v2-action="details" data-id="${esc(row.id)}" aria-label="Abrir detalhes de ${esc(row.nome || 'alojamento')}" title="Abrir detalhes">+</button><button type="button" class="aloj-v2-icon-btn aloj-v2-obs-btn" data-aloj-v2-action="obs" data-id="${esc(row.id)}" aria-label="Observações de ${esc(row.nome || 'alojamento')}" title="Observações">${icon('notes')}</button><button type="button" class="aloj-v2-icon-btn aloj-v2-delete-btn" data-aloj-v2-action="delete" data-id="${esc(row.id)}" aria-label="Excluir ${esc(row.nome || 'alojamento')}" title="Excluir">${icon('trash')}</button></div>
    <div class="aloj-v2-list-identity">
      <div class="aloj-v2-list-home">${icon('home')}</div>
      <div class="aloj-v2-list-title"><strong>${esc(row.nome || 'Alojamento sem nome')}</strong><span>${esc(row.tipo || 'CASA')} · ${esc([row.cidade, row.uf].filter(Boolean).join('/') || 'Local não informado')}</span></div>
    </div>
    <div class="aloj-v2-list-cell" data-label="Responsável"><strong>${esc(row.responsavel || 'Não informado')}</strong><span>${esc(row.contato || '')}</span></div>
    <div class="aloj-v2-list-cell rent" data-label="Aluguel"><strong>${row.valor_aluguel ? money(row.valor_aluguel) : 'Não informado'}</strong><span>${esc(row.capacidade || 0)} vagas · ${esc(row.quartos || 0)} quartos</span></div>
    <div class="aloj-v2-list-services" data-label="Serviços">
      ${compactService('Água', row.agua_inclusa, 'water')}
      ${compactService('Luz', row.energia_inclusa, 'energy')}
      ${compactService('Internet', row.internet_inclusa, 'internet')}
    </div>
    <div class="aloj-v2-list-status"><span class="aloj-v2-status ${esc(status)}">${esc(row.status || 'ATIVO')}</span>${contractAlert(row) ? '<small>Contrato a vencer</small>' : ''}</div>
  </div>`;
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

export function panelHtml() {
  return `<div class="aloj-v2-shell"><section class="aloj-v2-head"><div><div class="aloj-v2-eyebrow">Hospedagem</div><h3>Controle de Alojamentos</h3><p>Visualize a lista e use o botão + para abrir as informações completas de cada alojamento.</p></div><div class="aloj-v2-head-actions"><div class="aloj-v2-search-wrap">${icon('search')}<input id="alojV2Search" class="aloj-v2-search" placeholder="Buscar alojamento, cidade ou responsável..."></div><button type="button" class="aloj-v2-primary" id="alojV2New">+ Novo alojamento</button></div></section>
    <section class="aloj-v2-kpis"><div class="aloj-v2-kpi"><span>Alojamentos</span><strong id="alojV2KpiTotal">0</strong></div><div class="aloj-v2-kpi accent"><span>Ativos</span><strong id="alojV2KpiAtivos">0</strong></div><div class="aloj-v2-kpi accent"><span>Aluguel mensal</span><strong id="alojV2KpiAluguel">R$ 0,00</strong></div><div class="aloj-v2-kpi"><span>Contratos a vencer</span><strong id="alojV2KpiContratos">0</strong></div></section>
    <section id="alojV2List" class="aloj-v2-list"><div class="aloj-v2-loading"><strong>Carregando alojamentos</strong>Aguarde a consulta da base.</div></section>${detailsModalHtml()}${modalHtml()}${obsModalHtml()}<div id="alojV2Toast" class="aloj-v2-toast"></div></div>`;
}

export function renderRows(state) {
  const list = document.getElementById('alojV2List');
  if (!list) return;
  const query = normalizeText(state.query);
  const rows = state.rows.filter((row) => !query || normalizeText([row.nome, row.responsavel, row.contato, row.cidade, row.uf, row.bairro, row.endereco_logradouro, row.endereco, row.agua_matricula, row.agua_titular, row.energia_matricula, row.energia_titular, row.internet_matricula, row.internet_titular, row.gas_titular, row.gas_forma_pagamento].join(' ')).includes(query));
  list.innerHTML = rows.length ? `<div class="aloj-v2-list-table"><div class="aloj-v2-list-head"><span></span><span>Alojamento</span><span>Responsável</span><span>Aluguel / estrutura</span><span>Serviços</span><span>Status</span></div><div class="aloj-v2-list-body">${rows.map(renderListRow).join('')}</div></div>` : '<div class="aloj-v2-empty"><strong>Nenhum alojamento encontrado</strong>Revise a busca ou cadastre um novo alojamento.</div>';
  const values = {
    alojV2KpiTotal: state.rows.length,
    alojV2KpiAtivos: state.rows.filter((row) => String(row.status || 'ATIVO') === 'ATIVO').length,
    alojV2KpiAluguel: money(state.rows.reduce((sum, row) => sum + Number(row.valor_aluguel || 0), 0)),
    alojV2KpiContratos: state.rows.filter(contractAlert).length
  };
  Object.entries(values).forEach(([id, value]) => { const el = document.getElementById(id); if (el) el.textContent = value; });
}
