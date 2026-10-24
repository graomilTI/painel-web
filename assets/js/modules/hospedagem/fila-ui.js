// Fila v3 da Hospedagem (ADM): lista de colaboradores com filtros e as ações de cada linha. Fábrica criarFila(ctx).
// O CSS fica em assets/css/adm-hotel.css (bloco ".ah-v3-*"); aqui só HTML e eventos.
import { STATUS_ABERTOS, V3_LABELS, filtrarFila } from './service.js?v=20261024-hosp-v2off1';
import { pedirCampos } from './ui-comum.js?v=20261024-hosp-v2off1';

export function criarFila(ctx) {
  const { state, repo, loadPainel, renderBoard, toast, esc, brDate, normalizeText } = ctx;

  const linhaHtml = (i) => `<article class="ah-v3-item">
      <label class="ah-v3-check"><input type="checkbox" data-v3-select="${esc(i.item_id)}" ${STATUS_ABERTOS.includes(i.status_item) ? '' : 'disabled'}></label>
      <div><b>${esc(i.nome_colaborador)}</b><small>${esc(i.supervisao || 'Sem supervisão')} · ${esc(i.sexo === 'FEMININO' ? 'Feminino' : i.sexo === 'MASCULINO' ? 'Masculino' : 'Sexo pendente')}</small></div>
      <div><b>${esc(i.cidade)}/${esc(i.uf)}</b><small>${brDate(i.data_checkin_prevista)} ${esc(String(i.horario_chegada_previsto || '').slice(0, 5))} · ${i.quantidade_diarias_prevista} diária(s)</small></div>
      <div><span class="ah-v3-status s-${esc(i.status_item)}">${esc(V3_LABELS[i.status_item] || i.status_item)}</span>${i.hotel ? `<small>${esc(i.hotel)} · ${esc(i.codigo_operacional || '')}</small>` : ''}</div>
      <div class="ah-v3-actions">${STATUS_ABERTOS.includes(i.status_item) ? `<button class="btn btn-secondary" data-v3-cotar="${esc(i.item_id)}">Cotar</button><button class="btn btn-primary" data-v3-reservar="${esc(i.item_id)}">Reservar</button><button class="btn btn-ghost" data-v3-recusar="${esc(i.item_id)}">Recusar</button>` : ''}${ctx.cotacao.acoesDoItem(i)}${i.status_item === 'RESERVADO' ? `<button class="btn btn-secondary" data-v3-extra="${esc(i.reserva_id)}">Despesa extra</button><button class="btn btn-secondary" data-v3-payment="${esc(i.reserva_id)}">Pagamento</button>` : ''}${i.status_item === 'CHECKOUT_PENDENTE' ? '<span class="muted">Aguardando confirmações</span>' : ''}</div>
    </article>`;

  const avisoCheckoutHtml = (d) => `<div class="hosp-note">Hotel confirmou ${esc(d.decisao || 'checkout')} · <button class="btn btn-primary" data-v3-validate-checkout="${esc(d.id)}">Validar e concluir</button></div>`;

  const avisoAlteracaoHtml = (a) => `<div class="hosp-note">Alteração ${esc(a.tipo)} aguardando tratamento · ${brDate(a.solicitada_em)} ${['PRORROGACAO', 'CANCELAMENTO'].includes(a.tipo) && a.status === 'AGUARDANDO_ADM' ? `<button class="btn btn-primary" data-v3-handle-change="${esc(a.id)}">Enviar ao hotel</button>` : ''}${['MUDANCA_DATAS', 'MUDANCA_CIDADE'].includes(a.tipo) && a.status === 'AGUARDANDO_ADM' ? `<button class="btn btn-primary" data-v3-new-change-reservation="${esc(a.id)}">Criar nova reserva</button>` : ''}</div>`;

  function render() {
    const f = state.v3Filters;
    const itens = filtrarFila(state.v3Items, f, normalizeText);
    if (!itens.length) return '';
    return `<section class="card ah-v3" style="margin-bottom:16px"><div class="ah-v3-head"><div><span class="ah-eyebrow">NOVO FLUXO</span><h3>Solicitações por colaborador</h3></div><span>${itens.length} item(ns)</span></div>
    <div class="ah-v3-filters"><select data-v3-filter="status"><option value="">Todos os status</option>${Object.entries(V3_LABELS).map(([v, l]) => `<option value="${v}" ${f.status === v ? 'selected' : ''}>${l}</option>`).join('')}</select><input data-v3-filter="date" type="date" value="${esc(f.date)}"><input data-v3-filter="city" placeholder="Cidade/UF" value="${esc(f.city)}"><input data-v3-filter="person" placeholder="Colaborador" value="${esc(f.person)}"><input data-v3-filter="supervision" placeholder="Supervisão" value="${esc(f.supervision)}"></div>
    <div class="ah-v3-list">${itens.map(linhaHtml).join('')}</div>
    ${state.v3Checkout.filter((d) => d.status === 'AGUARDANDO_ADM').map(avisoCheckoutHtml).join('')}
    ${state.v3Changes.map(avisoAlteracaoHtml).join('')}
    </section>`;
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

  function ligar(board) {
    board.querySelectorAll('[data-v3-filter]').forEach((el) => { el.onchange = () => { state.v3Filters[el.dataset.v3Filter] = el.value; renderBoard(); }; });
    ctx.cotacao.ligar(board);
    board.querySelectorAll('[data-v3-reservar]').forEach((b) => { b.onclick = () => ctx.reserva.abrir(b.dataset.v3Reservar); });
    board.querySelectorAll('[data-v3-recusar]').forEach((b) => { b.onclick = () => recusarItem(b.dataset.v3Recusar); });
    board.querySelectorAll('[data-v3-payment]').forEach((b) => { b.onclick = () => ctx.pagamento.abrirPagamento(b.dataset.v3Payment); });
    board.querySelectorAll('[data-v3-extra]').forEach((b) => { b.onclick = () => ctx.pagamento.abrirExtra(b.dataset.v3Extra); });
    board.querySelectorAll('[data-v3-validate-checkout]').forEach((b) => { b.onclick = () => executar(repo.validarCheckout(b.dataset.v3ValidateCheckout), 'Checkout validado.'); });
    board.querySelectorAll('[data-v3-handle-change]').forEach((b) => { b.onclick = () => executar(repo.tratarAlteracao(b.dataset.v3HandleChange), 'Alteração enviada ao hotel.'); });
    board.querySelectorAll('[data-v3-new-change-reservation]').forEach((b) => {
      b.onclick = async () => {
        const { data, error } = await repo.prepararNovaReservaAlteracao(b.dataset.v3NewChangeReservation);
        if (error) return toast(error.message, 'err');
        await loadPainel();
        ctx.reserva.abrir(data.item_id);
      };
    });
  }

  return { render, ligar };
}
