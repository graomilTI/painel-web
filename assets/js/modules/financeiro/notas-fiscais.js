// Financeiro — aba Notas Fiscais e baixa de NFs pelo comprovante.
// Extraído de assets/js/financeiro.js (renderContent) em 15/10/2026. Cada fábrica criarX(ctx) recebe o contexto da tela
// ({ content, userContext } + funções das fábricas anteriores) e devolve as funções que as outras partes usam. O código
// das funções e constantes foi movido sem alteração. Para publicar uma mudança em qualquer módulo de
// assets/js/modules/financeiro/, troque o token ?v=20261030-fin17 em TODOS os imports internos e nos carregadores
// (assets/js/financeiro.js, financeiro.html): tests/financeiro-modulos-versao.test.mjs garante que fiquem iguais.
import { supabase } from '../../supabaseClient.js';
import { state, esc, normalize, money, toNumber } from './util.js?v=20261030-fin17';
import { groupNotasFiscaisResumo } from './pagamentos.js?v=20261030-fin17';
import { cardFiltro } from '../../patrimonioLayoutFrotas.js?v=20261019-ordenar';

function criarNotasFiscais(ctx) {
  // ── Notas Fiscais (sincronizado pelo agente sync-notas-fiscais) ───────────
  // Tela nova, somente leitura — não existia destino estruturado pra esse agente antes.
  async function loadNotasFiscais() {
    const tbody = document.getElementById('nfTbody');
    if (tbody) tbody.innerHTML = '<tr><td colspan="9" class="fm-empty">Carregando...</td></tr>';
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

    summary.innerHTML = [
      cardFiltro({ label: 'Total de N.F.', tone: 'blue', icone: 'doc', valor: String(rows.length) }),
      cardFiltro({ label: 'Valor bruto', tone: 'green', icone: 'dinheiro', valor: money(valorBrutoTotal) }),
      cardFiltro({ label: 'Valor da N.F.', tone: 'purple', icone: 'total', valor: money(valorNfTotal) }),
      cardFiltro({ label: 'Pagas / Aguardando', tone: 'amber', icone: 'relogio', valor: `${pagas} / ${aguardando}` }),
    ].join('');

    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="9" class="fm-empty">Nenhuma nota fiscal encontrada.</td></tr>';
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
        <td><span class="fm-badge ${nf?.Situação === 'Paga' ? 'ok' : ''}">${esc(nf?.Situação || '-')}</span></td>
      </tr>
    `).join('');
    if (note) note.textContent = sorted.length > preview.length ? `Mostrando ${preview.length} de ${sorted.length} notas fiscais.` : '';
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

  // Tom e ícone do card de cada situação da fila de baixa.
  const BAIXA_NF_CARD = {
    NOVO: ['blue', 'relogio'],
    PROCESSANDO: ['amber', 'relogio'],
    AGUARDANDO_REVISAO: ['amber', 'alerta'],
    VALIDADO: ['green', 'ok'],
    BAIXADO: ['green', 'ok'],
    ERRO: ['red', 'erro'],
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
    alvo.innerHTML = statuses.map((s, i) => {
      const [tone, icone] = BAIXA_NF_CARD[s];
      return cardFiltro({ label: BAIXA_NF_STATUS_LABEL[s], tone, icone, valor: String(counts[i]?.count || 0) });
    }).join('');
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

  async function salvarResumoNotasFiscais(rows, execucaoId = null) {
    const resumo = groupNotasFiscaisResumo(rows, execucaoId);
    if (!resumo.length) return;
    const { error } = await supabase.from('financeiro_notas_fiscais_resumo').upsert(resumo, {
      onConflict: 'data_pagamento,regional,destino,modulo_origem'
    });
    if (error) throw error;
  }

  return { loadNotasFiscais, renderNotasFiscais, carregarResumoBaixaNf, enviarComprovantesBaixaNf, salvarResumoNotasFiscais };
}

export { criarNotasFiscais };
