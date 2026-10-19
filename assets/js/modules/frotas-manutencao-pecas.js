// Frotas · Manutenção › Peças: catálogo de peças por modelo de veículo (Fiat Mobi, Renault Kwid, VW Gol...). Ele aprende sozinho
// quando uma manutenção é aprovada (marca/referência e valor das peças do orçamento escolhido); aqui dá para ver tudo agrupado
// por marca e modelo, cadastrar uma peça à mão, corrigir o valor ou remover. Na nova manutenção, as peças do modelo do veículo
// aparecem sob cada item para escolher a peça específica.
import { closeModal, confirmar, dinheiro, esc, openModal, toast } from '../core/ui.js';
import { cardFiltro } from './frotas-ui-lista.js?v=20261019-frotas-manut43';
import { ESTILOS_MANUTENCAO } from './frotas-manutencao-estilos.js?v=20261019-frotas-manut43';
import * as dados from './frotas-manutencao-dados.js?v=20261019-frotas-manut43';
import { modeloDoVeiculo, norm, numeroOuNulo, rotuloModelo } from './frotas-manutencao-regras.js?v=20261019-frotas-manut43';

(function () {
  const MODULE_NAME = 'FROTAS_MANUT_PECAS';
  const MODAL = 'fmPeca';
  const state = { supabase: null, root: null, pecas: [], veiculos: [], componentes: [], modelo: '', busca: '', ocupado: false };

  // Modelos da frota (ativos e em manutenção) com a quantidade de veículos; ordem: marca e modelo.
  function modelosDaFrota() {
    const mapa = new Map();
    for (const v of state.veiculos) {
      if (!['ATIVO', 'MANUTENCAO'].includes(String(v.status || '').toUpperCase())) continue;
      const chave = modeloDoVeiculo(v); if (!chave) continue;
      mapa.set(chave, (mapa.get(chave) || 0) + 1);
    }
    return mapa;
  }

  const fmtData = (d) => (d ? String(d).slice(0, 10).split('-').reverse().join('/') : '—');

  function visiveis() {
    const termo = norm(state.busca);
    return state.pecas.filter((p) => p.ativo !== false && (!state.modelo || p.modelo === state.modelo)
      && (!termo || norm([p.componente, p.detalhe, p.modelo, p.observacoes].join(' ')).includes(termo)));
  }

  function render() {
    const root = state.root; if (!root) return;
    const frota = modelosDaFrota();
    const lista = visiveis();
    const porModelo = new Map();
    for (const p of lista) { if (!porModelo.has(p.modelo)) porModelo.set(p.modelo, []); porModelo.get(p.modelo).push(p); }
    const modelosComPeca = new Set(state.pecas.filter((p) => p.ativo !== false).map((p) => p.modelo));
    const semPeca = [...frota.keys()].filter((m) => !modelosComPeca.has(m)).sort();
    root.querySelector('[data-kpis]').innerHTML = [
      cardFiltro({ tone: 'blue', icone: 'total', label: 'Peças cadastradas', valor: String(state.pecas.filter((p) => p.ativo !== false).length) }),
      cardFiltro({ tone: 'green', icone: 'ok', label: 'Modelos com peças', valor: String(modelosComPeca.size) }),
      cardFiltro({ tone: 'amber', icone: 'relogio', label: 'Modelos da frota sem peças', valor: String(semPeca.length) }),
    ].join('');
    const select = root.querySelector('[data-f-modelo]');
    const todos = [...new Set([...modelosComPeca, ...frota.keys()])].sort();
    select.innerHTML = '<option value="">Todos os modelos</option>' + todos.map((m) => `<option value="${esc(m)}"${m === state.modelo ? ' selected' : ''}>${esc(rotuloModelo(m))}${frota.has(m) ? ` (${frota.get(m)})` : ''}</option>`).join('');
    const blocos = [...porModelo.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([modelo, ps]) => `<div class="fm-sec fm-pecas-modelo">
      <h4><span>${esc(rotuloModelo(modelo))}</span><span class="fm-mm" style="margin:0">${frota.has(modelo) ? `${frota.get(modelo)} veículo(s) · ` : ''}${ps.length} peça(s)</span></h4>
      <div class="fm-table-wrap"><table class="fm-table" style="min-width:760px"><thead><tr><th>Item do guia</th><th>Marca / referência</th><th>Último valor</th><th>Última compra</th><th>Usos</th><th></th></tr></thead><tbody>${ps.map((p) => `<tr>
        <td>${esc(p.componente)}</td><td><strong>${esc(p.detalhe)}</strong>${p.observacoes ? `<span class="fm-mm">${esc(p.observacoes)}</span>` : ''}</td>
        <td>${p.ultimo_valor != null ? esc(dinheiro(p.ultimo_valor)) : '—'}</td><td>${esc(fmtData(p.ultima_data))}</td><td>${Number(p.usos || 0)}</td>
        <td style="white-space:nowrap"><button class="fm-btn ghost fm-mini" type="button" data-editar="${esc(p.id)}">Editar</button> <button class="fm-btn danger fm-mini" type="button" data-remover="${esc(p.id)}">Remover</button></td></tr>`).join('')}</tbody></table></div></div>`).join('');
    const vazio = !lista.length
      ? `<div class="fm-nota">${state.pecas.length ? 'Nenhuma peça neste filtro.' : 'Ainda não há peças cadastradas. Elas entram sozinhas quando uma manutenção é aprovada com marca e valor nas linhas do orçamento; também dá para cadastrar uma peça à mão em "+ Peça".'}</div>` : '';
    const semPecaHtml = semPeca.length && !state.modelo && !state.busca
      ? `<div class="fm-sec"><h4>Modelos da frota sem peças cadastradas</h4><div class="fm-chips">${semPeca.map((m) => `<span class="fm-badge blue">${esc(rotuloModelo(m))} · ${frota.get(m)}</span>`).join('')}</div></div>` : '';
    root.querySelector('[data-corpo]').innerHTML = blocos + vazio + semPecaHtml;
    root.querySelector('[data-contagem]').textContent = `${lista.length} peça(s) em ${porModelo.size} modelo(s)`;
  }

  function formHtml(p = {}) {
    const frota = modelosDaFrota();
    const modelos = [...new Set([...frota.keys(), ...(p.modelo ? [p.modelo] : [])])].sort();
    const nomes = [...new Set(state.componentes.filter((c) => c.tipo !== 'servico').map((c) => c.nome))];
    return `<div class="fm-mod-head"><div><h3>${p.id ? 'Editar peça' : 'Nova peça'}</h3><p>A peça fica no catálogo do modelo e é sugerida em novas manutenções dos veículos desse modelo.</p></div><button class="fm-x" type="button" data-acao="fechar" aria-label="Fechar">✕</button></div>
      <div class="fm-form" style="margin-top:14px">
        <div class="fm-field" style="grid-column:span 2"><label>Modelo</label><select class="fm-select" data-f="modelo"><option value="">Selecione...</option>${modelos.map((m) => `<option value="${esc(m)}"${m === p.modelo ? ' selected' : ''}>${esc(rotuloModelo(m))}${frota.has(m) ? ` (${frota.get(m)} veículos)` : ''}</option>`).join('')}</select></div>
        <div class="fm-field" style="grid-column:span 2"><label>Item do guia</label><input class="fm-input" list="fmPecaItens" data-f="componente" maxlength="160" placeholder="Digite para buscar (ex.: Kit de embreagem)" value="${esc(p.componente || '')}"><datalist id="fmPecaItens">${nomes.map((n) => `<option value="${esc(n)}"></option>`).join('')}</datalist></div>
        <div class="fm-field" style="grid-column:span 2"><label>Marca / referência</label><input class="fm-input" data-f="detalhe" maxlength="160" placeholder="Ex.: LUK 620 3xxx" value="${esc(p.detalhe || '')}"></div>
        <div class="fm-field"><label>Último valor (R$)</label><input class="fm-input" type="number" step="0.01" min="0" data-f="ultimo_valor" value="${p.ultimo_valor ?? ''}"></div>
        <div class="fm-field"><label>Última compra</label><input class="fm-input" type="date" data-f="ultima_data" value="${esc(p.ultima_data || '')}"></div>
        <div class="fm-field full"><label>Observações (motor, ano, versão)</label><textarea data-f="observacoes">${esc(p.observacoes || '')}</textarea></div></div>
      <div data-erros></div><div class="fm-acoes"><button class="fm-btn ghost" type="button" data-acao="fechar">Cancelar</button><button class="fm-btn primary" type="button" data-acao="salvar" data-id="${esc(p.id || '')}">Salvar peça</button></div>`;
  }

  function abrirForm(p) {
    const ov = openModal({ id: MODAL, conteudoHtml: formHtml(p || {}) });
    ov.classList.add('fm-mod');
    ov.addEventListener('click', async (e) => {
      const alvo = e.target.closest('[data-acao]'); if (!alvo) return;
      if (alvo.dataset.acao === 'fechar') return closeModal(MODAL);
      if (alvo.dataset.acao !== 'salvar' || state.ocupado) return;
      const f = (k) => (ov.querySelector(`[data-f="${k}"]`)?.value ?? '').trim();
      const erros = [];
      if (!f('modelo')) erros.push('Escolha o modelo.');
      if (!f('componente')) erros.push('Informe o item do guia (ex.: Kit de embreagem).');
      if (!f('detalhe')) erros.push('Informe a marca ou referência da peça.');
      if (erros.length) { ov.querySelector('[data-erros]').innerHTML = `<ul class="fm-erros">${erros.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`; return; }
      state.ocupado = true;
      try {
        await dados.salvarPeca(state.supabase, {
          id: alvo.dataset.id || undefined, modelo: f('modelo'), componente: f('componente'), detalhe: f('detalhe'),
          ultimo_valor: numeroOuNulo(f('ultimo_valor')), ultima_data: f('ultima_data') || null, observacoes: f('observacoes') || null,
          ...(alvo.dataset.id ? {} : { usos: 0 }),
        });
        closeModal(MODAL); toast('Peça salva.');
        state.pecas = await dados.carregarPecas(state.supabase); render();
      } catch (err) {
        ov.querySelector('[data-erros]').innerHTML = `<ul class="fm-erros"><li>${esc(err.message)}</li></ul>`;
      } finally { state.ocupado = false; }
    });
  }

  async function carregar() {
    const base = await dados.carregarBase(state.supabase);
    state.veiculos = base.veiculos; state.componentes = base.componentes; state.pecas = base.pecas;
    render();
  }

  async function openHome(container, opts = {}) {
    state.supabase = opts.supabase; state.root = container;
    container.innerHTML = `${ESTILOS_MANUTENCAO}<section class="fm-shell">
      <div class="fm-topo"><div class="fm-head-actions"><button class="fm-btn soft" type="button" data-acao="atualizar">↻ Atualizar</button><button class="fm-btn primary" type="button" data-acao="nova">+ Peça</button></div></div>
      <div class="fm-kpis" data-kpis></div>
      <div class="fm-card"><div class="fm-body">
        <div class="fm-bar"><div class="fm-search"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg><input class="fm-input" placeholder="Buscar peça, marca, referência ou modelo..." data-busca></div>
        <select class="fm-select" data-f-modelo style="width:auto"></select><span class="fm-count" data-contagem></span></div>
        <div data-corpo><div class="fm-empty">Carregando peças...</div></div>
        <div class="fm-nota">As peças entram sozinhas quando uma manutenção é aprovada: o que estiver com marca/referência nas linhas do orçamento escolhido é salvo no catálogo do modelo, com o valor pago. Na nova manutenção, as peças do modelo do veículo aparecem sob cada item.</div>
      </div></div></section>`;
    container.querySelector('[data-acao="nova"]').addEventListener('click', () => abrirForm());
    container.querySelector('[data-acao="atualizar"]').addEventListener('click', () => carregar().catch((err) => toast(err.message, 'err')));
    container.querySelector('[data-busca]').addEventListener('input', (e) => { state.busca = e.target.value; render(); });
    container.querySelector('[data-f-modelo]').addEventListener('change', (e) => { state.modelo = e.target.value; render(); });
    container.querySelector('[data-corpo]').addEventListener('click', async (e) => {
      const ed = e.target.closest('[data-editar]'); const rm = e.target.closest('[data-remover]');
      if (ed) return abrirForm(state.pecas.find((p) => p.id === ed.dataset.editar));
      if (rm) {
        const p = state.pecas.find((x) => x.id === rm.dataset.remover); if (!p) return;
        if (!(await confirmar({ titulo: 'Remover peça', mensagem: `${p.componente} · ${p.detalhe} (${rotuloModelo(p.modelo)})`, confirmarLabel: 'Remover' }))) return;
        try { await dados.removerPeca(state.supabase, p.id); toast('Peça removida.'); state.pecas = await dados.carregarPecas(state.supabase); render(); } catch (err) { toast(err.message, 'err'); }
      }
    });
    try { await carregar(); } catch (err) { toast(err.message || 'Erro ao carregar as peças.', 'err'); }
  }

  window[MODULE_NAME] = window[MODULE_NAME] || {};
  window[MODULE_NAME].openHome = openHome;
})();
