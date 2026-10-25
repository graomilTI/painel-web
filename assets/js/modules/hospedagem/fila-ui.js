// Fila v3 da Hospedagem (ADM): colaboradores por status no layout das listas do Frotas (cards que filtram, busca com chip, tabela
// fixa e botões de ícone). Fábrica criarFila(ctx). O CSS vem de patrimonioLayoutFrotas.js (.fm-*); aqui só HTML e eventos.
import { ICON, aoClicarCard, cardFiltro, iconBtn, sincronizarCards } from '../../patrimonioLayoutFrotas.js?v=20261019-ordenar';
import { STATUS_ABERTOS, V3_LABELS, V3_VISUAL, contarPorStatus, elegiveisJuntos, filtrarFila, sugerirComposicao } from './service.js?v=20261024-hosp-acoes7';
import { pedirCampos } from './ui-comum.js?v=20261024-hosp-acoes7';

// Ícone de "agrupar" (duas pessoas): o kit de ícones do Frotas não tem um.
const ICONE_GRUPO = '<svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><circle cx="17" cy="9" r="2.5"/><path d="M17 14c2.5 0 4 2 4 5"/></svg>';

const iniciais = (nome) => String(nome || '').trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join('').toUpperCase() || '?';

export function criarFila(ctx) {
  const { state, repo, loadPainel, toast, esc, brDate, normalizeText, modalRoot } = ctx;

  // Colaboradores marcados nas caixinhas. Fica na fábrica (e não só no DOM) para a marcação sobreviver à busca, aos cards e ao recarregar.
  const selecionados = new Set();
  const itemPorId = (id) => state.v3Items.find((i) => i.item_id === id);
  const emAberto = (i) => !!i && STATUS_ABERTOS.includes(i.status_item);
  const selecionadosEmAberto = () => [...selecionados].map(itemPorId).filter(emAberto);

  // Quantos outros colaboradores em aberto podem ir junto com este (mesma solicitação, cidade e período): decide a cor do Agrupar.
  const podemJuntos = (i) => (emAberto(i) ? state.v3Items.filter((o) => o.item_id !== i.item_id && o.solicitacao_id === i.solicitacao_id && elegiveisJuntos(i, o)).length : 0);

  const filtrados = () => filtrarFila(state.v3Items, { status: state.v3Filtro, busca: state.v3Busca }, normalizeText, brDate);

  const linhaHtml = (i) => {
    const visual = V3_VISUAL[i.status_item] || {};
    const aberto = STATUS_ABERTOS.includes(i.status_item);
    const sexo = i.sexo === 'FEMININO' ? 'Feminino' : i.sexo === 'MASCULINO' ? 'Masculino' : 'Sexo pendente';
    const juntos = podemJuntos(i);
    return `<tr>
      <td><input type="checkbox" data-v3-select="${esc(i.item_id)}" ${aberto ? '' : 'disabled'} ${selecionados.has(i.item_id) ? 'checked' : ''} aria-label="Selecionar ${esc(i.nome_colaborador)}"></td>
      <td><div class="fm-person"><span class="fm-avatar">${esc(iniciais(i.nome_colaborador))}</span><div class="fm-cell"><b>${esc(i.nome_colaborador)}</b><span class="fm-prazo-dia">${esc(i.supervisao || 'Sem supervisão')} · ${esc(sexo)}</span></div></div></td>
      <td><div class="fm-cell"><b>${esc(i.cidade)}/${esc(i.uf)}</b></div></td>
      <td><div class="fm-cell">${brDate(i.data_checkin_prevista)}<span class="fm-prazo-dia">${esc(String(i.horario_chegada_previsto || '').slice(0, 5))} · ${i.quantidade_diarias_prevista} diária(s)</span></div></td>
      <td><div class="fm-cell"><span class="fm-badge ${visual.selo || ''}">${esc(V3_LABELS[i.status_item] || i.status_item)}</span>${i.hotel ? `<span class="fm-prazo-dia">${esc(i.hotel)} · ${esc(i.codigo_operacional || '')}</span>` : ''}</div></td>
      <td><div class="fm-actions">${aberto ? `${iconBtn('data-v3-cotar', i.item_id, 'anexo', 'Cotar com hotéis (gera o link)', 'doc')}${iconBtn('data-v3-agrupar', i.item_id, juntos ? 'termo' : 'danger', juntos ? `Agrupar: ${juntos} colaborador(es) podem ir junto (mesmo destino e período)` : 'Agrupar: ninguém mais no mesmo destino e período', ICONE_GRUPO)}${iconBtn('data-v3-reservar', i.item_id, 'termo', 'Reservar direto, sem cotação', 'calendario')}${iconBtn('data-v3-recusar', i.item_id, 'danger', 'Cancelar a solicitação', 'erro')}` : ''}${ctx.cotacao.acoesDoItem(i)}${i.status_item === 'RESERVADO' ? `${iconBtn('data-v3-extra', i.reserva_id, '', 'Despesa extra do hotel', 'alerta')}${iconBtn('data-v3-payment', i.reserva_id, 'termo', 'Pagamento do hotel', 'dinheiro')}` : ''}${i.status_item === 'CHECKOUT_PENDENTE' ? '<span class="fm-prazo-dia">Aguardando confirmações</span>' : ''}</div></td>
    </tr>`;
  };

  const avisoCheckoutHtml = (d) => `<div class="hosp-note">Hotel confirmou ${esc(d.decisao || 'checkout')} · <button class="btn btn-primary" data-v3-validate-checkout="${esc(d.id)}">Validar e concluir</button></div>`;

  const avisoAlteracaoHtml = (a) => `<div class="hosp-note">Alteração ${esc(a.tipo)} aguardando tratamento · ${brDate(a.solicitada_em)} ${['PRORROGACAO', 'CANCELAMENTO'].includes(a.tipo) && a.status === 'AGUARDANDO_ADM' ? `<button class="btn btn-primary" data-v3-handle-change="${esc(a.id)}">Enviar ao hotel</button>` : ''}${['MUDANCA_DATAS', 'MUDANCA_CIDADE'].includes(a.tipo) && a.status === 'AGUARDANDO_ADM' ? `<button class="btn btn-primary" data-v3-new-change-reservation="${esc(a.id)}">Criar nova reserva</button>` : ''}</div>`;

  const cardsHtml = () => {
    const contagem = contarPorStatus(state.v3Items);
    const total = Object.values(contagem).reduce((s, n) => s + n, 0);
    return cardFiltro({ filtro: 'todos', label: 'Todos', tone: 'blue', icone: 'total', valor: String(total), ativo: state.v3Filtro === 'todos' })
      + Object.keys(V3_LABELS).filter((s) => contagem[s] || state.v3Filtro === s)
        .map((s) => cardFiltro({ filtro: s, label: V3_LABELS[s], tone: V3_VISUAL[s].tone, icone: V3_VISUAL[s].icone, valor: String(contagem[s] || 0), ativo: state.v3Filtro === s })).join('');
  };

  const corpoHtml = (itens) => (itens.length
    ? itens.map(linhaHtml).join('')
    : '<tr><td colspan="6" class="fm-empty">Nenhum colaborador neste filtro.</td></tr>');

  const avisosHtml = () => `${state.v3Checkout.filter((d) => d.status === 'AGUARDANDO_ADM').map(avisoCheckoutHtml).join('')}${state.v3Changes.map(avisoAlteracaoHtml).join('')}`;

  const barraHtml = () => `<div class="fm-selbar" id="ahV3Acoes">
      <span class="fm-sel-info" id="ahV3SelInfo"></span>
      <div class="fm-sel-botoes">
        <button type="button" class="fm-btn soft" data-v3-bar="cotar" title="Gera o link de cotação para os hotéis">${ICON.doc} Cotar</button>
        <button type="button" class="fm-btn soft" data-v3-bar="agrupar" title="Marca quem pode ficar junto (mesmo destino e período)">${ICONE_GRUPO} Agrupar</button>
        <button type="button" class="fm-btn soft" data-v3-bar="reservar" title="Reserva direto, sem cotação">${ICON.calendario} Reservar</button>
        <button type="button" class="fm-btn soft fm-cancelar" data-v3-bar="cancelar" title="Cancela as solicitações marcadas">${ICON.erro} Cancelar</button>
      </div>
    </div>`;

  function render() {
    for (const id of [...selecionados]) if (!emAberto(itemPorId(id))) selecionados.delete(id);
    const itens = filtrados();
    return `<div id="ahV3Page">
      <div class="fm-kpis" id="ahV3Kpis">${cardsHtml()}</div>
      <div class="fm-card"><div class="fm-body">
        <div class="fm-bar"><div class="fm-search">${ICON.busca}<input class="fm-input" id="ahV3Busca" placeholder="Buscar por colaborador, cidade, supervisão, hotel, código ou data (dd/mm/aaaa)..." autocomplete="off" value="${esc(state.v3Busca)}"></div><span data-chip></span><span class="fm-count" id="ahV3Count">${itens.length} colaborador(es)</span></div>
        ${barraHtml()}
        <div id="ahV3Avisos">${avisosHtml()}</div>
        <div class="fm-table-wrap"><table class="fm-table"><thead><tr><th><input type="checkbox" data-v3-select-todos aria-label="Marcar todos os colaboradores em aberto desta lista"></th><th>Colaborador</th><th>Destino</th><th>Entrada</th><th>Status</th><th>Ações</th></tr></thead><tbody id="ahV3Corpo">${corpoHtml(itens)}</tbody></table></div>
      </div></div>
    </div>`;
  }

  // Resultado de uma RPC que só precisa de aviso e recarga do painel.
  async function executar(promessa, mensagemOk) {
    const { error } = await promessa;
    if (error) return toast(error.message, 'err');
    toast(mensagemOk, 'ok');
    await loadPainel();
  }

  // Cancela uma ou várias solicitações com o mesmo motivo (a RPC é a mesma "recusar item": avisa o gestor).
  async function cancelarItens(itens) {
    const lista = itens.filter(emAberto);
    if (!lista.length) return toast('Marque ao menos um colaborador em aberto.', 'err');
    const varios = lista.length > 1;
    const dados = await pedirCampos(ctx, {
      eyebrow: 'CANCELAMENTO', titulo: varios ? `Cancelar ${lista.length} solicitações` : 'Cancelar solicitação', textoOk: 'Cancelar solicitação',
      campos: [{ rotulo: 'Motivo do cancelamento', obrigatorio: true, linhas: 3, aviso: 'Informe o motivo do cancelamento.' }],
    });
    if (!dados) return;
    const falhas = [];
    for (const i of lista) {
      const { error } = await repo.recusarItem(i.item_id, dados[0]);
      if (error) falhas.push(`${i.nome_colaborador}: ${error.message}`);
      else selecionados.delete(i.item_id);
    }
    if (falhas.length) toast(`Não consegui cancelar ${falhas.length} de ${lista.length}. ${falhas[0]}`, 'err');
    else toast(varios ? `${lista.length} solicitações canceladas e gestor notificado.` : 'Solicitação cancelada e gestor notificado.', 'ok');
    await loadPainel();
  }

  // Quem vai junto numa cotação/reserva: mesma solicitação, cidade e período que se sobrepõe.
  const mesmoGrupo = (lista) => lista.every((i) => i.solicitacao_id === lista[0].solicitacao_id && elegiveisJuntos(lista[0], i));

  // Janela de agrupamento: lista todos os colaboradores em aberto que podem ir junto com o primeiro (mesma solicitação, cidade e período
  // que se cruza; as RPCs de cotação e reserva só aceitam uma solicitação por vez) e o usuário escolhe quem entra no grupo.
  function agrupar(board, base) {
    const ref = base.find(emAberto);
    if (!ref) return toast('Marque ao menos um colaborador em aberto para agrupar.', 'err');
    const candidatos = state.v3Items.filter((i) => i.solicitacao_id === ref.solicitacao_id && elegiveisJuntos(ref, i));
    if (candidatos.length < 2) return toast('Não há mais ninguém no mesmo destino e período para agrupar com este colaborador.', 'ok');
    const escolhidos = new Set([ref.item_id, ...selecionados].filter((id) => candidatos.some((c) => c.item_id === id)));
    const root = modalRoot();
    const sexo = (i) => (i.sexo === 'FEMININO' ? 'Feminino' : i.sexo === 'MASCULINO' ? 'Masculino' : 'Sexo pendente');
    root.innerHTML = `<div class="ah-overlay"><div class="ah-modal ah-reservar">
      <div class="ah-modal-head"><div><h3>Agrupar colaboradores</h3><p class="muted">${esc(ref.cidade)}/${esc(ref.uf)} · ${brDate(ref.data_checkin_prevista)} a ${brDate(ref.data_checkout_prevista)} · ${candidatos.length} podem ficar juntos</p></div><button class="ah-modal-x" data-agr-fechar type="button">✕</button></div>
      <div class="ah-modal-body">
        <label class="ah-cot-linha"><input type="checkbox" data-agr-todos> <span><b>Marcar todos</b></span></label>
        <div class="ah-cot-lista">${candidatos.map((i) => `<label class="ah-cot-linha"><input type="checkbox" data-agr-item value="${esc(i.item_id)}" ${escolhidos.has(i.item_id) ? 'checked' : ''}>
          <span><b>${esc(i.nome_colaborador)}</b><small>${brDate(i.data_checkin_prevista)}–${brDate(i.data_checkout_prevista)} · ${esc(sexo(i))} · ${esc(i.supervisao || 'Sem supervisão')} · ${esc(V3_LABELS[i.status_item] || i.status_item)}</small></span></label>`).join('')}</div>
        <p class="ah-note" id="agrResumo"></p>
        <p class="ah-error" id="agrErro"></p>
      </div>
      <div class="ah-modal-foot"><div class="ah-modal-foot-left"></div><div class="ah-modal-foot-left"><button class="btn btn-secondary" data-agr-fechar type="button">Cancelar</button><button class="btn btn-primary" id="agrConfirmar" type="button">Agrupar</button></div></div>
    </div></div>`;
    const caixas = () => [...root.querySelectorAll('[data-agr-item]')];
    const resumir = () => {
      const marcados = caixas().filter((c) => c.checked).map((c) => candidatos.find((i) => i.item_id === c.value));
      const composicao = sugerirComposicao(marcados).split('\n').filter(Boolean).join(' · ');
      root.querySelector('#agrResumo').textContent = marcados.length ? `${marcados.length} marcado(s)${composicao ? ` · sugestão de quartos: ${composicao}` : ''}` : 'Marque quem vai ficar junto.';
      root.querySelector('[data-agr-todos]').checked = marcados.length === candidatos.length;
      root.querySelector('#agrConfirmar').textContent = marcados.length ? `Agrupar ${marcados.length}` : 'Agrupar';
    };
    root.querySelectorAll('[data-agr-fechar]').forEach((b) => { b.onclick = () => { root.innerHTML = ''; }; });
    root.querySelector('[data-agr-todos]').onchange = (e) => { caixas().forEach((c) => { c.checked = e.target.checked; }); resumir(); };
    caixas().forEach((c) => { c.onchange = resumir; });
    resumir();
    root.querySelector('#agrConfirmar').onclick = () => {
      const ids = caixas().filter((c) => c.checked).map((c) => c.value);
      if (ids.length < 2) { root.querySelector('#agrErro').textContent = 'Marque ao menos 2 colaboradores para formar um grupo.'; return; }
      selecionados.clear();
      ids.forEach((id) => selecionados.add(id));
      root.innerHTML = '';
      // O grupo precisa aparecer na lista: se algum ficou fora do filtro/busca atual, a lista volta a mostrar todos.
      const visiveis = new Set(filtrados().map((i) => i.item_id));
      if (ids.some((id) => !visiveis.has(id))) {
        state.v3Filtro = 'todos';
        state.v3Busca = '';
        board.querySelector('#ahV3Busca').value = '';
      }
      atualizarLista(board);
      toast(`Grupo com ${ids.length} colaboradores marcado. Use Cotar ou Reservar para seguir.`, 'ok');
    };
  }

  // Cotar e reservar valem para quem foi marcado, desde que todos possam ficar juntos; o primeiro marcado é a referência.
  function agirNoGrupo(sel, abrir) {
    if (!sel.length) return toast('Marque ao menos um colaborador em aberto.', 'err');
    if (!mesmoGrupo(sel)) return toast('Os marcados precisam ser da mesma solicitação, cidade e período. Use "Agrupar" para marcar quem vai junto.', 'err');
    abrir(sel[0].item_id);
  }

  function atualizarBarra(board) {
    const sel = selecionadosEmAberto();
    const composicao = sel.length ? sugerirComposicao(sel).split('\n').filter(Boolean).join(' · ') : '';
    board.querySelector('#ahV3SelInfo').innerHTML = sel.length
      ? `<b>${sel.length}</b> colaborador(es) marcado(s)${composicao ? ` · sugestão de quartos: ${esc(composicao)}` : ''}`
      : 'Marque os colaboradores na lista para cotar, agrupar, reservar ou cancelar de uma vez.';
    board.querySelectorAll('[data-v3-bar]').forEach((b) => { b.disabled = !sel.length; });
    // Agrupar: verde quando há com quem agrupar o primeiro marcado, vermelho quando não há ninguém.
    const agrupar = board.querySelector('[data-v3-bar="agrupar"]');
    agrupar.classList.toggle('fm-agr-ok', sel.length > 0 && podemJuntos(sel[0]) > 0);
    agrupar.classList.toggle('fm-agr-sem', sel.length > 0 && podemJuntos(sel[0]) === 0);
    const todos = board.querySelector('[data-v3-select-todos]');
    if (todos) {
      const caixas = [...board.querySelectorAll('[data-v3-select]:not(:disabled)')];
      todos.checked = caixas.length > 0 && caixas.every((c) => c.checked);
      todos.indeterminate = !todos.checked && caixas.some((c) => c.checked);
    }
  }

  // Ações de cada linha e dos avisos: religadas sempre que a tabela é redesenhada (busca e cards só trocam o miolo).
  function ligarAcoes(raiz) {
    ctx.cotacao.ligar(raiz);
    raiz.querySelectorAll('[data-v3-reservar]').forEach((b) => { b.onclick = () => ctx.reserva.abrir(b.dataset.v3Reservar); });
    raiz.querySelectorAll('[data-v3-recusar]').forEach((b) => { b.onclick = () => cancelarItens([itemPorId(b.dataset.v3Recusar)]); });
    raiz.querySelectorAll('[data-v3-agrupar]').forEach((b) => { b.onclick = () => agrupar(document.getElementById('ahV3Page'), [itemPorId(b.dataset.v3Agrupar)]); });
    raiz.querySelectorAll('[data-v3-payment]').forEach((b) => { b.onclick = () => ctx.pagamento.abrirPagamento(b.dataset.v3Payment); });
    raiz.querySelectorAll('[data-v3-extra]').forEach((b) => { b.onclick = () => ctx.pagamento.abrirExtra(b.dataset.v3Extra); });
    raiz.querySelectorAll('[data-v3-validate-checkout]').forEach((b) => { b.onclick = () => executar(repo.validarCheckout(b.dataset.v3ValidateCheckout), 'Checkout validado.'); });
    raiz.querySelectorAll('[data-v3-handle-change]').forEach((b) => { b.onclick = () => executar(repo.tratarAlteracao(b.dataset.v3HandleChange), 'Alteração enviada ao hotel.'); });
    raiz.querySelectorAll('[data-v3-new-change-reservation]').forEach((b) => {
      b.onclick = async () => {
        const { data, error } = await repo.prepararNovaReservaAlteracao(b.dataset.v3NewChangeReservation);
        if (error) return toast(error.message, 'err');
        await loadPainel();
        ctx.reserva.abrir(data.item_id);
      };
    });
  }

  function atualizarLista(board) {
    const itens = filtrados();
    board.querySelector('#ahV3Kpis').innerHTML = cardsHtml();
    board.querySelector('#ahV3Corpo').innerHTML = corpoHtml(itens);
    board.querySelector('#ahV3Count').textContent = `${itens.length} colaborador(es)`;
    sincronizarCards(board, state.v3Filtro);
    ligarAcoes(board.querySelector('#ahV3Corpo'));
    atualizarBarra(board);
  }

  function ligar(board) {
    board.querySelector('#ahV3Busca').addEventListener('input', (e) => { state.v3Busca = e.target.value; atualizarLista(board); });
    aoClicarCard(board, (card, limpar) => {
      state.v3Filtro = limpar || !card || state.v3Filtro === card.dataset.filtro ? 'todos' : card.dataset.filtro;
      atualizarLista(board);
    });
    // Caixinhas (uma a uma e "marcar todos") e botões da barra: um só ouvinte no quadro, que vale para as linhas redesenhadas.
    board.addEventListener('change', (e) => {
      if (e.target.matches('[data-v3-select-todos]')) {
        board.querySelectorAll('[data-v3-select]:not(:disabled)').forEach((c) => {
          c.checked = e.target.checked;
          e.target.checked ? selecionados.add(c.dataset.v3Select) : selecionados.delete(c.dataset.v3Select);
        });
      } else if (e.target.matches('[data-v3-select]')) {
        e.target.checked ? selecionados.add(e.target.dataset.v3Select) : selecionados.delete(e.target.dataset.v3Select);
      } else return;
      atualizarBarra(board);
    });
    board.querySelectorAll('[data-v3-bar]').forEach((b) => {
      b.onclick = () => {
        const sel = selecionadosEmAberto();
        const acao = b.dataset.v3Bar;
        if (acao === 'cotar') agirNoGrupo(sel, ctx.cotacao.abrirCotar);
        else if (acao === 'reservar') agirNoGrupo(sel, ctx.reserva.abrir);
        else if (acao === 'agrupar') agrupar(board, sel);
        else cancelarItens(sel);
      };
    });
    sincronizarCards(board, state.v3Filtro);
    ligarAcoes(board);
    atualizarBarra(board);
  }

  return { render, ligar };
}
