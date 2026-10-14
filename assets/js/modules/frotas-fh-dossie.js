// Frotas — Fora do horário — dossiê do dia, lista e modais.
// Extraído de modules/frotas.js em 14/10/2026 (era um único bloco autoexecutável de ~4.100 linhas).
// O código das funções e constantes foi movido sem alteração. Para publicar uma mudança em qualquer
// módulo frotas-*.js deste conjunto, troque o token ?v=20261014-frotas-modular1 em TODOS os imports internos (e os do
// carregador da página): o teste tests/frotas-modulos-versao.test.mjs garante que fiquem iguais.
import { state, currentRenderOpts, resolveSupabase, normalizeName, escapeHtml, onlyPlate, formatDateBR, toast } from './frotas-base.js?v=20261014-frotas-modular1';
import { fhLiberarAncestrais, fhEnquadrarJanela, readForaHorarioReportPeriod, formatKmForaHorario, formatMoneyForaHorario, FH_VEREDITOS, FH_EVIDENCIAS, fhPrimeiroNome, FH_DIAS_SEMANA, fhHm, fhHoraMin, fhMinutosDoDia, fhKm, fhDuracao, fhFonteRotulo, fhChave, fhLinkTrajeto, fhLinkPonto, FH_USOS, FH_STATUS_EXCESSO, fhEnderecoCurto, FH_FORA_MIN_KM, fhDiaSeguinte, fhDataCurta, FH_ORDEM_VEREDITO, FH_ORDEM_USO, fhPior, fhDiaEspecial, fhDiaEspecialRotulo, fhMaiusc, fhNum, fhPeriodo, fhTitulo, fhDiasPendentes, atualizarFiltrosForaHorario, fhAtualizarStatusExcessos, formatCoordForaHorario } from './frotas-fh-util.js?v=20261014-frotas-modular1';
import { finito, fhAgruparOs, fhCarregarMapa, fhFecharMapa } from './frotas-fh-mapa.js?v=20261014-frotas-modular1';

  // Texto do registro; quando foi feito por um colega de carona, diz de quem.
  function fhEvidenciaRotulo(e) {
    let base = FH_EVIDENCIAS[e.tipo] || e.tipo;
    if (e.tipo === 'OS_PROGRAMADA') base = e.sentido === 'saida' ? 'Veículo saiu do local da O.S. escalada' : 'Veículo chegou ao local da O.S. escalada';
    if (e.tipo === 'CARONA') base = `${e.sentido === 'saida' ? 'Veículo saiu da casa' : 'Veículo chegou à casa'} de ${fhPrimeiroNome(e.quem)} (carona)`;
    else if (e.papel === 'CARONA' && e.quem) base += ` — ${fhPrimeiroNome(e.quem)} (carona)`;
    else if (e.papel === 'EQUIPE' && e.quem) base += ` — ${fhPrimeiroNome(e.quem)} (equipe)`;
    return base;
  }

  function fhDiaSemana(dataIso) {
    const m = String(dataIso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return '';
    return FH_DIAS_SEMANA[new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).getUTCDay()];
  }

  // Vários dias seguidos de uma mesma rota viram um só resumo (usado na lista e no dossiê da rota).
  function fhResumirDossies(lista) {
    const soma = (campo) => lista.reduce((total, d) => total + fhNum(d[campo]), 0);
    const primeiro = lista[0];
    const ultimo = lista[lista.length - 1];
    return {
      ...primeiro,
      veredito: fhPior(lista.map((d) => d.veredito), FH_ORDEM_VEREDITO) || primeiro.veredito,
      veredito_uso: fhPior(lista.map((d) => d.veredito_uso), FH_ORDEM_USO) || primeiro.veredito_uso,
      criterio: 'ROTA',
      km_dia: soma('km_dia'), km_fora: soma('km_fora'), min_fora: soma('min_fora'),
      km_noturno: soma('km_noturno'), km_apos_chegada: soma('km_apos_chegada'),
      viagens_dia: soma('viagens_dia'), viagens_fora: soma('viagens_fora'),
      km_indevido: soma('km_indevido'), viagens_indevidas: soma('viagens_indevidas'),
      qtd_excessos: soma('qtd_excessos'), excessos_fora: soma('excessos_fora'),
      vel_max: Math.max(0, ...lista.map((d) => fhNum(d.vel_max))) || null,
      uso_sem_base: lista.every((d) => d.uso_sem_base),
      atraso_retorno_min: Math.max(...lista.map((d) => fhNum(d.atraso_retorno_min))),
      chegada_casa: ultimo.chegada_casa,
      retorno_previsto: ultimo.retorno_previsto,
      caronas: [...new Set(lista.flatMap((d) => (Array.isArray(d.caronas) ? d.caronas : [])))],
      motivos: lista.flatMap((d) => (d.motivos || []).map((m) => `${fhDataCurta(d.data_evento)}: ${m}`))
    };
  }

  // Rota = dias seguidos da mesma placa ligados pela meia-noite (o relatório da BFleet corta as viagens às 00h).
  function fhAgruparPorRota(linhas) {
    const porPlaca = new Map();
    linhas.forEach((linha) => {
      const chave = onlyPlate(linha.placa);
      if (!porPlaca.has(chave)) porPlaca.set(chave, []);
      porPlaca.get(chave).push(linha);
    });
    const montar = (dias) => {
      if (dias.length === 1) return dias[0];
      const comDossie = dias.filter((linha) => linha.dossie);
      return { ...dias[0], rota: { dias }, dossie: comDossie.length ? fhResumirDossies(comDossie.map((linha) => linha.dossie)) : null };
    };
    const saida = [];
    porPlaca.forEach((lista) => {
      lista.sort((a, b) => String(a.data_evento).localeCompare(String(b.data_evento)));
      let atual = null;
      lista.forEach((linha) => {
        const anterior = atual ? atual[atual.length - 1] : null;
        const continua = anterior && anterior.dossie?.continua_seguinte && linha.dossie?.continua_anterior
          && fhDiaSeguinte(anterior.data_evento) === linha.data_evento;
        if (continua) { atual.push(linha); return; }
        if (atual) saida.push(montar(atual));
        atual = [linha];
      });
      if (atual) saida.push(montar(atual));
    });
    return saida;
  }

  // A linha (dia ou rota) que está aberta no dossiê.
  function fhLinhaPorChave(chave) {
    return state.foraHorarioLinhas?.get(chave) || (state.foraHorario || []).find((item) => fhChave(item) === chave);
  }

  function fhRotuloDias(dos) {
    const dias = Array.isArray(dos.dias) ? dos.dias : null;
    if (dias && dias.length > 1) {
      const a = dias[0].data_evento;
      const b = dias[dias.length - 1].data_evento;
      return `rota de ${fhDiaSemana(a)}, ${formatDateBR(a)} a ${fhDiaSemana(b)}, ${formatDateBR(b)}`;
    }
    return `${fhDiaSemana(dos.data_evento)}, ${formatDateBR(dos.data_evento)}`;
  }

  // "05:30 às 20:00"; quando a janela termina depois da meia-noite: "22:00 às 05:57 (dia seguinte)".
  function fhJanelaTexto(d) {
    const fim = String(d.janela_fim || '');
    const dia = String(d.data_fim || d.data_evento || '').slice(0, 10);
    const seguinte = dia && fim.slice(0, 10) > dia;
    return `${fhHm(d.janela_inicio)} às ${fhHm(d.janela_fim)}${seguinte ? ' (dia seguinte)' : ''}`;
  }

  // As três frentes do dossiê do dia: fora do horário, trajetos sem justificativa e excesso de velocidade.
  function fhFlags(d) {
    if (!d) return null;
    return {
      fora: d.veredito === 'FORA_HORARIO',
      foraLeve: d.veredito === 'ATENCAO',
      indevido: d.veredito_uso === 'INDEVIDO',
      indevidoLeve: d.veredito_uso === 'ATENCAO',
      excessos: fhNum(d.qtd_excessos)
    };
  }

  function fhGravidade(d) {
    const f = fhFlags(d);
    if (!f) return 0;
    return (f.fora ? 100 : 0) + (f.foraLeve ? 30 : 0) + (f.indevido ? 80 : 0) + (f.indevidoLeve ? 25 : 0)
      + (f.excessos > 0 ? 20 + Math.min(f.excessos, 20) : 0) + (fhNum(d.excessos_fora) > 0 ? 15 : 0);
  }

  // Filtros da lista: ALERTAS = fora do horário, uso indevido ou excesso. Os casos leves ("para conferir") só aparecem em "Todos".
  function fhCategorias(row) {
    const f = fhFlags(row.dossie);
    if (!f) return ['SEM_DOSSIE'];
    const lista = [];
    if (f.fora || f.indevido || f.excessos > 0) lista.push('ALERTAS');
    if (f.fora) lista.push('FORA_HORARIO');
    if (f.indevido) lista.push('USO_INDEVIDO');
    if (f.excessos > 0) lista.push('EXCESSO');
    return lista;
  }

  // Agrupa as viagens fora do horário em "episódios" (trechos seguidos, com até 1 h entre eles).
  function fhEpisodios(d) {
    const lista = (d.resumo_dia || [])
      .filter((t) => Number(t.o) >= 0.3)
      .map((t) => ({ ini: Number.isFinite(Number(t.s)) ? Number(t.s) : Number(t.i), fim: Number(t.f), km: Number(t.o), x: t.x }))
      .sort((a, b) => a.ini - b.ini);
    const episodios = [];
    lista.forEach((t) => {
      const ultimo = episodios[episodios.length - 1];
      if (ultimo && t.ini - ultimo.fim <= 60) {
        ultimo.fim = Math.max(ultimo.fim, t.fim);
        ultimo.km += t.km;
        ultimo.tipos[t.x] = (ultimo.tipos[t.x] || 0) + t.km;
      } else {
        episodios.push({ ini: t.ini, fim: t.fim, km: t.km, tipos: { [t.x]: t.km } });
      }
    });
    const semJanela = !d.janela_inicio;
    return episodios.map((ep) => {
      let tipo;
      if (ep.tipos.C > 0) tipo = 'depois de chegar em casa';
      else if ((ep.tipos.A || 0) > (ep.tipos.P || 0)) tipo = 'antes do expediente';
      else tipo = semJanela ? (d.criterio === 'SEM_EMBARQUE' ? 'em dia sem embarque' : 'em dia sem expediente') : 'depois do expediente';
      const periodo = fhPeriodo(ep.ini);
      return { ...ep, rotulo: periodo ? `${periodo}, ${tipo}` : tipo };
    });
  }

  // Frases curtas do que houve no dia, da mais grave para a menos grave.
  function fhPartesManchete(d) {
    const partes = [];
    if (d.veredito !== 'DENTRO_HORARIO') {
      partes.push(fhNum(d.km_fora) >= 5 ? `${fhKm(d.km_fora)} km fora do horário de trabalho` : 'percurso ou retorno diferente do esperado');
    }
    if (d.veredito_uso && d.veredito_uso !== 'REGULAR' && fhNum(d.km_indevido) >= 5) {
      partes.push(`${fhKm(d.km_indevido)} km em trajetos sem justificativa`);
    }
    if (fhNum(d.qtd_excessos) > 0) {
      partes.push(`${fhNum(d.qtd_excessos)} excesso(s) de velocidade (máx. ${Math.round(fhNum(d.vel_max))} km/h)`);
    }
    return partes;
  }

  function fhManchete(d) {
    if (!d) return '';
    const partes = fhPartesManchete(d);
    if (!partes.length) return 'Uso dentro do horário de trabalho, sem alertas';
    const texto = partes.join(' · ');
    return texto.charAt(0).toUpperCase() + texto.slice(1);
  }

  // Três colunas fixas na lista: o que houve em cada frente (ou "—").
  function fhCelulasHtml(d) {
    const f = fhFlags(d);
    const celula = (rotulo, classe, texto, titulo) => `<div class="fh-cel${classe ? '' : ' vazio'}" data-rotulo="${rotulo}" title="${escapeHtml(titulo || '')}"><span class="fh-c ${classe || 'fh-c-vazio'}">${texto}</span></div>`;
    if (!f) return ['Fora do horário', 'Sem justificativa', 'Excessos'].map((r) => celula(r, '', '—')).join('');
    const km = fhNum(d.km_fora) >= 1 ? `${fhKm(d.km_fora)} km` : 'conferir';
    const fh = (f.fora || f.foraLeve)
      ? celula('Fora do horário', f.fora ? 'fh-c-fora' : 'fh-c-atencao', km, `Rodou ${fhKm(d.km_fora)} km fora do horário permitido`)
      : celula('Fora do horário', '', '—');
    const uso = (f.indevido || f.indevidoLeve)
      ? celula('Sem justificativa', f.indevido ? 'fh-c-sem' : 'fh-c-sem-leve', `${fhKm(d.km_indevido)} km`,
        d.uso_sem_base ? 'Sem O.S. programada nem registro de trabalho para comparar' : 'Trajetos que não chegam a O.S. programada, carona nem local de registro de trabalho')
      : celula('Sem justificativa', '', '—');
    const exc = f.excessos > 0
      ? celula('Excessos', 'fh-c-exc', `${f.excessos}× · ${Math.round(fhNum(d.vel_max))} km/h`, `${f.excessos} excesso(s) de velocidade, o maior de ${Math.round(fhNum(d.vel_max))} km/h`)
      : celula('Excessos', '', '—');
    return fh + uso + exc;
  }

  function fhContexto(d) {
    if (!d) return '';
    if (d.criterio === 'LIVRE') return 'Dia com embarque: uso liberado em qualquer horário.';
    if (d.criterio === 'SEM_EMBARQUE') return 'Dia sem embarque: uso do veículo não autorizado.';
    if (d.criterio === 'PADRAO') return 'Sem registro de trabalho neste dia.';
    let texto = `Trabalhou das ${fhHm(d.inicio_expediente)} às ${fhHm(d.fim_expediente)}`;
    if (d.chegada_casa) {
      texto += ` · chegou em casa às ${fhHm(d.chegada_casa)}`;
      if (Number(d.atraso_retorno_min) > 20) texto += ` (${fhDuracao(d.atraso_retorno_min)} depois do previsto)`;
    }
    return `${texto}.`;
  }

  // Status da linha quando ela é uma rota de vários dias: igual em todos os dias ou "parcial".
  function fhStatusRota(row) {
    const dias = row.rota?.dias || [row];
    const itens = dias.map((d) => ({ status: fhStatusCurto(d), aplica: fhAplicaNotificacao(d) }))
      .filter((item) => item.aplica.fora || item.aplica.excesso || item.status);
    if (!itens.length) return '';
    const todos = itens.map((item) => item.status);
    if (todos.every((status) => status && status === todos[0])) return todos[0];
    return todos.some(Boolean) ? 'Notificação parcial' : '';
  }

  // O dia tem algo a notificar em cada frente?
  function fhAplicaNotificacao(row) {
    const d = row?.dossie;
    const f = fhFlags(d);
    if (!f) return { fora: false, excesso: false };
    return {
      fora: d.veredito === 'FORA_HORARIO' || fhNum(d.km_fora) >= 5,
      excesso: f.excessos > 0
    };
  }

  // Só o que importa para o gestor: andamento da notificação única do dia e do Caixa. Em branco = ainda a notificar.
  function fhStatusCurto(row) {
    const statusNot = String(row.status_notificacao || '').toUpperCase();
    if (statusNot === 'JUSTIFICADA') return 'Justificada';
    const caixa = String(row.status_caixa || '').toUpperCase();
    if (caixa === 'LANCADO') return 'Caixa lançado';
    if (['PENDENTE', 'PROCESSANDO'].includes(caixa)) return 'Caixa pendente';
    const aplica = fhAplicaNotificacao(row);
    const foraOk = !row.semOcorrencia && statusNot === 'GERADA';
    const excOk = (fhNum(row.exc_gerados) + fhNum(row.exc_notificados)) > 0 && fhNum(row.exc_pendentes) === 0;
    if (aplica.fora && aplica.excesso) return foraOk && excOk ? 'Notificação gerada' : (foraOk || excOk ? 'Notificação parcial' : '');
    if (aplica.fora) return foraOk ? 'Notificação gerada' : '';
    if (aplica.excesso) return excOk ? (fhNum(row.exc_gerados) === 0 ? 'Excesso notificado' : 'Notificação gerada') : '';
    return statusNot === 'GERADA' ? 'Notificação gerada' : '';
  }

  function fhMaiorTrecho(d) {
    const episodios = d.veredito !== 'DENTRO_HORARIO' ? fhEpisodios(d) : [];
    if (!episodios.length) return '';
    const maior = episodios.slice().sort((a, b) => b.km - a.km)[0];
    return `Maior trecho: ${fhHoraMin(maior.ini)} às ${fhHoraMin(maior.fim)}`;
  }

  // Ações da ocorrência ficam dentro dos detalhes (a lista só mostra o essencial). Rota de vários dias: um bloco por dia.
  function fhRodapeDia(row, rotulo) {
    const aplica = fhAplicaNotificacao(row);
    // Excesso só entra na notificação enquanto houver registro PENDENTE/GERADA (os já arquivados por print ficam de fora).
    const excessoAberto = aplica.excesso && (fhNum(row.exc_pendentes) + fhNum(row.exc_gerados)) > 0;
    if (!row.dossie || (!aplica.fora && !excessoAberto)) return '';
    const temOcorrencia = !!row.id && aplica.fora;
    const km = Number(row.km_00_05 || 0);
    const valor = Number(row.valor_caixa || (km * Number(row.valor_km || 4)));
    const statusCaixa = String(row.status_caixa || '').toUpperCase();
    const disabledCaixa = String(row.status_notificacao || '').toUpperCase() === 'JUSTIFICADA' || ['PENDENTE', 'PROCESSANDO', 'LANCADO'].includes(statusCaixa);
    const disabledJustificar = ['PENDENTE', 'PROCESSANDO', 'LANCADO'].includes(statusCaixa);
    const status = fhStatusCurto(row);
    const inclui = [aplica.fora ? 'uso fora do horário' : '', excessoAberto ? 'excesso de velocidade' : ''].filter(Boolean).join(' + ');
    const caixaInfo = temOcorrencia && km > 0 ? `Caixa: ${formatKmForaHorario(km)} km entre 00h e 04h × R$ 4,00 = ${formatMoneyForaHorario(valor)}` : '';
    return `<div class="fh-rodape-dia">
      <div class="fh-m-rodape-info">${rotulo ? `<span class="fh-sub"><b>${escapeHtml(rotulo)}</b></span>` : ''}${status ? `<span class="fh-status">${escapeHtml(status)}</span>` : ''}<span class="fh-sub">Notificação única: ${escapeHtml(inclui)}</span>${caixaInfo ? `<span class="fh-sub">${escapeHtml(caixaInfo)}</span>` : ''}</div>
      <div class="fora-horario-actions">
        <button class="speed-btn speed-btn-primary speed-btn-compact" type="button" data-fh-notificar data-fh-data="${escapeHtml(row.data_evento)}">Gerar notificação</button>
        ${temOcorrencia ? `<button class="speed-btn speed-btn-soft speed-btn-compact" type="button" data-fora-action="JUSTIFICAR" data-id="${escapeHtml(row.id)}" ${disabledJustificar ? 'disabled' : ''}>Justificar</button>` : ''}
        ${temOcorrencia && km > 0 ? `<button class="speed-btn speed-btn-soft speed-btn-compact" type="button" data-fora-action="CAIXA" data-id="${escapeHtml(row.id)}" ${disabledCaixa ? 'disabled' : ''}>Enviar ao Caixa</button>` : ''}
      </div>
    </div>`;
  }

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

  function fhLinhaHtml(row) {
    const d = row.dossie;
    const f = fhFlags(d);
    const forte = !!f && (f.fora || f.indevido);
    const leve = !!f && !forte && (f.foraLeve || f.indevidoLeve || f.excessos > 0);
    const classe = !d ? '' : (forte ? 'fh-linha-fora' : (leve ? 'fh-linha-atencao' : 'fh-linha-dentro'));
    const status = row.rota ? fhStatusRota(row) : fhStatusCurto(row);
    const quem = escapeHtml(fhTitulo(row.motorista) || 'Colaborador não identificado');
    const caronas = Array.isArray(d?.caronas) ? d.caronas : [];
    const rotaRotulo = row.rota ? `rota de ${fhDataCurta(row.rota.dias[0].data_evento)} a ${fhDataCurta(row.rota.dias[row.rota.dias.length - 1].data_evento)}` : '';
    const detalhe = [onlyPlate(row.placa), rotaRotulo, d?.supervisao, caronas.length ? `carona: ${caronas.map(fhPrimeiroNome).join(', ')}` : '']
      .filter(Boolean).map(escapeHtml).join(' · ');
    return `<article class="fh-linha ${classe}">
      <div class="fh-l-quem"><strong>${quem}</strong><small>${detalhe}${status ? ` · <span class="fh-status">${escapeHtml(status)}</span>` : ''}</small></div>
      <div class="fh-cels">${fhCelulasHtml(d)}</div>
      <button class="speed-btn fh-btn-dossie speed-btn-compact" type="button" data-fh-dossie data-key="${escapeHtml(fhChave(row))}" ${d ? '' : 'disabled'}>Ver detalhes</button>
    </article>`;
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

  // ── Detalhes (modal) ───────────────────────────────────────────────────────

  // Barra única do dia (ou da rota, quando atravessa a meia-noite): faixa verde = horário permitido; viagens azuis, e só a parte que
  // passa da janela fica vermelha; tira roxa embaixo = trajeto sem justificativa; triângulos laranja embaixo = excessos.
  function fhBarraHtml(dos, det) {
    const dia = dos.data_evento;
    const multi = Array.isArray(dos.dias) && dos.dias.length > 1;
    const viagensDia = det.viagens || [];
    // Dia: eixo de 0h a 24h. Rota de vários dias: do começo do 1º trecho (1 h antes) ao fim do último (1 h depois).
    let eixoIni = 0;
    let eixoFim = 1440;
    if (multi) {
      const minutos = viagensDia.flatMap((v) => [fhMinutosDoDia(v.ini, dia), fhMinutosDoDia(v.fim, dia)]).filter((m) => m !== null);
      if (minutos.length) {
        eixoIni = Math.max(0, Math.floor((Math.min(...minutos) - 60) / 60) * 60);
        eixoFim = Math.ceil((Math.max(...minutos) + 60) / 60) * 60;
      }
    }
    const largura = Math.max(60, eixoFim - eixoIni);
    const pct = (min) => (Math.max(eixoIni, Math.min(eixoFim, Number(min) || 0)) - eixoIni) / largura * 100;
    const estilo = (ini, fim) => `left:${pct(ini).toFixed(2)}%;width:${Math.max(pct(fim) - pct(ini), 0.4).toFixed(2)}%`;
    const janelasDia = multi ? dos.dias : [dos];
    const janelas = janelasDia.map((d) => ({ ini: fhMinutosDoDia(d.janela_inicio, dia), fim: fhMinutosDoDia(d.janela_fim, dia), d }))
      .filter((j) => j.ini !== null && j.fim !== null);
    let blocos = '';
    let tiras = '';
    let temFora = false;
    viagensDia.forEach((v) => {
      const ini = fhMinutosDoDia(v.ini, dia);
      const fim = fhMinutosDoDia(v.fim, dia);
      if (ini === null || fim === null || Number(v.km) < 0.1) return;
      const jIni = fhMinutosDoDia(v._ji ?? dos.janela_inicio, dia);
      const jFim = fhMinutosDoDia(v._jf ?? dos.janela_fim, dia);
      const titulo = escapeHtml(`${fhHm(v.ini)} às ${fhHm(v.fim)} · ${fhKm(v.km)} km`);
      blocos += `<i class="fh-barra-bloco ok" style="${estilo(ini, fim)}" title="${titulo}"></i>`;
      // vermelho só nas viagens que o banco marcou como fora do horário (ida e volta ficam azuis), e só a parte que passa da janela
      if (fhNum(v.fora_km) < FH_FORA_MIN_KM) {
        // dentro do horário, na ida ou na volta
      } else if (jIni === null || jFim === null) {
        blocos += `<i class="fh-barra-bloco fora" style="${estilo(ini, fim)}" title="${titulo} · fora do horário"></i>`;
        temFora = true;
      } else {
        if (ini < jIni) { blocos += `<i class="fh-barra-bloco fora" style="${estilo(ini, Math.min(fim, jIni))}" title="${titulo} · fora do horário"></i>`; temFora = true; }
        if (fim > jFim) { blocos += `<i class="fh-barra-bloco fora" style="${estilo(Math.max(ini, jFim), fim)}" title="${titulo} · fora do horário"></i>`; temFora = true; }
      }
      if (v.uso === 'SEM_JUSTIFICATIVA') tiras += `<i class="fh-barra-sem" style="${estilo(ini, fim)}" title="${titulo} · sem justificativa"></i>`;
    });
    const excessos = (det.excessos || []).map((x) => {
      const min = fhMinutosDoDia(x.ts, dia);
      if (min === null || min < eixoIni || min > eixoFim) return '';
      const titulo = `${fhHm(x.ts)} · ${Math.round(fhNum(x.vel))} km/h${x.endereco ? ` · ${fhEnderecoCurto(x.endereco)}` : ''}`;
      return `<i class="fh-barra-exc" style="left:${pct(min).toFixed(2)}%" title="${escapeHtml(titulo)}"></i>`;
    }).join('');
    const janela = janelas.map((j) => `<i class="fh-barra-janela" style="${estilo(j.ini, j.fim)}" title="${escapeHtml(`Horário permitido: ${fhJanelaTexto(j.d)}`)}"></i>`).join('');
    // meia-noite entre os dias da rota
    let meiaNoite = '';
    for (let m = 1440; m < eixoFim; m += 1440) {
      if (m > eixoIni) meiaNoite += `<i class="fh-barra-div" style="left:${pct(m).toFixed(2)}%" title="Meia-noite"></i>`;
    }
    const passo = multi ? (largura <= 720 ? 60 : (largura <= 1440 ? 120 : 180)) : 180;
    let horas = '';
    for (let m = Math.ceil(eixoIni / passo) * passo; m <= eixoFim; m += passo) {
      const rotulo = !multi && m === 1440 ? '24h' : `${String(Math.floor((((m % 1440) + 1440) % 1440) / 60)).padStart(2, '0')}h`;
      horas += `<span class="fh-barra-hora" style="left:${pct(m).toFixed(2)}%">${rotulo}</span>`;
    }
    return `<div class="fh-barra">
      <div class="fh-barra-trilho">${janela}${meiaNoite}${blocos}${tiras}</div>
      ${excessos ? `<div class="fh-barra-excs">${excessos}</div>` : ''}
      <div class="fh-barra-escala">${horas}</div>
    </div>
    <div class="fh-legenda-barra">
      ${janela ? '<span><i class="fh-lb fh-lb-janela"></i>Horário permitido</span>' : ''}
      <span><i class="fh-lb fh-lb-ok"></i>Percurso</span>
      ${temFora ? '<span><i class="fh-lb fh-lb-fora"></i>Fora do horário</span>' : ''}
      ${tiras ? '<span><i class="fh-lb fh-lb-sem"></i>Sem justificativa</span>' : ''}
      ${excessos ? '<span><i class="fh-lb fh-lb-exc"></i>Excesso de velocidade</span>' : ''}
      ${meiaNoite ? '<span><i class="fh-lb fh-lb-meia"></i>Meia-noite</span>' : ''}
    </div>`;
  }

  function fhSituacaoViagem(v, semJanela, rotuloSemJanela = 'em dia sem expediente') {
    const periodo = fhPeriodo(fhMinutosDoDia(v.fora_ini || v.ini, String(v.ini || '').slice(0, 10)) ?? 600);
    const prefixo = periodo ? `${periodo}, ` : '';
    if (v.fase === 'APOS_CHEGADA_EM_CASA') return `${prefixo}depois de chegar em casa`;
    if (v.fase === 'ANTES_EXPEDIENTE') return `${prefixo}antes do expediente`;
    if (v.fase === 'APOS_EXPEDIENTE') return `${prefixo}${semJanela ? rotuloSemJanela : 'depois do expediente'}`;
    return 'fora do horário';
  }

  function fhViagemLinhaHtml(v, dos, excessos = []) {
    const fora = Number(v.fora_km) >= FH_FORA_MIN_KM;
    const sem = v.uso === 'SEM_JUSTIFICATIVA';
    const parado = Number(v.km) < 0.1;
    const minutos = (fhMinutosDoDia(v.fim, dos.data_evento) ?? 0) - (fhMinutosDoDia(v.ini, dos.data_evento) ?? 0);
    const trajeto = fhLinkTrajeto(v);
    const curto = (texto) => `<span title="${escapeHtml(texto || '')}">${escapeHtml(fhEnderecoCurto(texto) || '—')}</span>`;
    const percurso = parado
      ? `<span class="fh-muted">Parado com o motor ligado em</span> ${curto(v.de)}`
      : `${curto(v.de)} <span class="fh-muted">→</span> ${curto(v.para)}${trajeto ? ` · <a href="${escapeHtml(trajeto)}" target="_blank" rel="noopener noreferrer">trajeto</a>` : ''}`;
    const marcas = [];
    if (fora) marcas.push(`<span class="fh-fase fora">${escapeHtml(fhSituacaoViagem(v, !(v._ji ?? dos.janela_inicio), (v._criterio ?? dos.criterio) === 'SEM_EMBARQUE' ? 'em dia sem embarque' : 'em dia sem expediente'))}</span>`);
    if (sem) marcas.push('<span class="fh-fase sem">sem justificativa</span>');
    if (excessos.length) {
      const vmax = Math.max(...excessos.map((x) => fhNum(x.vel)));
      marcas.push(`<span class="fh-fase exc">${excessos.length}× · até ${Math.round(vmax)} km/h</span>`);
    }
    const motivoUso = !sem && !parado && FH_USOS[v.uso] ? FH_USOS[v.uso] : '';
    const situacao = marcas.length
      ? `<div class="fh-chips-cel">${marcas.join('')}</div>${motivoUso ? `<div class="fh-sub">${escapeHtml(motivoUso)}</div>` : ''}`
      : `<span class="fh-muted">${escapeHtml(motivoUso || 'dentro do horário')}</span>`;
    const km = parado ? '—' : `${fhKm(v.km)} km${fora && Number(v.fora_km) + 0.05 < Number(v.km) ? `<div class="fh-sub">${fhKm(v.fora_km)} km fora</div>` : ''}`;
    return `<tr class="fh-clicavel ${fora ? 'fh-linha-fora' : (sem ? 'fh-linha-sem' : '')}" data-fh-foco-ini="${escapeHtml(v.ini)}" data-fh-foco-fim="${escapeHtml(v.fim)}" title="Ver este trajeto no mapa">
      <td><strong>${fhHm(v.ini)} às ${fhHm(v.fim)}</strong><div class="fh-sub">${fhDuracao(minutos)}</div></td>
      <td>${percurso}</td>
      <td>${km}</td>
      <td>${situacao}</td>
    </tr>`;
  }

  // Trajetos com alerta (fora do horário, sem justificativa ou com excesso), em ordem de horário.
  function fhTrajetosAlerta(det) {
    const excPorViagem = new Map();
    (det.excessos || []).forEach((x) => {
      if (x.viagem === null || x.viagem === undefined) return;
      excPorViagem.set(Number(x.viagem), [...(excPorViagem.get(Number(x.viagem)) || []), x]);
    });
    const viagens = (det.viagens || []).map((v, i) => ({ ...v, _i: i }))
      .sort((a, b) => String(a.ini).localeCompare(String(b.ini)));
    const comAlerta = viagens.filter((v) => Number(v.fora_km) >= FH_FORA_MIN_KM || v.uso === 'SEM_JUSTIFICATIVA' || excPorViagem.has(v._i));
    return { viagens, comAlerta, excPorViagem };
  }

  function fhPercursosHtml(dos, det) {
    const { viagens, comAlerta, excPorViagem } = fhTrajetosAlerta(det);
    if (!viagens.length) return '<div class="speed-import-empty">Sem viagens no dia.</div>';
    const cabecalho = '<thead><tr><th>Horário</th><th>Percurso</th><th>Distância</th><th>Situação</th></tr></thead>';
    const linha = (v) => fhViagemLinhaHtml(v, dos, excPorViagem.get(v._i) || []);
    const resumo = comAlerta.length
      ? `<table class="hist-table fh-tl">${cabecalho}<tbody>${comAlerta.map(linha).join('')}</tbody></table>`
      : '<div class="speed-import-empty">Nenhum trajeto com alerta neste dia.</div>';
    const demais = viagens.length - comAlerta.length;
    return `<div class="fh-percursos" data-fh-percursos data-modo="resumo" data-demais="${demais}">
      <div class="hist-table-wrap fh-tl-wrap fh-tl-resumo">${resumo}</div>
      <div class="hist-table-wrap fh-tl-wrap fh-tl-completo"><table class="hist-table fh-tl">${cabecalho}<tbody>${viagens.map(linha).join('')}</tbody></table></div>
      ${demais > 0 ? `<button type="button" class="fora-horario-link-btn fh-alternar" data-fh-alternar-viagens>Mostrar também os ${demais} trajeto(s) sem alerta</button>` : ''}
    </div>`;
  }

  // Excessos de velocidade do dia (lista do rastreador) com a situação de cada um no dossiê.
  function fhExcessosHtml(dos, det) {
    const lista = (det.excessos || []).slice().sort((a, b) => String(a.ts).localeCompare(String(b.ts)));
    if (!lista.length) return '<div class="speed-import-empty">Nenhum excesso de velocidade neste dia.</div>';
    const linhas = lista.map((x) => {
      const mapa = fhLinkPonto(x.la, x.lo);
      const situacao = [];
      if (x.fora) situacao.push('<span class="fh-fase fora">fora do horário</span>');
      if (x.indevido) situacao.push('<span class="fh-fase sem">sem justificativa</span>');
      const status = String(x.status || '').toUpperCase();
      return `<tr${finito(x.la) && finito(x.lo) ? ` class="fh-clicavel" data-fh-foco-ponto="${Number(x.la)},${Number(x.lo)}" title="Ver este excesso no mapa"` : ''}>
        <td><strong>${escapeHtml(String(x.ts || '').slice(11, 16) || '--:--')}</strong></td>
        <td><span class="fh-fase exc">${Math.round(fhNum(x.vel))} km/h</span></td>
        <td><span title="${escapeHtml(x.endereco || '')}">${escapeHtml(fhEnderecoCurto(x.endereco) || '—')}</span>${mapa ? ` · <a href="${escapeHtml(mapa)}" target="_blank" rel="noopener noreferrer">mapa</a>` : ''}</td>
        <td>${situacao.length ? `<div class="fh-chips-cel">${situacao.join('')}</div>` : '<span class="fh-muted">—</span>'}</td>
        <td><span class="fh-muted">${escapeHtml(FH_STATUS_EXCESSO[status] || x.status || '—')}</span></td>
      </tr>`;
    }).join('');
    return `<div class="hist-table-wrap fh-tl-wrap"><table class="hist-table fh-tl fh-tl-exc"><thead><tr><th>Hora</th><th>Velocidade</th><th>Local</th><th>Situação</th><th>Notificação</th></tr></thead><tbody>${linhas}</tbody></table></div>`;
  }

  function fhRegistrosHtml(dos, det) {
    const itens = (det.evidencias || []).slice().sort((a, b) => String(a.ts).localeCompare(String(b.ts)));
    if (!itens.length) return '<div class="speed-import-empty">Nenhum registro de trabalho neste dia.</div>';
    const linhas = itens.map((e) => {
      const partes = [];
      if (e.os) partes.push(`O.S. ${escapeHtml(e.os)}`);
      if (e.local && e.tipo !== 'CARONA') partes.push(escapeHtml(e.local));
      if (e.cargas) partes.push(`${escapeHtml(e.cargas)} carga(s)`);
      const ponto = ['CELULAR', 'OS_PROGRAMADA', 'CARONA'].includes(e.tipo) ? fhLinkPonto(e.la, e.lo) : '';
      if (ponto) partes.push(`<a href="${escapeHtml(ponto)}" target="_blank" rel="noopener noreferrer">ver no mapa</a>`);
      return `<tr class="${e.em_casa ? 'fh-linha-casa' : ''}">
        <td><strong>${fhHm(e.ts)}</strong></td>
        <td>${escapeHtml(fhEvidenciaRotulo(e))}</td>
        <td>${partes.join(' · ') || '<span class="fh-muted">—</span>'}</td>
        <td>${e.em_casa ? '<span class="fh-fase neutra">feito em casa: não conta</span>' : '<span class="fh-fase info">conta como trabalho</span>'}</td>
      </tr>`;
    }).join('');
    return `<div class="hist-table-wrap fh-tl-wrap"><table class="hist-table fh-tl"><thead><tr><th>Horário</th><th>O que foi</th><th>Detalhe</th><th>Conta?</th></tr></thead><tbody>${linhas}</tbody></table></div>`;
  }

  function fhResumoTexto(dos) {
    const det = dos.detalhes || {};
    const v = FH_VEREDITOS[dos.veredito];
    const linhas = [
      'DOSSIÊ DIÁRIO DO VEÍCULO (USO FORA DO HORÁRIO, TRAJETOS SEM JUSTIFICATIVA E EXCESSO DE VELOCIDADE)',
      `${dos.motorista || 'Colaborador não identificado'} · placa ${dos.placa} · ${fhRotuloDias(dos)}`,
      `Resultado: ${v?.rotulo || dos.veredito}. ${fhManchete(dos)}.`,
      fhContexto(dos),
      dos.janela_inicio
        ? `Horário permitido para usar o veículo: ${fhJanelaTexto(dos)} (inclui ida/volta e ${dos.tolerancia_min} min de folga).`
        : 'Dia sem expediente registrado: qualquer uso conta como fora do horário.',
      `No dia o veículo rodou ${fhKm(dos.km_dia)} km; fora do horário: ${fhKm(dos.km_fora)} km em ${fhDuracao(dos.min_fora)}; sem justificativa: ${fhKm(dos.km_indevido)} km.`
    ];
    const progTxt = det.programacao || {};
    if (progTxt.condutores || (progTxt.caronas || []).length) {
      linhas.push(`Programação do dia: ${progTxt.condutores ? `condutor escalado ${progTxt.condutores}` : 'sem condutor escalado'}${(progTxt.caronas || []).length ? `; carona para ${progTxt.caronas.join(', ')}` : ''}.`);
    }
    if ((dos.motivos || []).length) {
      linhas.push('', 'O que chama atenção:');
      dos.motivos.forEach((motivo) => linhas.push(`- ${motivo}`));
    }
    const fora = (det.viagens || []).filter((item) => Number(item.fora_km) >= 0.3);
    if (fora.length) {
      linhas.push('', 'Viagens fora do horário:');
      fora.forEach((item) => linhas.push(`- ${fhHm(item.ini)} às ${fhHm(item.fim)} · ${fhKm(item.km)} km · ${item.de || '—'} → ${item.para || '—'}`));
    }
    const sem = (det.viagens || []).filter((item) => item.uso === 'SEM_JUSTIFICATIVA');
    if (sem.length) {
      linhas.push('', 'Trajetos sem O.S. programada, carona nem registro de trabalho:');
      sem.forEach((item) => linhas.push(`- ${fhHm(item.ini)} às ${fhHm(item.fim)} · ${fhKm(item.km)} km · ${item.de || '—'} → ${item.para || '—'}`));
    }
    if ((det.excessos || []).length) {
      linhas.push('', 'Excessos de velocidade:');
      det.excessos.forEach((x) => linhas.push(`- ${String(x.ts || '').slice(11, 19)} · ${Math.round(fhNum(x.vel))} km/h · ${x.endereco || '—'}${x.fora ? ' · fora do horário' : ''}${x.indevido ? ' · trajeto sem justificativa' : ''}`));
    }
    return linhas.join('\n');
  }

  // Junta os dossiês dos dias de uma mesma rota num só (viagens, registros e excessos em ordem; cada viagem leva a janela do seu dia).
  function fhMesclarDossies(lista) {
    const primeiro = lista[0];
    const ultimo = lista[lista.length - 1];
    const viagens = [];
    const evidencias = [];
    const excessos = [];
    const resumo = [];
    const os = [];
    lista.forEach((d, k) => {
      const det = d.detalhes || {};
      const deslocamento = viagens.length;
      (det.viagens || []).forEach((v) => viagens.push({ ...v, _ji: d.janela_inicio, _jf: d.janela_fim, _criterio: d.criterio }));
      (det.evidencias || []).forEach((e) => evidencias.push(e));
      (det.excessos || []).forEach((x) => excessos.push({ ...x, viagem: x.viagem === null || x.viagem === undefined ? x.viagem : Number(x.viagem) + deslocamento }));
      (d.resumo_dia || []).forEach((r) => resumo.push({ ...r, i: Number(r.i) + 1440 * k, f: Number(r.f) + 1440 * k, s: r.s === null || r.s === undefined ? r.s : Number(r.s) + 1440 * k }));
      ((det.programacao || {}).os || []).forEach((item) => os.push(item));
    });
    const resumido = fhResumirDossies(lista);
    return {
      ...resumido,
      dias: lista,
      data_evento: primeiro.data_evento,
      data_fim: ultimo.data_evento,
      janela_inicio: primeiro.janela_inicio,
      janela_fim: ultimo.janela_fim,
      inicio_expediente: primeiro.inicio_expediente,
      fim_expediente: ultimo.fim_expediente,
      resumo_dia: resumo,
      detalhes: {
        ...(primeiro.detalhes || {}),
        programacao: { ...((primeiro.detalhes || {}).programacao || {}), os },
        casa_noite: (ultimo.detalhes || {}).casa_noite,
        viagens,
        evidencias,
        excessos,
        dia_especial: null,
        uso: {
          km_indevido: resumido.km_indevido,
          viagens_indevidas: resumido.viagens_indevidas,
          sem_base: resumido.uso_sem_base,
          locais: lista.reduce((t, d) => t + fhNum(((d.detalhes || {}).uso || {}).locais), 0)
        }
      }
    };
  }

  // Três cartões: o que houve em cada frente. Clicar leva à aba com os detalhes.
  function fhCartoesHtml(dos, det, semViagens) {
    const f = fhFlags(dos);
    const especial = fhDiaEspecial(dos);
    const excessos = det.excessos || [];
    const maior = excessos.slice().sort((a, b) => fhNum(b.vel) - fhNum(a.vel))[0];
    const cartao = (rotulo, classe, valor, detalhe, aba) => `<${aba ? 'button type="button"' : 'div'} class="fh-tile ${classe}"${aba ? ` data-fh-ir-aba="${aba}"` : ''}>
      <span class="fh-tile-rot">${rotulo}</span><b>${valor}</b><small>${escapeHtml(detalhe)}</small></${aba ? 'button' : 'div'}>`;
    const nada = 'fh-tile-nada';

    let fh;
    if (semViagens) fh = cartao('Fora do horário', nada, 'Sem dados', 'O veículo não está no relatório de viagens', '');
    else if (f.fora || f.foraLeve) {
      fh = cartao('Fora do horário', f.fora ? 'fh-tile-fora' : 'fh-tile-atencao', fhNum(dos.km_fora) >= 1 ? `${fhKm(dos.km_fora)} km` : 'Conferir',
        fhNum(dos.km_fora) >= 1 ? (especial && !especial.embarque ? `${fhMaiusc(fhDiaEspecialRotulo(especial))} sem embarque` : (fhMaiorTrecho(dos) || 'Percurso ou retorno diferente do esperado'))
          : (fhNum(dos.atraso_retorno_min) > 60 ? `Chegou em casa ${fhDuracao(dos.atraso_retorno_min)} depois do previsto` : (fhMaiorTrecho(dos) || 'Percurso ou retorno diferente do esperado')),
        'trajetos');
    } else {
      fh = cartao('Fora do horário', nada, 'Nada',
        especial ? `${fhMaiusc(fhDiaEspecialRotulo(especial))} ${especial.embarque ? 'com embarque: horário livre' : 'sem embarque'}`
          : (dos.janela_inicio ? `Horário permitido ${fhJanelaTexto(dos)}` : 'Dentro do horário'), '');
    }

    let uso;
    if (semViagens) uso = cartao('Sem justificativa', nada, 'Sem dados', 'Sem viagens para comparar', '');
    else if (f.indevido || f.indevidoLeve) {
      const detalhe = (dos.uso_sem_base || (det.uso || {}).sem_base)
        ? 'Sem O.S. nem registro para comparar'
        : `${fhNum(dos.viagens_indevidas)} ${fhNum(dos.viagens_indevidas) === 1 ? 'trajeto' : 'trajetos'} sem O.S., carona ou registro`;
      uso = cartao(f.indevido ? 'Uso indevido' : 'Sem justificativa', f.indevido ? 'fh-tile-sem' : 'fh-tile-sem-leve', `${fhKm(dos.km_indevido)} km`, detalhe, 'trajetos');
    } else {
      uso = cartao('Sem justificativa', nada, 'Nada', fhNum(dos.km_indevido) > 0 ? `${fhKm(dos.km_indevido)} km sem justificativa, abaixo do limite de 15 km` : 'Todos os trajetos se justificam', fhNum(dos.km_indevido) > 0 ? 'trajetos' : '');
    }

    const exc = f.excessos > 0
      ? cartao('Excesso de velocidade', 'fh-tile-exc', `${f.excessos} registro(s)`,
        `Máx. ${Math.round(fhNum(dos.vel_max))} km/h${maior ? ` às ${fhHm(maior.ts)}` : ''}${fhNum(dos.excessos_fora) > 0 ? ` · ${fhNum(dos.excessos_fora)} fora do horário` : ''}`, 'excessos')
      : cartao('Excesso de velocidade', nada, 'Nada', 'Nenhum registro no dia', '');
    return `<div class="fh-tiles">${fh}${uso}${exc}</div>`;
  }

  // Passo a passo de UM dia (na rota de vários dias aparece um bloco por dia).
  function fhPassosDoDia(dos) {
    const det = dos.detalhes || {};
    const padrao = dos.criterio === 'PADRAO';
    const especial = fhDiaEspecial(dos);
    const rotuloEspecial = especial ? fhMaiusc(fhDiaEspecialRotulo(especial)) : '';
    const semJanela = !dos.janela_inicio;
    const semViagens = fhNum(dos.viagens_dia) === 0 && fhNum(dos.km_dia) === 0;
    const registros = (det.evidencias || []).filter((e) => !e.em_casa).length;

    const passos = [];
    const prog = det.programacao || {};
    const grupos = fhAgruparOs(prog);
    const logistica = (prog.logistica || []).map(fhTitulo);
    const passagens = (det.evidencias || []).filter((e) => (e.tipo === 'OS_PROGRAMADA' || e.tipo === 'CARONA') && !e.em_casa).length;
    if (prog.condutores || (prog.caronas || []).length || grupos.length || logistica.length) {
      const partes = [];
      if (prog.condutores) {
        partes.push(`Condutor escalado: ${fhTitulo(prog.condutores)}${logistica.length ? ' (logística / carona frota)' : ''}${prog.divergente ? ', diferente do motorista cadastrado do veículo' : ''}.`);
      }
      if ((prog.caronas || []).length) partes.push(`Carona para: ${prog.caronas.map(fhTitulo).join(', ')}.`);
      if (grupos.length) {
        partes.push(`O.S. escalada: ${grupos.map((g) => `${g.os}${g.local ? ` (${g.local})` : ''}: ${g.papeis.join('; ')}${finito(g.la) && finito(g.lo) ? '' : ' (sem coordenada cadastrada)'}`).join(' | ')}.`);
        partes.push(passagens
          ? `A rota do veículo passou ${passagens} vez(es) pelo local de uma O.S. escalada ou pela casa do colega de carona, o que conta como trabalho.`
          : 'A rota do veículo não passou perto do local da O.S. escalada nem da casa do colega de carona.');
      } else {
        partes.push('A Programação não vincula nenhuma O.S. às pessoas deste veículo neste dia.');
      }
      passos.push({ titulo: 'Programação do dia', texto: partes.join(' ') });
    } else {
      passos.push({ titulo: 'Programação do dia', texto: 'Não há condutor, logística, carona nem O.S. escalada para esta placa na Programação deste dia.' });
    }
    passos.push({
      titulo: 'Trabalho registrado',
      texto: padrao
        ? 'Neste dia não há informativo, produção nem sinal do celular fora de casa.'
        : `Das ${fhHm(dos.inicio_expediente)} às ${fhHm(dos.fim_expediente)}, com ${registros} registro(s): ${fhFonteRotulo(dos.fonte_expediente)}.${dos.primeiro_informativo ? ` Informativos no Mapa de Embarque: ${Number(dos.qtd_informativos) || 0}, do primeiro às ${fhHm(dos.primeiro_informativo)} ao último às ${fhHm(dos.ultimo_informativo)}.` : ''}`
    });
    passos.push({
      titulo: 'Horário permitido para usar o veículo',
      texto: especial
        ? (especial.embarque
          ? `${rotuloEspecial} com embarque: o uso do veículo é autorizado em qualquer horário.`
          : `${rotuloEspecial} sem embarque: nesses dias só é autorizado rodar quando há embarque (informativo, produção ou O.S. escalada), então nenhum uso é autorizado.`)
        : semJanela
        ? 'Dia sem expediente registrado (domingo): qualquer uso conta como fora do horário.'
        : `Das ${fhJanelaTexto(dos)}.${padrao ? ' Como não há registros, vale o horário padrão.' : ` Inclui o tempo estimado de ida (${fhDuracao(det.t_ida_min)}) e de volta (${fhDuracao(det.t_volta_min)}) entre a casa e o trabalho, mais ${Number(dos.tolerancia_min) || 20} min de folga.`}${dos.criterio === 'AMPLIADO' ? ' Como há poucos registros, foi ampliado para 05:30 às 20:00 para evitar falso alarme.' : ''}`
    });
    if (dos.chegada_casa) {
      const atraso = Number(dos.atraso_retorno_min);
      passos.push({
        titulo: 'Chegada em casa',
        texto: `O veículo chegou às ${fhHm(dos.chegada_casa)}; o previsto era ${fhHm(dos.retorno_previsto)}${Number.isFinite(atraso) ? (atraso > 0 ? ` (${fhDuracao(atraso)} depois)` : ' (dentro do previsto)') : ''}.`
      });
    }

    const usoDia = det.uso || {};
    const excDia = det.excessos || [];
    if (semViagens) passos.length = 0;
    if (!semViagens) passos.push({
      titulo: 'Trajetos sem justificativa',
      texto: (dos.uso_sem_base || usoDia.sem_base)
        ? 'Neste dia não há O.S. programada com localização, carona nem registro de trabalho feito longe de casa: o percurso não tem com o que ser comparado.'
        : `Cada viagem foi comparada com ${Number(usoDia.locais) || 0} local(is) conhecido(s) do dia: O.S. programada (a menos de 3 km), casa de colega de carona, onde houve registro de trabalho, posto ou oficina. ${fhNum(dos.km_indevido) > 0 ? `${fhKm(dos.km_indevido)} km em ${fhNum(dos.viagens_indevidas)} trajeto(s) não chegaram a nenhum deles e passaram do trajeto direto.` : 'Todos os trajetos chegaram a um deles ou estavam no caminho.'}`
    });
    if (excDia.length) {
      passos.push({
        titulo: 'Excessos de velocidade',
        texto: `${excDia.length} registro(s) do rastreador no dia (limite de 120 km/h); o maior foi de ${Math.round(fhNum(dos.vel_max))} km/h. ${fhNum(dos.excessos_fora) > 0 ? `${fhNum(dos.excessos_fora)} aconteceram fora do horário permitido.` : 'Todos aconteceram dentro do horário permitido.'}`
      });
    }
    return passos;
  }

  // Frase de fatos de UM dia.
  function fhContextoDoDia(dos) {
    const det = dos.detalhes || {};
    const padrao = dos.criterio === 'PADRAO';
    const especial = fhDiaEspecial(dos);
    const rotuloEspecial = especial ? fhMaiusc(fhDiaEspecialRotulo(especial)) : '';
    const semJanela = !dos.janela_inicio;
    const semViagens = fhNum(dos.viagens_dia) === 0 && fhNum(dos.km_dia) === 0;
    const registros = (det.evidencias || []).filter((e) => !e.em_casa).length;

    const contexto = semViagens ? 'O veículo não aparece no relatório de viagens da BFleet neste dia' : especial ? [
      `${rotuloEspecial} ${especial.embarque ? 'com embarque: uso liberado em qualquer horário' : 'sem embarque: uso não autorizado'}`,
      dos.chegada_casa ? `chegou em casa às ${fhHm(dos.chegada_casa)}` : ''
    ].filter(Boolean).join(' · ') : [
      padrao ? 'Sem registro de trabalho neste dia' : `Trabalhou das ${fhHm(dos.inicio_expediente)} às ${fhHm(dos.fim_expediente)}`,
      semJanela ? 'dia sem expediente' : `horário permitido ${fhJanelaTexto(dos)}`,
      dos.chegada_casa ? `chegou em casa às ${fhHm(dos.chegada_casa)}${fhNum(dos.atraso_retorno_min) > 20 ? ` (${fhDuracao(dos.atraso_retorno_min)} depois do previsto)` : ''}` : ''
    ].filter(Boolean).join(' · ');
    return contexto;
  }

  function renderDossieHtml(dos, row) {
    const det = dos.detalhes || {};
    const info = FH_VEREDITOS[dos.veredito] || { rotulo: dos.veredito, cls: 'fh-badge-nd' };
    const padrao = dos.criterio === 'PADRAO';
    const especial = fhDiaEspecial(dos);
    const rotuloEspecial = especial ? fhMaiusc(fhDiaEspecialRotulo(especial)) : '';
    const semJanela = !dos.janela_inicio;
    const semViagens = fhNum(dos.viagens_dia) === 0 && fhNum(dos.km_dia) === 0;
    const registros = (det.evidencias || []).filter((e) => !e.em_casa).length;

    const usoDia = det.uso || {};
    const excDia = det.excessos || [];

    const motivos = (dos.motivos || []).length
      ? `<ul class="fh-motivos">${dos.motivos.map((m) => `<li>${escapeHtml(m)}</li>`).join('')}</ul>`
      : '<p class="speed-hint">Nada fora do normal neste dia.</p>';
    const avisos = [];
    if (dos.criterio === 'AMPLIADO') avisos.push('Poucos registros de trabalho neste dia: o resultado pode ser falso alarme, vale conferir com o colaborador.');
    if (dos.veredito_uso && dos.veredito_uso !== 'REGULAR' && (dos.uso_sem_base || usoDia.sem_base)) {
      avisos.push('Neste dia não há O.S. programada com localização, carona nem registro de trabalho: não há com o que comparar o percurso, vale conferir com o colaborador.');
    } else if (dos.veredito_uso === 'INDEVIDO') {
      avisos.push('Trajetos sem justificativa podem ser falso alarme quando a O.S. está cadastrada longe do ponto real. Confira no mapa ao lado.');
    } else if (dos.veredito_uso === 'ATENCAO' && padrao) {
      avisos.push('Sem registro de trabalho neste dia, a falta de justificativa pode ser só falta de registro: confira no mapa se o veículo passou perto da O.S. programada.');
    }
    const aviso = avisos.map((texto) => `<p class="fh-nota">${escapeHtml(texto)}</p>`).join('');

    const multi = Array.isArray(dos.dias) && dos.dias.length > 1;
    const contextos = multi
      ? dos.dias.map((d) => `${fhDiaSemana(d.data_evento)}, ${fhDataCurta(d.data_evento)}: ${fhContextoDoDia(d)}`)
      : [fhContextoDoDia(dos)];
    const passosHtml = (lista) => `<div class="fh-passos">${lista.map((p) => `<div class="fh-passo"><b>${escapeHtml(p.titulo)}</b><span>${escapeHtml(p.texto)}</span></div>`).join('')}</div>`;
    const passosTodos = multi
      ? dos.dias.map((d) => `<h4 class="fh-h4">${escapeHtml(fhDiaSemana(d.data_evento))}, ${escapeHtml(formatDateBR(d.data_evento))}</h4>${passosHtml(fhPassosDoDia(d))}`).join('')
      : passosHtml(fhPassosDoDia(dos));

    const casaManha = det.casa_manha || {};
    const casaNoite = det.casa_noite || {};
    const linkCasa = fhLinkPonto(casaManha.lat, casaManha.lng);
    const pernoite = `<p class="speed-hint">Considerado como "casa" o lugar onde o veículo dormiu: ${escapeHtml(casaManha.endereco || '—')}${linkCasa ? ` · <a href="${escapeHtml(linkCasa)}" target="_blank" rel="noopener noreferrer">ver no mapa</a>` : ''}${casaNoite.endereco && casaNoite.endereco !== casaManha.endereco ? `<br>O veículo terminou o dia em: ${escapeHtml(casaNoite.endereco)}` : ''}</p>`;
    const temPontosRota = !!row?.tem_rota_caixa;
    const rotaCaixa = row?.id && temPontosRota
      ? `<p class="speed-hint">Pontos de GPS usados na quilometragem do Caixa (00h às 04h): <button type="button" class="fora-horario-link-btn" data-ver-rota data-id="${escapeHtml(row.id)}">ver pontos</button></p>`
      : '';

    const trajetosAlerta = fhTrajetosAlerta(det).comAlerta.length;
    const abas = [
      { chave: 'resumo', rotulo: 'Linha do tempo' },
      { chave: 'trajetos', rotulo: 'Trajetos', n: trajetosAlerta },
      ...(excDia.length ? [{ chave: 'excessos', rotulo: 'Excessos', n: excDia.length }] : []),
      { chave: 'metodo', rotulo: 'Como foi calculado' }
    ];
    const abasHtml = abas.map((aba, i) => `<button type="button" role="tab" class="fh-aba${i === 0 ? ' active' : ''}" data-fh-aba="${aba.chave}" aria-selected="${i === 0}">${aba.rotulo}${aba.n ? ` <b>${aba.n}</b>` : ''}</button>`).join('');

    return `
      <p class="fh-m-sub">${escapeHtml(fhRotuloDias(dos))}${(dos.supervisao || dos.coordenacao) ? ` · ${escapeHtml(dos.supervisao || dos.coordenacao)}` : ''}</p>
      ${fhCartoesHtml(dos, det, semViagens)}
      <div class="fh-abas" role="tablist">${abasHtml}</div>
      <div class="fh-painel" data-fh-pane="resumo">
        ${semViagens ? '' : fhBarraHtml(dos, det)}
        ${contextos.map((texto) => `<p class="fh-fatos">${escapeHtml(texto)}</p>`).join('')}
        ${aviso}
      </div>
      <div class="fh-painel" data-fh-pane="trajetos" hidden>${fhPercursosHtml(dos, det)}</div>
      ${excDia.length ? `<div class="fh-painel" data-fh-pane="excessos" hidden>${fhExcessosHtml(dos, det)}</div>` : ''}
      <div class="fh-painel" data-fh-pane="metodo" hidden>
        <h4 class="fh-h4">O que chama atenção, em frases</h4>
        ${motivos}
        <h4 class="fh-h4">Passo a passo</h4>
        ${passosTodos}
        ${pernoite}${rotaCaixa}
        <details class="fh-metodo fh-interno"><summary>Registros de trabalho usados (${(det.evidencias || []).length})</summary>${fhRegistrosHtml(dos, det)}</details>
        <details class="fh-metodo fh-interno"><summary>Regras do cálculo</summary>
          <ul>
            <li><strong>Trabalho registrado:</strong> informativos do colaborador no Mapa de Embarque, check-in e check-out da produção diária e sinais de GPS do celular (app GRM). O que foi registrado em casa não conta.</li>
            <li><strong>Horário permitido:</strong> do primeiro registro (menos o tempo de ida) até o último registro (mais o tempo de volta), com ${Number(dos.tolerancia_min) || 20} min de folga. O tempo de ida e de volta é estimado pela distância em linha reta entre a casa e o local × ${escapeHtml(det.fator_rota ?? 1.4)} ÷ ${escapeHtml(det.vel_media_kmh ?? 60)} km/h.</li>
            <li><strong>Programação do dia:</strong> se o condutor ou um colega de carona estiver escalado em uma O.S., a chegada ou a saída do veículo a menos de 2 km do local dessa O.S. conta como trabalho; o mesmo vale para uma parada a menos de 1,5 km da casa cadastrada do colega de carona.</li>
            <li><strong>Domingo e feriado:</strong> só é autorizado rodar com embarque (informativo ou check-in/out feitos longe de casa, ou O.S. escalada na Programação para alguém do veículo). Com embarque, o uso é liberado em qualquer horário; sem embarque, todo o uso conta como fora do horário. Os feriados vêm do calendário do sistema (nacionais); feriado regional ou municipal precisa ser cadastrado.</li>
            <li><strong>Pouco registro no dia</strong> (menos de 3 registros, ou menos de 3 h entre o primeiro e o último): o horário é ampliado para 05:30 às 20:00 (seg a sáb). Sem nenhum registro vale esse horário padrão; domingo sem registro, todo uso conta como fora do horário.</li>
            <li><strong>Fora do horário</strong> (vermelho): 25 km ou mais fora do horário permitido, 2 h ou mais, 5 km ou mais à noite (22h às 5h) ou 5 km ou mais depois de chegar em casa. <strong>Para conferir</strong> (amarelo): 5 km ou mais, algum km à noite, percurso bem mais longo que o direto ou chegada em casa com mais de 1 h de atraso.</li>
            <li>Quando uma viagem passa do limite, só a parte depois do limite conta (proporcional ao tempo).</li>
            <li><strong>Ida e volta são válidas:</strong> o percurso da casa até o primeiro local de trabalho e o do último local de trabalho até a primeira chegada em casa nunca contam como fora do horário nem como sem justificativa, desde que não passem de 2,5 vezes o trajeto direto mais 20 km. O horário de chegada em casa continua sendo conferido (atraso).</li>
            <li><strong>Trajeto sem justificativa:</strong> a viagem não chega a uma O.S. programada (a menos de 3 km), à casa de um colega de carona, a um local onde houve registro de trabalho nem a um posto ou oficina, e o conjunto de trechos soltos entre dois desses locais passa de 1,6 vez o trajeto direto mais 5 km. <strong>Uso indevido</strong> (roxo): 40 km ou mais sem justificativa e pelo menos 25% do que o veículo rodou no dia. <strong>Para conferir</strong>: 15 km ou mais. Sem nenhum local conhecido no dia, o resultado nunca passa de "para conferir".</li>
            <li><strong>Excesso de velocidade:</strong> registros do rastreador (BFleet/Infleet) no dia da placa; contam como fora do horário quando acontecem depois da janela permitida e como "sem justificativa" quando estavam num trajeto sem justificativa.</li>
          </ul>
        </details>
      </div>`;
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

export { atualizarRodapeDossie, fhRenderDossieAberto, renderForaHorarioList, fhResumoTexto, openDossieModal, openRotaModal };
