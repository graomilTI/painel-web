// Financeiro — modal único no padrão do Frotas (.fm-modal). Substitui os 4 modais montados à mão (.fin-pay-modal) de
// Pagamentos e Adiantamentos. O contrato dos chamadores não muda: o elemento é criado uma vez por id, abre com a classe
// `open` e fecha com classList.remove('open'). Ao editar, troque o token ?v= em TODOS os imports internos
// (ver tests/financeiro-modulos-versao.test.mjs).
import { esc } from './util.js?v=20261030-fin20';

export function obterModal(id) {
  let modal = document.getElementById(id);
  if (!modal) {
    modal = document.createElement('div');
    modal.id = id;
    modal.className = 'fm-modal-backdrop fin-modal';
    document.body.appendChild(modal);
  }
  return modal;
}

// Cartão do modal: cabeçalho (título, subtítulo, Fechar), corpo e rodapé de ações. `rodape` é HTML (botões + feedback).
export function htmlModal({ titulo, subtitulo = '', idFechar, corpo = '', rodape = '' }) {
  return `<div class="fm-modal" role="dialog" aria-modal="true" aria-label="${esc(titulo)}">
    <div class="fm-modal-head">
      <div><h3>${esc(titulo)}</h3>${subtitulo ? `<p>${esc(subtitulo)}</p>` : ''}</div>
      <button class="fm-btn ghost" id="${idFechar}" type="button">Fechar</button>
    </div>
    <div class="fm-modal-body">${corpo}</div>
    ${rodape ? `<div class="fm-modal-foot">${rodape}</div>` : ''}
  </div>`;
}

// Mostra o modal; Fechar e clique fora fecham. Devolve o próprio elemento.
export function abrirModal(modal, idFechar) {
  modal.classList.add('open');
  const fechar = () => modal.classList.remove('open');
  modal.querySelector(`#${idFechar}`).onclick = fechar;
  modal.onclick = (event) => { if (event.target === modal) fechar(); };
  return modal;
}
