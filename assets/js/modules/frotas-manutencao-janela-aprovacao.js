// Frotas · Manutenção › Corretiva: janela de aprovação (qual cotação foi aprovada ou, com "vários fornecedores", de qual fornecedor sai cada
// item). Aprovar já emite a OS. Fábrica que recebe o contexto da tela (estado e ações comuns) e devolve o que a tela precisa chamar.
import { closeModal, confirmar, esc, openModal, toast } from '../core/ui.js';
import * as dados from './frotas-manutencao-dados.js?v=20261029-frotas-manut77';
import { compraDividida, modeloDoVeiculo, rotuloModelo } from './frotas-manutencao-regras.js?v=20261029-frotas-manut77';
import { htmlModalAprovacao } from './frotas-manutencao-html.js?v=20261029-frotas-manut77';

export function criarAprovacao(ctx) {
  const { state, executar } = ctx;
  const APR = 'fmAprovacao';

  // Ao aprovar, as peças (com marca/referência) do orçamento escolhido entram no catálogo do modelo do veículo.
  async function aprenderPecasDaManutencao(m) {
    try {
      const veiculo = state.base.veiculos.find((v) => v.id === m.veiculo_id);
      const modelo = modeloDoVeiculo(veiculo || m.__modelo || '');
      if (!modelo) return;
      const n = await dados.aprenderPecas(state.supabase, m.id, modelo);
      if (n > 0) {
        state.base.pecas = await dados.carregarPecas(state.supabase);
        toast(`${n} peça(s) salva(s) no catálogo do ${rotuloModelo(modelo)}.`);
      }
    } catch { /* o catálogo é um extra: a aprovação já foi feita */ }
  }

  // ---------- aprovação (janela: qual cotação, ou vários fornecedores por item) ----------
  // A cotação escolhida vira a principal (a que fica com o serviço) e os itens comprados de outro fornecedor vão em escolha_itens;
  // aprovar já emite a OS (a manutenção entra em andamento).
  function abrirAprovacao(m, natureza) {
    const orcs = state.orcs.filter((o) => o.manutencao_id === m.id);
    const ov = openModal({ id: APR, conteudoHtml: htmlModalAprovacao(m, orcs) });
    ov.classList.add('fm-mod', 'fm-modal-largo', 'fm-modal-orc');
    const brl = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const radios = (sel) => [...ov.querySelectorAll(sel)];
    const modo = () => ov.querySelector('[name="apr-modo"]:checked')?.value || 'uma';
    const linhasItens = () => {
      const porNome = new Map();
      for (const r of radios('[name^="apr-item-"]')) { if (!porNome.has(r.name)) porNome.set(r.name, []); porNome.get(r.name).push(r); }
      return [...porNome.values()];
    };
    // Estado inicial: a cotação já escolhida (se houver); no modo por item, a escolha gravada ou o menor valor de cada item.
    const atual = orcs.find((o) => o.selecionado) || (orcs.length === 1 ? orcs[0] : null);
    if (atual) { const r = radios('[name="apr-uma"]').find((x) => x.value === atual.id); if (r) r.checked = true; }
    for (const grupo of linhasItens()) {
      const nome = grupo[0].dataset.nome;
      const gravado = (m.escolha_itens || {})[nome] || atual?.id;
      const alvo = grupo.find((r) => r.value === gravado) || grupo.reduce((a, b) => (Number(b.dataset.valor) < Number(a.dataset.valor) ? b : a));
      alvo.checked = true;
    }
    if (Object.keys(m.escolha_itens || {}).length && !ov.querySelector('[name="apr-modo"][value="varios"]').disabled) ov.querySelector('[name="apr-modo"][value="varios"]').checked = true;

    // Lê a tela: principal, itens de outros fornecedores e total (mesma conta da trava do banco).
    const ler = () => {
      if (modo() === 'uma') {
        const id = ov.querySelector('[name="apr-uma"]:checked')?.value || null;
        const o = orcs.find((x) => x.id === id);
        return { ok: !!o, principalId: id, escolha: {}, total: o ? Number(o.valor_total) : null, partes: [], motivo: 'Escolha a cotação aprovada.' };
      }
      const atrib = linhasItens().map((g) => ({ nome: g[0].dataset.nome, id: g.find((r) => r.checked)?.value || null }));
      if (atrib.some((x) => !x.id)) return { ok: false, motivo: 'Escolha o fornecedor de cada item.' };
      const peso = new Map();
      for (const x of atrib) peso.set(x.id, (peso.get(x.id) || 0) + 1);
      const principalId = [...peso.entries()].sort((a, b) => b[1] - a[1] || Number(orcs.find((o) => o.id === b[0])?.valor_total) - Number(orcs.find((o) => o.id === a[0])?.valor_total))[0][0];
      const escolha = Object.fromEntries(atrib.filter((x) => x.id !== principalId).map((x) => [x.nome, x.id]));
      const lista = orcs.map((o) => ({ ...o, selecionado: o.id === principalId }));
      const cd = compraDividida(lista, escolha);
      if (cd.trocas.some((t) => !t.valido)) return { ok: false, motivo: 'Há item sem valor no fornecedor escolhido.' };
      const partes = [...peso.keys()].map((id) => ({ fornecedor: orcs.find((o) => o.id === id)?.fornecedor, itens: atrib.filter((x) => x.id === id).map((x) => x.nome) }));
      return { ok: true, principalId, escolha, total: cd.total, partes };
    };
    const atualizar = () => {
      const v = ler();
      ov.querySelector('[data-apr-painel="uma"]').hidden = modo() !== 'uma';
      ov.querySelector('[data-apr-painel="varios"]').hidden = modo() !== 'varios';
      ov.querySelector('[data-acao="apr-confirmar"]').disabled = !v.ok;
      const resumo = ov.querySelector('[data-apr-resumo]');
      resumo.innerHTML = v.ok ? `${v.partes.map((p) => `<span><strong>${esc(p.fornecedor)}</strong>: ${esc(p.itens.join(', '))}</span>`).join('')}<span>Total aprovado: <strong>${brl(v.total)}</strong>. O serviço entra em andamento e a OS é emitida.</span>` : `<span>${esc(v.motivo)}</span>`;
    };
    ov.addEventListener('change', atualizar);
    ov.addEventListener('click', async (e) => {
      const alvo = e.target.closest('[data-acao]'); if (!alvo) return;
      if (alvo.dataset.acao === 'apr-cancelar') return closeModal(APR);
      if (alvo.dataset.acao !== 'apr-confirmar') return;
      const v = ler(); if (!v.ok) return;
      const principal = orcs.find((o) => o.id === v.principalId);
      const aprovou = await executar(async () => {
        if (!principal.selecionado) await dados.escolherOrcamento(state.supabase, principal.id);
        await dados.atualizarManutencao(state.supabase, m.id, { escolha_itens: v.escolha });
        await dados.mudarStatus(state.supabase, m.id, 'aprovada', natureza);
        await dados.mudarStatus(state.supabase, m.id, 'em_execucao'); // se falhar, fica aprovada e "Emitir OS" continua disponível
      }, { id: m.id, sucesso: 'Manutenção aprovada, OS emitida.' });
      if (aprovou) { closeModal(APR); aprenderPecasDaManutencao(m); }
    });
    atualizar();
  }

  return { abrirAprovacao, aprenderPecasDaManutencao };
}
