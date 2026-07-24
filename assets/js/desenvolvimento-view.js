export const STATUS = {
  PLANEJAMENTO: ['Planejamento', 'neutral'], BACKEND: ['Backend', 'blue'],
  INTEGRACAO: ['Integração', 'violet'], FRONTEND: ['Frontend', 'cyan'],
  VALIDACAO: ['Validação', 'amber'], AGUARDANDO: ['Aguardando', 'orange'],
  CONCLUIDO: ['Concluído', 'green'], PAUSADO: ['Pausado', 'red'],
};
export const PRIORIDADES = {
  BAIXA: ['Baixa', 'neutral'], MEDIA: ['Média', 'blue'],
  ALTA: ['Alta', 'amber'], CRITICA: ['Crítica', 'red'],
};
export const TIPOS = {
  NOVO_MODULO: 'Novo módulo', NOVA_TELA: 'Nova tela', MELHORIA: 'Melhoria',
  CORRECAO: 'Correção', INTEGRACAO: 'Integração', AUTOMACAO: 'Automação',
};

export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;' }[c]));
export const norm = (v) => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
export const clamp = (v) => Math.max(0, Math.min(100, Math.round(Number(v) || 0)));
export const inputDate = (v) => v ? String(v).slice(0, 10) : '';
export const dateBR = (v, time = false) => {
  if (!v) return '—';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '—' : new Intl.DateTimeFormat('pt-BR', time ? { dateStyle:'short', timeStyle:'short' } : { dateStyle:'short' }).format(d);
};
export const late = (i) => Boolean(i?.previsao_conclusao && !['CONCLUIDO','PAUSADO'].includes(i.status) && new Date(`${i.previsao_conclusao}T23:59:59`) < new Date());

function options(map) {
  return Object.entries(map).map(([v,m]) => `<option value="${v}">${esc(Array.isArray(m) ? m[0] : m)}</option>`).join('');
}

function formModal() {
  return `<div class="dv-modal" data-modal="form"><div class="dv-dialog">
    <div class="dv-dialog-head"><div><div class="dv-eye">Cadastro</div><h3 data-form-title>Novo desenvolvimento</h3></div><button class="dv-btn" data-close="form">Fechar</button></div>
    <form class="dv-form" data-form><input type="hidden" name="id"><div class="dv-form-grid">
      <div class="dv-field dv-span2"><label>Título *</label><input class="dv-input" name="titulo" required maxlength="160"></div>
      <div class="dv-field"><label>Tipo</label><select class="dv-select" name="tipo">${options(TIPOS)}</select></div>
      <div class="dv-field"><label>Módulo *</label><input class="dv-input" name="modulo" required maxlength="100"></div>
      <div class="dv-field"><label>Submenu/janela</label><input class="dv-input" name="submenu" maxlength="120"></div>
      <div class="dv-field"><label>Responsável</label><input class="dv-input" name="responsavel" maxlength="120"></div>
      <div class="dv-field"><label>Status</label><select class="dv-select" name="status">${options(STATUS)}</select></div>
      <div class="dv-field"><label>Prioridade</label><select class="dv-select" name="prioridade">${options(PRIORIDADES)}</select></div>
      <div class="dv-field"><label>Progresso</label><div class="dv-range"><input type="range" min="0" max="100" name="range"><input class="dv-input" type="number" min="0" max="100" name="progresso"></div></div>
      <div class="dv-field"><label>Início</label><input class="dv-input" type="date" name="data_inicio"></div>
      <div class="dv-field"><label>Previsão</label><input class="dv-input" type="date" name="previsao_conclusao"></div><div></div>
      <div class="dv-field dv-span3"><label>Objetivo/escopo *</label><textarea class="dv-textarea" name="descricao" required></textarea></div>
      <div class="dv-field dv-span3"><label>Próxima etapa</label><textarea class="dv-textarea" name="proxima_etapa"></textarea></div>
      <div class="dv-field dv-span3"><label>Impedimentos</label><textarea class="dv-textarea" name="impedimentos"></textarea></div>
      <div class="dv-field dv-span3"><label>Nota desta atualização</label><input class="dv-input" name="nota" maxlength="300" placeholder="Ex.: Estrutura do backend concluída"></div>
    </div><div class="dv-form-actions"><button type="button" class="dv-btn dv-danger" data-action="archive" hidden>Arquivar</button><button type="button" class="dv-btn" data-close="form">Cancelar</button><button class="dv-btn dv-primary">Salvar</button></div></form>
  </div></div>`;
}

function progressModal() {
  return `<div class="dv-modal" data-modal="progress"><div class="dv-dialog dv-dialog-small">
    <div class="dv-dialog-head"><div><div class="dv-eye">Atualização rápida</div><h3>Registrar progresso</h3></div><button class="dv-btn" data-close="progress">Fechar</button></div>
    <form class="dv-form" data-progress><input type="hidden" name="id"><div class="dv-form-grid">
      <div class="dv-field"><label>Status</label><select class="dv-select" name="status">${options(STATUS)}</select></div>
      <div class="dv-field dv-span2"><label>Progresso</label><div class="dv-range"><input type="range" min="0" max="100" name="range"><input class="dv-input" type="number" min="0" max="100" name="progresso"></div></div>
      <div class="dv-field dv-span3"><label>O que mudou? *</label><textarea class="dv-textarea" name="nota" required></textarea></div>
      <div class="dv-field dv-span3"><label>Próxima etapa</label><textarea class="dv-textarea" name="proxima_etapa"></textarea></div>
      <div class="dv-field dv-span3"><label>Impedimentos</label><textarea class="dv-textarea" name="impedimentos"></textarea></div>
    </div><div class="dv-form-actions"><button type="button" class="dv-btn" data-close="progress">Cancelar</button><button class="dv-btn dv-primary">Registrar</button></div></form>
  </div></div>`;
}

export function renderBase(content, canEdit) {
  content.innerHTML = `<div class="dv">
    <section class="dv-hero"><div><div class="dv-eye">Diretoria · Transparência de execução</div><h2>Desenvolvimento do painel</h2><p>Acompanhe módulos, telas, integrações, automações e melhorias em construção, com percentual, prazo, próxima etapa e impedimentos.</p></div><div class="dv-actions"><button class="dv-btn" data-action="refresh">Atualizar</button>${canEdit?'<button class="dv-btn dv-primary" data-action="new">+ Novo desenvolvimento</button>':''}</div></section>
    <section class="dv-kpis" data-kpis></section>
    <section class="dv-filters">
      <div class="dv-field"><label>Buscar</label><input class="dv-input" data-filter="q" placeholder="Título, módulo, responsável ou descrição"></div>
      <div class="dv-field"><label>Status</label><select class="dv-select" data-filter="status"><option value="">Todos</option>${options(STATUS)}</select></div>
      <div class="dv-field"><label>Módulo</label><select class="dv-select" data-filter="modulo"><option value="">Todos</option></select></div>
      <div class="dv-field"><label>Prioridade</label><select class="dv-select" data-filter="prioridade"><option value="">Todas</option>${options(PRIORIDADES)}</select></div>
      <div class="dv-field"><label>Exibição</label><select class="dv-select" data-filter="ativos"><option value="true">Ativos</option><option value="false">Arquivados</option><option value="all">Todos</option></select></div>
    </section>
    <section class="dv-work"><div class="dv-panel"><div class="dv-head"><div><h3>Entregas e melhorias</h3><p>Selecione um item para ver o detalhamento.</p></div><span class="dv-count" data-count>0</span></div><div class="dv-list" data-list></div></div><div class="dv-panel dv-detail" data-detail></div></section>
  </div>${formModal()}${progressModal()}`;
}

export function applyModules(content, items, current = '') {
  const modules = [...new Set(items.map((i) => i.modulo).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'pt-BR'));
  const select = content.querySelector('[data-filter="modulo"]');
  select.innerHTML = '<option value="">Todos</option>' + modules.map((m)=>`<option value="${esc(m)}">${esc(m)}</option>`).join('');
  select.value = current;
}

export function filterItems(items, f) {
  return items.filter((i) => {
    const hay = norm([i.titulo,i.modulo,i.submenu,i.responsavel,i.descricao].join(' '));
    return (!f.q || hay.includes(norm(f.q))) && (!f.status || i.status===f.status) && (!f.modulo || i.modulo===f.modulo) && (!f.prioridade || i.prioridade===f.prioridade) && (f.ativos==='all' || String(i.ativo)===f.ativos);
  }).sort((a,b)=>Number(b.ativo)-Number(a.ativo) || Number(a.ordem||100)-Number(b.ordem||100) || String(b.updated_at).localeCompare(String(a.updated_at)));
}

export function renderKpis(content, items) {
  const active=items.filter((i)=>i.ativo), doing=active.filter((i)=>!['CONCLUIDO','PAUSADO'].includes(i.status));
  const avg=doing.length?Math.round(doing.reduce((s,i)=>s+clamp(i.progresso),0)/doing.length):0;
  const data=[['Em andamento',doing.length,'itens ativos'],['Progresso médio',`${avg}%`,'dos itens em andamento'],['Concluídos',active.filter(i=>i.status==='CONCLUIDO').length,'entregas registradas'],['Críticos',active.filter(i=>i.prioridade==='CRITICA').length,'prioridade máxima'],['Atrasados',active.filter(late).length,'fora da previsão']];
  content.querySelector('[data-kpis]').innerHTML=data.map(([l,v,s])=>`<article class="dv-kpi"><span>${l}</span><b>${v}</b><small>${s}</small></article>`).join('');
}

export function renderList(content, rows, selected) {
  content.querySelector('[data-count]').textContent=rows.length;
  const list=content.querySelector('[data-list]');
  if(!rows.length){list.innerHTML='<div class="dv-empty">Nenhum desenvolvimento encontrado com estes filtros.</div>';return;}
  list.innerHTML=rows.map((i)=>{const st=STATUS[i.status]||[i.status,'neutral'],pr=PRIORIDADES[i.prioridade]||[i.prioridade,'neutral'];return `<article class="dv-item ${i.id===selected?'sel':''}" data-id="${i.id}" tabindex="0"><div class="dv-item-top"><div class="dv-title">${esc(i.titulo)}</div><div class="dv-tags"><span class="dv-tag" data-tone="${st[1]}">${esc(st[0])}</span><span class="dv-tag" data-tone="${pr[1]}">${esc(pr[0])}</span></div></div><div class="dv-meta">${esc(i.modulo)}${i.submenu?` · ${esc(i.submenu)}`:''}${i.responsavel?` · ${esc(i.responsavel)}`:''}</div><div class="dv-desc">${esc(i.descricao)}</div><div class="dv-progress-row"><div class="dv-progress"><i style="width:${clamp(i.progresso)}%"></i></div><b>${clamp(i.progresso)}%</b></div><div class="dv-meta ${late(i)?'dv-late':''}">${i.previsao_conclusao?`${late(i)?'Atrasado · ':''}previsão ${dateBR(i.previsao_conclusao)}`:'Sem previsão'} · atualizado ${dateBR(i.updated_at,true)}</div></article>`;}).join('');
}

export function renderDetail(content, item, canEdit) {
  const box=content.querySelector('[data-detail]');
  if(!item){box.innerHTML='<div class="dv-empty">Selecione um desenvolvimento para visualizar escopo, etapas, prazo e histórico.</div>';return null;}
  const st=STATUS[item.status]||[item.status,'neutral'],pr=PRIORIDADES[item.prioridade]||[item.prioridade,'neutral'];
  box.innerHTML=`<div class="dv-head"><div><h3>Detalhamento</h3><p>Visão executiva da entrega selecionada.</p></div>${canEdit?'<div class="dv-actions"><button class="dv-btn" data-action="progress">Atualizar progresso</button><button class="dv-btn" data-action="edit">Editar</button></div>':''}</div><div class="dv-body"><div class="dv-detail-top"><div><div class="dv-tags"><span class="dv-tag" data-tone="${st[1]}">${esc(st[0])}</span><span class="dv-tag" data-tone="${pr[1]}">${esc(pr[0])}</span><span class="dv-tag">${esc(TIPOS[item.tipo]||item.tipo)}</span></div><h3>${esc(item.titulo)}</h3><p>${esc(item.modulo)}${item.submenu?` · ${esc(item.submenu)}`:''}</p></div><div class="dv-big">${clamp(item.progresso)}%</div></div><div class="dv-progress-row"><div class="dv-progress"><i style="width:${clamp(item.progresso)}%"></i></div></div><div class="dv-grid"><div class="dv-fact"><span>Responsável</span><b>${esc(item.responsavel||'Não definido')}</b></div><div class="dv-fact"><span>Início</span><b>${dateBR(item.data_inicio)}</b></div><div class="dv-fact"><span>Previsão</span><b class="${late(item)?'dv-late':''}">${dateBR(item.previsao_conclusao)}${late(item)?' · atrasado':''}</b></div><div class="dv-fact"><span>Última atualização</span><b>${dateBR(item.updated_at,true)}</b></div></div><div class="dv-block"><h4>Objetivo e escopo</h4><p>${esc(item.descricao)}</p></div><div class="dv-block"><h4>Próxima etapa</h4><p>${esc(item.proxima_etapa||'Não informada.')}</p></div><div class="dv-block"><h4>Impedimentos</h4><p>${esc(item.impedimentos||'Nenhum impedimento registrado.')}</p></div><div class="dv-block"><h4>Linha do tempo</h4><div class="dv-timeline" data-history><div class="dv-event"><p>Carregando histórico…</p></div></div></div></div>`;
  return box.querySelector('[data-history]');
}

export function renderHistory(timeline, data, error) {
  if(!timeline)return;
  if(error) timeline.innerHTML='<p class="dv-error">Não foi possível carregar o histórico.</p>';
  else if(!data?.length) timeline.innerHTML='<p class="dv-muted">Ainda não há atualizações registradas.</p>';
  else timeline.innerHTML=data.map((h)=>`<div class="dv-event"><p>${esc(h.descricao)}</p><small>${esc(h.autor_nome||'Usuário')} · ${dateBR(h.created_at,true)}${h.progresso_novo!=null?` · ${h.progresso_novo}%`:''}</small></div>`).join('');
}

export function fillForm(content, item=null) {
  const f=content.querySelector('[data-form]');f.reset();
  const v=item||{tipo:'MELHORIA',status:'PLANEJAMENTO',prioridade:'MEDIA',progresso:0,data_inicio:new Date().toISOString().slice(0,10)};
  ['id','titulo','tipo','prioridade','modulo','submenu','responsavel','status','descricao','proxima_etapa','impedimentos'].forEach((n)=>{if(f.elements[n])f.elements[n].value=v[n]??'';});
  f.elements.data_inicio.value=inputDate(v.data_inicio);f.elements.previsao_conclusao.value=inputDate(v.previsao_conclusao);f.elements.progresso.value=clamp(v.progresso);f.elements.range.value=clamp(v.progresso);f.elements.nota.value='';
  content.querySelector('[data-form-title]').textContent=item?'Editar desenvolvimento':'Novo desenvolvimento';
  f.querySelector('[data-action="archive"]').hidden=!item||!item.ativo;
}

export function fillProgress(content,item){const f=content.querySelector('[data-progress]');f.reset();f.elements.id.value=item.id;f.elements.status.value=item.status;f.elements.progresso.value=clamp(item.progresso);f.elements.range.value=clamp(item.progresso);f.elements.proxima_etapa.value=item.proxima_etapa||'';f.elements.impedimentos.value=item.impedimentos||'';}
export const openModal=(content,name)=>content.querySelector(`[data-modal="${name}"]`)?.classList.add('open');
export const closeModal=(content,name)=>content.querySelector(`[data-modal="${name}"]`)?.classList.remove('open');
