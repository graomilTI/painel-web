// Frotas — Fora do horário — dossiê do dia: regras e textos (cálculo puro, sem HTML nem DOM).
// Extraído de modules/frotas.js em 14/10/2026 e dividido em 15/10/2026 (frotas-fh-dossie.js tinha 1.030 linhas):
// regras (frotas-fh-dossie-regras) -> HTML (frotas-fh-dossie-html) -> tela (frotas-fh-dossie). Código movido sem alteração.
// Para publicar uma mudança em qualquer módulo frotas-*.js deste conjunto, troque o token ?v=20261015-frotas-carga1 em TODOS os imports
// internos (e os do carregador da página): tests/frotas-modulos-versao.test.mjs garante que fiquem iguais.
import { state, onlyPlate, formatDateBR } from './frotas-base.js?v=20261015-frotas-carga1';
import { FH_VEREDITOS, FH_EVIDENCIAS, fhPrimeiroNome, FH_DIAS_SEMANA, fhHm, fhHoraMin, fhMinutosDoDia, fhKm, fhDuracao, fhFonteRotulo, fhChave, FH_FORA_MIN_KM, fhDiaSeguinte, fhDataCurta, FH_ORDEM_VEREDITO, FH_ORDEM_USO, fhPior, fhDiaEspecial, fhDiaEspecialRotulo, fhMaiusc, fhNum, fhPeriodo, fhTitulo } from './frotas-fh-util.js?v=20261015-frotas-carga1';
import { finito, fhAgruparOs } from './frotas-fh-mapa.js?v=20261015-frotas-carga1';

  // Texto do registro; quando foi feito por um colega de carona, diz de quem.
  function fhEvidenciaRotulo(e) {
    let base = FH_EVIDENCIAS[e.tipo] || e.tipo;
    if (e.tipo === 'CARGA' && Number(e.qtd) > 1) base = `${Number(e.qtd)} cargas lançadas no app`;
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

  function fhSituacaoViagem(v, semJanela, rotuloSemJanela = 'em dia sem expediente') {
    const periodo = fhPeriodo(fhMinutosDoDia(v.fora_ini || v.ini, String(v.ini || '').slice(0, 10)) ?? 600);
    const prefixo = periodo ? `${periodo}, ` : '';
    if (v.fase === 'APOS_CHEGADA_EM_CASA') return `${prefixo}depois de chegar em casa`;
    if (v.fase === 'ANTES_EXPEDIENTE') return `${prefixo}antes do expediente`;
    if (v.fase === 'APOS_EXPEDIENTE') return `${prefixo}${semJanela ? rotuloSemJanela : 'depois do expediente'}`;
    return 'fora do horário';
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
    const cargas = fhCargasDoDia(det);
    if (cargas.length) {
      linhas.push('', 'Cargas lançadas no app (data, horário, O.S. e local do lançamento):');
      cargas.forEach((c) => linhas.push(`- ${fhCargaQuando(c)} · ${fhCargaQtdTexto(c)} · O.S. ${c.os || '—'} · ${c.local || '—'}${c.em_casa ? ' · lançada em casa' : ''}${fhNum(c.veic_km) >= 2 ? ` · veículo a ${fhKm(c.veic_km)} km` : ''}`));
    }
    return linhas.join('\n');
  }

  // Cargas lançadas no app por quem estava no veículo (condutor, carona, equipe): um registro por O.S. e lugar, em ordem de horário.
  function fhCargasDoDia(det) {
    return (det.evidencias || []).filter((e) => e.tipo === 'CARGA').slice().sort((a, b) => String(a.ts).localeCompare(String(b.ts)));
  }

  function fhCargaQtdTexto(c) {
    const qtd = Math.max(1, Number(c.qtd) || 1);
    return `${qtd} ${qtd === 1 ? 'carga' : 'cargas'}`;
  }

  // "14/10 09:29" ou, quando o mesmo lugar recebeu cargas ao longo do dia, "14/10 09:29 às 15:39".
  function fhCargaQuando(c) {
    const ini = `${fhDataCurta(String(c.ts || '').slice(0, 10))} ${fhHm(c.ts)}`;
    return c.ts_fim && fhHm(c.ts_fim) !== fhHm(c.ts) ? `${ini} às ${fhHm(c.ts_fim)}` : ini;
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

export { fhCargasDoDia, fhCargaQtdTexto, fhCargaQuando, fhEvidenciaRotulo, fhDiaSemana, fhAgruparPorRota, fhLinhaPorChave, fhRotuloDias, fhJanelaTexto, fhFlags, fhGravidade, fhCategorias, fhStatusRota, fhAplicaNotificacao, fhStatusCurto, fhMaiorTrecho, fhSituacaoViagem, fhTrajetosAlerta, fhResumoTexto, fhMesclarDossies, fhPassosDoDia, fhContextoDoDia };
