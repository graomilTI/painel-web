// Frotas · Manutenção › HTML: notas fiscais (entrada por ícones, entrada manual da Preventiva, lista da ficha) e janela do Financeiro.
import { dataBR, dinheiro, esc } from '../core/ui.js';
import { RESPONSAVEIS, TIPOS_NOTA, codigoManutencao, conferenciaNotas } from './frotas-manutencao-regras.js?v=20261029-frotas-inst85';
import { opcoes } from './frotas-manutencao-html-base.js?v=20261029-frotas-inst85';

const NF_ROTULO = {
  NOVO: ['Na fila do GRM', 'amber'], PROCESSANDO: ['Sendo lançada no GRM', 'amber'], VALIDADO: ['Validada, aguardando lançar', 'amber'], DRY_RUN_OK: ['Validada', 'amber'],
  LANCADO: ['Lançada no GRM', 'green'], ERRO: ['Erro no GRM', 'red'], AGUARDANDO_DADOS: ['Faltam dados', 'red'], AGUARDANDO_CLASSIFICACAO: ['Falta classificar', 'red'],
  DUPLICADO: ['Duplicada', 'red'], CANCELADO: ['Cancelada', 'red'],
};

const PG_ROTULO = { PENDENTE: ['Aguardando o Financeiro', 'amber'], EM_ANALISE: ['Em análise', 'amber'], APROVADO: ['Aprovado', 'blue'], AGENDADO: ['Agendado', 'blue'], PAGO: ['Pago', 'green'], RECUSADO: ['Recusado', 'red'], CANCELADO: ['Cancelado', 'red'] };

// Notas fiscais (várias por manutenção: peças, serviço, mais de uma de cada). Cada nota vira um lançamento no GRM
// e um pagamento no Financeiro; o status de cada uma volta para cá.
// Serviço já pago: comprovante de pagamento (opcional) junto da nota. Com comprovante, o pagamento entra no Financeiro já como pago.
// Entrada manual de nota (tipo, emitente, número, valor e comprovante digitados): é a da Preventiva, que ainda não lê os arquivos.
export function htmlCampoPagamento() {
  return `<div class="fm-nota-pago"><span>Já foi pago? Comprovante de pagamento (opcional):</span>
    <input class="fm-input" type="file" accept=".pdf,.jpg,.jpeg,.png" data-nt-comprovante title="Comprovante de pagamento (PIX, recibo, extrato)">
    <label>Pago em <input class="fm-input" type="date" data-nt="pago_em" title="Data do pagamento"></label></div>`;
}

export function htmlEntradaNotaManual(base) {
  return `<div class="fm-nota-linha" data-nota-entrada>
    <select class="fm-select" data-nt="tipo" title="Peças, serviço ou os dois: define a categoria da nota no GRM">${opcoes(TIPOS_NOTA, 'servico')}</select>
    <input class="fm-input" data-nt="fornecedor" list="fmListaFornecedores" placeholder="Quem emitiu (oficina ou loja de peças)" maxlength="120">
    <datalist id="fmListaFornecedores">${base.oficinas.filter((o) => o.ativo !== false).map((o) => `<option value="${esc(o.nome)}"></option>`).join('')}</datalist>
    <input class="fm-input" data-nt="numero" placeholder="Nº da NF" maxlength="60">
    <input class="fm-input" type="number" step="0.01" min="0" data-nt="valor" placeholder="Valor (R$)">
    <input class="fm-input" type="file" accept=".pdf,.xml,.jpg,.jpeg,.png" data-nt-arquivo title="Arquivo da nota fiscal (NF ou NFS-e)">
    <button class="fm-ic" type="button" data-acao="nota-add" title="Adicionar nota" aria-label="Adicionar nota" style="font-size:20px;font-weight:900;color:#86efac;border-color:rgba(34,197,94,.4);background:rgba(34,197,94,.14)">+</button>
    ${htmlCampoPagamento()}</div>`;
}

// Corretiva: a nota é só o anexo (NF/NFS-e e comprovante), em ícones na linha dos campos da ficha. O sistema lê os arquivos e preenche
// emitente, número, valor, emissão e data do pagamento; o valor só é pedido (campo logo abaixo) quando o arquivo não deixa ler.
const ICONE_NF = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h5"/></svg>';

const ICONE_COMPROVANTE = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 2v20l2-1.5L8 22l2-1.5L12 22l2-1.5L16 22l2-1.5L20 22V2l-2 1.5L16 2l-2 1.5L12 2l-2 1.5L8 2 6 3.5z"/><path d="M9 8h6M9 12h6M9 16h3"/></svg>';

const ICONE_MAIS = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>';

export function htmlNotaIcones() {
  const arq = (rotulo, atributo, icone) => `<label class="fm-ic-act fm-arq" data-titulo="${esc(rotulo)}" title="${esc(rotulo)}">${icone}<input type="file" accept="${atributo === 'nf' ? '.pdf,.xml,.jpg,.jpeg,.png' : '.pdf,.jpg,.jpeg,.png'}" ${atributo === 'nf' ? 'data-nt-arquivo' : 'data-nt-comprovante'} aria-label="${esc(rotulo)}"></label>`;
  return `<div class="fm-field" data-nota-entrada><label>Nota fiscal</label><div class="fm-dados-botoes">${arq('Anexar a nota fiscal (NF / NFS-e: PDF, XML ou imagem)', 'nf', ICONE_NF)}${arq('Anexar o comprovante de pagamento (PIX, recibo, extrato)', 'comp', ICONE_COMPROVANTE)}<button class="fm-ic-act tom-nota-add" type="button" data-acao="nota-add" title="Ler os arquivos e adicionar a nota" aria-label="Adicionar a nota">${ICONE_MAIS}</button></div></div>`;
}

// Mensagem da leitura e, só se preciso, o campo de valor (abaixo da linha dos campos).
export function htmlNotaLeitura() {
  return `<div class="fm-nota-status"><label class="fm-anexar-campo" data-nt-valor-wrap hidden>Valor da nota (R$) — não consegui ler no arquivo<input class="fm-input" type="number" step="0.01" min="0" data-nt="valor" placeholder="0,00"></label><div class="fm-mm fm-nota-leitura" data-nt-leitura hidden></div></div>`;
}

// Pagou antes de a nota chegar (ou o contrário): o que falta pode ser anexado depois, na própria nota.
function htmlCompletarNota(n) {
  const nf = !n.anexo_url
    ? `<span class="fm-badge amber">Falta a NF/NFS-e</span><label class="fm-anexar">Anexar NF<input class="fm-input" type="file" accept=".pdf,.xml,.jpg,.jpeg,.png" data-anexar-nf="${esc(n.id)}"></label>` : '';
  const comp = (!n.comprovante_url && !n.pago_em)
    ? `<span class="fm-badge amber">Falta o comprovante</span><label class="fm-anexar">Anexar comprovante<input class="fm-input" type="file" accept=".pdf,.jpg,.jpeg,.png" data-anexar-comp="${esc(n.id)}"></label>` : '';
  return `<div class="fm-nota-pago">${nf}${comp}</div>`;
}

export function blocoNotas(m, notas, fin) {
  if (!['em_execucao', 'concluida'].includes(m.status)) return '';
  const resp = (RESPONSAVEIS.find((r) => r.id === m.responsavel_pagamento) || {}).label;
  if (m.responsavel_pagamento !== 'empresa') {
    return `<div class="fm-sec"><h4>Notas fiscais</h4><div class="fm-mm">Esta manutenção é paga por ${esc(resp || 'outro responsável')}: não vai para a nota fiscal do GRM nem para o Financeiro.</div></div>`;
  }
  const selo = (mapa, chave) => { const [rotulo, tom] = mapa[chave] || [chave || '—', 'blue']; return `<span class="fm-badge ${tom}">${esc(rotulo)}</span>`; };
  const statusPorNota = new Map(((fin && fin.notas) || []).map((x) => [x.nota_id, x]));
  const linhas = notas.map((n) => {
    const st = statusPorNota.get(n.id);
    const nfParte = !n.enviada_em ? '<span class="fm-badge">NF não enviada</span>' : (!st || !st.nf ? '<span class="fm-badge amber">NF enviada para lançamento</span>' : selo(NF_ROTULO, st.nf.status));
    const pgParte = !n.pagamento_id ? '<span class="fm-badge">Financeiro: não enviado</span>' : (!st || !st.pagamento ? '<span class="fm-badge amber">No Financeiro</span>' : selo(PG_ROTULO, st.pagamento.status));
    const situacao = `${nfParte} ${pgParte}${st && st.nf && st.nf.grm_codigo ? `<span class="fm-mm">GRM ${esc(st.nf.grm_codigo)}${st.nf.categoria ? ` · ${esc(st.nf.categoria)}` : ''}</span>` : ''}${st && st.nf && st.nf.erro ? `<span class="fm-mm" style="color:#fecaca">${esc(st.nf.erro)}</span>` : ''}${st && st.pagamento && st.pagamento.comprovante_url ? `<span class="fm-mm"><a href="${esc(st.pagamento.comprovante_url)}" target="_blank" rel="noopener" style="color:#86efac">Ver comprovante</a></span>` : ''}`;
    return `<div class="fm-nota-linha fm-nota-item">
      <div class="fm-ro">${esc((TIPOS_NOTA.find((t) => t.id === n.tipo) || {}).label || n.tipo)}</div>
      <div class="fm-ro">${esc(n.fornecedor || '—')}</div>
      <div class="fm-ro">${esc(n.numero || '—')}</div>
      <div class="fm-ro">${esc(dinheiro(n.valor))}</div>
      <div class="fm-ro">${n.anexo_url ? `<a href="${esc(n.anexo_url)}" target="_blank" rel="noopener" style="color:#86efac">Ver arquivo</a>` : '—'}${n.comprovante_url ? ` · <a href="${esc(n.comprovante_url)}" target="_blank" rel="noopener" style="color:#86efac" title="Comprovante de pagamento anexado à nota">Comprovante anexado</a>${n.pago_em ? ` (${esc(dataBR(n.pago_em))})` : ''}` : ''}${situacao ? `<small>${situacao}</small>` : ''}</div>
      ${(n.enviada_em || n.pagamento_id) ? '<span></span>' : `<button class="fm-ic danger" type="button" data-acao="nota-remover" data-id="${esc(n.id)}" title="Remover nota" aria-label="Remover nota">✕</button>`}
      ${(!n.anexo_url || (!n.comprovante_url && !n.pago_em)) ? htmlCompletarNota(n) : ''}</div>`;
  }).join('');
  const conf = conferenciaNotas(notas, m.status === 'concluida' ? m.custo : null);
  const resumo = notas.length
    ? `<div class="fm-mm" style="margin-top:8px">Soma das ${notas.length} nota(s): <strong>${esc(dinheiro(conf.soma))}</strong>${m.status === 'concluida' && m.custo != null ? ` · Custo final: <strong>${esc(dinheiro(m.custo))}</strong>` : ''}</div>${conf.situacao === 'acima' ? '<div class="fm-aviso" style="border-color:rgba(239,68,68,.4);background:rgba(239,68,68,.1);color:#fecaca">A soma das notas passa do custo final: o envio é recusado até acertar.</div>' : conf.situacao === 'abaixo' ? `<div class="fm-mm">O custo final é ${esc(dinheiro(conf.diferenca))} maior que as notas (valor sem nota, por exemplo).</div>` : ''}`
    : '<div class="fm-mm">Nenhuma nota ainda: use os ícones de nota fiscal e de comprovante na linha dos campos (o que faltar pode ser anexado depois, na própria nota).</div>';
  const semLancar = notas.filter((n) => !n.enviada_em).length;
  const semFinanceiro = notas.filter((n) => !n.pagamento_id).length;
  // Dois envios independentes: lançamento da NF (painel de Notas Fiscais) e Financeiro (pagar). Só com a manutenção concluída.
  const botoes = m.status === 'concluida' && notas.length && (semLancar || semFinanceiro)
    ? `<div class="fm-acoes" style="justify-content:flex-start">${semLancar ? '<button class="fm-btn primary" type="button" data-acao="notas-enviar" title="Todas as NFs e comprovantes já estão anexados: manda as NFs para o painel de Notas Fiscais lançar no GRM">Enviar para lançamento</button>' : ''}${semFinanceiro ? '<button class="fm-btn soft" type="button" data-acao="notas-financeiro" title="Entra na lista do Financeiro para pagar (PIX, boleto ou link)">Enviar ao Financeiro</button>' : ''}</div>`
    : '';
  const enviar = botoes || (m.status === 'em_execucao' && notas.length ? '<div class="fm-mm" style="margin-top:6px">As notas são enviadas para lançamento e ao Financeiro quando a manutenção for concluída.</div>' : '');
  if (!notas.length && m.status === 'em_execucao') return '';
  return `<div class="fm-sec"><h4>Notas fiscais (${notas.length})</h4>
    ${notas.length ? '<div class="fm-nota-cab" style="margin-top:12px"><span>Tipo</span><span>Emitida por</span><span>Nº</span><span>Valor</span><span>Arquivo e situação</span><span></span></div>' : ''}
    <div class="fm-itens">${linhas}</div>${resumo}${enviar}</div>`;
}

// Enviar ao Financeiro: para cada nota ainda fora da lista de pagamentos, a forma no modelo de Compras (PIX com chave, BOLETO com
// link ou arquivo e vencimento, LINK de pagamento). Nota já paga (com comprovante) entra como paga e dispensa os dados.
export function htmlModalFinanceiro(m, notas = [], base = { oficinas: [] }) {
  const pendentes = notas.filter((n) => !n.pagamento_id);
  const linha = (n) => {
    const of = (base.oficinas || []).find((o) => o.id === n.oficina_id);
    const pix = of?.pix_chave || '';
    const paga = !!n.comprovante_url;
    const forma = pix ? 'PIX' : 'BOLETO';
    const radio = (v, rotulo) => `<label class="fm-fin-aba"><input type="radio" name="fin-forma-${esc(n.id)}" value="${v}"${forma === v ? ' checked' : ''}><span>${rotulo}</span></label>`;
    return `<section class="fm-fin-nota" data-fin-nota="${esc(n.id)}" data-fin-paga="${paga ? '1' : '0'}">
      <div class="fm-fin-cab"><strong>${esc(n.fornecedor || '—')}</strong><span class="fm-mm">NF ${esc(n.numero || 's/nº')} · ${esc(dinheiro(n.valor))}${n.anexo_url ? '' : ' · sem NF anexada'}</span>${paga ? '<span class="fm-badge green">Já paga (comprovante anexado)</span>' : ''}</div>
      <div class="fm-fin-abas" role="radiogroup" aria-label="Forma de pagamento">${radio('PIX', 'PIX')}${radio('BOLETO', 'Boleto')}${radio('LINK', 'Link')}</div>
      <div class="fm-fin-campos">
        <label data-fin-campo="PIX">Chave PIX<input class="fm-input" data-fin-dado="PIX" placeholder="Informe a chave PIX" value="${esc(pix)}"></label>
        <label data-fin-campo="BOLETO">Boleto / URL<input class="fm-input" data-fin-dado="BOLETO" placeholder="Cole o link do boleto ou anexe ao lado"></label>
        <label data-fin-campo="BOLETO">Arquivo do boleto<input class="fm-input" type="file" accept=".pdf,.png,.jpg,.jpeg,.webp" data-fin-arquivo></label>
        <label data-fin-campo="BOLETO">Vencimento<input class="fm-input" type="date" data-fin-venc></label>
        <label data-fin-campo="LINK">Link de pagamento<input class="fm-input" data-fin-dado="LINK" placeholder="Link para o Financeiro pagar"></label>
        <label>Contato (opcional)<input class="fm-input" data-fin-contato placeholder="Telefone, WhatsApp ou e-mail do fornecedor" maxlength="160"></label>
      </div></section>`;
  };
  return `<div class="fm-orc-cab"><div class="fm-mod-head"><div><h3>Enviar ao Financeiro</h3><p>${esc(codigoManutencao(m))} · ${esc(m.__placa || '')}${m.__modelo ? ` · ${esc(m.__modelo)}` : ''}</p></div><button class="fm-x" type="button" data-acao="fin-cancelar" aria-label="Fechar">✕</button></div></div>
    <div class="fm-nova-corpo"><p class="fm-mm">A nota entra na lista do Financeiro para pagar. Informe como pagar cada uma.</p>${pendentes.map(linha).join('') || '<div class="fm-mm">Todas as notas já estão no Financeiro.</div>'}</div>
    <div class="fm-nova-rodape"><div class="fm-nova-info"><div data-erros></div></div><div class="fm-nova-acoes"><button class="fm-btn ghost" type="button" data-acao="fin-cancelar">Cancelar</button><button class="fm-btn primary" type="button" data-acao="fin-confirmar"${pendentes.length ? '' : ' disabled'}>Enviar ao Financeiro</button></div></div>`;
}
