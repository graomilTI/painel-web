// Fila v3 da Hospedagem (ADM): colaboradores por status no layout das listas do Frotas (cards que filtram, busca com chip, tabela
// fixa e botões de ícone). Fábrica criarFila(ctx). O CSS vem de patrimonioLayoutFrotas.js (.fm-*); aqui só HTML e eventos.
import { ICON, aoClicarCard, cardFiltro, iconBtn, sincronizarCards } from '../../patrimonioLayoutFrotas.js?v=20261019-ordenar';
import { STATUS_ABERTOS, V3_LABELS, V3_VISUAL, contarPorStatus, filtrarFila } from './service.js?v=20261024-hosp-layout3';
import { pedirCampos } from './ui-comum.js?v=20261024-hosp-layout3';

const iniciais = (nome) => String(nome || '').trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join('').toUpperCase() || '?';

export function criarFila(ctx) {
  const { state, repo, loadPainel, toast, esc, brDate, normalizeText } = ctx;

  const filtrados = () => filtrarFila(state.v3Items, { status: state.v3Filtro, busca: state.v3Busca }, normalizeText, brDate);

  const linhaHtml = (i) => {
    const visual = V3_VISUAL[i.status_item] || {};
    const aberto = STATUS_ABERTOS.includes(i.status_item);
    const sexo = i.sexo === 'FEMININO' ? 'Feminino' : i.sexo === 'MASCULINO' ? 'Masculino' : 'Sexo pendente';
    return `<tr>
      <td><input type="checkbox" data-v3-select="${esc(i.item_id)}" ${aberto ? '' : 'disabled'} aria-label="Selecionar ${esc(i.nome_colaborador)}"></td>
      <td><div class="fm-person"><span class="fm-avatar">${esc(iniciais(i.nome_colaborador))}</span><div class="fm-cell"><b>${esc(i.nome_colaborador)}</b><span class="fm-prazo-dia">${esc(i.supervisao || 'Sem supervisão')} · ${esc(sexo)}</span></div></div></td>
      <td><div class="fm-cell"><b>${esc(i.cidade)}/${esc(i.uf)}</b></div></td>
      <td><div class="fm-cell">${brDate(i.data_checkin_prevista)}<span class="fm-prazo-dia">${esc(String(i.horario_chegada_previsto || '').slice(0, 5))} · ${i.quantidade_diarias_prevista} diária(s)</span></div></td>
      <td><div class="fm-cell"><span class="fm-badge ${visual.selo || ''}">${esc(V3_LABELS[i.status_item] || i.status_item)}</span>${i.hotel ? `<span class="fm-prazo-dia">${esc(i.hotel)} · ${esc(i.codigo_operacional || '')}</span>` : ''}</div></td>
      <td><div class="fm-actions">${aberto ? `${iconBtn('data-v3-cotar', i.item_id, 'anexo', 'Cotar com hotéis (gera o link)', 'doc')}${iconBtn('data-v3-reservar', i.item_id, 'termo', 'Reservar direto, sem cotação', 'calendario')}${iconBtn('data-v3-recusar', i.item_id, 'danger', 'Recusar a solicitação', 'erro')}` : ''}${ctx.cotacao.acoesDoItem(i)}${i.status_item === 'RESERVADO' ? `${iconBtn('data-v3-extra', i.reserva_id, '', 'Despesa extra do hotel', 'alerta')}${iconBtn('data-v3-payment', i.reserva_id, 'termo', 'Pagamento do hotel', 'dinheiro')}` : ''}${i.status_item === 'CHECKOUT_PENDENTE' ? '<span class="fm-prazo-dia">Aguardando confirmações</span>' : ''}</div></td>
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

  function render() {
    const itens = filtrados();
    return `<div id="ahV3Page">
      <div class="fm-kpis" id="ahV3Kpis">${cardsHtml()}</div>
      <div class="fm-card"><div class="fm-body">
        <div class="fm-bar"><div class="fm-search">${ICON.busca}<input class="fm-input" id="ahV3Busca" placeholder="Buscar por colaborador, cidade, supervisão, hotel, código ou data (dd/mm/aaaa)..." autocomplete="off" value="${esc(state.v3Busca)}"></div><span data-chip></span><span class="fm-count" id="ahV3Count">${itens.length} colaborador(es)</span></div>
        <div id="ahV3Avisos">${avisosHtml()}</div>
        <div class="fm-table-wrap"><table class="fm-table"><thead><tr><th></th><th>Colaborador</th><th>Destino</th><th>Entrada</th><th>Status</th><th>Ações</th></tr></thead><tbody id="ahV3Corpo">${corpoHtml(itens)}</tbody></table></div>
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

  async function recusarItem(itemId) {
    const dados = await pedirCampos(ctx, { eyebrow: 'RECUSA', titulo: 'Recusar solicitação', textoOk: 'Recusar', campos: [{ rotulo: 'Motivo da recusa', obrigatorio: true, linhas: 3, aviso: 'Informe o motivo da recusa.' }] });
    if (!dados) return;
    await executar(repo.recusarItem(itemId, dados[0]), 'Solicitação recusada e gestor notificado.');
  }

  // Ações de cada linha e dos avisos: religadas sempre que a tabela é redesenhada (busca e cards só trocam o miolo).
  function ligarAcoes(raiz) {
    ctx.cotacao.ligar(raiz);
    raiz.querySelectorAll('[data-v3-reservar]').forEach((b) => { b.onclick = () => ctx.reserva.abrir(b.dataset.v3Reservar); });
    raiz.querySelectorAll('[data-v3-recusar]').forEach((b) => { b.onclick = () => recusarItem(b.dataset.v3Recusar); });
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
  }

  function ligar(board) {
    board.querySelector('#ahV3Busca').addEventListener('input', (e) => { state.v3Busca = e.target.value; atualizarLista(board); });
    aoClicarCard(board, (card, limpar) => {
      state.v3Filtro = limpar || !card || state.v3Filtro === card.dataset.filtro ? 'todos' : card.dataset.filtro;
      atualizarLista(board);
    });
    sincronizarCards(board, state.v3Filtro);
    ligarAcoes(board);
  }

  return { render, ligar };
}
