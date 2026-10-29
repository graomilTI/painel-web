// assets/js/modules/notas-fiscais/components/icones.js
// Ícones (traço 24x24) das ações da tabela de NFs; o estilo vem de .ds-icon-btn.

const TRACOS = {
  consultar: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  editar: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z"/>',
  nf: '<path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8z"/><path d="M14 3v5h5"/><path d="M12 11v6"/><path d="M9.5 14.5L12 17l2.5-2.5"/>',
  anexo: '<path d="M21 11.5l-8.6 8.6a5 5 0 01-7.1-7.1l8.6-8.6a3.3 3.3 0 014.7 4.7l-8.6 8.6a1.7 1.7 0 01-2.4-2.4l7.9-7.9"/>',
  comprovante: '<path d="M5 3h14v18l-2.5-1.7L14 21l-2-1.7L10 21l-2.5-1.7L5 21z"/><path d="M9 8h6"/><path d="M9 12h6"/>',
  enviar: '<path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4z"/>',
  relancar: '<path d="M3 12a9 9 0 0115.5-6.2L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 01-15.5 6.2L3 16"/><path d="M3 21v-5h5"/>',
  lancado: '<path d="M20 6L9 17l-5-5"/>',
  fornecedor: '<path d="M3 21h18"/><path d="M5 21V7l7-4 7 4v14"/><path d="M9 21v-4h6v4"/><path d="M12 9v4"/><path d="M10 11h4"/>',
  estornar: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 010 11H11"/>',
};

export function icone(nome) {
  return `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${TRACOS[nome] || ''}</svg>`;
}
