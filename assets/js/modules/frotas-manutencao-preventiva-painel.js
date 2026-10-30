// Frotas · Manutenção › Preventiva: janela do veículo — ícones dos grupos do guia, serviços de cada grupo, seleção, registros feitos e as
// ações (registrar, solicitar, completar pagamento). Fábrica que recebe o contexto da lista (estado e ações comuns).
import { closeModal, dataBR, esc, openModal } from '../core/ui.js';
import * as dados from './frotas-manutencao-dados.js?v=20261030-frotas-aprovar';
import { filtrarServicos, grupoDoServico, gruposDoPainel, pendenciasDoRegistro, pendentesDoVeiculo } from './frotas-manutencao-preventiva-regras.js?v=20261030-frotas-aprovar';
import { fmtKm, htmlCardServico } from './frotas-manutencao-preventiva-cards.js?v=20261030-frotas-aprovar';
import { htmlIconeGrupo } from './frotas-manutencao-seletor.js?v=20261030-frotas-aprovar';

export function criarPainel(ctx) {
  const { state, veiculoCompleto, carregar, abrirSolicitacao } = ctx;
  const PAINEL = 'fmPreventivaPainel';

  // ---------- painel lateral do veículo ----------
  // Preventivas já registradas do veículo, com a situação do pagamento e o botão para lançar/completar (Pagamento e NF).
  function htmlRegistros() {
    const regs = state.painelRegistros || [];
    if (!regs.length) return '';
    const sit = regs.map(pendenciasDoRegistro);
    const pedeAtencao = sit.filter((x) => x.id === 'pendente').length;
    return `<details class="fm-prev-grupo"${pedeAtencao ? ' open' : ''}><summary><span>Registros feitos</span><span class="fm-badge">${regs.length}</span>${pedeAtencao ? `<span class="fm-badge amber">${pedeAtencao} com pendência</span>` : ''}</summary>
      ${regs.map((r, i) => `<div class="fm-reg"><div class="fm-reg-main"><strong>${esc(r.data_execucao ? dataBR(r.data_execucao) : '—')} · ${esc(fmtKm(r.km_execucao))}</strong><span class="fm-mm">${esc(String(r.descricao || '').replace(/^Preventiva registrada: /, '') || 'Preventiva')}</span>
        <span class="fm-faltas">${sit[i].itens.length ? sit[i].itens.map((x) => `<span class="fm-badge amber">${esc(x.texto)}</span>`).join('') : `<span class="fm-badge ${sit[i].tom}">${esc(sit[i].texto)}</span>`}</span></div>
        <div class="fm-reg-fim"><button class="fm-btn ${sit[i].id === 'pendente' ? 'primary' : 'soft'} fm-mini" type="button" data-pagamento="${esc(r.id)}">${sit[i].id === 'pendente' ? 'Completar' : 'Pagamento e NF'}</button></div></div>`).join('')}</details>`;
  }

  function renderPainel() {
    const ov = document.getElementById(PAINEL); if (!ov || !state.painelVeiculo) return;
    const v = veiculoCompleto(state.painelVeiculo);
    const corpo = ov.querySelector('[data-painel]');
    if (!v) { corpo.innerHTML = '<div class="fm-empty">Veículo não encontrado.</div>'; return; }
    const exibidos = v.servicos; // serviços e verificações: tudo entra, agrupado pelo sistema
    const cont = (st) => exibidos.filter((s) => s.status === st).length;
    const pend = pendentesDoVeiculo({ servicos: exibidos }, 'todos');
    corpo.innerHTML = `<div class="fm-orc-cab"><div class="fm-mod-head"><div><h3>${esc(v.placa)}</h3><p>${esc(v.marca_modelo || '')}${v.coordenacao ? ` · ${esc(v.coordenacao)}` : ''} · Km atual ${esc(fmtKm(v.hodometro))}</p></div><button class="fm-x" type="button" data-fechar-painel aria-label="Fechar">✕</button></div>
      <div class="fm-pvl-chips" style="margin:10px 0 0">${cont('vencida') ? `<span class="fm-badge red">${cont('vencida')} vencida(s)</span>` : ''}${cont('proxima') ? `<span class="fm-badge amber">${cont('proxima')} próxima(s)</span>` : ''}${cont('em_dia') ? `<span class="fm-badge green">${cont('em_dia')} em dia</span>` : ''}${cont('sem_historico') ? `<span class="fm-badge blue">${cont('sem_historico')} sem histórico</span>` : ''}</div></div>
      <div class="fm-nova-corpo">
        <div class="fm-sel-acoes"><span class="fm-mm">Escolha o grupo e toque nos serviços feitos; depois use Registrar.</span><button type="button" class="fm-link" data-sel-limpar>Limpar seleção</button></div>
        <div class="fm-pick-grade" data-grupos-prev aria-label="Grupos do guia"></div>
        <div class="fm-prev-grupo" data-grupo-aberto hidden></div>
        ${htmlRegistros()}
      </div>
      <div class="fm-nova-rodape"><div class="fm-nova-info"></div><div class="fm-nova-acoes"><button class="fm-btn primary" type="button" data-reg-painel>+ Registrar</button>${pend.length ? `<button class="fm-btn ghost" type="button" data-sol-painel${state.ocupado ? ' disabled' : ''}>Solicitar (${pend.length})</button>` : ''}</div></div>`;
    renderGrupos();
  }

  // Serviços do painel: todos os do veículo (verificações só quando ligadas ou já marcadas) ou só os do grupo aberto.
  function servicosDoPainel(soGrupo = false) {
    const v = veiculoCompleto(state.painelVeiculo);
    const lista = v ? filtrarServicos(v.servicos, { verificacoes: true, selecionados: state.painelSelecionados }) : [];
    return soGrupo && state.painelGrupo != null ? lista.filter((s) => grupoDoServico(s, { categorias: state.categorias }) === state.painelGrupo) : lista;
  }

  function atualizarBotaoRegistrar() {
    const botao = document.querySelector(`#${PAINEL} [data-reg-painel]`); if (!botao) return;
    const n = state.painelSelecionados.size;
    botao.textContent = n ? `+ Registrar (${n})` : '+ Registrar';
  }

  const ICONE_PENDENTES = '<span class="fm-pick-ic" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false"><path d="M3 6l1.5 1.5L7 5M3 12l1.5 1.5L7 11M3 18l1.5 1.5L7 17M11 6h10M11 12h10M11 18h10"/></svg></span>';

  // Grade de ícones dos grupos (como na Corretiva): clicar abre os serviços do grupo abaixo, clicar de novo fecha, outro ícone troca.
  function renderGrupos() {
    const grade = document.querySelector(`#${PAINEL} [data-grupos-prev]`); if (!grade) return;
    const grupos = gruposDoPainel(servicosDoPainel(), { categorias: state.categorias, grupos: state.grupos });
    if (state.painelGrupo != null && !grupos.some((g) => g.codigo === state.painelGrupo)) state.painelGrupo = null;
    const marcadosDe = (cod) => servicosDoPainel().filter((x) => grupoDoServico(x, { categorias: state.categorias }) === cod && state.painelSelecionados.has(x.plano_id)).length;
    grade.innerHTML = grupos.length ? grupos.map((g) => {
      const n = marcadosDe(g.codigo);
      const aberto = state.painelGrupo === g.codigo;
      return `<div class="fm-pick-gr pg-${esc(g.status)}${aberto ? ' aberto' : ''}${n ? ' tem' : ''}" data-pgr="${g.codigo}"><button type="button" class="fm-pick-gt" data-pgrupo="${g.codigo}" aria-expanded="${aberto}" title="${esc(g.nome)} · ${g.total} serviço(s)" aria-label="${esc(g.nome)}">${htmlIconeGrupo(g.codigo)}<b>${n || ''}</b></button></div>`;
    }).join('') : '<div class="fm-empty">Nenhum serviço neste veículo.</div>';
    // Ícone próprio ao lado dos grupos: marca de uma vez as vencidas e próximas (sem outra solicitação em andamento).
    const pendentes = servicosDoPainel().filter((x) => ['vencida', 'proxima'].includes(x.status) && !x.em_andamento);
    if (grupos.length) {
      grade.insertAdjacentHTML('beforeend', `<div class="fm-pick-gr fm-pick-sel${pendentes.length ? ' tem' : ''}"><button type="button" class="fm-pick-gt" data-sel-pendentes${pendentes.length ? '' : ' disabled'} title="${pendentes.length ? `Selecionar as ${pendentes.length} vencidas e próximas` : 'Nenhum serviço vencido ou próximo'}" aria-label="Selecionar vencidas e próximas">${ICONE_PENDENTES}<b>${pendentes.length || ''}</b></button></div>`);
    }
    renderCards();
  }

  function renderCards() {
    const caixa = document.querySelector(`#${PAINEL} [data-grupo-aberto]`);
    if (caixa) {
      const g = state.painelGrupo != null ? gruposDoPainel(servicosDoPainel(), { categorias: state.categorias, grupos: state.grupos }).find((x) => x.codigo === state.painelGrupo) : null;
      caixa.hidden = !g;
      if (g) {
        const lista = servicosDoPainel(true);
        caixa.innerHTML = `<div class="fm-pick-gc-cab">${htmlIconeGrupo(g.codigo)}<strong>${esc(g.nome)}</strong><span class="fm-mm">${lista.length} serviço(s)</span></div><div class="fm-svc-grid" data-cards>${lista.map((s) => htmlCardServico(s, state.planos.get(s.plano_id) || {}, state.painelSelecionados.has(s.plano_id))).join('')}</div>`;
      } else caixa.innerHTML = '';
    }
    atualizarBotaoRegistrar();
  }

  // Contadores dos ícones (serviços marcados por grupo) sem refazer a janela.
  function atualizarContadores() {
    for (const gr of document.querySelectorAll(`#${PAINEL} [data-pgr]`)) {
      const cod = Number(gr.dataset.pgr);
      const n = servicosDoPainel().filter((x) => grupoDoServico(x, { categorias: state.categorias }) === cod && state.painelSelecionados.has(x.plano_id)).length;
      gr.classList.toggle('tem', n > 0);
      gr.querySelector('b').textContent = n || '';
    }
    atualizarBotaoRegistrar();
  }

  async function carregarRegistros(veiculoId) {
    try { state.painelRegistros = await dados.carregarRegistrosPreventivos(state.supabase, veiculoId); } catch { state.painelRegistros = []; }
    if (state.painelVeiculo === veiculoId) renderPainel();
  }

  async function abrirPagamentoDe(veiculoId, registroId) {
    const registro = (state.painelRegistros || []).find((r) => r.id === registroId); if (!registro) return;
    const { abrirPagamento } = await import('./frotas-manutencao-preventiva-pagamento.js?v=20261030-frotas-aprovar');
    await abrirPagamento({ supabase: state.supabase, registro, placa: veiculoCompleto(veiculoId)?.placa || '', aoConcluir: async () => { await carregar(); await carregarRegistros(veiculoId); } });
  }

  function abrirPainel(veiculoId) {
    state.painelVeiculo = veiculoId; state.painelRegistros = null; state.painelSelecionados = new Set(); state.painelGrupo = null;
    const ov = openModal({ id: PAINEL, conteudoHtml: '<div data-painel></div>', aoFechar: () => { state.painelVeiculo = null; } });
    ov.classList.add('fm-mod', 'fm-modal-largo', 'fm-modal-orc');
    renderPainel(); carregarRegistros(veiculoId);
    ov.addEventListener('click', (e) => {
      if (e.target === ov || e.target.closest('[data-fechar-painel]')) return closeModal(PAINEL);
      const gr = e.target.closest('[data-pgrupo]');
      if (gr) {
        const cod = Number(gr.dataset.pgrupo);
        state.painelGrupo = state.painelGrupo === cod ? null : cod; // segundo clique fecha; outro ícone troca
        renderGrupos();
        document.querySelector(`#${PAINEL} [data-pgr="${cod}"] [data-pgrupo]`)?.focus({ preventScroll: true });
        return;
      }
      const card = e.target.closest('[data-card]');
      if (card) {
        const id = card.dataset.card; const marcado = !state.painelSelecionados.has(id);
        if (marcado) state.painelSelecionados.add(id); else state.painelSelecionados.delete(id);
        card.classList.toggle('sel', marcado); card.setAttribute('aria-pressed', marcado ? 'true' : 'false'); atualizarContadores();
        return;
      }
      if (e.target.closest('[data-sel-pendentes]')) {
        servicosDoPainel().filter((s) => ['vencida', 'proxima'].includes(s.status) && !s.em_andamento).forEach((s) => state.painelSelecionados.add(s.plano_id));
        return renderGrupos();
      }
      if (e.target.closest('[data-sel-limpar]')) { state.painelSelecionados.clear(); return renderGrupos(); }
      const pag = e.target.closest('[data-pagamento]'); if (pag) return abrirPagamentoDe(veiculoId, pag.dataset.pagamento);
      if (e.target.closest('[data-reg-painel]')) return registrar(veiculoId, [...state.painelSelecionados]);
      if (e.target.closest('[data-sol-painel]')) abrirSolicitacao(veiculoId);
    });
  }

  async function registrar(veiculoId, planosIniciais = []) {
    const v = veiculoCompleto(veiculoId); if (!v) return;
    const { abrirRegistro } = await import('./frotas-manutencao-preventiva-registro.js?v=20261030-frotas-aprovar');
    await abrirRegistro({ supabase: state.supabase, veiculo: v, planos: state.planos, planosIniciais, aoConcluir: async () => { state.painelSelecionados = new Set(); await carregar(); if (state.painelVeiculo === veiculoId) await carregarRegistros(veiculoId); } });
  }

  return { abrirPainel, renderPainel };
}
