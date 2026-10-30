// Financeiro — aba Pagamentos dos setores (compras, RH, frotas…): lista, modais, comprovante, recusa e PIX.
// Extraído de assets/js/financeiro.js (renderContent) em 15/10/2026. Cada fábrica criarX(ctx) recebe o contexto da tela
// ({ content, userContext } + funções das fábricas anteriores) e devolve as funções que as outras partes usam. O código
// das funções e constantes foi movido sem alteração. Para publicar uma mudança em qualquer módulo de
// assets/js/modules/financeiro/, troque o token ?v=20261030-fin14 em TODOS os imports internos e nos carregadores
// (assets/js/financeiro.js, financeiro.html): tests/financeiro-modulos-versao.test.mjs garante que fiquem iguais.
import { supabase } from '../../supabaseClient.js';
import { state, esc, normalize, money, isMissingColumnError } from './util.js?v=20261030-fin14';
import { origemPagamentoLabel, statusPagamentoClass, ensureHttps, isBoleto, isPix, uploadComprovantePagamento } from './pagamentos.js?v=20261030-fin14';
import { cardFiltro, iconBtn } from '../../patrimonioLayoutFrotas.js?v=20261019-ordenar';
import { obterModal, htmlModal, abrirModal } from './modal.js?v=20261030-fin14';
import { gerarPayloadPix } from './pix.js?v=20261030-fin14';
import { sendComprovanteViaBotConversa } from './whatsapp.js?v=20261030-fin14';
import { getGestorCoordenacao, isLinkDados, renderConteudoHtml, codigoPagamento, renderConteudoModal } from './conteudo-pagamento.js?v=20261030-fin14';
import { groupCompraPagamentos, idsItensCompra, enviarComprovanteParcial, ativarEpiRegistros, updateComprasComprovante } from './compras-pagamento.js?v=20261030-fin14';

// Setores da fila: [chave do filtro, rótulo, tom do card, ícone]. A chave é o que o card grava em state.pagamentosSetorFilter.
const SETORES = [
  ['COMPRAS', 'Compras', 'green', 'doc'],
  ['HOSPEDAGEM', 'Hospedagem', 'blue', 'calendario'],
  ['FROTAS', 'Frotas', 'amber', 'carro'],
  ['RH', 'RH', 'green', 'total'],
  ['AUDITORIA', 'Auditoria', 'red', 'busca'],
  ['OUTROS', 'Outros', 'slate', 'doc'],
];

function setorDoPagamento(row) {
  const origem = normalize(row.origem || row.setor || row.modulo_origem);
  if (origem.includes('compra')) return 'COMPRAS';
  if (origem.includes('hotel') || origem.includes('hosped')) return 'HOSPEDAGEM';
  if (origem.includes('frota')) return 'FROTAS';
  if (origem === 'rh' || origem.includes('recursos humanos')) return 'RH';
  if (origem.includes('auditoria')) return 'AUDITORIA';
  return 'OUTROS';
}


function criarSetorPagamentos(ctx) {
  let busca = '';
  let carregando = false;
  let erroCarga = '';

  function filteredSetorPagamentos() {
    const filter = state.pagamentosSetorFilter || 'todos';
    const todas = state.financeiroPagamentos || [];
    return filter === 'todos' ? todas : todas.filter((row) => setorDoPagamento(row) === filter);
  }

  function textoBuscaPagamento(row) {
    const { gestor, coordenacao } = getGestorCoordenacao(row);
    return normalize([
      origemPagamentoLabel(row.origem || row.setor || row.modulo_origem), codigoPagamento(row), gestor, coordenacao,
      row.descricao || row.conteudo || row.observacao || row.detalhes, row.forma_pagamento, row.fornecedor || row.favorecido || row.beneficiario,
      row.status || row.situacao, money(row.valor || row.valor_total || row.total),
    ].join(' '));
  }

  function renderSetorPagamentos() {
    const tbody = document.getElementById('setorPagamentosTbody');
    if (!tbody) return;
    const todas = state.financeiroPagamentos || [];
    const filtro = state.pagamentosSetorFilter || 'todos';
    const contagem = {};
    todas.forEach((row) => { const setor = setorDoPagamento(row); contagem[setor] = (contagem[setor] || 0) + 1; });
    const doSetor = filteredSetorPagamentos();
    const q = normalize(busca);
    const rows = q ? doSetor.filter((row) => textoBuscaPagamento(row).includes(q)) : doSetor;

    const kpis = document.getElementById('setorPagKpis');
    if (kpis) {
      kpis.innerHTML = cardFiltro({ filtro: 'todos', atributo: 'data-setor-pay', label: 'Todos', tone: 'blue', icone: 'total', valor: String(todas.length), ativo: filtro === 'todos' })
        + SETORES.filter(([chave]) => contagem[chave] || filtro === chave)
          .map(([chave, label, tone, icone]) => cardFiltro({ filtro: chave, atributo: 'data-setor-pay', label, tone, icone, valor: String(contagem[chave] || 0), ativo: filtro === chave })).join('');
    }
    const chip = document.querySelector('#tab-pagamentos [data-chip]');
    if (chip) {
      const setor = SETORES.find(([chave]) => chave === filtro);
      chip.innerHTML = setor ? `<span class="fm-chip">Filtro: ${esc(setor[1])} <button type="button" data-limpar-filtro aria-label="Limpar filtro" title="Limpar filtro">✕</button></span>` : '';
    }
    const contador = document.getElementById('setorPagCount');
    if (contador) contador.textContent = `${rows.length} pagamento(s) · ${money(rows.reduce((soma, row) => soma + Number(row.valor || row.valor_total || row.total || 0), 0))}`;

    if (carregando && !todas.length) {
      tbody.innerHTML = '<tr><td colspan="8" class="fm-empty">Carregando pagamentos enviados pelos setores...</td></tr>';
      return;
    }
    if (erroCarga && !todas.length) {
      tbody.innerHTML = `<tr><td colspan="8" class="fm-empty">${erroCarga}</td></tr>`;
      return;
    }
    if (!rows.length) {
      const vazio = q ? 'Nenhum pagamento encontrado para a busca.'
        : (filtro === 'todos' ? 'Nenhum pagamento pendente.' : 'Nenhum pagamento localizado para o filtro selecionado.');
      tbody.innerHTML = `<tr><td colspan="8" class="fm-empty">${vazio}</td></tr>`;
      return;
    }
    tbody.innerHTML = rows.map((row) => {
      const status = row.status || row.situacao || 'PENDENTE';
      const dtRaw = row.created_at || row.data_solicitacao || row.solicitado_em || row.data_hora || row.data;
      const dt = dtRaw ? new Date(dtRaw) : null;
      const dtDate = dt && !isNaN(dt) ? dt.toLocaleDateString('pt-BR') : '-';
      const dtTime = dt && !isNaN(dt) ? dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '';
      const { gestor, coordenacao } = getGestorCoordenacao(row);
      const selo = { pago: 'ok', danger: 'err', pendente: 'warn' }[statusPagamentoClass(status)] || '';
      const id = row.id;
      return `<tr>
        <td><strong>${esc(origemPagamentoLabel(row.origem || row.setor || row.modulo_origem))}</strong>${codigoPagamento(row) ? `<small class="fin-cod">${esc(codigoPagamento(row))}</small>` : ''}</td>
        <td style="white-space:nowrap">${dtDate}${dtTime ? `<span class="fm-prazo-dia">${dtTime}</span>` : ''}</td>
        <td>${esc(gestor) || '<span class="spay-empty">—</span>'}</td>
        <td>${esc(coordenacao) || '<span class="spay-empty">—</span>'}</td>
        <td>${renderConteudoHtml(row)}</td>
        <td style="white-space:nowrap"><b>${money(row.valor || row.valor_total || row.total)}</b></td>
        <td><span class="fm-badge ${selo}">${esc(status)}</span></td>
        <td>
          <div class="fin-pay-actions fm-actions">
            ${isBoleto(row)
              ? iconBtn('data-ok-setor', id, 'anexo', 'OK — ciente do boleto', 'ok')
              : iconBtn('data-pagar-setor', id, 'termo', 'Pagar (anexar comprovante)', 'dinheiro')}
            ${iconBtn('data-recusar-setor', id, 'danger', 'Recusar', 'erro')}
          </div>
        </td>
      </tr>`;
    }).join('');
    tbody.querySelectorAll('[data-pagar-setor]').forEach((btn) => {
      btn.addEventListener('click', () => abrirModalComprovantePagamento(btn.dataset.pagarSetor));
    });
    tbody.querySelectorAll('[data-ok-setor]').forEach((btn) => {
      btn.addEventListener('click', () => abrirModalCienteBoleto(btn.dataset.okSetor));
    });
    tbody.querySelectorAll('[data-recusar-setor]').forEach((btn) => {
      btn.addEventListener('click', () => recusarPagamento(btn.dataset.recusarSetor));
    });
  }

  // Cards de setor (clicar filtra, clicar de novo limpa), ✕ do chip e a busca: ouvintes da aba, ligados uma vez.
  function ligarSetorPagamentos() {
    const aba = document.getElementById('tab-pagamentos');
    if (!aba) return;
    aba.addEventListener('click', (event) => {
      const card = event.target.closest('[data-setor-pay]');
      const limpar = event.target.closest('[data-limpar-filtro]');
      if (!card && !limpar) return;
      const atual = state.pagamentosSetorFilter || 'todos';
      state.pagamentosSetorFilter = limpar || card.dataset.setorPay === atual ? 'todos' : card.dataset.setorPay;
      renderSetorPagamentos();
    });
    aba.querySelector('#setorPagBusca')?.addEventListener('input', (event) => { busca = event.target.value; renderSetorPagamentos(); });
  }

  async function loadSetorPagamentos() {
    carregando = true;
    erroCarga = '';
    renderSetorPagamentos();

    const [pagamentosRes, comprasRes] = await Promise.all([
      supabase
        .from('financeiro_pagamentos')
        .select('*')
        .neq('status', 'PAGO')
        .neq('status', 'RECUSADO')
        .neq('status', 'AGENDADO') // boleto com "OK — Ciente": fica a pagar no GRM
        .is('comprovante_url', null)
        .order('created_at', { ascending: false })
        .limit(500),
      supabase
        .from('compras_itens')
        .select('*, compras_solicitacoes(*)')
        .in('status', ['pendente_pagamento'])
        .is('comprovante_url', null)
        .order('updated_at', { ascending: false })
        .limit(500)
    ]);

    const pagamentos = pagamentosRes.error ? [] : (pagamentosRes.data || []);
    const comprasAgrupadas = comprasRes.error ? [] : groupCompraPagamentos(comprasRes.data || []);

    // Deduplica por id de compras_itens (não por texto de forma+dados — a
    // partir de agora um financeiro_pagamentos de COMPRAS grava
    // compras_item_ids com os itens reais que ele cobre, mais confiável que
    // comparar texto livre que pode divergir entre o registro consolidado do
    // lote e o item individual).
    const idsJaCobertos = new Set(
      pagamentos
        .filter((row) => normalize(row.origem || row.setor || row.modulo_origem).includes('compra'))
        .flatMap((row) => Array.isArray(row.compras_item_ids) ? row.compras_item_ids.map(String) : [])
    );

    const comprasSemDuplicar = comprasAgrupadas.filter((row) => {
      const ids = (row._compra_item_ids || []).map((id) => String(id || '').replace(/^compra_/, ''));
      if (ids.length && ids.every((id) => idsJaCobertos.has(id))) return false;
      return true;
    });

    carregando = false;
    if (pagamentosRes.error && comprasRes.error) {
      erroCarga = `${esc(pagamentosRes.error.message)}<br>${esc(comprasRes.error.message)}<br>Execute a migration de pagamentos do financeiro no Supabase.`;
      renderSetorPagamentos();
      return;
    }

    state.financeiroPagamentos = [...comprasSemDuplicar, ...pagamentos].sort((a, b) => {
      const da = new Date(a.created_at || a.data_solicitacao || 0).getTime();
      const db = new Date(b.created_at || b.data_solicitacao || 0).getTime();
      return db - da;
    });

    renderSetorPagamentos();
  }

  function getPagamentoRowById(id) {
    return (state.financeiroPagamentos || []).find((row) => String(row.id) === String(id));
  }

  function abrirModalComprovantePagamento(id) {
    const row = getPagamentoRowById(id);
    if (!row) return;
    const modal = obterModal('finPagamentoModal');

    const dados = row.dados_pagamento || row.link_pagamento || row.chave_pix || row.boleto_url || '';
    const pixSection = isPix(row) && dados ? `
      <div class="fin-pix-box">
        <p>QR Code PIX</p>
        <img src="https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(gerarPayloadPix(dados, { valor: row.valor || row.valor_total || row.total, nome: row.favorecido_nome || row.fornecedor || row.favorecido || row.beneficiario, cidade: 'BRASIL' }))}" alt="QR Code PIX">
        <p class="fin-pix-chave">${esc(dados)}</p>
      </div>` : '';

    modal.innerHTML = htmlModal({
      titulo: 'Anexar comprovante',
      subtitulo: 'Após enviar, o comprovante retorna para o setor de origem.',
      idFechar: 'finPayClose',
      corpo: `
      <div class="pay-summary">
        <div class="pay-mini"><span>Setor</span><strong>${esc(origemPagamentoLabel(row.origem || row.setor || row.modulo_origem))}</strong></div>${codigoPagamento(row) ? `<div class="pay-mini"><span>Código</span><strong>${esc(codigoPagamento(row))}</strong></div>` : ''}
        <div class="pay-mini"><span>Valor</span><strong>${money(row.valor || row.valor_total || row.total)}</strong></div>
      </div>
      <div class="fin-pay-preview">${renderConteudoModal(row)}</div>
      ${pixSection}
      <div id="finPayItensWrap"></div>
      <div class="fin-field full">
        <label>Comprovante de pagamento</label>
        <input id="finPayComprovante" type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.xls,.xlsx">
      </div>
      <div class="fin-field full fin-wpp-box">
        <label class="fin-wpp-check">
          <input id="finPaySendWpp" type="checkbox" ${(row.contato || row.contato_fornecedor) ? 'checked' : ''}>
          <span>Enviar comprovante por WhatsApp ao fornecedor</span>
        </label>
        <input id="finPayWppPhone" class="fm-input" type="tel" placeholder="WhatsApp do fornecedor (ex: 5511999999999)" value="${esc(row.contato || row.contato_fornecedor || '')}">
      </div>`,
      rodape: `<span id="finPayFeedback" class="fin-feedback"></span><button class="fm-btn primary" id="finPaySend" type="button">ENVIAR</button>`,
    });
    abrirModal(modal, 'finPayClose');
    modal.querySelector('#finPaySend').onclick = () => enviarComprovantePagamento(row);
    carregarSeletorItensCompra(row, modal);
  }

  // Compra por link: cada item tem o próprio link/site e o Financeiro paga (e
  // recebe comprovante) separado — então o comprovante precisa dizer a quais
  // itens se refere. Só aparece para compras LINK com 2+ itens.
  async function carregarSeletorItensCompra(row, modal) {
    const wrap = modal.querySelector('#finPayItensWrap');
    if (!wrap) return;
    const isCompras = normalize(row.origem || row.setor || row.modulo_origem).includes('compra') || String(row.id).startsWith('compra_');
    const ids = idsItensCompra(row);
    if (!isCompras || ids.length < 2) return;
    const { data, error } = await supabase
      .from('compras_itens')
      .select('id, material, tamanho, quantidade, unidade, valor_total, forma_pagamento, dados_pagamento, status')
      .in('id', ids);
    if (error || !data?.length) return;
    const pendentes = data.filter((i) => i.status === 'pendente_pagamento');
    if (pendentes.length < 2 || !pendentes.some((i) => normalize(i.forma_pagamento) === 'link')) return;
    modal._itensCompra = pendentes;
    wrap.innerHTML = `<div class="fin-field full fin-itens-box">
      <label>Este comprovante se refere a quais itens?</label>
      ${pendentes.map((i) => `<label class="fin-itens-linha">
        <input type="checkbox" class="finPayItemChk" value="${esc(i.id)}" checked>
        <span><b>${esc(i.quantidade || i.unidade || 1)} un ${esc(i.material)}</b>${i.tamanho ? ` <small>(${esc(i.tamanho)})</small>` : ''}<br><small class="fin-itens-dados">${esc(i.dados_pagamento || '')}</small></span>
        <strong>${money(i.valor_total || 0)}</strong>
      </label>`).join('')}
      <small class="fin-itens-dados">Os itens não marcados continuam em "a pagar" para receber outro comprovante.</small>
    </div>`;
  }

  function abrirModalCienteBoleto(id) {
    const row = getPagamentoRowById(id);
    if (!row) return;
    const modal = obterModal('finBoletoModal');
    const dados = row.dados_pagamento || row.link_pagamento || row.boleto_url || '';
    const dadosHtml = isLinkDados(dados)
      ? `<a class="fin-link" href="${esc(ensureHttps(dados))}" target="_blank" rel="noopener">${esc(dados)}</a>`
      : `<strong class="fin-quebra">${esc(dados)}</strong>`;
    modal.innerHTML = htmlModal({
      titulo: 'Boleto registrado',
      subtitulo: 'Pagamento via boleto — será quitado na data de vencimento.',
      idFechar: 'finBoletoClose',
      corpo: `
      <div class="pay-summary">
        <div class="pay-mini"><span>Setor</span><strong>${esc(origemPagamentoLabel(row.origem || row.setor || row.modulo_origem))}</strong></div>${codigoPagamento(row) ? `<div class="pay-mini"><span>Código</span><strong>${esc(codigoPagamento(row))}</strong></div>` : ''}
        <div class="pay-mini"><span>Valor</span><strong>${money(row.valor || row.valor_total || row.total)}</strong></div>
      </div>
      <div class="fin-pay-preview">${renderConteudoModal(row)}</div>
      ${dados ? `<div class="pay-note">Boleto: ${dadosHtml}</div>` : ''}`,
      rodape: `<span id="finBoletoFeedback" class="fin-feedback"></span><button class="fm-btn ghost" id="finBoletoOk" type="button">OK — Ciente</button>`,
    });
    abrirModal(modal, 'finBoletoClose');
    // "OK — Ciente" só fechava o modal, sem gravar nada: o card de boleto
    // voltava PENDENTE pra sempre (achado 25/09, NF 2982 Callibra). Boleto é
    // meio de pagamento — não há comprovante pra anexar aqui; o registro
    // passa pra AGENDADO (ciente, pago no vencimento) e sai da lista. A
    // quitação em si o financeiro dá no GRM.
    modal.querySelector('#finBoletoOk').onclick = async () => {
      const btn = modal.querySelector('#finBoletoOk');
      const fb = modal.querySelector('#finBoletoFeedback');
      if (String(row.id).startsWith('compra_')) { modal.classList.remove('open'); return; }
      btn.disabled = true;
      btn.textContent = 'Salvando...';
      try {
        const { data: { session } } = await supabase.auth.getSession();
        let { error } = await supabase.from('financeiro_pagamentos').update({
          status: 'AGENDADO',
          atualizado_por: session?.user?.id || null,
          atualizado_por_nome: window.currentUser?.nome || session?.user?.email || null,
        }).eq('id', row.id);
        if (error && isMissingColumnError(error)) {
          ({ error } = await supabase.from('financeiro_pagamentos').update({ status: 'AGENDADO' }).eq('id', row.id));
        }
        if (error) throw error;
        modal.classList.remove('open');
        await loadSetorPagamentos();
      } catch (err) {
        btn.disabled = false;
        btn.textContent = 'OK — Ciente';
        if (fb) { fb.textContent = `Erro: ${err.message}`; fb.className = 'fin-feedback err'; }
      }
    };
  }

  function recusarPagamento(id) {
    const row = getPagamentoRowById(id);
    if (!row) return;
    const modal = obterModal('finRecusaModal');
    modal.innerHTML = htmlModal({
      titulo: 'Recusar pagamento',
      subtitulo: 'Informe o motivo da recusa para o setor.',
      idFechar: 'finRecusaClose',
      corpo: `
      <div class="pay-summary">
        <div class="pay-mini"><span>Setor</span><strong>${esc(origemPagamentoLabel(row.origem || row.setor || row.modulo_origem))}</strong></div>${codigoPagamento(row) ? `<div class="pay-mini"><span>Código</span><strong>${esc(codigoPagamento(row))}</strong></div>` : ''}
        <div class="pay-mini"><span>Valor</span><strong>${money(row.valor || row.valor_total || row.total)}</strong></div>
      </div>
      <div class="fin-field full">
        <label>Motivo da recusa <span class="fin-obrigatorio">*</span></label>
        <textarea id="finRecusaMotivo" class="fm-input" rows="4" placeholder="Descreva o motivo para recusar este pagamento..."></textarea>
      </div>`,
      rodape: `<span id="finRecusaFeedback" class="fin-feedback"></span><button class="fm-btn fin-btn-recusar" id="finRecusaConfirm" type="button">CONFIRMAR RECUSA</button>`,
    });
    abrirModal(modal, 'finRecusaClose');
    modal.querySelector('#finRecusaConfirm').onclick = () => confirmarRecusa(row, modal);
  }

  async function confirmarRecusa(row, modal) {
    const motivoEl = modal.querySelector('#finRecusaMotivo');
    const fb = modal.querySelector('#finRecusaFeedback');
    const motivo = (motivoEl?.value || '').trim();
    if (!motivo) {
      if (fb) { fb.textContent = 'Informe o motivo da recusa.'; fb.className = 'fin-feedback err'; }
      motivoEl?.focus();
      return;
    }
    const confirmBtn = modal.querySelector('#finRecusaConfirm');
    if (confirmBtn) { confirmBtn.disabled = true; confirmBtn.textContent = 'Recusando...'; }
    if (fb) { fb.textContent = ''; }
    try {
      // 'recusado_financeiro' é distinto de 'recusado' (recusa do próprio
      // Compras antes de comprar) — aparece na aba Recusados do Painel de
      // Compras rotulado "Recusa Financeiro".
      const isCompra = String(row.id || '').startsWith('compra_') || row._source_table === 'compras_itens' || row._source_table === 'compras_itens_group';
      if (isCompra) {
        const ids = (row._compra_item_ids || []).map((id) => String(id || '').replace(/^compra_/, '')).filter(Boolean);
        let q = supabase.from('compras_itens');
        if (ids.length) {
          q = q.update({ status: 'recusado_financeiro', motivo_recusa: motivo }).in('id', ids);
        } else {
          const rawId = String(row.origem_id || row.id || '').replace(/^compra_grp_|^compra_/, '');
          q = q.update({ status: 'recusado_financeiro', motivo_recusa: motivo }).eq('id', rawId);
        }
        let { error } = await q;
        if (error && isMissingColumnError(error)) {
          let retry = supabase.from('compras_itens');
          if (ids.length) retry = retry.update({ status: 'recusado_financeiro' }).in('id', ids);
          else {
            const rawId = String(row.origem_id || row.id || '').replace(/^compra_grp_|^compra_/, '');
            retry = retry.update({ status: 'recusado_financeiro' }).eq('id', rawId);
          }
          const res = await retry;
          if (res.error) throw res.error;
        } else if (error) {
          throw error;
        }
      } else {
        const rawId = String(row.id || '');
        let { error } = await supabase.from('financeiro_pagamentos').update({ status: 'RECUSADO', motivo_recusa: motivo }).eq('id', rawId);
        if (error && isMissingColumnError(error)) {
          const res = await supabase.from('financeiro_pagamentos').update({ status: 'RECUSADO' }).eq('id', rawId);
          if (res.error) throw res.error;
        } else if (error) {
          throw error;
        }
        // Registro real de financeiro_pagamentos: propaga a recusa de volta
        // pros compras_itens ligados (compras_item_ids), senão o Compras
        // nunca fica sabendo que o Financeiro recusou.
        const itemIds = Array.isArray(row.compras_item_ids) && row.compras_item_ids.length
          ? row.compras_item_ids.map(String)
          : (row.origem_id ? [String(row.origem_id)] : []);
        if (itemIds.length) {
          await supabase.from('compras_itens').update({ status: 'recusado_financeiro', motivo_recusa: motivo }).in('id', itemIds);
        }
      }
      modal.classList.remove('open');
      await loadSetorPagamentos();
    } catch (err) {
      if (fb) { fb.textContent = `Erro: ${err.message}`; fb.className = 'fin-feedback err'; }
      if (confirmBtn) { confirmBtn.disabled = false; confirmBtn.textContent = 'CONFIRMAR RECUSA'; }
    }
  }

  async function enviarComprovantePagamento(row) {
    const fb = document.getElementById('finPayFeedback');
    const file = document.getElementById('finPayComprovante')?.files?.[0];
    try {
      const itensCompra = document.getElementById('finPagamentoModal')?._itensCompra || null;
      let parcial = null;
      if (itensCompra && document.querySelector('.finPayItemChk')) {
        const marcados = new Set([...document.querySelectorAll('.finPayItemChk:checked')].map((el) => el.value));
        if (!marcados.size) throw new Error('Marque pelo menos um item a que o comprovante se refere.');
        if (marcados.size < itensCompra.length) {
          parcial = {
            sel: itensCompra.filter((i) => marcados.has(String(i.id))),
            rest: itensCompra.filter((i) => !marcados.has(String(i.id))),
          };
        }
      }
      if (fb) {
        fb.textContent = 'Enviando comprovante...';
        fb.className = 'fin-feedback';
      }
      const comprovanteUrl = await uploadComprovantePagamento(file, row);
      const isCompras = normalize(row.origem || row.setor || row.modulo_origem).includes('compra') || String(row.id).startsWith('compra_');

      if (parcial) {
        await enviarComprovanteParcial(row, parcial.sel, parcial.rest, comprovanteUrl);
      } else if (String(row.id).startsWith('compra_grp_') || String(row.id).startsWith('compra_')) {
        await updateComprasComprovante(row, comprovanteUrl);
        await ativarEpiRegistros(row);
      } else {
        const payload = { status: 'PAGO', pago_em: new Date().toISOString(), comprovante_url: comprovanteUrl };
        let { error } = await supabase.from('financeiro_pagamentos').update(payload).eq('id', row.id);
        if (error && isMissingColumnError(error)) {
          const retry = await supabase.from('financeiro_pagamentos').update({ status: 'PAGO', comprovante_url: comprovanteUrl }).eq('id', row.id);
          error = retry.error;
        }
        if (error) throw error;
        if (isCompras) {
          await updateComprasComprovante(row, comprovanteUrl);
          await ativarEpiRegistros(row);
        }
      }

      const sendWpp = document.getElementById('finPaySendWpp')?.checked;
      const wppPhone = document.getElementById('finPayWppPhone')?.value?.trim();
      if (sendWpp && wppPhone) {
        if (fb) { fb.textContent = 'Enviando por WhatsApp...'; fb.className = 'fin-feedback'; }
        const fornecedor = row.favorecido || row.fornecedor || row.beneficiario || '';
        const wppResult = await sendComprovanteViaBotConversa(wppPhone, comprovanteUrl, fornecedor);
        if (!wppResult.ok && fb) {
          fb.textContent = `Comprovante salvo, mas WhatsApp falhou: ${wppResult.error}`;
          fb.className = 'fin-feedback err';
          await loadSetorPagamentos();
          return;
        }
      }

      document.getElementById('finPagamentoModal')?.classList.remove('open');
      await loadSetorPagamentos();
    } catch (error) {
      if (fb) {
        fb.textContent = error.message || 'Erro ao enviar comprovante.';
        fb.className = 'fin-feedback err';
      }
    }
  }

  return { renderSetorPagamentos, loadSetorPagamentos, ligarSetorPagamentos };
}

export { criarSetorPagamentos };
