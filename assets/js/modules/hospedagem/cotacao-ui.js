// Cotação de hospedagem por link — telas do ADM (gerar links, comparar respostas, reservar, confirmar pedido).
// Fábrica criarCotacaoHotel(ctx): recebe o estado e os utilitários do controller (adm-hotel.js); a lógica pura fica em cotacao.js.
import {
  VALIDADE_LINK_DIAS, compararCotacoes, descreverQuartos, linkAberto, linkWhatsapp, mensagemDoLink, montarPedidoReserva, montarQuartos, urlDoLink,
} from './cotacao.js?v=20261024-hosp-v2off1';
import { TIPOS_QUARTO, estimarTotal } from '../../cotacaoHotelRegras.js?v=20261024-hosp-v2off1';

const ELEGIVEIS = ['AGUARDANDO', 'EM_COTACAO'];
const ROTULO_GENERO = { MASC: 'masc.', FEM: 'fem.' };

const brDia = (d) => String(d || '').split('-').reverse().join('/');
const dtHora = (iso) => (iso ? new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }) : '');
const diasEntre = (ini, fim) => Math.round((Date.parse(`${fim}T00:00:00Z`) - Date.parse(`${ini}T00:00:00Z`)) / 86400000);

export function criarCotacaoHotel(ctx) {
  const { repo, state, modalRoot, loadPainel, toast, esc, money, normalizeText } = ctx;

  const fechar = () => { modalRoot().innerHTML = ''; };
  const cotacoesDoItem = (itemId) => (state.v3Cotacoes || []).filter((c) => (c.hospedagem_cotacao_colaboradores || []).some((l) => l.solicitacao_colaborador_id === itemId));
  const pedidoDoItem = (itemId) => (state.v3Pedidos || []).find((p) => (p.hospedagem_reserva_pedido_colaboradores || []).some((l) => l.solicitacao_colaborador_id === itemId));
  const hotelDe = (id) => state.hotels.find((h) => h.id === id);
  const itensDa = (cot) => {
    const ids = new Set((cot.hospedagem_cotacao_colaboradores || []).map((l) => l.solicitacao_colaborador_id));
    return state.v3Items.filter((i) => ids.has(i.item_id));
  };

  async function copiar(texto, aviso) {
    try {
      await navigator.clipboard.writeText(texto);
      toast(aviso, 'ok');
    } catch {
      toast('Não consegui copiar sozinho. Selecione o texto na tela e use Ctrl+C.', 'err');
    }
  }

  function moldura(titulo, subtitulo, corpo, rodape) {
    modalRoot().innerHTML = `<div class="ah-overlay"><div class="ah-modal ah-reservar">
      <div class="ah-modal-head"><div><h3>${esc(titulo)}</h3><p class="muted">${esc(subtitulo)}</p></div><button class="ah-modal-x" data-cot-fechar type="button">✕</button></div>
      <div class="ah-modal-body">${corpo}<p class="ah-error" id="cotErro"></p></div>
      <div class="ah-modal-foot"><div class="ah-modal-foot-left"></div><div class="ah-modal-foot-left">${rodape}</div></div>
    </div></div>`;
    modalRoot().querySelectorAll('[data-cot-fechar]').forEach((b) => { b.onclick = fechar; });
  }
  const erro = (msg) => { const el = modalRoot().querySelector('#cotErro'); if (el) el.textContent = msg; };

  // ─── Gerar links ─────────────────────────────────────────────────────────────
  function abrirCotar(itemId) {
    const base = state.v3Items.find((i) => i.item_id === itemId);
    if (!base) return;
    const candidatos = state.v3Items.filter((i) => i.solicitacao_id === base.solicitacao_id && ELEGIVEIS.includes(i.status_item)
      && i.cidade === base.cidade && i.uf === base.uf && i.data_checkin_prevista < base.data_checkout_prevista && i.data_checkout_prevista > base.data_checkin_prevista);
    const marcados = new Set([...document.querySelectorAll('[data-v3-select]:checked')].map((el) => el.dataset.v3Select).filter((id) => candidatos.some((c) => c.item_id === id)));
    marcados.add(itemId);
    const sel = { itens: marcados, hoteis: new Set(), busca: '', todas: false, novo: false };

    const hoteisVisiveis = () => state.hotels
      .filter((h) => h.status !== 'INATIVO')
      .filter((h) => sel.todas || (normalizeText(h.cidade) === normalizeText(base.cidade) && String(h.uf).toUpperCase() === String(base.uf).toUpperCase()))
      .filter((h) => !sel.busca || normalizeText(h.nome).includes(normalizeText(sel.busca)))
      .sort((a, b) => String(a.nome).localeCompare(String(b.nome)))
      .slice(0, 80);

    const listaHoteis = () => {
      const lista = hoteisVisiveis();
      if (!lista.length) return `<p class="ah-note">Nenhum hotel ${sel.todas ? '' : `cadastrado em ${esc(base.cidade)}/${esc(base.uf)} `}com esse filtro. ${sel.todas ? '' : 'Marque "outras cidades" ou cadastre o hotel abaixo.'}</p>`;
      return lista.map((h) => `<label class="ah-cot-linha"><input type="checkbox" data-cot-hotel value="${esc(h.id)}" ${sel.hoteis.has(h.id) ? 'checked' : ''}>
        <span><b>${esc(h.nome)}</b><small>${esc(h.cidade || '')}/${esc(h.uf || '')}${h.whatsapp ? ` · ${esc(h.whatsapp)}` : ' · sem WhatsApp'}</small></span></label>`).join('');
    };

    const desenharLista = () => {
      const box = modalRoot().querySelector('#cotHoteis');
      box.innerHTML = listaHoteis();
      box.querySelectorAll('[data-cot-hotel]').forEach((c) => { c.onchange = () => { c.checked ? sel.hoteis.add(c.value) : sel.hoteis.delete(c.value); }; });
    };

    moldura('Cotar hospedagem', `${base.cidade}/${base.uf} · ${brDia(base.data_checkin_prevista)} a ${brDia(base.data_checkout_prevista)}`, `
      <div class="ah-field"><label>Colaboradores</label><div class="ah-cot-lista">${candidatos.map((i) => `<label class="ah-cot-linha"><input type="checkbox" data-cot-item value="${esc(i.item_id)}" ${sel.itens.has(i.item_id) ? 'checked' : ''}>
        <span><b>${esc(i.nome_colaborador)}</b><small>${brDia(i.data_checkin_prevista)}–${brDia(i.data_checkout_prevista)} · ${esc(i.sexo === 'FEMININO' ? 'Feminino' : 'Masculino')}</small></span></label>`).join('')}</div></div>
      <div class="ah-field"><label>Hotéis (um link por hotel)</label>
        <input type="search" id="cotBusca" placeholder="Buscar hotel pelo nome" autocomplete="off">
        <label class="ah-cot-linha"><input type="checkbox" id="cotTodas"> <span>Mostrar hotéis de outras cidades</span></label>
        <div class="ah-cot-lista" id="cotHoteis"></div>
        <button type="button" class="btn btn-ghost" id="cotNovoBtn">+ Cadastrar hotel novo</button>
        <div id="cotNovo" class="ah-cot-novo" hidden>
          <input type="text" id="cotNovoNome" placeholder="Nome do hotel">
          <input type="text" id="cotNovoZap" inputmode="tel" placeholder="WhatsApp com DDD (opcional, para abrir a conversa)">
          <button type="button" class="btn btn-secondary" id="cotNovoSalvar">Salvar hotel em ${esc(base.cidade)}/${esc(base.uf)}</button>
        </div>
      </div>
      <p class="ah-note">O hotel recebe um link, informa as diárias por tipo de quarto e você compara as respostas aqui. O link vale ${VALIDADE_LINK_DIAS} dias.</p>`,
    `<button class="btn btn-secondary" data-cot-fechar type="button">Cancelar</button><button class="btn btn-primary" id="cotGerar" type="button">Gerar links</button>`);

    const root = modalRoot();
    desenharLista();
    root.querySelectorAll('[data-cot-item]').forEach((c) => { c.onchange = () => { c.checked ? sel.itens.add(c.value) : sel.itens.delete(c.value); }; });
    root.querySelector('#cotBusca').oninput = (e) => { sel.busca = e.target.value; desenharLista(); };
    root.querySelector('#cotTodas').onchange = (e) => { sel.todas = e.target.checked; desenharLista(); };
    root.querySelector('#cotNovoBtn').onclick = () => { root.querySelector('#cotNovo').hidden = false; root.querySelector('#cotNovoNome').focus(); };
    root.querySelector('#cotNovoSalvar').onclick = async () => {
      const nome = root.querySelector('#cotNovoNome').value.trim();
      const whatsapp = root.querySelector('#cotNovoZap').value.trim();
      if (nome.length < 3) return erro('Informe o nome do hotel.');
      const { data, error } = await repo.cadastrarHotel(
        { nome, cidade: base.cidade, uf: base.uf, whatsapp: whatsapp || null, status: 'ATIVO', recebe_cotacao: true }, 'id,nome,cidade,uf,whatsapp,status',
      );
      if (error) return erro(error.message);
      state.hotels.push(data);
      sel.hoteis.add(data.id);
      root.querySelector('#cotNovo').hidden = true;
      erro('');
      desenharLista();
    };
    root.querySelector('#cotGerar').onclick = async () => {
      const escolhidos = state.v3Items.filter((i) => sel.itens.has(i.item_id));
      if (!escolhidos.length || !sel.hoteis.size) return erro('Selecione os colaboradores e ao menos um hotel.');
      if (escolhidos.some((i) => i.sexo !== 'MASCULINO' && i.sexo !== 'FEMININO')) return erro('Há colaborador sem sexo informado; os quartos são separados por sexo.');
      const btn = root.querySelector('#cotGerar');
      btn.disabled = true;
      const { data, error } = await repo.iniciarCotacao({
        solicitacaoId: base.solicitacao_id, itemIds: escolhidos.map((i) => i.item_id), hotelIds: [...sel.hoteis], quartos: montarQuartos(escolhidos),
      });
      if (error) { btn.disabled = false; return erro(error.message); }
      fechar();
      await loadPainel();
      abrirLinks((data?.links || []).map((l) => l.cotacao_id));
    };
  }

  // ─── Mensagem e link para enviar ao hotel ────────────────────────────────────
  function mensagemDe(cot) {
    const item = itensDa(cot)[0] || state.v3Items.find((i) => i.solicitacao_id === cot.solicitacao_id);
    return mensagemDoLink(cot, item?.cidade, item?.uf, urlDoLink(cot.token));
  }

  function abrirLinks(cotacaoIds) {
    const cots = (state.v3Cotacoes || []).filter((c) => cotacaoIds.includes(c.id));
    moldura('Links de cotação', 'Envie a mensagem a cada hotel pelo WhatsApp. As respostas aparecem em "Respostas".', cots.map((c) => {
      const zap = linkWhatsapp(hotelDe(c.hotel_id)?.whatsapp, mensagemDe(c));
      return `<div class="ah-cot-card"><div class="ah-cot-topo"><b>${esc(c.hotel_nome)}</b><span class="ah-note">válido até ${esc(dtHora(c.expira_em).slice(0, 8))}</span></div>
        <textarea readonly rows="5">${esc(mensagemDe(c))}</textarea>
        <div class="ah-cot-acoes"><button class="btn btn-primary" data-cot-msg="${esc(c.id)}" type="button">Copiar mensagem</button>
        <button class="btn btn-secondary" data-cot-url="${esc(c.id)}" type="button">Copiar só o link</button>
        ${zap ? `<a class="btn btn-secondary" href="${esc(zap)}" target="_blank" rel="noopener">Abrir WhatsApp</a>` : '<span class="ah-note">Hotel sem WhatsApp cadastrado</span>'}</div></div>`;
    }).join('') || '<p class="ah-note">Nenhum link gerado.</p>', '<button class="btn btn-primary" data-cot-fechar type="button">Concluir</button>');
    modalRoot().querySelectorAll('[data-cot-msg]').forEach((b) => { b.onclick = () => copiar(mensagemDe(cots.find((c) => c.id === b.dataset.cotMsg)), 'Mensagem copiada.'); });
    modalRoot().querySelectorAll('[data-cot-url]').forEach((b) => { b.onclick = () => copiar(urlDoLink(cots.find((c) => c.id === b.dataset.cotUrl).token), 'Link copiado.'); });
  }

  // ─── Comparar respostas ──────────────────────────────────────────────────────
  const sim = (v) => (v === true ? 'Sim' : v === false ? 'Não' : '—');

  function cartaoResposta({ cot, situacao, estimativa }, melhor) {
    const respondida = situacao.chave === 'respondida';
    const quartos = cot.quartos_necessarios || [];
    const precos = respondida ? quartos.map((q) => {
      const p = cot.precos_quartos?.[q.tipo_quarto];
      return `<tr><td>${q.quantidade} × ${esc(TIPOS_QUARTO[q.tipo_quarto])} ${esc(ROTULO_GENERO[q.genero] || '')}</td><td>${typeof p === 'number' ? `${money(p)} / diária` : '<span class="ah-note">não possui</span>'}</td></tr>`;
    }).join('') : '';
    const detalhes = respondida ? `<table class="ah-cot-tabela"><tbody>${precos}</tbody></table>
      <p class="ah-cot-total">${estimativa.completo ? `Total estimado <b>${money(estimativa.total)}</b> <span class="ah-note">(${money(estimativa.porNoite)}/noite · ${Number(cot.diarias_previstas)} diária(s))</span>`
        : `<b>Incompleta</b>: sem preço para ${estimativa.faltam.map((t) => esc(TIPOS_QUARTO[t].toLowerCase())).join(', ')}`}</p>
      <p class="ah-note">Café ${sim(cot.cafe_incluso)} · Almoço ${sim(cot.almoco_incluso)} · Janta ${sim(cot.janta_inclusa)} · Estacionamento ${sim(cot.estacionamento_incluso)} · Paga no checkout ${sim(cot.aceita_pagamento_checkout)} · NF ${sim(cot.emite_nota_fiscal)}</p>
      <p class="ah-note">Pagamento: ${esc((cot.formas_pagamento || []).join(', ') || '—')} · Contato: ${esc(cot.atendente_nome || '—')} ${esc(cot.atendente_telefone || '')} · Respondida em ${esc(dtHora(cot.respondido_em))}</p>` : '';
    const zap = cot.atendente_telefone ? linkWhatsapp(cot.atendente_telefone) : '';
    return `<div class="ah-cot-card ${melhor ? 'ah-cot-melhor' : ''}" data-cot-card="${esc(cot.id)}">
      <div class="ah-cot-topo"><b>${esc(cot.hotel_nome)}</b><span class="ah-cot-badge ah-cot-${esc(situacao.chave)}">${melhor ? 'Menor custo · ' : ''}${esc(situacao.rotulo)}</span></div>
      ${detalhes}
      ${cot.observacoes ? `<p class="ah-note">Obs. do hotel: ${esc(cot.observacoes)}</p>` : ''}
      <div class="ah-cot-acoes">
        ${respondida ? `<button class="btn btn-primary" data-cot-reservar="${esc(cot.id)}" type="button">Reservar com esta cotação</button>` : ''}
        ${cot.token && linkAberto(cot) ? `<button class="btn btn-secondary" data-cot-msg="${esc(cot.id)}" type="button">Copiar mensagem</button><button class="btn btn-ghost" data-cot-encerrar="${esc(cot.id)}" type="button">Encerrar link</button>` : ''}
        ${cot.token && !linkAberto(cot) && situacao.chave !== 'indisponivel' ? `<button class="btn btn-secondary" data-cot-reabrir="${esc(cot.id)}" type="button">Reabrir por ${VALIDADE_LINK_DIAS} dias</button>` : ''}
        ${zap ? `<a class="btn btn-ghost" href="${esc(zap)}" target="_blank" rel="noopener">WhatsApp do atendente</a>` : ''}
      </div></div>`;
  }

  function abrirRespostas(itemId) {
    const base = state.v3Items.find((i) => i.item_id === itemId);
    if (!base) return;
    const ordenadas = compararCotacoes(cotacoesDoItem(itemId));
    const melhor = ordenadas.find((o) => o.grupo === 'completa');
    moldura('Respostas dos hotéis', `${base.cidade}/${base.uf} · ${brDia(base.data_checkin_prevista)} a ${brDia(base.data_checkout_prevista)}`,
      ordenadas.length ? ordenadas.map((o) => cartaoResposta(o, o === melhor)).join('') : '<p class="ah-note">Nenhuma cotação por link para este colaborador.</p>',
      `<button class="btn btn-secondary" id="cotOutro" type="button">Cotar com outro hotel</button><button class="btn btn-primary" data-cot-fechar type="button">Fechar</button>`);
    const root = modalRoot();
    root.querySelector('#cotOutro').onclick = () => abrirCotar(itemId);
    root.querySelectorAll('[data-cot-msg]').forEach((b) => { b.onclick = () => copiar(mensagemDe(state.v3Cotacoes.find((c) => c.id === b.dataset.cotMsg)), 'Mensagem copiada.'); });
    root.querySelectorAll('[data-cot-reservar]').forEach((b) => { b.onclick = () => abrirReserva(b.dataset.cotReservar, itemId); });
    const alterar = (atributo, campos, aviso) => root.querySelectorAll(`[${atributo}]`).forEach((b) => {
      b.onclick = async () => {
        const { error } = await repo.atualizarCotacao(b.getAttribute(atributo), campos());
        if (error) return erro(error.message);
        toast(aviso, 'ok');
        await loadPainel();
        abrirRespostas(itemId);
      };
    });
    alterar('data-cot-encerrar', () => ({ link_status: 'encerrada' }), 'Link encerrado.');
    alterar('data-cot-reabrir', () => ({ link_status: 'aberta', expira_em: new Date(Date.now() + VALIDADE_LINK_DIAS * 86400000).toISOString() }), 'Link reaberto.');
  }

  // ─── Reservar com a cotação escolhida ────────────────────────────────────────
  function abrirReserva(cotacaoId, itemIdOrigem) {
    const cot = state.v3Cotacoes.find((c) => c.id === cotacaoId);
    if (!cot) return;
    const todos = itensDa(cot);
    const itens = todos.filter((i) => ELEGIVEIS.includes(i.status_item));
    if (!itens.length) return toast('Nenhum colaborador desta cotação está disponível para reserva.', 'err');
    const quartos = montarQuartos(itens);
    const inicio = itens.map((i) => i.data_checkin_prevista).sort()[0];
    const fim = itens.map((i) => i.data_checkout_prevista).sort().at(-1);
    const diarias = diasEntre(inicio, fim);
    const precos = {};
    const tipos = [...new Set(quartos.map((q) => q.tipo_quarto))];
    tipos.forEach((t) => { precos[t] = typeof cot.precos_quartos?.[t] === 'number' ? cot.precos_quartos[t] : ''; });
    const aviso = itens.length < todos.length ? `<p class="hosp-note">${todos.length - itens.length} colaborador(es) desta cotação saíram (cancelado ou já reservado). Os quartos foram recalculados; confira os valores.</p>` : '';

    moldura(`Reservar em ${cot.hotel_nome}`, `${brDia(inicio)} a ${brDia(fim)} · ${diarias} diária(s) · ${itens.length} pessoa(s)`, `${aviso}
      <div class="ah-field"><label>Colaboradores</label><p class="ah-note">${itens.map((i) => esc(i.nome_colaborador)).join(', ')}</p></div>
      <div class="ah-field"><label>Diária por quarto (confira antes de pedir)</label>
        ${tipos.map((t) => {
          const qs = quartos.filter((q) => q.tipo_quarto === t);
          return `<div class="ah-cot-linha ah-cot-preco"><span><b>${esc(TIPOS_QUARTO[t])}</b><small>${esc(descreverQuartos(qs))}</small></span>
            <input type="number" min="0.01" step="0.01" data-cot-preco="${esc(t)}" value="${esc(precos[t])}" placeholder="R$ 0,00"></div>`;
        }).join('')}
      </div>
      <p class="ah-cot-total" id="cotTotalReserva"></p>
      <p class="ah-note">O pedido de reserva segue para o hotel. Quando o hotel confirmar, clique em "Confirmar reserva" na fila.</p>`,
    `<button class="btn btn-secondary" id="cotVoltar" type="button">Voltar</button><button class="btn btn-primary" id="cotPedir" type="button">Solicitar reserva</button>`);

    const root = modalRoot();
    const lerPrecos = () => Object.fromEntries([...root.querySelectorAll('[data-cot-preco]')].map((i) => [i.dataset.cotPreco, Number(i.value)]));
    const atualizar = () => {
      const est = estimarTotal(quartos, Object.fromEntries(Object.entries(lerPrecos()).filter(([, v]) => v > 0)), diarias);
      root.querySelector('#cotTotalReserva').innerHTML = est.completo ? `Total estimado: <b>${money(est.total)}</b> <span class="ah-note">(${money(est.porNoite)}/noite)</span>` : '';
    };
    root.querySelectorAll('[data-cot-preco]').forEach((i) => { i.oninput = atualizar; });
    atualizar();
    root.querySelector('#cotVoltar').onclick = () => (itemIdOrigem ? abrirRespostas(itemIdOrigem) : fechar());
    root.querySelector('#cotPedir').onclick = async () => {
      const pedido = montarPedidoReserva(quartos, lerPrecos());
      if (pedido.erro) return erro(pedido.erro);
      const btn = root.querySelector('#cotPedir');
      btn.disabled = true;
      const { error } = await repo.solicitarReserva({
        solicitacaoId: cot.solicitacao_id, hotelId: cot.hotel_id, itemIds: itens.map((i) => i.item_id), valorDiaria: pedido.valorDiaria, quartos: pedido.quartos, cotacaoId: cot.id,
      });
      if (error) { btn.disabled = false; return erro(error.message); }
      fechar();
      toast('Pedido de reserva criado. Confirme quando o hotel responder.', 'ok');
      await loadPainel();
    };
  }

  // ─── Resposta do hotel ao pedido de reserva ──────────────────────────────────
  function abrirDecisaoPedido(pedidoId, acao) {
    const confirmar = acao === 'confirmar';
    moldura(confirmar ? 'Confirmar reserva' : 'Hotel recusou a reserva', confirmar ? 'Gera a reserva e avisa o colaborador e o gestor.' : 'Os colaboradores voltam para "Em cotação".', `
      <div class="ah-field"><label>${confirmar ? 'Observação do hotel (opcional)' : 'Motivo da recusa (opcional)'}</label><textarea id="cotResposta" rows="3" maxlength="500"></textarea></div>`,
    `<button class="btn btn-secondary" data-cot-fechar type="button">Cancelar</button><button class="btn btn-primary" id="cotDecidir" type="button">${confirmar ? 'Confirmar reserva' : 'Registrar recusa'}</button>`);
    modalRoot().querySelector('#cotDecidir').onclick = async () => {
      const resposta = modalRoot().querySelector('#cotResposta').value.trim() || null;
      const { error } = confirmar
        ? await repo.confirmarPedido(pedidoId, resposta)
        : await repo.recusarPedido(pedidoId, resposta);
      if (error) return erro(error.message);
      fechar();
      toast(confirmar ? 'Reserva confirmada.' : 'Recusa registrada.', 'ok');
      await loadPainel();
    };
  }

  // Botões extras da linha do colaborador na fila v3 (respostas das cotações e resposta do hotel ao pedido de reserva).
  function acoesDoItem(item) {
    const n = item.status_item === 'EM_COTACAO' ? cotacoesDoItem(item.item_id).length : 0;
    const pedido = item.status_item === 'AGUARDANDO_HOTEL' ? pedidoDoItem(item.item_id) : null;
    return `${n ? `<button class="btn btn-secondary" data-v3-respostas="${esc(item.item_id)}">Respostas (${n})</button>` : ''}${pedido
      ? `<button class="btn btn-primary" data-v3-pedido-confirmar="${esc(pedido.id)}">Confirmar reserva</button><button class="btn btn-ghost" data-v3-pedido-recusar="${esc(pedido.id)}">Hotel recusou</button>` : ''}`;
  }

  function ligar(board) {
    board.querySelectorAll('[data-v3-cotar]').forEach((b) => { b.onclick = () => abrirCotar(b.dataset.v3Cotar); });
    board.querySelectorAll('[data-v3-respostas]').forEach((b) => { b.onclick = () => abrirRespostas(b.dataset.v3Respostas); });
    board.querySelectorAll('[data-v3-pedido-confirmar]').forEach((b) => { b.onclick = () => abrirDecisaoPedido(b.dataset.v3PedidoConfirmar, 'confirmar'); });
    board.querySelectorAll('[data-v3-pedido-recusar]').forEach((b) => { b.onclick = () => abrirDecisaoPedido(b.dataset.v3PedidoRecusar, 'recusar'); });
  }

  return { acoesDoItem, ligar };
}
