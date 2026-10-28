// Frotas › Dashboard: montagem do HTML de cada bloco (funções puras: dados entram, string sai). O estado e os eventos ficam em
// assets/js/frotas-dashboard.js. Todo texto vindo do banco passa por esc().
import { PERIODOS, ETAPAS_MANUTENCAO, LIMITE_GPS_DIAS, AVISO_MULTA_DIAS } from './frotas-dashboard-regras.js?v=20261028-dash3';

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export const fmtN = (n) => (n == null ? '—' : Number(n).toLocaleString('pt-BR'));
export const fmtBRL = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
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
export function cabecalho({ dataTexto, total, atualizadoEm, filtrado }) {
  return `
    <div class="fd-hdr-title">
      <p>Módulo de Frotas · ${esc(dataTexto)}${atualizadoEm ? ` · atualizado às ${esc(atualizadoEm)}` : ''}</p>
    </div>
    <div class="fd-badge" id="fd-total-badge">${total == null ? '⋯ carregando' : `🚗 ${fmtN(total)} veículos${filtrado ? ' no filtro' : ' cadastrados'}`}</div>
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
    <span class="fd-filtro-dica">Coordenação e supervisão valem para a página toda. O período vale para custos, excessos e fora do horário.</span>`;
}

/* ── Precisa de ação ── */
export function blocoAcoes(itens, { carregandoTudo, falhas = false }) {
  const urgentes = itens.filter((i) => i.n > 0);
  const nulos = itens.filter((i) => i.n == null);
  const emDia = itens.filter((i) => i.n === 0);
  const cartoes = urgentes.map((i) => `
    <a class="fd-acao fd-tom-${i.tom}" href="${panelUrl(i.destino)}">
      <span class="fd-acao-n">${fmtN(i.n)}</span>
      <span class="fd-acao-t">${esc(i.titulo)}</span>
      ${i.detalhe ? `<span class="fd-acao-d">${esc(i.detalhe)}</span>` : ''}
    </a>`).join('');
  const esperando = carregandoTudo ? nulos.map(() => '<div class="fd-acao fd-tom-neutro"><span class="fd-acao-n">' + carregando + '</span><span class="fd-acao-t">&nbsp;</span></div>').join('') : '';
  const chips = emDia.map((i) => `<a class="fd-chip fd-chip-ok" href="${panelUrl(i.destino)}">✓ ${esc(i.titulo)}</a>`).join('')
    + (!carregandoTudo ? nulos.map((i) => `<span class="fd-chip fd-chip-off" title="Dado indisponível">— ${esc(i.titulo)}</span>`).join('') : '');
  const vazio = !carregandoTudo && !urgentes.length ? '<div class="fd-acao-vazio">Nenhuma pendência crítica agora.</div>' : '';
  return `
    <h2 class="fd-sec-t">Precisa de ação<span class="fd-sec-n">${carregandoTudo ? '' : `${urgentes.length} ${urgentes.length === 1 ? 'tipo de pendência' : 'tipos de pendência'}`}</span></h2>
    <div class="fd-acoes">${cartoes}${esperando}${vazio}</div>
    ${chips ? `<div class="fd-chips"><span class="fd-chips-t">${falhas ? 'Em dia (✓) ou indisponível (—)' : 'Em dia'}</span>${chips}</div>` : ''}`;
}

/* ── Frota ── */
const kpi = ({ rotulo, valor, sub, tom, href, icone }) => `
  <${href ? `a href="${panelUrl(href)}"` : 'div'} class="fd-scard${href ? ' fd-scard-link' : ''}" style="--fd-scard-accent:${tom}">
    <span class="fd-scard-icon">${icone}</span>
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
    kpi({ rotulo: 'Ativo com rastreador', valor: vr(frota?.comRastreador), sub: 'conforme a tela Rastreadores', tom: '#3fa878', href: 'frotas-veiculos', icone: '📡' }),
    kpi({ rotulo: 'Ativo sem rastreador', valor: vr(frota?.semRastreador), sub: 'a instalar, conforme a tela Rastreadores', tom: '#f59e0b', href: 'frotas-rastreadores', icone: '🚗' }),
    kpi({ rotulo: 'Em manutenção', valor: v(frota?.manutencao), sub: 'status do cadastro do veículo', tom: '#60a5fa', href: 'frotas-manutencao-grupo', icone: '🔧' }),
    kpi({ rotulo: 'Fora de operação', valor: v(frota?.foraOperacao), sub: estado === 'ok' ? fora : '&nbsp;', tom: '#94a3b8', href: 'frotas-veiculos', icone: '⛔' }),
    kpi({ rotulo: 'Rastreador sem leitura', valor: vr(frota?.semLeitura), sub: `ativos há mais de ${LIMITE_GPS_DIAS} dias sem ler`, tom: '#ef4444', href: 'frotas-rastreadores', icone: '📉' }),
  ].join('');
}

/* ── Cartões de seção ── */
export const secao = (titulo, corpo, { href, acao } = {}) => `
  <div class="fd-card-title"><span class="dot"></span>${esc(titulo)}${href ? `<a class="fd-link fd-card-go" href="${panelUrl(href)}">${esc(acao || 'Abrir')} →</a>` : ''}</div>
  ${corpo}`;

const stat = ({ rotulo, valor, sub = '', tom = '', href }) => `
  <${href ? `a href="${panelUrl(href)}"` : 'div'} class="fd-stat${tom ? ` fd-tom-${tom}` : ''}${href ? ' fd-stat-link' : ''}">
    <span class="fd-stat-n">${valor}</span>
    <span class="fd-stat-l">${esc(rotulo)}</span>
    ${sub ? `<span class="fd-stat-s">${sub}</span>` : ''}
  </${href ? 'a' : 'div'}>`;

export function blocoManutencao({ manut, venc, estadoManut, estadoVenc, periodo, variacaoCusto }) {
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
    : `<div class="fd-stats">
        ${stat({ rotulo: 'Serviços vencidos', valor: valorOu(estadoVenc, venc?.vencidos), sub: venc ? `em ${fmtN(venc.veiculosVencidos)} veículo(s)` : '', tom: venc?.vencidos ? 'red' : '', href: 'frotas-manutencao-grupo' })}
        ${stat({ rotulo: 'Vencem em breve', valor: valorOu(estadoVenc, venc?.proximos), sub: 'próximos do km ou da data', tom: venc?.proximos ? 'amber' : '', href: 'frotas-manutencao-grupo' })}
      </div>`;
  const custo = estadoManut === 'erro' ? '' : `
      ${stat({ rotulo: 'Em aberto', valor: valorOu(estadoManut, m?.abertas), sub: m ? `${fmtN(m.urgentes)} alta/urgente` : '', tom: m?.urgentes ? 'amber' : '', href: 'frotas-manutencao-grupo' })}
      ${stat({ rotulo: `Custo · ${periodo.rotulo.toLowerCase()}`, valor: valorOu(estadoManut, m?.atual.custo, fmtBRL), sub: m ? `${fmtN(m.atual.qtd)} concluída(s) pagas pela empresa<br>${seloVariacao(variacaoCusto, { fmt: fmtBRL })}` : '', href: 'frotas-manutencao-grupo' })}`;
  return `${funil}<div class="fd-stats">${custo}</div>${vencimentos}`;
}

export function blocoMultas({ multas, estado }) {
  if (estado === 'erro') return blocoErro('multas');
  const m = multas;
  return `<div class="fd-stats">
    ${stat({ rotulo: 'Em aberto', valor: valorOu(estado, m?.abertas), sub: m ? `${fmtBRL(m.valor)} no total` : '', href: 'frotas-multas' })}
    ${stat({ rotulo: 'Sem condutor', valor: valorOu(estado, m?.semCondutor), sub: 'identificar quem dirigia', tom: m?.semCondutor ? 'red' : '', href: 'frotas-multas' })}
    ${stat({ rotulo: `Prazo em ${AVISO_MULTA_DIAS} dias`, valor: valorOu(estado, m?.prazoCurto), sub: 'defesa, indicação ou pagamento', tom: m?.prazoCurto ? 'red' : '', href: 'frotas-multas' })}
    ${stat({ rotulo: 'Condutor a notificar', valor: valorOu(estado, m?.aNotificar), sub: 'com condutor, sem aviso', tom: m?.aNotificar ? 'amber' : '', href: 'frotas-multas' })}
  </div>`;
}

export function blocoConduta({ excessos, foraHorario, pendentes, reinc, estado, estadoPendentes, periodo, truncado }) {
  const porPeriodo = (rotulo, r, href) => stat({
    rotulo: `${rotulo} · ${periodo.rotulo.toLowerCase()}`, valor: valorOu(estado, r?.atual),
    sub: r ? seloVariacao(r.variacao) : '', href,
  });
  const lista = estado === 'erro' ? blocoErro('conduta')
    : estado === 'carregando' ? `<div class="fd-vazio">${carregando}</div>`
      : reinc.length ? `<ul class="fd-rank">${reinc.map((r, i) => `
          <li><span class="fd-rank-pos">${i + 1}</span>
            <span class="fd-rank-nome" title="${esc(r.nome)}">${esc(r.nome)}<small>${esc(r.placas.join(', '))}</small></span>
            <span class="fd-rank-det">${r.excessos ? `${r.excessos} exc.${r.maxVel ? ` (até ${Math.round(r.maxVel)} km/h)` : ''}` : ''}${r.excessos && r.foraHorario ? ' · ' : ''}${r.foraHorario ? `${r.foraHorario} fora do horário` : ''}</span>
            <span class="fd-rank-n">${r.total}</span></li>`).join('')}</ul>`
        : '<div class="fd-vazio">Sem reincidência no período (ninguém com 2 ou mais registros).</div>';
  return `
    <div class="fd-stats">
      ${porPeriodo('Excessos de velocidade', excessos, 'frotas')}
      ${porPeriodo('Fora do horário', foraHorario, 'frotas')}
      ${stat({ rotulo: 'Excessos a notificar', valor: valorOu(estadoPendentes, pendentes) + (truncado ? '+' : ''), sub: 'pendentes na aba Notificação', tom: pendentes ? 'amber' : '', href: 'frotas' })}
    </div>
    <div class="fd-sub-t">Mais ocorrências no período</div>
    ${lista}`;
}

export function blocoCnh({ cnh, estado }) {
  if (estado === 'erro') return blocoErro('cnh');
  const lista = estado !== 'ok' ? '' : cnh.proximos.length
    ? `<ul class="fd-rank">${cnh.proximos.map((c) => `
        <li><span class="fd-rank-nome" title="${esc(c.nome)}">${esc(c.nome)}</span>
          <span class="fd-rank-det ${c.dias < 0 ? 'fd-txt-red' : 'fd-txt-amber'}">${c.dias < 0 ? `vencida há ${-c.dias} dia(s)` : c.dias === 0 ? 'vence hoje' : `vence em ${c.dias} dia(s)`}</span>
          <span class="fd-rank-n fd-rank-data">${fmtData(c.validade)}</span></li>`).join('')}</ul>`
    : '<div class="fd-vazio">Nenhuma CNH vencida ou perto de vencer.</div>';
  return `
    <div class="fd-stats">
      ${stat({ rotulo: 'Vencidas', valor: valorOu(estado, cnh?.vencidas), tom: cnh?.vencidas ? 'red' : '', href: 'frotas-motoristas' })}
      ${stat({ rotulo: 'Vencem em 30 dias', valor: valorOu(estado, cnh?.vencendo), tom: cnh?.vencendo ? 'amber' : '', href: 'frotas-motoristas' })}
      ${stat({ rotulo: 'Sem validade', valor: valorOu(estado, cnh?.semValidade), sub: 'cadastro incompleto', href: 'frotas-motoristas' })}
    </div>
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
