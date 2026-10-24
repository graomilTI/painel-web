// Reserva manual da fila v3 (ADM): o ADM escolhe colaboradores, hotel, diária e descreve os quartos, sem passar pela cotação por link.
// Fábrica criarReserva(ctx): usa o estado, o repositório e os utilitários do controller (adm-hotel.js).
import { elegiveisJuntos, quartosDaReservaManual, sugerirComposicao } from './service.js?v=20261024-hosp-mod1';
import { idsMarcadosNaFila, pedirCampos } from './ui-comum.js?v=20261024-hosp-mod1';

export function criarReserva(ctx) {
  const { state, repo, modalRoot, loadPainel, toast, esc, brDate } = ctx;

  function abrir(itemId) {
    const base = state.v3Items.find((i) => i.item_id === itemId);
    if (!base) return;
    const preselecionados = new Set(idsMarcadosNaFila(itemId));
    const candidatos = state.v3Items.filter((i) => elegiveisJuntos(base, i));
    const hoteis = state.hotels.filter((h) => h.status !== 'INATIVO');
    modalRoot().innerHTML = `<div class="ah-overlay"><div class="ah-modal"><header><div><span class="ah-eyebrow">RESERVA</span><h2>${esc(base.cidade)}/${esc(base.uf)}</h2></div><button class="ah-x" data-v3-close>×</button></header>
    <div class="ah-body"><div class="ds-field"><label>Colaboradores</label><div class="ah-v3-modal-list">${candidatos.map((i) => `<label><input type="checkbox" data-v3-modal-item value="${esc(i.item_id)}" ${preselecionados.has(i.item_id) ? 'checked' : ''}> ${esc(i.nome_colaborador)} · ${brDate(i.data_checkin_prevista)}–${brDate(i.data_checkout_prevista)} · ${esc(i.sexo)}</label>`).join('')}</div></div>
    <div class="ds-field"><label>Hotel *</label><select id="v3Hotel"><option value="">Selecione</option>${hoteis.map((h) => `<option value="${esc(h.id)}">${esc(h.nome)} — ${esc(h.cidade || '')}/${esc(h.uf || '')}</option>`).join('')}</select><button type="button" class="btn btn-secondary" data-v3-new-hotel style="margin-top:8px">Cadastrar novo hotel</button></div>
    <div class="ds-field"><label>Valor da diária *</label><input id="v3Daily" type="number" min="0" step="0.01"></div><div class="ds-field"><label>Composição dos quartos *</label><textarea id="v3Rooms" rows="4" placeholder="Ex.: 2 quartos duplos masculino, R$ 180 por quarto"></textarea></div><button class="btn btn-secondary" data-v3-suggest>Sugerir menor custo</button>
    <p class="ah-error" id="v3Error"></p></div><footer><button class="btn btn-secondary" data-v3-close>Cancelar</button><button class="btn btn-primary" data-v3-confirm>Solicitar reserva ao hotel</button></footer></div></div>`;
    const root = modalRoot();
    root.querySelectorAll('[data-v3-close]').forEach((b) => { b.onclick = () => { root.innerHTML = ''; }; });
    root.querySelector('[data-v3-new-hotel]').onclick = () => cadastrarHotel(base, itemId);
    root.querySelector('[data-v3-suggest]').addEventListener('click', () => {
      const marcados = candidatos.filter((i) => root.querySelector(`[data-v3-modal-item][value="${i.item_id}"]`)?.checked);
      const campo = root.querySelector('#v3Rooms');
      if (campo) campo.value = sugerirComposicao(marcados);
    });
    root.querySelector('[data-v3-confirm]').onclick = () => enviar(base.solicitacao_id);
  }

  async function cadastrarHotel(base, itemId) {
    const dados = await pedirCampos(ctx, {
      eyebrow: 'HOTEL', titulo: `Novo hotel em ${base.cidade}/${base.uf}`, textoOk: 'Cadastrar',
      campos: [
        { rotulo: 'Nome do hotel', obrigatorio: true, aviso: 'Informe o nome do hotel.' },
        { rotulo: 'WhatsApp do hotel com DDD', obrigatorio: true, aviso: 'Informe o WhatsApp do hotel.' },
        { rotulo: 'Link de localização do hotel', obrigatorio: true, aviso: 'Informe o link de localização do hotel.' },
      ],
    });
    if (!dados) return abrir(itemId);
    const [nome, whatsapp, link] = dados;
    const { error } = await repo.cadastrarHotel({ nome, cidade: base.cidade, uf: base.uf, whatsapp, link_maps: link, status: 'ATIVO', recebe_cotacao: true });
    if (error) { toast(error.message, 'err'); return abrir(itemId); }
    toast('Hotel cadastrado.', 'ok');
    await loadPainel();
    abrir(itemId);
  }

  async function enviar(solicitacaoId) {
    const root = modalRoot();
    const erro = (msg) => { root.querySelector('#v3Error').textContent = msg; };
    const itemIds = [...root.querySelectorAll('[data-v3-modal-item]:checked')].map((e) => e.value);
    const hotelId = root.querySelector('#v3Hotel')?.value;
    if (!itemIds.length || !hotelId) return erro('Selecione colaboradores e hotel.');
    const diaria = Number(root.querySelector('#v3Daily')?.value);
    const descricao = root.querySelector('#v3Rooms')?.value.trim();
    if (!Number.isFinite(diaria) || diaria < 0 || !descricao) return erro('Informe valor e composição dos quartos.');
    const escolhidos = state.v3Items.filter((i) => itemIds.includes(i.item_id));
    const result = await repo.solicitarReserva({
      solicitacaoId, hotelId, itemIds, valorDiaria: diaria, quartos: quartosDaReservaManual(escolhidos, diaria, descricao), cotacaoId: null,
    });
    if (result.error) return erro(result.error.message);
    root.innerHTML = '';
    toast('Pedido enviado; confirme a reserva quando o hotel responder.', 'ok');
    await loadPainel();
  }

  return { abrir };
}
