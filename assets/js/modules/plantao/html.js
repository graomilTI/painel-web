// Plantão (Início): HTML puro (recebe dados, devolve texto). A tela liga os eventos em tela.js.
import { esc } from '../../core/ui.js';
import {
  coberturaSetor, dataBR, dataCurta, horarioTexto, nomeDia, nomeDiaCurto, rotuloCurto, rotuloExtenso, rotuloSemana,
} from './regras.js?v=20261030-plantao1';

const SITUACAO = { completo: 'Completo', parcial: 'Falta um dia', vazio: 'Sem plantonista' };

function iniciais(nome) {
  const partes = String(nome || '').trim().split(/\s+/).filter(Boolean);
  if (!partes.length) return '?';
  return (partes[0][0] + (partes.length > 1 ? partes[partes.length - 1][0] : '')).toUpperCase();
}

// ── página ──────────────────────────────────────────────────────────────────
export function htmlShell() {
  return `
<div class="pg-shell">
  <div class="pg-hero">
    <div>
      <h2>Plantão de fim de semana</h2>
      <p>Escolha o fim de semana, informe quem fica de plantão em cada setor e gere a imagem de divulgação.</p>
    </div>
    <button class="pg-btn primary" type="button" data-pg-imagem>Gerar imagem de divulgação</button>
  </div>
  <div data-pg-aviso></div>
  <section class="pg-bloco">
    <div class="pg-bloco-titulo"><h3>1. Escolha o período</h3><small>Os pontos mostram, por setor, se o plantão já está completo.</small></div>
    <div data-pg-periodos></div>
  </section>
  <section class="pg-bloco">
    <div class="pg-bloco-titulo"><h3>2. Quem fica de plantão</h3><small data-pg-periodo-titulo></small></div>
    <div data-pg-setores></div>
  </section>
  <div class="pg-barra" data-pg-barra hidden></div>
</div>`;
}

export function htmlAviso({ semSetores, semEdicao, ehMaster }) {
  if (semSetores) {
    return '<div class="pg-aviso warn"><strong>Nenhum setor configurado.</strong> Cadastre os setores do plantão em Equipe › Plantão.</div>';
  }
  if (!semEdicao) return '';
  return `<div class="pg-aviso info"><strong>Você ainda não foi liberado para editar nenhum setor.</strong>
    Você pode ver a escala e gerar a imagem. Para editar, peça a quem administra o painel para liberar o seu setor em
    <b>Equipe › Plantão</b>${ehMaster ? ' (<a href="./equipe.html">abrir</a>)' : ''}.</div>`;
}

// ── período ─────────────────────────────────────────────────────────────────
export function htmlPeriodos({ periodos, ativoId, resumos, sabadoDaVez }) {
  const chips = periodos.map((p) => {
    const resumo = resumos.get(p.id);
    const pontos = (resumo?.itens || []).map((i) =>
      `<i class="${i.situacao}" title="${esc(`${i.setor}: ${SITUACAO[i.situacao]}`)}"></i>`).join('');
    const selo = p.tipo === 'fds' && p.id === sabadoDaVez ? '<em>Esta semana</em>' : '';
    return `<button type="button" class="pg-chip ${p.id === ativoId ? 'ativo' : ''} ${p.tipo === 'data' ? 'extra' : ''}" data-pg-periodo="${esc(p.id)}">
      <b>${esc(rotuloCurto(p))}</b>
      <small>${esc(rotuloSemana(p))}</small>
      <span class="pg-pontos">${pontos}</span>
      <span class="pg-contagem">${resumo ? `${resumo.completos}/${resumo.total}` : ''} ${selo}</span>
    </button>`;
  }).join('');
  return `<div class="pg-chips">${chips}</div>
    <div class="pg-chips-acoes">
      <button type="button" class="pg-btn ghost mini" data-pg-nova-data>+ Feriado ou outra data</button>
      <button type="button" class="pg-btn ghost mini" data-pg-mais-semanas>Mostrar mais semanas</button>
      <span class="pg-legenda"><i class="completo"></i> completo <i class="parcial"></i> falta um dia <i class="vazio"></i> sem plantonista</span>
    </div>`;
}

// ── setores ─────────────────────────────────────────────────────────────────
function htmlDias(e, periodo, editavel) {
  return periodo.dias.map((d) => {
    const ligado = e.dias.includes(d);
    return editavel
      ? `<button type="button" class="pg-dia ${ligado ? 'on' : ''}" data-pg-dia="${esc(d)}" aria-pressed="${ligado}">${esc(nomeDiaCurto(d))} ${esc(dataCurta(d))}</button>`
      : (ligado ? `<span class="pg-dia on fixo">${esc(nomeDiaCurto(d))} ${esc(dataCurta(d))}</span>` : '');
  }).join('');
}

export function resumoContato(e) {
  return [e.telefone, e.email, horarioTexto(e)].filter(Boolean).join(' · ') || 'Sem contato informado';
}

function htmlCampo(rotulo, campo, valor, tipo = 'text', extra = '') {
  return `<label>${esc(rotulo)}<input class="pg-input" type="${tipo}" data-pg-campo="${campo}" value="${esc(valor)}" ${extra}></label>`;
}

function htmlPlantonista(e, periodo, editavel, aberto, erros) {
  const detalhes = editavel ? `
      <div class="pg-detalhes" ${aberto ? '' : 'hidden'}>
        ${htmlCampo('Nome na imagem', 'apelido', e.apelido, 'text', 'maxlength="40"')}
        ${htmlCampo('Telefone', 'telefone', e.telefone, 'tel', 'inputmode="tel" placeholder="(00) 00000-0000"')}
        ${htmlCampo('E-mail', 'email', e.email, 'email', 'placeholder="opcional"')}
        <div class="pg-horas">
          ${htmlCampo('Entrada', 'hora_inicio', e.hora_inicio, 'time')}
          ${htmlCampo('Saída', 'hora_fim', e.hora_fim, 'time')}
          ${htmlCampo('Entrada 2', 'hora_inicio_2', e.hora_inicio_2, 'time')}
          ${htmlCampo('Saída 2', 'hora_fim_2', e.hora_fim_2, 'time')}
        </div>
      </div>` : '';
  return `
    <div class="pg-pessoa ${erros?.length ? 'erro' : ''}" data-pg-uid="${esc(e.uid)}">
      <div class="pg-pessoa-topo">
        <span class="pg-avatar">${esc(iniciais(e.nome))}</span>
        <div class="pg-pessoa-id">
          <strong>${esc(e.nome)}</strong>
          <small data-pg-resumo>${esc(resumoContato(e))}</small>
        </div>
        <div class="pg-dias">${htmlDias(e, periodo, editavel)}</div>
        ${editavel ? `<button type="button" class="pg-icone" data-pg-acao="detalhes" title="Contato e horário" aria-expanded="${aberto}">✎</button>
        <button type="button" class="pg-icone perigo" data-pg-acao="remover" title="Tirar do plantão">×</button>` : ''}
      </div>
      ${detalhes}
      ${erros?.length ? `<div class="pg-erros">${erros.map((m) => `<span>${esc(m)}</span>`).join('')}</div>` : ''}
    </div>`;
}

export function htmlCobertura(entradas, periodo) {
  const c = coberturaSetor(entradas, periodo);
  const rotulo = c.situacao === 'completo'
    ? periodo.dias.map((d) => `${nomeDiaCurto(d)} ✓`).join(' · ')
    : c.situacao === 'vazio' ? 'Ninguém escalado ainda' : `Falta ${c.faltam.map((d) => nomeDia(d)).join(' e ')}`;
  return `<span class="pg-cobertura ${c.situacao}">${esc(rotulo)}</span>`;
}

export function htmlSetor({ setor, entradas, periodo, podeEditar, abertos, erros, sujo, rapidos }) {
  const lista = entradas.length
    ? entradas.map((e) => htmlPlantonista(e, periodo, podeEditar, abertos.has(e.uid), erros?.[e.uid])).join('')
    : `<div class="pg-vazio">${podeEditar ? 'Ninguém escalado neste setor. Adicione o plantonista abaixo.' : 'Nenhum plantonista informado.'}</div>`;
  const adicionar = podeEditar ? `
      <div class="pg-add">
        <div class="pg-add-campo">
          <input class="pg-input" type="search" data-pg-busca autocomplete="off" placeholder="+ Adicionar plantonista: digite o nome" aria-label="Adicionar plantonista do setor ${esc(setor)}">
          <div class="pg-sugestoes" data-pg-sugestoes hidden></div>
        </div>
        ${rapidos.length ? `<div class="pg-rapidos"><span>Costumam ficar:</span>${rapidos.map((c) =>
    `<button type="button" class="pg-rapido" data-pg-rapido="${esc(c.colaborador_key)}">+ ${esc(c.nome.split(/\s+/)[0])}</button>`).join('')}</div>` : ''}
      </div>` : '';
  return `
    <article class="pg-setor ${podeEditar ? 'editavel' : 'leitura'} ${sujo ? 'sujo' : ''}" data-pg-setor="${esc(setor)}">
      <header class="pg-setor-topo">
        <div class="pg-setor-nome"><h4>${esc(setor)}</h4>${htmlCobertura(entradas, periodo)}</div>
        ${podeEditar ? `<div class="pg-setor-acoes">
          <button type="button" class="pg-btn ghost mini" data-pg-acao="copiar-de">Copiar de outro período</button>
          <button type="button" class="pg-btn ghost mini" data-pg-acao="repetir" ${entradas.length ? '' : 'disabled'}>Repetir nos próximos</button>
        </div>` : '<span class="pg-badge">somente leitura</span>'}
      </header>
      <div class="pg-lista">${lista}</div>
      ${adicionar}
    </article>`;
}

export function htmlSugestoes(encontrados, termo) {
  const itens = encontrados.map((c) => `<button type="button" class="pg-sug" data-pg-escolher="${esc(c.colaborador_key)}">
      <strong>${esc(c.nome)}</strong><small>${esc([c.telefone, c.email].filter(Boolean).join(' · ') || 'sem contato cadastrado')}</small></button>`).join('');
  const manual = String(termo || '').trim().length >= 2
    ? `<button type="button" class="pg-sug manual" data-pg-manual="${esc(String(termo).trim())}"><strong>Adicionar “${esc(String(termo).trim())}” sem cadastro</strong><small>Para quem não está na base de colaboradores</small></button>`
    : '';
  return itens || manual ? itens + manual : '<div class="pg-sug vazio">Nenhum colaborador encontrado.</div>';
}

export function htmlBarra({ sujos, salvando }) {
  const n = sujos.length;
  return `<div class="pg-barra-in">
    <span><b>${n}</b> ${n === 1 ? 'setor com alteração' : 'setores com alterações'}: ${esc(sujos.join(', '))}</span>
    <div>
      <button type="button" class="pg-btn ghost" data-pg-descartar ${salvando ? 'disabled' : ''}>Descartar</button>
      <button type="button" class="pg-btn primary" data-pg-salvar ${salvando ? 'disabled' : ''}>${salvando ? 'Salvando…' : 'Salvar plantão'}</button>
    </div>
  </div>`;
}

// ── janelas ─────────────────────────────────────────────────────────────────
function cabecalhoJanela(titulo, subtitulo) {
  return `<div class="pg-jan-topo"><div><h3>${esc(titulo)}</h3>${subtitulo ? `<p>${esc(subtitulo)}</p>` : ''}</div>
    <button type="button" class="pg-fechar" data-pg-fechar aria-label="Fechar">✕</button></div>`;
}

export function htmlNovaData() {
  return `<div class="pg-jan">${cabecalhoJanela('Feriado ou outra data', 'Para dias fora do sábado e domingo.')}
    <div class="pg-jan-corpo">
      <label>Data<input class="pg-input" type="date" data-pg-nd-data></label>
      <label>Nome (opcional)<input class="pg-input" type="text" data-pg-nd-titulo maxlength="60" placeholder="Ex.: Proclamação da República"></label>
      <div class="pg-jan-acoes"><button type="button" class="pg-btn ghost" data-pg-fechar>Cancelar</button><button type="button" class="pg-btn primary" data-pg-nd-ok>Abrir esta data</button></div>
    </div></div>`;
}

export function htmlCopiarDe({ setor, opcoes }) {
  const lista = opcoes.length ? opcoes.map((o) => `<button type="button" class="pg-opcao" data-pg-fonte="${esc(o.periodo.id)}">
      <b>${esc(rotuloCurto(o.periodo))}</b><span>${esc(o.nomes.join(', '))}</span></button>`).join('')
    : '<div class="pg-vazio">Nenhum outro período tem plantão deste setor.</div>';
  return `<div class="pg-jan">${cabecalhoJanela(`Copiar plantão: ${setor}`, 'Escolha de onde copiar. Sábado vai para sábado e domingo para domingo.')}
    <div class="pg-jan-corpo"><div class="pg-opcoes">${lista}</div></div></div>`;
}

export function htmlRepetir({ setor, opcoes }) {
  const lista = opcoes.map((o) => `<label class="pg-opcao check"><input type="checkbox" data-pg-alvo="${esc(o.periodo.id)}">
      <b>${esc(rotuloCurto(o.periodo))}</b><span>${o.temPlantao ? 'já tem plantão, será substituído' : 'vazio'}</span></label>`).join('');
  return `<div class="pg-jan">${cabecalhoJanela(`Repetir nos próximos: ${setor}`, 'Marque os períodos que devem ter os mesmos plantonistas e horários deste.')}
    <div class="pg-jan-corpo"><div class="pg-opcoes">${lista || '<div class="pg-vazio">Não há outros períodos.</div>'}</div>
      <div class="pg-jan-acoes"><button type="button" class="pg-btn ghost" data-pg-fechar>Cancelar</button><button type="button" class="pg-btn primary" data-pg-repetir-ok>Copiar e salvar</button></div>
    </div></div>`;
}

export function htmlImagem({ periodo, setores, formatos, formato, selecionados, mostrarTelefone, mostrarEmail, faltas, podeCopiar, podeCompartilhar }) {
  const segmentos = Object.entries(formatos).map(([id, f]) =>
    `<button type="button" class="pg-seg ${id === formato ? 'on' : ''}" data-pg-formato="${id}">${esc(f.rotulo)}</button>`).join('');
  const chips = setores.map((s) => `<label class="pg-marca ${s.temDados ? '' : 'sem'}"><input type="checkbox" data-pg-img-setor="${esc(s.setor)}" ${selecionados.has(s.setor) ? 'checked' : ''} ${s.temDados ? '' : 'disabled'}>${esc(s.setor)}</label>`).join('');
  return `<div class="pg-jan larga">${cabecalhoJanela('Imagem de divulgação', rotuloExtenso(periodo))}
    <div class="pg-jan-corpo">
      <div class="pg-img-opcoes">
        <div><span class="pg-rotulo">Formato</span><div class="pg-seg-grupo">${segmentos}</div></div>
        <div><span class="pg-rotulo">Setores na imagem</span><div class="pg-marcas">${chips}</div></div>
        <div><span class="pg-rotulo">Mostrar</span><div class="pg-marcas">
          <label class="pg-marca"><input type="checkbox" data-pg-img-tel ${mostrarTelefone ? 'checked' : ''}>Telefone</label>
          <label class="pg-marca"><input type="checkbox" data-pg-img-email ${mostrarEmail ? 'checked' : ''}>E-mail</label></div></div>
      </div>
      ${faltas.length ? `<div class="pg-aviso warn mini"><strong>Atenção:</strong> ${faltas.map((f) => `${esc(f.setor)} sem plantonista ${f.dias.map((d) => `${esc(nomeDia(d))} (${esc(dataBR(d))})`).join(' e ')}`).join('; ')}.</div>` : ''}
      <div class="pg-previa"><canvas data-pg-canvas></canvas></div>
      <div class="pg-jan-acoes">
        <button type="button" class="pg-btn primary" data-pg-baixar>Baixar imagem</button>
        ${podeCopiar ? '<button type="button" class="pg-btn soft" data-pg-copiar>Copiar imagem</button>' : ''}
        ${podeCompartilhar ? '<button type="button" class="pg-btn soft" data-pg-compartilhar>Compartilhar</button>' : ''}
      </div>
    </div></div>`;
}
