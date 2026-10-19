// Financeiro — aba Pagamentos dos setores (compras, RH, frotas…): lista, modais, comprovante, recusa e PIX.
// Extraído de assets/js/financeiro.js (renderContent) em 15/10/2026. Cada fábrica criarX(ctx) recebe o contexto da tela
// ({ content, userContext } + funções das fábricas anteriores) e devolve as funções que as outras partes usam. O código
// das funções e constantes foi movido sem alteração. Para publicar uma mudança em qualquer módulo de
// assets/js/modules/financeiro/, troque o token ?v=20261019-fin5 em TODOS os imports internos e nos carregadores
// (assets/js/financeiro.js, financeiro.html): tests/financeiro-modulos-versao.test.mjs garante que fiquem iguais.
import { supabase } from '../../supabaseClient.js';
import { safe, state, esc, normalize, money, isMissingColumnError, hashText } from './util.js?v=20261019-fin5';
import { origemPagamentoLabel, statusPagamentoClass, ensureHttps, isBoleto, isPix, uploadComprovantePagamento } from './pagamentos.js?v=20261019-fin5';

function criarSetorPagamentos(ctx) {
  function filteredSetorPagamentos() {
    const filter = state.pagamentosSetorFilter || 'todos';
    if (filter === 'todos') return state.financeiroPagamentos || [];
    if (filter === 'OUTROS') {
      return (state.financeiroPagamentos || []).filter((row) => {
        const origem = normalize(row.origem || row.setor || row.modulo_origem);
        return !origem.includes('compra') && !origem.includes('hotel') && !origem.includes('hosped') && !origem.includes('auditoria') && !origem.includes('frota') && origem !== 'rh' && !origem.includes('recursos humanos');
      });
    }
    return (state.financeiroPagamentos || []).filter((row) => {
      const origem = normalize(row.origem || row.setor || row.modulo_origem);
      return normalize(filter).split(' ').every((part) => origem.includes(part)) ||
        (filter === 'HOSPEDAGEM' && (origem.includes('hotel') || origem.includes('hosped'))) ||
        (filter === 'RH' && (origem === 'rh' || origem.includes('recursos humanos'))) ||
        (filter === 'AUDITORIA' && origem.includes('auditoria')); 
    });
  }

  function getGestorCoordenacao(row) {
    const gestor = row._gestor || row.gestor || row.solicitante || '';
    const coordenacao = row._coordenacao || row.coordenacao || '';
    if (gestor || coordenacao) return { gestor, coordenacao };
    const texto = String(row.descricao || row.conteudo || '');
    const gMatch = texto.match(/gestor:\s*(.+)/i);
    const cMatch = texto.match(/coordena[çc][ãa]o:\s*(.+)/i);
    return { gestor: gMatch ? gMatch[1].trim() : '', coordenacao: cMatch ? cMatch[1].trim() : '' };
  }

  function isLinkDados(value) {
    const s = String(value || '').trim();
    return /^https?:\/\//i.test(s) || /^[\w.-]+\.[a-z]{2,}(\/|$)/i.test(s);
  }

  function renderConteudoHtml(row) {
    const descricaoBase = row.descricao || row.conteudo || row.observacao || row.detalhes || '';
    const linhas = String(descricaoBase)
      .split(/\n+/)
      .map((l) => l.trim())
      .filter(Boolean)
      .filter((l) => !/^gestor\s*:/i.test(l))
      .filter((l) => !/^coordena[çc][ãa]o\s*:/i.test(l))
      .filter((l) => !/^forma\s*:/i.test(l))
      .filter((l) => !/^dados\s*:/i.test(l))
      .filter((l) => !/^tipo\s*:/i.test(l));

    const forma = row.forma_pagamento || '';
    const dados = row.dados_pagamento || row.link_pagamento || row.chave_pix || row.boleto_url || '';

    const parts = [];
    if (linhas.length) parts.push(`<div class="spay-items">${linhas.map((l) => esc(l)).join('<br>')}</div>`);
    if (forma) parts.push(`<div class="spay-meta"><span class="spay-meta-label">Forma:</span> ${esc(forma)}</div>`);
    if (dados) {
      // dados pode ser um bloco de várias linhas (link do produto + endereço
      // de entrega, um por linha) — linkifica só o trecho que é URL em cada
      // linha, em vez de tentar tratar o bloco inteiro como um link só.
      // Fica recolhido por padrão (details/summary) pra não estourar a
      // altura da linha da tabela com link grande + endereço.
      const dadosHtml = String(dados)
        .split(/\n+/)
        .map((linha) => {
          const m = linha.match(/https?:\/\/\S+/i);
          if (!m) return esc(linha);
          const url = m[0];
          const antes = linha.slice(0, m.index);
          const depois = linha.slice(m.index + url.length);
          return `${esc(antes)}<a class="spay-link" href="${esc(ensureHttps(url))}" target="_blank" rel="noopener">${esc(url)}</a>${esc(depois)}`;
        })
        .join('<br>');
      parts.push(`<details class="spay-dados-details"><summary>Ver dados${isLinkDados(dados) || /https?:\/\//i.test(dados) ? ' e link' : ''}</summary><div class="spay-meta">${dadosHtml}</div></details>`);
    }
    if (!parts.length) return `<span class="spay-empty">—</span>`;
    return parts.join('');
  }

  // Código do pagamento (PAG-AAMM-NNN): no registro real vem de `codigo`; nas linhas
  // derivadas de compras_itens, `codigo` é o do item — o do pagamento fica em _codigo_pagamento.
  function codigoPagamento(row) {
    return String(row.id || '').startsWith('compra_') ? (row._codigo_pagamento || '') : (row.codigo || '');
  }

  function renderSetorPagamentos() {
    const tbody = document.getElementById('setorPagamentosTbody');
    if (!tbody) return;
    const rows = filteredSetorPagamentos();
    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="8" class="fin-empty">Nenhum pagamento localizado para o filtro selecionado.</td></tr>';
      return;
    }
    tbody.innerHTML = rows.map((row) => {
      const status = row.status || row.situacao || 'PENDENTE';
      const dtRaw = row.created_at || row.data_solicitacao || row.solicitado_em || row.data_hora || row.data;
      const dt = dtRaw ? new Date(dtRaw) : null;
      const dtDate = dt && !isNaN(dt) ? dt.toLocaleDateString('pt-BR') : '-';
      const dtTime = dt && !isNaN(dt) ? dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '';
      const { gestor, coordenacao } = getGestorCoordenacao(row);
      return `<tr>
        <td><strong>${esc(origemPagamentoLabel(row.origem || row.setor || row.modulo_origem))}</strong>${codigoPagamento(row) ? `<br><small style="color:#93c5fd;white-space:nowrap">${esc(codigoPagamento(row))}</small>` : ''}</td>
        <td style="white-space:nowrap">${dtDate}${dtTime ? `<br><small style="color:#6b7280">${dtTime}</small>` : ''}</td>
        <td>${esc(gestor) || '<span class="spay-empty">—</span>'}</td>
        <td>${esc(coordenacao) || '<span class="spay-empty">—</span>'}</td>
        <td>${renderConteudoHtml(row)}</td>
        <td style="white-space:nowrap">${money(row.valor || row.valor_total || row.total)}</td>
        <td><span class="fin-status ${statusPagamentoClass(status)}">${esc(status)}</span></td>
        <td>
          <div class="fin-pay-actions" style="flex-wrap:wrap;gap:4px">
            ${isBoleto(row)
              ? `<button class="btn btn-secondary fin-small" data-ok-setor="${esc(row.id)}" type="button">OK</button>`
              : `<button class="btn btn-primary fin-small" data-pagar-setor="${esc(row.id)}" type="button">PAGAR</button>`}
            <button class="btn fin-small fin-btn-recusar" data-recusar-setor="${esc(row.id)}" type="button">RECUSAR</button>
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

  function compraItemToPagamento(row) {
    const s = row.compras_solicitacoes || {};
    const quantidade = row.quantidade || row.unidade || 1;
    const partes = [
      `- ${quantidade} un ${row.material || '-'}`,
      row.tamanho ? `  Tamanho/Detalhe: ${row.tamanho}` : '',
      row.colaborador_nome ? `  Colaborador: ${row.colaborador_nome}` : ''
    ].filter(Boolean);
    return {
      ...row,
      id: `compra_${row.id}`,
      _source_table: 'compras_itens',
      origem: 'COMPRAS',
      origem_id: row.id,
      descricao: partes.join('\n'),
      conteudo: partes.join('\n'),
      fornecedor: row.fornecedor || row.favorecido || s.fornecedor || '',
      favorecido: row.fornecedor || row.favorecido || s.fornecedor || '',
      contato: row.contato || '',
      contato_fornecedor: s.telefone_fornecedor || row.contato_fornecedor || '',
      valor: row.valor_total || 0,
      status: row.status === 'aguardando_nf' ? 'AGUARDANDO NF' : 'PENDENTE',
      created_at: row.updated_at || row.created_at || s.created_at || s.data_solicitacao,
      data_solicitacao: s.data_solicitacao || row.created_at,
      dados_pagamento: row.dados_pagamento || '',
      forma_pagamento: row.forma_pagamento || '',
      comprovante_url: row.comprovante_url || '',
      _codigo_pagamento: row.codigo_pagamento || '',
      _raw_compra_item_id: row.id,
      _compra_item_ids: [row.id],
      _gestor: s.solicitante || '',
      _coordenacao: s.coordenacao || ''
    };
  }

  function groupCompraPagamentos(rows = []) {
    const map = new Map();
    rows.forEach((row) => {
      const base = compraItemToPagamento(row);
      const key = [
        base.forma_pagamento || '',
        base.dados_pagamento || '',
        base._gestor || '',
        base._coordenacao || '',
        base.status || ''
      ].map((v) => normalize(v)).join('|');

      if (!map.has(key)) {
        map.set(key, {
          ...base,
          id: `compra_grp_${Math.abs(hashText(key).replace('fin_', '').split('_')[0] || Date.now())}`,
          origem_id: `grupo_${key}`,
          descricao: '',
          conteudo: '',
          valor: 0,
          _source_table: 'compras_itens_group',
          _compra_item_ids: [],
          _codigo_pagamento: '',
          _raw_compra_item_id: null
        });
      }

      const group = map.get(key);
      group.valor += Number(base.valor || 0);
      group._compra_item_ids.push(...(base._compra_item_ids || []));
      if (base._codigo_pagamento && !String(group._codigo_pagamento || '').split(' / ').includes(base._codigo_pagamento)) {
        group._codigo_pagamento = group._codigo_pagamento ? `${group._codigo_pagamento} / ${base._codigo_pagamento}` : base._codigo_pagamento;
      }
      group.descricao += (group.descricao ? '\n' : '') + base.descricao;
      group.conteudo = group.descricao;
      if (new Date(base.created_at || 0).getTime() > new Date(group.created_at || 0).getTime()) {
        group.created_at = base.created_at;
      }
    });

    return [...map.values()];
  }

  async function loadSetorPagamentos() {
    const tbody = document.getElementById('setorPagamentosTbody');
    if (tbody) tbody.innerHTML = '<tr><td colspan="8" class="fin-empty">Carregando pagamentos enviados pelos setores...</td></tr>';

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

    if (pagamentosRes.error && comprasRes.error) {
      if (tbody) tbody.innerHTML = `<tr><td colspan="8" class="fin-empty">${esc(pagamentosRes.error.message)}<br>${esc(comprasRes.error.message)}<br>Execute a migration de pagamentos do financeiro no Supabase.</td></tr>`;
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

  function renderConteudoModal(row) {
    const descricaoBase = row.descricao || row.conteudo || row.observacao || row.detalhes || '';
    const linhas = String(descricaoBase).split(/\n+/).map((l) => l.trim()).filter(Boolean)
      .filter((l) => !/^tipo\s*:/i.test(l))
      .filter((l) => !/^forma\s*:/i.test(l))
      .filter((l) => !/^dados\s*:/i.test(l));
    const dados = row.dados_pagamento || row.link_pagamento || row.chave_pix || row.boleto_url || '';
    const forma = row.forma_pagamento || '';
    const fornecedor = row.fornecedor || row.favorecido || row.beneficiario || '';
    const contato = row.contato || row.contato_fornecedor || '';
    const parts = [];
    if (linhas.length) parts.push(linhas.map((l) => esc(l)).join('<br>'));
    if (fornecedor) parts.push(`Fornecedor: ${esc(fornecedor)}`);
    if (contato) parts.push(`Contato: ${esc(contato)}`);
    if (forma) parts.push(`Forma: <strong>${esc(forma)}</strong>`);
    if (dados) {
      // dados pode ter várias linhas (link do produto + "Entrega: ...") —
      // linkifica só o trecho que é URL em cada linha, não o bloco inteiro.
      const dadosDisplay = String(dados)
        .split(/\n+/)
        .map((linha) => {
          const m = linha.match(/https?:\/\/\S+/i);
          if (!m) return `<strong style="word-break:break-all">${esc(linha)}</strong>`;
          const url = m[0];
          const antes = linha.slice(0, m.index);
          const depois = linha.slice(m.index + url.length);
          return `${esc(antes)}<a href="${esc(ensureHttps(url))}" target="_blank" rel="noopener" style="color:#34d399;word-break:break-all">${esc(url)}</a>${esc(depois)}`;
        })
        .join('<br>');
      parts.push(`Dados: ${dadosDisplay}`);
    }
    // Itens derivados direto de compras_itens (não agrupados num
    // financeiro_pagamentos real) trazem entrega_tipo/entrega_endereco como
    // colunas próprias, não dentro de dados_pagamento — mostra também.
    if (row.entrega_tipo === 'entrega' && row.entrega_endereco) {
      parts.push(`Entrega: <strong>${esc(row.entrega_endereco)}</strong>`);
    } else if (row.entrega_tipo === 'retirada') {
      parts.push(`Retirada`);
    }
    return parts.join('<br>') || `Solicitação de ${esc(origemPagamentoLabel(row.origem || row.setor || row.modulo_origem))}`;
  }

  function crc16Pix(str) {
    let crc = 0xFFFF;
    for (const ch of str) {
      crc ^= ch.charCodeAt(0) << 8;
      for (let i = 0; i < 8; i++) crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) & 0xFFFF : (crc << 1) & 0xFFFF;
    }
    return crc;
  }

  function gerarPayloadPix(chave, { valor, nome, cidade } = {}) {
    const tlv = (id, v) => `${id}${String(v.length).padStart(2, '0')}${v}`;
    const gui = tlv('00', 'BR.GOV.BCB.PIX') + tlv('01', chave);
    const valorStr = valor ? String(parseFloat(valor).toFixed(2)) : '';
    const nomeLimpo = (nome || 'Pagamento PIX').replace(/[^A-Za-z0-9 ]/g, ' ').trim().substring(0, 25);
    const cidadeLimpa = (cidade || 'BRASIL').replace(/[^A-Za-z0-9 ]/g, ' ').trim().substring(0, 15);
    const payload = [
      tlv('00', '01'),
      tlv('01', '12'),
      tlv('26', gui),
      tlv('52', '0000'),
      tlv('53', '986'),
      valorStr ? tlv('54', valorStr) : '',
      tlv('58', 'BR'),
      tlv('59', nomeLimpo),
      tlv('60', cidadeLimpa),
      tlv('62', tlv('05', '***')),
      '6304',
    ].join('');
    return payload + crc16Pix(payload).toString(16).toUpperCase().padStart(4, '0');
  }

  async function sendComprovanteViaBotConversa(phone, comprovanteUrl, fornecedor) {
    const tel = String(phone || '').replace(/\D/g, '');
    if (!tel) return { ok: false, error: 'Telefone inválido.' };
    try {
      const mensagem = `Olá${fornecedor ? `, ${fornecedor}` : ''}! Segue o comprovante de pagamento referente à sua solicitação.`;
      const { data, error } = await supabase.functions.invoke('botconversa-send', {
        body: { phone: tel, message: mensagem, fileUrl: comprovanteUrl, nome: fornecedor || '' }
      });
      if (error) return { ok: false, error: error.message || 'Erro na Edge Function.' };
      return data?.ok ? { ok: true } : { ok: false, error: data?.error || 'Falha ao enviar.' };
    } catch (e) {
      return { ok: false, error: e.message || 'Erro ao conectar.' };
    }
  }

  function abrirModalComprovantePagamento(id) {
    const row = getPagamentoRowById(id);
    if (!row) return;
    let modal = document.getElementById('finPagamentoModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'finPagamentoModal';
      modal.className = 'fin-pay-modal';
      document.body.appendChild(modal);
    }

    const dados = row.dados_pagamento || row.link_pagamento || row.chave_pix || row.boleto_url || '';
    const pixSection = isPix(row) && dados ? `
      <div style="text-align:center;margin:16px 0;padding:16px;background:rgba(52,211,153,.06);border:1px solid rgba(52,211,153,.18);border-radius:14px">
        <p style="color:#94a3b8;font-size:12px;text-transform:uppercase;letter-spacing:.06em;margin:0 0 12px">QR Code PIX</p>
        <img src="https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(gerarPayloadPix(dados, { valor: row.valor || row.valor_total || row.total, nome: row.favorecido_nome || row.fornecedor || row.favorecido || row.beneficiario, cidade: 'BRASIL' }))}" alt="QR Code PIX" style="width:200px;height:200px;border-radius:10px;background:#fff;padding:6px;display:block;margin:0 auto">
        <p style="color:#e2e8f0;font-size:13px;margin:10px 0 0;word-break:break-all">${esc(dados)}</p>
      </div>` : '';

    modal.innerHTML = `<div class="fin-pay-modal-card">
      <div class="fin-head">
        <div>
          <h3>Anexar comprovante</h3>
          <p>Após enviar, o comprovante retorna para o setor de origem.</p>
        </div>
        <button class="btn btn-secondary" id="finPayClose" type="button">Fechar</button>
      </div>
      <div class="pay-summary">
        <div class="pay-mini"><span>Setor</span><strong>${esc(origemPagamentoLabel(row.origem || row.setor || row.modulo_origem))}</strong></div>${codigoPagamento(row) ? `<div class="pay-mini"><span>Código</span><strong>${esc(codigoPagamento(row))}</strong></div>` : ''}
        <div class="pay-mini"><span>Valor</span><strong>${money(row.valor || row.valor_total || row.total)}</strong></div>
      </div>
      <div class="fin-pay-preview" style="line-height:1.7;padding:14px;border:1px solid rgba(148,163,184,.14);border-radius:12px;background:rgba(15,23,42,.5);color:#e2e8f0;font-size:14px">${renderConteudoModal(row)}</div>
      ${pixSection}
      <div id="finPayItensWrap"></div>
      <div class="fin-field full mt-16">
        <label>Comprovante de pagamento</label>
        <input id="finPayComprovante" type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.xls,.xlsx">
      </div>
      <div class="fin-field full mt-16" style="padding:12px 14px;background:rgba(52,211,153,.04);border:1px solid rgba(52,211,153,.16);border-radius:12px">
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;margin-bottom:10px">
          <input id="finPaySendWpp" type="checkbox" ${(row.contato || row.contato_fornecedor) ? 'checked' : ''}>
          <span>Enviar comprovante por WhatsApp ao fornecedor</span>
        </label>
        <input id="finPayWppPhone" type="tel" placeholder="WhatsApp do fornecedor (ex: 5511999999999)" value="${esc(row.contato || row.contato_fornecedor || '')}" style="width:100%;background:rgba(15,23,42,.6);border:1px solid rgba(148,163,184,.2);border-radius:8px;padding:8px 12px;color:#e2e8f0;font-size:14px">
      </div>
      <div class="fin-actions-row mt-16">
        <button class="btn btn-primary" id="finPaySend" type="button">ENVIAR</button>
        <span id="finPayFeedback" class="fin-feedback"></span>
      </div>
    </div>`;
    modal.classList.add('open');
    modal.querySelector('#finPayClose').onclick = () => modal.classList.remove('open');
    modal.querySelector('#finPaySend').onclick = () => enviarComprovantePagamento(row);
    carregarSeletorItensCompra(row, modal);
  }

  function idsItensCompra(row) {
    const ids = Array.isArray(row._compra_item_ids) && row._compra_item_ids.length
      ? row._compra_item_ids
      : (Array.isArray(row.compras_item_ids) && row.compras_item_ids.length ? row.compras_item_ids : (row.origem_id && !String(row.origem_id).startsWith('grupo_') ? [row.origem_id] : []));
    return [...new Set(ids.map((id) => String(id || '').replace(/^compra_/, '')).filter(Boolean))];
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
    wrap.innerHTML = `<div class="fin-field full mt-16" style="padding:12px 14px;background:rgba(59,130,246,.06);border:1px solid rgba(96,165,250,.22);border-radius:12px">
      <label style="margin-bottom:8px">Este comprovante se refere a quais itens?</label>
      ${pendentes.map((i) => `<label style="display:flex;align-items:flex-start;gap:8px;cursor:pointer;margin:6px 0">
        <input type="checkbox" class="finPayItemChk" value="${esc(i.id)}" checked style="margin-top:3px">
        <span style="flex:1"><b>${esc(i.quantidade || i.unidade || 1)} un ${esc(i.material)}</b>${i.tamanho ? ` <small>(${esc(i.tamanho)})</small>` : ''}<br><small style="color:#94a3b8;word-break:break-all">${esc(i.dados_pagamento || '')}</small></span>
        <strong style="white-space:nowrap">${money(i.valor_total || 0)}</strong>
      </label>`).join('')}
      <small style="color:#94a3b8">Os itens não marcados continuam em "a pagar" para receber outro comprovante.</small>
    </div>`;
  }

  // Divide um pagamento real de Compras: os itens selecionados viram um
  // registro PAGO (com o comprovante) e o restante continua pendente.
  async function dividirPagamentoCompras(row, itensSel, itensRest, comprovanteUrl) {
    const soma = (lista) => lista.reduce((s, i) => s + Number(i.valor_total || 0), 0);
    const descricao = (lista) => `Compra: ${lista.map((i) => `${i.quantidade || i.unidade || 1} un ${i.material}`).join(' | ')}`;
    const linhas = String(row.dados_pagamento || '').split('\n');
    const prefixo = (i) => `${i.material}: `;
    const dadosDe = (lista, outros) => linhas
      .filter((l) => lista.some((i) => l.startsWith(prefixo(i))) || !outros.some((i) => l.startsWith(prefixo(i))))
      .join('\n') || null;
    const base = {
      origem: row.origem, origem_setor: row.origem_setor || 'COMPRAS', favorecido: row.favorecido, fornecedor: row.fornecedor,
      contato: row.contato, forma_pagamento: row.forma_pagamento, vencimento: row.vencimento || null,
    };
    // O pedaço pago mantém o código do pagamento com um sufixo (PAG-…-001-1), o resto fica com o original.
    let codigoPago = null;
    if (row.codigo) {
      const { count } = await supabase.from('financeiro_pagamentos').select('id', { count: 'exact', head: true }).like('codigo', `${row.codigo}-%`);
      codigoPago = `${row.codigo}-${(count || 0) + 1}`;
    }
    const { error: insErr } = await supabase.from('financeiro_pagamentos').insert({
      ...base,
      codigo: codigoPago,
      origem_id: itensSel[0].id,
      compras_item_ids: itensSel.map((i) => i.id),
      descricao: descricao(itensSel),
      valor: soma(itensSel),
      dados_pagamento: dadosDe(itensSel, itensRest),
      status: 'PAGO',
      pago_em: new Date().toISOString(),
      comprovante_url: comprovanteUrl,
    });
    if (insErr) throw insErr;
    const { error: updErr } = await supabase.from('financeiro_pagamentos').update({
      origem_id: itensRest[0].id,
      compras_item_ids: itensRest.map((i) => i.id),
      descricao: descricao(itensRest),
      valor: soma(itensRest),
      dados_pagamento: dadosDe(itensRest, itensSel),
    }).eq('id', row.id);
    if (updErr) throw updErr;
    if (codigoPago) await supabase.from('compras_itens').update({ codigo_pagamento: codigoPago }).in('id', itensSel.map((i) => i.id));
  }

  async function enviarComprovanteParcial(row, itensSel, itensRest, comprovanteUrl) {
    const idsSel = itensSel.map((i) => i.id);
    const { error } = await supabase.from('compras_itens')
      .update({ status: 'aguardando_nf', comprovante_url: comprovanteUrl })
      .in('id', idsSel).eq('status', 'pendente_pagamento');
    if (error) throw error;
    if (!String(row.id).startsWith('compra_')) await dividirPagamentoCompras(row, itensSel, itensRest, comprovanteUrl);
    await safe(() => supabase.from('rh_epi_registros').update({ status: 'pendente' }).in('compra_item_id', idsSel).eq('status', 'aguardando_pagamento'), null);
  }

  function abrirModalCienteBoleto(id) {
    const row = getPagamentoRowById(id);
    if (!row) return;
    let modal = document.getElementById('finBoletoModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'finBoletoModal';
      modal.className = 'fin-pay-modal';
      document.body.appendChild(modal);
    }
    const dados = row.dados_pagamento || row.link_pagamento || row.boleto_url || '';
    const dadosHtml = isLinkDados(dados)
      ? `<a href="${esc(ensureHttps(dados))}" target="_blank" rel="noopener" style="color:#34d399;word-break:break-all">${esc(dados)}</a>`
      : `<strong style="word-break:break-all">${esc(dados)}</strong>`;
    modal.innerHTML = `<div class="fin-pay-modal-card">
      <div class="fin-head">
        <div><h3>Boleto registrado</h3><p>Pagamento via boleto — será quitado na data de vencimento.</p></div>
        <button class="btn btn-secondary" id="finBoletoClose" type="button">Fechar</button>
      </div>
      <div class="pay-summary">
        <div class="pay-mini"><span>Setor</span><strong>${esc(origemPagamentoLabel(row.origem || row.setor || row.modulo_origem))}</strong></div>${codigoPagamento(row) ? `<div class="pay-mini"><span>Código</span><strong>${esc(codigoPagamento(row))}</strong></div>` : ''}
        <div class="pay-mini"><span>Valor</span><strong>${money(row.valor || row.valor_total || row.total)}</strong></div>
      </div>
      <div class="fin-pay-preview" style="line-height:1.7;padding:14px;border:1px solid rgba(148,163,184,.14);border-radius:12px;background:rgba(15,23,42,.5);color:#e2e8f0;font-size:14px">${renderConteudoModal(row)}</div>
      ${dados ? `<div style="margin-top:14px;padding:12px 14px;background:rgba(59,130,246,.1);border:1px solid rgba(59,130,246,.24);border-radius:12px;font-size:14px;color:#bfdbfe">Boleto: ${dadosHtml}</div>` : ''}
      <div class="fin-actions-row mt-16">
        <button class="btn btn-secondary" id="finBoletoOk" type="button">OK — Ciente</button>
        <span id="finBoletoFeedback" class="fin-feedback"></span>
      </div>
    </div>`;
    modal.classList.add('open');
    modal.querySelector('#finBoletoClose').onclick = () => modal.classList.remove('open');
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

  async function ativarEpiRegistros(row) {
    const ids = (row._compra_item_ids || [])
      .map((id) => String(id || '').replace(/^compra_/, ''))
      .filter(Boolean);
    const seedId = ids[0] || (row.origem_id ? String(row.origem_id).replace(/^compra_/, '') : null);
    if (!seedId) return;
    const { data: seedItem } = await supabase.from('compras_itens').select('solicitacao_id').eq('id', seedId).maybeSingle();
    if (!seedItem?.solicitacao_id) return;
    const { data: solItens } = await supabase.from('compras_itens').select('id').eq('solicitacao_id', seedItem.solicitacao_id);
    const allIds = (solItens || []).map((i) => i.id);
    if (!allIds.length) return;
    await safe(() => supabase.from('rh_epi_registros').update({ status: 'pendente' }).in('compra_item_id', allIds).eq('status', 'aguardando_pagamento'), null);
  }

  async function updateComprasComprovante(row, comprovanteUrl) {
    const ids = idsItensCompra(row);

    const forma = row.forma_pagamento || '';
    const dados = row.dados_pagamento || '';

    // Boletos de Compras já entram como "comprado" (NF anexada na origem —
    // vai direto pra Notas Fiscais, sem esperar o Financeiro pagar). Não
    // regride pra "aguardando_nf" um item que já passou dessa etapa; só
    // itens ainda "pendente_pagamento" avançam aqui.
    let q = supabase.from('compras_itens');
    if (ids.length) {
      q = q.update({ status: 'aguardando_nf', comprovante_url: comprovanteUrl }).in('id', ids).eq('status', 'pendente_pagamento');
    } else if (dados) {
      q = q.update({ status: 'aguardando_nf', comprovante_url: comprovanteUrl }).eq('dados_pagamento', dados).eq('status', 'pendente_pagamento');
      if (forma) q = q.eq('forma_pagamento', forma);
    } else if (row.origem_id) {
      q = q.update({ status: 'aguardando_nf', comprovante_url: comprovanteUrl }).eq('id', String(row.origem_id).replace(/^compra_/, '')).eq('status', 'pendente_pagamento');
    } else {
      return;
    }

    let { error } = await q;
    if (!error) return;

    if (isMissingColumnError(error)) {
      let retry = supabase.from('compras_itens');
      if (ids.length) retry = retry.update({ status: 'aguardando_nf' }).in('id', ids).eq('status', 'pendente_pagamento');
      else if (dados) {
        retry = retry.update({ status: 'aguardando_nf' }).eq('dados_pagamento', dados).eq('status', 'pendente_pagamento');
        if (forma) retry = retry.eq('forma_pagamento', forma);
      } else if (row.origem_id) retry = retry.update({ status: 'aguardando_nf' }).eq('id', String(row.origem_id).replace(/^compra_/, '')).eq('status', 'pendente_pagamento');
      const res = await retry;
      if (res.error) throw res.error;
      return;
    }

    throw error;
  }

  function recusarPagamento(id) {
    const row = getPagamentoRowById(id);
    if (!row) return;
    let modal = document.getElementById('finRecusaModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'finRecusaModal';
      modal.className = 'fin-pay-modal';
      document.body.appendChild(modal);
    }
    modal.innerHTML = `<div class="fin-pay-modal-card">
      <div class="fin-head">
        <div>
          <h3>Recusar pagamento</h3>
          <p>Informe o motivo da recusa para o setor.</p>
        </div>
        <button class="btn btn-secondary" id="finRecusaClose" type="button">Fechar</button>
      </div>
      <div class="pay-summary">
        <div class="pay-mini"><span>Setor</span><strong>${esc(origemPagamentoLabel(row.origem || row.setor || row.modulo_origem))}</strong></div>${codigoPagamento(row) ? `<div class="pay-mini"><span>Código</span><strong>${esc(codigoPagamento(row))}</strong></div>` : ''}
        <div class="pay-mini"><span>Valor</span><strong>${money(row.valor || row.valor_total || row.total)}</strong></div>
      </div>
      <div class="fin-field full mt-16">
        <label>Motivo da recusa <span style="color:#f87171">*</span></label>
        <textarea id="finRecusaMotivo" rows="4" placeholder="Descreva o motivo para recusar este pagamento..." style="width:100%;background:rgba(255,255,255,.06);border:1px solid rgba(148,163,184,.2);border-radius:10px;color:#e2e8f0;padding:10px 12px;font-size:14px;resize:vertical"></textarea>
      </div>
      <div class="fin-actions-row mt-16">
        <button class="btn fin-btn-recusar" id="finRecusaConfirm" type="button">CONFIRMAR RECUSA</button>
        <span id="finRecusaFeedback" class="fin-feedback"></span>
      </div>
    </div>`;
    modal.classList.add('open');
    modal.querySelector('#finRecusaClose').onclick = () => modal.classList.remove('open');
    modal.querySelector('#finRecusaConfirm').onclick = () => confirmarRecusa(row, modal);
  }

  async function confirmarRecusa(row, modal) {
    const motivoEl = modal.querySelector('#finRecusaMotivo');
    const fb = modal.querySelector('#finRecusaFeedback');
    const motivo = (motivoEl?.value || '').trim();
    if (!motivo) {
      if (fb) { fb.textContent = 'Informe o motivo da recusa.'; fb.style.color = '#f87171'; }
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
      if (fb) { fb.textContent = `Erro: ${err.message}`; fb.style.color = '#f87171'; }
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
      alert(error.message || 'Erro ao enviar comprovante.');
    }
  }

  return { renderSetorPagamentos, loadSetorPagamentos };
}

export { criarSetorPagamentos };
