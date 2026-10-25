// Despesa extra e pagamento da reserva (fila v3, ADM). Fábrica criarPagamento(ctx).
import { caminhoComprovante, rateioExcedeTotal } from './service.js?v=20261024-hosp-acoes3';

export function criarPagamento(ctx) {
  const { state, repo, modalRoot, loadPainel, toast, esc, money } = ctx;

  const fechar = () => { modalRoot().innerHTML = ''; };

  // Cobrança extra do hotel: a parte indevida vai para o caixa de cada colaborador e o restante soma ao pagamento do hotel.
  function abrirExtra(reservaId) {
    const pessoas = state.v3Items.filter((i) => i.reserva_id === reservaId);
    modalRoot().innerHTML = `<div class="ah-overlay"><form class="ah-modal" id="v3ExtraForm"><header><div><span class="ah-eyebrow">DESPESA EXTRA</span><h2>Conferir cobrança do hotel</h2></div><button type="button" class="ah-x" data-v3-close>×</button></header><div class="ah-body"><div class="ds-field"><label>Descrição *</label><input id="v3ExtraDesc" required></div><div class="ds-field"><label>Valor total *</label><input id="v3ExtraValue" type="number" min="0.01" step="0.01" required></div><p class="muted">Informe abaixo a parte indevida que deve ir ao caixa de cada colaborador. O restante será somado ao pagamento do hotel.</p>${pessoas.map((p) => `<div class="ds-field"><label>${esc(p.nome_colaborador)}</label><input data-v3-extra-split="${esc(p.item_id)}" type="number" min="0" step="0.01" value="0"></div>`).join('')}<p class="ah-error" id="v3ExtraError"></p></div><footer><button type="button" class="btn btn-secondary" data-v3-close>Cancelar</button><button class="btn btn-primary">Registrar</button></footer></form></div>`;
    const root = modalRoot();
    root.querySelectorAll('[data-v3-close]').forEach((b) => { b.onclick = fechar; });
    root.querySelector('#v3ExtraForm').onsubmit = async (e) => {
      e.preventDefault();
      const erro = (msg) => { root.querySelector('#v3ExtraError').textContent = msg; };
      const valor = Number(root.querySelector('#v3ExtraValue').value);
      const rateios = [...root.querySelectorAll('[data-v3-extra-split]')]
        .map((i) => ({ item_id: i.dataset.v3ExtraSplit, valor: Number(i.value || 0) })).filter((r) => r.valor > 0);
      if (rateioExcedeTotal(rateios, valor)) return erro('O rateio não pode superar o valor total.');
      const { error } = await repo.registrarExtra({ reservaId, descricao: root.querySelector('#v3ExtraDesc').value, valor, rateios });
      if (error) return erro(error.message);
      fechar();
      toast('Despesa extra registrada e rateada.', 'ok');
      await loadPainel();
    };
  }

  // Sem lançamento ainda: cria o consolidado do hotel. Com lançamento: registra uma parcela paga com o comprovante.
  function abrirPagamento(reservaId) {
    const existente = state.v3Payments.find((p) => p.reserva_id === reservaId);
    const campos = existente
      ? `<div class="hosp-note">Total ${money(existente.valor_total)} · pago ${money(existente.valor_pago)} · saldo ${money(existente.saldo)} · ${esc(existente.status)}</div><div class="ds-field"><label>Valor desta parcela *</label><input id="v3PartValue" type="number" min="0.01" max="${esc(existente.saldo)}" step="0.01" required></div><div class="ds-field"><label>Data do pagamento *</label><input id="v3PartDate" type="date" value="${new Date().toISOString().slice(0, 10)}" required></div><div class="ds-field"><label>Comprovante *</label><input id="v3PartProof" type="file" accept="application/pdf,image/*" required></div><div class="ds-field"><label>Responsável</label><select id="v3PartSector"><option value="ADM">ADM/Hospedagem</option><option value="FINANCEIRO">Financeiro</option></select></div>`
      : `<div class="ds-field"><label>Forma *</label><select id="v3PayMethod"><option value="PIX">PIX</option><option value="BOLETO">Boleto</option></select></div><div class="ds-field"><label>Valor total, incluindo extras *</label><input id="v3PayTotal" type="number" min="0.01" step="0.01" required></div><div class="ds-field"><label>Chave PIX</label><input id="v3PayPix"></div><div class="ds-field"><label>URL do boleto PDF</label><input id="v3PayBoleto" type="url"></div><div class="ds-field"><label>Vencimento</label><input id="v3PayDue" type="date"></div><label><input id="v3PayFinance" type="checkbox"> Enviar ao Financeiro agora</label>`;
    modalRoot().innerHTML = `<div class="ah-overlay"><form class="ah-modal" id="v3PaymentForm"><header><div><span class="ah-eyebrow">FINANCEIRO</span><h2>${existente ? 'Registrar pagamento' : 'Novo lançamento consolidado'}</h2></div><button type="button" class="ah-x" data-v3-close>×</button></header><div class="ah-body">${campos}<p class="ah-error" id="v3PayError"></p></div><footer><button type="button" class="btn btn-secondary" data-v3-close>Cancelar</button><button class="btn btn-primary">${existente ? 'Registrar parcela' : 'Criar lançamento'}</button></footer></form></div>`;
    const root = modalRoot();
    root.querySelectorAll('[data-v3-close]').forEach((b) => { b.onclick = fechar; });
    root.querySelector('#v3PaymentForm').onsubmit = async (e) => {
      e.preventDefault();
      const valor = (id) => root.querySelector(id).value;
      let error;
      if (existente) {
        const arquivo = root.querySelector('#v3PartProof').files?.[0];
        if (!arquivo) return;
        const envio = await repo.enviarComprovante(caminhoComprovante(existente.id, arquivo.name, crypto.randomUUID()), arquivo);
        if (envio.error) error = envio.error;
        else ({ error } = await repo.registrarParcela({ pagamentoId: existente.id, valor: Number(valor('#v3PartValue')), data: valor('#v3PartDate'), comprovanteUrl: envio.url, setor: valor('#v3PartSector') }));
      } else {
        ({ error } = await repo.criarPagamento({
          reservaId, forma: valor('#v3PayMethod'), valor: Number(valor('#v3PayTotal')), chavePix: valor('#v3PayPix') || null, boletoUrl: valor('#v3PayBoleto') || null,
          vencimento: valor('#v3PayDue') || null, enviarFinanceiro: root.querySelector('#v3PayFinance').checked,
        }));
      }
      if (error) { root.querySelector('#v3PayError').textContent = error.message; return; }
      fechar();
      toast(existente ? 'Pagamento registrado e comprovante enviado ao hotel.' : 'Lançamento de hospedagem criado.', 'ok');
      await loadPainel();
    };
  }

  return { abrirExtra, abrirPagamento };
}
