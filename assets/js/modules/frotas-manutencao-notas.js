// Frotas · Manutenção › Corretiva: notas fiscais da ficha — anexar (lendo NF e comprovante), enviar para lançamento (painel de Notas
// Fiscais) e enviar ao Financeiro (PIX, boleto ou link). Fábrica que recebe o contexto da tela.
import { closeModal, confirmar, openModal, toast } from '../core/ui.js';
import * as dados from './frotas-manutencao-dados.js?v=20261030-frotas-manut-url';
import { numeroOuNulo } from './frotas-manutencao-regras.js?v=20261030-frotas-manut-url';
import { htmlErros, htmlModalFinanceiro } from './frotas-manutencao-html.js?v=20261030-frotas-manut-url';
import { lerComprovante, lerNf, tipoDaNota } from './frotas-manutencao-leitor.js?v=20261030-frotas-manut-url';

export function criarNotas(ctx) {
  const { state, executar, val, norm } = ctx;
  const FIN = 'fmFinanceiro';

  // Lançamento: quem sinaliza que todas as NFs e comprovantes estão anexados manda as NFs para o painel de Notas Fiscais.
  async function enviarLancamento(m) {
    const pendentes = state.notas.filter((n) => n.manutencao_id === m.id && !n.enviada_em);
    if (pendentes.some((n) => !n.anexo_url)) { toast('Há nota sem a NF anexada: anexe a NF de todas as notas antes de enviar para lançamento.', 'err', 5500); return; }
    if (!(await confirmar({ titulo: 'Enviar para lançamento', mensagem: `Todas as NFs e comprovantes desta manutenção já estão anexados? ${pendentes.length} nota(s) vão para o painel de Notas Fiscais para lançamento no GRM; depois disso as NFs não podem mais ser alteradas.`, confirmarLabel: 'Enviar para lançamento' }))) return;
    return executar(() => dados.enviarLancamentoNf(state.supabase, m.id), { id: m.id, sucesso: 'Notas enviadas para lançamento.' });
  }

  // Financeiro: PIX, boleto ou link por nota (modelo de Compras); entra na lista do Financeiro para pagar.
  function abrirFinanceiro(m) {
    const notas = state.notas.filter((n) => n.manutencao_id === m.id);
    const ov = openModal({ id: FIN, conteudoHtml: htmlModalFinanceiro(m, notas, state.base) });
    ov.classList.add('fm-mod', 'fm-modal-largo', 'fm-modal-orc');
    const mostrarErros = (lista) => { ov.querySelector('[data-erros]').innerHTML = htmlErros(lista); };
    const formaDe = (sec) => sec.querySelector('[name^="fin-forma-"]:checked')?.value || 'PIX';
    const atualizar = () => {
      for (const sec of ov.querySelectorAll('[data-fin-nota]')) {
        const forma = formaDe(sec);
        sec.querySelectorAll('[data-fin-campo]').forEach((l) => { l.hidden = l.dataset.finCampo !== forma; });
      }
    };
    ov.addEventListener('change', atualizar);
    ov.addEventListener('click', async (e) => {
      const alvo = e.target.closest('[data-acao]'); if (!alvo) return;
      if (alvo.dataset.acao === 'fin-cancelar') return closeModal(FIN);
      if (alvo.dataset.acao !== 'fin-confirmar') return;
      const secoes = [...ov.querySelectorAll('[data-fin-nota]')];
      const faltas = [];
      const itens = secoes.map((sec) => {
        const nota = notas.find((n) => n.id === sec.dataset.finNota);
        const forma = formaDe(sec);
        const texto = (sec.querySelector(`[data-fin-dado="${forma}"]`)?.value || '').trim();
        const arquivo = forma === 'BOLETO' ? (sec.querySelector('[data-fin-arquivo]')?.files?.[0] || null) : null;
        const paga = sec.dataset.finPaga === '1';
        if (!paga && !texto && !arquivo) faltas.push(`Informe ${forma === 'PIX' ? 'a chave PIX' : forma === 'BOLETO' ? 'o boleto (link ou arquivo)' : 'o link de pagamento'} da nota de ${nota?.fornecedor || 'fornecedor'}.`);
        return { nota, forma, texto, arquivo, vencimento: forma === 'BOLETO' ? (sec.querySelector('[data-fin-venc]')?.value || null) : null, contato: (sec.querySelector('[data-fin-contato]')?.value || '').trim() || null };
      });
      if (faltas.length) return mostrarErros(faltas);
      mostrarErros([]);
      const enviou = await executar(async () => {
        const pagamentos = [];
        for (const it of itens) {
          const dado = it.arquivo ? await dados.enviarAnexo(state.supabase, m.id, 'boleto', it.arquivo) : it.texto;
          pagamentos.push({ nota_id: it.nota.id, forma: it.forma, dados: dado || null, vencimento: it.vencimento, contato: it.contato });
        }
        await dados.enviarFinanceiroNf(state.supabase, m.id, pagamentos);
      }, { id: m.id, sucesso: 'Notas enviadas ao Financeiro.' });
      if (enviou) closeModal(FIN);
    });
    atualizar();
  }



  // Ações da seção de notas dentro da ficha (cliques): anexar e ler a nota, remover, enviar para lançamento e ao Financeiro.
  const acoes = ['nota-add', 'nota-remover', 'notas-enviar', 'notas-financeiro'];
  async function aoClicarFicha({ acao, alvo, ov, m, erros }) {
    if (acao === 'nota-add') {
      const f = ov.querySelector('[data-nota-entrada]');
      const arquivo = f.querySelector('[data-nt-arquivo]')?.files?.[0] || null;
      const comprovante = f.querySelector('[data-nt-comprovante]')?.files?.[0] || null;
      // Paga primeiro e a nota chega depois (ou o contrário): basta a NF ou o comprovante; o que faltar mantém a etapa (À pagar / Aguardando NF).
      if (!arquivo && !comprovante) return erros(['Anexe a NF/NFS-e ou o comprovante de pagamento (o que faltar fica como pendência).']);
      const leitura = ov.querySelector('[data-nt-leitura]');
      const aviso = (texto, tom = '') => { leitura.hidden = false; leitura.textContent = texto; leitura.className = `fm-mm fm-nota-leitura${tom ? ` ${tom}` : ''}`; };
      alvo.disabled = true;
      let nf = null; let pg = null;
      try {
        aviso('Lendo os arquivos…');
        [nf, pg] = await Promise.all([lerNf(arquivo).catch(() => null), lerComprovante(comprovante).catch(() => null)]);
      } finally { alvo.disabled = false; }
      const manual = numeroOuNulo(val(ov, '[data-nt="valor"]'));
      const valor = manual ?? nf?.valor ?? pg?.valor ?? null;
      if (valor == null) {
        // O arquivo não deixou ler o valor: pede só esse campo.
        ov.querySelector('[data-nt-valor-wrap]').hidden = false;
        ov.querySelector('[data-nt="valor"]')?.focus();
        return aviso('Não consegui ler o valor no arquivo: informe o valor da nota e clique em + de novo.', 'erro');
      }
      const itensDaManut = state.itens.filter((i) => i.manutencao_id === m.id);
      const cnpj = String(nf?.cnpj || '').replace(/\D/g, '');
      const oficina = (cnpj && state.base.oficinas.find((o) => String(o.cnpj || '').replace(/\D/g, '') === cnpj))
        || state.base.oficinas.find((o) => norm(o.nome) === norm(nf?.fornecedor));
      const fornecedor = oficina?.nome || nf?.fornecedor || m.oficina || 'Não identificado';
      return executar(async () => {
        const anexo = arquivo ? await dados.enviarAnexo(state.supabase, m.id, 'nf', arquivo) : null;
        const urlComprovante = comprovante ? await dados.enviarAnexo(state.supabase, m.id, 'comprovante', comprovante) : null;
        await dados.salvarNota(state.supabase, {
          manutencao_id: m.id, tipo: tipoDaNota(itensDaManut), fornecedor, oficina_id: oficina?.id || null,
          numero: nf?.numero || null, valor, anexo_url: anexo, ...(nf?.data_emissao ? { data_emissao: nf.data_emissao } : {}),
          comprovante_url: urlComprovante, pago_em: urlComprovante ? (dados.dataPagamentoISO(pg?.data) || new Date().toISOString()) : null,
        });
      }, { sucesso: 'Nota adicionada.' });
    }
    if (acao === 'nota-remover') {
      if (!(await confirmar({ titulo: 'Remover nota', mensagem: 'Remover esta nota fiscal da manutenção?', confirmarLabel: 'Remover' }))) return;
      return executar(() => dados.removerNota(state.supabase, alvo.dataset.id), { sucesso: 'Nota removida.' });
    }
    if (acao === 'notas-enviar') return enviarLancamento(m);
    if (acao === 'notas-financeiro') return abrirFinanceiro(m);
  }

  // Mudanças de arquivo na ficha que são da nota: ícones de anexo da entrada e NF ou comprovante que chegou depois.
  const ehMudancaDeNota = (alvo) => alvo.matches('[data-nt-arquivo],[data-nt-comprovante]') || (alvo.matches('[data-anexar-nf],[data-anexar-comp]') && !!alvo.files?.[0]);
  async function aoMudarFicha(alvo, m) {
    // Ícones de anexo da nota: marca o ícone escolhido (o arquivo é lido e salvo no "+").
    if (alvo.matches('[data-nt-arquivo],[data-nt-comprovante]')) {
      const rotulo = alvo.closest('.fm-arq'); const nome = alvo.files?.[0]?.name;
      rotulo?.classList.toggle('on', !!nome);
      if (rotulo) rotulo.title = nome ? `${nome} (clique para trocar)` : rotulo.dataset.titulo;
      return;
    }
    // NF ou comprovante que chegou depois, na própria nota (sem NF a nota fica em Aguardando NF; sem comprovante, em À pagar).
    if (alvo.matches('[data-anexar-nf],[data-anexar-comp]') && alvo.files?.[0]) {
      const ehNf = alvo.matches('[data-anexar-nf]');
      const nota = state.notas.find((n) => n.id === (ehNf ? alvo.dataset.anexarNf : alvo.dataset.anexarComp)); if (!nota) return;
      const arquivo = alvo.files[0];
      return executar(async () => {
        if (ehNf) {
          // A NF que chegou depois também é lida: completa emitente e número que a nota ainda não tinha.
          const lida = await lerNf(arquivo).catch(() => null);
          await dados.atualizarNota(state.supabase, nota.id, {
            anexo_url: await dados.enviarAnexo(state.supabase, m.id, 'nf', arquivo),
            ...(!nota.numero && lida?.numero ? { numero: lida.numero } : {}),
            ...(!nota.data_emissao && lida?.data_emissao ? { data_emissao: lida.data_emissao } : {}),
          });
        } else {
          const lida = await lerComprovante(arquivo).catch(() => null);
          const pagoEm = dados.dataPagamentoISO(lida?.data) || new Date().toISOString();
          const url = await dados.enviarAnexo(state.supabase, m.id, 'comprovante', arquivo);
          if (nota.pagamento_id) await dados.comprovanteTardio(state.supabase, nota.id, url, pagoEm);
          else await dados.atualizarNota(state.supabase, nota.id, { comprovante_url: url, pago_em: pagoEm });
        }
      }, { sucesso: ehNf ? 'NF anexada.' : 'Comprovante anexado.' });
    }
  }

  return { enviarLancamento, abrirFinanceiro, acoes, aoClicarFicha, ehMudancaDeNota, aoMudarFicha };
}
