export const STATUS = {
  PLANEJAMENTO: ['Ainda não iniciado', 'neutral'],
  BACKEND: ['Em construção', 'blue'],
  INTEGRACAO: ['Em construção', 'violet'],
  FRONTEND: ['Em construção', 'cyan'],
  VALIDACAO: ['Em testes', 'amber'],
  AGUARDANDO: ['Aguardando definição', 'orange'],
  CONCLUIDO: ['Pronto', 'green'],
  PAUSADO: ['Pausado', 'red'],
};

export const PRIORIDADES = {
  BAIXA: ['Baixa', 'neutral'],
  MEDIA: ['Normal', 'blue'],
  ALTA: ['Importante', 'amber'],
  CRITICA: ['Atenção imediata', 'red'],
};

export const TIPOS = {
  NOVO_MODULO: 'Novo módulo',
  NOVA_TELA: 'Nova tela',
  MELHORIA: 'Melhoria',
  CORRECAO: 'Correção',
  INTEGRACAO: 'Integração',
  AUTOMACAO: 'Automação',
};

const PHASES = {
  NAO_INICIADO: { label: 'Ainda não iniciado', statuses: ['PLANEJAMENTO'], tone: 'neutral' },
  EM_CONSTRUCAO: { label: 'Em construção', statuses: ['BACKEND', 'INTEGRACAO', 'FRONTEND'], tone: 'blue' },
  EM_TESTES: { label: 'Em testes', statuses: ['VALIDACAO'], tone: 'amber' },
  AGUARDANDO: { label: 'Aguardando definição', statuses: ['AGUARDANDO'], tone: 'orange' },
  PRONTO: { label: 'Pronto', statuses: ['CONCLUIDO'], tone: 'green' },
  PAUSADO: { label: 'Pausado', statuses: ['PAUSADO'], tone: 'red' },
};

export const esc = (value) => String(value ?? '').replace(
  /[&<>"']/g,
  (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]),
);

export const norm = (value) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .trim()
  .toLowerCase();

export const clamp = (value) => Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
export const inputDate = (value) => value ? String(value).slice(0, 10) : '';

export const dateBR = (value, time = false) => {
  if (!value) return 'Não informado';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'Não informado'
    : new Intl.DateTimeFormat(
        'pt-BR',
        time ? { dateStyle: 'short', timeStyle: 'short' } : { dateStyle: 'short' },
      ).format(date);
};

export const late = (item) => Boolean(
  item?.previsao_conclusao
  && !['CONCLUIDO', 'PAUSADO'].includes(item.status)
  && new Date(`${item.previsao_conclusao}T23:59:59`) < new Date(),
);

function options(map) {
  return Object.entries(map)
    .map(([value, meta]) => `<option value="${value}">${esc(Array.isArray(meta) ? meta[0] : meta)}</option>`)
    .join('');
}

function phaseOptions() {
  return Object.entries(PHASES)
    .map(([value, phase]) => `<option value="${value}">${esc(phase.label)}</option>`)
    .join('');
}

function phaseFor(item) {
  return Object.values(PHASES).find((phase) => phase.statuses.includes(item?.status))
    || { label: 'Em andamento', tone: 'blue', statuses: [] };
}

function progressMessage(item) {
  const progress = clamp(item?.progresso);
  if (item?.status === 'CONCLUIDO') return 'Pronto para uso';
  if (item?.status === 'PAUSADO') return 'Trabalho pausado';
  if (item?.status === 'AGUARDANDO') return 'Depende de uma definição';
  if (item?.status === 'VALIDACAO') return 'Últimos testes antes da entrega';
  if (progress >= 80) return 'Quase pronto';
  if (progress >= 50) return 'Mais da metade concluída';
  if (progress >= 20) return 'Construção em andamento';
  return 'Trabalho iniciado';
}

function formModal() {
  return `<div class="dv-modal" data-modal="form"><div class="dv-dialog">
    <div class="dv-dialog-head"><div><div class="dv-eye">Cadastro da TI</div><h3 data-form-title>Novo desenvolvimento</h3></div><button class="dv-btn" data-close="form">Fechar</button></div>
    <form class="dv-form" data-form><input type="hidden" name="id"><div class="dv-form-grid">
      <div class="dv-field dv-span2"><label>Nome do trabalho *</label><input class="dv-input" name="titulo" required maxlength="160"></div>
      <div class="dv-field"><label>Tipo</label><select class="dv-select" name="tipo">${options(TIPOS)}</select></div>
      <div class="dv-field"><label>Área do painel *</label><input class="dv-input" name="modulo" required maxlength="100"></div>
      <div class="dv-field"><label>Tela ou janela</label><input class="dv-input" name="submenu" maxlength="120"></div>
      <div class="dv-field"><label>Responsável</label><input class="dv-input" name="responsavel" maxlength="120"></div>
      <div class="dv-field"><label>Etapa atual</label><select class="dv-select" name="status">${options(STATUS)}</select></div>
      <div class="dv-field"><label>Importância</label><select class="dv-select" name="prioridade">${options(PRIORIDADES)}</select></div>
      <div class="dv-field"><label>Quanto já está pronto?</label><div class="dv-range"><input type="range" min="0" max="100" name="range"><input class="dv-input" type="number" min="0" max="100" name="progresso"></div></div>
      <div class="dv-field"><label>Data de início</label><input class="dv-input" type="date" name="data_inicio"></div>
      <div class="dv-field"><label>Previsão de entrega</label><input class="dv-input" type="date" name="previsao_conclusao"></div><div></div>
      <div class="dv-field dv-span3"><label>O que está sendo feito? *</label><textarea class="dv-textarea" name="descricao" required></textarea></div>
      <div class="dv-field dv-span3"><label>O que falta para terminar?</label><textarea class="dv-textarea" name="proxima_etapa"></textarea></div>
      <div class="dv-field dv-span3"><label>Existe alguma trava ou dependência?</label><textarea class="dv-textarea" name="impedimentos"></textarea></div>
      <div class="dv-field dv-span3"><label>Resumo desta atualização</label><input class="dv-input" name="nota" maxlength="300" placeholder="Ex.: Tela concluída e liberada para testes"></div>
    </div><div class="dv-form-actions"><button type="button" class="dv-btn dv-danger" data-action="archive" hidden>Arquivar</button><button type="button" class="dv-btn" data-close="form">Cancelar</button><button class="dv-btn dv-primary">Salvar</button></div></form>
  </div></div>`;
}

function progressModal() {
  return `<div class="dv-modal" data-modal="progress"><div class="dv-dialog dv-dialog-small">
    <div class="dv-dialog-head"><div><div class="dv-eye">Atualização rápida</div><h3>Como está este trabalho agora?</h3></div><button class="dv-btn" data-close="progress">Fechar</button></div>
    <form class="dv-form" data-progress><input type="hidden" name="id"><div class="dv-form-grid">
      <div class="dv-field"><label>Etapa atual</label><select class="dv-select" name="status">${options(STATUS)}</select></div>
      <div class="dv-field dv-span2"><label>Quanto já está pronto?</label><div class="dv-range"><input type="range" min="0" max="100" name="range"><input class="dv-input" type="number" min="0" max="100" name="progresso"></div></div>
      <div class="dv-field dv-span3"><label>O que mudou desde a última atualização? *</label><textarea class="dv-textarea" name="nota" required></textarea></div>
      <div class="dv-field dv-span3"><label>O que falta para terminar?</label><textarea class="dv-textarea" name="proxima_etapa"></textarea></div>
      <div class="dv-field dv-span3"><label>Existe alguma trava ou dependência?</label><textarea class="dv-textarea" name="impedimentos"></textarea></div>
    </div><div class="dv-form-actions"><button type="button" class="dv-btn" data-close="progress">Cancelar</button><button class="dv-btn dv-primary">Registrar atualização</button></div></form>
  </div></div>`;
}

export function renderBase(content, canEdit) {
  content.innerHTML = `<div class="dv">
    <section class="dv-hero">
      <div>
        <div class="dv-eye">Diretoria · visão simples</div>
        <h2>O que está sendo melhorado no painel</h2>
        <p>Veja de forma rápida o que já ficou pronto, o que ainda está sendo feito, o que falta e se existe alguma dificuldade atrasando a entrega.</p>
      </div>
      <div class="dv-actions">
        <button class="dv-btn" data-action="refresh">Atualizar informações</button>
        ${canEdit ? '<button class="dv-btn dv-primary" data-action="new">+ Registrar novo trabalho</button>' : ''}
      </div>
    </section>

    <section class="dv-kpis" data-kpis></section>

    <section class="dv-guide" aria-label="Como entender o progresso">
      <span><i data-tone="green"></i><b>Pronto:</b> já pode ser usado</span>
      <span><i data-tone="amber"></i><b>Em testes:</b> está nos ajustes finais</span>
      <span><i data-tone="blue"></i><b>Em construção:</b> a equipe ainda está desenvolvendo</span>
      <span><i data-tone="orange"></i><b>Aguardando:</b> depende de decisão ou informação</span>
    </section>

    <section class="dv-filters">
      <div class="dv-field"><label>Procurar um trabalho</label><input class="dv-input" data-filter="q" placeholder="Digite o nome ou a área"></div>
      <div class="dv-field"><label>Situação</label><select class="dv-select" data-filter="phase"><option value="">Todas</option>${phaseOptions()}</select></div>
      <div class="dv-field"><label>Área do painel</label><select class="dv-select" data-filter="modulo"><option value="">Todas</option></select></div>
      <div class="dv-field"><label>Mostrar</label><select class="dv-select" data-filter="ativos"><option value="true">Trabalhos atuais</option><option value="false">Arquivados</option><option value="all">Todos</option></select></div>
    </section>

    <section class="dv-work">
      <div class="dv-panel">
        <div class="dv-head"><div><h3>Trabalhos registrados</h3><p>Clique em um item para entender o andamento.</p></div><span class="dv-count" data-count>0</span></div>
        <div class="dv-list" data-list></div>
      </div>
      <div class="dv-panel dv-detail" data-detail></div>
    </section>
  </div>${formModal()}${progressModal()}`;
}

export function applyModules(content, items, current = '') {
  const modules = [...new Set(items.map((item) => item.modulo).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const select = content.querySelector('[data-filter="modulo"]');
  select.innerHTML = '<option value="">Todas</option>'
    + modules.map((module) => `<option value="${esc(module)}">${esc(module)}</option>`).join('');
  select.value = current;
}

export function filterItems(items, filters) {
  return items
    .filter((item) => {
      const haystack = norm([item.titulo, item.modulo, item.submenu, item.responsavel, item.descricao].join(' '));
      const phase = filters.phase ? PHASES[filters.phase] : null;
      return (!filters.q || haystack.includes(norm(filters.q)))
        && (!filters.status || item.status === filters.status)
        && (!phase || phase.statuses.includes(item.status))
        && (!filters.modulo || item.modulo === filters.modulo)
        && (!filters.prioridade || item.prioridade === filters.prioridade)
        && (filters.ativos === 'all' || String(item.ativo) === filters.ativos);
    })
    .sort((a, b) => Number(b.ativo) - Number(a.ativo)
      || Number(a.ordem || 100) - Number(b.ordem || 100)
      || String(b.updated_at).localeCompare(String(a.updated_at)));
}

export function renderKpis(content, items) {
  const active = items.filter((item) => item.ativo);
  const ready = active.filter((item) => item.status === 'CONCLUIDO');
  const doing = active.filter((item) => !['CONCLUIDO', 'PAUSADO'].includes(item.status));
  const attention = active.filter((item) => (
    late(item)
    || item.status === 'AGUARDANDO'
    || (item.prioridade === 'CRITICA' && item.status !== 'CONCLUIDO')
  ));
  const average = doing.length
    ? Math.round(doing.reduce((sum, item) => sum + clamp(item.progresso), 0) / doing.length)
    : 100;

  const data = [
    ['Já estão prontos', ready.length, 'entregas concluídas'],
    ['Ainda em andamento', doing.length, 'trabalhos sendo feitos'],
    ['Avanço dos atuais', `${average}%`, doing.length ? 'média do que ainda falta concluir' : 'não há trabalhos pendentes'],
    ['Precisam de atenção', attention.length, 'atrasados ou aguardando definição'],
  ];

  content.querySelector('[data-kpis]').innerHTML = data.map(([label, value, help], index) => `
    <article class="dv-kpi" data-kind="${index}">
      <span>${label}</span>
      <b>${value}</b>
      <small>${help}</small>
    </article>
  `).join('');
}

export function renderList(content, rows, selected) {
  content.querySelector('[data-count]').textContent = rows.length;
  const list = content.querySelector('[data-list]');

  if (!rows.length) {
    list.innerHTML = '<div class="dv-empty">Nenhum trabalho encontrado com estes filtros.</div>';
    return;
  }

  list.innerHTML = rows.map((item) => {
    const phase = phaseFor(item);
    const progress = clamp(item.progresso);
    const isAttention = late(item) || item.status === 'AGUARDANDO';
    return `<article class="dv-item ${item.id === selected ? 'sel' : ''}" data-id="${item.id}" tabindex="0">
      <div class="dv-item-top">
        <div>
          <div class="dv-area">${esc(item.modulo)}${item.submenu ? ` · ${esc(item.submenu)}` : ''}</div>
          <div class="dv-title">${esc(item.titulo)}</div>
        </div>
        <span class="dv-status" data-tone="${phase.tone}">${esc(phase.label)}</span>
      </div>
      <div class="dv-progress-copy"><b>${progress}% concluído</b><span>${esc(progressMessage(item))}</span></div>
      <div class="dv-progress"><i style="width:${progress}%"></i></div>
      <div class="dv-footer ${isAttention ? 'dv-late' : ''}">
        <span>${item.previsao_conclusao ? `${late(item) ? 'Prazo vencido em ' : 'Previsão: '}${dateBR(item.previsao_conclusao)}` : 'Sem previsão definida'}</span>
        ${item.responsavel ? `<span>Responsável: ${esc(item.responsavel)}</span>` : ''}
      </div>
    </article>`;
  }).join('');
}

export function renderDetail(content, item, canEdit) {
  const box = content.querySelector('[data-detail]');

  if (!item) {
    box.innerHTML = '<div class="dv-empty">Escolha um trabalho ao lado para ver um resumo simples do andamento.</div>';
    return null;
  }

  const phase = phaseFor(item);
  const progress = clamp(item.progresso);
  const isAttention = late(item) || item.status === 'AGUARDANDO';
  const nextStep = item.status === 'CONCLUIDO'
    ? 'Nada pendente. Esta entrega já foi concluída.'
    : (item.proxima_etapa || 'O próximo passo ainda não foi informado.');
  const blocker = item.impedimentos || 'Não há nenhuma dificuldade registrada neste momento.';

  box.innerHTML = `<div class="dv-head">
    <div><h3>Resumo do andamento</h3><p>As informações mais importantes, sem termos técnicos.</p></div>
    ${canEdit ? '<div class="dv-actions"><button class="dv-btn" data-action="progress">Atualizar andamento</button><button class="dv-btn" data-action="edit">Editar cadastro</button></div>' : ''}
  </div>
  <div class="dv-body">
    <div class="dv-detail-top">
      <div>
        <span class="dv-status" data-tone="${phase.tone}">${esc(phase.label)}</span>
        <h3>${esc(item.titulo)}</h3>
        <p>${esc(item.modulo)}${item.submenu ? ` · ${esc(item.submenu)}` : ''}</p>
      </div>
      <div class="dv-percent"><b>${progress}%</b><span>${esc(progressMessage(item))}</span></div>
    </div>

    <div class="dv-progress dv-progress-large"><i style="width:${progress}%"></i></div>

    <div class="dv-grid">
      <div class="dv-fact"><span>Quem está cuidando</span><b>${esc(item.responsavel || 'Não definido')}</b></div>
      <div class="dv-fact"><span>Quando deve ficar pronto</span><b class="${isAttention ? 'dv-late' : ''}">${item.status === 'CONCLUIDO' ? `Concluído em ${dateBR(item.data_conclusao || item.updated_at)}` : dateBR(item.previsao_conclusao)}${late(item) ? ' · prazo vencido' : ''}</b></div>
      <div class="dv-fact"><span>Última atualização</span><b>${dateBR(item.updated_at, true)}</b></div>
    </div>

    <div class="dv-block">
      <h4>O que foi ou está sendo feito</h4>
      <p>${esc(item.descricao)}</p>
    </div>
    <div class="dv-block">
      <h4>O que falta para terminar</h4>
      <p>${esc(nextStep)}</p>
    </div>
    <div class="dv-block ${item.impedimentos ? 'dv-block-alert' : ''}">
      <h4>Existe algo atrasando ou impedindo?</h4>
      <p>${esc(blocker)}</p>
    </div>
    <div class="dv-block">
      <h4>Atualizações recentes</h4>
      <div class="dv-timeline" data-history><div class="dv-event"><p>Carregando atualizações…</p></div></div>
    </div>
  </div>`;

  return box.querySelector('[data-history]');
}

export function renderHistory(timeline, data, error) {
  if (!timeline) return;

  if (error) {
    timeline.innerHTML = '<p class="dv-error">Não foi possível carregar as atualizações.</p>';
    return;
  }

  if (!data?.length) {
    timeline.innerHTML = '<p class="dv-muted">Ainda não há atualizações registradas.</p>';
    return;
  }

  timeline.innerHTML = data.map((history) => `
    <div class="dv-event">
      <p>${esc(history.descricao)}</p>
      <small>${dateBR(history.created_at, true)}${history.progresso_novo != null ? ` · passou para ${history.progresso_novo}%` : ''}</small>
    </div>
  `).join('');
}

export function fillForm(content, item = null) {
  const form = content.querySelector('[data-form]');
  form.reset();

  const value = item || {
    tipo: 'MELHORIA',
    status: 'PLANEJAMENTO',
    prioridade: 'MEDIA',
    progresso: 0,
    data_inicio: new Date().toISOString().slice(0, 10),
  };

  ['id', 'titulo', 'tipo', 'prioridade', 'modulo', 'submenu', 'responsavel', 'status', 'descricao', 'proxima_etapa', 'impedimentos']
    .forEach((name) => {
      if (form.elements[name]) form.elements[name].value = value[name] ?? '';
    });

  form.elements.data_inicio.value = inputDate(value.data_inicio);
  form.elements.previsao_conclusao.value = inputDate(value.previsao_conclusao);
  form.elements.progresso.value = clamp(value.progresso);
  form.elements.range.value = clamp(value.progresso);
  form.elements.nota.value = '';

  content.querySelector('[data-form-title]').textContent = item ? 'Editar trabalho' : 'Registrar novo trabalho';
  form.querySelector('[data-action="archive"]').hidden = !item || !item.ativo;
}

export function fillProgress(content, item) {
  const form = content.querySelector('[data-progress]');
  form.reset();
  form.elements.id.value = item.id;
  form.elements.status.value = item.status;
  form.elements.progresso.value = clamp(item.progresso);
  form.elements.range.value = clamp(item.progresso);
  form.elements.proxima_etapa.value = item.proxima_etapa || '';
  form.elements.impedimentos.value = item.impedimentos || '';
}

export const openModal = (content, name) => content.querySelector(`[data-modal="${name}"]`)?.classList.add('open');
export const closeModal = (content, name) => content.querySelector(`[data-modal="${name}"]`)?.classList.remove('open');
