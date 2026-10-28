// Frotas — Fora do horário — dossiê do dia: construtores de HTML (barra, cartões, percursos, registros, linha da lista).
// Extraído de modules/frotas.js em 14/10/2026 e dividido em 15/10/2026 (frotas-fh-dossie.js tinha 1.030 linhas):
// regras (frotas-fh-dossie-regras) -> HTML (frotas-fh-dossie-html) -> tela (frotas-fh-dossie). Código movido sem alteração.
// Para publicar uma mudança em qualquer módulo frotas-*.js deste conjunto, troque o token ?v=20261028-frotas-barra1 em TODOS os imports
// internos (e os do carregador da página): tests/frotas-modulos-versao.test.mjs garante que fiquem iguais.
import { escapeHtml, onlyPlate, formatDateBR } from './frotas-base.js?v=20261028-frotas-barra1';
import { formatKmForaHorario, formatMoneyForaHorario, FH_VEREDITOS, fhPrimeiroNome, fhHm, fhMinutosDoDia, fhKm, fhDuracao, fhChave, fhLinkTrajeto, fhLinkPonto, FH_USOS, FH_STATUS_EXCESSO, fhEnderecoCurto, FH_FORA_MIN_KM, fhDataCurta, fhDiaEspecial, fhDiaEspecialRotulo, fhMaiusc, fhNum, fhTitulo } from './frotas-fh-util.js?v=20261028-frotas-barra1';
import { finito } from './frotas-fh-mapa.js?v=20261028-frotas-barra1';
import { fhCargasDoDia, fhCargaQtdTexto, fhCargaQuando, fhEvidenciaRotulo, fhDiaSemana, fhRotuloDias, fhJanelaTexto, fhFlags, fhStatusRota, fhAplicaNotificacao, fhStatusCurto, fhMaiorTrecho, fhSituacaoViagem, fhTrajetosAlerta, fhPassosDoDia, fhContextoDoDia } from './frotas-fh-dossie-regras.js?v=20261028-frotas-barra1';

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
      <div class="fh-m-rodape-info">${rotulo ? `<span class="fh-sub"><b>${escapeHtml(rotulo)}</b></span>` : ''}${status ? `<span class="fh-status">${escapeHtml(status)}</span>` : ''}<span class="fh-sub">Notificação única: ${escapeHtml(inclui)}</span>${caixaInfo ? `<span class="fh-sub">${escapeHtml(caixaInfo)}</span>` : ''}${row.manutencao ? `<span class="fh-sub" style="color:#fcd34d"><b>Veículo em manutenção neste dia</b> (${escapeHtml(row.manutencao.os_numero || `MAN-${String(row.manutencao.numero).padStart(6, '0')}`)}). Confira se o uso foi real antes de enviar ao Caixa.</span>` : ''}</div>
      <div class="fora-horario-actions">
        <button class="speed-btn speed-btn-primary speed-btn-compact" type="button" data-fh-notificar data-fh-data="${escapeHtml(row.data_evento)}">Gerar notificação</button>
        ${temOcorrencia ? `<button class="speed-btn speed-btn-soft speed-btn-compact" type="button" data-fora-action="JUSTIFICAR" data-id="${escapeHtml(row.id)}" ${disabledJustificar ? 'disabled' : ''}>Justificar</button>` : ''}
        ${temOcorrencia && km > 0 ? `<button class="speed-btn speed-btn-soft speed-btn-compact" type="button" data-fora-action="CAIXA" data-id="${escapeHtml(row.id)}" ${disabledCaixa ? 'disabled' : ''}>Enviar ao Caixa</button>` : ''}
      </div>
    </div>`;
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
      <div class="fh-l-quem"><strong>${quem}</strong><small>${detalhe}${status ? ` · <span class="fh-status">${escapeHtml(status)}</span>` : ''}${row.manutencao ? ` · <span class="fh-status" style="color:#fcd34d" title="Veículo na oficina neste dia">Em manutenção</span>` : ''}</small></div>
      <div class="fh-cels">${fhCelulasHtml(d)}</div>
      <button class="speed-btn fh-btn-dossie speed-btn-compact" type="button" data-fh-dossie data-key="${escapeHtml(fhChave(row))}" ${d ? '' : 'disabled'}>Ver detalhes</button>
    </article>`;
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

  // Cargas lançadas no app por quem estava no veículo (condutor em 1º lugar): data e horário do lançamento, O.S., local e
  // a conferência com o veículo (onde ele estava no instante do lançamento). Clicar na linha leva ao ponto no mapa.
  function fhCargasHtml(dos, det) {
    const itens = fhCargasDoDia(det);
    if (!itens.length) return '<div class="speed-import-empty">Nenhuma carga lançada no app por quem estava neste veículo.</div>';
    const quemSet = new Set(itens.map((c) => String(c.quem || '')));
    const comQuem = quemSet.size > 1 || itens.some((c) => c.papel && c.papel !== 'MOTORISTA' && c.papel !== 'CONDUTOR');
    const total = itens.reduce((soma, c) => soma + Math.max(1, Number(c.qtd) || 1), 0);
    const linhas = itens.map((c) => {
      const mapa = fhLinkPonto(c.la, c.lo);
      let situacao;
      if (c.em_casa) situacao = '<span class="fh-fase neutra">lançada em casa: não conta</span>';
      else if (finito(c.veic_km) && fhNum(c.veic_km) >= 2) situacao = `<span class="fh-fase info" title="Distância entre o local do lançamento e o veículo naquele horário">veículo a ${fhKm(c.veic_km)} km</span>`;
      else if (finito(c.veic_km)) situacao = '<span class="fh-fase uso" title="O veículo estava no local do lançamento naquele horário">com o veículo</span>';
      else situacao = '<span class="fh-muted">—</span>';
      const clicavel = finito(c.la) && finito(c.lo) ? ` class="fh-clicavel" data-fh-foco-ponto="${Number(c.la)},${Number(c.lo)}" title="Ver esta carga no mapa"` : '';
      const local = c.local ? `<span title="${escapeHtml(fhTitulo(c.cliente || ''))}">${escapeHtml(fhTitulo(c.local))}</span>` : '';
      return `<tr${clicavel}>
        <td><strong>${escapeHtml(fhCargaQuando(c))}</strong></td>
        <td>${escapeHtml(fhCargaQtdTexto(c))}${c.os ? ` · O.S. ${escapeHtml(c.os)}` : ''}</td>
        <td>${local || '<span class="fh-muted">—</span>'}${mapa ? ` · <a href="${escapeHtml(mapa)}" target="_blank" rel="noopener noreferrer">mapa</a>` : ''}</td>
        ${comQuem ? `<td>${escapeHtml(fhPrimeiroNome(c.quem))}${c.papel === 'CARONA' ? ' <span class="fh-muted">(carona)</span>' : c.papel === 'EQUIPE' ? ' <span class="fh-muted">(equipe)</span>' : ''}</td>` : ''}
        <td>${situacao}</td>
      </tr>`;
    }).join('');
    return `<p class="speed-hint">${total} ${total === 1 ? 'carga lançada' : 'cargas lançadas'} no app${comQuem ? '' : ' pelo condutor'}; o local é o GPS do celular no momento do lançamento.</p>
      <div class="hist-table-wrap fh-tl-wrap"><table class="hist-table fh-tl fh-tl-cargas"><thead><tr><th>Data e horário</th><th>Cargas</th><th>Local do lançamento</th>${comQuem ? '<th>Quem</th>' : ''}<th>Situação</th></tr></thead><tbody>${linhas}</tbody></table></div>`;
  }

  function fhRegistrosHtml(dos, det) {
    const itens = (det.evidencias || []).slice().sort((a, b) => String(a.ts).localeCompare(String(b.ts)));
    if (!itens.length) return '<div class="speed-import-empty">Nenhum registro de trabalho neste dia.</div>';
    const linhas = itens.map((e) => {
      const partes = [];
      if (e.os) partes.push(`O.S. ${escapeHtml(e.os)}`);
      if (e.local && e.tipo !== 'CARONA') partes.push(escapeHtml(e.local));
      if (e.cargas) partes.push(`${escapeHtml(e.cargas)} carga(s)`);
      const ponto = ['CELULAR', 'CARGA', 'OS_PROGRAMADA', 'CARONA'].includes(e.tipo) ? fhLinkPonto(e.la, e.lo) : '';
      if (ponto) partes.push(`<a href="${escapeHtml(ponto)}" target="_blank" rel="noopener noreferrer">ver no mapa</a>`);
      const hora = e.tipo === 'CARGA' && e.ts_fim && fhHm(e.ts_fim) !== fhHm(e.ts) ? `${fhHm(e.ts)}–${fhHm(e.ts_fim)}` : fhHm(e.ts);
      return `<tr class="${e.em_casa ? 'fh-linha-casa' : ''}">
        <td><strong>${hora}</strong></td>
        <td>${escapeHtml(fhEvidenciaRotulo(e))}</td>
        <td>${partes.join(' · ') || '<span class="fh-muted">—</span>'}</td>
        <td>${e.em_casa ? '<span class="fh-fase neutra">feito em casa: não conta</span>' : '<span class="fh-fase info">conta como trabalho</span>'}</td>
      </tr>`;
    }).join('');
    return `<div class="hist-table-wrap fh-tl-wrap"><table class="hist-table fh-tl"><thead><tr><th>Horário</th><th>O que foi</th><th>Detalhe</th><th>Conta?</th></tr></thead><tbody>${linhas}</tbody></table></div>`;
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
    const cargasDia = fhCargasDoDia(det);
    const totalCargas = cargasDia.reduce((soma, c) => soma + Math.max(1, Number(c.qtd) || 1), 0);
    const abas = [
      { chave: 'resumo', rotulo: 'Linha do tempo' },
      { chave: 'trajetos', rotulo: 'Trajetos', n: trajetosAlerta },
      ...(cargasDia.length ? [{ chave: 'cargas', rotulo: 'Cargas', n: totalCargas }] : []),
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
      ${cargasDia.length ? `<div class="fh-painel" data-fh-pane="cargas" hidden>${fhCargasHtml(dos, det)}</div>` : ''}
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
            <li><strong>Trabalho registrado:</strong> informativos do colaborador no Mapa de Embarque, check-in e check-out da produção diária, cargas lançadas no app (data, horário e GPS do lançamento) e sinais de GPS do celular (app GRM). O que foi registrado em casa não conta.</li>
            <li><strong>Horário permitido:</strong> do primeiro registro (menos o tempo de ida) até o último registro (mais o tempo de volta), com ${Number(dos.tolerancia_min) || 20} min de folga. O tempo de ida e de volta é estimado pela distância em linha reta entre a casa e o local × ${escapeHtml(det.fator_rota ?? 1.4)} ÷ ${escapeHtml(det.vel_media_kmh ?? 60)} km/h.</li>
            <li><strong>Programação do dia:</strong> se o condutor ou um colega de carona estiver escalado em uma O.S., a chegada ou a saída do veículo a menos de 2 km do local dessa O.S. conta como trabalho; o mesmo vale para uma parada a menos de 1,5 km da casa cadastrada do colega de carona.</li>
            <li><strong>Domingo e feriado:</strong> só é autorizado rodar com embarque (informativo, check-in/out ou carga lançada longe de casa, ou O.S. escalada na Programação para alguém do veículo). Com embarque, o uso é liberado em qualquer horário; sem embarque, todo o uso conta como fora do horário. Os feriados vêm do calendário do sistema (nacionais); feriado regional ou municipal precisa ser cadastrado.</li>
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

export { fhRodapeDia, fhLinhaHtml, renderDossieHtml };
