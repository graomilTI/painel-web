// Frotas · Manutenção › Preventiva: editor de notas fiscais usado no registro (passo 3) e em "Pagamento e NF" de um
// registro já salvo. Mantém as notas novas em memória (com os arquivos) até o salvar; quem chama grava, anexa e envia.
// O HTML da linha de entrada vem de htmlEntradaNotaManual (data-nota-entrada, data-nt, data-nt-arquivo, data-nt-comprovante).
import { dataBR, esc } from '../core/ui.js';
import { TIPOS_NOTA, numeroOuNulo, somaNotas, validarNota } from './frotas-manutencao-regras.js?v=20261029-frotas-manut79';

const dinheiro = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

// ov: elemento do modal (precisa de [data-nota-entrada] e [data-notas-lista]).
export function criarEditorNotas(ov, { oficinas = [], aoMudar = () => {}, mostrarErros = () => {} } = {}) {
  const notas = [];

  function renderizar() {
    ov.querySelector('[data-notas-lista]').innerHTML = notas.map((n, i) => `<div class="fm-nota-linha fm-nota-item">
        <div class="fm-ro">${esc((TIPOS_NOTA.find((t) => t.id === n.tipo) || {}).label || n.tipo)}</div>
        <div class="fm-ro">${esc(n.fornecedor || '—')}</div><div class="fm-ro">${esc(n.numero || '—')}</div><div class="fm-ro">${esc(dinheiro(n.valor))}</div>
        <div class="fm-ro">${n.arquivo ? esc(n.arquivo.name) : '<em>Sem NF ainda (pendente)</em>'}${n.comprovante ? `<small>Comprovante: ${esc(n.comprovante.name)}${n.pago_em ? ` (${esc(dataBR(n.pago_em))})` : ''}</small>` : '<small>Sem comprovante: o Financeiro vai pagar</small>'}</div>
        <button class="fm-ic danger" type="button" data-acao="nota-remover" data-idx="${i}" title="Remover nota" aria-label="Remover nota">✕</button></div>`).join('')
      + (notas.length ? `<div class="fm-mm" style="margin-top:8px">Soma das ${notas.length} nota(s) nova(s): <strong>${esc(dinheiro(somaNotas(notas)))}</strong></div>` : '');
    aoMudar();
  }

  // Trata os cliques de "+" e "✕" da lista; devolve true quando o clique era dele.
  function tratarClique(a) {
    if (a.dataset.acao === 'nota-remover' && a.dataset.idx != null) { notas.splice(Number(a.dataset.idx), 1); renderizar(); return true; }
    if (a.dataset.acao !== 'nota-add') return false;
    const f = ov.querySelector('[data-nota-entrada]');
    const nt = (k) => (f.querySelector(`[data-nt="${k}"]`)?.value || '').trim();
    const arquivo = f.querySelector('[data-nt-arquivo]')?.files?.[0] || null;
    const valor = numeroOuNulo(nt('valor'));
    const comprovante = f.querySelector('[data-nt-comprovante]')?.files?.[0] || null;
    const erros = validarNota({ valor, fornecedor: nt('fornecedor'), arquivo, comprovante });
    mostrarErros(erros); if (erros.length) return true;
    const oficina = oficinas.find((o) => String(o.nome || '').trim().toLowerCase() === nt('fornecedor').toLowerCase());
    notas.push({ tipo: nt('tipo') || 'servico', fornecedor: nt('fornecedor'), oficina_id: oficina?.id || null, numero: nt('numero') || null, valor, arquivo, comprovante, pago_em: comprovante ? nt('pago_em') : '' });
    ['fornecedor', 'numero', 'valor', 'pago_em'].forEach((k) => { const el = f.querySelector(`[data-nt="${k}"]`); if (el) el.value = ''; });
    f.querySelector('[data-nt-arquivo]').value = ''; f.querySelector('[data-nt-comprovante]').value = '';
    renderizar();
    return true;
  }

  return { notas, renderizar, tratarClique };
}
