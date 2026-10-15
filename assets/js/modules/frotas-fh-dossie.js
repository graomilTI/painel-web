// Frotas — Fora do horário — dossiê do dia, lista e modais (a parte que mexe no DOM).
// Extraído de modules/frotas.js em 14/10/2026 e dividido em 15/10/2026 (frotas-fh-dossie.js tinha 1.030 linhas):
// regras (frotas-fh-dossie-regras) -> HTML (frotas-fh-dossie-html) -> tela (frotas-fh-dossie). Código movido sem alteração.
// Para publicar uma mudança em qualquer módulo frotas-*.js deste conjunto, troque o token ?v=20261015-frotas-dos1 em TODOS os imports
// internos (e os do carregador da página): tests/frotas-modulos-versao.test.mjs garante que fiquem iguais.
import { state, currentRenderOpts, resolveSupabase, normalizeName, escapeHtml, onlyPlate, formatDateBR, toast } from './frotas-base.js?v=20261015-frotas-dos1';
import { fhLiberarAncestrais, fhEnquadrarJanela, readForaHorarioReportPeriod, formatKmForaHorario, fhChave, fhDataCurta, fhTitulo, fhDiasPendentes, atualizarFiltrosForaHorario, fhAtualizarStatusExcessos, formatCoordForaHorario } from './frotas-fh-util.js?v=20261015-frotas-dos1';
import { fhCarregarMapa, fhFecharMapa } from './frotas-fh-mapa.js?v=20261015-frotas-dos1';
import { fhDiaSemana, fhAgruparPorRota, fhLinhaPorChave, fhGravidade, fhCategorias, fhMesclarDossies } from './frotas-fh-dossie-regras.js?v=20261015-frotas-dos1';
import { fhRodapeDia, fhLinhaHtml, renderDossieHtml } from './frotas-fh-dossie-html.js?v=20261015-frotas-dos1';

  function atualizarRodapeDossie(root) {
    const rodape = root.querySelector('[data-dossie-rodape]');
    if (!rodape) return;
    const linha = fhLinhaPorChave(state.foraHorarioDossieChave);
    const dias = linha ? (linha.rota ? linha.rota.dias : [linha]) : [];
    rodape.innerHTML = dias.map((dia) => fhRodapeDia(dia, dias.length > 1 ? `${fhDiaSemana(dia.data_evento)}, ${fhDataCurta(dia.data_evento)}` : '')).filter(Boolean).join('');
  }

  // Redesenha o dossiê aberto mantendo a aba em que o usuário estava.
  function fhRenderDossieAberto(root) {
    const dos = state.foraHorarioDossieAberto;
    const corpo = root.querySelector('[data-dossie-body]');
    if (!dos || !corpo) return;
    const abaAtiva = corpo.querySelector('.fh-aba.active')?.dataset.fhAba;
    const row = fhLinhaPorChave(state.foraHorarioDossieChave);
    corpo.innerHTML = renderDossieHtml(dos, row);
    if (abaAtiva && abaAtiva !== 'resumo') corpo.querySelector(`[data-fh-aba="${abaAtiva}"]`)?.click();
  }

  // "Atualizado em ..." vem do controle diário gravado no banco.
  function renderFrescorForaHorario(root) {
    const el = root.querySelector('[data-fh-fresco]');
    if (!el) return;
    const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
    const { end } = readForaHorarioReportPeriod(root);
    const partes = [];
    const atualizacoes = (state.foraHorarioSync || []).map((c) => c.dossie_em).filter(Boolean).sort();
    if (atualizacoes.length) {
      const quando = new Date(atualizacoes[atualizacoes.length - 1]).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
      partes.push(`Atualizado em ${quando.replace(',', ' às')}`);
    }
    const pendentes = fhDiasPendentes();
    if (pendentes.length) partes.push(`sincronizando automaticamente: ${pendentes.join(', ')}`);
    if (end && end >= hoje) partes.push('o dia de hoje só fecha depois da meia-noite');
    el.textContent = partes.join(' · ');
    el.hidden = !partes.length;
  }

  function renderForaHorarioList(root) {
    const lista = root.querySelector('[data-fora-horario-table]');
    const count = root.querySelector('[data-fora-horario-count]');
    const alerta = root.querySelector('[data-fh-alerta]');
    if (!lista) return;

    if (!state.foraHorarioLoaded) {
      lista.innerHTML = '<div class="speed-import-empty">Carregando ocorrências...</div>';
      if (count) count.textContent = 'Carregando...';
      return;
    }

    const term = normalizeName(state.foraHorarioSearchTerm || '');
    // "Rota" junta os dias seguidos ligados pela meia-noite; "Dia" mostra o relatório cortado às 00h.
    const base = state.foraHorarioAgrupar === 'rota' ? fhAgruparPorRota(state.foraHorario || []) : (state.foraHorario || []);
    state.foraHorarioLinhas = new Map(base.map((row) => [fhChave(row), row]));
    const buscadas = base.filter((row) => {
      if (!term) return true;
      return normalizeName(row.motorista || '').includes(term) || normalizeName(row.placa || '').includes(term);
    });

    const contagem = { ALERTAS: 0, FORA_HORARIO: 0, USO_INDEVIDO: 0, EXCESSO: 0, SEM_DOSSIE: 0, TODOS: buscadas.length };
    buscadas.forEach((row) => { fhCategorias(row).forEach((categoria) => { contagem[categoria] += 1; }); });
    atualizarFiltrosForaHorario(root, contagem);
    renderFrescorForaHorario(root);

    const filtro = state.foraHorarioFiltro;
    const rows = buscadas.filter((row) => filtro === 'TODOS' || fhCategorias(row).includes(filtro));
    rows.sort((a, b) => String(b.data_evento).localeCompare(String(a.data_evento))
      || (fhGravidade(b.dossie) - fhGravidade(a.dossie))
      || (Number(b.dossie?.km_fora || 0) - Number(a.dossie?.km_fora || 0))
      || String(a.placa).localeCompare(String(b.placa)));

    if (count) count.textContent = `${rows.length} ocorrência(s) carregada(s)`;

    // Só aparece quando há algo errado; a explicação fica recolhida em "Como funciona".
    const temDossie = (state.foraHorario || []).some((row) => row.dossie);
    if (alerta) {
      let texto = '';
      if (!state.foraHorarioDossieDisponivel) texto = 'O dossiê ainda não está disponível neste ambiente: a lista é o relatório bruto da BFleet.';
      else if ((state.foraHorario || []).length && !temDossie) texto = 'O dossiê ainda não foi calculado para este período.';
      alerta.hidden = !texto;
      alerta.innerHTML = texto
        ? `${escapeHtml(texto)}${state.foraHorarioDossieDisponivel ? ' <button type="button" class="fora-horario-link-btn" data-recalcular-dossie>Recalcular dossiê</button>' : ''}`
        : '';
    }

    if (!rows.length) {
      const pendentes = fhDiasPendentes();
      const vazio = (state.foraHorario || []).length
        ? 'Nenhuma ocorrência neste filtro para o período. Troque o filtro acima para ver as demais.'
        : (pendentes.length
          ? `Os dados de ${pendentes.join(', ')} ainda estão sendo sincronizados automaticamente (a verificação roda a cada 20 min, de madrugada e de manhã). Volte em alguns minutos.`
          : 'Nenhuma ocorrência encontrada para o período. Use "Sincronizar período" para consultar a RedGPS/BFleet.');
      lista.innerHTML = `<div class="speed-import-empty">${vazio}</div>`;
      return;
    }

    // Um cabeçalho por dia (a data não se repete em cada linha).
    const porDia = rows.reduce((mapa, row) => mapa.set(row.data_evento, (mapa.get(row.data_evento) || 0) + 1), new Map());
    let diaAtual = null;
    lista.innerHTML = rows.map((row) => {
      let cabecalho = '';
      if (row.data_evento !== diaAtual) {
        diaAtual = row.data_evento;
        const feriado = (state.foraHorarioFeriados || {})[row.data_evento];
        const especial = feriado ? `feriado: ${feriado}` : (fhDiaSemana(row.data_evento) === 'domingo' ? 'domingo' : '');
        cabecalho = `<div class="fh-dia">${escapeHtml(fhDiaSemana(row.data_evento))}, ${escapeHtml(formatDateBR(row.data_evento))}<span>${porDia.get(row.data_evento)} veículo(s)</span>${especial ? `<span class="fh-dia-esp">${escapeHtml(especial)} · uso só com embarque</span>` : ''}</div>`;
      }
      return cabecalho + fhLinhaHtml(row);
    }).join('');
  }

  async function openDossieModal(root, opts, chave) {
    const modal = root.querySelector('[data-dossie-modal]');
    if (!modal) return;
    const row = fhLinhaPorChave(chave);
    if (!row?.dossie) { toast('Dossiê não disponível para esta ocorrência.', 'error'); return; }

    const tituloEl = modal.querySelector('[data-dossie-title]');
    const corpoEl = modal.querySelector('[data-dossie-body]');
    const copiarBtn = modal.querySelector('[data-dossie-copiar]');
    if (tituloEl) tituloEl.textContent = `${fhTitulo(row.motorista) || 'Colaborador não identificado'} · ${onlyPlate(row.placa)}`;
    if (corpoEl) corpoEl.innerHTML = '<div class="speed-import-empty">Carregando detalhes...</div>';
    if (copiarBtn) copiarBtn.hidden = true;
    fhFecharMapa(root);
    state.foraHorarioDossieAberto = null;
    state.foraHorarioDossieChave = chave;
    atualizarRodapeDossie(root);
    fhLiberarAncestrais(root);
    modal.hidden = false;
    fhEnquadrarJanela(modal);
    modal.querySelector('.speed-modal')?.focus({ preventScroll: true });

    try {
      const supabase = resolveSupabase(opts);
      const diasDaLinha = row.rota ? row.rota.dias : [row];
      const dossies = [];
      for (const dia of diasDaLinha) {
        const { data: unico, error } = await supabase
          .from('frotas_fora_horario_dossie')
          .select('*')
          .eq('data_evento', dia.data_evento)
          .eq('placa', dia.dossie?.placa || dia.placa)
          .maybeSingle();
        if (error) throw error;
        if (!unico) throw new Error('Dossiê não encontrado. Recalcule o período.');
        dossies.push(unico);
      }
      const data = dossies.length > 1 ? fhMesclarDossies(dossies) : dossies[0];
      state.foraHorarioDossieAberto = data;
      await fhAtualizarStatusExcessos(supabase, data);
      if (corpoEl) corpoEl.innerHTML = renderDossieHtml(data, row);
      if (copiarBtn) copiarBtn.hidden = false;
      fhCarregarMapa(root, opts);
    } catch (err) {
      console.error('[FROTAS] Dossiê fora do horário:', err);
      if (corpoEl) corpoEl.innerHTML = `<div class="speed-import-empty">${escapeHtml(err.message || 'Não foi possível carregar o dossiê.')}</div>`;
    }
  }

  async function openRotaModal(root, rowId, opts = currentRenderOpts) {
    const row = (state.foraHorario || []).find((item) => String(item.id) === String(rowId));
    if (!row) return toast('Ocorrência não localizada.', 'error');

    const modal = root.querySelector('[data-rota-modal]');
    if (!modal) return;
    const titleEl = modal.querySelector('[data-rota-modal-title]');
    const kmEl = modal.querySelector('[data-rota-modal-km]');
    const hintEl = modal.querySelector('[data-rota-modal-hint]');
    const bodyEl = modal.querySelector('[data-rota-modal-body]');
    const linkEl = modal.querySelector('[data-rota-modal-link]');

    const placa = onlyPlate(row.placa) || '-';
    const data = formatDateBR(row.data_evento) || '-';
    if (titleEl) titleEl.textContent = `Rota 00h–04h do Caixa · ${placa} · ${data}`;
    if (kmEl) kmEl.textContent = `${formatKmForaHorario(Number(row.km_00_05 || 0))} km (00h–04h)`;
    if (linkEl) linkEl.hidden = true;
    if (hintEl) hintEl.textContent = '';
    if (bodyEl) bodyEl.innerHTML = '<tr><td colspan="5" class="speed-import-empty">Carregando rota...</td></tr>';
    fhLiberarAncestrais(root);
    modal.hidden = false;
    fhEnquadrarJanela(modal);

    // O detalhe do cálculo é pesado: fica fora da lista e só é lido aqui.
    let detalhes = null;
    let mapaUrl = '';
    try {
      const supabase = resolveSupabase(opts);
      const { data: ocorrencia, error } = await supabase
        .from('frotas_fora_horario_ocorrencias').select('calculo_detalhes,mapa_url').eq('id', rowId).maybeSingle();
      if (error) throw error;
      detalhes = ocorrencia?.calculo_detalhes || null;
      mapaUrl = ocorrencia?.mapa_url || '';
    } catch (err) {
      console.warn('[FROTAS] Rota do Caixa:', err);
    }
    if (linkEl && mapaUrl) { linkEl.href = mapaUrl; linkEl.hidden = false; }

    const pontos = detalhes?.history?.rota || [];
    const trechos = detalhes?.fallback_relatorio?.trechos || [];

    if (bodyEl) {
      if (pontos.length) {
        if (hintEl) hintEl.textContent = `${pontos.length} ponto(s) de GPS registrados entre 00h e 04h, na ordem em que ocorreram.`;
        bodyEl.innerHTML = pontos.map((p) => `<tr>
          <td><strong>${escapeHtml(String(p.hora || '--:--:--'))}</strong></td>
          <td>${escapeHtml(p.endereco || '-')}</td>
          <td>${escapeHtml(formatCoordForaHorario(p.latitude))}</td>
          <td>${escapeHtml(formatCoordForaHorario(p.longitude))}</td>
          <td>${Number.isFinite(Number(p.velocidade)) ? Number(p.velocidade).toFixed(0) : '-'}</td>
        </tr>`).join('');
      } else if (trechos.length) {
        if (hintEl) hintEl.textContent = 'Sem GPS detalhado da RedGPS para esta ocorrência; km estimado por trecho a partir do relatório BFleet.';
        bodyEl.innerHTML = trechos.map((t) => `<tr>
          <td colspan="4"><strong>${escapeHtml(t.inicio || '--:--:--')} → ${escapeHtml(t.fim || '--:--:--')}</strong></td>
          <td>${formatKmForaHorario(Number(t.km_proporcional_00_04 || 0))} km</td>
        </tr>`).join('');
      } else {
        if (hintEl) hintEl.textContent = 'Nenhum ponto de rota disponível para esta ocorrência.';
        bodyEl.innerHTML = '<tr><td colspan="5" class="speed-import-empty">Sem dados de rota.</td></tr>';
      }
    }
  }

export { atualizarRodapeDossie, fhRenderDossieAberto, renderForaHorarioList, openDossieModal, openRotaModal };
