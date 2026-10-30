// Frotas › Dashboard: montagem do HTML de cada bloco (funções puras: dados entram, string sai). O estado e os eventos ficam em
// assets/js/frotas-dashboard.js. Todo texto vindo do banco passa por esc().
import { PERIODOS, ETAPAS_MANUTENCAO, ETAPAS_SINISTRO, LIMITE_GPS_DIAS, AVISO_MULTA_DIAS, LIMITE_CHECKLIST_DIAS } from './frotas-dashboard-regras.js?v=20261029-dash5';
import { rosca, barras } from './frotas-dashboard-graficos.js?v=20261029-dash5';

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export const fmtN = (n) => (n == null ? '—' : Number(n).toLocaleString('pt-BR'));
export const fmtBRL = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
// Valor curto para cima das barras: R$ 1,2 mil / R$ 3,4 mi.
export const fmtBRLCurto = (v) => {
  const n = Number(v || 0);
  if (Math.abs(n) >= 1e6) return `R$ ${(n / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi`;
  if (Math.abs(n) >= 1e3) return `R$ ${(n / 1e3).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil`;
  return `R$ ${Math.round(n)}`;
};
export const fmtData = (iso) => (iso ? iso.split('-').reverse().join('/') : '');

// Mesma regra do painel: /painel/<tela> no domínio de produção, ./<tela> em desenvolvimento.
export function panelUrl(destino = '', loc = globalThis.location) {
  const n = String(destino || '').replace(/^\/+/, '').replace(/\.html$/i, '');
  const h = String(loc?.hostname || '').toLowerCase();
  if (h === 'grao1000.com.br' || h === 'www.grao1000.com.br' || String(loc?.pathname || '').includes('/painel')) return n ? `/painel/${n}` : '/painel';
  return n ? `./${n}` : './';
}

const carregando = '<span class="fd-skel" aria-label="Carregando"></span>';
export const blocoErro = (chave, msg) => `<div class="fd-erro" role="alert"><span>Não foi possível carregar${msg ? ` (${esc(msg)})` : ''}.</span><button type="button" class="fd-link" data-retry="${esc(chave)}">Tentar novamente</button></div>`;
const valorOu = (estado, valor, fmt = fmtN) => (estado === 'carregando' ? carregando : estado === 'erro' ? '—' : fmt(valor));

// Variação contra o período anterior. Para custo e ocorrências, subir é ruim.
export function seloVariacao(v, { rotuloAnterior = 'período anterior', fmt = fmtN } = {}) {
  if (!v) return '';
  if (v.delta === 0) return `<span class="fd-var fd-var-igual">igual ao ${esc(rotuloAnterior)}</span>`;
  const sobe = v.delta > 0;
  // Anterior zerado não tem percentual: mostra a diferença absoluta.
  const quanto = v.pct == null ? ` ${sobe ? '+' : '−'}${fmt(Math.abs(v.delta))}` : ` ${Math.abs(v.pct)}%`;
  return `<span class="fd-var ${sobe ? 'fd-var-pior' : 'fd-var-melhor'}">${sobe ? '▲' : '▼'}${quanto} vs ${esc(rotuloAnterior)}</span>`;
}

/* ── Cabeçalho e filtros ── */
export function cabecalho({ dataTexto, total, atualizadoEm, filtrado, filtroTexto = '' }) {
  return `
    <div class="fd-hdr-title">
      <h2>Visão geral da frota</h2>
      <p>${esc(dataTexto)}${atualizadoEm ? ` · atualizado às ${esc(atualizadoEm)}` : ' · carregando…'}${filtrado && filtroTexto ? ` · <strong>${esc(filtroTexto)}</strong>` : ''}</p>
    </div>
    <div class="fd-badge" id="fd-total-badge">${total == null ? 'Carregando…' : `${fmtN(total)} veículo${total === 1 ? '' : 's'}${filtrado ? ' no filtro' : ' cadastrados'}`}</div>
    <button type="button" class="fd-btn" data-refresh title="Recarregar todos os blocos">↻ Atualizar</button>`;
}

function opcoes(lista, atual, vazio) {
  const todas = lista.includes(atual) || !atual ? lista : [atual, ...lista];
  return `<option value="">${esc(vazio)}</option>${todas.map((o) => `<option value="${esc(o)}"${o === atual ? ' selected' : ''}>${esc(o)}</option>`).join('')}`;
}
export function barraFiltros({ coordenacoes, supervisoes, filtro }) {
  const ativo = Boolean(filtro.coordenacao || filtro.supervisao);
  return `
    <label class="fd-filtro"><span>Coordenação</span><select id="fd-f-coord">${opcoes(coordenacoes, filtro.coordenacao, 'Todas')}</select></label>
    <label class="fd-filtro"><span>Supervisão</span><select id="fd-f-sup">${opcoes(supervisoes, filtro.supervisao, 'Todas')}</select></label>
    <label class="fd-filtro"><span>Período</span><select id="fd-f-periodo">${PERIODOS.map((p) => `<option value="${p.id}"${p.id === filtro.periodo ? ' selected' : ''}>${esc(p.rotulo)}</option>`).join('')}</select></label>
    ${ativo ? '<button type="button" class="fd-link" data-limpar>Limpar filtros</button>' : ''}
    <span class="fd-filtro-dica">ⓘ Coordenação e supervisão filtram a página toda. O período vale para custos, excessos, fora do horário e sinistros novos.</span>`;
}

/* ── Central de pendências ── */
// Cada pendência é uma barra proporcional à maior (gráfico de barras horizontais), não uma caixa por item.
const linhaAcao = (i, maior) => `
  <a class="fd-pend fd-tom-${i.tom}" href="${panelUrl(i.destino)}" title="${esc(i.detalhe || '')}">
    <span class="fd-pend-txt"><strong>${esc(i.titulo)}</strong>${i.detalhe ? `<small>${esc(i.detalhe)}</small>` : ''}</span>
    <span class="fd-pend-barra"><i style="width:${Math.max(3, (i.n / maior) * 100).toFixed(1)}%"></i></span>
    <span class="fd-pend-n">${fmtN(i.n)}</span>
  </a>`;

export function blocoAcoes(itens, { carregandoTudo, falhas = false }) {
  const urgentes = itens.filter((i) => i.n > 0);
  const nulos = itens.filter((i) => i.n == null);
  const emDia = itens.filter((i) => i.n === 0);
  const criticas = urgentes.filter((i) => i.tom === 'red');
  const atencao = urgentes.filter((i) => i.tom !== 'red');
  const maior = Math.max(1, ...urgentes.map((i) => i.n));
  const grupo = (titulo, tom, lista) => (lista.length ? `
    <div class="fd-pend-grupo">
      <div class="fd-pend-t fd-tom-${tom}"><span class="fd-pend-ponto"></span>${esc(titulo)} <b>${lista.length}</b></div>
      ${lista.map((i) => linhaAcao(i, maior)).join('')}
    </div>` : '');
  const esperando = carregandoTudo
    ? `<div class="fd-pend-grupo">${nulos.slice(0, 4).map(() => `<div class="fd-pend fd-tom-neutro"><span class="fd-pend-txt"><strong>&nbsp;</strong></span><span class="fd-pend-barra"></span><span class="fd-pend-n">${carregando}</span></div>`).join('')}</div>`
    : '';
  const chips = emDia.map((i) => `<a class="fd-chip fd-chip-ok" href="${panelUrl(i.destino)}">✓ ${esc(i.titulo)}</a>`).join('')
    + (!carregandoTudo ? nulos.map((i) => `<span class="fd-chip fd-chip-off" title="Dado indisponível">— ${esc(i.titulo)}</span>`).join('') : '');
  const vazio = !carregandoTudo && !urgentes.length ? '<div class="fd-acao-vazio">Nenhuma pendência agora. Tudo em dia.</div>' : '';
  const resumo = carregandoTudo ? '' : `${criticas.length} crítica${criticas.length === 1 ? '' : 's'} · ${atencao.length} de atenção`;
  return `
    <div class="fd-card-title"><span class="dot"></span>Central de pendências<span class="fd-sec-n">${resumo}</span></div>
    <div class="fd-pend-grid">${grupo('Crítico', 'red', criticas)}${grupo('Atenção', 'amber', atencao)}${esperando}${vazio}</div>
    ${chips ? `<div class="fd-chips"><span class="fd-chips-t">${falhas ? 'Em dia (✓) ou indisponível (—)' : 'Em dia'}</span>${chips}</div>` : ''}`;
}

/* ── Frota ── */
const kpi = ({ rotulo, valor, sub, tom, href }) => `
  <${href ? `a href="${panelUrl(href)}"` : 'div'} class="fd-scard${href ? ' fd-scard-link' : ''}" style="--fd-scard-accent:${tom}">
    <span class="fd-scard-label">${esc(rotulo)}</span>
    <span class="fd-scard-val">${valor}</span>
    <span class="fd-scard-sub">${sub}</span>
  </${href ? 'a' : 'div'}>`;

export function blocoKpis(frota, estado, estadoRastreio = estado) {
  if (estado === 'erro') return '';
  const v = (n) => valorOu(estado, n);
  // Com/sem rastreador e leitura dependem também do controle de instalação (frotas_rastreadores).
  const vr = (n) => valorOu(estado === 'ok' ? estadoRastreio : estado, n);
  const fora = frota?.outrosStatus?.length
    ? frota.outrosStatus.slice(0, 3).map(([s, n]) => `${esc(s)} ${fmtN(n)}`).join(' · ') + (frota.outrosStatus.length > 3 ? ` · +${frota.outrosStatus.length - 3}` : '')
    : 'inativos, vendidos e baixados';
  return [
    kpi({ rotulo: 'Frota cadastrada', valor: v(frota?.total), sub: 'todos os status', tom: '#6fd0a5', href: 'frotas-veiculos' }),
    kpi({ rotulo: 'Ativo com rastreador', valor: vr(frota?.comRastreador), sub: 'conforme a tela Rastreadores', tom: '#3fa878', href: 'frotas-rastreadores' }),
    kpi({ rotulo: 'Ativo sem rastreador', valor: vr(frota?.semRastreador), sub: 'a instalar', tom: '#f59e0b', href: 'frotas-rastreadores' }),
    kpi({ rotulo: 'Em manutenção', valor: v(frota?.manutencao), sub: 'status do cadastro do veículo', tom: '#60a5fa', href: 'frotas-manutencao-grupo' }),
    kpi({ rotulo: 'Fora de operação', valor: v(frota?.foraOperacao), sub: estado === 'ok' ? fora : '&nbsp;', tom: '#94a3b8', href: 'frotas-veiculos' }),
    kpi({ rotulo: 'Rastreador sem leitura', valor: vr(frota?.semLeitura), sub: `ativos há mais de ${LIMITE_GPS_DIAS} dias sem ler`, tom: '#ef4444', href: 'frotas-rastreadores' }),
  ].join('');
}

// Composição da frota: rosca + legenda.
export function blocoComposicao(frota, estado, estadoRastreio) {
  if (estado === 'erro') return blocoErro('veiculos');
  if (estado === 'carregando' || !frota) return `<div class="fd-vazio">${carregando}</div>`;
  const semControle = estadoRastreio !== 'ok'; // sem o controle de instalação não dá para separar com e sem rastreador
  const ativos = frota.total - frota.manutencao - frota.foraOperacao;
  const segmentos = [
    ...(semControle
      ? [{ rotulo: 'Ativo', valor: ativos, tom: 'verde' }]
      : [{ rotulo: 'Ativo com rastreador', valor: frota.comRastreador, tom: 'verde' }, { rotulo: 'Ativo sem rastreador', valor: frota.semRastreador, tom: 'ambar' },
        // Ativos removidos da lista de Rastreadores (não entram em com/sem): sem esta fatia o total da rosca ficaria menor que a frota.
        ...(ativos - frota.comRastreador - frota.semRastreador > 0 ? [{ rotulo: 'Ativo fora da lista de rastreadores', valor: ativos - frota.comRastreador - frota.semRastreador, tom: 'roxo' }] : [])]),
    { rotulo: 'Em manutenção', valor: frota.manutencao, tom: 'azul' },
    { rotulo: 'Fora de operação', valor: frota.foraOperacao, tom: 'cinza' },
  ];
  const soma = segmentos.reduce((n, x) => n + x.valor, 0);
  const legenda = segmentos.map((x) => `
    <li><span class="fd-leg-cor fd-g-fundo-${x.tom}"></span><span class="fd-leg-r">${esc(x.rotulo)}</span><b>${fmtN(x.valor)}</b><small>${soma ? Math.round((x.valor / soma) * 100) : 0}%</small></li>`).join('');
  return `<div class="fd-comp">${rosca(segmentos, { centro: fmtN(soma), legendaCentro: 'veículos' })}<ul class="fd-leg">${legenda}</ul></div>`;
}

// Rosca com a legenda ao lado: o gráfico conta a história e os números ficam na legenda (sem caixas empilhadas).
function roscaComLegenda(segmentos, { centro, legendaCentro, href } = {}) {
  const soma = segmentos.reduce((n, x) => n + x.valor, 0);
  const lis = segmentos.map((x) => `
    <li><span class="fd-leg-cor fd-g-fundo-${x.tom}"></span><span class="fd-leg-r">${esc(x.rotulo)}</span><b>${fmtN(x.valor)}</b></li>`).join('');
  const corpo = `<div class="fd-comp fd-comp-sm">${rosca(segmentos, { centro: centro ?? fmtN(soma), legendaCentro, tamanho: 132, espessura: 18 })}<ul class="fd-leg">${lis}</ul></div>`;
  return href ? `<a class="fd-comp-link" href="${panelUrl(href)}">${corpo}</a>` : corpo;
}

/* ── Cartões de seção ── */
// selo: resumo curto no título do cartão ({ texto, tom: 'red'|'amber'|'ok' }), para ler a situação sem abrir o cartão.
export const secao = (titulo, corpo, { href, acao, selo } = {}) => `
  <div class="fd-card-title"><span class="dot"></span>${esc(titulo)}${selo ? `<span class="fd-selo fd-selo-${esc(selo.tom)}">${esc(selo.texto)}</span>` : ''}${href ? `<a class="fd-link fd-card-go" href="${panelUrl(href)}">${esc(acao || 'Abrir')} →</a>` : ''}</div>
  ${corpo}`;

// Selo do cartão: o pior que houver (vermelho > âmbar > em dia). itens: [[quantidade, 'rótulo', 'red'|'amber'], …]; null = ainda sem dado.
export function seloDe(itens, vazio = 'Em dia') {
  if (itens.some(([n]) => n == null)) return null;
  for (const tom of ['red', 'amber']) {
    const achados = itens.filter(([n, , t]) => n > 0 && t === tom);
    if (achados.length) return { tom, texto: achados.map(([n, r]) => `${fmtN(n)} ${r}`).join(' · ') };
  }
  return { tom: 'ok', texto: vazio };
}

// Números-chave numa linha só, separados por filete (sem uma caixa para cada número).
const numerosLinha = (itens) => `<div class="fd-nums">${itens.map((i) => `
  <div class="fd-num${i.tom ? ` fd-tom-${i.tom}` : ''}"><span class="fd-num-n">${i.valor}</span><span class="fd-num-l">${esc(i.rotulo)}</span>${i.sub ? `<span class="fd-num-s">${i.sub}</span>` : ''}</div>`).join('')}</div>`;

export function blocoManutencao({ manut, venc, custoMeses, estadoManut, estadoVenc, periodo, variacaoCusto }) {
  const m = estadoManut === 'ok' ? manut : null;
  const maior = m ? Math.max(1, ...ETAPAS_MANUTENCAO.map(([id]) => m.etapas[id])) : 1;
  const funil = estadoManut === 'erro' ? blocoErro('manut')
    : `<div class="fd-funil">${ETAPAS_MANUTENCAO.map(([id, rotulo]) => `
        <div class="fd-funil-linha">
          <span class="fd-funil-r">${esc(rotulo)}</span>
          <div class="fd-funil-barra"><div style="width:${m ? ((m.etapas[id] / maior) * 100).toFixed(1) : 0}%"></div></div>
          <span class="fd-funil-n">${valorOu(estadoManut, m?.etapas[id])}</span>
        </div>`).join('')}</div>`;
  const vencimentos = estadoVenc === 'erro' ? blocoErro('venc')
    : estadoVenc === 'carregando' || !venc ? `<div class="fd-vazio">${carregando}</div>`
      : roscaComLegenda([
        { rotulo: 'Vencidos sem solicitação', valor: venc.semSolicitacao, tom: 'vermelho' },
        { rotulo: 'Vencidos com solicitação', valor: venc.vencidos - venc.semSolicitacao, tom: 'ambar' },
        { rotulo: 'Vencem em breve', valor: venc.proximos, tom: 'azul' },
      ], { legendaCentro: 'serviços', href: 'frotas-manutencao-grupo' });
  const numeros = estadoManut === 'erro' ? '' : numerosLinha([
    { rotulo: 'Em aberto', valor: valorOu(estadoManut, m?.abertas), sub: m ? `${fmtN(m.urgentes)} alta/urgente` : '', tom: m?.urgentes ? 'amber' : '' },
    { rotulo: `Custo · ${periodo.rotulo.toLowerCase()}`, valor: valorOu(estadoManut, m?.atual.custo, fmtBRL), sub: m ? `${fmtN(m.atual.qtd)} concluída(s)<br>${seloVariacao(variacaoCusto, { fmt: fmtBRL })}` : '' },
  ]);
  const grafico = estadoManut !== 'ok' || !custoMeses ? '' : `
    <div class="fd-sub-t">Custo por mês · últimos ${custoMeses.length} meses</div>
    ${barras(custoMeses.map((c) => ({ rotulo: c.rotulo, valores: [c.custo], dica: `${c.rotulo}: ${fmtBRL(c.custo)} em ${c.qtd} manutenção(ões)` })), { tons: ['azul'], formatar: fmtBRLCurto, destacarUltimo: true })}`;
  return `${numeros}<div class="fd-duo"><div><div class="fd-sub-t">Em andamento por etapa</div>${funil}</div><div><div class="fd-sub-t">Serviços do plano</div>${vencimentos}</div></div>${grafico}`;
}

export function blocoSinistros({ sinistros, estado }) {
  if (estado === 'erro') return blocoErro('sinistros');
  const s = estado === 'ok' ? sinistros : null;
  const maior = s ? Math.max(1, ...ETAPAS_SINISTRO.map(([id]) => s.etapas[id])) : 1;
  const funil = `<div class="fd-funil">${ETAPAS_SINISTRO.map(([id, rotulo]) => `
      <div class="fd-funil-linha">
        <span class="fd-funil-r">${esc(rotulo)}</span>
        <div class="fd-funil-barra"><div class="fd-funil-roxo" style="width:${s ? ((s.etapas[id] / maior) * 100).toFixed(1) : 0}%"></div></div>
        <span class="fd-funil-n">${valorOu(estado, s?.etapas[id])}</span>
      </div>`).join('')}</div>`;
  const lista = !s ? '' : s.atencao.length
    ? `<div class="fd-sub-t">Próximo passo atrasado ou para hoje</div>
       <ul class="fd-rank">${s.atencao.map((a) => `
        <li><span class="fd-rank-nome" title="${esc(a.acao)}">SIN-${String(a.numero ?? 0).padStart(4, '0')} · ${esc(a.placa)}<small>${esc(a.acao || 'Sem próximo passo descrito')}</small></span>
          <span class="fd-rank-det ${a.situacao === 'vencido' ? 'fd-txt-red' : 'fd-txt-amber'}">${a.situacao === 'hoje' ? 'para hoje' : `atrasado ${a.dias} dia(s)`}</span>
          <span class="fd-rank-n fd-rank-data">${fmtData(a.prazo)}</span></li>`).join('')}</ul>`
    : '<div class="fd-vazio">Nenhum próximo passo atrasado.</div>';
  return `
    ${numerosLinha([
    { rotulo: 'Em andamento', valor: valorOu(estado, s?.andamento), sub: s ? `${fmtN(s.feridos)} com ferido` : '' },
    { rotulo: 'Prazo vencido ou hoje', valor: valorOu(estado, s?.comPrazo), tom: s?.comPrazo ? 'red' : '' },
    { rotulo: 'Novos no período', valor: valorOu(estado, s?.novos), sub: s ? seloVariacao(s.variacao) : '' },
  ])}
    <div class="fd-sub-t">Em andamento por etapa</div>
    ${funil}${lista}`;
}

export function blocoMultas({ multas, estado }) {
  if (estado === 'erro') return blocoErro('multas');
  if (estado !== 'ok' || !multas) return `<div class="fd-vazio">${carregando}</div>`;
  const m = multas;
  const situacao = roscaComLegenda([
    { rotulo: 'Sem condutor', valor: m.semCondutor, tom: 'vermelho' },
    { rotulo: 'Condutor a notificar', valor: m.aNotificar, tom: 'ambar' },
    { rotulo: 'Condutor já notificado', valor: m.notificadas, tom: 'verde' },
  ], { legendaCentro: 'em aberto', href: 'frotas-multas' });
  const prazos = barras(m.prazos.map((p) => ({ rotulo: p.rotulo, valores: [p.qtd], dica: `${p.rotulo}: ${p.qtd} multa(s)` })), { tons: ['azul'] });
  return `
    ${numerosLinha([
    { rotulo: 'Em aberto', valor: fmtN(m.abertas), sub: `${fmtBRL(m.valor)} no total` },
    { rotulo: `Prazo em ${AVISO_MULTA_DIAS} dias`, valor: fmtN(m.prazoCurto), tom: m.prazoCurto ? 'red' : '' },
  ])}
    <div class="fd-duo"><div><div class="fd-sub-t">Situação</div>${situacao}</div><div><div class="fd-sub-t">Quando vencem</div>${prazos}</div></div>`;
}

export function blocoConduta({ excessos, foraHorario, pendentes, reinc, semanas, estado, estadoPendentes, periodo, truncado }) {
  const lista = estado === 'erro' ? blocoErro('conduta')
    : estado === 'carregando' ? `<div class="fd-vazio">${carregando}</div>`
      : reinc.length ? `<ul class="fd-rank">${reinc.map((r, i) => `
          <li><span class="fd-rank-pos">${i + 1}</span>
            <span class="fd-rank-nome" title="${esc(r.nome)}">${esc(r.nome)}<small>${esc(r.placas.join(', '))}</small></span>
            <span class="fd-rank-det">${r.excessos ? `${r.excessos} exc.${r.maxVel ? ` (até ${Math.round(r.maxVel)} km/h)` : ''}` : ''}${r.excessos && r.foraHorario ? ' · ' : ''}${r.foraHorario ? `${r.foraHorario} fora do horário` : ''}</span>
            <span class="fd-rank-n">${r.total}</span></li>`).join('')}</ul>`
        : '<div class="fd-vazio">Sem reincidência no período (ninguém com 2 ou mais registros).</div>';
  const grafico = estado !== 'ok' || !semanas?.length ? '' : `
    <div class="fd-sub-t">Ocorrências por semana <span class="fd-leg-inline"><i class="fd-g-fundo-ambar"></i>excessos <i class="fd-g-fundo-roxo"></i>fora do horário</span></div>
    ${barras(semanas.map((w) => ({ rotulo: w.rotulo, valores: [w.excessos, w.foraHorario], dica: `Semana de ${w.rotulo}: ${w.excessos} excesso(s), ${w.foraHorario} fora do horário` })), { tons: ['ambar', 'roxo'] })}`;
  return `
    ${numerosLinha([
    { rotulo: `Excessos · ${periodo.rotulo.toLowerCase()}`, valor: valorOu(estado, excessos?.atual), sub: excessos ? seloVariacao(excessos.variacao) : '' },
    { rotulo: 'Fora do horário', valor: valorOu(estado, foraHorario?.atual), sub: foraHorario ? seloVariacao(foraHorario.variacao) : '' },
    { rotulo: 'Excessos a notificar', valor: valorOu(estadoPendentes, pendentes) + (truncado ? '+' : ''), tom: pendentes ? 'amber' : '' },
  ])}
    ${grafico}
    <div class="fd-sub-t">Mais ocorrências no período</div>
    ${lista}`;
}

export function blocoCnh({ cnh, estado }) {
  if (estado === 'erro') return blocoErro('cnh');
  if (estado !== 'ok' || !cnh) return `<div class="fd-vazio">${carregando}</div>`;
  const lista = cnh.proximos.length
    ? `<ul class="fd-rank">${cnh.proximos.map((c) => `
        <li><span class="fd-rank-nome" title="${esc(c.nome)}">${esc(c.nome)}</span>
          <span class="fd-rank-det ${c.dias < 0 ? 'fd-txt-red' : 'fd-txt-amber'}">${c.dias < 0 ? `vencida há ${-c.dias} dia(s)` : c.dias === 0 ? 'vence hoje' : `vence em ${c.dias} dia(s)`}</span>
          <span class="fd-rank-n fd-rank-data">${fmtData(c.validade)}</span></li>`).join('')}</ul>`
    : '<div class="fd-vazio">Nenhuma CNH vencida ou perto de vencer.</div>';
  return `
    ${roscaComLegenda([
    { rotulo: 'Vencidas', valor: cnh.vencidas, tom: 'vermelho' },
    { rotulo: 'Vencem em 30 dias', valor: cnh.vencendo, tom: 'ambar' },
    { rotulo: 'Em dia', valor: cnh.emDia, tom: 'verde' },
    { rotulo: 'Sem validade no cadastro', valor: cnh.semValidade, tom: 'cinza' },
  ], { legendaCentro: 'motoristas', href: 'frotas-motoristas' })}
    ${lista}`;
}

export function blocoChecklists({ checklists, estado }) {
  if (estado === 'erro') return blocoErro('checklist');
  if (estado !== 'ok' || !checklists) return `<div class="fd-vazio">${carregando}</div>`;
  const c = checklists;
  const lista = c.piores.length
    ? `<div class="fd-sub-t">Há mais tempo sem checklist</div>
       <ul class="fd-rank">${c.piores.map((p) => `
        <li><span class="fd-rank-nome">${esc(p.placa)}</span>
          <span class="fd-rank-det fd-txt-amber">há ${p.dias} dia(s)</span>
          <span class="fd-rank-n fd-rank-data">${fmtData(p.data)}</span></li>`).join('')}</ul>`
    : '<div class="fd-vazio">Nenhuma placa com checklist vencido.</div>';
  return `
    ${roscaComLegenda([
    { rotulo: `Em dia (até ${LIMITE_CHECKLIST_DIAS} dias)`, valor: c.emDia, tom: 'verde' },
    { rotulo: `Vencidos (+${LIMITE_CHECKLIST_DIAS} dias)`, valor: c.vencidos, tom: 'ambar' },
    { rotulo: 'Ativos sem checklist', valor: c.semChecklist, tom: 'cinza' },
  ], { legendaCentro: 'veículos', href: 'frotas-cadastros' })}
    ${lista}`;
}

/* ── Distribuição ── */
export function blocoDistribuicao({ porCoordenacao, total, selecionada, vista, estado }) {
  const abas = `<div class="fd-vista" role="tablist"><button type="button" role="tab" class="${vista === 'lista' ? 'on' : ''}" data-vista="lista">Lista</button><button type="button" role="tab" class="${vista === 'mapa' ? 'on' : ''}" data-vista="mapa">Mapa</button></div>`;
  if (estado === 'erro') return { abas, corpo: blocoErro('veiculos') };
  if (estado === 'carregando') return { abas, corpo: `<div class="fd-vazio">${carregando}</div>` };
  if (vista === 'mapa') {
    return { abas, corpo: '<div class="fd-mapa-wrap" id="fd-map-wrap"></div><div class="fd-map-legend"><span class="fd-legend-lbl" id="fd-map-min">0</span><div class="fd-legend-bar"></div><span class="fd-legend-lbl" id="fd-map-max">—</span></div>' };
  }
  const maior = porCoordenacao.length ? porCoordenacao[0][1] : 1;
  const corpo = porCoordenacao.length ? `<div class="fd-coord-list">${porCoordenacao.map(([nome, n]) => `
      <button type="button" class="fd-coord-row${nome === selecionada ? ' on' : ''}" data-coord="${esc(nome)}" title="Filtrar a página por ${esc(nome)}">
        <span class="fd-coord-name">${esc(nome)}</span>
        <span class="fd-coord-bar-wrap"><span class="fd-coord-bar" style="width:${((n / maior) * 100).toFixed(1)}%"></span></span>
        <span class="fd-coord-count">${fmtN(n)}</span>
        <span class="fd-coord-pct">${total ? ((n / total) * 100).toFixed(0) : 0}%</span>
      </button>`).join('')}</div><div class="fd-dica">Clique numa coordenação para filtrar a página inteira.</div>` : '<div class="fd-vazio">Nenhum veículo com coordenação neste filtro.</div>';
  return { abas, corpo };
}
