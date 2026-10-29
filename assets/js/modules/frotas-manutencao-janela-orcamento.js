// Frotas · Manutenção › Corretiva: janela de cotação (adicionar ou editar) e as contas do formulário (soma das linhas, totais).
import { closeModal, confirmar, openModal } from '../core/ui.js';
import * as dados from './frotas-manutencao-dados.js?v=20261029-frotas-manut76';
import { linhasIniciais, modeloDoVeiculo, normalizarLinhas, numeroOuNulo, pecasDoModelo, rotuloModelo, somarLinhas, totalDoOrcamento, validarOrcamento } from './frotas-manutencao-regras.js?v=20261029-frotas-manut76';
import { htmlErros, htmlLinhaOrcamento, htmlModalOrcamento } from './frotas-manutencao-html.js?v=20261029-frotas-manut76';
import { criarSeletor } from './frotas-manutencao-seletor.js?v=20261029-frotas-manut76';

export function criarOrcamento(ctx) {
  const { state, indices, executar, val, norm } = ctx;
  const ORC = 'fmOrcamento';

  // Linhas do orçamento (peça/serviço, marca/observação, valor) como estão na tela.
  const linhasDoFormulario = (f) => [...f.querySelectorAll('[data-orc-linha]')].map((r) => ({
    nome: r.querySelector('[data-ol="nome"]').value, detalhe: r.querySelector('[data-ol="detalhe"]').value, valor: numeroOuNulo(r.querySelector('[data-ol="valor"]').value),
    tipo: r.querySelector('[data-ol="tipo"]')?.value === 'servico' ? 'servico' : 'peca', faltante: !!r.querySelector('[data-ol="faltante"]')?.checked,
  }));

  // Peças = soma das linhas de peça, Mão de obra = soma das de serviço e total = peças + mão de obra, enquanto a pessoa não digitar
  // um valor próprio nesses campos.
  function recalcularOrcamento(f) {
    if (!f) return;
    const campo = (k) => f.querySelector('[data-o="' + k + '"]');
    const linhas = linhasDoFormulario(f);
    const pecas = campo('valor_pecas'); const mao = campo('valor_mao_obra'); const total = campo('valor_total');
    if (pecas.dataset.auto !== '0') pecas.value = somarLinhas(linhas, 'peca') ?? '';
    if (mao.dataset.auto !== '0') mao.value = somarLinhas(linhas, 'servico') ?? '';
    if (total.dataset.auto !== '0') total.value = totalDoOrcamento({ pecas: numeroOuNulo(pecas.value), maoObra: numeroOuNulo(mao.value) }) ?? '';
  }

  function aoDigitarFicha(e) {
    const f = e.target.closest?.('[data-orc-form]'); if (!f) return;
    const t = e.target;
    // Digitar direto em Peças, Mão de obra ou no total desliga a soma automática daquele campo (apagar religa).
    if (t.matches('[data-o="valor_pecas"],[data-o="valor_mao_obra"],[data-o="valor_total"]')) t.dataset.auto = t.value === '' ? '1' : '0';
    recalcularOrcamento(f);
  }

  // ---------- cotação (janela: adicionar ou editar) ----------
  function abrirOrcamento(m, orc = {}) {
    const { itensPorManut } = indices();
    const ov = openModal({ id: ORC, conteudoHtml: htmlModalOrcamento(m, state.base, orc, itensPorManut.get(m.id) || []) });
    ov.classList.add('fm-mod', 'fm-modal-largo', 'fm-modal-orc');
    const mostrarErros = (lista) => { ov.querySelector('[data-erros]').innerHTML = htmlErros(lista); };
    recalcularOrcamento(ov.querySelector('[data-orc-form]'));
    // Adicionar itens ao pedido (o mesmo seletor de grupos): os itens novos entram também nas linhas desta cotação.
    const caixaItens = ov.querySelector('[data-orc-add-itens]');
    const corpoItens = caixaItens.querySelector('[data-seletor-corpo]');
    const moldeItens = corpoItens.innerHTML;
    let seletorItens = null;
    const fecharItens = () => {
      caixaItens.hidden = true; seletorItens = null;
      const limpo = caixaItens.querySelector('[data-seletor-corpo]').cloneNode(false); // sem os ouvintes do seletor anterior
      limpo.innerHTML = moldeItens;
      caixaItens.querySelector('[data-seletor-corpo]').replaceWith(limpo);
      caixaItens.querySelector('[data-pick-resumo]').innerHTML = '';
    };
    const abrirItens = () => {
      if (seletorItens) return;
      caixaItens.hidden = false; caixaItens.closest('details').open = true;
      seletorItens = criarSeletor(caixaItens.querySelector('[data-seletor-corpo]'), state.base, { resumo: caixaItens.querySelector('[data-pick-resumo]') });
      const modelo = modeloDoVeiculo(state.base.veiculos.find((v) => v.id === m.veiculo_id) || m.__modelo || '');
      seletorItens.setPecas(pecasDoModelo(state.base.pecas, modelo), rotuloModelo(modelo));
      caixaItens.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    };
    ov.addEventListener('input', aoDigitarFicha);
    ov.addEventListener('change', (e) => {
      const alvo = e.target;
      // Peça faltante na cotação: o fornecedor não tem; a linha perde o valor e sai da soma.
      if (alvo.matches('[data-ol="faltante"]')) {
        const linha = alvo.closest('[data-orc-linha]'); const valor = linha.querySelector('[data-ol="valor"]');
        linha.classList.toggle('faltante', alvo.checked); valor.disabled = alvo.checked; if (alvo.checked) valor.value = '';
        return recalcularOrcamento(ov.querySelector('[data-orc-form]'));
      }
      // O nome digitado que bate com uma oficina cadastrada liga a cotação a ela e preenche o contato.
      if (alvo.dataset.o === 'fornecedor') {
        const f = ov.querySelector('[data-orc-form]');
        const of = state.base.oficinas.find((x) => norm(x.nome) === norm(alvo.value));
        f.querySelector('[data-o="oficina_id"]').value = of?.id || '';
        const contato = f.querySelector('[data-o="fornecedor_contato"]');
        if (of && contato && !contato.value) contato.value = of.telefone || of.contato_nome || '';
      }
    });
    ov.addEventListener('click', async (e) => {
      const alvo = e.target.closest('[data-acao]'); if (!alvo) return;
      const acao = alvo.dataset.acao;
      if (acao === 'orc-cancelar') return closeModal(ORC);
      if (acao === 'orc-itens-abrir') return abrirItens();
      if (acao === 'orc-itens-cancelar') return fecharItens();
      if (acao === 'orc-itens-confirmar') {
        const novos = seletorItens?.ler() || [];
        if (!novos.length) return mostrarErros(['Marque ao menos um item (escolha o grupo e marque o que será feito).']);
        const feito = await executar(async () => {
          for (const n of novos) await dados.salvarItem(state.supabase, { manutencao_id: m.id, ...n });
        }, { sucesso: novos.length > 1 ? 'Itens adicionados.' : 'Item adicionado.', id: m.id });
        if (!feito) return;
        mostrarErros([]);
        const f = ov.querySelector('[data-orc-form]');
        const ja = new Set([...f.querySelectorAll('[data-orc-linha] [data-ol="nome"]')].map((i) => norm(i.value)));
        const novas = linhasIniciais(novos, []).filter((l) => !ja.has(norm(l.nome)));
        f.querySelector('[data-orc-linhas]').insertAdjacentHTML('beforeend', novas.map((l) => htmlLinhaOrcamento(l, { fixa: true })).join(''));
        f.querySelector('[data-ol-cab]').hidden = false;
        recalcularOrcamento(f);
        return fecharItens();
      }
      if (acao === 'orc-linha-add') {
        ov.querySelector('[data-orc-linhas]').insertAdjacentHTML('beforeend', htmlLinhaOrcamento({ tipo: alvo.dataset.tipo === 'servico' ? 'servico' : 'peca' }, { fixa: false }));
        ov.querySelector('[data-orc-linhas] [data-orc-linha]:last-child [data-ol="nome"]')?.focus();
        return;
      }
      if (acao === 'orc-linha-rem') { alvo.closest('[data-orc-linha]').remove(); return recalcularOrcamento(ov.querySelector('[data-orc-form]')); }
      if (acao === 'orc-salvar') {
        const f = ov.querySelector('[data-orc-form]');
        const o = (k) => val(f, `[data-o="${k}"]`);
        const pecas = numeroOuNulo(o('valor_pecas')); const mao = numeroOuNulo(o('valor_mao_obra'));
        const total = numeroOuNulo(o('valor_total')) ?? totalDoOrcamento({ pecas, maoObra: mao });
        const linhas = normalizarLinhas(linhasDoFormulario(f));
        const lista = validarOrcamento({ fornecedor: o('fornecedor'), valor_total: total });
        if (lista.length) return mostrarErros(lista);
        const arquivo = f.querySelector('[data-o-arquivo]')?.files?.[0] || null;
        const feito = await executar(async () => {
          const anexo = arquivo ? await dados.enviarAnexo(state.supabase, m.id, 'orcamentos', arquivo) : null;
          await dados.salvarOrcamento(state.supabase, {
            id: f.dataset.orcId || undefined, manutencao_id: m.id, oficina_id: o('oficina_id') || null, fornecedor: o('fornecedor').trim(),
            fornecedor_contato: o('fornecedor_contato').trim() || null, valor_pecas: pecas, valor_mao_obra: mao, valor_total: total,
            prazo_dias: numeroOuNulo(o('prazo_dias')), validade: o('validade') || null, condicoes_pagamento: o('condicoes_pagamento').trim() || null,
            garantia: o('garantia').trim() || null, observacoes: o('observacoes').trim() || null, linhas, ...(anexo ? { anexo_url: anexo } : {}),
            // O primeiro orçamento já fica escolhido (não há o que comparar); com vários, quem decide escolhe.
            ...(!f.dataset.orcId && !state.orcs.some((x) => x.manutencao_id === m.id) ? { selecionado: true } : {}),
          });
        }, { sucesso: 'Cotação salva.', id: m.id });
        if (feito) closeModal(ORC);
      }
    });
    ov.querySelector('[data-o="fornecedor"]')?.focus();
  }

  return { abrirOrcamento, recalcularOrcamento };
}
