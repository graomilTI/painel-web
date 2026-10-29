// Frotas · Manutenção › Corretiva: janela de nova solicitação (veículo, problema e itens pelo seletor de grupos do guia).
import { closeModal, esc, openModal, toast } from '../core/ui.js';
import * as dados from './frotas-manutencao-dados.js?v=20261029-frotas-inst87';
import { modeloDoVeiculo, normalizarPlaca, pecasDoModelo, rotuloModelo, validarSolicitacao } from './frotas-manutencao-regras.js?v=20261029-frotas-inst87';
import { htmlErros, htmlFormNova } from './frotas-manutencao-html.js?v=20261029-frotas-inst87';
import { carregarCidades, cidadesDaUf, htmlOpcoesCidade } from './frotas-manutencao-cidades.js?v=20261029-frotas-inst87';
import { criarSeletor } from './frotas-manutencao-seletor.js?v=20261029-frotas-inst87';
import { sugerirItens } from './frotas-manutencao-sugestoes.js?v=20261029-frotas-inst87';

export function criarNova(ctx) {
  const { state, recarregarUma, renderLista, val } = ctx;
  const NOVA = 'fmNova';

  // ---------- nova solicitação (janela larga, como a nova solicitação de Compras) ----------
  function abrirNova(preset = {}) {
    state.formAcao = null;
    const ov = openModal({ id: NOVA, conteudoHtml: htmlFormNova(state.base, preset) });
    ov.classList.add('fm-mod', 'fm-modal-largo');
    ov.dataset.origem = preset.origem || 'manual';
    ov.dataset.checklist = preset.checklist_id || '';
    ov.addEventListener('click', aoClicarNova);
    ov.addEventListener('change', () => ov.__pendencias?.());
    ov.addEventListener('input', () => ov.__pendencias?.());
    // Seletor de itens em dois painéis (grupos | itens do grupo); a leitura fica guardada na própria janela.
    ov.__seletor = criarSeletor(ov.querySelector('[data-seletor-corpo]'), state.base, { resumo: ov.querySelector('[data-pick-resumo]'), aoMudar: () => ov.__pendencias?.() });
    // Peças já usadas no modelo do veículo escolhido (Mobi, Argo, Kwid...): aparecem sob cada item para escolher a peça específica.
    const atualizarPecas = () => {
      const modelo = modeloDoVeiculo(veiculoDaDigitacao(val(ov, '[data-n-veiculo]')) || '');
      ov.__seletor.setPecas(pecasDoModelo(state.base.pecas, modelo), rotuloModelo(modelo));
    };
    // Sugestões a partir do que foi escrito no problema: chips de um clique (o que já está marcado some da lista).
    const caixaSug = ov.querySelector('[data-sugestoes]');
    const atualizarSugestoes = () => {
      const sug = sugerirItens(state.base, val(ov, '[data-n-descricao]'));
      const itens = sug.itens.filter((i) => !ov.__seletor.estaMarcado(i.grupo, i.nome));
      caixaSug.hidden = !itens.length && !sug.grupos.length;
      caixaSug.innerHTML = caixaSug.hidden ? '' : `<span class="fm-sug-t">Sugestões pela descrição</span>${itens.map((i) => `<button type="button" data-sug-item data-grupo="${i.grupo}" data-nome="${esc(i.nome)}" title="Marcar ${esc(i.nome)}">+ ${esc(i.nome)}<small>${esc(i.grupoNome)}</small></button>`).join('')}${sug.grupos.map((g) => `<button type="button" class="fm-sug-grupo" data-sug-grupo="${g.codigo}" title="Abrir o grupo para escolher os itens">Ver ${esc(g.nome)}</button>`).join('')}${itens.length > 1 ? '<button type="button" class="fm-sug-todas" data-sug-todas>Marcar sugeridas</button>' : ''}`;
      caixaSug.__itens = itens;
    };
    caixaSug.addEventListener('click', (e) => {
      const um = e.target.closest('[data-sug-item]'); const grupo = e.target.closest('[data-sug-grupo]');
      if (um) ov.__seletor.marcar(um.dataset.grupo, um.dataset.nome);
      else if (grupo) { ov.__seletor.irPara(grupo.dataset.sugGrupo); return; }
      else if (e.target.closest('[data-sug-todas]')) (caixaSug.__itens || []).forEach((i) => ov.__seletor.marcar(i.grupo, i.nome));
      else return;
      atualizarSugestoes();
    });
    // UF libera a lista de cidades daquela UF (relação do IBGE, como na abertura de OS).
    const campoUf = ov.querySelector('[data-n-uf]'); const campoCidade = ov.querySelector('[data-n-cidade]');
    const preencherCidades = async (selecionada = '') => {
      campoCidade.disabled = !campoUf.value;
      if (!campoUf.value) { campoCidade.innerHTML = htmlOpcoesCidade(''); return; }
      campoCidade.innerHTML = '<option value="">Carregando cidades...</option>';
      await carregarCidades();
      campoCidade.innerHTML = htmlOpcoesCidade(campoUf.value, selecionada, undefined);
      if (!cidadesDaUf(campoUf.value).length && !selecionada) campoCidade.innerHTML = '<option value="">Sem lista do IBGE: tente de novo</option>';
      ov.__pendencias?.();
    };
    campoUf.addEventListener('change', () => preencherCidades(''));
    if (preset.uf) preencherCidades(preset.cidade || '');
    // Pendências ao vivo no resumo: o que ainda falta para registrar.
    ov.__pendencias = () => {
      const prontos = ov.querySelectorAll('[data-novo-item]').length;
      const itens = prontos + (ov.__seletor?.qtd() || 0);
      const pend = [
        [!!veiculoDaDigitacao(val(ov, '[data-n-veiculo]')), 'Veículo escolhido'],
        [!!campoUf.value && !!campoCidade.value, 'UF e cidade escolhidas'],
        [!!val(ov, '[data-n-descricao]').trim(), 'Problema descrito'],
        [itens > 0, 'Ao menos um item marcado'],
      ];
      atualizarSugestoes();
      ov.querySelector('[data-nova-pendencias]').innerHTML = pend.map(([ok, txt]) => `<li class="${ok ? 'ok' : 'falta'}"><span>${ok ? '✔' : '○'}</span> ${txt}</li>`).join('');
    };
    // "Quem pediu": vem com o condutor do veículo escolhido; se a pessoa digitar outro nome, o campo deixa de ser trocado sozinho.
    const campoPediu = ov.querySelector('[data-n-solicitante]');
    campoPediu.addEventListener('input', () => { campoPediu.dataset.auto = campoPediu.value.trim() ? '0' : '1'; });
    const preencherCondutor = () => {
      if (campoPediu.dataset.auto === '0') return;
      campoPediu.value = veiculoDaDigitacao(val(ov, '[data-n-veiculo]'))?.motorista_atual || '';
      campoPediu.dataset.auto = '1';
    };
    ov.querySelector('[data-n-veiculo]').addEventListener('input', preencherCondutor);
    ov.querySelector('[data-n-veiculo]').addEventListener('change', preencherCondutor);
    ov.querySelector('[data-n-veiculo]').addEventListener('input', atualizarPecas);
    ov.querySelector('[data-n-veiculo]').addEventListener('change', atualizarPecas);
    atualizarPecas();
    ov.__pendencias();
  }

  function veiculoDaDigitacao(texto) {
    const placa = normalizarPlaca(String(texto).split('·')[0]);
    return placa ? state.base.veiculos.find((v) => normalizarPlaca(v.placa) === placa) : null;
  }

  async function aoClicarNova(e) {
    const alvo = e.target.closest('[data-acao]'); if (!alvo) return;
    const ov = document.getElementById(NOVA); if (!ov) return;
    if (alvo.dataset.acao === 'fechar') return closeModal(NOVA);
    if (alvo.dataset.acao === 'novo-item-remover') { alvo.closest('[data-novo-item]').remove(); ov.__pendencias?.(); return; }
    if (alvo.dataset.acao !== 'novo-salvar') return;

    const veiculo = veiculoDaDigitacao(val(ov, '[data-n-veiculo]'));
    // Itens já informados (checklist ou plano) mais o que foi marcado no seletor.
    const itens = [...ov.querySelectorAll('[data-novo-item]')].map((linha) => JSON.parse(linha.dataset.itemJson)).concat(ov.__seletor?.ler() || []);
    const descricao = val(ov, '[data-n-descricao]').trim();
    const lista = validarSolicitacao({ veiculo_id: veiculo?.id, descricao, itens, uf: val(ov, '[data-n-uf]'), cidade: val(ov, '[data-n-cidade]') });
    if (lista.length) { ov.querySelector('[data-erros]').innerHTML = htmlErros(lista); return; }
    if (state.ocupado) return;
    state.ocupado = true;
    try {
      const id = await dados.solicitar(state.supabase, {
        veiculo_id: veiculo.id, descricao, prioridade: val(ov, '[data-n-prioridade]'), origem: ov.dataset.origem || 'manual',
        checklist_id: ov.dataset.checklist || null, veiculo_parado: ov.querySelector('[data-n-parado]').checked,
        solicitante_nome: val(ov, '[data-n-solicitante]').trim(),
        itens: itens.map((i) => ({
          ...i,
          descricao: i.descricao || state.base.planos.find((p) => p.id === i.plano_id)?.nome
            || state.base.grupos.find((g) => Number(g.categoria_codigo) === Number(i.categoria_codigo))?.nome || state.base.categorias.find((c) => c.codigo === i.categoria_codigo)?.nome || descricao,
        })),
      });
      closeModal(NOVA);
      // Quem registra é da equipe de Frotas: a manutenção já nasce em cotação (sem etapa de solicitação). Quem pede pela
      // supervisão do veículo (sem o módulo) não pode mexer no status: a manutenção fica solicitada para a equipe.
      await dados.mudarStatus(state.supabase, id, 'em_orcamento', { uf: val(ov, '[data-n-uf]'), cidade: val(ov, '[data-n-cidade]') }).catch(() => {});
      await recarregarUma(id).catch(() => {});
      // Quem pede pela supervisão do veículo (sem o módulo Manutenção) não lê a tabela: só avisa que foi enviada.
      if (state.manut.some((m) => m.id === id)) {
        toast('Manutenção registrada em Cotações.');
        state.etapa = 'cotacoes'; state.etapaEscolhida = true;
        renderLista();
        state.root?.querySelector(`[data-mc="${CSS.escape(id)}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else {
        toast('Manutenção registrada e enviada para a equipe de Frotas.');
      }
    } catch (err) {
      ov.querySelector('[data-erros]').innerHTML = htmlErros([err.message || 'Erro ao abrir a solicitação.']);
    } finally {
      state.ocupado = false;
    }
  }

  return { abrirNova, aoClicarNova, veiculoDaDigitacao };
}
