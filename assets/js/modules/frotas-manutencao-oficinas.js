// Frotas · Manutenção › Oficinas: cadastro de oficinas/fornecedores (CNPJ, PIX, contato). O orçamento aponta para
// a oficina; o CNPJ alimenta a nota fiscal e o pagamento sem redigitar.
import { closeModal, esc, openModal, toast } from '../core/ui.js';
import { cardFiltro, ligarCards, sincronizarCards } from './frotas-ui-lista.js?v=20261029-frotas-manut55';
import { ESTILOS_MANUTENCAO } from './frotas-manutencao-estilos.js?v=20261029-frotas-manut55';
import * as dados from './frotas-manutencao-dados.js?v=20261029-frotas-manut55';
import { norm } from './frotas-manutencao-regras.js?v=20261029-frotas-manut55';

(function () {
  const MODULE_NAME = 'FROTAS_MANUT_OFICINAS';
  const MODAL = 'fmOficina';
  const LIMITE_LINHAS = 200; // o cadastro tem milhares de fornecedores do GRM: a tabela mostra as primeiras e a busca acha o resto
  const state = { supabase: null, root: null, lista: [], filtro: 'ativas', busca: '', ocupado: false };

  const fmtDoc = (d) => {
    const s = String(d || '');
    if (s.length === 14) return s.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
    if (s.length === 11) return s.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
    return s;
  };

  function visiveis() {
    const termo = norm(state.busca);
    return state.lista.filter((o) => (state.filtro === 'todas' || (state.filtro === 'ativas') === (o.ativo !== false))
      && (!termo || norm([o.nome, o.razao_social, o.cnpj, o.contato_nome, o.telefone, o.cidade_uf].join(' ')).includes(termo)));
  }

  function render() {
    const root = state.root; if (!root) return;
    const ativas = state.lista.filter((o) => o.ativo !== false).length;
    root.querySelector('[data-kpis]').innerHTML = [
      cardFiltro({ filtro: 'ativas', tone: 'green', icone: 'ok', label: 'Ativas', valor: String(ativas), ativo: state.filtro === 'ativas' }),
      cardFiltro({ filtro: 'inativas', tone: 'red', icone: 'erro', label: 'Inativas', valor: String(state.lista.length - ativas), ativo: state.filtro === 'inativas' }),
      cardFiltro({ filtro: 'todas', tone: 'blue', icone: 'total', label: 'Todas', valor: String(state.lista.length), ativo: state.filtro === 'todas' }),
    ].join('');
    sincronizarCards(root, state.filtro);
    const lista = visiveis();
    const mostradas = lista.slice(0, LIMITE_LINHAS);
    root.querySelector('[data-linhas]').innerHTML = lista.length ? mostradas.map((o) => `<tr class="fm-linha" data-editar="${esc(o.id)}">
      <td><strong>${esc(o.nome)}</strong><span class="fm-mm">${esc(o.razao_social || '')}</span></td>
      <td>${esc(fmtDoc(o.cnpj)) || '—'}</td>
      <td>${esc(o.contato_nome || '—')}<span class="fm-mm">${esc(o.telefone || '')}${o.email ? ` · ${esc(o.email)}` : ''}</span></td>
      <td>${esc(o.cidade_uf || '—')}</td>
      <td>${o.pix_chave ? esc(o.pix_chave) : '—'}${o.banco ? `<span class="fm-mm">${esc(o.banco)}</span>` : ''}</td>
      <td><span class="fm-badge ${o.ativo !== false ? 'green' : 'red'}">${o.ativo !== false ? 'Ativa' : 'Inativa'}</span></td>
      <td><button class="fm-btn ghost fm-mini" type="button" data-editar="${esc(o.id)}">Editar</button></td></tr>`).join('')
      : '<tr><td colspan="7" class="fm-empty">Nenhuma oficina neste filtro.</td></tr>';
    root.querySelector('[data-contagem]').textContent = lista.length > LIMITE_LINHAS ? `${LIMITE_LINHAS} de ${lista.length} oficina(s): refine a busca` : `${lista.length} de ${state.lista.length} oficina(s)`;
  }

  function formHtml(o = {}) {
    const campo = (rotulo, nome, extra = '', tipo = 'text') => `<div class="fm-field ${extra}"><label>${rotulo}</label><input class="fm-input" type="${tipo}" data-f="${nome}" value="${esc(o[nome] || '')}"></div>`;
    return `<div class="fm-mod-head"><div><h3>${o.id ? 'Editar oficina' : 'Nova oficina'}</h3><p>O CNPJ (ou CPF, para mecânico autônomo) é único e é usado para achar o fornecedor no lançamento da nota fiscal.</p></div><button class="fm-x" type="button" data-acao="fechar" aria-label="Fechar">✕</button></div>
      <div class="fm-form" style="margin-top:14px">${campo('Nome fantasia', 'nome', 'full')}${campo('Razão social', 'razao_social', 'full')}${campo('CNPJ / CPF', 'cnpj')}${campo('Telefone / WhatsApp', 'telefone')}${campo('Contato', 'contato_nome')}${campo('E-mail', 'email', '', 'email')}${campo('Chave PIX', 'pix_chave')}${campo('Banco', 'banco')}${campo('Cidade / UF', 'cidade_uf')}
      <div class="fm-field"><label>Situação</label><label class="fm-check"><input type="checkbox" data-f="ativo"${o.ativo === false ? '' : ' checked'}> Ativa</label></div>
      <div class="fm-field full"><label>Observações</label><textarea data-f="observacoes">${esc(o.observacoes || '')}</textarea></div></div>
      <div data-erros></div><div class="fm-acoes"><button class="fm-btn ghost" type="button" data-acao="fechar">Cancelar</button><button class="fm-btn primary" type="button" data-acao="salvar" data-id="${esc(o.id || '')}">Salvar oficina</button></div>`;
  }

  function abrirForm(o) {
    const ov = openModal({ id: MODAL, conteudoHtml: formHtml(o || {}) });
    ov.classList.add('fm-mod');
    ov.addEventListener('click', async (e) => {
      const a = e.target.closest('[data-acao]'); if (!a) return;
      if (a.dataset.acao === 'fechar') return closeModal(MODAL);
      if (a.dataset.acao !== 'salvar' || state.ocupado) return;
      const f = (n) => ov.querySelector(`[data-f="${n}"]`);
      const texto = (n) => f(n).value.trim() || null;
      const nome = texto('nome');
      if (!nome) { ov.querySelector('[data-erros]').innerHTML = '<ul class="fm-erros"><li>Informe o nome da oficina.</li></ul>'; return; }
      state.ocupado = true;
      try {
        const salvo = await dados.salvarOficina(state.supabase, {
          id: a.dataset.id || undefined, nome, razao_social: texto('razao_social'), cnpj: texto('cnpj'), telefone: texto('telefone'),
          contato_nome: texto('contato_nome'), email: texto('email'), pix_chave: texto('pix_chave'), banco: texto('banco'),
          cidade_uf: texto('cidade_uf'), observacoes: texto('observacoes'), ativo: f('ativo').checked,
        });
        const i = state.lista.findIndex((x) => x.id === salvo.id);
        if (i >= 0) state.lista[i] = salvo; else state.lista.push(salvo);
        state.lista.sort((x, y) => x.nome.localeCompare(y.nome, 'pt-BR'));
        closeModal(MODAL); toast('Oficina salva.'); render();
      } catch (err) {
        ov.querySelector('[data-erros]').innerHTML = `<ul class="fm-erros"><li>${esc(err.message || 'Erro ao salvar.')}</li></ul>`;
      } finally { state.ocupado = false; }
    });
  }

  async function carregar() {
    try {
      state.lista = await dados.carregarOficinasTodas(state.supabase);
    } catch (err) { toast(err.message || 'Erro ao carregar as oficinas.', 'err'); state.lista = []; }
    render();
  }

  async function openHome(container, opts = {}) {
    state.supabase = opts.supabase; state.root = container;
    container.innerHTML = `${ESTILOS_MANUTENCAO}<section class="fm-shell">
      <div class="fm-topo"><div class="fm-head-actions"><button class="fm-btn primary" type="button" data-nova>+ Nova oficina</button></div></div>
      <div class="fm-kpis" data-kpis></div>
      <div class="fm-card"><div class="fm-body"><div class="fm-bar"><div class="fm-search"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg><input class="fm-input" placeholder="Buscar por nome, CNPJ, contato, cidade..." data-busca></div><span data-chip></span><span class="fm-count" data-contagem></span></div>
      <div class="fm-table-wrap"><table class="fm-table" style="min-width:860px"><thead><tr><th>Oficina</th><th>CNPJ / CPF</th><th>Contato</th><th>Cidade</th><th>PIX / banco</th><th>Situação</th><th></th></tr></thead><tbody data-linhas></tbody></table></div></div></div></section>`;
    container.querySelector('[data-nova]').addEventListener('click', () => abrirForm());
    container.querySelector('[data-busca]').addEventListener('input', (e) => { state.busca = e.target.value; render(); });
    container.querySelector('[data-linhas]').addEventListener('click', (e) => {
      const b = e.target.closest('[data-editar]'); if (b) abrirForm(state.lista.find((o) => o.id === b.dataset.editar));
    });
    ligarCards(container, { obter: () => state.filtro, definir: (f) => { state.filtro = f; }, aoMudar: render });
    await carregar();
  }

  window[MODULE_NAME] = window[MODULE_NAME] || {};
  window[MODULE_NAME].openHome = openHome;
})();
