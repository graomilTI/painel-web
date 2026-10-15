import { initProtectedPage } from './pageInit.js';
import { supabase } from './supabaseClient.js';
import { safe, state, esc, normalize, money, brDate, isMissingColumnError, toNumber, hashText, onlyDigits, dateRangeLabel, compactDate, formatDateForXlsx, roundNumber } from './modules/financeiro/util.js?v=20261015-fin1';
import { readWorkbookRows, worksheetFromObjects, downloadWorkbook, downloadCsv } from './modules/financeiro/planilhas.js?v=20261015-fin1';
import { origemPagamentoLabel, statusPagamentoClass, ensureHttps, isBoleto, isPix, uploadComprovantePagamento, makePaymentHash, buildPaymentOutputs, fetchAlreadyPaidMap, groupNotasFiscaisResumo, statusClass } from './modules/financeiro/pagamentos.js?v=20261015-fin1';
import { upsertChunk, mapReceber, mapPagar, sincronizarContasAgente } from './modules/financeiro/contas.js?v=20261015-fin1';
import { htmlFinanceiro } from './modules/financeiro/html.js?v=20261015-fin1';

export function renderContent(content, userContext) {
  content.innerHTML = htmlFinanceiro();

  function setFeedback(id, text, type = '') {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = text || '';
    el.className = `fin-feedback ${type}`.trim();
  }


  function tabFromHash() {
    const tab = String(window.location.hash || '').replace(/^#/, '').split('?')[0].toLowerCase();
    return ['dashboard', 'fluxo', 'despesas', 'pagamentos', 'notas-fiscais', 'ajustes'].includes(tab) ? tab : 'dashboard';
  }

  function mostrarFluxoLista() {
    const lista = document.getElementById('fluxoListaView');
    const det = document.getElementById('fluxoDetalhesView');
    if (lista) lista.style.display = '';
    if (det) det.style.display = 'none';
  }

  function mostrarFluxoDetalhes() {
    const lista = document.getElementById('fluxoListaView');
    const det = document.getElementById('fluxoDetalhesView');
    if (lista) lista.style.display = 'none';
    if (det) det.style.display = '';
  }

  function setAjustesTab(tab) {
    document.querySelectorAll('.ajustes-subtab').forEach((btn) => btn.classList.toggle('active', btn.dataset.ajustesTab === tab));
    document.querySelectorAll('.ajustes-panel').forEach((panel) => panel.classList.remove('active'));
    document.getElementById(`ajustes-${tab}`)?.classList.add('active');
  }

  function setTab(tab) {
    document.querySelectorAll('.fin-tab').forEach((btn) => btn.classList.toggle('active', btn.dataset.tab === tab));
    document.querySelectorAll('.fin-panel').forEach((panel) => panel.classList.remove('active'));
    document.getElementById(`tab-${tab}`)?.classList.add('active');
    if (tab === 'fluxo') mostrarFluxoLista();
    if (tab === 'despesas') carregarDespesasTab();
    if (tab === 'pagamentos') { loadSetorPagamentos(); carregarResumoBaixaNf(); }
    if (tab === 'dashboard') loadDashboardData();
    if (tab === 'notas-fiscais' && !state.notasFiscaisLoaded) loadNotasFiscais();
  }

  // ── Notas Fiscais (sincronizado pelo agente sync-notas-fiscais) ───────────
  // Tela nova, somente leitura — não existia destino estruturado pra esse agente antes.
  async function loadNotasFiscais() {
    const tbody = document.getElementById('nfTbody');
    if (tbody) tbody.innerHTML = '<tr><td colspan="9" class="fin-empty">Carregando...</td></tr>';
    try {
      const { data: maxRows, error: maxErr } = await supabase
        .from('grm_notas_fiscais_importacoes').select('created_at').order('created_at', { ascending: false }).limit(1);
      if (maxErr) throw maxErr;
      const maxCreatedAt = maxRows?.[0]?.created_at;
      if (!maxCreatedAt) { state.notasFiscais = []; }
      else {
        // o agente recarrega a tabela inteira a cada sincronização; pegamos só o lote mais recente.
        const threshold = new Date(new Date(maxCreatedAt).getTime() - 5 * 60 * 1000).toISOString();
        const { data, error } = await supabase
          .from('grm_notas_fiscais_importacoes').select('dados_json').gte('created_at', threshold).limit(5000);
        if (error) throw error;
        state.notasFiscais = (data || []).map((row) => row.dados_json);
      }
      state.notasFiscaisLoaded = true;
    } catch (error) {
      console.warn('[financeiro] falha ao carregar notas fiscais do agente', error);
      state.notasFiscais = [];
    }
    renderNotasFiscais();
  }

  function notasFiscaisFiltradas() {
    const clienteFiltro = normalize(state.notasFiscaisFiltro.cliente);
    const situacaoFiltro = state.notasFiscaisFiltro.situacao;
    return state.notasFiscais.filter((nf) => {
      if (clienteFiltro && !normalize(nf?.Cliente).includes(clienteFiltro)) return false;
      if (situacaoFiltro && nf?.Situação !== situacaoFiltro) return false;
      return true;
    });
  }

  function renderNotasFiscais() {
    const tbody = document.getElementById('nfTbody');
    const summary = document.getElementById('nfSummary');
    const note = document.getElementById('nfPreviewNote');
    if (!tbody || !summary) return;

    const rows = notasFiscaisFiltradas();
    const valorBrutoTotal = rows.reduce((sum, nf) => sum + toNumber(nf?.['Valor Bruto']), 0);
    const valorNfTotal = rows.reduce((sum, nf) => sum + toNumber(nf?.['Valor da N.F.']), 0);
    const pagas = rows.filter((nf) => nf?.Situação === 'Paga').length;
    const aguardando = rows.filter((nf) => nf?.Situação === 'Aguardando Pagamento').length;

    summary.innerHTML = `
      <div class="pay-mini"><span>Total de N.F.</span><strong>${rows.length}</strong></div>
      <div class="pay-mini"><span>Valor Bruto</span><strong>${money(valorBrutoTotal)}</strong></div>
      <div class="pay-mini"><span>Valor da N.F.</span><strong>${money(valorNfTotal)}</strong></div>
      <div class="pay-mini"><span>Pagas / Aguardando</span><strong>${pagas} / ${aguardando}</strong></div>
    `;

    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="9" class="fin-empty">Nenhuma nota fiscal encontrada.</td></tr>';
      if (note) note.textContent = '';
      return;
    }

    const sorted = [...rows].sort((a, b) => String(b?.['Data N.F.'] || '').localeCompare(String(a?.['Data N.F.'] || '')));
    const preview = sorted.slice(0, 300);
    tbody.innerHTML = preview.map((nf) => `
      <tr>
        <td>${esc(nf?.['N.F.'] ?? '-')}</td>
        <td>${esc(nf?.['Data N.F.'] || '-')}</td>
        <td>${esc(nf?.Cliente || '-')}</td>
        <td>${esc(nf?.Coordenação || '-')}</td>
        <td>${esc(nf?.Tons ?? '-')}</td>
        <td>${money(toNumber(nf?.['Valor Bruto']))}</td>
        <td>${money(toNumber(nf?.Imposto))}</td>
        <td>${money(toNumber(nf?.['Valor da N.F.']))}</td>
        <td><span class="fin-status ${nf?.Situação === 'Paga' ? 'ok' : 'neutral'}">${esc(nf?.Situação || '-')}</span></td>
      </tr>
    `).join('');
    if (note) note.textContent = sorted.length > preview.length ? `Mostrando ${preview.length} de ${sorted.length} notas fiscais.` : '';
  }

  function filteredSetorPagamentos() {
    const filter = state.pagamentosSetorFilter || 'todos';
    if (filter === 'todos') return state.financeiroPagamentos || [];
    if (filter === 'OUTROS') {
      return (state.financeiroPagamentos || []).filter((row) => {
        const origem = normalize(row.origem || row.setor || row.modulo_origem);
        return !origem.includes('compra') && !origem.includes('hotel') && !origem.includes('hosped') && !origem.includes('auditoria') && origem !== 'rh' && !origem.includes('recursos humanos');
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
        <td><strong>${esc(origemPagamentoLabel(row.origem || row.setor || row.modulo_origem))}</strong></td>
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
          _raw_compra_item_id: null
        });
      }

      const group = map.get(key);
      group.valor += Number(base.valor || 0);
      group._compra_item_ids.push(...(base._compra_item_ids || []));
      group.descricao += (group.descricao ? '\n' : '') + base.descricao;
      group.conteudo = group.descricao;
      if (new Date(base.created_at || 0).getTime() > new Date(group.created_at || 0).getTime()) {
        group.created_at = base.created_at;
      }
    });

    return [...map.values()];
  }

  // ---------------------------------------------------------------------
  // Comprovantes de pagamento (Holerite/NF) -> fila grm_nf_baixas, revisada
  // no Painel de Notas Fiscais (aba Baixas). O agente sync-baixa-notas-fiscais
  // faz a extração/matching/baixa no GRM (payInvoice/payment).
  const BAIXA_NF_BUCKET = 'notas-fiscais';
  const BAIXA_NF_TABELA = 'grm_nf_baixas';
  const BAIXA_NF_AGENTE = 'sync-baixa-notas-fiscais';
  const BAIXA_NF_STATUS_LABEL = {
    NOVO: 'Na fila',
    PROCESSANDO: 'Processando',
    AGUARDANDO_REVISAO: 'Revisão manual',
    VALIDADO: 'Validado',
    BAIXADO: 'Baixado',
    ERRO: 'Erro',
  };

  function safeStorageFileNameBaixaNf(name) {
    return String(name || 'arquivo').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 180);
  }

  async function uploadComprovanteBaixaNf(file, userId) {
    const ano = new Date().getFullYear();
    const path = `financeiro/baixa-pagamentos/${ano}/${Date.now()}_${safeStorageFileNameBaixaNf(file.name)}`;
    const { error: uploadError } = await supabase.storage.from(BAIXA_NF_BUCKET).upload(path, file, {
      upsert: false, contentType: file.type || 'application/pdf',
    });
    if (uploadError) throw new Error(`Falha ao enviar "${file.name}": ${uploadError.message}`);
    const { error: insertError } = await supabase.from(BAIXA_NF_TABELA).insert({
      storage_bucket: BAIXA_NF_BUCKET,
      storage_path: path,
      arquivo_nome: file.name,
      arquivo_mime_type: file.type || null,
      status: 'NOVO',
      enviado_por: userId,
    });
    if (insertError) throw new Error(`Falha ao registrar "${file.name}": ${insertError.message}`);
  }

  async function carregarResumoBaixaNf() {
    const alvo = document.getElementById('baixaNfResumo');
    if (!alvo) return;
    const statuses = Object.keys(BAIXA_NF_STATUS_LABEL);
    const counts = await Promise.all(statuses.map((s) => supabase.from(BAIXA_NF_TABELA)
      .select('id', { count: 'exact', head: true }).eq('status', s)));
    alvo.innerHTML = statuses.map((s, i) => `
      <div class="pay-mini"><span>${esc(BAIXA_NF_STATUS_LABEL[s])}</span><strong>${counts[i]?.count || 0}</strong></div>
    `).join('') + `
      <div class="pay-mini"><a href="notas-fiscais.html#baixas" style="color:#86efac;text-decoration:none;font-weight:800">Ver e revisar →</a></div>
    `;
  }

  async function enviarComprovantesBaixaNf() {
    const input = document.getElementById('baixaNfArquivos');
    const feedback = document.getElementById('fbBaixaNf');
    const arquivos = Array.from(input?.files || []);
    if (!arquivos.length) {
      if (feedback) { feedback.textContent = 'Selecione ao menos um arquivo.'; feedback.className = 'fin-feedback err'; }
      return;
    }
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
      if (feedback) { feedback.textContent = 'Sessão expirada. Recarregue a página.'; feedback.className = 'fin-feedback err'; }
      return;
    }

    const botao = document.getElementById('btnEnviarBaixaNf');
    if (botao) { botao.disabled = true; botao.textContent = 'Enviando...'; }

    let sucesso = 0;
    let falhas = 0;
    for (const arquivo of arquivos) {
      try {
        await uploadComprovanteBaixaNf(arquivo, session.user.id);
        sucesso += 1;
      } catch (error) {
        falhas += 1;
        console.warn('[financeiro] falha ao enviar comprovante de baixa', error);
      }
    }

    if (botao) { botao.disabled = false; botao.textContent = 'Enviar comprovantes'; }
    if (input) input.value = '';
    if (feedback) {
      feedback.textContent = falhas
        ? `${sucesso} enviado(s), ${falhas} com falha.`
        : `${sucesso} comprovante(s) enviado(s) para a fila de baixa.`;
      feedback.className = falhas ? 'fin-feedback err' : 'fin-feedback ok';
    }
    if (sucesso) {
      await supabase.from('grm_sync_jobs').insert({
        agente_id: BAIXA_NF_AGENTE, status: 'pendente', lane: 'alteracoes',
        solicitado_por: session.user.email || session.user.id,
      });
    }
    await carregarResumoBaixaNf();
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
        <div class="pay-mini"><span>Setor</span><strong>${esc(origemPagamentoLabel(row.origem || row.setor || row.modulo_origem))}</strong></div>
        <div class="pay-mini"><span>Valor</span><strong>${money(row.valor || row.valor_total || row.total)}</strong></div>
      </div>
      <div class="fin-pay-preview" style="line-height:1.7;padding:14px;border:1px solid rgba(148,163,184,.14);border-radius:12px;background:rgba(15,23,42,.5);color:#e2e8f0;font-size:14px">${renderConteudoModal(row)}</div>
      ${pixSection}
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
        <div class="pay-mini"><span>Setor</span><strong>${esc(origemPagamentoLabel(row.origem || row.setor || row.modulo_origem))}</strong></div>
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
    const ids = (row._compra_item_ids || [])
      .map((id) => String(id || '').replace(/^compra_/, ''))
      .filter(Boolean);

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
        <div class="pay-mini"><span>Setor</span><strong>${esc(origemPagamentoLabel(row.origem || row.setor || row.modulo_origem))}</strong></div>
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
      if (fb) {
        fb.textContent = 'Enviando comprovante...';
        fb.className = 'fin-feedback';
      }
      const comprovanteUrl = await uploadComprovantePagamento(file, row);
      const isCompras = normalize(row.origem || row.setor || row.modulo_origem).includes('compra') || String(row.id).startsWith('compra_');

      if (String(row.id).startsWith('compra_grp_') || String(row.id).startsWith('compra_')) {
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


  const dashCharts = { line: null, donut: null };

  async function loadDashboardData() {
    const hoje = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const hojeStr = `${hoje.getFullYear()}-${pad(hoje.getMonth() + 1)}-${pad(hoje.getDate())}`;
    const seisMesesAtras = new Date(hoje);
    seisMesesAtras.setMonth(seisMesesAtras.getMonth() - 5);
    const inicioPeriodo = `${seisMesesAtras.getFullYear()}-${String(seisMesesAtras.getMonth() + 1).padStart(2, '0')}-01`;
    const novDiasAtras = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
    const quinzeDias = new Date(hoje);
    quinzeDias.setDate(quinzeDias.getDate() + 14);
    const fimPeriodo = `${quinzeDias.getFullYear()}-${pad(quinzeDias.getMonth() + 1)}-${pad(quinzeDias.getDate())}`;

    const [fluxoRes, fluxoDiarioRes, categoriaRes, receberRes, pagarRes] = await Promise.all([
      supabase.from('financeiro_fluxo_caixa_diario')
        .select('data,contas_receber,contas_pagar,saldo_dia,saldo_projetado')
        .gte('data', inicioPeriodo)
        .order('data', { ascending: true }),
      supabase.from('financeiro_fluxo_caixa_diario')
        .select('data,contas_pagar,contas_receber')
        .gte('data', hojeStr)
        .lte('data', fimPeriodo)
        .order('data', { ascending: true }),
      supabase.from('financeiro_contas_pagar')
        .select('categoria,valor')
        .gte('vencimento', novDiasAtras),
      supabase.from('financeiro_contas_receber')
        .select('cliente,valor,vencimento,situacao')
        .eq('vencimento', hojeStr)
        .order('cliente'),
      supabase.from('financeiro_contas_pagar')
        .select('favorecido,valor,vencimento,situacao')
        .eq('vencimento', hojeStr)
        .order('favorecido')
    ]);

    renderDashboard({
      fluxo: fluxoRes.data || [],
      fluxoDiario: fluxoDiarioRes.data || [],
      categorias: (categoriaRes.data || []).filter((r) => r.categoria),
      receber: receberRes.data || [],
      pagar: pagarRes.data || [],
      hojeStr
    });
  }

  function renderDashboard({ fluxo, fluxoDiario, categorias, receber, pagar, hojeStr }) {
    const hoje = new Date();
    const byMonth = {};
    fluxo.forEach((row) => {
      const mes = String(row.data).slice(0, 7);
      if (!byMonth[mes]) byMonth[mes] = { receber: 0, pagar: 0, saldo: 0, projetado: 0 };
      byMonth[mes].receber += Number(row.contas_receber || 0);
      byMonth[mes].pagar += Number(row.contas_pagar || 0);
      byMonth[mes].saldo += Number(row.saldo_dia || 0);
      byMonth[mes].projetado = Math.max(byMonth[mes].projetado, Number(row.saldo_projetado || 0));
    });

    const meses = Object.keys(byMonth).sort();
    const mesAtualKey = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`;
    const mesAnteriorDate = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
    const mesAnteriorKey = `${mesAnteriorDate.getFullYear()}-${String(mesAnteriorDate.getMonth() + 1).padStart(2, '0')}`;
    const atual = byMonth[mesAtualKey] || { receber: 0, pagar: 0, saldo: 0, projetado: 0 };
    const anterior = byMonth[mesAnteriorKey] || null;

    function setChange(id, curr, prev, invertido) {
      const el = document.getElementById(id);
      if (!el) return;
      if (!prev) { el.textContent = 'mês atual'; el.className = 'dash-kpi-change neutral'; return; }
      const pct = ((curr - prev) / Math.abs(prev)) * 100;
      const isGood = invertido ? pct < 0 : pct > 0;
      el.textContent = `${pct > 0 ? '▲' : '▼'} ${Math.abs(pct).toFixed(1)}%`;
      el.className = `dash-kpi-change ${isGood ? 'up' : 'down'}`;
    }

    const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = money(val); };
    setVal('dKpiSaldo', atual.saldo);
    setVal('dKpiReceber', atual.receber);
    setVal('dKpiPagar', atual.pagar);
    setVal('dKpiProjetado', atual.projetado);
    setChange('dKpiSaldoChange', atual.saldo, anterior?.saldo, false);
    setChange('dKpiReceberChange', atual.receber, anterior?.receber, false);
    setChange('dKpiPagarChange', atual.pagar, anterior?.pagar, true);
    setChange('dKpiProjetadoChange', atual.projetado, anterior?.projetado, false);

    const byDay = {};
    fluxoDiario.forEach((row) => {
      const dia = String(row.data).slice(0, 10);
      byDay[dia] = { pagar: Number(row.contas_pagar || 0), receber: Number(row.contas_receber || 0) };
    });
    const dias = Object.keys(byDay).sort();

    const diaLabels = dias.map((d) => {
      const [, mo, dy] = d.split('-');
      return `${dy}/${mo}`;
    });

    const lineCtx = document.getElementById('dashLineChart');
    if (lineCtx && typeof Chart !== 'undefined') {
      if (dashCharts.line) { dashCharts.line.destroy(); dashCharts.line = null; }
      dashCharts.line = new Chart(lineCtx, {
        type: 'line',
        data: {
          labels: diaLabels,
          datasets: [
            { label: 'A Receber', data: dias.map((d) => byDay[d].receber), borderColor: '#34d399', backgroundColor: 'rgba(52,211,153,.1)', borderWidth: 2.5, pointBackgroundColor: '#34d399', pointRadius: 4, fill: true, tension: 0.35 },
            { label: 'A Pagar', data: dias.map((d) => byDay[d].pagar), borderColor: '#f87171', backgroundColor: 'rgba(248,113,113,.07)', borderWidth: 2.5, pointBackgroundColor: '#f87171', pointRadius: 4, fill: true, tension: 0.35 }
          ]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: {
            legend: { labels: { color: '#6b7280', font: { size: 12 }, usePointStyle: true } },
            tooltip: { backgroundColor: 'rgba(15,23,42,.95)', borderColor: 'rgba(148,163,184,.18)', borderWidth: 1, titleColor: '#e2e8f0', bodyColor: '#6b7280', callbacks: { label: (ctx) => ` ${money(ctx.raw)}` } }
          },
          scales: {
            x: { grid: { color: 'rgba(148,163,184,.07)' }, ticks: { color: '#64748b', font: { size: 11 } } },
            y: { grid: { color: 'rgba(148,163,184,.07)' }, ticks: { color: '#64748b', font: { size: 11 }, callback: (v) => `R$ ${(v / 1000).toFixed(0)}k` } }
          }
        }
      });
    }

    const catMap = {};
    categorias.forEach((row) => { const cat = row.categoria || 'Outros'; catMap[cat] = (catMap[cat] || 0) + Number(row.valor || 0); });
    const catEntries = Object.entries(catMap).sort((a, b) => b[1] - a[1]).slice(0, 7);
    const donutColors = ['#34d399', '#818cf8', '#f87171', '#fb923c', '#a78bfa', '#38bdf8', '#fbbf24'];

    const donutCtx = document.getElementById('dashDonutChart');
    if (donutCtx && typeof Chart !== 'undefined') {
      if (dashCharts.donut) { dashCharts.donut.destroy(); dashCharts.donut = null; }
      if (catEntries.length) {
        dashCharts.donut = new Chart(donutCtx, {
          type: 'doughnut',
          data: {
            labels: catEntries.map(([k]) => k),
            datasets: [{ data: catEntries.map(([, v]) => v), backgroundColor: donutColors, borderColor: 'rgba(15,23,42,.9)', borderWidth: 3, hoverOffset: 8 }]
          },
          options: {
            responsive: true, maintainAspectRatio: false, cutout: '62%',
            plugins: {
              legend: { position: 'bottom', labels: { color: '#6b7280', font: { size: 11 }, padding: 10, usePointStyle: true } },
              tooltip: { backgroundColor: 'rgba(15,23,42,.95)', borderColor: 'rgba(148,163,184,.18)', borderWidth: 1, titleColor: '#e2e8f0', bodyColor: '#6b7280', callbacks: { label: (ctx) => ` ${money(ctx.raw)}` } }
            }
          }
        });
      } else {
        const pEl = donutCtx.closest('.dash-chart-card')?.querySelector('p');
        if (pEl) pEl.textContent = 'Sem dados de categorias nos últimos 90 dias.';
      }
    }

    const txEl = document.getElementById('dashTransactions');
    if (!txEl) return;
    const combined = [
      ...receber.map((r) => ({ tipo: 'receber', nome: r.cliente, valor: Number(r.valor || 0), data: r.vencimento, situacao: r.situacao })),
      ...pagar.map((r) => ({ tipo: 'pagar', nome: r.favorecido, valor: Number(r.valor || 0), data: r.vencimento, situacao: r.situacao }))
    ].sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));

    if (!combined.length) {
      txEl.innerHTML = '<div class="dash-loading">Nenhum vencimento para hoje.</div>';
      return;
    }
    txEl.innerHTML = combined.map((tx) => `
      <div class="dash-tx-row">
        <div class="dash-tx-icon ${esc(tx.tipo)}">${tx.tipo === 'receber' ? '↑' : '↓'}</div>
        <div style="min-width:0">
          <div class="dash-tx-name">${esc(tx.nome || '-')}</div>
          <div class="dash-tx-sub">${esc(tx.situacao || (tx.tipo === 'receber' ? 'A Receber' : 'A Pagar'))}</div>
        </div>
        <div class="dash-tx-date">${brDate(tx.data)}</div>
        <div class="dash-tx-value ${esc(tx.tipo)}">${tx.tipo === 'pagar' ? '−' : '+'}${money(tx.valor)}</div>
      </div>
    `).join('');
  }

  async function loadFluxo() {
    const { data, error } = await supabase
      .from('financeiro_fluxo_caixa_diario')
      .select('*')
      .gte('data', state.filters.inicio)
      .lte('data', state.filters.fim)
      .order('data', { ascending: true });

    if (error) {
      document.getElementById('fluxoTbody').innerHTML = `<tr><td colspan="8" class="fin-empty">${esc(error.message)}<br>Execute a migration do módulo financeiro no Supabase.</td></tr>`;
      return;
    }
    state.fluxo = data || [];
    renderFluxo();
    updateKpis();
  }

  async function loadDetalhes(date) {
    state.currentDate = date;
    document.getElementById('detalhesData').textContent = `Data: ${brDate(date)}`;
    const [receberRes, pagarRes, saldoRes, provisaoRes] = await Promise.all([
      supabase.from('financeiro_contas_receber').select('*').eq('vencimento', date).order('cliente'),
      supabase.from('financeiro_contas_pagar').select('*').eq('vencimento', date).order('favorecido'),
      supabase.from('financeiro_saldos_dia').select('*').eq('data', date).maybeSingle(),
      supabase.from('financeiro_provisoes').select('*').eq('data', date).maybeSingle()
    ]);
    state.receber = receberRes.data || [];
    state.pagar = pagarRes.data || [];
    document.getElementById('cfgData').value = date;
    document.getElementById('cfgSaldo').value = saldoRes.data?.saldo_dia ?? '';
    document.getElementById('cfgObs').value = saldoRes.data?.observacoes || provisaoRes.data?.observacoes || '';
    document.getElementById('cfgProvAuto').value = provisaoRes.data?.valor_automatico ?? '';
    document.getElementById('cfgProvManual').value = provisaoRes.data?.ajuste_manual ?? '';
    renderDetalhes();
    setTab('fluxo');
    mostrarFluxoDetalhes();
  }

  function updateKpis() {
    const total = state.fluxo.reduce((acc, row) => {
      acc.saldo += Number(row.saldo_dia || 0);
      acc.receber += Number(row.contas_receber || 0);
      acc.pagar += Number(row.contas_pagar || 0);
      acc.provisao += Number(row.provisoes_dia || 0);
      acc.projetado += Number(row.saldo_projetado || 0);
      return acc;
    }, { saldo: 0, receber: 0, pagar: 0, provisao: 0, projetado: 0 });
    const hasAttention = state.fluxo.some((row) => statusClass(row.status) === 'danger') || total.projetado < 0;
    document.getElementById('kpiSaldo').textContent = money(total.saldo);
    document.getElementById('kpiReceber').textContent = money(total.receber);
    document.getElementById('kpiPagar').textContent = money(total.pagar);
    document.getElementById('kpiProvisao').textContent = money(total.provisao);
    document.getElementById('kpiProjetado').textContent = money(total.projetado);
    const statusEl = document.getElementById('kpiStatus');
    statusEl.textContent = state.fluxo.length ? (hasAttention ? 'ATENÇÃO' : 'OK') : 'SEM DADOS';
    statusEl.className = hasAttention ? 'danger-label' : 'ok-label';
    document.querySelectorAll('.fin-kpi small').forEach((el, idx) => {
      if (idx < 4) el.textContent = dateRangeLabel(state.filters.inicio, state.filters.fim);
    });
    const miniEl = document.getElementById('cfFlowMini');
    if (miniEl && state.fluxo.length) {
      miniEl.style.display = '';
      const liquido = total.receber - total.pagar;
      document.getElementById('cfFmReceber').textContent = money(total.receber);
      document.getElementById('cfFmPagar').textContent = money(total.pagar);
      document.getElementById('cfFmLiquido').textContent = money(liquido);
      const sumBar = total.receber + total.pagar;
      const recvPct = sumBar > 0 ? Math.round((total.receber / sumBar) * 100) : 50;
      const payPct = 100 - recvPct;
      document.getElementById('cfBarRecv').style.width = recvPct + '%';
      document.getElementById('cfBarPay').style.width = payPct + '%';
    }
  }

  function renderFluxo() {
    const tbody = document.getElementById('fluxoTbody');
    if (!state.fluxo.length) {
      tbody.innerHTML = `<tr><td colspan="8" class="fin-empty">Nenhum dia encontrado no período.</td></tr>`;
      return;
    }
    tbody.innerHTML = state.fluxo.map((row) => `
      <tr>
        <td><strong>${brDate(row.data)}</strong></td>
        <td>${money(row.saldo_dia)}</td>
        <td>${money(row.contas_receber)}</td>
        <td>${money(row.contas_pagar)}</td>
        <td>${money(row.provisoes_dia)}</td>
        <td><strong>${money(row.saldo_projetado)}</strong></td>
        <td><span class="fin-status ${statusClass(row.status)}">${esc(row.status || 'OK')}</span></td>
        <td><button class="btn btn-secondary fin-small" data-detail-date="${esc(row.data)}" type="button">Detalhes</button></td>
      </tr>
    `).join('');
  }

  function renderDetalhes() {
    const tbody = document.getElementById('detalhesTbody');
    let rows = [
      ...state.receber.map((r) => ({ tipo: 'Receber', situacao: r.situacao, nome: r.cliente, doc: r.fatura || r.numero_nf || r.codigo, valor: Number(r.valor || 0) - Number(r.valor_pago || 0), vencimento: r.vencimento })),
      ...state.pagar.map((r) => ({ tipo: 'Pagar', situacao: r.situacao, nome: r.favorecido, doc: r.doc || r.cod_grupo || r.parcela, valor: Number(r.valor || 0) - Number(r.valor_pago || 0), vencimento: r.vencimento }))
    ];

    const { tipo, situacao, favorecido, doc } = state.detFilter;
    if (tipo) rows = rows.filter((r) => r.tipo === tipo);
    if (situacao) rows = rows.filter((r) => (r.situacao || '').toLowerCase() === situacao.toLowerCase());
    if (favorecido) rows = rows.filter((r) => (r.nome || '').toLowerCase().includes(favorecido.toLowerCase()));
    if (doc) rows = rows.filter((r) => (r.doc || '').toLowerCase().includes(doc.toLowerCase()));

    const { col, dir } = state.detSort;
    if (col) {
      rows = [...rows].sort((a, b) => {
        const av = col === 'valor' ? a[col] : (a[col] || '');
        const bv = col === 'valor' ? b[col] : (b[col] || '');
        return col === 'valor' ? (av - bv) * dir : String(av).localeCompare(String(bv)) * dir;
      });
    }

    document.querySelectorAll('.det-th-sort').forEach((th) => {
      const c = th.dataset.detSort;
      const icon = th.querySelector('.det-sort-icon');
      if (icon) icon.textContent = c === col ? (dir === 1 ? '▲' : '▼') : '↕';
      th.classList.toggle('det-th-active', c === col);
    });

    if (!rows.length) {
      tbody.innerHTML = `<tr><td colspan="6" class="fin-empty">Nenhum lançamento encontrado.</td></tr>`;
      return;
    }
    tbody.innerHTML = rows.map((r) => `
      <tr><td>${esc(r.tipo)}</td><td>${esc(r.situacao || '-')}</td><td><strong>${esc(r.nome || '-')}</strong></td><td>${esc(r.doc || '-')}</td><td>${money(r.valor)}</td><td>${brDate(r.vencimento)}</td></tr>
    `).join('');
  }

  async function importFile(kind) {
    const input = document.getElementById(kind === 'receber' ? 'fileReceber' : 'filePagar');
    const fb = kind === 'receber' ? 'fbReceber' : 'fbPagar';
    const file = input.files?.[0];
    if (!file) return setFeedback(fb, 'Selecione uma planilha primeiro.', 'err');
    try {
      setFeedback(fb, 'Lendo planilha...');
      const rows = await readWorkbookRows(file);
      const mapped = kind === 'receber' ? mapReceber(rows, file.name) : mapPagar(rows, file.name);
      if (!mapped.length) throw new Error('Nenhuma linha válida encontrada. Confira os cabeçalhos e as datas.');
      setFeedback(fb, `Importando ${mapped.length} linhas...`);
      const table = kind === 'receber' ? 'financeiro_contas_receber' : 'financeiro_contas_pagar';
      const saved = await upsertChunk(table, mapped);
      setFeedback(fb, `${saved} registros atualizados sem duplicar.`, 'ok');
      await loadFluxo();
    } catch (err) {
      setFeedback(fb, err.message || 'Erro ao importar.', 'err');
    }
  }

  async function saveConfig(event) {
    event.preventDefault();
    const date = document.getElementById('cfgData').value;
    const saldo = Number(document.getElementById('cfgSaldo').value || 0);
    const provAuto = Number(document.getElementById('cfgProvAuto').value || 0);
    const provManual = Number(document.getElementById('cfgProvManual').value || 0);
    const obs = document.getElementById('cfgObs').value.trim() || null;
    const responsavel = userContext?.user?.name || userContext?.user?.email || userContext?.email || null;
    try {
      setFeedback('fbConfig', 'Salvando...');
      const saldoRes = await supabase.from('financeiro_saldos_dia').upsert({ data: date, saldo_dia: saldo, observacoes: obs, responsavel }, { onConflict: 'data' });
      if (saldoRes.error) throw saldoRes.error;
      const provRes = await supabase.from('financeiro_provisoes').upsert({ data: date, descricao: 'Provisão do dia', valor_automatico: provAuto, ajuste_manual: provManual, observacoes: obs, responsavel }, { onConflict: 'data' });
      if (provRes.error) throw provRes.error;
      setFeedback('fbConfig', 'Ajustes salvos.', 'ok');
      await loadFluxo();
    } catch (err) {
      setFeedback('fbConfig', err.message || 'Erro ao salvar.', 'err');
    }
  }



  state.adiantamentosRows = [];
  state.adiantamentosLoaded = false;

  function paySetFeedback(id, text, type = '') {
    setFeedback(id, text, type);
  }

  // ── Adiantamentos (sincronizado do GRM pelo agente sync-adiantamentos) ────
  // Fonte: grm_adiantamentos_importacoes (espelho GRM) + financeiro_adiantamentos_decisoes
  // (decisão local ✓/✗, não altera nada no GRM). Merge feito aqui no cliente por ofr_code.
  async function carregarAdiantamentos() {
    paySetFeedback('fbAdiantamentos', 'Carregando solicitações...');
    try {
      const [{ data: importadas, error: e1 }, { data: decisoes, error: e2 }] = await Promise.all([
        supabase.from('grm_adiantamentos_importacoes')
          .select('ofr_code,data_solicitacao,data_registro,colaborador,cpf,coordenacao,supervisao,conta,valor,saldo,embarque,leitura_mais_antiga,descricao,pendente_no_grm,saiu_pendente_em')
          .order('data_registro', { ascending: false })
          .limit(500),
        supabase.from('financeiro_adiantamentos_decisoes')
          .select('ofr_code,status,motivo_recusa,decidido_por,decidido_em,execucao_id,pago_em')
      ]);
      if (e1) throw e1;
      if (e2) throw e2;

      const decisaoMap = new Map((decisoes || []).map((d) => [d.ofr_code, d]));
      state.adiantamentosRows = (importadas || []).map((row) => ({ ...row, decisao: decisaoMap.get(row.ofr_code) || null }));
      renderAdiantamentosTable();
      paySetFeedback('fbAdiantamentos', `${state.adiantamentosRows.length} solicitação(ões) carregada(s).`, 'ok');
    } catch (err) {
      console.error(err);
      paySetFeedback('fbAdiantamentos', err.message || 'Erro ao carregar adiantamentos.', 'err');
    }
  }

  function adiantAcaoHtml(row) {
    const st = row.decisao?.status || 'pendente';
    if (st === 'pago') return `<span class="pay-status-paid">PAGO</span>`;
    const motivoAttr = row.decisao?.motivo_recusa ? ` title="${esc(row.decisao.motivo_recusa)}"` : '';
    return `
      <div class="pay-status-toggle" role="group" aria-label="Ação para ${esc(row.colaborador || 'colaborador')}">
        <button class="pay-status-btn ${st === 'ok' ? 'active-ok' : 'is-inactive'}" type="button" data-adiant-ok="${row.ofr_code}">✓</button>
        <button class="pay-status-btn ${st === 'recusado' ? 'active-pendente' : 'is-inactive'}"${motivoAttr} type="button" data-adiant-recusar="${row.ofr_code}">✗</button>
      </div>`;
  }

  function setAdiantTab(tab) {
    document.querySelectorAll('.adiant-subtab').forEach((btn) => btn.classList.toggle('active', btn.dataset.adiantTab === tab));
    document.querySelectorAll('.adiant-table').forEach((panel) => panel.classList.remove('active'));
    document.getElementById(`adiant-${tab}`)?.classList.add('active');
  }

  function renderAdiantamentosTable() {
    const rows = state.adiantamentosRows || [];
    // Sai da lista de Solicitações (e vai pro Histórico automaticamente) tanto quem já foi
    // pago/recusado pelo financeiro quanto quem deixou de aparecer como pendente no GRM
    // (resolvido/baixado direto por lá, fora do fluxo do painel).
    const ativos = rows.filter((r) => r.pendente_no_grm !== false && !['pago', 'recusado'].includes(r.decisao?.status));
    const historico = rows.filter((r) => r.pendente_no_grm === false || ['pago', 'recusado'].includes(r.decisao?.status))
      .sort((a, b) => String(b.decisao?.decidido_em || b.saiu_pendente_em || '').localeCompare(String(a.decisao?.decidido_em || a.saiu_pendente_em || '')));

    const { col: sortCol, dir: sortDir } = state.adiantSort;
    if (sortCol) {
      const numericCols = ['valor', 'saldo'];
      ativos.sort((a, b) => {
        if (numericCols.includes(sortCol)) return ((Number(a[sortCol]) || 0) - (Number(b[sortCol]) || 0)) * sortDir;
        return String(a[sortCol] || '').localeCompare(String(b[sortCol] || ''), 'pt-BR') * sortDir;
      });
    }
    document.querySelectorAll('.adiant-th-sort').forEach((th) => {
      const c = th.dataset.adiantSort;
      const icon = th.querySelector('.adiant-sort-icon');
      if (icon) icon.textContent = c === sortCol ? (sortDir === 1 ? '▲' : '▼') : '↕';
      th.classList.toggle('adiant-th-active', c === sortCol);
    });

    const tbody = document.getElementById('adiantTbody');
    if (tbody) {
      tbody.innerHTML = ativos.length ? ativos.map((row) => `
        <tr>
          <td>${brDate(row.data_solicitacao)}</td>
          <td><strong>${esc(row.colaborador || '-')}</strong></td>
          <td>${esc(row.coordenacao || '-')}</td>
          <td>${esc(row.supervisao || '-')}</td>
          <td>${money(row.valor)}</td>
          <td>${money(row.saldo)}</td>
          <td>${row.embarque ? brDate(row.embarque) : '-'}</td>
          <td>${row.leitura_mais_antiga ? brDate(row.leitura_mais_antiga) : '-'}</td>
          <td>${esc(row.descricao || '-')}</td>
          <td>${adiantAcaoHtml(row)}</td>
        </tr>
      `).join('') : '<tr><td colspan="10" class="fin-empty">Nenhuma solicitação pendente.</td></tr>';

      tbody.querySelectorAll('[data-adiant-ok]').forEach((btn) => btn.addEventListener('click', () => decidirAdiantamentoOk(Number(btn.dataset.adiantOk))));
      tbody.querySelectorAll('[data-adiant-recusar]').forEach((btn) => btn.addEventListener('click', () => abrirModalRecusaAdiantamento(Number(btn.dataset.adiantRecusar))));
    }

    state.adiantamentosHistorico = historico;
    renderHistoricoAgrupado(historico);

    const pendentes = ativos.filter((r) => (r.decisao?.status || 'pendente') === 'pendente').length;
    const selecionados = ativos.filter((r) => r.decisao?.status === 'ok');
    const recusados = historico.filter((r) => r.decisao?.status === 'recusado').length;
    const totalSelecionado = selecionados.reduce((sum, r) => sum + Number(r.valor || 0), 0);

    if (document.getElementById('adiantPendentes')) document.getElementById('adiantPendentes').textContent = String(pendentes);
    if (document.getElementById('adiantSelecionados')) document.getElementById('adiantSelecionados').textContent = String(selecionados.length);
    if (document.getElementById('adiantTotalSelecionado')) document.getElementById('adiantTotalSelecionado').textContent = money(totalSelecionado);
    if (document.getElementById('adiantRecusados')) document.getElementById('adiantRecusados').textContent = String(recusados);
    if (document.getElementById('adiantFooterTotal')) document.getElementById('adiantFooterTotal').textContent = `Total pronto para pagar: ${money(totalSelecionado)}`;
    if (document.getElementById('adiantFooterHint')) document.getElementById('adiantFooterHint').textContent = `${selecionados.length} selecionado(s) · ${pendentes} pendente(s) · ${recusados} recusado(s)`;
    if (document.getElementById('btnPagarAdiantamentos')) document.getElementById('btnPagarAdiantamentos').disabled = selecionados.length === 0;
  }

  const HIST_DOW_LABELS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
  const HIST_MES_LABELS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

  function moneyCompact(v) {
    return Number(v || 0).toLocaleString('pt-BR', { maximumFractionDigits: 0 });
  }

  function calendarioMesHtml(mesKey, diasMap) {
    const [ano, mes] = mesKey.split('-').map(Number);
    const diasNoMes = new Date(ano, mes, 0).getDate();
    const offset = new Date(ano, mes - 1, 1).getDay();

    const celulas = [];
    for (let i = 0; i < offset; i++) celulas.push('<div class="hist-cal-day blank"></div>');
    for (let d = 1; d <= diasNoMes; d++) {
      const iso = `${ano}-${String(mes).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const info = diasMap.get(iso);
      if (!info || (!info.pago && !info.recusado && !info.removido)) {
        celulas.push(`<div class="hist-cal-day"><span class="d">${d}</span></div>`);
        continue;
      }
      let cls, valor, titulo;
      if (info.pago > 0) { cls = 'paid'; valor = info.pago; titulo = money(valor); }
      else if (info.recusado > 0) { cls = 'recusado'; valor = info.recusado; titulo = money(valor); }
      else { cls = 'removido'; valor = info.removido; titulo = `${money(valor)} · saiu do GRM sem decisão do financeiro`; }
      celulas.push(`<div class="hist-cal-day ${cls}" title="${esc(titulo)}"><span class="d">${d}</span><span class="v">${moneyCompact(valor)}</span></div>`);
    }

    return `
      <div class="hist-cal">
        <div class="hist-cal-title">${HIST_MES_LABELS[mes - 1]}/${ano}</div>
        <div class="hist-cal-grid">
          ${HIST_DOW_LABELS.map((l) => `<div class="hist-cal-dow">${l}</div>`).join('')}
          ${celulas.join('')}
        </div>
      </div>`;
  }

  function renderHistoricoAgrupado(historico) {
    const container = document.getElementById('adiantHistoricoContent');
    if (!container) return;
    if (!historico.length) {
      container.innerHTML = '<div class="fin-empty">Nenhum pagamento registrado ainda.</div>';
      return;
    }

    const termo = normalize(document.getElementById('histColaboradorFiltro')?.value || '');
    const grupos = new Map();
    historico.forEach((row) => {
      const key = row.cpf || row.colaborador || '-';
      if (!grupos.has(key)) grupos.set(key, { nome: row.colaborador || '-', totalPago: 0, totalRecusado: 0, totalRemovido: 0, dias: new Map() });
      const g = grupos.get(key);
      const status = row.decisao?.status;
      // Saiu da lista de pendentes do GRM sem o financeiro ter marcado ✓/✗ aqui.
      const removidoSemDecisao = row.pendente_no_grm === false && !['pago', 'recusado'].includes(status);
      const valor = Number(row.valor || 0);
      const dia = String(row.decisao?.decidido_em || row.saiu_pendente_em || row.data_solicitacao || '').slice(0, 10);
      if (status === 'pago') g.totalPago += valor;
      else if (status === 'recusado') g.totalRecusado += valor;
      else if (removidoSemDecisao) g.totalRemovido += valor;
      if (dia) {
        const atual = g.dias.get(dia) || { pago: 0, recusado: 0, removido: 0 };
        if (status === 'pago') atual.pago += valor;
        else if (status === 'recusado') atual.recusado += valor;
        else if (removidoSemDecisao) atual.removido += valor;
        g.dias.set(dia, atual);
      }
    });

    let lista = Array.from(grupos.values()).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    if (termo) lista = lista.filter((g) => normalize(g.nome).includes(termo));

    if (!lista.length) {
      container.innerHTML = '<div class="fin-empty">Nenhum colaborador encontrado nesse filtro.</div>';
      return;
    }

    container.innerHTML = lista.map((g) => {
      const diasPagos = Array.from(g.dias.values()).filter((d) => d.pago > 0).length;
      const diasRecusados = Array.from(g.dias.values()).filter((d) => d.recusado > 0).length;
      const diasRemovidos = Array.from(g.dias.values()).filter((d) => d.removido > 0).length;
      const meses = new Set(Array.from(g.dias.keys()).map((dia) => dia.slice(0, 7)));
      const calendariosHtml = Array.from(meses).sort().map((mesKey) => calendarioMesHtml(mesKey, g.dias)).join('');

      return `
        <div class="hist-colab-card">
          <div class="hist-colab-head" data-hist-toggle>
            <div class="hist-colab-name"><span class="hist-colab-toggle">▸</span>${esc(g.nome)}</div>
            <div class="hist-colab-meta">
              <div><span>Total recebido</span><strong style="color:#86efac">${money(g.totalPago)}</strong></div>
              <div><span>Dias pagos</span><strong>${diasPagos}</strong></div>
              <div><span>Total recusado</span><strong style="color:#fca5a5">${money(g.totalRecusado)}</strong></div>
              <div><span>Dias recusados</span><strong>${diasRecusados}</strong></div>
              <div><span>Saiu do GRM sem decisão</span><strong style="color:#cbd5e1">${diasRemovidos}</strong></div>
            </div>
          </div>
          <div class="hist-cal-row">${calendariosHtml}</div>
        </div>`;
    }).join('');

    container.querySelectorAll('[data-hist-toggle]').forEach((head) => {
      head.addEventListener('click', () => head.closest('.hist-colab-card')?.classList.toggle('expanded'));
    });
  }

  async function decidirAdiantamentoOk(ofrCode) {
    const row = (state.adiantamentosRows || []).find((r) => r.ofr_code === ofrCode);
    if (!row || ['pago','recusado'].includes(row.decisao?.status)) return;
    const novoStatus = row.decisao?.status === 'ok' ? 'pendente' : 'ok';
    const payload = {
      ofr_code: ofrCode,
      status: novoStatus,
      motivo_recusa: null,
      decidido_por: userContext?.user?.name || userContext?.user?.email || null,
      decidido_em: new Date().toISOString()
    };
    const { error } = await supabase.from('financeiro_adiantamentos_decisoes').upsert(payload, { onConflict: 'ofr_code' });
    if (error) { paySetFeedback('fbAdiantamentos', error.message, 'err'); return; }
    row.decisao = { ...row.decisao, ...payload };
    renderAdiantamentosTable();
  }

  function abrirModalRecusaAdiantamento(ofrCode) {
    const row = (state.adiantamentosRows || []).find((r) => r.ofr_code === ofrCode);
    if (!row || ['pago','recusado'].includes(row.decisao?.status)) return;
    let modal = document.getElementById('adiantRecusaModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'adiantRecusaModal';
      modal.className = 'fin-pay-modal';
      document.body.appendChild(modal);
    }
    modal.innerHTML = `<div class="fin-pay-modal-card">
      <div class="fin-head">
        <div>
          <h3>Recusar adiantamento</h3>
          <p>Informe o motivo da recusa. Fica registrado no histórico.</p>
        </div>
        <button class="btn btn-secondary" id="adiantRecusaClose" type="button">Fechar</button>
      </div>
      <div class="pay-summary">
        <div class="pay-mini"><span>Colaborador</span><strong>${esc(row.colaborador || '-')}</strong></div>
        <div class="pay-mini"><span>Valor</span><strong>${money(row.valor)}</strong></div>
      </div>
      <div class="fin-field full mt-16">
        <label>Motivo da recusa <span style="color:#f87171">*</span></label>
        <textarea id="adiantRecusaMotivo" rows="4" placeholder="Descreva o motivo para recusar esta solicitação..." style="width:100%;background:rgba(255,255,255,.06);border:1px solid rgba(148,163,184,.2);border-radius:10px;color:#e2e8f0;padding:10px 12px;font-size:14px;resize:vertical">${esc(row.decisao?.motivo_recusa || '')}</textarea>
      </div>
      <div class="fin-actions-row mt-16">
        <button class="btn fin-btn-recusar" id="adiantRecusaConfirm" type="button">CONFIRMAR RECUSA</button>
        <span id="adiantRecusaFeedback" class="fin-feedback"></span>
      </div>
    </div>`;
    modal.classList.add('open');
    modal.querySelector('#adiantRecusaClose').onclick = () => modal.classList.remove('open');
    modal.querySelector('#adiantRecusaConfirm').onclick = () => confirmarRecusaAdiantamento(ofrCode, modal);
  }

  async function confirmarRecusaAdiantamento(ofrCode, modal) {
    const motivoEl = modal.querySelector('#adiantRecusaMotivo');
    const fb = modal.querySelector('#adiantRecusaFeedback');
    const motivo = (motivoEl?.value || '').trim();
    if (!motivo) {
      if (fb) { fb.textContent = 'Informe o motivo da recusa.'; fb.style.color = '#f87171'; }
      motivoEl?.focus();
      return;
    }
    const btn = modal.querySelector('#adiantRecusaConfirm');
    if (btn) { btn.disabled = true; btn.textContent = 'Recusando...'; }
    try {
      const payload = {
        ofr_code: ofrCode,
        status: 'recusado',
        motivo_recusa: motivo,
        decidido_por: userContext?.user?.name || userContext?.user?.email || null,
        decidido_em: new Date().toISOString()
      };
      const { error } = await supabase.from('financeiro_adiantamentos_decisoes').upsert(payload, { onConflict: 'ofr_code' });
      if (error) throw error;
      const row = (state.adiantamentosRows || []).find((r) => r.ofr_code === ofrCode);
      if (row) row.decisao = { ...row.decisao, ...payload };
      modal.classList.remove('open');
      renderAdiantamentosTable();
    } catch (err) {
      if (fb) { fb.textContent = `Erro: ${err.message}`; fb.style.color = '#f87171'; }
      if (btn) { btn.disabled = false; btn.textContent = 'CONFIRMAR RECUSA'; }
    }
  }

  // PAGAR (Adiantamentos): por enquanto gera os arquivos de upload em conta bancária
  // (mesmo modelo Flash/iFood/Alelo já usado em Diárias e Almoço) e registra a execução
  // para conferência/dedup — não chama a Edge Function de pagamento automático ainda.
  async function pagarAdiantamentos() {
    const selecionados = (state.adiantamentosRows || []).filter((r) => r.decisao?.status === 'ok');
    if (!selecionados.length) return paySetFeedback('fbAdiantamentos', 'Marque ✓ em pelo menos uma solicitação antes de pagar.', 'err');

    const conferenciaRows = selecionados.map((row) => {
      const contaNorm = normalize(row.conta);
      const destino = contaNorm.includes('ifood') ? 'iFood' : contaNorm.includes('flash') ? 'Flash' : contaNorm.includes('alelo') ? 'Alelo' : 'Pendente';
      const conf = {
        data: row.data_solicitacao,
        funcionario: row.colaborador,
        cpf: onlyDigits(row.cpf),
        destino,
        tipo: 'Adiantamento',
        valor: roundNumber(row.valor),
        composicao: row.descricao || 'Adiantamento',
        coordenacao: row.coordenacao,
        supervisao: row.supervisao,
        banco: row.conta,
        observacao: 'OK'
      };
      return { ...conf, unique_hash: makePaymentHash(conf), _ofr_code: row.ofr_code };
    });

    const pagaveis = conferenciaRows.filter((row) => row.destino !== 'Pendente');
    const semDestino = conferenciaRows.filter((row) => row.destino === 'Pendente');
    if (!pagaveis.length) return paySetFeedback('fbAdiantamentos', 'Nenhuma linha selecionada tem Conta reconhecida (Flash/iFood/Alelo).', 'err');

    const btn = document.getElementById('btnPagarAdiantamentos');
    try {
      if (btn) btn.disabled = true;
      paySetFeedback('fbAdiantamentos', 'Conferindo duplicidades e gerando arquivos de pagamento...');

      const paid = await fetchAlreadyPaidMap(pagaveis.map((r) => r.unique_hash));
      const elegiveis = pagaveis.filter((r) => !paid.has(r.unique_hash));
      const jaPagos = pagaveis.filter((r) => paid.has(r.unique_hash));

      if (elegiveis.length) {
        const outputs = buildPaymentOutputs(elegiveis.map((r) => ({ ...r, status_pagamento: 'OK' })));
        const periodo = new Date().toISOString().slice(0, 10);
        const total = elegiveis.reduce((sum, r) => sum + Number(r.valor || 0), 0);

        const { data: execucao, error: execError } = await supabase.from('financeiro_pagamentos_execucoes').insert({
          tipo: 'Adiantamentos',
          periodo,
          status: 'PAGO',
          total_valor: roundNumber(total),
          total_linhas: elegiveis.length,
          responsavel: userContext?.user?.name || userContext?.user?.email || null
        }).select('id').single();
        if (execError) throw execError;

        await registrarLinhasPagamento(elegiveis, execucao.id, 'PAGO');
        await salvarResumoNotasFiscais(elegiveis, execucao.id);

        const arquivos = [];
        if (outputs.flash.length) { downloadWorkbook(`PGTO_FLASH_${compactDate(periodo)}.xlsx`, [{ name: 'PGTO_FLASH', ws: worksheetFromObjects(outputs.flash, flashCols) }]); arquivos.push(`Flash (${outputs.flash.length})`); }
        if (outputs.ifood.length) { downloadWorkbook(`PGTO_IFOOD_${compactDate(periodo)}.xlsx`, [{ name: 'PGTO_IFOOD', ws: worksheetFromObjects(outputs.ifood, ifoodCols) }]); arquivos.push(`iFood (${outputs.ifood.length})`); }
        if (outputs.alelo.length) { downloadCsv(`PGTO_ALELO_${compactDate(periodo)}.csv`, outputs.alelo, aleloCols); arquivos.push(`Alelo (${outputs.alelo.length})`); }
        downloadWorkbook(`CONFERENCIA_ADIANTAMENTOS_${compactDate(periodo)}.xlsx`, [{ name: 'Conferencia', ws: worksheetFromObjects(elegiveis, confCols) }]);

        const pagoEm = new Date().toISOString();
        const responsavel = userContext?.user?.name || userContext?.user?.email || null;
        const decisoesPagas = elegiveis.map((r) => ({ ofr_code: r._ofr_code, status: 'pago', execucao_id: execucao.id, pago_em: pagoEm, decidido_por: responsavel, decidido_em: pagoEm }));
        const { error: decError } = await supabase.from('financeiro_adiantamentos_decisoes').upsert(decisoesPagas, { onConflict: 'ofr_code' });
        if (decError) throw decError;
        decisoesPagas.forEach((d) => {
          const row = (state.adiantamentosRows || []).find((x) => x.ofr_code === d.ofr_code);
          if (row) row.decisao = { ...row.decisao, ...d };
        });

        paySetFeedback('fbAdiantamentos', `Arquivo(s) gerado(s): ${arquivos.join(', ') || 'nenhum (sem CPF válido)'}${jaPagos.length ? ` · ${jaPagos.length} já estavam pagas` : ''}${semDestino.length ? ` · ${semDestino.length} sem conta reconhecida (não incluída)` : ''}.`, 'ok');
      } else {
        paySetFeedback('fbAdiantamentos', 'Todas as linhas selecionadas já constavam como PAGO. Nenhum arquivo novo foi gerado.', 'ok');
      }

      jaPagos.forEach((r) => {
        const row = (state.adiantamentosRows || []).find((x) => x.ofr_code === r._ofr_code);
        if (row && row.decisao?.status !== 'pago') row.decisao = { ...row.decisao, status: 'pago' };
      });

      renderAdiantamentosTable();
      setAdiantTab('historico');
    } catch (err) {
      console.error(err);
      paySetFeedback('fbAdiantamentos', err.message || 'Erro ao gerar pagamento.', 'err');
      renderAdiantamentosTable();
    }
  }


  function carregarDespesasTab() {
    if (state.adiantamentosLoaded) return;
    state.adiantamentosLoaded = true;
    carregarAdiantamentos();
  }

  async function salvarResumoNotasFiscais(rows, execucaoId = null) {
    const resumo = groupNotasFiscaisResumo(rows, execucaoId);
    if (!resumo.length) return;
    const { error } = await supabase.from('financeiro_notas_fiscais_resumo').upsert(resumo, {
      onConflict: 'data_pagamento,regional,destino,modulo_origem'
    });
    if (error) throw error;
  }

  async function registrarLinhasPagamento(rows, execucaoId, status = 'PAGO', apiRetorno = null) {
    const payload = (rows || []).map((row) => ({
      execucao_id: execucaoId,
      unique_hash: row.unique_hash || makePaymentHash(row),
      data: row.data || null,
      funcionario: row.funcionario || null,
      cpf: onlyDigits(row.cpf) || null,
      destino: row.destino || null,
      tipo: row.tipo || null,
      valor: Number(row.valor || 0),
      composicao: row.composicao || null,
      coordenacao: row.coordenacao || null,
      supervisao: row.supervisao || null,
      banco: row.banco || null,
      observacao: row.observacao || null,
      status,
      pago_em: status === 'PAGO' ? new Date().toISOString() : null,
      api_retorno: apiRetorno
    }));
    if (!payload.length) return;
    const { error } = await supabase.from('financeiro_pagamentos_linhas').upsert(payload, { onConflict: 'unique_hash' });
    if (error) throw error;
  }

  const flashCols = [{ key: 'cpf', label: 'CPF' }, { key: 'valor', label: 'Valor' }];
  const ifoodCols = [
    { key: 'cnpj', label: 'CNPJ' }, { key: 'nome', label: 'Nome' }, { key: 'cpf', label: 'CPF' },
    { key: 'nascimento', label: 'Data de nascimento', format: formatDateForXlsx }, { key: 'email', label: 'Email' },
    { key: 'celular', label: 'Celular' }, { key: 'centro_custo', label: 'Centro de custo' }, { key: 'convencao', label: 'Convenção Coletiva' },
    { key: 'grupo_entrega', label: 'Grupo de entrega' }, { key: 'matricula', label: 'Matricula' }, { key: 'filtro', label: 'Filtro para relatorio de recarga' },
    { key: 'refeicao', label: 'Refeição (Aderente ao PAT)' }, { key: 'alimentacao', label: 'Alimentação (Aderente ao PAT)' }, { key: 'livre', label: 'Livre' }
  ];
  const aleloCols = [{ key: 'serie', label: 'Numero de Serie' }, { key: 'cpf', label: 'CPF' }, { key: 'valor', label: 'Valor da Carga' }, { key: 'observacao', label: 'Observacao' }];
  const confCols = [
    { key: 'data', label: 'Data', format: formatDateForXlsx }, { key: 'funcionario', label: 'Colaborador' }, { key: 'cpf', label: 'CPF' },
    { key: 'destino', label: 'Destino' }, { key: 'tipo', label: 'Tipo' }, { key: 'valor', label: 'Valor' },
    { key: 'composicao', label: 'Composição' }, { key: 'coordenacao', label: 'Coordenação' }, { key: 'supervisao', label: 'Supervisão' },
    { key: 'banco', label: 'C. Banc. Despesas' }, { key: 'observacao', label: 'Observação' }
  ];

  document.querySelectorAll('.fin-tab').forEach((btn) => btn.addEventListener('click', () => { setTab(btn.dataset.tab); if (btn.dataset.tab && btn.dataset.tab !== 'fluxo') history.replaceState(null, '', `#${btn.dataset.tab}`); }));
  document.querySelectorAll('[data-tab-target]').forEach((btn) => btn.addEventListener('click', () => { setTab(btn.dataset.tabTarget); if (btn.dataset.tabTarget && btn.dataset.tabTarget !== 'fluxo') history.replaceState(null, '', `#${btn.dataset.tabTarget}`); }));
  document.getElementById('btnReload').addEventListener('click', loadFluxo);
  document.getElementById('btnReloadSetorPagamentos')?.addEventListener('click', loadSetorPagamentos);
  document.getElementById('btnEnviarBaixaNf')?.addEventListener('click', enviarComprovantesBaixaNf);
  document.getElementById('nfReloadBtn')?.addEventListener('click', loadNotasFiscais);
  document.getElementById('nfFiltroCliente')?.addEventListener('input', (event) => { state.notasFiscaisFiltro.cliente = event.target.value; renderNotasFiscais(); });
  document.getElementById('nfFiltroSituacao')?.addEventListener('change', (event) => { state.notasFiscaisFiltro.situacao = event.target.value; renderNotasFiscais(); });
  document.querySelectorAll('[data-setor-pay]').forEach((btn) => btn.addEventListener('click', () => {
    state.pagamentosSetorFilter = btn.dataset.setorPay || 'todos';
    document.querySelectorAll('[data-setor-pay]').forEach((item) => item.classList.toggle('active', item === btn));
    renderSetorPagamentos();
  }));
  document.getElementById('btnImportReceber').addEventListener('click', () => importFile('receber'));
  document.getElementById('btnImportPagar').addEventListener('click', () => importFile('pagar'));
  document.getElementById('configForm').addEventListener('submit', saveConfig);

  document.querySelectorAll('.det-th-sort').forEach((th) => {
    th.style.cursor = 'pointer';
    th.addEventListener('click', () => {
      const col = th.dataset.detSort;
      if (state.detSort.col === col) { state.detSort.dir *= -1; } else { state.detSort.col = col; state.detSort.dir = 1; }
      renderDetalhes();
    });
  });
  document.querySelectorAll('.adiant-th-sort').forEach((th) => {
    th.addEventListener('click', () => {
      const col = th.dataset.adiantSort;
      if (state.adiantSort.col === col) { state.adiantSort.dir *= -1; } else { state.adiantSort.col = col; state.adiantSort.dir = 1; }
      renderAdiantamentosTable();
    });
  });
  document.getElementById('detFiltroTipo')?.addEventListener('change', (e) => { state.detFilter.tipo = e.target.value; renderDetalhes(); });
  document.getElementById('detFiltroSituacao')?.addEventListener('change', (e) => { state.detFilter.situacao = e.target.value; renderDetalhes(); });
  document.getElementById('detFiltroFavorecido')?.addEventListener('input', (e) => { state.detFilter.favorecido = e.target.value; renderDetalhes(); });
  document.getElementById('detFiltroDoc')?.addEventListener('input', (e) => { state.detFilter.doc = e.target.value; renderDetalhes(); });

  document.getElementById('btnAtualizarAdiantamentos')?.addEventListener('click', carregarAdiantamentos);
  document.getElementById('btnPagarAdiantamentos')?.addEventListener('click', pagarAdiantamentos);
  document.querySelectorAll('.adiant-subtab').forEach((btn) => btn.addEventListener('click', () => setAdiantTab(btn.dataset.adiantTab)));
  document.getElementById('histColaboradorFiltro')?.addEventListener('input', () => renderHistoricoAgrupado(state.adiantamentosHistorico || []));
  document.getElementById('periodForm').addEventListener('submit', (event) => {
    event.preventDefault();
    state.filters.inicio = document.getElementById('filterInicio').value;
    state.filters.fim = document.getElementById('filterFim').value;
    loadFluxo();
  });
  content.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-detail-date]');
    if (btn) loadDetalhes(btn.dataset.detailDate);
  });
  document.getElementById('btnVoltarFluxo')?.addEventListener('click', mostrarFluxoLista);
  document.querySelectorAll('.ajustes-subtab').forEach((btn) => btn.addEventListener('click', () => setAjustesTab(btn.dataset.ajustesTab)));

  window.addEventListener('hashchange', () => setTab(tabFromHash()));
  carregarDespesasTab();
  setTab(tabFromHash());
  sincronizarContasAgente().then(loadFluxo, loadFluxo);
}

initProtectedPage('Financeiro', renderContent);
