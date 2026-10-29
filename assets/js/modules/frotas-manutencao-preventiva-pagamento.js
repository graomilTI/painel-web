// Frotas · Manutenção › Preventiva › "Pagamento e NF" de um registro já salvo: define quem paga e o custo, anexa as notas
// (NF/NFS-e + comprovante opcional) e envia ao GRM e ao Financeiro. Serve para quem salvou a preventiva sem pagamento.
// Regras do banco: custo e notas enviadas ficam travados depois do primeiro envio; a soma das notas não passa do custo.
import { closeModal, confirmar, dataBR, esc, openModal, toast } from '../core/ui.js';
import * as dados from './frotas-manutencao-dados.js?v=20261029-frotas-inst85';
import { RESPONSAVEIS, TIPOS_NOTA, codigoManutencao, numeroOuNulo, somaNotas } from './frotas-manutencao-regras.js?v=20261029-frotas-inst85';
import { htmlEntradaNotaManual } from './frotas-manutencao-html.js?v=20261029-frotas-inst85';
import { criarEditorNotas } from './frotas-manutencao-preventiva-notas.js?v=20261029-frotas-inst85';
import { hojeBrasilISO, pendenciasDoRegistro, registroComPendencias, validarPasso3 } from './frotas-manutencao-preventiva-regras.js?v=20261029-frotas-inst85';

const MODAL = 'fmPreventivaPagamento';
const dinheiro = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const NF_TXT = { LANCADO: ['Lançada no GRM', 'green'], ERRO: ['Erro no GRM', 'red'], AGUARDANDO_DADOS: ['Faltam dados', 'red'], AGUARDANDO_CLASSIFICACAO: ['Falta classificar', 'red'], DUPLICADO: ['Duplicada', 'red'] };
const PG_TXT = { PAGO: ['Paga', 'green'], PENDENTE: ['Aguardando o Financeiro', 'amber'], RECUSADO: ['Recusado', 'red'], CANCELADO: ['Cancelado', 'red'] };

// registro: item de carregarRegistrosPreventivos; placa: do veículo; aoConcluir: recarrega a tela de quem chamou.
export async function abrirPagamento({ supabase, registro, placa, aoConcluir = async () => {} }) {
  const [{ manutencao: m, notas: salvasIni }, oficinas, fin] = await Promise.all([
    dados.carregarUma(supabase, registro.id),
    dados.carregarOficinas(supabase).catch(() => []),
    dados.statusNfFinanceiro(supabase, registro.id).catch(() => null),
  ]);
  let salvas = salvasIni;
  let statusPorNota = new Map(((fin && fin.notas) || []).map((x) => [x.nota_id, x]));
  let manut = m;
  const travado = salvas.some((n) => n.pagamento_id); // já virou pagamento: custo e quem paga não mudam mais

  const ov = openModal({
    id: MODAL,
    conteudoHtml: `<div class="fm-mod-head"><div><h3>Pagamento e NF · ${esc(codigoManutencao(m))} · ${esc(placa)}</h3><p>${esc(m.descricao || '')}${m.data_execucao ? ` · ${esc(dataBR(m.data_execucao))}` : ''}</p></div><button class="fm-x" type="button" data-acao="fechar" aria-label="Fechar">✕</button></div>
      <div class="fm-form" style="grid-template-columns:repeat(2,minmax(0,1fr))">
        <div class="fm-field"><label>Quem paga</label><select class="fm-select" data-r="responsavel"${travado ? ' disabled' : ''}><option value="">Selecione...</option>${RESPONSAVEIS.map((r) => `<option value="${r.id}"${r.id === m.responsavel_pagamento ? ' selected' : ''}>${esc(r.label)}</option>`).join('')}</select></div>
        <div class="fm-field"><label>Custo total (R$)</label><input class="fm-input" type="number" min="0" step="0.01" data-r="custo" data-auto="${Number(m.custo) > 0 ? '0' : '1'}" value="${Number(m.custo) > 0 ? esc(m.custo) : ''}"${travado ? ' disabled' : ''}><small data-custo-dica></small></div></div>
      <div class="fm-faltas-topo" data-faltas></div>
      ${travado ? '<div class="fm-aviso">Já há nota enviada ao Financeiro: o custo e quem paga não mudam mais aqui. Dá para anexar notas novas, desde que a soma não passe do custo.</div>' : ''}
      <div class="fm-sec"><h4>Notas já cadastradas (${salvas.length})</h4><div data-salvas></div></div>
      <div class="fm-sec"><h4>Adicionar nota</h4>
        <div class="fm-mm" style="margin-bottom:8px">Anexe a NF ou NFS-e e, se já foi pago, o comprovante: com comprovante o pagamento entra no Financeiro já como pago; a NF vai para o lançamento no GRM.</div>
        <div class="fm-nota-cab"><span>Tipo</span><span>Emitida por</span><span>Nº</span><span>Valor</span><span>Arquivo da NF</span><span></span></div>
        ${htmlEntradaNotaManual({ oficinas })}
        <div class="fm-itens" style="margin-top:10px" data-notas-lista></div></div>
      <label class="fm-check" data-enviar-linha style="display:none;margin-top:8px"><input type="checkbox" data-r="enviar" checked> Enviar as notas pendentes ao GRM e ao Financeiro ao salvar</label>
      <div data-erros></div>
      <div class="fm-acoes"><button class="fm-btn ghost" type="button" data-acao="dispensar" title="Nunca vai haver NF ou comprovante: deixa de aparecer como pendente" style="margin-right:auto">Dispensar pendências</button><button class="fm-btn ghost" type="button" data-acao="fechar">Fechar</button><button class="fm-btn primary" type="button" data-acao="salvar">Salvar</button></div>`,
  });
  ov.classList.add('fm-mod');
  const campo = (n) => ov.querySelector(`[data-r="${n}"]`);
  const mostrarErros = (lista) => {
    ov.querySelector('[data-erros]').innerHTML = lista.length ? `<ul class="fm-erros">${lista.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : '';
  };
  const editor = criarEditorNotas(ov, { oficinas, aoMudar: () => atualizarCampos(), mostrarErros });
  const novas = editor.notas;
  const pendentesSalvas = () => salvas.filter((n) => !n.enviada_em && n.anexo_url).length; // só as que já têm a NF vão ao GRM
  const somaTudo = () => somaNotas(salvas) + somaNotas(novas);

  function atualizarCampos() {
    const custo = campo('custo');
    if (custo.dataset.auto === '1' && !travado) custo.value = somaTudo() > 0 ? somaTudo() : '';
    ov.querySelector('[data-custo-dica]').textContent = somaTudo() > 0 ? `Soma das notas: ${dinheiro(somaTudo())}.` : 'Sem notas: informe só se quiser contar o custo.';
    ov.querySelector('[data-enviar-linha]').style.display = campo('responsavel').value === 'empresa' && (novas.length || pendentesSalvas()) ? '' : 'none';
  }

  function renderFaltas() {
    const sit = pendenciasDoRegistro(registroComPendencias(manut, salvas));
    ov.querySelector('[data-faltas]').innerHTML = sit.itens.length
      ? `<span class="fm-mm">O que falta:</span> ${sit.itens.map((x) => `<span class="fm-badge amber">${esc(x.texto)}</span>`).join('')}`
      : `<span class="fm-badge ${sit.tom}">${esc(sit.texto)}</span>`;
    ov.querySelector('[data-acao="dispensar"]').hidden = !!manut.pendencia_dispensada_em || sit.id === 'completo' || sit.id === 'outro';
  }

  // Recarrega as notas e a situação depois de anexar algo (NF ou comprovante que chegou depois).
  async function recarregar() {
    const [r, f] = await Promise.all([dados.carregarUma(supabase, m.id), dados.statusNfFinanceiro(supabase, m.id).catch(() => null)]);
    salvas = r.notas; manut = r.manutencao || manut;
    statusPorNota = new Map(((f && f.notas) || []).map((x) => [x.nota_id, x]));
    renderSalvas(); await aoConcluir();
  }

  async function anexarDepois(notaId, tipo, arquivo, dataPagamento) {
    const nota = salvas.find((n) => n.id === notaId); if (!nota || !arquivo) return;
    try {
      mostrarErros([]);
      if (tipo === 'nf') {
        const url = await dados.enviarAnexo(supabase, m.id, 'nf', arquivo);
        await dados.atualizarNota(supabase, notaId, { anexo_url: url });
      } else {
        const url = await dados.enviarAnexo(supabase, m.id, 'comprovante', arquivo);
        const pagoEm = dados.dataPagamentoISO(dataPagamento) || new Date().toISOString();
        if (nota.enviada_em) await dados.comprovanteTardio(supabase, notaId, url, pagoEm);
        else await dados.atualizarNota(supabase, notaId, { comprovante_url: url, pago_em: pagoEm });
      }
      await recarregar();
      toast(tipo === 'nf' ? 'NF anexada.' : nota.enviada_em ? 'Comprovante anexado e pagamento baixado no Financeiro.' : 'Comprovante anexado.');
    } catch (err) { mostrarErros([err.message || 'Erro ao anexar o arquivo.']); }
  }

  function renderSalvas() {
    ov.querySelector('[data-salvas]').innerHTML = salvas.length ? salvas.map((n) => {
      const st = statusPorNota.get(n.id);
      const nf = st?.nf ? (NF_TXT[st.nf.status] || ['Na fila do GRM', 'amber']) : null;
      const pg = st?.pagamento ? (PG_TXT[st.pagamento.status] || [st.pagamento.status, 'blue']) : null;
      const situacao = !n.enviada_em ? '<span class="fm-badge">Não enviada</span>'
        : `${nf ? `<span class="fm-badge ${nf[1]}">${esc(nf[0])}</span> ` : ''}${pg ? `<span class="fm-badge ${pg[1]}">${esc(pg[0])}</span>` : '<span class="fm-badge amber">Enviada</span>'}`;
      return `<div class="fm-nota-linha fm-nota-item">
        <div class="fm-ro">${esc((TIPOS_NOTA.find((t) => t.id === n.tipo) || {}).label || n.tipo)}</div>
        <div class="fm-ro">${esc(n.fornecedor || '—')}</div><div class="fm-ro">${esc(n.numero || '—')}</div><div class="fm-ro">${esc(dinheiro(n.valor))}</div>
        <div class="fm-ro">${n.anexo_url ? `<a href="${esc(n.anexo_url)}" target="_blank" rel="noopener" style="color:#86efac">Ver arquivo</a>` : '—'}${n.comprovante_url ? ` · <a href="${esc(n.comprovante_url)}" target="_blank" rel="noopener" style="color:#86efac">Comprovante</a>` : ''}<small>${situacao}</small></div>
        ${n.enviada_em ? '<span></span>' : `<button class="fm-ic danger" type="button" data-acao="salva-remover" data-id="${esc(n.id)}" title="Remover nota" aria-label="Remover nota">✕</button>`}
        ${(!n.anexo_url || (!n.comprovante_url && !n.pago_em)) ? `<div class="fm-nota-pago">${!n.anexo_url ? `<span class="fm-badge amber">Falta NF/NFS-e</span><label class="fm-anexar">Anexar NF<input class="fm-input" type="file" accept=".pdf,.xml,.jpg,.jpeg,.png" data-anexar-nf="${esc(n.id)}"></label>` : ''}${(!n.comprovante_url && !n.pago_em) ? `<span class="fm-badge amber">Falta comprovante</span><label class="fm-anexar">Pago em <input class="fm-input" type="date" data-anexar-data="${esc(n.id)}" value="${hojeBrasilISO()}" max="${hojeBrasilISO()}"></label><label class="fm-anexar">Anexar comprovante<input class="fm-input" type="file" accept=".pdf,.jpg,.jpeg,.png" data-anexar-comp="${esc(n.id)}"></label>` : ''}</div>` : ''}</div>`;
    }).join('') : '<div class="fm-mm">Nenhuma nota cadastrada ainda. Adicione abaixo o que já tiver (NF/NFS-e e/ou comprovante).</div>';
    renderFaltas(); atualizarCampos();
  }

  async function salvar() {
    const resp = campo('responsavel').value;
    const custoTxt = numeroOuNulo(campo('custo').value);
    const totalNotas = [...salvas, ...novas];
    const custo = custoTxt ?? (somaTudo() > 0 ? somaTudo() : 0);
    const erros = validarPasso3({ notas: totalNotas, custo, responsavel: resp });
    mostrarErros(erros); if (erros.length) return;
    const botao = ov.querySelector('[data-acao="salvar"]'); botao.disabled = true;
    const avisos = [];
    try {
      if (!travado && (Number(custo) !== Number(m.custo || 0) || (resp || null) !== (m.responsavel_pagamento || null))) {
        botao.textContent = 'Salvando...';
        await dados.atualizarManutencao(supabase, m.id, { custo, responsavel_pagamento: resp || null });
      }
    } catch (err) { mostrarErros([err.message || 'Erro ao salvar o custo.']); botao.disabled = false; botao.textContent = 'Salvar'; return; }
    let anexadas = 0;
    for (const n of novas) {
      try {
        botao.textContent = `Anexando nota ${anexadas + 1} de ${novas.length}...`;
        const anexo = n.arquivo ? await dados.enviarAnexo(supabase, m.id, 'nf', n.arquivo) : null;
        const urlComprovante = n.comprovante ? await dados.enviarAnexo(supabase, m.id, 'comprovante', n.comprovante) : null;
        await dados.salvarNota(supabase, {
          manutencao_id: m.id, tipo: n.tipo, fornecedor: n.fornecedor, oficina_id: n.oficina_id, numero: n.numero, valor: n.valor, anexo_url: anexo,
          comprovante_url: urlComprovante, pago_em: urlComprovante ? dados.dataPagamentoISO(n.pago_em) : null,
        });
        anexadas += 1;
      } catch (err) { avisos.push(`Nota ${n.numero || n.fornecedor}: ${err.message || 'não foi anexada'}.`); }
    }
    const enviar = resp === 'empresa' && campo('enviar').checked && (anexadas > 0 || pendentesSalvas() > 0);
    if (enviar) {
      try { botao.textContent = 'Enviando ao GRM e ao Financeiro...'; await dados.enviarNfFinanceiro(supabase, m.id); }
      catch (err) { avisos.push(`Envio ao GRM e ao Financeiro: ${err.message || 'não foi enviado'}.`); }
    }
    await aoConcluir();
    if (avisos.length) {
      mostrarErros([`Salvo, mas falta completar: ${avisos.join(' ')}`]);
      botao.textContent = 'Salvar'; botao.disabled = false;
      return;
    }
    closeModal(MODAL);
    toast(`Pagamento de ${codigoManutencao(m)} atualizado${enviar ? ' e enviado ao GRM e ao Financeiro' : ''}.`);
  }

  ov.addEventListener('input', (e) => { if (e.target.matches('[data-r="custo"]')) e.target.dataset.auto = e.target.value ? '0' : '1'; });
  ov.addEventListener('change', (e) => {
    const t = e.target;
    if (t.matches('[data-r="responsavel"]')) atualizarCampos();
    if (t.matches('[data-anexar-nf]') && t.files?.[0]) anexarDepois(t.dataset.anexarNf, 'nf', t.files[0]);
    if (t.matches('[data-anexar-comp]') && t.files?.[0]) anexarDepois(t.dataset.anexarComp, 'comprovante', t.files[0], ov.querySelector(`[data-anexar-data="${t.dataset.anexarComp}"]`)?.value);
  });
  ov.addEventListener('click', async (e) => {
    const a = e.target.closest('[data-acao]'); if (!a) return;
    if (a.dataset.acao === 'fechar') return closeModal(MODAL);
    if (a.dataset.acao === 'salvar') return salvar();
    if (a.dataset.acao === 'dispensar') {
      if (!(await confirmar({ titulo: 'Dispensar pendências', mensagem: 'Marca esta preventiva como sem pendência de NF e comprovante (não vai haver documento). Ela deixa de aparecer como pendente.', confirmarLabel: 'Dispensar' }))) return;
      try { await dados.dispensarPendencias(supabase, m.id); await aoConcluir(); closeModal(MODAL); toast('Pendências dispensadas.'); }
      catch (err) { mostrarErros([err.message || 'Erro ao dispensar as pendências.']); }
      return;
    }
    if (a.dataset.acao === 'salva-remover') {
      if (!(await confirmar({ titulo: 'Remover nota', mensagem: 'Remover esta nota fiscal do registro?', confirmarLabel: 'Remover' }))) return;
      try { await dados.removerNota(supabase, a.dataset.id); salvas = salvas.filter((n) => n.id !== a.dataset.id); renderSalvas(); }
      catch (err) { mostrarErros([err.message || 'Erro ao remover a nota.']); }
      return;
    }
    editor.tratarClique(a);
  });

  renderSalvas(); editor.renderizar();
}
